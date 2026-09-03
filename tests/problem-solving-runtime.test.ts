import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProblemTracker } from '../src/recovery/problem-tracker.js';
import { ProgressEvaluator } from '../src/recovery/progress-evaluator.js';
import { DiagnosisController } from '../src/recovery/diagnosis-controller.js';
import { StrategyGuard } from '../src/recovery/strategy-guard.js';
import { RecoveryOrchestrator } from '../src/recovery/recovery-orchestrator.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { LoopDetector } from '../src/loop/loop-detector.js';
import { canonicalStatement, digestFields, semanticDigest } from '../src/recovery/evidence-utils.js';
import type { ActionExpectation, RepairProposal } from '../src/recovery/problem-state.js';

function createTestLedger(goal: string): { ledger: TaskLedger; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitu-recovery-test-'));
  const project = {
    name: 'test-app',
    repoRoot: dir,
    techStack: ['typescript'],
    entrypoints: ['src/index.ts'],
    ignorePaths: ['node_modules', '.git'],
    lockedAt: new Date().toISOString(),
  };
  const ledger = TaskLedger.create({ repoRoot: dir, goal, project, mode: 'standard' });
  return {
    ledger,
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    },
  };
}

function statusExpectation(description: string, expectedStatus: number): ActionExpectation {
  return {
    description,
    assertions: [{ kind: 'equals', target: 'status', expected: expectedStatus }],
    blocksOnFailure: true,
  };
}

describe('Autonomous Problem-Solving Runtime (AC-1 to AC-19)', () => {
  it('AC-1: Model-reasoned contradiction for an error response when toolOk=true (no hardcoded error-code rule)', () => {
    const evaluator = new ProgressEvaluator();
    // Tool execution succeeded (e.g. curl exited code 0), but the MODEL reports
    // the observed state contradicts the expectation. The runtime enforces the
    // verdict lifecycle — it does not classify the error text itself.
    const evaluation = evaluator.evaluate({
      tool: 'run_command',
      toolOk: true,
      exitCode: 0,
      params: { command: 'curl -X POST http://localhost:3000/api/auth/login' },
      expected: 'User logs in successfully and receives session token',
      output: 'HTTP/1.1 405 Method Not Allowed\nAllow: GET, HEAD\nContent-Length: 0',
      semanticVerdict: {
        verdict: 'contradiction',
        explanation: 'HTTP error response: 405 Method Not Allowed — login did not succeed',
        blocking: true,
      },
    });

    expect(evaluation.verdict).toBe('contradiction');
    expect(evaluation.isBlocking).toBe(true);
    expect(evaluation.detectedContradiction).toBeDefined();
    expect(evaluation.detectedContradiction?.observed).toContain('405 Method Not Allowed');
    // AC-21: ownership stays unknown until evidence/model reasoning identifies it.
    expect(evaluation.detectedContradiction?.likelySurface).toBeUndefined();
  });

  it('AC-1b: Model-reasoned contradiction for an unexpected document type (no hardcoded content rule)', () => {
    const evaluator = new ProgressEvaluator();
    const evaluation = evaluator.evaluate({
      tool: 'run_command',
      toolOk: true,
      exitCode: 0,
      params: { command: 'curl http://localhost:3000/api/users' },
      expected: 'JSON list of registered users',
      output: '<!doctype html><html><head><title>App</title></head><body><div id="root"></div></body></html>',
      semanticVerdict: {
        verdict: 'contradiction',
        explanation: 'Received HTML document instead of API response (model semantic verdict)',
        blocking: true,
      },
    });

    expect(evaluation.verdict).toBe('contradiction');
    expect(evaluation.isBlocking).toBe(true);
    expect(evaluation.detectedContradiction?.observed).toContain('Received HTML document instead of API response');
  });

  it('AC-2: State-aware outcome evaluation (progress vs neutral vs contradiction)', () => {
    const evaluator = new ProgressEvaluator();
    // Neutral read
    const evalRead = evaluator.evaluate({
      tool: 'read_file',
      toolOk: true,
      output: 'const x = 1;',
    });
    expect(evalRead.verdict).toBe('neutral');

    // Progress edit
    const evalEdit = evaluator.evaluate({
      tool: 'write_file',
      toolOk: true,
      output: 'Wrote 10 lines to file',
    });
    expect(evalEdit.verdict).toBe('progress');

    // Tool error
    const evalErr = evaluator.evaluate({
      tool: 'run_command',
      toolOk: false,
      exitCode: 1,
      output: 'SyntaxError: Unexpected token',
      stepId: 'step-1',
    });
    expect(evalErr.verdict).toBe('blocker');
    expect(evalErr.isBlocking).toBe(true);
  });

  it('AC-3 & AC-15: Structured EXPECTED vs OBSERVED lifecycle — interrupt, repair, verify, resume', () => {
    const { ledger, cleanup } = createTestLedger('Fix API login');
    try {
      ledger.setPlan([
        { id: 'step-1', description: 'Implement login route', area: 'backend', status: 'in_progress', verification: 'curl -X POST http://localhost:3000/api/auth/login' },
        { id: 'step-2', description: 'Build frontend login form', area: 'frontend', status: 'pending' },
      ]);

      const events: string[] = [];
      const orchestrator = new RecoveryOrchestrator((e) => events.push(e));
      const expectation = statusExpectation('HTTP 200 OK login token', 200);

      // 1. Structured mismatch: expected status 200, observed 405 → contradiction.
      const failOutcome = orchestrator.onActionOutcome(
        {
          tool: 'run_command',
          toolOk: true,
          exitCode: 0,
          expectation,
          observation: { transportOk: true, fields: { status: 405 } },
          output: 'HTTP/1.1 405 Method Not Allowed',
          stepId: 'step-1',
        },
        ledger,
      );

      expect(failOutcome.interrupted).toBe(true);
      expect(orchestrator.hasActiveProblem()).toBe(true);
      expect(ledger.step('step-1')?.status).toBe('blocked');

      // 2. Fix applied
      const editOutcome = orchestrator.onActionOutcome(
        {
          tool: 'write_file',
          toolOk: true,
          output: 'Updated routes.ts',
        },
        ledger,
      );
      expect(editOutcome.interrupted).toBe(false);
      expect(orchestrator.getActiveProblem()?.status).toBe('verifying');

      // 3. Re-verification positively proves the original expectation
      const verifyOutcome = orchestrator.onActionOutcome(
        {
          tool: 'run_command',
          toolOk: true,
          exitCode: 0,
          expectation,
          observation: { transportOk: true, fields: { status: 200 } },
          output: 'HTTP/1.1 200 OK\n{"token":"jwt-123"}',
          stepId: 'step-1',
        },
        ledger,
      );

      expect(verifyOutcome.resolved).toBe(true);
      expect(orchestrator.hasActiveProblem()).toBe(false);
      // Suspended step is unblocked and resumed
      expect(ledger.step('step-1')?.status).toBe('in_progress');
      expect(orchestrator.resumedMissions).toBe(1);
      expect(orchestrator.successfulRecoveries).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('AC-4: Dynamic plan interruption & step suspension (generic tool failure, no tech pattern)', () => {
    const { ledger, cleanup } = createTestLedger('Setup DB');
    try {
      ledger.setPlan([
        { description: 'Connect DB', area: 'backend' },
      ]);
      const step1 = ledger.data.plan[0]!;
      step1.status = 'in_progress';

      const orchestrator = new RecoveryOrchestrator();
      // A refused connection is a tool-level failure (toolOk=false). The
      // runtime blocks on the failure itself — no service-specific pattern.
      orchestrator.onActionOutcome(
        {
          tool: 'run_command',
          toolOk: false,
          exitCode: 1,
          output: 'connect: connection refused at 127.0.0.1:5432',
          stepId: step1.id,
        },
        ledger,
      );

      expect(orchestrator.hasActiveProblem()).toBe(true);
      expect(ledger.step(step1.id)?.status).toBe('blocked');
      expect(orchestrator.planInterruptions).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('AC-5 & AC-6 & AC-19: Decision sufficiency, Value-of-Information, and ACT_NOW discipline', () => {
    const tracker = new ProblemTracker();
    const problem = tracker.recordContradiction({
      goal: 'Serve app',
      expected: '200 OK',
      observed: 'Unexpected error response on /api/auth',
      fingerprint: 'fp-405',
    });

    const diagnosis = new DiagnosisController();

    // Before hypothesis: mode is investigate, ownership unknown (never repository).
    const d1 = diagnosis.evaluate(problem);
    expect(d1.nextMode).toBe('investigate');
    expect(d1.evidenceSufficient).toBe(false);
    expect(d1.repairTarget).toBeUndefined();

    // Supported hypothesis with a known open-ended target → decision sufficient.
    const hyp = tracker.addHypothesis('Reverse proxy is missing POST forwarding for /api/auth', 'deployment', 0.9)!;
    tracker.updateHypothesis(hyp.id, 'supported');
    const d2 = diagnosis.evaluate(problem);
    expect(d2.nextMode).toBe('act_now');
    expect(d2.evidenceSufficient).toBe(true);
    expect(d2.repairProposal?.target.kind).toBe('deployment');

    // Value-of-information check in ACT_NOW mode:
    tracker.transitionStatus('act_now');
    tracker.setDiagnosis(d2);

    // Unrelated exploratory search in ACT_NOW mode is SUPPRESSED (AC-6, AC-19).
    const voi = diagnosis.checkValueOflnformation(
      { tool: 'grep_search', params: { query: 'something unrelated' } },
      problem,
    );
    expect(voi.allowed).toBe(false);
    expect(voi.reason).toContain('VALUE-OF-INFORMATION GUARD');
  });

  it('AC-7/AC-21: Unknown repair ownership stays unknown (no tech-keyword surface inference)', () => {
    const evaluator = new ProgressEvaluator();

    for (const output of [
      'container runtime exited with code 1',
      'client initialization error: cannot reach datastore server',
      'connect: connection refused at 127.0.0.1:8080',
    ]) {
      const e = evaluator.evaluate({ tool: 'run_command', toolOk: false, exitCode: 1, output });
      expect(e.detectedContradiction).toBeDefined();
      // The runtime must NOT guess ownership from output keywords.
      expect(e.detectedContradiction?.likelySurface).toBeUndefined();
    }
  });

  it('AC-9 & AC-10: Strategy-level loop prevention and epoch advance', () => {
    const tracker = new ProblemTracker();
    const problem = tracker.recordContradiction({
      goal: 'Test endpoint',
      observed: 'Unexpected error response',
      fingerprint: 'fp-test',
    });

    const guard = new StrategyGuard();

    const action = {
      tool: 'run_command',
      params: { command: 'curl -X POST http://localhost:3000/api/users' },
    };

    // First attempt: allowed
    const v1 = guard.evaluate(action, problem, 0);
    expect(v1.allowed).toBe(true);

    // Repeating identical strategy without material change: BLOCKED (AC-9)
    const v2 = guard.evaluate(action, problem, 0);
    expect(v2.allowed).toBe(false);
    expect(v2.reason).toContain('STRATEGY LOOP BLOCKED');

    // State epoch advances (e.g. repair made): ALLOWED (AC-10)
    guard.advanceEpoch('repaired routes');
    const v3 = guard.evaluate(action, problem, 0);
    expect(v3.allowed).toBe(true);
  });

  it('AC-11: Evidence gates block completion while active problem is unresolved', () => {
    const { ledger, cleanup } = createTestLedger('Complete task');
    try {
      const orchestrator = new RecoveryOrchestrator();

      orchestrator.onActionOutcome(
        {
          tool: 'run_command',
          toolOk: true,
          output: 'Unexpected server-side failure marker',
          expected: '200 OK',
          semanticVerdict: { verdict: 'contradiction', explanation: 'Server returned a failure state', blocking: true },
        },
        ledger,
      );

      expect(orchestrator.hasActiveProblem()).toBe(true);
      // Completion must be blocked
      const active = orchestrator.getActiveProblem();
      expect(active?.status).not.toBe('resolved');
    } finally {
      cleanup();
    }
  });

  it('AC-13: Reasoning effort escalation on repeated problem recovery failure', () => {
    const { ledger, cleanup } = createTestLedger('Task');
    try {
      const orchestrator = new RecoveryOrchestrator();

      expect(orchestrator.shouldEscalateEffort()).toBe(false);

      // The identical failure repeats: same fingerprint → same problem accumulates attempts.
      const failing = () => ({
        tool: 'run_command',
        toolOk: true,
        output: 'Unexpected error response',
        expected: '200 OK',
        semanticVerdict: { verdict: 'contradiction' as const, explanation: 'Unexpected error response', blocking: true },
      });

      // Problem detected
      orchestrator.onActionOutcome(failing(), ledger);
      expect(orchestrator.shouldEscalateEffort()).toBe(false);

      // First failure attempt
      orchestrator.onActionOutcome(failing(), ledger);
      // Second failure attempt -> triggers escalation!
      orchestrator.onActionOutcome(failing(), ledger);

      expect(orchestrator.shouldEscalateEffort()).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('AC-14 & AC-19: Investigation-to-action discipline with ACT_NOW and near-zero repair delay', () => {
    const { ledger, cleanup } = createTestLedger('Discipline test');
    try {
      const orchestrator = new RecoveryOrchestrator();

      // Problem occurs
      orchestrator.onActionOutcome(
        { tool: 'run_command', toolOk: false, output: 'Fatal DB error', expected: 'DB connects' },
        ledger,
      );
      expect(orchestrator.problemsDetected).toBe(1);

      // Perform investigation pre-actions
      orchestrator.checkPreAction({ tool: 'read_file', params: { path: 'db.ts' } }, 0);
      orchestrator.checkPreAction({ tool: 'read_file', params: { path: 'config.ts' } }, 0);
      expect(orchestrator.investigationActionsBeforeDiagnosis).toBe(2);

      // Formulate hypothesis, then submit a repair proposal → ACT_NOW.
      orchestrator.onSetHypothesis('Database URL port is incorrect in config.ts', 'configuration', 0.9);
      expect(orchestrator.strategyChanges).toBe(1);
      const active = orchestrator.getActiveProblem()!;
      const proposal: RepairProposal = {
        id: 'rp-test-1',
        problemId: active.id,
        intendedEffect: 'Correct the database port so the connection succeeds',
        target: { kind: 'configuration', resourceId: 'config.ts', description: 'Application configuration file' },
        actions: [],
        evidenceBasis: [],
        reversible: true,
        requiresApproval: false,
        verificationContract: {
          description: 'Verify DB connects',
          originalObserved: active.observed,
          expectedOutcome: 'DB connects',
        },
      };
      const { actNow } = orchestrator.proposeRepair(proposal);
      expect(actNow).toBe(true);
      expect(orchestrator.getActiveProblem()?.status).toBe('act_now');

      // Repair action
      orchestrator.onActionOutcome({ tool: 'write_file', toolOk: true, output: 'Updated config' }, ledger);
      expect(orchestrator.repairAttempts).toBe(1);
      expect(orchestrator.actionsAfterDiagnosisBeforeRepair).toBe(0); // Near zero regression target!

      // Verification action
      orchestrator.onActionOutcome({ tool: 'run_command', toolOk: true, output: 'Connected successfully', expected: 'DB connects' }, ledger);
      expect(orchestrator.successfulRecoveries).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('AC-16: Contradiction deduplication (same fingerprint updates existing problem)', () => {
    const tracker = new ProblemTracker();
    const p1 = tracker.recordContradiction({
      goal: 'Goal',
      observed: 'Unexpected error response',
      fingerprint: 'fp-dup',
      stepId: 'step-1',
    });

    const p2 = tracker.recordContradiction({
      goal: 'Goal',
      observed: 'Unexpected error response (second time)',
      fingerprint: 'fp-dup',
      stepId: 'step-2',
    });

    expect(p1.id).toBe(p2.id);
    expect(tracker.getAllProblems().length).toBe(1);
    expect(p2.blockedStepIds).toContain('step-1');
    expect(p2.blockedStepIds).toContain('step-2');
  });

  it('AC-17: Prompt recovery section rendering', () => {
    const tracker = new ProblemTracker();
    tracker.recordContradiction({
      goal: 'Goal',
      expected: 'User created',
      observed: 'Unexpected error response',
      fingerprint: 'fp-prompt',
      likelySurface: 'deployment',
      stepId: 'step-create',
    });

    const orchestrator = new RecoveryOrchestrator();
    // Inject tracker
    (orchestrator as unknown as { tracker: ProblemTracker }).tracker = tracker;

    const promptSection = orchestrator.renderPromptSection();
    expect(promptSection).toContain('ACTIVE PROBLEM RECOVERY');
    expect(promptSection).toContain('Unexpected error response');
    expect(promptSection).toContain('Suspended Mission Step(s): step-create');
    expect(promptSection).toContain('Repair Target: unknown');
  });

  it('AC-18: Low-level exact-action LoopDetector remains preserved and fully functional', () => {
    const loopDetector = new LoopDetector();

    const actionRecord = {
      tool: 'read_file',
      paramsHash: 'hash-file',
      paramsSummary: '{"path":"file.ts"}',
      status: 'error' as const,
      observation: 'File not found',
      errorSignature: 'fnf',
      turn: 1,
      timestamp: Date.now(),
    };

    const v1 = loopDetector.evaluate([actionRecord], 'read_file', 'hash-file', 'fnf');
    expect(v1.allowed).toBe(true);

    const v2 = loopDetector.evaluate([actionRecord, actionRecord], 'read_file', 'hash-file', 'fnf');
    // maxSameActionSameError is 2, so after 2 same errors, repeating it is blocked!
    expect(v2.allowed).toBe(false);
    expect(v2.reason).toContain('Action failed 2× with the same error signature');
  });
});

describe('Hardened problem-solving runtime (AC-20 to AC-35)', () => {
  it('1. Unknown problem with no hardcoded category still enters recovery', () => {
    const { ledger, cleanup } = createTestLedger('Unknown tech task');
    try {
      const orchestrator = new RecoveryOrchestrator();
      // Fictional technology the runtime has never heard of.
      const outcome = orchestrator.onActionOutcome(
        {
          tool: 'run_command',
          toolOk: false,
          exitCode: 1,
          expected: 'Zorgblatt converts the payload',
          output: 'florp drive quantic desync on zorgblatt-9: vortex misalignment',
          stepId: 'step-1',
        },
        ledger,
      );
      expect(outcome.interrupted).toBe(true);
      expect(orchestrator.hasActiveProblem()).toBe(true);
      expect(orchestrator.problemsDetected).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('2. Structured expectation mismatch creates contradiction (no error-code rule)', () => {
    const evaluator = new ProgressEvaluator();
    const evaluation = evaluator.evaluate({
      tool: 'run_command',
      toolOk: true,
      exitCode: 0,
      expectation: statusExpectation('Status is successful', 200),
      observation: {
        transportOk: true,
        fields: { status: 418, contentType: null, url: 'zorg://example/op', bodyDigest: 'abc', stateChanged: false },
      },
      output: 'fictional transport dump',
    });
    expect(evaluation.verdict).toBe('contradiction');
    expect(evaluation.isBlocking).toBe(false);
    expect(evaluation.detectedContradiction?.expected).toBe('Status is successful');
    expect(evaluation.detectedContradiction?.observed).toContain('418');
    expect(evaluation.detectedContradiction?.likelySurface).toBeUndefined();
  });

  it('3. No default-to-repository repair target when target is unknown', () => {
    const tracker = new ProblemTracker();
    const problem = tracker.recordContradiction({
      goal: 'Mysterious goal',
      observed: 'Unclassifiable anomaly in subsystem zorg',
      fingerprint: 'fp-unknown-target',
    });
    expect(problem.repairTarget).toBeUndefined();
    expect(problem.repairSurface).toBeUndefined();

    const diagnosis = new DiagnosisController();
    const d = diagnosis.evaluate(problem);
    expect(d.nextMode).toBe('investigate');
    expect(d.repairTarget).toBeUndefined();
    expect(d.repairSurface).toBeUndefined();
    expect(d.repairKnown).toBe(false);
  });

  it('4. Numeric confidence alone cannot trigger repair mode', () => {
    const tracker = new ProblemTracker();
    const problem = tracker.recordContradiction({
      goal: 'Goal',
      observed: 'Anomaly',
      fingerprint: 'fp-confidence',
    });
    // Maximum confidence, but no evidence and no known target.
    tracker.addHypothesis('Confident guess with no evidence', undefined, 0.99);
    const d = new DiagnosisController().evaluate(problem);
    expect(d.nextMode).toBe('investigate');
    expect(d.nextMode).not.toBe('act_now');
    expect(d.nextMode).not.toBe('repair');
  });

  it('5. Decision sufficiency triggers ACT_NOW', () => {
    const { ledger, cleanup } = createTestLedger('Decision sufficiency');
    try {
      const orchestrator = new RecoveryOrchestrator();
      orchestrator.onActionOutcome(
        {
          tool: 'run_command',
          toolOk: true,
          output: 'Unexpected failure state',
          expected: 'Operation succeeds',
          semanticVerdict: { verdict: 'contradiction', explanation: 'Operation did not succeed', blocking: true },
        },
        ledger,
      );
      orchestrator.onSetHypothesis('The widget index is stale', 'deployment_runtime');
      const active = orchestrator.getActiveProblem()!;
      const { actNow } = orchestrator.proposeRepair({
        id: 'rp-sufficient',
        problemId: active.id,
        intendedEffect: 'Rebuild the widget index',
        target: { kind: 'deployment_runtime', resourceId: 'app-123', description: 'Application runtime' },
        actions: [],
        evidenceBasis: [],
        reversible: true,
        requiresApproval: false,
        verificationContract: { description: 'Verify success', originalObserved: active.observed, expectedOutcome: 'Operation succeeds' },
      });
      expect(actNow).toBe(true);
      expect(orchestrator.getActiveProblem()?.status).toBe('act_now');
      expect(orchestrator.actNowTransitions).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('6. ACT_NOW blocks generic exploratory reads', () => {
    const { ledger, cleanup } = createTestLedger('ACT_NOW guard');
    try {
      const orchestrator = new RecoveryOrchestrator();
      orchestrator.onActionOutcome(
        {
          tool: 'run_command',
          toolOk: true,
          output: 'Unexpected failure state',
          expected: 'Operation succeeds',
          semanticVerdict: { verdict: 'contradiction', explanation: 'Failure', blocking: true },
        },
        ledger,
      );
      orchestrator.onSetHypothesis('Cause hypothesis', 'filesystem');
      const active = orchestrator.getActiveProblem()!;
      orchestrator.proposeRepair({
        id: 'rp-actnow',
        problemId: active.id,
        intendedEffect: 'Fix it',
        target: { kind: 'filesystem', description: 'Filesystem target' },
        actions: [],
        evidenceBasis: [],
        reversible: true,
        requiresApproval: false,
        verificationContract: { description: 'Verify', originalObserved: active.observed, expectedOutcome: 'Operation succeeds' },
      });
      expect(orchestrator.getActiveProblem()?.status).toBe('act_now');

      const blocked = orchestrator.checkPreAction({ tool: 'search', params: { query: 'unrelated exploration' } }, 0);
      expect(blocked.allowed).toBe(false);
      expect(blocked.reason).toMatch(/suppressed|ACT_NOW|VALUE-OF-INFORMATION/);
    } finally {
      cleanup();
    }
  });

  it('7. Exact read-before-edit remains allowed in ACT_NOW', () => {
    const { ledger, cleanup } = createTestLedger('Read before edit');
    try {
      const orchestrator = new RecoveryOrchestrator();
      orchestrator.onActionOutcome(
        {
          tool: 'run_command',
          toolOk: true,
          output: 'Unexpected failure state',
          expected: 'Operation succeeds',
          semanticVerdict: { verdict: 'contradiction', explanation: 'Failure', blocking: true },
        },
        ledger,
      );
      orchestrator.onSetHypothesis('Auth handler is wrong', 'repository');
      const active = orchestrator.getActiveProblem()!;
      orchestrator.proposeRepair({
        id: 'rp-edit',
        problemId: active.id,
        intendedEffect: 'Correct the auth handler',
        target: { kind: 'repository', resourceId: 'src/auth.ts', description: 'Auth handler source' },
        actions: [{ tool: 'apply_edit', params: { path: 'src/auth.ts' }, intent: 'repair' }],
        evidenceBasis: [],
        reversible: true,
        requiresApproval: false,
        verificationContract: { description: 'Verify', originalObserved: active.observed, expectedOutcome: 'Operation succeeds' },
      });
      const allowed = orchestrator.checkPreAction({ tool: 'read_file', params: { path: 'src/auth.ts' } }, 0);
      expect(allowed.allowed).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('8. Investigation requires structured decision-changing intent in ACT_NOW', () => {
    const { ledger, cleanup } = createTestLedger('Structured intent');
    try {
      const orchestrator = new RecoveryOrchestrator();
      orchestrator.onActionOutcome(
        {
          tool: 'run_command',
          toolOk: true,
          output: 'Unexpected failure state',
          expected: 'Operation succeeds',
          semanticVerdict: { verdict: 'contradiction', explanation: 'Failure', blocking: true },
        },
        ledger,
      );
      orchestrator.onSetHypothesis('Cause', 'filesystem');
      const active = orchestrator.getActiveProblem()!;
      orchestrator.proposeRepair({
        id: 'rp-intent',
        problemId: active.id,
        intendedEffect: 'Fix it',
        target: { kind: 'filesystem', description: 'Filesystem' },
        actions: [],
        evidenceBasis: [],
        reversible: true,
        requiresApproval: false,
        verificationContract: { description: 'Verify', originalObserved: active.observed, expectedOutcome: 'Operation succeeds' },
      });

      // Keyword-laden reason WITHOUT structured intent is still suppressed.
      const keywordBypass = orchestrator.checkPreAction(
        { tool: 'read_file', params: { path: 'elsewhere.ts' }, reason: 'inspect region to edit, decision needed' } as never,
        0,
      );
      expect(keywordBypass.allowed).toBe(false);

      // Structured decision-changing intent is allowed.
      const structured = orchestrator.checkPreAction(
        {
          tool: 'search',
          params: { query: 'targeted lookup' },
          investigationIntent: {
            decisionQuestion: 'Which of the two candidate targets owns the fault?',
            alternatives: ['target-a', 'target-b'],
            expectedInformationGain: 'Selects the repair target',
            changesRepairTarget: true,
          },
        },
        0,
      );
      expect(structured.allowed).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('9. Non-material evidence does NOT unlock a failed strategy', () => {
    const tracker = new ProblemTracker();
    const problem = tracker.recordContradiction({ goal: 'Goal', observed: 'Failure state', fingerprint: 'fp-nonmaterial' });
    const guard = new StrategyGuard();
    const action = { tool: 'run_command', params: { command: 'probe --state' } };

    const v1 = guard.evaluate(action, problem, 0);
    expect(v1.allowed).toBe(true);
    guard.markOutcome(v1.strategyFingerprint, true);

    // A screenshot of the SAME state: evidence count grew, nothing material changed.
    const v2 = guard.evaluate(action, problem, {
      evidenceImpacts: [
        { evidenceId: 'ev-screenshot-2', changedHypothesis: false, changedRelevantState: false, changedRepairDecision: false, changedExpectedOutcome: false, material: false },
      ],
    });
    expect(v2.allowed).toBe(false);
    expect(v2.reason).toContain('STRATEGY LOOP BLOCKED');
  });

  it('10. Material evidence change DOES unlock appropriate retry', () => {
    const tracker = new ProblemTracker();
    const problem = tracker.recordContradiction({ goal: 'Goal', observed: 'Failure state', fingerprint: 'fp-material' });
    const guard = new StrategyGuard();
    const action = { tool: 'run_command', params: { command: 'probe --state' } };

    const v1 = guard.evaluate(action, problem, 0);
    expect(v1.allowed).toBe(true);
    guard.markOutcome(v1.strategyFingerprint, true);

    const v2 = guard.evaluate(action, problem, {
      evidenceImpacts: [
        { evidenceId: 'ev-decision', changedHypothesis: false, changedRelevantState: false, changedRepairDecision: true, changedExpectedOutcome: false, material: true },
      ],
    });
    expect(v2.allowed).toBe(true);
  });

  it('11. Semantically equivalent rewording does NOT bypass the strategy guard', () => {
    const tracker = new ProblemTracker();
    const problem = tracker.recordContradiction({ goal: 'Goal', observed: 'Failure state', fingerprint: 'fp-semantic' });
    tracker.addHypothesis('try logging in again');
    const guard = new StrategyGuard();
    const action = { tool: 'run_command', params: { command: 'auth --retry' } };

    const v1 = guard.evaluate(action, problem, 0);
    expect(v1.allowed).toBe(true);
    guard.markOutcome(v1.strategyFingerprint, true);

    // Model rewords the hypothesis instead of materially changing it.
    tracker.addHypothesis('retry authentication');
    const v2 = guard.evaluate(action, problem, 0);
    expect(v2.allowed).toBe(false);

    // Ordering/case/punctuation variants are also equivalent.
    expect(canonicalStatement('Retry Authentication')).toBe(canonicalStatement('authentication retry!'));
    expect(semanticDigest('Authenticate again')).toBe(semanticDigest('retry authentication'));
  });

  it('12. Nested problems resolve in dependency order and resume parents (A←B←C)', () => {
    const tracker = new ProblemTracker();
    const a = tracker.recordContradiction({ goal: 'Mission', observed: 'Deployment broken', fingerprint: 'fp-A' });
    const b = tracker.recordContradiction({ goal: 'Mission', observed: 'Database resource missing', fingerprint: 'fp-B' });
    const c = tracker.recordContradiction({ goal: 'Mission', observed: 'Permission denied', fingerprint: 'fp-C' });

    // Nesting relationships preserved.
    expect(b.parentProblemId).toBe(a.id);
    expect(c.parentProblemId).toBe(b.id);
    expect(tracker.getActiveProblem()?.id).toBe(c.id);
    expect(tracker.getProblemStack().map((p) => p.id)).toEqual([a.id, b.id, c.id]);

    // Resolve C → resume B.
    const rC = tracker.resolveActiveProblem();
    expect(rC.resolved).toBe(true);
    expect(rC.resumedParent?.id).toBe(b.id);
    expect(tracker.getActiveProblem()?.id).toBe(b.id);

    // Resolve B → resume A.
    const rB = tracker.resolveActiveProblem();
    expect(rB.resolved).toBe(true);
    expect(rB.resumedParent?.id).toBe(a.id);
    expect(tracker.getActiveProblem()?.id).toBe(a.id);

    // Resolve A → mission clear.
    const rA = tracker.resolveActiveProblem();
    expect(rA.resolved).toBe(true);
    expect(rA.resumedParent).toBeUndefined();
    expect(tracker.hasActiveProblem()).toBe(false);
  });

  it('13. Repair via run_command with declared intent transitions to verification', () => {
    const { ledger, cleanup } = createTestLedger('Generic repair intent');
    try {
      const orchestrator = new RecoveryOrchestrator();
      orchestrator.onActionOutcome(
        {
          tool: 'run_command',
          toolOk: false,
          exitCode: 1,
          output: 'fictional converter failed',
          expected: 'Converter succeeds',
        },
        ledger,
      );
      expect(orchestrator.hasActiveProblem()).toBe(true);

      orchestrator.onActionOutcome(
        {
          tool: 'run_command',
          toolOk: true,
          output: 'Applied converter fix',
          intent: 'repair',
          capability: { intent: 'repair', mutatesState: true, resourceScope: 'zorg:z1' },
        },
        ledger,
      );
      expect(orchestrator.getActiveProblem()?.status).toBe('verifying');
      expect(orchestrator.repairAttempts).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('14. Repair via a generic future capability adapter transitions (no tool-name conditional)', () => {
    const { ledger, cleanup } = createTestLedger('Future adapter repair');
    try {
      const orchestrator = new RecoveryOrchestrator();
      orchestrator.onActionOutcome(
        {
          tool: 'run_command',
          toolOk: false,
          exitCode: 1,
          output: 'fictional subsystem failed',
          expected: 'Subsystem healthy',
        },
        ledger,
      );
      orchestrator.onActionOutcome(
        {
          tool: 'mcp:zorg-future:repair',
          toolOk: true,
          output: 'Future adapter applied fix',
          intent: 'repair',
          capability: { intent: 'repair', mutatesState: true, resourceScope: 'quantum:q1' },
        },
        ledger,
      );
      expect(orchestrator.getActiveProblem()?.status).toBe('verifying');
      expect(orchestrator.strategyGuard.getResourceEpoch('quantum:q1')).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('15. Unrelated state change does NOT unlock a failed strategy', () => {
    const tracker = new ProblemTracker();
    const problem = tracker.recordContradiction({
      goal: 'Goal',
      observed: 'Datastore failure',
      fingerprint: 'fp-scoped',
      likelyTarget: { kind: 'database', resourceId: 'db-42', description: 'Primary datastore' },
    });
    const guard = new StrategyGuard();
    const action = { tool: 'run_command', params: { command: 'datastore --retry' }, resourceScope: 'db-42' };

    const v1 = guard.evaluate(action, problem, 0);
    expect(v1.allowed).toBe(true);
    guard.markOutcome(v1.strategyFingerprint, true);

    // An unrelated file change must not unlock the datastore strategy.
    guard.advanceResourceEpoch('workspace:other.ts');
    const v2 = guard.evaluate(action, problem, 0);
    expect(v2.allowed).toBe(false);
  });

  it('16. Relevant resource state change DOES unlock the strategy', () => {
    const tracker = new ProblemTracker();
    const problem = tracker.recordContradiction({
      goal: 'Goal',
      observed: 'Datastore failure',
      fingerprint: 'fp-scoped-unlock',
      likelyTarget: { kind: 'database', resourceId: 'db-42', description: 'Primary datastore' },
    });
    const guard = new StrategyGuard();
    const action = { tool: 'run_command', params: { command: 'datastore --retry' }, resourceScope: 'db-42' };

    const v1 = guard.evaluate(action, problem, 0);
    guard.markOutcome(v1.strategyFingerprint, true);

    guard.advanceResourceEpoch('db-42');
    const v2 = guard.evaluate(action, problem, 0);
    expect(v2.allowed).toBe(true);
  });

  it('17. User interruption bumps the epoch and stale queued work is dropped', () => {
    const orchestrator = new RecoveryOrchestrator();
    const epoch = orchestrator.getInterruptEpoch();
    orchestrator.notifyInterrupt('user_message');
    expect(orchestrator.getInterruptEpoch()).toBe(epoch + 1);
    expect(orchestrator.interruptEpochChanges).toBe(1);

    const stale = orchestrator.checkPreAction(
      { tool: 'read_file', params: { path: 'a.ts' }, capturedInterruptEpoch: epoch },
      0,
    );
    expect(stale.allowed).toBe(false);
    expect(stale.stale).toBe(true);
    expect(orchestrator.staleParallelActionsCancelled).toBe(1);
  });

  it('18. Parallel sibling results after a blocker are stale and cannot advance plan state', () => {
    const { ledger, cleanup } = createTestLedger('Parallel safety');
    try {
      ledger.setPlan([{ id: 'step-1', description: 'Do work', area: 'backend', status: 'in_progress', verification: 'verify-cmd' }]);
      const orchestrator = new RecoveryOrchestrator();
      const epochBefore = orchestrator.getInterruptEpoch();

      orchestrator.onActionOutcome(
        {
          tool: 'run_command',
          toolOk: true,
          output: 'Sibling A found a blocking prerequisite failure',
          expected: 'Prerequisite holds',
          stepId: 'step-1',
          semanticVerdict: { verdict: 'blocker', explanation: 'Blocking prerequisite failure', blocking: true },
        },
        ledger,
      );
      expect(ledger.step('step-1')?.status).toBe('blocked');

      // Sibling B was scheduled before the blocker: it is stale now.
      const batch = orchestrator.filterParallelBatch([
        { tool: 'run_command', params: { command: 'verify-cmd' }, capturedInterruptEpoch: epochBefore },
      ]);
      expect(batch.cancelled.length).toBe(1);
      expect(batch.runnable.length).toBe(0);
      // The blocked step must not have advanced.
      expect(ledger.step('step-1')?.status).toBe('blocked');
    } finally {
      cleanup();
    }
  });

  it('19. Generic build pass cannot resolve an unrelated runtime problem', () => {
    const { ledger, cleanup } = createTestLedger('Verification scoping');
    try {
      const orchestrator = new RecoveryOrchestrator();
      const expectation = statusExpectation('Service is healthy', 200);
      orchestrator.onActionOutcome(
        {
          tool: 'run_command',
          toolOk: true,
          expectation,
          observation: { transportOk: true, fields: { status: 500 } },
          output: 'status 500',
          stepId: 'step-1',
        },
        ledger,
      );
      expect(orchestrator.hasActiveProblem()).toBe(true);
      const problemId = orchestrator.getActiveProblem()?.id;

      const verify = orchestrator.onActionOutcome(
        {
          tool: 'run_command',
          toolOk: true,
          exitCode: 0,
          output: 'build passed',
          observation: { transportOk: true, fields: { build: 'passed' } },
        },
        ledger,
      );
      expect(verify.resolved).toBe(false);
      expect(orchestrator.hasActiveProblem()).toBe(true);
      expect(orchestrator.getActiveProblem()?.id).toBe(problemId);
    } finally {
      cleanup();
    }
  });

  it('20. Absence of old error text alone cannot prove success', () => {
    const { ledger, cleanup } = createTestLedger('Positive proof');
    try {
      const orchestrator = new RecoveryOrchestrator();
      orchestrator.onActionOutcome(
        {
          tool: 'run_command',
          toolOk: true,
          output: 'mysterious zorg failure',
          expected: 'Zorg operational',
          semanticVerdict: { verdict: 'contradiction', explanation: 'mysterious zorg failure', blocking: true },
        },
        ledger,
      );
      expect(orchestrator.hasActiveProblem()).toBe(true);

      // Old error text is gone, but the expected state is not positively shown.
      const verify = orchestrator.onActionOutcome(
        { tool: 'run_command', toolOk: true, exitCode: 0, output: 'all good, nothing to report', expected: 'Zorg operational' },
        ledger,
      );
      expect(verify.resolved).toBe(false);
      expect(orchestrator.hasActiveProblem()).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('21. Positive satisfaction of the verification contract resolves the problem', () => {
    const { ledger, cleanup } = createTestLedger('Contract pass');
    try {
      const orchestrator = new RecoveryOrchestrator();
      const expectation = statusExpectation('Service healthy with status 200', 200);
      orchestrator.onActionOutcome(
        {
          tool: 'run_command',
          toolOk: true,
          expectation,
          observation: { transportOk: true, fields: { status: 500 } },
          output: 'status 500',
          stepId: 'step-1',
        },
        ledger,
      );
      expect(orchestrator.hasActiveProblem()).toBe(true);

      const verify = orchestrator.onActionOutcome(
        {
          tool: 'run_command',
          toolOk: true,
          expectation,
          observation: { transportOk: true, fields: { status: 200 } },
          output: 'status 200 ok',
          stepId: 'step-1',
        },
        ledger,
      );
      expect(verify.resolved).toBe(true);
      expect(orchestrator.verificationContractPasses).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('22. Repeated screenshots of identical state count as no material progress', () => {
    const { ledger, cleanup } = createTestLedger('Screenshot drift');
    try {
      const orchestrator = new RecoveryOrchestrator();
      orchestrator.onActionOutcome(
        {
          tool: 'browse',
          toolOk: true,
          output: 'SCREEN:same-dashboard',
          expected: 'Dashboard shows data',
          semanticVerdict: { verdict: 'contradiction', explanation: 'Dashboard shows stale state', blocking: true },
        },
        ledger,
      );
      expect(orchestrator.hasActiveProblem()).toBe(true);

      // Same screenshot twice more: no material progress.
      orchestrator.onActionOutcome({ tool: 'browse', toolOk: true, output: 'SCREEN:same-dashboard', expected: 'Dashboard shows data' }, ledger);
      orchestrator.onActionOutcome({ tool: 'browse', toolOk: true, output: 'SCREEN:same-dashboard', expected: 'Dashboard shows data' }, ledger);

      expect(orchestrator.nonMaterialEvidenceIgnored).toBeGreaterThanOrEqual(2);
      expect(orchestrator.getActiveProblem()?.materialProgressEvents?.length ?? 0).toBe(0);
      expect(orchestrator.hasActiveProblem()).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('23. Investigation drift forces a strategy decision instead of indefinite reads', () => {
    const { ledger, cleanup } = createTestLedger('Drift control');
    try {
      const orchestrator = new RecoveryOrchestrator();
      orchestrator.onActionOutcome(
        {
          tool: 'run_command',
          toolOk: true,
          output: 'Unexpected failure state',
          expected: 'Operation succeeds',
          semanticVerdict: { verdict: 'contradiction', explanation: 'Failure', blocking: true },
        },
        ledger,
      );
      orchestrator.onSetHypothesis('Candidate cause under test');

      let driftBlock: { allowed: boolean; reason?: string } | undefined;
      for (let i = 0; i < 10; i++) {
        const r = orchestrator.checkPreAction(
          { tool: 'read_file', params: { path: `src/file-${i}.ts` }, reason: `targeted read ${i} for decision Q${i}` },
          i,
        );
        if (!r.allowed) {
          driftBlock = r;
          break;
        }
      }
      expect(driftBlock).toBeDefined();
      expect(driftBlock!.allowed).toBe(false);
      expect(driftBlock!.reason).toContain('INVESTIGATION DRIFT');
    } finally {
      cleanup();
    }
  });

  it('24. Unknown future repair target strings work without source changes', () => {
    const { ledger, cleanup } = createTestLedger('Future target');
    try {
      const orchestrator = new RecoveryOrchestrator();
      orchestrator.onActionOutcome(
        {
          tool: 'run_command',
          toolOk: true,
          output: 'Unexpected failure state',
          expected: 'Operation succeeds',
          semanticVerdict: { verdict: 'contradiction', explanation: 'Failure', blocking: true },
        },
        ledger,
      );
      orchestrator.onSetHypothesis('Flux imbalance in the future system');
      const active = orchestrator.getActiveProblem()!;
      const { actNow } = orchestrator.proposeRepair({
        id: 'rp-future',
        problemId: active.id,
        intendedEffect: 'Rebalance the flux',
        target: { kind: 'quantum_flux_capacitor', resourceId: 'qfc-1', description: 'Future system component' },
        actions: [],
        evidenceBasis: [],
        reversible: true,
        requiresApproval: false,
        verificationContract: { description: 'Verify', originalObserved: active.observed, expectedOutcome: 'Operation succeeds' },
      });
      expect(actNow).toBe(true);
      expect(orchestrator.getActiveProblem()?.repairTarget?.kind).toBe('quantum_flux_capacitor');
    } finally {
      cleanup();
    }
  });

  it('25. No password/credential content enters strategy fingerprints', () => {
    // Same statement modulo secret values → identical semantic digest.
    expect(semanticDigest('fix login with password=hunter2')).toBe(semanticDigest('fix login with password=correct-horse'));
    // Redaction removes the secret text.
    expect(canonicalStatement('use token=abc123 to proceed')).not.toContain('abc123');
    // Structured params with different secrets → identical field digest.
    expect(digestFields({ user: 'ana', password: 'hunter2' })).toBe(digestFields({ user: 'ana', password: 'other-secret' }));
  });
});
