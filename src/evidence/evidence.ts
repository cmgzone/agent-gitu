import type { AcceptanceCriterion, CriterionEvidenceType, CriterionSpec, Evidence, EvidenceKind, TaskLedgerData } from '../types.js';
import { errorSignature, excerpt, normalizeErrorText, nowIso, shortId } from '../util.js';

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
  // Split on compound operators first: "cd client && npm test" must count as
  // real verification just because it STARTS with cd, while
  // "git status && git log" (every segment trivial) stays a no-op. Within a
  // segment, EVERY token must be trivial — "time npm run build" is real work
  // even though it starts with the wrapper word "time".
  const segments = command.split(/&&|\|\||[;|]/);
  if (segments.every((s) => s.trim() === '')) return true;
  return segments.every(isTrivialSegment);
}

const TRIVIAL_WORDS = new Set([
  'echo', '.', ':', 'true', 'pwd', 'cd', 'ls', 'dir', 'cls', 'whoami', 'hostname',
  'date', 'ver', 'tree', 'sleep', 'start-sleep',
  'write-host', 'get-childitem', 'gci', 'set-location', 'sl', 'git',
]);
/** Read-only git subcommands that keep a `git ...` segment trivial. */
const TRIVIAL_GIT_SUBCOMMANDS = new Set(['status', 'log', 'diff', 'show']);

function isTrivialSegment(raw: string): boolean {
  const tokens = raw.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  let sawCommand = false;
  for (const tok of tokens) {
    if (/^[-/]/.test(tok)) continue; // flags and unix-style paths are inert
    const t = tok.toLowerCase().replace(/^["']|["']$/g, '');
    if (TRIVIAL_WORDS.has(t)) {
      sawCommand = true;
      continue;
    }
    if (t === 'git' || TRIVIAL_GIT_SUBCOMMANDS.has(t)) continue;
    // Path-ish continuation AFTER a trivial command ("cd client", "echo done").
    if (sawCommand && /^[\w .~\\/:"'()-]+$/.test(tok)) continue;
    return false;
  }
  return true;
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

/**
 * A verification failure identity should survive harmless value drift. Exact
 * assertion numbers, timings, ports, ids and line numbers can change between
 * runs while the underlying failure is the same. Normalize those values before
 * hashing so a genuinely NEW failure message supersedes an old diagnosis, while
 * a numerically different instance of the same assertion does not.
 */
export function verificationFailureSignature(output: string): string {
  const normalized = normalizeErrorText(output)
    .replace(/[-+]?\b\d+(?:\.\d+)?\b/g, '<num>')
    .replace(/\s+/g, ' ')
    .trim();
  return errorSignature(normalized);
}

/**
 * A current hypothesis belongs to the failure it was formed against. Retire it
 * when the same verification command proves that failure resolved (PASS) or
 * produces a materially different failure signature. This prevents a repaired
 * diagnosis from becoming the most prominent state on the next turn.
 */
export function verificationSupersedesHypothesis(
  previousFailure: Pick<Evidence, 'passed' | 'outputExcerpt'> | undefined,
  next: { passed: boolean; output: string },
): boolean {
  if (!previousFailure || previousFailure.passed) return false;
  if (next.passed) return true;
  return verificationFailureSignature(previousFailure.outputExcerpt) !== verificationFailureSignature(next.output);
}

/** Structural slice of the ledger needed to prove a bug fix causally. */
export interface RegressionProofInput {
  evidence: { command?: string; passed: boolean; createdAt: string }[];
  actions: { tool: string; status: string; createdAt?: string }[];
}

/**
 * True when the ledger proves CAUSALITY for a bug fix, not just a green suite:
 * the same non-trivial command FAILED before the fix, a file edit succeeded
 * in between, and the SAME command PASSED after. A post-fix-only passing run
 * proves nothing about the bug — the existing tests may never have covered it.
 */
export function hasRegressionProof(input: RegressionProofInput): boolean {
  const norm = (cmd: string): string => cmd.trim().replace(/\s+/g, ' ').toLowerCase();
  const real = (cmd: string | undefined): string | undefined => {
    if (!cmd) return undefined;
    const c = norm(cmd);
    return c && !isTrivialEvidenceCommand(c) ? c : undefined;
  };
  // Earliest PASS per command — the fix's proof is the first green run.
  const passAt = new Map<string, string>();
  for (const ev of input.evidence) {
    const cmd = real(ev.command);
    if (!cmd || !ev.passed) continue;
    const prev = passAt.get(cmd);
    if (!prev || ev.createdAt < prev) passAt.set(cmd, ev.createdAt);
  }
  if (passAt.size === 0) return false;
  const edits = input.actions.filter(
    (a) => (a.tool === 'write_file' || a.tool === 'apply_edit') && a.status === 'success' && a.createdAt,
  );
  if (edits.length === 0) return false;
  for (const ev of input.evidence) {
    const cmd = real(ev.command);
    if (!cmd || ev.passed) continue;
    const pass = passAt.get(cmd);
    if (!pass || ev.createdAt >= pass) continue;
    if (edits.some((a) => a.createdAt! > ev.createdAt && a.createdAt! < pass)) return true;
  }
  return false;
}

/**
 * True when this link is weakly bound: the criterion pins neither a
 * verification command nor an evidence type, so ANY passing command would
 * have satisfied it. The gate still accepts it, but callers should surface
 * the looseness instead of presenting it as hard proof.
 */
export function isWeakEvidenceLink(criterion: AcceptanceCriterion, evidence: Evidence): boolean {
  return !criterion.verification && (criterion.evidenceType ?? 'any') === 'any' && evidence.kind === 'command';
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
    // A hypothesis is scoped to the most recent failure of the same
    // verification command. If that failure resolves or changes identity,
    // retire the old hypothesis BEFORE the new evidence becomes current state.
    if (ledger.currentHypothesis && input.command) {
      const previousFailure = [...ledger.evidence]
        .reverse()
        .find((candidate) => !candidate.passed && candidate.command && commandsMatch(candidate.command, input.command));
      if (verificationSupersedesHypothesis(previousFailure, input)) {
        ledger.currentHypothesis = undefined;
      }
    }

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
    if (evidence.kind === 'command' && evidence.command && isTrivialEvidenceCommand(evidence.command)) {
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
