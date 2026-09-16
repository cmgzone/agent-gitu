/**
 * The one place a `Gitu` engine configuration is assembled.
 *
 * The HTTP run handler used to build this configuration inline: 39 fields, ten
 * of them session-bound closures, with defaults (`autoApprove ?? false`,
 * `autoLearn ?? true`, `requirePlanReview ?? true`) and derivations
 * (`prerequisiteRecovery`, `agentsSection`, `specialists`) scattered through a
 * ~180-line prelude. That survives exactly one caller. With two callers it
 * becomes silent configuration drift: a second client forgets
 * `prerequisiteRecovery`, or defaults plan review differently, and nothing
 * fails loudly because both call sites still compile.
 *
 * `buildGituConfig` is pure, so the canonical configuration is observable and
 * characterizable in a test without reading `Gitu`'s private state.
 * `createGitu` is the thin constructor wrapper.
 *
 * Host behaviour stays host-supplied. The approval, plan-review, question and
 * connection handlers, and the event sink, are session-bound: they resolve
 * waiters that live on the caller's session and push into its event log. They
 * are passed through unchanged rather than reimplemented here, because a
 * factory that owned them would have to own the session too.
 *
 * Boundary note: this module is the Gitu adapter and therefore depends on
 * `src/agent/gitu.js`. The transport-independent contract (`contract.ts`,
 * `events.ts`, `workspace.ts`, `budget.ts`) does not, and Cowork may import
 * only those.
 */

import { Gitu, type AskUserHandler, type GituConfig, type PlanReviewHandler } from '../agent/gitu.js';
import type { AgentStore } from '../agents/registry.js';
import type { SubAgentRunner } from '../agent/subagent.js';
import type { BrowserBridge } from '../browser/browser.js';
import type { CodingEventSink } from './events.js';
import type { CodeIndex } from '../context/code-index.js';
import type { ModelContextAttachment } from '../context/model-context.js';
import type { ConnectionRegistry } from '../connections/connections.js';
import type { UniversalCapabilityRegistry } from '../connections/runtime/universal-registry.js';
import type { LspManager } from '../lsp/manager.js';
import type { McpManager } from '../mcp/client.js';
import type { LlmClient, LlmMessage } from '../llm/llm.js';
import type { ApprovalHandler } from '../policy/policy.js';
import type { SkillStore } from '../skills/skills.js';

/** What varies from one run to the next. */
export interface GituFactoryOptions {
  /** Workspace root the run is locked to; becomes the engine's `cwd`. */
  workspaceRoot: string;
  llm: LlmClient;
  mode: 'agent' | 'fast' | 'standard' | 'chat';
  /** Shared code index, when the host already owns a watched one. */
  index?: CodeIndex;
  criteria?: string[];
  scopeFiles?: string[];
  extraConstraints?: string[];
  effort?: 'low' | 'medium' | 'high' | 'max';
  actionProtocolMode?: 'auto' | 'native' | 'structured_text' | 'text';
  /** Defaults to `false`: unattended approval must be opted into per run. */
  autoApprove?: boolean;
  /** Defaults to `true`. */
  autoLearn?: boolean;
  /** Defaults to `true`: a plan is reviewed before implementation starts. */
  requirePlanReview?: boolean;
  resume?: { taskId: string; message: string };
  conversationHistory?: LlmMessage[];
  images?: { name: string; dataUrl: string }[];
  attachments?: ModelContextAttachment[];
  supportsImages?: boolean;
  contextWindowTokens?: number;
  modelCapability?: 'low' | 'standard' | 'high';
}

/**
 * Host services and session-bound handlers. Supplied by whoever owns the
 * session; the factory only decides where each one lands.
 *
 * The connection-handler signatures are derived from `GituConfig` rather than
 * restated, so a change to the engine's own contract surfaces here immediately
 * instead of silently diverging.
 */
export interface GituFactoryDependencies {
  approvalHandler: ApprovalHandler;
  planReviewHandler: PlanReviewHandler;
  askUserHandler: AskUserHandler;
  onEvent: (event: string) => void;
  /**
   * Typed guarantee events. Optional: a host that has not adopted the typed
   * stream yet keeps working, but no gate is silenced by omission — the legacy
   * text sink still carries the same decision.
   */
  onCodingEvent?: CodingEventSink;
  connections: ConnectionRegistry;
  connectionContext: () => string;
  connectionActionHandler: NonNullable<GituConfig['connectionActionHandler']>;
  safestProviderRead: NonNullable<GituConfig['safestProviderRead']>;
  connectionOperationHandler: NonNullable<GituConfig['connectionOperationHandler']>;
  connectionRecoveryCheck: NonNullable<GituConfig['connectionRecoveryCheck']>;
  connectionRequestHandler: NonNullable<GituConfig['connectionRequestHandler']>;
  /** Specialist roster and its rendered prompt section. */
  agents?: Pick<AgentStore, 'renderForPrompt' | 'list'>;
  skills?: SkillStore;
  mcp?: McpManager;
  lsp?: LspManager;
  subagents?: SubAgentRunner;
  universalRegistry?: UniversalCapabilityRegistry;
  browser?: BrowserBridge;
}

/**
 * Assemble the canonical engine configuration.
 *
 * Three fields are derived here rather than passed in, because each was a thing
 * a second call site would have had to remember by hand:
 *
 * - `prerequisiteRecovery` from the connection registry
 * - `agentsSection` and `specialists` from the specialist roster
 *
 * Everything else is either an explicit per-run input or a host dependency.
 * Optional values are passed through exactly as given, so an omitted dependency
 * reads back as `undefined` — the same shape the inline construction produced.
 */
export function buildGituConfig(options: GituFactoryOptions, deps: GituFactoryDependencies): GituConfig {
  const agents = deps.agents;
  const agentsSection = agents ? agents.renderForPrompt() || undefined : undefined;
  const specialists = agents ? agents.list().map((agent) => ({ name: agent.name, role: agent.role })) : undefined;
  return {
    cwd: options.workspaceRoot,
    llm: options.llm,
    mode: options.mode,
    // Spelled out on purpose: an omitted flag must mean the documented default,
    // not whatever the engine happens to fall back to.
    autoApprove: options.autoApprove ?? false,
    autoLearn: options.autoLearn ?? true,
    requirePlanReview: options.requirePlanReview ?? true,
    index: options.index,
    criteria: options.criteria,
    scopeFiles: options.scopeFiles,
    extraConstraints: options.extraConstraints,
    effort: options.effort,
    actionProtocolMode: options.actionProtocolMode,
    resume: options.resume,
    conversationHistory: options.conversationHistory,
    images: options.images,
    attachments: options.attachments,
    supportsImages: options.supportsImages,
    contextWindowTokens: options.contextWindowTokens,
    modelCapability: options.modelCapability,
    prerequisiteRecovery: { providers: [deps.connections.asPrerequisiteProvider()] },
    connections: deps.connections,
    connectionContext: deps.connectionContext,
    connectionActionHandler: deps.connectionActionHandler,
    safestProviderRead: deps.safestProviderRead,
    connectionOperationHandler: deps.connectionOperationHandler,
    connectionRecoveryCheck: deps.connectionRecoveryCheck,
    connectionRequestHandler: deps.connectionRequestHandler,
    approvalHandler: deps.approvalHandler,
    planReviewHandler: deps.planReviewHandler,
    askUserHandler: deps.askUserHandler,
    onEvent: deps.onEvent,
    onCodingEvent: deps.onCodingEvent,
    skills: deps.skills,
    mcp: deps.mcp,
    lsp: deps.lsp,
    subagents: deps.subagents,
    universalRegistry: deps.universalRegistry,
    browser: deps.browser,
    ...(agentsSection !== undefined ? { agentsSection } : {}),
    ...(specialists !== undefined ? { specialists } : {}),
  };
}

/** Build the canonical configuration and construct the engine from it. */
export function createGitu(options: GituFactoryOptions, deps: GituFactoryDependencies): Gitu {
  return new Gitu(buildGituConfig(options, deps));
}
