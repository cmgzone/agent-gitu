import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { S3Client } from '@aws-sdk/client-s3';
import { S3Storage } from '../src/storage/s3.js';
import type { StorageConnection } from '../src/storage/types.js';

const roots: string[] = [];
const partSize = 5 * 1024 * 1024;
const sourceFile = (size = partSize + 3) => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-s3-recovery-'));
  roots.push(root);
  const file = path.join(root, 'source');
  writeFileSync(file, Buffer.alloc(size, 7));
  return file;
};
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
const connection: StorageConnection = {
  id: 's3',
  companyId: 'company',
  name: 'S3',
  provider: 's3',
  config: { bucket: 'bucket', folder: 'allowed' },
  permissions: ['upload'],
  createdAt: '2026-10-12',
};
const scope = createHash('sha256')
  .update(JSON.stringify(['s3', 'bucket', 'allowed', '', 'us-east-1', 'fixture-account']))
  .digest('hex');
const saved = (extra = {}) => ({
  key: 'allowed/result',
  transferId: 'transfer',
  scope,
  size: partSize + 3,
  uploadId: 'expired',
  parts: [{ PartNumber: 1, ETag: 'first' }],
  offset: partSize,
  ...extra,
});
const failure = (name: string, httpStatusCode: number) => Object.assign(new Error(name), { name, $metadata: { httpStatusCode } });
type Command = { constructor: { name: string }; input: Record<string, any> };
const adapter = (send: (command: Command, options?: { abortSignal?: AbortSignal }) => Promise<any>, c = connection) =>
  new S3Storage(c, { accessKeyId: 'fixture-account', secretAccessKey: 'fixture-secret' }, { send } as unknown as S3Client);
const consume = async (command: Command) => {
  let size = 0;
  for await (const chunk of command.input['Body']) size += chunk.length;
  expect(size).toBe(command.input['ContentLength']);
};

describe('S3 multipart recovery', () => {
  it('persists its destination before session creation and reuses it after a lost response', async () => {
    const file = sourceFile();
    let checkpoint: Record<string, unknown> = {},
      starts = 0;
    const send = vi.fn(async (command: Command) => {
      if (command.constructor.name === 'HeadObjectCommand') throw failure('NotFound', 404);
      if (command.constructor.name === 'CreateMultipartUploadCommand') {
        expect(checkpoint).toMatchObject({ key: 'allowed/result', offset: 0, scope, size: partSize + 3 });
        expect(command.input['Metadata']['gitu-transfer']).toBe(checkpoint['transferId']);
        if (++starts === 1) throw new Error('Creation response lost');
        return { UploadId: 'new' };
      }
      if (command.constructor.name === 'UploadPartCommand') {
        await consume(command);
        return { ETag: 'part' + command.input['PartNumber'] };
      }
      expect(command.input['IfNoneMatch']).toBe('*');
      return {};
    });
    const save = (value: Record<string, unknown>) => {
      checkpoint = value;
    };
    await expect(adapter(send).upload(file, 'result', checkpoint, save)).rejects.toThrow('Creation response lost');
    const transferId = checkpoint['transferId'];
    expect((await adapter(send).upload(file, 'result', checkpoint, save)).id).toBe('allowed/result');
    expect(checkpoint['transferId']).toBe(transferId);
    expect(starts).toBe(2);
  });
  it('restarts an expired session from byte zero at the same destination', async () => {
    const file = sourceFile();
    let checkpoint: Record<string, unknown> = saved();
    const lengths: number[] = [];
    const send = vi.fn(async (command: Command) => {
      if (command.constructor.name === 'HeadObjectCommand') throw failure('NotFound', 404);
      if (command.constructor.name === 'CreateMultipartUploadCommand') {
        expect(checkpoint).toMatchObject({ offset: 0, parts: [], key: 'allowed/result', transferId: 'transfer' });
        return { UploadId: 'new' };
      }
      if (command.constructor.name === 'UploadPartCommand') {
        if (command.input['UploadId'] === 'expired') throw failure('NoSuchUpload', 404);
        lengths.push(command.input['ContentLength']);
        await consume(command);
        return { ETag: 'part' };
      }
      expect(command.input['IfNoneMatch']).toBe('*');
      return {};
    });
    expect(
      (
        await adapter(send).upload(file, 'result', checkpoint, (value) => {
          checkpoint = value;
        })
      ).id,
    ).toBe('allowed/result');
    expect(lengths).toEqual([partSize, 3]);
    expect(checkpoint['offset']).toBe(partSize + 3);
  });
  it('reconciles completion between a missing-object check and an expired-session response', async () => {
    const file = sourceFile();
    let heads = 0;
    const send = vi.fn(async (command: Command) => {
      if (command.constructor.name === 'HeadObjectCommand') {
        if (++heads === 1) throw failure('NotFound', 404);
        return { ContentLength: partSize + 3, Metadata: { 'gitu-transfer': 'transfer' } };
      }
      expect(command.constructor.name).toBe('CompleteMultipartUploadCommand');
      throw failure('NoSuchUpload', 404);
    });
    expect(
      (
        await adapter(send).upload(
          file,
          'result',
          saved({
            offset: partSize + 3,
            parts: [
              { PartNumber: 1, ETag: 'first' },
              { PartNumber: 2, ETag: 'last' },
            ],
          }),
          () => {},
        )
      ).size,
    ).toBe(partSize + 3);
    expect(send).toHaveBeenCalledTimes(3);
  });
  it('replays a part whose acknowledgement was lost using the same part number', async () => {
    const file = sourceFile();
    let checkpoint: Record<string, unknown> = {},
      lost = false;
    const numbers: number[] = [];
    const send = vi.fn(async (command: Command) => {
      if (command.constructor.name === 'HeadObjectCommand') throw failure('NotFound', 404);
      if (command.constructor.name === 'CreateMultipartUploadCommand') return { UploadId: 'session' };
      if (command.constructor.name === 'UploadPartCommand') {
        numbers.push(command.input['PartNumber']);
        await consume(command);
        if (!lost) {
          lost = true;
          throw new Error('Part response lost');
        }
        return { ETag: 'part' };
      }
      return {};
    });
    const save = (value: Record<string, unknown>) => {
      checkpoint = value;
    };
    await expect(adapter(send).upload(file, 'result', checkpoint, save)).rejects.toThrow('Part response lost');
    await adapter(send).upload(file, 'result', checkpoint, save);
    expect(numbers).toEqual([1, 1, 2]);
  });
  it('aborts a conflicting multipart session before one bounded restart', async () => {
    const file = sourceFile(),
      checkpoint = saved();
    const aborted: string[] = [];
    const send = vi.fn(async (command: Command) => {
      if (command.constructor.name === 'HeadObjectCommand') throw failure('NotFound', 404);
      if (command.constructor.name === 'CreateMultipartUploadCommand') return { UploadId: 'new' };
      if (command.constructor.name === 'UploadPartCommand') {
        await consume(command);
        return { ETag: 'part' };
      }
      if (command.constructor.name === 'AbortMultipartUploadCommand') {
        aborted.push(command.input['UploadId']);
        return {};
      }
      throw failure('ConditionalRequestConflict', 409);
    });
    await expect(adapter(send).upload(file, 'result', checkpoint, () => {})).rejects.toThrow('ConditionalRequestConflict');
    expect(aborted).toEqual(['expired']);
    expect(send.mock.calls.filter(([command]) => command.constructor.name === 'CreateMultipartUploadCommand')).toHaveLength(1);
  });
  it('preserves conflicting files and does not interpret permission failures as missing uploads', async () => {
    const file = sourceFile();
    for (const head of [
      { ContentLength: partSize + 3, Metadata: { 'gitu-transfer': 'other' } },
      { ContentLength: 1, Metadata: { 'gitu-transfer': 'transfer' } },
    ]) {
      const send = vi.fn(async () => head);
      await expect(adapter(send).upload(file, 'result', saved(), () => {})).rejects.toThrow('different file');
      expect(send).toHaveBeenCalledTimes(1);
    }
    const send = vi.fn(async () => {
      throw failure('AccessDenied', 403);
    });
    await expect(adapter(send).upload(file, 'result', saved(), () => {})).rejects.toThrow('AccessDenied');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('rejects changed account scopes, source size and malformed saved progress without writing', async () => {
    const file = sourceFile();
    const send = vi.fn(async (command: Command) => {
      expect(command.constructor.name).toBe('HeadObjectCommand');
      throw failure('NotFound', 404);
    });
    for (const checkpoint of [
      saved({ scope: 'another-account' }),
      saved({ scope: undefined }),
      saved({ size: 1 }),
      saved({ offset: partSize - 1 }),
      saved({ parts: [{ PartNumber: 2, ETag: 'bad' }] }),
    ]) {
      await expect(adapter(send).upload(file, 'result', checkpoint, () => {})).rejects.toThrow(/changed|legacy|invalid/);
    }
    await expect(adapter(send, { ...connection, config: { bucket: 'other', folder: 'allowed' } }).upload(file, 'result', saved(), () => {})).rejects.toThrow('changed');
  });
  it('keeps the saved empty-file destination after a lost submission acknowledgement', async () => {
    const file = sourceFile(0);
    let checkpoint: Record<string, unknown> = {},
      committed = false,
      puts = 0;
    const send = vi.fn(async (command: Command) => {
      if (command.constructor.name === 'HeadObjectCommand') {
        if (!committed) throw failure('NotFound', 404);
        return { ContentLength: 0, Metadata: { 'gitu-transfer': checkpoint['transferId'] } };
      }
      expect(checkpoint).toMatchObject({ size: 0, scope, key: 'allowed/result' });
      expect(command.input['IfNoneMatch']).toBe('*');
      puts++;
      committed = true;
      throw new Error('Response lost');
    });
    const save = (value: Record<string, unknown>) => {
      checkpoint = value;
    };
    await expect(adapter(send).upload(file, 'result', checkpoint, save)).rejects.toThrow('Response lost');
    expect((await adapter(send).upload(file, 'result', checkpoint, save)).size).toBe(0);
    expect(puts).toBe(1);
  });
  it('cancels an already expired session idempotently and honors an aborted request before submission', async () => {
    const send = vi.fn(async () => {
      throw failure('NoSuchUpload', 404);
    });
    await adapter(send).cancel(saved());
    expect(send).toHaveBeenCalledTimes(1);
    const signal = AbortSignal.abort();
    await expect(adapter(send).upload(sourceFile(), 'result', {}, () => {}, signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
