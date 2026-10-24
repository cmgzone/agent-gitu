import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { preparePhoneAccess, phoneAddresses, registerPhoneAccess } = createRequire(import.meta.url)('../desktop/phone-access.cjs');
const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe('automatic desktop phone access', () => {
  it('creates one private access key, reuses it on subsequent launches, and enables LAN password login', () => {
    const settings = mkdtempSync(path.join(tmpdir(), 'gitu-phone-'));
    directories.push(settings);
    const env: Record<string, string> = {};
    const first = preparePhoneAccess(settings, env);
    expect(first.host).toBe('0.0.0.0');
    expect(first.accessKey).toMatch(/^[a-f0-9]{64}$/);
    expect(env.AGENT_GITU_ALLOW_LAN_LOGIN).toBe('1');
    expect(readFileSync(path.join(settings, 'mobile-access.key'), 'utf8')).toBe(first.accessKey);
    expect(preparePhoneAccess(settings, {}).accessKey).toBe(first.accessKey);
    const supplied = 'externally-provided-desktop-access-key';
    expect(preparePhoneAccess(settings, { AGENT_GITU_ACCESS_KEY: supplied }).accessKey).toBe(supplied);
  });

  it('keeps the engine loopback-only when phone access is disabled and refuses damaged keys', () => {
    const settings = mkdtempSync(path.join(tmpdir(), 'gitu-phone-disabled-'));
    directories.push(settings);
    const env = { AGENT_GITU_DESKTOP_PHONE_ACCESS: '0' };
    expect(preparePhoneAccess(settings, env)).toEqual({ host: '127.0.0.1' });
    expect(Object.keys(env)).toEqual(['AGENT_GITU_DESKTOP_PHONE_ACCESS']);
    writeFileSync(path.join(settings, 'mobile-access.key'), 'damaged');
    expect(() => preparePhoneAccess(settings, {})).toThrow('saved phone access key is invalid');
  });

  it('shows current private Wi-Fi addresses with the actual bound port, without access keys', () => {
    const addresses = phoneAddresses(8427, {
      wifi: [{ address: '192.168.88.107', family: 'IPv4', internal: false }],
      private: [{ address: '10.1.1.2', family: 'IPv4', internal: false }],
      duplicates: [{ address: '192.168.88.107', family: 'IPv4', internal: false }],
      rejected: [
        { address: '127.0.0.1', family: 'IPv4', internal: true },
        { address: '203.0.113.2', family: 'IPv4', internal: false },
        { address: '169.254.2.3', family: 'IPv4', internal: false },
        { address: '172.32.1.2', family: 'IPv4', internal: false },
        { address: '::1', family: 'IPv6', internal: true },
      ],
    });
    expect(addresses).toEqual(['http://192.168.88.107:8427', 'http://10.1.1.2:8427']);
    expect(phoneAddresses(0)).toEqual([]);
  });

  it('allows address lookup and Windows setup only from the trusted desktop frame', async () => {
    const handlers: Record<string, (event: unknown) => unknown> = {};
    const mainFrame = { url: 'http://127.0.0.1:8321/' };
    const contents = { isDestroyed: () => false, mainFrame, ipc: { handle: (name: string, handler: (event: unknown) => unknown) => { handlers[name] = handler; } } };
    const status = vi.fn(() => ({ addresses: ['http://192.168.1.2:8321'] }));
    const allow = vi.fn(async () => ({ allowed: true }));
    registerPhoneAccess(contents, 'http://127.0.0.1:8321', status, allow);
    expect(handlers['gitu:phone-access']!({ senderFrame: mainFrame })).toEqual({ addresses: ['http://192.168.1.2:8321'] });
    await expect(handlers['gitu:allow-phone-access']!({ senderFrame: mainFrame })).resolves.toEqual({ allowed: true });
    for (const name of Object.keys(handlers)) expect(handlers[name]!({ senderFrame: { url: mainFrame.url } })).toBeUndefined();
    mainFrame.url = 'https://evil.example';
    for (const name of Object.keys(handlers)) expect(handlers[name]!({ senderFrame: mainFrame })).toBeUndefined();
    expect(allow).toHaveBeenCalledOnce();
    expect(status).toHaveBeenCalledOnce();
  });
});
