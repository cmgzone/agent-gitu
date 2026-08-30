import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/memory/memory-store.js';
import { buildModelContext } from '../src/context/model-context.js';
import type { LlmMessage } from '../src/llm/llm.js';

function freshStore(name: string): MemoryStore {
  const dir = mkdtempSync(path.join(tmpdir(), `hermes-lifecycle-${name}-`));
  return new MemoryStore(path.join(dir, 'memory.json'));
}

const SYSTEM = 'You are Agent Gitu.';

describe('memory lifecycle — candidate → verified → durable', () => {
  it('a candidate never becomes durable automatically', () => {
    const store = freshStore('auto');
    const { entry } = store.add({ type: 'fact', claim: 'API may use Redis', scope: 'proj', sourceType: 'model_inference' });
    expect(entry.status).toBe('candidate');
    expect(() => store.promote(entry.id, { to: 'durable' })).toThrow(/candidate/);
    expect(entry.status).toBe('candidate');
  });

  it('model inference cannot be verified without evidence; source-backed facts can', () => {
    const store = freshStore('verify');
    const inference = store.add({ type: 'fact', claim: 'API may use Redis', scope: 'proj', sourceType: 'model_inference' });
    expect(() => store.promote(inference.entry.id, { to: 'verified' })).toThrow(/verification support/);
    const sourced = store.add({ type: 'fact', claim: 'API uses Redis via src/api/cache.ts', scope: 'proj', sourceType: 'source_code' });
    expect(sourced.entry.status).toBe('verified'); // trustworthy source verifies on arrival
    const promoted = store.promote(sourced.entry.id, { to: 'durable', importance: 0.8 });
    expect(promoted?.status).toBe('durable');
  });

  it('verified memory outranks equally-similar unverified candidates', () => {
    const store = freshStore('rank');
    store.add({ type: 'fact', claim: 'auth tokens refresh every 15 minutes', scope: 'proj', sourceType: 'model_inference', confidence: 0.5 });
    store.add({ type: 'fact', claim: 'auth token refresh interval is 15 minutes', scope: 'proj', sourceType: 'test', confidence: 0.9 });
    const ranked = store.retrieve('auth token refresh', 'proj', 2);
    expect(ranked[0]!.sourceType).toBe('test');
    expect(ranked[0]!.status).toBe('verified');
  });
});

describe('contradiction and supersession', () => {
  it('a verified replacement supersedes its predecessor; history is kept', () => {
    const store = freshStore('contradict');
    const old = store.add({ type: 'fact', claim: 'authentication stores tokens in localStorage', scope: 'proj', sourceType: 'source_code' });
    const { entry: newer, supersededIds } = store.recordVerified({
      type: 'fact',
      claim: 'authentication moved to httpOnly cookies, not localStorage',
      scope: 'proj',
      sourceType: 'source_code',
      evidence: 'src/auth/cookies.ts',
    });
    expect(supersededIds).toContain(old.entry.id);
    expect(old.entry.status).toBe('superseded');
    expect(old.entry.supersededBy).toBe(newer.id);
    // The superseded memory never surfaces as authoritative.
    const ranked = store.retrieve('authentication cookies httponly', 'proj', 5);
    expect(ranked.some((m) => m.id === old.entry.id)).toBe(false);
    expect(ranked.some((m) => m.id === newer.id)).toBe(true);
  });

  it('a superseded memory cannot override the current verified memory', () => {
    const store = freshStore('override');
    const old = store.add({ type: 'decision', claim: 'use REST for the billing API', scope: 'proj' });
    const { entry: newer } = store.recordVerified({ type: 'decision', claim: 'billing API switched from REST to GraphQL', scope: 'proj' });
    store.supersede(old.entry.id, newer.id);
    const ranked = store.retrieve('billing API protocol', 'proj', 5);
    expect(ranked[0]!.id).toBe(newer.id);
    expect(ranked.every((m) => m.status !== 'superseded')).toBe(true);
  });
});

describe('consolidation', () => {
  it('merges overlapping memories into one, preserving provenance and decisions', () => {
    const store = freshStore('consolidate');
    const a = store.add({ type: 'project_convention', claim: 'Checkout state uses Zustand', scope: 'proj', sourceType: 'source_code' }).entry;
    const b = store.add({ type: 'project_convention', claim: 'Checkout state lives in checkoutStore.ts Zustand store', scope: 'proj', sourceType: 'source_code' }).entry;
    const c = store.add({ type: 'project_convention', claim: 'Do not introduce Redux for checkout state', scope: 'proj', sourceType: 'user_statement' }).entry;
    const { merged, supersededIds } = store.consolidate('proj');
    expect(merged).toHaveLength(1);
    expect(merged[0]!.claim).toContain('Zustand');
    expect(merged[0]!.claim).toContain('Redux');
    expect(merged[0]!.source).toContain(a.id);
    expect(supersededIds).toEqual(expect.arrayContaining([a.id, b.id, c.id]));
    expect(store.retrieve('checkout state management', 'proj', 5)[0]!.id).toBe(merged[0]!.id);
  });

  it('keeps failure causes through consolidation', () => {
    const store = freshStore('fail-merge');
    store.addFailureLesson({ action: 'deploy --prod', cause: 'migration lock timeout', scope: 'proj' });
    store.addFailureLesson({ action: 'deploy --prod staging', cause: 'migration lock timeout again', scope: 'proj' });
    const { merged } = store.consolidate('proj');
    expect(merged.length).toBeGreaterThanOrEqual(1);
    expect(merged.some((m) => m.claim.includes('migration lock'))).toBe(true);
  });
});

describe('decay — conservative, archive-not-destroy', () => {
  it('archives stale low-value observations but never decisions', () => {
    const store = freshStore('decay');
    const stale = store.add({ type: 'observation', claim: 'the dev server printed a deprecation warning', scope: 'proj', confidence: 0.4, importance: 0.3 });
    const decision = store.add({ type: 'decision', claim: 'use pnpm as the package manager', scope: 'proj', confidence: 0.4, importance: 0.3 });
    // Backdate both past the decay window.
    const old = new Date(Date.now() - 60 * 86_400_000).toISOString();
    for (const e of [stale.entry, decision]) {
      (e as { createdAt: string }).createdAt = old;
    }
    const archived = store.decay({ olderThanDays: 30 });
    expect(archived).toContain(stale.entry.id);
    expect(stale.entry.status).toBe('archived');
    expect(archived).not.toContain(decision.id);
    expect(decision.entry.status ?? 'candidate').toBe('candidate');
  });
});

describe('patterns — repeated verified observations only', () => {
  it('a single observation never produces a pattern', () => {
    const store = freshStore('pattern1');
    const added = store.addFailureLesson({ action: 'edit Header.tsx', cause: 'mobile layout regression', scope: 'proj', confidence: 0.7 });
    const pattern = store.maybePromotePattern({ entryId: added.entry.id, patternClaim: 'Header.tsx changes need mobile verification', scope: 'proj' });
    expect(pattern).toBeUndefined();
  });

  it('repeated verified occurrences earn a pattern', () => {
    const store = freshStore('pattern3');
    const first = store.addFailureLesson({ action: 'edit Header.tsx', cause: 'mobile layout regression', scope: 'proj', confidence: 0.7 });
    // Re-observations bump confidence via the dedupe path.
    store.add({ type: 'failure', claim: first.entry.claim, scope: 'proj' });
    store.add({ type: 'failure', claim: first.entry.claim, scope: 'proj' });
    store.add({ type: 'failure', claim: first.entry.claim, scope: 'proj' });
    const pattern = store.maybePromotePattern({ entryId: first.entry.id, patternClaim: 'Header.tsx changes need mobile viewport verification', scope: 'proj' });
    expect(pattern?.type).toBe('pattern');
    expect(pattern?.claim).toContain('PATTERN');
    expect(pattern?.status).toBe('verified');
  });
});

describe('memory budget and context integration', () => {
  it('retrieveForContext respects the character budget', () => {
    const store = freshStore('budget');
    for (let i = 0; i < 10; i++) {
      store.add({ type: 'fact', claim: `checkout fact ${i}: ${'detail '.repeat(30)}`, scope: 'proj', sourceType: 'source_code' });
    }
    const entries = store.retrieveForContext('checkout facts', 'proj', { limit: 10, maxChars: 800 });
    const total = entries.reduce((n, e) => n + e.claim.length, 0);
    expect(total).toBeLessThanOrEqual(800 + entries.length * 20);
  });

  it('memory reaches the model ONLY through buildModelContext, with its own accounting', () => {
    const memorySection = 'RELEVANT MEMORY (ranked; verified knowledge first):\n- [decision/durable] use Zustand for checkout state';
    const result = buildModelContext({ system: SYSTEM, memory: memorySection, budget: { maxChars: 5000 } });
    expect(result.messages.some((m) => String(m.content).startsWith('RELEVANT MEMORY'))).toBe(true);
    expect(result.sections.memory).toBeGreaterThan(0);
  });

  it('old conversation disappears while durable memory survives in context', () => {
    const memorySection = 'RELEVANT MEMORY (ranked):\n- [decision/durable] durable decision survives trimming';
    const history: LlmMessage[] = Array.from({ length: 20 }, (_x, i) => ({
      role: i % 2 ? 'assistant' : 'user',
      content: `old conversation turn ${i} ${'x'.repeat(500)}`,
    })) as LlmMessage[];
    const result = buildModelContext({ system: SYSTEM, memory: memorySection, conversationHistory: history, budget: { maxChars: 2200 } });
    const memoryMsg = result.messages.find((m) => String(m.content).startsWith('RELEVANT MEMORY'));
    expect(memoryMsg).toBeTruthy();
    // History was trimmed hard, but the durable memory section is intact.
    expect(result.trims.some((t) => t.section === 'conversation' || t.section === 'contextPack')).toBe(true);
    expect(String(memoryMsg!.content)).toContain('durable decision survives trimming');
  });
});
