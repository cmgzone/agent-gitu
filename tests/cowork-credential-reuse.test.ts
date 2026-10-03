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
  return { root, registry, store, conversation, save, request };
}
describe('Cowork saved credential reuse', () => {
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
