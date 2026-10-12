import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { createReadStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';
import type { StorageAdapter, StorageConnection, StorageItem, StorageRead, StorageOperation } from './types.js';
import type { StorageSecret } from './oauth.js';
export class S3Storage implements StorageAdapter {
  capabilities: StorageOperation[] = ['list', 'read', 'upload', 'mkdir', 'move', 'delete'];
  private client: S3Client;
  private bucket: string;
  private prefix: string;
  private scope: string;
  constructor(connection: StorageConnection, secret: StorageSecret, client?: S3Client) {
    this.bucket = connection.config['bucket'] ?? '';
    if (!this.bucket) throw new Error('Choose a storage bucket.');
    this.prefix = (connection.config['folder'] ?? '').replace(/^\/+|\/+$/g, '');
    this.scope = createHash('sha256')
      .update(
        JSON.stringify([
          connection.id,
          this.bucket,
          this.prefix,
          connection.config['endpoint'] ?? '',
          connection.config['region'] || 'us-east-1',
          secret.accessKeyId ?? 'default-chain',
        ]),
      )
      .digest('hex');
    this.client =
      client ??
      new S3Client({
        region: connection.config['region'] || 'us-east-1',
        endpoint: connection.config['endpoint'] || undefined,
        forcePathStyle: connection.config['pathStyle'] !== 'false',
        credentials:
          secret.accessKeyId && secret.secretAccessKey
            ? { accessKeyId: secret.accessKeyId, secretAccessKey: secret.secretAccessKey, sessionToken: secret.sessionToken }
            : undefined,
      });
  }
  private key(id: string): string {
    const clean = id.replace(/^\/+/, '');
    if (clean.split('/').includes('..') || clean.includes('\\')) throw new Error('Invalid object path.');
    if (this.prefix && clean !== this.prefix && !clean.startsWith(this.prefix + '/')) throw new Error('Object is outside the granted prefix.');
    return clean;
  }
  async list(folder?: string): Promise<StorageItem[]> {
    let token: string | undefined;
    const items: StorageItem[] = [];
    do {
      const result = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: folder ? this.key(folder) : this.prefix ? this.prefix + '/' : '', ContinuationToken: token, MaxKeys: 1000 }),
      );
      items.push(...(result.Contents ?? []).map((o) => ({ id: o.Key!, name: path.posix.basename(o.Key!), size: o.Size, folder: o.Key!.endsWith('/') })));
      token = result.NextContinuationToken;
    } while (token && items.length < 10000);
    return items;
  }
  async read(id: string): Promise<StorageRead> {
    const key = this.key(id),
      result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!result.Body) throw new Error('Object is unavailable.');
    return { item: { id: key, name: path.posix.basename(key), size: result.ContentLength, mime: result.ContentType, folder: false }, stream: result.Body as Readable };
  }
  async metadata(id: string): Promise<StorageItem> {
    const key = this.key(id),
      v = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    return { id: key, name: path.posix.basename(key), size: v.ContentLength, mime: v.ContentType, folder: key.endsWith('/') };
  }
  async cancel(checkpoint: Record<string, unknown>): Promise<void> {
    if (!checkpoint['uploadId']) return;
    this.checkScope(checkpoint);
    try {
      await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: this.key(String(checkpoint['key'])), UploadId: String(checkpoint['uploadId']) }));
    } catch (error) {
      if (!this.noSuchUpload(error)) throw error;
    }
  }
  private checkScope(checkpoint: Record<string, unknown>): void {
    if (checkpoint['scope'] !== this.scope)
      throw new Error('The S3 upload account or folder changed, or this legacy upload has no saved scope. Reconcile it at the provider before retrying.');
  }
  private noSuchUpload(error: unknown): boolean {
    return (error as { name?: string }).name === 'NoSuchUpload';
  }
  private async receipt(key: string, transferId: string, size: number, signal?: AbortSignal): Promise<StorageItem | undefined> {
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }), { abortSignal: signal });
      if (head.Metadata?.['gitu-transfer'] !== transferId || head.ContentLength !== size)
        throw new Error('The S3 destination contains a different file. Reconcile the conflicting object before retrying.');
      return { id: key, name: path.posix.basename(key), size, folder: false };
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return undefined;
      throw error;
    }
  }
  async upload(file: string, name: string, checkpoint: Record<string, unknown>, save: (checkpoint: Record<string, unknown>) => void, signal?: AbortSignal): Promise<StorageItem> {
    signal?.throwIfAborted();
    const size = statSync(file).size;
    let key = String(checkpoint['key'] ?? [this.prefix, path.posix.basename(name.replace(/\\/g, '/'))].filter(Boolean).join('/'));
    this.key(key);
    const transferId = String(checkpoint['transferId'] ?? randomUUID());
    if (checkpoint['key']) {
      this.checkScope(checkpoint);
      if (checkpoint['size'] !== size || !checkpoint['transferId']) throw new Error('The S3 upload source changed. Reconcile the original transfer before retrying.');
      const completed = await this.receipt(key, transferId, size, signal);
      if (completed) return completed;
    }
    if (!checkpoint['key']) {
      try {
        await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }), { abortSignal: signal });
        const ext = path.posix.extname(key);
        key = key.slice(0, key.length - ext.length) + '-' + randomUUID().slice(0, 8) + ext;
      } catch (error) {
        if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw error;
      }
    }
    if (size === 0) {
      save({ key, offset: 0, transferId, size, scope: this.scope });
      try {
        await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: Buffer.alloc(0), Metadata: { 'gitu-transfer': transferId }, IfNoneMatch: '*' }), {
          abortSignal: signal,
        });
      } catch (error) {
        if ([409, 412].includes((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode ?? 0)) {
          const completed = await this.receipt(key, transferId, size, signal);
          if (completed) return completed;
        }
        throw error;
      }
      return { id: key, name: path.posix.basename(key), size, folder: false };
    }
    let uploadId = checkpoint['uploadId'] as string | undefined;
    let parts = (checkpoint['parts'] ?? []) as { PartNumber: number; ETag: string }[];
    let offset = Number(checkpoint['offset'] ?? 0);
    const partSize = Math.max(5 * 1024 * 1024, Math.ceil(size / 9500 / (1024 * 1024)) * 1024 * 1024);
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > size ||
      !Array.isArray(parts) ||
      parts.length > Math.ceil(size / partSize) ||
      offset !== Math.min(parts.length * partSize, size) ||
      parts.some((part, index) => !part || part.PartNumber !== index + 1 || typeof part.ETag !== 'string' || !part.ETag) ||
      (!uploadId && (offset || parts.length))
    )
      throw new Error('The saved S3 upload progress is invalid. Reconcile it before retrying.');
    const persist = () => save({ key, uploadId, parts: [...parts], offset, transferId, size, scope: this.scope });
    let recovered = false;
    for (;;) {
      signal?.throwIfAborted();
      if (!uploadId) {
        // Save the destination before submission; a lost response must not choose another filename.
        persist();
        uploadId = (await this.client.send(new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, Metadata: { 'gitu-transfer': transferId } }), { abortSignal: signal }))
          .UploadId;
        if (!uploadId) throw new Error('Multipart upload did not start.');
        persist();
      }
      try {
        while (offset < size) {
          signal?.throwIfAborted();
          const length = Math.min(partSize, size - offset),
            body = createReadStream(file, { start: offset, end: offset + length - 1, highWaterMark: 64 * 1024 });
          try {
            const part = await this.client.send(
              new UploadPartCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumber: parts.length + 1, Body: body, ContentLength: length }),
              { abortSignal: signal },
            );
            if (!part.ETag) throw new Error('The S3 upload part did not return a receipt.');
            parts = [...parts, { PartNumber: parts.length + 1, ETag: part.ETag }];
          } finally {
            body.destroy();
          }
          offset += length;
          persist();
        }
        signal?.throwIfAborted();
        await this.client.send(new CompleteMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: parts }, IfNoneMatch: '*' }), {
          abortSignal: signal,
        });
        return { id: key, name: path.posix.basename(key), size, folder: false };
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        const expired = this.noSuchUpload(error),
          conflict = status === 409;
        if (!expired && !conflict && status !== 412) throw error;
        const completed = await this.receipt(key, transferId, size, signal);
        if (completed) return completed;
        if ((!expired && !conflict) || recovered) throw error;
        if (!expired) await this.cancel({ key, uploadId, scope: this.scope });
        recovered = true;
        uploadId = undefined;
        parts = [];
        offset = 0;
        persist();
      }
    }
  }
  async mkdir(name: string, parent?: string): Promise<StorageItem> {
    const key = this.key([parent ?? this.prefix, path.posix.basename(name), ''].join('/'));
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: Buffer.alloc(0), IfNoneMatch: '*' }));
    return { id: key, name, folder: true };
  }
  async move(id: string, name: string, parent?: string): Promise<StorageItem> {
    const source = this.key(id),
      key = this.key([parent ?? this.prefix, path.posix.basename(name) + '-' + randomUUID().slice(0, 8)].filter(Boolean).join('/'));
    await this.client.send(new CopyObjectCommand({ Bucket: this.bucket, Key: key, CopySource: this.bucket + '/' + source.split('/').map(encodeURIComponent).join('/') }));
    await this.remove(id);
    return { id: key, name: path.posix.basename(key), folder: false };
  }
  async remove(id: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: this.key(id) }));
  }
}
