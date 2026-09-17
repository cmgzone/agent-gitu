import { describe, expect, it, vi } from 'vitest';
import { resolveModelCatalog, type ModelCatalogDependencies } from '../src/llm/resolved-model-catalog.js';
import { parseModelCatalog, type ModelInfo, type ProviderSpec } from '../src/llm/providers.js';

function spec(id: string, overrides: Partial<ProviderSpec> = {}): ProviderSpec {
  return {
    id,
    label: `${id} label`,
    baseUrl: `https://${id}.example.test/v1`,
    keyEnvVars: [`${id.toUpperCase()}_KEY`],
    defaultModel: `${id}-default`,
    models: [`${id}-seed`],
    effortLevels: ['low', 'high'],
    ...overrides,
  };
}

// Every I/O boundary is injected: no network, workspace settings, keys or Codex.
function dependencies(specs: ProviderSpec[]) {
  return {
    allProviderSpecs: vi.fn<ModelCatalogDependencies['allProviderSpecs']>(() => Object.fromEntries(specs.map((s) => [s.id, s]))),
    providerKey: vi.fn<ModelCatalogDependencies['providerKey']>(() => undefined),
    cachedLiveModels: vi.fn<ModelCatalogDependencies['cachedLiveModels']>(async () => undefined),
    fetchModelCatalog: vi.fn<ModelCatalogDependencies['fetchModelCatalog']>(async () => undefined),
    codexSubscriptionInfo: vi.fn<ModelCatalogDependencies['codexSubscriptionInfo']>(async () => ({ available: false, signedIn: false, models: [] })),
  };
}

const ids = (row: Awaited<ReturnType<typeof resolveModelCatalog>>['providers'][number]) => row.models.map((m) => m.id);

describe('resolveModelCatalog', () => {
  it('discovers unknown models, replaces seeds and enriches normalized IDs with live modality precedence', async () => {
    const deps = dependencies([spec('alpha', { publicModels: true })]);
    const discovered = [
      { id: ' future-release:free ', vision: false },
      { id: 'catalog-only' },
      { id: 'new-vision-model' },
      { id: 'unrecognized', vision: true },
    ];
    deps.cachedLiveModels.mockResolvedValue(discovered);
    deps.fetchModelCatalog.mockResolvedValue(parseModelCatalog({
      alpha: { models: {
        'future-release:free': { modality: { input: ['image'] }, limit: { context: 12345 }, cost: { input: 0.25 } },
        'catalog-only': { modality: { input: ['image'] } },
        'alpha-default': { cost: { output: 2 } },
      } },
    }));
    const { providers, defaultProvider } = await resolveModelCatalog(deps);
    const row = providers[0]!;
    expect(ids(row)).toEqual(['future-release:free', 'catalog-only', 'new-vision-model', 'unrecognized', 'alpha-default']);
    expect(row.models[0]).toMatchObject({ id: 'future-release:free', vision: false, free: true, metadata: { source: 'models.dev', contextTokens: 12345, inputPricePerMillion: 0.25, vision: true } });
    expect(row.models[1]?.vision).toBe(true);
    expect(row.models[2]).toEqual({ id: 'new-vision-model', vision: true, free: false, metadata: undefined });
    expect(row.models[3]?.vision).toBe(true);
    expect(row.models[4]?.metadata?.outputPricePerMillion).toBe(2);
    expect(row).toMatchObject({ live: true, hasKey: false, usable: false, publicModels: true });
    expect(defaultProvider).toBe('alibaba');
    expect(deps.cachedLiveModels).toHaveBeenCalledWith({ baseUrl: 'https://alpha.example.test/v1', apiKey: '', timeoutMs: 6000 });
    expect(discovered[0]?.id).toBe(' future-release:free ');
  });

  it('deduplicates provider-locally, preserving the first explicit modality and cached inputs', async () => {
    const deps = dependencies([
      spec('alpha', { publicModels: true, defaultModel: ' shared ' }),
      spec('beta', { publicModels: true, defaultModel: 'shared' }),
    ]);
    const alpha = Object.freeze([
      Object.freeze({ id: ' shared ' }),
      Object.freeze({ id: '' }),
      Object.freeze({ id: ' \t ' }),
      Object.freeze({ id: 'shared', vision: false }),
      Object.freeze({ id: 'shared', vision: true }),
      Object.freeze({ id: 'alpha-only' }),
    ]);
    deps.cachedLiveModels.mockImplementation(async ({ baseUrl }) => baseUrl.includes('alpha') ? [...alpha] : [{ id: 'shared', vision: true }, { id: 'beta-only' }]);
    deps.fetchModelCatalog.mockResolvedValue(parseModelCatalog({
      alpha: { models: { shared: { cost: { input: 1 } } } },
      beta: { models: { shared: { cost: { input: 9 } } } },
    }));
    const { providers } = await resolveModelCatalog(deps);
    expect(ids(providers[0]!)).toEqual(['shared', 'alpha-only']);
    expect(ids(providers[1]!)).toEqual(['shared', 'beta-only']);
    expect(providers[0]?.defaultModel).toBe('shared');
    expect(providers[0]?.models[0]).toMatchObject({ vision: false, metadata: { inputPricePerMillion: 1 } });
    expect(providers[1]?.models[0]).toMatchObject({ vision: true, metadata: { inputPricePerMillion: 9 } });
    expect(alpha[0]).toEqual({ id: ' shared ' });
  });

  it('preserves custom defaults and every provider response field without leaking keys', async () => {
    const custom = spec('custom-team', {
      custom: true, defaultModel: 'team-choice', toolMode: 'structured_text',
      effortLabels: { high: 'Deep' }, maxEffort: 'distinct',
    });
    const deps = dependencies([spec('public', { publicModels: true }), custom, spec('later')]);
    deps.providerKey.mockImplementation((s) => s.id === 'public' ? undefined : { key: 'fake-secret', envVar: s.keyEnvVars[0]! });
    deps.cachedLiveModels.mockResolvedValue([{ id: 'new-release' }]);
    const result = await resolveModelCatalog(deps);
    expect(result.defaultProvider).toBe('custom-team');
    expect(result.providers[1]).toEqual({
      id: custom.id, label: custom.label, defaultModel: 'team-choice',
      hasKey: true, auth: 'api-key', signedIn: false, planType: undefined,
      available: true, usable: true, publicModels: false, live: true,
      models: [
        { id: 'new-release', vision: false, free: false, metadata: undefined },
        { id: 'team-choice', vision: false, free: false, metadata: undefined },
      ],
      effortLevels: custom.effortLevels, effortLabels: { high: 'Deep' }, maxEffort: 'distinct',
      keyEnvVars: custom.keyEnvVars, baseUrl: custom.baseUrl, custom: true, toolMode: 'structured_text',
    });
    expect(deps.cachedLiveModels).toHaveBeenCalledWith({ baseUrl: custom.baseUrl, apiKey: 'fake-secret', timeoutMs: 6000 });
    expect(JSON.stringify(result)).not.toContain('fake-secret');
  });

  it.each<ModelInfo[] | undefined>([undefined, [], [{ id: '  ' }]])('falls back to normalized offline seeds when discovery is unusable (%j)', async (fetched) => {
    const deps = dependencies([spec('offline', {
      publicModels: true, models: [' seed-free ', '', 'seed-free', '\t', 'plain'], defaultModel: ' configured ',
    })]);
    deps.cachedLiveModels.mockResolvedValue(fetched);
    const { providers, defaultProvider } = await resolveModelCatalog(deps);
    expect(ids(providers[0]!)).toEqual(['seed-free', 'plain', 'configured']);
    expect(providers[0]).toMatchObject({ live: false, defaultModel: 'configured', maxEffort: 'collapses-to-high', toolMode: 'auto', custom: false });
    expect(providers[0]?.models[0]?.free).toBe(true);
    expect(defaultProvider).toBe('alibaba');
  });

  it('skips private discovery without a key and drops blank defaults without duplicating seed defaults', async () => {
    const deps = dependencies([
      spec('private', { models: ['same', ' same '], defaultModel: ' same ' }),
      spec('blank', { models: [' ', ''], defaultModel: ' ' }),
    ]);
    const { providers } = await resolveModelCatalog(deps);
    expect(ids(providers[0]!)).toEqual(['same']);
    expect(ids(providers[1]!)).toEqual([]);
    expect(providers.every((p) => !p.hasKey && !p.usable && !p.live && p.available)).toBe(true);
    expect(deps.cachedLiveModels).not.toHaveBeenCalled();
  });

  it('uses the injected subscription callback once, retains its default and bypasses API-key discovery', async () => {
    const deps = dependencies([spec('subscription', { auth: 'chatgpt-subscription' })]);
    deps.codexSubscriptionInfo.mockResolvedValue({
      available: true, signedIn: true, planType: 'plus',
      models: [' future-subscription-model ', 'future-subscription-model', ''].map((id) => ({
        id, vision: true, effortLevels: ['high'], isDefault: true,
      })),
    });
    const { providers, defaultProvider } = await resolveModelCatalog(deps);
    expect(ids(providers[0]!)).toEqual(['future-subscription-model', 'subscription-default']);
    expect(providers[0]).toMatchObject({ auth: 'chatgpt-subscription', hasKey: false, signedIn: true, planType: 'plus', available: true, usable: true, live: true });
    expect(providers[0]?.models[0]?.vision).toBe(true);
    expect(defaultProvider).toBe('subscription');
    expect(deps.codexSubscriptionInfo).toHaveBeenCalledTimes(1);
    expect(deps.providerKey).not.toHaveBeenCalled();
    expect(deps.cachedLiveModels).not.toHaveBeenCalled();
  });

  it.each([true, false])('preserves signed-out subscription availability (%s) with offline seeds and default', async (available) => {
    const deps = dependencies([spec('subscription', { auth: 'chatgpt-subscription' })]);
    deps.codexSubscriptionInfo.mockResolvedValue({ available, signedIn: false, models: [] });
    const { providers, defaultProvider } = await resolveModelCatalog(deps);
    expect(ids(providers[0]!)).toEqual(['subscription-seed', 'subscription-default']);
    expect(providers[0]).toMatchObject({ available, signedIn: false, usable: false, hasKey: false, live: false });
    expect(defaultProvider).toBe('alibaba');
    expect(deps.providerKey).not.toHaveBeenCalled();
    expect(deps.cachedLiveModels).not.toHaveBeenCalled();
  });
});
