import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { CoworkStore } from '../src/cowork/store.js';
import { appAwareness, connectionQuestion, connectionReply } from '../src/cowork/app-awareness.js';
import { runConversationTurn, runMissionSession, answerCoworkQuestion } from '../src/cowork/runner.js';
import { mailToolDefinitions } from '../src/connections/mail.js';
import type { ConnectedAppsProvider } from '../src/connections/provider.js';
import type { LlmClient } from '../src/llm/llm.js';

const root = mkdtempSync(path.join(tmpdir(), 'gitu-app-awareness-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let sequence = 0;
function fixture() {
  const store = new CoworkStore(path.join(root, `${++sequence}.json`));
  const agent = store.saveAgent({ name: 'Mimi', systemPrompt: 'Help.' });
  const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
  const apps = { configured: true, setup: { canConfigure: true, keyStorage: 'test' }, accounts: vi.fn(async () => []), catalog: vi.fn(async () => ({ services: [] })), tools: vi.fn(async () => []), execute: vi.fn() } as ConnectedAppsProvider;
  return { store, agent, conversation, apps };
}
describe('Immediate teammate app awareness', () => {
  it('answers the email question and posts Connect without a model or account lookup', async () => {
    const f = fixture(), complete = vi.fn();
    const trigger = f.store.appendMessage(f.conversation.id, { role: 'user', via: 'web', text: 'Are you connected to my email?' });
    const result = await runConversationTurn({ conversation: f.conversation, trigger, history: [trigger], deps: { store: f.store, agents: [f.agent], connectedApps: f.apps, resolveLlm: () => ({ complete } as unknown as LlmClient), toolContext: vi.fn() }, append: message => f.store.appendMessage(f.conversation.id, message) });
    expect(result.error).toBeUndefined();
    expect(result.messages.at(-1)?.text).toContain('Use Connect');
    expect(f.store.openRequests(f.conversation.id)).toEqual([expect.objectContaining({ appConnection: expect.objectContaining({ service: 'mail', resumeWork: false }) })]);
    expect(complete).not.toHaveBeenCalled(); expect(f.apps.accounts).not.toHaveBeenCalled();
  });
  it('reports only active accounts assigned to this teammate and notices unassignment immediately', async () => {
    const f = fixture(); f.store.assignAppAccount(f.agent.id, 'gmail', 'own');
    vi.mocked(f.apps.accounts).mockResolvedValue([{ id: 'own', toolkit: 'gmail', status: 'ACTIVE', disabled: false }, { id: 'foreign', toolkit: 'github', status: 'ACTIVE', disabled: false }]);
    const awareness = await appAwareness(f.apps, f.store, f.agent.id);
    expect(awareness.accounts.map(account => account.id)).toEqual(['own']);
    const reply = await connectionReply({ ...f, text: 'Can you access my email?', history: [], agentId: f.agent.id, conversationId: f.conversation.id, awareness });
    expect(reply).toContain('Gmail is connected');
    f.store.unassignAppAccount(f.agent.id, 'own');
    expect((await appAwareness(f.apps, f.store, f.agent.id)).accounts).toEqual([]);
  });
  it('uses context for check again and leaves actual email work with the agent', () => {
    const f = fixture(), question = f.store.appendMessage(f.conversation.id, { role: 'user', via: 'web', text: 'Are you connected to my email?' });
    expect(connectionQuestion('check a gain', [question])).toEqual({ service: 'mail' });
    expect(connectionQuestion('Read my email and reply to the latest message.', [])).toBeUndefined();
    expect(connectionQuestion('Are you connected? Send my emails.', [])).toBeUndefined();
  });
  it('does not confuse a provider outage with a disconnected account', async () => {
    const f = fixture(); f.store.assignAppAccount(f.agent.id, 'gmail', 'own');
    const apps = { ...f.apps, accountStatusIncomplete: true };
    const awareness = await appAwareness(apps, f.store, f.agent.id);
    expect(awareness.accounts[0]?.status).toBe('UNKNOWN');
    const reply = await connectionReply({ ...f, apps, text: 'Are you connected to Gmail?', history: [], agentId: f.agent.id, conversationId: f.conversation.id, awareness });
    expect(reply).toContain('couldn’t refresh'); expect(f.store.openRequests(f.conversation.id)).toHaveLength(0);
  });
  it('provides exact native mailbox schemas to chat and mission models only for active assigned mail', async () => {
    const f = fixture();
    f.store.assignAppAccount(f.agent.id, 'mail', 'mail-own');
    vi.mocked(f.apps.accounts).mockResolvedValue([{ id: 'mail-own', toolkit: 'mail', status: 'ACTIVE', disabled: false }, { id: 'mail-foreign', toolkit: 'mail', status: 'ACTIVE', disabled: false }]);
    const complete = vi.fn(async messages => {
      const prompt = String(messages[0]?.content);
      for (const tool of mailToolDefinitions()) expect(prompt).toContain(tool.slug);
      expect(prompt).toContain('service:"mail"');
      expect(prompt).toContain('mail-own');
      expect(prompt).not.toContain('mail-foreign');
      return '{"status":"done","progress":"Checked assigned mailbox actions.","criteriaMet":[],"result":"Done."}';
    });
    const deps = { store: f.store, agents: [f.agent], connectedApps: f.apps, resolveLlm: () => ({ complete } as unknown as LlmClient), toolContext: vi.fn(), autoLearn: false };
    const trigger = f.store.appendMessage(f.conversation.id, { role: 'user', via: 'web', text: 'Which mailbox actions can you use?' });
    await runConversationTurn({ conversation: f.conversation, trigger, history: [trigger], deps, append: message => f.store.appendMessage(f.conversation.id, message) });
    const mission = f.store.createMission({ conversationId: f.conversation.id, agentId: f.agent.id, goal: 'Check the mailbox', criteria: [], maxTurns: 2 });
    const result = await runMissionSession({ mission, agent: f.agent, deps, append: message => f.store.appendMessage(f.conversation.id, message) });
    expect(result.status).toBe('done');
    const before = JSON.stringify(f.store.missions());
    const answer = await answerCoworkQuestion({ agent: f.agent, conversation: f.conversation, members: [f.agent], history: [trigger], question: 'Which email tools are available?', state: 'Working on the same mission.', appContext: (await appAwareness(f.apps, f.store, f.agent.id)).context, llm: { complete: async (messages, options) => {
      expect(messages.some(message => String(message.content).includes('mail_read'))).toBe(true);
      expect(options?.toolChoice).toBe('none');
      return 'I can read your assigned mailbox.';
    } } as LlmClient });
    expect(answer).toBe('I can read your assigned mailbox.');
    expect(JSON.stringify(f.store.missions())).toBe(before);
    expect(f.apps.execute).not.toHaveBeenCalled();
    f.store.unassignAppAccount(f.agent.id, 'mail-own');
    expect((await appAwareness(f.apps, f.store, f.agent.id)).context).not.toContain('mail_read');
  });
  it('does not delay a response for an old-history model summary or expose maintenance chatter', async () => {
    const f = fixture();
    for (let i = 0; i < 60; i++) f.store.appendMessage(f.conversation.id, { role: 'agent', agentId: f.agent.id, via: 'web', text: `Old message ${i}` });
    const trigger = f.store.appendMessage(f.conversation.id, { role: 'user', via: 'web', text: 'Hello.' });
    let finishSummary!: (text: string) => void;
    const progress = vi.fn();
    const complete = vi.fn(async (messages) => String(messages[0]?.content).includes('CONTEXT CHECKPOINT') ? await new Promise<string>(resolve => { finishSummary = resolve; }) : 'Hello!');
    const result = await runConversationTurn({ conversation: f.conversation, trigger, history: f.store.messages(f.conversation.id), deps: { store: f.store, agents: [f.agent], resolveLlm: () => ({ complete } as unknown as LlmClient), toolContext: vi.fn(), onProgress: progress, autoLearn: false }, append: message => f.store.appendMessage(f.conversation.id, message) });
    expect(result.messages.at(-1)?.text).toBe('Hello!');
    expect(JSON.stringify(progress.mock.calls)).not.toMatch(/preserv|compac/i);
    finishSummary(JSON.stringify({ summary: 'A greeting, no active task.' }));
    await vi.waitFor(() => expect(f.store.contextCheckpoint(f.conversation.id, f.agent.id)).toBeDefined());
  });
});
