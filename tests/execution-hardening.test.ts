import { describe, expect, it } from 'vitest';
import { EvidenceEngine } from '../src/evidence/evidence.js';
import { classifyEvidenceRelevance, evaluateOracleQuality } from '../src/evidence/oracle-quality.js';
import { parentReverifyCriterion, type OracleRunner, type ReverifyLedgerView } from '../src/evidence/reverify.js';
import { MissionGraph, pathsOverlap, scopesOverlap } from '../src/execution/mission.js';
import type { AcceptanceCriterion, Evidence } from '../src/types.js';

/**
 * Execution-hardening regression suite (scenarios A–O).
 *
 * These tests pin the NEW semantics added by the execution-hardening increment:
 * formal parent re-verification that actually re-executes oracles, evidence
 * freshness, weak-oracle detection, semantic evidence relevance, dependency-
 * aware rolling dispatch, explicit ownership, abandonment, amendments,
 * integration verification, and evidence-derived final audits.
 */

const now = (): string => new Date().toISOString();

function criterion(over: Partial<AcceptanceCriterion> & { id: string; text: string }): AcceptanceCriterion {
  return { evidenceIds: [], satisfied: false, ...over };
}

function evidence(over: Partial<Evidence> & { id: string }): Evidence {
  return {
    kind: 'test',
    label: over.id,
    passed: true,
    outputExcerpt: 'PASS',
    createdAt: now(),
    stale: false,
    ...over,
  };
}

/** A deterministic oracle runner. Records every command it was asked to run so
 *  tests can assert that re-verification ACTUALLY executed. */
function scriptedRunner(results: Record<string, { passed: boolean; output?: string; exitCode?: number }>): {
  runner: OracleRunner;
  calls: string[];
} {
  const calls: string[] = [];
  const runner: OracleRunner = async (req) => {
    calls.push(req.command);
    const r = results[req.command] ?? { passed: false, output: 'no scripted result', exitCode: 1 };
    return { passed: r.passed, output: r.output ?? (r.passed ? 'PASS' : 'FAIL'), exitCode: r.exitCode ?? (r.passed ? 0 : 1) };
  };
  return { runner, calls };
}

function leafLedger(criteria: AcceptanceCriterion[], evidenceRecords: Evidence[] = []): ReverifyLedgerView {
  return { acceptanceCriteria: criteria, evidence: evidenceRecords };
}

describe('oracle quality (scenario D: trivial oracles detected)', () => {
  it('rejects a trivially-passing no-op oracle as INVALID', () => {
    const v = evaluateOracleQuality({ command: 'git status', criterionText: 'auth works' });
    expect(v.strength).toBe('INVALID');
    expect(v.diagnostics.some((d) => d.rule === 'trivial-command')).toBe(true);
  });

  it('rejects an echo oracle that manufactures its own success', () => {
    const v = evaluateOracleQuality({ command: 'echo PASS', criterionText: 'auth works' });
    expect(v.strength).toBe('INVALID');
    expect(v.diagnostics.some((d) => d.rule === 'echoes-expected')).toBe(true);
  });

  it('rejects a command that copies the expected value directly', () => {
    const v = evaluateOracleQuality({ command: 'assert 42 42', criterionText: 'adds numbers', expected: '42' });
    expect(v.strength).toBe('INVALID');
    expect(v.diagnostics.some((d) => d.rule === 'expected-copied-into-command')).toBe(true);
  });

  it('flags an unfalsifiable oracle (cannot fail) as WEAK', () => {
    const v = evaluateOracleQuality({ command: 'npm run verify auth || true', criterionText: 'auth works' });
    expect(v.strength).toBe('WEAK');
    expect(v.diagnostics.some((d) => d.rule === 'negative-assertion-cannot-fail')).toBe(true);
  });

  it.each(['npm test -- auth && true', 'npm test -- auth && exit 0'])(
    'accepts a success-only suffix that preserves verification failures: %s',
    (command) => {
      expect(evaluateOracleQuality({ command, criterionText: 'auth works' }).strength).toBe('STRONG');
    },
  );

  it.each(['npm test -- auth || exit 0', 'npm test -- auth; true', 'npm test -- auth; exit 0'])(
    'still rejects suffixes that hide verification failures: %s',
    (command) => {
      expect(evaluateOracleQuality({ command, criterionText: 'auth works' }).strength).toBe('WEAK');
    },
  );

  it('marks a manual criterion as INSUFFICIENT + non-executable, NOT broken', () => {
    const v = evaluateOracleQuality({ command: undefined, criterionText: 'UI looks polished' });
    expect(v.strength).toBe('INSUFFICIENT');
    expect(v.executable).toBe(false);
    expect(v.diagnostics.some((d) => d.rule === 'no-oracle')).toBe(true);
  });

  it('accepts a legitimate suite-runner oracle as STRONG', () => {
    const v = evaluateOracleQuality({ command: 'npm test -- auth', criterionText: 'auth works' });
    expect(v.strength).toBe('STRONG');
    expect(v.executable).toBe(true);
  });
});

describe('semantic evidence relevance (scenario C: unrelated passing command rejected)', () => {
  it('rejects a passing command that does not match the pinned verification', () => {
    const c = criterion({ id: 'ac-1', text: 'auth works', verification: 'npm test -- auth' });
    const ev = evidence({ id: 'ev-1', command: 'npm test -- totally-unrelated-suite', passed: true });
    const { strength, diagnostics } = classifyEvidenceRelevance(c, ev);
    expect(strength).toBe('INVALID');
    expect(diagnostics.some((d) => d.rule === 'wrong-command')).toBe(true);
  });

  it('rejects stale evidence as INSUFFICIENT', () => {
    const c = criterion({ id: 'ac-1', text: 'auth works', verification: 'npm test -- auth' });
    const ev = evidence({ id: 'ev-1', command: 'npm test -- auth', stale: true });
    expect(classifyEvidenceRelevance(c, ev).strength).toBe('INSUFFICIENT');
  });

  it('downgrades a generic unpinned command link to WEAK', () => {
    const c = criterion({ id: 'ac-1', text: 'auth works' }); // no verification, no type
    const ev = evidence({ id: 'ev-1', kind: 'command', command: 'node run-something.js' });
    expect(classifyEvidenceRelevance(c, ev).strength).toBe('WEAK');
  });
});

describe('parent re-verification (scenarios A, B, K)', () => {
  it.each([true, false])('preserves the actual result with a success-only suffix (passed=%s)', async (passed) => {
    const command = 'npm test -- auth && exit 0';
    const crit = criterion({ id: 'ac-1', text: 'auth works', verification: command, evidenceType: 'test_success' });
    const ledger = leafLedger([crit]);
    const { runner, calls } = scriptedRunner({ [command]: { passed } });

    const result = await parentReverifyCriterion({ ledger, criterionId: crit.id, currentFingerprint: 'fp-1', runOracle: runner });

    expect(calls).toEqual([command]);
    expect(result.verified).toBe(passed);
    expect(crit.satisfied).toBe(passed);
  });

  it('K: actually EXECUTES the oracle instead of trusting a passing self-report', async () => {
    const crit = criterion({ id: 'ac-1', text: 'auth works', verification: 'npm test -- auth', evidenceIds: ['ev-self'], satisfied: true });
    const selfReport = evidence({ id: 'ev-self', command: 'npm test -- auth', workspaceFingerprint: 'fp-1' });
    const ledger = leafLedger([crit], [selfReport]);
    const { runner, calls } = scriptedRunner({ 'npm test -- auth': { passed: true, output: 'PASS' } });

    const res = await parentReverifyCriterion({ ledger, criterionId: 'ac-1', currentFingerprint: 'fp-1', runOracle: runner });

    expect(calls).toEqual(['npm test -- auth']); // re-execution happened
    expect(res.mode).toBe('EXECUTED_PASS');
    expect(res.verified).toBe(true);
    expect(res.freshEvidenceId).toBeDefined();
    expect(res.freshEvidenceId).not.toBe('ev-self'); // fresh evidence, not the self-report
  });

  it('A: a passing self-report is refuted when the parent re-run FAILS', async () => {
    const crit = criterion({ id: 'ac-1', text: 'auth works', verification: 'npm test -- auth', evidenceIds: ['ev-self'], satisfied: true });
    const selfReport = evidence({ id: 'ev-self', command: 'npm test -- auth', workspaceFingerprint: 'fp-1' });
    const ledger = leafLedger([crit], [selfReport]);
    const { runner, calls } = scriptedRunner({ 'npm test -- auth': { passed: false, output: 'FAIL auth.spec' } });

    const res = await parentReverifyCriterion({ ledger, criterionId: 'ac-1', currentFingerprint: 'fp-1', runOracle: runner });

    expect(calls).toEqual(['npm test -- auth']);
    expect(res.mode).toBe('EXECUTED_FAIL');
    expect(res.verified).toBe(false);
    expect(crit.satisfied).toBe(false); // stale satisfaction cleared
  });

  it('K: without a runner, a runnable criterion is NOT silently treated as re-executed', async () => {
    const crit = criterion({ id: 'ac-1', text: 'auth works', verification: 'npm test -- auth', evidenceIds: ['ev-self'], satisfied: true });
    const selfReport = evidence({ id: 'ev-self', command: 'npm test -- auth', workspaceFingerprint: 'fp-1' });
    const ledger = leafLedger([crit], [selfReport]);

    const res = await parentReverifyCriterion({ ledger, criterionId: 'ac-1', currentFingerprint: 'fp-1' });
    expect(res.mode).toBe('NO_RUNNER');
    expect(res.verified).toBe(false);
  });

  it('B: detects stale evidence when the workspace changed after the self-report', async () => {
    const crit = criterion({ id: 'ac-1', text: 'auth works', verification: 'npm test -- auth', evidenceIds: ['ev-self'], satisfied: true });
    const selfReport = evidence({ id: 'ev-self', command: 'npm test -- auth', workspaceFingerprint: 'fp-OLD' });
    const ledger = leafLedger([crit], [selfReport]);
    const { runner } = scriptedRunner({ 'npm test -- auth': { passed: true } });

    const res = await parentReverifyCriterion({ ledger, criterionId: 'ac-1', currentFingerprint: 'fp-NEW', runOracle: runner });

    expect(res.staleEvidenceIds).toContain('ev-self');
    expect(selfReport.stale).toBe(true);
    expect(res.verified).toBe(true); // fresh evidence supersedes the stale record
    const fresh = ledger.evidence.find((e) => e.id === res.freshEvidenceId)!;
    expect(fresh.workspaceFingerprint).toBe('fp-NEW');
    expect(fresh.fingerprint).toBeTruthy();
  });

  it('C: a passing but IRRELEVANT custom command cannot satisfy the criterion', async () => {
    const crit = criterion({ id: 'ac-1', text: 'auth works', verification: 'node scripts/unrelated-probe.js' });
    const ledger = leafLedger([crit], []);
    const { runner, calls } = scriptedRunner({ 'node scripts/unrelated-probe.js': { passed: true, output: 'ok' } });

    const res = await parentReverifyCriterion({ ledger, criterionId: 'ac-1', currentFingerprint: 'fp-1', runOracle: runner });

    expect(calls).toEqual(['node scripts/unrelated-probe.js']);
    expect(res.mode).toBe('EXECUTED_PASS');
    expect(res.verified).toBe(false); // passed, but too weak to prove the criterion
    expect(crit.satisfied).toBe(false);
    expect(res.diagnostics.some((d) => d.rule === 'oracle-ignores-criterion')).toBe(true);
  });

  it('D: a trivial oracle is rejected before execution and never verifies', async () => {
    const crit = criterion({ id: 'ac-1', text: 'auth works', verification: 'echo PASS' });
    const ledger = leafLedger([crit], []);
    const { runner, calls } = scriptedRunner({});

    const res = await parentReverifyCriterion({ ledger, criterionId: 'ac-1', currentFingerprint: 'fp-1', runOracle: runner });

    expect(calls).toEqual([]); // never executed
    expect(res.mode).toBe('ORACLE_REJECTED');
    expect(res.verified).toBe(false);
  });

  it('accepts fresh manual/judgment evidence without demanding automation', async () => {
    const crit = criterion({ id: 'ac-1', text: 'UI looks polished', evidenceIds: ['ev-manual'], satisfied: true });
    const manual = evidence({ id: 'ev-manual', kind: 'manual', command: undefined, workspaceFingerprint: 'fp-1' });
    const ledger = leafLedger([crit], [manual]);

    const res = await parentReverifyCriterion({ ledger, criterionId: 'ac-1', currentFingerprint: 'fp-1' });
    expect(res.mode).toBe('NOT_RUNNABLE');
    expect(res.verified).toBe(true);
  });
});

describe('execution tree: dependency-aware rolling dispatch (scenario G)', () => {
  function buildGraph(): MissionGraph {
    const g = new MissionGraph();
    g.defineLeaf({ id: 'A', objective: 'a', criteria: [{ text: 'a works', verification: 'npm test -- a' }], scope: ['src/a.ts'] });
    g.defineLeaf({ id: 'B', objective: 'b', criteria: [{ text: 'b works', verification: 'npm test -- b' }], scope: ['src/b.ts'] });
    g.defineLeaf({ id: 'C', objective: 'c', criteria: [{ text: 'c works', verification: 'npm test -- c' }], dependencies: ['A'], scope: ['src/c.ts'] });
    return g;
  }

  it('C is WAITING until A is verified, even though B is independent', () => {
    const g = buildGraph();
    expect(g.get('C')!.state).toBe('WAITING');
    expect(g.dispatchable(5).map((l) => l.id)).toEqual(['A', 'B']);
  });

  it('G: verifying A immediately unlocks C without waiting for B', async () => {
    const g = buildGraph();
    const { runner } = scriptedRunner({
      'npm test -- a': { passed: true },
      'npm test -- b': { passed: true },
      'npm test -- c': { passed: true },
    });
    expect(g.startLeaf('A').ok).toBe(true);
    expect(g.startLeaf('B').ok).toBe(true); // B in flight
    expect(g.selfVerify('A').ok).toBe(true);
    await g.parentReverify('A', { runner, fingerprint: 'fp-1' });
    expect(g.get('A')!.state).toBe('PARENT_REVERIFIED');

    // C becomes READY immediately even though B is still IN_FLIGHT.
    expect(g.get('C')!.state).toBe('READY');
    expect(g.dispatchable(5).map((l) => l.id)).toContain('C');
  });

  it('never invents dependencies: a leaf with no deps is READY at once', () => {
    const g = new MissionGraph();
    g.defineLeaf({ id: 'solo', objective: 's', criteria: ['s works'], scope: ['x'] });
    expect(g.get('solo')!.state).toBe('READY');
  });

  it('a newly-discovered dependency reverts a READY leaf to WAITING', () => {
    const g = new MissionGraph();
    g.defineLeaf({ id: 'X', objective: 'x', criteria: ['x'], scope: ['x'] });
    g.defineLeaf({ id: 'Y', objective: 'y', criteria: ['y'], scope: ['y'] });
    expect(g.get('X')!.state).toBe('READY');
    expect(g.addDependency('X', 'Y').ok).toBe(true);
    expect(g.get('X')!.state).toBe('WAITING');
    expect(g.get('X')!.blockedBy).toEqual(['Y']);
  });

  it('refuses to introduce a dependency cycle', () => {
    const g = new MissionGraph();
    g.defineLeaf({ id: 'A', objective: 'a', criteria: ['a'], scope: ['a'] });
    g.defineLeaf({ id: 'B', objective: 'b', criteria: ['b'], dependencies: ['A'], scope: ['b'] });
    expect(g.addDependency('A', 'B').ok).toBe(false);
  });
});

describe('execution tree: ownership (scenarios E, F)', () => {
  it('path overlap semantics', () => {
    expect(pathsOverlap('src/a.ts', 'src/a.ts')).toBe(true);
    expect(pathsOverlap('src', 'src/a.ts')).toBe(true);
    expect(pathsOverlap('src/a.ts', 'src')).toBe(true);
    expect(pathsOverlap('src/a.ts', 'src/b.ts')).toBe(false);
    expect(pathsOverlap('src', 'lib')).toBe(false);
    expect(scopesOverlap(['src'], ['src/util.ts'])).toBe(true);
    expect(scopesOverlap(['src'], ['lib'])).toBe(false);
  });

  it('E: overlapping leaves cannot run concurrently', () => {
    const g = new MissionGraph();
    g.defineLeaf({ id: 'A', objective: 'a', criteria: ['a'], scope: ['src/app.ts'] });
    g.defineLeaf({ id: 'B', objective: 'b', criteria: ['b'], scope: ['src'] }); // contains src/app.ts
    const conflicts = g.ownershipConflicts(['A', 'B']);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0]!.shared.length).toBeGreaterThan(0);

    // Dispatch picks at most one of the overlapping pair.
    const chosen = g.dispatchable(5).map((l) => l.id);
    expect(chosen.length).toBe(1);

    expect(g.startLeaf('A').ok).toBe(true);
    const second = g.startLeaf('B');
    expect(second.ok).toBe(false);
    expect(second.reason).toMatch(/overlap/i);
  });

  it('F: genuinely disjoint leaves DO run concurrently (within the concurrency limit)', () => {
    const g = new MissionGraph();
    g.defineLeaf({ id: 'A', objective: 'a', criteria: ['a'], scope: ['src/a.ts'] });
    g.defineLeaf({ id: 'B', objective: 'b', criteria: ['b'], scope: ['lib/b.ts'] });
    g.defineLeaf({ id: 'D', objective: 'd', criteria: ['d'], scope: ['docs/d.md'] });
    expect(g.dispatchable(5).map((l) => l.id)).toEqual(['A', 'B', 'D']);
    expect(g.startLeaf('A').ok).toBe(true);
    expect(g.startLeaf('B').ok).toBe(true);
    expect(g.inFlightCount()).toBe(2);
    // Concurrency limit respected.
    expect(g.dispatchable(1).length).toBeLessThanOrEqual(1);
  });

  it('ownership is released when a leaf completes, fails, or is abandoned', () => {
    const g = new MissionGraph();
    g.defineLeaf({ id: 'A', objective: 'a', criteria: ['a'], scope: ['src/shared.ts'] });
    g.defineLeaf({ id: 'B', objective: 'b', criteria: ['b'], scope: ['src/shared.ts'] });
    expect(g.startLeaf('A').ok).toBe(true);
    expect(g.startLeaf('B').ok).toBe(false);
    g.abandon('A', 'dropped');
    expect(g.startLeaf('B').ok).toBe(true); // scope released on abandonment
  });
});

describe('execution tree: lifecycle, abandonment, propagation (scenarios H, I)', () => {
  async function verifyLeaf(g: MissionGraph, id: string, runner: OracleRunner): Promise<void> {
    g.startLeaf(id);
    g.selfVerify(id);
    await g.parentReverify(id, { runner, fingerprint: 'fp-1' });
  }

  it('self-report alone never completes the mission', () => {
    const g = new MissionGraph();
    g.defineLeaf({ id: 'A', objective: 'a', criteria: [{ text: 'a works', verification: 'npm test -- a' }], scope: ['a'] });
    g.startLeaf('A');
    g.selfVerify('A');
    const audit = g.audit();
    expect(audit.complete).toBe(false);
    expect(g.get('A')!.state).toBe('SELF_VERIFIED'); // NOT PARENT_REVERIFIED
  });

  it('H: an abandoned REQUIRED leaf prevents mission completion and is distinct from FAILED/BLOCKED', () => {
    const g = new MissionGraph();
    g.defineLeaf({ id: 'A', objective: 'a', criteria: ['a works'], scope: ['a'] });
    g.abandon('A', 'no longer needed');
    expect(g.get('A')!.state).toBe('ABANDONED');
    const audit = g.audit();
    expect(audit.complete).toBe(false);
    expect(audit.abandonedRequired).toContain('A');
    expect(audit.blockers.some((b) => b.includes('ABANDONED'))).toBe(true);
  });

  it('abandonment is refused for already-verified work', async () => {
    const g = new MissionGraph();
    g.defineLeaf({ id: 'A', objective: 'a', criteria: [{ text: 'a works', verification: 'npm test -- a' }], scope: ['a'] });
    const { runner } = scriptedRunner({ 'npm test -- a': { passed: true } });
    await verifyLeaf(g, 'A', runner);
    expect(g.get('A')!.state).toBe('PARENT_REVERIFIED');
    expect(g.abandon('A', 'too late').ok).toBe(false);
  });

  it('I: a failed leaf propagates failure to its parent branch and blocks dependents', async () => {
    const g = new MissionGraph();
    g.defineLeaf({ id: 'A', objective: 'a', criteria: [{ text: 'a works', verification: 'npm test -- a' }], scope: ['a'], branch: 'br1' });
    g.defineLeaf({ id: 'B', objective: 'b', criteria: [{ text: 'b works', verification: 'npm test -- b' }], scope: ['b'], branch: 'br1' });
    g.defineLeaf({ id: 'C', objective: 'c', criteria: ['c works'], dependencies: ['A'], scope: ['c'] });
    g.defineBranch({ id: 'br1', leafIds: ['A', 'B'] });

    const failA = scriptedRunner({ 'npm test -- a': { passed: false, output: 'FAIL a' }, 'npm test -- b': { passed: true } });
    await verifyLeaf(g, 'A', failA.runner); // A fails re-verification
    expect(g.get('A')!.state).toBe('FAILED');

    // Integration cannot pass because a child is not parent-reverified.
    const integ = await g.verifyIntegration('br1', { runner: failA.runner, fingerprint: 'fp-1' });
    expect(integ.ok).toBe(false);

    // Dependent C never unlocks.
    expect(g.get('C')!.state).toBe('WAITING');
    const audit = g.audit();
    expect(audit.complete).toBe(false);
    expect(audit.blockers.some((b) => b.includes('A is FAILED'))).toBe(true);
  });
});

describe('execution tree: integration verification (scenario M)', () => {
  async function verifyLeaf(g: MissionGraph, id: string, runner: OracleRunner): Promise<void> {
    g.startLeaf(id);
    g.selfVerify(id);
    await g.parentReverify(id, { runner, fingerprint: 'fp-1' });
  }

  it('M: individually-passing leaves FAIL the mission when they do not compose', async () => {
    const g = new MissionGraph();
    g.defineLeaf({ id: 'A', objective: 'a', criteria: [{ text: 'a works', verification: 'npm test -- a' }], scope: ['a'], branch: 'br1' });
    g.defineLeaf({ id: 'B', objective: 'b', criteria: [{ text: 'b works', verification: 'npm test -- b' }], scope: ['b'], branch: 'br1' });
    g.defineBranch({ id: 'br1', leafIds: ['A', 'B'], integration: { objective: 'A+B compose', verification: 'npm run integration' } });

    const { runner } = scriptedRunner({
      'npm test -- a': { passed: true },
      'npm test -- b': { passed: true },
      'npm run integration': { passed: false, output: 'interface mismatch between A and B' },
    });
    await verifyLeaf(g, 'A', runner);
    await verifyLeaf(g, 'B', runner);
    expect(g.get('A')!.state).toBe('PARENT_REVERIFIED');
    expect(g.get('B')!.state).toBe('PARENT_REVERIFIED');

    const integ = await g.verifyIntegration('br1', { runner, fingerprint: 'fp-1' });
    expect(integ.ok).toBe(false);
    expect(g.get('A')!.state).toBe('PARENT_REVERIFIED'); // never promoted to INTEGRATION_VERIFIED
    const audit = g.audit();
    expect(audit.complete).toBe(false);
    expect(audit.blockers.some((b) => b.includes('integration failed'))).toBe(true);
  });

  it('a passing integration oracle promotes children and allows completion', async () => {
    const g = new MissionGraph();
    g.defineLeaf({ id: 'A', objective: 'a', criteria: [{ text: 'a works', verification: 'npm test -- a' }], scope: ['a'], branch: 'br1' });
    g.defineBranch({ id: 'br1', leafIds: ['A'], integration: { objective: 'compose', verification: 'npm run integration' } });
    const { runner } = scriptedRunner({ 'npm test -- a': { passed: true }, 'npm run integration': { passed: true } });
    await verifyLeaf(g, 'A', runner);
    const integ = await g.verifyIntegration('br1', { runner, fingerprint: 'fp-1' });
    expect(integ.ok).toBe(true);
    expect(g.get('A')!.state).toBe('INTEGRATION_VERIFIED');
    expect(g.audit().complete).toBe(true);
  });
});

describe('execution tree: amendment invalidation (scenario L)', () => {
  it('L: amending a requirement invalidates only the affected completion, preserves the rest', async () => {
    const g = new MissionGraph();
    g.defineLeaf({ id: 'A', objective: 'auth', criteria: [{ text: 'auth works', verification: 'npm test -- auth' }], scope: ['a'] });
    g.defineLeaf({ id: 'B', objective: 'billing', criteria: [{ text: 'billing works', verification: 'npm test -- billing' }], scope: ['b'] });
    const { runner } = scriptedRunner({ 'npm test -- auth': { passed: true }, 'npm test -- billing': { passed: true } });
    for (const id of ['A', 'B']) {
      g.startLeaf(id);
      g.selfVerify(id);
      await g.parentReverify(id, { runner, fingerprint: 'fp-1' });
    }
    expect(g.get('A')!.state).toBe('PARENT_REVERIFIED');
    expect(g.get('B')!.state).toBe('PARENT_REVERIFIED');

    const res = g.amend('auth now requires MFA', ['A']);
    expect(res.invalidated).toContain('A');
    expect(res.preserved).toContain('B');
    expect(g.get('B')!.state).toBe('PARENT_REVERIFIED'); // unaffected work preserved
    expect(g.get('A')!.state).toBe('READY'); // back in the queue, criteria reset
    expect(g.get('A')!.criteria.every((c) => !c.satisfied && c.evidenceIds.length === 0)).toBe(true);
    expect(g.get('A')!.evidence.every((e) => e.stale)).toBe(true); // obsolete evidence cannot satisfy the new requirement
    expect(g.amendments.length).toBe(1);
  });
});

describe('execution tree: final audit & missing evidence (scenarios J, N)', () => {
  it('J: missing evidence prevents final completion', () => {
    const g = new MissionGraph();
    g.defineLeaf({ id: 'A', objective: 'a', criteria: [{ text: 'a works', verification: 'npm test -- a' }], scope: ['a'] });
    // Leaf never verified — no evidence at all.
    const audit = g.audit();
    expect(audit.complete).toBe(false);
    expect(audit.missingEvidence.length).toBeGreaterThan(0);
  });

  it('N: the audit is derived from live state and flags stale evidence against the current fingerprint', async () => {
    const g = new MissionGraph();
    g.defineLeaf({ id: 'A', objective: 'a', criteria: [{ text: 'a works', verification: 'npm test -- a' }], scope: ['a'] });
    const { runner } = scriptedRunner({ 'npm test -- a': { passed: true } });
    g.startLeaf('A');
    g.selfVerify('A');
    await g.parentReverify('A', { runner, fingerprint: 'fp-1' });
    expect(g.audit({ fingerprint: 'fp-1' }).complete).toBe(true);

    // Workspace moved on: evidence recorded at fp-1 is now stale.
    const staleAudit = g.audit({ fingerprint: 'fp-2' });
    expect(staleAudit.complete).toBe(false);
    expect(staleAudit.staleEvidence.length).toBeGreaterThan(0);
    expect(staleAudit.blockers.length).toBeGreaterThan(0);
  });

  it('an optional (non-required) leaf does not gate completion', async () => {
    const g = new MissionGraph();
    g.defineLeaf({ id: 'req', objective: 'r', criteria: [{ text: 'r works', verification: 'npm test -- r' }], scope: ['r'] });
    g.defineLeaf({ id: 'opt', objective: 'o', criteria: ['o works'], scope: ['o'], required: false });
    const { runner } = scriptedRunner({ 'npm test -- r': { passed: true } });
    g.startLeaf('req');
    g.selfVerify('req');
    await g.parentReverify('req', { runner, fingerprint: 'fp-1' });
    // opt is abandoned but non-required → does not block.
    g.abandon('opt', 'skipped');
    expect(g.audit().complete).toBe(true);
  });
});

describe('execution tree: early-stop / completion discipline (scenario O)', () => {
  it('O: repeated unproductive recoveries become BLOCKED then ABANDONED, not an infinite loop', () => {
    const g = new MissionGraph();
    g.defineLeaf({ id: 'A', objective: 'a', criteria: ['a works'], scope: ['a'] });
    g.startLeaf('A');

    expect(g.recordRecovery('A', false)).toBe('IN_FLIGHT');
    expect(g.recordRecovery('A', false)).toBe('IN_FLIGHT');
    expect(g.recordRecovery('A', false)).toBe('BLOCKED'); // 3 unproductive attempts
    expect(g.recordRecovery('A', false)).toBe('ABANDONED'); // still no progress → explicit handoff

    const audit = g.audit();
    expect(audit.complete).toBe(false);
    expect(audit.abandonedRequired).toContain('A');
  });

  it('real progress resets the recovery counter', () => {
    const g = new MissionGraph();
    g.defineLeaf({ id: 'A', objective: 'a', criteria: ['a works'], scope: ['a'] });
    g.startLeaf('A');
    g.recordRecovery('A', false);
    g.recordRecovery('A', false);
    expect(g.recordRecovery('A', true)).toBe('IN_FLIGHT'); // progress: counter reset
    expect(g.get('A')!.recoveryAttempts).toBe(0);
  });
});
