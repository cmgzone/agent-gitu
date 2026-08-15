import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyRole, ContextEngine, tokenize } from '../src/context/context-engine.js';
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
});
