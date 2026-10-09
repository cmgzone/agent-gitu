/**
 * Any-mailbox connections: IMAP for reading, SMTP for sending.
 *
 * The Composio integration covers a fixed set of email toolkits (Gmail,
 * Outlook). This module is the provider-neutral path: the user enters the
 * server, port and password of any mailbox — hosted or self-hosted — and the
 * teammate it is assigned to gets a small, auditable mail toolset.
 *
 * Passwords never leave this module: they are stored in an encrypted envelope
 * (Windows DPAPI, or AES-GCM with the server secrets key) and are only injected
 * into a live connection. No error message or tool result echoes a credential.
 */

import { ImapFlow } from 'imapflow';
import type { FetchMessageObject, ImapFlowOptions, ListResponse, MessageEnvelopeObject } from 'imapflow';
import { simpleParser } from 'mailparser';
import type { AddressObject } from 'mailparser';
import nodemailer from 'nodemailer';
import { execFileSync } from 'node:child_process';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { ensureGituHome } from '../workspace/home.js';
import { readCredentialFile, writeCredentialFile } from '../llm/credential-file.js';
import { discoverMailServers } from './mail-detect.js';
import type { MailDiscovery } from './mail-detect.js';

/** A bound operation never returns more than this much message text. */
const BODY_LIMIT = 6000;
const LIST_LIMIT = 50;
const CONNECT_TIMEOUT_MS = 15_000;
const SOCKET_TIMEOUT_MS = 30_000;
/** Discovery is asked on every keystroke in the form, so repeat domains are cached. */
const DETECT_CACHE_MS = 5 * 60_000;

export interface MailEndpoint {
  host: string;
  port: number;
  /** true = implicit TLS (usually 993/465), false = STARTTLS (usually 143/587). */
  secure: boolean;
}

export interface MailProviderPreset {
  id: string;
  name: string;
  domains: string[];
  imap: MailEndpoint;
  smtp: MailEndpoint;
  /** Shown in the connect form; e.g. providers that require an app password. */
  note: string;
  /** A normal account password will not work: the user needs an app password. */
  appPassword?: boolean;
}

/** Documented server settings for the hosts people connect most often. */
export const MAIL_PROVIDERS: MailProviderPreset[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    domains: ['gmail.com', 'googlemail.com'],
    imap: { host: 'imap.gmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.gmail.com', port: 465, secure: true },
    note: 'Google requires a 16-character App Password when 2-step verification is on.',
    appPassword: true,
  },
  {
    id: 'outlook',
    name: 'Outlook / Microsoft 365',
    domains: ['outlook.com', 'hotmail.com', 'live.com', 'msn.com'],
    imap: { host: 'outlook.office365.com', port: 993, secure: true },
    smtp: { host: 'smtp.office365.com', port: 587, secure: false },
    note: 'Microsoft requires an app password when 2-step verification is on. SMTP AUTH must be enabled on the mailbox.',
    appPassword: true,
  },
  {
    id: 'icloud',
    name: 'iCloud Mail',
    domains: ['icloud.com', 'me.com', 'mac.com'],
    imap: { host: 'imap.mail.me.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.me.com', port: 587, secure: false },
    note: 'Apple requires an app-specific password from your Apple ID account page.',
    appPassword: true,
  },
  {
    id: 'yahoo',
    name: 'Yahoo Mail',
    domains: ['yahoo.com', 'ymail.com', 'rocketmail.com'],
    imap: { host: 'imap.mail.yahoo.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.yahoo.com', port: 465, secure: true },
    note: 'Yahoo requires an app password generated in Account Security.',
    appPassword: true,
  },
  {
    id: 'fastmail',
    name: 'Fastmail',
    domains: ['fastmail.com', 'fastmail.fm'],
    imap: { host: 'imap.fastmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.fastmail.com', port: 465, secure: true },
    note: 'Use an app password created in Fastmail → Settings → Privacy & Security.',
    appPassword: true,
  },
  {
    id: 'zoho',
    name: 'Zoho Mail',
    domains: ['zoho.com', 'zohomail.com'],
    imap: { host: 'imap.zoho.com', port: 993, secure: true },
    smtp: { host: 'smtp.zoho.com', port: 465, secure: true },
    note: 'Zoho expects an app-specific password for IMAP/SMTP access.',
    appPassword: true,
  },
  {
    id: 'proton-bridge',
    name: 'Proton Mail (Bridge)',
    domains: ['proton.me', 'protonmail.com'],
    imap: { host: '127.0.0.1', port: 1143, secure: false },
    smtp: { host: '127.0.0.1', port: 1025, secure: false },
    note: 'Run Proton Mail Bridge locally; Bridge prints the username and password to use here.',
  },
];

export function mailPresetFor(address: string): MailProviderPreset | undefined {
  const domain = address.split('@')[1]?.toLowerCase() ?? '';
  return MAIL_PROVIDERS.find((provider) => provider.domains.includes(domain));
}

export interface MailAccount {
  id: string;
  toolkit: 'mail';
  status: 'ACTIVE';
  disabled: false;
  label: string;
  address: string;
  provider: string;
  createdAt: string;
}

export interface MailTool {
  slug: string;
  name: string;
  description: string;
  inputParameters: Record<string, unknown>;
}

interface MailboxRecord {
  id: string;
  label: string;
  address: string;
  provider: string;
  username: string;
  password: string;
  imap: MailEndpoint;
  smtp: MailEndpoint;
  allowSelfSigned: boolean;
  createdAt: string;
}

/** Minimal surface we need from nodemailer, so tests can inject a fake. */
export interface MailTransport {
  verify(): Promise<unknown>;
  sendMail(message: Record<string, unknown>): Promise<{ messageId?: string; accepted?: unknown[]; rejected?: unknown[] }>;
}

const ADDRESS_RE = /^[^\s@,<>"]{1,254}@[^\s@,<>"]{1,253}$/;
const HOST_RE = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i;

function asString(value: unknown, field: string, max = 512): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > max) throw new Error(`Enter a valid ${field}.`);
  return text;
}

function asPort(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Enter a port between 1 and 65535.');
  return port;
}

function asHost(value: unknown, fallback: string): string {
  const host = value === undefined || value === null || value === '' ? fallback : String(value).trim();
  if (!HOST_RE.test(host)) throw new Error('Enter a valid mail server host name.');
  return host.toLowerCase();
}

function asAddress(value: unknown, field: string): string {
  const address = String(value ?? '').trim();
  if (!ADDRESS_RE.test(address)) throw new Error(`Enter a valid ${field}.`);
  return address;
}

function addressLine(list: MessageEnvelopeObject['from'] | undefined): string {
  if (!list?.length) return '';
  return list
    .map((entry) => (entry.name ? `${entry.name} <${entry.address ?? ''}>` : (entry.address ?? '')))
    .filter(Boolean)
    .join(', ');
}

function parsedAddress(value: AddressObject | AddressObject[] | undefined): string {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.text ?? '';
}

function truncate(text: string, limit: number): string {
  return text.length > limit ? `${text.slice(0, limit)}\n… (${text.length - limit} more characters)` : text;
}

/** HTML fallback for messages that ship no text/plain part. */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Encrypted-at-rest mailbox store. Mirrors the Composio key store: DPAPI on
 * Windows, AES-GCM when the host sets AGENT_GITU_SECRETS_KEY, and otherwise the
 * same 0600 permission-protected file the app already uses for model API keys.
 */
export class MailSecretStore {
  constructor(private readonly platform = process.platform) {}
  private get file(): string {
    return path.join(ensureGituHome().settings, this.platform === 'win32' ? 'mail-accounts.dpapi' : 'mail-accounts.json');
  }
  get storage(): 'windows-dpapi' | 'server-encrypted' | 'local-file' {
    if (this.platform === 'win32') return 'windows-dpapi';
    return this.serverKey() ? 'server-encrypted' : 'local-file';
  }
  private serverKey(): Buffer | undefined {
    const key = process.env['AGENT_GITU_SECRETS_KEY'];
    if (!key) return undefined;
    if (!/^[a-f0-9]{64}$/i.test(key)) throw new Error('Set AGENT_GITU_SECRETS_KEY to a 32-byte hexadecimal server encryption key.');
    return Buffer.from(key, 'hex');
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
  read(): MailboxRecord[] | undefined {
    const raw = readCredentialFile(this.file, (value) => value);
    if (raw === undefined) return undefined;
    let text: string;
    if (this.platform === 'win32') {
      text = this.crypt(raw, true);
    } else {
      const record = JSON.parse(raw) as { ciphertext?: string; iv?: string; tag?: string };
      if (record && typeof record.ciphertext === 'string') {
        const key = this.serverKey();
        if (!key) throw new Error('The mailbox store is encrypted with a server key that is not set.');
        if (!/^[a-f0-9]{24}$/.test(record.iv ?? '') || !/^[a-f0-9]{32}$/.test(record.tag ?? '')) throw new Error('The saved mailbox data is damaged.');
        const decrypt = createDecipheriv('aes-256-gcm', key, Buffer.from(record.iv!, 'hex'));
        decrypt.setAAD(Buffer.from('agent-gitu:mail-accounts:v1'));
        decrypt.setAuthTag(Buffer.from(record.tag!, 'hex'));
        text = Buffer.concat([decrypt.update(Buffer.from(record.ciphertext, 'base64')), decrypt.final()]).toString('utf8');
      } else {
        text = raw;
      }
    }
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? (parsed as MailboxRecord[]) : [];
  }
  save(records: MailboxRecord[]): void {
    const value = JSON.stringify(records);
    if (this.platform === 'win32') {
      writeCredentialFile(this.file, this.crypt(value, false));
      return;
    }
    const key = this.serverKey();
    if (!key) {
      // Local, permission-protected file — the same trust level the app uses
      // for model provider API keys saved from the UI.
      writeCredentialFile(this.file, value, (text) => {
        JSON.parse(text);
        return text;
      });
      return;
    }
    const iv = randomBytes(12);
    const encrypt = createCipheriv('aes-256-gcm', key, iv);
    encrypt.setAAD(Buffer.from('agent-gitu:mail-accounts:v1'));
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

export interface MailConnectResult {
  account: MailAccount;
  /** Set when SMTP could not be verified but mail reading still works. */
  warning?: string;
}

export class MailConnections {
  private readonly detections = new Map<string, { at: number; value: MailDiscovery }>();
  constructor(
    private readonly secrets = new MailSecretStore(),
    private readonly createImap: (options: ImapFlowOptions) => ImapFlow = (options) => new ImapFlow(options),
    private readonly createTransport: (options: Record<string, unknown>) => MailTransport = (options) =>
      nodemailer.createTransport(options as Parameters<typeof nodemailer.createTransport>[0]) as unknown as MailTransport,
    /** Injectable for tests; the default reads autoconfig XML and SRV records. */
    private readonly discover: (address: string) => Promise<MailDiscovery> = discoverMailServers,
  ) {}

  /** Any mailbox can be connected without a global provider key. */
  get configured(): boolean {
    return true;
  }

  get setup(): { canConfigure: boolean; keyStorage: string } {
    return { canConfigure: true, keyStorage: this.secrets.storage };
  }

  private load(): MailboxRecord[] {
    return this.secrets.read() ?? [];
  }

  private record(accountId: string): MailboxRecord {
    const account = this.load().find((candidate) => candidate.id === accountId);
    if (!account) throw new Error('That mailbox is no longer connected.');
    return account;
  }

  /**
   * Server discovery for one address: Thunderbird autoconfig first, then the
   * RFC 6186 SRV records. This is what makes Mailcow, Mail-in-a-Box and other
   * self-hosted mail servers fill themselves in instead of asking the user for
   * ports. Nothing here authenticates: it only suggests where to connect.
   */
  async detect(input: unknown): Promise<MailDiscovery> {
    const source = (input ?? {}) as Record<string, unknown>;
    const address = asAddress(source['address'], 'email address');
    const domain = address.split('@')[1]!.toLowerCase();
    const cached = this.detections.get(domain);
    if (cached && Date.now() - cached.at < DETECT_CACHE_MS) return cached.value;
    const value = await this.discover(address).catch((): MailDiscovery => ({ domain, source: 'none', found: false }));
    this.detections.set(domain, { at: Date.now(), value });
    return value;
  }

  async accounts(): Promise<MailAccount[]> {
    return this.load().map((account) => ({
      id: account.id,
      toolkit: 'mail' as const,
      status: 'ACTIVE' as const,
      disabled: false as const,
      label: account.label,
      address: account.address,
      provider: account.provider,
      createdAt: account.createdAt,
    }));
  }

  /** Validates and tests the mailbox before anything is written to disk. */
  async connect(input: unknown): Promise<MailConnectResult> {
    const source = (input ?? {}) as Record<string, unknown>;
    const address = asAddress(source['address'], 'email address');
    // An explicitly chosen provider wins; otherwise the address domain decides.
    // "custom" means the user is supplying their own servers, so detection may help.
    const requested = typeof source['provider'] === 'string' ? MAIL_PROVIDERS.find((provider) => provider.id === source['provider']) : undefined;
    const preset = requested ?? mailPresetFor(address);
    const password = asString(source['password'], 'password', 512);
    // A server the user typed always wins. Otherwise the preset fills it in, and
    // when there is no preset we ask the discovery sources — that is what makes
    // a Mailcow or otherwise self-hosted domain work from the address alone.
    const givenHost = (value: unknown): boolean => typeof value === 'string' && value.trim() !== '';
    const detected = preset || (givenHost(source['imapHost']) && givenHost(source['smtpHost'])) ? undefined : await this.detect({ address });
    const imapFallback = preset?.imap ?? (givenHost(source['imapHost']) ? undefined : detected?.imap);
    const smtpFallback = preset?.smtp ?? (givenHost(source['smtpHost']) ? undefined : detected?.smtp);
    const username = typeof source['username'] === 'string' && source['username'].trim()
      ? asAddress(source['username'], 'username')
      : (detected?.username ?? address);
    const imap: MailEndpoint = {
      host: asHost(source['imapHost'], imapFallback?.host ?? ''),
      port: asPort(source['imapPort'], imapFallback?.port ?? 993),
      secure: source['imapSecure'] === undefined ? (imapFallback?.secure ?? true) : source['imapSecure'] === true,
    };
    const smtp: MailEndpoint = {
      host: asHost(source['smtpHost'], smtpFallback?.host ?? ''),
      port: asPort(source['smtpPort'], smtpFallback?.port ?? 465),
      secure: source['smtpSecure'] === undefined ? (smtpFallback?.secure ?? true) : source['smtpSecure'] === true,
    };
    const allowSelfSigned = source['allowSelfSigned'] === true;
    const label = typeof source['label'] === 'string' && source['label'].trim() ? String(source['label']).trim().slice(0, 60) : address;
    const draft: MailboxRecord = {
      id: `mail-${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      label,
      address,
      provider: preset?.id ?? 'custom',
      username,
      password,
      imap,
      smtp,
      allowSelfSigned,
      createdAt: new Date().toISOString(),
    };
    await this.verifyImap(draft);
    let warning: string | undefined;
    try {
      await this.transport(draft).verify();
    } catch {
      warning = `Saved. Reading mail works, but sending failed — check the outgoing server for ${smtp.host}:${smtp.port}.`;
    }
    const records = this.load();
    if (records.some((account) => account.address === address && account.imap.host === imap.host && account.imap.port === imap.port)) {
      throw new Error('That mailbox is already connected.');
    }
    this.secrets.save([...records, draft]);
    return { account: (await this.accounts()).find((account) => account.id === draft.id)!, ...(warning ? { warning } : {}) };
  }

  async remove(accountId: string): Promise<void> {
    const records = this.load();
    const next = records.filter((account) => account.id !== accountId);
    if (next.length === records.length) throw new Error('That mailbox is no longer connected.');
    this.secrets.save(next);
  }

  private options(account: MailboxRecord, endpoint: MailEndpoint, auth: { user: string; pass: string }): ImapFlowOptions {
    return {
      host: endpoint.host,
      port: endpoint.port,
      secure: endpoint.secure,
      auth,
      logger: false,
      disableAutoIdle: true,
      connectionTimeout: CONNECT_TIMEOUT_MS,
      greetingTimeout: CONNECT_TIMEOUT_MS,
      socketTimeout: SOCKET_TIMEOUT_MS,
      tls: { rejectUnauthorized: !account.allowSelfSigned },
    };
  }

  private client(account: MailboxRecord): ImapFlow {
    const client = this.createImap(this.options(account, account.imap, { user: account.username, pass: account.password }));
    // imapflow is an EventEmitter; an unhandled 'error' would take down the host process.
    client.on('error', () => {});
    return client;
  }

  private transport(account: MailboxRecord): MailTransport {
    return this.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: { user: account.username, pass: account.password },
      connectionTimeout: CONNECT_TIMEOUT_MS,
      greetingTimeout: CONNECT_TIMEOUT_MS,
      socketTimeout: SOCKET_TIMEOUT_MS,
      tls: { rejectUnauthorized: !account.allowSelfSigned },
    });
  }

  private async verifyImap(account: MailboxRecord): Promise<void> {
    const client = this.client(account);
    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');
      lock.release();
    } catch {
      throw new Error(`Could not sign in to ${account.imap.host} over IMAP. Check the host, port, and password.`);
    } finally {
      await client.logout().catch(() => {});
    }
  }

  private async withMailbox<T>(account: MailboxRecord, folder: string, run: (client: ImapFlow) => Promise<T>): Promise<T> {
    const client = this.client(account);
    try {
      await client.connect();
    } catch {
      await client.logout().catch(() => {});
      throw new Error(`Could not reach ${account.imap.host}. Check that IMAP is enabled for this mailbox.`);
    }
    const lock = await client.getMailboxLock(folder);
    try {
      return await run(client);
    } finally {
      lock.release();
      await client.logout().catch(() => {});
    }
  }

  private summarize(message: FetchMessageObject): Record<string, unknown> {
    return {
      uid: message.uid,
      from: addressLine(message.envelope?.from),
      to: addressLine(message.envelope?.to),
      subject: message.envelope?.subject ?? '(no subject)',
      date: message.envelope?.date ? new Date(message.envelope.date).toISOString() : message.internalDate ? new Date(message.internalDate).toISOString() : '',
      seen: message.flags?.has('\\Seen') ?? false,
      flagged: message.flags?.has('\\Flagged') ?? false,
      size: message.size,
    };
  }

  private async listMessages(account: MailboxRecord, folder: string, limit: number, unreadOnly: boolean): Promise<Record<string, unknown>[]> {
    return this.withMailbox(account, folder, async (client) => {
      const query = { uid: true, envelope: true, flags: true, size: true, internalDate: true } as const;
      let range: string;
      if (unreadOnly) {
        const found = await client.search({ seen: false }, { uid: true });
        const uids = Array.isArray(found) ? found.slice(-limit) : [];
        if (!uids.length) return [];
        range = uids.join(',');
      } else {
        const exists = client.mailbox && typeof client.mailbox === 'object' ? client.mailbox.exists : 0;
        if (!exists) return [];
        range = `${Math.max(1, exists - limit + 1)}:${exists}`;
      }
      const messages: Record<string, unknown>[] = [];
      for await (const message of client.fetch(range, query, { uid: true })) messages.push(this.summarize(message));
      return messages.reverse();
    });
  }

  private async folders(account: MailboxRecord): Promise<Record<string, unknown>[]> {
    const client = this.client(account);
    try {
      await client.connect();
      const list: ListResponse[] = await client.list();
      return list.map((entry) => ({
        path: entry.path,
        name: entry.name,
        specialUse: entry.specialUse ?? undefined,
        // Paths are what mail_list/mail_read accept; the delimiter is only context.
        delimiter: entry.delimiter,
      }));
    } catch {
      throw new Error(`Could not reach ${account.imap.host}. Check that IMAP is enabled for this mailbox.`);
    } finally {
      await client.logout().catch(() => {});
    }
  }

  private async readMessage(account: MailboxRecord, folder: string, uid: number): Promise<Record<string, unknown>> {
    return this.withMailbox(account, folder, async (client) => {
      const message = await client.fetchOne(String(uid), { source: true, envelope: true, flags: true }, { uid: true });
      if (!message || !message.source) throw new Error(`No message with uid ${uid} in ${folder}.`);
      const parsed = await simpleParser(message.source);
      const text = parsed.text?.trim() || (typeof parsed.html === 'string' ? htmlToText(parsed.html) : '');
      const attachments = (parsed.attachments ?? []).map((file) => ({ filename: file.filename ?? 'unnamed', size: file.size, contentType: file.contentType }));
      return {
        uid: message.uid,
        folder,
        from: parsedAddress(parsed.from) || addressLine(message.envelope?.from),
        to: parsedAddress(parsed.to),
        cc: parsedAddress(parsed.cc),
        subject: parsed.subject ?? message.envelope?.subject ?? '(no subject)',
        date: (parsed.date ?? (message.envelope?.date ? new Date(message.envelope.date) : undefined))?.toISOString() ?? '',
        seen: message.flags?.has('\\Seen') ?? false,
        attachments,
        body: truncate(text, BODY_LIMIT),
      };
    });
  }

  private async mark(account: MailboxRecord, folder: string, uid: number, read: boolean): Promise<Record<string, unknown>> {
    return this.withMailbox(account, folder, async (client) => {
      if (read) await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
      else await client.messageFlagsRemove(String(uid), ['\\Seen'], { uid: true });
      return { uid, folder, seen: read };
    });
  }

  private async send(account: MailboxRecord, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const list = (value: unknown, field: string): string[] | undefined => {
      if (value === undefined || value === null || value === '') return undefined;
      const raw = Array.isArray(value) ? value.map(String) : String(value).split(',');
      const parsed = raw.map((entry) => entry.trim()).filter(Boolean);
      if (!parsed.length) return undefined;
      if (parsed.length > 25) throw new Error(`Too many ${field} recipients.`);
      return parsed.map((entry) => asAddress(entry, `${field} address`));
    };
    const to = list(args['to'], 'to');
    if (!to) throw new Error('Provide at least one "to" address.');
    const subject = typeof args['subject'] === 'string' ? args['subject'].trim().slice(0, 300) : '';
    const body = String(args['text'] ?? args['body'] ?? '');
    if (!body.trim()) throw new Error('Provide the message text.');
    if (body.length > 200_000) throw new Error('This message is too large to send.');
    const result = await this.transport(account).sendMail({
      from: account.address,
      to,
      cc: list(args['cc'], 'cc'),
      bcc: list(args['bcc'], 'bcc'),
      subject,
      text: body,
      ...(typeof args['replyTo'] === 'string' && ADDRESS_RE.test(args['replyTo'].trim()) ? { replyTo: args['replyTo'].trim() } : {}),
    });
    return { sent: true, messageId: result.messageId, accepted: result.accepted?.length ?? 0, rejected: result.rejected?.length ?? 0 };
  }

  /** Tool schemas handed to the teammate so it can discover mailbox actions. */
  tools(): MailTool[] {
    return [
      {
        slug: 'mail_list',
        name: 'List recent mail',
        description: 'List the newest messages in a folder, newest first. Set unreadOnly for an inbox triage pass.',
        inputParameters: { type: 'object', properties: { folder: { type: 'string', description: 'Mailbox path, defaults to INBOX' }, limit: { type: 'integer', minimum: 1, maximum: LIST_LIMIT }, unreadOnly: { type: 'boolean' } } },
      },
      {
        slug: 'mail_search',
        name: 'Search mail',
        description: 'Search a folder by text across headers and body. Returns summaries with uids for mail_read.',
        inputParameters: { type: 'object', properties: { query: { type: 'string' }, folder: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: LIST_LIMIT } }, required: ['query'] },
      },
      {
        slug: 'mail_read',
        name: 'Read a message',
        description: 'Read one message by uid, including its text body and attachment names.',
        inputParameters: { type: 'object', properties: { uid: { type: 'integer' }, folder: { type: 'string' } }, required: ['uid'] },
      },
      {
        slug: 'mail_send',
        name: 'Send a message',
        description: 'Send an email from this connected mailbox. This is irreversible: review the draft with the user first.',
        inputParameters: { type: 'object', properties: { to: { type: 'string', description: 'One or more addresses, comma separated' }, subject: { type: 'string' }, text: { type: 'string' }, cc: { type: 'string' }, bcc: { type: 'string' }, replyTo: { type: 'string' } }, required: ['to', 'text'] },
      },
      {
        slug: 'mail_mark',
        name: 'Mark read or unread',
        description: 'Set the read state of a message in a folder.',
        inputParameters: { type: 'object', properties: { uid: { type: 'integer' }, folder: { type: 'string' }, read: { type: 'boolean' } }, required: ['uid'] },
      },
      {
        slug: 'mail_folders',
        name: 'List folders',
        description: 'List the mailbox folders so you can target the right path.',
        inputParameters: { type: 'object', properties: {} },
      },
    ];
  }

  /** Bound, validated execution for one assigned mailbox. */
  async execute(tool: string, args: Record<string, unknown>, accountId: string): Promise<unknown> {
    const account = this.record(accountId);
    const folder = typeof args['folder'] === 'string' && args['folder'].trim() ? args['folder'].trim().slice(0, 200) : 'INBOX';
    const limit = Math.min(Math.max(Number(args['limit']) || 20, 1), LIST_LIMIT);
    const uid = Number(args['uid']);
    switch (tool) {
      case 'mail_folders':
        return { folders: await this.folders(account) };
      case 'mail_list':
        return { folder, messages: await this.listMessages(account, folder, limit, args['unreadOnly'] === true) };
      case 'mail_search':
        return { folder, messages: await this.search(account, folder, String(args['query'] ?? ''), limit) };
      case 'mail_read':
        if (!Number.isInteger(uid) || uid < 1) throw new Error('Provide the numeric uid of the message.');
        return await this.readMessage(account, folder, uid);
      case 'mail_mark':
        if (!Number.isInteger(uid) || uid < 1) throw new Error('Provide the numeric uid of the message.');
        return await this.mark(account, folder, uid, args['read'] !== false);
      case 'mail_send':
        return await this.send(account, args);
      default:
        throw new Error('Unknown mail tool. Use connected_apps tools for the mailbox to see the exact slugs.');
    }
  }

  private async search(account: MailboxRecord, folder: string, query: string, limit: number): Promise<Record<string, unknown>[]> {
    const text = query.trim().slice(0, 200);
    if (!text) throw new Error('Provide the text to search for.');
    return this.withMailbox(account, folder, async (client) => {
      const found = await client.search({ or: [{ subject: text }, { from: text }, { body: text }] }, { uid: true });
      const uids = Array.isArray(found) ? found.slice(-limit) : [];
      if (!uids.length) return [];
      const messages: Record<string, unknown>[] = [];
      for await (const message of client.fetch(uids.join(','), { uid: true, envelope: true, flags: true, size: true, internalDate: true }, { uid: true })) messages.push(this.summarize(message));
      return messages.reverse();
    });
  }
}
