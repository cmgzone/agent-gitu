import type { Capability, CapabilityInput } from '../model/capability.js';
import { normalizeHttpFailure, normalizeTransportError, type SemanticError } from '../model/errors.js';
import type { ExecutionOutcome } from '../model/verification.js';
import { scrub, type CredentialBroker } from '../credentials/credential-broker.js';
import { operationFingerprint, type FingerprintContext } from './fingerprint.js';

/**
 * The UniversalExecutor. It receives a capability (never a protocol object),
 * a connection id, and resolved semantic parameters. Credentials come ONLY
 * from the mandatory broker; the executor filters parameters to the
 * capability's declared inputs so invented fields never reach the wire.
 */

export interface McpTransport {
  callTool(tool: string, args: Record<string, unknown>): Promise<{ status: number; data: unknown }>;
}

export interface ExecutorOptions {
  connectionId: string;
  baseUrl: string;
  /** Mandatory: the only component allowed to touch credentials. */
  broker: CredentialBroker;
  fetchImpl?: typeof fetch;
  graphqlEndpoint?: string;
  mcpTransport?: McpTransport;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

export class UniversalExecutor {
  constructor(private options: ExecutorOptions) {
    if (!options.broker) throw new Error('UniversalExecutor requires a CredentialBroker — execution without broker-mediated credentials is forbidden.');
  }

  /**
   * Fill generated inputs (e.g. resource names) that the planner left open,
   * and drop any parameter the capability does not declare.
   */
  static prepareParams(capability: Capability, params: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const input of capability.inputs) {
      let value = params[input.externalName];
      if ((value === undefined || value === '') && input.required && input.resolution === 'generated') {
        value = `gitu-${capability.semanticTarget?.id ?? 'resource'}-${randomSuffix()}`;
      }
      if (value !== undefined && value !== '') out[input.externalName] = value;
    }
    return out;
  }

  static missingRequired(capability: Capability, params: Record<string, unknown>): CapabilityInput[] {
    return capability.inputs.filter((input) => {
      if (!input.required) return false;
      if (input.resolution === 'generated') return false;
      const value = params[input.externalName];
      return value === undefined || value === '';
    });
  }

  async execute(capability: Capability, params: Record<string, unknown>, ctx: FingerprintContext): Promise<ExecutionOutcome> {
    const fingerprint = operationFingerprint(capability, params, ctx);
    const prepared = UniversalExecutor.prepareParams(capability, params);
    const missing = UniversalExecutor.missingRequired(capability, prepared);
    if (missing.length > 0) {
      return {
        ok: false,
        status: 0,
        executionConfidence: 0,
        fingerprint,
        trace: `capability ${capability.id} not executed — missing required inputs: ${missing.map((m) => m.externalName).join(', ')}`,
        error: { category: 'VALIDATION', retryable: false, operationValid: 'unknown', suspectedCause: ['prerequisite resolution incomplete — resolve missing inputs first'], detail: `missing: ${missing.map((m) => m.externalName).join(', ')}` },
      };
    }
    const operation = capability.externalOperation;
    try {
      if (operation.protocol === 'rest') return await this.executeRest(capability, operation, prepared, fingerprint);
      if (operation.protocol === 'graphql') return await this.executeGraphQl(capability, operation, prepared, fingerprint);
      return await this.executeMcp(capability, prepared, fingerprint);
    } catch (error) {
      const semantic = normalizeTransportError((error as Error).message);
      return { ok: false, status: 0, executionConfidence: 0, fingerprint, trace: `capability ${capability.id} transport failure`, error: semantic };
    }
  }

  private async authenticatedHeaders(): Promise<{ headers: Record<string, string>; secrets: string[] }> {
    const auth = await this.options.broker.authFor(this.options.connectionId);
    return { headers: { ...auth.headers, 'content-type': 'application/json' }, secrets: auth.secrets };
  }

  private buildUrl(capability: Capability, pathTemplate: string, params: Record<string, unknown>): { url: string; query: Record<string, unknown>; body: Record<string, unknown> } {
    const query: Record<string, unknown> = {};
    const body: Record<string, unknown> = {};
    const filled = pathTemplate.replace(/\{([^}]+)\}/g, (_match, name: string) => {
      const input = capability.inputs.find((i) => i.externalName === name);
      const value = input ? params[name] : undefined;
      if (value === undefined) throw new Error(`Path parameter "${name}" has no resolved value.`);
      return encodeURIComponent(String(value));
    });
    for (const input of capability.inputs) {
      const value = params[input.externalName];
      if (value === undefined) continue;
      if (input.location === 'query') query[input.externalName] = value;
      if (input.location === 'body') body[input.externalName] = value;
    }
    const search = new URLSearchParams(Object.entries(query).map(([k, v]): [string, string] => [k, String(v)]));
    const url = `${this.options.baseUrl.replace(/\/+$/, '')}${filled}${search.size > 0 ? `?${search.toString()}` : ''}`;
    return { url, query, body };
  }

  private async executeRest(capability: Capability, operation: Extract<Capability['externalOperation'], { protocol: 'rest' }>, params: Record<string, unknown>, fingerprint: string): Promise<ExecutionOutcome> {
    const { url, body } = this.buildUrl(capability, operation.pathTemplate, params);
    const { headers, secrets } = await this.authenticatedHeaders();
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const response = await fetchImpl(url, { method: operation.method, headers, body: operation.method === 'GET' || operation.method === 'DELETE' || Object.keys(body).length === 0 ? undefined : JSON.stringify(body) });
    const text = await response.text();
    let data: unknown;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      data = text.slice(0, 2000);
    }
    const trace = scrub(`REST ${operation.method} ${url}${Object.keys(body).length > 0 ? ` body=${JSON.stringify(body)}` : ''}`, secrets);
    if (response.ok) return { ok: true, status: response.status, executionConfidence: 1.0, data, fingerprint, trace };
    const error = normalizeHttpFailure(response.status, text);
    return { ok: false, status: response.status, executionConfidence: 0, data, fingerprint, trace, error };
  }

  private async executeGraphQl(capability: Capability, operation: Extract<Capability['externalOperation'], { protocol: 'graphql' }>, params: Record<string, unknown>, fingerprint: string): Promise<ExecutionOutcome> {
    const endpoint = this.options.graphqlEndpoint ?? this.options.baseUrl;
    const { headers, secrets } = await this.authenticatedHeaders();
    const args = Object.entries(params).map(([name, value]) => `${name}: ${JSON.stringify(value)}`).join(', ');
    const selections = capability.outputs.length > 0 ? capability.outputs.map((o) => o.externalName).join(' ') : '__typename';
    const query = `${operation.operationType} { ${operation.field}${args ? `(${args})` : ''} { ${selections} } }`;
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const response = await fetchImpl(endpoint, { method: 'POST', headers, body: JSON.stringify({ query, variables: {} }) });
    const text = await response.text();
    let payload: { data?: unknown; errors?: { message?: string }[] } | undefined;
    try {
      payload = JSON.parse(text) as typeof payload;
    } catch {
      payload = undefined;
    }
    const trace = scrub(`GraphQL ${operation.operationType} ${operation.field} endpoint=${endpoint}`, secrets);
    if (response.ok && payload?.data && (!payload.errors || payload.errors.length === 0)) {
      return { ok: true, status: response.status, executionConfidence: 1.0, data: payload.data, fingerprint, trace };
    }
    const error = payload?.errors?.length ? normalizeHttpFailure(response.status || 500, payload.errors.map((e) => e.message ?? '').join('; ')) : normalizeHttpFailure(response.status, text);
    return { ok: false, status: response.status, executionConfidence: 0, data: payload?.data, fingerprint, trace, error };
  }

  private async executeMcp(capability: Capability, params: Record<string, unknown>, fingerprint: string): Promise<ExecutionOutcome> {
    const operation = capability.externalOperation as Extract<Capability['externalOperation'], { protocol: 'mcp' }>;
    if (!this.options.mcpTransport) {
      return { ok: false, status: 0, executionConfidence: 0, fingerprint, trace: `MCP tool ${operation.tool} not executed — no MCP transport configured`, error: { category: 'TRANSPORT', retryable: false, operationValid: 'yes', suspectedCause: ['no MCP transport bound to this connection'] } };
    }
    const result = await this.options.mcpTransport.callTool(operation.tool, params);
    if (result.status >= 200 && result.status < 300) {
      return { ok: true, status: result.status, executionConfidence: 1.0, data: result.data, fingerprint, trace: `MCP tool ${operation.tool}` };
    }
    const error = normalizeHttpFailure(result.status);
    return { ok: false, status: result.status, executionConfidence: 0, data: result.data, fingerprint, trace: `MCP tool ${operation.tool}`, error };
  }
}
