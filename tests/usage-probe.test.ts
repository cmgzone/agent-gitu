import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HermesServer } from '../src/server/server.js';
import type { LlmClient, LlmMessage, LlmOptions } from '../src/llm/llm.js';

function usageLlm(): LlmClient {
  return {
    name: 'usage-mock',
    async complete(_m: LlmMessage[], opts: LlmOptions = {}): Promise<string> {
      opts.onUsage?.({ inputTokens: 100, outputTokens: 10, cachedTokens: 20 });
      return 'reply';
    },
    async completeStream(m: LlmMessage[], opts: LlmOptions = {}, onDelta: (d: string) => void): Promise<string> {
      opts.onUsage?.({ inputTokens: 100, outputTokens: 10, cachedTokens: 20 });
      onDelta('reply');
      return 'reply';
    },
  };
}

async function waitFor<T>(fn: () => Promise<T | undefined>, timeoutMs = 15000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v !== undefined) return v;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 150));
  }
}

describe('usage across continuations', () => {
  it('keeps accumulating tokens and messages when the same session is continued', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hermes-usage-cont-'));
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'probe', scripts: { test: 'node --version' } }));
    const server = new HermesServer({ cwd: dir, port: 0, llm: usageLlm() });
    const port = await server.start();
    const base = `http://127.0.0.1:${port}`;

    const created = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'first', mode: 'chat', review: false }),
    }).then((r) => r.json());
    const first = await waitFor(async () => {
      const s = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return s.status !== 'running' ? s : undefined;
    });
    expect(first.usage.messages).toBeGreaterThanOrEqual(1);

    await fetch(`${base}/api/runs/${created.runId}/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'continue please', mode: 'chat' }),
    });
    const after = await waitFor(async () => {
      const s = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return s.status !== 'running' && (s.usage?.messages ?? 0) > first.usage.messages ? s : undefined;
    });

    expect(after.usage.messages).toBeGreaterThan(first.usage.messages);
    expect(after.usage.inputTokens).toBe(after.usage.messages * 100);
    expect(after.usage.cachedTokens).toBe(after.usage.messages * 20);
    await server.stop();
  }, 30000);
});
