import path from 'node:path';
import { loadStoredKeys, removeStoredKey, setStoredKey } from '../llm/keys.js';
import type { PrerequisiteProvider, ProviderCapabilityResult, ProviderRecoveryInput, ProviderRecoveryResult } from '../recovery/prerequisites.js';
import { SkillStore } from '../skills/skills.js';
import type { Capability, ConnectionSetupHint, MissingPrerequisite } from '../types.js';
import { nowIso, readJson, writeJson } from '../util.js';
import { ensureGituHome } from '../workspace/home.js';
import { catalogCapabilityDeclared, catalogOperation, catalogOperationFor, catalogProvider } from './catalog.js';
import {
  UniversalDiscoveryEngine,
  DiscoveryFactCache,
  DiscoveryTelemetryAccumulator,
  type DiscoveryRequest,
  type DiscoveryResult,
  type DiscoveryTelemetry,
  type AnnotatedCatalogOperation,
} from './discovery-engine.js';

/**
 * A connection is deliberately not a model tool. It is a user-owned,
 * provider-neutral profile with a private credential reference and a small
 * allowlist of operations. Models can ask for a capability; they cannot invent
 * a URL, header, or credential at execution time.
 */
export type ConnectionOperationRisk = 'read' | 'reversible-write' | 'destructive';
export type ConnectionHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ConnectionOperation {
  id: string;
  label: string;
  capability: string;
  method: ConnectionHttpMethod;
  /** Static path relative to the provider origin. Query strings are not allowed. */
  path: string;
  risk: ConnectionOperationRisk;
}

export interface ConnectionOperationProposal {
  connectionId: string;
  operation: ConnectionOperation;
  body?: unknown;
  documentationUrl?: string;
  reason: string;
}

export interface ConnectionRejectedOperationRecord {
  operationId: string;
  capability: string;
  method: ConnectionHttpMethod;
  path: string;
  status: number;
  observedAt: string;
}

export interface ConnectionProfile {
  id: string;
  label: string;
  provider: string;
  baseUrl: string;
  documentationUrl?: string;
  capabilities: string[];
  operations: ConnectionOperation[];
  createdAt: string;
  updatedAt: string;
  lastValidatedAt?: string;
  lastValidationStatus?: 'ok' | 'failed';
  authState?: ConnectionAuthStateRecord;
  capabilityState?: ConnectionCapabilityStateRecord;
}

export interface ConnectionAuthStateRecord {
  status: 'valid' | 'invalid' | 'expired' | 'unknown';
  reason?: string;
  checkedAt?: string;
}

/**
 * Capability-level state and operation-level negative evidence are separate.
 * A 404 rejects the exact method/path that produced it; it does NOT prove the
 * whole capability is unavailable because another documented endpoint may
 * satisfy the same capability.
 */
export interface ConnectionCapabilityStateRecord {
  denied: string[];
  /** Legacy/diagnostic capability gaps. Never used to blacklist all paths. */
  missing: string[];
  rejectedOperations?: ConnectionRejectedOperationRecord[];
  discoveredAt?: string;
}

export interface ConnectionProfileView extends ConnectionProfile {
  hasCredential: boolean;
}

export type ConnectionState =
  | 'CONNECTED'
  | 'CONNECTED_MISSING_OPERATION'
  | 'CONNECTED_INSUFFICIENT_SCOPE'
  | 'AUTH_INVALID'
  | 'AUTH_EXPIRED'
  | 'PROVIDER_UNREACHABLE'
  | 'CONFIG_INVALID'
  | 'DISCOVERY_FAILED';

export type ConnectionResolution = 'existing' | 'discovered' | 'requires_approval' | 'insufficient_scope' | 'discovery_failed';

export interface ResolveConnectionOperationInput {
  connectionId?: string;
  providerHint?: string;
  operation?: ConnectionOperation;
  operationId?: string;
  capability?: string;
  riskLevel?: 'read' | 'reversible-write' | 'destructive';
  documented?: boolean;
}

export interface ResolveConnectionOperationResult {
  connectionId: string;
  connectionValid: boolean;
  operationAvailable: boolean;
  state: ConnectionState;
  resolution: ConnectionResolution;
  operation?: ConnectionOperation;
  capability?: string;
  operationId?: string;
  reason: string;
}

export interface ConnectionRecoveryDecision {
  action: 'reauth' | 'capability-resolution' | 'setup-new';
  state?: ConnectionState;
  reason: string;
}

export interface ConnectionRequirement {
  prerequisiteId: string;
  description: string;
  requiredFor: string;
  providerHint?: string;
  capabilities: string[];
  setup?: ConnectionSetupHint;
  requestType: 'reauth' | 'setup';
}

export interface ConnectionDraft {
  id?: string;
  label: string;
  provider: string;
  baseUrl: string;
  documentationUrl?: string;
  capabilities?: string[];
  operations?: ConnectionOperation[];
  token?: string;
}

export interface ConnectionInvocationResult {
  ok: boolean;
  status: number;
  message: string;
  data?: unknown;
}

const PROFILE_FILE = 'connections.json';
const ID_RE = /^[a-z][a-z0-9-]{0,62}$/;
const CAPABILITY_RE = /^[a-z][a-z0-9._-]{0,80}$/;
const OPERATION_RE = /^[a-z][a-z0-9-]{0,48}$/;
const METHODS = new Set<ConnectionHttpMethod>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const RISKS = new Set<ConnectionOperationRisk>(['read', 'reversible-write', 'destructive']);
const READ_CACHE_TTL_MS = 30_000;

function connectionFile(): string {
  return path.join(ensureGituHome().settings, PROFILE_FILE);
}

function slug(value: unknown, fallback = 'connection'): string {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
  return ID_RE.test(normalized) ? normalized : fallback;
}

function compactText(value: unknown, limit: number): string {
  return String(value ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
}

function normalizeCapabilities(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [];
  return [...new Set(raw.map((item) => String(item).trim().toLowerCase()).filter((item) => CAPABILITY_RE.test(item)))].slice(0, 24);
}

function normalizeAuthState(value: unknown): ConnectionAuthStateRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const status = raw['status'];
  if (status !== 'valid' && status !== 'invalid' && status !== 'expired' && status !== 'unknown') return undefined;
  const reason = typeof raw['reason'] === 'string' ? compactText(raw['reason'], 300) : undefined;
  const checkedAt = typeof raw['checkedAt'] === 'string' ? raw['checkedAt'].slice(0, 80) : undefined;
  return { status, ...(reason ? { reason } : {}), ...(checkedAt ? { checkedAt } : {}) };
}

function normalizeRejectedOperations(value: unknown): ConnectionRejectedOperationRecord[] {
  if (!Array.isArray(value)) return [];
  const out: ConnectionRejectedOperationRecord[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const raw = item as Record<string, unknown>;
    const operationId = slug(raw['operationId'], '');
    const capability = String(raw['capability'] ?? '').trim().toLowerCase();
    const method = String(raw['method'] ?? '').trim().toUpperCase() as ConnectionHttpMethod;
    const operationPath = String(raw['path'] ?? '').trim();
    const status = Number(raw['status']);
    const observedAt = typeof raw['observedAt'] === 'string' ? raw['observedAt'].slice(0, 80) : nowIso();
    if (!operationId || !CAPABILITY_RE.test(capability) || !METHODS.has(method)) continue;
    if (!/^\/[a-zA-Z0-9._~!$&'()*+,;=:@/%-]*$/.test(operationPath) || !Number.isInteger(status) || status < 400 || status > 599) continue;
    const key = `${method}:${operationPath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ operationId, capability, method, path: operationPath, status, observedAt });
    if (out.length >= 48) break;
  }
  return out;
}

function normalizeCapabilityState(value: unknown): ConnectionCapabilityStateRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const denied = normalizeCapabilities(raw['denied']);
  const missing = normalizeCapabilities(raw['missing']);
  const rejectedOperations = normalizeRejectedOperations(raw['rejectedOperations']);
  const discoveredAt = typeof raw['discoveredAt'] === 'string' ? raw['discoveredAt'].slice(0, 80) : undefined;
  if (denied.length === 0 && missing.length === 0 && rejectedOperations.length === 0 && !discoveredAt) return undefined;
  return { denied, missing, ...(rejectedOperations.length ? { rejectedOperations } : {}), ...(discoveredAt ? { discoveredAt } : {}) };
}

function isLocalHttp(url: URL): boolean {
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase());
}

function normalizeBaseUrl(value: unknown): string | undefined {
  try {
    const url = new URL(String(value ?? '').trim());
    if (url.username || url.password || url.search || url.hash) return undefined;
    if (url.protocol !== 'https:' && !isLocalHttp(url)) return undefined;
    if (url.pathname !== '/' && url.pathname !== '') return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

export function normalizeConnectionDocumentationUrl(value: unknown): string | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  try {
    const url = new URL(String(value).trim());
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeConnectionSetupHint(value: unknown): ConnectionSetupHint | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const label = compactText(raw['label'], 120);
  const baseUrl = normalizeBaseUrl(raw['baseUrl']);
  const documentationUrl = normalizeConnectionDocumentationUrl(raw['documentationUrl']);
  const validationPath = typeof raw['validationPath'] === 'string' && /^\/[a-zA-Z0-9._~!$&'()*+,;=:@/%-]*$/.test(raw['validationPath']) && !raw['validationPath'].includes('//') && !raw['validationPath'].includes('..') && !raw['validationPath'].includes('?') && !raw['validationPath'].includes('#')
    ? raw['validationPath']
    : undefined;
  const validationCapability = normalizeCapabilities([raw['validationCapability']])[0];
  const hint: ConnectionSetupHint = {
    ...(label ? { label } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    ...(documentationUrl ? { documentationUrl } : {}),
    ...(validationPath ? { validationPath } : {}),
    ...(validationCapability ? { validationCapability } : {}),
  };
  return Object.keys(hint).length ? hint : undefined;
}

export function normalizeConnectionOperation(value: unknown): ConnectionOperation | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const id = slug(raw['id'], '');
  const label = compactText(raw['label'], 120);
  const capability = String(raw['capability'] ?? '').trim().toLowerCase();
  const method = String(raw['method'] ?? '').trim().toUpperCase() as ConnectionHttpMethod;
  const operationPath = String(raw['path'] ?? '').trim();
  const risk = raw['risk'];
  if (!id || !OPERATION_RE.test(id) || !label || !CAPABILITY_RE.test(capability) || !METHODS.has(method) || !RISKS.has(risk as ConnectionOperationRisk)) return undefined;
  if (!/^\/[a-zA-Z0-9._~!$&'()*+,;=:@/%-]*$/.test(operationPath) || operationPath.includes('//') || operationPath.includes('..') || operationPath.includes('?') || operationPath.includes('#')) return undefined;
  if ((method === 'GET' && risk !== 'read') || (method !== 'GET' && risk === 'read')) return undefined;
  return { id, label, capability, method, path: operationPath, risk: risk as ConnectionOperationRisk };
}

function normalizeOperations(value: unknown): ConnectionOperation[] {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const out: ConnectionOperation[] = [];
  for (const item of raw) {
    const operation = normalizeConnectionOperation(item);
    if (!operation || seen.has(operation.id)) continue;
    seen.add(operation.id);
    out.push(operation);
    if (out.length >= 24) break;
  }
  return out;
}

export function canonicalOperationId(ref: string): string {
  const trimmed = String(ref ?? '').trim();
  if (!trimmed) return '';
  const lastSegment = trimmed.slice(trimmed.lastIndexOf('/') + 1);
  return lastSegment.trim();
}

const SECRET_BODY_FIELD_RE = /(?:token|secret|password|authorization|api[_-]?key|credential|cookie|private[_-]?key)/i;

export function normalizeConnectionOperationBody(value: unknown, depth = 0): unknown {
  if (depth > 8) throw new Error('Connection operation body is nested too deeply.');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Connection operation body contains an invalid number.');
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > 8_000) throw new Error('Connection operation body contains an oversized string.');
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 100) throw new Error('Connection operation body contains too many array values.');
    return value.map((item) => normalizeConnectionOperationBody(item, depth + 1));
  }
  if (!value || typeof value !== 'object') throw new Error('Connection operation body must be JSON data.');
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 100) throw new Error('Connection operation body contains too many fields.');
  const output: Record<string, unknown> = {};
  for (const [key, item] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,120}$/.test(key)) throw new Error('Connection operation body contains an unsafe field name.');
    if (SECRET_BODY_FIELD_RE.test(key)) throw new Error(`Connection operation body cannot include credential-like field "${key}". Use secure connection setup instead.`);
    output[key] = normalizeConnectionOperationBody(item, depth + 1);
  }
  return output;
}

function keyRef(id: string): string {
  return `GITU_CONNECTION_${id.toUpperCase().replace(/-/g, '_')}`;
}

function safeErrorStatus(status: number): string {
  if (status === 401 || status === 403) return 'Authentication or permission was rejected';
  if (status === 404) return 'The configured validation operation was not found';
  if (status === 429) return 'The provider is rate limited';
  if (status >= 500) return 'The provider is temporarily unavailable';
  return 'The provider rejected the request';
}

export type ConnectionInvocationOutcome = 'not-run' | 'sent-rejected' | 'sent-unknown';

export class ConnectionInvocationError extends Error {
  readonly outcome: ConnectionInvocationOutcome;
  readonly state: ConnectionState;
  readonly authEvident: boolean;

  constructor(outcome: ConnectionInvocationOutcome, message: string, state: ConnectionState = 'CONFIG_INVALID', authEvident = false) {
    super(message);
    this.name = 'ConnectionInvocationError';
    this.outcome = outcome;
    this.state = state;
    this.authEvident = authEvident;
  }
}

function redactProviderData(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]';
  if (typeof value === 'string') {
    return value.replace(/\b([a-z][a-z0-9+.-]*):\/\/[^\s/@:]+:[^\s/@]+@/gi, '$1://<redacted>@').slice(0, 4_000);
  }
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactProviderData(item, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
      out[key] = /(?:token|secret|password|authorization|api[_-]?key|credential)/i.test(key) ? '<redacted>' : redactProviderData(item, depth + 1);
    }
    return out;
  }
  return value;
}

async function boundedResponseData(response: Response, limit = 48 * 1024): Promise<unknown> {
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return '[response omitted: exceeds safe connection output limit]';
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const text = new TextDecoder().decode(bytes).trim();
  if (!text) return undefined;
  try { return redactProviderData(JSON.parse(text)); } catch { return redactProviderData(text); }
}

function profileFromUnknown(value: unknown): ConnectionProfile | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const id = slug(raw['id'], '');
  const label = compactText(raw['label'], 120);
  const provider = slug(raw['provider'], '');
  const baseUrl = normalizeBaseUrl(raw['baseUrl']);
  const capabilities = normalizeCapabilities(raw['capabilities']);
  const operations = normalizeOperations(raw['operations']);
  const createdAt = typeof raw['createdAt'] === 'string' ? raw['createdAt'].slice(0, 80) : nowIso();
  const updatedAt = typeof raw['updatedAt'] === 'string' ? raw['updatedAt'].slice(0, 80) : createdAt;
  const documentationUrl = normalizeConnectionDocumentationUrl(raw['documentationUrl']);
  const lastValidatedAt = typeof raw['lastValidatedAt'] === 'string' ? raw['lastValidatedAt'].slice(0, 80) : undefined;
  const lastValidationStatus = raw['lastValidationStatus'] === 'ok' || raw['lastValidationStatus'] === 'failed' ? raw['lastValidationStatus'] : undefined;
  const authState = normalizeAuthState(raw['authState']);
  const capabilityState = normalizeCapabilityState(raw['capabilityState']);
  if (!id || !label || !provider || !baseUrl || operations.length === 0) return undefined;
  return {
    id, label, provider, baseUrl, capabilities, operations, createdAt, updatedAt,
    ...(documentationUrl ? { documentationUrl } : {}),
    ...(lastValidatedAt ? { lastValidatedAt } : {}),
    ...(lastValidationStatus ? { lastValidationStatus } : {}),
    ...(authState ? { authState } : {}),
    ...(capabilityState ? { capabilityState } : {}),
  };
}

function profileMatches(profile: ConnectionProfile, requirement: ConnectionRequirement): boolean {
  const hint = slug(requirement.providerHint, '');
  if (hint && ![profile.id, profile.provider, slug(profile.label, '')].includes(hint)) return false;
  return requirement.capabilities.every((capability) => profile.capabilities.includes(capability));
}

function profilePlausiblyMatches(profile: ConnectionProfile, requirement: ConnectionRequirement): boolean {
  const hint = slug(requirement.providerHint, '');
  if (hint) return [profile.id, profile.provider, slug(profile.label, '')].includes(hint);
  return requirement.capabilities.some((capability) => profile.capabilities.includes(capability));
}

function requirementFrom(prerequisite: MissingPrerequisite): ConnectionRequirement {
  const setup = normalizeConnectionSetupHint(prerequisite.connectionSetup);
  return {
    prerequisiteId: prerequisite.id,
    description: prerequisite.description,
    requiredFor: prerequisite.requiredFor,
    ...(prerequisite.providerHint ? { providerHint: prerequisite.providerHint } : {}),
    capabilities: prerequisite.capabilities ?? [],
    ...(setup ? { setup } : {}),
    requestType: 'setup',
  };
}

function profileSkillInstructions(profile: ConnectionProfile): string {
  const operations = profile.operations.map((operation) => `- ${operation.id}: ${operation.label} (${operation.method} ${operation.path}; ${operation.risk}; capability ${operation.capability})`).join('\n');
  return [
    `Use the saved ${profile.label} connection when the task requires ${profile.provider} capabilities: ${profile.capabilities.join(', ') || 'general provider access'}.`,
    `Documentation: ${profile.documentationUrl ?? 'not configured'}.`,
    'The credential is stored separately by Agent Gitu. Never ask the user to paste it into chat, logs, source files, or a model prompt.',
    'Only registered operations may be invoked through the connection adapter. Read operations may be used for discovery; write or destructive operations require normal policy approval.',
    'Registered operations:',
    operations,
  ].join('\n');
}

type CachedRead = { storedAt: number; status: number; message: string; data?: unknown };

export class ConnectionRegistry {
  private discoveryCache = new DiscoveryFactCache();
  private discoveryTelemetry = new DiscoveryTelemetryAccumulator();
  /** Per-process authoritative read reuse. Mutations invalidate this by connection. */
  private readCache = new Map<string, CachedRead>();

  getDiscoveryTelemetry(): DiscoveryTelemetry { return this.discoveryTelemetry.snapshot(); }
  getDiscoveryCache(): DiscoveryFactCache { return this.discoveryCache; }

  private profiles(): ConnectionProfile[] {
    const raw = readJson<unknown>(connectionFile());
    const values: unknown[] = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object' && Array.isArray((raw as Record<string, unknown>)['connections'])
        ? (raw as Record<string, unknown>)['connections'] as unknown[]
        : [];
    const out: ConnectionProfile[] = [];
    const seen = new Set<string>();
    for (const value of values) {
      const profile = profileFromUnknown(value);
      if (!profile || seen.has(profile.id)) continue;
      seen.add(profile.id);
      out.push(profile);
    }
    return out;
  }

  private saveProfiles(profiles: ConnectionProfile[]): void {
    writeJson(connectionFile(), { version: 1, connections: profiles });
  }

  list(): ConnectionProfileView[] {
    const keys = loadStoredKeys();
    return this.profiles().map((profile) => ({ ...profile, hasCredential: Boolean(keys[keyRef(profile.id)]?.trim()) }));
  }

  get(id: string): ConnectionProfile | undefined {
    const normalized = slug(id, '');
    return normalized ? this.profiles().find((profile) => profile.id === normalized) : undefined;
  }

  resolveConnectionProfile(ref?: string): ConnectionProfile | undefined {
    if (!ref) return undefined;
    const raw = String(ref).trim();
    const normalized = slug(raw, '');
    const profiles = this.profiles();
    const exact = profiles.find((p) => p.id === raw || (normalized && p.id === normalized));
    if (exact) return exact;
    if (!normalized) return undefined;
    const byProvider = profiles.filter((p) => p.provider === normalized || slug(p.provider, '') === normalized || slug(p.label, '') === normalized);
    if (byProvider.length > 0) return byProvider.find((p) => this.credentialPresent(p.id)) ?? byProvider[0];
    const byFuzzy = profiles.filter((p) => p.id.includes(normalized) || normalized.includes(p.id) || p.provider.includes(normalized) || normalized.includes(p.provider) || slug(p.label, '').includes(normalized));
    if (byFuzzy.length > 0) return byFuzzy.find((p) => this.credentialPresent(p.id)) ?? byFuzzy[0];
    return undefined;
  }

  private rejectionKey(operation: Pick<ConnectionOperation, 'method' | 'path'>): string {
    return `${operation.method}:${operation.path}`;
  }

  private isRejectedOperation(id: string, operation: Pick<ConnectionOperation, 'method' | 'path'>): boolean {
    const rejected = this.get(id)?.capabilityState?.rejectedOperations ?? [];
    const key = this.rejectionKey(operation);
    return rejected.some((item) => `${item.method}:${item.path}` === key);
  }

  private recordOperationRejection(id: string, operation: ConnectionOperation, status: number): void {
    this.withProfile(id, (profile) => {
      const current = profile.capabilityState ?? { denied: [], missing: [] };
      const key = this.rejectionKey(operation);
      const rejectedOperations = (current.rejectedOperations ?? []).filter((item) => `${item.method}:${item.path}` !== key);
      rejectedOperations.push({ operationId: operation.id, capability: operation.capability, method: operation.method, path: operation.path, status, observedAt: nowIso() });
      profile.capabilityState = { ...current, rejectedOperations: rejectedOperations.slice(-48) };
    });
    this.readCache.delete(this.readCacheKey(id, operation));
  }

  private clearOperationRejection(id: string, operation: ConnectionOperation): void {
    this.withProfile(id, (profile) => {
      const current = profile.capabilityState;
      if (!current?.rejectedOperations?.length) return;
      const key = this.rejectionKey(operation);
      current.rejectedOperations = current.rejectedOperations.filter((item) => `${item.method}:${item.path}` !== key);
      if (current.rejectedOperations.length === 0) delete current.rejectedOperations;
    });
  }

  operation(id: string, operationId: string): ConnectionOperation | undefined {
    const canonical = canonicalOperationId(operationId);
    if (!canonical) return undefined;
    const profile = this.get(id) ?? this.resolveConnectionProfile(id);
    if (!profile) return undefined;
    const usable = (operation: ConnectionOperation): boolean => !this.isRejectedOperation(profile.id, operation);
    const exact = profile.operations.find((operation) => operation.id === canonical && usable(operation));
    if (exact) return exact;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const target = norm(canonical);
    const providerTarget = norm(`${profile.provider}${canonical}`);
    return profile.operations.find((operation) => {
      if (!usable(operation)) return false;
      const opNorm = norm(operation.id);
      return opNorm === target || norm(`${profile.provider}${operation.id}`) === target || opNorm === providerTarget;
    });
  }

  renderForAgent(): string {
    const profiles = this.list().filter((profile) => profile.hasCredential).slice(0, 12);
    if (profiles.length === 0) return 'No saved provider connections are currently available.';
    return profiles.map((profile) => {
      const readOperations = profile.operations.filter((operation) => operation.risk === 'read' && !this.isRejectedOperation(profile.id, operation)).map((operation) => `${operation.id} (${operation.capability})`).join(', ') || 'none';
      const writeOperations = profile.operations.filter((operation) => operation.risk !== 'read').map((operation) => `${operation.id} (${operation.method} ${operation.path}; ${operation.capability}; ${operation.risk})`).join(', ') || 'none';
      const rejected = profile.capabilityState?.rejectedOperations?.length ?? 0;
      return `- ${profile.id}: ${profile.label} [provider ${profile.provider}; capabilities ${profile.capabilities.join(', ') || 'none'}; read operations ${readOperations}; approved write operations ${writeOperations}${rejected ? `; rejected endpoints ${rejected}` : ''}]`;
    }).join('\n');
  }

  requirementFor(prerequisite: MissingPrerequisite): ConnectionRequirement {
    const requirement = requirementFrom(prerequisite);
    const saved = this.profiles().find((profile) => profileMatches(profile, requirement));
    if (!saved) return requirement;
    const validation = saved.operations.find((operation) => operation.id === 'validate') ?? saved.operations.find((operation) => operation.risk === 'read' && operation.method === 'GET');
    return { ...requirement, setup: { ...(requirement.setup ?? {}), label: saved.label, baseUrl: saved.baseUrl, ...(saved.documentationUrl ? { documentationUrl: saved.documentationUrl } : {}), ...(validation ? { validationPath: validation.path, validationCapability: validation.capability } : {}) } };
  }

  isConnectionRequestable(prerequisite: MissingPrerequisite): boolean {
    return Boolean(prerequisite.providerHint || prerequisite.capabilities?.length);
  }

  save(draft: ConnectionDraft): ConnectionProfileView {
    const existing = draft.id ? this.get(draft.id) : undefined;
    const id = slug(draft.id || draft.provider || draft.label, '');
    const label = compactText(draft.label, 120);
    const provider = slug(draft.provider, '');
    const baseUrl = normalizeBaseUrl(draft.baseUrl);
    const documentationUrl = normalizeConnectionDocumentationUrl(draft.documentationUrl);
    const capabilities = normalizeCapabilities(draft.capabilities);
    const operations = normalizeOperations(draft.operations);
    if (!id || !label || !provider || !baseUrl || operations.length === 0) throw new Error('Connection needs a name, provider, HTTPS endpoint (or localhost HTTP), and at least one safe operation.');
    if (operations.some((operation) => !capabilities.includes(operation.capability))) throw new Error('Each registered operation must use one of the connection capabilities.');
    const token = typeof draft.token === 'string' ? draft.token.trim() : '';
    if (!token && !loadStoredKeys()[keyRef(id)]?.trim()) throw new Error('An API key or token is required for a new connection.');
    if (token.length > 16_384) throw new Error('The credential is too large.');
    this.assertGeneratedSkillAvailable(id);
    const now = nowIso();
    const profile: ConnectionProfile = {
      id, label, provider, baseUrl, capabilities, operations,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      ...(documentationUrl ? { documentationUrl } : {}),
      ...(existing?.lastValidatedAt ? { lastValidatedAt: existing.lastValidatedAt } : {}),
      ...(existing?.lastValidationStatus ? { lastValidationStatus: existing.lastValidationStatus } : {}),
      ...(existing?.authState ? { authState: existing.authState } : {}),
      ...(existing?.capabilityState ? { capabilityState: existing.capabilityState } : {}),
    };
    this.saveProfiles([...this.profiles().filter((candidate) => candidate.id !== id), profile]);
    if (token) setStoredKey(keyRef(id), token);
    this.syncGlobalSkill(profile);
    return { ...profile, hasCredential: true };
  }

  remove(id: string): boolean {
    const profile = this.get(id);
    if (!profile) return false;
    this.saveProfiles(this.profiles().filter((candidate) => candidate.id !== profile.id));
    removeStoredKey(keyRef(profile.id));
    this.invalidateReadCache(profile.id);
    new SkillStore('', SkillStore.globalSkillsDir()).remove(`gitu-provider-${profile.id}`);
    return true;
  }

  private syncGlobalSkill(profile: ConnectionProfile): void {
    const skills = new SkillStore('', SkillStore.globalSkillsDir());
    const name = `gitu-provider-${profile.id}`;
    const existing = skills.get(name);
    const description = `Saved ${profile.provider} connection profile for ${profile.label}; credentials are kept separately.`;
    const instructions = profileSkillInstructions(profile);
    if (existing?.scope === 'global' && existing.createdBy === 'agent') {
      skills.update(name, { description, instructions, aliases: [profile.provider, profile.label], keywords: [profile.provider, ...profile.capabilities] });
    } else if (existing) {
      throw new Error(`A user-owned global skill named "${name}" already exists; rename it before saving this connection.`);
    } else {
      skills.create({ name, description, instructions, createdBy: 'agent', aliases: [profile.provider, profile.label], keywords: [profile.provider, ...profile.capabilities], requires: { capabilities: profile.capabilities }, risk: 'medium', scope: 'global' });
    }
  }

  private assertGeneratedSkillAvailable(id: string): void {
    const name = `gitu-provider-${id}`;
    const existing = new SkillStore('', SkillStore.globalSkillsDir()).get(name);
    if (existing && !(existing.scope === 'global' && existing.createdBy === 'agent')) throw new Error(`A user-owned global skill named "${name}" already exists; rename it before saving this connection.`);
  }

  private updateValidation(id: string, status: 'ok' | 'failed'): void {
    try {
      const profiles = this.profiles();
      const current = profiles.find((profile) => profile.id === id);
      if (!current) return;
      current.lastValidatedAt = nowIso();
      current.lastValidationStatus = status;
      current.updatedAt = nowIso();
      this.saveProfiles(profiles);
    } catch { /* best effort */ }
  }

  private withProfile(id: string, mutate: (profile: ConnectionProfile) => void): void {
    try {
      const profiles = this.profiles();
      const current = profiles.find((profile) => profile.id === id);
      if (!current) return;
      mutate(current);
      current.updatedAt = nowIso();
      this.saveProfiles(profiles);
    } catch { /* state recording is best-effort */ }
  }

  private recordAuth(id: string, status: 'valid' | 'invalid' | 'expired' | 'unknown', reason?: string): void {
    this.withProfile(id, (profile) => { profile.authState = { status, ...(reason ? { reason: compactText(reason, 300) } : {}), checkedAt: nowIso() }; });
  }

  private recordCapability(id: string, patch: { deny?: string[]; miss?: string[]; discovered?: boolean }): void {
    this.withProfile(id, (profile) => {
      const current = profile.capabilityState ?? { denied: [], missing: [] };
      const denied = [...new Set([...current.denied, ...(patch.deny ?? [])])].slice(0, 24);
      const missing = [...new Set([...current.missing, ...(patch.miss ?? [])])].filter((item) => !denied.includes(item)).slice(0, 24);
      profile.capabilityState = { ...current, denied, missing, ...(patch.discovered || current.discoveredAt ? { discoveredAt: current.discoveredAt ?? nowIso() } : {}) };
    });
  }

  authStateOf(id: string): ConnectionAuthStateRecord { return this.get(id)?.authState ?? { status: 'unknown' }; }
  capabilityStateOf(id: string): ConnectionCapabilityStateRecord { return this.get(id)?.capabilityState ?? { denied: [], missing: [] }; }
  private credentialPresent(id: string): boolean { return Boolean(loadStoredKeys()[keyRef(id)]?.trim()); }

  private readCacheKey(id: string, operation: Pick<ConnectionOperation, 'id' | 'method' | 'path'>): string {
    return `${id}:${operation.id}:${operation.method}:${operation.path}`;
  }

  private cachedRead(id: string, operation: ConnectionOperation): ConnectionInvocationResult | undefined {
    const key = this.readCacheKey(id, operation);
    const cached = this.readCache.get(key);
    if (!cached) return undefined;
    if (Date.now() - cached.storedAt > READ_CACHE_TTL_MS) { this.readCache.delete(key); return undefined; }
    return { ok: true, status: cached.status, message: `Reused fresh provider result for ${operation.label}; no network request was needed.`, ...(cached.data !== undefined ? { data: cached.data } : {}) };
  }

  private invalidateReadCache(id: string): void {
    const prefix = `${id}:`;
    for (const key of this.readCache.keys()) if (key.startsWith(prefix)) this.readCache.delete(key);
  }

  async invoke(id: string, operationId: string, body?: unknown): Promise<ConnectionInvocationResult> {
    const profile = this.get(id);
    if (!profile) throw new ConnectionInvocationError('not-run', 'Saved connection not found.', 'CONFIG_INVALID');
    const canonical = canonicalOperationId(operationId);
    const operation = profile.operations.find((candidate) => candidate.id === canonical);
    if (!operation) {
      this.recordCapability(profile.id, { miss: [canonical] });
      throw new ConnectionInvocationError('not-run', 'Connection operation is not registered.', 'CONNECTED_MISSING_OPERATION');
    }
    if (this.isRejectedOperation(profile.id, operation)) {
      throw new ConnectionInvocationError('not-run', `The exact endpoint ${operation.method} ${operation.path} was already rejected by the provider. Do not retry it unchanged; resolve a different documented operation or path.`, 'CONNECTED_MISSING_OPERATION');
    }
    const token = loadStoredKeys()[keyRef(profile.id)]?.trim();
    if (!token) {
      this.recordAuth(profile.id, 'invalid', 'The saved credential is missing.');
      throw new ConnectionInvocationError('not-run', 'Saved connection needs its credential added again.', 'AUTH_INVALID', true);
    }
    if (body !== undefined && operation.method === 'GET') throw new ConnectionInvocationError('not-run', 'A read-only GET operation cannot include a request body.', 'CONFIG_INVALID');
    if (operation.method === 'GET' && operation.risk === 'read') {
      const cached = this.cachedRead(profile.id, operation);
      if (cached) return cached;
    }
    let encoded: string | undefined;
    if (body !== undefined) {
      encoded = JSON.stringify(normalizeConnectionOperationBody(body));
      if (encoded.length > 64 * 1024) throw new ConnectionInvocationError('not-run', 'Connection request body is too large.', 'CONFIG_INVALID');
    }
    let response: Response;
    try {
      response = await fetch(new URL(operation.path, `${profile.baseUrl}/`), {
        method: operation.method,
        headers: { accept: 'application/json', authorization: `Bearer ${token}`, ...(encoded ? { 'content-type': 'application/json' } : {}) },
        ...(encoded ? { body: encoded } : {}),
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      this.updateValidation(profile.id, 'failed');
      throw new ConnectionInvocationError('sent-unknown', 'Connection request did not complete (network, timeout, or redirect). The provider may or may not have received it — verify provider state before any retry.', 'PROVIDER_UNREACHABLE');
    }
    if (!response.ok) {
      this.updateValidation(profile.id, 'failed');
      const detail = await boundedResponseData(response).catch(() => undefined);
      const detailText = detail === undefined ? '' : ` Provider said: ${JSON.stringify(detail).slice(0, 4_000)}`;
      if (response.status === 401) {
        const expired = /expired|revoked/i.test(detailText.toLowerCase());
        const state = expired ? 'AUTH_EXPIRED' : 'AUTH_INVALID';
        const statusLabel = expired ? 'Authentication or token is expired/revoked' : 'Authentication was rejected';
        this.recordAuth(profile.id, expired ? 'expired' : 'invalid', `HTTP 401${detailText}`.slice(0, 300));
        throw new ConnectionInvocationError('sent-rejected', `${statusLabel} (HTTP 401).${detailText}`, state, true);
      }
      if (response.status === 403) {
        this.recordCapability(profile.id, { deny: [operation.capability] });
        throw new ConnectionInvocationError('sent-rejected', `Permission or scope for "${operation.capability}" was denied (HTTP 403) — the credential itself is valid; the token lacks the required scope.${detailText}`, 'CONNECTED_INSUFFICIENT_SCOPE');
      }
      if (response.status === 404) {
        this.recordCapability(profile.id, { miss: [operation.capability] });
        this.recordOperationRejection(profile.id, operation, 404);
        throw new ConnectionInvocationError('sent-rejected', `The provider does not expose "${operation.path}" (HTTP 404) — this exact endpoint is now rejected and will not be retried unchanged. The connection and capability remain eligible for a different documented endpoint.${detailText}`, 'CONNECTED_MISSING_OPERATION');
      }
      if (response.status === 429 || response.status >= 500) throw new ConnectionInvocationError('sent-rejected', safeErrorStatus(response.status) + ` (HTTP ${response.status}).${detailText}`, 'PROVIDER_UNREACHABLE');
      throw new ConnectionInvocationError('sent-rejected', `${safeErrorStatus(response.status)} (HTTP ${response.status}).${detailText}`, 'CONFIG_INVALID');
    }
    this.updateValidation(profile.id, 'ok');
    this.recordAuth(profile.id, 'valid');
    let data: unknown;
    try { data = await boundedResponseData(response); }
    catch {
      throw new ConnectionInvocationError('sent-unknown', `The provider accepted the operation (HTTP ${response.status}) but its response could not be read. Treat the operation as POSSIBLY completed — verify provider state before re-running anything non-idempotent.`, 'PROVIDER_UNREACHABLE');
    }
    this.clearOperationRejection(profile.id, operation);
    const message = `${operation.label} succeeded (HTTP ${response.status}).`;
    if (operation.risk === 'read') {
      this.readCache.set(this.readCacheKey(profile.id, operation), { storedAt: Date.now(), status: response.status, message, ...(data !== undefined ? { data } : {}) });
    } else {
      this.discoveryCache.invalidateForWrite(profile.id);
      this.invalidateReadCache(profile.id);
    }
    return { ok: true, status: response.status, message, ...(data !== undefined ? { data } : {}) };
  }

  async discover(request: DiscoveryRequest): Promise<DiscoveryResult> {
    const profile = this.get(request.connectionId) ?? this.resolveConnectionProfile(request.connectionId);
    if (!profile) return { ok: false, connectionId: request.connectionId, requestedIntents: request.intents, completedIntents: [], data: {}, summary: `Connection "${request.connectionId}" not found.`, operationsExecuted: [], stopReason: 'not_found', truncated: false };
    const token = loadStoredKeys()[keyRef(profile.id)]?.trim();
    const catalogOps = ((catalogProvider(profile.provider)?.operations ?? []) as AnnotatedCatalogOperation[]).filter((operation) => !this.isRejectedOperation(profile.id, operation as ConnectionOperation));
    const headers: Record<string, string> = { accept: 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) };
    const fetcher = async ({ baseUrl, path, method, headers: reqHeaders }: { baseUrl: string; path: string; method: string; headers: Record<string, string> }) => {
      const response = await fetch(new URL(path, `${baseUrl}/`), { method, headers: reqHeaders, redirect: 'error', signal: AbortSignal.timeout(15_000) });
      const data = await boundedResponseData(response).catch(() => undefined);
      return { ok: response.ok, status: response.status, data: data ?? {}, message: response.ok ? 'ok' : `HTTP ${response.status}` };
    };
    return new UniversalDiscoveryEngine(catalogOps, this.discoveryCache, this.discoveryTelemetry, fetcher, profile.baseUrl, headers).discover({ ...request, connectionId: profile.id });
  }

  async invokeRead(id: string, operationId: string): Promise<ConnectionInvocationResult> {
    const operation = this.operation(id, operationId);
    if (!operation) {
      this.recordCapability(id, { miss: [canonicalOperationId(operationId)] });
      throw new ConnectionInvocationError('not-run', 'Connection operation is not registered or its exact endpoint was already rejected.', 'CONNECTED_MISSING_OPERATION');
    }
    if (operation.risk !== 'read' || operation.method !== 'GET') throw new Error('Only registered read-only GET connection operations may be used by an agent.');
    return this.invoke(id, operation.id);
  }

  async resolveAndExecuteRead(input: ResolveConnectionOperationInput): Promise<ConnectionInvocationResult> {
    const resolution = this.resolveConnectionOperation(input);
    if (resolution.resolution === 'insufficient_scope') throw new ConnectionInvocationError('not-run', resolution.reason, 'CONNECTED_INSUFFICIENT_SCOPE');
    if (resolution.resolution === 'requires_approval') throw new ConnectionInvocationError('not-run', 'Safe reads never use the approval channel; the operation was classified as a write. Use the exact registered GET operation.', 'CONFIG_INVALID');
    if (resolution.resolution === 'discovery_failed' || !resolution.operation) throw new ConnectionInvocationError('not-run', resolution.reason, resolution.state === 'CONNECTED_MISSING_OPERATION' ? 'CONNECTED_MISSING_OPERATION' : 'DISCOVERY_FAILED');
    return this.invokeRead(resolution.connectionId, resolution.operation.id);
  }

  safestRead(preferredConnectionId?: string): { connectionId: string; operationId: string } | undefined {
    const tokens = loadStoredKeys();
    const profiles = this.profiles().filter((profile) => Boolean(tokens[keyRef(profile.id)]?.trim())).sort((a, b) => Number(b.id === preferredConnectionId) - Number(a.id === preferredConnectionId));
    for (const profile of profiles) {
      const read = profile.operations.find((candidate) => candidate.risk === 'read' && candidate.method === 'GET' && !this.isRejectedOperation(profile.id, candidate));
      if (read) return { connectionId: profile.id, operationId: read.id };
    }
    return undefined;
  }

  registerApprovedOperation(id: string, candidate: ConnectionOperation, documentedCapability = false): ConnectionOperation {
    const profile = this.get(id);
    if (!profile) throw new Error('Saved connection not found.');
    const operation = normalizeConnectionOperation(candidate);
    if (!operation) throw new Error('Connection operation is malformed or has an unsafe method/risk combination.');
    const capabilityKnown = profile.capabilities.includes(operation.capability) || documentedCapability || catalogCapabilityDeclared(profile.provider, operation.capability);
    if (!capabilityKnown) throw new Error(`Saved connection does not declare capability "${operation.capability}", and no documented provider catalog entry or verified documentation supports adding it. Add the capability through a documented connection_operation proposal or secure connection setup.`);
    const existing = profile.operations.find((item) => item.id === operation.id);
    if (existing) {
      if (JSON.stringify(existing) === JSON.stringify(operation)) return existing;
      // A provider-rejected operation id may be safely retargeted to a new,
      // documented endpoint. Non-rejected ids remain immutable.
      if (!this.isRejectedOperation(profile.id, existing)) throw new Error(`Connection operation id "${operation.id}" is already registered with different details.`);
      const capabilities = [...new Set([...profile.capabilities, operation.capability])];
      this.save({ id: profile.id, label: profile.label, provider: profile.provider, baseUrl: profile.baseUrl, ...(profile.documentationUrl ? { documentationUrl: profile.documentationUrl } : {}), capabilities, operations: profile.operations.map((item) => item.id === operation.id ? operation : item) });
      return operation;
    }
    const capabilities = [...new Set([...profile.capabilities, operation.capability])];
    this.save({ id: profile.id, label: profile.label, provider: profile.provider, baseUrl: profile.baseUrl, ...(profile.documentationUrl ? { documentationUrl: profile.documentationUrl } : {}), capabilities, operations: [...profile.operations, operation] });
    this.recordCapability(profile.id, { discovered: true });
    return operation;
  }

  resolveConnectionOperation(input: ResolveConnectionOperationInput): ResolveConnectionOperationResult {
    const profile = this.pickConnection(input);
    if (!profile) return { connectionId: input.connectionId ?? 'unknown', connectionValid: false, operationAvailable: false, state: 'CONFIG_INVALID', resolution: 'discovery_failed', reason: 'No saved connection matched; the connection profile does not exist.' };
    if (!this.credentialPresent(profile.id)) {
      this.recordAuth(profile.id, 'invalid', 'The saved credential is missing.');
      return { connectionId: profile.id, connectionValid: false, operationAvailable: false, state: 'AUTH_INVALID', resolution: 'discovery_failed', reason: 'The saved credential is missing — reauthenticate to restore this connection.' };
    }
    const auth = this.authStateOf(profile.id);
    if (auth.status === 'invalid' || auth.status === 'expired') return { connectionId: profile.id, connectionValid: false, operationAvailable: false, state: auth.status === 'expired' ? 'AUTH_EXPIRED' : 'AUTH_INVALID', resolution: 'discovery_failed', reason: auth.reason ?? 'Authentication was positively rejected or expired — reauthorize to restore this connection.' };

    const capability = input.capability ?? input.operation?.capability;
    const denied = this.capabilityStateOf(profile.id).denied;
    if (capability && denied.includes(capability)) return { connectionId: profile.id, connectionValid: true, operationAvailable: false, state: 'CONNECTED_INSUFFICIENT_SCOPE', resolution: 'insufficient_scope', capability, reason: `The credential is valid but the token lacks scope for "${capability}". Expand authorization once; do not recreate the connection.` };

    if (input.operation) {
      const wanted = normalizeConnectionOperation(input.operation);
      if (!wanted) return { connectionId: profile.id, connectionValid: true, operationAvailable: false, state: 'CONFIG_INVALID', resolution: 'discovery_failed', reason: 'The proposed operation is malformed or has an unsafe method/risk combination.' };
      if (this.isRejectedOperation(profile.id, wanted)) {
        return { connectionId: profile.id, connectionValid: true, operationAvailable: false, state: 'CONNECTED_MISSING_OPERATION', resolution: 'discovery_failed', operation: wanted, capability: wanted.capability, reason: `The exact endpoint ${wanted.method} ${wanted.path} was already rejected by the provider. Do not retry it unchanged; find a different documented endpoint for "${wanted.capability}".` };
      }
      const registered = this.operation(profile.id, wanted.id);
      if (registered) {
        if (JSON.stringify(registered) !== JSON.stringify(wanted)) return { connectionId: profile.id, connectionValid: true, operationAvailable: false, state: 'CONNECTED_MISSING_OPERATION', resolution: 'discovery_failed', reason: `An operation with id "${wanted.id}" exists with different details. Use the registered operation exactly.` };
        return { connectionId: profile.id, connectionValid: true, operationAvailable: true, state: 'CONNECTED', resolution: 'existing', operation: registered, capability: registered.capability, reason: 'The operation is already registered on the saved connection.' };
      }
      return this.operateOn(profile, wanted, 'documented proposal', Boolean(input.documented));
    }

    if (input.operationId) {
      const canonical = canonicalOperationId(input.operationId);
      const registered = this.operation(profile.id, canonical);
      if (registered) return { connectionId: profile.id, connectionValid: true, operationAvailable: true, state: 'CONNECTED', resolution: 'existing', operation: registered, capability: registered.capability, reason: 'The operation is already registered.' };
      const catalogOp = catalogOperation(profile.provider, canonical);
      if (catalogOp) return this.operateOn(profile, catalogOp as ConnectionOperation, 'registered provider catalog');
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      const target = norm(canonical);
      const catalogEntries = (catalogProvider(profile.provider)?.operations ?? []) as ConnectionOperation[];
      const fuzzyCatalogOp = catalogEntries.find((op) => norm(op.id) === target || norm(`${profile.provider}${op.id}`) === target);
      if (fuzzyCatalogOp) return this.operateOn(profile, fuzzyCatalogOp, 'registered provider catalog');
      return { connectionId: profile.id, connectionValid: true, operationAvailable: false, state: 'DISCOVERY_FAILED', resolution: 'discovery_failed', operationId: canonical, reason: `Operation "${canonical}" is not registered on this connection and no verified-documentation catalog entry matches. The saved credential is still valid.` };
    }

    if (capability) {
      const risk = input.riskLevel ?? 'read';
      const known = this.operationForCapability(profile.id, capability);
      if (known) return { connectionId: profile.id, connectionValid: true, operationAvailable: true, state: 'CONNECTED', resolution: 'existing', operation: known, capability, reason: 'A registered operation already covers the requested capability.' };
      const catalogOp = catalogOperationFor(profile.provider, capability, risk);
      if (catalogOp) return this.operateOn(profile, catalogOp as ConnectionOperation, 'registered provider catalog');
      return { connectionId: profile.id, connectionValid: true, operationAvailable: false, state: 'DISCOVERY_FAILED', resolution: 'discovery_failed', capability, reason: `Capability "${capability}" is not registered and no verified-documentation catalog entry exists for provider "${profile.provider}". The saved credential is still valid.` };
    }

    return { connectionId: profile.id, connectionValid: true, operationAvailable: false, state: 'DISCOVERY_FAILED', resolution: 'discovery_failed', reason: 'No concrete operation or capability was supplied for resolution.' };
  }

  private pickConnection(input: ResolveConnectionOperationInput): ConnectionProfile | undefined {
    if (input.connectionId) { const resolved = this.resolveConnectionProfile(input.connectionId); if (resolved) return resolved; }
    if (input.providerHint) {
      const hint = slug(input.providerHint, '');
      const matches = this.list().filter((profile) => profile.hasCredential && [profile.id, profile.provider, slug(profile.provider, ''), slug(profile.label, '')].includes(hint));
      return matches.length ? matches[0] : undefined;
    }
    return undefined;
  }

  private operationForCapability(id: string, capability: string): ConnectionOperation | undefined {
    const candidates = (this.get(id)?.operations ?? []).filter((operation) => !this.isRejectedOperation(id, operation));
    return candidates.find((operation) => operation.capability === capability && operation.risk === 'read' && operation.method === 'GET') ?? candidates.find((operation) => operation.capability === capability);
  }

  private operateOn(profile: ConnectionProfile, operation: ConnectionOperation, source: string, documented = false): ResolveConnectionOperationResult {
    if (operation.risk === 'read' && operation.method === 'GET') {
      if (this.isRejectedOperation(profile.id, operation)) return { connectionId: profile.id, connectionValid: true, operationAvailable: false, state: 'CONNECTED_MISSING_OPERATION', resolution: 'discovery_failed', operation, capability: operation.capability, reason: `The exact endpoint ${operation.method} ${operation.path} was already rejected by the provider. Resolve another documented endpoint instead of retrying it.` };
      if (!profile.capabilities.includes(operation.capability) && !catalogCapabilityDeclared(profile.provider, operation.capability) && !documented) {
        return { connectionId: profile.id, connectionValid: true, operationAvailable: false, state: 'DISCOVERY_FAILED', resolution: 'discovery_failed', operation, capability: operation.capability, reason: `The documented read operation "${operation.id}" is known, but capability "${operation.capability}" is not declared for this connection and no verified documentation or catalog entry supports adding it.` };
      }
      const registered = this.registerApprovedOperation(profile.id, operation, true);
      return { connectionId: profile.id, connectionValid: true, operationAvailable: true, state: 'CONNECTED', resolution: 'discovered', operation: registered, capability: registered.capability, reason: `Registered ${source} read operation "${registered.id}" on the existing connection; the saved credential was reused. The operation remains eligible only while provider evidence does not reject its exact endpoint.` };
    }
    return { connectionId: profile.id, connectionValid: true, operationAvailable: false, state: 'CONNECTED_MISSING_OPERATION', resolution: 'requires_approval', operation, capability: operation.capability, reason: `Operation-ready proposal for "write/destructive" action "${operation.id}" from ${source}; it needs operation-level approval and will then be registered. No credential re-entry is required.` };
  }

  connectionRecoveryDecision(prerequisite: MissingPrerequisite): ConnectionRecoveryDecision {
    const requirement = this.requirementFor(prerequisite);
    const matching = this.list().filter((profile) => profile.hasCredential && profilePlausiblyMatches(profile, requirement));
    if (matching.length === 0) return { action: 'setup-new', reason: 'No saved connection matches this prerequisite yet; first-time secure setup is legitimate.' };
    const invalid = matching.filter((profile) => { const auth = this.authStateOf(profile.id); return auth.status === 'invalid' || auth.status === 'expired'; }).length;
    if (matching.length === 1 && invalid === 1) {
      const auth = this.authStateOf(matching[0]!.id);
      return { action: 'reauth', state: auth.status === 'expired' ? 'AUTH_EXPIRED' : 'AUTH_INVALID', reason: auth.reason ?? 'The saved credential was positively rejected (or expired) by the provider.' };
    }
    const missing = requirement.capabilities.filter((capability) => !matching.some((profile) => profile.capabilities.includes(capability)));
    return { action: 'capability-resolution', state: missing.length > 0 ? 'CONNECTED_MISSING_OPERATION' : 'DISCOVERY_FAILED', reason: missing.length > 0 ? `A saved connection matches, but capability${missing.length > 1 ? 'ies' : ''} ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not registered. Resolve a different usable operation when an endpoint has been rejected; do NOT re-enter the credential.` : 'A saved connection matches and validates; the unresolved need is capability-level. Resolve a usable documented operation — do NOT re-enter the credential.' };
  }

  async validate(id: string): Promise<ConnectionInvocationResult> {
    const profile = this.get(id);
    if (!profile) throw new Error('Saved connection not found.');
    const operation = profile.operations.find((candidate) => candidate.id === 'validate' && !this.isRejectedOperation(profile.id, candidate)) ?? profile.operations.find((candidate) => candidate.risk === 'read' && candidate.method === 'GET' && !this.isRejectedOperation(profile.id, candidate));
    if (!operation) throw new Error('Connection needs a usable registered read-only GET validation operation.');
    return this.invoke(profile.id, operation.id);
  }

  asPrerequisiteProvider(): PrerequisiteProvider {
    const registry = this;
    return {
      id: 'saved-connections',
      get capabilities(): Capability[] {
        return registry.list().flatMap((profile) => profile.capabilities.map((capability) => ({ id: capability, provider: profile.provider, actions: ['discover'], riskClass: 'read' as const })));
      },
      async resolveCapability(input: { providerHint?: string; capabilities: string[] }): Promise<ProviderCapabilityResult> {
        if (input.capabilities.length === 0) return { status: 'unresolved', registeredReads: 0, awaitingApproval: [], summary: 'No capability was requested for resolution.' };
        const hint = slug(input.providerHint ?? '', '');
        const candidates = registry.list().filter((profile) => profile.hasCredential && (hint ? [profile.id, profile.provider, slug(profile.label, '')].includes(hint) : input.capabilities.some((capability) => profile.capabilities.includes(capability))));
        if (candidates.length === 0) return { status: 'unresolved', registeredReads: 0, awaitingApproval: [], summary: 'No saved connection with a credential matches these capabilities.' };
        if (candidates.length > 1) return { status: 'needs-user', registeredReads: 0, awaitingApproval: [], summary: 'Multiple saved connections can meet this capability; the host routes the choice.' };
        const profile = candidates[0]!;
        const check = registry.resolveConnectionOperation({ connectionId: profile.id, capability: input.capabilities[0], riskLevel: 'read' });
        if (check.connectionValid === false && (check.state === 'AUTH_INVALID' || check.state === 'AUTH_EXPIRED')) return { status: 'unresolved', registeredReads: 0, awaitingApproval: [], healthyConnection: false, summary: `Saved connection "${profile.label}" was positively rejected by the provider — reauthorization is required.` };
        let registeredReads = 0;
        const awaitingApproval: string[] = [];
        for (const capability of input.capabilities) {
          const outcome = check.capability === capability ? check : registry.resolveConnectionOperation({ connectionId: profile.id, capability, riskLevel: 'read' });
          if (outcome.resolution === 'discovered') registeredReads += 1;
          if (outcome.resolution === 'requires_approval') awaitingApproval.push(capability);
          if (outcome.resolution === 'insufficient_scope') awaitingApproval.push(`${capability}:insufficient-scope`);
        }
        return { status: 'resolved', healthyConnection: true, registeredReads, awaitingApproval, summary: `Validated saved connection "${profile.label}" for ${input.capabilities.join(', ')}${registeredReads > 0 ? `; registered ${registeredReads} documented read operation(s) under the existing credential.` : ''}${awaitingApproval.length > 0 ? `; ${awaitingApproval.length} write capability(ies) still need operation approval.` : ''} Its credential remains private.` };
      },
      async discover(input: ProviderRecoveryInput): Promise<ProviderRecoveryResult> {
        const requirement = registry.requirementFor(input.prerequisite);
        const matches = registry.list().filter((profile) => profile.hasCredential && profileMatches(profile, requirement));
        if (matches.length === 0) return { status: 'unresolved', summary: 'No compatible saved connection is configured.' };
        if (matches.length > 1) return { status: 'needs-user', summary: 'More than one saved connection can meet this prerequisite.', candidates: matches.map((profile) => ({ id: profile.id, label: profile.label })) };
        const profile = matches[0]!;
        try {
          await registry.validate(profile.id);
          return { status: 'resolved', source: 'existing-resource', reference: profile.id, summary: `Validated saved connection "${profile.label}" for ${requirement.description}; its credential remains private.` };
        } catch (error) {
          return { status: 'unresolved', summary: `Saved connection "${profile.label}" could not be validated: ${(error as Error).message}` };
        }
      },
    };
  }
}
