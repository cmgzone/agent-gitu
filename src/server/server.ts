import http from 'node:http';
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import nodePath from 'node:path';
import type { AddressInfo } from 'node:net';
import { Hermes } from '../agent/hermes.js';
import type { BrowserBridge, BrowserState } from '../browser/browser.js';
import { CronScheduler, CronStore, type CronJob } from '../cron/scheduler.js';
import { ProjectGuard } from '../guard/project-guard.js';
import { TaskLedger } from '../ledger/task-ledger.js';
import type { LlmClient } from '../llm/llm.js';
import { PROVIDERS, ProviderError, fetchLiveModels, modelSupportsImages, providerKey, resolveLlm } from '../llm/providers.js';
import { removeStoredKey, setStoredKey, storedKeyVars } from '../llm/keys.js';
import { SessionStore } from './session-store.js';
import { McpManager } from '../mcp/client.js';
import { Reporter } from '../report/reporter.js';
import { SkillStore } from '../skills/skills.js';
import type { CompletionReport } from '../types.js';
import { nowIso, shortId } from '../util.js';
import { createProject, ensureHermesHome, hermesHomeRoot, isDriveRoot, loadWorkspaceSettings, projectsDir, saveWorkspaceSettings } from '../workspace/home.js';
import { UI_HTML } from './ui.js';

export interface PendingApproval {
  id: string;
  tool: string;
  why: string;
  summary: string;
  requestedAt: string;
}

export interface PendingPlanReview {
  id: string;
  criteria: string[];
  steps: { description: string; verification: string }[];
  requestedAt: string;
}

export interface PendingQuestions {
  id: string;
  questions: { question: string; header?: string; options: string[] }[];
  requestedAt: string;
}

interface QuestionsWaiter extends PendingQuestions {
  resolve: (answer: string) => void;
}

interface PlanReviewWaiter extends PendingPlanReview {
  resolve: (decision: { approved: boolean; note?: string; criteria?: string[]; steps?: { description: string; verification: string }[] }) => void;
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
  project?: string;
  provider?: string;
  model?: string;
  pendingApprovals: PendingApproval[];
  pendingPlanReview?: PendingPlanReview;
  pendingQuestions?: PendingQuestions;
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
  project?: string;
  projectPath?: string;
  provider?: string;
  model?: string;
  events: { i: number; t: string; text: string }[];
  subscribers: Set<(ev: { i: number; t: string; text: string }) => void>;
  approvals: Map<string, ApprovalWaiter>;
  planReview?: PlanReviewWaiter;
  questions?: QuestionsWaiter;
  hermes?: InstanceType<typeof Hermes>;
  report?: CompletionReport;
  error?: string;
}

export interface HermesServerConfig {
  cwd: string;
  port?: number;
  host?: string;
  llm?: LlmClient;
  approvalTimeoutMs?: number;
  browser?: BrowserBridge;
}

const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

export class HermesServer {
  private readonly config: HermesServerConfig;
  private server?: http.Server;
  private readonly sessions = new Map<string, RunSession>();
  private scheduler?: CronScheduler;
  private cronStore?: CronStore;
  private store?: SessionStore;

  private readonly browserSubs = new Set<(msg: Record<string, unknown>) => void>();
  private browserState: { available: boolean; url: string; title: string; canBack: boolean; canForward: boolean; loading: boolean } = {
    available: false,
    url: '',
    title: '',
    canBack: false,
    canForward: false,
    loading: false,
  };
  private readonly browserPending = new Map<string, { resolve: (v: Record<string, unknown>) => void; timer: NodeJS.Timeout }>();

  private browserImpl(): BrowserBridge {
    if (this.config.browser) return this.config.browser;
    const send = (action: string, payload: Record<string, unknown> = {}): Promise<Record<string, unknown>> => {
      if (this.browserSubs.size === 0) {
        return Promise.reject(new Error('no in-app browser connected — open the desktop app (npm run app)'));
      }
      const id = shortId('bcmd');
      return new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.browserPending.delete(id);
          reject(new Error('the in-app browser did not respond (is the Hermes window open?)'));
        }, 30000);
        this.browserPending.set(id, { resolve, timer });
        for (const sub of this.browserSubs) sub({ id, action, ...payload });
      });
    };
    const stateOf = (r: Record<string, unknown>): BrowserState => {
      const st = (r['state'] ?? {}) as Partial<BrowserState>;
      return {
        available: true,
        url: String(st.url ?? ''),
        title: String(st.title ?? ''),
        canBack: Boolean(st.canBack),
        canForward: Boolean(st.canForward),
        loading: Boolean(st.loading),
      };
    };
    return {
      available: () => this.browserSubs.size > 0,
      state: () => ({ ...this.browserState, available: this.browserSubs.size > 0 }),
      navigate: async (url) => stateOf(await send('navigate', { url })),
      back: async () => stateOf(await send('back')),
      forward: async () => stateOf(await send('forward')),
      reload: async () => stateOf(await send('reload')),
      click: async (x, y) => stateOf(await send('click', { x, y })),
      type: async (text) => stateOf(await send('type', { text })),
      screenshot: async () => {
        const r = await send('screenshot');
        return { pngBase64: String(r['pngBase64'] ?? ''), state: stateOf(r) };
      },
    };
  }

  private db(): SessionStore {
    if (!this.store) this.store = new SessionStore();
    return this.store;
  }

  constructor(config: HermesServerConfig) {
    this.config = config;
  }

  private projectRoot(): string | undefined {
    try {
      return ProjectGuard.detect(this.config.cwd).lock.repoRoot;
    } catch {
      return undefined;
    }
  }

  private resolveTaskRoot(taskId: string, queryPath?: string | null): string | undefined {
    const candidates: (string | undefined)[] = [queryPath ?? undefined];
    for (const s of this.sessions.values()) {
      if (s.taskId === taskId) candidates.push(s.projectPath);
    }
    candidates.push(this.config.cwd);
    for (const c of candidates) {
      if (!c) continue;
      try {
        return ProjectGuard.detect(c).lock.repoRoot;
      } catch {
        /* try next candidate */
      }
    }
    return undefined;
  }

  private loadRegistry(): {
    runId: string;
    taskId?: string;
    goal: string;
    project?: string;
    projectPath?: string;
    startedAt: string;
    status: string;
    events?: { i: number; t: string; text: string }[];
  }[] {
    return this.db()
      .listSessions()
      .map((s) => ({ ...s, events: this.db().eventsFor(s.runId) }));
  }

  private saveRegistry(): void {
    for (const s of this.sessions.values()) {
      this.db().upsertSession({
        runId: s.runId,
        taskId: s.taskId,
        goal: s.goal,
        project: s.project,
        projectPath: s.projectPath,
        startedAt: s.startedAt,
        status: s.status,
      });
    }
  }

  async start(): Promise<number> {
    ensureHermesHome();
    const server = http.createServer((req, res) => {
      this.route(req, res).catch((err) => {
        const msg = (err as Error).message;
        let status = 500;
        if (msg === 'Body too large') status = 413;
        else if (msg === 'Invalid JSON body' || msg === 'Content-Type must be application/json') status = 400;
        if (res.headersSent) {
          res.destroy();
          return;
        }
        this.sendJson(res, status, { error: msg });
      });
    });
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error): void => reject(err);
      server.once('error', onError);
      server.listen(this.config.port ?? 8321, this.config.host ?? '127.0.0.1', () => {
        server.removeListener('error', onError);
        resolve();
      });
    });
    this.server = server;
    const root = this.projectRoot();
    if (root) {
      this.cronStore = CronStore.forProject(root);
      this.scheduler = new CronScheduler(this.cronStore, (job) => this.startCronRun(root, job));
      this.scheduler.start();
    }
    for (const entry of this.loadRegistry()) {
      if (this.sessions.has(entry.runId)) continue;
      let status: RunSession['status'] = entry.status as RunSession['status'];
      if (status !== 'completed' && status !== 'blocked' && status !== 'failed') status = 'blocked';
      this.sessions.set(entry.runId, {
        runId: entry.runId,
        goal: entry.goal,
        status,
        startedAt: entry.startedAt,
        taskId: entry.taskId,
        project: entry.project,
        projectPath: entry.projectPath,
        events: Array.isArray(entry.events) ? entry.events : [],
        subscribers: new Set(),
        approvals: new Map(),
      });
    }
    return (server.address() as AddressInfo).port;
  }

  async stop(): Promise<void> {
    this.scheduler?.stop();
    if (!this.server) return;
    await new Promise<void>((resolve, reject) => {
      this.server!.close((err) => (err ? reject(err) : resolve()));
    });
    this.server = undefined;
  }

  private async startCronRun(root: string, job: CronJob): Promise<string | undefined> {
    let llm: LlmClient;
    try {
      llm = this.config.llm ?? resolveLlm({}).client;
    } catch {
      return undefined;
    }
    const session: RunSession = {
      runId: shortId('run'),
      goal: `[cron ${job.every}] ${job.goal}`,
      status: 'running',
      startedAt: nowIso(),
      projectPath: root,
      events: [],
      subscribers: new Set(),
      approvals: new Map(),
    };
    this.sessions.set(session.runId, session);
    this.saveRegistry();
    this.pushEvent(session, `cron job ${job.id} triggered (${job.every})`);
    await this.executeRun(session, llm, { goal: job.goal, mode: 'standard', review: false, projectPath: root });
    return session.runId;
  }

  private sendJson(res: http.ServerResponse, status: number, body: unknown): void {
    const data = JSON.stringify(body);
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(data);
  }

  private async readBody(req: http.IncomingMessage, maxBytes = 1_000_000): Promise<Record<string, unknown>> {
    const contentType = (req.headers['content-type'] ?? '').split(';')[0]!.trim().toLowerCase();
    if (contentType && contentType !== 'application/json') {
      throw new Error('Content-Type must be application/json');
    }
    let size = 0;
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > maxBytes) throw new Error('Body too large');
      chunks.push(chunk as Buffer);
    }
    if (chunks.length === 0) return {};
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
    } catch {
      throw new Error('Invalid JSON body');
    }
  }

  private isSameOrigin(req: http.IncomingMessage): boolean {
    const origin = req.headers['origin'];
    if (origin === undefined) return true;
    if (typeof origin !== 'string' || origin === '' || origin === 'null') return false;
    const host = req.headers['host'];
    if (!host) return false;
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
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
      project: s.project,
      provider: s.provider,
      model: s.model,
      pendingApprovals: [...s.approvals.values()].map(({ id, tool, why, summary, requestedAt }) => ({ id, tool, why, summary, requestedAt })),
      pendingPlanReview: s.planReview
        ? { id: s.planReview.id, criteria: s.planReview.criteria, steps: s.planReview.steps, requestedAt: s.planReview.requestedAt }
        : undefined,
      pendingQuestions: s.questions
        ? { id: s.questions.id, questions: s.questions.questions, requestedAt: s.questions.requestedAt }
        : undefined,
      report: s.report,
      error: s.error,
    };
  }

  private pushEvent(s: RunSession, text: string): void {
    const ev = { i: s.events.length, t: nowIso(), text };
    s.events.push(ev);
    if (!text.startsWith('tdelta')) {
      try {
        this.db().addEvent(s.runId, ev);
        this.db().upsertSession({
          runId: s.runId,
          taskId: s.taskId,
          goal: s.goal,
          project: s.project,
          projectPath: s.projectPath,
          startedAt: s.startedAt,
          status: s.status,
        });
      } catch {
        /* persistence must never break the run */
      }
    }
    for (const send of s.subscribers) send(ev);
  }

  private async route(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const method = req.method ?? 'GET';

    if (method !== 'GET' && method !== 'HEAD' && !this.isSameOrigin(req)) {
      this.sendJson(res, 403, { error: 'cross-origin request rejected' });
      return;
    }

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

    if (method === 'GET' && path === '/api/home') {
      const home = ensureHermesHome();
      const settings = loadWorkspaceSettings();
      this.sendJson(res, 200, {
        ...home,
        projectsPath: projectsDir(),
        customProjectsPath: settings.projectsPath ? !isDriveRoot(settings.projectsPath) : false,
      });
      return;
    }

    if (method === 'POST' && path === '/api/home/workspace') {
      const body = await this.readBody(req);
      const projectsPath = typeof body['projectsPath'] === 'string' ? body['projectsPath'].trim() : '';
      if (!projectsPath) {
        saveWorkspaceSettings({});
        this.sendJson(res, 200, { ok: true, projectsPath: projectsDir() });
        return;
      }
      if (isDriveRoot(projectsPath)) {
        this.sendJson(res, 400, { error: 'The workspace cannot be a drive root — pick a folder like <home>/Projects' });
        return;
      }
      saveWorkspaceSettings({ projectsPath });
      this.sendJson(res, 200, { ok: true, projectsPath: projectsDir() });
      return;
    }

    if (method === 'POST' && path === '/api/projects') {
      const body = await this.readBody(req);
      try {
        const created = createProject(String(body['name'] ?? ''));
        this.sendJson(res, 200, created);
      } catch (err) {
        this.sendJson(res, 400, { error: (err as Error).message });
      }
      return;
    }

    if (method === 'DELETE' && path === '/api/projects') {
      const body = await this.readBody(req);
      const projectPath = typeof body['path'] === 'string' && body['path'] ? nodePath.resolve(String(body['path'])) : undefined;
      const name = typeof body['name'] === 'string' && body['name'] ? String(body['name']) : undefined;
      if (!projectPath && !name) {
        this.sendJson(res, 400, { error: 'path or name is required' });
        return;
      }
      const deleteFiles = body['deleteFiles'] === true;
      if (deleteFiles) {
        if (!projectPath) {
          this.sendJson(res, 400, { error: 'path is required to delete files' });
          return;
        }
        const base = projectsDir();
        if (!(projectPath.startsWith(base + nodePath.sep) || projectPath === base)) {
          this.sendJson(res, 400, { error: 'only projects inside the Hermes Projects folder can have their files deleted' });
          return;
        }
      }
      for (const [runId, s] of [...this.sessions.entries()]) {
        if ((projectPath && s.projectPath === projectPath) || (name && s.project === name)) {
          this.sessions.delete(runId);
        }
      }
      const removed = this.db().deleteSessionsForProject({ path: projectPath, name });
      if (deleteFiles && projectPath) {
        try {
          rmSync(projectPath, { recursive: true, force: true });
        } catch (err) {
          this.sendJson(res, 200, { ok: true, removedSessions: removed, filesDeleted: false, error: (err as Error).message });
          return;
        }
      }
      this.saveRegistry();
      this.sendJson(res, 200, { ok: true, removedSessions: removed, filesDeleted: deleteFiles && Boolean(projectPath) });
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
          return {
            id: spec.id,
            label: spec.label,
            defaultModel: spec.defaultModel,
            hasKey: Boolean(keyInfo),
            live,
            models: models.map((id) => ({ id, vision: modelSupportsImages(id) })),
            effortLevels: spec.effortLevels,
            keyEnvVars: spec.keyEnvVars,
            baseUrl: spec.baseUrl,
          };
        }),
      );
      const withKey = providers.find((p) => p.hasKey);
      this.sendJson(res, 200, { providers, defaultProvider: withKey?.id ?? 'alibaba' });
      return;
    }

    if (method === 'GET' && path === '/api/browser') {
      const b = this.browserImpl();
      this.sendJson(res, 200, { has: b.available(), state: b.state() });
      return;
    }

    if (method === 'GET' && path === '/api/browser/stream') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      });
      const safeWrite = (data: string): void => {
        if (res.writableEnded || res.destroyed) return;
        try {
          res.write(data);
        } catch {
          /* socket gone */
        }
      };
      const sub = (msg: Record<string, unknown>): void => safeWrite(`data: ${JSON.stringify(msg)}\n\n`);
      this.browserSubs.add(sub);
      safeWrite(`data: ${JSON.stringify({ hello: true })}\n\n`);
      const heartbeat = setInterval(() => safeWrite(': hb\n\n'), 15000);
      const cleanup = (): void => {
        clearInterval(heartbeat);
        this.browserSubs.delete(sub);
      };
      req.on('close', cleanup);
      res.on('error', cleanup);
      res.on('close', cleanup);
      return;
    }

    if (method === 'POST' && path === '/api/browser/state') {
      const body = await this.readBody(req);
      this.browserState = {
        available: true,
        url: String(body['url'] ?? ''),
        title: String(body['title'] ?? ''),
        canBack: Boolean(body['canBack']),
        canForward: Boolean(body['canForward']),
        loading: Boolean(body['loading']),
      };
      this.sendJson(res, 200, { ok: true });
      return;
    }

    if (method === 'POST' && path === '/api/browser/result') {
      const body = await this.readBody(req, 20_000_000);
      const id = String(body['id'] ?? '');
      const pending = this.browserPending.get(id);
      if (!pending) {
        this.sendJson(res, 404, { error: 'unknown browser command id' });
        return;
      }
      clearTimeout(pending.timer);
      this.browserPending.delete(id);
      if (body['ok'] === false) pending.resolve({ error: String(body['error'] ?? 'browser error') });
      else pending.resolve(body as Record<string, unknown>);
      this.sendJson(res, 200, { ok: true });
      return;
    }

    const browserMatch = path.match(/^\/api\/browser\/(navigate|back|forward|reload|screenshot|click|type)$/);
    if (browserMatch) {
      const b = this.browserImpl();
      if (!b.available()) {
        this.sendJson(res, 503, { error: 'no in-app browser connected — run the desktop app (npm run app)' });
        return;
      }
      try {
        const body = browserMatch[1] === 'navigate' || browserMatch[1] === 'click' || browserMatch[1] === 'type' ? await this.readBody(req) : {};
        if (browserMatch[1] === 'screenshot') {
          this.sendJson(res, 200, await b.screenshot());
        } else if (browserMatch[1] === 'navigate') {
          this.sendJson(res, 200, await b.navigate(String(body['url'] ?? '')));
        } else if (browserMatch[1] === 'back') {
          this.sendJson(res, 200, await b.back());
        } else if (browserMatch[1] === 'forward') {
          this.sendJson(res, 200, await b.forward());
        } else if (browserMatch[1] === 'click') {
          this.sendJson(res, 200, await b.click(Number(body['x'] ?? 0), Number(body['y'] ?? 0)));
        } else if (browserMatch[1] === 'type') {
          this.sendJson(res, 200, await b.type(String(body['text'] ?? '')));
        } else {
          this.sendJson(res, 200, await b.reload());
        }
      } catch (err) {
        this.sendJson(res, 400, { error: (err as Error).message });
      }
      return;
    }

    const skillsMatch = path.match(/^\/api\/skills(?:\/([\w-]+))?$/);
    if (skillsMatch) {
      const root = this.projectRoot();
      if (!root) {
        this.sendJson(res, 400, { error: 'no project detected' });
        return;
      }
      const store = SkillStore.forProject(root);
      if (method === 'GET') {
        this.sendJson(res, 200, { skills: store.list() });
        return;
      }
      if (method === 'POST') {
        const body = await this.readBody(req);
        try {
          if (skillsMatch[1]) {
            const skill = store.update(skillsMatch[1], {
              description: typeof body['description'] === 'string' ? body['description'] : undefined,
              instructions: typeof body['instructions'] === 'string' ? body['instructions'] : undefined,
            });
            this.sendJson(res, 200, { ok: true, skill });
          } else {
            const skill = store.create({
              name: String(body['name'] ?? ''),
              description: String(body['description'] ?? ''),
              instructions: String(body['instructions'] ?? ''),
              createdBy: 'user',
            });
            this.sendJson(res, 200, { ok: true, skill });
          }
        } catch (err) {
          this.sendJson(res, 400, { error: (err as Error).message });
        }
        return;
      }
      if (method === 'DELETE' && skillsMatch[1]) {
        this.sendJson(res, 200, { ok: store.remove(skillsMatch[1]) });
        return;
      }
    }

    const mcpMatch = path.match(/^\/api\/mcp(?:\/([\w-]+))?$/);
    if (mcpMatch) {
      const root = this.projectRoot();
      if (!root) {
        this.sendJson(res, 400, { error: 'no project detected' });
        return;
      }
      const manager = McpManager.forProject(root);
      if (method === 'GET') {
        const tools = await manager.listAllTools();
        this.sendJson(res, 200, { servers: manager.servers(), tools });
        return;
      }
      if (method === 'POST') {
        const body = await this.readBody(req);
        const name = String(body['name'] ?? '').trim();
        const command = String(body['command'] ?? '').trim();
        if (!name || !command) {
          this.sendJson(res, 400, { error: 'name and command are required' });
          return;
        }
        const args = Array.isArray(body['args']) ? (body['args'] as unknown[]).map(String) : [];
        manager.addServer({ name, command, args });
        this.sendJson(res, 200, { ok: true, servers: manager.servers() });
        return;
      }
      if (method === 'DELETE' && mcpMatch[1]) {
        this.sendJson(res, 200, { ok: true, servers: manager.removeServer(mcpMatch[1]) });
        return;
      }
    }

    const cronMatch = path.match(/^\/api\/cron(?:\/([\w-]+))?$/);
    if (cronMatch) {
      const root = this.projectRoot();
      if (!root) {
        this.sendJson(res, 400, { error: 'no project detected' });
        return;
      }
      const store = CronStore.forProject(root);
      if (method === 'GET') {
        this.sendJson(res, 200, { jobs: store.jobs() });
        return;
      }
      if (method === 'POST') {
        const body = await this.readBody(req);
        try {
          const job = store.add({ every: String(body['every'] ?? ''), goal: String(body['goal'] ?? '') });
          this.sendJson(res, 200, { ok: true, job });
        } catch (err) {
          this.sendJson(res, 400, { error: (err as Error).message });
        }
        return;
      }
      if (method === 'DELETE' && cronMatch[1]) {
        this.sendJson(res, 200, { ok: true, jobs: store.remove(cronMatch[1]) });
        return;
      }
    }

    const allowedKeyVars = new Set<string>([
      ...Object.values(PROVIDERS).flatMap((s) => s.keyEnvVars),
      'HERMES_API_KEY',
      'OPENAI_API_KEY',
    ]);

    if (method === 'GET' && path === '/api/keys') {
      this.sendJson(res, 200, { stored: storedKeyVars() });
      return;
    }

    if (method === 'POST' && path === '/api/keys') {
      const body = await this.readBody(req);
      const envVar = String(body['envVar'] ?? '');
      const key = String(body['key'] ?? '').trim();
      if (!allowedKeyVars.has(envVar)) {
        this.sendJson(res, 400, { error: 'unknown provider key' });
        return;
      }
      if (!key) {
        this.sendJson(res, 400, { error: 'key is required' });
        return;
      }
      setStoredKey(envVar, key);
      this.sendJson(res, 200, { ok: true });
      return;
    }

    const keyMatch = path.match(/^\/api\/keys\/([A-Z0-9_]+)$/);
    if (method === 'DELETE' && keyMatch) {
      const envVar = keyMatch[1]!;
      if (!allowedKeyVars.has(envVar)) {
        this.sendJson(res, 400, { error: 'unknown provider key' });
        return;
      }
      removeStoredKey(envVar);
      this.sendJson(res, 200, { ok: true });
      return;
    }

    if (method === 'GET' && path === '/api/browse') {
      const requestedRaw = (url.searchParams.get('path') ?? '').trim();
      try {
        let requested = requestedRaw;
        if (requested && !nodePath.isAbsolute(requested)) requested = '';
        if (!requested) {
          if (process.platform === 'win32') {
            const drives: string[] = [];
            for (let i = 65; i <= 90; i++) {
              const letter = String.fromCharCode(i);
              if (existsSync(`${letter}:\\`)) drives.push(`${letter}:\\`);
            }
            this.sendJson(res, 200, { path: '', parent: '', dirs: drives, isProject: false, atRoot: true });
            return;
          }
          requested = '/';
        }
        const abs = nodePath.resolve(requested);
        const st = statSync(abs);
        if (!st.isDirectory()) {
          this.sendJson(res, 400, { error: 'not a directory' });
          return;
        }
        const entries = readdirSync(abs, { withFileTypes: true });
        const dirs = entries
          .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
          .map((d) => d.name)
          .sort((a, b) => a.localeCompare(b));
        const parent = nodePath.dirname(abs);
        const markers = ['package.json', 'pyproject.toml', 'cargo.toml', 'go.mod', 'pom.xml', '.git'];
        const isProject = markers.some((m) => existsSync(nodePath.join(abs, m)));
        this.sendJson(res, 200, {
          path: abs,
          parent: parent === abs ? '' : parent,
          dirs,
          isProject,
          atRoot: false,
        });
      } catch (err) {
        this.sendJson(res, 400, { error: (err as Error).message });
      }
      return;
    }

    if (method === 'GET' && path === '/api/files') {
      try {
        const guard = ProjectGuard.detect(this.config.cwd);
        const { readdirSync, statSync } = await import('node:fs');
        const files: string[] = [];
        const walk = (dir: string, depth: number): void => {
          if (depth > 5 || files.length >= 300) return;
          let entries: string[];
          try {
            entries = readdirSync(dir);
          } catch {
            return;
          }
          for (const name of entries.sort()) {
            if (files.length >= 300) return;
            if (guard.lock.ignorePaths.includes(name) || name.startsWith('.')) continue;
            const full = nodePath.join(dir, name);
            let st;
            try {
              st = statSync(full);
            } catch {
              continue;
            }
            const rel = guard.toRelative(full);
            if (st.isDirectory()) {
              walk(full, depth + 1);
            } else {
              files.push(rel);
            }
          }
        };
        walk(guard.lock.repoRoot, 0);
        this.sendJson(res, 200, { files });
      } catch {
        this.sendJson(res, 200, { files: [] });
      }
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
      const root = this.resolveTaskRoot(taskMatch[1]!, url.searchParams.get('path'));
      const ledger = root ? TaskLedger.load(root, taskMatch[1]!) : undefined;
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
      const body = await this.readBody(req, 12_000_000);
      const goal = typeof body['goal'] === 'string' ? body['goal'].trim() : '';
      if (!goal) {
        this.sendJson(res, 400, { error: 'goal is required' });
        return;
      }
      const criteria = Array.isArray(body['criteria']) ? (body['criteria'] as unknown[]).map(String).filter(Boolean) : undefined;
      const scope = Array.isArray(body['scope']) ? (body['scope'] as unknown[]).map(String).filter(Boolean) : undefined;
      const constraints = Array.isArray(body['constraints']) ? (body['constraints'] as unknown[]).map(String).filter(Boolean) : undefined;
      const provider = typeof body['provider'] === 'string' ? body['provider'] : undefined;
      const model = typeof body['model'] === 'string' ? body['model'] : undefined;
      const mode = body['mode'] === 'fast' ? 'fast' : body['mode'] === 'chat' ? 'chat' : 'standard';
      const autoApprove = body['autoApprove'] === true;
      const effort = body['effort'] === 'low' || body['effort'] === 'medium' || body['effort'] === 'high' || body['effort'] === 'max' ? body['effort'] : undefined;
      const projectPath = typeof body['projectPath'] === 'string' && body['projectPath'].trim() ? body['projectPath'].trim() : undefined;
      const review = body['review'] !== false;

      const images = Array.isArray(body['images'])
        ? (body['images'] as Record<string, unknown>[])
            .map((im) => ({ name: String(im['name'] ?? 'image'), dataUrl: String(im['dataUrl'] ?? '') }))
            .filter((im) => im.dataUrl.startsWith('data:image/'))
            .slice(0, 4)
        : undefined;
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
        taskId: undefined,
        provider: resolvedInfo?.providerId ?? (provider ? String(provider) : undefined),
        model: resolvedInfo?.model ?? model,
        projectPath,
        events: [],
        subscribers: new Set(),
        approvals: new Map(),
      };
    this.sessions.set(session.runId, session);
    this.saveRegistry();
    this.sendJson(res, 202, { runId: session.runId });
      void this.executeRun(session, llm!, { goal, criteria, mode, review, scope, constraints, effort, projectPath, autoApprove, images, model: resolvedInfo?.model ?? model });
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
      const safeWrite = (data: string): void => {
        if (res.writableEnded || res.destroyed) return;
        try {
          res.write(data);
        } catch {
          /* socket already gone */
        }
      };
      for (const ev of session.events) safeWrite(`data: ${JSON.stringify(ev)}\n\n`);
      const send = (ev: { i: number; t: string; text: string }): void => {
        safeWrite(`data: ${JSON.stringify(ev)}\n\n`);
      };
      session.subscribers.add(send);
      const heartbeat = setInterval(() => safeWrite(': hb\n\n'), 15000);
      const cleanup = (): void => {
        clearInterval(heartbeat);
        session.subscribers.delete(send);
      };
      req.on('close', cleanup);
      res.on('error', cleanup);
      res.on('close', cleanup);
      return;
    }

    const answersMatch = path.match(/^\/api\/answers\/([\w-]+)$/);
    if (method === 'POST' && answersMatch) {
      const body = await this.readBody(req);
      for (const session of this.sessions.values()) {
        if (session.questions && session.questions.id === answersMatch[1]) {
          const waiter = session.questions;
          session.questions = undefined;
          const answer = typeof body['answer'] === 'string' ? body['answer'] : '';
          this.pushEvent(session, 'ask-user answered by user');
          waiter.resolve(answer);
          this.sendJson(res, 200, { ok: true });
          return;
        }
      }
      this.sendJson(res, 404, { error: 'question not found or already answered' });
      return;
    }

    const stopMatch = path.match(/^\/api\/runs\/([\w-]+)\/stop$/);
    if (method === 'POST' && stopMatch) {
      const session = this.sessions.get(stopMatch[1]!);
      if (!session) {
        this.sendJson(res, 404, { error: 'run not found' });
        return;
      }
      session.hermes?.stop();
      this.pushEvent(session, 'stopped by user');
      this.sendJson(res, 200, { ok: true });
      return;
    }

    const messageMatch = path.match(/^\/api\/runs\/([\w-]+)\/message$/);
    if (method === 'POST' && messageMatch) {
      const session = this.sessions.get(messageMatch[1]!);
      if (!session) {
        this.sendJson(res, 404, { error: 'run not found' });
        return;
      }
      const body = await this.readBody(req, 12_000_000);
      const text = typeof body['text'] === 'string' ? body['text'].trim() : '';
      if (!text) {
        this.sendJson(res, 400, { error: 'text is required' });
        return;
      }
      const images = Array.isArray(body['images'])
        ? (body['images'] as Record<string, unknown>[])
            .map((im) => ({ name: String(im['name'] ?? 'image'), dataUrl: String(im['dataUrl'] ?? '') }))
            .filter((im) => im.dataUrl.startsWith('data:image/'))
            .slice(0, 4)
        : undefined;
      if (session.status === 'running') {
        session.hermes?.queueMessage(text);
        this.pushEvent(session, `queued  "${text}" — will be delivered to the agent at the next step`);
        this.sendJson(res, 200, { ok: true, queued: true });
        return;
      }
      if (!session.taskId) {
        this.sendJson(res, 409, { error: 'run has no task yet' });
        return;
      }
      let llm = this.config.llm;
      if (!llm) {
        try {
          llm = resolveLlm({}).client;
        } catch (err) {
          if (err instanceof ProviderError) {
            this.sendJson(res, 400, { error: err.message });
            return;
          }
          throw err;
        }
      }
      session.status = 'running';
      session.report = undefined;
      session.finishedAt = undefined;
      this.pushEvent(session, `user-msg ${text}`);
      this.pushEvent(session, `continue — resuming this session`);
      void this.executeRun(session, llm, {
        goal: session.goal,
        mode: 'standard',
        review: false,
        projectPath: session.projectPath,
        resume: { taskId: session.taskId, message: text },
        images,
        model: session.model,
      });
      this.sendJson(res, 200, { ok: true, resumed: true });
      return;
    }

    const planReviewMatch = path.match(/^\/api\/plan-review\/([\w-]+)$/);
    if (method === 'POST' && planReviewMatch) {
      const body = await this.readBody(req);
      for (const session of this.sessions.values()) {
        if (session.planReview && session.planReview.id === planReviewMatch[1]) {
          const waiter = session.planReview;
          session.planReview = undefined;
          const steps = Array.isArray(body['steps'])
            ? (body['steps'] as Record<string, unknown>[])
                .map((s) => ({ description: String(s['description'] ?? '').trim(), verification: String(s['verification'] ?? 'manual check').trim() }))
                .filter((s) => s.description)
            : undefined;
          const criteria = Array.isArray(body['criteria'])
            ? (body['criteria'] as unknown[]).map(String).map((s) => s.trim()).filter(Boolean)
            : undefined;
          const decision = {
            approved: body['approved'] === true,
            note: typeof body['note'] === 'string' ? body['note'] : undefined,
            criteria,
            steps,
          };
          this.pushEvent(session, decision.approved ? 'plan-review approved — building' : 'plan-review changes requested');
          waiter.resolve(decision);
          this.sendJson(res, 200, { ok: true });
          return;
        }
      }
      this.sendJson(res, 404, { error: 'plan review not found or already resolved' });
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
    opts: {
      goal: string;
      criteria?: string[];
      mode: 'fast' | 'standard' | 'chat';
      review?: boolean;
      scope?: string[];
      constraints?: string[];
      effort?: 'low' | 'medium' | 'high' | 'max';
      projectPath?: string;
      resume?: { taskId: string; message: string };
      autoApprove?: boolean;
      images?: { name: string; dataUrl: string }[];
      model?: string;
    },
  ): Promise<void> {
    let root: string;
    try {
      root = ProjectGuard.detect(opts.projectPath ?? this.config.cwd).lock.repoRoot;
    } catch {
      root = this.config.cwd;
    }
    const skills = SkillStore.forProject(root);
    const mcp = McpManager.forProject(root);
    session.project = root.split(/[\\/]/).filter(Boolean).pop();
    const hermes = new Hermes({
      cwd: opts.projectPath ?? this.config.cwd,
      llm,
      mode: opts.mode,
      autoApprove: opts.autoApprove ?? false,
      criteria: opts.criteria,
      scopeFiles: opts.scope,
      extraConstraints: opts.constraints,
      effort: opts.effort,
      skills,
      mcp,
      resume: opts.resume,
      browser: this.browserImpl(),
      images: opts.images,
      supportsImages: modelSupportsImages(opts.model ?? session.model ?? ''),
      askUserHandler: (questions) =>
        new Promise<string>((resolve) => {
          const waiter: QuestionsWaiter = { id: shortId('q'), questions, requestedAt: nowIso(), resolve };
          session.questions = waiter;
          this.pushEvent(session, `ask-user waiting for your answers`);
          setTimeout(() => {
            if (session.questions === waiter) {
              session.questions = undefined;
              this.pushEvent(session, 'ask-user timed out — agent will assume defaults');
              resolve('(no answer — proceed with reasonable defaults)');
            }
          }, this.config.approvalTimeoutMs ?? APPROVAL_TIMEOUT_MS);
        }),
      requirePlanReview: opts.review ?? true,
      planReviewHandler: (input) =>
        new Promise((resolve) => {
          const waiter: PlanReviewWaiter = {
            id: shortId('pr'),
            criteria: input.criteria,
            steps: input.steps,
            requestedAt: nowIso(),
            resolve,
          };
          session.planReview = waiter;
          this.pushEvent(session, `plan-review ${waiter.id} waiting for your review`);
          setTimeout(() => {
            if (session.planReview === waiter) {
              session.planReview = undefined;
              this.pushEvent(session, `plan-review ${waiter.id} timed out — treating as denied`);
              resolve({ approved: false, note: 'Plan review timed out.' });
            }
          }, this.config.approvalTimeoutMs ?? APPROVAL_TIMEOUT_MS);
        }),
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
        const ledgerMatch = text.match(/ledger\s+(?:created|resumed):\s+(\S+)/);
        if (ledgerMatch) session.taskId = ledgerMatch[1];
        this.pushEvent(session, text);
      },
    });
    session.hermes = hermes;

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
      this.saveRegistry();
    }
  }
}

export function renderReportText(report: CompletionReport): string {
  return new Reporter().render(report);
}
