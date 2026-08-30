import { afterEach, describe, expect, it } from 'vitest';
import { PROVIDERS, ProviderError, cachedLiveModels, modelCapabilityTier, fetchLiveModels, fetchModelCatalog, freeModelFallback, isFreeModel, liveModelVision, modelMetadataFor, modelSupportsImages, parseModelCatalog, resolveImageSupport, resolveLlm, resolveSupportedImages } from '../src/llm/providers.js';
import { sanitizeCustomProviders } from '../src/workspace/home.js';

const WS_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

describe('provider registry', () => {
  it('registers alibaba with the DashScope intl endpoint and current qwen default', () => {
    const alibaba = PROVIDERS['alibaba'];
    expect(alibaba).toBeDefined();
    expect(alibaba!.baseUrl).toBe(WS_URL);
    expect(alibaba!.defaultModel).toBe('qwen3.8-max');
    expect(alibaba!.keyEnvVars).toContain('DASHSCOPE_API_KEY');
  });

  it('lists the full known alibaba catalog including third-party models', () => {
    const models = PROVIDERS['alibaba']!.models;
    for (const expected of ['qwen3.7-max', 'qwen3.7-plus', 'qwen3.6-flash', 'qwen3-coder-plus', 'deepseek-v4-pro', 'kimi-k2.7-code', 'glm-5.2']) {
      expect(models).toContain(expected);
    }
  });

  it('registers opencode zen and go with their plan-specific endpoints and public catalogs', () => {
    const zen = PROVIDERS['opencode-zen']!;
    const go = PROVIDERS['opencode-go']!;
    expect(zen.baseUrl).toBe('https://opencode.ai/zen/v1');
    expect(go.baseUrl).toBe('https://opencode.ai/zen/go/v1');
    expect(zen.publicModels).toBe(true);
    expect(go.publicModels).toBe(true);
    expect(zen.keyEnvVars).toContain('OPENCODE_API_KEY');
    expect(go.keyEnvVars).toContain('OPENCODE_API_KEY');
    for (const flagship of ['claude-sonnet-4-5', 'gemini-3-flash', 'gpt-5.2', 'deepseek-v4-flash']) {
      expect(zen.models).toContain(flagship);
    }
    for (const open of ['qwen3.8-max', 'glm-5.2', 'kimi-k3', 'deepseek-v4-flash', 'grok-4.5']) {
      expect(go.models).toContain(open);
    }
  });

  it('registers openrouter with its endpoint, key vars, and a namespaced default', () => {
    const or = PROVIDERS['openrouter']!;
    expect(or.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(or.publicModels).toBe(true);
    expect(or.keyEnvVars).toContain('OPENROUTER_API_KEY');
    expect(or.keyEnvVars).toContain('HERMES_OPENROUTER_API_KEY');
    expect(or.defaultModel).toMatch(/\//);
    expect(or.models.some((m) => m.endsWith(':free'))).toBe(true);
  });

  it('registers the direct DeepSeek API with its V4 model seed', () => {
    const deepseek = PROVIDERS['deepseek'];
    expect(deepseek).toBeDefined();
    expect(deepseek!.baseUrl).toBe('https://api.deepseek.com');
    expect(deepseek!.keyEnvVars).toEqual(['HERMES_DEEPSEEK_API_KEY', 'DEEPSEEK_API_KEY']);
    expect(deepseek!.defaultModel).toBe('deepseek-v4-pro');
    expect(deepseek!.models).toEqual(expect.arrayContaining(['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-v4-flash-vision-exp']));
    expect(deepseek!.maxEffort).toBe('distinct');
  });
});

describe('custom provider profiles', () => {
  it('accepts an HTTPS OpenAI-compatible profile without storing its secret', () => {
    const profiles = sanitizeCustomProviders([
      {
        id: 'custom-team-gateway',
        label: 'Team gateway',
        baseUrl: 'https://models.example.test/v1/',
        defaultModel: 'team-coder',
        keyEnvVar: 'hermes_custom_team_gateway',
        models: ['team-coder', 'team-fast', 'team-coder'],
        toolMode: 'structured_text',
        apiKey: 'must-not-be-kept',
      },
    ]);
    expect(profiles).toEqual([
      {
        id: 'custom-team-gateway',
        label: 'Team gateway',
        baseUrl: 'https://models.example.test/v1',
        defaultModel: 'team-coder',
        keyEnvVar: 'HERMES_CUSTOM_TEAM_GATEWAY',
        models: ['team-coder', 'team-fast'],
        toolMode: 'structured_text',
      },
    ]);
  });

  it('rejects unsafe endpoints and arbitrary key-variable names', () => {
    expect(
      sanitizeCustomProviders([
        { id: 'custom-unsafe', label: 'Unsafe', baseUrl: 'http://example.test/v1', defaultModel: 'm', keyEnvVar: 'OPENAI_API_KEY' },
      ]),
    ).toEqual([]);
  });

  it('allows a loopback IPv6 local model server', () => {
    expect(
      sanitizeCustomProviders([
        { id: 'custom-local', label: 'Local', baseUrl: 'http://[::1]:11434/v1', defaultModel: 'local-coder', keyEnvVar: 'HERMES_CUSTOM_LOCAL' },
      ]),
    ).toEqual([
      expect.objectContaining({ id: 'custom-local', baseUrl: 'http://[::1]:11434/v1' }),
    ]);
  });
});

describe('resolveLlm', () => {
  it('resolves explicit alibaba provider from DASHSCOPE_API_KEY', () => {
    const resolved = resolveLlm({ provider: 'alibaba', env: { DASHSCOPE_API_KEY: 'sk-test' } });
    expect(resolved.providerId).toBe('alibaba');
    expect(resolved.baseUrl).toBe(WS_URL);
    expect(resolved.model).toBe('qwen3.8-max');
    expect(resolved.keyEnvVar).toBe('DASHSCOPE_API_KEY');
  });

  it('honors model and base-url overrides', () => {
    const resolved = resolveLlm({
      provider: 'alibaba',
      model: 'qwen-max',
      baseUrl: 'https://example.test/v1',
      env: { DASHSCOPE_API_KEY: 'sk-test' },
    });
    expect(resolved.model).toBe('qwen-max');
    expect(resolved.baseUrl).toBe('https://example.test/v1');
  });

  it('throws a helpful error when the explicit provider has no key', () => {
    expect(() => resolveLlm({ provider: 'alibaba', env: {} })).toThrow(ProviderError);
    try {
      resolveLlm({ provider: 'alibaba', env: {} });
    } catch (err) {
      expect((err as Error).message).toContain('DASHSCOPE_API_KEY');
    }
  });

  it('throws on unknown providers', () => {
    expect(() => resolveLlm({ provider: 'skynet', env: {} })).toThrow(/Unknown provider/);
  });

  it('auto-detects alibaba when only its key is present', () => {
    const resolved = resolveLlm({ env: { HERMES_ALIBABA_API_KEY: 'sk-x' } });
    expect(resolved.providerId).toBe('alibaba');
    expect(resolved.keyEnvVar).toBe('HERMES_ALIBABA_API_KEY');
  });

  it('resolves opencode zen and go from the shared OPENCODE_API_KEY', () => {
    const zen = resolveLlm({ provider: 'opencode-zen', env: { OPENCODE_API_KEY: 'oc-x' } });
    expect(zen.baseUrl).toBe('https://opencode.ai/zen/v1');
    expect(zen.keyEnvVar).toBe('OPENCODE_API_KEY');
    expect(zen.model).toBe('claude-sonnet-4-5');
    const go = resolveLlm({ provider: 'opencode-go', env: { HERMES_OPENCODE_API_KEY: 'oc-x' } });
    expect(go.baseUrl).toBe('https://opencode.ai/zen/go/v1');
    expect(go.keyEnvVar).toBe('HERMES_OPENCODE_API_KEY');
    expect(go.model).toBe('qwen3.8-max');
  });

  it('resolves openrouter and honors its namespaced model ids', () => {
    const or = resolveLlm({ provider: 'openrouter', env: { OPENROUTER_API_KEY: 'or-x' } });
    expect(or.providerId).toBe('openrouter');
    expect(or.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect(or.model).toBe('anthropic/claude-sonnet-4.5');
    const overridden = resolveLlm({ provider: 'openrouter', model: 'deepseek/deepseek-v3.2-exp:free', env: { OPENROUTER_API_KEY: 'or-x' } });
    expect(overridden.model).toBe('deepseek/deepseek-v3.2-exp:free');
  });

  it('resolves DeepSeek from its dedicated API key', () => {
    const deepseek = resolveLlm({ provider: 'deepseek', env: { DEEPSEEK_API_KEY: 'ds-x' } });
    expect(deepseek.providerId).toBe('deepseek');
    expect(deepseek.baseUrl).toBe('https://api.deepseek.com');
    expect(deepseek.model).toBe('deepseek-v4-pro');
    expect(deepseek.keyEnvVar).toBe('DEEPSEEK_API_KEY');
  });

  it('auto-detects DeepSeek when only its namespaced key is present', () => {
    const deepseek = resolveLlm({ env: { HERMES_DEEPSEEK_API_KEY: 'ds-x' } });
    expect(deepseek.providerId).toBe('deepseek');
    expect(deepseek.keyEnvVar).toBe('HERMES_DEEPSEEK_API_KEY');
  });

  it('prefers generic HERMES_API_KEY as custom provider', () => {
    const resolved = resolveLlm({ env: { HERMES_API_KEY: 'sk-x', HERMES_BASE_URL: 'https://custom.test/v1' } });
    expect(resolved.providerId).toBe('custom');
    expect(resolved.baseUrl).toBe('https://custom.test/v1');
  });

  it('throws with setup guidance when nothing is configured', () => {
    expect(() => resolveLlm({ env: {} })).toThrow(ProviderError);
  });
});

describe('fetchLiveModels', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('parses the OpenAI-compatible /models response', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({ data: [{ id: 'qwen3.7-max', owned_by: 'system' }, { id: 'qwen3.6-flash', owned_by: 'system' }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as typeof fetch;
    const models = await fetchLiveModels({ baseUrl: 'https://example.test/v1', apiKey: 'sk-x' });
    expect(models?.map((m) => m.id)).toEqual(['qwen3.6-flash', 'qwen3.7-max']);
  });

  it('returns undefined on HTTP errors or network failure', async () => {
    globalThis.fetch = (async () => new Response('nope', { status: 401 })) as typeof fetch;
    expect(await fetchLiveModels({ baseUrl: 'https://example.test/v1', apiKey: 'bad' })).toBeUndefined();
    globalThis.fetch = (async () => {
      throw new Error('network down');
    }) as typeof fetch;
    expect(await fetchLiveModels({ baseUrl: 'https://example.test/v1', apiKey: 'x', timeoutMs: 100 })).toBeUndefined();
  });
});

describe('fetchModelCatalog', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('maps live context limits and provider-specific token prices', async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          openai: {
            models: {
              'gpt-test': { limit: { context: 128000, output: 16000 }, cost: { input: 0.5, output: 2, cache_read: 0.1 } },
            },
          },
          opencode: {
            models: {
              'shared-model': { limit: { context: 200000 }, cost: { input: 1, output: 4 } },
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )) as typeof fetch;

    const catalog = await fetchModelCatalog();
    expect(modelMetadataFor(catalog, 'openai', 'gpt-test')).toMatchObject({
      contextTokens: 128000,
      outputTokens: 16000,
      inputPricePerMillion: 0.5,
      outputPricePerMillion: 2,
      cachedInputPricePerMillion: 0.1,
    });
    expect(modelMetadataFor(catalog, 'opencode-zen', 'shared-model')).toMatchObject({ contextTokens: 200000, inputPricePerMillion: 1, outputPricePerMillion: 4 });
  });
});

describe('isFreeModel', () => {
  it('flags opencode free promotional models and keeps paid ones clean', () => {
    for (const free of ['hy3-free', 'deepseek-v4-flash-free', 'mimo-v2.5-free', 'nemotron-3-ultra-free', 'nemotron-3.5-lightning-free', 'laguna-s-2.1-free', 'big-pickle']) {
      expect(isFreeModel(free)).toBe(true);
    }
    for (const paid of ['deepseek-v4-flash', 'deepseek-v4-pro', 'claude-sonnet-4-5', 'qwen3.8-max', 'gpt-5.2']) {
      expect(isFreeModel(paid)).toBe(false);
    }
  });
});

describe('modelSupportsImages', () => {
  it('flags multimodal opencode models and keeps text-only ones clean', () => {
    for (const vision of ['claude-sonnet-4-5', 'gemini-3-flash', 'gpt-5.2', 'grok-4.5', 'kimi-k3', 'glm-5.2', 'qwen3.8-max']) {
      expect(modelSupportsImages(vision)).toBe(true);
    }
    for (const textOnly of ['deepseek-v4-flash', 'deepseek-v4-pro', 'gpt-5.3-codex', 'minimax-m3']) {
      expect(modelSupportsImages(textOnly)).toBe(false);
    }
  });

  it('uses live catalog modality over the name heuristic, for any provider', () => {
    // A brand-new provider whose model names match no vision pattern: the
    // catalog must decide, not the hardcoded regex lists.
    const catalog = new Map([
      [
        'future-provider-xyz',
        new Map([
          ['nova-vision-13', { contextTokens: 200_000, vision: true, source: 'models.dev' as const }],
          ['nova-lite-13', { contextTokens: 16_000, vision: false, source: 'models.dev' as const }],
        ]),
      ],
    ]);
    expect(resolveSupportedImages(catalog, 'future-provider-xyz', 'nova-vision-13')).toBe(true);
    expect(resolveSupportedImages(catalog, 'future-provider-xyz', 'nova-lite-13')).toBe(false);
    // Models absent from the catalog fall back to the offline heuristic.
    expect(resolveSupportedImages(catalog, 'future-provider-xyz', 'claude-sonnet-4-5')).toBe(true);
    expect(resolveSupportedImages(undefined, 'anything', 'deepseek-v4-flash')).toBe(false);
  });

  it('parses modality.input and the legacy visual flag from models.dev JSON', () => {
    const raw = {
      'future-provider-xyz': {
        models: {
          'by-modality': { limit: { context: 128000 }, modality: { input: ['text', 'image'], output: ['text'] } },
          'by-visual-flag': { limit: { context: 128000 }, visual: true },
          'text-only': { limit: { context: 32000 }, modality: { input: ['text'], output: ['text'] } },
          'no-modality': { limit: { context: 32000 } },
        },
      },
    };
    const catalog = parseModelCatalog(raw);
    expect(catalog.get('future-provider-xyz')?.get('by-modality')?.vision).toBe(true);
    expect(catalog.get('future-provider-xyz')?.get('by-visual-flag')?.vision).toBe(true);
    expect(catalog.get('future-provider-xyz')?.get('text-only')?.vision).toBe(false);
    expect(catalog.get('future-provider-xyz')?.get('no-modality')?.vision).toBeUndefined();
  });

  it('keeps vision-only catalog entries that carry no numeric limits or prices', () => {
    const catalog = parseModelCatalog({ p: { models: { 'vision-only': { visual: true } } } });
    expect(catalog.get('p')?.get('vision-only')?.vision).toBe(true);
  });

  it('lets explicit vision markers in a name beat text-only families', () => {
    for (const vision of ['deepseek-vl2', 'qwen2.5-vl-72b', 'pixtral-vision-1']) {
      expect(modelSupportsImages(vision)).toBe(true);
    }
    // Unchanged: plain coder/codex/deepseek variants stay text-only.
    expect(modelSupportsImages('gpt-5.3-codex')).toBe(false);
    expect(modelSupportsImages('qwen3-coder-plus')).toBe(false);
  });

  it('reads the vision flag from a cached live /models list', () => {
    const models = [
      { id: 'm-text', vision: false as const },
      { id: 'm-vision', vision: true as const },
      { id: 'm-unknown', ownedBy: 'x' },
    ];
    expect(liveModelVision(models, 'm-vision')).toBe(true);
    expect(liveModelVision(models, 'm-text')).toBe(false);
    expect(liveModelVision(models, 'm-unknown')).toBeUndefined();
    expect(liveModelVision(undefined, 'm-vision')).toBeUndefined();
  });
});

describe('resolveImageSupport — run-time gate must match what the picker showed', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('delivers images when the provider live /models says vision, even with no heuristic match', async () => {
    // "ox-alpha" matches neither VISION_PATTERNS nor any catalog entry, yet the
    // provider's own /models publishes input_modalities including image.
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(
        JSON.stringify({ data: [{ id: 'ox-alpha', input_modalities: ['text', 'image'] }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;
    const env = {};
    expect(await resolveImageSupport({ providerId: 'opencode-go', model: 'ox-alpha', env })).toBe(true);
    expect(await resolveImageSupport({ providerId: 'opencode-go', model: 'ox-alpha', env })).toBe(true);
    expect(calls).toBe(1); // second call served from the shared cache
  });

  it('withholds images when the provider live /models says text-only', async () => {
    const catalog = new Map([
      ['openai', new Map([['claude-ish-x9', { contextTokens: 1000, vision: true, source: 'models.dev' as const }]])],
    ]);
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: [{ id: 'claude-ish-x9', capabilities: { support_vision: false } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
    // Provider's own modality wins over an optimistic catalog/heuristic guess.
    expect(await resolveImageSupport({ providerId: 'openai', model: 'claude-ish-x9', catalog, env: {} })).toBe(false);
  });

  it('falls back to catalog then heuristic when the endpoint publishes nothing', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ data: [{ id: 'ox-alpha' }] }), { status: 200 });
    }) as typeof fetch;
    const env = {};
    // CATALOG_PROVIDER_IDS maps the opencode-zen registry id to models.dev's
    // "opencode" slug, so the catalog entry must use that key.
    const catalog = new Map([
      ['opencode', new Map([['ox-alpha', { contextTokens: 1000, vision: true, source: 'models.dev' as const }]])],
    ]);
    expect(await resolveImageSupport({ providerId: 'opencode-zen', model: 'ox-alpha', catalog, env })).toBe(true);
    expect(calls).toBe(1);
  });

  it('covers custom HERMES_BASE_URL endpoints via env vars', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      expect(String(input)).toBe('https://custom.test/v1/models');
      return new Response(JSON.stringify({ data: [{ id: 'ox-alpha', architecture: { modality: 'text+image->text' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    expect(
      await resolveImageSupport({
        providerId: 'custom',
        model: 'ox-alpha',
        env: { HERMES_API_KEY: 'sk-x', HERMES_BASE_URL: 'https://custom.test/v1' },
      }),
    ).toBe(true);
  });

  it('caches endpoint misses briefly so chat turns do not re-hit dead endpoints', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      throw new Error('network down');
    }) as typeof fetch;
    const env = {};
    expect(await resolveImageSupport({ providerId: 'alibaba', model: 'qwen3.8-max', timeoutMs: 50, env })).toBe(true); // heuristic
    expect(await resolveImageSupport({ providerId: 'alibaba', model: 'qwen3.8-max', timeoutMs: 50, env })).toBe(true);
    expect(calls).toBe(1);
  });
});

describe('cachedLiveModels', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns undefined on a failed fetch but remembers the miss', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response('nope', { status: 401 });
    }) as typeof fetch;
    expect(await cachedLiveModels({ baseUrl: 'https://miss-cache.test/v1', apiKey: 'k' })).toBeUndefined();
    expect(await cachedLiveModels({ baseUrl: 'https://miss-cache.test/v1', apiKey: 'k' })).toBeUndefined();
    expect(calls).toBe(1);
  });

  it('shares one successful listing across callers until the TTL expires', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ data: [{ id: 'shared-a', visual: true }] }), { status: 200 });
    }) as typeof fetch;
    const first = await cachedLiveModels({ baseUrl: 'https://hit-cache.test/v1', apiKey: 'k' });
    const second = await cachedLiveModels({ baseUrl: 'https://hit-cache.test/v1/', apiKey: 'k' });
    expect(first?.map((m) => m.id)).toEqual(['shared-a']);
    expect(second).toEqual(first);
    expect(calls).toBe(1);
  });
});

describe('freeModelFallback � no-credits rescue', () => {
  it('picks the first free model of the same provider for a paid model', () => {
    const fallback = freeModelFallback('opencode-zen', 'muse-spark-1.2-contrast');
    expect(fallback).toBeDefined();
    expect(isFreeModel(fallback!)).toBe(true);
    expect(PROVIDERS['opencode-zen']!.models).toContain(fallback);
  });

  it('returns undefined when the model is already free', () => {
    for (const model of ['hy3-free', 'deepseek-v4-flash-free', 'big-pickle', 'deepseek/deepseek-v3.2-exp:free']) {
      expect(freeModelFallback('opencode-zen', model)).toBeUndefined();
    }
  });

  it('rescues openrouter paid models to a :free variant of the same provider', () => {
    const fallback = freeModelFallback('openrouter', 'anthropic/claude-opus-4.5');
    expect(fallback).toBeDefined();
    expect(isFreeModel(fallback!)).toBe(true);
    expect(fallback).toMatch(/:free$/);
  });

  it('returns undefined when the provider has no free models or is unknown', () => {
    const openai = PROVIDERS['openai']!;
    const paid = openai.models.find((m) => !isFreeModel(m)) ?? openai.defaultModel;
    expect(freeModelFallback('openai', paid)).toBeUndefined();
    expect(freeModelFallback('no-such-provider', 'whatever')).toBeUndefined();
  });

  it('covers opencode-zen statically; opencode-go relies on its live catalog', () => {
    // zen ships free promo models in the static registry — fallback is instant.
    expect((PROVIDERS['opencode-zen']!.models ?? []).some((m) => isFreeModel(m))).toBe(true);
    expect(freeModelFallback('opencode-zen', 'qwen3.8-max')).toBeDefined();
    // go is a subscription plan: no static -free models, so the static helper
    // correctly declines and the server falls back to a LIVE catalog lookup.
    expect((PROVIDERS['opencode-go']!.models ?? []).some((m) => isFreeModel(m))).toBe(false);
    expect(freeModelFallback('opencode-go', 'kimi-k3')).toBeUndefined();
  });
});

describe('modelCapabilityTier', () => {
  it('treats free/community models as the low tier regardless of metadata', () => {
    expect(modelCapabilityTier(undefined, 'grok-4-fast-free')).toBe('low');
    expect(modelCapabilityTier({ source: 'models.dev', outputPricePerMillion: 3 }, 'some-model:free')).toBe('low');
  });

  it('uses catalog price as the proxy for paid models', () => {
    expect(modelCapabilityTier({ source: 'models.dev', outputPricePerMillion: 10 }, 'claude-x')).toBe('high');
    expect(modelCapabilityTier({ source: 'models.dev', outputPricePerMillion: 0.5 }, 'mini-model')).toBe('standard');
  });

  it('defaults to standard when the catalog has no price info', () => {
    expect(modelCapabilityTier(undefined, 'unknown-model')).toBe('standard');
    expect(modelCapabilityTier({ source: 'models.dev' }, 'unknown-model')).toBe('standard');
  });
});
