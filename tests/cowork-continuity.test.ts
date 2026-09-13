import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { CoworkStore } from '../src/cowork/store.js';
import { CoworkMemory } from '../src/cowork/memory.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { SkillStore } from '../src/skills/skills.js';
import { buildCoworkMessages, runConversationTurn, runMissionSession } from '../src/cowork/runner.js';
import { executeCoworkTool } from '../src/cowork/tools.js';
import type { LlmClient, LlmMessage } from '../src/llm/llm.js';
import type { ToolContext } from '../src/tools/tools.js';
import { HermesServer } from '../src/server/server.js';
import { CoworkBrowserLease } from '../src/cowork/browser-lease.js';

const root = mkdtempSync(path.join(tmpdir(), 'cowork-continuity-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let sequence = 0;
function setup() {
  const file = path.join(root, `store-${++sequence}.json`);
  const store = new CoworkStore(file);
  const agent = store.saveAgent({ name: 'Researcher', systemPrompt: 'Complete the work.', allowWrites: true });
  const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
  const memory = new CoworkMemory(MemoryStore.forProject(root), path.basename(root));
  writeFileSync(path.join(root, 'package.json'), '{"name":"continuity-test"}');
  const ctx: ToolContext = { cwd: root, guard: ProjectGuard.detect(root), skills: SkillStore.forProject(root) };
  const scope = { store, agent, memory, conversationId: conversation.id };
  const perms = { allowShell: false, allowWrites: true, allowConfig: false, chief: false, browser: true };
  return { file, store, agent, conversation, memory, ctx, scope, perms };
}

describe('Cowork continuity across providers and restarts', () => {
  it('executes streamed DeepSeek DSML productivity and schedule calls without exposing markup', async () => {
    const s = setup();
    let round = 0;
    const calls = [
      '<| DSML | invoke name="create_document"><| DSML | parameter name="params" string="false">{"path":"deepseek.pdf","title":"Brief","sections":[{"heading":"Verified brief","body":"Supplied source content."}]}</| DSML | parameter></| DSML | invoke>',
      '<| DSML | invoke name="schedule_manage"><| DSML | parameter name="params" string="false">{"action":"create","every":"1d","goal":"Prepare a brief"}</| DSML | parameter></| DSML | invoke>',
    ].join('\n');
    const next = () => ++round === 1 ? calls : 'The PDF is ready and the daily schedule is saved.';
    const frames: string[] = [];
    const llm: LlmClient = { name: 'deepseek', complete: async () => next(), completeStream: async (_m, _o, delta) => {
      const response = next();
      for (const char of response) delta(char);
      return response;
    } };
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Create a PDF and schedule a daily brief', via: 'web' });
    const result = await runConversationTurn({ conversation: s.conversation, trigger, history: [trigger], deps: { agents: [s.agent], resolveLlm: () => llm, toolContext: () => s.ctx, memory: s.memory, store: s.store, onProgress: progress => frames.push(progress.text) }, append: m => s.store.appendMessage(s.conversation.id, m) });
    expect(result.error).toBeUndefined();
    expect(result.messages[0]!.tools).toEqual([{ name: 'create_document', ok: true }, { name: 'schedule_manage', ok: true }]);
    expect(s.store.artifacts(s.conversation.id)).toHaveLength(1);
    expect(s.store.getConversation(s.conversation.id)!.schedule?.every).toBe('1d');
    expect(frames.some(frame => frame.includes('DSML') || frame.includes('parameter'))).toBe(false);
  });
  it('serializes shared browser sessions and safely cancels waiting teammates', async () => {
    const lease = new CoworkBrowserLease();
    const releaseFirst = await lease.acquire();
    const abort = new AbortController();
    const second = lease.acquire(abort.signal);
    const cancelled = expect(second).rejects.toThrow();
    abort.abort();
    await cancelled;
    let thirdStarted = false;
    const third = lease.acquire().then((release) => { thirdStarted = true; return release; });
    await Promise.resolve();
    expect(thirdStarted).toBe(false);
    releaseFirst();
    const releaseThird = await third;
    expect(thirdStarted).toBe(true);
    releaseThird();
  });

  it('keeps screenshot results usable for a text-only model', async () => {
    const s = setup();
    const state = { available: true, url: 'https://example.com', title: 'Example', canBack: false, canForward: false, loading: false };
    s.ctx.browser = { available: () => true, screenshot: async () => ({ pngBase64: 'aGVsbG8=', state }) } as ToolContext['browser'];
    const seen: LlmMessage[][] = [];
    const complete = async (messages: LlmMessage[]) => {
      seen.push(structuredClone(messages));
      return seen.length === 1 ? '<tool>{"name":"browse","params":{"action":"screenshot"}}</tool>' : 'Use page evidence next.';
    };
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Inspect page', via: 'web' });
    await runConversationTurn({ conversation: s.conversation, trigger, history: [trigger], deps: { agents: [s.agent], resolveLlm: () => ({ name: 'text-only', complete }) as LlmClient, toolContext: () => s.ctx, memory: s.memory, store: s.store, browser: true, supportsImagesFor: () => false }, append: (m) => s.store.appendMessage(s.conversation.id, m) });
    expect(typeof seen[1]!.at(-1)!.content).toBe('string');
    expect(seen[1]!.at(-1)!.content).toContain('Use browse evidence');
  });
  it('makes todo retries idempotent, preserves completion, and keeps owners and chats separate', () => {
    const s = setup();
    const first = s.store.addTodo({ conversationId: s.conversation.id, agentId: s.agent.id, text: 'Draft   the report.' });
    s.store.updateTodo(first.id, s.agent.id, { status: 'done', note: 'Saved report.pdf' });
    const fresh = new CoworkStore(s.file);
    expect(fresh.addTodo({ conversationId: s.conversation.id, agentId: s.agent.id, text: 'draft the report' })).toMatchObject({ id: first.id, status: 'done' });
    expect(fresh.todos(s.conversation.id)).toHaveLength(1);
    const other = fresh.saveAgent({ name: 'Writer', systemPrompt: 'Write.' });
    const group = fresh.saveConversation({ kind: 'group', title: 'Other task', memberIds: [s.agent.id, other.id] });
    expect(fresh.addTodo({ conversationId: group.id, agentId: other.id, text: 'draft the report' }).id).not.toBe(first.id);
  });

  it('does not share mutable empty arrays between stores', () => {
    const a = setup();
    const b = setup();
    expect(a.store.listAgents()).toHaveLength(1);
    expect(b.store.listAgents()).toHaveLength(1);
  });

  it('restores todos, artifacts, browser skills and tool evidence without requiring transcript history', () => {
    const s = setup();
    const todo = s.store.addTodo({ conversationId: s.conversation.id, agentId: s.agent.id, text: 'Export existing deck' });
    s.store.recordWork({ conversationId: s.conversation.id, agentId: s.agent.id, tool: 'browse', ok: true, output: 'Edited https://example.com/presentation/existing' });
    s.store.addArtifact({ conversationId: s.conversation.id, name: 'source.md', dataBase64: Buffer.from('brief').toString('base64') });
    const store = new CoworkStore(s.file);
    const prompt = buildCoworkMessages(s.agent, s.conversation, [s.agent], [], { agents: [s.agent], resolveLlm: vi.fn(), toolContext: () => s.ctx, store, browser: true });
    expect(prompt[0]!.content).toContain(todo.id);
    expect(prompt[0]!.content).toContain('https://example.com/presentation/existing');
    expect(prompt[0]!.content).toContain('source.md');
    expect(prompt[0]!.content).toContain('BROWSER WORKFLOW');
    expect(store.getAgent(s.agent.id)!.skills).toContain('browser-workflow');
  });

  it.each(['openai', 'grok', 'deepseek', 'openrouter', 'ollama', 'chatgpt'])('runs the common tool and screenshot loop for %s', async (provider) => {
    const s = setup();
    s.agent.provider = provider;
    const image = 'data:image/png;base64,aGVsbG8=';
    const state = { available: true, url: 'https://example.com', title: 'Example', canBack: false, canForward: false, loading: false };
    s.ctx.browser = { available: () => true, screenshot: async () => ({ pngBase64: 'aGVsbG8=', state }) } as ToolContext['browser'];
    const seen: LlmMessage[][] = [];
    const complete = async (messages: LlmMessage[]) => {
      seen.push(structuredClone(messages));
      return seen.length === 1 ? '<tool>{"name":"browse","params":{"action":"screenshot"}}</tool>' : 'Verified the page.';
    };
    const llm: LlmClient = { name: provider, complete, completeStream: async (messages) => complete(messages) };
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Inspect the current page', via: 'web' });
    const result = await runConversationTurn({ conversation: s.conversation, trigger, history: [trigger], deps: { agents: [s.agent], resolveLlm: () => llm, toolContext: () => s.ctx, memory: s.memory, store: s.store, browser: true }, append: (m) => s.store.appendMessage(s.conversation.id, m) });
    expect(result.error).toBeUndefined();
    expect(seen[1]!.at(-1)!.content).toEqual(expect.arrayContaining([{ type: 'image_url', image_url: { url: image } }]));
    expect(new CoworkStore(s.file).workLog(s.conversation.id, s.agent.id)[0]).toMatchObject({ tool: 'browse', ok: true });
  });

  it('wires the desktop browser into Cowork host contexts', async () => {
    const s = setup();
    const state = { available: true, url: 'https://example.com', title: 'Example', canBack: false, canForward: false, loading: false };
    const screenshot = vi.fn(async () => ({ pngBase64: 'aGVsbG8=', state }));
    const browser = { available: () => true, screenshot } as NonNullable<ToolContext['browser']>;
    const server = new HermesServer({ cwd: root, browser });
    const context = (server as unknown as { coworkToolContext: (agent: typeof s.agent) => ToolContext }).coworkToolContext(s.agent);
    const computerFor = vi.fn();
    const result = await executeCoworkTool(context, 'browse', { action: 'screenshot' }, s.perms, { ...s.scope, computerFor });
    expect(result.ok).toBe(true);
    expect(screenshot).toHaveBeenCalledOnce();
    expect(computerFor).not.toHaveBeenCalled();
  });

  it('stops immediately at a question card and does not run a later write in the same reply', async () => {
    const s = setup();
    const complete = vi.fn(async () => '<tool>{"name":"ask_user","params":{"question":"Which account?"}}</tool><tool>{"name":"write_file","params":{"path":"must-not-write.txt","content":"bad"}}</tool>');
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Continue', via: 'web' });
    const result = await runConversationTurn({ conversation: s.conversation, trigger, history: [trigger], deps: { agents: [s.agent], resolveLlm: () => ({ name: 'test', complete }) as unknown as LlmClient, toolContext: () => s.ctx, memory: s.memory, store: s.store }, append: (m) => s.store.appendMessage(s.conversation.id, m) });
    expect(complete).toHaveBeenCalledOnce();
    expect(result.messages[0]!.tools).toEqual([{ name: 'ask_user', ok: true }]);
    expect(s.store.requests(s.conversation.id)).toHaveLength(1);
  });

  it('keeps inbox messages arriving during a turn pending for the next turn', async () => {
    const s = setup();
    const sender = s.store.saveAgent({ name: 'Sender', systemPrompt: 'Coordinate.' });
    const first = s.store.addInbox({ fromAgentId: sender.id, toAgentId: s.agent.id, conversationId: s.conversation.id, text: 'First task' });
    const complete = async () => {
      s.store.addInbox({ fromAgentId: sender.id, toAgentId: s.agent.id, conversationId: s.conversation.id, text: 'Later task' });
      return 'First task done';
    };
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Work on inbox', via: 'web' });
    await runConversationTurn({ conversation: s.conversation, trigger, history: [trigger], deps: { agents: [s.agent], resolveLlm: () => ({ name: 'test', complete }) as unknown as LlmClient, toolContext: () => s.ctx, memory: s.memory, store: s.store }, append: (m) => s.store.appendMessage(s.conversation.id, m) });
    expect(s.store.inboxFor(s.agent.id).map((m) => m.text)).toEqual(['Later task']);
    expect(s.store.inboxFor(s.agent.id).some((m) => m.id === first.id)).toBe(false);
  });

  it('recovers older conversation content beyond the prompt window', async () => {
    const s = setup();
    s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Use https://example.com/original-deck', via: 'web' });
    for (let i = 0; i < 60; i++) s.store.appendMessage(s.conversation.id, { role: 'agent', text: 'Progress ' + i, via: 'web' });
    const result = await executeCoworkTool(s.ctx, 'conversation_history', { query: 'original-deck' }, s.perms, s.scope);
    expect(result.output).toContain('https://example.com/original-deck');
  });

  it('never marks a mission done if its last write was not executed', async () => {
    const s = setup();
    const mission = s.store.createMission({ conversationId: s.conversation.id, agentId: s.agent.id, goal: 'Finish the report', criteria: [] });
    const complete = async () => '<tool>{"name":"todo_manage","params":{"action":"list"}}</tool>\n{"status":"done","progress":"Finished","result":"Ready"}';
    const result = await runMissionSession({ mission, agent: s.agent, deps: { agents: [s.agent], resolveLlm: () => ({ name: 'test', complete }) as unknown as LlmClient, toolContext: () => s.ctx, memory: s.memory, store: s.store }, append: (m) => s.store.appendMessage(s.conversation.id, m) });
    expect(result.status).toBe('working');
    expect(result.progress).toContain('not executed');
  });
});
