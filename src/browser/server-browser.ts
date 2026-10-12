import { chromium, type BrowserContext, type Page } from 'playwright';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { BrowserBridge, BrowserState, BrowserScreenshot } from './browser.js';
import { normalizeUrl } from './browser.js';

/** A server-owned profile. It never attaches to a person's Chrome/Electron session. */
export class ServerBrowser implements BrowserBridge {
  private context?: BrowserContext;
  private page?: Page;
  private opening?: Promise<Page>;
  private control: 'agent' | 'user' = 'agent';
  private current: BrowserState = { available: true, url: '', title: '', canBack: false, canForward: false, loading: false };
  constructor(private readonly profile: string) {
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
    return true;
  }
  state(): BrowserState {
    return { ...this.current, driving: this.control === 'agent' };
  }
  setControl(control: 'agent' | 'user'): void {
    this.control = control;
    mkdirSync(this.profile, { recursive: true, mode: 0o700 });
    writeFileSync(path.join(this.profile, 'gitu-control.json'), JSON.stringify({ control }), { mode: 0o600 });
  }
  private async ready(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    if (this.opening) return this.opening;
    this.opening = (async () => {
      mkdirSync(this.profile, { recursive: true });
      try {
        this.context = await chromium.launchPersistentContext(this.profile, { headless: true, viewport: { width: 1280, height: 800 }, acceptDownloads: false });
        this.page = this.context.pages()[0] ?? (await this.context.newPage());
        return this.page;
      } catch {
        this.current.available = false;
        throw new Error('Server browser unavailable. Install the matching browser with: npx playwright install --with-deps chromium. Your profile is preserved.');
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
    this.current = { available: true, url: page.url(), title: await page.title(), canBack: false, canForward: false, loading: false };
    return this.state();
  }
  private async mutate(action: (p: Page) => Promise<unknown>): Promise<BrowserState> {
    this.assertControl();
    const page = await this.ready();
    this.assertControl();
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
    return (await this.ready()).evaluate(expression);
  }
  async screenshot(): Promise<BrowserScreenshot> {
    const page = await this.ready();
    return {
      pngBase64: (await page.screenshot({ type: 'png' })).toString('base64'),
      state: await this.update(page),
      textDigest: (await page.locator('body').innerText()).slice(0, 16000),
    };
  }
  /** Human input travels only through the authenticated owner's API. */
  async human(action: string, args: Record<string, unknown>): Promise<BrowserState> {
    if (this.control !== 'user') throw new Error('Take control before interacting.');
    const page = await this.ready();
    if (action === 'navigate') await page.goto(normalizeUrl(String(args['url'])), { waitUntil: 'domcontentloaded' });
    else if (action === 'click') await page.mouse.click(Number(args['x']), Number(args['y']));
    else if (action === 'type') await page.keyboard.insertText(String(args['text']));
    else if (action === 'press') await page.keyboard.press(String(args['key']));
    else if (action === 'scroll') await page.mouse.wheel(0, Number(args['deltaY']));
    else throw new Error('Unsupported browser input.');
    return this.update(page);
  }
  async close(): Promise<void> {
    await this.opening?.catch(() => {});
    await this.context?.close();
    this.context = undefined;
    this.page = undefined;
  }
}
