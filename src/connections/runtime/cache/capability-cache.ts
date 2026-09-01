import { unlinkSync } from 'node:fs';
import path from 'node:path';
import { readJson, writeJson, nowIso } from '../../../util.js';
import { ensureGituHome } from '../../../workspace/home.js';
import type { SemanticCapabilityGraph } from '../graph/capability-graph.js';
import { deserializeGraph, serializeGraph, type SerializedGraph } from '../graph/serialization.js';
import type { Capability } from '../model/capability.js';

/**
 * The CapabilityCache. Learned capability graphs are persisted per connection
 * with the schema fingerprint that produced them, so a second session reuses
 * the graph without re-introspecting (token + latency win) and refreshes only
 * when the remote schema actually changed.
 */

export interface CachedConnectionKnowledge {
  version: 1;
  connectionId: string;
  schemaFingerprint: string;
  introspectionSource: 'openapi' | 'graphql' | 'mcp' | 'manual';
  savedAt: string;
  graph: SerializedGraph;
  /** Successful prerequisite resolution chains learned from this connection. */
  successfulResolutions: Record<string, { chain: string[]; at: string }>;
}

export class CapabilityCache {
  constructor(private connectionId: string) {}

  private file(): string {
    const safeId = this.connectionId.replace(/[^a-zA-Z0-9_-]/g, '_');
    return path.join(ensureGituHome().settings, 'connection-capabilities', `${safeId}.json`);
  }

  /**
   * Load the cached graph ONLY when the schema fingerprint matches exactly.
   * Any mismatch (or corrupt entry) returns undefined so the caller
   * re-introspects instead of reasoning from a stale graph.
   */
  load(schemaFingerprint: string): { capabilities: Capability[]; knowledge: CachedConnectionKnowledge } | undefined {
    const knowledge = readJson<CachedConnectionKnowledge>(this.file());
    if (!knowledge || knowledge.version !== 1 || knowledge.connectionId !== this.connectionId || knowledge.schemaFingerprint !== schemaFingerprint) return undefined;
    const graph = deserializeGraph(knowledge.graph);
    if (!graph) return undefined;
    return { capabilities: graph.listCapabilities(), knowledge };
  }

  store(graph: SemanticCapabilityGraph, schemaFingerprint: string, introspectionSource: CachedConnectionKnowledge['introspectionSource']): void {
    const previous = readJson<CachedConnectionKnowledge>(this.file());
    const knowledge: CachedConnectionKnowledge = {
      version: 1,
      connectionId: this.connectionId,
      schemaFingerprint,
      introspectionSource,
      savedAt: nowIso(),
      graph: serializeGraph(graph),
      successfulResolutions: previous?.successfulResolutions ?? {},
    };
    writeJson(this.file(), knowledge);
  }

  /** Learn a successful prerequisite resolution chain for later reuse. */
  rememberResolution(key: string, chain: string[]): void {
    const knowledge = readJson<CachedConnectionKnowledge>(this.file());
    if (!knowledge) return;
    knowledge.successfulResolutions[key] = { chain, at: nowIso() };
    writeJson(this.file(), knowledge);
  }

  clear(): void {
    try {
      unlinkSync(this.file());
    } catch {
      /* already absent */
    }
  }
}
