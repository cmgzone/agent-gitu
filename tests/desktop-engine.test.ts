import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createEngineControl, PROTOCOL } = require('../desktop/engine-control.cjs');
const { EngineConnection, connectEngine, controlRequest, enginePaths } = require('../desktop/engine-client.cjs');
const controls: { close(): Promise<void> }[] = [];
const connections: { disconnect(): void }[] = [];
const directories: string[] = [];

afterEach(async () => {
  for (const client of connections.splice(0)) client.disconnect();
  for (const control of controls.splice(0)) await control.close();
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function fixture(onStop = vi.fn(async () => {})) {
  const token = randomBytes(32).toString('hex');
  const state = { pid: process.pid, appRoot: path.resolve('.'), state: 'ready', port: 8321 };
  const control = await createEngineControl({ token, status: () => state, onStop });
  controls.push(control);
  const descriptor = { token, protocol: PROTOCOL, pid: process.pid, appRoot: state.appRoot, controlPort: control.port };
  const client = new EngineConnection(descriptor, state, {});
  connections.push(client);
  return { control, descriptor, client, state, onStop };
}

describe('independent desktop engine boundary', () => {
  it('allows Quit after the engine has already exited without waiting for an unreachable shutdown endpoint', async () => {
    const f = await fixture();
    const kill = vi.spyOn(process, 'kill').mockImplementationOnce(() => { throw Object.assign(new Error('already exited'), { code: 'ESRCH' }); });
    try {
      await f.client.stop();
      expect(f.client.closed).toBe(true);
      expect(f.onStop).not.toHaveBeenCalled();
    } finally { kill.mockRestore(); }
  });
  it('authenticates control requests and rejects browser-origin requests', async () => {
    const f = await fixture();
    expect(await controlRequest(f.descriptor)).toMatchObject({ state: 'ready', protocol: PROTOCOL, pid: process.pid });
    const url = `http://127.0.0.1:${f.control.port}/status`;
    expect((await fetch(url)).status).toBe(403);
    expect((await fetch(url, { headers: { authorization: 'Bearer wrong' } })).status).toBe(403);
    expect((await fetch(url, { headers: { authorization: 'Bearer ' + f.descriptor.token, origin: 'https://example.com' } })).status).toBe(403);
    await expect(controlRequest({ ...f.descriptor, token: 'wrong' }, 'shutdown')).rejects.toThrow('rejected');
    expect(f.onStop).not.toHaveBeenCalled();
    await controlRequest(f.descriptor, 'shutdown');
    await vi.waitFor(() => expect(f.onStop).toHaveBeenCalledOnce());
  });

  it('preserves browser actions, screenshots, errors and responsive viewport arguments across processes', async () => {
    const f = await fixture();
    let state = { available: true, url: '', title: '', loading: false, canBack: false, canForward: false };
    const navigate = vi.fn(async (url: string) => state = { ...state, url, title: 'Preview' });
    const viewport = vi.fn(async () => state);
    f.client.attachBrowser({ state: () => state, consoleErrors: () => ['warning'], navigate, setViewport: viewport, screenshot: async () => ({ pngBase64: 'image', state, textDigest: 'hello' }), evaluate: async () => { throw new Error('page failed'); } });
    await vi.waitFor(() => expect(f.control.browser.available()).toBe(true));
    expect(await f.control.browser.navigate('http://localhost:4000')).toMatchObject({ title: 'Preview' });
    expect(navigate).toHaveBeenCalledOnce();
    await f.control.browser.setViewport(390, 844);
    expect(viewport).toHaveBeenCalledWith(390, 844);
    expect(await f.control.browser.screenshot()).toMatchObject({ pngBase64: 'image', textDigest: 'hello' });
    expect(f.control.browser.consoleErrors()).toEqual(['warning']);
    await expect(f.control.browser.evaluate('anything')).rejects.toThrow('page failed');
  });

  it('rejects an interrupted browser action, retains engine health, and reconnects without replaying it', async () => {
    const f = await fixture();
    let release!: () => void;
    const state = () => ({ available: true, url: '', title: '', loading: false });
    const click = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    f.client.attachBrowser({ state, click });
    await vi.waitFor(() => expect(f.control.browser.available()).toBe(true));
    const interrupted = expect(f.control.browser.click(2, 3)).rejects.toThrow('not replayed');
    await vi.waitFor(() => expect(click).toHaveBeenCalledOnce());
    f.client.disconnect();
    await interrupted;
    expect(await controlRequest(f.descriptor)).toMatchObject({ state: 'ready', pid: process.pid });
    const replacement = new EngineConnection(f.descriptor, f.state, {});
    connections.push(replacement);
    replacement.attachBrowser({ state, click });
    await vi.waitFor(() => expect(f.control.browser.available()).toBe(true));
    release();
    expect(click).toHaveBeenCalledOnce();
  });

  it('reattaches to an existing engine rather than starting a duplicate or resetting its state', async () => {
    const f = await fixture();
    const home = mkdtempSync(path.join(tmpdir(), 'gitu-engine-client-'));
    directories.push(home);
    const env = { ...process.env, AGENT_GITU_HOME: home };
    const paths = enginePaths(env);
    directories.push(paths.dir);
    mkdirSync(paths.dir, { recursive: true, mode: 0o700 });
    writeFileSync(paths.descriptor, JSON.stringify(f.descriptor));
    // A nonexistent executable makes any accidental relaunch fail this test.
    const attached = await connectEngine({ appRoot: f.state.appRoot, env, executablePath: 'must-not-be-launched' });
    connections.push(attached);
    expect(attached.pid).toBe(process.pid);
    expect(attached.port).toBe(8321);
    expect(f.onStop).not.toHaveBeenCalled();
    await expect(connectEngine({ appRoot: path.join(f.state.appRoot, 'another-build'), env })).rejects.toThrow('Another Agent Gitu build');
  });
});
