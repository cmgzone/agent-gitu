import { describe, expect, it } from 'vitest';
import { summarizeEvaluations } from '../src/evaluation/metrics.js';

describe('evaluation metrics', () => {
  it('reports success, assertion, token, cost, and failure-layer metrics without a harness-specific schema', () => {
    const metrics = summarizeEvaluations({
      green: {
        passed: true,
        assertions: [{ passed: true }, { passed: true }],
        evidence: { run: { inputTokens: 800, outputTokens: 200, cachedTokens: 400, costUsd: 0.012 } },
      },
      partial: {
        passed: 'partial',
        assertions: [{ passed: true }, { passed: false }],
        evidence: { arm: { inputTokens: 100, outputTokens: 50 } },
        failures: [{ layer: 'MODEL' }, { layer: 'MODEL' }, { layer: 'HARNESS' }],
      },
      red: { passed: false },
    });

    expect(metrics.scenarios).toEqual({ total: 3, passed: 1, partial: 1, failed: 1, passRate: 0.333 });
    expect(metrics.assertions).toEqual({ total: 4, passed: 3, passRate: 0.75 });
    expect(metrics.runs).toMatchObject({ measured: 2, inputTokens: 900, outputTokens: 250, cachedTokens: 400, reportedCostUsd: 0.012 });
    expect(metrics.tokensPerPassedScenario).toBe(1150);
    expect(metrics.costPerPassedScenario).toBe(0.012);
    expect(metrics.failureLayers).toEqual({ MODEL: 2, HARNESS: 1 });
  });
});
