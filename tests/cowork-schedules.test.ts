import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { CoworkStore } from '../src/cowork/store.js';
import { executeCoworkTool } from '../src/cowork/tools.js';
import { CoworkMemory } from '../src/cowork/memory.js';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import type { ToolContext } from '../src/tools/tools.js';

it('exposes pending tool-created reminders with recurring schedules and removes reminders with their session', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'cowork-schedules-'));
  const previousHome = process.env['AGENT_GITU_HOME'];
  process.env['AGENT_GITU_HOME'] = home;
  const store = new CoworkStore();
  const agent = store.saveAgent({ name: 'Planner', systemPrompt: 'Help with scheduled work.' });
  const conversation = store.saveConversation({ kind: 'dm', title: 'Launch review', memberIds: [agent.id],
    schedule: { every: '1d', goal: 'Review the launch', enabled: false } });
  const other = store.saveConversation({ kind: 'dm', title: 'Other work', memberIds: [agent.id] });
  const scope = { store, agent, memory: CoworkMemory.forWorkspace(), conversationId: conversation.id };
  const scheduled = await executeCoworkTool({ cwd: home } as ToolContext, 'schedule_followup', { inMinutes: 30, note: 'Verify the launch results' },
    { allowShell: false, allowWrites: false, allowConfig: false, chief: false, browser: false }, scope);
  expect(scheduled.ok).toBe(true);
  const otherReminder = store.addFollowUp({ conversationId: other.id, agentId: agent.id, note: 'Review the other result', dueAt: new Date(Date.now() + 3600_000).toISOString() });
  expect(store.dueFollowUps()).toEqual([]);
  expect(new CoworkStore().listFollowUps()).toHaveLength(2);
  const server = new GituServer({ passwordRequired: false, cwd: path.join(home, 'Workspace'), port: 0, llm: new ScriptedMockLlm([() => 'Preview response.']) });
  try {
    const base = `http://127.0.0.1:${await server.start()}`;
    const response = await fetch(base + '/api/cowork/conversations');
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.conversations.find((item: any) => item.id === conversation.id).schedule).toMatchObject({ every: '1d', enabled: false });
    expect(data.followUps).toHaveLength(2);
    expect(data.followUps.find((item: any) => item.conversationId === conversation.id)).toMatchObject({ note: 'Verify the launch results', agentId: agent.id });
    expect((await fetch(base + '/api/cowork/conversations/' + conversation.id, { method: 'DELETE' })).status).toBe(200);
    const after = await fetch(base + '/api/cowork/conversations').then(response => response.json());
    expect(after.followUps).toEqual([otherReminder]);
    const reloaded = new CoworkStore();
    expect(reloaded.listFollowUps()).toEqual([otherReminder]);
    reloaded.takeFollowUp(otherReminder.id); expect(reloaded.listFollowUps()).toEqual([]);
  } finally {
    await server.stop();
    if (previousHome === undefined) delete process.env['AGENT_GITU_HOME']; else process.env['AGENT_GITU_HOME'] = previousHome;
    await rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}, 20000);
