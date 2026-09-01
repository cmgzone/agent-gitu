import type { Capability } from '../model/capability.js';
import type { SemanticCapabilityGraph } from '../graph/capability-graph.js';
import type { ExecutionOutcome, VerificationResult } from '../model/verification.js';
import type { UniversalExecutor } from '../execution/executor.js';

/**
 * The ResultVerifier. A successful execution response is NOT proof. When a
 * read-back capability exists, the verifier independently observes the
 * external system and looks for the created/updated object. Execution
 * confidence and verification confidence are reported separately: "EXECUTED
 * but not independently VERIFIED" is an honest, distinct outcome.
 */

const RESPONSE_ONLY_CONFIDENCE = 0.45;

const READER_ACTIONS = new Set(['read', 'discover', 'search']);

/** Deep-search a JSON payload for an object whose id-like field matches. */
function containsObjectWithId(data: unknown, expectedId: string): boolean {
  if (data === null || data === undefined) return false;
  if (Array.isArray(data)) return data.some((item) => containsObjectWithId(item, expectedId));
  if (typeof data !== 'object') return false;
  const record = data as Record<string, unknown>;
  for (const key of ['id', 'uuid', 'uid']) {
    const value = record[key];
    if ((typeof value === 'string' || typeof value === 'number') && String(value) === expectedId) return true;
  }
  return Object.values(record).some((value) => containsObjectWithId(value, expectedId));
}

function extractCreatedId(data: unknown): string | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return undefined;
  const record = data as Record<string, unknown>;
  for (const key of ['id', 'uuid', 'uid']) {
    const value = record[key];
    if (typeof value === 'string' && value) return value;
    if (typeof value === 'number') return String(value);
  }
  for (const value of Object.values(record)) {
    const nested = extractCreatedId(value);
    if (nested) return nested;
  }
  return undefined;
}

export class ResultVerifier {
  constructor(
    private executor: UniversalExecutor,
    private graph: SemanticCapabilityGraph,
    private connectionId: string,
    private schemaFingerprint: string,
    private currentEpoch: () => number,
  ) {}

  async verify(capability: Capability, params: Record<string, unknown>, outcome: ExecutionOutcome): Promise<VerificationResult> {
    if (!outcome.ok) return { status: 'skipped', confidence: 0, strategy: 'none', detail: 'execution failed — verification not attempted' };
    const expectedId = extractCreatedId(outcome.data);
    const targetId = capability.semanticTarget?.id;
    const readers = this.graph
      .listCapabilities()
      .filter((c) => READER_ACTIONS.has(c.action) && c.sideEffect === 'none' && c.id !== capability.id)
      .filter((c) => (c.semanticTarget?.id === targetId) || this.graph.parentConceptOf(c) === targetId)
      .filter((c) => c.inputs.every((input) => !input.required || input.resolution === 'generated' || params[input.externalName] !== undefined))
      .sort((a, b) => a.inputs.filter((i) => i.required).length - b.inputs.filter((i) => i.required).length);

    const reader = readers[0];
    if (!reader) {
      return { status: 'partial', confidence: RESPONSE_ONLY_CONFIDENCE, strategy: 'response-only', detail: `no read-back capability found for ${targetId ?? capability.id} — execution succeeded (HTTP ${outcome.status}) but the result was not independently observed` };
    }
    const readParams: Record<string, unknown> = {};
    for (const input of reader.inputs) if (params[input.externalName] !== undefined) readParams[input.externalName] = params[input.externalName];
    try {
      const readOutcome = await this.executor.execute(reader, readParams, { connectionId: this.connectionId, schemaFingerprint: this.schemaFingerprint, stateEpoch: this.currentEpoch() });
      if (readOutcome.ok && expectedId && containsObjectWithId(readOutcome.data, expectedId)) {
        return { status: 'verified', confidence: 0.95, strategy: `read-back via ${reader.id}`, detail: `read capability "${reader.label}" independently observed the expected object (id ${expectedId})` };
      }
      if (readOutcome.ok && !expectedId) {
        return { status: 'partial', confidence: RESPONSE_ONLY_CONFIDENCE, strategy: 'response-only', detail: `execution succeeded (HTTP ${outcome.status}) but no object id in the response to confirm via "${reader.label}"` };
      }
      if (readOutcome.ok) {
        return { status: 'failed', confidence: 0.2, strategy: `read-back via ${reader.id}`, detail: `execution returned HTTP ${outcome.status} but read-back "${reader.label}" did not find the expected object` };
      }
      return { status: 'partial', confidence: RESPONSE_ONLY_CONFIDENCE, strategy: 'response-only', detail: `verification read failed (${readOutcome.error?.category ?? 'UNKNOWN'}) — execution result remains response-only` };
    } catch (error) {
      return { status: 'partial', confidence: RESPONSE_ONLY_CONFIDENCE, strategy: 'response-only', detail: `verification read threw: ${(error as Error).message}` };
    }
  }
}
