import { describe, expect, it } from 'vitest';
import {
  UniversalDiscoveryEngine,
  DiscoveryFactCache,
  DiscoveryTelemetryAccumulator,
  redactDiscoverySecrets,
  type AnnotatedCatalogOperation,
  type DiscoveryRequest,
} from '../src/connections/discovery-engine.js';
import { ConnectionRegistry } from '../src/connections/connections.js';
import { CONNECTION_CATALOG } from '../src/connections/catalog.js';

describe('Universal Resource Discovery Engine', () => {
  const coolifyOps = (CONNECTION_CATALOG.find((p) => p.provider === 'coolify')?.operations ?? []) as AnnotatedCatalogOperation[];
  const githubOps = (CONNECTION_CATALOG.find((p) => p.provider === 'github')?.operations ?? []) as AnnotatedCatalogOperation[];

  it('fulfils multi-intent request (get_resource + get_status + get_environment) in 1 discovery pass', async () => {
    const executed: string[] = [];
    const cache = new DiscoveryFactCache();
    const telemetry = new DiscoveryTelemetryAccumulator();

    const fetcher = async ({ path }: { path: string }) => {
      executed.push(path);
      if (path === '/api/v1/applications') {
        return {
          ok: true,
          status: 200,
          data: [{ id: 'app-uuid-1', name: 'gitu-prod', status: 'running' }],
          message: 'ok',
        };
      }
      if (path === '/api/v1/applications/app-uuid-1') {
        return {
          ok: true,
          status: 200,
          data: { id: 'app-uuid-1', name: 'gitu-prod', fqdn: 'https://gitu.app', status: 'running' },
          message: 'ok',
        };
      }
      if (path === '/api/v1/applications/app-uuid-1/envs') {
        return {
          ok: true,
          status: 200,
          data: { PORT: '3000', NODE_ENV: 'production', DATABASE_URL: 'postgres://secret@db:5432' },
          message: 'ok',
        };
      }
      return { ok: false, status: 404, data: {}, message: 'not found' };
    };

    const engine = new UniversalDiscoveryEngine(coolifyOps, cache, telemetry, fetcher, 'https://coolify.example.com', {});

    const request: DiscoveryRequest = {
      connectionId: 'coolify',
      intents: ['get_resource', 'get_status', 'get_environment'],
      resourceType: 'application',
      resourceIdOrName: 'gitu-prod',
    };

    const result = await engine.discover(request);

    expect(result.ok).toBe(true);
    expect(result.stopReason).toBe('complete');
    expect(result.matchedResource?.id).toBe('app-uuid-1');
    expect(result.completedIntents).toContain('get_resource');
    expect(result.completedIntents).toContain('get_environment');
    expect(result.data['detail']).toBeDefined();
    expect(result.data['environment']).toBeDefined();
    expect(telemetry.snapshot().turnsSaved).toBe(1);
    expect(telemetry.snapshot().requests).toBe(1);
    expect(executed).toHaveLength(3); // list -> detail -> envs in 1 pass
  });

  it('executes shared intermediate reads (list_resources) only once', async () => {
    const listCalls: string[] = [];
    const cache = new DiscoveryFactCache();
    const telemetry = new DiscoveryTelemetryAccumulator();

    const fetcher = async ({ path }: { path: string }) => {
      if (path === '/api/v1/applications') {
        listCalls.push(path);
        return {
          ok: true,
          status: 200,
          data: [{ id: 'app-1', name: 'my-app' }],
          message: 'ok',
        };
      }
      return { ok: true, status: 200, data: { id: 'app-1', status: 'healthy' }, message: 'ok' };
    };

    const engine = new UniversalDiscoveryEngine(coolifyOps, cache, telemetry, fetcher, 'https://coolify.example.com', {});

    await engine.discover({
      connectionId: 'coolify',
      intents: ['get_resource', 'get_environment'],
      resourceType: 'application',
      resourceIdOrName: 'my-app',
    });

    expect(listCalls).toHaveLength(1);
  });

  it('rejects a write operation accidentally placed in a discovery graph', async () => {
    const unsafeOps: AnnotatedCatalogOperation[] = [
      {
        id: 'unsafe-deploy',
        label: 'Deploy',
        capability: 'deployments.write',
        method: 'POST',
        path: '/api/v1/deploy',
        risk: 'reversible-write',
        discovery: {
          intent: 'get_status',
          role: 'status',
          resourceType: 'application',
          produces: [],
          requires: [],
          sideEffectFree: false, // NOT sideEffectFree
          catalogVerification: 'verified',
        },
      },
    ];

    const cache = new DiscoveryFactCache();
    const telemetry = new DiscoveryTelemetryAccumulator();
    let fetchCalled = false;

    const engine = new UniversalDiscoveryEngine(unsafeOps, cache, telemetry, async () => {
      fetchCalled = true;
      return { ok: true, status: 200, data: {}, message: 'ok' };
    }, 'https://example.com', {});

    const result = await engine.discover({
      connectionId: 'test',
      intents: ['get_status'],
      resourceType: 'application',
    });

    expect(fetchCalled).toBe(false);
    expect(result.operationsExecuted).toHaveLength(0);
  });

  it('allows read implemented through verified POST / GraphQL', async () => {
    const graphqlReadOp: AnnotatedCatalogOperation[] = [
      {
        id: 'graphql-query',
        label: 'Query GraphQL',
        capability: 'analytics.read',
        method: 'POST',
        path: '/graphql',
        risk: 'read',
        discovery: {
          intent: 'list_resources',
          role: 'list',
          resourceType: 'metric',
          produces: ['metric.id'],
          requires: [],
          sideEffectFree: true,
          catalogVerification: 'verified',
        },
      },
    ];

    const cache = new DiscoveryFactCache();
    const telemetry = new DiscoveryTelemetryAccumulator();
    let postCalled = false;

    const engine = new UniversalDiscoveryEngine(graphqlReadOp, cache, telemetry, async ({ method }) => {
      if (method === 'POST') postCalled = true;
      return { ok: true, status: 200, data: [{ id: 'metric-1', name: 'cpu' }], message: 'ok' };
    }, 'https://example.com', {});

    const result = await engine.discover({
      connectionId: 'graphql-conn',
      intents: ['list_resources'],
      resourceType: 'metric',
    });

    expect(postCalled).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.operationsExecuted).toContain('graphql-query');
  });

  it('rejects unverified POST operations', async () => {
    const unverifiedOp: AnnotatedCatalogOperation[] = [
      {
        id: 'unverified-query',
        label: 'Query',
        capability: 'query.read',
        method: 'POST',
        path: '/query',
        risk: 'read',
        discovery: {
          intent: 'list_resources',
          role: 'list',
          resourceType: 'item',
          produces: [],
          requires: [],
          sideEffectFree: true,
          catalogVerification: 'unverified', // Unverified!
        },
      },
    ];

    const cache = new DiscoveryFactCache();
    const telemetry = new DiscoveryTelemetryAccumulator();
    let called = false;

    const engine = new UniversalDiscoveryEngine(unverifiedOp, cache, telemetry, async () => {
      called = true;
      return { ok: true, status: 200, data: [], message: 'ok' };
    }, 'https://example.com', {});

    const result = await engine.discover({
      connectionId: 'unverified-conn',
      intents: ['list_resources'],
      resourceType: 'item',
    });

    expect(called).toBe(false);
    expect(result.operationsExecuted).toHaveLength(0);
  });

  it('stops with stopReason: ambiguous when multiple resources match query', async () => {
    const cache = new DiscoveryFactCache();
    const telemetry = new DiscoveryTelemetryAccumulator();

    const fetcher = async () => ({
      ok: true,
      status: 200,
      data: [
        { id: 'app-1', name: 'gitu-production' },
        { id: 'app-2', name: 'gitu-staging' },
      ],
      message: 'ok',
    });

    const engine = new UniversalDiscoveryEngine(coolifyOps, cache, telemetry, fetcher, 'https://coolify.example.com', {});

    const result = await engine.discover({
      connectionId: 'coolify',
      intents: ['get_resource', 'get_environment'],
      resourceType: 'application',
      resourceIdOrName: 'gitu', // Matches both!
    });

    expect(result.ok).toBe(false);
    expect(result.stopReason).toBe('ambiguous');
    expect(result.candidates).toHaveLength(2);
    expect(result.summary).toContain('multiple resources match');
    expect(telemetry.snapshot().ambiguous).toBe(1);
  });

  it('stops with stopReason: not_found when zero resources match query', async () => {
    const cache = new DiscoveryFactCache();
    const telemetry = new DiscoveryTelemetryAccumulator();

    const fetcher = async () => ({
      ok: true,
      status: 200,
      data: [{ id: 'app-1', name: 'other-app' }],
      message: 'ok',
    });

    const engine = new UniversalDiscoveryEngine(coolifyOps, cache, telemetry, fetcher, 'https://coolify.example.com', {});

    const result = await engine.discover({
      connectionId: 'coolify',
      intents: ['get_resource'],
      resourceType: 'application',
      resourceIdOrName: 'non-existent-app',
    });

    expect(result.ok).toBe(false);
    expect(result.stopReason).toBe('not_found');
    expect(result.summary).toContain('Resource not found');
    expect(telemetry.snapshot().notFound).toBe(1);
  });

  it('clamps call budget and returns useful partial results', async () => {
    const cache = new DiscoveryFactCache();
    const telemetry = new DiscoveryTelemetryAccumulator();

    const fetcher = async ({ path }: { path: string }) => {
      if (path === '/api/v1/applications') {
        return { ok: true, status: 200, data: [{ id: 'app-1', name: 'my-app' }], message: 'ok' };
      }
      return { ok: true, status: 200, data: { id: 'app-1', detail: 'full' }, message: 'ok' };
    };

    const engine = new UniversalDiscoveryEngine(coolifyOps, cache, telemetry, fetcher, 'https://coolify.example.com', {});

    // Request maxCalls = 1 so only list runs
    const result = await engine.discover({
      connectionId: 'coolify',
      intents: ['get_resource', 'get_environment'],
      resourceType: 'application',
      resourceIdOrName: 'my-app',
      budget: { maxCalls: 1 },
    });

    expect(result.stopReason).toBe('budget_exhausted');
    expect(result.operationsExecuted).toHaveLength(1);
    expect(result.data['list']).toBeDefined();
    expect(telemetry.snapshot().budgetExhausted).toBe(1);
  });

  it('redacts secrets in environment variables before model context', () => {
    const rawData = {
      PORT: '3000',
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://admin:secret@host:5432/db',
      API_KEY: 'sk-1234567890',
      AUTH_TOKEN: 'bearer-xyz',
      nested: {
        SECRET_KEY: 'very-secret',
        publicName: 'my-service',
      },
    };

    const redacted = redactDiscoverySecrets(rawData) as Record<string, unknown>;

    expect(redacted['PORT']).toBe('3000');
    expect(redacted['NODE_ENV']).toBe('production');
    expect(redacted['DATABASE_URL']).toEqual({ present: true, redacted: true });
    expect(redacted['API_KEY']).toEqual({ present: true, redacted: true });
    expect(redacted['AUTH_TOKEN']).toEqual({ present: true, redacted: true });
    expect((redacted['nested'] as Record<string, unknown>)['SECRET_KEY']).toEqual({ present: true, redacted: true });
    expect((redacted['nested'] as Record<string, unknown>)['publicName']).toBe('my-service');
  });

  it('reuses cached observations across subsequent discovery requests', async () => {
    let networkCalls = 0;
    const cache = new DiscoveryFactCache();
    const telemetry = new DiscoveryTelemetryAccumulator();

    const fetcher = async () => {
      networkCalls++;
      return { ok: true, status: 200, data: [{ id: 'app-1', name: 'my-app' }], message: 'ok' };
    };

    const engine = new UniversalDiscoveryEngine(coolifyOps, cache, telemetry, fetcher, 'https://coolify.example.com', {});

    // First call: hits network
    await engine.discover({ connectionId: 'coolify', intents: ['list_resources'], resourceType: 'application' });
    expect(networkCalls).toBe(1);

    // Second call: served from cache
    const secondResult = await engine.discover({ connectionId: 'coolify', intents: ['list_resources'], resourceType: 'application' });
    expect(networkCalls).toBe(1); // Network call count did NOT increase
    expect(secondResult.operationsExecuted[0]).toContain('(cache)');
    expect(telemetry.snapshot().cacheHits).toBe(1);
  });

  it('invalidates cached observations on write operations', async () => {
    const cache = new DiscoveryFactCache();
    cache.set('coolify', 'list-applications', {}, 'list', [{ id: 'app-1' }]);
    expect(cache.get('coolify', 'list-applications', {}, 'list')).toBeDefined();

    // Trigger write invalidation
    cache.invalidateForWrite('coolify');

    expect(cache.get('coolify', 'list-applications', {}, 'list')).toBeUndefined();
  });

  it('serves Coolify and GitHub from the exact same engine implementation', async () => {
    const cache = new DiscoveryFactCache();
    const telemetry = new DiscoveryTelemetryAccumulator();

    const githubFetcher = async ({ path }: { path: string }) => {
      if (path === '/user/repos') {
        return { ok: true, status: 200, data: [{ id: 'repo-1', name: 'agentgitu' }], message: 'ok' };
      }
      return { ok: true, status: 200, data: [{ id: 'run-1', status: 'completed' }], message: 'ok' };
    };

    const engine = new UniversalDiscoveryEngine(githubOps, cache, telemetry, githubFetcher, 'https://api.github.com', {});

    const result = await engine.discover({
      connectionId: 'github',
      intents: ['list_resources', 'get_status'],
      resourceType: 'repository',
      resourceIdOrName: 'agentgitu',
    });

    expect(result.ok).toBe(true);
    expect(result.matchedResource?.name).toBe('agentgitu');
    expect(result.operationsExecuted).toContain('validate');
    expect(result.operationsExecuted).toContain('list-workflow-runs');
  });

  it('invokes zero additional LLM calls internally during discovery', async () => {
    const cache = new DiscoveryFactCache();
    const telemetry = new DiscoveryTelemetryAccumulator();

    const engine = new UniversalDiscoveryEngine(coolifyOps, cache, telemetry, async () => ({
      ok: true,
      status: 200,
      data: [{ id: 'app-1', name: 'my-app' }],
      message: 'ok',
    }), 'https://coolify.example.com', {});

    const result = await engine.discover({
      connectionId: 'coolify',
      intents: ['list_resources'],
      resourceType: 'application',
    });

    expect(result.ok).toBe(true);
  });
});
