import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const appRoot = process.env.GITU_SMOKE_APP_ROOT || process.cwd();
const { GituServer } = await import(pathToFileURL(path.join(appRoot, 'dist/server/server.js')).href);
const home = mkdtempSync(path.join(tmpdir(), 'gitu-browser-chat-'));
process.env.AGENT_GITU_HOME = home;
const fixture = createServer((req, res) => {
  res.setHeader('content-type', 'text/html');
  if (req.url?.startsWith('/done')) {
    res.setHeader('set-cookie', 'fixture_login=yes; HttpOnly; SameSite=Lax');
    res.end('<h1>Fixture signed in</h1>');
    return;
  }
  req.resume();
  res.end(
    '<!doctype html><style>body{font:20px system-ui}input,button{display:block;width:260px;height:44px;margin:12px}</style><form action="/done" method="post"><input name="email" aria-label="Email"><input name="password" type="password" aria-label="Password"><button>Sign in</button></form>',
  );
});
await new Promise<void>((resolve) => fixture.listen(0, '127.0.0.1', resolve));
const fixtureOrigin = 'http://127.0.0.1:' + (fixture.address() as { port: number }).port;
const server = new GituServer({ cwd: home, port: 0, autoInstallLsp: false });
let browser;
try {
  const origin = 'http://127.0.0.1:' + (await server.start());
  assert.equal((await fetch(origin + '/api/server-browser/workspace')).status, 401);
  await fetch(origin + '/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Owner', email: 'owner@example.com', password: 'Disposable browser smoke passphrase' }),
  });
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(origin);
  await page.getByLabel('Email address').fill('owner@example.com');
  await page.getByLabel('Password', { exact: true }).fill('Disposable browser smoke passphrase');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(origin + '/');
  const onboard=await page.request.post(origin+'/api/onboarding',{data:{theme:'light',mode:'cowork',model:''}});assert(onboard.ok());
  const api = async (route: string, body?: object) => {
    const r = await page.request.fetch(origin + route, { method: body ? 'POST' : 'GET', data: body });
    if (!r.ok()) throw new Error(route + ': ' + r.status() + ' ' + (await r.text()));
    return r.json();
  };
  const { agent } = await api('/api/cowork/agents', { name: 'Browser fixture', systemPrompt: 'Answer briefly.', useHostComputer: true, avatar:{shape:'dot-orange',color:'#f39b52'} });
  await api('/api/cowork/conversations', { kind: 'dm', memberIds: [agent.id] });
  await page.evaluate(() => localStorage.setItem('hermes.cowork', 'open'));
  await page.reload();
  await page.locator('#cwComputerBtn').waitFor();
  await page.locator('#cwComputerBtn').tap();
  const card = page.locator('#cwInlineComputer');
  await card.waitFor();
  const frame = card.frameLocator('iframe');
  await frame.getByRole('heading',{name:'Your window to the web'}).waitFor();
  await frame.locator('#status').waitFor({state:'hidden'});
  const navBounds=await page.locator('.cw-top-nav').boundingBox();
  const cardBounds=await card.boundingBox();
  assert(navBounds&&navBounds.y>=0&&cardBounds&&cardBounds.y>=navBounds.y+navBounds.height,'Browser must stay below the app navigation.');
  mkdirSync('.qa/browser-chat', { recursive: true });
  await page.screenshot({path:'.qa/browser-chat/mobile-welcome.png'});
  await frame.getByRole('button', { name: 'Take control', exact: true }).tap();
  await frame.getByRole('button', { name: 'Return to agent', exact: true }).waitFor();
  await frame.getByLabel('Website address').fill(fixtureOrigin);
  await frame.getByRole('button', { name: 'Go', exact: true }).tap();
  await frame.getByRole('button', { name: 'Browser options', exact: true }).tap();
  await frame.getByRole('button', { name: 'Mobile view', exact: true }).tap();
  const endpoint = '/api/server-browser/' + agent.id;
  await page.waitForFunction(async (endpoint) => {
    const data = await (await fetch(endpoint)).json();
    return data.screenshot?.state.url.startsWith('http://127.0.0.1:') && data.screenshot.state.title !== undefined;
  }, endpoint);
  await api(endpoint, { action: 'click', x: 40, y: 40 });
  const keyboard = frame.getByLabel('Keyboard input (hidden)');
  await keyboard.fill('fixture@example.com');
  await frame.getByRole('button', { name: 'Send text', exact: true }).tap();
  await page.waitForFunction(() => true);
  assert.equal(await keyboard.inputValue(), '');
  await frame.getByRole('button', { name: 'Tab', exact: true }).tap();
  await keyboard.fill('Disposable website password');
  await frame.getByRole('button', { name: 'Send text', exact: true }).tap();
  await frame.getByRole('button', { name: 'Enter', exact: true }).tap();
  await page.waitForFunction(async (endpoint) => {
    const d = await (await fetch(endpoint)).json();
    return d.screenshot?.state.url.includes('/done');
  }, endpoint);
  const shot = await api(endpoint);
  assert.equal(shot.control, 'user');
  assert(!('textDigest' in shot.screenshot));
  assert.equal(shot.screenshot.mime, 'image/jpeg');
  assert.equal(await card.evaluate((el) => getComputedStyle(el.querySelector('iframe')!).pointerEvents), 'auto');
  await card.getByRole('button', { name: 'Expand', exact: true }).tap();
  assert.equal(await card.evaluate((el) => getComputedStyle(el).position), 'fixed');
  await page.screenshot({path:'.qa/browser-chat/mobile-fullscreen.png'});
  await card.getByRole('button', { name: 'Collapse', exact: true }).tap();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(page.context().pages().length, 1);
  mkdirSync('.qa/browser-chat', { recursive: true });
  await page.screenshot({ path: '.qa/browser-chat/mobile-inline.png' });
  await frame.getByRole('button', { name: 'Return to agent', exact: true }).tap();
  await frame.getByRole('button', { name: 'Take control', exact: true }).waitFor();
  const cookie = (await page.context().cookies(origin)).find((c) => c.name === 'gitu_session');
  assert(cookie);
  const cross = await page.request.post(origin + endpoint, { headers: { origin: 'https://attacker.example' }, data: { action: 'take-control' } });
  assert.equal(cross.status(), 403);
  const notFound = await page.request.get(origin + '/api/server-browser/unknown-agent');
  assert.equal(notFound.status(), 400);
  const view = await page.request.get(origin + endpoint + '/view');
  assert.match(view.headers()['content-security-policy'], /frame-ancestors 'self'/);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: '.qa/browser-chat/desktop-inline.png' });
  await page.setViewportSize({ width:390,height:844 });
  await frame.getByRole('button',{name:'Browser options',exact:true}).tap();
  await frame.getByRole('button',{name:'Your Chrome profile',exact:true}).tap();
  await frame.getByRole('button',{name:'Open Google Chrome',exact:true}).waitFor();
  await frame.locator('#location option').first().waitFor({state:'attached'});
  assert.equal(page.context().pages().length,1);
  await page.screenshot({path:'.qa/browser-chat/mobile-chrome-profile.png'});
  await frame.locator('#back').tap();
  await frame.getByRole('button',{name:'Browser options',exact:true}).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      pass: true,
      realBrowser: true,
      mobileInline: true,
      desktopInline: true,
      websiteForm: true,
      privateInput: true,
      fullscreen: true,
      noNewWindow: true,
      crossOriginRejected: true,
    }),
  );
} finally {
  await browser?.close();
  await server.stop();
  await new Promise<void>((resolve) => fixture.close(() => resolve()));
  rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
