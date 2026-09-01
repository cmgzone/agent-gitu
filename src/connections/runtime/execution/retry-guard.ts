import type { Capability } from '../model/capability.js';
import type { SemanticError } from '../model/errors.js';
import { operationFingerprint, type FingerprintContext } from './fingerprint.js';

/**
 * The RetryGuard. Rule: the same normalized operation + same parameters +
 * same schema + same known state must NOT execute repeatedly after failing.
 * Because fingerprints include the schema fingerprint and the remote-state
 * epoch, legitimate retries after real state or schema changes stay eligible
 * — no false blocking, no infinite loops.
 */

export interface FailureRecord {
  fingerprint: string;
  capabilityId: string;
  category: string;
  status?: number;
  at: string;
}

export interface RetryAssessment {
  allowed: boolean;
  fingerprint: string;
  reason?: string;
}

export class RetryGuard {
  private failures = new Map<string, FailureRecord>();

  assess(capability: Capability, params: Record<string, unknown>, ctx: FingerprintContext): RetryAssessment {
    const fingerprint = operationFingerprint(capability, params, ctx);
    const prior = this.failures.get(fingerprint);
    if (prior) {
      return {
        allowed: false,
        fingerprint,
        reason: `BLOCKED_DUPLICATE_FAILURE: ${capability.label} already failed (${prior.category}${prior.status ? ` HTTP ${prior.status}` : ''}) with identical parameters at ${prior.at}. Zero second network attempt. Re-discover state or refresh the schema to make it eligible again.`,
      };
    }
    return { allowed: true, fingerprint };
  }

  recordFailure(capability: Capability, params: Record<string, unknown>, ctx: FingerprintContext, error: SemanticError): string {
    const fingerprint = operationFingerprint(capability, params, ctx);
    this.failures.set(fingerprint, { fingerprint, capabilityId: capability.id, category: error.category, status: error.status, at: new Date().toISOString() });
    return fingerprint;
  }

  /** Called when observed state actually changes; clears bounded failure memory. */
  noteStateChange(): void {
    this.failures.clear();
  }

  failureCount(): number {
    return this.failures.size;
  }
}
