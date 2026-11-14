import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_JS } from '../src/server/ui-cowork.js';
import { COWORK_NOW_JS } from '../src/server/ui-cowork-now.js';
import { COWORK_WORKBENCH_JS } from '../src/server/ui-cowork-workbench.js';

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
});
