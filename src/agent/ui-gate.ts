import type { ActionRecord, TaskLedgerData } from '../types.js';

/** File extensions whose change almost always means user-facing UI changed. */
const UI_FILE_RE = /\.(html?|css|s[ac]ss|less|jsx|tsx|vue|svelte|astro|ejs|hbs|twig|php)$/i;

/** Tools that change file contents. `run_command` counts too: sed/scripts and
 *  sub-agent merges mutate UI files without write_file/apply_edit, and a stale
 *  pre-edit screenshot must not satisfy the visual gate. */
const FILE_EDIT_TOOLS = new Set(['write_file', 'apply_edit', 'run_command']);

/** paramsSummary of a successful screenshot action ("browse screenshot"). */
function isScreenshotAction(a: ActionRecord): boolean {
  return a.tool === 'browse' && a.status === 'success' && /screenshot/.test(a.paramsSummary);
}

/** paramsSummary of a successful structured evidence pass ("browse evidence"). */
function isEvidenceAction(a: ActionRecord): boolean {
  return a.tool === 'browse' && a.status === 'success' && /evidence/.test(a.paramsSummary);
}

/**
 * A structured evidence pass counts as a look ONLY when it ran clean: the
 * observation carries the BROWSER EVIDENCE marker and no high-severity
 * finding. (The collector formats findings as "high: ..." / "!! high: ...".)
 */
function isCleanEvidenceAction(a: ActionRecord): boolean {
  return isEvidenceAction(a) && typeof a.observation === 'string' && a.observation.includes('BROWSER EVIDENCE') && !/high:/.test(a.observation);
}

function lastMatchingActionAt(data: TaskLedgerData, pred: (a: ActionRecord) => boolean): string | undefined {
  for (let i = data.actions.length - 1; i >= 0; i--) {
    const a = data.actions[i];
    if (!a) continue;
    if (pred(a)) return a.createdAt;
  }
  return undefined;
}

/**
 * True when this task visibly touches user-facing UI — via recorded design
 * notes, frontend-tagged plan steps, or actually changed UI files.
 */
export function isUiTask(data: TaskLedgerData): boolean {
  if (data.planDesign?.frontend?.trim()) return true;
  if (data.plan.some((s) => s.area === 'frontend')) return true;
  if ((data.filesChanged ?? []).some((f) => UI_FILE_RE.test(f))) return true;
  return false;
}

export interface UiVisualGate {
  /** The task looks like UI work and the browser can verify it. */
  required: boolean;
  /** A post-edit look exists: screenshot (vision models) or a clean
   *  structured evidence pass (text-only models). */
  verified: boolean;
  /** Human-readable reason when not verified. */
  reason?: string;
}

/**
 * Completion gate for frontend work: the run must LOOK at what it built after
 * the last time it touched a file. The look is tiered — a screenshot for
 * vision-capable models; for text-only models a clean structured evidence
 * pass (DOM/accessibility/layout/console with zero high-severity findings)
 * counts, because pixels are useless to them. Vision stays the escalation
 * for genuinely visual criteria, not the only form of proof.
 */
export function uiVisualGate(
  data: TaskLedgerData,
  opts: { browserAvailable: boolean; /** Whether the model can actually see screenshots. */ visionAvailable?: boolean },
): UiVisualGate {
  if (!isUiTask(data)) return { required: false, verified: true };
  if (!opts.browserAvailable) return { required: false, verified: true };
  const visionAvailable = opts.visionAvailable ?? true;
  const screenshotAt = lastMatchingActionAt(data, isScreenshotAction);
  const cleanEvidenceAt = lastMatchingActionAt(data, isCleanEvidenceAction);
  const editAt = lastMatchingActionAt(data, (a) => FILE_EDIT_TOOLS.has(a.tool) && a.status === 'success');
  const freshestLookAt = screenshotAt && cleanEvidenceAt ? (screenshotAt > cleanEvidenceAt ? screenshotAt : cleanEvidenceAt) : (screenshotAt ?? cleanEvidenceAt);
  if (!freshestLookAt) {
    return {
      required: true,
      verified: false,
      reason: visionAvailable
        ? 'this task changed user-facing UI but no screenshot was ever taken'
        : 'this task changed user-facing UI but no look was ever taken — run browse evidence (structured pass) or browse screenshot after the last edit',
    };
  }
  if (editAt && editAt > freshestLookAt) {
    return {
      required: true,
      verified: false,
      reason: 'UI files were edited AFTER your last look at the page — the final state was never seen',
    };
  }
  if (visionAvailable && (!screenshotAt || (editAt && editAt > screenshotAt))) {
    // A vision model leaned only on structured evidence: pixels are cheap
    // for it and visual defects hide from DOM probes.
    return {
      required: true,
      verified: false,
      reason: 'you can see images — take a screenshot of the final state (structured evidence alone cannot prove visual quality)',
    };
  }
  return { required: true, verified: true };
}
