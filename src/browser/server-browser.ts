import { chromium, type BrowserContext, type CDPSession, type Page } from 'playwright';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { BrowserBridge, BrowserState, BrowserScreenshot } from './browser.js';
import { normalizeUrl } from './browser.js';

export const SERVER_BROWSER_SETUP =
  'Server browser unavailable. Install the matching browser with: npx playwright install --with-deps chromium. Restart the runtime after enabling its dependencies. Your profile is preserved.';
export class ServerBrowserUnavailableError extends Error {}

/** A server-owned profile. It never attaches to a person's Chrome/Electron session. */
export class ServerBrowser implements BrowserBridge {
  private context?: BrowserContext;
  private page?: Page;
  private opening?: Promise<Page>;
  private control: 'agent' | 'user' = 'agent';
  private controlRevision = 0;
  private current: BrowserState = { available: true, url: '', title: '', canBack: false, canForward: false, loading: false };
  private cdp?: CDPSession;
  private cdpPage?: Page;
  constructor(
    private readonly profile: string,
    private readonly options: { systemBrowser?: boolean } = {},
  ) {
    const file = path.join(profile, 'gitu-control.json');
    if (existsSync(file)) {
      try {
        this.control = JSON.parse(readFileSync(file, 'utf8')).control === 'agent' ? 'agent' : 'user';
      } catch {
        this.control = 'user';
      }
    }
  }
  available(): boolean {
    return this.current.available && (Boolean(this.context) || Boolean(this.executable()));
  }
  private executable(): string | undefined {
    if (existsSync(chromium.executablePath())) return chromium.executablePath();
    if (this.options.systemBrowser && process.platform === 'win32') {
      for (const root of [process.env['PROGRAMFILES(X86)'], process.env['PROGRAMFILES'], process.env['LOCALAPPDATA']]) {
        if (!root) continue;
        const edge = path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe');
        if (existsSync(edge)) return edge;
      }
    }
    return undefined;
  }
  state(): BrowserState {
    return {
      ...this.current,
      ...(this.control === 'user' ? { url: '', title: 'Owner private session', canBack: false, canForward: false } : {}),
      available: this.available(),
      driving: this.control === 'agent',
      control: this.control,
    };
  }
  setControl(control: 'agent' | 'user'): void {
    if (control === 'user') {
      this.controlRevision++;
      this.control = control;
    }
    mkdirSync(this.profile, { recursive: true, mode: 0o700 });
    writeFileSync(path.join(this.profile, 'gitu-control.json'), JSON.stringify({ control }), { mode: 0o600 });
    if (control === 'agent') {
      this.controlRevision++;
      this.control = control;
    }
  }
  private async ready(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    if (this.opening) return this.opening;
    this.opening = (async () => {
      mkdirSync(this.profile, { recursive: true, mode: 0o700 });
      try {
        const executablePath = this.executable();
        if (!executablePath) throw new ServerBrowserUnavailableError(SERVER_BROWSER_SETUP);
        this.context = await chromium.launchPersistentContext(this.profile, { executablePath, headless: true, viewport: { width: 1280, height: 800 }, acceptDownloads: false });
        this.page = this.context.pages()[0] ?? (await this.context.newPage());
        // Login popups stay in this isolated browser profile and the chat viewer.
        this.context.on('page', (page) => {
          this.page = page;
        });
        return this.page;
      } catch {
        this.current.available = false;
        throw new ServerBrowserUnavailableError(SERVER_BROWSER_SETUP);
      }
    })().finally(() => {
      this.opening = undefined;
    });
    return this.opening;
  }
  private assertControl(): void {
    if (this.control === 'user') throw new Error('The owner controls this browser. Wait until control is returned.');
  }
  private async update(page: Page): Promise<BrowserState> {
    let canBack = false;
    let canForward = false;
    try {
      // Playwright exposes no history position of its own; CDP does (the
      // server browser is Chromium-only by design). These flags drive the
      // navigation affordances in the agent bridge, so the previous
      // hardcoded `false` made history look permanently unavailable.
      const cdp = this.cdp && this.cdpPage === page ? this.cdp : await page.context().newCDPSession(page);
      if (this.cdp !== cdp) {
        this.cdp = cdp;
        this.cdpPage = page;
      }
      const nav = (await cdp.send('Page.getNavigationHistory')) as { currentIndex: number; entries: unknown[] };
      canBack = nav.currentIndex > 0;
      canForward = nav.currentIndex < nav.entries.length - 1;
    } catch {
      /* history probing is best-effort; state still reports url/title */
    }
    this.current = { available: true, url: page.url(), title: await page.title(), canBack, canForward, loading: false };
    return this.state();
  }
  private async mutate(action: (p: Page) => Promise<unknown>): Promise<BrowserState> {
    this.assertControl();
    const revision = this.controlRevision;
    const page = await this.ready();
    this.assertControl();
    if (revision !== this.controlRevision) throw new Error('Browser control changed before this action.');
    await action(page);
    return this.update(page);
  }
  navigate(url: string): Promise<BrowserState> {
    return this.mutate((p) => p.goto(normalizeUrl(url), { waitUntil: 'domcontentloaded', timeout: 30000 }));
  }
  back(): Promise<BrowserState> {
    return this.mutate((p) => p.goBack());
  }
  forward(): Promise<BrowserState> {
    return this.mutate((p) => p.goForward());
  }
  reload(): Promise<BrowserState> {
    return this.mutate((p) => p.reload({ waitUntil: 'domcontentloaded' }));
  }
  click(x: number, y: number): Promise<BrowserState> {
    return this.mutate((p) => p.mouse.click(x, y));
  }
  type(text: string): Promise<BrowserState> {
    return this.mutate((p) => p.keyboard.insertText(text));
  }
  press(key: string): Promise<BrowserState> {
    return this.mutate((p) => p.keyboard.press(key));
  }
  clickSelector(selector: string): Promise<BrowserState> {
    return this.mutate((p) => p.locator(selector).first().click());
  }
  fill(selector: string, text: string): Promise<BrowserState> {
    return this.mutate((p) => p.locator(selector).first().fill(text));
  }
  hover(x: number, y: number): Promise<BrowserState> {
    return this.mutate((p) => p.mouse.move(x, y));
  }
  scroll(_x: number, _y: number, deltaY: number): Promise<BrowserState> {
    return this.mutate((p) => p.mouse.wheel(0, deltaY));
  }
  select(selector: string, value: string): Promise<BrowserState> {
    return this.mutate((p) => p.locator(selector).first().selectOption(value));
  }
  setViewport(width: number, height: number): Promise<BrowserState> {
    return this.mutate((p) => p.setViewportSize({ width, height }));
  }
  async evaluate(expression: string): Promise<unknown> {
    this.assertControl();
    const revision = this.controlRevision;
    const page = await this.ready();
    this.assertControl();
    if (revision !== this.controlRevision) throw new Error('Browser control changed during observation.');
    const result = await page.evaluate(expression);
    this.assertControl();
    if (revision !== this.controlRevision) throw new Error('Browser control changed during observation.');
    return result;
  }
  async screenshot(): Promise<BrowserScreenshot> {
    this.assertControl();
    const revision = this.controlRevision;
    const page = await this.ready();
    this.assertControl();
    if (revision !== this.controlRevision) throw new Error('Browser control changed during observation.');
    const result = {
      pngBase64: (await page.screenshot({ type: 'png' })).toString('base64'),
      state: await this.update(page),
      textDigest: (await page.locator('body').innerText()).slice(0, 16000),
    };
    this.assertControl();
    if (revision !== this.controlRevision) throw new Error('Browser control changed during observation.');
    return result;
  }
  async ownerScreenshot(): Promise<BrowserScreenshot> {
    const page = await this.ready();
    const pngBase64 = (await page.screenshot({ type: 'jpeg', quality: 75 })).toString('base64');
    await this.update(page);
    return { pngBase64, mime: 'image/jpeg', state: { ...this.current, control: this.control, driving: this.control === 'agent' } };
  }
  async focus(): Promise<BrowserState> {
    return this.update(await this.ready());
  }
  /** Human input travels only through the authenticated owner's API. */
  async human(action: string, args: Record<string, unknown>): Promise<BrowserState> {
    if (this.control !== 'user') throw new Error('Take control before interacting.');
    const page = await this.ready();
    if (this.control !== 'user') throw new Error('Take control before interacting.');
    for (const key of ['x', 'y', 'deltaY'])
      if (key in args && (!Number.isFinite(args[key]) || Math.abs(Number(args[key])) > 100000)) throw new Error('Invalid browser coordinates.');
    if (action === 'type' && (typeof args['text'] !== 'string' || args['text'].length > 16384)) throw new Error('Invalid text input.');
    if (action === 'press' && (typeof args['key'] !== 'string' || args['key'].length > 80)) throw new Error('Invalid key input.');
    if (action === 'navigate') await page.goto(normalizeUrl(String(args['url'])), { waitUntil: 'domcontentloaded' });
    else if (action === 'back') await page.goBack();
    else if (action === 'forward') await page.goForward();
    else if (action === 'reload') await page.reload({ waitUntil: 'domcontentloaded' });
    else if (action === 'viewport') {
      const width = Number(args['width']),
        height = Number(args['height']);
      if (!Number.isInteger(width) || !Number.isInteger(height) || width < 320 || width > 1920 || height < 240 || height > 1440) throw new Error('Invalid viewport.');
      await page.setViewportSize({ width, height });
    } else if (action === 'close-tab') {
      const pages = this.context!.pages();
      if (pages.length > 1) {
        await page.close();
        this.page = pages.filter((p) => p !== page && !p.isClosed()).at(-1);
        return this.update(await this.ready());
      }
    } else if (action === 'click') await page.mouse.click(Number(args['x']), Number(args['y']));
    else if (action === 'type') await page.keyboard.insertText(String(args['text']));
    else if (action === 'press') await page.keyboard.press(String(args['key']));
    else if (action === 'scroll') await page.mouse.wheel(0, Number(args['deltaY']));
    else throw new Error('Unsupported browser input.');
    return this.update(page);
  }
  async close(): Promise<void> {
    try {
      await this.cdp?.detach();
    } catch {
      /* session already gone */
    }
    this.cdp = undefined;
    this.cdpPage = undefined;
    await this.opening?.catch(() => {});
    await this.context?.close();
    this.context = undefined;
    this.page = undefined;
  }
}
