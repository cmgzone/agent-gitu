/**
 * One provider-neutral surface for "apps a teammate has been given".
 *
 * The cowork `connected_apps` tool and the Connections API both talk to this
 * interface instead of Composio directly, so a mailbox connected over IMAP/SMTP
 * gets the same list / recommend / review-before-execute lifecycle as an OAuth
 * app. Providers that are not configured degrade to an empty contribution
 * instead of failing the whole call.
 */

import type { ComposioConnections } from './composio.js';
import type { MailAccount, MailConnections } from './mail.js';

export interface ConnectedAppAccount {
  id: string;
  toolkit: string;
  status: string;
  disabled: boolean;
  /** Present for mailboxes so the UI can name the account without a provider lookup. */
  label?: string;
  address?: string;
}

export interface ConnectedAppService {
  slug: string;
  name: string;
  logo?: string;
  status?: string;
  accountId?: string;
}

export interface ConnectedAppTool {
  slug: string;
  name: string;
  description?: string;
  inputParameters?: unknown;
}

export interface ConnectedAppsProvider {
  readonly accountStatusIncomplete?: boolean;
  readonly configured: boolean;
  readonly setup: { canConfigure: boolean; keyStorage: string };
  catalog(search: string, cursor?: string): Promise<{ services: ConnectedAppService[]; cursor?: string }>;
  accounts(): Promise<ConnectedAppAccount[]>;
  tools(service: string, query?: string, tool?: string): Promise<ConnectedAppTool[]>;
  execute(service: string, tool: string, args: Record<string, unknown>, accountId: string): Promise<unknown>;
}

export const MAIL_SERVICE_SLUG = 'mail';

export const MAIL_SERVICE_CARD: ConnectedAppService = {
  slug: MAIL_SERVICE_SLUG,
  name: 'Mailbox',
};

export class ConnectionsHub implements ConnectedAppsProvider {
  accountStatusIncomplete = false;
  constructor(
    private readonly composio: ComposioConnections,
    private readonly mail: MailConnections,
  ) {}

  /** Mail always works, so the tool is available even without an OAuth provider. */
  get configured(): boolean {
    return this.mail.configured || this.composio.configured;
  }

  get setup(): { canConfigure: boolean; keyStorage: string } {
    const setup = this.composio.setup;
    return { canConfigure: setup.canConfigure || this.mail.setup.canConfigure, keyStorage: setup.keyStorage };
  }

  async catalog(search: string, cursor?: string): Promise<{ services: ConnectedAppService[]; cursor?: string }> {
    const services: ConnectedAppService[] = [];
    const needle = search.trim().toLowerCase();
    if (!needle || MAIL_SERVICE_CARD.name.toLowerCase().includes(needle) || MAIL_SERVICE_SLUG.includes(needle)) services.push(MAIL_SERVICE_CARD);
    if (this.composio.configured) {
      try {
        const catalog = await this.composio.catalog(search, cursor);
        services.push(...catalog.services);
        return { services, ...(catalog.cursor ? { cursor: catalog.cursor } : {}) };
      } catch {
        // A provider outage must not hide the mailboxes that still work.
      }
    }
    return { services };
  }

  async accounts(): Promise<ConnectedAppAccount[]> {
    this.accountStatusIncomplete = false;
    const mail = await this.mail.accounts();
    const accounts: ConnectedAppAccount[] = mail.map((account: MailAccount) => ({ ...account, label: account.label, address: account.address }));
    if (this.composio.configured) {
      try {
        accounts.push(...(await this.composio.accounts()));
      } catch {
        this.accountStatusIncomplete = true;
        // Keep the mailbox list; a Composio failure is reported by its own UI.
      }
    }
    return accounts;
  }

  async tools(service: string, query?: string, tool?: string): Promise<ConnectedAppTool[]> {
    if (service === MAIL_SERVICE_SLUG) {
      const tools = this.mail.tools();
      return tools.filter(item => tool ? item.slug === tool : !query || `${item.slug} ${item.name} ${item.description ?? ''}`.toLowerCase().includes(query.toLowerCase()));
    }
    return this.composio.tools(service, query, tool);
  }

  async execute(service: string, tool: string, args: Record<string, unknown>, accountId: string): Promise<unknown> {
    if (service === MAIL_SERVICE_SLUG) return this.mail.execute(tool, args, accountId);
    return this.composio.execute(service, tool, args, accountId);
  }
}
