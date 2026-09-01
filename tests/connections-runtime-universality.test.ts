import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { deepScrub, VaultCredentialBroker, type CredentialBroker } from '../src/connections/runtime/credentials/credential-broker.js';
import type { McpTransport } from '../src/connections/runtime/execution/executor.js';
import { serializeGraph } from '../src/connections/runtime/graph/serialization.js';
import type { GraphQlIntrospection } from '../src/connections/runtime/interpreters/graphql.js';
import type { McpToolDefinition } from '../src/connections/runtime/interpreters/mcp.js';
import type { Capability } from '../src/connections/runtime/model/capability.js';
import { UniversalConnectionRuntime } from '../src/connections/runtime/orchestrator.js';
import type { VerifiedExecution } from '../src/connections/runtime/model/verification.js';
import { ensureGituHome } from '../src/workspace/home.js';

/**
 * Adversarial universality acceptance gates for the Universal Connection
 * Runtime. Synthetic providers with deliberately different vocabulary and
 * shapes attack the architecture; the SAME plain-language intent ("Add
 * PostgreSQL") must flow through the identical pipeline
 *
 *   intent → semantic target → capability graph → state discovery →
 *   prerequisite resolution → policy → execution → verification
 *
 * with zero provider-name branching anywhere in the runtime.
 *
 * Gates: (1) vocabulary independence, (2) protocol independence, (3) deep
 * prerequisite chain, (4) no literal keyword dependency, (5) secret
 * isolation, (6) provider-name invariant, (7) stale cache, (8) failure
 * state, (9) ambiguous semantics, (10) partial verification honesty.
 * The final block re-runs the original Coolify-shaped scenario purely as a
 * regression fixture — no Coolify-specific logic exists in src/.
 */

const homes: string[] = [];

function home(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-universality-'));
  homes.push(root);
  process.env.AGENT_GITU_HOME = root;
  return root;
}

afterEach(() => {
  if (process.env.AGENT_GITU_HOME?.startsWith(os.tmpdir())) delete process.env.AGENT_GITU_HOME;
  for (const root of homes.splice(0)) rmSync(root, { recursive: true, force: true });
});

function testBroker(secret = 'sekrit-token'): CredentialBroker {
  return new VaultCredentialBroker({ readSecret: () => secret });
}

type FakeHandler = (url: URL, method: string, body: string | undefined, headers: Record<string, string>) => { status: number; data: unknown };

interface FetchCall {
  url: URL;
  method: string;
  body?: string;
  headers: Record<string, string>;
}

function runtimeWithFetch(connectionId: string, handler: FakeHandler, extra: { graphqlEndpoint?: string } = {}) {
  const calls: FetchCall[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const call: FetchCall = {
      url: new URL(String(input)),
      method: String(init?.method ?? 'GET'),
      body: init?.body as string | undefined,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
    };
    calls.push(call);
    const result = handler(call.url, call.method, call.body, call.headers);
    return new Response(JSON.stringify(result.data), { status: result.status });
  }) as typeof fetch;
  const runtime = new UniversalConnectionRuntime({
    connectionId,
    baseUrl: `https://${connectionId}.example.test`,
    broker: testBroker(),
    fetchImpl,
    ...extra,
  });
  return { runtime, calls };
}

/** First id/uuid/uid anywhere inside a payload — the harness's own read of results. */
function findFirstId(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  if (Array.isArray(data)) {
    for (const item of data) {
      const id = findFirstId(item);
      if (id) return id;
    }
    return undefined;
  }
  const record = data as Record<string, unknown>;
  for (const key of ['id', 'uuid', 'uid']) {
    const value = record[key];
    if (typeof value === 'string' && value) return value;
    if (typeof value === 'number') return String(value);
  }
  for (const value of Object.values(record)) {
    const id = findFirstId(value);
    if (id) return id;
  }
  return undefined;
}

interface Intent {
  /** The semantic target the plain-language instruction resolves to. */
  concept: string;
  /** The instruction's type value, phrased in the provider's own vocabulary. */
  typeValue?: Record<string, unknown>;
}

/**
 * Drive one instruction ("Add PostgreSQL") through the full pipeline: pick a
 * mutation capability for the semantic intent, resolve every discoverable
 * prerequisite automatically (deepest chain step first), then execute.
 */
async function fulfillIntent(runtime: UniversalConnectionRuntime, intent: Intent): Promise<{ result: VerifiedExecution; capability: Capability }> {
  const candidates = runtime.capabilitiesForIntent(intent.concept);
  const capability = candidates.find((c) => c.action === 'create');
  expect(capability, `no create capability for intent "${intent.concept}"`).toBeDefined();
  const plan = runtime.planMutation(capability!.id, intent.typeValue ?? {}).plan;
  expect(plan.unresolved, 'prerequisite resolution left gaps').toEqual([]);
  expect(plan.userRequired, 'plan demanded values the instruction never provided').toEqual([]);

  const values: Record<string, unknown> = { ...(intent.typeValue ?? {}) };
  for (const step of [...plan.steps].sort((a, b) => b.depth - a.depth)) {
    const producer = runtime.graphView().capability(step.producerCapabilityId)!;
    const producerParams: Record<string, unknown> = {};
    for (const input of producer.inputs) {
      if (input.required && values[input.externalName] !== undefined) producerParams[input.externalName] = values[input.externalName];
    }
    const stepResult = await runtime.executeCapability(producer.id, producerParams);
    expect(stepResult.execution.ok, `prerequisite read "${producer.label}" failed: ${stepResult.execution.trace}`).toBe(true);
    const id = findFirstId(stepResult.execution.data);
    expect(id, `prerequisite read "${producer.label}" returned no id`).toBeDefined();
    values[step.resolvesInput] = id;
  }
  return { result: await runtime.executeCapability(capability!.id, values), capability: capability! };
}

// ---------------------------------------------------------------------------
// Synthetic provider fixtures — same service, three vocabularies.
// ---------------------------------------------------------------------------

function param(name: string): unknown {
  return { name, in: 'path', required: true, schema: { type: 'string' } };
}

function listResponse(ref: string): unknown {
  return { description: 'ok', content: { 'application/json': { schema: { type: 'array', items: { $ref: `#/components/schemas/${ref}` } } } } };
}

function itemResponse(ref: string): unknown {
  return { description: 'ok', content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } } };
}

function containerDoc(container: { path: string; id: string; singular: string; leaf: string; childIdParam: string; createOperationId: string; listOperationId: string; typeParam: string; typeEnum: string[]; typeDescription: string }): unknown {
  return {
    openapi: '3.0.0',
    info: { title: `Provider offering ${container.leaf}`, version: '1.0' },
    paths: {
      [`/${container.path}`]: {
        get: { operationId: `list${container.singular}s`, summary: `List ${container.path}`, responses: { '200': listResponse(container.singular) } },
        post: { operationId: `create${container.singular}`, summary: `Create a ${container.singular}`, requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } } }, responses: { '201': itemResponse(container.singular) } },
      },
      [`/${container.path}/{${container.id}}/${container.leaf}`]: {
        get: { operationId: container.listOperationId, summary: `List ${container.leaf}`, parameters: [param(container.id)], responses: { '200': listResponse('Offering') } },
        post: {
          operationId: container.createOperationId,
          summary: `Create ${container.leaf}`,
          description: container.typeDescription,
          parameters: [param(container.id)],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: [container.typeParam, 'name'],
                  properties: {
                    [container.typeParam]: { type: 'string', enum: container.typeEnum },
                    name: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { '201': itemResponse('Offering') },
        },
      },
    },
    components: {
      schemas: {
        [container.singular]: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
        Offering: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
      },
    },
  };
}

/** Provider A — project/database vocabulary (kind=postgres). */
const providerA = containerDoc({
  path: 'projects',
  id: 'projectId',
  singular: 'Project',
  leaf: 'databases',
  childIdParam: 'projectId',
  createOperationId: 'createDatabase',
  listOperationId: 'listProjectDatabases',
  typeParam: 'kind',
  typeEnum: ['postgres', 'mysql'],
  typeDescription: 'Create a database in a project',
});

/** Provider B — zone/engine vocabulary (flavor=pgsql). Deliberately contains
 * no "postgres" substring anywhere — gate 4. */
const providerB = containerDoc({
  path: 'zones',
  id: 'zoneId',
  singular: 'Zone',
  leaf: 'engines',
  childIdParam: 'zoneId',
  createOperationId: 'createEngine',
  listOperationId: 'listEngines',
  typeParam: 'flavor',
  typeEnum: ['pgsql', 'valkey'],
  typeDescription: 'Create a data engine inside a zone',
});

/** Provider C — space/service vocabulary (type=relational-postgres).
 * Deliberately contains no "postgresql" substring anywhere — gate 4. */
const providerC = containerDoc({
  path: 'spaces',
  id: 'spaceId',
  singular: 'Space',
  leaf: 'services',
  childIdParam: 'spaceId',
  createOperationId: 'createService',
  listOperationId: 'listServices',
  typeParam: 'type',
  typeEnum: ['relational-postgres', 'document-store'],
  typeDescription: 'Create a service inside a space',
});

interface ContainerFakeState {
  containers: { id: string; name: string }[];
  offerings: { id: string; name?: string }[];
  createdId: string;
}

function containerFake(container: { containerPath: string; containerId: string; leaf: string }, state: ContainerFakeState): FakeHandler {
  const containerPath = `/${container.containerPath}`;
  const leafPath = `/${container.containerPath}/${state.containers[0]?.id ?? ''}/${container.leaf}`;
  return (url, method, body) => {
    if (url.pathname === containerPath && method === 'GET') return { status: 200, data: state.containers };
    if (url.pathname === containerPath && method === 'POST') {
      const created = { id: `new-${container.containerPath.slice(0, -1)}-1`, name: (JSON.parse(body ?? '{}') as Record<string, unknown>)['name'] };
      state.containers.push(created);
      return { status: 201, data: created };
    }
    if (url.pathname === leafPath && method === 'GET') return { status: 200, data: state.offerings };
    if (url.pathname === leafPath && method === 'POST') {
      const created = { id: state.createdId, ...(JSON.parse(body ?? '{}') as Record<string, unknown>) };
      state.offerings.push(created);
      return { status: 201, data: created };
    }
    return { status: 404, data: { message: `unmatched ${method} ${url.pathname}` } };
  };
}

// ---------------------------------------------------------------------------
// Gate 1 — vocabulary independence: project/zone/space + database/engine/
// service all satisfy the same instruction with zero provider branching.
// ---------------------------------------------------------------------------

describe('gate 1: vocabulary independence across project/zone/space providers', () => {
  const cases = [
    { name: 'provider A (projects/databases, kind=postgres)', doc: providerA, conn: 'uni-a', containerPath: 'projects', id: 'projectId', leaf: 'databases', typeValue: { kind: 'postgres' }, createdId: 'db-a-1' },
    { name: 'provider B (zones/engines, flavor=pgsql)', doc: providerB, conn: 'uni-b', containerPath: 'zones', id: 'zoneId', leaf: 'engines', typeValue: { flavor: 'pgsql' }, createdId: 'eng-b-1' },
    { name: 'provider C (spaces/services, type=relational-postgres)', doc: providerC, conn: 'uni-c', containerPath: 'spaces', id: 'spaceId', leaf: 'services', typeValue: { type: 'relational-postgres' }, createdId: 'svc-c-1' },
  ];

  for (const testCase of cases) {
    it(`"Add PostgreSQL" succeeds on ${testCase.name}`, async () => {
      home();
      const state: ContainerFakeState = { containers: [{ id: 'parent-1', name: 'parent' }], offerings: [], createdId: testCase.createdId };
      const { runtime, calls } = runtimeWithFetch(testCase.conn, containerFake({ containerPath: testCase.containerPath, containerId: testCase.id, leaf: testCase.leaf }, state));
      await runtime.introspect({ kind: 'openapi', document: testCase.doc });

      const { result, capability } = await fulfillIntent(runtime, { concept: 'postgresql-database', typeValue: testCase.typeValue });
      expect(capability.action).toBe('create');
      expect(result.execution.ok).toBe(true);
      expect(result.verification.status).toBe('verified');
      expect(result.summary).toBe('EXECUTED, VERIFIED');
      // The wire used the provider's own vocabulary, not the runtime's.
      expect(calls.some((c) => c.method === 'POST' && c.url.pathname === `/${testCase.containerPath}/parent-1/${testCase.leaf}`)).toBe(true);
    });

    it(`container vocabulary (${testCase.containerPath}) is independently actionable on ${testCase.name}`, async () => {
      home();
      const { runtime } = runtimeWithFetch(testCase.conn, () => ({ status: 200, data: {} }));
      await runtime.introspect({ kind: 'openapi', document: testCase.doc });
      expect(runtime.capabilitiesForIntent(testCase.containerPath.replace(/s$/, '')).some((c) => c.action === 'create')).toBe(true);
    });
  }

  it('the three providers expose different wire shapes for the same semantic intent', async () => {
    home();
    const paths: string[] = [];
    for (const testCase of [cases[0], cases[1], cases[2]]) {
      const { runtime } = runtimeWithFetch(testCase.conn, () => ({ status: 200, data: {} }));
      await runtime.introspect({ kind: 'openapi', document: testCase.doc });
      const capability = runtime.capabilitiesForIntent('postgresql-database').find((c) => c.action === 'create');
      expect(capability).toBeDefined();
      expect(capability!.externalOperation).toMatchObject({ protocol: 'rest', method: 'POST' });
      paths.push((capability!.externalOperation as { pathTemplate: string }).pathTemplate);
    }
    expect(new Set(paths).size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Gate 2 — protocol independence: the same instruction succeeds through
// OpenAPI, GraphQL and MCP with identical orchestration outcomes.
// ---------------------------------------------------------------------------

const graphQlIntrospection: GraphQlIntrospection = {
  queryType: { name: 'Query' },
  mutationType: { name: 'Mutation' },
  types: [
    {
      kind: 'OBJECT',
      name: 'Query',
      fields: [
        { name: 'zones', type: { kind: 'LIST', ofType: { kind: 'OBJECT', name: 'Zone' } } },
        {
          name: 'engines',
          args: [{ name: 'zoneId', type: { kind: 'NON_NULL', ofType: { kind: 'SCALAR', name: 'ID' } } }],
          type: { kind: 'LIST', ofType: { kind: 'OBJECT', name: 'Engine' } },
        },
      ],
    },
    {
      kind: 'OBJECT',
      name: 'Mutation',
      fields: [
        {
          name: 'createEngine',
          args: [
            { name: 'zoneId', type: { kind: 'NON_NULL', ofType: { kind: 'SCALAR', name: 'ID' } } },
            { name: 'flavor', type: { kind: 'NON_NULL', ofType: { kind: 'ENUM', name: 'EngineFlavor' } } },
            { name: 'displayName', type: { kind: 'NON_NULL', ofType: { kind: 'SCALAR', name: 'String' } } },
          ],
          type: { kind: 'OBJECT', name: 'Engine' },
        },
      ],
    },
    { kind: 'OBJECT', name: 'Zone', fields: [ { name: 'id', type: { kind: 'SCALAR', name: 'ID' } }, { name: 'name', type: { kind: 'SCALAR', name: 'String' } } ] },
    { kind: 'OBJECT', name: 'Engine', fields: [ { name: 'id', type: { kind: 'SCALAR', name: 'ID' } }, { name: 'flavor', type: { kind: 'SCALAR', name: 'String' } } ] },
    { kind: 'ENUM', name: 'EngineFlavor', enumValues: [{ name: 'PGSQL' }, { name: 'MONGO' }] },
  ],
};

const mcpTools: McpToolDefinition[] = [
  { name: 'listZones', description: 'List zones', inputSchema: { type: 'object', properties: {} } },
  { name: 'listEngines', description: 'List engines in a zone', inputSchema: { type: 'object', properties: { zoneId: { type: 'string' } }, required: ['zoneId'] } },
  {
    name: 'createEngine',
    description: 'Create an engine in a zone',
    inputSchema: {
      type: 'object',
      properties: { zoneId: { type: 'string' }, flavor: { type: 'string', enum: ['PGSQL', 'MONGO'] }, displayName: { type: 'string' } },
      required: ['zoneId', 'flavor', 'displayName'],
    },
  },
];

describe('gate 2: protocol independence for the same instruction', () => {
  it('succeeds through GraphQL', async () => {
    home();
    const createdEngines: { id: string }[] = [];
    const { runtime } = runtimeWithFetch('uni-gq', (_url, _method, body) => {
      const query = (JSON.parse(body ?? '{}') as { query?: string }).query ?? '';
      if (query.includes('createEngine')) {
        createdEngines.push({ id: 'gq-eng-1' });
        return { status: 200, data: { data: { createEngine: { id: 'gq-eng-1', __typename: 'Engine' } } } };
      }
      if (query.includes('engines')) return { status: 200, data: { data: { engines: createdEngines } } };
      if (query.includes('zones')) return { status: 200, data: { data: { zones: [{ id: 'gq-zone-1', name: 'primary' }] } } };
      return { status: 200, data: { errors: [{ message: `unmatched query: ${query}` }] } };
    }, { graphqlEndpoint: 'https://uni-gq.example.test/graphql' });
    await runtime.introspect({ kind: 'graphql', introspection: graphQlIntrospection });

    const { result, capability } = await fulfillIntent(runtime, { concept: 'postgresql-database', typeValue: { flavor: 'PGSQL' } });
    expect(capability.action).toBe('create');
    expect(capability.externalOperation).toMatchObject({ protocol: 'graphql' });
    expect(result.execution.ok).toBe(true);
    expect(result.verification.status).toBe('verified');
    expect(result.summary).toBe('EXECUTED, VERIFIED');
  });

  it('succeeds through MCP', async () => {
    home();
    const createdEngines: { id: string }[] = [];
    const transport: McpTransport = {
      async callTool(tool, args) {
        if (tool === 'listZones') return { status: 200, data: { zones: [{ id: 'mcp-zone-1', name: 'primary' }] } };
        if (tool === 'listEngines') return { status: 200, data: { engines: createdEngines } };
        if (tool === 'createEngine') {
          const created = { id: 'mcp-eng-1', flavor: args['flavor'] };
          createdEngines.push(created);
          return { status: 201, data: created };
        }
        return { status: 404, data: { error: `unknown tool ${tool}` } };
      },
    };
    const runtime = new UniversalConnectionRuntime({ connectionId: 'uni-mcp', baseUrl: 'https://uni-mcp.example.test', broker: testBroker(), mcpTransport: transport });
    await runtime.introspect({ kind: 'mcp', tools: mcpTools });

    const { result, capability } = await fulfillIntent(runtime, { concept: 'postgresql-database', typeValue: { flavor: 'PGSQL' } });
    expect(capability.action).toBe('create');
    expect(capability.externalOperation).toMatchObject({ protocol: 'mcp' });
    expect(result.execution.ok).toBe(true);
    expect(result.verification.status).toBe('verified');
    expect(result.summary).toBe('EXECUTED, VERIFIED');
  });
});

// ---------------------------------------------------------------------------
// Gate 3 — deep prerequisite chain: account → workspace → environment →
// cluster → database resolves automatically from the instruction alone.
// ---------------------------------------------------------------------------

const deepChainDoc = {
  openapi: '3.0.0',
  info: { title: 'Provider D — deep hierarchy', version: '1.0' },
  paths: {
    '/accounts': { get: { operationId: 'listAccounts', summary: 'List accounts', responses: { '200': listResponse('Account') } } },
    '/accounts/{accountId}/workspaces': { get: { operationId: 'listWorkspaces', summary: 'List workspaces', parameters: [param('accountId')], responses: { '200': listResponse('Workspace') } } },
    '/workspaces/{workspaceId}/environments': { get: { operationId: 'listEnvironments', summary: 'List environments', parameters: [param('workspaceId')], responses: { '200': listResponse('Environment') } } },
    '/environments/{environmentId}/clusters': { get: { operationId: 'listClusters', summary: 'List clusters', parameters: [param('environmentId')], responses: { '200': listResponse('Cluster') } } },
    '/clusters/{clusterId}/databases': {
      get: { operationId: 'listClusterDatabases', summary: 'List cluster databases', parameters: [param('clusterId')], responses: { '200': listResponse('Offering') } },
      post: {
        operationId: 'createDatabase',
        summary: 'Create a database in a cluster',
        description: 'Create a database inside a cluster',
        parameters: [param('clusterId')],
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['flavor', 'name'], properties: { flavor: { type: 'string', enum: ['pgsql', 'redis'] }, name: { type: 'string' } } } } } },
        responses: { '201': itemResponse('Offering') },
      },
    },
  },
  components: {
    schemas: {
      Account: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
      Workspace: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
      Environment: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
      Cluster: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
      Offering: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
    },
  },
};

describe('gate 3: deep prerequisite chain resolves automatically', () => {
  it('plans account → workspace → environment → cluster → database from the instruction alone', async () => {
    home();
    const { runtime } = runtimeWithFetch('uni-deep', () => ({ status: 200, data: {} }));
    await runtime.introspect({ kind: 'openapi', document: deepChainDoc });

    const capability = runtime.capabilitiesForIntent('postgresql-database').find((c) => c.action === 'create');
    expect(capability).toBeDefined();
    const plan = runtime.planMutation(capability!.id, { flavor: 'pgsql' }).plan;
    expect(plan.ready).toBe(true);
    expect(plan.unresolved).toEqual([]);
    expect(plan.userRequired).toEqual([]);
    expect(plan.steps).toHaveLength(4);
    expect(new Set(plan.steps.map((s) => s.depth))).toEqual(new Set([0, 1, 2, 3]));
    expect(new Set(plan.steps.map((s) => s.resolvesInput))).toEqual(new Set(['clusterId', 'environmentId', 'workspaceId', 'accountId']));
    for (const step of plan.steps) {
      const producer = runtime.graphView().capability(step.producerCapabilityId)!;
      expect(producer.action).toBe('read');
      expect(producer.sideEffect).toBe('none');
      expect(step.evidence.length).toBeGreaterThan(0);
    }
  });

  it('executes the whole chain: reads cascade up the hierarchy, then the mutation is verified', async () => {
    home();
    const state = {
      accounts: [{ id: 'acc-1', name: 'main' }],
      workspaces: [] as { id: string }[],
      environments: [] as { id: string }[],
      clusters: [] as { id: string }[],
      databases: [] as { id: string }[],
    };
    const { runtime, calls } = runtimeWithFetch('uni-deep', (url, method, body) => {
      if (url.pathname === '/accounts' && method === 'GET') return { status: 200, data: state.accounts };
      if (url.pathname === '/accounts/acc-1/workspaces' && method === 'GET') {
        state.workspaces = [{ id: 'ws-1', name: 'w' }];
        return { status: 200, data: state.workspaces };
      }
      if (url.pathname === '/workspaces/ws-1/environments' && method === 'GET') {
        state.environments = [{ id: 'env-1', name: 'e' }];
        return { status: 200, data: state.environments };
      }
      if (url.pathname === '/environments/env-1/clusters' && method === 'GET') {
        state.clusters = [{ id: 'cl-1', name: 'c' }];
        return { status: 200, data: state.clusters };
      }
      if (url.pathname === '/clusters/cl-1/databases' && method === 'GET') return { status: 200, data: state.databases };
      if (url.pathname === '/clusters/cl-1/databases' && method === 'POST') {
        const created = { id: 'db-deep-1', flavor: (JSON.parse(body ?? '{}') as Record<string, unknown>)['flavor'] };
        state.databases.push(created);
        return { status: 201, data: created };
      }
      return { status: 404, data: { message: `unmatched ${method} ${url.pathname}` } };
    });

    await runtime.introspect({ kind: 'openapi', document: deepChainDoc });
    const { result } = await fulfillIntent(runtime, { concept: 'postgresql-database', typeValue: { flavor: 'pgsql' } });
    expect(result.execution.ok).toBe(true);
    expect(result.verification.status).toBe('verified');
    expect(result.summary).toBe('EXECUTED, VERIFIED');
    // The reads cascaded in dependency order before the mutation ran.
    const readPaths = calls.filter((c) => c.method === 'GET').map((c) => c.url.pathname);
    expect(readPaths.indexOf('/clusters/cl-1/databases')).toBeGreaterThan(readPaths.indexOf('/environments/env-1/clusters'));
    expect(readPaths.indexOf('/environments/env-1/clusters')).toBeGreaterThan(readPaths.indexOf('/workspaces/ws-1/environments'));
    expect(readPaths.indexOf('/workspaces/ws-1/environments')).toBeGreaterThan(readPaths.indexOf('/accounts'));
  });
});

// ---------------------------------------------------------------------------
// Gate 4 — no literal keyword dependency: the canonical word "postgresql"
// never appears in providers B/C, yet the instruction still matches.
// ---------------------------------------------------------------------------

describe('gate 4: no literal keyword dependency', () => {
  it('matches "Add PostgreSQL" on provider B although the document never says postgres', async () => {
    home();
    expect(JSON.stringify(providerB)).not.toMatch(/postgres/i);
    const { runtime } = runtimeWithFetch('uni-b', () => ({ status: 200, data: {} }));
    await runtime.introspect({ kind: 'openapi', document: providerB });
    const capability = runtime.capabilitiesForIntent('postgresql-database').find((c) => c.action === 'create');
    expect(capability).toBeDefined();
    expect(capability!.semanticVariants.map((v) => v.id)).toContain('postgresql-database');
    const variantEvidence = capability!.semanticVariants.find((v) => v.id === 'postgresql-database')!.evidence.join(' ');
    expect(variantEvidence).toContain('pgsql');
  });

  it('matches "Add PostgreSQL" on provider C although the document never says postgresql', async () => {
    home();
    expect(JSON.stringify(providerC)).not.toMatch(/postgresql/i);
    const { runtime } = runtimeWithFetch('uni-c', () => ({ status: 200, data: {} }));
    await runtime.introspect({ kind: 'openapi', document: providerC });
    const capability = runtime.capabilitiesForIntent('postgresql-database').find((c) => c.action === 'create');
    expect(capability).toBeDefined();
    expect(capability!.semanticVariants.map((v) => v.id)).toContain('postgresql-database');
    const variantEvidence = capability!.semanticVariants.find((v) => v.id === 'postgresql-database')!.evidence.join(' ');
    expect(variantEvidence).toContain('relational-postgres');
  });
});

// ---------------------------------------------------------------------------
// Gate 5 — secret isolation: the brokered connection key appears nowhere in
// model-visible messages, traces, errors, data, graph or serialized cache.
// ---------------------------------------------------------------------------

const CONNECTION_SECRET = 'sk-live-adversarial-connection-key-9f2e';

function secretVaultFake(mode: 'error' | 'success'): FakeHandler {
  return (url, method, _body, headers) => {
    const authHeader = headers['authorization'] ?? '';
    if (url.pathname === '/vaults' && method === 'GET') return { status: 200, data: [{ id: 'vault-1', name: 'v' }] };
    if (url.pathname === '/vaults/vault-1/keys' && method === 'GET') return { status: 200, data: [{ id: 'key-1', credentialEcho: authHeader }] };
    if (url.pathname === '/vaults/vault-1/keys' && method === 'POST') {
      if (mode === 'error') return { status: 500, data: { error: 'invalid credential', echo: authHeader } };
      return { status: 201, data: { id: 'key-1', credentialEcho: authHeader } };
    }
    return { status: 404, data: { message: `unmatched ${method} ${url.pathname}` } };
  };
}

const secretVaultDoc = {
  openapi: '3.0.0',
  info: { title: 'Provider E — echo host', version: '1.0' },
  paths: {
    '/vaults': { get: { operationId: 'listVaults', summary: 'List vaults', responses: { '200': listResponse('Vault') } } },
    '/vaults/{vaultId}/keys': {
      get: { operationId: 'listKeys', summary: 'List keys', parameters: [param('vaultId')], responses: { '200': listResponse('Key') } },
      post: { operationId: 'createKey', summary: 'Create a key', description: 'Create a key inside a vault', parameters: [param('vaultId')], requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['label'], properties: { label: { type: 'string' } } } } } }, responses: { '201': itemResponse('Key') } },
    },
  },
  components: {
    schemas: {
      Vault: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
      Key: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string' } } },
    },
  },
};

function expectSecretIsolation(serialized: string, context: string): void {
  expect(serialized, `${context} leaked the connection secret`).not.toContain(CONNECTION_SECRET);
}

describe('gate 5: secret isolation against an echoing hostile provider', () => {
  it('scrubs the credential out of execution traces, error details and response data', async () => {
    home();
    const errorRuntime = new UniversalConnectionRuntime({
      connectionId: 'uni-secret',
      baseUrl: 'https://uni-secret.example.test',
      broker: testBroker(CONNECTION_SECRET),
      fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
        const result = secretVaultFake('error')(new URL(String(input)), String(init?.method ?? 'GET'), init?.body as string | undefined, Object.fromEntries(new Headers(init?.headers).entries()));
        return new Response(JSON.stringify(result.data), { status: result.status });
      }) as typeof fetch,
    });
    await errorRuntime.introspect({ kind: 'openapi', document: secretVaultDoc });

    const failed = await errorRuntime.executeCapability('create-key-createkey', { vaultId: 'vault-1' });
    expect(failed.execution.ok).toBe(false);
    const failureJson = JSON.stringify(failed);
    expectSecretIsolation(failureJson, 'failed VerifiedExecution');
    // The provider echoed the credential inside the 500 body — the model-visible
    // error detail must carry the redaction marker, never the secret.
    expect(failed.execution.error?.detail).toContain('<redacted>');
    expectSecretIsolation(failed.execution.trace, 'execution trace');
    expect(failed.summary).toBe('FAILED: SERVER');

    const successRuntime = new UniversalConnectionRuntime({
      connectionId: 'uni-secret',
      baseUrl: 'https://uni-secret.example.test',
      broker: testBroker(CONNECTION_SECRET),
      fetchImpl: (async (input: string | URL | Request, init?: RequestInit) => {
        const result = secretVaultFake('success')(new URL(String(input)), String(init?.method ?? 'GET'), init?.body as string | undefined, Object.fromEntries(new Headers(init?.headers).entries()));
        return new Response(JSON.stringify(result.data), { status: result.status });
      }) as typeof fetch,
    });
    await successRuntime.introspect({ kind: 'openapi', document: secretVaultDoc });

    const succeeded = await successRuntime.executeCapability('create-key-createkey', { vaultId: 'vault-1' });
    expect(succeeded.execution.ok).toBe(true);
    expectSecretIsolation(JSON.stringify(succeeded), 'successful VerifiedExecution');
    expect(JSON.stringify(succeeded.execution.data)).toContain('<redacted>');
    expect(succeeded.verification.status).toBe('verified');
    expectSecretIsolation(JSON.stringify(succeeded.verification), 'verification result');

    expectSecretIsolation(JSON.stringify(serializeGraph(successRuntime.graphView())), 'serialized capability graph');
    expectSecretIsolation(JSON.stringify(deepScrub({ nested: { echo: CONNECTION_SECRET } }, [CONNECTION_SECRET])), 'deepScrub contract');
  });

  it('never persists the credential into the capability cache on disk', async () => {
    home();
    const { runtime } = runtimeWithFetch('uni-secret', secretVaultFake('success'));
    await runtime.introspect({ kind: 'openapi', document: secretVaultDoc });
    const cacheFile = path.join(ensureGituHome().settings, 'connection-capabilities', 'uni-secret.json');
    expectSecretIsolation(readFileSync(cacheFile, 'utf8'), 'capability cache file');
  });
});

// ---------------------------------------------------------------------------
// Gate 6 — provider-name invariant: no runtime source may branch on, or even
 // mention, a concrete provider identity.
// ---------------------------------------------------------------------------

describe('gate 6: provider-name invariant', () => {
  it('contains no provider identity anywhere under src/connections/runtime', () => {
    // "render" is deliberately absent from this list: it is a common English
    // verb. Everything else names an infrastructure provider.
    const forbidden = /\b(coolify|github|gitlab|vercel|netlify|heroku|digitalocean|aws|azure|gcp|gcloud|supabase|railway|flyio|cloudflare|vultr|linode|dokku|caprover|openshift)\b/i;
    const runtimeDir = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../src/connections/runtime');
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith('.ts')) files.push(full);
      }
    };
    walk(runtimeDir);
    expect(files.length).toBeGreaterThan(20);
    const offenders = files.filter((file) => forbidden.test(readFileSync(file, 'utf8')));
    expect(offenders, `provider names found in runtime sources: ${offenders.join(', ')}`).toEqual([]);
  });

  it('capabilities carry protocol identity only — never a provider identity', async () => {
    home();
    const { runtime } = runtimeWithFetch('uni-a', () => ({ status: 200, data: {} }));
    await runtime.introspect({ kind: 'openapi', document: providerA });
    for (const capability of runtime.graphView().listCapabilities()) {
      const serialized = JSON.stringify(capability);
      expect(serialized).not.toMatch(/provider|vendor|company/i);
      expect(['rest', 'graphql', 'mcp']).toContain((capability.externalOperation as { protocol: string }).protocol);
    }
  });
});

// ---------------------------------------------------------------------------
// Gate 7 — stale cache: a schema fingerprint change re-derives only the
// affected connection's graph; other connections keep serving their cache.
// ---------------------------------------------------------------------------

const cacheV1 = {
  openapi: '3.0.0',
  info: { title: 'Cache fixture', version: '1.0' },
  paths: {
    '/projects': { get: { operationId: 'listProjects', summary: 'List projects', responses: { '200': listResponse('Project') } } },
    '/projects/{projectId}/databases': {
      get: { operationId: 'listProjectDatabases', summary: 'List databases', parameters: [param('projectId')], responses: { '200': listResponse('Offering') } },
      post: { operationId: 'createDatabase', summary: 'Create a database', description: 'Create a database in a project', parameters: [param('projectId')], responses: { '201': itemResponse('Offering') } },
    },
  },
  components: { schemas: { Project: { type: 'object', properties: { id: { type: 'string' } } }, Offering: { type: 'object', properties: { id: { type: 'string' } } } } },
};

function cacheV2(): unknown {
  const doc = structuredClone(cacheV1) as typeof cacheV1;
  delete (doc.paths as Record<string, unknown>)['/projects/{projectId}/databases'];
  return doc;
}

describe('gate 7: stale cache invalidation is scoped to the changed connection', () => {
  it('re-derives the changed graph, keeps other connections cached, and never serves the stale graph', async () => {
    home();
    const runtimeA = runtimeWithFetch('cache-conn-a', () => ({ status: 200, data: {} })).runtime;
    const first = await runtimeA.introspect({ kind: 'openapi', document: cacheV1 });
    expect(first.fromCache).toBe(false);
    const v1Capabilities = JSON.stringify(runtimeA.graphView().listCapabilities());
    expect(v1Capabilities).toContain('create-database');

    // A second connection caches the same schema independently…
    const runtimeB = runtimeWithFetch('cache-conn-b', () => ({ status: 200, data: {} })).runtime;
    expect((await runtimeB.introspect({ kind: 'openapi', document: cacheV1 })).fromCache).toBe(false);

    // …and the first connection is served byte-identical from its own cache.
    const reloaded = runtimeWithFetch('cache-conn-a', () => ({ status: 200, data: {} })).runtime;
    const second = await reloaded.introspect({ kind: 'openapi', document: cacheV1 });
    expect(second.fromCache).toBe(true);
    expect(JSON.stringify(reloaded.graphView().listCapabilities())).toBe(v1Capabilities);

    // Schema change → stale graph is NOT served; a fresh v2 graph is derived.
    const changed = await runtimeA.introspect({ kind: 'openapi', document: cacheV2() });
    expect(changed.fromCache).toBe(false);
    expect(changed.schemaFingerprint).not.toBe(first.schemaFingerprint);
    expect(JSON.stringify(runtimeA.graphView().listCapabilities())).not.toContain('create-database');

    // The invalidated v1 cache must not come back for this connection…
    const backToV1 = runtimeWithFetch('cache-conn-a', () => ({ status: 200, data: {} })).runtime;
    const third = await backToV1.introspect({ kind: 'openapi', document: cacheV1 });
    expect(third.fromCache).toBe(false);

    // …while the other connection's v1 cache is untouched and still served.
    const runtimeBReloaded = runtimeWithFetch('cache-conn-b', () => ({ status: 200, data: {} })).runtime;
    const otherConn = await runtimeBReloaded.introspect({ kind: 'openapi', document: cacheV1 });
    expect(otherConn.fromCache).toBe(true);
    expect(otherConn.schemaFingerprint).toBe(first.schemaFingerprint);
    expect(JSON.stringify(runtimeBReloaded.graphView().listCapabilities())).toBe(v1Capabilities);
  });

  it('cache entries are stored per connection id', async () => {
    home();
    const { runtime } = runtimeWithFetch('cache-conn-a', () => ({ status: 200, data: {} }));
    await runtime.introspect({ kind: 'openapi', document: cacheV1 });
    const dir = path.join(ensureGituHome().settings, 'connection-capabilities');
    expect(readdirSync(dir)).toEqual(['cache-conn-a.json']);
  });
});

// ---------------------------------------------------------------------------
// Gate 8 — failure state: an identical failed mutation is blocked with zero
// network attempts, and becomes eligible again only after real state or
// schema changes.
// ---------------------------------------------------------------------------

describe('gate 8: duplicate failure blocking and epoch/schema-based unblocking', () => {
  const mutationId = 'create-database-createdatabase';
  const params = { kind: 'postgres', projectId: 'proj-1' };

  function conflictHandler(state: { conflict: boolean; projects: { id: string; name: string }[]; databases: { id: string }[] }): FakeHandler {
    return (url, method, body) => {
      if (url.pathname === '/projects' && method === 'GET') return { status: 200, data: state.projects };
      if (url.pathname === '/projects/proj-1/databases' && method === 'GET') return { status: 200, data: state.databases };
      if (url.pathname === '/projects/proj-1/databases' && method === 'POST') {
        if (state.conflict) return { status: 409, data: { message: 'exists' } };
        const created = { id: 'db-x-1', kind: (JSON.parse(body ?? '{}') as Record<string, unknown>)['kind'] };
        state.databases.push(created);
        return { status: 201, data: created };
      }
      return { status: 404, data: { message: `unmatched ${method} ${url.pathname}` } };
    };
  }

  it('blocks the identical retry, unblocks after observed state change, then verifies', async () => {
    home();
    const state = { conflict: true, projects: [{ id: 'proj-1', name: 'p' }], databases: [] as { id: string }[] };
    const { runtime, calls } = runtimeWithFetch('uni-conflict', conflictHandler(state));
    await runtime.introspect({ kind: 'openapi', document: providerA });

    const failed = await runtime.executeCapability(mutationId, params);
    expect(failed.execution.ok).toBe(false);
    expect(failed.execution.error?.category).toBe('CONFLICT');
    const postCalls = () => calls.filter((c) => c.method === 'POST').length;

    const blocked = await runtime.executeCapability(mutationId, params);
    expect(postCalls()).toBe(1); // zero second network attempt
    expect(blocked.execution.error?.category).toBe('BLOCKED_DUPLICATE');
    expect(blocked.summary).toBe('BLOCKED_DUPLICATE');

    // Real state change (a new project appears) + fresh discovery → eligible.
    state.conflict = false;
    state.projects.push({ id: 'proj-2', name: 'other' });
    const snapshot = await runtime.discoverState();
    expect(snapshot.epoch).toBeGreaterThan(0);

    const recovered = await runtime.executeCapability(mutationId, params);
    expect(postCalls()).toBe(2);
    expect(recovered.execution.ok).toBe(true);
    expect(recovered.verification.status).toBe('verified');
    expect(recovered.summary).toBe('EXECUTED, VERIFIED');
  });

  it('unblocks after a schema refresh even when observed state is unchanged', async () => {
    home();
    const state = { conflict: true, projects: [{ id: 'proj-1', name: 'p' }], databases: [] as { id: string }[] };
    const { runtime, calls } = runtimeWithFetch('uni-schema', conflictHandler(state));
    await runtime.introspect({ kind: 'openapi', document: providerA });
    expect((await runtime.executeCapability(mutationId, params)).execution.ok).toBe(false);
    expect((await runtime.executeCapability(mutationId, params)).execution.error?.category).toBe('BLOCKED_DUPLICATE');

    const doc = structuredClone(providerA) as { paths: Record<string, Record<string, { description?: string }>> };
    doc.paths['/projects/{projectId}/databases'].post.description = 'Create a database in a project (v2 schema)';
    await runtime.introspect({ kind: 'openapi', document: doc });
    state.conflict = false;

    const recovered = await runtime.executeCapability(mutationId, params);
    expect(calls.filter((c) => c.method === 'POST').length).toBe(2);
    expect(recovered.execution.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Gate 9 — ambiguous semantics: destructive mutations on weakly inferred
// targets are refused even when an approval hook would say yes.
// ---------------------------------------------------------------------------

const ambiguousDoc = {
  openapi: '3.0.0',
  info: { title: 'Provider F — obscure vocabulary', version: '1.0' },
  paths: {
    '/silos/{siloId}': {
      delete: { operationId: 'purgeSilo', summary: 'Purge a silo', parameters: [param('siloId')], responses: { '204': { description: 'gone' } } },
    },
    '/silos/{siloId}/boxes': {
      post: { operationId: 'createBox', summary: 'Create a box', description: 'Create a box inside a silo', parameters: [param('siloId')], requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['name'], properties: { name: { type: 'string' } } } } } }, responses: { '201': { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' } } } } } } } },
    },
  },
};

describe('gate 9: ambiguous semantics never perform destructive mutations', () => {
  it('refuses a destructive capability whose semantic target is weakly inferred, even with approval offered', async () => {
    home();
    let destructiveNetworkCalls = 0;
    let approvalHookCalls = 0;
    const { runtime } = runtimeWithFetch('uni-ambiguous', (_url, method) => {
      if (method === 'DELETE') destructiveNetworkCalls += 1;
      return { status: 500, data: { message: 'must never be reached' } };
    });
    await runtime.introspect({ kind: 'openapi', document: ambiguousDoc });

    const capability = runtime.graphView().listCapabilities().find((c) => c.action === 'delete');
    expect(capability).toBeDefined();
    expect(capability!.confidence).toBeLessThan(0.6);

    const blocked = await runtime.executeCapability(capability!.id, { siloId: 'silo-1' }, { approval: () => { approvalHookCalls += 1; return true; } });
    expect(destructiveNetworkCalls).toBe(0);
    expect(approvalHookCalls).toBe(0); // approval of an ambiguous plan is not informed consent
    expect(blocked.execution.error?.category).toBe('POLICY_BLOCKED');
    expect(blocked.summary).toBe('POLICY_BLOCKED');
    expect(blocked.execution.error?.suspectedCause.join(' ')).toMatch(/confidence/i);
  });

  it('still allows reversible mutations on the same weakly inferred vocabulary with approval', async () => {
    home();
    const { runtime, calls } = runtimeWithFetch('uni-ambiguous', (url, method) => {
      if (method === 'POST' && url.pathname === '/silos/silo-1/boxes') return { status: 201, data: { id: 'box-1' } };
      return { status: 404, data: {} };
    });
    await runtime.introspect({ kind: 'openapi', document: ambiguousDoc });

    const create = runtime.graphView().listCapabilities().find((c) => c.action === 'create');
    expect(create).toBeDefined();
    const result = await runtime.executeCapability(create!.id, { siloId: 'silo-1' }, { approval: () => true });
    expect(result.execution.ok).toBe(true);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Gate 10 — partial verification honesty: no read-back means "EXECUTED",
// never a false "VERIFIED"; a contradicting read-back reports "FAILED".
// ---------------------------------------------------------------------------

describe('gate 10: partial verification is reported honestly', () => {
  it('reports EXECUTED, PARTIALLY VERIFIED when no independent read-back exists', async () => {
    home();
    const { runtime } = runtimeWithFetch('uni-blind', (url, method) => {
      if (method === 'POST' && url.pathname === '/machines') return { status: 201, data: { id: 'm-1', label: 'm' } };
      return { status: 404, data: {} };
    });
    await runtime.introspect({
      kind: 'openapi',
      document: {
        openapi: '3.0.0',
        info: { title: 'Provider G — write only', version: '1.0' },
        paths: {
          '/machines': {
            post: { operationId: 'createMachine', summary: 'Create a machine', description: 'Create a machine', requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['label'], properties: { label: { type: 'string' } } } } } }, responses: { '201': { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' } } } } } } } },
          },
        },
      },
    });

    const capability = runtime.capabilitiesForIntent('machine').find((c) => c.action === 'create');
    expect(capability).toBeDefined();
    const result = await runtime.executeCapability(capability!.id, {});
    expect(result.execution.ok).toBe(true);
    expect(result.execution.executionConfidence).toBe(1.0);
    expect(result.verification.status).toBe('partial');
    expect(result.verification.strategy).toBe('response-only');
    expect(result.verification.confidence).toBeLessThan(0.5);
    expect(result.summary).toBe('EXECUTED, PARTIALLY VERIFIED');
  });

  it('reports FAILED verification when the read-back contradicts the execution', async () => {
    home();
    const { runtime } = runtimeWithFetch('uni-contradict', (url, method) => {
      if (method === 'POST' && url.pathname === '/appliances') return { status: 201, data: { id: 'ap-1' } };
      if (method === 'GET' && url.pathname === '/appliances') return { status: 200, data: [{ id: 'ap-other' }] };
      return { status: 404, data: {} };
    });
    await runtime.introspect({
      kind: 'openapi',
      document: {
        openapi: '3.0.0',
        info: { title: 'Provider H — contradicting reads', version: '1.0' },
        paths: {
          '/appliances': {
            get: { operationId: 'listAppliances', summary: 'List appliances', responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' } } } } } } } } },
            post: { operationId: 'createAppliance', summary: 'Create an appliance', description: 'Create an appliance', requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['label'], properties: { label: { type: 'string' } } } } } }, responses: { '201': { description: 'ok', content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' } } } } } } } },
          },
        },
      },
    });

    const capability = runtime.capabilitiesForIntent('appliance').find((c) => c.action === 'create');
    expect(capability).toBeDefined();
    const result = await runtime.executeCapability(capability!.id, {});
    expect(result.execution.ok).toBe(true);
    expect(result.verification.status).toBe('failed');
    expect(result.summary).toBe('EXECUTED, FAILED');
  });
});

// ---------------------------------------------------------------------------
// Coolify-shaped regression — the original scenario, run AFTER universality
// holds. The fixture mimics a real self-hosted platform API (flat /api/v1
// paths, uuid fields, project_uuid/server_uuid body parameters). It is DATA
// only: no Coolify-specific logic exists or may exist in src/.
// ---------------------------------------------------------------------------

describe('coolify-shaped regression (fixture only, zero provider logic)', () => {
  it('resolves project_uuid and server_uuid automatically and executes "Add PostgreSQL"', async () => {
    home();
    const { runtime, calls } = runtimeWithFetch('uni-coolify-shaped', (url, method, body) => {
      if (url.pathname === '/api/v1/projects' && method === 'GET') return { status: 200, data: [{ id: 2, uuid: 'prj-uuid-1', name: 'default' }] };
      if (url.pathname === '/api/v1/servers' && method === 'GET') return { status: 200, data: [{ uuid: 'srv-uuid-1', name: 'localhost' }] };
      if (url.pathname === '/api/v1/databases' && method === 'GET') return { status: 200, data: [{ uuid: 'db-other-1', name: 'existing' }] };
      if (url.pathname === '/api/v1/databases/postgresql' && method === 'POST') {
        const payload = JSON.parse(body ?? '{}') as Record<string, unknown>;
        return { status: 200, data: { uuid: 'db-coolify-1', project_uuid: payload['project_uuid'], server_uuid: payload['server_uuid'] } };
      }
      return { status: 404, data: { message: `unmatched ${method} ${url.pathname}` } };
    });
    await runtime.introspect({ kind: 'openapi', document: coolifyShapedApi });

    const { result, capability } = await fulfillIntent(runtime, { concept: 'postgresql-database' });
    expect(capability.semanticTarget?.id).toBe('postgresql-database');
    const plan = runtime.planMutation(capability.id).plan;
    expect(new Set(plan.steps.map((s) => s.resolvesInput))).toEqual(new Set(['project_uuid', 'server_uuid']));

    expect(result.execution.ok).toBe(true);
    const post = calls.find((c) => c.method === 'POST' && c.url.pathname === '/api/v1/databases/postgresql');
    expect(post).toBeDefined();
    expect(JSON.parse(post!.body!)).toMatchObject({ project_uuid: expect.anything(), server_uuid: expect.anything() });
    // Honest verification: the platform shape offers no same-target read-back,
    // so the result must stop at EXECUTED, PARTIALLY VERIFIED — never a false VERIFIED.
    expect(result.verification.status).toBe('partial');
    expect(result.summary).toBe('EXECUTED, PARTIALLY VERIFIED');
  });
});

const coolifyShapedApi = {
  openapi: '3.0.0',
  info: { title: 'Self-hosted platform API', version: '1.0' },
  paths: {
    '/api/v1/projects': { get: { operationId: 'listProjects', summary: 'List projects', responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Project' } } } } } } } },
    '/api/v1/servers': { get: { operationId: 'listServers', summary: 'List servers', responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Server' } } } } } } } },
    '/api/v1/databases': { get: { operationId: 'listDatabases', summary: 'List databases', responses: { '200': { description: 'ok', content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/StoredDatabase' } } } } } } } },
    '/api/v1/databases/postgresql': {
      post: {
        operationId: 'createPostgresqlDatabase',
        summary: 'Create PostgreSQL database',
        description: 'Create a new PostgreSQL database',
        requestBody: { content: { 'application/json': { schema: { type: 'object', required: ['project_uuid', 'server_uuid'], properties: { project_uuid: { type: 'string' }, server_uuid: { type: 'string' }, name: { type: 'string' } } } } } },
        responses: { '200': { description: 'ok', content: { 'application/json': { schema: { $ref: '#/components/schemas/NewDatabase' } } } } },
      },
    },
  },
  components: {
    schemas: {
      Project: { type: 'object', properties: { id: { type: 'number' }, uuid: { type: 'string' }, name: { type: 'string' } } },
      Server: { type: 'object', properties: { uuid: { type: 'string' }, name: { type: 'string' } } },
      StoredDatabase: { type: 'object', properties: { uuid: { type: 'string' }, name: { type: 'string' } } },
      NewDatabase: { type: 'object', properties: { uuid: { type: 'string' } } },
    },
  },
};
