import type { LlmUsage } from '../llm/llm.js';
import type { ModelMetadata } from '../llm/providers.js';

export interface CompanyPricing {
  source: string;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cachedInputPricePerMillion: number;
  maxInputTokens?: number;
}

/** A missing price is unknown. Only an explicit zero represents a free model. */
export function companyPricing(metadata: ModelMetadata | undefined): CompanyPricing | undefined {
  const input = metadata?.inputPricePerMillion, output = metadata?.outputPricePerMillion;
  if (input === undefined || output === undefined || !Number.isFinite(input) || !Number.isFinite(output) || input < 0 || output < 0) return undefined;
  const cached = metadata?.cachedInputPricePerMillion ?? input;
  if (!Number.isFinite(cached) || cached < 0) return undefined;
  const ceilings = [metadata?.inputTokens, metadata?.contextTokens].filter((n): n is number => Number.isSafeInteger(n) && n! > 0);
  return { source: metadata!.source, inputPricePerMillion: input, outputPricePerMillion: output, cachedInputPricePerMillion: cached,
    ...(ceilings.length ? { maxInputTokens: Math.min(...ceilings) } : {}) };
}

export function companyUsageCostUsd(pricing: CompanyPricing | undefined, usage: LlmUsage): number | undefined {
  if (!pricing || [usage.inputTokens, usage.outputTokens, usage.cachedTokens].some(n => !Number.isSafeInteger(n) || n < 0)) return undefined;
  const cached = Math.min(usage.cachedTokens, usage.inputTokens);
  return ((usage.inputTokens - cached) * pricing.inputPricePerMillion + cached * pricing.cachedInputPricePerMillion + usage.outputTokens * pricing.outputPricePerMillion) / 1_000_000;
}
