export interface BrowserState {
  available: boolean;
  url: string;
  title: string;
  canBack: boolean;
  canForward: boolean;
  loading: boolean;
}

export interface BrowserScreenshot {
  pngBase64: string;
  state: BrowserState;
}

export interface BrowserBridge {
  state(): BrowserState;
  navigate(url: string): Promise<BrowserState>;
  back(): Promise<BrowserState>;
  forward(): Promise<BrowserState>;
  reload(): Promise<BrowserState>;
  screenshot(): Promise<BrowserScreenshot>;
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
