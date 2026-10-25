import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ConnectionRegistry } from '../connections/connections.js';
import type { CoworkComputer } from './computer.js';

interface GitAccess { connections: ConnectionRegistry; write: boolean }
interface Lease { token: string; access: () => GitAccess | undefined }
const prefix = '/api/workspace-git/';

/** Workspace capabilities authorize only Git smart HTTP, never the app API. */
export class WorkspaceGitBridge {
  private readonly leases = new Map<string, Lease>();
  private readonly installed = new WeakMap<CoworkComputer, string>();
  private readonly installing = new WeakMap<CoworkComputer, Promise<void>>();

  async prepare(computer: CoworkComputer, origin: string, access: () => GitAccess | undefined, signal?: AbortSignal): Promise<void> {
    const pending = this.installing.get(computer);
    if (pending) await pending;
    const task = this.install(computer, origin, access, signal);
    this.installing.set(computer, task);
    try { await task; } finally { if (this.installing.get(computer) === task) this.installing.delete(computer); }
  }

  private async install(computer: CoworkComputer, origin: string, access: () => GitAccess | undefined, signal?: AbortSignal): Promise<void> {
    const url = new URL(origin);
    if (url.protocol !== 'https:' || url.username || url.password) return;
    const current = access(), repositories = current?.connections.githubGitRepositories() ?? [];
    let lease = this.leases.get(computer.name);
    if (!lease) { lease = { token: randomBytes(32).toString('hex'), access }; this.leases.set(computer.name, lease); }
    lease.access = access;
    const base = url.origin + prefix + computer.name + '/';
    const lines = [`[http ${JSON.stringify(base)}]`, `\textraHeader = Authorization: Bearer ${lease.token}`, '\tfollowRedirects = false'];
    for (const repo of repositories) {
      lines.push(`[url ${JSON.stringify(base + repo)}]`);
      for (const source of ['https://github.com/', 'git@github.com:', 'ssh://git@github.com/']) {
        // Match only this repository; the server independently validates its full path.
        lines.push('\tinsteadOf = ' + source + repo);
      }
    }
    const config = repositories.length ? lines.join('\n') + '\n' : '';
    const revision = computer.runtimeGeneration + ':' + config;
    if (this.installed.get(computer) === revision && computer.status().state === 'running') return;
    await computer.configureGit(config, signal);
    this.installed.set(computer, revision);
  }

  async route(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    if (!req.url?.startsWith(prefix)) return false;
    const fail = (status: number) => { res.writeHead(status, { 'cache-control': 'no-store' }); res.end('Workspace Git access unavailable.'); };
    const match = /^\/api\/workspace-git\/(gitu-cowork-[a-f0-9]{24})\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?\/(info\/refs\?service=git-(upload|receive)-pack|git-(upload|receive)-pack)$/.exec(req.url);
    if (!match) { fail(404); return true; }
    const lease = this.leases.get(match[1]!);
    const expected = Buffer.from('Bearer ' + (lease?.token ?? ''));
    const supplied = Buffer.from(req.headers.authorization ?? '');
    if (!lease || expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) { fail(401); return true; }
    const access = lease.access(), repository = (match[2] + '/' + match[3]).toLowerCase();
    const service = match[5] ?? match[6];
    if (!access || !access.connections.githubGitRepositories().includes(repository) || service === 'receive' && !access.write) { fail(403); return true; }
    const discovery = match[4]!.startsWith('info/refs');
    if (req.method !== (discovery ? 'GET' : 'POST') || !discovery && req.headers['content-type'] !== `application/x-git-${service}-pack-request`) { fail(405); return true; }
    const abort = new AbortController();
    const cancel = () => { if (!res.writableEnded) abort.abort(); };
    res.once('close', cancel);
    try {
      const headers = new Headers();
      for (const name of ['content-type', 'content-encoding', 'git-protocol']) {
        const value = req.headers[name]; if (typeof value === 'string') headers.set(name, value);
      }
      const init = { method: req.method, headers, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(300_000)]),
        ...(!discovery ? { body: req, duplex: 'half' } : {}) } as unknown as RequestInit;
      const upstream = await access.connections.githubGitRequest(repository, match[4]!, init);
      // No redirects, cookies, provider error text or credentials reach the computer.
      if (!upstream.ok) { await upstream.body?.cancel(); fail(upstream.status === 401 || upstream.status === 403 ? 403 : 502); return true; }
      const type = upstream.headers.get('content-type') ?? '';
      if (!type.startsWith(`application/x-git-${service}-pack-`)) { await upstream.body?.cancel(); fail(502); return true; }
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
      if (upstream.body) await pipeline(Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]), res);
      else res.end();
    } catch { if (!res.headersSent) fail(502); else res.destroy(); }
    finally { res.removeListener('close', cancel); }
    return true;
  }
}
