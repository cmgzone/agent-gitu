import { requestLlmTurn, type LlmClient, type LlmMessage, type LlmOptions, type LlmDeltaHandler, type LlmUsage, type LlmTurnResult } from '../llm/llm.js';
import type { CompanyStore } from './store.js';
import type { CompanyPricing } from './pricing.js';

export class CompanyLlm implements LlmClient {
  private readonly version: number;
  constructor(
    private readonly inner: LlmClient,
    private readonly store: CompanyStore,
    private readonly identity: { companyId: string; agentId: string; taskId?: string; meetingId?: string; meetingTurnId?: string; provider: string; model: string },
    private readonly price: (usage: LlmUsage) => number | undefined,
    private readonly pricing?: CompanyPricing,
    private readonly validateAttempt: () => void = () => {},
  ) {
    this.version = store.get(identity.companyId)?.directionVersion ?? 0;
  }
  get name(): string {
    return this.inner.name;
  }
  get rateLimitKey(): string | undefined {
    return this.inner.rateLimitKey;
  }
  get lastReasoning(): string | undefined {
    return this.inner.lastReasoning;
  }
  private async call<T>(messages: LlmMessage[], options: LlmOptions | undefined, work: (options: LlmOptions) => Promise<T>): Promise<T> {
    this.validateAttempt();
    options?.signal?.throwIfAborted();
    if (this.store.get(this.identity.companyId)?.directionVersion !== this.version)
      throw new Error('Company direction changed. Start the next model attempt from the latest work.');
    const outputTokens = options?.outputBudgetTokens ?? 8192;
    if (!Number.isSafeInteger(outputTokens) || outputTokens <= 0) throw new Error('Choose a positive output token limit for this company model attempt.');
    const images = messages.some((message) => Array.isArray(message.content) && message.content.some((part) => part.type === 'image_url'));
    const company = this.store.get(this.identity.companyId);
    const finiteMeeting = this.identity.meetingId && this.store.read<{ budgetUsd: number | null }>('meeting', this.identity.meetingId)?.budgetUsd !== null;
    if (images && (company?.monthlyBudgetUsd !== null || finiteMeeting) && !this.pricing?.maxInputTokens)
      throw new Error('This model has no usable image-input reservation ceiling. Choose a model with a known input limit before using images with a finite budget.');
    const inputTokens =
      images && this.pricing?.maxInputTokens
        ? this.pricing.maxInputTokens
        : Buffer.byteLength(JSON.stringify({ messages, tools: options?.tools }), 'utf8') + messages.length * 50 + 256;
    const estimate = this.price({
      inputTokens,
      outputTokens,
      cachedTokens: this.pricing && this.pricing.cachedInputPricePerMillion > this.pricing.inputPricePerMillion ? inputTokens : 0,
    });
    const id = this.store.reserve(this.identity.companyId, estimate, { ...this.identity, pricing: this.pricing });
    let usage: LlmUsage | undefined;
    let completed = false;
    try {
      const result = await work({
        ...options,
        retries: 0,
        logicalRequestId: options?.logicalRequestId ?? id,
        maxTransportAttempts: 1,
        outputBudgetTokens: options?.outputBudgetTokens ?? 8192,
        requireOutputLimit: true,
        onUsage: (info) => {
          usage = info;
          options?.onUsage?.(info);
        },
      });
      if (result && typeof result === 'object' && 'metadata' in result) usage ??= (result as LlmTurnResult).metadata.usage;
      completed = true;
      return result;
    } finally {
      this.store.recordUsage(id, {
        ...this.identity,
        ...usage,
        pricing: this.pricing,
        costUsd: usage ? this.price(usage) : undefined,
        outcome: completed ? 'completed' : 'failed',
      });
    }
  }
  complete(messages: LlmMessage[], opts?: LlmOptions): Promise<string> {
    return this.call(messages, opts, (o) => this.inner.complete(messages, o));
  }
  completeStream(messages: LlmMessage[], opts: LlmOptions, onDelta: LlmDeltaHandler): Promise<string> {
    return this.call(messages, opts, (o) => this.inner.completeStream(messages, o, onDelta));
  }
  completeTurn(messages: LlmMessage[], opts?: LlmOptions): Promise<LlmTurnResult> {
    return this.call(messages, opts, (o) => (this.inner.completeTurn ? this.inner.completeTurn(messages, o) : requestLlmTurn(this.inner, messages, o)));
  }
  completeTurnStream(messages: LlmMessage[], opts: LlmOptions, onDelta: LlmDeltaHandler): Promise<LlmTurnResult> {
    return this.call(messages, opts, (o) =>
      this.inner.completeTurnStream ? this.inner.completeTurnStream(messages, o, onDelta) : requestLlmTurn(this.inner, messages, o, onDelta),
    );
  }
}
