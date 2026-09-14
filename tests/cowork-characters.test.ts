import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createContext, Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { CoworkStore } from '../src/cowork/store.js';
import { coworkWebOrigin } from '../src/cowork/runner.js';
import { COWORK_JS } from '../src/server/ui-cowork.js';

const esc = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

function ui() {
  const text = { textContent: '' };
  const tool = { innerHTML: '' };
  let html = '';
  let replacements = 0;
  const live = {
    hidden: true,
    get innerHTML() { return html; },
    set innerHTML(value: string) { html = value; replacements++; },
    querySelectorAll: (selector: string) => selector === '.cw-progress-text' ? [text] : [tool],
  };
  const cw = { busy: true, agents: [{ id: 'jelly', name: 'Jelly', avatar: { shape: 'jelly', color: '#8f80ff' } }], progresses: [{ agentId: 'jelly', agentName: 'Jelly', text: 'First', tool: 'browse', webUrl: 'https://example.com' }] };
  const context = createContext({ window: { addEventListener() {} }, S: { cw }, esc, URL, $: (id: string) => id === 'cwLive' ? live : id === 'cwMsgs' ? { scrollHeight: 100, scrollTop: 0, clientHeight: 100 } : null });
  new Script(COWORK_JS).runInContext(context);
  return { context, cw, live, text, tool, replacements: () => replacements };
}

describe('animated teammate characters and web activity', () => {
  it('persists every new character through save, edit and reload', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gitu-characters-'));
    try {
      const file = path.join(dir, 'cowork.json');
      const store = new CoworkStore(file);
      for (const shape of ['jelly', 'cat', 'sprout', 'ufo']) {
        const agent = store.saveAgent({ name: shape, systemPrompt: 'Help.', avatar: { shape, color: '#3fd68f' } });
        store.saveAgent({ id: agent.id, name: shape, systemPrompt: 'Help with research.' });
        expect(new CoworkStore(file).listAgents().find(a => a.id === agent.id)?.avatar).toEqual({ shape, color: '#3fd68f' });
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('renders moving vector parts without depending on WebGL', () => {
    const { context } = ui();
    for (const shape of ['jelly', 'cat', 'sprout', 'ufo']) {
      const html = context.cwAvaImg({ shape, color: '#3fd68f' });
      expect(html).toContain('cw-character-' + shape);
      expect(html).toContain('cw-character-eyes');
      expect(html).toContain('cw-character-arm');
      expect(html).not.toContain('<img');
    }
    expect(context.cwAvaImg({ shape: 'cat', color: '"><script>bad</script>' })).not.toContain('<script>');
  });

  it('keeps live avatars and favicon nodes while reply text streams, then clears them at completion', () => {
    const u = ui();
    u.context.cwRenderProgress();
    expect(u.live.innerHTML).toContain('cw-ava working');
    expect(u.tool.innerHTML).toContain('https://example.com/favicon.ico');
    u.cw.progresses[0]!.text = 'Second chunk';
    u.context.cwRenderProgress();
    expect(u.replacements()).toBe(1);
    expect(u.text.textContent).toBe('Second chunk');
    u.cw.busy = false;
    u.context.cwRenderProgress();
    expect(u.live.hidden).toBe(true);
    expect(u.live.innerHTML).toBe('');
  });

  it('uses only HTTP origins from web tools, omitting credentials and query data', () => {
    expect(coworkWebOrigin('browse', { url: 'https://example.com/search?q=private#fragment' })).toBe('https://example.com');
    for (const url of ['javascript:alert(1)', 'file:///secret', 'https://user:password@example.com', 'not a URL']) {
      expect(coworkWebOrigin('browse', { url })).toBeUndefined();
    }
    expect(coworkWebOrigin('search_files', { url: 'https://example.com' })).toBeUndefined();
  });

  it('shows a globe without a URL and handles completed, failed and non-web tools', () => {
    const { context } = ui();
    const searching = context.cwWebActivity({ tool: 'browse' });
    expect(searching).toContain('Searching the web');
    expect(searching).not.toContain('<img');
    expect(context.cwWebActivity({ tool: 'browse', toolOk: false })).toContain('Web search failed');
    expect(context.cwWebActivity({ tool: 'web_fetch', toolOk: true })).toContain('Page read');
    expect(context.cwWebActivity({ tool: 'search_files' })).toBe('');
    expect(context.cwWebActivity({ tool: 'browse', webUrl: 'javascript:alert(1)' })).not.toContain('<img');
  });
});
