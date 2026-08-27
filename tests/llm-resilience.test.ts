import { describe, expect, it } from 'vitest';
import { computeBackoffMs, isRetryableNetworkError } from '../src/llm/llm.js';
import { computeResilientDelay, isTransientLlmError, resilientLlm } from '../src/llm/resilient.js';
import type { LlmClient, LlmMessage } from '../src/llm/llm.js';

function msg(text: string): LlmMessage[] {
  return [{ role: 'user', content: text }];
}

describe('network error classification', () => {
  it('recognizes transient network failures', () => {
    const e = (m: string, code?: string) => Object.assign(new Error(m), { code }) as Error & { code?: string };
    expect(isRetryableNetworkError(e('fetch failed', 'ECONNRESET'))).toBe(true);
    expect(isRetryableNetworkError(e('socket hang up'))).toBe(true);
    expect(isRetryableNetworkError(e('request timed out'))).toBe(true);
    expect(isRetryableNetworkError(e('Connection refused', 'ECONNREFUSED'))).toBe(true);
    expect(isRetryableNetworkError(undefined)).toBe(false);
  });
});

describe('dynamic backoff computation', () => {
  it('grows exponentially and respects the cap', () => {
    for (let attempt = 0; attempt < 6; attempt++) {
      const ms = computeBackoffMs(attempt, 1000);
      const expected = Math.min(1000 * 2 ** attempt, 30000);
      expect(ms).toBeGreaterThanOrEqual(expected * 0.75 - 1);
      expect(ms).toBeLessThanOrEqual(expected * 1.25 + 1);
    }
    // Deep attempts pin at the cap.
    expect(computeBackoffMs(10, 1000)).toBeLessThanOrEqual(30000 * 1.25 + 1);
  });

  it('honors Retry-After up to 120s', () => {
    expect(computeBackoffMs(0, 1000, 90_000)).toBeGreaterThanOrEqual(90_000 * 0.75 - 1);
    expect(computeBackoffMs(0, 1000, 500_000)).toBeLessThanOrEqual(120_000 * 1.25 + 1);
  });

  it('never returns below a small floor', () => {
    expect(computeResilientDelay(0, 10, 100)).toBeGreaterThanOrEqual(250);
  });
});

describe('resilientLlm wrapper', () => {
  function flaky(failTimes: number, errFactory: () => Error, reply = 'ok'): { client: LlmClient; calls: () => number } {
    let calls = 0;
    const client: LlmClient = {
      name: 'flaky',
      async complete() {
        calls += 1;
        if (calls <= failTimes) throw errFactory();
        return reply;
      },
      async completeStream(messages: LlmMessage[], _o, onDelta) {
        return onDelta('x'), this.complete(messages);
      },
    };
    return { client, calls: () => calls };
  }

  const instantSleep = (delays: number[]) => async (ms: number) => {
    delays.push(ms);
  };

  it('retries transient failures with dynamic backoff and succeeds', async () => {
    const delays: number[] = [];
    const { client } = flaky(2, () => new Error('fetch failed'));
    const retries: number[] = [];
    const wrapped = resilientLlm(client, {
      maxRetries: 3,
      baseDelayMs: 100,
      sleep: instantSleep(delays),
      onRetry: (i) => retries.push(i.attempt),
    });
    const out = await wrapped.complete(msg('hi'));
    expect(out).toBe('ok');
    expect(delays.length).toBe(2);
    expect(retries).toEqual([1, 2]);
    expect(delays[1]!).toBeGreaterThanOrEqual(delays[0]!); // backoff grows
  });

  it('fails fast on fatal auth errors without retrying', async () => {
    const { client, calls } = flaky(5, () => new Error('401 invalid api key'));
    const wrapped = resilientLlm(client, { maxRetries: 4, baseDelayMs: 10, sleep: async () => {} });
    await expect(wrapped.complete(msg('hi'))).rejects.toThrow(/invalid api key/);
    expect(calls()).toBe(1);
  });

  it('fails fast on non-transient application errors (selective retry)', async () => {
    const { client, calls } = flaky(5, () => new TypeError('simulated specialist crash'));
    const wrapped = resilientLlm(client, { maxRetries: 4, baseDelayMs: 10, sleep: async () => {} });
    await expect(wrapped.complete(msg('hi'))).rejects.toThrow(/simulated specialist crash/);
    expect(calls()).toBe(1);
    // Sanity: the transient shapes ARE selected for retry.
    expect(isTransientLlmError(new Error('ETIMEDOUT'))).toBe(true);
    expect(isTransientLlmError(new Error('HTTP 503 service unavailable'))).toBe(true);
    expect(isTransientLlmError(new TypeError('cannot read properties'))).toBe(false);
  });

  it('gives up after exhausting the retry budget and throws the last error', async () => {
    const { client, calls } = flaky(99, () => Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }));
    const wrapped = resilientLlm(client, { maxRetries: 2, baseDelayMs: 10, sleep: async () => {} });
    await expect(wrapped.complete(msg('hi'))).rejects.toThrow(/connection reset/);
    expect(calls()).toBe(3); // initial + 2 retries
  });

  it('completeStream also benefits from the retry layer', async () => {
    let calls = 0;
    const deltas: string[] = [];
    const client: LlmClient = {
      name: 'streamy',
      async complete() {
        throw new Error('unused');
      },
      async completeStream(_messages: LlmMessage[], _o, onDelta) {
        calls += 1;
        if (calls === 1) throw new Error('ETIMEDOUT');
        onDelta('he');
        onDelta('llo');
        return 'hello';
      },
    };
    const wrapped = resilientLlm(client, { maxRetries: 2, baseDelayMs: 10, sleep: async () => {} });
    const out = await wrapped.completeStream(msg('x'), {}, (d) => deltas.push(d));
    expect(out).toBe('hello');
    expect(deltas.join('')).toBe('hello');
    expect(calls).toBe(2);
  });

  it('completeStream signals onStreamReset before EVERY retry so partial prose is not duplicated', async () => {
    // Regression: the outer retry loop re-called completeStream without
    // resetting the caller's streamed-prose state, so after a transient
    // failure mid-stream the retry re-emitted the SAME text — the UI showed
    // one duplicated narration row per retry attempt.
    let calls = 0;
    const resets: number[] = [];
    const deltasPerCall: string[] = [];
    let sent = 0;
    const client: LlmClient = {
      name: 'flaky-stream',
      async complete() {
        throw new Error('unused');
      },
      async completeStream(_messages: LlmMessage[], _o, onDelta) {
        calls += 1;
        sent = 0;
        // Stream a partial prose chunk, then fail on the first two attempts.
        onDelta('Let me search the repo. ');
        sent += 1;
        deltasPerCall.push(String(sent));
        if (calls <= 2) throw new Error('HTTP 429 rate limited');
        onDelta('Found nothing.');
        return 'Let me search the repo. Found nothing.';
      },
    };
    const wrapped = resilientLlm(client, {
      maxRetries: 3,
      baseDelayMs: 10,
      sleep: async () => {},
      onRetry: () => resets.push(calls),
    });
    const seenDeltas: string[] = [];
    const out = await wrapped.completeStream(msg('x'), { onStreamReset: () => resets.push(-1) }, (d) => seenDeltas.push(d));
    expect(out).toContain('Found nothing.');
    // One reset per failed attempt, each BEFORE its retry is announced:
    // sequence is [reset, retry1, reset, retry2].
    expect(resets).toEqual([-1, 1, -1, 2]);
  });
});
