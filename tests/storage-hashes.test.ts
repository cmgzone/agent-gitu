import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { storageFileHashes } from '../src/storage/hashes.js';

describe('storage completion receipts', () => {
  it('matches SHA and provider hashes across stream and Dropbox block boundaries', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-hashes-'));
    try {
      const bytes = Buffer.alloc(8 * 1024 * 1024 + 3);
      for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37) & 255;
      const file = path.join(root, 'source'); writeFileSync(file, bytes);
      const hashes = await storageFileHashes(file), hash = (algorithm: string, value: Buffer) => createHash(algorithm).update(value).digest();
      expect(hashes.md5).toBe(hash('md5', bytes).toString('hex'));
      expect(hashes.sha1).toBe(hash('sha1', bytes).toString('hex'));
      expect(hashes.sha256).toBe(hash('sha256', bytes).toString('hex'));
      const blocks = [bytes.subarray(0, 4 * 1024 * 1024), bytes.subarray(4 * 1024 * 1024, 8 * 1024 * 1024), bytes.subarray(8 * 1024 * 1024)];
      expect(hashes.dropbox).toBe(hash('sha256', Buffer.concat(blocks.map(b => hash('sha256', b)))).toString('hex'));
      // Independent bit-position formulation of Microsoft's QuickXor contract.
      const reference = Buffer.alloc(20);
      for (let i = 0; i < bytes.length; i++) for (let bit = 0; bit < 8; bit++) {
        if (bytes[i]! & (1 << bit)) { const position = (i * 11 + bit) % 160; reference[position >>> 3] = reference[position >>> 3]! ^ (1 << (position & 7)); }
      }
      const length = Buffer.alloc(8); length.writeBigUInt64LE(BigInt(bytes.length));
      for (let i = 0; i < 8; i++) reference[12 + i] = reference[12 + i]! ^ length[i]!;
      expect(hashes.quickXor).toBe(reference.toString('base64'));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('matches a small QuickXor vector and the empty Dropbox hash', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-hashes-'));
    try {
      const file = path.join(root, 'source'); writeFileSync(file, 'abc');
      const expected = Buffer.alloc(20); expected.set([97, 16, 195, 24]); expected[12] = 3;
      expect((await storageFileHashes(file)).quickXor).toBe(expected.toString('base64'));
      writeFileSync(file, '');
      expect((await storageFileHashes(file)).dropbox).toBe(createHash('sha256').digest('hex'));
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
