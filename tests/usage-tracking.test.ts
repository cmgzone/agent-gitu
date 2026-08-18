import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HermesServer } from '../src/server/server.js';
import { OpenAiCompatClient, UsageTrackingClient, type LlmClient, LlmMessage, LlmOptions } from '../src/llm/llm.js';
import { usageCostUsd } from '../src/llm/providers.js';

describe('usage reporting in OpenAiCompatClient', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const msg = [{ role: 'user' as const, content: 'hi' }];

  it('reports usage from a non-streaming response', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'ok' } }],
          usage: { prompt_tokens: 100, completion_tokens: 20, prompt_tokens_details: { cached_tokens: 40 } },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as typeof fetch;
    const seen: unknown[] = [];
    const client = new OpenAiCompatClient({ apiKey: 'sk-x', baseUrl: 'https://example.test/v1', model: 'm' });
    await client.complete(msg, { onUsage: (u) => seen.push(u) });
    expect(seen).toEqual([{ inputTokens: 100, outputTokens: 20, cachedTokens: 40 }]);
  });

  it('reports usage from the final streaming chunk', async () => {
    const body =
      'data: ' + JSON.stringify({ choices: [{ delta: { content: 'hi' } }] }) + '\n\n' +
      'data: ' + JSON.stringify({ choices: [], usage: { prompt_tokens: 55, completion_tokens: 9, cached_tokens: 5 } }) + '\n\n' +
      'data: [DONE]\n\n';
    globalThis.fetch = (async (_input, init) => {
      const parsed = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(parsed['stream_options']).toEqual({ include_usage: true });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }) as typeof fetch;
    const seen: unknown[] = [];
    const client = new OpenAiCompatClient({ apiKey: 'sk-x', baseUrl: 'https://example.test/v1', model: 'm' });
    await client.completeStream(msg, { onUsage: (u) => seen.push(u) }, () => {});
    expect(seen).toEqual([{ inputTokens: 55, outputTokens: 9, cachedTokens: 5 }]);
  });

  it('UsageTrackingClient counts messages even when the provider reports no usage', async () => {
    const inner: LlmClient = {
      name: 'silent',
      async complete(): Promise<string> {
        return 'done';
      },
      async completeStream(_m: LlmMessage[], _o: LlmOptions, onDelta: (d: string) => void): Promise<string> {
        onDelta('done');
        return 'done';
      },
    };
    const calls: (unknown | undefined)[] = [];
    const tracked = new UsageTrackingClient(inner, (u) => calls.push(u));
    await tracked.complete(msg);
    await tracked.completeStream(msg, {}, () => {});
    expect(calls).toEqual([undefined, undefined]);
  });
});

describe('usageCostUsd', () => {
  it('prices cached input at the cache rate and the rest at list price', () => {
    const cost = usageCostUsd(
      { inputPricePerMillion: 2, outputPricePerMillion: 6, cachedInputPricePerMillion: 0.5, source: 'models.dev' },
      { inputTokens: 1_000_000, outputTokens: 1_000_000, cachedTokens: 250_000 },
    );
    expect(cost).toBeCloseTo(0.75 * 2 + 0.25 * 0.5 + 6, 6);
  });

  it('returns undefined without prices', () => {
    expect(usageCostUsd(undefined, { inputTokens: 10, outputTokens: 10, cachedTokens: 0 })).toBeUndefined();
  });
});

describe('session usage over HTTP', () => {
  function makeProject(name: string): string {
    const dir = mkdtempSync(path.join(tmpdir(), `hermes-usage-${name}-`));
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `usage-${name}`, scripts: { test: 'node --version' } }, null, 2));
    return dir;
  }

  async function waitFor<T>(fn: () => Promise<T | undefined>, timeoutMs = 20000): Promise<T> {
    const start = Date.now();
    for (;;) {
      const value = await fn();
      if (value !== undefined) return value;
      if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  function usageReportingLlm(): LlmClient {
    const script = [
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['verification command passes'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify', verification: 'node --version' }] } }),
      () => JSON.stringify({ action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' } }),
      (_n: number, messages: LlmMessage[]) => {
        const text = messages.map((m) => m.content).join('\n');
        const evId = (text.match(/(ev-\d{8}-[0-9a-f]{6})/) ?? [])[1] ?? 'ev-x';
        return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: evId } });
      },
      () => JSON.stringify({ action: { type: 'complete', summary: 'verified', risks: [], followUps: [] } }),
    ];
    let call = 0;
    return {
      name: 'usage-mock',
      async complete(messages: LlmMessage[], opts: LlmOptions = {}): Promise<string> {
        const reply = script[Math.min(call++, script.length - 1)]!(call - 1, messages);
        opts.onUsage?.({ inputTokens: 100, outputTokens: 10, cachedTokens: 20 });
        return reply;
      },
      async completeStream(messages: LlmMessage[], opts: LlmOptions = {}, onDelta: (d: string) => void): Promise<string> {
        const reply = await this.complete(messages, opts);
        onDelta(reply);
        return reply;
      },
    };
  }

  it('accumulates tokens and messages per session and keeps them after restart', async () => {
    const dir = makeProject('lifecycle');
    const first = new HermesServer({ cwd: dir, port: 0, llm: usageReportingLlm() });
    const firstPort = await first.start();
    const base = `http://127.0.0.1:${firstPort}`;

    const created = await fetch(`${base}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: 'Verify node works', mode: 'fast', review: false }),
    }).then((r) => r.json());

    const session = await waitFor(async () => {
      const s = await fetch(`${base}/api/runs/${created.runId}`).then((r) => r.json());
      return s.status !== 'running' ? s : undefined;
    });
    expect(session.status).toBe('completed');
    const usage = session.usage as { inputTokens: number; outputTokens: number; cachedTokens: number; messages: number };
    expect(usage.messages).toBeGreaterThanOrEqual(5);
    expect(usage.inputTokens).toBe(usage.messages * 100);
    expect(usage.outputTokens).toBe(usage.messages * 10);
    expect(usage.cachedTokens).toBe(usage.messages * 20);
    await first.stop();

    const second = new HermesServer({ cwd: dir, port: 0, llm: usageReportingLlm() });
    const secondPort = await second.start();
    const restored = await fetch(`http://127.0.0.1:${secondPort}/api/runs/${created.runId}`).then((r) => r.json());
    expect(restored.usage).toMatchObject(usage);
    await second.stop();
  }, 30000);
});
