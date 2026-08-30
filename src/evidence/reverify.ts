import { EvidenceEngine, classifyEvidenceKind } from './evidence.js';
import { classifyEvidenceRelevance, evaluateOracleQuality, type OracleDiagnostic } from './oracle-quality.js';
import { excerpt, nowIso, sha256, shortId } from '../util.js';
import type { AcceptanceCriterion, Evidence, TaskLedgerData } from '../types.js';

/**
 * Formal parent re-verification (P — SPECIALIST_SELF_VERIFIED → PARENT_REVERIFIED).
 *
 * A specialist's successful self-report is never sufficient for parent
 * completion. `validateSpecialistEvidence` remains the STRUCTURAL check
 * (report shape, command match, fingerprint presence); this module is the
 * EXECUTION check: the parent identifies the assigned acceptance criteria,
 * locates the specialist's evidence, detects staleness, and — whenever the
 * criterion is runnable — re-executes the actual verification oracle to
 * generate FRESH, fingerprint-bound evidence before marking the leaf VERIFIED.
 *
 * A status read is never equivalent to re-execution: when a runner is not
 * available, the result says so explicitly instead of pretending the oracle
 * was re-run.
 */

/** Explicit verification-execution approval contract (nothing runs blindly). */
export interface OracleRunRequest {
  /** Exact command to execute. */
  command: string;
  /** Expected result description, when the criterion pins one. */
  expected?: string;
  /** Working directory the oracle must run in. */
  workdir?: string;
  /** Execution environment / toolchain identity note. */
  environment?: string;
  /** The criterion this execution verifies. */
  criterionId: string;
  criterionText: string;
  /** Why this command is being executed (audit trail). */
  reason: string;
}

export interface OracleRunResult {
  passed: boolean;
  output: string;
  exitCode?: number;
}

/** The seam through which oracles are actually executed. Production wires
 *  this to the command executor; tests inject deterministic fakes. */
export type OracleRunner = (request: OracleRunRequest) => Promise<OracleRunResult>;

export type ReverifyMode =
  | 'EXECUTED_PASS'      // oracle re-ran and passed with fresh evidence
  | 'EXECUTED_FAIL'      // oracle re-ran and failed (fresh failing evidence kept)
  | 'ORACLE_REJECTED'    // oracle itself is too weak to prove the criterion
  | 'NO_RUNNER'          // runnable criterion, but no executor available here
  | 'NOT_RUNNABLE';      // manual/judgment criterion — judged on fresh evidence only

export interface ParentReverifyResult {
  criterionId: string;
  mode: ReverifyMode;
  /** True only when the criterion is backed by fresh, relevant evidence NOW. */
  verified: boolean;
  freshEvidenceId?: string;
  /** Evidence that was linked but no longer matches the workspace. */
  staleEvidenceIds: string[];
  diagnostics: OracleDiagnostic[];
  fingerprint?: string;
  reason: string;
}

/** Minimal slice the EvidenceEngine needs — lets leaves reuse the engine
 *  without owning a full TaskLedger. */
export interface ReverifyLedgerView {
  acceptanceCriteria: AcceptanceCriterion[];
  evidence: Evidence[];
}

const engine = new EvidenceEngine();

/**
 * Independently re-verify one acceptance criterion.
 *
 * @param currentFingerprint live workspace fingerprint (getWorkspaceFingerprint).
 *        Evidence recorded against a different fingerprint is stale.
 */
export async function parentReverifyCriterion(opts: {
  ledger: ReverifyLedgerView;
  criterionId: string;
  currentFingerprint?: string;
  runOracle?: OracleRunner;
  workdir?: string;
  environment?: string;
}): Promise<ParentReverifyResult> {
  const { ledger, criterionId, currentFingerprint, runOracle } = opts;
  const criterion = ledger.acceptanceCriteria.find((c) => c.id === criterionId);
  if (!criterion) {
    return {
      criterionId,
      mode: 'NOT_RUNNABLE',
      verified: false,
      staleEvidenceIds: [],
      diagnostics: [],
      reason: `Unknown acceptance criterion "${criterionId}".`,
    };
  }

  // 1. Locate the criterion's evidence and detect staleness.
  const staleEvidenceIds: string[] = [];
  for (const id of criterion.evidenceIds) {
    const ev = ledger.evidence.find((e) => e.id === id);
    if (!ev) continue;
    if (currentFingerprint && ev.workspaceFingerprint && ev.workspaceFingerprint !== currentFingerprint) {
      ev.stale = true;
      if (!staleEvidenceIds.includes(id)) staleEvidenceIds.push(id);
    }
  }
  // Stale-only backing can no longer satisfy the criterion.
  const stillFresh = criterion.evidenceIds.some((id) => {
    const ev = ledger.evidence.find((e) => e.id === id);
    return Boolean(ev && ev.passed && !ev.stale);
  });
  if (!stillFresh) criterion.satisfied = false;

  // 2. Judge the oracle itself before trusting or executing it.
  const quality = evaluateOracleQuality({
    command: criterion.verification,
    criterionText: criterion.text,
  });

  if (!criterion.verification) {
    // Manual / judgment criterion: never auto-rejected; verified only when it
    // already carries fresh, relevant evidence (a stale read is not proof).
    const fresh = criterion.evidenceIds
      .map((id) => ledger.evidence.find((e) => e.id === id))
      .filter((e): e is Evidence => Boolean(e && e.passed && !e.stale));
    let verified = false;
    const diagnostics: OracleDiagnostic[] = [...quality.diagnostics];
    if (fresh.length === 0) {
      diagnostics.push({ rule: 'no-fresh-evidence', detail: 'Manual criterion has no fresh supporting evidence.' });
    } else {
      const grades = fresh.map((e) => classifyEvidenceRelevance(criterion, e));
      verified = grades.some((g) => g.strength === 'STRONG' || g.strength === 'WEAK');
      for (const g of grades) diagnostics.push(...g.diagnostics);
    }
    return {
      criterionId,
      mode: 'NOT_RUNNABLE',
      verified,
      staleEvidenceIds,
      diagnostics,
      fingerprint: currentFingerprint,
      reason: verified
        ? 'Manual/judgment criterion backed by fresh evidence.'
        : 'Manual/judgment criterion lacks fresh supporting evidence.',
    };
  }

  if (quality.strength === 'INVALID') {
    return {
      criterionId,
      mode: 'ORACLE_REJECTED',
      verified: false,
      staleEvidenceIds,
      diagnostics: quality.diagnostics,
      fingerprint: currentFingerprint,
      reason: `Verification oracle rejected: ${quality.diagnostics.map((d) => d.detail).join(' ')}`,
    };
  }

  if (!runOracle) {
    return {
      criterionId,
      mode: 'NO_RUNNER',
      verified: false,
      staleEvidenceIds,
      diagnostics: quality.diagnostics,
      fingerprint: currentFingerprint,
      reason: 'Criterion is runnable but no verification executor is available; a status read is not re-execution.',
    };
  }

  // 3. Actually execute the oracle (explicit approval contract attached).
  let run: OracleRunResult;
  try {
    run = await runOracle({
      command: criterion.verification,
      workdir: opts.workdir,
      environment: opts.environment,
      criterionId: criterion.id,
      criterionText: criterion.text,
      reason: 'parent re-verification of specialist self-report',
    });
  } catch (err) {
    run = { passed: false, output: `verification crashed: ${(err as Error).message}`, exitCode: 1 };
  }

  // 4. Generate FRESH evidence bound to the live workspace identity.
  const createdAt = nowIso();
  const outputExcerpt = excerpt(run.output);
  const evidenceFingerprint = sha256(
    `${criterion.verification}|${run.exitCode ?? ''}|${run.passed}|${currentFingerprint ?? ''}|${createdAt}|${outputExcerpt.slice(0, 200)}`,
  );
  const fresh: Evidence = {
    id: shortId('ev'),
    kind: classifyEvidenceKind(criterion.verification),
    label: `reverify ${criterion.id}: ${criterion.verification.slice(0, 80)}`,
    command: criterion.verification,
    exitCode: run.exitCode,
    passed: run.passed,
    outputExcerpt,
    createdAt,
    workspaceFingerprint: currentFingerprint,
    stale: false,
    fingerprint: evidenceFingerprint,
  };
  ledger.evidence.push(fresh);

  if (!run.passed) {
    // The parent's re-execution REFUTES the specialist's claim: the previous
    // satisfaction (based on the self-report) can no longer stand.
    criterion.satisfied = false;
    return {
      criterionId,
      mode: 'EXECUTED_FAIL',
      verified: false,
      freshEvidenceId: fresh.id,
      staleEvidenceIds,
      diagnostics: quality.diagnostics,
      fingerprint: currentFingerprint,
      reason: `Re-executed "${criterion.verification}" and it FAILED — specialist self-report not confirmed.`,
    };
  }

  // 5. Semantic gate: a passing command only proves the criterion when the
  //    oracle is strong. Weak (unfalsifiable / irrelevant) passes are recorded
  //    as evidence but NEVER satisfy the criterion.
  if (quality.strength !== 'STRONG') {
    return {
      criterionId,
      mode: 'EXECUTED_PASS',
      verified: false,
      freshEvidenceId: fresh.id,
      staleEvidenceIds,
      diagnostics: quality.diagnostics,
      fingerprint: currentFingerprint,
      reason: `Oracle passed but is too weak to prove the criterion: ${quality.diagnostics.map((d) => d.detail).join(' ')}`,
    };
  }

  // 6. Link fresh evidence through the existing engine gate.
  const link = engine.link(ledger as never, criterionId, fresh.id, currentFingerprint);
  return {
    criterionId,
    mode: 'EXECUTED_PASS',
    verified: link.ok,
    freshEvidenceId: fresh.id,
    staleEvidenceIds,
    diagnostics: quality.diagnostics,
    fingerprint: currentFingerprint,
    reason: link.ok
      ? `Re-executed "${criterion.verification}": passed with fresh evidence ${fresh.id}.`
      : `Re-executed oracle passed but evidence link rejected: ${link.reason}`,
  };
}
