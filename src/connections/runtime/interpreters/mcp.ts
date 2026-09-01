import type { RawOperation, RawParameter } from '../model/operation.js';

/**
 * MCP (Model Context Protocol) interpreter. Converts MCP tool descriptors
 * into protocol-neutral RawOperations. It understands the MCP PROTOCOL only.
 */

export interface McpProperty {
  type?: string;
  description?: string;
  enum?: unknown[];
}

export interface McpInputSchema {
  type?: string;
  properties?: Record<string, McpProperty>;
  required?: string[];
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: McpInputSchema;
}

function toolActionHint(tool: string): RawOperation['actionHint'] {
  const lower = tool.toLowerCase();
  if (/^(list|get|fetch|find|search|query|describe|read)/.test(lower)) return lower.startsWith('search') || lower.startsWith('find') ? 'search' : 'read';
  if (/^(create|add|new|provision|launch|register)/.test(lower)) return 'create';
  if (/^(update|patch|set|modify|edit|rename)/.test(lower)) return 'update';
  if (/^(delete|remove|destroy|drop|teardown)/.test(lower)) return 'delete';
  return 'execute';
}

/** Introspect MCP tool definitions into RawOperations. */
export function introspectMcpTools(tools: McpToolDefinition[]): RawOperation[] {
  const operations: RawOperation[] = [];
  for (const tool of tools) {
    if (!tool?.name) continue;
    const required = new Set(tool.inputSchema?.required ?? []);
    const properties = tool.inputSchema?.properties ?? {};
    const parameters: RawParameter[] = Object.entries(properties).map(([externalName, prop]) => ({
      externalName,
      location: 'argument',
      required: required.has(externalName),
      type: String(prop?.type ?? 'unknown'),
      description: prop?.description,
      enumValues: Array.isArray(prop?.enum) ? (prop!.enum as unknown[]).map(String) : undefined,
    }));
    operations.push({
      id: `mcp:${tool.name}`,
      label: tool.name,
      description: tool.description,
      external: { protocol: 'mcp', tool: tool.name },
      parameters,
      outputs: [],
      actionHint: toolActionHint(tool.name),
      relationshipHints: [],
      targetHint: { name: tool.name, evidence: [`MCP tool "${tool.name}"`] },
    });
  }
  return operations;
}
