/**
 * UniversalOutputBudgetPolicy — one place that decides whether a request may
 * carry an explicit output-limit field, and how large it may be.
 *
 * Why this exists: reasoning-style models can spend their ENTIRE completion
 * budget on the reasoning trace and finish with no final content at all. A
 * blanket `max_tokens` cannot fix that — the OpenAI-compatible world disagrees
 * on the field name, some endpoints reject unknown fields with 400, and model
 * output ceilings differ per model. So the policy is capability-driven:
 *
 *   desired final-action reserve
 *   + reasoning allowance (when reasoning shares the completion budget)
 *   = requested output budget, clamped to the model's known maximum
 *
 * When the model's ceiling is unknown the field is OMITTED entirely rather
 * than guessed — the request keeps its provider-default behavior. Nothing in
 * this module is provider-specific: styles and model families are declared
 * capability metadata, not branches sprinkled through request paths.
 */

export type EffortLevel = 'low' | 'medium' | 'high' | 'max';

/** Wire field each protocol family understands for output limits. */
export type OutputLimitField = 'max_tokens' | 'max_completion_tokens';

export interface OutputBudgetCapability {
  field: OutputLimitField;
  /**
   * True when the reasoning trace is drawn from the SAME budget as the final
   * answer (so the reserve must cover both). False when the protocol bounds
   * reasoning separately (e.g. DashScope's thinking_budget) — then capping
   * output would only risk truncating legitimate long answers.
   */
  reasoningSharesBudget: boolean;
}

/** Enough room for a complete Gitu action: thought, command, or a moderate file body. */
export const FINAL_ACTION_RESERVE_TOKENS = 4_096;
/** Reasoning headroom per effort level, added only when reasoning shares the budget. */
export const REASONING_ALLOWANCE_TOKENS: Record<EffortLevel, number> = {
  low: 2_048,
  medium: 8_192,
  high: 16_384,
  max: 32_768,
};
/** Allowance when the caller did not request a specific effort level. */
export const DEFAULT_REASONING_ALLOWANCE_TOKENS = 32_768;
/** Extra headroom for the one adaptive recovery after a reasoning-only turn. */
export const REASONING_RECOVERY_EXTRA_TOKENS = 8_192;

/**
 * Declared protocol capability metadata. Keyed by effort style (the same
 * family distinction the effort parameters already use) plus reasoning-era
 * model families whose endpoint renamed the field.
 */
export function outputCapabilityFor(style: 'dashscope' | 'deepseek' | 'openai', model: string): OutputBudgetCapability {
  if (style === 'deepseek') return { field: 'max_tokens', reasoningSharesBudget: true };
  if (style === 'dashscope') return { field: 'max_tokens', reasoningSharesBudget: false };
  // Reasoning-era OpenAI families reject max_tokens and require the newer field.
  if (/^o[134]\b|^gpt-5/.test(model)) return { field: 'max_completion_tokens', reasoningSharesBudget: true };
  return { field: 'max_tokens', reasoningSharesBudget: true };
}

function reasoningAllowance(effort?: EffortLevel): number {
  return effort ? REASONING_ALLOWANCE_TOKENS[effort] : DEFAULT_REASONING_ALLOWANCE_TOKENS;
}

export interface OutputBudgetRequest {
  effort?: EffortLevel;
  capability: OutputBudgetCapability;
  /** Absolute pre-clamp override requested by the caller (adaptive recovery). */
  overrideTokens?: number;
  /** The model's known output ceiling; undefined means unknown. */
  modelMaxOutputTokens?: number;
}

/**
 * The tokens to send in the capability's field, or undefined when the request
 * should carry NO output-limit field:
 *  - reasoning does not share the budget and the caller gave no override, or
 *  - the model ceiling is unknown (never guess an aggressive value).
 */
export function resolveOutputBudgetTokens(input: OutputBudgetRequest): number | undefined {
  if (input.modelMaxOutputTokens === undefined) return undefined;
  const requested =
    input.overrideTokens ??
    (input.capability.reasoningSharesBudget ? FINAL_ACTION_RESERVE_TOKENS + reasoningAllowance(input.effort) : undefined);
  if (requested === undefined) return undefined;
  return Math.min(requested, input.modelMaxOutputTokens);
}

/** Budget for the one adaptive recovery: original allowance + extra headroom. */
export function recoveryBudgetTokens(effort?: EffortLevel): number {
  return FINAL_ACTION_RESERVE_TOKENS + reasoningAllowance(effort) + REASONING_RECOVERY_EXTRA_TOKENS;
}

/** One step down the effort ladder; undefined when already at the floor. */
export function reduceEffortOneLevel(effort?: EffortLevel): EffortLevel | undefined {
  const order: EffortLevel[] = ['low', 'medium', 'high', 'max'];
  if (!effort) return undefined;
  const index = order.indexOf(effort);
  return index > 0 ? order[index - 1] : undefined;
}
