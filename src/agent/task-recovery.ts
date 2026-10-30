import { LlmError, type LlmClient, type LlmOptions } from '../llm/llm.js';
import { isTransientLlmError } from '../llm/resilient.js';
import { setTimeout as sleep } from 'node:timers/promises';

/** Count repeated claims against the same unchanged verification state. */
export class VerificationAttempts {
  private readonly episodes = new Map<string, { signature: string; attempts: number }>();

  reject(gate: string, signature: string): number {
    const previous = this.episodes.get(gate);
    const attempts = previous?.signature === signature ? previous.attempts + 1 : 1;
    this.episodes.set(gate, { signature, attempts });
    return attempts;
  }

  resolve(gate: string): void {
    this.episodes.delete(gate);
  }
}

/** A transport outage pauses work; bad credentials, quota and policy errors do not. */
export function providerRecoveryDelay(error: unknown, attempt: number, baseMs = 15_000): number | undefined {
  if (!(error instanceof Error) || !isTransientLlmError(error)) return undefined;
  const backoff = Math.min(300_000, Math.max(1, baseMs) * 2 ** Math.min(Math.max(0, attempt - 1), 10));
  const retryAfter = error instanceof LlmError ? error.details.retryAfterMs : undefined;
  return Math.max(backoff, retryAfter ?? 0);
}

/** Initial native turn plus at most two further attempts — the same budget a
 *  single model request gets (`DEFAULT_MAX_RETRIES` in `../llm/resilient.ts`). */
const NATIVE_TURN_ATTEMPTS = 3;

/**
 * Run one provider-owned turn, retrying ONLY while nothing has executed yet.
 *
 * A native turn is not a request: by the time it fails it may already have run
 * tools, and re-entering it starts a fresh provider session whose tool-call ids
 * differ. Gitu's "this call was already handled" dedupe is keyed on the
 * provider's own turn+call id, so it cannot recognise that replay and the same
 * write or command would run a second time. Before the first admitted call the
 * turn is side-effect-free, so a transient outage there is safe to re-enter;
 * afterwards the failure propagates with the partial work saved, exactly as it
 * did before.
 */
export async function runNativeTurnWithRecovery<T>(input: {
  turn: () => Promise<T>;
  /** Whether this turn has admitted a tool call. The caller sets it the moment
   *  one arrives; it is never reset, because an attempt that acted has already
   *  crossed the boundary the retry depends on. */
  hasActed: () => boolean;
  signal: AbortSignal;
  onRetry?: (info: { attempt: number; maxAttempts: number; delayMs: number; error: Error }) => void;
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}): Promise<T> {
  const maxAttempts = Math.max(1, input.maxAttempts ?? NATIVE_TURN_ATTEMPTS);
  for (let attempt = 1; ; attempt++) {
    input.signal.throwIfAborted();
    try {
      return await input.turn();
    } catch (error) {
      // Cancellation wins over recovery: Stop must not wait out a backoff.
      input.signal.throwIfAborted();
      const delayMs = providerRecoveryDelay(error, attempt, input.baseDelayMs);
      if (delayMs === undefined || input.hasActed() || attempt >= maxAttempts) throw error;
      input.onRetry?.({ attempt: attempt + 1, maxAttempts, delayMs, error: error as Error });
      await (input.sleep ? input.sleep(delayMs, input.signal) : sleep(delayMs, undefined, { signal: input.signal }));
    }
  }
}

/** Both engines require established completion or a genuine dependency. */
export function completionDisposition(verified: boolean, waiting = false): 'done' | 'waiting' | 'working' {
  return waiting ? 'waiting' : verified ? 'done' : 'working';
}

/** Keep the same logical request and saved tool results through an outage. */
export function recoveringLlm(client: LlmClient, recovery: {
  onWait?: (delayMs: number, attempt: number) => void;
  baseDelayMs?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
} = {}): LlmClient {
  const run = async <T>(request: () => Promise<T>, opts?: LlmOptions): Promise<T> => {
    for (let attempt = 1; ; attempt++) {
      opts?.signal?.throwIfAborted();
      try { return await request(); } catch (error) {
        opts?.signal?.throwIfAborted();
        const delay = providerRecoveryDelay(error, attempt, recovery.baseDelayMs);
        if (delay === undefined) throw error;
        opts?.onStreamReset?.();
        recovery.onWait?.(delay, attempt);
        await (recovery.sleep ? recovery.sleep(delay, opts?.signal) : sleep(delay, undefined, { signal: opts?.signal }));
      }
    }
  };
  return {
    get nativeTask() { return client.nativeTask; },
    name: client.name,
    rateLimitKey: client.rateLimitKey,
    get lastReasoning() { return client.lastReasoning; },
    complete: (messages, opts) => run(() => client.complete(messages, opts), opts),
    completeStream: (messages, opts, onDelta) => run(() => client.completeStream(messages, opts, onDelta), opts),
    ...(client.completeTurn ? { completeTurn: (messages, opts) => run(() => client.completeTurn!(messages, opts), opts) } as Pick<LlmClient, 'completeTurn'> : {}),
    ...(client.completeTurnStream ? { completeTurnStream: (messages, opts, onDelta) => run(() => client.completeTurnStream!(messages, opts, onDelta), opts) } as Pick<LlmClient, 'completeTurnStream'> : {}),
  };
}
