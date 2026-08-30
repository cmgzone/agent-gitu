import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import type { ProjectLock, WorkspaceAuthority } from '../types.js';
import { nowIso, readJson, writeJson } from '../util.js';

const MARKER_FILES = ['package.json', 'pyproject.toml', 'cargo.toml', 'go.mod', 'pom.xml', 'build.gradle'];
const DEFAULT_IGNORES = ['node_modules', 'dist', 'build', 'out', 'coverage', '.git', '.venv', '__pycache__', 'target', '.hermes'];

export class ProjectGuardError extends Error {}

function tryGit(repoRoot: string, args: string[]): string | undefined {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
}

function canonicalPath(candidate: string): string {
  try {
    return realpathSync(candidate);
  } catch {
    return path.resolve(candidate);
  }
}

/**
 * Worktrees have two meaningful roots: their writable checkout and the
 * common repository which owns the Git object database. Keeping both in the
 * lock prevents a later executor/verifier split from silently writing A and
 * reading B.
 */
function discoverWorkspaceAuthority(projectRoot: string): WorkspaceAuthority {
  const writableRoot = canonicalPath(projectRoot);
  const worktreeRoot = canonicalPath(tryGit(writableRoot, ['rev-parse', '--show-toplevel']) || writableRoot);
  const commonGitDir = tryGit(writableRoot, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  let repositoryRoot = worktreeRoot;
  if (commonGitDir) {
    const common = canonicalPath(commonGitDir);
    // Standard and linked worktrees both point at <main>/.git here. Do not
    // guess for bare/custom layouts where that relationship is not true.
    if (path.basename(common).toLowerCase() === '.git') repositoryRoot = canonicalPath(path.dirname(common));
  }
  return { repositoryRoot, worktreeRoot, writableRoot };
}

function findRepoRoot(startDir: string): { root: string; marker?: string } | undefined {
  let dir = path.resolve(startDir);
  for (;;) {
    for (const marker of MARKER_FILES) {
      if (existsSync(path.join(dir, marker))) return { root: dir, marker };
    }
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

interface PackageJson {
  name?: string;
  main?: string;
  bin?: string | Record<string, string>;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function pickScript(scripts: Record<string, string>, candidates: string[]): string | undefined {
  for (const c of candidates) {
    if (scripts[c]) return `npm run ${c}`;
  }
  return undefined;
}

function detectTechStack(pkg: PackageJson): string[] {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const stack: string[] = [];
  const known: [string, string][] = [
    ['typescript', 'typescript'],
    ['react', 'react'],
    ['electron', 'electron'],
    ['vite', 'vite'],
    ['vitest', 'vitest'],
    ['jest', 'jest'],
    ['express', 'express'],
    ['next', 'next'],
    ['vue', 'vue'],
    ['svelte', 'svelte'],
  ];
  for (const [dep, label] of known) {
    if (deps[dep]) stack.push(label);
  }
  if (Object.keys(deps).length === 0 && pkg.scripts) stack.push('node');
  return stack;
}

function detectEntrypoints(root: string, pkg: PackageJson): string[] {
  const found: string[] = [];
  const candidates = [
    pkg.main,
    typeof pkg.bin === 'string' ? pkg.bin : undefined,
    'src/index.ts',
    'src/main.ts',
    'src/cli.ts',
    'src/index.js',
    'index.js',
    'main.py',
    'src/main.rs',
  ];
  for (const c of candidates) {
    if (c && existsSync(path.join(root, c))) found.push(c.replace(/\\/g, '/'));
  }
  return [...new Set(found)];
}

export class ProjectGuard {
  private constructor(
    public readonly lock: ProjectLock,
    private readonly lockFile: string,
  ) {}

  static detect(cwd: string): ProjectGuard {
    const located = findRepoRoot(cwd);
    if (!located) {
      throw new ProjectGuardError(
        `No project marker found at or above ${cwd}. Hermes refuses to act without a locked project scope.`,
      );
    }
    const { root: locatedRoot, marker } = located;
    const root = canonicalPath(locatedRoot);
    const workspace = discoverWorkspaceAuthority(root);

    let branch = tryGit(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (!branch && tryGit(root, ['rev-parse', '--is-inside-work-tree']) === 'true') {
      branch = undefined;
    }

    let name = path.basename(root);
    let pkg: PackageJson = {};
    const pkgPath = path.join(root, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as PackageJson;
        if (pkg.name) name = pkg.name;
      } catch {
        pkg = {};
      }
    }

    const scripts = pkg.scripts ?? {};
    const lock: ProjectLock = {
      name,
      repoRoot: root,
      workspace,
      branch,
      techStack: marker === 'package.json' ? detectTechStack(pkg) : [marker ?? 'unknown'],
      entrypoints: detectEntrypoints(root, pkg),
      testCommand: pickScript(scripts, ['test', 'test:unit']),
      buildCommand: pickScript(scripts, ['build']),
      lintCommand: pickScript(scripts, ['lint']),
      typecheckCommand: pickScript(scripts, ['typecheck', 'type-check', 'tsc']),
      ignorePaths: DEFAULT_IGNORES,
      lockedAt: nowIso(),
    };

    return new ProjectGuard(lock, path.join(root, '.hermes', 'project-lock.json'));
  }

  persist(): void {
    writeJson(this.lockFile, this.lock);
  }

  static load(repoRoot: string): ProjectGuard | undefined {
    const lockFile = path.join(repoRoot, '.hermes', 'project-lock.json');
    const data = readJson<ProjectLock>(lockFile);
    if (!data) return undefined;
    return new ProjectGuard(data, lockFile);
  }

  /** The canonical target that all executor file operations must share. */
  get activeWritableRoot(): string {
    return this.lock.workspace?.writableRoot ?? this.lock.repoRoot;
  }

  get workspace(): WorkspaceAuthority {
    return (
      this.lock.workspace ?? {
        repositoryRoot: this.lock.repoRoot,
        worktreeRoot: this.lock.repoRoot,
        writableRoot: this.lock.repoRoot,
      }
    );
  }

  isInsideProject(absPath: string): boolean {
    const rel = path.relative(this.activeWritableRoot, path.resolve(absPath));
    return !rel.startsWith('..') && !path.isAbsolute(rel);
  }

  private assertNoSymlinkEscape(absPath: string): void {
    let rootReal: string;
    try {
      rootReal = realpathSync(this.activeWritableRoot);
    } catch {
      return;
    }
    let probe = path.resolve(absPath);
    for (;;) {
      if (existsSync(probe)) {
        let real: string;
        try {
          real = realpathSync(probe);
        } catch {
          return;
        }
        const rel = path.relative(rootReal, real);
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
          throw new ProjectGuardError(
            `Path ${absPath} resolves outside the locked project ${this.lock.name} (symlink escape).`,
          );
        }
        return;
      }
      const parent = path.dirname(probe);
      if (parent === probe) return;
      probe = parent;
    }
  }

  assertInside(absPath: string): void {
    if (!this.isInsideProject(absPath)) {
      throw new ProjectGuardError(
        `Path ${absPath} is outside the locked project ${this.lock.name} (${this.lock.repoRoot}).`,
      );
    }
    // Windows filesystems are case-insensitive: textual comparison would let
    // ".HERMES/..." or "NODE_MODULES/x" bypass protection. Case-fold there.
    const fold = (s: string): string => (process.platform === 'win32' ? s.toLowerCase() : s);
    const rel = path.relative(this.activeWritableRoot, path.resolve(absPath));
    const foldedRel = fold(rel);
    if (foldedRel === '.hermes' || foldedRel.startsWith(`.hermes${path.sep}`)) {
      throw new ProjectGuardError(
        `Path ${absPath} is inside Hermes' private state directory (.hermes) and cannot be touched by tools.`,
      );
    }
    const top = foldedRel.split(path.sep)[0];
    if (top && this.lock.ignorePaths.some((p) => fold(p) === top)) {
      throw new ProjectGuardError(`Path ${absPath} is inside an ignored directory (${top}).`);
    }
    this.assertNoSymlinkEscape(absPath);
  }

  resolve(relOrAbs: string): string {
    const abs = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(this.activeWritableRoot, relOrAbs);
    return path.resolve(abs);
  }

  toRelative(absPath: string): string {
    return path.relative(this.activeWritableRoot, absPath).replace(/\\/g, '/');
  }
}
