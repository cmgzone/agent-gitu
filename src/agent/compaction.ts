import { buildDigestContent, compressDigest, DIGEST_TARGET_CHARS, extractDigestMaterial } from '../context/digest.js';
import type { LlmContentPart, LlmMessage } from '../llm/llm.js';
import type { TaskLedgerData } from '../types.js';

/** A small verbatim tail gives the model immediate continuity; durable task
 * state lives in the ledger/snapshot rather than in an ever-growing chat. */
export const COMPACT_KEEP_RECENT = 6;
export const COMPACT_TRIGGER = 32;
/** ~20K tokens at 4 chars/token, including the system prompt and recent
 * observations. Tool output is available on disk; it must not become a
 * permanent context tax. */
export const COMPACT_CHAR_BUDGET = 80_000;
export const COMPACT_MIN_RECENT = 2;
export const COMPACT_RECENT_MESSAGE_MAX_CHARS = 6_000;

export function estimateMessageChars(messages: LlmMessage[]): number {
  let total = 0;
  for (const m of messages) {
    if (typeof m.content === 'string') total += m.content.length;
    else {
      for (const part of m.content) {
        if (part.type === 'text') total += part.text.length;
        else total += Math.floor(part.image_url.url.length / 4);
      }
    }
  }
  return total;
}

/**
 * How many of the most recent screenshots stay in model context when a fresh
 * one arrives. One destroyed cross-page/state consistency on frontend runs
 * (the model could never compare views it had already built); four preserves
 * before/after comparisons while bounding vision token cost.
 */
export const KEEP_RECENT_SCREENSHOTS = 4;

/**
 * Replace image parts in older messages with a short text note so obsolete
 * screenshots do not keep billing vision tokens turn after turn. Returns the
 * number of images removed. `keepLast` messages are left untouched, and
 * `fromIndex` protects the stable prefix (e.g. the user's original attached
 * images) from being stripped.
 */
export function stripStaleImages(
  messages: LlmMessage[],
  keepLast = 1,
  fromIndex = 0,
  keepMessage?: (m: LlmMessage) => boolean,
): number {
  let removed = 0;
  const stopAt = Math.max(fromIndex, messages.length - keepLast);
  for (let i = fromIndex; i < stopAt; i++) {
    const m = messages[i]!;
    // Durable user-reference visuals (mockups) survive: unlike a browser
    // screenshot they cannot be re-captured once stripped.
    if (keepMessage?.(m)) continue;
    if (typeof m.content === 'string') continue;
    const images = m.content.filter((p) => p.type === 'image_url').length;
    if (images === 0) continue;
    removed += images;
    const textParts = m.content.filter((p): p is Extract<LlmContentPart, { type: 'text' }> => p.type === 'text');
    m.content =
      textParts.length > 0
        ? [...textParts, { type: 'text', text: `[${images} earlier screenshot(s) removed from context — take a fresh one if needed]` }]
        : `[${images} earlier screenshot(s) removed from context — take a fresh one if needed]`;
  }
  return removed;
}

/**
 * Recompute the stable-prefix boundary after compactHistory() splices
 * messages. Post-compaction the layout is always [system prompt, digest,
 * ...retained tail]: everything that was prefix beyond index 0 is either gone
 * or now lives in the retained history, and the digest itself is stable going
 * forward — so the cacheable prefix is exactly system + digest.
 */
export function shiftPrefixEndAfterCompaction(prefixEnd: number, _keepFrom: number): number {
  return prefixEnd > 0 ? Math.min(prefixEnd + 1, 2) : 0;
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

/**
 * Compact a growing conversation as the run goes: older turns collapse into a
 * single digest while the recent tail stays verbatim. The ledger state message
 * re-emitted on every turn remains authoritative (goal, criteria, architecture
 * decisions, evidence, current state), so compacted details — old tool
 * outputs, stale file dumps, obsolete screenshots — are exactly the noise the
 * model doesn't need.
 *
 * Triggers when EITHER the message count or the cumulative character size
 * (~4 chars/token) crosses its budget.
 */
export interface CompactionOptions {
  charBudget?: number;
  keepRecent?: number;
  triggerMessages?: number;
  /** Canonical ContextSnapshot render, embedded so durable state survives
   *  history drops even before the next TASK STATE message is built. */
  snapshot?: string;
  /** Memory-aware compaction: hands the preserved failures to the caller so
   *  durable lessons can be extracted into project memory before the verbose
   *  history is discarded. */
  onExtract?: (info: { failures: string[] }) => void;
  /** Skip the normal triggers and compact now (protocol-drift recovery). */
  force?: boolean;
}

/**
 * Last-resort reduction for a giant *recent* tool result. The original result
 * remains in the ledger, terminal, file system, or browser evidence; this
 * keeps enough head/tail/diagnostic context for the next model turn without
 * letting a single log defeat the whole history budget.
 */
export function compactRecentMessage(message: LlmMessage, maxChars = COMPACT_RECENT_MESSAGE_MAX_CHARS): boolean {
  if (typeof message.content !== 'string' || message.content.length <= maxChars) return false;
  const text = message.content;
  const headBudget = Math.floor(maxChars * 0.4);
  const tailBudget = Math.floor(maxChars * 0.35);
  const diagnostic = /RESULT \[error\]|\b(error|failed|exception|assertion)\b/i.test(text) ? extractFailureDigest(text, Math.floor(maxChars * 0.25)) : '';
  const availableTail = Math.max(200, tailBudget - diagnostic.length);
  message.content =
    `${text.slice(0, headBudget)}\n` +
    `[... ${text.length - headBudget - availableTail} characters trimmed from recent history; re-read the file or rerun the command for the complete result ...]\n` +
    (diagnostic ? `DIAGNOSTIC CORE:\n${diagnostic}\n` : '') +
    text.slice(-availableTail);
  return true;
}

export function compactHistory(messages: LlmMessage[], onEvent?: (text: string) => void, opts: CompactionOptions = {}): boolean {
  const charBudget = opts.charBudget ?? COMPACT_CHAR_BUDGET;
  const keepRecent = opts.keepRecent ?? COMPACT_KEEP_RECENT;
  const triggerMessages = opts.triggerMessages ?? COMPACT_TRIGGER;

  const charsBefore = estimateMessageChars(messages);
  if (!opts.force && messages.length <= triggerMessages && charsBefore <= charBudget) return false;

  let compacted = false;
  let compactedMessages = 0;
  // Keep two exchanges at minimum. If the recent tail itself is oversized,
  // reduce its count before truncating any individual recent observation.
  let retained = Math.max(COMPACT_MIN_RECENT, Math.min(keepRecent, Math.max(COMPACT_MIN_RECENT, messages.length - 2)));

  while (messages.length > triggerMessages || estimateMessageChars(messages) > charBudget) {
    const hasDigest = typeof messages[1]?.content === 'string' && messages[1]!.content.startsWith('COMPACTED HISTORY');
    const minimumMessagesAtThisTail = 1 + retained + (hasDigest ? 1 : 0);
    // We are down to system + digest + desired tail. Tighten the tail before
    // touching a recent message; the next loop absorbs the oldest tail item
    // into the digest alongside the prior digest.
    if (messages.length <= minimumMessagesAtThisTail) {
      if (retained > COMPACT_MIN_RECENT) {
        retained -= 1;
        continue;
      }
      break;
    }
    const keepFrom = messages.length - retained;
    const old = messages.splice(1, keepFrom - 1);
    compactedMessages += old.length;
    // Digest material extraction lives in the shared context core so the
    // context authority (buildModelContext) uses the exact same format and
    // carry-forward rules.
    const material = extractDigestMaterial(old);
    const dedupe = (lines: string[]): string[] => [...new Set(lines.map((l) => l.replace(/\s+/g, ' ').trim()))];
    const keptFailures = dedupe(material.failures).slice(-8);
    const keptEvidence = dedupe(material.evidenceLines).slice(-10);
    opts.onExtract?.({ failures: keptFailures });
    let digest = buildDigestContent({
      condensedCount: material.carriedMessages + old.length,
      excerptLines: material.excerptLines,
      failures: keptFailures,
      evidence: keptEvidence,
      snapshot: opts.snapshot,
    });
    // The shared digest target is intentionally lower than its hard ceiling:
    // a durable summary must leave room for the next state message.
    if (digest.length > DIGEST_TARGET_CHARS) digest = compressDigest(digest, DIGEST_TARGET_CHARS);
    messages.splice(1, 0, { role: 'user', content: digest });
    compacted = true;
    if (retained > COMPACT_MIN_RECENT) retained -= 1;
    else break;
  }

  // A few enormous recent read/command results can still exceed the target
  // after the tail is reduced to two messages. Preserve their diagnostic
  // beginning/end, but do not let them force 50K-token requests forever.
  if (estimateMessageChars(messages) > charBudget) {
    for (let i = 1; i < messages.length && estimateMessageChars(messages) > charBudget; i++) {
      if (compactRecentMessage(messages[i]!)) compacted = true;
    }
  }

  if (compacted) {
    onEvent?.(
      `context compacted ${compactedMessages} earlier messages (${charsBefore} chars before → ${estimateMessageChars(messages)} chars; ${messages.length} messages retained)`,
    );
  }
  return compacted;
}

/**
 * Digest a failed command's output down to its diagnostic core: error-ish
 * lines plus the tail (where summaries/stacks end). Test and build logs put
 * the actual cause at the END; the old first-2500-chars slice usually cut it
 * off entirely.
 */
const FAILURE_LINE_RE =
  /\b(fail(?:ed|ure|ing)?s?|error(?:s)?|exception|assert(?:ion)?|expected|received|cannot|unable|refused|denied|invalid|missing|timeout|timed\s*out|enoent|eacces|eperm|stack\s+trace)\b|[✗×]/i;

export function extractFailureDigest(output: string, maxChars = 1200): string {
  const lines = output.split(/\r?\n/);
  const seen = new Set<string>();
  const picked: string[] = [];
  const push = (line: string): void => {
    const t = line.replace(/\s+/g, ' ').trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    picked.push(t.slice(0, 240));
  };
  for (const l of lines) {
    if (FAILURE_LINE_RE.test(l)) push(l);
  }
  const tailStart = Math.max(0, lines.length - 8);
  for (const l of lines.slice(tailStart)) push(l);
  let out = '';
  for (const p of picked) {
    if (out.length + p.length + 1 > maxChars) break;
    out += (out ? '\n' : '') + p;
  }
  return out || output.replace(/\s+/g, ' ').trim().slice(0, maxChars);
}

/** Follow-ups have their exact new request in the protected follow-up block.
 * Keep only a small, recent conversational tail for tone/references instead
 * of paying to replay the whole finished task. */
export function compactFollowUpConversation(history: LlmMessage[] | undefined, maxChars = 6_000): LlmMessage[] | undefined {
  if (!history?.length) return history;
  const kept: LlmMessage[] = [];
  let used = 0;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index]!;
    const text = typeof message.content === 'string' ? message.content : message.content.map((part) => (part.type === 'text' ? part.text : '')).join('');
    const size = text.length;
    if (kept.length > 0 && used + size > maxChars) continue;
    kept.unshift(message);
    used += size;
    if (used >= maxChars) break;
  }
  return kept;
}
