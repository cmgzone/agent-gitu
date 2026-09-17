/**
 * Cowork → engineering delegation.
 *
 * A teammate handing real engineering work to Agent Gitu does not get a third,
 * weaker loop: it gets a `GituSessionRuntime` session, with the same engine, the
 * same gates and the same typed event stream the Gitu workspace uses. This
 * module is the adapter between the two surfaces, and it is deliberately free of
 * both the engine and the HTTP transport:
 *
 *   Cowork teammate → `gitu_task` → CoworkDelegation
 *                                        │
 *                        ┌───────────────┴───────────────┐
 *                        ▼                               ▼
 *              runtime session (injected)        cowork request cards
 *              plan review / approval /               (the user's
 *              questions, resolved by the            answer surface)
 *              runtime authority
 *
 * The direction of authority matters and is one-way. Gitu owns the request: the
 * runtime mints the id, publishes the typed event and settles the gate when
 * somebody answers. Cowork owns the *surface*: it renders that request as a
 * request card and, when the card is answered, forwards the answer to the
 * runtime method that resolves that exact id. Nothing here holds a second
 * promise for the same request, so a second surface (Telegram, or a future
 * chief-of-staff view) answering first is simply the winner.
 *
 * Domain walls, per `src/coding/contract.ts`: the adapter talks to the coding
 * contract (`CodingSession`, `WorkspaceRef`) and to Cowork's own store, and it
 * never imports `../agent/gitu.js` or `../coding/session-runtime.js`. The
 * composition root (the server) supplies the session, because only it knows the
 * LLM, the workspace and the connection registry.
 */

import type {
  CodingApprovalRequest,
  CodingPlanReviewDecision,
  CodingPlanReviewRequest,
  CodingQuestionsRequest,
  CodingRunResult,
  CodingSession,
} from '../coding/contract.js';
import type { BudgetAccount, RunBudget } from '../coding/budget.js';
import type { CodingEvent } from '../coding/events.js';
import type { WorkspaceRef } from '../coding/workspace.js';
import type { ToolResult } from '../types.js';
import type { CoworkAgent, CoworkRequest, CoworkStore } from './store.js';

/**
 * The part of `CoworkToolScope` delegation needs. Restated structurally rather
 * than imported so this module and `tools.ts` do not depend on each other — and
 * so a caller in a test can hand it a small object of its own.
 */
export interface DelegationScope {
  agent: Pick<CoworkAgent, 'id' | 'name'>;
  store: CoworkStore;
  conversationId?: string;
  signal?: AbortSignal;
}

export interface DelegationRunOptions {
  mode: 'agent' | 'fast' | 'standard';
  effort?: 'low' | 'medium' | 'high' | 'max';
  /** Wall-clock cap for the delegated run, in minutes. */
  timeoutMinutes: number;
  /**
   * What the teammate asks this task may cost, in USD.
   *
   * A request, never an authorization: the runtime clamps it to what the host's
   * delegation pool has left, so asking for more than the pool holds buys the
   * pool's remainder rather than more money.
   */
  maxCostUsd?: number;
}

/** Per-run engine inputs the runtime needs and only the host can supply. */
export interface DelegationSessionInput {
  goal: string;
  workspace: WorkspaceRef;
  /** Memory attribution, so delegated work stays distinguishable from the
   *  teammate's own chat history. */
  agentId: string;
  /** Human label for whoever delegated the work. */
  requestedBy?: string;
  runOptions: DelegationRunOptions;
  /** The teammate's requested allocation for this task, when it asked for one. */
  budget?: RunBudget;
  /** The host's pool of delegated spend; the request is clamped inside it. */
  parentBudget?: BudgetAccount;
  /** The runtime surfaces each gate here; the runtime still owns resolution. */
  onApprovalRequired: (request: CodingApprovalRequest) => void;
  onPlanReviewRequested: (request: CodingPlanReviewRequest) => void;
  onQuestionsRequested: (request: CodingQuestionsRequest) => void;
}

export interface CoworkDelegationDeps {
  /** The workspace a delegated run executes against — `host` for a teammate
   *  working on the user's machine. */
  workspaceFor: (scope: DelegationScope) => WorkspaceRef;
  /**
   * The host's pool of delegated spend. Every delegation draws a child
   * allocation from it, so one expensive task leaves less for the next and an
   * exhausted pool refuses new work instead of quietly spending on.
   */
  budgetPool?: (scope: DelegationScope) => BudgetAccount | undefined;
  /**
   * Creates the runtime session for one delegated task.
   *
   * Synchronous on purpose: the session must exist before the first gate can be
   * raised, and a gate is raised the moment the engine starts moving. A host
   * that needs to look something up (provider pricing, say) should warm it
   * before this call rather than make the whole path async — an async boundary
   * here is exactly the window in which a gate would have no session to answer
   * through.
   */
  createSession: (input: DelegationSessionInput) => CodingSession;
  /**
   * Surfaces a runtime-owned gate as a cowork request card. Returns the card's
   * id, which is what the resolution hook is keyed by — never "whatever gate is
   * pending now".
   */
  openRequest: (input: { scope: DelegationScope; title: string; detail: string; options: string[] }) => { id: string };
  /** Closes a card whose runtime gate ended before anyone answered it. */
  closeRequest?: (requestId: string) => void;
  /** Release per-session host resources (MCP clients, …) once a run settles. */
  sessionSettled?: (sessionId: string) => void;
  /** Liveness line for the delegating conversation's progress area. */
  progress: (input: { conversationId: string; agentId: string; text: string }) => void;
  /** Called after a delegation card is resolved, so subscribers re-render. */
  onChange?: (conversationId: string) => void;
}

/**
 * A resolved delegation card. `status` is the cowork card's own vocabulary;
 * `answer` is what gets echoed into the conversation record.
 */
export interface DelegationResolution {
  status: Exclude<CoworkRequest['status'], 'open'>;
  answer: string;
}

export type DelegationGateKind = 'approval' | 'plan_review' | 'questions';

interface DelegationGate {
  kind: DelegationGateKind;
  /** The runtime's request id — the id the runtime method is called with. */
  requestId: string;
}

interface DelegationRun {
  session: CodingSession;
  conversationId?: string;
  agentId: string;
  gates: Map<string, DelegationGate>;
  /** Consecutive-duplicate suppression for progress lines. */
  lastProgress?: string;
  settled: boolean;
}

export interface DelegationParams extends DelegationRunOptions {
  goal: string;
}

const DEFAULT_TIMEOUT_MINUTES = 30;
const MAX_TIMEOUT_MINUTES = 180;

/**
 * Parse the tool's parameters strictly. A delegated run spends real money and
 * writes real files, so a field the caller got wrong must fail loudly here
 * rather than be silently defaulted into a different run than the one asked for.
 */
export function parseDelegationParams(params: Record<string, unknown>): { ok: true; value: DelegationParams } | { ok: false; error: string } {
  const goal = typeof params['goal'] === 'string' ? params['goal'].trim() : '';
  if (!goal) return { ok: false, error: 'gitu_task requires a non-empty "goal" describing the engineering work to complete.' };
  const mode = params['mode'] ?? 'agent';
  if (mode !== 'agent' && mode !== 'fast' && mode !== 'standard') {
    return { ok: false, error: 'gitu_task "mode" must be one of: agent, fast, standard.' };
  }
  const effortInput = params['effort'];
  if (effortInput !== undefined && !['low', 'medium', 'high', 'max'].includes(String(effortInput))) {
    return { ok: false, error: 'gitu_task "effort" must be one of: low, medium, high, max.' };
  }
  const timeoutInput = params['timeoutMinutes'];
  let timeoutMinutes = DEFAULT_TIMEOUT_MINUTES;
  if (timeoutInput !== undefined) {
    if (typeof timeoutInput !== 'number' || !Number.isFinite(timeoutInput) || timeoutInput <= 0) {
      return { ok: false, error: 'gitu_task "timeoutMinutes" must be a positive number of minutes.' };
    }
    timeoutMinutes = Math.min(Math.round(timeoutInput), MAX_TIMEOUT_MINUTES);
  }
  const costInput = params['maxCostUsd'];
  if (costInput !== undefined && (typeof costInput !== 'number' || !Number.isFinite(costInput) || costInput <= 0)) {
    return { ok: false, error: 'gitu_task "maxCostUsd" must be a positive dollar amount (it is a ceiling for this task, not a spend target).' };
  }
  return {
    ok: true,
    // The model is the teammate's own, resolved by the host: a delegated session
    // speaks with the same provider the delegating agent does, so accepting a
    // `provider`/`model` here would let the caller silently switch it.
    value: {
      goal,
      mode,
      effort: effortInput as DelegationRunOptions['effort'],
      timeoutMinutes,
      maxCostUsd: costInput as number | undefined,
    },
  };
}

/**
 * One line per event a person would want to see while someone else's engineer
 * works in their repo. Everything else is dropped on purpose: the point is
 * honest liveness, not a transcript, and Gitu's own prose is already a
 * projection the workspace UI renders.
 */
export function delegationProgressFor(event: CodingEvent): string | undefined {
  switch (event.type) {
    case 'run_started':
      return `Engineering task started: ${event.goal}`;
    case 'plan_created':
      return `Plan ready — ${event.steps} step${event.steps === 1 ? '' : 's'}`;
    case 'file_changed':
      return `Edited ${event.path}`;
    case 'command_started':
      return `Running ${event.command}`;
    // Only failures: a successful command is already announced by its start line.
    case 'command_finished':
      return event.ok ? undefined : `Command failed${event.exitCode !== undefined ? ` (exit ${event.exitCode})` : ''}: ${event.command}`;
    case 'policy_denied':
      return `Blocked by policy (${event.reason})${event.detail ? `: ${event.detail}` : ''}`;
    case 'operation_blocked':
      return `Stopped (${event.reason})${event.detail ? `: ${event.detail}` : ''}`;
    case 'recovering':
      return event.attempt !== undefined && event.maxAttempts !== undefined
        ? `Recovering (${event.attempt}/${event.maxAttempts}): ${event.message}`
        : `Recovering: ${event.message}`;
    // Verification worth surfacing is the verification that did not pass.
    case 'evidence_recorded':
      return event.passed ? undefined : `Verification failed: ${event.evidenceId}`;
    case 'completed':
      return `Finished: ${event.summary}`;
    case 'failed':
      return `Engineering task failed: ${event.reason}`;
    default:
      return undefined;
  }
}

/** True when a gate card's action or typed answer is an affirmative. */
function isAffirmative(action: string, response: string): boolean {
  const direct = action.toLowerCase();
  if (['approve', 'allow', 'accept', 'yes', 'y', 'ok', 'proceed'].includes(direct)) return true;
  if (['deny', 'dismiss', 'no', 'n', 'reject', 'cancel'].includes(direct)) return false;
  return /^(approve|allow|accept|yes|proceed)\b/i.test(response.trim());
}

/**
 * True when the answer is a refusal with no feedback attached.
 *
 * Gitu distinguishes two refusals: a bare rejection stops the plan, while a
 * refusal carrying a note sends it back for replanning. So the card's "Reject"
 * button must NOT arrive as a note, or the engineer would replan something the
 * user meant to stop.
 */
function isBareRejection(action: string, response: string): boolean {
  if (['deny', 'dismiss', 'no', 'n', 'reject', 'cancel', 'stop'].includes(action.toLowerCase())) return true;
  return /^(reject|deny|stop|cancel|no)\b/i.test(response.trim());
}

export class CoworkDelegation {
  private readonly deps: CoworkDelegationDeps;
  private readonly runs = new Map<string, DelegationRun>();
  /** Cowork request card id → owning runtime session id. */
  private readonly gates = new Map<string, string>();

  constructor(deps: CoworkDelegationDeps) {
    this.deps = deps;
  }

  /** Sessions currently in flight, for lifecycle assertions and teardown. */
  get activeSessions(): number {
    return [...this.runs.values()].filter((run) => !run.settled).length;
  }

  /**
   * Run one delegated engineering task to completion.
   *
   * The tool call is the delegating teammate's own turn, so this promise is the
   * teammate waiting: gates surface as request cards and are answered through
   * the runtime, never by this module faking a decision.
   */
  async run(scope: DelegationScope, params: Record<string, unknown>): Promise<ToolResult> {
    // Refused before anything is created: an already-stopped conversation must
    // not start a new paid run that nothing is waiting for. The listener below
    // cannot cover this case — an aborted signal never fires it.
    if (scope.signal?.aborted) return { ok: false, output: 'gitu_task cancelled: the conversation was stopped before the task started.' };
    const parsed = parseDelegationParams(params);
    if (!parsed.ok) return { ok: false, output: parsed.error };
    const { goal, ...runOptions } = parsed.value;

    const gates = new Map<string, DelegationGate>();
    let session: CodingSession | undefined;
    // Registered as each card is minted, not after the session exists: a gate can
    // be raised the moment the engine starts moving, and a card whose id is not
    // yet mapped would be unanswerable.
    const surface = (title: string, detail: string, options: string[]): string => {
      const card = this.deps.openRequest({ scope, title, detail, options });
      if (session) this.gates.set(card.id, session.id);
      return card.id;
    };

    try {
      session = this.deps.createSession({
        goal,
        workspace: this.deps.workspaceFor(scope),
        agentId: scope.agent.id,
        requestedBy: scope.agent.name,
        runOptions,
        // The request is what the teammate asked for; the pool is what the host
        // allows. The runtime clamps one to the other, so no caller can widen
        // its own allocation by asking.
        budget: runOptions.maxCostUsd !== undefined ? { maxCostUsd: runOptions.maxCostUsd } : undefined,
        parentBudget: this.deps.budgetPool?.(scope),
        onApprovalRequired: (approval) => {
          const detail = [approval.why, approval.summary].filter(Boolean).join('\n\n');
          gates.set(surface(`Approve ${approval.tool || 'a gated action'} for @${scope.agent.name}?`, detail, ['Approve', 'Deny']), {
            kind: 'approval',
            requestId: approval.id,
          });
        },
        onPlanReviewRequested: (review) => {
          gates.set(surface(`Review @${scope.agent.name}'s plan before implementation`, planReviewDetail(review), ['Approve', 'Request changes', 'Reject']), {
            kind: 'plan_review',
            requestId: review.id,
          });
        },
        onQuestionsRequested: (questions) => {
          const first = questions.questions[0];
          gates.set(surface(first ? first.question : `@${scope.agent.name} needs a decision`, questionsDetail(questions), first?.options ?? []), {
            kind: 'questions',
            requestId: questions.id,
          });
        },
      });
    } catch (err) {
      // The runtime refuses a workspace it has no transport for, and says why.
      return { ok: false, output: `gitu_task could not start: ${(err as Error).message}` };
    }

    const active = session;
    const run: DelegationRun = { session: active, conversationId: scope.conversationId, agentId: scope.agent.id, gates, settled: false };
    this.runs.set(active.id, run);

    const unsubscribe = active.subscribe((event) => this.reportProgress(run, event));
    const onAbort = (): void => {
      void active.cancel('the conversation stopped');
    };
    scope.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => {
      void active.cancel(`time limit reached (${runOptions.timeoutMinutes} minutes)`);
    }, runOptions.timeoutMinutes * 60_000);

    try {
      const result = await active.run(goal);
      return resultFor(result);
    } catch (err) {
      return { ok: false, output: `gitu_task failed: ${(err as Error).message}` };
    } finally {
      run.settled = true;
      clearTimeout(timer);
      unsubscribe();
      scope.signal?.removeEventListener('abort', onAbort);
      // A card still unanswered when the run ends can never reach its gate: the
      // engine cannot settle while a gate is pending, so the only way here is a
      // runtime-side timeout. Close it rather than leave it open forever.
      for (const cardId of gates.keys()) {
        this.gates.delete(cardId);
        this.deps.closeRequest?.(cardId);
      }
      this.deps.sessionSettled?.(active.id);
      // The run holds no live gate once it has settled, so keeping it would only
      // pin the session (and its event log) for the life of the process.
      this.runs.delete(active.id);
      if (scope.conversationId) this.deps.onChange?.(scope.conversationId);
    }
  }

  /**
   * Route a cowork request card back to the runtime gate it stands for.
   *
   * Returns `undefined` when the id is not a delegation card, which is what lets
   * the host run this before its own request handling: every other card keeps
   * its existing behaviour untouched.
   */
  resolve(requestId: string, action: string, response: string): { ok: true; resolution: DelegationResolution } | { ok: false; error: string } | undefined {
    const sessionId = this.gates.get(requestId);
    if (!sessionId) return undefined;
    const run = this.runs.get(sessionId);
    const gate = run?.gates.get(requestId);
    if (!run || !gate) return undefined;
    const session = run.session;
    const settle = (): void => {
      this.gates.delete(requestId);
      run.gates.delete(requestId);
    };
    if (gate.kind === 'approval') {
      const approved = isAffirmative(action, response);
      session.approve(gate.requestId, approved);
      settle();
      return { ok: true, resolution: { status: approved ? 'approved' : 'denied', answer: approved ? 'Approved' : 'Denied' } };
    }
    if (gate.kind === 'plan_review') {
      const note = response.trim();
      // Gitu's own vocabulary distinguishes a refusal that replans (it carries a
      // note) from a bare rejection, so an answer with feedback becomes exactly
      // such a note and a plain refusal stays plain.
      const decision: CodingPlanReviewDecision = isAffirmative(action, note)
        ? { approved: true }
        : isBareRejection(action, note)
          ? { approved: false }
          : { approved: false, note };
      session.approvePlan(gate.requestId, decision);
      settle();
      return { ok: true, resolution: { status: decision.approved ? 'approved' : 'denied', answer: note || (decision.approved ? 'Approved' : 'Rejected') } };
    }
    // Only the typed answer counts. Falling back to the action verb would turn
    // the literal word "answer" into the reply to a question.
    const answer = response.trim();
    if (!answer) return { ok: false, error: 'an answer is required' };
    session.answerQuestions(gate.requestId, answer);
    settle();
    return { ok: true, resolution: { status: 'answered', answer } };
  }

  /** Cancel every delegation started from this conversation (stop/teardown). */
  cancel(conversationId: string, reason: string): number {
    let cancelled = 0;
    for (const run of this.runs.values()) {
      if (run.conversationId !== conversationId || run.settled) continue;
      void run.session.cancel(reason);
      cancelled += 1;
    }
    return cancelled;
  }

  private reportProgress(run: DelegationRun, event: CodingEvent): void {
    if (!run.conversationId) return;
    const text = delegationProgressFor(event);
    if (!text || text === run.lastProgress) return;
    run.lastProgress = text;
    const conversationId = run.conversationId;
    this.deps.progress({ conversationId, agentId: run.agentId, text });
  }
}

/**
 * The tool result the delegating teammate reads. It is a summary on purpose: the
 * teammate must verify the work with its own tools before claiming success.
 */
export function delegationResultSummary(result: CodingRunResult): string {
  const report = result.report;
  if (result.status === 'failed' || !report) {
    // A blocked run is not a failed one: nothing went wrong with the work, the
    // session was not allowed to do it. The teammate must be told the difference
    // so it reports an allocation problem instead of a broken repository.
    const verb = result.status === 'blocked' ? 'stopped' : 'failed';
    return `Engineering task ${verb} (${result.status})${result.error ? `: ${result.error}` : '.'}`;
  }
  const lines = [
    `Engineering task ${report.status === 'complete' ? 'completed' : report.status} (session ${result.sessionId}, task ${report.taskId}).`,
    `Summary: ${report.summary || '(none)'}`,
  ];
  if (report.filesChanged.length > 0) lines.push(`Files changed (${report.filesChanged.length}): ${report.filesChanged.slice(0, 12).join(', ')}${report.filesChanged.length > 12 ? ', …' : ''}`);
  if (report.verification.length > 0) lines.push(`Verification: ${report.verification.slice(0, 8).join('; ')}`);
  if (report.remainingRisks.length > 0) lines.push(`Remaining risks: ${report.remainingRisks.slice(0, 6).join('; ')}`);
  if (report.followUps.length > 0) lines.push(`Follow-ups: ${report.followUps.slice(0, 6).join('; ')}`);
  lines.push('Verify the work with your own tools before reporting it as done.');
  return lines.join('\n');
}

function resultFor(result: CodingRunResult): ToolResult {
  const output = delegationResultSummary(result);
  return { ok: result.status === 'completed', output };
}

function planReviewDetail(review: CodingPlanReviewRequest): string {
  const criteria = review.criteria.length > 0 ? `Criteria: ${review.criteria.join('; ')}` : 'Criteria: (none given)';
  const steps = review.steps.map((step, index) => `${index + 1}. ${step.description} — verify: ${step.verification}`);
  return [criteria, 'Plan:', ...steps].join('\n');
}

function questionsDetail(questions: CodingQuestionsRequest): string {
  return questions.questions
    .map((question) => {
      const lines = [question.header ? `${question.header}: ${question.question}` : question.question];
      if (question.options.length > 0) lines.push(`Options: ${question.options.join(' | ')}`);
      return lines.join('\n');
    })
    .join('\n\n');
}
