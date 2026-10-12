import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ executablePath: vi.fn(), launchPersistentContext: vi.fn() }));
vi.mock('playwright', () => ({ chromium: runtime }));
import { ServerBrowser, ServerBrowserUnavailableError } from '../src/browser/server-browser.js';

const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-server-browser-'));
let sequence = 0;
afterAll(() => rmSync(root, { recursive: true, force: true }));
beforeEach(() => { vi.clearAllMocks(); runtime.executablePath.mockReturnValue(process.execPath); });

describe('hosted browser availability and private profiles', () => {
  it('reports missing browser dependencies without launching or choosing a host browser', async () => {
    runtime.executablePath.mockReturnValue(path.join(root, 'missing-browser'));
    const browser = new ServerBrowser(path.join(root, String(++sequence)));
    expect(browser.available()).toBe(false);
    expect(browser.state().available).toBe(false);
    await expect(browser.navigate('https://example.com')).rejects.toThrow(ServerBrowserUnavailableError);
    expect(runtime.launchPersistentContext).not.toHaveBeenCalled();
  });
  it('reports dependency launch failure with setup guidance and keeps the profile', async () => {
    runtime.launchPersistentContext.mockRejectedValueOnce(new Error('missing system library'));
    const browser = new ServerBrowser(path.join(root, String(++sequence)));
    expect(browser.available()).toBe(true);
    await expect(browser.screenshot()).rejects.toThrow('playwright install --with-deps chromium');
    expect(browser.available()).toBe(false);
    expect(browser.state().available).toBe(false);
    await browser.close();
  });
  it('reuses its persistent context and respects authenticated human control', async () => {
    const page = { isClosed: () => false, goto: vi.fn(async () => undefined), url: () => 'https://example.com', title: async () => 'Fixture' };
    const context = { pages: () => [page], close: vi.fn(async () => undefined) };
    runtime.launchPersistentContext.mockResolvedValueOnce(context);
    const profile = path.join(root, String(++sequence)), browser = new ServerBrowser(profile);
    await browser.navigate('https://example.com');
    await browser.navigate('https://example.com/again');
    expect(runtime.launchPersistentContext).toHaveBeenCalledOnce();
    expect(runtime.launchPersistentContext).toHaveBeenCalledWith(profile, expect.objectContaining({ headless: true, acceptDownloads: false }));
    browser.setControl('user');
    await expect(browser.navigate('https://example.com/blocked')).rejects.toThrow('owner controls');
    expect(page.goto).toHaveBeenCalledTimes(2);
    browser.setControl('agent');
    await browser.navigate('https://example.com/returned');
    expect(page.goto).toHaveBeenCalledTimes(3);
    await browser.close();
    expect(context.close).toHaveBeenCalledOnce();
  });
});
