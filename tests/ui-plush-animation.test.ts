import { createContext, Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { CHARACTER_CSS, CHARACTER_JS, plushCharacterHtml } from '../src/server/ui-characters.js';

describe('shared plush character animation', () => {
  it('uses the same blinking renderer in server-built and browser-rendered surfaces', () => {
    const context = createContext({}); new Script(CHARACTER_JS).runInContext(context);
    for (const color of ['blue', 'purple', 'orange', 'mint']) {
      const html = context.plushCharacterHtml(color, 'atlas');
      expect(html).toBe(plushCharacterHtml(color, 'atlas'));
      expect(html.match(/class="cw-blink-lid"/g)).toHaveLength(2);
      expect(html).toContain('src="/characters/' + color + '.png');
      expect(html).toContain('clip-path:ellipse(50% 50%)');
      expect(html).not.toMatch(/<script|onload|setInterval|data:/);
    }
  });
  it('staggers characters deterministically and filters the whole image with its eyelids', () => {
    expect(plushCharacterHtml('blue', 'atlas')).toBe(plushCharacterHtml('blue', 'atlas'));
    expect(plushCharacterHtml('blue', 'atlas')).not.toBe(plushCharacterHtml('blue', 'nova'));
    const html = plushCharacterHtml('blue', 'atlas', 'hue-rotate(50deg) saturate(1.20)');
    expect(html).toContain(';filter:hue-rotate(50deg) saturate(1.20)');
    expect(html).not.toContain('filter:url(');
    expect(plushCharacterHtml('constructor', '" onclick="bad', 'url(https://bad.test)', '" onload="bad')).not.toMatch(/onclick|onload|bad.test/);
    expect(CHARACTER_CSS).toContain('prefers-reduced-motion: reduce');
    expect(CHARACTER_CSS).toContain('.subagent-orb > .cw-plush { animation:none; transform:none; }');
  });
});
