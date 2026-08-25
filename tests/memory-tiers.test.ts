import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/memory/memory-store.js';
import { compactHistory } from '../src/agent/hermes.js';
import type { LlmMessage } from '../src/llm/llm.js';

function freshStore(name: string): MemoryStore {
  const dir = mkdtempSync(path.join(tmpdir(), `tier-${name}-`));
  return new MemoryStore(path.join(dir, 'memory.json'));
}

describe('two-tier memory: Tier 1 (protected) vs Tier 2 (retrieved)', () => {
  it('Tier 1 returns decisions/constraints/conventions; Tier 2 types are excluded', () => {
    const s = freshStore('types');
    s.add({ type: 'decision', claim: 'Use Zustand for checkout state', scope: 'proj', sourceType: 'user_statement', importance: 0.6 });
    s.add({ type: 'constraint', claim: 'No direct DOM writes in render', scope: 'proj', sourceType: 'source_code' });
    s.add({ type: 'project_convention', claim: 'All cart changes need a node test', scope: 'proj', sourceType: 'user_statement' });
    // Tier 2 types — should NOT appear in Tier 1.
    s.add({ type: 'fact', claim: 'Cart items live in cart.ts', scope: 'proj', sourceType: 'source_code' });
    s.add({ type: 'observation', claim: 'Hero grid looks broken on mobile', scope: 'proj', sourceType: 'browser_evidence' });
    s.add({ type: 'pattern', claim: 'PATTERN: retrying without a hypothesis fails', scope: 'proj', sourceType: 'task_completion' });
    s.add({ type: 'lesson', claim: 'Prefer small PRs', scope: 'proj', sourceType: 'model_inference' });

    const tier1 = s.retrieveProtected('proj');
    const types = tier1.map((m) => m.type).sort();
    expect(types).toEqual(['constraint', 'decision', 'project_convention']);
  });

  it('explicit pin promotes any memory into Tier 1', () => {
    const s = freshStore('pin');
    const pinned = s.add({ type: 'fact', claim: 'Pinned fact must survive', scope: 'proj', sourceType: 'source_code', pinned: true });
    expect(s.retrieveProtected('proj').some((m) => m.id === pinned.entry.id)).toBe(true);
    // Same fact, unpinned, is Tier 2 only.
    const plain = s.add({ type: 'fact', claim: 'Plain fact is searchable', scope: 'proj', sourceType: 'source_code' });
    expect(s.retrieveProtected('proj').some((m) => m.id === plain.entry.id)).toBe(false);
  });

  it('critical (high-importance) failure lessons are Tier 1; resolved normal ones are not', () => {
    const s = freshStore('fail');
    const critical = s.addFailureLesson({ action: 'deploy --prod', cause: 'lock timeout', fix: 'release lock', scope: 'proj', importance: 0.95 });
    const normal = s.addFailureLesson({ action: 'db migrate', cause: 'timeout', fix: 'retry', scope: 'proj' });
    const tier1 = s.retrieveProtected('proj');
    expect(tier1.some((m) => m.id === critical.entry.id)).toBe(true);
    expect(tier1.some((m) => m.id === normal.entry.id)).toBe(false);
    // Pinning promotes even a resolved lesson to Tier 1.
    const pinned = s.addFailureLesson({ action: 'cache flush', cause: 'stale', scope: 'proj', pinned: true });
    expect(s.retrieveProtected('proj').some((m) => m.id === pinned.entry.id)).toBe(true);
  });

  it('Tier 1 ignores lexical relevance (durable guidance); Tier 2 requires it', () => {
    const s = freshStore('rel');
    // A low-importance decision so it would NOT surface via Tier 2 general bucket.
    s.add({ type: 'decision', claim: 'Checkout uses Zustand', scope: 'proj', sourceType: 'user_statement', importance: 0.5 });
    s.add({ type: 'fact', claim: 'Database indexing uses a B-tree', scope: 'proj', sourceType: 'source_code' });

    // Tier 1 returns the decision regardless of the goal wording.
    const tier1 = s.retrieveProtected('proj');
    expect(tier1.some((m) => /zustand/i.test(m.claim))).toBe(true);

    // Tier 2 (relevance retrieval) with an unrelated goal surfaces the DB fact
    // but NOT the checkout decision (no lexical overlap, not high-importance).
    const tier2 = s.retrieveForContext('database indexing B-tree strategy', 'proj', { limit: 8 });
    expect(tier2.some((m) => /b-tree/i.test(m.claim))).toBe(true);
    expect(tier2.some((m) => /zustand/i.test(m.claim))).toBe(false);
  });

  it('Tier 2 disappears when irrelevant and reappears when the query is relevant', () => {
    const s = freshStore('reapp');
    s.add({ type: 'fact', claim: 'Checkout cart totals are computed in totals.ts', scope: 'proj', sourceType: 'source_code' });
    const irrelevant = s.retrieveForContext('unrelated topic about planets and stars', 'proj', { limit: 8 });
    expect(irrelevant.some((m) => /totals\.ts/i.test(m.claim))).toBe(false);
    const relevant = s.retrieveForContext('where are checkout cart totals computed', 'proj', { limit: 8 });
    expect(relevant.some((m) => /totals\.ts/i.test(m.claim))).toBe(true);
  });

  it('private Tier 1 memory stays private; published Tier 1 is visible to participants', () => {
    const s = freshStore('vis');
    const priv = s.add({ type: 'decision', claim: 'Private architectural choice', scope: 'proj', visibility: 'agent', agentId: 'a1', sourceType: 'user_statement' });
    const published = s.add({ type: 'decision', claim: 'Shared architectural choice', scope: 'proj', visibility: 'mission', missionId: 'm1', projectId: 'proj', agentId: 'a1', sourceType: 'user_statement' });

    // Agent a1 sees both; agent a2 sees only the mission one.
    const asA1 = s.retrieveProtected('proj', { ctx: { requestingAgentId: 'a1', projectId: 'proj', missionId: 'm1' } });
    expect(asA1.some((m) => m.id === priv.entry.id)).toBe(true);
    expect(asA1.some((m) => m.id === published.entry.id)).toBe(true);

    const asA2 = s.retrieveProtected('proj', { ctx: { requestingAgentId: 'a2', projectId: 'proj', missionId: 'm1' } });
    expect(asA2.some((m) => m.id === priv.entry.id)).toBe(false);
    expect(asA2.some((m) => m.id === published.entry.id)).toBe(true);
  });

  it('Tier 1 and Tier 2 both survive every compaction generation', () => {
    const protectedSection = 'ACTIVE CONSTRAINTS & DECISIONS (protected — always available):\n- [decision] Checkout must use Zustand, never Redux';
    const memorySection = 'RELEVANT MEMORY (ranked; verified knowledge first — superseded entries excluded):\n- [fact] Cart totals computed in totals.ts';
    const messages: LlmMessage[] = [
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'INTAKE CONTEXT' },
      { role: 'user', content: protectedSection },
      { role: 'user', content: memorySection },
    ];
    // Simulate several compaction generations, mirroring Hermes' re-injection:
    // the conversation GROWS each generation (new turns), compaction triggers,
    // and both sections are reconstructed after the digest.
    for (let gen = 0; gen < 5; gen++) {
      while (messages.length <= 12) {
        messages.push({ role: 'assistant', content: 'step' });
        messages.push({ role: 'user', content: 'ok' });
      }
      const compacted = compactHistory(messages, () => {}, { triggerMessages: 10, keepRecent: 5 });
      expect(compacted).toBe(true);
      // Both sections were digested away (old history absorbed by the digest).
      expect(messages.some((m) => m.content === protectedSection)).toBe(false);
      expect(messages.some((m) => m.content === memorySection)).toBe(false);
      // Re-injected right after the fresh digest (protected at 2, memory at 3).
      messages.splice(2, 0, { role: 'user', content: protectedSection });
      messages.splice(3, 0, { role: 'user', content: memorySection });
      expect(String(messages[2]!.content)).toContain('ACTIVE CONSTRAINTS');
      expect(String(messages[3]!.content)).toContain('RELEVANT MEMORY');
    }
  });
});
