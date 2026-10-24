import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConnectionRegistry } from '../src/connections/connections.js';
import { executeCoworkTool, type CoworkToolScope } from '../src/cowork/tools.js';
import { CoworkStore } from '../src/cowork/store.js';
import type { ToolContext } from '../src/tools/tools.js';
import { removeStoredKey } from '../src/llm/keys.js';

const previousHome = process.env.AGENT_GITU_HOME;
const originalFetch = globalThis.fetch;
const homes: string[] = [];
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (previousHome === undefined) delete process.env.AGENT_GITU_HOME;
  else process.env.AGENT_GITU_HOME = previousHome;
  for (const root of homes.splice(0)) rmSync(root, { recursive: true, force: true });
});
function setup() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'cowork-credential-'));
  homes.push(root);
  process.env.AGENT_GITU_HOME = root;
  const registry = new ConnectionRegistry();
  const store = new CoworkStore(path.join(root, 'cowork.json'));
  const agent = store.saveAgent({ name: 'Gitu', systemPrompt: 'Help.' });
  const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
  const scope = { store, agent, conversationId: conversation.id } as CoworkToolScope;
  const ctx = { connections: registry } as ToolContext;
  function save(id = 'coolify', baseUrl = 'https://coolify.example.test') {
    registry.save({ id, provider: 'coolify', label: id, baseUrl, token: 'private-fixture-token', capabilities: ['apps.read'],
      operations: [{ id: 'list-apps', label: 'List apps', capability: 'apps.read', method: 'GET', path: '/apps', risk: 'read' }] });
  }
  function request(params: Record<string, unknown> = {}) {
    return executeCoworkTool(ctx, 'request_credential', { prompt: 'Connect Coolify', provider: 'coolify', ...params },
      { allowShell: false, allowWrites: false, allowConfig: false, chief: false, browser: false }, scope);
  }
  return { root, registry, store, conversation, scope, ctx, save, request };
}
describe('Cowork saved credential reuse', () => {
  it('prefills known API settings and edits the same pending card instead of duplicating it', async () => {
    const s=setup();
    expect((await s.request({baseUrl:'https://first.example.test',label:'My Coolify'})).ok).toBe(true);
    const card=s.store.requests(s.conversation.id)[0]!;
    expect(card.credential).toMatchObject({providerHint:'coolify',baseUrl:'https://first.example.test',validationPath:'/api/v1/servers',documentationUrl:'https://coolify.io/docs/api-reference'});
    expect((await s.request({baseUrl:'https://first.example.test',label:'Production Coolify'})).output).toContain('updated in place');
    expect((await s.request({requestId:card.id,baseUrl:'https://correct.example.test',validationPath:'/api/v1/teams/current'})).output).toContain('updated in place');
    expect(s.store.requests(s.conversation.id)).toHaveLength(1);
    expect(s.store.getRequest(card.id)?.credential?.baseUrl).toBe('https://correct.example.test');
    expect(new CoworkStore(path.join(s.root,'cowork.json')).getRequest(card.id)?.credential?.baseUrl).toBe('https://correct.example.test');
  });
  it('fills custom authentication metadata and refuses incomplete settings without asking the user to configure them',async()=>{
    const s=setup();
    expect((await s.request({provider:'custom',baseUrl:'https://custom.example.test'})).output).toContain('Fill validationPath');
    expect(s.store.requests(s.conversation.id)).toHaveLength(0);
    globalThis.fetch=(async()=>new Response('curl https://custom.example.test/me -H "X-API-Key: private-key"',{headers:{'content-type':'text/plain'}})) as typeof fetch;
    expect((await s.request({provider:'custom',baseUrl:'https://custom.example.test',validationPath:'/me',auth:{type:'header',header:'X-API-Key'},documentationUrl:'https://docs.example.test'})).ok).toBe(true);
    const card=s.store.requests(s.conversation.id)[0]!;expect(card.credential?.auth).toEqual({type:'header',header:'X-API-Key'});
    s.store.removeRequestCard(card.id);
    expect((await s.request({requestId:card.id,baseUrl:'https://other.example.test'})).ok).toBe(false);
    expect(s.store.requests(s.conversation.id)).toHaveLength(1);
  });
  it('does not edit another teammate’s credential card',async()=>{
    const s=setup();await s.request({baseUrl:'https://first.example.test'});const card=s.store.requests(s.conversation.id)[0]!;
    const other=s.store.saveAgent({name:'Other',systemPrompt:'Help'});s.scope.agent=other;
    expect((await s.request({requestId:card.id,baseUrl:'https://other.example.test'})).ok).toBe(false);
    expect(card.credential?.baseUrl).toBe('https://first.example.test');
  });
  it('researches a new custom API before asking for a key and retains the full documented route',async()=>{
    const s=setup();
    expect((await s.request({provider:'custom',baseUrl:'https://api.example.test',validationPath:'/me'})).output).toContain('documentationUrl');
    globalThis.fetch=(async()=>new Response('curl https://api.example.test/client/v4/me -H "Authorization: Bearer YOUR_TOKEN"',{headers:{'content-type':'text/plain'}})) as typeof fetch;
    expect((await s.request({provider:'custom',baseUrl:'https://api.example.test',validationPath:'/me',documentationUrl:'https://docs.example.test/api'})).ok).toBe(true);
    expect(s.store.requests(s.conversation.id)[0]?.credential?.validationPath).toBe('/client/v4/me');
  });
  it('distinguishes an unreachable API from a provider-rejected credential in fresh checks', async () => {
    const s = setup(); s.save();
    const perms = { allowShell: false, allowWrites: false, allowConfig: false, chief: false, browser: false };
    globalThis.fetch = (async () => { throw new TypeError('Network unavailable'); }) as typeof fetch;
    const unavailable = await executeCoworkTool(s.ctx, 'connection_test', { connectionId: 'coolify' }, perms, s.scope);
    expect(unavailable.ok).toBe(false);
    expect(JSON.parse(unavailable.output)).toMatchObject({ status: 'PROVIDER_UNREACHABLE', credentialRejected: false });
    globalThis.fetch = (async () => new Response('{}', { status: 401 })) as typeof fetch;
    const rejected = await executeCoworkTool(s.ctx, 'connection_test', { connectionId: 'coolify' }, perms, s.scope);
    expect(rejected.ok).toBe(false);
    expect(JSON.parse(rejected.output)).toMatchObject({ status: 'AUTH_INVALID', credentialRejected: true });
    expect(s.store.requests(s.conversation.id)).toEqual([]);
  });
  it('freshly tests a saved API and clears that teammate’s obsolete cards across chats without touching another teammate’s requests', async () => {
    const s = setup(); s.save();
    const another = s.store.saveConversation({ kind: 'dm', memberIds: [s.scope.agent.id] });
    const otherAgent = s.store.saveAgent({ name: 'Other', systemPrompt: 'Help.' });
    const otherChat = s.store.saveConversation({ kind: 'dm', memberIds: [otherAgent.id] });
    const cards = [s.conversation, another, otherChat].map(conv => s.store.addRequest({ conversationId: conv.id, agentId: conv.memberIds[0]!, kind: 'credential', title: 'Reconnect', detail: 'Old failure', credential: { providerHint: 'coolify', connectionId: 'coolify' } }));
    globalThis.fetch = (async () => new Response('{}', { status: 401 })) as typeof fetch;
    await expect(s.registry.validate('coolify')).rejects.toThrow('HTTP 401');
    globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch;
    const result = await executeCoworkTool(s.ctx, 'connection_test', { connectionId: 'coolify' }, { allowShell: false, allowWrites: false, allowConfig: false, chief: false, browser: false }, s.scope);
    expect(result.ok).toBe(true);
    expect(result.output).toContain('CONNECTED');
    expect(result.output).not.toContain('private-fixture-token');
    expect(cards.map(card => s.store.getRequest(card.id)?.status)).toEqual(['provided', 'provided', 'open']);
  });
  it.each([undefined, 'valid', 'unknown'] as const)('reuses a saved key with auth %s without posting a credential card', async (auth) => {
    const s = setup();
    s.save();
    if (auth) {
      const profile = s.registry.get('coolify')!;
      writeFileSync(path.join(s.root, 'Settings', 'connections.json'), JSON.stringify({ connections: [{ ...profile, authState: { status: auth } }] }));
    }
    const result = await s.request();
    expect(result.ok).toBe(false);
    expect(result.output).toContain('already has a credential');
    expect(result.output).toContain('connection_read');
    expect(result.output).not.toContain('private-fixture-token');
    expect(s.store.requests(s.conversation.id)).toEqual([]);
  });

  it.each([403, 404])('does not confuse a provider HTTP %i response with a lost key', async (status) => {
    const s = setup();
    s.save();
    globalThis.fetch = (async () => new Response('{}', { status })) as typeof fetch;
    await expect(s.registry.invokeRead('coolify', 'list-apps')).rejects.toThrow(`HTTP ${status}`);
    expect((await s.request()).output).toContain('already has a credential');
    expect(s.store.requests(s.conversation.id)).toEqual([]);
  });

  it('posts a reconnect card for an actual 401, retaining the saved endpoint and exact profile id', async () => {
    const s = setup();
    s.save('production');
    globalThis.fetch = (async () => new Response('{}', { status: 401 })) as typeof fetch;
    await expect(s.registry.invokeRead('production', 'list-apps')).rejects.toThrow('HTTP 401');
    expect((await s.request({ connectionId: 'production' })).ok).toBe(true);
    expect(s.store.requests(s.conversation.id)[0]?.credential).toMatchObject({ connectionId: 'production', baseUrl: 'https://coolify.example.test', validationPath: '/apps' });
  });

  it('clears the requesting teammate’s obsolete reconnect card after the saved key verifies', async () => {
    const s = setup(); s.save();
    const card = s.store.addRequest({ conversationId: s.conversation.id, agentId: s.conversation.memberIds[0]!, kind: 'credential', title: 'Reconnect', detail: 'Old failure', credential: { providerHint: 'coolify', connectionId: 'coolify' } });
    const profile = s.registry.get('coolify')!;
    writeFileSync(path.join(s.root, 'Settings/connections.json'), JSON.stringify({ connections: [{ ...profile, authState: { status: 'invalid', checkedAt: '2000-01-01T00:00:00.000Z' } }] }));
    globalThis.fetch = (async () => new Response('{"account":"fixture"}', { status: 200 })) as typeof fetch;
    expect((await s.request()).output).toContain('already has a credential');
    expect(s.store.getRequest(card.id)?.status).toBe('provided');
    expect(s.store.requests(s.conversation.id)).toHaveLength(1);
  });

  it('posts a reconnect card when the credential is actually missing, and a new card for a different server', async () => {
    const s = setup();
    s.save();
    removeStoredKey('GITU_CONNECTION_COOLIFY');
    expect((await s.request()).ok).toBe(true);
    expect(s.store.requests(s.conversation.id)[0]?.credential?.connectionId).toBe('coolify');
    expect((await s.request({ baseUrl: 'https://other.example.test', label: 'Other server' })).ok).toBe(true);
    expect(s.store.requests(s.conversation.id)[1]?.credential?.connectionId).toBeUndefined();
  });

  it('resolves a provider alias but lets the agent select between saved accounts without requesting their keys again', async () => {
    const s = setup();
    s.save('production');
    expect((await s.request({ connectionId: 'Coolify' })).output).toContain('connectionId "production"');
    s.save('staging', 'https://staging.example.test');
    expect((await s.request()).output).toContain('Multiple saved connections match');
    expect((await s.request({ connectionId: 'staging' })).output).toContain('connectionId "staging"');
    expect(s.store.requests(s.conversation.id)).toEqual([]);
  });

  it('reports storage trouble without pretending the keys are missing or posting a replacement form', async () => {
    const s = setup();
    s.save();
    for (const file of ['keys.json', 'keys.json.bak']) writeFileSync(path.join(s.root, 'Settings', file), '{broken');
    const result = await s.request({ baseUrl: 'https://coolify.example.test' });
    expect(result.ok).toBe(false);
    expect(result.output).toContain('Saved connection storage');
    expect(s.store.requests(s.conversation.id)).toEqual([]);
  });
});
