import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_CSS, COWORK_JS } from '../src/server/ui-cowork.js';
import { credentialChatInput } from '../src/server/credential-chat.js';

function ui() {
  const agents = [{ id: 'chief', name: 'Chief' }];
  const convs = [{ id: 'group', kind: 'group', memberIds: ['chief'] }];
  const cw = { agents, convs, active: 'group', generation: 1, msgs: [], lastSeq: 0, busy: false, computersChecked: Date.now() };
  const input = { value: 'Unsent draft', selectionStart: 4 };
  const mentions = { innerHTML: '', appendChild: vi.fn() };
  const folderRemove = { disabled: false, onclick: null as null | (() => void), getAttribute: (name: string) => name === 'data-cwuntag' ? 'fd-1' : '' };
  const composerFolders = { hidden: true, innerHTML: '', querySelectorAll: (selector: string) => selector === '[data-cwuntag]' ? [folderRemove] : [] };
  const gateway = {
    cwTgFind: { onclick: null as null | (() => void) },
    cwTgSave: { onclick: null as null | (() => void) },
    cwTgChat: { value: '', selectedOptions: [] as { textContent?: string }[], innerHTML: '', onchange: null as null | (() => void) },
    cwTgChatId: { value: '' },
    cwTgToken: { value: '' },
    cwTgOn: { checked: true },
  };
  const elements: Record<string, unknown> = { cwInput: input, cwMentions: mentions, cwComposerFolders: composerFolders, cwMemberNames: { textContent: '' }, ...gateway };
  const streams: Stream[] = [];
  class Stream {
    onopen?: () => void;
    onmessage?: (event: { data: string }) => void;
    onerror?: () => void;
    close = vi.fn();
    constructor(public url: string) { streams.push(this); }
    receive(data: unknown) { this.onmessage?.({ data: JSON.stringify(data) }); }
  }
  const api = vi.fn();
  const modals: { className: string; innerHTML: string }[] = [];
  const context = createContext({
    S: { active: 'cowork', cw }, window: { addEventListener: vi.fn() },
    document: {
      documentElement: { getAttribute: () => 'light' },
      createElement: () => {
        const element = { className: '', innerHTML: '', querySelector: () => ({ onclick: null }), remove: vi.fn(), appendChild: vi.fn() };
        modals.push(element);
        return element;
      },
      body: { appendChild: vi.fn() },
    },
    $: (id: string) => elements[id],
    EventSource: Stream, clearInterval: vi.fn(), api, toast: vi.fn(),
    esc: (s: unknown) => String(s ?? ''),
  });
  new Script(COWORK_JS).runInContext(context);
  const renderProgress = context.cwRenderProgress;
  const renderRail = context.cwRenderRail;
  // Keep the actual snapshot, roster and stream lifecycle code. Rendering the
  // surrounding panels is covered by the browser fixture.
  for (const name of ['cwRenderRail', 'cwRenderMsgs', 'cwRenderInfo', 'cwRenderTyping', 'cwRenderProgress']) context[name] = vi.fn();
  return { context, cw: context.S.cw, input, elements, mentions, composerFolders, folderRemove, streams, api, gateway, modals, renderProgress, renderRail };
}

function desktopUi() {
  const u = ui();
  const timers: { fn: () => void; delay: number }[] = [];
  const controls: Record<string, any> = {};
  const screen: any = { hidden: true, src: '', contentWindow: { postMessage: vi.fn() }, focus: vi.fn(),
    getAttribute: () => screen.src, removeAttribute: vi.fn(() => { screen.src = ''; }) };
  const modal = { setAttribute: vi.fn(), remove: vi.fn(), querySelector: (selector: string) => selector === '[data-desktop]' ? screen : (controls[selector] ??= { focus: vi.fn() }) };
  u.context.AbortController = AbortController;
  u.context.setTimeout = (fn: () => void, delay: number) => { timers.push({ fn, delay }); return timers.length; };
  u.context.clearTimeout = vi.fn();
  u.context.document.createElement = vi.fn(() => modal);
  u.context.document.addEventListener = vi.fn(); u.context.document.removeEventListener = vi.fn();
  u.context.window.removeEventListener = vi.fn(); u.context.window.location = { origin: 'https://gitu.example' };
  return { ...u, timers, controls, screen, modal };
}

describe('Cowork UI live updates', () => {
  it('takes control without waiting for a pending status poll and ignores its late stale response', async () => {
    const u = desktopUi();
    let finishPoll!: (value: unknown) => void;
    u.api.mockResolvedValueOnce({ computer: { state: 'running', control: 'shared' } });
    u.context.cwOpenDesktop('chief');
    await vi.waitFor(() => expect(u.screen.hidden).toBe(false));
    u.api.mockImplementation((_url: string, options?: { body?: string }) => options?.body
      ? Promise.resolve({ computer: { state: 'running', control: 'user' } })
      : new Promise((resolve) => { finishPoll = resolve; }));
    u.timers.at(-1)!.fn();
    const original = u.screen.src;
    await u.controls['[data-control]'].onclick();
    expect(u.api).toHaveBeenCalledTimes(3);
    expect(JSON.parse(u.api.mock.calls[2]![1].body).action).toBe('take-control');
    expect(u.controls['[data-control]'].textContent).toBe('Return to agent');
    expect(u.screen.focus).toHaveBeenCalled();
    expect(u.screen.contentWindow.postMessage).toHaveBeenCalledWith({ type: 'gitu-desktop-control', action: 'focus' }, 'https://gitu.example');
    finishPoll({ computer: { state: 'running', control: 'shared' } });
    await vi.waitFor(() => expect(u.timers).toHaveLength(2));
    expect(u.controls['[data-control]'].textContent).toBe('Return to agent');
    expect(u.screen.src).toBe(original); expect(u.screen.removeAttribute).not.toHaveBeenCalled();
    u.context.cwOpenDesktop('chief');
    expect(u.context.document.createElement).toHaveBeenCalledOnce();
    expect(u.api).toHaveBeenCalledTimes(3);
  });

  it('opens a desktop once for a handoff and lets the user close it without reopening or resuming the agent', async () => {
    const u = desktopUi();
    u.api.mockResolvedValue({ computer: { state: 'running', control: 'user' } });
    const request = { id: 'human-step', conversationId: 'group', agentId: 'chief', desktopHandoff: true, status: 'open' };
    u.context.cwApplySnapshot({ requests: [request] });
    await vi.waitFor(() => expect(u.screen.hidden).toBe(false));
    expect(u.cw.desktopSession.agentId).toBe('chief');
    expect(u.context.cwRequestHtml(request)).toContain('data-cwhandoff="chief"');
    u.context.cwApplySnapshot({ requests: [request] });
    expect(u.context.document.createElement).toHaveBeenCalledOnce();
    u.cw.closeDesktop();
    u.context.cwApplySnapshot({ requests: [request] });
    expect(u.context.document.createElement).toHaveBeenCalledOnce();
    expect(u.api).toHaveBeenCalledOnce();
  });

  it('only opens active-chat handoffs and never replaces a desktop the user already has open', () => {
    const u = ui();
    const open = u.context.cwOpenDesktop = vi.fn();
    const request = { id: 'human-step', conversationId: 'other', agentId: 'chief', desktopHandoff: true, status: 'open' };
    u.context.cwApplySnapshot({ requests: [request] });
    u.context.cwApplySnapshot({ requests: [{ ...request, conversationId: 'group', status: 'answered' }] });
    expect(open).not.toHaveBeenCalled();
    u.cw.desktopSession = { agentId: 'another-agent' };
    u.context.cwApplySnapshot({ requests: [{ ...request, conversationId: 'group' }] });
    expect(open).not.toHaveBeenCalled();
    expect(u.context.cwRequestHtml({ ...request, conversationId: 'group' })).toContain('Open computer');
  });
  it('keeps a live frame connected across status polls and disconnects it on stop or close', async () => {
    const u = ui();
    const timers: { fn: () => void; delay: number }[] = [];
    const controls: Record<string, any> = {};
    const screen: any = { hidden: true, src: '', contentWindow: {}, focus: vi.fn(),
      getAttribute: () => screen.src,
      removeAttribute: vi.fn(() => { screen.src = ''; }),
    };
    const modal = { setAttribute: vi.fn(), remove: vi.fn(), querySelector: (selector: string) => selector === '[data-desktop]' ? screen : (controls[selector] ??= { focus: vi.fn() }) };
    u.context.AbortController = AbortController;
    u.context.setTimeout = (fn: () => void, delay: number) => { timers.push({ fn, delay }); return timers.length; };
    u.context.clearTimeout = vi.fn();
    u.context.document.createElement = () => modal;
    u.context.document.addEventListener = vi.fn();
    u.context.document.removeEventListener = vi.fn();
    u.context.window.removeEventListener = vi.fn();
    u.context.window.location = { origin: 'https://gitu.example' };
    let running = true;
    u.api.mockImplementation(async (_url: string, options?: { body?: string }) => {
      if (options?.body && JSON.parse(options.body).action === 'stop') running = false;
      return { computer: { state: running ? 'running' : 'stopped', useHostComputer: false } };
    });
    u.context.cwOpenDesktop('chief');
    await vi.waitFor(() => expect(screen.hidden).toBe(false));
    expect(screen.src).toBe('/api/cowork/agents/chief/computer/view');
    expect(u.api).toHaveBeenCalledOnce();
    const message = u.context.window.addEventListener.mock.calls.find(([event]: [string]) => event === 'message')[1];
    message({ origin: 'https://evil.example', source: screen.contentWindow, data: { type: 'gitu-desktop', state: 'Live · Shared desktop' } });
    expect(controls['[data-status]'].textContent).toBe('Connecting to live desktop…');
    message({ origin: 'https://gitu.example', source: {}, data: { type: 'gitu-desktop', state: 'Live · Shared desktop' } });
    expect(controls['[data-status]'].textContent).toBe('Connecting to live desktop…');
    message({ origin: 'https://gitu.example', source: screen.contentWindow, data: { type: 'gitu-desktop', state: 'Live · Shared desktop' } });
    const original = screen.src;
    u.api.mockClear();
    timers.at(-1)!.fn();
    await vi.waitFor(() => expect(u.api).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(timers).toHaveLength(2));
    expect(u.api.mock.calls[0][1].body).toBeUndefined();
    expect(screen.src).toBe(original);
    expect(controls['[data-status]'].textContent).toBe('Live · Shared desktop');
    controls['[data-stop]'].onclick();
    expect(screen.src).toBe('');
    await vi.waitFor(() => expect(controls['[data-status]'].textContent).toBe('stopped'));
    u.cw.closeDesktop();
    expect(modal.remove).toHaveBeenCalledOnce();
    expect(u.context.window.removeEventListener).toHaveBeenCalledWith('message', message);
  });
  it('shows only the selected teammate’s threads and their team rooms in the left rail', () => {
    const u = ui();
    u.cw.agents = [{ id: 'mimi', name: 'mimi' }, { id: 'chief', name: 'Chief' }];
    u.cw.convs = [
      { id: 'dm', kind: 'dm', title: 'mimi', memberIds: ['mimi'] },
      { id: 'group', kind: 'group', title: 'Launch room', memberIds: ['chief', 'mimi'] },
      { id: 'other-dm', kind: 'dm', title: 'Chief', memberIds: ['chief'] },
    ];
    u.cw.active = 'dm';
    u.cw.threads = [{ id: 'copy', title: 'Launch copy', topic: 'Landing page only' }];
    const rail = { innerHTML: '', querySelectorAll: () => [] };
    u.elements.cwRail = rail;
    u.elements.cw = { classList: { toggle() {} } };
    u.renderRail();
    expect(rail.innerHTML).toContain('data-agent="mimi"');
    expect(rail.innerHTML).toContain('data-cwthread=""');
    expect(rail.innerHTML).toContain('data-cwthread="copy"');
    expect(rail.innerHTML).toContain('Landing page only');
    expect(rail.innerHTML).toContain('id="cwNewThread"');
    expect(rail.innerHTML).toContain('data-conv="group"');
    expect(rail.innerHTML).not.toContain('data-conv="dm"');
    expect(rail.innerHTML).not.toContain('data-conv="other-dm"');
    expect(rail.innerHTML).toContain('THREADS');
    expect(rail.innerHTML).not.toContain('CHATS');
    u.cw.threadId = 'copy';
    u.renderRail();
    expect(rail.innerHTML).toContain('data-delthread="copy"');
  });

  it('reuses a chief chat after teammates are hired into it', () => {
    const u = ui();
    u.cw.convs = [
      { id: 'chief-chat', kind: 'dm', title: 'Chief', memberIds: ['chief', 'writer'] },
      { id: 'other-chat', kind: 'dm', title: 'Writer', memberIds: ['writer'] },
      { id: 'private-inbox', kind: 'dm', title: 'Chief inbox', memberIds: ['chief'] },
    ];
    u.cw.active = 'other-chat';
    const open = vi.fn();
    u.context.cwOpenConv = open;
    u.context.cwOpenDm('chief');
    expect(open).toHaveBeenCalledWith('chief-chat');
    expect(u.api).not.toHaveBeenCalled();
  });

  it('keeps completed actions visible while work continues and after the run ends', () => {
    const u = ui();
    const history = [
      { id: 'work-1', agentId: 'chief', agentName: 'Chief', tool: 'read_file', ok: true, ts: '2026-09-26T08:00:00Z', publicUpdate: 'Checking the configuration.' },
      { id: 'work-2', agentId: 'chief', agentName: 'Chief', tool: 'run_command', ok: false, ts: '2026-09-26T08:01:00Z', publicUpdate: 'Verifying the integration.' },
    ];
    u.context.cwApplySnapshot({ busy: true, workHistory: history });
    let html = u.context.cwTranscriptHtml() as string;
    expect(html).toContain('Work details · 2 actions');
    expect(html).not.toContain('data-cwworkhistory="group:main:work-1" open');
    expect(html).toContain('Read file');
    expect(html).toContain('! Failed');
    expect(html).toContain('Checking the configuration.');
    expect(html.indexOf('Ran workspace command')).toBeLessThan(html.indexOf('Read file'));
    u.context.cwApplySnapshot({ busy: false, workHistory: history });
    html = u.context.cwTranscriptHtml() as string;
    expect(html).toContain('Work details · 2 actions');
    expect(u.context.cwRenderMsgs).toHaveBeenCalled();
    expect(u.context.cwActivityLabel({ tool: 'run_command', toolOk: false })).toBe('Failed');
    expect(u.context.cwActivityLabel({ tool: 'read_file', toolOk: true })).toBe('Completed');
  });

  it('opens the teammate panel beside a usable chat and switches views on mobile', () => {
    const u = ui();
    const classes = new Set<string>();
    const rail = { inert: false };
    const panel = { style: { display: '' } };
    const chat = { inert: false };
    u.elements.cw = {
      classList: { contains: (name: string) => classes.has(name), toggle: (name: string, on: boolean) => on ? classes.add(name) : classes.delete(name) },
      querySelector: () => rail,
    };
    u.elements.cwInfoPanel = panel;
    u.elements.cwPanelBackdrop = { hidden: true };
    u.elements.cwChat = chat;
    u.cw.infoOpen = true;
    u.context.window.innerWidth = 1120;
    u.context.cwSyncPanels();
    expect(panel.style.display).toBe('none');
    expect(chat.inert).toBe(false);
    u.cw.infoNarrowOpen = true;
    u.context.cwSyncPanels();
    expect(panel.style.display).toBe('block');
    expect(classes.has('overlay-open')).toBe(false);
    expect(classes.has('info-open')).toBe(true);
    expect(chat.inert).toBe(false);
    expect(rail.inert).toBe(false);
    expect((u.elements.cwPanelBackdrop as { hidden: boolean }).hidden).toBe(true);
    u.context.window.innerWidth = 600;
    u.context.cwSyncPanels();
    expect(classes.has('info-open')).toBe(true);
    expect(classes.has('overlay-open')).toBe(false);
    expect(chat.inert).toBe(true);
    u.context.window.innerWidth = 1181;
    u.context.cwSyncPanels();
    expect(panel.style.display).toBe('block');
    expect(classes.has('overlay-open')).toBe(false);
    expect(chat.inert).toBe(false);
  });

  it('shows the active tool alongside the public update and the current todo at a checkpoint', () => {
    const u = ui();
    const text = { textContent: '', hidden: false };
    const reasoning = { textContent: '', hidden: true, scrollHeight: 0, scrollTop: 0, clientHeight: 0 };
    const label = { textContent: '' };
    const indicator = { className: 'activity-indicator' };
    const icon = { innerHTML: '' };
    const toggle = vi.fn();
    const nodes: Record<string, unknown[]> = {
      '.cw-progress-text': [text], '.cw-progress-activity .wtext': [label],
      '.cw-progress-activity': [indicator], '.cw-progress-activity .cw-tool-ico': [icon],
      '.cw-live-bubble': [{ classList: { toggle } }],
      '.reasoning-stream': [reasoning],
    };
    u.elements.cwMsgs = { scrollHeight: 100, scrollTop: 0, clientHeight: 100 };
    u.elements.cwLive = { hidden: true, innerHTML: '', querySelectorAll: (selector: string) => nodes[selector] };
    u.cw.busy = true;
    u.cw.progresses = [{ agentId: 'chief', agentName: 'Chief', tool: 'run_command', text: 'Verifying the client integration.' }];
    u.renderProgress();
    expect(text.textContent).toBe('Running a check in the workspace…\nVerifying the client integration.');
    expect(toggle).toHaveBeenLastCalledWith('has-tool', true);
    u.cw.progresses[0].tool = '';
    u.cw.progresses[0].text = 'Continuing automatically (checkpoint 11)…';
    u.cw.todos = [{ agentId: 'chief', status: 'in_progress', text: 'Verifying client integration' }];
    u.renderProgress();
    expect(text.textContent).toBe('Verifying client integration');
    expect(toggle).toHaveBeenLastCalledWith('has-tool', false);
    u.cw.progresses[0].reasoning = 'Reviewing the connection evidence.';
    u.cw.progresses[0].phase = 'reasoning';
    u.renderProgress();
    expect(reasoning.textContent).toBe('Reviewing the connection evidence.');
    expect(reasoning.hidden).toBe(false);
    u.cw.progresses[0].reasoning = '';
    u.renderProgress();
    expect(reasoning.hidden).toBe(true);
  });

  it('shows repeated continuation checkpoints as one expandable history entry', () => {
    const u = ui();
    u.cw.msgs = Array.from({ length: 9 }, (_, index) => ({
      id: `checkpoint-${index + 2}`,
      role: 'system',
      text: `Mailcow Maintainers is continuing automatically after checkpoint ${index + 2}.`,
      ts: new Date(Date.UTC(2026, 8, 25, 8, index)).toISOString(),
    }));
    const html = u.context.cwTranscriptHtml() as string;
    expect(html.match(/class="cw-checkpoints"/g)).toHaveLength(1);
    expect(html).toContain('9 checkpoints completed');
    expect(html).toContain('View history');
    expect(html).toContain('Checkpoint 10');
    expect(html).not.toContain('is continuing automatically after checkpoint');
  });

  it('shows checkpoint accomplishments and next steps outside collapsed tool details', () => {
    const u = ui();
    u.cw.busy = true;
    u.cw.workHistory = [{ id: 'edit', agentId: 'chief', tool: 'apply_edit', ok: true, ts: '2026-09-26T08:00:00Z' }];
    u.cw.msgs = [{ id: 'summary', role: 'system', agentId: 'chief', ts: '2026-09-26T08:01:00Z', checkpoint: { number: 2, accomplished: 'Updated the reconnect handler.', issues: 'The integration check found a connection problem.', next: 'Fix the connection and rerun the check.' } }];
    const html = u.context.cwTranscriptHtml() as string;
    expect(html).toContain('<section class="cw-checkpoint-report"');
    expect(html).toContain('Progress update');
    expect(html).toContain('Updated the reconnect handler.');
    expect(html).toContain('Needs attention:');
    expect(html).toContain('Fix the connection and rerun the check.');
    expect(html).toContain('Work details · 1 action');
    expect(html.indexOf('Progress update')).toBeLessThan(html.indexOf('Work details'));
    expect(html).not.toContain('data-cwworkhistory="group:main:edit" open');
    expect(html).not.toContain('checkpoints completed');
  });

  it('keeps safe drafts separate by conversation and thread', () => {
    const u = ui();
    const values = new Map<string, string>();
    u.context.localStorage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    u.context.credentialChatInput = credentialChatInput;
    (u.input as any).style = { height: '' };
    (u.input as any).scrollHeight = 40;
    u.input.value = 'First draft sk-proj-abcdefghijklmnopqrstuvwxyz';
    u.context.cwSaveDraft();
    expect([...values.values()][0]).toContain('[credential removed');
    expect([...values.values()][0]).not.toContain('sk-proj-abcdefghijklmnopqrstuvwxyz');

    u.cw.threadId = 'thread-1';
    u.input.value = 'Thread draft';
    u.context.cwSaveDraft();
    u.cw.active = 'other-chat';
    u.input.value = '';
    u.context.cwRestoreDraft(u.input);
    expect(u.input.value).toBe('');

    u.cw.active = 'group';
    u.context.cwRestoreDraft(u.input);
    expect(u.input.value).toBe('Thread draft');
    u.cw.threadId = null;
    u.context.cwRestoreDraft(u.input);
    expect(u.input.value).toContain('[credential removed');
  });

  it('offers queue and stop separately when a reply is in progress', () => {
    const u = ui();
    const classes = new Set<string>();
    const send = {
      disabled: false, title: '', innerHTML: '', onclick: null,
      classList: { toggle: (name: string, enabled: boolean) => enabled ? classes.add(name) : classes.delete(name) },
      setAttribute: vi.fn(),
    };
    const stop = { hidden: true };
    u.elements.cwSend = send;
    u.elements.cwStop = stop;

    u.cw.busy = true;
    u.context.cwRenderComposerAction();
    expect(send.title).toContain('Queue');
    expect(classes.has('queue')).toBe(true);
    expect(stop.hidden).toBe(false);

    u.input.value = '';
    u.context.cwRenderComposerAction();
    expect(send.title).toBe('Stop the team');
    expect(classes.has('stop')).toBe(true);
    expect(stop.hidden).toBe(true);

    u.cw.busy = false;
    u.context.cwRenderComposerAction();
    expect(send.disabled).toBe(true);
    expect(classes.size).toBe(0);
  });

  it('includes direct-computer permission, member picker, work cards and document previews', () => {
    expect(COWORK_JS).toContain('id="cwAmHost"');
    expect(COWORK_JS).toContain('function cwAddMemberModal');
    expect(COWORK_JS).not.toContain("prompt('Add member");
    expect(COWORK_JS).toContain('data-cwrequest');
    expect(COWORK_JS).toContain('/api/cowork/artifacts/');
    expect(COWORK_JS).toContain('id="cwFile"');
    expect(COWORK_JS).toContain('id="cwTgChatId"');
    expect(COWORK_JS).toContain('Telegram user or group chat ID');
  });

  it('saves the Telegram gateway into cowork state, not the id="cw" DOM element', async () => {
    const u = ui();
    u.api.mockResolvedValue({
      ok: true,
      conversation: { id: 'group', kind: 'group', memberIds: ['chief'], telegram: { enabled: true, chatId: '42', chatTitle: 'Taskium', tokenSaved: true } },
    });
    u.context.cwAgentGatewayHtml(u.cw.convs[0]).bind();
    u.gateway.cwTgSave.onclick!();
    await vi.waitFor(() => expect((u.cw.convs[0] as any).telegram.enabled).toBe(true));
    expect(u.api).toHaveBeenCalledWith('/api/cowork/conversations/group', expect.objectContaining({ method: 'POST' }));
  });

  it('wears the right icon for each tool and each MCP brand', () => {
    const u = ui();
    // Browsing shows the site's favicon (with the globe glyph underneath).
    const browse = u.context.cwToolIconHtml({ tool: 'browse', webUrl: 'https://www.piki.example' });
    expect(browse).toContain('icons.duckduckgo.com/ip3/www.piki.example.ico');
    expect(browse).toContain('title="Browsing www.piki.example"');
    // A path, query or fragment from the browsed page never travels with it.
    const secret = u.context.cwToolIconHtml({ tool: 'web_fetch', webUrl: 'https://www.piki.example/hidden/page?token=private#frag' });
    expect(secret).toContain('title="Browsing www.piki.example"');
    expect(secret).not.toContain('hidden/page');
    expect(secret).not.toContain('token=private');
    expect(secret).not.toContain('frag');
    // Commands get the terminal; the command text never reaches the icon.
    const run = u.context.cwToolIconHtml({ tool: 'run_command', detail: '$ npm test' });
    expect(run).toContain('title="Running a command"');
    expect(run).not.toContain('npm test');
    expect(run).not.toContain('duckduckgo');
    // File work gets the eye/edit/folder/search set with friendly titles.
    expect(u.context.cwToolIconHtml({ tool: 'read_file' })).toContain('title="Reading a file"');
    expect(u.context.cwToolIconHtml({ tool: 'apply_edit' })).toContain('title="Editing a file"');
    expect(u.context.cwToolIconHtml({ tool: 'search_files' })).toContain('title="Searching files"');
    // MCP calls wear the server's own mark when the name is a known brand…
    const github = u.context.cwToolIconHtml({ tool: 'mcp_call', mcpServer: 'github' });
    expect(github).toContain('icons.duckduckgo.com/ip3/github.com.ico');
    expect(github).toContain('title="github · MCP"');
    // …and the plug glyph for unknown servers.
    const custom = u.context.cwToolIconHtml({ tool: 'mcp_call', mcpServer: 'acme-internal' });
    expect(custom).not.toContain('duckduckgo');
    expect(custom).toContain('<svg');
    // No tool means no chip at all.
    expect(u.context.cwToolIconHtml({ phase: 'thinking' })).toBe('');
  });

  it('tracks the phase for the animated dot and keeps tool labels neutral', () => {
    const u = ui();
    expect(u.context.cwProgressPhase({ phase: 'thinking' })).toBe('thinking');
    expect(u.context.cwProgressPhase({ phase: 'reasoning' })).toBe('reasoning');
    expect(u.context.cwProgressPhase({ phase: 'responding' })).toBe('responding');
    expect(u.context.cwProgressPhase({ tool: 'run_command', phase: 'responding' })).toBe('working');
    expect(u.context.cwProgressPhase({})).toBe('thinking');
    // Commands, paths and tool names never become label text.
    expect(u.context.cwActivityLabel({ tool: 'run_command', detail: '$ npm test' })).toBe('Working…');
    expect(u.context.cwActivityLabel({ tool: 'read_file', detail: 'read src/app.ts' })).toBe('Working…');
    expect(u.context.cwActivityLabel({ phase: 'reasoning' })).toBe('Reasoning…');
    expect(u.context.cwActivityLabel({ phase: 'responding' })).toBe('Responding…');
  });

  it('includes the phase dot, tool icons and streaming caret in the UI bundles', () => {
    expect(COWORK_JS).toContain('function cwToolIconHtml');
    expect(COWORK_JS).toContain('CW_MCP_DOMAINS');
    expect(COWORK_JS).toContain('cw-phase-dot');
    expect(COWORK_JS).toContain('cwProgressPhase');
    expect(COWORK_CSS).toContain('phase-reasoning');
    expect(COWORK_CSS).toContain('phase-responding');
    expect(COWORK_CSS).toContain('cwcaret');
    expect(COWORK_CSS).toContain('.cw-tool-ico .cw-fav');
  });

  it('tracks threads, folders and widgets from live snapshots', () => {
    const u = ui();
    u.context.cwStartStream('group');
    u.streams[0]!.receive({
      busy: false,
      messages: [],
      threadId: null,
      threads: [{ id: 'th-1', title: 'Launch copy' }],
      folders: [{ id: 'fd-1', label: 'site', path: 'C:/site' }],
      widgets: [{ id: 'wg-1', title: 'Build', kind: 'progress', data: { value: 40 } }],
    });
    expect(u.streams[0]!.url).toContain('thread=main');
    expect(u.cw.threads.map((thread: any) => thread.title)).toEqual(['Launch copy']);
    expect(u.cw.folders[0].label).toBe('site');
    expect(u.composerFolders.hidden).toBe(false);
    expect(u.composerFolders.innerHTML).toContain('cw-folder-tag');
    expect(u.composerFolders.innerHTML).toContain('site');
    expect(u.composerFolders.innerHTML).toContain('C:/site');
    expect(u.composerFolders.innerHTML).toContain('data-cwuntag="fd-1"');
    expect(u.cw.widgets[0].title).toBe('Build');
  });

  it('untags composer folders without losing the remaining tags', async () => {
    const u = ui();
    u.cw.folders = [
      { id: 'fd-1', label: 'site', path: 'C:/site' },
      { id: 'fd-2', label: 'docs', path: 'C:/docs' },
    ];
    u.api.mockResolvedValue({ ok: true });
    u.context.cwRenderFolders();
    u.folderRemove.onclick?.();
    await Promise.resolve();
    await Promise.resolve();

    expect(u.api).toHaveBeenCalledWith('/api/cowork/conversations/group/folders/fd-1', { method: 'DELETE' });
    expect(u.cw.folders.map((folder: any) => folder.id)).toEqual(['fd-2']);
    expect(u.composerFolders.hidden).toBe(false);
  });

  it('keeps tagged folders when a partial live snapshot omits them', () => {
    const u = ui();
    u.cw.folders = [{ id: 'fd-1', label: 'site', path: 'C:/site' }];
    u.context.cwStartStream('group');
    u.streams[0]!.receive({ busy: false, messages: [] });
    expect(u.cw.folders.map((folder: any) => folder.id)).toEqual(['fd-1']);
  });


  it('includes the sub-agent worker tree in the cowork UI', () => {
    expect(COWORK_JS).toContain('function cwSubAgentTreeHtml');
    expect(COWORK_JS).toContain('cw-tnode');
    expect(COWORK_JS).toContain('Worker tree');
    expect(COWORK_JS).toContain('Evidence gate:');
    // The animation lives with the stylesheet.
    expect(COWORK_CSS).toContain('cwtnode-in');
    expect(COWORK_CSS).toContain('.cw-tnode.running .cw-tdot');
  });

  it('renders the live sub-agent execution tree from snapshots', () => {
    const u = ui();
    u.context.cwStartStream('group');
    const tree = {
      conversationId: 'group',
      nodes: [
        { id: 'csa-1', parentAgentId: 'chief', rootAgentId: 'chief', missionId: 'cm-1', depth: 2, role: 'competitor-researcher', objective: 'Compare Piki POS', status: 'running', spend: { costUsd: 0.13, turns: 2 }, grantedBudget: { maxCostUsd: 0.5 }, children: [] },
        { id: 'csa-2', parentAgentId: 'chief', rootAgentId: 'chief', missionId: 'cm-1', depth: 2, role: 'campaign-writer', objective: 'Write the brief', status: 'completed', spend: { costUsd: 0.2, turns: 3 }, grantedBudget: { maxCostUsd: 0.4 }, evidence: { passed: 2, total: 2, accepted: true }, children: [] },
      ],
      totals: { active: 1, blocked: 0, completed: 1, failed: 0, terminated: 0, orphaned: 0, spendUsd: 0.33 },
    };
    u.streams[0]!.receive({ busy: true, messages: [], missions: [], subAgents: tree });
    expect(u.cw.subAgents.nodes).toHaveLength(2);
    expect((u.context.cwRenderInfo as any).mock.calls.length).toBeGreaterThan(0);

    // The renderer groups workers under their parent with spend and the gate verdict.
    const html = u.context.cwSubAgentTreeHtml(u.cw.convs[0], 'cm-1');
    expect(html).toContain('@Chief');
    expect(html).toContain('competitor-researcher');
    expect(html).toContain('cw-tnode running');
    expect(html).toContain('$0.13 / $0.50');
    expect(html).toContain('verified 2/2');
    // Unscoped to a mission it stays hidden (ad-hoc rendering is separate).
    expect(u.context.cwSubAgentTreeHtml(u.cw.convs[0], null)).toBe('');

    // An unchanged tree does not re-render the panel.
    const calls = (u.context.cwRenderInfo as any).mock.calls.length;
    u.streams[0]!.receive({ busy: true, messages: [], missions: [], subAgents: tree });
    expect((u.context.cwRenderInfo as any).mock.calls.length).toBe(calls);

    // A status flip re-renders exactly once.
    const flipped = { ...tree, nodes: [tree.nodes[0], { ...tree.nodes[1], status: 'failed' }] };
    u.streams[0]!.receive({ busy: true, messages: [], missions: [], subAgents: flipped });
    expect((u.context.cwRenderInfo as any).mock.calls.length).toBe(calls + 1);
  });

  it('updates teammates during a partial reply without replacing the composer', () => {
    const u = ui();
    u.context.cwStartStream('group');
    u.streams[0]!.onopen?.();
    u.streams[0]!.receive({
      busy: true, messages: [], rosterRevision: 2,
      progress: { agentId: 'chief', agentName: 'Chief', text: 'The new teammate' },
      roster: {
        agents: [...u.cw.agents, { id: 'scout', name: 'Scout' }],
        conversations: [{ id: 'group', kind: 'group', memberIds: ['chief', 'scout'] }],
      },
    });
    expect(u.cw.agents.map((a: any) => a.name)).toEqual(['Chief', 'Scout']);
    expect(u.mentions.appendChild.mock.calls.map(([button]) => button.textContent)).toEqual(['@Chief', '@Scout']);
    expect(u.cw.progress.text).toBe('The new teammate');
    expect(u.input).toEqual({ value: 'Unsent draft', selectionStart: 4 });
  });

  it('keeps simultaneous teammate progress in the live snapshot', () => {
    const u = ui();
    u.context.cwStartStream('group');
    u.streams[0]!.receive({
      busy: true,
      messages: [],
      progresses: [
        { agentId: 'chief', agentName: 'Chief', text: 'Coordinating' },
        { agentId: 'scout', agentName: 'Scout', text: 'Researching' },
      ],
    });
    expect(u.cw.progresses.map((progress: any) => progress.agentName)).toEqual(['Chief', 'Scout']);
  });

  it('deduplicates replayed messages after reconnect and clears the live reply on completion', () => {
    const u = ui();
    u.context.cwStartStream('group');
    const stream = u.streams[0]!;
    stream.receive({ busy: true, messages: [{ seq: 1, text: 'Hello' }], progress: { text: 'Answer' } });
    stream.receive({ busy: false, messages: [{ seq: 1, text: 'Hello' }, { seq: 2, text: 'Answer complete' }] });
    expect(u.cw.msgs.map((m: any) => m.text)).toEqual(['Hello', 'Answer complete']);
    expect(u.cw.lastSeq).toBe(2);
    expect(u.cw.progress).toBeNull();
    expect(u.cw.busy).toBe(false);
  });

  it('ignores late stream events after switching away and back to the same chat', () => {
    const u = ui();
    u.context.cwStartStream('group');
    const stale = u.streams[0]!;
    u.context.cwStopPoll();
    u.context.cwStartStream('group');
    stale.onopen?.();
    stale.receive({ busy: true, messages: [{ seq: 99, text: 'Stale reply' }] });
    expect(stale.close).toHaveBeenCalledOnce();
    expect(u.cw.streamOpen).toBe(false);
    expect(u.cw.msgs).toEqual([]);
    u.streams[1]!.onopen?.();
    u.streams[1]!.receive({ busy: true, messages: [{ seq: 1, text: 'Current reply' }] });
    expect(u.cw.msgs.map((m: any) => m.text)).toEqual(['Current reply']);
  });

  it('opens PDF previews without the sandbox attribute that blocks the built-in viewer', () => {
    const u = ui();
    u.cw.artifacts = [{ id: 'cf-pdf', name: 'report.pdf', mime: 'application/pdf', size: 2048 }];
    u.context.cwPreviewFile('cf-pdf');
    const modal = u.modals.at(-1)!;
    expect(modal.innerHTML).toContain('/api/cowork/artifacts/cf-pdf/preview');
    expect(modal.innerHTML).not.toContain('sandbox');
  });

  it('keeps other previews sandboxed and offers Open for every file type', () => {
    const u = ui();
    u.cw.artifacts = [{ id: 'cf-zip', name: 'bundle.zip', mime: 'application/zip', size: 512 }];
    u.context.cwPreviewFile('cf-zip');
    expect(u.modals.at(-1)!.innerHTML).toContain('sandbox="allow-downloads allow-popups allow-popups-to-escape-sandbox"');
    expect(u.modals.at(-1)!.innerHTML).toContain('/preview?theme=light&amp;embedded=1');
    expect(u.context.cwFilesHtml(['cf-zip'])).toContain('data-cwpreview="cf-zip"');
  });

  it('renders media artifacts inline: image thumbnails and audio/video players', () => {
    const u = ui();
    u.cw.artifacts = [
      { id: 'cf-img', name: 'shot.png', mime: 'image/png', size: 10 },
      { id: 'cf-aud', name: 'clip.mp3', mime: 'audio/mpeg', size: 10 },
      { id: 'cf-vid', name: 'clip.mp4', mime: 'video/mp4', size: 10 },
      { id: 'cf-doc', name: 'report.pdf', mime: 'application/pdf', size: 10 },
    ];
    const html = u.context.cwFilesHtml(['cf-img', 'cf-aud', 'cf-vid', 'cf-doc']);
    expect(html).toContain('<img class="cw-thumb"');
    expect(html).toContain('/api/cowork/artifacts/cf-img?inline=1');
    expect(html).toContain('<audio class="cw-media" controls');
    expect(html).toContain('<video class="cw-media" controls');
    // PDFs stay on the Open/Preview path; only real media streams inline.
    expect(html).not.toContain('cf-doc?inline=1');
  });

  it('uses polling when streaming fails and rejects a stale poll once streaming resumes', async () => {
    const u = ui();
    let resolve!: (value: unknown) => void;
    u.api.mockReturnValue(new Promise(done => { resolve = done; }));
    u.context.cwStartStream('group');
    const stream = u.streams[0]!;
    stream.onerror?.();
    const pending = u.cw.pollPromise;
    expect(u.api).toHaveBeenCalledOnce();
    stream.onopen?.();
    stream.receive({ busy: false, messages: [{ seq: 1, text: 'Finished' }] });
    resolve({ busy: true, messages: [], progress: { text: 'Old partial reply' } });
    await pending;
    expect(u.cw.progress).toBeNull();
    expect(u.cw.busy).toBe(false);
    expect(u.cw.msgs).toHaveLength(1);
  });
});
