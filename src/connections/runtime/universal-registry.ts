import { sha256 } from '../../util.js';
import type { CapabilitySource, ExecutionResult, ExecutionStatus } from './execution-result.js';
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
  execute: (params: Record<string, unknown>, context: ExecutionContext) => Promise<ExecutionResult>;
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

  findForCapability(capabilityName: string, risk?: CapabilityRisk): UniversalCapability | undefined {
    for (const cap of this.capabilities.values()) {
      if (cap.capability.toLowerCase() === capabilityName.toLowerCase()) {
        if (!risk || cap.risk === risk) return cap;
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

          // Approval check for non-read operations
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
                stateEpoch: ctx.cache?.getStateEpoch(provider) ?? 1,
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
                stateEpoch: ctx.cache?.getStateEpoch(provider) ?? 1,
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
                stateEpoch: ctx.cache?.getStateEpoch(provider) ?? 1,
                cacheHit: false,
                errorClass: 'MCP_TOOL_ERROR',
              };
            }

            // On successful write, invalidate cache
            if (risk !== 'read' && ctx.cache) {
              ctx.cache.invalidateForWrite(provider);
            }

            // On successful read, record evidence in cache
            let evidenceId: string | undefined;
            if (risk === 'read' && ctx.cache) {
              const ev = ctx.cache.record({
                connectionId: provider,
                provider,
                capability: capabilityName,
                operationId: tool.name,
                params,
                data: res.content,
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
              stateEpoch: ctx.cache?.getStateEpoch(provider) ?? 1,
              cacheHit: false,
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
              stateEpoch: ctx.cache?.getStateEpoch(provider) ?? 1,
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
        execute: async (params, ctx) => {
          const executionId = `conn-exec-${Date.now()}-${sha256(capId).slice(0, 6)}`;
          if (risk !== 'read' && ctx.approvalHandler) {
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
                stateEpoch: ctx.cache?.getStateEpoch(connectionId) ?? 1,
                cacheHit: false,
                errorClass: 'USER_REJECTED',
              };
            }
          }

          try {
            const data = await invoker(op, params);
            if (risk !== 'read' && ctx.cache) {
              ctx.cache.invalidateForWrite(connectionId);
            }
            let evidenceId: string | undefined;
            if (risk === 'read' && ctx.cache) {
              const ev = ctx.cache.record({
                connectionId,
                provider: provider ?? connectionId,
                capability: op.capability,
                operationId: op.id,
                params,
                data,
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
              stateEpoch: ctx.cache?.getStateEpoch(connectionId) ?? 1,
              cacheHit: false,
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
              stateEpoch: ctx.cache?.getStateEpoch(connectionId) ?? 1,
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
      this.findForCapability(request.capability);

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
    const stateEpoch = context.cache?.getStateEpoch(connKey) ?? 1;
    if (capability.risk === 'read' && request.freshness !== 'force-refresh' && context.cache) {
      const resourceId = context.resourceId ?? (request.arguments?.['resourceId'] as string | undefined) ?? (request.arguments?.['id'] as string | undefined);
      const paramsDigest = request.arguments ? sha256(JSON.stringify(request.arguments)) : undefined;
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
  return sha256(JSON.stringify(normalized));
}

