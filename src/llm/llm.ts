import { outputCapabilityFor, resolveOutputBudgetTokens, type OutputBudgetCapability } from './output-budget.js';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | LlmContentPart[];
  /**
   * Provider-native reasoning trace that accompanied THIS assistant message.
   * DeepSeek's thinking mode (and several OpenAI-compatible reasoning
   * providers) require the original `reasoning_content` to be echoed back on
   * every subsequent request that carries `tools`; suppressing it makes the
   * provider return HTTP 400. Adapters translate it to their own wire field
   * (e.g. `reasoning_content`) and only send it when the provider actually
   * supplied it — generic endpoints never see it.
   */
  reasoningContent?: string;
  /** Normalized native tool calls issued by THIS assistant message. Echoed
   *  back on the wire so the model can continue its own loop across turns. */
  toolCalls?: LlmToolCall[];
}

export type LlmContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface LlmOptions {
  temperature?: number;
  json?: boolean;
  effort?: 'low' | 'medium' | 'high' | 'max';
  signal?: AbortSignal;
  /**
   * Max retries for a single transport call. The Agent Gitu resilience
   * coordinator owns production retries, so this deliberately defaults to 0.
   * It remains configurable for callers that use an LLM client directly.
   */
  retries?: number;
  /** Base backoff delay in ms between retries (doubles each attempt). Defaults to 1000. */
  retryDelayMs?: number;
  /** Called once per request with provider-reported token usage, when available. */
  onUsage?: (usage: LlmUsage) => void;
  /** Called before a mid-stream fallback to complete(): earlier partial deltas
   *  are void and the caller should reset any streamed-prose state. */
  onStreamReset?: () => void;
  /** A stable ID for one logical action-selection request. Never contains a secret. */
  logicalRequestId?: string;
  /** Absolute transport-attempt allowance left for this logical request. */
  maxTransportAttempts?: number;
  /** Preferred wire protocol. `native` is attempted only when tools are supplied. */
  protocolMode?: 'native' | 'structured_text' | 'text';
  /** Provider-neutral function definitions. Provider adapters own wire conversion. */
  tools?: LlmToolDefinition[];
  toolChoice?: 'auto' | 'required' | 'none';
  /**
   * Absolute output-budget request (pre-clamp) for the adaptive recovery path.
   * Ignored by transports that cannot express an output limit or that do not
   * know the model's ceiling — see src/llm/output-budget.ts.
   */
  outputBudgetTokens?: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

export type LlmDeltaHandler = (delta: string) => void;

/** A provider-neutral function tool offered by the Gitu harness. */
export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** A function call normalized from a provider response. */
export interface LlmToolCall {
  id?: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LlmTurnMetadata {
  logicalRequestId?: string;
  providerRequestId?: string;
  retryAfterMs?: number;
  usage?: LlmUsage;
  reasoning?: string;
}

/**
 * The only shapes the agent is allowed to receive from a model. Keeping this
 * a discriminated union prevents ambiguous text + invalid-tool-call states
 * from reaching the executor.
 */
export type LlmTurnResult =
  | { kind: 'tool_calls'; calls: LlmToolCall[]; metadata: LlmTurnMetadata; preamble?: string }
  | { kind: 'text'; text: string; metadata: LlmTurnMetadata }
  | { kind: 'refusal'; reason: string; metadata: LlmTurnMetadata }
  | { kind: 'empty'; metadata: LlmTurnMetadata };

export interface LlmClient {
  readonly name: string;
  /** Process-local cooldown bucket identifier. Never contains the credential itself. */
  readonly rateLimitKey?: string;
  /** Raw thinking trace from the last response, when the provider returns one. */
  lastReasoning?: string;
  complete(messages: LlmMessage[], opts?: LlmOptions): Promise<string>;
  completeStream(messages: LlmMessage[], opts: LlmOptions, onDelta: LlmDeltaHandler): Promise<string>;
  /** Optional structured turn API. Older/custom clients continue through the text adapter. */
  completeTurn?(messages: LlmMessage[], opts?: LlmOptions): Promise<LlmTurnResult>;
  completeTurnStream?(messages: LlmMessage[], opts: LlmOptions, onDelta: LlmDeltaHandler): Promise<LlmTurnResult>;
}

export type LlmErrorKind =
  | 'rate_limit_temporary'
  | 'quota_exhausted'
  | 'billing'
  | 'auth'
  | 'access'
  | 'provider_unavailable'
  | 'streaming_incompatible'
  | 'network'
  | 'tool_protocol_incompatible'
  | 'protocol_error'
  | 'aborted'
  | 'unknown';

export interface LlmErrorDetails {
  kind: LlmErrorKind;
  status?: number;
  retryAfterMs?: number;
  logicalRequestId?: string;
  providerRequestId?: string;
}

export class LlmError extends Error {
  readonly details: LlmErrorDetails;

  constructor(message: string, details: Partial<LlmErrorDetails> = {}) {
    super(message);
    this.name = 'LlmError';
    this.details = { kind: details.kind ?? 'unknown', ...details };
  }
}

/**
 * Adapt legacy text-only clients into the canonical turn protocol. This is
 * intentionally the one compatibility boundary: the executor only needs to
 * understand `LlmTurnResult`, regardless of model/provider response style.
 */
export async function requestLlmTurn(
  client: LlmClient,
  messages: LlmMessage[],
  opts: LlmOptions = {},
  onDelta?: LlmDeltaHandler,
): Promise<LlmTurnResult> {
  if (onDelta && client.completeTurnStream) return client.completeTurnStream(messages, opts, onDelta);
  if (!onDelta && client.completeTurn) return client.completeTurn(messages, opts);
  const text = onDelta
    ? await client.completeStream(messages, opts, onDelta)
    : await client.complete(messages, opts);
  return text.trim()
    ? { kind: 'text', text, metadata: { logicalRequestId: opts.logicalRequestId, reasoning: client.lastReasoning } }
    : { kind: 'empty', metadata: { logicalRequestId: opts.logicalRequestId, reasoning: client.lastReasoning } };
}

export type EffortLevel = 'low' | 'medium' | 'high' | 'max';

/**
 * DashScope's compatible mode exposes real effort budgets (thinking tokens),
 * so every level is genuinely distinct.  Generic OpenAI-compatible endpoints
 * only accept reasoning_effort low|medium|high; "max" collapses to "high"
 * there. DeepSeek's compatible API supports a distinct max effort and a
 * thinking-mode switch. Exported so the UI can label levels honestly per
 * provider.
 */
export type EffortStyle = 'dashscope' | 'deepseek' | 'openai';

export const DASHSCOPE_THINKING_BUDGETS: Record<EffortLevel, number> = {
  low: 1024,
  medium: 4096,
  high: 16384,
  max: 38912,
};

export function effortStyleFor(baseUrl: string): EffortStyle {
  if (/aliyuncs|dashscope/i.test(baseUrl)) return 'dashscope';
  if (/api\.deepseek\.com(?:\/|$)/i.test(baseUrl)) return 'deepseek';
  return 'openai';
}

/** The wire-level value for an effort level on a given provider style. */
export function effortWireValue(effort: EffortLevel, style: EffortStyle): string {
  if (style === 'dashscope') return effort;
  // DeepSeek accepts low/high/max. Its API maps the compatibility value
  // "medium" to high, while max remains a distinct effort level.
  if (style === 'deepseek') return effort === 'medium' ? 'high' : effort;
  return effort === 'max' ? 'high' : effort;
}

const LLM_REQUEST_TIMEOUT_MS = 300_000;
const LLM_RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const LLM_DEFAULT_RETRIES = 0;
const LLM_RETRY_BASE_MS = 1_000;

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  if (!signal) return timeout;
  const agg = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (agg) return agg([signal, timeout]);
  // Fallback for runtimes without AbortSignal.any (Node < 20.3): forward abort
  // manually so the hard request timeout ALWAYS applies instead of silently
  // degrading to socket timeouts.
  const controller = new AbortController();
  const forwardCallerAbort = (): void => controller.abort(signal.reason);
  if (signal.aborted) {
    controller.abort(signal.reason);
    return controller.signal;
  }
  signal.addEventListener('abort', forwardCallerAbort, { once: true });
  timeout.addEventListener(
    'abort',
    () => {
      signal.removeEventListener('abort', forwardCallerAbort);
      controller.abort(timeout.reason);
    },
    { once: true },
  );
  return controller.signal;
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('LLM request aborted'));
      return;
    }
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

function responseErrorParts(text: string): { message: string; type: string } {
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
  return { message, type };
}

function retryAfterMs(headers?: Headers): number | undefined {
  const raw = headers?.get('retry-after')?.trim();
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(120_000, Math.round(seconds * 1000));
  const date = Date.parse(raw);
  return Number.isFinite(date) && date > Date.now() ? Math.min(120_000, date - Date.now()) : undefined;
}

/** Classify provider failures once, so retry/fallback policy never parses prose. */
export function classifyLlmHttpError(status: number, text: string, headers?: Headers): LlmError {
  const { message, type } = responseErrorParts(text);
  const retryAfter = retryAfterMs(headers);
  const lower = `${type} ${message}`.toLowerCase();
  const details = { status, retryAfterMs: retryAfter };
  if (
    type === 'FreeUsageLimitError' ||
    /free[- ]?(models?|usage)[- ]?(per|limit)|daily (?:quota|limit)|quota (?:exceeded|exhausted)|insufficient[_ -]quota/.test(lower)
  ) {
    return new LlmError(`LLM rate limited (HTTP ${status}): quota exhausted — ${message} — try again later, choose another configured model, or add capacity`, {
      ...details,
      kind: 'quota_exhausted',
    });
  }
  if (type === 'CreditsError' || /insufficient balance|no credits|billing|payment required/.test(lower)) {
    return new LlmError(`LLM HTTP ${status} (no credits): ${message} — this is a paid model; add credits or a subscription`, {
      ...details,
      kind: 'billing',
    });
  }
  if (status === 401 || /invalid[ _-]api[ _-]?key|unauthorized|authentication/.test(lower)) {
    return new LlmError(`LLM HTTP ${status} (authentication failed): ${message}`, { ...details, kind: 'auth' });
  }
  if (status === 403 || /access.*denied|not eligible|opt in|permission/.test(lower)) {
    return new LlmError(`LLM HTTP ${status} (model not available to you): ${message} — switch to a model your plan includes (free ones are marked "free")`, {
      ...details,
      kind: 'access',
    });
  }
  // Reasoning-state 400s (e.g. DeepSeek's thinking mode requires the previous
  // reasoning_content to be echoed when tools are carried) are NOT "tools are
  // unsupported": they mean the request state is wrong, not the protocol.
  // Classify them distinctly so the agent keeps native tool calling and
  // surfaces the fixable error instead of silently downgrading to JSON text.
  if (status === 400 && /reasoning_content|chain[- ]of[- ]thought/.test(lower)) {
    return new LlmError(`LLM protocol error (HTTP 400): ${message} — the provider rejected the thinking/tool state, not the tool protocol`, {
      ...details,
      kind: 'protocol_error',
    });
  }
  if (status === 400 && /(?:tool|function|schema|response_format|json schema|tool_choice)/.test(lower)) {
    return new LlmError(`LLM tool protocol is incompatible (HTTP 400): ${message}`, {
      ...details,
      kind: 'tool_protocol_incompatible',
    });
  }
  if (status === 429 || /rate[- ]limit|too many requests|overloaded/.test(lower)) {
    return new LlmError(`LLM rate limited (HTTP 429): ${message} — retrying is safe only after the provider cooldown`, {
      ...details,
      kind: 'rate_limit_temporary',
    });
  }
  if ([500, 502, 503, 504].includes(status) || type === 'server_error' || /unavailable|bad gateway|internal server error/.test(lower)) {
    return new LlmError(`LLM HTTP ${status} (upstream unavailable): ${message} — try again later or use a configured fallback`, { ...details, kind: 'provider_unavailable' });
  }
  return new LlmError(`LLM HTTP ${status}: ${message}`, details);
}

export function llmErrorMessage(status: number, text: string): string {
  const { message, type } = responseErrorParts(text);
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
    let networkError: Error | undefined;
    try {
      res = await fetch(`${opts.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${opts.apiKey}`,
        },
        body: JSON.stringify(opts.body),
        signal: withTimeout(opts.signal, LLM_REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      // Abort is a deliberate cancel — never retried.
      if (opts.signal?.aborted || /abort/i.test((err as Error)?.message ?? '')) throw err;
      networkError = err as Error;
    }
    if (!networkError) {
      if (!LLM_RETRYABLE_STATUS.has(res!.status) || attempt === maxRetries) return res!;
      // Respect server rate-limit hints when provided.
      const delay = computeBackoffMs(attempt, baseDelay, retryAfterMs(res!.headers));
      await sleep(delay, opts.signal);
      continue;
    }
    if (attempt === maxRetries) throw networkError;
    const delay = computeBackoffMs(attempt, baseDelay);
    await sleep(delay, opts.signal);
  }
  return res!;
}

/** Network-level failures worth retrying (vs auth/protocol errors). */
export function isRetryableNetworkError(err: Error | undefined): boolean {
  if (!err) return false;
  const code = (err as NodeJS.ErrnoException).code ?? '';
  return (
    ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code) ||
    /fetch failed|network|socket|timeout|timed out|premature close|connection (reset|refused|closed)|econnreset|econnrefused|etimedout|eai_again|enotfound|epipe|ehostunreach|enetunreach/i.test(err.message)
  );
}

/** Jittered exponential backoff; Retry-After is a minimum, never shortened. */
export function computeBackoffMs(attempt: number, baseDelayMs: number, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined) {
    const minimum = Math.min(retryAfterMs, 120_000);
    return Math.max(250, Math.round(minimum * (1 + Math.random() * 0.25)));
  }
  const cap = Math.min(baseDelayMs * 2 ** attempt, 30_000);
  return Math.max(250, Math.round(cap * (0.75 + Math.random() * 0.5)));
}

export interface OpenAiCompatConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  rateLimitKey?: string;
  /** The model's known maximum output tokens (e.g. from the model catalog). */
  modelMaxOutputTokens?: number;
}

type CompatMessage = {
  content?: string | null;
  reasoning_content?: string;
  refusal?: string;
  tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
};

function objectArguments(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function normalizeCompatTurn(message: CompatMessage | undefined, opts: LlmOptions, usage?: LlmUsage): LlmTurnResult {
  const metadata: LlmTurnMetadata = {
    logicalRequestId: opts.logicalRequestId,
    usage,
    reasoning: typeof message?.reasoning_content === 'string' ? message.reasoning_content : undefined,
  };
  const calls = (message?.tool_calls ?? [])
    .map((call): LlmToolCall | undefined => {
      const name = call.function?.name;
      return typeof name === 'string' && name ? { id: call.id, name, arguments: objectArguments(call.function?.arguments) } : undefined;
    })
    .filter((call): call is LlmToolCall => Boolean(call));
  if (calls.length > 0) {
    const preamble = typeof message?.content === 'string' && message.content.trim() ? message.content : undefined;
    return { kind: 'tool_calls', calls, metadata, ...(preamble ? { preamble } : {}) };
  }
  if (typeof message?.refusal === 'string' && message.refusal.trim()) return { kind: 'refusal', reason: message.refusal, metadata };
  if (typeof message?.content === 'string' && message.content.trim()) return { kind: 'text', text: message.content, metadata };
  return { kind: 'empty', metadata };
}

function turnAsText(turn: LlmTurnResult): string {
  if (turn.kind === 'text') return turn.text;
  if (turn.kind === 'refusal') return turn.reason;
  if (turn.kind === 'tool_calls') return turn.preamble ?? '';
  return '';
}

export class OpenAiCompatClient implements LlmClient {
  readonly name: string;
  readonly rateLimitKey?: string;
  lastReasoning?: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly modelMaxOutputTokens: number | undefined;
  private readonly outputCapability: OutputBudgetCapability;

  constructor(config: OpenAiCompatConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? 'https://api.openai.com/v1').replace(/\/$/, '');
    this.model = config.model ?? 'gpt-4.1-mini';
    this.name = `openai-compat:${this.model}`;
    this.rateLimitKey = config.rateLimitKey;
    this.modelMaxOutputTokens = config.modelMaxOutputTokens;
    this.outputCapability = outputCapabilityFor(effortStyleFor(this.baseUrl), this.model);
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

  async completeTurn(messages: LlmMessage[], opts: LlmOptions = {}): Promise<LlmTurnResult> {
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
      const aborted = opts.signal?.aborted || /abort/i.test((err as Error).message);
      throw new LlmError(`LLM request failed: ${(err as Error).message}`, { kind: aborted ? 'aborted' : 'network', logicalRequestId: opts.logicalRequestId });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const error = classifyLlmHttpError(res.status, text, res.headers);
      throw new LlmError(error.message, { ...error.details, logicalRequestId: opts.logicalRequestId, providerRequestId: res.headers.get('x-request-id') ?? undefined });
    }
    const data = (await res.json()) as { choices?: { message?: CompatMessage }[]; usage?: unknown; id?: string };
    const usage = parseUsage(data.usage);
    if (usage && opts.onUsage) opts.onUsage(usage);
    const turn = normalizeCompatTurn(data.choices?.[0]?.message, opts, usage);
    turn.metadata.providerRequestId = typeof data.id === 'string' ? data.id : undefined;
    this.lastReasoning = turn.metadata.reasoning;
    return turn;
  }

  async complete(messages: LlmMessage[], opts: LlmOptions = {}): Promise<string> {
    return turnAsText(await this.completeTurn(messages, opts));
  }

  private buildBody(messages: LlmMessage[], opts: LlmOptions, stream: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((message) => this.toWireMessage(message)),
      temperature: opts.temperature ?? 0.2,
    };
    if (stream) {
      body['stream'] = true;
      if (opts.onUsage) body['stream_options'] = { include_usage: true };
    }
    if (opts.json) body['response_format'] = { type: 'json_object' };
    if (opts.protocolMode === 'native' && opts.tools && opts.tools.length > 0) {
      body['tools'] = opts.tools.map((tool) => ({
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.parameters },
      }));
      body['tool_choice'] = opts.toolChoice ?? 'auto';
    }
    if (opts.effort) {
      const style = effortStyleFor(this.baseUrl);
      if (style === 'dashscope') {
        body['enable_thinking'] = opts.effort !== 'low';
        body['thinking_budget'] = DASHSCOPE_THINKING_BUDGETS[opts.effort];
      } else if (style === 'deepseek') {
        // DeepSeek thinking is enabled by default, but make it explicit so
        // direct-API requests retain the requested reasoning effort across
        // provider changes and compatible SDK implementations.
        body['thinking'] = { type: 'enabled' };
        body['reasoning_effort'] = effortWireValue(opts.effort, 'deepseek');
      } else {
        body['reasoning_effort'] = effortWireValue(opts.effort, 'openai');
      }
    }
    // UniversalOutputBudgetPolicy: reserve room for the final action when
    // reasoning shares the completion budget, clamped to the model's known
    // ceiling. Unknown ceiling → no field at all (never guess aggressively).
    const budgetTokens = resolveOutputBudgetTokens({
      effort: opts.effort,
      capability: this.outputCapability,
      overrideTokens: opts.outputBudgetTokens,
      modelMaxOutputTokens: this.modelMaxOutputTokens,
    });
    if (budgetTokens !== undefined) {
      body[this.outputCapability.field] = budgetTokens;
    }
    return body;
  }

  /**
   * Translate internal message records into the provider's wire shape. The
   * internal carrier fields (reasoningContent / toolCalls) are NOT valid chat
   * fields — without this mapping the raw objects would leak camelCase keys
   * onto the wire and get rejected. Assistant history keeps its reasoning
   * trace and tool calls so provider thinking loops (DeepSeek thinking + tools)
   * receive the state they require across turns.
   */
  private toWireMessage(message: LlmMessage): Record<string, unknown> {
    const wire: Record<string, unknown> = { role: message.role, content: message.content };
    if (message.role === 'assistant') {
      if (message.reasoningContent) wire['reasoning_content'] = message.reasoningContent;
      if (message.toolCalls?.length) {
        wire['tool_calls'] = message.toolCalls.map((call) => ({
          id: call.id ?? `call_${Math.random().toString(36).slice(2, 10)}`,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        }));
      }
    }
    return wire;
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
      const aborted = opts.signal?.aborted || /abort/i.test((err as Error).message);
      throw new LlmError(`LLM request failed: ${(err as Error).message}`, { kind: aborted ? 'aborted' : 'network', logicalRequestId: opts.logicalRequestId });
    }
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '');
      if (!res.ok) {
        const error = classifyLlmHttpError(res.status, text, res.headers);
        throw new LlmError(error.message, { ...error.details, logicalRequestId: opts.logicalRequestId, providerRequestId: res.headers.get('x-request-id') ?? undefined });
      }
      // A logical request is governed by the shared resilience coordinator.
      // Do not hide another HTTP call here: doing so would make the coordinator
      // unable to enforce its absolute transport-attempt budget. The caller can
      // explicitly downgrade this one request to non-streaming mode instead.
      if (opts.logicalRequestId) {
        throw new LlmError('LLM streaming is not supported by this endpoint', {
          kind: 'streaming_incompatible',
          logicalRequestId: opts.logicalRequestId,
        });
      }
      // Direct legacy callers retain the historical convenience fallback.
      return this.complete(messages, opts);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    let reasoning = '';
    let streamUsage: LlmUsage | undefined;
    let sawEvent = false;
    let streamFailed = false;
    let forwardedAnyDelta = false;
    // One SSE line = one `data:` event. Shared by the chunked loop and the
    // end-of-stream flush so the FINAL event is parsed even when the stream
    // closes without a trailing newline (proxies do this) — its bytes are the
    // tail of the response, e.g. the closing braces of a JSON action.
    const handleLine = (rawLine: string): void => {
      const line = rawLine.trim();
      if (!line.startsWith('data:')) return;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') {
        sawEvent = true;
        return;
      }
      try {
        const json = JSON.parse(payload) as {
          choices?: { delta?: { content?: string; reasoning_content?: string }; message?: { content?: string } }[];
          usage?: unknown;
        };
        sawEvent = true;
        const delta = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? '';
        if (delta) {
          full += delta;
          onDelta(delta);
          forwardedAnyDelta = true;
        }
        const reasonDelta = json.choices?.[0]?.delta?.reasoning_content;
        if (reasonDelta) reasoning += reasonDelta;
        const chunkUsage = parseUsage(json.usage);
        if (chunkUsage) streamUsage = chunkUsage;
      } catch {
        /* partial line */
      }
    };
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          handleLine(line);
        }
      }
      // Flush the decoder's pending multi-byte sequence, then the final
      // unterminated line if any.
      buffer += decoder.decode();
      if (buffer.trim()) handleLine(buffer);
    } catch {
      // The connection died mid-stream; the content we already forwarded is
      // unreliable, so retry as a single completion instead of returning a
      // truncated answer.
      streamFailed = true;
    }
    if (streamFailed || !sawEvent) {
      // Only fall back when the stream itself was broken or unsupported.  A
      // healthy stream that produced reasoning-only or empty content must NOT
      // trigger a second (paid) completion request.
      // If partial deltas were already delivered, tell the caller so it can
      // reset its streamed-prose state — otherwise the full text from the
      // fallback overlaps what the user already saw.
      if (forwardedAnyDelta) opts.onStreamReset?.();
      if (opts.logicalRequestId) {
        throw new LlmError('LLM streaming response was incomplete or unsupported', {
          kind: 'streaming_incompatible',
          logicalRequestId: opts.logicalRequestId,
        });
      }
      return this.complete(messages, opts);
    }
    this.lastReasoning = reasoning || undefined;
    if (streamUsage && opts.onUsage) opts.onUsage(streamUsage);
    return full;
  }

  async completeTurnStream(
    messages: LlmMessage[],
    opts: LlmOptions = {},
    onDelta: LlmDeltaHandler,
  ): Promise<LlmTurnResult> {
    // Chat-completions tool-call deltas vary materially between compatible
    // providers. A single non-stream native request gives the normalizer a
    // complete call object; text/JSON compatibility retains live prose.
    if (opts.protocolMode === 'native' && opts.tools?.length) return this.completeTurn(messages, opts);
    const text = await this.completeStream(messages, opts, onDelta);
    return text.trim()
      ? { kind: 'text', text, metadata: { logicalRequestId: opts.logicalRequestId, reasoning: this.lastReasoning } }
      : { kind: 'empty', metadata: { logicalRequestId: opts.logicalRequestId, reasoning: this.lastReasoning } };
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

  get rateLimitKey(): string | undefined {
    return this.inner.rateLimitKey;
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

  async completeTurn(messages: LlmMessage[], opts: LlmOptions = {}): Promise<LlmTurnResult> {
    let seen = false;
    const tracked = {
      ...opts,
      onUsage: (usage: LlmUsage) => {
        seen = true;
        this.onCall(usage);
      },
    };
    const out = this.inner.completeTurn
      ? await this.inner.completeTurn(messages, tracked)
      : await requestLlmTurn(this.inner, messages, tracked);
    if (!seen) this.onCall(out.metadata.usage);
    return out;
  }

  async completeTurnStream(messages: LlmMessage[], opts: LlmOptions = {}, onDelta: LlmDeltaHandler): Promise<LlmTurnResult> {
    let seen = false;
    const tracked = {
      ...opts,
      onUsage: (usage: LlmUsage) => {
        seen = true;
        this.onCall(usage);
      },
    };
    const out = this.inner.completeTurnStream
      ? await this.inner.completeTurnStream(messages, tracked, onDelta)
      : await requestLlmTurn(this.inner, messages, tracked, onDelta);
    if (!seen) this.onCall(out.metadata.usage);
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
  // Fenced blocks win when present.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      /* fall through */
    }
  }
  // Scan every opening brace and take the EARLIEST balanced, parseable
  // object. A naive first-{ to last-} slice breaks whenever prose mentions
  // braces ("config uses {a}: 1") before the real action object.
  for (let start = trimmed.indexOf('{'); start >= 0; start = trimmed.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            return JSON.parse(trimmed.slice(start, i + 1));
          } catch {
            break; // this span is not JSON — try the next opening brace
          }
        }
      }
    }
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

/**
 * Aggressive fallback extraction for protocol-drifted replies: reasoning
 * models narrate with braces before the real action, so the action is the
 * structured object that CLOSES LAST. Scans every balanced span and keeps the
 * parseable one with the greatest end offset (outermost wins ties, because a
 * nested span always closes earlier than its parent).
 */
export function extractLastJsonObject(text: string): unknown {
  const trimmed = text.trim();
  let best: { end: number; value: unknown } | undefined;
  for (let start = trimmed.indexOf('{'); start >= 0; start = trimmed.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            const value = JSON.parse(trimmed.slice(start, i + 1));
            if (!best || i > best.end) best = { end: i, value };
          } catch {
            /* this span is not JSON */
          }
          break;
        }
      }
    }
  }
  return best?.value;
}
