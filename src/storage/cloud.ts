import { createReadStream, statSync, openSync, readSync, closeSync } from 'node:fs';
import { Readable } from 'node:stream';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { StorageAdapter, StorageConnection, StorageItem, StorageRead, StorageOperation } from './types.js';
import type { StorageOAuth } from './oauth.js';
import { storageFileHashes } from './hashes.js';

const CHUNK = 5 * 1024 * 1024;
type Json = Record<string, any>;
export class CloudStorage implements StorageAdapter {
  capabilities: StorageOperation[] = ['list', 'read', 'upload', 'mkdir', 'move', 'delete', 'link'];
  private signal?: AbortSignal;
  constructor(
    private readonly connection: StorageConnection,
    private readonly oauth: StorageOAuth,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  private get provider() {
    return this.connection.provider;
  }
  private get folder() {
    return this.connection.config['folder'] ?? (this.provider === 'dropbox' ? '' : 'root');
  }
  private async request(url: string, init: RequestInit = {}, authenticated = true, accepted: number[] = [], refreshed = false): Promise<Response> {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error('Storage transfer requires HTTPS without embedded credentials.');
    const hosts =
      this.provider === 'google-drive'
        ? ['www.googleapis.com', 'upload.googleapis.com']
        : this.provider === 'onedrive'
          ? ['graph.microsoft.com']
          : ['api.dropboxapi.com', 'content.dropboxapi.com'];
    if (authenticated && !hosts.includes(parsed.hostname)) throw new Error('Storage credentials cannot be sent outside the provider origin.');
    const headers = new Headers(init.headers);
    if (authenticated) headers.set('authorization', 'Bearer ' + (await this.oauth.token(this.connection)));
    const response = await this.fetcher(url, {
      ...init,
      headers,
      signal: this.signal ? AbortSignal.any([this.signal, init.signal ?? AbortSignal.timeout(120000)]) : (init.signal ?? AbortSignal.timeout(120000)),
    });
    if (response.status === 401 && authenticated && !refreshed) {
      await response.body?.cancel();
      await this.oauth.refresh(this.connection);
      return this.request(url, init, authenticated, accepted, true);
    }
    if (!response.ok && response.status !== 308 && !accepted.includes(response.status))
      throw new Error(response.status === 401 ? 'Reconnect this storage account.' : `Storage provider rejected the operation (${response.status}).`);
    return response;
  }
  private async json(url: string, init: RequestInit = {}): Promise<Json> {
    return (await (await this.request(url, init)).json()) as Json;
  }
  private body(value: unknown): RequestInit {
    return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) };
  }
  private drive(id: string, suffix = ''): string {
    return 'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + suffix;
  }
  private one(id: string, suffix = ''): string {
    return 'https://graph.microsoft.com/v1.0/me/drive/' + (id === 'root' ? 'root' : 'items/' + encodeURIComponent(id)) + suffix;
  }
  private drop(method: string, value: unknown): Promise<Json> {
    return this.json('https://api.dropboxapi.com/2/' + method, this.body(value));
  }
  private item(value: Json): StorageItem {
    if (this.provider === 'google-drive')
      return {
        id: String(value.id),
        name: String(value.name),
        size: value.size === undefined ? undefined : Number(value.size),
        mime: value.mimeType,
        folder: value.mimeType === 'application/vnd.google-apps.folder',
      };
    if (this.provider === 'onedrive') return { id: String(value.id), name: String(value.name), size: value.size, mime: value.file?.mimeType, folder: Boolean(value.folder) };
    return { id: String(value.path_lower ?? value.path_display), name: String(value.name), size: value.size, folder: value['.tag'] === 'folder' };
  }
  private dropPath(id: string): string {
    const folder = this.folder.toLowerCase().replace(/\/$/, ''),
      target = id.toLowerCase();
    if (id.includes('\\') || id.split('/').includes('..') || (folder && target !== folder && !target.startsWith(folder + '/')))
      throw new Error('File is outside the granted folder.');
    return id;
  }
  private async providerMetadata(id: string): Promise<Json> {
    return this.provider === 'google-drive'
      ? this.json(this.drive(id) + '?fields=id,name,mimeType,size,parents,webViewLink')
      : this.provider === 'onedrive'
        ? this.json(this.one(id) + '?$select=id,name,size,folder,file,parentReference,webUrl')
        : this.drop('files/get_metadata', { path: this.dropPath(id) });
  }
  private async dropboxCompletion(destination: string, file: string, size: number): Promise<StorageItem | undefined> {
    const response = await this.request('https://api.dropboxapi.com/2/files/get_metadata', this.body({ path: this.dropPath(destination) }), true, [409]);
    const value = (await response.json()) as Json;
    if (response.status === 409) {
      if (value.error?.['.tag'] === 'path' && value.error.path?.['.tag'] === 'not_found') return undefined;
      throw new Error('Dropbox completion cannot be reconciled. Check its provider receipt before retrying.');
    }
    if (Number(value.size) !== size || value.content_hash !== (await storageFileHashes(file)).dropbox)
      throw new Error('Dropbox completion does not match the original file. Reconcile its receipt before retrying.');
    return this.item(value);
  }
  private async assertScope(id: string): Promise<Json> {
    if (this.provider === 'dropbox') return this.providerMetadata(this.dropPath(id));
    const root = await this.providerMetadata(this.folder),
      first = await this.providerMetadata(id);
    let node = first;
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      if (node.id === root.id) return first;
      if (seen.has(String(node.id))) break;
      seen.add(String(node.id));
      const parent = this.provider === 'google-drive' ? node.parents?.[0] : node.parentReference?.id;
      if (!parent) break;
      node = await this.providerMetadata(String(parent));
    }
    throw new Error('File is outside the granted storage folder.');
  }
  async metadata(id: string): Promise<StorageItem> {
    return this.item(await this.assertScope(id));
  }
  async quota() {
    if (this.provider === 'google-drive') {
      const q = (await this.json('https://www.googleapis.com/drive/v3/about?fields=storageQuota')).storageQuota;
      return { totalBytes: q.limit === undefined ? undefined : Number(q.limit), usedBytes: Number(q.usage) };
    }
    if (this.provider === 'onedrive') {
      const q = (await this.json('https://graph.microsoft.com/v1.0/me/drive?$select=quota')).quota;
      return { totalBytes: q.total, usedBytes: q.used, availableBytes: q.remaining };
    }
    const q = await this.drop('users/get_space_usage', null);
    return { usedBytes: q.used, totalBytes: q.allocation?.allocated };
  }
  async list(folder = this.folder): Promise<StorageItem[]> {
    if (this.provider === 'google-drive') {
      const parent = await this.assertScope(folder),
        items: StorageItem[] = [];
      let cursor: string | undefined;
      do {
        const params = new URLSearchParams({
          q: `'${String(parent.id).replace(/'/g, "\\'")}' in parents and trashed = false`,
          fields: 'nextPageToken,files(id,name,mimeType,size)',
          pageSize: '1000',
          ...(cursor ? { pageToken: cursor } : {}),
        });
        const result = await this.json('https://www.googleapis.com/drive/v3/files?' + params);
        items.push(...(result.files ?? []).map((v: Json) => this.item(v)));
        cursor = result.nextPageToken;
      } while (cursor && items.length < 10000);
      return items;
    }
    if (this.provider === 'onedrive') {
      await this.assertScope(folder);
      let url: string | undefined = this.one(folder, '/children'),
        items: StorageItem[] = [];
      do {
        const result = await this.json(url);
        items.push(...(result.value ?? []).map((v: Json) => this.item(v)));
        url = result['@odata.nextLink'];
      } while (url && items.length < 10000);
      return items;
    }
    let result = await this.drop('files/list_folder', { path: this.dropPath(folder), limit: 1000 });
    const items: StorageItem[] = [];
    while (true) {
      items.push(...(result.entries ?? []).map((v: Json) => this.item(v)));
      if (!result.has_more || items.length >= 10000) break;
      result = await this.drop('files/list_folder/continue', { cursor: result.cursor });
    }
    return items;
  }
  async read(id: string): Promise<StorageRead> {
    const value = await this.assertScope(id),
      item = this.item(value);
    if (item.folder) throw new Error('Choose a file.');
    let response: Response;
    if (this.provider === 'google-drive') {
      const exports: Record<string, { mime: string; extension: string }> = {
        'application/vnd.google-apps.document': { mime: 'application/pdf', extension: '.pdf' },
        'application/vnd.google-apps.spreadsheet': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: '.xlsx' },
        'application/vnd.google-apps.presentation': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', extension: '.pptx' },
      };
      const format = exports[item.mime ?? ''];
      if (format) {
        response = await this.request(this.drive(id, '/export?mimeType=' + encodeURIComponent(format.mime)));
        item.mime = format.mime;
        item.name += format.extension;
        item.size = undefined;
      } else response = await this.request(this.drive(id, '?alt=media'));
    } else if (this.provider === 'onedrive') response = await this.request(this.one(id, '/content'));
    else
      response = await this.request('https://content.dropboxapi.com/2/files/download', {
        method: 'POST',
        headers: { 'dropbox-api-arg': JSON.stringify({ path: this.dropPath(id) }) },
      });
    if (!response.body) throw new Error('Storage file is unavailable.');
    return { item, stream: Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]) };
  }
  async upload(file: string, name: string, checkpoint: Record<string, unknown>, save: (checkpoint: Record<string, unknown>) => void, signal?: AbortSignal): Promise<StorageItem> {
    this.signal = signal;
    signal?.throwIfAborted();
    const size = statSync(file).size,
      safeName = path.posix.basename(name.replace(/\\/g, '/')) || 'file';
    if (checkpoint['size'] !== undefined && checkpoint['size'] !== size) throw new Error('Storage upload source size changed.');
    let offset = Number(checkpoint['offset'] ?? 0);
    const validateOffset = () => { if (!Number.isSafeInteger(offset) || offset < 0 || offset > size) throw new Error('Storage upload returned an invalid transfer offset.'); };
    validateOffset();
    if (this.provider === 'google-drive') return this.uploadDrive(file, safeName, size, checkpoint, save);
    if (this.provider === 'onedrive') {
      await this.assertScope(this.folder);
      if (checkpoint['folder'] !== undefined && checkpoint['folder'] !== this.folder) throw new Error('The storage folder changed. Reconcile the original upload before retrying.');
      const destination = String(checkpoint['destination'] ?? safeName + '-' + randomUUID().slice(0, 8));
      if (size === 0) {
        if (checkpoint['emptySubmitted']) {
          if (checkpoint['folder'] !== this.folder) throw new Error('The storage folder changed. Reconcile the original empty-file upload before retrying.');
          const existing = await this.emptyOneDriveReceipt(destination);
          if (existing) return existing;
        }
        // Save the exact destination before submission. A lost response must
        // reconcile this file rather than create another randomly named copy.
        save({ destination, folder: this.folder, emptySubmitted: true, offset: 0 });
        const response = await this.request(this.one(this.folder, ':/' + encodeURIComponent(destination) + ':/content') + '?@microsoft.graph.conflictBehavior=fail', {
          method: 'PUT', body: Buffer.alloc(0), headers: { 'content-type': 'application/octet-stream' },
        }, true, [409]);
        if (response.status === 409) {
          await response.body?.cancel();
          const existing = await this.emptyOneDriveReceipt(destination);
          if (!existing) throw new Error('OneDrive empty-file submission is uncertain. Reconcile the provider receipt before retrying.');
          return existing;
        }
        return this.item(await response.json() as Json);
      }
      let url = checkpoint['url'] as string | undefined;
      const remember = () => save({ url, offset, destination, folder: this.folder, size });
      if (checkpoint['url']) {
        const probe = await this.request(url!, {}, false, [404, 410]);
        if (probe.status === 404 || probe.status === 410) {
          await probe.body?.cancel();
          if (!checkpoint['destination']) throw new Error('This expired legacy upload requires provider reconciliation before retrying.');
          const completed = await this.oneDriveReceipt(destination, file, size);
          if (completed) return completed;
          url = undefined; offset = 0; remember();
        } else {
          const status = (await probe.json()) as Json;
          offset = Number(String(status.nextExpectedRanges?.[0] ?? '0-').split('-')[0]);
          validateOffset();
        }
      }
      if (!url) {
        offset = 0; remember();
        const result = await this.json(
          this.one(this.folder, ':/' + encodeURIComponent(destination) + ':/createUploadSession'),
          this.body({ item: { '@microsoft.graph.conflictBehavior': 'fail', name: destination, fileSize: size } }),
        );
        url = result.uploadUrl;
        if (!url) throw new Error('Storage upload did not start.');
        remember();
      }
      let result: Json | undefined;
      for await (const chunk of createReadStream(file, { start: offset, highWaterMark: CHUNK })) {
        const bytes = chunk as Buffer,
          response = await this.request(url, { method: 'PUT', headers: { 'content-range': `bytes ${offset}-${offset + bytes.length - 1}/${size}` }, body: bytes }, false);
        offset += bytes.length;
        remember();
        if (response.status !== 202) result = (await response.json()) as Json;
      }
      if (!result) throw new Error('Storage upload did not finalize.');
      return this.item(result);
    }
    const destination = this.dropPath(String(checkpoint['destination'] ?? [this.folder, safeName + '-' + randomUUID().slice(0, 8)].join('/')));
    if (checkpoint['finishing']) {
      const existing = await this.dropboxCompletion(destination, file, size);
      if (existing) return existing;
      // Retry only the original session and exact destination with autorename
      // disabled. A concurrently completed submission cannot create a duplicate.
    }
    let sessionId = checkpoint['sessionId'] as string | undefined;
    if (!sessionId) {
      const response = await this.request('https://content.dropboxapi.com/2/files/upload_session/start', {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream', 'dropbox-api-arg': JSON.stringify({ close: false }) },
        body: Buffer.alloc(0),
      });
      sessionId = ((await response.json()) as Json).session_id;
      save({ sessionId, offset: 0, destination });
      offset = 0;
    }
    const fd = openSync(file, 'r');
    let reconciliations = 0;
    try {
      while (offset < size) {
        const bytes = Buffer.allocUnsafe(Math.min(CHUNK, size - offset));
        if (readSync(fd, bytes, 0, bytes.length, offset) !== bytes.length) throw new Error('Storage source changed during upload.');
        const response = await this.request(
          'https://content.dropboxapi.com/2/files/upload_session/append_v2',
          {
            method: 'POST',
            headers: { 'content-type': 'application/octet-stream', 'dropbox-api-arg': JSON.stringify({ cursor: { session_id: sessionId, offset }, close: false }) },
            body: bytes,
          },
          true,
          [409],
        );
        if (response.status === 409) {
          const data = (await response.json()) as Json,
            error = data.error,
            correct = Number(error?.correct_offset ?? error?.incorrect_offset?.correct_offset);
          if (!Number.isSafeInteger(correct) || correct <= offset || correct > size || ++reconciliations > 20)
            throw new Error('Dropbox upload could not reconcile its saved offset.');
          offset = correct;
        } else {
          offset += bytes.length;
          reconciliations = 0;
        }
        save({ sessionId, offset, destination });
      }
    } finally {
      closeSync(fd);
    }
    save({ sessionId, offset, destination, finishing: true });
    const response = await this.request('https://content.dropboxapi.com/2/files/upload_session/finish', {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'dropbox-api-arg': JSON.stringify({ cursor: { session_id: sessionId, offset }, commit: { path: destination, mode: 'add', autorename: false, mute: false } }),
      },
      body: Buffer.alloc(0),
    }, true, [409]);
    if (response.status === 409) {
      await response.body?.cancel();
      const completed = await this.dropboxCompletion(destination, file, size);
      if (completed) return completed;
      throw new Error('Dropbox upload session is unavailable. Its completion must be reconciled before starting another upload.');
    }
    return this.item((await response.json()) as Json);
  }
  private async uploadDrive(file: string, name: string, size: number, checkpoint: Record<string, unknown>, save: (value: Record<string, unknown>) => void): Promise<StorageItem> {
    const parent = await this.assertScope(this.folder);
    let fileId = checkpoint['fileId'] as string | undefined, url = checkpoint['url'] as string | undefined, offset = 0;
    if ((fileId || url) && !checkpoint['parentId']) throw new Error('This legacy Drive upload requires folder and provider reconciliation before retrying.');
    if (checkpoint['parentId'] && checkpoint['parentId'] !== parent.id) throw new Error('The storage folder changed. Reconcile the original Drive upload before retrying.');
    const remember = () => save({ fileId, url, parentId: parent.id, offset });
    if (url) {
      const status = await this.request(url, { method: 'PUT', headers: { 'content-range': `bytes */${size}` }, body: Buffer.alloc(0) }, true, [404, 410]);
      if (status.status === 404 || status.status === 410) {
        await status.body?.cancel();
        if (!fileId) throw new Error('The expired Drive upload requires provider reconciliation before retrying.');
        const receipt = await this.driveReceipt(fileId, parent.id, file, size);
        if (receipt) return receipt;
        url = undefined;
        remember();
      } else if (status.status !== 308) return this.driveUploadReceipt(await status.json() as Json, fileId, size);
      else {
        offset = Number(status.headers.get('range')?.split('-')[1] ?? -1) + 1;
        await status.body?.cancel();
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > size) throw new Error('Storage upload returned an invalid transfer offset.');
      }
    } else if (fileId) {
      const receipt = await this.driveReceipt(fileId, parent.id, file, size);
      if (receipt) return receipt;
    }
    if (!fileId) {
      const generated = await this.json('https://www.googleapis.com/drive/v3/files/generateIds?count=1&space=drive&type=files');
      fileId = generated.ids?.[0];
      if (typeof fileId !== 'string' || !fileId) throw new Error('Drive did not reserve a file ID.');
      remember();
    }
    if (!url) {
      const response = await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size', {
        ...this.body({ id: fileId, name, parents: [parent.id] }),
        headers: { 'content-type': 'application/json', 'x-upload-content-length': String(size), 'x-upload-content-type': 'application/octet-stream' },
      }, true, [409]);
      if (response.status === 409) {
        await response.body?.cancel();
        const receipt = await this.driveReceipt(fileId, parent.id, file, size);
        if (!receipt) throw new Error('Drive submission is uncertain. Reconcile the provider receipt before retrying.');
        return receipt;
      }
      url = response.headers.get('location') ?? undefined;
      await response.body?.cancel();
      if (!url) throw new Error('Storage upload did not start.');
      offset = 0;
      remember();
    }
    if (size === 0) return this.driveUploadReceipt(await (await this.request(url, { method: 'PUT', body: Buffer.alloc(0) })).json() as Json, fileId, size);
    let result: Json | undefined;
    for await (const chunk of createReadStream(file, { start: offset, highWaterMark: CHUNK })) {
      const bytes = chunk as Buffer;
      const response = await this.request(url, { method: 'PUT', headers: { 'content-range': `bytes ${offset}-${offset + bytes.length - 1}/${size}` }, body: bytes });
      offset += bytes.length;
      remember();
      if (response.status !== 308) result = await response.json() as Json;
      else await response.body?.cancel();
    }
    if (!result) throw new Error('Storage upload did not finalize.');
    return this.driveUploadReceipt(result, fileId, size);
  }
  private driveUploadReceipt(value: Json, fileId: string | undefined, size: number): StorageItem {
    if (value.id !== fileId || Number(value.size) !== size) throw new Error('Drive upload receipt does not match the submitted file.');
    return this.item(value);
  }
  private async driveReceipt(fileId: string, parentId: string, file: string, size: number): Promise<StorageItem | undefined> {
    const response = await this.request(this.drive(fileId, '?fields=id,name,mimeType,size,parents,trashed,md5Checksum,sha1Checksum,sha256Checksum'), {}, true, [404]);
    if (response.status === 404) {
      await response.body?.cancel();
      return undefined;
    }
    const value = await response.json() as Json, hashes = await storageFileHashes(file);
    const matches = value.sha256Checksum ? String(value.sha256Checksum).toLowerCase() === hashes.sha256 :
      value.sha1Checksum ? String(value.sha1Checksum).toLowerCase() === hashes.sha1 :
      Boolean(value.md5Checksum && String(value.md5Checksum).toLowerCase() === hashes.md5);
    if (value.id !== fileId || value.trashed || !(value.parents ?? []).includes(parentId) || Number(value.size) !== size || !matches)
      throw new Error('Drive completion could not be verified. Reconcile the provider receipt before retrying.');
    return this.item(value);
  }
  private async oneDriveReceipt(destination: string, file: string, size: number): Promise<StorageItem | undefined> {
    const response = await this.request(this.one(this.folder, ':/' + encodeURIComponent(destination)) + '?$select=id,name,size,file,parentReference', {}, true, [404]);
    if (response.status === 404) { await response.body?.cancel(); return undefined; }
    const receipt = await response.json() as Json, hashes = await storageFileHashes(file), expected = receipt.file?.hashes;
    const matches = expected?.sha256Hash ? String(expected.sha256Hash).toLowerCase() === hashes.sha256
      : expected?.sha1Hash ? String(expected.sha1Hash).toLowerCase() === hashes.sha1
      : expected?.quickXorHash ? expected.quickXorHash === hashes.quickXor : false;
    if (!receipt.id || !receipt.file || receipt.folder || Number(receipt.size) !== size || !matches)
      throw new Error('OneDrive completion could not be verified. Reconcile the provider receipt before retrying.');
    return this.item(receipt);
  }
  private async emptyOneDriveReceipt(destination: string): Promise<StorageItem | undefined> {
    const response = await this.request(this.one(this.folder, ':/' + encodeURIComponent(destination)) + '?$select=id,name,size,file,parentReference', {}, true, [404]);
    if (response.status === 404) {
      await response.body?.cancel();
      return undefined;
    }
    const receipt = await response.json() as Json;
    if (!receipt.id || !receipt.file || receipt.folder || Number(receipt.size) !== 0)
      throw new Error('OneDrive empty-file receipt does not match. Reconcile it before retrying.');
    return this.item(receipt);
  }
  async cancel(checkpoint: Record<string, unknown>): Promise<void> {
    if (checkpoint['url'] && this.provider === 'onedrive') await this.request(String(checkpoint['url']), { method: 'DELETE' }, false, [404, 410]);
    if (checkpoint['url'] && this.provider === 'google-drive') await this.request(String(checkpoint['url']), { method: 'DELETE' }, true, [404, 410, 499]);
    // Dropbox sessions have no abort operation; stopping further submission lets the provider expire them.
  }
  async mkdir(name: string, parent = this.folder): Promise<StorageItem> {
    const safe = path.posix.basename(name);
    if (this.provider === 'google-drive') {
      const folder = await this.assertScope(parent);
      return this.item(
        await this.json('https://www.googleapis.com/drive/v3/files', this.body({ name: safe, mimeType: 'application/vnd.google-apps.folder', parents: [folder.id] })),
      );
    }
    if (this.provider === 'onedrive') {
      await this.assertScope(parent);
      return this.item(await this.json(this.one(parent, '/children'), this.body({ name: safe, folder: {}, '@microsoft.graph.conflictBehavior': 'rename' })));
    }
    return this.item((await this.drop('files/create_folder_v2', { path: this.dropPath([parent, safe].join('/')), autorename: true })).metadata);
  }
  async move(id: string, name: string, parent = this.folder): Promise<StorageItem> {
    const current = await this.assertScope(id);
    if (this.provider === 'google-drive') {
      const target = await this.assertScope(parent),
        params = new URLSearchParams({ addParents: String(target.id), removeParents: (current.parents ?? []).join(',') });
      return this.item(await this.json(this.drive(id) + '?' + params, { ...this.body({ name: path.posix.basename(name) }), method: 'PATCH' }));
    }
    if (this.provider === 'onedrive') {
      const target = await this.assertScope(parent);
      return this.item(
        await this.json(this.one(id), {
          ...this.body({ name: path.posix.basename(name), parentReference: { id: target.id }, '@microsoft.graph.conflictBehavior': 'rename' }),
          method: 'PATCH',
        }),
      );
    }
    return this.item(
      (await this.drop('files/move_v2', { from_path: this.dropPath(id), to_path: this.dropPath([parent, path.posix.basename(name)].join('/')), autorename: true })).metadata,
    );
  }
  async remove(id: string): Promise<void> {
    await this.assertScope(id);
    if (this.provider === 'dropbox') {
      await this.drop('files/delete_v2', { path: this.dropPath(id) });
      return;
    }
    await this.request(this.provider === 'google-drive' ? this.drive(id) : this.one(id), { method: 'DELETE' });
  }
  async link(id: string): Promise<string> {
    const metadata = await this.assertScope(id);
    if (this.provider === 'google-drive') {
      if (!metadata.webViewLink) throw new Error('This file has no provider link.');
      return metadata.webViewLink;
    }
    if (this.provider === 'onedrive') {
      const result = await this.json(this.one(id, '/createLink'), this.body({ type: 'view', scope: this.connection.config['sharingScope'] || 'organization' }));
      return String(result.link.webUrl);
    }
    const result = await this.drop('sharing/create_shared_link_with_settings', { path: this.dropPath(id) });
    return String(result.url);
  }
}
