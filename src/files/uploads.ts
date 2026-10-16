import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, statSync, rmSync, renameSync, createReadStream, openSync, writeSync, closeSync, statfsSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import type { IncomingMessage } from 'node:http';

export const UPLOAD_CHUNK_BYTES = 5 * 1024 * 1024;
export interface UploadedFile {
  id: string;
  scope: string;
  name: string;
  mime: string;
  size: number;
  offset: number;
  state: 'uploading' | 'ready';
  checksum?: string;
  createdAt: string;
  updatedAt: string;
}
/** File bytes never enter JSON or SQLite. Metadata and acknowledged offsets do. */
export class UploadStore {
  private db: DatabaseSync;
  private locks = new Set<string>();
  private operations = new Map<string, { abort: AbortController; finished: Promise<void>; finish: () => void }>();
  constructor(readonly root: string) {
    mkdirSync(root, { recursive: true });
    this.db = new DatabaseSync(path.join(root, 'uploads.sqlite'));
    this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS uploads(id TEXT PRIMARY KEY,scope TEXT NOT NULL,data TEXT NOT NULL);');
  }
  close(): void {
    this.db.close();
  }
  private save(file: UploadedFile): void {
    this.db.prepare('INSERT INTO uploads VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(file.id, file.scope, JSON.stringify(file));
  }
  private begin(id: string): { abort: AbortController; finished: Promise<void>; finish: () => void } {
    if (this.locks.has(id)) throw new Error('Upload is busy.');
    this.locks.add(id);
    let resolve!: () => void;
    const operation = { abort: new AbortController(), finished: new Promise<void>(done => { resolve = done; }), finish: () => {
      this.locks.delete(id);
      this.operations.delete(id);
      resolve();
    } };
    this.operations.set(id, operation);
    return operation;
  }
  get(id: string, scope: string): UploadedFile | undefined {
    const row = this.db.prepare('SELECT data FROM uploads WHERE id=? AND scope=?').get(id, scope);
    return row ? (JSON.parse(String(row['data'])) as UploadedFile) : undefined;
  }
  list(scope: string): UploadedFile[] {
    return this.db
      .prepare('SELECT data FROM uploads WHERE scope=?')
      .all(scope)
      .map((row) => JSON.parse(String(row['data'])) as UploadedFile);
  }
  filePath(file: UploadedFile): string {
    if (!/^file-[a-f0-9-]{36}$/.test(file.id)) throw new Error('Invalid file id.');
    return path.join(this.root, file.id + (file.state === 'ready' ? '.bin' : '.part'));
  }
  create(scope: string, input: { name: unknown; mime?: unknown; size: unknown; checksum?: unknown }, limit: number | null): UploadedFile {
    if (typeof input.size !== 'number' || !Number.isSafeInteger(input.size) || input.size < 0) throw new Error('Invalid file size.');
    if (limit !== null && input.size > limit) throw new Error('File exceeds your selected file-size limit.');
    const disk = statfsSync(this.root);
    if (input.size > Number(disk.bavail) * Number(disk.bsize)) throw new Error('Not enough disk space for this upload.');
    const name =
      path
        .basename(String(input.name ?? 'file').replace(/\\/g, '/'))
        .replace(/[\x00-\x1f]/g, '') || 'file';
    const checksum = input.checksum === undefined ? undefined : String(input.checksum);
    if (checksum && !/^[a-f0-9]{64}$/i.test(checksum)) throw new Error('Invalid SHA-256 checksum.');
    const now = new Date().toISOString();
    const file: UploadedFile = {
      id: `file-${randomUUID()}`,
      scope,
      name,
      mime: String(input.mime ?? 'application/octet-stream'),
      size: input.size,
      offset: 0,
      state: 'uploading',
      checksum,
      createdAt: now,
      updatedAt: now,
    };
    closeSync(openSync(this.filePath(file), 'wx', 0o600));
    this.save(file);
    return file;
  }
  async append(id: string, scope: string, offset: number, request: IncomingMessage, limit: number | null): Promise<UploadedFile> {
    const file = this.get(id, scope);
    if (!file) throw new Error('Upload not found.');
    if (file.state !== 'uploading' || offset !== file.offset) throw new Error('Upload offset changed. Refresh upload status to resume.');
    if (limit !== null && file.size > limit) throw new Error('File exceeds your selected file-size limit.');
    if (this.locks.has(id)) throw new Error('Upload is already receiving a chunk.');
    const operation = this.begin(id);
    const interrupt = () => request.destroy(new Error('Upload cancelled.'));
    operation.abort.signal.addEventListener('abort', interrupt, { once: true });
    let fd: number | undefined;
    let received = 0;
    try {
      fd = openSync(this.filePath(file), 'r+');
      for await (const value of request) {
        operation.abort.signal.throwIfAborted();
        const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
        if (file.offset + received + chunk.length > file.size) throw new Error('Invalid upload chunk size.');
        writeSync(fd, chunk, 0, chunk.length, file.offset + received);
        received += chunk.length;
      }
      operation.abort.signal.throwIfAborted();
      if (!received) throw new Error('Upload chunk is empty.');
      file.offset += received;
      file.updatedAt = new Date().toISOString();
      this.save(file);
      return file;
    } finally {
      if (fd !== undefined) closeSync(fd);
      operation.abort.signal.removeEventListener('abort', interrupt);
      operation.finish();
    }
  }
  async finalize(id: string, scope: string, limit: number | null, expectedChecksum?: unknown): Promise<UploadedFile> {
    const file = this.get(id, scope);
    if (!file) throw new Error('Upload not found.');
    const expected = expectedChecksum === undefined ? undefined : String(expectedChecksum).toLowerCase();
    if (expected !== undefined && !/^[a-f0-9]{64}$/.test(expected)) throw new Error('Invalid SHA-256 checksum.');
    if (expected && file.checksum && file.checksum.toLowerCase() !== expected) throw new Error('The selected file does not match the original upload checksum.');
    if (file.state === 'ready') return file;
    const published = path.join(this.root, file.id + '.bin');
    if (!existsSync(this.filePath(file)) && existsSync(published)) {
      renameSync(published, this.filePath(file));
    }
    if (this.locks.has(id)) throw new Error('Upload is busy.');
    if (file.offset !== file.size || statSync(this.filePath(file)).size !== file.size) throw new Error('Upload is incomplete.');
    if (limit !== null && file.size > limit) throw new Error('File exceeds your selected file-size limit.');
    const operation = this.begin(id);
    try {
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(this.filePath(file), { signal: operation.abort.signal })) hash.update(chunk);
      operation.abort.signal.throwIfAborted();
      const checksum = hash.digest('hex');
      if ((file.checksum && checksum !== file.checksum.toLowerCase()) || (expected && checksum !== expected)) throw new Error('Upload checksum does not match.');
      renameSync(this.filePath(file), path.join(this.root, file.id + '.bin'));
      file.state = 'ready';
      file.checksum = checksum;
      file.updatedAt = new Date().toISOString();
      this.save(file);
      return file;
    } finally {
      operation.finish();
    }
  }
  async cancel(id: string, scope: string): Promise<void> {
    const file = this.get(id, scope);
    if (!file) return;
    if (file.state === 'ready') throw new Error('Only an unfinished upload can be cancelled.');
    const operation = this.operations.get(id);
    if (operation) {
      operation.abort.abort();
      await operation.finished;
    }
    const current = this.get(id, scope);
    if (!current) return;
    if (current.state === 'ready') throw new Error('Only an unfinished upload can be cancelled.');
    if (this.locks.has(id)) throw new Error('Upload cancellation is pending.');
    rmSync(this.filePath(file), { force: true });
    this.db.prepare('DELETE FROM uploads WHERE id=? AND scope=?').run(id, scope);
  }
  async importFile(scope: string, input: { name: string; mime?: string; sourcePath: string }, limit: number | null): Promise<UploadedFile> {
    const file = this.create(scope, { name: input.name, mime: input.mime, size: statSync(input.sourcePath).size }, limit);
    copyFileSync(input.sourcePath, this.filePath(file));
    file.offset = file.size;
    this.save(file);
    return this.finalize(file.id, scope, limit);
  }
}
