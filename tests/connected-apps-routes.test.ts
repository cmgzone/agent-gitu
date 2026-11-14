import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import { CoworkStore } from '../src/cowork/store.js';
import { connectedAppsRoutes, type ConnectedAppsRouteDeps } from '../src/server/routes/connected-apps.js';

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-app-routes-'));
  const store = new CoworkStore(path.join(root, 'cowork.json'));
  const response = { setHeader: vi.fn() } as unknown as ServerResponse;
  const send = vi.fn(),
    detect = vi.fn(),
    configure = vi.fn();
  const deps = {
    isSameOrigin: vi.fn(() => true),
    appAuth: { secure: () => false, authenticated: () => false },
    cowork: () => store,
    connectedApps: { configured: false, setup: { canConfigure: true, keyStorage: 'fixture' }, configure },
    appHub: { accounts: vi.fn(async () => []), accountStatusIncomplete: false },
    mailConnections: { accounts: vi.fn(async () => []), setup: { keyStorage: 'fixture' }, detect },
    readBody: vi.fn(async () => ({ apiKey: 'do-not-forward' })),
    sendJson: send,
    publishCowork: vi.fn(),
    dispatchAgentWake: vi.fn(() => true),
  } as unknown as ConnectedAppsRouteDeps;
  return { deps, send, detect, configure, response, close: () => rmSync(root, { recursive: true, force: true }) };
}

describe('connected-app route boundary', () => {
  it('rejects cross-origin discovery before consulting DNS or mailbox credentials', async () => {
    const f = fixture();
    try {
      vi.mocked(f.deps.isSameOrigin).mockReturnValue(false);
      await connectedAppsRoutes({} as IncomingMessage, f.response, new URL('http://localhost/api/connected-apps/mail/detect?address=user@example.test'), 'GET', f.deps);
      expect(f.send).toHaveBeenCalledWith(f.response, 403, { error: 'cross-origin request rejected' });
      expect(f.detect).not.toHaveBeenCalled();
      expect(f.deps.readBody).not.toHaveBeenCalled();
    } finally {
      f.close();
    }
  });

  it('keeps the mailbox manager usable without an OAuth provider or teammate', async () => {
    const f = fixture();
    try {
      await connectedAppsRoutes({} as IncomingMessage, f.response, new URL('http://localhost/api/connected-apps'), 'GET', f.deps);
      expect(f.send).toHaveBeenCalledWith(
        f.response,
        200,
        expect.objectContaining({ configured: false, accounts: [], services: [], mail: expect.objectContaining({ accounts: [], available: [] }) }),
      );
      expect(f.deps.appHub.accounts).not.toHaveBeenCalled();
    } finally {
      f.close();
    }
  });

  it('keeps remote integration setup behind the existing HTTPS/session guard', async () => {
    const f = fixture();
    try {
      const request = { headers: { host: 'example.test' }, socket: { remoteAddress: '192.0.2.1' } } as IncomingMessage;
      await connectedAppsRoutes(request, f.response, new URL('http://example.test/api/connected-apps/configure'), 'POST', f.deps);
      expect(f.send).toHaveBeenCalledWith(f.response, 403, expect.objectContaining({ error: expect.stringContaining('HTTPS') }));
      expect(f.deps.readBody).not.toHaveBeenCalled();
      expect(f.configure).not.toHaveBeenCalled();
    } finally {
      f.close();
    }
  });

  it('loads Pikpam catalog and available accounts even when no teammate is selected', async () => {
    const f = fixture();
    try {
      const catalog = vi.fn(async () => ({ services: [{ slug: 'gmail', name: 'Gmail' }] }));
      Object.assign(f.deps.connectedApps, { configured: true, setup: { canConfigure: false, keyStorage: 'Pikpam account' }, catalog });
      vi.mocked(f.deps.appHub.accounts).mockResolvedValue([
        { id: 'acc-1', toolkit: 'gmail', status: 'ACTIVE', disabled: false, label: 'Work' },
      ]);
      await connectedAppsRoutes({} as IncomingMessage, f.response, new URL('http://localhost/api/connected-apps?agentId='), 'GET', f.deps);
      expect(catalog).toHaveBeenCalledWith('', undefined);
      expect(f.send).toHaveBeenCalledWith(f.response, 200, expect.objectContaining({
        configured: true,
        keyStorage: 'Pikpam account',
        agentId: '',
        accounts: [],
        availableAccounts: [{ id: 'acc-1', toolkit: 'gmail', status: 'ACTIVE', disabled: false, label: 'Work' }],
        services: [{ slug: 'gmail', name: 'Gmail', status: 'ACTIVE', accountId: 'acc-1' }],
      }));
    } finally {
      f.close();
    }
  });

  it('connects without storing a blank accountId when Pikpam returns only an auth URL', async () => {
    const f = fixture();
    try {
      const store = f.deps.cowork();
      const agent = store.saveAgent({ name: 'P.A', systemPrompt: 'Help.', allowWrites: true, allowConfig: true });
      const connect = vi.fn(async () => ({ url: 'https://pikpam.com/integrations/connect/gmail', accountId: '', status: 'INITIALIZING' }));
      Object.assign(f.deps.connectedApps, { configured: true, setup: { canConfigure: false, keyStorage: 'Pikpam account' }, connect });
      vi.mocked(f.deps.readBody).mockResolvedValue({ agentId: agent.id, service: 'gmail' });
      await connectedAppsRoutes({} as IncomingMessage, f.response, new URL('http://localhost/api/connected-apps/connect'), 'POST', f.deps);
      expect(f.send).toHaveBeenCalledWith(f.response, 200, { url: 'https://pikpam.com/integrations/connect/gmail', accountId: '', status: 'INITIALIZING' });
      expect(store.appConnections(agent.id)).toEqual([]);
    } finally {
      f.close();
    }
  });
});
