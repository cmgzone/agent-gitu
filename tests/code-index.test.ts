import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodeIndex, localImportSpecifiers, resolveLocalImport } from '../src/context/code-index.js';

function tempRepo(): { repo: string; db: string } {
  return {
    repo: mkdtempSync(path.join(tmpdir(), 'hermes-idx-')),
    db: path.join(mkdtempSync(path.join(tmpdir(), 'hermes-idxdb-')), 'code-index.db'),
  };
}

describe('CodeIndex', () => {
  it('builds once, persists across reopens, and skips ignored paths', () => {
    const { repo, db } = tempRepo();
    mkdirSync(path.join(repo, 'src'), { recursive: true });
    mkdirSync(path.join(repo, 'node_modules', 'x'), { recursive: true });
    writeFileSync(path.join(repo, 'src', 'renderer.ts'), 'export const streaming = "webui";');
    writeFileSync(path.join(repo, 'src', 'billing.ts'), 'export const billing = () => 1;');
    writeFileSync(path.join(repo, 'node_modules', 'x', 'junk.js'), 'junk');

    const idx = new CodeIndex(repo, db);
    const s1 = idx.refresh(repo, ['node_modules']);
    expect(s1.added).toBe(2);
    expect(idx.stats().files).toBe(2);
    const list = idx.fileList();
    expect(list.some((f) => f.path === 'src/renderer.ts')).toBe(true);
    expect(list.some((f) => f.path.includes('node_modules'))).toBe(false);
    idx.close();

    // A fresh instance on the same DB sees the same index with no rework.
    const idx2 = new CodeIndex(repo, db);
    const s2 = idx2.refresh(repo, ['node_modules']);
    expect(s2.added).toBe(0);
    expect(s2.updated).toBe(0);
    expect(s2.removed).toBe(0);
    expect(idx2.fileList().length).toBe(2);
    idx2.close();
  });

  it('detects content changes, additions, and deletions on refresh', async () => {
    const { repo, db } = tempRepo();
    mkdirSync(path.join(repo, 'src'), { recursive: true });
    const target = path.join(repo, 'src', 'helper.ts');
    writeFileSync(target, 'export const version = "v1";');

    const idx = new CodeIndex(repo, db);
    expect(idx.refresh(repo, []).added).toBe(1);

    // changed content (different size + mtime)
    await new Promise((r) => setTimeout(r, 20));
    writeFileSync(target, 'export const version = "v2 long";');
    const s2 = idx.refresh(repo, []);
    expect(s2.updated).toBe(1);

    // added file
    writeFileSync(path.join(repo, 'src', 'new-tool.ts'), 'export const tool = () => "x";');
    const s3 = idx.refresh(repo, []);
    expect(s3.added).toBe(1);

    // deleted file
    await new Promise((r) => setTimeout(r, 20));
    rmSync(target);
    const s4 = idx.refresh(repo, []);
    expect(s4.removed).toBe(1);
    expect(idx.fileList().some((f) => f.path === 'src/helper.ts')).toBe(false);
    expect(idx.fileList().some((f) => f.path === 'src/new-tool.ts')).toBe(true);
    idx.close();
  });

  it('matches goal terms found only in file content', () => {
    const { repo, db } = tempRepo();
    mkdirSync(path.join(repo, 'src'), { recursive: true });
    writeFileSync(path.join(repo, 'src', 'helper-utils.ts'), 'handle retry and backoff with care');
    writeFileSync(path.join(repo, 'src', 'main.ts'), 'export {}');

    const idx = new CodeIndex(repo, db);
    idx.refresh(repo, []);
    const matches = idx.contentMatches(['retry', 'backoff', 'zzz']);
    expect(matches.get('src/helper-utils.ts')).toEqual(new Set(['retry', 'backoff']));
    expect(matches.get('src/main.ts')).toBeUndefined();
    idx.close();
  });

  it('watches the repo and updates the index in the background', async () => {
    const { repo, db } = tempRepo();
    mkdirSync(path.join(repo, 'src'), { recursive: true });
    writeFileSync(path.join(repo, 'src', 'a.ts'), 'export {}');

    const idx = new CodeIndex(repo, db);
    idx.startWatch([], { debounceMs: 50, sweepMs: 5000 });
    expect(idx.isWatched()).toBe(true);
    await idx.refreshAsync(repo, []);
    expect(idx.stats().files).toBe(1);

    await new Promise((r) => setTimeout(r, 100));
    writeFileSync(path.join(repo, 'src', 'b.ts'), 'export const b = () => "fresh content";');
    await expect.poll(() => idx.fileList().some((f) => f.path === 'src/b.ts'), { timeout: 8000 }).toBe(true);
    expect(idx.stats().files).toBe(2);
    expect(idx.contentMatches(['fresh']).get('src/b.ts')).toEqual(new Set(['fresh']));

    idx.stopWatch();
    expect(idx.isWatched()).toBe(false);
    idx.close();
  });

  it('includes safe dotfile configuration but never indexes private agent state', () => {
    const { repo, db } = tempRepo();
    mkdirSync(path.join(repo, '.hermes'), { recursive: true });
    writeFileSync(path.join(repo, '.eslintrc.json'), '{"rules":{"semi":"error"}}');
    writeFileSync(path.join(repo, '.prettierrc'), '{"singleQuote":true}');
    writeFileSync(path.join(repo, '.env'), 'SECRET=do-not-index');
    writeFileSync(path.join(repo, '.hermes', 'memory.json'), '["private"]');

    const idx = new CodeIndex(repo, db);
    idx.refresh(repo, []);
    const files = idx.fileList();
    expect(files.find((f) => f.path === '.eslintrc.json')?.role).toBe('config');
    expect(files.find((f) => f.path === '.prettierrc')?.role).toBe('config');
    expect(files.some((f) => f.path === '.env')).toBe(false);
    expect(files.some((f) => f.path.startsWith('.hermes/'))).toBe(false);
    idx.close();
  });

  it('prunes rows for repos whose directory no longer exists', () => {
    const { repo, db } = tempRepo();
    mkdirSync(path.join(repo, 'src'), { recursive: true });
    writeFileSync(path.join(repo, 'src', 'a.ts'), 'export {}');

    const idx = new CodeIndex(repo, db);
    idx.refresh(repo, []);
    expect(idx.stats().files).toBe(1);
    idx.close();

    rmSync(repo, { recursive: true, force: true });
    const idx2 = new CodeIndex(repo, db);
    idx2.refresh(repo, []); // orphan cleanup now runs with background maintenance
    expect(idx2.stats().files).toBe(0);
    idx2.close();
  });

  it('refreshes off-thread, excludes packaged copies, and keeps later edits fresh', async () => {
    const { repo, db } = tempRepo();
    mkdirSync(path.join(repo, 'src'), { recursive: true });
    for (let i = 0; i < 60; i++) writeFileSync(path.join(repo, 'src', `file-${i}.ts`), `export const value${i} = '${'searchable '.repeat(500)}';`);
    for (const directory of ['dist-build', 'dist-build2']) {
      mkdirSync(path.join(repo, 'app', directory), { recursive: true });
      writeFileSync(path.join(repo, 'app', directory, 'bundle.js'), 'export const duplicate = 1;');
    }
    const idx = new CodeIndex(repo, db);
    let heartbeats = 0;
    const timer = setInterval(() => {
      heartbeats++;
    }, 5);
    try {
      const first = idx.refreshAsync(repo, []);
      expect(idx.refreshAsync(repo, [])).toBe(first);
      expect((await first).added).toBe(60);
      expect(heartbeats).toBeGreaterThan(2);
      expect(idx.fileList().every((file) => file.path.startsWith('src/'))).toBe(true);
      writeFileSync(path.join(repo, 'src', 'file-0.ts'), 'export const diagnosticCorrection = true;');
      expect((await idx.refreshAsync(repo, [])).updated).toBe(1);
      expect(idx.contentMatches(['diagnostic']).has('src/file-0.ts')).toBe(true);
    } finally {
      clearInterval(timer);
      idx.close();
    }
  });

  it('settles a queued refresh when its index is closed', async () => {
    const { repo, db } = tempRepo();
    const idx = new CodeIndex(repo, db);
    const pending = idx.refreshAsync(repo, []);
    idx.close();
    await expect(pending).rejects.toThrow(/closed|stopped/);
  });

  it('does not index files reached through a directory symlink', async () => {
    const { repo, db } = tempRepo();
    const outside = mkdtempSync(path.join(tmpdir(), 'gitu-index-outside-'));
    writeFileSync(path.join(outside, 'private.ts'), 'export const secret = true;');
    symlinkSync(outside, path.join(repo, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
    const idx = new CodeIndex(repo, db);
    try {
      await idx.refreshAsync(repo, []);
      expect(idx.fileList()).toEqual([]);
    } finally {
      idx.close();
    }
  });

  it('indexes local import edges and returns bounded dependency proximity', () => {
    const { repo, db } = tempRepo();
    mkdirSync(path.join(repo, 'src', 'shared'), { recursive: true });
    writeFileSync(path.join(repo, 'src', 'feature.ts'), "import { helper } from './shared/helper.js';\nexport const feature = helper;");
    writeFileSync(path.join(repo, 'src', 'shared', 'helper.ts'), "import { format } from './format';\nexport const helper = format;");
    writeFileSync(path.join(repo, 'src', 'shared', 'format.ts'), 'export const format = 1;');

    const idx = new CodeIndex(repo, db);
    idx.refresh(repo, []);

    expect(idx.stats().imports).toBe(2);
    const scores = idx.dependencyScores(['src/feature.ts']);
    expect(scores.get('src/shared/helper.ts')).toBe(1);
    expect(scores.get('src/shared/format.ts')).toBeGreaterThan(0);
    expect(scores.get('src/shared/format.ts')).toBeLessThan(scores.get('src/shared/helper.ts') ?? 1);
    idx.close();
  });

  it('keeps import parsing local and resolves TypeScript runtime specifiers safely', () => {
    expect(localImportSpecifiers("import lib from 'library'; import { x } from './local.js'; const y = require('../util');")).toEqual(['./local.js', '../util']);
    const files = new Set(['src/local.ts', 'util.ts']);
    expect(resolveLocalImport('src/main.ts', './local.js', files)).toBe('src/local.ts');
    expect(resolveLocalImport('src/main.ts', '../../secret', files)).toBeUndefined();
  });
});
