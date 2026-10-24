import { normalizeServerUrl } from './client';

export type ConnectionMode = 'local' | 'remote';

export function isLocalServer(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host === '::1') return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(host) || /^fe[89ab][0-9a-f]:/i.test(host)) return true;
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return false;
  const [a, b] = parts.map(Number);
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

export function workspaceServerUrl(value: string, mode: ConnectionMode): string {
  const origin = normalizeServerUrl(value);
  const url = new URL(origin);
  if (mode === 'remote' && url.protocol !== 'https:') throw new Error('Use an HTTPS address for remote sign-in.');
  if (mode === 'local' && !isLocalServer(url.hostname)) throw new Error('Enter your computer’s private network IP address, such as http://192.168.1.10:8421.');
  return origin;
}

export function workspaceNavigation(target: string, origin: string, isTopFrame = true): 'workspace' | 'external' | 'blocked' {
  try {
    const url = new URL(target);
    // Gitu's artifact previews use inline documents and same-origin blob frames.
    if (!isTopFrame && (target === 'about:blank' || target === 'about:srcdoc' || (url.protocol === 'blob:' && url.origin === origin))) return 'workspace';
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return 'blocked';
    if (url.origin === origin) return 'workspace';
    // Never downgrade a remote workspace to HTTP in an external browser.
    return url.protocol === 'https:' ? 'external' : 'blocked';
  } catch {
    return 'blocked';
  }
}
