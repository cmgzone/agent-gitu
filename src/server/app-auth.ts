import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
const derive = (password: string, salt: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password, salt, 32, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (error, key) => (error ? reject(error) : resolve(key)));
  });
const COOKIE = 'gitu_session';
const SESSION_MS = 8 * 60 * 60 * 1000;
const WINDOW_MS = 15 * 60 * 1000;
interface PasswordRecord {
  version: 1 | 2;
  userId: string;
  name?: string;
  email?: string;
  salt: string;
  hash: string;
}
interface Session {
  expires: number;
  streams: Set<ServerResponse>;
  timer: NodeJS.Timeout;
}

/** App authentication is independent from native/mobile API credentials. */
export class AppAuth {
  private record?: PasswordRecord;
  private sessions = new Map<string, Session>();
  private attempts = new Map<string, { count: number; until: number }>();
  private working = 0;
  private settingUp = false;

  constructor(
    private readonly file: string,
    readonly required = true,
    private readonly trustLocalProxy = false,
    private readonly registrationToken?: string,
  ) {
    if (existsSync(file)) {
      const record = JSON.parse(readFileSync(file, 'utf8')) as PasswordRecord;
      if (
        ![1, 2].includes(record.version) ||
        !/^[a-f0-9]{32}$/.test(record.salt) ||
        !/^[a-f0-9]{64}$/.test(record.hash) ||
        typeof record.userId !== 'string' ||
        !record.userId ||
        (record.version === 2 && (!record.name?.trim() || record.name.length > 100 || !record.email || !AppAuth.validEmail(record.email)))
      ) {
        throw new Error('App password settings are damaged. Restore the password settings file before starting.');
      }
      this.record = record;
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

  private token(req: IncomingMessage): string | undefined {
    return req.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
  }

  authenticated(req: IncomingMessage): boolean {
    const token = this.token(req);
    const session = token ? this.sessions.get(token) : undefined;
    if (!session) return false;
    if (session.expires <= Date.now()) {
      this.drop(token!);
      return false;
    }
    return true;
  }

  track(req: IncomingMessage, res: ServerResponse): void {
    const session = this.sessions.get(this.token(req) ?? '');
    if (!session) return;
    session.streams.add(res);
    res.once('close', () => session.streams.delete(res));
  }

  private drop(token: string): void {
    const session = this.sessions.get(token);
    if (!session) return;
    clearTimeout(session.timer);
    for (const response of session.streams) response.destroy();
    this.sessions.delete(token);
  }

  issue(req: IncomingMessage, res: ServerResponse): void {
    const old = this.token(req);
    if (old) this.drop(old);
    const token = randomBytes(32).toString('hex');
    if (this.sessions.size >= 100) this.drop(this.sessions.keys().next().value!);
    const timer = setTimeout(() => this.drop(token), SESSION_MS);
    timer.unref();
    this.sessions.set(token, { expires: Date.now() + SESSION_MS, streams: new Set(), timer });
    const secure = this.secure(req);
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${secure ? '; Secure' : ''}`);
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
    for (const token of this.sessions.keys()) this.drop(token);
  }
}
