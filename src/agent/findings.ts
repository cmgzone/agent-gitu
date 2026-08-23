import type { SubAgentResult } from './subagent.js';
import type { FindingStatus, TaskFinding } from '../types.js';

/**
 * Finding Verification Gate.
 *
 * Gitu finding a problem is cheap; proving it is real is the hard part. Every
 * finding registered with report_finding is handed to an INDEPENDENT verifier
 * specialist whose only job is to reproduce it. The verifier gets the claim,
 * the location, and (when known) the exact reproduction command, plus explicit
 * anti-rubber-stamp instructions. The finding's status is decided
 * MECHANICALLY from the verifier's evidence — never from its prose:
 *
 *   repro command PASSED  -> confirmed
 *   repro command FAILED  -> false-positive
 *   no usable evidence    -> unverifiable
 */

export const VERIFIER_AGENT = 'finding-verifier';

/** Build the self-contained task text for the independent verifier specialist. */
export function buildVerifierContract(finding: TaskFinding): string {
  return [
    `INDEPENDENT VERIFICATION REQUEST — you are NOT the agent that made this claim. Your job is to try to PROVE OR REFUTE it, not to trust it.`,
    ``,
    `CLAIM (${finding.kind}${finding.severity ? `, severity: ${finding.severity}` : ''}):`,
    finding.claim,
    finding.location ? `LOCATION: ${finding.location}` : '',
    ``,
    'VERIFICATION PROTOCOL:',
    finding.reproductionCommand
      ? `1. Run EXACTLY this reproduction command: ${finding.reproductionCommand}`
      : '1. Devise and run the most direct command(s) that would demonstrate the claim is real.',
    '2. If the output demonstrates the problem, link that evidence with claim_criterion.',
    '3. If you cannot reproduce the problem after an honest attempt, say so plainly in your answer summary — do not fabricate support.',
    '',
    'RULES:',
    '- Do not take the claim at face value; reproduce it yourself.',
    '- A "confirmed" status requires real passing evidence from the reproduction command.',
    '- Failure to reproduce means the finding is a false positive, not that you failed.',
  ]
    .filter(Boolean)
    .join('\n');
}

export interface FindingVerdict {
  status: FindingStatus;
  evidenceIds: string[];
  verifierSummary: string;
}

function normCommand(cmd: string): string {
  return cmd.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Decide the finding status mechanically from the verifier's structured
 * result + evidence report. Prose never decides the outcome.
 *
 * Decision table:
 *   reproduction command PASSED            -> confirmed
 *   reproduction command ran and FAILED    -> false-positive
 *   no repro contract, any evidence PASSED -> confirmed
 *   no repro contract, attempts FAILED     -> false-positive (protocol:
 *                                             failure to reproduce = false positive)
 *   no usable evidence at all              -> unverifiable
 */
export function verdictForFinding(
  finding: TaskFinding,
  result: SubAgentResult | undefined,
): FindingVerdict {
  if (!result) {
    return { status: 'unverifiable', evidenceIds: [], verifierSummary: 'no verifier result was produced' };
  }
  const summary = result.summary.slice(0, 500);
  const allEvidence = result.evidenceReport?.evidence ?? [];
  // With an explicit reproduction contract, only evidence from THAT command
  // is decisive; anything else the verifier ran is environment noise.
  const relevant = finding.reproductionCommand
    ? allEvidence.filter((d) => d.command && normCommand(d.command) === normCommand(finding.reproductionCommand!))
    : allEvidence;

  const passing = relevant.filter((d) => d.passed);
  if (passing.length > 0) {
    return {
      status: 'confirmed',
      evidenceIds: passing.map((d) => d.id),
      verifierSummary: summary || `reproduced via: ${passing[0]!.command ?? passing[0]!.id}`,
    };
  }
  // Evidence exists but every decisive piece failed to demonstrate the claim.
  if (relevant.length > 0) {
    return {
      status: 'false-positive',
      evidenceIds: [],
      verifierSummary: summary || `reproduction attempted and failed: ${relevant[0]!.command ?? relevant[0]!.id}`,
    };
  }
  // No decisive evidence at all: blocked/crashed verifier or an answer without proof.
  return {
    status: 'unverifiable',
    evidenceIds: [],
    verifierSummary: summary || `verifier finished without producing evidence (status: ${result.status})`,
  };
}
