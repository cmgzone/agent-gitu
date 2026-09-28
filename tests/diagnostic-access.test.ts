import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { Executor } from '../src/executor/executor.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { LoopDetector } from '../src/loop/loop-detector.js';
import { PolicyEngine } from '../src/policy/policy.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture(approved = true) {
  const base = mkdtempSync(path.join(tmpdir(), 'gitu-diagnostic-access-'));
  roots.push(base);
  const repo = path.join(base, 'project');
  const logs = path.join(base, 'logs');
  mkdirSync(repo); mkdirSync(logs);
  writeFileSync(path.join(repo, 'package.json'), '{"name":"diagnostic-test"}');
  const file = path.join(logs, 'launch-stderr.log');
  writeFileSync(file, 'launch failure evidence');
  const guard = ProjectGuard.detect(repo);
  const approval = vi.fn(async (request: { summary: string }) => { void request; return approved; });
  const ledger = TaskLedger.create({ repoRoot: repo, goal: 'Diagnose launch failure', project: guard.lock, mode: 'fast' });
  const executor = new Executor(guard, ledger, new PolicyEngine(true, approval), new LoopDetector());
  return { base, repo, logs, file, guard, approval, executor };
}
const request = (tool: string, target: string, extra = {}) => ({ tool, params: { path: target, ...extra }, reason: 'Diagnose app launch', expected: 'Read evidence' });

describe('scoped diagnostic reads', () => {
  it('asks for external log access even with auto-approve and never grants writes', async () => {
    const f = fixture();
    try {
      const read = await f.executor.execute(request('read_file', f.file));
      expect(read.result.ok).toBe(true);
      expect(read.result.output).toContain('launch failure evidence');
      expect(f.approval).toHaveBeenCalledOnce();
      expect(f.approval.mock.calls[0]?.[0]).toMatchObject({ tool: 'read_file', summary: f.file });
      expect(() => f.guard.assertReadable(f.file)).not.toThrow();
      expect(() => f.guard.assertReadable(path.join(f.logs, 'another.log'))).toThrow();
      const write = await f.executor.execute(request('write_file', f.file, { content: 'changed' }));
      expect(write.result.ok).toBe(false);
      expect(readFileSync(f.file, 'utf8')).toBe('launch failure evidence');
    } finally { f.executor.dispose(); }
  });

  it('preserves refusal and does not read a denied external file', async () => {
    const f = fixture(false);
    try {
      const read = await f.executor.execute(request('read_file', f.file));
      expect(read.result.ok).toBe(false);
      expect(read.result.output).not.toContain('launch failure evidence');
      expect(() => f.guard.assertReadable(f.file)).toThrow();
    } finally { f.executor.dispose(); }
  });

  it('allows targeted dependency reads and listings without allowing dependency writes', async () => {
    const f = fixture();
    const dir = path.join(f.repo, 'node_modules', 'squirrel-tools');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), '{"name":"squirrel-tools"}');
    try {
      expect((await f.executor.execute(request('list_files', dir))).result.output).toContain('package.json');
      expect((await f.executor.execute(request('read_file', path.join(dir, 'package.json')))).result.ok).toBe(true);
      expect(f.approval).not.toHaveBeenCalled();
      expect(() => f.guard.assertInside(path.join(dir, 'package.json'))).toThrow();
    } finally { f.executor.dispose(); }
  });

  it('keeps directory grants inside their scope and rejects symlink escapes', async () => {
    const f = fixture();
    const outside = path.join(f.base, 'other');
    mkdirSync(outside);
    writeFileSync(path.join(outside, 'secret.log'), 'must not appear');
    symlinkSync(outside, path.join(f.logs, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
    try {
      const listing = await f.executor.execute(request('list_files', f.logs));
      expect(listing.result.ok).toBe(true);
      expect(listing.result.output).toContain('launch-stderr.log');
      expect(listing.result.output).not.toContain('secret.log');
      expect(() => f.guard.assertReadable(path.join(f.logs, 'escape', 'secret.log'))).toThrow();
      const privateFile = path.join(f.repo, '.hermes', 'state.json');
      mkdirSync(path.dirname(privateFile), { recursive: true });
      writeFileSync(privateFile, '{}');
      expect((await f.executor.execute(request('read_file', privateFile))).result.ok).toBe(false);
      symlinkSync(path.dirname(privateFile), path.join(f.repo, 'private-alias'), process.platform === 'win32' ? 'junction' : 'dir');
      expect(() => f.guard.assertReadable(path.join(f.repo, 'private-alias', 'state.json'))).toThrow();
      expect(f.approval).toHaveBeenCalledOnce();
    } finally { f.executor.dispose(); }
  });
});
