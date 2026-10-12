import { randomUUID, createHash } from 'node:crypto';
import { createWriteStream, mkdirSync, rmSync, statSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import path from 'node:path';
import type { CompanyStore } from '../company/store.js';
import type { McpManager } from '../mcp/client.js';
import { SecretVault } from '../connections/secret-vault.js';
import { LocalStorage } from './local.js';
import { S3Storage } from './s3.js';
import { CloudStorage } from './cloud.js';
import { CustomStorage } from './custom.js';
import { StorageOAuth, type StorageSecret } from './oauth.js';
import type { StorageConnection, StorageAdapter, StorageOperation, StorageItem, StorageFileReference, StorageReferenceView } from './types.js';
export interface StorageTransfer {
  id: string;
  companyId: string;
  connectionId: string;
  name: string;
  state: 'running' | 'done' | 'failed' | 'cancelled';
  size: number;
  offset: number;
  updatedAt: string;
  item?: StorageItem;
  direction?: 'upload' | 'download';
}
export class StorageRegistry {
  readonly oauth: StorageOAuth;
  private busy = new Set<string>();
  private stopped = false;
  private controllers = new Map<string, { abort: AbortController; finished: Promise<void>; finish: () => void }>();
  constructor(
    private readonly store: CompanyStore,
    private readonly vault: SecretVault,
  ) {
    this.oauth = new StorageOAuth(vault, fetch, (connection) => this.assertReconnectAllowed(connection));
  }
  list(companyId: string): StorageConnection[] {
    return this.store.list<StorageConnection>('storage', companyId);
  }
  references(companyId: string): StorageReferenceView[] {
    const connections = this.list(companyId);
    return this.store.list<StorageFileReference>('file-reference', companyId).map((reference) => {
      const connection = connections.find((c) => c.id === reference.connectionId);
      const grantChanged = Boolean(connection && reference.authority !== this.authority(connection));
      return { ...reference, connectionName: connection?.name, connected: Boolean(connection), grantChanged, readable: Boolean(connection && !grantChanged && this.capabilities(connection).includes('read')) };
    });
  }
  removeReference(companyId: string, id: string): boolean {
    if (!this.store.list<StorageFileReference>('file-reference', companyId).some((reference) => reference.id === id)) return false;
    this.store.removeResource('file-reference', id, companyId);
    return true;
  }
  get(companyId: string, id: string): StorageConnection {
    const c = this.list(companyId).find((c) => c.id === id);
    if (!c) throw new Error('Storage connection not found.');
    return c;
  }
  assertReconnectAllowed(c: StorageConnection): void {
    this.get(c.companyId, c.id);
    if (this.store.list<StorageTransfer>('transfer', c.companyId).some(t => t.connectionId === c.id && t.direction === 'download' && t.state === 'running'))
      throw new Error('Cancel active transfers before changing the storage account or folder.');
    if (this.store.list<StorageTransfer>('transfer', c.companyId).some((t) => t.connectionId === c.id && t.direction !== 'download' && ['running', 'failed'].includes(t.state)))
      throw new Error('Complete or cancel unfinished uploads before changing the storage account or folder.');
  }
  authority(c: StorageConnection): string {
    c = this.get(c.companyId, c.id);
    return createHash('sha256')
      .update(JSON.stringify([c.id, c.companyId, c.provider, Object.entries(c.config).sort(([a], [b]) => a.localeCompare(b)), this.oauth.secret(c).authorityId ?? 'legacy']))
      .digest('hex');
  }
  capabilities(c: StorageConnection): StorageOperation[] {
    const supported: StorageOperation[] = ['local', 's3'].includes(c.provider)
      ? ['list', 'read', 'upload', 'mkdir', 'move', 'delete']
      : ['google-drive', 'onedrive', 'dropbox'].includes(c.provider)
        ? ['list', 'read', 'upload', 'mkdir', 'move', 'delete', 'link']
        : (['list', 'read', 'upload', 'mkdir', 'move', 'delete', 'link'] as StorageOperation[]).filter((op) => !!c.config[op + (c.provider === 'mcp' ? 'Tool' : 'Path')]);
    return supported.filter((op) => c.permissions.includes(op));
  }
  save(companyId: string, input: Partial<StorageConnection>, secret?: StorageSecret): StorageConnection {
    if (secret) {
      const fields = ['accessToken', 'refreshToken', 'clientId', 'clientSecret', 'accessKeyId', 'secretAccessKey', 'sessionToken', 'expiresAt'];
      if (typeof secret !== 'object' || Array.isArray(secret) || Object.keys(secret).some(key => !fields.includes(key))) throw new Error('Invalid storage credential fields.');
      if (Object.entries(secret).some(([key, value]) => key === 'expiresAt' ? typeof value !== 'number' || !Number.isFinite(value) : typeof value !== 'string')) throw new Error('Invalid storage credential values.');
      if (!Object.keys(secret).length) secret = undefined;
    }
    const existing = input.id ? this.get(companyId, input.id) : undefined,
      provider = input.provider ?? existing?.provider;
    if (existing && provider !== existing.provider) throw new Error('Connect a new storage account to change providers.');
    if (existing && this.store.list<StorageTransfer>('transfer', companyId).some((t) => t.connectionId === existing.id && t.state === 'running'))
      throw new Error('Cancel active transfers before changing this connection.');
    if (!provider || !['local', 's3', 'google-drive', 'onedrive', 'dropbox', 'api', 'mcp'].includes(provider)) throw new Error('Choose a supported storage provider.');
    const config = input.config ?? existing?.config ?? {};
    if (Object.values(config).some((value) => typeof value !== 'string')) throw new Error('Storage configuration values must be strings.');
    if (Object.keys(config).some((key) => /secret|token|password|authorization|accesskey/i.test(key))) throw new Error('Credentials belong in the secure credential fields.');
    if (existing && (secret || JSON.stringify(Object.entries(config).sort()) !== JSON.stringify(Object.entries(existing.config).sort()))) this.assertReconnectAllowed(existing);
    const allowed: StorageOperation[] = ['list', 'read', 'upload', 'mkdir', 'move', 'delete', 'link'];
    const permissions = input.permissions ?? existing?.permissions ?? ['list', 'read', 'upload', 'mkdir'];
    if (!Array.isArray(permissions) || permissions.some((p) => !allowed.includes(p))) throw new Error('Invalid storage grants.');
    const c: StorageConnection = {
      id: existing?.id ?? `storage-${randomUUID()}`,
      companyId,
      name: String(input.name ?? existing?.name ?? provider)
        .trim()
        .slice(0, 120),
      provider,
      config,
      permissions: [...new Set(permissions)],
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    if (secret) this.oauth.save(c, { ...this.oauth.secret(c), ...secret, authorityId: randomUUID() });
    this.store.saveResource('storage', c.id, companyId, c);
    if (!this.capabilities(c).includes('upload') && this.store.get(companyId)?.defaultStorageId === c.id) this.store.update(companyId, { defaultStorageId: '' });
    return c;
  }
  adapter(c: StorageConnection, mcp?: McpManager): StorageAdapter {
    c = this.get(c.companyId, c.id);
    if (c.provider === 'local') return new LocalStorage(c);
    if (c.provider === 's3') return new S3Storage(c, this.oauth.secret(c));
    if (['google-drive', 'onedrive', 'dropbox'].includes(c.provider)) return new CloudStorage(c, this.oauth);
    return new CustomStorage(c, this.oauth.secret(c).accessToken, mcp);
  }
  authorize(c: StorageConnection, operation: StorageOperation): void {
    const current = this.get(c.companyId, c.id);
    if (!current.permissions.includes(operation)) throw new Error('This storage operation is not granted.');
    if (!this.capabilities(current).includes(operation)) throw new Error('This storage operation is unsupported.');
  }
  remove(companyId: string, id: string): void {
    const c = this.get(companyId, id);
    if (this.store.list<StorageTransfer>('transfer', companyId).some((t) => t.connectionId === id && t.state === 'running'))
      throw new Error('Cancel active transfers before disconnecting this account.');
    this.oauth.revoke(c);
    this.store.removeResource('storage', id, companyId);
    if (this.store.get(companyId)?.defaultStorageId === id) this.store.update(companyId, { defaultStorageId: '' });
  }
  async upload(c: StorageConnection, file: string, name: string, mcp?: McpManager): Promise<StorageItem> {
    if (this.stopped) throw new Error('Storage runtime is stopping.');
    c = this.get(c.companyId, c.id);
    this.authorize(c, 'upload');
    if (this.oauth.secret(c).state) throw new Error('Finish storage sign-in before starting an upload.');
    const authority = this.authority(c);
    const info = statSync(file),
      size = info.size,
      id =
        'transfer-' +
        createHash('sha256')
          .update(JSON.stringify([c.id, file, size, info.mtimeMs, name]))
          .digest('hex');
    if (this.busy.has(id)) throw new Error('This file transfer is already running.');
    const prior = this.store.read<StorageTransfer>('transfer', id);
    const checkpointId = id.slice(0, 140),
      checkpoint = this.vault.read<Record<string, unknown>>(checkpointId) ?? {};
    if (Object.keys(checkpoint).length && checkpoint['authority'] !== authority)
      throw new Error('The saved transfer belongs to a different account or folder, or lacks a saved grant. Reconcile the original transfer before retrying.');
    if (prior?.state === 'done' && prior.item) {
      if (checkpoint['authority'] !== authority) throw new Error('The completed transfer lacks its original account grant. Reconcile it before retrying.');
      return prior.item;
    }
    this.busy.add(id);
    const abort = new AbortController();
    let finish!: () => void;
    const finished = new Promise<void>((r) => {
      finish = r;
    });
    this.controllers.set(id, { abort, finished, finish });
    const transfer: StorageTransfer = {
      id,
      companyId: c.companyId,
      connectionId: c.id,
      name,
      state: 'running',
      size,
      offset: prior?.offset ?? 0,
      updatedAt: new Date().toISOString(),
      direction: 'upload',
    };
    this.store.saveResource('transfer', id, c.companyId, transfer);
    try {
      this.vault.save(checkpointId, { ...checkpoint, authority });
      const item = await this.adapter(c, mcp).upload(
        file,
        name,
        checkpoint,
        (next) => {
          this.vault.save(checkpointId, { ...next, authority });
          transfer.offset = Number(next['offset'] ?? transfer.offset);
          transfer.updatedAt = new Date().toISOString();
          this.store.saveResource('transfer', id, c.companyId, transfer);
        },
        abort.signal,
      );
      transfer.state = 'done';
      transfer.offset = size;
      transfer.item = item;
      return item;
    } catch (error) {
      transfer.state = 'failed';
      throw error;
    } finally {
      this.store.saveResource('transfer', id, c.companyId, transfer);
      this.busy.delete(id);
      this.controllers.delete(id);
      finish();
    }
  }
  async download(c: StorageConnection, id: string, directory: string, limit: number | null, mcp?: McpManager, expectedAuthority?: string): Promise<{ item: StorageItem; file: string }> {
    if (this.stopped) throw new Error('Storage runtime is stopping.');
    c = this.get(c.companyId, c.id);
    this.authorize(c, 'read');
    if (this.oauth.secret(c).state) throw new Error('Finish storage sign-in before starting a download.');
    const authority = this.authority(c);
    if (expectedAuthority && expectedAuthority !== authority) throw new Error('The referenced file belongs to a different storage account or folder. Reattach it before importing.');
    const file = path.join(directory, randomUUID() + '.download');
    let size = 0;
    const transfer: StorageTransfer = {
      id: 'transfer-' + randomUUID(),
      companyId: c.companyId,
      connectionId: c.id,
      name: id,
      state: 'running',
      size: 0,
      offset: 0,
      updatedAt: new Date().toISOString(),
      direction: 'download',
    };
    this.store.saveResource('transfer', transfer.id, c.companyId, transfer);
    const abort = new AbortController();
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    this.busy.add(transfer.id);
    this.controllers.set(transfer.id, { abort, finished, finish });
    const store = this.store;
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        transfer.offset = size;
        transfer.updatedAt = new Date().toISOString();
        store.saveResource('transfer', transfer.id, c.companyId, transfer);
        if (limit !== null && size > limit) callback(new Error('File exceeds your selected file-size limit.'));
        else callback(null, chunk);
      },
    });
    try {
      const result = await this.adapter(c, mcp).read(id, abort.signal);
      try {
        abort.signal.throwIfAborted();
        this.authorize(c, 'read');
        if (this.authority(c) !== authority) throw new Error('The storage account or folder changed during download.');
        if (limit !== null && result.item.size !== undefined && result.item.size > limit) throw new Error('File exceeds your selected file-size limit.');
      } catch (error) { result.stream.destroy(); throw error; }
      transfer.name = result.item.name;
      transfer.size = result.item.size ?? 0;
      this.store.saveResource('transfer', transfer.id, c.companyId, transfer);
      mkdirSync(directory, { recursive: true });
      await pipeline(result.stream, counter, createWriteStream(file, { flags: 'wx', mode: 0o600 }), { signal: abort.signal });
      if (result.item.size !== undefined && result.item.size !== size) throw new Error('Storage download size did not match the provider receipt.');
      transfer.state = 'done';
      transfer.size = size;
      transfer.item = { ...result.item, size };
      return { item: { ...result.item, size }, file };
    } catch (error) {
      transfer.state = 'failed';
      rmSync(file, { force: true });
      throw error;
    } finally {
      this.store.saveResource('transfer', transfer.id, c.companyId, transfer);
      this.busy.delete(transfer.id);
      this.controllers.delete(transfer.id);
      finish();
    }
  }
  async stop(): Promise<void> {
    this.stopped = true;
    await this.pauseCompany();
  }
  async pauseCompany(companyId?: string): Promise<void> {
    const active = this.store.list<StorageTransfer>('transfer', companyId).filter(transfer => transfer.state === 'running').map(transfer => this.controllers.get(transfer.id)).filter((value): value is NonNullable<typeof value> => Boolean(value));
    for (const transfer of active) transfer.abort.abort(new Error('Company file transfer paused.'));
    await Promise.allSettled(active.map(transfer => transfer.finished));
  }
  async cancel(c: StorageConnection, id: string, mcp?: McpManager): Promise<void> {
    const transfer = this.store.read<StorageTransfer>('transfer', id);
    if (!transfer || transfer.companyId !== c.companyId || transfer.connectionId !== c.id) throw new Error('Transfer not found.');
    const active = this.controllers.get(id);
    if (active) {
      active.abort.abort();
      await active.finished;
    }
    if (this.busy.has(id)) throw new Error('Transfer cancellation is pending.');
    if (this.store.read<StorageTransfer>('transfer', id)?.state === 'done') throw new Error('Completed transfers cannot be cancelled.');
    const checkpoint = this.vault.read<Record<string, unknown>>(id) ?? {};
    if (transfer.direction !== 'download' && Object.keys(checkpoint).length) {
      if (checkpoint['authority'] !== this.authority(this.get(c.companyId, c.id))) throw new Error('Reconcile this upload using its original storage account before cancelling.');
      await this.adapter(c, mcp).cancel?.(checkpoint);
    }
    this.vault.save(id, {});
    const latest = this.store.read<StorageTransfer>('transfer', id) ?? transfer;
    latest.state = 'cancelled';
    latest.updatedAt = new Date().toISOString();
    this.store.saveResource('transfer', id, c.companyId, latest);
  }
}
