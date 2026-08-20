import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { CompletionReport } from '../types.js';
import { ensureHermesHome, homeEnvOverride } from '../workspace/home.js';

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
  mode?: 'fast' | 'standard' | 'chat';
  provider?: string;
  model?: string;
  report?: CompletionReport;
  error?: string;
  usage?: SessionUsage;
}

export interface StoredEvent {
  i: number;
  t: string;
  text: string;
}

export class SessionStore {
  private readonly db: DatabaseSync;

  constructor(file?: string) {
    const home = ensureHermesHome();
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
        `INSERT INTO sessions (runId, taskId, goal, project, projectPath, branch, worktreePath, startedAt, status, finishedAt, mode, provider, model, report, error, usage, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
           report = excluded.report,
           error = excluded.error,
           usage = excluded.usage,
           updatedAt = excluded.updatedAt`,
      )
      .run(
        s.runId,
        s.taskId ?? null,
        s.goal,
        s.project ?? null,
        s.projectPath ?? null,
        s.branch ?? null,
        s.worktreePath ?? null,
        s.startedAt,
        s.status,
        s.finishedAt ?? null,
        s.mode ?? null,
        s.provider ?? null,
        s.model ?? null,
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

  listSessions(): StoredSession[] {
    const rows = this.db
      .prepare(`SELECT runId, taskId, goal, project, projectPath, branch, worktreePath, startedAt, status, finishedAt, mode, provider, model, report, error, usage FROM sessions ORDER BY startedAt DESC`)
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
      mode: r.mode === 'fast' || r.mode === 'standard' || r.mode === 'chat' ? r.mode : undefined,
      provider: r.provider ?? undefined,
      model: r.model ?? undefined,
      report: parseReport(r.report),
      error: r.error ?? undefined,
      usage: parseUsage(r.usage),
    }));
  }

  getSessionByTaskId(taskId: string): StoredSession | undefined {
    const r = this.db
      .prepare(`SELECT runId, taskId, goal, project, projectPath, branch, worktreePath, startedAt, status, finishedAt, mode, provider, model, report, error, usage FROM sessions WHERE taskId = ? ORDER BY startedAt DESC LIMIT 1`)
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
      mode: r.mode === 'fast' || r.mode === 'standard' || r.mode === 'chat' ? r.mode : undefined,
      provider: r.provider ?? undefined,
      model: r.model ?? undefined,
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
      this.db.prepare(`DELETE FROM sessions WHERE runId = ?`).run(r.runId);
    }
    return rows.length;
  }

  deleteSession(runId: string): boolean {
    this.db.prepare(`DELETE FROM events WHERE runId = ?`).run(runId);
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
