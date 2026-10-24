import { CUSTOM_CONNECTION_JS } from '../src/server/ui-custom-connection.js';
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { UI_HTML } from '../src/server/ui.js';
import { COMPANY_JS } from '../src/server/ui-companies.js';
import { COWORK_JS } from '../src/server/ui-cowork.js';
import { COMPANY_CONNECTIONS_JS } from '../src/server/ui-company-connections.js';
import { COMPANY_WALLETS_JS } from '../src/server/ui-company-wallets.js';
import { CONNECTED_APPS_JS } from '../src/server/ui-connected-apps.js';
import { FILE_UPLOAD_JS } from '../src/server/ui-files.js';
import { CompanyStore } from '../src/company/store.js';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import { createHash } from 'node:crypto';
import type { CompanyAction } from '../src/company/store.js';
import { MAIL_PROVIDERS } from '../src/connections/mail.js';
import { FONT_FILES, CHARACTER_FILES } from '../src/server/static-assets.js';
import { companyDashboard } from '../src/company/dashboard.js';
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
  requests: [] as Array<{
    id: string;
    status: string;
    kind: string;
    title: string;
    detail: string;
    agentId: string;
    response?: string;
    appConnection?: { service: string; name: string };
  }>,
  actions: [
    {
      id: 'stale-decision',
      companyId: company.id,
      agentId: lead.id,
      tool: 'Old campaign approval',
      digest: 'stale',
      version: 0,
      state: 'pending',
      parameters: {},
      createdAt: '2026-10-11T10:00:00Z',
    },
    {
      id: 'completed-decision',
      companyId: company.id,
      agentId: lead.id,
      tool: 'Completed email approval',
      digest: 'done',
      version: 1,
      state: 'done',
      parameters: {},
      createdAt: '2026-10-11T10:00:00Z',
    },
    {
      id: 'current-decision',
      companyId: company.id,
      agentId: lead.id,
      tool: 'Send research email',
      digest: 'current',
      version: 1,
      state: 'pending',
      parameters: { draft: 'Long message '.repeat(100), reference: 'x'.repeat(700) },
      createdAt: '2026-10-11T10:00:00Z',
    },
  ] as CompanyAction[],
  jobs: [] as any[],
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
let composioConfigured = false;
let appAccounts: Array<{ id: string; toolkit: string; status: string; disabled: boolean; label?: string; address?: string }> = [];
let appAssignments: Record<string, string[]> = {};
const appPosts: Array<{ path: string; body: Record<string, unknown> }> = [];
const recoveryPosts: Record<string, unknown>[] = [];
const uiCalls: Array<{ path: string; method: string; body: string | null }> = [];
let teamMissions: { id: string; agentId: string; goal: string; status: string; progress: string; blockers?: string; result?: string }[] = [];
let teamHelpers: { id: string; rootAgentId: string; role: string; objective: string; status: string }[] = [];
let liveActivity: { agentId: string; agentName: string; phase: string; tool?: string }[] = [];
let computer = { state: 'stopped', control: 'shared' };
let storageConnections = [
  { id: 'storage-local', companyId: company.id, name: 'Read only files', provider: 'local', config: { folder: '/company/files' }, permissions: ['list'], capabilities: ['list'] },
  {
    id: 'storage-drive',
    companyId: company.id,
    name: 'Cloud files',
    provider: 'google-drive',
    config: { folder: 'granted-folder' },
    permissions: ['list', 'read', 'upload'],
    capabilities: ['list', 'read', 'upload'],
  },
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
  {
    id: 'upload-resume',
    name: 'resume.any',
    mime: 'application/octet-stream',
    size: original.length,
    offset: 3,
    state: 'uploading',
    checksum: createHash('sha256').update(original).digest('hex'),
  },
  { id: 'upload-cancel', name: 'cancel.any', mime: 'application/octet-stream', size: 8, offset: 2, state: 'uploading', checksum: 'a'.repeat(64) },
];
const uploadBytes = new Map<string, Buffer[]>([['upload-resume', [original.subarray(0, 3)]]]);
let uploadCreations = 0;
let customConnection: Record<string, any> | undefined,
  customCreates = 0,
  customTestFails = true;
const browser = await chromium.launch({ headless: true, ...(process.env['GITU_UI_SMOKE_CHANNEL'] ? { channel: process.env['GITU_UI_SMOKE_CHANNEL'] } : {}) });
let failurePage: import('playwright').Page | undefined;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
    errors: string[] = [];
  failurePage = page;
  page.on('pageerror', (e) => {
    errors.push(e.message);
    console.error('Page error:', e.message);
  });
  const style = UI_HTML.match(/<style>([\s\S]*?)<\/style>/)![1],
    html =
      '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>' +
      style +
      '</style></head><body><script>var S={active:"cowork",sel:{model:"preview::preview-model"}};function $(id){return document.getElementById(id);}function esc(v){return String(v).replace(/[&<>"\x27]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","\x27":"&#39;"}[c]||"&quot;";});}function toast(message){window.lastToast=message;}function shortDate(v){return new Date(v).toLocaleDateString();}function humanBytes(v){return (v/1048576).toFixed(1)+" MB";}function api(url,options){return fetch(url,options).then(async function(r){var value=await r.json();if(!r.ok)throw new Error(value.error);return value;});}function openSettings(){}' +
      FILE_UPLOAD_JS +
      COWORK_JS +
      CONNECTED_APPS_JS +
      CUSTOM_CONNECTION_JS +
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
    uiCalls.push({ path: suffix, method, body: request.postData() });
    if (suffix.startsWith('/fonts/') && FONT_FILES[path.basename(suffix)])
      return route.fulfill({ contentType: 'font/woff2', body: readFileSync(path.join('assets/fonts', path.basename(suffix))) });
    if (suffix.startsWith('/characters/') && CHARACTER_FILES[path.basename(suffix)])
      return route.fulfill({ contentType: 'image/png', body: readFileSync(path.join('assets/cowork-dots', path.basename(suffix))) });
    if (suffix === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (suffix === '/api/companies') {
      if (method === 'POST') {
        const c = store.create();
        fixture = { ...fixture, company: c, agents: [] };
        data = { company: c };
      } else data = { companies: store.companies().map((c) => ({ ...c, usage: fixture.totals, decisions: 0 })), usage: fixture.totals };
    } else if (suffix.includes('/api/companies/') && suffix.endsWith('/connected-apps')) {
      if (appAccounts.some((a) => a.toolkit === 'mail' && a.status === 'ACTIVE' && appAssignments[a.id]?.includes(lead.id)))
        fixture.requests.forEach((r) => {
          if (r.appConnection?.service === 'mail') r.status = 'accepted';
        });
      data = {
        configured: composioConfigured,
        canConfigure: true,
        services: composioConfigured ? [{ slug: 'gmail', name: 'Gmail' }] : [],
        accounts: appAccounts,
        availableAccounts: [],
        agents: fixture.agents,
        assignments: appAssignments,
        mail: { providers: MAIL_PROVIDERS, accounts: [], available: [] },
      };
    } else if (suffix.includes('/connected-apps/') && method === 'POST') {
      const value = request.postDataJSON();
      appPosts.push({ path: suffix, body: { ...value, password: undefined, apiKey: undefined } });
      if (suffix.endsWith('/configure')) composioConfigured = true;
      else if (suffix.endsWith('/connect')) {
        appAccounts.push({ id: 'app-gmail', toolkit: 'gmail', status: 'PENDING', disabled: false });
        appAssignments['app-gmail'] = value.agentIds;
        data = { url: 'https://connect.composio.dev/fixture', accountId: 'app-gmail' };
      } else if (suffix.endsWith('/mail')) {
        appAccounts.push({ id: 'app-mail', toolkit: 'mail', status: 'ACTIVE', disabled: false, label: 'Support inbox', address: value.address });
        appAssignments['app-mail'] = value.agentIds;
        data = { account: appAccounts.at(-1) };
      } else if (suffix.endsWith('/disconnect')) {
        appAccounts = appAccounts.filter((a) => a.id !== value.accountId);
        delete appAssignments[value.accountId];
      } else if (suffix.endsWith('/access')) appAssignments[value.accountId] = value.agentIds;
    } else if (suffix.endsWith('/policy')) data = { maxFileBytes: null };
    else if (suffix.endsWith('/lead')) {
      const body = request.postDataJSON();
      const c = store.update(fixture.company!.id, { leadId: lead.id, conversationId: 'preview-chat' });
      fixture = { ...fixture, company: c, agents: [{ ...lead, ...body }] };
      data = { company: c, agent: fixture.agents[0] };
    } else if (suffix.match(/^\/api\/companies\/company-[\w-]+$/)) {
      if (method === 'PATCH') fixture.company = store.update(fixture.company!.id, request.postDataJSON());
      data = { ...fixture, missions: teamMissions, helpers: teamHelpers, activity: liveActivity };
    } else if (suffix.endsWith('/dashboard')) {
      data = { ...companyDashboard(store, fixture.company!, Number(url.searchParams.get('days') || 14)), missions: teamMissions, helpers: teamHelpers, jobs: fixture.jobs };
    } else if (suffix.endsWith('/status')) {
      data = {
        id: fixture.company!.id,
        name: fixture.company!.name,
        state: fixture.company!.state,
        direction: fixture.company!.direction,
        directionVersion: fixture.company!.directionVersion,
        agents: fixture.agents,
        requests: fixture.requests,
        actions: fixture.actions.filter((a) => a.state === 'uncertain' || (a.state === 'pending' && a.version === fixture.company!.directionVersion)),
        activity: liveActivity,
        jobs: fixture.jobs,
        missions: teamMissions,
        helpers: teamHelpers,
        pendingDecisions: fixture.actions.filter((a) => a.state === 'pending' && a.version === fixture.company!.directionVersion).length,
      };
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
        requests: fixture.requests,
      };
    } else if (suffix.endsWith('/storage'))
      data = {
        connections: storageConnections,
        transfers: [storageTransfer],
        references: references.map((r) => {
          const c = storageConnections.find((c) => c.id === r.connectionId);
          return { ...r, connected: Boolean(c), readable: Boolean(c?.capabilities.includes('read')), connectionName: c?.name };
        }),
      };
    else if (suffix.endsWith('/storage/references/reference-local/import')) {
      importedReference = true;
      data = { file: { id: 'file-imported', state: 'ready' } };
    } else if (suffix.includes('/storage/references/') && method === 'DELETE') {
      references = references.filter((r) => !suffix.endsWith('/' + r.id));
      data = { ok: true };
    } else if (suffix.endsWith('/storage/storage-local/files'))
      data = { items: [{ id: 'file', name: 'notes.txt', size: 10, folder: false }], capabilities: storageConnections[0].capabilities };
    else if (suffix.endsWith('/storage/storage-drive/transfers/transfer-demo/cancel')) {
      storageTransfer.state = 'cancelled';
      data = { ok: true };
    } else if (suffix.includes('/storage/') && suffix.endsWith('/health')) data = { status: 'connected' };
    else if (suffix.endsWith('/storage/storage-local') && method === 'PATCH') {
      const edit = request.postDataJSON();
      storageEdits.push(edit);
      storageConnections[0] = { ...storageConnections[0], ...edit, capabilities: edit.permissions };
      data = { connection: storageConnections[0] };
    } else if (suffix.endsWith('/storage/storage-drive') && method === 'DELETE') {
      storageConnections = storageConnections.filter((c) => c.id !== 'storage-drive');
      data = { ok: true };
    } else if (suffix.endsWith('/mcp')) data = { servers: [], tools: [] };
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
    } else if (suffix.endsWith('/uploads')) {
      if (method === 'POST') {
        const value = request.postDataJSON();
        uploadCreations++;
        const file = { ...value, id: 'upload-created-' + uploadCreations, offset: 0, state: 'uploading' };
        uploads.push(file);
        uploadBytes.set(file.id, []);
        data = { file };
      } else data = { files: [...uploads, ...(importedReference ? [{ id: 'file-imported', name: 'notes.txt', size: 10, state: 'ready' }] : [])] };
    } else if (suffix.includes('/uploads/')) {
      const id = suffix.split('/uploads/')[1].split('/')[0],
        file = uploads.find((file) => file.id === id);
      if (!file) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Upload missing' }) });
      if (method === 'DELETE') {
        uploads = uploads.filter((file) => file.id !== id);
        uploadBytes.delete(id);
        data = { ok: true };
      } else if (method === 'PATCH') {
        if (Number(request.headers()['upload-offset']) !== file.offset) throw new Error('UI resumed from the wrong offset.');
        const bytes = request.postDataBuffer()!;
        if (bytes.length > 5 * 1024 * 1024) throw new Error('UI exceeded the bounded chunk size.');
        uploadBytes.get(id)!.push(bytes);
        file.offset += bytes.length;
        data = { file };
      } else if (suffix.endsWith('/complete')) {
        const hash = createHash('sha256');
        for (const bytes of uploadBytes.get(id)!) hash.update(bytes);
        if (file.offset !== file.size || hash.digest('hex') !== request.postDataJSON().checksum || file.checksum !== request.postDataJSON().checksum)
          throw new Error('UI published an unverified upload.');
        file.state = 'ready';
        data = { file };
      } else data = { file };
    } else if (suffix.endsWith('/memory')) data = { entries: memoryEntries };
    else if (suffix.endsWith('/memory/memory-demo')) {
      if (method === 'PATCH') {
        const edit = request.postDataJSON();
        memoryEdits.push(edit);
        memoryEntries[0] = { ...memoryEntries[0], ...edit };
      }
      if (method === 'DELETE') memoryEntries = [];
      data = { ok: true };
    } else if (suffix === '/api/models')
      data = {
        providers: [
          { id: 'preview', label: 'Preview provider', usable: true, models: [{ id: 'preview-model' }, { id: 'preview-model-2' }], defaultModel: 'preview-model' },
          { id: 'second-provider', label: 'Another provider', usable: true, models: [{ id: 'second-model' }] },
          { id: 'not-connected', label: 'Disconnected provider', usable: false, models: [{ id: 'unavailable-model' }] },
        ],
      };
    else if (suffix.endsWith('/actions/current-decision')) {
      fixture.actions.find((a) => a.id === 'current-decision')!.state = request.postDataJSON().state;
      data = { ok: true };
    } else if (suffix.endsWith('/actions/recovery-mail')) {
      const value = request.postDataJSON();
      recoveryPosts.push(value);
      fixture.actions.find((a) => a.id === 'recovery-mail')!.state = value.resolution === 'confirmed-done' ? 'done' : 'approved';
      data = { ok: true };
    } else if (/\/cowork\/requests\/ui-question-/.test(suffix)) {
      const value = request.postDataJSON(),
        card = fixture.requests.find((r) => suffix.endsWith('/' + r.id))!;
      card.status = 'answered';
      card.response = value.response;
      data = { ok: true };
    } else if (suffix === '/api/cowork/agents') data = { agents: [lead] };
    else if (suffix === '/api/connected-apps') data = { accounts: [] };
    else if (suffix === '/api/connections' && method === 'POST') {
      customCreates++;
      customConnection = { ...request.postDataJSON(), id: 'fixture-search', token: undefined };
      data = { connection: customConnection };
    } else if (suffix === '/api/connections/fixture-search/test') {
      if (customTestFails) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Search provider rejected its key.' }) });
      data = { ok: true };
    } else if (suffix === '/api/connections') data = { connections: customConnection ? [customConnection] : [] };
    else if (suffix === '/api/skills') data = { skills: Array.from({ length: 90 }, (_, index) => ({ name: 'Skill ' + index })) };
    else if (suffix === '/api/cowork/cloud-servers') data = { servers: [] };
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('http://company-preview.invalid/');
  await page.evaluate(() => (window as unknown as { openCompanies: () => void }).openCompanies());
  await page.getByRole('button', { name: 'Open company', exact: true }).click();
  await page.getByRole('heading', { name: 'Current direction', exact: true }).waitFor();
  if ((await page.locator('[aria-label="Cowork workspace"] button').allTextContents()).join(',') !== 'Cowork,Companies') throw new Error('Companies is not inside the Cowork workspace.');
  if (await page.getByText('Old campaign approval', { exact: false }).count()) throw new Error('A previous direction still appears as a decision.');
  if (await page.getByText('Completed email approval', { exact: false }).count()) throw new Error('A completed action still appears as a decision.');
  await page.getByText('Send research email', { exact: false }).waitFor();
  if (await page.locator('.company-decision-list').evaluate((el) => el.getBoundingClientRect().height > 361)) throw new Error('Decision details are unbounded.');
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.locator('#companyPage').evaluate((el) => el.scrollWidth > el.clientWidth)) throw new Error('Long decision parameters overflow the company page.');
  await page.screenshot({ path: path.join(output, 'decisions-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Approve once', exact: true }).click();
  await page.getByText('No actions need your approval.', { exact: true }).waitFor();
  fixture.company!.access = 'full';
  fixture.requests = [
    {
      id: 'ui-question-overview',
      status: 'open',
      kind: 'question',
      title: 'Choose the next market',
      detail: 'Which customer group should the team research next?',
      agentId: lead.id,
    },
  ];
  fixture.actions.push(
    {
      id: 'recovery-command',
      companyId: company.id,
      agentId: lead.id,
      tool: 'run_command',
      digest: 'cmd',
      version: 1,
      state: 'uncertain',
      parameters: { command: 'internal-pdf-check' },
      createdAt: '2026-10-13T09:00:00Z',
    },
    {
      id: 'recovery-mail',
      companyId: company.id,
      agentId: lead.id,
      tool: 'connected_apps',
      digest: 'mail',
      version: 1,
      state: 'uncertain',
      parameters: { service: 'mail', tool: 'mail_send', args: { to: 'customer@example.invalid', subject: 'Customer research report', text: 'Here is the reviewed report.' } },
      createdAt: '2026-10-13T09:01:00Z',
    },
  );
  await page.evaluate(() => (window as any).companyLoad());
  await page.locator('#companyDecisions').getByRole('heading', { name: 'Choose the next market', exact: true }).waitFor();
  if (await page.getByText('internal-pdf-check', { exact: false }).count()) throw new Error('Full access still asks the owner to reconcile a command.');
  fixture.actions.find((a) => a.id === 'recovery-command')!.state = 'agent-managed';
  if (await page.getByText('Questions & recovery', { exact: true }).count()) throw new Error('Questions remain below the team.');
  const review = page.locator('[data-company-recovery="recovery-mail"]');
  if (await review.locator('pre').isVisible()) throw new Error('Raw action JSON is exposed by default.');
  await review.locator('summary').first().click();
  await review.getByRole('button', { name: 'Save result', exact: true }).click();
  if (recoveryPosts.length) throw new Error('An unchecked result was submitted.');
  await review.getByRole('button', { name: 'I’m not sure', exact: true }).click();
  if (recoveryPosts.length) throw new Error('Unsure marked the action complete.');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: path.join(output, 'attention-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.locator('#companyPage').evaluate((el) => el.scrollWidth > el.clientWidth)) throw new Error('Attention overflows on mobile.');
  await page.screenshot({ path: path.join(output, 'attention-mobile.png'), fullPage: true });
  await review.locator('summary').first().click();
  await review.getByLabel('What did you find?', { exact: true }).selectOption('confirmed-done');
  await review.getByLabel('How did you check?', { exact: true }).fill('Found the report in Sent with the matching recipient and subject.');
  await review.getByRole('button', { name: 'Save result', exact: true }).click();
  await review.waitFor({ state: 'detached' });
  if (recoveryPosts.length !== 1) throw new Error('The action result was recorded more than once.');
  const answer = page.locator('#companyDecisions').getByRole('textbox', { name: /^Answer:/ });
  await answer.fill('Independent pharmacies');
  await page.evaluate(() => (window as any).companyOverviewRefresh());
  if ((await answer.inputValue()) !== 'Independent pharmacies') throw new Error('Live status discarded a question draft.');
  await page.getByRole('button', { name: 'Send answer', exact: true }).click();
  await page.getByRole('heading', { name: 'Choose the next market', exact: true }).waitFor({ state: 'detached' });
  fixture.requests = [
    { id: 'ui-question-chat', status: 'open', kind: 'question', title: 'Choose the report format', detail: 'Would you like a document or a presentation?', agentId: lead.id },
  ];
  await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  await page.locator('#companyChatQuestions').getByRole('heading', { name: 'Choose the report format', exact: true }).waitFor();
  await page.locator('#companyChatQuestions').getByRole('textbox', { name: /^Answer:/ }).fill('A document');
  chatMessages.push({ id: 'new-progress', role: 'agent', text: 'The findings are ready for your review.' });
  await page.evaluate(() => (window as any).companyChatRefresh());
  if ((await page.locator('#companyChatQuestions').getByRole('textbox', { name: /^Answer:/ }).inputValue()) !== 'A document')
    throw new Error('New messages discarded the question answer.');
  await page.screenshot({ path: path.join(output, 'question-chat-mobile.png'), fullPage: true });
  await page.locator('#companyChatQuestions').getByRole('button', { name: 'Send answer', exact: true }).click();
  await page.locator('#companyChatQuestions [data-question-form]').waitFor({ state: 'detached' });
  await page.locator('#companyChatQuestions .chat-question-answer').getByText('A document', { exact: false }).waitFor();
  fixture.requests = [];
  fixture.company!.access = 'supervised';
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.locator('#companyChartPanels .company-chart').first().waitFor();
  if ((await page.locator('#companyChartPanels .company-chart').count()) !== 4) throw new Error('The performance dashboard is missing a chart.');
  await page.getByRole('button', { name: '7 days', exact: true }).click();
  await page.locator('#companyChartPanels').getByText('Last 7 days', { exact: false }).first().waitFor();
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => document.documentElement.setAttribute('data-theme', theme), theme);
    if (
      !(await page.locator('#companyPage').evaluate((el) => {
        const expected = document.createElement('div');
        expected.style.background = 'var(--cw-chat-surface)';
        expected.hidden = true;
        document.body.appendChild(expected);
        const actualStyle = getComputedStyle(el),
          expectedStyle = getComputedStyle(expected);
        const matches = actualStyle.backgroundImage === expectedStyle.backgroundImage && actualStyle.backgroundColor === expectedStyle.backgroundColor;
        expected.remove();
        return matches;
      }))
    )
      throw new Error('Company mode did not inherit the app theme.');
    if (
      !(await page.locator('.company-mode-nav [aria-current="page"]').evaluate((el) => {
        const style = getComputedStyle(el);
        return style.color !== getComputedStyle(el.closest('nav')!).backgroundColor && style.visibility !== 'hidden';
      }))
    )
      throw new Error('The selected Company mode is unreadable in this theme.');
    await page.screenshot({ path: path.join(output, 'overview-' + theme + '.png'), fullPage: true });
  }
  const selectedTab = () => page.getByRole('tab', { selected: true });
  await selectedTab().focus();
  liveActivity = [{ agentId: lead.id, agentName: lead.name, phase: 'working', tool: 'connected_apps' }];
  await page.locator('#companyActivity').getByText('Ari · Using connected apps', { exact: true }).waitFor();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  if ((await page.locator('#companyActivity [data-live-working]').evaluate((el) => getComputedStyle(el, '::before').animationName)) !== 'none')
    throw new Error('Reduced motion still animates live activity.');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  if ((await page.locator('#companyActivity [data-live-working]').evaluate((el) => getComputedStyle(el, '::before').animationName)) !== 'company-working')
    throw new Error('Live activity motion is missing.');
  if (!(await selectedTab().evaluate((el) => el === document.activeElement))) throw new Error('Live activity refresh replaced the focused navigation.');
  await page.screenshot({ path: path.join(output, 'activity-desktop.png'), fullPage: true });
  liveActivity = [];
  await page.locator('#companyActivity').getByText('Between reviews', { exact: true }).waitFor();
  await page.keyboard.press('ArrowRight');
  if ((await selectedTab().textContent()) !== 'Chat') throw new Error('Keyboard navigation did not select the next company section.');
  await page.keyboard.press('End');
  if ((await selectedTab().textContent()) !== 'Settings') throw new Error('End did not reach the last company section.');
  await page.keyboard.press('ArrowRight');
  if ((await selectedTab().textContent()) !== 'Overview') throw new Error('Keyboard navigation did not wrap between company sections.');
  if ((await page.locator('[role=tab][tabindex="0"]').count()) !== 1) throw new Error('More than one company tab is in the keyboard tab order.');
  if ((await selectedTab().getAttribute('id')) !== (await page.getByRole('tabpanel').getAttribute('aria-labelledby')))
    throw new Error('Company section did not expose its selected label.');
  if (!(await selectedTab().evaluate((element) => element === document.activeElement))) throw new Error('Changing sections lost keyboard focus.');
  teamMissions = [{ id: 'task-review', agentId: lead.id, goal: 'Review customer feedback', status: 'running', progress: 'Checked three interviews.' }];
  teamHelpers = [{ id: 'helper-review', rootAgentId: lead.id, role: 'Research assistant', objective: 'Compare interview findings', status: 'running' }];
  liveActivity = [{ agentId: lead.id, agentName: lead.name, phase: 'working', tool: 'read_file' }];
  await page.getByRole('tab', { name: 'Team', exact: true }).click();
  const work = page.locator('[data-company-agent-work]');
  await work.getByText('Review customer feedback', { exact: true }).waitFor();
  await work.getByText('Compare interview findings', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'team-tasks-desktop.png'), fullPage: true });
  await page.getByRole('tab', { name: 'Team', exact: true }).focus();
  teamMissions[0].status = 'blocked';
  teamMissions[0].blockers = 'Waiting for owner feedback';
  liveActivity = [];
  await work.getByText('Waiting for owner feedback', { exact: true }).waitFor();
  if (!(await selectedTab().evaluate((el) => el === document.activeElement))) throw new Error('Team refresh replaced focused navigation.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'team-tasks-mobile.png'), fullPage: true });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Agent assignments overflow mobile.');
  teamMissions.push({
    id: 'finished-report',
    agentId: lead.id,
    goal: 'Prepare the customer research report',
    status: 'done',
    progress: 'Reviewed the interviews.',
    result: 'The customer research report is ready, with three recommended next steps.',
  });
  fixture.jobs = Array.from({ length: 1000 }, (_, index) => ({
    id: 'review-tick-' + index,
    kind: 'review',
    state: 'done',
    version: 1,
    payload: {},
    updatedAt: '2026-10-13T09:00:00Z',
  }));
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.locator('[data-chart-status="blocked"]').waitFor();
  await page.screenshot({ path: path.join(output, 'performance-mobile.png'), fullPage: true });
  await page.locator('[data-chart-status="blocked"]').click();
  if ((await page.getByLabel('Filter tasks by status', { exact: true }).inputValue()) !== 'blocked') throw new Error('Chart drilldown did not select the matching task status.');
  if ((await page.locator('#companyWorkList [data-company-work-item]').count()) !== 1) throw new Error('Chart drilldown included unrelated tasks.');
  await page.getByRole('button', { name: 'Active', exact: true }).click();
  await page.getByRole('tab', { name: 'Work', exact: true }).click();
  await page.locator('#companyWorkList').getByText('Review customer feedback', { exact: true }).waitFor();
  if (await page.getByText('Work queue', { exact: true }).count()) throw new Error('The scheduler table remains in Work.');
  await page.locator('#companyWorkList [data-company-work-item="mission-task-review"] summary').click();
  await page.locator('#companyWorkList').getByText('Waiting for owner feedback', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'work-active-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Results', exact: true }).click();
  await page.locator('[data-company-work-item="mission-finished-report"] summary').click();
  await page.locator('#companyWorkList').getByText('The customer research report is ready, with three recommended next steps.', { exact: true }).waitFor();
  if ((await page.locator('#companyWorkList [data-company-work-item]').count()) !== 1) throw new Error('Scheduler ticks were turned into user tasks.');
  if (await page.locator('#companyPage').evaluate((el) => el.scrollWidth > el.clientWidth)) throw new Error('Work results overflow mobile.');
  await page.screenshot({ path: path.join(output, 'work-results-mobile.png'), fullPage: true });
  await page.getByLabel('Search company work', { exact: true }).fill('unknown task');
  await page.getByText('No tasks match your search.', { exact: true }).waitFor();
  if (await page.getByRole('button', { name: 'Show more tasks', exact: true }).isVisible()) throw new Error('Show more appears for an empty search.');
  await page.getByLabel('Search company work', { exact: true }).fill('');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'All tasks', exact: true }).click();
  await page.screenshot({ path: path.join(output, 'work-desktop.png'), fullPage: true });
  if ((await page.getByRole('tablist', { name: 'Company sections' }).getAttribute('aria-orientation')) !== 'vertical')
    throw new Error('Desktop company navigation is not vertical.');
  await page.locator('[data-company-work-item="mission-finished-report"] summary').click();
  await page.locator('[data-company-work-item="mission-finished-report"]').getByText('Assigned to', { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'work-detail-desktop.png'), fullPage: true });
  const priorSent = sent.length;
  await page.locator('[data-company-work-item="mission-finished-report"]').getByRole('button', { name: 'Ask about this task', exact: true }).click();
  if (!(await page.locator('#companyChatText').inputValue()).includes('Prepare the customer research report')) throw new Error('Task discussion lost its assignment context.');
  if ((await page.locator('#companyDelivery').inputValue()) !== 'question' || sent.length !== priorSent) throw new Error('Opening task discussion sent or steered work.');
  await page.locator('#companyChatText').fill('My existing draft');
  await page.getByRole('tab', { name: 'Work', exact: true }).click();
  await page.locator('[data-company-work-item="mission-finished-report"] summary').click();
  await page.locator('[data-company-work-item="mission-finished-report"]').getByRole('button', { name: 'Ask about this task', exact: true }).click();
  await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  if ((await page.locator('#companyChatText').inputValue()) !== 'My existing draft') throw new Error('Task discussion replaced an existing draft.');
  await page.locator('#companyChatText').fill('');
  await page.locator('[data-company-rail-agent]').first().click();
  if ((await page.getByRole('tab', { selected: true }).innerText()) !== 'Team') throw new Error('Sidebar teammate did not open their work.');
  fixture.jobs = [];
  await page.setViewportSize({ width: 1440, height: 1000 });
  teamMissions = [];
  teamHelpers = [];
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
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
  console.log(
    await page.getByRole('tab', { selected: true }).evaluate((el) => {
      const s = getComputedStyle(el);
      return { text: el.textContent, foreground: s.color, background: s.backgroundColor };
    }),
  );
  await page.screenshot({ path: path.join(output, 'overview-desktop.png'), fullPage: true });
  await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  await page.locator('#companyMessages .cw-row.me .cw-bubble').waitFor();
  await page.locator('#companyMessages .cw-row:not(.me) .cw-bubble').first().waitFor();
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
  if (sent.length !== 1 || sent[0].delivery !== 'question' || sent[0].text !== 'Does this answer change our goal?')
    throw new Error('Enter did not send the selected delivery mode.');
  await page.screenshot({ path: path.join(output, 'chat-desktop.png'), fullPage: true });
  await page.getByRole('tab', { name: 'Resources', exact: true }).click();
  await page.getByRole('button', { name: 'Add custom API', exact: true }).click();
  const customModal = page.getByRole('dialog', { name: 'Add custom API to Northstar Studio', exact: true });
  await customModal.getByLabel('Service', { exact: true }).selectOption('tavily');
  await customModal.getByLabel('API key or access token', { exact: true }).fill('fixture-company-search-key');
  await page.screenshot({ path: path.join(output, 'company-custom-api.png'), fullPage: true });
  await customModal.getByRole('button', { name: 'Save and test connection', exact: true }).click();
  await customModal.getByRole('button', { name: 'Retry connection test', exact: true }).waitFor();
  if (fixture.company!.connectionIds.includes('fixture-search')) throw new Error('A failing connection was granted to the company.');
  customTestFails = false;
  await customModal.getByRole('button', { name: 'Retry connection test', exact: true }).click();
  await customModal.waitFor({ state: 'detached' });
  if (customCreates !== 1 || !fixture.company!.connectionIds.includes('fixture-search')) throw new Error('The tested connection was not granted exactly once.');
  await page.getByLabel('Composio API key', { exact: true }).fill('fixture-key');
  await page.getByRole('button', { name: 'Set up Composio', exact: true }).click();
  await page.getByRole('heading', { name: 'Connect an app', exact: true }).waitFor();
  await page.evaluate('window.cwPrepareAppSignIn=function(){return{open:async function(){return true;},cancel:function(){}};};');
  await page.locator('[data-company-connect="gmail"]').click();
  await page.locator('[data-company-account="app-gmail"]').getByText('Finish sign-in', { exact: true }).waitFor();
  if (await page.locator('#cwServicesAgent').count()) throw new Error('Company connections opened the Cowork teammate picker.');
  if (!appPosts.find((p) => p.path.endsWith('/connect'))?.path.includes('/api/companies/' + fixture.company!.id + '/')) throw new Error('Company sign-in escaped its API scope.');
  appAccounts.find((a) => a.id === 'app-gmail')!.status = 'ACTIVE';
  await page.locator('#companyAppsRefresh').click();
  const connected = page.locator('[data-company-account="app-gmail"]');
  await connected.getByText('Connected', { exact: true }).waitFor();
  await connected.locator('summary').click();
  await connected.getByLabel('Ari', { exact: true }).uncheck();
  await connected.getByRole('button', { name: 'Save team access', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-company-account="app-gmail"] summary')?.textContent?.includes('0 assigned'));
  if (appAssignments['app-gmail'].length) throw new Error('Company account could not be retained without team access.');
  fixture.requests = [
    {
      id: 'request-mail',
      status: 'open',
      kind: 'recommendation',
      title: 'Connect Mailbox',
      detail: 'Connect the support mailbox.',
      agentId: lead.id,
      appConnection: { service: 'mail', name: 'Mailbox' },
    },
  ];
  await page.evaluate(async () => {
    await (window as any).companyLoad();
  });
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.locator('[data-company-connect-request="request-mail"]').click();
  await page.locator('#cwMailForm').waitFor({ state: 'visible' });
  await page.getByLabel('Email address', { exact: true }).fill('support@gmail.com');
  await page.getByLabel('Password or app password', { exact: true }).fill('fixture-password');
  await page.getByLabel('Name this mailbox (optional)', { exact: true }).fill('Support inbox');
  await page.getByRole('button', { name: 'Connect mailbox', exact: true }).click();
  await page.locator('[data-company-account="app-mail"]').waitFor();
  if (appPosts.find((p) => p.path.endsWith('/mail'))?.body.agentId) throw new Error('Company mail setup used a Cowork agent-scoped endpoint.');
  if (fixture.requests[0].status !== 'accepted') throw new Error('An active company mailbox did not satisfy its agent recommendation.');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'company-accounts-mobile.png'), fullPage: true });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Company account controls overflow mobile.');
  await page.setViewportSize({ width: 1440, height: 1000 });
  const local = page.locator('#companyStorageCards article').filter({ has: page.getByRole('heading', { name: 'Read only files', exact: true }) });
  await local.waitFor();
  if (await local.getByRole('button', { name: 'Reconnect', exact: true }).count()) throw new Error('Local storage showed OAuth reconnect.');
  if (await local.getByRole('button', { name: 'Use for output', exact: true }).count()) throw new Error('Read-only storage could be selected for output.');
  await local.getByRole('button', { name: 'Browse', exact: true }).click();
  await page.getByText('Reading these files is not granted.', { exact: false }).waitFor();
  if (await page.locator('#companyStorageBrowser [data-storage-file], #companyStorageBrowser [data-storage-reference]').count())
    throw new Error('Listing-only files exposed read operations.');
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
  page.once('dialog', (dialog) => dialog.accept());
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
  if (uploads.some((file) => file.id === 'upload-cancel')) throw new Error('Saved upload was not cancelled.');
  await page.locator('#companyFilesInput').setInputFiles({ name: 'large-video.mp4', mimeType: 'video/mp4', buffer: Buffer.alloc(21 * 1024 * 1024, 7) });
  const largeRow = page.locator('#companyFileList li').filter({ hasText: 'large-video.mp4' });
  await largeRow.getByRole('link', { name: 'Download', exact: true }).waitFor({ timeout: 60000 });
  if (uploadCreations !== 1 || uploads.find((file) => file.name === 'large-video.mp4')?.state !== 'ready') throw new Error('Large video did not upload and verify.');
  await page.getByRole('textbox', { name: 'Memory text', exact: true }).fill('Use the user’s latest report format.');
  await page.getByRole('button', { name: 'Save correction', exact: true }).click();
  await page.waitForFunction(() => (window as any).lastToast === 'Memory corrected');
  if (memoryEdits[0]?.['expectedUpdatedAt'] !== '2026-10-11T10:00:00Z' || memoryEntries[0].claim !== 'Use the user’s latest report format.')
    throw new Error('Memory correction lost the saved version or new text.');
  const disconnected = page.locator('#companyReferences article').filter({ has: page.getByText('Disconnected report', { exact: true }) });
  await disconnected.getByText('Connection disconnected', { exact: false }).waitFor();
  if (await disconnected.getByRole('button', { name: 'Import a copy', exact: true }).count()) throw new Error('Disconnected reference exposed import.');
  page.once('dialog', (dialog) => dialog.accept());
  await disconnected.getByRole('button', { name: 'Remove reference', exact: true }).click();
  await disconnected.waitFor({ state: 'hidden' });
  await page.locator('#companyReferences article').getByRole('button', { name: 'Import a copy', exact: true }).click();
  await page.locator('#companyFileList').getByText('notes.txt', { exact: false }).waitFor();
  if (!importedReference) throw new Error('Reference import was not sent.');
  await page.screenshot({ path: path.join(output, 'files-knowledge-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('Mobile knowledge controls overflowed.');
  await page.screenshot({ path: path.join(output, 'files-knowledge-mobile.png'), fullPage: true });
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Archive memory', exact: true }).click();
  await page.getByText('No saved knowledge yet.', { exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const composer = await page.locator('#companySend').boundingBox();
  if (!composer || composer.y < 0 || composer.y + composer.height > 844) throw new Error('Mobile composer is outside the viewport.');
  await page.screenshot({ path: path.join(output, 'chat-mobile.png'), fullPage: true });
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('Mobile page overflowed.');
  await page.evaluate(
    ({ id, name }) => {
      const app = window as unknown as { closeCompanies: () => void; companyChatCardHtml: (link: { id: string; name: string; state: string }) => string };
      app.closeCompanies();
      const card = document.createElement('div');
      card.id = 'coworkCompanyFixture';
      card.innerHTML = app.companyChatCardHtml({ id, name, state: 'draft' });
      document.body.appendChild(card);
    },
    { id: fixture.company!.id, name: fixture.company!.name },
  );
  await page.locator('#coworkCompanyFixture').getByText('Between reviews', { exact: true }).waitFor();
  await page.locator('#coworkCompanyFixture').getByRole('button', { name: 'Open company', exact: true }).click();
  await page.locator('#companyActivity').getByText('Between reviews', { exact: true }).waitFor();
  await page.locator('#coworkCompanyFixture').evaluate((el) => el.remove());
  await page.locator('[data-company-back]').click();
  await page.getByRole('button', { name: 'Create company', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Preview Company');
  await page.getByLabel('Purpose and goals').fill('Produce useful reports');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('heading', { name: 'Choose your Cowork lead', exact: true }).waitFor();
  await page.getByLabel('Cowork teammate', { exact: true }).selectOption(lead.id);
  if (await page.locator('#companyLeadName,#companyLeadProvider,#companyLeadModel').count()) throw new Error('Company still creates a separate profile.');
  await page.screenshot({ path: path.join(output, 'setup-lead-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('heading', { name: 'Grant resources', exact: true }).waitFor();
  await page
    .locator('.company-resource-group')
    .filter({ has: page.getByText('Skills', { exact: false }) })
    .locator('summary')
    .click();
  await page.getByLabel('Search skills', { exact: true }).fill('Skill 89');
  await page.getByLabel('Skill 89', { exact: true }).check();
  if (
    await page
      .locator('.company-resource-list')
      .last()
      .evaluate((el) => el.getBoundingClientRect().height > 221)
  )
    throw new Error('The skill list is unbounded.');
  await page.screenshot({ path: path.join(output, 'setup-resources-mobile.png'), fullPage: true });
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
} catch (error) {
  if (failurePage) {
    await failurePage.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
    console.error(await failurePage.locator('body').innerText(), appPosts, uiCalls.slice(-18));
  }
  throw error;
} finally {
  await browser.close();
  store.close();
}
