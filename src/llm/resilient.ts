import { isRetryableNetworkError, LlmError, requestLlmTurn } from './llm.js';
import type { LlmClient, LlmDeltaHandler, LlmMessage, LlmOptions, LlmTurnResult, LlmUsage } from './llm.js';

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

/** Initial request + at most two further HTTP attempts per logical request. */
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 2_000;
const DEFAULT_MAX_DELAY_MS = 45_000;

export interface ResilienceOptions {
  /** Human-readable tag used in onRetry info (provider/model label). */
  label?: string;
  /** Retry budget after the initial request. Defaults to 2 (three total attempts). */
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Injectable retry delay. Receives the caller signal so cancellation can
   * interrupt backoff instead of making Stop wait for a 45-second timer. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  /** Shared provider+credential limit-group key. Never put a raw secret here. */
  circuitKey?: string;
  onRetry?: (info: { attempt: number; maxRetries: number; delayMs: number; error: Error; label: string; logicalRequestId?: string }) => void;
}

interface CooldownState {
  openUntil: number;
  halfOpenProbe: boolean;
}

const cooldowns = new Map<string, CooldownState>();

/** Test/diagnostic-only snapshot; keys deliberately never expose credentials. */
export function cooldownSnapshot(circuitKey: string): Readonly<CooldownState> | undefined {
  const state = cooldowns.get(circuitKey);
  return state ? { ...state } : undefined;
}

export function clearCooldownsForTest(): void {
  cooldowns.clear();
}

/** Errors that will NEVER succeed by waiting. */
function isFatalLlmError(err: Error): boolean {
  if (err instanceof LlmError) {
    return ['auth', 'access', 'billing', 'quota_exhausted', 'tool_protocol_incompatible', 'aborted'].includes(err.details.kind);
  }
  return (
    /abort/i.test(err.message) ||
    /\b(401|403)\b/.test(err.message) ||
    /invalid[ _-]api[ _-]?key|unauthorized|forbidden|bad request|\b400\b/i.test(err.message)
  );
}

/** Transient-shaped failures: worth another attempt after a delay. */
export function isTransientLlmError(err: Error): boolean {
  if (err instanceof LlmError) return ['network', 'rate_limit_temporary', 'provider_unavailable'].includes(err.details.kind);
  if (isRetryableNetworkError(err)) return true;
  return (
    /\b(429|500|502|503|504)\b/.test(err.message) ||
    /rate[- ]limit|overloaded|service unavailable|bad gateway|internal server error/i.test(err.message)
  );
}

function retryAfterFor(err: Error): number | undefined {
  return err instanceof LlmError ? err.details.retryAfterMs : undefined;
}

function cooldownFor(err: Error, fallbackDelay: number): number {
  return retryAfterFor(err) ?? fallbackDelay;
}

export function computeResilientDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
  const raw = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
  return Math.max(250, Math.round(raw * (0.75 + Math.random() * 0.5)));
}

export function resilientLlm(client: LlmClient, opts: ResilienceOptions = {}): LlmClient {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const base = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const cap = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const doSleep = opts.sleep ?? ((ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('LLM request aborted'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new Error('LLM request aborted'));
      },
      { once: true },
    );
  }));
  const label = opts.label ?? client.name;

  const circuitKey = opts.circuitKey ?? client.rateLimitKey ?? `client:${client.name}`;

  async function waitForCircuit(signal: AbortSignal | undefined): Promise<void> {
    for (;;) {
      const state = cooldowns.get(circuitKey);
      if (!state) return;
      const now = Date.now();
      if (state.openUntil > now) {
        await doSleep(state.openUntil - now, signal);
        continue;
      }
      if (!state.halfOpenProbe) {
        state.halfOpenProbe = true;
        return;
      }
      // One request probes recovery. Other callers wait briefly, rather than
      // stampeding the same credential as soon as a cooldown opens.
      await doSleep(50, signal);
    }
  }

  function markSuccess(): void {
    const state = cooldowns.get(circuitKey);
    if (state) cooldowns.delete(circuitKey);
  }

  function markTransientFailure(err: Error, delayMs: number): void {
    if (!(err instanceof LlmError) || err.details.kind !== 'rate_limit_temporary') return;
    const current = cooldowns.get(circuitKey);
    cooldowns.set(circuitKey, {
      openUntil: Math.max(current?.openUntil ?? 0, Date.now() + cooldownFor(err, delayMs)),
      halfOpenProbe: false,
    });
  }

  async function guard<T>(
    signal: AbortSignal | undefined,
    logicalRequestId: string | undefined,
    callMaxRetries: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= callMaxRetries; attempt++) {
      if (signal?.aborted) throw new Error('LLM request aborted');
      await waitForCircuit(signal);
      try {
        const result = await fn();
        markSuccess();
        return result;
      } catch (err) {
        lastError = err as Error;
        const retryAfter = retryAfterFor(lastError);
        const delayMs = retryAfter === undefined
          ? computeResilientDelay(attempt, base, cap)
          : Math.max(retryAfter, computeResilientDelay(attempt, base, cap));
        markTransientFailure(lastError, delayMs);
        if (attempt === callMaxRetries || isFatalLlmError(lastError) || !isTransientLlmError(lastError)) throw lastError;
        opts.onRetry?.({ attempt: attempt + 1, maxRetries: callMaxRetries, delayMs, error: lastError, label, logicalRequestId });
        if (signal?.aborted) throw new Error('LLM request aborted');
        await doSleep(delayMs, signal);
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
      const callMaxRetries = Math.min(maxRetries, Math.max(0, (o?.maxTransportAttempts ?? maxRetries + 1) - 1));
      return guard(o?.signal, o?.logicalRequestId, callMaxRetries, () => client.complete(messages, { ...o, retries: 0 }));
    },
    async completeStream(messages: LlmMessage[], o: LlmOptions, onDelta: LlmDeltaHandler): Promise<string> {
      // Streaming cannot reuse `guard`: a failed attempt may already have
      // pushed partial deltas to the caller, and a plain re-call would stream
      // the SAME prose again on top of it (duplicated narration rows in the
      // UI). Signal onStreamReset before every retry so the caller discards
      // streamed state first.
      let lastError: Error | undefined;
      const callMaxRetries = Math.min(maxRetries, Math.max(0, (o.maxTransportAttempts ?? maxRetries + 1) - 1));
      for (let attempt = 0; attempt <= callMaxRetries; attempt++) {
        if (o.signal?.aborted) throw new Error('LLM request aborted');
        try {
          await waitForCircuit(o.signal);
          const out = await client.completeStream(messages, { ...o, retries: 0 }, onDelta);
          markSuccess();
          return out;
        } catch (err) {
          lastError = err as Error;
          const retryAfter = retryAfterFor(lastError);
          const delayMs = retryAfter === undefined
            ? computeResilientDelay(attempt, base, cap)
            : Math.max(retryAfter, computeResilientDelay(attempt, base, cap));
          markTransientFailure(lastError, delayMs);
          if (attempt === callMaxRetries || isFatalLlmError(lastError) || !isTransientLlmError(lastError)) throw lastError;
          o.onStreamReset?.();
          opts.onRetry?.({ attempt: attempt + 1, maxRetries: callMaxRetries, delayMs, error: lastError, label, logicalRequestId: o.logicalRequestId });
          if (o.signal?.aborted) throw new Error('LLM request aborted');
          await doSleep(delayMs, o.signal);
        }
      }
      throw lastError!;
    },
    completeTurn(messages: LlmMessage[], o?: LlmOptions): Promise<LlmTurnResult> {
      const callMaxRetries = Math.min(maxRetries, Math.max(0, (o?.maxTransportAttempts ?? maxRetries + 1) - 1));
      return guard(o?.signal, o?.logicalRequestId, callMaxRetries, () => {
        if (client.completeTurn) return client.completeTurn(messages, { ...o, retries: 0 });
        return requestLlmTurn(client, messages, { ...o, retries: 0 });
      });
    },
    completeTurnStream(messages: LlmMessage[], o: LlmOptions, onDelta: LlmDeltaHandler): Promise<LlmTurnResult> {
      const callMaxRetries = Math.min(maxRetries, Math.max(0, (o.maxTransportAttempts ?? maxRetries + 1) - 1));
      return guard(o.signal, o.logicalRequestId, callMaxRetries, () => {
        if (client.completeTurnStream) return client.completeTurnStream(messages, { ...o, retries: 0 }, onDelta);
        return requestLlmTurn(client, messages, { ...o, retries: 0 }, onDelta);
      });
    },
  } as LlmClient;
}
