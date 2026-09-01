import type { Capability, CapabilityRelationship } from '../model/capability.js';

/**
 * Evidence-based relationship aggregation. Relationships between concepts are
 * never asserted — they carry the evidence that produced them (path nesting,
 * required parameters, schema structure) and a confidence, so an unknown API's
 * structure can be reasoned about and audited.
 */

export interface AggregatedRelationship {
  from: string;
  to: string;
  relation: CapabilityRelationship['relation'];
  /** Average of contributing hints, capped at 0.97 — relationships stay revisable. */
  confidence: number;
  evidence: string[];
}

/** Merge per-capability relationship hints into unique evidence-based edges. */
export function aggregateRelationships(capabilities: Capability[]): AggregatedRelationship[] {
  const merged = new Map<string, { hint: CapabilityRelationship; confidences: number[] }>();
  for (const capability of capabilities) {
    for (const hint of capability.relationships) {
      const key = `${hint.from}|${hint.to}|${hint.relation}`;
      const existing = merged.get(key);
      if (existing) {
        existing.confidences.push(hint.confidence);
        existing.hint.evidence.push(...hint.evidence.filter((e) => !existing.hint.evidence.includes(e)));
      } else {
        merged.set(key, { hint: { ...hint, evidence: [...hint.evidence] }, confidences: [hint.confidence] });
      }
    }
  }
  return [...merged.values()].map(({ hint, confidences }) => ({
    from: hint.from,
    to: hint.to,
    relation: hint.relation,
    confidence: Math.min(0.97, confidences.reduce((a, b) => a + b, 0) / confidences.length),
    evidence: [...new Set(hint.evidence)],
  }));
}
