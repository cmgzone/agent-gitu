import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ConnectionRegistry } from '../src/connections/connections.js';
import { loadStoredKeys } from '../src/llm/keys.js';

const originalHome = process.env.AGENT_GITU_HOME;
const homes: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  if (originalHome === undefined) delete process.env.AGENT_GITU_HOME;
  else process.env.AGENT_GITU_HOME = originalHome;
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});
function fixture(provider = 'custom-api') {
  const home = mkdtempSync(path.join(tmpdir(), 'universal-auth-')); homes.push(home); process.env.AGENT_GITU_HOME = home;
  const registry = new ConnectionRegistry();
  const draft = { id: 'account', provider, label: 'Account', baseUrl: 'https://api.example.test', token: 'fixture-private-key', capabilities: ['account.read'], operations: [{ id: 'validate', label: 'Legacy homepage', capability: 'account.read', method: 'GET' as const, path: '/', risk: 'read' as const }, { id: 'me', label: 'Authenticated account', capability: 'account.read', method: 'GET' as const, path: '/api/me', risk: 'read' as const }] };
  registry.save(draft);
  const stale = () => { const file = path.join(home, 'Settings/connections.json'), data = JSON.parse(readFileSync(file, 'utf8')); data.connections[0].authState = { status: 'invalid', reason: 'Old HTTP 401', checkedAt: '2000-01-01T00:00:00.000Z' }; writeFileSync(file, JSON.stringify(data)); };
  return { home, registry, draft, stale };
}

it.each(['custom-api', 'coolify', 'mailcow'])('rechecks stale 401 evidence using the saved credential for %s', async provider => {
  const f = fixture(provider); f.stale();
  const network = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
    const headers = new Headers(options?.headers);
    expect(headers.get(provider === 'mailcow' ? 'X-API-Key' : 'authorization')).toBe(provider === 'mailcow' ? f.draft.token : 'Bearer ' + f.draft.token);
    expect(String(_url)).toBe('https://api.example.test/api/me');
    return new Response('{"account":"fixture"}', { status: 200 });
  });
  expect((await f.registry.resolveAndExecuteRead({ connectionId: 'account', operationId: 'me' })).ok).toBe(true);
  expect(f.registry.authStateOf('account').status).toBe('valid');
  expect(network).toHaveBeenCalledTimes(2);
});

it('repairs a rejected test with an existing corrected GET without requesting another key',async()=>{
 const f=fixture();f.registry.save({...f.draft,operations:[{...f.draft.operations[0]!,path:'/user/tokens/verify'},{...f.draft.operations[1]!,path:'/client/v4/user/tokens/verify'}]});
 const network=vi.spyOn(globalThis,'fetch').mockImplementation(async(url)=>new Response('{}',{status:String(url).includes('/client/v4/')?200:404}));
 expect((await f.registry.validate('account')).status).toBe(200);
 expect(network.mock.calls.map(call=>String(call[0]))).toEqual(['https://api.example.test/user/tokens/verify','https://api.example.test/client/v4/user/tokens/verify']);
 expect(f.registry.get('account')?.operations.find(op=>op.id==='validate')?.path).toBe('/client/v4/user/tokens/verify');
 network.mockClear();expect((await f.registry.validate('account')).status).toBe(200);expect(network).toHaveBeenCalledOnce();
 expect(loadStoredKeys()['GITU_CONNECTION_ACCOUNT']).toBe(f.draft.token);
});

it('skips previously rejected paths across aliases and never falls back after a 401',async()=>{
 const f=fixture();const missing={...f.draft.operations[0]!,path:'/wrong'};f.registry.save({...f.draft,operations:[missing,{...missing,id:'wrong-alias'},f.draft.operations[1]!]});
 f.registry.recordRejectedOperation('account',{operationId:'another-name',method:'GET',path:'/wrong',capability:'account.read',status:404});
 const network=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('{}',{status:401}));
 await expect(f.registry.validate('account')).rejects.toMatchObject({state:'AUTH_INVALID'});expect(network).toHaveBeenCalledOnce();expect(String(network.mock.calls[0]?.[0])).toBe('https://api.example.test/api/me');
 expect(f.registry.get('account')?.operations.find(op=>op.id==='validate')?.path).toBe('/api/me');
});

it('retries one transient connection failure for a safe GET and never replays a write',async()=>{
 const f=fixture();const error=Object.assign(new TypeError('fetch failed'),{cause:{code:'UND_ERR_CONNECT_TIMEOUT'}});
 const network=vi.spyOn(globalThis,'fetch').mockRejectedValueOnce(error).mockResolvedValueOnce(new Response('{}',{status:200}));
 expect((await f.registry.invokeRead('account','me')).ok).toBe(true);expect(network).toHaveBeenCalledTimes(2);
 const operation={id:'write',label:'Create item',capability:'account.read',method:'POST' as const,path:'/items',risk:'reversible-write' as const};
 f.registry.save({...f.registry.get('account')!,operations:[...f.registry.get('account')!.operations,operation]});
 network.mockReset().mockRejectedValue(error);
 await expect(f.registry.invoke('account','write',{})).rejects.toMatchObject({state:'PROVIDER_UNREACHABLE',outcome:'sent-unknown'});expect(network).toHaveBeenCalledOnce();
});

it('coalesces stale authentication checks and does not repeatedly retry a freshly rejected key', async () => {
  const f = fixture(); f.stale();
  const network = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{"message":"Unauthenticated"}', { status: 401 }));
  const first = await Promise.allSettled(Array.from({ length: 3 }, () => f.registry.resolveAndExecuteRead({ connectionId: 'account', operationId: 'me' })));
  expect(first.every(result => result.status === 'rejected')).toBe(true);
  expect(network).toHaveBeenCalledOnce();
  await expect(f.registry.resolveAndExecuteRead({ connectionId: 'account', operationId: 'me' })).rejects.toMatchObject({ state: 'AUTH_INVALID', authEvident: true });
  expect(network).toHaveBeenCalledOnce();
});

it('does not let a late 401 from the old key invalidate a replacement key', async () => {
  const f = fixture(); let release!: (response: Response) => void;
  vi.spyOn(globalThis, 'fetch').mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const oldRequest = f.registry.invokeRead('account', 'me');
  f.registry.save({ ...f.draft, token: 'replacement-private-key' });
  release(new Response('{"message":"Unauthenticated"}', { status: 401 }));
  await expect(oldRequest).rejects.toMatchObject({ state: 'AUTH_INVALID' });
  expect(f.registry.authStateOf('account').status).toBe('unknown');
  expect(f.registry.get('account')?.lastValidationStatus).toBeUndefined();
});

it('rejects homepage-only validation and HTML login pages without declaring the key invalid', async () => {
  const f = fixture();
  f.registry.save({ ...f.draft, operations: [f.draft.operations[0]] });
  const network = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('<!doctype html><html>Sign in</html>', { status: 200, headers: { 'content-type': 'text/html' } }));
  await expect(f.registry.validate('account')).rejects.toThrow('authenticated API GET endpoint');
  expect(network).not.toHaveBeenCalled();
  f.registry.save(f.draft);
  await expect(f.registry.validate('account')).rejects.toThrow('web/login page');
  expect(f.registry.authStateOf('account').status).toBe('unknown');
});

it('clears credential-specific scope rejections when a replacement key is saved', async () => {
  const f = fixture();
  const network = vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => new Response('{}', { status: 403 })).mockImplementation(async () => new Response('{"account":"fixture"}', { status: 200 }));
  await expect(f.registry.invokeRead('account', 'me')).rejects.toMatchObject({ state: 'CONNECTED_INSUFFICIENT_SCOPE' });
  expect(f.registry.authStateOf('account').status).toBe('valid');
  f.registry.save({ ...f.draft, token: 'replacement-private-key' });
  expect((await f.registry.resolveAndExecuteRead({ connectionId: 'account', operationId: 'me' })).ok).toBe(true);
  expect(network).toHaveBeenCalledTimes(2);
});

it.each(['Bearer "9|fixture-complete-token"', '"Authorization: Bearer 9|fixture-complete-token"'])('normalizes pasted Coolify Bearer syntax while preserving the complete token: %s', async token => {
  const f = fixture('coolify');
  f.registry.save({ ...f.draft, token });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
    expect(new Headers(options?.headers).get('authorization')).toBe('Bearer 9|fixture-complete-token');
    return new Response('{}');
  });
  expect((await f.registry.validate('account')).ok).toBe(true);
  expect(loadStoredKeys()['GITU_CONNECTION_ACCOUNT']).toBe('9|fixture-complete-token');
  expect(JSON.stringify(f.registry.list())).not.toContain('fixture-complete-token');
});

it('persists custom API-key headers across metadata edits and clears failures when authentication settings change', async () => {
  const f = fixture();
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
    const headers = new Headers(options?.headers);
    return new Response('{}', { status: headers.get('X-API-Key') === f.draft.token ? 200 : 401 });
  });
  await expect(f.registry.validate('account')).rejects.toMatchObject({ state: 'AUTH_INVALID' });
  const { token: _token, ...metadata } = f.draft;
  f.registry.save({ ...metadata, auth: { type: 'header', header: 'X-API-Key' } });
  expect(f.registry.authStateOf('account').status).toBe('unknown');
  expect((await f.registry.resolveAndExecuteRead({ connectionId: 'account', operationId: 'me' })).ok).toBe(true);
  f.registry.rememberCapabilities('account', [], 'https://example.test/docs');
  expect(new ConnectionRegistry().get('account')?.auth).toEqual({ type: 'header', header: 'X-API-Key' });
  expect(loadStoredKeys()['GITU_CONNECTION_ACCOUNT']).toBe(f.draft.token);
});

it('supports a documented custom Authorization scheme without doubling its prefix', async () => {
  const f = fixture();
  f.registry.save({ ...f.draft, auth: { type: 'header', header: 'Authorization', prefix: 'ApiKey' }, token: 'ApiKey private-fixture-key' });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
    expect(new Headers(options?.headers).get('authorization')).toBe('ApiKey private-fixture-key');
    return new Response('{}');
  });
  expect((await f.registry.validate('account')).ok).toBe(true);
});

it('rejects malformed authentication settings before changing credentials or sending a request', () => {
  const f = fixture();
  expect(() => f.registry.save({ ...f.draft, token: 'private\r\nInjected: value' })).toThrow(/complete API key/);
  expect(() => f.registry.save({ ...f.draft, auth: { type: 'header', header: 'Cookie' } })).toThrow(/authentication header/);
  expect(() => f.registry.save({ ...f.draft, auth: { type: 'header', header: 'X-API-Key', prefix: 'bad\nvalue' } })).toThrow(/prefix/);
  expect(loadStoredKeys()['GITU_CONNECTION_ACCOUNT']).toBe(f.draft.token);
});
