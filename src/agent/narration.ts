/**
 * User-facing narration for the runtime's story moments.
 *
 * The event stream is what the user actually READS while the agent works.
 * These builders turn structured runtime facts (a contradiction, an episode
 * supersession, a verification pass) into the sentences a competent engineer
 * would say out loud — first person, grounded in the real observed text, no
 * internal identifiers in the lead (ids ride in a short parenthetical tail
 * when correlation matters). Presentation only: nothing here feeds back into
 * model context or decisions.
 */

const MAX_QUOTE = 220;

/** One-line, quote-safe excerpt of observed/expected text for narration. */
export function quote(text: string | undefined, max = MAX_QUOTE): string {
  const clean = String(text ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  const stripped = clean.replace(/^["'`]+|["'`]+$/g, '').trim();
  const bounded = stripped.length > max ? `${stripped.slice(0, max - 1).trimEnd()}…` : stripped;
  return `“${bounded}”`;
}

/** Short parenthetical correlation tail, dropped when empty. */
function withRef(sentence: string, ref: string | undefined): string {
  return ref ? `${sentence} (${ref})` : sentence;
}

// ── Problem lifecycle ─────────────────────────────────────────────────────────

export function problemDetected(observed: string, ref?: string): string {
  const o = quote(observed);
  return withRef(`A check came back different from what I expected — ${o}. Pausing the plan here so I can find the cause before changing anything else.`, ref);
}

export function nestedProblemDetected(observed: string, ref?: string): string {
  const o = quote(observed);
  return withRef(`While working through that, I hit another blocker — ${o}. Stacking it: I'll clear this one first, then resume where I left off.`, ref);
}

export function episodeSuperseded(priorExpected: string | undefined, newObserved: string, ref?: string): string {
  const prior = priorExpected ? quote(priorExpected, 120) : 'the original failure';
  const o = quote(newObserved);
  return withRef(`Progress with a twist: ${prior} is gone, but verification now fails differently — ${o}. That old investigation is closed for good; I'm starting a fresh one for what the fix revealed.`, ref);
}

export function episodeReopened(observed: string, ref?: string): string {
  const o = quote(observed);
  return withRef(`The failure I fixed earlier is back — ${o}. Reopening that investigation: the previous fix didn't hold, so I'm looking for what it missed.`, ref);
}

export function hypothesisRecorded(statement: string, ref?: string): string {
  const s = quote(statement, 180);
  return withRef(`My working theory: ${s}. Testing it with the smallest check that could prove it wrong.`, ref);
}

export function rootCauseIdentified(target: string | undefined, ref?: string): string {
  const t = target && target !== 'unknown' ? ` The fix belongs to ${target}.` : '';
  return withRef(`I've traced the cause.${t}`, ref);
}

export function actNow(target: string | undefined, intendedEffect: string | undefined, ref?: string): string {
  const effect = intendedEffect ? ` ${quote(intendedEffect, 140)}` : '';
  const t = target && target !== 'unknown' ? ` on ${target}` : '';
  return withRef(`I know exactly what to do${t} — applying the fix now.${effect}`, ref);
}

export function repairApplied(): string {
  return 'Fix applied. Re-running the exact check that failed before — the fix only counts when that check passes on its own.';
}

export function problemResolved(ref?: string): string {
  return withRef('The original failing check now passes — confirmed resolved, and I’m back on the plan.', ref);
}

// ── Plan / progress ───────────────────────────────────────────────────────────

export function planReconciled(count: number): string {
  const n = count === 1 ? 'one step' : `${count} steps`;
  return `While picking up where this left off, I verified that ${n} of the plan's own checks already pass at the current state — marking ${count === 1 ? 'it' : 'them'} done rather than redoing finished work.`;
}

export function contextCompacted(droppedMessages: number, charsBefore: number, charsAfter: number): string {
  const kb = (n: number): string => `${Math.round(n / 100) / 10}K chars`;
  return `I tidied my working memory — ${droppedMessages} earlier message${droppedMessages === 1 ? '' : 's'} folded into a durable summary (${kb(charsBefore)} → ${kb(charsAfter)}). Plans, evidence, and decisions are kept in full.`;
}

export function planRevised(stepId: string, reason: string): string {
  return `Reality diverged from the plan at ${stepId} — ${quote(reason, 160)} — so I'm updating just that step instead of blindly continuing.`;
}

// ── Guardrails (blocked/denied moments) ──────────────────────────────────────

export function duplicateInvestigationPrevented(): string {
  return 'I already have this answer from an earlier read — skipping the duplicate and working from what I recorded.';
}

export function decisionSufficientReadSuppressed(): string {
  return 'The repair decision is already made, so I’m skipping further exploration and acting on it.';
}

export function investigationDriftBlocked(): string {
  return 'I’ve been investigating without anything material changing — time to commit to a hypothesis, a repair, or escalate instead of reading more.';
}

export function strategyRepeatPrevented(): string {
  return 'I caught myself about to retry the exact approach that already failed, with nothing changed. Choosing a materially different approach instead.';
}

// ── Scratch diagnostics ───────────────────────────────────────────────────────

export function scratchRedirected(fileName: string, targetPath: string): string {
  return `I need a quick throwaway diagnostic (${fileName}) — saving it under my task's scratch space (${targetPath}), not your source tree. It's deleted when the task finishes.`;
}
