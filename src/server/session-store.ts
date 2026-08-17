import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { CompletionReport } from '../types.js';
import { ensureHermesHome } from '../workspace/home.js';

export interface StoredSession {
  runId: string;
  taskId?: string;
  goal: string;
  project?: string;
  projectPath?: string;
  startedAt: string;
  status: string;
  finishedAt?: string;
  mode?: 'fast' | 'standard' | 'chat';
  provider?: string;
  model?: string;
  report?: CompletionReport;
  error?: string;
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
    if (!file && !existsSync(primary) && existsSync(legacy)) {
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
         startedAt TEXT,
         status TEXT,
         finishedAt TEXT,
         mode TEXT,
         provider TEXT,
         model TEXT,
         report TEXT,
         error TEXT,
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
    for (const column of ['finishedAt TEXT', 'mode TEXT', 'provider TEXT', 'model TEXT', 'report TEXT', 'error TEXT']) {
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
        `INSERT INTO sessions (runId, taskId, goal, project, projectPath, startedAt, status, finishedAt, mode, provider, model, report, error, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(runId) DO UPDATE SET
           taskId = excluded.taskId,
           goal = excluded.goal,
           project = excluded.project,
           projectPath = excluded.projectPath,
           status = excluded.status,
           finishedAt = excluded.finishedAt,
           mode = excluded.mode,
           provider = excluded.provider,
           model = excluded.model,
           report = excluded.report,
           error = excluded.error,
           updatedAt = excluded.updatedAt`,
      )
      .run(
        s.runId,
        s.taskId ?? null,
        s.goal,
        s.project ?? null,
        s.projectPath ?? null,
        s.startedAt,
        s.status,
        s.finishedAt ?? null,
        s.mode ?? null,
        s.provider ?? null,
        s.model ?? null,
        s.report ? JSON.stringify(s.report) : null,
        s.error ?? null,
        new Date().toISOString(),
      );
  }

  addEvent(runId: string, ev: StoredEvent): void {
    this.db.prepare(`INSERT OR REPLACE INTO events (runId, idx, t, text) VALUES (?, ?, ?, ?)`).run(runId, ev.i, ev.t, ev.text);
  }

  listSessions(): StoredSession[] {
    const rows = this.db
      .prepare(`SELECT runId, taskId, goal, project, projectPath, startedAt, status, finishedAt, mode, provider, model, report, error FROM sessions ORDER BY startedAt DESC`)
      .all() as {
        runId: string;
        taskId: string | null;
        goal: string;
        project: string | null;
        projectPath: string | null;
        startedAt: string;
        status: string;
        finishedAt: string | null;
        mode: string | null;
        provider: string | null;
        model: string | null;
        report: string | null;
        error: string | null;
      }[];
    return rows.map((r) => ({
      runId: r.runId,
      taskId: r.taskId ?? undefined,
      goal: r.goal,
      project: r.project ?? undefined,
      projectPath: r.projectPath ?? undefined,
      startedAt: r.startedAt,
      status: r.status,
      finishedAt: r.finishedAt ?? undefined,
      mode: r.mode === 'fast' || r.mode === 'standard' || r.mode === 'chat' ? r.mode : undefined,
      provider: r.provider ?? undefined,
      model: r.model ?? undefined,
      report: parseReport(r.report),
      error: r.error ?? undefined,
    }));
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

function parseReport(value: string | null): CompletionReport | undefined {
  if (!value) return undefined;
  try {
    const report = JSON.parse(value) as CompletionReport;
    return report && typeof report.summary === 'string' ? report : undefined;
  } catch {
    return undefined;
  }
}
