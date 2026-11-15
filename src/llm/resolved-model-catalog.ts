import { chatgptSubscriptionInfo } from './pi-chatgpt.js';
import { modelBrandFor } from './model-brand.js';
import {
  allProviderSpecs,
  cachedLiveModels,
  fetchModelCatalog,
  isFreeModel,
  modelMetadataFor,
  pickLiveDefaultModel,
  providerKey,
  resolveSupportedImages,
  type ModelInfo,
  type ModelMetadata,
} from './providers.js';

/** Injectable discovery boundaries; enrichment uses the shared provider helpers. */
export interface ModelCatalogDependencies {
  allProviderSpecs: typeof allProviderSpecs;
  providerKey: typeof providerKey;
  cachedLiveModels: typeof cachedLiveModels;
  fetchModelCatalog: typeof fetchModelCatalog;
  chatgptSubscriptionInfo: typeof chatgptSubscriptionInfo;
}

export interface ResolveModelCatalogOptions extends Partial<ModelCatalogDependencies> {
  forceRefresh?: boolean;
}

/** Preserve source order and the first explicit modality, without mutating cached rows. */
function normalizeModels(models: readonly ModelInfo[]): ModelInfo[] {
  const unique = new Map<string, ModelInfo>();
  for (const model of models) {
    const id = model.id.trim();
    if (!id) continue;
    const existing = unique.get(id);
    if (!existing) unique.set(id, { id, vision: model.vision, ...(model.ownedBy ? { ownedBy: model.ownedBy } : {}), ...(model.name ? { name: model.name } : {}), ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}), ...(model.maxOutputTokens ? { maxOutputTokens: model.maxOutputTokens } : {}), ...(model.inputPricePerMillion !== undefined ? { inputPricePerMillion: model.inputPricePerMillion } : {}), ...(model.outputPricePerMillion !== undefined ? { outputPricePerMillion: model.outputPricePerMillion } : {}) });
    else {
      if (existing.vision === undefined) existing.vision = model.vision;
      if (!existing.ownedBy && model.ownedBy) existing.ownedBy = model.ownedBy;
      if (!existing.name && model.name) existing.name = model.name;
      if (!existing.contextWindow && model.contextWindow) existing.contextWindow = model.contextWindow;
      if (!existing.maxOutputTokens && model.maxOutputTokens) existing.maxOutputTokens = model.maxOutputTokens;
      if (existing.inputPricePerMillion === undefined && model.inputPricePerMillion !== undefined) existing.inputPricePerMillion = model.inputPricePerMillion;
      if (existing.outputPricePerMillion === undefined && model.outputPricePerMillion !== undefined) existing.outputPricePerMillion = model.outputPricePerMillion;
    }
  }
  return [...unique.values()];
}

/**
 * Shared, credential-free catalog response for any client. A nonempty normalized
 * live list replaces offline seeds, keeping configured defaults unless the
 * provider's live catalog is marked authoritative (e.g. PikRouter / Pikpam).
 */
export async function resolveModelCatalog(deps: ResolveModelCatalogOptions = {}) {
  const forceRefresh = Boolean(deps.forceRefresh);
  const catalogPromise = (deps.fetchModelCatalog ?? fetchModelCatalog)();
  const subscriptionPromise = (deps.chatgptSubscriptionInfo ?? chatgptSubscriptionInfo)();
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
          ...(spec.modelsUrl ? { modelsUrl: spec.modelsUrl } : {}),
          apiKey: keyInfo?.key ?? '',
          timeoutMs: 6000,
          ...(forceRefresh ? { forceRefresh: true } : {}),
        });
      }
      const liveModels = normalizeModels(discovered ?? []);
      const live = liveModels.length > 0;
      const authoritativeLive = live && Boolean(spec.authoritativeLiveModels);
      // Authoritative live catalogs supply their own models and default without
      // injecting offline seed models; subscription plans own their default too.
      const defaultModel = (
        subscription?.models.find((model) => model.isDefault)?.id
        ?? (authoritativeLive ? pickLiveDefaultModel(spec, liveModels) : spec.defaultModel)
      ).trim();
      const models = authoritativeLive
        ? liveModels
        : normalizeModels([
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
    models: models.map((mi) => {
      const liveMeta: ModelMetadata | undefined = (mi.contextWindow || mi.maxOutputTokens || mi.inputPricePerMillion !== undefined || mi.outputPricePerMillion !== undefined)
        ? {
            ...(mi.contextWindow ? { contextTokens: mi.contextWindow } : {}),
            ...(mi.maxOutputTokens ? { outputTokens: mi.maxOutputTokens } : {}),
            ...(mi.inputPricePerMillion !== undefined ? { inputPricePerMillion: mi.inputPricePerMillion } : {}),
            ...(mi.outputPricePerMillion !== undefined ? { outputPricePerMillion: mi.outputPricePerMillion } : {}),
            source: 'models.dev',
          }
        : undefined;
      const catalogMeta = modelMetadataFor(catalog, spec.id, mi.id);
      const metadata: ModelMetadata | undefined = spec.authoritativeLiveModels
        ? (liveMeta ? { ...catalogMeta, ...liveMeta } : catalogMeta)
        : (catalogMeta ?? liveMeta);
      // The provider's own published name wins, then Gitu's alias knowledge for
      // ids the provider names nothing for, then the live models.dev name. The
      // UI humanizes the raw id when none of these exist.
      const label = mi.name ?? spec.modelLabels?.[mi.id] ?? metadata?.displayName;
      return {
        id: mi.id,
        ...(label ? { label } : {}),
        ...(mi.ownedBy ? { ownedBy: mi.ownedBy } : {}),
        brand: modelBrandFor(catalog, spec.id, mi, spec.custom),
        // Explicit live modality (including false) wins over catalog and heuristic.
        vision: mi.vision ?? resolveSupportedImages(catalog, spec.id, mi.id),
        free: isFreeModel(mi.id),
        metadata,
      };
    }),
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
