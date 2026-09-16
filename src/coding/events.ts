/**
 * Transport-independent coding event contract.
 *
 * The runtime historically announced progress as free-text lines through
 * `GituConfig.onEvent?: (event: string) => void` — a padded keyword plus a
 * detail string, e.g. `run      $ npm test`, `ok       $ npm test (1840ms)`,
 * `lines    src/cli.ts +12 lines`. That works for exactly one consumer: the UI
 * written next to the emitter. Every additional consumer (Cowork, CLI,
 * Telegram, future cloud/VM workers) would have to re-derive structure with its
 * own regex, and every new emitter line silently changes behaviour in code
 * nobody remembered to update.
 *
 * `CodingEventPayload` is the structured replacement, and the runtime should
 * emit it natively. `toCodingEvent` exists only so two interfaces can share one
 * stream while that migration is in progress. It is deliberately conservative:
 * anything it cannot classify with certainty becomes `log`, never a guess.
 */

/**
 * Cursor + timestamp every consumer needs to order, replay and resume a stream
 * without gaps. Assigned by the runtime (`stampEvent`), never by a parser, so
 * replayed events keep the cursor they were first published with.
 */
export interface CodingEventEnvelope {
  /** Monotonic per session. Doubles as the `events(sinceSeq)` cursor. */
  seq: number;
  /** ISO timestamp of first publication. */
  at: string;
}

/**
 * The payload union — the transport-neutral vocabulary both interfaces render.
 *
 * `run_started`, the test events and the checkpoint events have no
 * source in the legacy text stream at all: the runtime never announced them as
 * lines. `command_finished.exitCode` is different — the executor now emits it
 * natively from the tool result, while the text shim can only recover ok plus a
 * duration. They are part of the contract because the native emitter supplies
 * them, and a consumer must not have to be rewritten when it does.
 */
/**
 * Why a policy gate refused an operation.
 *
 * These are the control systems that actually stopped the action, so the code
 * comes from the gate that decided rather than from parsing its message:
 *
 * - `approval_required` — the operation needed an approval that was not granted
 *   (the user declined it, or no approval channel existed).
 * - `risk_policy` — refused outright by tier policy without consulting approval.
 * - `project_guard` — the target was outside the locked workspace.
 * - `user_instruction` — a standing user instruction forbade it.
 * - `other` — reserved; a gate that cannot classify itself must say so rather
 *   than pick a plausible-looking code.
 */
export type PolicyDenialReason = 'approval_required' | 'risk_policy' | 'project_guard' | 'user_instruction' | 'other';

/**
 * Why the loop/budget subsystem stopped an operation.
 *
 * - `loop_detected` — repeated failing action.
 * - `repeated_skill_operation` — the same skill read already succeeded twice.
 * - `edit_pressure` — edits to one file with no passing evidence yet.
 * - `budget_exhausted` / `prerequisite_missing` — reserved for the run and
 *   recovery subsystems; declared here so consumers can handle them the moment
 *   those emit.
 * - `other` — reserved.
 */
export type OperationBlockReason = 'loop_detected' | 'repeated_skill_operation' | 'edit_pressure' | 'budget_exhausted' | 'prerequisite_missing' | 'other';

/** Why a checkpoint was rolled back. */
export type CheckpointRestoreReason = 'recovery' | 'verification_failure' | 'user_request' | 'specialist_failure' | 'other';

export type CodingEventPayload =
  | { type: 'run_started'; goal: string; workspace?: string }
  | { type: 'plan_created'; steps: number }
  | { type: 'file_read'; path: string }
  | { type: 'file_changed'; path: string; linesAdded?: number }
  | { type: 'command_started'; command: string }
  /**
   * `ok` is the executing layer's interpretation; `exitCode` is the raw fact.
   * It stays absent when there genuinely was no exit status — timeout,
   * cancellation, spawn failure, or a remote/container transport that died —
   * rather than manufacturing a `1` to satisfy the type. The two are
   * deliberately not defined as `ok === (exitCode === 0)`: a tool may treat
   * particular nonzero codes as meaningful.
   */
  | { type: 'command_finished'; command: string; ok: boolean; exitCode?: number; durationMs?: number }
  /**
   * One terminal event per test run. A single command can produce
   * `142 passed, 3 failed, 7 skipped`, which is not a binary outcome — so the
   * counts ride on one `test_finished` rather than two event types, and a
   * consumer renders what it knows about.
   */
  | { type: 'test_started'; command: string; framework?: string }
  | {
      type: 'test_finished';
      command: string;
      status: 'passed' | 'failed';
      passed?: number;
      failed?: number;
      skipped?: number;
      durationMs?: number;
    }
  | { type: 'approval_required'; approvalId: string; tool?: string; why?: string }
  /** Published by whichever surface resolved the request first. Exactly one
   *  approval object exists per session; this is how the other surfaces learn
   *  the request is no longer pending. */
  | { type: 'approval_resolved'; approvalId?: string; approved: boolean; tool?: string; reason?: string }
  /**
   * A control system refused an operation. These are the strongest signals in
   * the stream — evidence that the guard, the policy engine or a user
   * instruction actually intervened — which is why they carry a reason code and
   * not just the message the gate happened to print.
   *
   * `operation` is the summarized action (`$ npm test`, `write src/a.ts`) so a
   * UI can say what was stopped; `detail` is the gate's own explanation.
   */
  | { type: 'policy_denied'; reason: PolicyDenialReason; tool?: string; operation?: string; detail?: string }
  | { type: 'operation_blocked'; reason: OperationBlockReason; tool?: string; operation?: string; detail?: string }
  | { type: 'evidence_recorded'; evidenceId: string; passed: boolean; kind?: string }
  | { type: 'checkpoint_created'; checkpointId: string; label?: string; gitSha?: string }
  /**
   * Emitted when a checkpoint is rolled back — "Gitu detected a bad change and
   * restored checkpoint cp_017". `gitSha` stays optional because a future
   * container/VM checkpoint may not be Git-backed.
   */
  | { type: 'checkpoint_restored'; checkpointId: string; gitSha?: string; reason?: CheckpointRestoreReason }
  | { type: 'recovering'; message: string; attempt?: number; maxAttempts?: number }
  | { type: 'completed'; summary: string }
  | { type: 'failed'; reason: string }
  /**
   * Unclassified progress, carrying the raw runtime line so nothing is ever
   * dropped from a live view. A rising proportion of `log` events is the signal
   * that native emission is missing a case — it is not something to fix by
   * adding regexes here.
   */
  | { type: 'log'; text: string };

export type CodingEvent = CodingEventEnvelope & CodingEventPayload;

/**
 * What a subsystem reports to. It receives the payload only: the runtime owns
 * the envelope (`seq`/`at`), so a gate cannot invent a cursor position and
 * replayed events keep the position they were first published with.
 */
export type CodingEventSink = (event: CodingEventPayload) => void;

export type CodingEventType = CodingEventPayload['type'];

/** Every kind, in display order. Keeps UI filters and parity tests exhaustive. */
export const CODING_EVENT_TYPES = [
  'run_started',
  'plan_created',
  'file_read',
  'file_changed',
  'command_started',
  'command_finished',
  'test_started',
  'test_finished',
  'approval_required',
  'approval_resolved',
  'policy_denied',
  'operation_blocked',
  'evidence_recorded',
  'checkpoint_created',
  'checkpoint_restored',
  'recovering',
  'completed',
  'failed',
  'log',
] as const satisfies readonly CodingEventType[];

/**
 * Kinds the legacy text adapter cannot produce — either because the runtime
 * never announced them as lines, or because they are now emitted natively by
 * the subsystem that decided.
 *
 * `policy_denied` and `operation_blocked` are emitted by the executor at the
 * gate that refused the action. The legacy `denied `/`blocked ` text lines
 * still flow to the existing workspace UI, so the adapter keeps mapping them to
 * `log` rather than guessing at a reason code from their wording.
 *
 * Kept as data (rather than a comment) so the migration can assert the gap
 * closes as native emission lands.
 */
export const NATIVE_ONLY_EVENT_TYPES = [
  'run_started',
  'test_started',
  'test_finished',
  'checkpoint_created',
  'checkpoint_restored',
  'policy_denied',
  'operation_blocked',
] as const satisfies readonly CodingEventType[];

/** Attach the envelope. The only sanctioned way to build a `CodingEvent`. */
export function stampEvent(payload: CodingEventPayload, seq: number, at: string = new Date().toISOString()): CodingEvent {
  return { seq, at, ...payload };
}

/** The legacy emitter pads its keyword to a stable column, so the first
 *  whitespace-delimited token is the only reliable discriminator. */
function splitLegacy(line: string): { token: string; detail: string } | undefined {
  const match = /^([a-z][a-z0-9_-]*)\s+([\s\S]*)$/.exec(line.trim());
  return match?.[1] !== undefined && match[2] !== undefined ? { token: match[1], detail: match[2] } : undefined;
}

/**
 * Map an executor action summary onto a payload.
 *
 * `summarizeParams` (`src/util.ts`) owns these prefixes: `$ <command>`,
 * `read <path>`, `write <path>`, `edit <path>`, plus list/search/lsp/browse
 * forms that are investigation rather than a targeted read, and so stay `log`.
 */
function classifyActionSummary(summary: string): CodingEventPayload {
  if (summary.startsWith('$ ')) return { type: 'command_started', command: summary.slice(2).trim() };
  if (summary.startsWith('read ')) return { type: 'file_read', path: summary.slice(5).trim() };
  if (summary.startsWith('write ')) return { type: 'file_changed', path: summary.slice(6).trim() };
  if (summary.startsWith('edit ')) return { type: 'file_changed', path: summary.slice(5).trim() };
  return { type: 'log', text: summary };
}

/**
 * `<ok|error> <summary> (<ms>ms)` — the executor's completion line.
 *
 * A failed write is not a change, so `file_changed` is only produced on the
 * success path; a failed command still reports `command_finished` with
 * `ok: false`, because a consumer needs to see the command that broke. The
 * command text is recovered from the `$ ` prefix so a legacy-derived event
 * satisfies the same contract a native one does.
 */
function classifyCompletion(detail: string, ok: boolean): CodingEventPayload {
  const timing = /\s\((\d+)ms\)$/.exec(detail);
  const body = timing ? detail.slice(0, timing.index) : detail;
  const durationMs = timing?.[1] !== undefined ? Number(timing[1]) : undefined;
  if (body.startsWith('$ ')) return { type: 'command_finished', command: body.slice(2).trim(), ok, ...(durationMs !== undefined ? { durationMs } : {}) };
  if (ok && (body.startsWith('write ') || body.startsWith('edit '))) return { type: 'file_changed', path: body.replace(/^(write|edit) /, '').trim() };
  return { type: 'log', text: detail };
}

/**
 * Best-effort classifier for the free-text stream. Pure and stateless by
 * design: pairing an `out` line's `[exit N]` with the preceding `ok` line would
 * recover legacy exit codes, but that cross-line coupling is precisely the
 * fragility native emission removes, so it is not attempted here.
 */
export function toCodingEvent(line: string): CodingEventPayload {
  const parsed = splitLegacy(line);
  if (!parsed) return { type: 'log', text: line.trim() };
  const { token, detail } = parsed;

  switch (token) {
    case 'run':
      return classifyActionSummary(detail);
    case 'ok':
      return classifyCompletion(detail, true);
    case 'error':
      // The executor reports both a failed tool call and an invalid-schema
      // rejection with this keyword; only a real command becomes an event.
      return classifyCompletion(detail, false);
    case 'lines': {
      const match = /^(\S+) \+(\d+) lines$/.exec(detail);
      if (match?.[1] === undefined || match[2] === undefined) return { type: 'log', text: detail };
      return { type: 'file_changed', path: match[1], linesAdded: Number(match[2]) };
    }
    case 'plan': {
      const match = /^(\d+) (?:follow-up )?steps$/.exec(detail);
      if (match?.[1] === undefined) return { type: 'log', text: detail };
      return { type: 'plan_created', steps: Number(match[1]) };
    }
    case 'evidence': {
      const match = /^(\S+) (PASS|FAIL)(?: \(([^)]*)\))?/.exec(detail);
      if (match?.[1] === undefined || match[2] === undefined) return { type: 'log', text: detail };
      return { type: 'evidence_recorded', evidenceId: match[1], passed: match[2] === 'PASS', ...(match[3] ? { kind: match[3] } : {}) };
    }
    case 'approval-required': {
      const match = /^(\S+) \[([^\]]+)\] ([\s\S]*)$/.exec(detail);
      if (match?.[1] === undefined) return { type: 'log', text: detail };
      return { type: 'approval_required', approvalId: match[1], ...(match[2] ? { tool: match[2] } : {}), ...(match[3] ? { why: match[3] } : {}) };
    }
    case 'approval': {
      // `approval GRANTED for shell (why)` and `approval appr_x timed out — denied`
      // share the keyword; only the first form names a tool instead of an id.
      const decided = /^(GRANTED|DENIED) for (\S+) \(([\s\S]*)\)$/.exec(detail);
      if (decided?.[1] !== undefined) {
        return { type: 'approval_resolved', approved: decided[1] === 'GRANTED', ...(decided[2] ? { tool: decided[2] } : {}), ...(decided[3] ? { reason: decided[3] } : {}) };
      }
      const timedOut = /^(\S+) timed out/.exec(detail);
      if (timedOut?.[1] !== undefined) return { type: 'approval_resolved', approvalId: timedOut[1], approved: false, reason: 'timed out' };
      return { type: 'log', text: detail };
    }
    case 'recover': {
      const retry = /retry (\d+)\/(\d+)/.exec(detail);
      return {
        type: 'recovering',
        message: detail,
        ...(retry?.[1] !== undefined ? { attempt: Number(retry[1]) } : {}),
        ...(retry?.[2] !== undefined ? { maxAttempts: Number(retry[2]) } : {}),
      };
    }
    case 'done':
      return /^(blocked|failed)\b/.test(detail) ? { type: 'failed', reason: detail } : { type: 'completed', summary: detail };
    default:
      // `stall`/`halt` are deliberately not terminal events: some `stall` lines
      // stop a single repeated action while the run continues, and the final
      // `done` line already carries the real outcome.
      return { type: 'log', text: line.trim() };
  }
}

/** Convenience for consumers that only need the discriminator. */
export function codingEventType(payload: CodingEventPayload): CodingEventType {
  return payload.type;
}
