import type { Capability } from '../model/capability.js';
import type { SemanticCapabilityGraph } from '../graph/capability-graph.js';
import type { PlanStep, ResolutionPlan } from './resolution-plan.js';

/**
 * The PrerequisiteResolver. Given a capability and the values already known,
 * recursively plans how every discoverable prerequisite can be produced by a
 * read capability — regardless of what the fields are called. Cycles and
 * depth limits are handled by reporting gaps, never by looping.
 */

const DEFAULT_MAX_DEPTH = 6;

interface Counters {
  known: string[];
  credentialInputs: string[];
  generatedInputs: string[];
  userRequired: string[];
  unresolved: string[];
}

export class PrerequisiteResolver {
  constructor(private graph: SemanticCapabilityGraph, private options?: { maxDepth?: number }) {}

  plan(capabilityId: string, known: Record<string, unknown> = {}): ResolutionPlan {
    const capability = this.graph.capability(capabilityId);
    if (!capability) throw new Error(`Unknown capability "${capabilityId}".`);
    const steps: PlanStep[] = [];
    const counters: Counters = { known: [], credentialInputs: [], generatedInputs: [], userRequired: [], unresolved: [] };
    const visited = new Set<string>([capability.id]);
    const required = capability.inputs.filter((input) => input.required);
    this.planConsumer(capability, known, counters, steps, visited, 0);

    const resolvedCount = counters.known.length + counters.credentialInputs.length + counters.generatedInputs.length + steps.length;
    const userRequired = [...counters.userRequired, ...counters.unresolved];
    return {
      capabilityId,
      steps,
      known: counters.known,
      credentialInputs: counters.credentialInputs,
      generatedInputs: counters.generatedInputs,
      userRequired,
      unresolved: counters.unresolved,
      total: required.length,
      resolvedCount,
      ready: counters.unresolved.length === 0 && counters.userRequired.length === 0,
    };
  }

  private planConsumer(consumer: Capability, known: Record<string, unknown>, counters: Counters, steps: PlanStep[], visited: Set<string>, depth: number): void {
    const maxDepth = this.options?.maxDepth ?? DEFAULT_MAX_DEPTH;
    for (const input of consumer.inputs.filter((i) => i.required)) {
      if (Object.prototype.hasOwnProperty.call(known, input.externalName) && known[input.externalName] !== undefined && known[input.externalName] !== '') {
        counters.known.push(input.externalName);
        continue;
      }
      if (input.resolution === 'credential') {
        counters.credentialInputs.push(input.externalName);
        continue;
      }
      if (input.resolution === 'generated') {
        counters.generatedInputs.push(input.externalName);
        continue;
      }
      if (input.resolution !== 'discoverable') {
        counters.userRequired.push(input.externalName);
        continue;
      }
      const producers = this.graph.producersForInput(input, consumer).filter((producer) => !visited.has(producer.id));
      if (producers.length === 0 || depth >= maxDepth) {
        counters.unresolved.push(input.externalName);
        continue;
      }
      const producer = producers[0]!;
      visited.add(producer.id);
      steps.push({
        producerCapabilityId: producer.id,
        resolvesInput: input.externalName,
        semanticRole: input.semanticRole,
        feedsCapabilityId: consumer.id,
        depth,
        evidence: [
          `${input.externalName} (${input.semanticRole}) is required by ${consumer.label}`,
          `read capability "${producer.label}" produces ${producer.outputs.find((o) => o.semanticRole)?.semanticRole ?? producer.semanticTarget?.id ?? 'matching values'}`,
        ],
      });
      this.planConsumer(producer, {}, counters, steps, visited, depth + 1);
    }
  }
}
