import { afterEach, describe, expect, it } from 'vitest';
import { PROVIDERS, ProviderError, fetchLiveModels, modelSupportsImages, resolveLlm } from '../src/llm/providers.js';

const WS_URL = 'https://ws-rn94romkyqmcy5ka.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1';

describe('provider registry', () => {
  it('registers alibaba with the workspace endpoint and current qwen default', () => {
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

describe('modelSupportsImages', () => {
  it('flags multimodal opencode models and keeps text-only ones clean', () => {
    for (const vision of ['claude-sonnet-4-5', 'gemini-3-flash', 'gpt-5.2', 'grok-4.5', 'kimi-k3', 'glm-5.2', 'qwen3.8-max']) {
      expect(modelSupportsImages(vision)).toBe(true);
    }
    for (const textOnly of ['deepseek-v4-flash', 'deepseek-v4-pro', 'gpt-5.3-codex', 'minimax-m3']) {
      expect(modelSupportsImages(textOnly)).toBe(false);
    }
  });
});
