import { createHash } from 'node:crypto';
// Namespace access (rather than named imports) keeps these calls interceptable
// by tests, matching src/llm/credential-file.ts. The durability guarantee below
// is only worth asserting if a test can observe it.
import fs from 'node:fs';
import path from 'node:path';

export function nowIso(): string {
  return new Date().toISOString();
}

export function shortId(prefix: string): string {
  const d = new Date();
  const date = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('');
  const rand = createHash('sha1')
    .update(`${Date.now()}-${Math.random()}`)
    .digest('hex')
    .slice(0, 6);
  return `${prefix}-${date}-${rand}`;
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function levenshtein(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix: number[][] = [];
  for (let i = 0; i <= bn; i++) matrix[i] = [i];
  for (let j = 0; j <= an; j++) matrix[0]![j] = j;
  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      matrix[i]![j] = b.charAt(i - 1) === a.charAt(j - 1)
        ? matrix[i - 1]![j - 1]!
        : Math.min(matrix[i - 1]![j - 1]! + 1, matrix[i - 1]![j]! + 1, matrix[i]![j - 1]! + 1);
    }
  }
  return matrix[bn]![an]!;
}

/**
 * "Did you mean" matching for names a model mistyped or invented: exact and
 * containment hits rank first, then a bounded edit distance so short names do
 * not match everything. Returns at most `limit` candidates, best first.
 */
export function closestNameMatches(name: string, candidates: string[], limit = 4): string[] {
  const lower = name.trim().toLowerCase();
  if (!lower) return [];
  return candidates
    .map((candidate) => {
      const c = candidate.toLowerCase();
      if (c === lower) return { candidate, score: 0 };
      if (c.includes(lower) || lower.includes(c)) return { candidate, score: Math.abs(c.length - lower.length) / 10 + 0.5 };
      const d = levenshtein(lower, c);
      return { candidate, score: d <= Math.max(2, Math.floor(c.length / 3)) ? d : Number.POSITIVE_INFINITY };
    })
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => a.score - b.score || a.candidate.localeCompare(b.candidate))
    .slice(0, Math.max(1, limit))
    .map((entry) => entry.candidate);
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return `{${parts.join(',')}}`;
}

export function normalizeToolPath(value: unknown, fallback = ''): string {
  const raw = String(value ?? fallback).trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  return raw.startsWith('./') ? raw.slice(2) : raw;
}

/**
 * Collapse presentation-only variations of investigation calls before hashing.
 * The loop detector should reason about the evidence question, not whether the
 * model asked for 120 vs 160 lines or a slightly larger search excerpt.
 *
 * read_file is bucketed into 200-line semantic regions. This keeps genuinely
 * different parts of a large file distinct while making overlapping rereads of
 * the same area share one action identity.
 */
export function canonicalToolParams(tool: string, params: unknown): unknown {
  if (!params || typeof params !== 'object' || Array.isArray(params)) return params;
  const p = params as Record<string, unknown>;

  if (tool === 'read_file') {
    const rawOffset = Number(p['offset'] ?? 1);
    const rawLimit = Number(p['limit'] ?? 2000);
    const startLine = Number.isFinite(rawOffset) ? Math.max(1, Math.floor(rawOffset)) : 1;
    const limit = Number.isFinite(rawLimit) ? Math.min(2000, Math.max(1, Math.floor(rawLimit))) : 2000;
    const endLine = startLine + limit - 1;
    return {
      path: normalizeToolPath(p['path']),
      startLine,
      endLine,
    };
  }

  if (tool === 'search_files') {
    const normalizeGlobs = (value: unknown): string[] =>
      Array.isArray(value)
        ? value
            .map(String)
            .map((item) => item.trim())
            .filter(Boolean)
            .sort()
        : [];
    const flags = String(p['flags'] ?? 'i')
      .split('')
      .filter((flag) => flag === 'i' || flag === 'm' || flag === 's')
      .sort()
      .join('');
    return {
      pattern: String(p['pattern'] ?? ''),
      mode: p['mode'] === 'literal' ? 'literal' : 'regex',
      flags,
      path: normalizeToolPath(p['path'], '.'),
      include: normalizeGlobs(p['include']),
      exclude: normalizeGlobs(p['exclude']),
      includeGenerated: p['includeGenerated'] === true,
    };
  }

  return params;
}

export function hashParams(tool: string, params: unknown): string {
  return sha256(`${tool}::${canonicalJson(canonicalToolParams(tool, params))}`);
}

const PATH_RE = /(?:[A-Za-z]:[\\/][^\s:'"`]+)|(?:\/[\w.@-]+(?:\/[\w.@-]+)+)/g;
const LOC_RE = /:\d+(?::\d+)?\b/g;
const HEX_RE = /\b0x[0-9a-f]+\b/gi;
const LONG_NUM_RE = /\b\d{4,}\b/g;
const ISO_TIME_RE = /\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

export function normalizeErrorText(text: string): string {
  return text
    .replace(UUID_RE, '<uuid>')
    .replace(ISO_TIME_RE, '<time>')
    .replace(PATH_RE, '<path>')
    .replace(LOC_RE, ':<loc>')
    .replace(HEX_RE, '<hex>')
    .replace(LONG_NUM_RE, '<num>')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

export function errorSignature(text: string): string {
  const normalized = normalizeErrorText(text);
  return normalized ? sha256(normalized).slice(0, 16) : 'empty';
}

export function excerpt(text: string, max = 1200): string {
  if (text.length <= max) return text;
  const head = text.slice(0, Math.floor(max * 0.6));
  const tail = text.slice(text.length - Math.floor(max * 0.3));
  return `${head}\n... [truncated ${text.length - head.length - tail.length} chars] ...\n${tail}`;
}

/**
 * A file that is empty, whitespace-only, or contains NUL bytes is the
 * signature of a torn write: the writer published a preallocated page before
 * its contents were flushed, so the atomically renamed file holds no data.
 * Such a file must never be read as "no saved state".
 */
function looksCorrupt(raw: string): boolean {
  return raw.length === 0 || raw.includes('\0') || raw.trim().length === 0;
}

/**
 * Move a damaged file aside and restore the last good `.bak` when one exists.
 * Quarantining (rather than deleting) keeps the evidence for diagnosis, which
 * is what distinguishes this from the old silent "treat as absent" read.
 */
function recoverDamaged<T>(file: string, reason: string): T | undefined {
  const backup = `${file}.bak`;
  let restored: T | undefined;
  try {
    const rawBackup = fs.readFileSync(backup, 'utf8');
    if (!looksCorrupt(rawBackup)) restored = JSON.parse(rawBackup) as T;
  } catch {
    // No usable backup: the caller gets "absent" after the warning below.
  }
  try {
    fs.renameSync(file, `${file}.corrupt-${Date.now()}`);
  } catch {
    // The damaged file may already be gone; the warning still matters.
  }
  if (restored !== undefined) {
    try {
      fs.copyFileSync(backup, file);
    } catch {
      // The value is still returned; only the on-disk repair failed.
    }
    console.error(`[hermes] warning: ${file} ${reason}; restored the previous known-good backup ${backup}`);
    return restored;
  }
  console.error(`[hermes] warning: ${file} ${reason}; moved aside as .corrupt and reported no saved state`);
  return undefined;
}

export function readJson<T>(file: string): T | undefined {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    // Missing files are a normal "absent" signal for callers. Anything else
    // (permissions, I/O) is surfaced instead of silently read as absent.
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== 'ENOENT') {
      console.error(`[hermes] warning: ${file} could not be read (${(err as Error).message})`);
    }
    return undefined;
  }
  if (looksCorrupt(raw)) return recoverDamaged<T>(file, 'was empty or NUL-filled');
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    return recoverDamaged<T>(file, `could not be parsed (${(err as Error).message})`);
  }
}

/**
 * Publish `tmp` over `file`, tolerating Windows AV / Defender briefly holding
 * the freshly written temp file (EPERM/EBUSY/EACCES on rename). The temp file
 * is always reclaimed, including on the failure path — an abandoned `.tmp` is
 * what a killed writer used to leave in the settings directory forever.
 */
function publishTemp(tmp: string, file: string): void {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      const isLock = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
      if (!isLock || attempt === 5) {
        // Final fallback: copy + unlink tolerates AV locks on rename. copy is
        // NOT atomic, so retry briefly — a reader observing a torn file would
        // otherwise see "missing"/corrupt state.
        for (let copyAttempt = 0; copyAttempt < 3; copyAttempt++) {
          try {
            fs.copyFileSync(tmp, file);
            try { fs.unlinkSync(tmp); } catch {}
            return;
          } catch {
            // Retry next attempt
          }
        }
        try { fs.unlinkSync(tmp); } catch {}
        throw err;
      }
      // On Windows, replacing an existing destination with renameSync can
      // report EPERM even when the file is not meaningfully locked. A direct
      // copy-over is the fallback we would eventually use below, so try it
      // immediately instead of paying the full 465ms rename backoff on every
      // routine ledger save.
      try {
        fs.copyFileSync(tmp, file);
        try { fs.unlinkSync(tmp); } catch {}
        return;
      } catch {
        // A real AV/reader lock can still clear shortly; retain the bounded
        // backoff before retrying.
      }
      // Retry next attempt
    }
  }
}

/** Keep exactly one known-good copy, so a torn write is recoverable. */
function keepBackup(file: string): void {
  try {
    fs.copyFileSync(file, `${file}.bak`);
  } catch {
    // An unreadable published file: nothing to preserve.
  }
}

export function writeJson(file: string, data: unknown, options: { mode?: number } = {}): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.floor(Math.random() * 1e6)}.tmp`;
  // fsync before the rename. Without it the filesystem can publish a
  // preallocated-but-unwritten file, which subsequently reads back as NUL
  // bytes — the corruption that produced a 105-byte all-NUL package.json.
  const fd = fs.openSync(tmp, 'w', options.mode);
  try {
    fs.writeFileSync(fd, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
    fs.fsyncSync(fd);
  } catch (err) {
    try { fs.closeSync(fd); } catch {}
    try { fs.unlinkSync(tmp); } catch {}
    throw err;
  }
  fs.closeSync(fd);
  publishTemp(tmp, file);
  // After publishing, so a backup always exists — including after the very
  // first write, which is exactly when a torn second write has nothing else to
  // fall back on.
  keepBackup(file);
}

/**
 * Reclaim abandoned atomic-write temporaries. A process killed between
 * creating `<name>.<pid>.<epoch>.tmp` and publishing it leaves the temp file
 * behind, and nothing else ever removes it.
 *
 * @param maxAgeMs only files at least this old are removed (default 1 hour).
 * @returns how many files were reclaimed.
 */
export function sweepStaleTempFiles(dir: string, maxAgeMs = 60 * 60 * 1000): number {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return 0;
  }
  const cutoff = Date.now() - maxAgeMs;
  let removed = 0;
  for (const entry of entries) {
    if (!entry.endsWith('.tmp')) continue;
    const target = path.join(dir, entry);
    try {
      const info = fs.statSync(target);
      if (!info.isFile() || info.mtimeMs > cutoff) continue;
      fs.unlinkSync(target);
      removed++;
    } catch {
      // Another process may have removed it first.
    }
  }
  return removed;
}

/**
 * Repair the damage the pre-fsync writer already left behind: an all-NUL file
 * is unreadable state, so quarantine it (preserving the evidence) and let the
 * caller recreate it. Returns true when the file was repaired.
 */
export function repairCorruptJsonFile(file: string): boolean {
  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return false;
  }
  if (!looksCorrupt(raw)) return false;
  recoverDamaged<unknown>(file, 'was empty or NUL-filled');
  return true;
}

export function summarizeParams(tool: string, params: Record<string, unknown>): string {
  switch (tool) {
    case 'read_file':
      return `read ${params['path']}`;
    case 'write_file':
      return `write ${params['path']}`;
    case 'apply_edit':
      return `edit ${params['path']}`;
    case 'run_command':
      if (params['action'] === 'status') return `command status ${params['id'] ?? '(all)'}`;
      if (params['action'] === 'stop') return `command stop ${params['id'] ?? ''}`;
      return `$ ${String(params['command'] ?? '').slice(0, 160)}`;
    case 'list_files':
      return `list ${params['path'] ?? '.'}`;
    case 'search_files':
      return `search /${params['pattern']}/ in ${params['path'] ?? '.'}`;
    case 'lsp_diagnostics':
      return `lsp diagnostics ${params['path']}`;
    case 'lsp_definition':
      return `lsp definition ${params['path']}:${params['line']}:${params['column']}`;
    case 'lsp_references':
      return `lsp references ${params['path']}:${params['line']}:${params['column']}`;
    case 'lsp_hover':
      return `lsp hover ${params['path']}:${params['line']}:${params['column']}`;
    case 'lsp_symbols':
      return `lsp symbols ${params['path']}`;
    case 'browse':
    case 'browser': {
      const a = String(params['action'] ?? (params['url'] ? 'navigate' : 'screenshot'));
      if (a === 'navigate') return `browse ${params['url']}`;
      if (a === 'click') return params['selector'] ? `browse click ${params['selector']}` : `browse click (${params['x']}, ${params['y']})`;
      if (a === 'type') return `browse type "${String(params['text'] ?? '').slice(0, 60)}"`;
      if (a === 'fill') return `browse fill ${params['selector']} = "${String(params['text'] ?? '').slice(0, 40)}"`;
      if (a === 'select') return `browse select ${params['selector']} → ${params['value']}`;
      if (a === 'scroll') return `browse scroll ${params['deltaY'] ?? 300}px`;
      if (a === 'press') return `browse press ${params['key']}`;
      if (a === 'hover') return `browse hover (${params['x']}, ${params['y']})`;
      if (a === 'wait') return `browse wait ${params['ms'] ?? 1000}ms`;
      return `browse ${a}`;
    }
    default:
      return `${tool} ${canonicalJson(params).slice(0, 120)}`;
  }
}
