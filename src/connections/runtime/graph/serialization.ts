import type { Capability } from '../model/capability.js';
import { SemanticCapabilityGraph } from './capability-graph.js';

/**
 * Graph serialization. Only capabilities are persisted; nodes and edges are
 * derived state rebuilt deterministically on load so the stored form can
 * never disagree with the graph invariants.
 */

export interface SerializedGraph {
  version: 1;
  capabilities: Capability[];
}

export function serializeGraph(graph: SemanticCapabilityGraph): SerializedGraph {
  return { version: 1, capabilities: graph.listCapabilities() };
}

export function deserializeGraph(serialized: unknown): SemanticCapabilityGraph | undefined {
  const data = serialized as SerializedGraph | undefined;
  if (!data || data.version !== 1 || !Array.isArray(data.capabilities)) return undefined;
  const valid = data.capabilities.filter((c) => c && typeof c.id === 'string' && typeof c.action === 'string' && c.externalOperation && Array.isArray(c.inputs));
  if (valid.length === 0) return undefined;
  return SemanticCapabilityGraph.build(valid);
}
