import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/memory/memory-store.js';
import type { MemorySearchResult } from '../src/memory/memory-store.js';
import type { Embedder } from '../src/context/embeddings.js';

function freshStore(name: string): MemoryStore {
  const dir = mkdtempSync(path.join(tmpdir(), `search-${name}-`));
  return new MemoryStore(path.join(dir, 'memory.json'));
}

/** Deterministic topic embedding: texts about the cart/zustand topic map
 *  to vector [1,0], everything else to [0,1]. Pure function, no network. */
function topicVec(text: string): Float32Array {
  const v = new Float32Array(2);
  v[/zustand|cart|checkout|store/i.test(text) ? 0 : 1] = 1;
  return v;
}

const fakeEmbedder: Embedder = {
  async embed(texts: string[]) {
    return texts.map((t) => topicVec(t));
  },
} as unknown as Embedder;

async function claims(store: MemoryStore, query: string, options?: Parameters<MemoryStore['search']>[1]) {
  const results = await store.search(query, options);
  return results.map((r) => r.claim);
}

describe('MemoryStore.search', () => {
  it('exact match: normalized case/whitespace-insensitive hit ranks first with relevance 1', async () => {
    const s = freshStore('exact');
    s.add({ type: 'decision', claim: 'Use Zustand for checkout state', scope: 'proj', sourceType: 'user_statement' });
    s.add({ type: 'decision', claim: 'Deploy via GitHub Actions nightly', scope: 'proj', sourceType: 'source_code' });
    const r = await s.search('use ZUSTAND   for checkout state');
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].claim).toBe('Use Zustand for checkout state');
    expect(r[0].score).toBeGreaterThan(0.8);
  });

  it('lexical partial overlap ranks without embeddings (semanticScore absent)', async () => {
    const s = freshStore('lexical');
    s.add({ type: 'constraint', claim: 'Never commit secrets to the repository', scope: 'proj', sourceType: 'user_statement' });
    s.add({ type: 'decision', claim: 'Prefer pnpm workspaces over npm', scope: 'proj', sourceType: 'source_code' });
    const r = await s.search('secrets repository');
    expect(r).toHaveLength(1);
    expect(r[0].claim).toContain('secrets');
    expect(r[0].matchReason).toBe('lexical');
    expect(r[0].semanticScore).toBeUndefined();
    expect(r[0].lexicalScore).toBeGreaterThan(0);
  });

  it('stopword-only queries return nothing — memories cannot qualify on stopword overlap alone', async () => {
    const s = freshStore('stopwords');
    s.add({ type: 'observation', claim: 'That build was slow from the cache and the network', scope: 'proj', sourceType: 'model_inference' });
    const r = await s.search('that this are from fix add make');
    expect(r).toHaveLength(0);
  });

  it('unrelated queries return empty results (relevance gate)', async () => {
    const s = freshStore('empty');
    s.add({ type: 'decision', claim: 'Use Zustand for checkout state', scope: 'proj', sourceType: 'user_statement', importance: 1 });
    const r = await s.search('kubernetes ingress controller');
    expect(r).toHaveLength(0);
  });

  it('unrelated HIGH-importance memory never dominates: gate excludes it entirely', async () => {
    const s = freshStore('ranking');
    s.add({ type: 'decision', claim: 'Use Zustand for checkout state', scope: 'proj', sourceType: 'user_statement', importance: 0.3 });
    s.add({ type: 'constraint', claim: 'Kubernetes cluster must run in eu-west', scope: 'proj', sourceType: 'user_statement', importance: 1, confidence: 1 });
    const r = await s.search('zustand checkout');
    expect(r.map((x) => x.claim)).toEqual(['Use Zustand for checkout state']);
  });

  it('limit caps ranked output', async () => {
    const s = freshStore('limit');
    for (let i = 0; i < 5; i++) {
      s.add({ type: 'observation', claim: `Zustand store number ${i} handles checkout`, scope: 'proj', sourceType: 'task_completion' });
    }
    const r = await s.search('zustand checkout', { limit: 2 });
    expect(r).toHaveLength(2);
  });

  it('filters: scope, visibility, agentId, projectId, type, status', async () => {
    const s = freshStore('filters');
    s.add({ type: 'decision', claim: 'Zustand powers checkout state here', scope: 'alpha', sourceType: 'user_statement' });
    s.add({ type: 'decision', claim: 'Zustand powers cart state in beta too', scope: 'beta', sourceType: 'user_statement' });
    s.add({ type: 'constraint', claim: 'Zustand selectors must be memoized', scope: 'alpha', sourceType: 'source_code', status: 'verified' });
    // scope filter
    expect(await claims(s, 'zustand', { scope: 'beta' })).toEqual(['Zustand powers cart state in beta too']);
    // type filter
    const typed = await s.search('zustand', { type: 'constraint' });
    expect(typed.map((r) => r.type)).toEqual(['constraint']);
    s.add({ type: 'observation', claim: 'Zustand devtools logging quirk noted', scope: 'alpha', sourceType: 'model_inference' });
    // status filter (user_statement/source_code auto-promote to verified)
    const verified = await s.search('zustand', { status: 'verified' });
    expect(verified.map((r) => r.status)).toEqual(['verified', 'verified', 'verified']);
    const candidates = await s.search('zustand', { status: 'candidate' });
    expect(candidates.map((r) => r.status)).toEqual(['candidate']);
    // visibility filter
    const vis = await s.search('zustand', { visibility: 'project' });
    expect(vis.length).toBe(4);
    // agentId filter on agent-private entries
    s.add({ type: 'note', claim: 'Zustand middleware debugging trick', scope: 'alpha', visibility: 'agent', agentId: 'agent-a', sourceType: 'model_inference' });
    const mine = await s.search('zustand', { agentId: 'agent-a', ctx: { requestingAgentId: 'agent-a', allowedScopes: ['agent', 'project'] } });
    expect(mine.map((r) => r.agentId)).toEqual(['agent-a']);
    // projectId filter
    const proj = await s.search('zustand', { projectId: 'alpha' });
    expect(proj.every((r) => r.scope === 'alpha')).toBe(true);
  });

  it('authorization BEFORE selection: agent-private hidden from other agents, visible to owner', async () => {
    const s = freshStore('isolation');
    s.add({ type: 'note', claim: 'Private redux migration checklist draft', scope: 'proj', visibility: 'agent', agentId: 'agent-a', sourceType: 'model_inference' });
    const asA = await s.search('redux migration', { ctx: { requestingAgentId: 'agent-a', allowedScopes: ['agent', 'project'] } });
    expect(asA).toHaveLength(1);
    const asB = await s.search('redux migration', { ctx: { requestingAgentId: 'agent-b', allowedScopes: ['agent', 'project'] } });
    expect(asB).toHaveLength(0);
  });

  it('published mission findings are visible to other specialists', async () => {
    const s = freshStore('published');
    s.add({ type: 'finding', claim: 'Published: flaky test isolated to timezone parsing', scope: 'mission-42', visibility: 'mission', missionId: 'mission-42', projectId: 'proj', sourceType: 'task_completion' });
    const asB = await s.search('flaky test timezone', { ctx: { requestingAgentId: 'agent-b', missionId: 'mission-42', projectId: 'proj', allowedScopes: ['mission', 'project'] } });
    expect(asB).toHaveLength(1);
    expect(asB[0].visibility).toBe('mission');
  });

  it('identical private + published memories COEXIST as distinct rows (visibility-aware dedup)', async () => {
    const s = freshStore('coexist');
    const priv = s.add({ type: 'finding', claim: 'Rate limiter needs jittered backoff', scope: 'mission-7', visibility: 'agent', agentId: 'agent-a', sourceType: 'model_inference' });
    const pub = s.add({ type: 'finding', claim: 'Rate limiter needs jittered backoff', scope: 'mission-7', visibility: 'mission', missionId: 'mission-7', projectId: 'proj', sourceType: 'task_completion' });
    expect(priv.created).toBe(true);
    expect(pub.created).toBe(true);
    expect(priv.entry.id).not.toBe(pub.entry.id);
    // Owner sees both; another agent sees only the published one.
    const asA = await s.search('jittered backoff', { ctx: { requestingAgentId: 'agent-a', missionId: 'mission-7', projectId: 'proj', allowedScopes: ['agent', 'mission', 'project'] } });
    expect(asA).toHaveLength(2);
    const asB = await s.search('jittered backoff', { ctx: { requestingAgentId: 'agent-b', missionId: 'mission-7', projectId: 'proj', allowedScopes: ['agent', 'mission', 'project'] } });
    expect(asB).toHaveLength(1);
    expect(asB[0].visibility).toBe('mission');
  });

  it('candidate/superseded/contradictory memories returned with status and provenance intact', async () => {
    const s = freshStore('statuses');
    s.add({ type: 'decision', claim: 'Cache invalidation via event bus', scope: 'proj', sourceType: 'model_inference', status: 'candidate', source: 'inferred from logs' });
    s.add({ type: 'decision', claim: 'Cache invalidation via manual purge', scope: 'proj', sourceType: 'user_statement', status: 'superseded', source: 'old approach' });
    s.add({ type: 'decision', claim: 'Cache invalidation via TTL expiry', scope: 'proj', sourceType: 'test', status: 'verified', source: 'unit test evidence' });
    const r = await s.search('cache invalidation');
    expect(r).toHaveLength(3);
    const statuses = new Set(r.map((x) => x.status));
    expect(statuses).toEqual(new Set(['candidate', 'superseded', 'verified']));
    expect(r.every((x) => typeof x.provenance === 'string' && x.provenance.length > 0)).toBe(true);
    // No silent merging: three distinct ids.
    expect(new Set(r.map((x) => x.id)).size).toBe(3);
  });

  it('structured result shape carries every promised field', async () => {
    const s = freshStore('shape');
    const { entry } = s.add({ type: 'decision', claim: 'Use Vitest for unit testing', scope: 'proj', sourceType: 'model_inference', confidence: 0.8, importance: 0.6, source: 'inferred from config inspection' });
    const r: MemorySearchResult[] = await s.search('vitest unit testing');
    expect(r).toHaveLength(1);
    const x = r[0];
    expect(x.id).toBe(entry.id);
    expect(x.claim).toBe('Use Vitest for unit testing');
    expect(x.type).toBe('decision');
    expect(x.scope).toBe('proj');
    expect(x.visibility).toBe('project');
    expect(x.confidence).toBeCloseTo(0.8);
    expect(x.importance).toBeCloseTo(0.6);
    expect(x.status).toBe('candidate');
    expect(x.sourceType).toBe('model_inference');
    expect(x.provenance).toBe('inferred from config inspection');
    expect(typeof x.createdAt).toBe('string');
    expect(typeof x.updatedAt).toBe('string');
    expect(x.score).toBeGreaterThan(0);
    expect(x.matchReason).toBe('lexical');
  });

  it('with embeddings configured: paraphrase matches semantically even with low lexical overlap', async () => {
    const s = freshStore('semantic');
    s.setEmbedder(fakeEmbedder);
    s.add({ type: 'decision', claim: 'State management for the shopping cart uses zustand library', scope: 'proj', sourceType: 'user_statement' });
    s.add({ type: 'decision', claim: 'Postgres row level security protects tenant data', scope: 'proj', sourceType: 'source_code' });
    const r = await s.search('how is the cart state handled');
    expect(r.length).toBeGreaterThan(0);
    expect(r[0].claim).toContain('zustand');
    expect(r[0].matchReason).toBe('semantic');
    expect(r[0].semanticScore).toBeGreaterThanOrEqual(0.5);
  });

  it('embedding failure degrades safely to lexical-only results', async () => {
    const s = freshStore('degrade');
    s.setEmbedder({
      async embed() {
        throw new Error('endpoint down');
      },
    } as unknown as Embedder);
    s.add({ type: 'decision', claim: 'Retry queue uses exponential backoff', scope: 'proj', sourceType: 'source_code' });
    const r = await s.search('exponential backoff retry');
    expect(r).toHaveLength(1);
    expect(r[0].matchReason).toBe('lexical');
    expect(r[0].semanticScore).toBeUndefined();
  });
});
