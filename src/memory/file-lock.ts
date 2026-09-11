import { closeSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from 'node:fs';
import path from 'node:path';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Asynchronous, non-blocking memory file lock.
 * Uses timer-based polling so the Node.js event loop, HTTP server, and SSE streams
 * are never blocked while waiting for lock acquisition.
 */
export async function withMemoryFileLock<T>(file: string, action: () => Promise<T> | T): Promise<T> {
  mkdirSync(path.dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  const deadline = Date.now() + 5_000;
  let fd: number;
  for (;;) {
    try {
      fd = openSync(lock, 'wx');
      break;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!['EEXIST', 'EPERM', 'EACCES', 'EBUSY'].includes(code ?? '')) throw error;
      try {
        const pid = Number(readFileSync(lock, 'utf8'));
        let abandoned = !pid && Date.now() - statSync(lock).mtimeMs > 30_000;
        if (Number.isInteger(pid) && pid > 0) {
          try {
            process.kill(pid, 0);
          } catch (e) {
            abandoned = (e as NodeJS.ErrnoException).code === 'ESRCH';
          }
        }
        if (abandoned) {
          unlinkSync(lock);
          continue;
        }
      } catch (e) {
        const readCode = (e as NodeJS.ErrnoException).code;
        if (!['ENOENT', 'EPERM', 'EACCES', 'EBUSY'].includes(readCode ?? '')) throw e;
      }
      if (Date.now() >= deadline) throw new Error(`Timed out waiting for memory lock: ${file}`);
      await delay(10);
    }
  }
  try {
    writeSync(fd, String(process.pid));
    return await action();
  } finally {
    closeSync(fd);
    for (let attempt = 0; ; attempt++) {
      try {
        unlinkSync(lock);
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (attempt >= 100 || !['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '')) throw error;
        await delay(10);
      }
    }
  }
}
