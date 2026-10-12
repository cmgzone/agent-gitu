import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ComposioConnections, ConnectedApp } from '../connections/composio.js';
import { MAIL_PROVIDERS, type MailConnections } from '../connections/mail.js';
import type { CompanyApiDeps } from './api.js';
import type { Company } from './store.js';

export interface CompanyApps {
  provider: Pick<ComposioConnections, 'configured' | 'setup' | 'catalog' | 'connect'>;
  mail: Pick<MailConnections, 'accounts' | 'connect' | 'detect' | 'setup'>;
  accounts: () => Promise<ConnectedApp[]>;
  configure: (req: IncomingMessage, key: string) => Promise<void>;
  secure: (req: IncomingMessage) => boolean;
}

/** Owner-facing account management. Company grants and teammate assignments
 * are separate, and only this company's scoped Cowork store is changed. */
export async function companyConnectedApps(req: IncomingMessage, res: ServerResponse, suffix: string, method: string, company: Company, d: CompanyApiDeps): Promise<boolean> {
  if (!suffix.startsWith('/connected-apps')) return false;
  const apps = d.apps;
  if (!apps) { d.send(res, 503, { error: 'Company connections are unavailable.' }); return true; }
  const cowork = d.cowork(), url = new URL(req.url ?? '/', 'http://localhost'), route = suffix.slice('/connected-apps'.length);
  const owned = async () => {
    try { return await apps.accounts(); }
    catch { throw new Error('Could not load connected accounts. Check the connection provider and refresh.'); }
  };
  const agentsFor = (body: Record<string, unknown>): string[] => {
    const ids = body['agentIds'] === undefined ? (company.leadId ? [company.leadId] : []) : body['agentIds'];
    if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !cowork.getAgent(id))) throw new Error('Choose team members belonging to this company.');
    return [...new Set(ids as string[])];
  };
  const grant = (account: ConnectedApp, ids: string[]) => {
    const current = d.store.get(company.id)!;
    d.store.update(company.id, { accountIds: [...new Set([...current.accountIds, account.id])] });
    d.store.saveResource('connected-account', company.id + ':' + account.id, company.id, account);
    for (const agent of cowork.listAgents()) {
      if (ids.includes(agent.id)) cowork.assignAppAccount(agent.id, account.toolkit, account.id);
      else cowork.unassignAppAccount(agent.id, account.id);
    }
  };
  if (!route && method === 'GET') {
    const all = await owned(), ids = d.store.get(company.id)!.accountIds;
    const saved = d.store.list<ConnectedApp>('connected-account', company.id);
    const accounts = ids.map(id => {
      const live = all.find(a => a.id === id), previous = saved.find(a => a.id === id);
      if (live) {
        if (JSON.stringify(live) !== JSON.stringify(previous)) d.store.saveResource('connected-account', company.id + ':' + id, company.id, live);
        return live;
      }
      return { ...previous, id, toolkit: previous?.toolkit ?? '', status: previous?.status === 'PENDING' ? 'PENDING' : 'UNAVAILABLE', disabled: previous?.status !== 'PENDING' };
    });
    const active = accounts.filter(a => a.status === 'ACTIVE' && !a.disabled);
    for (const conversation of cowork.listConversations()) for (const request of cowork.requests(conversation.id)) {
      if (request.status !== 'open' || !request.appConnection || !active.some(a => a.toolkit === request.appConnection!.service && cowork.appAccountAssigned(request.agentId, a.toolkit, a.id))) continue;
      cowork.resolveRequest(request.id, 'accepted', 'Connected');
      if (request.appConnection.resumeWork && d.store.get(company.id)?.state === 'running') {
        d.store.enqueue(company.id, 'wake', { agentId: request.agentId, conversationId: request.conversationId, note: request.appConnection.name + ' is now connected for you. Continue the pending work that needed it.' }, 'connection:' + request.id);
        d.start();
      }
    }
    let catalog: Awaited<ReturnType<CompanyApps['provider']['catalog']>> = { services: [] };
    if (apps.provider.configured && url.searchParams.get('statusOnly') !== 'true') {
      try { catalog = await apps.provider.catalog(url.searchParams.get('search') ?? '', url.searchParams.get('cursor') ?? undefined); }
      catch { throw new Error('Could not load apps. Check Composio setup and refresh.'); }
    }
    const mailboxes = await apps.mail.accounts();
    d.send(res, 200, { company: { id: company.id, name: company.name }, configured: apps.provider.configured, ...apps.provider.setup, ...catalog,
      accounts, availableAccounts: all.filter(a => !ids.includes(a.id) && a.status === 'ACTIVE' && !a.disabled),
      agents: cowork.listAgents().map(a => ({ id: a.id, name: a.name })),
      assignments: Object.fromEntries(ids.map(id => [id, cowork.listAgents().filter(a => cowork.appConnections(a.id).some(c => c.accountId === id)).map(a => a.id)])),
      mail: { accounts: mailboxes.filter(a => ids.includes(a.id)), available: mailboxes.filter(a => !ids.includes(a.id)), providers: MAIL_PROVIDERS, keyStorage: apps.mail.setup?.keyStorage },
    });
    return true;
  }
  if (route === '/mail/detect' && method === 'GET') { d.send(res, 200, await apps.mail.detect({ address: url.searchParams.get('address') ?? '' })); return true; }
  if (method !== 'POST') { d.send(res, 405, { error: 'Method not allowed.' }); return true; }
  const body = await d.body(req);
  if (route === '/configure') {
    if (!apps.secure(req)) throw new Error('Integration setup requires an authenticated HTTPS session.');
    const key = String(body['apiKey'] ?? '');
    if (!key || key.length > 4096) throw new Error('Enter a valid Composio API key.');
    await apps.configure(req, key); d.send(res, 200, { ok: true }); return true;
  }
  if (route === '/disconnect') {
    const accountId = String(body['accountId'] ?? ''), current = d.store.get(company.id)!;
    if (!current.accountIds.includes(accountId)) { d.send(res, 404, { error: 'Company account not found.' }); return true; }
    d.store.update(company.id, { accountIds: current.accountIds.filter(id => id !== accountId) });
    for (const agent of cowork.listAgents()) cowork.unassignAppAccount(agent.id, accountId);
    d.store.removeResource('connected-account', company.id + ':' + accountId, company.id);
    d.send(res, 200, { ok: true }); return true;
  }
  if (!['/connect', '/mail', '/assign', '/access'].includes(route)) { d.send(res, 404, { error: 'Company connection route not found.' }); return true; }
  const ids = agentsFor(body);
  if (route === '/connect') {
    if (!apps.provider.configured) throw new Error('Set up Composio below, then connect an app.');
    const service = String(body['service'] ?? '');
    if (!/^[a-z0-9_-]{1,100}$/.test(service) || service === 'mail') throw new Error('Choose an app from the catalog.');
    let link: Awaited<ReturnType<CompanyApps['provider']['connect']>>;
    try { link = await apps.provider.connect(service); }
    catch { throw new Error('Could not start sign-in. Check this app’s setup in Composio and retry.'); }
    grant({ id: link.accountId, toolkit: service, status: 'PENDING', disabled: false }, ids);
    d.send(res, 200, link); return true;
  }
  if (route === '/mail') {
    if (!apps.secure(req)) throw new Error('Mailbox setup requires an authenticated HTTPS session.');
    const result = await apps.mail.connect(body); grant(result.account, ids);
    d.send(res, 201, result); return true;
  }
  const accountId = String(body['accountId'] ?? '');
  if (route === '/access' && !d.store.get(company.id)!.accountIds.includes(accountId)) throw new Error('Account is not granted to this company.');
  const account = (await owned()).find(a => a.id === accountId && a.status === 'ACTIVE' && !a.disabled);
  if (!account) throw new Error('Choose an active account belonging to you.');
  if (route === '/access' && !d.store.get(company.id)!.accountIds.includes(accountId)) throw new Error('Company access was removed. Refresh before making changes.');
  grant(account, ids); d.send(res, 200, { ok: true }); return true;
}
