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

describe('Autonomous Problem-Solving Runtime (AC-1 to AC-19)', () => {
  it('AC-1: Decouples toolOk from outcome success — detects 405 Method Not Allowed contradiction when toolOk=true', () => {
    const evaluator = new ProgressEvaluator();
    // Tool execution succeeded (e.g. curl exited code 0), but output contains 405
    const evaluation = evaluator.evaluate({
      tool: 'run_command',
      toolOk: true,
      exitCode: 0,
      params: { command: 'curl -X POST http://localhost:3000/api/auth/login' },
      expected: 'User logs in successfully and receives session token',
      output: 'HTTP/1.1 405 Method Not Allowed\nAllow: GET, HEAD\nContent-Length: 0',
    });

    expect(evaluation.verdict).toBe('contradiction');
    expect(evaluation.isBlocking).toBe(true);
    expect(evaluation.detectedContradiction).toBeDefined();
    expect(evaluation.detectedContradiction?.observed).toContain('405 Method Not Allowed');
    expect(evaluation.detectedContradiction?.likelySurface).toBe('deployment');
  });

  it('AC-1b: Detects SPA routing fallback (HTML returned for expected API JSON endpoint)', () => {
    const evaluator = new ProgressEvaluator();
    const evaluation = evaluator.evaluate({
      tool: 'run_command',
      toolOk: true,
      exitCode: 0,
      params: { command: 'curl http://localhost:3000/api/users' },
      expected: 'JSON list of registered users',
      output: '<!doctype html><html><head><title>App</title></head><body><div id="root"></div></body></html>',
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

  it('AC-3 & AC-15: Explicit contradiction resolution before unblocking mission step', () => {
    const { ledger, cleanup } = createTestLedger('Fix API login');
    try {
      ledger.setPlan([
        { id: 'step-1', description: 'Implement login route', area: 'backend', status: 'in_progress', verification: 'curl -X POST http://localhost:3000/api/auth/login' },
        { id: 'step-2', description: 'Build frontend login form', area: 'frontend', status: 'pending' },
      ]);

      const events: string[] = [];
      const orchestrator = new RecoveryOrchestrator((e) => events.push(e));

      // 1. First attempt fails with 405
      const failOutcome = orchestrator.onActionOutcome(
        {
          tool: 'run_command',
          toolOk: true,
          exitCode: 0,
          expected: 'HTTP 200 OK login token',
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

      // 3. Re-verification succeeds
      const verifyOutcome = orchestrator.onActionOutcome(
        {
          tool: 'run_command',
          toolOk: true,
          exitCode: 0,
          expected: 'HTTP 200 OK login token',
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

  it('AC-4: Dynamic plan interruption & step suspension', () => {
    const { ledger, cleanup } = createTestLedger('Setup DB');
    try {
      ledger.setPlan([
        { description: 'Connect DB', area: 'backend' },
      ]);
      const step1 = ledger.data.plan[0]!;
      step1.status = 'in_progress';

      const orchestrator = new RecoveryOrchestrator();
      orchestrator.onActionOutcome(
        {
          tool: 'run_command',
          toolOk: true,
          output: 'ECONNREFUSED 127.0.0.1:5432',
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

  it('AC-5 & AC-6 & AC-19: Diagnosis-before-action, Value-of-Information, and Investigation discipline', () => {
    const tracker = new ProblemTracker();
    const problem = tracker.recordContradiction({
      goal: 'Serve app',
      expected: '200 OK',
      observed: '405 Method Not Allowed on /api/auth',
      fingerprint: 'fp-405',
      likelySurface: 'deployment',
    });

    const diagnosis = new DiagnosisController();

    // Before hypothesis: mode is investigate
    const d1 = diagnosis.evaluate(problem);
    expect(d1.nextMode).toBe('investigate');
    expect(d1.rootCauseKnown).toBe(false);

    // Add candidate hypothesis
    tracker.addHypothesis('Nginx reverse proxy is missing POST forwarding for /api/auth', 'deployment', 0.9);
    const d2 = diagnosis.evaluate(problem);
    expect(d2.nextMode).toBe('repair');
    expect(d2.rootCauseKnown).toBe(true);
    expect(d2.repairSurface).toBe('deployment');

    // Value-of-information check:
    tracker.transitionStatus('repairing');
    tracker.setDiagnosis(d2);

    // Unrelated exploratory search in repair mode should be SUPPRESSED (AC-6, AC-19)
    const voi = diagnosis.checkValueOflnformation(
      { tool: 'grep_search', params: { query: 'something unrelated' } },
      problem,
    );
    expect(voi.allowed).toBe(false);
    expect(voi.reason).toContain('VALUE-OF-INFORMATION GUARD');
  });

  it('AC-7: Repair surface classification', () => {
    const evaluator = new ProgressEvaluator();

    // Docker / proxy -> deployment
    const e1 = evaluator.evaluate({
      tool: 'run_command',
      toolOk: false,
      output: 'docker container exited with code 1',
    });
    expect(e1.detectedContradiction?.likelySurface).toBe('deployment');

    // Postgres / prisma -> database
    const e2 = evaluator.evaluate({
      tool: 'run_command',
      toolOk: false,
      output: 'PrismaClientInitializationError: Can not reach database server',
    });
    expect(e2.detectedContradiction?.likelySurface).toBe('database');

    // ECONNREFUSED -> local_runtime
    const e3 = evaluator.evaluate({
      tool: 'run_command',
      toolOk: false,
      output: 'connect ECONNREFUSED 127.0.0.1:8080',
    });
    expect(e3.detectedContradiction?.likelySurface).toBe('local_runtime');
  });

  it('AC-9 & AC-10: Strategy-level loop prevention and state epoch advance', () => {
    const tracker = new ProblemTracker();
    const problem = tracker.recordContradiction({
      goal: 'Test endpoint',
      observed: '405 Method Not Allowed',
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

    // Repeating identical strategy without state advance: BLOCKED (AC-9)
    const v2 = guard.evaluate(action, problem, 0);
    expect(v2.allowed).toBe(false);
    expect(v2.reason).toContain('STRATEGY LOOP BLOCKED');

    // State epoch advances (e.g. edit made): ALLOWED (AC-10)
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
          output: '500 Internal Server Error',
          expected: '200 OK',
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

      // Problem detected
      orchestrator.onActionOutcome(
        { tool: 'run_command', toolOk: true, output: '405 Method Not Allowed', expected: '200 OK' },
        ledger,
      );
      expect(orchestrator.shouldEscalateEffort()).toBe(false);

      // First failure attempt
      orchestrator.onActionOutcome(
        { tool: 'run_command', toolOk: true, output: '405 Method Not Allowed', expected: '200 OK' },
        ledger,
      );
      // Second failure attempt -> triggers escalation!
      orchestrator.onActionOutcome(
        { tool: 'run_command', toolOk: true, output: '405 Method Not Allowed', expected: '200 OK' },
        ledger,
      );

      expect(orchestrator.shouldEscalateEffort()).toBe(true);
    } finally {
      cleanup();
    }
  });

  it('AC-14 & AC-19: Investigation-to-action discipline telemetry tracking', () => {
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

      // Formulate hypothesis
      orchestrator.onSetHypothesis('Database URL port is incorrect in config.ts', 'configuration', 0.9);
      expect(orchestrator.strategyChanges).toBe(1);
      expect(orchestrator.getActiveProblem()?.status).toBe('repairing');

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
      observed: '405 Method Not Allowed',
      fingerprint: 'fp-dup',
      stepId: 'step-1',
    });

    const p2 = tracker.recordContradiction({
      goal: 'Goal',
      observed: '405 Method Not Allowed (second time)',
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
      observed: '405 Method Not Allowed',
      fingerprint: 'fp-prompt',
      likelySurface: 'deployment',
      stepId: 'step-create',
    });

    const orchestrator = new RecoveryOrchestrator();
    // Inject tracker
    (orchestrator as any).tracker = tracker;

    const promptSection = orchestrator.renderPromptSection();
    expect(promptSection).toContain('ACTIVE PROBLEM RECOVERY');
    expect(promptSection).toContain('405 Method Not Allowed');
    expect(promptSection).toContain('Suspended Mission Step(s): step-create');
    expect(promptSection).toContain('Likely Repair Surface: deployment');
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

