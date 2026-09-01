import { describe, expect, it } from 'vitest';
import { scoreRunQuality } from '../src/agent/quality-metrics.js';

describe('evidence-based run quality metrics', () => {
  it('rewards satisfied criteria with final passing proof and reports token efficiency', () => {
    const metrics = scoreRunQuality({
      status: 'complete',
      criteria: [{ satisfied: true }, { satisfied: true }],
      verification: [
        { id: 'e1', kind: 'test', label: 'tests', passed: true, authority: 'latest' },
        { id: 'e2', kind: 'build', label: 'build', passed: true, authority: 'latest' },
        { id: 'old', kind: 'test', label: 'old tests', passed: false, authority: 'historical' },
      ],
      telemetry: {
        calls: 4,
        inputTokens: 800,
        outputTokens: 200,
        cachedTokens: 0,
        estimatedInputTokens: 1_000,
        estimatedBySource: { system: 0, contextPack: 0, history: 0, state: 0, images: 0, digest: 0, strategy: 0, memory: 0, conversation: 0 },
        planningCalls: 1,
        executionCalls: 3,
        estimatedPlanningInput: 0,
        estimatedExecutionInput: 0,
        planningOutputTokens: 0,
        executionOutputTokens: 0,
        compactions: 0,
        screenshots: 0,
        screenshotBytes: 0,
        toolCalls: 1,
        wastedCalls: 1,
        filesInContextPack: 0,
      },
    });

    expect(metrics.score).toBe(100);
    expect(metrics.tokensPerVerifiedCriterion).toBe(500);
    expect(metrics.wastedCallRate).toBe(0.25);
  });

  it('does not let stale checks or an incomplete status masquerade as quality', () => {
    const metrics = scoreRunQuality({
      status: 'blocked',
      criteria: [{ satisfied: false }],
      verification: [{ id: 'old', kind: 'test', label: 'old tests', passed: true, authority: 'historical' }],
    });
    expect(metrics.score).toBe(5);
    expect(metrics.verification.authoritative).toBe(0);
  });
});
