import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConnectionRegistry, ConnectionInvocationError } from '../src/connections/connections.js';
import { ProviderReadCache } from '../src/connections/runtime/provider-cache.js';
import {
  UniversalCapabilityRegistry,
  classifyCapabilityRisk,
  validateCapabilityArguments,
  fingerprintInvocation,
  type CapabilityInvocationRequest,
} from '../src/connections/runtime/universal-registry.js';
import { Gitu } from '../src/agent/gitu.js';
import { extractDigestMaterial, buildDigestContent, compressDigest } from '../src/context/digest.js';
import type { LlmClient, LlmMessage, LlmTurnResult } from '../src/llm/llm.js';

const homes: string[] = [];
const dirs: string[] = [];
const previousHome = process.env.AGENT_GITU_HOME;
const originalFetch = globalThis.fetch;

function project(name: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), `gitu-univ-proj-${name}-`));
  dirs.push(dir);
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `univ-${name}` }));
  return dir;
}

function home(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-universal-'));
  homes.push(root);
  process.env.AGENT_GITU_HOME = root;
  return root;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (previousHome === undefined) delete process.env.AGENT_GITU_HOME;
  else process.env.AGENT_GITU_HOME = previousHome;
  for (const root of homes.splice(0)) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* temp cleanup */
    }
  }
  for (const dir of dirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* temp cleanup */
    }
  }
});

function okResponse(body: unknown = {}, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('Milestone 1 — Exact operation rejection, zero-network blocking & provisional registration', () => {
  it('HTTP 404 rejects the exact operation into rejectedOperations without invalidating credential', async () => {
    home();
    const registry = new ConnectionRegistry();
    const saved = registry.save({
      label: 'Coolify Prod',
      provider: 'coolify',
      baseUrl: 'https://coolify.example.test',
      capabilities: ['databases.read'],
      operations: [
        { id: 'list-databases-wrong', label: 'List DBs', capability: 'databases.read', method: 'GET', path: '/api/v1/databases', risk: 'read' },
      ],
      token: 'valid-coolify-token',
    });

    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ message: 'Route not found' }), { status: 404 });
    }) as typeof fetch;

    await expect(registry.invokeOperation(saved.id, saved.operations[0])).rejects.toThrow(ConnectionInvocationError);

    // Auth status is NOT invalid — the credential was not rejected!
    expect(registry.authStateOf(saved.id).status).not.toBe('invalid');

    // The rejection is recorded with exact route and status
    const rejected = registry.isOperationRejected(saved.id, 'list-databases-wrong', 'GET', '/api/v1/databases');
    expect(rejected).toBeDefined();
    expect(rejected?.status).toBe(404);
  });

  it('Known rejected operation is blocked locally with KNOWN_REJECTED_OPERATION without touching network', async () => {
    home();
    const registry = new ConnectionRegistry();
    const saved = registry.save({
      label: 'Coolify Prod',
      provider: 'coolify',
      baseUrl: 'https://coolify.example.test',
      capabilities: ['databases.read'],
      operations: [
        { id: 'list-databases-wrong', label: 'List DBs', capability: 'databases.read', method: 'GET', path: '/api/v1/databases', risk: 'read' },
      ],
      token: 'valid-coolify-token',
    });

    let networkHits = 0;
    globalThis.fetch = (async () => {
      networkHits++;
      return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
    }) as typeof fetch;

    // First call hits network and fails 404
    await expect(registry.invokeOperation(saved.id, saved.operations[0])).rejects.toThrow();
    expect(networkHits).toBe(1);

    // Second call with same exact operation MUST fail locally without touching network
    try {
      await registry.invokeOperation(saved.id, saved.operations[0]);
      expect.unreachable('Should have thrown KNOWN_REJECTED_OPERATION');
    } catch (err) {
      expect(err).toBeInstanceOf(ConnectionInvocationError);
      expect((err as ConnectionInvocationError).state).toBe('KNOWN_REJECTED_OPERATION');
    }
    expect(networkHits).toBe(1); // No new network call!
  });

  it('Alternate endpoint recovery succeeds after primary endpoint 404', async () => {
    home();
    const registry = new ConnectionRegistry();
    const saved = registry.save({
      label: 'Coolify Prod',
      provider: 'coolify',
      baseUrl: 'https://coolify.example.test',
      capabilities: ['databases.read'],
      operations: [
        { id: 'get-databases', label: 'Primary DB endpoint', capability: 'databases.read', method: 'GET', path: '/api/v1/databases', risk: 'read' },
        { id: 'get-db-resources', label: 'Alternate DB endpoint', capability: 'databases.read', method: 'GET', path: '/api/v1/resources/databases', risk: 'read' },
      ],
      token: 'valid-coolify-token',
    });

    // Primary endpoint fails 404; alternate endpoint returns 200 OK
    globalThis.fetch = (async (input) => {
      const url = String(input);
      if (url.includes('/api/v1/databases')) {
        return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
      }
      if (url.includes('/api/v1/resources/databases')) {
        return okResponse({ databases: [{ id: 'db-1', name: 'main-postgres' }] });
      }
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    // Primary fails
    await expect(registry.invokeOperation(saved.id, saved.operations[0])).rejects.toThrow();

    // Now resolve operation for 'databases.read' — the resolver should skip the rejected primary and pick the alternate
    const resolution = registry.resolveConnectionOperation({
      connectionId: saved.id,
      capability: 'databases.read',
    });

    expect(resolution.operationAvailable).toBe(true);
    expect(resolution.operation?.id).toBe('get-db-resources');

    // Executing alternate succeeds
    const result = await registry.resolveAndExecuteRead({
      connectionId: saved.id,
      operationId: 'get-db-resources',
    });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ databases: [{ id: 'db-1', name: 'main-postgres' }] });
  });

  it('Provisional GET: unverified candidate is not persisted on 404 failure, but persisted on 200 success', async () => {
    home();
    const registry = new ConnectionRegistry();
    const saved = registry.save({
      label: 'Coolify Prod',
      provider: 'coolify',
      baseUrl: 'https://coolify.example.test',
      capabilities: ['services.read'],
      operations: [
        { id: 'init-check', label: 'Init Check', capability: 'services.read', method: 'GET', path: '/api/v1/init', risk: 'read' },
      ],
      token: 'valid-coolify-token',
    });

    // Propose an unverified candidate (documented: false)
    const candidateResolution = registry.resolveConnectionOperation({
      connectionId: saved.id,
      operation: { id: 'list-services', label: 'List Services', capability: 'services.read', method: 'GET', path: '/api/v1/services', risk: 'read' },
      capability: 'services.read',
      documented: false,
    });

    expect(candidateResolution.resolution).toBe('provisional');
    // Not yet persisted in the profile
    expect(registry.operation(saved.id, 'list-services')).toBeUndefined();

    // Scenario A: When candidate fails 404, it is NOT persisted as trusted
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
    }) as typeof fetch;

    await expect(registry.resolveAndExecuteRead({
      connectionId: saved.id,
      operation: { id: 'list-services', label: 'List Services', capability: 'services.read', method: 'GET', path: '/api/v1/services', risk: 'read' },
      capability: 'services.read',
      documented: false,
    })).rejects.toThrow();

    expect(registry.operation(saved.id, 'list-services')).toBeUndefined();

    // Scenario B: When candidate succeeds with HTTP 200, it IS persisted into profile
    globalThis.fetch = (async () => {
      return okResponse({ services: [{ id: 'srv-1' }] });
    }) as typeof fetch;

    const successResolution = await registry.resolveAndExecuteRead({
      connectionId: saved.id,
      operation: { id: 'list-services-v2', label: 'List Services V2', capability: 'services.read', method: 'GET', path: '/api/v2/services', risk: 'read' },
      capability: 'services.read',
      documented: false,
    });

    expect(successResolution.ok).toBe(true);
    // Now it is persisted in the profile!
    expect(registry.operation(saved.id, 'list-services-v2')).toBeDefined();
    expect(registry.operation(saved.id, 'list-services-v2')?.path).toBe('/api/v2/services');
  });
});

describe('Milestone 2 & 3 — Universal Registry & ProviderReadCache', () => {
  it('ProviderReadCache tracks remote state epochs and invalidates scoped cached facts on write', () => {
    const cache = new ProviderReadCache();
    const connId = 'conn-coolify';

    expect(cache.getStateEpoch(connId)).toBe(1);

    // Record evidence for application env
    const evidence1 = cache.record({
      connectionId: connId,
      capability: 'applications.env.read',
      operationId: 'get-app-envs',
      endpoint: 'GET /api/v1/applications/app-1/envs',
      data: { envs: [{ key: 'NODE_ENV', value: 'production' }] },
      resourceType: 'application',
      resourceId: 'app-1',
    });

    expect(evidence1.stateEpoch).toBe(1);
    expect(evidence1.id).toMatch(/^pe-/);

    // Cache hit before mutation
    const hit = cache.get(connId, 'applications.env.read', 'app-1');
    expect(hit).toBeDefined();
    expect(hit?.data).toEqual({ envs: [{ key: 'NODE_ENV', value: 'production' }] });

    // Mutation occurs on app-1 env
    cache.invalidateForWrite(connId, 'application', 'app-1');
    expect(cache.getStateEpoch(connId, 'application', 'app-1')).toBe(2);
    expect(cache.getStateEpoch(connId)).toBe(2);

    // After mutation, the stale fact is no longer returned as valid
    const hitAfterWrite = cache.get(connId, 'applications.env.read', 'app-1');
    expect(hitAfterWrite).toBeUndefined();
  });

  it('UniversalCapabilityRegistry classifies MCP tools and enforces approval gates', () => {
    expect(classifyCapabilityRisk('get_weather')).toBe('read');
    expect(classifyCapabilityRisk('search_repositories')).toBe('read');
    expect(classifyCapabilityRisk('create_branch')).toBe('reversible-write');
    expect(classifyCapabilityRisk('delete_database')).toBe('destructive');
    expect(classifyCapabilityRisk('drop_table')).toBe('destructive');

    const registry = new UniversalCapabilityRegistry();
    const dummyClient = { callTool: async () => ({ content: 'ok' }) };
    registry.registerMcpTools(
      [
        { name: 'get_issue', description: 'Fetch issue details', inputSchema: {} },
        { name: 'delete_repo', description: 'Permanently remove a repo', inputSchema: {} },
      ],
      dummyClient,
      'github-mcp',
    );

    const readCap = registry.get('mcp:github-mcp:get_issue');
    expect(readCap).toBeDefined();
    expect(readCap?.risk).toBe('read');
    expect(registry.requiresApproval('mcp:github-mcp:get_issue')).toBe(false);

    const destructiveCap = registry.get('mcp:github-mcp:delete_repo');
    expect(destructiveCap).toBeDefined();
    expect(destructiveCap?.risk).toBe('destructive');
    expect(registry.requiresApproval('mcp:github-mcp:delete_repo')).toBe(true);
  });

  it('Gitu agent reuses fresh cached observation (cache hit) without redundant provider network calls', async () => {
    const root = project('cached-read-agent');
    home();
    const events: string[] = [];
    let turn = 0;
    let providerHandlerCalls = 0;
    const providerCache = new ProviderReadCache();

    const llm: LlmClient = {
      name: 'mock-llm',
      async complete() {
        return '';
      },
      async completeStream() {
        return '';
      },
      async completeTurn(messages: LlmMessage[]): Promise<LlmTurnResult> {
        turn += 1;
        if (turn === 1) {
          return { kind: 'text', text: JSON.stringify({ action: { type: 'set_criteria', criteria: ['verified apps'] } }), metadata: {} };
        }
        if (turn === 2) {
          // First read: cache miss -> hits provider handler
          return { kind: 'text', text: JSON.stringify({ action: { type: 'connection_action', connectionId: 'coolify', operationId: 'list-apps', reason: 'read apps 1' } }), metadata: {} };
        }
        if (turn === 3) {
          // Second read under SAME epoch: must hit cache!
          return { kind: 'text', text: JSON.stringify({ action: { type: 'connection_action', connectionId: 'coolify', operationId: 'list-apps', reason: 'read apps 2' } }), metadata: {} };
        }
        if (turn === 4) {
          const text = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' ');
          const ids = [...text.matchAll(/(ev-\d{8}-[0-9a-f]{6})/g)].map((m) => m[1]);
          return { kind: 'text', text: JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: ids.at(-1) ?? 'ev-missing' } }), metadata: {} };
        }
        return { kind: 'text', text: JSON.stringify({ action: { type: 'complete', summary: 'done', risks: [], followUps: [] } }), metadata: {} };
      },
      async completeTurnStream(messages: LlmMessage[]): Promise<LlmTurnResult> {
        return llm.completeTurn!(messages);
      },
    };

    const gitu = new Gitu({
      cwd: root,
      llm,
      mode: 'fast',
      providerCache,
      onEvent: (text) => events.push(text),
      connectionActionHandler: async () => {
        providerHandlerCalls += 1;
        return { message: 'applications list', data: { apps: [{ id: 'app-coolify-1' }] } };
      },
    });

    await gitu.run('Check coolify apps with cache');
    // Only 1 network call was made because the second read hit the cache!
    expect(providerHandlerCalls).toBe(1);
    expect(events.some((e) => e.includes('cache hit'))).toBe(true);
  });

  it('Gitu agent advances state epoch on connection_operation write, invalidating cache for subsequent reads', async () => {
    const root = project('write-invalidation-agent');
    home();
    const events: string[] = [];
    let turn = 0;
    let providerReadCalls = 0;
    let providerWriteCalls = 0;
    const providerCache = new ProviderReadCache();

    const llm: LlmClient = {
      name: 'mock-llm-write',
      async complete() {
        return '';
      },
      async completeStream() {
        return '';
      },
      async completeTurn(messages: LlmMessage[]): Promise<LlmTurnResult> {
        turn += 1;
        if (turn === 1) {
          return { kind: 'text', text: JSON.stringify({ action: { type: 'set_criteria', criteria: ['app updated'] } }), metadata: {} };
        }
        if (turn === 2) {
          // Read 1: initial read
          return { kind: 'text', text: JSON.stringify({ action: { type: 'connection_action', connectionId: 'coolify', operationId: 'get-env', reason: 'read env' } }), metadata: {} };
        }
        if (turn === 3) {
          // Write: mutate env -> advances state epoch
          return {
            kind: 'text',
            text: JSON.stringify({
              action: {
                type: 'connection_operation',
                connectionId: 'coolify',
                operation: { id: 'update-env', label: 'Update env', capability: 'applications.write', method: 'POST', path: '/api/v1/applications/app-1/envs', risk: 'reversible-write' },
                body: { key: 'NEW_VAR', value: '123' },
                reason: 'apply new env',
              },
            }),
            metadata: {},
          };
        }
        if (turn === 4) {
          // Read 2: after write, cache was invalidated, must hit provider handler again!
          return { kind: 'text', text: JSON.stringify({ action: { type: 'connection_action', connectionId: 'coolify', operationId: 'get-env', reason: 'read updated env' } }), metadata: {} };
        }
        if (turn === 5) {
          const text = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' ');
          const ids = [...text.matchAll(/(ev-\d{8}-[0-9a-f]{6})/g)].map((m) => m[1]);
          return { kind: 'text', text: JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: ids.at(-1) ?? 'ev-missing' } }), metadata: {} };
        }
        return { kind: 'text', text: JSON.stringify({ action: { type: 'complete', summary: 'done', risks: [], followUps: [] } }), metadata: {} };
      },
      async completeTurnStream(messages: LlmMessage[]): Promise<LlmTurnResult> {
        return llm.completeTurn!(messages);
      },
    };

    const gitu = new Gitu({
      cwd: root,
      llm,
      mode: 'fast',
      providerCache,
      onEvent: (text) => events.push(text),
      connectionActionHandler: async () => {
        providerReadCalls += 1;
        return { message: 'read env', data: { envs: [{ key: 'NEW_VAR', value: '123' }] } };
      },
      connectionOperationHandler: async () => {
        providerWriteCalls += 1;
        return { message: 'env updated successfully' };
      },
    });

    await gitu.run('Update coolify env');
    expect(providerWriteCalls).toBe(1);
    // Read was called 2 times: once before the write, and once after the write because epoch advanced!
    expect(providerReadCalls).toBe(2);
    expect(providerCache.getStateEpoch('coolify')).toBe(2);
  });

  it('Durable history compaction protects PROVIDER EVIDENCE and REJECTED OPERATIONS from eviction', () => {
    const droppedMessages: LlmMessage[] = [
      {
        role: 'user',
        content:
          'OBSERVATION:\nPROVIDER EVIDENCE: [pe-42] coolify:applications.read -> 5 services healthy\n' +
          'REJECTED OPERATION: GET /api/v1/databases [HTTP 404]\n' +
          'The provider does not expose /api/v1/databases; exact endpoint rejected.\n' +
          'RESULT [error] run_command failed\ncommand returned exit code 1',
      },
    ];

    const material = extractDigestMaterial(droppedMessages);
    expect(material.evidenceLines.some((line) => line.includes('[pe-42]'))).toBe(true);
    expect(material.failures.some((line) => line.includes('REJECTED OPERATION: GET /api/v1/databases'))).toBe(true);

    const digest = buildDigestContent({
      condensedCount: 1,
      excerptLines: material.excerptLines,
      failures: material.failures,
      evidence: material.evidenceLines,
    });

    expect(digest).toContain('KEY FAILURES (do not repeat blindly):');
    expect(digest).toContain('REJECTED OPERATION: GET /api/v1/databases');
    expect(digest).toContain('EVIDENCE ALREADY RECORDED:');
    expect(digest).toContain('[pe-42]');

    // Even when compressed down, the durable floor guarantees preservation
    const compressed = compressDigest(digest, 1000);
    expect(compressed).toContain('REJECTED OPERATION: GET /api/v1/databases');
    expect(compressed).toContain('[pe-42]');
  });
});

describe('Universal Argument Layer & Invocation Runtime', () => {
  it('validates structured capability arguments against schema', () => {
    const schema = {
      type: 'object',
      required: ['applicationId', 'environment'],
      properties: {
        applicationId: { type: 'string' },
        environment: { type: 'string' },
        limit: { type: 'number' },
      },
    };

    // Valid arguments
    const res1 = validateCapabilityArguments(schema, { applicationId: 'app-1', environment: 'production', limit: 10 });
    expect(res1.valid).toBe(true);
    expect(res1.errors).toHaveLength(0);

    // Missing required field
    const res2 = validateCapabilityArguments(schema, { applicationId: 'app-1' });
    expect(res2.valid).toBe(false);
    expect(res2.errors).toContain('Missing required field: "environment"');

    // Type mismatch
    const res3 = validateCapabilityArguments(schema, { applicationId: 'app-1', environment: 'production', limit: 'not-a-number' as unknown as number });
    expect(res3.valid).toBe(false);
    expect(res3.errors.some((e) => e.includes('expected number'))).toBe(true);
  });

  it('computes deterministic fingerprints for duplicate call and anti-loop detection', () => {
    const req1: CapabilityInvocationRequest = {
      capability: 'applications.environment.read',
      arguments: { applicationId: 'sv7' },
      source: 'connection',
    };

    const req2: CapabilityInvocationRequest = {
      capability: 'applications.environment.read',
      arguments: { applicationId: 'sv7' },
      source: 'connection',
    };

    const reqDiffArgs: CapabilityInvocationRequest = {
      capability: 'applications.environment.read',
      arguments: { applicationId: 'sv8' },
      source: 'connection',
    };

    const fp1 = fingerprintInvocation(req1, 1);
    const fp2 = fingerprintInvocation(req2, 1);
    const fpDiff = fingerprintInvocation(reqDiffArgs, 1);
    const fpEpoch2 = fingerprintInvocation(req1, 2);

    expect(fp1).toBe(fp2); // identical request = identical fingerprint
    expect(fp1).not.toBe(fpDiff); // different arguments = different fingerprint
    expect(fp1).not.toBe(fpEpoch2); // different state epoch = different fingerprint
  });

  it('executes normalized request through UniversalCapabilityRegistry with retrieval-before-fetch and policy gating', async () => {
    const registry = new UniversalCapabilityRegistry();
    const cache = new ProviderReadCache();
    let networkCalls = 0;

    // Register a native connection
    registry.registerConnection(
      'coolify-main',
      [
        { id: 'get-envs', label: 'Get Envs', capability: 'applications.environment.read', method: 'GET', path: '/api/v1/applications/{id}/envs', risk: 'read' },
        { id: 'set-env', label: 'Set Env', capability: 'applications.environment.write', method: 'POST', path: '/api/v1/applications/{id}/envs', risk: 'reversible-write' },
      ],
      async (op, body) => {
        networkCalls += 1;
        if (op.id === 'get-envs') {
          return { envs: [{ key: 'NODE_ENV', value: 'production' }] };
        }
        return { success: true, updated: body };
      },
      'coolify',
    );

    // Call 1: fresh read -> hits invoker, returns ok, caches result
    const res1 = await registry.invoke(
      {
        capability: 'applications.environment.read',
        arguments: { applicationId: 'sv7' },
        source: 'connection',
      },
      { cache },
    );

    expect(res1.status).toBe('ok');
    expect(res1.cacheHit).toBe(false);
    expect(res1.evidenceId).toBeDefined();
    expect(networkCalls).toBe(1);

    // Call 2: second read with same arguments under current epoch -> hits cache!
    const res2 = await registry.invoke(
      {
        capability: 'applications.environment.read',
        arguments: { applicationId: 'sv7' },
        source: 'connection',
      },
      { cache },
    );

    expect(res2.status).toBe('cached');
    expect(res2.cacheHit).toBe(true);
    expect(networkCalls).toBe(1); // Zero new network calls!

    // Call 3: mutating write without approval handler -> rejected
    const resRejected = await registry.invoke(
      {
        capability: 'applications.environment.write',
        arguments: { applicationId: 'sv7', key: 'DEBUG', value: 'true' },
        source: 'connection',
      },
      { cache, approvalHandler: async () => false },
    );

    expect(resRejected.status).toBe('rejected');
    expect(resRejected.errorClass).toBe('USER_REJECTED');
    expect(networkCalls).toBe(1);

    // Call 4: mutating write with approval -> succeeds and invalidates cache
    const resWrite = await registry.invoke(
      {
        capability: 'applications.environment.write',
        arguments: { applicationId: 'sv7', key: 'DEBUG', value: 'true' },
        source: 'connection',
      },
      { cache, approvalHandler: async () => true },
    );

    expect(resWrite.status).toBe('ok');
    expect(networkCalls).toBe(2);

    // Call 5: read after write -> cache was invalidated, hits invoker again!
    const res3 = await registry.invoke(
      {
        capability: 'applications.environment.read',
        arguments: { applicationId: 'sv7' },
        source: 'connection',
      },
      { cache },
    );

    expect(res3.status).toBe('ok');
    expect(res3.cacheHit).toBe(false);
    expect(networkCalls).toBe(3);
  });
});
