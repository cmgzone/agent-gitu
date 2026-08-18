import type { TaskLedger } from '../ledger/task-ledger.js';
import type { CompletionReport, VerificationReportItem } from '../types.js';
import { nowIso } from '../util.js';

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

export class Reporter {
  build(
    ledger: TaskLedger,
    exitReason: 'complete' | 'blocked' | 'stalled',
    completionInput?: { summary: string; risks: string[]; followUps: string[] },
  ): CompletionReport {
    const d = ledger.data;
    const verificationDetails: VerificationReportItem[] = d.evidence.map((e) => ({
      id: e.id,
      kind: e.kind,
      label: e.label,
      passed: e.passed,
      exitCode: e.exitCode,
      command: e.command,
      outputExcerpt: e.outputExcerpt,
    }));
    // Keep the plain-text report useful, but do not embed a duplicate raw
    // command in every line. The structured form retains it for disclosure.
    const verification = verificationDetails.map((e) => `${e.passed ? 'PASS' : 'FAIL'} [${e.kind}] ${e.label}`);
    const changes = d.actions
      .filter((a) => (a.tool === 'write_file' || a.tool === 'apply_edit') && a.status === 'success')
      .map((a) => a.paramsSummary);
    const browserActions = d.actions.filter((a) => a.tool === 'browse');
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

    return {
      taskId: d.taskId,
      goal: d.goal,
      status: statusMap[exitReason],
      summary:
        completionInput?.summary ??
        (exitReason === 'blocked'
          ? `Task blocked: ${d.blockers[d.blockers.length - 1] ?? 'unknown blocker'}`
          : `Task ended without completion (${exitReason}).`),
      changes,
      filesChanged: unique(d.filesChanged.filter(isReportableFile)),
      verification,
      verificationDetails,
      browserActivity,
      evidence: d.evidence.map((e) => `${e.id}: ${e.passed ? 'PASS' : 'FAIL'} ${e.label}`),
      remainingRisks: completionInput?.risks ?? (d.blockers.length > 0 ? [`Unresolved blockers: ${d.blockers.join('; ')}`] : []),
      followUps: completionInput?.followUps ?? [],
      generatedAt: nowIso(),
    };
  }

  render(report: CompletionReport): string {
    const lines: string[] = [
      `Task: ${report.goal}`,
      `Task ID: ${report.taskId}`,
      `Status: ${report.status.toUpperCase()}`,
      '',
      `Summary: ${report.summary}`,
      '',
      'Changes made:',
      ...(report.changes.length > 0 ? report.changes.map((c) => `  - ${c}`) : ['  (none)']),
      '',
      'Files changed:',
      ...(report.filesChanged.length > 0 ? report.filesChanged.map((f) => `  - ${f}`) : ['  (none)']),
      '',
      'Verification:',
      ...(report.verification.length > 0 ? report.verification.map((v) => `  - ${v}`) : ['  (none recorded)']),
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
      '',
      'Follow-ups:',
      ...(report.followUps.length > 0 ? report.followUps.map((f) => `  - ${f}`) : ['  (none)']),
    ];
    return lines.join('\n');
  }
}
