import type { RawOperation, RawOutput, RawParameter } from '../model/operation.js';

/**
 * GraphQL interpreter. Converts a standard GraphQL introspection result into
 * protocol-neutral RawOperations. It understands the GraphQL PROTOCOL only —
 * query/mutation fields become read/execute capabilities for the normalizer.
 */

export interface GraphQlTypeRef {
  kind?: string;
  name?: string | null;
  ofType?: GraphQlTypeRef | null;
}

export interface GraphQlArg {
  name: string;
  description?: string | null;
  defaultValue?: unknown;
  type: GraphQlTypeRef;
}

export interface GraphQlField {
  name: string;
  description?: string | null;
  args?: GraphQlArg[] | null;
  type?: GraphQlTypeRef | null;
}

export interface GraphQlType {
  kind?: string;
  name?: string | null;
  description?: string | null;
  fields?: GraphQlField[] | null;
  /** Present on ENUM kinds in standard introspection results. */
  enumValues?: { name?: string | null }[] | null;
}

export interface GraphQlIntrospection {
  queryType?: { name?: string | null } | null;
  mutationType?: { name?: string | null } | null;
  types?: GraphQlType[] | null;
}

function unwrapType(ref: GraphQlTypeRef | undefined | null): { type: string; required: boolean; named: string | undefined } {
  let required = false;
  let current = ref;
  while (current && (current.kind === 'NON_NULL' || current.kind === 'LIST')) {
    if (current.kind === 'NON_NULL') required = true;
    current = current.ofType;
  }
  return { type: current?.kind === 'SCALAR' ? (current.name ?? 'string').toLowerCase() : 'object', required, named: current?.name ?? undefined };
}

function mutationActionHint(field: string): RawOperation['actionHint'] {
  const lower = field.toLowerCase();
  if (/^(create|add|new|provision|launch|register)/.test(lower)) return 'create';
  if (/^(update|patch|set|modify|edit|rename)/.test(lower)) return 'update';
  if (/^(delete|remove|destroy|drop|teardown)/.test(lower)) return 'delete';
  return 'execute';
}

/** Introspect a GraphQL introspection result into RawOperations. */
export function introspectGraphQl(introspection: GraphQlIntrospection): RawOperation[] {
  const types = introspection.types ?? [];
  const byName = new Map(types.map((t) => [t.name ?? '', t]));

  /** Protocol-faithful enum extraction: an ENUM-typed argument carries its
   * declared values so the normalizer can infer type variants. */
  const parametersFromArgs = (args: GraphQlArg[] | null | undefined): RawParameter[] =>
    (args ?? []).map((arg) => {
      const unwrapped = unwrapType(arg.type);
      let enumValues: string[] | undefined;
      if (unwrapped.named && unwrapped.type === 'object') {
        const declared = byName.get(unwrapped.named);
        if (declared?.kind === 'ENUM' && Array.isArray(declared.enumValues)) {
          enumValues = declared.enumValues.map((value) => String(value.name ?? '')).filter(Boolean);
        }
      }
      return { externalName: arg.name, location: 'argument', required: unwrapped.required, type: unwrapped.type, description: arg.description ?? undefined, enumValues };
    });

  const rootFields = (rootName: string | null | undefined, isMutation: boolean): GraphQlField[] => {
    if (!rootName) return [];
    return byName.get(rootName)?.fields ?? [];
  };

  const operations: RawOperation[] = [];
  for (const field of rootFields(introspection.queryType?.name, false)) {
    const parameters = parametersFromArgs(field.args);
    const unwrapped = unwrapType(field.type ?? undefined);
    const targetType = unwrapped.named ? byName.get(unwrapped.named) : undefined;
    const outputs: RawOutput[] = (targetType?.fields ?? []).slice(0, 24).map((f) => ({ externalName: f.name, type: unwrapType(f.type ?? undefined).type, description: f.description ?? undefined }));
    operations.push({
      id: `query:${field.name}`,
      label: field.name,
      description: field.description ?? undefined,
      external: { protocol: 'graphql', operationType: 'query', field: field.name },
      parameters,
      outputs,
      actionHint: 'read',
      relationshipHints: [],
      targetHint: { name: field.name, evidence: [`GraphQL query field "${field.name}"`] },
    });
  }

  for (const field of rootFields(introspection.mutationType?.name, true)) {
    const parameters = parametersFromArgs(field.args);
    operations.push({
      id: `mutation:${field.name}`,
      label: field.name,
      description: field.description ?? undefined,
      external: { protocol: 'graphql', operationType: 'mutation', field: field.name },
      parameters,
      outputs: [],
      actionHint: mutationActionHint(field.name),
      relationshipHints: [],
      targetHint: { name: field.name, evidence: [`GraphQL mutation field "${field.name}"`] },
    });
  }

  return operations;
}
