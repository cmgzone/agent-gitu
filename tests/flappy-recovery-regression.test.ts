import { describe, expect, it } from 'vitest';
import { EvidenceEngine } from '../src/evidence/evidence.js';
import { CACHED_INVESTIGATION_PREFIX, LoopDetector } from '../src/loop/loop-detector.js';
import type { ActionRecord, TaskLedgerData } from '../src/types.js';
import { hashParams } from '../src/util.js';

function action(
  id: string,
  tool: string,
  paramsHash: string,
  paramsSummary: string,
  observation: string,
  status: ActionRecord['status'] = 'success',
): ActionRecord {
  return {
    id,
    tool,
    paramsHash,
    paramsSummary,
    status,
    reason: 'regression replay',
    expected: 'bounded recovery',
    observation,
    durationMs: 1,
    createdAt: new Date().toISOString(),
  };
}

function ledger(): TaskLedgerData {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    taskId: 'flappy-replay',
    goal: 'create a Flappy Bird game and make the tests pass',
    status: 'executing',
    mode: 'standard',
    project: {
      name: 'flappy',
      repoRoot: '/repo',
      techStack: ['javascript'],
      entrypoints: ['js/logic.js'],
      ignorePaths: [],
      lockedAt: now,
    },
    acceptanceCriteria: EvidenceEngine.criteriaFromTexts(['game tests pass']),
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

describe('Flappy recovery regression — stale failure must not resurrect', () => {
  it('moves from the repaired movement failure to the new culling failure', () => {
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

    // The repair changes the verification outcome: this is a NEW active
    // problem, not permission to keep investigating the old movement mismatch.
    engine.record(data, {
      kind: 'test',
      label: 'node test/game.test.js',
      command: 'node test/game.test.js',
      passed: false,
      output: 'AssertionError: five pipes fully left the screen by frame 700',
    });

    expect(data.currentHypothesis).toBeUndefined();

    data.currentHypothesis = 'the bird reaches game-over before enough pipes can spawn and be culled';
    engine.record(data, {
      kind: 'command',
      label: 'deterministic culling diagnostic',
      command: 'node diag-cull.js',
      passed: true,
      output: 'crashed=191 spawned=2 alive=2 culled=0 score=0 frame=700 state=over',
    });

    expect(data.currentHypothesis).toContain('game-over');
    expect(data.evidence.at(-1)?.outputExcerpt).toContain('crashed=191');
  });

  it('collapses overlapping movement rereads and allows only one cached replay', () => {
    const detector = new LoopDetector();
    const firstHash = hashParams('read_file', { path: 'js/logic.js', offset: 1, limit: 180 });
    const overlapHash = hashParams('read_file', { path: './js/logic.js', offset: 120, limit: 100, maxChars: 30000 });
    expect(overlapHash).toBe(firstHash);

    const actions: ActionRecord[] = [
      action('read-1', 'read_file', firstHash, 'read js/logic.js', 'pipe speed is 3.2 and movement is steady'),
      action('read-2', 'read_file', overlapHash, 'read js/logic.js', 'same movement code; no contradictory evidence'),
    ];

    const reusable = detector.reusableSuccessfulRead(actions, 'read_file', firstHash);
    expect(reusable?.id).toBe('read-2');

    actions.push(
      action(
        'read-cache',
        'read_file',
        firstHash,
        'read js/logic.js',
        `${CACHED_INVESTIGATION_PREFIX}: reused read-2; no filesystem read executed`,
      ),
    );

    expect(detector.reusableSuccessfulRead(actions, 'read_file', firstHash)).toBeUndefined();
    const blocked = detector.evaluate(actions, 'read_file', firstHash, undefined);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/unchanged source|unchanged evidence|without a relevant source change/i);
  });

  it('reopens the read after logic.js changes, so the guard does not hide fresh code', () => {
    const detector = new LoopDetector();
    const readHash = hashParams('read_file', { path: 'js/logic.js', offset: 1, limit: 180 });
    const actions: ActionRecord[] = [
      action('read-1', 'read_file', readHash, 'read js/logic.js', 'old implementation'),
      action('read-2', 'read_file', readHash, 'read js/logic.js', 'old implementation again'),
      action('edit-1', 'apply_edit', 'edit-hash', 'edit js/logic.js', 'repair applied'),
    ];

    expect(detector.evaluate(actions, 'read_file', readHash, undefined).allowed).toBe(true);
    expect(detector.reusableSuccessfulRead(actions, 'read_file', readHash)).toBeUndefined();
  });
});
