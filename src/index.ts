export {
  Gitu,
  type GituConfig,
  type GituRunResult,
  /** @deprecated Use Gitu. */
  Hermes,
  /** @deprecated Use GituConfig. */
  type HermesConfig,
  /** @deprecated Use GituRunResult. */
  type HermesRunResult,
} from './agent/gitu.js';
export { buildStateMessage, buildSystemPrompt } from './agent/prompt.js';
export { classifyTaskComplexity, planEffort } from './agent/effort-planner.js';
export { buildPlanNote, classifyRiskDomains, planRisk, selectSpecialists } from './agent/risk-planner.js';
export {
  auditArchitecture,
  decisionConflicts,
  detectExplicitTechnologies,
  normalizeDecisionDraft,
  renderDecisions,
  technologiesIn,
  type ArchitectureAudit,
} from './agent/architecture.js';
export { classifyCall, estimateTokens, renderTelemetry, RunTelemetry } from './agent/telemetry.js';
export { CheckpointManager } from './checkpoint/checkpoint.js';
export { CodeIndex, defaultIndexPath, type IndexedFile, type RefreshStats } from './context/code-index.js';
export { ContextEngine, classifyRole, tokenize } from './context/context-engine.js';
export { EvidenceEngine, type GateResult } from './evidence/evidence.js';
export { Executor, type ExecuteOutcome, type ExecuteRequest } from './executor/executor.js';
export { ProjectGuard, ProjectGuardError } from './guard/project-guard.js';
export { TaskLedger } from './ledger/task-ledger.js';
export { DEFAULT_LOOP_POLICY, LoopDetector, type LoopPolicy, type LoopVerdict } from './loop/loop-detector.js';
export {
  OpenAiCompatClient,
  ScriptedMockLlm,
  extractJson,
  type LlmClient,
  type LlmMessage,
  LlmError,
} from './llm/llm.js';
export {
  PROVIDERS,
  ProviderError,
  resolveLlm,
  type ProviderSpec,
  type ResolvedLlm,
} from './llm/providers.js';
export { MemoryStore } from './memory/memory-store.js';
export {
  ConnectionRegistry,
  type ConnectionDraft,
  type ConnectionHttpMethod,
  type ConnectionInvocationResult,
  type ConnectionOperation,
  type ConnectionOperationRisk,
  type ConnectionProfile,
  type ConnectionProfileView,
  type ConnectionRequirement,
} from './connections/connections.js';
export {
  UniversalConnectionRuntime,
  type ExecuteOptions,
  type IntrospectionResult,
  type IntrospectionSource,
  type MutationPlan,
  type RuntimeOptions,
} from './connections/runtime/orchestrator.js';
export { SemanticCapabilityGraph, type GraphNode } from './connections/runtime/graph/capability-graph.js';
export { aggregateRelationships, type AggregatedRelationship } from './connections/runtime/graph/relationships.js';
export { PrerequisiteResolver } from './connections/runtime/resolution/prerequisite-resolver.js';
export type { PlanStep, ResolutionPlan } from './connections/runtime/resolution/resolution-plan.js';
export { RemoteStateDiscoverer, type ObservedInstance, type StateSnapshot } from './connections/runtime/discovery/state-discovery.js';
export { UniversalExecutor, type ExecutorOptions, type McpTransport } from './connections/runtime/execution/executor.js';
export { operationFingerprint, type FingerprintContext } from './connections/runtime/execution/fingerprint.js';
export { RetryGuard, type FailureRecord, type RetryAssessment } from './connections/runtime/execution/retry-guard.js';
export { ResultVerifier } from './connections/runtime/verification/verifier.js';
export { CapabilityCache, type CachedConnectionKnowledge } from './connections/runtime/cache/capability-cache.js';
export { VaultCredentialBroker, scrub, type AuthMaterial, type CredentialBroker } from './connections/runtime/credentials/credential-broker.js';
export { normalizeOperations, identifierStem } from './connections/runtime/semantics/inference.js';
export { inferSemanticRole } from './connections/runtime/semantics/roles.js';
export { inferSemanticTarget, singularize } from './connections/runtime/semantics/targets.js';
export { introspectOpenApi } from './connections/runtime/interpreters/openapi.js';
export { introspectGraphQl, type GraphQlIntrospection } from './connections/runtime/interpreters/graphql.js';
export { introspectMcpTools, type McpToolDefinition } from './connections/runtime/interpreters/mcp.js';
export type {
  Capability,
  CapabilityAction,
  CapabilityInput,
  CapabilityOutput,
  CapabilityRelationship,
  InputResolution,
  ParameterLocation,
  SemanticConcept,
  SemanticRoleBinding,
  SideEffect,
  SchemaType,
} from './connections/runtime/model/capability.js';
export type { ExternalOperation, GraphQlOperation, McpOperation, RawOperation, RestOperation } from './connections/runtime/model/operation.js';
export type { ExecutionOutcome, VerificationResult, VerificationStatus, VerificationStrategy } from './connections/runtime/model/verification.js';
export { normalizeHttpFailure, normalizeTransportError, type ErrorCategory, type SemanticError } from './connections/runtime/model/errors.js';
export { PolicyEngine, classifyCommand, type ApprovalHandler, type PolicyDecision } from './policy/policy.js';
export {
  CapabilityAwareResolver,
  RecoveryPolicy,
  formatBlockedPrerequisite,
  inferMissingPrerequisite,
  type PrerequisiteProvider,
  type PrerequisiteRecoveryOptions,
  type PrerequisiteResolution,
  type RecoveryAttempt,
  type RecoveryContext,
  type RecoveryPolicyOptions,
  type RecoveryStrategy,
  type RecoveryStrategyResult,
} from './recovery/prerequisites.js';
export { Reporter } from './report/reporter.js';
export {
  GituServer,
  type GituServerConfig,
  /** @deprecated Use GituServer. */
  HermesServer,
  /** @deprecated Use GituServerConfig. */
  type HermesServerConfig,
  type RunSessionView,
} from './server/server.js';
export * from './types.js';
export { errorSignature, hashParams, normalizeErrorText } from './util.js';
