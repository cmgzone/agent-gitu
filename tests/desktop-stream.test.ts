import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { PassThrough } from 'node:stream';
import WebSocket from 'ws';
import { describe, expect, it, vi } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { CoworkComputer, type ComputerExec } from '../src/cowork/computer.js';
import { createComputerBrokerServer } from '../src/cowork/computer-broker.js';
import { localDesktopStream } from '../src/cowork/desktop-stream.js';
import { desktopAsset } from '../src/server/desktop-view.js';

vi.mock('../src/cowork/desktop-stream.js', async (original) => ({
  ...await original<object>(),
  localDesktopStream: vi.fn(() => { const stream = new PassThrough(); stream.write(Buffer.from('RFB 003.008\n')); return stream; }),
}));

function rejected(url: string, headers: Record<string, string> = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const client = new WebSocket(url, { headers, handshakeTimeout: 5000 });
    client.on('error', () => {});
    client.once('unexpected-response', (_, response) => { response.resume(); client.terminate(); resolve(response.statusCode!); });
    client.once('open', () => { client.terminate(); reject(new Error('Unauthorized stream was accepted.')); });
  });
}

describe('shared live desktop connection', () => {
  it('authenticates both gateways, isolates owned desktops, forwards binary input, and revokes live sockets on lock', async () => {
    const home = mkdtempSync(path.join(tmpdir(), 'gitu-stream-test-'));
    const owner = 'disposable-stream-workspace';
    const key = 'disposable-stream-broker-key-for-tests';
    const exec = vi.fn<ComputerExec>(async (args) => args.at(-1)?.includes('b'.repeat(24)) ? 'another-owner' : owner);
    const broker = createComputerBrokerServer(key, owner, exec);
    await new Promise<void>((resolve) => broker.listen(0, '127.0.0.1', resolve));
    const privateBase = `http://127.0.0.1:${(broker.address() as { port: number }).port}`;
    vi.stubEnv('AGENT_GITU_HOME', home);
    vi.stubEnv('AGENT_GITU_COMPUTER_BROKER_URL', privateBase);
    vi.stubEnv('AGENT_GITU_COMPUTER_BROKER_KEY', key);
    let running = true;
    vi.spyOn(CoworkComputer.prototype, 'status').mockImplementation(function (this: CoworkComputer) { return { agentId: this.agentId, name: this.name, state: running ? 'running' : 'stopped', workspace: '/workspace' }; });
    vi.spyOn(CoworkComputer.prototype, 'stop').mockResolvedValue();
    const server = new GituServer({ cwd: home, port: 0 });
    let client: WebSocket | undefined;
    try {
      const base = `http://127.0.0.1:${await server.start()}`;
      const wsBase = base.replace('http:', 'ws:');
      const route = '/api/cowork/agents/missing/computer/vnc';
      expect(await rejected(wsBase + route, { origin: base })).toBe(401);
      expect(await rejected(privateBase.replace('http:', 'ws:') + '/desktop/gitu-cowork-' + 'a'.repeat(24))).toBe(401);
      expect(exec).not.toHaveBeenCalled();
      expect(await rejected(privateBase.replace('http:', 'ws:') + '/desktop/gitu-cowork-' + 'b'.repeat(24), { authorization: 'Bearer ' + key })).toBe(403);
      expect(localDesktopStream).not.toHaveBeenCalled();
      const password = 'Disposable shared desktop fixture passphrase';
      const post = (route: string, body: unknown, cookie = '') => fetch(base + route, { method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      expect((await post('/api/auth/register', { name: 'Fixture', email: 'fixture@example.com', password })).status).toBe(201);
      const login = await post('/api/auth/login', { email: 'fixture@example.com', password });
      const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
      const agent = (await (await post('/api/cowork/agents', { name: 'Shared', systemPrompt: 'Fixture', useHostComputer: false }, cookie)).json()).agent;
      const host = (await (await post('/api/cowork/agents', { name: 'Host', systemPrompt: 'Fixture', useHostComputer: true }, cookie)).json()).agent;
      const url = wsBase + `/api/cowork/agents/${agent.id}/computer/vnc`;
      expect(await rejected(url, { cookie })).toBe(403);
      expect(await rejected(url, { cookie, origin: 'http://evil.example' })).toBe(403);
      expect(await rejected(wsBase + route, { cookie, origin: base })).toBe(404);
      expect(await rejected(wsBase + `/api/cowork/agents/${host.id}/computer/vnc`, { cookie, origin: base })).toBe(409);
      running = false;
      expect(await rejected(url, { cookie, origin: base })).toBe(409);
      running = true;
      expect((await fetch(base + `/api/cowork/agents/${agent.id}/computer/view`, { headers: { cookie } })).status).toBe(200);
      expect((await fetch(base + '/api/desktop-assets/core/rfb.js')).status).toBe(401);
      expect((await fetch(base + '/api/desktop-assets/core/rfb.js', { headers: { cookie } })).status).toBe(200);
      client = new WebSocket(url, { headers: { cookie, origin: base } });
      const greeting = await once(client, 'message');
      expect(greeting[0].toString()).toBe('RFB 003.008\n');
      const reply = once(client, 'message');
      client.send(Buffer.from([5, 1, 0, 10, 0, 20]));
      expect((await reply)[0]).toEqual(Buffer.from([5, 1, 0, 10, 0, 20]));
      expect(localDesktopStream).toHaveBeenLastCalledWith(expect.stringMatching(/^gitu-cowork-[a-f0-9]{24}$/));
      const closed = once(client, 'close');
      expect((await post('/api/auth/logout', {}, cookie)).status).toBe(200);
      await closed;
      expect(await rejected(url, { cookie, origin: base })).toBe(401);
    } finally {
      client?.terminate(); await server.stop();
      await new Promise<void>((resolve) => broker.close(() => resolve()));
      vi.restoreAllMocks(); vi.unstubAllEnvs(); rmSync(home, { recursive: true, force: true });
    }
  }, 30000);

  it('serves only noVNC JavaScript modules, never package files or traversal paths', () => {
    expect(desktopAsset('core/rfb.js')).toMatch(/core[\\/]rfb\.js$/);
    for (const relative of ['package.json', 'core/../../package.json', 'core/../server.js', '/core/rfb.js', 'vendor/file.txt']) expect(desktopAsset(relative)).toBeUndefined();
  });
});
