import { isRetryableNetworkError } from './llm.js';
import type { LlmClient, LlmDeltaHandler, LlmMessage, LlmOptions, LlmUsage } from './llm.js';

/**
 * Outer resilience layer on top of ANY LlmClient. The transport already
 * retries single HTTP requests; this wrapper covers what that cannot:
 * repeated failures across attempts, provider outages, mid-run disconnects —
 * with DYNAMIC backoff (doubling + jitter, capped) so a flaky network or a
 * temporarily down service delays work instead of killing it.
 *
 * Selective by design — only TRANSIENT-shaped failures are retried:
 * network/timeout errors, rate limits (429), server errors (5xx). Genuine
 * application errors (TypeError, simulated crashes, malformed setup) and
 * fatal auth/bad-request failures propagate immediately without burning time.
 */

const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_BASE_DELAY_MS = 2_000;
const DEFAULT_MAX_DELAY_MS = 45_000;

export interface ResilienceOptions {
  /** Human-readable tag used in onRetry info (provider/model label). */
  label?: string;
  /** Outer retry budget after the client's own transport retries. Default 4. */
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (info: { attempt: number; maxRetries: number; delayMs: number; error: Error; label: string }) => void;
}

/** Errors that will NEVER succeed by waiting. */
function isFatalLlmError(err: Error): boolean {
  return (
    /abort/i.test(err.message) ||
    /\b(401|403)\b/.test(err.message) ||
    /invalid[ _-]api[ _-]?key|unauthorized|forbidden|bad request|\b400\b/i.test(err.message)
  );
}

/** Transient-shaped failures: worth another attempt after a delay. */
export function isTransientLlmError(err: Error): boolean {
  if (isRetryableNetworkError(err)) return true;
  return (
    /\b(429|500|502|503|504)\b/.test(err.message) ||
    /rate[- ]limit|overloaded|service unavailable|bad gateway|internal server error/i.test(err.message)
  );
}

export function computeResilientDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const raw = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
  return Math.max(250, Math.round(raw * (0.75 + Math.random() * 0.5)));
}

export function resilientLlm(client: LlmClient, opts: ResilienceOptions = {}): LlmClient {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const base = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const cap = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const doSleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const label = opts.label ?? client.name;

  async function guard<T>(signal: AbortSignal | undefined, fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (signal?.aborted) throw new Error('LLM request aborted');
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        if (attempt === maxRetries || isFatalLlmError(lastError) || !isTransientLlmError(lastError)) throw lastError;
        const delayMs = computeResilientDelay(attempt, base, cap);
        opts.onRetry?.({ attempt: attempt + 1, maxRetries, delayMs, error: lastError, label });
        if (signal?.aborted) throw new Error('LLM request aborted');
        await doSleep(delayMs);
      }
    }
    throw lastError!;
  }

  return {
    get name() {
      return `resilient(${client.name})`;
    },
    get lastReasoning() {
      return client.lastReasoning;
    },
    set lastReasoning(v: string | undefined) {
      client.lastReasoning = v;
    },
    complete(messages: LlmMessage[], o?: LlmOptions): Promise<string> {
      return guard(o?.signal, () => client.complete(messages, o));
    },
    async completeStream(messages: LlmMessage[], o: LlmOptions, onDelta: LlmDeltaHandler): Promise<string> {
      // A stream that dies MID-flight must not leave partial deltas counted as
      // a delivered answer: reset handled by caller via onStreamReset contract
      // (the underlying client invokes it before falling back).
      return guard(o.signal, () => client.completeStream(messages, o, onDelta));
    },
  } as LlmClient;
}
