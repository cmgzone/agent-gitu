import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/** Provider receipts are checked from bounded streams, never from model context. */
export async function storageFileHashes(file: string): Promise<{ md5: string; sha1: string; sha256: string; quickXor: string; dropbox: string }> {
  const md5 = createHash('md5'), sha1 = createHash('sha1'), sha256 = createHash('sha256'), dropbox = createHash('sha256');
  const quick = Buffer.alloc(20);
  let bit = 0, length = 0, block = createHash('sha256'), blockSize = 0;
  for await (const value of createReadStream(file, { highWaterMark: 1024 * 1024 })) {
    const bytes = value as Buffer;
    md5.update(bytes); sha1.update(bytes); sha256.update(bytes);
    for (const byte of bytes) {
      const index = bit >>> 3, shift = bit & 7;
      quick[index] = quick[index]! ^ ((byte << shift) & 255);
      if (shift) quick[(index + 1) % 20] = quick[(index + 1) % 20]! ^ (byte >>> (8 - shift));
      bit = (bit + 11) % 160;
    }
    length += bytes.length;
    let offset = 0;
    while (offset < bytes.length) {
      const count = Math.min(bytes.length - offset, 4 * 1024 * 1024 - blockSize);
      block.update(bytes.subarray(offset, offset + count)); blockSize += count; offset += count;
      if (blockSize === 4 * 1024 * 1024) { dropbox.update(block.digest()); block = createHash('sha256'); blockSize = 0; }
    }
  }
  if (blockSize) dropbox.update(block.digest());
  const size = Buffer.alloc(8); size.writeBigUInt64LE(BigInt(length));
  for (let i = 0; i < 8; i++) quick[12 + i] = quick[12 + i]! ^ size[i]!;
  return { md5: md5.digest('hex'), sha1: sha1.digest('hex'), sha256: sha256.digest('hex'), quickXor: quick.toString('base64'), dropbox: dropbox.digest('hex') };
}
