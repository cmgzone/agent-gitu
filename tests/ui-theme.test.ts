import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { UI_THEME_BOOTSTRAP, UI_THEME_CSS, UI_THEME_JS } from '../src/server/ui-theme.js';
import { UI_HTML } from '../src/server/ui.js';

function themeFixture(theme = 'system', systemDark = false) {
  const attributes = new Map<string, string>();
  const choices = ['light', 'dark', 'system'].map(value => ({ value, checked: false }));
  const toggle = { title: '', setAttribute: vi.fn() };
  const listeners: Record<string, (event?: unknown) => void> = {};
  const media = { matches: systemDark, addEventListener: (_name: string, listener: () => void) => { listeners.system = listener; } };
  const context = createContext({
    S: { settings: { theme, autoLearn: true } }, persist: vi.fn(),
    window: { matchMedia: () => media },
    document: {
      documentElement: { setAttribute: (key: string, value: string) => attributes.set(key, value), getAttribute: (key: string) => attributes.get(key) },
      querySelectorAll: (selector: string) => selector === '[data-theme-toggle]' ? [toggle] : choices,
      addEventListener: (name: string, listener: () => void) => { listeners[name] = listener; },
    },
  });
  new Script(UI_THEME_JS).runInContext(context);
  return { context, choices, toggle, listeners, media, current: () => attributes.get('data-theme') };
}

describe('appearance preference', () => {
  it('follows the operating system until an explicit theme is selected', () => {
    const u = themeFixture();
    expect(u.current()).toBe('light');
    u.media.matches = true;
    u.listeners.system!();
    expect(u.current()).toBe('dark');
    u.context.setTheme('light');
    u.listeners.system!();
    expect(u.current()).toBe('light');
    expect(u.context.persist).toHaveBeenCalledOnce();
    expect(u.context.S.settings).toEqual({ theme: 'light', autoLearn: true });
    expect(u.choices.find(c => c.checked)?.value).toBe('light');
    expect(u.toggle.title).toBe('Switch to dark mode');
    u.context.setTheme('system');
    expect(u.current()).toBe('dark');
  });

  it('supports quick switching and settings radios without rebuilding the page', () => {
    const u = themeFixture('dark');
    u.listeners.click!({ target: { closest: () => ({}) } });
    expect(u.current()).toBe('light');
    u.listeners.change!({ target: { matches: () => true, value: 'dark' } });
    expect(u.current()).toBe('dark');
    expect(u.toggle.title).toBe('Switch to light mode');
    expect(u.context.persist).toHaveBeenCalledTimes(2);
  });

  it.each(['light', 'dark', 'system', 'invalid'])('restores %s before the app renders', theme => {
    const u = themeFixture(theme, true);
    u.context.localStorage = { getItem: () => JSON.stringify({ settings: { theme } }) };
    new Script(UI_THEME_BOOTSTRAP).runInContext(u.context);
    expect(u.current()).toBe(theme === 'light' ? 'light' : 'dark');
    expect(UI_HTML.indexOf('id="themeBootstrap"')).toBeLessThan(UI_HTML.indexOf('<style>'));
  });

  it('still renders when saved preferences are corrupt or storage is unavailable', () => {
    const u = themeFixture();
    u.context.localStorage = { getItem: () => '{invalid' };
    expect(() => new Script(UI_THEME_BOOTSTRAP).runInContext(u.context)).not.toThrow();
    u.context.localStorage.getItem = () => { throw new Error('Storage blocked'); };
    expect(() => new Script(UI_THEME_BOOTSTRAP).runInContext(u.context)).not.toThrow();
    expect(u.current()).toBe('light');
  });
});

function luminance(hex: string) {
  const channels = hex.match(/\w\w/g)!.map(c => parseInt(c, 16) / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
  return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0]! + .05) / (values[1]! + .05);
}

describe('theme readability', () => {
  const palettes = [...UI_THEME_CSS.matchAll(/:root(?:\[data-theme="light"\])?\s*\{([^}]+)\}/g)].map(rule =>
    Object.fromEntries([...rule[1]!.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/g)].map(match => [match[1], match[2]])) as Record<string, string>,
  );
  it.each(palettes.map((palette, i) => [i === 0 ? 'dark' : 'light', palette] as const))('keeps text readable in %s mode', (_name, palette) => {
    for (const foreground of ['text', 'muted', 'faint']) {
      for (const surface of ['bg', 'card', 'card2', 'sidebar']) expect(contrast(palette[foreground]!, palette[surface]!)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(palette.accent!, palette['on-accent']!)).toBeGreaterThanOrEqual(4.5);
    for (const status of ['ok', 'err', 'run']) expect(contrast(palette[status]!, palette[status + '-dim']!)).toBeGreaterThanOrEqual(4.5);
  });
});
