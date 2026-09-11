import { CheckpointManager } from '../checkpoint/checkpoint.js';
import { CodeIndex } from '../context/code-index.js';
import { ContextEngine } from '../context/context-engine.js';
import { EvidenceEngine, classifyEvidenceKind, commandsMatch, hasRegressionProof, isWeakEvidenceLink } from '../evidence/evidence.js';
import { parentReverifyCriterion, type OracleRunner } from '../evidence/reverify.js';
import { MissionGraph } from '../execution/mission.js';
import { Executor } from '../executor/executor.js';
import { getWorkspaceFingerprint, gitExec } from '../git/git.js';
import { ProjectGuard, ProjectGuardError } from '../guard/project-guard.js';
import { TaskLedger } from '../ledger/task-ledger.js';
import { LoopDetector } from '../loop/loop-detector.js';
import { MalformedCallTracker, malformedIntervention, malformedKindFor } from '../loop/malformed-tracker.js';
import {
  extractLastJsonObject,
  LlmError,
  requestLlmTurn,
  type LlmActivityEvent,
  type LlmClient,
  type LlmContentPart,
  type LlmMessage,
  type LlmToolDefinition,
  type LlmTurnResult,
  type LlmUsage,
} from '../llm/llm.js';
import { resolveEmbedder } from '../llm/providers.js';
import { recoveryBudgetTokens, reduceEffortOneLevel, type EffortLevel } from '../llm/output-budget.js';
import { resilientLlm } from '../llm/resilient.js';
import { KNOWN_TOOL_NAMES } from '../tools/tools.js';
import { LspManager } from '../lsp/manager.js';
import { MemoryStore } from '../memory/memory-store.js';
import type { McpManager } from '../mcp/client.js';
import type { ConnectionRegistry } from '../connections/connections.js';
import type { ApprovalHandler } from '../policy/policy.js';
import { PolicyEngine } from '../policy/policy.js';
import { Reporter } from '../report/reporter.js';
import type {
  ConnectionOperationProposal,
  ConnectionRecoveryDecision,
} from '../connections/connections.js';
import type { DiscoveryRequest, DiscoveryResult, DiscoveryIntent } from '../connections/discovery-engine.js';
import { CapabilityAwareResolver, formatBlockedPrerequisite, inferMissingPrerequisite, type PrerequisiteRecoveryOptions } from '../recovery/prerequisites.js';
import { renderSkillContract, SkillStore, type SkillIdentity } from '../skills/skills.js';
import type { BrowserBridge } from '../browser/browser.js';
import type { SubAgentResult, SubAgentRunner } from './subagent.js';
import { validateSpecialistEvidence } from './specialist-evidence.js';
import { VERIFIER_AGENT, buildVerifierContract, verdictForFinding } from './findings.js';
import {
  RecoveryRisk,
  type CompletionReport,
  type ContextPack,
  type CriterionEvidenceType,
  type CriterionSpec,
  type DecisionBasis,
  type EvidenceKind,
  type MemoryRetrievalContext,
  type MissingPrerequisite,
  type PlanArea,
  type PlanStep,
  type SpecialistHandoff,
  type TaskFinding,
  type TaskLedgerData,
  type VerifiedDiffSnapshot,
} from '../types.js';
import { buildStateMessage, buildSystemPrompt, renderFullPlanMessage } from './prompt.js';
import { buildTaskStrategySection, classifyTaskKind, determineInvestigationDepth } from './task-strategy.js';
import { agentVerificationGate, agentWorkflowPrompt, isObservationTool } from './agent-workflow.js';
import { applyFollowUpToLedger, classifyFollowUp, conversationIntent, persistVisualAssets, evaluateInstructionGate } from './follow-up.js';
import { rehydrateVisualReferences, markUnavailableVisualReferences, restoreVisualReferencesAfterCompaction } from './visual-assets.js';
import { analyzeChangeImpact } from './impact.js';
import { planEffort, isFrontendGoal, escalationFor, type EffortPlan } from './effort-planner.js';
import { uiVisualGate, isUiTask } from './ui-gate.js';
import { buildPlanNote, planRisk } from './risk-planner.js';
import { auditArchitecture, decisionConflicts, detectExplicitTechnologies, normalizeDecisionDraft } from './architecture.js';
import { RunTelemetry, estimatePlanningArtifactTokens, renderTelemetry, computeBehaviorMetrics } from './telemetry.js';
import { buildContextSnapshot, renderContextSnapshot } from '../context/snapshot.js';
import { buildModelContext, type ModelContextAttachment } from '../context/model-context.js';
import { ProviderReadCache } from '../connections/runtime/provider-cache.js';
import { UniversalCapabilityRegistry } from '../connections/runtime/universal-registry.js';
import {
  buildSpecialistHandoff,
  specialistHandoffTerms,
  specialistHandoffOverlap,
} from './specialist-handoff.js';
import {
  synthesizeExecutableRecovery,
  parseMissingPrerequisite,
  connectionResultDisclosure,
  asksForResourceIdentifier,
  connectionEventReason,
  PROVIDER_TRUNCATED_GUIDANCE,
  type AskUserQuestion,
  type ExecutableRecoveryInput,
} from './recovery-synthesizer.js';
import {
  collectQualityReviewDiff,
  isVerifiedDiffSnapshotCurrent,
  shouldRunFinalQualityReview,
  buildQualityReviewMessages,
  parseReviewVerdict,
  findLastScreenshotUrl,
  findLastBrowserEvidence,
  type QualityReviewInput,
} from './quality-review.js';
import {
  COMPACT_KEEP_RECENT,
  COMPACT_TRIGGER,
  COMPACT_CHAR_BUDGET,
  COMPACT_MIN_RECENT,
  COMPACT_RECENT_MESSAGE_MAX_CHARS,
  estimateMessageChars,
  KEEP_RECENT_SCREENSHOTS,
  stripStaleImages,
  shiftPrefixEndAfterCompaction,
  compactRecentMessage,
  extractFailureDigest,
  compactHistory,
  compactFollowUpConversation,
  type CompactionOptions,
} from './compaction.js';
import {
  type PlanActionStep,
  PLAN_AREAS,
  parseArea,
  parseSubtasks,
  type ParsedAction,
  visibleActionSummary,
  parseAction,
  KNOWN_ACTION_TYPES,
  GITU_ACTION_TOOL,
  actionReplyFromTurn,
  parseReplyAction,
  braceBalance,
  type BadReplyKind,
  classifyBadReply,
  logParseFailure,
  ACTION_BRACE_RE,
  proseCutIndex,
  createProseStreamer,
  MAX_PROTOCOL_REPAIRS,
  PROTOCOL_REPAIR_INSTRUCTION,
} from './action-parser.js';

export interface GituConfig {
  cwd: string;
  llm: LlmClient;
  /** Read cache for provider evidence, remote state epochs, and retrieval-before-fetch. */
  providerCache?: ProviderReadCache;
  /** Universal capability registry across Native connections, MCP tools, and plugins. */
  universalRegistry?: UniversalCapabilityRegistry;
  /** Constrained model used exclusively for protocol repair calls. */
  protocolRepairLlm?: LlmClient;
  /** Shared code index to reuse (e.g. a watched one owned by the server). */
  index?: CodeIndex;
  mode?: 'agent' | 'fast' | 'standard' | 'chat';
  autoApprove?: boolean;
  /** Never auto-approve dangerous commands, even with autoApprove — the
   *  unattended-but-cautious middle ground. */
  safeMode?: boolean;
  approvalHandler?: ApprovalHandler;
  /** Generic capability-aware recovery before a task can become BLOCKED. */
  prerequisiteRecovery?: PrerequisiteRecoveryOptions;
  /** Host-owned secure connection form. The model only supplies a structured
   * prerequisite; it never receives a credential value. */
  connectionRequestHandler?: (prerequisite: MissingPrerequisite) => Promise<boolean>;
  /**
   * Host-side recovery routing decision for an exhausted prerequisite:
   * 'reauth' (positive auth failure — secure reauthorization), 
   * 'capability-resolution' (valid saved connection, missing operation — NEVER
   * prompt for a credential), or 'setup-new' (no saved connection yet).
   */
  connectionRecoveryCheck?: (prerequisite: MissingPrerequisite) => Promise<ConnectionRecoveryDecision> | ConnectionRecoveryDecision;
  /** User-saved connection metadata that is safe to provide after recovery. */
  connectionContext?: () => string;
  /** Executes only a registered, read-only provider operation. URLs and
   * authorization headers stay inside the host adapter. */
  connectionActionHandler?: (input: { connectionId: string; operationId: string }) => Promise<{ message: string; data?: unknown }>;
  /** Executes a multi-intent bounded discovery graph across a saved connection. */
  connectionDiscoveryHandler?: (request: DiscoveryRequest) => Promise<DiscoveryResult>;
  /** Selects the safest information-gathering action for the recovery
   * controller: a registered read-only operation, preferring the connection
   * named by the caller (usually the one that just failed). */
  safestProviderRead?: (preferredConnectionId?: string) => { connectionId: string; operationId: string } | undefined;
  /** Proposes one documented provider operation. The host validates it,
   * requests user approval for writes, then invokes only the approved entry. */
  connectionOperationHandler?: (input: ConnectionOperationProposal) => Promise<{ message: string; data?: unknown }>;
  criteria?: string[] | CriterionSpec[];
  requirePlanReview?: boolean;
  planReviewHandler?: PlanReviewHandler;
  askUserHandler?: AskUserHandler;
  scopeFiles?: string[];
  extraConstraints?: string[];
  effort?: 'low' | 'medium' | 'high' | 'max';
  /** Provider profile preference; `auto` starts native and safely downgrades. */
  actionProtocolMode?: 'auto' | 'native' | 'structured_text' | 'text';
  skills?: SkillStore;
  mcp?: McpManager;
  /** Host-owned saved connections exposed through metadata-only management tools. */
  connections?: ConnectionRegistry;
  browser?: BrowserBridge;
  /** Optional LSP intelligence layer. When omitted, one is created lazily for the repo. */
  lsp?: LspManager;
  /** Bootstrap trusted built-in language servers when the LSP layer is first used. */
  autoInstallLsp?: boolean;
  subagents?: SubAgentRunner;
  /** Registered specialist agents (name + role). Used by the risk planner to
   *  recommend a right-sized roster that actually exists in the registry. */
  specialists?: { name: string; role: string }[];
  agentsSection?: string;
  images?: { name: string; dataUrl: string }[];
  attachments?: ModelContextAttachment[];
  supportsImages?: boolean;
  /** Live context-window metadata for the selected provider/model. */
  contextWindowTokens?: number;
  /** Capability tier of the selected model — scales the TURN budget only
   *  (lower-capability models get more turns). The per-call reasoning effort
   *  at the provider stays a separate dial (config.effort / llmEffort). */
  modelCapability?: 'low' | 'standard' | 'high';
  /** Compaction thresholds — configurable instead of model-specific constants. */
  compaction?: { charBudget?: number; keepRecent?: number; triggerMessages?: number };
  /** Static-context budget for the unified buildModelContext gate (chars).
   *  Over-budget contexts trim the context pack, then oldest history. */
  contextBudget?: { maxChars?: number };
  /** Memory retrieval isolation (review Phase 3): who is asking. Scoped
   *  memories are filtered BEFORE ranking; the main agent typically has
   *  project+global visibility (no agentId → private agent memories of
   *  specialists are invisible to it too). */
  memoryRetrieval?: MemoryRetrievalContext;
  resume?: { taskId: string; message: string };
  /** Prior user/assistant turns for a resumed server session. */
  conversationHistory?: LlmMessage[];
  autoLearn?: boolean;
  onEvent?: (event: string) => void;
}

export type AskUserHandler = (questions: AskUserQuestion[]) => Promise<string>;

export interface PlanReviewInput {
  criteria: string[];
  steps: { description: string; verification: string }[];
}

export interface PlanReviewDecision {
  approved: boolean;
  note?: string;
  criteria?: string[];
  steps?: { description: string; verification: string }[];
}

export type PlanReviewHandler = (input: PlanReviewInput) => Promise<PlanReviewDecision>;

export interface GituRunResult {
  ledger: TaskLedger;
  report: CompletionReport;
}
/** @deprecated Use Gitu. Kept so existing integrations can upgrade safely. */
export { Gitu as Hermes };
/** @deprecated Use GituConfig. */
export type HermesConfig = GituConfig;
/** @deprecated Use GituRunResult. */
export type HermesRunResult = GituRunResult;

export {
  buildSpecialistHandoff,
  specialistHandoffTerms,
  specialistHandoffOverlap,
  synthesizeExecutableRecovery,
  parseMissingPrerequisite,
  connectionResultDisclosure,
  asksForResourceIdentifier,
  connectionEventReason,
  PROVIDER_TRUNCATED_GUIDANCE,
  type AskUserQuestion,
  type ExecutableRecoveryInput,
  collectQualityReviewDiff,
  isVerifiedDiffSnapshotCurrent,
  shouldRunFinalQualityReview,
  buildQualityReviewMessages,
  parseReviewVerdict,
  findLastScreenshotUrl,
  findLastBrowserEvidence,
  type QualityReviewInput,
  COMPACT_KEEP_RECENT,
  COMPACT_TRIGGER,
  COMPACT_CHAR_BUDGET,
  COMPACT_MIN_RECENT,
  COMPACT_RECENT_MESSAGE_MAX_CHARS,
  estimateMessageChars,
  KEEP_RECENT_SCREENSHOTS,
  stripStaleImages,
  shiftPrefixEndAfterCompaction,
  compactRecentMessage,
  extractFailureDigest,
  compactHistory,
  compactFollowUpConversation,
  type CompactionOptions,
  type PlanActionStep,
  PLAN_AREAS,
  parseArea,
  parseSubtasks,
  type ParsedAction,
  visibleActionSummary,
  parseAction,
  KNOWN_ACTION_TYPES,
  GITU_ACTION_TOOL,
  actionReplyFromTurn,
  parseReplyAction,
  braceBalance,
  type BadReplyKind,
  classifyBadReply,
  logParseFailure,
  ACTION_BRACE_RE,
  proseCutIndex,
  createProseStreamer,
  MAX_PROTOCOL_REPAIRS,
  PROTOCOL_REPAIR_INSTRUCTION,
};

export class Gitu {
  private readonly config: GituConfig;
  public readonly providerCache: ProviderReadCache;
  public readonly universalRegistry: UniversalCapabilityRegistry;
  private readonly emit: (event: string) => void;
  private readonly inbox: { text: string; attachmentContext?: string }[] = [];
  private aborted = false;
  private abortController?: AbortController;

  constructor(config: GituConfig) {
    this.config = config;
    this.providerCache = config.providerCache ?? new ProviderReadCache();
    this.universalRegistry = config.universalRegistry ?? new UniversalCapabilityRegistry();
    this.emit = config.onEvent ?? (() => {});
  }

  queueMessage(text: string, attachmentContext?: string): void {
    this.inbox.push({ text, attachmentContext });
  }

  stop(): void {
    this.aborted = true;
    this.abortController?.abort();
    // A delegate may currently be awaiting its own model response rather than
    // the parent agent's response. Propagate Stop to those workers too so a
    // foreground delegation cannot keep the task alive indefinitely.
    this.config.subagents?.stop('Parent task stopped by user.');
  }

  async run(goal: string): Promise<GituRunResult> {
    const { cwd } = this.config;
    // Dynamic auto-retry: network blips and provider outages delay the run
    // (with visible events) instead of failing it.
    const llm = resilientLlm(this.config.llm, {
      label: 'main agent',
      onRetry: ({ attempt, maxRetries, delayMs, error }) =>
        this.emit(`recover  ${error.message.slice(0, 120)} — retry ${attempt}/${maxRetries} in ${(delayMs / 1000).toFixed(1)}s`),
    });

    let guard: ProjectGuard;
    try {
      guard = ProjectGuard.detect(cwd);
    } catch (err) {
      if (err instanceof ProjectGuardError) throw err;
      throw err;
    }
    guard.persist();
    this.emit(
      `project  locked: ${guard.lock.name} @ ${guard.activeWritableRoot} (${guard.lock.branch ?? 'no branch'}) ` +
        `[repo=${guard.workspace.repositoryRoot}; worktree=${guard.workspace.worktreeRoot}; writable=${guard.workspace.writableRoot}]`,
    );

    const memory = MemoryStore.forProject(guard.lock.repoRoot);
    // A pattern can be encountered again when compaction replays the same
    // failure history (or when a session is continued). Keep the notice
    // idempotent without suppressing genuinely different patterns.
    const memoryPatternKey = (scope: string, claim: string): string =>
      `${scope}|${claim
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()}`;
    const announcedMemoryPatterns = new Set(memory.query({ type: 'pattern', scope: guard.lock.name }).map((entry) => memoryPatternKey(entry.scope, entry.claim)));
    let ledger: TaskLedger;
    let resumeNote: string | undefined;
    let resumedCompletedScope = false;
    if (this.config.resume) {
      const loaded = TaskLedger.load(guard.lock.repoRoot, this.config.resume.taskId);
      if (!loaded) {
        throw new ProjectGuardError(`Cannot resume: task not found: ${this.config.resume.taskId}`);
      }
      ledger = loaded;
      resumedCompletedScope = ledger.data.status === 'completed';
      // An explicit mode change from the caller (e.g. the UI's workflow
      // dropdown) switches this continuation to the newly chosen mode instead
      // of being locked into the mode the session was created with.
      if (this.config.mode && this.config.mode !== ledger.data.mode) {
        ledger.data.mode = this.config.mode;
        this.emit(`mode     switched to ${this.config.mode} for this continuation`);
      }
      // Keep approved plans from earlier completed work. A new user request
      // gets its own phase instead of forcing a review of the old task.
      ledger.data.blockers = [];
      ledger.data.completedAt = undefined;
      ledger.data.report = undefined;
      ledger.data.startedAt = undefined;
      resumeNote = this.config.resume.message;
      this.emit(`ledger   resumed: ${ledger.data.taskId}`);
      // Exempt already-accepted history from future staleness: criteria gated
      // complete under an earlier workspace stay complete through follow-up
      // phases. Git projects get this implicitly (checkpoint commits collapse
      // the fingerprint to a stable "clean" hash); here we opt those evidence
      // records out explicitly. Fresh evidence from THIS phase stays strict.
      try {
        const acceptedIds = new Set(ledger.data.acceptanceCriteria.filter((c) => c.satisfied).flatMap((c) => c.evidenceIds));
        let rebased = 0;
        for (const ev of ledger.data.evidence) {
          if (ev.passed && acceptedIds.has(ev.id) && ev.workspaceFingerprint !== undefined) {
            ev.workspaceFingerprint = undefined;
            ev.stale = false;
            rebased += 1;
          }
        }
        if (rebased > 0) {
          ledger.save();
          this.emit(`resume   ${rebased} accepted evidence record(s) exempted from staleness (prior completed phase)`);
        }
      } catch {
        /* diagnostics must never block a resume */
      }
    } else {
      ledger = TaskLedger.create({
        repoRoot: guard.lock.repoRoot,
        goal,
        project: guard.lock,
        mode: this.config.mode ?? 'standard',
      });
      if (this.config.extraConstraints && this.config.extraConstraints.length > 0) {
        ledger.data.constraints = [...ledger.data.constraints, ...this.config.extraConstraints];
      }
      this.emit(`ledger   created: ${ledger.data.taskId}`);
    }

    // Milestone 3/4: Restore ProviderReadCache from durable ledger state
    if (ledger.data.providerEvidence || ledger.data.remoteStateEpochs) {
      this.providerCache.restore({
        evidence: ledger.data.providerEvidence,
        epochs: ledger.data.remoteStateEpochs,
      });
    }

    const checkpoints = new CheckpointManager(guard);
    const branchInfo = checkpoints.ensureTaskBranch(ledger.data.taskId);
    if (branchInfo.branch) {
      ledger.data.gitBranch = branchInfo.branch;
      ledger.save();
    }
    this.emit(`branch   ${branchInfo.message}`);

    // Follow-up work must not overwrite or re-review a completed task. Phase
    // boundaries retain the history but give the new request a clean baseline
    // for planning, context selection, verification, and reporting.
    const phaseBaseRef = (await gitExec(guard.activeWritableRoot, ['rev-parse', 'HEAD']).catch(() => '')).trim() || undefined;
    let activeWorkPhase = ledger.ensureInitialWorkPhase(ledger.data.goal, phaseBaseRef);
    if (resumedCompletedScope) {
      ledger.completeActiveWorkPhase();
      activeWorkPhase = ledger.startWorkPhase({
        kind: 'follow_up',
        goal: resumeNote ?? goal,
        baseRef: phaseBaseRef,
      });
      this.emit(`phase    follow-up started — prior work preserved; new scope: ${activeWorkPhase.goal.slice(0, 160)}`);
    }
    const isFollowUpPhase = activeWorkPhase.kind === 'follow_up';
    const activeGoal = isFollowUpPhase ? activeWorkPhase.goal : goal;
    const agentWorkflow = ledger.data.mode === 'agent';
    const agentBaselineFingerprint = agentWorkflow ? await getWorkspaceFingerprint(guard.activeWritableRoot) : '';
    let temporaryPlanPending = agentWorkflow && Boolean(this.config.requirePlanReview);

    // Investigation depth is computed ONCE at intake from the goal plus the
    // Task Authority target hints, and recorded in the ledger. Escalation is
    // explicit and evidence-driven — one ladder level at a time.
    const investigationDepth = determineInvestigationDepth(activeGoal, ledger.data.taskAuthority?.targetHints);
    ledger.setInvestigationDepth(investigationDepth);
    this.emit(`depth    investigation depth: ${investigationDepth}${investigationDepth === 'direct' ? ' — targeted context fast path active' : ''}`);

    // Durable visual-reference rehydration: active user-reference images
    // persisted under .hermes/task-assets/ ride along on every run — newly
    // attached images and rehydrated durable ones are merged. A missing or
    // corrupt asset is marked unavailable and surfaced to the model, never
    // silently dropped.
    const rehydratedVisuals = rehydrateVisualReferences(ledger, guard.lock.repoRoot);
    if (rehydratedVisuals.unavailable.length > 0) {
      markUnavailableVisualReferences(ledger, rehydratedVisuals.unavailable);
      this.emit(`visual-ref ${rehydratedVisuals.unavailable.length} durable visual reference(s) unavailable: ${rehydratedVisuals.unavailable.map((u) => `${u.path} (${u.reason})`).join('; ')}`);
    }
    const effectiveImages = [...rehydratedVisuals.images, ...(this.config.images ?? [])];
    if (rehydratedVisuals.images.length > 0) {
      this.emit(`images   rehydrated ${rehydratedVisuals.images.length} durable visual reference(s) from .hermes/task-assets/${ledger.data.taskId}/`);
    }

    const durableVisualRefs = persistVisualAssets(this.config.images ?? [], ledger, guard.lock.repoRoot, this.emit);
    applyFollowUpToLedger(
      ledger,
      activeGoal,
      Boolean(durableVisualRefs.length || this.config.images?.length),
      durableVisualRefs,
    );

    const policy = new PolicyEngine(this.config.autoApprove ?? false, this.config.approvalHandler, this.config.safeMode ?? false);
    const prerequisiteResolver = new CapabilityAwareResolver(this.config.prerequisiteRecovery);
    // Preserve the v0.2.1 execution contract: successful reads remain valid
    // progress for the orchestrator's dynamic budget. Repeated failing calls
    // are still bounded by LoopDetector; successful investigation is governed
    // by the turn budget and compaction instead of being fatal after 2 reads.
    const loopDetector = new LoopDetector({
      maxSameSuccessfulRead: Number.MAX_SAFE_INTEGER,
      maxInvestigationReadsPerFailureEpisode: Number.MAX_SAFE_INTEGER,
    });
    const evidence = new EvidenceEngine();
    const skills = this.config.skills ?? SkillStore.forProject(guard.lock.repoRoot);
    const lsp =
      this.config.lsp ??
      new LspManager(guard.lock.repoRoot, undefined, {
        autoInstall: this.config.autoInstallLsp === true,
        onEvent: this.emit,
      });
    const executor = new Executor(
      guard,
      ledger,
      policy,
      loopDetector,
      this.emit,
      skills,
      this.config.mcp,
      this.config.browser,
      lsp,
      this.config.subagents ? (specs) => this.config.subagents!.runMany(specs) : undefined,
      this.config.subagents ? (specs) => this.config.subagents!.startMany(specs) : undefined,
      this.config.subagents ? (ids) => this.config.subagents!.status(ids) : undefined,
      // A connection can be securely saved after the executor is created.
      // Supply its capabilities at action time so its generated skill alias is
      // accepted immediately, while the host remains the sole authority that
      // can grant those capabilities.
      () => prerequisiteResolver.capabilities().map((capability) => capability.id),
      this.config.connections,
    );
    // The server owns and reuses its index. A direct Gitu run owns the index
    // it creates, so it must close it even when the run exits early or fails.
    // Leaking this native SQLite handle kept a single-fork Vitest worker alive
    // after the suite had finished.
    const ownedIndex = this.config.index ? undefined : new CodeIndex(guard.lock.repoRoot);
    const context = new ContextEngine(guard, this.config.index ?? ownedIndex);
    const reporter = new Reporter();

    try {
      const userCriteriaProvided = Boolean(this.config.criteria && this.config.criteria.length > 0);
      if (userCriteriaProvided) {
        const raw = this.config.criteria!;
        const hasSpecs = raw.some((c) => typeof c === 'object');
        if (isFollowUpPhase && hasSpecs) {
          const specs = EvidenceEngine.normalizeCriteria(raw as (string | CriterionSpec)[]);
          ledger.appendCriteriaFromSpecs(specs);
        } else if (isFollowUpPhase) {
          ledger.appendCriteria(raw as string[]);
        } else if (hasSpecs) {
          const specs = EvidenceEngine.normalizeCriteria(raw as (string | CriterionSpec)[]);
          ledger.setCriteriaFromSpecs(specs);
        } else {
          ledger.setCriteria(raw as string[]);
        }
        this.emit(`criteria ${isFollowUpPhase ? 'added for follow-up' : 'provided by user'} (${raw.length})`);
      }

      // Discovery stays metadata-only. Loading a full procedure happens only
      // after selection/explicit use_skill, never for the whole installed set.
      const skillContext = {
        task: activeGoal,
        repositorySignals: guard.lock.techStack,
        activeSkills: ledger.data.activeSkills,
        priorUsedSkills: ledger.data.usedSkills,
        availableTools: [...KNOWN_TOOL_NAMES, ...(this.config.browser ? ['browser', 'screenshot'] : [])],
        availableCapabilities: prerequisiteResolver.capabilities().map((capability) => capability.id),
      };
      const skillResolution = skills.resolver().resolve(activeGoal, skillContext);
      for (const match of skillResolution.allMatches.slice(0, 12)) {
        ledger.recordSkillEvent({
          stage: 'discovered',
          name: match.skill.name,
          version: String(match.skill.version ?? '1'),
          scope: match.skill.scope,
          selectionScore: match.score,
          reason: match.reason,
        });
      }
      const activeSkills = new Set(ledger.data.activeSkills ?? []);
      const identities = new Map<string, SkillIdentity>();
      const savedIdentities = new Map((ledger.data.selectedSkills ?? []).map((identity) => [identity.name.toLowerCase(), identity]));
      for (const name of [...activeSkills]) {
        const current = skills.identity(name);
        const saved = savedIdentities.get(name.toLowerCase());
        if (saved && (!current || current.version !== saved.version || current.contentHash !== saved.contentHash || current.scope !== saved.scope)) {
          activeSkills.delete(name);
          ledger.recordSkillEvent({
            stage: 'rejected',
            name: saved.name,
            version: saved.version,
            contentHash: saved.contentHash,
            scope: saved.scope,
            failureCode: current ? 'SKILL_STATE_CHANGED' : 'SKILL_STATE_MISSING',
            reason: 'Persisted active skill identity no longer matches; it was not silently substituted.',
          });
          this.emit(`skill    ${current ? 'SKILL_STATE_CHANGED' : 'SKILL_STATE_MISSING'} — "${saved.name}" requires explicit recovery`);
        } else if (current) {
          identities.set(current.name.toLowerCase(), current);
        }
      }
      for (const match of skillResolution.highConfidence) {
        // Built-in investigation strategies remain owned by the existing
        // LSP-first gate below. The generic selector must not bypass that gate
        // merely because a bug-fix goal shares their descriptive keywords.
        if (match.scope === 'builtin' && match.name.startsWith('strategy-')) continue;
        if (activeSkills.size >= 6 || activeSkills.has(match.name)) continue;
        const activation = skills.activate(match.name, skillContext);
        if (!activation.ok || !activation.skill || !activation.identity) {
          ledger.recordSkillEvent({
            stage: 'rejected',
            name: match.name,
            version: String(match.version ?? '1'),
            scope: match.scope,
            selectionScore: skillResolution.allMatches.find((item) => item.skill.name === match.name)?.score,
            failureCode: activation.code,
            reason: activation.message,
          });
          this.emit(`skill    ${activation.code ?? 'rejected'} — "${match.name}" not activated`);
          continue;
        }
        activeSkills.add(activation.skill.name);
        identities.set(activation.identity.name.toLowerCase(), activation.identity);
        ledger.recordSkillEvent({
          stage: 'selected',
          name: activation.identity.name,
          version: activation.identity.version,
          contentHash: activation.identity.contentHash,
          scope: activation.identity.scope,
          selectionScore: skillResolution.allMatches.find((item) => item.skill.name === match.name)?.score,
          reason: 'contextual high-confidence selection',
          loadChars: activation.skill.instructions.length,
        });
        this.emit(`skill    auto-activated high-confidence skill "${activation.identity.name}" (${activation.skill.description})`);
      }
      // The frontend quality bar is a real active skill, not merely a large
      // system-prompt appendix. This gives it a durable contract every turn and
      // lets the full procedure be reloaded after compaction.
      if (isFrontendGoal(activeGoal)) {
        const frontendSkill = skills.get('frontend-quality-bar');
        if (frontendSkill && !activeSkills.has(frontendSkill.name) && activeSkills.size < 6) {
          const activation = skills.activate(frontendSkill.name, skillContext);
          if (activation.ok && activation.identity) {
            activeSkills.add(frontendSkill.name);
            identities.set(activation.identity.name.toLowerCase(), activation.identity);
            ledger.recordSkillEvent({
              stage: 'selected',
              name: activation.identity.name,
              version: activation.identity.version,
              contentHash: activation.identity.contentHash,
              scope: activation.identity.scope,
              reason: 'frontend task quality bar',
              loadChars: activation.skill?.instructions.length,
            });
            this.emit(`skill    selected frontend-quality-bar for UI task`);
          }
        }
      }
      ledger.setSelectedSkills([...identities.values()].filter((identity) => activeSkills.has(identity.name)));

      const effortPlan = planEffort(activeGoal, {
        scopeFiles: this.config.scopeFiles,
        criteriaCount: isFollowUpPhase
          ? ledger.data.acceptanceCriteria.filter((criterion) => !activeWorkPhase.priorCriterionIds.includes(criterion.id)).length
          : ledger.data.acceptanceCriteria.length,
        mode: ledger.data.mode,
        explicitEffort: this.config.effort,
        contextWindowTokens: this.config.contextWindowTokens,
        modelCapability: this.config.modelCapability,
      });
      ledger.data.effortPlan = effortPlan;
      ledger.save();

      const riskPlan = planRisk(activeGoal, {
        complexity: effortPlan.complexity,
        specialists: this.config.specialists,
        maxSpecialists: effortPlan.maxSpecialists,
      });
      ledger.data.riskPlan = riskPlan;
      ledger.save();
      this.emit(
        `risk    ${riskPlan.risk} - ${riskPlan.reason}${
          riskPlan.recommendedSpecialists.length > 0 ? ` (relevant specialists: ${riskPlan.recommendedSpecialists.map((r) => r.agent).join(', ')})` : ' (no specialists needed)'
        }`,
      );
      this.emit(
        `effort   ${effortPlan.complexity} — ${effortPlan.reason} (budget: ${effortPlan.maxTurns} turns, ${effortPlan.maxSpecialists} specialists, ${effortPlan.contextBudget.maxBytes} bytes context${effortPlan.requireReview ? ', review required' : ''})`,
      );

      // Every active skill carries a small contract each turn. Full procedures
      // are delivered on activation and re-delivered after compaction, so they
      // stay recoverable without paying their full token cost forever.
      const deliveredSkillVersions = new Map<string, string>();
      const activeSkillsSection = (): string | undefined => {
        const names = ledger.data.activeSkills ?? [];
        if (names.length === 0) return undefined;
        // A task with an accidentally broad activation set must not turn skills
        // into a giant hidden prompt. The complete active set remains durable in
        // the ledger and can be inspected through list_skills.
        const visibleNames = names.slice(0, isFollowUpPhase ? 3 : 6);
        let loadedChars = 0;
        const parts = visibleNames.map((name) => {
          const s = skills.get(name);
          if (!s) return `✓ ${name}`;
          const version = s.contentHash ?? s.instructions;
          const contract = renderSkillContract(s);
          if (deliveredSkillVersions.get(s.name) === version) return contract;
          deliveredSkillVersions.set(s.name, version);
          const remaining = Math.max(0, (isFollowUpPhase ? 6_000 : 24_000) - loadedChars);
          const body = s.instructions.slice(0, remaining);
          loadedChars += body.length;
          return `${contract}\n  ACTIVE SKILL ${s.name}@${String(s.version ?? '1')}\n  Full instructions (loaded now):\n  ${body}${body.length < s.instructions.length ? '\n  [instruction body clipped by task skill-context limit]' : ''}`;
        });
        if (names.length > visibleNames.length) {
          parts.push(`… ${names.length - visibleNames.length} additional active skill(s) are recorded in the task ledger; use list_skills to inspect or reload one.`);
        }
        return parts.join('\n\n');
      };
      const reloadActiveSkillInstructions = (): void => deliveredSkillVersions.clear();

      let contextNote = '';
      if (ledger.data.mode === 'standard' || agentWorkflow) {
        // A completed task already has its durable ledger and plan. Retrieve
        // only enough source to address the new request instead of re-sending a
        // broad project pack to every follow-up turn.
        const contextBudget = isFollowUpPhase
          ? {
              maxFiles: Math.min(4, effortPlan.contextBudget.maxFiles),
              maxBytes: Math.min(12_000, effortPlan.contextBudget.maxBytes),
            }
          : effortPlan.contextBudget;
        // Incremental SEMANTIC memory consolidation (review semantic phase):
        // runs ONCE per intake, never per model call. Embeddings find
        // candidates; only strong duplicates merge; possible duplicates and
        // possible contradictions are flagged (advisory). Embedding failure
        // degrades silently to the lexical path.
        try {
          memory.setEmbedder(resolveEmbedder());
          const consolidation = await memory.consolidateSemantic({ scope: guard.lock.name, maxPool: 40 });
          if (consolidation.merged.length > 0) {
            this.emit(`memory   semantic consolidation merged ${consolidation.merged.length} duplicate group(s)`);
          }
          for (const flag of consolidation.flagged.filter((f) => f.relationship === 'possible-contradiction').slice(0, 3)) {
            this.emit(`memory   possible contradiction flagged (${flag.relationship}, score ${flag.hybrid.toFixed(2)}) — advisory, needs evaluation`);
          }
        } catch {
          /* consolidation is advisory — memory keeps working without it */
        }
        // Retrieval sees the criteria and their pinned verification commands,
        // not just the one-line goal — they name concrete APIs/files the goal
        // wording often omits.
        const retrievalTexts = [...ledger.data.acceptanceCriteria.map((c) => c.text), ...ledger.data.acceptanceCriteria.map((c) => c.verification ?? '')].filter(Boolean);
        // Hybrid retrieval: lexical/IDF + embedding cosine when an embeddings
        // endpoint is configured; silent fallback otherwise. DIRECT-depth
        // tasks with concrete file hints skip repository-wide scoring entirely:
        // the targeted pack reads the hinted file(s) plus their nearest test.
        const hintFiles = ledger.data.taskAuthority?.targetHints.files ?? [];
        let pack: import('../types.js').ContextPack | undefined;
        let semantic = false;
        if (investigationDepth === 'direct' && hintFiles.length > 0) {
          pack = context.buildTargetedPack(activeGoal, hintFiles, contextBudget);
          if (pack) {
            this.emit(
              `context  targeted fast path: reading ${pack.primaryFiles.length} hinted target file(s)` +
                `${pack.testFiles.length ? ` + ${pack.testFiles.length} nearest test` : ''} — repository-wide scoring skipped`,
            );
          }
        }
        if (!pack) {
          const hybrid = await context.buildPackHybrid(activeGoal, contextBudget, retrievalTexts, resolveEmbedder());
          pack = hybrid.pack;
          semantic = hybrid.semantic;
        }
        if (semantic) this.emit('context  semantic retrieval active (embeddings + lexical blend)');
        ledger.data.contextPack = pack;
        contextNote = `CONTEXT PACK (ranked, role-labeled, budgeted):\n${context.renderPackWithContent(pack)}`;
        this.emit(
          `context  ${pack.primaryFiles.length} primary, ${pack.testFiles.length} test files selected ` +
            `(${this.config.contextWindowTokens ? `${this.config.contextWindowTokens} token model window; ` : ''}${pack.budget.maxBytes} character source budget)`,
        );
      }

      // Ranked long-term memory retrieval (review Phase 8/9): budgeted,
      // verification-preferring candidates for THIS goal. Injection happens
      // exclusively through buildModelContext — retrieval never touches the
      // model request directly.
      const memoryEntries = memory.retrieveForContext(activeGoal, guard.lock.name, {
        limit: isFollowUpPhase ? 4 : 8,
        maxChars: isFollowUpPhase ? 1_000 : 2_000,
        ctx: this.config.memoryRetrieval,
      });
      if (memoryEntries.length > 0) {
        const byScope: Record<string, number> = {};
        for (const m of memoryEntries) {
          const v = m.visibility ?? 'project';
          byScope[v] = (byScope[v] ?? 0) + 1;
        }
        this.emit(
          `memory   retrieved ${memoryEntries.length} scoped memory(ies) — ${Object.entries(byScope)
            .map(([k, n]) => `${k}=${n}`)
            .join(' ')}`,
        );
      }
      const memorySection = (() => {
        if (memoryEntries.length === 0) return undefined;
        const isFailureLesson = (m: (typeof memoryEntries)[number]) => m.type === 'failure' || (m.type === 'pattern' && /repeated failure/i.test(m.claim));
        const background = memoryEntries.filter((m) => !isFailureLesson(m));
        const lessons = memoryEntries.filter(isFailureLesson);
        const lines: string[] = [];
        if (background.length) {
          lines.push('RELEVANT MEMORY (ranked; verified knowledge first — superseded entries excluded):');
          lines.push(...background.map((m) => `- [${m.type}${m.status ? `/${m.status}` : ''}] ${m.claim}`));
        }
        if (lessons.length) {
          lines.push('PRE-FLIGHT FAILURE LESSONS (before repeating any action listed below, verify the known failure cause has been resolved; if resolved you may safely retry):');
          for (const m of lessons) {
            lines.push(`- [${m.type}${m.status ? `/${m.status}` : ''}] ${m.claim}`);
            lines.push('  → Confirm the failure condition above is fixed BEFORE repeating the action; otherwise choose a different verification path.');
          }
        }
        return lines.join('\n');
      })();
      // Tier 1 protected/active memory (review two-tier model): durable guidance
      // — decisions, constraints, conventions, pinned + critical failure lessons
      // — surfaced regardless of lexical relevance to the goal, and re-injected
      // after every compaction so it never silently disappears under pressure.
      const protectedSection = memory.renderProtected(guard.lock.name, 12, this.config.memoryRetrieval);

      const systemPrompt = buildSystemPrompt(guard, memory, {
        scopeFiles: this.config.scopeFiles,
        extraConstraints: this.config.extraConstraints,
        // Ranked memory retrieval: memories relevant to THIS goal surface
        // first (relevance + scope + confidence + recency + usage).
        memorySection,
        protectedSection,
        skillsSection: skills.renderForPrompt(ledger.data.activeSkills),
        agentsSection: this.config.agentsSection,
        mcpSection: this.config.mcp
          ? this.config.mcp
              .servers()
              .map((s) => `- mcp server "${s.name}" (${s.command})`)
              .join('\n') || undefined
          : undefined,
        lspSection: lsp.hasServers()
          ? lsp
              .status()
              .filter((s) => s.configured)
              .map((s) => `- ${s.server} server → lsp tools for: ${s.languageIds.join(', ')}`)
              .join('\n')
          : undefined,
        vision: this.config.supportsImages ?? false,
        hasBrowser: this.config.browser ? this.config.browser.available() : false,
        autoLearn: this.config.autoLearn ?? true,
        uiTask: isFrontendGoal(activeGoal),
        agentWorkflow,
        planRequested: temporaryPlanPending,
        // Keep only the quality bar's non-negotiable contract in the stable
        // system prefix. Its full procedure is supplied by the active-skill
        // state block on activation and after every compaction.
        uiQualityContract: skills.get('frontend-quality-bar') ? renderSkillContract(skills.get('frontend-quality-bar')!, 440) : undefined,
      });
      // Strategy CONTENT comes from the skill layer (shadowable); the
      // classify-and-inject mechanism stays here in core.
      const strategySection = ledger.data.mode !== 'chat' && !(agentWorkflow && effortPlan.complexity === 'low') ? buildTaskStrategySection(activeGoal, lsp.hasServers(), skills) : undefined;
      const followUpSection =
        resumeNote && ledger.data.mode !== 'chat'
          ? isFollowUpPhase
            ? `ACTIVE FOLLOW-UP WORK PHASE — user request:\n"${activeGoal}"\n` +
              `The earlier phase is complete and preserved. Work ONLY on this new request. Do not reread, re-plan, or re-verify the old phase unless this request changes one of its files or contracts. ${agentWorkflow ? 'Formal criteria and plans remain optional; quick edits can proceed directly.' : 'Add only the needed criteria and append only the needed plan steps.'} ` +
              `Only when this is purely a comment, thanks, opinion, or question with no request to continue work may you answer directly with the detail needed to address it and end with {"type":"complete","summary":"<your complete conversational reply>","chat":true}.`
            : `ACTIVE CONTINUATION — the user wrote:\n"${resumeNote}"\n` +
              `The task is unfinished. Continue from the durable ledger and take the next useful action; do not restart discovery or planning unless the evidence requires it. ` +
              `Only when this is purely a comment, thanks, opinion, or question with no request to continue work may you answer directly with the detail needed to address it and end with {"type":"complete","summary":"<your complete conversational reply>","chat":true}.`
          : undefined;
      // Unified context authority: EVERYTHING that reaches the model before
      // the per-turn loop is assembled by buildModelContext — one priority
      // order, one budget, visible trims. Subsystems contribute content; they
      // no longer push model context around this gate.
      // Static startup context is bounded by the task effort. The model still
      // gets a focused source pack, while lower-effort work no longer inherits
      // the old 60K-character default unnecessarily.
      const defaultModelContextBudget = this.config.contextBudget ?? {
        maxChars: Math.max(28_000, Math.min(48_000, effortPlan.contextBudget.maxBytes + 12_000)),
      };
      const modelContextBudget = isFollowUpPhase ? { maxChars: Math.min(26_000, defaultModelContextBudget.maxChars ?? 26_000) } : defaultModelContextBudget;
      const assembled = buildModelContext({
        system: systemPrompt,
        strategy: strategySection,
        memory: memorySection,
        protectedMemory: protectedSection,
        contextPack: contextNote || undefined,
        conversationHistory: isFollowUpPhase ? compactFollowUpConversation(this.config.conversationHistory) : this.config.conversationHistory,
        images: effectiveImages,
        attachments: this.config.attachments,
        supportsImages: this.config.supportsImages,
        followUp: followUpSection,
        budget: modelContextBudget,
        onTrim: (info) => this.emit(`context  trimmed ${info.section} (-${info.charsRemoved} chars) to fit the model window`),
      });
      for (const trim of assembled.trims) {
        this.emit(`context  ${trim.section} trimmed (-${trim.charsRemoved} chars) to fit the model window`);
      }
      if (assembled.imagesAttached > 0) this.emit(`images   ${assembled.imagesAttached} user image(s) attached`);
      if (assembled.imagesSkipped) this.emit('images   skipped — model does not support images');
      const messages = assembled.messages;

      if (resumeNote && ledger.data.mode !== 'chat' && ledger.data.acceptanceCriteria.length > 0 && ledger.data.acceptanceCriteria.every((criterion) => criterion.satisfied)) {
        messages.push({
          role: 'user',
          content:
            agentWorkflow ? 'Earlier work is preserved. Address and verify only the new request. Formal criteria and plans are optional for quick edits.' : 'The earlier scope is complete and preserved. Work only on the active follow-up request: add only new criteria, append only new plan steps, and verify only the new delta unless it changes prior behavior.',
        });
      }

      // Provider-resource verification rules ride with the connection list so
      // the model verifies through the provider's own reads from turn one:
      // DNS/port probes against internal identifiers and premature BLOCKED
      // declarations were the failure modes of real provider deployments.
      const providerContext = ledger.data.mode === 'chat' ? undefined : this.config.connectionContext?.();
      if (providerContext) {
        messages.push({
          role: 'user',
          content:
            'PROVIDER RESOURCE VERIFICATION RULES (apply whenever the task touches a resource managed by a saved connection):\n' +
            '- Verify provider-managed resources through the REGISTERED READ OPERATIONS (read back actual state) — not through DNS, ping, or port probes.\n' +
            '- Every verification has SEMANTIC PRECONDITIONS. Before treating a failed check as proof of failure, ask: where is this hostname/port SUPPOSED to resolve, from which machine, on which network? A provider resource identifier (UUID or internal hostname) is not a public DNS name — probing it from the host machine is an invalid test, not a failed deployment.\n' +
            '- Probe public endpoints (DNS, database ports like 5432, HTTP) ONLY when the architecture explicitly exposes the resource externally; internal app-to-database traffic runs on the provider private network.\n' +
            '- Keep criteria SEPARATE: (a) resource exists and is running — proven by provider read-back; (b) migration/configuration succeeded — proven by that application own command or logs. Never satisfy one of them with the other evidence.\n' +
            '- One failed verification method does NOT block the task: switch to a different valid verification path (provider read-back, provider logs, application health) before declaring anything blocked.\n' +
            `REGISTERED SAVED CONNECTIONS (metadata only):\n${providerContext}`,
        });
      }

      if (ledger.data.mode === 'chat') {
        ledger.setStatus('executing');
        this.emit('think  composing answer');
        messages.push({
          role: 'user',
          content: `User request (chat mode — answer directly and helpfully in plain text only; no tools, no JSON): ${activeGoal}`,
        });
        const reply = await llm.completeStream(
          messages,
          {
            effort: effortPlan.llmEffort ?? this.config.effort,
            onActivity: (activity: LlmActivityEvent) => {
              if (activity.type === 'reasoning') this.emit('activity reasoning');
              else if (activity.type === 'content') this.emit('activity content');
            },
          },
          createProseStreamer((chunk) => this.emit(`tdelta ${chunk}`)),
        );
        const parsedReply = parseReplyAction(reply);
        const cutAt = proseCutIndex(reply);
        const prose = (parsedReply && cutAt >= 0 ? reply.slice(0, cutAt) : reply).trim();
        if (prose) this.emit(`say ${prose}`);
        ledger.setStatus('completed');
        ledger.completeActiveWorkPhase();
        const report = reporter.build(
          ledger,
          'complete',
          {
            summary: prose || 'Answered.',
            risks: [],
            followUps: [],
          },
          await getWorkspaceFingerprint(guard.activeWritableRoot),
          {
            goal: activeGoal,
            phase: { id: activeWorkPhase.id, kind: activeWorkPhase.kind, startedAt: activeWorkPhase.startedAt },
            evidenceStartIndex: activeWorkPhase.evidenceStartIndex,
            actionStartIndex: activeWorkPhase.actionStartIndex,
            criterionIds: ledger.data.acceptanceCriteria.filter((criterion) => !activeWorkPhase.priorCriterionIds.includes(criterion.id)).map((criterion) => criterion.id),
          },
        );
        ledger.data.report = report;
        ledger.save();
        this.emit('done     completed — chat answer delivered');
        return { ledger, report };
      }

      ledger.setStatus('planning');

      // Token telemetry: attribute every call's input to its source so token
      // spend can be diagnosed. Everything pushed so far (system prompt,
      // strategy, context pack, resumed conversation, user images) forms the
      // byte-stable prefix that providers can prefix-cache across turns.
      const telemetry = new RunTelemetry();
      let prefixEnd = messages.length;
      if (ledger.data.contextPack) {
        telemetry.filesInContextPack =
          ledger.data.contextPack.primaryFiles.length +
          ledger.data.contextPack.testFiles.length +
          ledger.data.contextPack.relatedFiles.length +
          ledger.data.contextPack.configFiles.length;
      }
      // Explicit technology requirements bound this whole run: decisions and
      // their audits are checked against them.
      const explicitTech = detectExplicitTechnologies([activeGoal, ...ledger.data.acceptanceCriteria.map((c) => c.text), ...ledger.data.constraints]);

      // This counter belongs only to the main execution lane. Specialists have
      // their own trackers, so a weak reviewer cannot trip the parent breaker.
      let invalidStreak = 0;
      // Set when the rejected reply was an EMPTY turn that still carried a
      // reasoning trace: the thinking phase consumed the whole output budget.
      // Recovery advice differs from generic malformed replies (provider-neutral:
      // any model that reports reasoning_content/reasoning).
      let thinkingOnlyNoAction = false;
      // One adaptive recovery per run for a reasoning-only empty turn (see ask()).
      let thinkingRecoveryUsed = false;
      // The most recent refused/unconfirmed provider write, preserved verbatim
      // (bounded): the anti-loop recovery controller hands it back to the model
      // so a reasoning-only spiral still converts into a concrete fix.
      let lastProviderRejection: { text: string; connectionId: string } | undefined;
      // The recovery controller may execute ONE safe provider read itself
      // (reasoning-only #2) so the next turn reasons over fresh facts.
      let recoveryReadExecuted = false;
      // Constrained protocol-repair budget (see MAX_PROTOCOL_REPAIRS).
      let protocolRepairsUsed = 0;
      // Set when a reply arrives without an executable action: the very next
      // observe() forces a compaction pass (long context correlates with
      // protocol drift), regardless of the normal compaction triggers.
      let driftCompactionRequested = false;
      let loopBlocks = 0;
      interface ConnectionCallRecord {
        consecutiveCalls: number;
        consecutiveFailures: number;
        lastDataDigest?: string;
        lastProgressAt: { evidence: number; files: number; actions: number };
      }
      const connectionCallTracker = new Map<string, ConnectionCallRecord>();
      const connectionOperationAttempts = new Map<string, number>();
      let lastExecutedActionTag: string | undefined;
      // Capability-resolution must be followed by a concrete action; a model
      // that re-requests the same missing capability instead of proposing the
      // documented operation gets blocked rather than looping forever.
      const capabilityResolutionNotes = new Map<string, number>();
      // Resource-id questions are held once while provider discovery is
      // available, so the model tries narrower reads before asking the user.
      const heldResourceIdQuestions = new Map<string, number>();
      // A successful provider read proves the connection works; allow the
      // reasoning-only recovery to fire again after real progress instead of
      // once per entire run.
      let concreteActionSinceLastAsk = false;      let followUpCriteriaAdded = false;
      let followUpPlanReviewHandled = false;
      let architectureAuditRejections = 0;
      let planningNudged = false;
      const malformed = new MalformedCallTracker({ remindAt: 1, escalateAt: 2, haltAt: 3 });
      let actionLaneHalted = false;
      let logicalRequestSequence = 0;
      let actionProtocolMode: 'native' | 'structured_text' | 'text' =
        this.config.actionProtocolMode === 'structured_text' || this.config.actionProtocolMode === 'text' ? this.config.actionProtocolMode : 'native';
      const actionsAtStart = ledger.data.actions.length;
      let conversationControl = conversationIntent(resumeNote ?? activeGoal);
      let preservePausedWork = Boolean(conversationControl && this.config.resume && !resumedCompletedScope);
      let conversationCompleted = false;
      let exitReason: 'complete' | 'blocked' | 'stalled' = 'stalled';
      let completionInput: { summary: string; risks: string[]; followUps: string[] } | undefined;

      // Adaptive effort enforcement (P1 — effort planner): the plan sets a turn
      // budget and a specialist budget. The turn budget is DYNAMIC: it extends
      // itself whenever the run keeps producing verified progress (evidence,
      // satisfied criteria, completed steps, changed files) and only stalls when
      // turns are being spent without any of those moving.
      const effortMaxTurns = effortPlan?.maxTurns ?? Number.MAX_SAFE_INTEGER;
      let effortMaxSpecialists = effortPlan?.maxSpecialists ?? Number.MAX_SAFE_INTEGER;
      const BUDGET_EXTENSIONS_MAX = 4;
      const budgetExtensionTurns = Number.isFinite(effortMaxTurns) ? Math.max(10, Math.ceil(effortMaxTurns / 2)) : 0;
      let budgetCap = effortMaxTurns;
      let budgetExtensions = 0;
      const progressSnapshot = (): { evidence: number; satisfied: number; files: number; todos: number; browses: number; distinctOk: number } => ({
        evidence: ledger.data.evidence.length,
        satisfied: ledger.data.acceptanceCriteria.filter((c) => c.satisfied).length,
        files: ledger.data.filesChanged?.length ?? 0,
        // Checked todos are real execution progress — they let fine-grained
        // breakdowns keep the dynamic budget alive without new evidence records.
        todos: ledger.data.plan.reduce((n, s) => n + (s.subtasks?.filter((t) => t.done).length ?? 0), 0),
        // Visual-verification turns are real progress on UI work: screenshot /
        // click-through inspection produces no new commands or diffs, but a run
        // that is actively LOOKING at what it built must not be killed mid-QA.
        browses: ledger.data.actions.filter((a) => a.tool === 'browse' && a.status === 'success').length,
        // Distinct successful actions = genuinely new work (a repeated identical
        // call does not grow the set). Diagnosis/reading turns used to register
        // ZERO progress and stalled runs that were actively making new attempts.
        distinctOk: new Set(ledger.data.actions.filter((a) => a.status === 'success').map((a) => a.paramsHash)).size,
      });
      let lastProgress = progressSnapshot();
      let turns = 0;
      let budgetWarned = false;
      let delegateSlotsUsed = 0;
      let visualGateRejections = 0;
      let instructionGateRejections = 0;
      let qualityReviewRejections = 0;
      let completionAttempts = 0;
      let specialistOrVerificationUncertain = false;
      // A strict-risk task (security, payments, or data integrity) must not
      // silently complete after the reviewer has exhausted its automatic repair
      // rounds. Keep the last concrete concern for an explicit release decision.
      let unresolvedQualityReview: string | undefined;
      let unresolvedQualityReviewFingerprint: string | undefined;
      let bugRigorRejections = 0;
      let planReconcileRejections = 0;
      const isBugTask = classifyTaskKind(activeGoal) === 'bug-fix';
      const effortNote = buildPlanNote(effortPlan, riskPlan);
      const activePhaseStateScope = () => ({
        goal: activeGoal,
        criterionIds: ledger.data.acceptanceCriteria.filter((criterion) => !activeWorkPhase.priorCriterionIds.includes(criterion.id)).map((criterion) => criterion.id),
        planStepIds: ledger.data.plan.filter((step) => !activeWorkPhase.priorPlanStepIds.includes(step.id)).map((step) => step.id),
        evidenceStartIndex: activeWorkPhase.evidenceStartIndex,
        ...(isFollowUpPhase ? { files: ledger.data.filesChanged.slice(activeWorkPhase.fileStartIndex ?? 0) } : {}),
      });
      const activePhaseData = (): TaskLedgerData => ({
        ...ledger.data,
        acceptanceCriteria: ledger.data.acceptanceCriteria.filter((criterion) => !activeWorkPhase.priorCriterionIds.includes(criterion.id)),
        plan: ledger.data.plan.filter((step) => !activeWorkPhase.priorPlanStepIds.includes(step.id)),
        evidence: ledger.data.evidence.slice(activeWorkPhase.evidenceStartIndex),
        actions: ledger.data.actions.slice(activeWorkPhase.actionStartIndex),
        // A prior UI phase must not force screenshot work for an unrelated
        // backend/docs follow-up. The final diff supplies real phase files.
        filesChanged: [],
        planDesign: isFollowUpPhase ? undefined : ledger.data.planDesign,
      });

      const ask = async (note?: string): Promise<ParsedAction | undefined> => {
        const conversationNote = conversationControl
          ? `USER CONVERSATION REQUEST: ${conversationControl === 'pause' ? 'Execution is paused. Discuss or answer first; do not run tools or change the plan.' : 'Answer the user question first; only read-only inspection needed for that answer is allowed.'} Use complete with chat:true and a natural response, or ask_user when their input is needed. Preserve unfinished work and wait for a new instruction before continuing it.`
          : '';
        const liveConnections = this.config.connectionContext?.();
        const liveContext = liveConnections ? `CURRENT REGISTERED CONNECTIONS AND CAPABILITIES (refresh, metadata only):\n${liveConnections}` : '';
        messages.push({ role: 'user', content: buildStateMessage(ledger, [note, conversationNote, liveContext].filter(Boolean).join('\n\n'), activeSkillsSection(), activePhaseStateScope()) });
        this.emit('think  reviewing task state and choosing the next action');
        let pending = '';
        let lastFlush = Date.now();
        const flush = (): void => {
          if (pending) this.emit(`tdelta ${pending}`);
          pending = '';
          lastFlush = Date.now();
        };
        const sink = (chunk: string): void => {
          pending += chunk;
          if (pending.length >= 32 || Date.now() - lastFlush > 50) flush();
        };
        let streamer = createProseStreamer(sink);
        const resetProse = (): void => {
          pending = '';
          streamer = createProseStreamer(sink);
        };
        this.abortController = new AbortController();
        let callUsage: LlmUsage | undefined;
        const phase = ledger.data.status === 'intake' || ledger.data.status === 'planning' || ledger.data.status === 'review' ? 'planning' : 'execution';
        const logicalRequestId = `${ledger.data.taskId}:main:${++logicalRequestSequence}`;
        const callOpts = (
          protocolMode: 'native' | 'structured_text' | 'text',
          maxTransportAttempts: number,
          override?: { effort?: EffortLevel; outputBudgetTokens?: number },
        ) => ({
          effort: override?.effort ?? effortPlan.llmEffort ?? this.config.effort,
          signal: this.abortController!.signal,
          logicalRequestId,
          maxTransportAttempts,
          protocolMode,
          ...(override?.outputBudgetTokens !== undefined ? { outputBudgetTokens: override.outputBudgetTokens } : {}),
          ...(protocolMode === 'native' ? { tools: [GITU_ACTION_TOOL], toolChoice: 'required' as const } : protocolMode === 'structured_text' ? { json: true } : {}),
          onUsage: (u: LlmUsage) => {
            callUsage = u;
          },
          onActivity: (activity: LlmActivityEvent) => {
            if (activity.type === 'reasoning') this.emit('activity reasoning');
            else if (activity.type === 'content') this.emit('activity content');
            else if (activity.type === 'tool') this.emit('activity tool');
          },
          onStreamReset: () => {
            // The connection died after partial deltas went out and the LLM
            // client fell back to a full completion. Discard streamed state so
            // the authoritative final text is not overlaid on stale fragments.
            resetProse();
          },
        });
        const callOnce = async (
          protocolMode: 'native' | 'structured_text' | 'text',
          maxTransportAttempts: number,
          override?: { effort?: EffortLevel; outputBudgetTokens?: number },
        ): Promise<LlmTurnResult> => {
          this.emit('activity reasoning');
          let r: LlmTurnResult;
          try {
            r = await requestLlmTurn(llm, messages, callOpts(protocolMode, maxTransportAttempts, override), (delta) => streamer(delta));
          } catch (err) {
            // A compatible endpoint may accept ordinary completions while not
            // supporting SSE. Downgrade explicitly to the non-streaming turn
            // API, retaining the same logical request ID and only the unused
            // transport budget. This keeps a stream failure from hiding a
            // second HTTP attempt inside the client, and applies to native
            // tool requests too — a broken stream must not fail the run.
            if (err instanceof LlmError && err.details.kind === 'streaming_incompatible') {
              r = await requestLlmTurn(llm, messages, callOpts(protocolMode, Math.max(1, maxTransportAttempts - 1), override));
            } else {
              throw err;
            }
          }
          flush();
          telemetry.recordCall(messages, callUsage, prefixEnd, phase);
          return r;
        };
        const finishParse = (r: string): ParsedAction | undefined => {
          let parsed = parseReplyAction(r);
          if (!parsed) {
            // Protocol drift: reasoning models narrate with braces before the
            // real action — try the structured object that CLOSES LAST.
            parsed = parseAction(extractLastJsonObject(r));
          }
          if (!parsed) {
            // Thinking models under long context sometimes keep the action JSON
            // in the reasoning trace and only emit commentary as visible content.
            const reasoning = llm.lastReasoning;
            if (reasoning) parsed = parseReplyAction(reasoning) ?? parseAction(extractLastJsonObject(reasoning));
          }
          return parsed;
        };
        let turn: LlmTurnResult;
        if (actionProtocolMode === 'native') {
          try {
            turn = await callOnce('native', 3);
          } catch (err) {
            // A provider that rejects our function schema is not a malformed
            // model reply. Cache the downgrade for this execution lane and spend
            // only the two remaining transport attempts on compatibility.
            if (!(err instanceof LlmError) || err.details.kind !== 'tool_protocol_incompatible') throw err;
            actionProtocolMode = 'structured_text';
            this.emit('protocol native tools unsupported by this provider — using structured action compatibility');
            resetProse();
            try {
              turn = await callOnce('structured_text', 2);
            } catch (fallbackErr) {
              if (!(fallbackErr instanceof LlmError) || fallbackErr.details.kind !== 'tool_protocol_incompatible') throw fallbackErr;
              actionProtocolMode = 'text';
              this.emit('protocol JSON mode unsupported by this provider — using text action compatibility');
              resetProse();
              turn = await callOnce('text', 1);
            }
          }
        } else {
          try {
            turn = await callOnce(actionProtocolMode, 3);
          } catch (err) {
            if (actionProtocolMode !== 'structured_text' || !(err instanceof LlmError) || err.details.kind !== 'tool_protocol_incompatible') throw err;
            actionProtocolMode = 'text';
            this.emit('protocol JSON mode unsupported by this provider — using text action compatibility');
            resetProse();
            turn = await callOnce('text', 2);
          }
        }
        let reply = actionReplyFromTurn(turn);
        let parsed = finishParse(reply);
        thinkingOnlyNoAction = !parsed && turn.kind === 'empty' && Boolean(turn.metadata.reasoning);
        if (thinkingOnlyNoAction && !thinkingRecoveryUsed) {
          // Adaptive recovery (one per run): the reasoning trace consumed the
          // entire output budget, so the model finished with no final action.
          // Replaying the identical request would exhaust identically — retry
          // once with one step less reasoning effort and a larger reserved
          // output budget. Transports that cannot express an output budget
          // ignore the override (see src/llm/output-budget.ts).
          thinkingRecoveryUsed = true;
          const baseEffort = effortPlan.llmEffort ?? this.config.effort;
          const lowerEffort = reduceEffortOneLevel(baseEffort);
          this.emit(
            `recover  reasoning-only reply — one retry with ${lowerEffort ? `effort ${baseEffort} → ${lowerEffort}` : 'a larger reserved output budget'}`,
          );
          turn = await callOnce(actionProtocolMode, 2, {
            effort: lowerEffort ?? baseEffort,
            outputBudgetTokens: recoveryBudgetTokens(baseEffort),
          });
          reply = actionReplyFromTurn(turn);
          parsed = finishParse(reply);
          thinkingOnlyNoAction = !parsed && turn.kind === 'empty' && Boolean(turn.metadata.reasoning);
        }
        if (!parsed && reply.trim() && !thinkingOnlyNoAction && protocolRepairsUsed < MAX_PROTOCOL_REPAIRS) {
          // Protocol-repair layer: the reply carried content but no usable
          // action (the model drifted into prose). One constrained call — the
          // repair model when the host provides one, else the same model —
          // asking for EXACTLY the action object. A repair only PRODUCES a
          // candidate action: policy, the executor, and the evidence gates
          // still own everything else.
          protocolRepairsUsed += 1;
          this.emit(`repair  protocol-repair call ${protocolRepairsUsed}/${MAX_PROTOCOL_REPAIRS} — requesting exactly one executable action`);
          try {
            const repairTurn = await requestLlmTurn(
              this.config.protocolRepairLlm ?? llm,
              [...messages, { role: 'user', content: PROTOCOL_REPAIR_INSTRUCTION }],
              callOpts(actionProtocolMode, 2, { effort: 'low' }),
            );
            const repairedReply = actionReplyFromTurn(repairTurn);
            const repaired = finishParse(repairedReply);
            if (repaired) {
              this.emit('repair  recovered an executable action from the repair call');
              reply = repairedReply;
              parsed = repaired;
              turn = repairTurn;
            }
          } catch {
            /* repair is best-effort — the reply counts as malformed below */
          }
        }
        const cutAt = proseCutIndex(reply);
        const prose = (cutAt >= 0 ? reply.slice(0, cutAt) : '').trim();
        if (prose) this.emit(`say ${prose}`);
        else if (parsed) {
          const summary = visibleActionSummary(parsed);
          if (summary) this.emit(`say ${summary}`);
        }
        // Assistant history is echoed on the wire with its reasoning trace.
        // DeepSeek's thinking loop REQUIRES the prior reasoning_content to be
        // sent back on every tools-carrying request — dropping it makes the
        // provider reject the request with HTTP 400 and look like "native
        // tools unsupported". Tool calls are NOT replayed: the harness
        // executes them itself and answers with a user observation, so a
        // tool_calls message without matching tool results would be invalid.
        messages.push({
          role: 'assistant',
          content: reply,
          ...(turn.metadata.reasoning ? { reasoningContent: turn.metadata.reasoning } : {}),
        });
        if (!parsed) {
          invalidStreak += 1;
          telemetry.noteWastedCall();
          driftCompactionRequested = true;
          const verdict = malformed.note('unparseable');
          logParseFailure(ledger.data.taskId, reply, llm.lastReasoning);
          this.emit(
            thinkingOnlyNoAction
              ? `warn    reply contained only reasoning with no final content (streak ${invalidStreak}) — thinking likely consumed the entire output budget`
              : `warn    response had no executable action (streak ${invalidStreak}) — raw reply saved to logs/parse-failures.log`,
          );
          if (verdict.halt) {
            actionLaneHalted = true;
            ledger.addBlocker(`Main execution lane stopped after ${verdict.streak} consecutive responses without an executable action.`);
            this.emit(`halt    main execution lane stopped after ${verdict.streak} malformed/no-action replies`);
          }
        } else {
          invalidStreak = 0;
          // A syntactically valid high-level action is real recovery. Tool calls
          // reset only after executor validation below, so malformed parameters
          // still accumulate across turns.
          if (parsed.type !== 'tool_call' && parsed.type !== 'parallel') malformed.reset();
        }
        return parsed;
      };

      // Called only after a successful run_command. An explicit stepId limits
      // completion to that step; untagged checks cover every exact match.
      const completeVerifiedPlanSteps = (command: string, stepId?: string): void => {
        if (!command.trim()) return;
        const steps = stepId ? [ledger.step(stepId)] : ledger.data.plan;
        for (const step of steps) {
          if (!step || step.status === 'done' || !step.verification || !commandsMatch(step.verification, command)) continue;
          ledger.updateStep(step.id, { status: 'done' });
          checkpoints.snapshot(ledger, step.id, step.description.slice(0, 60));
          this.emit(`step     ${step.id} done — verification "${command}" passed`);
        }
      };

      const observe = (content: string | LlmContentPart[]): void => {
        messages.push({ role: 'user', content });
        const lengthBefore = messages.length;
        // Protocol-drift hygiene: a reply without an executable action forces
        // the very next compaction pass regardless of the normal triggers —
        // long context correlates with protocol drift, so the tail gets shed
        // before the model is asked again.
        const driftCompaction = driftCompactionRequested;
        driftCompactionRequested = false;
        const compactionOpts = {
          ...(this.config.compaction ?? {}),
          ...(driftCompaction ? { force: true, keepRecent: 3, triggerMessages: 4 } : {}),
          // Memory-aware compaction: the canonical snapshot rides in the digest
          // and durable failure lessons are extracted into project memory
          // (deduped) before the verbose history is dropped.
          snapshot: renderContextSnapshot(buildContextSnapshot(ledger.data)),
          onExtract: ({ failures }: { failures: string[] }): void => {
            const known = new Set(memory.query({ type: 'failure' }).map((m) => m.claim.trim().toLowerCase()));
            for (const failure of failures.slice(-3)) {
              const claim = failure.replace(/^RESULT \[error\]\s*/, '').slice(0, 200);
              const key = claim.trim().toLowerCase();
              if (!key || known.has(key)) continue;
              known.add(key);
              // Structured failure lesson (review Phase 12): action + observed
              // failure in one retrievable record; the diagnostic cause is the
              // part after the '|' separator when present.
              const [action, cause] = claim.split(' | ');
              const added = memory.addFailureLesson({
                action: action ?? claim,
                cause: cause ?? 'cause not captured — diagnose on recurrence',
                scope: guard.lock.name,
                confidence: 0.75,
              });
              // Learned patterns (review Phase 13): repeated verified failures
              // earn a pattern memory — never a single speculative observation.
              if (!added.created) {
                const pattern = memory.maybePromotePattern({
                  entryId: added.entry.id,
                  patternClaim: `Repeated failure pattern — ${claim.slice(0, 140)}. Check for this before retrying similar work.`,
                  scope: guard.lock.name,
                });
                if (pattern) {
                  const key = memoryPatternKey(pattern.scope, pattern.claim);
                  if (!announcedMemoryPatterns.has(key)) {
                    announcedMemoryPatterns.add(key);
                    this.emit(`memory   pattern promoted from repeated failures (${pattern.claim.slice(0, 90)})`);
                  }
                }
              }
            }
          },
        };
        if (compactHistory(messages, (t) => this.emit(t), compactionOpts)) {
          telemetry.noteCompaction();
          // Durable user-reference images must survive compaction: if the
          // image-bearing message was digested away, splice the active visual
          // references back in so the model never loses what the user showed it.
          if (restoreVisualReferencesAfterCompaction(messages, rehydratedVisuals, this.config.supportsImages ?? false)) {
            this.emit('visual-ref durable user-reference image(s) restored into model context after compaction');
          }
          // A compact state message is always authoritative; make full skill
          // instructions available again on the next turn if their one-time
          // copy was absorbed into the digest.
          reloadActiveSkillInstructions();
          // Protected-state reconstruction (review two-tier model): compaction
          // digests the intake-era memory messages along with the old history.
          // Long missions must not lose durable guidance exactly when compaction
          // makes it most needed — re-inject BOTH the Tier 1 protected section
          // and the Tier 2 relevant-memory section right after the fresh digest
          // so they survive every compaction generation.
          if (protectedSection) {
            messages.splice(2, 0, { role: 'user', content: protectedSection });
          }
          if (memorySection) {
            messages.splice(protectedSection ? 3 : 2, 0, { role: 'user', content: memorySection });
          }
          // Compaction removes messages[1..keepFrom) and inserts the digest at
          // index 1, shifting every retained message. The prefix boundary must
          // move with it — otherwise later calls misattribute live history as a
          // stable cached prefix and stripStaleImages silently skips.
          prefixEnd = shiftPrefixEndAfterCompaction(prefixEnd, lengthBefore - COMPACT_KEEP_RECENT);
        }
      };

      const admitQueuedMessages = (): boolean => {
        const hadMessages = this.inbox.length > 0;
        while (this.inbox.length > 0) {
          const queued = this.inbox.shift()!;
          this.emit(`user-msg ${queued.text}`);
          const steered = classifyFollowUp(queued.text);
          const intent = conversationIntent(queued.text);
          if (intent) {
            conversationControl = intent;
            preservePausedWork = true;
            this.config.subagents?.stop('User requested discussion before continuing.');
          } else if (conversationControl && steered.kind === 'CONTINUE') {
            // Only an explicit continuation clears a pause inside the same
            // admission batch. Extra requirements sent after "stop first"
            // must remain on hold until the user actually says to continue.
            conversationControl = undefined;
            preservePausedWork = false;
          }
          observe(`USER MESSAGE (${steered.kind}, current instruction; reconsider your next action): ${queued.text}` +
            (queued.attachmentContext ? `\n${queued.attachmentContext}` : '') +
            (intent ? '\nAnswer naturally before doing further work. The existing goal and unfinished plan remain on hold.' :
              steered.kind === 'CORRECT' ? '\nRevise affected plan steps and replace obsolete todos for the new direction; reactivate a cancelled step with status:pending after revising it, or append the replacement steps. Do not continue the rejected provider.' : ''));
          applyFollowUpToLedger(ledger, queued.text);
          if (steered.kind === 'REFINE' || steered.kind === 'CORRECT' || steered.kind === 'EXTEND') {
            const extraTurns = Math.max(budgetExtensionTurns, 10);
            budgetCap = turns + extraTurns;
            ledger.addBudgetExtension({
              turn: turns,
              reason: `follow-up ${steered.kind} arrived mid-run: "${queued.text.slice(0, 120)}"`,
              filesChanged: ledger.data.filesChanged?.length ?? 0,
              distinctFailures: new Set(ledger.data.actions.filter(a => a.status === 'error' && a.errorSignature).map(a => a.errorSignature)).size,
              evidenceCount: ledger.data.evidence.length,
              extraTurns,
              extraSpecialists: 0,
              specialistBudgetAfter: Number.isFinite(effortMaxSpecialists) ? effortMaxSpecialists : -1,
            });
            this.emit(`effort  follow-up ${steered.kind} — turn budget re-armed: ${extraTurns} fresh turns (cap now ${budgetCap})`);
          }
        }
        return hadMessages;
      };

      try {
        mainLoop: for (;;) {
          if (this.aborted) {
            ledger.addBlocker('Stopped by user.');
            exitReason = 'blocked';
            break;
          }
          admitQueuedMessages();
          // Reasoning-only recovery is once-per-run to bound cost, but a
          // successful concrete action (e.g. a provider read) proves the run is
          // progressing — re-arm the recovery so a reasoning-only blip right
          // after real work gets corrected instead of consuming the turn.
          if (concreteActionSinceLastAsk) {
            thinkingRecoveryUsed = false;
            concreteActionSinceLastAsk = false;
          }

          // Adaptive effort: the turn budget is a floor, not a cliff. Keep going
          // while verified progress continues; stall only when turns are spent
          // without anything verifiable moving.
          if (turns >= budgetCap) {
            const now = progressSnapshot();
            // Only hard outcomes count as progress: bookkeeping like marking a
            // plan step done must not keep an aimless run alive on its own. Active
            // browser verification (screenshots, click-throughs) counts too — it is
            // how frontend work proves anything.
            const progressing =
              now.evidence > lastProgress.evidence ||
              now.satisfied > lastProgress.satisfied ||
              now.files > lastProgress.files ||
              now.todos > lastProgress.todos ||
              now.browses > lastProgress.browses ||
              now.distinctOk > lastProgress.distinctOk;
            if (progressing && budgetExtensions < BUDGET_EXTENSIONS_MAX) {
              budgetExtensions += 1;
              lastProgress = now;
              // Dynamic escalation: the DISCOVERED scope (files touched, distinct
              // failures) can reveal a harder task than the goal text suggested.
              // Escalated runs get bigger extensions and a wider specialist budget
              // (bounded by the delegate hard cap).
              const escalation = escalationFor({
                filesChanged: ledger.data.filesChanged?.length ?? 0,
                distinctFailures: new Set(ledger.data.actions.filter((a) => a.status === 'error' && a.errorSignature).map((a) => a.errorSignature)).size,
              });
              const extraTurns = escalation?.extraTurns ?? 0;
              budgetCap = turns + budgetExtensionTurns + extraTurns;
              // Explicit, evidence-driven investigation escalation: discovered
              // scope exceeding the initial depth widens the search ONE ladder
              // level — never a jump straight to repository exploration.
              const escalatedDepth = ledger.escalateInvestigationDepth();
              if (escalatedDepth) {
                this.emit(`depth    investigation depth escalated to ${escalatedDepth} — discovered scope exceeded the initial depth (one ladder level, evidence-driven)`);
              }
              if (escalation && Number.isFinite(effortMaxSpecialists) && effortMaxSpecialists < 6) {
                effortMaxSpecialists = Math.min(6, effortMaxSpecialists + escalation.extraSpecialists);
              }
              // Audit trail: every extension records WHY (reason + evidence
              // snapshot), so a longer run is explainable, not just permitted.
              ledger.addBudgetExtension({
                turn: turns,
                reason: escalation?.reason ?? 'verified progress continued past the initial budget',
                filesChanged: ledger.data.filesChanged?.length ?? 0,
                distinctFailures: new Set(ledger.data.actions.filter((a) => a.status === 'error' && a.errorSignature).map((a) => a.errorSignature)).size,
                evidenceCount: ledger.data.evidence.length,
                extraTurns: budgetExtensionTurns + extraTurns,
                extraSpecialists: escalation?.extraSpecialists ?? 0,
                specialistBudgetAfter: Number.isFinite(effortMaxSpecialists) ? effortMaxSpecialists : -1,
              });
              this.emit(
                `effort  ${turns} turns in, but verified progress continues — budget extended by ${budgetExtensionTurns + extraTurns} turns (extension ${budgetExtensions}/${BUDGET_EXTENSIONS_MAX})${escalation ? ` — ${escalation.reason}, specialist budget now ${effortMaxSpecialists}` : ''}`,
              );
              observe(
                `Your turn budget was extended by ${budgetExtensionTurns + extraTurns} turns because you kept making verified progress. ` +
                  (escalation ? `${escalation.reason.charAt(0).toUpperCase()}${escalation.reason.slice(1)} — delegate specialists where it helps. ` : '') +
                  'Keep working, but steer toward completing and verifying acceptance criteria rather than exploring.',
              );
            } else {
              ledger.addBlocker(
                `Exhausted the task's effort budget (${turns} turns used` +
                  `${budgetExtensions ? `, ${budgetExtensions} extension(s) granted` : ''}) without reaching completion. ` +
                  `Retry with effort=high — that raises BOTH the model's per-step reasoning effort at the provider AND the turn budget — ` +
                  `or narrow the task.`,
              );
              exitReason = 'stalled';
              this.emit(`stall   effort budget of ${budgetCap} turns reached without verified progress — stopping`);
              break;
            }
          }

          // Every model exchange costs a turn — including replies with no usable
          // action — so a garbage spiral is bounded by the same dynamic budget.
          turns += 1;
          const warnAt = Math.max(1, Math.floor(budgetCap * 0.66));
          if (!budgetWarned && turns >= warnAt && turns < budgetCap) {
            budgetWarned = true;
            this.emit(`effort  ${turns}/${budgetCap} turns used — about ${budgetCap - turns} left; wrap up verified work if you can`);
          }

          const action = await ask(effortNote);

          // Input may arrive while the model is thinking. Its response was
          // produced under old instructions and must never reach dispatch.
          if (this.aborted) continue;
          if (admitQueuedMessages()) continue;

          if (!action) {
            if (actionLaneHalted) {
              exitReason = 'blocked';
              break;
            }
            if (invalidStreak >= 2) {
              // The anti-loop recovery must CONVERT state into a next action
              // instead of repeating generic advice. Before asking the model
              // again, the recovery controller executes the SAFEST
              // information-gathering action itself — one registered read-only
              // provider operation — so the next turn reasons over fresh facts
              // (reads only: a write here would bypass user approval).
              let recoveryEvidence = '';
              if (!recoveryReadExecuted && this.config.connectionActionHandler) {
                const safeRead = this.config.safestProviderRead?.(lastProviderRejection?.connectionId);
                if (safeRead) {
                  recoveryReadExecuted = true;
                  this.emit(`recover  controller executing a safe provider read — ${safeRead.connectionId}/${safeRead.operationId}`);
                  try {
                    const result = await this.config.connectionActionHandler(safeRead);
                    const rendered = result.data === undefined ? '' : `\nDATA (bounded and secret-redacted):\n${JSON.stringify(result.data).slice(0, 8_000)}`;
                    this.emit(`connection ${safeRead.connectionId}/${safeRead.operationId} completed`);
                    recoveryEvidence = `The recovery controller already ran the read for you — ACTUAL provider state right now:\n${result.message}${rendered}\nGround your next action in this data.\n`;
                  } catch (error) {
                    recoveryEvidence = `The recovery controller attempted the same read and it failed: ${connectionEventReason((error as Error).message)}\n`;
                  }
                }
              }
              observe(
                synthesizeExecutableRecovery({
                  invalidStreak,
                  lastProviderRejection: lastProviderRejection?.text,
                  recoveryEvidence: recoveryEvidence || undefined,
                  connectionContext: this.config.connectionContext?.() || undefined,
                  openSteps: ledger.data.plan
                    .filter((step) => step.status === 'pending' || step.status === 'in_progress')
                    .map((step) => ({ id: step.id, description: step.description, verification: step.verification })),
                  unclaimedCriteria: ledger.data.acceptanceCriteria
                    .filter((criterion) => !criterion.satisfied)
                    .map((criterion) => `${criterion.id} ${criterion.text.slice(0, 80)}`),
                }),
              );
            } else if (thinkingOnlyNoAction) {
              observe(
                `Your reply streamed only reasoning and produced no final content — the thinking phase likely consumed the entire output budget. ` +
                  'Do not restate your analysis: your entire visible reply must be exactly one short JSON action object, e.g. ' +
                  '{"thought":"...","action":{"type":"tool_call","tool":"list_files","params":{"path":"src"},"reason":"...","expected":"..."}}.',
              );
            } else {
              observe(
                'Your last response contained no executable JSON action — describing intentions is not enough. ' +
                  'Reply with one short sentence followed by exactly one JSON object on a new line, e.g. ' +
                  '{"thought":"...","action":{"type":"tool_call","tool":"list_files","params":{"path":"src"},"reason":"...","expected":"..."}}',
              );
            }
            continue;
          }

          const currentActionTag = action.type === 'tool_call'
            ? `tool:${action.tool}:${action.stepId ?? ''}`
            : action.type === 'capability_action'
              ? `capability:${action.capability}`
            : action.type === 'connection_action'
              ? `connection:${action.connectionId}:${action.operationId}`
              : action.type === 'connection_discovery'
                ? `discovery:${action.connectionId}:${action.intents.join(',')}:${action.resourceIdOrName ?? '*'}`
                : action.type === 'connection_operation'
                  ? `operation:${action.connectionId}:${action.operation.id}:${action.operation.method}:${action.operation.path}`
                  : action.type;

          if (conversationControl) {
            const allowed = ['complete', 'ask_user', 'show_plan'].includes(action.type) ||
              (conversationControl === 'question' && action.type === 'tool_call' && isObservationTool(action.tool, action.params)) ||
              (conversationControl === 'question' && action.type === 'parallel' && action.calls.every(call => isObservationTool(call.tool, call.params)));
            if (!allowed) {
              observe('Work is paused for the user conversation. Answer or discuss naturally using complete with chat:true. Do not execute the previous plan or open a connection form.');
              continue;
            }
          }
          if (temporaryPlanPending && !conversationControl) {
            const discovery = action.type === 'tool_call' ? isObservationTool(action.tool, action.params)
              : action.type === 'parallel' ? action.calls.every(call => isObservationTool(call.tool, call.params))
              : ['set_criteria', 'add_criteria', 'set_design', 'set_plan', 'append_plan', 'show_plan', 'set_hypothesis', 'record_decision', 'ask_user'].includes(action.type);
            if (!discovery) {
              observe('Plan requested for this turn: inspect with read-only tools, propose set_plan, and wait for approval before execution.');
              continue;
            }
          }
          if (agentWorkflow && !temporaryPlanPending && ['tool_call', 'parallel', 'delegate', 'capability_action'].includes(action.type) && ledger.data.status !== 'executing') {
            ledger.setStatus('executing');
          }
          switch (action.type) {
            case 'set_criteria': {
              const criteriaAlreadySet = ledger.data.acceptanceCriteria.length > 0;
              const hasEvidence = ledger.data.evidence.length > 0;
              if (userCriteriaProvided) {
                observe('Acceptance criteria were provided by the user and are immutable. Work against the existing criteria; do not redefine them.');
                break;
              }
              if (criteriaAlreadySet && (hasEvidence || ledger.data.planApproved)) {
                const completedScope = ledger.data.acceptanceCriteria.every((criterion) => criterion.satisfied);
                if (resumeNote && completedScope) {
                  const adds = EvidenceEngine.normalizeCriteria(action.criteria);
                  const added = adds.some((s) => s.verification || (s.evidenceType && s.evidenceType !== 'any'))
                    ? ledger.appendCriteriaFromSpecs(adds)
                    : ledger.appendCriteria(adds.map((s) => s.text));
                  if (added.length > 0) {
                    followUpCriteriaAdded = true;
                    this.emit('criteria added ' + added.map((criterion) => '"' + criterion.text + '"').join('; '));
                    observe(
                      'The previous scope is complete. Added ' +
                        added.length +
                        ' acceptance criterion/criteria for this follow-up work. Now use append_plan with small, verifiable steps for the new scope.',
                    );
                  } else {
                    observe('Those follow-up criteria are already recorded. Use append_plan for the remaining work, or continue the current plan.');
                  }
                  break;
                }
                observe(
                  'Criteria are locked once a plan is approved or evidence is recorded; they cannot be redefined. ' +
                    'For a new scope in a resumed completed task, use add_criteria instead; otherwise continue working against them.',
                );
                break;
              }
              ledger.setCriteria(action.criteria);
              this.emit(`criteria ${action.criteria.map((c) => `"${c}"`).join('; ')}`);
              observe(agentWorkflow ? 'Criteria recorded. Continue with the requested work; a formal plan is optional unless the user requested plan review.' : 'Criteria recorded. Now propose a plan (set_plan) with small, verifiable steps.');
              break;
            }
            case 'add_criteria': {
              if (!resumeNote) {
                observe('add_criteria is for a new scope in a resumed task. Use set_criteria for a new task.');
                break;
              }
              const adds = EvidenceEngine.normalizeCriteria(action.criteria);
              const added = adds.some((s) => s.verification || (s.evidenceType && s.evidenceType !== 'any'))
                ? ledger.appendCriteriaFromSpecs(adds)
                : ledger.appendCriteria(adds.map((s) => s.text));
              if (added.length === 0) {
                observe('Those criteria are already recorded. Use append_plan for the remaining work.');
                break;
              }
              followUpCriteriaAdded = true;
              this.emit('criteria added ' + added.map((criterion) => '"' + criterion.text + '"').join('; '));
              observe(
                'Added ' +
                  added.length +
                  ' follow-up acceptance criterion/criteria while preserving the earlier completed scope. Now use append_plan with small, verifiable steps.',
              );
              break;
            }
            case 'set_plan':
            case 'append_plan': {
              // A completed task's plan is immutable history. Even if the model
              // emits set_plan out of habit, a follow-up may only append its new
              // steps; this prevents the old plan from disappearing on resume.
              const append = isFollowUpPhase || action.type === 'append_plan' || followUpCriteriaAdded;
              if (append) ledger.appendPlan(action.steps);
              else ledger.setPlan(action.steps);
              checkpoints.snapshot(ledger, append ? 'follow-up-plan' : 'plan', append ? 'follow-up plan created' : 'plan created');
              this.emit('plan     ' + action.steps.length + (append ? ' follow-up' : '') + ' steps');
              const planReviewHandler = this.config.planReviewHandler;
              const needsPlanReview = this.config.requirePlanReview && planReviewHandler && (temporaryPlanPending || !ledger.data.planApproved || (isFollowUpPhase && !followUpPlanReviewHandled));
              if (needsPlanReview) {
                ledger.setStatus('review');
                this.emit('plan-review waiting for user review');
                const decision = await planReviewHandler({
                  // A strict review requested by the user still applies to a new
                  // phase, but it receives only the new criteria/steps — never a
                  // costly replay of work that was already approved.
                  criteria: ledger.data.acceptanceCriteria.filter((criterion) => !activeWorkPhase.priorCriterionIds.includes(criterion.id)).map((criterion) => criterion.text),
                  steps: append
                    ? ledger.data.plan
                        .filter((step) => !activeWorkPhase.priorPlanStepIds.includes(step.id))
                        .map((step) => ({ description: step.description, verification: step.verification }))
                    : action.steps,
                });
                if (decision.criteria && decision.criteria.length > 0) {
                  if (isFollowUpPhase) ledger.appendCriteria(decision.criteria);
                  else ledger.setCriteria(decision.criteria);
                }
                if (decision.steps && decision.steps.length > 0) {
                  if (isFollowUpPhase) {
                    // Replace only this phase's proposed steps. The completed
                    // task plan remains immutable history, while reviewer edits
                    // do not leave duplicate follow-up steps behind.
                    ledger.replacePlanSteps(
                      ledger.data.plan.filter((step) => !activeWorkPhase.priorPlanStepIds.includes(step.id)).map((step) => step.id),
                      decision.steps,
                    );
                  } else {
                    ledger.setPlan(decision.steps);
                  }
                }
                if (decision.approved) {
                  temporaryPlanPending = false;
                  if (agentWorkflow && typeof messages[0]?.content === 'string') {
                    messages[0].content = messages[0].content.replace(agentWorkflowPrompt(true), agentWorkflowPrompt(false));
                  }
                  ledger.data.planApproved = true;
                  followUpPlanReviewHandled = true;
                  ledger.save();
                  ledger.setStatus('executing');
                  this.emit('plan approved — switching to build');
                  observe('The user reviewed and approved the plan. Execute the approved plan one step at a time; verify with commands.');
                } else {
                  ledger.setStatus('planning');
                  this.emit(`plan-review changes requested: ${decision.note ?? '(no note)'}`);
                  observe(
                    `The user reviewed the plan and requested changes: ${decision.note || '(no note)'}\n` +
                      `Revise the ${isFollowUpPhase ? 'follow-up plan with append_plan' : 'plan with set_plan'}. Keep it small, reversible, and verifiable.`,
                  );
                }
              } else {
                ledger.setStatus('executing');
                // Soft planning-quality nudge — once per run, never a hard gate:
                // richer design/breakdown helps multi-surface work, but simple
                // tasks should not pay for ceremony.
                const areas = new Set(action.steps.map((s) => s.area).filter(Boolean));
                const wantsDesign = effortPlan.complexity !== 'low' && !ledger.data.planDesign && !planningNudged;
                const wantsTodos = effortPlan.complexity !== 'low' && action.steps.length >= 3 && !action.steps.some((s) => s.subtasks?.length);
                let note = 'Plan recorded. Execute one step at a time. Verify with commands; evidence ids will be reported.';
                if (wantsDesign || wantsTodos) {
                  planningNudged = true;
                  const tips: string[] = [];
                  if (wantsDesign) {
                    tips.push(
                      `no DESIGN recorded yet${areas.size >= 2 ? ` and this plan spans ${[...areas].join(' + ')}` : ''} — consider set_design with bounded frontend/backend/integration notes before building`,
                    );
                  }
                  if (wantsTodos) {
                    tips.push('consider revising key steps (revise_step) to add small todo subtasks so progress is verifiable incrementally');
                  }
                  note += `\nPLANNING NOTE: ${tips.join('; ')}. This is guidance, not a blocker.`;
                }
                observe(note);
              }
              break;
            }
            case 'set_hypothesis': {
              ledger.data.currentHypothesis = action.text;
              ledger.save();
              this.emit(`hypothesis ${action.text.slice(0, 120)}`);
              observe('Hypothesis recorded. Proceed with the next action.');
              break;
            }
            case 'set_design': {
              ledger.setPlanDesign(action.design);
              const present = [
                action.design.frontend ? `frontend(${action.design.frontend.length})` : '',
                action.design.backend ? `backend(${action.design.backend.length})` : '',
                action.design.integration ? `integration(${action.design.integration.length})` : '',
              ].filter(Boolean);
              this.emit(`design   recorded: ${present.join(' ')}`);
              observe(
                'DESIGN RECORDED and pinned to task state (shown in compact form each turn; use show_plan for full detail). ' +
                  'Now break the work into SMALL todo-sized steps grouped by area (frontend/backend/...), each with concrete subtasks and a real verification.',
              );
              break;
            }
            case 'revise_step': {
              const revised = ledger.reviseStep(
                action.stepId,
                { description: action.description, verification: action.verification, area: action.area, addSubtasks: action.addSubtasks, replaceSubtasks: action.replaceSubtasks, status: action.status },
                action.reason,
              );
              if (!revised) {
                observe(`Cannot revise: unknown step "${action.stepId}". Use show_plan to see current step ids.`);
                break;
              }
              this.emit(`replan   ${action.stepId} revised — ${action.reason.slice(0, 90)}`);
              observe(`STEP REVISED (${action.stepId}) — reason recorded in the revision log. Continue with the UPDATED step only; do not replan unrelated steps.`);
              break;
            }
            case 'toggle_todo': {
              const ok = ledger.toggleSubtask(action.stepId, action.index, action.done);
              if (!ok) {
                observe(`Cannot update todo #${action.index} of ${action.stepId}: out of range. Use show_plan if unsure.`);
                break;
              }
              const step = ledger.step(action.stepId)!;
              const todo = step.subtasks?.[action.index];
              this.emit(
                step.status === 'done'
                  ? `step     ${action.stepId} done (all todos checked)`
                  : `todo     ${action.stepId}[${action.index}] ${todo?.done ? '✓' : '·'} ${(todo?.text ?? '').slice(0, 60)}`,
              );
              observe('Noted.');
              break;
            }
            case 'complete_step': {
              const step = ledger.step(action.stepId);
              if (!step) {
                observe(`Cannot complete: unknown step "${action.stepId}". Use show_plan to see current step ids.`);
                break;
              }
              if (step.status === 'done') {
                observe(`${action.stepId} is already done.`);
                break;
              }
              ledger.updateStep(action.stepId, { status: 'done' });
              checkpoints.snapshot(ledger, action.stepId, step.description.slice(0, 60));
              this.emit(`step     ${action.stepId} done (explicit) — ${action.reason.slice(0, 80)}`);
              observe(
                `STEP DONE (${action.stepId}): ${action.reason}\n` +
                  `Move to the next open step in TASK STATE. If the step had a verification command that has not run yet, run it before claiming related criteria.`,
              );
              break;
            }
            case 'show_plan': {
              observe(renderFullPlanMessage(ledger));
              break;
            }
            case 'record_decision': {
              const conflicts = decisionConflicts(action, explicitTech.required);
              if (conflicts.length > 0) {
                observe(
                  `DECISION REJECTED — it conflicts with an explicit requirement:\n${conflicts.map((c) => `  - ${c}`).join('\n')}\n` +
                    `Record a decision that honors the explicit requirement (or ask the user to change it).`,
                );
                break;
              }
              const superseded = action.supersedes ?? (ledger.activeArchitectureDecisions().length === 1 ? ledger.activeArchitectureDecisions()[0]!.id : undefined);
              const record = ledger.recordArchitectureDecision(action);
              this.emit(`decision ${record.id} — ${record.decision.slice(0, 100)}`);
              observe(
                `ARCHITECTURE DECISION RECORDED (${record.id})${superseded && superseded !== record.id ? `, superseding ${superseded}` : ''}: ${record.decision}\n` +
                  `It is now part of the task state and will be checked against the implementation at completion. ` +
                  `Implement accordingly; if you change course later, record a new decision with supersedes.`,
              );
              break;
            }
            case 'tool_call': {
              if (!agentWorkflow && ledger.data.acceptanceCriteria.length === 0) {
                observe('No acceptance criteria exist yet. Use set_criteria first.');
                break;
              }
              const outcome = await executor.execute({
                tool: action.tool,
                params: action.params,
                reason: action.reason,
                expected: action.expected,
                stepId: action.stepId,
              });

              const malformedKind = malformedKindFor(outcome.result.errorSignature);
              const malformedVerdict = malformedKind ? malformed.note(malformedKind) : (malformed.reset(), undefined);

              if (outcome.blockedByLoop) {
                loopBlocks += 1;
                memory.add({
                  type: 'failure',
                  claim: `Repeated failure on ${outcome.record.paramsSummary}: ${action.reason}`,
                  scope: guard.lock.name,
                  confidence: 0.8,
                });
                if (loopBlocks >= 3) {
                  ledger.addBlocker('Three loop-prevention blocks occurred; task escalated.');
                  exitReason = 'blocked';
                  observe(outcome.result.output);
                  break;
                }
                observe(outcome.result.output);
                break;
              }
              if (outcome.deniedByPolicy) {
                observe(outcome.result.output);
                break;
              }
              // A filesystem helper reporting success is never enough. The tools
              // return this signature only after canonical-root stat/read/hash
              // verification failed twice. Continuing would let the model edit a
              // phantom workspace and later "verify" another checkout.
              if (outcome.result.errorSignature === 'write-not-persisted') {
                const blocker = `Workspace mutation was not persisted in the active writable target (${guard.activeWritableRoot}); execution stopped before claiming any file change.`;
                ledger.addBlocker(blocker);
                exitReason = 'blocked';
                this.emit('blocked  WRITE_NOT_PERSISTED — canonical workspace verification failed');
                observe(`${outcome.result.output}\nHARD STOP: do not retry a different file path. Repair the session workspace authority, then resume.`);
                break mainLoop;
              }

              let evidenceNote = '';
              if (action.tool === 'run_command') {
                if (!outcome.result.ok) {
                  // A later retry may repair the command, but its first failed
                  // result is still uncertainty the cheap completion path must
                  // not silently erase.
                  specialistOrVerificationUncertain = true;
                  this.emit('verification uncertainty recorded — final quality review remains required');
                }
                const kind = classifyEvidenceKind(String(action.params['command'] ?? ''));
                const currentFp = await getWorkspaceFingerprint(guard.activeWritableRoot);
                const ev = evidence.record(ledger.data, {
                  kind,
                  label: action.expected || String(action.params['command']),
                  command: String(action.params['command']),
                  exitCode: outcome.result.exitCode,
                  passed: outcome.result.ok,
                  output: outcome.result.output,
                  workspaceFingerprint: currentFp,
                });
                ledger.save();
                evidenceNote = `\nEVIDENCE RECORDED: ${ev.id} [${ev.passed ? 'PASS' : 'FAIL'}] (${kind}). You may cite it with claim_criterion.`;
                this.emit(`evidence ${ev.id} ${ev.passed ? 'PASS' : 'FAIL'} (${kind})`);
              }

              if (action.tool === 'browse' && outcome.result.image) {
                this.emit(`browseshot ${outcome.result.image}`);
              }

              // Track every skill the model actually loads so continuations and the
              // report can show which reusable knowledge drove the task.
              if (action.tool === 'use_skill' && outcome.result.ok) {
                const skillName = String(action.params['name'] ?? '').trim();
                if (skillName) {
                  const identity = skills.identity(skillName);
                  ledger.addUsedSkill(skillName, identity);
                  if (identity)
                    ledger.recordSkillEvent({
                      stage: 'loaded',
                      name: identity.name,
                      version: identity.version,
                      contentHash: identity.contentHash,
                      scope: identity.scope,
                      reason: 'explicit use_skill',
                      loadChars: skills.get(skillName)?.instructions.length,
                    });
                  if (identity)
                    ledger.recordSkillEvent({
                      stage: 'applied',
                      name: identity.name,
                      version: identity.version,
                      contentHash: identity.contentHash,
                      scope: identity.scope,
                      reason: 'use_skill tool completed',
                    });
                  this.emit(`skill    used "${skillName}"`);
                }
              }

              // Step completion is INTENTIONAL, never a side effect of tagging a
              // tool call with a stepId. A step is done when a successful
              // run_command matches the step's own verification (below), its last
              // todo is checked (toggleSubtask), or the model explicitly calls
              // complete_step. Previously ANY successful stepId-tagged tool —
              // even a read_file — completed the step and force-checked its
              // todos, so the plan claimed progress for work that never happened
              // and the agent skipped ahead.
              if (action.tool === 'run_command' && outcome.result.ok) {
                completeVerifiedPlanSteps(String(action.params['command'] ?? ''), action.stepId);
              }

              // LSP post-edit gate: after any successful edit, surface diagnostics
              // for the touched files so introduced errors are caught at the source
              // instead of at the evidence gate. Silently skipped when no language
              // server is configured for the file (LSP stays optional).
              let lspNote = '';
              if ((action.tool === 'write_file' || action.tool === 'apply_edit') && outcome.result.ok) {
                const touched = outcome.result.filesTouched ?? [];
                const issues: string[] = [];
                for (const file of touched) {
                  const diag = await lsp.diagnostics(file);
                  if (diag.ok && /^\[(ERROR|WARNING)\]/m.test(diag.output)) {
                    issues.push(diag.output);
                  }
                }
                if (issues.length > 0) {
                  lspNote = `\nLSP DIAGNOSTICS (post-edit check):\n${issues.join('\n\n')}`;
                  this.emit(`lsp      post-edit diagnostics: issues in ${issues.length} file(s) — fix before the evidence gate`);
                }
                // Change-impact analysis: surface edited symbols with wide fan-in
                // so the model checks callers instead of assuming a local fix is
                // safe. Silently skipped without a language server.
                const impact = await analyzeChangeImpact(lsp, touched).catch(() => undefined);
                if (impact) {
                  lspNote += `${lspNote ? '\n' : ''}\n${impact}`;
                  this.emit('impact   wide fan-in symbols changed — caller check advised');
                }
              }

              // Failed commands get the failure DIGEST (error lines + tail) rather
              // than a head slice that typically misses the actual cause.
              const outputForModel = outcome.result.ok
                ? outcome.result.output.slice(0, 2500)
                : `${extractFailureDigest(outcome.result.output)}${outcome.result.output.length > 2500 ? `\n[... ${outcome.result.output.length} chars total; showing failure-relevant lines]` : ''}`;
              let observedResult = `RESULT [${outcome.result.ok ? 'success' : 'error'}] ${outcome.record.paramsSummary}\n${outputForModel}${evidenceNote}${lspNote}`;
              telemetry.noteToolCall();
              if (!outcome.result.ok) {
                // Targeted failure recovery: hand back the compact state needed to
                // diagnose THIS failure — not a replay of the whole conversation.
                const openCriteria = ledger.data.acceptanceCriteria.filter((c) => !c.satisfied);
                const recentFiles = ledger.data.filesChanged.slice(-5);
                observedResult +=
                  `\nRECOVERY (targeted, not the full history):\n` +
                  `  failure: ${outcome.record.paramsSummary}\n` +
                  (outcome.record.errorSignature ? `  signature: ${outcome.record.errorSignature}\n` : '') +
                  (openCriteria.length
                    ? `  open criteria: ${openCriteria
                        .map((c) => `${c.id}:${c.text}`)
                        .join('; ')
                        .slice(0, 300)}\n`
                    : '') +
                  (recentFiles.length ? `  files in play: ${recentFiles.join(', ')}\n` : '') +
                  `  Form a new hypothesis about this specific error, make a targeted fix, then re-verify.`;
              }
              // Plan-order drift: the agent is working a different step than the
              // one the state message points at. Left unremarked, models tend to
              // obey the stale NEXT pointer and jump back and forth.
              const nextStep = ledger.nextStep();
              if (action.stepId && nextStep && nextStep.id !== action.stepId && nextStep.status !== 'done') {
                observedResult +=
                  `\nPLAN ORDER: you are working on ${action.stepId}, but NEXT points at ${nextStep.id} — ${nextStep.description.slice(0, 90)}. ` +
                  `Finish that step first, or revise_step/reorder if the plan order genuinely changed.`;
              }
              if (malformedVerdict) {
                if (malformedVerdict.remind && !malformedVerdict.escalate) {
                  this.emit(`warn    malformed call streak ${malformedVerdict.streak}/3 — schema errors repeating`);
                } else if (malformedVerdict.escalate && !malformedVerdict.halt) {
                  this.emit(`warn    malformed call streak ${malformedVerdict.streak}/3 — strategy change injected`);
                  observedResult = `${observedResult}\n${malformedIntervention(malformedVerdict.streak, action.tool)}`;
                } else if (malformedVerdict.halt) {
                  memory.add({
                    type: 'failure',
                    claim: `Repeated malformed tool calls (${malformedVerdict.streak}×): ${action.tool}`,
                    scope: guard.lock.name,
                    confidence: 0.8,
                  });
                  ledger.addBlocker(`LLM produced ${malformedVerdict.streak} consecutive malformed tool calls (${action.tool}); task stalled.`);
                  exitReason = 'stalled';
                  this.emit('stall   malformed-call spiral detected — stopping');
                  observe(`${observedResult}\n${malformedIntervention(malformedVerdict.streak, action.tool)}`);
                  break mainLoop;
                }
              }
              const img = outcome.result.image;
              const imgValid = typeof img === 'string' && /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]{200,}$/.test(img);
              if (imgValid && this.config.supportsImages) {
                // Older screenshots are cost, but keeping ONLY the newest destroyed
                // cross-page/state consistency on frontend runs: the model could
                // never compare what it changed against what it built before. Keep
                // the most recent few (plus user attachments in the stable prefix,
                // which are always preserved).
                const dropped = stripStaleImages(messages, KEEP_RECENT_SCREENSHOTS, prefixEnd);
                if (dropped > 0) this.emit(`image    dropped ${dropped} stale screenshot(s) from model context`);
                telemetry.noteScreenshot(img!.length - img!.indexOf(',') - 1);
                observe([
                  { type: 'text', text: observedResult },
                  { type: 'image_url', image_url: { url: img! } },
                ]);
                this.emit('image    visual result attached to model context');
              } else if (img) {
                observe(
                  `${observedResult}\n(A screenshot was captured but is not deliverable to the current model${this.config.supportsImages ? ' (invalid image data)' : ' (no image support)'}; it is visible in the desktop Browser panel.)`,
                );
              } else {
                observe(observedResult);
              }
              break;
            }
            case 'capability_action': {
              const registered = this.universalRegistry.get(action.capability);
              if (!registered) {
                observe(
                  `CAPABILITY NOT AVAILABLE: ${action.capability} is not in this host's registered capability catalog. Use a capability id shown in TASK STATE, or research official documentation before proposing a new connection operation.`,
                );
                break;
              }
              const result = await this.universalRegistry.invoke(
                {
                  capability: action.capability,
                  arguments: action.arguments,
                  ...(action.freshness ? { freshness: action.freshness } : {}),
                  source: registered.source,
                  ...(registered.connectionId ? { connectionId: registered.connectionId } : {}),
                },
                {
                  cache: this.providerCache,
                  approvalHandler: async (proposal) => {
                    if (!this.config.approvalHandler) return false;
                    const body = proposal.params === undefined ? '(no arguments)' : JSON.stringify(proposal.params, null, 2).slice(0, 4_000);
                    return this.config.approvalHandler({
                      tool: `capability:${proposal.id}`,
                      tier: proposal.risk === 'destructive' ? 'dangerous' : 'moderate',
                      why: `Registered ${proposal.risk} capability — ${action.reason}`,
                      summary: [`Capability: ${proposal.label} (${proposal.id})`, `Risk: ${proposal.risk}`, `Arguments:\n${body}`].join('\n'),
                    });
                  },
                },
              );
              ledger.syncProviderState(this.providerCache.getEpochs(), this.providerCache.listEvidence());
              const disclosure = connectionResultDisclosure(result.data);
              const rendered = disclosure.text ? `\nDATA (bounded and secret-redacted):\n${disclosure.text}` : '';
              if (result.status === 'ok' || result.status === 'cached') {
                concreteActionSinceLastAsk = true;
                this.emit(`capability ${action.capability} ${result.status}`);
                observe(
                  `CAPABILITY RESULT [${result.status.toUpperCase()}${result.evidenceId ? ` ${result.evidenceId}` : ''}]: ${result.message}${rendered}${disclosure.truncated ? `\n${PROVIDER_TRUNCATED_GUIDANCE}` : ''}\nUse this result as evidence for the next step. A granted approval applies only to this exact invocation.`,
                );
              } else {
                this.emit(`capability ${action.capability} ${result.status} — ${connectionEventReason(result.message)}`);
                observe(
                  `CAPABILITY ${result.status.toUpperCase()}: ${result.message}\nDo not retry an unchanged write. Use the provider result or official documentation to correct the next action.`,
                );
              }
              break;
            }
            case 'connection_action': {
              const connectionActionKey = `${action.connectionId}:${action.operationId}`;
              const progressNow = {
                evidence: ledger.data.evidence.length,
                files: ledger.data.filesChanged?.length ?? 0,
                actions: ledger.data.actions.length,
              };
              const prior = connectionCallTracker.get(connectionActionKey);
              const isConsecutive = lastExecutedActionTag === currentActionTag;
              const hadInterveningWork = !prior ||
                progressNow.evidence > prior.lastProgressAt.evidence ||
                progressNow.files > prior.lastProgressAt.files ||
                progressNow.actions > prior.lastProgressAt.actions ||
                !isConsecutive;

              const tracker: ConnectionCallRecord = hadInterveningWork
                ? {
                    consecutiveCalls: 1,
                    consecutiveFailures: prior?.consecutiveFailures ?? 0,
                    lastDataDigest: prior?.lastDataDigest,
                    lastProgressAt: progressNow,
                  }
                : {
                    consecutiveCalls: (prior?.consecutiveCalls ?? 0) + 1,
                    consecutiveFailures: prior?.consecutiveFailures ?? 0,
                    lastDataDigest: prior?.lastDataDigest,
                    lastProgressAt: progressNow,
                  };
              connectionCallTracker.set(connectionActionKey, tracker);

              if (tracker.consecutiveCalls > 3) {
                const blocker = `Saved connection action ${connectionActionKey} was requested more than three times without a new operation.`;
                ledger.addBlocker(blocker);
                exitReason = 'stalled';
                this.emit(`stall   repeated saved connection action stopped — ${connectionActionKey}`);
                observe(`${blocker} Choose a different registered read operation, revise the plan, or request a corrected connection.`);
                break mainLoop;
              }
              if (!this.config.connectionActionHandler) {
                observe(
                  'No saved-connection adapter is available in this host. Use request_block with a structured provider prerequisite instead of constructing authenticated headers.',
                );
                break;
              }
              // Milestone 3: Retrieval-before-fetch from ProviderReadCache
              const cachedFact = this.providerCache.get(action.connectionId, action.operationId);
              if (cachedFact) {
                concreteActionSinceLastAsk = true;
                tracker.consecutiveFailures = 0;
                telemetry.notePreventedNetworkCall();
                this.emit(`connection ${action.connectionId}/${action.operationId} completed (cache hit)`);
                const disclosure = connectionResultDisclosure(cachedFact.data);
                const rendered = disclosure.text ? `\nDATA (cached fact from epoch ${cachedFact.stateEpoch}):\n${disclosure.text}` : '';
                observe(
                  `PROVIDER EVIDENCE (CACHED [${cachedFact.id}]): Reused fresh provider observation from current state epoch.${rendered}${disclosure.truncated ? `\n${PROVIDER_TRUNCATED_GUIDANCE}` : ''}\nUse this provider result as evidence for discovery; it does not authorize unregistered or write operations.`,
                );
                break;
              }
              try {
                const result = await this.config.connectionActionHandler({ connectionId: action.connectionId, operationId: action.operationId });
                const evidence = this.providerCache.record({
                  connectionId: action.connectionId,
                  capability: action.operationId,
                  operationId: action.operationId,
                  data: result.data,
                });
                ledger.recordProviderEvidence(evidence);
                ledger.syncProviderState(this.providerCache.getEpochs());
                const disclosure = connectionResultDisclosure(result.data);
                const rendered = disclosure.text ? `\nDATA (bounded and secret-redacted):\n${disclosure.text}` : '';
                concreteActionSinceLastAsk = true;
                tracker.consecutiveFailures = 0;
                const dataDigest = result.data !== undefined ? JSON.stringify(result.data) : undefined;
                if (tracker.lastDataDigest !== undefined && dataDigest !== undefined && tracker.lastDataDigest !== dataDigest) {
                  tracker.consecutiveCalls = 1;
                }
                tracker.lastDataDigest = dataDigest;
                this.emit(`connection ${action.connectionId}/${action.operationId} completed`);
                observe(
                  `CONNECTION ACTION RESULT: ${result.message}${rendered}${disclosure.truncated ? `\n${PROVIDER_TRUNCATED_GUIDANCE}` : ''}\nUse this provider result as evidence for discovery; it does not authorize unregistered or write operations.`,
                );
              } catch (error) {
                tracker.consecutiveFailures += 1;
                if (tracker.consecutiveFailures > 3) {
                  const blocker = `Saved connection action ${connectionActionKey} failed repeatedly.`;
                  ledger.addBlocker(blocker);
                  exitReason = 'stalled';
                  this.emit(`stall   repeated saved connection action stopped — ${connectionActionKey}`);
                  observe(`${blocker} Choose a different registered read operation, revise the plan, or request a corrected connection.`);
                  break mainLoop;
                }
                const reason = connectionEventReason((error as Error).message);
                const exampleEcho =
                  action.connectionId === 'saved-connection-id'
                    ? ' The connection id you used is the documentation EXAMPLE — use a real id from REGISTERED SAVED CONNECTIONS in TASK STATE.'
                    : '';
                this.emit(`connection ${action.connectionId}/${action.operationId} failed — ${reason}`);
                observe(
                  `CONNECTION ACTION FAILED: ${(error as Error).message}${exampleEcho}\nDo not retry by adding raw headers to web_fetch. The saved connection and its credential stay valid; resolve the missing operation (registered read for discovery, or documented connection_operation for writes) or, only when the provider positively rejected authentication, use secure reauthorization.`,
                );
              }
              break;
            }
            case 'connection_discovery': {
              const discoveryKey = `${action.connectionId}:${action.intents.join(',')}:${action.resourceIdOrName ?? '*'}`;
              const progressNow = {
                evidence: ledger.data.evidence.length,
                files: ledger.data.filesChanged?.length ?? 0,
                actions: ledger.data.actions.length,
              };
              const prior = connectionCallTracker.get(discoveryKey);
              const isConsecutive = lastExecutedActionTag === currentActionTag;
              const hadInterveningWork = !prior ||
                progressNow.evidence > prior.lastProgressAt.evidence ||
                progressNow.files > prior.lastProgressAt.files ||
                progressNow.actions > prior.lastProgressAt.actions ||
                !isConsecutive;

              const tracker: ConnectionCallRecord = hadInterveningWork
                ? {
                    consecutiveCalls: 1,
                    consecutiveFailures: prior?.consecutiveFailures ?? 0,
                    lastDataDigest: prior?.lastDataDigest,
                    lastProgressAt: progressNow,
                  }
                : {
                    consecutiveCalls: (prior?.consecutiveCalls ?? 0) + 1,
                    consecutiveFailures: prior?.consecutiveFailures ?? 0,
                    lastDataDigest: prior?.lastDataDigest,
                    lastProgressAt: progressNow,
                  };
              connectionCallTracker.set(discoveryKey, tracker);

              if (tracker.consecutiveCalls > 3) {
                const blocker = `Saved connection discovery for ${action.connectionId} was requested more than three times without new results.`;
                ledger.addBlocker(blocker);
                exitReason = 'stalled';
                this.emit(`stall   repeated discovery stopped — ${discoveryKey}`);
                observe(`${blocker} Use existing discovery evidence, choose a different target, or revise the plan.`);
                break mainLoop;
              }
              if (!this.config.connectionDiscoveryHandler && !this.config.connectionActionHandler) {
                observe(
                  'No saved-connection discovery adapter is available in this host. Use request_block with a structured provider prerequisite.',
                );
                break;
              }
              try {
                const handler = this.config.connectionDiscoveryHandler;
                let result: DiscoveryResult;
                if (handler) {
                  result = await handler({
                    connectionId: action.connectionId,
                    intents: action.intents,
                    resourceType: action.resourceType,
                    resourceIdOrName: action.resourceIdOrName,
                    filters: action.filters,
                  });
                } else {
                  const fallbackOp = action.intents.includes('get_environment') ? 'get-application-envs' : 'list-applications';
                  const res = await this.config.connectionActionHandler!({ connectionId: action.connectionId, operationId: fallbackOp });
                  result = {
                    ok: true,
                    connectionId: action.connectionId,
                    requestedIntents: action.intents,
                    completedIntents: action.intents,
                    data: (res.data as Record<string, unknown>) ?? {},
                    summary: res.message,
                    operationsExecuted: [fallbackOp],
                    stopReason: 'complete',
                    truncated: false,
                  };
                }
                const disclosure = connectionResultDisclosure(result.data);
                const rendered = disclosure.text ? `\nDISCOVERY DATA (bounded and secret-redacted):\n${disclosure.text}` : '';
                concreteActionSinceLastAsk = true;
                tracker.consecutiveFailures = 0;
                const dataDigest = result.data !== undefined ? JSON.stringify(result.data) : undefined;
                if (tracker.lastDataDigest !== undefined && dataDigest !== undefined && tracker.lastDataDigest !== dataDigest) {
                  tracker.consecutiveCalls = 1;
                }
                tracker.lastDataDigest = dataDigest;
                this.emit(`connection ${action.connectionId} discovery ${result.stopReason} (${result.operationsExecuted.length} op(s))`);
                observe(
                  `CONNECTION DISCOVERY RESULT (${result.stopReason}): ${result.summary}${rendered}${result.truncated ? `\n${PROVIDER_TRUNCATED_GUIDANCE}` : ''}\nUse this verified discovery state as evidence for planning and decisions.`,
                );
              } catch (error) {
                tracker.consecutiveFailures += 1;
                if (tracker.consecutiveFailures > 3) {
                  const blocker = `Saved connection discovery for ${action.connectionId} failed repeatedly.`;
                  ledger.addBlocker(blocker);
                  exitReason = 'stalled';
                  this.emit(`stall   repeated discovery stopped — ${discoveryKey}`);
                  observe(`${blocker} Resolve the connection error or revise the plan.`);
                  break mainLoop;
                }
                const reason = connectionEventReason((error as Error).message);
                this.emit(`connection ${action.connectionId} discovery failed — ${reason}`);
                observe(`CONNECTION DISCOVERY FAILED: ${(error as Error).message}`);
              }
              break;
            }
            case 'connection_operation': {
              // The key intentionally omits body values. Bodies may contain user
              // business data and must never become model-visible telemetry; a
              // repeated documented operation is still bounded by its immutable
              // connection/id/method/path identity.
              const operationKey = `${action.connectionId}:${action.operation.id}:${action.operation.method}:${action.operation.path}`;
              const operationAttempts = (connectionOperationAttempts.get(operationKey) ?? 0) + 1;
              connectionOperationAttempts.set(operationKey, operationAttempts);
              if (operationAttempts > 3) {
                this.emit(`connection proposal paused — repeated ${operationKey}`);
                observe(
                  `CONNECTION OPERATION PAUSED: ${action.operation.label} was proposed more than three times. Do not retry it unchanged; inspect the provider documentation, use read discovery, or ask the user for a different target.`,
                );
                break;
              }
              if (!this.config.connectionOperationHandler) {
                observe(
                  'This host does not yet provide a provider-operation approval channel. Do not treat that as provider failure: gather documentation and request a user decision or a host update instead of claiming the task is complete.',
                );
                break;
              }
              try {
                const result = await this.config.connectionOperationHandler({
                  connectionId: action.connectionId,
                  operation: action.operation,
                  ...(action.body !== undefined ? { body: action.body } : {}),
                  ...(action.documentationUrl ? { documentationUrl: action.documentationUrl } : {}),
                  reason: action.reason,
                });
                connectionOperationAttempts.delete(operationKey);
                this.providerCache.advanceStateEpoch(action.connectionId);
                ledger.syncProviderState(this.providerCache.getEpochs(), this.providerCache.listEvidence());
                const disclosure = connectionResultDisclosure(result.data);
                const rendered = disclosure.text ? `\nDATA (bounded and secret-redacted):\n${disclosure.text}` : '';
                concreteActionSinceLastAsk = true;
                this.emit(`connection operation ${action.connectionId}/${action.operation.id} completed`);
                observe(
                  `PROVIDER OPERATION RESULT: ${result.message}${rendered}${disclosure.truncated ? `\n${PROVIDER_TRUNCATED_GUIDANCE}` : ''}\nContinue from the provider response. The operation was individually approved and is not blanket authorization for other writes.`,
                );
              } catch (error) {
                const message = (error as Error).message;
                // Post-grant failures are NOT all "not run": a refused or
                // mid-flight-unknown request may still have reached the
                // provider. Re-running a non-idempotent write on a false
                // "not run" creates duplicate resources, so the outcome class
                // (set by ConnectionInvocationError) decides the wording. The
                // event carries the bounded reason so the USER sees why, not
                // only the model.
                const outcome = (error as { outcome?: 'not-run' | 'sent-rejected' | 'sent-unknown' }).outcome;
                const reason = connectionEventReason(message);
                if (outcome === 'sent-rejected' || outcome === 'sent-unknown') {
                  lastProviderRejection = {
                    text: connectionEventReason(`${action.connectionId}/${action.operation.id} ${action.operation.method} ${action.operation.path} — ${message}`),
                    connectionId: action.connectionId,
                  };
                }
                const exampleEcho =
                  action.connectionId === 'saved-connection-id'
                    ? ' The connection id you used is the documentation EXAMPLE — use a real id from REGISTERED SAVED CONNECTIONS in TASK STATE.'
                    : '';
                if (outcome === 'sent-rejected') {
                  this.emit(`connection operation ${action.connectionId}/${action.operation.id} rejected — ${reason}`);
                  const sentBody =
                    action.body === undefined ? '(no request body)' : JSON.stringify(action.body).slice(0, 2_000);
                  observe(
                    `PROVIDER OPERATION REJECTED: ${message}\n` +
                      `Request you sent: ${action.operation.method} ${action.operation.path}\nBody: ${sentBody}\n` +
                      'The request REACHED the provider and was refused — the provider error above says exactly what was wrong (missing field, wrong id, permission scope). Fix the documented operation or body accordingly, and verify provider state before any retry: a refused write may still have had partial effects. Do not loop the identical request.' +
                      `${exampleEcho}`,
                  );
                } else if (outcome === 'sent-unknown') {
                  this.emit(`connection operation ${action.connectionId}/${action.operation.id} outcome unknown — ${reason}`);
                  observe(
                    `PROVIDER OPERATION OUTCOME UNKNOWN: ${message}${exampleEcho}\n` +
                      'The request was sent but its result could not be confirmed. Check the provider console or a registered read operation before ANY retry — re-running a non-idempotent write can duplicate resources.',
                  );
                } else {
                  this.emit(`connection operation ${action.connectionId}/${action.operation.id} not run — ${reason}`);
                  observe(
                    `PROVIDER OPERATION NOT RUN: ${message}${exampleEcho}\nDo not claim this action happened. Revise the documented operation, use read discovery, or ask the user for clarification; do not put credentials in a tool call.`,
                  );
                }
              }
              break;
            }
            case 'claim_criterion': {
              const currentFp = await getWorkspaceFingerprint(guard.activeWritableRoot);
              const link = evidence.link(ledger.data, action.criterionId, action.evidenceId, currentFp);
              ledger.save();
              this.emit(`claim    ${action.criterionId} <- ${action.evidenceId}: ${link.ok ? 'accepted' : link.reason}`);
              if (link.ok) {
                for (const identity of ledger.data.usedSkillIdentities ?? []) {
                  ledger.recordSkillEvent({
                    stage: 'verified',
                    name: identity.name,
                    version: identity.version,
                    contentHash: identity.contentHash,
                    scope: identity.scope,
                    reason: `criterion ${action.criterionId} accepted`,
                  });
                }
                const criterion = ledger.data.acceptanceCriteria.find((c) => c.id === action.criterionId);
                const evidenceRecord = ledger.data.evidence.find((e) => e.id === action.evidenceId);
                const weak =
                  criterion && evidenceRecord && isWeakEvidenceLink(criterion, evidenceRecord)
                    ? '\nNOTE: weakly bound — this criterion pins no verification command, so any passing command would satisfy it. Pin it with a real verification command for hard proof.'
                    : '';
                observe(`Accepted: ${link.reason}${weak}`);
              } else {
                observe(`Rejected: ${link.reason}`);
              }
              break;
            }
            case 'complete': {
              if (conversationControl) {
                completionInput = { summary: action.summary, risks: action.risks ?? [], followUps: action.followUps ?? [] };
                if (preservePausedWork) this.emit(`say ${action.summary}`);
                conversationCompleted = true;
                exitReason = preservePausedWork ? 'blocked' : 'complete';
                break;
              }
              const currentFp = await getWorkspaceFingerprint(guard.activeWritableRoot);
              const gate = evidence.gate(ledger.data, currentFp);
              const lightweight = agentWorkflow ? agentVerificationGate(activePhaseData(), agentBaselineFingerprint, currentFp) : undefined;
              if (lightweight) {
                gate.open = lightweight.open && (gate.totalCount === 0 || gate.open);
                if (!lightweight.open) gate.missing.push(lightweight.reason);
              }
              const conversation = agentWorkflow && ledger.data.actions.slice(actionsAtStart).every(a => isObservationTool(a.tool)) && currentFp === agentBaselineFingerprint;
              const chatOnly = agentWorkflow ? conversation && gate.open : Boolean(action.chat) && ledger.data.actions.length === actionsAtStart;
              if (!gate.open && !chatOnly) {
                observe(
                  `COMPLETION REJECTED by evidence gate (${gate.satisfiedCount}/${gate.totalCount} criteria backed).\n` +
                    `Still missing:\n${gate.missing.map((m) => `  - ${m}`).join('\n')}\n` +
                    `Continue working, or request_block if you cannot proceed.`,
                );
                break;
              }
              // Visual-verification gate: UI work is only done when the final state
              // was actually SEEN. Command evidence cannot see pixels, so without
              // this gate broken/unfinished layouts ship as "complete". Soft-capped
              // like the architecture audit so it can never deadlock a task.
              const visual = uiVisualGate(activePhaseData(), {
                browserAvailable: Boolean(this.config.browser?.available()),
                visionAvailable: this.config.supportsImages ?? false,
              });
              if (!visual.verified && !chatOnly) {
                if (visualGateRejections < 2) {
                  visualGateRejections += 1;
                  observe(
                    `COMPLETION REJECTED by visual-verification gate — ${visual.reason}.\n` +
                      `Serve or rebuild the app (run_command), browse navigate to it, take a screenshot of every changed view ` +
                      `(and exercise interactions with click/type where relevant), confirm layout, content, and states look right, then complete again.`,
                  );
                  break;
                }
                this.emit('visual-gate screenshot requirement unmet — overriding after repeated rejections');
                action.risks = [...(action.risks ?? []), 'Final UI state was never verified with a screenshot'];
              }

              // Active visual reference validation
              const activeVisualRefs = typeof ledger.activeVisualReferences === 'function' ? ledger.activeVisualReferences() : [];
              if (!chatOnly && activeVisualRefs.length > 0) {
                const hasRecentScreenshot = activePhaseData().actions.some((a) => (a.tool === 'browse' || a.tool === 'screenshot') && a.status === 'success');
                if (!hasRecentScreenshot && visualGateRejections < 2) {
                  visualGateRejections += 1;
                  observe(
                    `COMPLETION REJECTED by visual reference gate — task has active visual reference(s) (${activeVisualRefs.map((v) => v.id).join(', ')}), but no screenshot or visual inspection was recorded after changes.\n` +
                      `Use browse (screenshot/navigate) to inspect the result visually before completing.`,
                  );
                  break;
                }
              }
              // Instruction-aware completion gate: user requirements issued during
              // the task must show work after they were created, and a blocked
              // instruction violation must be followed by compliant work. Soft-capped
              // like the other judgment gates so it can never deadlock a task.
              if (!chatOnly && typeof ledger.activeInstructions === 'function') {
                const gateFinding = evaluateInstructionGate(
                  ledger.activeInstructions().map((i) => ({
                    text: i.text,
                    enforcement: i.enforcement,
                    status: i.status,
                    createdAt: i.createdAt,
                    verification: i.verification,
                  })),
                  activePhaseData().actions.map((a) => ({ tool: a.tool, status: a.status, createdAt: a.createdAt, observation: a.observation })),
                  ledger.data.evidence.map((e) => ({ kind: e.kind, command: e.command, passed: e.passed, createdAt: e.createdAt, stale: e.stale })),
                );
                const gateBlocked = gateFinding.unmetRequirements.length > 0 || gateFinding.denialUnrecovered;
                if (gateBlocked && instructionGateRejections < 2) {
                  instructionGateRejections += 1;
                  const lines = [
                    ...gateFinding.unmetRequirements.map((t) => `  - requirement never worked on after it was issued: "${t}"`),
                    ...(gateFinding.denialUnrecovered
                      ? ['  - the latest action violated a hard user instruction and was blocked; no compliant action has been recorded since']
                      : []),
                  ];
                  observe(
                    `COMPLETION REJECTED by instruction gate — active user instructions are not yet satisfied:\n${lines.join('\n')}\n` +
                      `Do the required work (respecting every hard instruction), then complete again.`,
                  );
                  break;
                }
                if (gateBlocked) {
                  this.emit('instruction gate findings noted but overridden after repeated rejections — recorded as a risk');
                  action.risks = [...(action.risks ?? []), `Unverified user instruction(s): ${gateFinding.unmetRequirements[0]?.slice(0, 200) ?? 'blocked instruction not re-attempted compliantly'}`];
                }
              }
              // Architecture audit: verify the implementation actually follows the
              // recorded decisions. A soft gate — after two rejections the agent's
              // judgment wins so this can never deadlock a legitimate task.
              if (!chatOnly && (ledger.data.architectureDecisions ?? []).some((d) => d.status === 'active')) {
                const audit = auditArchitecture(ledger.data, guard.lock.repoRoot);
                if (!audit.ok && architectureAuditRejections < 2) {
                  architectureAuditRejections += 1;
                  observe(
                    `COMPLETION REJECTED by architecture review — the implementation does not match the recorded decision(s):\n` +
                      `${audit.issues.map((i) => `  - ${i}`).join('\n')}\n` +
                      `Either bring the implementation in line with the decision, or record a new decision (record_decision with supersedes) explaining the change, then complete again.`,
                  );
                  break;
                }
                if (!audit.ok) {
                  this.emit('decision architecture drift noted but overridden by engineering judgment — recorded as a risk');
                  action.risks = [...(action.risks ?? []), `Architecture drift: ${audit.issues[0]?.slice(0, 200)}`];
                }
              }
              // Bug rigor gate: "verification passed" does not prove the bug was
              // fixed — the pre-existing suite may never have covered it. A bug
              // fix must show causality: a recorded root cause, and a FAIL ->
              // (edit) -> PASS pair for the same non-trivial command. Soft-capped
              // like the architecture audit so it can never deadlock a task whose
              // reproduction is genuinely impossible.
              if (
                !chatOnly &&
                isBugTask &&
                activePhaseData().actions.some(
                  (record) => record.status === 'success' && (record.tool === 'write_file' || record.tool === 'apply_edit' || record.tool === 'run_command'),
                )
              ) {
                const missing: string[] = [];
                if (!ledger.data.currentHypothesis) {
                  missing.push('a recorded root cause — call set_hypothesis stating why the bug happened');
                }
                if (!hasRegressionProof(activePhaseData())) {
                  missing.push(
                    'regression proof — no command went FAIL before your fix and PASS after it. Run the reproduction/verification command FIRST (watch it fail), fix, then run the SAME command again',
                  );
                }
                if (missing.length > 0 && bugRigorRejections < 2) {
                  bugRigorRejections += 1;
                  this.emit('rigor    bug-fix completion rejected — root cause / regression proof missing');
                  observe(
                    `COMPLETION REJECTED by bug-fix rigor gate:\n${missing.map((m) => `  - ${m}`).join('\n')}\n` +
                      `Do that, then complete again. If reproduction is genuinely impossible (environment/data specific), complete again — the gate yields after repeated rejection and records the gap as a risk.`,
                  );
                  break;
                }
                if (missing.length > 0) {
                  action.risks = [...(action.risks ?? []), `Bug-fix rigor override: completed without ${missing.join(' and ')}.`];
                  this.emit('rigor    bug-fix gap accepted after repeated rejection — recorded as a risk');
                }
              }
              // Plan reconciliation: the criteria/evidence gate above is the
              // completion authority, but an ABANDONED plan must be reconciled
              // explicitly — open steps mean either work the criteria missed or
              // stale scope. One forced reconciliation so this can never deadlock;
              // after that, completing with open steps is recorded as a risk.
              const openSteps = ledger.data.plan.filter(
                (step) => !activeWorkPhase.priorPlanStepIds.includes(step.id) && (step.status === 'pending' || step.status === 'in_progress'),
              );
              if (!chatOnly && openSteps.length > 0 && activePhaseData().actions.length > 0) {
                if (planReconcileRejections < 1) {
                  planReconcileRejections += 1;
                  this.emit(`reconcile completion rejected — ${openSteps.length} open plan step(s): ${openSteps.map((s) => s.id).join(', ')}`);
                  observe(
                    `COMPLETION REJECTED — the plan still has open step(s): ${openSteps.map((s) => `${s.id} (${s.description.slice(0, 60)})`).join('; ')}.\n` +
                      `Reconcile before completing: finish the work, mark genuinely-finished steps done (complete_step), or revise_step to explicitly drop scope that is no longer needed. Then complete again.`,
                  );
                  break;
                }
                action.risks = [...(action.risks ?? []), `Completed with ${openSteps.length} open plan step(s): ${openSteps.map((s) => s.id).join(', ')}.`];
                this.emit('reconcile open plan steps accepted at completion — recorded as a risk');
              }
              // Final quality review: a risk-triggered second-opinion pass over
              // finished work — diff summary + criteria, and for UI tasks the
              // last screenshot judged by the model itself (vision), closing the
              // "nobody looks at the pixels" gap. Safe documentation/comment-only
              // work can skip only after every deterministic gate has proved it
              // harmless. Bound the repair rounds, but review the result of the
              // last allowed repair before escalating an unresolved warning.
              const reviewRoundCap = effortPlan?.complexity === 'high' ? 2 : 1;
              const reviewWarning = unresolvedQualityReview;
              // A rejection requests a repair; it does not review that repair.
              // The final repair deserves one fresh review even when the last
              // rejection reached the cap. Never reset the counter on edits:
              // repeated changes must not create an unlimited review loop.
              const reviewRepairedWorkspace =
                reviewWarning !== undefined &&
                unresolvedQualityReviewFingerprint !== undefined &&
                unresolvedQualityReviewFingerprint !== currentFp &&
                qualityReviewRejections === reviewRoundCap;
              if (riskPlan.strictVerification && reviewWarning !== undefined && qualityReviewRejections >= reviewRoundCap && !reviewRepairedWorkspace) {
                const summary = reviewWarning.slice(0, 600);
                if (!this.config.approvalHandler) {
                  const blocker = `Strict-risk quality reviewer warning needs explicit user approval: ${summary}`;
                  ledger.addBlocker(blocker);
                  this.emit('review   strict-risk warning unresolved — blocked because no approval handler is available');
                  exitReason = 'blocked';
                  break;
                }
                this.emit('review   strict-risk warning remains — explicit user approval required to complete');
                const approved = await this.config.approvalHandler({
                  tool: 'quality-review',
                  tier: 'dangerous',
                  why: 'A security, payments, or data-integrity task still has an unresolved final quality-review warning.',
                  summary,
                });
                if (!approved) {
                  // A rejection means "keep working", not "complete with risk".
                  // Reset the counter so the eventual repair gets a fresh review.
                  qualityReviewRejections = 0;
                  unresolvedQualityReview = undefined;
                  unresolvedQualityReviewFingerprint = undefined;
                  this.emit('review   strict-risk completion not approved — returning to repair and fresh review');
                  observe(
                    `USER DID NOT APPROVE completion with the unresolved quality-review warning:\n${summary}\n` +
                      `Fix it, then complete again. A fresh quality review will run before this task can finish.`,
                  );
                  break;
                }
                action.risks = [...(action.risks ?? []), `User accepted unresolved strict-risk quality-review warning: ${summary}`];
                unresolvedQualityReview = undefined;
                unresolvedQualityReviewFingerprint = undefined;
                this.emit('review   strict-risk quality warning explicitly accepted by user — recorded as a release risk');
              }
              if (!riskPlan.strictVerification && reviewWarning !== undefined && qualityReviewRejections >= reviewRoundCap && !reviewRepairedWorkspace) {
                // Non-strict work may proceed after its bounded repair budget, but
                // never silently: the final report must say the reviewer concern
                // was not independently cleared.
                action.risks = [
                  ...(action.risks ?? []),
                  `Unresolved final quality-review warning accepted after ${qualityReviewRejections} revision round(s): ${reviewWarning.slice(0, 600)}`,
                ];
                unresolvedQualityReview = undefined;
                unresolvedQualityReviewFingerprint = undefined;
                this.emit('review   quality warning unresolved after repair budget — recorded as a release risk');
              }
              // Collect one completion diff snapshot. The final report reuses
              // this exact snapshot when its workspace fingerprint and HEAD
              // still match, rather than rerunning equivalent Git operations.
              const completionAttempt = ++completionAttempts;
              const currentHeadRef = (await gitExec(guard.activeWritableRoot, ['rev-parse', 'HEAD']).catch(() => '')).trim() || undefined;
              const existingSnapshot = ledger.data.latestVerifiedDiff;
              let verifiedDiff: VerifiedDiffSnapshot;
              if (
                isVerifiedDiffSnapshotCurrent(existingSnapshot, {
                  phaseId: activeWorkPhase.id,
                  workspaceFingerprint: currentFp,
                  headRef: currentHeadRef,
                })
              ) {
                verifiedDiff = existingSnapshot;
                this.emit(`review   reusing verified diff snapshot from completion attempt ${existingSnapshot.attempt}`);
              } else {
                const deepReview = effortPlan?.complexity === 'high';
                const collected = await collectQualityReviewDiff(
                  guard.activeWritableRoot,
                  activeWorkPhase.baseRef || ledger.data.checkpoints,
                  deepReview ? 8_000 : 4_000,
                );
                verifiedDiff = {
                  phaseId: activeWorkPhase.id,
                  workspaceFingerprint: currentFp,
                  headRef: collected.headRef,
                  baseRef: collected.baseRef,
                  changedFiles: collected.changedFiles,
                  diffStat: collected.diffStat,
                  ...(collected.diffBody ? { diffBody: collected.diffBody } : {}),
                  diffBodyTruncated: collected.diffBodyTruncated,
                  collectedAt: new Date().toISOString(),
                  attempt: completionAttempt,
                };
                ledger.data.latestVerifiedDiff = verifiedDiff;
                ledger.save();
                this.emit(`review   verified diff snapshot collected for completion attempt ${completionAttempt}`);
              }
              const phaseData = { ...activePhaseData(), filesChanged: verifiedDiff.changedFiles };
              const qualityDecision = shouldRunFinalQualityReview({
                effortPlan,
                riskPlan,
                bugFix: isBugTask,
                phaseData,
                diff: verifiedDiff,
                workspaceFingerprint: currentFp,
                evidenceGateOpen: gate.open,
                specialistOrVerificationUncertain: specialistOrVerificationUncertain || unresolvedQualityReview !== undefined,
              });
              const wantsReview = !chatOnly && this.config.mode !== 'chat' && qualityDecision.run && (qualityReviewRejections < reviewRoundCap || reviewRepairedWorkspace);
              if (!wantsReview && !chatOnly && !qualityDecision.run) {
                this.emit(`review   final AI quality review skipped — ${qualityDecision.reason}; evidence gates remain enforced`);
              }
              if (wantsReview) {
                try {
                  const deepReview = effortPlan?.complexity === 'high';
                  const reviewingUi = isUiTask(phaseData);
                  const reviewMsgs = buildQualityReviewMessages({
                    goal: activeGoal,
                    criteria: phaseData.acceptanceCriteria.map((criterion) => criterion.text),
                    filesChanged: verifiedDiff.changedFiles,
                    diffStat: verifiedDiff.diffStat,
                    diffBody: verifiedDiff.diffBody,
                    summary: action.summary,
                    uiTask: reviewingUi,
                    frontendDesign: reviewingUi ? phaseData.planDesign?.frontend : undefined,
                    browserEvidence: reviewingUi ? findLastBrowserEvidence(phaseData) : undefined,
                    screenshotUrl: reviewingUi ? findLastScreenshotUrl(messages) : undefined,
                  });
                  const reviewReply = await llm.completeStream(reviewMsgs, { effort: deepReview ? 'medium' : 'low', signal: this.abortController?.signal }, () => {});
                  telemetry.recordCall(reviewMsgs, undefined, 0, 'planning');
                  const review = parseReviewVerdict(reviewReply);
                  if (review.verdict === 'unavailable') {
                    const warning = `Final quality review was unavailable: ${review.feedback}`;
                    this.emit('review   quality reviewer returned no usable verdict');
                    if (riskPlan.strictVerification) {
                      // Strict-risk work cannot claim the second opinion happened.
                      // The next completion goes through the explicit approval
                      // path above, rather than silently accepting this gap.
                      qualityReviewRejections = reviewRoundCap;
                      unresolvedQualityReview = warning;
                      unresolvedQualityReviewFingerprint = undefined;
                      observe(
                        `${warning}\nCOMPLETION PAUSED: submit completion again to request explicit user approval, or restore reviewer availability and re-run the final review.`,
                      );
                      break;
                    }
                    action.risks = [...(action.risks ?? []), warning];
                  }
                  if (review.verdict === 'revise') {
                    qualityReviewRejections += 1;
                    unresolvedQualityReview = review.feedback;
                    unresolvedQualityReviewFingerprint = currentFp;
                    this.emit(qualityReviewRejections > reviewRoundCap
                      ? 'review   quality reviewer still flagged the result after the final repair'
                      : `review   quality reviewer flagged the result — revision ${qualityReviewRejections}/${reviewRoundCap} requested`);
                    observe(
                      `COMPLETION REJECTED by final quality review. Issues found:\n${review.feedback}\n` +
                        (qualityReviewRejections > reviewRoundCap
                          ? riskPlan.strictVerification
                            ? `The final repair review still found unresolved issues. Call complete again to request explicit user approval of the remaining release risk.`
                            : `The automatic repair rounds are exhausted. Call complete again to record the unresolved warning as a release risk.`
                          : riskPlan.strictVerification
                            ? `Fix these problems, then call complete again. If the reviewer still rejects the final result after the allowed repair rounds, only an explicit user approval can accept that release risk.`
                            : `Fix these problems, then call complete again. If you already addressed them or disagree with the review, call complete again — it will be accepted.`),
                    );
                    break;
                  }
                  unresolvedQualityReview = undefined;
                  unresolvedQualityReviewFingerprint = undefined;
                } catch (err) {
                  const warning = `Final quality review could not run: ${(err as Error).message.slice(0, 300)}`;
                  this.emit('review   quality reviewer unavailable — review gap recorded');
                  if (riskPlan.strictVerification) {
                    qualityReviewRejections = reviewRoundCap;
                    unresolvedQualityReview = warning;
                    unresolvedQualityReviewFingerprint = undefined;
                    observe(
                      `${warning}\nCOMPLETION PAUSED: submit completion again to request explicit user approval, or restore reviewer availability and re-run the final review.`,
                    );
                    break;
                  }
                  action.risks = [...(action.risks ?? []), warning];
                }
              }
              completionInput = {
                summary: action.summary,
                risks: action.risks ?? [],
                followUps: action.followUps ?? [],
              };
              exitReason = 'complete';
              break;
            }
            case 'ask_user': {
              // Discovery-first: if saved connections exist and the question
              // asks for a resource identifier the provider could resolve, hold
              // the question ONCE so the model performs narrower provider reads
              // (list → get(id) → status → environment) before disturbing the
              // user. Re-asking the identical question delivers it.
              const connectionContext = this.config.connectionContext?.();
              if (connectionContext?.trim() && asksForResourceIdentifier(action.questions)) {
                const signature = action.questions.map((q) => `${q.header ?? ''}:${q.question}`).join('|').slice(0, 240);
                const held = (heldResourceIdQuestions.get(signature) ?? 0) + 1;
                heldResourceIdQuestions.set(signature, held);
                if (held <= 1) {
                  this.emit('ask-user held once — provider discovery first');
                  observe(
                    `HOLDING YOUR QUESTION (one turn): saved provider connections exist and this question asks for a resource identifier the provider can resolve. ` +
                      `Run narrower provider reads first (list → locate the resource → get(id) → status → environment) using the saved connection. ` +
                      `If provider discovery genuinely cannot resolve it, ask the SAME question again and it will be delivered to the user.`,
                  );
                  break;
                }
              }
              if (this.config.askUserHandler) {
                this.emit(`ask-user ${action.questions.length} question(s) for you`);
                const answer = await this.config.askUserHandler(action.questions);
                this.emit('ask-user answered');
                observe(`User answered your clarifying questions:\n${answer}\nUse these answers to set criteria and plan.`);
              } else {
                observe('No interactive user is available. State explicit assumptions with set_hypothesis and proceed.');
              }
              break;
            }
            case 'parallel': {
              this.emit(`parallel ${action.calls.length} concurrent tool calls`);
              // The in-app browser is stateful: only one state-changing browser
              // operation may run at a time.  Non-browser tools stay parallel;
              // browser calls are serialized afterwards so a click/type/screenshot
              // sequence never races against itself.
              const browserCalls: { call: (typeof action.calls)[number]; index: number }[] = [];
              const otherCalls: { call: (typeof action.calls)[number]; index: number }[] = [];
              action.calls.forEach((call, index) => {
                (call.tool === 'browse' ? browserCalls : otherCalls).push({ call, index });
              });
              const outcomes: (Awaited<ReturnType<typeof executor.execute>> | undefined)[] = new Array(action.calls.length);
              const runOne = async (call: (typeof action.calls)[number], index: number): Promise<void> => {
                // Batched calls are real tool executions too; without this every
                // parallel turn undercounts tokenTelemetry.toolCalls.
                telemetry.noteToolCall();
                outcomes[index] = await executor.execute({
                  tool: call.tool,
                  params: call.params,
                  reason: call.reason,
                  expected: call.expected,
                });
              };
              await Promise.all(otherCalls.map(({ call, index }) => runOne(call, index)));
              for (const { call, index } of browserCalls) {
                await runOne(call, index);
                this.emit(`browser action serialized — one state-changing operation at a time`);
              }
              const currentFp = await getWorkspaceFingerprint(guard.activeWritableRoot);
              const parts = outcomes.map((o, i) => {
                if (!o) return `[${i + 1}] (not executed)`;
                let evidenceNote = '';
                if (o.record.tool === 'run_command') {
                  const command = String(action.calls[i]?.params['command'] ?? '');
                  const kind = classifyEvidenceKind(command);
                  const ev = evidence.record(ledger.data, {
                    kind,
                    label: o.record.paramsSummary,
                    command,
                    exitCode: o.result.exitCode,
                    passed: o.result.ok,
                    output: o.result.output,
                    workspaceFingerprint: currentFp,
                  });
                  ledger.save();
                  evidenceNote = `\nEVIDENCE RECORDED: ${ev.id} [${ev.passed ? 'PASS' : 'FAIL'}] (${kind}). You may cite it with claim_criterion.`;
                  this.emit(`evidence ${ev.id} ${ev.passed ? 'PASS' : 'FAIL'} (${kind})`);
                  if (o.result.ok) completeVerifiedPlanSteps(command);
                }
                return `[${i + 1}] ${o.record.paramsSummary} → ${o.result.ok ? 'success' : 'error'}\n${o.result.output.slice(0, 1200)}${evidenceNote}`;
              });
              observe(`PARALLEL RESULTS:\n${parts.join('\n\n')}`);
              break;
            }
            case 'report_finding': {
              const finding = ledger.addFinding({
                claim: action.claim,
                kind: (action.kind as TaskFinding['kind']) ?? 'other',
                severity: action.severity as TaskFinding['severity'],
                location: action.location,
                reproductionCommand: action.reproductionCommand,
              });
              this.emit(`finding  ${finding.id} reported (${finding.kind}) — will be verified before the report`);
              observe(
                `FINDING RECORDED (${finding.id}). It will be handed to an independent verifier that attempts to reproduce it ` +
                  `${action.reproductionCommand ? `with exactly: ${action.reproductionCommand}` : 'with its own reproduction attempt'}. ` +
                  `Only findings that reproduce with real evidence are reported as confirmed; continue your task.`,
              );
              break;
            }
            case 'request_block': {
              const prerequisite = action.prerequisite ?? inferMissingPrerequisite(action.reason, action.reason);
              if (prerequisite) {
                this.emit(`recovery RESOLVING_PREREQUISITE — ${prerequisite.description}`);
                const resolution = await prerequisiteResolver.resolve(prerequisite, {
                  repoRoot: guard.activeWritableRoot,
                  goal: activeGoal,
                  ledger,
                  specialist: false,
                });
                for (const attempt of resolution.attempts) {
                  this.emit(`recovery ${attempt.status} — ${attempt.strategy}: ${attempt.outcome.slice(0, 180)}`);
                }
                if (resolution.status === 'resolved') {
                  const connectionContext = this.config.connectionContext?.();
                  observe(
                    `PREREQUISITE RESOLVED: ${prerequisite.description}. ${resolution.message} ` +
                      `Continue the task; do not request_block for this prerequisite again. Values and provider references stay protected.` +
                      (connectionContext ? `\nREGISTERED SAVED CONNECTIONS (metadata only):\n${connectionContext}` : ''),
                  );
                  break;
                }
                if (resolution.status === 'needs-user' && this.config.askUserHandler && resolution.question) {
                  this.emit(`ask-user prerequisite decision needed — ${prerequisite.description}`);
                  const answer = await this.config.askUserHandler([resolution.question]);
                  this.emit('ask-user answered prerequisite decision');
                  observe(`User chose how to resolve ${prerequisite.description}: ${answer}\nContinue with that decision; do not claim a provider action you did not execute.`);
                  break;
                }
                // A saved connection is user-owned input, so never ask the model
                // to carry a token in conversation. The host renders a secure
                // form, stores the credential separately, validates it, then the
                // resolver gets one fresh discovery pass. BUT a saved connection
                // with a valid credential is NOT one of these cases: when only an
                // operation/capability is missing, MISSING_OPERATION !==
                // INVALID_CONNECTION — the model resolves the capability under the
                // existing credential instead of prompting the user again.
                if (resolution.status === 'exhausted' && this.config.connectionRequestHandler && (prerequisite.providerHint || prerequisite.capabilities?.length)) {
                  const decision: ConnectionRecoveryDecision = (await this.config.connectionRecoveryCheck?.(prerequisite)) ?? {
                    action: 'setup-new',
                    reason: 'The host has no capability-aware recovery routing.',
                  };
                  if (decision.action === 'capability-resolution') {
                    const noteCount = (capabilityResolutionNotes.get(prerequisite.id) ?? 0) + 1;
                    capabilityResolutionNotes.set(prerequisite.id, noteCount);
                    if (noteCount > 2) {
                      const blocked = `${decision.reason}\nRepeatedly re-requested a resolvable capability instead of using the saved connection (registered reads / documented connection_operation).`;
                      ledger.addBlocker(blocked);
                      exitReason = 'blocked';
                      observe(`Recovery stopped after repeated capability-resolution requests:\n${blocked}`);
                      break;
                    }
                    ledger.recordPrerequisiteRecovery({
                      prerequisiteId: prerequisite.id,
                      prerequisiteKind: prerequisite.kind,
                      description: prerequisite.description,
                      requiredFor: prerequisite.requiredFor,
                      strategy: 'capability-resolution',
                      status: 'CAPABILITY_RESOLUTION',
                      outcome: decision.reason,
                      risk: RecoveryRisk.READ_ONLY,
                    });
                    this.emit(`capability resolution required — ${decision.reason}`);
                    observe(
                      `CAPABILITY RESOLUTION REQUIRED: ${decision.reason}\n` +
                        'Use the saved connection — it is valid and its credential remains private. Propose the exact operation: ' +
                        'safe reads come from registered read operations; documented writes go through connection_operation with a documentationUrl (the host shows the exact request for approval and registers it). ' +
                        'Do NOT ask the user to re-enter the API key, token, or base URL. Continue the task. The connection state and operation availability are tracked separately.',
                    );
                    break;
                  }
                  if (decision.action === 'reauth') {
                    ledger.recordPrerequisiteRecovery({
                      prerequisiteId: prerequisite.id,
                      prerequisiteKind: prerequisite.kind,
                      description: prerequisite.description,
                      requiredFor: prerequisite.requiredFor,
                      strategy: 'secure-connection-request',
                      status: 'CONNECTION_REAUTH',
                      outcome: `${decision.reason} Secure reauthorization is the appropriate recovery; do not treat connection setup as a capability gap.`,
                      risk: RecoveryRisk.READ_ONLY,
                    });
                    this.emit(`connection reauthorization required — ${decision.reason}`);
                  } else {
                    ledger.recordPrerequisiteRecovery({
                      prerequisiteId: prerequisite.id,
                      prerequisiteKind: prerequisite.kind,
                      description: prerequisite.description,
                      requiredFor: prerequisite.requiredFor,
                      strategy: 'secure-connection-request',
                      status: 'NEEDS_USER',
                      outcome: 'Waiting for the user to configure and validate a saved connection through the local secure form.',
                      risk: RecoveryRisk.READ_ONLY,
                    });
                    this.emit(`connection setup required — ${prerequisite.description}`);
                  }
                  const connected = await this.config.connectionRequestHandler(prerequisite);
                  if (connected) {
                    this.emit(`connection saved — retrying discovery for ${prerequisite.description}`);
                    const retried = await prerequisiteResolver.resolve(prerequisite, {
                      repoRoot: guard.activeWritableRoot,
                      goal: activeGoal,
                      ledger,
                      specialist: false,
                      retry: true,
                    });
                    for (const attempt of retried.attempts) {
                      this.emit(`recovery ${attempt.status} — ${attempt.strategy}: ${attempt.outcome.slice(0, 180)}`);
                    }
                    if (retried.status === 'resolved') {
                      const connectionContext = this.config.connectionContext?.();
                      observe(
                        `PREREQUISITE RESOLVED after secure connection setup: ${prerequisite.description}. ${retried.message} Continue the task; values and provider references stay protected.` +
                          (connectionContext ? `\nREGISTERED SAVED CONNECTIONS (metadata only):\n${connectionContext}` : ''),
                      );
                      break;
                    }
                    const blocked = formatBlockedPrerequisite(retried);
                    ledger.addBlocker(blocked);
                    exitReason = 'blocked';
                    observe(`Saved connection did not resolve the prerequisite:\n${blocked}`);
                    break;
                  }
                } else if (resolution.status === 'exhausted' && (prerequisite.providerHint || prerequisite.capabilities?.length)) {
                  // No host connection form exists (e.g. plain CLI run): explain
                  // the distinction so the model never fabricates a credential.
                  ledger.recordPrerequisiteRecovery({
                    prerequisiteId: prerequisite.id,
                    prerequisiteKind: prerequisite.kind,
                    description: prerequisite.description,
                    requiredFor: prerequisite.requiredFor,
                    strategy: 'capability-resolution',
                    status: 'CAPABILITY_RESOLUTION',
                    outcome: 'No host connection form; the missing need is capability-level. A saved connection (if any) must be reused, never re-created.',
                    risk: RecoveryRisk.READ_ONLY,
                  });
                  this.emit(`capability resolution required — no saved-connection host form is available`);
                }
                const blocked = formatBlockedPrerequisite(resolution);
                ledger.addBlocker(blocked);
                exitReason = 'blocked';
                observe(`Recovery exhausted before block:\n${blocked}`);
                break;
              }
              ledger.addBlocker(action.reason);
              exitReason = 'blocked';
              observe(`Block recorded: ${action.reason}`);
              break;
            }
            case 'delegate': {
              // Adaptive effort: a recovered logical job reuses its existing
              // allocation. Only genuinely new specialists consume this budget.
              const remSpec = effortMaxSpecialists - delegateSlotsUsed;
              const resumedTasks = action.tasks.filter((task) => Boolean(task.resume?.jobId));
              const freshTasks = action.tasks.filter((task) => !task.resume?.jobId);
              if (remSpec <= 0 && resumedTasks.length === 0) {
                this.emit(`delegate budget exhausted — ${effortMaxSpecialists}/${effortMaxSpecialists} specialists used`);
                observe(
                  `SPECIALIST BUDGET EXHAUSTED — you have already used all ${effortMaxSpecialists} specialist delegation(s) for this task. ` +
                    `Complete any remaining work with your own tools; do not call delegate again.`,
                );
                break;
              }
              const allowedFresh = freshTasks.slice(0, Math.max(0, remSpec));
              const allowedFreshSet = new Set(allowedFresh);
              const runTasks = action.tasks.filter((task) => Boolean(task.resume?.jobId) || allowedFreshSet.has(task));
              const droppedTasks = freshTasks.length - allowedFresh.length;
              delegateSlotsUsed += allowedFresh.length;
              this.emit(
                `delegate ${runTasks.length} sub-task(s) to ${runTasks.map((t) => t.agent).join(', ')}${action.background ? ' in background' : ''} ` +
                  `(${delegateSlotsUsed}/${effortMaxSpecialists} new specialist slots used${resumedTasks.length ? `; ${resumedTasks.length} resume(s) reused` : ''})`,
              );
              if (droppedTasks > 0) {
                this.emit(`delegate dropped ${droppedTasks} sub-task(s) over the ${effortMaxSpecialists}-specialist budget`);
                observe(
                  `DROPPED ${droppedTasks} delegated sub-task(s): they exceeded the task's ${effortMaxSpecialists}-specialist budget ` +
                    `and were not started. Handle that ${droppedTasks} yourself with your own tools instead of delegating again.`,
                );
              }
              // Risk-based steering: keep delegations on the recommended (right-sized)
              // roster for this task's risk. A gentle steer, not a hard block: the
              // model can still justify a different specialist by ignoring the note.
              if (riskPlan && riskPlan.recommendedSpecialists.length > 0) {
                const recommendedNames = new Set(riskPlan.recommendedSpecialists.map((r) => r.agent));
                const stray = runTasks.filter((t) => !recommendedNames.has(t.agent));
                if (stray.length > 0) {
                  this.emit(`delegate note: ${stray.map((t) => t.agent).join(', ')} not among the ${riskPlan.risk}-risk recommendations`);
                  observe(
                    `DELEGATION STEERING - ${stray.map((t) => `"${t.agent}"`).join(', ')} not in the recommended roster for this task's ` +
                      `${riskPlan.risk} risk (${riskPlan.recommendedSpecialists.map((r) => `"${r.agent}"`).join(', ')}). ` +
                      `Prefer those specialists unless you have a concrete reason not to.`,
                  );
                }
              }
              const delegatedTasks = runTasks.map((task) => {
                const handoffCriteria =
                  task.criteria && task.criteria.length > 0
                    ? task.criteria
                    : ledger.data.acceptanceCriteria
                        .filter((criterion) => !activeWorkPhase.priorCriterionIds.includes(criterion.id))
                        .slice(0, 5)
                        .map((criterion) => ({ text: criterion.text, verification: criterion.verification }));
                const handoffBudget =
                  effortPlan.complexity === 'low'
                    ? { maxFiles: 3, maxExcerptChars: 2_000 }
                    : effortPlan.complexity === 'medium'
                      ? { maxFiles: 4, maxExcerptChars: 4_000 }
                      : { maxFiles: 6, maxExcerptChars: 6_000 };
                return {
                  ...task,
                  handoff: buildSpecialistHandoff(
                    task.task,
                    activeGoal,
                    context,
                    ledger.data.contextPack,
                    ledger.data.plan.filter((step) => !activeWorkPhase.priorPlanStepIds.includes(step.id)),
                    handoffCriteria,
                    handoffBudget,
                  ),
                };
              });
              this.emit(
                `delegate handoff prepared for ${delegatedTasks.length} specialist(s): ` +
                  delegatedTasks.map((task) => `${task.agent} (${task.handoff.startingFiles.length} files, ${task.handoff.excerpts.length} excerpts)`).join(', '),
              );
              // Stale-result protection: a specialist launched under one
              // instruction epoch must not silently steer a task the user has
              // since corrected. Capture the epoch at launch; results that
              // come back stale stay history-only.
              const launchedInstructionEpoch = ledger.instructionEpoch;
              const outcome = await executor.execute({
                tool: 'delegate',
                params: { tasks: delegatedTasks, background: action.background },
                reason: action.background ? 'background specialist sub-tasks' : 'parallel specialist sub-tasks',
                expected: action.background ? 'tracked background agent jobs' : 'summaries from each agent',
              });
              const output = outcome.result.output;
              const payload = (outcome.result.payload ?? {}) as { results?: SubAgentResult[] };
              const results = payload.results ?? [];
              const specialistReportedUncertainty =
                action.background ||
                !outcome.result.ok ||
                results.some(
                  (result) =>
                    !result.ok ||
                    result.status !== 'SUCCESS' ||
                    (result.blockers?.length ?? 0) > 0 ||
                    /\b(?:uncertain|not sure|unable|could not|inconclusive)\b/i.test(`${result.summary}\n${result.recommendation ?? ''}`),
                );
              if (specialistReportedUncertainty) {
                specialistOrVerificationUncertain = true;
                this.emit('delegate uncertainty recorded — final quality review remains required');
              }

              // P1.1 — Specialist Evidence Inheritance: a specialist's evidence is
              // evidence for Gitu to evaluate, never automatic proof. Each report
              // is revalidated against the exact contract that was delegated; only
              // evidence that passes is mirrored into the MAIN ledger through the
              // EvidenceEngine so the acceptance gate keeps its authority.
              const validationLines: string[] = [];
              const specialistEpochStale = ledger.instructionEpoch > launchedInstructionEpoch;
              if (specialistEpochStale) {
                const staleNote =
                  `SPECIALIST RESULTS STALE — launched under instruction epoch ${launchedInstructionEpoch}, but the task is now at epoch ${ledger.instructionEpoch} ` +
                  `(a user correction/refinement arrived mid-flight). These results are preserved as history ONLY: they MUST NOT update the plan, criteria, ` +
                  `or completion state. Re-check them against the newest user intent before acting on any of their content.`;
                this.emit('delegate results marked stale by instruction epoch — history only, no automatic application');
                validationLines.push(`  ⚠ ${staleNote}`);
                observe(`${action.background ? 'BACKGROUND AGENTS' : 'DELEGATE RESULTS'} [stale — history only]\n${output.slice(0, 5000)}\n${staleNote}`);
                break;
              }
              if (results.length > 0) {
                // P — formal parent re-verification. A specialist's self-report is
                // NEVER sufficient. Runnable criteria are re-executed through the
                // orchestrator's OWN command executor (fresh, fingerprint-bound
                // evidence generated by actually running the oracle). Manual /
                // judgment criteria (no verification command) fall back to the
                // structural mirror, since they cannot be automated.
                const reverifyRunner: OracleRunner = async (req) => {
                  const out = await executor.execute({
                    tool: 'run_command',
                    params: { command: req.command },
                    reason: req.reason,
                    expected: req.expected ?? 'verification passes',
                  });
                  return { passed: out.result.ok, output: out.result.output, exitCode: out.result.exitCode };
                };
                for (let j = 0; j < results.length; j++) {
                  const r = results[j]!;
                  const specs = runTasks[j]?.criteria ?? [];
                  const expected = specs.map((spec, k) => ({
                    id: `ac-${k + 1}`,
                    verification: typeof spec === 'object' ? spec.verification : undefined,
                    evidenceType: typeof spec === 'object' ? spec.evidenceType : undefined,
                  }));
                  const verdict = validateSpecialistEvidence(r.evidenceReport, expected);
                  if (verdict.rejected.length > 0) specialistOrVerificationUncertain = true;
                  for (const a of verdict.accepted) {
                    const mainCriterion = ledger.data.acceptanceCriteria.find((c) => c.id === a.criterionId);
                    if (!mainCriterion) {
                      validationLines.push(`  ✗ ${a.criterionId}: main ledger has no criterion ${a.criterionId} to attach specialist evidence to`);
                      this.emit(`delegate-claim ${r.agent} ${a.criterionId}: REJECTED — no matching criterion in the main ledger`);
                      continue;
                    }
                    const currentFp = await getWorkspaceFingerprint(guard.activeWritableRoot);
                    // The verification oracle comes from the DELEGATED contract (the
                    // CriterionSpec we sent the specialist), which carries it even when
                    // the flat set_criteria text-path flattened the main criterion.
                    const expectedIndex = expected.findIndex((e) => e.id === a.criterionId);
                    const expectedCrit = expectedIndex >= 0 ? expected[expectedIndex] : undefined;
                    const oracle = expectedCrit?.verification;
                    if (oracle) {
                      // Runnable criterion: parent independently re-executes the oracle
                      // rather than trusting the specialist's status read. Adopt the
                      // delegated spec (real text + oracle) onto the main criterion so
                      // the evidence gate later attributes fresh re-verified evidence
                      // to it and the oracle-quality check sees the real artifact.
                      const rawSpec = specs[expectedIndex];
                      if (rawSpec && typeof rawSpec === 'object') {
                        mainCriterion.text = rawSpec.text;
                        mainCriterion.verification = oracle;
                      } else if (!mainCriterion.verification) {
                        mainCriterion.verification = oracle;
                      }
                      const rv = await parentReverifyCriterion({
                        ledger: ledger.data,
                        criterionId: mainCriterion.id,
                        currentFingerprint: currentFp,
                        runOracle: reverifyRunner,
                        workdir: guard.activeWritableRoot,
                      });
                      ledger.save();
                      if (rv.verified) {
                        validationLines.push(`  ✓ ${a.criterionId} parent-reverified via ${r.agent} — re-executed "${oracle}" (fresh ${rv.freshEvidenceId ?? 'evidence'})`);
                        this.emit(`delegate-claim ${r.agent} ${a.criterionId} <- ${rv.freshEvidenceId ?? rv.criterionId}: parent-reverified — ${oracle}`);
                        this.emit(`evidence ${rv.freshEvidenceId ?? '?'} PASS (parent-reverified)`);
                      } else {
                        specialistOrVerificationUncertain = true;
                        validationLines.push(`  ✗ ${a.criterionId}: parent re-verification not confirmed — ${rv.reason}`);
                        this.emit(`delegate-claim ${r.agent} ${a.criterionId}: REJECTED — ${rv.reason}`);
                      }
                    } else {
                      // Manual/judgment criterion (no oracle to re-run): preserve the
                      // specialist's structurally-validated evidence — a manual
                      // criterion is not an automation defect.
                      const ev = evidence.record(ledger.data, {
                        kind: a.evidence.kind,
                        label: `delegated: ${r.agent} — ${a.evidence.command ?? a.evidence.id}`,
                        command: a.evidence.command,
                        passed: true,
                        output: a.evidence.outputExcerpt,
                        workspaceFingerprint: currentFp,
                      });
                      ledger.save();
                      const link = evidence.link(ledger.data, a.criterionId, ev.id, currentFp);
                      ledger.save();
                      if (link.ok) {
                        validationLines.push(`  ✓ ${a.criterionId} backed by ${a.evidenceId} (${a.evidence.command ?? a.evidence.id}) via ${r.agent}`);
                        this.emit(`delegate-claim ${r.agent} ${a.criterionId} <- ${a.evidenceId}: accepted — ${a.evidence.command ?? 'evidence'}`);
                        this.emit(`evidence ${ev.id} PASS (delegated)`);
                      } else {
                        validationLines.push(`  ✗ ${a.criterionId}: main ledger rejected the mirror evidence — ${link.reason}`);
                        this.emit(`delegate-claim ${r.agent} ${a.criterionId}: REJECTED by main ledger — ${link.reason}`);
                      }
                    }
                  }
                  for (const rej of verdict.rejected) {
                    validationLines.push(`  ✗ ${rej.criterionId}${rej.evidenceId ? ` (${rej.evidenceId})` : ''}: ${rej.reason} (via ${r.agent})`);
                    this.emit(`delegate-claim ${r.agent} ${rej.criterionId}: REJECTED — ${rej.reason}`);
                  }
                }
              }
              const validationText =
                validationLines.length > 0 ? `\nEVIDENCE VALIDATION (specialist evidence enters the gate only through the main ledger):\n${validationLines.join('\n')}` : '';
              observe(
                `${action.background ? 'BACKGROUND AGENTS' : 'DELEGATE RESULTS'} [${outcome.result.ok ? 'started/ok' : 'some agents failed'}]\n${output.slice(0, 5000)}${validationText}`,
              );
              break;
            }
          }

          lastExecutedActionTag = currentActionTag;

          if (admitQueuedMessages()) {
            // A cancelled form/approval may have just produced a terminal
            // blocker. The queued user direction takes precedence over it.
            exitReason = 'stalled';
            completionInput = undefined;
            conversationCompleted = false;
            ledger.data.blockers = [];
            ledger.save();
          }

          if (exitReason === 'complete' || exitReason === 'blocked') break;
        }
      } catch (err) {
        if (!this.aborted) throw err;
      }

      if (this.aborted) {
        // Stop may abort an in-flight model request before the normal
        // post-action inbox drain runs. Preserve queued user guidance in the
        // event stream and task authority even though no further model turn is
        // allowed to execute it during this stopped run.
        while (this.inbox.length > 0) {
          const queued = this.inbox.shift()!;
          this.emit(`user-msg ${queued.text}`);
          applyFollowUpToLedger(ledger, queued.text);
        }
        if (!ledger.data.blockers.some((blocker) => blocker.includes('Stopped by user'))) {
          ledger.addBlocker('Stopped by user.');
        }
        if (exitReason === 'stalled') exitReason = 'blocked';
      }

      // ── Finding Verification Gate ──────────────────────────────────────────
      // Before the report is built, every unverified finding must face an
      // independent verifier. Only mechanically-reproduced findings are
      // reported as confirmed; everything else is downgraded explicitly.
      const pendingFindings = (ledger.data.findings ?? []).filter((f) => f.status === 'unverified');
      if (pendingFindings.length > 0 && !conversationCompleted && !this.aborted) {
        if (this.config.subagents) {
          this.emit(`findings verifying ${pendingFindings.length} finding(s) with independent specialists`);
          for (const finding of pendingFindings) {
            const criteria = finding.reproductionCommand
              ? [{ text: `reproduce: ${finding.claim}`, verification: finding.reproductionCommand, evidenceType: 'command_success' as const }]
              : [{ text: `reproduce: ${finding.claim}` }];
            try {
              const result = await this.config.subagents.runOne(VERIFIER_AGENT, buildVerifierContract(finding), criteria);
              const verdict = verdictForFinding(finding, result);
              ledger.updateFinding(finding.id, {
                status: verdict.status,
                evidenceIds: verdict.evidenceIds,
                verifierSummary: verdict.verifierSummary,
              });
              this.emit(`finding  ${finding.id} [${verdict.status.toUpperCase()}] ${finding.claim.slice(0, 100)}`);
            } catch (err) {
              ledger.updateFinding(finding.id, {
                status: 'unverifiable',
                verifierSummary: `verifier crashed: ${(err as Error).message.slice(0, 200)}`,
              });
              this.emit(`finding  ${finding.id} [UNVERIFIABLE] verifier crashed`);
            }
          }
        } else {
          for (const finding of pendingFindings) {
            ledger.updateFinding(finding.id, {
              status: 'unverifiable',
              verifierSummary: 'no specialist agents configured to verify findings independently',
            });
          }
          this.emit(`findings ${pendingFindings.length} finding(s) left unverifiable — no specialists configured`);
        }
      }

      const pausedForConversation = conversationCompleted && preservePausedWork;
      const status = pausedForConversation ? 'blocked' : exitReason === 'complete' ? 'completed' : exitReason === 'blocked' ? 'blocked' : 'failed';
      ledger.setStatus(status);
      if (pausedForConversation) ledger.addBlocker('Paused for discussion with the user.');
      if (exitReason === 'complete' && !pausedForConversation) ledger.completeActiveWorkPhase();

      // Persist token telemetry so spend can be attributed after the fact.
      const snap = telemetry.snapshot();
      const artifacts = estimatePlanningArtifactTokens(ledger.data);
      ledger.data.tokenTelemetry = {
        ...snap,
        ...artifacts,
        behavior: computeBehaviorMetrics(
          ledger.data.actions.map((a) => ({ tool: a.tool, status: a.status, paramsSummary: a.paramsSummary, observation: a.observation })),
          typeof ledger.activeVisualReferences === 'function' ? ledger.activeVisualReferences().length : 0,
        ),
      };
      ledger.save();
      this.emit(`telemetry ${renderTelemetry(ledger.data.tokenTelemetry)}`);

      const finalWorkspaceFingerprint = await getWorkspaceFingerprint(guard.activeWritableRoot);
      const finalHeadRef = (await gitExec(guard.activeWritableRoot, ['rev-parse', 'HEAD']).catch(() => '')).trim() || undefined;
      let phaseFiles: string[] | undefined;
      if (
        isVerifiedDiffSnapshotCurrent(ledger.data.latestVerifiedDiff, {
          phaseId: activeWorkPhase.id,
          workspaceFingerprint: finalWorkspaceFingerprint,
          headRef: finalHeadRef,
        })
      ) {
        phaseFiles = ledger.data.latestVerifiedDiff.changedFiles;
        this.emit(`report   reused verified diff snapshot from completion attempt ${ledger.data.latestVerifiedDiff.attempt}`);
      } else if (activeWorkPhase.baseRef) {
        // The workspace changed after completion verification (or this run
        // ended before a completion attempt), so the report needs fresh diff
        // metadata. This is an invalidation path, not duplicate work.
        const collected = await collectQualityReviewDiff(guard.activeWritableRoot, activeWorkPhase.baseRef, 0);
        ledger.data.latestVerifiedDiff = {
          phaseId: activeWorkPhase.id,
          workspaceFingerprint: finalWorkspaceFingerprint,
          headRef: collected.headRef,
          baseRef: collected.baseRef,
          changedFiles: collected.changedFiles,
          diffStat: collected.diffStat,
          diffBodyTruncated: collected.diffBodyTruncated,
          collectedAt: new Date().toISOString(),
          attempt: completionAttempts,
        };
        ledger.save();
        phaseFiles = collected.changedFiles;
        this.emit('report   diff snapshot refreshed after workspace changed');
      }
      const report = reporter.build(ledger, exitReason, completionInput, finalWorkspaceFingerprint, {
        goal: activeGoal,
        phase: {
          id: activeWorkPhase.id,
          kind: activeWorkPhase.kind,
          startedAt: activeWorkPhase.startedAt,
        },
        evidenceStartIndex: activeWorkPhase.evidenceStartIndex,
        actionStartIndex: activeWorkPhase.actionStartIndex,
        criterionIds: ledger.data.acceptanceCriteria.filter((criterion) => !activeWorkPhase.priorCriterionIds.includes(criterion.id)).map((criterion) => criterion.id),
        filesChanged: phaseFiles ?? ledger.data.filesChanged.slice(activeWorkPhase.fileStartIndex ?? 0),
      });
      ledger.data.report = report;
      ledger.save();

      if ((this.config.autoLearn ?? true) && exitReason === 'complete' && !conversationCompleted && !this.aborted) {
        try {
          await this.autoLearn(messages, ledger, executor, skills);
        } catch (err) {
          // The run already completed and the report is saved; a transient
          // failure in this optional reflection pass must not flip the session
          // to errored after the fact.
          this.emit(`warn    post-run learning skipped: ${(err as Error).message}`);
        }
      }

      if (!conversationCompleted) {
        memory.add({
          type: 'task',
          claim:
            `Task phase "${activeGoal}" finished as ${status}: ${report.summary}` +
            `${report.filesChanged.length ? ` Changed files: ${report.filesChanged.slice(0, 16).join(', ')}.` : ''}` +
            `${
              report.verificationDetails?.some((e) => e.passed)
                ? ` Passing checks: ${report.verificationDetails
                    .filter((e) => e.passed)
                    .slice(-4)
                    .map((e) => e.label)
                    .join('; ')}.`
                : ''
            }`,
          evidence: ledger.data.taskId,
          scope: guard.lock.name,
          confidence: 0.9,
        });
        if (status !== 'completed') {
          memory.add({
            type: 'failure',
            claim: `Task phase "${activeGoal}" did not complete (${status}). Blockers: ${ledger.data.blockers.join('; ') || 'none recorded'}`,
            scope: guard.lock.name,
            confidence: 0.85,
          });
        }
      }

      // Memory observability (review Phase 13): per-run lifecycle stats land on
      // the ledger so the completion report and details panel can surface them.
      ledger.data.memoryStats = memory.stats();

      this.emit(conversationCompleted ? 'done     paused — waiting for your next instruction' : `done     ${status} — ${report.summary.slice(0, 160)}`);
      return { ledger, report };
    } finally {
      // Only dispose resources created for this direct run. Server-owned
      // indexes and session-scoped LSP managers must remain available for a
      // continuation.
      ownedIndex?.close();
      if (!this.config.lsp) await lsp.shutdown().catch(() => {});
    }
  }

  private async autoLearn(messages: LlmMessage[], ledger: TaskLedger, executor: Executor, skills: SkillStore): Promise<void> {
    const d = ledger.data;
    const didWork = d.actions.length > 0 && (d.filesChanged.length > 0 || d.evidence.some((e) => e.passed));
    const alreadyLearned = d.actions.some((a) => a.tool === 'create_skill' && a.status === 'success');
    if (!didWork || alreadyLearned) return;
    this.emit('learn   reflecting on the completed work to extract a reusable skill');
    const existing =
      skills
        .list()
        .map((s) => s.name)
        .join(', ') || '(none)';
    messages.push({
      role: 'user',
      content:
        `REFLECTION (auto-learn pass — optional, after a successful task).\n` +
        `Goal: ${d.goal}\nSummary: ${d.report?.summary ?? ''}\nFiles changed: ${d.filesChanged.join(', ') || '(none)'}\n` +
        `Existing skills: ${existing}\n` +
        `If this task revealed a genuinely repeatable multi-step pattern (deploy flow, design convention, checklist, project-specific process), save it as a skill:\n` +
        `{"thought":"...","action":{"type":"tool_call","stepId":"step-1","tool":"create_skill","params":{"name":"kebab-case-name","description":"when to use it","instructions":"step-by-step reusable knowledge","global":true},"reason":"auto-learned from completed task","expected":"skill saved"}}\n` +
        `Use global:true unless the pattern is specific to THIS project's internals (global skills are visible from every project).\n` +
        `Otherwise respond with: {"thought":"nothing reusable","action":{"type":"complete","summary":"nothing to learn","chat":true}}`,
    });
    const reply = await this.config.llm.completeStream(messages, { effort: this.config.effort, signal: this.abortController?.signal }, () => {});
    messages.push({ role: 'assistant', content: reply });
    const parsed = parseReplyAction(reply);
    if (parsed?.type === 'tool_call' && parsed.tool === 'create_skill') {
      const outcome = await executor.execute({
        tool: 'create_skill',
        params: parsed.params,
        reason: 'auto-learned from completed task',
        expected: 'skill saved',
      });
      ledger.save();
      const name = String(parsed.params['name'] ?? 'skill');
      this.emit(outcome.result.ok ? `learn   auto-saved skill "${name}"` : `learn   could not save skill: ${outcome.result.output.slice(0, 200)}`);
    } else {
      this.emit('learn   nothing new worth saving');
    }
  }
}
