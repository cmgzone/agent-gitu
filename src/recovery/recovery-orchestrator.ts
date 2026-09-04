import { ProblemTracker } from './problem-tracker.js';
import { ProgressEvaluator, type ActionOutcomeInput } from './progress-evaluator.js';
import { DiagnosisController } from './diagnosis-controller.js';
import { StrategyGuard, type StrategyCheckInput, type StrategyUnlockContext } from './strategy-guard.js';
import { InvestigationGuard, type StatFn } from './investigation-guard.js';
import type {
  ActionCapability,
  ActionExpectation,
  DecisionQuestion,
  EvidenceImpact,
  ExecutionInterruptState,
  InterruptReason,
  InvestigationIntent,
  OutcomeEvaluation,
  ProblemState,
  RepairProposal,
  RepairSurface,
  RepairTarget,
  VerificationContract,
} from './problem-state.js';
import { UNKNOWN_REPAIR_TARGET } from './problem-state.js';
import { digestObservation, normalizeFailureSignature } from './evidence-utils.js';
import * as narration from '../agent/narration.js';
import type { TaskLedger } from '../ledger/task-ledger.js';
import { statSync } from 'node:fs';
import path from 'node:path';
import { isManufacturedEvidenceCommand } from '../evidence/evidence.js';

export interface PreActionCheckResult {
  allowed: boolean;
  reason?: string;
  stale?: boolean;
}

export interface PostActionOutcomeResult {
  evaluation: OutcomeEvaluation;
  interrupted: boolean;
  resolved: boolean;
  problem?: ProblemState;
  guidance?: string;
  unblockedStepIds?: string[];
}

export interface RepairActionInput extends StrategyCheckInput {
  /** Declared execution intent (preferred — adapter/model supplied, AC-28). */
  intent?: ActionCapability['intent'];
  capability?: ActionCapability;
  /** Resource scope this action touches (for scoped epochs). */
  resourceScope?: string;
  /** Structured investigation intent for VOI (AC-24). */
  investigationIntent?: InvestigationIntent;
  /** Interrupt epoch captured when the action was scheduled (AC-30). */
  capturedInterruptEpoch?: number;
  /** Structured expectation for this action (AC-20). */
  expectation?: ActionExpectation;
}

export class RecoveryOrchestrator {
  public readonly tracker: ProblemTracker;
  public readonly evaluator: ProgressEvaluator;
  public readonly diagnosis: DiagnosisController;
  public readonly strategyGuard: StrategyGuard;
  public readonly investigationGuard: InvestigationGuard;
  private readonly emit: (event: string) => void;

  // Telemetry counters (legacy + AC-22 additions)
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

  // New telemetry (spec §22)
  public materialEvidenceChanges = 0;
  public nonMaterialEvidenceIgnored = 0;
  public readsAfterDiagnosisBeforeRepair = 0;
  public investigationActionsSinceProgress = 0;
  public strategySemanticDuplicatesPrevented = 0;
  public staleParallelActionsCancelled = 0;
  public interruptEpochChanges = 0;
  public nestedProblemsCreated = 0;
  public nestedProblemsResolved = 0;
  public actNowTransitions = 0;
  public verificationContractFailures = 0;
  public verificationContractPasses = 0;

  // Failure-episode telemetry (recovery-control fixes)
  public problemEpisodes = 0;
  public episodeSupersessions = 0;
  public staleHypothesisReopens = 0;
  public investigationDriftBlocks = 0;
  public noDecisionImpactRejections = 0;
  /**
   * Moot-interruption supersessions (never verified repairs). Rare by design:
   * a rate that climbs alongside recovery volume means the runtime is spawning
   * recovery episodes around optional/benign actions instead of real
   * contradictions, and the completion-gate exception is doing the workload.
   */
  public mootProblemSupersessions = 0;

  // Interrupt / instruction epoch (AC-30). Every scheduled action captures it;
  // a mismatch means the action is stale and must be dropped before it runs.
  private interrupt: ExecutionInterruptState = { epoch: 0, reason: 'state_changed' };

  // Material evidence impacts since the last strategy attempt (AC-25).
  private pendingEvidenceImpacts: EvidenceImpact[] = [];
  private lastRepairApplied = false;
  private lastUserInstructionChanged = false;
  private lastCapabilityAvailable = false;
  // Last raw output digest per problem (AC-34): re-observing byte-identical
  // output (same screenshot, same response) is NOT material progress — even
  // when the stored `observed` text is a model explanation rather than raw output.
  private readonly lastRawDigests = new Map<string, string>();

  // Drift window (AC-34): bounded progress window that resets on material progress.
  private static readonly DRIFT_ACTION_WINDOW = 8;
  private static readonly DRIFT_READ_WINDOW = 6;

  constructor(emit: (event: string) => void = () => {}, opts: { repoRoot?: string; statFile?: StatFn } = {}) {
    this.tracker = new ProblemTracker();
    this.evaluator = new ProgressEvaluator();
    this.diagnosis = new DiagnosisController();
    this.strategyGuard = new StrategyGuard();
    // File fingerprinting for the successful-read guard: mtime+size resolves
    // against the locked workspace root (injectable for tests).
    const repoRoot = opts.repoRoot ?? process.cwd();
    this.investigationGuard = new InvestigationGuard({
      statFile:
        opts.statFile ??
        ((file) => {
          try {
            const s = statSync(path.resolve(repoRoot, file));
            return { mtimeMs: Math.round(s.mtimeMs), size: s.size };
          } catch {
            return undefined;
          }
        }),
    });
    this.emit = emit;
  }

  hasActiveProblem(): boolean {
    return this.tracker.hasActiveProblem();
  }

  getActiveProblem(): ProblemState | undefined {
    return this.tracker.getActiveProblem();
  }

  /**
   * Retire legacy episodes that were opened around an Agent Gitu protocol or
   * capability-registration failure. Those failures never observed the target
   * application, so no application repair can satisfy their verification
   * contract. Keeping them active creates an unrecoverable state-machine loop.
   */
  dismissInternalProtocolProblem(ledger: TaskLedger, trigger = 'supported action selected'): ProblemState | undefined {
    const active = this.getActiveProblem();
    if (!active) return undefined;
    const text = [active.goal, active.expected, active.observed, active.repairTarget?.description]
      .filter(Boolean)
      .join('\n');
    const internalProtocolFailure =
      /Unknown tool(?::|\s+["'])|not a registered Agent Gitu tool|invalid tool params|registered tool schema|repair_recovery_(?:state|metadata)|(?:browser|Chromium) (?:adapter|action runtime).{0,80}not registered/i.test(
        text,
      );
    if (!internalProtocolFailure) return undefined;

    const dismissed = this.tracker.supersedeProblem(
      active.id,
      `Internal protocol/capability episode retired after ${trigger}; it never represented an application contradiction.`,
    );
    if (!dismissed) return undefined;
    this.mootProblemSupersessions += 1;
    for (const stepId of dismissed.blockedStepIds) {
      const stillBlocked = this.tracker.getUnresolvedProblems().some((problem) => problem.blockedStepIds.includes(stepId));
      const step = ledger.step(stepId);
      if (!stillBlocked && step?.status === 'blocked') ledger.updateStep(stepId, { status: 'in_progress' });
    }
    this.emit(`problem ${active.id} retired — internal protocol failure cannot block application work`);
    return dismissed;
  }

  // ── Interrupt epoch (AC-30) ───────────────────────────────────────────────

  getInterruptEpoch(): number {
    return this.interrupt.epoch;
  }

  getInterruptState(): ExecutionInterruptState {
    return { ...this.interrupt };
  }

  /** True preemption: bump the epoch so stale queued work is dropped. */
  notifyInterrupt(reason: InterruptReason): number {
    this.interrupt = { epoch: this.interrupt.epoch + 1, reason };
    this.interruptEpochChanges += 1;
    this.lastUserInstructionChanged = reason === 'user_message' || reason === 'authority_changed';
    this.emit(`interrupt epoch ${this.interrupt.epoch} — ${reason}: stale queued actions invalidated`);
    return this.interrupt.epoch;
  }

  /** Whether a scheduled action is stale (captured epoch ≠ current). */
  isActionStale(capturedEpoch?: number): boolean {
    if (capturedEpoch === undefined) return false;
    return capturedEpoch !== this.interrupt.epoch;
  }

  /**
   * Supersede interruptions whose blocked work all completed through its own
   * verification. A problem that blocks only finished steps (and no open
   * criteria) is moot: the mission demonstrably moved past the interruption.
   * This is NOT a verified repair (no successfulRecoveries credit) — it only
   * stops a stale interruption from gating completion forever. Problems with
   * no blocked steps, or ones still blocking open criteria, are never moot.
   */
  supersedeMootProblems(doneStepIds: Set<string>, openCriterionIds: Set<string>): ProblemState[] {
    const superseded: ProblemState[] = [];
    for (const problem of this.tracker.getUnresolvedProblems()) {
      if (problem.blockedStepIds.length === 0) continue;
      if (!problem.blockedStepIds.every((id) => doneStepIds.has(id))) continue;
      if ((problem.blockedCriterionIds ?? []).some((id) => openCriterionIds.has(id))) continue;
      const done = this.tracker.supersedeProblem(
        problem.id,
        `Blocked step(s) [${problem.blockedStepIds.join(', ')}] completed via their own verification; interruption superseded (not a verified repair).`,
      );
      if (done) {
        superseded.push(done);
        this.nestedProblemsResolved += 1;
        this.mootProblemSupersessions += 1;
        this.emit(`problem The work this interruption was blocking finished under its own verification — closing it as moot rather than as a proven fix.`);
      }
    }
    return superseded;
  }

  // ── Material evidence (AC-25) ─────────────────────────────────────────────

  recordEvidenceImpact(impact: EvidenceImpact): void {
    this.pendingEvidenceImpacts.push(impact);
    if (impact.material) {
      this.materialEvidenceChanges += 1;
      const active = this.getActiveProblem();
      if (active) this.tracker.noteMaterialProgress(active, `material evidence: ${impact.evidenceId}`);
    } else {
      this.nonMaterialEvidenceIgnored += 1;
    }
  }

  noteCapabilityAvailable(): void {
    this.lastCapabilityAvailable = true;
  }

  private consumeUnlockContext(active: ProblemState): StrategyUnlockContext {
    const ctx: StrategyUnlockContext = {
      evidenceImpacts: [...this.pendingEvidenceImpacts],
      relevantStateEpochs: this.strategyGuard.getResourceEpochs(),
      hypothesisChanged: false,
      repairApplied: this.lastRepairApplied,
      userInstructionChanged: this.lastUserInstructionChanged,
      capabilityAvailable: this.lastCapabilityAvailable,
    };
    this.pendingEvidenceImpacts = [];
    this.lastRepairApplied = false;
    this.lastUserInstructionChanged = false;
    this.lastCapabilityAvailable = false;
    void active;
    return ctx;
  }

  // ── ACT_NOW lifecycle (AC: proposal → decision → act) ─────────────────────

  /** Submit a repair proposal; transitions to ACT_NOW when decision-sufficient. */
  proposeRepair(proposal: RepairProposal, opts: { approved?: boolean; hasCapability?: boolean } = {}): { actNow: boolean; reason: string } {
    const active = this.getActiveProblem();
    if (!active) return { actNow: false, reason: 'No active problem.' };
    if (!proposal.target || proposal.target.kind === 'unknown') {
      return { actNow: false, reason: 'Repair target is unknown — gather decision-changing evidence first. Source must not be mutated.' };
    }
    this.tracker.setRepairProposal(proposal);
    const decision = this.diagnosis.evaluateProposal(active, proposal, opts);
    this.tracker.setDiagnosis(decision);
    if (decision.nextMode === 'act_now') {
      this.actNowTransitions += 1;
      this.emit(`problem ${narration.actNow(proposal.target.kind, proposal.intendedEffect, active.id)}`);
      return { actNow: true, reason: `ACT_NOW: repair ${proposal.target.kind} — ${proposal.intendedEffect}` };
    }
    return { actNow: false, reason: decision.unresolvedQuestions.map((q) => q.question).join('; ') || 'Awaiting decision inputs.' };
  }

  // ── Pre-action checks ─────────────────────────────────────────────────────

  checkPreAction(action: RepairActionInput, evidenceCount: number): PreActionCheckResult {
    // 0. Stale-action preemption (AC-30/AC-31): never run work scheduled
    // before a user interrupt, blocker, authority change, or state transition.
    if (action.capturedInterruptEpoch !== undefined && this.isActionStale(action.capturedInterruptEpoch)) {
      this.staleParallelActionsCancelled += 1;
      this.emit('stale action cancelled — interrupt epoch advanced since scheduling');
      return {
        allowed: false,
        stale: true,
        reason: `STALE ACTION CANCELLED: scheduled at interrupt epoch ${action.capturedInterruptEpoch} but current is ${this.interrupt.epoch}. Reassess the current goal/problem before scheduling follow-up work.`,
      };
    }

    const active = this.getActiveProblem();
    if (!active) return { allowed: true };

    const command = action.tool === 'run_command' ? String(action.params?.['command'] ?? '').trim() : '';
    if (command && isManufacturedEvidenceCommand(command)) {
      this.nonMaterialEvidenceIgnored += 1;
      this.tracker.noteImmaterialAction(active, false);
      return {
        allowed: false,
        reason:
          `INVALID RECOVERY PROOF: "${command}" only manufactures the output it claims to verify. ` +
          'It cannot repair or resolve a recovery incident. Run the original application check, a real test, or a falsifiable state probe instead.',
      };
    }

    const isRepairAction = this.isRepairAction(action, active);
    const isRead = this.isReadTool(action.tool);

    // Semantic successful-read guard: a read whose answer is already in hand
    // for THIS failure episode (unchanged file version, covered lines, same
    // question) never executes — the cached observation comes back instead.
    // The LoopDetector cannot catch this class: every repeated read succeeds.
    if (isRead) {
      const readVerdict = this.investigationGuard.check(
        action.tool,
        action.params ?? {},
        (action as { reason?: string }).reason,
        active.id,
        action.investigationIntent,
      );
      if (!readVerdict.allowed) {
        this.redundantReadsPrevented += 1;
        this.emit(`note ${narration.duplicateInvestigationPrevented()}`);
        return {
          allowed: false,
          reason: readVerdict.cachedObservation ? `${readVerdict.reason}\n\n${readVerdict.cachedObservation}` : readVerdict.reason,
        };
      }
    }

    // Drift control (AC-34): bounded progress window, resets on material progress.
    const sinceProgress = active.actionsSinceMaterialProgress ?? 0;
    const readsSince = active.readsSinceMaterialProgress ?? 0;
    if (active.status === 'investigating' || active.status === 'observed') {
      this.investigationActionsBeforeDiagnosis += 1;
      this.consecutiveInvestigationCount += 1;
      // Drift accounting: every investigation without material progress grows
      // the bounded window (resets on hypothesis change, repair, state change).
      this.tracker.noteImmaterialAction(active, isRead);
      this.investigationActionsSinceProgress = (active.actionsSinceMaterialProgress ?? 0);
      if (active.hypotheses.length === 0 && this.consecutiveInvestigationCount >= 4) {
        return {
          allowed: false,
          reason:
            'INVESTIGATION LIMIT REACHED: Multiple investigative actions performed without progress. ' +
            'You must now formulate a hypothesis (set_hypothesis) or choose a repair approach rather than continuing indefinite exploration.',
        };
      }
      if (sinceProgress >= RecoveryOrchestrator.DRIFT_ACTION_WINDOW || readsSince >= RecoveryOrchestrator.DRIFT_READ_WINDOW) {
        this.investigationDriftBlocks += 1;
        return {
          allowed: false,
          reason:
            `INVESTIGATION DRIFT: ${sinceProgress} action(s) since material progress with no hypothesis change, repair decision, or state change. ` +
            `Choose exactly one: REPAIR (submit a repair proposal), NEW_HYPOTHESIS (set_hypothesis with a materially different theory), ` +
            `SPECIFIC_DECISION_CHANGING_EVIDENCE (structured intent stating what decision the answer changes), NEEDS_USER, or BLOCKED. ` +
            `Generic reads/searches are suppressed until material progress occurs.`,
        };
      }
    } else if (active.status === 'act_now' || active.status === 'decision_sufficient' || active.status === 'repairing') {
      if (!isRepairAction) {
        this.actionsAfterDiagnosisBeforeRepair += 1;
        if (isRead) this.readsAfterDiagnosisBeforeRepair += 1;
      }
    }

    // 1. Strategy-level loop prevention (material-change gated, AC-25/AC-26).
    const unlockCtx = this.consumeUnlockContext(active);
    void evidenceCount;
    const strategyVerdict = this.strategyGuard.evaluate(
      { tool: action.tool, params: action.params, reason: (action as { reason?: string }).reason, expected: (action as { expected?: string }).expected },
      active,
      unlockCtx,
    );
    if (!strategyVerdict.allowed) {
      this.strategyRepeatsPrevented += 1;
      if (strategyVerdict.semanticDuplicate) this.strategySemanticDuplicatesPrevented += 1;
      this.emit(`note ${narration.strategyRepeatPrevented()}`);
      return { allowed: false, reason: strategyVerdict.reason };
    }

    // 2. Value-of-information & ACT_NOW enforcement (AC-24).
    const voiVerdict = this.diagnosis.checkValueOflnformation(
      { tool: action.tool, params: action.params, reason: (action as { reason?: string }).reason, intent: action.investigationIntent },
      active,
    );
    if (!voiVerdict.allowed) {
      this.redundantReadsPrevented += 1;
      this.redundantInvestigationsPrevented += 1;
      if (voiVerdict.reason?.startsWith('NO_DECISION_IMPACT')) this.noDecisionImpactRejections += 1;
      this.emit(`note ${narration.decisionSufficientReadSuppressed()}`);
      return { allowed: false, reason: voiVerdict.reason };
    }

    return { allowed: true };
  }

  /** Validate a parallel batch: drop siblings stale after a blocker (AC-31). */
  filterParallelBatch(actions: RepairActionInput[]): { runnable: RepairActionInput[]; cancelled: RepairActionInput[] } {
    const runnable: RepairActionInput[] = [];
    const cancelled: RepairActionInput[] = [];
    for (const a of actions) {
      if (a.capturedInterruptEpoch !== undefined && this.isActionStale(a.capturedInterruptEpoch)) {
        cancelled.push(a);
        this.staleParallelActionsCancelled += 1;
      } else {
        runnable.push(a);
      }
    }
    if (cancelled.length > 0) {
      this.emit(`parallel batch pruned — ${cancelled.length} stale action(s) cancelled after blocker/interrupt`);
    }
    return { runnable, cancelled };
  }

  // ── Post-action outcomes ──────────────────────────────────────────────────

  onActionOutcome(input: ActionOutcomeInput, ledger: TaskLedger): PostActionOutcomeResult {
    // Schema/registry failures happen before a tool can observe the project.
    // They are protocol failures, not application contradictions. Keeping this
    // guard here (rather than only in Gitu's main loop) protects every caller
    // of the recovery runtime from creating a fake nested problem around an
    // invented recovery API such as `repair_recovery_state`.
    if (
      input.errorSignature === 'unknown-tool' ||
      input.errorSignature === 'invalid-tool-params' ||
      input.errorSignature === 'browser-unavailable' ||
      input.errorSignature === 'skill-requirements-unmet' ||
      input.errorSignature === 'unknown-skill' ||
      input.errorSignature === 'skills-unavailable' ||
      input.errorSignature === 'background-command-unavailable'
    ) {
      this.dismissInternalProtocolProblem(ledger, 'a protocol error was rejected at the runtime boundary');
      return {
        evaluation: {
          verdict: 'neutral',
          isBlocking: false,
          explanation: 'Malformed/unknown action rejected before problem recovery evaluation.',
        },
        interrupted: false,
        resolved: false,
        problem: this.getActiveProblem(),
      };
    }

    const active = this.getActiveProblem();
    const evaluation = this.evaluator.evaluate(input, active);

    // Successful-read ledger for the episode guard: record what this read
    // answered so a later semantically identical read is answered from cache.
    if (input.toolOk && this.isReadTool(input.tool)) {
      this.investigationGuard.record(
        input.tool,
        (input.params ?? {}) as Record<string, unknown>,
        input.reason,
        active?.id ?? 'none',
        input.output || '',
      );
    }
    // Any successful mutation invalidates the recorded answers for the files
    // it touched — the mtime fingerprint would catch it too, but evicting
    // keeps the entry list honest.
    if (input.toolOk && (input.tool === 'write_file' || input.tool === 'apply_edit')) {
      const params = (input.params ?? {}) as Record<string, unknown>;
      const file = String(params['path'] ?? params['file'] ?? '');
      if (file) this.investigationGuard.invalidateFile(file);
    }

    // Track evidence materiality: re-observing byte-identical raw output (same
    // screenshot, same response, same error with a new timestamp stripped by
    // the digest) is NOT material progress.
    if (active) {
      const digest = digestObservation(input.output || '');
      const lastRaw = this.lastRawDigests.get(active.id);
      const isDuplicate = lastRaw !== undefined && lastRaw === digest && input.toolOk;
      if (isDuplicate && evaluation.verdict !== 'expected_achieved') {
        this.nonMaterialEvidenceIgnored += 1;
        this.tracker.noteImmaterialAction(active, this.isReadTool(input.tool));
      }
      this.lastRawDigests.set(active.id, digest);
    }

    // Case 1: Verification succeeded on active problem — CONTRACT-GATED or an
    // explicit model semantic verdict. Legacy text-overlap 'expected_achieved'
    // (incidental vocabulary overlap in a diagnostic's output) must NEVER
    // resolve an episode.
    if (active && evaluation.verdict === 'expected_achieved' && evaluation.resolvesActiveProblem === true) {
      this.verificationContractPasses += 1;
      const resolution = this.tracker.resolveActiveProblem();
      this.successfulRecoveries += 1;
      this.resumedMissions += 1;
      this.emit(`resolved ${narration.problemResolved(active.id)}`);

      for (const stepId of resolution.unblockedStepIds) {
        const step = ledger.step(stepId);
        if (step && (step.status === 'blocked' || step.status === 'in_progress')) {
          ledger.updateStep(stepId, { status: 'in_progress' });
          this.emit(`step     ${stepId} resumed from problem recovery`);
        }
      }
      if (resolution.resumedParent) {
        this.nestedProblemsResolved += 1;
        this.emit(`problem resumed — parent ${resolution.resumedParent.id} active after child ${active.id} resolved`);
      }

      return {
        evaluation,
        interrupted: false,
        resolved: true,
        problem: resolution.problem,
        unblockedStepIds: resolution.unblockedStepIds,
        guidance:
          `✓ PROBLEM RESOLVED (${active.id}): Original contradiction verified resolved.\n` +
          `Suspended mission step(s) [${resolution.unblockedStepIds.join(', ')}] have resumed. Continue with the original mission plan.` +
          (resolution.resumedParent ? `\nResumed parent problem ${resolution.resumedParent.id} — continue its recovery.` : ''),
      };
    }

    // Case 2: Repair action applied — advance relevant scoped epoch, transition to verifying.
    if (active && this.isRepairOutcome(input, active)) {
      if (input.toolOk) {
        this.repairAttempts += 1;
        this.lastRepairApplied = true;
        const scope = this.repairScopeFor(input, active);
        if (scope) this.strategyGuard.advanceResourceEpoch(scope);
        else this.strategyGuard.advanceEpoch(`repair:${input.tool}`);
        this.tracker.transitionStatus('verifying');
        this.tracker.recordAttempt({
          hypothesisId: active.activeHypothesisId,
          strategyFingerprint: digestObservation(`${input.tool}:${(input.output || '').slice(0, 120)}`),
          intendedEffect: input.expected || input.reason || input.tool,
          actionSummary: `${input.tool}: repair applied`,
          outcome: 'pending',
          observedState: (input.output || '').slice(0, 300),
          stateEpoch: this.strategyGuard.getEpoch(),
          resourceEpochs: this.strategyGuard.getResourceEpochs(),
          material: true,
        });
        this.tracker.noteMaterialProgress(active, `repair executed via ${input.tool}`);
        this.emit(`problem ${narration.repairApplied()}`);
      }
    } else if (active && (active.status === 'verifying' || active.status === 'repairing' || active.status === 'act_now')) {
      this.verificationActions += 1;
      if (evaluation.verdict === 'contradiction' || evaluation.verdict === 'blocker') {
        this.verificationContractFailures += 1;
      }
    }

    // Case 3: Contradiction / Blocker detected (nested when distinct; superseded
    // when a repair moved the failure surface; reopened when an old one returns).
    if (evaluation.detectedContradiction && evaluation.isBlocking) {
      const c = evaluation.detectedContradiction;
      const wasNested = active !== undefined && active.fingerprint !== c.fingerprint && active.status !== 'resolved' && active.status !== 'superseded';
      const wasRepairingOrVerifying =
        active !== undefined && (active.status === 'repairing' || active.status === 'verifying' || active.status === 'act_now' || active.status === 'decision_sufficient');
      const reopenCandidate = normalizeFailureSignature(input.command ?? '', c.expected ?? '', c.observed);
      const problem = this.tracker.recordContradiction({
        goal: ledger.data.goal,
        expected: c.expected,
        ...(c.expectation ? { expectation: c.expectation } : {}),
        observed: c.observed,
        fingerprint: c.fingerprint,
        ...(input.command !== undefined ? { command: input.command } : {}),
        ...(c.likelySurface ? { likelySurface: c.likelySurface } : {}),
        ...(c.likelyTarget ? { likelyTarget: c.likelyTarget } : {}),
        stepId: input.stepId,
      });
      // Episode identity, not raw fingerprint: a same-episode signature match
      // (assertion counts drifted) is the SAME failure again, not a new one.
      const isNew = !active || problem.id !== active.id;
      // Seed raw-output tracking for the (possibly newly created) problem so
      // immediate re-observation of identical output counts as duplicate.
      this.lastRawDigests.set(problem.id, digestObservation(input.output || ''));

      if (isNew) {
        this.problemsDetected += 1;
        this.planInterruptions += 1;
        this.problemEpisodes += 1;
        // A blocker discovered mid-batch invalidates stale parallel follow-ups.
        this.notifyInterrupt('problem_detected');
        if (wasRepairingOrVerifying && active && active.status === 'superseded') {
          this.episodeSupersessions += 1;
          this.emit(`problem ${narration.episodeSuperseded(active.expected ?? active.expectation?.description, c.observed, problem.id)}`);
        } else if (problem.reopenedFromProblemId || (this.tracker.getClosedProblems().some((p) => p.failureSignature === reopenCandidate && p.id !== problem.id))) {
          this.staleHypothesisReopens += 1;
          this.emit(`problem ${narration.episodeReopened(c.observed, problem.id)}`);
        } else if (wasNested && active && active.status !== 'superseded') {
          this.nestedProblemsCreated += 1;
          this.emit(`problem ${narration.nestedProblemDetected(c.observed, problem.id)}`);
        } else {
          this.emit(`problem ${narration.problemDetected(c.observed, problem.id)}`);
        }

        if (input.stepId) {
          const step = ledger.step(input.stepId);
          if (step && step.status !== 'done') {
            ledger.updateStep(input.stepId, { status: 'blocked' });
            this.emit(`step     ${input.stepId} suspended due to active problem ${problem.id}`);
          }
        }
      } else {
        this.recoveryAttempts += 1;
        this.failedRecoveries += 1;
        if (problem.activeHypothesisId) {
          this.tracker.updateHypothesis(problem.activeHypothesisId, 'rejected', 0.1);
          this.emit(`problem That theory didn't survive the evidence — discarding it and trying the next explanation.`);
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
        resourceEpochs: this.strategyGuard.getResourceEpochs(),
        material: false,
      });
      this.strategyGuard.markOutcome(evaluation.detectedContradiction.fingerprint, true);

      const targetLine =
        problem.repairTarget && problem.repairTarget.kind !== 'unknown'
          ? `  Repair target: ${problem.repairTarget.kind} — ${problem.repairTarget.description}\n`
          : `  Repair target: unknown — do NOT mutate source until evidence identifies a controllable target.\n`;
      const guidance =
        `\n⚠️ PROBLEM RECOVERY ACTIVE (${problem.id}):\n` +
        `  Contradiction: Expected "${evaluation.detectedContradiction.expected}" but observed "${evaluation.detectedContradiction.observed}".\n` +
        `  Status: ${problem.status}` +
        (wasNested && active ? ` (nested child of ${active.id} — parent preserved, resolve this child first)\n` : '\n') +
        targetLine +
        (input.stepId ? `  Suspended step: ${input.stepId}\n` : '') +
        `  Required lifecycle:\n` +
        `  1. Formulate a root-cause hypothesis (set_hypothesis) if not already set.\n` +
        `  2. Conduct MINIMUM necessary investigation to verify (only decision-changing evidence).\n` +
        `  3. Submit a repair proposal; on ACT_NOW, repair immediately when authorized (approval still required for gated writes).\n` +
        `  4. Re-verify the ORIGINAL contradiction (positive proof) before resuming the plan.`;

      return { evaluation, interrupted: true, resolved: false, problem, guidance };
    }

    return { evaluation, interrupted: false, resolved: false, problem: active };
  }

  onSetHypothesis(text: string, surfaceOrTarget?: RepairSurface | RepairTarget | string, confidence?: number): void {
    const active = this.getActiveProblem();
    if (!active) return;
    this.hypothesesTested += 1;
    this.strategyChanges += 1;
    this.consecutiveInvestigationCount = 0;
    const prevDigest = active.hypotheses.find((h) => h.id === active.activeHypothesisId)?.semanticDigest;
    const hyp = this.tracker.addHypothesis(text, surfaceOrTarget, confidence);
    if (!hyp) return;

    const diag = this.diagnosis.evaluate(active);
    this.tracker.setDiagnosis(diag);

    // A materially changed hypothesis unlocks semantically-blocked strategies.
    if (prevDigest && hyp.semanticDigest !== prevDigest) {
      this.pendingEvidenceImpacts.push({
        evidenceId: `hypothesis:${hyp.id}`,
        changedHypothesis: true,
        changedRelevantState: false,
        changedRepairDecision: false,
        changedExpectedOutcome: false,
        material: true,
      });
      this.materialEvidenceChanges += 1;
    }

    if (diag.nextMode === 'act_now') {
      this.actNowTransitions += 1;
      this.emit(`problem ${narration.actNow(diag.repairProposal?.target.kind ?? diag.repairTarget, diag.repairProposal?.intendedEffect, active.id)}`);
    } else if (diag.repairKnown) {
      this.emit(`problem ${narration.rootCauseIdentified(diag.repairTarget ?? active.repairTarget?.kind, active.id)}`);
    } else {
      this.emit(`hypothesis ${narration.hypothesisRecorded(text, active.id)}`);
    }
  }

  shouldEscalateEffort(): boolean {
    const active = this.getActiveProblem();
    if (!active) return false;
    return active.attempts.length >= 2 || active.hypotheses.filter((h) => h.status === 'rejected').length >= 2;
  }

  /** Telemetry snapshot for run reports. */
  telemetrySnapshot(): Record<string, number> {
    return {
      problemsDetected: this.problemsDetected,
      planInterruptions: this.planInterruptions,
      hypothesesTested: this.hypothesesTested,
      recoveryAttempts: this.recoveryAttempts,
      strategyRepeatsPrevented: this.strategyRepeatsPrevented,
      redundantInvestigationsPrevented: this.redundantInvestigationsPrevented,
      successfulRecoveries: this.successfulRecoveries,
      failedRecoveries: this.failedRecoveries,
      resumedMissions: this.resumedMissions,
      investigationActionsBeforeDiagnosis: this.investigationActionsBeforeDiagnosis,
      actionsAfterDiagnosisBeforeRepair: this.actionsAfterDiagnosisBeforeRepair,
      redundantReadsPrevented: this.redundantReadsPrevented,
      strategyChanges: this.strategyChanges,
      repairAttempts: this.repairAttempts,
      verificationActions: this.verificationActions,
      materialEvidenceChanges: this.materialEvidenceChanges,
      nonMaterialEvidenceIgnored: this.nonMaterialEvidenceIgnored,
      actionsAfterDiagnosisBeforeRepairDup: this.actionsAfterDiagnosisBeforeRepair,
      readsAfterDiagnosisBeforeRepair: this.readsAfterDiagnosisBeforeRepair,
      investigationActionsSinceProgress: this.investigationActionsSinceProgress,
      strategySemanticDuplicatesPrevented: this.strategySemanticDuplicatesPrevented,
      staleParallelActionsCancelled: this.staleParallelActionsCancelled,
      interruptEpochChanges: this.interruptEpochChanges,
      nestedProblemsCreated: this.nestedProblemsCreated,
      nestedProblemsResolved: this.nestedProblemsResolved,
      actNowTransitions: this.actNowTransitions,
      verificationContractFailures: this.verificationContractFailures,
      verificationContractPasses: this.verificationContractPasses,
      problemEpisodes: this.problemEpisodes,
      episodeSupersessions: this.episodeSupersessions,
      staleHypothesisReopens: this.staleHypothesisReopens,
      investigationDriftBlocks: this.investigationDriftBlocks,
      noDecisionImpactRejections: this.noDecisionImpactRejections,
      mootProblemSupersessions: this.mootProblemSupersessions,
      semanticDuplicateReadsPrevented: this.investigationGuard.semanticDuplicateReadsPrevented,
      cachedObservationHits: this.investigationGuard.cachedObservationHits,
    };
  }

  renderPromptSection(): string {
    const active = this.getActiveProblem();
    if (!active || active.status === 'resolved' || active.status === 'superseded') return '';

    const target = active.repairProposal?.target ?? active.repairTarget ?? UNKNOWN_REPAIR_TARGET;
    const targetLine =
      target.kind !== 'unknown'
        ? `  Repair Target: ${target.kind}${target.resourceId ? ` (${target.resourceId})` : ''} — ${target.description}`
        : '  Repair Target: unknown — do NOT mutate source until evidence identifies a controllable target';

    // Episode history: only CLOSED episodes render here, one line each, so the
    // model sees what was already disproven/moved past without resurrecting it
    // as a candidate for current investigation.
    const closed = this.tracker
      .getClosedProblems()
      .slice(-4)
      .map((p) => (p.status === 'resolved' ? `RESOLVED: ${p.expected ?? p.goal}` : `SUPERSEDED: ${p.expected ?? p.goal} (failure surface moved on — do NOT resume its hypotheses)`));

    const lines: string[] = [
      `ACTIVE PROBLEM RECOVERY (${active.id}):`,
      `  Contradiction: Expected "${active.expectation?.description ?? active.expected ?? 'Success'}" vs Observed "${active.observed.slice(0, 200)}"`,
      `  Status: ${active.status.toUpperCase()}`,
      targetLine,
      ...(active.reopenHistoryLine ? [`  History: ${active.reopenHistoryLine}`] : []),
      ...(active.repairSurface ? [`  Legacy Surface Hint (telemetry only): ${active.repairSurface}`] : []),
      ...(active.parentProblemId ? [`  Nested Child Of: ${active.parentProblemId} (resolve this child, then resume parent)`] : []),
      ...(active.blocksProblemIds?.length ? [`  Blocks: ${active.blocksProblemIds.join(', ')}`] : []),
      active.blockedStepIds.length ? `  Suspended Mission Step(s): ${active.blockedStepIds.join(', ')}` : '',
      active.activeHypothesisId
        ? `  Active Hypothesis: [${active.activeHypothesisId}] ${active.hypotheses.find((h) => h.id === active.activeHypothesisId)?.statement}`
        : '  Active Hypothesis: (none — use set_hypothesis to state why this contradiction occurred)',
      ...(active.hypotheses.some((h) => h.status === 'rejected' || h.status === 'superseded' || h.status === 'contradicted')
        ? [`  Retired Hypotheses (do NOT re-investigate unless NEW contradictory evidence reopens them): ${active.hypotheses
            .filter((h) => h.status === 'rejected' || h.status === 'superseded' || h.status === 'contradicted')
            .map((h) => `[${h.id}:${h.status}]`)
            .join(', ')}`]
        : []),
      ...(closed.length ? [`  Episode History: ${closed.join(' | ')}`] : []),
      ...(active.diagnosis?.unresolvedQuestions?.length
        ? [`  Open Decision Questions: ${active.diagnosis.unresolvedQuestions.map((q: DecisionQuestion) => q.question).join(' | ')}`]
        : []),
      active.status === 'act_now'
        ? '  DIRECTIVE: ACT_NOW — decision sufficient. Execute the repair IMMEDIATELY when authorized (approval still required for gated writes). Generic exploration is suppressed; only repair, exact read-before-edit, prerequisite resolution, approval, or user-data requests are allowed.'
        : active.status === 'repairing'
        ? '  DIRECTIVE: Root cause identified. Investigation is complete. Apply the fix directly to the repair target.'
        : active.status === 'verifying'
        ? '  DIRECTIVE: Repair applied. Now run the probe that reproduces the ORIGINAL contradiction to verify the fix (positive proof required).'
        : active.status === 'decision_sufficient'
        ? '  DIRECTIVE: Decision sufficient — submit the repair proposal to enter ACT_NOW.'
        : '  DIRECTIVE: Formulate a hypothesis and investigate ONLY decision-changing evidence (state what decision each read changes).',
      `  NEXT ALLOWED CLASS: ${
        active.status === 'act_now' || active.status === 'repairing'
          ? 'repair (apply_edit / write_file / decided repair action)'
          : active.status === 'verifying'
            ? 'verification (re-run the original failing check)'
            : active.status === 'decision_sufficient'
              ? 'repair proposal (propose_repair), then repair'
              : active.status === 'needs_user' || active.status === 'blocked'
                ? 'user input or blocker resolution'
                : 'investigate (decision-changing evidence only)'
      } — further exploratory reads of unchanged sources are refused by the runtime.`,
    ].filter(Boolean);

    return lines.join('\n');
  }

  // ── Generalized repair detection (AC-28) ──────────────────────────────────
  // A repair is identified by declared intent/capability metadata — ANY
  // adapter/tool may participate without core tool-name conditionals.

  private isRepairAction(action: RepairActionInput, _active: ProblemState): boolean {
    const cap = action.capability;
    const capIntent: string | undefined = cap?.intent;
    if (capIntent === 'repair' || cap?.repairIntent === true) return true;
    const declaredIntent: string | undefined = action.intent;
    if (declaredIntent === 'repair') return true;
    // Legacy fallback for built-in tools (kept for backward compatibility;
    // generic adapters use intent metadata above and need no core changes).
    return action.tool === 'write_file' || action.tool === 'apply_edit' || action.tool === 'connection_operation';
  }

  private isRepairOutcome(input: ActionOutcomeInput, active: ProblemState): boolean {
    const command = input.tool === 'run_command'
      ? String((input.params as Record<string, unknown> | undefined)?.['command'] ?? input.command ?? '').trim()
      : '';
    if (command && isManufacturedEvidenceCommand(command)) return false;
    const extended = input as ActionOutcomeInput & { intent?: ActionCapability['intent']; capability?: ActionCapability; resourceScope?: string };
    if (extended.capability?.intent === 'repair' || extended.capability?.repairIntent === true) return true;
    if (extended.intent === 'repair') return true;
    if (extended.capability?.mutatesState === true && input.toolOk) {
      // A successful state mutation during act_now/repairing counts as a repair attempt.
      if (active.status === 'act_now' || active.status === 'repairing' || active.status === 'decision_sufficient') return true;
    }
    return input.tool === 'write_file' || input.tool === 'apply_edit' || input.tool === 'connection_operation';
  }

  private repairScopeFor(input: ActionOutcomeInput, active: ProblemState): string | undefined {
    const extended = input as ActionOutcomeInput & { resourceScope?: string; capability?: ActionCapability };
    if (extended.resourceScope) return extended.resourceScope;
    if (extended.capability?.resourceScope) return extended.capability.resourceScope;
    const params = (input.params ?? {}) as Record<string, unknown>;
    const explicit = params['resourceScope'] ?? params['resourceId'] ?? params['connectionId'];
    if (typeof explicit === 'string' && explicit) return explicit;
    const path = params['path'] ?? params['file'];
    if (typeof path === 'string' && path) return `workspace:${path}`;
    if (active.repairTarget && active.repairTarget.kind !== 'unknown') {
      return active.repairTarget.resourceId ?? active.repairTarget.kind;
    }
    return undefined;
  }

  private isReadTool(tool: string): boolean {
    return (
      tool === 'read_file' ||
      tool === 'search' ||
      tool === 'search_files' ||
      tool === 'list_dir' ||
      tool === 'list_files' ||
      tool === 'grep_search' ||
      tool === 'find_by_name' ||
      tool === 'browse' ||
      tool === 'browser'
    );
  }
}

export type { RepairTarget, RepairProposal, VerificationContract };
