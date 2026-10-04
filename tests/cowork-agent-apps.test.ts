import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createContext, Script } from 'node:vm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoworkStore } from '../src/cowork/store.js';
import { roleAppSuggestions } from '../src/cowork/app-recommendations.js';
import { executeCoworkTool, type CoworkToolScope } from '../src/cowork/tools.js';
import { GituServer } from '../src/server/server.js';
import { COWORK_JS } from '../src/server/ui-cowork.js';
import { CONNECTED_APPS_CSS, CONNECTED_APPS_JS } from '../src/server/ui-connected-apps.js';
import type { ComposioConnections } from '../src/connections/composio.js';
import type { ToolContext } from '../src/tools/tools.js';

const previous = process.env['AGENT_GITU_HOME'];
afterEach(() => { if (previous === undefined) delete process.env['AGENT_GITU_HOME']; else process.env['AGENT_GITU_HOME'] = previous; });
function fixture() {
  process.env['AGENT_GITU_HOME'] = mkdtempSync(path.join(tmpdir(), 'gitu-agent-apps-'));
  const store = new CoworkStore();
  const agent = store.saveAgent({ name: 'Writer', systemPrompt: 'Write.', allowWrites: true, allowConfig: true });
  const other = store.saveAgent({ name: 'Reviewer', systemPrompt: 'Review.', allowWrites: true, allowConfig: true });
  const conv = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
  const accounts = [{ id: 'gmail-own', toolkit: 'gmail', status: 'ACTIVE', disabled: false }, { id: 'github-other', toolkit: 'github', status: 'ACTIVE', disabled: false }];
  const apps = {
    configured: true, setup: { canConfigure: true, keyStorage: 'server-encrypted' },
    accounts: vi.fn(async () => accounts),
    catalog: vi.fn(async () => ({ services: [{ slug: 'gmail', name: 'Gmail', status: 'ACTIVE', accountId: 'gmail-own' }, { slug: 'github', name: 'GitHub', status: 'ACTIVE', accountId: 'github-other' }] })),
    tools: vi.fn(async () => [{ slug: 'GMAIL_SEND' }]),
    execute: vi.fn(async () => ({ data: 'done' })),
    connect: vi.fn(async () => ({ url: 'https://connect.composio.dev/link', accountId: 'pending-new' })),
  };
  const scope = { store, agent, conversationId: conv.id } as CoworkToolScope;
  const ctx = { connectedApps: apps as unknown as ComposioConnections } as ToolContext;
  const perms = { allowWrites: true, allowConfig: true, allowShell: false, chief: false, browser: false };
  return { store, agent, other, conv, accounts, apps, scope, run: (params: Record<string, unknown>, acting = scope) => executeCoworkTool(ctx, 'connected_apps', params, perms, acting) };
}

describe('teammate app connections', () => {
  it('creates role recommendations in the teammate DM without granting access or duplicating them', () => {
    const f = fixture();
    const marketer = f.store.saveAgent({ name: 'Marketer', tagline: 'Social media manager', systemPrompt: 'Manage social campaigns.' });
    const conv = f.store.recommendRoleApps(marketer.id)!;
    expect(conv.memberIds).toEqual([marketer.id]);
    expect(f.store.requests(conv.id).map(request => request.appConnection?.service)).toEqual(['facebook', 'instagram']);
    f.store.recommendRoleApps(marketer.id);
    expect(f.store.requests(conv.id)).toHaveLength(2);
    expect(f.store.appConnections(marketer.id)).toEqual([]);
    expect(roleAppSuggestions('Unknown custom role')).toEqual([]);
    expect(roleAppSuggestions('Software engineer')[0]?.service).toBe('github');
  });

  it('isolates list, tool discovery and execution even when another teammate has approved the account', async () => {
    const f = fixture();
    f.store.assignAppAccount(f.other.id, 'gmail', 'gmail-own');
    f.store.assignAppAccount(f.other.id, 'github', 'github-other');
    expect(JSON.parse((await f.run({ action: 'list' })).output)).toEqual([]);
    expect((await f.run({ action: 'tools', service: 'gmail' })).ok).toBe(false);
    expect((await f.run({ action: 'execute', service: 'gmail', accountId: 'gmail-own', tool: 'GMAIL_SEND', args: {} })).ok).toBe(false);
    expect(f.apps.execute).not.toHaveBeenCalled();
    f.store.assignAppAccount(f.agent.id, 'gmail', 'gmail-own');
    expect(JSON.parse((await f.run({ action: 'list' })).output)).toEqual([f.accounts[0]]);
    expect((await f.run({ action: 'tools', service: 'gmail' })).ok).toBe(true);
    expect((await f.run({ action: 'tools', service: 'github' })).ok).toBe(false);
    expect(f.apps.tools).toHaveBeenCalledOnce();
    const discovered = await f.run({ action: 'discover', query: 'email', cursor: 'next-page' });
    expect(f.apps.catalog).toHaveBeenCalledWith('email', 'next-page');
    expect(discovered.output).toContain('Gmail');
    expect(discovered.output).not.toContain('gmail-own');
    expect(discovered.output).not.toContain('ACTIVE');
    expect((await f.run({ action: 'list' }, { ...f.scope, isSubAgent: true })).ok).toBe(false);
  });

  it('lets an agent recommend a catalog app but never self-assign an account', async () => {
    const f = fixture();
    const seeded = f.store.recommendAppConnection(f.conv.id, f.agent.id, { service: 'gmail', name: 'Gmail', reason: 'Optional email setup.' });
    expect(seeded.appConnection?.resumeWork).toBe(false);
    expect((await f.run({ action: 'recommend', service: 'gmail', reason: 'Send the user’s approved drafts.', accountId: 'gmail-own' })).ok).toBe(true);
    const card = f.store.requests(f.conv.id)[0]!;
    expect(card.appConnection).toMatchObject({ service: 'gmail', name: 'Gmail', resumeWork: true });
    expect(f.store.appConnections(f.agent.id)).toEqual([]);
    expect(f.apps.connect).not.toHaveBeenCalled();
    await f.run({ action: 'recommend', service: 'gmail', reason: 'Duplicate.' });
    expect(f.store.requests(f.conv.id)).toHaveLength(1);
    f.store.resolveRequest(card.id, 'dismissed', 'Skipped');
    expect((await f.run({ action: 'recommend', service: 'gmail', reason: 'Try again.' })).output).toContain('previously skipped');
    expect(f.store.requests(f.conv.id)).toHaveLength(1);
    expect((await f.run({ action: 'recommend', service: 'fabricated', reason: 'Use this.' })).ok).toBe(false);
  });

  it('persists assignments and removes only that teammate’s access and Always allow policies', () => {
    const f = fixture();
    f.store.assignAppAccount(f.agent.id, 'gmail', 'gmail-own');
    f.store.assignAppAccount(f.other.id, 'gmail', 'gmail-own');
    const card = f.store.addRequest({ conversationId: f.conv.id, agentId: f.agent.id, kind: 'recommendation', title: 'Run GMAIL_SEND', detail: 'Review this gmail action:\n' + JSON.stringify({ service: 'gmail', accountId: 'gmail-own', tool: 'GMAIL_SEND', args: {} }) });
    f.store.allowAppActionForRequest(card.id);
    const restored = new CoworkStore();
    expect(restored.appAccountAssigned(f.agent.id, 'gmail', 'gmail-own')).toBe(true);
    restored.unassignAppAccount(f.agent.id, 'gmail-own');
    expect(restored.appPermissions()).toEqual([]);
    expect(restored.appAccountAssigned(f.other.id, 'gmail', 'gmail-own')).toBe(true);
    expect(() => restored.allowAppActionForRequest(card.id)).toThrow('assigned app');
    restored.deleteAgent(f.other.id);
    expect(restored.appConnections(f.other.id)).toEqual([]);
  });

  it('requires a user assignment, scopes catalog state, and confirms only active assigned connections', async () => {
    const f = fixture();
    const server = new GituServer({ cwd: process.env['AGENT_GITU_HOME']!, port: 0, passwordRequired: false, connectedApps: f.apps as unknown as ComposioConnections, llm: { name: 'fixture', async complete() { return 'Done.'; } }, coworkCompletionProtocol: 'legacy' });
    const store = (server as unknown as { cowork(): CoworkStore }).cowork();
    const agent = store.getAgent(f.agent.id)!;
    const card = store.recommendAppConnection(f.conv.id, agent.id, { service: 'gmail', name: 'Gmail', reason: 'Handle drafts.' });
    store.assignAppAccount(f.other.id, 'github', 'github-other');
    const base = 'http://127.0.0.1:' + await server.start();
    const post = (route: string, body: unknown) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    try {
      expect((await post('/api/connected-apps/connect', { service: 'gmail' })).status).toBe(400);
      expect((await post('/api/connected-apps/connect', { agentId: f.other.id, service: 'gmail', requestId: card.id })).status).toBe(400);
      expect((await post('/api/cowork/requests/' + card.id, { action: 'accept' })).status).toBe(400);
      const initial = await fetch(base + '/api/connected-apps?agentId=' + agent.id).then(response => response.json());
      expect(initial.accounts).toEqual([]);
      expect(initial.services[0].status).toBeUndefined();
      expect(initial.services[0].accountId).toBeUndefined();
      expect((await post('/api/connected-apps/assign', { agentId: agent.id, accountId: 'foreign' })).status).toBe(400);
      expect((await post('/api/connected-apps/connect', { agentId: agent.id, service: 'gmail', requestId: card.id })).status).toBe(200);
      expect(store.appAccountAssigned(agent.id, 'gmail', 'pending-new')).toBe(true);
      expect(store.getRequest(card.id)?.status).toBe('open');
      expect((await post('/api/connected-apps/assign', { agentId: agent.id, accountId: 'gmail-own' })).status).toBe(200);
      const confirmed = await fetch(base + '/api/connected-apps?agentId=' + agent.id + '&statusOnly=true').then(response => response.json());
      expect(confirmed.accounts).toEqual([f.accounts[0]]);
      expect(confirmed.requests[0]).toMatchObject({ id: card.id, status: 'accepted', response: 'Connected' });
      expect((await fetch(base + '/api/connected-apps').then(response => response.json())).accounts).toEqual([]);
      expect((await post('/api/connected-apps/disconnect', { agentId: agent.id, accountId: 'gmail-own' })).status).toBe(200);
      expect(store.appAccountAssigned(f.other.id, 'github', 'github-other')).toBe(true);
    } finally { await server.stop(); }
  });

  it('renders a scoped chat card and replaces Connect only after confirmation, with reduced-motion support', () => {
    const f = fixture();
    const request = f.store.recommendAppConnection(f.conv.id, f.agent.id, { service: 'gmail', name: '<Gmail>', reason: 'Draft <safe> emails.' });
    const cw = { agents: [f.agent], convs: [f.conv], active: f.conv.id, requests: [request] };
    const context = createContext({ S: { cw }, URL, window: { addEventListener() {} }, document: { querySelectorAll: () => [] }, esc: (value: unknown) => String(value ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;') });
    new Script(COWORK_JS + CONNECTED_APPS_JS).runInContext(context);
    context.cwSetAppConnectionState(f.agent.id, { accounts: [] });
    expect(context.cwCharacterActivity(f.agent.id)).toBe('Ready');
    const initial = context.cwAppConnectionHtml(request);
    expect(initial).toContain('data-cwconnectrequest');
    expect(initial).toContain('For Writer only');
    expect(initial).toContain('&lt;Gmail&gt;');
    expect(initial).toContain('&lt;safe&gt;');
    context.cwSetAppConnectionState(f.agent.id, { accounts: [{ ...f.accounts[0], status: 'INITIATED' }] });
    expect(context.cwAppConnectionHtml(request)).toContain('data-cwconnectrequest');
    context.cwSetAppConnectionState(f.agent.id, { accounts: [f.accounts[0]] });
    const connected = context.cwAppConnectionHtml(request);
    expect(connected).not.toContain('data-cwconnectrequest');
    expect(connected).toContain('Connected');
    expect(connected).toContain('just-connected');
    expect(CONNECTED_APPS_CSS).toContain('prefers-reduced-motion:reduce');
    context.cwSetAppConnectionState(f.agent.id, { accounts: [] });
    expect(context.cwAppConnectionHtml(request)).toContain('data-cwconnectrequest');
  });
});
