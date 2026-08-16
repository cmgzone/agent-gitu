import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ensureHermesHome } from '../workspace/home.js';

export interface StoredSession {
  runId: string;
  taskId?: string;
  goal: string;
  project?: string;
  projectPath?: string;
  startedAt: string;
  status: string;
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
  }

  upsertSession(s: StoredSession): void {
    this.db
      .prepare(
        `INSERT INTO sessions (runId, taskId, goal, project, projectPath, startedAt, status, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(runId) DO UPDATE SET
           taskId = excluded.taskId,
           goal = excluded.goal,
           project = excluded.project,
           projectPath = excluded.projectPath,
           status = excluded.status,
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
        new Date().toISOString(),
      );
  }

  addEvent(runId: string, ev: StoredEvent): void {
    this.db.prepare(`INSERT OR REPLACE INTO events (runId, idx, t, text) VALUES (?, ?, ?, ?)`).run(runId, ev.i, ev.t, ev.text);
  }

  listSessions(): StoredSession[] {
    const rows = this.db
      .prepare(`SELECT runId, taskId, goal, project, projectPath, startedAt, status FROM sessions ORDER BY startedAt DESC`)
      .all() as { runId: string; taskId: string | null; goal: string; project: string | null; projectPath: string | null; startedAt: string; status: string }[];
    return rows.map((r) => ({
      runId: r.runId,
      taskId: r.taskId ?? undefined,
      goal: r.goal,
      project: r.project ?? undefined,
      projectPath: r.projectPath ?? undefined,
      startedAt: r.startedAt,
      status: r.status,
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
