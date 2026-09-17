import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import type { CoworkMessage } from '../src/cowork/store.js';

it('preserves identity through HTTP send replay, edits, retries, references and deletion', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'cowork-http-identity-'));
  const oldHome = process.env['AGENT_GITU_HOME'];
  process.env['AGENT_GITU_HOME'] = home;
  let calls = 0;
  const reply = () => { calls++; return 'The migration is ready.'; };
  const server = new GituServer({ cwd: path.join(home, 'Workspace'), port: 0, llm: new ScriptedMockLlm(Array.from({ length: 12 }, () => reply)) });
  try {
    const base = `http://127.0.0.1:${await server.start()}`;
    async function request(route: string, method = 'GET', body?: unknown) {
      const response = await fetch(base + route, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      return { status: response.status, data: await response.json() };
    }
    const agent = (await request('/api/cowork/agents', 'POST', { name: 'Gitu', systemPrompt: 'Help with the migration.' })).data.agent;
    const conv = (await request('/api/cowork/conversations', 'POST', { kind: 'dm', memberIds: [agent.id] })).data.conversation;
    const route = `/api/cowork/conversations/${conv.id}/messages`;
    async function idle() {
      for (let i = 0; i < 150; i++) {
        const view = (await request(route)).data;
        if (!view.busy) return view as { messages: CoworkMessage[]; messageChangeSeq: number };
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error('Conversation did not become idle');
    }
    const payload = { id: 'client-first', text: 'Prepare migration' };
    const sent = await request(route, 'POST', payload);
    expect(sent.status).toBe(202);
    expect(sent.data.message.id).toBe(payload.id);
    await idle();
    const replay = await request(route, 'POST', payload);
    expect(replay.data.message.id).toBe(payload.id);
    expect(calls).toBe(1);
    let view = await idle();
    expect(view.messages.filter((m) => m.role === 'user')).toHaveLength(1);
    const cursor = view.messageChangeSeq;
    const after = view.messages.at(-1)!.seq;
    for (let revision = 0; revision < 2; revision++) {
      const edit = await request(route + '/client-first', 'PATCH', { text: `Edited ${revision + 1}`, revision });
      expect(edit.data.message).toMatchObject({ id: payload.id, revision: revision + 1, attempt: 0 });
    }
    expect(calls).toBe(1); // Editing changes content, not delivery.
    expect((await request(route + '/client-first', 'PATCH', { text: 'stale', revision: 0 })).status).toBe(409);
    for (let attempt = 0; attempt < 2; attempt++) {
      const retry = await request(route + '/client-first/retry', 'POST', { attempt });
      expect(retry.data.message).toMatchObject({ id: payload.id, revision: 2, attempt: attempt + 1 });
      await idle();
      const again = await request(route + '/client-first/retry', 'POST', { attempt });
      expect(again.data.message.attempt).toBe(attempt + 1);
    }
    expect(calls).toBe(3);
    view = await idle();
    expect(view.messages.filter((m) => m.role === 'user')).toHaveLength(1);
    const changes = (await request(route + `?after=${after}&change=${cursor}`)).data;
    expect(changes.messageUpdates.find((m: CoworkMessage) => m.id === payload.id).revision).toBe(2);
    const old = view.messages.find((m) => m.role === 'agent')!;
    const referenced = await request(route, 'POST', { id: 'client-reference', text: '@Gitu verify this', referencedMessageIds: [old.id] });
    expect(referenced.data.message).toMatchObject({ referencedMessageIds: [old.id], mentionedAgentIds: [agent.id] });
    await idle();
    const retryReference = await request(route + '/client-reference/retry', 'POST', { attempt: 0 });
    expect(retryReference.data.message.referencedMessageIds).toEqual([old.id]);
    await idle();
    expect((await request(route + '/client-first', 'DELETE')).status).toBe(200);
    expect((await request(route, 'POST', payload)).status).toBe(409);
    view = await idle();
    expect(view.messages.some((m) => m.id === payload.id)).toBe(false);
  } finally {
    await server.stop();
    if (oldHome === undefined) delete process.env['AGENT_GITU_HOME']; else process.env['AGENT_GITU_HOME'] = oldHome;
    rmSync(home, { recursive: true, force: true });
  }
}, 25000);
