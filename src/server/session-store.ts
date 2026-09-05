import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { CompletionReport } from '../types.js';
import { ensureGituHome, homeEnvOverride } from '../workspace/home.js';

export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  messages: number;
}

export interface StoredSession {
  runId: string;
  taskId?: string;
  goal: string;
  project?: string;
  projectPath?: string;
  branch?: string;
  worktreePath?: string;
  startedAt: string;
  status: string;
  finishedAt?: string;
  mode?: 'agent' | 'fast' | 'standard' | 'chat';
  provider?: string;
  model?: string;
  /** The model the user selected when the run began. Never overwritten by fallback. */
  requestedProvider?: string;
  requestedModel?: string;
  /** The model currently executing the run; mirrors provider/model for legacy clients. */
  activeProvider?: string;
  activeModel?: string;
  report?: CompletionReport;
  error?: string;
  usage?: SessionUsage;
}

export interface StoredEvent {
  i: number;
  t: string;
  text: string;
}

export interface StoredSessionFile {
  runId: string;
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: 'user' | 'assistant';
  path: string;
  createdAt: string;
}

export class SessionStore {
  private readonly db: DatabaseSync;

  constructor(file?: string) {
    const home = ensureGituHome();
    const primary = path.join(home.sessions, 'hermes.db');
    const legacy = path.join(os.homedir(), '.hermes', 'hermes.db');
    let target = file ?? primary;
    // An explicitly overridden home (tests, scratch instances) stays isolated
    // and must never inherit the user's real session history.
    if (!file && !existsSync(primary) && existsSync(legacy) && !homeEnvOverride()) {
      try {
        copyFileSync(legacy, primary);
      } catch {
        target = legacy;
      }
    }
    mkdirSync(path.dirname(target), { recursive: true });
    this.db = new DatabaseSync(target);
    this.db.exec(
      `CREATE TABLE IF NOT EXISTS sessions (
         runId TEXT PRIMARY KEY,
         taskId TEXT,
         goal TEXT,
         project TEXT,
         projectPath TEXT,
         branch TEXT,
         worktreePath TEXT,
         startedAt TEXT,
         status TEXT,
         finishedAt TEXT,
         mode TEXT,
         provider TEXT,
         model TEXT,
         requestedProvider TEXT,
         requestedModel TEXT,
         activeProvider TEXT,
         activeModel TEXT,
         report TEXT,
         error TEXT,
         usage TEXT,
         updatedAt TEXT
       );
       CREATE TABLE IF NOT EXISTS events (
         runId TEXT,
         idx INTEGER,
         t TEXT,
         text TEXT,
         PRIMARY KEY (runId, idx)
       );
       CREATE TABLE IF NOT EXISTS session_files (
         runId TEXT,
         id TEXT,
         name TEXT,
         mime TEXT,
         size INTEGER,
         kind TEXT,
         path TEXT,
         createdAt TEXT,
         PRIMARY KEY (runId, id)
       );`,
    );
    // Existing installations created the sessions table before these fields
    // existed. SQLite has no ADD COLUMN IF NOT EXISTS, so ignore the harmless
    // duplicate-column error on an already-migrated database.
    for (const column of [
      'finishedAt TEXT',
      'mode TEXT',
      'provider TEXT',
      'model TEXT',
      'requestedProvider TEXT',
      'requestedModel TEXT',
      'activeProvider TEXT',
      'activeModel TEXT',
      'report TEXT',
      'error TEXT',
      'usage TEXT',
      'branch TEXT',
      'worktreePath TEXT',
    ]) {
      try {
        this.db.exec(`ALTER TABLE sessions ADD COLUMN ${column}`);
      } catch {
        /* column already exists */
      }
    }
  }

  upsertSession(s: StoredSession): void {
    this.db
      .prepare(
        `INSERT INTO sessions (runId, taskId, goal, project, projectPath, branch, worktreePath, startedAt, status, finishedAt, mode, provider, model, requestedProvider, requestedModel, activeProvider, activeModel, report, error, usage, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(runId) DO UPDATE SET
           taskId = excluded.taskId,
           goal = excluded.goal,
           project = excluded.project,
           projectPath = excluded.projectPath,
           branch = excluded.branch,
           worktreePath = excluded.worktreePath,
           status = excluded.status,
           finishedAt = excluded.finishedAt,
           mode = excluded.mode,
           provider = excluded.provider,
           model = excluded.model,
           requestedProvider = excluded.requestedProvider,
           requestedModel = excluded.requestedModel,
           activeProvider = excluded.activeProvider,
           activeModel = excluded.activeModel,
           report = excluded.report,
           error = excluded.error,
           usage = excluded.usage,
           updatedAt = excluded.updatedAt`,
      )
      .run(
        s.runId,
        s.taskId ?? null,
        s.goal ?? null,
        s.project ?? null,
        s.projectPath ?? null,
        s.branch ?? null,
        s.worktreePath ?? null,
        s.startedAt ?? null,
        s.status,
        s.finishedAt ?? null,
        s.mode ?? null,
        s.provider ?? null,
        s.model ?? null,
        s.requestedProvider ?? null,
        s.requestedModel ?? null,
        s.activeProvider ?? s.provider ?? null,
        s.activeModel ?? s.model ?? null,
        s.report ? JSON.stringify(s.report) : null,
        s.error ?? null,
        s.usage ? JSON.stringify(s.usage) : null,
        new Date().toISOString(),
      );
  }

  addEvent(runId: string, ev: StoredEvent): void {
    this.db.prepare(`INSERT OR REPLACE INTO events (runId, idx, t, text) VALUES (?, ?, ?, ?)`).run(runId, ev.i, ev.t, ev.text);
  }

  deleteEvent(runId: string, idx: number): void {
    this.db.prepare(`DELETE FROM events WHERE runId = ? AND idx = ?`).run(runId, idx);
  }

  addSessionFile(file: StoredSessionFile): void {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO session_files (runId, id, name, mime, size, kind, path, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(file.runId, file.id, file.name, file.mime, file.size, file.kind, file.path, file.createdAt);
  }

  filesFor(runId: string): StoredSessionFile[] {
    return this.db
      .prepare(`SELECT runId, id, name, mime, size, kind, path, createdAt FROM session_files WHERE runId = ? ORDER BY createdAt ASC`)
      .all(runId)
      .map((row) => {
        const file = row as Record<string, unknown>;
        return {
          runId: String(file['runId'] ?? runId),
          id: String(file['id'] ?? ''),
          name: String(file['name'] ?? 'file'),
          mime: String(file['mime'] ?? 'application/octet-stream'),
          size: Number(file['size'] ?? 0),
          kind: file['kind'] === 'assistant' ? 'assistant' : 'user',
          path: String(file['path'] ?? ''),
          createdAt: String(file['createdAt'] ?? ''),
        } satisfies StoredSessionFile;
      });
  }

  listSessions(): StoredSession[] {
    const rows = this.db
      .prepare(`SELECT runId, taskId, goal, project, projectPath, branch, worktreePath, startedAt, status, finishedAt, mode, provider, model, requestedProvider, requestedModel, activeProvider, activeModel, report, error, usage FROM sessions ORDER BY startedAt DESC`)
      .all() as {
        runId: string;
        taskId: string | null;
        goal: string;
        project: string | null;
        projectPath: string | null;
        branch: string | null;
        worktreePath: string | null;
        startedAt: string;
        status: string;
        finishedAt: string | null;
        mode: string | null;
        provider: string | null;
        model: string | null;
        requestedProvider: string | null;
        requestedModel: string | null;
        activeProvider: string | null;
        activeModel: string | null;
        report: string | null;
        error: string | null;
        usage: string | null;
      }[];
    return rows.map((r) => ({
      runId: r.runId,
      taskId: r.taskId ?? undefined,
      goal: r.goal,
      project: r.project ?? undefined,
      projectPath: r.projectPath ?? undefined,
      branch: r.branch ?? undefined,
      worktreePath: r.worktreePath ?? undefined,
      startedAt: r.startedAt,
      status: r.status,
      finishedAt: r.finishedAt ?? undefined,
      mode: r.mode === 'agent' || r.mode === 'fast' || r.mode === 'standard' || r.mode === 'chat' ? r.mode : undefined,
      provider: r.provider ?? undefined,
      model: r.model ?? undefined,
      requestedProvider: r.requestedProvider ?? r.provider ?? undefined,
      requestedModel: r.requestedModel ?? r.model ?? undefined,
      activeProvider: r.activeProvider ?? r.provider ?? undefined,
      activeModel: r.activeModel ?? r.model ?? undefined,
      report: parseReport(r.report),
      error: r.error ?? undefined,
      usage: parseUsage(r.usage),
    }));
  }

  getSessionByTaskId(taskId: string): StoredSession | undefined {
    const r = this.db
      .prepare(`SELECT runId, taskId, goal, project, projectPath, branch, worktreePath, startedAt, status, finishedAt, mode, provider, model, requestedProvider, requestedModel, activeProvider, activeModel, report, error, usage FROM sessions WHERE taskId = ? ORDER BY startedAt DESC LIMIT 1`)
      .get(taskId) as {
        runId: string;
        taskId: string | null;
        goal: string;
        project: string | null;
        projectPath: string | null;
        branch: string | null;
        worktreePath: string | null;
        startedAt: string;
        status: string;
        finishedAt: string | null;
        mode: string | null;
        provider: string | null;
        model: string | null;
        requestedProvider: string | null;
        requestedModel: string | null;
        activeProvider: string | null;
        activeModel: string | null;
        report: string | null;
        error: string | null;
        usage: string | null;
      } | undefined;
    if (!r) return undefined;
    return {
      runId: r.runId,
      taskId: r.taskId ?? undefined,
      goal: r.goal,
      project: r.project ?? undefined,
      projectPath: r.projectPath ?? undefined,
      branch: r.branch ?? undefined,
      worktreePath: r.worktreePath ?? undefined,
      startedAt: r.startedAt,
      status: r.status,
      finishedAt: r.finishedAt ?? undefined,
      mode: r.mode === 'agent' || r.mode === 'fast' || r.mode === 'standard' || r.mode === 'chat' ? r.mode : undefined,
      provider: r.provider ?? undefined,
      model: r.model ?? undefined,
      requestedProvider: r.requestedProvider ?? r.provider ?? undefined,
      requestedModel: r.requestedModel ?? r.model ?? undefined,
      activeProvider: r.activeProvider ?? r.provider ?? undefined,
      activeModel: r.activeModel ?? r.model ?? undefined,
      report: parseReport(r.report),
      error: r.error ?? undefined,
      usage: parseUsage(r.usage),
    };
  }

  eventsFor(runId: string): StoredEvent[] {
    return this.db.prepare(`SELECT idx AS i, t, text FROM events WHERE runId = ? ORDER BY idx ASC`).all(runId) as unknown as StoredEvent[];
  }

  deleteSessionsForProject(filter: { path?: string; name?: string }): number {
    const rows = this.db
      .prepare(`SELECT runId FROM sessions WHERE (?1 IS NOT NULL AND projectPath = ?1) OR (?2 IS NOT NULL AND project = ?2)`)
      .all(filter.path ?? null, filter.name ?? null) as { runId: string }[];
    for (const r of rows) {
      this.db.prepare(`DELETE FROM events WHERE runId = ?`).run(r.runId);
      this.db.prepare(`DELETE FROM session_files WHERE runId = ?`).run(r.runId);
      this.db.prepare(`DELETE FROM sessions WHERE runId = ?`).run(r.runId);
    }
    return rows.length;
  }

  deleteSession(runId: string): boolean {
    this.db.prepare(`DELETE FROM events WHERE runId = ?`).run(runId);
    this.db.prepare(`DELETE FROM session_files WHERE runId = ?`).run(runId);
    const res = this.db.prepare(`DELETE FROM sessions WHERE runId = ?`).run(runId);
    return Number(res.changes) > 0;
  }

  close(): void {
    this.db.close();
  }
}

function parseUsage(value: string | null): SessionUsage | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(value) as Partial<SessionUsage>;
    const usage: SessionUsage = {
      inputTokens: Number(parsed.inputTokens) || 0,
      outputTokens: Number(parsed.outputTokens) || 0,
      cachedTokens: Number(parsed.cachedTokens) || 0,
      messages: Number(parsed.messages) || 0,
    };
    return usage.inputTokens || usage.outputTokens || usage.cachedTokens || usage.messages ? usage : undefined;
  } catch {
    return undefined;
  }
}

function parseReport(value: string | null): CompletionReport | undefined {
  if (!value) return undefined;
  try {
    const report = JSON.parse(value) as CompletionReport;
    return report && typeof report.summary === 'string' ? report : undefined;
  } catch {
    return undefined;
  }
}
