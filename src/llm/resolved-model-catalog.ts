import { codexSubscriptionInfo } from './codex-subscription.js';
import {
  allProviderSpecs,
  cachedLiveModels,
  fetchModelCatalog,
  isFreeModel,
  modelMetadataFor,
  providerKey,
  resolveSupportedImages,
  type ModelInfo,
} from './providers.js';

/** Injectable discovery boundaries; enrichment uses the shared provider helpers. */
export interface ModelCatalogDependencies {
  allProviderSpecs: typeof allProviderSpecs;
  providerKey: typeof providerKey;
  cachedLiveModels: typeof cachedLiveModels;
  fetchModelCatalog: typeof fetchModelCatalog;
  codexSubscriptionInfo: typeof codexSubscriptionInfo;
}

/** Preserve source order and the first explicit modality, without mutating cached rows. */
function normalizeModels(models: readonly ModelInfo[]): ModelInfo[] {
  const unique = new Map<string, ModelInfo>();
  for (const model of models) {
    const id = model.id.trim();
    if (!id) continue;
    const existing = unique.get(id);
    if (!existing) unique.set(id, { id, vision: model.vision });
    else if (existing.vision === undefined) existing.vision = model.vision;
  }
  return [...unique.values()];
}

/**
 * Shared, credential-free catalog response for any client. A nonempty normalized
 * live list replaces offline seeds, but never removes the configured default.
 */
export async function resolveModelCatalog(deps: Partial<ModelCatalogDependencies> = {}) {
  const catalogPromise = (deps.fetchModelCatalog ?? fetchModelCatalog)();
  const subscriptionPromise = (deps.codexSubscriptionInfo ?? codexSubscriptionInfo)();
  const providerRowsPromise = Promise.all(
    Object.values((deps.allProviderSpecs ?? allProviderSpecs)()).map(async (spec) => {
      const subscription = spec.auth === 'chatgpt-subscription' ? await subscriptionPromise : undefined;
      // Subscription auth must never consult or expose API keys.
      const keyInfo = spec.auth === 'chatgpt-subscription' ? undefined : (deps.providerKey ?? providerKey)(spec);
      let discovered: ModelInfo[] | undefined;
      if (subscription) {
        discovered = subscription.models;
      } else if (keyInfo || spec.publicModels) {
        // Shared with run-time image resolution; do not introduce a second cache.
        discovered = await (deps.cachedLiveModels ?? cachedLiveModels)({
          baseUrl: spec.baseUrl,
          apiKey: keyInfo?.key ?? '',
          timeoutMs: 6000,
        });
      }
      const liveModels = normalizeModels(discovered ?? []);
      const live = liveModels.length > 0;
      const defaultModel = spec.defaultModel.trim();
      const models = normalizeModels([
        ...(live ? liveModels : spec.models.map((id) => ({ id }))),
        { id: defaultModel },
      ]);
      return { spec, keyInfo, subscription, models, live, defaultModel };
    }),
  );
  const [catalog, providerRows] = await Promise.all([catalogPromise, providerRowsPromise]);
  const providers = providerRows.map(({ spec, keyInfo, subscription, models, live, defaultModel }) => ({
    id: spec.id,
    label: spec.label,
    defaultModel,
    hasKey: Boolean(keyInfo),
    auth: spec.auth ?? 'api-key',
    signedIn: subscription?.signedIn ?? false,
    planType: subscription?.planType,
    available: subscription?.available ?? true,
    usable: Boolean(keyInfo) || Boolean(subscription?.signedIn),
    publicModels: Boolean(spec.publicModels),
    live,
    models: models.map((mi) => ({
      id: mi.id,
      // Explicit live modality (including false) wins over catalog and heuristic.
      vision: mi.vision ?? resolveSupportedImages(catalog, spec.id, mi.id),
      free: isFreeModel(mi.id),
      metadata: modelMetadataFor(catalog, spec.id, mi.id),
    })),
    effortLevels: spec.effortLevels,
    effortLabels: spec.effortLabels,
    maxEffort: spec.maxEffort ?? 'collapses-to-high',
    keyEnvVars: spec.keyEnvVars,
    baseUrl: spec.baseUrl,
    custom: Boolean(spec.custom),
    toolMode: spec.toolMode ?? 'auto',
  }));
  return { providers, defaultProvider: providers.find((p) => p.usable)?.id ?? 'alibaba' };
}
