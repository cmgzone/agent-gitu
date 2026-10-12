import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudStorage } from '../src/storage/cloud.js';
import type { StorageOAuth } from '../src/storage/oauth.js';
import type { StorageConnection } from '../src/storage/types.js';

const roots: string[] = [];
const sourceFile = (content = 'abcdef') => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-drive-recovery-'));
  roots.push(root);
  const source = path.join(root, 'source'); writeFileSync(source, content);
  return source;
};
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const connection: StorageConnection = { id: 'drive', companyId: 'company', name: 'Drive', provider: 'google-drive', config: { folder: 'folder' }, permissions: ['upload'], createdAt: '2026-10-12' };
const oauth = { token: async () => 'fixture-token' } as unknown as StorageOAuth;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const folder = () => json({ id: 'folder', name: 'folder', mimeType: 'application/vnd.google-apps.folder' });
const receipt = (content = 'abcdef', extra = {}) => ({ id: 'reserved', name: 'result', size: String(Buffer.byteLength(content)), parents: ['folder'], md5Checksum: createHash('md5').update(content).digest('hex'), ...extra });
const adapter = (fetcher: unknown) => new CloudStorage(connection, oauth, fetcher as typeof fetch);

describe('Drive upload recovery with a stable file ID', () => {
  it('persists the provider ID before creating a session and reuses it after a lost creation response', async () => {
    const source = sourceFile();
    let checkpoint: Record<string, unknown> = {}, starts = 0, generated = 0;
    const fetcher = vi.fn(async (input: string, init: RequestInit) => {
      const url = new URL(input);
      if (url.pathname.endsWith('/folder')) return folder();
      if (url.pathname.endsWith('/generateIds')) { generated++; return json({ ids: ['reserved'] }); }
      if (url.pathname.endsWith('/reserved')) return json({}, 404);
      if (init.method === 'POST') {
        expect(checkpoint).toMatchObject({ fileId: 'reserved', parentId: 'folder', offset: 0 });
        expect(JSON.parse(String(init.body))).toMatchObject({ id: 'reserved', parents: ['folder'] });
        if (++starts === 1) throw new Error('Session response lost');
        return new Response('', { headers: { location: 'https://upload.googleapis.com/session' } });
      }
      expect(Buffer.from(init.body as Buffer).toString()).toBe('abcdef');
      return json(receipt());
    });
    const save = (value: Record<string, unknown>) => { checkpoint = value; };
    await expect(adapter(fetcher).upload(source, 'result', checkpoint, save)).rejects.toThrow('Session response lost');
    expect((await adapter(fetcher).upload(source, 'result', checkpoint, save)).id).toBe('reserved');
    expect(generated).toBe(1);
    expect(starts).toBe(2);
  });
  it('reconciles a completed file after its session expires without submitting any new content', async () => {
    const source = sourceFile(), checkpoint = { fileId: 'reserved', parentId: 'folder', url: 'https://upload.googleapis.com/expired', offset: 6 };
    const fetcher = vi.fn(async (input: string, init: RequestInit) => {
      if (new URL(input).pathname.endsWith('/folder')) return folder();
      if (input.includes('/expired')) { expect(init.body).toHaveLength(0); return json({}, 404); }
      expect(init.method).not.toBe('POST');
      return json(receipt());
    });
    expect((await adapter(fetcher).upload(source, 'result', checkpoint, () => {})).id).toBe('reserved');
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('restarts a missing expired upload at byte zero using the same reserved ID', async () => {
    const source = sourceFile();
    let checkpoint: Record<string, unknown> = { fileId: 'reserved', parentId: 'folder', url: 'https://upload.googleapis.com/expired', offset: 3 };
    const fetcher = vi.fn(async (input: string, init: RequestInit) => {
      if (new URL(input).pathname.endsWith('/folder')) return folder();
      if (input.includes('/expired') || new URL(input).pathname.endsWith('/reserved')) return json({}, 404);
      if (init.method === 'POST') {
        expect(JSON.parse(String(init.body)).id).toBe('reserved');
        expect(checkpoint['offset']).toBe(0);
        return new Response('', { headers: { location: 'https://upload.googleapis.com/restarted' } });
      }
      expect(new Headers(init.headers).get('content-range')).toBe('bytes 0-5/6');
      expect(Buffer.from(init.body as Buffer).toString()).toBe('abcdef');
      return json(receipt());
    });
    expect((await adapter(fetcher).upload(source, 'result', checkpoint, value => { checkpoint = value; })).size).toBe(6);
    expect(checkpoint).toMatchObject({ fileId: 'reserved', parentId: 'folder', offset: 6 });
  });
  it('resumes only the missing bytes reported by a live session', async () => {
    const source = sourceFile(), checkpoint = { fileId: 'reserved', parentId: 'folder', url: 'https://upload.googleapis.com/session', offset: 0 };
    const fetcher = vi.fn(async (input: string, init: RequestInit) => {
      if (new URL(input).pathname.endsWith('/folder')) return folder();
      if (new Headers(init.headers).get('content-range') === 'bytes */6') return new Response('', { status: 308, headers: { range: 'bytes=0-2' } });
      expect(new Headers(init.headers).get('content-range')).toBe('bytes 3-5/6');
      expect(Buffer.from(init.body as Buffer).toString()).toBe('def');
      return json(receipt());
    });
    expect((await adapter(fetcher).upload(source, 'result', checkpoint, () => {})).size).toBe(6);
  });
  it('reconciles a competing completion on the same ID after a creation conflict', async () => {
    const source = sourceFile(), checkpoint = { fileId: 'reserved', parentId: 'folder', offset: 0 };
    let committed = false;
    const fetcher = vi.fn(async (input: string, init: RequestInit) => {
      if (new URL(input).pathname.endsWith('/folder')) return folder();
      if (init.method === 'POST') { committed = true; return json({}, 409); }
      expect(init.method).not.toBe('PUT');
      return committed ? json(receipt()) : json({}, 404);
    });
    expect((await adapter(fetcher).upload(source, 'result', checkpoint, () => {})).id).toBe('reserved');
  });
  it('rejects mismatched contents, moved provider files and unscoped legacy sessions', async () => {
    const source = sourceFile(), checkpoint = { fileId: 'reserved', parentId: 'folder', offset: 0 };
    for (const value of [receipt('xxxxxx'), receipt('abcdef', { sha256Checksum: 'mismatched-strong-hash' }), receipt('abcdef', { parents: ['outside'] }), receipt('abcdef', { trashed: true })]) {
      const fetcher = vi.fn(async (input: string, init: RequestInit) => {
        expect(init.method).not.toBe('POST');
        return new URL(input).pathname.endsWith('/folder') ? folder() : json(value);
      });
      await expect(adapter(fetcher).upload(source, 'result', checkpoint, () => {})).rejects.toThrow('could not be verified');
    }
    const fetcher = vi.fn(async () => folder());
    await expect(adapter(fetcher).upload(source, 'result', { url: 'https://upload.googleapis.com/legacy' }, () => {})).rejects.toThrow('legacy Drive upload');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('reconciles an empty file after its completion response is lost', async () => {
    const source = sourceFile('');
    let checkpoint: Record<string, unknown> = {}, submitted = false, puts = 0;
    const fetcher = vi.fn(async (input: string, init: RequestInit) => {
      const url = new URL(input);
      if (url.pathname.endsWith('/folder')) return folder();
      if (url.pathname.endsWith('/generateIds')) return json({ ids: ['reserved'] });
      if (url.pathname.endsWith('/reserved')) return json(receipt(''));
      if (init.method === 'POST') return new Response('', { headers: { location: 'https://upload.googleapis.com/empty' } });
      if (submitted) return json({}, 404);
      puts++; submitted = true; throw new Error('Completion response lost');
    });
    const save = (value: Record<string, unknown>) => { checkpoint = value; };
    await expect(adapter(fetcher).upload(source, 'result', checkpoint, save)).rejects.toThrow('Completion response lost');
    expect((await adapter(fetcher).upload(source, 'result', checkpoint, save)).size).toBe(0);
    expect(puts).toBe(1);
  });
});
