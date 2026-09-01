import type { CompletionReport, RunQualityMetrics, TokenTelemetrySnapshot, VerificationReportItem } from '../types.js';

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Score the reportable outcome, not model intent. The criterion count comes
 * from the ledger and passing verification is restricted to the latest final
 * workspace evidence, so stale green checks cannot inflate this metric.
 */
export function scoreRunQuality(input: {
  status: CompletionReport['status'];
  criteria: { satisfied: boolean }[];
  verification: VerificationReportItem[];
  telemetry?: TokenTelemetrySnapshot;
}): RunQualityMetrics {
  const total = input.criteria.length;
  const satisfied = input.criteria.filter((criterion) => criterion.satisfied).length;
  const coverage = total === 0 ? 0 : satisfied / total;
  const authoritative = input.verification.filter((item) => item.authority !== 'historical');
  const passing = authoritative.filter((item) => item.passed).length;
  const failing = authoritative.length - passing;
  const passRate = authoritative.length === 0 ? 0 : passing / authoritative.length;
  const completion = input.status === 'complete' ? 1 : input.status === 'blocked' ? 0.25 : 0;

  // Criteria are the task contract, evidence is the proof, and the terminal
  // status prevents an incomplete task from looking healthy merely because an
  // exploratory command happened to pass.
  const score = Math.round(clamp(coverage) * 50 + clamp(passRate) * 30 + completion * 20);
  const tokens = input.telemetry ? input.telemetry.inputTokens + input.telemetry.outputTokens || input.telemetry.estimatedInputTokens : 0;
  return {
    score,
    criteria: { total, satisfied, coverage: Number(coverage.toFixed(3)) },
    verification: { authoritative: authoritative.length, passing, failing, passRate: Number(passRate.toFixed(3)) },
    ...(satisfied > 0 && tokens > 0 ? { tokensPerVerifiedCriterion: Math.ceil(tokens / satisfied) } : {}),
    ...(input.telemetry && input.telemetry.calls > 0 ? { wastedCallRate: Number((input.telemetry.wastedCalls / input.telemetry.calls).toFixed(3)) } : {}),
  };
}
