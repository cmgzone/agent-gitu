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
  /** Content-based section attribution (Phase 12 token accounting): what the
   *  call's input is actually made of, so context spend is diagnosable and
   *  context-engine changes are provable. */
  sections: ContextSections;
}

export type ContextSection = 'system' | 'taskState' | 'digest' | 'contextPack' | 'strategy' | 'memory' | 'protected' | 'conversation';
export type ContextSections = Record<ContextSection, number>;

/** Classify one message by WHAT it is, not where it sits in the array. */
export function sectionOfMessage(m: LlmMessage): ContextSection {
  if (m.role === 'system') return 'system';
  const text = typeof m.content === 'string' ? m.content : (m.content.find((p) => p.type === 'text')?.text ?? '');
  if (text.startsWith('TASK:') || text.startsWith('TASK AUTHORITY')) return 'taskState';
  if (text.startsWith('COMPACTED HISTORY')) return 'digest';
  if (text.startsWith('CONTEXT PACK') || text.startsWith('CONTEXT SAMPLE')) return 'contextPack';
  if (text.startsWith('RELEVANT MEMORY') || text.startsWith('PRE-FLIGHT FAILURE LESSONS')) return 'memory';
  if (text.startsWith('ACTIVE CONSTRAINTS')) return 'protected';
  if (text.startsWith('TASK STRATEGY')) return 'strategy';
  return 'conversation';
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
  const sections: ContextSections = { system: 0, taskState: 0, digest: 0, contextPack: 0, strategy: 0, memory: 0, protected: 0, conversation: 0 };
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]!;
    // Keep the buckets disjoint: messageTokens() already includes image cost,
    // so attribute the image share to `imageTokens` only and add the text
    // remainder to prefix/history/state. Otherwise images are counted twice
    // and bySource sums exceed estimatedInputTokens.
    const imageShare = estimateImageTokens(messageImageBytes(m));
    const tokens = messageTokens(m) - imageShare;
    sections[sectionOfMessage(m)] += tokens;
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
  return { prefixTokens, historyTokens, stateTokens, imageTokens, sections };
}

export class RunTelemetry {
  private calls = 0;
  private inputTokens = 0;
  private outputTokens = 0;
  private cachedTokens = 0;
  private estimatedInputTokens = 0;
  private readonly bySource = { system: 0, contextPack: 0, history: 0, state: 0, images: 0 };
  // Fine content-based sections (Phase 12): digest/strategy/conversation are
  // carved out of `history`, taskState out of `state`, so context-engine
  // changes are provable in before/after token terms.
  private readonly bySection: ContextSections = { system: 0, taskState: 0, digest: 0, contextPack: 0, strategy: 0, memory: 0, protected: 0, conversation: 0 };
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
    for (const section of Object.keys(split.sections) as ContextSection[]) {
      this.bySection[section] += split.sections[section]!;
    }
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
      estimatedBySource: {
        system: this.bySection.system,
        contextPack: this.bySection.contextPack,
        history: this.bySource.history,
        state: this.bySection.taskState,
        images: this.bySource.images,
        digest: this.bySection.digest,
        strategy: this.bySection.strategy,
        memory: this.bySection.memory,
        conversation: this.bySection.conversation,
      },
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
  const base =
    `calls=${t.calls} input=${t.inputTokens} cached=${t.cachedTokens} output=${t.outputTokens} ` +
    `~estInput=${t.estimatedInputTokens} (system=${src.system} contextPack=${src.contextPack} taskState=${src.state} ` +
    `digest=${src.digest} strategy=${src.strategy} conversation=${src.conversation} images=${src.images}) ` +
    `planning=${t.planningCalls}c/~${t.estimatedPlanningInput}t execution=${t.executionCalls}c/~${t.estimatedExecutionInput}t ` +
    `compactions=${t.compactions} toolCalls=${t.toolCalls} screenshots=${t.screenshots} wasted=${t.wastedCalls}`;
  if (!t.behavior) return base;
  const b = t.behavior;
  return (
    base +
    ` reads-before-edit=${b.filesReadBeforeFirstEdit ?? '-'} turns-before-edit=${b.turnsBeforeFirstEdit ?? '-'}` +
    ` specialists-before-edit=${b.specialistsBeforeFirstEdit ?? '-'} instruction-blocks=${b.instructionViolationsBlocked ?? 0}` +
    ` images-retained=${b.imagesRetained ?? 0}`
  );
}

/**
 * End-of-run behavior metrics for the target-first & instruction-reliability
 * model: how much was read before the first edit (investigation focus), and
 * how often the deterministic instruction policy blocked a violating tool call.
 */
export function computeBehaviorMetrics(
  actions: { tool: string; status: string; paramsSummary?: string; observation?: string }[],
  activeVisualRefCount: number,
): NonNullable<TokenTelemetrySnapshot['behavior']> {
  const firstEditIndex = actions.findIndex((a) => (a.tool === 'write_file' || a.tool === 'apply_edit') && a.status === 'success');
  const before = firstEditIndex >= 0 ? actions.slice(0, firstEditIndex) : [];
  return {
    filesReadBeforeFirstEdit:
      firstEditIndex >= 0
        ? new Set(before.filter((a) => a.tool === 'read_file' && a.status === 'success').map((a) => a.paramsSummary ?? '')).size
        : undefined,
    turnsBeforeFirstEdit: firstEditIndex >= 0 ? firstEditIndex : undefined,
    specialistsBeforeFirstEdit: firstEditIndex >= 0 ? before.filter((a) => a.tool === 'delegate' && a.status === 'success').length : undefined,
    instructionViolationsBlocked: actions.filter((a) => a.status === 'denied' && (a.observation ?? '').includes('user instruction policy')).length,
    imagesRetained: activeVisualRefCount,
  };
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
