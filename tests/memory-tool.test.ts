import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/memory/memory-store.js';
import { MemoryEmbeddingCache } from '../src/memory/semantic.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { toolMemory, validateToolParams, type ToolContext } from '../src/tools/tools.js';
import type { MemoryRetrievalContext } from '../src/types.js';

function makeProject(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `hermes-memory-tool-${name}-`));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `memtool-${name}` }, null, 2));
  return dir;
}

function ctx(dir: string, memory: MemoryStore, memoryContext?: MemoryRetrievalContext): ToolContext {
  return { guard: ProjectGuard.detect(dir), cwd: dir, memory, memoryContext };
}

describe('memory tool — schema validation', () => {
  it('rejects unknown actions and missing required fields', () => {
    expect(validateToolParams('memory', {}).valid).toBe(false);
    expect(validateToolParams('memory', { action: 'record_pattern', subject: 'x' }).valid).toBe(false);
    expect(validateToolParams('memory', { action: 'promote' }).valid).toBe(false);
    expect(validateToolParams('memory', { action: 'promote', id: 'mem-1', to: 'durable' }).valid).toBe(false);
    expect(validateToolParams('memory', { action: 'promote', id: 'mem-1', to: 'nonsense' }).valid).toBe(false);
    expect(validateToolParams('memory', { action: 'search' }).valid).toBe(false);
    expect(
      validateToolParams('memory', { action: 'record_verified', type: 'fact', claim: 'c', scope: 's' }).valid,
    ).toBe(false);
  });

  it('accepts well-formed lifecycle calls', () => {
    expect(validateToolParams('memory', { action: 'list' }).valid).toBe(true);
    expect(validateToolParams('memory', { action: 'search', query: 'auth' }).valid).toBe(true);
    expect(validateToolParams('memory', { action: 'promote', id: 'mem-1', to: 'verified', evidence: 'e' }).valid).toBe(true);
    expect(validateToolParams('memory', { action: 'archive', id: 'mem-1' }).valid).toBe(true);
    expect(
      validateToolParams('memory', {
        action: 'record_verified',
        type: 'decision',
        claim: 'use httpOnly cookies',
        scope: 'proj',
        evidence: 'code + passing test',
        replaces: ['mem-0'],
      }).valid,
    ).toBe(true);
    expect(validateToolParams('memory', { action: 'promote_scope', id: 'mem-1', to: 'project' }).valid).toBe(true);
  });
});

describe('memory tool — lifecycle through the tool surface', () => {
  it('lists memories with ids, then promotes candidate → verified with evidence', async () => {
    const dir = makeProject('lifecycle');
    const store = MemoryStore.forProject(dir);
    const { entry } = store.add({ type: 'fact', claim: 'API may use Redis', scope: 'proj', sourceType: 'model_inference' });

    const listed = await toolMemory(ctx(dir, store), { action: 'list' });
    expect(listed.ok).toBe(true);
    expect(listed.output).toContain(entry.id);
    expect(listed.output).toContain('candidate');

    const promoted = await toolMemory(ctx(dir, store), {
      action: 'promote',
      id: entry.id,
      to: 'verified',
      evidence: 'cache layer confirmed in src/api/cache.ts',
    });
    expect(promoted.ok).toBe(true);
    expect(store.query({}).find((e) => e.id === entry.id)?.status).toBe('verified');
  });

  it('record_verified replaces a predecessor (supersession requires evidence)', async () => {
    const dir = makeProject('record-verified');
    const store = MemoryStore.forProject(dir);
    const old = store.add({ type: 'decision', claim: 'auth uses localStorage tokens', scope: 'proj', sourceType: 'source_code' });

    const result = await toolMemory(ctx(dir, store), {
      action: 'record_verified',
      type: 'decision',
      claim: 'auth uses httpOnly cookie sessions',
      scope: 'proj',
      evidence: 'src/auth/session.ts + passing auth tests',
      replaces: [old.entry.id],
    });
    expect(result.ok).toBe(true);
    expect(result.output).toContain(old.entry.id);
    expect((store.query({}).find((e) => e.id === old.entry.id)?.status)).toBe('superseded');
  });

  it('unknown ids fail with an inspect-first hint', async () => {
    const dir = makeProject('unknown-id');
    const store = MemoryStore.forProject(dir);
    const result = await toolMemory(ctx(dir, store), { action: 'archive', id: 'mem-nope' });
    expect(result.ok).toBe(false);
    expect(result.output).toContain('list');
  });

  it('visibility context filters list and search (agent-private stays private)', async () => {
    const dir = makeProject('isolation');
    const store = MemoryStore.forProject(dir);
    store.add({ type: 'fact', claim: 'shared project fact about the build pipeline', scope: 'proj', visibility: 'project', projectId: 'proj' });
    store.add({
      type: 'fact',
      claim: 'frontend specialist private scratch note about carousel',
      scope: 'proj',
      visibility: 'agent',
      agentId: 'frontend-a',
      projectId: 'proj',
    });

    const asMainAgent = await toolMemory(ctx(dir, store, { projectId: 'proj' }), { action: 'list' });
    expect(asMainAgent.output).toContain('build pipeline');
    expect(asMainAgent.output).not.toContain('carousel');

    const asSpecialist = await toolMemory(ctx(dir, store, { requestingAgentId: 'frontend-a', projectId: 'proj' }), {
      action: 'search',
      query: 'carousel',
    });
    expect(asSpecialist.output).toContain('carousel');
  });
});

describe('MemoryEmbeddingCache — bounded growth', () => {
  it('evicts the oldest entries past capacity', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hermes-memcache-'));
    const file = path.join(dir, 'vectors.json');
    const cache = new MemoryEmbeddingCache(file);
    const first = new Float32Array([1, 0, 0]);
    cache.put('model-a', 'first', first);
    for (let i = 0; i < 2_000; i++) {
      cache.put('model-a', `k${i}`, new Float32Array([0, 1, i % 7]));
    }
    // Capacity is 2000: the very first entry was evicted, a middle one remains.
    expect(cache.get('model-a', 'first')).toBeUndefined();
    expect(cache.get('model-a', 'k1500')).toBeDefined();

    // Survives a round-trip without exceeding the cap.
    cache.flush();
    const reloaded = new MemoryEmbeddingCache(file);
    expect(reloaded.get('model-a', 'k1500')).toBeDefined();
    expect(reloaded.get('model-a', 'first')).toBeUndefined();
  });
});
