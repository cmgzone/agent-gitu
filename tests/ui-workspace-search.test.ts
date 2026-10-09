import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { WORKSPACE_SEARCH_JS } from '../src/server/ui-workspace-search.js';
import { HOME_WORKSPACE_JS } from '../src/server/ui-home.js';
import { COWORK_JS } from '../src/server/ui-cowork.js';
import { UI_HTML } from '../src/server/ui.js';

function fixture() {
  function element() { return { isConnected: true, inert: false, hidden: false, value: '', innerHTML: '', textContent: '', dataset: {} as Record<string, string>,
    focus: vi.fn(), setAttribute: vi.fn(), remove: vi.fn(), querySelectorAll: () => [], querySelector: () => null, animate: vi.fn() }; }
  const elements: Record<string, any> = {};
  for (const id of ['workspaceSearchInput', 'workspaceSearchFilters', 'workspaceSearchStatus', 'workspaceSearchResults', 'workspaceSearchClose', 'workspaceSearchRetry', 'settings', 'setbody', 'settingsDirectoryQuery', 'settingsDirectoryResults']) elements[id] = element();
  elements.settings.hidden = true;
  const shell = element(), focus = element(), page: any = element();
  page.remove.mockImplementation(() => { delete elements.workspaceSearch; });
  const cw: any = { agents: [], convs: [], threads: [], widgets: [] }, state = { active: 'main-run', settings: { projectPath: '/work/alpha' }, draft: 'Keep my draft' };
  const context = createContext({
    S: state, $: (id: string) => elements[id], cwEnsure: () => cw, cwActiveConv: () => cw.convs.find((conv: any) => conv.id === cw.active),
    basename: (path: string) => String(path).replace(/\\/g, '/').split('/').pop(), effectiveProjectPath: () => state.settings.projectPath,
    sessionTitle: (goal: string) => goal, shortDate: (date: string) => date?.slice(0, 10),
    cwNowCards: () => [], cwNowAction: vi.fn(), cwAva: (agent: any) => `<img data-agent="${agent.id}">`,
    esc: (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    icon: (name: string) => `<svg data-icon="${name}"></svg>`, actionSvg: () => '<svg></svg>',
    document: { title: 'Chat — Gitu', activeElement: focus, querySelector: () => shell, createElement: () => page,
      body: { classList: { add: vi.fn(), remove: vi.fn() }, appendChild: vi.fn(() => { elements.workspaceSearch = page; }) } },
    api: vi.fn(), setTimeout: vi.fn(() => 1), clearTimeout: vi.fn(), chatMotionReduced: () => false,
    cwSaveDraft: vi.fn(), cwStopPoll: vi.fn(), stopStreams: vi.fn(), openRun: vi.fn(), openHome: vi.fn(), openSettings: vi.fn(), closeSettings: vi.fn(),
    openToolPanel: vi.fn(), newProject: vi.fn(), openCowork: vi.fn(), cwOpenDm: vi.fn(), cwOpenConv: vi.fn(), cwOpenProfile: vi.fn(),
    cwAgentModal: vi.fn(), cwGroupModal: vi.fn(), cwExit: vi.fn(), cwSwitchThread: vi.fn(), cwNewThreadModal: vi.fn(), cwOpenConnections: vi.fn(),
    cwMissionModal: vi.fn(), cwFolderModal: vi.fn(), cwScheduleModal: vi.fn(), cwNewWidgetModal: vi.fn(), cwLockApp: vi.fn(),
    updateProjChip: vi.fn(), persist: vi.fn(), renderSidebar: vi.fn(), toast: vi.fn(),
  });
  new Script(HOME_WORKSPACE_JS + WORKSPACE_SEARCH_JS).runInContext(context);
  return { context, elements, shell, page, focus, cw, state };
}

describe('Full-page workspace search', () => {
  it('indexes actual sessions, projects, skills, schedules, and coding tools independently of Cowork agents', () => {
    const f = fixture();
    const items = f.context.wsBuildItems('main', { runs: [{ runId: 'release', goal: 'Ship café project', project: 'alpha', projectPath: '/work/alpha', mode: 'agent', startedAt: '2026-10-09', status: 'completed' }], skills: [{ name: 'release-check', description: 'Verify builds' }], jobs: [{ id: 'daily', goal: 'Daily review', every: '1d' }], agents: [{ id: 'cowork-agent', name: 'Cowork only' }] });
    expect(items.find((item: any) => item.action === 'run').id).toBe('release');
    expect(items.some((item: any) => item.action === 'new-session')).toBe(true);
    expect(items.some((item: any) => item.action === 'skill' && item.id === 'release-check')).toBe(true);
    expect(items.some((item: any) => item.action === 'job' && item.id === 'daily')).toBe(true);
    expect(items.filter((item: any) => item.action === 'tool').map((item: any) => item.id)).toEqual(['browser', 'git', 'state', 'files']);
    expect(items.some((item: any) => item.category === 'Agents')).toBe(false);
    expect(f.context.wsFilter(items, 'CAFE ship', 'Sessions')).toHaveLength(1);
    expect(f.context.wsFilter(items, 'does not exist', 'all')).toHaveLength(0);
    expect(f.context.wsFilter(items, '', 'Skills')).toHaveLength(1);
  });

  it('indexes Cowork agents, chats, threads, creation, and contextual tools without mixing coding sessions', () => {
    const f = fixture(); f.state.active = 'cowork'; f.cw.convs = [{ id: 'chat', title: 'Research', memberIds: ['researcher'] }]; f.cw.active = 'chat'; f.cw.threads = [{ id: 'thread', title: 'Sources' }];
    const items = f.context.wsBuildItems('cowork', { agents: [{ id: 'researcher', name: 'Researcher', description: 'Find sources' }], conversations: [{ id: 'chat', title: 'Research', kind: 'dm', schedule: { enabled: true, every: '1d' } }], skills: [{ name: 'browser-workflow' }], runs: [{ runId: 'main', goal: 'Coding' }] });
    expect(items.find((item: any) => item.action === 'agent').aux).toBe('profile');
    for (const action of ['new-agent', 'new-group', 'new-thread', 'mission', 'tag-folder', 'new-widget', 'lock', 'thread']) expect(items.some((item: any) => item.action === action)).toBe(true);
    expect(items.some((item: any) => item.action === 'run' || item.action === 'tool')).toBe(false);
    expect(items.some((item: any) => item.category === 'Schedules')).toBe(true);
  });

  it('opens search without stopping the live conversation or discarding a draft, and restores focus and inert state', async () => {
    const f = fixture(); f.elements.settings.inert = true; f.context.api.mockResolvedValue({});
    f.context.wsOpen('main');
    expect(f.page.setAttribute).toHaveBeenCalledWith('aria-modal', 'true');
    expect(f.shell.inert).toBe(true);
    expect(f.context.cwSaveDraft).toHaveBeenCalledOnce();
    expect(f.context.stopStreams).not.toHaveBeenCalled(); expect(f.context.cwStopPoll).not.toHaveBeenCalled();
    expect(f.state.draft).toBe('Keep my draft'); expect(f.state.active).toBe('main-run');
    expect(f.elements.workspaceSearchInput.focus).toHaveBeenCalledWith({ preventScroll: true });
    const event = { key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() };
    f.page.onkeydown(event);
    expect(event.stopPropagation).toHaveBeenCalledOnce(); expect(f.shell.inert).toBe(false);
    expect(f.elements.settings.inert).toBe(true); expect(f.focus.focus).toHaveBeenCalledOnce();
    expect(f.context.document.title).toBe('Chat — Gitu');
    await Promise.resolve();
  });

  it('keeps successful data usable on partial failures and ignores responses after closing the page', async () => {
    const f = fixture(), state: any = { mode: 'main', items: [], failures: [], query: '', category: 'all', limit: 8 };
    f.context.workspaceSearchState = state; f.context.wsRender = vi.fn();
    f.context.api.mockImplementation((path: string) => path === '/api/skills' ? Promise.reject(new Error('offline')) : Promise.resolve(path === '/api/runs' ? [{ runId: 'one', goal: 'A real session', projectPath: '/work/alpha' }] : {}));
    await f.context.wsLoad(state);
    expect(state.failures).toEqual(['skills']); expect(state.items.some((item: any) => item.id === 'one')).toBe(true);
    const resolvers: ((value: any) => void)[] = [];
    f.context.api.mockImplementation(() => new Promise((resolve) => { resolvers.push(resolve); }));
    const loading = f.context.wsLoad(state); f.context.workspaceSearchState = null;
    resolvers.forEach((resolve, index) => resolve(index === 0 ? [{ runId: 'late', goal: 'Late response' }] : {}));
    await loading;
    expect(state.items.some((item: any) => item.id === 'late')).toBe(false);
  });

  it('rejects stale recall results and keeps searchable text escaped', async () => {
    const f = fixture(), state: any = { mode: 'cowork', query: 'sources', revision: 1, category: 'all', items: [], hits: [], limit: 8, failures: [] };
    f.context.workspaceSearchState = state;
    let finish: (value: any) => void = () => {};
    f.context.api.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const recall = f.context.wsRecall(state); state.revision++;
    finish({ hits: [{ conversationId: 'chat', snippet: 'Old sources' }] }); await recall;
    expect(state.hits).toEqual([]);
    state.items = [{ category: 'Chats', title: '<script>bad</script>', detail: '<img onerror=bad>', icon: 'chat', action: 'conversation', id: 'safe' }]; state.query = '';
    f.context.wsRender(state);
    expect(f.elements.workspaceSearchResults.innerHTML).not.toContain('<script>');
    expect(f.elements.workspaceSearchResults.innerHTML).toContain('&lt;img onerror=bad>');
  });

  it('routes results through existing workflows without automatically creating or sending anything', () => {
    const f = fixture(); f.context.wsClose = vi.fn();
    f.context.wsActivate({ action: 'run', id: 'run-one', run: { projectPath: '/work/beta', mode: 'agent' } });
    expect(f.context.openRun).toHaveBeenCalledWith('run-one', { chatish: false, mode: 'agent' });
    f.context.wsActivate({ action: 'skill', id: 'check-build' });
    expect(f.context.S.skillQuery).toBe('check-build'); expect(f.context.openSettings).toHaveBeenCalledWith('skills');
    f.context.wsActivate({ action: 'new-agent' }); expect(f.context.cwAgentModal).toHaveBeenCalledWith(null);
    f.context.wsActivate({ action: 'new-session' }); expect(f.context.openHome).toHaveBeenCalledOnce();
    f.context.wsActivate({ action: 'now', card: { kind: 'request', id: 'approval' } }); expect(f.context.cwNowAction).toHaveBeenCalledWith('request', 'approval');
    expect(f.context.api).not.toHaveBeenCalled();
  });

  it('requires an explicit second click to delete a session', () => {
    const f = fixture(), button: any = { dataset: {}, textContent: '', setAttribute: vi.fn() };
    f.context.wsDeleteRun({}, { id: 'run', title: 'My session' }, button);
    expect(f.context.api).not.toHaveBeenCalled(); expect(button.textContent).toBe('Delete?');
  });

  it('hides transport resume notices while preserving user messages that say continue', () => {
    const script = UI_HTML.split('<script>')[1]!.split('</script>')[0]!;
    const stream = {}, userBubble = vi.fn((text: string) => ({ text })), appendLive = vi.fn();
    const context = createContext({ S: { sessions: { run: { nodes: {} } } }, $: () => stream,
      updateApproach: vi.fn(), toolActivityBoundary: () => false, mascotPulse: vi.fn(),
      settlePendingUserMessage: () => false, retireAbubble: vi.fn(), closeThought: vi.fn(),
      userBubble, appendLive, stickScroll: vi.fn(), document: { createElement: vi.fn() } });
    new Script(script.slice(script.indexOf('  function appendEvent('), script.indexOf('  function composerTodoItems('))).runInContext(context);
    context.appendEvent('run', { i: 1, text: 'continue — resuming this session' });
    expect(appendLive).not.toHaveBeenCalled(); expect(context.document.createElement).not.toHaveBeenCalled();
    context.appendEvent('run', { i: 2, text: 'user-msg continue' });
    expect(userBubble).toHaveBeenCalledWith('continue', 'run');
    expect(appendLive).toHaveBeenCalledWith(stream, { text: 'continue' });
  });

  it('keeps settings keyboard focus inside the page and restores the originating control on close', () => {
    const f = fixture(), script = UI_HTML.split('<script>')[1]!.split('</script>')[0]!;
    f.context.closeToolPanel = vi.fn(); f.context.renderSettings = vi.fn();
    const first = { focus: vi.fn(), getClientRects: () => [1] }, last = { focus: vi.fn(), getClientRects: () => [1] };
    f.elements.settings.querySelectorAll = () => [first, last];
    new Script(script.slice(script.indexOf('  function openSettings('), script.indexOf('  function refreshModels('))).runInContext(f.context);
    f.context.openSettings();
    expect(f.state).toMatchObject({ setSection: 'overview', settingsFocus: f.focus });
    expect(f.shell.inert).toBe(true); expect(f.elements.settings.hidden).toBe(false);
    expect(f.elements.settingsDirectoryQuery.focus).toHaveBeenCalledWith({ preventScroll: true });
    f.context.document.activeElement = last;
    const event = { key: 'Tab', shiftKey: false, preventDefault: vi.fn() };
    f.elements.settings.onkeydown(event);
    expect(first.focus).toHaveBeenCalledOnce(); expect(event.preventDefault).toHaveBeenCalledOnce();
    f.context.closeSettings();
    expect(f.shell.inert).toBe(false); expect(f.elements.settings.hidden).toBe(true);
    expect(f.focus.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('renders a searchable settings directory and removes the old Cowork sidebar markup', () => {
    const f = fixture(); f.context.wsSettingsDirectory();
    expect(f.elements.setbody.innerHTML).toContain('Search settings, tools, and preferences');
    f.elements.settingsDirectoryQuery.value = 'scheduled'; f.elements.settingsDirectoryQuery.oninput();
    expect(f.elements.settingsDirectoryResults.innerHTML).toContain('data-setting="cron"');
    expect(f.elements.settingsDirectoryResults.innerHTML).not.toContain('data-setting="providers"');
    expect(COWORK_JS).not.toContain('<aside class="cw-rail">');
    expect(COWORK_JS).not.toContain('id="cwRailResize"');
    expect(UI_HTML).not.toContain('id="homeOpenProject"');
    expect(() => new Script(UI_HTML.split('<script>')[1]!.split('</script>')[0]!)).not.toThrow();
  });
});
