import { chromium } from 'playwright';
import { mkdtempSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { CompanyStore } from '../src/company/store.js';
import { CoworkStore } from '../src/cowork/store.js';
import { CompanyOrganization } from '../src/company/organization.js';
import { CompanyWorkflows } from '../src/company/workflows.js';
import { CompanyBoardroom } from '../src/company/boardroom.js';
import { CompanyCalendar } from '../src/company/calendar.js';
import { companyApi } from '../src/company/api.js';
import { UI_HTML } from '../src/server/ui.js';
import { COMPANY_WORKFLOWS_JS } from '../src/server/ui-company-workflows.js';
import { COMPANY_CALENDAR_JS } from '../src/server/ui-company-calendar.js';
const scratch = path.resolve('.qa');
mkdirSync(path.join(scratch, 'company-ui'), { recursive: true });
const root = mkdtempSync(path.join(scratch, 'company-workflow-fixture-')),
  store = new CompanyStore(root),
  company = store.create({ name: 'Studio', purpose: 'Customer research', monthlyBudgetUsd: null, maxFileBytes: null, accountIds: ['calendar-1'], timezone: 'Africa/Nairobi' }),
  cowork = new CoworkStore(path.join(root, 'cowork.json'), undefined, { companyId: company.id, persistence: store.snapshot(company.id) }),
  ceo = cowork.saveAgent({ name: 'Ari', systemPrompt: 'Lead', chiefOfStaff: true, allowWrites: true });
store.update(company.id, { leadId: ceo.id });
store.transition(company.id, 'running');
const org = new CompanyOrganization(store, company.id, cowork);
org.snapshot();
const workflows = new CompanyWorkflows(org, () => ['read_file']),
  room = new CompanyBoardroom(org),
  meeting = room.create(
    { kind: 'director' },
    { title: 'Customer review', agenda: ['Evidence and next steps'], participants: [{ agentId: ceo.id }], startAt: new Date(Date.now() + 3600000).toISOString() },
  );
let event: Record<string, unknown> | undefined;
const calendar = new CompanyCalendar(org, {
    accounts: async () => [{ id: 'calendar-1', toolkit: 'googlecalendar', status: 'ACTIVE', disabled: false }],
    request: async (_a, _c, _e, method, body) => {
      if (method === 'GET' && !_e) return { status: 200, data: { kind: 'calendar#events' } };
      if (method === 'GET') return event ? { status: 200, data: event } : { status: 404, data: {} };
      if (method === 'DELETE') {
        event = undefined;
        return { status: 204, data: {} };
      }
      event = { ...body, etag: 'fixture-etag' };
      return { status: method === 'POST' ? 201 : 200, data: event };
    },
  }),
  styles = [...UI_HTML.slice(0, UI_HTML.indexOf('</head>')).matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const html = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}body{padding:24px}#fixture{max-width:1360px;margin:auto}</style></head><body><main id="fixture" class="company-page"></main><script>var Companies={id:${JSON.stringify(company.id)},tab:'Workflows',data:{agents:${JSON.stringify(cowork.listAgents())}}};function esc(v){var el=document.createElement('span');el.textContent=String(v??'');return el.innerHTML.replace(/"/g,'&quot;').replace(/'/g,'&#39;');}function companyUrl(suffix){return '/api/companies/'+Companies.id+suffix;}function shortDate(v){return new Date(v).toLocaleString();}function companyRender(){window.lastNavigation=Companies.tab;}async function api(url,options){var res=await fetch(url,options),data=await res.json();if(!res.ok)throw Error(data.error);return data;}${COMPANY_WORKFLOWS_JS}${COMPANY_CALENDAR_JS}companyWorkflowsMount(document.getElementById('fixture'));</script></body></html>`;
const smokeChannel = process.env['GITU_UI_SMOKE_CHANNEL'] ?? (process.platform === 'win32' ? 'msedge' : undefined);
const browser = await chromium.launch({ headless: true, ...(smokeChannel ? { channel: smokeChannel } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
    let status = 200,
      data: unknown;
    try {
      const handled = await companyApi({ url: route.request().url() } as never, {} as never, url.pathname, route.request().method(), {
        store,
        cowork: () => cowork,
        boardroom: () => room,
        workflows: () => workflows,
        calendar: () => calendar,
        body: async () => route.request().postDataJSON() ?? {},
        send: (_r, code, v) => {
          status = code;
          data = v;
        },
        scoped: (_c, w) => w(),
        legacyAgent: () => undefined,
        routeCowork: async () => false,
        start: () => {},
        pause: () => {},
      });
      if (!handled) {
        status = 404;
        data = { error: 'Unknown route' };
      }
    } catch (error) {
      status = 400;
      data = { error: (error as Error).message };
    }
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('http://company-workflow.test/');
  await page.getByRole('button', { name: 'New workflow', exact: true }).click();
  if (errors.length) throw Error(errors.join('\n'));
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByRole('button', { name: 'Reset view', exact: true }).click();
  const tile = await page.locator('[data-wf-node=research]').boundingBox();
  if (!tile) throw Error('Research node is missing.');
  await page.mouse.move(tile.x + 40, tile.y + 35);
  await page.mouse.down();
  await page.mouse.move(tile.x + 60, tile.y + 55, { steps: 3 });
  await page.mouse.up();
  const moved = await page.locator('[data-wf-node=research]').boundingBox();
  if (!moved || moved.x === tile.x) throw Error('Node drag did not update the draft.');
  await page.getByRole('button', { name: 'Arrange nodes', exact: true }).click();
  await page.getByRole('button', { name: 'Save new version', exact: true }).click();
  await page.getByRole('button', { name: 'Approve version 1', exact: true }).waitFor();
  const workflow = store.list<any>('workflow', company.id)[0];
  if (!workflow) throw Error('Workflow did not persist.');
  await page.getByRole('tab', { name: 'Simulation', exact: true }).click();
  if (errors.length) throw Error(errors.join('\n'));
  await page.getByLabel('Sample outputs by step ID (JSON)', { exact: true }).fill('{"research":"Sample customer evidence"}');
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await page.locator('[data-wf-node=research][data-state=simulated]').waitFor();
  const nodeStyle = await page.locator('[data-wf-node=research] .wf-node-content').evaluate((el) => {
    const s = getComputedStyle(el);
    return { border: s.borderWidth, background: s.backgroundColor, position: s.position };
  });
  if (nodeStyle.border === '0px' || nodeStyle.background === 'rgba(0, 0, 0, 0)') throw Error('Workflow node lost its visible data surface under the shared action theme.');
  if (cowork.missions().length || store.jobs(company.id).length || store.actions(company.id).length) throw Error('Simulation created execution side effects.');
  await page.locator('[data-wf-edge]').click();
  await page.getByRole('heading', { name: 'Information handoff' }).waitFor();
  await page.screenshot({ path: '.qa/company-ui/workflow-simulation-light.png', fullPage: true });
  await page.getByRole('tab', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: 'Approve version 1', exact: true }).click();
  await page.getByRole('tab', { name: 'Live execution', exact: true }).click();
  await page.getByRole('button', { name: 'Start approved version', exact: true }).click();
  workflows.prepare();
  let run = store.list<any>('workflow-run', company.id)[0];
  const mission = cowork.getMission(run.steps[0].missionId)!;
  cowork.updateMission(mission.id, { status: 'done', result: 'QA fixture customer research evidence.' });
  workflows.prepare();
  await page.evaluate(async () => {
    await (document.getElementById('fixture') as any)._workflowRefresh();
  });
  await page.locator('[data-wf-node=review]').click();
  await page.getByRole('button', { name: 'Approve exact input', exact: true }).click();
  await page.getByRole('button', { name: 'Approve exact input', exact: true }).waitFor({ state: 'detached' });
  workflows.prepare();
  await page.evaluate(async () => {
    await (document.getElementById('fixture') as any)._workflowRefresh();
  });
  run = store.list<any>('workflow-run', company.id)[0];
  if (run.state !== 'completed') throw Error('Director gate did not advance the actual run.');
  if ((await page.locator('.wf-issues').textContent())?.trim() || (await page.locator('.wf-inspector').textContent())?.includes('Director approval required.'))
    throw Error('Completed approvals still display a pending approval blocker.');
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await page.screenshot({ path: '.qa/company-ui/workflow-live-dark.png', fullPage: true });
  await page.getByRole('tab', { name: 'Design', exact: true }).click();
  await page.locator('[data-wf-node=research]').click();
  await page.getByText('Required resources and limits', { exact: true }).click();
  await page.getByLabel('Required connected accounts', { exact: true }).fill('missing-github');
  await page.getByRole('button', { name: 'Apply changes', exact: true }).click();
  await page.getByRole('button', { name: 'Save new version', exact: true }).click();
  await page.getByRole('button', { name: 'Approve version 2', exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Simulation', exact: true }).click();
  await page.getByRole('button', { name: 'Validate requirements', exact: true }).click();
  await page.getByRole('button', { name: 'Open Resources', exact: true }).click();
  if ((await page.evaluate(() => (window as any).lastNavigation)) !== 'Connections') throw Error('Missing connection fix did not navigate to actual Resources section.');
  store.update(company.id, { accountIds: ['calendar-1', 'missing-github'] });
  await page.evaluate(async () => {
    (window as any).Companies.tab = 'Workflows';
    await (window as any).companyWorkflowsMount(document.getElementById('fixture'));
  });
  await page.getByRole('button', { name: 'Validate requirements', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.wf-issues')!.textContent!.includes('missing-github'));
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Workflow studio overflows on mobile.');
  await page.screenshot({ path: '.qa/company-ui/workflow-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(async () => {
    (window as any).Companies.tab = 'Calendar';
    await (window as any).companyCalendarMount(document.getElementById('fixture'));
  });
  await page.getByRole('button', { name: /Customer review/ }).click();
  await page.getByLabel('Google Calendar account', { exact: true }).selectOption('calendar-1');
  await page.getByRole('button', { name: 'Enable Calendar sync', exact: true }).click();
  await page.getByRole('button', { name: 'Synchronize now', exact: true }).click();
  await page.getByText('Calendar status: synced', { exact: true }).waitFor();
  if (!event) throw Error('Calendar fixture did not receive an actual transport call.');
  await page.screenshot({ path: '.qa/company-ui/calendar-dark.png', fullPage: true });
  await page.getByText('Edit meeting schedule', { exact: true }).click();
  await page.getByLabel('Start (ISO timestamp with UTC offset)', { exact: true }).fill(new Date(Date.now() + 7200000).toISOString());
  await page.getByLabel('End (ISO timestamp with UTC offset)', { exact: true }).fill(new Date(Date.now() + 9000000).toISOString());
  await page.getByRole('button', { name: 'Save meeting schedule', exact: true }).click();
  await page.getByRole('button', { name: 'Synchronize now', exact: true }).click();
  await page.getByText('Calendar status: synced', { exact: true }).waitFor();
  if (room.read({ kind: 'director' }, meeting.id).startAt === meeting.startAt) throw Error('Schedule editing did not persist.');
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Calendar overflows on mobile.');
  await page.screenshot({ path: '.qa/company-ui/calendar-mobile.png', fullPage: true });
  if (errors.length) throw Error(errors.join('\n'));
  console.log(
    'Workflow/Calendar UI passed real scoped persistence, separate simulation, handoff inspection, actual mission links, exact input approvals, valid resource fix navigation and revalidation, Calendar transport and schedule editing, dark/light and mobile layouts.',
  );
} finally {
  await browser.close();
  store.close();
}
