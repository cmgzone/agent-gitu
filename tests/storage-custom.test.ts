import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomStorage } from '../src/storage/custom.js';
import type { StorageConnection } from '../src/storage/types.js';
const roots: string[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const connection = (): StorageConnection => ({
  id: 'custom',
  companyId: 'company',
  name: 'Files',
  provider: 'api',
  createdAt: '',
  permissions: ['list', 'read', 'upload', 'move', 'mkdir'],
  config: { baseUrl: 'https://storage.example', folder: 'granted', listPath: '/files', readPath: '/read/{id}', uploadPath: '/upload', movePath: '/move', mkdirPath: '/mkdir' },
});
const json = (value: unknown) => new Response(JSON.stringify(value));
const source = () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-custom-storage-'));
  roots.push(root);
  const file = path.join(root, 'source');
  writeFileSync(file, 'source');
  return file;
};
describe('custom storage grants and uncertain transfers', () => {
  it('verifies nested files and destinations through the granted root on each operation', async () => {
    const requests: string[] = [];
    const provider = vi.fn(async (url: URL, init: RequestInit) => {
      expect(init.redirect).toBe('error');
      requests.push(url.pathname + url.search);
      if (url.pathname === '/files')
        return json({
          items: url.searchParams.get('folder') === 'granted' ? [{ id: 'child', name: 'Child', folder: true }] : [{ id: 'nested-file', name: 'Notes', folder: false }],
        });
      if (url.pathname === '/mkdir') return json({ id: 'created', name: 'New', folder: true });
      throw new Error('Unexpected operation');
    });
    vi.stubGlobal('fetch', provider);
    const adapter = new CustomStorage(connection());
    expect((await adapter.metadata('nested-file')).name).toBe('Notes');
    expect((await adapter.list('child'))[0].id).toBe('nested-file');
    await expect(adapter.list('outside')).rejects.toThrow('outside');
    await expect(adapter.mkdir('New', 'outside')).rejects.toThrow('outside');
    await expect(adapter.move('nested-file', 'New', 'outside')).rejects.toThrow('outside');
    expect(requests.some((value) => value.includes('folder=outside'))).toBe(false);
    await adapter.mkdir('New', 'child');
    expect(JSON.parse(provider.mock.calls.at(-1)![1].body as string).parent).toBe('child');
  });
  it('bounds cyclic provider listings without allowing arbitrary folder probes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json([{ id: 'granted', name: 'Root', folder: true }])),
    );
    await expect(new CustomStorage(connection()).list('outside')).rejects.toThrow('outside');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('records destination creation before submission and waits after a lost creation acknowledgement', async () => {
    const file = source(),
      adapter = new CustomStorage(connection());
    let checkpoint: Record<string, unknown> = {};
    const provider = vi.fn(async () => {
      expect(checkpoint).toMatchObject({ creating: true, size: 6 });
      expect(checkpoint['transferId']).toBeTypeOf('string');
      throw new Error('Lost acknowledgement');
    });
    vi.stubGlobal('fetch', provider);
    await expect(adapter.upload(file, 'source', checkpoint, (value) => (checkpoint = value))).rejects.toThrow('Lost acknowledgement');
    await expect(adapter.upload(file, 'source', checkpoint, (value) => (checkpoint = value))).rejects.toThrow('uncertain');
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it('reuses the same declared idempotency key and descriptor after interrupted binary transfer', async () => {
    const file = source(),
      c = connection();
    c.config['uploadIdempotent'] = 'true';
    const adapter = new CustomStorage(c);
    let checkpoint: Record<string, unknown> = {},
      lostCreation = true,
      lostBinary = true,
      key: unknown;
    const provider = vi.fn(async (url: URL, init: RequestInit) => {
      expect(init.redirect).toBe('error');
      if (url.pathname === '/upload') {
        const args = JSON.parse(init.body as string);
        if (!key) key = args.idempotencyKey;
        expect(args.idempotencyKey).toBe(key);
        if (lostCreation) {
          lostCreation = false;
          throw new Error('Lost creation acknowledgement');
        }
        return json({ id: 'fixed-destination', url: '/binary', method: 'PUT' });
      }
      expect(checkpoint['submitted']).toBe(true);
      for await (const _chunk of init.body as unknown as AsyncIterable<Buffer>) {
        /* Drain the fixture stream. */
      }
      if (lostBinary) {
        lostBinary = false;
        throw new Error('Lost binary acknowledgement');
      }
      return new Response('', { status: 200 });
    });
    vi.stubGlobal('fetch', provider);
    const save = (value: Record<string, unknown>) => (checkpoint = value);
    await expect(adapter.upload(file, 'source', checkpoint, save)).rejects.toThrow('Lost creation');
    await expect(adapter.upload(file, 'source', checkpoint, save)).rejects.toThrow('Lost binary');
    expect((await adapter.upload(file, 'source', checkpoint, save)).id).toBe('fixed-destination');
    expect(provider.mock.calls.filter(([url]) => url.pathname === '/upload')).toHaveLength(2);
    expect(provider.mock.calls.filter(([url]) => url.pathname === '/binary')).toHaveLength(2);
  });
  it('does not resubmit uncertain non-idempotent POST transfers and destroys failed streams', async () => {
    const file = source(),
      adapter = new CustomStorage(connection());
    let checkpoint: Record<string, unknown> = { upload: { id: 'destination', url: '/binary', method: 'POST' }, size: 6 };
    let stream: { destroyed: boolean } | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: URL, init: RequestInit) => {
        stream = init.body as unknown as typeof stream;
        throw new Error('Network lost');
      }),
    );
    await expect(adapter.upload(file, 'source', checkpoint, (value) => (checkpoint = value))).rejects.toThrow('Network lost');
    expect(stream?.destroyed).toBe(true);
    await expect(adapter.upload(file, 'source', checkpoint, (value) => (checkpoint = value))).rejects.toThrow('uncertain');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
