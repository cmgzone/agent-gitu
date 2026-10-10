import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { CoworkStore } from '../src/cowork/store.js';
import { CoworkMemory } from '../src/cowork/memory.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { SkillStore } from '../src/skills/skills.js';
import { buildCoworkMessages, runConversationTurn, runMissionSession } from '../src/cowork/runner.js';
import { executeCoworkTool, coworkNativeTools } from '../src/cowork/tools.js';
import { LlmError, type LlmClient, type LlmMessage, type LlmTurnResult } from '../src/llm/llm.js';
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

function withReview(client: LlmClient, review: (input: { candidate: string; checklist: { id: string; status: string }[] }) => { state: string; reason: string } = () => ({ state: 'done', reason: 'The requested answer is present.' })): LlmClient {
  return { ...client, complete: async (messages, options) => {
    if (String(messages[0]?.content).startsWith('COWORK COMPLETION REVIEW.')) return JSON.stringify(review(JSON.parse(String(messages[1]?.content))));
    return client.complete(messages, options);
  } };
}

describe('Cowork continuity across providers and restarts', () => {
  it('ends a repeated app read after unchanged evidence and preserves the complete tool schema', async () => {
    const s = setup();
    s.store.assignAppAccount(s.agent.id, 'gmail', 'own');
    const description = 'x'.repeat(25_000);
    const tools = vi.fn(async () => [{ slug: 'GMAIL_FETCH', name: 'Fetch', description, inputParameters: { required: ['query'] } }]);
    const apps = { configured: true, setup: { canConfigure: false, keyStorage: 'test' }, accounts: async () => [{ id: 'own', toolkit: 'gmail', status: 'ACTIVE', disabled: false }], catalog: vi.fn(), tools, execute: vi.fn() };
    s.ctx.connectedApps = apps;
    let rounds = 0;
    const complete = vi.fn(async (messages: LlmMessage[], options) => {
      rounds++;
      if (rounds > 1) expect(messages.some(message => String(message.content).includes(description))).toBe(true);
      if (options?.toolChoice === 'none') return 'I retrieved the schema but could not obtain the requested count.\n<cowork_state>waiting</cowork_state>';
      return '<tool>{"name":"connected_apps","params":{"action":"tools","service":"gmail","query":"unread count"}}</tool>';
    });
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Count unread emails', via: 'web' });
    const result = await runConversationTurn({ conversation: s.conversation, trigger, history: [trigger],
      deps: { agents: [s.agent], resolveLlm: () => ({ name: 'repeating-test', complete }), toolContext: () => s.ctx, connectedApps: apps, memory: s.memory, store: s.store, autoLearn: false, requireCompletionState: true },
      append: message => s.store.appendMessage(s.conversation.id, message),
    });
    expect(result.error).toBeUndefined();
    expect(tools).toHaveBeenCalledTimes(3);
    expect(complete).toHaveBeenCalledTimes(4);
    expect(result.messages.at(-1)?.text).toContain('could not obtain');
  });

  it('allows the same read to continue when the returned evidence changes', async () => {
    const s = setup();
    let fetches = 0;
    const apps = { configured: true, setup: { canConfigure: false, keyStorage: 'test' }, accounts: async () => [{ id: 'own', toolkit: 'gmail', status: 'ACTIVE', disabled: false }], catalog: vi.fn(), tools: vi.fn(async () => [{ slug: 'GMAIL_FETCH', name: `Result ${++fetches}` }]), execute: vi.fn() };
    s.ctx.connectedApps = apps;
    s.store.assignAppAccount(s.agent.id, 'gmail', 'own');
    const complete = vi.fn(async () => fetches < 4 ? '<tool>{"name":"connected_apps","params":{"action":"tools","service":"gmail","query":"unread"}}</tool>' : 'The check finished.');
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Check updates', via: 'web' });
    const result = await runConversationTurn({ conversation: s.conversation, trigger, history: [trigger],
      deps: { agents: [s.agent], resolveLlm: () => ({ name: 'progress-test', complete }), toolContext: () => s.ctx, connectedApps: apps, memory: s.memory, store: s.store, autoLearn: false },
      append: message => s.store.appendMessage(s.conversation.id, message),
    });
    expect(result.error).toBeUndefined();
    expect(fetches).toBe(4);
    expect(result.messages.at(-1)?.text).toBe('The check finished.');
  });

  it('stops unchanged app reads despite changing execution log IDs and a model ignoring the stop', async () => {
    const s = setup();
    s.agent = s.store.saveAgent({ ...s.agent, allowConfig: true });
    s.store.assignAppAccount(s.agent.id, 'gmail', 'own');
    const request = s.store.addRequest({ conversationId: s.conversation.id, agentId: s.agent.id, kind: 'recommendation', title: 'Read count', detail: 'Allow the read for this test.', appAction: { service: 'gmail', accountId: 'own', tool: 'GMAIL_FETCH', args: {} } });
    s.store.allowAppActionForRequest(request.id);
    let reads = 0;
    const apps = { configured: true, setup: { canConfigure: false, keyStorage: 'test' }, accounts: async () => [{ id: 'own', toolkit: 'gmail', status: 'ACTIVE', disabled: false }], catalog: vi.fn(), tools: vi.fn(), execute: vi.fn(async () => ({ data: { count: 12 }, log_id: `log-${++reads}` })) };
    s.ctx.connectedApps = apps;
    const complete = vi.fn(async () => '<tool>{"name":"connected_apps","params":{"action":"execute","service":"gmail","tool":"GMAIL_FETCH","args":{}}}</tool>');
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Count unread emails', via: 'web' });
    const result = await runConversationTurn({ conversation: s.conversation, trigger, history: [trigger],
      deps: { agents: [s.agent], resolveLlm: () => ({ name: 'ignores-stop-test', complete }), toolContext: () => s.ctx, connectedApps: apps, memory: s.memory, store: s.store, autoLearn: false },
      append: message => s.store.appendMessage(s.conversation.id, message),
    });
    expect(result.error).toBeUndefined();
    expect(reads).toBe(3);
    expect(complete).toHaveBeenCalledTimes(4);
    expect(result.messages.at(-1)?.text).toContain('I stopped');
  });

  it('keeps a public work update visible across a tool call and the next model turn', async () => {
    const s = setup();
    const prompt = buildCoworkMessages(s.agent, s.conversation, [s.agent], [], { agents: [s.agent], resolveLlm: vi.fn(), toolContext: () => s.ctx });
    expect(prompt[0]!.content).toContain('LIVE UPDATES:');
    const frames: { text: string; tool?: string }[] = [];
    let round = 0;
    const llm: LlmClient = {
      name: 'streaming-test',
      complete: async () => '',
      completeStream: async (_messages, opts, onDelta) => {
        const reply = ++round === 1
          ? 'I’m checking the workspace files for the requested item.\n<tool>{"name":"list_files","params":{"path":"."}}</tool>'
          : 'The check is complete.\n<cowork_state>done</cowork_state>';
        opts.onActivity?.({ type: 'reasoning' });
        onDelta(reply);
        return reply;
      },
    };
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Check the files', via: 'web' });
    const result = await runConversationTurn({
      conversation: s.conversation, trigger, history: [trigger],
      deps: { agents: [s.agent], resolveLlm: () => withReview(llm), toolContext: () => s.ctx, memory: s.memory, store: s.store, autoLearn: false, requireCompletionState: true, onProgress: p => frames.push({ text: p.text, tool: p.tool }) },
      append: m => s.store.appendMessage(s.conversation.id, m),
    });
    expect(result.error).toBeUndefined();
    expect(frames.some(p => p.tool === 'list_files' && p.text.includes('checking the workspace files'))).toBe(true);
    expect(frames.some(p => !p.tool && p.text.includes('checking the workspace files'))).toBe(true);
    expect(frames.some(p => p.text.includes('<tool>'))).toBe(false);
    expect(frames.some(p => p.text.includes('cowork_state'))).toBe(false);
    expect(result.messages[0]!.text).toBe('The check is complete.');
  });

  it('never streams a partially emitted completion marker into the chat', async () => {
    const s = setup();
    const frames: string[] = [];
    const reply = 'The audit is complete.\n<cowork_state>done</cowork_state>';
    const llm: LlmClient = {
      name: 'streamed-state-test',
      complete: async () => JSON.stringify({ state: 'done', reason: 'The audit report answers the request.' }),
      completeStream: async (_messages, _options, onDelta) => {
        for (const char of reply) onDelta(char);
        return reply;
      },
    };
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Audit the file', via: 'web' });
    const result = await runConversationTurn({
      conversation: s.conversation, trigger, history: [trigger],
      deps: { agents: [s.agent], resolveLlm: () => llm, toolContext: () => s.ctx, memory: s.memory, store: s.store, autoLearn: false, requireCompletionState: true, onProgress: progress => frames.push(progress.text) },
      append: message => s.store.appendMessage(s.conversation.id, message),
    });
    expect(result.error).toBeUndefined();
    expect(result.messages[0]!.text).toBe('The audit is complete.');
    expect(frames.every(frame => !frame.includes('cowork_state') && !frame.endsWith('<'))).toBe(true);
  });

  it('continues after a bare progress reply instead of ending the mailbox check', async () => {
    const s = setup();
    const replies = [
      'Checking the mailbox now.\n<cowork_state>working</cowork_state>',
      '<tool>{"name":"list_files","params":{"path":"."}}</tool>',
      'The check is complete.\n<cowork_state>done</cowork_state>',
    ];
    const complete = vi.fn(async () => replies.shift() ?? 'The check is complete.');
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Check the mailbox again', via: 'web' });
    const result = await runConversationTurn({
      conversation: s.conversation, trigger, history: [trigger],
      deps: { agents: [s.agent], resolveLlm: () => withReview({ name: 'test', complete } as LlmClient), toolContext: () => s.ctx, memory: s.memory, store: s.store, autoLearn: false, requireCompletionState: true },
      append: (message) => s.store.appendMessage(s.conversation.id, message),
    });
    expect(result.error).toBeUndefined();
    expect(complete).toHaveBeenCalledTimes(3);
    expect(result.messages[0]).toMatchObject({ role: 'agent', text: 'The check is complete.', tools: [{ name: 'list_files', ok: true }] });
  });

  it.each([
    'I’m first mapping the niche’s demand and current rules. Then I’ll turn that into a channel plan.',
    'I’ll install the requested CLI, verify the tools, and then suggest automations.',
    'I am auditing the numbers and reconciling the source data.',
  ])('continues a status-only promise without another user message: %s', async (update) => {
    const s = setup();
    const replies = [`${update}\n<cowork_state>working</cowork_state>`, '<tool>{"name":"list_files","params":{"path":"."}}</tool>', 'The requested work is complete.\n<cowork_state>done</cowork_state>'];
    const complete = vi.fn(async () => replies.shift() ?? 'The requested work is complete.');
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Please do the work', via: 'web' });
    const result = await runConversationTurn({
      conversation: s.conversation, trigger, history: [trigger],
      deps: { agents: [s.agent], resolveLlm: () => withReview({ name: 'test', complete } as LlmClient), toolContext: () => s.ctx, memory: s.memory, store: s.store, autoLearn: false, requireCompletionState: true },
      append: (message) => s.store.appendMessage(s.conversation.id, message),
    });
    expect(result.error).toBeUndefined();
    expect(complete).toHaveBeenCalledTimes(3);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({ role: 'agent', text: 'The requested work is complete.', tools: [{ name: 'list_files', ok: true }] });
  });

  it('uses the reported state even when the wording sounds like a future action', async () => {
    const s = setup();
    const complete = vi.fn(async () => 'I’ll install it after you provide the account.\n<cowork_state>waiting</cowork_state>');
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Install it', via: 'web' });
    const result = await runConversationTurn({
      conversation: s.conversation, trigger, history: [trigger],
      deps: { agents: [s.agent], resolveLlm: () => withReview({ name: 'test', complete } as LlmClient, () => ({ state: 'waiting', reason: 'The user must provide the account.' })), toolContext: () => s.ctx, memory: s.memory, store: s.store, autoLearn: false, requireCompletionState: true },
      append: (message) => s.store.appendMessage(s.conversation.id, message),
    });
    expect(result.error).toBeUndefined();
    expect(complete).toHaveBeenCalledOnce();
    expect(result.messages[0]!.text).toBe('I’ll install it after you provide the account.');
  });

  it('accepts an unmarked answer only after semantic completion review', async () => {
    const s = setup();
    const complete = vi.fn(async () => 'The sum of 18 and 24 is 42.');
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'What is 18 + 24?', via: 'web' });
    const result = await runConversationTurn({
      conversation: s.conversation, trigger, history: [trigger],
      deps: { agents: [s.agent], resolveLlm: () => withReview({ name: 'test', complete } as LlmClient), toolContext: () => s.ctx, memory: s.memory, store: s.store, autoLearn: false, requireCompletionState: true },
      append: (message) => s.store.appendMessage(s.conversation.id, message),
    });
    expect(complete).toHaveBeenCalledOnce();
    expect(result.error).toBeUndefined();
    expect(result.messages).toEqual([expect.objectContaining({ role: 'agent', text: 'The sum of 18 and 24 is 42.' })]);
  });

  it('continues beyond three incomplete replies and finishes the saved checklist', async () => {
    const s = setup();
    const todo = s.store.addTodo({ conversationId: s.conversation.id, agentId: s.agent.id, text: 'Verify the file' });
    writeFileSync(path.join(root, 'verified.txt'), '42');
    let calls = 0;
    const complete = vi.fn(async () => {
      calls += 1;
      if (calls <= 4) return 'I am checking the file.';
      if (calls === 5) return '<tool>{"name":"read_file","params":{"path":"verified.txt"}}</tool>';
      if (calls === 6) return `<tool>${JSON.stringify({ name: 'todo_manage', params: { action: 'complete', id: todo.id } })}</tool>`;
      return 'The verified value is 42.\n<cowork_state>done</cowork_state>';
    });
    const llm = withReview({ name: 'test', complete } as LlmClient, ({ checklist }) => {
      const done = checklist.some(item => item.id === todo.id && item.status === 'done');
      return { state: done ? 'done' : 'working', reason: done ? 'The file was checked and the value is reported.' : 'The saved verification item is still open; read the file.' };
    });
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Continue verifying the file', via: 'web' });
    const result = await runConversationTurn({
      conversation: s.conversation, trigger, history: [trigger],
      deps: { agents: [s.agent], resolveLlm: () => llm, toolContext: () => s.ctx, memory: s.memory, store: s.store, autoLearn: false, requireCompletionState: true },
      append: (message) => s.store.appendMessage(s.conversation.id, message),
    });
    expect(complete).toHaveBeenCalledTimes(7);
    expect(result.error).toBeUndefined();
    expect(result.messages).toEqual([expect.objectContaining({
      role: 'agent',
      text: 'The verified value is 42.',
    })]);
    expect(s.store.todos(s.conversation.id)).toEqual([expect.objectContaining({ status: 'done' })]);
  }, 15000);

  it('does not accumulate incomplete replies across successful tool rounds', async () => {
    const s = setup();
    let calls = 0;
    const complete = vi.fn(async () => {
      if (++calls > 12) return 'Finished.\n<cowork_state>done</cowork_state>';
      return calls % 2 ? 'Checking.\n<cowork_state>working</cowork_state>' : '<tool>{"name":"list_files","params":{"path":"."}}</tool>';
    });
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Complete the checks', via: 'web' });
    const result = await runConversationTurn({ conversation: s.conversation, trigger, history: [trigger], deps: { agents: [s.agent], resolveLlm: () => withReview({ name: 'test', complete } as LlmClient), toolContext: () => s.ctx, store: s.store, memory: s.memory, autoLearn: false, requireCompletionState: true }, append: m => s.store.appendMessage(s.conversation.id, m) });
    expect(result.error).toBeUndefined();
    expect(complete).toHaveBeenCalledTimes(13);
    expect(result.messages.at(-1)?.tools).toHaveLength(6);
  });

  it('keeps Stop responsive during automatic continuation backoff', async () => {
    const s = setup();
    const abort = new AbortController();
    const complete = vi.fn(async () => 'Still working.\n<cowork_state>working</cowork_state>');
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Do the work', via: 'web' });
    const result = await runConversationTurn({ conversation: s.conversation, trigger, history: [trigger], deps: { agents: [s.agent], resolveLlm: () => ({ name: 'test', complete } as LlmClient), toolContext: () => s.ctx, autoLearn: false, requireCompletionState: true, signal: abort.signal, onProgress: p => { if (p.text.includes('Retrying automatically')) abort.abort(); } }, append: m => s.store.appendMessage(s.conversation.id, m) });
    expect(complete).toHaveBeenCalledTimes(3);
    expect(result.messages.at(-1)?.text).toContain('Stopped by user');
  });

  it('rejects a premature done marker and then performs the missing action', async () => {
    const s = setup();
    const replies = ['I will inspect the files.\n<cowork_state>done</cowork_state>', '<tool>{"name":"list_files","params":{"path":"."}}</tool>', 'The files are checked.\n<cowork_state>done</cowork_state>'];
    const complete = vi.fn(async () => replies.shift()!);
    const llm = withReview({ name: 'test', complete } as LlmClient, ({ candidate }) => candidate.startsWith('The files are checked.') ? { state: 'done', reason: 'The directory listing supports the requested check.' } : { state: 'working', reason: 'There is only a promise; inspect the files with the available tool.' });
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Inspect the files', via: 'web' });
    const result = await runConversationTurn({ conversation: s.conversation, trigger, history: [trigger], deps: { agents: [s.agent], resolveLlm: () => llm, toolContext: () => s.ctx, store: s.store, memory: s.memory, autoLearn: false, requireCompletionState: true }, append: m => s.store.appendMessage(s.conversation.id, m) });
    expect(result.error).toBeUndefined();
    expect(complete).toHaveBeenCalledTimes(3);
    expect(result.messages.at(-1)?.tools).toEqual([{ name: 'list_files', ok: true }]);
  });

  it('does not resume an unrelated saved task when the user asks a new question', async () => {
    const s = setup();
    const old = s.store.addTodo({ conversationId: s.conversation.id, agentId: s.agent.id, text: 'Prepare an old report' });
    const complete = vi.fn(async () => 'The sum is 42.\n<cowork_state>done</cowork_state>');
    const llm = withReview({ name: 'test', complete } as LlmClient, ({ checklist }) => {
      expect(checklist).toContainEqual(expect.objectContaining({ id: old.id }));
      return { state: 'done', reason: 'The arithmetic question is answered; the old report is unrelated.' };
    });
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'What is 18 + 24?', via: 'web' });
    const result = await runConversationTurn({ conversation: s.conversation, trigger, history: [trigger], deps: { agents: [s.agent], resolveLlm: () => llm, toolContext: () => s.ctx, store: s.store, memory: s.memory, autoLearn: false, requireCompletionState: true }, append: m => s.store.appendMessage(s.conversation.id, m) });
    expect(result.error).toBeUndefined();
    expect(complete).toHaveBeenCalledOnce();
    expect(s.store.todos(s.conversation.id)[0]?.status).toBe('pending');
  });

  it('executes native OpenRouter calls and preserves tool results for the next round', async () => {
    const s = setup();
    let rounds = 0;
    const complete = vi.fn(async () => JSON.stringify({ state: 'done', reason: 'The requested write succeeded.' }));
    const llm: LlmClient = { name: 'native-test', complete, completeStream: vi.fn(), completeTurn: async (messages, options): Promise<LlmTurnResult> => {
      expect(options?.protocolMode).toBe('native');
      expect(options?.tools?.some(tool => tool.name === 'write_file')).toBe(true);
      if (++rounds === 1) return { kind: 'tool_calls', calls: [{ id: 'native-write', name: 'write_file', arguments: { path: 'native.txt', content: '42' } }], metadata: {} };
      expect(JSON.stringify(messages)).toContain('TOOL RESULT write_file (ok=true)');
      expect(messages.some(message => message.toolCalls?.some(call => call.id === 'native-write' && call.name === 'write_file'))).toBe(true);
      expect(messages.some(message => message.role === 'tool' && message.toolCallId === 'native-write')).toBe(true);
      return { kind: 'text', text: 'Saved 42.\n<cowork_state>done</cowork_state>', metadata: {} };
    } };
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Save 42 to native.txt', via: 'web' });
    const result = await runConversationTurn({ conversation: s.conversation, trigger, history: [trigger], deps: { agents: [s.agent], resolveLlm: () => llm, toolContext: () => s.ctx, store: s.store, memory: s.memory, autoLearn: false, requireCompletionState: true }, append: m => s.store.appendMessage(s.conversation.id, m) });
    expect(result.error).toBeUndefined();
    expect(readFileSync(path.join(root, 'native.txt'), 'utf8')).toBe('42');
    expect(result.messages.at(-1)?.text).toBe('Saved 42.');
    expect(complete).toHaveBeenCalledOnce();
    const tools = coworkNativeTools({ ...s.agent, allowWrites: false }, false);
    expect(tools.some(tool => tool.name === 'write_file')).toBe(false);
    expect(tools.some(tool => tool.name === 'browse')).toBe(false);
  });

  it('falls back to text tools only when the endpoint rejects native functions', async () => {
    const s = setup();
    let rounds = 0;
    const llm = { name: 'native-fallback', complete: async () => JSON.stringify({ state: 'done', reason: 'The requested file check was performed.' }), completeTurn: async (_messages: LlmMessage[], options: { protocolMode?: string }): Promise<LlmTurnResult> => {
      if (++rounds === 1) throw new LlmError('Tools unsupported', { kind: 'tool_protocol_incompatible' });
      expect(options.protocolMode).toBeUndefined();
      return { kind: 'text', text: rounds === 2 ? '<tool>{"name":"list_files","params":{"path":"."}}</tool>' : 'Checked.\n<cowork_state>done</cowork_state>', metadata: {} };
    } } as LlmClient;
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Check the files', via: 'web' });
    const result = await runConversationTurn({ conversation: s.conversation, trigger, history: [trigger], deps: { agents: [s.agent], resolveLlm: () => llm, toolContext: () => s.ctx, autoLearn: false, requireCompletionState: true }, append: m => s.store.appendMessage(s.conversation.id, m) });
    expect(result.error).toBeUndefined();
    expect(rounds).toBe(3);
    expect(result.messages.at(-1)?.tools).toEqual([{ name: 'list_files', ok: true }]);
  });

  it('continues past four tool checkpoints without ending the Cowork turn', async () => {
    const s = setup();
    const toolRounds = 24 * 4;
    let calls = 0;
    const old = s.store.addTodo({ conversationId: s.conversation.id, agentId: s.agent.id, text: 'Earlier work' });
    s.store.updateTodo(old.id, s.agent.id, { status: 'done' });
    const current = s.store.addTodo({ conversationId: s.conversation.id, agentId: s.agent.id, text: 'Review current configuration' });
    const summaries: { completed: { text: string }[]; totalActions: number }[] = [];
    const complete = vi.fn(async (messages: LlmMessage[]) => {
      if (String(messages[0]?.content).startsWith('CHECKPOINT SUMMARY:')) {
        summaries.push(JSON.parse(String(messages[1]?.content)));
        return JSON.stringify({ accomplished: summaries.length === 1 ? 'Reviewed the current configuration.' : 'Reviewed the remaining results.', next: 'Continue reviewing the verification results.' });
      }
      if (++calls === 1) s.store.updateTodo(current.id, s.agent.id, { status: 'done' });
      return calls <= toolRounds ? '<tool>{"name":"todo_manage","params":{"action":"list"}}</tool>' : 'All checks are complete.\n<cowork_state>done</cowork_state>';
    });
    const onMessage = vi.fn();
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Run a long verification', via: 'web' });
    const result = await runConversationTurn({
      conversation: s.conversation, trigger, history: [trigger],
      deps: { agents: [s.agent], resolveLlm: () => withReview({ name: 'long-chain-test', complete } as LlmClient), toolContext: () => s.ctx, memory: s.memory, store: s.store, autoLearn: false, requireCompletionState: true, onMessage },
      append: (message) => s.store.appendMessage(s.conversation.id, message),
    });
    expect(result.error).toBeUndefined();
    expect(calls).toBe(toolRounds + 1);
    expect(complete).toHaveBeenCalledTimes(toolRounds + 5);
    const checkpoints = result.messages.filter(message => message.checkpoint);
    expect(checkpoints).toHaveLength(4);
    expect(checkpoints[0]!.text).toContain('Reviewed the current configuration.');
    expect(summaries.map(summary => summary.totalActions)).toEqual([24, 24, 24, 24]);
    expect(summaries[0]!.completed.map(todo => todo.text)).toEqual(['Review current configuration']);
    expect(summaries[1]!.completed).toEqual([]);
    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ checkpoint: expect.objectContaining({ number: 2 }) }));
    expect(new CoworkStore(s.file).messages(s.conversation.id).filter(message => message.checkpoint)).toHaveLength(4);
    expect(result.messages.at(-1)).toMatchObject({ role: 'agent', text: 'All checks are complete.' });
  }, 60000);

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
    // The screenshot is also surfaced to the USER as an inline image artifact,
    // not only fed to the model — the chat bubble renders it via cwFilesHtml.
    const artifacts = new CoworkStore(s.file).artifacts(s.conversation.id);
    expect(artifacts.some((a) => a.mime === 'image/png')).toBe(true);
    expect(result.messages[0]!.artifactIds?.length).toBeGreaterThan(0);
  });

  it('wires the desktop browser into Cowork host contexts', async () => {
    const s = setup();
    const state = { available: true, url: 'https://example.com', title: 'Example', canBack: false, canForward: false, loading: false };
    const screenshot = vi.fn(async () => ({ pngBase64: 'aGVsbG8=', state }));
    const browser = { available: () => true, screenshot } as NonNullable<ToolContext['browser']>;
    const server = new HermesServer({ passwordRequired: false, cwd: root, browser });
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

  it('streams mission prose without exposing its status JSON', async () => {
    const s = setup();
    const mission = s.store.createMission({ conversationId: s.conversation.id, agentId: s.agent.id, goal: 'Check the workspace', criteria: [] });
    const frames: string[] = [];
    const llm: LlmClient = {
      name: 'mission-stream-test',
      complete: async () => '',
      completeStream: async (_messages, _options, onDelta) => {
        const reply = 'I checked the workspace and verified the result.\n{"status":"done","progress":"Verified","criteriaMet":[],"result":"Ready"}';
        for (const piece of ['I checked the workspace', ' and verified the result.\n{', '"status":"done","progress":"Verified","criteriaMet":[],"result":"Ready"}']) onDelta(piece);
        return reply;
      },
    };
    const result = await runMissionSession({
      mission, agent: s.agent,
      deps: { agents: [s.agent], resolveLlm: () => llm, toolContext: () => s.ctx, memory: s.memory, store: s.store, autoLearn: false, onProgress: p => frames.push(p.text) },
      append: m => s.store.appendMessage(s.conversation.id, m),
    });
    expect(result.status).toBe('done');
    expect(frames.some(text => text.includes('checked the workspace'))).toBe(true);
    expect(frames.some(text => text.includes('"status"'))).toBe(false);
  });
});
