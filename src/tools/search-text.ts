import { open, readFile } from 'node:fs/promises';

/** Probe binary content before decoding a potentially enormous package.
 * The probe is an I/O chunk, not a text-file size limit: text is read in full. */
export async function readSearchText(file: string, signal?: AbortSignal): Promise<string | undefined> {
  signal?.throwIfAborted();
  const handle = await open(file, 'r');
  let binary: boolean;
  try {
    const probe = Buffer.alloc(4096);
    const { bytesRead } = await handle.read(probe, 0, probe.length, 0);
    binary = probe.subarray(0, bytesRead).includes(0);
  } finally {
    await handle.close();
  }
  signal?.throwIfAborted();
  if (binary) return undefined;
  const content = await readFile(file, { encoding: 'utf8', signal });
  return content.includes('\0') ? undefined : content;
}
