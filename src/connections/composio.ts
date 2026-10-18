import { Composio } from '@composio/core';
import { execFileSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ensureGituHome } from '../workspace/home.js';
import { SecretVault } from './secret-vault.js';
import { readCredentialFile, readCredentialJson, writeCredentialFile } from '../llm/credential-file.js';
import { redactConnectionData } from './response-data.js';

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
    if (!key) return new SecretVault(path.join(ensureGituHome().settings, 'ConnectorSecrets')).encryptionKey();
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
    writeCredentialFile(
      this.file,
      JSON.stringify({ version: 1, iv: iv.toString('hex'), tag: encrypt.getAuthTag().toString('hex'), ciphertext: ciphertext.toString('base64') }),
      (text) => {
        JSON.parse(text);
        return text;
      },
    );
  }
}

type Client = Pick<Composio, 'sessions' | 'connectedAccounts' | 'tools' | 'toolkits' | 'getClient'>;
export class ComposioExecutionUncertainError extends Error {
  constructor() { super('The connected service did not confirm completion. This action may already have run. Check the destination app before any retry. No automatic retry was attempted.'); }
}
export class ComposioConnections {
  private sdk?: Client;
  private session?: ReturnType<Client['sessions']['create']>;
  private sessionOwner?: string;
  private generation = 0;
  private executionSessions = new Map<string, ReturnType<Client['sessions']['create']>>();
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
    const owner = this.owner();
    if (!this.session || this.sessionOwner !== owner) {
      const sdk = this.client(), generation = this.generation;
      const file = path.join(ensureGituHome().settings, 'composio-session.json');
      let saved: { owner?: unknown; sessionId?: unknown } | undefined;
      try {
        const value: unknown = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : undefined;
        if (value && typeof value === 'object' && !Array.isArray(value)) saved = value;
      } catch (error) { if (!(error instanceof SyntaxError)) throw error; }
      const request = { signal: AbortSignal.timeout(15_000) };
      const create = () => sdk.sessions.create(owner, { manageConnections: false }, request);
      const pending = (
        saved?.owner === owner && typeof saved.sessionId === 'string' && /^[\w-]{1,512}$/.test(saved.sessionId)
          ? sdk.sessions.use(saved.sessionId, undefined, request).catch(error => {
            // Only a confirmed missing session is replaced. Authentication and
            // transient failures must not start a new session repeatedly.
            if (![404, 410].includes(Number(error?.status))) throw error;
            return create();
          })
          : create()
      )
        .then((session) => {
          if (generation !== this.generation || this.session !== pending) throw new Error('Connection setup changed. Refresh and try again.');
          writeCredentialFile(file, JSON.stringify({ owner, sessionId: session.sessionId }));
          return session;
        })
        .catch((error) => {
          if (this.session === pending) this.session = undefined;
          throw error;
        });
      this.sessionOwner = owner;
      this.session = pending;
    }
    return this.session;
  }
  async configure(key: string): Promise<void> {
    if (process.env['COMPOSIO_API_KEY']) throw new Error('Composio is configured by the server environment.');
    if (!key.trim() || key.length > 4096) throw new Error('Enter a valid Composio API key.');
    const sdk = this.factory(key.trim());
    await sdk.toolkits.get({ limit: 1 });
    this.keys.save(key.trim());
    this.generation++;
    this.sdk = sdk;
    this.session = undefined;
    this.executionSessions.clear();
    const file = path.join(ensureGituHome().settings, 'composio-session.json');
    // A session belongs to the provider project; key changes create a fresh one.
    writeCredentialFile(file, JSON.stringify({ owner: '', sessionId: '' }));
  }
  async catalog(search = '', cursor?: string): Promise<{ services: ServiceCard[]; cursor?: string }> {
    const pending = this.userSession();
    const session = await pending;
    let result: Awaited<ReturnType<typeof session.toolkits>>;
    try { result = await session.toolkits({ search: search.slice(0, 100), cursor, limit: 50 }); }
    catch (error) {
      if (this.session === pending && [404, 410].includes(Number(error && typeof error === 'object' ? (error as { status?: unknown }).status : 0))) this.session = undefined;
      throw error;
    }
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
    const owner = this.owner();
    const items = new Map<string, ConnectedApp>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    let pages = 0;
    do {
      const result = await this.client().connectedAccounts.list({ userIds: [owner], accountType: 'PRIVATE', limit: 100, cursor }, { signal: AbortSignal.timeout(15_000) });
      for (const account of result.items) items.set(account.id, { id: account.id, toolkit: account.toolkit.slug, status: account.status, disabled: account.isDisabled });
      cursor = result.nextCursor ?? undefined;
      if (cursor && (cursors.has(cursor) || ++pages >= 10)) throw new Error('The connected account list is incomplete. Refresh Connections before selecting an account.');
      if (cursor) cursors.add(cursor);
    } while (cursor);
    if (owner !== this.owner()) throw new Error('The connection owner changed. Refresh Connections.');
    return [...items.values()];
  }
  async connect(slug: string): Promise<{ url: string; accountId: string }> {
    if (!/^[a-z0-9_-]{1,100}$/.test(slug)) throw new Error('Invalid service.');
    const session = await this.userSession();
    const request = await session.authorize(slug);
    const url = new URL(request.redirectUrl ?? '');
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !['connect.composio.dev', 'backend.composio.dev'].includes(url.hostname)) throw new Error('Composio returned an invalid connection link.');
    if (!request.id) throw new Error('Composio returned no connection identifier.');
    return { url: url.href, accountId: request.id };
  }
  async disconnect(id: string): Promise<void> {
    if (!(await this.accounts()).some((account) => account.id === id)) throw new Error('Connection not found.');
    await this.client().connectedAccounts.revoke(id);
    this.executionSessions.clear();
  }
  async tools(slug: string, query?: string, tool?: string) {
    if (!(await this.accounts()).some((account) => account.toolkit === slug && account.status === 'ACTIVE' && !account.disabled))
      throw new Error('Connect this service in Cowork → Connections first.');
    const tools = await this.client().tools.getRawComposioTools(
      tool ? { tools: [tool] } : { toolkits: [slug], ...(query ? { search: query.slice(0, 200), limit: 5 } : { limit: 100 }) },
      undefined,
      { signal: AbortSignal.timeout(15_000) },
    );
    return tools
      .filter((item) => item.toolkit?.slug === slug && (!tool || item.slug === tool))
      .map((tool) => ({
        slug: tool.slug,
        name: tool.name,
        description: tool.description,
        inputParameters: tool.inputParameters,
      }));
  }
  async execute(slug: string, tool: string, args: Record<string, unknown>, accountId: string): Promise<unknown> {
    const owner = this.owner(), sdk = this.client(), generation = this.generation;
    const account = (await this.accounts()).find((item) => item.id === accountId && item.toolkit === slug && item.status === 'ACTIVE' && !item.disabled);
    if (!account) throw new Error('This service is disconnected or needs to be reconnected.');
    // Bind the account and toolkit on the server. Model-supplied user IDs or
    // account IDs can never select another user's connection.
    const signal = AbortSignal.timeout(30_000);
    const sessionKey = JSON.stringify([owner, slug, tool, account.id]);
    let pendingSession = this.executionSessions.get(sessionKey);
    if (!pendingSession) {
      const pending = (async () => {
        const matches = await sdk.tools.getRawComposioTools({ tools: [tool] }, undefined, { signal });
        if (!matches.some((item) => item.slug === tool && item.toolkit?.slug === slug)) throw new Error('That tool does not belong to the connected service.');
        if (generation !== this.generation || owner !== this.owner()) throw new Error('Connection setup changed. Refresh and try again.');
        return sdk.sessions.create(
          owner,
          {
            toolkits: [slug],
            tools: { [slug]: [tool] },
            connectedAccounts: { [slug]: account.id },
            manageConnections: false,
          },
          { signal },
        );
      })()
        .catch((error) => {
          if (this.executionSessions.get(sessionKey) === pending) this.executionSessions.delete(sessionKey);
          throw error;
        });
      pendingSession = pending;
      this.executionSessions.set(sessionKey, pendingSession);
    }
    const session = await pendingSession;
    if (generation !== this.generation || owner !== this.owner()) throw new Error('Connection setup changed. No action was submitted.');
    // Mutating service calls must never be retried automatically after an
    // ambiguous network failure. The SDK's typed transport exposes this option.
    let result: Awaited<ReturnType<ReturnType<Client['getClient']>['toolRouter']['session']['execute']>>;
    try {
      result = await sdk.getClient().withOptions({ maxRetries: 0 }).toolRouter.session.execute(session.sessionId, { tool_slug: tool, arguments: args }, { signal });
    } catch (error) {
      const status = Number(error && typeof error === 'object' ? (error as { status?: unknown }).status : 0);
      if ([404, 410].includes(status) && this.executionSessions.get(sessionKey) === pendingSession) this.executionSessions.delete(sessionKey);
      if (status >= 400 && status < 500 && status !== 408) throw error;
      throw new ComposioExecutionUncertainError();
    }
    if (result.error) throw new Error(`The connected service rejected this action: ${String(result.error).slice(0, 600)}`);
    return redactConnectionData(result);
  }
  /** Fixed Calendar endpoints through the existing OAuth account transport; no raw tokens or arbitrary URLs. */
  async googleCalendarRequest(
    accountId: string,
    calendarId: string,
    eventId: string | undefined,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    body?: Record<string, unknown>,
    etag?: string,
    authorize?: () => void,
  ): Promise<{ status: number; data: unknown }> {
    if (!/^[\w@.+-]{1,300}$/.test(calendarId) || ['.', '..'].includes(calendarId) || (eventId && !/^[0-9a-v]{5,1024}$/.test(eventId)))
      throw new Error('Choose a valid Calendar and event identifier.');
    const account = (await this.accounts()).find((a) => a.id === accountId && a.toolkit === 'googlecalendar' && a.status === 'ACTIVE' && !a.disabled);
    if (!account) throw new Error('Connect an active Google Calendar account first.');
    authorize?.();
    const endpoint = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events' + (eventId ? '/' + eventId : '');
    const result = await this.client()
      .getClient()
      .withOptions({ maxRetries: 0 })
      .tools.proxy(
        {
          connected_account_id: account.id,
          endpoint,
          method,
          body,
          parameters:
            method === 'GET' && !eventId
              ? [
                  { name: 'maxResults', value: '1', type: 'query' },
                  { name: 'fields', value: 'kind', type: 'query' },
                ]
              : etag
                ? [{ name: 'If-Match', value: etag, type: 'header' }]
                : undefined,
        },
        { signal: AbortSignal.timeout(30000) },
      );
    return { status: Number(result.status), data: result.data };
  }
}
