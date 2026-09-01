import type { SemanticCapabilityGraph } from '../graph/capability-graph.js';
import { canonicalJson, sha256 } from '../../../util.js';
import type { UniversalExecutor } from '../execution/executor.js';

/**
 * The RemoteStateDiscoverer. Safe reads only — it never mutates. It observes
 * what currently exists, maintains a monotonic state epoch that advances
 * whenever OBSERVED content actually changes, and thereby feeds the retry
 * guard: failed operations become eligible again only when real state or
 * schema changed, not when the model merely wants to retry.
 */

const READER_ACTIONS = new Set(['read', 'discover', 'search']);

export interface ObservedInstance {
  concept: string;
  id: string;
  sourceCapabilityId: string;
}

export interface StateSnapshot {
  epoch: number;
  observed: ObservedInstance[];
  readErrors: string[];
  contentHash: string;
  discoveredAt: string;
}

function extractInstanceId(item: unknown): string | undefined {
  if (!item || typeof item !== 'object') return typeof item === 'string' ? item : undefined;
  const record = item as Record<string, unknown>;
  for (const key of ['id', 'uuid', 'uid', 'name']) {
    const value = record[key];
    if (typeof value === 'string' && value) return value;
    if (typeof value === 'number') return String(value);
  }
  return undefined;
}

function extractItems(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const value of Object.values(data as Record<string, unknown>)) {
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

export class RemoteStateDiscoverer {
  private epoch = 0;
  private lastHash: string | undefined;

  constructor(private executor: UniversalExecutor, private graph: SemanticCapabilityGraph, private connectionId: string, private schemaFingerprint: string) {}

  currentEpoch(): number {
    return this.epoch;
  }

  /** Explicitly advance the epoch (e.g. after a successful mutation). */
  bumpEpoch(): number {
    this.epoch += 1;
    return this.epoch;
  }

  /** Run safe read capabilities and snapshot the observed state. */
  async observe(conceptHint?: string): Promise<StateSnapshot> {
    const readers = this.graph
      .listCapabilities()
      .filter((c) => READER_ACTIONS.has(c.action) && c.sideEffect === 'none' && (!conceptHint || c.semanticTarget?.id === conceptHint))
      .filter((c) => c.inputs.every((input) => !input.required || input.resolution === 'generated'));
    const observed: ObservedInstance[] = [];
    const readErrors: string[] = [];
    for (const reader of readers) {
      try {
        const outcome = await this.executor.execute(reader, {}, { connectionId: this.connectionId, schemaFingerprint: this.schemaFingerprint, stateEpoch: this.epoch });
        if (!outcome.ok) {
          readErrors.push(`${reader.id}: ${outcome.error?.category ?? 'UNKNOWN'}`);
          continue;
        }
        for (const item of extractItems(outcome.data)) {
          const id = extractInstanceId(item);
          if (id && reader.semanticTarget) observed.push({ concept: reader.semanticTarget.id, id, sourceCapabilityId: reader.id });
        }
      } catch (error) {
        readErrors.push(`${reader.id}: ${(error as Error).message}`);
      }
    }
    const contentHash = sha256(canonicalJson(observed));
    if (contentHash !== this.lastHash) {
      this.epoch += 1;
      this.lastHash = contentHash;
    }
    return { epoch: this.epoch, observed, readErrors, contentHash, discoveredAt: new Date().toISOString() };
  }
}
