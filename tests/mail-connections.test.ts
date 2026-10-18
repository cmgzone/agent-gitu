import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImapFlow, ImapFlowOptions } from 'imapflow';
import { MAIL_PROVIDERS, MailConnections, MailSecretStore, mailPresetFor, type MailTransport } from '../src/connections/mail.js';
import type { MailDiscovery } from '../src/connections/mail-detect.js';
import { simpleParser } from 'mailparser';
import { ConnectionsHub, MAIL_SERVICE_SLUG } from '../src/connections/provider.js';
import type { ComposioConnections } from '../src/connections/composio.js';
import { roleAppSuggestions } from '../src/cowork/app-recommendations.js';
import { CoworkStore } from '../src/cowork/store.js';
import { GituServer } from '../src/server/server.js';
import { ensureGituHome } from '../src/workspace/home.js';
import { coworkNativeTools, executeCoworkTool, type CoworkToolScope } from '../src/cowork/tools.js';
import type { ToolContext } from '../src/tools/tools.js';
import { runConversationTurn, runMissionSession } from '../src/cowork/runner.js';
import { CoworkMemory } from '../src/cowork/memory.js';
import { MemoryStore } from '../src/memory/memory-store.js';

const PASSWORD = 'hunter2-should-never-appear';

const RAW_MESSAGE = [
  'From: Ada Lovelace <ada@example.com>',
  'To: agent@example.com',
  'Subject: Hello from the fixture',
  'Message-ID: <original@example.com>',
  'Date: Mon, 6 Oct 2026 10:00:00 +0000',
  '',
  'Body text for the mailbox reader.',
].join('\r\n');

class FakeImap {
  capabilities = new Map([['UIDPLUS', true]]);
  exists = 2;
  messages: Record<string, unknown>[] = [
    {
      seq: 1,
      uid: 1,
      size: 1200,
      flags: new Set<string>(['\\Seen']),
      internalDate: new Date('2026-10-05T09:00:00Z'),
      envelope: { from: [{ name: 'Ada', address: 'ada@example.com' }], to: [{ address: 'agent@example.com' }], subject: 'Older note', date: new Date('2026-10-05T09:00:00Z') },
    },
    {
      seq: 2,
      uid: 2,
      size: 900,
      flags: new Set<string>(),
      internalDate: new Date('2026-10-06T09:00:00Z'),
      envelope: { from: [{ name: 'Grace', address: 'grace@example.com' }], to: [{ address: 'agent@example.com' }], subject: 'Newest note', date: new Date('2026-10-06T09:00:00Z') },
    },
  ];
  connect = vi.fn(async () => undefined);
  logout = vi.fn(async () => undefined);
  getMailboxLock = vi.fn(async (folder: string) => ({ folder, release: vi.fn() }));
  list = vi.fn(async () => [
    { path: 'INBOX', name: 'INBOX', delimiter: '/', specialUse: undefined },
    { path: 'Sent', name: 'Sent', delimiter: '/', specialUse: '\\Sent' },
    { path: 'Drafts', name: 'Drafts', delimiter: '/', specialUse: '\\Drafts' },
  ]);
  messageFlagsAdd = vi.fn(async () => true);
  messageFlagsRemove = vi.fn(async () => true);
  append = vi.fn(async (_folder: string, _raw: Buffer, _flags: string[]) => ({ uid: 101, uidValidity: 1n }));
  mailboxCreate = vi.fn(async (path: string[]) => ({ path: path.join('/') }));
  messageDelete = vi.fn(async () => true);
  fetchCalls: { range: string; uid: boolean }[] = [];
  on(): this {
    return this;
  }
  get mailbox(): { exists: number; uidValidity: bigint; uidNext: number } {
    return { exists: this.exists, uidValidity: 1n, uidNext: 3 };
  }
  async *fetch(range: string, _query: unknown, options: { uid: boolean }): AsyncGenerator<Record<string, unknown>> {
    this.fetchCalls.push({ range, uid: options.uid });
    const matches = (n: number) => range.split(',').some(part => {
      const [start, end] = part.split(':').map(Number);
      return end === undefined ? n === start : n >= start! && n <= end;
    });
    for (const message of [...this.messages].sort((a, b) => Number(a['uid']) - Number(b['uid']))) if (matches(Number(message[options.uid ? 'uid' : 'seq']))) yield message;
  }
  async fetchOne(seq: string): Promise<Record<string, unknown> | false> {
    const message = this.messages.find((candidate) => String(candidate['uid']) === String(seq));
    return message ? { ...message, source: Buffer.from(RAW_MESSAGE) } : false;
  }
  async search(query: Record<string, unknown>): Promise<number[]> {
    if (query['header']) return [];
    return this.messages.map((message) => Number(message['uid']));
  }
}

function fixture() {
  process.env['AGENT_GITU_HOME'] = mkdtempSync(path.join(tmpdir(), 'gitu-mail-'));
  const imap = new FakeImap();
  const imapOptions: ImapFlowOptions[] = [];
  const smtpOptions: Record<string, unknown>[] = [];
  // Discovery is a network lookup in production, so every test says what it finds.
  const discover = vi.fn(async (address: string): Promise<MailDiscovery> => ({ domain: address.split('@')[1] ?? '', source: 'none', found: false }));
  const sent: Record<string, unknown>[] = [];
  const transport: MailTransport = {
    verify: vi.fn(async () => true),
    sendMail: vi.fn(async (message: Record<string, unknown>) => {
      sent.push(message);
      return { messageId: '<fixture>', accepted: ['someone@example.com'], rejected: [] };
    }),
  };
  const mail = new MailConnections(
    new MailSecretStore('linux'),
    (options: ImapFlowOptions) => { imapOptions.push(options); return imap as unknown as ImapFlow; },
    (options) => { smtpOptions.push(options); return transport; },
    discover,
  );
  return { mail, imap, imapOptions, smtpOptions, transport, sent, discover };
}

const valid = {
  address: 'agent@example.com',
  password: PASSWORD,
  imapHost: 'imap.example.com',
  smtpHost: 'smtp.example.com',
};

const serverKey = () => 'a'.repeat(64);
const previousKey = process.env['AGENT_GITU_SECRETS_KEY'];

afterEach(() => {
  if (previousKey === undefined) delete process.env['AGENT_GITU_SECRETS_KEY'];
  else process.env['AGENT_GITU_SECRETS_KEY'] = previousKey;
});

describe('mail connections', () => {
  beforeEach(() => {
    delete process.env['AGENT_GITU_SECRETS_KEY'];
    process.env['AGENT_GITU_HOME'] = mkdtempSync(path.join(tmpdir(), 'gitu-mail-case-'));
  });

  it.each([
    ['CONNECT_TIMEOUT', 'timed out'],
    ['ETIMEDOUT', 'timed out'],
    ['ENOTFOUND', 'resolve'],
    ['ECONNREFUSED', 'refused'],
    ['ERR_TLS_CERT_ALTNAME_INVALID', 'certificate'],
    ['AUTHENTICATIONFAILED', 'credentials'],
  ])('reports %s as a specific IMAP failure without leaking the server response', async (code, expected) => {
    const { mail, imap } = fixture();
    imap.connect.mockRejectedValueOnce(Object.assign(new Error('private response ' + PASSWORD), { code }));
    await expect(mail.connect(valid)).rejects.toThrow(expected);
    imap.connect.mockRejectedValueOnce(Object.assign(new Error('private response ' + PASSWORD), { code }));
    await mail.connect(valid).catch(error => { expect(error.message).not.toContain(PASSWORD); expect(error.message).not.toContain('private response'); });
  });

  it('sends the configured mail host as the TLS server name for IMAP and SMTP', async () => {
    const { mail, imapOptions, smtpOptions } = fixture();
    await mail.connect(valid);
    expect(imapOptions[0]!.tls?.servername).toBe('imap.example.com');
    expect((smtpOptions[0]!['tls'] as { servername: string }).servername).toBe('smtp.example.com');
  });

  it('rejects malformed mailbox details before opening a connection', async () => {
    const createImap = vi.fn(() => new FakeImap() as unknown as ImapFlow);
    const mail = new MailConnections(new MailSecretStore('linux'), createImap, () => ({ verify: async () => true, sendMail: async () => ({}) }));
    await expect(mail.connect({ ...valid, address: 'not-an-address' })).rejects.toThrow('Enter a valid email address.');
    await expect(mail.connect({ ...valid, password: '' })).rejects.toThrow('password');
    await expect(mail.connect({ ...valid, imapHost: 'not a host' })).rejects.toThrow('Enter a valid mail server host name.');
    await expect(mail.connect({ ...valid, imapPort: 70000 })).rejects.toThrow('Enter a port between 1 and 65535.');
    expect(createImap).not.toHaveBeenCalled();
    expect((await mail.accounts())).toEqual([]);
  });

  it('never writes the password in plaintext and fails closed when the key changes', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail } = fixture();
    const result = await mail.connect(valid);
    expect(result.account.address).toBe('agent@example.com');
    expect(result.account.toolkit).toBe(MAIL_SERVICE_SLUG);

    const raw = readFileSync(path.join(ensureGituHome().settings, 'mail-accounts.json'), 'utf8');
    expect(raw).not.toContain(PASSWORD);
    expect(raw).toContain('ciphertext');
    // The address is inside the envelope too, so a stray copy on disk is useless.
    expect(raw).not.toContain('agent@example.com');

    process.env['AGENT_GITU_SECRETS_KEY'] = 'b'.repeat(64);
    await expect(new MailConnections(new MailSecretStore('linux')).accounts()).rejects.toThrow();
  });

  it('lists, reads, flags, and sends through one connected mailbox', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail, imap, sent } = fixture();
    const { account } = await mail.connect(valid);

    const listed = (await mail.execute('mail_list', { limit: 5 }, account.id)) as { messages: Record<string, unknown>[] };
    expect(listed.messages.map((message) => message['uid'])).toEqual([2, 1]);
    expect(listed.messages[0]).toMatchObject({ from: 'Grace <grace@example.com>', subject: 'Newest note', seen: false });

    const read = (await mail.execute('mail_read', { uid: 1 }, account.id)) as Record<string, unknown>;
    expect(read['body']).toContain('Body text for the mailbox reader.');
    expect(read['subject']).toBe('Hello from the fixture');
    expect(JSON.stringify(read)).not.toContain(PASSWORD);

    await mail.execute('mail_mark', { uid: 2, read: true }, account.id);
    expect(imap.messageFlagsAdd).toHaveBeenCalledWith('2', ['\\Seen'], { uid: true });

    const sentResult = (await mail.execute('mail_send', { to: 'someone@example.com', subject: 'Ping', text: 'Hello' }, account.id)) as Record<string, unknown>;
    expect(sentResult['sent']).toBe(true);
    expect(sent[0]).toMatchObject({ from: 'agent@example.com', to: ['someone@example.com'], subject: 'Ping' });
    expect(JSON.stringify(sent)).not.toContain(PASSWORD);

    await expect(mail.execute('mail_send', { to: 'not-an-address', text: 'Hello' }, account.id)).rejects.toThrow('Enter a valid to address.');
    await expect(mail.execute('mail_send', { to: 'a@b.com', text: '' }, account.id)).rejects.toThrow('Provide the message text.');
    await expect(mail.execute('mail_delete_everything', {}, account.id)).rejects.toThrow('Unknown mail tool');
    await expect(mail.execute('mail_list', {}, 'mail-missing')).rejects.toThrow('no longer connected');
  });
  it('lists recent messages by sequence even when IMAP UIDs have gaps', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail, imap } = fixture();
    const { account } = await mail.connect(valid);
    imap.messages[0]!['uid'] = 400;
    imap.messages[1]!['uid'] = 900;
    const result = await mail.execute('mail_list', { limit: 1 }, account.id) as { messages: { uid: number }[] };
    expect(result.messages.map(message => message.uid)).toEqual([900]);
    expect(imap.fetchCalls.at(-1)).toEqual({ range: '2:2', uid: false });
    const unread = await mail.execute('mail_list', { unreadOnly: true }, account.id) as { messages: { uid: number }[] };
    expect(unread.messages.map(message => message.uid)).toEqual([900, 400]);
    expect(imap.fetchCalls.at(-1)?.uid).toBe(true);
  });

  it('preserves password whitespace and accepts non-email IMAP usernames', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail, imapOptions, smtpOptions } = fixture();
    await mail.connect({ ...valid, username: 'local-user', password: '  password  ' });
    expect(imapOptions[0]?.auth).toEqual({ user: 'local-user', pass: '  password  ' });
    expect(smtpOptions[0]?.['auth']).toEqual({ user: 'local-user', pass: '  password  ' });
  });

  it('closes the IMAP connection when selecting a folder fails', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail, imap } = fixture();
    const { account } = await mail.connect(valid);
    imap.logout.mockClear();
    imap.getMailboxLock.mockRejectedValueOnce(new Error('Missing folder'));
    await expect(mail.execute('mail_list', { folder: 'missing' }, account.id)).rejects.toThrow('Missing folder');
    expect(imap.logout).toHaveBeenCalledOnce();
  });

  it('opens a dedicated IDLE listener and persists its pause preference without exposing credentials', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail, imapOptions } = fixture();
    const { account } = await mail.connect(valid);
    expect(account.watchInbox).toBe(true);
    mail.createInboxClient(account.id);
    expect(imapOptions.at(-1)).toMatchObject({ disableAutoIdle: false, autoIdleDelay: 100, maxIdleTime: 1200000, socketTimeout: 1800000 });
    mail.setInboxWatch(account.id, false);
    expect((await mail.accounts())[0]?.watchInbox).toBe(false);
    expect(() => mail.createInboxClient(account.id)).toThrow('paused');
    mail.setInboxWatch(account.id, true);
    expect((await mail.accounts())[0]?.watchInbox).toBe(true);
    expect(JSON.stringify(await mail.accounts())).not.toContain(PASSWORD);
  });

  it('reads an arrival only in its original UID generation and bounds automatic large-message reads', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail, imap } = fixture();
    const { account } = await mail.connect(valid);
    expect(await mail.readInboxArrival(account.id, 1, '2')).toBeUndefined();
    expect(await mail.readInboxArrival(account.id, 1, '1')).toMatchObject({ uid: 1, body: expect.stringContaining('Body text for the mailbox reader') });
    imap.messages[0]!['size'] = 3 * 1024 * 1024;
    const fetch = vi.spyOn(imap, 'fetchOne');
    expect(await mail.readInboxArrival(account.id, 1, '1')).toMatchObject({ uid: 1, bodyOmitted: true });
    expect(fetch).toHaveBeenCalledOnce();
    expect(imap.messageFlagsAdd).not.toHaveBeenCalled();
  });

  it('saves real editable MIME in the provider Drafts folder without SMTP', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail, imap, sent } = fixture();
    const { account } = await mail.connect(valid);
    imap.list.mockResolvedValue([{ path: 'Entwuerfe', name: 'Entwuerfe', delimiter: '/', specialUse: '\\Drafts' }]);
    const result = await mail.execute('mail_save_draft', { to: 'someone@example.com', subject: 'Draft subject', text: 'User can edit this', bcc: 'private@example.com' }, account.id);
    expect(result).toMatchObject({ saved: true, sent: false, draft: true, folder: 'Entwuerfe', uid: 101 });
    expect(sent).toEqual([]);
    const [folder, raw, flags] = imap.append.mock.calls[0]!;
    expect(folder).toBe('Entwuerfe');
    expect(flags).toContain('\\Draft');
    const parsed = await simpleParser(raw);
    expect(parsed.subject).toBe('Draft subject');
    expect(parsed.text?.trim()).toBe('User can edit this');
    expect(JSON.stringify(parsed.bcc)).toContain('private@example.com');
    expect(parsed.messageId).toBeTruthy();
  });

  it('creates a missing Drafts folder and saves incomplete unsent drafts', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail, imap, sent } = fixture();
    const { account } = await mail.connect(valid);
    imap.list.mockResolvedValue([]);
    expect(await mail.execute('mail_save_draft', { subject: 'Work in progress' }, account.id)).toMatchObject({ saved: true, sent: false, folder: 'Drafts' });
    expect(imap.mailboxCreate).toHaveBeenCalledWith(['Drafts']);
    expect(sent).toEqual([]);
  });

  it('saves a replacement draft before deleting the previous version', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail, imap } = fixture();
    const { account } = await mail.connect(valid);
    imap.messages[0]!['flags'] = new Set(['\\Draft']);
    imap.append.mockRejectedValueOnce(new Error('Quota exceeded'));
    expect(await mail.execute('mail_save_draft', { draftUid: 1, text: 'Replacement' }, account.id)).toMatchObject({ saved: null, sent: false, status: 'unknown' });
    expect(imap.messageDelete).not.toHaveBeenCalled();
    expect(await mail.execute('mail_save_draft', { draftUid: 1, text: 'Replacement' }, account.id)).toMatchObject({ saved: true, uid: 101 });
    expect(imap.messageDelete).toHaveBeenCalledWith('1', { uid: true });
    await expect(mail.execute('mail_save_draft', { draftUid: 2, text: 'Wrong UID' }, account.id)).rejects.toThrow('original draft');
  });

  it('keeps attached originals and avoids unscoped expunge on older IMAP servers', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail, imap } = fixture();
    const { account } = await mail.connect(valid);
    vi.spyOn(imap, 'fetchOne').mockResolvedValueOnce({ uid: 1, flags: new Set(['\\Draft']), source: Buffer.from('Content-Type: application/octet-stream\r\nContent-Disposition: attachment; filename=keep.txt\r\n\r\nOriginal attachment') });
    await expect(mail.execute('mail_save_draft', { draftUid: 1, text: 'Replacement' }, account.id)).rejects.toThrow('attachments could be lost');
    expect(imap.append).not.toHaveBeenCalled();
    imap.messages[0]!['flags'] = new Set(['\\Draft']);
    imap.capabilities.clear();
    expect(await mail.execute('mail_save_draft', { draftUid: 1, text: 'Replacement' }, account.id)).toMatchObject({ saved: true, warning: expect.stringContaining('both versions') });
    expect(imap.messageDelete).not.toHaveBeenCalled();
  });

  it('saves the sent MIME with the same Message-ID and exposes reply headers', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail, imap, sent } = fixture();
    const { account } = await mail.connect(valid);
    expect(await mail.execute('mail_read', { uid: 1 }, account.id)).toMatchObject({ messageId: '<original@example.com>' });
    const result = await mail.execute('mail_send', { to: 'someone@example.com', text: 'Reply', inReplyTo: '<original@example.com>', references: '<original@example.com>' }, account.id);
    expect(result).toMatchObject({ sent: true, sentCopySaved: true, folder: 'Sent' });
    const parsed = await simpleParser(imap.append.mock.calls[0]![1]);
    expect(parsed.messageId).toBe(sent[0]!['messageId']);
    expect(parsed.inReplyTo).toBe('<original@example.com>');
  });

  it('reports rejection, partial acceptance, and SMTP uncertainty accurately', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail, transport, imap } = fixture();
    const { account } = await mail.connect(valid);
    vi.mocked(transport.sendMail).mockResolvedValueOnce({ accepted: [], rejected: ['someone@example.com'] });
    expect(await mail.execute('mail_send', { to: 'someone@example.com', text: 'Test' }, account.id)).toMatchObject({ sent: false, accepted: 0 });
    expect(imap.append).not.toHaveBeenCalled();
    vi.mocked(transport.sendMail).mockResolvedValueOnce({ accepted: ['a@example.com'], rejected: ['b@example.com'] });
    expect(await mail.execute('mail_send', { to: 'a@example.com,b@example.com', text: 'Test' }, account.id)).toMatchObject({ sent: true, partial: true, rejected: 1 });
    vi.mocked(transport.sendMail).mockRejectedValueOnce(new Error('Connection lost'));
    expect(await mail.execute('mail_send', { to: 'someone@example.com', text: 'Test' }, account.id)).toMatchObject({ sent: null, status: 'unknown', warning: expect.stringContaining('duplicate') });
    vi.mocked(transport.sendMail).mockRejectedValueOnce(Object.assign(new Error('Authentication failed'), { code: 'EAUTH' }));
    expect(await mail.execute('mail_send', { to: 'someone@example.com', text: 'Test' }, account.id)).toMatchObject({ sent: false, status: 'rejected', warning: expect.stringContaining('SMTP credentials') });
  });

  it('does not turn a Sent-copy failure into a retryable delivery failure', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail, imap, sent } = fixture();
    const { account } = await mail.connect(valid);
    imap.append.mockRejectedValueOnce(new Error('Disk full'));
    expect(await mail.execute('mail_send', { to: 'someone@example.com', text: 'Test' }, account.id)).toMatchObject({ sent: true, sentCopySaved: false, warning: expect.stringContaining('Do not resend') });
    expect(sent).toHaveLength(1);
  });

  it('does not append a second Sent copy when the server already saved it', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail, imap } = fixture();
    const { account } = await mail.connect(valid);
    vi.spyOn(imap, 'search').mockResolvedValueOnce([42]);
    expect(await mail.execute('mail_send', { to: 'someone@example.com', text: 'Test' }, account.id)).toMatchObject({ sent: true, sentCopySaved: true, uid: 42 });
    expect(imap.append).not.toHaveBeenCalled();
  });

  it('migrates legacy plaintext mailboxes and their recovery copies without losing account IDs', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail } = fixture();
    const { account } = await mail.connect(valid);
    const secrets = new MailSecretStore('linux');
    const records = secrets.read()!;
    const file = path.join(ensureGituHome().settings, 'mail-accounts.json');
    writeFileSync(file, JSON.stringify(records));
    writeFileSync(file + '.bak', JSON.stringify(records));
    expect((await mail.accounts()).map(value => value.id)).toEqual([account.id]);
    for (const copy of [file, file + '.bak']) {
      const protectedText = readFileSync(copy, 'utf8');
      expect(protectedText).not.toContain(PASSWORD);
      expect(protectedText).not.toContain(valid.address);
      expect(JSON.parse(protectedText).ciphertext).toBeTypeOf('string');
    }
    writeFileSync(file, '{interrupted');
    expect((await mail.accounts()).map(value => value.id)).toEqual([account.id]);
    expect(secrets.read()![0]?.id).toBe(account.id);
  });

  it('fills both servers from the address, and lets an explicit provider win', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    process.env['AGENT_GITU_HOME'] = mkdtempSync(path.join(tmpdir(), 'gitu-mail-detect-'));
    const imap = new FakeImap();
    const smtp: Record<string, unknown>[] = [];
    const mail = new MailConnections(
      new MailSecretStore('linux'),
      () => imap as unknown as ImapFlow,
      (options) => { smtp.push(options); return { verify: async () => true, sendMail: async () => ({}) }; },
      async (address) => ({ domain: address.split('@')[1] ?? '', source: 'none', found: false }),
    );
    // Address and password only: the servers come from the provider preset.
    await mail.connect({ address: 'help@gmail.com', password: PASSWORD });
    expect(smtp[0]).toMatchObject({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: 'help@gmail.com' } });
    // An explicit provider overrides the domain guess, including STARTTLS.
    await mail.connect({ address: 'work@example.com', password: PASSWORD, provider: 'outlook' });
    expect(smtp[1]).toMatchObject({ host: 'smtp.office365.com', port: 587, secure: false });
    // A domain that publishes nothing still needs real servers rather than a silent guess.
    await expect(mail.connect({ address: 'me@unknown.example', password: PASSWORD })).rejects.toThrow('Enter a valid mail server host name.');
  });

  it('fills self-hosted servers from published autoconfig or SRV records', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    process.env['AGENT_GITU_HOME'] = mkdtempSync(path.join(tmpdir(), 'gitu-mail-discovery-'));
    const { mail, imapOptions, smtpOptions, discover } = fixture();

    // A Mailcow-style host: the address and password are enough.
    discover.mockResolvedValue({
      domain: 'mailcow.example',
      source: 'autoconfig',
      found: true,
      imap: { host: 'mail.mailcow.example', port: 993, secure: true },
      smtp: { host: 'mail.mailcow.example', port: 587, secure: false },
      provider: 'Mailcow',
    });
    await mail.connect({ address: 'ada@mailcow.example', password: PASSWORD });
    expect(discover).toHaveBeenCalledWith('ada@mailcow.example');
    expect(imapOptions[0]).toMatchObject({ host: 'mail.mailcow.example', port: 993, secure: true });
    // STARTTLS on the submission port comes from the document, not a guess.
    expect(smtpOptions[0]).toMatchObject({ host: 'mail.mailcow.example', port: 587, secure: false });

    // A server the user typed always wins; discovery is not even asked.
    discover.mockClear();
    await mail.connect({ address: 'second@mailcow.example', password: PASSWORD, imapHost: 'imap.mine.example', smtpHost: 'smtp.mine.example' });
    expect(discover).not.toHaveBeenCalled();
    expect(imapOptions[1]).toMatchObject({ host: 'imap.mine.example', port: 993 });
    expect(smtpOptions[1]).toMatchObject({ host: 'smtp.mine.example', port: 465 });

    // Documented providers are still answered from the preset table.
    discover.mockClear();
    await mail.connect({ address: 'help@gmail.com', password: PASSWORD });
    expect(discover).not.toHaveBeenCalled();
    expect(imapOptions[2]).toMatchObject({ host: 'imap.gmail.com', port: 993 });

    // Reuse this address's result; another mailbox needs its own login expansion.
    discover.mockClear();
    await expect(mail.detect({ address: 'nope' })).rejects.toThrow('Enter a valid email address.');
    expect((await mail.detect({ address: 'ada@mailcow.example' })).found).toBe(true);
    expect((await mail.detect({ address: 'other@mailcow.example' })).found).toBe(true);
    expect(discover).toHaveBeenCalledWith('other@mailcow.example');
  });

  it('refreshes each address independently and bypasses stale cached settings', async () => {
    const { mail, discover } = fixture();
    discover.mockImplementation(async address => ({ domain: 'example.com', source: 'autoconfig', found: true, username: address }));
    expect((await mail.detect({ address: 'first@example.com' })).username).toBe('first@example.com');
    expect((await mail.detect({ address: 'second@example.com' })).username).toBe('second@example.com');
    await mail.detect({ address: 'first@example.com' });
    expect(discover).toHaveBeenCalledTimes(2);
    await mail.detect({ address: 'first@example.com', fresh: true });
    expect(discover).toHaveBeenCalledTimes(3);
  });

  it('recovers a saved mailbox from fresh domain settings while retaining its identity', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail, discover, imapOptions, smtpOptions, sent } = fixture();
    const { account } = await mail.connect({ ...valid, allowSelfSigned: true });
    await mail.detect({ address: valid.address }); // cache an empty answer
    discover.mockResolvedValue({ domain: 'example.com', source: 'srv', found: true, imap: { host: 'new-imap.example.com', port: 143, secure: false }, smtp: { host: 'new-smtp.example.com', port: 587, secure: false } });
    const result = await mail.rediscover(account.id);
    expect(result.account.id).toBe(account.id);
    expect(await mail.accounts()).toHaveLength(1);
    expect(imapOptions.at(-1)).toMatchObject({ host: 'new-imap.example.com', doSTARTTLS: true, tls: { rejectUnauthorized: true, servername: 'new-imap.example.com' } });
    expect(smtpOptions.at(-1)).toMatchObject({ host: 'new-smtp.example.com', requireTLS: true, tls: { rejectUnauthorized: true } });
    expect(new MailSecretStore('linux').read()![0]!.imap.host).toBe('new-imap.example.com');
    expect(sent).toEqual([]);
  });

  it.each(['missing', 'http', 'tls', 'smtp', 'removed'])('keeps saved credentials and settings intact when rediscovery is %s', async failure => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail, discover, imap, transport, sent } = fixture();
    const { account } = await mail.connect(valid);
    const secrets = new MailSecretStore('linux'), before = secrets.read();
    discover.mockResolvedValue({ domain: 'example.com', source: 'autoconfig', found: true, insecure: failure === 'http', imap: { host: 'new.example.com', port: 993, secure: true }, smtp: { host: 'new.example.com', port: 465, secure: true } });
    if (failure === 'missing') discover.mockResolvedValue({ domain: 'example.com', source: 'none', found: false });
    if (failure === 'tls') imap.connect.mockRejectedValueOnce(Object.assign(new Error(PASSWORD), { code: 'ERR_TLS_CERT_ALTNAME_INVALID' }));
    if (failure === 'smtp') vi.mocked(transport.verify).mockRejectedValueOnce(new Error(PASSWORD));
    if (failure === 'removed') vi.mocked(transport.verify).mockImplementationOnce(async () => { await mail.remove(account.id); return true; });
    await expect(mail.rediscover(account.id)).rejects.not.toThrow(PASSWORD);
    expect(secrets.read()).toEqual(failure === 'removed' ? [] : before);
    expect(sent).toEqual([]);
  });

  it('removes a mailbox and keeps a warning when only sending fails', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    process.env['AGENT_GITU_HOME'] = mkdtempSync(path.join(tmpdir(), 'gitu-mail-'));
    const imap = new FakeImap();
    const mail = new MailConnections(
      new MailSecretStore('linux'),
      () => imap as unknown as ImapFlow,
      () => ({ verify: async () => { throw new Error('smtp blocked'); }, sendMail: async () => ({}) }),
    );
    const result = await mail.connect(valid);
    expect(result.warning).toContain('sending failed');
    expect((await mail.accounts())).toHaveLength(1);
    await mail.remove(result.account.id);
    expect(await mail.accounts()).toEqual([]);
    await expect(mail.remove(result.account.id)).rejects.toThrow('no longer connected');
  });
});

describe('mail provider presets', () => {
  it('resolves documented servers from the address and always offers a manual path', () => {
    expect(mailPresetFor('someone@gmail.com')?.imap).toEqual({ host: 'imap.gmail.com', port: 993, secure: true });
    expect(mailPresetFor('someone@fastmail.com')?.smtp.host).toBe('smtp.fastmail.com');
    expect(mailPresetFor('someone@unknown.example')).toBeUndefined();
    expect(MAIL_PROVIDERS.some((provider) => provider.id === 'proton-bridge')).toBe(true);
    expect(roleAppSuggestions('executive assistant').map((suggestion) => suggestion.service)).toContain('mail');
  });
});

describe('mail API routes', () => {
  it.each(['accept', 'save-draft'])('stores authenticated edits for %s without changing account or running SMTP', async (action) => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail, sent } = fixture();
    const { account } = await mail.connect(valid);
    const server = new GituServer({ cwd: process.env['AGENT_GITU_HOME']!, port: 0, passwordRequired: false, mailConnections: mail, mailInboxWatching: false, llm: { name: 'fixture', async complete() { return 'Done.'; } }, coworkCompletionProtocol: 'legacy' });
    const store = (server as unknown as { cowork(): CoworkStore }).cowork();
    const agent = store.saveAgent({ name: 'Writer', systemPrompt: 'Write emails' });
    store.assignAppAccount(agent.id, 'mail', account.id);
    const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    const original = { service: 'mail', accountId: account.id, tool: 'mail_send', args: { to: 'original@example.com', text: 'Original' } };
    const request = store.addRequest({ conversationId: conversation.id, agentId: agent.id, kind: 'recommendation', title: 'Run mail_send', detail: 'Review this mail action:\n' + JSON.stringify(original), appAction: original });
    const base = 'http://127.0.0.1:' + await server.start();
    const post = (body: unknown) => fetch(base + '/api/cowork/requests/' + request.id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    try {
      expect((await post({ action: 'always-allow' })).status).toBe(400);
      expect((await post({ action, reviewedArgs: [] })).status).toBe(400);
      expect(store.getRequest(request.id)?.status).toBe('open');
      expect(store.appPermissions()).toEqual([]);
      const reviewedArgs = { to: 'edited@example.com', text: 'User edited text', subject: 'User subject' };
      const response = await post({ action, reviewedArgs, service: 'attacker', tool: 'OTHER', accountId: 'foreign' });
      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.request.reviewedAction).toEqual({ ...original, tool: action === 'save-draft' ? 'mail_save_draft' : 'mail_send', args: reviewedArgs });
      expect(result.request.appAction).toEqual(original);
      expect(sent).toEqual([]);
      expect((await post({ action, reviewedArgs })).status).toBe(404);
      expect(new CoworkStore().getRequest(request.id)?.reviewedAction?.args).toEqual(reviewedArgs);
    } finally { await server.stop(); }
  });

  it('connects, assigns, lists, and deletes a mailbox through the Connections API', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail, imap, imapOptions, discover } = fixture();
    const server = new GituServer({
      cwd: process.env['AGENT_GITU_HOME']!,
      port: 0,
      passwordRequired: false,
      mailConnections: mail,
      mailInboxWatching: false,
      llm: { name: 'fixture', async complete() { return 'Done.'; } },
      coworkCompletionProtocol: 'legacy',
    });
    const store = (server as unknown as { cowork(): CoworkStore }).cowork();
    const agent = store.saveAgent({ name: 'Assistant', tagline: 'Executive assistant', systemPrompt: 'Help.' });
    const base = 'http://127.0.0.1:' + await server.start();
    const post = (route: string, body: unknown) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const connections = () => fetch(base + '/api/connected-apps?agentId=' + agent.id).then((response) => response.json());
    try {
      const setup = await connections();
      expect(setup.configured).toBe(false);
      expect(setup.canConfigure).toBe(true);
      expect(setup.keyStorage).toBeDefined();
      // A mailbox needs one teammate; the port is reset for each address.
      expect((await post('/api/connected-apps/mail', valid)).status).toBe(400);
      expect((await post('/api/connected-apps/mail', { ...valid, agentId: 'not-a-teammate' })).status).toBe(400);
      imap.connect.mockRejectedValueOnce(new Error('imap refused the login'));
      const refused = await post('/api/connected-apps/mail', { ...valid, address: 'broken@example.com', agentId: agent.id });
      expect(refused.status).toBe(400);
      expect((await refused.json()).error).toContain('Could not sign in to imap.example.com');
      expect((await post('/api/connected-apps/mail', { ...valid, address: 'wrong@example.com', imapPort: 70000, agentId: agent.id })).status).toBe(400);
      // A refused login stores nothing at all.
      expect((await mail.accounts())).toEqual([]);

      const connected = await post('/api/connected-apps/mail', { ...valid, agentId: agent.id });
      expect(connected.status).toBe(200);
      const first = (await connected.json()).account as { id: string; address: string };
      expect(first.address).toBe('agent@example.com');
      expect((await post('/api/connected-apps/mail/watch', { accountId: first.id, enabled: 'false' })).status).toBe(400);
      expect((await post('/api/connected-apps/mail/watch', { accountId: first.id, enabled: false })).status).toBe(200);
      expect((await mail.accounts())[0]?.watchInbox).toBe(false);
      expect((await post('/api/connected-apps/mail/watch', { accountId: first.id, enabled: true })).status).toBe(200);
      expect(store.appAccountAssigned(agent.id, 'mail', first.id)).toBe(true);

      const listed = await connections();
      expect(listed.configured).toBe(false);
      expect(listed.canConfigure).toBe(true);
      expect(listed.mail.accounts.map((account: { id: string }) => account.id)).toEqual([first.id]);
      expect(listed.accounts.map((account: { id: string }) => account.id)).toContain(first.id);
      expect(listed.mail.available).toEqual([]);
      expect(listed.mail.providers.map((provider: { id: string }) => provider.id)).toContain('gmail');
      expect((await connections()).mail.keyStorage).toBe('server-encrypted');

      // A saved mailbox can be released and handed back without reconnecting it.
      const second = (await (await post('/api/connected-apps/mail', { ...valid, address: 'second@example.com', label: 'Sales', agentId: agent.id })).json()).account as { id: string };
      expect((await post('/api/connected-apps/disconnect', { agentId: agent.id, accountId: second.id })).status).toBe(200);
      const released = await connections();
      expect(released.mail.accounts.map((account: { id: string }) => account.id)).toEqual([first.id]);
      expect(released.mail.available.map((account: { id: string }) => account.id)).toEqual([second.id]);
      expect(released.mail.available[0].label).toBe('Sales');
      expect((await post('/api/connected-apps/assign', { agentId: agent.id, accountId: second.id })).status).toBe(200);
      expect(store.appAccountAssigned(agent.id, 'mail', second.id)).toBe(true);

      expect((await post('/api/connected-apps/mail/remove', { accountId: second.id })).status).toBe(200);
      expect(store.appAccountAssigned(agent.id, 'mail', second.id)).toBe(false);
      expect((await connections()).mail.accounts.map((account: { id: string }) => account.id)).toEqual([first.id]);

      // A self-hosted domain fills itself in from the published standards: the
      // form asks this route while typing, and connecting with only an address
      // and password still lands on the right servers.
      discover.mockResolvedValue({
        domain: 'mailcow.example', source: 'autoconfig', found: true,
        imap: { host: 'mail.mailcow.example', port: 993, secure: true },
        smtp: { host: 'mail.mailcow.example', port: 587, secure: false },
      });
      const lookup = await fetch(base + '/api/connected-apps/mail/detect?address=' + encodeURIComponent('ada@mailcow.example')).then((response) => response.json());
      expect(lookup).toMatchObject({ found: true, source: 'autoconfig', imap: { host: 'mail.mailcow.example', port: 993, secure: true } });
      expect((await fetch(base + '/api/connected-apps/mail/detect?address=nope')).status).toBe(400);
      const selfHosted = await post('/api/connected-apps/mail', { address: 'ada@mailcow.example', password: PASSWORD, agentId: agent.id });
      expect(selfHosted.status).toBe(200);
      expect(imapOptions[imapOptions.length - 1]).toMatchObject({ host: 'mail.mailcow.example', port: 993, secure: true });
    } finally {
      await server.stop();
    }
  });
});

describe('connections hub', () => {
  const composio = (overrides: Partial<Record<string, unknown>> = {}) =>
    ({
      configured: true,
      setup: { canConfigure: true, keyStorage: 'server-encrypted' },
      catalog: vi.fn(async () => ({ services: [{ slug: 'github', name: 'GitHub' }] })),
      accounts: vi.fn(async () => [{ id: 'own', toolkit: 'github', status: 'ACTIVE', disabled: false }]),
      tools: vi.fn(async () => [{ slug: 'GITHUB_LIST', name: 'List' }]),
      execute: vi.fn(async () => ({ data: 'ok' })),
      ...overrides,
    }) as unknown as ComposioConnections;

  it('keeps working mailboxes when the OAuth provider is down', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail } = fixture();
    const { account } = await mail.connect(valid);
    const down = composio({
      catalog: vi.fn(async () => { throw new Error('composio down'); }),
      accounts: vi.fn(async () => { throw new Error('composio down'); }),
    });
    const hub = new ConnectionsHub(down, mail);
    expect(hub.configured).toBe(true);
    const catalog = await hub.catalog('');
    expect(catalog.services.map((service) => service.slug)).toContain(MAIL_SERVICE_SLUG);
    expect((await hub.accounts()).map((entry) => entry.id)).toContain(account.id);
    expect((await hub.tools(MAIL_SERVICE_SLUG)).map((tool) => tool.slug)).toContain('mail_send');
    expect(await hub.execute(MAIL_SERVICE_SLUG, 'mail_folders', {}, account.id)).toMatchObject({ folders: expect.any(Array) });
  });

  it('keeps OAuth accounts usable when native mailbox storage is unavailable', async () => {
    const { mail } = fixture();
    vi.spyOn(mail, 'accounts').mockRejectedValue(new Error('Mailbox key unavailable'));
    const hub = new ConnectionsHub(composio(), mail);
    expect(await hub.accounts()).toEqual([{ id: 'own', toolkit: 'github', status: 'ACTIVE', disabled: false }]);
    expect(hub.accountStatusIncomplete).toBe(true);
  });

  it('routes non-mail services to the OAuth provider', async () => {
    const { mail } = fixture();
    const provider = composio();
    const hub = new ConnectionsHub(provider, mail);
    expect(await hub.execute('github', 'GITHUB_LIST', {}, 'own')).toEqual({ data: 'ok' });
    expect((await hub.catalog('')).services.map((service) => service.slug)).toContain('github');
    expect((await hub.accounts()).map((entry) => entry.toolkit)).toContain('github');
  });

  it('discovers native email capabilities without an OAuth provider and ranks natural requests', async () => {
    const { mail } = fixture();
    const provider = composio({ configured: false });
    const hub = new ConnectionsHub(provider, mail);
    for (const query of ['email', 'read my inbox', 'e-mail', 'SMTP']) {
      expect((await hub.catalog(query)).services.map(service => service.slug)).toContain('mail');
    }
    expect((await hub.tools('mail', 'send an email'))[0]?.slug).toBe('mail_send');
    expect((await hub.tools('mail', 'unread emails'))[0]?.slug).toBe('mail_list');
    expect((await hub.tools('mail', undefined, 'mail_read'))[0]?.inputParameters).toMatchObject({ required: ['uid'] });
    expect(await hub.tools('mail', 'madeupfeature')).toEqual([]);
    expect(provider.tools).not.toHaveBeenCalled();
  });

  it('executes approved assigned mailbox reads with writes/config/shell disabled and keeps mutations gated', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail, imap, sent } = fixture();
    const { account } = await mail.connect(valid);
    const hub = new ConnectionsHub(composio({ configured: false }), mail);
    const store = new CoworkStore();
    const agent = store.saveAgent({ name: 'Reader', systemPrompt: 'Read assigned mail.', allowWrites: false, allowConfig: false, allowShell: false });
    const other = store.saveAgent({ name: 'Other', systemPrompt: 'Help.' });
    const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    store.assignAppAccount(agent.id, 'mail', account.id);
    const scope = { store, agent, conversationId: conversation.id } as CoworkToolScope;
    const ctx = { connectedApps: hub } as ToolContext;
    const perms = { allowWrites: false, allowConfig: false, allowShell: false, chief: false, browser: false };
    expect(coworkNativeTools(agent, false).some(tool => tool.name === 'connected_apps')).toBe(true);
    const params = { action: 'execute', service: 'mail', accountId: account.id, tool: 'mail_read', args: { uid: 1 } };
    const reads = imap.getMailboxLock.mock.calls.length;
    const review = await executeCoworkTool(ctx, 'connected_apps', params, perms, scope);
    expect(review.output).toMatch(/^Review /);
    expect(imap.getMailboxLock.mock.calls.length).toBe(reads);
    const card = store.openRequests(conversation.id)[0]!;
    store.resolveRequest(card.id, 'accepted');
    const approved = { ...params, approvalId: card.id };
    const read = await executeCoworkTool(ctx, 'connected_apps', approved, perms, scope);
    expect(read.ok).toBe(true);
    expect(JSON.parse(read.output).body).toContain('Body text for the mailbox reader.');
    expect(read.output).not.toContain(PASSWORD);
    expect((await executeCoworkTool(ctx, 'connected_apps', approved, perms, { ...scope, agent: other })).ok).toBe(false);
    for (const tool of ['mail_send', 'mail_mark', 'mail_read_and_delete']) {
      expect((await executeCoworkTool(ctx, 'connected_apps', { ...params, tool }, perms, scope)).ok).toBe(false);
    }
    expect(sent).toEqual([]);
    expect(imap.messageFlagsAdd).not.toHaveBeenCalled();
    store.unassignAppAccount(agent.id, account.id);
    expect((await executeCoworkTool(ctx, 'connected_apps', approved, perms, scope)).ok).toBe(false);
  });

  it('stops an autonomous mail mission at a pending send approval without submitting or claiming completion', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail, sent } = fixture();
    const { account } = await mail.connect(valid);
    const hub = new ConnectionsHub(composio({ configured: false }), mail);
    const store = new CoworkStore();
    const agent = store.saveAgent({ name: 'Assistant', systemPrompt: 'Handle assigned mail.', allowWrites: true, allowConfig: true });
    const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    store.assignAppAccount(agent.id, 'mail', account.id);
    const mission = store.createMission({ conversationId: conversation.id, agentId: agent.id, goal: 'Send an approved update', criteria: [] });
    const memory = new CoworkMemory(new MemoryStore(path.join(process.env['AGENT_GITU_HOME']!, 'fixture-memory.json')), 'mail-fixture');
    const complete = vi.fn(async () => '<tool>' + JSON.stringify({ name: 'connected_apps', params: { action: 'execute', service: 'mail', tool: 'mail_send', args: { to: 'someone@example.com', text: 'Update' } } }) + '</tool>\n{"status":"done","progress":"Sent","result":"Sent"}');
    const result = await runMissionSession({ mission, agent, deps: { agents: [agent], store, memory, connectedApps: hub, resolveLlm: () => ({ complete }), toolContext: () => ({ connectedApps: hub }) as ToolContext, autoLearn: false }, append: message => store.appendMessage(conversation.id, message) });
    expect(complete).toHaveBeenCalledOnce();
    expect(result.status).toBe('blocked');
    expect(result.result).toBeUndefined();
    expect(result.blockers).toContain('request card');
    expect(result.progress).toContain('has not been submitted');
    expect(store.openRequests(conversation.id)).toHaveLength(1);
    expect(sent).toEqual([]);
    const trigger = store.appendMessage(conversation.id, { role: 'user', via: 'web', text: 'Send an update.' });
    const chat = await runConversationTurn({ conversation, trigger, history: [trigger], deps: { agents: [agent], store, memory, connectedApps: hub, resolveLlm: () => ({ complete }), toolContext: () => ({ connectedApps: hub }) as ToolContext, autoLearn: false }, append: message => store.appendMessage(conversation.id, message) });
    expect(chat.messages.at(-1)?.text).toBe('This action is waiting for your approval in the card above.');
    expect(store.openRequests(conversation.id)).toHaveLength(1);
    expect(sent).toEqual([]);
  });

  it('allows a reviewed mail send with write access while keeping account configuration disabled', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail, sent } = fixture();
    const { account } = await mail.connect(valid);
    const hub = new ConnectionsHub(composio({ configured: false }), mail), store = new CoworkStore();
    const agent = store.saveAgent({ name: 'Writer', systemPrompt: 'Send reviewed messages.', allowWrites: true, allowConfig: false });
    const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    store.assignAppAccount(agent.id, 'mail', account.id);
    const scope = { store, agent, conversationId: conversation.id } as CoworkToolScope;
    const ctx = { connectedApps: hub } as ToolContext;
    const perms = { allowWrites: true, allowConfig: false, allowShell: false, chief: false, browser: false };
    const params = { action: 'execute', service: 'mail', tool: 'mail_send', args: { to: 'someone@example.com', text: 'Reviewed update' } };
    expect((await executeCoworkTool(ctx, 'connected_apps', params, perms, scope)).output).toMatch(/review .* posted/i);
    expect(sent).toEqual([]);
    const card = store.openRequests(conversation.id)[0]!;
    store.resolveRequest(card.id, 'accepted');
    expect((await executeCoworkTool(ctx, 'connected_apps', { ...params, approvalId: card.id }, perms, scope)).ok).toBe(true);
    expect(sent).toHaveLength(1);
    expect(store.appConnections(agent.id)).toHaveLength(1);
    expect(store.getAgent(agent.id)?.allowConfig).toBe(false);
  });

  it.each([false, true])('executes only the user-edited email, saveDraft=%s, once', async (saveDraft) => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail, sent, imap } = fixture();
    const { account } = await mail.connect(valid);
    const hub = new ConnectionsHub(composio({ configured: false }), mail), store = new CoworkStore();
    const agent = store.saveAgent({ name: 'Writer', systemPrompt: 'Write emails', allowWrites: true });
    const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    store.assignAppAccount(agent.id, 'mail', account.id);
    const scope = { store, agent, conversationId: conversation.id } as CoworkToolScope;
    const ctx = { connectedApps: hub } as ToolContext;
    const perms = { allowWrites: true, allowConfig: false, allowShell: false, chief: false, browser: false };
    const params = { action: 'execute', service: 'mail', tool: 'mail_send', args: { to: 'original@example.com', text: 'Original' } };
    vi.spyOn(store, 'appActionAllowed').mockReturnValue(true);
    await executeCoworkTool(ctx, 'connected_apps', params, perms, scope);
    const card = store.openRequests(conversation.id)[0]!;
    expect(() => store.allowAppActionForRequest(card.id)).toThrow('review each time');
    store.resolveRequest(card.id, 'accepted', saveDraft ? 'Save draft only' : '', { args: { to: 'edited@example.com', subject: 'Changed', text: 'Edited by user' }, saveDraft });
    // The original agent call is repeated; execution substitutes the user version.
    const renewedContext = { ...ctx, connectedApps: new ConnectionsHub(composio({ configured: false }), mail) };
    const results = await Promise.all([1, 2].map(() => executeCoworkTool(renewedContext, 'connected_apps', { ...params, args: { text: 'Original', to: 'original@example.com' }, approvalId: card.id }, perms, scope)));
    expect(results.some(result => result.output.includes(saveDraft ? '"draft":true' : '"sent":true'))).toBe(true);
    expect(sent).toHaveLength(saveDraft ? 0 : 1);
    expect(imap.append).toHaveBeenCalledOnce();
    const parsed = await simpleParser(imap.append.mock.calls[0]![1]);
    expect(parsed.text?.trim()).toBe('Edited by user');
    expect(JSON.stringify(parsed.to)).toContain('edited@example.com');
    expect(parsed.subject).toBe('Changed');
    expect(store.getRequest(card.id)?.appAction?.args).toEqual(params.args);
  });

  it('reuses edited review for other connected apps without allowing a tool/account switch', async () => {
    fixture();
    const provider = composio(), store = new CoworkStore();
    const hub = new ConnectionsHub(provider, new MailConnections(new MailSecretStore('linux')));
    const agent = store.saveAgent({ name: 'Writer', systemPrompt: 'Prepare app actions', allowWrites: true, allowConfig: true });
    const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    store.assignAppAccount(agent.id, 'github', 'own');
    const scope = { store, agent, conversationId: conversation.id } as CoworkToolScope;
    const ctx = { connectedApps: hub } as ToolContext;
    const perms = { allowWrites: true, allowConfig: true, allowShell: false, chief: false, browser: false };
    const params = { action: 'execute', service: 'github', tool: 'GITHUB_LIST', args: { title: 'Original' } };
    await executeCoworkTool(ctx, 'connected_apps', params, perms, scope);
    const card = store.openRequests(conversation.id)[0]!;
    expect(() => store.resolveRequest(card.id, 'accepted', '', { args: [], saveDraft: false })).toThrow('valid action');
    expect(() => store.resolveRequest(card.id, 'accepted', '', { saveDraft: true })).toThrow('native mailbox');
    expect(store.getRequest(card.id)?.status).toBe('open');
    store.resolveRequest(card.id, 'accepted', '', { args: { title: 'User edit', enabled: false, labels: ['one'] } });
    await executeCoworkTool(ctx, 'connected_apps', { ...params, approvalId: card.id }, perms, scope);
    expect(provider.execute).toHaveBeenCalledWith('github', 'GITHUB_LIST', { title: 'User edit', enabled: false, labels: ['one'] }, 'own');
  });
});
