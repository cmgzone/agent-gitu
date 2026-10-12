import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompanyStore } from '../src/company/store.js';
import { CoworkStore } from '../src/cowork/store.js';
import { companyApi, type CompanyApiDeps } from '../src/company/api.js';
import type { ConnectedApp } from '../src/connections/composio.js';

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-company-apps-')), store = new CompanyStore(root);
  const first = store.create({ name: 'First' }), second = store.create({ name: 'Second' });
  const a = new CoworkStore(path.join(root, 'first.json'), undefined, { companyId: first.id });
  const b = new CoworkStore(path.join(root, 'second.json'), undefined, { companyId: second.id });
  const lead = a.saveAgent({ name: 'Lead', systemPrompt: 'Help' }), colleague = a.saveAgent({ name: 'Researcher', systemPrompt: 'Help' });
  const outsider = b.saveAgent({ name: 'Other company', systemPrompt: 'Help' });
  const conversation = a.saveConversation({ kind: 'dm', memberIds: [lead.id, colleague.id] });
  store.update(first.id, { leadId: lead.id, conversationId: conversation.id });
  let current = a, owned: ConnectedApp[] = [{ id: 'existing-mail', toolkit: 'mail', status: 'ACTIVE', disabled: false }];
  const provider = { configured: true, setup: { canConfigure: true, keyStorage: 'test-encrypted' }, catalog: vi.fn(async () => ({ services: [{ slug: 'gmail', name: 'Gmail' }] })), connect: vi.fn(async () => ({ url: 'https://connect.composio.dev/test', accountId: 'new-gmail' })) };
  const apps = { provider, accounts: vi.fn(async () => owned), configure: vi.fn(async () => {}), secure: vi.fn(() => true), mail: { setup: { canConfigure: true, keyStorage: 'test-encrypted' }, accounts: vi.fn(async () => []), detect: vi.fn(async () => ({ domain: 'example.test', source: 'none' as const, found: false })), connect: vi.fn(async () => ({ account: { id: 'new-mail', toolkit: 'mail' as const, status: 'ACTIVE' as const, disabled: false as const, label: 'Support', address: 'support@example.test', provider: 'custom', createdAt: '' } })) } };
  const d: CompanyApiDeps = { store, apps, body: async () => ({}), send: vi.fn(), scoped: (c, work) => { current = c.id === first.id ? a : b; return work(); }, cowork: () => current, legacyAgent: () => undefined, routeCowork: async () => false, start: vi.fn(), pause: vi.fn() };
  async function call(suffix = '', method = 'GET', body: Record<string, unknown> = {}, id = first.id) {
    let response: any;
    d.body = async () => body; d.send = (_r, status, value) => { response = { status, ...value as object }; };
    await companyApi({ url: '/api/companies/' + id + '/connected-apps' + suffix } as never, {} as never, '/api/companies/' + id + '/connected-apps' + suffix, method, d);
    return response;
  }
  cleanups.push(() => { store.close(); rmSync(root, { recursive: true, force: true }); });
  return { store, first, second, a, b, lead, colleague, outsider, conversation, apps, call, start: d.start, owned: (value: ConnectedApp[]) => { owned = value; } };
}
describe('Company connected accounts', () => {
  it('connects a company resource without requiring any agent and persists pending sign-in', async () => {
    const f = fixture(); await f.call('/connect', 'POST', { service: 'gmail', agentIds: [] });
    expect(f.store.get(f.first.id)?.accountIds).toEqual(['new-gmail']);
    expect(f.a.appConnections(f.lead.id)).toEqual([]);
    expect((await f.call()).accounts).toEqual([expect.objectContaining({ id: 'new-gmail', toolkit: 'gmail', status: 'PENDING' })]);
    expect((await f.call('', 'GET', {}, f.second.id)).accounts).toEqual([]);
    expect(f.store.list('connected-account', f.first.id)).toHaveLength(1);
  });
  it('assigns an existing owner account only to the selected company team members', async () => {
    const f = fixture(); await f.call('/assign', 'POST', { accountId: 'existing-mail', agentIds: [f.colleague.id] });
    expect(f.a.appAccountAssigned(f.colleague.id, 'mail', 'existing-mail')).toBe(true);
    expect(f.a.appAccountAssigned(f.lead.id, 'mail', 'existing-mail')).toBe(false);
    const data = await f.call(); expect(data.assignments['existing-mail']).toEqual([f.colleague.id]);
    expect(data.availableAccounts).toEqual([]); expect(data.agents.map((a: any) => a.id)).not.toContain(f.outsider.id);
    await f.call('/access', 'POST', { accountId: 'existing-mail', agentIds: [] });
    expect(f.store.get(f.first.id)?.accountIds).toEqual(['existing-mail']);
    expect(f.a.appConnections(f.colleague.id)).toEqual([]);
  });
  it('rejects foreign agents and ungranted accounts before provisioning or granting access', async () => {
    const f = fixture(); await expect(f.call('/connect', 'POST', { service: 'gmail', agentIds: [f.outsider.id] })).rejects.toThrow('belonging to this company');
    expect(f.apps.provider.connect).not.toHaveBeenCalled();
    await expect(f.call('/access', 'POST', { accountId: 'existing-mail', agentIds: [f.lead.id] })).rejects.toThrow('not granted');
    await expect(f.call('/assign', 'POST', { accountId: 'unowned', agentIds: [] })).rejects.toThrow('belonging to you');
  });
  it('removes company access without revoking another company’s shared provider account', async () => {
    const f = fixture(); await f.call('/assign', 'POST', { accountId: 'existing-mail', agentIds: [f.lead.id] });
    await f.call('/assign', 'POST', { accountId: 'existing-mail', agentIds: [f.outsider.id] }, f.second.id);
    await f.call('/disconnect', 'POST', { accountId: 'existing-mail' });
    expect(f.store.get(f.first.id)?.accountIds).toEqual([]); expect(f.a.appConnections(f.lead.id)).toEqual([]);
    expect(f.store.get(f.second.id)?.accountIds).toEqual(['existing-mail']); expect(f.b.appAccountAssigned(f.outsider.id, 'mail', 'existing-mail')).toBe(true);
  });
  it('resolves app recommendations only after active sign-in and assignment to their agent', async () => {
    const f = fixture(), request = f.a.recommendAppConnection(f.conversation.id, f.colleague.id, { service: 'gmail', name: 'Gmail', reason: 'Read mail', resumeWork: true });
    await f.call('/connect', 'POST', { service: 'gmail', agentIds: [f.lead.id] });
    await f.call(); expect(f.a.getRequest(request.id)?.status).toBe('open');
    f.owned([{ id: 'new-gmail', toolkit: 'gmail', status: 'ACTIVE', disabled: false }]);
    await f.call(); expect(f.a.getRequest(request.id)?.status).toBe('open');
    await f.call('/access', 'POST', { accountId: 'new-gmail', agentIds: [f.colleague.id] });
    await f.call(); expect(f.a.getRequest(request.id)?.status).toBe('accepted');
    await f.call(); expect(f.store.jobs(f.first.id)).toEqual([]); // Drafts never wake agents.
  });
  it('protects mailbox credentials and sanitizes provider sign-in failures', async () => {
    const f = fixture(); f.apps.secure.mockReturnValue(false);
    await expect(f.call('/mail', 'POST', { password: 'secret', agentIds: [] })).rejects.toThrow('HTTPS');
    expect(f.apps.mail.connect).not.toHaveBeenCalled(); f.apps.secure.mockReturnValue(true);
    await f.call('/mail', 'POST', { password: 'secret', agentIds: [] }); expect(f.store.get(f.first.id)?.accountIds).toContain('new-mail');
    f.apps.provider.connect.mockRejectedValueOnce(new Error('token=private-key'));
    await expect(f.call('/connect', 'POST', { service: 'gmail', agentIds: [] })).rejects.toThrow('Could not start sign-in');
    expect(JSON.stringify(f.store.list('connected-account', f.first.id))).not.toContain('secret');
  });
  it('wakes a running company once in the requesting agent’s conversation after sign-in', async () => {
    const f = fixture(); f.store.update(f.first.id, { purpose: 'Handle support mail', monthlyBudgetUsd: null, maxFileBytes: null, fileLimitChosen: true }); f.store.transition(f.first.id, 'running');
    const request = f.a.recommendAppConnection(f.conversation.id, f.colleague.id, { service: 'mail', name: 'Mailbox', reason: 'Read support mail', resumeWork: true });
    await f.call('/assign', 'POST', { accountId: 'existing-mail', agentIds: [f.colleague.id] });
    await f.call(); await f.call();
    expect(f.a.getRequest(request.id)?.status).toBe('accepted');
    const jobs = f.store.jobs(f.first.id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ kind: 'wake', payload: { agentId: f.colleague.id, conversationId: f.conversation.id } });
    expect(f.start).toHaveBeenCalledTimes(1);
  });
  it('does not restore revoked company access when a delayed team update completes', async () => {
    const f = fixture(); await f.call('/assign', 'POST', { accountId: 'existing-mail', agentIds: [f.lead.id] });
    let resolve!: (accounts: ConnectedApp[]) => void;
    f.apps.accounts.mockImplementationOnce(() => new Promise<ConnectedApp[]>(done => { resolve = done; }));
    const pending = f.call('/access', 'POST', { accountId: 'existing-mail', agentIds: [f.colleague.id] });
    await vi.waitFor(() => expect(resolve).toBeDefined());
    await f.call('/disconnect', 'POST', { accountId: 'existing-mail' });
    resolve([{ id: 'existing-mail', toolkit: 'mail', status: 'ACTIVE', disabled: false }]);
    await expect(pending).rejects.toThrow('access was removed');
    expect(f.store.get(f.first.id)?.accountIds).toEqual([]);
    expect(f.a.appConnections(f.colleague.id)).toEqual([]);
  });
});
