import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { CoworkStore, type CoworkWorkEntry } from '../src/cowork/store.js';
import { coworkActivityView } from '../src/server/cowork-activity.js';

it('keeps completed work across reloads and isolates conversations and threads', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'cw-activity-'));
  try {
    const file = path.join(directory, 'cowork.json');
    const store = new CoworkStore(file);
    const entry = { conversationId: 'chat', agentId: 'agent', tool: 'read_file', ok: true, output: 'file contents' };
    store.recordWork({ ...entry, publicUpdate: 'Checking the current configuration.' });
    store.recordWork({ ...entry, threadId: 'topic', tool: 'run_command', ok: false });
    store.recordWork({ ...entry, conversationId: 'other' });
    const reloaded = new CoworkStore(file);
    expect(reloaded.workHistory('chat')).toHaveLength(1);
    expect(reloaded.workHistory('chat')[0]?.publicUpdate).toBe('Checking the current configuration.');
    expect(reloaded.workHistory('chat', 'topic')).toMatchObject([{ tool: 'run_command', ok: false }]);
    expect(reloaded.workHistory('missing')).toEqual([]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('publishes action results without exposing tool output or credentials', () => {
  const entry: CoworkWorkEntry = {
    conversationId: 'chat', agentId: 'agent', tool: 'ssh_exec', ok: false,
    output: 'PRIVATE SERVER OUTPUT: secret configuration', ts: '2026-09-26T10:00:00Z',
    publicUpdate: 'Checking the connection. password=verySecret1234',
  };
  const view = coworkActivityView(entry, 'Maintainer', 0);
  expect(view).toMatchObject({ agentId: 'agent', agentName: 'Maintainer', tool: 'ssh_exec', ok: false, ts: entry.ts });
  expect(view.publicUpdate).toContain('Checking the connection.');
  expect(JSON.stringify(view)).not.toContain('verySecret1234');
  expect(JSON.stringify(view)).not.toContain('PRIVATE SERVER OUTPUT');
  expect(view).not.toHaveProperty('output');
});
