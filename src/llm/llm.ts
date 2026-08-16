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
}

export type LlmDeltaHandler = (delta: string) => void;

export interface LlmClient {
  readonly name: string;
  complete(messages: LlmMessage[], opts?: LlmOptions): Promise<string>;
  completeStream(messages: LlmMessage[], opts: LlmOptions, onDelta: LlmDeltaHandler): Promise<string>;
}

export class LlmError extends Error {}

const LLM_REQUEST_TIMEOUT_MS = 300_000;

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  if (!signal) return timeout;
  const agg = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  return agg ? agg([signal, timeout]) : signal;
}

export interface OpenAiCompatConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export class OpenAiCompatClient implements LlmClient {
  readonly name: string;
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
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: withTimeout(opts.signal, LLM_REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new LlmError(`LLM request failed: ${(err as Error).message}`);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new LlmError(`LLM HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
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
    if (stream) body['stream'] = true;
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
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: withTimeout(opts.signal, LLM_REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new LlmError(`LLM request failed: ${(err as Error).message}`);
    }
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      if (!res.ok) throw new LlmError(`LLM HTTP ${res.status}: ${text.slice(0, 300)}`);
      return this.complete(messages, opts);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
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
            choices?: { delta?: { content?: string }; message?: { content?: string } }[];
          };
          const delta = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? '';
          if (delta) {
            full += delta;
            onDelta(delta);
          }
        } catch {
          /* partial line */
        }
      }
    }
    if (!full) return this.complete(messages, opts);
    return full;
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
