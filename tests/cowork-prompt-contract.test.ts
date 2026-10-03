import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { CoworkStore } from '../src/cowork/store.js';
import { CoworkMemory } from '../src/cowork/memory.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { SkillStore } from '../src/skills/skills.js';
import { buildCoworkMessages, runConversationTurn } from '../src/cowork/runner.js';
import { prepareCoworkContext, renderCoworkTaskContext } from '../src/cowork/context.js';
import { coworkNativeTools } from '../src/cowork/tools.js';
import { compactHistory } from '../src/agent/compaction.js';
import type { LlmClient, LlmMessage, LlmTurnResult } from '../src/llm/llm.js';

const root = mkdtempSync(path.join(tmpdir(), 'cowork-contract-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let sequence = 0;
function setup() {
  const file = path.join(root, `store-${++sequence}.json`);
  const store = new CoworkStore(file);
  const agent = store.saveAgent({ name: 'Gitu', systemPrompt: 'Help the user.', allowWrites: true });
  const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
  const memory = new CoworkMemory(MemoryStore.forProject(root), path.basename(root));
  writeFileSync(path.join(root, 'package.json'), '{"name":"cowork-contract"}');
  const ctx = { cwd: root, guard: ProjectGuard.detect(root), skills: SkillStore.forProject(root) };
  return { file, store, agent, conversation, memory, ctx };
}

describe('Cowork completion and autonomous decisions', () => {
  it('rejects a false delivered claim after a successful read, then accepts the actual file and attachment', async () => {
    const s = setup();
    const output = `contract-${sequence}.txt`;
    const replies = [
      '<tool>{"name":"list_files","params":{"path":"."}}</tool>',
      'The requested report is created and attached.\n<cowork_state>done</cowork_state>',
      `<tool>${JSON.stringify({ name: 'write_file', params: { path: output, content: '42' } })}</tool>`,
      `<tool>${JSON.stringify({ name: 'share_file', params: { path: output } })}</tool>`,
      'The report containing 42 is attached.\n<cowork_state>done</cowork_state>',
    ];
    let reviews = 0;
    const llm = { name: 'contract-test', complete: async (messages: LlmMessage[], options?: { effort?: string }) => {
      if (String(messages[0]?.content).startsWith('COWORK COMPLETION REVIEW.')) {
        reviews += 1;
        expect(options?.effort).toBe('low');
        const evidence = JSON.parse(String(messages[1]?.content));
        const attached = evidence.artifacts.some((artifact: { name: string }) => artifact.name === output);
        if (!attached) expect(evidence.artifacts).toHaveLength(0);
        return JSON.stringify({ state: attached ? 'done' : 'working', reason: attached ? 'The requested output exists and is attached.' : 'The directory listing did not create or attach the requested report.' });
      }
      return replies.shift() ?? 'Unexpected extra action';
    } } as LlmClient;
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: `Create ${output} containing 42 and attach it.`, via: 'web' });
    const result = await runConversationTurn({ conversation: s.conversation, trigger, history: [trigger], deps: { agents: [s.agent], resolveLlm: () => llm, toolContext: () => s.ctx, memory: s.memory, store: s.store, autoLearn: false, requireCompletionState: true }, append: message => s.store.appendMessage(s.conversation.id, message) });
    expect(result.error).toBeUndefined();
    expect(reviews).toBe(2);
    expect(readFileSync(path.join(root, output), 'utf8')).toBe('42');
    expect(result.messages.at(-1)?.artifactIds).toHaveLength(1);
    expect(result.messages.at(-1)?.tools?.map(tool => tool.name)).toEqual(['list_files', 'write_file', 'share_file']);
    expect(s.store.openRequests(s.conversation.id)).toHaveLength(0);
  });

  it.each(['What is 18 + 24?', 'Choose a sensible filename and explain why.', 'Compare two approaches before making any changes.'])('answers %s without tools, a checklist or an approval card', async question => {
    const s = setup();
    const stale = s.store.addTodo({ conversationId: s.conversation.id, agentId: s.agent.id, text: 'An unrelated past task' });
    const complete = vi.fn(async (messages: LlmMessage[]) => String(messages[0]?.content).startsWith('COWORK COMPLETION REVIEW.')
      ? JSON.stringify({ state: 'done', reason: 'The requested explanation or decision is supplied. No execution was requested.' })
      : 'Here is the answer and my recommendation.\n<cowork_state>done</cowork_state>');
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: question, via: 'web' });
    const result = await runConversationTurn({ conversation: s.conversation, trigger, history: [trigger], deps: { agents: [s.agent], resolveLlm: () => ({ name: 'direct-answer', complete } as LlmClient), toolContext: () => s.ctx, memory: s.memory, store: s.store, autoLearn: false, requireCompletionState: true }, append: message => s.store.appendMessage(s.conversation.id, message) });
    expect(result.error).toBeUndefined();
    expect(result.messages.at(-1)?.tools).toBeUndefined();
    expect(s.store.openRequests(s.conversation.id)).toHaveLength(0);
    expect(s.store.todos(s.conversation.id)).toEqual([expect.objectContaining({ id: stale.id, status: 'pending' })]);
    expect(complete).toHaveBeenCalledTimes(2);
  });
});

describe('Cowork working context', () => {
  it('keeps original constraints beyond forty messages and preserves speaker roles', () => {
    const s = setup();
    s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Reuse document ORIGINAL-URL and keep its layout.', via: 'web' });
    for (let i = 0; i < 40; i++) s.store.appendMessage(s.conversation.id, { role: 'agent', agentId: s.agent.id, agentName: s.agent.name, text: `Progress ${i}`, via: 'web' });
    s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Continue.', via: 'web' });
    const messages = buildCoworkMessages(s.agent, s.conversation, [s.agent], s.store.messages(s.conversation.id));
    expect(JSON.stringify(messages)).toContain('ORIGINAL-URL');
    expect(messages.at(-1)).toMatchObject({ role: 'user', content: 'Continue.' });
    expect(messages.some(message => message.role === 'assistant' && message.content === 'Progress 39')).toBe(true);
  });

  it('saves semantic checkpoints across restart and invalidates edited or deleted source context', async () => {
    const s = setup();
    const original = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Keep the original document and use the approved folder.', via: 'web' });
    for (let i = 0; i < 54; i++) s.store.appendMessage(s.conversation.id, { role: 'agent', agentId: s.agent.id, text: `Progress ${i}`, via: 'web' });
    const complete = vi.fn(async () => JSON.stringify({ summary: 'Active goal: update the original document. Constraint: retain its layout. Approved scope: the named folder. Work is still in progress.' }));
    await prepareCoworkContext({ history: s.store.messages(s.conversation.id), store: s.store, conversationId: s.conversation.id, agentId: s.agent.id, client: { complete } as unknown as LlmClient });
    const restored = new CoworkStore(s.file);
    expect(restored.contextCheckpoint(s.conversation.id, s.agent.id)?.summary).toContain('retain its layout');
    const messages = buildCoworkMessages(s.agent, s.conversation, [s.agent], restored.messages(s.conversation.id), { agents: [s.agent], store: restored, resolveLlm: () => ({ complete } as unknown as LlmClient), toolContext: () => s.ctx });
    expect(JSON.stringify(messages)).toContain('retain its layout');
    restored.reviseMessage(s.conversation.id, original.id, { text: 'Use the replacement document instead.' });
    expect(restored.contextCheckpoint(s.conversation.id, s.agent.id)).toBeUndefined();
    restored.saveContextCheckpoint({ conversationId: s.conversation.id, agentId: s.agent.id, throughSeq: original.seq, summary: 'Replacement goal.' });
    restored.deleteMessage(s.conversation.id, original.id);
    expect(restored.contextCheckpoint(s.conversation.id, s.agent.id)).toBeUndefined();
    expect(complete).toHaveBeenCalledOnce();
  });

  it('preserves the full current request and decisions through compaction', () => {
    const s = setup();
    const request = s.store.appendMessage(s.conversation.id, { role: 'user', text: `${'Detailed background. '.repeat(180)}\nPreserve IMPORTANT-MIDDLE-CONSTRAINT.\n${'More background. '.repeat(180)}`, via: 'web' });
    const snapshot = renderCoworkTaskContext([request]);
    const messages: LlmMessage[] = [
      { role: 'system', content: 'Operating rules' }, { role: 'user', content: request.text },
      { role: 'assistant', content: 'DECISION: use the existing document.' },
      ...Array.from({ length: 36 }, (_, i): LlmMessage => ({ role: i % 2 ? 'user' : 'assistant', content: `Step ${i}: ${'ordinary output '.repeat(180)}` })),
    ];
    expect(compactHistory(messages, undefined, { force: true, keepRecent: 2, snapshot })).toBe(true);
    expect(JSON.stringify(messages)).toContain('IMPORTANT-MIDDLE-CONSTRAINT');
    expect(JSON.stringify(messages)).toContain('DECISION: use the existing document.');
    expect(JSON.stringify(messages)).toContain('TASK STATE (Cowork conversation context)');
    messages.push(...Array.from({ length: 36 }, (_, i): LlmMessage => ({ role: i % 2 ? 'user' : 'assistant', content: `Later step ${i}: ${'ordinary output '.repeat(180)}` })));
    expect(compactHistory(messages, undefined, { force: true, keepRecent: 2 })).toBe(true);
    expect(JSON.stringify(messages)).toContain('IMPORTANT-MIDDLE-CONSTRAINT');
    expect(JSON.stringify(messages)).toContain('DECISION: use the existing document.');
  });

  it('does not save an obsolete summary when its source is edited during the model call', async () => {
    const s = setup();
    const original = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'Use the original document.', via: 'web' });
    for (let i = 0; i < 54; i++) s.store.appendMessage(s.conversation.id, { role: 'agent', agentId: s.agent.id, text: `Progress ${i}`, via: 'web' });
    const complete = async () => {
      s.store.reviseMessage(s.conversation.id, original.id, { text: 'Use the replacement instead.' });
      return JSON.stringify({ summary: 'Use the original document.' });
    };
    await prepareCoworkContext({ history: s.store.messages(s.conversation.id), store: s.store, conversationId: s.conversation.id, agentId: s.agent.id, client: { complete } as unknown as LlmClient });
    expect(s.store.contextCheckpoint(s.conversation.id, s.agent.id)).toBeUndefined();
  });

  it('scopes checkpoints to a teammate and thread and removes deleted scope', () => {
    const s = setup();
    const peer = s.store.saveAgent({ name: 'Peer', systemPrompt: 'Help.' });
    const thread = s.store.addThread({ conversationId: s.conversation.id, title: 'Separate topic' });
    s.store.saveContextCheckpoint({ conversationId: s.conversation.id, agentId: s.agent.id, threadId: thread.id, throughSeq: 1, summary: 'Private topic work.' });
    expect(s.store.contextCheckpoint(s.conversation.id, peer.id, thread.id)).toBeUndefined();
    expect(s.store.contextCheckpoint(s.conversation.id, s.agent.id)).toBeUndefined();
    s.store.deleteThread(s.conversation.id, thread.id);
    expect(s.store.contextCheckpoint(s.conversation.id, s.agent.id, thread.id)).toBeUndefined();
  });
});

describe('Cowork native tools and routing', () => {
  it('offers individual schemas with extension fields, respects permissions and has one routing policy', () => {
    const s = setup();
    const tools = coworkNativeTools({ ...s.agent, allowShell: true, allowConfig: true, chiefOfStaff: true }, true);
    expect(tools.find(tool => tool.name === 'write_file')?.parameters).toMatchObject({ required: ['path', 'content'], additionalProperties: true });
    expect(tools.some(tool => tool.name === 'cowork_tool')).toBe(false);
    const readOnly = coworkNativeTools({ ...s.agent, allowWrites: false }, false);
    expect(readOnly.some(tool => tool.name === 'write_file' || tool.name === 'browse')).toBe(false);
    const group = { ...s.conversation, kind: 'group' as const, chiefId: s.agent.id };
    const system = String(buildCoworkMessages(s.agent, group, [s.agent], [])[0]?.content);
    expect(system).toContain('Make routine reversible decisions yourself');
    expect(system).toContain('Simple requests need no delegation or new topic');
    expect(system).not.toContain('non-chief teammates work concurrently');
  });

  it('retains matched native results when a call batch exceeds four actions', async () => {
    const s = setup();
    let rounds = 0;
    const llm = { name: 'native-batch', complete: async () => JSON.stringify({ state: 'done', reason: 'The requested listing is available.' }), completeTurn: async (messages: LlmMessage[]): Promise<LlmTurnResult> => {
      if (++rounds === 1) return { kind: 'tool_calls', calls: Array.from({ length: 5 }, (_, i) => ({ id: `list-${i}`, name: 'list_files', arguments: { path: '.' } })), metadata: {} };
      const results = messages.filter(message => message.role === 'tool');
      expect(results.map(message => message.toolCallId)).toEqual(['list-0', 'list-1', 'list-2', 'list-3', 'list-4']);
      expect(String(results.at(-1)?.content)).toContain('Not executed');
      return { kind: 'text', text: 'The workspace listing is available.\n<cowork_state>done</cowork_state>', metadata: {} };
    } } as LlmClient;
    const trigger = s.store.appendMessage(s.conversation.id, { role: 'user', text: 'List workspace files.', via: 'web' });
    const result = await runConversationTurn({ conversation: s.conversation, trigger, history: [trigger], deps: { agents: [s.agent], resolveLlm: () => llm, toolContext: () => s.ctx, autoLearn: false, requireCompletionState: true }, append: message => s.store.appendMessage(s.conversation.id, message) });
    expect(result.error).toBeUndefined();
    expect(result.messages.at(-1)?.tools).toHaveLength(4);
  });
});
