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
import type { ApprovalHandler } from '../policy/policy.js';
import type { CompletionReport } from '../types.js';
import { nowIso, shortId } from '../util.js';
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
import type { LlmClient } from '../llm/llm.js';
import { describeWorkspace, isLocalWorkspace, workspacePath, type WorkspaceRef } from './workspace.js';

export interface GituSessionRequest {
  goal: string;
  workspace: WorkspaceRef;
  /**
   * Factory inputs for this session. The runtime owns both event sinks, the
   * approval gate and the plan/question gates, so a caller's `onEvent`,
   * `onCodingEvent`, `approvalHandler`, `planReviewHandler` and
   * `askUserHandler` are ignored — supplying them there would publish the same
   * transition twice.
   */
  engine: {
    options: Omit<GituFactoryOptions, 'llm'> & { llm: LlmClient };
    deps: Omit<GituFactoryDependencies, 'onEvent' | 'onCodingEvent' | 'approvalHandler' | 'planReviewHandler' | 'askUserHandler'>;
  };
  /** Attribution for memories and the UI; wiring into memory scoping lands with
   *  server adoption. */
  agentId?: string;
  requestedBy?: string;
  /** How long any pending gate (approval, plan review, questions) waits before
   *  the runtime denies it. Gates fail closed, never open. */
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
interface EngineSinks {
  onEvent: (line: string) => void;
  onCodingEvent: (event: CodingEventPayload) => void;
  approvalHandler: ApprovalHandler;
  planReviewHandler: PlanReviewHandler;
  askUserHandler: AskUserHandler;
}

export interface GituSessionRuntimeOptions {
  /**
   * Engine construction. Defaults to the extracted Gitu factory; injectable so
   * tests can drive the runtime without a real engine.
   */
  createEngine?: (request: GituSessionRequest, sinks: EngineSinks) => Gitu;
}

function defaultCreateEngine(request: GituSessionRequest, sinks: EngineSinks): Gitu {
  return createGitu(
    { ...request.engine.options, llm: request.engine.options.llm },
    {
      ...request.engine.deps,
      onEvent: sinks.onEvent,
      onCodingEvent: sinks.onCodingEvent,
      approvalHandler: sinks.approvalHandler,
      planReviewHandler: sinks.planReviewHandler,
      askUserHandler: sinks.askUserHandler,
    },
  );
}

export class GituSessionRuntime {
  private readonly createEngine: NonNullable<GituSessionRuntimeOptions['createEngine']>;

  constructor(options: GituSessionRuntimeOptions = {}) {
    this.createEngine = options.createEngine ?? defaultCreateEngine;
  }

  createSession(request: GituSessionRequest): CodingSession {
    // A container or remote workspace needs a transport this runtime does not
    // have yet. Refusing loudly beats silently running against the wrong cwd.
    if (!isLocalWorkspace(request.workspace)) {
      throw new Error(
        `The runtime cannot execute in a ${request.workspace.type} workspace yet (${describeWorkspace(request.workspace)}). Provide a host or worktree workspace, or a transport that mounts it.`,
      );
    }
    const workspaceRoot = workspacePath(request.workspace);
    // Derived, not trusted: the engine's cwd and the session view must agree,
    // so a caller cannot hand the runtime one workspace and the engine another.
    const engineRequest: GituSessionRequest = { ...request, engine: { ...request.engine, options: { ...request.engine.options, workspaceRoot } } };
    const log = new CodingEventLog(request.eventLog);
    const id = shortId('run');
    const startedAt = nowIso();
    const timeoutMs = request.gateTimeoutMs ?? 120_000;

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
      log.publishNative({ type: 'approval_required', approvalId, tool: gate.tool, why: gate.why });
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
            log.publishNative({ type: 'plan_review_resolved', requestId, decision: 'rejected' });
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
      log.publishNative({ type: 'plan_review_requested', requestId, plan });
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
            log.publishNative({ type: 'questions_answered', requestId });
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
      log.publishNative({ type: 'questions_requested', requestId, questions: questions.map((question) => question.question) });
      request.onQuestionsRequested?.(record);
      return decided;
    };

    const engine = this.createEngine(engineRequest, {
      onEvent: (line) => log.publishLegacy(line),
      onCodingEvent: (payload) => log.publishNative(payload),
      approvalHandler,
      planReviewHandler,
      askUserHandler,
    });

    let status: CodingSessionStatus = 'running';
    let error: string | undefined;
    let taskId: string | undefined;
    let report: CompletionReport | undefined;
    let finishedAt: string | undefined;

    const execute = async (goal: string): Promise<CodingRunResult> => {
      // Published after the runtime has accepted the run and gone active, and
      // immediately before the engine sees the goal. Creating a session is not
      // starting work: a session may sit idle, be resumed, or be re-used.
      status = 'running';
      finishedAt = undefined;
      error = undefined;
      log.publishNative({ type: 'run_started', goal, workspace: describeWorkspace(request.workspace) });
      try {
        const result = await engine.run(goal);
        taskId = result.ledger.data.taskId;
        report = result.report;
        status = result.report.status === 'complete' ? 'completed' : result.report.status === 'blocked' ? 'blocked' : 'failed';
        finishedAt = nowIso();
        return { sessionId: id, status, report, error: undefined };
      } catch (err) {
        status = 'failed';
        error = (err as Error).message;
        finishedAt = nowIso();
        return { sessionId: id, status, error };
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
      }),
      run: (goal) => execute(goal),
      continue: async (message) => {
        // A live run is steered; a settled session resumes its task with the
        // message, which is what the engine's own ledger makes possible.
        if (status === 'running') {
          engine.queueMessage(message);
          return { sessionId: id, status };
        }
        return execute(message);
      },
      cancel: async (reason) => {
        // The run promise settles on its own, and the status is set when it
        // does — a consumer never sees a session claim to be running after a
        // stop it asked for but that has not finished unwinding.
        engine.stop();
        if (reason && status === 'running') log.publishNative({ type: 'log', text: `stop requested — ${reason}` });
      },
      approve: (approvalId, approved) => {
        const entry = pendingApprovals.get(approvalId);
        if (!entry) return;
        pendingApprovals.delete(approvalId);
        if (pendingApproval?.id === approvalId) pendingApproval = undefined;
        log.publishNative({ type: 'approval_resolved', approvalId, approved });
        entry.resolve(approved);
      },
      approvePlan: (decision) => {
        // No id parameter on the contract, and Gitu pauses the run for one
        // review at a time — so the oldest pending review is the one answered.
        const entry = pendingPlanReviews.entries().next();
        if (entry.done) return;
        const [requestId, gate] = entry.value;
        pendingPlanReviews.delete(requestId);
        if (pendingPlanReview?.id === requestId) pendingPlanReview = undefined;
        // Gitu's own language distinguishes a refusal that replans (a note) from
        // a bare rejection, so the code follows it rather than flattening both.
        const settled: PlanReviewDecision = decision.approved ? 'approved' : decision.note ? 'changes_requested' : 'rejected';
        log.publishNative({ type: 'plan_review_resolved', requestId, decision: settled });
        gate.resolve(decision);
      },
      answerQuestions: (answer) => {
        const entry = pendingQuestionGates.entries().next();
        if (entry.done) return;
        const [requestId, gate] = entry.value;
        pendingQuestionGates.delete(requestId);
        if (pendingQuestions?.id === requestId) pendingQuestions = undefined;
        log.publishNative({ type: 'questions_answered', requestId });
        gate.resolve(answer);
      },
      events: (sinceSeq) => log.events(sinceSeq),
      subscribe: (listener: CodingEventListener) => log.subscribe(listener),
    };
  }
}
