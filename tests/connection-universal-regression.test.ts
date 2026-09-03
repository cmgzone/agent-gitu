import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConnectionInvocationError, ConnectionRegistry } from '../src/connections/connections.js';

const homes: string[] = [];
const previousHome = process.env.AGENT_GITU_HOME;
const originalFetch = globalThis.fetch;

function home(): void {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-universal-connection-'));
  homes.push(root);
  process.env.AGENT_GITU_HOME = root;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (previousHome === undefined) delete process.env.AGENT_GITU_HOME;
  else process.env.AGENT_GITU_HOME = previousHome;
  for (const root of homes.splice(0)) rmSync(root, { recursive: true, force: true });
});

function save(registry: ConnectionRegistry): string {
  return registry.save({
    id: 'provider',
    label: 'Provider production',
    provider: 'custom-provider',
    baseUrl: 'https://provider.example.test',
    documentationUrl: 'https://provider.example.test/docs',
    capabilities: ['resources.read', 'resources.write'],
    operations: [
      { id: 'get-resource', label: 'Get resource', capability: 'resources.read', method: 'GET', path: '/api/v1/wrong', risk: 'read' },
      { id: 'update-resource', label: 'Update resource', capability: 'resources.write', method: 'PUT', path: '/api/v1/resource', risk: 'reversible-write' },
    ],
    token: 'private-provider-token',
  }).id;
}

describe('universal connection operation state', () => {
  it('never sends the same exact 404 endpoint twice', async () => {
    home();
    const registry = new ConnectionRegistry();
    const id = save(registry);
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const first = await registry.invokeRead(id, 'get-resource').catch((error) => error as ConnectionInvocationError);
    expect(first).toBeInstanceOf(ConnectionInvocationError);
    expect(first.state).toBe('CONNECTED_MISSING_OPERATION');
    expect(calls).toBe(1);

    const second = await registry.invokeRead(id, 'get-resource').catch((error) => error as ConnectionInvocationError);
    expect(second).toBeInstanceOf(ConnectionInvocationError);
    expect(second.outcome).toBe('not-run');
    expect(calls).toBe(1);
    expect(registry.capabilityStateOf(id).rejectedOperations).toEqual(expect.arrayContaining([
      expect.objectContaining({ method: 'GET', path: '/api/v1/wrong', status: 404 }),
    ]));
  });

  it('allows a different documented endpoint for the same capability and operation id', async () => {
    home();
    const registry = new ConnectionRegistry();
    const id = save(registry);
    const paths: string[] = [];
    globalThis.fetch = (async (input) => {
      const url = String(input);
      paths.push(new URL(url).pathname);
      if (url.endsWith('/api/v1/wrong')) return new Response('{}', { status: 404 });
      return new Response(JSON.stringify({ id: 'r-1', ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    await registry.invokeRead(id, 'get-resource').catch(() => undefined);

    const result = await registry.resolveAndExecuteRead({
      connectionId: id,
      documented: true,
      operation: {
        id: 'get-resource',
        label: 'Get resource',
        capability: 'resources.read',
        method: 'GET',
        path: '/api/v1/right',
        risk: 'read',
      },
    });

    expect(result.ok).toBe(true);
    expect(paths).toEqual(['/api/v1/wrong', '/api/v1/right']);
    expect(registry.get(id)?.operations.find((operation) => operation.id === 'get-resource')?.path).toBe('/api/v1/right');
  });

  it('reuses a fresh successful read instead of hitting the provider repeatedly', async () => {
    home();
    const registry = new ConnectionRegistry();
    const id = save(registry);
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify({ value: 42 }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const first = await registry.invokeRead(id, 'get-resource');
    const second = await registry.invokeRead(id, 'get-resource');

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.message).toContain('Reused fresh provider result');
    expect(second.data).toEqual({ value: 42 });
    expect(calls).toBe(1);
  });

  it('invalidates cached reads after a provider mutation', async () => {
    home();
    const registry = new ConnectionRegistry();
    const id = save(registry);
    let calls = 0;
    globalThis.fetch = (async (input, init) => {
      calls += 1;
      const method = String(init?.method ?? 'GET');
      if (method === 'PUT') return new Response(JSON.stringify({ updated: true }), { status: 200, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ version: calls }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    await registry.invokeRead(id, 'get-resource');
    await registry.invokeRead(id, 'get-resource');
    expect(calls).toBe(1);

    await registry.invoke(id, 'update-resource', { enabled: true });
    expect(calls).toBe(2);

    await registry.invokeRead(id, 'get-resource');
    expect(calls).toBe(3);
  });

  it('does not poison an entire capability when only one path returns 404', async () => {
    home();
    const registry = new ConnectionRegistry();
    const id = save(registry);
    globalThis.fetch = (async () => new Response('{}', { status: 404 })) as typeof fetch;
    await registry.invokeRead(id, 'get-resource').catch(() => undefined);

    const resolution = registry.resolveConnectionOperation({
      connectionId: id,
      documented: true,
      operation: {
        id: 'get-resource-alternative',
        label: 'Get resource alternative',
        capability: 'resources.read',
        method: 'GET',
        path: '/api/v2/resources/current',
        risk: 'read',
      },
    });

    expect(resolution.resolution).toBe('discovered');
    expect(resolution.operation?.path).toBe('/api/v2/resources/current');
    expect(registry.capabilityStateOf(id).denied).not.toContain('resources.read');
  });
});
