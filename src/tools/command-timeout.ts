/** Zero disables the deadline; explicit long deadlines must never be truncated. */
export function commandTimeout(value: unknown): number {
  if (value === undefined) return 0;
  const ms = Number(value);
  if (!Number.isSafeInteger(ms) || ms < 0) throw new Error('timeoutMs must be a nonnegative integer; 0 means no deadline.');
  return ms;
}

/**
 * How long a foreground command call waits before answering with a RUNNING
 * status. The turn is never blocked past this window: a process that outlives it
 * stays managed and pollable by job id. `0` means "wait for the terminal state"
 * — the pre-status behaviour, now only ever an explicit choice.
 */
export const DEFAULT_COMMAND_WAIT_MS = 60_000;

export function commandWaitMs(value: unknown): number {
  if (value === undefined) return DEFAULT_COMMAND_WAIT_MS;
  const ms = Number(value);
  if (!Number.isSafeInteger(ms) || ms < 0) throw new Error('waitMs must be a nonnegative integer; 0 waits for the terminal state.');
  return ms;
}

/**
 * How long a status poll blocks for a still-running command before answering
 * RUNNING again. Polling stays productive (the common case resolves in one call)
 * without letting the loop spin on a process that has not moved.
 */
export const DEFAULT_POLL_WAIT_MS = 10_000;

export function pollWaitMs(value: unknown): number {
  if (value === undefined) return DEFAULT_POLL_WAIT_MS;
  const ms = Number(value);
  if (!Number.isSafeInteger(ms) || ms < 0) throw new Error('waitMs must be a nonnegative integer; 0 answers immediately.');
  return ms;
}

/** Node timers overflow at 2^31 ms. Chain long deadlines instead of firing early. */
export function deadline(ms: number, expire: () => void): () => void {
  if (!ms) return () => {};
  let remaining = ms;
  let timer: ReturnType<typeof setTimeout>;
  const next = () => {
    const slice = Math.min(remaining, 2_147_483_647);
    timer = setTimeout(() => {
      remaining -= slice;
      if (remaining > 0) next();
      else expire();
    }, slice);
  };
  next();
  return () => clearTimeout(timer);
}
