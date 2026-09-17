/**
 * Message-interaction invariants: editing, retrying, resending, deleting and
 * referencing never create a second copy of a logical message.
 *
 *   Edit      → same id, revision + 1
 *   Retry     → same id, attempt + 1
 *   Resend    → same id, attempt + 1
 *   Reference → one new message plus a citation edge
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CoworkStore } from '../src/cowork/store.js';
import { buildCoworkMessages, renderReferencedMessages, runConversationTurn } from '../src/cowork/runner.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { GituServer } from '../src/server/server.js';
import type { LlmClient } from '../src/llm/llm.js';

const tempDirs: string[] = [];
afterAll(() => { for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true }); });

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `cowork-${prefix}-`));
  tempDirs.push(dir);
  return dir;
}

function fixture() {
  const file = path.join(tempDir('identity'), 'cowork.json');
  const store = new CoworkStore(file);
  const chief = store.saveAgent({ name: 'Mira', systemPrompt: 'Coordinate the team.' });
  const dev = store.saveAgent({ name: 'Dev', systemPrompt: 'Write the code.' });
  const conversation = store.saveConversation({ kind: 'group', title: 'Launch', memberIds: [chief.id, dev.id], chiefId: chief.id });
  return { file, store, chief, dev, conversation };
}

const userMessages = (store: CoworkStore, conversationId: string) =>
  store.messages(conversationId).filter((message) => message.role === 'user');

describe('cowork message identity', () => {
  it('replays a supplied id after restart without changing identity or cursor', () => {
    const { file, store, conversation } = fixture();
    const input = { id: 'replay-id', role: 'user' as const, text: 'once', via: 'web' as const, status: 'sent' as const };
    const original = { ...store.appendMessage(conversation.id, input) };
    const restarted = new CoworkStore(file);
    const cursor = restarted.messageChangeCursor(conversation.id);
    const replay = restarted.appendMessage(conversation.id, input);
    expect(replay).toEqual(original);
    expect(restarted.messages(conversation.id)).toHaveLength(1);
    expect(restarted.messageChangeCursor(conversation.id)).toBe(cursor);
  });

  it('send then retry keeps ONE logical message, attempt + 1', () => {
    const { store, conversation } = fixture();
    const sent = store.appendMessage(conversation.id, { role: 'user', text: 'ship it', via: 'web' });
    expect(sent).toMatchObject({ revision: 0, attempt: 0, status: 'sending' });

    const retried = store.retryMessage(conversation.id, sent.id)!;
    expect(retried.id).toBe(sent.id);
    expect(retried.seq).toBe(sent.seq);
    expect(retried.attempt).toBe(1);
    expect(retried.revision).toBe(0);
    expect(retried.status).toBe('retrying');
    expect(userMessages(store, conversation.id)).toHaveLength(1);
  });

  it('send then edit keeps ONE logical message, revision + 1', () => {
    const { store, conversation } = fixture();
    const sent = store.appendMessage(conversation.id, { role: 'user', text: 'original', via: 'web' });
    const edited = store.reviseMessage(conversation.id, sent.id, { text: 'edited' })!;

    expect(edited.id).toBe(sent.id);
    expect(edited.seq).toBe(sent.seq);
    expect(edited.ts).toBe(sent.ts); // identity, not a new send
    expect(edited.revision).toBe(1);
    expect(edited.attempt).toBe(0);
    expect(edited.text).toBe('edited');
    expect(edited.status).toBe('sending');
    expect(userMessages(store, conversation.id)).toHaveLength(1);
  });

  it('a failed message retried twice stays one message with attempt = 2', () => {
    const { store, conversation } = fixture();
    const sent = store.appendMessage(conversation.id, { role: 'user', text: 'unstable send', via: 'web' });
    store.setMessageStatus(conversation.id, sent.id, 'failed');
    expect(store.getMessage(conversation.id, sent.id)!.status).toBe('failed');

    store.retryMessage(conversation.id, sent.id);
    const twice = store.retryMessage(conversation.id, sent.id)!;
    expect(twice.attempt).toBe(2);
    expect(twice.revision).toBe(0);
    expect(userMessages(store, conversation.id)).toHaveLength(1);
    expect(store.messages(conversation.id)).toHaveLength(1);
  });

  it('two edits reach revision = 2 and only the latest text survives', () => {
    const { store, conversation } = fixture();
    const sent = store.appendMessage(conversation.id, { role: 'user', text: 'v0', via: 'web' });
    store.reviseMessage(conversation.id, sent.id, { text: 'v1' });
    const twice = store.reviseMessage(conversation.id, sent.id, { text: 'v2' })!;
    expect(twice.revision).toBe(2);
    expect(twice.text).toBe('v2');
    expect(store.messages(conversation.id)).toHaveLength(1);
  });

  it('an edit of a queued message updates that slot instead of adding a turn', () => {
    const { store, conversation } = fixture();
    const sent = store.appendMessage(conversation.id, { role: 'user', text: 'draft', via: 'web' });
    store.reviseMessage(conversation.id, sent.id, { text: 'final' });
    store.retryMessage(conversation.id, sent.id);
    expect(store.getMessage(conversation.id, sent.id)).toMatchObject({ text: 'final', revision: 1, attempt: 1 });
    expect(store.messages(conversation.id)).toHaveLength(1);
  });

  it('sets delivery status without touching revision or attempt', () => {
    const { store, conversation } = fixture();
    const sent = store.appendMessage(conversation.id, { role: 'user', text: 'hi', via: 'web' });
    store.setMessageStatus(conversation.id, sent.id, 'sent');
    expect(store.getMessage(conversation.id, sent.id)).toMatchObject({ status: 'sent', revision: 0, attempt: 0 });
    expect(store.messages(conversation.id)).toHaveLength(1);
  });
});

describe('cowork references and mentions', () => {
  it('referencing an older message creates ONE new message plus a citation edge', () => {
    const { store, chief, conversation } = fixture();
    const earlier = store.appendMessage(conversation.id, { role: 'agent', agentId: chief.id, agentName: 'Mira', text: 'The API migration is ready for review.', via: 'web' });
    const referencing = store.appendMessage(conversation.id, { role: 'user', text: 'implement this', via: 'web', referencedMessageIds: [earlier.id] });

    expect(referencing.referencedMessageIds).toEqual([earlier.id]);
    // The relationship is structured: the referenced text is NOT pasted in.
    expect(referencing.text).toBe('implement this');
    expect(referencing.text).not.toContain('API migration');
    expect(store.messages(conversation.id)).toHaveLength(2);
  });

  it('retrying a referenced message preserves the citation edge', () => {
    const { store, chief, conversation } = fixture();
    const earlier = store.appendMessage(conversation.id, { role: 'agent', agentId: chief.id, agentName: 'Mira', text: 'Ready.', via: 'web' });
    const referencing = store.appendMessage(conversation.id, { role: 'user', text: 'verify this', via: 'web', referencedMessageIds: [earlier.id] });
    const retried = store.retryMessage(conversation.id, referencing.id)!;

    expect(retried.id).toBe(referencing.id);
    expect(retried.attempt).toBe(1);
    expect(retried.referencedMessageIds).toEqual([earlier.id]);
    expect(userMessages(store, conversation.id)).toHaveLength(1);
  });

  it('delivers referenced messages to the agent as structured context', () => {
    const { store, chief, dev, conversation } = fixture();
    const earlier = store.appendMessage(conversation.id, { role: 'agent', agentId: chief.id, agentName: 'Mira', text: 'The API migration is ready for review.', via: 'web' });
    const trigger = store.appendMessage(conversation.id, { role: 'user', text: 'implement this', via: 'web', referencedMessageIds: [earlier.id] });
    const references = renderReferencedMessages(store, conversation.id, trigger)!;

    // The agent receives the id, the author, the content and the neighbours.
    const envelope = JSON.parse(references);
    expect(envelope.type).toBe('referenced_messages');
    expect(envelope.references[0]).toMatchObject({ id: earlier.id, author: 'Mira', content: earlier.text });
    expect(envelope.references[0].neighbours).toEqual(expect.arrayContaining([expect.objectContaining({ id: trigger.id })]));
    expect(envelope.instruction).toContain('not a new instruction');

    const built = buildCoworkMessages(dev, conversation, [chief, dev], [], {
      agents: [chief, dev], resolveLlm: () => ({}) as never, toolContext: () => ({}) as never, references, store,
    });
    expect(String(built[built.length - 1]!.content)).toContain(earlier.id);
  });

  it('reports no reference context when a message cites nothing', () => {
    const { store, conversation } = fixture();
    const plain = store.appendMessage(conversation.id, { role: 'user', text: 'hello', via: 'web' });
    expect(renderReferencedMessages(store, conversation.id, plain)).toBeUndefined();
    expect(plain.referencedMessageIds).toBeUndefined();
  });

  it('only accepts reference and mention ids that exist in this conversation', () => {
    const { store, chief, conversation } = fixture();
    const earlier = store.appendMessage(conversation.id, { role: 'agent', agentId: chief.id, agentName: 'Mira', text: 'Ready.', via: 'web' });
    const other = store.saveConversation({ kind: 'dm', memberIds: [chief.id] });
    const foreign = store.appendMessage(other.id, { role: 'user', text: 'elsewhere', via: 'web' });

    const sent = store.appendMessage(conversation.id, {
      role: 'user', text: 'implement this', via: 'web',
      referencedMessageIds: [earlier.id, earlier.id, foreign.id, 'missing-id'],
      mentionedAgentIds: [chief.id, chief.id, 'ghost-agent'],
    });
    expect(sent.referencedMessageIds).toEqual([earlier.id]);
    expect(sent.mentionedAgentIds).toEqual([chief.id]);

    // A message may never cite itself.
    const self = store.appendMessage(conversation.id, { role: 'user', text: 'self', via: 'web', referencedMessageIds: [sent.id] });
    store.reviseMessage(conversation.id, self.id, { referencedMessageIds: [self.id] });
    expect(store.getMessage(conversation.id, self.id)!.referencedMessageIds).toBeUndefined();
  });
});

describe('cowork message change feed', () => {
  it('reports a deletion once and never as a new message', () => {
    const { store, conversation } = fixture();
    const older = store.appendMessage(conversation.id, { role: 'user', text: 'first', via: 'web' });
    const target = store.appendMessage(conversation.id, { role: 'user', text: 'second', via: 'web' });
    const after = store.messages(conversation.id).at(-1)!.seq;
    const before = store.messageChangeCursor(conversation.id);

    expect(store.deleteMessage(conversation.id, target.id)).toBe(true);
    expect(store.getMessage(conversation.id, target.id)).toBeUndefined();
    expect(store.messages(conversation.id).map((message) => message.id)).toEqual([older.id]);

    const changes = store.messageChanges(conversation.id, after, before);
    expect(changes.removed).toEqual([target.id]);
    // A second read from the advanced cursor must not replay the removal.
    const replayed = store.messageChanges(conversation.id, after, changes.changeSeq);
    expect(replayed.removed).toEqual([]);
    expect(replayed.updates).toEqual([]);
  });

  it('reports an edit as an update on the existing row, not an append', () => {
    const { store, conversation } = fixture();
    const sent = store.appendMessage(conversation.id, { role: 'user', text: 'original', via: 'web' });
    const after = sent.seq;
    const before = store.messageChangeCursor(conversation.id);
    store.reviseMessage(conversation.id, sent.id, { text: 'edited' });

    const changes = store.messageChanges(conversation.id, after, before);
    expect(changes.updates.map((message) => message.id)).toEqual([sent.id]);
    expect(changes.updates[0]).toMatchObject({ text: 'edited', revision: 1, seq: sent.seq });
    // Appended messages are what `messages(afterSeq)` returns — one row in total.
    expect(store.messages(conversation.id, after)).toEqual([]);
    expect(store.messages(conversation.id)).toHaveLength(1);
  });
});

describe('durable message identity', () => {
  it('owns initial counters and ignores conflicting replay payloads', () => {
    const { store, conversation } = fixture();
    const first = store.appendMessage(conversation.id, { id: 'owned', role: 'user', via: 'web', text: 'original', revision: 99, attempt: 99, status: 'sent' });
    expect(first).toMatchObject({ conversationId: conversation.id, revision: 0, attempt: 0 });
    store.reviseMessage(conversation.id, first.id, { text: 'edited', mentionedAgentIds: [] });
    const cursor = store.messageChangeCursor(conversation.id);
    expect(store.appendMessage(conversation.id, { id: first.id, role: 'user', via: 'web', text: 'stale' })).toBe(first);
    expect(first).toMatchObject({ text: 'edited', revision: 1, status: 'sent', mentionedAgentIds: [] });
    expect(store.messageChangeCursor(conversation.id)).toBe(cursor);
    store.setMessageStatus(conversation.id, first.id, 'failed');
    store.reviseMessage(conversation.id, first.id, { text: 'still failed' });
    expect(first.status).toBe('failed');
  });

  it('never reuses deleted identities or sequence positions, even with an empty transcript', () => {
    const { file, store, conversation } = fixture();
    const first = store.appendMessage(conversation.id, { id: 'deleted', role: 'user', via: 'web', text: 'gone', status: 'sent' });
    store.deleteMessage(conversation.id, first.id);
    const deletedCursor = store.messageChangeCursor(conversation.id);
    const restarted = new CoworkStore(file);
    expect(() => restarted.appendMessage(conversation.id, first)).toThrow(/deleted/);
    expect(restarted.retryMessage(conversation.id, first.id)).toBeUndefined();
    expect(restarted.reviseMessage(conversation.id, first.id, { text: 'resurrection' })).toBeUndefined();
    const next = restarted.appendMessage(conversation.id, { role: 'user', via: 'web', text: 'next', status: 'sent' });
    expect(next.seq).toBeGreaterThan(deletedCursor);
    expect(next.seq).toBe(next.changeSeq);
    expect(restarted.messages(conversation.id, first.seq)).toEqual([next]);
    restarted.deleteMessage(conversation.id, next.id);
    expect(new CoworkStore(file).messageChangeCursor(conversation.id)).toBeGreaterThan(next.seq);
  });

  it('retains more than 200 tombstones and reconciles stale/zero cursors after restart', () => {
    const { file, store, conversation } = fixture();
    const keep = store.appendMessage(conversation.id, { role: 'agent', via: 'agent', text: 'keep' });
    const ids: string[] = [];
    for (let i = 0; i < 205; i++) {
      const message = store.appendMessage(conversation.id, { id: `removed-${i}`, role: 'agent', via: 'agent', text: 'gone' });
      ids.push(message.id);
      store.deleteMessage(conversation.id, message.id);
    }
    store.reviseMessage(conversation.id, keep.id, { text: 'updated' });
    const restarted = new CoworkStore(file);
    for (const since of [0, keep.seq]) {
      const changes = restarted.messageChanges(conversation.id, keep.seq, since);
      expect(changes.removed).toEqual(ids);
      expect(changes.updates).toEqual([expect.objectContaining({ id: keep.id, text: 'updated' })]);
    }
    expect(restarted.messageChanges(conversation.id).removed).toEqual(ids);
    expect(() => restarted.appendMessage(conversation.id, { id: ids[0], role: 'agent', via: 'agent', text: 'replay' })).toThrow(/deleted/);
  });

  it('preserves out-of-order mutation cursors while migrating legacy messages', () => {
    const { file, store, conversation } = fixture();
    for (let i = 0; i < 3; i++) store.appendMessage(conversation.id, { role: 'agent', via: 'agent', text: `m${i}` });
    const data = JSON.parse(readFileSync(file, 'utf8'));
    const list = data.messages[conversation.id];
    list[0].changeSeq = 80;
    list[1].changeSeq = 20;
    delete list[2].changeSeq;
    for (const message of list) { delete message.conversationId; delete message.revision; delete message.attempt; delete message.status; }
    writeFileSync(file, JSON.stringify(data));
    const restarted = new CoworkStore(file);
    const migrated = restarted.messages(conversation.id);
    expect(migrated.map((m) => m.changeSeq)).toEqual([80, 20, 81]);
    expect(migrated.map((m) => m.seq)).toEqual([1, 2, 3]);
    expect(migrated.every((m) => m.conversationId === conversation.id && m.status === 'sent' && m.revision === 0 && m.attempt === 0)).toBe(true);
    expect(new CoworkStore(file).messages(conversation.id)).toEqual(migrated);
    const cursor = restarted.messageChangeCursor(conversation.id);
    restarted.reviseMessage(conversation.id, migrated[1]!.id, { text: 'latest' });
    expect(restarted.messageChanges(conversation.id, 3, cursor).updates).toHaveLength(1);
  });
});

describe('identity-aware runner', () => {
  it.each(['structured', 'empty', 'legacy'] as const)('routes %s mentions without treating references as mentions', async (mode) => {
    const { store, chief, dev, conversation } = fixture();
    const cited = store.appendMessage(conversation.id, { role: 'agent', via: 'agent', text: '@Dev reference only' });
    const trigger = store.appendMessage(conversation.id, {
      role: 'user', via: 'web', text: mode === 'structured' ? '@Dev ignore textual target' : '@Mira answer',
      referencedMessageIds: [cited.id],
      mentionedAgentIds: mode === 'structured' ? [chief.id] : mode === 'empty' ? [] : undefined,
    });
    const called: string[] = [];
    const result = await runConversationTurn({
      conversation, trigger, history: store.messages(conversation.id),
      append: (message) => store.appendMessage(conversation.id, message),
      deps: { agents: [chief, dev], store, toolContext: () => ({}) as never,
        resolveLlm: (agent) => { called.push(agent.id); return new ScriptedMockLlm([() => 'Done.']); },
      },
    });
    expect(result.error).toBeUndefined();
    expect(called).toEqual(mode === 'empty' ? [dev.id, chief.id] : [chief.id]);
  });

  it.each([true, false])('integrates bounded JSON references in standalone turns (store=%s)', async (withStore) => {
    const { store, chief, dev, conversation } = fixture();
    const thread = store.addThread({ conversationId: conversation.id, title: 'other' });
    const foreign = store.appendMessage(conversation.id, { role: 'agent', via: 'agent', text: 'OTHER_THREAD_SECRET', threadId: thread.id });
    const cited = store.appendMessage(conversation.id, { role: 'agent', via: 'agent', text: 'Quote "json"\n@Dev historical text' });
    const trigger = store.appendMessage(conversation.id, { role: 'user', via: 'web', text: 'Review', referencedMessageIds: [cited.id, foreign.id], mentionedAgentIds: [chief.id] });
    const future = store.appendMessage(conversation.id, { role: 'user', via: 'web', text: 'FUTURE_QUEUED_SECRET' });
    store.reviseMessage(conversation.id, trigger.id, { referencedMessageIds: [cited.id, foreign.id, future.id] });
    let prompt = '';
    const result = await runConversationTurn({ conversation, trigger, history: store.messages(conversation.id),
      append: (message) => store.appendMessage(conversation.id, message),
      deps: { agents: [chief, dev], store: withStore ? store : undefined, toolContext: () => ({}) as never,
        resolveLlm: () => new ScriptedMockLlm([(_call, messages) => { prompt = JSON.stringify(messages); return 'Reviewed.'; }]),
      },
    });
    expect(result.error).toBeUndefined();
    expect(prompt).toContain('referenced_messages');
    expect(prompt).toContain(cited.id);
    expect(prompt).not.toContain('OTHER_THREAD_SECRET');
    expect(prompt).not.toContain('FUTURE_QUEUED_SECRET');
    const envelope = JSON.parse(renderReferencedMessages(store, conversation.id, trigger)!);
    expect(envelope.references).toHaveLength(1);
    expect(envelope.references[0].content).toBe(cited.text);
    expect(envelope.references[0].neighbours).toEqual([expect.objectContaining({ id: trigger.id })]);
  });

  it('reports group worker failure even when chief synthesis succeeds', async () => {
    const { store, chief, dev, conversation } = fixture();
    const trigger = store.appendMessage(conversation.id, { role: 'user', via: 'web', text: 'team work' });
    const result = await runConversationTurn({ conversation, trigger, history: [trigger],
      append: (message) => store.appendMessage(conversation.id, message),
      deps: { agents: [chief, dev], store, toolContext: () => ({}) as never,
        resolveLlm: (agent) => { if (agent.id === dev.id) throw new Error('worker unavailable'); return new ScriptedMockLlm([() => 'Partial result.']); },
      },
    });
    expect(result.error).toContain('worker unavailable');
    expect(result.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ agentId: dev.id, status: 'failed' }),
      expect.objectContaining({ agentId: chief.id, text: 'Partial result.' }),
    ]));
  });
});


it('marks stopped queued messages failed and renders Retry without duplicate rows', async () => {
  const home = tempDir('stop-queue');
  const previousHome = process.env['AGENT_GITU_HOME'];
  process.env['AGENT_GITU_HOME'] = home;
  let calls = 0;
  let started!: () => void;
  const entered = new Promise<void>((resolve) => { started = resolve; });
  const complete: LlmClient['complete'] = async (_messages, opts) => {
    calls++;
    started();
    await new Promise<void>((_resolve, reject) => {
      const fail = () => reject(new Error('Stopped by user'));
      if (opts?.signal?.aborted) fail();
      else opts?.signal?.addEventListener('abort', fail, { once: true });
    });
    return '';
  };
  const client: LlmClient = { name: 'queue-stop-stub', complete, completeStream: (messages, opts) => complete(messages, opts) };
  const server = new GituServer({ cwd: home, port: 0, llm: client });
  try {
    const base = `http://127.0.0.1:${await server.start()}`;
    const request = async (route: string, method = 'GET', body?: unknown) => {
      const response = await fetch(base + route, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(3000) });
      return { status: response.status, data: await response.json() };
    };
    const agent = (await request('/api/cowork/agents', 'POST', { name: 'Queued', systemPrompt: 'Reply briefly.' })).data.agent;
    const conv = (await request('/api/cowork/conversations', 'POST', { kind: 'dm', memberIds: [agent.id] })).data.conversation;
    const route = `/api/cowork/conversations/${conv.id}/messages`;
    expect((await request(route, 'POST', { id: 'running', text: 'First' })).status).toBe(202);
    await entered;
    const queued = await request(route, 'POST', { id: 'queued', text: 'Second' });
    expect(queued.data.queued).toBe(true);
    const busyEdit = await request(route + '/queued', 'PATCH', { revision: 0, text: 'Too early' });
    expect(busyEdit.status).toBeGreaterThanOrEqual(400);
    expect((await request(route.replace(/\/messages$/, '/stop'), 'POST', {})).status).toBe(200);
    let final = (await request(route)).data;
    const deadline = Date.now() + 3000;
    while (final.busy && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      final = (await request(route)).data;
    }
    expect(final.busy).toBe(false);
    const users = (final.messages as import('../src/cowork/store.js').CoworkMessage[]).filter((m) => m.role === 'user');
    expect(users.map((m) => [m.id, m.status])).toEqual([['running', 'failed'], ['queued', 'failed']]);
    expect(calls).toBe(1);
    // Evaluate the actual UI row renderer against the server's final snapshot.
    const { createContext, Script } = await import('node:vm');
    const { COWORK_JS } = await import('../src/server/ui-cowork.js');
    const context = createContext({ S: { cw: { active: conv.id, msgs: users, agents: [], convs: [conv] } }, window: { addEventListener: () => {} }, esc: (s: unknown) => String(s ?? ''), $: () => null });
    new Script(COWORK_JS).runInContext(context);
    const html = users.map((m) => context.cwBubbleHtml(m)).join('');
    expect(html.match(/class="cw-row me"/g)).toHaveLength(2);
    expect(html.match(/>Retry</g)).toHaveLength(2);
    expect(html).not.toContain('data-cwaction="edit" disabled');
    const edited = await request(route + '/queued', 'PATCH', { revision: 0, text: 'Editable after stop' });
    expect(edited.data.message).toMatchObject({ id: 'queued', revision: 1, status: 'failed' });
  } finally {
    await server.stop();
    if (previousHome === undefined) delete process.env['AGENT_GITU_HOME']; else process.env['AGENT_GITU_HOME'] = previousHome;
  }
}, 10000);

describe('restart and retention recovery', () => {
  it('durably fails interrupted sends/retries without counter increments', () => {
    const { file, store, conversation } = fixture();
    const sending = store.appendMessage(conversation.id, { role: 'user', via: 'web', text: 'sending' });
    const retrying = store.appendMessage(conversation.id, { role: 'user', via: 'web', text: 'retrying' });
    store.retryMessage(conversation.id, retrying.id);
    const before = store.messageChangeCursor(conversation.id);
    const restarted = new CoworkStore(file);
    expect(restarted.getMessage(conversation.id, sending.id)).toMatchObject({ status: 'failed', revision: 0, attempt: 0 });
    expect(restarted.getMessage(conversation.id, retrying.id)).toMatchObject({ status: 'failed', revision: 0, attempt: 1 });
    expect(restarted.messageChanges(conversation.id, retrying.seq, before).updates).toHaveLength(2);
    expect(new CoworkStore(file).messageChangeCursor(conversation.id)).toBe(restarted.messageChangeCursor(conversation.id));
    expect(JSON.parse(readFileSync(file, 'utf8')).messages[conversation.id].every((m: { status: string }) => m.status === 'failed')).toBe(true);
  });

  it('tombstones thread deletions, with thread-scoped removal feeds', () => {
    const { file, store, conversation } = fixture();
    const thread = store.addThread({ conversationId: conversation.id, title: 'topic' });
    const removed = store.appendMessage(conversation.id, { role: 'agent', via: 'agent', text: 'thread', threadId: thread.id });
    store.deleteThread(conversation.id, thread.id);
    const restarted = new CoworkStore(file);
    expect(restarted.messageChanges(conversation.id, removed.seq, 0, thread.id).removed).toEqual([removed.id]);
    expect(restarted.messageChanges(conversation.id, removed.seq, 0, null).removed).toEqual([]);
    expect(() => restarted.appendMessage(conversation.id, removed)).toThrow(/deleted/);
    expect(restarted.appendMessage(conversation.id, { role: 'agent', via: 'agent', text: 'main' }).seq).toBeGreaterThan(removed.seq);
  });

  it('protects evicted identities and reports eviction as a removal', () => {
    const { file, store, conversation } = fixture();
    const first = store.appendMessage(conversation.id, { id: 'evicted', role: 'agent', via: 'agent', text: 'old' });
    // Seed a full retained transcript without 2,000 filesystem writes.
    const data = JSON.parse(readFileSync(file, 'utf8'));
    data.messages[conversation.id] = Array.from({ length: 2000 }, (_, i) => ({ ...first, id: i === 0 ? first.id : `seed-${i}`, seq: i + 1, changeSeq: i + 1 }));
    writeFileSync(file, JSON.stringify(data));
    const full = new CoworkStore(file);
    const next = full.appendMessage(conversation.id, { role: 'agent', via: 'agent', text: 'new' });
    expect(next.seq).toBe(2001);
    expect(full.messages(conversation.id)).toHaveLength(2000);
    const restarted = new CoworkStore(file);
    expect(restarted.messageChanges(conversation.id, 2000, 2000).removed).toEqual([first.id]);
    expect(() => restarted.appendMessage(conversation.id, first)).toThrow(/deleted/);
  });
});
