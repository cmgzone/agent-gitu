import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { CONNECTED_APPS_JS } from '../src/server/ui-connected-apps.js';
import { authPage } from '../src/server/ui-auth.js';
import { COWORK_JS } from '../src/server/ui-cowork.js';

function fixture() {
  const content = { innerHTML: '', querySelectorAll: () => [] };
  const elements = {
    cwChat: { innerHTML: '' },
    cwServicesContent: content,
    cwServicesBack: { onclick: undefined as undefined | (() => void) },
    cwServicesRefresh: { onclick: undefined as undefined | (() => void) },
    cwServicesSearch: { onsubmit: undefined },
  };
  const cw = { connectionsOpen: false, connectionRevision: 0, active: null };
  const api = vi.fn();
  const context = createContext({
    cwEnsure: () => cw,
    $: (id: keyof typeof elements) => elements[id],
    api,
    cwSaveDraft: vi.fn(),
    cwStopPoll: vi.fn(),
    cwClosePanels: vi.fn(),
    cwSyncPanels: vi.fn(),
    cwRenderChat: vi.fn(),
    cwStartStream: vi.fn(),
    cwPoll: vi.fn(),
    setInterval: vi.fn(),
    document: { title: '' },
    location: { replace: vi.fn() },
    toast: vi.fn(),
    esc: (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!),
  });
  new Script(CONNECTED_APPS_JS).runInContext(context);
  return { content, elements, cw, api, context };
}

describe('account and Connections UI', () => {
  it('renders registration before sign-in and supports existing password-only installations', () => {
    const registration = authPage(true, true);
    expect(registration).toContain('Create your account');
    expect(registration).toContain('name="name"');
    expect(registration).toContain('name="email"');
    expect(registration).toContain('id="confirm"');
    expect(registration).toContain("fetch('/api/auth/register'");
    expect(registration).toContain("location.replace('/auth')");
    expect(authPage(true, false)).not.toContain('<form');
    expect(authPage(false, true, true)).toContain('name="email"');
    expect(authPage(false, true, false)).not.toContain('name="email"');
    for (const page of [registration, authPage(false, true, true), authPage(false, true, false)]) {
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
      accounts: [{ id: 'own', toolkit: 'gmail', status: 'ACTIVE', disabled: false }],
    });
    f.context.cwOpenConnections();
    await f.context.cwLoadServices('', false);
    expect(f.elements.cwChat.innerHTML).toContain('Connections');
    expect(f.content.innerHTML).toContain('&lt;img');
    expect(f.content.innerHTML).not.toContain('<img');
    expect(f.content.innerHTML).toContain('Connected');
    expect(f.content.innerHTML).toContain('Reconnect needed');
    expect(f.content.innerHTML).toContain('data-cwdisconnect="own"');
    f.elements.cwServicesBack.onclick!();
    expect(f.cw.connectionsOpen).toBe(false);
    expect(f.context.cwRenderChat).toHaveBeenCalledOnce();
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
