import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { UI_HTML } from '../src/server/ui.js';

describe('Astryx UI integration in standalone bundle', () => {
  it('embeds pikpam theme styles, mount root, and compiled Astryx bundle without breaking the primary script block', () => {
    expect(UI_HTML).toContain('<style id="astryxStyles">');
    expect(UI_HTML).toContain('data-astryx-theme=pikpam');
    expect(UI_HTML).toContain('<div id="gituAstryxRoot"></div>');
    expect(UI_HTML).toContain('<script id="gituAstryxBundle">');
    expect(UI_HTML).toContain('window.__gituAstryx');
    expect(UI_HTML).toContain('window.__gituHost');

    // Primary script block remains cleanly parseable before the React/Astryx bundle.
    const firstScriptStart = UI_HTML.indexOf('<script>');
    const firstScriptEnd = UI_HTML.indexOf('</script>', firstScriptStart);
    expect(firstScriptStart).toBeGreaterThan(-1);
    expect(firstScriptEnd).toBeGreaterThan(firstScriptStart);
    const primaryJs = UI_HTML.slice(firstScriptStart + '<script>'.length, firstScriptEnd);
    expect(() => new Script(primaryJs)).not.toThrow();

    // Astryx stylesheet precedes Gitu custom base styles while Gitu chat stays untouched.
    expect(UI_HTML.indexOf('id="astryxStyles"')).toBeLessThan(UI_HTML.indexOf('<div class="shell"'));
    expect(UI_HTML.indexOf('<script id="gituAstryxBundle">')).toBeGreaterThan(firstScriptEnd);
    expect(UI_HTML).toContain('.cw-teammate-switcher { display:none!important; }');
  });
});
