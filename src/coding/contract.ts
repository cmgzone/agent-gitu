/**
 * The coding-agent boundary.
 *
 * Cowork must never import `../agent/gitu.js`. It talks to this contract
 * instead, and `GituServer` becomes a transport adapter around the same
 * session runtime rather than the place where session guarantees live.
 *
 * Why a session runtime and not the `Gitu` class: `Gitu` only exposes
 * `run`/`queueMessage`/`stop`. Approvals, plan review, questions, persistence,
 * reconnect, worktrees and usage accounting all currently live around
 * `GituServer`, and those are exactly the guarantees a second client must
 * inherit. Wrapping the bare class would give Cowork a third, weaker loop
 * instead of one shared engineering runtime.
 *
 * `CodingSessionView` is the transport-independent state model. `RunSessionView`
 * in `src/server/server.ts` currently carries a superset of these fields for
 * the HTTP API; the extraction step must move the shared shape here and have
 * `server.ts` extend it, so there is exactly one definition of session state.
 */

import type { CompletionReport } from '../types.js';
import type { RunBudget } from './budget.js';
import type { CodingEvent } from './events.js';
import type { WorkspaceRef } from './workspace.js';

/** Mirrors the run lifecycle the UI already renders. */
export type CodingSessionStatus = 'running' | 'waiting_for_model' | 'completed' | 'blocked' | 'failed';

/**
 * One approval object per session. Gitu Workspace, Cowork, Telegram and the
 * CLI are all views onto this; the first surface to resolve it wins and the
 * rest learn via `approval_resolved`.
 */
export interface CodingApprovalRequest {
  id: string;
  tool: string;
  why: string;
  summary?: string;
  requestedAt: string;
}

export interface CodingPlanReviewDecision {
  approved: boolean;
  note?: string;
  criteria?: string[];
  steps?: { description: string; verification: string }[];
}

export interface CodingPlanReviewRequest {
  id: string;
  criteria: string[];
  steps: { description: string; verification: string }[];
  requestedAt: string;
}

/** Mirrors `SessionUsage` (src/server/session-store.ts) so the extraction can
 *  move that shape here instead of maintaining two accounting models. */
export interface CodingUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  messages: number;
  costUsd?: number;
  /** True if some calls had no pricing metadata. */
  costIncomplete?: boolean;
}

export type CodingEventListener = (event: CodingEvent) => void;

/** Mirrors `AskUserQuestion` (src/agent/recovery-synthesizer.ts); the extraction
 *  step moves that type here so both surfaces render one question model. */
export interface CodingQuestion {
  question: string;
  header?: string;
  options: string[];
}

export interface CodingQuestionsRequest {
  id: string;
  questions: CodingQuestion[];
  requestedAt: string;
}

/**
 * The transport-independent session state. Everything a surface needs to render
 * progress, and the only thing it may read — a client never inspects the
 * runtime's internals to decide what to show.
 */
export interface CodingSessionView {
  id: string;
  goal: string;
  status: CodingSessionStatus;
  startedAt: string;
  finishedAt?: string;
  /** Ledger task id, when a task run is bound to this session. */
  taskId?: string;
  workspace: WorkspaceRef;
  /** Git branch / worktree, when the workspace is a repository. */
  branch?: string;
  provider?: string;
  model?: string;
  pendingApproval?: CodingApprovalRequest;
  pendingPlanReview?: CodingPlanReviewRequest;
  pendingQuestions?: CodingQuestionsRequest;
  report?: CompletionReport;
  error?: string;
  usage?: CodingUsage;
}

/** Per-run overrides. Session-level defaults live on `CodingSessionOptions`. */
export interface CodingRunOptions {
  effort?: 'low' | 'medium' | 'high' | 'max';
  mode?: 'agent' | 'fast' | 'standard' | 'chat';
  provider?: string;
  model?: string;
}

export interface CodingRunResult {
  sessionId: string;
  status: CodingSessionStatus;
  report?: CompletionReport;
  error?: string;
}

export interface CodingSessionOptions {
  workspace: WorkspaceRef;
  /** Spend envelope. A session never receives more than its caller assigned. */
  budget?: RunBudget;
  effort?: 'low' | 'medium' | 'high' | 'max';
  /** `chat` answers without touching the workspace; the default is `agent`. */
  mode?: 'agent' | 'fast' | 'standard' | 'chat';
  provider?: string;
  model?: string;
  autoApprove?: boolean;
  /** Never auto-approve dangerous commands, even with `autoApprove`. */
  safeMode?: boolean;
  /**
   * Memory scoping. The session's memories are attributed to this id, so a
   * Cowork teammate's engineering history stays distinguishable from the
   * main agent's own.
   */
  agentId?: string;
  /** Human label for who delegated the work (e.g. a Cowork teammate name). */
  requestedBy?: string;
}

/**
 * A live coding session.
 *
 * `approve`, `approvePlan` and `answerQuestions` are deliberately synchronous
 * voids: the pending request is shared state on the session, so resolving it
 * only has to wake the runtime's own waiter. Making them return promises would
 * invite a caller to believe it owns the outcome, and two surfaces resolving
 * the same request must be a race the session settles, not the caller.
 */
export interface CodingSession {
  readonly id: string;
  getState(): CodingSessionView;
  run(goal: string, options?: CodingRunOptions): Promise<CodingRunResult>;
  /** Deliver a follow-up message to a session that is paused or running. */
  continue(message: string): Promise<CodingRunResult>;
  cancel(reason?: string): Promise<void>;
  /**
   * Settle every pending gate the way a teardown would — approvals and plan
   * reviews denied, questions answered with the engine's own default — while the
   * run itself keeps going.
   *
   * This is the "the user replied in prose, or a correction superseded the
   * question" case: the request has gone stale, so it must stop waiting, but
   * nothing about the run was cancelled. That is the whole difference from
   * `cancel`, which stops the engine too, and the reason this exists as its own
   * method rather than a flag on that one.
   */
  releasePendingGates(reason: string): void;
  approve(approvalId: string, approved: boolean): void;
  approvePlan(decision: CodingPlanReviewDecision): void;
  /** Answer the outstanding `CodingQuestionsRequest` (single free-text answer). */
  answerQuestions(answer: string): void;
  /** Replay from `sinceSeq` (exclusive). Absent means the whole retained log. */
  events(sinceSeq?: number): CodingEvent[];
  /** Returns an unsubscribe function. */
  subscribe(listener: CodingEventListener): () => void;
}

/**
 * The seam Cowork depends on. Cowork orchestrates; this engineers.
 * `GituCodingAgent implements CodingAgent` by owning the session runtime, and no
 * module under `src/cowork` imports `../agent/gitu.js`.
 */
export interface CodingAgent {
  createSession(options: CodingSessionOptions): Promise<CodingSession>;
}
