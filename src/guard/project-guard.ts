import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectLock, WorkspaceAuthority } from '../types.js';
import { nowIso, readJson, writeJson } from '../util.js';
import { gituHomeRoot } from '../workspace/home.js';

const MARKER_FILES = ['package.json', 'pyproject.toml', 'cargo.toml', 'go.mod', 'pom.xml', 'build.gradle'];
const DEFAULT_IGNORES = ['node_modules', 'dist', 'build', 'out', 'coverage', '.git', '.venv', '__pycache__', 'target', '.hermes'];
const execGit = promisify(execFile);

/**
 * The host-owned access mode. `workspace` keeps every project-boundary rule;
 * `full` is the user's explicit Full Access choice and lifts project-only
 * filesystem restrictions. It is never derived from model output or tool
 * parameters — only from the host's live authorization state.
 */
export type ProjectAccessMode = 'workspace' | 'full';

export interface ProjectGuardAccessOptions {
  /**
   * Re-evaluated for every filesystem decision, so revoking Full Access takes
   * effect at the next tool call instead of the next task.
   */
  accessMode?: () => ProjectAccessMode;
}

export class ProjectGuardError extends Error {}

/** A concrete, user-approved write target outside the locked project. */
export interface ExternalWriteScope {
  path: string;
  real: string;
  directory: boolean;
}

function tryGit(repoRoot: string, args: string[]): string | undefined {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000, windowsHide: true }).trim();
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

/** Fail closed: an unreadable authority never expands access. */
function accessModeIsFull(access?: ProjectGuardAccessOptions): boolean {
  try {
    return access?.accessMode?.() === 'full';
  } catch {
    return false;
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

  /**
   * Set by the host only — never by model-supplied tool parameters.
   * In `full` mode project-boundary and ignore-path restrictions are relaxed
   * for the user's explicitly authorized Full Access session. Gitu's own
   * private state (.hermes), Git state (.git), and the live task ledger remain
   * protected regardless of the mode.
   */
  private accessModeSource?: () => ProjectAccessMode;
  private fixedAccessMode: ProjectAccessMode = 'workspace';
  private accessDecision?: ProjectAccessMode;

  /**
   * Resolved per authorization boundary (see `beginToolAuthorization`), so a
   * revoked setting applies to the next tool execution rather than the next
   * task, without re-reading the owner's settings once per scanned file.
   */
  get accessMode(): ProjectAccessMode {
    return this.accessDecision ?? this.resolveAccessMode();
  }

  private resolveAccessMode(): ProjectAccessMode {
    if (!this.accessModeSource) return this.fixedAccessMode;
    try {
      return this.accessModeSource() === 'full' ? 'full' : 'workspace';
    } catch {
      // A failing authority lookup must never widen access.
      return 'workspace';
    }
  }

  /**
   * Freeze the owner's decision for one tool execution. The Executor calls
   * this at the dispatch boundary: authorization is re-checked for every tool,
   * while adapters, scans and verification inside that call share one answer.
   */
  beginToolAuthorization(): void {
    this.accessDecision = this.resolveAccessMode();
  }

  endToolAuthorization(): void {
    this.accessDecision = undefined;
  }

  get fullAccess(): boolean {
    return this.accessMode === 'full';
  }

  /** Host/test override for a fixed mode. A live authority takes precedence. */
  set fullAccess(value: boolean) {
    this.fixedAccessMode = value ? 'full' : 'workspace';
  }

  /** Called only by the host; never from a model-supplied tool parameter. */
  setAccessAuthority(source: () => ProjectAccessMode): void {
    this.accessModeSource = source;
  }

  /**
   * Task-scoped scratch directory (absolute) that tools MAY touch even though
   * it sits under .hermes. Set by the orchestrator per run; temporary
   * diagnostics are redirected here so they never land in the user's source
   * tree. Everything else under .hermes stays sealed.
   */
  taskTmpRoot?: string;

  static detect(cwd: string, access?: ProjectGuardAccessOptions): ProjectGuard {
    if (!existsSync(cwd) || !statSync(cwd).isDirectory()) throw new ProjectGuardError(`Selected workspace is not an existing directory: ${cwd}`);
    const located = findRepoRoot(cwd);
    if (!located && !accessModeIsFull(access)) {
      throw new ProjectGuardError(
        `No project marker found at or above ${cwd}. Agent Gitu refuses to act without a locked project scope.`,
      );
    }
    // Without a marker, Full Access still works on the folder the user chose.
    const root = canonicalPath(located ? located.root : cwd);
    const workspace = discoverWorkspaceAuthority(root);

    let branch = tryGit(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
    if (!branch && tryGit(root, ['rev-parse', '--is-inside-work-tree']) === 'true') {
      branch = undefined;
    }

    const guard = ProjectGuard.fromDetectedRoot(root, located?.marker, workspace, branch);
    if (access?.accessMode) guard.setAccessAuthority(access.accessMode);
    return guard;
  }

  /** Desktop/run startup must not wait for Git on Electron's main thread. */
  static async detectAsync(cwd: string, access?: ProjectGuardAccessOptions): Promise<ProjectGuard> {
    const selected = await stat(cwd).catch(() => undefined);
    if (!selected?.isDirectory()) throw new ProjectGuardError(`Selected workspace is not an existing directory: ${cwd}`);
    const located = findRepoRoot(cwd);
    if (!located && !accessModeIsFull(access)) throw new ProjectGuardError(`No project marker found at or above ${cwd}. Agent Gitu refuses to act without a locked project scope.`);
    const root = canonicalPath(located ? located.root : cwd);
    const git = async (args: string[]): Promise<string | undefined> => {
      try { return (await execGit('git', args, { cwd: root, encoding: 'utf8', timeout: 3000, windowsHide: true })).stdout.trim(); }
      catch { return undefined; }
    };
    const [top, commonDir, branch] = await Promise.all([
      git(['rev-parse', '--show-toplevel']),
      git(['rev-parse', '--path-format=absolute', '--git-common-dir']),
      git(['rev-parse', '--abbrev-ref', 'HEAD']),
    ]);
    const worktreeRoot = canonicalPath(top || root);
    const common = commonDir ? canonicalPath(commonDir) : undefined;
    const repositoryRoot = common && path.basename(common).toLowerCase() === '.git' ? canonicalPath(path.dirname(common)) : worktreeRoot;
    const guard = ProjectGuard.fromDetectedRoot(root, located?.marker, { repositoryRoot, worktreeRoot, writableRoot: root }, branch);
    if (access?.accessMode) guard.setAccessAuthority(access.accessMode);
    return guard;
  }

  private static fromDetectedRoot(root: string, marker: string | undefined, workspace: WorkspaceAuthority, branch: string | undefined): ProjectGuard {

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
      techStack: marker === 'package.json' || (!marker && existsSync(pkgPath)) ? detectTechStack(pkg) : [marker ?? 'unknown'],
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

  private isPrivateStatePath(absPath: string): boolean {
    const parts = path.resolve(absPath).split(path.sep).map((part) => part.toLowerCase());
    return parts.includes('.hermes') || parts.includes('.git');
  }

  /** Canonical path of the nearest existing ancestor, or the path itself. */
  private canonicalTarget(absPath: string): string {
    let probe = path.resolve(absPath);
    for (;;) {
      if (existsSync(probe)) return canonicalPath(probe);
      const parent = path.dirname(probe);
      if (parent === probe) return path.resolve(absPath);
      probe = parent;
    }
  }

  /** Scans must not block the desktop loop on large Full Access searches. */
  private async canonicalTargetAsync(absPath: string): Promise<string> {
    let probe = path.resolve(absPath);
    for (;;) {
      if (existsSync(probe)) {
        try {
          return await realpath(probe);
        } catch {
          return path.resolve(probe);
        }
      }
      const parent = path.dirname(probe);
      if (parent === probe) return path.resolve(absPath);
      probe = parent;
    }
  }

  /**
   * Agent Gitu's own control plane: credentials, the session database and the
   * cache. Full Access covers the user's files and projects (Projects/ and
   * Workspace/ stay writable), never the state that supervises the agent.
   */
  private isProtectedGituHome(absPath: string): boolean {
    const rel = path.relative(gituHomeRoot(), path.resolve(absPath));
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return false;
    const top = (rel.split(path.sep)[0] ?? '').toLowerCase();
    return top === 'settings' || top === 'sessions' || top === 'cache';
  }

  private isInsideTaskScratch(absPath: string): boolean {
    const scratch = this.taskTmpRoot;
    if (!scratch) return false;
    const abs = path.resolve(absPath);
    const rel = path.relative(path.resolve(scratch), abs);
    return !rel.startsWith('..') && !path.isAbsolute(rel);
  }

  /**
   * Full Access is unrestricted *workspace* access, not authority over the
   * control plane supervising the agent. Gitu's live task ledger, credentials
   * and private state stay sealed, as do Git internals: the agent uses Git
   * through commands, never by editing .git directly. Symlinks are followed
   * only when their target is not private state.
   */
  private fullAccessTargetProblem(absPath: string, real: string): string | undefined {
    if (this.isInsideTaskScratch(absPath)) {
      return this.isProtectedGituHome(real) || (this.isPrivateStatePath(real) && !this.isInsideTaskScratch(real))
        ? `Path ${absPath} resolves into Agent Gitu or Git private state and cannot be touched by tools.`
        : undefined;
    }
    if (this.isPrivateStatePath(absPath) || this.isProtectedGituHome(absPath)) {
      return `Path ${absPath} is inside Agent Gitu or Git private state and cannot be touched by tools.`;
    }
    if (this.isPrivateStatePath(real) || this.isProtectedGituHome(real)) {
      return `Path ${absPath} resolves into Agent Gitu or Git private state (symlink) and cannot be touched by tools.`;
    }
    return undefined;
  }

  private assertFullAccessTarget(absPath: string): void {
    const abs = path.resolve(absPath);
    const problem = this.fullAccessTargetProblem(abs, this.canonicalTarget(abs));
    if (problem) throw new ProjectGuardError(problem);
  }

  private async assertFullAccessTargetAsync(absPath: string): Promise<void> {
    const abs = path.resolve(absPath);
    const problem = this.fullAccessTargetProblem(abs, await this.canonicalTargetAsync(abs));
    if (problem) throw new ProjectGuardError(problem);
  }

  private readonly diagnosticReads = new Map<string, { real: string; directory: boolean }>();
  /**
   * Write targets the user approved one by one, outside the locked project.
   * This is the alternative to Full Access: nothing is authorized in advance,
   * each path is asked about, and the agent's private state is never grantable.
   */
  private readonly externalWrites = new Map<string, { real: string; directory: boolean }>();
  /** User-selected, run-scoped folders. The host owns both lists. */
  private taggedReadFolders?: () => readonly string[];
  private taggedWriteFolders?: () => readonly string[];

  setTaggedReadFolders(getFolders: () => readonly string[]): void {
    this.taggedReadFolders = getFolders;
  }

  setTaggedWriteFolders(getFolders: () => readonly string[]): void {
    this.taggedWriteFolders = getFolders;
  }

  private assertPublicReadPath(absPath: string): void {
    const parts = path.resolve(absPath).split(path.sep).map(part => part.toLowerCase());
    if (parts.includes('.hermes') || parts.includes('.git')) {
      throw new ProjectGuardError('Private agent and Git state cannot be read through diagnostic access.');
    }
  }

  /** Read authority is separate from write authority; ignore rules only control discovery. */
  assertReadable(absPath: string): void {
    const abs = path.resolve(absPath);
    // Full Access mode: the owner authorized unrestricted filesystem access.
    // Private Gitu/Git state and the task ledger stay sealed in all modes.
    if (this.fullAccess) {
      this.assertFullAccessTarget(abs);
      return;
    }
    // Preserve the existing task scratch exception and normal workspace checks.
    try {
      this.assertInside(abs);
      if (!abs.split(path.sep).some(part => part.toLowerCase() === '.hermes')) this.assertPublicReadPath(canonicalPath(abs));
      return;
    } catch { /* check read-only authority */ }
    this.assertPublicReadPath(abs);
    if (this.isInsideProject(abs)) {
      this.assertNoSymlinkEscape(abs);
      this.assertPublicReadPath(canonicalPath(abs));
      return;
    }
    for (const [granted, scope] of this.diagnosticReads) {
      const rel = path.relative(granted, abs);
      if (rel !== '' && (!scope.directory || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel))) continue;
      const real = realpathSync(abs);
      this.assertPublicReadPath(real);
      const realRel = path.relative(scope.real, real);
      if (realRel === '' || (scope.directory && realRel !== '..' && !realRel.startsWith(`..${path.sep}`) && !path.isAbsolute(realRel))) return;
    }
    for (const folder of this.taggedReadFolders?.() ?? []) {
      try {
        const scope = path.resolve(folder);
        const rel = path.relative(scope, abs);
        if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) continue;
        this.assertPublicReadPath(scope);
        if (!statSync(scope).isDirectory()) continue;
        const realScope = realpathSync(scope);
        if (realScope !== scope) continue;
        const real = realpathSync(abs);
        this.assertPublicReadPath(realScope);
        this.assertPublicReadPath(real);
        const realRel = path.relative(realScope, real);
        if (realRel === '' || (realRel !== '..' && !realRel.startsWith(`..${path.sep}`) && !path.isAbsolute(realRel))) return;
      } catch { /* a removed or retargeted tag cannot expand access */ }
    }
    throw new ProjectGuardError(`Read access to ${abs} requires approval outside the locked project.`);
  }

  /** Read-only scans must not block the desktop event loop on filesystem checks. */
  async assertReadableAsync(absPath: string): Promise<void> {
    const abs = path.resolve(absPath);
    // Full Access mode: the owner authorized unrestricted filesystem access.
    // Symlinks are followed unless they resolve into private state.
    if (this.fullAccess) {
      await this.assertFullAccessTargetAsync(abs);
      return;
    }
    const within = (root: string, candidate: string): boolean => {
      const rel = path.relative(root, candidate);
      return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
    };
    const real = await realpath(abs);
    if (this.isInsideProject(abs)) {
      const rootReal = await realpath(this.activeWritableRoot);
      if (!within(rootReal, real)) throw new ProjectGuardError(`Path ${abs} resolves outside the locked project (symlink escape).`);
      // Only the orchestrator's task scratch may read legacy private state.
      const scratch = this.taskTmpRoot;
      if (scratch && abs !== path.resolve(scratch) && within(path.resolve(scratch), abs) &&
        within(await realpath(scratch), real) && this.taskTmpRoot === scratch) return;
      this.assertPublicReadPath(abs);
      this.assertPublicReadPath(real);
      return;
    }
    this.assertPublicReadPath(abs);
    this.assertPublicReadPath(real);
    for (const [granted, scope] of this.diagnosticReads) {
      if ((abs === granted || (scope.directory && within(granted, abs))) &&
        (real === scope.real || (scope.directory && within(scope.real, real))) &&
        this.diagnosticReads.get(granted) === scope) return;
    }
    for (const writeGrant of [false, true]) {
      const getFolders = writeGrant ? this.taggedWriteFolders : this.taggedReadFolders;
      for (const folder of getFolders?.() ?? []) {
        const scope = path.resolve(folder);
        if (!within(scope, abs)) continue;
        try {
          this.assertPublicReadPath(scope);
          if (!(await stat(scope)).isDirectory() || await realpath(scope) !== scope) continue;
          if (!within(scope, real)) continue;
          if (writeGrant) {
            const top = path.relative(scope, abs).split(path.sep)[0] ?? '';
            const fold = (s: string): string => process.platform === 'win32' ? s.toLowerCase() : s;
            if (top && this.lock.ignorePaths.some(ignored => fold(ignored) === fold(top))) continue;
          }
          // Re-read the owner's grants after asynchronous IO, including revocation.
          const current = writeGrant ? this.taggedWriteFolders : this.taggedReadFolders;
          if (current === getFolders && current?.().includes(folder)) return;
        } catch { /* removed, retargeted and revoked tags cannot expand access */ }
      }
    }
    throw new ProjectGuardError(`Read access to ${abs} requires approval outside the locked project.`);
  }

  /** Validate a proposed scope before displaying it to the user. No access is granted here. */
  diagnosticReadScope(absPath: string): { path: string; real: string; directory: boolean } {
    const abs = path.resolve(absPath);
    if (this.isInsideProject(abs)) throw new ProjectGuardError('A workspace symlink cannot expand diagnostic access. Request the external target directly.');
    this.assertPublicReadPath(abs);
    const real = realpathSync(abs);
    this.assertPublicReadPath(real);
    return { path: abs, real, directory: statSync(abs).isDirectory() };
  }

  /** Canonical path of a target that may not exist yet: the nearest existing
   * ancestor is resolved, the not-yet-created remainder is appended verbatim,
   * so an approved new file is still identified by where it will land. */
  private canonicalProspective(absPath: string): string {
    const abs = path.resolve(absPath);
    if (existsSync(abs)) return canonicalPath(abs);
    const parent = path.dirname(abs);
    if (parent === abs) return abs;
    return path.join(this.canonicalProspective(parent), path.basename(abs));
  }

  /**
   * Validate a proposed write target outside the project before the user is
   * asked. No access is granted here, and control-plane paths can never be
   * requested: Agent Gitu's state, credentials and Git internals stay sealed
   * whether or not the user is asked.
   */
  externalWriteScope(absPath: string): ExternalWriteScope {
    const abs = path.resolve(absPath);
    if (this.isInsideProject(abs)) {
      throw new ProjectGuardError(`Path ${abs} is inside the locked project; it does not need external approval.`);
    }
    if (this.isPrivateStatePath(abs) || this.isProtectedGituHome(abs)) {
      throw new ProjectGuardError(`Path ${absPath} is inside Agent Gitu or Git private state and cannot be touched by tools.`);
    }
    const real = this.canonicalProspective(abs);
    if (this.isPrivateStatePath(real) || this.isProtectedGituHome(real)) {
      throw new ProjectGuardError(`Path ${absPath} resolves into Agent Gitu or Git private state (symlink) and cannot be touched by tools.`);
    }
    return { path: abs, real, directory: existsSync(abs) && statSync(abs).isDirectory() };
  }

  /** Called only by the host after approval; never from model-supplied tool parameters. */
  grantExternalWrite(scope: ExternalWriteScope): void {
    const current = this.externalWriteScope(scope.path);
    if (current.real !== scope.real || current.directory !== scope.directory) {
      throw new ProjectGuardError('External write target changed while awaiting approval.');
    }
    this.externalWrites.set(scope.path, { real: scope.real, directory: scope.directory });
  }

  /** An approval covers exactly one file, or one folder and everything below it. */
  private isExternallyApproved(absPath: string): boolean {
    if (this.externalWrites.size === 0) return false;
    const abs = path.resolve(absPath);
    const real = this.canonicalProspective(abs);
    const within = (root: string, candidate: string): boolean => {
      const rel = path.relative(root, candidate);
      return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
    };
    for (const [granted, scope] of this.externalWrites) {
      if (abs === granted) {
        // The approved file must still be the same file, not a swapped symlink.
        if (real === scope.real) return true;
        continue;
      }
      if (!scope.directory || !within(granted, abs)) continue;
      if (within(scope.real, real)) return true;
    }
    return false;
  }

  /** Called only by the host after approval; never from model-supplied tool parameters. */
  grantDiagnosticRead(scope: { path: string; real: string; directory: boolean }): void {
    const current = this.diagnosticReadScope(scope.path);
    if (current.real !== scope.real || current.directory !== scope.directory) throw new ProjectGuardError('Diagnostic target changed while awaiting approval.');
    this.diagnosticReads.set(scope.path, { real: scope.real, directory: scope.directory });
  }

  private assertNoSymlinkEscape(absPath: string, root = this.activeWritableRoot): void {
    let rootReal: string;
    try {
      rootReal = realpathSync(root);
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
    if (this.fullAccess) {
      // Full Access mode: writes anywhere except the control plane supervising
      // the agent and the Git internals under .git.
      this.assertFullAccessTarget(absPath);
      return;
    }
    if (!this.isInsideProject(absPath)) {
      const abs = path.resolve(absPath);
      for (const folder of this.taggedWriteFolders?.() ?? []) {
        const scope = path.resolve(folder);
        const rel = path.relative(scope, abs);
        if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) continue;
        this.assertPublicReadPath(abs);
        this.assertPublicReadPath(scope);
        try {
          if (!statSync(scope).isDirectory() || realpathSync(scope) !== scope) break;
        } catch { break; }
        const fold = (s: string): string => (process.platform === 'win32' ? s.toLowerCase() : s);
        const top = fold(rel.split(path.sep)[0] ?? '');
        if (top && this.lock.ignorePaths.some((ignored) => fold(ignored) === top)) {
          throw new ProjectGuardError(`Path ${abs} is inside an ignored directory (${top}).`);
        }
        this.assertNoSymlinkEscape(abs, scope);
        return;
      }
      // Neither Full Access nor a folder tag: the user approved this exact
      // path for this task (see externalWriteScope / grantExternalWrite).
      // The approval is bound to the canonical target, so a swapped symlink
      // no longer matches and stays denied.
      if (this.isExternallyApproved(abs)) return;
      throw new ProjectGuardError(
        `Path ${absPath} is outside the locked project ${this.lock.name} (${this.lock.repoRoot}).`,
      );
    }
    // Windows filesystems are case-insensitive: textual comparison would let
    // ".HERMES/..." or "NODE_MODULES/x" bypass protection. Case-fold there.
    const fold = (s: string): string => (process.platform === 'win32' ? s.toLowerCase() : s);
    const rel = path.relative(this.activeWritableRoot, path.resolve(absPath));
    const foldedRel = fold(rel);
    // Task-scoped scratch exception: temporary diagnostics redirected out of
    // the user's source tree live under .hermes/tmp/<taskId>/ and ARE
    // tool-writable — everything else in .hermes stays sealed.
    if (this.taskTmpRoot) {
      const tmpRel = path.relative(path.resolve(this.taskTmpRoot), path.resolve(absPath));
      const foldedTmpRel = fold(tmpRel);
      if (!foldedTmpRel.startsWith('..') && !path.isAbsolute(foldedTmpRel) && foldedTmpRel !== '') {
        this.assertNoSymlinkEscape(absPath);
        return;
      }
    }
    if (foldedRel === '.hermes' || foldedRel.startsWith(`.hermes${path.sep}`)) {
      throw new ProjectGuardError(
        `Path ${absPath} is inside Agent Gitu's legacy private state directory (.hermes) and cannot be touched by tools.`,
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
    return (this.isInsideProject(absPath) ? path.relative(this.activeWritableRoot, absPath) : path.resolve(absPath)).replace(/\\/g, '/');
  }
}
