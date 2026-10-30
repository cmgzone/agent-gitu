/**
 * The text-only client for the ChatGPT subscription.
 *
 * An agent turn runs through `PiNativeRuntime`. Everything else that needs one
 * model answer outside a turn (summaries, titles, classification) calls
 * `complete()`, and for the subscription that is this client: one pi model
 * request with no tools, authenticated by the stored ChatGPT sign-in.
 */
import { LlmError, type LlmClient, type LlmContentPart, type LlmDeltaHandler, type LlmMessage, type LlmOptions } from './llm.js';
import type { NativeTaskRuntime } from './native-task.js';
import { CHATGPT_PI_PROVIDER, piModelRuntime } from './pi-chatgpt.js';
import { classifyPiError, thinkingLevelFor } from './pi-native.js';

function contentText(content: string | LlmContentPart[]): string {
  if (typeof content === 'string') return content;
  return content.map((part) => (part.type === 'text' ? part.text : '')).filter(Boolean).join('\n');
}

function imagesOf(content: string | LlmContentPart[]): { type: 'image'; mimeType: string; data: string }[] {
  if (typeof content === 'string') return [];
  return content.flatMap((part) => {
    if (part.type !== 'image_url') return [];
    const match = /^data:([^;,]+);base64,(.*)$/s.exec(part.image_url.url);
    return match?.[1] && match[2] !== undefined ? [{ type: 'image' as const, mimeType: match[1], data: match[2] }] : [];
  });
}

/** One user message: a lone prompt as is, a longer exchange as a labelled transcript. */
export function subscriptionUserTurn(messages: LlmMessage[]): { text: string; images: ReturnType<typeof imagesOf> } {
  const turns = messages.filter((message) => message.role !== 'system');
  const images = turns.flatMap((message) => imagesOf(message.content));
  if (turns.length === 1 && turns[0]!.role === 'user') return { text: contentText(turns[0]!.content), images };
  const text = turns
    .map((message) => `${message.role === 'tool' ? 'Tool result' : message.role === 'assistant' ? 'Assistant' : 'User'}:\n${contentText(message.content)}`)
    .join('\n\n');
  return { text: text || 'Continue with the next required response.', images };
}

export class PiSubscriptionClient implements LlmClient {
  readonly name: string;
  readonly rateLimitKey = 'chatgpt:subscription:chat';
  nativeTask?: NativeTaskRuntime;
  lastReasoning?: string;

  constructor(private readonly model: string) {
    this.name = `chatgpt-subscription:${model}`;
  }

  async complete(messages: LlmMessage[], opts: LlmOptions = {}): Promise<string> {
    this.lastReasoning = undefined;
    if (opts.signal?.aborted) throw new LlmError('The model request was stopped by the user.', { kind: 'aborted' });
    try {
      const runtime = await piModelRuntime();
      if (!(await runtime.listCredentials()).some((credential) => credential.providerId === CHATGPT_PI_PROVIDER)) {
        throw new LlmError('Sign in to ChatGPT in Settings → Providers to use your subscription.', { kind: 'auth' });
      }
      const model = runtime.getModel(CHATGPT_PI_PROVIDER, this.model);
      if (!model) throw new LlmError(`The model "${this.model}" is not part of the ChatGPT subscription catalog.`, { kind: 'provider_unavailable' });

      const system = messages.filter((message) => message.role === 'system').map((message) => contentText(message.content));
      if (opts.json) system.push('Reply with a single valid JSON value and nothing else.');
      const turn = subscriptionUserTurn(messages);
      const response = await runtime.completeSimple(
        model,
        {
          ...(system.length ? { systemPrompt: system.join('\n\n') } : {}),
          messages: [
            {
              role: 'user',
              content: turn.images.length ? [{ type: 'text', text: turn.text }, ...turn.images] : turn.text,
              timestamp: Date.now(),
            },
          ],
        },
        { signal: opts.signal, reasoning: thinkingLevelFor(opts.effort) },
      );

      if (response.stopReason === 'error') throw new Error(response.errorMessage || 'The model request failed.');
      if (response.stopReason === 'aborted') throw new LlmError('The model request was stopped by the user.', { kind: 'aborted' });
      if (response.usage) {
        opts.onUsage?.({
          inputTokens: response.usage.input ?? 0,
          outputTokens: response.usage.output ?? 0,
          cachedTokens: (response.usage.cacheRead ?? 0) + (response.usage.cacheWrite ?? 0),
        });
      }
      const reasoning = response.content.map((part) => (part.type === 'thinking' ? (part.thinking ?? '') : '')).join('');
      if (reasoning) this.lastReasoning = reasoning;
      return response.content.map((part) => (part.type === 'text' ? (part.text ?? '') : '')).join('');
    } catch (error) {
      if (opts.signal?.aborted) throw new LlmError('The model request was stopped by the user.', { kind: 'aborted' });
      throw classifyPiError(error, CHATGPT_PI_PROVIDER);
    }
  }

  /** Outside an agent turn the answer arrives whole; it is delivered as one delta. */
  async completeStream(messages: LlmMessage[], opts: LlmOptions, onDelta: LlmDeltaHandler): Promise<string> {
    const text = await this.complete(messages, opts);
    if (text) {
      opts.onActivity?.({ type: 'content' });
      onDelta(text);
    }
    return text;
  }
}
