import { existsSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const COMPANION_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../apps/mobile/dist/web');
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/** Only serve exported public Expo assets; never follow a link outside the export. */
export function companionAsset(pathname: string, directory = COMPANION_DIR): { path: string; mime: string } | undefined {
  if (!pathname.startsWith('/companion/')) return undefined;
  let relative: string;
  try {
    relative = decodeURIComponent(pathname.slice('/companion/'.length)) || 'index.html';
  } catch {
    return undefined;
  }
  if (relative.includes('\\') || relative.includes('\0') || relative.split('/').some((part) => part === '..' || part.startsWith('.'))) return undefined;
  const mime = TYPES[path.extname(relative).toLowerCase()];
  if (!mime || !existsSync(directory)) return undefined;
  try {
    const root = realpathSync(directory);
    const target = realpathSync(path.resolve(root, relative));
    const inside = path.relative(root, target);
    if (!inside || inside === '..' || inside.startsWith(`..${path.sep}`) || path.isAbsolute(inside) || !statSync(target).isFile()) return undefined;
    return { path: target, mime };
  } catch {
    return undefined;
  }
}
