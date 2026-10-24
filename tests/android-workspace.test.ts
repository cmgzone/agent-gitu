import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { workspaceNavigation, workspaceServerUrl } from '../apps/mobile/src/gitu/server-address.js';
import { AppAuth } from '../src/server/app-auth.js';
import { privateNetworkRequest } from '../src/server/lan-login.js';
import { GituServer } from '../src/server/server.js';

const incoming = (host: string, peer: string) => ({ headers: { host }, socket: { remoteAddress: peer } }) as IncomingMessage;

describe('Android full workspace', () => {
  it('accepts private local addresses and requires HTTPS for remote workspaces', () => {
    expect(workspaceServerUrl(' http://192.168.1.8:8421/ ', 'local')).toBe('http://192.168.1.8:8421');
    expect(workspaceServerUrl('http://10.0.2.2:8421', 'local')).toBe('http://10.0.2.2:8421');
    expect(workspaceServerUrl('http://[fd12::2]:8421', 'local')).toBe('http://[fd12::2]:8421');
    expect(workspaceServerUrl('https://gitu.example.com', 'remote')).toBe('https://gitu.example.com');
    for (const address of ['http://gitu.example.com', 'http://203.0.113.1', 'https://user:password@gitu.example.com', 'https://gitu.example.com/?key=secret']) {
      expect(() => workspaceServerUrl(address, 'remote')).toThrow();
    }
    for (const address of ['http://172.32.1.2', 'http://192.168.1.2.evil.example', 'http://169.254.1.2']) expect(() => workspaceServerUrl(address, 'local')).toThrow();
  });

  it('keeps authentication and internal routes on the chosen origin', () => {
    const origin = 'https://gitu.example.com';
    expect(workspaceNavigation(origin + '/auth', origin)).toBe('workspace');
    expect(workspaceNavigation(origin + '/api/cowork/agents', origin)).toBe('workspace');
    expect(workspaceNavigation('https://docs.example.com', origin)).toBe('external');
    for (const url of ['http://gitu.example.com', 'file:///etc/passwd', 'javascript:alert(1)', 'intent://app', 'https://secret@gitu.example.com'])
      expect(workspaceNavigation(url, origin)).toBe('blocked');
    expect(workspaceNavigation('https://gitu.example.com.evil.example', origin)).toBe('external');
    for (const url of ['about:blank', 'about:srcdoc', 'blob:https://gitu.example.com/preview']) {
      expect(workspaceNavigation(url, origin)).toBe('blocked');
      expect(workspaceNavigation(url, origin, false)).toBe('workspace');
    }
    expect(workspaceNavigation('blob:https://evil.example/preview', origin, false)).toBe('blocked');
  });

  it('confines opt-in LAN login to private hosts and private peers without relaxing registration', () => {
    const ordinary = new AppAuth('nonexistent-android-auth.json');
    const lan = new AppAuth('nonexistent-android-auth.json', true, false, undefined, true);
    for (const [host, peer] of [
      ['192.168.1.8:8421', '192.168.1.10'],
      ['10.0.2.2:8421', '::ffff:10.0.2.15'],
      ['[fd12::2]:8421', 'fd12::3'],
    ]) {
      const req = incoming(host!, peer!);
      expect(privateNetworkRequest(req)).toBe(true);
      expect(ordinary.canLogin(req)).toBe(false);
      expect(lan.canLogin(req)).toBe(true);
      expect(lan.canRegister(req)).toBe(false);
      expect(lan.secure(req)).toBe(false);
    }
    for (const [host, peer] of [
      ['192.168.1.8:8421', '203.0.113.7'],
      ['public.example', '192.168.1.10'],
      ['172.32.1.2', '192.168.1.10'],
      ['[2001:db8::2]', 'fd12::3'],
      ['localhost:8421', '192.168.1.10'],
    ]) {
      const req = incoming(host!, peer!);
      req.headers['x-forwarded-proto'] = 'https';
      expect(lan.canLogin(req)).toBe(false);
    }
    ordinary.close();
    lan.close();
  });

  it('signs into the real UI over opt-in LAN HTTP and hosted HTTPS, then locks the session', async () => {
    const names = ['AGENT_GITU_HOME', 'AGENT_GITU_ALLOW_LAN_LOGIN', 'AGENT_GITU_TRUST_LOCAL_PROXY', 'AGENT_GITU_PUBLIC_ORIGIN'];
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    const home = mkdtempSync(path.join(tmpdir(), 'gitu-android-workspace-'));
    process.env.AGENT_GITU_HOME = home;
    process.env.AGENT_GITU_ALLOW_LAN_LOGIN = '1';
    process.env.AGENT_GITU_TRUST_LOCAL_PROXY = '1';
    process.env.AGENT_GITU_PUBLIC_ORIGIN = 'https://gitu.example.com';
    const server = new GituServer({ cwd: home, port: 0, accessKey: 'android-workspace-access-key-at-least-32', autoInstallLsp: false });
    try {
      const base = `http://127.0.0.1:${await server.start()}`;
      const password = 'Android workspace fixture password';
      const email = 'owner@example.com';
      const setup = await fetch(base + '/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Owner', email, password }),
      });
      expect(setup.status).toBe(201);
      const call = (route: string, host: string, body?: object, cookie?: string, secure = false, origin?: string) =>
        new Promise<{ status: number; body: string; cookie?: string }>((resolve, reject) => {
          const req = request(
            base + route,
            {
              method: body ? 'POST' : 'GET',
              headers: {
                host,
                ...(body ? { 'content-type': 'application/json' } : {}),
                ...(cookie ? { cookie } : {}),
                ...(secure ? { 'x-forwarded-proto': 'https' } : {}),
                ...(origin ? { origin } : {}),
              },
            },
            (res) => {
              let text = '';
              res.setEncoding('utf8');
              res.on('data', (chunk) => {
                text += chunk;
              });
              res.on('end', () => resolve({ status: res.statusCode!, body: text, cookie: res.headers['set-cookie']?.[0]?.split(';')[0] }));
            },
          );
          req.on('error', reject);
          req.end(body ? JSON.stringify(body) : undefined);
        });
      const localHost = '192.168.1.8:8421';
      expect((await call('/', localHost)).status).toBe(302);
      expect((await call('/auth', localHost)).body).toContain('Local HTTP login is enabled');
      expect((await call('/api/auth/login', localHost, { email, password }, undefined, false, 'http://evil.example')).status).toBe(403);
      expect((await call('/api/auth/login', '203.0.113.1', { email, password })).status).toBe(403);
      const login = await call('/api/auth/login', localHost, { email, password }, undefined, false, 'http://' + localHost);
      expect(login.status).toBe(200);
      expect(login.cookie).toMatch(/^gitu_session=/);
      expect((await call('/', localHost, undefined, login.cookie)).status).toBe(200);
      expect((await call('/api/project', localHost, undefined, login.cookie)).status).toBe(200);
      expect((await call('/api/auth/logout', localHost, {}, login.cookie)).status).toBe(200);
      expect((await call('/api/project', localHost, undefined, login.cookie)).status).toBe(401);
      const remote = await call('/api/auth/login', 'gitu.example.com', { email, password }, undefined, true, 'https://gitu.example.com');
      expect(remote.status).toBe(200);
      expect((await call('/', 'gitu.example.com', undefined, remote.cookie, true)).status).toBe(200);
    } finally {
      await server.stop();
      for (const name of names) {
        if (previous[name] === undefined) delete process.env[name];
        else process.env[name] = previous[name];
      }
      rmSync(home, { recursive: true, force: true });
    }
  }, 30_000);
});
