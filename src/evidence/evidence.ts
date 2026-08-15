import type { AcceptanceCriterion, Evidence, EvidenceKind, TaskLedgerData } from '../types.js';
import { excerpt, nowIso, shortId } from '../util.js';

export interface GateResult {
  open: boolean;
  missing: string[];
  satisfiedCount: number;
  totalCount: number;
}

export class EvidenceEngine {
  record(
    ledger: TaskLedgerData,
    input: {
      kind: EvidenceKind;
      label: string;
      command?: string;
      exitCode?: number;
      passed: boolean;
      output: string;
      artifactPath?: string;
    },
  ): Evidence {
    const evidence: Evidence = {
      id: shortId('ev'),
      kind: input.kind,
      label: input.label,
      command: input.command,
      exitCode: input.exitCode,
      passed: input.passed,
      outputExcerpt: excerpt(input.output),
      artifactPath: input.artifactPath,
      createdAt: nowIso(),
    };
    ledger.evidence.push(evidence);
    return evidence;
  }

  link(ledger: TaskLedgerData, criterionId: string, evidenceId: string): { ok: boolean; reason: string } {
    const criterion = ledger.acceptanceCriteria.find((c) => c.id === criterionId);
    if (!criterion) return { ok: false, reason: `Unknown acceptance criterion: ${criterionId}` };
    const evidence = ledger.evidence.find((e) => e.id === evidenceId);
    if (!evidence) return { ok: false, reason: `Unknown evidence: ${evidenceId}` };
    if (!evidence.passed) {
      return { ok: false, reason: `Evidence ${evidenceId} did not pass; it cannot satisfy a criterion.` };
    }
    if (!criterion.evidenceIds.includes(evidenceId)) criterion.evidenceIds.push(evidenceId);
    criterion.satisfied = true;
    return { ok: true, reason: `Criterion "${criterion.text}" now backed by evidence ${evidence.label}.` };
  }

  gate(ledger: TaskLedgerData): GateResult {
    const missing: string[] = [];
    let satisfiedCount = 0;
    for (const c of ledger.acceptanceCriteria) {
      const backed = c.satisfied && c.evidenceIds.some((id) => ledger.evidence.find((e) => e.id === id)?.passed);
      if (backed) satisfiedCount += 1;
      else missing.push(c.text);
    }
    return {
      open: ledger.acceptanceCriteria.length > 0 && missing.length === 0,
      missing,
      satisfiedCount,
      totalCount: ledger.acceptanceCriteria.length,
    };
  }

  static criteriaFromTexts(texts: string[]): AcceptanceCriterion[] {
    return texts.map((text, i) => ({
      id: `ac-${i + 1}`,
      text,
      evidenceIds: [],
      satisfied: false,
    }));
  }
}
