/**
 * Universal Resource Discovery Engine (Deterministic Provider Discovery Engine)
 *
 * Converts high-level discovery intents into a bounded, deterministic graph of
 * safe read operations across any provider without additional LLM turns.
 *
 * Architecture:
 *   Model → intent-array → Discovery graph → verified safe reads → fact cache
 *   → secret redaction → ONE compact model message
 *
 * Safety invariants (all enforced before execution):
 *   • Only operations where risk === 'read' AND catalogVerification === 'verified'
 *     AND sideEffectFree === true are executed.
 *   • Writes are never auto-chained. Period.
 *   • Ambiguity (>1 resource match) stops execution and returns candidates.
 *   • Not-found (0 resource match) stops execution and returns NOT_FOUND.
 *   • Call and depth budgets are enforced; partial results are always returned.
 *   • Zero LLM calls are made internally.
 */

import type { CatalogOperation } from './catalog.js';

// ─── Discovery Intents ──────────────────────────────────────────────────────

export type DiscoveryIntent =
  | 'list_resources'
  | 'get_resource'
  | 'get_status'
  | 'get_configuration'
  | 'get_environment'
  | 'get_dependencies'
  | 'get_children';

// ─── Catalog Extension: verified discovery metadata ─────────────────────────

/** Verification level of a catalog operation's safety metadata. */
export type CatalogVerification = 'verified' | 'unverified';

/** Semantic role this operation plays in a discovery graph. */
export type DiscoveryRole =
  | 'list'          // enumerates resources of resourceType
  | 'detail'        // retrieves a single resource by id
  | 'status'        // operational state (health, lifecycle)
  | 'environment'   // env var / config variable collection
  | 'configuration' // structural configuration (not secrets)
  | 'children'      // child resources under the matched resource
  | 'dependencies'; // external dependencies (databases, services)

/**
 * Discovery-engine metadata attached to every CatalogOperation.
 * Only operations with this metadata (and catalogVerification === 'verified')
 * participate in auto-chained graph execution.
 */
export interface DiscoveryOperationMetadata {
  intent: DiscoveryIntent;
  role: DiscoveryRole;
  resourceType: string;
  /** Output field-paths this operation produces, e.g. ['application.id', 'application.name']. */
  produces: string[];
  /** Input field-paths required before this operation can execute. */
  requires: string[];
  parentResourceType?: string;
  sideEffectFree: boolean;
  catalogVerification: CatalogVerification;
}

// ─── Annotated catalog type ──────────────────────────────────────────────────

export interface AnnotatedCatalogOperation extends CatalogOperation {
  discovery?: DiscoveryOperationMetadata;
}

// ─── Discovery Request / Result ─────────────────────────────────────────────

export interface DiscoveryRequest {
  connectionId: string;
  /** One or more discovery intents to fulfil in a single bounded graph pass. */
  intents: DiscoveryIntent[];
  resourceType?: string;
  resourceIdOrName?: string;
  filters?: Record<string, string>;
  budget?: {
    /** Max chaining depth. Capped at ABSOLUTE_DISCOVERY_BUDGET.maxDepth. */
    maxDepth?: number;
    /** Max total network calls. Capped at ABSOLUTE_DISCOVERY_BUDGET.maxCalls. */
    maxCalls?: number;
  };
}

export type DiscoveryStopReason =
  | 'complete'
  | 'not_found'
  | 'ambiguous'
  | 'budget_exhausted'
  | 'unsupported'
  | 'permission_denied'
  | 'provider_error';

export interface DiscoveryCandidate {
  id: string;
  name?: string;
  type: string;
}

export interface DiscoveryResult {
  ok: boolean;
  connectionId: string;
  requestedIntents: DiscoveryIntent[];
  completedIntents: DiscoveryIntent[];
  matchedResource?: { id: string; name?: string; type: string };
  /** Secret-redacted, merged data from all executed operations. */
  data: Record<string, unknown>;
  /** Human-readable summary for the model (max ~500 chars). */
  summary: string;
  operationsExecuted: string[];
  stopReason: DiscoveryStopReason;
  candidates?: DiscoveryCandidate[];
  truncated: boolean;
}

// ─── Budget ──────────────────────────────────────────────────────────────────

const DEFAULT_DISCOVERY_BUDGET = { maxDepth: 3, maxCalls: 5 };
const ABSOLUTE_DISCOVERY_BUDGET = { maxDepth: 5, maxCalls: 10 };

function clampBudget(requested?: DiscoveryRequest['budget']): typeof DEFAULT_DISCOVERY_BUDGET {
  return {
    maxDepth: Math.min(requested?.maxDepth ?? DEFAULT_DISCOVERY_BUDGET.maxDepth, ABSOLUTE_DISCOVERY_BUDGET.maxDepth),
    maxCalls: Math.min(requested?.maxCalls ?? DEFAULT_DISCOVERY_BUDGET.maxCalls, ABSOLUTE_DISCOVERY_BUDGET.maxCalls),
  };
}

// ─── Fact Cache ───────────────────────────────────────────────────────────────

/** Cache freshness policy by discovery role. */
const CACHE_TTL_MS: Record<DiscoveryRole, number | 'run-scoped'> = {
  status: 30_000,           // 30 s — status can change
  list: 'run-scoped',
  detail: 'run-scoped',
  environment: 'run-scoped',
  configuration: 'run-scoped',
  children: 'run-scoped',
  dependencies: 'run-scoped',
};

interface CacheEntry {
  data: unknown;
  cachedAt: number;
  role: DiscoveryRole;
}

export class DiscoveryFactCache {
  private entries = new Map<string, CacheEntry>();

  private key(connectionId: string, operationId: string, args: Record<string, unknown>): string {
    return `${connectionId}:${operationId}:${JSON.stringify(args, Object.keys(args).sort())}`;
  }

  get(connectionId: string, operationId: string, args: Record<string, unknown>, role: DiscoveryRole): unknown | undefined {
    const entry = this.entries.get(this.key(connectionId, operationId, args));
    if (!entry) return undefined;
    const ttl = CACHE_TTL_MS[role];
    if (ttl === 'run-scoped') return entry.data;
    if (Date.now() - entry.cachedAt > ttl) return undefined; // expired
    return entry.data;
  }

  set(connectionId: string, operationId: string, args: Record<string, unknown>, role: DiscoveryRole, data: unknown): void {
    this.entries.set(this.key(connectionId, operationId, args), { data, cachedAt: Date.now(), role });
  }

  /**
   * Invalidate all run-scoped cached observations for a connection when a
   * successful write occurs. Short-TTL entries (status) expire naturally.
   */
  invalidateForWrite(connectionId: string): void {
    for (const [key, entry] of this.entries) {
      if (key.startsWith(`${connectionId}:`) && CACHE_TTL_MS[entry.role] === 'run-scoped') {
        this.entries.delete(key);
      }
    }
  }

  /** Number of cached entries (for testing). */
  size(): number {
    return this.entries.size;
  }
}

// ─── Secret Redaction ────────────────────────────────────────────────────────

const SECRET_PATTERNS = [
  /token/i, /secret/i, /password/i, /passwd/i, /pwd/i,
  /api[_-]?key/i, /\bauth\b/i, /credential/i, /database_url/i,
  /connection_string/i, /private[_-]?key/i,
];

function isSecretKey(key: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(key));
}

export function redactDiscoverySecrets(data: unknown): unknown {
  if (Array.isArray(data)) return data.map(redactDiscoverySecrets);
  if (data && typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      result[key] = isSecretKey(key) ? { present: true, redacted: true } : redactDiscoverySecrets(value);
    }
    return result;
  }
  return data;
}

// ─── Telemetry ────────────────────────────────────────────────────────────────

export interface DiscoveryTelemetry {
  requests: number;
  networkCalls: number;
  cacheHits: number;
  /** Model turns saved = discovery completions without model round-trips. */
  turnsSaved: number;
  ambiguous: number;
  notFound: number;
  budgetExhausted: number;
  durationMs: number;
}

export class DiscoveryTelemetryAccumulator {
  private data: DiscoveryTelemetry = {
    requests: 0,
    networkCalls: 0,
    cacheHits: 0,
    turnsSaved: 0,
    ambiguous: 0,
    notFound: 0,
    budgetExhausted: 0,
    durationMs: 0,
  };

  record(partial: Partial<DiscoveryTelemetry>): void {
    if (partial.requests) this.data.requests += partial.requests;
    if (partial.networkCalls) this.data.networkCalls += partial.networkCalls;
    if (partial.cacheHits) this.data.cacheHits += partial.cacheHits;
    if (partial.turnsSaved) this.data.turnsSaved += partial.turnsSaved;
    if (partial.ambiguous) this.data.ambiguous += partial.ambiguous;
    if (partial.notFound) this.data.notFound += partial.notFound;
    if (partial.budgetExhausted) this.data.budgetExhausted += partial.budgetExhausted;
    if (partial.durationMs) this.data.durationMs += partial.durationMs;
  }

  snapshot(): DiscoveryTelemetry {
    return { ...this.data };
  }
}

// ─── Resource Matching ───────────────────────────────────────────────────────

export function extractResourceList(data: unknown): Array<{ id: string; name?: string }> {
  const items: unknown[] = Array.isArray(data)
    ? data
    : (data && typeof data === 'object'
        ? (Object.values(data as object).find((v) => Array.isArray(v)) ?? [])
        : []) as unknown[];
  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const rec = item as Record<string, unknown>;
    const id = String(rec['id'] ?? rec['uuid'] ?? rec['uid'] ?? rec['name'] ?? '').trim();
    if (!id) return [];
    const name = typeof rec['name'] === 'string' ? rec['name'] : typeof rec['label'] === 'string' ? rec['label'] : undefined;
    return [{ id, name }];
  });
}

function matchResource(
  items: Array<{ id: string; name?: string }>,
  idOrName?: string,
): { matched: Array<{ id: string; name?: string }>; reason: 'exact' | 'prefix' | 'substring' | 'none' } {
  if (!idOrName) return { matched: items, reason: 'exact' };
  const lower = idOrName.toLowerCase();
  const exact = items.filter((item) => item.id.toLowerCase() === lower || item.name?.toLowerCase() === lower);
  if (exact.length > 0) return { matched: exact, reason: 'exact' };
  const prefix = items.filter(
    (item) => item.id.toLowerCase().startsWith(lower) || item.name?.toLowerCase().startsWith(lower),
  );
  if (prefix.length > 0) return { matched: prefix, reason: 'prefix' };
  const sub = items.filter((item) => item.id.toLowerCase().includes(lower) || item.name?.toLowerCase().includes(lower));
  return { matched: sub, reason: sub.length > 0 ? 'substring' : 'none' };
}

// ─── HTTP Execution Abstraction ───────────────────────────────────────────────

export type DiscoveryHttpFetcher = (params: {
  baseUrl: string;
  path: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
}) => Promise<{ ok: boolean; status: number; data: unknown; message: string }>;

// ─── Intent → Role Mapping ───────────────────────────────────────────────────

const INTENT_ROLES: Record<DiscoveryIntent, DiscoveryRole[]> = {
  list_resources:    ['list'],
  get_resource:      ['detail'],
  get_status:        ['status'],
  get_configuration: ['configuration'],
  get_environment:   ['environment'],
  get_dependencies:  ['dependencies'],
  get_children:      ['children'],
};

// ─── Universal Discovery Engine ──────────────────────────────────────────────

/** Ordered execution: list first (needed for id resolution), then detail, then rest in parallel. */
const ROLE_ORDER: DiscoveryRole[] = ['list', 'detail', 'status', 'environment', 'configuration', 'children', 'dependencies'];

export class UniversalDiscoveryEngine {
  constructor(
    private readonly operations: AnnotatedCatalogOperation[],
    private readonly cache: DiscoveryFactCache,
    private readonly telemetry: DiscoveryTelemetryAccumulator,
    private readonly fetcher: DiscoveryHttpFetcher,
    private readonly baseUrl: string,
    private readonly authHeaders: Record<string, string>,
  ) {}

  async discover(request: DiscoveryRequest): Promise<DiscoveryResult> {
    const start = Date.now();
    this.telemetry.record({ requests: 1 });
    const budget = clampBudget(request.budget);
    const completed: DiscoveryIntent[] = [];
    const executed: string[] = [];
    const merged: Record<string, unknown> = {};
    let networkCalls = 0;
    let cacheHits = 0;
    let matchedResource: { id: string; name?: string; type: string } | undefined;
    let candidates: DiscoveryCandidate[] | undefined;

    // Collect all needed roles across requested intents
    const neededRoles = new Set<DiscoveryRole>();
    for (const intent of request.intents) {
      for (const role of INTENT_ROLES[intent]) neededRoles.add(role);
    }

    // If any intent requires detail/env/etc and a resourceIdOrName is supplied,
    // we always need list first to resolve the canonical UUID.
    const needsIdResolution =
      request.resourceIdOrName &&
      (neededRoles.has('detail') || neededRoles.has('status') || neededRoles.has('environment') ||
       neededRoles.has('configuration') || neededRoles.has('children') || neededRoles.has('dependencies'));
    if (needsIdResolution) neededRoles.add('list');

    const orderedRoles = ROLE_ORDER.filter((r) => neededRoles.has(r));
    let stopReason: DiscoveryStopReason = 'complete';

    for (const role of orderedRoles) {
      const totalCalls = networkCalls + cacheHits;
      if (totalCalls >= budget.maxCalls || networkCalls >= budget.maxDepth) {
        stopReason = 'budget_exhausted';
        break;
      }

      // Skip roles that need an id but we haven't resolved one yet (shouldn't happen due to ordering, but guard anyway)
      const op = this.findOperation(role, request.resourceType);
      if (!op) continue; // role not supported by this provider's catalog

      const dm = op.discovery!;

      // If role requires a parent id and we don't have one yet, skip
      if (dm.requires.length > 0 && !matchedResource) continue;

      const args: Record<string, unknown> = matchedResource && dm.requires.length > 0 ? { id: matchedResource.id } : {};

      // Fact cache lookup
      const cached = this.cache.get(request.connectionId, op.id, args, role);
      if (cached !== undefined) {
        cacheHits++;
        merged[role] = cached;
        if (role === 'list' && request.resourceIdOrName) {
          const decision = this.resolveListResult(cached, request, role);
          if (decision.stop) { stopReason = decision.stopReason!; candidates = decision.candidates; break; }
          matchedResource = decision.matched;
        }
        this.markIntentsCompleted(role, request.intents, completed);
        executed.push(`${op.id} (cache)`);
        continue;
      }

      // Execute
      let result: { ok: boolean; status: number; data: unknown; message: string };
      try {
        // Build path: substitute :id or similar path templates if present
        const path = matchedResource ? op.path.replace(/:id\b|:uuid\b/, matchedResource.id) : op.path;
        result = await this.fetcher({ baseUrl: this.baseUrl, path, method: op.method, headers: this.authHeaders });
        networkCalls++;
      } catch {
        stopReason = 'provider_error';
        break;
      }

      if (!result.ok) {
        stopReason = result.status === 403 ? 'permission_denied' : 'provider_error';
        break;
      }

      this.cache.set(request.connectionId, op.id, args, role, result.data);
      merged[role] = result.data;
      executed.push(op.id);

      if (role === 'list' && request.resourceIdOrName) {
        const decision = this.resolveListResult(result.data, request, role);
        if (decision.stop) { stopReason = decision.stopReason!; candidates = decision.candidates; break; }
        matchedResource = decision.matched;
      } else if (role === 'list' && !request.resourceIdOrName) {
        // No filter — keep going, intents like list_resources are satisfied
      }

      this.markIntentsCompleted(role, request.intents, completed);
    }

    this.telemetry.record({
      networkCalls,
      cacheHits,
      turnsSaved: (stopReason === 'complete' || (stopReason === 'budget_exhausted' && executed.length > 0)) ? 1 : 0,
      ambiguous: stopReason === 'ambiguous' ? 1 : 0,
      notFound: stopReason === 'not_found' ? 1 : 0,
      budgetExhausted: stopReason === 'budget_exhausted' ? 1 : 0,
      durationMs: Date.now() - start,
    });

    const redacted = redactDiscoverySecrets(merged) as Record<string, unknown>;
    const ok = stopReason === 'complete' || (stopReason === 'budget_exhausted' && executed.length > 0);
    const summary = buildSummary({ stopReason, connectionId: request.connectionId, matchedResource, completed, candidates, executed, data: redacted });

    return {
      ok,
      connectionId: request.connectionId,
      requestedIntents: request.intents,
      completedIntents: completed,
      matchedResource,
      data: redacted,
      summary,
      operationsExecuted: executed,
      stopReason,
      candidates,
      truncated: stopReason === 'budget_exhausted',
    };
  }

  private resolveListResult(
    data: unknown,
    request: DiscoveryRequest,
    role: DiscoveryRole,
  ): { stop: boolean; stopReason?: DiscoveryStopReason; matched?: { id: string; name?: string; type: string }; candidates?: DiscoveryCandidate[] } {
    const items = extractResourceList(data);
    const match = matchResource(items, request.resourceIdOrName);
    return disambiguate(match, request.resourceIdOrName, request.resourceType ?? 'resource');
  }

  private findOperation(role: DiscoveryRole, resourceType?: string): AnnotatedCatalogOperation | undefined {
    // Prefer exact resourceType match, fall back to any role match
    const ops = this.operations.filter((op) => op.discovery && op.discovery.role === role && isSafeOp(op));
    if (resourceType) {
      const exact = ops.find((op) => op.discovery!.resourceType === resourceType);
      if (exact) return exact;
    }
    return ops[0];
  }

  private markIntentsCompleted(role: DiscoveryRole, requested: DiscoveryIntent[], completed: DiscoveryIntent[]): void {
    for (const intent of requested) {
      if (INTENT_ROLES[intent].includes(role) && !completed.includes(intent)) {
        completed.push(intent);
      }
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isSafeOp(op: AnnotatedCatalogOperation): boolean {
  const dm = op.discovery;
  return Boolean(dm && dm.sideEffectFree && dm.catalogVerification === 'verified' && op.risk === 'read');
}

function disambiguate(
  match: { matched: Array<{ id: string; name?: string }>; reason: string },
  idOrName: string | undefined,
  resourceType: string,
): { stop: boolean; stopReason?: DiscoveryStopReason; matched?: { id: string; name?: string; type: string }; candidates?: DiscoveryCandidate[] } {
  if (!idOrName) {
    if (match.matched.length === 0) return { stop: true, stopReason: 'not_found' };
    // No filter: take first for id resolution, continue normally
    return { stop: false, matched: { id: match.matched[0]!.id, name: match.matched[0]!.name, type: resourceType } };
  }
  if (match.matched.length === 0) return { stop: true, stopReason: 'not_found' };
  if (match.matched.length === 1) {
    return { stop: false, matched: { id: match.matched[0]!.id, name: match.matched[0]!.name, type: resourceType } };
  }
  return {
    stop: true,
    stopReason: 'ambiguous',
    candidates: match.matched.map((item) => ({ id: item.id, name: item.name, type: resourceType })),
  };
}

function buildSummary(ctx: {
  stopReason: DiscoveryStopReason;
  connectionId: string;
  matchedResource?: { id: string; name?: string; type: string };
  completed: DiscoveryIntent[];
  candidates?: DiscoveryCandidate[];
  executed: string[];
  data: Record<string, unknown>;
}): string {
  const { stopReason, connectionId, matchedResource, completed, candidates, executed, data } = ctx;
  const prefix = `[${connectionId}]`;
  switch (stopReason) {
    case 'not_found':
      return `${prefix} Resource not found. No matching resource was discovered.`;
    case 'ambiguous': {
      const names = (candidates ?? []).map((c) => c.name ?? c.id).slice(0, 5).join(', ');
      return `${prefix} Discovery stopped: multiple resources match. Candidates: ${names}. Clarify which one to use.`;
    }
    case 'permission_denied':
      return `${prefix} Discovery stopped: permission denied by provider.`;
    case 'provider_error':
      return `${prefix} Discovery stopped: provider returned an error.`;
    case 'unsupported':
      return `${prefix} Discovery stopped: requested intent is not supported by this provider's catalog.`;
    case 'budget_exhausted': {
      const keys = Object.keys(data).join(', ');
      return `${prefix} Discovery budget exhausted after ${executed.length} call(s). Partial data available for: ${keys || 'none'}.`;
    }
    default: {
      const res = matchedResource ? `${matchedResource.type} "${matchedResource.name ?? matchedResource.id}"` : 'resources';
      const intents = completed.join(', ');
      const envData = data['environment'];
      const envCount = envData && typeof envData === 'object' && !Array.isArray(envData) ? Object.keys(envData as object).length : undefined;
      const envNote = envCount !== undefined ? ` (${envCount} env var(s), secrets redacted)` : '';
      return `${prefix} Discovered ${res}. Completed: ${intents || 'none'}${envNote}. Operations: ${executed.join(', ')}.`;
    }
  }
}
