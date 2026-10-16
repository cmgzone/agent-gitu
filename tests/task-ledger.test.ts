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
  it.each([false, true])('retains a same-worded requirement as a fresh criterion in a new phase (structured=%s)', (structured) => {
    const dir = makeProject(),
      guard = ProjectGuard.detect(dir);
    const ledger = TaskLedger.create({ repoRoot: dir, goal: 'First feature', project: guard.lock, mode: 'agent' });
    ledger.ensureInitialWorkPhase();
    ledger.setCriteriaFromSpecs([{ text: 'Regression passes', verification: 'node first-test.cjs' }]);
    ledger.completeActiveWorkPhase();
    ledger.startWorkPhase({ kind: 'follow_up', goal: 'Second feature' });
    const added = structured ? ledger.appendCriteriaFromSpecs([{ text: 'Regression passes', verification: 'node second-test.cjs' }]) : ledger.appendCriteria(['Regression passes']);
    expect(added).toHaveLength(1);
    expect(added[0]!.id).toBe('ac-2');
    expect(ledger.data.acceptanceCriteria[0]!.verification).toBe('node first-test.cjs');
    expect(structured ? ledger.appendCriteriaFromSpecs([{ text: 'Regression passes' }]) : ledger.appendCriteria(['Regression passes'])).toHaveLength(0);
  });

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
