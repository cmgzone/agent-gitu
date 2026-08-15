import { OpenAiCompatClient, type LlmClient } from './llm.js';

export interface ProviderSpec {
  id: string;
  label: string;
  baseUrl: string;
  keyEnvVars: string[];
  defaultModel: string;
  models: string[];
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
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyEnvVars: ['HERMES_OPENAI_API_KEY', 'OPENAI_API_KEY'],
    defaultModel: 'gpt-4.1-mini',
    models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o'],
  },
};

export interface ModelInfo {
  id: string;
  ownedBy?: string;
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

export function providerKey(spec: ProviderSpec, env: NodeJS.ProcessEnv = process.env): { key: string; envVar: string } | undefined {
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
  const env = opts.env ?? process.env;

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
