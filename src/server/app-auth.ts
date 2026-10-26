import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Duplex } from 'node:stream';
import { privateNetworkRequest } from './lan-login.js';
const derive = (password: string, salt: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, 32, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, key) => (error ? reject(error) : resolve(key)));
  });
const COOKIE = 'gitu_session';
const COOKIE_MAX_AGE_SECONDS = 10 * 365 * 24 * 60 * 60;
const WINDOW_MS = 15 * 60 * 1000;
interface PasswordRecord {
  version: 1 | 2;
  userId: string;
  name?: string;
  email?: string;
  salt: string;
  hash: string;
  googleSubject?: string;
}
interface Session {
  streams: Set<ServerResponse | Duplex>;
}

/** App authentication is independent from native/mobile API credentials. */
export class AppAuth {
  private record?: PasswordRecord;
  private sessions = new Map<string, Session>();
  private attempts = new Map<string, { count: number; until: number }>();
  private working = 0;
  private settingUp = false;
  private readonly sessionFile: string;

  constructor(
    private readonly file: string,
    readonly required = true,
    private readonly trustLocalProxy = false,
    private readonly registrationToken?: string,
    private readonly allowLanLogin = false,
  ) {
    this.sessionFile = file + '.sessions';
    if (existsSync(file)) {
      const record = JSON.parse(readFileSync(file, 'utf8')) as PasswordRecord;
      if (
        ![1, 2].includes(record.version) ||
        !/^[a-f0-9]{32}$/.test(record.salt) ||
        !/^[a-f0-9]{64}$/.test(record.hash) ||
        typeof record.userId !== 'string' ||
        !record.userId ||
        (record.googleSubject !== undefined && (typeof record.googleSubject !== 'string' || !record.googleSubject || record.googleSubject.length > 255)) ||
        (record.version === 2 && (!record.name?.trim() || record.name.length > 100 || !record.email || !AppAuth.validEmail(record.email)))
      ) {
        throw new Error('App password settings are damaged. Restore the password settings file before starting.');
      }
      this.record = record;
    }
    if (existsSync(this.sessionFile)) {
      const saved = JSON.parse(readFileSync(this.sessionFile, 'utf8')) as { version?: number; owner?: unknown; sessions?: unknown };
      if (saved.version !== 1 || !Array.isArray(saved.sessions) || saved.sessions.length > 100 || saved.sessions.some((key) => typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key))) {
        throw new Error('App sessions are damaged. Remove the sessions file to require sign-in again.');
      }
      if (saved.owner === (this.record?.userId ?? null)) {
        for (const key of saved.sessions) this.sessions.set(key as string, { streams: new Set() });
      }
    }
  }

  get configured(): boolean {
    return Boolean(this.record);
  }
  get remoteRegistrationEnabled(): boolean {
    return !this.configured && Boolean(this.registrationToken && this.registrationToken.length >= 32 && this.registrationToken.length <= 256);
  }
  canRegister(req: IncomingMessage, token?: unknown): boolean {
    if (AppAuth.local(req)) return true;
    if (!this.remoteRegistrationEnabled || !this.secure(req) || typeof token !== 'string' || token.length > 256) return false;
    const expected = Buffer.from(this.registrationToken!, 'utf8');
    const supplied = Buffer.from(token, 'utf8');
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }
  get enabled(): boolean {
    return this.required || this.configured;
  }
  get userId(): string {
    if (!this.record) throw new Error('Create an app password first.');
    return this.record.userId;
  }
  get requiresEmail(): boolean {
    return this.record?.version === 2;
  }
  get account(): { id: string; name?: string; email?: string } | undefined {
    return this.record ? { id: this.record.userId, name: this.record.name, email: this.record.email } : undefined;
  }
  get googleLinked(): boolean { return Boolean(this.record?.googleSubject); }
  /** Only verified Google identities reach here. Never create/replace an owner. */
  googleLogin(identity: { sub: string; email: string; authoritative: boolean }, link = false): void {
    const record = this.record;
    if (!record?.email || identity.email.toLowerCase() !== record.email.toLowerCase()) throw new Error('Use the Google account matching the workspace owner email.');
    if (record.googleSubject) {
      if (record.googleSubject !== identity.sub) throw new Error('This Google account is not linked to the workspace.');
      return;
    }
    if (!identity.authoritative && !link) throw new Error('Sign in with your password first, then link Google in General settings.');
    const updated = { ...record, googleSubject: identity.sub };
    const temporary = this.file + '.' + randomBytes(8).toString('hex') + '.tmp';
    try {
      writeFileSync(temporary, JSON.stringify(updated), { mode: 0o600, flag: 'wx' });
      renameSync(temporary, this.file);
      this.record = updated;
    } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  }
  private static validEmail(value: string): boolean {
    return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  static local(req: IncomingMessage): boolean {
    try {
      const host = new URL(`http://${req.headers.host ?? 'invalid'}`).hostname;
      return ['localhost', '127.0.0.1', '[::1]'].includes(host) && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
    } catch {
      return false;
    }
  }

  secure(req: IncomingMessage): boolean {
    return (
      Boolean((req.socket as { encrypted?: boolean }).encrypted) ||
      (this.trustLocalProxy && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '') && req.headers['x-forwarded-proto'] === 'https')
    );
  }

  lanLogin(req: IncomingMessage): boolean {
    return this.allowLanLogin && privateNetworkRequest(req) && !this.secure(req);
  }

  canLogin(req: IncomingMessage): boolean {
    return AppAuth.local(req) || this.secure(req) || this.lanLogin(req);
  }

  private token(req: IncomingMessage): string | undefined {
    return req.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
  }

  private sessionKey(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private persistSessions(): void {
    const temporary = this.sessionFile + '.' + randomBytes(8).toString('hex') + '.tmp';
    try {
      writeFileSync(temporary, JSON.stringify({ version: 1, owner: this.record?.userId ?? null, sessions: [...this.sessions.keys()] }), { mode: 0o600, flag: 'wx' });
      renameSync(temporary, this.sessionFile);
    } finally {
      if (existsSync(temporary)) unlinkSync(temporary);
    }
  }

  authenticated(req: IncomingMessage): boolean {
    const token = this.token(req);
    return Boolean(token && this.sessions.has(this.sessionKey(token)));
  }

  track(req: IncomingMessage, res: ServerResponse | Duplex): void {
    const token = this.token(req);
    const session = token ? this.sessions.get(this.sessionKey(token)) : undefined;
    if (!session) return;
    session.streams.add(res);
    res.once('close', () => session.streams.delete(res));
  }

  private drop(token: string): void {
    const key = this.sessionKey(token);
    const session = this.sessions.get(key);
    if (!session) return;
    this.sessions.delete(key);
    try {
      this.persistSessions();
    } catch (error) {
      this.sessions.set(key, session);
      throw error;
    }
    for (const response of session.streams) response.destroy();
  }

  issue(req: IncomingMessage, res: ServerResponse): void {
    const old = this.token(req);
    if (old) this.drop(old);
    const token = randomBytes(32).toString('hex');
    let evicted: { key: string; session: Session } | undefined;
    if (this.sessions.size >= 100) {
      const oldest = this.sessions.keys().next().value!;
      const session = this.sessions.get(oldest)!;
      this.sessions.delete(oldest);
      evicted = { key: oldest, session };
    }
    const key = this.sessionKey(token);
    this.sessions.set(key, { streams: new Set() });
    try {
      this.persistSessions();
    } catch (error) {
      this.sessions.delete(key);
      if (evicted) this.sessions.set(evicted.key, evicted.session);
      throw error;
    }
    if (evicted) for (const response of evicted.session.streams) response.destroy();
    const secure = this.secure(req);
    const cookie = `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${COOKIE_MAX_AGE_SECONDS}${secure ? '; Secure' : ''}`;
    const existing = res.getHeader('Set-Cookie');
    res.setHeader('Set-Cookie', existing ? [...(Array.isArray(existing) ? existing.map(String) : [String(existing)]), cookie] : cookie);
    res.setHeader('Cache-Control', 'no-store');
  }

  logout(req: IncomingMessage, res: ServerResponse): void {
    const token = this.token(req);
    if (token) this.drop(token);
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${this.secure(req) ? '; Secure' : ''}`);
  }

  async setup(password: unknown, profile?: { name: unknown; email: unknown }): Promise<void> {
    if (this.record || this.settingUp) throw new Error('An app password is already configured.');
    if (typeof password !== 'string' || password.length < 15 || password.length > 256) throw new Error('Use a password or passphrase with 15–256 characters.');
    const name = typeof profile?.name === 'string' ? profile.name.trim() : '';
    const email = typeof profile?.email === 'string' ? profile.email.trim().toLowerCase() : '';
    if (profile && (!name || name.length > 100 || !AppAuth.validEmail(email))) throw new Error('Enter your name and a valid email address.');
    this.settingUp = true;
    try {
      const salt = randomBytes(16).toString('hex');
      const hash = await derive(password, salt);
      const record: PasswordRecord = { version: profile ? 2 : 1, userId: randomUUID(), ...(profile ? { name, email } : {}), salt, hash: hash.toString('hex') };
      // Exclusive creation prevents two windows/processes from replacing setup.
      writeFileSync(this.file, JSON.stringify(record), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
      this.record = record;
    } finally {
      this.settingUp = false;
    }
  }

  async login(req: IncomingMessage, password: unknown, email?: unknown): Promise<'ok' | 'invalid' | 'limited'> {
    const now = Date.now();
    for (const [ip, attempt] of this.attempts) if (attempt.until <= now) this.attempts.delete(ip);
    const ip = req.socket.remoteAddress ?? 'unknown';
    const attempt = this.attempts.get(ip) ?? { count: 0, until: now + WINDOW_MS };
    if (attempt.count >= 5 || this.working >= 2 || (this.attempts.size >= 1000 && !this.attempts.has(ip))) return 'limited';
    attempt.count++;
    this.attempts.set(ip, attempt);
    if (!this.record || typeof password !== 'string' || password.length > 256) return 'invalid';
    this.working++;
    try {
      const hash = await derive(password, this.record.salt);
      const emailMatches = !this.requiresEmail || (typeof email === 'string' && email.trim().toLowerCase() === this.record.email);
      if (!timingSafeEqual(hash, Buffer.from(this.record.hash, 'hex')) || !emailMatches) return 'invalid';
      this.attempts.delete(ip);
      return 'ok';
    } finally {
      this.working--;
    }
  }

  close(): void {
    for (const session of this.sessions.values()) for (const response of session.streams) response.destroy();
    this.sessions.clear();
  }
}
