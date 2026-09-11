import { gitExec } from '../git/git.js';
import type { LlmContentPart, LlmMessage } from '../llm/llm.js';
import type { TaskLedgerData, VerifiedDiffSnapshot } from '../types.js';
import type { EffortPlan } from './effort-planner.js';
import { isUiTask } from './ui-gate.js';

export interface QualityReviewInput {
  goal: string;
  criteria: string[];
  filesChanged: string[];
  diffStat: string;
  /** Bounded full diff for deep reviews — lets the reviewer judge real code, not just file names. */
  diffBody?: string;
  summary: string;
  screenshotUrl?: string;
  /** True even when the selected model/browser cannot supply a screenshot. */
  uiTask?: boolean;
  /** Planned view/control intent, used to detect implementation drift. */
  frontendDesign?: string;
  /** Latest bounded DOM/accessibility/layout evidence for text-only review. */
  browserEvidence?: string;
}

/**
 * Parse the reviewer's reply. Only an explicit PASS counts as a successful
 * second opinion; malformed/unavailable review output is reported as such so
 * it cannot masquerade as verification.
 */
export function parseReviewVerdict(reply: string): { verdict: 'pass' | 'revise' | 'unavailable'; feedback: string } {
  const m = /VERDICT:\s*(REVISE|PASS|REJECT)/i.exec(reply);
  if (m && m[1] && /revise|reject/i.test(m[1])) {
    const fbIdx = reply.search(/FEEDBACK:/i);
    const feedback = (fbIdx >= 0 ? reply.slice(fbIdx + 8) : reply.slice((m.index ?? 0) + m[0].length)).replace(/\s+/g, ' ').trim().slice(0, 600);
    return { verdict: 'revise', feedback: feedback || 'Reviewer did not provide specifics — re-check the diff against the acceptance criteria.' };
  }
  if (m && m[1] && /pass/i.test(m[1])) return { verdict: 'pass', feedback: '' };
  return { verdict: 'unavailable', feedback: 'Final quality reviewer returned no explicit PASS or REVISE verdict.' };
}

/**
 * Review a durable task delta. A new follow-up supplies its phase baseline;
 * initial tasks retain the historical first-checkpoint behavior. Individual
 * steps are checkpointed as they complete, so `git diff HEAD` alone is often
 * empty by final quality review.
 */
export async function collectQualityReviewDiff(
  root: string,
  checkpointsOrBaseRef: { ref: string }[] | string | undefined,
  maxBodyChars = 8_000,
): Promise<{ baseRef?: string; headRef?: string; diffStat: string; diffBody?: string; diffBodyTruncated: boolean; changedFiles: string[] }> {
  const baseRef =
    typeof checkpointsOrBaseRef === 'string' ? checkpointsOrBaseRef.trim() || undefined : checkpointsOrBaseRef?.find((checkpoint) => checkpoint.ref.trim())?.ref.trim();
  const args = baseRef ? ['diff', baseRef] : ['diff', 'HEAD'];
  const diffStat = await gitExec(root, [...args, '--stat']).catch(() => '');
  const fullDiff = maxBodyChars > 0 ? await gitExec(root, args).catch(() => '') : '';
  const diffBody = maxBodyChars > 0 ? fullDiff.slice(0, maxBodyChars) : undefined;
  const diffBodyTruncated = maxBodyChars > 0 && fullDiff.length > maxBodyChars;
  const changedFiles = (await gitExec(root, [...args, '--name-only']).catch(() => ''))
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter(Boolean);
  const headRef = (await gitExec(root, ['rev-parse', 'HEAD']).catch(() => '')).trim() || undefined;
  return { baseRef, headRef, diffStat, changedFiles, diffBodyTruncated, ...(diffBody ? { diffBody } : {}) };
}

/** A saved diff is proof only for the exact workspace/commit that produced it. */
export function isVerifiedDiffSnapshotCurrent(
  snapshot: VerifiedDiffSnapshot | undefined,
  input: { phaseId?: string; workspaceFingerprint: string; headRef?: string },
): snapshot is VerifiedDiffSnapshot {
  return Boolean(
    snapshot &&
      snapshot.phaseId === input.phaseId &&
      snapshot.workspaceFingerprint === input.workspaceFingerprint &&
      snapshot.headRef === input.headRef,
  );
}

const SAFE_COMPLETION_PATH = /(?:^|\/)(?:docs?(?:\/|$)|readme(?:\.[^/]+)?$|changelog(?:\.[^/]+)?$|license(?:\.[^/]+)?$|contributing(?:\.[^/]+)?$|\.editorconfig$|\.gitattributes$|\.gitignore$|\.prettier(?:rc|ignore)?(?:\.[^/]+)?$|eslint\.config\.[^/]+$)|\.(?:md|mdx|rst|txt)$/i;

function diffContainsOnlyComments(diffBody: string | undefined, truncated: boolean): boolean {
  if (!diffBody || truncated) return false;
  const changedLines = diffBody
    .split(/\r?\n/)
    .filter((line) => /^[+-]/.test(line) && !/^\+\+\+|^---/.test(line))
    .map((line) => line.slice(1).trim())
    .filter(Boolean);
  return changedLines.length > 0 && changedLines.every((line) => /^(?:\/\/|\/\*|\*\/|\*|<!--|-->|#)/.test(line));
}

function allApplicableTargetedChecksPassed(data: TaskLedgerData, workspaceFingerprint: string): boolean {
  const latest = new Map<string, (typeof data.evidence)[number]>();
  for (const evidence of data.evidence) {
    if (!evidence.command) continue;
    latest.set(evidence.command, evidence);
  }
  return [...latest.values()].every(
    (evidence) => evidence.passed && !evidence.stale && (!evidence.workspaceFingerprint || evidence.workspaceFingerprint === workspaceFingerprint),
  );
}

/** Decide whether a fresh AI second opinion can prove something new. This is
 * deliberately conservative: ambiguity keeps the review enabled. */
export function shouldRunFinalQualityReview(input: {
  effortPlan?: Pick<EffortPlan, 'complexity'>;
  riskPlan?: { risk: string; strictVerification: boolean; domains: string[] };
  bugFix: boolean;
  phaseData: TaskLedgerData;
  diff: { changedFiles: string[]; diffBody?: string; diffBodyTruncated?: boolean };
  workspaceFingerprint: string;
  evidenceGateOpen: boolean;
  specialistOrVerificationUncertain: boolean;
}): { run: boolean; reason: string } {
  if (input.effortPlan?.complexity !== 'low') return { run: true, reason: 'task complexity is not low' };
  if (
    input.riskPlan &&
    (input.riskPlan.strictVerification || input.riskPlan.risk !== 'unknown' || input.riskPlan.domains.some((domain) => domain !== 'unknown'))
  ) {
    return { run: true, reason: 'risk plan is not low/unknown' };
  }
  if (input.bugFix) return { run: true, reason: 'bug fix needs behavioral review' };
  if (isUiTask(input.phaseData)) return { run: true, reason: 'UI-affecting change needs review' };
  if (!input.evidenceGateOpen) return { run: true, reason: 'acceptance evidence is incomplete' };
  if (!allApplicableTargetedChecksPassed(input.phaseData, input.workspaceFingerprint)) {
    return { run: true, reason: 'a targeted check is missing, stale, or failed' };
  }
  if (input.specialistOrVerificationUncertain) return { run: true, reason: 'specialist or verification reported uncertainty' };
  if (input.phaseData.actions.some((action) => action.status === 'error' || action.status === 'denied' || action.status === 'blocked')) {
    return { run: true, reason: 'execution included an unresolved uncertainty' };
  }
  if (input.diff.changedFiles.length === 0) {
    return { run: true, reason: 'verified diff has no changed-file scope to classify as safe' };
  }
  const safeFiles = input.diff.changedFiles.every((file) => SAFE_COMPLETION_PATH.test(file));
  const commentOnly = diffContainsOnlyComments(input.diff.diffBody, input.diff.diffBodyTruncated ?? false);
  if (!safeFiles && !commentOnly) return { run: true, reason: 'change may affect application or runtime behavior' };
  return { run: false, reason: safeFiles ? 'low-risk documentation, metadata, or simple configuration only' : 'low-risk comment-only code change' };
}

/** Build the strict-reviewer message list. UI tasks attach the final screenshot for vision judging. */
export function buildQualityReviewMessages(input: QualityReviewInput): LlmMessage[] {
  const criteriaText = input.criteria.length ? input.criteria.map((c, i) => `${i + 1}. ${c}`).join('\n') : '(no explicit criteria — judge against the goal)';
  const text =
    `Review this COMPLETED engineering task with fresh eyes. Be strict about real defects; do not nitpick style.\n\n` +
    `GOAL: ${input.goal}\n\nACCEPTANCE CRITERIA:\n${criteriaText}\n\n` +
    `FILES CHANGED: ${input.filesChanged.slice(0, 30).join(', ') || '(none recorded)'}\n\n` +
    `DIFF SUMMARY:\n${(input.diffStat || '(unavailable)').slice(0, 4000)}\n\n` +
    (input.diffBody ? `FULL DIFF (bounded):\n${input.diffBody}\n\n` : '') +
    `AGENT'S CLAIMED RESULT: ${input.summary.slice(0, 1500)}\n\n` +
    (input.uiTask && input.frontendDesign ? `FRONTEND DESIGN INTENT:\n${input.frontendDesign.slice(0, 1200)}\n\n` : '') +
    (input.uiTask && input.browserEvidence ? `FINAL STRUCTURED BROWSER EVIDENCE:\n${input.browserEvidence.slice(0, 6000)}\n\n` : '') +
    (input.screenshotUrl
      ? `The final UI state is attached as an image. JUDGE IT: does it look complete, correctly laid out, and consistent with the goal? Broken layouts, placeholder text, overlapping elements, or missing sections are defects.\n\n`
      : '') +
    (input.uiTask
      ? `UI LOGIC REVIEW (required): inventory the interactive controls visible in the diff, design notes, browser evidence, and screenshot. Every button, link, field, menu, and call to action must have a user-relevant purpose supported by the goal/criteria or an established surrounding pattern; be located near the content or object it affects; have hierarchy proportional to its importance; use a label that predicts its effect; and have a real destination/handler plus correct disabled, loading, permission, validation, and destructive-confirmation behavior where applicable. Treat unrequested, misplaced, duplicated, misleading, dead, or contradictory controls as real defects. Do not reject conventional controls when the supplied evidence supports their purpose.\n\n`
      : '') +
    `Check specifically: regressions at call sites of changed code, missed error paths, edge cases, and whether the changes actually satisfy every criterion.\n\n` +
    `Reply EXACTLY in this format:\nVERDICT: PASS\nor\nVERDICT: REVISE\nFEEDBACK: <one short paragraph of concrete issues to fix>`;
  const userContent: LlmContentPart[] = [{ type: 'text', text }];
  if (input.screenshotUrl) userContent.push({ type: 'image_url', image_url: { url: input.screenshotUrl } });
  return [
    {
      role: 'system',
      content:
        'You are a strict senior engineer and product-interface reviewer examining finished work before it ships. You have no stake in being agreeable. Judge only what is supported by the goal, criteria, design intent, diff, browser evidence, and screenshot.',
    },
    { role: 'user', content: userContent },
  ];
}

/** Most recent screenshot attached anywhere in the conversation, if any. */
export function findLastScreenshotUrl(messages: LlmMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const content = messages[i]?.content;
    if (!content || typeof content === 'string') continue;
    for (let j = content.length - 1; j >= 0; j--) {
      const part = content[j];
      if (!part || part.type !== 'image_url') continue;
      if (part.image_url.url.startsWith('data:image/')) return part.image_url.url;
    }
  }
  return undefined;
}

/** Most recent structured browser evidence collected for the finished UI. */
export function findLastBrowserEvidence(data: TaskLedgerData): string | undefined {
  for (let i = data.actions.length - 1; i >= 0; i--) {
    const action = data.actions[i];
    if (
      action?.tool === 'browse' &&
      action.status === 'success' &&
      /evidence/.test(action.paramsSummary) &&
      typeof action.observation === 'string' &&
      action.observation.includes('BROWSER EVIDENCE')
    ) {
      return action.observation.slice(0, 6000);
    }
  }
  return undefined;
}
