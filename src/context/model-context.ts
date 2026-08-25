/**
 * buildModelContext — the ONE authority that decides what reaches the model.
 *
 * Every static-context subsystem (system prompt, strategy skill, context
 * pack, resumed conversation, user images, follow-up notes) is assembled
 * HERE, in a fixed priority order, under a character budget. When the budget
 * is exceeded, the lowest-priority trimmable sections give way first — the
 * context pack (explicitly a partial sample) and the oldest resumed history —
 * while the system prompt, strategy, user images and follow-up notes are
 * never dropped. No subsystem may push model context around this function;
 * the per-turn loop (state message + observations + compaction) remains the
 * only other writer, by design.
 *
 * Priority (high -> low), with the PROTECTED tiers the trimmer structurally
 * cannot touch (they are separate variables, never inputs to the trim loop):
 *
 *   PROTECTED (never trimmed):
 *     system | strategy | task state (per-turn) | compaction digest
 *     follow-up / user intent | user images
 *   TRIMMABLE (in order):
 *     context pack first -> older conversation history (digest-before-trim)
 *
 * The invariant: no information required to resume the current task may
 * exist only in a trimmable section. History is digested before it is
 * trimmed, and an over-large digest is COMPRESSED into a smaller protected
 * digest (v1 -> v2) rather than deleted.
 */
import type { LlmContentPart, LlmMessage } from '../llm/llm.js';
import { messageTextChars, sectionOfMessage, type ContextSections } from '../agent/telemetry.js';
import { buildHistoryDigest, compressDigest, DIGEST_TARGET_CHARS } from './digest.js';

export interface ModelContextImage {
  name: string;
  dataUrl: string;
}

export interface ModelContextInput {
  system: string;
  strategy?: string;
  /** Ranked, budgeted long-term memory (RELEVANT MEMORY ...). Trimmable
   *  after the context pack; provided by retrieval, injected only here. */
  memory?: string;
  contextPack?: string;
  conversationHistory?: LlmMessage[];
  images?: ModelContextImage[];
  supportsImages?: boolean;
  /** Prebuilt follow-up/resume note (never trimmed — it carries user intent). */
  followUp?: string;
  budget?: { maxChars?: number };
  onTrim?: (info: { section: string; charsRemoved: number }) => void;
}

export interface ModelContextResult {
  messages: LlmMessage[];
  /** Content-based section accounting for the assembled context. */
  sections: ContextSections;
  totalChars: number;
  imagesAttached: number;
  imagesSkipped: boolean;
  trims: { section: string; charsRemoved: number }[];
}

/** Default static-context budget (~15K tokens at 4 chars/token). The per-turn
 *  loop adds state + observations on top; compaction is that phase's budget. */
export const DEFAULT_CONTEXT_MAX_CHARS = 60_000;

export function buildModelContext(input: ModelContextInput): ModelContextResult {
  const maxChars = Math.max(1_000, input.budget?.maxChars ?? DEFAULT_CONTEXT_MAX_CHARS);
  const trims: ModelContextResult['trims'] = [];
  let contextPack = input.contextPack;
  let history = [...(input.conversationHistory ?? [])];
  let digestContent: string | undefined;

  const charsOf = (): number => {
    let total = input.system.length + (input.strategy?.length ?? 0) + (input.memory?.length ?? 0) + (contextPack?.length ?? 0) + (input.followUp?.length ?? 0) + (digestContent?.length ?? 0);
    for (const m of history) total += messageTextChars(m);
    if (input.images?.length && input.supportsImages) {
      for (const img of input.images) total += Math.floor(img.dataUrl.length / 4);
    }
    return total;
  };

  // Budget enforcement, lowest priority first: context pack, then oldest
  // history. HISTORY TRIMMING IS ALWAYS PRECEDED BY DIGESTING — the dropped
  // messages are condensed into a digest message that is NEVER trimmed, so
  // trimming cannot lose information that was not captured. A digest already
  // present in a dropped batch is carried forward, never flattened.
  while (charsOf() > maxChars) {
    if (contextPack && contextPack.length > 2000) {
      const before = contextPack.length;
      const headerEnd = contextPack.indexOf('\n');
      contextPack = `${contextPack.slice(0, Math.max(0, headerEnd) + 1)}[... trimmed to fit the model window — use read_file/search_files for anything specific ...]\n${contextPack.slice(headerEnd + 1, Math.floor(before / 4))}`;
      trims.push({ section: 'contextPack', charsRemoved: before - contextPack.length });
      input.onTrim?.({ section: 'contextPack', charsRemoved: before - contextPack.length });
      continue;
    }
    if (input.memory && input.memory.length > 800 && charsOf() - input.memory.length + 400 <= maxChars) {
      // Memory is supplementary: trim it before history, after the pack.
      const before = input.memory.length;
      input.memory = input.memory.slice(0, 400) + '\\n[... memory trimmed to fit the model window ...]';
      trims.push({ section: 'memory', charsRemoved: before - input.memory.length });
      input.onTrim?.({ section: 'memory', charsRemoved: before - input.memory.length });
      continue;
    }
    if (history.length > 2) {
      const dropCount = Math.max(1, Math.floor((history.length - 2) / 2));
      const dropped = history.splice(0, dropCount);
      let droppedChars = 0;
      for (const d of dropped) droppedChars += messageTextChars(d);
      const built = buildHistoryDigest(dropped, digestContent);
      digestContent = built.content;
      // Digest self-compaction (v1 -> v2): if the merged digest grew past its
      // protected target, compress it into a smaller protected digest — never
      // delete it. Failures/evidence lines are the durable floor and survive
      // compression in full; only old excerpt lines yield.
      if (digestContent.length > DIGEST_TARGET_CHARS) {
        digestContent = compressDigest(digestContent, DIGEST_TARGET_CHARS);
      }
      trims.push({ section: 'conversation', charsRemoved: droppedChars });
      input.onTrim?.({ section: 'conversation', charsRemoved: droppedChars });
      continue;
    }
    break; // nothing trimmable left — the budget is advisory at this point
  }

  const messages: LlmMessage[] = [{ role: 'system', content: input.system }];
  if (input.strategy) messages.push({ role: 'user', content: input.strategy });
  if (input.memory) messages.push({ role: 'user', content: input.memory });
  if (contextPack) messages.push({ role: 'user', content: contextPack });
  if (digestContent) messages.push({ role: 'user', content: digestContent });
  messages.push(...history);

  let imagesAttached = 0;
  let imagesSkipped = false;
  if (input.images && input.images.length > 0) {
    if (input.supportsImages) {
      const parts: LlmContentPart[] = [
        { type: 'text', text: `The user attached ${input.images.length} image(s) relevant to the task. Inspect them carefully and ground your work in what they show.` },
      ];
      for (const img of input.images) parts.push({ type: 'image_url', image_url: { url: img.dataUrl } });
      messages.push({ role: 'user', content: parts });
      imagesAttached = input.images.length;
    } else {
      messages.push({
        role: 'user',
        content: `The user attached ${input.images.length} image(s), but the current model does not support images; they were not delivered. Suggest a vision-capable model if visual input is essential.`,
      });
      imagesSkipped = true;
    }
  }
  if (input.followUp) messages.push({ role: 'user', content: input.followUp });

  const sections: ContextSections = { system: 0, taskState: 0, digest: 0, contextPack: 0, strategy: 0, memory: 0, conversation: 0 };
  let totalChars = 0;
  for (const m of messages) {
    sections[sectionOfMessage(m)] += messageTextChars(m);
    totalChars += messageTextChars(m);
  }
  return { messages, sections, totalChars, imagesAttached, imagesSkipped, trims };
}
