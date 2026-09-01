import type { Capability, CapabilityInput, SemanticConcept } from '../model/capability.js';
import { identifierStem } from '../semantics/inference.js';
import { aggregateRelationships, type AggregatedRelationship } from './relationships.js';

/**
 * The SemanticCapabilityGraph: the heart of the runtime. Concepts become
 * nodes, evidence-based relationships become edges, and capabilities attach
 * to the concept they operate on. All lookups are semantic — nothing here
 * knows or cares which protocol or provider a capability came from.
 */

export interface GraphNode {
  id: string;
  label: string;
  capabilityIds: string[];
  parents: string[];
  children: string[];
  /** Type variants discoverable under this concept (e.g. postgresql, mysql). */
  variants: SemanticConcept[];
  evidence: string[];
}

const PRODUCER_ACTIONS = new Set(['read', 'discover', 'search']);

export class SemanticCapabilityGraph {
  private capabilities = new Map<string, Capability>();
  private nodes = new Map<string, GraphNode>();
  private edges: AggregatedRelationship[] = [];

  static build(capabilities: Capability[]): SemanticCapabilityGraph {
    const graph = new SemanticCapabilityGraph();
    for (const capability of capabilities) graph.addCapability(capability);
    return graph;
  }

  addCapability(capability: Capability): void {
    this.capabilities.set(capability.id, capability);
    const target = capability.semanticTarget;
    if (target) {
      const node = this.ensureNode(target.id, target.label);
      if (!node.capabilityIds.includes(capability.id)) node.capabilityIds.push(capability.id);
      for (const variant of capability.semanticVariants) if (!node.variants.some((v) => v.id === variant.id)) node.variants.push(variant);
      for (const relationship of capability.relationships) {
        const parentNode = this.ensureNode(relationship.from, relationship.from);
        const childNode = this.ensureNode(relationship.to, relationship.to);
        if (!parentNode.children.includes(childNode.id)) parentNode.children.push(childNode.id);
        if (!childNode.parents.includes(parentNode.id)) childNode.parents.push(parentNode.id);
      }
      this.edges = aggregateRelationships([...this.capabilities.values()]);
    }
  }

  private ensureNode(id: string, label: string): GraphNode {
    let node = this.nodes.get(id);
    if (!node) {
      node = { id, label: label || id, capabilityIds: [], parents: [], children: [], variants: [], evidence: [] };
      this.nodes.set(id, node);
    }
    return node;
  }

  listCapabilities(): Capability[] {
    return [...this.capabilities.values()];
  }

  capability(id: string): Capability | undefined {
    return this.capabilities.get(id);
  }

  node(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  listNodes(): GraphNode[] {
    return [...this.nodes.values()];
  }

  relationships(): AggregatedRelationship[] {
    return [...this.edges];
  }

  /**
   * Find capabilities that can satisfy a desired semantic target — either by
   * direct target match or by declaring the concept as a type variant
   * (e.g. a "managed-service" create capability that offers "postgresql").
   */
  findForDesiredTarget(conceptId: string, hints?: string[]): Capability[] {
    const wanted = new Set([conceptId.toLowerCase(), ...(hints ?? []).map((h) => h.toLowerCase())]);
    return this.listCapabilities().filter((capability) => {
      if (capability.semanticTarget && wanted.has(capability.semanticTarget.id.toLowerCase())) return true;
      return capability.semanticVariants.some((v) => wanted.has(v.id.toLowerCase()));
    });
  }

  parentConceptOf(capability: Capability): string | undefined {
    const targetId = capability.semanticTarget?.id;
    if (!targetId) return undefined;
    const edge = this.edges.find((e) => e.to === targetId);
    return edge?.from;
  }

  /**
   * Find read-like capabilities that can produce a value for a discoverable
   * input. Matching is semantic: exact role match, stem-to-role match
   * (`project_uuid` → `project-id` output), or stem-to-concept match — never
   * provider knowledge.
   */
  producersForInput(input: CapabilityInput, consumer: Capability): Capability[] {
    if (input.resolution !== 'discoverable' || !input.semanticRole) return [];
    if (input.sourceCapabilities && input.sourceCapabilities.length > 0) {
      return input.sourceCapabilities.map((id) => this.capability(id)).filter((c): c is Capability => Boolean(c && PRODUCER_ACTIONS.has(c.action) && c.sideEffect === 'none'));
    }
    const stem = identifierStem(input.externalName);
    return this.listCapabilities().filter((producer) => {
      if (producer.id === consumer.id) return false;
      if (!PRODUCER_ACTIONS.has(producer.action) || producer.sideEffect !== 'none') return false;
      const roleMatch = producer.outputs.some((out) => out.semanticRole && (out.semanticRole === input.semanticRole || out.semanticRole === `${stem}-id`));
      const conceptMatch = producer.semanticTarget?.id === stem || producer.semanticTarget?.id === input.semanticRole;
      return roleMatch || conceptMatch;
    });
  }
}
