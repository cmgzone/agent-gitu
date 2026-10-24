import { chromium } from 'playwright';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { UI_HTML } from '../src/server/ui.js';
import { COMPANY_JS } from '../src/server/ui-companies.js';
import { COWORK_JS } from '../src/server/ui-cowork.js';
import { FILE_UPLOAD_JS } from '../src/server/ui-files.js';
import type { CoworkStore } from '../src/cowork/store.js';
import type { CompanyStore } from '../src/company/store.js';
import type { CoworkMemory } from '../src/cowork/memory.js';

const scratch = path.resolve('.qa');
mkdirSync(scratch, { recursive: true });
mkdirSync(path.join(scratch, 'cowork-companies'), { recursive: true });
const root = mkdtempSync(path.join(scratch, 'cowork-companies-fixture-'));
const previousHome = process.env['AGENT_GITU_HOME'];
process.env['AGENT_GITU_HOME'] = root;
const server = new GituServer({ passwordRequired: false, port: 0, llm: new ScriptedMockLlm([]) });
const internal = server as unknown as { cowork(): CoworkStore; companies(): CompanyStore; coworkMemory(): CoworkMemory };
const channel = process.env['GITU_UI_SMOKE_CHANNEL'] ?? (process.platform === 'win32' ? 'msedge' : undefined);
const browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
try {
  const origin = 'http://localhost:' + await server.start();
  const roster = internal.cowork();
  const lead = roster.saveAgent({ name: 'Ari', systemPrompt: 'Coordinate useful work.', provider: 'preview', model: 'preview-model', allowConfig: true, allowWrites: true });
  const worker = roster.saveAgent({ name: 'Milo', systemPrompt: 'Research customer evidence.' });
  const styles = [...UI_HTML.slice(0, UI_HTML.indexOf('</head>')).matchAll(/<style>([\s\S]*?)<\/style>/g)].map(match => match[1]).join('\n');
  const html = `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><script>
  var S={active:'cowork',sel:{model:'preview::preview-model'},cw:{agents:${JSON.stringify(roster.listAgents())},convs:[],msgs:[]}};
  function $(id){return document.getElementById(id);}function toast(message){window.lastToast=message;}function humanBytes(value){return String(value)+' bytes';}function shortDate(value){return new Date(value).toLocaleDateString();}
  function esc(value){return String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
  async function api(url,options){var response=await fetch(url,options),data=await response.json();if(!response.ok)throw Error(data.error||response.statusText);return data;}
  ${COWORK_JS}${FILE_UPLOAD_JS}${COMPANY_JS}
  openCompanies();</script></body></html>`;
  const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(origin + '/', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto(origin + '/');
  await page.getByRole('button', { name: 'Create company', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Research studio');
  await page.getByLabel('Purpose and goals').fill('Learn what Nairobi teams need.');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('heading', { name: 'Choose your Cowork lead', exact: true }).waitFor();
  await page.getByLabel('Cowork teammate', { exact: true }).selectOption(lead.id);
  if (await page.locator('#companyLeadName,#companyLeadProvider,#companyLeadModel').count()) throw Error('Company still creates a separate agent profile');
  await page.screenshot({ path: '.qa/cowork-companies/choose-cowork-lead.png', fullPage: true });
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('heading', { name: 'Grant resources', exact: true }).waitFor();
  const company = internal.companies().companies()[0]!;
  if (company.leadId !== lead.id || roster.listAgents().length !== 2) throw Error('Choosing a lead cloned a Cowork teammate');
  internal.companies().transition(company.id, 'paused');
  await page.evaluate(id => (window as any).companyOpen(id), company.id);
  await page.getByRole('tab', { name: 'Team', exact: true }).click();
  await page.getByRole('button', { name: 'Add Cowork teammates', exact: true }).click();
  await page.getByLabel('Add an existing teammate', { exact: true }).selectOption(worker.id);
  await page.getByRole('button', { name: 'Add to company', exact: true }).click();
  await page.locator('[data-company-team-cards]').getByRole('heading', { name: 'Milo', exact: true }).waitFor();
  if (roster.listAgents().length !== 2) throw Error('Adding an existing teammate created another identity');
  if (await page.getByRole('navigation', { name: 'App modes' }).count()) throw Error('Company remains a third app mode');
  await page.getByRole('navigation', { name: 'Cowork workspace' }).waitFor();
  await page.screenshot({ path: '.qa/cowork-companies/shared-team.png', fullPage: true });
  await page.getByRole('tab', { name: 'Files & Knowledge', exact: true }).click();
  await page.getByLabel('Company note', { exact: true }).fill('The pilot serves small Nairobi teams first.');
  await page.getByRole('button', { name: 'Share with Cowork', exact: true }).click();
  await page.locator('[data-company-shared-memories]').getByText('Company Research studio [' + company.id + ']: The pilot serves small Nairobi teams first.', { exact: true }).waitFor();
  if (!internal.coworkMemory().companyEntries(worker, company.id).some(entry => entry.claim.includes('small Nairobi teams'))) throw Error('Cowork agents cannot recall company memory');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.documentElement.dataset.theme = 'dark');
  await page.screenshot({ path: '.qa/cowork-companies/shared-memory-mobile.png', fullPage: true });
  if (await page.locator('#companyPage').evaluate(element => element.scrollWidth > element.clientWidth)) throw Error('Workspace overflows on mobile');
  await page.getByRole('tab', { name: 'Team', exact: true }).click();
  await page.getByRole('button', { name: 'Add Cowork teammates', exact: true }).click();
  await page.getByRole('button', { name: 'Remove membership', exact: true }).click();
  await page.locator('[data-company-team-cards]').getByRole('heading', { name: 'Milo', exact: true }).waitFor({ state: 'hidden' });
  await page.locator('[data-company-team-cards]').getByRole('heading', { name: 'Ari', exact: true }).waitFor();
  if (roster.getAgent(worker.id)?.name !== 'Milo') throw Error('Removing membership deleted the Cowork teammate');
  const members = await fetch(origin + '/api/companies/' + company.id + '/members').then(response => response.json()) as { agents: { id: string }[] };
  if (members.agents.some(agent => agent.id === worker.id)) throw Error('Company membership was not removed');
  if (errors.length) throw Error(errors.join('\n'));
  console.log('Cowork company UI passed: existing lead, shared roster, memberships, shared memory, Cowork navigation and mobile layout against the real server.');
} finally {
  await browser.close(); await server.stop();
  if (previousHome === undefined) delete process.env['AGENT_GITU_HOME']; else process.env['AGENT_GITU_HOME'] = previousHome;
  if (!path.resolve(root).startsWith(scratch + path.sep)) throw Error('Fixture cleanup escaped the QA directory');
  rmSync(root, { recursive: true, force: true });
}
