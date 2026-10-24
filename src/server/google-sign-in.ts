import { randomBytes, createHash, createPublicKey, verify, timingSafeEqual } from 'node:crypto';
import type { JsonWebKey } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppAuth } from './app-auth.js';

const COOKIE = 'gitu_google_flow';
const TTL = 10 * 60 * 1000;
const random = () => randomBytes(32).toString('base64url');
const equal = (a: string, b: string) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
export interface GoogleIdentity {
  sub: string;
  email: string;
  authoritative: boolean;
}
interface Attempt {
  id: string;
  state: string;
  nonce: string;
  verifier: string;
  secret: string;
  expires: number;
  status: 'pending' | 'exchanging' | 'ready' | 'failed';
  linkUser?: string;
  identity?: GoogleIdentity;
  error?: string;
}
export interface GoogleSignInConfig {
  clientId: string;
  clientSecret: string;
  origin: string;
}

/** Authorization code + PKCE, with a separate browser-bound completion secret.
 * Google can authenticate in the system browser without moving Gitu's session
 * cookie out of the Android WebView. Tokens never reach either app frontend. */
export class GoogleSignIn {
  private attempts = new Map<string, Attempt>();
  private keys?: { expires: number; values: JsonWebKey[] };
  private config?: GoogleSignInConfig;
  constructor(
    config?: GoogleSignInConfig,
    private readonly file?: string,
  ) {
    let saved: GoogleSignInConfig | undefined;
    if (file && existsSync(file)) {
      try {
        saved = JSON.parse(readFileSync(file, 'utf8')) as GoogleSignInConfig;
      } catch {
        /* Invalid settings stay disabled. */
      }
    }
    const input = config ??
      saved ?? {
        clientId: process.env['AGENT_GITU_GOOGLE_CLIENT_ID'] ?? '',
        clientSecret: process.env['AGENT_GITU_GOOGLE_CLIENT_SECRET'] ?? '',
        origin: process.env['AGENT_GITU_PUBLIC_ORIGIN'] ?? '',
      };
    try {
      const url = new URL(input.origin);
      if (
        typeof input.clientId === 'string' &&
        input.clientId.length > 0 &&
        input.clientId.length <= 500 &&
        typeof input.clientSecret === 'string' &&
        input.clientSecret.length > 0 &&
        input.clientSecret.length <= 1024 &&
        !url.username &&
        !url.password &&
        url.pathname === '/' &&
        !url.search &&
        !url.hash &&
        (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
      )
        this.config = { ...input, origin: url.origin };
    } catch {
      /* Unconfigured installations keep password login. */
    }
  }
  get enabled(): boolean {
    return Boolean(this.config);
  }
  get publicOrigin(): string | undefined {
    return this.config?.origin;
  }
  settings(): { enabled: boolean; clientId: string; origin: string; callback: string; hasSecret: boolean } {
    return {
      enabled: this.enabled,
      clientId: this.config?.clientId ?? '',
      origin: this.config?.origin ?? '',
      callback: this.config ? this.callback : '',
      hasSecret: Boolean(this.config?.clientSecret),
    };
  }
  configure(input: Record<string, unknown>): void {
    if (!this.file) throw new Error('Google settings storage unavailable.');
    const next = new GoogleSignIn({
      clientId: typeof input['clientId'] === 'string' ? input['clientId'].trim() : '',
      clientSecret: typeof input['clientSecret'] === 'string' && input['clientSecret'] ? input['clientSecret'] : (this.config?.clientSecret ?? ''),
      origin: typeof input['origin'] === 'string' ? input['origin'].trim() : '',
    }).config;
    if (!next) throw new Error('Enter your Google OAuth client ID, client secret, and HTTPS public origin (or localhost).');
    const temporary = this.file + '.' + random() + '.tmp';
    try {
      writeFileSync(temporary, JSON.stringify(next), { mode: 0o600, flag: 'wx' });
      renameSync(temporary, this.file);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
    this.close();
    this.config = next;
  }
  private get callback(): string {
    return this.config!.origin + '/auth/google/callback';
  }
  private prune(): void {
    for (const [id, attempt] of this.attempts) if (attempt.expires <= Date.now()) this.attempts.delete(id);
  }
  private cookie(req: IncomingMessage): string {
    return (
      req.headers.cookie
        ?.split(';')
        .map((p) => p.trim())
        .find((p) => p.startsWith(COOKIE + '='))
        ?.slice(COOKIE.length + 1) ?? ''
    );
  }
  private setCookie(res: ServerResponse, secret: string, secure: boolean): void {
    res.setHeader('Set-Cookie', `${COOKIE}=${secret}; Path=/api/auth/google; HttpOnly; SameSite=Strict; Max-Age=${secret ? TTL / 1000 : 0}${secure ? '; Secure' : ''}`);
  }
  start(req: IncomingMessage, res: ServerResponse, auth: AppAuth, link = false): { authorizationUrl: string; attemptId: string } {
    if (!this.config) throw new Error('Google sign-in needs an OAuth client and a configured HTTPS public origin.');
    if (!auth.configured || !auth.requiresEmail) throw new Error('Register the workspace owner with email and password first.');
    if (!AppAuth.local(req) && !auth.secure(req)) throw new Error('Google sign-in requires HTTPS or localhost.');
    if (link && !auth.authenticated(req)) throw new Error('Sign in with your password before linking Google.');
    this.prune();
    const oldSecret = this.cookie(req);
    for (const [id, attempt] of this.attempts) if (oldSecret && equal(attempt.secret, oldSecret)) this.attempts.delete(id);
    if (this.attempts.size >= 50) throw new Error('Too many sign-in requests. Try again shortly.');
    const attempt: Attempt = {
      id: random(),
      state: random(),
      nonce: random(),
      verifier: random(),
      secret: random(),
      expires: Date.now() + TTL,
      status: 'pending',
      ...(link ? { linkUser: auth.userId } : {}),
    };
    this.attempts.set(attempt.id, attempt);
    this.setCookie(res, attempt.secret, auth.secure(req));
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.callback,
      response_type: 'code',
      scope: 'openid email profile',
      state: attempt.state,
      nonce: attempt.nonce,
      code_challenge: createHash('sha256').update(attempt.verifier).digest('base64url'),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();
    return { authorizationUrl: url.href, attemptId: attempt.id };
  }
  private async identity(token: string, nonce: string): Promise<GoogleIdentity> {
    if (typeof token !== 'string' || token.length > 16384) throw new Error('Invalid identity token.');
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid identity token.');
    const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString()) as { alg?: string; kid?: string };
    if (header.alg !== 'RS256' || !header.kid || header.kid.length > 200) throw new Error('Invalid identity token signature.');
    if (!this.keys || this.keys.expires <= Date.now()) {
      const response = await fetch('https://www.googleapis.com/oauth2/v3/certs', { signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (!response.ok) throw new Error('Google identity verification unavailable.');
      const data = (await response.json()) as { keys?: JsonWebKey[] };
      if (!Array.isArray(data.keys) || data.keys.length > 20) throw new Error('Invalid Google signing keys.');
      this.keys = { values: data.keys, expires: Date.now() + 5 * 60 * 1000 };
    }
    let key = this.keys.values.find((k) => (k as JsonWebKey & { kid?: string }).kid === header.kid && k.kty === 'RSA');
    if (!key) {
      this.keys = undefined;
      throw new Error('Google signing key changed. Please start sign-in again.');
    }
    if (
      !verify(
        'RSA-SHA256',
        Buffer.from(parts[0] + '.' + parts[1]),
        createPublicKey({ key: key as import('node:crypto').JsonWebKey, format: 'jwk' }),
        Buffer.from(parts[2]!, 'base64url'),
      )
    )
      throw new Error('Invalid identity token signature.');
    const claims = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString()) as Record<string, unknown>;
    const now = Date.now() / 1000;
    const aud = claims['aud'];
    if (
      !['accounts.google.com', 'https://accounts.google.com'].includes(String(claims['iss'])) ||
      !(aud === this.config!.clientId || (Array.isArray(aud) && aud.includes(this.config!.clientId) && claims['azp'] === this.config!.clientId)) ||
      (claims['azp'] !== undefined && claims['azp'] !== this.config!.clientId) ||
      typeof claims['exp'] !== 'number' ||
      claims['exp'] <= now ||
      typeof claims['iat'] !== 'number' ||
      claims['iat'] > now + 60 ||
      claims['iat'] < now - 7200 ||
      typeof claims['nonce'] !== 'string' ||
      !equal(claims['nonce'], nonce) ||
      claims['email_verified'] !== true ||
      typeof claims['sub'] !== 'string' ||
      !claims['sub'] ||
      claims['sub'].length > 255 ||
      typeof claims['email'] !== 'string' ||
      claims['email'].length > 254
    )
      throw new Error('Invalid Google identity claims.');
    const email = claims['email'].toLowerCase();
    return { sub: claims['sub'], email, authoritative: email.endsWith('@gmail.com') || (typeof claims['hd'] === 'string' && email.endsWith('@' + claims['hd'].toLowerCase())) };
  }
  async callbackResult(query: URLSearchParams): Promise<boolean> {
    this.prune();
    const state = query.get('state') ?? '';
    const attempt = [...this.attempts.values()].find((a) => a.status === 'pending' && equal(a.state, state));
    if (!attempt || !this.config) return false;
    attempt.status = 'exchanging'; // One-time state, even for failed exchanges.
    try {
      const code = query.get('code');
      if (query.has('error') || !code || code.length > 4096) throw new Error('Google sign-in was cancelled.');
      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        redirect: 'error',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: this.callback,
          code,
          code_verifier: attempt.verifier,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('Google sign-in could not be verified. Start again.');
      const data = (await response.json()) as { id_token: string };
      attempt.identity = await this.identity(data.id_token, attempt.nonce);
      attempt.status = 'ready';
      return true;
    } catch {
      attempt.status = 'failed';
      attempt.error = 'Google sign-in did not complete. Please start again.';
      return false;
    } finally {
      attempt.verifier = '';
      attempt.nonce = '';
    }
  }
  complete(req: IncomingMessage, res: ServerResponse, auth: AppAuth, id: unknown): { pending?: boolean; ok?: boolean } {
    this.prune();
    if (!AppAuth.local(req) && !auth.secure(req)) throw new Error('Google sign-in requires HTTPS or localhost.');
    const attempt = typeof id === 'string' ? this.attempts.get(id) : undefined;
    if (!attempt || !equal(attempt.secret, this.cookie(req))) throw new Error('Sign-in expired. Please start again.');
    if (attempt.status === 'pending' || attempt.status === 'exchanging') return { pending: true };
    this.attempts.delete(attempt.id);
    this.setCookie(res, '', auth.secure(req));
    if (attempt.status !== 'ready' || !attempt.identity) throw new Error(attempt.error ?? 'Google sign-in failed.');
    if (attempt.linkUser && (!auth.authenticated(req) || attempt.linkUser !== auth.userId)) throw new Error('Your session expired. Sign in with your password to link Google.');
    auth.googleLogin(attempt.identity, Boolean(attempt.linkUser));
    auth.issue(req, res);
    return { ok: true };
  }
  close(): void {
    this.attempts.clear();
    this.keys = undefined;
  }
}
