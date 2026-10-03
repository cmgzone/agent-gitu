import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const pause = new Int32Array(new SharedArrayBuffer(4));

function storageError(action: 'read' | 'save'): Error {
  return new Error(`Saved connection storage could not ${action === 'read' ? 'be read' : 'be updated'}. Existing files were preserved; check disk space and storage permissions or restore a protected backup.`);
}

/** Never interpret unreadable or damaged storage as an empty credential store.
 * Backups have the same restricted permissions as the primary file. */
export function readCredentialFile<T>(file: string, decode: (text: string) => T): T | undefined {
  let failed = false;
  for (const candidate of [file, `${file}.bak`]) {
    try {
      return decode(fs.readFileSync(candidate, 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failed = true;
    }
  }
  // Do not include JSON parser errors: their messages can contain secret text.
  if (failed) throw storageError('read');
  return undefined;
}

export function readCredentialJson<T>(file: string, validate: (value: unknown) => T): T | undefined {
  return readCredentialFile(file, (text) => validate(JSON.parse(text)));
}

/** SQLite is only a process-safe mutex; no credentials are stored in it.
 * Its write lock is released automatically if a writer crashes. */
export function withCredentialFileLock<T>(file: string, action: () => T): T {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(`${file}.lock.sqlite`);
    db.exec('PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE');
  } catch {
    db?.close();
    throw storageError('save');
  }
  try {
    const result = action();
    db.exec('COMMIT');
    return result;
  } finally {
    // Closing rolls back an unfinished lock transaction. The actual data file
    // is committed atomically and does not depend on a SQLite transaction.
    db.close();
  }
}

function atomicReplace(file: string, text: string): void {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  let fd: number | undefined;
  try {
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, text, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    for (let attempt = 0; ; attempt++) {
      try {
        fs.renameSync(temporary, file);
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (attempt >= 4 || !['EPERM', 'EBUSY', 'EACCES'].includes(code ?? '')) throw error;
        Atomics.wait(pause, 0, 0, 10 * 2 ** attempt);
      }
    }
    // Persist the rename on filesystems that support syncing directories.
    let directory: number | undefined;
    try {
      directory = fs.openSync(path.dirname(file), 'r');
      fs.fsyncSync(directory);
    } catch { /* Windows and some filesystems do not support directory fsync. */ }
    finally { if (directory !== undefined) fs.closeSync(directory); }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    try { fs.unlinkSync(temporary); } catch { /* already renamed, or not created */ }
  }
}

function commit(file: string, text: string, previous: string | undefined): void {
  try {
    if (previous !== undefined) atomicReplace(`${file}.bak`, previous);
    atomicReplace(file, text);
  } catch { throw storageError('save'); }
  // The primary has committed. A backup failure must not pretend that the
  // save failed; retain the previous good backup and report the limitation.
  try { atomicReplace(`${file}.bak`, text); }
  catch { console.warn('[gitu] Connection saved, but its protected backup could not be refreshed.'); }
}

export function updateCredentialJson<T>(file: string, validate: (value: unknown) => T, update: (current: T | undefined) => T | undefined): void {
  withCredentialFileLock(file, () => {
    const current = readCredentialJson(file, validate);
    const previous = current === undefined ? undefined : `${JSON.stringify(current, null, 2)}\n`;
    const next = update(current);
    if (next === undefined) return;
    commit(file, `${JSON.stringify(next, null, 2)}\n`, previous);
  });
}

/** For already encrypted DPAPI/AES records: keep their existing format. */
export function writeCredentialFile(file: string, text: string, validate: (value: string) => string = (value) => value): void {
  withCredentialFileLock(file, () => commit(file, text, readCredentialFile(file, validate)));
}
