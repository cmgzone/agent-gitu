/**
 * AG-UI adapter: projects Gitu's session event stream onto the AG-UI protocol
 * so an AG-UI client (the OpenMuse-derived mobile/web UI, or any
 * `@ag-ui/client` consumer) can render runs live.
 *
 * Gitu emits two frame kinds per run (see `StreamFrame` in `server.ts`):
 * prose rows (`say …`, `user-msg …`, `file {…}`, legacy tool lines) and typed
 * `CodingEvent`s. The translator below turns both into the AG-UI vocabulary:
 *
 * - `say …` prose            → TEXT_MESSAGE_START/CONTENT/END
 * - tool-ish typed events    → TOOL_CALL_START/ARGS/END/RESULT
 * - gates (approvals, plan)  → CUSTOM `gitu.*` plus an open tool call a
 *                              human-in-the-loop card can answer
 * - evidence / budget state  → STATE_DELTA (RFC 6902) so clients keep a
 *                              live `state` object without parsing the stream
 * - run lifecycle            → RUN_STARTED / RUN_FINISHED / RUN_ERROR
 *
 * Custom event names are namespaced `gitu.*` and documented in
 * `docs/ui-v2-migration.md`.
 */

import { EventType, type BaseEvent, type RunAgentInput } from '@ag-ui/core';
import { AbstractAgent } from '@ag-ui/client';
import { Observable } from 'rxjs';
import type { CodingEvent } from '../coding/events.js';

/**
 * The adapter's view of one Gitu stream frame. Structurally compatible with
 * `SessionEvent` and `NativeEventFrame` in `server.ts`; declared here so the
 * translator does not import the server's private types.
 */
export interface GituStreamFrame {
  /** Session row cursor; absent on typed-only frames. */
  i?: number;
  /** Runtime log cursor; present on typed-only frames. */
  seq?: number;
  /** ISO timestamp. */
  t: string;
  /** Prose row text (`say …`, `file {…}`, legacy lines). */
  text?: string;
  /** Typed classification of the same transition, when available. */
  typed?: CodingEvent;
}

/** Custom event names emitted beside the standard AG-UI vocabulary. */
export const GITU_CUSTOM_EVENTS = {
  runStarted: 'gitu.run.started',
  runCompleted: 'gitu.run.completed',
  runFailed: 'gitu.run.failed',
  planCreated: 'gitu.plan.created',
  /** The model's reasoning trace, so a surface can show the thinking itself. */
  reasoning: 'gitu.reasoning',
  approvalRequired: 'gitu.approval.required',
  approvalResolved: 'gitu.approval.resolved',
  planReviewRequested: 'gitu.plan_review.requested',
  planReviewResolved: 'gitu.plan_review.resolved',
  questionsRequested: 'gitu.questions.requested',
  questionsAnswered: 'gitu.questions.answered',
  chiefDecided: 'gitu.chief.decided',
  policyDenied: 'gitu.policy.denied',
  operationBlocked: 'gitu.operation.blocked',
  evidenceRecorded: 'gitu.evidence.recorded',
  checkpointCreated: 'gitu.checkpoint.created',
  checkpointRestored: 'gitu.checkpoint.restored',
  recovering: 'gitu.recovering',
  fileShared: 'gitu.file.shared',
  log: 'gitu.log',
} as const;

function now(): number {
  return Date.now();
}

function custom(name: string, value: unknown): BaseEvent {
  return { type: EventType.CUSTOM, name, value, timestamp: now() } as BaseEvent;
}

/**
 * Stateful Gitu→AG-UI translator. One instance per run: tool calls that open
 * in one frame (`command_started`) close in a later one (`command_finished`),
 * so correlation state lives here rather than in the caller.
 */
export class AguiTranslator {
  /** correlation key → toolCallId for calls still open. */
  private readonly openCalls = new Map<string, string>();
  private messageSeq = 0;
  private callSeq = 0;

  private nextMessageId(): string {
    this.messageSeq += 1;
    return `gitu-msg-${this.messageSeq}`;
  }

  private nextToolCallId(): string {
    this.callSeq += 1;
    return `gitu-call-${this.callSeq}`;
  }

  /** One prose row → AG-UI events. */
  fromText(text: string): BaseEvent[] {
    if (text.startsWith('say ')) {
      const messageId = this.nextMessageId();
      return [
        { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant', timestamp: now() } as BaseEvent,
        { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: text.slice(4), timestamp: now() } as BaseEvent,
        { type: EventType.TEXT_MESSAGE_END, messageId, timestamp: now() } as BaseEvent,
      ];
    }
    if (text.startsWith('file ')) {
      let value: unknown = text.slice(5);
      try {
        value = JSON.parse(text.slice(5));
      } catch {
        /* keep the raw payload when it is not JSON */
      }
      return [custom(GITU_CUSTOM_EVENTS.fileShared, value)];
    }
    // `user-msg …` echoes input the client already rendered; legacy tool lines
    // arrive here only when no typed event exists, so they become log entries.
    if (text.startsWith('user-msg ')) return [];
    return [custom(GITU_CUSTOM_EVENTS.log, { text })];
  }

  /** A complete (begin+result in one frame) synthetic tool call. */
  private toolCallComplete(name: string, args: unknown, result: unknown): BaseEvent[] {
    const toolCallId = this.nextToolCallId();
    return [
      { type: EventType.TOOL_CALL_START, toolCallId, toolCallName: name, timestamp: now() } as BaseEvent,
      { type: EventType.TOOL_CALL_ARGS, toolCallId, delta: JSON.stringify(args), timestamp: now() } as BaseEvent,
      { type: EventType.TOOL_CALL_END, toolCallId, timestamp: now() } as BaseEvent,
      {
        type: EventType.TOOL_CALL_RESULT,
        messageId: this.nextMessageId(),
        toolCallId,
        content: JSON.stringify(result),
        timestamp: now(),
      } as BaseEvent,
    ];
  }

  /** Open a tool call that a later frame closes (keyed correlation). */
  private toolCallBegin(key: string, name: string, args: unknown): BaseEvent[] {
    const toolCallId = this.nextToolCallId();
    this.openCalls.set(key, toolCallId);
    return [
      { type: EventType.TOOL_CALL_START, toolCallId, toolCallName: name, timestamp: now() } as BaseEvent,
      { type: EventType.TOOL_CALL_ARGS, toolCallId, delta: JSON.stringify(args), timestamp: now() } as BaseEvent,
      { type: EventType.TOOL_CALL_END, toolCallId, timestamp: now() } as BaseEvent,
    ];
  }

  /**
   * Close a call opened by `toolCallBegin`. A result arriving with no matching
   * open call (e.g. the subscriber joined mid-run) still renders as a
   * complete synthetic call rather than being dropped.
   */
  private toolCallClose(key: string, name: string, args: unknown, result: unknown): BaseEvent[] {
    const toolCallId = this.openCalls.get(key);
    this.openCalls.delete(key);
    if (toolCallId === undefined) return this.toolCallComplete(name, args, result);
    return [
      {
        type: EventType.TOOL_CALL_RESULT,
        messageId: this.nextMessageId(),
        toolCallId,
        content: JSON.stringify(result),
        timestamp: now(),
      } as BaseEvent,
    ];
  }



  /** One typed coding event → AG-UI events. */
  fromCodingEvent(event: CodingEvent): BaseEvent[] {
    switch (event.type) {
      case 'run_started':
        return [custom(GITU_CUSTOM_EVENTS.runStarted, { goal: event.goal, workspace: event.workspace })];
      case 'plan_created':
        return [custom(GITU_CUSTOM_EVENTS.planCreated, { steps: event.steps })];
      case 'file_read':
        return this.toolCallComplete('read_file', { path: event.path }, { ok: true, path: event.path });
      case 'file_changed':
        return this.toolCallComplete(
          'edit_file',
          {
            path: event.path,
            ...(event.linesAdded !== undefined ? { linesAdded: event.linesAdded } : {}),
            ...(event.linesRemoved !== undefined ? { linesRemoved: event.linesRemoved } : {}),
            ...(event.diff !== undefined ? { diff: event.diff } : {}),
          },
          { ok: true, path: event.path },
        );
      case 'reasoning':
        // The trace is the payload: a consumer that renders nothing for it shows
        // a silent run, which is what made reasoning invisible in the first place.
        return [custom(GITU_CUSTOM_EVENTS.reasoning, { text: event.text })];
      case 'command_started':
        return this.toolCallBegin(`cmd:${event.command}`, 'run_command', { command: event.command });
      case 'command_finished':
        return this.toolCallClose(`cmd:${event.command}`, 'run_command', { command: event.command }, {
          ok: event.ok,
          ...(event.exitCode !== undefined ? { exitCode: event.exitCode } : {}),
          ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
        });
      case 'test_started':
        return this.toolCallBegin(`test:${event.command}`, 'run_tests', {
          command: event.command,
          ...(event.framework ? { framework: event.framework } : {}),
        });
      case 'test_finished':
        return this.toolCallClose(`test:${event.command}`, 'run_tests', { command: event.command }, {
          status: event.status,
          ...(event.passed !== undefined ? { passed: event.passed } : {}),
          ...(event.failed !== undefined ? { failed: event.failed } : {}),
          ...(event.skipped !== undefined ? { skipped: event.skipped } : {}),
          ...(event.durationMs !== undefined ? { durationMs: event.durationMs } : {}),
        });
      case 'approval_required':
        return [
          custom(GITU_CUSTOM_EVENTS.approvalRequired, {
            approvalId: event.approvalId,
            tool: event.tool,
            why: event.why,
            summary: event.summary,
            requestedAt: event.requestedAt ?? event.at,
          }),
          // An open tool call lets human-in-the-loop cards bind the decision
          // to a call id; `approval_resolved` closes it.
          ...this.toolCallBegin(`approval:${event.approvalId}`, 'approval_request', {
            approvalId: event.approvalId,
            tool: event.tool,
            why: event.why,
            summary: event.summary,
          }),
        ];
      case 'approval_resolved':
        return [
          custom(GITU_CUSTOM_EVENTS.approvalResolved, {
            approvalId: event.approvalId,
            approved: event.approved,
            tool: event.tool,
            reason: event.reason,
          }),
          ...(event.approvalId && this.openCalls.has(`approval:${event.approvalId}`)
            ? this.toolCallClose(`approval:${event.approvalId}`, 'approval_request', {}, {
                approved: event.approved,
                ...(event.reason ? { reason: event.reason } : {}),
              })
            : []),
        ];
      case 'plan_review_requested':
        return [
          custom(GITU_CUSTOM_EVENTS.planReviewRequested, {
            requestId: event.requestId,
            plan: event.plan,
            criteria: event.criteria,
            steps: event.steps,
            requestedAt: event.requestedAt ?? event.at,
          }),
          ...this.toolCallBegin(`plan:${event.requestId}`, 'plan_review', { requestId: event.requestId }),
        ];
      case 'plan_review_resolved':
        return [
          custom(GITU_CUSTOM_EVENTS.planReviewResolved, {
            requestId: event.requestId,
            decision: event.decision,
            reason: event.reason,
          }),
          ...this.toolCallClose(`plan:${event.requestId}`, 'plan_review', {}, {
            decision: event.decision,
            ...(event.reason ? { reason: event.reason } : {}),
          }),
        ];
      case 'questions_requested':
        return [
          custom(GITU_CUSTOM_EVENTS.questionsRequested, {
            requestId: event.requestId,
            questions: event.questions,
            details: event.details,
            requestedAt: event.requestedAt ?? event.at,
          }),
          ...this.toolCallBegin(`questions:${event.requestId}`, 'ask_questions', {
            requestId: event.requestId,
            questions: event.questions,
            details: event.details,
          }),
        ];
      case 'questions_answered':
        return [
          custom(GITU_CUSTOM_EVENTS.questionsAnswered, { requestId: event.requestId, reason: event.reason }),
          ...this.toolCallClose(`questions:${event.requestId}`, 'ask_questions', {}, {
            answered: true,
            ...(event.reason ? { reason: event.reason } : {}),
          }),
        ];
      case 'chief_decided':
        return [
          custom(GITU_CUSTOM_EVENTS.chiefDecided, {
            requestKind: event.requestKind,
            requestId: event.requestId,
            action: event.action,
            detail: event.detail,
          }),
        ];
      case 'policy_denied':
        return [
          custom(GITU_CUSTOM_EVENTS.policyDenied, {
            reason: event.reason,
            tool: event.tool,
            operation: event.operation,
            detail: event.detail,
          }),
        ];
      case 'operation_blocked':
        return [
          custom(GITU_CUSTOM_EVENTS.operationBlocked, {
            reason: event.reason,
            tool: event.tool,
            operation: event.operation,
            detail: event.detail,
          }),
        ];
      case 'evidence_recorded':
        return [
          custom(GITU_CUSTOM_EVENTS.evidenceRecorded, {
            evidenceId: event.evidenceId,
            passed: event.passed,
            kind: event.kind,
          }),
          {
            type: EventType.STATE_DELTA,
            delta: [
              {
                op: 'add',
                path: '/evidence/-',
                value: { id: event.evidenceId, passed: event.passed, kind: event.kind, at: event.at },
              },
            ],
            timestamp: now(),
          } as BaseEvent,
        ];
      case 'checkpoint_created':
        return [
          custom(GITU_CUSTOM_EVENTS.checkpointCreated, {
            checkpointId: event.checkpointId,
            label: event.label,
            gitSha: event.gitSha,
          }),
        ];
      case 'checkpoint_restored':
        return [
          custom(GITU_CUSTOM_EVENTS.checkpointRestored, {
            checkpointId: event.checkpointId,
            gitSha: event.gitSha,
            reason: event.reason,
          }),
        ];
      case 'recovering':
        return [
          custom(GITU_CUSTOM_EVENTS.recovering, {
            message: event.message,
            attempt: event.attempt,
            maxAttempts: event.maxAttempts,
          }),
        ];
      case 'completed':
        return [custom(GITU_CUSTOM_EVENTS.runCompleted, { summary: event.summary })];
      case 'failed':
        return [custom(GITU_CUSTOM_EVENTS.runFailed, { reason: event.reason })];
      case 'log':
        return [custom(GITU_CUSTOM_EVENTS.log, { text: event.text })];
    }
  }

  /** One stream frame → AG-UI events (typed classification wins over prose). */
  fromFrame(frame: GituStreamFrame): BaseEvent[] {
    if (frame.typed) return this.fromCodingEvent(frame.typed);
    if (frame.text !== undefined) return this.fromText(frame.text);
    return [];
  }
}


/** Run statuses the agent treats as terminal. */
export type GituRunStatus =
  | 'running'
  | 'waiting_for_model'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'aborted'
  | 'unknown';

/**
 * The seam between the AG-UI agent and Gitu's server core. `server.ts`
 * implements this over `RunSession` (start/continue a run, subscribe to its
 * `subscribers` set, read terminal status); tests implement it with a fake.
 *
 * `subscribe` must replay the session backlog before live frames so a client
 * that connects mid-run sees the full transcript.
 */
export interface GituRunBridge {
  /** Start (or continue) the Gitu run backing this AG-UI thread. */
  startRun(input: { threadId: string; runId: string; goal: string }): Promise<{ status: GituRunStatus }>;
  /** Subscribe to stream frames; returns an unsubscribe function. */
  subscribe(threadId: string, listener: (frame: GituStreamFrame) => void): () => void;
  /** Current status of the run backing this thread, if known. */
  status(threadId: string): GituRunStatus;
}

/**
 * An AG-UI agent whose "model" is Gitu's runtime: a run request starts (or
 * continues) a Gitu session, and the session's event stream is translated to
 * AG-UI events until the run reaches a terminal state.
 *
 * Mounting options (decided in the migration plan):
 * - behind `@copilotkit/runtime` (what the OpenMuse-derived UI expects), or
 * - behind a plain AG-UI SSE endpoint for `@ag-ui/client` consumers.
 */
export class GituAguiAgent extends AbstractAgent {
  constructor(private readonly bridge: GituRunBridge) {
    super({ agentId: 'gitu' });
  }

  override clone(): GituAguiAgent {
    return new GituAguiAgent(this.bridge);
  }

  override run(input: RunAgentInput): Observable<BaseEvent> {
    const { threadId, runId } = input;
    return new Observable<BaseEvent>((subscriber) => {
      const translator = new AguiTranslator();
      let finished = false;

      const finish = (status: GituRunStatus, errorMessage?: string): void => {
        if (finished) return;
        finished = true;
        if (status === 'failed') {
          subscriber.next({ type: EventType.RUN_ERROR, message: errorMessage ?? 'Run failed', timestamp: now() } as BaseEvent);
        } else {
          subscriber.next({
            type: EventType.RUN_FINISHED,
            threadId,
            runId,
            result: { status },
            timestamp: now(),
          } as BaseEvent);
        }
        subscriber.complete();
      };

      subscriber.next({ type: EventType.RUN_STARTED, threadId, runId, timestamp: now() } as BaseEvent);

      const unsubscribe = this.bridge.subscribe(threadId, (frame) => {
        for (const event of translator.fromFrame(frame)) subscriber.next(event);
        const typed = frame.typed;
        if (typed?.type === 'completed') finish('completed');
        else if (typed?.type === 'failed') finish('failed', typed.reason);
      });

      const latest = input.messages.filter((message) => message.role === 'user').at(-1);
      const goal = typeof latest?.content === 'string' ? latest.content : '';
      this.bridge
        .startRun({ threadId, runId, goal })
        .then(({ status }) => {
          // A run that was already terminal when the client connected finishes
          // immediately after the replayed backlog.
          if (status === 'completed' || status === 'failed' || status === 'aborted' || status === 'blocked') {
            finish(status, status === 'failed' ? this.bridge.status(threadId) : undefined);
          }
        })
        .catch((error: unknown) => {
          finish('failed', error instanceof Error ? error.message : String(error));
        });

      return () => {
        finished = true;
        unsubscribe();
      };
    });
  }
}

