import { canonicalJson, sha256 } from '../../util.js';
import type { CapabilitySource, ExecutionResult, ExecutionStatus, MemoryPolicy } from './execution-result.js';
import type { ProviderReadCache, ProviderEvidence } from './provider-cache.js';
import type { ConnectionOperation } from '../connections.js';

export type CapabilityRisk = 'read' | 'reversible-write' | 'destructive';

/**
 * Normalized capability invocation request across all sources:
 * Connections, MCP Tools, CLI, Native Tools, and Plugins.
 */
export interface CapabilityInvocationRequest {
  capability: string;
  arguments?: Record<string, unknown>;
  source?: CapabilitySource;
  freshness?: 'current' | 'cached' | 'force-refresh';
  connectionId?: string;
  operationId?: string;
}

export interface ExecutionContext {
  approvalHandler?: (proposal: { id: string; label: string; risk: CapabilityRisk; params?: unknown }) => Promise<boolean>;
  cache?: ProviderReadCache;
  resourceId?: string;
  resourceType?: string;
}

export interface UniversalCapability {
  id: string;
  source: CapabilitySource;
  provider?: string;
  connectionId?: string;
  capability: string;
  label: string;
  description?: string;
  risk: CapabilityRisk;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  memoryPolicy?: MemoryPolicy;
  execute: (params: Record<string, unknown>, context: ExecutionContext) => Promise<ExecutionResult>;
}

/**
 * Extract standard resource ID from capability arguments or execution context.
 */
export function extractResourceId(params: Record<string, unknown>, context?: ExecutionContext): string | undefined {
  if (context?.resourceId) return context.resourceId;
  const candidates = [
    params.resourceId,
    params.id,
    params.applicationId,
    params.serviceId,
    params.databaseId,
    params.projectId,
    params.name,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return undefined;
}

/**
 * Independent Gitu Security Classifier for MCP tools and external capabilities.
 * Never blindly trust provider-declared risk.
 */
export function classifyCapabilityRisk(name: string, description?: string, schema?: Record<string, unknown>): CapabilityRisk {
  const text = `${name} ${description ?? ''}`.toLowerCase().replace(/[_./-]/g, ' ');

  // Destructive keywords
  if (/\b(delete|destroy|drop|terminate|purge|remove|wipe|reset|truncate|kill)\b/.test(text)) {
    return 'destructive';
  }

  // Mutating keywords
  if (/\b(create|update|patch|post|put|set|modify|edit|insert|write|add|attach|detach|provision|deploy|restart)\b/.test(text)) {
    return 'reversible-write';
  }

  // Pure read / discovery
  return 'read';
}

/**
 * UniversalCapabilityRegistry:
 * The single source of truth for all executable capabilities across
 * Native Connections, MCP Tools, CLI, and Plugins.
 */
export class UniversalCapabilityRegistry {
  private capabilities = new Map<string, UniversalCapability>();

  register(capability: UniversalCapability): void {
    this.capabilities.set(capability.id, capability);
  }

  get(id: string): UniversalCapability | undefined {
    return this.capabilities.get(id);
  }

  findForCapability(
    capabilityName: string,
    filter?: { risk?: CapabilityRisk; source?: CapabilitySource; connectionId?: string },
  ): UniversalCapability | undefined {
    for (const cap of this.capabilities.values()) {
      if (cap.capability.toLowerCase() === capabilityName.toLowerCase()) {
        if (filter?.risk && cap.risk !== filter.risk) continue;
        if (filter?.source && cap.source !== filter.source) continue;
        if (filter?.connectionId && cap.connectionId?.toLowerCase() !== filter.connectionId.toLowerCase()) continue;
        return cap;
      }
    }
    return undefined;
  }

  list(): UniversalCapability[] {
    return [...this.capabilities.values()];
  }

  requiresApproval(id: string): boolean {
    const cap = this.get(id);
    if (!cap) return true;
    return cap.risk !== 'read';
  }

  /**
   * Register MCP tools into the universal registry with independent risk classification.
   */
  registerMcpTools(
    tools: Array<{ name: string; description?: string; inputSchema?: Record<string, unknown> }>,
    mcpClient: { callTool: (name: string, args: Record<string, unknown>) => Promise<{ content: unknown; isError?: boolean }> },
    provider = 'mcp',
  ): void {
    for (const tool of tools) {
      const risk = classifyCapabilityRisk(tool.name, tool.description, tool.inputSchema);
      const capId = `mcp:${provider}:${tool.name}`;
      const capabilityName = `${provider}.${tool.name.replace(/_/g, '.')}`;

      this.register({
        id: capId,
        source: 'mcp',
        provider,
        capability: capabilityName,
        label: tool.name,
        description: tool.description,
        risk,
        inputSchema: tool.inputSchema,
        execute: async (params, ctx) => {
          const executionId = `conn-exec-${Date.now()}-${sha256(capId).slice(0, 6)}`;
          const resourceId = extractResourceId(params, ctx);
          const resourceType = (params.resourceType as string | undefined) ?? ctx.resourceType;

          // Fail-closed approval check for non-read operations
          if (risk !== 'read') {
            if (!ctx.approvalHandler) {
              return {
                executionId,
                source: 'mcp',
                provider,
                capability: capabilityName,
                operationId: tool.name,
                status: 'rejected',
                message: `MCP operation "${tool.name}" requires user approval channel.`,
                stateEpoch: ctx.cache?.getStateEpoch(provider, resourceType, resourceId) ?? 1,
                cacheHit: false,
                errorClass: 'APPROVAL_REQUIRED',
              };
            }
            const approved = await ctx.approvalHandler({ id: capId, label: tool.name, risk, params });
            if (!approved) {
              return {
                executionId,
                source: 'mcp',
                provider,
                capability: capabilityName,
                operationId: tool.name,
                status: 'rejected',
                message: `MCP operation "${tool.name}" was rejected by user policy.`,
                stateEpoch: ctx.cache?.getStateEpoch(provider, resourceType, resourceId) ?? 1,
                cacheHit: false,
                errorClass: 'USER_REJECTED',
              };
            }
          }

          try {
            const res = await mcpClient.callTool(tool.name, params);
            if (res.isError) {
              return {
                executionId,
                source: 'mcp',
                provider,
                capability: capabilityName,
                operationId: tool.name,
                status: 'failed',
                data: res.content,
                message: `MCP tool execution failed.`,
                stateEpoch: ctx.cache?.getStateEpoch(provider, resourceType, resourceId) ?? 1,
                cacheHit: false,
                errorClass: 'MCP_TOOL_ERROR',
              };
            }

            // On successful write, invalidate scoped cache
            if (risk !== 'read' && ctx.cache) {
              ctx.cache.invalidateForWrite(provider, resourceType, resourceId);
            }

            // On successful read, record evidence in cache
            let evidenceId: string | undefined;
            if (risk === 'read' && ctx.cache) {
              const ev = ctx.cache.record({
                connectionId: provider,
                provider,
                capability: capabilityName,
                operationId: tool.name,
                resourceId,
                params,
                data: res.content,
                memoryPolicy: { promotable: false, stability: 'session' },
              });
              evidenceId = ev.id;
            }

            return {
              executionId,
              source: 'mcp',
              provider,
              capability: capabilityName,
              operationId: tool.name,
              status: 'ok',
              data: res.content,
              message: `MCP tool "${tool.name}" succeeded.`,
              evidenceId,
              stateEpoch: ctx.cache?.getStateEpoch(provider, resourceType, resourceId) ?? 1,
              cacheHit: false,
              memoryPolicy: { promotable: false, stability: 'session' },
            };
          } catch (error) {
            return {
              executionId,
              source: 'mcp',
              provider,
              capability: capabilityName,
              operationId: tool.name,
              status: 'failed',
              message: (error as Error).message,
              stateEpoch: ctx.cache?.getStateEpoch(provider, resourceType, resourceId) ?? 1,
              cacheHit: false,
              errorClass: 'MCP_TRANSPORT_ERROR',
            };
          }
        },
      });
    }
  }

  /**
   * Register Native Connection operations into the universal capability registry.
   */
  registerConnection(
    connectionId: string,
    operations: ConnectionOperation[],
    invoker: (operation: ConnectionOperation, body?: unknown) => Promise<unknown>,
    provider?: string,
  ): void {
    for (const op of operations) {
      const capId = `conn:${connectionId}:${op.id}`;
      const risk: CapabilityRisk = op.risk === 'read' ? 'read' : op.risk === 'destructive' ? 'destructive' : 'reversible-write';

      this.register({
        id: capId,
        source: 'connection',
        provider: provider ?? connectionId,
        connectionId,
        capability: op.capability,
        label: op.label,
        risk,
        memoryPolicy: op.memoryPolicy,
        execute: async (params, ctx) => {
          const executionId = `conn-exec-${Date.now()}-${sha256(capId).slice(0, 6)}`;
          const resourceId = extractResourceId(params, ctx);
          const resourceType = (params.resourceType as string | undefined) ?? ctx.resourceType;

          // Fail-closed approval check for non-read operations
          if (risk !== 'read') {
            if (!ctx.approvalHandler) {
              return {
                executionId,
                source: 'connection',
                provider: provider ?? connectionId,
                connectionId,
                capability: op.capability,
                operationId: op.id,
                status: 'rejected',
                message: `Connection operation "${op.label}" requires approval channel.`,
                stateEpoch: ctx.cache?.getStateEpoch(connectionId, resourceType, resourceId) ?? 1,
                cacheHit: false,
                errorClass: 'APPROVAL_REQUIRED',
                memoryPolicy: op.memoryPolicy,
              };
            }
            const approved = await ctx.approvalHandler({ id: capId, label: op.label, risk, params });
            if (!approved) {
              return {
                executionId,
                source: 'connection',
                provider: provider ?? connectionId,
                connectionId,
                capability: op.capability,
                operationId: op.id,
                status: 'rejected',
                message: `Connection operation "${op.label}" was rejected by policy.`,
                stateEpoch: ctx.cache?.getStateEpoch(connectionId, resourceType, resourceId) ?? 1,
                cacheHit: false,
                errorClass: 'USER_REJECTED',
                memoryPolicy: op.memoryPolicy,
              };
            }
          }

          try {
            const data = await invoker(op, params);
            if (risk !== 'read' && ctx.cache) {
              ctx.cache.invalidateForWrite(connectionId, resourceType, resourceId);
            }
            let evidenceId: string | undefined;
            if (risk === 'read' && ctx.cache) {
              const ev = ctx.cache.record({
                connectionId,
                provider: provider ?? connectionId,
                capability: op.capability,
                operationId: op.id,
                resourceId,
                params,
                data,
                memoryPolicy: op.memoryPolicy,
              });
              evidenceId = ev.id;
            }

            return {
              executionId,
              source: 'connection',
              provider: provider ?? connectionId,
              connectionId,
              capability: op.capability,
              operationId: op.id,
              status: 'ok',
              data,
              message: `Operation "${op.label}" succeeded.`,
              evidenceId,
              stateEpoch: ctx.cache?.getStateEpoch(connectionId, resourceType, resourceId) ?? 1,
              cacheHit: false,
              memoryPolicy: op.memoryPolicy,
            };
          } catch (error) {
            return {
              executionId,
              source: 'connection',
              provider: provider ?? connectionId,
              connectionId,
              capability: op.capability,
              operationId: op.id,
              status: 'failed',
              message: (error as Error).message,
              stateEpoch: ctx.cache?.getStateEpoch(connectionId, resourceType, resourceId) ?? 1,
              cacheHit: false,
              errorClass: 'INVOCATION_ERROR',
            };
          }
        },
      });
    }
  }

  /**
   * Universal invocation entrypoint:
   * 1. Resolves capability across connections, MCP, CLI, plugins, native tools.
   * 2. Validates structured arguments against schema.
   * 3. Checks ProviderReadCache (retrieval-before-fetch).
   * 4. Enforces policy and approval gates.
   * 5. Executes and returns unified ExecutionResult.
   */
  async invoke(request: CapabilityInvocationRequest, context: ExecutionContext = {}): Promise<ExecutionResult> {
    const capability =
      this.get(request.capability) ??
      this.findForCapability(request.capability, {
        source: request.source,
        connectionId: request.connectionId,
      });

    const executionId = `conn-exec-${Date.now()}-${sha256(request.capability).slice(0, 6)}`;

    if (!capability) {
      return {
        executionId,
        source: request.source ?? 'native',
        capability: request.capability,
        status: 'failed',
        message: `Capability "${request.capability}" is not registered in the runtime.`,
        stateEpoch: 1,
        cacheHit: false,
        errorClass: 'UNKNOWN_CAPABILITY',
      };
    }

    // 1. Schema validation
    const validation = validateCapabilityArguments(capability.inputSchema, request.arguments);
    if (!validation.valid) {
      return {
        executionId,
        source: capability.source,
        provider: capability.provider,
        connectionId: capability.connectionId ?? request.connectionId,
        capability: capability.capability,
        operationId: capability.id,
        status: 'failed',
        message: `Schema validation failed: ${validation.errors.join('; ')}`,
        stateEpoch: context.cache?.getStateEpoch(capability.connectionId ?? capability.provider ?? 'default') ?? 1,
        cacheHit: false,
        errorClass: 'INVALID_ARGUMENTS',
      };
    }

    // 2. Retrieval-before-fetch cache check
    const connKey = capability.connectionId ?? capability.provider ?? 'default';
    const resourceId = extractResourceId(request.arguments ?? {}, context);
    const resourceType = (request.arguments?.['resourceType'] as string | undefined) ?? context.resourceType;
    const stateEpoch = context.cache?.getStateEpoch(connKey, resourceType, resourceId) ?? 1;

    if (capability.risk === 'read' && request.freshness !== 'force-refresh' && context.cache) {
      const paramsDigest = request.arguments ? sha256(canonicalJson(request.arguments)) : undefined;
      const cached = context.cache.get(connKey, capability.capability, resourceId, paramsDigest);
      if (cached) {
        return {
          executionId,
          source: capability.source,
          provider: capability.provider,
          connectionId: capability.connectionId ?? request.connectionId,
          capability: capability.capability,
          operationId: capability.id,
          status: 'cached',
          data: cached.data,
          message: `Cached fact reused under epoch ${cached.stateEpoch} (retrieval-before-fetch).`,
          evidenceId: cached.id,
          stateEpoch: cached.stateEpoch,
          cacheHit: true,
        };
      }
    }

    // 3. Execution
    return capability.execute(request.arguments ?? {}, context);
  }
}

/**
 * Validates invocation arguments against a capability's inputSchema.
 */
export function validateCapabilityArguments(
  schema: Record<string, unknown> | undefined,
  args: Record<string, unknown> | undefined,
): { valid: boolean; errors: string[] } {
  if (!schema) return { valid: true, errors: [] };
  const errors: string[] = [];
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  const provided = args ?? {};

  for (const field of required) {
    if (provided[field] === undefined || provided[field] === null || provided[field] === '') {
      errors.push(`Missing required field: "${field}"`);
    }
  }

  const properties = (typeof schema.properties === 'object' && schema.properties !== null)
    ? (schema.properties as Record<string, Record<string, unknown>>)
    : {};

  for (const [propName, propSchema] of Object.entries(properties)) {
    const val = provided[propName];
    if (val !== undefined && propSchema && typeof propSchema === 'object') {
      const expectedType = propSchema['type'];
      if (expectedType === 'string' && typeof val !== 'string') {
        errors.push(`Field "${propName}" expected string, got ${typeof val}`);
      } else if (expectedType === 'number' && typeof val !== 'number') {
        errors.push(`Field "${propName}" expected number, got ${typeof val}`);
      } else if (expectedType === 'boolean' && typeof val !== 'boolean') {
        errors.push(`Field "${propName}" expected boolean, got ${typeof val}`);
      } else if (expectedType === 'array' && !Array.isArray(val)) {
        errors.push(`Field "${propName}" expected array, got ${typeof val}`);
      } else if (expectedType === 'object' && (typeof val !== 'object' || Array.isArray(val) || val === null)) {
        errors.push(`Field "${propName}" expected object, got ${typeof val}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Fingerprint an invocation for anti-loop duplicate tracking.
 */
export function fingerprintInvocation(request: CapabilityInvocationRequest, stateEpoch = 1): string {
  const normalized = {
    capability: request.capability.toLowerCase(),
    arguments: request.arguments ?? {},
    connectionId: request.connectionId?.toLowerCase(),
    operationId: request.operationId?.toLowerCase(),
    stateEpoch,
  };
  return sha256(canonicalJson(normalized));
}

