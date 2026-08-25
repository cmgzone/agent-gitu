import { OpenAiCompatClient, type LlmClient } from './llm.js';
import { mergedEnv } from './keys.js';
import { createEmbedder, type Embedder } from '../context/embeddings.js';

/**
 * Resolve an embeddings-capable client from the SAME provider configuration
 * the chat LLM uses. Entirely optional: returns undefined when no key/baseUrl
 * is configured, and memoizes endpoint failures so a provider without an
 * embeddings route disables semantic retrieval for the process instead of
 * retrying on every run.
 */
let embedderDisabled = false;
export function resolveEmbedder(): Embedder | undefined {
  if (embedderDisabled) return undefined;
  try {
    const env = mergedEnv();
    const baseUrl = env['HERMES_BASE_URL'] ?? env['OPENAI_BASE_URL'];
    const apiKey = env['HERMES_API_KEY'] ?? env['OPENAI_API_KEY'];
    if (!baseUrl || !apiKey) return undefined;
    const model = env['HERMES_EMBED_MODEL'] || 'text-embedding-3-small';
    const inner = createEmbedder({ baseUrl, apiKey, model });
    // Probe-once wrapper: the first failed call bricks the embedder for this
    // process (fail-quiet — callers fall back to lexical retrieval).
    const wrapped: Embedder = {
      model: inner.model,
      embed: async (texts) => {
        try {
          return await inner.embed(texts);
        } catch (err) {
          embedderDisabled = true;
          throw err;
        }
      },
    };
    return wrapped;
  } catch {
    return undefined;
  }
}

export interface ProviderSpec {
  id: string;
  label: string;
  baseUrl: string;
  keyEnvVars: string[];
  defaultModel: string;
  models: string[];
  effortLevels: string[];
  /** Whether "max" effort is a genuinely distinct level on this provider. DashScope has real thinking budgets; generic OpenAI-compatible endpoints collapse max → high. */
  maxEffort?: 'distinct' | 'collapses-to-high';
  /** Model catalog is publicly fetchable without an API key (e.g. OpenCode Zen / Go). */
  publicModels?: boolean;
}

export const PROVIDERS: Record<string, ProviderSpec> = {
  alibaba: {
    id: 'alibaba',
    label: 'Alibaba Cloud Model Studio (DashScope, OpenAI-compatible)',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    keyEnvVars: ['HERMES_ALIBABA_API_KEY', 'DASHSCOPE_API_KEY', 'ALIBABA_API_KEY'],
    defaultModel: 'qwen3.8-max',
    models: [
      'qwen3.8-max',
      'qwen3.7-max',
      'qwen3.7-plus',
      'qwen3.7-flash',
      'qwen3.6-plus',
      'qwen3.6-flash',
      'qwen3.5-plus',
      'qwen3-max',
      'qwen3-coder-plus',
      'qwen3-coder-flash',
      'qwen3-coder-next',
      'qwen-max',
      'qwen-plus',
      'qwen-turbo',
      'qwen-flash',
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'deepseek-v3.2',
      'kimi-k2.7-code',
      'glm-5.2',
      'glm-5.1',
    ],
    effortLevels: ['low', 'medium', 'high', 'max'],
    maxEffort: 'distinct',
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyEnvVars: ['HERMES_OPENAI_API_KEY', 'OPENAI_API_KEY'],
    defaultModel: 'gpt-4.1-mini',
    models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o'],
    effortLevels: ['low', 'medium', 'high'],
  },
  'opencode-zen': {
    id: 'opencode-zen',
    label: 'OpenCode Zen (pay-per-use, all flagship + open models)',
    baseUrl: 'https://opencode.ai/zen/v1',
    keyEnvVars: ['HERMES_OPENCODE_API_KEY', 'OPENCODE_API_KEY'],
    defaultModel: 'claude-sonnet-4-5',
    models: [
      'claude-fable-5',
      'claude-opus-5',
      'claude-opus-4-8',
      'claude-opus-4-7',
      'claude-opus-4-6',
      'claude-opus-4-5',
      'claude-sonnet-5',
      'claude-sonnet-4-6',
      'claude-sonnet-4-5',
      'claude-sonnet-4',
      'claude-haiku-4-5',
      'gemini-3.6-flash',
      'gemini-3.7-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.5-flash',
      'gemini-3.1-pro',
      'gemini-3-flash',
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      'gpt-5.5',
      'gpt-5.5-pro',
      'gpt-5.4',
      'gpt-5.4-pro',
      'gpt-5.4-mini',
      'gpt-5.4-nano',
      'gpt-5.3-codex-spark',
      'gpt-5.3-codex',
      'gpt-5.2',
      'gpt-5.2-codex',
      'gpt-5.1',
      'gpt-5.1-codex-max',
      'gpt-5.1-codex',
      'gpt-5.1-codex-mini',
      'gpt-5',
      'gpt-5-codex',
      'gpt-5-nano',
      'grok-build-0.1',
      'grok-4.6',
      'grok-4.5',
      'muse-spark-1.2',
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'glm-5.2',
      'glm-5.1',
      'glm-5',
      'minimax-m3',
      'minimax-m2.7',
      'minimax-m2.5',
      'kimi-k3',
      'kimi-k2.7-code',
      'kimi-k2.6',
      'kimi-k2.5',
      'qwen3.6-plus',
      'qwen3.5-plus',
      'big-pickle',
      'deepseek-v4-flash-free',
      'mimo-v2.5-free',
      'hy3-free',
      'nemotron-3-ultra-free',
      'nemotron-3.5-lightning-free',
      'laguna-s-2.1-free',
    ],
    effortLevels: ['low', 'medium', 'high', 'max'],
    publicModels: true,
  },
  'opencode-go': {
    id: 'opencode-go',
    label: 'OpenCode Go ($10/mo subscription, open models only)',
    baseUrl: 'https://opencode.ai/zen/go/v1',
    keyEnvVars: ['HERMES_OPENCODE_API_KEY', 'OPENCODE_API_KEY'],
    defaultModel: 'qwen3.8-max',
    models: [
      'minimax-m3',
      'minimax-m2.7',
      'minimax-m2.5',
      'kimi-k3',
      'kimi-k2.7-code',
      'kimi-k2.6',
      'kimi-k2.5',
      'glm-5.2',
      'glm-5.3',
      'glm-5.1',
      'glm-5',
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'qwen3.7-max',
      'qwen3.8-max',
      'qwen3.7-plus',
      'qwen3.6-plus',
      'qwen3.5-plus',
      'mimo-v2-pro',
      'mimo-v2-omni',
      'mimo-v2.5-pro',
      'mimo-v2.5',
      'hy3',
      'hy3-preview',
      'gpt-5.6-luna',
      'grok-4.5',
    ],
    effortLevels: ['low', 'medium', 'high', 'max'],
    publicModels: true,
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter (400+ models behind one API key)',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyEnvVars: ['HERMES_OPENROUTER_API_KEY', 'OPENROUTER_API_KEY'],
    defaultModel: 'anthropic/claude-sonnet-4.5',
    // Offline seed only — the live catalog replaces this list on first fetch
    // (OpenRouter's /models endpoint is public, so browsing works keyless).
    models: [
      'anthropic/claude-opus-4.5',
      'anthropic/claude-sonnet-4.5',
      'anthropic/claude-haiku-4.5',
      'openai/gpt-5.1',
      'openai/gpt-5.1-codex',
      'openai/gpt-5-mini',
      'google/gemini-3-pro',
      'google/gemini-3-flash',
      'x-ai/grok-4.1',
      'deepseek/deepseek-v3.2-exp',
      'qwen/qwen3-max',
      'moonshotai/kimi-k2-thinking',
      'z-ai/glm-4.6',
      'meta-llama/llama-4-maverick',
      'mistralai/mistral-large-3',
      'deepseek/deepseek-v3.2-exp:free',
      'qwen/qwen3-coder:free',
      'meta-llama/llama-3.3-70b-instruct:free',
    ],
    effortLevels: ['low', 'medium', 'high'],
    publicModels: true,
  },
};

export interface ModelInfo {
  id: string;
  ownedBy?: string;
  /** Image-input capability reported by the provider's own /models endpoint.
   *  `undefined` when the endpoint did not publish modality for this model. */
  vision?: boolean;
}

/** Provider-specific limits, USD prices per one million tokens, and live modality. */
export interface ModelMetadata {
  contextTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  inputPricePerMillion?: number;
  outputPricePerMillion?: number;
  cachedInputPricePerMillion?: number;
  /** Image input capability reported by the live catalog. `undefined` when the
   *  catalog did not publish modality info for this model. */
  vision?: boolean;
  source: 'models.dev';
}

export type ModelCatalog = Map<string, Map<string, ModelMetadata>>;

const MODEL_CATALOG_URL = 'https://models.dev/api.json';
const MODEL_CATALOG_TTL_MS = 10 * 60 * 1000;
const MODEL_CATALOG_RETRY_MS = 60 * 1000;
const CATALOG_PROVIDER_IDS: Record<string, string> = {
  'opencode-zen': 'opencode',
  'opencode-go': 'opencode-go',
};

let catalogCache: ModelCatalog | undefined;
let catalogExpiresAt = 0;
let catalogRetryAt = 0;
let catalogPending: Promise<ModelCatalog | undefined> | undefined;

const VISION_PATTERNS: RegExp[] = [
  /\bvl\b/,
  /vision/,
  /gpt-4o/,
  /gpt-4\.1/,
  /gpt-5/,
  /\bo3\b/,
  /\bo4\b/,
  /qwen3\.\d+-(max|plus)/,
  /qwen3-max/,
  /qwen-(max|plus|turbo)/,
  /kimi-k2/,
  /kimi-k3/,
  /glm-5/,
  /claude/,
  /gemini/,
  /grok/,
  /mimo/,
];

const TEXT_ONLY_PATTERNS: RegExp[] = [/coder/, /codex/, /deepseek/];

/** Live image-input capability from a models.dev-style model entry. */
function catalogModelVision(model: Record<string, unknown>): boolean | undefined {
  if (model['visual'] === true) return true;
  const modality = isRecord(model['modality']) ? model['modality'] : {};
  const inputs = Array.isArray(modality['input'])
    ? modality['input']
    : Array.isArray(model['input'])
      ? model['input']
      : [];
  const hasImage = inputs.some((v) => typeof v === 'string' && /image/i.test(v));
  if (hasImage) return true;
  // Explicitly text-only modality is authoritative too: a model whose input
  // modalities list text (and nothing image-like) does not accept images.
  if (inputs.length > 0) return false;
  return undefined;
}

/**
 * Name-based heuristic for image support, used only when neither the provider's
 * live /models endpoint nor the catalog has modality data (offline fallback).
 */
export function modelSupportsImages(model: string): boolean {
  const m = model.toLowerCase();
  // An explicit vision marker in the name wins even inside otherwise text-only
  // families ("deepseek-vl2" is vision-capable despite /deepseek/ below), while
  // plain "-coder"/"-codex" variants stay text-only.
  if (/\bvl/.test(m) || /vision/.test(m)) return true;
  if (TEXT_ONLY_PATTERNS.some((re) => re.test(m))) return false;
  return VISION_PATTERNS.some((re) => re.test(m));
}

/**
 * Resolve whether a model accepts image input. Prefers the LIVE catalog
 * modality data (so any provider — including future ones — is handled without
 * maintaining name patterns), and falls back to the offline heuristic when the
 * catalog is unavailable or does not report modality for this model.
 */
export function resolveSupportedImages(
  catalog: ModelCatalog | undefined,
  providerId: string,
  model: string,
  fallback: boolean = modelSupportsImages(model),
): boolean {
  const meta = modelMetadataFor(catalog, providerId, model);
  if (meta && meta.vision !== undefined) return meta.vision;
  return fallback;
}

/** Free promotional / community models (no credits needed) across providers. */
export function isFreeModel(model: string): boolean {
  return /-free$/i.test(model) || /:free$/i.test(model) || model === 'big-pickle';
}

export type ModelCapabilityTier = 'low' | 'standard' | 'high';

/**
 * Rough capability tier used to size the TURN budget (not the per-call
 * reasoning effort, which is the provider's own `effort` parameter).
 * Lower-capability models — free/community tiers are the clearest signal —
 * get MORE turns, because each of their turns accomplishes less work; a
 * budget tuned for a frontier model stalls them mid-task. Price is the best
 * available proxy when the catalog publishes it.
 */
export function modelCapabilityTier(metadata: ModelMetadata | undefined, model: string): ModelCapabilityTier {
  if (isFreeModel(model)) return 'low';
  const out = metadata?.outputPricePerMillion;
  if (out === undefined) return 'standard';
  if (out >= 5) return 'high';
  return 'standard';
}

/**
 * Pick a free fallback from the SAME provider when the selected model cannot
 * be billed (HTTP 401 / no credits). Returns undefined when the model is
 * already free or the provider offers no free models — callers then surface
 * the billing error instead of silently switching.
 */
export function freeModelFallback(providerId: string, model: string): string | undefined {
  if (!providerId || isFreeModel(model)) return undefined;
  const spec = PROVIDERS[providerId];
  const candidate = (spec?.models ?? []).find((m) => isFreeModel(m));
  return candidate;
}

/**
 * Fetch provider-specific limits and token prices from Models.dev. The catalog
 * is public and refreshed every ten minutes; callers still work when it is
 * unavailable and simply receive no pricing metadata for unknown models.
 */
export async function fetchModelCatalog(timeoutMs = 2500): Promise<ModelCatalog | undefined> {
  if (catalogCache && Date.now() < catalogExpiresAt) return catalogCache;
  if (Date.now() < catalogRetryAt) return undefined;
  if (catalogPending) return catalogPending;

  catalogPending = (async (): Promise<ModelCatalog | undefined> => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(MODEL_CATALOG_URL, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) {
        // HTTP-level failures must back off too, or every resolution hammers
        // the catalog endpoint until it happens to succeed.
        catalogRetryAt = Date.now() + MODEL_CATALOG_RETRY_MS;
        return undefined;
      }
      const data = (await res.json()) as unknown;
      const catalog = parseModelCatalog(data);
      if (catalog.size === 0) return undefined;
      catalogCache = catalog;
      catalogExpiresAt = Date.now() + MODEL_CATALOG_TTL_MS;
      catalogRetryAt = 0;
      return catalog;
    } catch {
      catalogRetryAt = Date.now() + MODEL_CATALOG_RETRY_MS;
      return undefined;
    } finally {
      catalogPending = undefined;
    }
  })();
  return catalogPending;
}

/** Return live metadata for a model served by one of Agent Gitu's providers. */
export function modelMetadataFor(catalog: ModelCatalog | undefined, providerId: string, model: string): ModelMetadata | undefined {
  const catalogProvider = CATALOG_PROVIDER_IDS[providerId] ?? providerId;
  return catalog?.get(catalogProvider)?.get(model);
}

/** Synchronous view of the cached catalog (undefined when not fetched yet). */
export function peekModelCatalog(): ModelCatalog | undefined {
  return catalogCache && Date.now() < catalogExpiresAt ? catalogCache : undefined;
}

/** Estimate the USD cost of accumulated token usage from catalog prices. */
export function usageCostUsd(
  meta: ModelMetadata | undefined,
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number },
): number | undefined {
  if (!meta) return undefined;
  const inputPrice = meta.inputPricePerMillion;
  const outputPrice = meta.outputPricePerMillion;
  if (inputPrice === undefined && outputPrice === undefined) return undefined;
  const cached = Math.min(usage.cachedTokens, usage.inputTokens);
  const cachedPrice = meta.cachedInputPricePerMillion ?? inputPrice ?? 0;
  return (
    ((usage.inputTokens - cached) / 1_000_000) * (inputPrice ?? 0) +
    (cached / 1_000_000) * cachedPrice +
    (usage.outputTokens / 1_000_000) * (outputPrice ?? 0)
  );
}

export function parseModelCatalog(value: unknown): ModelCatalog {
  const catalog = new Map<string, Map<string, ModelMetadata>>();
  if (!isRecord(value)) return catalog;
  for (const [providerId, provider] of Object.entries(value)) {
    if (!isRecord(provider) || !isRecord(provider['models'])) continue;
    const models = new Map<string, ModelMetadata>();
    for (const [modelId, model] of Object.entries(provider['models'])) {
      if (!isRecord(model)) continue;
      const limit = isRecord(model['limit']) ? model['limit'] : {};
      const cost = isRecord(model['cost']) ? model['cost'] : {};
      const metadata: ModelMetadata = {
        contextTokens: finiteNumber(limit['context']),
        inputTokens: finiteNumber(limit['input']),
        outputTokens: finiteNumber(limit['output']),
        inputPricePerMillion: finiteNumber(cost['input']),
        outputPricePerMillion: finiteNumber(cost['output']),
        cachedInputPricePerMillion: finiteNumber(cost['cache_read']),
        vision: catalogModelVision(model),
        source: 'models.dev',
      };
      if (Object.values(metadata).some((v) => typeof v === 'number') || metadata.vision !== undefined) models.set(modelId, metadata);
    }
    if (models.size > 0) catalog.set(providerId, models);
  }
  return catalog;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Decide a model's image-input capability from a raw /models entry, without
 * assuming any one provider's schema. Covers the shapes used across current
 * and future providers:
 *  - OpenRouter / OpenAI:  { architecture: { modality: "text+image->text" } }
 *  - OpenAI-compatible:    { input_modalities: ["text","image"] }
 *  - models.dev:           { visual: true } or { modality: { input: [...] } }
 *  - DashScope/ChatGLM-ish:{ capabilities: { support_vision: true } }
 * Returns undefined when the entry publishes no usable modality signal.
 */
export function modelVisionFromRaw(raw: Record<string, unknown>): boolean | undefined {
  if (!isRecord(raw)) return undefined;

  const explicit = raw['visual'];
  if (explicit === true) return true;
  if (explicit === false) return false;

  const caps = isRecord(raw['capabilities']) ? raw['capabilities'] : {};
  const capVision = caps['support_vision'] ?? caps['vision'];
  if (capVision === true) return true;
  if (capVision === false) return false;

  // OpenAI / OpenRouter: input_modalities is a string array of accepted inputs.
  const inputModalities = Array.isArray(raw['input_modalities']) ? raw['input_modalities'] : [];
  if (inputModalities.length > 0) {
    return inputModalities.some((v) => typeof v === 'string' && /image|vision/i.test(v));
  }

  // OpenRouter: architecture.modality like "text+image->text" — only the input
  // (left) side decides whether images can be attached.
  const arch = isRecord(raw['architecture']) ? raw['architecture'] : {};
  if (typeof arch['modality'] === 'string') {
    const inputSide = arch['modality'].split('->')[0] ?? '';
    if (/image|vision/i.test(inputSide)) return true;
    if (inputSide) return false;
  }

  // models.dev style: modality.input array.
  const modality = isRecord(raw['modality']) ? raw['modality'] : {};
  const modalityInputs = Array.isArray(modality['input'])
    ? modality['input']
    : Array.isArray(raw['input'])
      ? raw['input']
      : [];
  if (modalityInputs.length > 0) {
    const hasImage = modalityInputs.some((v) => typeof v === 'string' && /image/i.test(v));
    if (hasImage) return true;
    return false;
  }

  return undefined;
}

export async function fetchLiveModels(opts: {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
}): Promise<ModelInfo[] | undefined> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
    const res = await fetch(`${opts.baseUrl.replace(/\/$/, '')}/models`, {
      headers: { authorization: `Bearer ${opts.apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return undefined;
    const data = (await res.json()) as { data?: Record<string, unknown>[] };
    if (!Array.isArray(data.data)) return undefined;
    return data.data
      .filter((m) => isRecord(m) && typeof m['id'] === 'string')
      .map((m) => ({
        id: m['id'] as string,
        ownedBy: typeof m['owned_by'] === 'string' ? (m['owned_by'] as string) : undefined,
        vision: modelVisionFromRaw(m),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return undefined;
  }
}

const liveModelsCache = new Map<string, { models: ModelInfo[]; expiresAt: number }>();
/** In-flight fetches per base URL so N concurrent callers share ONE request. */
const liveModelsPending = new Map<string, Promise<ModelInfo[] | undefined>>();
const LIVE_MODELS_TTL_MS = 10 * 60 * 1000;
const LIVE_MODELS_MISS_TTL_MS = 60 * 1000;

/**
 * Fetch a provider's live /models list through a short-lived shared cache so
 * the model picker and run-time image-support resolution see the SAME data.
 * Successful listings are kept for ten minutes; empty/failed listings are
 * remembered for only one minute so an endpoint that publishes nothing useful
 * does not get re-hit on every chat turn.
 */
export async function cachedLiveModels(opts: {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
}): Promise<ModelInfo[] | undefined> {
  const key = opts.baseUrl.replace(/\/$/, '');
  const hit = liveModelsCache.get(key);
  if (hit && Date.now() < hit.expiresAt) return hit.models.length > 0 ? hit.models : undefined;
  // Dedupe concurrent misses: parallel callers must not stampede the provider
  // with identical /models requests (and race-cache-overwrite each other).
  const pending = liveModelsPending.get(key);
  if (pending) return pending;
  const task = (async (): Promise<ModelInfo[] | undefined> => {
    const fetched = await fetchLiveModels(opts);
    if (fetched && fetched.length > 0) {
      liveModelsCache.set(key, { models: fetched, expiresAt: Date.now() + LIVE_MODELS_TTL_MS });
    } else {
      liveModelsCache.set(key, { models: [], expiresAt: Date.now() + LIVE_MODELS_MISS_TTL_MS });
    }
    return fetched && fetched.length > 0 ? fetched : undefined;
  })();
  void task.catch(() => {}).finally(() => liveModelsPending.delete(key));
  liveModelsPending.set(key, task);
  return task;
}

/** Image-input flag from a cached live /models list; undefined when the list has no such entry or publishes no modality. */
export function liveModelVision(models: ModelInfo[] | undefined, model: string): boolean | undefined {
  return models?.find((m) => m.id === model)?.vision;
}

/**
 * Full-precedence image-input resolution for a run about to start:
 * 1. the provider's own live /models modality (same source the model picker used),
 * 2. the models.dev catalog entry,
 * 3. the offline name heuristic.
 * Custom OpenAI-compatible endpoints (HERMES_API_KEY + HERMES_BASE_URL) are
 * covered too, so any vision-capable model — current or future — actually
 * receives attached images instead of having them silently dropped.
 */
export async function resolveImageSupport(opts: {
  providerId?: string;
  model?: string;
  catalog?: ModelCatalog;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}): Promise<boolean> {
  const providerId = opts.providerId?.toLowerCase();
  const provider = providerId ? PROVIDERS[providerId] : undefined;
  const env = opts.env ?? mergedEnv();
  const baseUrl =
    provider?.baseUrl ?? (providerId === 'custom' ? env['HERMES_BASE_URL'] ?? env['OPENAI_BASE_URL'] : undefined);
  if (baseUrl && opts.model) {
    const apiKey = provider ? (providerKey(provider, env)?.key ?? '') : (env['HERMES_API_KEY'] ?? env['OPENAI_API_KEY'] ?? '');
    const vision = liveModelVision(await cachedLiveModels({ baseUrl, apiKey, timeoutMs: opts.timeoutMs }), opts.model);
    if (vision !== undefined) return vision;
  }
  return resolveSupportedImages(opts.catalog, providerId ?? '', opts.model ?? '');
}

export function providerKey(spec: ProviderSpec, env: NodeJS.ProcessEnv = mergedEnv()): { key: string; envVar: string } | undefined {
  const envVar = spec.keyEnvVars.find((v) => env[v]);
  if (!envVar) return undefined;
  return { key: env[envVar]!, envVar };
}

export class ProviderError extends Error {}

export interface ResolveOptions {
  provider?: string;
  model?: string;
  baseUrl?: string;
  env?: NodeJS.ProcessEnv;
}

export interface ResolvedLlm {
  client: LlmClient;
  providerId: string;
  baseUrl: string;
  model: string;
  keyEnvVar: string;
}

function build(
  providerId: string,
  spec: { baseUrl: string; defaultModel: string } | undefined,
  apiKey: string,
  keyEnvVar: string,
  opts: ResolveOptions,
  env: NodeJS.ProcessEnv,
): ResolvedLlm {
  const baseUrl = opts.baseUrl ?? env['HERMES_BASE_URL'] ?? spec?.baseUrl ?? 'https://api.openai.com/v1';
  const model = opts.model ?? env['HERMES_MODEL'] ?? spec?.defaultModel ?? 'gpt-4.1-mini';
  return {
    client: new OpenAiCompatClient({ apiKey, baseUrl, model }),
    providerId,
    baseUrl,
    model,
    keyEnvVar,
  };
}

export function resolveLlm(opts: ResolveOptions = {}): ResolvedLlm {
  const env = opts.env ?? mergedEnv();

  if (opts.provider) {
    const spec = PROVIDERS[opts.provider.toLowerCase()];
    if (!spec) {
      throw new ProviderError(
        `Unknown provider "${opts.provider}". Available: ${Object.keys(PROVIDERS).join(', ')}`,
      );
    }
    const keyEnvVar = spec.keyEnvVars.find((v) => env[v]);
    if (!keyEnvVar) {
      throw new ProviderError(
        `Provider "${spec.id}" needs an API key. Set one of: ${spec.keyEnvVars.join(', ')}`,
      );
    }
    return build(spec.id, spec, env[keyEnvVar]!, keyEnvVar, opts, env);
  }

  const genericKey = env['HERMES_API_KEY'] ?? env['OPENAI_API_KEY'];
  if (genericKey) {
    const baseUrl = opts.baseUrl ?? env['HERMES_BASE_URL'] ?? env['OPENAI_BASE_URL'];
    const model = opts.model ?? env['HERMES_MODEL'] ?? env['OPENAI_MODEL'];
    return {
      client: new OpenAiCompatClient({ apiKey: genericKey, baseUrl, model }),
      providerId: 'custom',
      baseUrl: baseUrl ?? 'https://api.openai.com/v1',
      model: model ?? 'gpt-4.1-mini',
      keyEnvVar: env['HERMES_API_KEY'] ? 'HERMES_API_KEY' : 'OPENAI_API_KEY',
    };
  }

  for (const spec of Object.values(PROVIDERS)) {
    const keyEnvVar = spec.keyEnvVars.find((v) => env[v]);
    if (keyEnvVar) {
      return build(spec.id, spec, env[keyEnvVar]!, keyEnvVar, opts, env);
    }
  }

  const providerHints = Object.values(PROVIDERS)
    .map((p) => `  ${p.id}: set ${p.keyEnvVars.join(' or ')}`)
    .join('\n');
  throw new ProviderError(
    `No LLM configured. Options:\n${providerHints}\n  custom: set HERMES_API_KEY (optionally HERMES_BASE_URL, HERMES_MODEL)\nOr pass --provider <name> --model <model>.`,
  );
}
