import { chromium } from 'playwright';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { UI_HTML } from '../src/server/ui.js';
import { COMPANY_JS } from '../src/server/ui-companies.js';
import { COWORK_JS } from '../src/server/ui-cowork.js';
import { FILE_UPLOAD_JS } from '../src/server/ui-files.js';

const scratch = path.resolve('.qa');
mkdirSync(scratch, { recursive: true });
mkdirSync(path.join(scratch, 'cowork-company-cards'), { recursive: true });
const root = mkdtempSync(path.join(scratch, 'company-cards-fixture-'));
const previousHome = process.env['AGENT_GITU_HOME'];
process.env['AGENT_GITU_HOME'] = root;
const server = new GituServer({ passwordRequired: false, port: 0, llm: new ScriptedMockLlm([]) });
const internal = server as any;
const channel = process.env['GITU_UI_SMOKE_CHANNEL'] ?? (process.platform === 'win32' ? 'msedge' : undefined);
const browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
try {
  const origin = 'http://localhost:' + (await server.start());
  internal.ensureCompanyCoordinator = () => {};
  const roster = internal.cowork();
  const lead = roster.saveAgent({ name: 'Ari', systemPrompt: 'Coordinate work.', allowConfig: true, allowWrites: true });
  async function request(route: string, body: unknown) {
    const response = await fetch(origin + route, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw Error(JSON.stringify(result));
    return result;
  }
  const company = (await request('/api/companies', { name: 'Research studio', purpose: 'Research customer demand.', monthlyBudgetUsd: null, maxFileBytes: null })).company;
  await request('/api/companies/' + company.id + '/lead', { agentId: lead.id });
  internal.companies().transition(company.id, 'running');
  const scoped = <T>(work: () => T) => internal.companyScope.run({ id: company.id, version: 0 }, work);
  const scopedCompany = internal.companies().get(company.id);
  const scopedStore = scoped(() => internal.cowork());
  const question = scopedStore.addRequest({
    conversationId: scopedCompany.conversationId,
    agentId: lead.id,
    kind: 'question',
    title: 'Which customers should we interview?',
    detail: 'Choose the pilot audience.',
    options: ['Small teams', 'Agencies'],
  });
  const task = scopedStore.createMission({ conversationId: scopedCompany.conversationId, agentId: lead.id, goal: 'Verify customer demand', criteria: ['Collect evidence'] });
  scopedStore.updateMission(task.id, { status: 'blocked', blockers: 'Waiting for interview access' });
  const room = internal.companyBoardroom(company.id);
  const meetingRequest = room.request(
    { kind: 'agent', agentId: lead.id },
    { title: 'Resolve research blockers', reason: 'We need to agree on interview access.', agenda: ['Choose the pilot audience'] },
  );
  // Future meeting so no model execution is required for browser acceptance.
  const meeting = room.create(
    { kind: 'director' },
    { title: 'Pilot planning', participants: [{ agentId: lead.id }], agenda: ['Plan the pilot'], startAt: new Date(Date.now() + 3600000).toISOString() },
  );
  const workflow = internal
    .companyWorkflows(company.id)
    .propose(
      { kind: 'agent', agentId: lead.id },
      {
        title: 'Research repeatable process',
        inputs: { type: 'object' },
        parallelism: 1,
        steps: [
          {
            id: 'review',
            name: 'Review evidence',
            type: 'approval',
            goal: 'Review evidence',
            criteria: ['Approve the exact evidence'],
            dependsOn: [],
            bindings: {},
            inputSchema: { type: 'object' },
            outputSchema: { type: 'object' },
            tools: [],
            skills: [],
            connectionIds: [],
            accountIds: [],
            maxSessions: 1,
            maxAttempts: 1,
            timeoutMinutes: 5,
          },
        ],
      },
      'cards-workflow',
    );
  const styles = [...UI_HTML.slice(0, UI_HTML.indexOf('</head>')).matchAll(/<style>([\s\S]*?)<\/style>/g)].map((match) => match[1]).join('\n');
  const html = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><main id="cards"></main><script>
    var S={active:'cowork',sel:{model:'preview::model'},cw:{agents:${JSON.stringify(roster.listAgents())},convs:[],msgs:[]}};
    function $(id){return document.getElementById(id);}function toast(message){window.lastToast=message;}function humanBytes(value){return String(value)+' bytes';}function shortDate(value){return new Date(value).toLocaleDateString();}
    function esc(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
    async function api(url,options){var response=await fetch(url,options),data=await response.json();if(!response.ok)throw Error(data.error||response.statusText);return data;}
    ${COWORK_JS}${FILE_UPLOAD_JS}${COMPANY_JS}
    companyRoot();$('cards').innerHTML=companyChatCardHtml(${JSON.stringify({ id: company.id, name: company.name, state: 'running' })});
  </script></body></html>`;
  const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(origin + '/', (route) => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto(origin + '/');
  const card = page.getByRole('article', { name: 'Company: Research studio' });
  await card.getByText('Waiting for interview access', { exact: false }).waitFor();
  await card.getByText('Resolve research blockers', { exact: true }).waitFor();
  await card.getByRole('button', { name: 'Review workflow', exact: true }).waitFor();
  const answer = card.getByLabel('Answer: Which customers should we interview?', { exact: true });
  await card.getByRole('button', { name: 'Small teams', exact: true }).click();
  await answer.fill('Small teams\nStart with Nairobi.');
  await page.evaluate(() => (window as any).companySyncChatCards());
  if ((await answer.inputValue()) !== 'Small teams\nStart with Nairobi.') throw Error('Polling lost a question draft');
  await page.screenshot({ path: '.qa/cowork-company-cards/desktop.png', fullPage: true });
  // Failure must preserve the answer and expose a retry in this same Cowork card.
  await page.route('**/cowork/requests/' + question.id, (route) =>
    route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary response conflict. Try again.' }) }),
  );
  await card.getByRole('button', { name: 'Send answer', exact: true }).click();
  await card.getByText('Temporary response conflict. Try again.', { exact: true }).waitFor();
  if ((await answer.inputValue()) !== 'Small teams\nStart with Nairobi.') throw Error('A failed answer lost its draft');
  await page.unroute('**/cowork/requests/' + question.id);
  await card.getByRole('button', { name: 'Send answer', exact: true }).click();
  await card.getByText('Your answer', { exact: true }).waitFor();
  if (scopedStore.getRequest(question.id).status !== 'answered') throw Error('Answer was not saved in the company');
  await page.reload();
  await card.getByText('Your answer', { exact: true }).waitFor();
  await card.getByRole('button', { name: 'Schedule meeting', exact: true }).click();
  await card.getByText('Resolve research blockers', { exact: true }).waitFor();
  if (room.requests({ kind: 'director' }).find((r: any) => r.id === meetingRequest.id).state !== 'scheduled') throw Error('Cowork card did not schedule the real meeting');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await page.screenshot({ path: '.qa/cowork-company-cards/mobile-dark.png', fullPage: true });
  if (await card.evaluate((element) => element.scrollWidth > element.clientWidth)) throw Error('Company card overflows on mobile');
  // Exact discussion navigation must not fall back to an unrelated meeting.
  await card.locator('[data-company-card-resource="' + meeting.id + '"]').click();
  await page.getByRole('region', { name: 'Meeting details', exact: true }).getByRole('heading', { name: meeting.title, exact: true }).waitFor();
  await page.reload();
  await card.getByRole('button', { name: 'Review workflow', exact: true }).click();
  await page.waitForFunction((id) => document.querySelector<HTMLSelectElement>('[data-wf-select]')?.value === id, workflow.id);
  if (errors.length) throw Error(errors.join('\n'));
  console.log(
    'Cowork company cards passed: real status/blockers, meeting request scheduling, question failure/retry, persistent receipts, exact discussion navigation and mobile dark layout.',
  );
} finally {
  await browser.close();
  await server.stop();
  if (previousHome === undefined) delete process.env['AGENT_GITU_HOME'];
  else process.env['AGENT_GITU_HOME'] = previousHome;
  if (!path.resolve(root).startsWith(scratch + path.sep)) throw Error('Fixture cleanup escaped QA');
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
