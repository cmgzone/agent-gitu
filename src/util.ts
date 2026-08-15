import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  } catch {
    return undefined;
  }
}

export function writeJson(file: string, data: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
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
    default:
      return `${tool} ${canonicalJson(params).slice(0, 120)}`;
  }
}
