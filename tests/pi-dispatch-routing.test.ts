import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { PolicyEngine } from '../src/policy/policy.js';
import { LoopDetector } from '../src/loop/loop-detector.js';
import { Executor } from '../src/executor/executor.js';
import { executeCoworkTool, type CoworkToolPerms } from '../src/cowork/tools.js';
import type { ToolContext } from '../src/tools/tools.js';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { force: true, recursive: true });
});

function fixture(): {
  root: string;
  guard: ProjectGuard;
  ledger: TaskLedger;
  executor: Executor;
  ctx: ToolContext;
} {
  const root = mkdtempSync(path.join(tmpdir(), 'gitu-dispatch-test-'));
  folders.push(root);
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'dispatch-test' }));
  const guard = ProjectGuard.detect(root);
  const ledger = TaskLedger.create({
    repoRoot: path.resolve(root),
    goal: 'dispatch test',
    project: guard.lock,
    mode: 'fast',
  });
  const executor = new Executor(guard, ledger, new PolicyEngine(true), new LoopDetector());
  const ctx: ToolContext = { guard, cwd: root };
  return { root, guard, ledger, executor, ctx };
}

describe('Pi tool adapter dispatch routing', () => {
  const originalEnv = process.env['GITU_PI_TOOLS'];

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env['GITU_PI_TOOLS'];
    } else {
      process.env['GITU_PI_TOOLS'] = originalEnv;
    }
  });

  describe('Executor dispatch with GITU_PI_TOOLS=1', () => {
    beforeEach(() => {
      process.env['GITU_PI_TOOLS'] = '1';
    });

    it('routes read_file through Pi adapter with line numbers', async () => {
      const { root, executor } = fixture();
      writeFileSync(path.join(root, 'sample.txt'), 'line one\nline two\nline three');

      const { result } = await executor.execute({
        id: 'act-1',
        tool: 'read_file',
        params: { path: 'sample.txt' },
      });

      expect(result.ok).toBe(true);
      expect(result.output).toContain('1: line one');
      expect(result.output).toContain('2: line two');
      expect(result.output).toContain('3: line three');
    });

    it('routes write_file through Pi adapter with queue safety and verification', async () => {
      const { root, executor } = fixture();

      const { result } = await executor.execute({
        id: 'act-2',
        tool: 'write_file',
        params: { path: 'written.txt', content: 'hello from pi write' },
      });

      expect(result.ok).toBe(true);
      expect(readFileSync(path.join(root, 'written.txt'), 'utf8')).toBe('hello from pi write');
      expect(result.filesTouched).toContain('written.txt');
    });

    it('routes apply_edit through Pi adapter with diff payload', async () => {
      const { root, executor } = fixture();
      writeFileSync(path.join(root, 'editable.txt'), 'const x = 1;\nconst y = 2;');

      const { result } = await executor.execute({
        id: 'act-3',
        tool: 'apply_edit',
        params: { path: 'editable.txt', oldString: 'const y = 2;', newString: 'const y = 42;' },
      });

      expect(result.ok).toBe(true);
      expect(readFileSync(path.join(root, 'editable.txt'), 'utf8')).toBe('const x = 1;\nconst y = 42;');
      expect(result.payload).toBeDefined();
    });

    it('routes list_files through Pi adapter', async () => {
      const { root, executor } = fixture();
      writeFileSync(path.join(root, 'file1.txt'), '');
      writeFileSync(path.join(root, 'file2.txt'), '');

      const { result } = await executor.execute({
        id: 'act-4',
        tool: 'list_files',
        params: { path: '.' },
      });

      expect(result.ok).toBe(true);
      expect(result.output).toContain('file1.txt');
      expect(result.output).toContain('file2.txt');
    });

    it('routes search_files through Pi adapter', async () => {
      const { root, executor } = fixture();
      writeFileSync(path.join(root, 'code.ts'), 'export const MY_SPECIAL_CONSTANT = 999;');

      const { result } = await executor.execute({
        id: 'act-5',
        tool: 'search_files',
        params: { pattern: 'MY_SPECIAL_CONSTANT' },
      });

      expect(result.ok).toBe(true);
      expect(result.output).toContain('MY_SPECIAL_CONSTANT');
    });

    it('strictly preserves Gitu native engine for run_command', async () => {
      const { executor } = fixture();

      const { result } = await executor.execute({
        id: 'act-6',
        tool: 'run_command',
        params: { command: 'node -e "console.log(40 + 2)"' },
      });

      expect(result.ok).toBe(true);
      expect(result.output).toContain('42');
    });

    it('enforces boundary rejection on read_file and write_file', async () => {
      const { executor } = fixture();
      const outside = path.join(tmpdir(), 'outside-denied.txt');

      const { result: readRes } = await executor.execute({
        id: 'act-7',
        tool: 'read_file',
        params: { path: outside },
      });
      expect(readRes.ok).toBe(false);

      const { result: writeRes } = await executor.execute({
        id: 'act-8',
        tool: 'write_file',
        params: { path: outside, content: 'bad' },
      });
      expect(writeRes.ok).toBe(false);
    });
  });

  describe('Cowork dispatch with GITU_PI_TOOLS=1', () => {
    beforeEach(() => {
      process.env['GITU_PI_TOOLS'] = '1';
    });

    const perms: CoworkToolPerms = {
      allowShell: true,
      allowWrites: true,
      allowConfig: true,
      chief: false,
      browser: false,
    };

    it('routes read_file and write_file in Cowork through Pi adapters', async () => {
      const { root, ctx } = fixture();

      const writeRes = await executeCoworkTool(
        ctx,
        'write_file',
        { path: 'cowork.txt', content: 'cowork content' },
        perms,
      );
      expect(writeRes.ok).toBe(true);
      expect(readFileSync(path.join(root, 'cowork.txt'), 'utf8')).toBe('cowork content');

      const readRes = await executeCoworkTool(ctx, 'read_file', { path: 'cowork.txt' }, perms);
      expect(readRes.ok).toBe(true);
      expect(readRes.output).toContain('1: cowork content');
    });

    it('blocks write_file when allowWrites is false', async () => {
      const { root, ctx } = fixture();

      const readOnlyPerms: CoworkToolPerms = { ...perms, allowWrites: false };
      const res = await executeCoworkTool(
        ctx,
        'write_file',
        { path: 'blocked.txt', content: 'should not write' },
        readOnlyPerms,
      );

      expect(res.ok).toBe(false);
      expect(res.output).toContain('disabled');
    });
  });

  describe('Native rollback with GITU_PI_TOOLS disabled', () => {
    beforeEach(() => {
      delete process.env['GITU_PI_TOOLS'];
    });

    it('uses native implementation when flag is unset', async () => {
      const { root, executor } = fixture();
      writeFileSync(path.join(root, 'native.txt'), 'native text');

      const { result } = await executor.execute({
        id: 'act-9',
        tool: 'read_file',
        params: { path: 'native.txt' },
      });

      expect(result.ok).toBe(true);
      expect(result.output).toContain('1: native text');
    });
  });
});
