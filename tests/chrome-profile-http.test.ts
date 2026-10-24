import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import WebSocket from 'ws';
import { afterEach, expect, it, vi } from 'vitest';
import { ChromeProfileSession } from '../src/browser/chrome-profile.js';
import { GituServer } from '../src/server/server.js';
import type { ComputerStatus } from '../src/cowork/computer.js';

afterEach(() => vi.unstubAllEnvs());
it('protects owner Chrome HTTP/streams, supports hosted transport, and revokes the stream on logout', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'gitu-chrome-http-'));
  vi.stubEnv('AGENT_GITU_HOME', home);
  let state: ComputerStatus['state'] = 'stopped';
  const stream = new PassThrough();
  const computer = {
    name: 'gitu-cowork-' + 'd'.repeat(24),
    status: () => ({ agentId: 'private-owner', name: 'private', state, control: 'user' as const, workspace: '/workspace' }),
    setControl: vi.fn(),
    start: vi.fn(async () => {
      state = 'running';
    }),
    stop: vi.fn(async () => {
      state = 'stopped';
    }),
    refreshStatus: vi.fn(async () => computer.status()),
    desktopInput: vi.fn(async () => ({ ok: true, output: 'Opened.' })),
  };
  const target = { id: 'hosted', label: 'Hosted server', execute: vi.fn(), stream: vi.fn(async () => stream) };
  const profile = new ChromeProfileSession(
    path.join(home, 'profile'),
    'owner',
    () => [{ id: 'hosted', label: 'Hosted server' }],
    () => target,
    () => computer,
  );
  const server = new GituServer({ cwd: home, port: 0, autoInstallLsp: false, chromeProfile: profile });
  let socket: WebSocket | undefined;
  try {
    const base = 'http://127.0.0.1:' + (await server.start()),
      ws = base.replace('http:', 'ws:');
    const post = (route: string, body: object, cookie = '', origin = base) =>
      fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
    const rejection = (headers: Record<string, string>) =>
      new Promise<number>((resolve, reject) => {
        const client = new WebSocket(ws + '/api/chrome-profile/vnc', { headers });
        client.once('unexpected-response', (_, response) => {
          response.resume();
          resolve(response.statusCode!);
        });
        client.once('error', () => {});
        client.once('open', () => {
          client.terminate();
          reject(Error('Unexpected authorized stream.'));
        });
      });
    for (const route of ['/api/chrome-profile', '/api/chrome-profile/view', '/api/chrome-profile/screen']) expect((await fetch(base + route)).status).toBe(401);
    expect(await rejection({ origin: base })).toBe(401);
    expect(computer.start).not.toHaveBeenCalled();
    const account = { name: 'Owner', email: 'owner@example.com', password: 'Disposable private Chrome fixture passphrase' };
    expect((await post('/api/auth/register', account)).status).toBe(201);
    const login = await post('/api/auth/login', account),
      cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    expect(await rejection({ origin: base, cookie })).toBe(409);
    expect(await rejection({ origin: 'https://attacker.example', cookie })).toBe(403);
    expect(await rejection({ cookie })).toBe(403);
    const snapshot = await (await fetch(base + '/api/chrome-profile', { headers: { cookie } })).json();
    expect(snapshot).toMatchObject({ state: 'stopped', locations: [{ id: 'hosted', label: 'Hosted server' }] });
    expect(computer.start).not.toHaveBeenCalled();
    expect((await post('/api/chrome-profile', { action: 'start', locationId: 'hosted' }, cookie, 'https://attacker.example')).status).toBe(403);
    expect((await post('/api/chrome-profile', { action: 'start', locationId: 'attacker' }, cookie)).status).toBe(400);
    expect((await post('/api/chrome-profile', { action: 'start', locationId: 'hosted' }, cookie)).status).toBe(202);
    await vi.waitFor(() => expect(profile.snapshot().state).toBe('running'));
    const view = await fetch(base + '/api/chrome-profile/view', { headers: { cookie } });
    expect(view.status).toBe(200);
    expect(view.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
    expect(await view.text()).toContain('Your own Chrome');
    expect((await fetch(base + '/api/chrome-profile/view?returnTo=https://attacker.example', { headers: { cookie } })).status).toBe(400);
    const screen = await fetch(base + '/api/chrome-profile/screen', { headers: { cookie } });
    expect(await screen.text()).toContain('/api/chrome-profile/vnc');
    socket = new WebSocket(ws + '/api/chrome-profile/vnc', { headers: { origin: base, cookie } });
    await new Promise<void>((resolve, reject) => {
      socket!.once('open', resolve);
      socket!.once('error', reject);
    });
    const echoed = new Promise<Buffer>((resolve) => socket!.once('message', (data) => resolve(Buffer.from(data as Buffer))));
    socket.send(Buffer.from('fixture-owner-input'));
    expect((await echoed).toString()).toBe('fixture-owner-input');
    expect(target.stream).toHaveBeenCalledWith(computer.name, expect.any(AbortSignal));
    expect((await post('/api/chrome-profile', { action: 'input', input: { action: 'type', text: 'private' } }, cookie)).status).toBe(202);
    expect(computer.desktopInput).toHaveBeenLastCalledWith({ action: 'type', text: 'private' });
    const closed = new Promise<void>((resolve) => socket!.once('close', () => resolve()));
    expect((await post('/api/auth/logout', {}, cookie)).status).toBe(200);
    await closed;
    expect((await fetch(base + '/api/chrome-profile/screen', { headers: { cookie } })).status).toBe(401);
  } finally {
    socket?.terminate();
    await server.stop();
    stream.destroy();
    rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}, 60000);
