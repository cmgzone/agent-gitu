import { describe, expect, it } from 'vitest';
import { VerificationAttempts, completionDisposition, providerRecoveryDelay, recoveringLlm } from '../src/agent/task-recovery.js';
import { LlmError, type LlmClient, type LlmOptions } from '../src/llm/llm.js';

describe('shared task recovery', () => {
  it('resets correction attempts after an actual repair or a resolved gate', () => {
    const attempts = new VerificationAttempts();
    expect(attempts.reject('checks', 'before')).toBe(1);
    expect(attempts.reject('checks', 'before')).toBe(2);
    expect(attempts.reject('checks', 'after repair')).toBe(1);
    expect(attempts.reject('checks', 'after repair')).toBe(2);
    expect(attempts.reject('checks', 'after repair')).toBe(3);
    attempts.resolve('checks');
    expect(attempts.reject('checks', 'after repair')).toBe(1);
  });

  it('keeps independent completion gates independent', () => {
    const attempts = new VerificationAttempts();
    attempts.reject('checks', 'missing');
    attempts.reject('visual', 'missing');
    expect(attempts.reject('checks', 'missing')).toBe(2);
    expect(attempts.reject('visual', 'missing')).toBe(2);
  });

  it.each(['network', 'provider_unavailable', 'rate_limit_temporary'] as const)('recovers %s with capped backoff', kind => {
    const error = new LlmError('temporary', { kind });
    expect(providerRecoveryDelay(error, 1)).toBe(15_000);
    expect(providerRecoveryDelay(error, 2)).toBe(30_000);
    expect(providerRecoveryDelay(error, 99)).toBe(300_000);
  });

  it.each(['auth', 'access', 'billing', 'quota_exhausted', 'aborted', 'protocol_error'] as const)('does not retry %s', kind => {
    expect(providerRecoveryDelay(new LlmError('fatal', { kind }), 1)).toBeUndefined();
  });

  it('respects Retry-After beyond its normal backoff cap', () => {
    expect(providerRecoveryDelay(new LlmError('rate limit', { kind: 'rate_limit_temporary', retryAfterMs: 600_000 }), 10)).toBe(600_000);
    expect(providerRecoveryDelay(new TypeError('invalid implementation'), 1)).toBeUndefined();
  });

  it('requires verified completion and distinguishes dependencies', () => {
    expect(completionDisposition(false)).toBe('working');
    expect(completionDisposition(true)).toBe('done');
    expect(completionDisposition(false, true)).toBe('waiting');
  });

  it('preserves the same request through more than eight transient failures', async () => {
    let calls = 0;
    const messages = [{ role: 'user' as const, content: 'Continue from the saved tool result' }];
    const delays: number[] = [];
    const client: LlmClient = {
      name: 'recovery',
      complete: async input => { expect(input).toBe(messages); if (++calls < 11) throw new LlmError('503', { kind: 'provider_unavailable' }); return 'done'; },
      completeStream: async () => '',
    };
    const result = await recoveringLlm(client, { sleep: async ms => { delays.push(ms); } }).complete(messages);
    expect(result).toBe('done');
    expect(calls).toBe(11);
    expect(delays).toHaveLength(10);
    expect(delays.at(-1)).toBe(300_000);
  });

  it('cancels an automatic provider retry immediately on Stop', async () => {
    const abort = new AbortController();
    const client: LlmClient = { name: 'cancel', complete: async () => { throw new LlmError('503', { kind: 'provider_unavailable' }); }, completeStream: async () => '' };
    const work = recoveringLlm(client, { onWait: () => abort.abort() }).complete([], { signal: abort.signal });
    await expect(work).rejects.toThrow();
  });

  it('discards partial stream text before replaying a request and retains the native API', async () => {
    let calls = 0;
    let text = '';
    const client: LlmClient = {
      name: 'stream',
      complete: async () => '',
      completeStream: async (_messages, _opts, delta) => { delta(++calls === 1 ? 'partial' : 'answer'); if (calls === 1) throw new LlmError('disconnect', { kind: 'network' }); return 'answer'; },
      completeTurn: async () => ({ kind: 'text', text: 'native answer', metadata: {} }),
    };
    const options: LlmOptions = { onStreamReset: () => { text = ''; } };
    const recovered = recoveringLlm(client, { sleep: async () => {} });
    await recovered.completeStream([], options, delta => { text += delta; });
    expect(text).toBe('answer');
    expect((await recovered.completeTurn!([])).kind).toBe('text');
  });
});
