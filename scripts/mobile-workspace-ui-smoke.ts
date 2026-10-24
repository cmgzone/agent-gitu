import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { WORKSPACE_LOADED_JS } from '../apps/mobile/src/gitu/workspace-runtime.js';

const appRoot = process.env.GITU_SMOKE_APP_ROOT || process.cwd();
const { GituServer } = await import(pathToFileURL(path.join(appRoot, 'dist/server/server.js')).href);
const { ScriptedMockLlm } = await import(pathToFileURL(path.join(appRoot, 'dist/llm/llm.js')).href);
const home = mkdtempSync(path.join(tmpdir(), 'gitu-phone-actions-'));
process.env.AGENT_GITU_HOME = home;
process.env.AGENT_GITU_ALLOW_LAN_LOGIN = '1';
const server = new GituServer({ cwd: home, port: 0, host: '0.0.0.0', accessKey: 'phone-ui-fixture-key-at-least-32-characters', autoInstallLsp: false, coworkCompletionProtocol: 'legacy', llm: new ScriptedMockLlm(Array.from({ length: 20 }, () => () => 'Your mobile message arrived.')) });
let browser;
try {
  const port = await server.start();
  const password = 'Mobile smoke fixture password';
  const setup = await fetch(`http://127.0.0.1:${port}/api/auth/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Phone fixture', email: 'phone@example.com', password }) });
  assert.equal(setup.status, 201);
  const lan = Object.values(networkInterfaces()).flat().find(entry => entry && entry.family === 'IPv4' && !entry.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address));
  assert(lan, 'A private network interface is required.');
  const origin = `http://${lan.address}:${port}`;
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  const before = await page.evaluate(() => ({ secure: isSecureContext, uuid: typeof crypto.randomUUID }));
  assert.equal(before.secure, false, 'This must exercise HTTP LAN rather than secure localhost.');
  assert.equal(before.uuid, 'undefined');
  await page.getByLabel('Email address').fill('phone@example.com');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(origin + '/');
  await page.locator('#setupNext').click(); await page.locator('#setupSkip').click(); await page.locator('#setupNext').click();
  await page.locator('#setupWizard').waitFor({ state: 'hidden' });
  const api = async (route: string, body?: object) => {
    const response = await page.request.fetch(origin + route, { method: body ? 'POST' : 'GET', data: body });
    assert(response.ok(), route + ': ' + response.status());
    return response.json();
  };
  const { agent } = await api('/api/cowork/agents', { name: 'Phone test', systemPrompt: 'Answer briefly without using tools.', avatar: { shape: 'dot-orange', color: '#f39b52' } });
  const { conversation } = await api('/api/cowork/conversations', { kind: 'dm', memberIds: [agent.id] });
  await page.evaluate(() => localStorage.setItem('hermes.cowork', 'open'));
  await page.reload();
  await page.locator('#cwInput').waitFor();
  for (const [width, height, native] of [[390, 844, false], [360, 500, true], [844, 390, true]] as const) {
    await page.setViewportSize({ width, height });
    if (native) await page.evaluate(WORKSPACE_LOADED_JS);
    const text = `Phone tap ${width}x${height}`;
    await page.locator('#cwInput').fill(text);
    const posted = page.waitForResponse(response => response.url().endsWith(`/conversations/${conversation.id}/messages`) && response.request().method() === 'POST');
    await page.locator('#cwSend').tap();
    const response = await posted;
    assert.equal(response.status(), 202);
    assert.match((await response.json()).message.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    await page.waitForFunction(async route => !(await (await fetch(route)).json()).busy, `/api/cowork/conversations/${conversation.id}/messages`);
    const snapshot = await api(`/api/cowork/conversations/${conversation.id}/messages`);
    assert(snapshot.messages.some((message: { text: string; role: string }) => message.role === 'user' && message.text === text));
    const userIndex = snapshot.messages.findIndex((message: { text: string }) => message.text === text);
    assert(snapshot.messages.slice(userIndex + 1).some((message: { text: string; role: string }) => message.role === 'agent' && message.text === 'Your mobile message arrived.'));
    assert.equal(await page.locator('#cwInput').inputValue(), '');
    const styles = await page.locator('#cwChat').evaluate(chat => ({
      before: getComputedStyle(chat, '::before').display,
      after: getComputedStyle(chat, '::after').display,
      blurred: Array.from(document.querySelectorAll('#cw *')).filter(node => {
        const style = getComputedStyle(node), rect = node.getBoundingClientRect();
        return rect.width && rect.height && style.backdropFilter !== 'none';
      }).length,
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    assert.equal(styles.before, 'none'); assert.equal(styles.after, 'none');
    assert.equal(styles.blurred, 0); assert.equal(styles.overflow, false);
    mkdirSync('.qa/mobile-fullscreen', { recursive: true });
    await page.screenshot({ path: `.qa/mobile-fullscreen/chat-${width}-${height}.png` });
  }
  await page.locator('.cw-message-more').first().tap();
  await page.getByRole('button', { name: 'Copy', exact: true }).tap();
  await page.getByText('Copied', { exact: true }).waitFor();
  await page.reload();
  await page.locator('#cwInput').waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(WORKSPACE_LOADED_JS);
  await api(`/api/cowork/conversations/${conversation.id}/widgets`, { title: 'Phone widget', kind: 'text', data: { text: 'A useful agent panel.' } });
  await page.route('**/api/cowork/agents/*/computer', route => route.fulfill({ json: { computer: { agentId: agent.id, state: 'stopped', control: 'agent', error: 'No computer configured in this fixture.' } } }));
  await page.locator('#cwWidgetToggle').waitFor({ state: 'visible' });
  let neutralCard: unknown, neutralDesktop: unknown;
  for (const color of ['#f39b52', '#3fd68f']) {
    if (color !== '#f39b52') {
      await api('/api/cowork/agents', { id: agent.id, avatar: { shape: 'dot-orange', color } });
      await page.reload();
      await page.locator('#cwInput').waitFor();
      await page.evaluate(WORKSPACE_LOADED_JS);
    }
    assert.equal(await page.locator('body').getAttribute('data-character-color'), color);
    const colors = await page.evaluate(() => {
      const expected = document.createElement('span'); expected.style.color = 'var(--cw-control-color)'; document.body.appendChild(expected);
      const accent = getComputedStyle(expected).color; expected.remove();
      return { accent, actual: ['cwWidgetToggle', 'cwComputerBtn', 'cwMediaBtn'].map(id => getComputedStyle(document.getElementById(id)!.querySelector('svg')!).color) };
    });
    for (const actual of colors.actual) assert.equal(actual, colors.accent);
    await page.locator('#cwWidgetToggle').tap();
    const card = page.locator('.cw-panel-card').first();
    await card.waitFor({ state: 'visible' });
    assert.equal(await card.locator('.cw-panel-card-icon svg').evaluate(icon => getComputedStyle(icon).color), colors.accent);
    const cardStyle = await card.evaluate(element => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, border: style.borderColor, radius: style.borderRadius, padding: style.padding, color: style.color };
    });
    if (neutralCard) assert.deepEqual(cardStyle, neutralCard, 'Agent changes must only recolor icons, not widgets.');
    else neutralCard = cardStyle;
    await page.screenshot({ path: `.qa/mobile-fullscreen/widgets-${color.slice(1)}.png` });
    await page.locator('#cwWidgetClose').tap();
    await page.locator('#cwPlus').tap();
    await page.locator('#cwPlusMenu').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#cwPlusMenu').evaluate(menu => getComputedStyle(menu).getPropertyValue('--cw-control-color').trim()), await page.locator('body').evaluate(body => getComputedStyle(body).getPropertyValue('--cw-control-color').trim()));
    await page.keyboard.press('Escape');
    await page.locator('#cwComputerBtn').tap();
    const desktop = page.locator('.cw-desktop-dialog');
    await desktop.waitFor({ state: 'visible' });
    assert.equal(await desktop.getAttribute('data-character-color'), color);
    const desktopStyle = await desktop.locator('.box').evaluate(box => {
      const style = getComputedStyle(box);
      return { background: style.backgroundColor, border: style.borderColor, radius: style.borderRadius };
    });
    if (neutralDesktop) assert.deepEqual(desktopStyle, neutralDesktop, 'Computer panels must retain their neutral appearance.');
    else neutralDesktop = desktopStyle;
    await desktop.locator('[data-close]').tap();
    await desktop.waitFor({ state: 'detached' });
  }
  await page.locator('#cwInfoBtn').tap();
  const profile = page.locator('.cw-profile-page');
  await profile.waitFor({ state: 'visible' }).catch(async error => {
    await page.screenshot({ path: '.qa/mobile-fullscreen/profile-timeout.png' });
    console.log(await page.locator('#cwInfoBtn').evaluate(button => {
      const rect = button.getBoundingClientRect();
      return { handler: String((button as HTMLButtonElement).onclick), hit: document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.outerHTML.slice(0, 400), dialogs: document.querySelectorAll('.cw-desktop-dialog').length, errors: (window as any).__bootErrors };
    }));
    throw error;
  });
  const scroll = await profile.evaluate(element => {
    element.scrollTop = 80;
    return { offset: element.scrollTop, scrollbar: getComputedStyle(element).scrollbarWidth };
  });
  assert(scroll.offset > 0, 'The profile must remain scrollable.');
  assert.equal(scroll.scrollbar, 'none');
  const tabs = await page.locator('.cw-profile-tabs').evaluate(element => {
    element.scrollLeft = 80;
    return { offset: element.scrollLeft, scrollbar: getComputedStyle(element).scrollbarWidth };
  });
  assert(tabs.offset > 0, 'Profile tabs must remain horizontally scrollable.');
  assert.equal(tabs.scrollbar, 'none');
  await page.screenshot({ path: '.qa/mobile-fullscreen/profile-no-scrollbars.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: LAN touch sends/replies and Copy; orange/mint widget, computer, gallery and popover colors; mobile profile and tabs scroll with no visible bars.');
} finally {
  await browser?.close();
  await server.stop();
  rmSync(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
