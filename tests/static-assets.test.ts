import { describe, expect, it } from 'vitest';
import { BRAND_FILES, FONT_FILES, isPreviewableMime, isTextLikeFile, mimeForFile, safeFileName } from '../src/server/static-assets.js';

describe('static asset policy', () => {
  it('allows only bundled names and safe download file names', () => {
    expect(FONT_FILES['inter-latin-400-normal.woff2']).toBe('font/woff2');
    expect(BRAND_FILES['agent-gitu-logo.svg']).toBe('image/svg+xml');
    expect(safeFileName('../unsafe\\report?.txt')).toBe('report-.txt');
  });

  it('preserves strict mime and preview policy', () => {
    expect(mimeForFile('notes.md')).toMatch(/^text\/markdown/);
    expect(mimeForFile('upload.bin', 'text/plain; charset=utf-8')).toBe('text/plain');
    expect(mimeForFile('upload.bin', 'application/x-executable')).toBe('application/octet-stream');
    expect(isPreviewableMime('image/png')).toBe(true);
    expect(isPreviewableMime('application/zip')).toBe(false);
    expect(isTextLikeFile('src/main.ts', 'application/octet-stream')).toBe(true);
  });
});
