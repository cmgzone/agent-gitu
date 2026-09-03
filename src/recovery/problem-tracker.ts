import type {
  DiagnosisDecision,
  Hypothesis,
  HypothesisStatus,
  ProblemState,
  ProblemStatus,
  RecoveryAttempt,
  RepairSurface,
  VerificationContract,
} from './problem-state.js';
import { shortId } from '../util.js';

export interface RecordContradictionInput {
  goal: string;
  expected?: string;
  observed: string;
  fingerprint: string;
  likelySurface?: RepairSurface;
  stepId?: string;
  criterionId?: string;
}

export class ProblemTracker {
  private activeProblemId?: string;
  private readonly problems = new Map<string, ProblemState>();
  private problemSeq = 0;

  getActiveProblem(): ProblemState | undefined {
    if (!this.activeProblemId) return undefined;
    return this.problems.get(this.activeProblemId);
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
    // Check if an existing unresolved problem has this fingerprint
    for (const p of this.problems.values()) {
      if (p.fingerprint === input.fingerprint && p.status !== 'resolved') {
        if (input.stepId && !p.blockedStepIds.includes(input.stepId)) {
          p.blockedStepIds.push(input.stepId);
        }
        if (input.criterionId && (!p.blockedCriterionIds || !p.blockedCriterionIds.includes(input.criterionId))) {
          p.blockedCriterionIds = [...(p.blockedCriterionIds ?? []), input.criterionId];
        }
        p.observed = input.observed;
        p.updatedAt = now;
        this.activeProblemId = p.id;
        return p;
      }
    }

    this.problemSeq += 1;
    const id = shortId(`prob-${this.problemSeq}`);
    const newProblem: ProblemState = {
      id,
      fingerprint: input.fingerprint,
      goal: input.goal,
      expected: input.expected,
      observed: input.observed,
      evidenceIds: [],
      blockedStepIds: input.stepId ? [input.stepId] : [],
      blockedCriterionIds: input.criterionId ? [input.criterionId] : [],
      hypotheses: [],
      attempts: [],
      status: 'investigating',
      repairSurface: input.likelySurface,
      verificationContract: {
        description: `Verify contradiction resolved: ${input.expected ?? 'expected outcome'}`,
        originalObserved: input.observed,
        expectedOutcome: input.expected ?? 'Success',
      },
      createdAt: now,
      updatedAt: now,
    };

    this.problems.set(id, newProblem);
    this.activeProblemId = id;
    return newProblem;
  }

  transitionStatus(status: ProblemStatus): ProblemState | undefined {
    const active = this.getActiveProblem();
    if (!active) return undefined;
    active.status = status;
    active.updatedAt = Date.now();
    return active;
  }

  addHypothesis(statement: string, surface?: RepairSurface, confidence?: number): Hypothesis | undefined {
    const active = this.getActiveProblem();
    if (!active) return undefined;
    const now = Date.now();
    const hypId = `hyp-${active.hypotheses.length + 1}`;
    const hyp: Hypothesis = {
      id: hypId,
      statement,
      confidence: confidence ?? 0.5,
      supportingEvidence: [],
      contradictingEvidence: [],
      status: 'candidate',
      suggestedSurface: surface ?? active.repairSurface,
      createdAt: now,
      updatedAt: now,
    };
    active.hypotheses.push(hyp);
    active.activeHypothesisId = hypId;
    active.updatedAt = now;
    if (surface) {
      active.repairSurface = surface;
    }
    return hyp;
  }

  updateHypothesis(hypothesisId: string, status: HypothesisStatus, confidence?: number): boolean {
    const active = this.getActiveProblem();
    if (!active) return false;
    const hyp = active.hypotheses.find((h) => h.id === hypothesisId);
    if (!hyp) return false;
    hyp.status = status;
    if (confidence !== undefined) hyp.confidence = confidence;
    hyp.updatedAt = Date.now();
    active.updatedAt = Date.now();
    return true;
  }

  recordAttempt(attempt: Omit<RecoveryAttempt, 'id' | 'timestamp'>): RecoveryAttempt | undefined {
    const active = this.getActiveProblem();
    if (!active) return undefined;
    const rec: RecoveryAttempt = {
      id: `att-${active.attempts.length + 1}`,
      timestamp: Date.now(),
      ...attempt,
    };
    active.attempts.push(rec);
    active.updatedAt = Date.now();
    return rec;
  }

  setDiagnosis(decision: DiagnosisDecision): void {
    const active = this.getActiveProblem();
    if (!active) return;
    active.diagnosis = decision;
    if (decision.repairSurface) {
      active.repairSurface = decision.repairSurface;
    }
    if (decision.nextMode === 'repair') {
      active.status = 'repairing';
    }
    active.updatedAt = Date.now();
  }

  setVerificationContract(contract: VerificationContract): void {
    const active = this.getActiveProblem();
    if (!active) return;
    active.verificationContract = contract;
    active.updatedAt = Date.now();
  }

  resolveActiveProblem(evidenceId?: string): { resolved: boolean; problem?: ProblemState; unblockedStepIds: string[] } {
    const active = this.getActiveProblem();
    if (!active) return { resolved: false, unblockedStepIds: [] };
    active.status = 'resolved';
    if (evidenceId && !active.evidenceIds.includes(evidenceId)) {
      active.evidenceIds.push(evidenceId);
    }
    active.updatedAt = Date.now();
    const unblockedStepIds = [...active.blockedStepIds];
    const resolvedProblem = { ...active };
    this.activeProblemId = undefined;
    return { resolved: true, problem: resolvedProblem, unblockedStepIds };
  }
}
