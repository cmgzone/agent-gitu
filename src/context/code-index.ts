import { readdirSync, readFileSync, statSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { FileRole } from '../types.js';
import { ensureHermesHome } from '../workspace/home.js';
import { classifyRole, isContextConfigDotfile, tokenize } from './context-engine.js';

const MAX_INDEXED_FILE_BYTES = 200 * 1024;
const MAX_WALK_DEPTH = 8;
const MAX_INDEXED_FILES = 2000;

export interface IndexedFile {
  path: string;
  role: FileRole;
  size: number;
  mtimeMs: number;
}

export interface RefreshStats {
  scanned: number;
  added: number;
  updated: number;
  removed: number;
}

export function defaultIndexPath(): string {
  return path.join(ensureHermesHome().cache, 'code-index.db');
}

/**
 * Persistent inverted index of a repository, backed by SQLite.
 *
 * File metadata lives in `files`, and token -> file term counts in `terms`, so
 * content matching and ranking are instant on later runs: `refresh()` only
 * re-tokenizes files whose size or mtime changed, and it prunes deleted files.
 * The DB lives in the app cache dir and can hold many repos at once.
 */
export class CodeIndex {
  private readonly db: DatabaseSync;
  private readonly root: string;
  private readonly repo: string;
  private ignores = new Set<string>();
  private watcher?: FSWatcher;
  private sweepTimer?: NodeJS.Timeout;
  private debounceTimer?: NodeJS.Timeout;
  private watching = false;

  constructor(repoRoot: string, dbPath: string = defaultIndexPath()) {
    this.root = path.resolve(repoRoot);
    this.repo = this.root.replace(/\\/g, '/').replace(/\/+$/, '');
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        repo TEXT NOT NULL,
        path TEXT NOT NULL,
        role TEXT NOT NULL,
        size INTEGER NOT NULL,
        mtime_ms INTEGER NOT NULL,
        PRIMARY KEY (repo, path)
      );
      CREATE TABLE IF NOT EXISTS terms (
        repo TEXT NOT NULL,
        term TEXT NOT NULL,
        path TEXT NOT NULL,
        count INTEGER NOT NULL,
        PRIMARY KEY (repo, term, path)
      );
      CREATE INDEX IF NOT EXISTS idx_files_repo ON files(repo);
    `);
    this.pruneOrphans();
  }

  /** Drop rows for repos whose directory no longer exists (deleted projects, dead temp dirs). */
  private pruneOrphans(): void {
    const repos = this.db
      .prepare('SELECT DISTINCT repo FROM files')
      .all() as { repo: string }[];
    for (const { repo } of repos) {
      let exists = false;
      try {
        exists = statSync(repo).isDirectory();
      } catch {
        exists = false;
      }
      if (exists) continue;
      this.db.prepare('DELETE FROM terms WHERE repo = ?').run(repo);
      this.db.prepare('DELETE FROM files WHERE repo = ?').run(repo);
    }
  }

  /**
   * Walk the repo, tokenize new/changed files, and prune deleted ones.
   * Mirrors the ContextEngine walker's rules (ignores, safe dotfiles, size cap,
   * depth cap, artifact/unknown roles skipped).
   */
  refresh(root: string, ignores: Iterable<string>): RefreshStats {
    this.ignores = new Set(ignores);
    const ignoreSet = this.ignores;
    const walked: { rel: string; role: FileRole; size: number; mtimeMs: number }[] = [];

    const walk = (dir: string, depth: number): void => {
      if (depth > MAX_WALK_DEPTH || walked.length > MAX_INDEXED_FILES) return;
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const name of entries) {
        // Keep private VCS/agent state out even for callers that do not pass
        // ProjectGuard's default ignores. Other dotfiles are considered below:
        // config dotfiles such as .eslintrc are useful context, while unknown
        // dotfiles (including .env) classify as unknown and are never read.
        if (ignoreSet.has(name) || name === '.git' || name === '.hermes' || (name.startsWith('.') && name !== '.github' && !isContextConfigDotfile(name))) continue;
        const full = path.join(dir, name);
        let st;
        try {
          st = statSync(full);
        } catch {
          continue;
        }
        if (st.isDirectory()) {
          // Do not traverse arbitrary hidden directories, which can contain
          // local credentials. GitHub workflow files are project config and
          // are the one useful exception.
          if (name.startsWith('.') && name !== '.github') continue;
          walk(full, depth + 1);
        } else if (st.size < MAX_INDEXED_FILE_BYTES) {
          const rel = path.relative(root, full).replace(/\\/g, '/');
          const role = classifyRole(rel);
          if (role === 'artifact' || role === 'unknown') continue;
          walked.push({ rel, role, size: st.size, mtimeMs: st.mtimeMs });
        }
      }
    };
    walk(root, 0);

    const existing = new Map<string, { size: number; mtimeMs: number }>();
    const rows = this.db
      .prepare('SELECT path, size, mtime_ms FROM files WHERE repo = ?')
      .all(this.repo) as { path: string; size: number; mtime_ms: number }[];
    for (const r of rows) existing.set(r.path, { size: r.size, mtimeMs: r.mtime_ms });

    const stats: RefreshStats = { scanned: walked.length, added: 0, updated: 0, removed: 0 };
    const seen = new Set(walked.map((f) => f.rel));

    const upsertFile = this.db.prepare(
      'INSERT OR REPLACE INTO files (repo, path, role, size, mtime_ms) VALUES (?, ?, ?, ?, ?)',
    );
    const deleteTerms = this.db.prepare('DELETE FROM terms WHERE repo = ? AND path = ?');
    const insertTerm = this.db.prepare(
      'INSERT OR REPLACE INTO terms (repo, term, path, count) VALUES (?, ?, ?, ?)',
    );
    const deleteFile = this.db.prepare('DELETE FROM files WHERE repo = ? AND path = ?');

    this.db.exec('BEGIN');
    try {
      for (const f of walked) {
        const prev = existing.get(f.rel);
        if (prev && prev.size === f.size && prev.mtimeMs === f.mtimeMs) continue;

        const counts = new Map<string, number>();
        try {
          for (const t of tokenize(readFileSync(path.join(root, f.rel), 'utf8'))) {
            counts.set(t, (counts.get(t) ?? 0) + 1);
          }
        } catch {
          /* unreadable file -> index as empty */
        }
        deleteTerms.run(this.repo, f.rel);
        for (const [term, count] of counts) insertTerm.run(this.repo, term, f.rel, count);
        upsertFile.run(this.repo, f.rel, f.role, f.size, f.mtimeMs);
        if (prev) stats.updated += 1;
        else stats.added += 1;
      }

      for (const stale of existing.keys()) {
        if (seen.has(stale)) continue;
        deleteTerms.run(this.repo, stale);
        deleteFile.run(this.repo, stale);
        stats.removed += 1;
      }

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    return stats;
  }

  /** All indexed files for this repo (path, role, size, mtime). */
  fileList(): IndexedFile[] {
    const rows = this.db
      .prepare('SELECT path, role, size, mtime_ms FROM files WHERE repo = ?')
      .all(this.repo) as { path: string; role: string; size: number; mtime_ms: number }[];
    return rows.map((r) => ({ path: r.path, role: r.role as FileRole, size: r.size, mtimeMs: r.mtime_ms }));
  }

  /**
   * For each file, the set of goal terms that appear in its content.
   * Used to add content awareness to path-based ranking.
   */
  contentMatches(goalTokens: Iterable<string>): Map<string, Set<string>> {
    const terms = [...goalTokens];
    const out = new Map<string, Set<string>>();
    if (terms.length === 0) return out;
    const placeholders = terms.map(() => '?').join(', ');
    const rows = this.db
      .prepare(`SELECT term, path FROM terms WHERE repo = ? AND term IN (${placeholders})`)
      .all(this.repo, ...terms) as { term: string; path: string }[];
    for (const row of rows) {
      let set = out.get(row.path);
      if (!set) {
        set = new Set();
        out.set(row.path, set);
      }
      set.add(row.term);
    }
    return out;
  }

  stats(): { files: number; terms: number } {
    const f = this.db.prepare('SELECT COUNT(*) AS n FROM files WHERE repo = ?').get(this.repo) as { n: number };
    const t = this.db.prepare('SELECT COUNT(*) AS n FROM terms WHERE repo = ?').get(this.repo) as { n: number };
    return { files: f.n, terms: t.n };
  }

  /**
   * Keep the index fresh in the background: builds immediately, then refreshes
   * on filesystem events (debounced) plus a periodic safety sweep. Falls back
   * to sweep-only on platforms without recursive fs.watch support.
   */
  startWatch(ignores?: Iterable<string>, opts: { debounceMs?: number; sweepMs?: number } = {}): void {
    if (this.watching) return;
    this.watching = true;
    if (ignores) this.ignores = new Set(ignores);
    const debounceMs = opts.debounceMs ?? 500;
    const sweepMs = opts.sweepMs ?? 30_000;

    try {
      this.refresh(this.root, this.ignores);
    } catch {
      /* best effort */
    }
    try {
      this.watcher = watch(this.root, { recursive: true }, () => this.scheduleRefresh(debounceMs));
      this.watcher.on('error', () => {
        try {
          this.watcher?.close();
        } catch {
          /* ignore */
        }
        this.watcher = undefined;
      });
    } catch {
      this.watcher = undefined; // recursive watch unsupported -> sweep only
    }
    this.sweepTimer = setInterval(() => {
      try {
        this.refresh(this.root, this.ignores);
      } catch {
        /* best effort */
      }
    }, sweepMs);
  }

  private scheduleRefresh(debounceMs: number): void {
    if (this.debounceTimer) return;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      try {
        this.refresh(this.root, this.ignores);
      } catch {
        /* best effort */
      }
    }, debounceMs);
  }

  stopWatch(): void {
    this.watching = false;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = undefined;
    }
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch {
        /* ignore */
      }
      this.watcher = undefined;
    }
  }

  isWatched(): boolean {
    return this.watching;
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      /* already closed */
    }
  }
}
