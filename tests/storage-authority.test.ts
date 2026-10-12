import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompanyStore } from '../src/company/store.js';
import { SecretVault } from '../src/connections/secret-vault.js';
import { StorageRegistry, type StorageTransfer } from '../src/storage/registry.js';
import { StorageOAuth } from '../src/storage/oauth.js';
import type { StorageConnection } from '../src/storage/types.js';

const roots: string[] = [], stores: CompanyStore[] = [];
const fixture = () => {
  vi.stubEnv('AGENT_GITU_SECRETS_KEY', 'ef'.repeat(32));
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-storage-authority-')); roots.push(root);
  const store = new CompanyStore(path.join(root, 'companies')); stores.push(store);
  const vault = new SecretVault(path.join(root, 'secrets')), registry = new StorageRegistry(store, vault);
  const company = store.create(), file = path.join(root, 'source'); writeFileSync(file, 'fixture');
  const connection = registry.save(company.id, { provider: 'google-drive', config: { folder: 'original' }, permissions: ['upload', 'read'] }, { clientId: 'client', accessToken: 'old', refreshToken: 'old-refresh' });
  return { root, store, vault, registry, company, file, connection };
};
afterEach(() => { for (const store of stores.splice(0)) store.close(); vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('durable storage grant binding', () => {
  it('blocks account, folder and OAuth changes until interrupted uploads are reconciled or cancelled', async () => {
    const { store, registry, file, connection } = fixture();
    const upload = vi.fn(async (_file, _name, _checkpoint, save) => { save({ sessionId: 'original-session', offset: 3 }); throw new Error('Network lost'); });
    const cancel = vi.fn(async () => {});
    vi.spyOn(registry, 'adapter').mockReturnValue({ capabilities: ['upload'], upload, cancel } as any);
    await expect(registry.upload(connection, file, 'result')).rejects.toThrow('Network lost');
    expect(() => registry.save(connection.companyId, { id: connection.id, config: { folder: 'outside' } })).toThrow('unfinished uploads');
    expect(() => registry.save(connection.companyId, { id: connection.id }, { accessToken: 'other-account' })).toThrow('unfinished uploads');
    expect(() => registry.oauth.begin(connection, 'https://owner.example/callback')).toThrow('unfinished uploads');
    registry.save(connection.companyId, { id: connection.id, permissions: ['read'] }, {});
    expect(() => registry.authorize(connection, 'upload')).toThrow('not granted');
    const transfer = store.list<StorageTransfer>('transfer', connection.companyId)[0]!;
    await registry.cancel(connection, transfer.id); expect(cancel).toHaveBeenCalledTimes(1);
    const current = registry.save(connection.companyId, { id: connection.id, config: { folder: 'outside' }, permissions: ['upload'] }, { accessToken: 'other-account' });
    await expect(registry.upload(current, file, 'result')).rejects.toThrow('Network lost');
    expect(upload.mock.calls[1]![2]).toEqual({});
  });
  it('resumes with the same grant and rejects checkpoint reuse after an out-of-band scope change', async () => {
    const { store, registry, file, connection } = fixture(); let calls = 0;
    const upload = vi.fn(async (_file, _name, checkpoint, save) => {
      if (++calls === 1) { save({ sessionId: 'saved', offset: 3 }); throw new Error('Network lost'); }
      expect(checkpoint).toMatchObject({ sessionId: 'saved', offset: 3 }); return { id: 'receipt', name: 'result', size: 7, folder: false };
    });
    vi.spyOn(registry, 'adapter').mockReturnValue({ capabilities: ['upload'], upload } as any);
    await expect(registry.upload(connection, file, 'result')).rejects.toThrow('Network lost');
    expect((await registry.upload(connection, file, 'result')).id).toBe('receipt');
    expect((await registry.upload(connection, file, 'result')).id).toBe('receipt'); expect(upload).toHaveBeenCalledTimes(2);
    store.saveResource('storage', connection.id, connection.companyId, { ...connection, config: { folder: 'outside' } });
    await expect(registry.upload(connection, file, 'result')).rejects.toThrow('different account or folder'); expect(upload).toHaveBeenCalledTimes(2);
  });
  it('invalidates external references when their account changes while retaining their metadata', () => {
    const { store, registry, connection } = fixture();
    store.saveResource('file-reference', 'reference', connection.companyId, { id: 'reference', connectionId: connection.id, companyId: connection.companyId, item: { id: 'provider-file', name: 'notes', folder: false }, authority: registry.authority(connection) });
    expect(registry.references(connection.companyId)[0]).toMatchObject({ readable: true, grantChanged: false });
    registry.save(connection.companyId, { id: connection.id }, { accessToken: 'new-account' });
    expect(registry.references(connection.companyId)[0]).toMatchObject({ readable: false, grantChanged: true, item: { id: 'provider-file', name: 'notes' } });
  });
  it('prevents uploads during OAuth and never reuses the previous account refresh token', async () => {
    const { registry, vault, file, connection } = fixture();
    const oauth = new StorageOAuth(vault, (async () => new Response(JSON.stringify({ access_token: 'new-account' }))) as typeof fetch);
    const before = oauth.secret(connection).authorityId;
    const url = new URL(oauth.begin(connection, 'https://owner.example/callback'));
    await expect(registry.upload(connection, file, 'result')).rejects.toThrow('Finish storage sign-in');
    await oauth.finish(connection, 'code', url.searchParams.get('state')!);
    expect(oauth.secret(connection)).toMatchObject({ accessToken: 'new-account' });
    expect(oauth.secret(connection).refreshToken).toBeUndefined(); expect(oauth.secret(connection).authorityId).not.toBe(before);
  });
  it('does not let a late refresh overwrite a newly authorized account', async () => {
    const { vault, connection } = fixture(); let respond!: (response: Response) => void;
    const oauth = new StorageOAuth(vault, (() => new Promise<Response>(resolve => { respond = resolve; })) as typeof fetch);
    oauth.save(connection, { ...oauth.secret(connection), expiresAt: 0 });
    const pending = oauth.token(connection).catch(error => error);
    oauth.save(connection, { authorityId: 'replacement', accessToken: 'new-account' });
    respond(new Response(JSON.stringify({ access_token: 'old-account-refreshed' })));
    expect(await pending).toMatchObject({ message: expect.stringContaining('credentials changed') });
    expect(oauth.secret(connection)).toEqual({ authorityId: 'replacement', accessToken: 'new-account' });
  });
  it('rechecks unfinished uploads after an OAuth response arrives', async () => {
    const { vault, registry, connection, store } = fixture(); let respond!: (response: Response) => void;
    const oauth = new StorageOAuth(vault, (() => new Promise<Response>(resolve => { respond = resolve; })) as typeof fetch, c => registry.assertReconnectAllowed(c));
    const url = new URL(oauth.begin(connection, 'https://owner.example/callback'));
    const pending = oauth.finish(connection, 'code', url.searchParams.get('state')!).catch(error => error);
    store.saveResource('transfer', 'queued-upload', connection.companyId, { id: 'queued-upload', connectionId: connection.id, companyId: connection.companyId, state: 'running', direction: 'upload' });
    respond(new Response(JSON.stringify({ access_token: 'replacement' })));
    expect(await pending).toMatchObject({ message: expect.stringContaining('unfinished uploads') });
    expect(oauth.secret(connection).accessToken).toBe('old');
  });
});
