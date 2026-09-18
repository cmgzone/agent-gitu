/**
 * The Chief of Staff boundary.
 *
 * Every gated request a run raises — an approval, a plan review, a clarification
 * question — is owned by the runtime and settled by whichever surface answers
 * first. A chief of staff is one such surface and deliberately *not* a second
 * approval system: it receives the request the runtime minted, answers it
 * through the runtime's own resolution method for that exact id, and escalates
 * anything outside the authority it was granted.
 *
 * The contract lives beside the requests it answers rather than inside the
 * decision layer, so that layer can be implemented and tested without the
 * engine, the transport or Cowork — and so the runtime depends on one small
 * interface instead of on a policy implementation.
 *
 * `escalate` is a decision, not the absence of one: it is how a chief says "this
 * is the person's call", and the runtime treats it as such by leaving the request
 * pending for the user's own surface.
 */

import type { RiskTier } from '../types.js';
import type { CodingApprovalRequest, CodingPlanReviewRequest, CodingQuestionsRequest } from './contract.js';

/**
 * The shared vocabulary for what a chief decided about a request.
 *
 * The actions are the request's own outcomes rather than a general vocabulary of
 * replies, so a decision cannot be applied to the wrong kind of request by
 * accident: `answer` settles a question, `approve`/`reject` settle an approval,
 * `request_changes` settles a plan review back to the agent for replanning, and
 * `escalate` settles nothing — it hands the request to the user.
 */
export type ChiefDecision =
  | { action: 'approve'; reason: string }
  | { action: 'reject'; reason: string }
  | { action: 'answer'; answer: string }
  | { action: 'request_changes'; note: string }
  | { action: 'escalate'; reason: string };

export type ChiefDecisionAction = ChiefDecision['action'];

export type ChiefRequestKind = 'approval' | 'plan_review' | 'questions';

/**
 * One gated request, as the runtime asks it.
 *
 * `request` is the runtime's own record — same id, same `requestedAt` — so a
 * decision names the request it decides and a late decision can never settle a
 * successor. `tier` is the policy engine's classification for an approval; it is
 * evidence about the request, never authority over it, and a chief that treats it
 * as permission would be re-deciding a call the policy engine already made.
 */
export type ChiefRequest =
  | { kind: 'approval'; request: CodingApprovalRequest; tier: RiskTier }
  | { kind: 'plan_review'; request: CodingPlanReviewRequest }
  | { kind: 'questions'; request: CodingQuestionsRequest };

/**
 * What a chief may consider beyond the request itself.
 *
 * `budget` is the session's remaining allocation when the host can price model
 * calls; a chief that cannot see money must say so rather than assume there is
 * plenty. `scope` is whatever the surface owning the session knows and the
 * runtime does not — a mission, a conversation, a teammate — so a decision can be
 * made and explained in the terms the person granted authority in.
 */
export interface ChiefContext {
  sessionId: string;
  goal: string;
  agentId?: string;
  requestedBy?: string;
  budget?: { remainingUsd?: number; ceilingUsd?: number };
  scope?: Record<string, string>;
}

export interface ChiefInput {
  request: ChiefRequest;
  context: ChiefContext;
}

/**
 * The seam the runtime consults for a gated request.
 *
 * Implementations must be safe to call for every request: `decide` resolves to a
 * decision, never throws in a way the runtime has to guess at, and never blocks
 * the gate (the runtime consults it without awaiting before the gate exists).
 * A failure is not a decision — the runtime treats a rejected promise as an
 * escalation, because a resolver that broke has no authority to grant.
 */
export interface ChiefResolver {
  decide(input: ChiefInput): Promise<ChiefDecision>;
}

/** Every decision action, in display order. Keeps surfaces and parity tests exhaustive. */
export const CHIEF_DECISION_ACTIONS = ['approve', 'reject', 'answer', 'request_changes', 'escalate'] as const satisfies readonly ChiefDecisionAction[];

/**
 * What a decision says, in the decision's own words: the reason, the answer or the
 * note. A surface carries this rather than re-deriving a policy the chief already
 * applied, and it is the whole of what a person needs to judge the decision.
 */
export function describeChiefDecision(decision: ChiefDecision): string {
  switch (decision.action) {
    case 'approve':
    case 'reject':
    case 'escalate':
      return decision.reason;
    case 'answer':
      return decision.answer;
    case 'request_changes':
      return decision.note;
  }
}
