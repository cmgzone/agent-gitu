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
import { digestObservation, semanticDigest } from './evidence-utils.js';
import { shortId } from '../util.js';

export interface RecordContradictionInput {
  goal: string;
  expected?: string;
  expectation?: ActionExpectation;
  observed: string;
  fingerprint: string;
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
    return this.problems.get(top);
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
    return active !== undefined && active.status !== 'resolved';
  }

  getAllProblems(): ProblemState[] {
    return Array.from(this.problems.values());
  }

  recordContradiction(input: RecordContradictionInput): ProblemState {
    const now = Date.now();
    // Deduplicate: same fingerprint on an unresolved problem updates it.
    for (const p of this.problems.values()) {
      if (p.fingerprint === input.fingerprint && p.status !== 'resolved') {
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
        p.updatedAt = now;
        this.activate(p.id);
        return p;
      }
    }

    this.problemSeq += 1;
    const id = shortId(`prob-${this.problemSeq}`);
    const active = this.getActiveProblem();
    // Nested recovery: a new distinct contradiction while another problem is
    // active becomes its child — the parent is preserved on the stack.
    const parentProblemId = active && active.status !== 'resolved' ? active.id : undefined;

    const newProblem: ProblemState = {
      id,
      fingerprint: input.fingerprint,
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
      hypotheses: [],
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
    if (parent && parent.status !== 'resolved') {
      parent.blocksProblemIds = (parent.blocksProblemIds ?? []).filter((id) => id !== active.id);
      parent.updatedAt = Date.now();
      resumedParent = parent;
    }
    void unblockedCriteria;
    void UNKNOWN_REPAIR_TARGET;
    return { resolved: true, problem: resolvedProblem, unblockedStepIds, ...(resumedParent ? { resumedParent } : {}) };
  }

  /** Unresolved problems (anything not yet resolved), bottom → top of stack. */
  getUnresolvedProblems(): ProblemState[] {
    return this.getProblemStack().filter((p) => p.status !== 'resolved');
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
    return { ...target };
  }

  /** Resolve a specific (non-top) problem, e.g. a nested child completed out of order. */
  resolveProblem(id: string, evidenceId?: string): { resolved: boolean; problem?: ProblemState; unblockedStepIds: string[] } {
    const target = this.problems.get(id);
    if (!target || target.status === 'resolved') return { resolved: false, unblockedStepIds: [] };
    const wasActive = this.getActiveProblem()?.id === id;
    if (wasActive) return this.resolveActiveProblem(evidenceId);
    target.status = 'resolved';
    if (evidenceId && !target.evidenceIds.includes(evidenceId)) target.evidenceIds.push(evidenceId);
    target.updatedAt = Date.now();
    this.problemStack = this.problemStack.filter((x) => x !== id);
    return { resolved: true, problem: { ...target }, unblockedStepIds: [...target.blockedStepIds] };
  }
}
