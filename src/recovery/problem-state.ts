/**
 * Universal problem-solving runtime state definitions.
 *
 * Provider- and tool-neutral representation of unexpected problems,
 * contradictions, hypotheses, recovery attempts, and repair surfaces.
 */

export type ProblemStatus =
  | 'observed'
  | 'investigating'
  | 'repairing'
  | 'verifying'
  | 'resolved'
  | 'needs_user'
  | 'blocked';

export type RepairSurface =
  | 'repository'
  | 'local_runtime'
  | 'deployment'
  | 'connection'
  | 'database'
  | 'infrastructure'
  | 'configuration'
  | 'external_service'
  | 'user_owned';

export type HypothesisStatus = 'candidate' | 'testing' | 'supported' | 'rejected';

export interface Hypothesis {
  id: string;
  statement: string;
  confidence?: number;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  status: HypothesisStatus;
  suggestedSurface?: RepairSurface;
  createdAt: number;
  updatedAt: number;
}

export type AttemptOutcome = 'pending' | 'success' | 'failed' | 'inconclusive';

export interface RecoveryAttempt {
  id: string;
  hypothesisId?: string;
  strategyFingerprint: string;
  intendedEffect: string;
  actionSummary: string;
  outcome: AttemptOutcome;
  observedState?: string;
  stateEpoch: number;
  timestamp: number;
}

export interface DiagnosisDecision {
  rootCauseKnown: boolean;
  confidence: number;
  repairKnown: boolean;
  repairTarget?: string;
  repairSurface?: RepairSurface;
  missingEvidence?: string[];
  nextMode: 'investigate' | 'repair' | 'verify' | 'ask_user';
}

export interface VerificationContract {
  description: string;
  originalObserved: string;
  expectedOutcome: string;
  verificationCommand?: string;
  verificationTool?: string;
}

export interface ProblemState {
  id: string;
  fingerprint: string;

  goal: string;
  expected?: string;
  observed: string;

  evidenceIds: string[];

  blockedStepIds: string[];
  blockedCriterionIds?: string[];

  hypotheses: Hypothesis[];
  activeHypothesisId?: string;

  attempts: RecoveryAttempt[];

  status: ProblemStatus;

  diagnosis?: DiagnosisDecision;
  repairSurface?: RepairSurface;
  verificationContract?: VerificationContract;

  createdAt: number;
  updatedAt: number;
}

export type OutcomeVerdict =
  | 'expected_achieved'
  | 'progress'
  | 'neutral'
  | 'contradiction'
  | 'regression'
  | 'blocker';

export interface DetectedContradiction {
  expected: string;
  observed: string;
  fingerprint: string;
  likelySurface?: RepairSurface;
  isBlocking: boolean;
}

export interface OutcomeEvaluation {
  verdict: OutcomeVerdict;
  isBlocking: boolean;
  explanation: string;
  detectedContradiction?: DetectedContradiction;
}
