import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { CONNECTED_APPS_JS } from '../src/server/ui-connected-apps.js';
import { authPage } from '../src/server/ui-auth.js';
import { COWORK_JS } from '../src/server/ui-cowork.js';

function fixture() {
  const control = () => ({ onclick: undefined as undefined | (() => void), onkeydown: undefined as undefined | ((event: { key: string; preventDefault: () => void }) => void), attributes: {} as Record<string, string>, tabIndex: 0, focus: vi.fn(), setAttribute(name: string, value: string) { this.attributes[name] = value; } });
  const content = { innerHTML: '', attributes: {} as Record<string, string>, setAttribute(name: string, value: string) { this.attributes[name] = value; }, querySelectorAll: () => [], insertAdjacentHTML(_position: string, html: string) { this.innerHTML += html; } };
  const providerButton = { disabled: false };
  const elements = {
    cwChat: { innerHTML: '' },
    cwInfoBtn: control(),
    cwServicesContent: content,
    cwServicesBack: { onclick: undefined as undefined | (() => void) },
    cwServicesRefresh: { onclick: undefined as undefined | (() => void) },
    cwServicesSearch: { onsubmit: undefined },
    cwServicesQuery: { value: '', oninput: undefined as undefined | (() => void) },
    cwServicesAvailable: control(),
    cwServicesConnected: control(),
    cwServicesCount: { textContent: '' },
    cwServicesAgent: { innerHTML: '', value: 'writer', onchange: undefined as undefined | (() => void) },
    cwProviderForm: { onsubmit: undefined as undefined | ((event: { preventDefault: () => void }) => Promise<void>), querySelector: () => providerButton },
    cwProviderKey: { value: 'fixture-provider-key' },
    cwProviderError: { hidden: true, textContent: '' },
  };
  const cw = {
    connectionsOpen: false, connectionRevision: 0, active: null, selectedAgentId: 'writer', connectionsAgentId: 'writer', servicesTab: 'available', servicesSearch: '', services: [] as { slug: string; name: string }[],
    requests: [] as { id: string; agentId: string; appConnection?: { service: string; name: string; reason?: string } }[],
    mail: undefined as { accounts: { id: string; label: string; address: string }[]; available: { id: string; label: string; address: string }[]; providers: { id: string; name: string; imap: { host: string; port: number; secure: boolean }; smtp: { host: string; port: number; secure: boolean }; note: string }[] } | undefined,
    mailFormOpen: false,
  };
  const api = vi.fn();
  const context = createContext({
    cwEnsure: () => cw,
    $: (id: keyof typeof elements) => elements[id],
    api,
    cwSaveDraft: vi.fn(),
    cwStopPoll: vi.fn(),
    cwClosePanels: vi.fn(),
    cwSyncPanels: vi.fn(),
    cwPageNavHtml: () => '<nav aria-label="Agent navigation">Home | Chat | Profile</nav>',
    cwBindTopNav: vi.fn(),
    cwAgentById: vi.fn(),
    cwOpenProfile: vi.fn(),
    cwRenderChat: vi.fn(),
    cwStartStream: vi.fn(),
    cwPoll: vi.fn(),
    setInterval: vi.fn(),
    setTimeout: vi.fn(),
    clearTimeout: vi.fn(),
    URL,
    cwIcon: () => '<svg aria-hidden="true"></svg>',
    cwActionWords: (value: string) => value,
    document: { title: '' },
    location: { replace: vi.fn() },
    toast: vi.fn(),
    esc: (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!),
  });
  new Script(CONNECTED_APPS_JS).runInContext(context);
  return { content, elements, cw, api, context };
}

describe('account and Connections UI', () => {
  it('supports encrypted key setup on a hosted server without Windows instructions', async () => {
    const f = fixture();
    f.cw.connectionsOpen = true;
    f.api.mockResolvedValueOnce({ configured: false, canConfigure: true, keyStorage: 'server-encrypted' });
    await f.context.cwLoadServices('', false);
    expect(f.content.innerHTML).toContain('encrypted on your Gitu server');
    expect(f.content.innerHTML).not.toContain('Windows account');
    f.api.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ configured: true, services: [], accounts: [] });
    await f.elements.cwProviderForm.onsubmit!.call(f.elements.cwProviderForm, { preventDefault: vi.fn() });
    expect(f.api).toHaveBeenCalledWith('/api/connected-apps/configure', expect.objectContaining({ body: JSON.stringify({ apiKey: 'fixture-provider-key' }) }));
    expect(f.elements.cwProviderKey.value).toBe('');
    await vi.waitFor(() => expect(f.content.innerHTML).toContain('Browse apps'));
  });
  it('renders registration before sign-in and supports existing password-only installations', () => {
    const registration = authPage(true, true);
    expect(registration).toContain('Create your account');
    expect(registration).toContain('name="name"');
    expect(registration).toContain('name="email"');
    expect(registration).toContain('id="confirm"');
    expect(registration).toContain("fetch('/api/auth/register'");
    expect(registration).toContain("location.replace('/auth')");
    expect(authPage(true, false)).not.toContain('<form');
    const remoteRegistration = authPage(true, false, true, true);
    expect(remoteRegistration).toContain('name="registrationToken"');
    expect(remoteRegistration).toContain('registrationToken:document.getElementById("registrationToken").value');
    expect(authPage(false, true, true)).toContain('name="email"');
    expect(authPage(false, true, false)).not.toContain('name="email"');
    for (const page of [registration, remoteRegistration, authPage(false, true, true), authPage(false, true, false)]) {
      expect(() => new Script(page.split('<script>')[1]!.split('</script>')[0]!)).not.toThrow();
    }
  });
  it('renders services and account status safely and returns to chat', async () => {
    const f = fixture();
    f.api.mockResolvedValue({
      configured: true,
      services: [
        { name: '<img onerror=alert(1)>', slug: 'gmail', status: 'ACTIVE' },
        { name: 'Slack', slug: 'slack', status: 'EXPIRED' },
      ],
      accounts: [{ id: 'own', toolkit: 'gmail', status: 'ACTIVE', disabled: false }, { id: 'expired', toolkit: 'slack', status: 'EXPIRED', disabled: false }],
    });
    f.context.cwOpenConnections();
    await f.context.cwLoadServices('', false);
    expect(f.elements.cwChat.innerHTML).toContain('Connections');
    expect(f.content.innerHTML).toContain('&lt;img');
    expect(f.content.innerHTML).not.toContain('<img');
    expect(f.content.innerHTML).toContain('Connected');
    expect(f.content.innerHTML).toContain('Reconnect needed');
    expect(f.content.innerHTML).not.toContain('data-cwdisconnect');
    f.elements.cwServicesConnected.onclick!();
    expect(f.content.innerHTML).toContain('data-cwdisconnect="own"');
    f.elements.cwServicesBack.onclick!();
    expect(f.cw.connectionsOpen).toBe(false);
    expect(f.context.cwRenderChat).toHaveBeenCalledOnce();
  });
  it('offers an Email section that connects any mailbox and opens it from a mail suggestion', async () => {
    const f = fixture();
    const mailPayload = {
      accounts: [{ id: 'mail-1', label: 'Support', address: 'help@example.com' }],
      available: [{ id: 'mail-2', label: 'Sales', address: 'sales@example.com' }],
      providers: [{ id: 'gmail', name: 'Gmail', imap: { host: 'imap.gmail.com', port: 993, secure: true }, smtp: { host: 'smtp.gmail.com', port: 465, secure: true }, note: 'App password required.' }],
    };
    f.cw.mail = mailPayload;
    const html = f.context.cwMailSectionHtml('writer');
    expect(html).toContain('>Email<');
    expect(html).toContain('help@example.com');
    expect(html).toContain('data-cwmaildisconnect="mail-1"');
    expect(html).toContain('data-cwmailassign="mail-2"');
    expect(html).toContain('id="cwMailAddress"');
    expect(html).toContain('<option value="gmail">Gmail</option>');
    expect(f.context.cwMailSectionHtml('')).toBe('');
    // Picking a provider fills the documented servers, and submit posts them for this teammate.
    const elements: Record<string, Record<string, unknown>> = {};
    const field = (id: string) => (elements[id] = { id, value: '', checked: false, hidden: false, textContent: '', focus: vi.fn() });
    ['cwMailForm', 'cwMailAdd', 'cwMailError', 'cwMailNote', 'cwMailProvider', 'cwMailAddress', 'cwMailPassword', 'cwMailLabel', 'cwMailUsername', 'cwMailImapHost', 'cwMailImapPort', 'cwMailImapSecure', 'cwMailSmtpHost', 'cwMailSmtpPort', 'cwMailSmtpSecure', 'cwMailSelfSigned'].forEach(field);
    elements['cwMailForm']!.querySelector = () => ({ disabled: false });
    mailPayload.providers[0]!.note = 'App password required.';
    elements['cwMailProvider']!.value = 'gmail';
    const root = { querySelector: (selector: string) => elements[selector.slice(1)] ?? null, querySelectorAll: () => [] };
    f.context.cwBindMail(root, 'writer');
    expect(elements['cwMailImapHost']!.value).toBe('imap.gmail.com');
    expect(elements['cwMailImapPort']!.value).toBe(993);
    expect(elements['cwMailImapSecure']!.checked).toBe(true);
    expect(elements['cwMailSmtpHost']!.value).toBe('smtp.gmail.com');
    expect(elements['cwMailNote']!.textContent).toBe('App password required.');
    elements['cwMailAddress']!.value = 'help@example.com';
    elements['cwMailPassword']!.value = 'app-password';
    f.api.mockResolvedValueOnce({ account: { id: 'mail-3' } });
    await (elements['cwMailForm']!.onsubmit as (event: { preventDefault: () => void }) => Promise<void>)({ preventDefault: vi.fn() });
    const mailCall = f.api.mock.calls.find((call) => String(call[0]) === '/api/connected-apps/mail');
    expect(mailCall).toBeDefined();
    expect(JSON.parse(String((mailCall![1] as { body: string }).body))).toMatchObject({ agentId: 'writer', provider: 'gmail', address: 'help@example.com', imapHost: 'imap.gmail.com', imapPort: 993, imapSecure: true, smtpHost: 'smtp.gmail.com', smtpPort: 465, smtpSecure: true });
    expect(elements['cwMailPassword']!.value).toBe('');
    // Typing an address from a known provider selects it and fills both servers.
    f.cw.mail = mailPayload; // a refresh clears it, exactly like the live page
    f.cw.mail.providers.push({ id: 'fastmail', name: 'Fastmail', domains: ['fastmail.com'], imap: { host: 'imap.fastmail.com', port: 993, secure: true }, smtp: { host: 'smtp.fastmail.com', port: 465, secure: true }, note: 'App password.' });
    elements['cwMailProvider']!.value = 'custom';
    elements['cwMailImapHost']!.value = '';
    elements['cwMailSmtpHost']!.value = '';
    elements['cwMailAddress']!.value = 'person@fastmail.com';
    (elements['cwMailAddress']!.oninput as () => void)();
    expect(elements['cwMailProvider']!.value).toBe('fastmail');
    expect(elements['cwMailImapHost']!.value).toBe('imap.fastmail.com');
    expect(elements['cwMailSmtpHost']!.value).toBe('smtp.fastmail.com');
    expect(elements['cwMailNote']!.textContent).toBe('App password.');
    // An unknown domain leaves the manual path exactly as the user set it.
    elements['cwMailAddress']!.value = 'person@unknown.example';
    (elements['cwMailAddress']!.oninput as () => void)();
    expect(elements['cwMailProvider']!.value).toBe('fastmail');
    // A mailbox has no sign-in page, so its card opens the mailbox form instead of Composio.
    f.api.mockClear();
    f.cw.requests = [{ id: 'req-mail', agentId: 'writer', appConnection: { service: 'mail', name: 'Mailbox', reason: 'Handle the inbox.' } }];
    const button = { disabled: false, getAttribute: () => 'req-mail', onclick: undefined as undefined | (() => Promise<void>) };
    f.context.cwBindAppConnections({ querySelectorAll: (selector: string) => (selector === '[data-cwconnectrequest]' ? [button] : []) });
    await button.onclick!();
    expect(f.cw.connectionsOpen).toBe(true);
    expect(f.cw.mailFormOpen).toBe(true);
    expect(f.api.mock.calls.some((call) => String(call[0]).includes('/api/connected-apps/connect'))).toBe(false);
  });
  it('shows real role suggestions once, filters the catalog, and switches views without a network call', async () => {
    const f = fixture();
    f.api.mockResolvedValue({ configured: true, agents: [{ id: 'writer', name: 'Atlas' }],
      services: [{ slug: 'github', name: 'GitHub' }, { slug: 'future-tool', name: 'Future tool', description: 'Team diagrams' }],
      accounts: [{ id: 'private-id-1234', toolkit: 'github', status: 'ACTIVE', disabled: false }],
      availableAccounts: [{ id: 'unassigned', toolkit: 'gmail', status: 'ACTIVE', disabled: false }],
      requests: [{ agentId: 'writer', status: 'accepted', appConnection: { service: 'github', name: 'GitHub', reason: 'Review repository code.' } },
        { agentId: 'someone-else', status: 'open', appConnection: { service: 'slack', name: 'Slack' } },
        { agentId: 'writer', status: 'dismissed', appConnection: { service: 'facebook', name: 'Facebook' } }] });
    f.context.cwOpenConnections();
    await f.context.cwLoadServices('', false);
    expect(f.content.innerHTML).toContain('Suggested for Atlas');
    expect(f.content.innerHTML.match(/data-service="github"/g)).toHaveLength(1);
    expect(f.content.innerHTML).toContain('data-service="future-tool"');
    expect(f.content.innerHTML).not.toContain('data-service="slack"');
    expect(f.content.innerHTML).not.toContain('data-service="facebook"');
    expect(f.content.innerHTML).not.toContain('private-id-1234');
    const calls = f.api.mock.calls.length;
    f.elements.cwServicesConnected.onclick!();
    expect(f.api).toHaveBeenCalledTimes(calls);
    expect(f.content.innerHTML).toContain('data-cwassignapp="unassigned"');
    expect(f.content.innerHTML).not.toContain('data-service="future-tool"');
    expect(f.elements.cwServicesConnected.attributes['aria-selected']).toBe('true');
    expect(f.elements.cwServicesAvailable.tabIndex).toBe(-1);
    f.elements.cwServicesConnected.onkeydown!({ key: 'ArrowLeft', preventDefault: vi.fn() });
    expect(f.elements.cwServicesAvailable.focus).toHaveBeenCalledOnce();
    expect(f.elements.cwServicesAvailable.attributes['aria-selected']).toBe('true');
    f.cw.servicesSearch = 'diagrams';
    f.context.cwRenderServices();
    expect(f.content.innerHTML).toContain('Future tool');
    expect(f.content.innerHTML).not.toContain('data-service="github"');
  });
  it('deduplicates paged apps and keeps the current search when refreshing', async () => {
    const f = fixture();
    f.api.mockResolvedValueOnce({ configured: true, services: [{ slug: 'first', name: 'App one' }], cursor: 'next-page' });
    f.context.cwOpenConnections();
    await vi.waitFor(() => expect(f.content.innerHTML).toContain('App one'));
    f.api.mockResolvedValueOnce({ configured: true, services: [{ slug: 'first', name: 'App one' }, { slug: 'second', name: 'App two' }] });
    await f.context.cwLoadServices('App', true);
    expect(f.api.mock.calls[1]![0]).toContain('search=App&cursor=next-page');
    expect(f.content.innerHTML.match(/data-service="first"/g)).toHaveLength(1);
    expect(f.content.innerHTML).toContain('App two');
    f.api.mockResolvedValue({ configured: true, services: [] });
    f.elements.cwServicesRefresh.onclick!();
    expect(f.api.mock.calls.at(-1)![0]).toContain('search=App');
  });
  it('passes the selected teammate to assign and remove actions, and blocks duplicate clicks', async () => {
    const f = fixture();
    const assign = { disabled: false, onclick: undefined as undefined | (() => Promise<void>), getAttribute: () => 'existing-account' };
    const remove = { disabled: false, onclick: undefined as undefined | (() => Promise<void>), getAttribute: () => 'own-account' };
    const root = { querySelectorAll: (selector: string) => selector === '[data-cwassignapp]' ? [assign] : selector === '[data-cwdisconnect]' ? [remove] : [] };
    let resolve!: () => void;
    f.api.mockReturnValueOnce(new Promise<void>((r) => { resolve = r; }));
    f.context.cwBindServiceActions(root, 'atlas');
    const pending = assign.onclick!();
    await assign.onclick!();
    expect(f.api).toHaveBeenCalledOnce();
    expect(f.api.mock.calls[0]![1].body).toBe(JSON.stringify({ agentId: 'atlas', accountId: 'existing-account' }));
    resolve();
    await pending;
    f.api.mockResolvedValue({});
    await remove.onclick!();
    expect(f.api).toHaveBeenCalledWith('/api/connected-apps/disconnect', expect.objectContaining({ body: JSON.stringify({ agentId: 'atlas', accountId: 'own-account' }) }));
  });
  it('clears old teammate content immediately and ignores a late response for that teammate', async () => {
    const f = fixture();
    f.api.mockResolvedValueOnce({ configured: true, services: [{ slug: 'github', name: 'GitHub' }] });
    f.context.cwOpenConnections();
    await vi.waitFor(() => expect(f.content.innerHTML).toContain('GitHub'));
    let resolve!: (data: unknown) => void;
    f.api.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const oldSearch = f.context.cwLoadServices('', false);
    f.api.mockResolvedValueOnce({ configured: true, services: [{ slug: 'instagram', name: 'Instagram' }] });
    f.elements.cwServicesAgent.value = 'nova';
    f.elements.cwServicesAgent.onchange!();
    expect(f.content.innerHTML).not.toContain('GitHub');
    await vi.waitFor(() => expect(f.content.innerHTML).toContain('Instagram'));
    resolve({ configured: true, services: [{ slug: 'github', name: 'GitHub' }] });
    await oldSearch;
    expect(f.content.innerHTML).not.toContain('GitHub');
    expect(f.api.mock.calls.at(-1)![0]).toContain('agentId=nova');
  });
  it('ignores a stale provider response after leaving Connections and shows recoverable errors', async () => {
    const f = fixture();
    f.cw.connectionsOpen = true;
    let resolve!: (data: unknown) => void;
    f.api.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const loading = f.context.cwLoadServices('', false);
    f.cw.connectionsOpen = false;
    resolve({ configured: true, services: [{ name: 'Gmail', slug: 'gmail' }], accounts: [] });
    await loading;
    expect(f.content.innerHTML).toBe('');
    f.cw.connectionsOpen = true;
    f.api.mockRejectedValueOnce(new Error('Secret provider error'));
    await f.context.cwLoadServices('', false);
    expect(f.content.innerHTML).toContain('refresh');
    expect(f.content.innerHTML).not.toContain('Secret');
  });
  it('prevents asynchronous chat renders from replacing Connections', () => {
    const cw = { connectionsOpen: true };
    const chat = { innerHTML: 'Connections' };
    const context = createContext({ window: { addEventListener: vi.fn() }, S: { cw }, document: {}, $: () => chat });
    new Script(COWORK_JS).runInContext(context);
    context.cwRenderChat();
    expect(chat.innerHTML).toBe('Connections');
  });
});
