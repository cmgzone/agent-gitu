import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { VaultCredentialBroker, scrub, type CredentialBroker } from '../src/connections/runtime/credentials/credential-broker.js';
import { UniversalExecutor } from '../src/connections/runtime/execution/executor.js';
import { operationFingerprint } from '../src/connections/runtime/execution/fingerprint.js';
import { RetryGuard } from '../src/connections/runtime/execution/retry-guard.js';
import { SemanticCapabilityGraph } from '../src/connections/runtime/graph/capability-graph.js';
import { normalizeOperations, identifierStem } from '../src/connections/runtime/semantics/inference.js';
import { inferSemanticRole } from '../src/connections/runtime/semantics/roles.js';
import { introspectOpenApi } from '../src/connections/runtime/interpreters/openapi.js';
import { UniversalConnectionRuntime } from '../src/connections/runtime/orchestrator.js';
import type { Capability } from '../src/connections/runtime/model/capability.js';

const homes: string[] = [];
const previousHome = process.env.AGENT_GITU_HOME;
const originalFetch = globalThis.fetch;

function home(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-runtime-'));
  homes.push(root);
  process.env.AGENT_GITU_HOME = root;
  return root;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (previousHome === undefined) delete process.env.AGENT_GITU_HOME;
  else process.env.AGENT_GITU_HOME = previousHome;
  for (const root of homes.splice(0)) rmSync(root, { recursive: true, force: true });
});

function testBroker(): CredentialBroker {
  return new VaultCredentialBroker({ readSecret: () => 'sekrit-token' });
}

const ctx = { connectionId: 'conn-1', schemaFingerprint: 'schema-fp', stateEpoch: 0 };

function restCapability(overrides: Partial<Capability> = {}): Capability {
  return {
    id: 'create-widget',
    label: 'Create widget',
    action: 'create',
    semanticVariants: [],
    externalOperation: { protocol: 'rest', method: 'POST', pathTemplate: '/widgets' },
    inputs: [
      { externalName: 'name', required: true, type: 'string', location: 'body', resolution: 'user-required' },
      { externalName: 'q', required: false, type: 'string', location: 'query', resolution: 'known' },
    ],
    outputs: [],
    relationships: [],
    sideEffect: 'reversible',
    confidence: 0.8,
    verification: [],
    ...overrides,
  };
}

// Minimal OpenAPI 3 document exercising refs, path/query/body params and enums.
const openApiDoc = {
  openapi: '3.0.0',
  info: { title: 'Projects API', version: '1.0' },
  paths: {
    '/projects': {
      get: {
        operationId: 'listProjects',
        summary: 'List projects',
        responses: { '200': { description: 'ok' } },
      },
      post: {
        operationId: 'createProject',
        summary: 'Create a project',
        description: 'Create a new project',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string' }, engine: { type: 'string', enum: ['postgres', 'redis'] } },
              },
            },
          },
        },
        responses: { '201': { description: 'created' } },
      },
    },
    '/projects/{projectId}': {
      get: {
        operationId: 'getProject',
        summary: 'Get a project',
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'ok' } },
      },
      delete: {
        operationId: 'deleteProject',
        summary: 'Delete a project',
        parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '204': { description: 'deleted' } },
      },
    },
  },
  components: {
    schemas: {
      Project: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
    },
  },
};

describe('credential broker', () => {
  it('resolves auth material from the vault and never leaks secrets through scrub()', async () => {
    const broker = new VaultCredentialBroker({ readSecret: (id) => (id === 'conn-1' ? 'sekrit-token' : undefined) });
    const auth = await broker.authFor('conn-1');
    expect(auth.headers).toEqual({ authorization: 'Bearer sekrit-token' });
    expect(auth.secrets).toEqual(['sekrit-token']);

    const trace = scrub('REST POST https://x.test/api key=sekrit-token', auth.secrets);
    expect(trace).not.toContain('sekrit-token');
    expect(trace).toContain('<redacted>');
  });

  it('refuses to mint credentials from nothing', async () => {
    const broker = new VaultCredentialBroker({ readSecret: () => undefined });
    await expect(broker.authFor('unknown-conn')).rejects.toThrow(/No stored credential/);
  });
});

describe('operation fingerprint', () => {
  it('is stable for identical inputs and blind to undeclared parameters', () => {
    const capability = restCapability();
    const a = operationFingerprint(capability, { name: 'w1', invented: 'noise' }, ctx);
    const b = operationFingerprint(capability, { name: 'w1' }, ctx);
    expect(a).toBe(b);
  });

  it('changes when parameters, schema, state epoch or connection change', () => {
    const capability = restCapability();
    const base = operationFingerprint(capability, { name: 'w1' }, ctx);
    expect(operationFingerprint(capability, { name: 'w2' }, ctx)).not.toBe(base);
    expect(operationFingerprint(capability, { name: 'w1' }, { ...ctx, schemaFingerprint: 'other' })).not.toBe(base);
    expect(operationFingerprint(capability, { name: 'w1' }, { ...ctx, stateEpoch: 1 })).not.toBe(base);
    expect(operationFingerprint(capability, { name: 'w1' }, { ...ctx, connectionId: 'conn-2' })).not.toBe(base);
  });
});

describe('retry guard', () => {
  it('blocks an identical failed operation and unblocks it after real state change', () => {
    const capability = restCapability();
    const guard = new RetryGuard();
    const params = { name: 'w1' };

    expect(guard.assess(capability, params, ctx).allowed).toBe(true);
    guard.recordFailure(capability, params, ctx, { category: 'CONFLICT', retryable: false, operationValid: 'yes', suspectedCause: [] });
    expect(guard.failureCount()).toBe(1);
    const blocked = guard.assess(capability, params, ctx);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toContain('BLOCKED_DUPLICATE_FAILURE');

    guard.noteStateChange();
    expect(guard.assess(capability, params, ctx).allowed).toBe(true);
  });

  it('keeps distinct parameters eligible', () => {
    const capability = restCapability();
    const guard = new RetryGuard();
    guard.recordFailure(capability, { name: 'w1' }, ctx, { category: 'CONFLICT', retryable: false, operationValid: 'yes', suspectedCause: [] });
    expect(guard.assess(capability, { name: 'w2' }, ctx).allowed).toBe(true);
  });
});

describe('semantic normalization', () => {
  it('reduces identifiers to concept stems', () => {
    expect(identifierStem('project_uuid')).toBe('project');
    expect(identifierStem('zoneId')).toBe('zone');
    expect(identifierStem('cluster_ref')).toBe('cluster');
  });

  it('binds semantic roles without rewriting external names', () => {
    const binding = inferSemanticRole('project_uuid');
    expect(binding?.semanticRole).toBe('parent-scope-id');
    expect(binding?.externalName).toBe('project_uuid');
    expect(inferSemanticRole('displayName')?.semanticRole).toBe('resource-name');
    expect(inferSemanticRole('totally-unknown-field')).toBeUndefined();
  });
});

describe('openapi interpreter + normalizer', () => {
  it('parses an OpenAPI document into normalized capabilities', () => {
    const capabilities = normalizeOperations(introspectOpenApi(openApiDoc));
    const byId = new Map(capabilities.map((c) => [c.id, c]));

    expect(capabilities.map((c) => c.id).sort()).toEqual(['create-project-createproject', 'delete-project-deleteproject', 'read-project-getproject', 'read-project-listprojects']);

    const create = byId.get('create-project-createproject')!;
    expect(create.action).toBe('create');
    expect(create.sideEffect).toBe('reversible');
    expect(create.semanticTarget?.id).toBe('project');
    const name = create.inputs.find((i) => i.externalName === 'name')!;
    expect(name.semanticRole).toBe('resource-name');
    expect(name.resolution).toBe('generated');
    const engine = create.inputs.find((i) => i.externalName === 'engine')!;
    expect(engine.enumValues).toEqual(['postgres', 'redis']);
    expect(create.semanticVariants.map((v) => v.id).sort()).toEqual(['postgresql-database', 'redis-cache']);

    const list = byId.get('read-project-listprojects')!;
    expect(list.action).toBe('read');
    expect(list.sideEffect).toBe('none');
    expect(list.externalOperation).toMatchObject({ protocol: 'rest', method: 'GET', pathTemplate: '/projects' });

    const del = byId.get('delete-project-deleteproject')!;
    expect(del.sideEffect).toBe('destructive');
    const projectId = del.inputs.find((i) => i.externalName === 'projectId')!;
    expect(projectId.required).toBe(true);
    expect(projectId.location).toBe('path');
  });
});

describe('capability graph', () => {
  it('matches desired targets directly and through type variants', () => {
    const capabilities = normalizeOperations(introspectOpenApi(openApiDoc));
    const graph = SemanticCapabilityGraph.build(capabilities);

    const forProject = graph.findForDesiredTarget('project');
    expect(forProject).toHaveLength(4);
    const forPostgres = graph.findForDesiredTarget('postgresql-database');
    expect(forPostgres.map((c) => c.id)).toEqual(['create-project-createproject']);

    const node = graph.node('project');
    expect(node?.capabilityIds).toHaveLength(4);
    expect(node?.variants.map((v) => v.id).sort()).toEqual(['postgresql-database', 'redis-cache']);
  });

  it('finds semantic producers for discoverable inputs', () => {
    const capabilities = normalizeOperations(introspectOpenApi(openApiDoc));
    const graph = SemanticCapabilityGraph.build(capabilities);
    const consumer = graph.capability('read-project-getproject')!;
    const projectId = consumer.inputs.find((i) => i.externalName === 'projectId')!;
    // projectId binds to resource-id with stem "project"; the graph may only
    // propose side-effect-free read capabilities whose outputs or target
    // concept match that stem — never provider knowledge.
    const producers = graph.producersForInput(projectId, consumer);
    expect(producers.map((p) => p.id)).toEqual(['read-project-listprojects']);
    expect(producers.every((p) => p.sideEffect === 'none')).toBe(true);
  });
});

describe('universal executor (REST)', () => {
  it('filters parameters, places them by location, injects broker credentials and scrubs traces', async () => {
    const calls: { url: string; method: string; headers: Record<string, string>; body: string | undefined }[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      calls.push({ url: String(input), method: String(init?.method), headers: Object.fromEntries(headers.entries()), body: init?.body as string | undefined });
      return new Response(JSON.stringify({ id: 'w-1' }), { status: 201 });
    }) as typeof fetch;

    const executor = new UniversalExecutor({ connectionId: 'conn-1', baseUrl: 'https://api.example.test/', broker: testBroker() });
    const outcome = await executor.execute(restCapability(), { name: 'w1', q: 'alpha', invented: 'drop-me' }, ctx);

    expect(outcome.ok).toBe(true);
    expect(outcome.executionConfidence).toBe(1.0);
    expect(outcome.data).toEqual({ id: 'w-1' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.example.test/widgets?q=alpha');
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.headers['authorization']).toBe('Bearer sekrit-token');
    expect(JSON.parse(calls[0]!.body!)).toEqual({ name: 'w1' });
    expect(outcome.trace).not.toContain('sekrit-token');
  });

  it('refuses to execute when required inputs are unresolved', async () => {
    const executor = new UniversalExecutor({ connectionId: 'conn-1', baseUrl: 'https://api.example.test', broker: testBroker() });
    const outcome = await executor.execute(restCapability(), { q: 'only-query' }, ctx);
    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe(0);
    expect(outcome.error?.category).toBe('VALIDATION');
    expect(outcome.trace).toContain('not executed');
  });

  it('auto-fills generated inputs and drops empty optional ones', async () => {
    let seenBody: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      seenBody = JSON.parse(String(init?.body));
      return new Response('{}', { status: 201 });
    }) as typeof fetch;

    const executor = new UniversalExecutor({ connectionId: 'conn-1', baseUrl: 'https://api.example.test', broker: testBroker() });
    const capability = restCapability({
      inputs: [{ externalName: 'name', required: true, type: 'string', location: 'body', resolution: 'generated' }],
    });
    const outcome = await executor.execute(capability, {}, ctx);

    expect(outcome.ok).toBe(true);
    expect(String(seenBody?.name)).toMatch(/^gitu-resource-/);
  });

  it('fills path templates and normalizes HTTP failures into semantic errors', async () => {
    globalThis.fetch = (async () => new Response('nope', { status: 404 })) as typeof fetch;

    const executor = new UniversalExecutor({ connectionId: 'conn-1', baseUrl: 'https://api.example.test', broker: testBroker() });
    const capability = restCapability({
      action: 'read',
      sideEffect: 'none',
      externalOperation: { protocol: 'rest', method: 'GET', pathTemplate: '/widgets/{widgetId}' },
      inputs: [{ externalName: 'widgetId', required: true, type: 'string', location: 'path', resolution: 'user-required' }],
    });
    const outcome = await executor.execute(capability, { widgetId: 'w 9' }, ctx);

    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe(404);
    expect(outcome.error?.category).toBe('NOT_FOUND');
    expect(outcome.error?.suspectedCause.length).toBeGreaterThan(0);
    expect(outcome.error?.retryable).toBe(false);
  });
});

describe('UniversalConnectionRuntime end-to-end', () => {
  function runtimeWithFetch(handler: (url: URL, method: string, body: string | undefined) => { status: number; data: unknown }) {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const result = handler(new URL(String(input)), String(init?.method ?? 'GET'), init?.body as string | undefined);
      return new Response(JSON.stringify(result.data), { status: result.status });
    }) as typeof fetch;
    return new UniversalConnectionRuntime({ connectionId: 'conn-1', baseUrl: 'https://api.example.test', broker: testBroker() });
  }

  it('introspects an OpenAPI document and reuses the cached graph when the schema is unchanged', async () => {
    home();
    const runtime = runtimeWithFetch(() => ({ status: 200, data: {} }));
    const first = await runtime.introspect({ kind: 'openapi', document: openApiDoc });
    expect(first.fromCache).toBe(false);
    expect(first.capabilityCount).toBe(4);

    const second = await new UniversalConnectionRuntime({ connectionId: 'conn-1', baseUrl: 'https://api.example.test', broker: testBroker() }).introspect({ kind: 'openapi', document: openApiDoc });
    expect(second.fromCache).toBe(true);
    expect(second.schemaFingerprint).toBe(first.schemaFingerprint);
    expect(second.capabilityCount).toBe(first.capabilityCount);

    const changed = await runtime.introspect({ kind: 'openapi', document: { ...openApiDoc, info: { title: 'Projects API v2', version: '2.0' } } });
    expect(changed.fromCache).toBe(false);
    expect(changed.schemaFingerprint).not.toBe(first.schemaFingerprint);
  });

  it('executes a mutation, independently verifies it via read-back, and reports both separately', async () => {
    home();
    const runtime = runtimeWithFetch((url, method) => {
      if (method === 'POST' && url.pathname === '/projects') return { status: 201, data: { id: 'proj-77' } };
      return { status: 200, data: { data: [{ id: 'proj-1' }, { id: 'proj-77' }] } };
    });
    await runtime.introspect({ kind: 'openapi', document: openApiDoc });

    const result = await runtime.executeCapability('create-project-createproject', { engine: 'postgres' });
    expect(result.execution.ok).toBe(true);
    expect(result.verification.status).toBe('verified');
    expect(result.verification.strategy).toContain('read-back');
    expect(result.verification.detail).toContain('proj-77');
    expect(result.summary).toBe('EXECUTED, VERIFIED');
  });

  it('gates destructive capabilities behind explicit approval and never touches the network without it', async () => {
    home();
    let networkCalls = 0;
    const runtime = runtimeWithFetch(() => {
      networkCalls += 1;
      return { status: 200, data: {} };
    });
    await runtime.introspect({ kind: 'openapi', document: openApiDoc });

    const blocked = await runtime.executeCapability('delete-project-deleteproject', { projectId: 'p1' });
    expect(networkCalls).toBe(0);
    expect(blocked.execution.ok).toBe(false);
    expect(blocked.execution.error?.category).toBe('POLICY_BLOCKED');
    expect(blocked.verification.status).toBe('skipped');

    const approved = await runtime.executeCapability('delete-project-deleteproject', { projectId: 'p1' }, { approval: () => true });
    // One network call for the mutation, one for the independent verification read.
    expect(networkCalls).toBe(2);
    expect(approved.execution.ok).toBe(true);
    expect(approved.verification.status).toBe('partial');
    expect(approved.verification.detail).toContain('no object id');
  });

  it('records failed executions and blocks identical retries until real state changes', async () => {
    home();
    let calls = 0;
    const runtime = runtimeWithFetch((url, method) => {
      calls += 1;
      if (method === 'POST' && url.pathname === '/projects') return { status: 409, data: { message: 'exists' } };
      return { status: 200, data: { data: [] } };
    });
    await runtime.introspect({ kind: 'openapi', document: openApiDoc });

    const first = await runtime.executeCapability('create-project-createproject', { engine: 'postgres' });
    expect(first.execution.ok).toBe(false);
    expect(first.execution.error?.category).toBe('CONFLICT');
    expect(first.summary).toContain('FAILED');

    const retried = await runtime.executeCapability('create-project-createproject', { engine: 'postgres' });
    expect(calls).toBe(1); // zero second network attempt
    expect(retried.execution.error?.category).toBe('BLOCKED_DUPLICATE');
  });

  it('observes remote state with safe reads and advances its epoch when content changes', async () => {
    home();
    const runtime = runtimeWithFetch(() => ({ status: 200, data: { data: [{ id: 'proj-1' }] } }));
    await runtime.introspect({ kind: 'openapi', document: openApiDoc });

    const snapshot = await runtime.discoverState();
    expect(snapshot.readErrors).toEqual([]);
    expect(snapshot.observed).toEqual([{ concept: 'project', id: 'proj-1', sourceCapabilityId: 'read-project-listprojects' }]);
    expect(snapshot.epoch).toBeGreaterThan(0);
    await expect(runtime.discoverState()).resolves.toMatchObject({ observed: [{ id: 'proj-1' }] });
  });

  it('throws for unknown capability ids', async () => {
    home();
    const runtime = runtimeWithFetch(() => ({ status: 200, data: {} }));
    await expect(runtime.executeCapability('no-such-capability')).rejects.toThrow(/Unknown capability/);
  });
});
