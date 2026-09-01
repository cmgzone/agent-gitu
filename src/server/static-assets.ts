import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Files shipped with the local desktop/web server. Keeping this boundary out
 * of the request router makes the server's API lifecycle easier to follow and
 * gives static-file policy one testable home. */
const moduleDir = nodePathFromModule();

function nodePathFromModule(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

export const VENDOR_THREE = path.join(moduleDir, '../../node_modules/three/build/three.module.min.js');
export const FONTS_DIR = path.join(moduleDir, '../../assets/fonts');
export const BRAND_DIR = path.join(moduleDir, '../../assets');

export const FONT_FILES: Record<string, string> = {
  'inter-latin-400-normal.woff2': 'font/woff2',
  'inter-latin-500-normal.woff2': 'font/woff2',
  'inter-latin-600-normal.woff2': 'font/woff2',
  'jetbrains-mono-latin-400-normal.woff2': 'font/woff2',
  'jetbrains-mono-latin-700-normal.woff2': 'font/woff2',
};

export const BRAND_FILES: Record<string, string> = {
  'agent-gitu-mark.svg': 'image/svg+xml',
  'agent-gitu-logo.svg': 'image/svg+xml',
};

const MIME_BY_EXTENSION: Record<string, string> = {
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
};

export function safeFileName(input: string, fallback = 'file'): string {
  const base = path
    .basename(input || fallback)
    .replace(/[\x00-\x1f<>:"/\\|?*]+/g, '-')
    .trim();
  return (base || fallback).slice(0, 180);
}

export function mimeForFile(name: string, supplied?: string): string {
  const known = MIME_BY_EXTENSION[path.extname(name).toLowerCase()];
  if (known) return known;
  const candidate = String(supplied ?? '')
    .split(';')[0]!
    .trim()
    .toLowerCase();
  return /^(text\/[a-z0-9.+-]+|image\/(png|jpeg|gif|webp)|application\/(pdf|json|zip))$/.test(candidate) ? candidate : 'application/octet-stream';
}

export function isPreviewableMime(mime: string): boolean {
  return /^(text\/plain|text\/markdown|text\/csv|application\/json|application\/pdf|image\/(png|jpeg|gif|webp))(;|$)/i.test(mime);
}

export function isTextLikeFile(name: string, mime: string): boolean {
  return /^text\//i.test(mime) || /application\/json/i.test(mime) || /\.(md|txt|csv|json|ya?ml|xml|log|js|jsx|ts|tsx|css|scss|html?|py|rb|go|rs|java|kt|sql)$/i.test(name);
}
