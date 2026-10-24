import { chromium } from 'playwright';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { CompanyStore } from '../src/company/store.js';
import { CoworkStore } from '../src/cowork/store.js';
import { CompanyOrganization } from '../src/company/organization.js';
import { companyApi } from '../src/company/api.js';
import { UI_HTML } from '../src/server/ui.js';
import { COMPANY_ORGANIZATION_JS } from '../src/server/ui-company-organization.js';

const scratch = path.resolve('.qa');
mkdirSync(scratch, { recursive: true });
mkdirSync(path.join(scratch, 'company-ui'), { recursive: true });
const root = mkdtempSync(path.join(scratch, 'company-org-fixture-')),
  store = new CompanyStore(root);
const company = store.create({ name: 'Studio', purpose: 'Research', connectionIds: ['api-1', 'api-2'], accountIds: ['mail-1'] });
const cowork = new CoworkStore(path.join(root, 'cowork.json'), undefined, { companyId: company.id, persistence: store.snapshot(company.id) });
const ceo = cowork.saveAgent({ name: 'Ari', systemPrompt: 'Lead', chiefOfStaff: true, allowWrites: true });
const employee = cowork.saveAgent({ name: 'Milo', systemPrompt: 'Research', allowWrites: true });
store.update(company.id, { leadId: ceo.id });
const organization = new CompanyOrganization(store, company.id, cowork);
organization.snapshot();
const styles = [...UI_HTML.slice(0, UI_HTML.indexOf('</head>')).matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const html = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles} body{padding:24px} #fixture{max-width:1100px;margin:auto}</style></head><body><main id="fixture" class="company-page"></main><script>var Companies={id:${JSON.stringify(company.id)},data:{company:${JSON.stringify(company)}}};function esc(value){var el=document.createElement('span');el.textContent=String(value??'');return el.innerHTML.replace(/"/g,'&quot;').replace(/'/g,'&#39;');}function companyAgentAvatar(agent){return esc(agent.name.slice(0,1));}async function api(url,options){var response=await fetch(url,options),data=await response.json();if(!response.ok)throw Error(data.error);return data;}${COMPANY_ORGANIZATION_JS}companyOrganizationMount(document.getElementById('fixture'));</script></body></html>`;
const smokeChannel = process.env['GITU_UI_SMOKE_CHANNEL'] ?? (process.platform === 'win32' ? 'msedge' : undefined);
const browser = await chromium.launch({ headless: true, ...(smokeChannel ? { channel: smokeChannel } : {}) });
const invalidated: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 1360, height: 960 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (!url.pathname.startsWith('/api/')) return route.fulfill({ status: 404, body: '' });
    if (url.pathname === '/api/connections')
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          connections: [
            { id: 'api-1', label: 'Research search' },
            { id: 'api-2', label: 'Internal data' },
          ],
        }),
      });
    if (url.pathname.endsWith('/connected-apps'))
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ accounts: [{ id: 'mail-1', label: 'Business mailbox' }] }) });
    let status = 200,
      data: unknown;
    try {
      const handled = await companyApi({} as never, {} as never, url.pathname, route.request().method(), {
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
        invalidateAgent: (id) => invalidated.push(id),
      });
      if (!handled) {
        status = 404;
        data = { error: 'Fixture route not found.' };
      }
    } catch (error) {
      status = 400;
      data = { error: (error as Error).message };
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('http://gitu-org-fixture.invalid/');
  await page.getByRole('button', { name: /Milo/ }).click();
  await page.getByLabel('Responsibilities', { exact: true }).fill('Verify sources\nShare evidence');
  await page.getByRole('button', { name: 'Add department', exact: true }).click();
  await page.getByLabel('Department name', { exact: true }).fill('Research');
  await page.getByLabel('Purpose', { exact: true }).fill('Evidence and analysis');
  await page.getByRole('button', { name: 'Create department', exact: true }).click();
  await page.getByLabel('Department', { exact: true }).locator('option').filter({ hasText: 'Research' }).waitFor({ state: 'attached' });
  const department = organization.departments()[0];
  await page.getByLabel('Department', { exact: true }).selectOption(department!.id);
  if ((await page.getByLabel('Responsibilities', { exact: true }).inputValue()) !== 'Verify sources\nShare evidence')
    throw Error('Department creation discarded the employee draft.');
  await page.getByLabel('Role', { exact: true }).selectOption('team-leader');
  await page.getByLabel('assign work', { exact: true }).check();
  await page.getByText('APIs Additional restrictions', { exact: true }).click();
  await page.locator('[data-org-inherit=connectionIds]').uncheck();
  await page.getByLabel('Research search', { exact: true }).check();
  await page.getByRole('button', { name: 'Save authority', exact: true }).click();
  await page.getByText('Saved. Active work will recheck this authority before continuing.', { exact: true }).waitFor();
  if (organization.member(employee.id).role !== 'team-leader' || organization.member(employee.id).departmentId !== department!.id)
    throw Error('Organization changes were not persisted.');
  if (organization.authorizeTool(employee.id, 'web_search', { connectionId: 'api-2' })?.ok !== false) throw Error('API restriction was not enforced.');
  if (invalidated.length !== 1 || invalidated[0] !== employee.id) throw Error('Active authority was not invalidated.');
  await page.screenshot({ path: '.qa/company-ui/organization-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Organization editor overflows on mobile.');
  await page.screenshot({ path: '.qa/company-ui/organization-mobile.png', fullPage: true });
  await page.getByLabel('Employment status', { exact: true }).selectOption('onboarding');
  await page.getByRole('button', { name: 'Save authority', exact: true }).click();
  await page.getByRole('button', { name: 'Save authority', exact: true }).waitFor({ state: 'visible' });
  await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('.company-org-editor [type=submit]')!.disabled);
  await page.getByLabel('Employment status', { exact: true }).selectOption('active');
  await page.getByRole('button', { name: 'Save authority', exact: true }).click();
  await page.getByText('Complete required onboarding or retraining checks before activation.', { exact: true }).waitFor();
  if (organization.member(employee.id).status !== 'onboarding') throw Error('UI bypassed onboarding activation.');
  if (errors.length) throw Error(errors.join('\n'));
  console.log('Organization UI, real persistence, department drafts, runtime grants, mobile layout and activation gates passed.');
} finally {
  await browser.close();
  store.close();
  if (!root.startsWith(scratch + path.sep)) throw Error('Fixture cleanup scope changed.');
  rmSync(root, { recursive: true, force: true });
}
