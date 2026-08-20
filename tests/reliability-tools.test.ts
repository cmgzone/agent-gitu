import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Executor } from '../src/executor/executor.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { LoopDetector } from '../src/loop/loop-detector.js';
import { PolicyEngine } from '../src/policy/policy.js';
import { formatToolValidationError, validateToolParams } from '../src/tools/tools.js';

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hermes-rtools-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'rtools-test' }));
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  writeFileSync(path.join(dir, 'src', 'a.ts'), 'export const a = 1;\n');
  return dir;
}

function makeExecutor(): {
  executor: Executor;
  guard: ProjectGuard;
  ledger: TaskLedger;
  policyCalls: () => number;
  loopCalls: () => number;
} {
  const dir = makeProject();
  const guard = ProjectGuard.detect(dir);
  const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'tools reliability', project: guard.lock, mode: 'fast' });
  let policyCalls = 0;
  let loopCalls = 0;
  const policy = {
    evaluate: async () => {
      policyCalls += 1;
      return { allowed: true, tier: 'safe' as const, reason: 'stub' };
    },
  } as unknown as PolicyEngine;
  const loopDetector = {
    evaluate: () => {
      loopCalls += 1;
      return { allowed: true, reason: undefined, errorSig: undefined };
    },
    fileEditPressure: () => ({ blocked: false, edits: 0, evidence: 0 }),
  } as unknown as LoopDetector;
  const executor = new Executor(guard, ledger, policy, loopDetector);
  return { executor, guard, ledger, policyCalls: () => policyCalls, loopCalls: () => loopCalls };
}

describe('validateToolParams — schema boundary', () => {
  it('rejects read_file(undefined)', () => {
    const v = validateToolParams('read_file', { path: undefined });
    expect(v.valid).toBe(false);
    expect(v.error).toContain('Missing required parameter "path"');
  });

  it('rejects read_file with no params object at all', () => {
    const v = validateToolParams('read_file', undefined);
    expect(v.valid).toBe(false);
    expect(v.error).toContain('must be a JSON object');
  });

  it('rejects read_file with a non-string path', () => {
    const v = validateToolParams('read_file', { path: 42 });
    expect(v.valid).toBe(false);
    expect(v.error).toContain('must be a string');
  });

  it('rejects a missing write_file path', () => {
    const v = validateToolParams('write_file', { content: 'hello' });
    expect(v.valid).toBe(false);
    expect(v.error).toContain('"path"');
  });

  it('rejects write_file with non-string content', () => {
    const v = validateToolParams('write_file', { path: 'src/x.ts', content: { not: 'a string' } });
    expect(v.valid).toBe(false);
    expect(v.error).toContain('"content"');
  });

  it('rejects apply_edit with empty oldString', () => {
    const v = validateToolParams('apply_edit', { path: 'src/x.ts', oldString: '', newString: 'y' });
    expect(v.valid).toBe(false);
    expect(v.error).toContain('"oldString"');
  });

  it('rejects an empty search pattern', () => {
    expect(validateToolParams('search_files', { pattern: '' }).valid).toBe(false);
    expect(validateToolParams('search_files', { pattern: '   ' }).valid).toBe(false);
    expect(validateToolParams('search_files', { pattern: 'undefined' }).valid).toBe(false);
    expect(validateToolParams('search_files', {}).valid).toBe(false);
  });

  it('rejects run_command with a missing command', () => {
    const v = validateToolParams('run_command', {});
    expect(v.valid).toBe(false);
    expect(v.error).toContain('"command"');
  });

  it('rejects web_fetch with a missing url', () => {
    const v = validateToolParams('web_fetch', {});
    expect(v.valid).toBe(false);
    expect(v.error).toContain('"url"');
  });

  it('accepts well-formed calls', () => {
    expect(validateToolParams('read_file', { path: 'src/a.ts' }).valid).toBe(true);
    expect(validateToolParams('search_files', { pattern: 'export', path: 'src' }).valid).toBe(true);
    expect(validateToolParams('run_command', { command: 'npm test' }).valid).toBe(true);
    expect(validateToolParams('write_file', { path: 'src/x.ts', content: 'x' }).valid).toBe(true);
    expect(validateToolParams('list_files', { path: 'src' }).valid).toBe(true);
  });

  it('validates browse actions and parameters', () => {
    expect(validateToolParams('browse', { action: 'navigate', url: 'https://example.com' }).valid).toBe(true);
    expect(validateToolParams('browse', { action: 'navigate' }).valid).toBe(false);
    expect(validateToolParams('browse', { action: 'fly' }).valid).toBe(false);
    expect(validateToolParams('browse', { action: 'type', text: 'hello' }).valid).toBe(true);
    expect(validateToolParams('browse', { action: 'type' }).valid).toBe(false);
    expect(validateToolParams('browse', { action: 'fill', selector: '#a', text: 'v' }).valid).toBe(true);
    expect(validateToolParams('browse', { action: 'fill', text: 'v' }).valid).toBe(false);
    expect(validateToolParams('browse', { action: 'click', selector: '#a' }).valid).toBe(true);
    expect(validateToolParams('browse', { action: 'click' }).valid).toBe(false);
  });

  it('validates delegate tasks', () => {
    expect(validateToolParams('delegate', { agent: 'explore', task: 'scan the repo' }).valid).toBe(true);
    expect(validateToolParams('delegate', { tasks: [{ agent: 'explore', task: 'scan' }] }).valid).toBe(true);
    expect(validateToolParams('delegate', { tasks: [] }).valid).toBe(false);
    expect(validateToolParams('delegate', { tasks: [{ agent: '', task: 'scan' }] }).valid).toBe(false);
    expect(validateToolParams('delegate', { tasks: [{ agent: 'explore' }] }).valid).toBe(false);
    expect(validateToolParams('delegate', {}).valid).toBe(false);
  });

  it('validates agent_status ids', () => {
    expect(validateToolParams('agent_status', {}).valid).toBe(true);
    expect(validateToolParams('agent_status', { id: 'sub-abc' }).valid).toBe(true);
    expect(validateToolParams('agent_status', { id: 42 }).valid).toBe(false);
  });
});

describe('Executor schema boundary — validation before guard/policy', () => {
  it('rejects read_file(undefined) without touching the policy or loop detector', async () => {
    const { executor, policyCalls, loopCalls } = makeExecutor();
    const outcome = await executor.execute({
      tool: 'read_file',
      params: { path: undefined },
      reason: 'test',
      expected: 'content',
    });
    expect(outcome.result.ok).toBe(false);
    expect(outcome.result.output).toContain('INVALID TOOL CALL');
    expect(outcome.result.output).toContain('Tool: read_file');
    expect(policyCalls()).toBe(0);
    expect(loopCalls()).toBe(0);
  });

  it('rejects an empty search pattern before resolving any project path', async () => {
    const { executor, policyCalls, loopCalls } = makeExecutor();
    const outcome = await executor.execute({
      tool: 'search_files',
      params: { pattern: '   ' },
      reason: 'test',
      expected: 'matches',
    });
    expect(outcome.result.ok).toBe(false);
    expect(outcome.result.output).toContain('INVALID TOOL CALL');
    expect(policyCalls()).toBe(0);
    expect(loopCalls()).toBe(0);
  });

  it('rejects non-string write_file content at the boundary (never writes a file)', async () => {
    const { executor, ledger, guard } = makeExecutor();
    const outcome = await executor.execute({
      tool: 'write_file',
      params: { path: 'src/injected.ts', content: { sneaky: true } },
      reason: 'test',
      expected: 'file written',
    });
    expect(outcome.result.ok).toBe(false);
    expect(outcome.result.output).toContain('INVALID TOOL CALL');
    const action = ledger.data.actions.at(-1);
    expect(action?.errorSignature).toBe('invalid-tool-params');
    // The file must never have been created.
    expect(existsSync(path.join(guard.lock.repoRoot, 'src', 'injected.ts'))).toBe(false);
  });

  it('produces a deterministic recovery prompt', () => {
    const params = { path: undefined };
    const v = validateToolParams('read_file', params);
    const first = formatToolValidationError('read_file', params, v);
    const second = formatToolValidationError('read_file', params, v);
    expect(first).toBe(second);
    expect(first).toContain('INVALID TOOL CALL');
    expect(first).toContain('Tool: read_file');
    expect(first).toContain('Problem:');
    expect(first).toContain('Required Schema:');
    expect(first).toContain('Received:');
    expect(first).toContain('Correction:');
  });

  it('lets valid calls through to the policy (boundary is not a blanket block)', async () => {
    const { executor, policyCalls } = makeExecutor();
    const outcome = await executor.execute({
      tool: 'list_files',
      params: { path: 'src' },
      reason: 'test',
      expected: 'files listed',
    });
    expect(outcome.result.ok).toBe(true);
    expect(policyCalls()).toBe(1);
  });
});
