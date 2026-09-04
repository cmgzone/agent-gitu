import { describe, expect, it } from 'vitest';
import { EvidenceEngine, verificationFailureSignature } from '../src/evidence/evidence.js';
import type { TaskLedgerData } from '../src/types.js';

function ledger(): TaskLedgerData {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    taskId: 'task-recovery',
    goal: 'fix the failing game tests',
    status: 'executing',
    mode: 'standard',
    project: {
      name: 'game',
      repoRoot: '/repo',
      techStack: ['typescript'],
      entrypoints: [],
      ignorePaths: [],
      lockedAt: now,
    },
    acceptanceCriteria: EvidenceEngine.criteriaFromTexts(['tests pass']),
    constraints: [],
    nonGoals: [],
    plan: [],
    actions: [],
    evidence: [],
    filesChanged: [],
    checkpoints: [],
    blockers: [],
    createdAt: now,
    updatedAt: now,
  };
}

describe('verification failure identity', () => {
  it('treats numeric drift in the same assertion as the same failure', () => {
    expect(verificationFailureSignature('AssertionError: expected 403.6, received 406.8'))
      .toBe(verificationFailureSignature('AssertionError: expected 404.0, received 407.2'));
  });

  it('distinguishes a materially different assertion', () => {
    expect(verificationFailureSignature('AssertionError: expected 403.6, received 406.8'))
      .not.toBe(verificationFailureSignature('AssertionError: five pipes fully left the screen by frame 700'));
  });
});

describe('EvidenceEngine hypothesis authority', () => {
  it('keeps the current hypothesis when the same failure merely changes numeric values', () => {
    const engine = new EvidenceEngine();
    const data = ledger();
    engine.record(data, {
      kind: 'test',
      label: 'node test/game.test.js',
      command: 'node test/game.test.js',
      passed: false,
      output: 'AssertionError: expected 403.6, received 406.8',
    });
    data.currentHypothesis = 'pipe movement accounting is wrong';

    engine.record(data, {
      kind: 'test',
      label: 'node test/game.test.js',
      command: 'node test/game.test.js',
      passed: false,
      output: 'AssertionError: expected 404.0, received 407.2',
    });

    expect(data.currentHypothesis).toBe('pipe movement accounting is wrong');
  });

  it('retires the old hypothesis when the same verification command reveals a new failure', () => {
    const engine = new EvidenceEngine();
    const data = ledger();
    engine.record(data, {
      kind: 'test',
      label: 'node test/game.test.js',
      command: 'node test/game.test.js',
      passed: false,
      output: 'AssertionError: expected 403.6, received 406.8',
    });
    data.currentHypothesis = 'pipe movement accounting is wrong';

    engine.record(data, {
      kind: 'test',
      label: 'node test/game.test.js',
      command: 'node test/game.test.js',
      passed: false,
      output: 'AssertionError: five pipes fully left the screen by frame 700',
    });

    expect(data.currentHypothesis).toBeUndefined();
  });

  it('retires the old hypothesis when the failing verification passes', () => {
    const engine = new EvidenceEngine();
    const data = ledger();
    engine.record(data, {
      kind: 'test',
      label: 'npm test',
      command: 'npm test',
      passed: false,
      output: 'AssertionError: score mismatch',
    });
    data.currentHypothesis = 'score update is off by one frame';

    engine.record(data, {
      kind: 'test',
      label: 'npm test',
      command: 'npm test',
      passed: true,
      output: '11 tests passed',
    });

    expect(data.currentHypothesis).toBeUndefined();
  });

  it('does not retire a hypothesis because an unrelated verification command fails', () => {
    const engine = new EvidenceEngine();
    const data = ledger();
    engine.record(data, {
      kind: 'test',
      label: 'npm test',
      command: 'npm test',
      passed: false,
      output: 'AssertionError: score mismatch',
    });
    data.currentHypothesis = 'score update is off by one frame';

    engine.record(data, {
      kind: 'build',
      label: 'npm run build',
      command: 'npm run build',
      passed: false,
      output: 'TypeScript compile error in unrelated file',
    });

    expect(data.currentHypothesis).toBe('score update is off by one frame');
  });
});
