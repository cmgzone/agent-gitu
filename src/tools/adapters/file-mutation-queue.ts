/**
 * In-process serialization queue for file mutations.
 *
 * Ensures concurrent operations targeting the same canonical file path
 * run sequentially without race conditions, while mutations to distinct
 * files execute in parallel.
 *
 * Self-contained implementation to eliminate coupling to internal SDK paths.
 */
import path from 'node:path';

const fileMutationQueues = new Map<string, Promise<void>>();
let registrationQueue = Promise.resolve();

/**
 * Serialize file mutation operations targeting the same file path.
 */
export async function withFileMutationQueue<T>(
  filePath: string,
  operation: () => Promise<T>,
): Promise<T> {
  const canonicalKey = path.resolve(filePath);

  const registration = registrationQueue.then(async () => {
    const currentQueue = fileMutationQueues.get(canonicalKey) ?? Promise.resolve();
    let releaseNext: () => void = () => {};
    const nextQueue = new Promise<void>((resolve) => {
      releaseNext = resolve;
    });
    const chainedQueue = currentQueue.then(() => nextQueue);
    fileMutationQueues.set(canonicalKey, chainedQueue);
    return { currentQueue, chainedQueue, releaseNext };
  });

  registrationQueue = registration.then(
    () => undefined,
    () => undefined,
  );

  const { currentQueue, chainedQueue, releaseNext } = await registration;
  await currentQueue;
  try {
    return await operation();
  } finally {
    releaseNext();
    if (fileMutationQueues.get(canonicalKey) === chainedQueue) {
      fileMutationQueues.delete(canonicalKey);
    }
  }
}
