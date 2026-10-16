// Builds must be current. This test only touches a fresh temporary app profile.
import { _electron } from 'playwright';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const { enginePaths, readDescriptor, controlRequest, alive } = require('../desktop/engine-client.cjs');
const appRoot = path.resolve('.');
const root = mkdtempSync(path.join(tmpdir(), 'gitu-engine-smoke-'));
const profile = path.join(root, 'Profile');
const data = path.join(root, 'OwnerData');
const workspace = path.join(data, 'Workspace');
for (const dir of [profile, workspace, path.join(profile, 'AppData', 'Roaming'), path.join(profile, 'AppData', 'Local'), path.join(root, 'Temp'), path.join(root, 'Codex')]) mkdirSync(dir, { recursive: true });
writeFileSync(path.join(workspace, 'package.json'), JSON.stringify({ name: 'engine-isolation-fixture', private: true }));
const env = {
  ...process.env, AGENT_GITU_HOME: data, HERMES_HOME_DIR: data, HERMES_CWD: workspace, HERMES_UI_PORT: '0',
  USERPROFILE: profile, HOME: profile, APPDATA: path.join(profile, 'AppData', 'Roaming'), LOCALAPPDATA: path.join(profile, 'AppData', 'Local'),
  TEMP: path.join(root, 'Temp'), TMP: path.join(root, 'Temp'), CODEX_HOME: path.join(root, 'Codex'),
};
delete env.ELECTRON_RUN_AS_NODE;
const paths = enginePaths(env);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const check = (condition, message) => { if (!condition) throw new Error(message); };
async function until(work, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const result = await work(); if (result) return result; await delay(200); }
  throw new Error('Timed out waiting for an isolated engine transition.');
}
const fixture = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end('<!doctype html><title>Engine browser fixture</title><button id="increment" onclick="document.querySelector(\'#count\').textContent=\'1\'">Increment</button><p id="count">0</p><input id="entry">');
});
await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
let electron;
let descriptor;
const results = { root, checks: [] };
const passed = name => { results.checks.push(name); console.log('PASS', name); };
const launch = () => _electron.launch({ executablePath: require('electron'), args: [path.join(appRoot, 'desktop', 'main.cjs')], cwd: appRoot, env, timeout: 90_000 });
async function ready(app) {
  return until(async () => {
    const urls = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(win => !win.webContents.isLoading()).map(win => win.webContents.getURL()));
    return urls.find(url => /^http:\/\/127\.0\.0\.1:\d+\//.test(url));
  }, 240_000);
}
try {
  console.log('Isolated profile:', root);
  electron = await launch();
  const origin = new URL(await ready(electron)).origin;
  descriptor = readDescriptor(paths);
  check(descriptor && descriptor.pid !== electron.process().pid, 'The engine is not independent from Electron.');
  const firstPid = descriptor.pid;
  const uiPid = await electron.evaluate(() => process.pid);
  console.log('Process IDs:', JSON.stringify({ ui: uiPid, launcher: electron.process().pid, engine: firstPid }));
  check((await controlRequest(descriptor)).state === 'ready', 'Engine health is unavailable.');
  passed('Electron and engine have different process IDs');
  const duplicate = spawn(require('electron'), [path.join(appRoot, 'desktop', 'engine-host.cjs')], { cwd: appRoot, env: { ...env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, stdio: 'ignore' });
  check(await new Promise((resolve, reject) => { duplicate.once('error', reject); duplicate.once('exit', resolve); }) === 0, 'Duplicate engine ownership was not rejected cleanly.');
  check(readDescriptor(paths).pid === firstPid, 'A duplicate launch replaced the engine owner.');
  passed('Atomic ownership prevents a second engine from opening the same workspace');
  const password = randomBytes(24).toString('hex');
  let cookie;
  const request = async (route, body) => {
    const response = await fetch(origin + route, { method: body ? 'POST' : 'GET', headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30_000) });
    if (route === '/api/auth/login') cookie = response.headers.get('set-cookie')?.split(';')[0];
    const value = await response.json();
    check(response.ok, `${route}: ${response.status} ${value.error || ''}`);
    return value;
  };
  await request('/api/auth/register', { password, name: 'Smoke Test', email: 'smoke@example.com' });
  await request('/api/auth/login', { password, email: 'smoke@example.com' });
  await until(async () => (await request('/api/browser')).has);
  await request('/api/browser/navigate', { url: `http://127.0.0.1:${fixture.address().port}/` });
  await request('/api/browser/click', { selector: '#increment' });
  await request('/api/browser/fill', { selector: '#entry', text: 'Engine boundary' });
  const screenshot = await request('/api/browser/screenshot');
  check(screenshot.pngBase64?.length > 100 && screenshot.state.title === 'Engine browser fixture', 'The browser proxy lost its screenshot or state.');
  check(screenshot.textDigest.includes('1'), 'The browser click did not reach the page.');
  passed('Authenticated UI API forwards browser actions and screenshots across the engine boundary');
  await electron.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(win => /^http:\/\/127\.0\.0\.1:/.test(win.webContents.getURL())).close());
  check((await controlRequest(descriptor)).pid === firstPid, 'Closing a window stopped the engine.');
  await electron.evaluate(({ app }) => { app.emit('second-instance', {}, [], '', {}); });
  passed('Window close/reopen keeps the same engine');
  const uiProcess = electron.process();
  const exited = new Promise(resolve => uiProcess.once('exit', resolve));
  process.kill(uiPid, 'SIGKILL');
  await exited;
  electron = undefined;
  check((await controlRequest(descriptor)).pid === firstPid && alive(firstPid), 'An Electron crash stopped the detached engine.');
  passed('Engine remains healthy after the Electron UI process is killed');
  electron = await launch();
  check(new URL(await ready(electron)).origin === origin, 'Reopening Electron started a different server.');
  check(readDescriptor(paths).pid === firstPid, 'Reopening Electron duplicated the engine.');
  await until(async () => (await request('/api/browser')).has);
  passed('A new Electron process reconnects to the existing engine and browser bridge');
  // A separate engine crash must leave the UI alive and expose an explicit Retry.
  process.kill(firstPid, 'SIGKILL');
  console.log('Waiting for engine-crash recovery UI');
  await until(async () => {
    const startup = electron.windows().find(page => page.url().endsWith('/desktop/startup.html'));
    if (!startup || startup.isClosed()) return false;
    try { return await startup.locator('#startupRetry').isVisible() && startup; } catch { return false; }
  });
  const startup = electron.windows().find(page => page.url().endsWith('/desktop/startup.html'));
  console.log('Retrying the engine');
  await startup.locator('#startupRetry').click();
  await until(async () => {
    const current = readDescriptor(paths);
    if (!current || current.pid === firstPid) return false;
    try { return (await controlRequest(current)).state === 'ready'; } catch { return false; }
  }, 240_000);
  await ready(electron);
  descriptor = readDescriptor(paths);
  passed('An engine crash preserves the UI and explicit Retry starts a fresh engine');
  const lastPid = descriptor.pid;
  await electron.close(); electron = undefined;
  await until(async () => !alive(lastPid));
  passed('Explicit application Quit drains and stops the engine');
  results.success = true;
} catch (error) {
  console.error('SMOKE FAILURE:', error.stack);
  throw error;
} finally {
  if (electron) await electron.close().catch(() => {});
  descriptor = readDescriptor(paths) || descriptor;
  if (descriptor && alive(descriptor.pid)) {
    await controlRequest(descriptor, 'shutdown').catch(() => {});
    await until(async () => !alive(descriptor.pid)).catch(() => {});
  }
  await new Promise(resolve => { fixture.close(resolve); fixture.closeAllConnections(); });
  mkdirSync('.qa', { recursive: true });
  writeFileSync('.qa/desktop-engine-smoke-result.json', JSON.stringify(results, null, 2));
  if (!results.success) { try { console.error(readFileSync(paths.log, 'utf8').slice(-6000)); } catch {} }
}
