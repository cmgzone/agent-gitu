/** Hold the shared desktop browser until a teammate finishes its tool loop. */
export class CoworkBrowserLease {
  private tail: Promise<void> = Promise.resolve();

  async acquire(signal?: AbortSignal): Promise<() => void> {
    signal?.throwIfAborted();
    const previous = this.tail;
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    this.tail = previous.then(() => held);
    let abort!: () => void;
    try {
      await Promise.race([
        previous,
        new Promise<never>((_resolve, reject) => {
          abort = () => reject(signal?.reason ?? new Error('Browser wait cancelled'));
          signal?.addEventListener('abort', abort, { once: true });
        }),
      ]);
      signal?.throwIfAborted();
      return release;
    } catch (error) {
      release();
      throw error;
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  }
}
