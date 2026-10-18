import { closeSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const TOLERABLE_ERRORS = ['EEXIST', 'EPERM', 'EACCES', 'EBUSY'];
/** Age after which an unparseable/empty lock body counts as abandoned. */
const UNPARSEABLE_GRACE_MS = 30_000;

/** Lock body is "pid|token". The random token distinguishes a live holder
 * from a dead previous incarnation of a recycled pid, and release verifies
 * it so a thief never releases (and the executor never re-releases) a lock
 * that now belongs to another waiter. */
const heldClaims = new Map<string, string>();

/** In-process acquisitions serialize per file: two async callers polling the
 * same stale lock must not both unlink-and-take it and run concurrently. */
const acquisitionChains = new Map<string, Promise<void>>();

function isStaleHolder(lock: string, body: string): boolean {
  const separator = body.indexOf('|');
  const pid = Number(separator < 0 ? body : body.slice(0, separator));
  const token = separator < 0 ? '' : body.slice(separator + 1);
  if (!(Number.isInteger(pid) && pid > 0) || !token) {
    // Unparseable/empty lock body (e.g. a pre-token lock file): judge
    // abandonment by age only.
    try { return Date.now() - statSync(lock).mtimeMs > UNPARSEABLE_GRACE_MS; } catch { return false; }
  }
  if (pid === process.pid) {
    // A live holder in this process cannot coexist with a queued acquirer
    // (serialized above), so "ours but token unheld" means a dead previous
    // incarnation of a recycled pid — stale now.
    return heldClaims.get(lock) !== token;
  }
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ESRCH';
  }
}

/** Remove a stale lock so the caller can retry creation. The body is
 * re-read immediately before unlinking, so a waiter acting on a slower
 * observation never removes a fresh lock a faster waiter created between
 * the two reads. */
function stealStaleLock(lock: string): boolean {
  let body: string;
  try { body = readFileSync(lock, 'utf8'); } catch { return false; }
  if (!isStaleHolder(lock, body)) return false;
  try {
    if (readFileSync(lock, 'utf8') !== body) return false;
    unlinkSync(lock);
  } catch { return false; }
  return true;
}

async function acquireLock(lock: string): Promise<number> {
  const deadline = Date.now() + 5_000;
  const body = `${process.pid}|${randomBytes(16).toString('hex')}`;
  for (;;) {
    let fd: number | undefined;
    try {
      fd = openSync(lock, 'wx');
      try {
        writeSync(fd, body);
      } catch (error) {
        try { closeSync(fd); } catch { /* already closed */ }
        throw error;
      }
      heldClaims.set(lock, body.slice(body.indexOf('|') + 1));
      return fd;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!TOLERABLE_ERRORS.includes(code ?? '')) throw error;
      if (fd !== undefined) { try { closeSync(fd); } catch { /* already closed */ } }
    }
    if (!stealStaleLock(lock)) {
      if (Date.now() >= deadline) throw new Error(`Timed out waiting for memory lock: ${lock}`);
      await delay(10);
    }
  }
}

/** Unlink only while the file still carries this invocation's token: a
 * re-validated thief must never be released, and cleanup must never make a
 * completed action look like a failure (the old code threw ENOENT from its
 * `finally`, telling callers that a successful write had failed). */
async function releaseLock(lock: string, fd: number): Promise<void> {
  const token = heldClaims.get(lock);
  heldClaims.delete(lock);
  closeSync(fd);
  if (token === undefined) return;
  for (let attempt = 0; ; attempt++) {
    try {
      const body = readFileSync(lock, 'utf8');
      const separator = body.indexOf('|');
      if ((separator < 0 ? '' : body.slice(separator + 1)) !== token) return;
      unlinkSync(lock);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return; // Stolen elsewhere: nothing left to free.
      if (attempt >= 100 || !['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '')) return;
      await delay(10);
    }
  }
}

/**
 * Asynchronous, non-blocking memory file lock.
 * Uses timer-based polling so the Node.js event loop, HTTP server, and SSE streams
 * are never blocked while waiting for lock acquisition.
 */
export async function withMemoryFileLock<T>(file: string, action: () => Promise<T> | T): Promise<T> {
  mkdirSync(path.dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  let run: Promise<T> | undefined;
  // Snapshot the previous holder first; later callers serialize behind
  // `gate` once this acquisition is registered.
  const chain = (acquisitionChains.get(lock) ?? Promise.resolve()).catch(() => {});
  let release!: () => void;
  const gate = new Promise<void>((resolver) => {
    release = resolver;
  });
  // The chain uses `gate`, which always resolves (its releaser runs in the
  // holder's finally), so one failed holder can never cancel or deadlock
  // the queue behind it.
  acquisitionChains.set(lock, gate);
  run = (async () => {
    await chain;
    let fd: number | undefined;
    try {
      fd = await acquireLock(lock);
      return await action();
    } finally {
      if (fd !== undefined) await releaseLock(lock, fd);
      release();
    }
  })();
  await gate;
  return await run!;
}
