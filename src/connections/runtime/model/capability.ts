import type { ExternalOperation } from './operation.js';
import type { VerificationStrategy } from './verification.js';

/**
 * Universal capability data model.
 *
 * Architectural invariant: nothing in this file (or anywhere in
 * src/connections/runtime) may reference a concrete provider name. The
 * capability graph is built from protocol-neutral primitives so the
 * orchestrator reasons about actions, semantics and dependencies only.
 */

/** What a capability fundamentally does, independent of provider vocabulary. */
export type CapabilityAction = 'discover' | 'search' | 'read' | 'create' | 'update' | 'delete' | 'execute' | 'attach' | 'detach';

export type SchemaType = 'string' | 'number' | 'boolean' | 'object' | 'array' | 'unknown';

/** How a required input obtains its value at plan/execution time. */
export type InputResolution = 'known' | 'discoverable' | 'generated' | 'credential' | 'user-required';

export type SideEffect = 'none' | 'reversible' | 'destructive';

/** Where a parameter travels in the external operation. Execution metadata. */
export type ParameterLocation = 'path' | 'query' | 'body' | 'header' | 'argument';

/**
 * A semantic concept inferred from evidence (descriptions, schema enums,
 * response shapes). Confidence expresses how certain the inference is; the
 * original external names are always preserved alongside.
 */
export interface SemanticConcept {
  id: string;
  label: string;
  confidence: number;
  evidence: string[];
}

/**
 * A semantic role binding. `externalName` is the original schema identifier
 * and remains the ONLY name the executor may put on the wire; the semantic
 * role guides reasoning and never overwrites the provider contract.
 */
export interface SemanticRoleBinding {
  externalName: string;
  semanticRole: string;
  confidence: number;
  evidence: string[];
}

export interface CapabilityInput {
  /** Original schema name. The executor must always use this on the wire. */
  externalName: string;
  semanticRole?: string;
  roleConfidence?: number;
  roleEvidence?: string[];
  required: boolean;
  type: SchemaType;
  location: ParameterLocation;
  resolution: InputResolution;
  description?: string;
  enumValues?: string[];
  /** Capabilities known to produce this input, when the schema says so. */
  sourceCapabilities?: string[];
}

export interface CapabilityOutput {
  externalName: string;
  semanticRole?: string;
  roleConfidence?: number;
  type: SchemaType;
  description?: string;
}

/** Evidence-based relationship between two semantic concepts. */
export interface CapabilityRelationship {
  from: string;
  to: string;
  relation: 'contains' | 'parent' | 'depends-on';
  confidence: number;
  evidence: string[];
}

/**
 * The universal capability. Protocol identity lives only inside
 * `externalOperation` as execution metadata; orchestration never branches on
 * it.
 */
export interface Capability {
  id: string;
  label: string;
  action: CapabilityAction;
  semanticTarget?: SemanticConcept;
  /** Type variants discoverable from schema enums/descriptions (e.g. postgresql). */
  semanticVariants: SemanticConcept[];
  externalOperation: ExternalOperation;
  inputs: CapabilityInput[];
  outputs: CapabilityOutput[];
  relationships: CapabilityRelationship[];
  sideEffect: SideEffect;
  /** Overall confidence in the semantic interpretation of this capability. */
  confidence: number;
  description?: string;
  verification: VerificationStrategy[];
}
