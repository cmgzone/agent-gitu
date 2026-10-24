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
  it.each([
    'Can we talk about my Gmail connection?',
    'What I mean is the connection should remember its capabilities.',
    'My GitHub connection is ready; can you explain the deployment plan?',
    'Can you rename my Coolify connection?',
    'Are you connected to Coolify?',
    'Can you check the application logs through my Coolify connection?',
    'Show me how to fix the email connection.',
  ])('leaves normal discussion and custom API work with the agent: %s',async text=>{
    const f=fixture(),complete=vi.fn(async()=> 'I understand the connection request and will discuss it in context.');
    expect(connectionQuestion(text,[])).toBeUndefined();
    const trigger=f.store.appendMessage(f.conversation.id,{role:'user',via:'web',text});
    const result=await runConversationTurn({conversation:f.conversation,trigger,history:[trigger],deps:{store:f.store,agents:[f.agent],connectedApps:f.apps,resolveLlm:()=>({complete} as unknown as LlmClient),toolContext:vi.fn(),autoLearn:false},append:message=>f.store.appendMessage(f.conversation.id,message)});
    expect(result.error).toBeUndefined();expect(complete).toHaveBeenCalled();expect(result.messages.at(-1)?.text).toContain('discuss it in context');
    expect(f.store.openRequests(f.conversation.id)).toHaveLength(0);expect(f.apps.catalog).not.toHaveBeenCalled();
  });
  it('reports native inbox and outgoing failures separately instead of claiming the mailbox expired', async () => {
    const f=fixture();f.store.assignAppAccount(f.agent.id,'mail','own');
    vi.mocked(f.apps.accounts).mockResolvedValue([{id:'own',toolkit:'mail',status:'ACTIVE',disabled:false,mailHealth:{checkedAt:new Date().toISOString(),imap:{state:'timeout',message:'Incoming IMAP connection timed out; credentials were not verified.'},smtp:{state:'ok',message:'Outgoing SMTP sign-in verified. No email was sent.'}}}]);
    const awareness=await appAwareness(f.apps,f.store,f.agent.id);
    const reply=await connectionReply({...f,text:'Can you access my inbox and email connection?',history:[],agentId:f.agent.id,conversationId:f.conversation.id,awareness});
    expect(reply).toContain('Incoming IMAP connection timed out');expect(reply).toContain('Outgoing SMTP sign-in verified');
    expect(reply).not.toContain('expired');expect(awareness.context).toContain('mail_check');
    expect(awareness.context).toContain('A review expiry concerns that proposed action only');
  });
  it('answers from an active Gmail connection despite an older unfinished sign-in for the same teammate', async () => {
    const f=fixture();f.store.assignAppAccount(f.agent.id,'gmail','old');f.store.assignAppAccount(f.agent.id,'gmail','live');
    vi.mocked(f.apps.accounts).mockResolvedValue([
      {id:'old',toolkit:'gmail',status:'EXPIRED',disabled:false,connectionIssue:'sign-in-expired'},
      {id:'live',toolkit:'gmail',status:'ACTIVE',disabled:false},
    ]);
    const awareness=await appAwareness(f.apps,f.store,f.agent.id);
    const reply=await connectionReply({...f,text:'Are you connected to my Gmail?',history:[],agentId:f.agent.id,conversationId:f.conversation.id,awareness});
    expect(reply).toContain('Gmail is connected');
    expect(f.store.openRequests(f.conversation.id)).toHaveLength(0);
    expect(awareness.context).toContain('An older EXPIRED entry does not invalidate another ACTIVE account');
    expect(awareness.context).toContain('Never silently substitute a different mailbox');
  });
  it('shares pending refreshes and retains status arriving after the quick-context deadline', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture(); f.store.assignAppAccount(f.agent.id, 'googledrive', 'own');
      let finish!: (accounts: Awaited<ReturnType<ConnectedAppsProvider['accounts']>>) => void;
      vi.mocked(f.apps.accounts).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
      const first = appAwareness(f.apps, f.store, f.agent.id), second = appAwareness(f.apps, f.store, f.agent.id);
      await vi.advanceTimersByTimeAsync(1201);
      expect((await first).verified).toBe(false); expect((await second).verified).toBe(false);
      finish([{ id: 'own', toolkit: 'googledrive', status: 'ACTIVE', disabled: false }]);
      await vi.advanceTimersByTimeAsync(0);
      const recovered = await appAwareness(f.apps, f.store, f.agent.id);
      expect(recovered.verified).toBe(true); expect(recovered.accounts[0]?.status).toBe('ACTIVE');
      expect(f.apps.accounts).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it('waits for a healthy slower provider when the user asks an access question', async () => {
    vi.useFakeTimers();
    try {
      const f = fixture(); f.store.assignAppAccount(f.agent.id, 'googledrive', 'own');
      vi.mocked(f.apps.accounts).mockImplementation(() => new Promise(resolve => setTimeout(() => resolve([{ id: 'own', toolkit: 'googledrive', status: 'ACTIVE', disabled: false }]), 4000)));
      const complete = vi.fn();
      const trigger = f.store.appendMessage(f.conversation.id, { role: 'user', via: 'web', text: 'Can you access my Google Drive?' });
      const pending = runConversationTurn({ conversation: f.conversation, trigger, history: [trigger], deps: { store: f.store, agents: [f.agent], connectedApps: f.apps, resolveLlm: () => ({ complete } as unknown as LlmClient), toolContext: vi.fn() }, append: message => f.store.appendMessage(f.conversation.id, message) });
      await vi.advanceTimersByTimeAsync(4001);
      const result = await pending;
      expect(result.messages.at(-1)?.text).toContain('Google Drive is connected');
      expect(complete).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
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
