import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * The Electron shell cannot run inside vitest, but its window policy is exactly
 * what decides whether the cowork document preview can draw a PDF: Chromium's
 * PDF viewer is an internal plugin and Electron disables plugins by default, so
 * a missing `plugins: true` silently renders a blank frame for every PDF.
 *
 * These assertions read the shell source and keep that flag (plus the isolation
 * flags that must never be loosened) in place.
 */
const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'desktop', 'main.cjs'), 'utf8');

/** Slice the `webPreferences: { … }` object that follows `marker`, brace-matched. */
function webPreferencesAfter(marker: string): string {
  const markerAt = source.indexOf(marker);
  expect(markerAt, `desktop/main.cjs is missing ${marker}`).toBeGreaterThanOrEqual(0);
  const start = source.indexOf('webPreferences', markerAt);
  expect(start, `${marker} has no webPreferences block`).toBeGreaterThanOrEqual(0);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  throw new Error(`${marker} has an unterminated webPreferences block`);
}

describe('desktop shell window policy', () => {
  it('enables the built-in PDF viewer in the window that hosts the document preview', () => {
    const preferences = webPreferencesAfter('mainWindow = new BrowserWindow(');
    expect(preferences).toContain('plugins: true');
    // Isolation must stay on while plugins are enabled.
    expect(preferences).toContain('contextIsolation: true');
    expect(preferences).toContain('nodeIntegration: false');
  });

  it('enables the built-in PDF viewer in the in-app browser window', () => {
    expect(webPreferencesAfter('browserWin = new BrowserWindow(')).toContain('plugins: true');
  });
});
