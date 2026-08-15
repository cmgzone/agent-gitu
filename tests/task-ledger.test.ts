import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hermes-ledger-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'ledger-test', scripts: { test: 'vitest run' } }));
  return dir;
}

describe('TaskLedger', () => {
  it('creates, persists, and reloads a ledger', () => {
    const dir = makeProject();
    const guard = ProjectGuard.detect(dir);
    const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'Fix the thing', project: guard.lock, mode: 'standard' });

    expect(ledger.data.taskId).toMatch(/^hermes-task-\d{8}-[0-9a-f]{6}$/);
    expect(ledger.data.status).toBe('intake');

    const reloaded = TaskLedger.load(path.resolve(dir), ledger.data.taskId);
    expect(reloaded?.data.goal).toBe('Fix the thing');
  });

  it('tracks criteria, plan, actions, and files', () => {
    const dir = makeProject();
    const guard = ProjectGuard.detect(dir);
    const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'g', project: guard.lock, mode: 'fast' });

    ledger.setCriteria(['a works', 'b works']);
    expect(ledger.data.acceptanceCriteria.map((c) => c.id)).toEqual(['ac-1', 'ac-2']);

    ledger.setPlan([{ description: 'step one', verification: 'tests pass' }]);
    expect(ledger.data.plan[0]!.id).toBe('step-1');

    ledger.recordAction({
      tool: 'read_file',
      paramsHash: 'h',
      paramsSummary: 'read a.ts',
      status: 'success',
      reason: 'inspect',
      expected: 'content',
      durationMs: 5,
    });
    expect(ledger.data.actions).toHaveLength(1);

    ledger.trackFile('src/a.ts');
    ledger.trackFile('src/a.ts');
    expect(ledger.data.filesChanged).toEqual(['src/a.ts']);

    const reloaded = TaskLedger.load(path.resolve(dir), ledger.data.taskId);
    expect(reloaded?.data.actions).toHaveLength(1);
    expect(reloaded?.data.plan[0]!.description).toBe('step one');
  });

  it('enforces the action budget', () => {
    const dir = makeProject();
    const guard = ProjectGuard.detect(dir);
    const ledger = TaskLedger.create({
      repoRoot: path.resolve(dir),
      goal: 'g',
      project: guard.lock,
      mode: 'fast',
      budgets: { maxActions: 2 },
    });
    expect(ledger.budgetExceeded()).toBeUndefined();
    for (let i = 0; i < 2; i++) {
      ledger.recordAction({ tool: 'read_file', paramsHash: `h${i}`, paramsSummary: 'x', status: 'success', reason: 'r', expected: 'e', durationMs: 1 });
    }
    expect(ledger.budgetExceeded()).toMatch(/budget/i);
  });

  it('lists tasks newest first', () => {
    const dir = makeProject();
    const guard = ProjectGuard.detect(dir);
    const a = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'first', project: guard.lock, mode: 'fast' });
    const b = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'second', project: guard.lock, mode: 'fast' });
    const tasks = TaskLedger.list(path.resolve(dir));
    expect(tasks.length).toBe(2);
    expect(tasks.map((t) => t.data.taskId)).toContain(a.data.taskId);
    expect(tasks.map((t) => t.data.taskId)).toContain(b.data.taskId);
  });
});
