import type { CapabilityAction, CapabilityRelationship, CapabilityInput, CapabilityOutput, SemanticConcept, SideEffect } from './capability.js';

/**
 * External operation descriptors. These are execution metadata: the executor
 * reads them to place a call, but orchestration code must never branch on
 * `protocol` — capabilities are compared by action, target and semantics.
 */
export interface RestOperation {
  protocol: 'rest';
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Static path template relative to the connection base URL, e.g. /zones/{zoneId}/engines */
  pathTemplate: string;
}

export interface GraphQlOperation {
  protocol: 'graphql';
  operationType: 'query' | 'mutation';
  field: string;
}

export interface McpOperation {
  protocol: 'mcp';
  tool: string;
}

export type ExternalOperation = RestOperation | GraphQlOperation | McpOperation;

/** Protocol-neutral parameter extracted by an interpreter. */
export interface RawParameter {
  externalName: string;
  location: 'path' | 'query' | 'body' | 'header' | 'argument';
  required: boolean;
  type: string;
  description?: string;
  enumValues?: string[];
}

export interface RawOutput {
  externalName: string;
  type: string;
  description?: string;
}

/**
 * Protocol-neutral operation extracted by an interpreter. Interpreters may
 * hint at an action, but the semantic normalizer makes the final decision.
 */
export interface RawOperation {
  id: string;
  label: string;
  description?: string;
  external: ExternalOperation;
  parameters: RawParameter[];
  outputs: RawOutput[];
  actionHint?: CapabilityAction;
  /** Evidence-based relationship hints discovered from protocol structure. */
  relationshipHints: CapabilityRelationship[];
  /** Concept the operation's path/name points at, as a weak lexical hint. */
  targetHint?: { name: string; evidence: string[] };
}

/** Normalized capability output of the semantic normalizer. */
export interface NormalizedCapability {
  id: string;
  label: string;
  action: CapabilityAction;
  semanticTarget?: SemanticConcept;
  semanticVariants: SemanticConcept[];
  externalOperation: ExternalOperation;
  inputs: CapabilityInput[];
  outputs: CapabilityOutput[];
  relationships: CapabilityRelationship[];
  sideEffect: SideEffect;
  confidence: number;
  description?: string;
}
