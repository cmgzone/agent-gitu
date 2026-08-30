import { classifyEvidenceKind, commandsMatch, isTrivialEvidenceCommand, isWeakEvidenceLink } from './evidence.js';
import type { AcceptanceCriterion, Evidence } from '../types.js';

/**
 * Verification-oracle quality + semantic evidence relevance.
 *
 * Gitu already rejects no-op commands (`isTrivialEvidenceCommand`) and
 * loosely-bound links (`isWeakEvidenceLink`). This module widens that net so a
 * PASSING command is never treated as proof when the oracle itself is weak:
 *
 *   - the command succeeds without actually testing the criterion
 *   - the expected output is trivially generated / echoed back
 *   - verification merely echoes the expected answer
 *   - a negative assertion cannot fail
 *   - supplied values are copied directly into the expectation
 *   - the command does not inspect the artifact the criterion describes
 *
 * A command passing is necessary, never sufficient. Relevance is graded
 * STRONG / WEAK / INVALID / INSUFFICIENT so callers can refuse to mark a
 * criterion VERIFIED on weak grounds while still permitting legitimate
 * manual / judgment-based criteria that cannot be automated.
 */

/** How much a piece of evidence actually proves its criterion. */
export type EvidenceStrength = 'STRONG' | 'WEAK' | 'INVALID' | 'INSUFFICIENT';

export interface OracleDiagnostic {
  /** Machine-readable rule that fired. */
  rule: string;
  /** Human-readable explanation of why the oracle/evidence is weak. */
  detail: string;
}

export interface OracleQualityVerdict {
  strength: EvidenceStrength;
  diagnostics: OracleDiagnostic[];
  /** Whether the oracle can be executed automatically at all. Manual /
   *  judgment criteria are `executable: false` — that is NOT a defect. */
  executable: boolean;
}

/** Tokens that make an assertion unfalsifiable (it can never fail). */
const UNFALSIFIABLE_TAILS = /\|\|\s*(true|exit\s+0)\b|;\s*(true|exit\s+0)\s*$|&&\s*(true|exit\s+0)\s*$/i;
/** `echo <expected>` style oracles that manufacture their own success. */
const ECHO_ORACLE = /^\s*(echo|printf|write-host|console\.log)\b/i;
/** Commands that read state but assert nothing about it. */
const READ_ONLY = /^\s*(cat|type|head|tail|less|more|git\s+(status|log|diff|show|ls-files)|ls|dir)\b/i;

/**
 * Grade a verification oracle BEFORE it is trusted.
 *
 * `expected` is the value the caller wants to see; when it is literally copied
 * into the command (e.g. `echo PASS` used as the "test"), the oracle proves
 * nothing and is graded INVALID.
 */
export function evaluateOracleQuality(input: {
  command?: string;
  criterionText: string;
  expected?: string;
}): OracleQualityVerdict {
  const diagnostics: OracleDiagnostic[] = [];
  const command = (input.command ?? '').trim();
  const criterion = input.criterionText.trim();

  if (!command) {
    // No runnable oracle. This is legitimate for manual / judgment criteria —
    // it must NOT be rejected as broken, only marked non-executable.
    diagnostics.push({
      rule: 'no-oracle',
      detail: 'Criterion has no automated verification command; it can only be satisfied by manual/judgment evidence.',
    });
    return { strength: 'INSUFFICIENT', diagnostics, executable: false };
  }

  if (ECHO_ORACLE.test(command)) {
    diagnostics.push({
      rule: 'echoes-expected',
      detail: `Verification "${command}" merely prints its own answer instead of exercising the criterion.`,
    });
    return { strength: 'INVALID', diagnostics, executable: true };
  }

  if (isTrivialEvidenceCommand(command)) {
    diagnostics.push({
      rule: 'trivial-command',
      detail: `Verification "${command}" is a no-op (status/echo/read-only) and can pass while the requirement stays broken.`,
    });
    return { strength: 'INVALID', diagnostics, executable: true };
  }

  if (input.expected && input.expected.trim() && command.includes(input.expected.trim())) {
    diagnostics.push({
      rule: 'expected-copied-into-command',
      detail: 'The expected value is copied directly into the verification command, so the command can pass regardless of the artifact.',
    });
    return { strength: 'INVALID', diagnostics, executable: true };
  }

  if (UNFALSIFIABLE_TAILS.test(command)) {
    diagnostics.push({
      rule: 'negative-assertion-cannot-fail',
      detail: `Verification "${command}" is guarded by "|| true"/"exit 0" and therefore cannot fail, even when the requirement is broken.`,
    });
    return { strength: 'WEAK', diagnostics, executable: true };
  }

  if (READ_ONLY.test(command)) {
    diagnostics.push({
      rule: 'read-only-no-assertion',
      detail: `Verification "${command}" reads state but asserts nothing; it can pass while the requirement is broken.`,
    });
    return { strength: 'WEAK', diagnostics, executable: true };
  }

  if (!commandReferencesCriterion(command, criterion)) {
    diagnostics.push({
      rule: 'oracle-ignores-criterion',
      detail: `Verification "${command}" does not reference the artifact/behaviour described by the criterion, so it could pass while the requirement is unmet.`,
    });
    return { strength: 'WEAK', diagnostics, executable: true };
  }

  return { strength: 'STRONG', diagnostics, executable: true };
}

/**
 * Heuristic relevance check: does the command plausibly inspect the thing the
 * criterion names? Only applied to bespoke commands — recognised suite runners
 * (npm test / pytest / cargo test / tsc / lint / build) exercise the project's
 * own checks and are inherently capable of covering the criterion.
 */
function commandReferencesCriterion(command: string, criterion: string): boolean {
  if (classifyEvidenceKind(command) !== 'command') return true;
  const cmd = command.toLowerCase();
  const nouns = salientNouns(criterion);
  if (nouns.length === 0) return true; // nothing to cross-check
  return nouns.some((n) => cmd.includes(n));
}

function salientNouns(text: string): string[] {
  const out = new Set<string>();
  // file-ish paths
  for (const m of text.matchAll(/[\w./-]+\.(ts|tsx|js|jsx|py|go|rs|java|css|html|json|md|sql|yml|yaml)\b/gi)) {
    out.add(m[0].toLowerCase());
  }
  // identifiers worth >= 4 chars, skipping common verbs/words
  const stop = new Set([
    'should', 'must', 'when', 'that', 'with', 'have', 'been', 'will', 'does', 'make',
    'return', 'returns', 'function', 'works', 'passes', 'verify', 'verifies', 'ensure',
    'the', 'and', 'for', 'not', 'all', 'any', 'this', 'then', 'into', 'from',
  ]);
  for (const m of text.matchAll(/[A-Za-z_][A-Za-z0-9_-]{3,}/g)) {
    const w = m[0].toLowerCase();
    if (!stop.has(w)) out.add(w);
  }
  return [...out].slice(0, 12);
}

/**
 * Grade an ALREADY-RECORDED piece of evidence against its criterion.
 * A passing command that is irrelevant, trivial, or stale is downgraded so it
 * cannot satisfy the criterion on its own.
 */
export function classifyEvidenceRelevance(
  criterion: AcceptanceCriterion,
  evidence: Evidence,
): { strength: EvidenceStrength; diagnostics: OracleDiagnostic[] } {
  const diagnostics: OracleDiagnostic[] = [];

  if (!evidence.passed) {
    diagnostics.push({ rule: 'evidence-failed', detail: `Evidence "${evidence.label}" did not pass.` });
    return { strength: 'INVALID', diagnostics };
  }
  if (evidence.stale) {
    diagnostics.push({ rule: 'evidence-stale', detail: 'Evidence was recorded before a relevant workspace change; it no longer proves the current state.' });
    return { strength: 'INSUFFICIENT', diagnostics };
  }
  if (criterion.verification && evidence.command && !commandsMatch(criterion.verification, evidence.command)) {
    diagnostics.push({
      rule: 'wrong-command',
      detail: `Evidence command "${evidence.command}" does not match the pinned verification "${criterion.verification}".`,
    });
    return { strength: 'INVALID', diagnostics };
  }
  if (evidence.kind === 'command' && evidence.command && isTrivialEvidenceCommand(evidence.command)) {
    diagnostics.push({ rule: 'trivial-command', detail: `Evidence command "${evidence.command}" is a no-op.` });
    return { strength: 'INVALID', diagnostics };
  }
  if (isWeakEvidenceLink(criterion, evidence)) {
    diagnostics.push({
      rule: 'unpinned-generic-command',
      detail: 'Criterion pins no verification/type and the evidence is a generic command — it could belong to any requirement.',
    });
    return { strength: 'WEAK', diagnostics };
  }
  if (!evidence.command && criterion.verification) {
    diagnostics.push({ rule: 'missing-command', detail: 'Criterion requires a specific verification command but the evidence has none.' });
    return { strength: 'INSUFFICIENT', diagnostics };
  }
  return { strength: 'STRONG', diagnostics };
}
