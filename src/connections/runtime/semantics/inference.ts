import type { Capability, CapabilityInput, CapabilityOutput, CapabilityAction, InputResolution, SchemaType, SemanticConcept, SideEffect } from '../model/capability.js';
import type { RawOperation, RawParameter } from '../model/operation.js';
import { inferSemanticRole } from './roles.js';
import { conceptFromWord, inferSemanticTarget } from './targets.js';

/**
 * The CapabilityNormalizer. Interpreters (OpenAPI/GraphQL/MCP) produce
 * protocol-neutral RawOperations; this module decides actions, semantic
 * targets, roles and resolutions. After this point protocol identity is
 * execution metadata only — orchestration never sees it.
 */

function schemaType(raw: string): SchemaType {
  const t = raw.toLowerCase();
  if (t === 'string' || t === 'number' || t === 'boolean' || t === 'object' || t === 'array') return t as SchemaType;
  if (t === 'integer' || t === 'float' || t === 'double' || t === 'long') return 'number';
  return 'unknown';
}

/** Derive the fundamental action for an operation that lacks an interpreter hint. */
function resolveAction(raw: RawOperation): CapabilityAction {
  if (raw.actionHint) return raw.actionHint;
  const name = raw.id.toLowerCase();
  if (/^(list|get|fetch|find|search|query|describe|read)/.test(name)) return name.startsWith('search') || name.startsWith('find') ? 'search' : 'read';
  if (/^(create|add|new|provision|launch|register)/.test(name)) return 'create';
  if (/^(update|patch|set|modify|edit|rename)/.test(name)) return 'update';
  if (/^(delete|remove|destroy|drop|teardown)/.test(name)) return 'delete';
  return 'execute';
}

function sideEffectFor(action: CapabilityAction): SideEffect {
  if (action === 'read' || action === 'discover' || action === 'search') return 'none';
  if (action === 'delete' || action === 'detach') return 'destructive';
  return 'reversible';
}

/** Decide how a required input gets its value. */
function resolutionFor(input: { semanticRole?: string; required: boolean; enumValues?: string[] }): InputResolution {
  if (input.semanticRole === 'credential-secret' || input.semanticRole === 'database-admin-password') return 'credential';
  if (input.semanticRole === 'parent-scope-id' || input.semanticRole === 'resource-id') return 'discoverable';
  if (input.semanticRole === 'resource-name') return 'generated';
  if (input.required) return 'user-required';
  return 'known';
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Reduce an external identifier to its concept stem: `project_uuid` →
 * `project`, `zoneId` → `zone`, `cluster_ref` → `cluster`. Used to match
 * discoverable inputs to read capabilities that produce them.
 */
export function identifierStem(externalName: string): string {
  const tokens = externalName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const suffixes = new Set(['id', 'ids', 'uuid', 'uuids', 'guid', 'uid', 'ref', 'reference', 'key', 'slug']);
  while (tokens.length > 1 && suffixes.has(tokens[tokens.length - 1]!)) tokens.pop();
  return conceptFromWord(tokens.join('-')).id;
}

function normalizeParameter(param: RawParameter): CapabilityInput {
  const binding = inferSemanticRole(param.externalName, { description: param.description });
  const input: CapabilityInput = {
    externalName: param.externalName,
    required: param.required,
    type: schemaType(param.type),
    location: param.location,
    resolution: 'user-required',
  };
  if (binding) {
    input.semanticRole = binding.semanticRole;
    input.roleConfidence = binding.confidence;
    input.roleEvidence = binding.evidence;
  }
  if (param.description) input.description = param.description;
  if (param.enumValues && param.enumValues.length > 0) input.enumValues = param.enumValues;
  input.resolution = resolutionFor({ semanticRole: input.semanticRole, required: param.required, enumValues: input.enumValues });
  return input;
}

export function normalizeOperations(rawOperations: RawOperation[]): Capability[] {
  const capabilities: Capability[] = [];
  const seen = new Set<string>();
  for (const raw of rawOperations) {
    const action = resolveAction(raw);
    const enumValues = [...new Set(raw.parameters.flatMap((p) => p.enumValues ?? []))];
    const targetName = raw.targetHint?.name ?? raw.id;
    const { target, variants } = inferSemanticTarget({ name: targetName, description: raw.description, enumValues, evidence: raw.targetHint?.evidence });

    const inputs = raw.parameters.map(normalizeParameter);
    const outputs: CapabilityOutput[] = raw.outputs.map((out) => {
      const binding = inferSemanticRole(out.externalName);
      if (binding) return { externalName: out.externalName, semanticRole: binding.semanticRole, roleConfidence: binding.confidence, type: schemaType(out.type), description: out.description };
      const isRead = action === 'read' || action === 'discover' || action === 'search';
      if (isRead && /(^|_)(id|uuid)$/i.test(out.externalName)) {
        return { externalName: out.externalName, semanticRole: `${target.id}-id`, roleConfidence: 0.6, type: schemaType(out.type), description: out.description };
      }
      return { externalName: out.externalName, type: schemaType(out.type), description: out.description };
    });

    const roleConfidences = inputs.map((i) => i.roleConfidence).filter((c): c is number => typeof c === 'number');
    const confidence = roleConfidences.length > 0 ? Math.min(target.confidence, ...roleConfidences) : target.confidence;

    const baseId = `${action}-${slugify(target.id)}-${slugify(raw.id)}`;
    let id = baseId;
    for (let n = 2; seen.has(id); n++) id = `${baseId}-${n}`;
    seen.add(id);

    capabilities.push({
      id,
      label: raw.label,
      action,
      semanticTarget: target,
      semanticVariants: variants,
      externalOperation: raw.external,
      inputs,
      outputs,
      relationships: raw.relationshipHints.filter((hint) => hint.to === target.id),
      sideEffect: sideEffectFor(action),
      confidence,
      description: raw.description,
      verification: [],
    });
  }
  return capabilities;
}

export type { SemanticConcept };
