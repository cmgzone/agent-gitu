import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Executor } from '../src/executor/executor.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { LoopDetector } from '../src/loop/loop-detector.js';
import { PolicyEngine } from '../src/policy/policy.js';
import { formatToolValidationError, toolSearchFiles, validateToolParams } from '../src/tools/tools.js';

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

describe('Executor enforcement pipeline order', () => {
  it('enforces the project boundary BEFORE instruction, policy, and loop judgment', async () => {
    const { executor, guard, ledger, policyCalls, loopCalls } = makeExecutor();
    // Even a hard instruction that would forbid the write must not win over
    // the boundary — the boundary gate runs first.
    ledger.addInstruction({ text: 'only edit inside.ts', type: 'constraint', enforcement: 'hard', status: 'active', source: 'follow-up' });

    const outcome = await executor.execute({
      tool: 'write_file',
      params: { path: '../escaped.ts', content: 'x' },
      reason: 'test',
      expected: 'file written',
    });

    expect(outcome.result.ok).toBe(false);
    expect(outcome.deniedByPolicy).toContain('DENIED by project boundary');
    expect(outcome.blockedByLoop).toBeUndefined();
    expect(ledger.data.actions.at(-1)?.status).toBe('denied');
    expect(policyCalls()).toBe(0);
    expect(loopCalls()).toBe(0);
    expect(existsSync(path.join(guard.lock.repoRoot, '..', 'escaped.ts'))).toBe(false);
  });

  it('runs the user InstructionPolicy BEFORE the normal policy and loop protection', async () => {
    const { executor, ledger, policyCalls, loopCalls } = makeExecutor();
    ledger.addInstruction({ text: 'no npm install', type: 'constraint', enforcement: 'hard', status: 'active', source: 'follow-up' });

    const outcome = await executor.execute({
      tool: 'run_command',
      params: { command: 'npm install left-pad' },
      reason: 'test',
      expected: 'installed',
    });

    expect(outcome.result.ok).toBe(false);
    expect(outcome.deniedByPolicy).toContain('USER INSTRUCTION VIOLATION');
    expect(outcome.blockedByLoop).toBeUndefined();
    expect(ledger.data.actions.at(-1)?.status).toBe('denied');
    // Under the pipeline order schema > boundary > instruction > policy > loop,
    // neither the safety policy nor the loop detector is consulted on an
    // instruction denial.
    expect(policyCalls()).toBe(0);
    expect(loopCalls()).toBe(0);
  });

  it('still blocks repeated identical failing calls — loop protection survives the reorder', async () => {
    // Real LoopDetector: the shared helper's stub never blocks.
    const dir = makeProject();
    const guard = ProjectGuard.detect(dir);
    const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'loop reorder', project: guard.lock, mode: 'fast' });
    const executor = new Executor(guard, ledger, new PolicyEngine(true), new LoopDetector());

    await executor.execute({ tool: 'read_file', params: { path: 'src/missing.ts' }, reason: 'test', expected: 'content' });
    await executor.execute({ tool: 'read_file', params: { path: 'src/missing.ts' }, reason: 'test', expected: 'content' });
    const outcome = await executor.execute({ tool: 'read_file', params: { path: 'src/missing.ts' }, reason: 'test', expected: 'content' });

    expect(outcome.result.ok).toBe(false);
    expect(outcome.blockedByLoop).toBeTruthy();
    expect(ledger.data.actions.at(-1)?.status).toBe('blocked');
  });
});

describe('toolSearchFiles — language-agnostic search engine', () => {
  function searchProject(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'hermes-search-'));
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'search-test' }));
    writeFileSync(
      path.join(dir, 'enum.ts'),
      ['export const ActivityKind =', '  | "project_created"', '  | "task_created"', '  | "document_created"'].join('\n'),
    );
    writeFileSync(path.join(dir, 'util.py'), 'def connect(a, b):\n    return a.b  # a dot call\n');
    mkdirSync(path.join(dir, 'vendor'), { recursive: true });
    writeFileSync(path.join(dir, 'vendor', 'gen.py'), 'def connect(a, b):\n    return 1\n');
    writeFileSync(path.join(dir, 'README.md'), 'connect the dots\n');
    return dir;
  }
  const search = (dir: string, params: Record<string, unknown>) => {
    const guard = ProjectGuard.detect(dir);
    return toolSearchFiles({ guard } as unknown as Parameters<typeof toolSearchFiles>[0], params);
  };

  it('literal mode matches plain text without regex escaping traps', () => {
    const dir = searchProject();
    const r = search(dir, { pattern: 'a.b', mode: 'literal', include: ['**/*.py'] });
    expect(r.ok).toBe(true);
    expect(r.output).toContain('util.py');
    expect(r.output).toContain('return a.b');
    expect(r.output).toContain('mode=literal');
  });

  it('default regex mode keeps the classic path:line: text behavior', () => {
    const dir = searchProject();
    const r = search(dir, { pattern: 'export const' });
    expect(r.ok).toBe(true);
    expect(r.output).toContain('enum.ts:1: export const ActivityKind =');
    expect(r.output).toContain('matches=1');
  });

  it('regex matches across lines in any language (multiline span)', () => {
    const dir = searchProject();
    const r = search(dir, { pattern: 'ActivityKind[\\s\\S]{0,120}?document_created' });
    expect(r.ok).toBe(true);
    const matchLine = r.output.split('\n').find((l) => l.startsWith('enum.ts:'));
    expect(matchLine).toBeTruthy();
    // The full matched text is shown with visible line breaks.
    expect(matchLine).toContain('ActivityKind');
    expect(matchLine).toContain('document_created');
    expect(matchLine).toContain('⏎');
    expect(r.output).toContain('multiline=true');
  });

  it('dotall flag (s) lets the dot cross lines', () => {
    const dir = searchProject();
    const noS = search(dir, { pattern: 'ActivityKind.{0,40}task_created' });
    const withS = search(dir, { pattern: 'ActivityKind.{0,40}task_created', flags: 's' });
    expect(noS.output).toContain('(no matches)');
    expect(withS.output).toContain('task_created');
    expect(withS.output).toContain('multiline=true');
  });

  it('rejects unsupported flags instead of silently ignoring them', () => {
    const dir = searchProject();
    const r = search(dir, { pattern: 'x', flags: 'igx' });
    expect(r.ok).toBe(false);
    expect(r.output).toContain('unsupported flags');
  });

  it('include filters by glob, exclude removes subtrees', () => {
    const dir = searchProject();
    const py = search(dir, { pattern: 'connect', include: ['**/*.py'] });
    expect(py.output).toContain('util.py');
    expect(py.output).toContain('vendor/gen.py'); // include is extension-only; vendor needs exclude
    const notVendor = search(dir, { pattern: 'connect', exclude: ['vendor/**'] });
    expect(notVendor.output).toContain('util.py');
    expect(notVendor.output).not.toContain('vendor');
    const mdOnly = search(dir, { pattern: 'connect', include: ['*.md'] });
    expect(mdOnly.output).toContain('README.md');
    expect(mdOnly.output).not.toContain('.py');
  });

  it('contextLines emits neighboring lines with their numbers', () => {
    const dir = searchProject();
    const r = search(dir, { pattern: 'task_created', contextLines: 1 });
    expect(r.ok).toBe(true);
    expect(r.output).toContain('project_created');
    expect(r.output).toContain('document_created');
    expect(r.output).toMatch(/    2: /);
  });

  it('maxResults caps matches and reports truncated=true', () => {
    const dir = searchProject();
    const big = mkdirSync(path.join(dir, 'bulk'), { recursive: true });
    for (let i = 0; i < 10; i++) writeFileSync(path.join(big, `f${i}.txt`), 'needle here\n');
    const r = search(dir, { pattern: 'needle', include: ['bulk/**'], maxResults: 3 });
    expect(r.ok).toBe(true);
    expect(r.output).toContain('matches=3');
    expect(r.output).toContain('truncated=true');
  });

  it('reports capabilities on empty results so the caller knows what ran', () => {
    const dir = searchProject();
    const r = search(dir, { pattern: 'definitely-not-present-xyz' });
    expect(r.ok).toBe(true);
    expect(r.output).toContain('(no matches)');
    expect(r.output).toContain('languageAware=false');
    expect(r.output).toContain('matches=0');
  });

  it('skips binary content instead of matching garbage', () => {
    const dir = searchProject();
    // Contains the literal needle text but a NUL byte marks it binary.
    writeFileSync(path.join(dir, 'blob.bin'), Buffer.concat([Buffer.from('needle'), Buffer.from([0x00]), Buffer.from('needle')]));
    const r = search(dir, { pattern: 'needle', include: ['**/*.bin'] });
    expect(r.output).toContain('(no matches)');
  });
});
