import { randomUUID } from 'node:crypto';
import { ensureGituHome } from '../workspace/home.js';

/** Transport and model-context budgets are separate: keep the full redacted
 * response for inspection instead of discarding it to fit a model message. */
export const MAX_CONNECTION_RESPONSE_BYTES = 32 * 1024 * 1024;
const VIEW_CHARS = 3_500;
const SECRET_KEY = /(?:token|secret|password|passwd|authorization|api[_-]?key|credential|private[_-]?key|connection[_-]?string|database[_-]?url|^pwd$)/i;

export function redactConnectionData(value: unknown, secrets: readonly string[] = []): unknown {
  const ordered = [...new Set(secrets.filter(Boolean))].sort((a, b) => b.length - a.length);
  const clean = (text: string): string => {
    for (const secret of ordered) text = text.split(secret).join('<redacted>');
    return text.replace(/\b([a-z][a-z0-9+.-]*):\/\/[^\s/@:]+:[^\s/@]+@/gi, '$1://<redacted>@');
  };
  const walk = (item: unknown): unknown => {
    if (typeof item === 'string') return clean(item);
    if (Array.isArray(item)) return item.map(walk);
    if (item && typeof item === 'object') {
      const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      const record = item as Record<string, unknown>;
      const variableName = record['key'] ?? record['name'];
      const secretVariable = typeof variableName === 'string' && SECRET_KEY.test(variableName);
      for (const [key, child] of Object.entries(item)) {
        const secretValue = secretVariable && /^(?:value|values|real_value|raw_value|default|content|data)$/i.test(key);
        result[clean(key)] = SECRET_KEY.test(key) || secretValue ? '<redacted>' : walk(child);
      }
      return result;
    }
    return item;
  };
  return walk(value);
}

export async function readConnectionResponse(response: Response, secrets: readonly string[] = [], maxBytes = MAX_CONNECTION_RESPONSE_BYTES): Promise<unknown> {
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error(`Provider response exceeds the ${maxBytes}-byte transport budget. Use documented pagination, filters, or a narrower read; this is not a complete inventory.`);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return undefined;
  let value: unknown;
  try { value = JSON.parse(text); } catch { value = text; }
  return redactConnectionData(value, secrets);
}

export interface ConnectionResponseQuery {
  responseId: string;
  /** RFC 6901 JSON Pointer. Empty string selects the root. */
  path?: string;
  offset?: number;
  limit?: number;
  /** Exact object keys to project from each record, or the selected object. */
  fields?: string[];
  /** Case-insensitive literal search over the entire selected collection. */
  search?: string;
  mode?: 'data' | 'keys';
}

export interface ConnectionResponseView {
  responseId: string;
  path: string;
  type: string;
  total: number;
  matched: number;
  offset: number;
  returned: number;
  nextOffset?: number;
  complete: boolean;
  data: unknown;
  /** Original JSON Pointer of every returned array item, including searches. */
  itemPaths?: string[];
  rootKeys?: string[];
  providerPagination?: Record<string, unknown>;
  guidance: string;
}

function pointer(parent: string, key: string | number): string {
  return `${parent}/${String(key).replace(/~/g, '~0').replace(/\//g, '~1')}`;
}

function atPath(value: unknown, path: string): unknown {
  if (!path) return value;
  if (!path.startsWith('/') || /~(?![01])/u.test(path)) throw new Error('path must be a JSON Pointer, for example /data/0/name.');
  for (const part of path.slice(1).split('/')) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) throw new Error(`Response path does not exist: ${path}`);
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function descriptor(value: unknown, path: string): unknown {
  if (typeof value === 'string' && value.length > 160) return { type: 'string', length: value.length, preview: value.slice(0, 160), path };
  if (Array.isArray(value)) return { type: 'array', count: value.length, path };
  if (value && typeof value === 'object') return { type: 'object', keys: Object.keys(value).slice(0, 12), keyCount: Object.keys(value).length, path };
  return value;
}

function compactRecord(value: unknown, path: string, count = 12): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return descriptor(value, path);
  const entries = Object.entries(value);
  const priority = (key: string): number => /^(?:id|uuid|uid|name|label|title|status|type)$/.test(key) ? 0 : /(?:_id|Id)$/.test(key) ? 1 : 2;
  entries.sort(([a], [b]) => priority(a) - priority(b));
  return Object.fromEntries(entries.slice(0, count).map(([key, item]) => [key, descriptor(item, pointer(path, key))]));
}

/** Short-lived, host-only snapshots. No credentials or raw provider bodies
 * are written to disk. Opaque references are isolated by the Gitu home. */
export class ConnectionResponseStore {
  private entries = new Map<string, { value: unknown; bytes: number; expiresAt: number }>();
  constructor(private maxBytes = 64 * 1024 * 1024, private ttlMs = 30 * 60_000) {}

  put(value: unknown): string {
    const safe = redactConnectionData(value);
    const bytes = Buffer.byteLength(JSON.stringify(safe) ?? 'null');
    if (bytes > this.maxBytes) throw new Error('Response snapshot is too large. Use documented provider pagination or a narrower read.');
    this.prune();
    let used = [...this.entries.values()].reduce((sum, entry) => sum + entry.bytes, 0);
    while (used + bytes > this.maxBytes && this.entries.size) {
      const oldest = this.entries.keys().next().value!;
      used -= this.entries.get(oldest)!.bytes;
      this.entries.delete(oldest);
    }
    const id = randomUUID();
    this.entries.set(id, { value: safe, bytes, expiresAt: Date.now() + this.ttlMs });
    return id;
  }

  private prune(): void {
    for (const [id, entry] of this.entries) if (entry.expiresAt <= Date.now()) this.entries.delete(id);
  }

  inspect(query: ConnectionResponseQuery): ConnectionResponseView {
    this.prune();
    const entry = this.entries.get(query.responseId);
    if (!entry) throw new Error('Response snapshot expired or is unavailable in this workspace. Run the saved read again to obtain a new responseId.');
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 20;
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('offset must be a nonnegative integer; limit must be an integer from 1 to 100.');
    if (query.mode !== undefined && query.mode !== 'data' && query.mode !== 'keys') throw new Error('mode must be data or keys.');
    if (query.fields && (!Array.isArray(query.fields) || query.fields.length > 100 || query.fields.some(field => typeof field !== 'string'))) throw new Error('fields must contain at most 100 exact field names.');
    let path = query.path ?? '';
    let value = atPath(entry.value, path);
    const rootKeys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value) : undefined;
    // Common JSON envelopes expose a collection plus pagination metadata.
    // Select that collection automatically for a large initial preview.
    let providerPagination: Record<string, unknown> | undefined;
    if (query.path === undefined && query.mode !== 'keys' && !query.fields && rootKeys && JSON.stringify(value).length > 2_000) {
      const record = value as Record<string, unknown>;
      const collection = rootKeys.filter(key => Array.isArray(record[key])).sort((a, b) => (record[b] as unknown[]).length - (record[a] as unknown[]).length)[0];
      if (collection) {
        providerPagination = Object.fromEntries(rootKeys.filter(key => key !== collection && /page|cursor|next|previous|total|count|has_more|links|meta/i.test(key)).map(key => [key, JSON.stringify(record[key])!.length < 300 ? record[key] : descriptor(record[key], pointer('', key))]));
        path = pointer('', collection);
        value = record[collection];
      }
    }
    const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
    const search = query.search?.toLowerCase();
    let items: Array<{ key: string | number; value: unknown }>;
    if (Array.isArray(value)) items = value.map((item, index) => ({ key: index, value: item }));
    else if (value && typeof value === 'object') items = Object.entries(value).filter(([key]) => !query.fields || query.fields.includes(key)).map(([key, item]) => ({ key, value: item }));
    else items = [];
    const total = items.length;
    if (search) items = items.filter(item => `${item.key} ${JSON.stringify(item.value)}`.toLowerCase().includes(search));
    const guidance = 'Inspect this responseId with path (JSON Pointer), offset/nextOffset, fields, search, or mode:"keys". Search scans the entire selected collection. This snapshot covers one API response; follow documented API pagination using connection_read query.';
    const view: ConnectionResponseView = { responseId: query.responseId, path, type, total, matched: items.length, offset, returned: 0, complete: true, data: undefined, guidance };
    if (rootKeys && path !== (query.path ?? '')) view.rootKeys = rootKeys.slice(0, 30);
    if (providerPagination && Object.keys(providerPagination).length) view.providerPagination = providerPagination;
    if (typeof value === 'string' && query.mode !== 'keys') {
      // String offsets count characters, so large logs/config values remain readable.
      view.total = view.matched = value.length;
      if (search) {
        const haystack = value.toLowerCase();
        const snippets: Array<{ offset: number; text: string }> = [];
        view.data = snippets;
        view.matched = 0;
        let position = haystack.indexOf(search);
        let lastEnd = offset;
        let hasMore = false;
        let full = false;
        while (position >= 0) {
          view.matched++;
          if (position >= offset) {
            if (full || snippets.length >= limit) hasMore = true;
            else {
              const start = Math.max(0, position - 80);
              snippets.push({ offset: position, text: value.slice(start, start + 240) });
              if (JSON.stringify(view).length > VIEW_CHARS) { snippets.pop(); full = true; hasMore = true; }
              else lastEnd = position + search.length;
            }
          }
          position = haystack.indexOf(search, position + search.length);
        }
        view.returned = snippets.length;
        if (hasMore) {
          if (!snippets.length) throw new Error('Search preview is too wide. Select a shorter response path.');
          view.nextOffset = lastEnd;
        }
        view.complete = offset === 0 && !hasMore;
        return view;
      }
      let length = query.limit === undefined ? 1_000 : limit;
      for (;;) {
        const text = value.slice(offset, offset + length);
        view.data = text;
        view.returned = text.length;
        view.nextOffset = offset + text.length < value.length ? offset + text.length : undefined;
        view.complete = offset === 0 && view.nextOffset === undefined;
        if (JSON.stringify(view).length <= VIEW_CHARS) break;
        if (length <= 1) throw new Error('Response path is too wide for a preview. Use a shorter parent path.');
        length = Math.max(1, Math.floor(length / 2));
      }
      return view;
    }
    if (!items.length && (!value || typeof value !== 'object')) {
      view.data = query.mode === 'keys' ? [] : value;
      view.total = view.matched = view.returned = query.mode === 'keys' ? 0 : 1;
      return view;
    }
    const data: unknown[] = [];
    const itemPaths: string[] = [];
    const objectData: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    let compacted = false;
    for (const item of items.slice(offset, offset + limit)) {
      let selected = item.value;
      if (Array.isArray(value) && query.fields && selected && typeof selected === 'object') selected = Object.fromEntries(query.fields.filter(key => Object.hasOwn(selected as object, key)).map(key => [key, (selected as Record<string, unknown>)[key]]));
      if (query.mode === 'keys') selected = item.key;
      else if (JSON.stringify(selected)?.length > 500) {
        selected = Array.isArray(value) ? compactRecord(selected, pointer(path, item.key)) : descriptor(selected, pointer(path, item.key));
        compacted = true;
      }
      if (Array.isArray(value) || query.mode === 'keys') data.push(selected);
      else objectData[String(item.key)] = selected;
      if (Array.isArray(value)) { itemPaths.push(pointer(path, item.key)); view.itemPaths = itemPaths; }
      view.data = Array.isArray(value) || query.mode === 'keys' ? data : objectData;
      // A wide first record must not produce an empty page with nextOffset=0.
      if (view.returned === 0 && JSON.stringify(view).length > VIEW_CHARS) {
        selected = query.mode === 'keys' ? item.key : compactRecord(item.value, pointer(path, item.key), 3);
        if (Array.isArray(value) || query.mode === 'keys') data[data.length - 1] = selected;
        else objectData[String(item.key)] = selected;
        compacted = true;
      }
      if (JSON.stringify(view).length > VIEW_CHARS) {
        if (Array.isArray(value) || query.mode === 'keys') data.pop();
        else delete objectData[String(item.key)];
        if (Array.isArray(value)) itemPaths.pop();
        if (view.returned === 0) throw new Error('Selected response fields are too wide for a preview. Select a narrower JSON Pointer path or fewer fields.');
        break;
      }
      view.returned++;
    }
    view.data ??= Array.isArray(value) || query.mode === 'keys' ? data : objectData;
    if (offset + view.returned < items.length) view.nextOffset = offset + view.returned;
    view.complete = !compacted && offset === 0 && view.nextOffset === undefined;
    return view;
  }
}

const stores = new Map<string, ConnectionResponseStore>();
export function connectionResponses(): ConnectionResponseStore {
  const scope = ensureGituHome().root;
  let store = stores.get(scope);
  if (!store) { store = new ConnectionResponseStore(); stores.set(scope, store); }
  return store;
}
