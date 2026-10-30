import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it, vi } from 'vitest';
import { SessionStore } from '../src/server/session-store.js';

it('records the failure class that ended a turn so failure rates are measurable', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'gitu-failure-class-'));
  const store = new SessionStore(path.join(home, 'sessions.sqlite'));
  try {
    store.upsertSession({ runId: 'failed-run', taskId: 'task-1', goal: 'Fix the renderer', startedAt: new Date().toISOString(), status: 'failed', error: 'The model turn failed: 429 rate limit', failureClass: 'rate_limit_temporary' });
    store.upsertSession({ runId: 'ok-run', goal: 'Read the config', startedAt: new Date().toISOString(), status: 'completed' });
    expect(store.listSessions().find((session) => session.runId === 'failed-run')).toMatchObject({
      failureClass: 'rate_limit_temporary',
      error: 'The model turn failed: 429 rate limit',
    });
    expect(store.getSessionByTaskId('task-1')?.failureClass).toBe('rate_limit_temporary');
    // A turn that did not fail carries no class, rather than a default one.
    expect(store.listSessions().find((session) => session.runId === 'ok-run')?.failureClass).toBeUndefined();
  } finally {
    store.close();
    rmSync(home, { recursive: true, force: true });
  }
});

it('adds the failure-class column to a database created before it existed', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'gitu-failure-migration-'));
  const file = path.join(home, 'sessions.sqlite');
  const legacy = new DatabaseSync(file);
  // The schema as it stood before this column existed: every base column
  // present, only the later additions missing.
  legacy.exec(`CREATE TABLE sessions (
    runId TEXT PRIMARY KEY, taskId TEXT, goal TEXT, project TEXT, projectPath TEXT,
    taggedFolders TEXT, writableFolders TEXT, branch TEXT, worktreePath TEXT,
    startedAt TEXT, status TEXT, finishedAt TEXT, mode TEXT, provider TEXT, model TEXT,
    requestedProvider TEXT, requestedModel TEXT, activeProvider TEXT, activeModel TEXT,
    report TEXT, error TEXT, usage TEXT, updatedAt TEXT
  )`);
  legacy.prepare(`INSERT INTO sessions (runId, goal, startedAt, status) VALUES (?, ?, ?, ?)`).run('old-run', 'Earlier work', new Date().toISOString(), 'completed');
  legacy.close();

  const store = new SessionStore(file);
  try {
    // The pre-existing row survives the migration and simply has no class.
    expect(store.listSessions().map((session) => session.runId)).toContain('old-run');
    expect(store.listSessions().find((session) => session.runId === 'old-run')?.failureClass).toBeUndefined();
    store.upsertSession({ runId: 'old-run', goal: 'Earlier work', startedAt: new Date().toISOString(), status: 'failed', failureClass: 'auth' });
    expect(store.listSessions().find((session) => session.runId === 'old-run')?.failureClass).toBe('auth');
  } finally {
    store.close();
    rmSync(home, { recursive: true, force: true });
  }
});

it('keeps coding events and completion writable while another connection reads task history', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'gitu-session-concurrency-'));
  vi.stubEnv('AGENT_GITU_HOME', home);
  const file = path.join(home, 'sessions.sqlite'), store = new SessionStore(file);
  let reader: DatabaseSync | undefined;
  try {
    const session = {runId:'fixture-run',goal:'Verify coding persistence',startedAt:new Date().toISOString(),status:'running'};
    store.upsertSession(session);
    reader = new DatabaseSync(file, {readOnly:true});
    reader.exec('BEGIN');
    expect(reader.prepare('SELECT status FROM sessions WHERE runId=?').get(session.runId)?.status).toBe('running');
    // The inspector holds its read snapshot while the coding agent emits events.
    expect(() => {
      store.addEvent(session.runId,{i:0,t:session.startedAt,text:'Implementation verified'});
      store.addNativeFrame(session.runId,{t:session.startedAt,typed:{type:'completed',summary:'Verified'}},100);
      store.upsertSession({...session,status:'completed',finishedAt:new Date().toISOString()});
    }).not.toThrow();
    expect(reader.prepare('SELECT status FROM sessions WHERE runId=?').get(session.runId)?.status).toBe('running');
    reader.exec('COMMIT');
    expect(reader.prepare('SELECT status FROM sessions WHERE runId=?').get(session.runId)?.status).toBe('completed');
    expect(store.eventsFor(session.runId)).toHaveLength(1);
    expect(store.nativeFramesFor(session.runId)).toHaveLength(1);
  } finally {
    reader?.close();store.close();vi.unstubAllEnvs();rmSync(home,{recursive:true,force:true});
  }
});
