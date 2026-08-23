import type { LlmMessage, LlmUsage } from '../llm/llm.js';
import type { TokenTelemetrySnapshot } from '../types.js';

/**
 * Per-run token telemetry. Provider-reported usage is recorded when
 * available; char-based estimates (≈4 chars/token) attribute input spend to
 * its sources so token burn can be diagnosed instead of guessed at.
 */

export const CHARS_PER_TOKEN = 4;
/** Rough vision pricing constant: tokens per KB of decoded image payload. */
export const IMAGE_TOKENS_PER_KB = 200;

export function estimateTokens(chars: number): number {
  return Math.max(0, Math.ceil(chars / CHARS_PER_TOKEN));
}

export function messageTextChars(message: LlmMessage): number {
  if (typeof message.content === 'string') return message.content.length;
  let total = 0;
  for (const part of message.content) {
    if (part.type === 'text') total += part.text.length;
  }
  return total;
}

/** Estimated base64 image bytes across all image parts of a message. */
export function messageImageBytes(message: LlmMessage): number {
  if (typeof message.content === 'string') return 0;
  let bytes = 0;
  for (const part of message.content) {
    if (part.type !== 'image_url') continue;
    const url = part.image_url.url;
    const base64 = url.includes(',') ? url.slice(url.indexOf(',') + 1) : url;
    bytes += Math.floor((base64.length * 3) / 4);
  }
  return bytes;
}

export function estimateImageTokens(decodedBytes: number): number {
  return Math.ceil((decodedBytes / 1024) * IMAGE_TOKENS_PER_KB);
}

function messageTokens(message: LlmMessage): number {
  return estimateTokens(messageTextChars(message)) + estimateImageTokens(messageImageBytes(message));
}

export interface CallClassification {
  /** Estimated tokens for the stable prefix (system prompt + startup context). */
  prefixTokens: number;
  /** Estimated tokens for appended history between the prefix and the state message. */
  historyTokens: number;
  /** Estimated tokens for the final state message of the call. */
  stateTokens: number;
  /** Estimated tokens carried by image parts anywhere in the call. */
  imageTokens: number;
}

/**
 * Split one call's input into prefix / history / state. `prefixEnd` is the
 * index just past the messages that were pushed before the main loop began
 * (system prompt, strategy, context pack, resumed conversation, user
 * images) — everything before it forms the byte-stable cached prefix.
 */
export function classifyCall(messages: LlmMessage[], prefixEnd: number): CallClassification {
  let prefixTokens = 0;
  let historyTokens = 0;
  let stateTokens = 0;
  let imageTokens = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    // Keep the buckets disjoint: messageTokens() already includes image cost,
    // so attribute the image share to `imageTokens` only and add the text
    // remainder to prefix/history/state. Otherwise images are counted twice
    // and bySource sums exceed estimatedInputTokens.
    const imageShare = estimateImageTokens(messageImageBytes(m));
    const tokens = messageTokens(m) - imageShare;
    if (i < prefixEnd) {
      prefixTokens += tokens;
      imageTokens += imageShare;
    } else if (i === messages.length - 1) {
      stateTokens += tokens;
      imageTokens += imageShare;
    } else {
      historyTokens += tokens;
      imageTokens += imageShare;
    }
  }
  return { prefixTokens, historyTokens, stateTokens, imageTokens };
}

export class RunTelemetry {
  private calls = 0;
  private inputTokens = 0;
  private outputTokens = 0;
  private cachedTokens = 0;
  private estimatedInputTokens = 0;
  private readonly bySource = { system: 0, contextPack: 0, history: 0, state: 0, images: 0 };
  // Planning vs execution attribution (spec §9): is richer planning actually
  // costing more, and does it pay for itself in fewer execution turns?
  private planningCalls = 0;
  private executionCalls = 0;
  private estimatedPlanningInput = 0;
  private estimatedExecutionInput = 0;
  private planningOutputTokens = 0;
  private executionOutputTokens = 0;
  private compactions = 0;
  private screenshots = 0;
  private screenshotBytes = 0;
  private toolCalls = 0;
  private wastedCalls = 0;
  filesInContextPack = 0;

  /** Record one model call. `prefixEnd` splits stable prefix from live history;
   *  `phase` attributes the call to planning or execution. */
  recordCall(
    messages: LlmMessage[],
    usage: LlmUsage | undefined,
    prefixEnd: number,
    phase: 'planning' | 'execution' = 'execution',
  ): void {
    this.calls += 1;
    if (phase === 'planning') this.planningCalls += 1;
    else this.executionCalls += 1;
    if (usage) {
      this.inputTokens += usage.inputTokens;
      this.outputTokens += usage.outputTokens;
      this.cachedTokens += usage.cachedTokens;
      if (phase === 'planning') this.planningOutputTokens += usage.outputTokens;
      else this.executionOutputTokens += usage.outputTokens;
    }
    const split = classifyCall(messages, prefixEnd);
    const estInput = split.prefixTokens + split.historyTokens + split.stateTokens + split.imageTokens;
    this.estimatedInputTokens += estInput;
    if (phase === 'planning') {
      this.estimatedPlanningInput += estInput;
    } else {
      this.estimatedExecutionInput += estInput;
    }
    this.bySource.system += split.prefixTokens;
    this.bySource.history += split.historyTokens;
    this.bySource.state += split.stateTokens;
    this.bySource.images += split.imageTokens;
  }

  noteCompaction(): void {
    this.compactions += 1;
  }

  noteScreenshot(base64Chars: number): void {
    this.screenshots += 1;
    this.screenshotBytes += Math.floor((base64Chars * 3) / 4);
  }

  noteToolCall(): void {
    this.toolCalls += 1;
  }

  noteWastedCall(): void {
    this.wastedCalls += 1;
  }

  snapshot(): TokenTelemetrySnapshot {
    return {
      calls: this.calls,
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      cachedTokens: this.cachedTokens,
      estimatedInputTokens: this.estimatedInputTokens,
      estimatedBySource: { ...this.bySource, contextPack: this.bySource.contextPack },
      planningCalls: this.planningCalls,
      executionCalls: this.executionCalls,
      estimatedPlanningInput: this.estimatedPlanningInput,
      estimatedExecutionInput: this.estimatedExecutionInput,
      planningOutputTokens: this.planningOutputTokens,
      executionOutputTokens: this.executionOutputTokens,
      compactions: this.compactions,
      screenshots: this.screenshots,
      screenshotBytes: this.screenshotBytes,
      toolCalls: this.toolCalls,
      wastedCalls: this.wastedCalls,
      filesInContextPack: this.filesInContextPack,
    };
  }
}

/** Compact human-readable summary for events/reports. */
export function renderTelemetry(t: TokenTelemetrySnapshot): string {
  const src = t.estimatedBySource;
  return (
    `calls=${t.calls} input=${t.inputTokens} cached=${t.cachedTokens} output=${t.outputTokens} ` +
    `~estInput=${t.estimatedInputTokens} (system/context=${src.system + src.contextPack} history=${src.history} state=${src.state} images=${src.images}) ` +
    `planning=${t.planningCalls}c/~${t.estimatedPlanningInput}t execution=${t.executionCalls}c/~${t.estimatedExecutionInput}t ` +
    `compactions=${t.compactions} toolCalls=${t.toolCalls} screenshots=${t.screenshots} wasted=${t.wastedCalls}`
  );
}

/**
 * Estimate the tokens carried by planning artifacts (design + plan + todos).
 * Computed at end-of-run from ledger content so cost of richer planning is
 * measurable against the execution savings it enables.
 */
export function estimatePlanningArtifactTokens(data: {
  planDesign?: { frontend?: string; backend?: string; integration?: string };
  plan: { description: string; verification: string; subtasks?: { text: string }[] }[];
}): { designTokens: number; planTokens: number; todoTokens: number } {
  const d = data.planDesign ?? {};
  const designChars = (d.frontend?.length ?? 0) + (d.backend?.length ?? 0) + (d.integration?.length ?? 0);
  let planChars = 0;
  let todoChars = 0;
  for (const s of data.plan) {
    planChars += s.description.length + s.verification.length;
    for (const t of s.subtasks ?? []) todoChars += t.text.length;
  }
  return {
    designTokens: estimateTokens(designChars),
    planTokens: estimateTokens(planChars),
    todoTokens: estimateTokens(todoChars),
  };
}
