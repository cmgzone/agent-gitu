import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_JS } from '../src/server/ui-cowork.js';
import { COWORK_NOW_JS } from '../src/server/ui-cowork-now.js';
import { COWORK_WORKBENCH_CSS, COWORK_WORKBENCH_JS } from '../src/server/ui-cowork-workbench.js';

function overview() {
  const conv = { id: 'chat', title: 'Gitu', schedule: { enabled: true, every: '1d' } };
  const state = {
    active: 'chat', requests: [{ id: 'open', status: 'open', title: 'Review the draft' }, { id: 'old', status: 'accepted', title: 'Old request' }],
    todos: [{ id: 'task', text: 'Check the release', status: 'in_progress', agentId: 'gitu' }, { id: 'finished', text: 'Finished', status: 'done' }],
    widgets: [{ id: 'panel', title: 'Release notes' }],
  };
  const input = { value: 'My existing draft', style: { height: '' }, scrollHeight: 72, focus: vi.fn() };
  const elements = { cwInput: input };
  const context = createContext({
    cwEnsure: () => state, cwActiveConv: () => conv,
    cwAgentById: () => ({ name: 'Gitu' }), cwWidgetSummary: () => 'Pinned notes',
    $: (id: keyof typeof elements) => elements[id],
    cwClosePanels: vi.fn(), cwSaveDraft: vi.fn(), cwRenderComposerAction: vi.fn(),
    cwWidgetModal: vi.fn(), cwScheduleModal: vi.fn(), cwSend: vi.fn(), api: vi.fn(),
  });
  new Script(COWORK_NOW_JS).runInContext(context);
  context.cwSetOverview = vi.fn();
  return { context, state, input, conv };
}

function floatingComposer() {
  const state = {};
  let height = 120;
  let observerCallback = () => {};
  const disconnect = vi.fn(), observe = vi.fn();
  const messages = { scrollHeight: 1000, scrollTop: 200, clientHeight: 500 };
  const setProperty = vi.fn();
  const wrapper = { isConnected: true, getBoundingClientRect: () => ({ height }) };
  const elements = { cwChat: { style: { setProperty } }, cwComposerWrap: wrapper, cwMsgs: messages };
  const context = createContext({ cwEnsure: () => state, $: (id: keyof typeof elements) => elements[id],
    ResizeObserver: class { constructor(callback: () => void) { observerCallback = callback; } disconnect = disconnect; observe = observe; },
  });
  new Script(COWORK_NOW_JS).runInContext(context);
  return { context, messages, wrapper, disconnect, observe, setProperty,
    resize: (nextHeight: number) => { height = nextHeight; observerCallback(); } };
}

describe('Floating Cowork composer', () => {
  it('keeps room for a growing input without moving someone reading earlier messages', () => {
    const u = floatingComposer();
    u.context.cwBindFloatingComposer();
    expect(u.setProperty).toHaveBeenLastCalledWith('--cw-composer-height', '120px');
    u.resize(210);
    expect(u.setProperty).toHaveBeenLastCalledWith('--cw-composer-height', '210px');
    expect(u.messages.scrollTop).toBe(200);
    u.messages.scrollTop = 500;
    u.resize(240);
    expect(u.messages.scrollTop).toBe(u.messages.scrollHeight);
  });

  it('releases the previous observer when chats change and ignores removed inputs', () => {
    const u = floatingComposer();
    u.context.cwBindFloatingComposer();
    u.context.cwBindFloatingComposer();
    expect(u.disconnect).toHaveBeenCalledOnce();
    expect(u.observe).toHaveBeenCalledTimes(2);
    const calls = u.setProperty.mock.calls.length;
    u.wrapper.isConnected = false;
    u.resize(280);
    expect(u.setProperty).toHaveBeenCalledTimes(calls);
  });
});

describe('Cowork Now overview', () => {
  it('shows real open work and hides resolved requests and completed tasks', () => {
    const u = overview();
    expect(Array.from(u.context.cwNowCards(), (card: { id: string }) => card.id)).toEqual(['open', 'task', 'chat', 'panel']);
    u.context.cwActiveConv = () => null;
    expect(u.context.cwNowCards()).toHaveLength(0);
  });

  it('prepares an update while preserving the draft and never sends automatically', () => {
    const u = overview();
    u.context.cwNowAction('todo', 'task');
    expect(u.input.value).toBe('My existing draft\nGive me an update on: Check the release');
    expect(u.context.cwSaveDraft).toHaveBeenCalledOnce();
    expect(u.input.focus).toHaveBeenCalledOnce();
    expect(u.context.cwSend).not.toHaveBeenCalled();
    expect(u.context.api).not.toHaveBeenCalled();
  });

  it('ignores stale cards after a conversation changes', () => {
    const u = overview();
    u.state.todos = [];
    u.state.widgets = [];
    u.context.cwNowAction('todo', 'task');
    u.context.cwNowAction('widget', 'panel');
    u.context.cwNowAction('schedule', 'another-chat');
    u.context.cwNowAction('request', 'old');
    expect(u.input.value).toBe('My existing draft');
    expect(u.context.cwWidgetModal).not.toHaveBeenCalled();
    expect(u.context.cwScheduleModal).not.toHaveBeenCalled();
    expect(u.context.cwSetOverview).not.toHaveBeenCalled();
  });

  it('opens existing panel and schedule controls without mutating data', () => {
    const u = overview();
    u.context.cwNowAction('widget', 'panel');
    u.context.cwNowAction('schedule', 'chat');
    expect(u.context.cwWidgetModal).toHaveBeenCalledWith('panel');
    expect(u.context.cwScheduleModal).toHaveBeenCalledWith(u.conv);
    expect(u.context.api).not.toHaveBeenCalled();
  });

  it('keeps the full composed browser script syntactically valid', () => {
    expect(() => new Script(COWORK_JS)).not.toThrow();
  });
});

function coworkProjectWorkbench() {
  const cwState: Record<string, any> = { active: 'chat', convs: [], msgs: [], workbench: undefined };
  const S: Record<string, any> = { active: 'cowork', settings: { projectPath: '' }, cw: cwState };
  const elements: Record<string, any> = {
    cwProjectBtn: { title: '', innerHTML: '' },
    cwProjectMenu: { innerHTML: '', querySelectorAll: () => [], hidePopover: vi.fn() },
    cwWorkbench: { hidden: true, innerHTML: '' },
    cwWbEditor: { value: '', selectionStart: 0, selectionEnd: 0 },
    cwWbInstruction: { value: '', placeholder: '' },
    cwWbAsk: { textContent: 'Ask', onclick: null as null | (() => void) },
  };
  const api = vi.fn(async (url: string, opts?: any) => {
    if (url === '/api/runs/run-42') {
      return {
        runId: 'run-42',
        status: 'running',
        project: 'demo-app',
        projectPath: '/workspace/demo-app',
        goal: 'Implement auth flow',
        branch: 'feat/auth',
        mode: 'build',
        report: 'Working on login form',
        files: [{ path: 'src/auth.ts' }],
      };
    }
    if (url === '/api/runs/run-42/message') return { ok: true, opts };
    return { ok: true };
  });
  const context = createContext({
    S,
    cwEnsure: () => cwState,
    cwActiveConv: () => ({ id: 'chat', kind: 'dm', memberIds: ['gitu'], title: 'Gitu' }),
    $: (id: string) => elements[id] || null,
    esc: (v: unknown) => String(v ?? ''),
    cwIcon: (name: string) => `[${name}]`,
    toast: vi.fn(),
    updateProjChip: vi.fn(),
    api,
  });
  new Script(COWORK_WORKBENCH_JS).runInContext(context);
  return { context, cwState, S, elements, api };
}

describe('In-Cowork project & behind-the-scenes inspector', () => {
  it('places #cwProjectBtn and #cwProjectMenu outside .cw-composer in #cwComposerTopline', () => {
    const toplineIdx = COWORK_JS.indexOf('<div class="cw-composer-topline" id="cwComposerTopline">');
    const projBtnIdx = COWORK_JS.indexOf('id="cwProjectBtn"');
    const projMenuIdx = COWORK_JS.indexOf('id="cwProjectMenu"');
    const composerIdx = COWORK_JS.indexOf('<div class="cw-composer">');

    expect(toplineIdx).toBeGreaterThan(-1);
    expect(projBtnIdx).toBeGreaterThan(toplineIdx);
    expect(projMenuIdx).toBeGreaterThan(projBtnIdx);
    expect(composerIdx).toBeGreaterThan(projMenuIdx);

    const composerSegment = COWORK_JS.slice(composerIdx, composerIdx + 700);
    expect(composerSegment).not.toContain('cwProjectBtn');
    expect(composerSegment).not.toContain('cwProjectMenu');

    expect(COWORK_WORKBENCH_CSS).toContain('.cw .cw-composer-wrap > .cw-composer-topline');
    expect(COWORK_WORKBENCH_CSS).toContain('.cw-project-menu button.cw-project-item');
    expect(COWORK_WORKBENCH_CSS).toContain('button.cw-project-item[data-cwproj-action]');
  });

  it('syncs the active project in Cowork without leaving Cowork and renders the composer pill', () => {
    const u = coworkProjectWorkbench();
    u.context.cwSyncActiveProject('/workspace/demo-app', 'demo-app');
    expect(u.cwState.activeProjectPath).toBe('/workspace/demo-app');
    expect(u.S.settings.projectPath).toBe('/workspace/demo-app');
    expect(u.S.active).toBe('cowork');
    expect(u.elements.cwProjectBtn.innerHTML).toContain('demo-app');
    expect(u.elements.cwProjectMenu.innerHTML).toContain('demo-app');
    expect(u.api).toHaveBeenCalledWith('/api/model-selection', {
      method: 'POST',
      body: JSON.stringify({ projectPath: '/workspace/demo-app' }),
    });
  });

  it('opens background coding task inspection in #cwWorkbench and steers via POST /api/runs/<id>/message', async () => {
    const u = coworkProjectWorkbench();
    await u.context.cwInspectCodingTask('run-42');
    expect(u.S.active).toBe('cowork');
    expect(u.cwState.workbench.open).toBe(true);
    expect(u.elements.cwWorkbench.hidden).toBe(false);
    expect(u.elements.cwWorkbench.innerHTML).toContain('Implement auth flow');
    expect(u.elements.cwWorkbench.innerHTML).toContain('src/auth.ts');
    const activeItem = u.cwState.workbench.items[u.cwState.workbench.activeIndex];
    expect(activeItem.runId).toBe('run-42');

    u.elements.cwWbInstruction.value = 'Focus on unit tests next';
    u.elements.cwWbAsk.onclick?.();
    await Promise.resolve();
    expect(u.api).toHaveBeenCalledWith('/api/runs/run-42/message', {
      method: 'POST',
      body: JSON.stringify({ text: 'Focus on unit tests next', delivery: 'steer' }),
    });
  });

  it('streams conversational coding updates, diffs, tool output, structured reports, and closes SSE on Close', async () => {
    const cwState: Record<string, any> = {
      active: 'chat',
      convs: [],
      msgs: [],
      codingTasks: [
        { runId: 'run-99', status: 'running', goal: 'Stream <script>x</script> auth changes', project: 'demo-app' },
        { runId: 'run-98', status: 'completed', goal: 'Previous migration', project: 'demo-app' },
      ],
    };
    const streams: any[] = [];
    class MockEventSource {
      url: string;
      onmessage: ((e: any) => void) | null = null;
      onerror: (() => void) | null = null;
      listeners: Record<string, Array<() => void>> = {};
      closed = false;
      constructor(url: string) {
        this.url = url;
        streams.push(this);
      }
      addEventListener(type: string, fn: () => void) {
        (this.listeners[type] ||= []).push(fn);
      }
      close() {
        this.closed = true;
      }
      emit(payload: unknown) {
        this.onmessage?.({ data: JSON.stringify(payload) });
      }
    }

    const railBtnClicks: Array<() => void> = [];
    const elements: Record<string, any> = {
      cwProjectBtn: { title: '', innerHTML: '' },
      cwProjectMenu: { innerHTML: '', querySelectorAll: () => [], hidePopover: vi.fn() },
      cwWorkbench: { hidden: true, innerHTML: '' },
      cwWbInstruction: { value: '', placeholder: '', onkeydown: null },
      cwWbAsk: { textContent: 'Ask', onclick: null },
      cwWbClose: { onclick: null },
      cwWbMeta: { innerHTML: '' },
      cwWbFeed: {
        innerHTML: '',
        scrollTop: 0,
        scrollHeight: 200,
        clientHeight: 200,
        querySelectorAll: () => [],
      },
      cwWbStreamTxt: { innerHTML: '' },
      cwRailCoding: {
        innerHTML: '',
        querySelectorAll: () =>
          cwState.codingTasks.map((t: any) => ({
            getAttribute: (k: string) => (k === 'data-main-coding-task' ? t.runId : ''),
            set onclick(fn: (e?: any) => void) {
              railBtnClicks.push(() => fn({}));
            },
          })),
      },
    };

    const api = vi.fn(async (url: string) => {
      if (url === '/api/runs/run-99') {
        return {
          runId: 'run-99',
          status: 'running',
          project: 'demo-app',
          goal: 'Stream <script>x</script> auth changes',
          branch: 'feat/stream',
          mode: 'build',
          files: [],
        };
      }
      return { ok: true };
    });

    const esc = (v: unknown) =>
      String(v ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;');

    const context = createContext({
      S: { active: 'cowork', settings: { projectPath: '' }, cw: cwState },
      cwEnsure: () => cwState,
      cwActiveConv: () => ({ id: 'chat', kind: 'dm', memberIds: ['gitu'], title: 'Gitu' }),
      $: (id: string) => elements[id] || null,
      esc,
      cwIcon: (name: string) => `[${name}]`,
      toast: vi.fn(),
      updateProjChip: vi.fn(),
      api,
      EventSource: MockEventSource,
      openRun: vi.fn(),
    });
    new Script(COWORK_WORKBENCH_JS).runInContext(context);

    expect(COWORK_JS).toContain('<div class="cw-sec">CODING</div>');
    expect(COWORK_JS).toContain('<div id="cwRailCoding"></div>');
    expect(COWORK_WORKBENCH_CSS).toContain('.cw-wb-feed');
    expect(COWORK_WORKBENCH_CSS).toContain('.cw-rail-coding-btn');

    context.cwRenderRailCoding();
    expect(elements.cwRailCoding.innerHTML).toContain('data-main-coding-task="run-99"');
    expect(elements.cwRailCoding.innerHTML).toContain('Coding live');
    expect(elements.cwRailCoding.innerHTML).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(elements.cwRailCoding.innerHTML).not.toContain('<script>');
    expect(railBtnClicks).toHaveLength(2);

    await context.cwInspectCodingTask('run-99');
    expect(streams).toHaveLength(1);
    expect(streams[0].url).toBe('/api/runs/run-99/stream');
    expect(elements.cwWorkbench.hidden).toBe(false);
    expect(elements.cwWorkbench.innerHTML).toContain('Coding live');
    expect(elements.cwWorkbench.innerHTML).toContain('feat/stream');

    streams[0].emit({ i: 0, text: 'think  reviewing task state', replay: false });
    expect(elements.cwWbFeed.innerHTML).toContain('Reviewing task state…');

    streams[0].emit({ typed: { type: 'command_started', command: 'git status' } });
    expect(elements.cwWbFeed.innerHTML).toContain('Ran git status');
    expect(elements.cwWbFeed.innerHTML).toContain('Running');

    streams[0].emit({ i: 1, text: 'tdelta Checking `src/auth.ts` ', replay: false });
    expect(elements.cwWbMeta.innerHTML).toContain('Coding live');
    expect(elements.cwWbMeta.innerHTML).toContain('feat/stream');
    expect(elements.cwWbFeed.innerHTML).toContain('Agent Gitu · writing');
    expect(elements.cwWbFeed.innerHTML).toContain('<code>src/auth.ts</code>');

    streams[0].emit({ i: 2, text: 'tdelta now...' });
    expect(elements.cwWbStreamTxt.innerHTML).toContain('Checking <code>src/auth.ts</code> now...');

    streams[0].emit({ i: 3, text: 'say I found the token check bug and am fixing it.' });
    expect(elements.cwWbFeed.innerHTML).toContain('I found the token check bug and am fixing it.');

    streams[0].emit({ i: 4, text: 'run write src/auth.ts — Guard missing token' });
    streams[0].emit({
      typed: {
        type: 'file_changed',
        path: 'src/auth.ts',
        linesAdded: 8,
        linesRemoved: 2,
        diff: [
          { kind: 'remove', oldLine: 10, text: 'return true;' },
          { kind: 'add', newLine: 10, text: 'return Boolean(token);' },
        ],
      },
    });
    streams[0].emit({ i: 5, text: 'ok write src/auth.ts (18ms)' });
    expect(elements.cwWbFeed.innerHTML).toContain('Edited src/auth.ts');
    expect(elements.cwWbFeed.innerHTML).toContain('+8');
    expect(elements.cwWbFeed.innerHTML).toContain('-2');
    expect(elements.cwWbFeed.innerHTML).toContain('return Boolean(token);');

    streams[0].emit({ i: 6, text: 'run $ npm test — Verify auth guard' });
    streams[0].emit({ i: 7, text: 'ok $ npm test (420ms)' });
    streams[0].emit({ i: 8, text: 'out 12 tests passed' });
    expect(elements.cwWbFeed.innerHTML).toContain('Ran npm test');
    expect(elements.cwWbFeed.innerHTML).toContain('12 tests passed');

    // Verify structured CompletionReport renders cleanly without [object Object]
    streams[0].emit({ typed: { type: 'reasoning', text: 'Verified null token case.' } });
    expect(elements.cwWbFeed.innerHTML).toContain('Thought process');
    const activeItem = cwState.workbench.items[cwState.workbench.activeIndex];
    activeItem.report = {
      summary: 'Added token presence validation in auth guard.',
      verification: ['npm test (12 passed)'],
      filesChanged: ['src/auth.ts'],
    };
    activeItem.status = 'completed';
    context.cwRefreshCodingView(activeItem, false);
    expect(elements.cwWbFeed.innerHTML).toContain('Added token presence validation in auth guard.');
    expect(elements.cwWbFeed.innerHTML).toContain('npm test (12 passed)');
    expect(elements.cwWbFeed.innerHTML).not.toContain('[object Object]');

    elements.cwWbClose.onclick?.();
    expect(elements.cwWorkbench.hidden).toBe(true);
    expect(streams[0].closed).toBe(true);
  });
});
