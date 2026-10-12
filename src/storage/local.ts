import { createReadStream, createWriteStream, existsSync, mkdirSync, realpathSync, statSync, statfsSync, readdirSync, renameSync, unlinkSync, linkSync, rmSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { StorageAdapter, StorageConnection, StorageItem, StorageRead, StorageOperation } from './types.js';
export class LocalStorage implements StorageAdapter {
  capabilities: StorageOperation[] = ['list', 'read', 'upload', 'mkdir', 'move', 'delete'];
  private root: string;
  constructor(connection: StorageConnection) {
    if (!connection.config['folder']) throw new Error('Choose a local storage folder.');
    if (!existsSync(connection.config['folder']) && !connection.permissions.some(p => p === 'upload' || p === 'mkdir')) throw new Error('The granted read-only storage folder does not exist.');
    mkdirSync(connection.config['folder'], { recursive: true });
    this.root = realpathSync(connection.config['folder']);
  }
  private resolve(id: string, create = false): string {
    const candidate = path.resolve(this.root, id || '.'),
      relative = path.relative(this.root, candidate);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('File is outside the granted storage folder.');
    const real = realpathSync(create ? path.dirname(candidate) : candidate),
      rel = path.relative(this.root, real);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('File is outside the granted storage folder.');
    return candidate;
  }
  private item(target: string): StorageItem {
    const info = statSync(target);
    return { id: path.relative(this.root, target).replace(/\\/g, '/'), name: path.basename(target), size: info.isFile() ? info.size : undefined, folder: info.isDirectory() };
  }
  private availableName(folder: string, name: string): string {
    const base = path.basename(name.replace(/\\/g, '/')) || 'file';
    let target = path.join(folder, base);
    if (existsSync(target)) {
      const ext = path.extname(base);
      target = path.join(folder, path.basename(base, ext) + '-' + randomUUID().slice(0, 8) + ext);
    }
    return target;
  }
  async list(folder = ''): Promise<StorageItem[]> {
    const directory = this.resolve(folder);
    return readdirSync(directory)
      .slice(0, 1000)
      .flatMap((name) => {
        try {
          return [this.item(this.resolve(path.relative(this.root, path.join(directory, name))))];
        } catch {
          return [];
        }
      });
  }
  async read(id: string): Promise<StorageRead> {
    const target = this.resolve(id),
      item = this.item(target);
    if (item.folder) throw new Error('Choose a file.');
    return { item, stream: createReadStream(target) };
  }
  async metadata(id: string): Promise<StorageItem> {
    return this.item(this.resolve(id));
  }
  async quota() {
    const v = statfsSync(this.root);
    return { totalBytes: v.blocks * v.bsize, availableBytes: v.bavail * v.bsize, usedBytes: (v.blocks - v.bfree) * v.bsize };
  }
  async cancel(checkpoint: Record<string, unknown>): Promise<void> {
    if (checkpoint['target']) rmSync(this.resolve(String(checkpoint['target']), true) + '.gitu-part', { force: true });
  }
  async upload(
    file: string,
    name: string,
    checkpoint: Record<string, unknown> = {},
    save: (next: Record<string, unknown>) => void = () => {},
    signal?: AbortSignal,
  ): Promise<StorageItem> {
    const target = checkpoint['target'] ? this.resolve(String(checkpoint['target']), true) : this.availableName(this.root, name),
      temporary = target + '.gitu-part';
    this.resolve(path.relative(this.root, target), true);
    const size = statSync(file).size,
      offset = existsSync(temporary) ? statSync(temporary).size : 0;
    if (offset > size) throw new Error('Local upload checkpoint is invalid.');
    save({ target: path.relative(this.root, target), offset });
    if (!existsSync(target)) {
      if (offset < size || !existsSync(temporary))
        await pipeline(createReadStream(file, { start: offset }), createWriteStream(temporary, { flags: offset ? 'a' : 'wx', mode: 0o600 }), { signal });
      linkSync(temporary, target);
    } else if (!existsSync(temporary) || statSync(target).ino !== statSync(temporary).ino) throw new Error('Destination name changed during transfer.');
    save({ target: path.relative(this.root, target), offset: size });
    rmSync(temporary, { force: true });
    return this.item(target);
  }
  async mkdir(name: string, parent = ''): Promise<StorageItem> {
    const folder = this.resolve(parent),
      target = this.availableName(folder, name);
    this.resolve(path.relative(this.root, target), true);
    mkdirSync(target);
    return this.item(target);
  }
  async move(id: string, name: string, parent = ''): Promise<StorageItem> {
    const target = this.availableName(this.resolve(parent), name);
    this.resolve(path.relative(this.root, target), true);
    renameSync(this.resolve(id), target);
    return this.item(target);
  }
  async remove(id: string): Promise<void> {
    const target = this.resolve(id);
    if (statSync(target).isDirectory()) throw new Error('Directory deletion is not supported.');
    unlinkSync(target);
  }
}
