import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { GituServer } from '../src/server/server.js';
import { coworkDocumentPreview } from '../src/cowork/document-preview.js';
import { pdfPreviewAsset } from '../src/cowork/pdf-preview.js';
import type { CoworkArtifact } from '../src/cowork/store.js';

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); vi.unstubAllEnvs(); });

it('recognizes PDFs by MIME or extension without exposing file bytes or executable names in HTML', () => {
  const artifact: CoworkArtifact = { id: 'cf-pdf', conversationId: 'fixture', name: 'report.PDF', mime: 'text/plain', size: 2000, storageName: 'fixture', createdAt: new Date().toISOString() };
  const html = coworkDocumentPreview('unused', artifact, { theme: 'light', embedded: true });
  expect(html).toContain('data-theme="light"');
  expect(html).toContain('data-pdf-url="/api/cowork/artifacts/cf-pdf?inline=1"');
  expect(html).toContain('src="/vendor/gitu-pdf-preview.js"');
  expect(html).not.toContain('<header>');
  const named = coworkDocumentPreview('unused', { ...artifact, name: '</title><script>alert(1)</script>', mime: 'application/pdf' });
  expect(named).toContain('&lt;/title&gt;&lt;script&gt;');
  expect(named).not.toContain('<script>alert(1)');
});

it('serves a protected PDF renderer while retaining original downloads, byte ranges and inert document previews', async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'gitu-pdf-preview-'));
  vi.stubEnv('AGENT_GITU_HOME', home);
  const server = new GituServer({ cwd: home, port: 0, mailInboxWatching: false });
  cleanup.push(async () => { await server.stop(); rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); });
  const store = (server as any).cowork();
  const agent = store.saveAgent({ name: 'PDF fixture', systemPrompt: 'Preview fixture' });
  const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
  const pdf = await PDFDocument.create(); pdf.addPage().drawText('PDF preview regression');
  const bytes = await pdf.save();
  const artifact = store.addArtifact({ conversationId: conversation.id, name: 'report.pdf', dataBase64: Buffer.from(bytes).toString('base64') });
  const text = store.addArtifact({ conversationId: conversation.id, name: 'notes.txt', dataBase64: Buffer.from('<script>not executable</script>').toString('base64') });
  const base = 'http://127.0.0.1:' + await server.start(), route = '/api/cowork/artifacts/' + artifact.id;
  expect((await fetch(base + route + '/preview')).status).toBe(401);
  expect((await fetch(base + route + '?inline=1')).status).toBe(401);
  const owner = { name: 'Owner', email: 'owner@example.test', password: 'Disposable PDF test passphrase' };
  const post = (url: string) => fetch(base + url, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify(owner) });
  expect((await post('/api/auth/register')).status).toBe(201);
  const cookie = (await post('/api/auth/login')).headers.get('set-cookie')!.split(';')[0]!;
  const headers = { cookie };
  const preview = await fetch(base + route + '/preview?embedded=1', { headers });
  expect(preview.status).toBe(200);
  expect(preview.headers.get('content-type')).toContain('text/html');
  expect(preview.headers.get('content-security-policy')).toContain("worker-src 'self'");
  expect(await preview.text()).toContain('aria-label="PDF controls"');
  const head = await fetch(base + route + '/preview', { method: 'HEAD', headers });
  expect(head.status).toBe(200); expect(await head.text()).toBe('');
  const raw = await fetch(base + route, { headers });
  expect(raw.headers.get('content-disposition')).toContain('attachment;');
  expect(Buffer.from(await raw.arrayBuffer())).toEqual(Buffer.from(bytes));
  const range = await fetch(base + route + '?inline=1', { headers: { ...headers, range: 'bytes=0-4' } });
  expect(range.status).toBe(206); expect(await range.text()).toBe('%PDF-');
  const other = await fetch(base + '/api/cowork/artifacts/' + text.id + '/preview', { headers });
  expect(other.headers.get('content-security-policy')).not.toContain('script-src');
  expect(await other.text()).toContain('&lt;script&gt;not executable&lt;/script&gt;');
  for (const asset of ['/vendor/gitu-pdf-preview.js', '/vendor/pdfjs/legacy/build/pdf.mjs', '/vendor/pdfjs/legacy/build/pdf.worker.mjs']) {
    const response = await fetch(base + asset, { headers });
    expect(response.status).toBe(200); expect(response.headers.get('content-type')).toContain('text/javascript');
    await response.body?.cancel();
  }
  expect((await fetch(base + '/vendor/pdfjs/package.json', { headers })).status).toBe(404);
  const service = server as any, company = service.companies().create({ name: 'PDF team' });
  const companyFile = service.companyScope.run({ id: company.id, version: company.directionVersion }, () => {
    const companyStore = service.cowork(), member = companyStore.saveAgent({ name: 'Company PDF fixture', systemPrompt: 'Preview fixture' });
    const chat = companyStore.saveConversation({ kind: 'dm', memberIds: [member.id] });
    return companyStore.addArtifact({ conversationId: chat.id, name: 'company.pdf', dataBase64: Buffer.from(bytes).toString('base64') });
  });
  const companyRoute = '/api/companies/' + company.id + '/cowork/artifacts/' + companyFile.id;
  const companyPreview = await fetch(base + companyRoute + '/preview', { headers });
  expect(companyPreview.status).toBe(200);
  expect(await companyPreview.text()).toContain('data-pdf-url="' + companyRoute + '?inline=1"');
  expect((await fetch(base + companyRoute + '?inline=1', { headers })).status).toBe(200);
  expect((await fetch(base + '/api/cowork/artifacts/' + companyFile.id, { headers })).status).toBe(404);
}, 30000);

it('restricts PDF.js file serving to runtime assets', () => {
  expect(pdfPreviewAsset('/vendor/pdfjs/legacy/build/pdf.mjs')?.mime).toContain('javascript');
  expect(pdfPreviewAsset('/vendor/pdfjs/wasm/openjpeg.wasm')?.mime).toBe('application/wasm');
  for (const name of ['../package.json', 'standard_fonts/../../package.json', 'legacy/build/../../../server.js', 'cmaps/%2e%2e/secret.bcmap']) expect(pdfPreviewAsset('/vendor/pdfjs/' + name)).toBeUndefined();
});
