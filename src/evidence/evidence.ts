import type { AcceptanceCriterion, CriterionEvidenceType, CriterionSpec, Evidence, EvidenceKind, TaskLedgerData } from '../types.js';
import { excerpt, nowIso, shortId } from '../util.js';

const TRIVIAL_EVIDENCE_RE = /^\s*(echo|pwd|true|:|cd|ls|dir|whoami|hostname|date|type|ver|git\s+status|git\s+log)\b/i;

/**
 * Mapping from structured criterion evidence types to the EvidenceKind
 * that must be produced by the actual command classification.
 */
const EVIDENCE_TYPE_TO_KIND: Record<string, EvidenceKind> = {
  test_success: 'test',
  build_success: 'build',
  lint_success: 'lint',
  typecheck_success: 'typecheck',
  command_success: 'command',
};

export function evidenceKindForType(type: CriterionEvidenceType): EvidenceKind | undefined {
  return EVIDENCE_TYPE_TO_KIND[type];
}

export function isTrivialEvidenceCommand(command: string): boolean {
  return TRIVIAL_EVIDENCE_RE.test(command);
}

/**
 * Normalize a command string for exact comparison.
 * trim → collapse whitespace → lowercase.
 * This handles harmless variations like extra spaces but rejects
 * injected extra commands (&&, ;, |) or different arguments.
 */
function normalizeCommand(cmd: string): string {
  return cmd.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Exact normalized command matching. The evidence command must be
 * exactly the required verification command after normalization.
 *
 * This intentionally does NOT use substring matching, because:
 *   "npm test -- auth && echo hacked"  must NOT match  "npm test -- auth"
 *   "npm test -- unrelated"            must NOT match  "npm test -- auth"
 */
export function commandsMatch(required: string, actual: string): boolean {
  return normalizeCommand(required) === normalizeCommand(actual);
}

export function classifyEvidenceKind(command: string): EvidenceKind {
  const c = command.toLowerCase();
  if (/\b(test|vitest|jest|pytest|cargo test|go test)\b/.test(c)) return 'test';
  if (/\b(lint|eslint)\b/.test(c)) return 'lint';
  if (/\b(typecheck|tsc)\b/.test(c)) return 'typecheck';
  if (/\bbuild\b/.test(c)) return 'build';
  return 'command';
}

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
      workspaceFingerprint?: string;
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
      workspaceFingerprint: input.workspaceFingerprint,
      stale: false,
    };
    ledger.evidence.push(evidence);
    return evidence;
  }

  link(
    ledger: TaskLedgerData,
    criterionId: string,
    evidenceId: string,
    currentFingerprint?: string,
  ): { ok: boolean; reason: string } {
    const criterion = ledger.acceptanceCriteria.find((c) => c.id === criterionId);
    if (!criterion) return { ok: false, reason: `Unknown acceptance criterion: ${criterionId}` };
    const evidence = ledger.evidence.find((e) => e.id === evidenceId);
    if (!evidence) return { ok: false, reason: `Unknown evidence: ${evidenceId}` };
    if (!evidence.passed) {
      return { ok: false, reason: `Evidence ${evidenceId} did not pass; it cannot satisfy a criterion.` };
    }
    if (evidence.kind === 'command' && evidence.command && TRIVIAL_EVIDENCE_RE.test(evidence.command)) {
      return {
        ok: false,
        reason: `Evidence ${evidenceId} is a no-op command ("${evidence.command.trim()}") and cannot verify a criterion. Run a real test/build/lint/typecheck.`,
      };
    }

    // Check stale fingerprint
    if (currentFingerprint && evidence.workspaceFingerprint && evidence.workspaceFingerprint !== currentFingerprint) {
      evidence.stale = true;
      return {
        ok: false,
        reason: `Evidence ${evidenceId} is stale because the workspace was modified after the command ran. Re-run "${criterion.verification || evidence.command || 'verification'}" to produce fresh evidence.`,
      };
    }

    // Structured criterion: required verification command must match exactly.
    if (criterion.verification && evidence.command) {
      if (!commandsMatch(criterion.verification, evidence.command)) {
        return {
          ok: false,
          reason: `Evidence command "${evidence.command.trim()}" does not match the required verification "${criterion.verification}". Run the correct command.`,
        };
      }
    } else if (criterion.verification && !evidence.command) {
      return {
        ok: false,
        reason: `Criterion requires verification command "${criterion.verification}" but evidence has no command. Run the required verification.`,
      };
    }

    // Structured criterion: evidence kind must be compatible with the required type.
    const requiredType = criterion.evidenceType ?? 'any';
    if (requiredType !== 'any') {
      const requiredKind = EVIDENCE_TYPE_TO_KIND[requiredType];
      if (requiredKind && evidence.kind !== requiredKind) {
        return {
          ok: false,
          reason: `Evidence kind "${evidence.kind}" does not match the required type "${requiredType}" (needs "${requiredKind}"). Run the correct verification.`,
        };
      }
    }

    if (!criterion.evidenceIds.includes(evidenceId)) criterion.evidenceIds.push(evidenceId);
    criterion.satisfied = true;
    return { ok: true, reason: `Criterion "${criterion.text}" now backed by evidence ${evidence.label}.` };
  }

  gate(ledger: TaskLedgerData, currentFingerprint?: string): GateResult {
    const missing: string[] = [];
    let satisfiedCount = 0;

    for (const c of ledger.acceptanceCriteria) {
      // Check if any attached evidence is stale
      if (currentFingerprint) {
        for (const id of c.evidenceIds) {
          const ev = ledger.evidence.find((e) => e.id === id);
          if (ev && ev.workspaceFingerprint && ev.workspaceFingerprint !== currentFingerprint) {
            ev.stale = true;
          }
        }
      }

      const validEvidence = c.evidenceIds
        .map((id) => ledger.evidence.find((e) => e.id === id))
        .filter((e): e is Evidence => Boolean(e && e.passed && !e.stale));

      const backed = c.satisfied && validEvidence.length > 0;
      if (backed) {
        satisfiedCount += 1;
      } else {
        const hasStale = c.evidenceIds.some((id) => ledger.evidence.find((e) => e.id === id)?.stale);
        if (hasStale) {
          missing.push(`[STALE EVIDENCE] ${c.text} (workspace was modified after verification ran — re-run ${c.verification || 'test'})`);
        } else {
          missing.push(c.text);
        }
      }
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

  static criteriaFromSpecs(specs: CriterionSpec[]): AcceptanceCriterion[] {
    return specs.map((spec, i) => ({
      id: `ac-${i + 1}`,
      text: spec.text,
      verification: spec.verification,
      evidenceType: spec.evidenceType,
      evidenceIds: [],
      satisfied: false,
    }));
  }

  /**
   * Normalize a mixed array of plain strings and CriterionSpec objects
   * into a uniform CriterionSpec[] array. Plain strings become specs
   * with evidenceType 'any' and no required verification.
   */
  static normalizeCriteria(criteria: (string | CriterionSpec)[]): CriterionSpec[] {
    return criteria.map((c) =>
      typeof c === 'string' ? { text: c } : c,
    );
  }
}

