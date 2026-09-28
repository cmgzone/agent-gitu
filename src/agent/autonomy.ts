/**
 * Persistent autonomy — when a run is allowed to end.
 *
 * A coding agent that stops because its provider hiccupped is indistinguishable,
 * from the user's seat, from an agent that gave up. The default policy is
 * therefore: keep working. Provider noise, protocol drift, a repeated call, or
 * an exhausted effort estimate are all RECOVERABLE — the engine recovers and
 * continues. Only three things end a run:
 *
 *   1. the work is complete (or the engine legitimately reports blocked on a
 *      user-owned prerequisite),
 *   2. the user stops it,
 *   3. an explicit ceiling the user set (`maxTurns` / `maxCostUsd`) is reached.
 *
 * `persistent: false` restores the legacy fail-fast limits for callers that
 * want them (tests against the old contract, or a host that prefers bounded
 * runs). It is not a fallback for the engine's own bugs — it is a knob.
 */

import type { MalformedPolicy } from '../loop/malformed-tracker.js';

export interface AutonomyPolicy {
  /** Recover from recoverable noise instead of ending the run. Default true. */
  persistent: boolean;
  /** Absolute turn ceiling for one run. Unset means the effort plan alone decides. */
  maxTurns?: number;
  /** Per-run spend ceiling in USD. Unset means the host prices no ceiling. */
  maxCostUsd?: number;
}

/** The shipped default: an agent that finishes the job. */
export const DEFAULT_AUTONOMY: AutonomyPolicy = { persistent: true };

/**
 * Legacy fail-fast limits, used only when a caller explicitly opts out of
 * persistent autonomy. These are the values the engine shipped before the
 * policy existed, so an opt-out keeps its old behavior exactly.
 */
export const FAIL_FAST_MALFORMED_POLICY: MalformedPolicy = { remindAt: 1, escalateAt: 2, haltAt: 3 };

/**
 * Persistent limits. They are still a ladder — remind, then change strategy,
 * then a protocol reset — but the last rung no longer ends the run; it forces
 * the strongest available change of approach.
 */
export const PERSISTENT_MALFORMED_POLICY: MalformedPolicy = { remindAt: 3, escalateAt: 6, haltAt: 12 };

/** One contentless-reply retry ladder: two backoff retries, then one escalation. */
export const MAX_EMPTY_REPLY_RETRIES = 2;

/**
 * Consecutive contentless ladders before the run reports a provider failure.
 * A provider that returns no content across this many full ladders (retries,
 * a reduced-effort re-ask, a protocol downgrade, and backoff) is not having a
 * transient blip — the honest outcome is to say so, with the model named, and
 * leave the task resumable. Any content at all resets this.
 */
export const MAX_EMPTY_LADDER_CYCLES = 3;

/**
 * Absolute per-run turn ceiling, independent of effort and autonomy.
 *
 * This is a liveness backstop, not a task limit: it sits far above any real
 * run (a 60-turn high-effort plan extends without bound while it verifies
 * progress) and exists so a provider bug that fabricates endless plausible
 * work cannot spin forever. Reaching it is reported, never silent.
 */
export const ABSOLUTE_TURN_CEILING = 1_000;

/** Backoff between contentless-reply retries. */
export const EMPTY_REPLY_RETRY_BASE_MS = 1_500;
export const EMPTY_REPLY_RETRY_MAX_MS = 30_000;

/** Normalize a partial/host-supplied policy into a complete one. */
export function resolveAutonomy(policy?: Partial<AutonomyPolicy>): AutonomyPolicy {
  const resolved: AutonomyPolicy = {
    persistent: policy?.persistent ?? DEFAULT_AUTONOMY.persistent,
  };
  if (policy?.maxTurns !== undefined && Number.isFinite(policy.maxTurns) && policy.maxTurns > 0) {
    resolved.maxTurns = Math.floor(policy.maxTurns);
  }
  if (policy?.maxCostUsd !== undefined && Number.isFinite(policy.maxCostUsd) && policy.maxCostUsd > 0) {
    resolved.maxCostUsd = policy.maxCostUsd;
  }
  return resolved;
}

/** Malformed-call limits that match the policy in force. */
export function malformedPolicyFor(autonomy: AutonomyPolicy): MalformedPolicy {
  return autonomy.persistent ? PERSISTENT_MALFORMED_POLICY : FAIL_FAST_MALFORMED_POLICY;
}

/**
 * The turn ceiling in force. A user-set ceiling always wins; otherwise the
 * effort plan's budget is the initial grant and persistent autonomy may extend
 * it without limit.
 */
export function turnCeilingFor(autonomy: AutonomyPolicy): number {
  return Math.min(autonomy.maxTurns ?? Number.MAX_SAFE_INTEGER, ABSOLUTE_TURN_CEILING);
}

/**
 * Whether the engine may grant another turn extension when a budget is spent.
 *
 * Persistent autonomy is UNLIMITED while verified progress continues — that is
 * the whole point of the policy, and it is what stops a long build, a frontend
 * polish cycle, or a hard debugging run from being cut off mid-task. A run that
 * produces no verifiable movement across every extension window is a different
 * animal: it is stuck, and a stuck run is reported rather than looped forever.
 */
export function mayExtendBudget(input: {
  persistent: boolean;
  progressing: boolean;
  extensionsUsed: number;
  extensionLimit: number;
}): boolean {
  if (input.extensionsUsed < input.extensionLimit) return true;
  return input.persistent && input.progressing;
}
