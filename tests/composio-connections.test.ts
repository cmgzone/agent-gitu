import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComposioConnections, ComposioKeyStore } from '../src/connections/composio.js';
import { executeCoworkTool, type CoworkToolScope } from '../src/cowork/tools.js';
import { CoworkStore } from '../src/cowork/store.js';
import { GituServer } from '../src/server/server.js';
import type { ToolContext } from '../src/tools/tools.js';

type Client = ReturnType<NonNullable<ConstructorParameters<typeof ComposioConnections>[2]>>;
class MemoryKeys extends ComposioKeyStore {
  value?: string;
  override get configured() {
    return Boolean(this.value);
  }
  override read() {
    return this.value;
  }
  override save(value: string) {
    this.value = value;
  }
}
const previous = process.env['AGENT_GITU_HOME'];
afterEach(() => {
  if (previous === undefined) delete process.env['AGENT_GITU_HOME'];
  else process.env['AGENT_GITU_HOME'] = previous;
});
function fixture() {
  process.env['AGENT_GITU_HOME'] = mkdtempSync(path.join(tmpdir(), 'gitu-composio-'));
  const keys = new MemoryKeys();
  keys.value = 'fixture-key';
  const execute = vi.fn(async () => ({ data: { done: true } }));
  const toolkits = vi.fn(async () => ({ items: [{ slug: 'gmail', name: 'Gmail', connection: { connectedAccount: { status: 'ACTIVE', id: 'own' } } }], cursor: 'next' }));
  const authorize = vi.fn(async () => ({ redirectUrl: 'https://connect.composio.dev/link' }));
  const create = vi.fn(async () => ({ sessionId: 'test-session', toolkits, authorize }));
  const list = vi.fn(async () => ({
    items: [{ id: 'own', toolkit: { slug: 'gmail' }, status: 'ACTIVE', isDisabled: false, data: { accessToken: 'never-expose-me' } }],
    nextCursor: null,
  }));
  const revoke = vi.fn(async () => ({}));
  const raw = vi.fn(async () => [{ slug: 'GMAIL_SEND', name: 'Send mail', description: 'Send', inputParameters: {}, toolkit: { slug: 'gmail' } }]);
  const withOptions = vi.fn(() => ({ toolRouter: { session: { execute } } }));
  const client = {
    sessions: { create, use: create },
    connectedAccounts: { list, revoke },
    tools: { getRawComposioTools: raw },
    toolkits: { get: vi.fn(async () => ({})) },
    getClient: () => ({ withOptions }),
  } as unknown as Client;
  const apps = new ComposioConnections(
    () => 'owner-uuid',
    keys,
    () => client,
  );
  return { apps, keys, create, list, revoke, raw, execute, authorize, toolkits, withOptions };
}

describe('Composio connections', () => {
  it('encrypts hosted keys, restores them after restart, and rejects changed ciphertext or encryption keys', () => {
    fixture();
    vi.stubEnv('COMPOSIO_API_KEY', '');
    vi.stubEnv('AGENT_GITU_SECRETS_KEY', 'a'.repeat(64));
    try {
      const keys = new ComposioKeyStore('linux');
      expect(keys.canSave).toBe(true);
      keys.save('disposable-hosted-composio-secret');
      const file = path.join(process.env['AGENT_GITU_HOME']!, 'Settings', 'composio-key.encrypted.json');
      const stored = readFileSync(file, 'utf8');
      expect(stored).not.toContain('disposable-hosted-composio-secret');
      expect(new ComposioKeyStore('linux').read()).toBe('disposable-hosted-composio-secret');
      writeFileSync(file, '{interrupted');
      expect(new ComposioKeyStore('linux').read()).toBe('disposable-hosted-composio-secret');
      keys.save('disposable-hosted-composio-secret');
      expect(new ComposioKeyStore('linux').read()).toBe('disposable-hosted-composio-secret');
      writeFileSync(file, stored);
      vi.stubEnv('AGENT_GITU_SECRETS_KEY', 'b'.repeat(64));
      expect(() => keys.read()).toThrow();
      vi.stubEnv('AGENT_GITU_SECRETS_KEY', 'a'.repeat(64));
      const record = JSON.parse(stored);
      record.tag = '0'.repeat(32);
      writeFileSync(file, JSON.stringify(record));
      expect(() => keys.read()).toThrow();
      vi.stubEnv('AGENT_GITU_SECRETS_KEY', '');
      expect(keys.canSave).toBe(false);
      expect(() => keys.save('secret')).toThrow('Enable encrypted integration storage');
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it.skipIf(process.platform !== 'win32')('encrypts the provider key with Windows DPAPI and can read it back', () => {
    fixture();
    vi.stubEnv('COMPOSIO_API_KEY', '');
    try {
      const keys = new ComposioKeyStore();
      keys.save('disposable-fixture-secret');
      expect(keys.read()).toBe('disposable-fixture-secret');
      const stored = readFileSync(path.join(process.env['AGENT_GITU_HOME']!, 'Settings', 'composio-key.dpapi'), 'utf8');
      expect(stored).not.toContain('disposable-fixture-secret');
      expect(stored).not.toContain(Buffer.from('disposable-fixture-secret').toString('base64'));
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('lists only the owner’s private connections and strips credential data', async () => {
    const f = fixture();
    expect(await f.apps.accounts()).toEqual([{ id: 'own', toolkit: 'gmail', status: 'ACTIVE', disabled: false }]);
    expect(f.list).toHaveBeenCalledWith({ userIds: ['owner-uuid'], accountType: 'PRIVATE', limit: 100, cursor: undefined });
    expect(JSON.stringify(await f.apps.catalog('mail'))).not.toContain('fixture-key');
    expect(f.create).toHaveBeenCalledWith('owner-uuid', { manageConnections: false });
    expect(f.toolkits).toHaveBeenCalledWith({ search: 'mail', cursor: undefined, limit: 50 });
  });
  it('permits only Composio HTTPS authorization links and revokes owned connections', async () => {
    const f = fixture();
    expect(await f.apps.connect('gmail')).toEqual({ url: 'https://connect.composio.dev/link' });
    f.authorize.mockResolvedValue({ redirectUrl: 'https://connect.composio.dev.evil.example/login' });
    await expect(f.apps.connect('gmail')).rejects.toThrow('invalid connection link');
    await expect(f.apps.connect('../gmail')).rejects.toThrow('Invalid service');
    await expect(f.apps.disconnect('somebody-elses-account')).rejects.toThrow('Connection not found');
    expect(f.revoke).not.toHaveBeenCalled();
    await f.apps.disconnect('own');
    expect(f.revoke).toHaveBeenCalledWith('own');
  });
  it('binds execution to the approved owner, account and toolkit and disables retries', async () => {
    const f = fixture();
    await expect(f.apps.execute('gmail', 'GMAIL_SEND', { to: 'person@example.com' }, 'foreign')).rejects.toThrow('disconnected');
    await expect(f.apps.execute('slack', 'GMAIL_SEND', {}, 'own')).rejects.toThrow('disconnected');
    f.raw.mockResolvedValueOnce([{ slug: 'GMAIL_SEND', name: 'Wrong', description: '', inputParameters: {}, toolkit: { slug: 'slack' } }]);
    await expect(f.apps.execute('gmail', 'GMAIL_SEND', {}, 'own')).rejects.toThrow('does not belong');
    expect(f.execute).not.toHaveBeenCalled();
    await f.apps.execute('gmail', 'GMAIL_SEND', { to: 'person@example.com' }, 'own');
    expect(f.create).toHaveBeenLastCalledWith('owner-uuid', {
      toolkits: ['gmail'],
      tools: { gmail: ['GMAIL_SEND'] },
      connectedAccounts: { gmail: 'own' },
      manageConnections: false,
    });
    expect(f.withOptions).toHaveBeenCalledWith({ maxRetries: 0 });
    expect(f.execute).toHaveBeenCalledOnce();
    expect(f.execute).toHaveBeenCalledWith('test-session', { tool_slug: 'GMAIL_SEND', arguments: { to: 'person@example.com' } });
    f.execute.mockImplementationOnce(async () => ({ data: { done: false }, error: 'provider rejected the action' }));
    await expect(f.apps.execute('gmail', 'GMAIL_SEND', {}, 'own')).rejects.toThrow('rejected this action');
  });

  it('requires a human review and prevents altered arguments, wrong agents, and approval replay', async () => {
    const f = fixture();
    const store = new CoworkStore();
    const agent = store.saveAgent({ name: 'Writer', systemPrompt: 'Write.', allowWrites: true, allowConfig: true });
    const conv = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    const scope = { store, agent, conversationId: conv.id } as CoworkToolScope;
    const ctx = { connectedApps: f.apps } as ToolContext;
    const perms = { allowWrites: true, allowConfig: true, allowShell: false, chief: false, browser: false };
    const params = { action: 'execute', service: 'gmail', tool: 'GMAIL_SEND', args: { to: 'approved@example.com', text: 'Hello' } };
    const run = (input: Record<string, unknown>, acting = scope) => executeCoworkTool(ctx, 'connected_apps', input, perms, acting);
    const first = await run(params);
    expect(first.output).toContain('Stop and wait');
    expect(f.execute).not.toHaveBeenCalled();
    const card = store.requests(conv.id)[0]!;
    expect(card.detail).toContain('approved@example.com');
    expect(card.detail).toContain('"accountId":"own"');
    await run(params);
    expect(store.requests(conv.id)).toHaveLength(1);
    store.resolveRequest(card.id, 'accepted');
    await run({ ...params, args: { to: 'attacker@example.com' }, approvalId: card.id });
    expect(f.execute).not.toHaveBeenCalled();
    await run({ ...params, approvalId: card.id }, { ...scope, agent: { ...agent, id: 'other-agent' } });
    expect(f.execute).not.toHaveBeenCalled();
    const result = await run({ ...params, approvalId: card.id });
    expect(result.ok).toBe(true);
    expect(f.execute).toHaveBeenCalledOnce();
    await run({ ...params, approvalId: card.id });
    expect(f.execute).toHaveBeenCalledOnce();
    const denied = await executeCoworkTool(ctx, 'connected_apps', params, { ...perms, allowWrites: false }, scope);
    expect(denied.ok).toBe(false);
    expect((await run(params, { ...scope, isSubAgent: true })).ok).toBe(false);
  });

  it('persists Always allow for one teammate, tool and account and restores review after revocation', async () => {
    const f = fixture();
    const store = new CoworkStore();
    const agent = store.saveAgent({ name: 'Writer', systemPrompt: 'Write.', allowWrites: true, allowConfig: true });
    const conv = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    const scope = { store, agent, conversationId: conv.id } as CoworkToolScope;
    const ctx = { connectedApps: f.apps } as ToolContext;
    const perms = { allowWrites: true, allowConfig: true, allowShell: false, chief: false, browser: false };
    const params = { action: 'execute', service: 'gmail', tool: 'GMAIL_SEND', args: { to: 'first@example.com', text: 'A full message. '.repeat(200) } };
    await executeCoworkTool(ctx, 'connected_apps', { ...params, alwaysAllow: true }, perms, scope);
    expect(f.execute).not.toHaveBeenCalled(); // A model flag cannot grant permission.
    const card = store.requests(conv.id)[0]!;
    expect(card.appAction?.args).toEqual(params.args);
    const permission = store.allowAppActionForRequest(card.id);
    store.resolveRequest(card.id, 'accepted', 'Always allowed');
    const reloaded = new CoworkStore();
    expect(reloaded.appPermissions()).toEqual([permission]);
    expect(reloaded.getRequest(card.id)?.appAction?.args).toEqual(params.args);
    const resumed = { ...scope, store: reloaded };
    await executeCoworkTool(ctx, 'connected_apps', params, perms, resumed);
    await executeCoworkTool(ctx, 'connected_apps', { ...params, args: { to: 'second@example.com' } }, perms, resumed);
    expect(f.execute).toHaveBeenCalledTimes(2);
    for (const change of [{ accountId: 'other' }, { service: 'slack' }, { tool: 'GMAIL_DELETE' }]) {
      expect(reloaded.appActionAllowed(agent.id, { service: 'gmail', accountId: 'own', tool: 'GMAIL_SEND', ...change })).toBe(false);
    }
    expect(reloaded.appActionAllowed('other-agent', { service: 'gmail', accountId: 'own', tool: 'GMAIL_SEND' })).toBe(false);
    await executeCoworkTool(ctx, 'connected_apps', params, { ...perms, allowWrites: false }, resumed);
    await executeCoworkTool(ctx, 'connected_apps', params, perms, { ...resumed, isSubAgent: true });
    await executeCoworkTool(ctx, 'connected_apps', { ...params, tool: 'GMAIL_DELETE' }, perms, resumed);
    expect(f.execute).toHaveBeenCalledTimes(2);
    expect(reloaded.revokeAppPermission(permission.id)).toBe(true);
    expect(new CoworkStore().appPermissions()).toEqual([]);
    await executeCoworkTool(ctx, 'connected_apps', params, perms, resumed);
    expect(f.execute).toHaveBeenCalledTimes(2);
    expect(reloaded.openRequests(conv.id).some(request => request.appAction?.tool === 'GMAIL_SEND')).toBe(true);
  });

  it('grants Always allow through the user card and exposes a revoke control through the API', async () => {
    const f = fixture();
    const server = new GituServer({ cwd: process.env['AGENT_GITU_HOME']!, port: 0, passwordRequired: false, llm: { name: 'fixture', async complete() { return 'Done.'; } }, coworkCompletionProtocol: 'legacy' });
    Object.assign(server, { connectedApps: f.apps });
    const store = (server as unknown as { cowork(): CoworkStore }).cowork();
    const agent = store.saveAgent({ name: 'Writer', systemPrompt: 'Write.' });
    const conv = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    const card = store.addRequest({ conversationId: conv.id, agentId: agent.id, kind: 'recommendation', title: 'Run GMAIL_SEND', detail: 'Review this gmail action:\n' + JSON.stringify({ service: 'gmail', accountId: 'own', tool: 'GMAIL_SEND', args: { to: 'first@example.com' } }) });
    const ordinary = store.addRequest({ conversationId: conv.id, agentId: agent.id, kind: 'recommendation', title: 'Try larger images', detail: 'A regular recommendation.' });
    const base = 'http://127.0.0.1:' + await server.start();
    try {
      const bad = await fetch(`${base}/api/cowork/requests/${ordinary.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'always-allow' }) });
      expect(bad.status).toBe(400);
      expect(store.appPermissions()).toEqual([]);
      const allowed = await fetch(`${base}/api/cowork/requests/${card.id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'always-allow', service: 'slack', accountId: 'attacker', tool: 'OTHER' }) });
      expect(allowed.status).toBe(200);
      const result = await allowed.json();
      expect(result.request).toMatchObject({ status: 'accepted', response: 'Always allowed' });
      const permissions = store.appPermissions();
      expect(permissions).toHaveLength(1);
      expect(permissions[0]).toMatchObject({ agentId: agent.id, service: 'gmail', accountId: 'own', tool: 'GMAIL_SEND' });
      const connections = await fetch(`${base}/api/connected-apps`).then(response => response.json());
      expect(connections.appPermissions[0]).toMatchObject({ id: permissions[0]!.id, agentName: 'Writer' });
      expect(await fetch(`${base}/api/connected-apps/permissions/${permissions[0]!.id}`, { method: 'DELETE' }).then(response => response.status)).toBe(200);
      expect(new CoworkStore().appPermissions()).toEqual([]);
    } finally { await server.stop(); }
  });
});
