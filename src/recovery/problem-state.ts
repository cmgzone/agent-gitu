/**
 * Universal problem-solving runtime state definitions.
 *
 * Technology-neutral representation of unexpected problems, contradictions,
 * hypotheses, recovery attempts, and repair targets.
 *
 * DESIGN PRINCIPLE (AC-20+):
 * The MODEL reasons about what a problem means. The RUNTIME enforces
 * disciplined problem solving:
 *   EXPECTED -> OBSERVED -> CONTRADICTION -> HYPOTHESIS
 *   -> DECISION-CHANGING EVIDENCE -> REPAIR -> ACT NOW -> VERIFY -> RESUME
 *
 * The runtime MUST NOT contain hardcoded knowledge of specific
 * technologies, providers, error codes, or frameworks. All domain meaning
 * comes from structured expectations/observations supplied by tool adapters
 * and the model, compared generically here.
 */

export type ProblemStatus =
  | 'observed'
  | 'investigating'
  | 'decision_sufficient'
  | 'act_now'
  | 'repairing'
  | 'verifying'
  | 'resolved'
  | 'needs_user'
  | 'blocked';

/**
 * Legacy closed repair-surface vocabulary. Retained ONLY for telemetry
 * continuity and backward-compatible callers. It MUST NOT be used as the
 * sole repair-target mechanism: unknown ownership stays `unknown` until
 * evidence supports a controllable target (AC-21).
 */
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

/** Open-ended repair target. Any future capability works without core changes (AC-24 test). */
export interface RepairTarget {
  /** Open string: e.g. 'kubernetes_cluster', 'cloudflare_zone', 'smtp_server', ... or 'unknown'. */
  kind: string;
  /** Optional capability id required to act on this target (adapter-declared). */
  capability?: string;
  /** Optional concrete resource identity (adapter-declared, never a secret). */
  resourceId?: string;
  /** Human-readable description of what will be repaired. */
  description: string;
}

export const UNKNOWN_REPAIR_TARGET: RepairTarget = {
  kind: 'unknown',
  description: 'Repair ownership not yet determined — evidence required before mutating any surface.',
};

export function isUnknownTarget(t?: RepairTarget): boolean {
  if (!t) return true;
  return t.kind === 'unknown' || t.kind.trim() === '';
}

export type HypothesisStatus = 'candidate' | 'testing' | 'supported' | 'rejected';

export interface Hypothesis {
  id: string;
  statement: string;
  /** Legacy numeric confidence. Retained for telemetry only — NEVER an act gate (AC-22). */
  confidence?: number;
  supportingEvidence: string[];
  contradictingEvidence: string[];
  status: HypothesisStatus;
  /** Legacy closed surface hint (telemetry only). Prefer `suggestedTarget`. */
  suggestedSurface?: RepairSurface;
  /** Open-ended repair target hypothesis (preferred). */
  suggestedTarget?: RepairTarget;
  /** Semantic digest used for loop protection (secrets redacted). */
  semanticDigest?: string;
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
  /** Resource-scoped epochs relevant to this attempt (AC-29). */
  resourceEpochs?: Record<string, number>;
  /** Whether this attempt produced decision-changing information. */
  material?: boolean;
  timestamp: number;
}

// ── Structured expectations (AC-20) ─────────────────────────────────────────

export type ExpectedAssertion =
  | { kind: 'equals'; target: string; expected: unknown }
  | { kind: 'not_equals'; target: string; expected: unknown }
  | { kind: 'contains'; target: string; value: unknown }
  | { kind: 'not_contains'; target: string; value: unknown }
  | { kind: 'state_changed'; target?: string }
  | { kind: 'exists'; target: string }
  | { kind: 'absent'; target: string };

export interface ActionExpectation {
  /** Human-readable description of the expected outcome. */
  description: string;
  /** Machine-checkable assertions compared against normalized observations. */
  assertions?: ExpectedAssertion[];
  /** When true (default), a mismatch blocks the attached step/criterion. */
  blocksOnFailure?: boolean;
  /** Acceptance criteria this expectation guards. */
  criterionIds?: string[];
}

/** Normalized tool observation. Adapters normalize raw results into this shape. */
export interface NormalizedObservation {
  /** Transport-level success (exit 0 / HTTP delivered / tool ok). Distinct from goal success. */
  transportOk: boolean;
  /** Structured fields (status, contentType, url, bodyDigest, stateChanged, ...). */
  fields: Record<string, unknown>;
  /** Optional digest of the raw output for change detection (secrets redacted). */
  rawDigest?: string;
  /** Whether relevant world/resource state changed as a result of the action. */
  stateChanged?: boolean;
}

// ── Decision sufficiency (AC-22/AC-23, replaces numeric-confidence gate) ────

export interface DecisionQuestion {
  question: string;
  /** True when answering could change hypothesis, target, action, safety, or verification. */
  canChangeNextAction: boolean;
  evidenceNeeded?: string;
}

export interface ProposedRepairAction {
  /** Open tool/capability identifier (any adapter may participate, AC-28). */
  tool: string;
  params?: Record<string, unknown>;
  /** Declared intent — repair actions must be explicit. */
  intent: 'repair' | 'inspect' | 'diagnose' | 'verify' | 'navigate' | 'other';
  /** Adapter-declared mutation semantics. */
  mutatesState?: boolean;
  /** Resource scope this action touches (for epoch tracking). */
  resourceScope?: string;
  reason?: string;
}

export interface RepairProposal {
  id: string;
  problemId: string;
  hypothesisDigest?: string;
  intendedEffect: string;
  target: RepairTarget;
  actions: ProposedRepairAction[];
  /** Evidence ids supporting this proposal. */
  evidenceBasis: string[];
  reversible: boolean;
  requiresApproval: boolean;
  verificationContract: VerificationContract;
}

export interface DiagnosisDecision {
  // ── New decision-sufficiency core (authoritative) ──
  /** Candidate root-cause statement (model reasoning, not runtime knowledge). */
  rootCauseCandidate?: string;
  /** True when evidence is sufficient to decide the next action. */
  evidenceSufficient: boolean;
  /** True when a concrete controllable repair is known. */
  repairKnown: boolean;
  repairProposal?: RepairProposal;
  unresolvedQuestions: DecisionQuestion[];
  nextMode: 'investigate' | 'act_now' | 'repair' | 'verify' | 'needs_user';
  // ── Legacy compatibility (derived, never authoritative) ──
  /** @deprecated Use evidenceSufficient/repairKnown instead. Telemetry only. */
  rootCauseKnown?: boolean;
  /** @deprecated Numeric confidence is NEVER an act gate (AC-22). Telemetry only. */
  confidence?: number;
  /** @deprecated Prefer repairProposal.target. Telemetry only; never defaults to repository. */
  repairTarget?: string;
  /** @deprecated Prefer repairProposal.target. Telemetry only; stays undefined when unknown. */
  repairSurface?: RepairSurface;
  /** @deprecated Prefer unresolvedQuestions. */
  missingEvidence?: string[];
}

// ── Verification contracts (AC-32/AC-33) ────────────────────────────────────

export interface VerificationContract {
  // Legacy fields (kept for backward compatibility)
  description: string;
  originalObserved: string;
  expectedOutcome: string;
  verificationCommand?: string;
  verificationTool?: string;
  // First-class contract (AC-32)
  problemId?: string;
  originalExpectation?: ActionExpectation;
  originalObservationDigest?: string;
  verificationAction?: ProposedRepairAction;
  /** Positive assertions that MUST hold for the problem to resolve. */
  successAssertions?: ExpectedAssertion[];
  /** Assertions whose presence means the problem persists. */
  failureAssertions?: ExpectedAssertion[];
  /**
   * When true, mere absence of the old error text may count as success.
   * Default false: positive proof of the expected state is required (AC-33).
   */
  allowAbsenceAsSuccess?: boolean;
}

// ── Investigation intent & evidence impact (AC-24/AC-25) ────────────────────

export interface InvestigationIntent {
  decisionQuestion: string;
  alternatives: string[];
  expectedInformationGain: string;
  affectedRepairDecision?: string;
  /**
   * Which decision this evidence could change. At least one must be true
   * for investigation to be allowed in ACT_NOW/repairing mode — except the
   * exact read-before-edit, which is always allowed.
   */
  changesHypothesis?: boolean;
  changesRepairTarget?: boolean;
  changesRepairAction?: boolean;
  changesSafetyOrApproval?: boolean;
  changesVerification?: boolean;
}

export interface EvidenceImpact {
  evidenceId: string;
  changedHypothesis: boolean;
  changedRelevantState: boolean;
  changedRepairDecision: boolean;
  changedExpectedOutcome: boolean;
  material: boolean;
}

export interface StrategyIdentity {
  problemFingerprint: string;
  hypothesisSemanticDigest: string;
  intendedEffectDigest: string;
  relevantStateDigest: string;
  evidenceBasisDigest: string;
}

// ── Interrupts, epochs, parallel safety (AC-30/AC-31) ───────────────────────

export type InterruptReason = 'user_message' | 'problem_detected' | 'state_changed' | 'authority_changed';

export interface ExecutionInterruptState {
  epoch: number;
  reason: InterruptReason;
}

/** Action execution intent/capability metadata (AC-28). */
export type ActionIntent = 'inspect' | 'diagnose' | 'repair' | 'verify' | 'navigate' | 'other';

export interface ActionCapability {
  intent?: ActionIntent;
  mutatesState?: boolean;
  repairIntent?: boolean;
  riskClass?: 'read' | 'reversible-write' | 'destructive' | 'costly' | 'production-critical';
  resourceScope?: string;
}

export interface ProblemState {
  id: string;
  fingerprint: string;

  goal: string;
  /** Legacy free-form expectation (may remain, but never the only mechanism). */
  expected?: string;
  /** Structured expectation (preferred, AC-20). */
  expectation?: ActionExpectation;
  observed: string;
  /** Digest of the original observation for verification comparison. */
  observationDigest?: string;

  evidenceIds: string[];

  blockedStepIds: string[];
  blockedCriterionIds?: string[];

  hypotheses: Hypothesis[];
  activeHypothesisId?: string;

  attempts: RecoveryAttempt[];

  status: ProblemStatus;

  diagnosis?: DiagnosisDecision;
  /** Active repair proposal between diagnosis and execution (AC: proposal). */
  repairProposal?: RepairProposal;
  /** Legacy surface hint (telemetry only; undefined when unknown). */
  repairSurface?: RepairSurface;
  /** Open-ended repair target (preferred; unknown until evidence supports it). */
  repairTarget?: RepairTarget;
  verificationContract?: VerificationContract;

  // ── Nested / dependent problems (AC-27) ──
  parentProblemId?: string;
  blockedByProblemIds?: string[];
  blocksProblemIds?: string[];

  // ── Material progress / drift control (AC-34) ──
  actionsSinceMaterialProgress?: number;
  readsSinceMaterialProgress?: number;
  duplicateEvidenceDigests?: string[];
  materialProgressEvents?: string[];

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
  /** Structured expectation that was violated (when available). */
  expectation?: ActionExpectation;
  observed: string;
  fingerprint: string;
  /** Legacy surface hint — stays undefined when ownership is unknown. */
  likelySurface?: RepairSurface;
  /** Open-ended target hint — 'unknown' until evidence supports a target. */
  likelyTarget?: RepairTarget;
  isBlocking: boolean;
}

export interface OutcomeEvaluation {
  verdict: OutcomeVerdict;
  isBlocking: boolean;
  explanation: string;
  detectedContradiction?: DetectedContradiction;
  /** Normalized observation used for the decision (when available). */
  observation?: NormalizedObservation;
}
