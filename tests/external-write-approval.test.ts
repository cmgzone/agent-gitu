import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectGuard, ProjectGuardError } from '../src/guard/project-guard.js';
import { Executor } from '../src/executor/executor.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { LoopDetector } from '../src/loop/loop-detector.js';
import { PolicyEngine } from '../src/policy/policy.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture(approved = true, withApprovalChannel = true) {
  const base = mkdtempSync(path.join(tmpdir(), 'gitu-external-write-'));
  roots.push(base);
  const repo = path.join(base, 'project');
  const shared = path.join(base, 'shared');
  mkdirSync(repo);
  mkdirSync(shared);
  writeFileSync(path.join(repo, 'package.json'), '{"name":"external-write-test"}');
  const guard = ProjectGuard.detect(repo);
  const approval = vi.fn(async () => approved);
  const policy = withApprovalChannel ? new PolicyEngine(true, approval) : new PolicyEngine(true);
  const ledger = TaskLedger.create({ repoRoot: repo, goal: 'Save the report outside the project', project: guard.lock, mode: 'fast' });
  const executor = new Executor(guard, ledger, policy, new LoopDetector());
  return { base, repo, shared, guard, approval, policy, ledger, executor };
}

const write = (target: string, content = 'delivered') => ({
  tool: 'write_file',
  params: { path: target, content },
  reason: 'Save the requested report next to the project',
  expected: 'Report saved outside the project',
});

describe('external write approval', () => {
  it('asks about the exact path instead of requiring Full Access', async () => {
    const f = fixture();
    const target = path.join(f.shared, 'report.md');
    try {
      const result = await f.executor.execute(write(target));

      expect(result.result.ok).toBe(true);
      expect(readFileSync(target, 'utf8')).toBe('delivered');
      expect(f.approval).toHaveBeenCalledOnce();
      expect(f.approval.mock.calls[0]?.[0]).toMatchObject({ tool: 'write_file', summary: target });
      // The grant is scoped to this file for this task, and nothing wider.
      expect(() => f.guard.assertInside(target)).not.toThrow();
      expect(() => f.guard.assertInside(path.join(f.shared, 'other.md'))).toThrow(ProjectGuardError);
    } finally { f.executor.dispose(); }
  });

  it('asks again for a second path and keeps each decision separate', async () => {
    const f = fixture();
    const first = path.join(f.shared, 'first.md');
    const second = path.join(f.shared, 'second.md');
    try {
      expect((await f.executor.execute(write(first))).result.ok).toBe(true);
      expect((await f.executor.execute(write(second))).result.ok).toBe(true);
      expect(f.approval).toHaveBeenCalledTimes(2);
      expect(f.approval.mock.calls.map((call) => call[0]?.summary)).toEqual([first, second]);
    } finally { f.executor.dispose(); }
  });

  it('honours a refusal and says so instead of silently retrying', async () => {
    const f = fixture(false);
    const target = path.join(f.shared, 'report.md');
    try {
      const result = await f.executor.execute(write(target));

      expect(result.result.ok).toBe(false);
      expect(result.result.output).toMatch(/needs the user's approval, which was not granted/);
      expect(existsSync(target)).toBe(false);
      expect(() => f.guard.assertInside(target)).toThrow(ProjectGuardError);
    } finally { f.executor.dispose(); }
  });

  it('refuses without an approval channel, so unattended runs gain nothing', async () => {
    const f = fixture(true, false);
    const target = path.join(f.shared, 'report.md');
    try {
      const result = await f.executor.execute(write(target));
      expect(result.result.ok).toBe(false);
      expect(existsSync(target)).toBe(false);
    } finally { f.executor.dispose(); }
  });

  it('never offers Agent Gitu or Git private state to the user', async () => {
    const previous = process.env['AGENT_GITU_HOME'];
    const home = path.join(fixtureBase(), 'GituHome');
    mkdirSync(path.join(home, 'Settings'), { recursive: true });
    process.env['AGENT_GITU_HOME'] = home;
    const f = fixture();
    try {
      const privateFile = path.join(f.repo, '.hermes', 'secrets.json');
      const gitHook = path.join(f.repo, '.git', 'hooks', 'pre-commit');
      const credentials = path.join(home, 'Settings', 'keys.json');
      for (const target of [privateFile, gitHook, credentials]) {
        const result = await f.executor.execute(write(target));
        expect(result.result.ok).toBe(false);
        expect(result.result.output).toMatch(/DENIED by project boundary/);
        expect(existsSync(target)).toBe(false);
      }
      // No approvable scope exists for any of them.
      for (const target of [privateFile, gitHook, credentials]) {
        expect(() => f.guard.externalWriteScope(target)).toThrow(ProjectGuardError);
      }
      expect(f.approval).not.toHaveBeenCalled();
    } finally {
      f.executor.dispose();
      if (previous === undefined) delete process.env['AGENT_GITU_HOME'];
      else process.env['AGENT_GITU_HOME'] = previous;
    }
  });

  it('keeps ignored directories inside the project denied without asking', async () => {
    const f = fixture();
    const dependency = path.join(f.repo, 'node_modules', 'pkg', 'index.js');
    try {
      const result = await f.executor.execute(write(dependency, 'module.exports = 1;'));
      expect(result.result.ok).toBe(false);
      expect(result.result.output).toMatch(/ignored directory/);
      expect(f.approval).not.toHaveBeenCalled();
    } finally { f.executor.dispose(); }
  });

  it('covers edits to an approved external file', async () => {
    const f = fixture();
    const target = path.join(f.shared, 'notes.md');
    writeFileSync(target, 'Hello world\n');
    try {
      const result = await f.executor.execute({
        tool: 'apply_edit',
        params: { path: target, oldString: 'Hello world', newString: 'Hello there' },
        reason: 'Correct the approved external note',
        expected: 'Note corrected',
      });
      expect(result.result.ok).toBe(true);
      expect(readFileSync(target, 'utf8')).toBe('Hello there\n');
      expect(f.approval).toHaveBeenCalledOnce();
    } finally { f.executor.dispose(); }
  });

  it('keeps Full Access working without any prompt', async () => {
    const f = fixture();
    const target = path.join(f.shared, 'report.md');
    f.guard.setAccessAuthority(() => 'full');
    try {
      const result = await f.executor.execute(write(target));
      expect(result.result.ok).toBe(true);
      expect(readFileSync(target, 'utf8')).toBe('delivered');
      expect(f.approval).not.toHaveBeenCalled();
    } finally { f.executor.dispose(); }
  });
});

/** A scratch directory that is not itself a fixture project. */
function fixtureBase(): string {
  const base = mkdtempSync(path.join(tmpdir(), 'gitu-external-write-home-'));
  roots.push(base);
  return base;
}
