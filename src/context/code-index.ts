import { readdirSync, readFileSync, statSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { FileRole } from '../types.js';
import { ensureGituHome } from '../workspace/home.js';
import { classifyRole, isContextConfigDotfile, tokenize } from './context-engine.js';
import { EMBED_BATCH, EMBED_MAX_CHARS, cosineSimilarity, decodeVector, type Embedder } from './embeddings.js';

const MAX_INDEXED_FILE_BYTES = 200 * 1024;
const MAX_WALK_DEPTH = 8;
const MAX_INDEXED_FILES = 2000;
/** Bump when tokenize() changes shape so existing indexes rebuild once. */
const TOKENIZER_VERSION = 3;
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.py', '.rs', '.go'];

/** Extract only static, relative module specifiers. Package imports and
 * dynamic expressions are deliberately not treated as repository edges. */
export function localImportSpecifiers(source: string): string[] {
  const specs = new Set<string>();
  const add = (value: string): void => {
    const spec = value.trim();
    if (spec.startsWith('./') || spec.startsWith('../')) specs.add(spec);
  };
  const jsRe = /(?:\b(?:import|export)\s+(?:[^'";]*?\s+from\s+)?|\brequire\s*\(|\bimport\s*\()(['"])([^'"\r\n]+)\1/g;
  for (const match of source.matchAll(jsRe)) add(match[2] ?? '');
  const pyRe = /^\s*from\s+(\.{1,}[A-Za-z0-9_./]*)\s+import\b/gm;
  for (const match of source.matchAll(pyRe)) add(match[1] ?? '');
  return [...specs];
}

/** Resolve a relative import only when it maps to another indexed source. */
export function resolveLocalImport(sourcePath: string, specifier: string, files: Set<string>): string | undefined {
  if (!specifier.startsWith('.')) return undefined;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(sourcePath), specifier));
  if (!base || base === '.' || base === '..' || base.startsWith('../')) return undefined;
  const candidates = new Set<string>([base]);
  if (/\.(?:[cm]?js)$/i.test(base)) candidates.add(base.replace(/\.(?:[cm]?js)$/i, '.ts'));
  for (const ext of SOURCE_EXTENSIONS) {
    candidates.add(`${base}${ext}`);
    candidates.add(`${base}/index${ext}`);
  }
  for (const candidate of candidates) if (files.has(candidate)) return candidate;
  return undefined;
}

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
  return path.join(ensureGituHome().cache, 'code-index.db');
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
  /** True until the stored tokenizer version matches (forces one full rebuild). */
  private rebuildTerms = false;

  constructor(repoRoot: string, dbPath: string = defaultIndexPath()) {
    this.root = path.resolve(repoRoot);
    this.repo = this.root.replace(/\\/g, '/').replace(/\/+$/, '');
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA busy_timeout = 5000;');
    this.db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
    const verRow = this.db.prepare("SELECT value FROM meta WHERE key = 'tokenizer_version'").get() as { value?: string } | undefined;
    this.rebuildTerms = verRow?.value !== String(TOKENIZER_VERSION);
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
      CREATE TABLE IF NOT EXISTS vectors (
        repo TEXT NOT NULL,
        path TEXT NOT NULL,
        model TEXT NOT NULL,
        mtime_ms INTEGER NOT NULL,
        vec BLOB NOT NULL,
        PRIMARY KEY (repo, path)
      );
      CREATE TABLE IF NOT EXISTS imports (
        repo TEXT NOT NULL,
        source TEXT NOT NULL,
        target TEXT NOT NULL,
        PRIMARY KEY (repo, source, target)
      );
      CREATE INDEX IF NOT EXISTS idx_imports_source ON imports(repo, source);
      CREATE INDEX IF NOT EXISTS idx_imports_target ON imports(repo, target);
    `);
    if (this.rebuildTerms) {
      // Clear legacy rows so queries never mix token schemes (after DDL so a
      // fresh database has the tables to clean).
      this.db.prepare('DELETE FROM terms WHERE repo = ?').run(this.repo);
      this.db.prepare('DELETE FROM files WHERE repo = ?').run(this.repo);
      this.db.prepare('DELETE FROM imports WHERE repo = ?').run(this.repo);
    }
    this.pruneOrphans();
  }

  /** Drop rows for repos whose directory no longer exists (deleted projects, dead temp dirs). */
  private pruneOrphans(): void {
    const repos = this.db.prepare('SELECT DISTINCT repo FROM files').all() as { repo: string }[];
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
      this.db.prepare('DELETE FROM vectors WHERE repo = ?').run(repo);
      this.db.prepare('DELETE FROM imports WHERE repo = ?').run(repo);
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
          // Enforce the cap per file: a single huge directory must not be able
          // to blow past MAX_INDEXED_FILES by its entire contents.
          if (walked.length >= MAX_INDEXED_FILES) return;
          const rel = path.relative(root, full).replace(/\\/g, '/');
          const role = classifyRole(rel);
          if (role === 'artifact' || role === 'unknown') continue;
          walked.push({ rel, role, size: st.size, mtimeMs: st.mtimeMs });
        }
      }
    };
    walk(root, 0);

    const existing = new Map<string, { size: number; mtimeMs: number }>();
    const rows = this.db.prepare('SELECT path, size, mtime_ms FROM files WHERE repo = ?').all(this.repo) as { path: string; size: number; mtime_ms: number }[];
    for (const r of rows) existing.set(r.path, { size: r.size, mtimeMs: r.mtime_ms });

    const stats: RefreshStats = { scanned: walked.length, added: 0, updated: 0, removed: 0 };
    const seen = new Set(walked.map((f) => f.rel));

    const upsertFile = this.db.prepare('INSERT OR REPLACE INTO files (repo, path, role, size, mtime_ms) VALUES (?, ?, ?, ?, ?)');
    const deleteTerms = this.db.prepare('DELETE FROM terms WHERE repo = ? AND path = ?');
    const insertTerm = this.db.prepare('INSERT OR REPLACE INTO terms (repo, term, path, count) VALUES (?, ?, ?, ?)');
    const deleteFile = this.db.prepare('DELETE FROM files WHERE repo = ? AND path = ?');
    const deleteVector = this.db.prepare('DELETE FROM vectors WHERE repo = ? AND path = ?');
    const deleteImportsForFile = this.db.prepare('DELETE FROM imports WHERE repo = ? AND (source = ? OR target = ?)');
    const deleteImportsFrom = this.db.prepare('DELETE FROM imports WHERE repo = ? AND source = ?');
    const insertImport = this.db.prepare('INSERT OR REPLACE INTO imports (repo, source, target) VALUES (?, ?, ?)');
    const changedSources = new Map<string, string>();

    this.db.exec('BEGIN');
    try {
      for (const f of walked) {
        const prev = existing.get(f.rel);
        // Tokenizer version changed → the mtime shortcut would leave stale
        // term rows from the old scheme; reindex everything exactly once.
        if (!this.rebuildTerms && prev && prev.size === f.size && prev.mtimeMs === f.mtimeMs) continue;

        const counts = new Map<string, number>();
        let content = '';
        try {
          content = readFileSync(path.join(root, f.rel), 'utf8');
          for (const t of tokenize(content)) {
            counts.set(t, (counts.get(t) ?? 0) + 1);
          }
        } catch {
          /* unreadable file -> index as empty */
        }
        deleteTerms.run(this.repo, f.rel);
        for (const [term, count] of counts) insertTerm.run(this.repo, term, f.rel, count);
        upsertFile.run(this.repo, f.rel, f.role, f.size, f.mtimeMs);
        changedSources.set(f.rel, content);
        if (prev) stats.updated += 1;
        else stats.added += 1;
      }

      for (const stale of existing.keys()) {
        if (seen.has(stale)) continue;
        deleteTerms.run(this.repo, stale);
        deleteFile.run(this.repo, stale);
        deleteVector.run(this.repo, stale);
        deleteImportsForFile.run(this.repo, stale, stale);
        stats.removed += 1;
      }

      // Graph edges are updated after the full current file set is known, so
      // extensionless and TypeScript `.js` imports resolve even when their
      // target was created in this same refresh.
      for (const [source, content] of changedSources) {
        deleteImportsFrom.run(this.repo, source);
        for (const specifier of localImportSpecifiers(content)) {
          const target = resolveLocalImport(source, specifier, seen);
          if (target && target !== source) insertImport.run(this.repo, source, target);
        }
      }

      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
    if (this.rebuildTerms) {
      // Persist the version only after a fully successful rebuild.
      this.db.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
      this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('tokenizer_version', String(TOKENIZER_VERSION));
      this.rebuildTerms = false;
    }
    return stats;
  }

  /** All indexed files for this repo (path, role, size, mtime). */
  fileList(): IndexedFile[] {
    const rows = this.db.prepare('SELECT path, role, size, mtime_ms FROM files WHERE repo = ?').all(this.repo) as { path: string; role: string; size: number; mtime_ms: number }[];
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
    const rows = this.db.prepare(`SELECT term, path FROM terms WHERE repo = ? AND term IN (${placeholders})`).all(this.repo, ...terms) as { term: string; path: string }[];
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

  /**
   * IDF-weighted content recall per file, normalized to 0..1. Rare terms
   * (specific identifiers) count far more than ubiquitous ones like "data",
   * which the raw overlap metric treated identically — drowning relevant
   * files in a sea of generic matches.
   */
  contentMatchScores(goalTokens: Iterable<string>): Map<string, number> {
    const terms = [...new Set(goalTokens)];
    const out = new Map<string, number>();
    if (terms.length === 0) return out;
    const nRow = this.db.prepare('SELECT COUNT(DISTINCT path) AS n FROM terms WHERE repo = ?').get(this.repo) as { n: number };
    const total = Math.max(1, nRow.n);
    // Document frequency for the queried terms (others are unseen → max IDF).
    const ph = terms.map(() => '?').join(', ');
    const dfRows = this.db.prepare(`SELECT term, COUNT(DISTINCT path) AS df FROM terms WHERE repo = ? AND term IN (${ph}) GROUP BY term`).all(this.repo, ...terms) as {
      term: string;
      df: number;
    }[];
    const idf = new Map<string, number>();
    let denom = 0;
    for (const t of terms) {
      const df = dfRows.find((r) => r.term === t)?.df ?? 0;
      const w = Math.log(1 + total / Math.max(1, df));
      idf.set(t, w);
      denom += w;
    }
    if (denom <= 0) return out;
    const rows = this.db.prepare(`SELECT term, path FROM terms WHERE repo = ? AND term IN (${ph})`).all(this.repo, ...terms) as { term: string; path: string }[];
    const weighted = new Map<string, number>();
    for (const row of rows) {
      weighted.set(row.path, (weighted.get(row.path) ?? 0) + (idf.get(row.term) ?? 0));
    }
    for (const [path, sum] of weighted) out.set(path, Math.min(1, sum / denom));
    return out;
  }

  /**
   * Score local source files connected to the given roots in the import graph.
   * Direct callers/callees get the strongest signal and two-hop neighbours a
   * smaller one. The result is a retrieval tie-breaker, never a substitute for
   * lexical relevance.
   */
  dependencyScores(seedPaths: Iterable<string>, maxDepth = 2): Map<string, number> {
    const depthLimit = Math.max(1, Math.min(3, maxDepth));
    const roots = [...new Set(seedPaths)].filter(Boolean);
    if (roots.length === 0) return new Map();
    const out = new Map<string, number>();
    const seenDepth = new Map<string, number>();
    let frontier = roots;
    for (const root of roots) seenDepth.set(root, 0);
    for (let depth = 1; depth <= depthLimit && frontier.length > 0; depth += 1) {
      const placeholders = frontier.map(() => '?').join(', ');
      const forward = this.db.prepare(`SELECT source, target FROM imports WHERE repo = ? AND source IN (${placeholders})`).all(this.repo, ...frontier) as {
        source: string;
        target: string;
      }[];
      const reverse = this.db.prepare(`SELECT source, target FROM imports WHERE repo = ? AND target IN (${placeholders})`).all(this.repo, ...frontier) as {
        source: string;
        target: string;
      }[];
      const next = new Set<string>();
      const add = (file: string, directionalWeight: number): void => {
        if (seenDepth.has(file)) return;
        seenDepth.set(file, depth);
        next.add(file);
        const distanceWeight = depth === 1 ? 1 : 0.55;
        out.set(file, Math.max(out.get(file) ?? 0, directionalWeight * distanceWeight));
      };
      for (const edge of forward) add(edge.target, 1);
      for (const edge of reverse) add(edge.source, 0.85);
      frontier = [...next];
    }
    return out;
  }

  /**
   * Ensure every indexed file has a fresh embedding vector for this model.
   * Embeds at most `budget` files per call (the rest catch up on later runs)
   * so a first run never stalls on a huge repo. Returns how many were embedded.
   */
  async updateVectors(embedder: Embedder, budget = 24): Promise<number> {
    const files = this.db.prepare('SELECT path, mtime_ms FROM files WHERE repo = ?').all(this.repo) as { path: string; mtime_ms: number }[];
    if (files.length === 0) return 0;
    const existing = new Map<string, { mtimeMs: number; model: string }>();
    const rows = this.db.prepare('SELECT path, mtime_ms, model FROM vectors WHERE repo = ?').all(this.repo) as { path: string; mtime_ms: number; model: string }[];
    for (const r of rows) existing.set(r.path, { mtimeMs: r.mtime_ms, model: r.model });

    const stale: { path: string; mtime_ms: number }[] = [];
    for (const f of files) {
      const prev = existing.get(f.path);
      if (prev && prev.model === embedder.model && Math.abs(prev.mtimeMs - f.mtime_ms) < 1) continue;
      stale.push(f);
      if (stale.length >= budget) break;
    }
    let done = 0;
    for (let i = 0; i < stale.length; i += EMBED_BATCH) {
      const batch = stale.slice(i, i + EMBED_BATCH);
      const texts = batch.map((f) => {
        let body = '';
        try {
          body = readFileSync(path.join(this.root, f.path), 'utf8').slice(0, EMBED_MAX_CHARS);
        } catch {
          /* unreadable → embed the path alone */
        }
        return `${f.path}\n${body}`;
      });
      const vectors = await embedder.embed(texts);
      const upsert = this.db.prepare('INSERT OR REPLACE INTO vectors (repo, path, model, mtime_ms, vec) VALUES (?, ?, ?, ?, ?)');
      this.db.exec('BEGIN');
      try {
        for (let j = 0; j < batch.length; j++) {
          const vec = vectors[j]!;
          upsert.run(this.repo, batch[j]!.path, embedder.model, batch[j]!.mtime_ms, Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength));
        }
        this.db.exec('COMMIT');
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
      done += batch.length;
    }
    return done;
  }

  /** Cosine similarity of the query against every stored vector, normalized to 0..1. */
  async semanticSearch(embedder: Embedder, query: string): Promise<Map<string, number>> {
    const rows = this.db.prepare('SELECT path, vec FROM vectors WHERE repo = ? AND model = ?').all(this.repo, embedder.model) as { path: string; vec: Uint8Array }[];
    const out = new Map<string, number>();
    if (rows.length === 0) return out;
    const [qv] = await embedder.embed([query]);
    if (!qv) return out;
    for (const row of rows) {
      const sim = cosineSimilarity(qv, decodeVector(row.vec));
      // Map cosine [-1,1] → [0,1].
      out.set(row.path, Math.max(0, Math.min(1, (sim + 1) / 2)));
    }
    return out;
  }

  stats(): { files: number; terms: number; imports: number } {
    const f = this.db.prepare('SELECT COUNT(*) AS n FROM files WHERE repo = ?').get(this.repo) as { n: number };
    const t = this.db.prepare('SELECT COUNT(*) AS n FROM terms WHERE repo = ?').get(this.repo) as { n: number };
    const i = this.db.prepare('SELECT COUNT(*) AS n FROM imports WHERE repo = ?').get(this.repo) as { n: number };
    return { files: f.n, terms: t.n, imports: i.n };
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
