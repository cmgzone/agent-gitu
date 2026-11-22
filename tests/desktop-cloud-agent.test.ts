import { createRequire } from 'node:module';
import { createContext, Script } from 'node:vm';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const {
  validateCloudAgentUrl,
  loadCloudAgentPrefs,
  saveCloudAgentPrefs,
  sanitizeInstance,
  createCloudAgentManager,
  registerCloudAgent,
} = createRequire(import.meta.url)('../desktop/cloud-agent.cjs');

describe('desktop cloud-agent manager', () => {
  it('validates HTTPS URLs and local dev origins while rejecting unsafe schemes', () => {
    expect(validateCloudAgentUrl('https://alex.gitu.app/path')).toEqual({
      href: 'https://alex.gitu.app/path',
      origin: 'https://alex.gitu.app',
    });
    expect(validateCloudAgentUrl('http://127.0.0.1:8321')).toEqual({
      href: 'http://127.0.0.1:8321/',
      origin: 'http://127.0.0.1:8321',
    });
    expect(validateCloudAgentUrl('http://alex.gitu.app')).toBeNull();
    expect(validateCloudAgentUrl('file:///C:/secret')).toBeNull();
    expect(validateCloudAgentUrl('https://user:pass@alex.gitu.app')).toBeNull();
  });

  it('persists and reloads desktop cloud agent preferences safely', () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'gitu-cloud-prefs-'));
    const prefsFile = path.join(tmpDir, 'desktop-cloud-agent.json');
    try {
      expect(loadCloudAgentPrefs(prefsFile)).toEqual({
        lastMode: 'local',
        activeCloudVpsId: null,
        autoConnectCloud: false,
      });
      saveCloudAgentPrefs(prefsFile, {
        lastMode: 'cloud',
        activeCloudVpsId: 'vps_123',
        autoConnectCloud: true,
      });
      expect(loadCloudAgentPrefs(prefsFile)).toEqual({
        lastMode: 'cloud',
        activeCloudVpsId: 'vps_123',
        autoConnectCloud: true,
      });
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('strips sensitive secrets when sanitizing cloud VPS instances', () => {
    const clean = sanitizeInstance({
      id: 'vps_1',
      name: 'Work Agent',
      plan: 'starter',
      status: 'ACTIVE',
      domain: 'work.gitu.app',
      agentUrl: 'https://work.gitu.app',
      agentApiKey: 'sk-live-vps_secret',
      agentAdminPassword: 'super-secret-password',
      invoices: [{ id: 'inv_1' }],
      provisioning: { state: 'READY', attentionReason: null, customerMessage: 'Your VPS is ready to use.' },
    });
    expect(clean).toEqual({
      id: 'vps_1',
      name: 'Work Agent',
      plan: 'starter',
      status: 'ACTIVE',
      ipAddress: null,
      domain: 'work.gitu.app',
      customDomain: null,
      agentUrl: 'https://work.gitu.app',
      expiresAt: null,
      provisioning: { state: 'READY', attentionReason: null, customerMessage: 'Your VPS is ready to use.' },
    });
    expect('agentApiKey' in clean).toBe(false);
    expect('agentAdminPassword' in clean).toBe(false);
  });

  it('refreshes instances, auto-signs in via Pikpam, switches between cloud and local, and buys with wallet', async () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'gitu-cloud-mgr-'));
    const prefsFile = path.join(tmpDir, 'prefs.json');
    const navigations: string[] = [];
    const externals: string[] = [];
    const sessionCalls: Array<{ url: string; body?: unknown }> = [];
    const apiCalls: Array<{ url: string; method: string; body?: unknown }> = [];

    const mockFetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const method = (init?.method || 'GET').toUpperCase();
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      apiCalls.push({ url, method, body });

      if (url.endsWith('/api/user/credits')) {
        return new Response(
          JSON.stringify({
            user: { id: 'usr_1', email: 'owner@pikpam.com', role: 'USER' },
            credits: { balance: 1500, paidAvailableUsd: 15, bonusBalance: 0 },
          }),
          { status: 200 },
        );
      }
      if (url.endsWith('/api/cloud/vps/my-instances')) {
        return new Response(
          JSON.stringify({
            instances: [
              {
                id: 'vps_active',
                name: 'Work Cloud',
                plan: 'starter',
                status: 'ACTIVE',
                agentUrl: 'https://work.gitu.app',
                agentApiKey: 'sk-live-vps_hidden',
                agentAdminPassword: 'hidden-password',
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.endsWith('/api/cloud/plans')) {
        return new Response(
          JSON.stringify({ plans: [{ id: 'starter', name: 'Starter', priceUsd: 12, vCpus: 4, ramGb: 6, storageGb: 100, storageType: 'NVMe', includedCredits: 500 }] }),
          { status: 200 },
        );
      }
      if (url.endsWith('/api/cloud/vps/free-claim')) {
        return new Response(JSON.stringify({ enabled: false, canClaim: false, plan: null }), { status: 200 });
      }
      if (url.endsWith('/api/cloud/vps/instances/vps_active/access')) {
        return new Response(
          JSON.stringify({
            ok: true,
            vpsId: 'vps_active',
            name: 'Work Cloud',
            status: 'ACTIVE',
            agentUrl: 'https://work.gitu.app',
            registrationToken: 'reg_token_at_least_32_characters_long_1234',
          }),
          { status: 200 },
        );
      }
      if (url.endsWith('/api/cloud/vps/order')) {
        if (body?.paymentMethod === 'WALLET') {
          return new Response(JSON.stringify({ ok: true, paymentMethod: 'WALLET' }), { status: 200 });
        }
        return new Response(
          JSON.stringify({ ok: true, reference: 'pstk_1', authorizationUrl: 'https://checkout.paystack.com/abc' }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: `Unexpected API call: ${url}` }), { status: 404 });
    });

    const mockSessionFetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      sessionCalls.push({ url, body });
      if (url === 'https://work.gitu.app/api/auth/status') {
        return new Response(JSON.stringify({ authenticated: false }), { status: 200 });
      }
      if (url === 'https://work.gitu.app/api/auth/pikrouter/start') {
        return new Response(JSON.stringify({ state: 'signed_state_123' }), { status: 200 });
      }
      if (url === 'https://work.gitu.app/api/auth/pikrouter') {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });

    try {
      const mgr = createCloudAgentManager({
        getLocalOrigin: () => 'http://127.0.0.1:8321',
        getPrefsPath: () => prefsFile,
        getPikpamToken: async () => 'jwt_pikpam_token',
        getSessionFetch: () => mockSessionFetch as unknown as typeof fetch,
        navigateToUrl: async (url: string) => { navigations.push(url); },
        openExternal: async (url: string) => { externals.push(url); },
        fetchImpl: mockFetch as unknown as typeof fetch,
        apiBaseUrl: 'https://pikpam.com',
      });

      const refreshed = await mgr.refresh();
      expect(refreshed.signedIn).toBe(true);
      expect(refreshed.wallet?.paidAvailableUsd).toBe(15);
      expect(refreshed.instances).toHaveLength(1);
      expect('agentApiKey' in refreshed.instances[0]!).toBe(false);

      const connected = await mgr.connectCloud('vps_active');
      expect(connected.ok).toBe(true);
      expect(mgr.isTrustedOrigin('https://work.gitu.app')).toBe(true);
      expect(mgr.isTrustedOrigin('http://127.0.0.1:8321')).toBe(true);
      expect(navigations).toEqual(['https://work.gitu.app/']);
      expect(sessionCalls).toEqual([
        { url: 'https://work.gitu.app/api/auth/status', body: undefined },
        { url: 'https://work.gitu.app/api/auth/pikrouter/start', body: { redirectPath: '/callback' } },
        {
          url: 'https://work.gitu.app/api/auth/pikrouter',
          body: {
            token: 'jwt_pikpam_token',
            state: 'signed_state_123',
            registrationToken: 'reg_token_at_least_32_characters_long_1234',
          },
        },
      ]);

      const back = await mgr.switchToLocal();
      expect(back).toEqual({ ok: true, mode: 'local' });
      expect(navigations).toEqual(['https://work.gitu.app/', 'http://127.0.0.1:8321/']);
      expect(mgr.isTrustedOrigin('https://work.gitu.app')).toBe(false);

      const walletBuy = await mgr.buyCloud({ planId: 'starter', instanceName: 'ops', paymentMethod: 'WALLET' });
      expect(walletBuy.ok).toBe(true);
      expect(walletBuy.paymentMethod).toBe('WALLET');

      const paystackBuy = await mgr.buyCloud({ planId: 'starter', instanceName: 'ops2', paymentMethod: 'PAYSTACK', countryCode: 'KE' });
      expect(paystackBuy.ok).toBe(true);
      expect(paystackBuy.pendingPayment).toBe(true);
      expect(externals).toEqual(['https://checkout.paystack.com/abc']);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('restricts registerCloudAgent IPC handlers strictly to the trusted main frame', async () => {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => Promise<unknown>>();
    const mainFrame = { url: 'http://127.0.0.1:8321/' };
    const contents = {
      isDestroyed: () => false,
      mainFrame,
      ipc: {
        handle: (channel: string, cb: (event: unknown, ...args: unknown[]) => Promise<unknown>) => {
          handlers.set(channel, cb);
        },
      },
    };
    const mgr = createCloudAgentManager({
      getLocalOrigin: () => 'http://127.0.0.1:8321',
      getPikpamToken: async () => '',
    });
    registerCloudAgent(contents, mgr);

    const statusHandler = handlers.get('gitu:cloud-agent:status')!;
    expect(statusHandler).toBeTypeOf('function');
    expect(await statusHandler({ senderFrame: mainFrame })).toMatchObject({ mode: 'local' });
    expect(await statusHandler({ senderFrame: { url: 'http://127.0.0.1:8321/' } })).toEqual({
      ok: false,
      error: 'Blocked untrusted frame.',
    });
    mainFrame.url = 'https://evil.example/';
    expect(await statusHandler({ senderFrame: mainFrame })).toEqual({
      ok: false,
      error: 'Blocked untrusted frame.',
    });
  });

  it('desktop cloud switcher UI renders only when getDesktopCloudBridge() is present', () => {
    const barSrc = readFileSync(new URL('../src/client-astryx/views/DesktopAgentBar.tsx', import.meta.url), 'utf8');
    const dialogSrc = readFileSync(new URL('../src/client-astryx/views/CloudAgentDialog.tsx', import.meta.url), 'utf8');
    const mainSrc = readFileSync(new URL('../src/client-astryx/main.tsx', import.meta.url), 'utf8');
    const settingsSrc = readFileSync(new URL('../src/client-astryx/views/SettingsConsoleView.tsx', import.meta.url), 'utf8');

    expect(barSrc).toContain('if (!cloudBridge) return null;');
    expect(dialogSrc).toContain('if (!cloudBridge) return null;');
    expect(mainSrc).toContain('const desktopCloudBridge = getDesktopCloudBridge();');
    expect(settingsSrc).toContain('{getDesktopCloudBridge() ? (');
    expect(new Script('1 + 1').runInContext(createContext({}))).toBe(2);
  });
});
