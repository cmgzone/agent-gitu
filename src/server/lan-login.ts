import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';

/** Plain HTTP is opt-in and confined to private IP literals on both ends. */
export function privateNetworkRequest(req: IncomingMessage): boolean {
  const privateAddress = (value: string): boolean => {
    const address = value
      .replace(/^\[|\]$/g, '')
      .replace(/^::ffff:/i, '')
      .toLowerCase();
    if (isIP(address) === 4) {
      const [a, b] = address.split('.').map(Number);
      return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b! >= 16 && b! <= 31);
    }
    return isIP(address) === 6 && (address === '::1' || /^f[cd][0-9a-f]{2}:/.test(address) || /^fe[89ab][0-9a-f]:/.test(address));
  };
  try {
    const host = new URL(`http://${req.headers.host ?? ''}`).hostname;
    return privateAddress(host) && privateAddress(req.socket.remoteAddress ?? '');
  } catch {
    return false;
  }
}
