import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionRegistry } from '../src/connections/connections.js';
import { toolWebSearch, validateToolParams } from '../src/tools/tools.js';
import { executeCoworkTool, coworkNativeTools } from '../src/cowork/tools.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { CompanyStore } from '../src/company/store.js';
import { companyPolicy } from '../src/company/policy.js';

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function setup(provider = 'brave') {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-api-search-'));
  roots.push(root);
  vi.stubEnv('AGENT_GITU_HOME', root);
  const registry = new ConnectionRegistry();
  const profile = registry.save({
    label: 'Research',
    provider,
    baseUrl: provider === 'brave' ? 'https://api.search.brave.com' : 'https://api.tavily.com',
    token: 'fixture-private-search-key',
    capabilities: ['web.search'],
    operations: [{ id: 'validate', label: 'Check search API', capability: 'web.search', method: 'GET', path: '/', risk: 'read' }],
  });
  return { root, registry, profile, ctx: { cwd: root, guard: new ProjectGuard(root), connections: registry } };
}
describe('API-first public research', () => {
  it('uses Brave API transport, normalizes source links and keeps reflected credentials out of results', async () => {
    const f = setup(),
      fetch = vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              web: {
                results: [
                  { title: 'Reference', url: 'https://example.test/doc', description: 'fixture-private-search-key' },
                  { title: 'Bad', url: 'javascript:alert(1)' },
                ],
              },
            }),
            { headers: { 'content-type': 'application/json' } },
          ),
      );
    vi.stubGlobal('fetch', fetch);
    const result = await toolWebSearch(f.ctx, { query: 'Product documentation', count: 3 });
    expect(result.ok).toBe(true);
    expect(result.output).toContain('https://example.test/doc');
    expect(result.output).not.toContain('fixture-private-search-key');
    expect(result.output).not.toContain('javascript:');
    const [url, options] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.origin).toBe('https://api.search.brave.com');
    expect(url.searchParams.get('q')).toBe('Product documentation');
    expect(options.redirect).toBe('error');
    expect(options.headers).toHaveProperty('X-Subscription-Token', 'fixture-private-search-key');
  });
  it('uses Tavily read-only search POST and validates without opening a browser', async () => {
    const f = setup('tavily'),
      fetch = vi.fn(async () => new Response(JSON.stringify({ results: [] }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetch);
    expect((await f.registry.validate(f.profile.id)).ok).toBe(true);
    const [url, options] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe('https://api.tavily.com/search');
    expect(options.method).toBe('POST');
    expect(JSON.parse(String(options.body))).toMatchObject({ query: 'Agent Gitu', max_results: 1, include_answer: false, include_raw_content: false });
    expect(f.registry.get(f.profile.id)?.lastValidationStatus).toBe('ok');
    const read = await f.registry.invokeRead(f.profile.id, 'validate', { q: 'Registered search read' });
    expect(read.ok).toBe(true);
    const readOptions = fetch.mock.calls[1]![1] as RequestInit;
    expect(JSON.parse(String(readOptions.body))).toMatchObject({ query: 'Registered search read' });
    await expect(f.registry.invokeRead(f.profile.id, 'validate')).rejects.toThrow('Use web_search');
    expect(f.registry.get(f.profile.id)?.authState?.status).toBe('valid');
  });
  it('enforces company grants and revocation, and never silently selects between multiple accounts', async () => {
    const f = setup();
    let allowed = true;
    const scoped = f.registry.scoped(() => allowed),
      fetch = vi.fn(async () => {
        allowed = false;
        return new Response(JSON.stringify({ web: { results: [{ url: 'https://private-result.test' }] } }), { headers: { 'content-type': 'application/json' } });
      });
    vi.stubGlobal('fetch', fetch);
    const result = await toolWebSearch({ ...f.ctx, connections: scoped }, { query: 'Research' });
    expect(result.ok).toBe(false);
    expect(result.output).toContain('revoked');
    expect(result.output).not.toContain('private-result');
    expect((await toolWebSearch({ ...f.ctx, connections: scoped }, { query: 'Research', connectionId: f.profile.id })).ok).toBe(false);
    expect(fetch).toHaveBeenCalledOnce();
    f.registry.save({
      label: 'Second account',
      provider: 'brave',
      baseUrl: 'https://api.search.brave.com',
      token: 'second-private-key',
      capabilities: ['web.search'],
      operations: [{ id: 'validate', label: 'Search', capability: 'web.search', method: 'GET', path: '/', risk: 'read' }],
    });
    expect((await toolWebSearch(f.ctx, { query: 'Research' })).output).toContain('Multiple search APIs');
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('rejects substituted endpoints and handles authentication failures without exposing provider errors', async () => {
    const f = setup(),
      fetch = vi.fn(async () => new Response('sensitive provider text', { status: 403 }));
    vi.stubGlobal('fetch', fetch);
    let result = await toolWebSearch(f.ctx, { query: 'Research', connectionId: f.profile.id });
    expect(result.output).toContain('permissions');
    expect(result.output).not.toContain('sensitive');
    expect(f.registry.get(f.profile.id)?.authState?.status).not.toBe('invalid');
    fetch.mockImplementation(async () => new Response('credential reflection', { status: 401 }));
    result = await toolWebSearch(f.ctx, { query: 'Research', connectionId: f.profile.id });
    expect(result.output).toContain('Update its key');
    expect(f.registry.get(f.profile.id)?.authState?.status).toBe('invalid');
    f.registry.save({ ...f.profile, baseUrl: 'https://other-provider.test', token: 'fixture-private-search-key' });
    fetch.mockClear();
    result = await toolWebSearch(f.ctx, { query: 'Research', connectionId: f.profile.id });
    expect(result.ok).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
    expect(validateToolParams('web_search', { query: 'x', count: 100 }).valid).toBe(false);
  });
  it('runs Company research with browser and shell disabled and no private computer', async () => {
    const f = setup(),
      store = new CompanyStore(f.root);
    try {
      const company = store.create({ purpose: 'Research', monthlyBudgetUsd: null, maxFileBytes: null });
      store.update(company.id, { leadId: 'lead', connectionIds: [f.profile.id] });
      store.transition(company.id, 'running');
      const policy = companyPolicy(store, company.id, 'lead', 0),
        computerFor = vi.fn(() => {
          throw Error('Computer should not be provisioned for API research');
        });
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify({ web: { results: [] } }), { headers: { 'content-type': 'application/json' } })),
      );
      const scope = { agent: { id: 'lead', companyId: company.id }, computerFor } as never;
      const result = await executeCoworkTool(
        { ...f.ctx, connections: f.registry.scoped((id) => store.get(company.id)?.connectionIds.includes(id) ?? false), authorizeTool: policy.authorize },
        'web_search',
        { query: 'Research' },
        { allowShell: false, allowWrites: false, allowConfig: false, browser: false, chief: false },
        scope,
      );
      expect(result.ok).toBe(true);
      expect(computerFor).not.toHaveBeenCalled();
      expect((await policy.authorize('web_search', { connectionId: 'another-company' }))?.output).toContain('not granted');
      expect(coworkNativeTools({ allowShell: false, allowWrites: false, allowConfig: false, chiefOfStaff: false }, false).some((tool) => tool.name === 'web_search')).toBe(true);
    } finally {
      store.close();
    }
  });
});
