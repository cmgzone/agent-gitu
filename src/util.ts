import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
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

export function hashParams(tool: string, params: unknown): string {
  return sha256(`${tool}::${canonicalJson(params)}`);
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

export function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch (err) {
    // Missing files are a normal "absent" signal for callers. A CORRUPT file
    // must not masquerade as missing — surface it so silent state loss (e.g.
    // a ledger read as "task not found") can at least be diagnosed.
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== 'ENOENT') {
      console.error(`[hermes] warning: ${file} exists but could not be parsed (${(err as Error).message})`);
    }
    return undefined;
  }
}

export function writeJson(file: string, data: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.floor(Math.random() * 1e6)}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  // Windows AV / Defender can briefly hold the freshly written temp file,
  // causing EPERM/EBUSY on the atomic rename. Retry with backoff instead of
  // crashing the specialist as "EPERM: operation not permitted".
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      renameSync(tmp, file);
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
            copyFileSync(tmp, file);
            try { unlinkSync(tmp); } catch {}
            return;
          } catch {
            const ms = 20 * (copyAttempt + 1);
            try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {}
          }
        }
        try { unlinkSync(tmp); } catch {}
        throw err;
      }
      // Backoff 15ms, 30ms, 60ms, 120ms, 240ms — sync sleep via Atomics.
      const ms = 15 * Math.pow(2, attempt);
      try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {}
    }
  }
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
    case 'browse': {
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
