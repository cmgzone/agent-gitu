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
  /** A successful screenshot exists AND no file edit happened after it. */
  verified: boolean;
  /** Human-readable reason when not verified. */
  reason?: string;
}

/**
 * Completion gate for frontend work: the run must LOOK at what it built after
 * the last time it touched a file. Without this, "unfinished/broken" UI passes
 * as done because command-based evidence cannot see pixels.
 */
export function uiVisualGate(data: TaskLedgerData, opts: { browserAvailable: boolean }): UiVisualGate {
  if (!isUiTask(data)) return { required: false, verified: true };
  if (!opts.browserAvailable) return { required: false, verified: true };
  const screenshotAt = lastMatchingActionAt(data, isScreenshotAction);
  const editAt = lastMatchingActionAt(data, (a) => FILE_EDIT_TOOLS.has(a.tool) && a.status === 'success');
  if (!screenshotAt) {
    return { required: true, verified: false, reason: 'this task changed user-facing UI but no screenshot was ever taken' };
  }
  if (editAt && editAt > screenshotAt) {
    return { required: true, verified: false, reason: 'UI files were edited AFTER your last screenshot — the final state was never seen' };
  }
  return { required: true, verified: true };
}
