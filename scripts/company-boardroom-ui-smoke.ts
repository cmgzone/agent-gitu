import { chromium } from 'playwright';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { CompanyStore } from '../src/company/store.js';
import { CoworkStore } from '../src/cowork/store.js';
import { CompanyOrganization } from '../src/company/organization.js';
import { CompanyBoardroom } from '../src/company/boardroom.js';
import { CompanyWorkflows } from '../src/company/workflows.js';
import { companyApi } from '../src/company/api.js';
import { UI_HTML } from '../src/server/ui.js';
import { COMPANY_JS } from '../src/server/ui-companies.js';
import { COMPANY_CONNECTIONS_JS } from '../src/server/ui-company-connections.js';
import { plushCharacterHtml } from '../src/server/ui-characters.js';
import { CHARACTERS_DIR, CHARACTER_FILES, FONTS_DIR, FONT_FILES } from '../src/server/static-assets.js';

const scratch = path.resolve('.qa');
mkdirSync(scratch, { recursive: true });
mkdirSync(path.join(scratch, 'company-ui'), { recursive: true });
const root = mkdtempSync(path.join(scratch, 'company-boardroom-fixture-')),
  store = new CompanyStore(root);
const company = store.create({ name: 'Northstar Studio', purpose: 'Customer research', monthlyBudgetUsd: null, maxFileBytes: null });
const cowork = new CoworkStore(path.join(root, 'cowork.json'), undefined, { companyId: company.id, persistence: store.snapshot(company.id) });
const ceo = cowork.saveAgent({ name: 'Ari', systemPrompt: 'Lead', chiefOfStaff: true }),
  worker = cowork.saveAgent({ name: 'Milo', systemPrompt: 'Research' });
for (const title of ['Engineering', 'Finance', 'Marketing', 'Operations', 'Support', 'Product'])
  cowork.saveAgent({ name: title + ' lead', systemPrompt: 'Contribute evidence for ' + title, tagline: title });
const conversation = cowork.saveConversation({ kind: 'group', memberIds: cowork.listAgents().map((a) => a.id), chiefId: ceo.id });
store.update(company.id, { leadId: ceo.id, conversationId: conversation.id });
store.transition(company.id, 'running');
const room = new CompanyBoardroom(new CompanyOrganization(store, company.id, cowork));
const styles = [...UI_HTML.slice(0, UI_HTML.indexOf('</head>')).matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const html = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><script>function $(id){return document.getElementById(id);}function toast(message){window.lastToast=message;}function fileLimitLabel(value){return value===null?'Unlimited':String(value);}function esc(value){var el=document.createElement('span');el.textContent=String(value??'');return el.innerHTML.replace(/"/g,'&quot;').replace(/'/g,'&#39;');}${plushCharacterHtml.toString()}function cwAvaImg(avatar,id){return plushCharacterHtml((avatar&&avatar.shape||'dot-purple').replace('dot-',''),id);}async function api(url,options){var r=await fetch(url,options),data=await r.json();if(!r.ok)throw Error(data.error);return data;}${COMPANY_JS}${COMPANY_CONNECTIONS_JS}Companies.id=${JSON.stringify(company.id)};Companies.tab='Boardroom';Companies.data={company:${JSON.stringify(store.get(company.id))},agents:${JSON.stringify(cowork.listAgents())},missions:[],helpers:[],requests:[],actions:[],activity:[],jobs:[],totals:{knownCostUsd:0,unknownCostCalls:0},monthly:{month:'2026-10',knownCostUsd:0,unknownCalls:0}};companyRender();</script></body></html>`;
const smokeChannel = process.env['GITU_UI_SMOKE_CHANNEL'] ?? (process.platform === 'win32' ? 'msedge' : undefined);
const browser = await chromium.launch({ headless: true, ...(smokeChannel ? { channel: smokeChannel } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } }),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
    const filename = path.basename(url.pathname);
    if (url.pathname.startsWith('/characters/') && CHARACTER_FILES[filename])
      return route.fulfill({ contentType: CHARACTER_FILES[filename], body: readFileSync(path.join(CHARACTERS_DIR, filename)) });
    if (url.pathname.startsWith('/fonts/') && FONT_FILES[filename]) return route.fulfill({ contentType: FONT_FILES[filename], body: readFileSync(path.join(FONTS_DIR, filename)) });
    if (url.pathname.endsWith('/files/policy')) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ maxFileBytes: null }) });
    if (/\/computers\//.test(url.pathname)) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ computer: { state: 'stopped' } }) });
    let status = 200,
      data: unknown;
    try {
      const handled = await companyApi({ url: url.pathname + url.search } as never, {} as never, url.pathname, route.request().method(), {
        store,
        cowork: () => cowork,
        body: async () => route.request().postDataJSON() ?? {},
        send: (_res, code, value) => {
          status = code;
          data = value;
        },
        scoped: (_company, work) => work(),
        legacyAgent: () => undefined,
        routeCowork: async () => false,
        start: () => {},
        pause: () => {},
      });
      if (!handled) {
        status = 404;
        data = { error: 'Fixture route unavailable.' };
      }
    } catch (error) {
      status = 400;
      data = { error: (error as Error).message };
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('http://gitu-boardroom-fixture.invalid/');
  await page.getByRole('button', { name: 'New meeting', exact: true }).click();
  await page.getByLabel('Meeting title', { exact: true }).fill('Review the customer launch');
  await page.getByLabel('Purpose', { exact: true }).fill('Compare evidence and decide the next research step.');
  await page.getByLabel('Agenda', { exact: true }).fill('Review customer evidence\nChoose next actions');
  await page.getByLabel('Let the chair invite participants in agenda order', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Schedule meeting', exact: true }).click();
  await page.getByRole('heading', { name: 'Review the customer launch', exact: true }).waitFor();
  const meeting = room.list({ kind: 'director' })[0]!;
  if (!meeting || meeting.automaticModeration) throw Error('Meeting configuration was not persisted.');
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  await page.getByRole('button', { name: 'End meeting', exact: true }).waitFor();
  room.raiseHand({ kind: 'agent', agentId: worker.id }, meeting.id, {
    agendaId: meeting.agenda[0]!.id,
    reason: 'Customer interviews contain contrary evidence',
    priority: 'urgent',
  });
  await page.evaluate(() => (document.getElementById('companyBody') as any)._meetingRefresh());
  await page.getByText('Customer interviews contain contrary evidence', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Invite', exact: true }).last().click();
  await page.getByRole('heading', { name: 'Milo has the floor', exact: true }).waitFor();
  await page.screenshot({ path: '.qa/company-ui/boardroom-floor.png', fullPage: true });
  if (!(await page.getByRole('button', { name: 'Add to discussion', exact: true }).isDisabled())) throw Error('Director can speak without taking the floor.');
  const lease = room.read({ kind: 'director' }, meeting.id).lease!;
  room.contribute({ kind: 'agent', agentId: worker.id }, meeting.id, lease.id, {
    text: 'Five customer interviews favor a smaller pilot before launch.',
    evidence: ['research-note-1'],
  });
  await page.evaluate(() => (document.getElementById('companyBody') as any)._meetingRefresh());
  await page.getByText('Five customer interviews favor a smaller pilot before launch.', { exact: true }).waitFor();
  await page.getByLabel('Director contribution', { exact: true }).fill('Draft: focus on a measured pilot.');
  await page.getByRole('tab', { name: 'Action items', exact: true }).click();
  await page.getByRole('tab', { name: 'Discussion', exact: true }).click();
  if ((await page.getByLabel('Director contribution', { exact: true }).inputValue()) !== 'Draft: focus on a measured pilot.')
    throw Error('Changing discussion tabs discarded the draft.');
  await page.evaluate(() => (document.getElementById('companyBody') as any)._meetingRefresh());
  await page.waitForFunction(() => document.querySelector('.company-meeting-status')!.textContent === 'Saved');
  if ((await page.getByLabel('Director contribution', { exact: true }).inputValue()) !== 'Draft: focus on a measured pilot.') throw Error('Polling discarded the director draft.');
  await page.getByRole('button', { name: 'Add to discussion', exact: true }).click();
  await page.getByText('Draft: focus on a measured pilot.', { exact: true }).waitFor();
  const decision = room.proposeDecision({ kind: 'agent', agentId: ceo.id }, meeting.id, {
    agendaId: meeting.agenda[1]!.id,
    title: 'Plan the pilot',
    rationale: 'Use the interview evidence.',
    requiresDirector: true,
  }).decisions[0]!;
  await page.evaluate(() => (document.getElementById('companyBody') as any)._meetingRefresh());
  await page.getByRole('tab', { name: 'Decisions', exact: false }).click();
  await page.getByRole('button', { name: 'Approve proposal', exact: true }).click();
  await page.getByText('approved', { exact: true }).waitFor();
  if (room.read({ kind: 'director' }, meeting.id).decisions.find((d) => d.id === decision.id)?.state !== 'approved') throw Error('Director review was not saved.');
  await page.getByRole('tab', { name: 'Discussion', exact: true }).click();
  const item = room.proposeAssignment({ kind: 'agent', agentId: ceo.id }, meeting.id, {
    title: 'Prepare the customer pilot',
    agentId: worker.id,
    criteria: ['Collect three additional interviews'],
    decisionId: decision.id,
  }).actionItems[0]!;
  await page.evaluate(() => (document.getElementById('companyBody') as any)._meetingRefresh());
  await page.getByRole('tab', { name: 'Action items', exact: false }).click();
  await page.getByRole('button', { name: 'Assign work', exact: true }).click();
  await page.getByRole('button', { name: 'View assignment', exact: true }).waitFor();
  if (!room.read({ kind: 'director' }, meeting.id).actionItems.find((a) => a.id === item.id)?.missionId) throw Error('The assignment did not create a real mission.');
  await page.getByRole('tab', { name: 'Discussion', exact: true }).click();
  await page.screenshot({ path: '.qa/company-ui/boardroom-light.png', fullPage: true });
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await page.evaluate(async () => {
    getComputedStyle(document.querySelector('.company-meeting-seat')!).backgroundColor;
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a instanceof CSSTransition)
        .map((a) => a.finished.catch(() => {})),
    );
  });
  await page.screenshot({ path: '.qa/company-ui/boardroom-dark.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Boardroom overflows on mobile.');
  await page.screenshot({ path: '.qa/company-ui/boardroom-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'End meeting', exact: true }).click();
  await page.getByRole('heading', { name: 'Meeting concluded', exact: true }).waitFor();
  if (!room.read({ kind: 'director' }, meeting.id).summary?.confirmedDecisions.includes(decision.id)) throw Error('Meeting summary lost the confirmed decision.');
  console.log('Boardroom controls passed; checking employee requests and overview navigation.');
  const requested = room.request(
    { kind: 'agent', agentId: worker.id },
    {
      title: 'Discuss the research blocker',
      reason: 'Customer evidence needs a shared decision.',
      participants: [{ agentId: ceo.id }],
      agenda: ['Agree on the next evidence source'],
    },
  );
  const workflows = new CompanyWorkflows(room.organization);
  const proposed = workflows.propose(
    { kind: 'agent', agentId: worker.id },
    {
      title: 'Employee research workflow',
      inputs: { type: 'object' },
      parallelism: 1,
      steps: [
        {
          id: 'research',
          name: 'Verify customer evidence',
          type: 'mission',
          agentId: worker.id,
          goal: 'Prepare a verified customer report',
          criteria: ['Cite evidence'],
          dependsOn: [],
          bindings: {},
          inputSchema: { type: 'object' },
          outputSchema: { type: 'string' },
          tools: [],
          skills: [],
          connectionIds: [],
          accountIds: [],
          maxSessions: 2,
          maxAttempts: 1,
          timeoutMinutes: 5,
        },
      ],
    },
  );
  await page.evaluate(() => (document.getElementById('companyBody') as any)._meetingRefresh());
  await page.getByRole('heading', { name: 'Agent meeting requests', exact: true }).waitFor();
  await page.getByText('Requested by Milo', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Schedule meeting', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('[data-meeting-request-card]'), undefined, { timeout: 15000 });
  const approvedRequest = room.requests({ kind: 'director' }).find((r) => r.id === requested.id)!;
  if (!approvedRequest.meetingId) throw Error('The request review did not schedule a meeting.');
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.getByRole('heading', { name: 'Team coordination', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Workflow drafts awaiting approval', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Team coordination needs review', exact: true }).waitFor();
  room.request({ kind: 'agent', agentId: worker.id }, { title: 'Review the pilot budget', reason: 'A budget question needs review.', agenda: ['Pilot spending'] });
  await page.evaluate(() => companyOverviewRefresh());
  const pendingCard = page.locator('#companyManagement [data-meeting-request-card]').filter({ has: page.getByRole('heading', { name: 'Review the pilot budget', exact: true }) });
  await pendingCard.getByRole('button', { name: 'Decline', exact: true }).click();
  await pendingCard.waitFor({ state: 'detached' });
  await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  await page.evaluate(() => companyChatRefresh());
  if (errors.length) throw Error(errors.join('\n'));
  if (await page.locator('#companyError').textContent()) throw Error('Company chat: ' + (await page.locator('#companyError').textContent()));
  await page.getByRole('button', { name: 'Review team coordination', exact: true }).click();
  await page.getByRole('heading', { name: 'Team coordination', exact: true }).waitFor();

  await page.getByRole('button', { name: 'Review workflow', exact: true }).click();
  await page.waitForFunction((id) => document.querySelector<HTMLSelectElement>('[data-wf-select]')?.value === id, proposed.id, { timeout: 15000 });
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
  await page.screenshot({ path: '.qa/company-ui/company-coordination-mobile.png', fullPage: true });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Company coordination overflows on mobile.');
  await page.setViewportSize({ width: 1360, height: 1000 });
  await page.screenshot({ path: '.qa/company-ui/company-coordination-dark.png', fullPage: true });
  const requestedCard = page.locator('#companyManagement article').filter({ has: page.getByRole('heading', { name: 'Discuss the research blocker', exact: true }) });
  await requestedCard.getByRole('button', { name: 'Open discussion', exact: true }).click();
  await page.getByRole('heading', { name: 'Discuss the research blocker', exact: true }).waitFor();
  await page.getByText('Organized by You · Requested by Milo', { exact: true }).waitFor();
  if (errors.length) throw Error(errors.join('\n'));
  console.log('Boardroom UI passed real scoped persistence, scheduling, floor ownership, draft preservation, director review, light/dark themes and mobile layout.');
} finally {
  await browser.close();
  store.close();
  if (!root.startsWith(scratch + path.sep)) throw Error('Fixture cleanup scope changed.');
  rmSync(root, { recursive: true, force: true });
}
