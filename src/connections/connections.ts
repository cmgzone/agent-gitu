import path from 'node:path';
import { loadStoredKeys, removeStoredKey, setStoredKey } from '../llm/keys.js';
import type { PrerequisiteProvider, ProviderRecoveryInput, ProviderRecoveryResult } from '../recovery/prerequisites.js';
import { SkillStore } from '../skills/skills.js';
import type { Capability, ConnectionSetupHint, MissingPrerequisite } from '../types.js';
import { nowIso, readJson, writeJson } from '../util.js';
import { ensureGituHome } from '../workspace/home.js';

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
}

export interface ConnectionProfileView extends ConnectionProfile {
  hasCredential: boolean;
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

  constructor(outcome: ConnectionInvocationOutcome, message: string) {
    super(message);
    this.name = 'ConnectionInvocationError';
    this.outcome = outcome;
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
  if (!id || !label || !provider || !baseUrl || operations.length === 0) return undefined;
  return {
    id, label, provider, baseUrl, capabilities, operations, createdAt, updatedAt,
    ...(documentationUrl ? { documentationUrl } : {}),
    ...(lastValidatedAt ? { lastValidatedAt } : {}),
    ...(lastValidationStatus ? { lastValidationStatus } : {}),
  };
}

function profileMatches(profile: ConnectionProfile, requirement: ConnectionRequirement): boolean {
  const hint = slug(requirement.providerHint, '');
  if (hint && ![profile.id, profile.provider, slug(profile.label, '')].includes(hint)) return false;
  return requirement.capabilities.every((capability) => profile.capabilities.includes(capability));
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

  async invoke(id: string, operationId: string, body?: unknown): Promise<ConnectionInvocationResult> {
    const profile = this.get(id);
    if (!profile) throw new ConnectionInvocationError('not-run', 'Saved connection not found.');
    const operation = profile.operations.find((candidate) => candidate.id === operationId);
    if (!operation) throw new ConnectionInvocationError('not-run', 'Connection operation is not registered.');
    const token = loadStoredKeys()[keyRef(profile.id)]?.trim();
    if (!token) throw new ConnectionInvocationError('not-run', 'Saved connection needs its credential added again.');
    if (body !== undefined && operation.method === 'GET') throw new ConnectionInvocationError('not-run', 'A read-only GET operation cannot include a request body.');
    let encoded: string | undefined;
    if (body !== undefined) {
      encoded = JSON.stringify(normalizeConnectionOperationBody(body));
      if (encoded.length > 64 * 1024) throw new ConnectionInvocationError('not-run', 'Connection request body is too large.');
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
      // the honest classification is UNKNOWN, never "not run".
      throw new ConnectionInvocationError(
        'sent-unknown',
        'Connection request did not complete (network, timeout, or redirect). The provider may or may not have received it — verify provider state before any retry.',
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
      throw new ConnectionInvocationError('sent-rejected', `${safeErrorStatus(response.status)} (HTTP ${response.status}).${detailText}`);
    }
    this.updateValidation(profile.id, 'ok');
    let data: unknown;
    try {
      data = await boundedResponseData(response);
    } catch {
      throw new ConnectionInvocationError(
        'sent-unknown',
        `The provider accepted the operation (HTTP ${response.status}) but its response could not be read. Treat the operation as POSSIBLY completed — verify provider state before re-running anything non-idempotent.`,
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
   * ids are immutable so a later model turn cannot silently retarget one. */
  registerApprovedOperation(id: string, candidate: ConnectionOperation): ConnectionOperation {
    const profile = this.get(id);
    if (!profile) throw new Error('Saved connection not found.');
    const operation = normalizeConnectionOperation(candidate);
    if (!operation) throw new Error('Connection operation is malformed or has an unsafe method/risk combination.');
    if (!profile.capabilities.includes(operation.capability)) {
      throw new Error(`Saved connection does not declare capability "${operation.capability}".`);
    }
    const existing = profile.operations.find((item) => item.id === operation.id);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(operation)) {
        throw new Error(`Connection operation id "${operation.id}" is already registered with different details.`);
      }
      return existing;
    }
    this.save({
      id: profile.id,
      label: profile.label,
      provider: profile.provider,
      baseUrl: profile.baseUrl,
      ...(profile.documentationUrl ? { documentationUrl: profile.documentationUrl } : {}),
      capabilities: profile.capabilities,
      operations: [...profile.operations, operation],
    });
    return operation;
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
