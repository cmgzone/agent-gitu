import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createContext, Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { CoworkStore } from '../src/cowork/store.js';
import { coworkAppService, coworkWebOrigin, type CoworkProgress } from '../src/cowork/runner.js';
import { COWORK_CSS, COWORK_JS } from '../src/server/ui-cowork.js';
import { CONNECTED_APPS_JS } from '../src/server/ui-connected-apps.js';

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
  const context = createContext({ window: { addEventListener() {} }, document: { addEventListener() {}, querySelectorAll: () => [] }, S: { cw }, esc, URL, $: (id: string) => id === 'cwLive' ? live : id === 'cwMsgs' ? { scrollHeight: 100, scrollTop: 0, clientHeight: 100 } : null });
  new Script(COWORK_JS).runInContext(context);
  return { context, cw, live, text, label, tool, replacements: () => replacements };
}

describe('animated teammate characters and web activity', () => {
  it('persists every new character through save, edit and reload', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'gitu-characters-'));
    try {
      const file = path.join(dir, 'cowork.json');
      const store = new CoworkStore(file);
      for (const shape of ['dot-blue', 'dot-mint', 'dot-orange', 'dot-purple', 'home-blob', 'orb', 'cube', 'diamond', 'pyramid']) {
        const agent = store.saveAgent({ name: shape, systemPrompt: 'Help.', avatar: { shape, color: '#3fd68f' } });
        store.saveAgent({ id: agent.id, name: shape, systemPrompt: 'Help with research.' });
        expect(new CoworkStore(file).listAgents().find(a => a.id === agent.id)?.avatar).toEqual({ shape, color: '#3fd68f' });
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('offers four bundled plush characters with safe legacy fallbacks', () => {
    const { context } = ui();
    expect(Array.from(context.CW_SHAPES)).toEqual(['dot-blue', 'dot-mint', 'dot-orange', 'dot-purple']);
    expect(Object.values(context.CW_CHARACTER_NAMES)).toEqual(['Blue', 'Mint', 'Orange', 'Purple']);
    for (const shape of ['home-blob', 'orb', 'cube', 'cat', 'diamond', 'pyramid']) {
      expect(context.cwAvaImg({ shape, color: '#3fd68f' })).toContain('/characters/mint.png');
    }
    expect(context.cwAvaImg({ shape: 'cat', color: '<script>bad</script>' })).toContain('/characters/purple.png');
    expect(context.cwAvaImg({ shape: 'dot-../../secret', color: '#5ba8ff' })).toContain('/characters/blue.png');
  });

  it('ships the original transparent PNGs and their license locally', () => {
    const { context } = ui();
    for (const color of ['blue', 'mint', 'orange', 'purple']) {
      expect(context.cwAvaImg({ shape: 'dot-' + color })).toContain('/characters/' + color + '.png');
      const png = readFileSync(new URL('../assets/cowork-dots/' + color + '.png', import.meta.url));
      expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(png[25]).toBe(6); // RGBA preserves the transparent background.
    }
    expect(readFileSync(new URL('../assets/cowork-dots/LICENSE', import.meta.url), 'utf8')).toContain('MIT License');
  });

  it('keeps the homepage motion and gives chat and panel characters room to show their faces', () => {
    expect(COWORK_CSS).toContain('.cw-ava { width: 40px; height: 40px;');
    expect(COWORK_CSS).toContain('.cw-row > .cw-ava { width: 46px; height: 46px; }');
    expect(COWORK_CSS).toContain('.report-flat .cw-row > .cw-ava { width: 64px; height: 64px; }');
    expect(COWORK_CSS).toContain('.cw-chat-head .cw-ava { width: 76px; height: 76px; }');
    expect(COWORK_JS).toContain('cwAva(a, 112)');
    expect(COWORK_JS).toContain('cwAva(m, 40)');
    expect(COWORK_CSS).toContain('.cw-plush > svg.cw-blink-overlay');
  });

  it('renders plush images immediately even when WebGL is unavailable', () => {
    const { context } = ui();
    context.window.__coworkAvatar = { render: () => { throw new Error('WebGL unavailable'); } };
    for (const shape of ['dot-blue', 'dot-mint', 'dot-orange', 'dot-purple', 'home-blob', 'cube']) {
      expect(context.cwAvaImg({ shape, color: '#8f80ff' })).toContain('<img src="/characters/');
    }
  });

  it('keeps complete profile instructions readable while treating their HTML as text', () => {
    const { context } = ui();
    const prompt = '# Identity\n\nYou are **Mina**, a research partner.\n\n' + 'Keep the complete instructions. '.repeat(30) + '\n\n# Tools\n<script>alert(1)</script>\n<iframe src="https://example.com"></iframe>';
    expect(context.cwProfileDescription(prompt)).toBe('You are Mina, a research partner.');
    const instructions = context.cwProfileInstructionsHtml(prompt);
    expect(instructions).toContain('<h5>Identity</h5>');
    expect(instructions).toContain('<b>Mina</b>');
    expect(instructions).toContain('Keep the complete instructions. '.repeat(30));
    expect(instructions).toContain('&lt;script&gt;');
    expect(instructions).toContain('&lt;iframe');
    expect(instructions).not.toContain('<script');
    expect(instructions).not.toContain('<iframe');
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

  it('updates character activity in place through thinking, work, handoff and idle', () => {
    const u = ui();
    const headerText = { textContent: '' };
    const railText = { textContent: '' };
    const attrs: Record<string, string> = {};
    const icon = { hidden: true, innerHTML: '' };
    const status = { title: '', querySelector: (selector: string) => selector === '.cw-persona-tool' ? icon : headerText, setAttribute: (key: string, value: string) => { attrs[key] = value; } };
    const rail = { querySelector: () => railText, getAttribute: (key: string) => key === 'data-cw-agent-status' ? 'jelly' : 'rail', setAttribute() {} };
    u.context.document = { querySelectorAll: () => [rail] };
    u.context.$ = (id: string) => id === 'cwCharacterStatus' ? status : null;
    u.context.S.cw.active = 'dm';
    u.context.S.cw.convs = [{ id: 'dm', kind: 'dm', memberIds: ['jelly'] }];
    u.cw.progresses = [{ agentId: 'jelly', agentName: 'Jelly', phase: 'thinking', text: '' }];
    u.context.cwUpdateCharacterActivity();
    expect(headerText.textContent).toBe('AI teammate · Thinking…');
    expect(railText.textContent).toBe('Thinking…');
    u.cw.progresses[0]!.tool = 'run_command';
    u.context.cwUpdateCharacterActivity();
    expect(headerText.textContent).toBe('AI teammate · Working…');
    expect(icon.innerHTML).toContain('Running a command');
    expect(icon.hidden).toBe(false);
    expect(attrs['data-tool']).toBe('true');
    u.cw.progresses[0]!.tool = 'connected_apps';
    u.cw.progresses[0]!.appService = 'facebook';
    u.context.cwUpdateCharacterActivity();
    expect(icon.innerHTML).toContain('facebook.com.ico');
    u.context.S.cw.requests = [{ status: 'open', agentId: 'jelly' }];
    u.context.cwUpdateCharacterActivity();
    expect(headerText.textContent).toBe('AI teammate · Working…');
    expect(railText.textContent).toBe('Working…');
    u.cw.busy = false;
    u.context.cwUpdateCharacterActivity();
    expect(headerText.textContent).toBe('AI teammate · Waiting for you');
    expect(icon.hidden).toBe(true);
    expect(icon.innerHTML).toBe('');
    expect(attrs['data-tool']).toBe('false');
    u.context.S.cw.requests[0].status = 'answered';
    u.context.cwUpdateCharacterActivity();
    expect(headerText.textContent).toBe('AI teammate · Ready');
    expect(attrs['data-active']).toBe('false');
    expect(u.replacements()).toBe(0);
  });

  it('shows resumed work ahead of an unanswered request in every live phase', () => {
    const { context, cw } = ui();
    context.S.cw.requests = [{ status: 'open', agentId: 'jelly' }];
    cw.busy = false;
    expect(context.cwCharacterActivity('jelly')).toBe('Waiting for you');
    cw.busy = true;
    for (const phase of ['thinking', 'reasoning', 'responding', 'working'] as const) {
      cw.progresses = [{ agentId: 'jelly', agentName: 'Jelly', text: '', phase }];
      expect(context.cwCharacterActivity('jelly').toLowerCase()).toBe(phase + '…');
    }
    cw.progresses[0]!.tool = 'run_command';
    expect(context.cwCharacterActivity('jelly')).toBe('Working…');
    cw.busy = false;
    // The previous progress record must not keep a stopped agent active.
    expect(context.cwCharacterActivity('jelly')).toBe('Waiting for you');
    context.S.cw.requests[0].status = 'answered';
    expect(context.cwCharacterActivity('jelly')).toBe('Ready');
  });

  it('keeps a paused teammate waiting while the team and another teammate work', () => {
    const { context, cw } = ui();
    context.S.cw.agents.push({ id: 'mina', name: 'Mina' });
    context.S.cw.active = 'group';
    context.S.cw.convs = [{ id: 'group', kind: 'group', memberIds: ['jelly', 'mina'] }];
    context.S.cw.requests = [{ status: 'open', agentId: 'jelly' }];
    cw.progresses = [{ agentId: 'mina', agentName: 'Mina', text: '', tool: 'read_file' }];
    expect(context.cwCharacterActivity('jelly')).toBe('Waiting for you');
    expect(context.cwCharacterActivity('mina')).toBe('Working…');
    expect(context.cwCharacterActivity(null)).toBe('Working…');
    cw.busy = false;
    expect(context.cwCharacterActivity('mina')).toBe('Ready');
    expect(context.cwCharacterActivity(null)).toBe('Waiting for you');
  });

  it('shows thinking at the start of a DM without attributing other agents work to it', () => {
    const { context, cw } = ui();
    context.S.cw.active = 'dm';
    context.S.cw.convs = [{ id: 'dm', kind: 'dm', memberIds: ['jelly'] }];
    context.S.cw.requests = [{ status: 'open', agentId: 'jelly' }];
    cw.progresses = [];
    expect(context.cwCharacterActivity('jelly')).toBe('Thinking…');
    expect(context.cwCharacterActivity(null)).toBe('Thinking…');
    context.S.cw.working = 'Mina';
    expect(context.cwCharacterActivity('jelly')).toBe('Waiting for you');
    context.S.cw.working = 'Jelly';
    expect(context.cwCharacterActivity('jelly')).toBe('Thinking…');
    context.S.cw.working = null;
    context.S.cw.convs[0].kind = 'group';
    expect(context.cwCharacterActivity('jelly')).toBe('Waiting for you');
    expect(context.cwCharacterActivity(null)).toBe('Thinking…');
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

  it('keeps header activity and stop/queue controls live without a footer activity row', () => {
    const u = ui();
    const status = { textContent: '' };
    const header = { title: '', querySelector: (selector: string) => selector === 'span' ? status : null, setAttribute() {} };
    const button = { classList: { toggle() {} }, innerHTML: '', title: '', setAttribute() {} };
    const input = { value: '' };
    u.context.document = { querySelectorAll: () => [] };
    u.context.$ = (id: string) => id === 'cwCharacterStatus' ? header : id === 'cwSend' ? button : id === 'cwInput' ? input : null;
    u.context.S.cw.active = 'group';
    u.context.S.cw.convs = [{ id: 'group', kind: 'group', memberIds: ['jelly', 'writer'] }];
    u.context.S.cw.queued = 2;
    u.cw.progresses = [
      { agentId: 'jelly', agentName: 'Jelly', phase: 'reasoning', text: '' },
      { agentId: 'writer', agentName: 'Writer', phase: 'responding', text: 'Hello' },
    ];
    u.context.cwRenderTyping();
    expect(status.textContent).toBe('AI team · Reasoning… · 2 queued');
    expect(button.title).toBe('Stop the team');
    u.cw.progresses[0]!.phase = 'working';
    input.value = 'A follow-up message';
    u.context.cwRenderTyping();
    expect(status.textContent).toBe('AI team · Working… · 2 queued');
    expect(button.title).toBe('Queue this message while the team works');
    u.cw.busy = false;
    u.context.S.cw.queued = 0;
    input.value = '';
    u.context.cwRenderTyping();
    expect(status.textContent).toBe('AI team · Ready');
    expect(button.title).toBe('Send (Enter)');
  });

  it('renders saved app approvals as readable fields without changing their exact action', () => {
    const { context } = ui();
    const request = { id: 'review-facebook', agentId: 'jelly', kind: 'recommendation', status: 'open', createdAt: '2026-10-04T06:00:00Z', title: 'Run FACEBOOK_LIST_PAGES', detail: 'Review this facebook action:\n' + JSON.stringify({ service: 'facebook', accountId: 'ca_preview_account', tool: 'FACEBOOK_LIST_PAGES', args: {} }) + '\n\nAccept to allow this exact action once. The approval expires in 15 minutes.' };
    const before = JSON.stringify(request);
    const html = context.cwRequestHtml(request);
    expect(html).toContain('App approval');
    expect(html).toContain('List pages');
    expect(html).toContain('Facebook · Connected account');
    expect(html).toContain('facebook.com.ico');
    expect(html).not.toContain('FACEBOOK_LIST_PAGES');
    expect(html).not.toContain('&quot;accountId&quot;');
    expect(html).not.toContain('args');
    expect(html).toContain('<details class="cw-action-account"><summary>Account details</summary>');
    expect(html).toContain('Connection: ca_preview_account');
    expect(html).toContain('data-cwrequest="review-facebook" data-action="accept"');
    expect(html).toContain('data-action="always-allow"');
    expect(html).not.toContain('data-action="accept" disabled');
    expect(JSON.stringify(request)).toBe(before);
  });

  it('preserves every action input and escapes untrusted values in the review', () => {
    const { context } = ui();
    const args = { to: ['first@example.com', 'second@example.com'], messageBody: 'Complete message '.repeat(50), options: { sendNow: false, subject: '<img src=x onerror=alert(1)>' } };
    const presentation = context.cwAppApprovalPresentation({ kind: 'recommendation', title: 'Run GMAIL_SEND_EMAIL', detail: 'Review this gmail action:\n' + JSON.stringify({ service: 'gmail', accountId: 'ca_<script>', tool: 'GMAIL_SEND_EMAIL', args }) });
    expect(presentation.valid).toBe(true);
    expect(presentation.title).toBe('Send email');
    expect(presentation.html).toContain('<dt>Message body</dt>');
    expect(presentation.html).toContain(args.messageBody);
    expect(presentation.html).toContain('first@example.com');
    expect(presentation.html).toContain('second@example.com');
    expect(presentation.html).toContain('<dt>Send now</dt><dd>No</dd>');
    expect(presentation.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(presentation.html).toContain('ca_&lt;script&gt;');
    expect(presentation.html).not.toContain('<img src=x');
    expect(presentation.html).not.toContain('<script>');
  });

  it('keeps incomplete action reviews from accepting and leaves ordinary recommendations alone', () => {
    const { context } = ui();
    const request = { id: 'review-incomplete', agentId: 'jelly', kind: 'recommendation', status: 'open', createdAt: '2026-10-04T06:00:00Z', title: 'Run GMAIL_SEND_EMAIL', detail: 'Review this gmail action:\n{"service":"gmail","args":' };
    const html = context.cwRequestHtml(request);
    expect(html).toContain('action details are incomplete');
    expect(html).toContain('data-action="accept" disabled');
    expect(html).toContain('data-action="dismiss">Dismiss');
    expect(html).not.toContain('data-action="always-allow"');
    expect(html).not.toContain('&quot;service&quot;');
    const mismatched = { ...request, detail: 'Review this gmail action:\n' + JSON.stringify({ service: 'gmail', accountId: 'ca_preview', tool: 'GMAIL_DELETE_EMAIL', args: {} }) };
    expect(context.cwAppApprovalPresentation(mismatched).valid).toBe(false);
    const ordinary = { ...request, title: 'Try a cleaner layout', detail: 'Use larger images and less text.' };
    expect(context.cwAppApprovalPresentation(ordinary)).toBe(null);
    expect(context.cwRequestHtml(ordinary)).toContain(ordinary.detail);
    expect(context.cwRequestHtml(ordinary)).not.toContain('data-action="accept" disabled');
  });

  it('reviews full stored inputs even when an older bounded description is incomplete', () => {
    const { context } = ui();
    const message = 'Full message '.repeat(300);
    const request = { kind: 'recommendation', title: 'Run GMAIL_SEND_EMAIL', detail: 'Review this gmail action:\n{', appAction: { service: 'gmail', accountId: 'own', tool: 'GMAIL_SEND_EMAIL', args: { message } } };
    const presentation = context.cwAppApprovalPresentation(request);
    expect(presentation.valid).toBe(true);
    expect(presentation.html).toContain(message);
  });

  it('replaces approval follow-up instructions with clear events while preserving other notices', () => {
    const { context } = ui();
    const request = { id: 'review', agentId: 'jelly', kind: 'recommendation', status: 'accepted', resolvedAt: '2026-10-04T06:00:00Z', title: 'Run FACEBOOK_LIST_PAGES', detail: 'Review this facebook action:\n' + JSON.stringify({ service: 'facebook', accountId: 'own', tool: 'FACEBOOK_LIST_PAGES', args: {} }) };
    context.S.cw.requests = [request];
    const before = JSON.stringify(request);
    const confirmation = context.cwSystemEventHtml({ text: 'Recommendation accepted: accepted.', ts: request.resolvedAt });
    expect(confirmation).toContain('You approved List pages');
    expect(confirmation).toContain('Jelly · Facebook');
    const instruction = 'The user responded to your recommendation "Run FACEBOOK_LIST_PAGES": accepted. Continue from that decision and report what you do.';
    const resumed = context.cwSystemEventHtml({ text: 'Follow-up reminder from @Jelly: ' + instruction + '. Act on it with your tools and report the result to the user here.' });
    expect(resumed).toContain('Jelly resumed work');
    expect(resumed).toContain('After your response · List pages · Facebook');
    expect(resumed).not.toContain('FACEBOOK_LIST_PAGES');
    expect(resumed).not.toContain('Act on it with your tools');
    expect(resumed).not.toContain('Continue from that decision');
    expect(JSON.stringify(request)).toBe(before);
    expect(context.cwSystemEventHtml({ text: 'Error: the provider is unavailable.' })).toBe(null);
    const scheduled = context.cwSystemEventHtml({ text: 'Follow-up reminder from @Jelly: Check <img src=x> tomorrow. Act on it with your tools and report the result to the user here.' });
    expect(scheduled).toContain('Scheduled follow-up · Jelly');
    expect(scheduled).toContain('Check &lt;img src=x&gt; tomorrow');
    expect(scheduled).not.toContain('<img src=x>');
  });

  it('shows saved app permissions with their scope and a revoke control', () => {
    const { context } = ui();
    new Script(CONNECTED_APPS_JS).runInContext(context);
    const html = context.cwAppPermissionsHtml([{ id: 'cap-preview', agentName: '<script>', service: 'facebook', tool: 'FACEBOOK_LIST_PAGES', accountId: 'ca_preview_account' }]);
    expect(html).toContain('Always allowed actions');
    expect(html).toContain('List pages');
    expect(html).toContain('@&lt;script&gt; · Facebook');
    expect(html).toContain('data-cwrevokeapp="cap-preview"');
    expect(html).not.toContain('<script>');
    expect(context.cwAppPermissionsHtml([])).toBe('');
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

  it('only exposes a toolkit slug for connected-app icons, with a safe unknown-app fallback', () => {
    const { context } = ui();
    expect(coworkAppService('connected_apps', { service: 'GMAIL', accountId: 'private-account', args: { token: 'private-token' } })).toBe('gmail');
    for (const service of ['https://user:password@example.com', '<script>', 'gmail?token=private', 12]) {
      expect(coworkAppService('connected_apps', { service })).toBeUndefined();
    }
    expect(coworkAppService('read_file', { service: 'gmail' })).toBeUndefined();
    const unknown = context.cwToolIconHtml({ tool: 'connected_apps', appService: 'unknown_app' });
    expect(unknown).toContain('<svg');
    expect(unknown).toContain('Unknown app');
    expect(unknown).not.toContain('<img');
    expect(context.cwToolIconHtml({ tool: 'connected_apps', appService: '<script>' })).not.toContain('<script>');
  });
});
