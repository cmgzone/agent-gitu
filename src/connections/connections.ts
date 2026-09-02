import path from 'node:path';
import { loadStoredKeys, removeStoredKey, setStoredKey } from '../llm/keys.js';
import type { PrerequisiteProvider, ProviderCapabilityResult, ProviderRecoveryInput, ProviderRecoveryResult } from '../recovery/prerequisites.js';
import { SkillStore } from '../skills/skills.js';
import type { Capability, ConnectionSetupHint, MissingPrerequisite } from '../types.js';
import { nowIso, readJson, writeJson } from '../util.js';
import { ensureGituHome } from '../workspace/home.js';
import { catalogCapabilityDeclared, catalogOperationFor } from './catalog.js';

/**
 * A connection is deliberately not a model tool.  It is a user-owned,
 * provider-neutral profile with a private credential reference and a small
 * allowlist of operations.  Models can ask for a capability; they cannot
 * invent a URL, header, or credential at execution time.
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

/**
 * A provider-neutral operation proposed from documentation or prior read
 * discovery. It is not executable until the host has validated it against a
 * saved connection and the user has approved the individual invocation.
 */
export interface ConnectionOperationProposal {
  connectionId: string;
  operation: ConnectionOperation;
  /** Exact JSON body for this invocation. Never contains credentials. */
  body?: unknown;
  /** Documentation consulted before making the proposal, for user review. */
  documentationUrl?: string;
  reason: string;
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
  /**
   * Auth validity of the SAVED credential, persisted separately from what the
   * connection can execute. Missing-credential and HTTP-401/expired-revoked
   * responses are the only positive authentication signals. NEVER derived
   * from capability state: a missing operation does not invalidate auth.
   */
  authState?: ConnectionAuthStateRecord;
  /**
   * What the saved connection can and cannot execute, persisted separately
   * from auth validity. NEVER derived from auth state: an invalid credential
   * does not prove a capability was never granted.
   */
  capabilityState?: ConnectionCapabilityStateRecord;
}

/** Credential validity, evaluated only from authentication evidence. */
export interface ConnectionAuthStateRecord {
  status: 'valid' | 'invalid' | 'expired' | 'unknown';
  reason?: string;
  checkedAt?: string;
}

/** Operation availability, evaluated independently of credential validity. */
export interface ConnectionCapabilityStateRecord {
  /** Capability ids positively rejected by the provider (typically HTTP 403 —
   * insufficient scope, NOT invalid credentials). */
  denied: string[];
  /** Capability ids the provider reported as missing (HTTP 404 / unknown). */
  missing: string[];
  /** When the last capability discovery/registration ran. */
  discoveredAt?: string;
}

export interface ConnectionProfileView extends ConnectionProfile {
  hasCredential: boolean;
}

/** Explicit connection lifecycle states for recovery routing. */
export type ConnectionState =
  | 'CONNECTED'
  | 'CONNECTED_MISSING_OPERATION'
  | 'CONNECTED_INSUFFICIENT_SCOPE'
  | 'AUTH_INVALID'
  | 'AUTH_EXPIRED'
  | 'PROVIDER_UNREACHABLE'
  | 'CONFIG_INVALID'
  | 'DISCOVERY_FAILED';

/** Result of the provider-neutral capability resolver. */
export type ConnectionResolution = 'existing' | 'discovered' | 'requires_approval' | 'insufficient_scope' | 'discovery_failed';

export interface ResolveConnectionOperationInput {
  /** Exact saved connection id. Required except when resolving a prerequisite
   * by providerHint — then the host picks the matching credentialed profile. */
  connectionId?: string;
  /** Matches the saved profile's provider slug when no connection id is given. */
  providerHint?: string;
  /** Documented operation proposal from official API documentation. */
  operation?: ConnectionOperation;
  /** Capability-only resolution (e.g. a prerequisite's declared capability). */
  capability?: string;
  /** Desired risk class when no concrete operation is supplied. */
  riskLevel?: 'read' | 'reversible-write' | 'destructive';
}

export interface ResolveConnectionOperationResult {
  connectionId: string;
  connectionValid: boolean;
  operationAvailable: boolean;
  state: ConnectionState;
  resolution: ConnectionResolution;
  /** The operation that exists, was discovered, or needs approval. */
  operation?: ConnectionOperation;
  capability?: string;
  reason: string;
}

/** Routing decision a host makes for exhausted prerequisite recovery. */
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
  /** How the secure connection form should be framed. */
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
  /** Accepted only by the local server endpoint; never persisted in profile data. */
  token?: string;
}

export interface ConnectionRequirement {
  prerequisiteId: string;
  description: string;
  requiredFor: string;
  providerHint?: string;
  capabilities: string[];
  setup?: ConnectionSetupHint;
  /** How the secure connection form should be framed. */
  requestType: 'reauth' | 'setup';
}

export interface ConnectionInvocationResult {
  ok: boolean;
  status: number;
  message: string;
  /** Bounded provider output with secret-like fields removed. */
  data?: unknown;
}

const PROFILE_FILE = 'connections.json';
const ID_RE = /^[a-z][a-z0-9-]{0,62}$/;
const CAPABILITY_RE = /^[a-z][a-z0-9._-]{0,80}$/;
const OPERATION_RE = /^[a-z][a-z0-9-]{0,48}$/;
const METHODS = new Set<ConnectionHttpMethod>(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const RISKS = new Set<ConnectionOperationRisk>(['read', 'reversible-write', 'destructive']);

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

function normalizeCapabilityState(value: unknown): ConnectionCapabilityStateRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const denied = normalizeCapabilities(raw['denied']);
  const missing = normalizeCapabilities(raw['missing']);
  const discoveredAt = typeof raw['discoveredAt'] === 'string' ? raw['discoveredAt'].slice(0, 80) : undefined;
  if (denied.length === 0 && missing.length === 0 && !discoveredAt) return undefined;
  return { denied, missing, ...(discoveredAt ? { discoveredAt } : {}) };
}

function isLocalHttp(url: URL): boolean {
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase());
}

function normalizeBaseUrl(value: unknown): string | undefined {
  try {
    const url = new URL(String(value ?? '').trim());
    if (url.username || url.password || url.search || url.hash) return undefined;
    if (url.protocol !== 'https:' && !isLocalHttp(url)) return undefined;
    // Profiles use origin + static operation paths.  This prevents an
    // operation path from being silently composed under an arbitrary prefix.
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

/** Validate only the non-secret convenience values allowed to prefill the
 * secure connection card. Invalid values are discarded rather than displayed
 * as authoritative provider configuration. */
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
  // GET operations are discovery only. Every provider mutation must carry an
  // explicit non-read risk, so it cannot slip through the read path.
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

const SECRET_BODY_FIELD_RE = /(?:token|secret|password|authorization|api[_-]?key|credential|cookie|private[_-]?key)/i;

/** Clone a bounded JSON body and reject credentials before any operation is
 * approved, persisted, logged, or sent to a provider. */
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

/**
 * What an invocation failure actually means for a NON-IDEMPOTENT write:
 * - 'not-run'       — refused before anything left the process; safe to retry.
 * - 'sent-rejected' — the request REACHED the provider and was refused; verify
 *                     server state before retrying (partial effects possible).
 * - 'sent-unknown'  — sent, outcome unconfirmed (transport died mid-flight, or
 *                     a 2xx whose response could not be read); re-running a
 *                     write can duplicate resources.
 * Reporting every failure as "not run" invites duplicate writes and blind
 * retry loops; the outcome class drives honest agent guidance.
 */
export type ConnectionInvocationOutcome = 'not-run' | 'sent-rejected' | 'sent-unknown';

export class ConnectionInvocationError extends Error {
  readonly outcome: ConnectionInvocationOutcome;
  /**
   * Explicit connection state at failure time. MISSING_OPERATION is not
   * INVALID_CONNECTION: a 404/unknown operation never downgrades the saved
   * credential to "needs re-entry".
   */
  readonly state: ConnectionState;
  /** True only when the failure is POSITIVELY an authentication failure
   * (HTTP 401, expired/revoked credential, missing credential). HTTP 403 is
   * scope-related and is never auth evidence. */
  readonly authEvident: boolean;

  constructor(
    outcome: ConnectionInvocationOutcome,
    message: string,
    state: ConnectionState = 'CONFIG_INVALID',
    authEvident = false,
  ) {
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
    return value
      .replace(/\b([a-z][a-z0-9+.-]*):\/\/[^\s/@:]+:[^\s/@]+@/gi, '$1://<redacted>@')
      .slice(0, 4_000);
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

/** Looser match for RECOVERY ROUTING: a saved connection for the same
 * provider already proves the user connected it once — missing capabilities
 * must not present as "no connection at all". */
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

/** Persistent provider-neutral connection registry. Profile metadata and the
 * credential are intentionally kept in separate local files. */
export class ConnectionRegistry {
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

  operation(id: string, operationId: string): ConnectionOperation | undefined {
    return this.get(id)?.operations.find((operation) => operation.id === operationId);
  }

  renderForAgent(): string {
    const profiles = this.list().filter((profile) => profile.hasCredential).slice(0, 12);
    if (profiles.length === 0) return 'No saved provider connections are currently available.';
    return profiles.map((profile) => {
      const readOperations = profile.operations
        .filter((operation) => operation.risk === 'read')
        .map((operation) => `${operation.id} (${operation.capability})`)
        .join(', ') || 'none';
      const writeOperations = profile.operations
        .filter((operation) => operation.risk !== 'read')
        .map((operation) => `${operation.id} (${operation.method} ${operation.path}; ${operation.capability}; ${operation.risk})`)
        .join(', ') || 'none';
      return `- ${profile.id}: ${profile.label} [provider ${profile.provider}; capabilities ${profile.capabilities.join(', ') || 'none'}; read operations ${readOperations}; approved write operations ${writeOperations}]`;
    }).join('\n');
  }

  requirementFor(prerequisite: MissingPrerequisite): ConnectionRequirement {
    const requirement = requirementFrom(prerequisite);
    // A profile without its credential is still valuable: its known endpoint,
    // documentation, and validation route let the user reconnect by entering
    // only a fresh API key instead of retyping configuration.
    const saved = this.profiles().find((profile) => profileMatches(profile, requirement));
    if (!saved) return requirement;
    const validation = saved.operations.find((operation) => operation.id === 'validate') ?? saved.operations.find((operation) => operation.risk === 'read' && operation.method === 'GET');
    return {
      ...requirement,
      setup: {
        ...(requirement.setup ?? {}),
        label: saved.label,
        baseUrl: saved.baseUrl,
        ...(saved.documentationUrl ? { documentationUrl: saved.documentationUrl } : {}),
        ...(validation ? { validationPath: validation.path, validationCapability: validation.capability } : {}),
      },
    };
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
    if (!id || !label || !provider || !baseUrl || operations.length === 0) {
      throw new Error('Connection needs a name, provider, HTTPS endpoint (or localhost HTTP), and at least one safe operation.');
    }
    if (operations.some((operation) => !capabilities.includes(operation.capability))) {
      throw new Error('Each registered operation must use one of the connection capabilities.');
    }
    const token = typeof draft.token === 'string' ? draft.token.trim() : '';
    if (!token && !loadStoredKeys()[keyRef(id)]?.trim()) {
      throw new Error('An API key or token is required for a new connection.');
    }
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
    const next = [...this.profiles().filter((candidate) => candidate.id !== id), profile];
    this.saveProfiles(next);
    if (token) setStoredKey(keyRef(id), token);
    this.syncGlobalSkill(profile);
    return { ...profile, hasCredential: true };
  }

  remove(id: string): boolean {
    const profile = this.get(id);
    if (!profile) return false;
    this.saveProfiles(this.profiles().filter((candidate) => candidate.id !== profile.id));
    removeStoredKey(keyRef(profile.id));
    // The skill is information about this saved connection, so remove it with
    // the connection. A user-authored skill of the same name is never created
    // by this registry because names are namespaced.
    const skills = new SkillStore('', SkillStore.globalSkillsDir());
    skills.remove(`gitu-provider-${profile.id}`);
    return true;
  }

  private syncGlobalSkill(profile: ConnectionProfile): void {
    const skills = new SkillStore('', SkillStore.globalSkillsDir());
    // Reserved namespace avoids silently replacing a user's own provider
    // skill with generated metadata.
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
    if (existing && !(existing.scope === 'global' && existing.createdBy === 'agent')) {
      throw new Error(`A user-owned global skill named "${name}" already exists; rename it before saving this connection.`);
    }
  }

  private updateValidation(id: string, status: 'ok' | 'failed'): void {
    // Telemetry only — a persistence failure here must never corrupt an
    // invocation result: a successful write reported as failed invites a
    // duplicate retry.
    try {
      const profiles = this.profiles();
      const current = profiles.find((profile) => profile.id === id);
      if (!current) return;
      current.lastValidatedAt = nowIso();
      current.lastValidationStatus = status;
      current.updatedAt = nowIso();
      this.saveProfiles(profiles);
    } catch {
      /* best effort */
    }
  }

  private withProfile(id: string, mutate: (profile: ConnectionProfile) => void): void {
    try {
      const profiles = this.profiles();
      const current = profiles.find((profile) => profile.id === id);
      if (!current) return;
      mutate(current);
      current.updatedAt = nowIso();
      this.saveProfiles(profiles);
    } catch {
      /* state recording is best-effort; an invocation result is never amended */
    }
  }

  /**
   * Record POSITIVE auth evidence only. `invalid`/`expired` are reserved for
   * HTTP 401 / provider-declared broken credentials and a missing credential;
   * nothing else ever downgrades auth state.
   */
  private recordAuth(id: string, status: 'valid' | 'invalid' | 'expired' | 'unknown', reason?: string): void {
    this.withProfile(id, (profile) => {
      profile.authState = { status, ...(reason ? { reason: compactText(reason, 300) } : {}), checkedAt: nowIso() };
    });
  }

  private recordCapability(id: string, patch: { deny?: string[]; miss?: string[]; discovered?: boolean }): void {
    this.withProfile(id, (profile) => {
      const current = profile.capabilityState ?? { denied: [], missing: [] };
      const denied = [...new Set([...current.denied, ...(patch.deny ?? [])])].slice(0, 24);
      const missing = [...new Set([...current.missing, ...(patch.miss ?? [])])].filter((item) => !denied.includes(item)).slice(0, 24);
      profile.capabilityState = {
        denied, missing,
        ...(patch.discovered || current.discoveredAt ? { discoveredAt: current.discoveredAt ?? nowIso() } : {}),
      };
    });
  }

  /** Credential validity is stored separately from operation availability. */
  authStateOf(id: string): ConnectionAuthStateRecord {
    return this.get(id)?.authState ?? { status: 'unknown' };
  }

  /** Operation availability is stored separately from credential validity. */
  capabilityStateOf(id: string): ConnectionCapabilityStateRecord {
    return this.get(id)?.capabilityState ?? { denied: [], missing: [] };
  }

  private credentialPresent(id: string): boolean {
    return Boolean(loadStoredKeys()[keyRef(id)]?.trim());
  }

  async invoke(id: string, operationId: string, body?: unknown): Promise<ConnectionInvocationResult> {
    const profile = this.get(id);
    if (!profile) throw new ConnectionInvocationError('not-run', 'Saved connection not found.', 'CONFIG_INVALID');
    const operation = profile.operations.find((candidate) => candidate.id === operationId);
    if (!operation) {
      // A missing REGISTERED operation is a capability gap, never invalidation.
      // The saved credential is untouched; discovery may register the op.
      this.recordCapability(profile.id, { miss: [operationId] });
      throw new ConnectionInvocationError('not-run', 'Connection operation is not registered.', 'CONNECTED_MISSING_OPERATION');
    }
    const token = loadStoredKeys()[keyRef(profile.id)]?.trim();
    if (!token) {
      // Explicitly deleted/missing credential IS positive auth evidence.
      this.recordAuth(profile.id, 'invalid', 'The saved credential is missing.');
      throw new ConnectionInvocationError('not-run', 'Saved connection needs its credential added again.', 'AUTH_INVALID', true);
    }
    if (body !== undefined && operation.method === 'GET') throw new ConnectionInvocationError('not-run', 'A read-only GET operation cannot include a request body.', 'CONFIG_INVALID');
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
      // The transport failed mid-flight (network, timeout, redirect refusal):
      // for a POST the provider may or may not have received the request, so
      // the honest classification is UNKNOWN, never "not run". The credential
      // was never evaluated, so auth state is untouched.
      throw new ConnectionInvocationError(
        'sent-unknown',
        'Connection request did not complete (network, timeout, or redirect). The provider may or may not have received it — verify provider state before any retry.',
        'PROVIDER_UNREACHABLE',
      );
    }
    if (!response.ok) {
      this.updateValidation(profile.id, 'failed');
      // The request REACHED the provider and was refused. Surface the
      // provider's own error body (bounded, redacted) so the caller can fix
      // the request instead of retrying blindly.
      const detail = await boundedResponseData(response).catch(() => undefined);
      // The provider error body is THE evidence the brain needs (missing
      // fields, wrong ids, permission scope) — keep up to 4k of it.
      const detailText = detail === undefined ? '' : ` Provider said: ${JSON.stringify(detail).slice(0, 4_000)}`;
      // ── Connection-state classification ────────────────────────────────
      // MISSING_OPERATION !== INVALID_CONNECTION. Only 401 (or an explicit
      // invalid/expired/revoked credential signal) is auth evidence; 403 is
      // scope-related and NEVER downgrades the saved credential.
      if (response.status === 401) {
        const expired = /expired|revoked/i.test(detailText.toLowerCase());
        const state = expired ? 'AUTH_EXPIRED' : 'AUTH_INVALID';
        const statusLabel = expired ? 'Authentication or token is expired/revoked' : 'Authentication was rejected';
        this.recordAuth(profile.id, expired ? 'expired' : 'invalid', `HTTP 401${detailText}`.slice(0, 300));
        throw new ConnectionInvocationError('sent-rejected', `${statusLabel} (HTTP 401).${detailText}`, state, true);
      }
      if (response.status === 403) {
        // Insufficient scope on a VALID credential: keep auth state, mark the
        // capability denied so resolution can explain which scope is missing.
        this.recordCapability(profile.id, { deny: [operation.capability] });
        throw new ConnectionInvocationError('sent-rejected', `Permission or scope for "${operation.capability}" was denied (HTTP 403) — the credential itself is valid; the token lacks the required scope.${detailText}`, 'CONNECTED_INSUFFICIENT_SCOPE');
      }
      if (response.status === 404) {
        this.recordCapability(profile.id, { miss: [operation.capability] });
        throw new ConnectionInvocationError('sent-rejected', `The provider does not expose "${operation.path}" (HTTP 404) — the connection is valid; the endpoint may be wrong or capability-specific.${detailText}`, 'CONNECTED_MISSING_OPERATION');
      }
      if (response.status === 429 || response.status >= 500) {
        throw new ConnectionInvocationError('sent-rejected', safeErrorStatus(response.status) + ` (HTTP ${response.status}).${detailText}`, 'PROVIDER_UNREACHABLE');
      }
      throw new ConnectionInvocationError('sent-rejected', `${safeErrorStatus(response.status)} (HTTP ${response.status}).${detailText}`, 'CONFIG_INVALID');
    }
    this.updateValidation(profile.id, 'ok');
    this.recordAuth(profile.id, 'valid');
    let data: unknown;
    try {
      data = await boundedResponseData(response);
    } catch {
      throw new ConnectionInvocationError(
        'sent-unknown',
        `The provider accepted the operation (HTTP ${response.status}) but its response could not be read. Treat the operation as POSSIBLY completed — verify provider state before re-running anything non-idempotent.`,
        'PROVIDER_UNREACHABLE',
      );
    }
    return { ok: true, status: response.status, message: `${operation.label} succeeded (HTTP ${response.status}).`, ...(data !== undefined ? { data } : {}) };
  }

  async invokeRead(id: string, operationId: string): Promise<ConnectionInvocationResult> {
    const operation = this.operation(id, operationId);
    if (!operation || operation.risk !== 'read' || operation.method !== 'GET') {
      throw new Error('Only registered read-only GET connection operations may be used by an agent.');
    }
    return this.invoke(id, operationId);
  }

  /**
   * The safest information-gathering action the recovery controller can take
   * on its own: a registered READ-ONLY GET operation on a credentialed
   * connection, preferring the connection that just failed. Read-only by
   * construction — the controller never executes a write without approval.
   */
  safestRead(preferredConnectionId?: string): { connectionId: string; operationId: string } | undefined {
    const tokens = loadStoredKeys();
    const profiles = this.profiles()
      .filter((profile) => Boolean(tokens[keyRef(profile.id)]?.trim()))
      .sort((a, b) => Number(b.id === preferredConnectionId) - Number(a.id === preferredConnectionId));
    for (const profile of profiles) {
      const read = profile.operations.find((candidate) => candidate.risk === 'read' && candidate.method === 'GET');
      if (read) return { connectionId: profile.id, operationId: read.id };
    }
    return undefined;
  }

  /** Add an operation only after a host-level approval. Existing operation
   * ids are immutable so a later model turn cannot silently retarget one.
   * `documentedCapability` permits extending the profile's capability set
   * from verified official API documentation (the catalog) or a proposal that
   * the user explicitly approved — this is how capability additions persist
   * for future tasks without touching the credential. */
  registerApprovedOperation(id: string, candidate: ConnectionOperation, documentedCapability = false): ConnectionOperation {
    const profile = this.get(id);
    if (!profile) throw new Error('Saved connection not found.');
    const operation = normalizeConnectionOperation(candidate);
    if (!operation) throw new Error('Connection operation is malformed or has an unsafe method/risk combination.');
    const capabilityKnown = profile.capabilities.includes(operation.capability)
      || documentedCapability
      || catalogCapabilityDeclared(profile.provider, operation.capability);
    if (!capabilityKnown) {
      throw new Error(`Saved connection does not declare capability "${operation.capability}", and no documented provider catalog entry or verified documentation supports adding it. Add the capability through a documented connection_operation proposal or secure connection setup.`);
    }
    const existing = profile.operations.find((item) => item.id === operation.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(operation)) {
        throw new Error(`Connection operation id "${operation.id}" is already registered with different details.`);
      }
      return existing;
    }
    const capabilities = [...new Set([...profile.capabilities, operation.capability])];
    this.save({
      id: profile.id,
      label: profile.label,
      provider: profile.provider,
      baseUrl: profile.baseUrl,
      ...(profile.documentationUrl ? { documentationUrl: profile.documentationUrl } : {}),
      capabilities,
      operations: [...profile.operations, operation],
    });
    this.recordCapability(profile.id, { discovered: true });
    return operation;
  }

  /**
   * Provider-neutral capability resolver. THE invariant: auth validity and
   * operation availability are evaluated and stored separately, and
   * MISSING_OPERATION never downgrades a valid credential. Resolution never
   * asks for a credential — it only exists, discovers (safe reads), proposes
   * writes for approval, or reports the capability as unknown.
   */
  resolveConnectionOperation(input: ResolveConnectionOperationInput): ResolveConnectionOperationResult {
    const profile = this.pickConnection(input);
    if (!profile) {
      return {
        connectionId: input.connectionId ?? 'unknown',
        connectionValid: false,
        operationAvailable: false,
        state: 'CONFIG_INVALID',
        resolution: 'discovery_failed',
        reason: 'No saved connection matched; the connection profile does not exist.',
      };
    }
    if (!this.credentialPresent(profile.id)) {
      // Explicitly missing credential = positive auth failure.
      this.recordAuth(profile.id, 'invalid', 'The saved credential is missing.');
      return {
        connectionId: profile.id,
        connectionValid: false,
        operationAvailable: false,
        state: 'AUTH_INVALID',
        resolution: 'discovery_failed',
        reason: 'The saved credential is missing — reauthenticate to restore this connection.',
      };
    }
    const auth = this.authStateOf(profile.id);
    if (auth.status === 'invalid' || auth.status === 'expired') {
      return {
        connectionId: profile.id,
        connectionValid: false,
        operationAvailable: false,
        state: auth.status === 'expired' ? 'AUTH_EXPIRED' : 'AUTH_INVALID',
        resolution: 'discovery_failed',
        reason: auth.reason ?? 'Authentication was positively rejected or expired — reauthorize to restore this connection.',
      };
    }

    // Scope denial from a 403: the credential is VALID, only the scope is bad.
    const capability = input.capability ?? input.operation?.capability;
    const denied = this.capabilityStateOf(profile.id).denied;
    if (capability && denied.includes(capability)) {
      return {
        connectionId: profile.id,
        connectionValid: true,
        operationAvailable: false,
        state: 'CONNECTED_INSUFFICIENT_SCOPE',
        resolution: 'insufficient_scope',
        capability,
        reason: `The credential is valid but the token lacks scope for "${capability}". Expand authorization once; do not recreate the connection.`,
      };
    }

    if (input.operation) {
      const registered = this.operation(profile.id, input.operation.id);
      if (registered) {
        if (JSON.stringify(registered) !== JSON.stringify(normalizeConnectionOperation(input.operation))) {
          return {
            connectionId: profile.id,
            connectionValid: true,
            operationAvailable: false,
            state: 'CONNECTED_MISSING_OPERATION',
            resolution: 'discovery_failed',
            reason: `An operation with id "${input.operation.id}" exists with different details. Use the registered operation exactly.`,
          };
        }
        return {
          connectionId: profile.id,
          connectionValid: true,
          operationAvailable: true,
          state: 'CONNECTED',
          resolution: 'existing',
          operation: registered,
          capability: registered.capability,
          reason: 'The operation is already registered on the saved connection.',
        };
      }
      return this.operateOn(profile, input.operation as ConnectionOperation, 'documented proposal');
    }

    if (capability) {
      const risk = input.riskLevel ?? 'read';
      const known = this.operationForCapability(profile.id, capability);
      if (known) {
        return {
          connectionId: profile.id,
          connectionValid: true,
          operationAvailable: true,
          state: 'CONNECTED',
          resolution: 'existing',
          operation: known,
          capability,
          reason: 'A registered operation already covers the requested capability.',
        };
      }
      const catalogOp = catalogOperationFor(profile.provider, capability, risk);
      if (catalogOp) return this.operateOn(profile, catalogOp as ConnectionOperation, 'registered provider catalog');
      return {
        connectionId: profile.id,
        connectionValid: true,
        operationAvailable: false,
        state: 'DISCOVERY_FAILED',
        resolution: 'discovery_failed',
        capability,
        reason: `Capability "${capability}" is not registered and no verified-documentation catalog entry exists for provider "${profile.provider}". The saved credential is still valid.`,
      };
    }

    return {
      connectionId: profile.id,
      connectionValid: true,
      operationAvailable: false,
      state: 'DISCOVERY_FAILED',
      resolution: 'discovery_failed',
      reason: 'No concrete operation or capability was supplied for resolution.',
    };
  }

  private pickConnection(input: ResolveConnectionOperationInput): ConnectionProfile | undefined {
    if (input.connectionId) return this.get(input.connectionId);
    if (input.providerHint) {
      const hint = slug(input.providerHint, '');
      const matches = this.list().filter((profile) => profile.hasCredential && [profile.id, profile.provider, slug(profile.label, '')].includes(hint));
      return matches.length === 1 ? matches[0] : matches.length > 1 ? matches[0] : undefined;
    }
    return undefined;
  }

  private operationForCapability(id: string, capability: string): ConnectionOperation | undefined {
    // Safer resolution order: an exact riskless GET for the capability wins;
    // otherwise the first REGISTERED operation carrying it.
    const candidates = this.get(id)?.operations ?? [];
    return candidates.find((operation) => operation.capability === capability && operation.risk === 'read' && operation.method === 'GET')
      ?? candidates.find((operation) => operation.capability === capability);
  }

  private operateOn(profile: ConnectionProfile, operation: ConnectionOperation, source: string): ResolveConnectionOperationResult {
    if (operation.risk === 'read' && operation.method === 'GET') {
      // Safe reads auto-register under the existing credential — policy allows
      // it, no user approval needed, no credential prompt.
      if (!profile.capabilities.includes(operation.capability) && !catalogCapabilityDeclared(profile.provider, operation.capability)) {
        return {
          connectionId: profile.id,
          connectionValid: true,
          operationAvailable: false,
          state: 'DISCOVERY_FAILED',
          resolution: 'discovery_failed',
          operation,
          capability: operation.capability,
          reason: `The documented read operation "${operation.id}" is known, but capability "${operation.capability}" is not declared for this connection.`,
        };
      }
      const registered = this.registerApprovedOperation(profile.id, operation, true);
      return {
        connectionId: profile.id,
        connectionValid: true,
        operationAvailable: true,
        state: 'CONNECTED',
        resolution: 'discovered',
        operation: registered,
        capability: registered.capability,
        reason: `Registered ${source} read operation "${registered.id}" on the existing connection; the saved credential was reused.`,
      };
    }
    // Writes and destructive operations: operation-level approval, never a
    // credential prompt. The registration happens after the host approves.
    return {
      connectionId: profile.id,
      connectionValid: true,
      operationAvailable: false,
      state: 'CONNECTED_MISSING_OPERATION',
      resolution: 'requires_approval',
      operation,
      capability: operation.capability,
      reason: `Operation-ready proposal for "write/destructive" action "${operation.id}" from ${source}; it needs operation-level approval and will then be registered. No credential re-entry is required.`,
    };
  }

  /**
   * Recovery-routing decision: given an exhausted prerequisite, decide whether
   * the secure credential form is LEGITIMATE (no connection exists yet, or the
   * saved credential was positively rejected) or whether this is plain
   * missing-capability resolution that must NEVER prompt for a credential.
   */
  connectionRecoveryDecision(prerequisite: MissingPrerequisite): ConnectionRecoveryDecision {
    const requirement = this.requirementFor(prerequisite);
    const matching = this.list().filter((profile) => profile.hasCredential && profilePlausiblyMatches(profile, requirement));
    if (matching.length === 0) {
      return { action: 'setup-new', reason: 'No saved connection matches this prerequisite yet; first-time secure setup is legitimate.' };
    }
    // Only a POSITIVELY classified authentication failure (401 / expired /
    // revoked / missing credential) on the single matching connection routes
    // to secure reauthorization. Everything else stays capability-level.
    const invalid = matching
      .filter((profile) => {
        const auth = this.authStateOf(profile.id);
        return auth.status === 'invalid' || auth.status === 'expired';
      })
      .length;
    if (matching.length === 1 && invalid === 1) {
      const auth = this.authStateOf(matching[0]!.id);
      return {
        action: 'reauth',
        state: auth.status === 'expired' ? 'AUTH_EXPIRED' : 'AUTH_INVALID',
        reason: auth.reason ?? 'The saved credential was positively rejected (or expired) by the provider.',
      };
    }
    const missing = requirement.capabilities.filter((capability) => !matching.some((profile) => profile.capabilities.includes(capability)));
    return {
      action: 'capability-resolution',
      state: missing.length > 0 ? 'CONNECTED_MISSING_OPERATION' : 'DISCOVERY_FAILED',
      reason: missing.length > 0
        ? `A saved connection matches, but capability${missing.length > 1 ? 'ies' : ''} ${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not registered. Resolve the operation (safe reads auto-register; writes need operation approval) — do NOT re-enter the credential.`
        : 'A saved connection matches and validates; the unresolved need is capability-level. Resolve the documented operation — do NOT re-enter the credential.',
    };
  }

  async validate(id: string): Promise<ConnectionInvocationResult> {
    const profile = this.get(id);
    if (!profile) throw new Error('Saved connection not found.');
    const operation = profile.operations.find((candidate) => candidate.id === 'validate') ?? profile.operations.find((candidate) => candidate.risk === 'read' && candidate.method === 'GET');
    if (!operation || operation.risk !== 'read' || operation.method !== 'GET') throw new Error('Connection needs a registered read-only GET validation operation.');
    return this.invoke(profile.id, operation.id);
  }

  asPrerequisiteProvider(): PrerequisiteProvider {
    const registry = this;
    return {
      id: 'saved-connections',
      get capabilities(): Capability[] {
        return registry.list().flatMap((profile) => profile.capabilities.map((capability) => ({
          id: capability,
          provider: profile.provider,
          actions: ['discover'],
          riskClass: 'read' as const,
        })));
      },
      async resolveCapability(input: { providerHint?: string; capabilities: string[] }): Promise<ProviderCapabilityResult> {
        if (input.capabilities.length === 0) {
          return { status: 'unresolved', registeredReads: 0, awaitingApproval: [], summary: 'No capability was requested for resolution.' };
        }
        const hint = slug(input.providerHint ?? '', '');
        const candidates = registry.list().filter((profile) =>
          profile.hasCredential
          && (hint ? [profile.id, profile.provider, slug(profile.label, '')].includes(hint) : input.capabilities.some((capability) => profile.capabilities.includes(capability))));
        if (candidates.length === 0) {
          return { status: 'unresolved', registeredReads: 0, awaitingApproval: [], summary: 'No saved connection with a credential matches these capabilities.' };
        }
        if (candidates.length > 1) {
          return { status: 'needs-user', registeredReads: 0, awaitingApproval: [], summary: 'Multiple saved connections can meet this capability; the host routes the choice.' };
        }
        const profile = candidates[0]!;
        const check = registry.resolveConnectionOperation({
          connectionId: profile.id,
          capability: input.capabilities[0],
          riskLevel: 'read',
        });
        if (check.connectionValid === false && (check.state === 'AUTH_INVALID' || check.state === 'AUTH_EXPIRED')) {
          return { status: 'unresolved', registeredReads: 0, awaitingApproval: [], healthyConnection: false, summary: `Saved connection "${profile.label}" was positively rejected by the provider — reauthorization is required.` };
        }
        let registeredReads = 0;
        const awaitingApproval: string[] = [];
        for (const capability of input.capabilities) {
          const outcome = check.capability === capability ? check : registry.resolveConnectionOperation({ connectionId: profile.id, capability, riskLevel: 'read' });
          if (outcome.resolution === 'discovered') registeredReads += 1;
          if (outcome.resolution === 'requires_approval') awaitingApproval.push(capability);
          if (outcome.resolution === 'insufficient_scope') awaitingApproval.push(`${capability}:insufficient-scope` as string);
        }
        return {
          status: 'resolved',
          healthyConnection: true,
          registeredReads,
          awaitingApproval,
          summary: `Validated saved connection "${profile.label}" for ${input.capabilities.join(', ')}${registeredReads > 0 ? `; registered ${registeredReads} documented read operation(s) under the existing credential.` : ''}${awaitingApproval.length > 0 ? `; ${awaitingApproval.length} write capability(ies) still need operation approval.` : ''} Its credential remains private.`,
        };
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
