import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import type { McpManager } from '../mcp/client.js';
import type { StorageAdapter, StorageConnection, StorageItem, StorageRead, StorageOperation } from './types.js';

/** Explicit provider contract: JSON item metadata plus binary upload/download URLs. */
export class CustomStorage implements StorageAdapter {
  capabilities: StorageOperation[];
  constructor(
    private readonly c: StorageConnection,
    private readonly token?: string,
    private readonly mcp?: McpManager,
  ) {
    this.capabilities = (['list', 'read', 'upload', 'mkdir', 'move', 'delete', 'link'] as StorageOperation[]).filter((op) =>
      Boolean(c.config[op + (c.provider === 'mcp' ? 'Tool' : 'Path')]),
    );
  }
  private url(value: string): URL {
    const url = new URL(value, this.c.config['baseUrl']);
    const origin = this.c.config['transferOrigin'] || new URL(this.c.config['baseUrl']!).origin;
    if (!['http:', 'https:'].includes(url.protocol) || (url.origin !== origin && url.origin !== new URL(this.c.config['baseUrl']!).origin) || url.username || url.password)
      throw new Error('Custom storage returned an ungranted transfer origin.');
    return url;
  }
  private async invoke(operation: StorageOperation, args: Record<string, unknown>, signal?: AbortSignal): Promise<any> {
    signal?.throwIfAborted();
    if (!this.capabilities.includes(operation)) throw new Error('Storage operation is not supported.');
    if (this.c.provider === 'mcp') {
      if (!this.mcp) throw new Error('MCP is unavailable.');
      const result = await this.mcp.call(this.c.config[operation + 'Tool']!, { ...args, folder: args['folder'] ?? this.c.config['folder'] });
      signal?.throwIfAborted();
      return JSON.parse(result);
    }
    const template = this.c.config[operation + 'Path']!,
      url = this.url(template.replace(/\{(\w+)\}/g, (_match, key: string) => encodeURIComponent(String(args[key] ?? ''))));
    if (operation === 'list') url.searchParams.set('folder', String(args['folder'] ?? this.c.config['folder'] ?? ''));
    const response = await fetch(url, {
      method: ['list', 'read'].includes(operation) ? 'GET' : 'POST',
      headers: { ...(this.token ? { authorization: 'Bearer ' + this.token } : {}), 'content-type': 'application/json', ...(operation === 'upload' ? { 'idempotency-key': String(args['idempotencyKey']) } : {}) },
      ...(!['list', 'read'].includes(operation) ? { body: JSON.stringify({ ...args, folder: args['folder'] ?? this.c.config['folder'] }) } : {}),
      redirect: 'error',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Storage operation failed (${response.status}).`);
    return response.json();
  }
  private async listing(folder: string, signal?: AbortSignal): Promise<StorageItem[]> {
    const value = await this.invoke('list', { folder }, signal);
    const items = Array.isArray(value) ? value : value.items;
    if (!Array.isArray(items)) throw new Error('Storage adapter must return an items array.');
    if (items.length > 10000) throw new Error('Custom storage listing is too large to verify its grant.');
    return items.map((item) => {
      if (!item || typeof item.id !== 'string' || !item.id || typeof item.name !== 'string') throw new Error('Custom storage returned invalid item metadata.');
      return {
        id: String(item.id),
        name: String(item.name),
        size: typeof item.size === 'number' ? item.size : undefined,
        mime: typeof item.mime === 'string' ? item.mime : undefined,
        folder: item.folder === true,
      };
    });
  }
  private async allowed(id: string, signal?: AbortSignal): Promise<StorageItem> {
    const pending = [this.c.config['folder'] ?? ''],
      seen = new Set<string>();
    let inspected = 0;
    while (pending.length) {
      const folder = pending.shift()!;
      if (seen.has(folder)) continue;
      seen.add(folder);
      if (seen.size > 100) throw new Error('Custom storage grant traversal exceeded its verification limit.');
      const items = await this.listing(folder, signal);
      inspected += items.length;
      if (inspected > 10000) throw new Error('Custom storage grant traversal exceeded its verification limit.');
      const item = items.find((item) => item.id === id);
      if (item) return item;
      pending.push(...items.filter((item) => item.folder && !seen.has(item.id)).map((item) => item.id));
    }
    throw new Error('File is outside the granted storage listing.');
  }
  private async parent(folder?: string): Promise<string> {
    const root = this.c.config['folder'] ?? '';
    if (!folder || folder === root) return root;
    if (!(await this.allowed(folder)).folder) throw new Error('Destination is not a granted folder.');
    return folder;
  }
  async list(folder?: string): Promise<StorageItem[]> {
    return this.listing(await this.parent(folder));
  }
  async metadata(id: string): Promise<StorageItem> {
    return this.allowed(id);
  }
  async read(id: string, signal?: AbortSignal): Promise<StorageRead> {
    await this.allowed(id, signal);
    const descriptor = await this.invoke('read', { id }, signal),
      url = this.url(String(descriptor.url));
    const response = await fetch(url, {
      headers: this.token && url.origin === new URL(this.c.config['baseUrl']!).origin ? { authorization: 'Bearer ' + this.token } : undefined,
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000),
      redirect: 'error',
    });
    if (!response.ok || !response.body) throw new Error('Custom storage download failed.');
    return {
      item: { id, name: String(descriptor.name ?? 'file'), size: descriptor.size, mime: descriptor.mime, folder: false },
      stream: Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    };
  }
  async upload(file: string, name: string, checkpoint: Record<string, unknown>, save: (checkpoint: Record<string, unknown>) => void, signal?: AbortSignal): Promise<StorageItem> {
    signal?.throwIfAborted();
    const size = statSync(file).size;
    if (checkpoint['size'] !== undefined && checkpoint['size'] !== size) throw new Error('Upload source size changed.');
    const transferId = typeof checkpoint['transferId'] === 'string' ? checkpoint['transferId'] : randomUUID();
    if (checkpoint['creating'] && !checkpoint['upload'] && this.c.config['uploadIdempotent'] !== 'true')
      throw new Error('Custom upload creation is uncertain. Reconcile it with the provider before retrying.');
    let descriptor = checkpoint['upload'];
    if (!descriptor) {
      save({ transferId, size, creating: true });
      descriptor = await this.invoke('upload', { name, size, conflict: 'keep-both', transferId, idempotencyKey: transferId }, signal);
      save({ transferId, size, upload: descriptor });
    }
    const value = descriptor as { url: string; id: string; method?: string };
    const url = this.url(value.url);
    if (!value.id || !['PUT', 'POST'].includes(value.method ?? 'PUT')) throw new Error('Custom storage returned an invalid upload descriptor.');
    if (checkpoint['submitted'] && value.method === 'POST' && this.c.config['uploadIdempotent'] !== 'true')
      throw new Error('Custom upload submission is uncertain. Reconcile it with the provider before retrying.');
    save({ transferId, size, upload: descriptor, submitted: true });
    const body = createReadStream(file);
    try {
      const response = await fetch(url, {
        method: value.method || 'PUT',
        body: body as unknown as RequestInit['body'],
        duplex: 'half',
        redirect: 'error',
        headers: { 'idempotency-key': transferId, ...(this.token && url.origin === new URL(this.c.config['baseUrl']!).origin ? { authorization: 'Bearer ' + this.token } : {}) },
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(300000)]) : AbortSignal.timeout(300000),
      } as RequestInit);
      if (!response.ok) throw new Error('Custom storage upload failed.');
      return { id: value.id, name, size, folder: false };
    } finally {
      body.destroy();
      await finished(body).catch(() => {});
    }
  }
  async mkdir(name: string, parent?: string): Promise<StorageItem> {
    return this.invoke('mkdir', { name, parent: await this.parent(parent) });
  }
  async move(id: string, name: string, parent?: string): Promise<StorageItem> {
    await this.allowed(id);
    return this.invoke('move', { id, name, parent: await this.parent(parent), conflict: 'keep-both' });
  }
  async remove(id: string): Promise<void> {
    await this.allowed(id);
    await this.invoke('delete', { id });
  }
  async link(id: string): Promise<string> {
    await this.allowed(id);
    const result = await this.invoke('link', { id });
    const url = new URL(String(result.url));
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Custom storage returned an invalid sharing link.');
    return url.href;
  }
}
