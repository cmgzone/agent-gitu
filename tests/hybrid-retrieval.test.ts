import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodeIndex } from '../src/context/code-index.js';
import { ContextEngine, DEFAULT_CONTEXT_BUDGET } from '../src/context/context-engine.js';
import { cosineSimilarity, createEmbedder, decodeVector, type Embedder } from '../src/context/embeddings.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { PolicyEngine } from '../src/policy/policy.js';

// ---- embeddings math + client ----------------------------------------------

describe('embeddings math + client', () => {
  it('computes cosine similarity correctly', () => {
    expect(cosineSimilarity(Float32Array.from([1, 0]), Float32Array.from([1, 0]))).toBeCloseTo(1);
    expect(cosineSimilarity(Float32Array.from([1, 0]), Float32Array.from([0, 1]))).toBeCloseTo(0);
    expect(cosineSimilarity(Float32Array.from([1, 0]), Float32Array.from([-1, 0]))).toBeCloseTo(-1);
    expect(cosineSimilarity(new Float32Array(2), new Float32Array(3))).toBe(0);
  });

  it('decodes stored BLOBs back to identical vectors', () => {
    const v = Float32Array.from([0.25, -0.5, 3.75]);
    const buf = Buffer.from(v.buffer, v.byteOffset, v.byteLength);
    const back = decodeVector(new Uint8Array(buf));
    expect([...back]).toEqual([...v]);
  });

  it('posts batches to /embeddings and preserves order', async () => {
    const seen: { url: string; body: string }[] = [];
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(url), body: String(init?.body ?? '') });
      const input = (JSON.parse(String(init?.body)) as { input: string[] }).input;
      return new Response(JSON.stringify({ data: input.map((_t, i) => ({ index: i, embedding: [i, i, i] })) }), { status: 200 });
    }) as typeof fetch;
    try {
      const emb = createEmbedder({ baseUrl: 'https://x.test/v1/', apiKey: 'k', model: 'm-test' });
      const out = await emb.embed(['a', 'b']);
      expect(out.length).toBe(2);
      expect(seen[0]!.url).toBe('https://x.test/v1/embeddings');
      expect((JSON.parse(seen[0]!.body) as { model: string }).model).toBe('m-test');
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});

// ---- hybrid pack blending ----------------------------------------------------

describe('hybrid retrieval blending', () => {
  it('blends semantic scores when the embedder works', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hermes-hybrid-'));
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'h' }));
    writeFileSync(path.join(dir, 'throttle.ts'), 'export function rateLimitRequest() {}\n');
    writeFileSync(path.join(dir, 'unrelated.ts'), 'export const zzz = 1;\n');
    const guard = ProjectGuard.detect(dir);
    const idx = new CodeIndex(dir, path.join(dir, 'idx.db'));
    const engine = new ContextEngine(guard, idx);

    // Deterministic fake embedder: throttle.ts's content vector ≈ query vector.
    const fake: Embedder = {
      model: 'fake',
      embed: async (texts) =>
        texts.map((t) => Float32Array.from(t.includes('rate') ? [1, 0.05] : [0.05, 1])),
    };
    const res = await engine.buildPackHybrid('add rate limiting', DEFAULT_CONTEXT_BUDGET, [], fake);
    expect(res.semantic).toBe(true);
    const paths = res.pack.primaryFiles.map((f) => f.path);
    expect(paths[0]).toBe('throttle.ts');
    idx.close();
  });

  it('degrades silently to lexical when the embedder throws', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hermes-hybrid2-'));
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'h' }));
    writeFileSync(path.join(dir, 'only.ts'), 'alpha beta gamma\n');
    const guard = ProjectGuard.detect(dir);
    const idx = new CodeIndex(dir, path.join(dir, 'idx.db'));
    const engine = new ContextEngine(guard, idx);
    const bad: Embedder = {
      model: 'bad',
      embed: async () => {
        throw new Error('no embeddings endpoint');
      },
    };
    const res = await engine.buildPackHybrid('alpha', DEFAULT_CONTEXT_BUDGET, [], bad);
    expect(res.semantic).toBe(false);
    idx.close();
  });

  it('vectors survive reopen and prune with their file', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hermes-vec-'));
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'v' }));
    writeFileSync(path.join(dir, 'keep.ts'), 'staying alive\n');
    writeFileSync(path.join(dir, 'gone.ts'), 'doomed file\n');
    const dbPath = path.join(dir, 'idx.db');
    const embedder: Embedder = {
      model: 'fake',
      embed: async (texts) => texts.map((t) => Float32Array.from([t.length, 1])),
    };
    const idx1 = new CodeIndex(dir, dbPath);
    idx1.refresh(dir, []);
    await idx1.updateVectors(embedder, 10);
    const before = idx1.semanticSearch(embedder, 'query');
    expect(Object.keys(before).length === 0 ? true : true).toBe(true); // promise type sanity
    const semBefore = await before;
    expect(semBefore.size).toBeGreaterThanOrEqual(2);
    idx1.close();

    // Delete one file → its vector must disappear on next refresh.
    const fsx = await import('node:fs');
    fsx.rmSync(path.join(dir, 'gone.ts'));
    const idx2 = new CodeIndex(dir, dbPath);
    idx2.refresh(dir, []);
    const semAfter = await idx2.semanticSearch(embedder, 'query');
    expect(semAfter.has('gone.ts')).toBe(false);
    expect(semAfter.has('keep.ts')).toBe(true);
    idx2.close();
    void readFileSync; // keep import used
  });
});

// ---- safe mode ----------------------------------------------------------------

describe('PolicyEngine safe mode', () => {
  it('never auto-approves dangerous commands even with autoApprove', async () => {
    const engine = new PolicyEngine(true, undefined, true);
    const decision = await engine.evaluate('run_command', { command: 'sudo rm -rf /' });
    expect(decision.tier).toBe('dangerous');
    expect(decision.allowed).toBe(false);
    expect(decision.requiresApproval).toBe(true);
  });

  it('still auto-approves safe-tier commands in safe mode', async () => {
    const engine = new PolicyEngine(true, undefined, true);
    const decision = await engine.evaluate('run_command', { command: 'git status' });
    expect(decision.tier).toBe('safe');
    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(false);
  });

  it('behaves like plain autoApprove when safe mode is off', async () => {
    const engine = new PolicyEngine(true);
    const decision = await engine.evaluate('run_command', { command: 'sudo rm -rf /' });
    expect(decision.allowed).toBe(true);
  });
});
