import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { expect, it, vi } from 'vitest';
import { SessionStore } from '../src/server/session-store.js';

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
