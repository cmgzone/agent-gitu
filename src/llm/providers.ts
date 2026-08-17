import { OpenAiCompatClient, type LlmClient } from './llm.js';
import { mergedEnv } from './keys.js';

export interface ProviderSpec {
  id: string;
  label: string;
  baseUrl: string;
  keyEnvVars: string[];
  defaultModel: string;
  models: string[];
  effortLevels: string[];
  /** Model catalog is publicly fetchable without an API key (e.g. OpenCode Zen / Go). */
  publicModels?: boolean;
}

export const PROVIDERS: Record<string, ProviderSpec> = {
  alibaba: {
    id: 'alibaba',
    label: 'Alibaba Cloud Model Studio (DashScope, OpenAI-compatible)',
    baseUrl: 'https://ws-rn94romkyqmcy5ka.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1',
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
};

export interface ModelInfo {
  id: string;
  ownedBy?: string;
}

/** Provider-specific limits and USD prices per one million tokens. */
export interface ModelMetadata {
  contextTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  inputPricePerMillion?: number;
  outputPricePerMillion?: number;
  cachedInputPricePerMillion?: number;
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

export function modelSupportsImages(model: string): boolean {
  const m = model.toLowerCase();
  if (TEXT_ONLY_PATTERNS.some((re) => re.test(m))) return false;
  return VISION_PATTERNS.some((re) => re.test(m));
}

/** OpenCode Zen-style free promotional models (no credits needed). */
export function isFreeModel(model: string): boolean {
  return /-free$/i.test(model) || model === 'big-pickle';
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
      if (!res.ok) return undefined;
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

function parseModelCatalog(value: unknown): ModelCatalog {
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
        source: 'models.dev',
      };
      if (Object.values(metadata).some((v) => typeof v === 'number')) models.set(modelId, metadata);
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
    const data = (await res.json()) as { data?: { id?: string; owned_by?: string }[] };
    if (!Array.isArray(data.data)) return undefined;
    return data.data
      .filter((m): m is { id: string; owned_by?: string } => typeof m.id === 'string')
      .map((m) => ({ id: m.id, ownedBy: m.owned_by }))
      .sort((a, b) => a.id.localeCompare(b.id));
  } catch {
    return undefined;
  }
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
