/**
 * P1.3 — Malformed-call spiral detection.
 *
 * A model in distress does not repeat the SAME failing call (the LoopDetector
 * handles that). It emits a stream of *different* malformed calls:
 *
 *   read_file({ path: 123 })      -> invalid-tool-params
 *   read_file({ path: "undefined" }) -> invalid-tool-params
 *   search_files({ pattern: [] }) -> invalid-tool-params
 *   bogus_tool({ ... })           -> unknown-tool
 *   "let me think about this..."  -> unparseable
 *
 * Each has a different paramsHash, so the LoopDetector never fires. This
 * tracker recognizes the *category* (schema violation, unknown tool,
 * unparseable action) and escalates in stages: remind -> strategy change ->
 * halt the run cleanly instead of burning turns forever.
 */

export type MalformedKind = 'schema' | 'unknown-tool' | 'unparseable';

export interface MalformedPolicy {
  /** Inject a pattern-warning note after this many consecutive malformed calls. */
  remindAt: number;
  /** Force a strategy change after this many. */
  escalateAt: number;
  /** Stop the run entirely after this many. */
  haltAt: number;
}

export const DEFAULT_MALFORMED_POLICY: MalformedPolicy = {
  remindAt: 2,
  escalateAt: 4,
  haltAt: 6,
};

export interface MalformedVerdict {
  streak: number;
  remind: boolean;
  escalate: boolean;
  halt: boolean;
}

export class MalformedCallTracker {
  private streak = 0;
  private readonly policy: MalformedPolicy;

  constructor(policy: Partial<MalformedPolicy> = {}) {
    this.policy = { ...DEFAULT_MALFORMED_POLICY, ...policy };
  }

  note(_kind: MalformedKind): MalformedVerdict {
    this.streak += 1;
    return this.verdict();
  }

  reset(): void {
    this.streak = 0;
  }

  get currentStreak(): number {
    return this.streak;
  }

  private verdict(): MalformedVerdict {
    return {
      streak: this.streak,
      remind: this.streak >= this.policy.remindAt,
      escalate: this.streak >= this.policy.escalateAt,
      halt: this.streak >= this.policy.haltAt,
    };
  }
}

/**
 * Classify an executor outcome into a malformed category.
 * Well-formed calls that simply fail (fs errors, test failures, ...) are not
 * malformed — those belong to the LoopDetector's same-error tracking.
 */
export function malformedKindFor(errorSignature?: string): MalformedKind | undefined {
  if (errorSignature === 'invalid-tool-params') return 'schema';
  if (errorSignature === 'unknown-tool') return 'unknown-tool';
  return undefined;
}

/**
 * The strategy-change intervention injected into the model's context. It does
 * NOT repeat the tool schemas (the per-call validation error already prints
 * the exact Required Schema); it forces the model to change behavior.
 */
export function malformedIntervention(streak: number, tool?: string): string {
  const lines = [
    `STRATEGY CHANGE REQUIRED: your last ${streak} tool calls were malformed and were rejected by the schema validator.`,
  ];
  if (tool) lines.push(`Stop calling "${tool}" until you fix its parameter schema.`);
  lines.push(
    'The system prompt lists every available tool. You may:',
    '- Retry with a corrected call that matches the Required Schema printed in the error above.',
    '- Choose a different tool or a different approach entirely.',
    '- Record your reasoning: {"thought":"...","action":{"type":"set_hypothesis","text":"..."}}',
    '- Stop and ask for help: {"thought":"...","action":{"type":"request_block","reason":"..."}}',
  );
  return lines.join('\n');
}