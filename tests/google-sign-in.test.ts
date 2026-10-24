import { generateKeyPairSync, sign, createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleSignIn } from '../src/server/google-sign-in.js';
import { AppAuth } from '../src/server/app-auth.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const config = { clientId: 'fixture.apps.googleusercontent.com', clientSecret: 'fixture-google-secret', origin: 'https://gitu.example.com' };
const roots: string[] = [],
  auths: AppAuth[] = [];
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  auths.splice(0).forEach((a) => a.close());
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});
function request(cookie = '', secure = true): IncomingMessage {
  return { headers: { host: 'gitu.example.com', cookie }, socket: { remoteAddress: '127.0.0.1', encrypted: secure } } as unknown as IncomingMessage;
}
function response() {
  const headers = new Map<string, unknown>();
  return { setHeader: (k: string, v: unknown) => headers.set(k, v), getHeader: (k: string) => headers.get(k), headers } as unknown as ServerResponse & {
    headers: Map<string, unknown>;
  };
}
function cookie(res: ServerResponse, name = 'gitu_google_flow') {
  return (
    ([] as string[])
      .concat(res.getHeader('Set-Cookie') as string | string[])
      .find((c) => c.startsWith(name + '='))
      ?.split(';')[0] ?? ''
  );
}
async function fixture(email = 'owner@gmail.com') {
  const root = mkdtempSync(path.join(tmpdir(), 'gitu-google-'));
  roots.push(root);
  const auth = new AppAuth(path.join(root, 'password.json'));
  auths.push(auth);
  await auth.setup('Disposable fixture long password', { name: 'Owner', email });
  const google = new GoogleSignIn(config, path.join(root, 'google.json'));
  return { root, auth, google };
}
function exchange(nonce: string, claims: Record<string, unknown> = {}, badSignature = false) {
  const now = Math.floor(Date.now() / 1000);
  const body = {
    iss: 'https://accounts.google.com',
    aud: config.clientId,
    exp: now + 3600,
    iat: now,
    nonce,
    email: 'owner@gmail.com',
    email_verified: true,
    sub: 'google-owner-subject',
    ...claims,
  };
  const head = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'fixture-key' })).toString('base64url'),
    payload = Buffer.from(JSON.stringify(body)).toString('base64url'),
    message = head + '.' + payload;
  const token = message + '.' + (badSignature ? Buffer.from('invalid') : sign('RSA-SHA256', Buffer.from(message), privateKey)).toString('base64url');
  const fetcher = vi.fn(async (input: string | URL, init?: RequestInit) => {
    if (String(input).endsWith('/certs')) return new Response(JSON.stringify({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'fixture-key' }] }));
    expect(String(input)).toBe('https://oauth2.googleapis.com/token');
    expect(new URLSearchParams(init?.body as URLSearchParams).get('client_secret')).toBe(config.clientSecret);
    return new Response(JSON.stringify({ id_token: token, access_token: 'never-store-this-token' }));
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
describe('Google sign-in for hosted, desktop and Android clients', () => {
  it('uses PKCE and one-time state, then completes only in the initiating client', async () => {
    const f = await fixture(),
      res = response(),
      start = f.google.start(request(), res, f.auth),
      url = new URL(start.authorizationUrl);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('redirect_uri')).toBe(config.origin + '/auth/google/callback');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    const fetcher = exchange(url.searchParams.get('nonce')!);
    await expect(f.google.callbackResult(new URLSearchParams({ state: 'attacker', code: 'code' }))).resolves.toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
    const query = new URLSearchParams({ state: url.searchParams.get('state')!, code: 'fixture-code' });
    expect(await f.google.callbackResult(query)).toBe(true);
    expect(await f.google.callbackResult(query)).toBe(false);
    const verifier = new URLSearchParams(fetcher.mock.calls[0]![1]?.body as URLSearchParams).get('code_verifier')!;
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(url.searchParams.get('code_challenge'));
    expect(() => f.google.complete(request(), response(), f.auth, start.attemptId)).toThrow('expired');
    const done = response();
    expect(f.google.complete(request(cookie(res)), done, f.auth, start.attemptId)).toEqual({ ok: true });
    expect(cookie(done, 'gitu_session')).not.toBe('');
    expect(f.auth.authenticated(request(cookie(done, 'gitu_session')))).toBe(true);
    expect(done.getHeader('Set-Cookie')).toEqual(expect.arrayContaining([expect.stringContaining('gitu_google_flow=;')]));
    expect(() => f.google.complete(request(cookie(res)), response(), f.auth, start.attemptId)).toThrow('expired');
    const record = readFileSync(path.join(f.root, 'password.json'), 'utf8');
    expect(record).toContain('google-owner-subject');
    expect(record).not.toContain('never-store');
  });
  it.each([{ aud: 'foreign-client' }, { iss: 'https://attacker.example' }, { nonce: 'wrong' }, { exp: 1 }, { iat: 999999999999 }, { email_verified: false }, { sub: '' }])(
    'rejects invalid identity claims %j',
    async (claims) => {
      const f = await fixture(),
        res = response(),
        start = f.google.start(request(), res, f.auth),
        url = new URL(start.authorizationUrl);
      exchange(url.searchParams.get('nonce')!, claims);
      expect(await f.google.callbackResult(new URLSearchParams({ state: url.searchParams.get('state')!, code: 'code' }))).toBe(false);
      expect(() => f.google.complete(request(cookie(res)), response(), f.auth, start.attemptId)).toThrow('did not complete');
      expect(f.auth.googleLinked).toBe(false);
    },
  );
  it('rejects invalid signatures and valid Google identities belonging to another owner', async () => {
    const f = await fixture();
    for (const bad of [true, false]) {
      const res = response(),
        start = f.google.start(request(), res, f.auth),
        url = new URL(start.authorizationUrl);
      exchange(url.searchParams.get('nonce')!, { email: 'attacker@gmail.com' }, bad);
      const success = await f.google.callbackResult(new URLSearchParams({ state: url.searchParams.get('state')!, code: 'code' }));
      expect(success).toBe(!bad);
      expect(() => f.google.complete(request(cookie(res)), response(), f.auth, start.attemptId)).toThrow();
      expect(f.auth.googleLinked).toBe(false);
    }
  });
  it('requires an authenticated link for third-party email and pins the Google subject', async () => {
    const f = await fixture('owner@example.com');
    expect(() => f.auth.googleLogin({ sub: 'subject-1', email: 'owner@example.com', authoritative: false })).toThrow('password first');
    expect(() => f.google.start(request(), response(), f.auth, true)).toThrow('password');
    const session = response();
    f.auth.issue(request(), session);
    const sessionCookie = cookie(session, 'gitu_session'),
      res = response(),
      start = f.google.start(request(sessionCookie), res, f.auth, true),
      url = new URL(start.authorizationUrl);
    exchange(url.searchParams.get('nonce')!, { email: 'owner@example.com' });
    expect(await f.google.callbackResult(new URLSearchParams({ state: url.searchParams.get('state')!, code: 'code' }))).toBe(true);
    expect(f.google.complete(request(sessionCookie + '; ' + cookie(res)), response(), f.auth, start.attemptId)).toEqual({ ok: true });
    expect(() => f.auth.googleLogin({ sub: 'different-subject', email: 'owner@example.com', authoritative: true })).toThrow('not linked');
    expect(() => f.auth.googleLogin({ sub: 'google-owner-subject', email: 'owner@example.com', authoritative: false })).not.toThrow();
  });
  it('rejects HTTP, malformed origins and expired flows, and saves credentials without returning the secret', async () => {
    const f = await fixture();
    expect(() => f.google.start(request('', false), response(), f.auth)).toThrow('HTTPS');
    for (const origin of ['http://192.168.1.1', 'https://user:pass@example.com', 'https://gitu.example.com/path', 'javascript:alert(1)'])
      expect(new GoogleSignIn({ ...config, origin }).enabled).toBe(false);
    f.google.configure({ ...config });
    expect(f.google.settings()).toMatchObject({ enabled: true, hasSecret: true });
    expect(JSON.stringify(f.google.settings())).not.toContain(config.clientSecret);
    expect(new GoogleSignIn(undefined, path.join(f.root, 'google.json')).enabled).toBe(true);
    const res = response(),
      start = f.google.start(request(), res, f.auth);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 11 * 60 * 1000);
    expect(() => f.google.complete(request(cookie(res)), response(), f.auth, start.attemptId)).toThrow('expired');
  });
});
