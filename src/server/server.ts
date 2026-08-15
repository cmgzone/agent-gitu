import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Hermes } from '../agent/hermes.js';
import { ProjectGuard } from '../guard/project-guard.js';
import { TaskLedger } from '../ledger/task-ledger.js';
import type { LlmClient } from '../llm/llm.js';
import { PROVIDERS, ProviderError, fetchLiveModels, providerKey, resolveLlm } from '../llm/providers.js';
import { Reporter } from '../report/reporter.js';
import type { CompletionReport } from '../types.js';
import { nowIso, shortId } from '../util.js';
import { UI_HTML } from './ui.js';

export interface PendingApproval {
  id: string;
  tool: string;
  why: string;
  summary: string;
  requestedAt: string;
}

interface ApprovalWaiter extends PendingApproval {
  resolve: (approved: boolean) => void;
}

export interface RunSessionView {
  runId: string;
  goal: string;
  status: 'running' | 'completed' | 'blocked' | 'failed';
  startedAt: string;
  finishedAt?: string;
  taskId?: string;
  provider?: string;
  model?: string;
  pendingApprovals: PendingApproval[];
  report?: CompletionReport;
  error?: string;
}

interface RunSession {
  runId: string;
  goal: string;
  status: 'running' | 'completed' | 'blocked' | 'failed';
  startedAt: string;
  finishedAt?: string;
  taskId?: string;
  provider?: string;
  model?: string;
  events: { i: number; t: string; text: string }[];
  subscribers: Set<(ev: { i: number; t: string; text: string }) => void>;
  approvals: Map<string, ApprovalWaiter>;
  report?: CompletionReport;
  error?: string;
}

export interface HermesServerConfig {
  cwd: string;
  port?: number;
  host?: string;
  llm?: LlmClient;
  approvalTimeoutMs?: number;
}

const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

export class HermesServer {
  private readonly config: HermesServerConfig;
  private server?: http.Server;
  private readonly sessions = new Map<string, RunSession>();

  constructor(config: HermesServerConfig) {
    this.config = config;
  }

  async start(): Promise<number> {
    const server = http.createServer((req, res) => {
      this.route(req, res).catch((err) => {
        this.sendJson(res, 500, { error: (err as Error).message });
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(this.config.port ?? 8321, this.config.host ?? '127.0.0.1', resolve);
    });
    this.server = server;
    return (server.address() as AddressInfo).port;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => {
      this.server!.close((err) => (err ? reject(err) : resolve()));
    });
    this.server = undefined;
  }

  private sendJson(res: http.ServerResponse, status: number, body: unknown): void {
    const data = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(data);
  }

  private async readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > 1_000_000) throw new Error('Body too large');
      chunks.push(chunk as Buffer);
    }
    if (chunks.length === 0) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
    } catch {
      throw new Error('Invalid JSON body');
    }
  }

  private sessionView(s: RunSession): RunSessionView {
    return {
      runId: s.runId,
      goal: s.goal,
      status: s.status,
      startedAt: s.startedAt,
      finishedAt: s.finishedAt,
      taskId: s.taskId,
      provider: s.provider,
      model: s.model,
      pendingApprovals: [...s.approvals.values()].map(({ id, tool, why, summary, requestedAt }) => ({ id, tool, why, summary, requestedAt })),
      report: s.report,
      error: s.error,
    };
  }

  private pushEvent(s: RunSession, text: string): void {
    const ev = { i: s.events.length, t: nowIso(), text };
    s.events.push(ev);
    for (const send of s.subscribers) send(ev);
  }

  private async route(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const method = req.method ?? 'GET';

    if (method === 'GET' && (path === '/' || path === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(UI_HTML);
      return;
    }

    if (method === 'GET' && path === '/api/project') {
      try {
        const guard = ProjectGuard.detect(this.config.cwd);
        this.sendJson(res, 200, guard.lock);
      } catch (err) {
        this.sendJson(res, 200, { name: '(none)', repoRoot: this.config.cwd, error: (err as Error).message });
      }
      return;
    }

    if (method === 'GET' && path === '/api/models') {
      const providers = await Promise.all(
        Object.values(PROVIDERS).map(async (spec) => {
          const keyInfo = providerKey(spec);
          let models = spec.models;
          let live = false;
          if (keyInfo) {
            const fetched = await fetchLiveModels({ baseUrl: spec.baseUrl, apiKey: keyInfo.key, timeoutMs: 6000 });
            if (fetched && fetched.length > 0) {
              models = fetched.map((m) => m.id);
              live = true;
            }
          }
          return { id: spec.id, label: spec.label, defaultModel: spec.defaultModel, hasKey: Boolean(keyInfo), live, models };
        }),
      );
      const withKey = providers.find((p) => p.hasKey);
      this.sendJson(res, 200, { providers, defaultProvider: withKey?.id ?? 'alibaba' });
      return;
    }

    if (method === 'GET' && path === '/api/tasks') {
      try {
        const guard = ProjectGuard.detect(this.config.cwd);
        const tasks = TaskLedger.list(guard.lock.repoRoot).map((t) => ({
          taskId: t.data.taskId,
          goal: t.data.goal,
          status: t.data.status,
          createdAt: t.data.createdAt,
        }));
        this.sendJson(res, 200, { tasks });
      } catch {
        this.sendJson(res, 200, { tasks: [] });
      }
      return;
    }

    const taskMatch = path.match(/^\/api\/tasks\/([\w-]+)$/);
    if (method === 'GET' && taskMatch) {
      const guard = ProjectGuard.detect(this.config.cwd);
      const ledger = TaskLedger.load(guard.lock.repoRoot, taskMatch[1]!);
      if (!ledger) {
        this.sendJson(res, 404, { error: 'task not found' });
        return;
      }
      this.sendJson(res, 200, ledger.data);
      return;
    }

    if (method === 'GET' && path === '/api/runs') {
      const sessions = [...this.sessions.values()]
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .map((s) => this.sessionView(s));
      this.sendJson(res, 200, sessions);
      return;
    }

    if (method === 'POST' && path === '/api/runs') {
      const body = await this.readBody(req);
      const goal = typeof body['goal'] === 'string' ? body['goal'].trim() : '';
      if (!goal) {
        this.sendJson(res, 400, { error: 'goal is required' });
        return;
      }
      const criteria = Array.isArray(body['criteria']) ? (body['criteria'] as unknown[]).map(String).filter(Boolean) : undefined;
      const provider = typeof body['provider'] === 'string' ? body['provider'] : undefined;
      const model = typeof body['model'] === 'string' ? body['model'] : undefined;
      const mode = body['mode'] === 'fast' ? 'fast' : 'standard';
      const maxActions = typeof body['maxActions'] === 'number' && Number.isFinite(body['maxActions']) ? body['maxActions'] : undefined;

      let llm = this.config.llm;
      let resolvedInfo: { providerId: string; model: string } | undefined;
      if (!llm) {
        try {
          const resolved = resolveLlm({ provider, model });
          llm = resolved.client;
          resolvedInfo = { providerId: resolved.providerId, model: resolved.model };
        } catch (err) {
          if (err instanceof ProviderError) {
            this.sendJson(res, 400, { error: err.message });
            return;
          }
          throw err;
        }
      }

      const session: RunSession = {
        runId: shortId('run'),
        goal,
        status: 'running',
        startedAt: nowIso(),
        provider: resolvedInfo?.providerId,
        model: resolvedInfo?.model,
        events: [],
        subscribers: new Set(),
        approvals: new Map(),
      };
      this.sessions.set(session.runId, session);
      this.sendJson(res, 202, { runId: session.runId });
      void this.executeRun(session, llm!, { goal, criteria, mode, maxActions });
      return;
    }

    const runMatch = path.match(/^\/api\/runs\/([\w-]+)$/);
    if (method === 'GET' && runMatch) {
      const session = this.sessions.get(runMatch[1]!);
      if (!session) {
        this.sendJson(res, 404, { error: 'run not found' });
        return;
      }
      this.sendJson(res, 200, this.sessionView(session));
      return;
    }

    const streamMatch = path.match(/^\/api\/runs\/([\w-]+)\/stream$/);
    if (method === 'GET' && streamMatch) {
      const session = this.sessions.get(streamMatch[1]!);
      if (!session) {
        this.sendJson(res, 404, { error: 'run not found' });
        return;
      }
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      for (const ev of session.events) res.write(`data: ${JSON.stringify(ev)}\n\n`);
      const send = (ev: { i: number; t: string; text: string }): void => {
        res.write(`data: ${JSON.stringify(ev)}\n\n`);
      };
      session.subscribers.add(send);
      const heartbeat = setInterval(() => res.write(': hb\n\n'), 15000);
      req.on('close', () => {
        clearInterval(heartbeat);
        session.subscribers.delete(send);
      });
      return;
    }

    const approvalMatch = path.match(/^\/api\/approvals\/([\w-]+)$/);
    if (method === 'POST' && approvalMatch) {
      const body = await this.readBody(req);
      for (const session of this.sessions.values()) {
        const waiter = session.approvals.get(approvalMatch[1]!);
        if (waiter) {
          session.approvals.delete(approvalMatch[1]!);
          const approved = body['approved'] === true;
          this.pushEvent(session, `approval ${approved ? 'GRANTED' : 'DENIED'} for ${waiter.tool} (${waiter.why})`);
          waiter.resolve(approved);
          this.sendJson(res, 200, { ok: true, approved });
          return;
        }
      }
      this.sendJson(res, 404, { error: 'approval not found or already resolved' });
      return;
    }

    this.sendJson(res, 404, { error: 'not found' });
  }

  private async executeRun(
    session: RunSession,
    llm: LlmClient,
    opts: { goal: string; criteria?: string[]; mode: 'fast' | 'standard'; maxActions?: number },
  ): Promise<void> {
    const hermes = new Hermes({
      cwd: this.config.cwd,
      llm,
      mode: opts.mode,
      criteria: opts.criteria,
      budgets: opts.maxActions ? { maxActions: opts.maxActions } : undefined,
      approvalHandler: ({ tool, why, summary }) =>
        new Promise<boolean>((resolve) => {
          const waiter: ApprovalWaiter = {
            id: shortId('appr'),
            tool,
            why,
            summary,
            requestedAt: nowIso(),
            resolve,
          };
          session.approvals.set(waiter.id, waiter);
          this.pushEvent(session, `approval-required ${waiter.id} [${tool}] ${why}`);
          setTimeout(() => {
            if (session.approvals.has(waiter.id)) {
              session.approvals.delete(waiter.id);
              this.pushEvent(session, `approval ${waiter.id} timed out — denied`);
              resolve(false);
            }
          }, this.config.approvalTimeoutMs ?? APPROVAL_TIMEOUT_MS);
        }),
      onEvent: (text) => {
        const ledgerMatch = text.match(/ledger\s+created:\s+(\S+)/);
        if (ledgerMatch) session.taskId = ledgerMatch[1];
        this.pushEvent(session, text);
      },
    });

    try {
      const { report } = await hermes.run(opts.goal);
      session.status = report.status === 'complete' ? 'completed' : report.status === 'blocked' ? 'blocked' : 'failed';
      session.report = report;
    } catch (err) {
      session.status = 'failed';
      session.error = (err as Error).message;
      this.pushEvent(session, `fatal: ${session.error}`);
    } finally {
      session.finishedAt = nowIso();
      this.pushEvent(session, `run finished: ${session.status}`);
      for (const sub of [...session.subscribers]) {
        session.subscribers.delete(sub);
      }
    }
  }
}

export function renderReportText(report: CompletionReport): string {
  return new Reporter().render(report);
}
