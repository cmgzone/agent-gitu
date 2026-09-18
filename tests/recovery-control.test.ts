import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RecoveryOrchestrator } from '../src/recovery/recovery-orchestrator.js';
import { InvestigationGuard } from '../src/recovery/investigation-guard.js';
import { normalizeFailureSignature } from '../src/recovery/evidence-utils.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { Executor } from '../src/executor/executor.js';
import { LoopDetector } from '../src/loop/loop-detector.js';
import { PolicyEngine } from '../src/policy/policy.js';
import { buildStateMessage } from '../src/agent/prompt.js';
import { Hermes, reconcileVerifiedSteps } from '../src/agent/gitu.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import type { Evidence, LlmMessage } from '../src/types.js';

function makeProject(): { dir: string; ledger: TaskLedger; guard: ProjectGuard } {
  const dir = mkdtempSync(path.join(tmpdir(), 'gitu-recovery-control-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'recovery-control-test' }));
  const guard = ProjectGuard.detect(dir);
  const ledger = TaskLedger.create({ repoRoot: dir, goal: 'fix the game speed failure', project: guard.lock, mode: 'standard' });
  return { dir, ledger, guard };
}

function makeExecutor(dir: string): { executor: Executor; guard: ProjectGuard; ledger: TaskLedger } {
  const guard = ProjectGuard.detect(dir);
  const ledger = TaskLedger.create({ repoRoot: dir, goal: 'scratch regression', project: guard.lock, mode: 'standard' });
  const policy = { evaluate: async () => ({ allowed: true, tier: 'safe' as const, reason: 'stub' }) } as unknown as PolicyEngine;
  const loopDetector = {
    evaluate: () => ({ allowed: true, reason: undefined, attempts: 0, priorFailures: [] }),
    fileEditPressure: () => ({ blocked: false, edits: 0 }),
  } as unknown as LoopDetector;
  return { executor: new Executor(guard, ledger, policy, loopDetector), guard, ledger };
}

function git(dir: string, args: string[]): void {
  execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
}

/** The Flappy-bird failure replay: A (speed assertion) → repair → B (pipe cull) → diagnose B → repair B → verify. */
describe('Recovery control: failure episodes (Flappy regression replay)', () => {
  it('a repair that moves the failure surface supersedes the old episode; stale hypotheses are retired; reads after decision sufficiency are rejected', async () => {
    const { dir, ledger } = makeProject();
    const orchestrator = new RecoveryOrchestrator(() => {}, { repoRoot: dir });
    writeFileSync(path.join(dir, 'game.js'), 'const SPEED = 403.6;\nfunction pipes() { return 5; }\n'.repeat(6));

    // ── Episode A: verification fails with the steady-speed assertion ──
    const failureA = 'expected steady speed 403.6 but received 406.8';
    const outcomeA = orchestrator.onActionOutcome(
      {
        tool: 'run_command',
        params: { command: 'npm test' },
        reason: 'verify speed behavior',
        expected: 'steady speed holds 403.6',
        command: 'npm test',
        toolOk: true,
        output: `FAIL game.test.js\n  ${failureA}\n  at pipes.test:12`,
        semanticVerdict: { verdict: 'contradiction', explanation: failureA, blocking: true },
      },
      ledger,
    );
    expect(outcomeA.interrupted).toBe(true);
    const episodeA = orchestrator.getActiveProblem()!;
    expect(episodeA).toBeDefined();
    expect(episodeA.failureSignature).toBeDefined();

    // Diagnosis of A: hypothesis + a read of the failing region (recorded by the guard).
    orchestrator.onSetHypothesis('pipe-culling physics update changes steady speed', 'game_config');
    const readCheckA = orchestrator.checkPreAction(
      { tool: 'read_file', params: { path: 'game.js', offset: 1, limit: 40 }, reason: 'inspect the speed assertion region' },
      ledger.data.evidence.length,
    );
    expect(readCheckA.allowed).toBe(true);
    orchestrator.onActionOutcome(
      {
        tool: 'read_file',
        params: { path: 'game.js', offset: 1, limit: 40 },
        reason: 'inspect the speed assertion region',
        toolOk: true,
        output: 'const SPEED = 403.6;\nfunction pipes() { return 5; }',
      },
      ledger,
    );

    // Repair A is applied → episode A enters repairing/verifying.
    const repairA = orchestrator.onActionOutcome(
      {
        tool: 'apply_edit',
        params: { path: 'game.js' },
        reason: 'fix steady-speed accounting',
        expected: 'speed assertion passes',
        toolOk: true,
        output: 'applied edit to game.js',
      },
      ledger,
    );
    expect(repairA.interrupted).toBe(false);
    expect(orchestrator.getActiveProblem()!.status).toBe('verifying');

    // ── Verification now fails with a DIFFERENT failure: five-pipe cull (B) ──
    const failureB = 'five pipes culled by 700 meters: crashed=191, spawned=2, culled=0';
    const outcomeB = orchestrator.onActionOutcome(
      {
        tool: 'run_command',
        params: { command: 'npm test' },
        reason: 're-verify after repair',
        expected: 'steady speed holds 403.6',
        command: 'npm test',
        toolOk: true,
        output: `FAIL game.test.js\n  ${failureB}\n  at pipes.test:31`,
        semanticVerdict: { verdict: 'contradiction', explanation: failureB, blocking: true },
      },
      ledger,
    );
    expect(outcomeB.interrupted).toBe(true);
    const episodeB = orchestrator.getActiveProblem()!;
    // Episode A was superseded, NOT resolved: its hypotheses are retired and
    // can never resurface as investigation candidates for the new failure.
    expect(episodeB.id).not.toBe(episodeA.id);
    expect(episodeA.status).toBe('superseded');
    expect(episodeA.supersededByProblemId).toBe(episodeB.id);
    expect(episodeA.hypotheses.every((h) => h.status === 'superseded')).toBe(true);
    expect(episodeB.hypotheses.every((h) => h.status === 'superseded')).toBe(true); // carried-over context only
    expect(orchestrator.episodeSupersessions).toBe(1);

    // ── B's diagnostic lands: crashed=191/spawned=2/culled=0 — decision becomes sufficient ──
    orchestrator.onActionOutcome(
      {
        tool: 'run_command',
        params: { command: 'node game.test.js --diag' },
        reason: 'diagnose pipe cull counts',
        expected: 'cull counters',
        command: 'node game.test.js --diag',
        toolOk: true,
        output: 'crashed=191, spawned=2, culled=0 — five pipes culled by 700 meters',
      },
      ledger,
    );
    orchestrator.onSetHypothesis('spawn/cull accounting never increments culled — cull threshold test uses wrong counter', 'game_logic');

    // ── Semantic duplicate read INSIDE the episode: the guard returns the cached observation ──
    const firstRegionRead = orchestrator.checkPreAction(
      { tool: 'read_file', params: { path: 'game.js', offset: 1, limit: 40 }, reason: 'understand the pipe cull accounting region' },
      ledger.data.evidence.length,
    );
    expect(firstRegionRead.allowed).toBe(true);
    orchestrator.onActionOutcome(
      {
        tool: 'read_file',
        params: { path: 'game.js', offset: 1, limit: 40 },
        reason: 'understand the pipe cull accounting region',
        toolOk: true,
        output: 'function cullPipes(pipes, distance) { /* cull accounting */ }',
      },
      ledger,
    );
    const dupRegionRead = orchestrator.checkPreAction(
      { tool: 'read_file', params: { path: 'game.js', offset: 10, limit: 25 }, reason: 'look at the cull accounting again with fresh eyes' },
      ledger.data.evidence.length,
    );
    expect(dupRegionRead.allowed).toBe(false);
    expect(dupRegionRead.reason).toContain('DUPLICATE INVESTIGATION PREVENTED');
    expect(dupRegionRead.reason).toContain('already-observed');
    expect(dupRegionRead.reason).toContain('function cullPipes');

    orchestrator.tracker.updateHypothesis(episodeB.activeHypothesisId!, 'supported');
    const proposal = orchestrator.proposeRepair({
      id: 'rp-fix-cull',
      problemId: episodeB.id,
      intendedEffect: 'cull accounting uses the cull counter, not the crash counter',
      target: { kind: 'game_logic', description: 'pipe cull accounting in game.js' },
      actions: [],
      evidenceBasis: [...episodeB.evidenceIds],
      reversible: true,
      requiresApproval: false,
      verificationContract: episodeB.verificationContract!,
    });
    expect(proposal.actNow).toBe(true);
    expect(orchestrator.getActiveProblem()!.status).toBe('act_now');

    // ── Another A-style read is now REJECTED at the action boundary ──
    // The window read during episode B's diagnosis covers it: the semantic
    // read guard fires first (the simulated repair's invalidation only
    // removed episode-A entries; the episode-B entry is fresh).
    const dupRead = orchestrator.checkPreAction(
      { tool: 'read_file', params: { path: 'game.js', offset: 1, limit: 40 }, reason: 'inspect the speed assertion region' },
      ledger.data.evidence.length,
    );
    expect(dupRead.allowed).toBe(false);
    expect(dupRead.reason).toContain('DUPLICATE INVESTIGATION PREVENTED');

    // A DIFFERENT window without decision-changing intent is rejected by VOI.
    const voiRead = orchestrator.checkPreAction(
      { tool: 'read_file', params: { path: 'game.js', offset: 41, limit: 40 }, reason: 'just checking the file again' },
      ledger.data.evidence.length,
    );
    expect(voiRead.allowed).toBe(false);
    expect(voiRead.reason).toContain('NO_DECISION_IMPACT');

    // ── Repair B → verify → episode B resolved ──
    orchestrator.onActionOutcome(
      { tool: 'apply_edit', params: { path: 'game.js' }, reason: 'fix cull counter', expected: 'cull test passes', toolOk: true, output: 'applied' },
      ledger,
    );
    const verify = orchestrator.onActionOutcome(
      {
        tool: 'run_command',
        params: { command: 'npm test' },
        reason: 'verify both failures gone',
        expected: 'all tests pass',
        command: 'npm test',
        toolOk: true,
        output: 'PASS game.test.js\n  steady speed 403.6 ok\n  five pipes cull ok',
        semanticVerdict: { verdict: 'expected_achieved', explanation: 'both assertions pass', blocking: false },
      },
      ledger,
    );
    expect(verify.resolved).toBe(true);
    expect(episodeB.status).toBe('resolved');

    // Release-gate telemetry: zero stale-hypothesis resurrections (no path
    // resurrected episode A's hypotheses as active candidates).
    const snapshot = orchestrator.telemetrySnapshot();
    expect(snapshot.episodeSupersessions).toBe(1);
    expect(snapshot.problemEpisodes).toBe(2);
    expect(snapshot.semanticDuplicateReadsPrevented).toBeGreaterThanOrEqual(1);
    expect(snapshot.noDecisionImpactRejections).toBeGreaterThanOrEqual(1);
    expect(snapshot.successfulRecoveries).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it('the original failure returning after resolution REOPENS the prior episode (never a fresh mystery)', async () => {
    const { dir, ledger } = makeProject();
    const orchestrator = new RecoveryOrchestrator(() => {}, { repoRoot: dir });
    const contradictionInput = {
      tool: 'run_command',
      params: { command: 'npm test' },
      reason: 'verify',
      expected: 'steady speed holds 403.6',
      command: 'npm test',
      toolOk: true,
      output: 'FAIL\n  expected steady speed 403.6 but received 406.8',
      semanticVerdict: { verdict: 'contradiction' as const, explanation: 'speed assertion failed', blocking: true },
    };
    const first = orchestrator.onActionOutcome({ ...contradictionInput }, ledger);
    expect(first.interrupted).toBe(true);
    const firstEpisode = orchestrator.getActiveProblem()!;
    orchestrator.tracker.resolveActiveProblem();

    const second = orchestrator.onActionOutcome({ ...contradictionInput }, ledger);
    expect(second.interrupted).toBe(true);
    const reopened = orchestrator.getActiveProblem()!;
    expect(reopened.id).not.toBe(firstEpisode.id);
    expect(reopened.failureSignature).toBe(firstEpisode.failureSignature);
    expect(reopened.reopenedFromProblemId).toBe(firstEpisode.id);
    expect(reopened.hypotheses.length).toBe(firstEpisode.hypotheses.length);
    expect(orchestrator.staleHypothesisReopens).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('Recovery control: semantic read guard (InvestigationGuard)', () => {
  function guardWithFakeStat(): { guard: InvestigationGuard; stat: (file: string) => { mtimeMs: number; size: number } | undefined; files: Map<string, { mtimeMs: number; size: number }> } {
    const files = new Map<string, { mtimeMs: number; size: number }>();
    const stat = (file: string) => files.get(file.replace(/\\/g, '/'));
    return { guard: new InvestigationGuard({ statFile: stat }), stat, files };
  }

  it('overlapping windows of an unchanged file collapse to one observation (cached answer returned)', () => {
    const { guard, files } = guardWithFakeStat();
    files.set('game.js', { mtimeMs: 100, size: 4000 });
    const reason = 'understand the pipe cull logic';

    expect(guard.check('read_file', { path: 'game.js', offset: 180, limit: 60 }, reason, 'ep-1').allowed).toBe(true);
    guard.record('read_file', { path: 'game.js', offset: 180, limit: 60 }, reason, 'ep-1', 'function cullPipes() { ... }');
    expect(guard.cachedObservationHits).toBe(0);

    // Different phrasing, fully-covered window: the same unchanged source.
    const second = guard.check('read_file', { path: 'game.js', offset: 200, limit: 20 }, 'check the complete test body', 'ep-1');
    expect(second.allowed).toBe(false);
    expect(second.reason).toContain('DUPLICATE INVESTIGATION PREVENTED');
    expect(second.cachedObservation).toContain('function cullPipes');
    expect(guard.semanticDuplicateReadsPrevented).toBe(1);
    expect(guard.cachedObservationHits).toBe(1);
  });

  it('an edit to the file invalidates the read cache (new fingerprint = new investigation)', () => {
    const { guard, files } = guardWithFakeStat();
    files.set('game.js', { mtimeMs: 100, size: 4000 });
    guard.record('read_file', { path: 'game.js', offset: 1, limit: 50 }, 'read the config', 'ep-1', 'SPEED=403.6');

    expect(guard.check('read_file', { path: 'game.js', offset: 1, limit: 50 }, 'read the config', 'ep-1').allowed).toBe(false);

    // The repair edits the file: fingerprint changes, re-reading is legal.
    files.set('game.js', { mtimeMs: 200, size: 4100 });
    expect(guard.check('read_file', { path: 'game.js', offset: 1, limit: 50 }, 'read the config', 'ep-1').allowed).toBe(true);
  });

  it('a new episode with a NEW question may re-read overlapping sources; the same question may not', () => {
    const { guard, files } = guardWithFakeStat();
    files.set('game.js', { mtimeMs: 100, size: 4000 });
    guard.record('read_file', { path: 'game.js', offset: 1, limit: 50 }, 'why did the speed drift', 'ep-A', 'SPEED=403.6');
    // Same question, new episode: the answer is unchanged, the re-read is drift.
    expect(guard.check('read_file', { path: 'game.js', offset: 1, limit: 50 }, 'why did the speed drift', 'ep-B').allowed).toBe(false);
    // New question in a new episode: fresh investigation is legitimate.
    expect(guard.check('read_file', { path: 'game.js', offset: 1, limit: 50 }, 'why do pipes cull at 700 meters', 'ep-B').allowed).toBe(true);
  });

  it('the same question about non-overlapping windows is still a duplicate (question identity)', () => {
    const { guard, files } = guardWithFakeStat();
    files.set('game.js', { mtimeMs: 100, size: 9000 });
    guard.record('read_file', { path: 'game.js', offset: 1, limit: 30 }, 'where is the pipe cull threshold', 'ep-1', 'const CULL = 700;');
    const again = guard.check('read_file', { path: 'game.js', offset: 500, limit: 30 }, 'where is the pipe cull threshold', 'ep-1');
    expect(again.allowed).toBe(false);
    expect(again.reason).toContain('already answered');
  });
});

describe('Recovery control: failure signatures', () => {
  it('shifting numerics keep one episode identity; a different assertion does not', () => {
    const a1 = normalizeFailureSignature('npm test', 'steady speed holds', 'expected 403.6 received 406.8');
    const a2 = normalizeFailureSignature('npm test', 'steady speed holds', 'expected 403.7 received 406.9');
    const b = normalizeFailureSignature('npm test', 'steady speed holds', 'five pipes culled by 700 meters');
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
    const secrets = normalizeFailureSignature('npm test', 'auth', 'expected 200 received 401 token=super-secret-value');
    expect(secrets).not.toContain('super-secret');
  });
});

// QUARANTINED: the recovery runtime (orchestrator wiring, scratch diagnostics,
// plan reconciliation, turn-context hygiene) is merged as modules but not yet
// wired into main's agent loop. Re-enable with the port so these stay the spec.
describe.skip('Recovery control: scratch diagnostics never enter the project diff', () => {
  it('write_file scratch:true lands in the task temp dir and is not tracked as a project file change', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gitu-scratch-'));
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'scratch-test' }));
    const { executor, guard, ledger } = makeExecutor(dir);
    guard.taskTmpRoot = path.join(guard.activeWritableRoot, '.hermes', 'tmp', ledger.data.taskId);

    const scratch = await executor.execute({
      tool: 'write_file',
      params: { path: 'diag-speed.js', content: 'console.log("probe");\n', scratch: true },
      reason: 'temporary probe',
      expected: 'diagnostic output',
    });
    expect(scratch.result.ok).toBe(true);
    const redirectedRel = path.join(path.relative(guard.activeWritableRoot, guard.taskTmpRoot), 'diag-speed.js');
    expect(existsSync(path.join(dir, redirectedRel))).toBe(true);
    expect(existsSync(path.join(dir, 'diag-speed.js'))).toBe(false);
    expect(scratch.result.output).toContain('SCRATCH');
    expect(ledger.data.filesChanged.filter((f) => f.replace(/\\/g, '/').startsWith('.hermes/'))).toHaveLength(0);
    expect(ledger.data.filesChanged).toHaveLength(0);

    // A real project file IS tracked.
    const real = await executor.execute({
      tool: 'write_file',
      params: { path: 'src/real.ts', content: 'export {};\n' },
      reason: 'real work',
      expected: 'file exists',
    });
    expect(real.result.ok).toBe(true);
    expect(ledger.data.filesChanged).toContain('src/real.ts');

    // Cleanup on completion removes the scratch dir entirely.
    rmSync(guard.taskTmpRoot, { recursive: true, force: true });
    expect(existsSync(guard.taskTmpRoot)).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it('undeclared writes into .hermes remain denied (the exception is task-scoped scratch only)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gitu-scratch-guard-'));
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'scratch-guard-test' }));
    const { executor, guard, ledger } = makeExecutor(dir);
    guard.taskTmpRoot = path.join(guard.activeWritableRoot, '.hermes', 'tmp', ledger.data.taskId);
    const denied = await executor.execute({
      tool: 'write_file',
      params: { path: '.hermes/artifacts/evil.js', content: 'nope' },
      reason: 'should be denied',
      expected: 'denied',
    });
    expect(denied.result.ok).toBe(false);
    expect(denied.deniedByPolicy).toContain('.hermes');
    rmSync(dir, { recursive: true, force: true });
  });

  it('trackFile ignores .hermes paths from any tool result', () => {
    const { dir, ledger } = makeProject();
    ledger.trackFile('.hermes/tmp/task-1/diag-speed.js');
    ledger.trackFile('.hermes\\artifacts\\out.txt');
    ledger.trackFile('src/real.ts');
    expect(ledger.data.filesChanged).toEqual(['src/real.ts']);
    rmSync(dir, { recursive: true, force: true });
  });
});

// QUARANTINED: plan reconciliation runs inside the un-ported recovery runtime.
describe.skip('Recovery control: conservative plan reconciliation', () => {
  it('marks steps done ONLY when their own exact verification passed at the current fingerprint', () => {
    const { dir, ledger } = makeProject();
    ledger.setPlan([
      { description: 'fix speed accounting', verification: 'npm test', area: 'shared' },
      { description: 'fix pipe cull', verification: 'npm run test:cull', area: 'shared' },
    ]);
    ledger.data.evidence.push({
      id: 'ev-1',
      kind: 'test',
      label: 'npm test',
      command: 'npm test',
      exitCode: 0,
      passed: true,
      outputExcerpt: 'all pass',
      createdAt: new Date().toISOString(),
      workspaceFingerprint: 'fp-current',
    });
    ledger.data.evidence.push({
      id: 'ev-2',
      kind: 'test',
      label: 'npm test (stale)',
      command: 'npm run test:cull',
      exitCode: 0,
      passed: true,
      outputExcerpt: 'all pass (old workspace)',
      createdAt: new Date().toISOString(),
      workspaceFingerprint: 'fp-old',
    });

    const reconciled = reconcileVerifiedSteps(ledger, 'fp-current');
    expect(reconciled).toBe(1);
    expect(ledger.data.plan[0]!.status).toBe('done');
    expect(ledger.data.plan[1]!.status).not.toBe('done');

    // A suspended step is never reconciled behind the model's back.
    const suspended = makeProject();
    suspended.ledger.setPlan([{ description: 'suspended work', verification: 'npm test', area: 'shared' }]);
    suspended.ledger.data.evidence.push({
      id: 'ev-3',
      kind: 'test',
      label: 'npm test',
      command: 'npm test',
      exitCode: 0,
      passed: true,
      outputExcerpt: 'pass',
      createdAt: new Date().toISOString(),
      workspaceFingerprint: 'fp-current',
    });
    const reconciled2 = reconcileVerifiedSteps(suspended.ledger, 'fp-current', (stepId) => stepId === suspended.ledger.data.plan[0]!.id);
    expect(reconciled2).toBe(0);
    expect(suspended.ledger.data.plan[0]!.status).not.toBe('done');
    rmSync(dir, { recursive: true, force: true });
    rmSync(suspended.dir, { recursive: true, force: true });
  });

  it('does not mark a step done from a command that only prints the expected sentinel', () => {
    const { dir, ledger } = makeProject();
    const command = 'node -e "process.stdout.write(\'STEP6_INSTANCE_REBOUND\')"';
    ledger.setPlan([{ description: 'repair runtime recovery state', verification: command, area: 'shared' }]);
    ledger.data.evidence.push({
      id: 'ev-synthetic',
      kind: 'command',
      label: command,
      command,
      exitCode: 0,
      passed: true,
      outputExcerpt: 'STEP6_INSTANCE_REBOUND',
      createdAt: new Date().toISOString(),
      workspaceFingerprint: 'fp-current',
    });

    expect(reconcileVerifiedSteps(ledger, 'fp-current')).toBe(0);
    expect(ledger.data.plan[0]!.status).not.toBe('done');
    rmSync(dir, { recursive: true, force: true });
  });
});

// QUARANTINED: needs the capability-selected state builder of the recovery runtime.
describe.skip('Recovery control: task state renders observed vs formal progress', () => {
  it('shows unclaimed passing evidence and verified-but-uncounted steps separately from satisfaction', () => {
    const { dir, ledger } = makeProject();
    ledger.setCriteria(['speed assertion passes', 'pipe cull accounted', 'visual polish verified']);
    ledger.setPlan([
      { description: 'fix speed accounting', verification: 'npm test', area: 'shared' },
      { description: 'fix pipe cull', verification: 'npm run test:cull', area: 'shared' },
    ]);
    ledger.data.evidence.push({
      id: 'ev-1',
      kind: 'test',
      label: 'npm test',
      command: 'npm test',
      exitCode: 0,
      passed: true,
      outputExcerpt: 'pass',
      createdAt: new Date().toISOString(),
      workspaceFingerprint: 'fp',
    });
    const state = buildStateMessage(ledger);
    expect(state).toContain('formally satisfied: 0/3');
    expect(state).toContain('1 passing evidence record(s) NOT yet linked');
    expect(state).toContain('verified-but-uncounted');
    rmSync(dir, { recursive: true, force: true });
  });
});

// QUARANTINED: single-live-TASK-STATE hygiene and the steering boundary live in
// the un-ported recovery runtime.
describe.skip('Recovery control: turn context (e2e, mock LLM)', () => {
  function makeE2eProject(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'gitu-e2e-rc-'));
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'e2e-rc' }));
    return dir;
  }

  it('old TASK STATE messages do not accumulate: at most one live state message on any turn', async () => {
    const dir = makeE2eProject();
    let maxStateMessages = 0;
    const countState = (messages: LlmMessage[]): number =>
      messages.filter((m) => typeof m.content === 'string' && m.content.includes('TASK AUTHORITY (Precedence')).length;
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['something verifiable'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'work', verification: 'node --version' }] } }),
      (_n: number, messages: LlmMessage[]) => {
        maxStateMessages = Math.max(maxStateMessages, countState(messages));
        return JSON.stringify({ action: { type: 'tool_call', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' } });
      },
      (_n: number, messages: LlmMessage[]) => {
        maxStateMessages = Math.max(maxStateMessages, countState(messages));
        return JSON.stringify({ action: { type: 'request_block', reason: 'ending the probe run' } });
      },
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast' });
    await hermes.run('state replay probe');
    // Turns 3 and 4 each followed earlier state messages: with replacement,
    // even those late turns see at most ONE live TASK STATE.
    expect(maxStateMessages).toBeLessThanOrEqual(1);
    rmSync(dir, { recursive: true, force: true });
  }, 40000);

  it('user steering is honored within one action boundary, before any further autonomous work', async () => {
    const dir = makeE2eProject();
    const steerText = 'stop diagnosing — check the plan order first';
    let hermes: Hermes;
    let steerSeenAtBoundary: 'not-yet' | 'yes' | 'no' = 'not-yet';
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['something verifiable'] } }),
      // Queued DURING turn 2's planning: the steer must reach the model at the
      // very next action boundary (after turn 2's action, before turn 3 plans).
      () => {
        hermes.queueMessage(steerText);
        return JSON.stringify({ action: { type: 'tool_call', tool: 'run_command', params: { command: 'node --version' }, reason: 'a diagnostic', expected: 'exit 0' } });
      },
      (_n: number, messages: LlmMessage[]) => {
        const sawSteer = messages.some((m) => typeof m.content === 'string' && m.content.includes(steerText));
        steerSeenAtBoundary = sawSteer ? 'yes' : 'no';
        return JSON.stringify({ action: { type: 'request_block', reason: 'ending the probe run' } });
      },
    ]);
    hermes = new Hermes({ cwd: dir, llm, mode: 'fast' });
    await hermes.run('steering boundary probe');
    expect(steerSeenAtBoundary).toBe('yes');
    rmSync(dir, { recursive: true, force: true });
  }, 40000);
});

describe('Recovery control: command-shaped verification contracts', () => {
  it('resolves an episode when the exact failing command later exits 0, and never on transport success alone', async () => {
    const { dir, ledger } = makeProject();
    const orchestrator = new RecoveryOrchestrator(() => {}, { repoRoot: dir });

    // Reproduce: the model INTENDED the failure ('expected: it crashes') — the
    // contradiction's contract must still be satisfiable by a later pass.
    const reproduce = {
      tool: 'run_command',
      params: { command: 'node index.js' },
      reason: 'reproduce',
      expected: 'it crashes',
      command: 'node index.js',
      toolOk: false,
      exitCode: 1,
      output: 'Error: boom',
    };
    orchestrator.onActionOutcome({ ...reproduce }, ledger);
    const episode = orchestrator.getActiveProblem()!;
    expect(episode.verificationContract?.verificationCommand).toBe('node index.js');

    // Repair applied → verifying.
    orchestrator.onActionOutcome(
      { tool: 'apply_edit', params: { path: 'index.js' }, reason: 'fix', expected: 'prints hello', toolOk: true, output: 'applied' },
      ledger,
    );
    expect(orchestrator.getActiveProblem()!.status).toBe('verifying');

    // Transport success without an exit code is NOT proof.
    orchestrator.onActionOutcome(
      { ...reproduce, toolOk: true, output: 'hello' },
      ledger,
    );
    expect(orchestrator.getActiveProblem()?.id).toBe(episode.id);

    // Exit 0 WITH the model reporting the same failure via its semantic verdict
    // is NOT proof (tests can fail inside an exiting-0 run).
    orchestrator.onActionOutcome(
      {
        ...reproduce,
        toolOk: true,
        exitCode: 0,
        output: 'Error: boom',
        semanticVerdict: { verdict: 'contradiction', explanation: 'Error: boom', blocking: true },
      },
      ledger,
    );
    expect(orchestrator.getActiveProblem()?.id).toBe(episode.id);

    // The genuine pass of the exact same command resolves the episode.
    const verified = orchestrator.onActionOutcome(
      { ...reproduce, toolOk: true, exitCode: 0, output: 'hello' },
      ledger,
    );
    expect(verified.resolved).toBe(true);
    expect(episode.status).toBe('resolved');
    rmSync(dir, { recursive: true, force: true });
  });

  it('blocks a synthetic sentinel probe before execution while recovery is active', () => {
    const { dir, ledger } = makeProject();
    const orchestrator = new RecoveryOrchestrator(() => {}, { repoRoot: dir });
    orchestrator.onActionOutcome(
      {
        tool: 'run_command',
        params: { command: 'node index.js' },
        command: 'node index.js',
        reason: 'reproduce',
        expected: 'application works',
        stepId: 'step-1',
        toolOk: false,
        exitCode: 1,
        output: 'Error: boom',
      },
      ledger,
    );
    expect(orchestrator.hasActiveProblem()).toBe(true);

    const pre = orchestrator.checkPreAction(
      {
        tool: 'run_command',
        params: { command: 'node -e "console.log(\'FINAL_SCOPE_PASS\')"' },
        reason: 'prove the recovery state',
        expected: 'FINAL_SCOPE_PASS',
        intent: 'verify',
      },
      ledger.data.evidence.length,
    );
    expect(pre.allowed).toBe(false);
    expect(pre.reason).toContain('INVALID RECOVERY PROOF');
    expect(orchestrator.getActiveProblem()?.status).not.toBe('resolved');
    rmSync(dir, { recursive: true, force: true });
  });
});
