import { afterEach, describe, expect, it } from 'vitest';
import { OpenAiCompatClient } from '../src/llm/llm.js';

describe('OpenAiCompatClient retry behavior', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>): () => number {
    let calls = 0;
    globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
      calls++;
      return handler(String(input), init);
    }) as typeof fetch;
    return () => calls;
  }

  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  const client = () => new OpenAiCompatClient({ apiKey: 'sk-x', baseUrl: 'https://example.test/v1', model: 'm' });
  const msg = [{ role: 'user' as const, content: 'hi' }];

  it('retries a transient 429 and succeeds', async () => {
    const calls = mockFetch(async () => {
      if (calls() === 1) {
        return jsonResponse(
          { error: { type: 'FreeUsageLimitError', message: 'Rate limit exceeded. Please try again later.' } },
          429,
        );
      }
      return jsonResponse({ choices: [{ message: { content: 'ok' } }] });
    });
    const out = await client().complete(msg, { retries: 1, retryDelayMs: 1 });
    expect(out).toBe('ok');
    expect(calls()).toBe(2);
  });

  it('gives up after retries and surfaces a friendly rate-limit message', async () => {
    const calls = mockFetch(
      async () =>
        jsonResponse(
          { error: { type: 'FreeUsageLimitError', message: 'Rate limit exceeded. Please try again later.' } },
          429,
        ),
    );
    const err = await client().complete(msg, { retries: 2, retryDelayMs: 1 }).catch((e) => e as Error);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toContain('LLM rate limited (HTTP 429)');
    expect(err.message).toContain('try again later');
    expect(calls()).toBe(3); // initial + 2 retries
  });

  it('does not retry on 4xx client errors', async () => {
    const calls = mockFetch(async () => jsonResponse({ error: { message: 'bad model' } }, 400));
    await expect(client().complete(msg, { retries: 3, retryDelayMs: 1 })).rejects.toThrow(/LLM HTTP 400/);
    expect(calls()).toBe(1);
  });

  it('retries transient 503 in streaming mode', async () => {
    const calls = mockFetch(async () => {
      if (calls() === 1) return jsonResponse({ error: { message: 'upstream down' } }, 503);
      const body =
        'data: ' + JSON.stringify({ choices: [{ delta: { content: 'hi' } }] }) + '\n\ndata: [DONE]\n\n';
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    });
    const out = await client().completeStream(msg, { retries: 1, retryDelayMs: 1 }, () => {});
    expect(out).toBe('hi');
    expect(calls()).toBe(2);
  });

  it('retries by default (no opts) on transient errors', async () => {
    const calls = mockFetch(async () => {
      if (calls() === 1) return jsonResponse({ error: { message: 'busy' } }, 429);
      return jsonResponse({ choices: [{ message: { content: 'recovered' } }] });
    });
    const out = await client().complete(msg);
    expect(out).toBe('recovered');
    expect(calls()).toBe(2);
  });

  it('surfaces a clear message when the account has no credits', async () => {
    const calls = mockFetch(
      async () =>
        jsonResponse(
          { error: { type: 'CreditsError', message: 'Insufficient balance. Manage your billing here: https://opencode.ai' } },
          401,
        ),
    );
    const err = await client().complete(msg, { retries: 0 }).catch((e) => e as Error);
    expect(err.message).toContain('no credits');
    expect(err.message).toContain('paid model');
    expect(calls()).toBe(1);
  });

  it('surfaces a clear message when the plan cannot access the model', async () => {
    const calls = mockFetch(
      async () =>
        jsonResponse(
          { error: { type: 'AccessError', message: 'Access to model denied. Please make sure you are eligible for using the model.' } },
          403,
        ),
    );
    const err = await client().complete(msg, { retries: 0 }).catch((e) => e as Error);
    expect(err.message).toContain('model not available to you');
    expect(err.message).toContain('free');
    expect(calls()).toBe(1);
  });

  it('surfaces a clear message when the upstream endpoint is unavailable', async () => {
    const calls = mockFetch(
      async () =>
        jsonResponse(
          { error: { type: 'server_error', message: 'Upstream request failed: Endpoint is unavailable.' } },
          503,
        ),
    );
    const err = await client().complete(msg, { retries: 0 }).catch((e) => e as Error);
    expect(err.message).toContain('upstream unavailable');
    expect(err.message).toContain('try again later');
    expect(calls()).toBe(1);
  });
});
