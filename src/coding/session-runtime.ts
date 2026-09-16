/**
 * The session runtime — the seam Cowork, the CLI and future VM workers talk to.
 *
 * It owns three things that must not live in a transport:
 *
 *   1. the event stream, via `CodingEventLog`, which enforces native-first
 *      aggregation and suppresses shim duplicates by kind;
 *   2. the approval gate, so `approve()` has an id to answer and the first
 *      surface to answer wins;
 *   3. session lifecycle state, so a consumer never inspects engine internals.
 *
 * Engine construction is delegated to the extracted factory. The runtime
 * overrides the factory's two event sinks (and takes over the approval gate),
 * because a caller-supplied sink here would publish the same transition twice —
 * once natively and once through the legacy shim.
 *
 * Not yet owned, deliberately: plan review and questions stay host-supplied
 * pass-throughs, and `approvePlan` / `answerQuestions` say so. They become
 * runtime-owned together with their typed events, not by throwing a silent
 * no-op at the contract.
 */

import { Gitu } from '../agent/gitu.js';
import type { ApprovalHandler } from '../policy/policy.js';
import type { CompletionReport } from '../types.js';
import { nowIso, shortId } from '../util.js';
import type { CodingApprovalRequest, CodingEventListener, CodingRunResult, CodingSession, CodingSessionStatus, CodingSessionView } from './contract.js';
import type { CodingEventPayload } from './events.js';
import { CodingEventLog, type CodingEventLogOptions } from './event-log.js';
import { createGitu, type GituFactoryDependencies, type GituFactoryOptions } from './gitu-factory.js';
import type { LlmClient } from '../llm/llm.js';
import { describeWorkspace, isLocalWorkspace, workspacePath, type WorkspaceRef } from './workspace.js';

export interface GituSessionRequest {
  goal: string;
  workspace: WorkspaceRef;
  /**
   * Factory inputs for this session. The runtime owns both event sinks and the
   * approval gate, so a caller's `onEvent`, `onCodingEvent` and
   * `approvalHandler` are ignored — supplying them there would publish the same
   * transition twice.
   */
  engine: {
    options: Omit<GituFactoryOptions, 'llm'> & { llm: LlmClient };
    deps: Omit<GituFactoryDependencies, 'onEvent' | 'onCodingEvent' | 'approvalHandler'>;
  };
  /** Attribution for memories and the UI; wiring into memory scoping lands with
   *  server adoption. */
  agentId?: string;
  requestedBy?: string;
  /** How long a pending approval waits before the gate denies it. */
  approvalTimeoutMs?: number;
  /** Surfaces a pending approval. The runtime owns the answer. */
  onApprovalRequired?: (request: CodingApprovalRequest) => void;
  eventLog?: CodingEventLogOptions;
}

export interface GituSessionRuntimeOptions {
  /**
   * Engine construction. Defaults to the extracted Gitu factory; injectable so
   * tests can drive the runtime without a real engine.
   */
  createEngine?: (
    request: GituSessionRequest,
    sinks: { onEvent: (line: string) => void; onCodingEvent: (event: CodingEventPayload) => void; approvalHandler: ApprovalHandler },
  ) => Gitu;
}

function defaultCreateEngine(
  request: GituSessionRequest,
  sinks: { onEvent: (line: string) => void; onCodingEvent: (event: CodingEventPayload) => void; approvalHandler: ApprovalHandler },
): Gitu {
  return createGitu(
    { ...request.engine.options, llm: request.engine.options.llm },
    {
      ...request.engine.deps,
      onEvent: sinks.onEvent,
      onCodingEvent: sinks.onCodingEvent,
      approvalHandler: sinks.approvalHandler,
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
    const timeoutMs = request.approvalTimeoutMs ?? 120_000;

    /** Pending approvals. The first surface to answer wins; a second call finds
     *  the id gone and does nothing, which is the "one approval object" rule. */
    const pending = new Map<string, { resolve: (approved: boolean) => void }>();

    const approvalHandler: ApprovalHandler = (gate) => {
      const approvalId = shortId('appr');
      const decided = new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => {
          if (pending.delete(approvalId)) {
            log.publishNative({ type: 'approval_resolved', approvalId, approved: false, reason: 'timed out' });
            resolve(false);
          }
        }, timeoutMs);
        pending.set(approvalId, {
          resolve: (approved) => {
            clearTimeout(timer);
            resolve(approved);
          },
        });
      });
      log.publishNative({ type: 'approval_required', approvalId, tool: gate.tool, why: gate.why });
      request.onApprovalRequired?.({ id: approvalId, tool: gate.tool, why: gate.why, summary: gate.summary, requestedAt: nowIso() });
      return decided;
    };

    const engine = this.createEngine(engineRequest, {
      onEvent: (line) => log.publishLegacy(line),
      onCodingEvent: (payload) => log.publishNative(payload),
      approvalHandler,
    });

    let status: CodingSessionStatus = 'running';
    let error: string | undefined;
    let taskId: string | undefined;
    let report: CompletionReport | undefined;
    let finishedAt: string | undefined;

    const execute = async (goal: string): Promise<CodingRunResult> => {
      status = 'running';
      finishedAt = undefined;
      error = undefined;
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
        const entry = pending.get(approvalId);
        if (!entry) return;
        pending.delete(approvalId);
        log.publishNative({ type: 'approval_resolved', approvalId, approved });
        entry.resolve(approved);
      },
      approvePlan: () => {
        throw new Error('Plan review is still host-owned: resolve it through the surface that holds the planReviewHandler.');
      },
      answerQuestions: () => {
        throw new Error('Questions are still host-owned: answer them through the surface that holds the askUserHandler.');
      },
      events: (sinceSeq) => log.events(sinceSeq),
      subscribe: (listener: CodingEventListener) => log.subscribe(listener),
    };
  }
}
