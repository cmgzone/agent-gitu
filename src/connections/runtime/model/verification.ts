/**
 * Verification and execution-confidence models. Execution success (an HTTP
 * 2xx) and independent verification (a read-back that proves the desired
 * state exists) are deliberately separate measurements and must be reported
 * separately.
 */
import type { CapabilityAction } from './capability.js';

/**
 * How a capability's result can be proven. `read-back` names a read-like
 * capability able to independently observe the produced state.
 */
export interface VerificationStrategy {
  kind: 'read-back' | 'response-only';
  capabilityId?: string;
  description: string;
}

export type VerificationStatus = 'verified' | 'partial' | 'failed' | 'skipped';

/** Independent proof of the desired state, separate from execution success. */
export interface VerificationResult {
  status: VerificationStatus;
  /** 0..1 — 1.0 read-back found the expected object; 0.45 response-only; 0 none. */
  confidence: number;
  strategy: string;
  detail: string;
}

/** Raw execution outcome, before any independent verification. */
export interface ExecutionOutcome {
  ok: boolean;
  status: number;
  /** 1.0 when the external system acknowledged the mutation, 0 otherwise. */
  executionConfidence: number;
  data?: unknown;
  fingerprint: string;
  /** Redacted, model-safe trace of what was executed. */
  trace: string;
  error?: import('./errors.js').SemanticError;
}

/** Full result reported upward: execution plus independent verification. */
export interface VerifiedExecution {
  capabilityId: string;
  action: CapabilityAction;
  execution: ExecutionOutcome;
  verification: VerificationResult;
  /** Convenience summary, e.g. "EXECUTED, PARTIALLY VERIFIED". */
  summary: string;
}
