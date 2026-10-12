import type { IncomingMessage, ServerResponse } from 'node:http';
import type { StorageRegistry } from './registry.js';
import type { StorageConnection, StorageFileReference } from './types.js';
import type { StorageSecret } from './oauth.js';
import type { CompanyStore } from '../company/store.js';
import type { UploadStore } from '../files/uploads.js';
import type { McpManager } from '../mcp/client.js';
import { randomUUID } from 'node:crypto';
interface Deps {
  registry: StorageRegistry;
  store: CompanyStore;
  uploads: UploadStore;
  mcp: McpManager;
  limit: number | null;
  body: (req: IncomingMessage) => Promise<Record<string, unknown>>;
  send: (res: ServerResponse, status: number, value: unknown) => void;
}
export async function storageApi(req: IncomingMessage, res: ServerResponse, companyId: string, suffix: string, method: string, d: Deps): Promise<boolean> {
  const referenceMatch = suffix.match(/^\/storage\/references\/([\w-]+)(\/import)?$/);
  if (referenceMatch) {
    const reference = d.registry.references(companyId).find(r => r.id === referenceMatch[1]);
    if (!reference) d.send(res, 404, { error: 'File reference not found.' });
    else if (!referenceMatch[2] && method === 'DELETE') {
      d.registry.removeReference(companyId, reference.id);
      d.send(res, 200, { ok: true });
    } else if (referenceMatch[2] && method === 'POST') {
      const connection = d.registry.get(companyId, reference.connectionId);
      if (reference.grantChanged) throw new Error('This reference belongs to a different account or folder, or has no saved grant. Reattach the file from its current connection.');
      d.send(res, 201, { file: await importStorageFile(companyId, connection, reference.item.id, d) });
    } else d.send(res, 405, { error: 'Method not allowed.' });
    return true;
  }
  const match = suffix.match(/^\/storage(?:\/([\w-]+))?(\/.*)?$/);
  if (!match) return false;
  const id = match[1],
    action = match[2] ?? '';
  if (!id) {
    if (method === 'GET')
      d.send(res, 200, { connections: d.registry.list(companyId).map(c => ({ ...c, capabilities: d.registry.capabilities(c) })), transfers: d.store.list('transfer', companyId), references: d.registry.references(companyId) });
    else if (method === 'POST') {
      const body = await d.body(req);
      d.send(res, 201, { connection: d.registry.save(companyId, body as Partial<StorageConnection>, body['credentials'] as StorageSecret | undefined) });
    } else d.send(res, 405, { error: 'Method not allowed.' });
    return true;
  }
  const connection = d.registry.get(companyId, id);
  if (!action && method === 'DELETE') {
    d.registry.remove(companyId, id);
    d.send(res, 200, { ok: true });
    return true;
  }
  if (!action && method === 'PATCH') {
    const body = await d.body(req);
    d.send(res, 200, { connection: d.registry.save(companyId, { ...body, id }, body['credentials'] as StorageSecret | undefined) });
    return true;
  }
  if (action === '/authorize' && method === 'POST') {
    const origin = req.headers.origin;
    if (!origin) throw new Error('Open the company in your browser to connect storage.');
    const redirect = new URL(`/api/companies/${companyId}/storage/${id}/callback`, origin).href;
    d.send(res, 200, { authorizationUrl: d.registry.oauth.begin(connection, redirect), redirectUri: redirect });
    return true;
  }
  if (action === '/callback' && method === 'GET') {
    const params = new URL(req.url ?? '/', 'http://localhost').searchParams;
    await d.registry.oauth.finish(connection, params.get('code') ?? '', params.get('state') ?? '');
    d.store.enqueue(companyId, 'review', { reason: 'Storage connection updated' }, 'connection-' + id);
    res.writeHead(302, { location: '/?company=' + encodeURIComponent(companyId), 'cache-control': 'no-store' });
    res.end();
    return true;
  }
  // Cancellation must remain available even if provider configuration is broken.
  if (action.startsWith('/transfers/') && action.endsWith('/cancel') && method === 'POST') {
    await d.registry.cancel(connection, action.slice(11, -7), d.mcp);
    d.send(res, 200, { ok: true });
    return true;
  }
  const adapter = d.registry.adapter(connection, d.mcp);
  if (action === '/reference' && method === 'POST') {
    d.registry.authorize(connection, 'read');
    const authority = d.registry.authority(connection);
    const body = await d.body(req),
      fileId = String(body['id']);
    let item;
    if (adapter.metadata) item = await adapter.metadata(fileId);
    else {
      const read = await adapter.read(fileId);
      item = read.item;
      read.stream.destroy();
    }
    if (item.folder) throw new Error('Choose a file to attach by reference.');
    d.registry.authorize(connection, 'read');
    if (authority !== d.registry.authority(connection)) throw new Error('The storage account or folder changed. Reattach the file from its current connection.');
    const reference: StorageFileReference = { id: 'reference-' + randomUUID(), companyId, connectionId: id, item, authority, createdAt: new Date().toISOString() };
    d.store.saveResource('file-reference', reference.id, companyId, reference);
    d.send(res, 201, { reference });
    return true;
  }
  if (action === '/files' && method === 'GET') {
    d.registry.authorize(connection, 'list');
    const folder = new URL(req.url ?? '/', 'http://localhost').searchParams.get('folder') ?? undefined;
    d.send(res, 200, { items: await adapter.list(folder), capabilities: adapter.capabilities.filter((capability) => connection.permissions.includes(capability)) });
    return true;
  }
  if (action === '/health' && method === 'GET') {
    try {
      let quota;
      if (connection.permissions.includes('list')) await adapter.list();
      else if (!adapter.quota) {
        d.send(res, 200, { status: 'not_checked', capabilities: adapter.capabilities.filter((v) => connection.permissions.includes(v)) });
        return true;
      }
      if (adapter.quota) quota = await adapter.quota().catch(() => undefined);
      d.send(res, 200, { status: 'connected', quota, capabilities: adapter.capabilities.filter((v) => connection.permissions.includes(v)) });
    } catch {
      d.send(res, 200, { status: 'reconnect_or_check_configuration' });
    }
    return true;
  }
  if (action === '/upload' && method === 'POST') {
    const body = await d.body(req),
      file = d.uploads.get(String(body['artifactId'] ?? ''), companyId + ':company');
    if (!file || file.state !== 'ready') throw new Error('Choose a completed company upload.');
    if (d.limit !== null && file.size > d.limit) throw new Error('File exceeds your selected file-size limit.');
    d.send(res, 200, { item: await d.registry.upload(connection, d.uploads.filePath(file), String(body['name'] ?? file.name), d.mcp) });
    return true;
  }
  if (action === '/import' && method === 'POST') {
    const body = await d.body(req);
    d.send(res, 201, { file: await importStorageFile(companyId, connection, String(body['id']), d) });
    return true;
  }
  if (action === '/operation' && method === 'POST') {
    const body = await d.body(req),
      operation = String(body['operation']),
      fileId = String(body['id'] ?? '');
    if (operation === 'mkdir') {
      d.registry.authorize(connection, 'mkdir');
      if (!adapter.mkdir) throw new Error('Folder creation is unsupported.');
      d.send(res, 200, { item: await adapter.mkdir(String(body['name']), body['parent'] ? String(body['parent']) : undefined) });
    } else if (operation === 'move') {
      d.registry.authorize(connection, 'move');
      if (!adapter.move) throw new Error('Moving is unsupported.');
      d.send(res, 200, { item: await adapter.move(fileId, String(body['name']), body['parent'] ? String(body['parent']) : undefined) });
    } else if (operation === 'delete') {
      d.registry.authorize(connection, 'delete');
      if (!adapter.remove) throw new Error('Deleting is unsupported.');
      await adapter.remove(fileId);
      d.send(res, 200, { ok: true });
    } else if (operation === 'link') {
      d.registry.authorize(connection, 'link');
      if (!adapter.link) throw new Error('Provider links are unsupported.');
      d.send(res, 200, { url: await adapter.link(fileId) });
    } else d.send(res, 400, { error: 'Unsupported storage operation.' });
    return true;
  }
  d.send(res, 404, { error: 'Storage route not found.' });
  return true;
}
async function importStorageFile(companyId: string, connection: StorageConnection, fileId: string, d: Deps) {
  const download = await d.registry.download(connection, fileId, d.store.workspace(companyId) + '/transfers', d.limit, d.mcp);
  try {
    return await d.uploads.importFile(companyId + ':company', { name: download.item.name, mime: download.item.mime, sourcePath: download.file }, d.limit);
  } finally {
    const { rmSync } = await import('node:fs');
    rmSync(download.file, { force: true });
  }
}
