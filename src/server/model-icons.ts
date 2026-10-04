/** Fixed public asset origin; this is never a URL proxy and never sends credentials. */
const ORIGIN = 'https://models.dev/logos/';
const MAX_BYTES = 64 * 1024;
const cache = new Map<string, { bytes?: Buffer; expires: number }>();
const pending = new Map<string, Promise<Buffer | undefined>>();

export async function modelIcon(kind: string, id: string): Promise<Buffer | undefined> {
  if (!['lab', 'provider'].includes(kind) || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id)) return undefined;
  const key = kind + '/' + id;
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return saved.bytes;
  if (pending.has(key)) return pending.get(key);
  if (pending.size >= 32) return undefined;
  const request = (async () => {
    let bytes: Buffer | undefined;
    try {
      const response = await fetch(ORIGIN + (kind === 'lab' ? 'labs/' : '') + id + '.svg', { signal: AbortSignal.timeout(4000), redirect: 'error' });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/svg+xml') || Number(response.headers.get('content-length')) > MAX_BYTES) { await response.body?.cancel(); return undefined; }
      if (!response.body) return undefined;
      const reader = response.body.getReader(), chunks: Uint8Array[] = [];
      let size = 0;
      for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_BYTES) { await reader.cancel(); return undefined; } chunks.push(value); }
      const image = Buffer.concat(chunks);
      if (/<svg\b/i.test(image.toString('utf8'))) bytes = image;
      return bytes;
    } catch { return undefined; }
    finally {
      if (cache.size >= 128 && !cache.has(key)) cache.delete(cache.keys().next().value!);
      cache.set(key, { bytes, expires: Date.now() + (bytes ? 24 * 60 * 60 * 1000 : 60000) });
      pending.delete(key);
    }
  })();
  pending.set(key, request);
  return request;
}
