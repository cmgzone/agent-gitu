import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createContext, Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { CoworkStore } from '../src/cowork/store.js';
import { coworkWebOrigin, type CoworkProgress } from '../src/cowork/runner.js';
import { COWORK_JS } from '../src/server/ui-cowork.js';

const esc = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

function ui() {
  const text = { textContent: '', hidden: false };
  const label = { textContent: '' };
  const tool = { innerHTML: '' };
  const indicator = { className: 'cw-progress-activity activity-indicator' };
  let html = '';
  let replacements = 0;
  const live = {
    hidden: true,
    get innerHTML() { return html; },
    set innerHTML(value: string) { html = value; replacements++; },
    querySelectorAll: (selector: string) =>
      selector === '.cw-progress-text' ? [text]
        : selector === '.cw-progress-activity .wtext' ? [label]
          : selector === '.cw-progress-activity' ? [indicator]
            : selector === '.cw-live-bubble' ? [{ classList: { toggle() {} } }]
            : [tool],
  };
  const cw = { busy: true, agents: [{ id: 'jelly', name: 'Jelly', avatar: { shape: 'jelly', color: '#8f80ff' } }], progresses: [{ agentId: 'jelly', agentName: 'Jelly', text: 'First', tool: 'browse', webUrl: 'https://example.com' }] as CoworkProgress[] };
  const context = createContext({ window: { addEventListener() {} }, S: { cw }, esc, URL, $: (id: string) => id === 'cwLive' ? live : id === 'cwMsgs' ? { scrollHeight: 100, scrollTop: 0, clientHeight: 100 } : null });
  new Script(COWORK_JS).runInContext(context);
  return { context, cw, live, text, label, tool, replacements: () => replacements };
}

describe('animated teammate characters and web activity', () => {
  it('persists every new character through save, edit and reload', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gitu-characters-'));
    try {
      const file = path.join(dir, 'cowork.json');
      const store = new CoworkStore(file);
      for (const shape of ['home-blob', 'orb', 'cube', 'diamond', 'pyramid']) {
        const agent = store.saveAgent({ name: shape, systemPrompt: 'Help.', avatar: { shape, color: '#3fd68f' } });
        store.saveAgent({ id: agent.id, name: shape, systemPrompt: 'Help with research.' });
        expect(new CoworkStore(file).listAgents().find(a => a.id === agent.id)?.avatar).toEqual({ shape, color: '#3fd68f' });
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('offers the homepage blob and geometric companions with safe fallbacks', () => {
    const { context } = ui();
    expect(Array.from(context.CW_SHAPES)).toEqual(['home-blob', 'orb', 'cube', 'diamond', 'pyramid']);
    expect(Object.values(context.CW_CHARACTER_NAMES)).toEqual(['Home Blob', 'Round', 'Cube', 'Diamond', 'Pyramid']);
    expect(context.cwAvaImg({ shape: 'orb', color: '#3fd68f' })).toContain('cw-orb-eyes');
    const cube = context.cwAvaImg({ shape: 'cube', color: '#3fd68f' });
    expect(cube).toContain('width="28" height="28"');
    expect(cube).not.toContain('height="5"');
    expect(context.cwAvaImg({ shape: 'cat', color: '#3fd68f' })).toContain('cw-orb-eyes');
    expect(context.cwAvaImg({ shape: 'cat', color: '"><script>bad</script>' })).not.toContain('<script>');
  });

  it('keeps the homepage expression and unique gradient ids for repeated avatars', () => {
    const { context } = ui();
    const home = context.cwAvaImg({ shape: 'home-blob', color: '#8f80ff' });
    expect(home).toContain('home-blob-tongue');
    expect(home).toContain('#9580ff');
    expect(context.cwAvaImg({ shape: 'home-blob', color: '#3fd68f' })).toContain('#3fd68f');
    expect(home.match(/id="([^"]+)"/)?.[1]).not.toBe(context.cwAvaImg({ shape: 'home-blob' }).match(/id="([^"]+)"/)?.[1]);
    const fallbacks = ['orb', 'cube', 'diamond', 'pyramid'].map(shape => context.cwAvaImg({ shape, color: '#3fd68f' }).replace(/cwBlobFill\d+/g, 'fill'));
    expect(new Set(fallbacks).size).toBe(4);
  });

  it('renders and caches each geometric character independently while keeping the homepage SVG', () => {
    const { context } = ui();
    const renders: string[] = [];
    context.window.__coworkAvatar = { render: (avatar: { shape: string; color: string }) => {
      renders.push(avatar.shape + avatar.color);
      return 'data:image/png;base64,' + avatar.shape;
    } };
    for (const shape of ['orb', 'cube', 'diamond', 'pyramid']) {
      expect(context.cwAvaImg({ shape, color: '#8f80ff' })).toContain('data:image/png;base64,' + shape);
      context.cwAvaImg({ shape, color: '#8f80ff' });
    }
    context.cwAvaImg({ shape: 'home-blob', color: '#8f80ff' });
    expect(renders).toHaveLength(4);
    context.cwAvaImg({ shape: 'cube', color: '#3fd68f' });
    expect(renders).toHaveLength(5);
  });

  it('migrates removed characters on reload while preserving teammates and their colors', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gitu-legacy-characters-'));
    try {
      const file = path.join(dir, 'cowork.json');
      const store = new CoworkStore(file);
      const shapes = ['cat', 'ufo', 'jelly', 'sprout', 'visor', 'antenna', 'bot'];
      for (const shape of shapes) store.saveAgent({ name: shape, systemPrompt: 'Keep my profile.', avatar: { shape: 'orb', color: '#3fd68f' } });
      const document = JSON.parse(readFileSync(file, 'utf8'));
      document.agents.forEach((agent: { avatar: { shape: string } }, i: number) => { agent.avatar.shape = shapes[i]; });
      writeFileSync(file, JSON.stringify(document));
      const migrated = new CoworkStore(file).listAgents();
      expect(migrated.map(agent => agent.avatar.shape)).toEqual(['orb', 'orb', 'orb', 'orb', 'cube', 'cube', 'cube']);
      expect(migrated.map(agent => agent.id)).toEqual(document.agents.map((agent: { id: string }) => agent.id));
      expect(migrated.every(agent => agent.avatar.color === '#3fd68f' && agent.systemPrompt === 'Keep my profile.')).toBe(true);
      expect(JSON.parse(readFileSync(file, 'utf8')).agents.map((agent: { avatar: { shape: string } }) => agent.avatar.shape)).toEqual(migrated.map(agent => agent.avatar.shape));
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('keeps live avatars while prose streams, showing a site icon but no command or path text', () => {
    const u = ui();
    u.context.cwRenderProgress();
    expect(u.live.innerHTML).toContain('cw-ava working');
    // The web tool wears the site's favicon — a mark, never a path or command.
    expect(u.tool.innerHTML).toContain('icons.duckduckgo.com/ip3/example.com.ico');
    expect(u.tool.innerHTML).toContain('Browsing example.com');
    expect(u.tool.innerHTML).not.toContain('/search');
    expect(u.label.textContent).toBe('Working…');
    expect(u.live.innerHTML).not.toContain('cw-progress-tool');
    u.cw.progresses[0]!.text = 'Second chunk';
    u.context.cwRenderProgress();
    expect(u.replacements()).toBe(1);
    expect(u.text.textContent).toBe('Checking the web for the requested information…\nSecond chunk');
    u.cw.busy = false;
    u.context.cwRenderProgress();
    expect(u.live.hidden).toBe(true);
    expect(u.live.innerHTML).toBe('');
  });

  it('keeps commands and file paths out of live messages, marking them with icons instead', () => {
    const u = ui();
    // A safe description appears until the agent sends its own prose.
    u.cw.progresses = [{ agentId: 'jelly', agentName: 'Jelly', text: '', tool: 'run_command', detail: '$ npm test' }];
    u.context.cwRenderProgress();
    expect(u.label.textContent).toBe('Working…');
    expect(u.text.textContent).toBe('Running a check in the workspace…');
    expect(u.text.hidden).toBe(false);
    // The icon marks the activity; the command itself never reaches the row.
    expect(u.tool.innerHTML).toContain('title="Running a command"');
    expect(u.tool.innerHTML).not.toContain('npm test');
    expect(u.tool.innerHTML).not.toContain('run_command');
    expect(u.tool.innerHTML).not.toContain('$');

    // Public prose accompanies the activity; raw tool details remain hidden.
    u.cw.progresses = [{ agentId: 'jelly', agentName: 'Jelly', text: 'Checking the suite', tool: 'run_command', toolOk: true, detail: '$ npm test' }];
    u.context.cwRenderProgress();
    expect(u.text.textContent).toBe('Running a check in the workspace…\nChecking the suite');
    expect(u.label.textContent).toBe('Completed');
    expect(u.tool.innerHTML).not.toContain('npm test');

    // File paths from tool activity must not leak into the message either.
    u.cw.progresses = [{ agentId: 'jelly', agentName: 'Jelly', text: '', tool: 'read_file', detail: 'read src/app.ts' }];
    u.context.cwRenderProgress();
    expect(u.label.textContent).toBe('Working…');
    expect(u.text.textContent).toBe('Checking the relevant files…');
    expect(u.text.hidden).toBe(false);
    expect(u.tool.innerHTML).toContain('title="Reading a file"');
    expect(u.tool.innerHTML).not.toContain('src/app.ts');
    expect(u.tool.innerHTML).not.toContain('read_file');
  });

  it('uses only HTTP origins from web tools, omitting credentials and query data', () => {
    expect(coworkWebOrigin('browse', { url: 'https://example.com/search?q=private#fragment' })).toBe('https://example.com');
    for (const url of ['javascript:alert(1)', 'file:///secret', 'https://user:password@example.com', 'not a URL']) {
      expect(coworkWebOrigin('browse', { url })).toBeUndefined();
    }
    expect(coworkWebOrigin('search_files', { url: 'https://example.com' })).toBeUndefined();
  });

  it('changes activity labels without restarting animation and clears them when stopped', () => {
    const u = ui();
    u.cw.progresses = [{ agentId: 'jelly', agentName: 'Jelly', text: '', phase: 'thinking' }];
    for (const phase of ['thinking', 'reasoning', 'responding', 'working'] as const) {
      u.cw.progresses[0]!.phase = phase;
      u.context.cwRenderProgress();
      expect(u.label.textContent.toLowerCase()).toBe(phase + '…');
    }
    expect(u.replacements()).toBe(1);
    expect(u.live.innerHTML).toContain('thinking-waves');
    u.cw.busy = false;
    u.context.cwRenderProgress();
    expect(u.live.hidden).toBe(true);
    expect(u.live.innerHTML).toBe('');
  });

  it('keeps the shared footer animation stable for concurrent teammates and queued work', () => {
    const u = ui();
    const status = { textContent: '', title: '' };
    let html = '', replacements = 0;
    const typing = {
      hidden: true,
      get innerHTML() { return html; },
      set innerHTML(value: string) { html = value; replacements++; },
      querySelector: () => html ? status : null,
    };
    const button = { classList: { toggle() {} }, innerHTML: '', title: '', setAttribute() {} };
    const input = { value: '' };
    u.context.document = { querySelectorAll: () => [] };
    u.context.$ = (id: string) => id === 'cwTyping' ? typing : id === 'cwSend' ? button : id === 'cwInput' ? input : null;
    u.context.S.cw.queued = 2;
    u.cw.progresses = [
      { agentId: 'jelly', agentName: 'Jelly', phase: 'reasoning', text: '' },
      { agentId: 'writer', agentName: 'Writer', phase: 'responding', text: 'Hello' },
    ];
    u.context.cwRenderTyping();
    expect(status.textContent).toBe('Jelly · Reasoning…  ·  Writer · Responding… · 2 queued');
    u.cw.progresses[0]!.phase = 'working';
    u.context.cwRenderTyping();
    expect(status.textContent).toContain('Jelly · Working…');
    expect(replacements).toBe(1);
    expect(html).toContain('role="status"');
    expect(html).toContain('thinking-waves');
    u.cw.busy = false;
    u.context.cwRenderTyping();
    expect(typing.hidden).toBe(true);
    expect(html).toBe('');
    expect(button.title).toBe('Send (Enter)');
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
