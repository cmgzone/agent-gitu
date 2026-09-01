import type { CapabilityRelationship } from '../model/capability.js';
import type { RawOperation, RawOutput, RawParameter } from '../model/operation.js';
import { conceptFromWord, singularize } from '../semantics/targets.js';

/**
 * OpenAPI interpreter. Parses an OpenAPI 3 document into protocol-neutral
 * RawOperations for the semantic normalizer. The interpreter understands the
 * REST/OpenAPI PROTOCOL; it knows nothing about any specific provider.
 */

type JsonSchema = Record<string, unknown>;

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const ACTION_HINTS: Record<string, RawOperation['actionHint']> = { get: 'read', post: 'create', put: 'update', patch: 'update', delete: 'delete' };
const MAX_REF_DEPTH = 4;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/** Resolve a local JSON pointer reference (#/components/schemas/X). */
function resolveRef(root: Record<string, unknown>, ref: string, depth: number): JsonSchema | undefined {
  if (!ref.startsWith('#/') || depth > MAX_REF_DEPTH) return undefined;
  let node: unknown = root;
  for (const segment of ref.slice(2).split('/')) {
    const record = asRecord(node);
    if (!record) return undefined;
    node = record[segment.replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  return asRecord(node);
}

/** Flatten a schema: follow $ref, merge allOf, keep oneOf/anyOf first branch. */
function flattenSchema(root: Record<string, unknown>, schema: JsonSchema, depth: number): JsonSchema {
  if (depth > MAX_REF_DEPTH) return {};
  const ref = typeof schema['$ref'] === 'string' ? (schema['$ref'] as string) : undefined;
  if (ref) {
    const resolved = resolveRef(root, ref, depth);
    return resolved ? flattenSchema(root, resolved, depth + 1) : {};
  }
  if (Array.isArray(schema['allOf'])) {
    const merged: JsonSchema = {};
    for (const part of schema['allOf'] as JsonSchema[]) {
      const flat = flattenSchema(root, part, depth + 1);
      merged['properties'] = { ...(asRecord(merged['properties']) ?? {}), ...(asRecord(flat['properties']) ?? {}) };
      const required = [...((merged['required'] as string[]) ?? []), ...((flat['required'] as string[]) ?? [])];
      if (required.length > 0) merged['required'] = [...new Set(required)];
      for (const key of ['type', 'description', 'enum'] as const) if (flat[key] !== undefined) merged[key] = flat[key];
    }
    return merged;
  }
  for (const key of ['oneOf', 'anyOf'] as const) {
    if (Array.isArray(schema[key]) && (schema[key] as JsonSchema[]).length > 0) {
      return flattenSchema(root, (schema[key] as JsonSchema[])[0]!, depth + 1);
    }
  }
  return schema;
}

/** Extract body parameters from a request/response schema. */
function schemaProperties(root: Record<string, unknown>, schema: JsonSchema, depth: number): { externalName: string; type: string; description?: string; enumValues?: string[]; required: boolean }[] {
  const flat = flattenSchema(root, schema, depth);
  const properties = asRecord(flat['properties']);
  if (!properties) return [];
  const required = new Set((flat['required'] as string[]) ?? []);
  return Object.entries(properties).map(([externalName, raw]) => {
    const prop = flattenSchema(root, asRecord(raw) ?? {}, depth + 1);
    const enumValues = Array.isArray(prop['enum']) ? (prop['enum'] as unknown[]).map(String) : undefined;
    return { externalName, type: String(prop['type'] ?? 'unknown'), description: typeof prop['description'] === 'string' ? (prop['description'] as string) : undefined, enumValues, required: required.has(externalName) };
  });
}

/** Extract output fields from 2xx JSON responses. */
function responseOutputs(root: Record<string, unknown>, responses: unknown): RawOutput[] {
  const responsesRecord = asRecord(responses);
  if (!responsesRecord) return [];
  const successKey = Object.keys(responsesRecord).find((k) => /^2\d\d$|^2XX$/i.test(k));
  if (!successKey) return [];
  const response = asRecord(responsesRecord[successKey]);
  const content = asRecord(response?.['content']);
  const json = asRecord(content?.['application/json']);
  const schema = asRecord(json?.['schema']);
  if (!schema) return [];
  const flat = flattenSchema(root, schema, 0);
  const target = flat['type'] === 'array' ? flattenSchema(root, asRecord(flat['items']) ?? {}, 1) : flat;
  return schemaProperties(root, target, 1).slice(0, 24).map((p) => ({ externalName: p.externalName, type: p.type, description: p.description }));
}

/** Evidence-based relationship hints from path nesting: /zones/{id}/engines → zone contains engine. */
function relationshipHintsFromPath(path: string): CapabilityRelationship[] {
  const literals = path
    .split('/')
    .filter(Boolean)
    .filter((segment) => !/^\{.*\}$/.test(segment));
  const hints: CapabilityRelationship[] = [];
  for (let i = 0; i + 1 < literals.length; i++) {
    const from = conceptFromWord(singularize(literals[i]!)).id;
    const to = conceptFromWord(singularize(literals[i + 1]!)).id;
    if (from === to) continue;
    hints.push({
      from,
      to,
      relation: 'contains',
      confidence: 0.9,
      evidence: [`path "${path}" nests ${literals[i + 1]} under ${literals[i]}`],
    });
  }
  return hints;
}

function pathParameters(pathItem: Record<string, unknown> | undefined, op: Record<string, unknown>): RawParameter[] {
  const out: RawParameter[] = [];
  const seen = new Set<string>();
  for (const source of [pathItem?.['parameters'], op['parameters']]) {
    if (!Array.isArray(source)) continue;
    for (const raw of source) {
      const param = asRecord(raw);
      if (!param || typeof param['name'] !== 'string') continue;
      const location = String(param['in'] ?? 'query');
      if (seen.has(`${location}:${param['name']}`)) continue;
      seen.add(`${location}:${param['name']}`);
      const schema = flattenSchema({}, asRecord(param['schema']) ?? {}, 0);
      out.push({
        externalName: param['name'],
        location: location === 'path' ? 'path' : location === 'header' ? 'header' : 'query',
        required: location === 'path' ? true : Boolean(param['required']),
        type: String(schema['type'] ?? 'string'),
        description: typeof param['description'] === 'string' ? (param['description'] as string) : schema['description'] as string | undefined,
        enumValues: Array.isArray(schema['enum']) ? (schema['enum'] as unknown[]).map(String) : undefined,
      });
    }
  }
  return out;
}

/**
 * Introspect an OpenAPI 3 document into RawOperations. Returns [] for
 * documents without a paths object.
 */
export function introspectOpenApi(document: unknown): RawOperation[] {
  const root = asRecord(document);
  const paths = asRecord(root?.['paths']);
  if (!root || !paths) return [];
  const operations: RawOperation[] = [];
  for (const [path, rawItem] of Object.entries(paths)) {
    const pathItem = asRecord(rawItem);
    if (!pathItem) continue;
    for (const method of HTTP_METHODS) {
      const op = asRecord(pathItem[method]);
      if (!op) continue;
      const literals = path.split('/').filter(Boolean).filter((s) => !/^\{.*\}$/.test(s));
      const targetName = literals[literals.length - 1] ?? path;
      const parameters = pathParameters(pathItem, op);
      const requestBody = asRecord(op['requestBody']);
      const content = asRecord(asRecord(requestBody?.['content'])?.['application/json']);
      if (content) {
        for (const prop of schemaProperties(root, asRecord(content['schema']) ?? {}, 0)) {
          parameters.push({ externalName: prop.externalName, location: 'body', required: prop.required, type: prop.type, description: prop.description, enumValues: prop.enumValues });
        }
      }
      const id = typeof op['operationId'] === 'string' && op['operationId'] ? (op['operationId'] as string) : `${method}:${path}`;
      operations.push({
        id,
        label: typeof op['summary'] === 'string' && op['summary'] ? (op['summary'] as string) : `${method.toUpperCase()} ${path}`,
        description: typeof op['description'] === 'string' ? (op['description'] as string) : undefined,
        external: { protocol: 'rest', method: method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', pathTemplate: path },
        parameters,
        outputs: responseOutputs(root, op['responses']),
        actionHint: ACTION_HINTS[method],
        relationshipHints: relationshipHintsFromPath(path),
        targetHint: { name: targetName, evidence: [`path "${method.toUpperCase()} ${path}" targets "${targetName}"`] },
      });
    }
  }
  return operations;
}
