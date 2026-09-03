import { sha256 } from '../../util.js';
import type { CapabilitySource, ExecutionResult, ExecutionStatus } from './execution-result.js';
import type { ProviderReadCache, ProviderEvidence } from './provider-cache.js';

export type CapabilityRisk = 'read' | 'reversible-write' | 'destructive';

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
}
