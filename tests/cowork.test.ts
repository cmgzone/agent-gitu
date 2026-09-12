import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { CoworkStore } from '../src/cowork/store.js';
import { buildCoworkMessages, runConversationTurn, type CoworkRunnerDeps } from '../src/cowork/runner.js';
import { parseToolCalls, stripToolMarkers } from '../src/cowork/tools.js';
import { escapeTelegramHtml, recentTelegramChats, sendTelegramMessage, TelegramPoller } from '../src/cowork/telegram.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { McpManager } from '../src/mcp/client.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { CoworkMemory } from '../src/cowork/memory.js';
import { SkillStore } from '../src/skills/skills.js';
import { ensureGituHome } from '../src/workspace/home.js';
import { HermesServer } from '../src/server/server.js';
import type { ToolContext } from '../src/tools/tools.js';
import { executeCoworkTool } from '../src/cowork/tools.js';

// Cowork data must never touch a real user home during tests.
const TEST_HOME = mkdtempSync(path.join(tmpdir(), 'cowork-home-'));
process.env['AGENT_GITU_HOME'] = TEST_HOME;

function realToolContext(): ToolContext {
  const workspace = ensureGituHome().workspace;
  return { guard: ProjectGuard.detect(workspace), cwd: workspace, skills: SkillStore.forProject(workspace) };
}

function tempHome(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), `cowork-${prefix}-`));
}

function makeAgentInput(name: string, extra: Record<string, unknown> = {}) {
  return { name, systemPrompt: `You are ${name}.`, avatar: { color: '#8f80ff', shape: 'cube' }, tagline: `${name} specialist`, ...extra };
}

describe('CoworkStore', () => {
  it('persists agents, conversations and messages across instances', () => {
    const file = path.join(tempHome('store'), 'cowork.json');
    const store = new CoworkStore(file);
    const agent = store.saveAgent(makeAgentInput('ada', { avatar: { color: '#3fd68f', shape: 'antenna' } }));
    expect(agent.avatar).toEqual({ color: '#3fd68f', shape: 'antenna' });
    const conv = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    const m1 = store.appendMessage(conv.id, { role: 'user', text: 'hello', via: 'web' });
    const m2 = store.appendMessage(conv.id, { role: 'agent', agentId: agent.id, agentName: 'ada', text: 'hi', via: 'web' });

    const reloaded = new CoworkStore(file);
    expect(reloaded.listAgents().map((a) => a.name)).toEqual(['ada']);
    expect(reloaded.listAgents()[0]!.avatar).toEqual({ color: '#3fd68f', shape: 'antenna' });
    expect(reloaded.listConversations()).toHaveLength(1);
    expect(reloaded.messages(conv.id).map((m) => m.seq)).toEqual([m1.seq, m2.seq]);
    expect(m2.seq).toBeGreaterThan(m1.seq);
    expect(reloaded.messages(conv.id, m1.seq)).toHaveLength(1);
  });

  it('sanitizes avatar configs and rejects junk', () => {
    const store = new CoworkStore(path.join(tempHome('avatar'), 'cowork.json'));
    const bad = store.saveAgent(makeAgentInput('junky', { avatar: { color: 'javascript:alert(1)', shape: 'explosion' } }));
    expect(bad.avatar).toEqual({ color: '#8f80ff', shape: 'cube' });
    const partial = store.saveAgent({ name: 'partial', systemPrompt: 'x', avatar: { shape: 'visor' } });
    expect(partial.avatar).toEqual({ color: '#8f80ff', shape: 'visor' });
  });

  it('keeps per-agent memory in the shared MemoryStore, typed and isolated', () => {
    // Same architecture as the main agent: MemoryStore with agent-visibility
    // isolation, typed entries, and a dedupe/lifecycle — not a private format.
    const memory = new CoworkMemory(MemoryStore.forProject(ensureGituHome().workspace), 'agent-gitu-workspace');
    const agent = { name: 'memo-agent' } as never;
    const other = { name: 'other-agent' } as never;
    memory.remember(agent, 'User prefers concise answers');
    memory.remember(agent, 'The API key lives in .env');
    memory.remember(agent, 'User prefers concise answers'); // dedupe bumps confidence
    expect(memory.count(agent)).toBe(2);
    // Isolation: the other agent sees none of these private entries.
    expect(memory.count(other)).toBe(0);
    expect(memory.recall(other)).toContain('memory is empty');
    // Typed, lifecycle-bearing entries in the underlying store.
    const raw = MemoryStore.forProject(ensureGituHome().workspace).query({ limit: 50 }).filter((e) => e.agentId === 'memo-agent');
    expect(raw.length).toBe(2);
    expect(raw.every((e) => e.status === 'verified')).toBe(true);
    expect(raw.every((e) => e.visibility === 'agent')).toBe(true);
    expect(raw.some((e) => e.type === 'preference')).toBe(true);
    // Prompt block shows own memories and hides them from other agents.
    expect(memory.promptBlock(agent)).toContain('concise');
    expect(memory.promptBlock(other)).toBe('');
    // Forgetting archives only matching own entries.
    expect(memory.forget(agent, '.env')).toBe(1);
    expect(memory.count(agent)).toBe(1);
    expect(memory.clear(agent)).toBe(1);
    expect(memory.count(agent)).toBe(0);
  });

  it('saves and reloads the shared user profile', () => {
    const file = path.join(tempHome('profile'), 'cowork.json');
    const store = new CoworkStore(file);
    store.saveUserProfile({ name: 'Ada', about: 'Building a mobile app', preferences: 'Short answers' });
    const reloaded = new CoworkStore(file);
    expect(reloaded.userProfile()).toEqual({ name: 'Ada', about: 'Building a mobile app', preferences: 'Short answers' });
  });

  it('enforces conversation member rules', () => {
    const store = new CoworkStore(path.join(tempHome('rules'), 'cowork.json'));
    const agent = store.saveAgent(makeAgentInput('solo'));
    expect(() => store.saveConversation({ kind: 'group', memberIds: [agent.id] })).toThrow(/at least two/i);
    expect(() => store.saveConversation({ kind: 'dm', memberIds: ['ghost'] })).toThrow(/at least one/i);
  });

  it('deleting an agent removes DMs and strips it from groups', () => {
    const store = new CoworkStore(path.join(tempHome('delete'), 'cowork.json'));
    const a = store.saveAgent(makeAgentInput('leaver'));
    const b = store.saveAgent(makeAgentInput('stayer'));
    const dm = store.saveConversation({ kind: 'dm', memberIds: [a.id] });
    const group = store.saveConversation({ kind: 'group', memberIds: [a.id, b.id], chiefId: a.id });
    expect(store.deleteAgent(a.id)).toBe(true);
    expect(store.getConversation(dm.id)).toBeUndefined();
    const after = store.getConversation(group.id)!;
    expect(after.memberIds).toEqual([b.id]);
    expect(after.chiefId).toBeUndefined();
  });

  it('caps the stored transcript instead of growing forever', () => {
    const file = path.join(tempHome('cap'), 'cowork.json');
    const seed = new CoworkStore(file);
    const agent = seed.saveAgent(makeAgentInput('cap'));
    const conv = seed.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    // Write an over-long history directly so the test stays fast.
    const history = Array.from({ length: 2_050 }, (_, i) => ({ seq: i + 1, id: `m${i}`, role: 'user', text: `m${i}`, via: 'web', ts: new Date().toISOString() }));
    writeFileSync(file, JSON.stringify({ agents: [], conversations: [conv], messages: { [conv.id]: history } }));
    const store = new CoworkStore(file);
    expect(store.messages(conv.id)).toHaveLength(2_050);
    store.appendMessage(conv.id, { role: 'user', text: 'one more', via: 'web' });
    expect(store.messages(conv.id).length).toBeLessThanOrEqual(2_000);
    expect(store.messages(conv.id).at(-1)!.text).toBe('one more');
    void readFileSync;
  });
});

describe('cowork tool parsing', () => {
  it('extracts tool calls and strips markers from prose', () => {
    const reply = 'Let me check. <tool>{"name":"read_file","params":{"path":"src/x.ts"}}</tool> Done thinking.';
    expect(parseToolCalls(reply)).toEqual([{ tool: 'read_file', params: { path: 'src/x.ts' } }]);
    expect(stripToolMarkers(reply)).toBe('Let me check.  Done thinking.');
  });

  it('ignores malformed tool markers', () => {
    expect(parseToolCalls('<tool>{broken}</tool>')).toEqual([]);
    expect(parseToolCalls('no tools here')).toEqual([]);
  });
});

describe('cowork runner', () => {
  const store = new CoworkStore(path.join(tempHome('runner'), 'cowork.json'));

  function depsFor(script: string[], overrides: Partial<CoworkRunnerDeps> = {}): CoworkRunnerDeps {
    let call = 0;
    return {
      agents: store.listAgents(),
      resolveLlm: () => ({ complete: async () => script[Math.min(call++, script.length - 1)] } as never),
      toolContext: () => { throw new Error('no tools in this test'); },
      ...overrides,
    };
  }

  it('runs a direct-message turn with the agent identity', async () => {
    const agent = store.saveAgent(makeAgentInput('dm-agent'));
    const conv = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    const trigger = store.appendMessage(conv.id, { role: 'user', text: 'hello there', via: 'web' });
    const result = await runConversationTurn({
      conversation: conv,
      history: store.messages(conv.id),
      trigger,
      deps: depsFor(['Hi! I am dm-agent.']),
      append: (m) => store.appendMessage(conv.id, m),
    });
    expect(result.error).toBeUndefined();
    const last = store.messages(conv.id).at(-1)!;
    expect(last.role).toBe('agent');
    expect(last.agentName).toBe('dm-agent');
    expect(last.text).toContain('Hi!');
  });

  it('executes tool calls then answers, recording what it used', async () => {
    const agent = store.saveAgent(makeAgentInput('tool-user', { allowWrites: false }));
    const conv = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    const trigger = store.appendMessage(conv.id, { role: 'user', text: 'list files', via: 'web' });
    const script = [
      'Checking… <tool>{"name":"list_files","params":{"path":"."}}</tool>',
      'The workspace has files.',
    ];
    const result = await runConversationTurn({
      conversation: conv,
      history: store.messages(conv.id),
      trigger,
      deps: depsFor(script, { toolContext: realToolContext }),
      append: (m) => store.appendMessage(conv.id, m),
    });
    void result;
    const last = store.messages(conv.id).at(-1)!;
    expect(last.text).toContain('workspace has files');
    expect(last.tools).toBeDefined();
    expect(last.tools![0]!.name).toBe('list_files');
    expect(last.tools![0]!.ok).toBe(true);
  });

  it('chains group turns through @mentions and stops at the budget', async () => {
    const chief = store.saveAgent(makeAgentInput('chief', { chiefOfStaff: true }));
    const writer = store.saveAgent(makeAgentInput('writer'));
    const conv = store.saveConversation({ kind: 'group', memberIds: [chief.id, writer.id], chiefId: chief.id, title: 'room' });
    const trigger = store.appendMessage(conv.id, { role: 'user', text: 'plan the announcement', via: 'web' });
    const script = ['I will bring in @writer to draft it.', 'Draft ready: "Hello world".', 'Final announcement: Hello world.'];
    const result = await runConversationTurn({
      conversation: conv,
      history: store.messages(conv.id),
      trigger,
      deps: depsFor(script),
      append: (m) => store.appendMessage(conv.id, m),
    });
    expect(result.messages.map((m) => m.agentName)).toEqual(['chief', 'writer', 'chief']);
    expect(result.messages[2]!.text).toContain('Final announcement');
    expect(result.messages[1]!.text).toContain('Draft ready');
  });

  it('does not summon unknown or out-of-group names', async () => {
    const agent = store.saveAgent(makeAgentInput('solo2'));
    const other = store.saveAgent(makeAgentInput('bystander'));
    const conv = store.saveConversation({ kind: 'group', memberIds: [agent.id, other.id], title: 'mention-test' });
    const trigger = store.appendMessage(conv.id, { role: 'user', text: 'hello', via: 'web' });
    const result = await runConversationTurn({
      conversation: conv,
      history: store.messages(conv.id),
      trigger,
      deps: depsFor(['Ask @nobody and @ghost for help.']),
      append: (m) => store.appendMessage(conv.id, m),
    });
    expect(result.messages).toHaveLength(1);
  });

  it('builds a system prompt that includes identity, roster and chief role', () => {
    const a = store.saveAgent(makeAgentInput('p-chief'));
    const b = store.saveAgent(makeAgentInput('p-writer'));
    const conv = store.saveConversation({ kind: 'group', memberIds: [a.id, b.id], chiefId: a.id, title: 'p-room' });
    const members = [a, b];
    const messages = buildCoworkMessages(a, conv, members, []);
    const system = messages[0]!.content as string;
    expect(system).toContain('"p-chief"');
    expect(system).toContain('@p-writer');
    expect(system).toContain('CHIEF OF STAFF');
    const writerMessages = buildCoworkMessages(b, conv, members, []);
    expect(writerMessages[0]!.content as string).not.toContain('CHIEF OF STAFF');
    const dmConv = store.saveConversation({ kind: 'dm', memberIds: [b.id] });
    const dmMessages = buildCoworkMessages(b, dmConv, [b], []);
    expect(dmMessages[0]!.content as string).not.toContain('CHIEF OF STAFF');
  });
});

describe('telegram gateway helpers', () => {
  it('escapes HTML for Telegram', () => {
    expect(escapeTelegramHtml('<b>me & you</b>')).toBe('&lt;b&gt;me &amp; you&lt;/b&gt;');
  });

  it('lists recent chats from getUpdates', async () => {
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          ok: true,
          result: [
            { update_id: 1, message: { message_id: 1, date: 1, chat: { id: -100123, title: 'Team room' }, from: { first_name: 'Kim' }, text: 'hi' } },
            { update_id: 2, message: { message_id: 2, date: 1, chat: { id: 42 }, from: { first_name: 'Ana' }, text: 'hello' } },
          ],
        }),
      };
    };
    const chats = await recentTelegramChats(fetchImpl, '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    expect(calls[0]).toContain('/getUpdates');
    expect(chats).toEqual([
      { id: '-100123', title: 'Team room' },
      { id: '42', title: 'Ana' },
    ]);
  });

  it('rejects malformed tokens before any network call', async () => {
    await expect(recentTelegramChats(async () => { throw new Error('should not fetch'); }, 'nope')).rejects.toThrow(/bot token/i);
  });

  it('sends and splits long messages', async () => {
    const sent: string[] = [];
    const fetchImpl = async (_url: string, init?: { body?: string }) => {
      sent.push(String(init?.body));
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, result: {} }) };
    };
    const long = 'x'.repeat(9_000);
    await sendTelegramMessage(fetchImpl, '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ', '42', long);
    expect(sent.length).toBe(3);
    for (const body of sent) expect((JSON.parse(body) as { text: string }).text.length).toBeLessThanOrEqual(4_000);
  });

  it('polls updates and forwards only messages from the linked chat', async () => {
    const received: string[] = [];
    let call = 0;
    let signal: AbortSignal | undefined;
    const fetchImpl = async (_url: string, init?: { signal?: AbortSignal }) => {
      signal = init?.signal;
      call += 1;
      if (call === 1) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            result: [
              { update_id: 10, message: { message_id: 1, date: Math.floor(Date.now() / 1000) - 5, chat: { id: 7, title: 'G' }, from: { first_name: 'Kim' }, text: 'hello team' } },
              { update_id: 11, message: { message_id: 2, date: Math.floor(Date.now() / 1000) - 5, chat: { id: 999 }, from: { first_name: 'Other' }, text: 'wrong chat' } },
            ],
          }),
        };
      }
      return new Promise((resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }) as never;
    };
    const poller = new TelegramPoller({
      token: '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      chatId: '7',
      fetchImpl,
      onMessage: (from, text) => received.push(`${from}:${text}`),
    });
    poller.start();
    for (let i = 0; i < 100 && received.length === 0; i++) await new Promise((r) => setTimeout(r, 20));
    poller.stop();
    expect(received).toEqual(['Kim:hello team']);
  });
});

describe('cowork capability tools', () => {
  const store = new CoworkStore(path.join(tempHome('tools'), 'cowork.json'));
  const memory = CoworkMemory.forWorkspace();
  const noopCtx = { cwd: '.' } as unknown as ToolContext;
  const scope = (saved: { id: string; name: string }) => ({ store, agent: saved, memory });

  it('lets any agent persist and recall memories', async () => {
    const agent = store.saveAgent(makeAgentInput('memory-user'));
    const perms = { allowShell: false, allowWrites: false, allowConfig: false, chief: false, browser: false };
    const result = await executeCoworkTool(noopCtx, 'agent_memory', { action: 'remember', text: 'User hates long emails' }, perms, scope(agent));
    expect(result.ok).toBe(true);
    const recall = await executeCoworkTool(noopCtx, 'agent_memory', { action: 'recall' }, perms, scope(agent));
    expect(recall.output).toContain('User hates long emails');
    expect(memory.count(agent)).toBe(1);
  });

  it('lets agents view and merge-update the shared user context', async () => {
    const agent = store.saveAgent(makeAgentInput('profile-user'));
    const perms = { allowShell: false, allowWrites: false, allowConfig: false, chief: false, browser: false };
    const view1 = await executeCoworkTool(noopCtx, 'user_profile', { action: 'view' }, perms, scope(agent));
    expect(view1.output).toContain('empty');
    const update = await executeCoworkTool(noopCtx, 'user_profile', { action: 'update', about: 'Shipping a mobile app' }, perms, scope(agent));
    expect(update.ok).toBe(true);
    // Partial update merges: an later name change must not wipe the about text.
    const update2 = await executeCoworkTool(noopCtx, 'user_profile', { action: 'update', name: 'Ada' }, perms, scope(agent));
    expect(update2.ok).toBe(true);
    const saved = store.userProfile();
    expect(saved.name).toBe('Ada');
    expect(saved.about).toBe('Shipping a mobile app');
    const view2 = await executeCoworkTool(noopCtx, 'user_profile', { action: 'view' }, perms, scope(agent));
    expect(view2.output).toContain('Shipping a mobile app');
  });

  it('restricts team management to chiefs of staff', async () => {
    const chief = store.saveAgent(makeAgentInput('chief-tool', { chiefOfStaff: true }));
    const plain = store.saveAgent(makeAgentInput('plain-tool'));
    const chiefPerms = { allowShell: false, allowWrites: false, allowConfig: false, chief: true, browser: false };
    const plainPerms = { allowShell: false, allowWrites: false, allowConfig: false, chief: false, browser: false };
    const created = await executeCoworkTool(noopCtx, 'team_manage', { action: 'create', name: 'Scout', instructions: 'Research assistant.' }, chiefPerms, scope(chief));
    expect(created.ok).toBe(true);
    expect(store.listAgents().some((a) => a.name.toLowerCase() === 'scout')).toBe(true);
    const denied = await executeCoworkTool(noopCtx, 'team_manage', { action: 'create', name: 'Rogue' }, plainPerms, scope(plain));
    expect(denied.ok).toBe(false);
    const removed = await executeCoworkTool(noopCtx, 'team_manage', { action: 'delete', name: 'scout' }, chiefPerms, scope(chief));
    expect(removed.ok).toBe(true);
    expect(store.listAgents().some((a) => a.name.toLowerCase() === 'scout')).toBe(false);
    const selfDelete = await executeCoworkTool(noopCtx, 'team_manage', { action: 'delete', name: 'chief-tool' }, chiefPerms, scope(chief));
    expect(selfDelete.ok).toBe(false);
  });

  it('gates MCP/skill/connection setup behind allowConfig', async () => {
    const agent = store.saveAgent(makeAgentInput('config-user'));
    const no = { allowShell: false, allowWrites: false, allowConfig: false, chief: false, browser: false };
    const yes = { allowShell: false, allowWrites: false, allowConfig: true, chief: false, browser: false };
    const denied = await executeCoworkTool(noopCtx, 'configure_mcp', { name: 'x', command: 'npx' }, no, scope(agent));
    expect(denied.ok).toBe(false);
    const mcpCtx = { cwd: '.', mcp: McpManager.forProject(ensureGituHome().workspace) } as unknown as ToolContext;
    const allowed = await executeCoworkTool(mcpCtx, 'configure_mcp', { name: 'x', command: 'npx', args: ['-y', 'pkg'] }, yes, scope(agent));
    expect(allowed.ok).toBe(true);
    expect(allowed.output).toContain('added');
  });

  it('injects user context and agent memory into the system prompt', () => {
    const agent = store.saveAgent(makeAgentInput('aware'));
    const other = store.saveAgent(makeAgentInput('aware2'));
    const conv = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    const deps = {
      agents: store.listAgents(),
      resolveLlm: () => { throw new Error('unused'); },
      toolContext: () => { throw new Error('unused'); },
      userContext: 'Name: Ada\nAbout: building a mobile app',
      memoryFor: (a: { id: string }) => (a.id === agent.id ? '- Prefers short answers' : ''),
    };
    const messages = buildCoworkMessages(agent, conv, [agent, other], [], deps as never);
    const system = messages[0]!.content as string;
    expect(system).toContain('ABOUT THE USER');
    expect(system).toContain('building a mobile app');
    expect(system).toContain('YOUR PERSISTED MEMORY');
    expect(system).toContain('Prefers short answers');
  });
});

describe('cowork server routes', () => {
  let home: string;
  const servers: HermesServer[] = [];

  beforeAll(() => {
    home = tempHome('server');
    process.env['AGENT_GITU_HOME'] = home;
  });

  afterAll(async () => {
    for (const s of servers) await s.stop();
    delete process.env['AGENT_GITU_HOME'];
    rmSync(home, { recursive: true, force: true });
  });

  async function startServer(llm: ScriptedMockLlm): Promise<string> {
    const server = new HermesServer({ cwd: path.join(home, 'Workspace'), port: 0, llm });
    servers.push(server);
    const port = await server.start();
    return `http://127.0.0.1:${port}`;
  }

  async function waitFor<T>(fn: () => Promise<T | undefined>, timeoutMs = 15_000): Promise<T> {
    const start = Date.now();
    for (;;) {
      const value = await fn();
      if (value !== undefined) return value;
      if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  async function post(base: string, p: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
    const r = await fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  }

  it('serves the full cowork CRUD + chat flow over HTTP', async () => {
    const llm = new ScriptedMockLlm([() => 'Hello, I am the mock teammate.']);
    const base = await startServer(llm);

    const created = await post(base, '/api/cowork/agents', makeAgentInput('http-agent'));
    expect(created.status).toBe(200);
    const agent = created.json['agent'] as { id: string; name: string };

    const agents = await fetch(`${base}/api/cowork/agents`).then((r) => r.json()) as { agents: unknown[]; availableSkills: unknown[] };
    expect(agents.agents).toHaveLength(1);
    expect(Array.isArray(agents.availableSkills)).toBe(true);

    const convRes = await post(base, '/api/cowork/conversations', { kind: 'dm', memberIds: [agent.id] });
    expect(convRes.status).toBe(200);
    const conv = convRes.json['conversation'] as { id: string };

    const send = await post(base, `/api/cowork/conversations/${conv.id}/messages`, { text: 'hi team' });
    expect(send.status).toBe(202);

    const view = await waitFor(async () => {
      const d = (await fetch(`${base}/api/cowork/conversations/${conv.id}/messages`).then((r) => r.json())) as { messages: { role: string; text: string }[]; busy: boolean };
      return d.messages.some((m) => m.role === 'agent') ? d : undefined;
    });
    expect(view.messages.at(-1)!.text).toContain('mock teammate');
    expect(view.busy).toBe(false);

    // When idle again, another send works and the transcript keeps growing.
    await post(base, `/api/cowork/conversations/${conv.id}/messages`, { text: 'again' });
    await waitFor(async () => {
      const d = (await fetch(`${base}/api/cowork/conversations/${conv.id}/messages`).then((r) => r.json())) as { messages: { role: string }[] };
      return d.messages.filter((m) => m.role === 'agent').length >= 2 ? true : undefined;
    });

    const stop = await post(base, `/api/cowork/conversations/${conv.id}/stop`, {});
    expect(stop.status).toBe(200);

    const del = await fetch(`${base}/api/cowork/conversations/${conv.id}`, { method: 'DELETE' });
    expect(del.status).toBe(200);
    const gone = await fetch(`${base}/api/cowork/conversations/${conv.id}/messages`).then((r) => r.json()) as { messages: unknown[] };
    expect(gone.messages).toHaveLength(0);
  });

  it('accepts and actually answers a second send after the current turn', async () => {
    // First reply is delayed so the busy window is observable; the group
    // chain only produces one message.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const llm = new ScriptedMockLlm([
      // The mock's reply function may return a Promise — complete() awaits it.
      () => gate.then(() => 'finally replying') as unknown as string,
      () => 'answer to the queued message',
    ]);
    const base = await startServer(llm);
    const a = await post(base, '/api/cowork/agents', makeAgentInput('slow'));
    const b = await post(base, '/api/cowork/agents', makeAgentInput('other'));
    const agentA = a.json['agent'] as { id: string };
    const agentB = b.json['agent'] as { id: string };
    const conv = (await post(base, '/api/cowork/conversations', { kind: 'group', memberIds: [agentA.id, agentB.id], chiefId: agentA.id })).json['conversation'] as { id: string };

    const first = await post(base, `/api/cowork/conversations/${conv.id}/messages`, { text: 'start' });
    expect(first.status).toBe(202);
    await new Promise((r) => setTimeout(r, 150));
    const second = await post(base, `/api/cowork/conversations/${conv.id}/messages`, { text: 'while busy' });
    expect(second.status).toBe(202);
    expect(second.json['queued']).toBe(true);

    release();
    await waitFor(async () => {
      const d = (await fetch(`${base}/api/cowork/conversations/${conv.id}/messages`).then((r) => r.json())) as { messages: { role: string; text: string }[]; busy: boolean };
      return !d.busy && d.messages.some((m) => m.text === 'answer to the queued message') ? d : undefined;
    });
    // The queued message stays in the transcript.
    const d = (await fetch(`${base}/api/cowork/conversations/${conv.id}/messages`).then((r) => r.json())) as { messages: { text: string }[] };
    expect(d.messages.some((m) => m.text === 'while busy')).toBe(true);
  });

  it('cancels a turn waiting for the same agent in another chat without releasing that agent early', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    const llm = new ScriptedMockLlm([
      () => { calls++; return gate.then(() => 'first finished') as unknown as string; },
      () => { calls++; return 'next finished'; },
    ]);
    const base = await startServer(llm);
    const agent = (await post(base, '/api/cowork/agents', makeAgentInput('locked-agent'))).json['agent'] as { id: string };
    const create = async () => (await post(base, '/api/cowork/conversations', { kind: 'dm', memberIds: [agent.id] })).json['conversation'] as { id: string };
    const first = await create();
    const second = await create();
    try {
      await post(base, `/api/cowork/conversations/${first.id}/messages`, { text: 'first' });
      await waitFor(async () => calls === 1 ? true : undefined);
      await post(base, `/api/cowork/conversations/${second.id}/messages`, { text: 'wait for agent' });
      await post(base, `/api/cowork/conversations/${second.id}/messages`, { text: 'queued and cancelled' });
      await post(base, `/api/cowork/conversations/${second.id}/stop`, {});
      await waitFor(async () => {
        const view = await fetch(`${base}/api/cowork/conversations/${second.id}/messages`).then(r => r.json()) as { busy: boolean; queued: number };
        return !view.busy && view.queued === 0 ? true : undefined;
      });
      expect(calls).toBe(1);
      await post(base, `/api/cowork/conversations/${second.id}/messages`, { text: 'try again' });
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(calls).toBe(1);
    } finally { release(); }
    await waitFor(async () => calls === 2 ? true : undefined);
  });

  it('stores user profile and clears agent memory over HTTP', async () => {
    const llm = new ScriptedMockLlm([() => 'reply']);
    const base = await startServer(llm);
    const saved = await post(base, '/api/cowork/profile', { name: 'Ada', about: 'shipping an app', preferences: 'be brief' });
    expect(saved.status).toBe(200);
    const got = await fetch(`${base}/api/cowork/profile`).then((r) => r.json()) as { profile: Record<string, string> };
    expect(got.profile.name).toBe('Ada');
    const agents = await fetch(`${base}/api/cowork/agents`).then((r) => r.json()) as { agents: { id: string }[]; memoryCounts: Record<string, number> };
    const agent = (await post(base, '/api/cowork/agents', makeAgentInput('mem-http'))).json['agent'] as { id: string };
    void agents;
    const clear = await fetch(`${base}/api/cowork/agents/${agent.id}/memory`, { method: 'DELETE' });
    expect(clear.status).toBe(200);
    const facts = await fetch(`${base}/api/cowork/agents/${agent.id}/memory`).then((r) => r.json()) as { count: number };
    expect(facts.count).toBe(0);
  });

  it('streams incremental message pages with the after cursor', async () => {
    const llm = new ScriptedMockLlm([() => 'one reply']);
    const base = await startServer(llm);
    const agent = (await post(base, '/api/cowork/agents', makeAgentInput('cursor-agent'))).json['agent'] as { id: string };
    const conv = (await post(base, '/api/cowork/conversations', { kind: 'dm', memberIds: [agent.id] })).json['conversation'] as { id: string };
    await post(base, `/api/cowork/conversations/${conv.id}/messages`, { text: 'poll me' });
    await waitFor(async () => {
      const d = (await fetch(`${base}/api/cowork/conversations/${conv.id}/messages`).then((r) => r.json())) as { messages: { seq: number; role: string }[]; busy: boolean };
      return !d.busy && d.messages.length >= 2 ? d : undefined;
    });
    const view = (await fetch(`${base}/api/cowork/conversations/${conv.id}/messages`).then((r) => r.json())) as { messages: { seq: number; role: string }[]; busy: boolean };
    expect(view.messages.length).toBeGreaterThanOrEqual(2);
    expect(view.busy).toBe(false);
    const after = (await fetch(`${base}/api/cowork/conversations/${conv.id}/messages?after=${view.messages[0]!.seq}`).then((r) => r.json())) as { messages: unknown[] };
    expect(after.messages.length).toBe(view.messages.length - 1);
  });
});
