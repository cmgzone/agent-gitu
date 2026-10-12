import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Readable, PassThrough } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { UploadStore, UPLOAD_CHUNK_BYTES } from '../src/files/uploads.js';

const stores: UploadStore[] = [],
  roots: string[] = [];
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-upload-'));
  roots.push(root);
  const store = new UploadStore(root);
  stores.push(store);
  return store;
}
const request = (bytes: Buffer) => Readable.from([bytes]) as unknown as IncomingMessage;
afterEach(() => {
  for (const s of stores.splice(0)) s.close();
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
});
describe('Resumable file uploads', () => {
  it('verifies a client checksum when finalizing an older upload and never publishes mismatched bytes', async () => {
    const store = fixture(), file = store.create('company', { name: 'legacy.bin', size: 8 }, null);
    await store.append(file.id, 'company', 0, request(Buffer.from('original')), null);
    const wrong = createHash('sha256').update('changed!').digest('hex');
    await expect(store.finalize(file.id, 'company', null, wrong)).rejects.toThrow('checksum does not match');
    expect(store.get(file.id, 'company')?.state).toBe('uploading');
    const checksum = createHash('sha256').update('original').digest('hex');
    expect((await store.finalize(file.id, 'company', null, checksum)).checksum).toBe(checksum);
    await expect(store.finalize(file.id, 'company', null, wrong)).rejects.toThrow('original upload checksum');
  });
  it('interrupts a receiving upload before removing its bytes and protects other scopes', async () => {
    const s = fixture(), file = s.create('company-a', { name: 'file.bin', size: 100 }, null), incoming = new PassThrough();
    const pending = s.append(file.id, 'company-a', 0, incoming as unknown as IncomingMessage, null).catch(error => error);
    incoming.write(Buffer.from('partial'));
    await s.cancel(file.id, 'company-b');
    expect(incoming.destroyed).toBe(false);
    await s.cancel(file.id, 'company-a');
    expect((await pending).message).toMatch(/cancelled|aborted/i);
    expect(incoming.destroyed).toBe(true);
    expect(s.get(file.id, 'company-a')).toBeUndefined();
    expect(existsSync(s.filePath(file))).toBe(false);
  });
  it('transfers a video larger than 20 MB in bounded chunks with matching checksum', async () => {
    const s = fixture(),
      bytes = Buffer.alloc(21 * 1024 * 1024, 91),
      file = s.create('chat', { name: 'movie.mp4', mime: 'video/mp4', size: bytes.length }, null);
    for (let i = 0; i < bytes.length; i += UPLOAD_CHUNK_BYTES) await s.append(file.id, 'chat', i, request(bytes.subarray(i, i + UPLOAD_CHUNK_BYTES)), null);
    const result = await s.finalize(file.id, 'chat', null);
    expect(result.state).toBe('ready');
    expect(result.checksum).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(readFileSync(s.filePath(result)).equals(bytes)).toBe(true);
    expect(s.get(file.id, 'another-chat')).toBeUndefined();
  });
  it('persists offsets across restart and permits retry after an oversized chunk', async () => {
    const s = fixture(),
      file = s.create('chat', { name: 'unknown.filetype', size: 8 }, null);
    await s.append(file.id, 'chat', 0, request(Buffer.from('abcd')), null);
    const reopened = new UploadStore(s.root);
    stores.push(reopened);
    expect(reopened.get(file.id, 'chat')?.offset).toBe(4);
    await expect(reopened.append(file.id, 'chat', 0, request(Buffer.from('x')), null)).rejects.toThrow('offset');
    await expect(reopened.append(file.id, 'chat', 4, request(Buffer.from('too many')), null)).rejects.toThrow('size');
    await reopened.append(file.id, 'chat', 4, request(Buffer.from('efgh')), null);
    const ready = await reopened.finalize(file.id, 'chat', null);
    expect(readFileSync(reopened.filePath(ready)).toString()).toBe('abcdefgh');
  });
  it('enforces exact limits on creation, transfer, and finalization', async () => {
    const s = fixture();
    expect(() => s.create('chat', { name: 'file', size: 11 }, 10)).toThrow('limit');
    const file = s.create('chat', { name: 'file', size: 10 }, 10);
    await expect(s.append(file.id, 'chat', 0, request(Buffer.alloc(10)), 9)).rejects.toThrow('limit');
    await s.append(file.id, 'chat', 0, request(Buffer.alloc(10)), 10);
    await expect(s.finalize(file.id, 'chat', 9)).rejects.toThrow('limit');
    expect((await s.finalize(file.id, 'chat', 10)).state).toBe('ready');
  });
  it('never publishes incomplete or corrupted files and can cancel unfinished uploads', async () => {
    const s = fixture(),
      file = s.create('chat', { name: 'file', size: 2, checksum: 'a'.repeat(64) }, null);
    await expect(s.finalize(file.id, 'chat', null)).rejects.toThrow('incomplete');
    await s.append(file.id, 'chat', 0, request(Buffer.alloc(2)), null);
    await expect(s.finalize(file.id, 'chat', null)).rejects.toThrow('checksum');
    expect(s.get(file.id, 'chat')?.state).toBe('uploading');
    await s.cancel(file.id, 'chat');
    expect(s.get(file.id, 'chat')).toBeUndefined();
  });
});
