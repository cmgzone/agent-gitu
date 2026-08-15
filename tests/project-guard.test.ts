import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectGuard, ProjectGuardError } from '../src/guard/project-guard.js';

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

  it('persists and reloads the lock', () => {
    const dir = makeProject('guard-persist', { name: 'guard-persist' });
    const guard = ProjectGuard.detect(dir);
    guard.persist();
    const reloaded = ProjectGuard.load(path.resolve(dir));
    expect(reloaded?.lock.name).toBe('guard-persist');
  });
});
