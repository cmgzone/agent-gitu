import { commandsMatch, evidenceKindForType, isTrivialEvidenceCommand } from '../evidence/evidence.js';
import type { CriterionEvidenceType, EvidenceKind, TaskLedgerData } from '../types.js';

/**
 * P1.1 — Specialist Evidence Inheritance.
 *
 * A specialist produces evidence inside its own ledger (worktree or main
 * tree). `buildSpecialistEvidenceReport` extracts a structured, self-contained
 * report from that ledger so the orchestrator can revalidate it AFTER the
 * specialist's workspace is gone. `validateSpecialistEvidence` is the
 * orchestrator's independent check: evidence existence, pass status, command
 * relevance, evidence type, workspace fingerprint, and criterion linkage.
 *
 * A specialist's report is evidence FOR Gitu to evaluate — never automatic
 * proof of task completion. Only evidence that survives validation is mirrored
 * into the main ledger through the EvidenceEngine, and only then does the
 * acceptance gate treat the criterion as backed.
 */

export interface SpecialistEvidenceDetail {
  id: string;
  command?: string;
  kind: EvidenceKind;
  passed: boolean;
  outputExcerpt: string;
  workspaceFingerprint?: string;
}

export type SpecialistEvidenceStatus = 'satisfied' | 'unsatisfied' | 'blocked';

export interface SpecialistEvidenceReportEntry {
  criterionId: string;
  evidenceIds: string[];
  status: SpecialistEvidenceStatus;
  summary: string;
}

export interface SpecialistEvidenceReport {
  entries: SpecialistEvidenceReportEntry[];
  /** ALL evidence the specialist recorded (linked or not — a FAILED
   *  reproduction is exactly the signal that must survive revalidation),
   *  self-contained so the orchestrator can inspect it after the
   *  specialist's workspace is gone. */
  evidence: SpecialistEvidenceDetail[];
}

export interface ExpectedCriterion {
  id: string;
  verification?: string;
  evidenceType?: CriterionEvidenceType;
}

export interface SpecialistEvidenceAcceptance {
  criterionId: string;
  evidenceId: string;
  evidence: SpecialistEvidenceDetail;
}

export interface SpecialistEvidenceRejection {
  criterionId: string;
  evidenceId?: string;
  reason: string;
}

export interface SpecialistEvidenceValidation {
  accepted: SpecialistEvidenceAcceptance[];
  rejected: SpecialistEvidenceRejection[];
}

/** Build the self-contained evidence report from the specialist's own ledger. */
export function buildSpecialistEvidenceReport(
  ledger: TaskLedgerData,
  runStatus: string,
): SpecialistEvidenceReport | undefined {
  if (!ledger.acceptanceCriteria || ledger.acceptanceCriteria.length === 0) return undefined;
  const entries: SpecialistEvidenceReportEntry[] = ledger.acceptanceCriteria.map((c) => {
    const satisfied = c.satisfied && c.evidenceIds.length > 0;
    const status: SpecialistEvidenceStatus = satisfied
      ? 'satisfied'
      : runStatus === 'BLOCKED' || runStatus === 'FAILED'
        ? 'blocked'
        : 'unsatisfied';
    return {
      criterionId: c.id,
      evidenceIds: [...c.evidenceIds],
      status,
      summary: satisfied
        ? `Criterion "${c.text}" backed by ${c.evidenceIds.length} evidence record(s).`
        : status === 'blocked'
          ? `Specialist could not verify criterion "${c.text}" (run ${runStatus}).`
          : `No valid evidence linked to criterion "${c.text}".`,
    };
  });
  // Include every recorded evidence record, not only linked ones: a verifier
  // that ran the reproduction command and FAILED can never link it (the
  // engine rejects failed claims), but that failing record is precisely the
  // false-positive signal downstream consumers need to see.
  const evidence: SpecialistEvidenceDetail[] = ledger.evidence.map((e) => ({
    id: e.id,
    command: e.command,
    kind: e.kind,
    passed: e.passed,
    outputExcerpt: e.outputExcerpt,
    workspaceFingerprint: e.workspaceFingerprint,
  }));
  return { entries, evidence };
}

/**
 * Independent orchestrator-side revalidation of a specialist's evidence
 * report against the acceptance contract that was actually delegated.
 * Entries map positionally to the delegated criteria (same ac-N numbering
 * the specialist ledger uses).
 */
export function validateSpecialistEvidence(
  report: SpecialistEvidenceReport | undefined,
  expected: ExpectedCriterion[],
): SpecialistEvidenceValidation {
  const accepted: SpecialistEvidenceAcceptance[] = [];
  const rejected: SpecialistEvidenceRejection[] = [];
  if (expected.length === 0) return { accepted, rejected };
  if (!report || report.entries.length === 0) {
    rejected.push({ criterionId: expected[0]!.id, reason: 'specialist returned no evidence report' });
    return { accepted, rejected };
  }
  report.entries.forEach((entry, index) => {
    const expectedCriterion = expected[index];
    if (!expectedCriterion) {
      rejected.push({ criterionId: entry.criterionId, reason: 'claims a criterion that was not delegated' });
      return;
    }
    if (entry.criterionId !== expectedCriterion.id) {
      rejected.push({
        criterionId: entry.criterionId,
        reason: `reported criterion "${entry.criterionId}" does not match the delegated criterion "${expectedCriterion.id}"`,
      });
      return;
    }
    if (entry.status !== 'satisfied') {
      rejected.push({ criterionId: entry.criterionId, reason: `specialist reports the criterion as ${entry.status}` });
      return;
    }
    for (const evId of entry.evidenceIds) {
      const detail = report.evidence.find((e) => e.id === evId);
      if (!detail) {
        rejected.push({ criterionId: entry.criterionId, evidenceId: evId, reason: 'evidence not present in the specialist report' });
        continue;
      }
      if (!detail.passed) {
        rejected.push({ criterionId: entry.criterionId, evidenceId: evId, reason: 'evidence did not pass' });
        continue;
      }
      if (expectedCriterion.verification) {
        if (!detail.command || !commandsMatch(expectedCriterion.verification, detail.command)) {
          rejected.push({
            criterionId: entry.criterionId,
            evidenceId: evId,
            reason: `evidence command "${detail.command ?? '(none)'}" does not match the required verification "${expectedCriterion.verification}"`,
          });
          continue;
        }
      } else if (detail.command && isTrivialEvidenceCommand(detail.command)) {
        rejected.push({
          criterionId: entry.criterionId,
          evidenceId: evId,
          reason: `evidence command "${detail.command}" is a no-op and cannot verify a criterion`,
        });
        continue;
      }
      if (expectedCriterion.evidenceType && expectedCriterion.evidenceType !== 'any') {
        const requiredKind = evidenceKindForType(expectedCriterion.evidenceType);
        if (requiredKind && detail.kind !== requiredKind) {
          rejected.push({
            criterionId: entry.criterionId,
            evidenceId: evId,
            reason: `evidence kind "${detail.kind}" does not match the required type "${expectedCriterion.evidenceType}"`,
          });
          continue;
        }
      }
      if (!detail.workspaceFingerprint || detail.workspaceFingerprint === 'unknown-fp') {
        rejected.push({ criterionId: entry.criterionId, evidenceId: evId, reason: 'evidence has no valid workspace fingerprint' });
        continue;
      }
      accepted.push({ criterionId: entry.criterionId, evidenceId: evId, evidence: detail });
    }
  });
  return { accepted, rejected };
}
