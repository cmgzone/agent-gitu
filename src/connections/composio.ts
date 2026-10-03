import { Composio } from '@composio/core';
import { execFileSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ensureGituHome } from '../workspace/home.js';
import { readCredentialFile, readCredentialJson, writeCredentialFile } from '../llm/credential-file.js';

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

/** Windows DPAPI locally; hosted keys use AES-GCM with an external runtime key. */
export class ComposioKeyStore {
  constructor(private readonly platform = process.platform) {}
  private get file(): string {
    return path.join(ensureGituHome().settings, this.platform === 'win32' ? 'composio-key.dpapi' : 'composio-key.encrypted.json');
  }
  get canSave(): boolean {
    return this.platform === 'win32' || Boolean(this.serverKey());
  }
  get storage(): string {
    return this.platform === 'win32' ? 'windows-dpapi' : 'server-encrypted';
  }
  private serverKey(): Buffer | undefined {
    const key = process.env['AGENT_GITU_SECRETS_KEY'];
    if (!key) return undefined;
    if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('Set AGENT_GITU_SECRETS_KEY to a 32-byte hexadecimal server encryption key.');
    return Buffer.from(key, 'hex');
  }
  get configured(): boolean {
    return Boolean(process.env['COMPOSIO_API_KEY']) || existsSync(this.file) || existsSync(`${this.file}.bak`);
  }
  private crypt(value: string, decrypt: boolean): string {
    if (this.platform !== 'win32') throw new Error('Windows key storage is unavailable.');
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
    if (this.platform === 'win32') {
      const saved = readCredentialFile(this.file, (value) => value);
      return saved === undefined ? undefined : this.crypt(saved, true);
    }
    const record = readCredentialJson(this.file, (value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid encrypted credential record.');
      return value as { version: number; iv: string; tag: string; ciphertext: string };
    });
    if (!record) return undefined;
    const key = this.serverKey();
    if (!key) throw new Error('The server encryption key is missing.');
    if (record.version !== 1 || !/^[a-f0-9]{24}$/.test(record.iv) || !/^[a-f0-9]{32}$/.test(record.tag)) throw new Error('The saved integration key is damaged.');
    const decrypt = createDecipheriv('aes-256-gcm', key, Buffer.from(record.iv, 'hex'));
    decrypt.setAAD(Buffer.from('agent-gitu:composio-key:v1'));
    decrypt.setAuthTag(Buffer.from(record.tag, 'hex'));
    return Buffer.concat([decrypt.update(Buffer.from(record.ciphertext, 'base64')), decrypt.final()]).toString('utf8');
  }
  save(value: string): void {
    if (this.platform === 'win32') {
      writeCredentialFile(this.file, this.crypt(value, false));
      return;
    }
    const key = this.serverKey();
    if (!key) throw new Error('Enable encrypted integration storage on the server first.');
    const iv = randomBytes(12);
    const encrypt = createCipheriv('aes-256-gcm', key, iv);
    encrypt.setAAD(Buffer.from('agent-gitu:composio-key:v1'));
    const ciphertext = Buffer.concat([encrypt.update(value, 'utf8'), encrypt.final()]);
    writeCredentialFile(this.file, JSON.stringify({ version: 1, iv: iv.toString('hex'), tag: encrypt.getAuthTag().toString('hex'), ciphertext: ciphertext.toString('base64') }), (text) => {
      JSON.parse(text);
      return text;
    });
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
  get setup(): { canConfigure: boolean; keyStorage: string } {
    return { canConfigure: this.keys.canSave, keyStorage: this.keys.storage };
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
