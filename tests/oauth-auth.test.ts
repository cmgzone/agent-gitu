import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ConnectionRegistry, ConnectionInvocationError } from '../src/connections/connections.js';
import { CONTABO_TOKEN_URL, encodeStructuredCredentials, normalizeStructuredAuth, structuredAuthHeaders } from '../src/connections/structured-auth.js';
import { documentedConnectionSetup } from '../src/connections/setup-research.js';

const homes: string[] = [];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true }); });
const values = { client_id: 'fixture-client', client_secret: 'fixture-client-private', api_user: 'fixture@example.test', api_password: 'fixture-api-p&ss+=word' };
function fixture() {
  const home = mkdtempSync(path.join(os.tmpdir(), 'gitu-contabo-auth-')); homes.push(home); vi.stubEnv('AGENT_GITU_HOME', home);
  const auth = normalizeStructuredAuth({ type: 'oauth2', tokenPath: '/incorrect/legacy/token', fields: [
    { id: 'client_id', label: 'Client ID', secret: false }, { id: 'client_secret', label: 'Client secret' },
    { id: 'api_user', label: 'API username', secret: false, inputType: 'email' }, { id: 'api_password', label: 'API password' },
  ] });
  const registry = new ConnectionRegistry();
  registry.save({ id: 'contabo-existing', provider: 'api-api-contabo-com', label: 'Contabo', baseUrl: 'https://api.contabo.com', auth, token: encodeStructuredCredentials(auth, values), capabilities: ['instances.read'], operations: [{ id: 'validate', label: 'List instances', capability: 'instances.read', method: 'GET', path: '/v1/compute/instances', risk: 'read' }] });
  // Reproduce metadata saved by the old release without touching its vault.
  const file = path.join(home, 'Settings', 'connections.json'), metadata = JSON.parse(readFileSync(file, 'utf8'));
  metadata.connections[0].auth = auth; writeFileSync(file, JSON.stringify(metadata));
  return { home, registry };
}
const token = (name = 'fixture-access-private', refresh = 'fixture-refresh-private') => new Response(JSON.stringify({ access_token: name, token_type: 'Bearer', expires_in: 60, ...(refresh ? { refresh_token: refresh, refresh_expires_in: 300 } : {}) }));
const instances = () => new Response(JSON.stringify({ data: [], _links: { self: '/v1/compute/instances' } }));

it('repairs the existing Contabo profile, retrieves encrypted credentials and verifies the documented read', async () => {
  const { registry, home } = fixture();
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url) === CONTABO_TOKEN_URL) {
      expect(init?.method).toBe('POST'); expect(init?.redirect).toBe('error');
      expect(new Headers(init?.headers).get('content-type')).toBe('application/x-www-form-urlencoded');
      const body = new URLSearchParams(String(init?.body));
      expect(Object.fromEntries(body)).toEqual({ grant_type: 'password', username: values.api_user, password: values.api_password, client_id: values.client_id, client_secret: values.client_secret });
      return token();
    }
    expect(String(url)).toBe('https://api.contabo.com/v1/compute/instances'); expect(init?.method).toBe('GET');
    const headers = new Headers(init?.headers);
    expect(headers.get('authorization')).toBe('Bearer fixture-access-private');
    expect(headers.get('x-request-id')).toMatch(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
    return new Response(JSON.stringify({ data: [], echo: Object.values(values).concat('fixture-access-private', 'fixture-refresh-private') }));
  });
  const result = await registry.validate('contabo-existing');
  expect(result.status).toBe(200); expect(fetcher).toHaveBeenCalledTimes(2);
  expect(registry.authStateOf('contabo-existing').status).toBe('valid');
  const profile = registry.get('contabo-existing')!;
  expect(profile.auth).toMatchObject({ grantType: 'password', tokenUrl: CONTABO_TOKEN_URL, usernameField: 'api_user', passwordField: 'api_password' });
  registry.save({ ...profile, label: 'Existing Contabo account' });
  expect(registry.list()).toHaveLength(1); expect(registry.list()[0]?.hasCredential).toBe(true);
  for (const secret of [...Object.values(values), 'fixture-access-private', 'fixture-refresh-private']) {
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(readFileSync(path.join(home, 'Settings', 'keys.json'), 'utf8')).not.toContain(secret);
    expect(readFileSync(path.join(home, 'Settings', 'connections.json'), 'utf8')).not.toContain(secret);
    expect(JSON.stringify(registry.list())).not.toContain(secret);
  }
  await registry.validate('contabo-existing'); expect(fetcher).toHaveBeenCalledTimes(3);
});

it.each([
  ['invalid_grant', 400, 'INVALID_CREDENTIALS', 'AUTH_INVALID'],
  ['invalid_client', 401, 'INVALID_CREDENTIALS', 'AUTH_INVALID'],
  ['unsupported_grant_type', 400, 'CONFIG_INVALID', 'CONFIG_INVALID'],
  ['invalid_scope', 400, 'CONFIG_INVALID', 'CONFIG_INVALID'],
  ['server_error', 503, 'TOKEN_ENDPOINT_FAILED', 'PROVIDER_UNREACHABLE'],
  ['rate_limited', 429, 'TOKEN_ENDPOINT_FAILED', 'PROVIDER_UNREACHABLE'],
  ['missing_endpoint', 404, 'CONFIG_INVALID', 'CONFIG_INVALID'],
])('classifies OAuth %s without reflecting provider credential echoes', async (code, status, expectedCode, state) => {
  const { registry } = fixture();
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: code, error_description: JSON.stringify(values) + ' fixture-access-private' }), { status }));
  const error = await registry.validate('contabo-existing').catch(error => error);
  expect(error).toBeInstanceOf(ConnectionInvocationError); expect(error).toMatchObject({ state, outcome: 'not-run' });
  expect(error.message).toContain('[' + expectedCode + ']'); expect(error.message).toContain('No API operation was sent');
  for (const secret of [...Object.values(values), 'fixture-access-private']) expect(error.message).not.toContain(secret);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each(['network', 'invalid-json', 'missing-token', 'wrong-token-type', 'oversized'])('sanitizes token endpoint %s failures and sends no API operation', async mode => {
  const { registry } = fixture();
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    if (mode === 'network') throw Error('Network failure containing ' + values.client_secret);
    if (mode === 'invalid-json') return new Response('<html>' + values.api_password + '</html>');
    if (mode === 'missing-token') return new Response('{}');
    if (mode === 'wrong-token-type') return new Response(JSON.stringify({ access_token: 'fixture-private', token_type: 'Basic' }));
    return new Response('x'.repeat(65537));
  });
  const error = await registry.validate('contabo-existing').catch(error => error);
  expect(error).toBeInstanceOf(ConnectionInvocationError);
  expect(error.message).toContain(mode === 'network' ? '[NETWORK_ERROR]' : '[TOKEN_RESPONSE_INVALID]');
  expect(error.message).not.toContain(values.client_secret); expect(error.message).not.toContain(values.api_password);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('coalesces concurrent token exchanges, refreshes expiry, then reauthenticates if refresh is rejected', async () => {
  const { registry } = fixture(); let now = Date.now(), passwordGrants = 0, refreshes = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url) !== CONTABO_TOKEN_URL) return instances();
    const body = new URLSearchParams(String(init?.body));
    if (body.get('grant_type') === 'refresh_token') {
      refreshes++; expect(body.has('username')).toBe(false); expect(body.has('password')).toBe(false);
      expect(body.get('client_secret')).toBe(values.client_secret);
      return refreshes === 1 ? token('fixture-access-refreshed', 'fixture-refresh-rotated') : new Response('{"error":"invalid_grant"}', { status: 400 });
    }
    passwordGrants++; return token('fixture-access-' + passwordGrants);
  });
  await Promise.all([registry.validate('contabo-existing'), registry.validate('contabo-existing')]);
  expect(passwordGrants).toBe(1); expect(fetcher).toHaveBeenCalledTimes(3);
  now += 61000; await registry.validate('contabo-existing'); expect(refreshes).toBe(1); expect(passwordGrants).toBe(1);
  now += 61000; await registry.validate('contabo-existing'); expect(refreshes).toBe(2); expect(passwordGrants).toBe(2);
});

it('reauthenticates after expiry without a refresh token and invalidates cache when saved credentials change', async () => {
  const { registry } = fixture(); let now = Date.now(), grants = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(globalThis, 'fetch').mockImplementation(async url => String(url) === CONTABO_TOKEN_URL ? (grants++, token('fixture-access-' + grants, '')) : instances());
  await registry.validate('contabo-existing'); now += 61000; await registry.validate('contabo-existing'); expect(grants).toBe(2);
  const profile = registry.get('contabo-existing')!, auth = profile.auth as ReturnType<typeof normalizeStructuredAuth>;
  registry.save({ ...profile, token: encodeStructuredCredentials(auth, { ...values, api_password: 'fixture-new-private-password' }) });
  await registry.validate('contabo-existing'); expect(grants).toBe(3);
});

it('refreshes a rejected cached token once for a read, while never replaying a write', async () => {
  const { registry } = fixture(); let grants = 0, reads = 0, writes = 0;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    if (String(url) === CONTABO_TOKEN_URL) return token('fixture-access-' + ++grants, '');
    if (init?.method === 'POST') { writes++; return new Response('{}', { status: 401 }); }
    return ++reads === 1 ? new Response('{}', { status: 401 }) : instances();
  });
  await registry.validate('contabo-existing'); expect(grants).toBe(2); expect(reads).toBe(2);
  const error = await registry.invokeOperation('contabo-existing', { id: 'write-fixture', label: 'Write', method: 'POST', path: '/fixture', risk: 'reversible-write', capability: 'fixture.write' }, {}).catch(error => error);
  expect(error.state).toBe('AUTH_EXPIRED'); expect(writes).toBe(1); expect(grants).toBe(2);
});

it('supports generic documented identity-provider URLs, mappings and Basic client authentication', async () => {
  const auth = normalizeStructuredAuth({ type: 'oauth2', grantType: 'password', tokenUrl: 'https://identity.example.test/oauth/token', usernameField: 'api_user', passwordField: 'api_password', clientAuthentication: 'basic', fields: Object.keys(values).map(id => ({ id, label: id })) });
  expect(auth.tokenUrl).toBe('https://identity.example.test/oauth/token');
  const headers = await structuredAuthHeaders(auth, encodeStructuredCredentials(auth, values), 'https://api.example.test', async (url, init) => {
    expect(String(url)).toBe(auth.tokenUrl);
    const body = new URLSearchParams(String(init.body));
    expect(body.get('username')).toBe(values.api_user); expect(body.get('password')).toBe(values.api_password);
    expect(body.has('client_id')).toBe(false); expect(body.has('client_secret')).toBe(false);
    expect(new Headers(init.headers).get('authorization')).toBe('Basic ' + Buffer.from('fixture-client:fixture-client-private').toString('base64'));
    return token();
  }, []);
  expect(headers.authorization).toBe('Bearer fixture-access-private');
  const documentation = 'OAuth2 grant_type=password https://api.example.test/v1/account https://identity.example.test/oauth/token';
  expect(documentedConnectionSetup('https://api.example.test', '/v1/account', documentation, auth).baseUrl).toBe('https://api.example.test');
  expect(() => documentedConnectionSetup('https://api.example.test', '/v1/account', documentation.replace('/oauth/token', '/oauth/token-imposter'), auth)).toThrow('exact OAuth token URL');
  for (const endpoint of ['http://identity.example.test/token', 'https://owner:secret@identity.example.test/token', 'https://identity.example.test/token?secret=value', 'https://identity.example.test/token#fragment']) expect(() => normalizeStructuredAuth({ ...auth, tokenUrl: endpoint })).toThrow();
});
