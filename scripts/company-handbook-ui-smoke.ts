import { chromium } from 'playwright';
import { mkdtempSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { CompanyStore } from '../src/company/store.js';
import { CoworkStore } from '../src/cowork/store.js';
import { CompanyOrganization } from '../src/company/organization.js';
import { CompanyBoardroom } from '../src/company/boardroom.js';
import { companyApi } from '../src/company/api.js';
import { UI_HTML } from '../src/server/ui.js';
import { COMPANY_HANDBOOK_JS } from '../src/server/ui-company-handbook.js';

const scratch = path.resolve('.qa');
mkdirSync(path.join(scratch, 'company-ui'), { recursive: true });
const root = mkdtempSync(path.join(scratch, 'company-handbook-fixture-')),
  store = new CompanyStore(root);
const company = store.create({ name: 'Studio', purpose: 'Customer research', monthlyBudgetUsd: null, maxFileBytes: null });
const cowork = new CoworkStore(path.join(root, 'cowork.json'), undefined, { companyId: company.id, persistence: store.snapshot(company.id) });
const ceo = cowork.saveAgent({ name: 'Ari', systemPrompt: 'Lead', chiefOfStaff: true, allowWrites: true });
store.update(company.id, { leadId: ceo.id });
store.transition(company.id, 'running');
const org = new CompanyOrganization(store, company.id, cowork);
org.snapshot();
const employee = cowork.saveAgent({ name: 'Milo', systemPrompt: 'Research', allowWrites: true });
org.updateMember({ kind: 'director' }, employee.id, { responsibilities: ['Verify customer evidence'] }, org.snapshot().revision);
const room = new CompanyBoardroom(org),
  styles = [...UI_HTML.slice(0, UI_HTML.indexOf('</head>')).matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const html = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}body{padding:24px}#fixture{max-width:1100px;margin:auto}</style></head><body><main id="fixture" class="company-page"></main><script>var Companies={id:${JSON.stringify(company.id)},tab:'Handbook',data:{agents:${JSON.stringify(cowork.listAgents())}}};function esc(value){var el=document.createElement('span');el.textContent=String(value??'');return el.innerHTML.replace(/"/g,'&quot;').replace(/'/g,'&#39;');}function companyUrl(suffix){return '/api/companies/'+Companies.id+suffix;}function companyRender(){window.lastNavigation=Companies.tab;}async function api(url,options){var res=await fetch(url,options),data=await res.json();if(!res.ok)throw Error(data.error);return data;}${COMPANY_HANDBOOK_JS}companyHandbookMount(document.getElementById('fixture'));</script></body></html>`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 960 } }),
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
        body: async () => route.request().postDataJSON() ?? {},
        send: (_r, code, value) => {
          status = code;
          data = value;
        },
        scoped: (_c, work) => work(),
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
  await page.goto('http://company-handbook.test/');
  await page.getByRole('button', { name: 'Propose guidance', exact: true }).click();
  if (errors.length) throw Error(errors.join('\n'));
  await page.getByLabel('Title', { exact: true }).fill('Evidence and escalation');
  await page.getByLabel('Guidance', { exact: true }).fill('Cite every source. Escalate unresolved evidence gaps to the director.');
  await page.getByRole('button', { name: 'Submit for approval', exact: true }).click();
  await page.getByRole('button', { name: /Evidence and escalation/ }).click();
  await page.getByRole('button', { name: 'Approve version', exact: true }).click();
  await page.getByText('Director approved · version 1', { exact: true }).waitFor();
  await page.getByLabel('Propose an updated guideline').fill('Draft: retain relevant disagreements.');
  await page.getByRole('button', { name: 'Onboarding', exact: true }).click();
  await page.getByRole('button', { name: /Milo/ }).click();
  await page.getByLabel('Required tools', { exact: true }).fill('read_file');
  await page.getByRole('button', { name: 'Complete orientation', exact: true }).click();
  await page.getByRole('button', { name: 'Schedule onboarding meeting', exact: true }).click();
  await page.getByRole('button', { name: 'Meeting already scheduled', exact: true }).waitFor();
  const record = store.list<any>('onboarding', company.id).find((r) => r.agentId === employee.id),
    meeting = room.begin({ kind: 'director' }, record.meetingId);
  const granted = room.grant({ kind: 'director' }, meeting.id, { agentId: employee.id, agendaId: meeting.agenda[0]!.id });
  room.contribute({ kind: 'agent', agentId: employee.id }, meeting.id, granted.lease!.id, { text: 'I understand the role and source requirements.' });
  room.finish({ kind: 'director' }, meeting.id);
  await page.getByRole('button', { name: 'Check resources', exact: true }).click();
  await page.getByLabel('Practical assessment task', { exact: true }).fill('Explain the supplied research notes.');
  await page.getByLabel('Completion criteria, one per line').fill('Cite the customer evidence');
  await page.getByRole('button', { name: 'Assign limited assessment', exact: true }).click();
  await page.getByRole('heading', { name: 'Assessment mission' }).waitFor();
  const mission = cowork.missions()[0]!,
    message = cowork.appendMessage(mission.conversationId, {
      role: 'agent',
      via: 'agent',
      agentId: employee.id,
      missionId: mission.id,
      text: 'QA fixture evidence: customers need a clearer onboarding guide.',
    });
  cowork.updateMission(mission.id, { status: 'done', result: message.text });
  await page.getByLabel('Assessment review notes').fill('Source and responsibilities verified in the QA fixture.');
  await page.evaluate(async () => {
    await (document.getElementById('fixture') as any)._guidanceRefresh();
  });
  if ((await page.getByLabel('Assessment review notes').inputValue()) !== 'Source and responsibilities verified in the QA fixture.')
    throw Error('Live assessment refresh lost the review draft.');
  await page.locator('[name=evidence]').check();
  await page.getByRole('button', { name: 'Approve assessment', exact: true }).click();
  await page.getByRole('button', { name: 'Activate employee', exact: true }).click();
  await page.getByText('Employee is active. Existing tool and account grants remain in force.').waitFor();
  if (org.member(employee.id).status !== 'active') throw Error('Activation did not persist.');
  await page.getByRole('button', { name: 'Handbook', exact: true }).click();
  await page.getByRole('button', { name: /Evidence and escalation/ }).click();
  if ((await page.getByLabel('Propose an updated guideline').inputValue()) !== 'Draft: retain relevant disagreements.') throw Error('Switching modes lost the handbook draft.');
  await page.screenshot({ path: '.qa/company-ui/handbook-light.png', fullPage: true });
  await page.evaluate(() => (document.documentElement.dataset.theme = 'dark'));
  await page.screenshot({ path: '.qa/company-ui/handbook-dark.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Handbook overflows on mobile.');
  await page.screenshot({ path: '.qa/company-ui/handbook-mobile.png', fullPage: true });
  if (errors.length) throw Error(errors.join('\n'));
  console.log(
    'Handbook/onboarding UI passed scoped persistence, approved versions, draft preservation, real mission creation, evidence review, activation, light/dark theme and mobile layout.',
  );
} finally {
  await browser.close();
  store.close();
}
