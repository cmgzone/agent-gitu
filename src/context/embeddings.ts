/**
 * Minimal OpenAI-compatible embeddings client. Zero new dependencies: plain
 * fetch + typed-array math. Used for hybrid semantic retrieval over the code
 * index; entirely optional — retrieval degrades to the lexical/IDF scorer
 * whenever no provider/key is configured or the endpoint rejects embeddings.
 */

export interface Embedder {
  /** Model id used for stored vectors (vectors from different models never mix). */
  readonly model: string;
  embed(texts: string[]): Promise<Float32Array[]>;
}

const EMBED_TIMEOUT_MS = 20_000;
/** Files are embedded from a bounded prefix; long files still retrieve fine. */
export const EMBED_MAX_CHARS = 6_000;
/** Per-request batch ceiling keeps payloads well under provider limits. */
export const EMBED_BATCH = 16;

export function createEmbedder(opts: { baseUrl: string; apiKey: string; model?: string }): Embedder {
  const model = opts.model?.trim() || 'text-embedding-3-small';
  const url = `${opts.baseUrl.replace(/\/$/, '')}/embeddings`;
  return {
    model,
    async embed(texts: string[]): Promise<Float32Array[]> {
      if (texts.length === 0) return [];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), EMBED_TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey}` },
          body: JSON.stringify({ model, input: texts }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`embeddings HTTP ${res.status}`);
        const data = (await res.json()) as { data?: { embedding?: number[]; index?: number }[] };
        const rows = data.data ?? [];
        if (rows.length !== texts.length) throw new Error(`embeddings returned ${rows.length}/${texts.length} vectors`);
        const out: Float32Array[] = [];
        for (let i = 0; i < texts.length; i++) {
          const vec = rows[i]?.embedding;
          if (!Array.isArray(vec) || vec.length === 0) throw new Error('embeddings: empty vector');
          out.push(Float32Array.from(vec));
        }
        return out;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

/** Decode a stored BLOB back into a Float32Array view (no copy of the buffer bytes). */
export function decodeVector(buf: Uint8Array): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}
