import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConnectionRegistry } from '../src/connections/connections.js';
import { ConnectionResponseStore, connectionResponses, readConnectionResponse, type ConnectionResponseView } from '../src/connections/response-data.js';
import { connectionResultDisclosure } from '../src/agent/recovery-synthesizer.js';
import { executeCoworkTool, coworkNativeTools } from '../src/cowork/tools.js';
import { toolConnectionRead, toolInspectConnectionResponse, type ToolContext } from '../src/tools/tools.js';

const originalFetch = globalThis.fetch;
const previousHome = process.env.AGENT_GITU_HOME;
const homes: string[] = [];
function home(): void {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-response-'));
  homes.push(root);
  process.env.AGENT_GITU_HOME = root;
}
function registry(provider = 'inventory') {
  home();
  const connections = new ConnectionRegistry();
  connections.save({
    id: 'inventory', provider, label: 'Inventory', baseUrl: 'https://inventory.example.test', token: 'private-inventory-token',
    operations: [{ id: 'list-items', label: 'List items', method: 'GET', path: '/items', risk: 'read', capability: 'items.read' }],
    capabilities: ['items.read'],
  });
  return connections;
}
function context(connections: ConnectionRegistry): ToolContext {
  return { connections } as ToolContext;
}
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (previousHome === undefined) delete process.env.AGENT_GITU_HOME;
  else process.env.AGENT_GITU_HOME = previousHome;
  for (const root of homes.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('dynamic provider response inspection', () => {
  it('preserves a response above 48 KB, every record, deep fields and long text while redacting secrets', async () => {
    const connections = registry();
    const items = Array.from({ length: 250 }, (_, index) => ({
      id: `item-${index}`, name: `App ${index}`, status: 'running', config: 'x'.repeat(8000) + '-tail',
      metadata: { a: { b: { c: { d: { e: { f: { value: index, note: 'private-inventory-token' } } } } } } },
      password: 'do-not-expose', variables: [{ key: 'PRIVATE_KEY', value: 'do-not-expose' }],
    }));
    globalThis.fetch = (async () => new Response(JSON.stringify(items))) as typeof fetch;
    const result = await connections.invokeRead('inventory', 'list-items');
    expect((result.data as unknown[]).length).toBe(250);
    expect(JSON.stringify(result.data)).not.toContain('private-inventory-token');
    expect(JSON.stringify(result.data)).not.toContain('do-not-expose');
    expect((result.data as typeof items)[249]!.config).toHaveLength(8005);
    const disclosure = connectionResultDisclosure(result.data);
    const view = JSON.parse(disclosure.text) as ConnectionResponseView;
    expect(view.total).toBe(250);
    expect(view.complete).toBe(false);
    expect(view.nextOffset).toBeGreaterThan(0);
    expect(disclosure.text.length).toBeLessThan(4000);
    const searched = toolInspectConnectionResponse(context(connections), { responseId: view.responseId, search: 'App 249', fields: ['id', 'name'] });
    expect(JSON.parse(searched.output)).toMatchObject({ matched: 1, data: [{ id: 'item-249', name: 'App 249' }], itemPaths: ['/249'] });
    const deep = connectionResponses().inspect({ responseId: view.responseId, path: '/249/metadata/a/b/c/d/e/f' });
    expect(deep.data).toEqual({ value: 249, note: '<redacted>' });
    const tail = connectionResponses().inspect({ responseId: view.responseId, path: '/249/config', offset: 8000 });
    expect(tail.data).toBe('-tail');
    const textSearch = connectionResponses().inspect({ responseId: view.responseId, path: '/249/config', search: 'tail' });
    expect(textSearch).toMatchObject({ matched: 1, data: [{ offset: 8001 }] });
  });

  it('lets Cowork discover and inspect through native read tools without shell/config permissions', async () => {
    const connections = registry();
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return new Response(JSON.stringify(Array.from({ length: 10 }, (_, index) => ({ uuid: `app-${index}`, name: `App ${index}`, status: 'running', config: 'x'.repeat(9000) })))); }) as typeof fetch;
    const perms = { allowShell: false, allowWrites: false, allowConfig: false, chief: false, browser: false };
    const read = await executeCoworkTool(context(connections), 'connection_read', { connectionId: 'inventory', operationId: 'list-items' }, perms);
    expect(read.ok).toBe(true);
    const preview = JSON.parse(read.output.slice(read.output.indexOf('\n') + 1)) as ConnectionResponseView;
    expect(preview.total).toBe(10);
    const detail = await executeCoworkTool(context(connections), 'inspect_connection_response', { responseId: preview.responseId, limit: 100, fields: ['uuid', 'name', 'status'] }, perms);
    expect(JSON.parse(detail.output).data).toHaveLength(10);
    expect(calls).toBe(1);
    expect(coworkNativeTools({ ...perms, chiefOfStaff: false }, false).map(tool => tool.name)).toContain('connection_read');
  });

  it('supports documented query pagination and filters without changing the saved origin or exposing credentials', async () => {
    const connections = registry();
    let calledUrl: URL | undefined;
    let auth: string | null = null;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      calledUrl = new URL(String(input));
      auth = new Headers(init?.headers).get('authorization');
      return new Response(JSON.stringify({ data: [{ id: 201 }], next_cursor: 'page-3' }));
    }) as typeof fetch;
    const read = await toolConnectionRead(context(connections), { connectionId: 'inventory', operationId: 'list-items', query: { page: 2, 'filter[name]': 'App & Team', tag: ['one', 'two'], '$select': 'name' } });
    expect(read.ok).toBe(true);
    expect(calledUrl!.origin).toBe('https://inventory.example.test');
    expect(calledUrl!.searchParams.get('page')).toBe('2');
    expect(calledUrl!.searchParams.get('filter[name]')).toBe('App & Team');
    expect(calledUrl!.searchParams.getAll('tag')).toEqual(['one', 'two']);
    expect(auth).toBe('Bearer private-inventory-token');
    expect(read.output).not.toContain('private-inventory-token');
    await expect(connections.invokeRead('inventory', 'list-items', { api_key: 'leak' })).rejects.toThrow(/credential-like/);
    await expect(connections.invokeRead('inventory', 'list-items', { filter: { nested: true } })).rejects.toThrow(/Query values/);
  });

  it('adds a documented read dynamically and refuses a write through the read tool', async () => {
    const connections = registry();
    const requests: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => { requests.push(String(input)); return new Response('[{"id":"project-1"}]'); }) as typeof fetch;
    const operation = { id: 'list-projects', label: 'List projects', method: 'GET', path: '/projects', risk: 'read', capability: 'projects.read' };
    const read = await toolConnectionRead(context(connections), { connectionId: 'inventory', operation, documentationUrl: 'https://docs.example.test/projects' });
    expect(read.ok).toBe(true);
    expect(connections.operation('inventory', 'list-projects')).toMatchObject(operation);
    const write = await toolConnectionRead(context(connections), { connectionId: 'inventory', operation: { ...operation, method: 'POST', risk: 'reversible-write' }, documentationUrl: 'https://docs.example.test/projects' });
    expect(write.ok).toBe(false);
    expect(requests).toEqual(['https://inventory.example.test/projects']);
  });

  it('resolves a discovery target beyond item 100 from the complete inventory', async () => {
    const connections = registry('coolify');
    const applications = Array.from({ length: 180 }, (_, index) => ({ uuid: `app-${index}`, name: `App ${index}`, status: 'running', detail: 'x'.repeat(1000) }));
    globalThis.fetch = (async (input: string | URL | Request) => new Response(JSON.stringify(String(input).endsWith('/applications') ? applications : { uuid: 'app-179', name: 'App 179', status: 'running' }))) as typeof fetch;
    const found = await connections.discover({ connectionId: 'inventory', resourceType: 'application', resourceIdOrName: 'App 179', intents: ['get_resource'] });
    expect(found.ok).toBe(true);
    expect(found.matchedResource?.id).toBe('app-179');
  });

  it('does not turn a transport budget failure into an empty successful inventory', async () => {
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(100)); } });
    await expect(readConnectionResponse(new Response(stream), [], 50)).rejects.toThrow(/not a complete inventory/);
  });

  it('pages through fields beyond 100, escaped pointers, and compact wide rows with forward progress', () => {
    const store = new ConnectionResponseStore();
    const record = Object.fromEntries(Array.from({ length: 140 }, (_, index) => [`field-${index}`, 'x'.repeat(2000)]));
    const id = store.put({ 'a/b~c': record, rows: Array.from({ length: 30 }, (_, index) => ({ ...record, uuid: `row-${index}`, name: `Row ${index}` })) });
    expect(store.inspect({ responseId: id, path: '/a~1b~0c', mode: 'keys', offset: 130, limit: 10 }).data).toContain('field-139');
    expect(store.inspect({ responseId: id, path: '/a~1b~0c/field-139', offset: 1900 }).data).toBe('x'.repeat(100));
    let offset = 0;
    const ids: string[] = [];
    for (;;) {
      const view = store.inspect({ responseId: id, path: '/rows', offset });
      expect(JSON.stringify(view).length).toBeLessThan(4000);
      expect(view.returned).toBeGreaterThan(0);
      ids.push(...(view.data as Array<{ uuid: string }>).map(item => item.uuid));
      if (view.nextOffset === undefined) break;
      expect(view.nextOffset).toBeGreaterThan(offset);
      offset = view.nextOffset;
    }
    expect(ids).toEqual(Array.from({ length: 30 }, (_, index) => `row-${index}`));
    expect(() => store.inspect({ responseId: id, path: '/__proto__' })).toThrow(/does not exist/);
  });

  it('preserves pagination metadata and keeps snapshots scoped, expiring and bounded', () => {
    home();
    const id = connectionResponses().put({ data: Array.from({ length: 100 }, (_, index) => ({ id: index, name: `App ${index}` })), meta: { page: 1, total: 1000, next: 2 } });
    const preview = connectionResponses().inspect({ responseId: id });
    expect(preview.path).toBe('/data');
    expect(preview.providerPagination).toMatchObject({ meta: { page: 1, total: 1000, next: 2 } });
    expect(connectionResponses().inspect({ responseId: id, path: '/meta' }).data).toEqual({ page: 1, total: 1000, next: 2 });
    home();
    expect(() => connectionResponses().inspect({ responseId: id })).toThrow(/unavailable in this workspace/);
    const expired = new ConnectionResponseStore(100, 0);
    expect(() => expired.inspect({ responseId: expired.put({ value: 1 }) })).toThrow(/expired/);
    const bounded = new ConnectionResponseStore(20);
    const old = bounded.put('first response');
    bounded.put('second response');
    expect(() => bounded.inspect({ responseId: old })).toThrow(/unavailable/);
    const text = new ConnectionResponseStore();
    const textId = text.put('x'.repeat(50_000));
    expect(text.inspect({ responseId: textId, mode: 'keys' }).data).toEqual([]);
    const escapedId = text.put('\u0000'.repeat(10_000));
    const escaped = text.inspect({ responseId: escapedId });
    expect(JSON.stringify(escaped).length).toBeLessThan(4000);
    expect(escaped.nextOffset).toBeGreaterThan(0);
    const logs = text.put(Array.from({ length: 100 }, (_, index) => `line ${index}: error\n`).join(''));
    const firstMatches = text.inspect({ responseId: logs, search: 'error', limit: 1 });
    expect(firstMatches.matched).toBe(100);
    expect(firstMatches.returned).toBe(1);
    const nextMatches = text.inspect({ responseId: logs, search: 'error', limit: 1, offset: firstMatches.nextOffset });
    expect((nextMatches.data as Array<{ offset: number }>)[0]!.offset).toBeGreaterThan((firstMatches.data as Array<{ offset: number }>)[0]!.offset);
  });
});
