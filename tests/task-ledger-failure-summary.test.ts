import { describe, expect, it } from 'vitest';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import type { ActionRecord, TaskLedgerData } from '../src/types.js';

function failure(id: string, signature: string, summary: string, observation: string): ActionRecord {
  return {
    id,
    tool: 'run_command',
    paramsHash: `hash-${id}`,
    paramsSummary: summary,
    status: 'error',
    errorSignature: signature,
    reason: 'verification',
    expected: 'pass',
    observation,
    durationMs: 1,
    createdAt: new Date().toISOString(),
  };
}

function ledgerLike(actions: ActionRecord[]): TaskLedger {
  return {
    data: { actions } as TaskLedgerData,
  } as TaskLedger;
}

describe('TaskLedger.failureSummary — live failure authority', () => {
  it('shows only the newest distinct failure by default', () => {
    const ledger = ledgerLike([
      failure('old', 'movement-mismatch', '$ node test/game.test.js', 'expected 403.6 got 406.8'),
      failure('new', 'cull-impossible', '$ node test/game.test.js', 'five pipes fully left the screen by frame 700'),
    ]);

    const summary = TaskLedger.prototype.failureSummary.call(ledger);

    expect(summary).toHaveLength(1);
    expect(summary[0]).toContain('five pipes fully left the screen');
    expect(summary[0]).not.toContain('403.6');
  });

  it('keeps older failures available when an audit caller explicitly asks for them', () => {
    const ledger = ledgerLike([
      failure('old', 'movement-mismatch', '$ node test/game.test.js', 'expected 403.6 got 406.8'),
      failure('new', 'cull-impossible', '$ node test/game.test.js', 'five pipes fully left the screen by frame 700'),
    ]);

    const audit = TaskLedger.prototype.failureSummary.call(ledger, 5);

    expect(audit).toHaveLength(2);
    expect(audit[0]).toContain('five pipes fully left the screen');
    expect(audit[1]).toContain('403.6');
  });

  it('still dedupes repeated instances of the same failure signature', () => {
    const ledger = ledgerLike([
      failure('a1', 'same-assertion', '$ npm test', 'expected 403.6 got 406.8'),
      failure('a2', 'same-assertion', '$ npm test', 'expected 404 got 407'),
    ]);

    expect(TaskLedger.prototype.failureSummary.call(ledger, 5)).toHaveLength(1);
  });
});
