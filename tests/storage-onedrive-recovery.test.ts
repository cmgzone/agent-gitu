import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudStorage } from '../src/storage/cloud.js';
import type { StorageOAuth } from '../src/storage/oauth.js';
import type { StorageConnection } from '../src/storage/types.js';
const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function source() { const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-onedrive-recovery-')); roots.push(root); const file = path.join(root, 'source'); writeFileSync(file, 'abcdef'); return file; }
const connection: StorageConnection = { id: 'onedrive', companyId: 'company', name: 'Files', provider: 'onedrive', config: { folder: 'folder' }, permissions: ['upload'], createdAt: '' };
const oauth = { token: async () => 'fixture-token' } as unknown as StorageOAuth;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const receipt = (hashes = { sha256Hash: createHash('sha256').update('abcdef').digest('hex') }) => ({ id: 'completed', name: 'result', size: 6, file: { hashes } });
describe('OneDrive stable upload destinations', () => {
  it('saves the destination before session creation and reuses it after a lost response', async () => {
    const file = source(); let checkpoint: Record<string, unknown> = {}, starts = 0, destination = '';
    const provider = vi.fn(async (input: string, init: RequestInit) => {
      const url = new URL(input);
      if (url.pathname.endsWith('/folder')) return json({ id: 'folder', name: 'Folder', folder: {} });
      if (url.pathname.endsWith('/createUploadSession')) {
        const args = JSON.parse(String(init.body));
        expect(checkpoint).toMatchObject({ destination: args.item.name, folder: 'folder', size: 6, offset: 0 });
        expect(args.item['@microsoft.graph.conflictBehavior']).toBe('fail');
        if (!destination) destination = args.item.name; expect(args.item.name).toBe(destination);
        if (++starts === 1) throw new Error('Session response lost');
        return json({ uploadUrl: 'https://upload.example/session' });
      }
      expect(new Headers(init.headers).has('authorization')).toBe(false);
      expect(new Headers(init.headers).get('content-range')).toBe('bytes 0-5/6');
      return json(receipt(), 201);
    });
    const adapter = () => new CloudStorage(connection, oauth, provider as typeof fetch), save = (value: Record<string, unknown>) => checkpoint = value;
    await expect(adapter().upload(file, 'result', checkpoint, save)).rejects.toThrow('Session response lost');
    expect((await adapter().upload(file, 'result', checkpoint, save)).id).toBe('completed');
    expect(starts).toBe(2);
  });
  it('checks for a completed file before restarting an expired missing session at the same destination', async () => {
    const file = source(); let checkpoint: Record<string, unknown> = { url: 'https://upload.example/expired', destination: 'fixed', offset: 3, folder: 'folder', size: 6 };
    const requests: string[] = [];
    const provider = vi.fn(async (input: string, init: RequestInit) => {
      const url = new URL(input); requests.push(url.pathname);
      if (url.pathname.endsWith('/folder')) return json({ id: 'folder', folder: {} });
      if (url.pathname.endsWith('/expired') || url.pathname.endsWith(':/fixed')) return json({}, 404);
      if (url.pathname.endsWith('/createUploadSession')) { expect(checkpoint).toMatchObject({ destination: 'fixed', offset: 0 }); expect(JSON.parse(String(init.body)).item.name).toBe('fixed'); return json({ uploadUrl: 'https://upload.example/new' }); }
      expect(new Headers(init.headers).get('content-range')).toBe('bytes 0-5/6');
      return json(receipt(), 201);
    });
    expect((await new CloudStorage(connection, oauth, provider as typeof fetch).upload(file, 'result', checkpoint, value => checkpoint = value)).id).toBe('completed');
    expect(requests.findIndex(value => value.endsWith(':/fixed'))).toBeLessThan(requests.findIndex(value => value.endsWith('/createUploadSession')));
  });
  it('reconciles lost completion responses and refuses conflicting stronger hashes', async () => {
    const file = source(), checkpoint = { url: 'https://upload.example/expired', destination: 'fixed', offset: 6 };
    let conflicting = false;
    const provider = vi.fn(async (input: string) => {
      const url = new URL(input);
      if (url.pathname.endsWith('/folder')) return json({ id: 'folder', folder: {} });
      if (url.pathname.endsWith('/expired')) return json({}, 410);
      expect(url.pathname.endsWith(':/fixed')).toBe(true);
      return json(receipt({ sha256Hash: conflicting ? '0'.repeat(64) : createHash('sha256').update('abcdef').digest('hex'), sha1Hash: createHash('sha1').update('abcdef').digest('hex') } as { sha256Hash: string }));
    });
    const adapter = () => new CloudStorage(connection, oauth, provider as typeof fetch);
    expect((await adapter().upload(file, 'result', checkpoint, () => {})).id).toBe('completed');
    conflicting = true;
    await expect(adapter().upload(file, 'result', checkpoint, () => {})).rejects.toThrow('could not be verified');
  });
  it('rejects changed source or folder before submission and makes expired cancellation idempotent', async () => {
    const file = source(), provider = vi.fn(async () => json({}, 410));
    const adapter = new CloudStorage(connection, oauth, provider as typeof fetch);
    await expect(adapter.upload(file, 'result', { size: 7 }, () => {})).rejects.toThrow('source size');
    expect(provider).not.toHaveBeenCalled();
    await adapter.cancel({ url: 'https://upload.example/session' });
    expect(provider.mock.calls[0]).toEqual(['https://upload.example/session', expect.objectContaining({ method: 'DELETE' })]);
    expect(new Headers((provider.mock.calls[0] as unknown as [string, RequestInit])[1].headers).has('authorization')).toBe(false);
  });
});
