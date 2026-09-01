import type { CapabilityInput } from '../model/capability.js';

/**
 * Resolution plan types. A plan describes the smallest set of read
 * capabilities needed to fill a mutation's unknown prerequisites, before any
 * mutation is proposed. Values are counted against the ROOT capability's
 * required inputs (nested producer inputs are internal to the chain).
 */

export interface PlanStep {
  /** Read capability that runs to produce a value. */
  producerCapabilityId: string;
  /** External name of the input on the consumer that receives the value. */
  resolvesInput: string;
  semanticRole?: string;
  /** Capability that consumes the produced value. */
  feedsCapabilityId: string;
  /** 0 for the root capability's own inputs, increasing down the chain. */
  depth: number;
  evidence: string[];
}

export interface ResolutionPlan {
  capabilityId: string;
  steps: PlanStep[];
  /** Required inputs already known to the caller. */
  known: string[];
  /** Required inputs the credential broker supplies (never the model). */
  credentialInputs: string[];
  /** Required inputs the executor can generate (e.g. resource names). */
  generatedInputs: string[];
  /** Required inputs that need the caller/user to supply a value. */
  userRequired: string[];
  /** Required inputs with no discovered producer — planning is honest about gaps. */
  unresolved: string[];
  /** Total required inputs on the root capability. */
  total: number;
  /** known + credential + generated + resolved-through-steps. */
  resolvedCount: number;
  ready: boolean;
}
