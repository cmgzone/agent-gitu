import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EvidenceEngine } from '../src/evidence/evidence.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { Reporter } from '../src/report/reporter.js';

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hermes-reporter-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'reporter-test' }));
  return dir;
}

describe('Reporter', () => {
  it('keeps reports concise while retaining expandable structured evidence', () => {
    const dir = makeProject();
    const ledger = TaskLedger.create({
      repoRoot: dir,
      goal: 'Verify the application',
      project: ProjectGuard.detect(dir).lock,
      mode: 'standard',
    });
    ledger.trackFile('src/app.ts');
    ledger.trackFile('.hermes/tasks/task.json');
    ledger.trackFile('node_modules/example/index.js');
    ledger.trackFile('tools/verify_tmp.js');

    new EvidenceEngine().record(ledger.data, {
      kind: 'test',
      label: 'Project test suite',
      command: 'npm run test -- --coverage',
      passed: true,
      exitCode: 0,
      output: 'all tests passed',
    });
    ledger.recordAction({
      tool: 'browse',
      paramsHash: 'browse-shot',
      paramsSummary: 'browse screenshot',
      status: 'success',
      reason: 'visually verify the application',
      expected: 'a screenshot',
      durationMs: 20,
    });
    ledger.recordAction({
      tool: 'browse',
      paramsHash: 'browse-click',
      paramsSummary: 'browse click #save',
      status: 'error',
      reason: 'exercise the save button',
      expected: 'the page saves',
      durationMs: 20,
    });

    const report = new Reporter().build(ledger, 'complete', {
      summary: 'The application was verified.',
      risks: [],
      followUps: [],
    });

    expect(report.filesChanged).toEqual(['src/app.ts']);
    expect(report.verification).toEqual(['PASS [test] Project test suite']);
    expect(report.verificationDetails).toMatchObject([{ kind: 'test', passed: true, command: 'npm run test -- --coverage', outputExcerpt: 'all tests passed' }]);
    expect(report.browserActivity).toEqual({ total: 2, successful: 1, screenshots: 1 });
    expect(new Reporter().render(report)).not.toContain('(npm run test -- --coverage)');
    expect(new Reporter().render(report)).toContain('Visual verification:');
  });

  it('renders a follow-up as a scoped delivery instead of replaying earlier work', () => {
    const dir = makeProject();
    const ledger = TaskLedger.create({
      repoRoot: dir,
      goal: 'Build the original dashboard',
      project: ProjectGuard.detect(dir).lock,
      mode: 'standard',
    });
    ledger.setCriteria(['original dashboard works']);
    ledger.setPlan([{ description: 'Build dashboard', verification: 'npm test' }]);
    ledger.recordAction({
      tool: 'write_file',
      paramsHash: 'old',
      paramsSummary: 'write_file src/dashboard.ts',
      status: 'success',
      reason: 'build dashboard',
      expected: 'dashboard exists',
      durationMs: 1,
    });
    new EvidenceEngine().record(ledger.data, { kind: 'test', label: 'old test', command: 'npm test', passed: true, output: 'ok' });
    const initial = ledger.ensureInitialWorkPhase('Build the original dashboard', 'old-base');
    ledger.completeActiveWorkPhase();

    const phase = ledger.startWorkPhase({ kind: 'follow_up', goal: 'Add a compact export button', baseRef: 'follow-up-base' });
    const [criterion] = ledger.appendCriteria(['export button works']);
    ledger.appendPlan([{ description: 'Add export button', verification: 'npm test -- export' }]);
    ledger.recordAction({
      tool: 'write_file',
      paramsHash: 'new',
      paramsSummary: 'write_file src/export.ts',
      status: 'success',
      reason: 'add the export action',
      expected: 'button exports data',
      durationMs: 1,
    });
    new EvidenceEngine().record(ledger.data, { kind: 'test', label: 'export test', command: 'npm test -- export', passed: true, output: 'ok' });

    const report = new Reporter().build(ledger, 'complete', { summary: 'Added the export button.', risks: [], followUps: [] }, undefined, {
      goal: phase.goal,
      phase: { id: phase.id, kind: phase.kind, startedAt: phase.startedAt },
      evidenceStartIndex: phase.evidenceStartIndex,
      actionStartIndex: phase.actionStartIndex,
      criterionIds: criterion ? [criterion.id] : [],
      filesChanged: ['src/export.ts'],
    });

    expect(initial.kind).toBe('initial');
    expect(report.goal).toBe('Add a compact export button');
    expect(report.phase?.kind).toBe('follow_up');
    expect(report.changes).toEqual(['Updated src/export.ts — add the export action']);
    expect(report.filesChanged).toEqual(['src/export.ts']);
    expect(report.verification).toEqual(['PASS [test] export test']);
    expect(new Reporter().render(report)).toContain('Follow-up work (earlier task history preserved)');
  });
});
