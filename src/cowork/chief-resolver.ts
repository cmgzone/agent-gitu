import type { CoworkRequest, CoworkStore } from './store.js';

export type ChiefDecision =
  | { action: 'approve'; reason: string }
  | { action: 'reject'; reason: string }
  | { action: 'answer'; answer: string }
  | { action: 'request_changes'; note: string }
  | { action: 'escalate'; reason: string };

/** Host-owned delegation, never supplied by an agent or inferred from prose.
 * Exact question matches deliberately avoid treating an LLM's risk assessment
 * or a tool name as authority. Permission grants are not supported in v1. */
export interface ChiefAuthorityPolicy {
  enabled: boolean;
  chiefAgentId: string;
  conversationId: string;
  missionId: string;
  maxSpendUsd: number;
  answers: readonly {
    agentId: string;
    title: string;
    detail: string;
    options: readonly string[];
    answer: string;
    decisionId: string;
  }[];
}

/** Trusted host snapshot. Missing pricing or mission information fails closed.
 * Budget checks do not reserve funds or grant permission to spend. */
export interface ChiefResolverContext {
  missionId: string;
  missionActive: boolean;
  spentUsd: number;
  reservedUsd: number;
  costComplete: boolean;
}

export interface ChiefResolution {
  requestId: string;
  chiefAgentId?: string;
  decision: ChiefDecision;
  /** Only true when the existing store waiter accepted this resolution. */
  applied: boolean;
  decisionId?: string;
}

const escalate = (reason: string): ChiefDecision => ({ action: 'escalate', reason });

/** Fixed-policy resolver. The union leaves room for future runtime adapters,
 * but this implementation may only answer a previously delegated question. */
export function decideChiefRequest(
  request: Readonly<CoworkRequest>,
  policy: Readonly<ChiefAuthorityPolicy> | undefined,
  context: Readonly<ChiefResolverContext> | undefined,
): { decision: ChiefDecision; decisionId?: string } {
  if (!policy?.enabled) return { decision: escalate('Chief authority is disabled.') };
  if (request.status !== 'open') return { decision: escalate('Request is already resolved.') };
  if (request.conversationId !== policy.conversationId || !policy.missionId || !context?.missionActive || context.missionId !== policy.missionId) {
    return { decision: escalate('Request is outside the delegated conversation or active mission.') };
  }
  const costs = [policy.maxSpendUsd, context.spentUsd, context.reservedUsd];
  if (!context.costComplete || costs.some((cost) => !Number.isFinite(cost) || cost < 0) || context.spentUsd + context.reservedUsd > policy.maxSpendUsd) {
    return { decision: escalate('Budget information is incomplete or the delegated spending limit is exceeded.') };
  }
  if (request.kind !== 'question' || request.permission !== undefined) {
    return { decision: escalate('Permission grants and recommendations require a human resolver.') };
  }
  const matches = policy.answers.filter((rule) => rule.agentId === request.agentId &&
    rule.title === request.title && rule.detail === request.detail &&
    rule.options.length === request.options.length && rule.options.every((option, index) => option === request.options[index]));
  if (matches.length !== 1) return { decision: escalate('No unambiguous delegated answer matches this exact question.') };
  const rule = matches[0]!;
  if (!rule.decisionId.trim() || !rule.answer.trim() || rule.answer.length > 2000 ||
      (request.options.length > 0 && !request.options.includes(rule.answer))) {
    return { decision: escalate('The delegated answer is invalid or lacks a prior decision reference.') };
  }
  return { decision: { action: 'answer', answer: rule.answer }, decisionId: rule.decisionId };
}

/** Shared eligibility + policy + context evaluation. Pure: it never mutates the
 * store, which is what lets the server decide here and apply through its own
 * existing request-resolution path instead of adding a second applier. */
export function evaluateChiefAuthority(
  store: CoworkStore,
  request: Readonly<CoworkRequest>,
  policy?: Readonly<ChiefAuthorityPolicy>,
  context?: Readonly<ChiefResolverContext>,
): { decision: ChiefDecision; decisionId?: string } {
  if (!policy?.enabled) return { decision: escalate('Chief authority is disabled.') };
  const conversation = store.getConversation(request.conversationId);
  const chief = store.getAgent(policy.chiefAgentId);
  if (!chief?.chiefOfStaff || conversation?.chiefId !== chief.id ||
      !conversation.memberIds.includes(chief.id) || !conversation.memberIds.includes(request.agentId) || request.agentId === chief.id) {
    return { decision: escalate('The delegated Chief or requesting agent is not eligible for this conversation.') };
  }
  return decideChiefRequest(request, policy, context);
}

/** Standalone applier for hosts with no richer request path. The server decides
 * with `evaluateChiefAuthority` and applies through `resolveCoworkRequestAction`,
 * so this is deliberately NOT called from the server: one request, one applier.
 * Synchronous read/decide/settle means Web or Telegram cannot be overwritten by
 * a late Chief answer. Escalation leaves the request open for human surfaces.
 * The host must retain the returned attribution in its audit/event stream. */
export function resolveChiefRequest(
  store: CoworkStore,
  requestId: string,
  policy?: Readonly<ChiefAuthorityPolicy>,
  context?: Readonly<ChiefResolverContext>,
): ChiefResolution {
  const result = (decision: ChiefDecision, applied = false, decisionId?: string): ChiefResolution =>
    ({ requestId, chiefAgentId: policy?.chiefAgentId, decision, applied, decisionId });
  const request = store.getRequest(requestId);
  if (!request) return result(escalate('Request not found.'));
  const { decision, decisionId } = evaluateChiefAuthority(store, request, policy, context);
  if (decision.action !== 'answer') return result(decision);
  const resolved = store.resolveRequest(requestId, 'answered', decision.answer);
  return result(decision, Boolean(resolved), decisionId);
}
