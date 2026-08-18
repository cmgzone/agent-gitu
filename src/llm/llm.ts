export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | LlmContentPart[];
}

export type LlmContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface LlmOptions {
  temperature?: number;
  json?: boolean;
  effort?: 'low' | 'medium' | 'high' | 'max';
  signal?: AbortSignal;
  /** Max retries for transient HTTP errors (429, 5xx). Defaults to 3. */
  retries?: number;
  /** Base backoff delay in ms between retries (doubles each attempt). Defaults to 1000. */
  retryDelayMs?: number;
  /** Called once per request with provider-reported token usage, when available. */
  onUsage?: (usage: LlmUsage) => void;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

export type LlmDeltaHandler = (delta: string) => void;

export interface LlmClient {
  readonly name: string;
  /** Raw thinking trace from the last response, when the provider returns one. */
  lastReasoning?: string;
  complete(messages: LlmMessage[], opts?: LlmOptions): Promise<string>;
  completeStream(messages: LlmMessage[], opts: LlmOptions, onDelta: LlmDeltaHandler): Promise<string>;
}

export class LlmError extends Error {}

const LLM_REQUEST_TIMEOUT_MS = 300_000;
const LLM_RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const LLM_DEFAULT_RETRIES = 3;
const LLM_RETRY_BASE_MS = 1_000;

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  if (!signal) return timeout;
  const agg = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  return agg ? agg([signal, timeout]) : signal;
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new Error('LLM request aborted'));
        },
        { once: true },
      );
    }
  });
}

function usageNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined;
}

function parseUsage(value: unknown): LlmUsage | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const u = value as Record<string, unknown>;
  const input = usageNumber(u['prompt_tokens']) ?? usageNumber(u['input_tokens']);
  const output = usageNumber(u['completion_tokens']) ?? usageNumber(u['output_tokens']);
  if (input === undefined && output === undefined) return undefined;
  const details = u['prompt_tokens_details'];
  const cached =
    usageNumber(u['cached_tokens']) ??
    (typeof details === 'object' && details !== null ? usageNumber((details as Record<string, unknown>)['cached_tokens']) : undefined) ??
    usageNumber(u['prompt_cache_hit_tokens']);
  return { inputTokens: input ?? 0, outputTokens: output ?? 0, cachedTokens: cached ?? 0 };
}

function llmErrorMessage(status: number, text: string): string {
  const trimmed = text.slice(0, 300);
  let message = trimmed;
  let type = '';
  try {
    const parsed = JSON.parse(text) as { error?: { type?: string; message?: string } };
    if (parsed.error?.message) message = parsed.error.message;
    if (parsed.error?.type) type = parsed.error.type;
  } catch {
    /* keep raw text */
  }
  if (status === 429 || type === 'FreeUsageLimitError' || /rate limit/i.test(message)) {
    return `LLM rate limited (HTTP 429): ${message} — try again later or switch to a less busy model`;
  }
  if (type === 'CreditsError' || /insufficient balance/i.test(message)) {
    return `LLM HTTP ${status} (no credits): ${message} — this is a paid model; add credits or subscribe to use it`;
  }
  if (status === 403 || /access.*denied|not eligible|opt in/i.test(message)) {
    return `LLM HTTP 403 (model not available to you): ${message} — your plan/key can't use this model; switch to a model your plan includes (free ones are marked "free")`;
  }
  if (status === 503 || type === 'server_error' || /unavailable/i.test(message)) {
    return `LLM HTTP 503 (upstream unavailable): ${message} — try again later or pick a different model`;
  }
  return `LLM HTTP ${status}: ${message}`;
}

async function postChatCompletion(opts: {
  baseUrl: string;
  apiKey: string;
  body: Record<string, unknown>;
  signal?: AbortSignal;
  retries?: number;
  retryDelayMs?: number;
}): Promise<Response> {
  const maxRetries = opts.retries ?? LLM_DEFAULT_RETRIES;
  const baseDelay = opts.retryDelayMs ?? LLM_RETRY_BASE_MS;
  let res: Response | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    res = await fetch(`${opts.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify(opts.body),
      signal: withTimeout(opts.signal, LLM_REQUEST_TIMEOUT_MS),
    });
    if (!LLM_RETRYABLE_STATUS.has(res.status) || attempt === maxRetries) return res;
    const delay = Math.min(baseDelay * 2 ** attempt, 8000) + Math.random() * 200;
    await sleep(delay, opts.signal);
  }
  return res!;
}

export interface OpenAiCompatConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export class OpenAiCompatClient implements LlmClient {
  readonly name: string;
  lastReasoning?: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(config: OpenAiCompatConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.model = config.model ?? 'gpt-4.1-mini';
    this.name = `openai-compat:${this.model}`;
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): OpenAiCompatClient | undefined {
    const apiKey = env['HERMES_API_KEY'] ?? env['OPENAI_API_KEY'];
    if (!apiKey) return undefined;
    return new OpenAiCompatClient({
      apiKey,
      baseUrl: env['HERMES_BASE_URL'] ?? env['OPENAI_BASE_URL'],
      model: env['HERMES_MODEL'] ?? env['OPENAI_MODEL'],
    });
  }

  async complete(messages: LlmMessage[], opts: LlmOptions = {}): Promise<string> {
    const body = this.buildBody(messages, opts, false);

    let res: Response;
    try {
      res = await postChatCompletion({
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        body,
        signal: opts.signal,
        retries: opts.retries,
        retryDelayMs: opts.retryDelayMs,
      });
    } catch (err) {
      throw new LlmError(`LLM request failed: ${(err as Error).message}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new LlmError(llmErrorMessage(res.status, text));
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string; reasoning_content?: string } }[];
      usage?: unknown;
    };
    const reasoning = data.choices?.[0]?.message?.reasoning_content;
    this.lastReasoning = typeof reasoning === 'string' && reasoning ? reasoning : undefined;
    if (opts.onUsage) {
      const usage = parseUsage(data.usage);
      if (usage) opts.onUsage(usage);
    }
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new LlmError('LLM returned no content');
    return content;
  }

  private buildBody(messages: LlmMessage[], opts: LlmOptions, stream: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: opts.temperature ?? 0.2,
    };
    if (stream) {
      body['stream'] = true;
      if (opts.onUsage) body['stream_options'] = { include_usage: true };
    }
    if (opts.json) body['response_format'] = { type: 'json_object' };
    if (opts.effort) {
      if (/aliyuncs|dashscope/i.test(this.baseUrl)) {
        body['enable_thinking'] = opts.effort !== 'low';
        const budgets: Record<string, number> = { low: 1024, medium: 4096, high: 16384, max: 38912 };
        body['thinking_budget'] = budgets[opts.effort] ?? 4096;
      } else {
        body['reasoning_effort'] = opts.effort === 'max' ? 'high' : opts.effort;
      }
    }
    return body;
  }

  async completeStream(
    messages: LlmMessage[],
    opts: LlmOptions = {},
    onDelta: LlmDeltaHandler,
  ): Promise<string> {
    const body = this.buildBody(messages, opts, true);
    let res: Response;
    try {
      res = await postChatCompletion({
        baseUrl: this.baseUrl,
        apiKey: this.apiKey,
        body,
        signal: opts.signal,
        retries: opts.retries,
        retryDelayMs: opts.retryDelayMs,
      });
    } catch (err) {
      throw new LlmError(`LLM request failed: ${(err as Error).message}`);
    }
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      if (!res.ok) throw new LlmError(llmErrorMessage(res.status, text));
      return this.complete(messages, opts);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    let reasoning = '';
    let streamUsage: LlmUsage | undefined;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') continue;
        try {
          const json = JSON.parse(payload) as {
            choices?: { delta?: { content?: string; reasoning_content?: string }; message?: { content?: string } }[];
            usage?: unknown;
          };
          const delta = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? '';
          if (delta) {
            full += delta;
            onDelta(delta);
          }
          const reasonDelta = json.choices?.[0]?.delta?.reasoning_content;
          if (reasonDelta) reasoning += reasonDelta;
          const chunkUsage = parseUsage(json.usage);
          if (chunkUsage) streamUsage = chunkUsage;
        } catch {
          /* partial line */
        }
      }
    }
    if (!full) return this.complete(messages, opts);
    this.lastReasoning = reasoning || undefined;
    if (streamUsage && opts.onUsage) opts.onUsage(streamUsage);
    return full;
  }
}

/**
 * Delegates to another client while observing token usage. The callback fires
 * once per request (with undefined when the provider reports no usage), so
 * callers can count messages and accumulate tokens without touching agents.
 */
export class UsageTrackingClient implements LlmClient {
  readonly name: string;

  constructor(
    private readonly inner: LlmClient,
    private readonly onCall: (usage: LlmUsage | undefined) => void,
  ) {
    this.name = inner.name;
  }

  get lastReasoning(): string | undefined {
    return this.inner.lastReasoning;
  }

  async complete(messages: LlmMessage[], opts: LlmOptions = {}): Promise<string> {
    let seen = false;
    const out = await this.inner.complete(messages, {
      ...opts,
      onUsage: (usage) => {
        seen = true;
        this.onCall(usage);
      },
    });
    if (!seen) this.onCall(undefined);
    return out;
  }

  async completeStream(messages: LlmMessage[], opts: LlmOptions = {}, onDelta: LlmDeltaHandler): Promise<string> {
    let seen = false;
    const out = await this.inner.completeStream(
      messages,
      {
        ...opts,
        onUsage: (usage) => {
          seen = true;
          this.onCall(usage);
        },
      },
      onDelta,
    );
    if (!seen) this.onCall(undefined);
    return out;
  }
}

export class ScriptedMockLlm implements LlmClient {
  readonly name = 'mock';
  private call = 0;

  constructor(private readonly responses: ((call: number, messages: LlmMessage[]) => string)[]) {}

  private scripted(messages: LlmMessage[]): string {
    const fn = this.responses[Math.min(this.call, this.responses.length - 1)];
    this.call += 1;
    return fn ? fn(this.call - 1, messages) : JSON.stringify({ thought: 'nothing left', action: { type: 'request_block', reason: 'script exhausted' } });
  }

  async complete(messages: LlmMessage[]): Promise<string> {
    return this.scripted(messages);
  }

  async completeStream(messages: LlmMessage[], _opts: LlmOptions, onDelta: LlmDeltaHandler): Promise<string> {
    const full = this.scripted(messages);
    const chunk = 48;
    for (let i = 0; i < full.length; i += chunk) {
      onDelta(full.slice(i, i + chunk));
      await new Promise((r) => setTimeout(r, 5));
    }
    return full;
  }
}

const XML_CALL_MARKERS = [
  '<dots_function_call',
  '<function_calls',
  '<function_call',
  '<tool_calls',
  '<tool_call',
  '<antml:invoke',
  '<invoke',
  '<json>',
];

export function findXmlCallStart(text: string): number {
  let best = -1;
  for (const marker of XML_CALL_MARKERS) {
    const at = text.indexOf(marker);
    if (at >= 0 && (best < 0 || at < best)) best = at;
  }
  return best;
}

export function xmlMarkerHoldBack(text: string): number {
  let hold = 0;
  for (const marker of XML_CALL_MARKERS) {
    for (let prefix = 1; prefix < marker.length; prefix++) {
      if (text.endsWith(marker.slice(0, prefix))) hold = Math.max(hold, prefix);
    }
  }
  return hold;
}

export function parseXmlFunctionCall(text: string): Record<string, unknown> | undefined {
  const start = findXmlCallStart(text);
  if (start < 0) return undefined;
  const block = text.slice(start);
  const invoke = block.match(/<(?:[\w]+:)?(?:invoke|function|function_call|tool_call|tool)\s+name\s*=\s*"([^"]+)"[^>]*>([\s\S]*)/i);
  if (!invoke || !invoke[1] || invoke[2] === undefined) return undefined;
  const name = invoke[1];
  const body = invoke[2] as string;
  const params: Record<string, unknown> = {};
  const paramRe = /<(?:[\w]+:)?parameter\s+name\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/(?:[\w]+:)?parameter\s*>/gi;
  let match: RegExpExecArray | null;
  while ((match = paramRe.exec(body))) {
    if (!match[1] || match[2] === undefined) continue;
    const key = match[1];
    const rawValue = (match[2] as string).trim();
    try {
      params[key] = JSON.parse(rawValue);
    } catch {
      params[key] = rawValue;
    }
  }
  if (Object.keys(params).length === 0) {
    const bare = body.replace(/<\/(?:[\w]+:)?(?:invoke|function|function_call|tool_call|tool)\s*>[\s\S]*$/, '').trim();
    if (bare) {
      try {
        const parsed = JSON.parse(bare) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return { type: name, ...(parsed as Record<string, unknown>) };
        }
      } catch {
        return undefined;
      }
    }
    return undefined;
  }
  return { type: name, ...params };
}

export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const candidates: string[] = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) candidates.unshift(fenced[1].trim());
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.unshift(trimmed.slice(firstBrace, lastBrace + 1));
  }
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      /* try next */
    }
  }
  return undefined;
}
