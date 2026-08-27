import http from 'node:http';
import os from 'node:os';
import { appendFileSync, copyFileSync, cpSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync } from 'node:fs';
import nodePath from 'node:path';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

const VENDOR_THREE = nodePath.join(
  nodePath.dirname(fileURLToPath(import.meta.url)),
  '../../node_modules/three/build/three.module.min.js',
);
// Bundled UI fonts (Inter + JetBrains Mono, latin subset). Resolved relative
// to the compiled file so it works from dist/, from tsx src/, and inside the
// packaged app (assets/** is shipped by electron-builder).
const FONTS_DIR = nodePath.join(nodePath.dirname(fileURLToPath(import.meta.url)), '../../assets/fonts');
const FONT_FILES: Record<string, string> = {
  'inter-latin-400-normal.woff2': 'font/woff2',
  'inter-latin-500-normal.woff2': 'font/woff2',
  'inter-latin-600-normal.woff2': 'font/woff2',
  'jetbrains-mono-latin-400-normal.woff2': 'font/woff2',
  'jetbrains-mono-latin-700-normal.woff2': 'font/woff2',
};
import { Hermes } from '../agent/hermes.js';
import { LspManager } from '../lsp/manager.js';
import { CodeIndex } from '../context/code-index.js';
import { SubAgentRunner } from '../agent/subagent.js';
import { AgentStore } from '../agents/registry.js';
import type { BrowserBridge, BrowserState } from '../browser/browser.js';
import { CronScheduler, CronStore, type CronJob } from '../cron/scheduler.js';
import { ProjectGuard } from '../guard/project-guard.js';
import { gitCommit, gitDiff, gitDiscard, gitInfo, gitInit, gitPush } from '../git/git.js';
import { TaskLedger } from '../ledger/task-ledger.js';
import { gitExec } from '../git/git.js';
import type { LlmClient, LlmMessage, LlmUsage } from '../llm/llm.js';
import { UsageTrackingClient } from '../llm/llm.js';
import { PROVIDERS, ProviderError, cachedLiveModels, fetchModelCatalog, freeModelFallback, isFreeModel, modelCapabilityTier, modelMetadataFor, peekModelCatalog, providerKey, resolveImageSupport, resolveLlm, resolveSupportedImages, usageCostUsd } from '../llm/providers.js';
import { removeStoredKey, setStoredKey, storedKeyVars } from '../llm/keys.js';
import { SessionStore, type SessionUsage } from './session-store.js';
import { McpManager } from '../mcp/client.js';
import { Reporter } from '../report/reporter.js';
import { SkillStore } from '../skills/skills.js';
import type { CompletionReport } from '../types.js';
import { nowIso, shortId } from '../util.js';
import { createProject, ensureHermesHome, hermesHomeRoot, isDriveRoot, loadWorkspaceSettings, projectsDir, saveWorkspaceSettings, updateWorkspaceSettings } from '../workspace/home.js';
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
  projectPath?: string;
  branch?: string;
  worktreePath?: string;
  mode?: 'fast' | 'standard' | 'chat';
  provider?: string;
  model?: string;
  pendingApprovals: PendingApproval[];
  pendingPlanReview?: PendingPlanReview;
  pendingQuestions?: PendingQuestions;
  report?: CompletionReport;
  error?: string;
  usage?: SessionUsage & { costUsd?: number };
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
  branch?: string;
  worktreePath?: string;
  mode?: 'fast' | 'standard' | 'chat';
  provider?: string;
  model?: string;
  autoApprove?: boolean;
  events: { i: number; t: string; text: string }[];
  subscribers: Set<(ev: { i: number; t: string; text: string }) => void>;
  approvals: Map<string, ApprovalWaiter>;
  planReview?: PlanReviewWaiter;
  questions?: QuestionsWaiter;
  hermes?: InstanceType<typeof Hermes>;
  /** LSP servers are kept alive for the whole session (across continuations). */
  lsp?: LspManager;
  report?: CompletionReport;
  error?: string;
  usage?: SessionUsage;
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
  private readonly indexWatchers = new Map<string, CodeIndex>();
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
        driving: Boolean(st.driving),
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

  /**
   * Dedicated persistent git worktree for one session's bound branch, so an
   * older session can be resumed without moving the branch of the shared
   * checkout (which would detach whichever session owned it). The .hermes state
   * directory is linked into the worktree so the existing task ledger stays the
   * single source of truth; node_modules and .env are linked/copied so
   * verification commands behave like they did in the main checkout.
   * Returns undefined when git worktrees are unavailable or the branch is gone.
   */
  private async ensureSessionWorktree(repoRoot: string, taskId: string, branch: string): Promise<string | undefined> {
    if (!taskId || !branch) return undefined;
    const branchExists = await gitExec(repoRoot, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).then(
      () => true,
      () => false,
    );
    if (!branchExists) return undefined;
    // Keep agent state out of git status in the main checkout AND in every
    // worktree (worktrees share the common git dir), without touching the
    // user's tracked .gitignore.
    try {
      const exclude = nodePath.join(repoRoot, '.git', 'info', 'exclude');
      mkdirSync(nodePath.dirname(exclude), { recursive: true });
      let content = '';
      try {
        content = readFileSync(exclude, 'utf8');
      } catch {
        /* new exclude file */
      }
      if (!/^\.hermes\/?\s*$/m.test(content)) appendFileSync(exclude, `${content && !content.endsWith('\n') ? '\n' : ''}.hermes/\n`);
    } catch {
      /* best effort */
    }
    const wtDir = nodePath.join(repoRoot, '.hermes', 'worktrees', taskId);
    try {
      const list = await gitExec(repoRoot, ['worktree', 'list', '--porcelain']);
      const registered = list.split(/\r?\n/).some(
        (line) =>
          line.startsWith('worktree ') &&
          nodePath.resolve(line.slice('worktree '.length)).toLowerCase() === nodePath.resolve(wtDir).toLowerCase(),
      );
      if (!registered) {
        mkdirSync(nodePath.dirname(wtDir), { recursive: true });
        await gitExec(repoRoot, ['worktree', 'add', wtDir, branch]);
      }
    } catch {
      return undefined;
    }
    if (!existsSync(wtDir)) return undefined;
    this.linkWorkspaceIntoWorktree(repoRoot, wtDir);
    return wtDir;
  }

  /** Share agent state and environment into a session worktree: .hermes is
   *  linked (single ledger source of truth), node_modules is linked when the
   *  main checkout has one, .env is copied. All best-effort — a worktree with
   *  none of these still works for chat-style continuations. */
  private linkWorkspaceIntoWorktree(repoRoot: string, wtDir: string): void {
    const ensureLink = (target: string, at: string, fallbackCopy: boolean): void => {
      if (!existsSync(target) || existsSync(at)) return;
      try {
        symlinkSync(target, at, process.platform === 'win32' ? 'junction' : 'dir');
      } catch {
        if (!fallbackCopy) return;
        try {
          cpSync(target, at, { recursive: true });
        } catch {
          /* best effort */
        }
      }
    };
    ensureLink(nodePath.join(repoRoot, '.hermes'), nodePath.join(wtDir, '.hermes'), true);
    ensureLink(nodePath.join(repoRoot, 'node_modules'), nodePath.join(wtDir, 'node_modules'), false);
    const envFile = nodePath.join(repoRoot, '.env');
    const wtEnv = nodePath.join(wtDir, '.env');
    if (existsSync(envFile) && !existsSync(wtEnv)) {
      try {
        copyFileSync(envFile, wtEnv);
      } catch {
        /* best effort */
      }
    }
  }

  private loadRegistry() {
    return this.db()
      .listSessions()
      .map((s) => ({ ...s, events: this.db().eventsFor(s.runId) }));
  }

  private saveRegistry(): void {
    for (const s of this.sessions.values()) {
      if (!s.runId) continue;
      this.persistSession(s);
    }
  }

  private persistSession(s: RunSession): void {
    this.db().upsertSession({
      runId: s.runId,
      taskId: s.taskId,
      goal: s.goal,
      project: s.project,
      projectPath: s.projectPath,
      branch: s.branch,
      worktreePath: s.worktreePath,
      startedAt: s.startedAt,
      status: s.status,
      finishedAt: s.finishedAt,
      mode: s.mode,
      provider: s.provider,
      model: s.model,
      report: s.report,
      error: s.error,
      usage: s.usage,
    });
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
      try {
        const lock = ProjectGuard.detect(root).lock;
        this.sharedIndex(lock.repoRoot, lock.ignorePaths);
      } catch {
        /* not a project yet */
      }
    }
    for (const entry of this.loadRegistry()) {
      if (this.sessions.has(entry.runId)) continue;
      let status: RunSession['status'] = entry.status as RunSession['status'];
      const interrupted = status !== 'completed' && status !== 'blocked' && status !== 'failed';
      if (interrupted) status = 'blocked';
      let mode = entry.mode;
      let report = entry.report;
      let finishedAt = entry.finishedAt;
      let branch = entry.branch;
      let worktreePath = entry.worktreePath;
      if (entry.taskId && (!mode || !report || !finishedAt || !branch)) {
        const root = this.resolveTaskRoot(entry.taskId, entry.projectPath);
        const ledger = root ? TaskLedger.load(root, entry.taskId) : undefined;
        mode ??= ledger?.data.mode;
        report ??= ledger?.data.report;
        finishedAt ??= ledger?.data.completedAt;
        branch ??= ledger?.data.gitBranch;
        worktreePath ??= ledger?.data.worktreePath;
      }
      const session: RunSession = {
        runId: entry.runId,
        goal: entry.goal,
        status,
        startedAt: entry.startedAt,
        finishedAt,
        taskId: entry.taskId,
        project: entry.project,
        projectPath: entry.projectPath,
        branch,
        worktreePath,
        mode,
        provider: entry.provider,
        model: entry.model,
        report,
        error: interrupted ? 'Agent Gitu was interrupted by an application restart. Send a message to resume it.' : entry.error,
        usage: entry.usage,
        events: Array.isArray(entry.events) ? entry.events : [],
        subscribers: new Set(),
        approvals: new Map(),
      };
      this.sessions.set(entry.runId, session);
      if (interrupted) this.pushEvent(session, 'application restarted — run paused; send a message to resume');
    }
    return (server.address() as AddressInfo).port;
  }

  async stop(): Promise<void> {
    this.scheduler?.stop();
    for (const idx of this.indexWatchers.values()) {
      idx.stopWatch();
      idx.close();
    }
    this.indexWatchers.clear();
    if (!this.server) return;
    await new Promise<void>((resolve) => {
      // Long-lived SSE streams count as open connections and would otherwise
      // keep close() waiting forever (Ctrl+C hang). Force-close remaining
      // sockets after a grace period instead.
      const timer = setTimeout(() => {
        this.server?.closeAllConnections?.();
      }, 1500);
      timer.unref?.();
      this.server!.close((err) => {
        clearTimeout(timer);
        resolve();
        void err;
      });
    });
    this.server = undefined;
    this.store?.close();
    this.store = undefined;
  }

  /** One watched code index per repo root, kept alive across runs. */
  private sharedIndex(repoRoot: string, ignores?: Iterable<string>): CodeIndex {
    let idx = this.indexWatchers.get(repoRoot);
    if (!idx) {
      idx = new CodeIndex(repoRoot);
      idx.startWatch(ignores);
      this.indexWatchers.set(repoRoot, idx);
    }
    return idx;
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
      mode: 'standard',
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

  /**
   * A Host header is trusted only when it names THIS machine: localhost,
   * an IP literal, or the OS hostname. Comparing Origin against the raw
   * Host header alone is useless under DNS rebinding, where an attacker
   * controls BOTH (evil.com resolves to 127.0.0.1).
   */
  private isTrustedHost(host: string): boolean {
    const name = host.replace(/^\[/, '').replace(/\]:.*$/, '').split(':')[0]?.toLowerCase() ?? '';
    if (!name) return false;
    if (name === 'localhost' || name.endsWith('.localhost')) return true;
    if (name === '::1' || name === '[::1]') return true;
    // Any IP literal (loopback or LAN) — browsers reach local servers by IP.
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name)) return true;
    if (/^[0-9a-f:]+:[0-9a-f:]*$/i.test(name)) return true; // IPv6 literal
    try {
      if (name === os.hostname().toLowerCase()) return true;
    } catch {
      /* hostname unavailable */
    }
    return false;
  }

  private isSameOrigin(req: http.IncomingMessage): boolean {
    const host = req.headers['host'];
    if (!host || typeof host !== 'string' || !this.isTrustedHost(host)) return false;
    const origin = req.headers['origin'];
    if (origin === undefined) return true;
    if (typeof origin !== 'string' || origin === '' || origin === 'null') return false;
    try {
      const parsed = new URL(origin);
      return parsed.host === host && this.isTrustedHost(parsed.host);
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
      projectPath: s.projectPath,
      branch: s.branch,
      worktreePath: s.worktreePath,
      mode: s.mode,
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
      usage: s.usage
        ? {
            ...s.usage,
            costUsd: usageCostUsd(modelMetadataFor(peekModelCatalog(), s.provider ?? '', s.model ?? ''), s.usage),
          }
        : undefined,
    };
  }

  private pushEvent(s: RunSession, text: string, persistDb = true): void {
    // Streaming deltas are intentionally not persisted.  After a restart the
    // in-memory array is therefore sparse, so its length is not a safe event
    // cursor: reusing it can overwrite an old persisted event (including a
    // user message) and make the SSE client skip it.  Keep event ids strictly
    // monotonic from the highest known id instead.
    const ev = { i: s.events.reduce((highest, existing) => Math.max(highest, existing.i), -1) + 1, t: nowIso(), text };
    s.events.push(ev);
    if (persistDb && !text.startsWith('tdelta')) {
      try {
        this.db().addEvent(s.runId, ev);
        this.persistSession(s);
      } catch {
        /* persistence must never break the run */
      }
    }
    for (const send of s.subscribers) send(ev);
  }

  /**
   * A retry or an edited resend replaces the original user message instead of
   * cloning it: drop the durable event for the old message (and refresh the
   * goal when it was the original one) before the new one is recorded.
   */
  private supersedeUserMessage(s: RunSession, oldText: string, newText: string): void {
    const target = `user-msg ${oldText}`;
    for (let i = s.events.length - 1; i >= 0; i--) {
      if (s.events[i]!.text === target) {
        const idx = s.events[i]!.i;
        s.events.splice(i, 1);
        try {
          this.db().deleteEvent(s.runId, idx);
        } catch {
          /* persistence must never break the run */
        }
        break;
      }
    }
    if (s.goal === oldText) {
      s.goal = newText;
      try {
        this.persistSession(s);
      } catch {
        /* persistence must never break the run */
      }
    }
  }

  /**
   * Events are the durable transcript for a session. Turn the user-visible
   * portions back into model messages when a completed/paused run is resumed.
   * Streaming deltas are deliberately not stored, because every completed
   * response also produces one durable `say` event.
   */
  private conversationHistory(s: RunSession): LlmMessage[] {
    const turns: LlmMessage[] = [];
    for (const event of s.events) {
      const text = event.text;
      const user = text.startsWith('user-msg ') ? text.slice('user-msg '.length).trim() : '';
      const assistant = text.startsWith('say ') ? text.slice('say '.length).trim() : '';
      if (!user && !assistant) continue;
      const turn: LlmMessage = user ? { role: 'user', content: user } : { role: 'assistant', content: assistant };
      const previous = turns[turns.length - 1];
      if (previous?.role === turn.role && previous.content === turn.content) continue;
      turns.push(turn);
    }

    const recent = turns.slice(-24);
    let total = recent.reduce((size, turn) => size + (typeof turn.content === 'string' ? turn.content.length : 0), 0);
    while (recent.length > 2 && total > 24_000) {
      const removed = recent.shift()!;
      total -= typeof removed.content === 'string' ? removed.content.length : 0;
    }

    // Prose replay alone leaves a resumed model grounded in its own earlier
    // claims rather than facts. Re-attach a compact digest of the run's actual
    // observations (command output, errors, evidence verdicts) so continuation
    // starts from what happened, not from what was said about it.
    const obsLines: string[] = [];
    for (const event of s.events) {
      if (/^\s*(out|error|evidence|denied|blocked|stall)\b/.test(event.text)) {
        obsLines.push(event.text.replace(/\s+/g, ' ').trim().slice(0, 180));
      }
    }
    if (obsLines.length > 0) {
      recent.push({
        role: 'user',
        content:
          ('COMPACT OBSERVATIONS recorded earlier in this session (grounding for the history above; do not redo this work):\n' +
            obsLines.slice(-40).join('\n')).slice(0, 3000),
      });
    }
    return recent;
  }

  private async route(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const method = req.method ?? 'GET';

    // API surface is protected for ALL methods (GET included — read endpoints
    // enumerate the filesystem), not just writes.
    if ((path.startsWith('/api/') || (method !== 'GET' && method !== 'HEAD')) && !this.isSameOrigin(req)) {
      this.sendJson(res, 403, { error: 'cross-origin request rejected' });
      return;
    }

    if (method === 'GET' && (path === '/' || path === '/index.html')) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(UI_HTML);
      return;
    }

    if (method === 'GET' && path === '/vendor/three.module.js') {
      if (!existsSync(VENDOR_THREE)) {
        this.sendJson(res, 404, { error: 'three.js bundle not installed' });
        return;
      }
      res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'public, max-age=86400' });
      createReadStream(VENDOR_THREE).pipe(res);
      return;
    }

    if (method === 'GET' && path.startsWith('/fonts/')) {
      const fontName = path.slice('/fonts/'.length);
      const contentType = FONT_FILES[fontName];
      const fontPath = contentType ? nodePath.join(FONTS_DIR, fontName) : undefined;
      if (!contentType || !fontPath || !existsSync(fontPath)) {
        this.sendJson(res, 404, { error: 'font not found' });
        return;
      }
      res.writeHead(200, { 'content-type': contentType, 'cache-control': 'public, max-age=31536000, immutable' });
      createReadStream(fontPath).pipe(res);
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
        // The root itself is explicitly EXCLUDED: allowing it made a single
        // request rm -rf every project at once.
        if (!projectPath.startsWith(base + nodePath.sep)) {
          this.sendJson(res, 400, { error: 'only projects inside the Agent Gitu Projects folder can have their files deleted' });
          return;
        }
      }
      for (const [runId, s] of [...this.sessions.entries()]) {
        if ((projectPath && s.projectPath === projectPath) || (name && s.project === name)) {
          // Stop before forgetting: a still-running executeRun would resurrect
          // the session row via its periodic persist calls.
          s.hermes?.stop();
          void s.lsp?.shutdown().catch(() => {});
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
      const catalogPromise = fetchModelCatalog();
      const providerRows = await Promise.all(
        Object.values(PROVIDERS).map(async (spec) => {
          const keyInfo = providerKey(spec);
          const staticInfo = spec.models.map((id) => ({ id }));
          let models: { id: string; vision?: boolean }[] = staticInfo;
          let live = false;
          if (keyInfo || spec.publicModels) {
            // Shared cache — run-time image resolution must see the same
            // modality data this picker reports to the UI.
            const fetched = await cachedLiveModels({
              baseUrl: spec.baseUrl,
              apiKey: keyInfo?.key ?? '',
              timeoutMs: 6000,
            });
            if (fetched && fetched.length > 0) {
              models = fetched;
              live = true;
            }
          }
          return { spec, keyInfo, models, live };
        }),
      );
      const catalog = await catalogPromise;
      const providers = providerRows.map(({ spec, keyInfo, models, live }) => {
        return {
          id: spec.id,
          label: spec.label,
          defaultModel: spec.defaultModel,
          hasKey: Boolean(keyInfo),
          live,
          models: models.map((mi) => ({
            id: mi.id,
            // Provider's own live modality wins; the models.dev catalog and the
            // offline name heuristic are fallbacks for providers that do not
            // publish modality — so image support works for any current or
            // future provider without maintaining name patterns.
            vision: mi.vision ?? resolveSupportedImages(catalog, spec.id, mi.id),
            free: isFreeModel(mi.id),
            metadata: modelMetadataFor(catalog, spec.id, mi.id),
          })),
          effortLevels: spec.effortLevels,
          maxEffort: spec.maxEffort ?? 'collapses-to-high',
          keyEnvVars: spec.keyEnvVars,
          baseUrl: spec.baseUrl,
        };
      });
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

    const browserMatch = path.match(/^\/api\/browser\/(navigate|back|forward|reload|screenshot|click|type|focus|hover|scroll|fill|select|press|wait)$/);
    if (browserMatch) {
      const b = this.browserImpl();
      if (!b.available()) {
        this.sendJson(res, 503, { error: 'no in-app browser connected — run the desktop app (npm run app)' });
        return;
      }
      try {
        const needsBody = ['navigate', 'click', 'type', 'hover', 'scroll', 'fill', 'select', 'press', 'wait'].includes(browserMatch[1] ?? '');
        const body = needsBody ? await this.readBody(req) : {};
        if (browserMatch[1] === 'screenshot') {
          this.sendJson(res, 200, await b.screenshot());
        } else if (browserMatch[1] === 'navigate') {
          this.sendJson(res, 200, await b.navigate(String(body['url'] ?? '')));
        } else if (browserMatch[1] === 'back') {
          this.sendJson(res, 200, await b.back());
        } else if (browserMatch[1] === 'forward') {
          this.sendJson(res, 200, await b.forward());
        } else if (browserMatch[1] === 'click') {
          if (typeof body['selector'] === 'string' && body['selector'] && b.clickSelector) {
            this.sendJson(res, 200, await b.clickSelector(String(body['selector'])));
          } else {
            this.sendJson(res, 200, await b.click(Number(body['x'] ?? 0), Number(body['y'] ?? 0)));
          }
        } else if (browserMatch[1] === 'hover' && b.hover) {
          this.sendJson(res, 200, await b.hover(Number(body['x'] ?? 0), Number(body['y'] ?? 0)));
        } else if (browserMatch[1] === 'scroll' && b.scroll) {
          this.sendJson(res, 200, await b.scroll(Number(body['x'] ?? 640), Number(body['y'] ?? 450), Number(body['deltaY'] ?? 300)));
        } else if (browserMatch[1] === 'fill' && b.fill) {
          this.sendJson(res, 200, await b.fill(String(body['selector'] ?? ''), String(body['text'] ?? '')));
        } else if (browserMatch[1] === 'select' && b.select) {
          this.sendJson(res, 200, await b.select(String(body['selector'] ?? ''), String(body['value'] ?? '')));
        } else if (browserMatch[1] === 'press' && b.press) {
          this.sendJson(res, 200, await b.press(String(body['key'] ?? 'Enter')));
        } else if (browserMatch[1] === 'wait' && b.wait) {
          this.sendJson(res, 200, await b.wait(Number(body['ms'] ?? 1000)));
        } else if (browserMatch[1] === 'type') {
          this.sendJson(res, 200, await b.type(String(body['text'] ?? '')));
        } else if (browserMatch[1] === 'focus') {
          if (!b.focus) {
            this.sendJson(res, 503, { error: 'the browser window lives in the desktop app' });
            return;
          }
          this.sendJson(res, 200, await b.focus());
        } else {
          this.sendJson(res, 200, await b.reload());
        }
      } catch (err) {
        this.sendJson(res, 400, { error: (err as Error).message });
      }
      return;
    }

    const gitRoot = (queryPath: string | null): string => {
      // Scope to THIS machine's known Agent Gitu surfaces: the configured cwd,
      // projects under the managed Projects folder, and roots of currently
      // known sessions (incl. their linked worktrees). Without this, any
      // request could init/commit/push/discard an arbitrary repo elsewhere.
      const known = new Set<string>([nodePath.resolve(this.config.cwd)]);
      for (const s of this.sessions.values()) {
        if (s.projectPath) known.add(nodePath.resolve(s.projectPath));
        if (s.worktreePath) known.add(nodePath.resolve(s.worktreePath));
      }
      const base = projectsDir();
      const isAllowed = (candidate: string): boolean => {
        const resolved = nodePath.resolve(candidate);
        if (resolved.startsWith(base + nodePath.sep)) return true;
        for (const k of known) {
          if (resolved === k || resolved.startsWith(k + nodePath.sep)) return true;
        }
        return false;
      };
      for (const c of [queryPath ?? undefined, this.config.cwd]) {
        if (!c || !isAllowed(c)) continue;
        try {
          return ProjectGuard.detect(nodePath.resolve(c)).lock.repoRoot;
        } catch {
          /* try next */
        }
      }
      return ProjectGuard.detect(this.config.cwd).lock.repoRoot;
    };

    if (method === 'GET' && path === '/api/git') {
      const root = gitRoot(url.searchParams.get('path'));
      this.sendJson(res, 200, { root, ...(await gitInfo(root)) });
      return;
    }

    if (method === 'GET' && path === '/api/git/diff') {
      const root = gitRoot(url.searchParams.get('path'));
      const file = url.searchParams.get('file') ?? undefined;
      try {
        this.sendJson(res, 200, { diff: await gitDiff(root, file) });
      } catch (err) {
        this.sendJson(res, 400, { error: (err as Error).message });
      }
      return;
    }

    const gitAction = path.match(/^\/api\/git\/(init|commit|push|discard)$/);
    if (gitAction && method === 'POST') {
      const body = await this.readBody(req);
      const root = gitRoot(typeof body['path'] === 'string' ? String(body['path']) : null);
      try {
        if (gitAction[1] === 'init') {
          this.sendJson(res, 200, { ok: true, output: await gitInit(root) });
        } else if (gitAction[1] === 'commit') {
          const files = Array.isArray(body['files']) ? (body['files'] as unknown[]).map(String) : undefined;
          this.sendJson(res, 200, { ok: true, commit: await gitCommit(root, String(body['message'] ?? ''), files) });
        } else if (gitAction[1] === 'push') {
          this.sendJson(res, 200, { ok: true, output: (await gitPush(root)) || 'pushed' });
        } else {
          this.sendJson(res, 200, { ok: true, output: await gitDiscard(root, String(body['file'] ?? '')) });
        }
      } catch (err) {
        this.sendJson(res, 400, { error: (err as Error).message });
      }
      return;
    }

    const agentsMatch = path.match(/^\/api\/agents(?:\/([\w-]+))?$/);
    if (agentsMatch) {
      const store = new AgentStore();
      if (method === 'GET') {
        this.sendJson(res, 200, { agents: store.list() });
        return;
      }
      if (method === 'POST') {
        const body = await this.readBody(req);
        try {
          const def = store.save({
            id: agentsMatch[1] ?? (typeof body['id'] === 'string' ? body['id'] : undefined),
            name: String(body['name'] ?? ''),
            role: String(body['role'] ?? ''),
            provider: typeof body['provider'] === 'string' && body['provider'] ? body['provider'] : undefined,
            model: typeof body['model'] === 'string' && body['model'] ? body['model'] : undefined,
            effort: body['effort'] === 'low' || body['effort'] === 'medium' || body['effort'] === 'high' || body['effort'] === 'max' ? body['effort'] : undefined,
          });
          this.sendJson(res, 200, { ok: true, agent: def });
        } catch (err) {
          this.sendJson(res, 400, { error: (err as Error).message });
        }
        return;
      }
      if (method === 'DELETE' && agentsMatch[1]) {
        this.sendJson(res, 200, { ok: store.remove(agentsMatch[1]) });
        return;
      }
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
              scope: body['global'] === true ? 'global' : 'project',
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
        this.sendJson(res, 200, { servers: manager.servers(), scopes: manager.serverScopes(), tools });
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
        manager.addServer({ name, command, args }, body['global'] === true ? 'global' : 'project');
        this.sendJson(res, 200, { ok: true, servers: manager.servers(), scopes: manager.serverScopes() });
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
      const autoLearn = body['autoLearn'] !== false;
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
        mode,
        autoApprove,
        events: [],
        subscribers: new Set(),
        approvals: new Map(),
      };
    this.sessions.set(session.runId, session);
    this.saveRegistry();
    this.pushEvent(session, `user-msg ${goal}`);
    this.sendJson(res, 202, { runId: session.runId, mode });
      void this.executeRun(session, llm!, { goal, criteria, mode, review, scope, constraints, effort, projectPath, autoApprove, autoLearn, images, model: resolvedInfo?.model ?? model });
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

    if (method === 'POST' && path === '/api/runs/delete-many') {
      const body = await this.readBody(req);
      const ids = Array.isArray(body['ids']) ? (body['ids'] as unknown[]).map(String) : [];
      let removed = 0;
      for (const id of ids) {
        // Stop in-flight runs first: otherwise executeRun keeps going and its
        // pushEvent/persistSession calls silently resurrect the deleted row.
        const s = this.sessions.get(id);
        if (s) {
          s.hermes?.stop();
          void s.lsp?.shutdown().catch(() => {});
        }
        this.sessions.delete(id);
        if (this.db().deleteSession(id)) removed += 1;
      }
      this.sendJson(res, 200, { ok: true, removed });
      return;
    }

    const runDeleteMatch = path.match(/^\/api\/runs\/([\w-]+)$/);
    if (method === 'DELETE' && runDeleteMatch) {
      const id = runDeleteMatch[1]!;
      const s = this.sessions.get(id);
      if (s) {
        s.hermes?.stop();
        void s.lsp?.shutdown().catch(() => {});
      }
      this.sessions.delete(id);
      const removed = this.db().deleteSession(id);
      this.sendJson(res, 200, { ok: true, removed });
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
      session.lsp?.shutdown().catch(() => {});
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
      // Synchronously reserve the session BEFORE any await. The setup below
      // yields many times (body read, env validation, worktree checks, LLM
      // resolution); a second POST landing in that window used to observe the
      // stale non-running status and start a second concurrent Hermes run on
      // the same session/ledger/worktree.
      const prevStatus = session.status;
      const wasRunning = prevStatus === 'running';
      session.status = 'running';
      try {
      const body = await this.readBody(req, 12_000_000);
      const text = typeof body['text'] === 'string' ? body['text'].trim() : '';
      if (!text) {
        if (!wasRunning) session.status = prevStatus;
        this.sendJson(res, 400, { error: 'text is required' });
        return;
      }
      const images = Array.isArray(body['images'])
        ? (body['images'] as Record<string, unknown>[])
            .map((im) => ({ name: String(im['name'] ?? 'image'), dataUrl: String(im['dataUrl'] ?? '') }))
            .filter((im) => im.dataUrl.startsWith('data:image/'))
            .slice(0, 4)
        : undefined;
      // Older sessions created before provider/model persistence have no
      // model identity. Let the current picker supply it once so they can be
      // resumed after an app upgrade instead of falling back to an unrelated
      // provider default.
      const selectedProvider = typeof body['provider'] === 'string' && body['provider'].trim() ? body['provider'].trim() : undefined;
      const selectedModel = typeof body['model'] === 'string' && body['model'].trim() ? body['model'].trim() : undefined;
      const useSelectedModel = body['useSelectedModel'] === true;
      // An explicit mode in the body is a deliberate workflow switch (the UI
      // always sends it from the dropdown): update the durable session mode so
      // this continuation — and later ones — run in the newly chosen mode.
      const modeSwitch = body['mode'] === 'fast' ? 'fast' : body['mode'] === 'chat' ? 'chat' : body['mode'] === 'standard' ? 'standard' : undefined;
      const reviewSwitch = typeof body['review'] === 'boolean' ? body['review'] : undefined;
      const supersede = typeof body['supersede'] === 'string' && body['supersede'].trim() ? body['supersede'].trim() : undefined;
      if (body['autoApprove'] === true) session.autoApprove = true;
      else if (body['autoApprove'] === false) session.autoApprove = false;
      if (modeSwitch) session.mode = modeSwitch;
      if (wasRunning) {
        session.hermes?.queueMessage(text);
        this.pushEvent(session, `queued  "${text}" — will be delivered to the agent at the next step`);
        this.sendJson(res, 200, { ok: true, queued: true });
        return;
      }
      if (!session.taskId) {
        session.status = prevStatus;
        this.sendJson(res, 409, { error: 'run has no task yet' });
        return;
      }
      const taskRoot = this.resolveTaskRoot(session.taskId, session.projectPath);
      if (!taskRoot) {
        session.status = prevStatus;
        this.sendJson(res, 409, { error: `Cannot resolve project root for task ${session.taskId}` });
        return;
      }
      const ledger = TaskLedger.load(taskRoot, session.taskId);
      if (!ledger) {
        session.status = prevStatus;
        this.sendJson(res, 404, { error: `Task ledger ${session.taskId} not found at ${taskRoot}` });
        return;
      }
      // A task is bound to its own hermes/* branch, but the shared checkout can
      // only hold one branch at a time: any newer run (or a manual switch)
      // moves it and would lock every older session out. Instead of stealing
      // the checkout back — which detaches whichever session owned it — resume
      // in a dedicated linked worktree on this session's own branch. The
      // shared checkout stays exactly where it is.
      let execRoot = taskRoot;
      if (ledger.data.worktreePath && existsSync(ledger.data.worktreePath)) {
        execRoot = ledger.data.worktreePath;
      } else {
        const precheck = await ledger.validateEnvironment(execRoot);
        if (!precheck.ok && /branch mismatch/i.test(precheck.reason ?? '')) {
          const wt = await this.ensureSessionWorktree(execRoot, session.taskId, ledger.data.gitBranch ?? '');
          if (wt) {
            execRoot = wt;
            ledger.data.worktreePath = wt;
            ledger.save();
            session.worktreePath = wt;
            this.pushEvent(
              session,
              `git     resuming in isolated worktree ${wt} on ${ledger.data.gitBranch} — the main checkout keeps its current branch`,
            );
          }
        }
      }
      const envCheck = await ledger.validateEnvironment(execRoot);
      if (!envCheck.ok) {
        session.status = prevStatus;
        this.sendJson(res, 409, { error: `Execution rejected: ${envCheck.reason}` });
        return;
      }
      let llm = this.config.llm;
      let provider = session.provider;
      let model = session.model;
      if (useSelectedModel && selectedProvider && selectedModel) {
        // The UI only sends this flag after the user changes the picker for
        // this session, so a deliberate recovery from an unavailable model is
        // possible without silently changing models on every continuation.
        provider = selectedProvider;
        model = selectedModel;
        session.provider = provider;
        session.model = model;
      } else if ((!provider || !model) && selectedProvider && selectedModel && (!provider || provider === selectedProvider)) {
        provider ??= selectedProvider;
        model ??= selectedModel;
        session.provider = provider;
        session.model = model;
      }
      // No-credits rescue: when the PREVIOUS attempt died on billing, walk the
      // USER-CONFIGURED fallback list (Settings → Fallback models) first; with
      // no usable entry, rescue to a free model from the SAME provider so the
      // session keeps moving. An explicit picker override always wins.
      const billingFailure = typeof session.error === 'string' && /(401|no credits|insufficient balance|billing)/i.test(session.error);
      if (billingFailure && !useSelectedModel && provider && model) {
        const chain = loadWorkspaceSettings().fallbackModels ?? [];
        const configured = chain
          .map((entry) => entry.split('::') as [string, string])
          .find(([p, m]) => p && m && !(p === provider && m === model));
        const freeModel = configured ? undefined : freeModelFallback(provider, model);
        const candidate = configured ?? (freeModel ? ([provider, freeModel] as [string, string]) : undefined);
        if (candidate) {
          this.pushEvent(
            session,
            `model    ${provider}/${model} has no credits (last attempt failed) — falling back to ${candidate[0]}/${candidate[1]}${configured ? ' per your fallback list' : ' (same-provider free model)'}`,
          );
          provider = candidate[0];
          model = candidate[1];
          session.provider = provider;
          session.model = model;
          session.error = undefined;
          this.persistSession(session);
        } else {
          this.pushEvent(
            session,
            `warn    ${provider}/${model} has no credits and no fallback models are configured — add one in Settings → Providers (e.g. ${provider}::<free-model-id>) or fix billing`,
          );
        }
      }
      if (!llm) {
        try {
          // Keep a continuation on the model the user selected for the
          // original session instead of silently falling back to the current
          // global default after an app restart.
          llm = resolveLlm({ provider, model }).client;
        } catch (err) {
          if (err instanceof ProviderError) {
            session.status = prevStatus;
            this.sendJson(res, 400, { error: err.message });
            return;
          }
          throw err;
        }
      }
      const conversationHistory = this.conversationHistory(session);
      session.status = 'running';
      session.report = undefined;
      session.finishedAt = undefined;
      session.error = undefined;
      if (supersede) this.supersedeUserMessage(session, supersede, text);
      this.pushEvent(session, `user-msg ${text}`);
      this.pushEvent(session, `continue — resuming this session`);
      void this.executeRun(session, llm, {
        goal: session.goal,
        mode: session.mode ?? 'standard',
        review: reviewSwitch ?? false,
        projectPath: execRoot,
        resume: { taskId: session.taskId, message: text },
        conversationHistory,
        images,
        model,
        autoApprove: session.autoApprove,
      });
      this.sendJson(res, 200, { ok: true, resumed: true });
      return;
      } catch (err) {
        // Any failure during async setup must release the reservation or the
        // session would be stuck "running" forever.
        if (!wasRunning) session.status = prevStatus;
        throw err;
      }
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
      autoLearn?: boolean;
      images?: { name: string; dataUrl: string }[];
      model?: string;
      conversationHistory?: LlmMessage[];
    },
  ): Promise<void> {
    let root: string;
    let ignorePaths: string[] | undefined;
    // Catalog modality is the source of truth for image support; warm the
    // catalog once per run so even brand-new providers report vision correctly.
    peekModelCatalog() ?? (await fetchModelCatalog().catch(() => undefined));
    try {
      const lock = ProjectGuard.detect(opts.projectPath ?? this.config.cwd).lock;
      root = lock.repoRoot;
      ignorePaths = lock.ignorePaths;
    } catch {
      root = this.config.cwd;
    }
    const index = this.sharedIndex(root, ignorePaths);
    const catalog = await fetchModelCatalog();
    const selectedModel = opts.model ?? session.model ?? '';
    const modelMeta = modelMetadataFor(catalog, session.provider ?? '', selectedModel);
    const contextWindowTokens = modelMeta?.contextTokens;
    const modelCapability = modelCapabilityTier(modelMeta, selectedModel);
    const skills = SkillStore.forProject(root);
    const mcp = McpManager.forProject(root);
    const agentStore = new AgentStore();
    const agentDefs = agentStore.list();
    const usage: SessionUsage = (session.usage ??= { inputTokens: 0, outputTokens: 0, cachedTokens: 0, messages: 0 });
    const trackUsage = (u: LlmUsage | undefined): void => {
      usage.messages += 1;
      if (u) {
        usage.inputTokens += u.inputTokens;
        usage.outputTokens += u.outputTokens;
        usage.cachedTokens += u.cachedTokens;
      }
    };
    const trackedLlm = new UsageTrackingClient(llm, trackUsage);
    const subagents =
      agentDefs.length > 0
        ? new SubAgentRunner({
            cwd: root,
            resolveLlm: (name) => {
              const def = agentStore.get(name);
              if (!def) {
                const available = agentStore.list().map((a) => `"${a.name}"`).join(', ');
                throw new Error(
                  `unknown specialist agent "${name}". Available agents: [${available || 'none'}]. Note: "agent" must be a registered specialist name (e.g. ${agentStore.list()[0]?.name ? `"${agentStore.list()[0]?.name}"` : '"explore"'}), NOT a model/provider identifier.`,
                );
              }
              return new UsageTrackingClient(resolveLlm({ provider: def.provider, model: def.model }).client, trackUsage);
            },
            agentRole: (name) => agentStore.get(name)?.role,
            agentEffort: (name) => agentStore.get(name)?.effort,
            onEvent: (t) => this.pushEvent(session, t),
          })
        : undefined;
    session.project = root.split(/[\\/]/).filter(Boolean).pop();
    session.mode ??= opts.mode;
    const lsp = (session.lsp ??= new LspManager(root));
    const hermes = new Hermes({
      cwd: opts.projectPath ?? this.config.cwd,
      index,
      llm: trackedLlm,
      mode: opts.mode,
      autoApprove: opts.autoApprove ?? false,
      autoLearn: opts.autoLearn ?? true,
      criteria: opts.criteria,
      scopeFiles: opts.scope,
      extraConstraints: opts.constraints,
      effort: opts.effort,
      skills,
      mcp,
      lsp,
      subagents,
      agentsSection: agentStore.renderForPrompt() || undefined,
      specialists: agentStore.list().map((a) => ({ name: a.name, role: a.role })),
      resume: opts.resume,
      conversationHistory: opts.conversationHistory,
      browser: this.browserImpl(),
      images: opts.images,
      // Full-precedence resolution (provider live /models → catalog → name
      // heuristic) so any vision-capable model actually receives the attached
      // images instead of having them silently skipped at run time.
      supportsImages: await resolveImageSupport({
        providerId: session.provider,
        model: opts.model ?? session.model,
        catalog,
      }),
      contextWindowTokens,
      modelCapability,
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
        if (ledgerMatch) {
          session.taskId = ledgerMatch[1];
          this.persistSession(session);
        }
        const branchMatch = text.match(/branch\s+(?:Switched to existing|Created|Already on)\s+(\S+)/);
        if (branchMatch) {
          session.branch = branchMatch[1];
          this.persistSession(session);
        }
        this.pushEvent(session, text, !text.startsWith('browseshot '));
      },
    });
    session.hermes = hermes;

    try {
      const { ledger, report } = await hermes.run(opts.goal);
      session.status = report.status === 'complete' ? 'completed' : report.status === 'blocked' ? 'blocked' : 'failed';
      session.report = report;
      // Stalled/blocked runs previously left session.error null, so the UI
      // failure card had nothing to show and the end looked like a silent
      // crash. Surface the ledger blocker as the reason.
      if (session.status !== 'completed' && !session.error) {
        const blocker = (ledger.data.blockers || []).slice(-1)[0];
        session.error =
          blocker ||
          (session.status === 'failed' ? 'Task ended without completion (stalled): the effort budget ran out without verified progress.' : undefined);
      }
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
