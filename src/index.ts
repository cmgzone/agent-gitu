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
