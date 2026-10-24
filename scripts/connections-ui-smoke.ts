import { chromium } from 'playwright';
import ts from 'typescript';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { UI_HTML } from '../src/server/ui.js';
import { COWORK_JS } from '../src/server/ui-cowork.js';
import { CONNECTED_APPS_JS } from '../src/server/ui-connected-apps.js';
import { CUSTOM_CONNECTION_JS } from '../src/server/ui-custom-connection.js';
import { MAIL_PROVIDERS } from '../src/connections/mail.js';
import { FONT_FILES } from '../src/server/static-assets.js';

// Actual Settings functions and connection components; all network I/O is mocked.
const scripts = [...UI_HTML.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join('\n');
const source = ts.createSourceFile('ui.js', scripts, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const found: string[] = [];
function collect(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && ['openSettings', 'closeSettings', 'renderSettings'].includes(node.name?.text || '')) found.push(node.getFullText(source));
  ts.forEachChild(node, collect);
}
collect(source);
const functions = found.join('\n');
if (!functions.includes('function renderSettings')) throw Error('Settings functions were not found.');
const styles = [...UI_HTML.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const prefix = `var S={setSection:'connections',sel:{},cowork:null};function $(id){return document.getElementById(id)}function esc(v){var el=document.createElement('span');el.textContent=String(v??'');return el.innerHTML.replace(/"/g,'&quot;').replace(/'/g,'&#39;')}function icon(){return '<svg width="16" height="16" aria-hidden="true"></svg>'}function closeToolPanel(){}function wsOpen(){}function toast(v){window.lastToast=v}function api(url,options){return fetch(url,options).then(async r=>{var data=await r.json();if(!r.ok)throw Error(data.error);return data})}var WORKSPACE_SETTINGS=[['connections','plug','Connections','Apps and APIs']];`;
const html =
  '<!doctype html><html data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>' +
  styles +
  '</style></head><body><main class="shell"><div id="cwChat">Original conversation stays here</div><button id="entry">Open connections</button></main><div class="settings" id="settings" hidden><aside class="setnav" id="setnav"></aside><main class="setbody" id="setbody"></main></div><script>' +
  prefix +
  COWORK_JS +
  CONNECTED_APPS_JS +
  CUSTOM_CONNECTION_JS +
  functions +
  `;cwEnsure().selectedAgentId='writer';$('entry').onclick=cwOpenWorkspaceConnections;</script></body></html>`;
const output = path.resolve('.qa/connections-ui');
mkdirSync(output, { recursive: true });
let saved: Record<string, any> | undefined,
  creations = 0,
  updates = 0,
  tests = 0,
  failTest = true;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      p = url.pathname;
    let data: unknown = {};
    if (p === '/') return route.fulfill({ contentType: 'text/html', body: html });
    if (p.startsWith('/fonts/') && FONT_FILES[path.basename(p)])
      return route.fulfill({ contentType: 'font/woff2', body: readFileSync(path.join('assets/fonts', path.basename(p))) });
    if (p === '/api/connected-apps')
      data = {
        configured: false,
        canConfigure: true,
        agents: [{ id: 'writer', name: 'Writer' }],
        accounts: [],
        availableAccounts: [],
        appPermissions: [],
        mail: { providers: MAIL_PROVIDERS, accounts: [], available: [] },
      };
    else if (p === '/api/connections' && req.method() === 'POST') {
      const body = req.postDataJSON();
      if (body.id) updates++;
      else creations++;
      saved = { ...body, id: 'research-api', hasCredential: true, token: undefined };
      data = { connection: saved };
    } else if (p === '/api/connections') data = { connections: saved ? [saved] : [] };
    else if (p.endsWith('/test')) {
      tests++;
      if (failTest) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Connection saved, but the service rejected its key.' }) });
      data = { ok: true };
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('http://gitu-connection-fixture.invalid/');
  await page.getByRole('button', { name: 'Open connections', exact: true }).click();
  await page.locator('#workspaceAppsPanel').getByLabel('Composio API key', { exact: true }).waitFor();
  if ((await page.locator('#cwChat').innerText()) !== 'Original conversation stays here') throw Error('Connections replaced the current chat.');
  await page.getByRole('button', { name: 'Custom APIs', exact: true }).click();
  await page.getByRole('button', { name: 'Add connection', exact: true }).click();
  await page.getByLabel('Service', { exact: true }).selectOption('tavily');
  if ((await page.getByLabel('API address', { exact: true }).inputValue()) !== 'https://api.tavily.com') throw Error('Provider selection did not fill its API address.');
  await page.getByLabel('API key or access token', { exact: true }).fill('fixture-key');
  await page.screenshot({ path: path.join(output, 'custom-api-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw Error('Custom API form overflows on mobile.');
  await page.screenshot({ path: path.join(output, 'custom-api-mobile.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save and test connection', exact: true }).click();
  await page.getByRole('button', { name: 'Retry connection test', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Retry connection test', exact: true }).click();
  if (creations !== 1 || updates !== 0) throw Error('A failed connection test created another account.');
  await page.getByRole('button', { name: 'Edit saved connection', exact: true }).click();
  await page.getByLabel('API key or access token', { exact: true }).fill('corrected-fixture-key');
  failTest = false;
  await page.getByRole('button', { name: 'Save and test connection', exact: true }).click();
  await page.locator('.custom-connection').waitFor({ state: 'detached' });
  if (creations !== 1 || updates !== 1 || tests !== 3) throw Error('Credential correction did not update the saved connection exactly once.');
  await page.getByRole('button', { name: 'Add connection', exact: true }).click();
  await page.getByLabel('Connection name', { exact: true }).fill('Local API');
  await page.getByLabel('API address', { exact: true }).fill('http://127.0.0.1:9400');
  await page.getByLabel('API key or access token', { exact: true }).fill('local-fixture-key');
  await page.getByText('Advanced connection settings', { exact: true }).click();
  await page.getByLabel('Connection test path', { exact: true }).fill('/api/me');
  await page.getByLabel('Authentication', { exact: true }).selectOption('header');
  await page.getByLabel('Authentication header', { exact: true }).fill('X-API-Key');
  await page.getByRole('button', { name: 'Save and test connection', exact: true }).click();
  await page.locator('.custom-connection').waitFor({ state: 'detached' });
  if (saved?.provider !== 'api-127-0-0-1') throw Error('Local IP address did not produce a valid provider identifier.');
  if (saved?.auth?.type !== 'header' || saved.auth.header !== 'X-API-Key') throw Error('Custom authentication settings were not saved.');
  await page.getByRole('button', { name: 'Close settings', exact: true }).click();
  if ((await page.locator('#cwChat').innerText()) !== 'Original conversation stays here') throw Error('Closing connections lost the original chat.');
  if (errors.length) throw Error(errors.join('\n'));
  console.log('Unified Settings manager, premium forms, mobile layout and retry/credential correction passed.');
} finally {
  await browser.close();
}
