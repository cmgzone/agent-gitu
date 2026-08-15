export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmOptions {
  temperature?: number;
  json?: boolean;
}

export interface LlmClient {
  readonly name: string;
  complete(messages: LlmMessage[], opts?: LlmOptions): Promise<string>;
}

export class LlmError extends Error {}

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
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: opts.temperature ?? 0.2,
    };
    if (opts.json) body['response_format'] = { type: 'json_object' };

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
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
}

export class ScriptedMockLlm implements LlmClient {
  readonly name = 'mock';
  private call = 0;

  constructor(private readonly responses: ((call: number, messages: LlmMessage[]) => string)[]) {}

  async complete(messages: LlmMessage[]): Promise<string> {
    const fn = this.responses[Math.min(this.call, this.responses.length - 1)];
    this.call += 1;
    return fn ? fn(this.call - 1, messages) : JSON.stringify({ thought: 'nothing left', action: { type: 'request_block', reason: 'script exhausted' } });
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
