export interface BrowserState {
  available: boolean;
  url: string;
  title: string;
  canBack: boolean;
  canForward: boolean;
  loading: boolean;
  driving?: boolean;
}

export interface BrowserScreenshot {
  pngBase64: string;
  state: BrowserState;
}

export interface BrowserBridge {
  available(): boolean;
  state(): BrowserState;
  navigate(url: string): Promise<BrowserState>;
  back(): Promise<BrowserState>;
  forward(): Promise<BrowserState>;
  reload(): Promise<BrowserState>;
  click(x: number, y: number): Promise<BrowserState>;
  type(text: string): Promise<BrowserState>;
  screenshot(): Promise<BrowserScreenshot>;
  focus?(): Promise<BrowserState>;
  clickSelector?(selector: string): Promise<BrowserState>;
  hover?(x: number, y: number): Promise<BrowserState>;
  scroll?(x: number, y: number, deltaY: number): Promise<BrowserState>;
  fill?(selector: string, text: string): Promise<BrowserState>;
  select?(selector: string, value: string): Promise<BrowserState>;
  press?(key: string): Promise<BrowserState>;
  wait?(ms: number): Promise<BrowserState>;
}

export function normalizeUrl(input: string): string {
  let url = input.trim();
  if (!url) throw new Error('url is required');
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url)) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`unsupported protocol: ${parsed.protocol}`);
    }
    return parsed.href;
  }
  if (/^localhost(:\d+)?/i.test(url) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?/.test(url)) url = `http://${url}`;
  else url = `https://${url}`;
  return new URL(url).href;
}
