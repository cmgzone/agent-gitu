import { canonicalJson, nowIso, sha256 } from '../../util.js';

/**
 * Durable task evidence recorded from external provider reads.
 * Correlates observed provider state with state epochs so the model
 * and runtime can reuse cached facts while valid, and invalidate upon mutation.
 */
export interface ProviderEvidence {
  /** Unique evidence id (e.g. pe-1, pe-2) */
  id: string;
  connectionId: string;
  provider?: string;
  capability: string;
  operationId: string;
  resourceId?: string;
  paramsDigest: string;
  data: unknown;
  resultDigest: string;
  observedAt: string;
  stateEpoch: number;
}

export interface CachedDocRecord {
  url: string;
  contentDigest: string;
  facts?: Record<string, unknown>;
  retrievedAt: string;
}

/**
 * ProviderReadCache implements:
 * 1. Retrieval-before-fetch: Reuses cached provider data if state epoch has not changed.
 * 2. Remote-state epochs: Increments state version per resource on mutations.
 * 3. Intelligent scoped invalidation: Writes invalidate only related resources without wiping unrelated provider state.
 */
export class ProviderReadCache {
  private evidence = new Map<string, ProviderEvidence>();
  private evidenceCounter = 0;
  /** Keyed by `${connectionId}:${resourceType ?? '*'}:${resourceId ?? '*'}` */
  private remoteStateEpochs = new Map<string, number>();
  private docCache = new Map<string, CachedDocRecord>();

  private cacheKey(connectionId: string, capability: string, resourceId?: string, paramsDigest?: string): string {
    const digest = paramsDigest ?? 'none';
    return `${connectionId.toLowerCase()}:${capability.toLowerCase()}:${resourceId ?? '*'}:${digest}`;
  }

  private epochKey(connectionId: string, resourceType?: string, resourceId?: string): string {
    return `${connectionId.toLowerCase()}:${(resourceType ?? '*').toLowerCase()}:${(resourceId ?? '*').toLowerCase()}`;
  }

  getStateEpoch(connectionId: string, resourceType?: string, resourceId?: string): number {
    const key = this.epochKey(connectionId, resourceType, resourceId);
    return this.remoteStateEpochs.get(key) ?? 1;
  }

  advanceStateEpoch(connectionId: string, resourceType?: string, resourceId?: string): number {
    const key = this.epochKey(connectionId, resourceType, resourceId);
    const next = (this.remoteStateEpochs.get(key) ?? 1) + 1;
    this.remoteStateEpochs.set(key, next);

    // Also advance the general connection epoch if a specific resource was modified
    if (resourceId || resourceType) {
      const connKey = this.epochKey(connectionId, '*', '*');
      this.remoteStateEpochs.set(connKey, (this.remoteStateEpochs.get(connKey) ?? 1) + 1);
    }
    return next;
  }

  /**
   * Intelligently invalidate only related cached evidence.
   * Unrelated resources (e.g. databases on another server, other connections) remain intact.
   */
  invalidateForWrite(connectionId: string, resourceType?: string, resourceId?: string): void {
    const newEpoch = this.advanceStateEpoch(connectionId, resourceType, resourceId);
    const targetConn = connectionId.toLowerCase();
    const targetResource = resourceId?.toLowerCase();

    for (const [key, ev] of this.evidence.entries()) {
      if (ev.connectionId.toLowerCase() !== targetConn) continue;
      // If resourceId specified, invalidate matching resource or wildcard entries
      if (targetResource && ev.resourceId && ev.resourceId.toLowerCase() !== targetResource) {
        continue;
      }
      // Outdated epoch
      if (ev.stateEpoch < newEpoch) {
        this.evidence.delete(key);
      }
    }
  }

  /**
   * Retrieval-before-fetch lookup.
   * Returns matching ProviderEvidence only if it was observed under the current state epoch.
   */
  get(connectionId: string, capability: string, resourceId?: string, paramsDigest?: string): ProviderEvidence | undefined {
    const key = this.cacheKey(connectionId, capability, resourceId, paramsDigest);
    const entry = this.evidence.get(key);
    if (!entry) return undefined;

    const currentEpoch = this.getStateEpoch(connectionId, undefined, resourceId);
    if (entry.stateEpoch !== currentEpoch) {
      this.evidence.delete(key);
      return undefined;
    }
    return entry;
  }

  /**
   * Records newly observed provider data, generates an evidence ID, and caches it.
   */
  record(params: {
    connectionId: string;
    provider?: string;
    capability: string;
    operationId: string;
    resourceId?: string;
    params?: unknown;
    data: unknown;
  }): ProviderEvidence {
    this.evidenceCounter += 1;
    const evidenceId = `pe-${this.evidenceCounter}`;
    const paramsDigest = params.params ? sha256(canonicalJson(params.params)) : 'none';
    const resultDigest = sha256(canonicalJson(params.data));
    const stateEpoch = this.getStateEpoch(params.connectionId, undefined, params.resourceId);

    const record: ProviderEvidence = {
      id: evidenceId,
      connectionId: params.connectionId,
      provider: params.provider,
      capability: params.capability,
      operationId: params.operationId,
      resourceId: params.resourceId,
      paramsDigest,
      data: params.data,
      resultDigest,
      observedAt: nowIso(),
      stateEpoch,
    };

    const key = this.cacheKey(params.connectionId, params.capability, params.resourceId, paramsDigest);
    this.evidence.set(key, record);
    return record;
  }

  listEvidence(): ProviderEvidence[] {
    return [...this.evidence.values()];
  }

  getEvidenceById(id: string): ProviderEvidence | undefined {
    for (const ev of this.evidence.values()) {
      if (ev.id === id) return ev;
    }
    return undefined;
  }

  // ── Web / Documentation Fetch Cache ─────────────────────────────────────

  storeDoc(url: string, content: string, facts?: Record<string, unknown>): CachedDocRecord {
    const record: CachedDocRecord = {
      url,
      contentDigest: sha256(content),
      facts,
      retrievedAt: nowIso(),
    };
    this.docCache.set(url.toLowerCase(), record);
    return record;
  }

  getDoc(url: string): CachedDocRecord | undefined {
    return this.docCache.get(url.toLowerCase());
  }
}
