import { Composio } from '@composio/core';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ensureGituHome } from '../workspace/home.js';

export interface ConnectedApp {
  id: string;
  toolkit: string;
  status: string;
  disabled: boolean;
}
export interface ServiceCard {
  slug: string;
  name: string;
  logo?: string;
  status?: string;
  accountId?: string;
}

/** Provider keys are protected with Windows DPAPI, scoped to the OS user. */
export class ComposioKeyStore {
  private get file(): string {
    return path.join(ensureGituHome().settings, 'composio-key.dpapi');
  }
  get configured(): boolean {
    return Boolean(process.env['COMPOSIO_API_KEY']) || existsSync(this.file);
  }
  private crypt(value: string, decrypt: boolean): string {
    if (process.platform !== 'win32') throw new Error('Set COMPOSIO_API_KEY on the server to configure Composio on this operating system.');
    const script = `Add-Type -AssemblyName System.Security; $value = [Console]::In.ReadToEnd(); ${
      decrypt
        ? '$bytes = [Convert]::FromBase64String($value); $result = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Text.Encoding]::UTF8.GetString($result))'
        : '$bytes = [Text.Encoding]::UTF8.GetBytes($value); $result = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))'
    }`;
    return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      input: value,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  }
  read(): string | undefined {
    if (process.env['COMPOSIO_API_KEY']) return process.env['COMPOSIO_API_KEY'];
    return existsSync(this.file) ? this.crypt(readFileSync(this.file, 'utf8'), true) : undefined;
  }
  save(value: string): void {
    writeFileSync(this.file, this.crypt(value, false), { mode: 0o600 });
  }
}

type Client = Pick<Composio, 'sessions' | 'connectedAccounts' | 'tools' | 'toolkits' | 'getClient'>;
export class ComposioConnections {
  private sdk?: Client;
  private session?: ReturnType<Client['sessions']['create']>;
  constructor(
    private readonly owner: () => string,
    private readonly keys = new ComposioKeyStore(),
    private readonly factory: (key: string) => Client = (key) => new Composio({ apiKey: key, allowTracking: false, fileUploadDirs: false }),
  ) {}
  get configured(): boolean {
    return this.keys.configured;
  }
  private client(): Client {
    if (!this.sdk) {
      const key = this.keys.read();
      if (!key) throw new Error('Set up Composio in Connections first.');
      this.sdk = this.factory(key);
    }
    return this.sdk;
  }
  private userSession() {
    if (!this.session) {
      const owner = this.owner();
      const file = path.join(ensureGituHome().settings, 'composio-session.json');
      const saved = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as { owner: string; sessionId: string }) : undefined;
      this.session = (saved?.owner === owner && saved.sessionId ? this.client().sessions.use(saved.sessionId) : this.client().sessions.create(owner, { manageConnections: false }))
        .then((session) => {
          writeFileSync(file, JSON.stringify({ owner, sessionId: session.sessionId }), { mode: 0o600 });
          return session;
        })
        .catch((error) => {
          this.session = undefined;
          throw error;
        });
    }
    return this.session;
  }
  async configure(key: string): Promise<void> {
    if (process.env['COMPOSIO_API_KEY']) throw new Error('Composio is configured by the server environment.');
    if (!key.trim() || key.length > 4096) throw new Error('Enter a valid Composio API key.');
    const sdk = this.factory(key.trim());
    await sdk.toolkits.get({ limit: 1 });
    this.keys.save(key.trim());
    this.sdk = sdk;
    this.session = undefined;
    const file = path.join(ensureGituHome().settings, 'composio-session.json');
    // A session belongs to the provider project; key changes create a fresh one.
    writeFileSync(file, JSON.stringify({ owner: '', sessionId: '' }), { mode: 0o600 });
  }
  async catalog(search = '', cursor?: string): Promise<{ services: ServiceCard[]; cursor?: string }> {
    const session = await this.userSession();
    const result = await session.toolkits({ search: search.slice(0, 100), cursor, limit: 50 });
    return {
      services: result.items.map((item) => ({
        slug: item.slug,
        name: item.name,
        logo: item.logo,
        status: item.connection?.connectedAccount?.status,
        accountId: item.connection?.connectedAccount?.id,
      })),
      cursor: result.cursor,
    };
  }
  async accounts(): Promise<ConnectedApp[]> {
    const items: ConnectedApp[] = [];
    let cursor: string | undefined;
    do {
      const result = await this.client().connectedAccounts.list({ userIds: [this.owner()], accountType: 'PRIVATE', limit: 100, cursor });
      items.push(...result.items.map((account) => ({ id: account.id, toolkit: account.toolkit.slug, status: account.status, disabled: account.isDisabled })));
      cursor = result.nextCursor ?? undefined;
    } while (cursor && items.length < 1000);
    return items;
  }
  async connect(slug: string): Promise<{ url: string }> {
    if (!/^[a-z0-9_-]{1,100}$/.test(slug)) throw new Error('Invalid service.');
    const session = await this.userSession();
    const request = await session.authorize(slug);
    const url = new URL(request.redirectUrl ?? '');
    if (url.protocol !== 'https:' || !['connect.composio.dev', 'backend.composio.dev'].includes(url.hostname)) throw new Error('Composio returned an invalid connection link.');
    return { url: url.href };
  }
  async disconnect(id: string): Promise<void> {
    if (!(await this.accounts()).some((account) => account.id === id)) throw new Error('Connection not found.');
    await this.client().connectedAccounts.revoke(id);
  }
  async tools(slug: string) {
    if (!(await this.accounts()).some((account) => account.toolkit === slug && account.status === 'ACTIVE' && !account.disabled))
      throw new Error('Connect this service in Cowork → Connections first.');
    return (await this.client().tools.getRawComposioTools({ toolkits: [slug], limit: 100 })).map((tool) => ({
      slug: tool.slug,
      name: tool.name,
      description: tool.description,
      inputParameters: tool.inputParameters,
    }));
  }
  async execute(slug: string, tool: string, args: Record<string, unknown>, accountId: string): Promise<unknown> {
    const account = (await this.accounts()).find((item) => item.id === accountId && item.toolkit === slug && item.status === 'ACTIVE' && !item.disabled);
    if (!account) throw new Error('This service is disconnected or needs to be reconnected.');
    // Bind the account and toolkit on the server. Model-supplied user IDs or
    // account IDs can never select another user's connection.
    const matches = await this.client().tools.getRawComposioTools({ tools: [tool] });
    if (!matches.some((item) => item.slug === tool && item.toolkit?.slug === slug)) throw new Error('That tool does not belong to the connected service.');
    const session = await this.client().sessions.create(this.owner(), {
      toolkits: [slug],
      tools: { [slug]: [tool] },
      connectedAccounts: { [slug]: account.id },
      manageConnections: false,
    });
    // Mutating service calls must never be retried automatically after an
    // ambiguous network failure. The SDK's typed transport exposes this option.
    const result = await this.client().getClient().withOptions({ maxRetries: 0 }).toolRouter.session.execute(session.sessionId, { tool_slug: tool, arguments: args });
    if (result.error) throw new Error('The connected service rejected this action.');
    return result;
  }
}
