/**
 * FileKnowledgeStore — durable, revision-bound implementation knowledge.
 *
 * The TaskLedger durably answers "WHAT must be accomplished?" (goal, plan,
 * criteria, evidence). The hot model context answers "what did I just see?"
 * but is ephemeral: after compaction it retains only short excerpt lines, so
 * exact contracts (signatures, unions, interface fields) are lost and the
 * model pays to REDISCOVER them by re-reading unchanged files.
 *
 * This store adds the missing middle layer: structured, implementation-
 * relevant facts extracted DETERMINISTICALLY (no LLM summarization) from files
 * the run actually read, bound to the content revision they were learned from.
 *
 *   TaskLedger     WHAT must be accomplished         durable
 *   FileKnowledge  WHAT Gitu learned about the code  durable, revision-bound
 *   Hot context    exact source / current reasoning  ephemeral
 *
 * Invalidation is the load-bearing rule: facts are only reused while the file
 * still matches its recorded revision (size + mtime fast path on disk, sha256
 * when content is available). A changed file drops its facts, and the model
 * must re-read before trusting old signatures.
 */
import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import path from 'node:path';
import { readJson, writeJson } from '../util.js';
import { extractAstFacts } from './file-knowledge-ast.js';

export interface FileKnowledge {
  /** Repo-relative POSIX path. */
  readonly path: string;
  /** Content revision the facts were extracted from. */
  readonly revision: string;
  readonly size: number;
  readonly mtimeMs: number;
  readonly facts: readonly string[];
  readonly symbols: readonly string[];
  readonly learnedAt: string;
}

/**
 * Feature telemetry for FileKnowledge — the numbers that answer, after real
 * sessions, "did knowledge actually reduce rereads, by how much, and why are
 * the remaining rereads happening?"
 *
 *  - hits/misses: knowledge served into a prompt vs requested-but-absent.
 *  - astSuccess/regexFallback: extraction quality (which path produced facts).
 *  - invalidations/staleDropped: how often edits or changed files retired
 *    knowledge (whole-file invalidation cost, measured for the later
 *    diff-aware-refresh decision).
 *  - rereadRequired: reads that knowledge could NOT cover (discovery reads).
 *  - rereadRedundant: reads the model made DESPITE fresh knowledge existing —
 *    the "why are remaining rereads happening" signal.
 *  - rereadAvoided: repeat reads served from the cached observation instead of
 *    the filesystem (the executor's cache path).
 */
export interface FileKnowledgeStats {
  extractions: number;
  astSuccess: number;
  regexFallback: number;
  invalidations: number;
  hits: number;
  misses: number;
  staleDropped: number;
  rereadRequired: number;
  rereadRedundant: number;
  rereadAvoided: number;
}


export const FILE_KNOWLEDGE_MAX_FACTS = 40;
export const FILE_KNOWLEDGE_MAX_SYMBOLS = 60;
export const FILE_KNOWLEDGE_MAX_FACT_CHARS = 200;
export const FILE_KNOWLEDGE_MAX_CONTENT_CHARS = 400_000;
export const FILE_KNOWLEDGE_MAX_ENTRIES = 200;
export const FILE_KNOWLEDGE_RENDER_MAX_FILES = 6;
export const FILE_KNOWLEDGE_RENDER_MAX_CHARS = 2_400;

/** File types whose implementation facts are worth keeping. */
export const KNOWLEDGE_EXTENSIONS: readonly string[] = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json'];

export function normalizeKnowledgePath(relPath: string): string {
  return relPath.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

export function contentRevision(content: string): string {
  return `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
}

/** Only structured, bounded source files yield knowledge. */
export function knowledgeEligible(relPath: string): boolean {
  return KNOWLEDGE_EXTENSIONS.includes(path.extname(relPath).toLowerCase());
}

interface ExtractedFacts {
  facts: string[];
  symbols: string[];
  /** Which extractor produced these facts — feeds feature telemetry. */
  extractor: 'ast' | 'regex';
}

function truncateFact(line: string): string {
  const flat = line.replace(/\s+/g, ' ').trim();
  return flat.length > FILE_KNOWLEDGE_MAX_FACT_CHARS ? `${flat.slice(0, FILE_KNOWLEDGE_MAX_FACT_CHARS - 1)}…` : flat;
}

/** Interface/class member names, read from the lines that follow a declaration. */
function collectMemberNames(lines: string[], startIndex: number, maxNames = 8): string[] {
  const names: string[] = [];
  for (let i = startIndex + 1; i < lines.length && names.length < maxNames; i++) {
    const line = lines[i]!;
    if (/^\s*}/.test(line)) break;
    const member = /^\s{2,}(?:readonly\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\??\s*[:(]/.exec(line);
    if (member) names.push(member[1]!);
  }
  return [...new Set(names)];
}

interface StoredKnowledge {
  schemaVersion: 1;
  entries: Record<string, FileKnowledge>;
}

/**
 * Deterministic implementation-fact extraction for TS/JS/JSON. Selective by
 * design: exported declarations, signatures, unions/enums, constants, and
 * interface member names — never arbitrary file content.
 *
 * TS/JS goes through the AST extractor first (multiline unions, generics,
 * overloads, class/interface members, import relationships). The regex path
 * below is the FALLBACK for sources the parser cannot read — facts from a
 * syntax-broken file are better than no facts, but never trusted as much.
 */
export function extractImplementationFacts(relPath: string, content: string): ExtractedFacts {
  const facts: string[] = [];
  const symbols: string[] = [];
  const add = (fact: string, symbol?: string): void => {
    if (facts.length < FILE_KNOWLEDGE_MAX_FACTS) facts.push(truncateFact(fact));
    if (symbol && symbols.length < FILE_KNOWLEDGE_MAX_SYMBOLS && !symbols.includes(symbol)) symbols.push(symbol);
  };

  if (path.extname(relPath).toLowerCase() === '.json') {
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        add(`top-level keys: ${Object.keys(parsed).slice(0, 20).join(', ')}`);
        const scripts = parsed['scripts'];
        if (scripts && typeof scripts === 'object') {
          add(`scripts: ${Object.keys(scripts).slice(0, 20).join(', ')}`);
        }
      }
    } catch {
      /* unparsable JSON yields no facts */
    }
    return { facts, symbols, extractor: 'regex' };
  }

  // Primary path for TS/JS: real parse. Undefined means "not TS/JS" or
  // "parse failure" — the regex fallback below still applies in both cases.
  const ast = extractAstFacts(relPath, content, {
    maxFacts: FILE_KNOWLEDGE_MAX_FACTS,
    maxFactChars: FILE_KNOWLEDGE_MAX_FACT_CHARS,
    maxSymbols: FILE_KNOWLEDGE_MAX_SYMBOLS,
  });
  if (ast) return { ...ast, extractor: 'ast' };

  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (!trimmed.startsWith('export ')) continue;

    let m = /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*(\([^)]*\)(?:\s*:\s*[^{]+)?)/.exec(trimmed);
    if (m) {
      add(`export function ${m[1]}${m[2]}`, m[1]);
      continue;
    }
    m = /^export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)([^{]*)/.exec(trimmed);
    if (m) {
      add(`export class ${m[1]}${m[2]}`, m[1]);
      continue;
    }
    m = /^export\s+interface\s+([A-Za-z_$][\w$]*)([^{]*)/.exec(trimmed);
    if (m) {
      const members = collectMemberNames(lines, i);
      add(`export interface ${m[1]}${m[2]}${members.length ? ` fields: ${members.join(', ')}` : ''}`, m[1]);
      continue;
    }
    m = /^export\s+type\s+([A-Za-z_$][\w$]*)\s*(<[^=]*>)?\s*=\s*(.+)$/.exec(trimmed);
    if (m) {
      add(`export type ${m[1]}${m[2] ?? ''} = ${m[3]}`, m[1]);
      continue;
    }
    m = /^export\s+(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/.exec(trimmed);
    if (m) {
      add(`export enum ${m[1]}`, m[1]);
      continue;
    }
    m = /^export\s+const\s+([A-Za-z_$][\w$]*)(\s*:\s*[^=]+)?\s*=/.exec(trimmed);
    if (m) {
      // Selective: module-level CONSTANTS and explicitly typed exports only —
      // a file full of one-off arrow helpers must not flood the knowledge.
      if (/^[A-Z][A-Z0-9_]*$/.test(m[1]!) || (m[2] ?? '').trim()) {
        add(`export const ${m[1]}${(m[2] ?? '').trim()}`, m[1]);
      }
    }
  }
  return { facts, symbols, extractor: 'regex' };
}

export class FileKnowledgeStore {
  private readonly entries = new Map<string, FileKnowledge>();
  private readonly file: string;
  private readonly counters: FileKnowledgeStats = {
    extractions: 0,
    astSuccess: 0,
    regexFallback: 0,
    invalidations: 0,
    hits: 0,
    misses: 0,
    staleDropped: 0,
    rereadRequired: 0,
    rereadRedundant: 0,
    rereadAvoided: 0,
  };

  private constructor(private readonly repoRoot: string) {
    this.file = path.join(repoRoot, '.hermes', 'file-knowledge.json');
    const stored = readJson<StoredKnowledge>(this.file);
    if (stored?.entries) {
      for (const [key, entry] of Object.entries(stored.entries)) {
        if (entry && typeof entry.path === 'string' && typeof entry.revision === 'string') {
          this.entries.set(normalizeKnowledgePath(key), entry);
        }
      }
    }
  }

  static forRepo(repoRoot: string): FileKnowledgeStore {
    return new FileKnowledgeStore(repoRoot);
  }

  get(relPath: string): FileKnowledge | undefined {
    return this.entries.get(normalizeKnowledgePath(relPath));
  }

  size(): number {
    return this.entries.size;
  }

  /**
   * Extract and persist facts for a file version. Idempotent per revision:
   * re-reading an unchanged file does not rewrite the store.
   */
  record(input: { path: string; content: string; size: number; mtimeMs: number }): FileKnowledge | undefined {
    const relPath = normalizeKnowledgePath(input.path);
    if (!knowledgeEligible(relPath) || input.content.length > FILE_KNOWLEDGE_MAX_CONTENT_CHARS) return undefined;
    const revision = contentRevision(input.content);
    const existing = this.entries.get(relPath);
    if (existing?.revision === revision) return existing;

    const extracted = extractImplementationFacts(relPath, input.content);
    this.counters.extractions += 1;
    if (extracted.extractor === 'ast') this.counters.astSuccess += 1;
    else this.counters.regexFallback += 1;
    const entry: FileKnowledge = {
      path: relPath,
      revision,
      size: input.size,
      mtimeMs: input.mtimeMs,
      facts: extracted.facts,
      symbols: extracted.symbols,
      learnedAt: new Date().toISOString(),
    };
    this.entries.set(relPath, entry);
    this.save();
    return entry;
  }

  /**
   * Drop knowledge for a path whose content changed (edit/write). Stale
   * signatures must never be presented as current.
   */
  invalidate(relPath: string): boolean {
    const removed = this.entries.delete(normalizeKnowledgePath(relPath));
    if (removed) {
      this.counters.invalidations += 1;
      this.save();
    }
    return removed;
  }

  /** True when the on-disk file still matches the recorded version. */
  stillMatches(entry: FileKnowledge): boolean {
    try {
      const abs = path.join(this.repoRoot, entry.path);
      const st = statSync(abs);
      return st.isFile() && st.size === entry.size && Math.abs(st.mtimeMs - entry.mtimeMs) < 1;
    } catch {
      return false;
    }
  }

  /**
   * Render the durable knowledge block for the model: newest/relevant first,
   * stale entries omitted (the file changed — facts are no longer trustworthy).
   * Empty string when nothing fresh is known.
   */
  render(opts: { candidates?: readonly string[]; maxFiles?: number; maxChars?: number } = {}): string {
    const maxFiles = opts.maxFiles ?? FILE_KNOWLEDGE_RENDER_MAX_FILES;
    const maxChars = opts.maxChars ?? FILE_KNOWLEDGE_RENDER_MAX_CHARS;
    const ordered: FileKnowledge[] = [];
    const seen = new Set<string>();
    for (const candidate of opts.candidates ?? []) {
      const entry = this.entries.get(normalizeKnowledgePath(candidate));
      if (entry && !seen.has(entry.path)) {
        seen.add(entry.path);
        ordered.push(entry);
      }
    }
    ordered.push(
      ...[...this.entries.values()]
        .filter((entry) => !seen.has(entry.path))
        .sort((a, b) => b.learnedAt.localeCompare(a.learnedAt)),
    );

    const blocks: string[] = [];
    let staleDropped = 0;
    let used = 0;
    for (const entry of ordered) {
      if (blocks.length >= maxFiles) break;
      if (!this.stillMatches(entry)) {
        staleDropped += 1;
        this.counters.staleDropped += 1;
        continue;
      }
      const block = [
        `- ${entry.path} (${entry.revision.slice(0, 14)}…, learned ${entry.learnedAt.slice(0, 16).replace('T', ' ')})`,
        ...entry.facts.map((fact) => `    ${fact}`),
        entry.symbols.length ? `    symbols: ${entry.symbols.slice(0, 12).join(', ')}` : '',
      ]
        .filter(Boolean)
        .join('\n');
      if (used + block.length > maxChars) break;
      blocks.push(block);
      used += block.length;
    }
    if (blocks.length === 0) {
      if ((opts.candidates?.length ?? 0) > 0 || this.entries.size > 0) this.counters.misses += 1;
      return '';
    }
    this.counters.hits += 1;
    const header =
      'FILE KNOWLEDGE (durable implementation facts from earlier reads — revision-bound):\n' +
      'These facts are current for the listed revisions. Trust them instead of re-reading; re-read ONLY when a file changed or a needed detail is absent.';
    const staleNote = staleDropped > 0 ? `\n(${staleDropped} entr${staleDropped === 1 ? 'y' : 'ies'} dropped as STALE — file changed since it was learned; re-read before relying on old facts.)` : '';
    return `${header}\n${blocks.join('\n')}${staleNote}`;
  }

  /**
   * Candidate paths for rendering: files the run touched most recently, so the
   * block leads with what the active work actually depends on.
   */
  static recentCandidatePaths(actions: readonly { tool?: string; paramsSummary?: string }[], filesChanged: readonly string[], max = 8): string[] {
    const candidates: string[] = [];
    const add = (value: string): void => {
      const normalized = normalizeKnowledgePath(value);
      if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
    };
    for (let i = actions.length - 1; i >= 0 && candidates.length < max; i--) {
      const summary = actions[i]?.paramsSummary ?? '';
      for (const prefix of ['read ', 'write ', 'edit ']) {
        if (summary.startsWith(prefix)) {
          add(summary.slice(prefix.length));
          break;
        }
      }
    }
    for (let i = filesChanged.length - 1; i >= 0 && candidates.length < max; i--) add(filesChanged[i]!);
    return candidates;
  }

  private save(): void {
    const entries = [...this.entries.values()]
      .sort((a, b) => b.learnedAt.localeCompare(a.learnedAt))
      .slice(0, FILE_KNOWLEDGE_MAX_ENTRIES);
    const payload: StoredKnowledge = { schemaVersion: 1, entries: Object.fromEntries(entries.map((entry) => [entry.path, entry])) };
    try {
      writeJson(this.file, payload);
    } catch {
      /* knowledge persistence must never break a tool result */
    }
  }

  /** Current feature telemetry snapshot (call-site counters, not entries). */
  stats(): FileKnowledgeStats {
    return { ...this.counters };
  }

  /** A successful read whose target had NO fresh knowledge — a discovery read. */
  noteRereadRequired(): void {
    this.counters.rereadRequired += 1;
  }

  /** A read the model made despite fresh knowledge existing for the path. */
  noteRereadRedundant(): void {
    this.counters.rereadRedundant += 1;
  }

  /** A repeat read served from the cached observation instead of the disk. */
  noteRereadAvoided(): void {
    this.counters.rereadAvoided += 1;
  }
}
