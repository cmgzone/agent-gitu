import { openSync, readSync, closeSync } from 'node:fs';
export function readFilePrefix(file: string, maxBytes: number): Buffer {
  const fd = openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(maxBytes);
    const count = readSync(fd, buffer, 0, maxBytes, 0);
    return buffer.subarray(0, count);
  } finally {
    closeSync(fd);
  }
}
