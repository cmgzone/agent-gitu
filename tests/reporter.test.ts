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
    expect(report.verificationDetails).toMatchObject([
      { kind: 'test', passed: true, command: 'npm run test -- --coverage', outputExcerpt: 'all tests passed' },
    ]);
    expect(report.browserActivity).toEqual({ total: 2, successful: 1, screenshots: 1 });
    expect(new Reporter().render(report)).not.toContain('(npm run test -- --coverage)');
    expect(new Reporter().render(report)).toContain('Visual verification:');
  });
});
