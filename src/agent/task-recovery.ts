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
    name: client.name,
    rateLimitKey: client.rateLimitKey,
    get lastReasoning() { return client.lastReasoning; },
    complete: (messages, opts) => run(() => client.complete(messages, opts), opts),
    completeStream: (messages, opts, onDelta) => run(() => client.completeStream(messages, opts, onDelta), opts),
    ...(client.completeTurn ? { completeTurn: (messages, opts) => run(() => client.completeTurn!(messages, opts), opts) } as Pick<LlmClient, 'completeTurn'> : {}),
    ...(client.completeTurnStream ? { completeTurnStream: (messages, opts, onDelta) => run(() => client.completeTurnStream!(messages, opts, onDelta), opts) } as Pick<LlmClient, 'completeTurnStream'> : {}),
  };
}
