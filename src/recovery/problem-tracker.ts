import type {
  ActionExpectation,
  DiagnosisDecision,
  Hypothesis,
  HypothesisStatus,
  ProblemState,
  ProblemStatus,
  RecoveryAttempt,
  RepairProposal,
  RepairSurface,
  RepairTarget,
  VerificationContract,
} from './problem-state.js';
import { UNKNOWN_REPAIR_TARGET } from './problem-state.js';
import { digestObservation, normalizeFailureSignature, semanticDigest } from './evidence-utils.js';
import { shortId } from '../util.js';

export interface RecordContradictionInput {
  goal: string;
  expected?: string;
  expectation?: ActionExpectation;
  observed: string;
  fingerprint: string;
  /** Command/path that produced the observation (failure-episode identity). */
  command?: string;
  /** Legacy surface hint (telemetry only). Prefer likelyTarget. */
  likelySurface?: RepairSurface;
  /** Open-ended target hint (unknown unless evidence supports it). */
  likelyTarget?: RepairTarget;
  stepId?: string;
  criterionId?: string;
  criterionIds?: string[];
}

/**
 * Problem tracker with nested/dependent recovery (AC-27).
 *
 * A mission may hold a stack of problems: while fixing A, a new blocker B
 * becomes a CHILD of A (parentProblemId). Resolving pops the stack and
 * resumes the parent — the original problem is never lost.
 */
export class ProblemTracker {
  private problemStack: string[] = [];
  private readonly problems = new Map<string, ProblemState>();
  private problemSeq = 0;

  getActiveProblem(): ProblemState | undefined {
    const top = this.problemStack[this.problemStack.length - 1];
    if (!top) return undefined;
    const p = this.problems.get(top);
    if (!p || p.status === 'resolved' || p.status === 'superseded') return undefined;
    return p;
  }

  /** Full nested stack (bottom → top). */
  getProblemStack(): ProblemState[] {
    return this.problemStack.map((id) => this.problems.get(id)!).filter(Boolean);
  }

  getProblem(id: string): ProblemState | undefined {
    return this.problems.get(id);
  }

  hasActiveProblem(): boolean {
    const active = this.getActiveProblem();
    return active !== undefined && active.status !== 'resolved' && active.status !== 'superseded';
  }

  getAllProblems(): ProblemState[] {
    return Array.from(this.problems.values());
  }

  /** Closed episodes (resolved or superseded) — audit history, never active work. */
  getClosedProblems(): ProblemState[] {
    return this.getAllProblems().filter((p) => p.status === 'resolved' || p.status === 'superseded');
  }

  private static isEpisodeOpen(p: ProblemState): boolean {
    return p.status !== 'resolved' && p.status !== 'superseded';
  }

  recordContradiction(input: RecordContradictionInput): ProblemState {
    const now = Date.now();
    const failureSignature = normalizeFailureSignature(input.command ?? '', input.expected ?? input.expectation?.description ?? '', input.observed);

    // 1. Same failure episode (exact fingerprint OR stable signature on an
    //    OPEN problem): update in place — this is the same failure again.
    for (const p of this.problems.values()) {
      const sameEpisode =
        p.fingerprint === input.fingerprint ||
        (p.failureSignature !== undefined && p.failureSignature === failureSignature);
      if (sameEpisode && ProblemTracker.isEpisodeOpen(p)) {
        if (input.stepId && !p.blockedStepIds.includes(input.stepId)) {
          p.blockedStepIds.push(input.stepId);
        }
        const criteria = [...(input.criterionId ? [input.criterionId] : []), ...(input.criterionIds ?? [])];
        for (const c of criteria) {
          if (!p.blockedCriterionIds?.includes(c)) {
            p.blockedCriterionIds = [...(p.blockedCriterionIds ?? []), c];
          }
        }
        p.observed = input.observed;
        p.observationDigest = digestObservation(input.observed);
        if (!p.failureSignature) p.failureSignature = failureSignature;
        p.updatedAt = now;
        this.activate(p.id);
        return p;
      }
    }

    this.problemSeq += 1;
    const id = shortId(`prob-${this.problemSeq}`);
    const active = this.getActiveProblem();

    // 2. Failure-episode supersession: a DIFFERENT failure signature arriving
    //    while a repair was applied (repairing/verifying/act_now/decision_sufficient)
    //    means the failure surface moved on. The old episode is closed as
    //    superseded — its hypotheses must never resurface as candidates — and
    //    the new episode replaces it (no nesting: it is a continuation, not a child).
    let supersededParent: ProblemState | undefined;
    if (active && (active.status === 'repairing' || active.status === 'verifying' || active.status === 'act_now' || active.status === 'decision_sufficient')) {
      supersededParent = this.closeEpisode(active, id, 'repair changed the failure surface — new failure signature observed');
    }

    // 3. Reopen: this signature was seen in a CLOSED episode. The failure came
    //    back. Create a fresh episode referencing the old one; prior hypotheses
    //    carry over marked 'superseded' (reference only — never active candidates).
    const priorEpisode = this.getAllProblems().find((p) => p.failureSignature === failureSignature && !ProblemTracker.isEpisodeOpen(p));

    // 4. Nested recovery: a new distinct contradiction while still DIAGNOSING
    //    another problem becomes its child — the parent is preserved on the stack.
    //    A replacement episode (case 2) inherits the superseded episode's parent:
    //    it occupies the same position in the blocking chain.
    const parentProblemId =
      supersededParent
        ? supersededParent.parentProblemId
        : active && active.status !== 'resolved' && active.status !== 'superseded'
          ? active.id
          : undefined;

    const newProblem: ProblemState = {
      id,
      fingerprint: input.fingerprint,
      failureSignature,
      goal: input.goal,
      expected: input.expected,
      ...(input.expectation ? { expectation: input.expectation } : {}),
      observed: input.observed,
      observationDigest: digestObservation(input.observed),
      evidenceIds: [],
      blockedStepIds: input.stepId ? [input.stepId] : [],
      blockedCriterionIds: [
        ...(input.criterionId ? [input.criterionId] : []),
        ...(input.criterionIds ?? []),
      ],
      ...(priorEpisode ? { reopenedFromProblemId: priorEpisode.id } : {}),
      hypotheses: priorEpisode
        ? priorEpisode.hypotheses.map((h) => ({ ...h, status: 'superseded' as HypothesisStatus, updatedAt: now }))
        : [],
      attempts: [],
      status: 'investigating',
      // Ownership stays UNKNOWN unless the caller supplies evidence-backed target.
      ...(input.likelyTarget && input.likelyTarget.kind !== 'unknown'
        ? { repairTarget: input.likelyTarget }
        : {}),
      ...(input.likelySurface ? { repairSurface: input.likelySurface } : {}),
      verificationContract: {
        description: `Verify contradiction resolved: ${input.expectation?.description ?? input.expected ?? 'expected outcome'}`,
        originalObserved: input.observed,
        expectedOutcome: input.expectation?.description ?? input.expected ?? 'Success',
        ...(input.expectation ? { originalExpectation: input.expectation } : {}),
        originalObservationDigest: digestObservation(input.observed),
        // The command that produced the contradiction: when it later EXITS 0,
        // the original failure is positively gone — this is the verification
        // proof for command-shaped contradictions (fail -> repair -> pass).
        ...(input.command ? { verificationCommand: input.command } : {}),
      },
      ...(parentProblemId ? { parentProblemId } : {}),
      actionsSinceMaterialProgress: 0,
      readsSinceMaterialProgress: 0,
      duplicateEvidenceDigests: [],
      materialProgressEvents: [],
      createdAt: now,
      updatedAt: now,
    };

    this.problems.set(id, newProblem);
    if (priorEpisode) {
      newProblem.reopenHistoryLine = `failure previously seen in episode ${priorEpisode.id} (${priorEpisode.expected ?? priorEpisode.goal}); prior hypotheses are retained below as SUPERSEDED context only`;
    }
    if (parentProblemId) {
      const parent = this.problems.get(parentProblemId);
      if (parent) {
        parent.blocksProblemIds = [...(parent.blocksProblemIds ?? []), id];
        newProblem.blockedByProblemIds = [...(newProblem.blockedByProblemIds ?? []), parentProblemId];
      }
    }
    this.activate(id);
    return newProblem;
  }

  /**
   * Close an episode as superseded: pop it from the stack, retire its
   * hypotheses, and resume the parent it had interrupted (if any). Returns
   * a snapshot of the closed problem.
   */
  private closeEpisode(problem: ProblemState, supersededByProblemId: string, reason: string): ProblemState {
    problem.status = 'superseded';
    problem.supersededByProblemId = supersededByProblemId;
    problem.supersededAt = Date.now();
    for (const h of problem.hypotheses) {
      if (h.status !== 'rejected') h.status = 'superseded';
      h.updatedAt = Date.now();
    }
    problem.updatedAt = Date.now();
    this.problemStack = this.problemStack.filter((x) => x !== problem.id);
    // Unlink from the parent's blocking chain: the replacement episode takes
    // over this slot, so the parent's blocks list must not keep a closed id.
    if (problem.parentProblemId) {
      const parent = this.problems.get(problem.parentProblemId);
      if (parent) {
        parent.blocksProblemIds = (parent.blocksProblemIds ?? []).filter((x) => x !== problem.id);
        parent.updatedAt = Date.now();
      }
    }
    void reason;
    return { ...problem };
  }

  /** Bulk-set hypothesis status (episode retirement / contradiction marking). */
  markHypotheses(problemId: string, status: HypothesisStatus): void {
    const target = this.problems.get(problemId);
    if (!target) return;
    for (const h of target.hypotheses) {
      h.status = status;
      h.updatedAt = Date.now();
    }
    target.updatedAt = Date.now();
  }

  private activate(id: string): void {
    this.problemStack = this.problemStack.filter((x) => x !== id);
    this.problemStack.push(id);
  }

  transitionStatus(status: ProblemStatus, problemId?: string): ProblemState | undefined {
    const target = problemId ? this.problems.get(problemId) : this.getActiveProblem();
    if (!target) return undefined;
    target.status = status;
    target.updatedAt = Date.now();
    return target;
  }

  addHypothesis(statement: string, surfaceOrTarget?: RepairSurface | RepairTarget | string, confidence?: number): Hypothesis | undefined {
    const active = this.getActiveProblem();
    if (!active) return undefined;
    const now = Date.now();
    const hypId = `hyp-${active.hypotheses.length + 1}`;
    let suggestedTarget: RepairTarget | undefined;
    let suggestedSurface: RepairSurface | undefined;
    if (typeof surfaceOrTarget === 'string') {
      // Open target kind string (AC: arbitrary future targets work).
      if (surfaceOrTarget && surfaceOrTarget !== 'unknown') {
        suggestedTarget = { kind: surfaceOrTarget, description: `Hypothesized target: ${surfaceOrTarget}` };
      }
    } else if (surfaceOrTarget && typeof surfaceOrTarget === 'object' && 'kind' in surfaceOrTarget) {
      suggestedTarget = surfaceOrTarget as RepairTarget;
    } else if (surfaceOrTarget) {
      suggestedSurface = surfaceOrTarget as RepairSurface;
    }
    const hyp: Hypothesis = {
      id: hypId,
      statement,
      confidence: confidence ?? 0.5,
      supportingEvidence: [],
      contradictingEvidence: [],
      status: 'candidate',
      ...(suggestedSurface ? { suggestedSurface } : {}),
      ...(suggestedTarget ? { suggestedTarget } : {}),
      semanticDigest: semanticDigest(statement),
      createdAt: now,
      updatedAt: now,
    };
    active.hypotheses.push(hyp);
    active.activeHypothesisId = hypId;
    active.updatedAt = now;
    // Never mutate source ownership on hypothesis alone: only record a
    // proposed target when the hypothesis names one explicitly.
    if (suggestedTarget && suggestedTarget.kind !== 'unknown') {
      active.repairTarget = suggestedTarget;
    } else if (suggestedSurface) {
      active.repairSurface = suggestedSurface;
    }
    this.noteMaterialProgress(active, `hypothesis formulated: ${statement.slice(0, 80)}`);
    return hyp;
  }

  updateHypothesis(hypothesisId: string, status: HypothesisStatus, confidence?: number, problemId?: string): boolean {
    const target = problemId ? this.problems.get(problemId) : this.getActiveProblem();
    if (!target) return false;
    const hyp = target.hypotheses.find((h) => h.id === hypothesisId);
    if (!hyp) return false;
    const changed = hyp.status !== status;
    hyp.status = status;
    if (confidence !== undefined) hyp.confidence = confidence;
    hyp.updatedAt = Date.now();
    target.updatedAt = Date.now();
    if (changed && (status === 'supported' || status === 'rejected')) {
      this.noteMaterialProgress(target, `hypothesis ${status}: ${hyp.statement.slice(0, 80)}`);
    }
    return true;
  }

  attachEvidence(evidenceId: string, evidenceDigest?: string, problemId?: string): void {
    const target = problemId ? this.problems.get(problemId) : this.getActiveProblem();
    if (!target) return;
    if (!target.evidenceIds.includes(evidenceId)) target.evidenceIds.push(evidenceId);
    if (evidenceDigest) {
      if (target.duplicateEvidenceDigests?.includes(evidenceDigest)) {
        // Duplicate observation of identical state: not material progress.
        target.actionsSinceMaterialProgress = (target.actionsSinceMaterialProgress ?? 0) + 1;
      } else {
        target.duplicateEvidenceDigests = [...(target.duplicateEvidenceDigests ?? []), evidenceDigest];
      }
    }
    target.updatedAt = Date.now();
  }

  /** Record material progress (resets the drift window, AC-34). */
  noteMaterialProgress(problem: ProblemState, event: string): void {
    problem.actionsSinceMaterialProgress = 0;
    problem.readsSinceMaterialProgress = 0;
    problem.materialProgressEvents = [...(problem.materialProgressEvents ?? []), event].slice(-20);
    problem.updatedAt = Date.now();
  }

  /** Record a non-material action (advances the drift window). */
  noteImmaterialAction(problem: ProblemState, wasRead: boolean): void {
    problem.actionsSinceMaterialProgress = (problem.actionsSinceMaterialProgress ?? 0) + 1;
    if (wasRead) problem.readsSinceMaterialProgress = (problem.readsSinceMaterialProgress ?? 0) + 1;
    problem.updatedAt = Date.now();
  }

  recordAttempt(attempt: Omit<RecoveryAttempt, 'id' | 'timestamp'>, problemId?: string): RecoveryAttempt | undefined {
    const target = problemId ? this.problems.get(problemId) : this.getActiveProblem();
    if (!target) return undefined;
    const rec: RecoveryAttempt = {
      id: `att-${target.attempts.length + 1}`,
      timestamp: Date.now(),
      ...attempt,
    };
    target.attempts.push(rec);
    target.updatedAt = Date.now();
    return rec;
  }

  setDiagnosis(decision: DiagnosisDecision, problemId?: string): void {
    const target = problemId ? this.problems.get(problemId) : this.getActiveProblem();
    if (!target) return;
    target.diagnosis = decision;
    // Open target preferred; legacy surface mirror for telemetry only.
    if (decision.repairProposal && decision.repairProposal.target.kind !== 'unknown') {
      target.repairTarget = decision.repairProposal.target;
      target.repairProposal = decision.repairProposal;
    } else if (decision.repairTarget && decision.repairTarget !== 'unknown') {
      target.repairTarget = { kind: decision.repairTarget, description: `Diagnosed target: ${decision.repairTarget}` };
    }
    if (decision.repairSurface) {
      target.repairSurface = decision.repairSurface;
    }
    // Explicit ACT_NOW / repair transitions (AC: INVESTIGATING → DECISION_SUFFICIENT → ACT_NOW → REPAIRING → VERIFYING).
    if (decision.nextMode === 'act_now') {
      target.status = 'act_now';
    } else if (decision.nextMode === 'repair') {
      target.status = 'repairing';
    } else if (decision.nextMode === 'verify') {
      target.status = 'verifying';
    } else if (decision.nextMode === 'needs_user') {
      target.status = 'needs_user';
    }
    target.updatedAt = Date.now();
  }

  setRepairProposal(proposal: RepairProposal, problemId?: string): void {
    const target = problemId ? this.problems.get(problemId) : this.getActiveProblem();
    if (!target) return;
    target.repairProposal = proposal;
    if (proposal.target.kind !== 'unknown') {
      target.repairTarget = proposal.target;
    }
    target.updatedAt = Date.now();
  }

  setVerificationContract(contract: VerificationContract, problemId?: string): void {
    const target = problemId ? this.problems.get(problemId) : this.getActiveProblem();
    if (!target) return;
    target.verificationContract = contract;
    target.updatedAt = Date.now();
  }

  resolveActiveProblem(evidenceId?: string): { resolved: boolean; problem?: ProblemState; unblockedStepIds: string[]; resumedParent?: ProblemState } {
    const active = this.getActiveProblem();
    if (!active) return { resolved: false, unblockedStepIds: [] };
    active.status = 'resolved';
    if (evidenceId && !active.evidenceIds.includes(evidenceId)) {
      active.evidenceIds.push(evidenceId);
    }
    active.updatedAt = Date.now();
    const unblockedStepIds = [...active.blockedStepIds];
    const unblockedCriteria = [...(active.blockedCriterionIds ?? [])];
    const resolvedProblem = { ...active };
    // Pop the stack and resume the parent (nested recovery, AC-27).
    this.problemStack = this.problemStack.filter((id) => id !== active.id);
    const parent = active.parentProblemId ? this.problems.get(active.parentProblemId) : undefined;
    let resumedParent: ProblemState | undefined;
    if (parent && parent.status !== 'resolved' && parent.status !== 'superseded') {
      parent.blocksProblemIds = (parent.blocksProblemIds ?? []).filter((id) => id !== active.id);
      parent.updatedAt = Date.now();
      resumedParent = parent;
    }
    void unblockedCriteria;
    void UNKNOWN_REPAIR_TARGET;
    return { resolved: true, problem: resolvedProblem, unblockedStepIds, ...(resumedParent ? { resumedParent } : {}) };
  }

  /** Unresolved problems (open episodes only — superseded never blocks), bottom → top of stack. */
  getUnresolvedProblems(): ProblemState[] {
    return this.getProblemStack().filter((p) => p.status !== 'resolved' && p.status !== 'superseded');
  }

  /**
   * Supersede a problem whose blocked work all completed through its own
   * verification (the interruption is moot — NOT a verified repair).
   * Recorded honestly as an inconclusive attempt so telemetry distinguishes
   * superseded interruptions from verified recoveries.
   */
  supersedeProblem(id: string, reason: string): ProblemState | undefined {
    const target = this.problems.get(id);
    if (!target || target.status === 'resolved') return undefined;
    target.attempts.push({
      id: `att-${target.attempts.length + 1}`,
      timestamp: Date.now(),
      strategyFingerprint: target.fingerprint,
      intendedEffect: 'supersede moot interruption',
      actionSummary: reason.slice(0, 200),
      outcome: 'inconclusive',
      stateEpoch: 0,
    });
    target.status = 'resolved';
    target.updatedAt = Date.now();
    this.problemStack = this.problemStack.filter((x) => x !== id);
    // Supersession is a real graph transition, not merely a stack pop. Unlink
    // the retired episode so a resumed parent cannot remain permanently
    // blocked by an id that no longer exists in the active stack.
    if (target.parentProblemId) {
      const parent = this.problems.get(target.parentProblemId);
      if (parent) {
        parent.blocksProblemIds = (parent.blocksProblemIds ?? []).filter((childId) => childId !== id);
        parent.updatedAt = Date.now();
      }
    }
    for (const childId of target.blocksProblemIds ?? []) {
      const child = this.problems.get(childId);
      if (child) {
        child.blockedByProblemIds = (child.blockedByProblemIds ?? []).filter((parentId) => parentId !== id);
        child.updatedAt = Date.now();
      }
    }
    return { ...target };
  }

  /** Resolve a specific (non-top) problem, e.g. a nested child completed out of order. */
  resolveProblem(id: string, evidenceId?: string): { resolved: boolean; problem?: ProblemState; unblockedStepIds: string[] } {
    const target = this.problems.get(id);
    if (!target || target.status === 'resolved' || target.status === 'superseded') return { resolved: false, unblockedStepIds: [] };
    const wasActive = this.getActiveProblem()?.id === id;
    if (wasActive) return this.resolveActiveProblem(evidenceId);
    target.status = 'resolved';
    if (evidenceId && !target.evidenceIds.includes(evidenceId)) target.evidenceIds.push(evidenceId);
    target.updatedAt = Date.now();
    this.problemStack = this.problemStack.filter((x) => x !== id);
    return { resolved: true, problem: { ...target }, unblockedStepIds: [...target.blockedStepIds] };
  }
}
