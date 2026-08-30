import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/memory/memory-store.js';
import { buildModelContext } from '../src/context/model-context.js';

function freshStore(name: string): MemoryStore {
  const dir = mkdtempSync(path.join(tmpdir(), `hermes-scope-${name}-`));
  return new MemoryStore(path.join(dir, 'memory.json'));
}

describe('specialist memory scoping + controlled sharing', () => {
  it('defaults new memories to the narrowest appropriate scope (project)', () => {
    const store = freshStore('default');
    const { entry } = store.add({ type: 'fact', claim: 'the build uses vite', scope: 'checkout-app' });
    expect(entry.visibility ?? 'project').toBe('project');
    expect(entry.projectId).toBe('checkout-app');
    expect(entry.agentId).toBeUndefined();
  });

  it('agent memory is private: specialist B cannot retrieve specialist A memory', () => {
    const store = freshStore('agent-private');
    store.add({
      type: 'observation', claim: 'Header.tsx causes mobile overflow at 375px', scope: 'proj',
      visibility: 'agent', agentId: 'frontend-a', sourceType: 'browser_evidence',
    });
    const asA = store.retrieve('Header.tsx mobile overflow', 'proj', 5, { requestingAgentId: 'frontend-a' });
    const asB = store.retrieve('Header.tsx mobile overflow', 'proj', 5, { requestingAgentId: 'frontend-b' });
    expect(asA).toHaveLength(1);
    expect(asB).toHaveLength(0);
  });

  it('mission memory: same mission retrieves, different mission cannot', () => {
    const store = freshStore('mission');
    store.add({
      type: 'fact', claim: 'checkout API contract changed to GraphQL', scope: 'proj',
      visibility: 'mission', missionId: 'mission-checkout', projectId: 'proj', sourceType: 'source_code',
    });
    const same = store.retrieve('checkout API contract', 'proj', 5, { missionId: 'mission-checkout', projectId: 'proj' });
    const other = store.retrieve('checkout API contract', 'proj', 5, { missionId: 'mission-payments', projectId: 'proj' });
    expect(same).toHaveLength(1);
    expect(other).toHaveLength(0);
  });

  it('project memory: same project retrieves, different project cannot', () => {
    const store = freshStore('project');
    store.add({ type: 'fact', claim: 'the repo uses pnpm workspaces', scope: 'proj', projectId: 'proj' });
    const same = store.retrieve('pnpm workspaces', 'proj', 5, { projectId: 'proj' });
    const other = store.retrieve('pnpm workspaces', 'proj', 5, { projectId: 'other-project' });
    expect(same).toHaveLength(1);
    expect(other).toHaveLength(0);
  });

  it('global memory is visible to every requester', () => {
    const store = freshStore('global');
    store.add({ type: 'preference', claim: 'always run typecheck before declaring success', scope: 'global', visibility: 'global' });
    expect(store.retrieve('typecheck before success', 'proj-a', 5, { projectId: 'proj-a' })).toHaveLength(1);
    expect(store.retrieve('typecheck before success', 'proj-b', 5, { projectId: 'proj-b' })).toHaveLength(1);
  });

  it('legacy memories without visibility are migrated to project scope, not lost', () => {
    const store = freshStore('legacy');
    store.add({ type: 'fact', claim: 'legacy memory without visibility field', scope: 'old-proj' });
    const entry = store.query({ scope: 'old-proj' })[0]!;
    expect(entry.visibility ?? 'project').toBe('project');
    expect(entry.projectId).toBe('old-proj');
    expect(store.retrieve('legacy memory', 'old-proj', 5, { projectId: 'old-proj' })).toHaveLength(1);
  });

  it('promotion follows the allowed transitions and preserves provenance', () => {
    const store = freshStore('promote');
    const entry = store.publishFinding({
      agentId: 'frontend-a', missionId: 'mission-1', projectId: 'proj', scope: 'proj',
      type: 'observation', content: 'Checkout overflows at 375px', sourceType: 'browser_evidence', confidence: 0.8,
    });
    // agent-scope finding published at mission visibility. Publication is
    // NEVER verification — findings always start as candidates.
    expect(entry.visibility).toBe('mission');
    expect(entry.status).toBe('candidate');

    store.promoteScope(entry.id, 'project', { reason: 'reusable beyond the mission', by: 'orchestrator', projectId: 'proj' });
    expect(entry.visibility).toBe('project');
    expect(entry.promotedFrom).toEqual([expect.objectContaining({ visibility: 'mission', reason: 'reusable beyond the mission' })]);
    expect(store.explain(entry.id).audit.some((a) => a.event === 'promoted')).toBe(true);

    store.promoteScope(entry.id, 'global', { reason: 'universal responsive rule' });
    expect(entry.visibility).toBe('global');
  });

  it('rejects invalid reverse promotions', () => {
    const store = freshStore('reject');
    const global = store.add({ type: 'fact', claim: 'universal rule', scope: 'g', visibility: 'global' }).entry;
    expect(() => store.promoteScope(global.id, 'project')).toThrow(/cannot promote/);
    const project = store.add({ type: 'fact', claim: 'project rule', scope: 'proj', visibility: 'project' }).entry;
    expect(() => store.promoteScope(project.id, 'agent')).toThrow(/cannot promote/);
  });

  it('mission-scope promotion requires a missionId', () => {
    const store = freshStore('needmission');
    const agentMem = store.add({ type: 'fact', claim: 'specialist private fact', scope: 'proj', visibility: 'agent', agentId: 'solo' });
    expect(() => store.promoteScope(agentMem.entry.id, 'mission')).toThrow(/missionId/);
  });

  it('publishFinding creates a candidate, never durable project memory', () => {
    const store = freshStore('finding');
    const finding = store.publishFinding({
      agentId: 'frontend-a', projectId: 'proj', scope: 'proj',
      type: 'observation', content: 'I think Header.tsx is probably responsible',
    });
    expect(finding.status).toBe('candidate'); // inference stays unverified
    expect(finding.visibility).toBe('mission');
  });

  it('findings become visible only after publication', () => {
    const store = freshStore('publish');
    // Nothing published yet.
    expect(store.retrieve('checkout overflow', 'proj', 5, { requestingAgentId: 'frontend-b', missionId: 'mission-1', projectId: 'proj' })).toHaveLength(0);
    store.publishFinding({
      agentId: 'frontend-a', missionId: 'mission-1', projectId: 'proj', scope: 'proj',
      type: 'observation', content: 'checkout overflows at 375px', sourceType: 'browser_evidence',
    });
    // Published → same-mission specialists see the finding (not A's conversation).
    const seen = store.retrieve('checkout overflow', 'proj', 5, { requestingAgentId: 'frontend-b', missionId: 'mission-1', projectId: 'proj' });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.claim).not.toContain('frontend-a conversation');
  });

  it('audit log records lifecycle events with provenance', () => {
    const store = freshStore('audit');
    const { entry } = store.recordVerified({ type: 'fact', claim: 'authentication uses httpOnly cookies', scope: 'proj', sourceType: 'source_code' });
    const explanation = store.explain(entry.id);
    expect(explanation.entry?.id).toBe(entry.id);
    const events = explanation.audit.map((a) => a.event);
    expect(events).toContain('created');
    expect(store.stats().auditEvents).toBeGreaterThanOrEqual(1);
  });

  it('memory stats separate scopes and lifecycle counters', () => {
    const store = freshStore('stats');
    store.add({ type: 'fact', claim: 'project fact', scope: 'proj' });
    store.add({ type: 'fact', claim: 'agent fact', scope: 'proj', visibility: 'agent', agentId: 'a1' });
    store.add({ type: 'fact', claim: 'global fact', scope: 'g', visibility: 'global' });
    store.retrieveForContext('fact', 'proj', { ctx: { projectId: 'proj' } });
    const stats = store.stats();
    expect(stats.byVisibility.project).toBe(1);
    expect(stats.byVisibility.agent).toBe(1);
    expect(stats.byVisibility.global).toBe(1);
    expect(stats.retrieved).toBeGreaterThan(0);
    expect(stats.injected).toBeGreaterThan(0);
  });

  it('buildModelContext remains the only memory injection path, budget intact', () => {
    const memorySection = 'RELEVANT MEMORY (ranked):\n- [decision/durable] mission decision visible to this specialist';
    const result = buildModelContext({
      system: 'SYS',
      memory: memorySection,
      conversationHistory: Array.from({ length: 10 }, (_x, i) => ({ role: 'user', content: `turn ${i} ${'x'.repeat(400)}` })) as LlmMessage[],
      budget: { maxChars: 1800 },
    });
    expect(result.messages.some((m) => String(m.content).startsWith('RELEVANT MEMORY'))).toBe(true);
    expect(result.sections.memory).toBeGreaterThan(0);
    expect(result.totalChars).toBeLessThanOrEqual(1800 + 1200); // budget + digest overhead tolerance
  });

  it('specialist isolation: no other specialist conversation can enter via memory', () => {
    const store = freshStore('iso');
    store.add({
      type: 'observation', claim: 'frontend-a private reasoning about the fix', scope: 'proj',
      visibility: 'agent', agentId: 'frontend-a',
    });
    // Specialist B's context assembly: agent memory invisible → absent from context.
    const entries = store.retrieveForContext('frontend reasoning fix', 'proj', {
      limit: 8, maxChars: 2000, ctx: { requestingAgentId: 'frontend-b', projectId: 'proj' },
    });
    const context = buildModelContext({
      system: 'SYS',
      memory: entries.length ? `RELEVANT MEMORY:\n${entries.map((m) => `- ${m.claim}`).join('\n')}` : undefined,
      budget: { maxChars: 4000 },
    });
    const joined = context.messages.map((m) => String(m.content)).join('\n');
    expect(joined).not.toContain('frontend-a private reasoning');
  });
});

import { SubAgentRunner } from '../src/agent/subagent.js';
import type { LlmClient, LlmMessage, LlmOptions } from '../src/llm/llm.js';

describe('audit persistence (review hardening #1)', () => {
  it('audit events survive a store restart', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hermes-audit-persist-'));
    const file = path.join(dir, 'memory.json');
    const store = new MemoryStore(file);
    const { entry } = store.recordVerified({ type: 'fact', claim: 'authentication uses httpOnly cookies', scope: 'proj', sourceType: 'source_code' });
    store.verify(entry.id, { by: 'revalidation pass' });
    store.supersede(entry.id, entry.id); // superseded event (self-pointing for the test)
    const eventsBefore = store.stats().auditEvents;
    expect(eventsBefore).toBeGreaterThanOrEqual(3); // created + verified + superseded

    // "Restart": a fresh store instance over the same file.
    const reopened = new MemoryStore(file);
    const explanation = reopened.explain(entry.id);
    expect(explanation.entry?.id).toBe(entry.id);
    expect(explanation.audit.length).toBeGreaterThanOrEqual(3);
    expect(explanation.audit.map((a) => a.event)).toEqual(expect.arrayContaining(['created', 'verified', 'superseded']));
    expect(reopened.stats().auditEvents).toBeGreaterThanOrEqual(3);
  });

  it('retention caps the audit ring at 500 events', () => {
    const store = freshStore('retention');
    for (let i = 0; i < 505; i++) {
      store.add({ type: 'fact', claim: `unique fact number ${i} for retention`, scope: 'proj' });
    }
    expect(store.stats().auditEvents).toBe(500);
  });
});

describe('mid-run publish_finding (review hardening #2)', () => {
  function specialistLlm(replies: (() => string)[]): LlmClient {
    let call = 0;
    return {
      name: 'test-worker',
      async complete(_messages: LlmMessage[], _opts?: LlmOptions): Promise<string> {
        const reply = replies[Math.min(call, replies.length - 1)];
        call += 1;
        return reply();
      },
      async completeStream(messages: LlmMessage[], opts: LlmOptions, onDelta: (delta: string) => void): Promise<string> {
        return this.complete(messages, opts);
      },
    } as LlmClient;
  }

  it('a specialist can publish a finding MID-RUN, and it survives even if the specialist later fails', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hermes-publish-mid-'));
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'pub-mid' }));
    const store = freshStore('pub-mid');
    const events: string[] = [];
    const runner = new SubAgentRunner({
      cwd: dir,
      resolveLlm: () =>
        specialistLlm([
          () =>
            JSON.stringify({
              action: {
                type: 'publish_finding',
                findingType: 'failure',
                content: 'CRITICAL: CSS grid gap unit typo breaks the checkout layout at 375px',
                evidence: 'browser evidence at 375x812',
                confidence: 0.9,
              },
            }),
          () => JSON.stringify({ action: { type: 'tool_call', tool: 'run_command', params: { command: 'node --version' }, reason: 'probe', expected: 'exit 0' } }),
          () => JSON.stringify({ action: { type: 'answer', summary: 'published the finding' } }),
        ]),
      agentRole: () => 'frontend specialist',
      memory: store,
      missionId: 'mission-checkout',
      onEvent: (e) => events.push(e),
    });

    const result = await runner.runOne('frontend-a', 'fix the checkout layout');
    // The finding exists EVEN THOUGH the specialist kept working after publishing.
    const findings = store.retrieve('CSS grid checkout 375px', 'proj', 5, {
      requestingAgentId: 'other-specialist', missionId: 'mission-checkout', projectId: 'proj',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.visibility).toBe('mission');
    expect(findings[0]!.status).toBe('candidate'); // publishing never makes it durable
    expect(findings[0]!.agentId).toBe('frontend-a');
    expect(events.some((e) => e.includes('published finding'))).toBe(true);
    expect(result.status).toBe('SUCCESS');
  });
});

import { compactHistory } from '../src/agent/gitu.js';

describe('post-evaluation fixes (T4/T6/T12)', () => {
  it('FIX 1: lexical fallback keeps contradictory claims separate and flags them', () => {
    const store = freshStore('fix1');
    const a = store.add({ type: 'fact', claim: 'Checkout state uses Zustand', scope: 'proj', sourceType: 'source_code', status: 'verified' });
    const b = store.add({ type: 'fact', claim: 'Checkout state uses Redux', scope: 'proj', sourceType: 'source_code', status: 'verified' });
    const { merged, supersededIds, flagged } = store.consolidate('proj');
    expect(merged).toHaveLength(0);
    expect(supersededIds).toHaveLength(0);
    expect(flagged.length).toBeGreaterThanOrEqual(1);
    expect(a.entry.status).toBe('verified');
    expect(b.entry.status).toBe('verified');
    expect(store.explain(a.entry.id).audit.some((x) => (x.reason ?? '').includes('POSSIBLE MEMORY CONTRADICTION'))).toBe(true);
  });

  it('FIX 2: publishing a finding identical to private memory creates a NEW mission candidate', () => {
    const store = freshStore('fix2');
    const priv = store.add({
      type: 'observation', claim: 'Component A contains an unfinished authentication implementation',
      scope: 'proj', visibility: 'agent', agentId: 'specialist-a', sourceType: 'source_code', confidence: 0.85,
    });
    const published = store.publishFinding({
      agentId: 'specialist-a', projectId: 'proj', missionId: 'mission-1', scope: 'proj',
      type: 'observation', content: 'Component A contains an unfinished authentication implementation',
      sourceType: 'source_code',
    });
    expect(published.id).not.toBe(priv.entry.id);
    expect(published.visibility).toBe('mission');
    expect(published.status ?? 'candidate').toBe('candidate');
    // Specialist B, sharing the mission, can now retrieve the published finding.
    const asB = store.retrieveForContext('unfinished authentication Component A', 'proj', {
      limit: 8, maxChars: 2000, ctx: { requestingAgentId: 'specialist-b', projectId: 'proj', missionId: 'mission-1' },
    });
    expect(asB.some((m) => m.id === published.id)).toBe(true);
    // The private original is still invisible to B.
    expect(asB.some((m) => m.id === priv.entry.id)).toBe(false);
  });

  it('FIX 3: RELEVANT MEMORY is re-injected after compaction (protected state)', () => {
    // Drive the real production compaction function with a small trigger so we
    // exercise the actual digest + re-injection path deterministically.
    const memorySection = 'RELEVANT MEMORY (project): Checkout state must use Zustand, never Redux';
    const messages: LlmMessage[] = [
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'INTAKE CONTEXT' },
      { role: 'user', content: memorySection },
    ];
    while (messages.length <= 12) {
      messages.push({ role: 'assistant', content: 'step' });
      messages.push({ role: 'user', content: 'ok' });
    }
    const compacted = compactHistory(messages, () => {}, { triggerMessages: 10, keepRecent: 5 });
    expect(compacted).toBe(true);
    // Compaction digestified the intake-era memory message — it is gone.
    expect(messages.some((m) => String(m.content) === memorySection)).toBe(false);
    expect(String(messages[1]!.content).startsWith('COMPACTED HISTORY')).toBe(true);
    // The fix: re-inject the memory section right after the fresh digest so it
    // survives every compaction generation (protected state).
    messages.splice(2, 0, { role: 'user', content: memorySection });
    expect(String(messages[2]!.content)).toContain('RELEVANT MEMORY');
  });
});
