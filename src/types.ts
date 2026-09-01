export type TaskStatus =
  | 'intake'
  | 'planning'
  | 'review'
  | 'executing'
  | 'verifying'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'aborted';

export interface ProjectLock {
  name: string;
  repoRoot: string;
  /**
   * Immutable identity of the filesystem target this run is allowed to
   * mutate. `repoRoot` predates linked worktrees and remains the compatible
   * name for `writableRoot`; new code must use this explicit record whenever
   * it needs to distinguish the common repository from the active worktree.
   */
  workspace?: WorkspaceAuthority;
  branch?: string;
  techStack: string[];
  entrypoints: string[];
  testCommand?: string;
  buildCommand?: string;
  lintCommand?: string;
  typecheckCommand?: string;
  ignorePaths: string[];
  lockedAt: string;
}

export interface WorkspaceAuthority {
  /** The common/main checkout root when Git can identify one. */
  repositoryRoot: string;
  /** The current linked Git worktree, or the project root for non-Git work. */
  worktreeRoot: string;
  /** The only project root tools may resolve writes beneath. */
  writableRoot: string;
}

export type CriterionEvidenceType =
  | 'command_success'
  | 'test_success'
  | 'build_success'
  | 'lint_success'
  | 'typecheck_success'
  | 'any';

export interface CriterionSpec {
  text: string;
  verification?: string;
  evidenceType?: CriterionEvidenceType;
}

export interface AcceptanceCriterion {
  id: string;
  text: string;
  /** When set, the criterion can ONLY be satisfied by evidence from this exact command. */
  verification?: string;
  /** Expected evidence type. Default: 'any' (any passing evidence). */
  evidenceType?: CriterionEvidenceType;
  evidenceIds: string[];
  satisfied: boolean;
}

export type EvidenceKind =
  | 'test'
  | 'build'
  | 'lint'
  | 'typecheck'
  | 'command'
  | 'diff'
  | 'manual'
  | 'log'
  | 'file';

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  label: string;
  command?: string;
  exitCode?: number;
  passed: boolean;
  outputExcerpt: string;
  artifactPath?: string;
  createdAt: string;
  workspaceFingerprint?: string;
  stale?: boolean;
  /** Identity hash of the evidence itself (command + outcome + workspace +
   *  time + output). Lets a parent detect replayed / recycled evidence. */
  fingerprint?: string;
}

export type StepStatus = 'pending' | 'in_progress' | 'done' | 'failed' | 'blocked';

/** Which surface a plan step touches — drives richer frontend/backend design
 *  output and lets the state message summarize progress per area. */
export type PlanArea =
  | 'frontend'
  | 'backend'
  | 'integration'
  | 'shared'
  | 'database'
  | 'infra'
  | 'tests'
  | 'docs';

/** A todo-level breakdown item under a plan step (small, verifiable, cheap). */
export interface PlanSubtask {
  text: string;
  done: boolean;
}

export interface PlanStep {
  id: string;
  description: string;
  verification: string;
  status: StepStatus;
  attempts: number;
  /** Surface this step belongs to (optional; tagged at plan time). */
  area?: PlanArea;
  /** Todo breakdown of this step into smaller tasks. */
  subtasks?: PlanSubtask[];
}

/** Compact design notes recorded before/at plan time for feature work.
 *  Hard-bounded: they ride along in every state message (compact form), so
 *  verbosity here taxes every model call.
 *  Caps: frontend ≤1200, backend ≤1200, integration ≤800, total ≤3200. */
export interface PlanDesign {
  /** Pages/views, layout & components, interactions, state/data flow,
   *  responsive + loading/empty/error states, accessibility (≤1200 chars). */
  frontend?: string;
  /** API routes & contracts, schema changes, authz, validation, business
   *  logic, integrations, error handling (≤1200 chars). */
  backend?: string;
  /** Frontend↔backend data contracts, shared types, realtime/SSE behavior,
   *  persistence flow — the integration glue (≤800 chars). */
  integration?: string;
}

/** Why a plan step was revised during execution (dynamic replanning audit). */
export interface PlanRevision {
  stepId: string;
  reason: string;
  createdAt: string;
}

export type ActionStatus = 'success' | 'error' | 'denied' | 'blocked' | 'skipped';

export interface ActionRecord {
  id: string;
  stepId?: string;
  tool: string;
  paramsHash: string;
  paramsSummary: string;
  status: ActionStatus;
  errorSignature?: string;
  exitCode?: number;
  reason: string;
  expected: string;
  observation?: string;
  durationMs: number;
  createdAt: string;
}

export type MemoryType =
  | 'project'
  | 'architecture'
  | 'decision'
  | 'task'
  | 'failure'
  | 'preference'
  | 'fact'
  | 'constraint'
  | 'lesson'
  | 'pattern'
  | 'task_result'
  | 'project_convention'
  | 'evidence'
  | 'observation';

/** Memory lifecycle: candidates must be EARNED into durable knowledge.
 *  candidate → verified → durable; superseded/archived are terminal-ish. */
export type MemoryStatus = 'candidate' | 'verified' | 'durable' | 'superseded' | 'archived';

/** Where a memory came from. model_inference memories are NOT authoritative:
 *  they stay candidates until verified against source/tests/evidence. */
export type MemorySourceType =
  | 'user_statement'
  | 'source_code'
  | 'test'
  | 'browser_evidence'
  | 'tool_result'
  | 'model_inference'
  | 'task_completion'
  | 'failure_analysis';

/** Visibility scope (review: ONE store, FOUR scopes). Distinct from the
 *  lexical `scope` string: this controls WHO may retrieve the memory.
 *  Legacy entries without visibility are migrated to 'project'. */
export type MemoryVisibility = 'agent' | 'mission' | 'project' | 'global';

/** Retrieval isolation context (review Phase 3): enforced BEFORE ranking. */
export interface MemoryRetrievalContext {
  requestingAgentId?: string;
  missionId?: string;
  projectId?: string;
  allowedScopes?: MemoryVisibility[];
}

/** Structured audit event (review Phase 14) — bounded in-memory ring. */
export interface MemoryAuditEvent {
  at: string;
  event: 'created' | 'verified' | 'rejected' | 'promoted' | 'consolidated' | 'superseded' | 'archived' | 'retrieved' | 'flagged';
  memoryId?: string;
  agentId?: string;
  missionId?: string;
  projectId?: string;
  oldVisibility?: MemoryVisibility;
  newVisibility?: MemoryVisibility;
  reason?: string;
  source?: string;
}

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  claim: string;
  evidence?: string;
  scope: string;
  confidence: number;
  createdAt: string;
  /** Ranking weight (0-1): how much this memory matters, independent of confidence. */
  importance?: number;
  /** Retrieval lifecycle: how often this memory proved worth surfacing. */
  accessCount?: number;
  lastUsedAt?: string;
  /** Lifecycle state (default: 'candidate' for new entries). */
  status?: MemoryStatus;
  /** Provenance: free-text origin note + structured source classification. */
  source?: string;
  sourceType?: MemorySourceType;
  updatedAt?: string;
  lastVerifiedAt?: string;
  /** When superseded: the id of the memory that replaced this one. */
  supersededBy?: string;
  /** Visibility scope (default/migrated: 'project'). */
  visibility?: MemoryVisibility;
  /** Ownership — required per visibility: agent→agentId, mission→missionId+projectId, project→projectId. */
  agentId?: string;
  missionId?: string;
  projectId?: string;
  /** Promotion provenance trail (oldest first). */
  promotedFrom?: { visibility: MemoryVisibility; at: string; reason?: string }[];
  /** Success-pattern observations: the distinct taskIds that observed this subject. */
  observations?: string[];
  /** Tier 1 pin: explicitly promotes any memory into the protected/active tier
   *  (durable guidance that survives compaction regardless of lexical relevance). */
  pinned?: boolean;
}

export type FileRole =
  | 'entrypoint'
  | 'implementation'
  | 'interface'
  | 'test'
  | 'config'
  | 'docs'
  | 'generated'
  | 'legacy'
  | 'dependency'
  | 'artifact'
  | 'unknown';

export interface FileRef {
  path: string;
  role: FileRole;
  score: number;
  note?: string;
}

export interface ContextPack {
  taskSummary: string;
  primaryFiles: FileRef[];
  relatedFiles: FileRef[];
  testFiles: FileRef[];
  configFiles: FileRef[];
  excludedPaths: string[];
  budget: { maxFiles: number; maxBytes: number };
}

/**
 * Bounded parent-to-specialist briefing.  A delegated model has no access to
 * the parent agent's conversation, plan, or retrieval state, so this carries
 * the small amount of concrete context it needs to begin work without first
 * rediscovering the repository.
 */
export interface SpecialistHandoff {
  /** The user's overall objective, kept separate from the specialist's task. */
  parentGoal: string;
  /** Ranked files the parent selected for this exact delegated task. */
  startingFiles: FileRef[];
  /** Small source excerpts from the starting files; never a repository dump. */
  excerpts: { path: string; content: string }[];
  /** Relevant parent-plan steps, including their intended verification. */
  planSteps: { description: string; verification: string }[];
  /** Acceptance/verification targets the specialist should preserve. */
  verificationTargets: string[];
}

export type TaskComplexity = 'low' | 'medium' | 'high';

export interface EffortPlan {
  complexity: TaskComplexity;
  reason: string;
  /** Recommended LLM reasoning effort */
  llmEffort: 'low' | 'medium' | 'high' | 'max';
  /** Max orchestrator turn budget for this task */
  maxTurns: number;
  /** Max specialist agents that may be delegated to for this task */
  maxSpecialists: number;
  /** Context pack file & byte budget */
  contextBudget: { maxFiles: number; maxBytes: number };
  /** Whether plan review is recommended before executing */
  requireReview: boolean;
  /** Verification rigor expected */
  verificationDepth: 'light' | 'standard' | 'thorough';
}

/** The dominant risk categories a task can carry. Drives which specialists get
 *  recommended and whether a domain review pass is required before completion. */
export type RiskDomain =
  | 'security'
  | 'payments'
  | 'data'
  | 'performance'
  | 'frontend'
  | 'refactor'
  | 'bug'
  | 'unknown';

export interface RecommendedSpecialist {
  /** Exact registered agent name to use in the delegate tool. */
  agent: string;
  /** The agent's registered role. */
  role: string;
  /** Why this specialist was chosen for this task's risk. */
  rationale: string;
  /** Risk domain this specialist covers. */
  domain: RiskDomain;
}

export interface RiskPlan {
  /** Primary (highest-priority) risk domain, or 'unknown'. */
  risk: RiskDomain;
  /** Every risk domain detected in the goal. */
  domains: RiskDomain[];
  /** Human-readable justification, persisted so continuation knows why. */
  reason: string;
  /** Whether any strict (security/data/payments) risk was detected. */
  strictVerification: boolean;
  /** Right-sized specialist roster for this task (bounded by the effort budget). Empty when the task is low-risk/trivial. */
  recommendedSpecialists: RecommendedSpecialist[];
  /** Domain that must be covered by a review pass before completion (undefined when not required). */
  requiredReview?: RiskDomain;
}

export interface CompletionReport {
  taskId: string;
  goal: string;
  status: 'complete' | 'blocked' | 'failed';
  summary: string;
  changes: string[];
  filesChanged: string[];
  verification: string[];
  /** Per-run memory lifecycle stats (review Phase 13). */
  memoryStats?: MemoryStatsSnapshot;
  /** Structured evidence for the UI. `verification` remains for text/CLI reports. */
  verificationDetails?: VerificationReportItem[];
  /** Browser work recorded during the task, when visual verification was used. */
  browserActivity?: BrowserActivity;
  effortPlan?: EffortPlan;
  /** Findings discovered during the task, with independent verification status. */
  findings?: TaskFinding[];
  /** Architecture/technology decisions recorded during the task. */
  architectureDecisions?: ArchitectureDecision[];
  /** Where the run's tokens were spent. */
  tokenTelemetry?: TokenTelemetrySnapshot;
  /** Evidence-based outcome quality and token efficiency for this run. */
  qualityMetrics?: RunQualityMetrics;
  evidence: string[];
  remainingRisks: string[];
  followUps: string[];
  generatedAt: string;
}

export interface VerificationReportItem {
  id: string;
  kind: EvidenceKind;
  label: string;
  passed: boolean;
  exitCode?: number;
  command?: string;
  outputExcerpt?: string;
  /** Evidence run against the final workspace state, or retained history. */
  authority?: 'latest' | 'historical';
}

export interface RunQualityMetrics {
  score: number;
  criteria: { total: number; satisfied: number; coverage: number };
  verification: { authoritative: number; passing: number; failing: number; passRate: number };
  tokensPerVerifiedCriterion?: number;
  wastedCallRate?: number;
}

export interface BrowserActivity {
  total: number;
  successful: number;
  screenshots: number;
}

/** What kind of authority a requirement or constraint carries. Ordering matters:
 *  explicit user requirements outrank repository constraints, which outrank
 *  recommendations, which outrank optional preferences. */
export type DecisionBasis =
  | 'explicit-requirement'
  | 'repository-constraint'
  | 'recommendation'
  | 'preference';

/** A compact, persisted architecture/technology decision. Kept small on
 *  purpose: it is re-emitted in the per-turn state message, so verbosity here
 *  taxes every model call. */
export interface ArchitectureDecision {
  id: string;
  /** The chosen approach, one line (e.g. "Vanilla JS SPA, no framework"). */
  decision: string;
  /** Alternatives that were actually evaluated. */
  alternatives: string[];
  /** What in THIS repository supports the choice (files, stack, constraints). */
  repoEvidence: string;
  /** Requirements considered (explicit + repository constraints). */
  requirements: string[];
  /** Why each rejected alternative lost. */
  rejected: { alternative: string; reason: string }[];
  /** Conditions that would justify reconsidering this decision. */
  reconsiderIf?: string;
  /** The strongest kind of authority backing the decision. */
  basis: DecisionBasis;
  status: 'active' | 'superseded';
  /** Set when a later decision replaces this one (drift must be explicit). */
  supersededReason?: string;
  createdAt: string;
}

/** Per-run token accounting, persisted so token spend can be attributed to
 *  its actual sources instead of guessed at. */
export interface TokenTelemetrySnapshot {
  /** Model calls made by the orchestrator (excludes specialist sub-agents). */
  calls: number;
  /** Provider-reported usage totals (0 when the provider reports nothing). */
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  /** Cumulative char-based estimate (chars/4) of everything sent as input. */
  estimatedInputTokens: number;
  /** Estimated input tokens attributed by source, summed across all calls.
   *  `history` = digest + strategy + conversation (coarse bucket kept for
   *  reports); the finer keys split it so context spend is diagnosable. */
  estimatedBySource: {
    system: number;
    contextPack: number;
    history: number;
    state: number;
    images: number;
    digest: number;
    strategy: number;
    conversation: number;
    memory: number;
  };
  /** Planning vs execution cost attribution. */
  planningCalls: number;
  executionCalls: number;
  estimatedPlanningInput: number;
  estimatedExecutionInput: number;
  planningOutputTokens: number;
  executionOutputTokens: number;
  /** Token cost of planning artifacts at end-of-run (optional, set post-run). */
  designTokens?: number;
  planTokens?: number;
  todoTokens?: number;
  compactions: number;
  screenshots: number;
  /** Total base64 payload size of screenshots attached to model context. */
  screenshotBytes: number;
  toolCalls: number;
  /** Model calls that produced no executable action (wasted spend). */
  wastedCalls: number;
  filesInContextPack: number;
}

export interface TaskLedgerData {
  schemaVersion: 1;
  taskId: string;
  goal: string;
  status: TaskStatus;
  mode: 'fast' | 'standard' | 'chat';
  project: ProjectLock;
  gitBranch?: string;
  worktreePath?: string;
  activeSkills?: string[];
  usedSkills?: string[];
  /** Exact loaded instructions governing the current logical task. */
  selectedSkills?: SkillIdentity[];
  /** Exact skills that were successfully loaded through use_skill. */
  usedSkillIdentities?: SkillIdentity[];
  /** Bounded lifecycle telemetry; detail stays out of the main UI. */
  skillEvents?: SkillLifecycleEvent[];
  /** Durable audit trail for prerequisite discovery/reuse/provisioning. */
  prerequisiteRecoveries?: PrerequisiteRecoveryRecord[];
  acceptanceCriteria: AcceptanceCriterion[];
  constraints: string[];
  nonGoals: string[];
  contextPack?: ContextPack;
  effortPlan?: EffortPlan;
  riskPlan?: RiskPlan;
  findings?: TaskFinding[];
  architectureDecisions?: ArchitectureDecision[];
  tokenTelemetry?: TokenTelemetrySnapshot;
  /** Design notes (frontend/backend/data model) recorded at plan time. */
  planDesign?: PlanDesign;
  /** Audit trail of dynamic replanning: why a step was revised mid-run (cap 20). */
  planRevisions?: PlanRevision[];
  /** Audit trail of budget extensions: why the run needed more room (cap 10). */
  budgetExtensions?: BudgetExtensionRecord[];
  plan: PlanStep[];
  planApproved?: boolean;
  currentHypothesis?: string;
  actions: ActionRecord[];
  evidence: Evidence[];
  filesChanged: string[];
  checkpoints: { stepId: string; ref: string; createdAt: string }[];
  blockers: string[];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  report?: CompletionReport;
  /** Per-run memory lifecycle stats for the report/telemetry panel. */
  memoryStats?: MemoryStatsSnapshot;
}

export type SkillLifecycleStage = 'discovered' | 'selected' | 'loaded' | 'applied' | 'verified' | 'rejected';

export interface SkillLifecycleEvent {
  stage: SkillLifecycleStage;
  name: string;
  version?: string;
  contentHash?: string;
  scope?: SkillIdentity['scope'];
  selectionScore?: number;
  reason?: string;
  specialist?: string;
  loadChars?: number;
  failureCode?: string;
  createdAt: string;
}

/** A concrete thing the task cannot safely continue without. */
export type PrerequisiteKind =
  | 'credential'
  | 'connection'
  | 'resource'
  | 'configuration'
  | 'dependency'
  | 'service'
  | 'target'
  | 'permission';

/** Safe, non-secret connection details Gitu learned from an official provider
 * document or an existing saved profile. They prefill the secure form so the
 * user can provide only a credential when no configuration choice remains. */
export interface ConnectionSetupHint {
  label?: string;
  baseUrl?: string;
  documentationUrl?: string;
  validationPath?: string;
  validationCapability?: string;
}

export interface MissingPrerequisite {
  id: string;
  kind: PrerequisiteKind;
  description: string;
  requiredFor: string;
  /** Optional provider identifier such as "coolify" or "internal-cloud".
   * It selects a user-saved connection without putting a URL or token in the
   * model protocol. */
  providerHint?: string;
  /** Provider-neutral capabilities needed from the selected connection. */
  capabilities?: string[];
  /** Optional, host-validated non-secret defaults for the secure connection
   * form. They never contain a header, token, or request body. */
  connectionSetup?: ConnectionSetupHint;
  hints?: string[];
  riskIfWrong?: 'low' | 'medium' | 'high';
}

/** Provider-declared capability. The provider remains behind an adapter. */
export interface Capability {
  id: string;
  provider: string;
  actions: string[];
  riskClass: 'read' | 'reversible-write' | 'destructive';
}

/** Separate recovery risk from ordinary command/tool tiers. */
export enum RecoveryRisk {
  READ_ONLY = 'READ_ONLY',
  REVERSIBLE = 'REVERSIBLE',
  DESTRUCTIVE = 'DESTRUCTIVE',
  COSTLY = 'COSTLY',
  PRODUCTION_CRITICAL = 'PRODUCTION_CRITICAL',
}

export type PrerequisiteRecoveryStatus =
  | 'RESOLVING_PREREQUISITE'
  | 'RESOURCE_DISCOVERY'
  | 'RESOURCE_REUSED'
  | 'RESOURCE_PROVISIONED'
  | 'RECOVERY_EXHAUSTED'
  | 'NEEDS_USER';

/** No secret values are stored here: only source, policy and outcome facts. */
export interface PrerequisiteRecoveryRecord {
  prerequisiteId: string;
  prerequisiteKind: PrerequisiteKind;
  description: string;
  requiredFor: string;
  strategy: string;
  status: PrerequisiteRecoveryStatus;
  outcome: string;
  risk: RecoveryRisk;
  provider?: string;
  createdAt: string;
}

/** Memory observability snapshot (review Phase 13/16). */
export interface MemoryStatsSnapshot {
  total: number;
  retrieved: number;
  injected: number;
  supersededSkipped: number;
  byVisibility: Record<string, number>;
  byStatus: Record<string, number>;
  promotions: number;
  auditEvents: number;
  /** Semantic layer counters (review semantic phase). */
  semantic?: {
    semanticCandidates: number;
    semanticDuplicates: number;
    semanticRelated: number;
    semanticContradictions: number;
    semanticMerged: number;
    embeddingCacheHits: number;
    embeddingCacheMisses: number;
    embeddingFallbacks: number;
    successObservations: number;
    successPatternsPromoted: number;
    possibleContradictions: number;
  };
}

/** One granted budget extension, with the evidence that justified it. */
export interface BudgetExtensionRecord {
  at: string;
  /** Turn number when the extension was granted. */
  turn: number;
  /** Why: e.g. "wide change surface: 11 files changed". */
  reason: string;
  /** Evidence snapshot at grant time. */
  filesChanged: number;
  distinctFailures: number;
  evidenceCount: number;
  extraTurns: number;
  extraSpecialists: number;
  /** Specialist budget after this extension. */
  specialistBudgetAfter: number;
}

export type SpecialistStatus = 'SUCCESS' | 'PARTIAL_SUCCESS' | 'BLOCKED' | 'FAILED' | 'CANCELLED';

export interface StructuredSpecialistReport {
  agent: string;
  task: string;
  ok: boolean;
  status: SpecialistStatus;
  summary: string;
  turnsUsed: number;
  turnsBudgeted: number;
  filesInspected: string[];
  filesChanged: string[];
  criteriaStatus?: { id: string; text: string; satisfied: boolean }[];
  evidenceIds: string[];
  blockers?: string[];
  recommendation?: string;
}

export type RiskTier = 'safe' | 'moderate' | 'dangerous';

/** ── Finding Verification Gate ────────────────────────────────────────────
 *  A finding is a problem the agent claims to have discovered (vulnerability,
 *  bug, data-integrity issue...). It is NOT reported to the user as fact until
 *  an independent verifier specialist has reproduced it with real evidence.
 */
export type FindingKind = 'security' | 'bug' | 'performance' | 'data' | 'other';

export type FindingStatus =
  | 'unverified'
  | 'confirmed'
  | 'false-positive'
  | 'unverifiable';

export interface TaskFinding {
  id: string;
  claim: string;
  kind: FindingKind;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  location?: string;
  /** The exact command an independent verifier must run to reproduce the finding. */
  reproductionCommand?: string;
  status: FindingStatus;
  evidenceIds: string[];
  verifierSummary?: string;
  createdAt: string;
}

export interface ToolResult {
  ok: boolean;
  output: string;
  exitCode?: number;
  errorSignature?: string;
  filesTouched?: string[];
  linesAdded?: number;
  image?: string;
  /** Optional structured data that rides along in-memory (never serialized to the model). */
  payload?: unknown;
}
import type { SkillIdentity } from './skills/skills.js';
