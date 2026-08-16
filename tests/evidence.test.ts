import { describe, expect, it } from 'vitest';
import { EvidenceEngine } from '../src/evidence/evidence.js';
import type { TaskLedgerData } from '../src/types.js';

function emptyLedger(): TaskLedgerData {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    taskId: 't',
    goal: 'g',
    status: 'executing',
    mode: 'standard',
    project: {
      name: 'p',
      repoRoot: '/x',
      techStack: [],
      entrypoints: [],
      ignorePaths: [],
      lockedAt: now,
    },
    acceptanceCriteria: EvidenceEngine.criteriaFromTexts(['tests pass', 'feature works']),
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

describe('EvidenceEngine', () => {
  it('keeps the gate closed until every criterion has passing evidence', () => {
    const engine = new EvidenceEngine();
    const ledger = emptyLedger();

    expect(engine.gate(ledger).open).toBe(false);

    const ev = engine.record(ledger, { kind: 'test', label: 'npm test', passed: true, output: 'ok' });
    engine.link(ledger, 'ac-1', ev.id);
    expect(engine.gate(ledger).open).toBe(false);
    expect(engine.gate(ledger).satisfiedCount).toBe(1);

    engine.link(ledger, 'ac-2', ev.id);
    expect(engine.gate(ledger).open).toBe(true);
  });

  it('refuses to link failing evidence', () => {
    const engine = new EvidenceEngine();
    const ledger = emptyLedger();
    const ev = engine.record(ledger, { kind: 'test', label: 'npm test', passed: false, output: 'boom' });
    const result = engine.link(ledger, 'ac-1', ev.id);
    expect(result.ok).toBe(false);
    expect(ledger.acceptanceCriteria[0]!.satisfied).toBe(false);
  });

  it('rejects unknown criterion or evidence ids', () => {
    const engine = new EvidenceEngine();
    const ledger = emptyLedger();
    const ev = engine.record(ledger, { kind: 'test', label: 'x', passed: true, output: 'ok' });
    expect(engine.link(ledger, 'ac-99', ev.id).ok).toBe(false);
    expect(engine.link(ledger, 'ac-1', 'ev-nope').ok).toBe(false);
  });

  it('keeps the gate closed when there are no criteria at all', () => {
    const engine = new EvidenceEngine();
    const ledger = emptyLedger();
    ledger.acceptanceCriteria = [];
    expect(engine.gate(ledger).open).toBe(false);
  });
});
