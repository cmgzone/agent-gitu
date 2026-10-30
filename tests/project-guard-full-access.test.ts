import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Gitu } from '../src/agent/gitu.js';
import { ProjectGuard, ProjectGuardError, type ProjectAccessMode } from '../src/guard/project-guard.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { PolicyEngine } from '../src/policy/policy.js';
import { piWriteFile } from '../src/tools/adapters/pi-mutations.js';
import { toolReadFile, toolWriteFile } from '../src/tools/tools.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'guard-full-access-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function project(name = 'project'): string {
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name }));
  return dir;
}

function externalFolder(name = 'outside'): string {
  const dir = path.join(root, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function fullAccessGuard(dir: string): ProjectGuard {
  return ProjectGuard.detect(dir, { accessMode: () => 'full' });
}

function junction(target: string, link: string): void {
  symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
}

describe('ProjectGuard Workspace mode', () => {
  it('keeps the existing project-only restrictions', async () => {
    const dir = project();
    const outside = externalFolder();
    const note = path.join(outside, 'note.txt');
    writeFileSync(note, 'external');
    const guard = ProjectGuard.detect(dir);

    expect(guard.accessMode).toBe('workspace');
    expect(() => guard.assertReadable(note)).toThrow(ProjectGuardError);
    await expect(guard.assertReadableAsync(note)).rejects.toThrow(ProjectGuardError);
    expect(() => guard.assertInside(note)).toThrow(ProjectGuardError);
    expect(() => guard.assertInside(path.join(dir, 'node_modules', 'pkg', 'index.js'))).toThrow('ignored directory');
    expect(() => guard.assertInside(path.join(dir, 'dist', 'bundle.js'))).toThrow('ignored directory');

    const context = { guard, cwd: dir };
    expect(() => toolReadFile(context, { path: note })).toThrow(ProjectGuardError);
    expect(() => toolWriteFile(context, { path: note, content: 'changed' })).toThrow(ProjectGuardError);
    expect(readFileSync(note, 'utf8')).toBe('external');
  });

  it('rejects a symlink that escapes the project', () => {
    const dir = project();
    const outside = externalFolder();
    writeFileSync(path.join(outside, 'note.txt'), 'external');
    junction(outside, path.join(dir, 'external-alias'));
    const guard = ProjectGuard.detect(dir);

    expect(() => guard.assertInside(path.join(dir, 'external-alias', 'created.txt'))).toThrow(/symlink escape/);
    expect(() => guard.assertReadable(path.join(dir, 'external-alias', 'note.txt'))).toThrow(/symlink escape/);
  });

  it('refuses to lock a folder with no project marker', () => {
    const bare = externalFolder('bare-workspace');
    expect(() => ProjectGuard.detect(bare)).toThrow('No project marker');
    expect(() => ProjectGuard.detect(bare, { accessMode: () => 'workspace' })).toThrow('No project marker');
  });
});

describe('ProjectGuard Full Access mode', () => {
  it('permits reads and writes outside the locked project', async () => {
    const dir = project();
    const outside = externalFolder();
    const note = path.join(outside, 'note.txt');
    writeFileSync(note, 'external');
    const guard = fullAccessGuard(dir);
    const context = { guard, cwd: dir };

    expect(guard.accessMode).toBe('full');
    expect(guard.fullAccess).toBe(true);
    expect(() => guard.assertReadable(note)).not.toThrow();
    await expect(guard.assertReadableAsync(note)).resolves.toBeUndefined();
    expect(toolReadFile(context, { path: note }).output).toContain('external');

    const created = path.join(outside, 'created.txt');
    expect(toolWriteFile(context, { path: created, content: 'written' }).ok).toBe(true);
    expect(readFileSync(created, 'utf8')).toBe('written');
    expect(() => guard.assertInside(created)).not.toThrow();
  });

  it('permits ordinary ignored directories inside and outside the project', () => {
    const dir = project();
    const guard = fullAccessGuard(dir);
    const context = { guard, cwd: dir };

    const dependency = path.join(dir, 'node_modules', 'pkg', 'index.js');
    expect(toolWriteFile(context, { path: dependency, content: 'module.exports = 1;' }).ok).toBe(true);
    expect(readFileSync(dependency, 'utf8')).toBe('module.exports = 1;');

    const build = path.join(dir, 'dist', 'bundle.js');
    expect(toolWriteFile(context, { path: build, content: 'built' }).ok).toBe(true);

    const outside = externalFolder();
    const outsideIgnored = path.join(outside, 'node_modules', 'pkg', 'index.js');
    expect(toolWriteFile(context, { path: outsideIgnored, content: 'outside dependency' }).ok).toBe(true);
    expect(toolReadFile(context, { path: outsideIgnored }).output).toContain('outside dependency');
  });

  it('follows symlinks whose target is an accessible filesystem location', async () => {
    const dir = project();
    const outside = externalFolder();
    writeFileSync(path.join(outside, 'note.txt'), 'external');
    junction(outside, path.join(dir, 'external-alias'));
    const guard = fullAccessGuard(dir);
    const context = { guard, cwd: dir };

    expect(toolReadFile(context, { path: path.join(dir, 'external-alias', 'note.txt') }).output).toContain('external');
    expect(toolWriteFile(context, { path: path.join(dir, 'external-alias', 'created.txt'), content: 'via link' }).ok).toBe(true);
    expect(readFileSync(path.join(outside, 'created.txt'), 'utf8')).toBe('via link');

    const inside = path.join(dir, 'src');
    mkdirSync(inside);
    writeFileSync(path.join(inside, 'file.ts'), 'export {};');
    junction(inside, path.join(dir, 'own-alias'));
    const adapterWrite = await piWriteFile(context, { path: path.join(dir, 'own-alias', 'new.ts'), content: 'export const x = 1;' });
    expect(adapterWrite.ok).toBe(true);
    expect(readFileSync(path.join(inside, 'new.ts'), 'utf8')).toBe('export const x = 1;');
  });

  it('keeps Gitu and Git private state sealed, including through symlinks', () => {
    const dir = project();
    mkdirSync(path.join(dir, '.hermes', 'tmp', 'task'), { recursive: true });
    writeFileSync(path.join(dir, '.hermes', 'project-lock.json'), '{}');
    mkdirSync(path.join(dir, '.git'));
    writeFileSync(path.join(dir, '.git', 'config'), '');
    const guard = fullAccessGuard(dir);
    const scratch = path.join(dir, '.hermes', 'tmp', 'task');
    guard.taskTmpRoot = scratch;

    expect(() => guard.assertReadable(path.join(dir, '.hermes', 'project-lock.json'))).toThrow(/private state/);
    expect(() => guard.assertInside(path.join(dir, '.hermes', 'secrets.json'))).toThrow(/private state/);
    expect(() => guard.assertInside(path.join(dir, '.hermes', 'tmp', '..', 'project-lock.json'))).toThrow(/private state/);
    expect(() => guard.assertReadable(path.join(dir, '.git', 'config'))).toThrow(/private state/);
    expect(() => guard.assertInside(path.join(dir, '.git', 'hooks', 'pre-commit'))).toThrow(/private state/);

    junction(path.join(dir, '.hermes'), path.join(dir, 'state-alias'));
    expect(() => guard.assertReadable(path.join(dir, 'state-alias', 'project-lock.json'))).toThrow(/private state/);

    // The orchestrator's task scratch is the one writable part of .hermes.
    const report = path.join(scratch, 'report.txt');
    expect(() => guard.assertInside(report)).not.toThrow();
    expect(() => guard.assertReadable(report)).not.toThrow();
    expect(toolWriteFile({ guard, cwd: dir }, { path: report, content: 'diagnostic' }).ok).toBe(true);
  });

  it('keeps credentials and session state in the Gitu home sealed', () => {
    const previous = process.env['AGENT_GITU_HOME'];
    const home = path.join(root, 'GituHome');
    mkdirSync(path.join(home, 'Settings'), { recursive: true });
    mkdirSync(path.join(home, 'Sessions'), { recursive: true });
    mkdirSync(path.join(home, 'Workspace'), { recursive: true });
    writeFileSync(path.join(home, 'Settings', 'keys.json'), '{"openai":"secret"}');
    process.env['AGENT_GITU_HOME'] = home;
    try {
      const dir = project();
      const guard = fullAccessGuard(dir);
      expect(() => guard.assertReadable(path.join(home, 'Settings', 'keys.json'))).toThrow(/private state/);
      expect(() => guard.assertReadable(path.join(home, 'Sessions', 'hermes.db'))).toThrow(/private state/);
      expect(() => guard.assertInside(path.join(home, 'Settings', 'keys.json'))).toThrow(/private state/);
      // Projects and the default scratch workspace remain ordinary user files.
      expect(() => guard.assertInside(path.join(home, 'Workspace', 'note.txt'))).not.toThrow();
    } finally {
      if (previous === undefined) delete process.env['AGENT_GITU_HOME'];
      else process.env['AGENT_GITU_HOME'] = previous;
    }
  });

  it('locks a user-selected folder without a project marker', async () => {
    const bare = externalFolder('bare-workspace');
    const guard = ProjectGuard.detect(bare, { accessMode: () => 'full' });
    const asyncGuard = await ProjectGuard.detectAsync(bare, { accessMode: () => 'full' });

    expect(guard.lock.repoRoot).toBe(path.resolve(bare));
    expect(guard.isInsideProject(path.join(bare, 'draft.txt'))).toBe(true);
    expect(asyncGuard.lock.repoRoot).toBe(path.resolve(bare));
    expect(guard.accessMode).toBe('full');
  });

  it('re-checks the owner decision at each tool boundary, not per path', () => {
    const dir = project();
    let mode: ProjectAccessMode = 'full';
    let reads = 0;
    const guard = ProjectGuard.detect(dir, {
      accessMode: () => {
        reads += 1;
        return mode;
      },
    });

    guard.beginToolAuthorization();
    expect(guard.accessMode).toBe('full');
    expect(guard.accessMode).toBe('full');
    expect(reads).toBe(1);
    guard.endToolAuthorization();

    mode = 'workspace';
    guard.beginToolAuthorization();
    expect(guard.accessMode).toBe('workspace');
    guard.endToolAuthorization();
  });

  it('applies access revocation to the next tool call without rebuilding the guard', () => {
    const dir = project();
    const outside = externalFolder();
    const note = path.join(outside, 'note.txt');
    writeFileSync(note, 'external');
    let mode: ProjectAccessMode = 'full';
    const guard = ProjectGuard.detect(dir, { accessMode: () => mode });
    const context = { guard, cwd: dir };

    expect(toolWriteFile(context, { path: note, content: 'first' }).ok).toBe(true);
    mode = 'workspace';
    expect(guard.accessMode).toBe('workspace');
    expect(() => toolWriteFile(context, { path: note, content: 'second' })).toThrow(ProjectGuardError);
    expect(readFileSync(note, 'utf8')).toBe('first');
    mode = 'full';
    expect(toolWriteFile(context, { path: note, content: 'third' }).ok).toBe(true);
    expect(readFileSync(note, 'utf8')).toBe('third');

    guard.setAccessAuthority(() => {
      throw new Error('authority unavailable');
    });
    expect(guard.accessMode).toBe('workspace');
  });
});

describe('Full Access cannot be self-granted', () => {
  it('ignores Full Access hints supplied through tool parameters', () => {
    const dir = project();
    const outside = externalFolder();
    const note = path.join(outside, 'note.txt');
    writeFileSync(note, 'protected');
    const guard = ProjectGuard.detect(dir);
    const context = { guard, cwd: dir };

    expect(() =>
      toolWriteFile(context, {
        path: note,
        content: 'hijacked',
        fullAccess: true,
        accessMode: 'full',
        autoApprove: true,
        access: 'full',
      }),
    ).toThrow(ProjectGuardError);
    expect(() => toolReadFile(context, { path: note, fullAccess: true, mode: 'full' })).toThrow(ProjectGuardError);
    expect(guard.accessMode).toBe('workspace');
    expect(readFileSync(note, 'utf8')).toBe('protected');
  });

  it('does not inherit Full Access from a persisted project lock', () => {
    const dir = project();
    const guard = fullAccessGuard(dir);
    guard.persist();

    const reloaded = ProjectGuard.load(dir);
    expect(reloaded).toBeDefined();
    expect(reloaded?.accessMode).toBe('workspace');
    expect(() => reloaded?.assertInside(path.join(root, 'elsewhere.txt'))).toThrow(ProjectGuardError);
  });
});

describe('engine wiring', () => {
  it('hands the live owner authority to the guard and reflects revocation', async () => {
    const dir = project();
    let granted = true;
    let captured: (() => ProjectAccessMode) | undefined;
    const spy = vi.spyOn(ProjectGuard, 'detectAsync').mockImplementation(async (_cwd, access) => {
      captured = access?.accessMode;
      throw new ProjectGuardError('stopped for the wiring assertion');
    });
    try {
      const gitu = new Gitu({ cwd: dir, llm: new ScriptedMockLlm([() => '{}']), fullAccess: () => granted });
      await expect(gitu.run('work on an outside file')).rejects.toThrow('stopped for the wiring assertion');
      expect(captured).toBeDefined();
      expect(captured?.()).toBe('full');
      granted = false;
      expect(captured?.()).toBe('workspace');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('Full Access shell execution policy', () => {
  it('auto-approves commands only while the owner grant is live', async () => {
    let mode: ProjectAccessMode = 'workspace';
    const policy = new PolicyEngine(() => mode === 'full');
    const command = { command: 'rm -rf build' };

    await expect(policy.evaluate('run_command', command)).resolves.toMatchObject({ allowed: false, requiresApproval: true });
    await expect(policy.evaluate('run_command', { ...command, fullAccess: true })).resolves.toMatchObject({ allowed: false });

    mode = 'full';
    await expect(policy.evaluate('run_command', command)).resolves.toMatchObject({ allowed: true, requiresApproval: false });

    mode = 'workspace';
    await expect(policy.evaluate('run_command', command)).resolves.toMatchObject({ allowed: false });
  });

  it('keeps safe mode refusing dangerous commands even with Full Access', async () => {
    const policy = new PolicyEngine(true, undefined, true);
    await expect(policy.evaluate('run_command', { command: 'rm -rf build' })).resolves.toMatchObject({ allowed: false });
    await expect(policy.evaluate('read_file', { path: 'a.ts' })).resolves.toMatchObject({ allowed: true });
  });
});
