import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { PassThrough, Readable } from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { LocalStorage } from '../src/storage/local.js';
import { StorageRegistry, type StorageTransfer } from '../src/storage/registry.js';
import { SecretVault } from '../src/connections/secret-vault.js';
import { CompanyStore } from '../src/company/store.js';
import { StorageOAuth } from '../src/storage/oauth.js';
import { CloudStorage } from '../src/storage/cloud.js';
import { CustomStorage } from '../src/storage/custom.js';
import type { StorageConnection } from '../src/storage/types.js';
import { storageFileHashes } from '../src/storage/hashes.js';
const roots: string[] = [];
const directory = () => {
  const p = mkdtempSync(path.join(os.tmpdir(), 'gitu-storage-'));
  roots.push(p);
  return p;
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const connection = (provider: StorageConnection['provider'], folder: string): StorageConnection => ({
  id: 'storage-test',
  companyId: 'company',
  name: 'Files',
  provider,
  config: { folder },
  permissions: ['list', 'read', 'upload', 'mkdir'],
  createdAt: new Date().toISOString(),
});
describe('company storage boundaries and recovery', () => {
  it('reports supported grants and checks changes against live connection authority', () => {
    vi.stubEnv('AGENT_GITU_SECRETS_KEY', 'ef'.repeat(32));
    const root = directory(), store = new CompanyStore(path.join(root, 'Companies'));
    try {
      const a = store.create(), b = store.create(), registry = new StorageRegistry(store, new SecretVault(path.join(root, 'Secrets')));
      const c = registry.save(a.id, { provider: 'api', config: { baseUrl: 'https://files.example', listPath: '/files' }, permissions: ['list','read','upload'] });
      expect(registry.capabilities(c)).toEqual(['list']);
      expect(() => registry.authorize(c, 'read')).toThrow('unsupported');
      expect(() => registry.save(a.id, { id: c.id, provider: 's3' })).toThrow('change providers');
      expect(() => store.saveResource('storage', c.id, b.id, { ...c, companyId: b.id })).toThrow('another company');
      registry.save(a.id, { id: c.id, permissions: [] });
      expect(() => registry.authorize(c, 'list')).toThrow('not granted');
    } finally { store.close(); }
  });
  it('protects active transfers during edits and disconnects, then removes credentials and default output', () => {
    vi.stubEnv('AGENT_GITU_SECRETS_KEY', 'ef'.repeat(32));
    const root = directory(), store = new CompanyStore(path.join(root, 'Companies'));
    try {
      const a = store.create(), vault = new SecretVault(path.join(root, 'Secrets')), registry = new StorageRegistry(store, vault);
      const c = registry.save(a.id, { provider: 's3', config: { bucket: 'files' }, permissions: ['upload'] }, { accessKeyId: 'id', secretAccessKey: 'private' });
      store.update(a.id, { defaultStorageId: c.id });
      const transfer: StorageTransfer = { id: 'transfer-active', companyId: a.id, connectionId: c.id, name: 'file.bin', state: 'running', size: 100, offset: 10, updatedAt: new Date().toISOString() };
      store.saveResource('transfer', transfer.id, a.id, transfer);
      expect(() => registry.save(a.id, { id: c.id, permissions: [] })).toThrow('Cancel active transfers');
      expect(() => registry.remove(a.id, c.id)).toThrow('Cancel active transfers');
      store.saveResource('transfer', transfer.id, a.id, { ...transfer, state: 'cancelled' });
      registry.remove(a.id, c.id);
      expect(registry.list(a.id)).toEqual([]);
      expect(store.get(a.id)?.defaultStorageId).toBe('');
      expect(vault.read(c.id)).toBeUndefined();
      expect(readdirSync(path.join(root, 'Secrets')).some(name => name.endsWith('.secret') || name.endsWith('.secret.bak'))).toBe(false);
      expect(store.list('transfer', a.id)).toHaveLength(1);
      expect(() => registry.authorize(c, 'upload')).toThrow('not found');
    } finally { store.close(); }
  });
  it('does not resurrect credentials when OAuth refresh completes after disconnect', async () => {
    vi.stubEnv('AGENT_GITU_SECRETS_KEY', 'ef'.repeat(32));
    const root = directory(), vault = new SecretVault(root), c = connection('google-drive', 'allowed');
    let respond!: (response: Response) => void;
    const oauth = new StorageOAuth(vault, (() => new Promise<Response>(resolve => { respond = resolve; })) as typeof fetch);
    oauth.save(c, { clientId: 'client', refreshToken: 'refresh', accessToken: 'old', expiresAt: 0 });
    const pending = oauth.token(c).catch(error => error);
    oauth.revoke(c);
    respond(new Response(JSON.stringify({ access_token: 'new', expires_in: 3600 })));
    expect(await pending).toMatchObject({ message: 'Storage account is disconnected.' });
    expect(vault.read(c.id)).toBeUndefined();
  });
  it('clears a default output connection when its upload grant is removed', () => {
    const root = directory(), store = new CompanyStore(path.join(root, 'Companies'));
    try {
      const a = store.create(), registry = new StorageRegistry(store, new SecretVault(path.join(root, 'Secrets')));
      const c = registry.save(a.id, { provider: 'local', config: { folder: root }, permissions: ['list','upload'] });
      store.update(a.id, { defaultStorageId: c.id });
      registry.save(a.id, { id: c.id, permissions: ['list'] });
      expect(store.get(a.id)?.defaultStorageId).toBe('');
    } finally { store.close(); }
  });
  it('stops a cancelled download and removes its unpublished partial file', async () => {
    vi.stubEnv('AGENT_GITU_SECRETS_KEY', 'ef'.repeat(32));
    const root = directory(), output = path.join(root, 'downloads'), store = new CompanyStore(path.join(root, 'Companies'));
    try {
      const registry = new StorageRegistry(store, new SecretVault(path.join(root, 'Secrets'))), stream = new PassThrough(), cancel = vi.fn();
      const c = registry.save(store.create().id, { provider: 'local', config: { folder: root }, permissions: ['read'] });
      vi.spyOn(registry, 'adapter').mockReturnValue({ capabilities: new Set(['read']), read: async () => ({ item: { id: 'file', name: 'file.bin', size: 100 }, stream }), cancel } as any);
      const result = registry.download(c, 'file', output, null).catch(error => error);
      await vi.waitFor(() => expect(store.list<StorageTransfer>('transfer', c.companyId)).toHaveLength(1));
      stream.write(Buffer.from('partial'));
      await vi.waitFor(() => expect(store.list<StorageTransfer>('transfer', c.companyId)[0]!.offset).toBe(7));
      const id = store.list<StorageTransfer>('transfer', c.companyId)[0]!.id;
      await registry.cancel(c, id);
      expect(await result).toMatchObject({ name: 'AbortError' });
      expect(store.read<StorageTransfer>('transfer', id)).toMatchObject({ state: 'cancelled', offset: 7 });
      expect(stream.destroyed).toBe(true);
      expect(readdirSync(output)).toEqual([]);
      expect(cancel).not.toHaveBeenCalled();
    } finally { store.close(); }
  });
  it('rejects truncated provider downloads before publishing them', async () => {
    vi.stubEnv('AGENT_GITU_SECRETS_KEY', 'ef'.repeat(32));
    const root = directory(), output = path.join(root, 'downloads'), store = new CompanyStore(path.join(root, 'Companies'));
    try {
      const registry = new StorageRegistry(store, new SecretVault(path.join(root, 'Secrets')));
      const c = registry.save(store.create().id, { provider: 'local', config: { folder: root }, permissions: ['read'] });
      vi.spyOn(registry, 'adapter').mockReturnValue({ capabilities: new Set(['read']), read: async () => ({ item: { id: 'file', name: 'file.bin', size: 100 }, stream: Readable.from([Buffer.from('short')]) }) } as any);
      await expect(registry.download(c, 'file', output, null)).rejects.toThrow('size did not match');
      expect(readdirSync(output)).toEqual([]);
      expect(store.list<StorageTransfer>('transfer', c.companyId)[0]!.state).toBe('failed');
    } finally { store.close(); }
  });
  it('keeps filename conflicts, stores all file types and rejects path escapes', async () => {
    const root = directory(),
      folder = path.join(root, 'allowed'),
      source = path.join(root, 'bytes');
    mkdirSync(folder);
    writeFileSync(source, Buffer.alloc(21 * 1024 * 1024, 7));
    const adapter = new LocalStorage(connection('local', folder));
    let checkpoint: Record<string, unknown> = {};
    const first = await adapter.upload(source, 'large.unknown', checkpoint, (next) => (checkpoint = next));
    const second = await adapter.upload(source, 'large.unknown', {}, () => {});
    expect(first.id).not.toBe(second.id);
    expect(readFileSync(path.join(folder, first.id)).equals(readFileSync(source))).toBe(true);
    await expect(adapter.read('../bytes')).rejects.toThrow('outside');
    expect((await adapter.list()).length).toBe(2);
  });
  it('preserves a partial local upload and resumes without publishing a partial artifact', async () => {
    const root = directory(),
      folder = path.join(root, 'allowed');
    mkdirSync(folder);
    const source = path.join(root, 'source');
    writeFileSync(source, 'abcdefgh');
    writeFileSync(path.join(folder, 'result.txt.gitu-part'), 'abc');
    const adapter = new LocalStorage(connection('local', folder));
    const item = await adapter.upload(source, 'result.txt', { target: 'result.txt', offset: 3 }, () => {});
    expect(readFileSync(path.join(folder, item.id), 'utf8')).toBe('abcdefgh');
  });
  it('isolates storage ownership, protects secrets and rejects missing grants', async () => {
    vi.stubEnv('AGENT_GITU_SECRETS_KEY', 'ab'.repeat(32));
    const root = directory(),
      store = new CompanyStore(path.join(root, 'Companies'));
    try {
      const a = store.create(),
        b = store.create(),
        vault = new SecretVault(path.join(root, 'Secrets')),
        registry = new StorageRegistry(store, vault);
      const c = registry.save(
        a.id,
        { provider: 'api', config: { baseUrl: 'https://storage.example', listPath: '/files' }, permissions: ['list'] },
        { accessToken: 'private-credential' },
      );
      expect(() => registry.get(b.id, c.id)).toThrow('not found');
      expect(() => registry.authorize(c, 'delete')).toThrow('not granted');
      expect(JSON.stringify(registry.list(a.id))).not.toContain('private-credential');
      expect(readFileSync(path.join(root, 'Secrets', c.id + '.secret'), 'utf8')).not.toContain('private-credential');
    } finally {
      store.close();
    }
  });
  it('refreshes expired OAuth credentials once without exposing refresh tokens', async () => {
    vi.stubEnv('AGENT_GITU_SECRETS_KEY', 'cd'.repeat(32));
    const c = connection('google-drive', 'folder'),
      oauth = new StorageOAuth(new SecretVault(directory()), ((...args: Parameters<typeof fetch>) => fetch(...args)) as typeof fetch);
    oauth.save(c, { clientId: 'app', clientSecret: 'secret', refreshToken: 'refresh', accessToken: 'expired', expiresAt: 0 });
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ access_token: 'renewed', expires_in: 3600 }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    expect(await Promise.all([oauth.token(c), oauth.token(c)])).toEqual(['renewed', 'renewed']);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it('rejects cloud objects outside the selected folder and failed authentication', async () => {
    const oauth = {
        token: async () => 'token',
        refresh: async () => {
          throw new Error('Reconnect this storage account.');
        },
      } as unknown as StorageOAuth,
      c = connection('onedrive', 'allowed');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => new Response(JSON.stringify({ id: url.includes('allowed') ? 'allowed' : 'outside', parentReference: { id: 'root' } }), { status: 200 })),
    );
    await expect(new CloudStorage(c, oauth).read('outside')).rejects.toThrow();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 401 })),
    );
    await expect(new CloudStorage(c, oauth).list()).rejects.toThrow('Reconnect');
  });
  it('renews revoked cloud access once and reports quota without exposing credentials', async () => {
    const refresh = vi.fn(async () => 'fresh'),
      oauth = { token: async () => 'token', refresh } as unknown as StorageOAuth;
    let calls = 0;
    const provider = vi.fn(async () => (++calls === 1 ? new Response('{}', { status: 401 }) : new Response(JSON.stringify({ storageQuota: { limit: '1000', usage: '300' } }))));
    expect(await new CloudStorage(connection('google-drive', 'folder'), oauth, provider as typeof fetch).quota()).toEqual({ totalBytes: 1000, usedBytes: 300 });
    expect(refresh).toHaveBeenCalledOnce();
  });
  it('reconciles a Dropbox lost chunk acknowledgment using its reported offset', async () => {
    const source = path.join(directory(), 'source');
    writeFileSync(source, 'abcdef');
    let checkpoint: Record<string, unknown> = { sessionId: 'session', offset: 0, destination: '/folder/result' };
    const provider = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes('append_v2')) return new Response(JSON.stringify({ error: { correct_offset: 6 } }), { status: 409 });
      if (url.includes('finish')) {
        const args = JSON.parse(new Headers(init.headers).get('dropbox-api-arg')!);
        expect(args.cursor.offset).toBe(6);
        return new Response(JSON.stringify({ path_lower: '/folder/result', name: 'result', size: 6 }));
      }
      throw new Error('Unexpected provider request');
    });
    const oauth = { token: async () => 'token' } as unknown as StorageOAuth;
    expect(
      (
        await new CloudStorage(connection('dropbox', '/folder'), oauth, provider as typeof fetch).upload(source, 'result', checkpoint, (next) => {
          checkpoint = next;
        })
      ).size,
    ).toBe(6);
    expect(checkpoint['finishing']).toBe(true);
  });
  it('reconciles Dropbox completion by content hash without resubmitting a completed file', async () => {
    const source = path.join(directory(), 'source'); writeFileSync(source, 'abcdef');
    const hash = (await storageFileHashes(source)).dropbox, oauth = { token: async () => 'token' } as unknown as StorageOAuth;
    const checkpoint = { sessionId: 'session', offset: 6, destination: '/folder/result', finishing: true };
    const provider = vi.fn(async () => new Response(JSON.stringify({ path_lower: '/folder/result', name: 'result', size: 6, content_hash: hash })));
    expect((await new CloudStorage(connection('dropbox', '/folder'), oauth, provider as typeof fetch).upload(source, 'result', checkpoint, () => {})).size).toBe(6);
    expect(provider).toHaveBeenCalledOnce();
    const mismatch = vi.fn(async () => new Response(JSON.stringify({ path_lower: '/folder/result', name: 'result', size: 6, content_hash: 'wrong' })));
    await expect(new CloudStorage(connection('dropbox', '/folder'), oauth, mismatch as typeof fetch).upload(source, 'result', checkpoint, () => {})).rejects.toThrow('does not match');
    expect(mismatch).toHaveBeenCalledOnce();
  });
  it('reconciles an empty OneDrive upload after a lost response without creating another copy', async () => {
    const source = path.join(directory(), 'empty'); writeFileSync(source, '');
    const oauth = { token: async () => 'token' } as unknown as StorageOAuth;
    let checkpoint: Record<string, unknown> = {}, stored = false, puts = 0;
    const provider = vi.fn(async (url: string, init: RequestInit) => {
      if (init.method === 'PUT') {
        puts++;
        expect(checkpoint).toMatchObject({ emptySubmitted: true, folder: 'folder', offset: 0 });
        expect(new URL(url).searchParams.get('@microsoft.graph.conflictBehavior')).toBe('fail');
        stored = true;
        throw new Error('Response lost after provider saved the file');
      }
      if (new URL(url).pathname.includes(':/')) {
        expect(stored).toBe(true);
        expect(decodeURIComponent(url)).toContain(String(checkpoint['destination']));
        return new Response(JSON.stringify({ id: 'uploaded', name: checkpoint['destination'], size: 0, file: { mimeType: 'application/octet-stream' } }));
      }
      return new Response(JSON.stringify({ id: 'folder', name: 'folder', folder: {} }));
    });
    const save = (value: Record<string, unknown>) => { checkpoint = value; };
    await expect(new CloudStorage(connection('onedrive', 'folder'), oauth, provider as typeof fetch).upload(source, 'empty', checkpoint, save)).rejects.toThrow('Response lost');
    expect((await new CloudStorage(connection('onedrive', 'folder'), oauth, provider as typeof fetch).upload(source, 'empty', checkpoint, save)).id).toBe('uploaded');
    expect(puts).toBe(1);
  });
  it('retries the same missing empty OneDrive destination with conflict protection and rejects changed grants', async () => {
    const source = path.join(directory(), 'empty'); writeFileSync(source, '');
    const oauth = { token: async () => 'token' } as unknown as StorageOAuth;
    const checkpoint = { destination: 'empty-fixed', folder: 'folder', emptySubmitted: true, offset: 0 };
    let committed = false, puts = 0;
    const provider = vi.fn(async (url: string, init: RequestInit) => {
      if (!new URL(url).pathname.includes(':/')) return new Response(JSON.stringify({ id: 'folder', folder: {} }));
      if (init.method === 'PUT') {
        puts++; committed = true;
        expect(decodeURIComponent(url)).toContain('empty-fixed:/content');
        return new Response('{}', { status: 409 });
      }
      return committed ? new Response(JSON.stringify({ id: 'uploaded', name: 'empty-fixed', size: 0, file: {} })) : new Response('{}', { status: 404 });
    });
    expect((await new CloudStorage(connection('onedrive', 'folder'), oauth, provider as typeof fetch).upload(source, 'empty', checkpoint, () => {})).id).toBe('uploaded');
    expect(puts).toBe(1);
    const writesBefore = puts;
    await expect(new CloudStorage(connection('onedrive', 'other-folder'), oauth, provider as typeof fetch).upload(source, 'empty', checkpoint, () => {})).rejects.toThrow('folder changed');
    expect(puts).toBe(writesBefore);
  });
  it('does not overwrite a nonempty OneDrive file while reconciling an empty upload', async () => {
    const source = path.join(directory(), 'empty'); writeFileSync(source, '');
    const oauth = { token: async () => 'token' } as unknown as StorageOAuth;
    const provider = vi.fn(async (url: string, init: RequestInit) => {
      if (init.method === 'PUT') throw new Error('Existing provider file must not be overwritten');
      return new Response(JSON.stringify(new URL(url).pathname.includes(':/') ? { id: 'existing', name: 'result', size: 12, file: {} } : { id: 'folder', folder: {} }));
    });
    await expect(new CloudStorage(connection('onedrive', 'folder'), oauth, provider as typeof fetch).upload(source, 'empty', { destination: 'result', folder: 'folder', emptySubmitted: true }, () => {})).rejects.toThrow('receipt does not match');
  });
  it('retries an unfinished Dropbox commit using the same session and destination', async () => {
    const source = path.join(directory(), 'source'); writeFileSync(source, 'abcdef');
    const checkpoint = { sessionId: 'session', offset: 6, destination: '/folder/result', finishing: true }, oauth = { token: async () => 'token' } as unknown as StorageOAuth;
    const provider = vi.fn(async (url: string, init: RequestInit) => {
      if (url.includes('get_metadata')) return new Response(JSON.stringify({ error: { '.tag': 'path', path: { '.tag': 'not_found' } } }), { status: 409 });
      if (!url.includes('upload_session/finish')) throw new Error('A new session or chunk should not be submitted.');
      const args = JSON.parse(new Headers(init.headers).get('dropbox-api-arg')!);
      expect(args).toMatchObject({ cursor: { session_id: 'session', offset: 6 }, commit: { path: '/folder/result', autorename: false } });
      return new Response(JSON.stringify({ path_lower: '/folder/result', name: 'result', size: 6 }));
    });
    expect((await new CloudStorage(connection('dropbox', '/folder'), oauth, provider as typeof fetch).upload(source, 'result', checkpoint, () => {})).size).toBe(6);
    expect(provider).toHaveBeenCalledTimes(2);
  });
  it('does not advertise unsupported custom operations or follow ungranted download origins', async () => {
    const c = connection('api', 'folder');
    c.config = { baseUrl: 'https://storage.example', listPath: '/files', readPath: '/files/{id}' };
    const adapter = new CustomStorage(c);
    expect(adapter.capabilities).toEqual(['list', 'read']);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: URL) =>
          new Response(JSON.stringify(url.pathname === '/files' ? { items: [{ id: 'file', name: 'file' }] } : { url: 'https://outside.example/file' }), { status: 200 }),
      ),
    );
    await expect(adapter.read('file')).rejects.toThrow('origin');
    await expect(adapter.mkdir('folder')).rejects.toThrow('not supported');
  });
});
