/**
 * The Chief of Staff — one resolver for all three gated requests.
 *
 * The runtime mints a request and asks whichever surface answers first. This
 * class is the automated surface: it answers what the session's authority policy
 * calls routine, hands everything else to the person, and writes down what it
 * decided so the decision can be explained afterwards.
 *
 * It is deliberately not an agent loop. A chief that reasoned its way to authority
 * would be a second authorization system next to the policy engine, with its own
 * failure modes and no reviewable rule set. So authority comes from one place —
 * an explicit policy whose rules a person can read and change — and judgment is
 * admitted only where a person has supplied it, only for questions, and only to
 * *answer* rather than to grant.
 *
 * Three properties the runtime relies on:
 *
 *   1. `decide` never rejects on a resolver's behalf. An advisor that throws, or
 *      returns something that is not an answer, yields an escalation: a broken
 *      judgment layer has no opinion, and the request stays the person's.
 *   2. A veto is not negotiable. High-impact requests and external tools are
 *      checked before the policy's own rules and are never offered to an advisor.
 *   3. An identical request, asked twice in one session, gets one answer. A retry
 *      must not spend a second advisor call or produce a different answer than the
 *      first — that is the "previous decisions" part of the chief's remit.
 */

import type { ChiefDecision, ChiefInput, ChiefResolver, ChiefRequest, ChiefRequestKind } from '../coding/chief.js';
import { approvalCommand, authorityVeto, evaluateAuthority, resolveAuthorityPolicy, type AuthorityPolicy, type AuthorityPolicyPatch } from './authority.js';

/** Where a decision came from. Kept beside the decision, not inside it: the union is the shared vocabulary. */
export type ChiefDecisionSource = 'policy' | 'recurrence' | 'advisor';

export interface ChiefDecisionRecord {
  at: string;
  source: ChiefDecisionSource;
  requestKind: ChiefRequestKind;
  requestId: string;
  /** Normalized identity of the request, so a repeat can be recognized as one. */
  signature: string;
  /** The request in one line, as the transcript or a log would name it. */
  summary: string;
  decision: ChiefDecision;
}

/**
 * What an advisor is asked, and what it can see.
 *
 * `decisions` is this chief's own record so far, so an answer can be consistent with
 * what was already decided in the same session instead of contradicting it. It is a
 * snapshot: an advisor may read the history, and can never change it.
 */
export interface ChiefAdvisorRequest {
  input: ChiefInput;
  decisions: readonly ChiefDecisionRecord[];
}

/**
 * The host's judgment layer, consulted only for a question the policy has no
 * standing answer for.
 *
 * It may return an `answer`; any other action is ignored, and a rejection or a
 * throw is read as "no opinion". That is the whole safety property: an advisor can
 * add knowledge, never authority. Its answer goes back to the agent that asked —
 * as information, not as permission — and every action that agent takes next still
 * faces its own gate.
 */
export type ChiefAdvisor = (request: ChiefAdvisorRequest) => Promise<ChiefDecision | undefined>;

export interface ChiefOfStaffOptions {
  /** Overrides on top of the default authority policy. */
  policy?: AuthorityPolicyPatch;
  advisor?: ChiefAdvisor;
  /** Whatever the owning surface knows and the runtime does not (mission, conversation). */
  scope?: Record<string, string>;
  /** How many decisions to keep for recurrence and for explanation. */
  historyLimit?: number;
  /** Injectable clock, so a record's timestamp is testable. */
  now?: () => string;
}

const DEFAULT_HISTORY_LIMIT = 50;

export class ChiefOfStaff implements ChiefResolver {
  private readonly policy: AuthorityPolicy;
  private readonly advisor?: ChiefAdvisor;
  private readonly scope?: Record<string, string>;
  private readonly historyLimit: number;
  private readonly now: () => string;
  private readonly records: ChiefDecisionRecord[] = [];

  constructor(options: ChiefOfStaffOptions = {}) {
    this.policy = resolveAuthorityPolicy(options.policy);
    this.advisor = options.advisor;
    if (options.scope) this.scope = { ...options.scope };
    this.historyLimit = Math.max(1, options.historyLimit ?? DEFAULT_HISTORY_LIMIT);
    this.now = options.now ?? (() => new Date().toISOString());
  }

  /** The authority this chief was granted, as it resolved it. */
  get authority(): AuthorityPolicy {
    return this.policy;
  }

  /** Every decision made so far, oldest first — the record a surface explains itself from. */
  get decisions(): readonly ChiefDecisionRecord[] {
    return this.records;
  }

  async decide(input: ChiefInput): Promise<ChiefDecision> {
    const scoped = this.withScope(input);

    // A veto first, and final: no rule below may reverse it, and an advisor never
    // sees it. This is the ordering that makes "high-impact always reaches you" a
    // property of the code rather than a hope about the rules.
    const veto = authorityVeto(scoped, this.policy);
    if (veto) return this.record(scoped, { action: 'escalate', reason: veto }, 'policy');

    const prior = this.recurrence(scoped);
    if (prior) return this.record(scoped, prior, 'recurrence');

    const decided = evaluateAuthority(scoped, this.policy);
    if (decided.action !== 'escalate') return this.record(scoped, decided, 'policy');

    // Judgment is admitted only here: a question the standing answers did not cover.
    if (scoped.request.kind === 'questions' && this.advisor) {
      const advised = await this.consultAdvisor(scoped);
      if (advised) return this.record(scoped, advised, 'advisor');
    }

    return this.record(scoped, decided, 'policy');
  }

  private withScope(input: ChiefInput): ChiefInput {
    if (!this.scope) return input;
    return { request: input.request, context: { ...input.context, scope: { ...this.scope, ...input.context.scope } } };
  }

  /**
   * The answer this chief already gave an identical request, if any.
   *
   * Only a settled answer is reused. A recorded escalation is not: the person's
   * pending decision is not a standing one, so the request must reach them again
   * rather than be settled by a later policy match.
   */
  private recurrence(input: ChiefInput): ChiefDecision | undefined {
    const signature = requestSignature(input.request);
    for (let i = this.records.length - 1; i >= 0; i--) {
      const record = this.records[i]!;
      if (record.signature !== signature) continue;
      return record.decision.action === 'escalate' ? undefined : record.decision;
    }
    return undefined;
  }

  private async consultAdvisor(input: ChiefInput): Promise<ChiefDecision | undefined> {
    if (!this.advisor) return undefined;
    let advised: ChiefDecision | undefined;
    try {
      // A snapshot, not the live array: an advisor reads the history and cannot write it.
      advised = await this.advisor({ input, decisions: [...this.records] });
    } catch {
      // No opinion is a complete answer here; the escalation below carries it.
      return undefined;
    }
    if (!advised || advised.action !== 'answer') return undefined;
    const answer = advised.answer.trim();
    if (!answer) return undefined;
    return { action: 'answer', answer };
  }

  private record(input: ChiefInput, decision: ChiefDecision, source: ChiefDecisionSource): ChiefDecision {
    this.records.push({
      at: this.now(),
      source,
      requestKind: input.request.kind,
      requestId: requestIdOf(input.request),
      signature: requestSignature(input.request),
      summary: describeChiefRequest(input.request),
      decision,
    });
    while (this.records.length > this.historyLimit) this.records.shift();
    return decision;
  }
}

/** The runtime's id for the request, whichever kind it is. */
function requestIdOf(request: ChiefRequest): string {
  return request.request.id;
}

/**
 * The request's identity for recurrence.
 *
 * Normalized rather than raw so a re-asked request is recognized as the same one:
 * the engine re-renders the same command from its own params, and a question asked
 * again is asked twice in different words only by accident.
 */
export function requestSignature(request: ChiefRequest): string {
  if (request.kind === 'approval') {
    const command = approvalCommand(request.request.summary);
    const subject = command ? `${request.request.tool}:${command}` : `${request.request.tool}:${request.request.why}:${request.request.summary ?? ''}`;
    return `approval|${normalize(subject)}`;
  }
  if (request.kind === 'plan_review') {
    const steps = request.request.steps.map((step) => `${step.description}=>${step.verification}`);
    return `plan_review|${normalize([...request.request.criteria, ...steps].join('|'))}`;
  }
  return `questions|${normalize(request.request.questions.map((question) => `${question.header ?? ''}:${question.question}`).join('|'))}`;
}

/** The request in one line, for a transcript or a log. */
export function describeChiefRequest(request: ChiefRequest): string {
  if (request.kind === 'approval') {
    const command = approvalCommand(request.request.summary);
    return `${request.request.tool}: ${command ?? request.request.why}`;
  }
  if (request.kind === 'plan_review') {
    const first = request.request.steps[0]?.description;
    return `plan review (${request.request.steps.length} step${request.request.steps.length === 1 ? '' : 's'}${first ? `, starts with "${clip(first, 60)}"` : ''})`;
  }
  const first = request.request.questions[0]?.question;
  return first ? `question: ${clip(first, 80)}` : 'questions';
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
