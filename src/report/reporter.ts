import type { TaskLedger } from '../ledger/task-ledger.js';
import type { CompletionReport, VerificationReportItem } from '../types.js';
import { nowIso } from '../util.js';
import { scoreRunQuality } from '../agent/quality-metrics.js';

function isReportableFile(file: string): boolean {
  const normalized = file.replace(/\\/g, '/').replace(/^\.\//, '');
  const lower = normalized.toLowerCase();
  if (!normalized || /(^|\/)(?:\.hermes|node_modules|coverage|\.cache|\.freebuff)(?:\/|$)/.test(lower)) return false;
  // Temporary probes are useful to an agent while it works, but they are not
  // a user-facing product change.
  return !/(^|\/)(?:[^/]*[_-]tmp|tmp[_-][^/]*)\.[^/]+$/i.test(normalized);
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export interface ReportBuildScope {
  goal: string;
  phase?: { id: string; kind: 'initial' | 'follow_up'; startedAt: string };
  evidenceStartIndex: number;
  actionStartIndex: number;
  criterionIds: string[];
  filesChanged?: string[];
}

function friendlyChange(paramsSummary: string, reason: string): string {
  const raw = paramsSummary.replace(/\s+/g, ' ').trim();
  const path = /^(?:write_file|apply_edit)\s+(.+)$/i.exec(raw)?.[1]?.trim();
  const target = path ? `Updated ${path}` : 'Updated implementation files';
  const why = reason.replace(/\s+/g, ' ').trim().replace(/[.]+$/, '');
  return why ? `${target} — ${why.slice(0, 180)}` : target;
}

/** Keep the model's own summary honest: show whether passing verification
 *  actually backs it. The model writes the summary; the evidence decides. */
function summaryBacking(report: CompletionReport): string {
  const authoritative = report.verificationDetails?.filter((v) => v.authority !== 'historical') ?? [];
  const passing = authoritative.filter((v) => v.passed).length;
  if (report.status === 'complete' && passing === 0) return ' (note: no passing verification recorded)';
  if (passing > 0) return ` (backed by ${passing} passing verification${passing === 1 ? '' : 's'})`;
  return '';
}

export class Reporter {
  build(
    ledger: TaskLedger,
    exitReason: 'complete' | 'blocked' | 'stalled',
    completionInput?: { summary: string; risks: string[]; followUps: string[] },
    finalWorkspaceFingerprint?: string,
    scope?: ReportBuildScope,
  ): CompletionReport {
    const d = ledger.data;
    const phaseEvidence = d.evidence.slice(scope?.evidenceStartIndex ?? 0);
    const phaseActions = d.actions.slice(scope?.actionStartIndex ?? 0);
    const phaseCriteria = scope ? d.acceptanceCriteria.filter((criterion) => scope.criterionIds.includes(criterion.id)) : d.acceptanceCriteria;
    // A check is authoritative only when it ran against the final workspace
    // content, and only the most recent run of that exact command can be the
    // current result. Earlier checks remain useful audit history but can no
    // longer make a later failure look like a pass.
    const latestAtFinal = new Map<string, string>();
    if (finalWorkspaceFingerprint) {
      for (const e of phaseEvidence) {
        if (e.workspaceFingerprint === finalWorkspaceFingerprint) {
          latestAtFinal.set(e.command || `${e.kind}:${e.label}`, e.id);
        }
      }
    }
    const verificationDetails: VerificationReportItem[] = phaseEvidence.map((e) => ({
      id: e.id,
      kind: e.kind,
      label: e.label,
      passed: e.passed,
      exitCode: e.exitCode,
      command: e.command,
      outputExcerpt: e.outputExcerpt,
      authority: finalWorkspaceFingerprint ? (latestAtFinal.get(e.command || `${e.kind}:${e.label}`) === e.id ? 'latest' : 'historical') : 'latest',
    }));
    // Keep the plain-text report useful, but do not embed a duplicate raw
    // command in every line. The structured form retains it for disclosure.
    const verification = verificationDetails.map((e) => `${e.passed ? 'PASS' : 'FAIL'} [${e.kind}] ${e.label}`);
    const changes = unique(
      phaseActions
        .filter((action) => (action.tool === 'write_file' || action.tool === 'apply_edit') && action.status === 'success')
        .map((action) => friendlyChange(action.paramsSummary, action.reason)),
    );
    const browserActions = phaseActions.filter((action) => action.tool === 'browse');
    const browserActivity = browserActions.length
      ? {
          total: browserActions.length,
          successful: browserActions.filter((a) => a.status === 'success').length,
          screenshots: browserActions.filter((a) => a.status === 'success' && a.paramsSummary === 'browse screenshot').length,
        }
      : undefined;

    const statusMap: Record<typeof exitReason, CompletionReport['status']> = {
      complete: 'complete',
      blocked: 'blocked',
      stalled: 'failed',
    };

    const status = statusMap[exitReason];
    const qualityMetrics = scoreRunQuality({
      status,
      // Older persisted ledgers and lightweight integrations can predate
      // acceptance criteria. Their report remains valid; it simply receives
      // zero criterion coverage instead of crashing during metric rendering.
      criteria: phaseCriteria ?? [],
      verification: verificationDetails,
      telemetry: d.tokenTelemetry,
    });

    return {
      taskId: d.taskId,
      goal: scope?.goal ?? d.goal,
      ...(scope?.phase ? { phase: scope.phase } : {}),
      status,
      summary:
        completionInput?.summary ??
        (exitReason === 'blocked' ? `Task blocked: ${d.blockers[d.blockers.length - 1] ?? 'unknown blocker'}` : `Task ended without completion (${exitReason}).`),
      changes,
      filesChanged: unique((scope?.filesChanged ?? d.filesChanged).filter(isReportableFile)),
      verification,
      verificationDetails,
      browserActivity,
      effortPlan: d.effortPlan,
      findings: d.findings?.filter((finding) => !scope?.phase || finding.createdAt >= scope.phase.startedAt),
      architectureDecisions: d.architectureDecisions,
      tokenTelemetry: d.tokenTelemetry,
      qualityMetrics,
      memoryStats: d.memoryStats,
      evidence: phaseEvidence.map((e) => `${e.id}: ${e.passed ? 'PASS' : 'FAIL'} ${e.label}`),
      remainingRisks: completionInput?.risks ?? (d.blockers.length > 0 ? [`Unresolved blockers: ${d.blockers.join('; ')}`] : []),
      followUps: completionInput?.followUps ?? [],
      generatedAt: nowIso(),
    };
  }

  render(report: CompletionReport): string {
    const lines: string[] = [
      `Delivery report — ${report.status.toUpperCase()}`,
      `Scope: ${report.goal}`,
      ...(report.phase?.kind === 'follow_up' ? ['Phase: Follow-up work (earlier task history preserved)'] : []),
      '',
      `Outcome: ${report.summary}${summaryBacking(report)}`,
      '',
      'Delivered:',
      ...(report.changes.length > 0 ? report.changes.map((c) => `  - ${c}`) : ['  (none)']),
      '',
      'Files affected:',
      ...(report.filesChanged.length > 0 ? report.filesChanged.map((f) => `  - ${f}`) : ['  (none)']),
      '',
      'Verification performed:',
      ...(report.verification.length > 0 ? report.verification.map((v) => `  - ${v}`) : ['  (none recorded)']),
      ...(report.architectureDecisions && report.architectureDecisions.length > 0
        ? [
            '',
            'Architecture decisions:',
            ...report.architectureDecisions.map(
              (dec) =>
                `  - [${dec.status}${dec.basis ? `, ${dec.basis}` : ''}] ${dec.decision}` +
                (dec.rejected.length ? ` (rejected: ${dec.rejected.map((r) => r.alternative).join(', ')})` : ''),
            ),
          ]
        : []),
      ...(report.tokenTelemetry
        ? [
            '',
            'Run telemetry:',
            `  - ${report.tokenTelemetry.calls} model call(s); provider input=${report.tokenTelemetry.inputTokens} cached=${report.tokenTelemetry.cachedTokens} output=${report.tokenTelemetry.outputTokens}`,
            `  - ${report.tokenTelemetry.toolCalls} tool call(s), ${report.tokenTelemetry.screenshots} screenshot(s), ${report.tokenTelemetry.wastedCalls} wasted model call(s)`,
          ]
        : []),
      ...(report.memoryStats
        ? [
            '',
            'Memory telemetry:',
            `  - store: ${report.memoryStats.total} memor(y); retrieved=${report.memoryStats.retrieved} injected=${report.memoryStats.injected} superseded-skipped=${report.memoryStats.supersededSkipped} promotion(s)=${report.memoryStats.promotions}`,
            `  - visibility: ${
              Object.entries(report.memoryStats.byVisibility)
                .map(([k, v]) => `${k}=${v}`)
                .join(', ') || 'none'
            }`,
            `  - lifecycle: ${
              Object.entries(report.memoryStats.byStatus)
                .map(([k, v]) => `${k}=${v}`)
                .join(', ') || 'none'
            }`,
          ]
        : []),
      ...(report.qualityMetrics
        ? [
            '',
            'Outcome quality:',
            `  - ${report.qualityMetrics.score}/100; criteria=${report.qualityMetrics.criteria.satisfied}/${report.qualityMetrics.criteria.total}; final verification=${report.qualityMetrics.verification.passing}/${report.qualityMetrics.verification.authoritative}`,
            ...(report.qualityMetrics.tokensPerVerifiedCriterion !== undefined
              ? [`  - ${report.qualityMetrics.tokensPerVerifiedCriterion} model token(s) per verified criterion`]
              : []),
            ...(report.qualityMetrics.wastedCallRate !== undefined ? [`  - ${(report.qualityMetrics.wastedCallRate * 100).toFixed(1)}% wasted model-call rate`] : []),
          ]
        : []),
      ...(report.browserActivity
        ? [
            '',
            'Visual verification:',
            `  - ${report.browserActivity.successful}/${report.browserActivity.total} browser actions succeeded`,
            `  - ${report.browserActivity.screenshots} screenshot(s) captured`,
          ]
        : []),
      '',
      'Remaining risks:',
      ...(report.remainingRisks.length > 0 ? report.remainingRisks.map((r) => `  - ${r}`) : ['  (none noted)']),
      ...(report.findings && report.findings.length > 0
        ? [
            '',
            'Findings (independently verified before reporting):',
            ...report.findings.map(
              (f) =>
                `  - [${f.status.toUpperCase()}] (${f.kind}${f.severity ? `, ${f.severity}` : ''}) ${f.claim}` +
                `${f.location ? ` @ ${f.location}` : ''}` +
                `${f.verifierSummary ? `\n      verifier: ${f.verifierSummary.slice(0, 200)}` : ''}`,
            ),
          ]
        : []),
      '',
      'Follow-ups:',
      ...(report.followUps.length > 0 ? report.followUps.map((f) => `  - ${f}`) : ['  (none)']),
    ];
    return lines.join('\n');
  }
}
