import { describe, expect, it } from 'vitest';
import { commandsMatch, EvidenceEngine } from '../src/evidence/evidence.js';
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

describe('commandsMatch — exact normalized matching', () => {
  it('matches identical commands', () => {
    expect(commandsMatch('npm test -- auth', 'npm test -- auth')).toBe(true);
  });

  it('matches commands with extra whitespace', () => {
    expect(commandsMatch('npm test -- auth', 'npm   test --   auth')).toBe(true);
    expect(commandsMatch('  npm test -- auth  ', 'npm test -- auth')).toBe(true);
  });

  it('matches commands with different casing', () => {
    expect(commandsMatch('NPM TEST -- auth', 'npm test -- auth')).toBe(true);
  });

  it('rejects command injection with && operator', () => {
    expect(commandsMatch('npm test -- auth', 'npm test -- auth && echo hacked')).toBe(false);
  });

  it('rejects command injection with ; operator', () => {
    expect(commandsMatch('npm test -- auth', 'npm test -- auth; rm -rf /')).toBe(false);
  });

  it('rejects command injection with | operator', () => {
    expect(commandsMatch('npm test -- auth', 'npm test -- auth | cat /etc/passwd')).toBe(false);
  });

  it('rejects different arguments', () => {
    expect(commandsMatch('npm test -- auth', 'npm test -- unrelated')).toBe(false);
  });

  it('rejects completely different commands', () => {
    expect(commandsMatch('npm test -- auth', 'node --version')).toBe(false);
  });
});

describe('structured criteria — evidence relevance checking', () => {
  it('rejects evidence whose command does not match the required verification', () => {
    const engine = new EvidenceEngine();
    const ledger = emptyLedger();
    ledger.acceptanceCriteria = EvidenceEngine.criteriaFromSpecs([
      { text: 'TypeScript compiles', verification: 'npx tsc --noEmit', evidenceType: 'typecheck_success' },
    ]);

    const ev = engine.record(ledger, {
      kind: 'typecheck',
      label: 'wrong tsc command',
      command: 'npx tsc --build',
      exitCode: 0,
      passed: true,
      output: 'compiled ok',
    });

    const result = engine.link(ledger, 'ac-1', ev.id);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('does not match the required verification');
    expect(engine.gate(ledger).open).toBe(false);
  });

  it('rejects evidence whose kind does not match the required evidence type', () => {
    const engine = new EvidenceEngine();
    const ledger = emptyLedger();
    ledger.acceptanceCriteria = EvidenceEngine.criteriaFromSpecs([
      { text: 'Auth tests pass', verification: 'npm test -- auth', evidenceType: 'test_success' },
    ]);

    // Correct command but wrong kind classification
    const ev = engine.record(ledger, {
      kind: 'command',
      label: 'npm test -- auth',
      command: 'npm test -- auth',
      exitCode: 0,
      passed: true,
      output: '12 tests passed',
    });

    const result = engine.link(ledger, 'ac-1', ev.id);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('does not match the required type');
  });

  it('accepts evidence when both command and kind match', () => {
    const engine = new EvidenceEngine();
    const ledger = emptyLedger();
    ledger.acceptanceCriteria = EvidenceEngine.criteriaFromSpecs([
      { text: 'Auth tests pass', verification: 'npm test -- auth', evidenceType: 'test_success' },
    ]);

    const ev = engine.record(ledger, {
      kind: 'test',
      label: 'npm test -- auth',
      command: 'npm test -- auth',
      exitCode: 0,
      passed: true,
      output: '12 tests passed',
    });

    const result = engine.link(ledger, 'ac-1', ev.id);
    expect(result.ok).toBe(true);
    expect(engine.gate(ledger).open).toBe(true);
  });

  it('accepts evidence when no verification is specified (backward compat)', () => {
    const engine = new EvidenceEngine();
    const ledger = emptyLedger();
    // Plain text criterion — no verification or evidenceType
    ledger.acceptanceCriteria = EvidenceEngine.criteriaFromTexts(['something verified']);

    const ev = engine.record(ledger, {
      kind: 'command',
      label: 'node --version',
      command: 'node --version',
      exitCode: 0,
      passed: true,
      output: 'v20.0.0',
    });

    const result = engine.link(ledger, 'ac-1', ev.id);
    expect(result.ok).toBe(true);
    expect(engine.gate(ledger).open).toBe(true);
  });

  it('rejects evidence with no command when criterion requires verification', () => {
    const engine = new EvidenceEngine();
    const ledger = emptyLedger();
    ledger.acceptanceCriteria = EvidenceEngine.criteriaFromSpecs([
      { text: 'Tests pass', verification: 'npm test', evidenceType: 'test_success' },
    ]);

    // Manual evidence (no command)
    const ev = engine.record(ledger, {
      kind: 'manual',
      label: 'I checked it manually',
      passed: true,
      output: 'looks good',
    });

    const result = engine.link(ledger, 'ac-1', ev.id);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('evidence has no command');
  });

  it('criteriaFromSpecs creates criteria with verification constraints', () => {
    const criteria = EvidenceEngine.criteriaFromSpecs([
      { text: 'TypeScript compiles', verification: 'npx tsc --noEmit', evidenceType: 'typecheck_success' },
      { text: 'Tests pass', verification: 'npm test', evidenceType: 'test_success' },
      { text: 'Feature works' },
    ]);

    expect(criteria).toHaveLength(3);
    expect(criteria[0]!.verification).toBe('npx tsc --noEmit');
    expect(criteria[0]!.evidenceType).toBe('typecheck_success');
    expect(criteria[1]!.verification).toBe('npm test');
    expect(criteria[2]!.verification).toBeUndefined();
    expect(criteria[2]!.evidenceType).toBeUndefined();
  });

  it('normalizeCriteria converts mixed strings and specs', () => {
    const specs = EvidenceEngine.normalizeCriteria([
      'plain text criterion',
      { text: 'structured criterion', verification: 'npm test', evidenceType: 'test_success' },
    ]);

    expect(specs).toHaveLength(2);
    expect(specs[0]!.text).toBe('plain text criterion');
    expect(specs[0]!.verification).toBeUndefined();
    expect(specs[1]!.verification).toBe('npm test');
  });
});

describe('lying-specialist regression', () => {
  // ======================================================================
  // ARCHITECTURAL INVARIANT:
  // Evidence must demonstrate the criterion, not merely be successful.
  //
  // A specialist running `node --version` (exit 0) and claiming it proves
  // "JWT authentication works" must be rejected by the evidence gate.
  //
  // This test MUST NOT be made to pass by simply banning `node --version`
  // in TRIVIAL_EVIDENCE_RE. The rejection must come from the structured
  // criterion contract: the criterion requires a specific verification
  // command, and irrelevant evidence cannot satisfy it.
  // ======================================================================

  it('rejects irrelevant evidence: node --version cannot satisfy "JWT authentication works"', () => {
    const engine = new EvidenceEngine();
    const ledger = emptyLedger();
    ledger.acceptanceCriteria = EvidenceEngine.criteriaFromSpecs([
      { text: 'JWT authentication works', verification: 'npm test -- auth', evidenceType: 'test_success' },
    ]);

    // Specialist runs an irrelevant command
    const fakeEvidence = engine.record(ledger, {
      kind: 'command',
      label: 'node --version',
      command: 'node --version',
      exitCode: 0,
      passed: true,
      output: 'v20.0.0',
    });

    // Specialist tries to claim the criterion
    const claim = engine.link(ledger, 'ac-1', fakeEvidence.id);

    // ❌ Evidence gate rejects completion
    expect(claim.ok).toBe(false);
    expect(claim.reason).toContain('does not match the required verification');

    // ❌ Gate stays closed — no commit, no merge
    expect(engine.gate(ledger).open).toBe(false);
  });

  it('rejects command injection: "npm test -- auth && echo hacked" cannot satisfy the criterion', () => {
    const engine = new EvidenceEngine();
    const ledger = emptyLedger();
    ledger.acceptanceCriteria = EvidenceEngine.criteriaFromSpecs([
      { text: 'Auth tests pass', verification: 'npm test -- auth', evidenceType: 'test_success' },
    ]);

    const injectedEvidence = engine.record(ledger, {
      kind: 'test',
      label: 'npm test -- auth && echo hacked',
      command: 'npm test -- auth && echo hacked',
      exitCode: 0,
      passed: true,
      output: 'all passed',
    });

    const claim = engine.link(ledger, 'ac-1', injectedEvidence.id);

    // ❌ Exact matching rejects the injected command
    expect(claim.ok).toBe(false);
    expect(claim.reason).toContain('does not match');
    expect(engine.gate(ledger).open).toBe(false);
  });

  it('accepts relevant evidence when the correct verification is run', () => {
    const engine = new EvidenceEngine();
    const ledger = emptyLedger();
    ledger.acceptanceCriteria = EvidenceEngine.criteriaFromSpecs([
      { text: 'JWT authentication works', verification: 'npm test -- auth', evidenceType: 'test_success' },
    ]);

    // Specialist runs the CORRECT command
    const realEvidence = engine.record(ledger, {
      kind: 'test',
      label: 'npm test -- auth',
      command: 'npm test -- auth',
      exitCode: 0,
      passed: true,
      output: 'Tests passed: 12/12',
    });

    const claim = engine.link(ledger, 'ac-1', realEvidence.id);

    // ✅ Evidence gate accepts
    expect(claim.ok).toBe(true);
    expect(engine.gate(ledger).open).toBe(true);
  });
});

