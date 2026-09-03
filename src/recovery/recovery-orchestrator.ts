import { ProblemTracker } from './problem-tracker.js';
import { ProgressEvaluator, type ActionOutcomeInput } from './progress-evaluator.js';
import { DiagnosisController } from './diagnosis-controller.js';
import { StrategyGuard, type StrategyCheckInput } from './strategy-guard.js';
import type {
  OutcomeEvaluation,
  ProblemState,
  RepairSurface,
} from './problem-state.js';
import type { TaskLedger } from '../ledger/task-ledger.js';

export interface PreActionCheckResult {
  allowed: boolean;
  reason?: string;
}

export interface PostActionOutcomeResult {
  evaluation: OutcomeEvaluation;
  interrupted: boolean;
  resolved: boolean;
  problem?: ProblemState;
  guidance?: string;
  unblockedStepIds?: string[];
}

export class RecoveryOrchestrator {
  public readonly tracker: ProblemTracker;
  public readonly evaluator: ProgressEvaluator;
  public readonly diagnosis: DiagnosisController;
  public readonly strategyGuard: StrategyGuard;
  private readonly emit: (event: string) => void;

  // Telemetry counters
  public problemsDetected = 0;
  public planInterruptions = 0;
  public hypothesesTested = 0;
  public recoveryAttempts = 0;
  public strategyRepeatsPrevented = 0;
  public redundantInvestigationsPrevented = 0;
  public successfulRecoveries = 0;
  public failedRecoveries = 0;
  public resumedMissions = 0;

  // AC-19 counters
  public investigationActionsBeforeDiagnosis = 0;
  public actionsAfterDiagnosisBeforeRepair = 0;
  public redundantReadsPrevented = 0;
  public strategyChanges = 0;
  public repairAttempts = 0;
  public verificationActions = 0;
  private consecutiveInvestigationCount = 0;

  constructor(emit: (event: string) => void = () => {}) {
    this.tracker = new ProblemTracker();
    this.evaluator = new ProgressEvaluator();
    this.diagnosis = new DiagnosisController();
    this.strategyGuard = new StrategyGuard();
    this.emit = emit;
  }

  hasActiveProblem(): boolean {
    return this.tracker.hasActiveProblem();
  }

  getActiveProblem(): ProblemState | undefined {
    return this.tracker.getActiveProblem();
  }

  checkPreAction(action: StrategyCheckInput, evidenceCount: number): PreActionCheckResult {
    const active = this.getActiveProblem();
    if (!active) return { allowed: true };

    // AC-19: Track discipline phases
    const isRepairAction = action.tool === 'write_file' || action.tool === 'apply_edit' || action.tool === 'connection_operation';
    if (active.status === 'investigating') {
      this.investigationActionsBeforeDiagnosis += 1;
      this.consecutiveInvestigationCount += 1;
      // AC-19: After several investigative actions without progress, force a strategy decision
      if (this.consecutiveInvestigationCount >= 4 && active.hypotheses.length === 0) {
        return {
          allowed: false,
          reason:
            'INVESTIGATION LIMIT REACHED: Multiple investigative actions performed without progress. ' +
            'You must now formulate a hypothesis (set_hypothesis) or choose a repair approach rather than continuing indefinite exploration.',
        };
      }
    } else if (active.status === 'repairing') {
      if (!isRepairAction) {
        this.actionsAfterDiagnosisBeforeRepair += 1;
      }
    }

    // 1. Strategy-level loop prevention
    const strategyVerdict = this.strategyGuard.evaluate(action, active, evidenceCount);
    if (!strategyVerdict.allowed) {
      this.strategyRepeatsPrevented += 1;
      this.emit('strategy repeat prevented — same unresolved problem without state change');
      return { allowed: false, reason: strategyVerdict.reason };
    }

    // 2. Value-of-information & confidence-to-action guard (AC-19)
    const voiVerdict = this.diagnosis.checkValueOflnformation(action, active);
    if (!voiVerdict.allowed) {
      this.redundantReadsPrevented += 1;
      this.redundantInvestigationsPrevented += 1;
      this.emit('investigation redundant read prevented — root cause already diagnosed');
      return { allowed: false, reason: voiVerdict.reason };
    }

    return { allowed: true };
  }

  onActionOutcome(input: ActionOutcomeInput, ledger: TaskLedger): PostActionOutcomeResult {
    const active = this.getActiveProblem();
    const evaluation = this.evaluator.evaluate(input, active);

    // Case 1: Verification succeeded on active problem!
    if (active && evaluation.verdict === 'expected_achieved') {
      const resolution = this.tracker.resolveActiveProblem();
      this.successfulRecoveries += 1;
      this.resumedMissions += 1;
      this.emit(`problem resolved — ${active.id}: original contradiction verified resolved`);

      // Resume suspended steps in the ledger
      for (const stepId of resolution.unblockedStepIds) {
        const step = ledger.step(stepId);
        if (step && (step.status === 'blocked' || step.status === 'in_progress')) {
          ledger.updateStep(stepId, { status: 'in_progress' });
          this.emit(`step     ${stepId} resumed from problem recovery`);
        }
      }

      return {
        evaluation,
        interrupted: false,
        resolved: true,
        problem: resolution.problem,
        unblockedStepIds: resolution.unblockedStepIds,
        guidance:
          `✓ PROBLEM RESOLVED (${active.id}): Original contradiction verified resolved.\n` +
          `Suspended mission step(s) [${resolution.unblockedStepIds.join(', ')}] have resumed. Continue with the original mission plan.`,
      };
    }

    // Case 2: Repair action applied — advance state epoch and transition to verifying
    if (active && (input.tool === 'write_file' || input.tool === 'apply_edit' || input.tool === 'connection_operation')) {
      if (input.toolOk) {
        this.repairAttempts += 1;
        this.strategyGuard.advanceEpoch(`repair:${input.tool}`);
        this.tracker.transitionStatus('verifying');
        this.emit(`problem repairing — ${active.id}: fix applied, verification of original failure required`);
      }
    } else if (active && (active.status === 'verifying' || active.status === 'repairing')) {
      this.verificationActions += 1;
    }

    // Case 3: Contradiction / Blocker detected
    if (evaluation.detectedContradiction && evaluation.isBlocking) {
      const isNew = !active || active.fingerprint !== evaluation.detectedContradiction.fingerprint;
      const problem = this.tracker.recordContradiction({
        goal: ledger.data.goal,
        expected: evaluation.detectedContradiction.expected,
        observed: evaluation.detectedContradiction.observed,
        fingerprint: evaluation.detectedContradiction.fingerprint,
        likelySurface: evaluation.detectedContradiction.likelySurface,
        stepId: input.stepId,
      });

      if (isNew) {
        this.problemsDetected += 1;
        this.planInterruptions += 1;
        this.emit(`problem detected — ${problem.id}: ${evaluation.detectedContradiction.observed}`);

        // Suspend current step if attached
        if (input.stepId) {
          const step = ledger.step(input.stepId);
          if (step && step.status !== 'done') {
            ledger.updateStep(input.stepId, { status: 'blocked' });
            this.emit(`step     ${input.stepId} suspended due to active problem ${problem.id}`);
          }
        }
      } else {
        // Repeated failure during recovery attempt
        this.recoveryAttempts += 1;
        this.failedRecoveries += 1;
        // If active hypothesis was disproved
        if (problem.activeHypothesisId) {
          this.tracker.updateHypothesis(problem.activeHypothesisId, 'rejected', 0.1);
          this.emit(`problem hypothesis disproved — ${problem.activeHypothesisId}`);
        }
      }

      this.tracker.recordAttempt({
        hypothesisId: problem.activeHypothesisId,
        strategyFingerprint: evaluation.detectedContradiction.fingerprint,
        intendedEffect: input.expected || input.reason || input.tool,
        actionSummary: `${input.tool}: ${evaluation.explanation}`,
        outcome: 'failed',
        observedState: evaluation.detectedContradiction.observed,
        stateEpoch: this.strategyGuard.getEpoch(),
      });

      const guidance =
        `\n⚠️ PROBLEM RECOVERY ACTIVE (${problem.id}):\n` +
        `  Contradiction: Expected "${evaluation.detectedContradiction.expected}" but observed "${evaluation.detectedContradiction.observed}".\n` +
        `  Status: ${problem.status} (likely repair surface: ${problem.repairSurface || 'unclassified'})\n` +
        (input.stepId ? `  Suspended step: ${input.stepId}\n` : '') +
        `  Required lifecycle:\n` +
        `  1. Formulate a root-cause hypothesis (set_hypothesis) if not already set.\n` +
        `  2. Conduct MINIMUM necessary investigation to verify.\n` +
        `  3. Directly repair the controllable surface (do NOT continue redundant investigation).\n` +
        `  4. Re-verify the ORIGINAL contradiction before resuming the plan.`;

      return {
        evaluation,
        interrupted: true,
        resolved: false,
        problem,
        guidance,
      };
    }

    return {
      evaluation,
      interrupted: false,
      resolved: false,
      problem: active,
    };
  }

  onSetHypothesis(text: string, surface?: RepairSurface, confidence?: number): void {
    const active = this.getActiveProblem();
    if (!active) return;
    this.hypothesesTested += 1;
    this.strategyChanges += 1;
    this.consecutiveInvestigationCount = 0;
    const hyp = this.tracker.addHypothesis(text, surface, confidence);
    if (!hyp) return;

    // Evaluate diagnosis
    const diag = this.diagnosis.evaluate(active);
    this.tracker.setDiagnosis(diag);

    if (diag.rootCauseKnown && diag.confidence >= 0.8) {
      this.emit(`problem root cause identified — ${active.id}: ${text.slice(0, 80)} (target: ${diag.repairSurface})`);
    } else {
      this.emit(`problem hypothesis formulated — ${active.id} [${hyp.id}]: ${text.slice(0, 80)}`);
    }
  }

  shouldEscalateEffort(): boolean {
    const active = this.getActiveProblem();
    if (!active) return false;
    // Escalate if multiple recovery attempts failed or repeated disproved hypotheses
    return active.attempts.length >= 2 || active.hypotheses.filter((h) => h.status === 'rejected').length >= 2;
  }

  renderPromptSection(): string {
    const active = this.getActiveProblem();
    if (!active || active.status === 'resolved') return '';

    const lines: string[] = [
      `ACTIVE PROBLEM RECOVERY (${active.id}):`,
      `  Contradiction: Expected "${active.expected || 'Success'}" vs Observed "${active.observed.slice(0, 200)}"`,
      `  Status: ${active.status.toUpperCase()}`,
      active.repairSurface ? `  Likely Repair Surface: ${active.repairSurface}` : '',
      active.blockedStepIds.length ? `  Suspended Mission Step(s): ${active.blockedStepIds.join(', ')}` : '',
      active.activeHypothesisId
        ? `  Active Hypothesis: [${active.activeHypothesisId}] ${active.hypotheses.find((h) => h.id === active.activeHypothesisId)?.statement}`
        : '  Active Hypothesis: (none — use set_hypothesis to state why this contradiction occurred)',
      active.status === 'repairing'
        ? '  DIRECTIVE: Root cause identified. Investigation is complete. Apply the fix directly to the repair surface.'
        : active.status === 'verifying'
        ? '  DIRECTIVE: Repair applied. Now run the command/probe that originally failed to verify the fix.'
        : '  DIRECTIVE: Formulate a hypothesis and investigate the minimum evidence needed to identify the repair.',
    ].filter(Boolean);

    return lines.join('\n');
  }
}
