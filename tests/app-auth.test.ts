import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { request as httpRequest } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppAuth } from '../src/server/app-auth.js';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { loadStoredKeys } from '../src/llm/keys.js';
import { GituApi } from '../apps/mobile/src/gitu/client.js';
import type { ComposioConnections } from '../src/connections/composio.js';

const password = 'A disposable fixture passphrase!';
const profile = { name: 'Fixture Owner', email: 'owner@example.com' };
const servers: GituServer[] = [];
afterEach(async () => {
  vi.useRealTimers();
  for (const server of servers.splice(0)) await server.stop();
});
function request(cookie = '', host = 'localhost:8321', remoteAddress = '127.0.0.1'): IncomingMessage {
  return { headers: { host, cookie }, socket: { remoteAddress } } as IncomingMessage;
}

describe('whole-app authentication', () => {
  it('protects all app routes, bootstraps locally, persists only a hash, and revokes access on lock', async () => {
    const previous = process.env['AGENT_GITU_HOME'];
    const home = mkdtempSync(path.join(tmpdir(), 'gitu-auth-http-'));
    process.env['AGENT_GITU_HOME'] = home;
    try {
      const key = 'auth-fixture-native-access-key-secret';
      const server = new GituServer({ cwd: home, port: 0, accessKey: key, llm: new ScriptedMockLlm([]) });
      servers.push(server);
      const base = `http://127.0.0.1:${await server.start()}`;
      const post = (route: string, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
        fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ ...profile, ...body }) });
      // Fetch rewrites Host to match the URL. Use the HTTP transport to test
      // the actual remote/proxy Host header that the server must reject.
      const remotePost = (route: string, headers: Record<string, string> = {}) =>
        new Promise<number>((resolve, reject) => {
          const req = httpRequest(base + route, { method: 'POST', headers: { host: '192.0.2.1', 'content-type': 'application/json', ...headers } }, (response) => {
            response.resume();
            resolve(response.statusCode!);
          });
          req.on('error', reject);
          req.end(JSON.stringify({ ...profile, password }));
        });
      for (const route of ['/', '/mobile', '/assets/agent-gitu-icon.png']) {
        const response = await fetch(base + route, { redirect: 'manual' });
        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe('/auth');
      }
      for (const route of ['/api/cowork/agents', '/api/connected-apps', '/api/cowork/artifacts/secret/preview', '/api/cowork/artifacts/secret/download', '/api/mobile/status']) {
        const response = await fetch(base + route, { headers: { authorization: `Bearer ${key}` } });
        expect(response.status).toBe(401);
        expect((await response.json()).code).toBe('APP_LOCKED');
      }
      const page = await fetch(base + '/auth');
      expect(await page.text()).toContain('Continue with Pikpam');
      expect(page.headers.get('cache-control')).toBe('no-store');
      expect(page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
      expect(await remotePost('/api/auth/setup')).toBe(403);
      expect((await post('/api/auth/setup', { password }, { origin: 'http://evil.example' })).status).toBe(403);
      expect((await post('/api/auth/setup', { password }, { origin: base.replace('http:', 'https:') })).status).toBe(403);
      expect((await post('/api/auth/setup', { password: 'short' })).status).toBe(400);
      expect((await post('/api/auth/register', { password, email: 'invalid' })).status).toBe(400);
      const setup = await post('/api/auth/register', { password }, { origin: base });
      expect(setup.status).toBe(201);
      expect(setup.headers.get('set-cookie')).toBeNull();
      expect((await fetch(base + '/api/cowork/agents')).status).toBe(401);
      const registrationStatus = await (await fetch(base + '/api/auth/status')).json();
      expect(registrationStatus.requiresEmail).toBe(true);
      expect(registrationStatus.account).toBeUndefined();
      const firstLogin = await post('/api/auth/login', { password, email: 'OWNER@EXAMPLE.COM' });
      expect(firstLogin.status).toBe(200);
      const cookie = firstLogin.headers.get('set-cookie')!;
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Strict');
      const stored = readFileSync(path.join(home, 'Settings', 'app-password.json'), 'utf8');
      expect(stored).not.toContain(password);
      expect(JSON.parse(stored).hash).toHaveLength(64);
      expect(JSON.parse(stored).email).toBe(profile.email);
      const status = await (await fetch(base + '/api/auth/status', { headers: { cookie } })).json();
      expect(status.account.name).toBe(profile.name);
      expect(status.account.hash).toBeUndefined();
      const native = new GituApi(base, key, password, profile.email);
      await native.connect();
      expect((await native.teams()).agents).toBeInstanceOf(Array);
      await native.disconnect();
      await expect(native.teams()).rejects.toThrow('session is locked');
      expect((await post('/api/auth/setup', { password: password + 'replace' })).status).toBe(409);
      expect((await fetch(base + '/', { headers: { cookie } })).status).toBe(200);
      expect((await fetch(base + '/api/connected-apps', { headers: { cookie } })).status).toBe(200);
      expect((await fetch(base + '/api/auth/status', { headers: { cookie } })).headers.get('cache-control')).toBe('no-store');
      expect((await post('/api/auth/login', { password: 'wrong' })).status).toBe(401);
      expect((await post('/api/auth/login', { password, email: 'other@example.com' })).status).toBe(401);
      expect(await remotePost('/api/auth/login', { 'x-forwarded-proto': 'https' })).toBe(403);
      const login = await post('/api/auth/login', { password }, { cookie });
      expect(login.status).toBe(200);
      const replacement = login.headers.get('set-cookie')!;
      expect(replacement).not.toBe(cookie);
      expect((await fetch(base + '/api/cowork/agents', { headers: { cookie } })).status).toBe(401);
      expect((await post('/api/auth/logout', {}, { cookie: replacement })).status).toBe(200);
      expect((await fetch(base + '/api/cowork/agents', { headers: { cookie: replacement } })).status).toBe(401);
      for (let attempt = 0; attempt < 5; attempt++) expect((await post('/api/auth/login', { password: null })).status).toBe(401);
      const limited = await post('/api/auth/login', { password });
      expect(limited.status).toBe(429);
      expect(limited.headers.get('retry-after')).toBe('900');
      const restored = new AppAuth(path.join(home, 'Settings', 'app-password.json'));
      expect(await restored.login(request(), password, profile.email)).toBe('ok');
      expect(restored.authenticated(request(replacement))).toBe(false);
      restored.close();
    } finally {
      if (previous === undefined) delete process.env['AGENT_GITU_HOME'];
      else process.env['AGENT_GITU_HOME'] = previous;
    }
  }, 60000);

  it('permits hosted first-owner registration only with its private code over trusted HTTPS', async () => {
    const names = ['AGENT_GITU_HOME', 'AGENT_GITU_PUBLIC_ORIGIN', 'AGENT_GITU_TRUST_LOCAL_PROXY', 'AGENT_GITU_REGISTRATION_TOKEN'];
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    const home = mkdtempSync(path.join(tmpdir(), 'gitu-auth-hosted-'));
    const origin = 'https://gitu.example.com';
    const code = 'disposable-private-registration-code-123456789';
    process.env['AGENT_GITU_HOME'] = home;
    process.env['AGENT_GITU_PUBLIC_ORIGIN'] = origin;
    process.env['AGENT_GITU_TRUST_LOCAL_PROXY'] = '1';
    process.env['AGENT_GITU_REGISTRATION_TOKEN'] = code;
    const configure = vi.fn(async () => {});
    const connectedApps = { configured: false, setup: { canConfigure: true, keyStorage: 'server-encrypted' }, configure } as unknown as ComposioConnections;
    const server = new GituServer({ cwd: home, port: 0, llm: new ScriptedMockLlm([]), connectedApps });
    servers.push(server);
    try {
      const base = 'http://127.0.0.1:' + (await server.start());
      const call = (route: string, body?: Record<string, unknown>, headers: Record<string, string> = {}) =>
        new Promise<{ status: number; headers: IncomingMessage['headers']; text: string }>((resolve, reject) => {
          const req = httpRequest(
            base + route,
            { method: body ? 'POST' : 'GET', headers: { host: 'gitu.example.com', origin, 'x-forwarded-proto': 'https', 'content-type': 'application/json', ...headers } },
            (res) => {
              let text = '';
              res.setEncoding('utf8');
              res.on('data', (chunk: string) => {
                text += chunk;
              });
              res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, text }));
            },
          );
          req.on('error', reject);
          req.end(body ? JSON.stringify(body) : undefined);
        });
      const page = await call('/auth');
      expect(page.text).toContain('Continue with Pikpam');
      expect(page.text).not.toContain(code);
      const registration = { ...profile, password, registrationToken: code };
      expect((await call('/api/auth/register', { ...registration, registrationToken: '' })).status).toBe(403);
      expect((await call('/api/auth/register', { ...registration, registrationToken: code + 'wrong' })).status).toBe(403);
      expect((await call('/api/auth/register', registration, { 'x-forwarded-proto': 'http', origin: origin.replace('https:', 'http:') })).status).toBe(403);
      expect((await call('/api/auth/register', registration, { origin: 'https://evil.example' })).status).toBe(403);
      expect((await call('/api/auth/register', registration)).status).toBe(201);
      const stored = readFileSync(path.join(home, 'Settings', 'app-password.json'), 'utf8');
      expect(stored).not.toContain(code);
      expect(stored).not.toContain(password);
      expect((await call('/api/auth/register', registration)).status).toBe(409);
      expect((await call('/auth')).text).not.toContain('name="registrationToken"');
      const login = await call('/api/auth/login', { email: profile.email, password });
      expect(login.status).toBe(200);
      expect(login.headers['set-cookie']![0]).toContain('; Secure');
      expect((await call('/api/cowork/agents')).status).toBe(401);
      const cookie = login.headers['set-cookie']![0]!;
      expect((await call('/api/cowork/agents', undefined, { cookie })).status).toBe(200);
      const inputBody = { action: 'input', input: { action: 'type', text: 'test' } };
      expect((await call('/api/cowork/agents/fixture/computer', inputBody)).status).toBe(401);
      expect((await call('/api/cowork/agents/fixture/computer', inputBody, { cookie, origin: 'https://evil.example' })).status).toBe(403);
      expect((await call('/api/connected-apps/configure', { apiKey: 'fixture-integration-key' })).status).toBe(401);
      expect((await call('/api/connected-apps/configure', { apiKey: 'fixture-integration-key' }, { cookie })).status).toBe(200);
      expect(configure).toHaveBeenCalledExactlyOnceWith('fixture-integration-key');
      expect((await call('/api/connected-apps/configure', { apiKey: 'secret' }, { cookie, origin: 'https://evil.example' })).status).toBe(403);
      expect((await call('/api/connected-apps/configure', { apiKey: 'secret' }, { cookie, 'x-forwarded-proto': 'http', origin: origin.replace('https:', 'http:') })).status).toBe(
        403,
      );
      expect(configure).toHaveBeenCalledOnce();
      const auth = new AppAuth(path.join(home, 'Settings', 'app-password.json'), true, true, code);
      expect(auth.remoteRegistrationEnabled).toBe(false);
      expect(auth.canRegister(request('', 'gitu.example.com'), code)).toBe(false);
      const weak = new AppAuth(path.join(home, 'weak.json'), true, true, 'short');
      expect(weak.remoteRegistrationEnabled).toBe(false);
    } finally {
      await server.stop();
      servers.splice(servers.indexOf(server), 1);
      for (const name of names) {
        if (previous[name] === undefined) delete process.env[name];
        else process.env[name] = previous[name];
      }
    }
  }, 60000);

  it('keeps sessions through time and server restarts until the user logs out', async () => {
    const authFile = path.join(mkdtempSync(path.join(tmpdir(), 'gitu-auth-')), 'password.json');
    const auth = new AppAuth(authFile);
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    const headers: Record<string, string> = {};
    const response = {
      getHeader: (key: string) => headers[key],
      setHeader: (key: string, value: string) => {
        headers[key] = value;
      },
    } as unknown as ServerResponse;
    auth.issue(request(), response);
    const req = request(headers['Set-Cookie']);
    const stream = { once: vi.fn(), destroy: vi.fn() } as unknown as ServerResponse;
    auth.track(req, stream);
    expect(auth.authenticated(req)).toBe(true);
    vi.advanceTimersByTime(8 * 60 * 60 * 1000);
    expect(auth.authenticated(req)).toBe(true);
    expect(stream.destroy).not.toHaveBeenCalled();
    auth.close();
    expect(stream.destroy).toHaveBeenCalledOnce();
    const restarted = new AppAuth(authFile);
    expect(restarted.authenticated(req)).toBe(true);
    delete headers['Set-Cookie']; // The next HTTP response has its own headers.
    const locked = request(req.headers.cookie ?? '');
    const other = { once: vi.fn(), destroy: vi.fn() } as unknown as ServerResponse;
    restarted.track(locked, other);
    restarted.logout(locked, response);
    expect(restarted.authenticated(locked)).toBe(false);
    expect(other.destroy).toHaveBeenCalledOnce();
    restarted.close();
  });

  it('fails closed on damaged password files and never permits setup through a proxy host', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'gitu-auth-damaged-')), 'password.json');
    writeFileSync(file, JSON.stringify({ version: 1, hash: 'invalid' }));
    expect(() => new AppAuth(file, false)).toThrow();
    expect(AppAuth.local(request('', 'localhost:8321', '192.0.2.1'))).toBe(false);
    expect(AppAuth.local(request('', 'public.example'))).toBe(false);
    const auth = new AppAuth(path.join(path.dirname(file), 'unused.json'), true, true);
    const forwarded = request('', '192.0.2.1');
    forwarded.headers['x-forwarded-proto'] = 'https';
    expect(auth.secure(forwarded)).toBe(true);
    const external = request('', '192.0.2.1', '192.0.2.2');
    external.headers['x-forwarded-proto'] = 'https';
    expect(auth.secure(external)).toBe(false);
  });

  it('pikrouterLogin: enforces workspace owner — rejects a different Pikpam account after first login', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gitu-auth-pikowner-'));
    const file = path.join(dir, 'password.json');
    const auth = new AppAuth(file, false);

    // First login: registers owner@example.com as the workspace owner.
    expect(auth.configured).toBe(false);
    auth.pikrouterLogin({ email: 'owner@example.com', name: 'Owner', userId: 'uid-1' });
    expect(auth.configured).toBe(true);
    expect(auth.ownerEmail).toBe('owner@example.com');

    // Same owner logging in again: succeeds (name update allowed).
    expect(() => auth.pikrouterLogin({ email: 'owner@example.com', name: 'Owner Updated' })).not.toThrow();

    // A different Pikpam account tries to log in: must be rejected.
    expect(() => auth.pikrouterLogin({ email: 'attacker@evil.com', name: 'Attacker', userId: 'uid-2' }))
      .toThrow(/Access denied.*owner@example\.com/);

    // Owner email must still be the original after the rejected attempt.
    expect(auth.ownerEmail).toBe('owner@example.com');
  });

  it('pikrouterLogin: rejects empty or invalid email', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gitu-auth-pikemail-'));
    const auth = new AppAuth(path.join(dir, 'password.json'), false);
    expect(() => auth.pikrouterLogin({ email: '', name: 'User' })).toThrow(/valid email/);
    expect(() => auth.pikrouterLogin({ email: 'notanemail', name: 'User' })).toThrow(/valid email/);
    expect(auth.configured).toBe(false);
  });

  it('enforces Pikpam OAuth state cookie, JWT claims, and workspace owner before storing API keys', async () => {
    const previous = process.env['AGENT_GITU_HOME'];
    const home = mkdtempSync(path.join(tmpdir(), 'gitu-auth-pik-http-'));
    process.env['AGENT_GITU_HOME'] = home;
    const origFetch = globalThis.fetch;
    const makeJwt = (payload: Record<string, unknown>) =>
      `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.sig`;
    try {
      const server = new GituServer({ cwd: home, port: 0, llm: new ScriptedMockLlm([]) });
      servers.push(server);
      const base = `http://127.0.0.1:${await server.start()}`;
      const ownerToken = makeJwt({ sub: 'u-owner', email: 'owner@example.com', exp: Math.floor(Date.now() / 1000) + 3600 });
      const attackerToken = makeJwt({ sub: 'u-attacker', email: 'attacker@evil.com', exp: Math.floor(Date.now() / 1000) + 3600 });
      const expiredToken = makeJwt({ sub: 'u-owner', email: 'owner@example.com', exp: Math.floor(Date.now() / 1000) - 60 });

      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const target = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (target.startsWith('https://pikrouter.pikpam.com/api/user/credits')) {
          return new Response(JSON.stringify({ ok: true, credits: { balance: 100, available: 100 } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return origFetch(input, init);
      }) as typeof fetch;

      const startFlow = async () => {
        const res = await fetch(`${base}/api/auth/pikrouter/start`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: base },
          body: JSON.stringify({ redirectPath: '/callback' }),
        });
        expect(res.status).toBe(200);
        const setCookie = res.headers.get('set-cookie') ?? '';
        expect(setCookie).toContain('pik_oauth_state=');
        expect(setCookie).toContain('Path=/');
        expect(setCookie).toContain('HttpOnly');
        const stateCookie = setCookie.split(';')[0]!;
        const data = (await res.json()) as { authUrl: string; state: string };
        return { stateCookie, state: data.state };
      };

      // 1. Shared callback link opened without browser state cookie is rejected (403).
      const flow1 = await startFlow();
      const sharedLinkRes = await fetch(`${base}/api/auth/pikrouter`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: base },
        body: JSON.stringify({ token: ownerToken, email: 'owner@example.com', state: flow1.state }),
      });
      expect(sharedLinkRes.status).toBe(403);

      // 2. Owner signs in cleanly with matching state cookie and JWT.
      const flow2 = await startFlow();
      const ownerRes = await fetch(`${base}/api/auth/pikrouter`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: base, cookie: flow2.stateCookie },
        body: JSON.stringify({ token: ownerToken, email: 'owner@example.com', userId: 'u-owner', state: flow2.state }),
      });
      expect(ownerRes.status).toBe(200);
      expect(ownerRes.headers.get('set-cookie')).toContain('gitu_session=');
      expect(loadStoredKeys()['PIKROUTER_API_KEY']).toBe(ownerToken);

      // 3. Expired JWT is rejected (401).
      const flow3 = await startFlow();
      const expiredRes = await fetch(`${base}/api/auth/pikrouter`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: base, cookie: flow3.stateCookie },
        body: JSON.stringify({ token: expiredToken, email: 'owner@example.com', state: flow3.state }),
      });
      expect(expiredRes.status).toBe(401);

      // 4. Spoofed query email differing from JWT email is rejected (403).
      const flow4 = await startFlow();
      const spoofedRes = await fetch(`${base}/api/auth/pikrouter`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: base, cookie: flow4.stateCookie },
        body: JSON.stringify({ token: attackerToken, email: 'owner@example.com', state: flow4.state }),
      });
      expect(spoofedRes.status).toBe(403);
      expect(loadStoredKeys()['PIKROUTER_API_KEY']).toBe(ownerToken);

      // 5. Different Pikpam account cannot log in OR overwrite PIKROUTER_API_KEY.
      const flow5 = await startFlow();
      const attackerRes = await fetch(`${base}/api/auth/pikrouter`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: base, cookie: flow5.stateCookie },
        body: JSON.stringify({ token: attackerToken, email: 'attacker@evil.com', state: flow5.state }),
      });
      expect(attackerRes.status).toBe(403);
      expect(attackerRes.headers.get('set-cookie') ?? '').not.toContain('gitu_session=');
      expect(loadStoredKeys()['PIKROUTER_API_KEY']).toBe(ownerToken);
    } finally {
      globalThis.fetch = origFetch;
      if (previous === undefined) delete process.env['AGENT_GITU_HOME'];
      else process.env['AGENT_GITU_HOME'] = previous;
    }
  }, 30000);
});
