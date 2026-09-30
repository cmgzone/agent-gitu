import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

const COOKIE = 'gitu_mobile';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

/** Explicit opt-in remote access. A mobile cookie never bypasses Origin checks. */
export class MobileAccess {
  private readonly sessions = new Map<string, number>();
  constructor(private readonly key?: string) {
    if (key && key.length < 32) throw new Error('AGENT_GITU_ACCESS_KEY must contain at least 32 characters.');
  }
  get enabled(): boolean {
    return Boolean(this.key);
  }

  bearer(req: IncomingMessage): boolean {
    const header = req.headers.authorization;
    if (!this.key || typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
    const supplied = Buffer.from(header.slice(7)),
      expected = Buffer.from(this.key);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  }

  cookie(req: IncomingMessage): boolean {
    const token = this.token(req);
    if (!token) return false;
    const expires = this.sessions.get(token);
    if (!expires || expires <= Date.now()) {
      this.sessions.delete(token);
      return false;
    }
    return true;
  }

  sameOrigin(req: IncomingMessage): boolean {
    const origin = req.headers.origin;
    if (origin === undefined) return true; // Native requests have no browser Origin.
    if (typeof origin !== 'string' || origin === 'null') return false;
    try {
      const url = new URL(origin);
      const protocol = this.secure(req) ? 'https:' : 'http:';
      return url.protocol === protocol && url.host === req.headers.host;
    } catch {
      return false;
    }
  }

  issue(req: IncomingMessage, res: ServerResponse): void {
    const now = Date.now();
    for (const [token, expires] of this.sessions) if (expires <= now) this.sessions.delete(token);
    if (this.sessions.size >= 100) this.sessions.delete(this.sessions.keys().next().value!);
    const token = randomBytes(32).toString('hex');
    this.sessions.set(token, now + SESSION_MS);
    const secure = this.secure(req);
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_MS / 1000}${secure ? '; Secure' : ''}`);
    res.setHeader('Cache-Control', 'no-store');
  }

  revoke(req: IncomingMessage, res: ServerResponse): void {
    const token = this.token(req);
    if (token) this.sessions.delete(token);
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
  }

  private token(req: IncomingMessage): string | undefined {
    return req.headers.cookie
      ?.split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${COOKIE}=`))
      ?.slice(COOKIE.length + 1);
  }

  private secure(req: IncomingMessage): boolean {
    return Boolean((req.socket as { encrypted?: boolean }).encrypted) || req.headers['x-forwarded-proto'] === 'https';
  }
}
