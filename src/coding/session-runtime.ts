/**
 * The session runtime — the seam Cowork, the CLI and future VM workers talk to.
 *
 * It owns five things that must not live in a transport:
 *
 *   1. the event stream, via `CodingEventLog`, which enforces native-first
 *      aggregation and suppresses shim duplicates by kind;
 *   2. the approval gate, so `approve()` has an id to answer and the first
 *      surface to answer wins;
 *   3. the plan-review and question gates on the same terms, so
 *      `approvePlan()` / `answerQuestions()` answer a request the runtime owns;
 *   4. the run lifecycle boundary — `run_started` is published here, when the
 *      runtime accepts a run, not when a session is created;
 *   5. session lifecycle state, so a consumer never inspects engine internals.
 *
 * Engine construction is delegated to the extracted factory. The runtime
 * overrides the factory's two event sinks, its approval gate and its plan/question
 * gates, because a caller-supplied sink here would publish the same transition
 * twice — once natively and once through the legacy shim.
 */

import { Gitu, type AskUserHandler, type PlanReviewHandler } from '../agent/gitu.js';
import { UsageTrackingClient, type LlmClient, type LlmUsage } from '../llm/llm.js';
import type { ApprovalHandler } from '../policy/policy.js';
import type { CompletionReport } from '../types.js';
import { nowIso, shortId } from '../util.js';
import { createBudgetAccount, type BudgetAccount, type RunBudget } from './budget.js';
import type {
  CodingApprovalRequest,
  CodingEventListener,
  CodingPlanReviewDecision,
  CodingPlanReviewRequest,
  CodingQuestionsRequest,
  CodingRunResult,
  CodingSession,
  CodingSessionStatus,
  CodingSessionView,
} from './contract.js';
import type { CodingEventPayload, PlanReviewDecision } from './events.js';
import { CodingEventLog, type CodingEventLogOptions } from './event-log.js';
import { createGitu, type GituFactoryDependencies, type GituFactoryOptions } from './gitu-factory.js';
import { describeWorkspace, isLocalWorkspace, workspacePath, type WorkspaceRef } from './workspace.js';

export interface GituSessionRequest {
  goal: string;
  workspace: WorkspaceRef;
  /**
   * Host services stable for the whole session — connections, skills, MCP,
   * browser. The runtime owns both event sinks and all three gates, so those
   * are omitted here: supplying them would publish the same transition twice.
   *
   * Optional for a host that is only part-way migrated: `GituServer` still
   * builds its own engine, so it creates a session purely to own the gates and
   * wires `gates` into that engine. A session created that way cannot run, and
   * says so instead of constructing an engine with no host services.
   */
  deps?: Omit<GituFactoryDependencies, 'onEvent' | 'onCodingEvent' | 'approvalHandler' | 'planReviewHandler' | 'askUserHandler'>;
  /**
   * Per-run engine options, including the LLM.
   *
   * Called once per run and once per continuation, because the engine is built
   * per run while the session persists. A continuation resumes its task with
   * its own conversation history and its own usage-tracking client, which is
   * exactly what the server does today. `attempt` counts runs in this session,
   * starting at 1.
   *
   * The returned `workspaceRoot` is ignored: the runtime derives it from
   * `workspace` so the engine's cwd and the session view can never disagree.
   *
   * Optional on the same terms as `deps`: a gate-ownership session never builds
   * an engine, so it has no per-run options to offer.
   */
  runOptions?: (run: { goal: string; attempt: number; budget: BudgetAccount }) => GituFactoryOptions;
  /**
   * The session's allocation. The runtime is where it is enforced: a session
   * whose allocation is spent refuses to start, and a run that spends its last
   * dollar stops rather than running until a wall-clock cap notices.
   *
   * `RunBudget` alone is a plan; the runtime turns it into an account, which is
   * what makes a *hierarchy* real. Two sessions sharing one pool cannot each
   * believe they own the whole ceiling.
   */
  budget?: RunBudget;
  /**
   * An enclosing allocation this session draws from — a mission, a host pool of
   * delegated work, or a parent agent. The session's own `budget` is clamped to
   * what that account has left, and everything this session spends is charged to
   * it, so a sibling that spends first shrinks what the next session may be
   * given.
   */
  parentBudget?: BudgetAccount;
  /**
   * Price one model call, in USD. Optional because pricing belongs to the host
   * (it owns the catalog and the credential); a session without it still
   * enforces turn ceilings instead of claiming to enforce money it cannot see.
   */
  costOf?: (usage: LlmUsage) => number | undefined;
  /** Attribution for memories and the UI; wiring into memory scoping lands with
   *  server adoption. */
  agentId?: string;
  requestedBy?: string;
  /** How long any pending gate (approval, plan review, questions) waits before
   *  the runtime settles it. Two gates deny, one proceeds on defaults — see
   *  `releaseGates` for why those are not the same class of behaviour. */
  gateTimeoutMs?: number;
  /** Surfaces a pending approval. The runtime owns the answer. */
  onApprovalRequired?: (request: CodingApprovalRequest) => void;
  /** Surfaces a pending plan review. The runtime owns the answer. */
  onPlanReviewRequested?: (request: CodingPlanReviewRequest) => void;
  /** Surfaces pending questions. The runtime owns the answer. */
  onQuestionsRequested?: (request: CodingQuestionsRequest) => void;
  eventLog?: CodingEventLogOptions;
}

/**
 * What the runtime hands the engine instead of letting the engine own its own
 * gates and stream. Every entry here is a transition the runtime publishes
 * natively, which is why a caller cannot supply any of them.
 */
export interface EngineSinks {
  onEvent: (line: string) => void;
  onCodingEvent: (event: CodingEventPayload) => void;
  approvalHandler: ApprovalHandler;
  planReviewHandler: PlanReviewHandler;
  askUserHandler: AskUserHandler;
}

export interface GituSessionRuntimeOptions {
  /**
   * Engine construction, invoked once per run. Defaults to the extracted Gitu
   * factory; injectable so tests can drive the runtime without a real engine.
   */
  createEngine?: (request: GituSessionRequest, options: GituFactoryOptions, sinks: EngineSinks) => Gitu;
}

/**
 * The engine-construction inputs.
 *
 * A session that exists only to own gates — the transitional shape while a host
 * still builds its own engine — has neither, and being asked to run is a
 * programming error worth naming rather than an empty engine worth guessing at.
 */
function requireEngineInputs(request: GituSessionRequest): {
  deps: NonNullable<GituSessionRequest['deps']>;
  runOptions: NonNullable<GituSessionRequest['runOptions']>;
} {
  if (!request.deps || !request.runOptions) {
    throw new Error('This session was created for gate ownership only; supply `deps` and `runOptions` for the runtime to build and run an engine.');
  }
  return { deps: request.deps, runOptions: request.runOptions };
}

function defaultCreateEngine(request: GituSessionRequest, options: GituFactoryOptions, sinks: EngineSinks): Gitu {
  const { deps } = requireEngineInputs(request);
  return createGitu(options, {
    ...deps,
    onEvent: sinks.onEvent,
    onCodingEvent: sinks.onCodingEvent,
    approvalHandler: sinks.approvalHandler,
    planReviewHandler: sinks.planReviewHandler,
    askUserHandler: sinks.askUserHandler,
  });
}

/**
 * A Gitu session, plus the runtime-owned gate handlers.
 *
 * Transitional (step 4): a host that still constructs its own engine — as
 * GituServer does while its run loop is being migrated — wires `gates` into that
 * engine so the gate *decision path* is runtime-owned, while the host keeps
 * mirroring visible state for its existing endpoints and UI.
 *
 * This accessor disappears once the host runs through `run()`, because then the
 * runtime builds the engine itself and no host should be holding these.
 */
export interface GituCodingSession extends CodingSession {
  readonly gates: Pick<EngineSinks, 'approvalHandler' | 'planReviewHandler' | 'askUserHandler'>;
  /**
   * The runtime's own event sinks, for the same transitional reason as `gates`.
   *
   * A host that still builds its own engine must report through these rather
   * than through a private stream of its own: they are what makes the runtime's
   * log the single record of a run, with the legacy text shimmed and native
   * events collected in one place. `onEvent` takes a legacy prose line,
   * `onCodingEvent` a typed payload from a subsystem that reports natively.
   */
  readonly sinks: Pick<EngineSinks, 'onEvent' | 'onCodingEvent'>;
}

export class GituSessionRuntime {
  private readonly createEngine: NonNullable<GituSessionRuntimeOptions['createEngine']>;

  constructor(options: GituSessionRuntimeOptions = {}) {
    this.createEngine = options.createEngine ?? defaultCreateEngine;
  }

  createSession(request: GituSessionRequest): GituCodingSession {
    // A container or remote workspace needs a transport this runtime does not
    // have yet. Refusing loudly beats silently running against the wrong cwd.
    if (!isLocalWorkspace(request.workspace)) {
      throw new Error(
        `The runtime cannot execute in a ${request.workspace.type} workspace yet (${describeWorkspace(request.workspace)}). Provide a host or worktree workspace, or a transport that mounts it.`,
      );
    }
    const workspaceRoot = workspacePath(request.workspace);
    const log = new CodingEventLog(request.eventLog);
    const id = shortId('run');
    const startedAt = nowIso();
    const timeoutMs = request.gateTimeoutMs ?? 120_000;

    /**
     * The session's allocation, created once and drawn down by every run and
     * continuation — a continuation is the same work, so it spends the same
     * money. A parent account is what makes the hierarchy enforceable: this
     * session's ceiling is what the parent had left, and each charge here is
     * also charged there.
     */
    const requestedBudget: RunBudget = request.budget ?? {};
    const account = request.parentBudget ? request.parentBudget.allocate(requestedBudget) : createBudgetAccount(requestedBudget);
    const tokens = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, messages: 0 };
    let spentCostUsd = 0;
    let pricedCalls = 0;
    let unpricedCalls = 0;

    /**
     * Pending gates. Every map is keyed by request id, and the first surface to
     * answer wins: a second answer finds the id gone and does nothing. That is
     * the "one request object" rule — the runtime owns the request and its
     * resolution state, and surfaces are views onto it.
     */
    const pendingApprovals = new Map<string, { resolve: (approved: boolean) => void }>();
    const pendingPlanReviews = new Map<string, { resolve: (decision: CodingPlanReviewDecision) => void }>();
    const pendingQuestionGates = new Map<string, { resolve: (answer: string) => void }>();

    /** The authoritative pending-gate state a surface reads from `getState()`. */
    let pendingApproval: CodingApprovalRequest | undefined;
    let pendingPlanReview: CodingPlanReviewRequest | undefined;
    let pendingQuestions: CodingQuestionsRequest | undefined;

    const approvalHandler: ApprovalHandler = (gate) => {
      const approvalId = shortId('appr');
      const record: CodingApprovalRequest = { id: approvalId, tool: gate.tool, why: gate.why, summary: gate.summary, requestedAt: nowIso() };
      const decided = new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          if (pendingApprovals.delete(approvalId)) {
            if (pendingApproval?.id === approvalId) pendingApproval = undefined;
            log.publishNative({ type: 'approval_resolved', approvalId, approved: false, reason: 'timed out' });
            resolve(false);
          }
        }, timeoutMs);
        pendingApprovals.set(approvalId, {
          resolve: (approved) => {
            clearTimeout(timer);
            resolve(approved);
          },
        });
      });
      pendingApproval = record;
      // The event and the pending record are the same request, so they share one
      // requestedAt; the envelope's `at` is a publication stamp and can diverge
      // from it under replay.
      log.publishNative({ type: 'approval_required', approvalId, tool: gate.tool, why: gate.why, summary: gate.summary, requestedAt: record.requestedAt });
      request.onApprovalRequired?.(record);
      return decided;
    };

    const planReviewHandler: PlanReviewHandler = (input) => {
      const requestId = shortId('pr');
      const record: CodingPlanReviewRequest = { id: requestId, criteria: input.criteria, steps: input.steps, requestedAt: nowIso() };
      const plan = [
        `criteria: ${input.criteria.join('; ') || '(none)'}`,
        ...input.steps.map((step, index) => `${index + 1}. ${step.description} — verify: ${step.verification}`),
      ].join('\n');
      const decided = new Promise<CodingPlanReviewDecision>((resolve) => {
        const timer = setTimeout(() => {
          if (pendingPlanReviews.delete(requestId)) {
            if (pendingPlanReview?.id === requestId) pendingPlanReview = undefined;
            log.publishNative({ type: 'plan_review_resolved', requestId, decision: 'rejected', reason: 'timed out' });
            resolve({ approved: false, note: 'Plan review timed out.' });
          }
        }, timeoutMs);
        pendingPlanReviews.set(requestId, {
          resolve: (decision) => {
            clearTimeout(timer);
            resolve(decision);
          },
        });
      });
      pendingPlanReview = record;
      log.publishNative({ type: 'plan_review_requested', requestId, plan, criteria: input.criteria, steps: input.steps, requestedAt: record.requestedAt });
      request.onPlanReviewRequested?.(record);
      return decided;
    };

    const askUserHandler: AskUserHandler = (questions) => {
      const requestId = shortId('q');
      const record: CodingQuestionsRequest = { id: requestId, questions, requestedAt: nowIso() };
      const decided = new Promise<string>((resolve) => {
        const timer = setTimeout(() => {
          if (pendingQuestionGates.delete(requestId)) {
            if (pendingQuestions?.id === requestId) pendingQuestions = undefined;
            log.publishNative({ type: 'questions_answered', requestId, reason: 'timed out' });
            resolve('(no answer — proceed with reasonable defaults)');
          }
        }, timeoutMs);
        pendingQuestionGates.set(requestId, {
          resolve: (answer) => {
            clearTimeout(timer);
            resolve(answer);
          },
        });
      });
      pendingQuestions = record;
      log.publishNative({
        type: 'questions_requested',
        requestId,
        questions: questions.map((question) => question.question),
        details: questions,
        requestedAt: record.requestedAt,
      });
      request.onQuestionsRequested?.(record);
      return decided;
    };

    /**
     * Fail every pending gate closed.
     *
     * Approvals and plan reviews deny the action; questions answer with the
     * engine's own "proceed with reasonable defaults" value. That difference is
     * deliberate and is NOT one class of behaviour: a denied approval stops the
     * action, while an unanswered question lets the run continue on stated
     * assumptions. Do not "unify" them without changing engine semantics too.
     *
     * Called on cancel, so a stopped run can never leave a gate hanging until
     * its timeout, and safe to call with nothing pending.
     */
    const releaseGates = (reason: string): void => {
      for (const [approvalId, gate] of [...pendingApprovals]) {
        pendingApprovals.delete(approvalId);
        if (pendingApproval?.id === approvalId) pendingApproval = undefined;
        log.publishNative({ type: 'approval_resolved', approvalId, approved: false, reason });
        gate.resolve(false);
      }
      for (const [requestId, gate] of [...pendingPlanReviews]) {
        pendingPlanReviews.delete(requestId);
        if (pendingPlanReview?.id === requestId) pendingPlanReview = undefined;
        log.publishNative({ type: 'plan_review_resolved', requestId, decision: 'rejected', reason });
        gate.resolve({ approved: false, note: `Plan review ${reason}.` });
      }
      for (const [requestId, gate] of [...pendingQuestionGates]) {
        pendingQuestionGates.delete(requestId);
        if (pendingQuestions?.id === requestId) pendingQuestions = undefined;
        log.publishNative({ type: 'questions_answered', requestId, reason });
        gate.resolve('(no answer — proceed with reasonable defaults)');
      }
    };

    const sinks: EngineSinks = {
      onEvent: (line) => log.publishLegacy(line),
      onCodingEvent: (payload) => log.publishNative(payload),
      approvalHandler,
      planReviewHandler,
      askUserHandler,
    };

    /** The engine for the run in flight. Built per run and cleared when it
     *  settles, which is what lets `cancel()` and steering target the right one. */
    let currentEngine: Gitu | undefined;
    let attempt = 0;

    let status: CodingSessionStatus = 'running';
    let error: string | undefined;
    let taskId: string | undefined;
    let report: CompletionReport | undefined;
    let finishedAt: string | undefined;

    /** Set once when a run is stopped by its allocation, not by the engine. */
    let budgetStop: string | undefined;

    /**
     * What is left of the allocation, in the words a person reading a task log
     * needs. Used both to refuse a run up front and to explain a mid-run stop.
     */
    const exhaustionDetail = (): string => {
      const remaining = account.remaining();
      const parts: string[] = [];
      if (remaining.costUsd !== undefined) parts.push(`$${remaining.costUsd.toFixed(4)} of $${(account.budget.maxCostUsd ?? 0).toFixed(2)} left`);
      if (remaining.turns !== undefined) parts.push(`${remaining.turns} of ${account.budget.maxTurns ?? 0} turns left`);
      return `budget exhausted — ${parts.join(', ') || 'the allocation has no room left'}`;
    };

    /**
     * Stop the run because its allocation is spent.
     *
     * Enforced inside the runtime rather than by the caller: a surface that has
     * already handed over the goal is not in a position to notice that the money
     * ran out, and the engine cannot see the allocation at all. Idempotent, so a
     * burst of charges cannot publish the block twice.
     */
    const stopForBudget = (): void => {
      if (budgetStop) return;
      budgetStop = exhaustionDetail();
      status = 'blocked';
      error = budgetStop;
      log.publishNative({ type: 'operation_blocked', reason: 'budget_exhausted', detail: budgetStop });
      releaseGates(budgetStop);
      currentEngine?.stop();
    };

    /**
     * Charge one model call: a turn always, its cost when the host can price it.
     *
     * `charge` records the spend either way — the tokens are already spent by the
     * time this runs, so the only decision left is whether to keep going.
     */
    const accountCall = (usage: LlmUsage | undefined): void => {
      tokens.messages += 1;
      let cost: number | undefined;
      if (usage) {
        tokens.inputTokens += usage.inputTokens;
        tokens.outputTokens += usage.outputTokens;
        tokens.cachedTokens += usage.cachedTokens;
        cost = request.costOf?.(usage);
      }
      if (cost === undefined) unpricedCalls += 1;
      else {
        pricedCalls += 1;
        spentCostUsd += cost;
      }
      if (!account.charge({ turns: 1, ...(cost !== undefined ? { costUsd: cost } : {}) })) stopForBudget();
    };

    /** Every model call the engine makes is charged, including retries. */
    const accounted = (llm: LlmClient): LlmClient => new UsageTrackingClient(llm, accountCall);

    const execute = async (goal: string): Promise<CodingRunResult> => {
      // Resolved before any state moves: a session that cannot start a run must
      // not publish `run_started` or report itself as running.
      const { runOptions } = requireEngineInputs(request);
      // A spent allocation refuses the run outright. No engine is built and no
      // `run_started` is published, because the runtime never accepted the work.
      if (account.exhausted()) {
        const detail = exhaustionDetail();
        status = 'blocked';
        error = detail;
        finishedAt = nowIso();
        log.publishNative({ type: 'operation_blocked', reason: 'budget_exhausted', detail });
        return { sessionId: id, status, error: detail };
      }
      budgetStop = undefined;
      attempt += 1;
      // Published after the runtime has accepted the run and gone active, and
      // immediately before the engine sees the goal. Creating a session is not
      // starting work: a session may sit idle, be resumed, or be re-used.
      status = 'running';
      finishedAt = undefined;
      error = undefined;
      log.publishNative({ type: 'run_started', goal, workspace: describeWorkspace(request.workspace) });
      // Built per run, not per session: a continuation carries its own resume
      // context and its own usage client. `workspaceRoot` is applied last, so a
      // caller's run options can never point the engine at another workspace.
      // The LLM is wrapped last, so every call this run makes is charged to the
      // session's allocation whatever the host handed in.
      const base = runOptions({ goal, attempt, budget: account });
      const options: GituFactoryOptions = { ...base, workspaceRoot, llm: accounted(base.llm) };
      const engine = this.createEngine(request, options, sinks);
      currentEngine = engine;
      try {
        const result = await engine.run(goal);
        taskId = result.ledger.data.taskId;
        report = result.report;
        status = result.report.status === 'complete' ? 'completed' : result.report.status === 'blocked' ? 'blocked' : 'failed';
        // The engine's report cannot see the allocation, so a run stopped for
        // budget reports that — not a generic stall — to whoever asked for it.
        if (budgetStop) {
          status = 'blocked';
          error = budgetStop;
        } else {
          error = undefined;
        }
        finishedAt = nowIso();
        return { sessionId: id, status, report, error };
      } catch (err) {
        status = 'failed';
        error = (err as Error).message;
        finishedAt = nowIso();
        return { sessionId: id, status, error };
      } finally {
        // Only clear our own engine: a continuation may already have replaced it.
        if (currentEngine === engine) currentEngine = undefined;
      }
    };

    return {
      id,
      getState: (): CodingSessionView => ({
        id,
        goal: request.goal,
        status,
        startedAt,
        finishedAt,
        taskId,
        workspace: request.workspace,
        pendingApproval,
        pendingPlanReview,
        pendingQuestions,
        report,
        error,
        usage: {
          ...tokens,
          ...(pricedCalls > 0 ? { costUsd: spentCostUsd } : {}),
          // Honest about mixed accounting: an unpriced call means the session's
          // real spend is higher than the number shown.
          ...(unpricedCalls > 0 ? { costIncomplete: true } : {}),
        },
      }),
      run: (goal) => execute(goal),
      continue: async (message) => {
        // A live run is steered; a settled session resumes its task with the
        // message, which is what the engine's own ledger makes possible.
        if (status === 'running') {
          currentEngine?.queueMessage(message);
          return { sessionId: id, status };
        }
        return execute(message);
      },
      cancel: async (reason) => {
        const note = reason ?? 'cancelled';
        // Release first: a stopped run must never leave a gate hanging until its
        // timeout. Approvals and plan reviews deny; questions proceed on defaults.
        releaseGates(note);
        // The run promise settles on its own, and the status is set when it
        // does — a consumer never sees a session claim to be running after a
        // stop it asked for but that has not finished unwinding.
        currentEngine?.stop();
        if (status === 'running') log.publishNative({ type: 'log', text: `stop requested — ${note}` });
      },
      releasePendingGates: (reason) => {
        // The same release `cancel` performs, minus the engine stop: the run
        // keeps going and only the stale request stops waiting.
        releaseGates(reason);
      },
      approve: (approvalId, approved) => {
        const entry = pendingApprovals.get(approvalId);
        if (!entry) return;
        pendingApprovals.delete(approvalId);
        if (pendingApproval?.id === approvalId) pendingApproval = undefined;
        log.publishNative({ type: 'approval_resolved', approvalId, approved });
        entry.resolve(approved);
      },
      approvePlan: (requestId, decision) => {
        // Keyed by request id, never "whatever is pending now": a second surface
        // answering first must not make this call settle a different review.
        const gate = pendingPlanReviews.get(requestId);
        if (!gate) return;
        pendingPlanReviews.delete(requestId);
        if (pendingPlanReview?.id === requestId) pendingPlanReview = undefined;
        // Gitu's own language distinguishes a refusal that replans (a note) from
        // a bare rejection, so the code follows it rather than flattening both.
        const settled: PlanReviewDecision = decision.approved ? 'approved' : decision.note ? 'changes_requested' : 'rejected';
        log.publishNative({ type: 'plan_review_resolved', requestId, decision: settled });
        gate.resolve(decision);
      },
      answerQuestions: (requestId, answer) => {
        const gate = pendingQuestionGates.get(requestId);
        if (!gate) return;
        pendingQuestionGates.delete(requestId);
        if (pendingQuestions?.id === requestId) pendingQuestions = undefined;
        log.publishNative({ type: 'questions_answered', requestId });
        gate.resolve(answer);
      },
      events: (sinceSeq) => log.events(sinceSeq),
      subscribe: (listener: CodingEventListener) => log.subscribe(listener),
      gates: { approvalHandler, planReviewHandler, askUserHandler },
      sinks: { onEvent: sinks.onEvent, onCodingEvent: sinks.onCodingEvent },
    };
  }
}
