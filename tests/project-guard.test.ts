import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectGuard, ProjectGuardError } from '../src/guard/project-guard.js';
import { toolListFiles, toolReadFile, toolSearchFiles, toolWriteFile } from '../src/tools/tools.js';

const TEMP_ROOT = path.join(tmpdir(), 'hermes-tests');

function makeProject(name: string, pkg: Record<string, unknown>): string {
  const dir = path.join(TEMP_ROOT, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2));
  return dir;
}

describe('ProjectGuard', () => {
  beforeEach(() => {
    mkdirSync(TEMP_ROOT, { recursive: true });
  });

  it('detects the same project authority asynchronously', async () => {
    const dir = makeProject('guard-async', { name: 'guard-async', scripts: { test: 'vitest run' } });
    const sync = ProjectGuard.detect(dir);
    const asyncGuard = await ProjectGuard.detectAsync(dir);
    expect(asyncGuard.lock).toMatchObject({ ...sync.lock, lockedAt: asyncGuard.lock.lockedAt });
    expect(() => asyncGuard.assertInside(path.join(dir, 'node_modules', 'x'))).toThrow();
  });

  it('detects project root, name, and npm scripts', () => {
    const dir = makeProject('guard-basic', {
      name: 'guard-basic',
      scripts: { test: 'vitest run', build: 'tsc', lint: 'eslint .', typecheck: 'tsc --noEmit' },
      dependencies: { react: '^18' },
      devDependencies: { typescript: '^5' },
    });
    const guard = ProjectGuard.detect(dir);
    expect(guard.lock.name).toBe('guard-basic');
    expect(guard.lock.repoRoot).toBe(path.resolve(dir));
    expect(guard.lock.testCommand).toBe('npm run test');
    expect(guard.lock.buildCommand).toBe('npm run build');
    expect(guard.lock.typecheckCommand).toBe('npm run typecheck');
    expect(guard.lock.techStack).toContain('react');
    expect(guard.lock.techStack).toContain('typescript');
  });

  it('detects from a nested directory', () => {
    const dir = makeProject('guard-nested', { name: 'guard-nested' });
    const nested = path.join(dir, 'src', 'deep');
    mkdirSync(nested, { recursive: true });
    const guard = ProjectGuard.detect(nested);
    expect(guard.lock.repoRoot).toBe(path.resolve(dir));
  });

  it('refuses to lock when no project marker exists', () => {
    const bare = mkdtempSync(path.join(TEMP_ROOT, 'bare-'));
    expect(() => ProjectGuard.detect(bare)).toThrow(ProjectGuardError);
  });

  it('enforces the project boundary for paths', () => {
    const dir = makeProject('guard-bounds', { name: 'guard-bounds' });
    const guard = ProjectGuard.detect(dir);
    expect(guard.isInsideProject(path.join(dir, 'src', 'a.ts'))).toBe(true);
    expect(guard.isInsideProject(path.join(TEMP_ROOT, 'other', 'x.ts'))).toBe(false);
    expect(() => guard.assertInside(path.join(TEMP_ROOT, 'other', 'x.ts'))).toThrow(ProjectGuardError);
    expect(() => guard.assertInside(path.join(dir, 'node_modules', 'x'))).toThrow(ProjectGuardError);
  });

  it('keeps a user-tagged folder read-only until its write permission is granted, then revokes it', () => {
    const dir = makeProject('guard-tagged-read', { name: 'guard-tagged-read' });
    const outside = mkdtempSync(path.join(TEMP_ROOT, 'tagged-reference-'));
    const note = path.join(outside, 'note.txt');
    writeFileSync(note, 'reference');
    const privateDir = path.join(outside, '.git');
    mkdirSync(privateDir);
    writeFileSync(path.join(privateDir, 'config'), 'private');
    const guard = ProjectGuard.detect(dir);
    let folders = [outside];
    expect(() => guard.assertReadable(note)).toThrow(ProjectGuardError);
    guard.setTaggedReadFolders(() => folders);
    expect(() => guard.assertReadable(note)).not.toThrow();
    const context = { guard, cwd: dir };
    expect(toolReadFile(context, { path: note }).output).toContain('reference');
    expect(toolListFiles(context, { path: outside }).output).toContain('note.txt');
    expect(toolSearchFiles(context, { path: outside, pattern: 'reference', mode: 'literal' }).output).toContain('note.txt');
    expect(() => guard.assertInside(note)).toThrow(ProjectGuardError);
    let writable: string[] = [];
    guard.setTaggedWriteFolders(() => writable);
    writable = [outside];
    expect(() => guard.assertInside(note)).not.toThrow();
    expect(() => guard.assertInside(path.join(outside, 'new.txt'))).not.toThrow();
    expect(toolWriteFile(context, { path: path.join(outside, 'new.txt'), content: 'approved' }).ok).toBe(true);
    expect(readFileSync(path.join(outside, 'new.txt'), 'utf8')).toBe('approved');
    expect(() => guard.assertInside(path.join(privateDir, 'config'))).toThrow(ProjectGuardError);
    expect(() => guard.assertInside(path.join(path.dirname(outside), 'sibling.txt'))).toThrow(ProjectGuardError);
    writable = [];
    expect(() => guard.assertInside(note)).toThrow(ProjectGuardError);
    expect(() => guard.assertReadable(path.join(privateDir, 'config'))).toThrow(ProjectGuardError);
    folders = [];
    expect(() => guard.assertReadable(note)).toThrow(ProjectGuardError);
  });

  it('persists and reloads the lock', () => {
    const dir = makeProject('guard-persist', { name: 'guard-persist' });
    const guard = ProjectGuard.detect(dir);
    guard.persist();
    const reloaded = ProjectGuard.load(path.resolve(dir));
    expect(reloaded?.lock.name).toBe('guard-persist');
  });
});
