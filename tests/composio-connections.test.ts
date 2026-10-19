import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ComposioConnections, ComposioExecutionUncertainError, ComposioKeyStore } from '../src/connections/composio.js';
import { executeCoworkTool, type CoworkToolScope } from '../src/cowork/tools.js';
import { CoworkStore } from '../src/cowork/store.js';
import { GituServer } from '../src/server/server.js';
import type { ToolContext } from '../src/tools/tools.js';
import { connectionResponses } from '../src/connections/response-data.js';

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
function fixture(owner = () => 'owner-uuid') {
  process.env['AGENT_GITU_HOME'] = mkdtempSync(path.join(tmpdir(), 'gitu-composio-'));
  mkdirSync(path.join(process.env['AGENT_GITU_HOME']!, 'Settings'), { recursive: true });
  const keys = new MemoryKeys();
  keys.value = 'fixture-key';
  const execute = vi.fn(async (): Promise<Record<string, unknown>> => ({ data: { done: true } }));
  const toolkits = vi.fn(async () => ({ items: [{ slug: 'gmail', name: 'Gmail', connection: { connectedAccount: { status: 'ACTIVE', id: 'own' } } }], cursor: 'next' }));
  const authorize = vi.fn(async () => ({ redirectUrl: 'https://connect.composio.dev/link', id: 'own' }));
  const create = vi.fn(async () => ({ sessionId: 'test-session', toolkits, authorize }));
  const use = vi.fn(async () => ({ sessionId: 'saved-session', toolkits, authorize }));
  const list = vi.fn(async (): Promise<{ items: { id: string; toolkit: { slug: string }; status: string; isDisabled: boolean; data?: Record<string, unknown> }[]; nextCursor: string | null }> => ({
    items: [{ id: 'own', toolkit: { slug: 'gmail' }, status: 'ACTIVE', isDisabled: false, data: { accessToken: 'never-expose-me' } }],
    nextCursor: null,
  }));
  const revoke = vi.fn(async () => ({}));
  const raw = vi.fn(async () => [{ slug: 'GMAIL_SEND', name: 'Send mail', description: 'Send', inputParameters: {}, toolkit: { slug: 'gmail' } }]);
  const catalog = vi.fn(async () => ({ items: (await raw()).map(tool => ({ ...tool, input_parameters: tool.inputParameters })), next_cursor: null as string | null }));
  const withOptions = vi.fn(() => ({ toolRouter: { session: { execute } } }));
  const client = {
    sessions: { create, use },
    connectedAccounts: { list, revoke },
    tools: { getRawComposioTools: raw },
    toolkits: { get: vi.fn(async () => ({})) },
    getClient: () => ({ withOptions, tools: { list: catalog } }),
  } as unknown as Client;
  const apps = new ComposioConnections(
    owner,
    keys,
    () => client,
  );
  return { apps, keys, create, use, list, revoke, raw, catalog, execute, authorize, toolkits, withOptions };
}

describe('Composio connections', () => {
  it.each(['{interrupted', 'null', '{"owner":"owner-uuid","sessionId":42}'])('recovers an invalid saved session: %s', async (saved) => {
    const f = fixture();
    writeFileSync(path.join(process.env['AGENT_GITU_HOME']!, 'Settings', 'composio-session.json'), saved);
    expect((await f.apps.catalog()).services[0]?.slug).toBe('gmail');
    expect(f.create).toHaveBeenCalledOnce();
    expect(f.use).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(path.join(process.env['AGENT_GITU_HOME']!, 'Settings', 'composio-session.json'), 'utf8')).sessionId).toBe('test-session');
  });

  it('reuses a saved session, replaces a confirmed deleted one, and preserves auth failures', async () => {
    const f = fixture(), file = path.join(process.env['AGENT_GITU_HOME']!, 'Settings', 'composio-session.json');
    writeFileSync(file, JSON.stringify({ owner: 'owner-uuid', sessionId: 'old-session' }));
    f.use.mockRejectedValueOnce(Object.assign(new Error('Deleted'), { status: 404 }));
    await f.apps.catalog();
    expect(f.use).toHaveBeenCalledWith('old-session', undefined, { signal: expect.any(AbortSignal) });
    expect(f.create).toHaveBeenCalledOnce();
    const restored = new ComposioConnections(() => 'owner-uuid', f.keys, () => ({ sessions: { create: f.create, use: f.use } }) as unknown as Client);
    await restored.catalog();
    expect(f.use).toHaveBeenCalledTimes(2);
    expect(f.create).toHaveBeenCalledOnce();
    const unauthorized = new ComposioConnections(() => 'owner-uuid', f.keys, () => ({ sessions: { create: f.create, use: f.use } }) as unknown as Client);
    f.use.mockRejectedValueOnce(Object.assign(new Error('Not authorized'), { status: 401 }));
    await expect(unauthorized.catalog()).rejects.toThrow('Not authorized');
    expect(f.create).toHaveBeenCalledOnce();
  });

  it('scopes the cached sign-in session to the current owner', async () => {
    let owner = 'owner-uuid';
    const f = fixture(() => owner);
    await f.apps.catalog();
    owner = 'different-owner';
    await f.apps.catalog();
    expect(f.create).toHaveBeenCalledTimes(2);
    expect(f.create).toHaveBeenLastCalledWith('different-owner', { manageConnections: false }, { signal: expect.any(AbortSignal) });
  });

  it('does not let an old pending session overwrite a changed API key', async () => {
    const f = fixture();
    let finish!: (session: Awaited<ReturnType<typeof f.create>>) => void;
    f.create.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const old = f.apps.catalog();
    const rejected = expect(old).rejects.toThrow('setup changed');
    await f.apps.configure('new-provider-key');
    await f.apps.catalog();
    finish({ sessionId: 'stale-project-session', toolkits: f.toolkits, authorize: f.authorize });
    await rejected;
    expect(JSON.parse(readFileSync(path.join(process.env['AGENT_GITU_HOME']!, 'Settings', 'composio-session.json'), 'utf8')).sessionId).toBe('test-session');
    await f.apps.catalog();
    expect(f.create).toHaveBeenCalledTimes(2);
  });

  it('blocks execution through a stale session if configuration changes before submission', async () => {
    const f = fixture();
    let finish!: (session: Awaited<ReturnType<typeof f.create>>) => void;
    f.create.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const execution = f.apps.execute('gmail', 'GMAIL_SEND', {}, 'own');
    const rejected = expect(execution).rejects.toThrow('No action was submitted');
    await vi.waitFor(() => expect(f.create).toHaveBeenCalledOnce());
    await f.apps.configure('replacement-key');
    finish({ sessionId: 'old-project', toolkits: f.toolkits, authorize: f.authorize });
    await rejected;
    expect(f.execute).not.toHaveBeenCalled();
    await f.apps.execute('gmail', 'GMAIL_SEND', {}, 'own');
    expect(f.execute).toHaveBeenCalledOnce();
    expect(f.create).toHaveBeenCalledTimes(2);
  });

  it('clears a deleted live catalog session so the next refresh can recover', async () => {
    const f = fixture();
    f.toolkits.mockRejectedValueOnce(Object.assign(new Error('Session missing'), { status: 404 }));
    await expect(f.apps.catalog()).rejects.toThrow('Session missing');
    f.use.mockRejectedValueOnce(Object.assign(new Error('Session missing'), { status: 404 }));
    expect((await f.apps.catalog()).services[0]?.slug).toBe('gmail');
    expect(f.create).toHaveBeenCalledTimes(2);
    expect(f.toolkits).toHaveBeenCalledTimes(2);
  });

  it('paginates and deduplicates accounts, and rejects a repeated cursor', async () => {
    const f = fixture();
    const item = { id: 'one', toolkit: { slug: 'gmail' }, status: 'ACTIVE', isDisabled: false };
    f.list.mockResolvedValueOnce({ items: [item], nextCursor: 'page-two' }).mockResolvedValueOnce({ items: [item, { ...item, id: 'two' }], nextCursor: null });
    expect((await f.apps.accounts()).map(account => account.id)).toEqual(['one', 'two']);
    expect(f.list).toHaveBeenNthCalledWith(2, { cursor: 'page-two', userIds: ['owner-uuid'], accountType: 'PRIVATE', limit: 100 }, { signal: expect.any(AbortSignal) });
    f.list.mockResolvedValue({ items: [], nextCursor: 'stuck-cursor' });
    await expect(f.apps.accounts()).rejects.toThrow('incomplete');
    expect(f.list).toHaveBeenCalledTimes(4);
  });

  it('filters discovered tools to the requested toolkit and exact slug', async () => {
    const f = fixture();
    f.raw.mockResolvedValue([
      { slug: 'GMAIL_SEND', name: 'Send', description: '', inputParameters: {}, toolkit: { slug: 'gmail' } },
      { slug: 'GMAIL_READ', name: 'Read', description: '', inputParameters: {}, toolkit: { slug: 'gmail' } },
      { slug: 'SLACK_SEND', name: 'Send', description: '', inputParameters: {}, toolkit: { slug: 'slack' } },
    ]);
    expect((await f.apps.tools('gmail', 'send')).map(tool => tool.slug)).toEqual(['GMAIL_SEND']);
    expect((await f.apps.tools('gmail', undefined, 'GMAIL_SEND')).map(tool => tool.slug)).toEqual(['GMAIL_SEND']);
  });

  it('finds inbox tools beyond a truncated search and paginates the full catalog', async () => {
    const f = fixture();
    const item = (slug: string, name: string) => ({ slug, name, description: '', inputParameters: {}, toolkit: { slug: 'gmail' }, input_parameters: {} });
    f.catalog.mockResolvedValueOnce({ items: [item('GMAIL_GET_PROFILE', 'Get profile'), item('GMAIL_LIST_LABELS', 'List labels')], next_cursor: 'page-2' });
    f.catalog.mockResolvedValueOnce({ items: [item('GMAIL_FETCH_EMAILS', 'Fetch emails')], next_cursor: null });
    expect((await f.apps.tools('gmail', 'read emails'))[0]?.slug).toBe('GMAIL_FETCH_EMAILS');
    expect(f.catalog).toHaveBeenNthCalledWith(2, { toolkit_slug: 'gmail', toolkit_versions: 'latest', limit: 100, cursor: 'page-2' }, { signal: expect.any(AbortSignal) });
    expect((await f.apps.tools('gmail')).map(tool => tool.slug)).toHaveLength(3);
    expect(f.catalog).toHaveBeenCalledTimes(2);
    expect(f.execute).not.toHaveBeenCalled();
  });

  it('rejects repeated tool cursors and retries a failed catalog without retaining partial results', async () => {
    const f = fixture();
    f.catalog.mockResolvedValue({ items: [], next_cursor: 'repeat' });
    await expect(f.apps.tools('gmail', 'read')).rejects.toThrow('catalog is incomplete');
    f.catalog.mockResolvedValue({ items: [], next_cursor: null });
    expect(await f.apps.tools('gmail')).toEqual([]);
    expect(f.catalog).toHaveBeenCalledTimes(3);
  });

  it.each(['https://user:password@connect.composio.dev/link', 'https://connect.composio.dev:8443/link'])('rejects unsupported sign-in URLs before assigning an account: %s', async url => {
    const f = fixture();
    f.authorize.mockResolvedValue({ redirectUrl: url, id: 'own' });
    await expect(f.apps.connect('gmail')).rejects.toThrow('invalid connection link');
  });

  it('shares one execution session across concurrent calls and never retries uncertain execution', async () => {
    const f = fixture();
    await Promise.all([f.apps.execute('gmail', 'GMAIL_SEND', { text: 'one' }, 'own'), f.apps.execute('gmail', 'GMAIL_SEND', { text: 'two' }, 'own')]);
    expect(f.create).toHaveBeenCalledOnce();
    expect(f.raw).toHaveBeenCalledOnce();
    f.execute.mockRejectedValueOnce(new Error('Socket disconnected after submission'));
    await expect(f.apps.execute('gmail', 'GMAIL_SEND', { text: 'uncertain' }, 'own')).rejects.toBeInstanceOf(ComposioExecutionUncertainError);
    expect(f.execute).toHaveBeenCalledTimes(3);
  });

  it('redacts credentials for direct execution consumers while retaining pagination', async () => {
    const f = fixture();
    f.execute.mockResolvedValueOnce({ data: { accessToken: 'private', result: 'useful', nextPageToken: 'continue-here' }, error: null });
    expect(await f.apps.execute('gmail', 'GMAIL_SEND', {}, 'own')).toEqual({ data: { accessToken: '<redacted>', result: 'useful', nextPageToken: 'continue-here' }, error: null });
  });

  it('invalidates a missing execution session without replaying the action', async () => {
    const f = fixture();
    f.execute.mockRejectedValueOnce(Object.assign(new Error('Session missing'), { status: 404 }));
    await expect(f.apps.execute('gmail', 'GMAIL_SEND', {}, 'own')).rejects.toThrow('Session missing');
    expect(f.execute).toHaveBeenCalledOnce();
    await f.apps.execute('gmail', 'GMAIL_SEND', {}, 'own');
    expect(f.create).toHaveBeenCalledTimes(2);
    expect(f.execute).toHaveBeenCalledTimes(2);
  });

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
      expect(keys.canSave).toBe(true);
      keys.save('automatically-protected-secret');
      expect(keys.read()).toBe('automatically-protected-secret');
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
    expect(f.list).toHaveBeenCalledWith({ userIds: ['owner-uuid'], accountType: 'PRIVATE', limit: 100, cursor: undefined }, { signal: expect.any(AbortSignal) });
    expect(JSON.stringify(await f.apps.catalog('mail'))).not.toContain('fixture-key');
    expect(f.create).toHaveBeenCalledWith('owner-uuid', { manageConnections: false }, { signal: expect.any(AbortSignal) });
    expect(f.toolkits).toHaveBeenCalledWith({ search: 'mail', cursor: undefined, limit: 50 });
  });
  it('permits only Composio HTTPS authorization links and revokes owned connections', async () => {
    const f = fixture();
    expect(await f.apps.connect('gmail')).toEqual({ url: 'https://connect.composio.dev/link', accountId: 'own' });
    f.authorize.mockResolvedValue({ redirectUrl: 'https://connect.composio.dev.evil.example/login', id: 'own' });
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
    }, { signal: expect.any(AbortSignal) });
    expect(f.withOptions).toHaveBeenCalledWith({ maxRetries: 0 });
    expect(f.execute).toHaveBeenCalledOnce();
    expect(f.execute).toHaveBeenCalledWith('test-session', { tool_slug: 'GMAIL_SEND', arguments: { to: 'person@example.com' } }, { signal: expect.any(AbortSignal) });
    f.execute.mockImplementationOnce(async () => ({ data: { done: false }, error: 'provider rejected the action' }));
    await expect(f.apps.execute('gmail', 'GMAIL_SEND', {}, 'own')).rejects.toThrow('rejected this action');
  });

  it('reuses a validated session but still checks account status for each execution', async () => {
    const f = fixture();
    await f.apps.execute('gmail', 'GMAIL_SEND', { to: 'first@example.com' }, 'own');
    await f.apps.execute('gmail', 'GMAIL_SEND', { to: 'second@example.com' }, 'own');
    expect(f.create).toHaveBeenCalledOnce();
    expect(f.raw).toHaveBeenCalledOnce();
    expect(f.list).toHaveBeenCalledTimes(2);
    f.list.mockResolvedValueOnce({ items: [], nextCursor: null });
    await expect(f.apps.execute('gmail', 'GMAIL_SEND', {}, 'own')).rejects.toThrow('disconnected');
    expect(f.execute).toHaveBeenCalledTimes(2);
    await f.apps.disconnect('own');
    await f.apps.execute('gmail', 'GMAIL_SEND', {}, 'own');
    expect(f.create).toHaveBeenCalledTimes(2);
  });

  it('searches tools by capability and returns an intact large exact input schema', async () => {
    const f = fixture();
    f.raw.mockResolvedValue([{ slug: 'GMAIL_SEND', name: 'Send mail', description: 'x'.repeat(25_000), inputParameters: { required: ['to'] }, toolkit: { slug: 'gmail' } }]);
    const store = new CoworkStore();
    const agent = store.saveAgent({ name: 'Reader', systemPrompt: 'Read.' });
    store.assignAppAccount(agent.id, 'gmail', 'own');
    const scope = { store, agent } as CoworkToolScope;
    const ctx = { connectedApps: f.apps } as ToolContext;
    const perms = { allowWrites: false, allowConfig: false, allowShell: false, chief: false, browser: false };
    const catalog = await executeCoworkTool(ctx, 'connected_apps', { action: 'tools', service: 'gmail' }, perms, scope);
    expect(JSON.parse(catalog.output).tools[0].description).toHaveLength(160);
    const schema = await executeCoworkTool(ctx, 'connected_apps', { action: 'tools', service: 'gmail', query: 'send mail' }, perms, scope);
    expect(JSON.parse(schema.output)[0].inputParameters.required).toEqual(['to']);
    expect(JSON.parse(schema.output)[0].description).toHaveLength(25_000);
    expect(f.catalog).toHaveBeenLastCalledWith({ toolkit_slug: 'gmail', toolkit_versions: 'latest', limit: 100, cursor: undefined }, { signal: expect.any(AbortSignal) });
    await f.apps.tools('gmail', undefined, 'GMAIL_SEND');
    expect(f.raw).toHaveBeenLastCalledWith({ tools: ['GMAIL_SEND'] }, undefined, { signal: expect.any(AbortSignal) });
  });

  it('keeps large app results inspectable, preserves pagination and reports the actual input error', async () => {
    const f = fixture();
    f.raw.mockResolvedValue([{ slug: 'GMAIL_FETCH', name: 'Fetch mail', description: 'Fetch', inputParameters: {}, toolkit: { slug: 'gmail' } }]);
    const store = new CoworkStore();
    const agent = store.saveAgent({ name: 'Reader', systemPrompt: 'Read.', allowWrites: true, allowConfig: true });
    store.assignAppAccount(agent.id, 'gmail', 'own');
    const conv = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    const request = store.addRequest({ conversationId: conv.id, agentId: agent.id, kind: 'recommendation', title: 'Read', detail: 'Allow this action for the test.', appAction: { service: 'gmail', accountId: 'own', tool: 'GMAIL_FETCH', args: {} } });
    store.allowAppActionForRequest(request.id);
    const scope = { store, agent, conversationId: conv.id } as CoworkToolScope;
    const ctx = { connectedApps: f.apps } as ToolContext;
    const perms = { allowWrites: true, allowConfig: true, allowShell: false, chief: false, browser: false };
    const params = { action: 'execute', service: 'gmail', tool: 'GMAIL_FETCH', args: {} };
    f.execute.mockResolvedValueOnce({ data: { body: 'x'.repeat(20_000) + 'END-OF-MESSAGE', nextPageToken: 'next-page', accessToken: 'secret' } });
    const result = await executeCoworkTool(ctx, 'connected_apps', params, perms, scope);
    expect(result.ok).toBe(true);
    const { responseId } = JSON.parse(result.output);
    expect(result.output.length).toBeLessThan(8_000);
    expect(connectionResponses().inspect({ responseId, path: '/data/body', offset: 20_000 }).data).toBe('END-OF-MESSAGE');
    expect(connectionResponses().inspect({ responseId, path: '/data/nextPageToken' }).data).toBe('next-page');
    expect(connectionResponses().inspect({ responseId, path: '/data/accessToken' }).data).toBe('<redacted>');
    f.execute.mockRejectedValueOnce(Object.assign(new Error('Invalid input: missing required query; authorization=secret'), { status: 400 }));
    const failed = await executeCoworkTool(ctx, 'connected_apps', params, perms, scope);
    expect(failed.ok).toBe(false);
    expect(failed.output).toContain('missing required query');
    expect(failed.output).not.toContain('authorization=secret');
    expect(failed.output).not.toContain('Check its status');
    f.execute.mockResolvedValueOnce({ data: { text: 'Keep this result', accessToken: 'small-secret', nested: { password: 'also-secret' }, nextPageToken: 'next-page' } });
    const small = await executeCoworkTool(ctx, 'connected_apps', params, perms, scope);
    expect(JSON.parse(small.output).data).toEqual({ text: 'Keep this result', accessToken: '<redacted>', nested: { password: '<redacted>' }, nextPageToken: 'next-page' });
    f.execute.mockRejectedValueOnce(new Error('Socket disconnected'));
    const uncertain = await executeCoworkTool(ctx, 'connected_apps', params, perms, scope);
    expect(uncertain.ok).toBe(false);
    expect(uncertain.output).toContain('may already have run');
    expect(uncertain.output).not.toContain('Correct invalid inputs');
  });

  it('requires a human review and prevents altered arguments, wrong agents, and approval replay', async () => {
    const f = fixture();
    const store = new CoworkStore();
    const agent = store.saveAgent({ name: 'Writer', systemPrompt: 'Write.', allowWrites: true, allowConfig: true });
    store.assignAppAccount(agent.id, 'gmail', 'own');
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
    f.raw.mockResolvedValue([{ slug: 'GMAIL_FETCH', name: 'Fetch mail', description: 'Fetch', inputParameters: {}, toolkit: { slug: 'gmail' } }]);
    const store = new CoworkStore();
    const agent = store.saveAgent({ name: 'Writer', systemPrompt: 'Write.', allowWrites: true, allowConfig: true });
    store.assignAppAccount(agent.id, 'gmail', 'own');
    const conv = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    const scope = { store, agent, conversationId: conv.id } as CoworkToolScope;
    const ctx = { connectedApps: f.apps } as ToolContext;
    const perms = { allowWrites: true, allowConfig: true, allowShell: false, chief: false, browser: false };
    const params = { action: 'execute', service: 'gmail', tool: 'GMAIL_FETCH', args: { query: 'first@example.com', text: 'A full message. '.repeat(200) } };
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
      expect(reloaded.appActionAllowed(agent.id, { service: 'gmail', accountId: 'own', tool: 'GMAIL_FETCH', ...change })).toBe(false);
    }
    expect(reloaded.appActionAllowed('other-agent', { service: 'gmail', accountId: 'own', tool: 'GMAIL_FETCH' })).toBe(false);
    await executeCoworkTool(ctx, 'connected_apps', params, { ...perms, allowWrites: false }, resumed);
    await executeCoworkTool(ctx, 'connected_apps', params, perms, { ...resumed, isSubAgent: true });
    await executeCoworkTool(ctx, 'connected_apps', { ...params, tool: 'GMAIL_DELETE' }, perms, resumed);
    expect(f.execute).toHaveBeenCalledTimes(2);
    expect(reloaded.revokeAppPermission(permission.id)).toBe(true);
    expect(new CoworkStore().appPermissions()).toEqual([]);
    await executeCoworkTool(ctx, 'connected_apps', params, perms, resumed);
    expect(f.execute).toHaveBeenCalledTimes(2);
    expect(reloaded.openRequests(conv.id).some(request => request.appAction?.tool === 'GMAIL_FETCH')).toBe(true);
  });

  it('grants Always allow through the user card and exposes a revoke control through the API', async () => {
    const f = fixture();
    const server = new GituServer({ cwd: process.env['AGENT_GITU_HOME']!, port: 0, passwordRequired: false, llm: { name: 'fixture', async complete() { return 'Done.'; } }, coworkCompletionProtocol: 'legacy' });
    Object.assign(server, { connectedApps: f.apps });
    const store = (server as unknown as { cowork(): CoworkStore }).cowork();
    const agent = store.saveAgent({ name: 'Writer', systemPrompt: 'Write.' });
    store.assignAppAccount(agent.id, 'gmail', 'own');
    const conv = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    const card = store.addRequest({ conversationId: conv.id, agentId: agent.id, kind: 'recommendation', title: 'Run GMAIL_FETCH', detail: 'Review this gmail action:\n' + JSON.stringify({ service: 'gmail', accountId: 'own', tool: 'GMAIL_FETCH', args: { query: 'first@example.com' } }) });
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
      expect(permissions[0]).toMatchObject({ agentId: agent.id, service: 'gmail', accountId: 'own', tool: 'GMAIL_FETCH' });
      const connections = await fetch(`${base}/api/connected-apps`).then(response => response.json());
      expect(connections.appPermissions[0]).toMatchObject({ id: permissions[0]!.id, agentName: 'Writer' });
      expect(await fetch(`${base}/api/connected-apps/permissions/${permissions[0]!.id}`, { method: 'DELETE' }).then(response => response.status)).toBe(200);
      expect(new CoworkStore().appPermissions()).toEqual([]);
    } finally { await server.stop(); }
  });
});
