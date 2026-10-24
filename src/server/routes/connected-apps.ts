import type { IncomingMessage, ServerResponse } from 'node:http';
import { AppAuth } from '../app-auth.js';
import type { CoworkStore } from '../../cowork/store.js';
import type { ComposioConnections } from '../../connections/composio.js';
import { MAIL_PROVIDERS, type MailConnections } from '../../connections/mail.js';
import { MAIL_SERVICE_SLUG, type ConnectionsHub } from '../../connections/provider.js';
import type { MailInboxMonitor } from '../../connections/mail-inbox-monitor.js';

export interface ConnectedAppsRouteDeps {
  isSameOrigin(req: IncomingMessage): boolean;
  appAuth: Pick<AppAuth, 'secure' | 'authenticated'>;
  cowork(): CoworkStore;
  appHub: Pick<ConnectionsHub, 'accounts' | 'accountStatusIncomplete'>;
  connectedApps: Pick<ComposioConnections, 'configured' | 'setup' | 'catalog' | 'configure' | 'connect'>;
  mailConnections: Pick<MailConnections, 'accounts' | 'setup' | 'detect' | 'connect' | 'remove' | 'rediscover' | 'setInboxWatch' | 'check'>;
  mailInboxMonitor?: Pick<MailInboxMonitor, 'statuses' | 'refresh'>;
  readBody(req: IncomingMessage): Promise<Record<string, unknown>>;
  sendJson(res: ServerResponse, status: number, data: unknown): void;
  publishCowork(conversationId: string): void;
  dispatchAgentWake(conversationId: string, agentId: string, instruction: string): boolean;
}

/** Authentication remains in the server; this domain also enforces its existing
 * same-origin and HTTPS setup rules before touching a connection provider. */
export async function connectedAppsRoutes(req: IncomingMessage, res: ServerResponse, url: URL, method: string, deps: ConnectedAppsRouteDeps): Promise<void> {
  const path = url.pathname;
  if (!deps.isSameOrigin(req)) {
    deps.sendJson(res, 403, { error: 'cross-origin request rejected' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (path === '/api/connected-apps' && method === 'GET') {
      const store = deps.cowork(),
        agentId = url.searchParams.get('agentId') ?? '';
      if (agentId && !store.getAgent(agentId)) {
        deps.sendJson(res, 404, { error: 'Teammate not found.' });
        return;
      }
      const appPermissions = store
        .appPermissions()
        .filter((permission) => !agentId || permission.agentId === agentId)
        .map((permission) => ({ ...permission, agentName: store.getAgent(permission.agentId)?.name ?? 'Teammate' }));
      const agents = store.listAgents().map((agent) => ({ id: agent.id, name: agent.name }));
      // Mailboxes are provider-neutral, so they are reported separately: the
      // page can connect any mailbox before an OAuth provider key exists.
      let mailboxes: Awaited<ReturnType<MailConnections['accounts']>> = [],
        mailUnavailable = false;
      try {
        mailboxes = await deps.mailConnections.accounts();
      } catch {
        mailUnavailable = true;
      }
      const mailboxAssigned = (accountId: string) => Boolean(agentId) && store.appAccountAssigned(agentId, MAIL_SERVICE_SLUG, accountId);
      const mail = {
        accounts: mailboxes.filter((account) => mailboxAssigned(account.id)),
        available: mailboxes.filter((account) => !mailboxAssigned(account.id)),
        providers: MAIL_PROVIDERS,
        keyStorage: deps.mailConnections.setup.keyStorage,
        watching: deps.mailInboxMonitor?.statuses() ?? {},
      };
      if (!agentId) {
        const availableAccounts =
          url.searchParams.get('available') === 'true' ? (await deps.appHub.accounts()).filter((account) => account.status === 'ACTIVE' && !account.disabled) : [];
        deps.sendJson(res, 200, {
          configured: deps.connectedApps.configured,
          ...deps.connectedApps.setup,
          agents,
          agentId,
          accounts: [],
          availableAccounts,
          services: [],
          appPermissions,
          mail,
          accountStatusIncomplete: mailUnavailable || deps.appHub.accountStatusIncomplete,
        });
        return;
      }
      const allAccounts = await deps.appHub.accounts();
      const accountStatusIncomplete = mailUnavailable || deps.appHub.accountStatusIncomplete;
      if (accountStatusIncomplete)
        for (const saved of store.appConnections(agentId)) {
          if (!allAccounts.some((account) => account.id === saved.accountId)) allAccounts.push({ id: saved.accountId, toolkit: saved.service, status: 'UNKNOWN', disabled: true });
        }
      const accounts = allAccounts.filter((account) => store.appAccountAssigned(agentId, account.toolkit, account.id));
      const availableAccounts = allAccounts.filter(
        (account) => !store.appAccountAssigned(agentId, account.toolkit, account.id) && account.status === 'ACTIVE' && !account.disabled,
      );
      const connectedToolkits = new Set([
        ...accounts.filter((account) => account.status === 'ACTIVE' && !account.disabled).map((account) => account.toolkit),
        ...mail.accounts.map((account) => account.toolkit),
      ]);
      const requests = store
        .listConversations()
        .flatMap((conversation) => store.requests(conversation.id))
        .filter((request) => request.agentId === agentId && request.appConnection);
      for (const request of requests) {
        if (request.status !== 'open' || !connectedToolkits.has(request.appConnection!.service)) continue;
        store.resolveRequest(request.id, 'accepted', 'Connected');
        deps.publishCowork(request.conversationId);
        if (request.appConnection?.resumeWork) {
          const instruction = `${request.appConnection.name} is now connected specifically for you. Continue the user's pending task that needed this app; use connected_apps list to select your active account. If no pending task needs it, acknowledge the connection briefly.`;
          if (!deps.dispatchAgentWake(request.conversationId, request.agentId, instruction))
            store.addFollowUp({ conversationId: request.conversationId, agentId: request.agentId, note: instruction, dueAt: new Date().toISOString() });
        }
      }
      let catalog: Awaited<ReturnType<ComposioConnections['catalog']>> = { services: [] },
        catalogUnavailable = false;
      if (url.searchParams.get('statusOnly') !== 'true' && deps.connectedApps.configured) {
        try {
          catalog = await deps.connectedApps.catalog(url.searchParams.get('search') ?? '', url.searchParams.get('cursor') ?? undefined);
        } catch {
          catalogUnavailable = true;
        }
      }
      // Provider catalog status is global; derive each card from this teammate's assignments.
      const services = catalog.services.map((service) => {
        const account =
          accounts.find((account) => account.toolkit === service.slug && account.status === 'ACTIVE' && !account.disabled) ??
          accounts.find((account) => account.toolkit === service.slug);
        return { ...service, status: account?.status, accountId: account?.id };
      });
      deps.sendJson(res, 200, {
        configured: deps.connectedApps.configured,
        ...deps.connectedApps.setup,
        ...catalog,
        services,
        agents,
        agentId,
        accounts,
        availableAccounts,
        appPermissions,
        requests,
        mail,
        accountStatusIncomplete,
        catalogUnavailable,
      });
      return;
    }
    const permissionMatch = path.match(/^\/api\/connected-apps\/permissions\/([\w-]+)$/);
    if (permissionMatch && method === 'DELETE') {
      const removed = deps.cowork().revokeAppPermission(permissionMatch[1]!);
      deps.sendJson(res, removed ? 200 : 404, removed ? { ok: true } : { error: 'App permission not found.' });
      return;
    }
    if (path === '/api/connected-apps/configure' && method === 'POST') {
      if (!AppAuth.local(req) && (!deps.appAuth.secure(req) || !deps.appAuth.authenticated(req))) {
        deps.sendJson(res, 403, { error: 'Integration setup requires an authenticated HTTPS session.' });
        return;
      }
      const body = await deps.readBody(req);
      await deps.connectedApps.configure(String(body['apiKey'] ?? ''));
      deps.sendJson(res, 200, { ok: true });
      return;
    }
    if (path === '/api/connected-apps/mail/detect' && method === 'GET') {
      // The browser cannot resolve SRV records or read another host's
      // autoconfig document, so server discovery for self-hosted mail hosts
      // (Mailcow and friends) runs here. It only suggests endpoints: nothing
      // is authenticated or stored, and no credential is ever involved.
      try {
        const address = url.searchParams.get('address') ?? '';
        deps.sendJson(res, 200, { address, ...(await deps.mailConnections.detect({ address, fresh: url.searchParams.get('fresh') === 'true' })) });
        return;
      } catch (error) {
        deps.sendJson(res, 400, { error: error instanceof Error ? error.message : 'Enter a valid email address.' });
        return;
      }
    }
    if (path === '/api/connected-apps/mail' && method === 'POST') {
      if (!AppAuth.local(req) && (!deps.appAuth.secure(req) || !deps.appAuth.authenticated(req))) {
        deps.sendJson(res, 403, { error: 'Mailbox setup requires an authenticated HTTPS session.' });
        return;
      }
      const body = await deps.readBody(req);
      const store = deps.cowork(),
        agentId = String(body['agentId'] ?? '');
      if (!store.getAgent(agentId)) {
        deps.sendJson(res, 400, { error: 'Choose a teammate for this mailbox.' });
        return;
      }
      try {
        const result = await deps.mailConnections.connect(body);
        store.assignAppAccount(agentId, MAIL_SERVICE_SLUG, result.account.id);
        deps.sendJson(res, 200, result);
        return;
      } catch (error) {
        // These messages are written for the user and never include the password.
        deps.sendJson(res, 400, { error: error instanceof Error ? error.message : 'Could not connect this mailbox.' });
        return;
      }
    }
    if (path === '/api/connected-apps/mail/remove' && method === 'POST') {
      const body = await deps.readBody(req);
      const accountId = String(body['accountId'] ?? '');
      const store = deps.cowork();
      store.revokeAppAccountPermissions(accountId);
      try {
        await deps.mailConnections.remove(accountId);
        deps.sendJson(res, 200, { ok: true });
        return;
      } catch (error) {
        deps.sendJson(res, 400, { error: error instanceof Error ? error.message : 'Could not remove this mailbox.' });
        return;
      }
    }
    if (path === '/api/connected-apps/mail/check' && method === 'POST') {
      if (!AppAuth.local(req) && (!deps.appAuth.secure(req) || !deps.appAuth.authenticated(req))) {
        deps.sendJson(res, 403, { error: 'Mailbox checks require an authenticated HTTPS session.' });
        return;
      }
      const body = await deps.readBody(req);
      try {
        deps.sendJson(res, 200, await deps.mailConnections.check(String(body['accountId'] ?? '')));
      } catch {
        deps.sendJson(res, 400, { error: 'Could not check this saved mailbox. Refresh Connections and try again.' });
      }
      return;
    }
    if (path === '/api/connected-apps/mail/rediscover' && method === 'POST') {
      if (!AppAuth.local(req) && (!deps.appAuth.secure(req) || !deps.appAuth.authenticated(req))) {
        deps.sendJson(res, 403, { error: 'Mailbox setup requires an authenticated HTTPS session.' });
        return;
      }
      const body = await deps.readBody(req);
      try {
        const result = await deps.mailConnections.rediscover(String(body['accountId'] ?? ''));
        void deps.mailInboxMonitor?.refresh();
        deps.sendJson(res, 200, result);
        return;
      } catch (error) {
        deps.sendJson(res, 400, { error: error instanceof Error ? error.message : 'Could not verify published mail settings.' });
        return;
      }
    }
    if (path === '/api/connected-apps/mail/watch' && method === 'POST') {
      const body = await deps.readBody(req);
      if (typeof body['enabled'] !== 'boolean') {
        deps.sendJson(res, 400, { error: 'enabled must be a boolean' });
        return;
      }
      try {
        deps.mailConnections.setInboxWatch(String(body['accountId'] ?? ''), body['enabled']);
        void deps.mailInboxMonitor?.refresh();
        deps.sendJson(res, 200, { ok: true });
        return;
      } catch {
        deps.sendJson(res, 400, { error: 'Choose a connected mailbox.' });
        return;
      }
    }
    if (path === '/api/connected-apps/connect' && method === 'POST') {
      const body = await deps.readBody(req);
      const store = deps.cowork(),
        agentId = String(body['agentId'] ?? ''),
        service = String(body['service'] ?? '');
      if (!store.getAgent(agentId)) {
        deps.sendJson(res, 400, { error: 'Choose a teammate for this connection.' });
        return;
      }
      const request = body['requestId'] ? store.getRequest(String(body['requestId'])) : undefined;
      if (body['requestId'] && (!request?.appConnection || request.agentId !== agentId || request.appConnection.service !== service || request.status === 'dismissed')) {
        deps.sendJson(res, 400, { error: 'This app recommendation belongs to another teammate or service.' });
        return;
      }
      if (!deps.connectedApps.configured) {
        deps.sendJson(res, 400, { code: 'COMPOSIO_SETUP_REQUIRED', error: 'Set up Composio in Connections, then click Connect for this app.' });
        return;
      }
      let link: { url: string; accountId: string };
      try {
        link = await deps.connectedApps.connect(service);
      } catch (error) {
        // Never expose SDK errors: they may contain credentials or request data.
        const status = error && typeof error === 'object' ? Number((error as { status?: unknown }).status) : 0;
        const detail =
          status === 401 || status === 403
            ? 'Composio denied sign-in. Check that your Composio key allows session management and tool execution, then retry in Connections.'
            : 'Composio could not create a sign-in link for this app. Check its authentication setup in Composio and retry from Connections.';
        deps.sendJson(res, 502, { code: 'APP_SIGN_IN_FAILED', error: detail });
        return;
      }
      store.assignAppAccount(agentId, service, link.accountId);
      deps.sendJson(res, 200, link);
      return;
    }
    if (path === '/api/connected-apps/assign' && method === 'POST') {
      const body = await deps.readBody(req);
      const store = deps.cowork(),
        agentId = String(body['agentId'] ?? ''),
        accountId = String(body['accountId'] ?? '');
      if (!store.getAgent(agentId)) {
        deps.sendJson(res, 400, { error: 'Choose a teammate for this connection.' });
        return;
      }
      const account = (await deps.appHub.accounts()).find((account) => account.id === accountId && account.status === 'ACTIVE' && !account.disabled);
      if (!account) {
        deps.sendJson(res, 400, { error: 'Choose an active account belonging to you.' });
        return;
      }
      store.assignAppAccount(agentId, account.toolkit, account.id);
      deps.sendJson(res, 200, { ok: true });
      return;
    }
    if (path === '/api/connected-apps/disconnect' && method === 'POST') {
      const body = await deps.readBody(req);
      const store = deps.cowork(),
        agentId = String(body['agentId'] ?? '');
      if (!store.getAgent(agentId)) {
        deps.sendJson(res, 400, { error: 'Choose a teammate for this connection.' });
        return;
      }
      // Removing one teammate's access must preserve another teammate's account.
      store.unassignAppAccount(agentId, String(body['accountId'] ?? ''));
      deps.sendJson(res, 200, { ok: true });
      return;
    }
    deps.sendJson(res, 404, { error: 'Connection route not found.' });
    return;
  } catch {
    deps.sendJson(res, 502, { error: 'Could not reach or authorize the service. Check your Composio setup and try again.' });
    return;
  }
}
