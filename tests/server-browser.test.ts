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
beforeEach(() => {
  vi.clearAllMocks();
  runtime.executablePath.mockReturnValue(process.execPath);
});

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
    const context = { pages: () => [page], on: vi.fn(), close: vi.fn(async () => undefined) };
    runtime.launchPersistentContext.mockResolvedValueOnce(context);
    const profile = path.join(root, String(++sequence)),
      browser = new ServerBrowser(profile);
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
  it('blocks agent observations during private control, including observations already in flight', async () => {
    let finish: (value: unknown) => void = () => {};
    const page = {
      isClosed: () => false,
      url: () => 'https://example.com/private?token=secret',
      title: async () => 'Private',
      evaluate: vi.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      ),
      screenshot: vi.fn(async () => Buffer.from('owner image')),
      locator: vi.fn(() => ({ innerText: vi.fn(async () => 'Private page text') })),
      keyboard: { insertText: vi.fn(async () => {}) },
    };
    runtime.launchPersistentContext.mockResolvedValueOnce({ pages: () => [page], on: vi.fn(), close: vi.fn() });
    const browser = new ServerBrowser(path.join(root, String(++sequence)));
    const observation = browser.evaluate('document.body.innerText');
    await vi.waitFor(() => expect(page.evaluate).toHaveBeenCalledOnce());
    browser.setControl('user');
    browser.setControl('agent');
    finish('private result');
    await expect(observation).rejects.toThrow('control changed');
    browser.setControl('user');
    await expect(browser.screenshot()).rejects.toThrow('owner controls');
    await expect(browser.evaluate('anything')).rejects.toThrow('owner controls');
    await expect(browser.type('agent input')).rejects.toThrow('owner controls');
    const owner = await browser.ownerScreenshot();
    expect(owner).toMatchObject({ mime: 'image/jpeg', state: { control: 'user', url: 'https://example.com/private?token=secret' } });
    expect(owner).not.toHaveProperty('textDigest');
    expect(page.locator).not.toHaveBeenCalled();
    expect(browser.state()).toMatchObject({ url: '', title: 'Owner private session' });
    await browser.human('type', { text: 'owner input' });
    expect(page.keyboard.insertText).toHaveBeenCalledWith('owner input');
    await expect(browser.human('click', { x: NaN, y: 2 })).rejects.toThrow('coordinates');
    const reopened = new ServerBrowser(path.join(root, String(sequence)));
    await expect(reopened.screenshot()).rejects.toThrow('owner controls');
    await browser.close();
  });
});
