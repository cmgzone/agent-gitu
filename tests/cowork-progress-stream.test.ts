import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';

it('combines text bursts, keeps compact updates scoped, and sends the final message immediately', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'gitu-progress-stream-'));
  vi.stubEnv('AGENT_GITU_HOME', home);
  const server = new GituServer({ cwd: home, port: 0, passwordRequired: false, llm: new ScriptedMockLlm([]) });
  const internal = server as any;
  const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
  const pumps: Promise<void>[] = [];
  try {
    const base = 'http://127.0.0.1:' + await server.start();
    const store = internal.cowork();
    const agent = store.saveAgent({ name: 'Stream fixture', systemPrompt: 'Answer.' });
    const conv = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    for (let i = 0; i < 12; i++) store.recordWork({ conversationId: conv.id, agentId: agent.id, tool: 'read_file', ok: true, publicUpdate: 'Checked the fixture. '.repeat(30), output: 'private output' });
    const run = { busy: true, queue: [], abort: new AbortController(), working: { agentId: agent.id, agentName: agent.name }, progress: { agentId: agent.id, agentName: agent.name, text: '' } };
    internal.coworkRuns.set(conv.id, run);
    async function subscribe(query: string) {
      const response = await fetch(base + '/api/cowork/conversations/' + conv.id + '/stream' + query, { signal: AbortSignal.timeout(15000) });
      expect(response.ok).toBe(true);
      const reader = response.body!.getReader(); readers.push(reader);
      const frames: any[] = [], decoder = new TextDecoder();
      pumps.push((async () => {
        let pending = '';
        for (;;) {
          const chunk = await reader.read(); if (chunk.done) break;
          pending += decoder.decode(chunk.value, { stream: true });
          let end;
          while ((end = pending.indexOf('\n\n')) >= 0) {
            const frame = pending.slice(0, end); pending = pending.slice(end + 2);
            if (frame.startsWith('data: ')) frames.push(JSON.parse(frame.slice(6)));
          }
        }
      })());
      await expect.poll(() => frames.length).toBe(1);
      return frames;
    }
    const compact = await subscribe('?compact=1'), legacy = await subscribe(''), otherThread = await subscribe('?compact=1&thread=other');
    for (let i = 0; i < 100; i++) {
      run.progress = { agentId: agent.id, agentName: agent.name, text: 'Answer ' + i };
      internal.publishCowork(conv.id, true);
    }
    await expect.poll(() => compact.at(-1)?.progress?.text).toBe('Answer 99');
    await expect.poll(() => legacy.at(-1)?.progress?.text).toBe('Answer 99');
    const partial = compact.at(-1);
    expect(partial.progressOnly).toBe(true);
    expect(partial).not.toHaveProperty('messages');
    expect(partial).not.toHaveProperty('workHistory');
    expect(JSON.stringify(partial).length).toBeLessThan(JSON.stringify(legacy.at(-1)).length / 10);
    expect(legacy.at(-1)).not.toHaveProperty('progressOnly');
    expect(compact.length).toBeLessThan(6);
    expect(otherThread.at(-1).busy).toBe(false);
    expect(otherThread.at(-1).progress).toBeNull();
    // A pending partial must not reappear after the authoritative final frame.
    run.progress.text = 'Old partial'; internal.publishCowork(conv.id, true);
    run.busy = false;
    store.appendMessage(conv.id, { role: 'agent', agentId: agent.id, agentName: agent.name, text: 'Final answer.' });
    internal.publishCowork(conv.id);
    await expect.poll(() => compact.some((f: any) => f?.messages?.some((m: any) => m.text === 'Final answer.'))).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 80));
    expect(compact.at(-1).busy).toBe(false);
    expect(compact.at(-1)).not.toHaveProperty('progressOnly');
  } finally {
    await Promise.allSettled(readers.map(reader => reader.cancel()));
    await Promise.allSettled(pumps);
    await server.stop();
    vi.unstubAllEnvs();
    rmSync(home, { recursive: true, force: true });
  }
}, 30000);
