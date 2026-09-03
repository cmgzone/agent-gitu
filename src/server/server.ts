import http from 'node:http';
import os from 'node:os';
import { appendFileSync, copyFileSync, cpSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import nodePath from 'node:path';
import type { AddressInfo } from 'node:net';
import { Gitu } from '../agent/gitu.js';
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
import { LlmError, UsageTrackingClient } from '../llm/llm.js';
import { codexSubscriptionInfo, startCodexSubscriptionLogin, type CodexLoginStart, type CodexSubscriptionInfo } from '../llm/codex-subscription.js';
import { ProviderError, allProviderSpecs, cachedLiveModels, fetchModelCatalog, freeModelFallback, isFreeModel, modelCapabilityTier, modelMetadataFor, peekModelCatalog, providerKey, resolveImageSupport, resolveLlm, resolveSupportedImages, usageCostUsd } from '../llm/providers.js';
import { removeStoredKey, setStoredKey, storedKeyVars } from '../llm/keys.js';
import { SessionStore, type SessionUsage, type StoredSessionFile } from './session-store.js';
import { McpManager } from '../mcp/client.js';
import { Reporter } from '../report/reporter.js';
import { SkillStore } from '../skills/skills.js';
import { ConnectionRegistry, normalizeConnectionOperation, normalizeConnectionOperationBody, type ConnectionRequirement } from '../connections/connections.js';
import { catalogCapabilityDeclared } from '../connections/catalog.js';
import type { ModelContextAttachment } from '../context/model-context.js';
import type { CompletionReport } from '../types.js';
import { nowIso, sha256, shortId } from '../util.js';
import { createProject, ensureGituHome, gituHomeRoot, isDriveRoot, loadWorkspaceSettings, projectsDir, sanitizeCustomProviders, updateWorkspaceSettings } from '../workspace/home.js';
import { UI_HTML } from './ui.js';
import { BRAND_DIR, BRAND_FILES, FONT_FILES, FONTS_DIR, VENDOR_THREE, isPreviewableMime, isTextLikeFile, mimeForFile, safeFileName } from './static-assets.js';

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

/** A local-only credential request. It deliberately carries provider metadata
 * only; submitted token values never enter session state or event history. */
export interface PendingConnection {
  id: string;
  requirement: ConnectionRequirement;
  requestedAt: string;
}

export interface SessionFileView {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: 'user' | 'assistant';
  createdAt: string;
  previewable: boolean;
  downloadUrl: string;
  previewUrl?: string;
}

interface QuestionsWaiter extends PendingQuestions {
  resolve: (answer: string) => void;
}

interface ConnectionWaiter extends PendingConnection {
  resolve: (saved: boolean) => void;
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
  status: 'running' | 'waiting_for_model' | 'completed' | 'blocked' | 'failed';
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
  requestedProvider?: string;
  requestedModel?: string;
  activeProvider?: string;
  activeModel?: string;
  pendingApprovals: PendingApproval[];
  pendingPlanReview?: PendingPlanReview;
  pendingQuestions?: PendingQuestions;
  pendingConnection?: PendingConnection;
  report?: CompletionReport;
  error?: string;
  usage?: SessionUsage & { costUsd?: number };
  files: SessionFileView[];
}

interface RunSession {
  runId: string;
  goal: string;
  status: 'running' | 'waiting_for_model' | 'completed' | 'blocked' | 'failed';
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
  requestedProvider?: string;
  requestedModel?: string;
  activeProvider?: string;
  activeModel?: string;
  actionProtocolMode?: 'auto' | 'native' | 'structured_text' | 'text';
  /** Bound retry/fallback history for the live run; values are provider::model, never credentials. */
  fallbackHistory?: string[];
  autoApprove?: boolean;
  events: { i: number; t: string; text: string }[];
  subscribers: Set<(ev: { i: number; t: string; text: string }) => void>;
  approvals: Map<string, ApprovalWaiter>;
  planReview?: PlanReviewWaiter;
  questions?: QuestionsWaiter;
  connection?: ConnectionWaiter;
  gitu?: InstanceType<typeof Gitu>;
  /** LSP servers are kept alive for the whole session (across continuations). */
  lsp?: LspManager;
  report?: CompletionReport;
  error?: string;
  usage?: SessionUsage;
  files: StoredSessionFile[];
  /** Messages sent with delivery:'queue' while a run was active; delivered as a continuation when the run completes. */
  queuedUserMessages?: { text: string; attachmentContext?: string }[];
}

export interface GituServerConfig {
  cwd: string;
  port?: number;
  host?: string;
  llm?: LlmClient;
  approvalTimeoutMs?: number;
  /** Automatically bootstrap missing built-in language servers (enabled by default). */
  autoInstallLsp?: boolean;
  browser?: BrowserBridge;
  /** Injectable for tests; production queries the local Codex runtime. */
  codexSubscriptionInfo?: () => Promise<CodexSubscriptionInfo>;
  startCodexSubscriptionLogin?: () => Promise<CodexLoginStart>;
}

const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_SESSION_FILES_PER_MESSAGE = 8;
const MAX_SESSION_FILE_BYTES = 8 * 1024 * 1024;
const MAX_SESSION_FILES_TOTAL_BYTES = 20 * 1024 * 1024;
const MAX_ATTACHMENT_TEXT_EXCERPT = 12_000;
const LONG_RESPONSE_DOCUMENT_CHARS = 6_000;

/**
 * Memory promotion notices are informational transcript events.  A resumed
 * run can replay the same compaction history, so treat a notice as an
 * idempotent event keyed by its normalized claim.
 */
function memoryPatternNoticeKey(text: string): string | undefined {
  const match = /^memory\s+pattern promoted from repeated failures \((.*)\)\s*$/i.exec(text.trim());
  if (!match) return undefined;
  const claim = match[1]!.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return claim || match[1]!.toLowerCase().trim();
}

function dedupeMemoryPatternEvents<T extends { text: string }>(events: T[]): T[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = memoryPatternNoticeKey(event.text);
    if (!key || seen.has(key)) return !key;
    seen.add(key);
    return true;
  });
}

export class GituServer {
  private readonly indexWatchers = new Map<string, CodeIndex>();
  private readonly config: GituServerConfig;
  private server?: http.Server;
  private readonly sessions = new Map<string, RunSession>();
  private readonly connections = new ConnectionRegistry();
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
          reject(new Error('the in-app browser did not respond (is the Agent Gitu window open?)'));
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

  private fileView(file: StoredSessionFile): SessionFileView {
    const base = `/api/runs/${encodeURIComponent(file.runId)}/files/${encodeURIComponent(file.id)}`;
    return {
      id: file.id,
      name: file.name,
      mime: file.mime,
      size: file.size,
      kind: file.kind,
      createdAt: file.createdAt,
      previewable: isPreviewableMime(file.mime),
      downloadUrl: base,
      ...(isPreviewableMime(file.mime) ? { previewUrl: `${base}?inline=1` } : {}),
    };
  }

  private sessionFileRoot(session: RunSession, preferredRoot?: string): { root: string; dir: string } {
    const root = nodePath.resolve(preferredRoot ?? session.worktreePath ?? session.projectPath ?? this.projectRoot() ?? this.config.cwd);
    return { root, dir: nodePath.join(root, '.hermes', 'session-files', session.runId) };
  }

  private persistSessionFile(session: RunSession, file: StoredSessionFile): void {
    session.files.push(file);
    this.db().addSessionFile(file);
  }

  private storeUserFiles(
    session: RunSession,
    rawFiles: unknown,
    preferredRoot?: string,
  ): { files: StoredSessionFile[]; attachments: ModelContextAttachment[]; images: { name: string; dataUrl: string }[] } {
    if (!Array.isArray(rawFiles) || rawFiles.length === 0) return { files: [], attachments: [], images: [] };
    const incoming = (rawFiles as Record<string, unknown>[]).slice(0, MAX_SESSION_FILES_PER_MESSAGE);
    const decoded = incoming.map((raw, index) => {
      const name = safeFileName(String(raw['name'] ?? `file-${index + 1}`));
      const dataUrl = String(raw['dataUrl'] ?? '');
      const match = /^data:([^;,]*)(?:;[^,]*)?;base64,([a-z0-9+/=\r\n]+)$/i.exec(dataUrl);
      if (!match?.[2]) throw new Error(`Invalid attachment: ${name}`);
      const bytes = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
      if (bytes.length === 0) throw new Error(`Invalid attachment: ${name} is empty`);
      if (bytes.length > MAX_SESSION_FILE_BYTES) throw new Error(`Attachment too large: ${name} exceeds 8 MB`);
      const mime = mimeForFile(name, String(raw['type'] ?? match[1] ?? ''));
      return { name, mime, bytes, dataUrl };
    });
    const total = decoded.reduce((sum, file) => sum + file.bytes.length, 0);
    if (total > MAX_SESSION_FILES_TOTAL_BYTES) throw new Error('Attachments too large: combined size exceeds 20 MB');

    const { root, dir } = this.sessionFileRoot(session, preferredRoot);
    mkdirSync(dir, { recursive: true });
    const files: StoredSessionFile[] = [];
    const attachments: ModelContextAttachment[] = [];
    const images: { name: string; dataUrl: string }[] = [];
    for (const entry of decoded) {
      const id = shortId('file');
      const target = nodePath.join(dir, `${id}-${entry.name}`);
      writeFileSync(target, entry.bytes);
      const file: StoredSessionFile = {
        runId: session.runId,
        id,
        name: entry.name,
        mime: entry.mime,
        size: entry.bytes.length,
        kind: 'user',
        path: target,
        createdAt: nowIso(),
      };
      this.persistSessionFile(session, file);
      files.push(file);
      const relative = nodePath.relative(root, target).replace(/\\/g, '/');
      attachments.push({
        name: file.name,
        path: relative,
        mime: file.mime,
        size: file.size,
        ...(isTextLikeFile(file.name, file.mime)
          ? { textExcerpt: entry.bytes.toString('utf8', 0, Math.min(entry.bytes.length, MAX_ATTACHMENT_TEXT_EXCERPT)).replace(/\u0000/g, '') }
          : {}),
      });
      if (/^image\/(png|jpeg|gif|webp)(;|$)/i.test(file.mime)) images.push({ name: file.name, dataUrl: entry.dataUrl });
    }
    return { files, attachments, images };
  }

  private attachmentContext(files: ModelContextAttachment[]): string | undefined {
    if (files.length === 0) return undefined;
    return [
      `USER ATTACHED FILES (${files.length}) — use these as part of the request:`,
      ...files.map((file) =>
        `- ${file.name} (${file.mime}, ${file.size} bytes) at ${file.path}` +
        (file.textExcerpt ? `\n  TEXT EXCERPT:\n${file.textExcerpt}` : ''),
      ),
    ].join('\n');
  }

  private createAssistantDocument(session: RunSession, prose: string): StoredSessionFile {
    const { dir } = this.sessionFileRoot(session);
    mkdirSync(dir, { recursive: true });
    const id = shortId('file');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = `agent-response-${stamp}.md`;
    const target = nodePath.join(dir, `${id}-${name}`);
    const content = `# Agent Gitu response\n\n${prose.trim()}\n`;
    writeFileSync(target, content, 'utf8');
    const file: StoredSessionFile = {
      runId: session.runId,
      id,
      name,
      mime: 'text/markdown; charset=utf-8',
      size: Buffer.byteLength(content),
      kind: 'assistant',
      path: target,
      createdAt: nowIso(),
    };
    this.persistSessionFile(session, file);
    return file;
  }

  private removeSessionFileStorage(session: RunSession): void {
    const dirs = new Set(session.files.map((file) => nodePath.dirname(file.path)));
    for (const dir of dirs) {
      const resolved = nodePath.resolve(dir);
      const expectedSuffix = nodePath.join('.hermes', 'session-files', session.runId);
      if (!resolved.endsWith(expectedSuffix)) continue;
      try {
        rmSync(resolved, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup; database deletion still proceeds */
      }
    }
  }

  constructor(config: GituServerConfig) {
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

  /** Session worktrees must never live under <repo>/.hermes. That directory is
   * deliberately ignored/private, so nesting a checkout there lets an
   * executor mutate a tree the normal product verifier and Git integration
   * cannot authoritatively observe. */
  private sessionWorktreePath(repoRoot: string, taskId: string): string {
    const repoKey = sha256(nodePath.resolve(repoRoot).toLowerCase()).slice(0, 16);
    return nodePath.join(ensureGituHome().sessions, 'worktrees', repoKey, taskId);
  }

  private isPrivateAgentStatePath(repoRoot: string, candidate: string): boolean {
    const privateRoot = nodePath.resolve(repoRoot, '.hermes').toLowerCase();
    const target = nodePath.resolve(candidate).toLowerCase();
    return target === privateRoot || target.startsWith(privateRoot + nodePath.sep);
  }

  /**
   * Dedicated persistent git worktree for one session's bound branch, so an
   * older session can be resumed without moving the branch of the shared
   * checkout. Product files live in Agent Gitu's session area; only private
   * .hermes metadata is linked in. This keeps integration Git-object based
   * rather than dependent on an ignored parent directory.
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
    const wtDir = this.sessionWorktreePath(repoRoot, taskId);
    try {
      const list = await gitExec(repoRoot, ['worktree', 'list', '--porcelain']);
      const lines = list.split(/\r?\n/);
      const worktrees: { root: string; branch?: string }[] = [];
      let current: { root: string; branch?: string } | undefined;
      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          if (current) worktrees.push(current);
          current = { root: nodePath.resolve(line.slice('worktree '.length)) };
        } else if (line.startsWith('branch ') && current) {
          current.branch = line.slice('branch '.length);
        }
      }
      if (current) worktrees.push(current);
      const registered = lines.some(
        (line) =>
          line.startsWith('worktree ') &&
          nodePath.resolve(line.slice('worktree '.length)).toLowerCase() === nodePath.resolve(wtDir).toLowerCase(),
      );
      if (!registered) {
        mkdirSync(nodePath.dirname(wtDir), { recursive: true });
        // Upgrade legacy sessions in place. The branch can only be checked
        // out once, so Git must move its registered worktree rather than add
        // a second checkout of the same branch.
        const legacyRoot = worktrees.find(
          (entry) => entry.branch === `refs/heads/${branch}` && this.isPrivateAgentStatePath(repoRoot, entry.root),
        );
        if (legacyRoot) {
          await gitExec(repoRoot, ['worktree', 'move', legacyRoot.root, wtDir]);
        } else {
          await gitExec(repoRoot, ['worktree', 'add', wtDir, branch]);
        }
      }
    } catch {
      return undefined;
    }
    if (!existsSync(wtDir)) return undefined;
    this.linkWorkspaceIntoWorktree(repoRoot, wtDir);
    return wtDir;
  }

  /** Share private agent state and environment into a product worktree:
   *  .hermes is linked (single ledger source of truth), node_modules is linked when the
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
      .map((s) => ({
        ...s,
        // Hide legacy duplicates already persisted by older compaction runs;
        // the source rows remain recoverable in the session database.
        events: dedupeMemoryPatternEvents(this.db().eventsFor(s.runId)),
        files: this.db().filesFor(s.runId),
      }));
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
      requestedProvider: s.requestedProvider ?? s.provider,
      requestedModel: s.requestedModel ?? s.model,
      activeProvider: s.activeProvider ?? s.provider,
      activeModel: s.activeModel ?? s.model,
      report: s.report,
      error: s.error,
      usage: s.usage,
    });
  }

  async start(): Promise<number> {
    ensureGituHome();
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
        requestedProvider: entry.requestedProvider ?? entry.provider,
        requestedModel: entry.requestedModel ?? entry.model,
        activeProvider: entry.activeProvider ?? entry.provider,
        activeModel: entry.activeModel ?? entry.model,
        report,
        error: interrupted ? 'Agent Gitu was interrupted by an application restart. Send a message to resume it.' : entry.error,
        usage: entry.usage,
        files: entry.files,
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
      llm = this.config.llm ?? resolveLlm({ workingDirectory: root }).client;
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
      files: [],
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

  private sendLocalFile(
    res: http.ServerResponse,
    filePath: string,
    name: string,
    mime: string,
    inline = false,
    headOnly = false,
  ): void {
    if (!existsSync(filePath)) {
      this.sendJson(res, 404, { error: 'file not found' });
      return;
    }
    const info = statSync(filePath);
    if (!info.isFile()) {
      this.sendJson(res, 404, { error: 'file not found' });
      return;
    }
    const safe = safeFileName(name).replace(/["\\]/g, '-');
    const disposition = inline && isPreviewableMime(mime) ? 'inline' : 'attachment';
    res.writeHead(200, {
      'content-type': mime || 'application/octet-stream',
      'content-length': info.size,
      'content-disposition': `${disposition}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    });
    if (headOnly) res.end();
    else createReadStream(filePath).pipe(res);
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
      requestedProvider: s.requestedProvider ?? s.provider,
      requestedModel: s.requestedModel ?? s.model,
      activeProvider: s.activeProvider ?? s.provider,
      activeModel: s.activeModel ?? s.model,
      pendingApprovals: [...s.approvals.values()].map(({ id, tool, why, summary, requestedAt }) => ({ id, tool, why, summary, requestedAt })),
      pendingPlanReview: s.planReview
        ? { id: s.planReview.id, criteria: s.planReview.criteria, steps: s.planReview.steps, requestedAt: s.planReview.requestedAt }
        : undefined,
      pendingQuestions: s.questions
        ? { id: s.questions.id, questions: s.questions.questions, requestedAt: s.questions.requestedAt }
        : undefined,
      pendingConnection: s.connection
        ? { id: s.connection.id, requirement: s.connection.requirement, requestedAt: s.connection.requestedAt }
        : undefined,
      report: s.report,
      error: s.error,
      usage: s.usage
        ? {
            ...s.usage,
            costUsd: usageCostUsd(modelMetadataFor(peekModelCatalog(), s.provider ?? '', s.model ?? ''), s.usage),
          }
        : undefined,
      files: s.files.map((file) => this.fileView(file)),
    };
  }

  private recordEvent(s: RunSession, text: string, persistDb = true): void {
    const memoryKey = memoryPatternNoticeKey(text);
    if (memoryKey && s.events.some((event) => memoryPatternNoticeKey(event.text) === memoryKey)) return;
    // Streaming deltas are intentionally not persisted.  After a restart the
    // in-memory array is therefore sparse, so its length is not a safe event
    // cursor: reusing it can overwrite an old persisted event (including a
    // user message) and make the SSE client skip it.  Keep event ids strictly
    // monotonic from the highest known id instead.
    const ev = { i: s.events.reduce((highest, existing) => Math.max(highest, existing.i), -1) + 1, t: nowIso(), text };
    s.events.push(ev);
    if (persistDb && !text.startsWith('tdelta') && !text.startsWith('activity')) {
      try {
        this.db().addEvent(s.runId, ev);
        this.persistSession(s);
      } catch {
        /* persistence must never break the run */
      }
    }
    for (const send of s.subscribers) send(ev);
  }

  private pushEvent(s: RunSession, text: string, persistDb = true): void {
    const prose = text.startsWith('say ') ? text.slice(4) : '';
    if (persistDb && prose.length >= LONG_RESPONSE_DOCUMENT_CHARS) {
      try {
        const file = this.createAssistantDocument(s, prose);
        this.recordEvent(
          s,
          `file ${JSON.stringify({ ...this.fileView(file), replacesLongText: true })}`,
          true,
        );
        this.recordEvent(s, `say I put the detailed response in ${file.name} so you can preview or download it.`, true);
        return;
      } catch {
        // If document persistence fails, preserve the original response.
      }
    }
    this.recordEvent(s, text, persistDb);
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
      let fileTurn: LlmMessage | undefined;
      if (text.startsWith('file ')) {
        try {
          const metadata = JSON.parse(text.slice(5)) as { id?: string; kind?: string; name?: string };
          const file = s.files.find((item) => item.id === metadata.id);
          if (file) {
            const intro = `${file.kind === 'assistant' ? 'I provided' : 'The user attached'} file ${file.name} (${file.mime}, ${file.size} bytes).`;
            const body = file.kind === 'assistant' && isTextLikeFile(file.name, file.mime) && existsSync(file.path)
              ? `\n${readFileSync(file.path, 'utf8').slice(0, 12_000)}`
              : ` Stored at ${file.path}.`;
            fileTurn = { role: file.kind === 'assistant' ? 'assistant' : 'user', content: intro + body };
          }
        } catch {
          /* malformed historical metadata is ignored */
        }
      }
      if (!user && !assistant && !fileTurn) continue;
      const turn: LlmMessage = fileTurn ?? (user ? { role: 'user', content: user } : { role: 'assistant', content: assistant });
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
      const home = ensureGituHome();
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
        updateWorkspaceSettings({ projectsPath: undefined });
        this.sendJson(res, 200, { ok: true, projectsPath: projectsDir() });
        return;
      }
      if (isDriveRoot(projectsPath)) {
        this.sendJson(res, 400, { error: 'The workspace cannot be a drive root — pick a folder like <home>/Projects' });
        return;
      }
      updateWorkspaceSettings({ projectsPath });
      this.sendJson(res, 200, { ok: true, projectsPath: projectsDir() });
      return;
    }

    const connectionMatch = path.match(/^\/api\/connections(?:\/([a-z][a-z0-9-]{0,62}))?(?:\/(test))?$/);
    if (connectionMatch) {
      const connectionId = connectionMatch[1];
      const action = connectionMatch[2];
      if (method === 'GET' && !connectionId) {
        this.sendJson(res, 200, { connections: this.connections.list() });
        return;
      }
      if (method === 'POST' && !connectionId) {
        const body = await this.readBody(req);
        try {
          const saved = this.connections.save({
            ...(typeof body['id'] === 'string' ? { id: body['id'] } : {}),
            label: String(body['label'] ?? ''),
            provider: String(body['provider'] ?? ''),
            baseUrl: String(body['baseUrl'] ?? ''),
            ...(typeof body['documentationUrl'] === 'string' ? { documentationUrl: body['documentationUrl'] } : {}),
            ...(Array.isArray(body['capabilities']) ? { capabilities: body['capabilities'].map(String) } : {}),
            ...(Array.isArray(body['operations']) ? { operations: body['operations'] as never[] } : {}),
            ...(typeof body['token'] === 'string' ? { token: body['token'] } : {}),
          });
          this.sendJson(res, 200, { ok: true, connection: saved });
        } catch (error) {
          this.sendJson(res, 400, { error: (error as Error).message });
        }
        return;
      }
      if (method === 'POST' && connectionId && action === 'test') {
        try {
          const result = await this.connections.validate(connectionId);
          this.sendJson(res, 200, { ok: true, status: result.status, message: result.message });
        } catch (error) {
          this.sendJson(res, 400, { error: (error as Error).message });
        }
        return;
      }
      if (method === 'DELETE' && connectionId && !action) {
        if (!this.connections.remove(connectionId)) {
          this.sendJson(res, 404, { error: 'connection not found' });
          return;
        }
        this.sendJson(res, 200, { ok: true });
        return;
      }
    }

    const providerProfileMatch = path.match(/^\/api\/provider-profiles(?:\/(custom-[a-z0-9-]+))?(?:\/(test))?$/);
    if (providerProfileMatch) {
      const profileId = providerProfileMatch[1];
      const action = providerProfileMatch[2];
      if (method === 'GET' && !profileId) {
        this.sendJson(res, 200, { profiles: loadWorkspaceSettings().customProviders ?? [] });
        return;
      }
      if (method === 'POST' && !profileId) {
        const body = await this.readBody(req);
        const requestedToolMode: 'auto' | 'native' | 'structured_text' | 'text' =
          body['toolMode'] === 'native' || body['toolMode'] === 'structured_text' || body['toolMode'] === 'text' ? body['toolMode'] : 'auto';
        const profile = {
          id: String(body['id'] ?? '').trim().toLowerCase(),
          label: String(body['label'] ?? '').trim(),
          baseUrl: String(body['baseUrl'] ?? '').trim(),
          defaultModel: String(body['defaultModel'] ?? '').trim(),
          keyEnvVar: String(body['keyEnvVar'] ?? '').trim().toUpperCase(),
          models: Array.isArray(body['models']) ? body['models'].map(String) : undefined,
          toolMode: requestedToolMode,
        };
        // Validate the candidate before replacing any matching saved profile.
        // Otherwise an invalid update could silently delete its prior, working
        // configuration when settings sanitization drops the invalid entry.
        const validCandidate = sanitizeCustomProviders([profile])?.[0];
        if (!validCandidate) {
          this.sendJson(res, 400, { error: 'Invalid provider profile. Use custom-<slug>, an HTTPS endpoint (or localhost HTTP), a model, and a HERMES_CUSTOM_* key name.' });
          return;
        }
        const existing = loadWorkspaceSettings().customProviders ?? [];
        const next = [...existing.filter((candidate) => candidate.id !== validCandidate.id), validCandidate];
        const settings = updateWorkspaceSettings({ customProviders: next });
        const saved = settings.customProviders?.find((candidate) => candidate.id === validCandidate.id);
        if (!saved) {
          this.sendJson(res, 400, { error: 'Invalid provider profile. Use custom-<slug>, an HTTPS endpoint (or localhost HTTP), a model, and a HERMES_CUSTOM_* key name.' });
          return;
        }
        this.sendJson(res, 200, { ok: true, profile: saved });
        return;
      }
      if (method === 'DELETE' && profileId && !action) {
        const existing = loadWorkspaceSettings().customProviders ?? [];
        const next = existing.filter((candidate) => candidate.id !== profileId);
        if (next.length === existing.length) {
          this.sendJson(res, 404, { error: 'provider profile not found' });
          return;
        }
        updateWorkspaceSettings({ customProviders: next });
        this.sendJson(res, 200, { ok: true });
        return;
      }
      if (method === 'POST' && profileId && action === 'test') {
        const body = await this.readBody(req);
        try {
          const resolved = resolveLlm({
            provider: profileId,
            model: typeof body['model'] === 'string' && body['model'].trim() ? body['model'].trim() : undefined,
            workingDirectory: this.config.cwd,
          });
          await resolved.client.complete([{ role: 'user', content: 'Reply with exactly: ok' }], { retries: 0, maxTransportAttempts: 1 });
          this.sendJson(res, 200, { ok: true, provider: resolved.providerId, model: resolved.model });
        } catch (err) {
          this.sendJson(res, 400, { error: (err as Error).message });
        }
        return;
      }
    }

    if (path === '/api/model-fallbacks') {
      if (method === 'GET') {
        this.sendJson(res, 200, { fallbackModels: loadWorkspaceSettings().fallbackModels ?? [] });
        return;
      }
      if (method === 'POST') {
        const body = await this.readBody(req);
        const values = Array.isArray(body['fallbackModels']) ? body['fallbackModels'].map(String) : [];
        const settings = updateWorkspaceSettings({ fallbackModels: values });
        this.sendJson(res, 200, { ok: true, fallbackModels: settings.fallbackModels ?? [] });
        return;
      }
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
          s.gitu?.stop();
          void s.lsp?.shutdown().catch(() => {});
          this.removeSessionFileStorage(s);
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
      const subscriptionPromise = (this.config.codexSubscriptionInfo ?? codexSubscriptionInfo)();
      const providerRows = await Promise.all(
        Object.values(allProviderSpecs()).map(async (spec) => {
          if (spec.auth === 'chatgpt-subscription') {
            const subscription = await subscriptionPromise;
            const models: { id: string; vision?: boolean }[] = subscription.models.length > 0
              ? subscription.models.map((model) => ({ id: model.id, vision: model.vision }))
              : spec.models.map((id) => ({ id }));
            return { spec, keyInfo: undefined, models, live: subscription.models.length > 0, subscription };
          }
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
          return { spec, keyInfo, models, live, subscription: undefined };
        }),
      );
      const catalog = await catalogPromise;
      const providers = providerRows.map(({ spec, keyInfo, models, live, subscription }) => {
        return {
          id: spec.id,
          label: spec.label,
          defaultModel: spec.defaultModel,
          hasKey: Boolean(keyInfo),
          auth: spec.auth ?? 'api-key',
          signedIn: subscription?.signedIn ?? false,
          planType: subscription?.planType,
          available: subscription?.available ?? true,
          usable: Boolean(keyInfo) || Boolean(subscription?.signedIn),
          publicModels: Boolean(spec.publicModels),
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
          effortLabels: spec.effortLabels,
          maxEffort: spec.maxEffort ?? 'collapses-to-high',
          keyEnvVars: spec.keyEnvVars,
          baseUrl: spec.baseUrl,
          custom: Boolean(spec.custom),
          toolMode: spec.toolMode ?? 'auto',
        };
      });
      const usableProvider = providers.find((p) => p.usable);
      this.sendJson(res, 200, { providers, defaultProvider: usableProvider?.id ?? 'alibaba' });
      return;
    }

    if (method === 'GET' && path.startsWith('/brand/')) {
      const assetName = path.slice('/brand/'.length);
      const contentType = BRAND_FILES[assetName];
      const assetPath = contentType ? nodePath.join(BRAND_DIR, assetName) : undefined;
      if (!contentType || !assetPath || !existsSync(assetPath)) {
        this.sendJson(res, 404, { error: 'brand asset not found' });
        return;
      }
      res.writeHead(200, { 'content-type': contentType, 'cache-control': 'public, max-age=31536000, immutable' });
      createReadStream(assetPath).pipe(res);
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
      ...Object.values(allProviderSpecs()).flatMap((s) => s.keyEnvVars),
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

    if (method === 'GET' && path === '/api/chatgpt/auth') {
      const subscription = await (this.config.codexSubscriptionInfo ?? codexSubscriptionInfo)();
      this.sendJson(res, 200, { ...subscription, loggedIn: subscription.signedIn, loginPending: false });
      return;
    }

    if (method === 'POST' && path === '/api/chatgpt/login') {
      try {
        const login = await (this.config.startCodexSubscriptionLogin ?? startCodexSubscriptionLogin)();
        this.sendJson(res, 202, { ...login, url: login.authUrl });
      } catch (err) {
        this.sendJson(res, 400, { error: (err as Error).message });
      }
      return;
    }

    if (method === 'DELETE' && path === '/api/chatgpt/auth') {
      this.sendJson(res, 405, { error: 'Sign out in Codex. Agent Gitu never stores your ChatGPT credentials.' });
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
        // Full child paths, joined platform-natively server-side. The client
        // must never concatenate separators itself: '\' is not a separator on
        // POSIX, and hand-built paths would break non-Windows machines.
        const dirs = entries
          .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
          .map((d) => nodePath.join(abs, d.name))
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
      const body = await this.readBody(req, 30_000_000);
      const rawFiles = Array.isArray(body['files']) ? body['files'] : [];
      const typedGoal = typeof body['goal'] === 'string' ? body['goal'].trim() : '';
      const goal = typedGoal || (rawFiles.length > 0 ? 'Please review the attached file or document.' : '');
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
      let resolvedInfo: { providerId: string; model: string; toolMode?: 'auto' | 'native' | 'structured_text' | 'text' } | undefined;
      if (!llm) {
        try {
          const resolved = resolveLlm({ provider, model, workingDirectory: projectPath ?? this.projectRoot() ?? this.config.cwd });
          llm = resolved.client;
          resolvedInfo = { providerId: resolved.providerId, model: resolved.model, toolMode: resolved.toolMode };
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
        actionProtocolMode: resolvedInfo?.toolMode,
        requestedProvider: resolvedInfo?.providerId ?? (provider ? String(provider) : undefined),
        requestedModel: resolvedInfo?.model ?? model,
        activeProvider: resolvedInfo?.providerId ?? (provider ? String(provider) : undefined),
        activeModel: resolvedInfo?.model ?? model,
        projectPath,
        mode,
        autoApprove,
        events: [],
        subscribers: new Set(),
        approvals: new Map(),
        files: [],
      };
      this.sessions.set(session.runId, session);
      let stored: ReturnType<GituServer['storeUserFiles']> = { files: [], attachments: [], images: [] };
      try {
        stored = this.storeUserFiles(session, rawFiles, projectPath ?? this.projectRoot() ?? this.config.cwd);
      } catch (err) {
        this.removeSessionFileStorage(session);
        this.sessions.delete(session.runId);
        this.db().deleteSession(session.runId);
        this.sendJson(res, 400, { error: (err as Error).message });
        return;
      }
      const modelImages = [...stored.images, ...(images ?? [])].slice(0, 4);
      this.saveRegistry();
      this.pushEvent(session, `user-msg ${goal}`);
      for (const file of stored.files) this.pushEvent(session, `file ${JSON.stringify(this.fileView(file))}`);
      this.sendJson(res, 202, { runId: session.runId, mode });
      void this.executeRun(session, llm!, {
        goal,
        criteria,
        mode,
        review,
        scope,
        constraints,
        effort,
        projectPath,
        autoApprove,
        autoLearn,
        images: modelImages.length ? modelImages : undefined,
        attachments: stored.attachments,
        model: resolvedInfo?.model ?? model,
        actionProtocolMode: resolvedInfo?.toolMode,
      });
      return;
    }

    const sessionFileMatch = path.match(/^\/api\/runs\/([\w-]+)\/files\/([\w-]+)$/);
    if ((method === 'GET' || method === 'HEAD') && sessionFileMatch) {
      const session = this.sessions.get(sessionFileMatch[1]!);
      const file = session?.files.find((item) => item.id === sessionFileMatch[2]);
      if (!session || !file) {
        this.sendJson(res, 404, { error: 'file not found' });
        return;
      }
      this.sendLocalFile(res, file.path, file.name, file.mime, url.searchParams.get('inline') === '1', method === 'HEAD');
      return;
    }

    const projectFileMatch = path.match(/^\/api\/runs\/([\w-]+)\/project-file$/);
    if ((method === 'GET' || method === 'HEAD') && projectFileMatch) {
      const session = this.sessions.get(projectFileMatch[1]!);
      const requested = String(url.searchParams.get('path') ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
      if (!session || !requested || nodePath.isAbsolute(requested) || requested === '..' || requested.startsWith('../')) {
        this.sendJson(res, 404, { error: 'file not found' });
        return;
      }
      const root = nodePath.resolve(session.worktreePath ?? this.resolveTaskRoot(session.taskId ?? '', session.projectPath) ?? session.projectPath ?? this.config.cwd);
      const ledger = session.taskId ? TaskLedger.load(root, session.taskId) : undefined;
      const allowed = new Set([...(session.report?.filesChanged ?? []), ...(ledger?.data.filesChanged ?? [])].map((item) => String(item).replace(/\\/g, '/').replace(/^\.\//, '')));
      if (!allowed.has(requested)) {
        this.sendJson(res, 403, { error: 'only files produced or changed by this run can be downloaded' });
        return;
      }
      const target = nodePath.resolve(root, requested);
      if (target !== root && !target.startsWith(root + nodePath.sep)) {
        this.sendJson(res, 403, { error: 'file is outside the task workspace' });
        return;
      }
      const mime = mimeForFile(requested);
      this.sendLocalFile(res, target, nodePath.basename(requested), mime, url.searchParams.get('inline') === '1', method === 'HEAD');
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

    const runConnectionMatch = path.match(/^\/api\/runs\/([\w-]+)\/connection$/);
    if (method === 'POST' && runConnectionMatch) {
      const session = this.sessions.get(runConnectionMatch[1]!);
      const waiter = session?.connection;
      if (!session || !waiter) {
        this.sendJson(res, 404, { error: 'connection request not found or already resolved' });
        return;
      }
      const body = await this.readBody(req);
      const requirement = waiter.requirement;
      const setup = requirement.setup ?? {};
      const nonEmpty = (value: unknown): string | undefined => typeof value === 'string' && value.trim() ? value.trim() : undefined;
      const requestedCapabilities = Array.isArray(body['capabilities']) ? body['capabilities'].map(String) : [];
      const capabilities = [...new Set([...requirement.capabilities, ...requestedCapabilities, ...(setup.validationCapability ? [setup.validationCapability] : [])])];
      const provider = requirement.providerHint || nonEmpty(body['provider']) || 'provider';
      const validationPath = nonEmpty(body['validationPath']) ?? setup.validationPath ?? '/';
      const validationCapability = setup.validationCapability && capabilities.includes(setup.validationCapability)
        ? setup.validationCapability
        : capabilities[0] ?? 'connection.discover';
      try {
        const saved = this.connections.save({
          ...(typeof body['id'] === 'string' ? { id: body['id'] } : {}),
          label: nonEmpty(body['label']) ?? setup.label ?? provider,
          provider,
          baseUrl: nonEmpty(body['baseUrl']) ?? setup.baseUrl ?? '',
          ...(nonEmpty(body['documentationUrl']) ?? setup.documentationUrl ? { documentationUrl: nonEmpty(body['documentationUrl']) ?? setup.documentationUrl } : {}),
          capabilities: capabilities.length ? capabilities : [validationCapability],
          operations: [{ id: 'validate', label: 'Validate saved connection', capability: validationCapability, method: 'GET', path: validationPath, risk: 'read' }],
          token: typeof body['token'] === 'string' ? body['token'] : undefined,
        });
        await this.connections.validate(saved.id);
        session.connection = undefined;
        this.pushEvent(session, 'connection validated by user — resuming prerequisite recovery');
        waiter.resolve(true);
        this.sendJson(res, 200, { ok: true, connection: { id: saved.id, label: saved.label, provider: saved.provider } });
      } catch (error) {
        // Errors are deliberately status-level only: never return request body
        // data, response body data, or the submitted credential.
        this.sendJson(res, 400, { error: (error as Error).message });
      }
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
          s.gitu?.stop();
          void s.lsp?.shutdown().catch(() => {});
          this.removeSessionFileStorage(s);
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
        s.gitu?.stop();
        void s.lsp?.shutdown().catch(() => {});
        this.removeSessionFileStorage(s);
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
      if (session.status !== 'running') {
        this.sendJson(res, 200, { ok: true, alreadyStopped: true });
        return;
      }

      // Detach the active execution before aborting it.  A provider can take
      // a moment to honour cancellation; without this, its late completion
      // can overwrite the user-visible stopped state or keep emitting output.
      const gitu = session.gitu;
      const lsp = session.lsp;
      session.gitu = undefined;
      session.lsp = undefined;
      gitu?.stop();
      lsp?.shutdown().catch(() => {});

      // Stop must be terminal immediately.  Previously this route only wrote
      // an event, leaving status="running" and causing the UI spinner and
      // subsequent messages to be treated as queued work.
      session.status = 'blocked';
      session.error = 'Stopped by user.';
      session.finishedAt = nowIso();

      // A run paused for a question, plan review, or approval is not waiting
      // on the LLM abort signal.  Resolve those waiters so the cancelled run
      // can unwind instead of remaining alive until their timeout.
      const question = session.questions;
      session.questions = undefined;
      question?.resolve('(stopped by user)');
      const connection = session.connection;
      session.connection = undefined;
      connection?.resolve(false);
      const planReview = session.planReview;
      session.planReview = undefined;
      planReview?.resolve({ approved: false, note: 'Stopped by user.' });
      for (const approval of session.approvals.values()) approval.resolve(false);
      session.approvals.clear();

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
      // stale non-running status and start a second concurrent Gitu run on
      // the same session/ledger/worktree.
      const prevStatus = session.status;
      const wasRunning = prevStatus === 'running';
      session.status = 'running';
      try {
      const body = await this.readBody(req, 30_000_000);
      const rawFiles = Array.isArray(body['files']) ? body['files'] : [];
      const typedText = typeof body['text'] === 'string' ? body['text'].trim() : '';
      const text = typedText || (rawFiles.length > 0 ? 'Please review the attached file or document.' : '');
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
      let stored: ReturnType<GituServer['storeUserFiles']> = { files: [], attachments: [], images: [] };
      try {
        stored = this.storeUserFiles(
          session,
          rawFiles,
          session.worktreePath ?? session.projectPath ?? this.projectRoot() ?? this.config.cwd,
        );
      } catch (err) {
        if (!wasRunning) session.status = prevStatus;
        this.sendJson(res, 400, { error: (err as Error).message });
        return;
      }
      const modelImages = [...stored.images, ...(images ?? [])].slice(0, 4);
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
        // delivery:'steer' (default) injects the message into the live run so
        // the agent takes it into account at the next step. delivery:'queue'
        // holds it until the run finishes, then it starts a fresh continuation.
        const delivery = body['delivery'] === 'queue' ? 'queue' : 'steer';
        for (const file of stored.files) this.pushEvent(session, `file ${JSON.stringify(this.fileView(file))}`);
        if (delivery === 'queue') {
          (session.queuedUserMessages ??= []).push({ text, attachmentContext: this.attachmentContext(stored.attachments) });
          this.pushEvent(session, `queued  "${text}" — will be delivered when the current run completes`);
          this.sendJson(res, 200, { ok: true, queued: true, delivery });
        } else {
          session.gitu?.queueMessage(text, this.attachmentContext(stored.attachments));
          this.pushEvent(session, `steered  "${text}" — will be delivered to the agent at the next step`);
          this.sendJson(res, 200, { ok: true, steered: true, delivery });
        }
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
      // A task is bound to its own gitu/* branch (or an existing legacy
      // hermes/* branch), but the shared checkout can
      // only hold one branch at a time: any newer run (or a manual switch)
      // moves it and would lock every older session out. Instead of stealing
      // the checkout back — which detaches whichever session owned it — resume
      // in a dedicated linked worktree on this session's own branch. The
      // shared checkout stays exactly where it is.
      let execRoot = taskRoot;
      if (ledger.data.worktreePath && existsSync(ledger.data.worktreePath)) {
        if (this.isPrivateAgentStatePath(taskRoot, ledger.data.worktreePath)) {
          const wt = await this.ensureSessionWorktree(taskRoot, session.taskId, ledger.data.gitBranch ?? '');
          if (!wt) {
            session.status = prevStatus;
            this.sendJson(res, 409, { error: 'Execution rejected: legacy worktree is inside .hermes and could not be migrated to the canonical session workspace.' });
            return;
          }
          execRoot = wt;
          ledger.data.worktreePath = wt;
          ledger.save();
          session.worktreePath = wt;
          this.pushEvent(session, `git     migrated legacy .hermes worktree to canonical session workspace ${wt}`);
        } else {
          execRoot = ledger.data.worktreePath;
        }
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
      let actionProtocolMode = session.actionProtocolMode;
      if (useSelectedModel && selectedProvider && selectedModel) {
        // The UI only sends this flag after the user changes the picker for
        // this session, so a deliberate recovery from an unavailable model is
        // possible without silently changing models on every continuation.
        provider = selectedProvider;
        model = selectedModel;
        session.provider = provider;
        session.model = model;
        session.requestedProvider = provider;
        session.requestedModel = model;
        session.activeProvider = provider;
        session.activeModel = model;
        actionProtocolMode = undefined;
        session.actionProtocolMode = undefined;
        session.fallbackHistory = [];
      } else if ((!provider || !model) && selectedProvider && selectedModel && (!provider || provider === selectedProvider)) {
        provider ??= selectedProvider;
        model ??= selectedModel;
        session.provider = provider;
        session.model = model;
        session.requestedProvider ??= provider;
        session.requestedModel ??= model;
        session.activeProvider = provider;
        session.activeModel = model;
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
          session.activeProvider = provider;
          session.activeModel = model;
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
          const resolved = resolveLlm({ provider, model, workingDirectory: execRoot });
          llm = resolved.client;
          actionProtocolMode = resolved.toolMode;
          session.actionProtocolMode = resolved.toolMode;
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
      for (const file of stored.files) this.pushEvent(session, `file ${JSON.stringify(this.fileView(file))}`);
      this.pushEvent(session, `continue — resuming this session`);
      void this.executeRun(session, llm, {
        goal: session.goal,
        mode: session.mode ?? 'standard',
        review: reviewSwitch ?? false,
        projectPath: execRoot,
        resume: { taskId: session.taskId, message: text },
        conversationHistory,
        images: modelImages.length ? modelImages : undefined,
        attachments: stored.attachments,
        model,
        actionProtocolMode,
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
      attachments?: ModelContextAttachment[];
      model?: string;
      actionProtocolMode?: 'auto' | 'native' | 'structured_text' | 'text';
      conversationHistory?: LlmMessage[];
    },
  ): Promise<void> {
    // Only the Gitu instance currently attached to the session may change
    // its state.  This protects a fresh continuation from a late completion
    // of an earlier run that was stopped or superseded.
    let activeGitu: InstanceType<typeof Gitu> | undefined;
    const isCurrentExecution = (): boolean => session.gitu === activeGitu;
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
              return new UsageTrackingClient(resolveLlm({ provider: def.provider, model: def.model, workingDirectory: root }).client, trackUsage);
            },
            agentRole: (name) => agentStore.get(name)?.role,
            agentEffort: (name) => agentStore.get(name)?.effort,
            onEvent: (t) => {
              if (isCurrentExecution()) this.pushEvent(session, t);
            },
          })
        : undefined;
    session.project = root.split(/[\\/]/).filter(Boolean).pop();
    session.mode ??= opts.mode;
    const lsp = (session.lsp ??= new LspManager(root, undefined, {
      autoInstall: this.config.autoInstallLsp !== false,
      onEvent: (text) => this.pushEvent(session, text),
    }));
    // Provider writes always require an individual approval. This intentionally
    // does not consult autoApprove: a model's ability to select a provider
    // operation must never become blanket authority over user infrastructure.
    const requestApproval = (request: { tool: string; why: string; summary: string }) =>
      new Promise<boolean>((resolve) => {
        const waiter: ApprovalWaiter = {
          id: shortId('appr'),
          tool: request.tool,
          why: request.why,
          summary: request.summary,
          requestedAt: nowIso(),
          resolve,
        };
        session.approvals.set(waiter.id, waiter);
        this.pushEvent(session, `approval-required ${waiter.id} [${request.tool}] ${request.why}`);
        setTimeout(() => {
          if (session.approvals.has(waiter.id)) {
            session.approvals.delete(waiter.id);
            this.pushEvent(session, `approval ${waiter.id} timed out — denied`);
            resolve(false);
          }
        }, this.config.approvalTimeoutMs ?? APPROVAL_TIMEOUT_MS);
      });
    const gitu = new Gitu({
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
      actionProtocolMode: opts.actionProtocolMode,
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
      attachments: opts.attachments,
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
      prerequisiteRecovery: { providers: [this.connections.asPrerequisiteProvider()] },
      connectionContext: () => this.connections.renderForAgent(),
      connectionActionHandler: async ({ connectionId, operationId }) => {
        // Live read path: resolve FIRST (existing or catalog-backed/documented
        // safe GET auto-registers and persists), then execute. No approval
        // channel, no credential prompt, no manual registration request.
        const result = await this.connections.resolveAndExecuteRead({ connectionId, operationId });
        return { message: result.message, ...(result.data !== undefined ? { data: result.data } : {}) };
      },
      // The recovery controller may run ONE read-only operation on its own
      // when the model spirals — never a write: approval stays mandatory.
      safestProviderRead: (preferredConnectionId) => this.connections.safestRead(preferredConnectionId),
      connectionOperationHandler: async (proposal) => {
        const profile = this.connections.get(proposal.connectionId);
        const view = this.connections.list().find((connection) => connection.id === proposal.connectionId);
        if (!profile || !view?.hasCredential) throw new Error('Saved connection is unavailable or needs its credential configured again.');
        const op = normalizeConnectionOperation(proposal.operation);
        if (!op) throw new Error('The proposed provider operation is malformed.');
        // Safe GET/read operations NEVER enter the approval channel: they
        // resolve through the capability resolver (register-if-missing under
        // the existing credential) and execute immediately, like a
        // connection_action. Only non-read proposals go to operation approval.
        if (op.risk === 'read' && op.method === 'GET') {
          const result = await this.connections.resolveAndExecuteRead({
            connectionId: profile.id,
            operation: op,
            capability: op.capability,
            documented: Boolean(proposal.documentationUrl || profile.documentationUrl || catalogCapabilityDeclared(profile.provider, op.capability)),
          });
          return { message: result.message, ...(result.data !== undefined ? { data: result.data } : {}) };
        }
        const capabilityDeclared = profile.capabilities.includes(op.capability);
        // MISSING_OPERATION !== INVALID_CONNECTION: a capability gap on a VALID
        // connection resolves from verified official documentation (the catalog)
        // or the proposal's claimed documentationUrl — it never requires the
        // user to re-enter a credential.
        if (!capabilityDeclared && !catalogCapabilityDeclared(profile.provider, op.capability) && !proposal.documentationUrl) {
          throw new Error(
            `Saved connection "${profile.label}" does not declare capability "${op.capability}", no verified-documentation catalog entry exists for provider "${profile.provider}", and the proposal supplies no documentationUrl. ` +
              `Use a documented operation; the saved credential remains valid — no re-entry is needed.`,
          );
        }
        const documentedCapability = !capabilityDeclared;
        const existing = this.connections.operation(profile.id, op.id);
        if (existing && JSON.stringify(existing) !== JSON.stringify(op)) {
          throw new Error(`Operation id "${op.id}" is already registered with different details. Choose a new documented id; do not retarget an existing operation.`);
        }
        const body = proposal.body === undefined ? undefined : normalizeConnectionOperationBody(proposal.body);
        const bodyText = body === undefined ? '(no request body)' : JSON.stringify(body, null, 2);
        const approved = await requestApproval({
          tool: `connection:${profile.provider}`,
          why: `External ${op.risk} operation — ${proposal.reason}`,
          summary: [
            `Connection: ${profile.label} (${profile.id})`,
            `Operation: ${op.label}`,
            `Request: ${op.method} ${op.path}`,
            `Required capability: ${op.capability}`,
            `Risk: ${op.risk}`,
            `Documentation: ${proposal.documentationUrl ?? profile.documentationUrl ?? 'not supplied'}`,
            `Body:\n${bodyText}`,
          ].join('\n'),
        });
        if (!approved) throw new Error('User denied the provider operation.');
        // Registration happens only after approval. It makes the immutable
        // documented operation discoverable in future tasks, but every write
        // still returns through this approval path before invocation.
        const registered = this.connections.registerApprovedOperation(profile.id, op, documentedCapability);
        const result = await this.connections.invoke(profile.id, registered.id, body);
        return { message: result.message, ...(result.data !== undefined ? { data: result.data } : {}) };
      },
      // The secure form is framed by WHAT the user is being asked to change:
      // 'reauth' only after a positively classified authentication failure,
      // 'setup' for a genuinely first-time connection.
      connectionRecoveryCheck: (prerequisite) => this.connections.connectionRecoveryDecision(prerequisite),
      connectionRequestHandler: (prerequisite) =>
        new Promise<boolean>((resolve) => {
          const decision = this.connections.connectionRecoveryDecision(prerequisite);
          const waiter: ConnectionWaiter = {
            id: shortId('conn'),
            requirement: {
              ...this.connections.requirementFor(prerequisite),
              requestType: decision.action === 'reauth' ? 'reauth' : 'setup',
            },
            requestedAt: nowIso(),
            resolve,
          };
          session.connection = waiter;
          this.pushEvent(session, `connection ${waiter.requirement.requestType === 'reauth' ? 'reauthorization needed' : 'waiting for secure setup'} — ${waiter.requirement.description}`);
          setTimeout(() => {
            if (session.connection === waiter) {
              session.connection = undefined;
              this.pushEvent(session, 'connection setup timed out — prerequisite remains unresolved');
              resolve(false);
            }
          }, this.config.approvalTimeoutMs ?? APPROVAL_TIMEOUT_MS);
        }),
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
      approvalHandler: requestApproval,
      onEvent: (text) => {
        if (!isCurrentExecution()) return;
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
    activeGitu = gitu;
    session.gitu = gitu;

    try {
      const { ledger, report } = await gitu.run(opts.goal);
      if (!isCurrentExecution()) return;
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
      // Queued user messages (delivery:'queue') are held until a run finishes.
      // On a completed run they immediately start a fresh continuation so the
      // agent processes them with the task's durable authority state; on a
      // blocked/failed run they stay queued for the user's next resume.
      const queued = session.queuedUserMessages ?? [];
      if (queued.length > 0 && session.status === 'completed' && session.approvals.size === 0 && !session.planReview && !session.questions) {
        session.queuedUserMessages = [];
        const combined = queued.map((m) => m.text).join('\n\n');
        const attachmentContext = queued.map((m) => m.attachmentContext).filter(Boolean).join('\n\n');
        const message = attachmentContext ? `${combined}\n\n${attachmentContext}` : combined;
        this.pushEvent(session, `user-msg ${combined}`);
        this.pushEvent(session, `continue — delivering ${queued.length} queued message(s) as a new follow-up`);
        void this.executeRun(session, llm, {
          goal: session.goal,
          mode: session.mode ?? 'standard',
          review: false,
          projectPath: root,
          resume: { taskId: session.taskId!, message },
          conversationHistory: this.conversationHistory(session),
          attachments: [],
          model: session.activeModel ?? session.model,
          actionProtocolMode: session.actionProtocolMode,
          autoApprove: session.autoApprove,
        }).catch(() => {});
      }
    } catch (err) {
      if (!isCurrentExecution()) return;
      const llmError = err instanceof LlmError ? err : undefined;
      const canFallback = llmError && ['quota_exhausted', 'billing', 'auth', 'access', 'provider_unavailable', 'rate_limit_temporary'].includes(llmError.details.kind);
      const activeProvider = session.activeProvider ?? session.provider;
      const activeModel = session.activeModel ?? session.model;
      const seen = new Set(session.fallbackHistory ?? []);
      if (canFallback && activeProvider && activeModel) {
        const current = `${activeProvider}::${activeModel}`;
        seen.add(current);
        const configured = (loadWorkspaceSettings().fallbackModels ?? [])
          .find((entry) => !seen.has(entry) && /^[\w.-]+::[\w.\-/]+$/.test(entry));
        const sameProviderFree = configured || !['quota_exhausted', 'billing'].includes(llmError.details.kind)
          ? undefined
          : freeModelFallback(activeProvider, activeModel);
        const candidate = configured ?? (sameProviderFree ? `${activeProvider}::${sameProviderFree}` : undefined);
        if (candidate) {
          const [nextProvider, nextModel] = candidate.split('::') as [string, string];
          try {
            const next = resolveLlm({ provider: nextProvider, model: nextModel, workingDirectory: root });
            session.fallbackHistory = [...seen, candidate].slice(-8);
            session.provider = next.providerId;
            session.model = next.model;
            session.activeProvider = next.providerId;
            session.activeModel = next.model;
            session.actionProtocolMode = next.toolMode;
            session.status = 'running';
            session.error = undefined;
            session.finishedAt = undefined;
            this.pushEvent(
              session,
              `model    ${activeProvider}/${activeModel} failed (${llmError.details.kind}) — automatically continuing with ${configured ? 'configured fallback' : 'same-provider free fallback'} ${next.providerId}/${next.model}; your requested model remains ${session.requestedProvider ?? activeProvider}/${session.requestedModel ?? activeModel}`,
            );
            // Detach the old execution before starting the resume. Its finally
            // block then becomes a no-op and cannot overwrite the new state.
            session.gitu = undefined;
            void this.executeRun(session, next.client, {
              ...opts,
              projectPath: root,
              model: next.model,
              actionProtocolMode: next.toolMode,
              resume: session.taskId
                ? { taskId: session.taskId, message: 'Continue from the preserved task state after the previous model became unavailable.' }
                : opts.resume,
              conversationHistory: this.conversationHistory(session),
            });
            return;
          } catch (fallbackError) {
            this.pushEvent(session, `warn    fallback ${candidate} could not start: ${(fallbackError as Error).message.slice(0, 220)}`);
          }
        }
      }
      session.status = llmError?.details.kind === 'rate_limit_temporary' ? 'waiting_for_model' : 'failed';
      session.error = (err as Error).message;
      this.pushEvent(
        session,
        session.status === 'waiting_for_model'
          ? `waiting-for-model: ${session.error} — task state is preserved; select a configured fallback or retry when the provider recovers`
          : `fatal: ${session.error}`,
      );
    } finally {
      if (!isCurrentExecution()) return;
      session.finishedAt = nowIso();
      this.pushEvent(session, `run finished: ${session.status}`);
      this.saveRegistry();
    }
  }
}

/** @deprecated Use GituServerConfig. */
export type HermesServerConfig = GituServerConfig;
/** @deprecated Use GituServer. Existing callers continue to work. */
export { GituServer as HermesServer };

export function renderReportText(report: CompletionReport): string {
  return new Reporter().render(report);
}
