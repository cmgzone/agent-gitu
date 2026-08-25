import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/memory/memory-store.js';
import { classifyPair, contradictionSignals, hashingEmbedder, hybridSimilarity, MemoryEmbeddingCache } from '../src/memory/semantic.js';

function freshStore(name: string): MemoryStore {
  const dir = mkdtempSync(path.join(tmpdir(), `hermes-semantic-${name}-`));
  return new MemoryStore(path.join(dir, 'memory.json'));
}

const hashEmbedder = () => hashingEmbedder(96);

describe('pair classification primitives', () => {
  it('paraphrases classify as strong duplicates', () => {
    const a = 'Checkout state is managed by Zustand.';
    const b = 'The checkout store uses Zustand for application state.';
    const lexical = 0.45;
    expect(classifyPair(hybridSimilarity(0.85, lexical), lexical, contradictionSignals(a, b))).toBe('strong-duplicate');
  });

  it('a subject swap signals a possible contradiction', () => {
    const a = 'Checkout uses Zustand for state management everywhere.';
    const b = 'Checkout uses Redux for state management everywhere instead.';
    const signals = contradictionSignals(a, b);
    expect(signals).toBeGreaterThanOrEqual(2);
    expect(classifyPair(hybridSimilarity(0.8, 0.35), 0.35, signals)).toBe('possible-contradiction');
  });

  it('the embedding cache reuses unchanged content and persists across restarts', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hermes-vec-cache-'));
    const cacheFile = path.join(dir, 'memory-vectors.json');
    const cache = new MemoryEmbeddingCache(cacheFile);
    const hash = 'abc123';
    expect(cache.get('m1', hash)).toBeUndefined(); // miss
    cache.put('m1', hash, new Float32Array([1, 2, 3]));
    cache.flush();
    const hit = cache.get('m1', hash);
    expect(hit).toBeTruthy(); // hit
    expect(cache.hits).toBe(1);
    expect(cache.misses).toBe(1);
    // Restart: a fresh cache over the same file serves the same vector.
    const reopened = new MemoryEmbeddingCache(cacheFile);
    const persisted = reopened.get('m1', hash);
    expect(persisted?.length).toBe(3);
    expect(reopened.get('m1', 'different')).toBeUndefined();
  });
});

describe('semantic consolidation', () => {
  it('recognizes paraphrases as duplicates and merges with provenance', async () => {
    const store = freshStore('paraphrase');
    store.setEmbedder(hashEmbedder());
    const a = store.add({ type: 'project_convention', claim: 'Checkout state is managed by Zustand', scope: 'proj', sourceType: 'source_code' }).entry;
    const b = store.add({ type: 'project_convention', claim: 'The checkout state store uses Zustand for application state', scope: 'proj', sourceType: 'source_code' }).entry;
    const { merged, supersededIds } = await store.consolidateSemantic({ scope: 'proj' });
    expect(merged.length).toBeGreaterThanOrEqual(1);
    expect(supersededIds).toEqual(expect.arrayContaining([a.id, b.id]));
    expect(merged[0].source).toContain(a.id);
    expect(merged[0].source).toContain(b.id);
    expect(a.status).toBe('superseded');
  });

  it('unrelated and semantically-distinct memories remain separate', async () => {
    const store = freshStore('separate');
    store.setEmbedder(hashEmbedder());
    store.add({ type: 'fact', claim: 'the database is postgres version sixteen', scope: 'proj', sourceType: 'source_code' });
    store.add({ type: 'fact', claim: 'the frontend uses react hooks extensively', scope: 'proj', sourceType: 'source_code' });
    const { merged, flagged } = await store.consolidateSemantic({ scope: 'proj' });
    expect(merged).toHaveLength(0);
    expect(flagged).toHaveLength(0);
    expect(store.query({ type: 'fact' }).filter((m) => m.status !== 'superseded')).toHaveLength(2);
  });

  it('contradictory claims are flagged, never auto-merged', async () => {
    const store = freshStore('contradict-merge');
    store.setEmbedder(hashEmbedder());
    store.add({ type: 'fact', claim: 'Checkout uses Zustand for state management everywhere', scope: 'proj', sourceType: 'source_code' });
    store.add({ type: 'fact', claim: 'Checkout uses Redux for state management everywhere instead', scope: 'proj', sourceType: 'source_code' });
    const { merged, flagged, classified } = await store.consolidateSemantic({ scope: 'proj' });
    expect(merged).toHaveLength(0);
    const flaggedContradiction = flagged.some((f) => f.relationship === 'possible-contradiction') || (classified['possible-contradiction'] ?? 0) > 0;
    expect(flaggedContradiction).toBe(true);
    expect(store.stats().semantic.possibleContradictions).toBeGreaterThan(0);
  });
});

describe('semantic fallbacks and cache behavior', () => {
  it('falls back to lexical consolidation when no embedder is set', async () => {
    const store = freshStore('lexical-fallback');
    store.add({ type: 'project_convention', claim: 'deploy via the release pipeline script', scope: 'proj' });
    store.add({ type: 'project_convention', claim: 'deploy via the release pipeline script always', scope: 'proj' });
    const { merged, classified } = await store.consolidateSemantic({ scope: 'proj' });
    expect(merged).toHaveLength(1);
    expect(classified['lexical-fallback']).toBe(1);
    expect(store.stats().semantic.embeddingFallbacks).toBeGreaterThan(0);
  });

  it('embedding failure is harmless (lexical fallback)', async () => {
    const store = freshStore('embed-fail');
    const failing: Embedder = { model: 'broken', embed: async () => { throw new Error('provider down'); } };
    store.setEmbedder(failing);
    store.add({ type: 'project_convention', claim: 'release via the pipeline script', scope: 'proj' });
    store.add({ type: 'project_convention', claim: 'release via the pipeline script only', scope: 'proj' });
    const { merged } = await store.consolidateSemantic({ scope: 'proj' });
    expect(merged).toHaveLength(1);
    expect(store.stats().semantic.embeddingFallbacks).toBeGreaterThan(0);
  });

  it('excludes superseded memories from consolidation', async () => {
    const store = freshStore('superseded');
    store.setEmbedder(hashEmbedder());
    store.add({ type: 'fact', claim: 'the api gateway is nginx', scope: 'proj', sourceType: 'source_code' });
    const dup = store.add({ type: 'fact', claim: 'the api gateway is nginx gateway', scope: 'proj', sourceType: 'source_code' }).entry;
    store.supersede(dup.id, dup.id);
    const { merged } = await store.consolidateSemantic({ scope: 'proj' });
    expect(merged).toHaveLength(0);
  });

  it('changed content invalidates the cached embedding', async () => {
    const store = freshStore('invalidate');
    let embedCalls = 0;
    const counting: Embedder = {
      model: 'counting',
      embed: async (texts) => {
        embedCalls += texts.length;
        return hashEmbedder().embed(texts);
      },
    };
    store.setEmbedder(counting);
    store.add({ type: 'fact', claim: 'original claim about caching', scope: 'proj' });
    await store.consolidateSemantic({ scope: 'proj' });
    const callsAfterFirst = embedCalls;
    expect(callsAfterFirst).toBe(1);
    // Same content again: served from cache, no new embed call.
    await store.consolidateSemantic({ scope: 'proj' });
    expect(embedCalls).toBe(callsAfterFirst);
  });
});

describe('success-pattern promotion', () => {
  it('one and two successes never promote; three independent verified ones do', async () => {
    const store = freshStore('success');
    const subject = 'responsive UI change followed by multi-viewport verification';
    const first = store.recordSuccessObservation({ subject, taskId: 'task-1', scope: 'proj', sourceType: 'browser_evidence' });
    expect(first.promoted).toBe(false);
    expect(first.distinctObservations).toBe(1);
    const second = store.recordSuccessObservation({ subject, taskId: 'task-2', scope: 'proj', sourceType: 'browser_evidence' });
    expect(second.promoted).toBe(false);
    const third = store.recordSuccessObservation({ subject, taskId: 'task-3', scope: 'proj', sourceType: 'browser_evidence' });
    expect(third.promoted).toBe(true);
    expect(third.pattern?.type).toBe('pattern');
    expect(third.pattern?.status).toBe('verified');
    expect(third.pattern?.claim).toContain('PATTERN');
    expect(third.pattern?.evidence).toContain('task-1');
    expect(third.pattern?.confidence).toBeLessThanOrEqual(0.95);
    // A fourth observation does not duplicate the pattern.
    const fourth = store.recordSuccessObservation({ subject, taskId: 'task-4', scope: 'proj', sourceType: 'browser_evidence' });
    expect(fourth.promoted).toBe(false);
    expect(fourth.reason).toContain('already promoted');
  });

  it('unverified (model-claim) successes can never promote', () => {
    const store = freshStore('unverified');
    const result = store.recordSuccessObservation({ subject: 'claim-only success', taskId: 'task-9', scope: 'proj', sourceType: 'model_inference' });
    expect(result.promoted).toBe(false);
    expect(result.reason).toContain('model claims');
  });

  it('unrelated successes do not combine into one pattern', () => {
    const store = freshStore('unrelated');
    const a = store.recordSuccessObservation({ subject: 'responsive layout verification passes', taskId: 't1', scope: 'proj', sourceType: 'browser_evidence' });
    const b = store.recordSuccessObservation({ subject: 'payment webhook retries succeed', taskId: 't2', scope: 'proj', sourceType: 'test' });
    const c = store.recordSuccessObservation({ subject: 'login flow passes on mobile', taskId: 't3', scope: 'proj', sourceType: 'test' });
    expect(a.promoted).toBe(false);
    expect(b.promoted).toBe(false);
    expect(c.promoted).toBe(false);
    expect(store.stats().semantic.successPatternsPromoted).toBe(0);
  });

  it('pattern provenance survives consolidation of the underlying evidence', () => {
    const store = freshStore('provenance');
    const subject = 'migration scripts run before seed scripts';
    for (const taskId of ['t1', 't2', 't3']) {
      store.recordSuccessObservation({ subject, taskId, scope: 'proj', sourceType: 'task_completion' });
    }
    const pattern = store.query({ type: 'pattern' })[0];
    expect(pattern?.evidence).toContain('t1');
    expect(pattern?.source).toContain('t1');
  });
});

import { buildModelContext } from '../src/context/model-context.js';

describe('advisory contradiction detection', () => {
  it('flags a possible contradiction without superseding anything', async () => {
    const store = freshStore('advisory');
    // Controlled embedder: the old and new auth claims land CLOSE together
    // (same subject) while their distinctive terms differ lexically.
    const vectors: Record<string, number[]> = {
      localStorage: [1, 1, 0, 0.2],
      httpOnly: [1, 0.9, 0.8, 0.2],
    };
    const lookup: Embedder = {
      model: 'lookup',
      embed: async (texts) =>
        texts.map((t) => {
          const key = Object.keys(vectors).find((k) => t.includes(k));
          return Float32Array.from(vectors[key!] ?? [0.2, 0.2, 0.2, 0.2]);
        }),
    };
    store.setEmbedder(lookup);
    const existing = store.add({ type: 'fact', claim: 'authentication stores session tokens in localStorage', scope: 'proj', sourceType: 'source_code' }).entry;
    const { possibleContradictions } = await store.detectContradictions(
      { claim: 'authentication now delivers session tokens via httpOnly cookies', type: 'fact', scope: 'proj' },
      lookup,
    );
    // Advisory: the existing memory is untouched.
    expect(existing.status).toBe('verified');
    expect(possibleContradictions.length).toBeGreaterThanOrEqual(1);
    expect(possibleContradictions[0]!.existingId).toBe(existing.id);
    expect(store.stats().semantic.possibleContradictions).toBeGreaterThan(0);
    expect(store.explain(existing.id).audit.some((a) => (a.reason ?? '').includes('POSSIBLE MEMORY CONTRADICTION'))).toBe(true);
  });

  it('explicit evidence still drives supersession through recordVerified', () => {
    const store = freshStore('evidence-supersede');
    const old = store.add({ type: 'fact', claim: 'authentication stores session tokens in localStorage', scope: 'proj', sourceType: 'source_code' });
    const { entry: newer, supersededIds } = store.recordVerified({
      type: 'fact', claim: 'authentication delivers session tokens via httpOnly cookies', scope: 'proj',
      sourceType: 'source_code', evidence: 'src/auth/cookies.ts',
    });
    expect(supersededIds).toContain(old.entry.id);
    expect(newer.status).toBe('verified');
    const ranked = store.retrieve('session token storage mechanism', 'proj', 5);
    expect(ranked.some((m) => m.id === old.entry.id)).toBe(false);
  });
});

describe('semantic telemetry and context integration', () => {
  it('semantic counters are exposed through stats()', async () => {
    const store = freshStore('telemetry');
    store.setEmbedder(hashEmbedder());
    store.add({ type: 'fact', claim: 'alpha fact about the build pipeline', scope: 'proj', sourceType: 'source_code' });
    store.add({ type: 'fact', claim: 'alpha fact about the build pipelines', scope: 'proj', sourceType: 'source_code' });
    await store.consolidateSemantic({ scope: 'proj' });
    const semantic = store.stats().semantic;
    expect(semantic.semanticCandidates).toBeGreaterThan(0);
    expect(semantic.embeddingCacheMisses).toBeGreaterThan(0);
    expect(semantic.semanticMerged + semantic.semanticRelated + semantic.semanticContradictions).toBeGreaterThan(0);
  });

  it('semantic memory still enters only through buildModelContext with budget', () => {
    const memorySection = 'RELEVANT MEMORY (ranked):\n- [pattern/verified] PATTERN: responsive changes need multi-viewport checks';
    const result = buildModelContext({ system: 'SYS', memory: memorySection, budget: { maxChars: 3000 } });
    expect(result.messages.some((m) => String(m.content).startsWith('RELEVANT MEMORY'))).toBe(true);
    expect(result.sections.memory).toBeGreaterThan(0);
    expect(result.totalChars).toBeLessThanOrEqual(3000 + 200);
  });
});
