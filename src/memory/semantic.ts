/**
 * Semantic memory layer — embeddings for consolidation, pattern evidence and
 * ADVISORY contradiction detection.
 *
 * Reuses the single Embedder infrastructure (src/context/embeddings.ts).
 * Vectors are cached per (model, content-hash): unchanged memory content is
 * NEVER re-embedded. Embedding failures degrade every operation to the
 * lexical path — memory must keep working without embeddings.
 *
 * Safety model: semantic similarity FINDS candidates; it is never the sole
 * authority for merging or superseding. Only strong duplicates consolidate
 * automatically; possible duplicates and possible contradictions are flagged
 * for evaluation.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { cosineSimilarity } from '../context/embeddings.js';
import type { Embedder } from '../context/embeddings.js';
import { nowIso } from '../util.js';

export function hashContent(text: string): string {
  return createHash('sha1').update(text.trim().replace(/\s+/g, ' ').toLowerCase()).digest('hex').slice(0, 16);
}

interface CachedVector {
  vector: number[];
  model: string;
  hash: string;
  at: string;
}

/** Persisted embedding cache keyed by model + content hash. */
export class MemoryEmbeddingCache {
  private readonly vectors = new Map<string, Float32Array>();
  private dirty = false;
  hits = 0;
  misses = 0;

  constructor(private readonly file: string) {
    if (existsSync(file)) {
      try {
        const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, CachedVector>;
        for (const [key, cached] of Object.entries(raw)) {
          if (cached && Array.isArray(cached.vector)) this.vectors.set(key, Float32Array.from(cached.vector));
        }
      } catch {
        /* a corrupt cache is just a cold cache */
      }
    }
  }

  private key(model: string, hash: string): string {
    return `${model}:${hash}`;
  }

  get(model: string, hash: string): Float32Array | undefined {
    const vec = this.vectors.get(this.key(model, hash));
    if (vec) {
      this.hits += 1;
      return vec;
    }
    this.misses += 1;
    return vec;
  }

  put(model: string, hash: string, vector: Float32Array): void {
    this.vectors.set(this.key(model, hash), vector);
    this.dirty = true;
  }

  flush(): void {
    if (!this.dirty) return;
    try {
      const out: Record<string, CachedVector> = {};
      for (const [key, vec] of this.vectors) {
        out[key] = { vector: Array.from(vec), model: key.split(':')[0]!, hash: key.split(':')[1] ?? '', at: nowIso() };
      }
      writeFileSync(this.file, JSON.stringify(out));
      this.dirty = false;
    } catch {
      /* cache persistence is best-effort */
    }
  }
}

/** Hybrid similarity: semantic carries the paraphrase signal, lexical the
 *  exact-term signal. Both 0-1; the blend is deterministic. */
export function hybridSimilarity(semantic: number, lexical: number): number {
  return Math.max(0, Math.min(1, 0.6 * semantic + 0.4 * lexical));
}

export type PairRelationship =
  | 'strong-duplicate'
  | 'possible-duplicate'
  | 'related'
  | 'possible-contradiction'
  | 'unrelated';

/** Deterministic pair classification. A high semantic score with unique
 *  SUBSTANTIVE tokens on each side (not glue words) is the signature of a
 *  subject swap ("Zustand" vs "Redux", "localStorage" vs "cookies") — flagged
 *  as a POSSIBLE contradiction for evaluation; similarity alone never merges
 *  or supersedes anything. */
const GLUE_WORDS = new Set([
  'uses', 'using', 'used', 'managed', 'management', 'manager', 'store', 'stores', 'stored',
  'application', 'implementation', 'everywhere', 'instead', 'currently', 'system', 'systems',
  'state', 'handling', 'support', 'supports', 'with', 'from', 'that', 'this', 'have', 'has',
  'the', 'and', 'for', 'all', 'new', 'old', 'was', 'were', 'change', 'changed', 'after',
  'before', 'when', 'only', 'also', 'into', 'onto', 'over', 'under', 'based', 'uses0',
]);

export function classifyPair(hybrid: number, lexical: number, contradictionSignals: number): PairRelationship {
  // Contradiction check runs FIRST: a subject swap with unique technical
  // terms on both sides must never be consolidated as a duplicate.
  if (contradictionSignals >= 2 && hybrid >= 0.5) return 'possible-contradiction';
  if (hybrid >= 0.55 && lexical >= 0.2) return 'strong-duplicate';
  if (hybrid >= 0.45) return 'possible-duplicate';
  if (hybrid >= 0.3) return 'related';
  return 'unrelated';
}

/**
 * Corroboration types: similar texts among these REINFORCE each other (the
 * same failure seen twice, repeated observations) rather than contradicting.
 * The contradiction gate applies only to state-assertion types, where the
 * same subject with different terms means the world changed.
 */
const CORROBORATION_TYPES = new Set(['failure', 'lesson', 'task_result', 'evidence', 'observation']);

export function isCorroborationType(type: string): boolean {
  return CORROBORATION_TYPES.has(type);
}

/**
 * Count distinctive content tokens that appear in exactly ONE of the two
 * claims (length ≥ 4, glue words excluded). Two or more one-sided technical
 * terms inside an otherwise similar pair is the classic contradiction
 * signature ("Zustand" vs "Redux", "localStorage" vs "cookies").
 */
export function contradictionSignals(a: string, b: string): number {
  const tokensOf = (t: string): Map<string, number> => {
    const map = new Map<string, number>();
    for (const tok of t.toLowerCase().split(/[^a-z0-9]+/)) {
      if (tok.length >= 4 && !GLUE_WORDS.has(tok)) map.set(tok, (map.get(tok) ?? 0) + 1);
    }
    return map;
  };
  const ta = tokensOf(a);
  const tb = tokensOf(b);
  let uniqueA = 0;
  let uniqueB = 0;
  for (const [tok, n] of ta) {
    if (n === 1 && !tb.has(tok)) uniqueA += 1;
  }
  for (const [tok, n] of tb) {
    if (n === 1 && !ta.has(tok)) uniqueB += 1;
  }
  // Each side contributing at least one unique substantive term is one
  // signal; two+ on a side is a stronger one.
  return (uniqueA >= 1 ? 1 : 0) + (uniqueB >= 1 ? 1 : 0) + (uniqueA >= 2 || uniqueB >= 2 ? 1 : 0);
}

/** Deterministic test-friendly embedder: token-hash bag-of-words vector. */
export function hashingEmbedder(dimensions = 64): Embedder {
  return {
    model: 'hashing-test',
    async embed(texts: string[]): Promise<Float32Array[]> {
      return texts.map((text) => {
        const vec = new Float32Array(dimensions);
        for (const tok of text.toLowerCase().split(/[^a-z0-9]+/)) {
          if (!tok) continue;
          let h = 0;
          for (let i = 0; i < tok.length; i++) h = (h * 31 + tok.charCodeAt(i)) >>> 0;
          vec[h % dimensions] = (vec[h % dimensions] ?? 0) + 1;
        }
        let norm = 0;
        for (let i = 0; i < dimensions; i++) norm += vec[i]! * vec[i]!;
        norm = Math.sqrt(norm);
        if (norm > 0) for (let i = 0; i < dimensions; i++) vec[i]! /= norm;
        return vec;
      });
    },
  };
}

export { cosineSimilarity };
