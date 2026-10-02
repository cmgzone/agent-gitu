import type { AskUserQuestion } from './recovery-synthesizer.js';

// ── Runtime-owned loop policy ────────────────────────────────────────────
//
// The model is told not to repeat a failed action. That instruction lives in
// prose, so it only works while the model remembers it — which is exactly the
// situation that produced the provider-capability loop (propose PATCH, get
// rejected, propose PATCH again). This module moves the rule into the runtime:
// a *strategy* (a registered capability, or a documented provider operation) is
// counted here, and once it is exhausted the runtime refuses another identical
// attempt and reports WHY plus what would genuinely unlock it.
//
// Strategy identity is deliberately coarser than a tool-call hash: two proposals
// of the same capability with reworded reasons or a tweaked body are the same
// strategy, because that is the loop the user actually sees.

export type StrategyKind = 'capability' | 'connection-operation';

/** How many unsuccessful attempts a strategy gets before the runtime refuses it.
 * Capabilities are tighter: two provider rejections already prove the route is
 * closed, and each attempt costs the user an approval card. */
export const STRATEGY_LIMITS: Record<StrategyKind, number> = {
  capability: 2,
  'connection-operation': 3,
};

export type StrategyOutcome = 'rejected' | 'failed' | 'unavailable' | 'unknown';

export interface StrategyVerdict {
  allowed: boolean;
  attempts: number;
  failures: number;
  reason?: string;
}

export interface ExhaustedStrategy {
  kind: StrategyKind;
  key: string;
  label: string;
  attempts: number;
  failures: number;
  lastOutcome?: string;
  /** The only things that legitimately re-open this strategy. */
  unlock: string;
}

export interface RuntimeBlockedState {
  state: 'CAPABILITY_BLOCKED';
  blockedBy: ExhaustedStrategy[];
  allowedNextTransitions: string[];
}

interface StrategyRecord {
  kind: StrategyKind;
  key: string;
  label: string;
  attempts: number;
  failures: number;
  lastOutcome?: string;
}

/** What the model is permitted to do while a strategy is exhausted. Exhaustion
 * narrows the route, it never freezes the task: reads, discovery on other
 * surfaces, and an honest block all stay available. */
export const BLOCKED_TRANSITIONS: readonly string[] = [
  'the user grants the missing access — the runtime unlocks the strategy as soon as user input arrives',
  'the user reports the change was made manually',
  'read and discovery work on any other capability or surface',
  'request_block with the concrete prerequisite, or complete with chat:true',
  'the user cancels or redirects the task',
];

function unlockFor(kind: StrategyKind): string {
  return kind === 'capability'
    ? 'user input granting access, or new provider evidence proving the rejection no longer applies'
    : 'a corrected documented operation/body, or the user completing the change manually';
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function describeOutcome(outcome: StrategyOutcome, detail?: string): string {
  const label =
    outcome === 'rejected' ? 'rejected' : outcome === 'failed' ? 'failed' : outcome === 'unavailable' ? 'unavailable' : 'unsuccessful';
  return detail?.trim() ? `${label} — ${truncate(detail, 180)}` : label;
}

export class StrategyGuard {
  private readonly records = new Map<string, StrategyRecord>();
  private readonly limits: Record<StrategyKind, number>;

  constructor(limits: Partial<Record<StrategyKind, number>> = {}) {
    this.limits = { ...STRATEGY_LIMITS, ...limits };
  }

  private static mapKey(kind: StrategyKind, key: string): string {
    return `${kind}::${key}`;
  }

  /** May another attempt at this strategy run? Pure: it records nothing. */
  evaluate(kind: StrategyKind, key: string, label: string): StrategyVerdict {
    const record = this.records.get(StrategyGuard.mapKey(kind, key));
    const attempts = record?.attempts ?? 0;
    const failures = record?.failures ?? 0;
    const limit = this.limits[kind];
    if (failures < limit) return { allowed: true, attempts, failures };
    return {
      allowed: false,
      attempts,
      failures,
      reason: `"${label}" failed ${failures}× and is exhausted for this task. Only ${unlockFor(kind)} re-opens it.`,
    };
  }

  /** A strategy attempt failed. Records its outcome and returns the verdict the
   * caller should surface: the attempt that CROSSES the limit is reported as
   * blocked rather than silently re-run. */
  noteFailure(kind: StrategyKind, key: string, label: string, outcome: StrategyOutcome = 'unknown', detail?: string): StrategyVerdict {
    const mapKey = StrategyGuard.mapKey(kind, key);
    const record = this.records.get(mapKey) ?? { kind, key, label, attempts: 0, failures: 0 };
    record.attempts += 1;
    record.failures += 1;
    record.lastOutcome = describeOutcome(outcome, detail);
    this.records.set(mapKey, record);
    return this.evaluate(kind, key, label);
  }

  /** A strategy succeeded: its history is spent, not merely paused. */
  noteSuccess(kind: StrategyKind, key: string): void {
    this.records.delete(StrategyGuard.mapKey(kind, key));
  }

  /** Note an attempt that never reached the provider (e.g. a refused dispatch). */
  noteAttempt(kind: StrategyKind, key: string, label: string): void {
    const mapKey = StrategyGuard.mapKey(kind, key);
    const record = this.records.get(mapKey) ?? { kind, key, label, attempts: 0, failures: 0 };
    record.attempts += 1;
    this.records.set(mapKey, record);
  }

  /** Something changed outside the model's reasoning — most importantly a user
   * message, which may grant the very access that was missing. Exhaustion is a
   * statement about the world, so a change in the world clears it. */
  noteExternalChange(): ExhaustedStrategy[] {
    const unlocked = this.exhausted();
    if (unlocked.length === 0) return [];
    for (const strategy of unlocked) {
      const record = this.records.get(StrategyGuard.mapKey(strategy.kind, strategy.key));
      if (record) record.failures = 0;
    }
    return unlocked;
  }

  exhausted(): ExhaustedStrategy[] {
    const result: ExhaustedStrategy[] = [];
    for (const record of this.records.values()) {
      if (record.failures < this.limits[record.kind]) continue;
      result.push({
        kind: record.kind,
        key: record.key,
        label: record.label,
        attempts: record.attempts,
        failures: record.failures,
        ...(record.lastOutcome ? { lastOutcome: record.lastOutcome } : {}),
        unlock: unlockFor(record.kind),
      });
    }
    return result;
  }

  blocked(): RuntimeBlockedState | undefined {
    const blockedBy = this.exhausted();
    if (blockedBy.length === 0) return undefined;
    return { state: 'CAPABILITY_BLOCKED', blockedBy, allowedNextTransitions: [...BLOCKED_TRANSITIONS] };
  }

  /** The note a refused action hands back to the model. Names the strategy, what
   * was tried, and the transitions the runtime will still accept. */
  blockedNote(kind: StrategyKind, key: string, label: string): string {
    const verdict = this.evaluate(kind, key, label);
    const record = this.records.get(StrategyGuard.mapKey(kind, key));
    return [
      `RUNTIME POLICY BLOCK: ${verdict.reason ?? `"${label}" is exhausted for this task.`}`,
      record?.lastOutcome ? `Last outcome: ${record.lastOutcome}` : '',
      'The runtime refuses another identical attempt before it executes, so re-proposing it cannot succeed.',
      `Legitimate next steps: ${unlockFor(kind)}; otherwise switch to discovery on another surface, report the concrete prerequisite with request_block, or continue other non-blocked work.`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  /** Compact TASK STATE section. Empty until something is actually exhausted, so
   * the normal path pays no tokens for this machinery. */
  render(): string {
    const state = this.blocked();
    if (!state) return '';
    const strategies = state.blockedBy
      .slice(0, 6)
      .map(
        (strategy) =>
          `  - ${strategy.label} [${strategy.kind}] — ${strategy.failures} failed attempt(s) of ${strategy.attempts}` +
          `${strategy.lastOutcome ? `; last: ${strategy.lastOutcome}` : ''}`,
      )
      .join('\n');
    return [
      'RUNTIME POLICY (enforced by the runtime, not a suggestion):',
      `  BLOCKED STATE: ${state.state}`,
      '  EXHAUSTED STRATEGIES:',
      strategies,
      '  ALLOWED NEXT TRANSITIONS:',
      state.allowedNextTransitions.map((transition) => `    - ${transition}`).join('\n'),
      '  Another attempt at an exhausted strategy is refused before execution.',
    ].join('\n');
  }
}

// ── Question dedup ───────────────────────────────────────────────────────

const STOPWORDS = new Set([
  'a', 'an', 'and', 'the', 'to', 'for', 'of', 'in', 'on', 'is', 'are', 'do', 'does', 'should', 'would', 'could', 'can', 'i', 'you', 'we',
  'me', 'my', 'your', 'it', 'this', 'that', 'with', 'or', 'please', 'which', 'what', 'how', 'where', 'when', 'be', 'am', 'use', 'using',
  'want', 'need', 'like', 'prefer', 'go', 'ahead', 'now', 'again',
]);

/** Words that mark a question as a genuine CHOICE the ledger may already own. */
const CHOICE_MARKERS = /\b(which|what|where|choose|pick|select|target|use)\b/i;
const TARGET_MARKERS =
  /\b(app|apps|application|applications|server|servers|host|hosts|machine|machines|service|services|project|projects|repo|repository|environment|environments|env|branch|branches|region|regions|database|databases|db|domain|domains|subdomain|port|provider|platform|platforms|target|targets|deployment|deployments)\b/i;

export interface EstablishedFact {
  text: string;
  /** Where the pin comes from, e.g. `decision ad-3` or `hard instruction`. */
  source: string;
}

export interface QuestionBatchDecision {
  /** False when every question is already answered — the runtime answers the
   * model from the ledger instead of disturbing the user. */
  deliver: boolean;
  /** The subset of questions that is genuinely new (delivered when true). */
  questions: AskUserQuestion[];
  /** Ledger answers for the refused questions, fed back to the model. */
  answers: string[];
  fingerprints: string[];
}

function fingerprintOf(question: AskUserQuestion): string {
  const text = `${question.header ?? ''} ${question.question}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !STOPWORDS.has(token));
  return [...new Set(text)].sort().join(' ');
}

/** An explicit pin: an assignment (`target = app8`, `branch: main`) or a
 * concrete identifier carrying a digit/dot, close to a target word. Prose
 * without any concrete value never counts. */
function pinnedValue(fact: string): string | undefined {
  const explicit = /(?:=|:|→|->)\s*([A-Za-z0-9][\w.:@/-]{1,60})/.exec(fact);
  if (explicit?.[1] && !STOPWORDS.has(explicit[1].toLowerCase())) return explicit[1];
  const identifier = /\b([A-Za-z][\w.-]*\d[\w.-]*|\d[\w.-]*[A-Za-z][\w.-]*|[a-z0-9-]+\.[a-z]{2,})\b/i.exec(fact);
  return identifier?.[1];
}

function establishedAnswerFor(question: AskUserQuestion, established: readonly EstablishedFact[]): string | undefined {
  const text = `${question.header ?? ''} ${question.question}`;
  if (!CHOICE_MARKERS.test(text) || !TARGET_MARKERS.test(text)) return undefined;
  for (const fact of established) {
    const value = pinnedValue(fact.text);
    if (!value) continue;
    return `Answered by ${fact.source}: "${truncate(fact.text, 220)}" (pinned value: ${value}). Do not ask the user again — comply with it, or record a new decision that supersedes it if the user has changed direction.`;
  }
  return undefined;
}

export class QuestionGuard {
  private readonly asked = new Map<string, { question: string; answer?: string }>();

  /** Decide which questions may reach the user. A question is refused when the
   * task already asked and answered it, or when an active decision/instruction
   * already pins the value it asks for. */
  evaluate(questions: readonly AskUserQuestion[], established: readonly EstablishedFact[] = []): QuestionBatchDecision {
    const fresh: AskUserQuestion[] = [];
    const answers: string[] = [];
    const fingerprints: string[] = [];
    for (const question of questions) {
      const fingerprint = fingerprintOf(question);
      fingerprints.push(fingerprint);
      const prior = this.asked.get(fingerprint);
      if (prior) {
        answers.push(
          `Already asked in this task: "${truncate(prior.question, 160)}"` +
            (prior.answer ? ` — the user answered: "${truncate(prior.answer, 400)}"` : ' — that question is still unanswered; wait for the reply.'),
        );
        continue;
      }
      const establishedAnswer = establishedAnswerFor(question, established);
      if (establishedAnswer) {
        answers.push(establishedAnswer);
        continue;
      }
      fresh.push(question);
    }
    return { deliver: fresh.length > 0, questions: fresh, answers, fingerprints };
  }

  /** Record a delivered question and the answer it received, so a repeat is
   * answered from the ledger instead of the user's attention. */
  noteAnswer(questions: readonly AskUserQuestion[], answer: string): void {
    const bounded = truncate(answer, 1_500);
    for (const question of questions) {
      this.asked.set(fingerprintOf(question), { question: question.question, answer: bounded });
    }
  }

  answeredCount(): number {
    return [...this.asked.values()].filter((entry) => entry.answer !== undefined).length;
  }
}
