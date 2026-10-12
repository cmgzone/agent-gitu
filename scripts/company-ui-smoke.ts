import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { UI_HTML } from '../src/server/ui.js';
import { COMPANY_JS } from '../src/server/ui-companies.js';
import { COWORK_JS } from '../src/server/ui-cowork.js';
import { COMPANY_CONNECTIONS_JS } from '../src/server/ui-company-connections.js';
import { COMPANY_WALLETS_JS } from '../src/server/ui-company-wallets.js';
import { FILE_UPLOAD_JS } from '../src/server/ui-files.js';
import { CompanyStore } from '../src/company/store.js';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import { createHash } from 'node:crypto';
// All requests are fulfilled with synthetic fixtures. This never connects to a user runtime.
const store = new CompanyStore(mkdtempSync(path.join(os.tmpdir(), 'gitu-ui-fixture-'))),
  company = store.create({ name: 'Northstar Studio', purpose: 'Build helpful tools for small businesses', monthlyBudgetUsd: null, maxFileBytes: null }),
  lead = { id: 'preview-lead', name: 'Ari', tagline: 'Company lead', systemPrompt: 'Coordinate bounded work.', provider: 'preview', model: 'preview-model' };
store.update(company.id, { leadId: lead.id, conversationId: 'preview-chat' });
store.transition(company.id, 'running');
store.steer(company.id, 'Prepare a customer research summary.');
let fixture = {
  company: store.get(company.id),
  agents: [lead],
  missions: [],
  requests: [],
  actions: [],
  jobs: [],
  usage: [],
  totals: { knownCostUsd: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, unknownCostCalls: 0, calls: 0 },
};
const output = path.resolve(process.env['GITU_UI_SMOKE_OUTPUT'] ?? '.qa/company-ui');
mkdirSync(output, { recursive: true });
const chatMessages = [
  { id: 'preview-user', role: 'user', text: 'Prepare a customer research summary.' },
  { id: 'preview-agent', role: 'agent', agentName: 'Ari', text: 'I’ll collect the research, verify the findings, and report the decisions that need your input.' },
];
const sent: Array<{ text: string; delivery: string }> = [];
let computer = { state: 'stopped', control: 'shared' };
let storageConnections = [
  { id: 'storage-local', companyId: company.id, name: 'Read only files', provider: 'local', config: { folder: '/company/files' }, permissions: ['list'], capabilities: ['list'] },
  { id: 'storage-drive', companyId: company.id, name: 'Cloud files', provider: 'google-drive', config: { folder: 'granted-folder' }, permissions: ['list','read','upload'], capabilities: ['list','read','upload'] },
];
const storageTransfer = { id: 'transfer-demo', connectionId: 'storage-drive', name: 'report.pdf', state: 'failed', size: 100, offset: 50 };
const storageEdits: Record<string, unknown>[] = [];
const memoryEdits: Record<string, unknown>[] = [];
let memoryEntries = [{ id: 'memory-demo', claim: 'Use the original report format.', kind: 'preference', updatedAt: '2026-10-11T10:00:00Z' }];
let references = [
  { id: 'reference-local', connectionId: 'storage-local', item: { id: 'notes.txt', name: 'Local notes', folder: false } },
  { id: 'reference-cloud', connectionId: 'storage-drive', item: { id: 'cloud-file', name: 'Disconnected report', folder: false } },
];
let importedReference = false;
const original = Buffer.from('original');
let uploads = [
  { id: 'upload-resume', name: 'resume.any', mime: 'application/octet-stream', size: original.length, offset: 3, state: 'uploading', checksum: createHash('sha256').update(original).digest('hex') },
  { id: 'upload-cancel', name: 'cancel.any', mime: 'application/octet-stream', size: 8, offset: 2, state: 'uploading', checksum: 'a'.repeat(64) },
];
const uploadBytes = new Map<string, Buffer[]>([['upload-resume', [original.subarray(0, 3)]]]);
let uploadCreations = 0;
const browser = await chromium.launch({ headless: true, ...(process.env['GITU_UI_SMOKE_CHANNEL'] ? { channel: process.env['GITU_UI_SMOKE_CHANNEL'] } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const style = UI_HTML.match(/<style>([\s\S]*?)<\/style>/)![1],
    html =
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>' +
      style +
      '</style></head><body><script>var S={sel:{model:"preview::preview-model"}};function $(id){return document.getElementById(id);}function esc(v){return String(v).replace(/[&<>"\x27]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","\x27":"&#39;"}[c]||"&quot;";});}function toast(message){window.lastToast=message;}function shortDate(v){return new Date(v).toLocaleDateString();}function humanBytes(v){return (v/1048576).toFixed(1)+" MB";}function api(url,options){return fetch(url,options).then(async function(r){var value=await r.json();if(!r.ok)throw new Error(value.error);return value;});}function openSettings(){}' +
      FILE_UPLOAD_JS +
      COWORK_JS +
      COMPANY_JS +
      COMPANY_CONNECTIONS_JS +
      COMPANY_WALLETS_JS +
      '</script></body></html>';
  await page.route('**/*', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      suffix = url.pathname,
      method = request.method();
    let data: unknown = {};
    if (suffix === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (suffix === '/api/companies') {
      if (method === 'POST') {
        const c = store.create();
        fixture = { ...fixture, company: c, agents: [] };
        data = { company: c };
      } else data = { companies: store.companies().map((c) => ({ ...c, usage: fixture.totals, decisions: 0 })), usage: fixture.totals };
    } else if (suffix.endsWith('/policy')) data = { maxFileBytes: null };
    else if (suffix.endsWith('/lead')) {
      const body = request.postDataJSON();
      const c = store.update(fixture.company!.id, { leadId: lead.id, conversationId: 'preview-chat' });
      fixture = { ...fixture, company: c, agents: [{ ...lead, ...body }] };
      data = { company: c, agent: fixture.agents[0] };
    } else if (suffix.match(/^\/api\/companies\/company-[\w-]+$/)) {
      if (method === 'PATCH') fixture.company = store.update(fixture.company!.id, request.postDataJSON());
      data = fixture;
    } else if (suffix.endsWith('/chat')) {
      if (method === 'POST') {
        const message = request.postDataJSON();
        sent.push(message);
        chatMessages.push({ id: 'sent-' + sent.length, role: 'user', text: message.text });
      }
      data = {
        messages: chatMessages,
        artifacts: [],
        busy: false,
      };
    } else if (suffix.endsWith('/storage')) data = { connections: storageConnections, transfers: [storageTransfer], references: references.map(r => {
      const c = storageConnections.find(c => c.id === r.connectionId);
      return { ...r, connected: Boolean(c), readable: Boolean(c?.capabilities.includes('read')), connectionName: c?.name };
    }) };
    else if (suffix.endsWith('/storage/references/reference-local/import')) { importedReference = true; data = { file: { id: 'file-imported', state: 'ready' } }; }
    else if (suffix.includes('/storage/references/') && method === 'DELETE') { references = references.filter(r => !suffix.endsWith('/' + r.id)); data = { ok: true }; }
    else if (suffix.endsWith('/storage/storage-local/files')) data = { items: [{ id: 'file', name: 'notes.txt', size: 10, folder: false }], capabilities: storageConnections[0].capabilities };
    else if (suffix.endsWith('/storage/storage-drive/transfers/transfer-demo/cancel')) { storageTransfer.state = 'cancelled'; data = { ok: true }; }
    else if (suffix.includes('/storage/') && suffix.endsWith('/health')) data = { status: 'connected' };
    else if (suffix.endsWith('/storage/storage-local') && method === 'PATCH') {
      const edit = request.postDataJSON(); storageEdits.push(edit);
      storageConnections[0] = { ...storageConnections[0], ...edit, capabilities: edit.permissions };
      data = { connection: storageConnections[0] };
    } else if (suffix.endsWith('/storage/storage-drive') && method === 'DELETE') { storageConnections = storageConnections.filter(c => c.id !== 'storage-drive'); data = { ok: true }; }
    else if (suffix.endsWith('/mcp')) data = { servers: [], tools: [] };
    else if (suffix.endsWith('/wallets')) data = { wallets: [], transactions: [] };
    else if (suffix.endsWith('/computer')) {
      if (method === 'POST') {
        const action = request.postDataJSON().action;
        if (action === 'start') computer.state = 'running';
        else if (action === 'stop') computer.state = 'stopped';
        else if (action === 'take-control') computer.control = 'user';
        else if (action === 'return-control') computer.control = 'shared';
      }
      data = { computer };
    }
    else if (suffix.endsWith('/uploads')) {
      if (method === 'POST') {
        const value = request.postDataJSON(); uploadCreations++;
        const file = { ...value, id: 'upload-created-' + uploadCreations, offset: 0, state: 'uploading' }; uploads.push(file); uploadBytes.set(file.id, []); data = { file };
      } else data = { files: [...uploads, ...(importedReference ? [{ id: 'file-imported', name: 'notes.txt', size: 10, state: 'ready' }] : [])] };
    }
    else if (suffix.includes('/uploads/')) {
      const id = suffix.split('/uploads/')[1].split('/')[0], file = uploads.find(file => file.id === id);
      if (!file) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Upload missing' }) });
      if (method === 'DELETE') { uploads = uploads.filter(file => file.id !== id); uploadBytes.delete(id); data = { ok: true }; }
      else if (method === 'PATCH') {
        if (Number(request.headers()['upload-offset']) !== file.offset) throw new Error('UI resumed from the wrong offset.');
        const bytes = request.postDataBuffer()!;
        if (bytes.length > 5 * 1024 * 1024) throw new Error('UI exceeded the bounded chunk size.');
        uploadBytes.get(id)!.push(bytes); file.offset += bytes.length; data = { file };
      } else if (suffix.endsWith('/complete')) {
        const hash = createHash('sha256'); for (const bytes of uploadBytes.get(id)!) hash.update(bytes);
        if (file.offset !== file.size || hash.digest('hex') !== request.postDataJSON().checksum || file.checksum !== request.postDataJSON().checksum) throw new Error('UI published an unverified upload.');
        file.state = 'ready'; data = { file };
      } else data = { file };
    }
    else if (suffix.endsWith('/memory')) data = { entries: memoryEntries };
    else if (suffix.endsWith('/memory/memory-demo')) {
      if (method === 'PATCH') { const edit = request.postDataJSON(); memoryEdits.push(edit); memoryEntries[0] = { ...memoryEntries[0], ...edit }; }
      if (method === 'DELETE') memoryEntries = [];
      data = { ok: true };
    }
    else if (suffix === '/api/cowork/agents') data = { agents: [lead] };
    else if (suffix === '/api/connected-apps') data = { accounts: [] };
    else if (suffix === '/api/connections') data = { connections: [] };
    else if (suffix === '/api/skills') data = { skills: [] };
    else if (suffix === '/api/cowork/cloud-servers') data = { servers: [] };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('http://company-preview.invalid/');
  await page.evaluate(() => (window as unknown as { openCompanies: () => void }).openCompanies());
  await page.getByRole('button', { name: 'Open company', exact: true }).click();
  await page.getByRole('heading', { name: 'Current direction', exact: true }).waitFor();
  const desktop = page.locator('[data-company-computer]');
  await desktop.getByText('Stopped', { exact: true }).waitFor();
  if (await desktop.getByRole('button', { name: 'Stop', exact: true }).count()) throw new Error('Stopped computer showed Stop.');
  await desktop.getByRole('button', { name: 'Start', exact: true }).click();
  await desktop.getByRole('button', { name: 'Open desktop', exact: true }).waitFor();
  if (await desktop.getByRole('button', { name: 'Return control', exact: true }).count()) throw new Error('Agent-controlled desktop showed Return control.');
  await desktop.getByRole('button', { name: 'Take control', exact: true }).click();
  await desktop.getByRole('button', { name: 'Return control', exact: true }).waitFor();
  if (await desktop.getByRole('button', { name: 'Take control', exact: true }).count()) throw new Error('User-controlled desktop showed Take control.');
  await desktop.getByRole('button', { name: 'Return control', exact: true }).click();
  await desktop.getByRole('button', { name: 'Take control', exact: true }).waitFor();
  await desktop.getByRole('button', { name: 'Stop', exact: true }).click();
  await desktop.getByText('Stopped', { exact: true }).waitFor();
  console.log(await page.getByRole('tab', { selected: true }).evaluate(el => { const s = getComputedStyle(el); return { text: el.textContent, foreground: s.color, background: s.backgroundColor }; }));
  await page.screenshot({ path: path.join(output, 'overview-desktop.png'), fullPage: true });
  await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  await page.locator('#companyMessages .cw-row.me .cw-bubble').waitFor();
  await page.locator('#companyMessages .cw-row:not(.me) .cw-bubble').waitFor();
  await page.getByLabel('Message the company lead').fill('Does this answer change our goal?');
  await page.waitForTimeout(4200);
  if ((await page.getByLabel('Message the company lead').inputValue()) !== 'Does this answer change our goal?') throw new Error('Polling replaced the chat draft.');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  if ((await page.getByLabel('Message the company lead').inputValue()) !== 'Does this answer change our goal?') throw new Error('Changing tabs replaced the draft.');
  if ((await page.getByRole('button', { name: 'Ask', exact: true }).getAttribute('aria-pressed')) !== 'true') throw new Error('Changing tabs replaced delivery mode.');
  await page.getByLabel('Message the company lead').press('Shift+Enter');
  if (sent.length) throw new Error('Shift+Enter sent a message.');
  await page.getByLabel('Message the company lead').press('Enter');
  await page.waitForFunction(() => (document.getElementById('companyChatText') as HTMLTextAreaElement).value === '');
  if (sent.length !== 1 || sent[0].delivery !== 'question' || sent[0].text !== 'Does this answer change our goal?') throw new Error('Enter did not send the selected delivery mode.');
  await page.screenshot({ path: path.join(output, 'chat-desktop.png'), fullPage: true });
  await page.getByRole('tab', { name: 'Connections', exact: true }).click();
  const local = page.locator('#companyStorageCards article').filter({ has: page.getByRole('heading', { name: 'Read only files', exact: true }) });
  await local.waitFor();
  if (await local.getByRole('button', { name: 'Reconnect', exact: true }).count()) throw new Error('Local storage showed OAuth reconnect.');
  if (await local.getByRole('button', { name: 'Use for output', exact: true }).count()) throw new Error('Read-only storage could be selected for output.');
  await local.getByRole('button', { name: 'Browse', exact: true }).click();
  await page.getByText('Reading these files is not granted.', { exact: false }).waitFor();
  if (await page.locator('#companyStorageBrowser [data-storage-file], #companyStorageBrowser [data-storage-reference]').count()) throw new Error('Listing-only files exposed read operations.');
  await local.getByRole('button', { name: 'Edit', exact: true }).click();
  if ((await page.getByLabel('Granted folder path or provider folder ID').inputValue()) !== '/company/files') throw new Error('Editing storage lost its folder grant.');
  if (!(await page.getByLabel('Provider', { exact: true }).isDisabled())) throw new Error('Editing storage allowed changing providers.');
  if (!(await page.getByLabel('link', { exact: true }).isDisabled())) throw new Error('Local storage offered unsupported sharing links.');
  await page.getByLabel('read', { exact: true }).check();
  await page.getByRole('button', { name: 'Save connection', exact: true }).click();
  await page.getByRole('button', { name: 'Save connection', exact: true }).waitFor({ state: 'hidden' });
  if (storageEdits.length !== 1 || storageEdits[0]['config'] === undefined) throw new Error('Storage edits were not saved.');
  await local.getByRole('button', { name: 'Browse', exact: true }).click();
  await page.getByRole('button', { name: 'Attach reference', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Import', exact: true }).waitFor();
  const cloud = page.locator('#companyStorageCards article').filter({ has: page.getByRole('heading', { name: 'Cloud files', exact: true }) });
  await cloud.getByRole('button', { name: 'Edit', exact: true }).click();
  if ((await page.getByLabel('clientSecret', { exact: true }).inputValue()) !== '') throw new Error('Storage editor exposed saved credentials.');
  await page.locator('#storageClose').click();
  await page.getByRole('button', { name: 'Cancel transfer', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel transfer', exact: true }).waitFor({ state: 'hidden' });
  if (storageTransfer.state !== 'cancelled') throw new Error('Transfer cancellation was not sent.');
  await page.screenshot({ path: path.join(output, 'connections-desktop.png'), fullPage: true });
  page.once('dialog', dialog => dialog.accept());
  await cloud.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await cloud.waitFor({ state: 'hidden' });
  await page.getByRole('tab', { name: 'Files & Knowledge', exact: true }).click();
  const resumeRow = page.locator('#companyFileList li').filter({ hasText: 'resume.any' });
  const chooser = page.waitForEvent('filechooser');
  await resumeRow.getByRole('button', { name: 'Resume', exact: true }).click();
  await (await chooser).setFiles({ name: 'resume.any', mimeType: 'application/octet-stream', buffer: original });
  await resumeRow.getByRole('link', { name: 'Download', exact: true }).waitFor();
  if (uploadCreations !== 0) throw new Error('Resume created another upload.');
  const cancelRow = page.locator('#companyFileList li').filter({ hasText: 'cancel.any' });
  await cancelRow.getByRole('button', { name: 'Cancel', exact: true }).click();
  await cancelRow.waitFor({ state: 'hidden' });
  if (uploads.some(file => file.id === 'upload-cancel')) throw new Error('Saved upload was not cancelled.');
  await page.locator('#companyFilesInput').setInputFiles({ name: 'large-video.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(21 * 1024 * 1024, 7) });
  const largeRow = page.locator('#companyFileList li').filter({ hasText: 'large-video.mp4' });
  await largeRow.getByRole('link', { name: 'Download', exact: true }).waitFor({ timeout: 60000 });
  if (uploadCreations !== 1 || uploads.find(file => file.name === 'large-video.mp4')?.state !== 'ready') throw new Error('Large video did not upload and verify.');
  await page.getByRole('textbox', { name: 'Memory text', exact: true }).fill('Use the user’s latest report format.');
  await page.getByRole('button', { name: 'Save correction', exact: true }).click();
  await page.waitForFunction(() => (window as any).lastToast === 'Memory corrected');
  if (memoryEdits[0]?.['expectedUpdatedAt'] !== '2026-10-11T10:00:00Z' || memoryEntries[0].claim !== 'Use the user’s latest report format.') throw new Error('Memory correction lost the saved version or new text.');
  const disconnected = page.locator('#companyReferences article').filter({ has: page.getByText('Disconnected report', { exact: true }) });
  await disconnected.getByText('Connection disconnected', { exact: false }).waitFor();
  if (await disconnected.getByRole('button', { name: 'Import a copy', exact: true }).count()) throw new Error('Disconnected reference exposed import.');
  page.once('dialog', dialog => dialog.accept());
  await disconnected.getByRole('button', { name: 'Remove reference', exact: true }).click();
  await disconnected.waitFor({ state: 'hidden' });
  await page.locator('#companyReferences article').getByRole('button', { name: 'Import a copy', exact: true }).click();
  await page.locator('#companyFileList').getByText('notes.txt', { exact: false }).waitFor();
  if (!importedReference) throw new Error('Reference import was not sent.');
  await page.screenshot({ path: path.join(output, 'files-knowledge-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('Mobile knowledge controls overflowed.');
  await page.screenshot({ path: path.join(output, 'files-knowledge-mobile.png'), fullPage: true });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Archive memory', exact: true }).click();
  await page.getByText('No saved knowledge yet.', { exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const composer = await page.locator('#companySend').boundingBox();
  if (!composer || composer.y < 0 || composer.y + composer.height > 844) throw new Error('Mobile composer is outside the viewport.');
  await page.screenshot({ path: path.join(output, 'chat-mobile.png'), fullPage: true });
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('Mobile page overflowed.');
  await page.getByRole('button', { name: '← Companies', exact: true }).click();
  await page.getByRole('button', { name: 'Create company', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Preview Company');
  await page.getByLabel('Purpose and goals').fill('Produce useful reports');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Lead name').waitFor();
  if ((await page.getByLabel('Provider', { exact: true }).inputValue()) !== 'preview') throw new Error('Selected provider was parsed incorrectly.');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('heading', { name: 'Grant resources', exact: true }).waitFor();
  if (await page.getByLabel('Use my computer if the private computer is unavailable').isChecked()) throw new Error('Host access was enabled by default.');
  await page.getByLabel('Use my computer if the private computer is unavailable').check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Monthly AI budget', { exact: true }).selectOption('unlimited');
  await page.getByLabel('Maximum file size', { exact: true }).selectOption('inherit');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('heading', { name: 'Ready to start', exact: true }).waitFor();
  await page.getByText('Use my computer: Granted when private computer is unavailable', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'setup-review-mobile.png'), fullPage: true });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Synthetic company desktop/mobile flow passed. Screenshots: ' + output);
} finally {
  await browser.close();
  store.close();
}
