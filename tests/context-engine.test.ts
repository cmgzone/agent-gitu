import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodeIndex } from '../src/context/code-index.js';
import { classifyRole, contextBudgetForWindow, ContextEngine, DEFAULT_CONTEXT_BUDGET, tokenize } from '../src/context/context-engine.js';
import { ProjectGuard } from '../src/guard/project-guard.js';

describe('classifyRole', () => {
  it('labels files by role', () => {
    expect(classifyRole('src/foo.test.ts')).toBe('test');
    expect(classifyRole('tests/foo.spec.js')).toBe('test');
    expect(classifyRole('src/types.ts')).toBe('interface');
    expect(classifyRole('package.json')).toBe('config');
    expect(classifyRole('vite.config.ts')).toBe('config');
    expect(classifyRole('README.md')).toBe('docs');
    expect(classifyRole('src/render/tool-results.ts')).toBe('implementation');
    expect(classifyRole('dist/bundle.js')).toBe('artifact');
    expect(classifyRole('legacy/old-thing.js')).toBe('legacy');
    expect(classifyRole('src/generated/schema.gen.ts')).toBe('generated');
  });
});

describe('tokenize', () => {
  it('extracts meaningful tokens and drops stopwords', () => {
    const tokens = tokenize('Fix the WebUI streaming renderer!');
    expect(tokens).toContain('webui');
    expect(tokens).toContain('streaming');
    expect(tokens).toContain('renderer');
    expect(tokens).not.toContain('the');
  });
});

describe('contextBudgetForWindow', () => {
  it('uses the existing safe budget when model metadata is unavailable', () => {
    expect(contextBudgetForWindow()).toEqual(DEFAULT_CONTEXT_BUDGET);
  });

  it('scales source context while reserving room for the rest of the conversation', () => {
    expect(contextBudgetForWindow(32_000)).toEqual({ maxFiles: 8, maxBytes: 48_000 });
    // Very large windows are capped: the pack is a grounding sample, not a
    // repo dump (~48K chars ≈ 12K tokens is plenty to plan from).
    expect(contextBudgetForWindow(1_000_000)).toEqual({ maxFiles: 12, maxBytes: 48_000 });
  });
});

describe('ContextEngine', () => {
  it('builds a ranked, role-labeled, budgeted pack', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hermes-ctx-'));
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'ctx-test', main: 'src/main.ts' }));
    mkdirSync(path.join(dir, 'src', 'webui'), { recursive: true });
    mkdirSync(path.join(dir, 'tests'), { recursive: true });
    mkdirSync(path.join(dir, 'node_modules', 'junk'), { recursive: true });
    writeFileSync(path.join(dir, 'src', 'main.ts'), 'export {}');
    writeFileSync(path.join(dir, 'src', 'webui', 'streaming-renderer.ts'), 'export {}');
    writeFileSync(path.join(dir, 'src', 'webui', 'unrelated-billing.ts'), 'export {}');
    writeFileSync(path.join(dir, 'tests', 'streaming.test.ts'), 'export {}');
    writeFileSync(path.join(dir, 'node_modules', 'junk', 'index.js'), 'x');

    const guard = ProjectGuard.detect(dir);
    const engine = new ContextEngine(guard);
    const pack = engine.buildPack('Fix the webui streaming renderer', { maxFiles: 6, maxBytes: 40000 });

    const allPaths = [...pack.primaryFiles, ...pack.testFiles, ...pack.relatedFiles, ...pack.configFiles].map((f) => f.path);
    expect(allPaths.some((p) => p.includes('streaming-renderer'))).toBe(true);
    expect(allPaths.some((p) => p.includes('node_modules'))).toBe(false);
    expect(pack.primaryFiles.length).toBeLessThanOrEqual(6);

    const renderer = pack.primaryFiles.find((f) => f.path.includes('streaming-renderer'));
    const billing = pack.primaryFiles.find((f) => f.path.includes('unrelated-billing'));
    if (renderer && billing) expect(renderer.score).toBeGreaterThan(billing.score);

    const rendered = engine.renderPack(pack);
    expect(rendered).toContain('Primary files');
  });

  it('ranks a file by content via the persistent index when its path does not match the goal', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hermes-ctx-'));
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'ctx-idx', private: true }));
    mkdirSync(path.join(dir, 'src'), { recursive: true });
    writeFileSync(path.join(dir, 'src', 'billing-logic.ts'), 'export const b = () => 1;');
    writeFileSync(path.join(dir, 'src', 'helper-utils.ts'), 'export const f = () => "handle retry and backoff with care";');

    const guard = ProjectGuard.detect(dir);
    const db = path.join(mkdtempSync(path.join(tmpdir(), 'hermes-ctxdb-')), 'code-index.db');
    const engine = new ContextEngine(guard, new CodeIndex(guard.lock.repoRoot, db));
    const pack = engine.buildPack('add retry with backoff', { maxFiles: 4, maxBytes: 40000 });

    const helper = pack.primaryFiles.find((f) => f.path.includes('helper-utils'));
    expect(helper).toBeDefined();
    const billing = pack.primaryFiles.find((f) => f.path.includes('billing-logic'));
    expect(billing).toBeDefined();
    if (helper && billing) expect(helper.score).toBeGreaterThan(billing.score);
  });

  it('refreshes a watched index before building a new context pack', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hermes-ctx-'));
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'ctx-watched', private: true }));
    mkdirSync(path.join(dir, 'src'), { recursive: true });
    writeFileSync(path.join(dir, 'src', 'main.ts'), 'export const main = true;');

    const guard = ProjectGuard.detect(dir);
    const db = path.join(mkdtempSync(path.join(tmpdir(), 'hermes-ctxdb-')), 'code-index.db');
    const index = new CodeIndex(guard.lock.repoRoot, db);
    index.startWatch(guard.lock.ignorePaths, { debounceMs: 5_000, sweepMs: 60_000 });
    writeFileSync(path.join(dir, 'src', 'fresh-context.ts'), 'export const feature = "sprocket";');

    const pack = new ContextEngine(guard, index).buildPack('fix the sprocket feature');
    expect(pack.primaryFiles.some((f) => f.path === 'src/fresh-context.ts')).toBe(true);
    index.stopWatch();
    index.close();
  });

  it('surfaces a graph-connected helper even when its path has no goal terms', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hermes-ctx-'));
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'ctx-graph', private: true }));
    mkdirSync(path.join(dir, 'src', 'infra'), { recursive: true });
    writeFileSync(path.join(dir, 'src', 'checkout.ts'), "import { request } from './infra/transport';\nexport const checkout = request;");
    writeFileSync(path.join(dir, 'src', 'infra', 'transport.ts'), 'export const request = () => true;');
    writeFileSync(path.join(dir, 'src', 'unrelated.ts'), 'export const unrelated = true;');

    const guard = ProjectGuard.detect(dir);
    const db = path.join(mkdtempSync(path.join(tmpdir(), 'hermes-ctxdb-')), 'code-index.db');
    const pack = new ContextEngine(guard, new CodeIndex(guard.lock.repoRoot, db)).buildPack('fix the checkout flow', { maxFiles: 3, maxBytes: 40_000 });
    expect(pack.primaryFiles.some((f) => f.path === 'src/infra/transport.ts')).toBe(true);
  });
});
