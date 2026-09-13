/** Zero disables the deadline; explicit long deadlines must never be truncated. */
export function commandTimeout(value: unknown): number {
  if (value === undefined) return 0;
  const ms = Number(value);
  if (!Number.isSafeInteger(ms) || ms < 0) throw new Error('timeoutMs must be a nonnegative integer; 0 means no deadline.');
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
