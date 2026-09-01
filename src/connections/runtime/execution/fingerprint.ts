import { canonicalJson, sha256 } from '../../../util.js';
import type { Capability } from '../model/capability.js';

/**
 * Operation fingerprints. A fingerprint identifies "this operation, these
 * parameters, this connection, this schema, this known remote state" — so a
 * repeated identical failure can be blocked, while legitimate retries after
 * real state or schema changes remain eligible.
 */

export interface FingerprintContext {
  connectionId: string;
  /** Fingerprint of the introspected schema the capability came from. */
  schemaFingerprint: string;
  /** Remote-state epoch: advances when observed state actually changes. */
  stateEpoch: number;
}

/** Keep only parameters the capability actually declares, normalized. */
function declaredParams(capability: Capability, params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const input of capability.inputs) {
    const value = params[input.externalName];
    if (value !== undefined && value !== null && value !== '') out[input.externalName] = value;
  }
  return out;
}

export function operationFingerprint(capability: Capability, params: Record<string, unknown>, ctx: FingerprintContext): string {
  return sha256(
    canonicalJson({
      capabilityId: capability.id,
      action: capability.action,
      params: declaredParams(capability, params),
      connection: ctx.connectionId,
      schema: ctx.schemaFingerprint,
      stateEpoch: ctx.stateEpoch,
    }),
  );
}
