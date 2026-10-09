import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImapFlow, ImapFlowOptions } from 'imapflow';
import { MAIL_PROVIDERS, MailConnections, MailSecretStore, mailPresetFor, type MailTransport } from '../src/connections/mail.js';
import type { MailDiscovery } from '../src/connections/mail-detect.js';
import { ConnectionsHub, MAIL_SERVICE_SLUG } from '../src/connections/provider.js';
import type { ComposioConnections } from '../src/connections/composio.js';
import { roleAppSuggestions } from '../src/cowork/app-recommendations.js';
import { CoworkStore } from '../src/cowork/store.js';
import { GituServer } from '../src/server/server.js';
import { ensureGituHome } from '../src/workspace/home.js';

const PASSWORD = 'hunter2-should-never-appear';

const RAW_MESSAGE = [
  'From: Ada Lovelace <ada@example.com>',
  'To: agent@example.com',
  'Subject: Hello from the fixture',
  'Date: Mon, 6 Oct 2026 10:00:00 +0000',
  '',
  'Body text for the mailbox reader.',
].join('\r\n');

class FakeImap {
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
  ]);
  messageFlagsAdd = vi.fn(async () => true);
  messageFlagsRemove = vi.fn(async () => true);
  on(): this {
    return this;
  }
  get mailbox(): { exists: number } {
    return { exists: this.exists };
  }
  async *fetch(): AsyncGenerator<Record<string, unknown>> {
    for (const message of [...this.messages].sort((a, b) => Number(a['uid']) - Number(b['uid']))) yield message;
  }
  async fetchOne(seq: string): Promise<Record<string, unknown> | false> {
    const message = this.messages.find((candidate) => String(candidate['uid']) === String(seq));
    return message ? { ...message, source: Buffer.from(RAW_MESSAGE) } : false;
  }
  async search(): Promise<number[]> {
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

    // One lookup per domain, however often the form asks.
    discover.mockClear();
    await expect(mail.detect({ address: 'nope' })).rejects.toThrow('Enter a valid email address.');
    expect((await mail.detect({ address: 'ada@mailcow.example' })).found).toBe(true);
    expect((await mail.detect({ address: 'other@mailcow.example' })).found).toBe(true);
    expect(discover).toHaveBeenCalledTimes(1);
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
  it('connects, assigns, lists, and deletes a mailbox through the Connections API', async () => {
    process.env['AGENT_GITU_SECRETS_KEY'] = serverKey();
    const { mail, imap, imapOptions, discover } = fixture();
    const server = new GituServer({
      cwd: process.env['AGENT_GITU_HOME']!,
      port: 0,
      passwordRequired: false,
      mailConnections: mail,
      llm: { name: 'fixture', async complete() { return 'Done.'; } },
      coworkCompletionProtocol: 'legacy',
    });
    const store = (server as unknown as { cowork(): CoworkStore }).cowork();
    const agent = store.saveAgent({ name: 'Assistant', tagline: 'Executive assistant', systemPrompt: 'Help.' });
    const base = 'http://127.0.0.1:' + await server.start();
    const post = (route: string, body: unknown) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const connections = () => fetch(base + '/api/connected-apps?agentId=' + agent.id).then((response) => response.json());
    try {
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
      expect(store.appAccountAssigned(agent.id, 'mail', first.id)).toBe(true);

      const listed = await connections();
      expect(listed.mail.accounts.map((account: { id: string }) => account.id)).toEqual([first.id]);
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

  it('routes non-mail services to the OAuth provider', async () => {
    const { mail } = fixture();
    const provider = composio();
    const hub = new ConnectionsHub(provider, mail);
    expect(await hub.execute('github', 'GITHUB_LIST', {}, 'own')).toEqual({ data: 'ok' });
    expect((await hub.catalog('')).services.map((service) => service.slug)).toContain('github');
    expect((await hub.accounts()).map((entry) => entry.toolkit)).toContain('github');
  });
});
