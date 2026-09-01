/** Portable summary for deterministic and real-model evaluation results. */
export interface EvaluationAssertion {
  passed: boolean;
}

export interface EvaluationScenario {
  passed: boolean | 'partial';
  assertions?: EvaluationAssertion[];
  evidence?: unknown;
  failures?: { layer?: string }[];
}

export interface EvaluationMetrics {
  scenarios: { total: number; passed: number; partial: number; failed: number; passRate: number };
  assertions: { total: number; passed: number; passRate: number };
  runs: { measured: number; inputTokens: number; outputTokens: number; cachedTokens: number; reportedCostUsd: number };
  tokensPerPassedScenario?: number;
  costPerPassedScenario?: number;
  failureLayers: Record<string, number>;
}

interface UsageSample {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
}

function numberAt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Collect self-contained run telemetry nodes without depending on one eval harness schema. */
function usageSamples(value: unknown, out: UsageSample[] = []): UsageSample[] {
  if (!value || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    for (const item of value) usageSamples(item, out);
    return out;
  }
  const record = value as Record<string, unknown>;
  if (typeof record['inputTokens'] === 'number' || typeof record['outputTokens'] === 'number') {
    out.push({
      inputTokens: numberAt(record['inputTokens']),
      outputTokens: numberAt(record['outputTokens']),
      cachedTokens: numberAt(record['cachedTokens']),
      costUsd: numberAt(record['costUsd']),
    });
  }
  for (const child of Object.values(record)) usageSamples(child, out);
  return out;
}

export function summarizeEvaluations(results: Record<string, EvaluationScenario>): EvaluationMetrics {
  const scenarios = Object.values(results);
  const passed = scenarios.filter((scenario) => scenario.passed === true).length;
  const partial = scenarios.filter((scenario) => scenario.passed === 'partial').length;
  const failed = scenarios.length - passed - partial;
  const assertions = scenarios.flatMap((scenario) => scenario.assertions ?? []);
  const assertionPassed = assertions.filter((assertion) => assertion.passed).length;
  const samples = scenarios.flatMap((scenario) => usageSamples(scenario.evidence));
  const failureLayers: Record<string, number> = {};
  for (const scenario of scenarios) {
    for (const failure of scenario.failures ?? []) {
      const layer = failure.layer?.trim() || 'UNCLASSIFIED';
      failureLayers[layer] = (failureLayers[layer] ?? 0) + 1;
    }
  }
  const totalTokens = samples.reduce((sum, sample) => sum + sample.inputTokens + sample.outputTokens, 0);
  const reportedCostUsd = samples.reduce((sum, sample) => sum + sample.costUsd, 0);
  return {
    scenarios: {
      total: scenarios.length,
      passed,
      partial,
      failed,
      passRate: scenarios.length === 0 ? 0 : Number((passed / scenarios.length).toFixed(3)),
    },
    assertions: {
      total: assertions.length,
      passed: assertionPassed,
      passRate: assertions.length === 0 ? 0 : Number((assertionPassed / assertions.length).toFixed(3)),
    },
    runs: {
      measured: samples.length,
      inputTokens: samples.reduce((sum, sample) => sum + sample.inputTokens, 0),
      outputTokens: samples.reduce((sum, sample) => sum + sample.outputTokens, 0),
      cachedTokens: samples.reduce((sum, sample) => sum + sample.cachedTokens, 0),
      reportedCostUsd: Number(reportedCostUsd.toFixed(6)),
    },
    ...(passed > 0 && totalTokens > 0 ? { tokensPerPassedScenario: Math.ceil(totalTokens / passed) } : {}),
    ...(passed > 0 && reportedCostUsd > 0 ? { costPerPassedScenario: Number((reportedCostUsd / passed).toFixed(6)) } : {}),
    failureLayers,
  };
}
