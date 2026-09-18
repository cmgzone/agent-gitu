/**
 * The model-backed judgment layer for questions a chief has no standing answer for.
 *
 * A chief of staff decides from a policy, and a policy cannot answer "should the
 * migration be additive?" — that needs the mission's own context. So this module
 * supplies the one judgment call the chief is allowed to make with a model: answer
 * a question, in the terms the mission was granted authority in.
 *
 * It is deliberately the narrowest possible use of a model:
 *
 *   1. **It only answers.** The prompt asks for an answer or a refusal, and a reply
 *      that claims any other action (`approve`, `reject`, …) is discarded as an
 *      answer. The chief's own `decide` enforces the same rule a second time, so a
 *      model that ignored the prompt still cannot grant anything.
 *   2. **It spends the mission's money, not the host's.** Every call is charged to
 *      the same envelope the delegated work draws from — a mission's grant, or the
 *      conversation's delegation pool — and a spent envelope is refused before a
 *      single token is bought. An unattended team's questions are part of its cost.
 *   3. **It is bounded.** One call, no retries, a wall-clock cap, and a hard cap on
 *      the answer's length: a hung provider must not hold a gate past the point
 *      where the person would rather have answered it themselves.
 *
 * The advisor is not an authority: its answer is information handed back to the
 * agent that asked, and whatever that agent does next still faces the gates. That
 * is why it can be admitted where an approval never would be.
 */

import type { BudgetAccount } from '../coding/budget.js';
import { describeChiefDecision, type ChiefInput } from '../coding/chief.js';
import { extractJson, UsageTrackingClient, type LlmClient, type LlmMessage, type LlmUsage } from '../llm/llm.js';
import { authorityPolicySummary, type AuthorityPolicy } from './authority.js';
import type { ChiefAdvisor, ChiefDecisionRecord } from './chief.js';

export interface ModelChiefAdvisorOptions {
  llm: LlmClient;
  /** The provider and model the call is priced as — the teammate's own. */
  providerId: string;
  model: string;
  /** Price one call, so the envelope sees what the chief spent. */
  priceOf: (usage: LlmUsage | undefined) => number | undefined;
  /**
   * The envelope this call is charged to: the mission's allocation, or the
   * delegation pool behind it. Absent means the host has no account to charge, in
   * which case the call is made unaccounted rather than refused — the runtime's own
   * budget is what bounds the work, and the advisor must not invent a ceiling the
   * host never set.
   */
  account?: BudgetAccount;
  /** The authority in force, summarised into the prompt. */
  policy: AuthorityPolicy;
  /** Wall-clock cap for one answer. */
  timeoutMs?: number;
  /** One line per declined answer, for the conversation's progress area. */
  onEvent?: (text: string) => void;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_ANSWER_CHARS = 1_200;
const MAX_QUESTION_CHARS = 4_000;
const MAX_DECISIONS_IN_PROMPT = 12;

/**
 * Build the advisor a chief consults for a question the policy has no answer for.
 *
 * The returned function resolves to an answer, or to `undefined` when it has no
 * opinion — a spent budget, a failed call, a reply that is not an answer. An
 * `undefined` is not a failure the runtime has to handle: the chief escalates it to
 * the person, which is exactly what would have happened without an advisor at all.
 */
export function modelChiefAdvisor(options: ModelChiefAdvisorOptions): ChiefAdvisor {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return async ({ input, decisions }) => {
    // Money first: a mission whose envelope is spent must not spend more finding out
    // how to answer a question. The chief escalates, and the person sees why.
    const remaining = options.account?.remaining().costUsd;
    if (remaining !== undefined && remaining <= 0) {
      options.onEvent?.('chief answer declined — the mission budget is spent');
      return undefined;
    }
    const messages = chiefAdvisorPrompt(input, decisions, options.policy);
    // Only a question is offered to this layer, and anything else is refused rather
    // than reinterpreted: a prompt written for a question cannot answer an approval.
    if (!messages) return undefined;

    const llm = new UsageTrackingClient(options.llm, (usage) => {
      const cost = options.priceOf(usage);
      options.account?.charge({ turns: 1, ...(cost !== undefined ? { costUsd: cost } : {}) });
    });
    let reply: string;
    try {
      reply = await llm.complete(messages, {
        // Low and cheap on purpose: this is a bounded clerical answer about work
        // already authorised, not prose and not a plan.
        temperature: 0.2,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      options.onEvent?.(`chief answer unavailable — ${(err as Error).message}`);
      return undefined;
    }

    const answer = parseChiefAdvisorReply(reply);
    if (!answer) {
      options.onEvent?.('chief answer declined — the model did not return an answer');
      return undefined;
    }
    return { action: 'answer', answer };
  };
}

/**
 * The answer in a model reply, or undefined when it did not give one.
 *
 * Deliberately narrow. A reply that names another action is not a slightly wrong
 * answer, it is a request for authority this layer does not have, and it must not be
 * read as one — the same reason the chief ignores an advisor that returns `approve`.
 */
export function parseChiefAdvisorReply(reply: string): string | undefined {
  const parsed = extractJson(reply);
  if (!parsed || typeof parsed !== 'object') return undefined;
  const record = parsed as Record<string, unknown>;
  const action = record['action'];
  if (typeof action === 'string' && action !== 'answer') return undefined;
  const answer = typeof record['answer'] === 'string' ? record['answer'].trim() : '';
  if (!answer) return undefined;
  return answer.length <= MAX_ANSWER_CHARS ? answer : `${answer.slice(0, MAX_ANSWER_CHARS - 1)}…`;
}

/**
 * The messages one answer costs.
 *
 * Returns undefined for anything that is not a question. The prompt carries the
 * facts a person would weigh: the mission's goal, the delegation's budget, the
 * authority in force, and the decisions already made in this session — so an answer
 * can be consistent with the session it is answering inside.
 */
export function chiefAdvisorPrompt(input: ChiefInput, decisions: readonly ChiefDecisionRecord[], policy: AuthorityPolicy): LlmMessage[] | undefined {
  if (input.request.kind !== 'questions') return undefined;
  const { request, context } = input;
  const questions = request.request.questions
    .map((question, index) => {
      const lines = [`${index + 1}. ${clip(question.question, MAX_QUESTION_CHARS)}`];
      if (question.header) lines.push(`   Topic: ${question.header}`);
      if (question.options.length > 0) lines.push(`   Offered options: ${question.options.join(' | ')}`);
      return lines.join('\n');
    })
    .join('\n');

  const budget =
    context.budget?.remainingUsd === undefined
      ? 'not priced by this host'
      : `$${context.budget.remainingUsd.toFixed(2)}${context.budget.ceilingUsd !== undefined ? ` of $${context.budget.ceilingUsd.toFixed(2)}` : ''} left`;

  const history =
    decisions.length === 0
      ? '(none yet)'
      : decisions
          .slice(-MAX_DECISIONS_IN_PROMPT)
          .map((record) => `- ${record.requestKind.replace(/_/g, ' ')}: ${clip(record.summary, 160)} → ${record.decision.action} (${clip(describeChiefDecision(record.decision), 160)})`)
          .join('\n');

  return [
    { role: 'system', content: CHIEF_ADVISOR_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        `Mission: ${clip(context.goal, 600)}`,
        `Delegating teammate: ${context.requestedBy ?? context.agentId ?? 'a teammate'}`,
        `Budget: ${budget}`,
        '',
        'AUTHORITY IN FORCE',
        authorityPolicySummary(policy),
        '',
        'DECISIONS ALREADY MADE IN THIS SESSION',
        history,
        '',
        'QUESTIONS',
        questions,
        '',
        'Reply with JSON only: {"answer": "..."} or {"escalate": "..."}',
      ].join('\n'),
    },
  ];
}

const CHIEF_ADVISOR_SYSTEM_PROMPT = [
  'You are the chief of staff for an unattended engineering mission. A teammate has paused to ask the agent that delegated its work a question, and no person is available to answer it.',
  '',
  'You may ONLY answer the question. You cannot approve, reject, authorise, or perform any action, and a reply that attempts to will be discarded. Your answer is information for the agent that asked: anything it does next still has to pass its own approval gates.',
  '',
  'Answer from the facts you were given — the mission, its budget, the authority in force, and the decisions already made in this session. If the question needs a person\'s decision (anything production-facing, destructive, credential-related, spending beyond the budget shown, or a preference only the owner knows), refuse to answer and escalate instead.',
  'Never invent values you were not given: no credentials, tokens, prices, customer data, or file contents. Do not describe plans for future work; answer the question that was asked.',
  '',
  'Reply with JSON on its own, with no prose around it:',
  '{"answer": "<the answer, in one or two sentences>"}',
  '{"escalate": "<why a person must decide this>"}',
].join('\n');

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
