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
    cwAgentModal: vi.fn(), cwGroupModal: vi.fn(), cwNewSessionModal: vi.fn(), cwDeleteSession: vi.fn(), cwExit: vi.fn(), cwSwitchThread: vi.fn(), cwNewThreadModal: vi.fn(), cwOpenConnections: vi.fn(),
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
    for (const action of ['new-cowork-session', 'new-agent', 'new-group', 'new-thread', 'mission', 'tag-folder', 'new-widget', 'lock', 'thread']) expect(items.some((item: any) => item.action === action)).toBe(true);
    expect(items.find((item: any) => item.action === 'conversation')).toMatchObject({ category: 'Sessions', aux: 'delete-conversation' });
    expect(items.find((item: any) => item.action === 'thread').category).toBe('Threads');
    expect(items.some((item: any) => item.action === 'run' || item.action === 'tool')).toBe(false);
    expect(items.some((item: any) => item.category === 'Schedules')).toBe(true);
  });

  it('lists future one-time reminders and paused recurring tasks from every Cowork session without duplicates', () => {
    const f = fixture(); f.context.cwNowCards = () => [{ kind: 'schedule', id: 'active', title: 'Duplicate recurring card' }];
    const items = f.context.wsBuildItems('cowork', {
      agents: [{ id: 'researcher', name: 'Researcher' }],
      conversations: [
        { id: 'active', title: 'Launch', schedule: { every: '1d', goal: 'Check launch status', enabled: true } },
        { id: 'paused', title: 'Research', schedule: { every: '1h', goal: 'Review sources', enabled: false } },
        { id: 'deleted', title: 'Old task', schedule: { every: '', goal: '', enabled: false } },
      ],
      followUps: [{ id: 'reminder', conversationId: 'paused', agentId: 'researcher', note: 'Verify the sources tomorrow', dueAt: '2099-10-12T08:00:00Z' }],
    });
    const schedules = items.filter((item: any) => item.category === 'Schedules');
    expect(schedules).toHaveLength(3);
    expect(schedules.find((item: any) => item.id === 'paused')).toMatchObject({ title: 'Review sources', detail: 'Paused · Every 1h · Research' });
    expect(schedules.find((item: any) => item.id === 'reminder')).toMatchObject({ title: 'Verify the sources tomorrow', action: 'followup', conversationId: 'paused' });
    expect(schedules.find((item: any) => item.id === 'reminder').detail).toContain('Researcher · Research');
    expect(f.context.wsFilter(items, 'sources tomorrow', 'Schedules')).toHaveLength(1);
    f.context.wsActivate(schedules.find((item: any) => item.id === 'reminder'));
    expect(f.context.cwOpenConv).toHaveBeenCalledWith('paused', null);
  });

  it('routes wsOpen directly to Settings, Sidebar, or Cowork sessions dialog without mounting a full-screen search page', () => {
    const f = fixture();
    f.context.cwSessionsModal = vi.fn();
    f.context.cwOpenAgentSwitcherModal = vi.fn();
    f.elements.homeSidebarSearch = { focus: vi.fn() };
    f.elements.homeSessionsDropdown = { open: false };
    f.elements.homeViewProjects = { click: vi.fn() };
    f.elements.homeGroupsBtn = { click: vi.fn() };

    f.context.wsOpen('main');
    expect(f.context.cwSaveDraft).toHaveBeenCalledOnce();
    expect(f.elements.homeSessionsDropdown.open).toBe(true);
    expect(f.elements.homeSidebarSearch.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(f.elements.workspaceSearch).toBeUndefined();

    f.context.wsOpen('main', 'Schedules');
    expect(f.context.openSettings).toHaveBeenCalledWith('cron');

    f.context.wsOpen('main', 'Skills');
    expect(f.context.openSettings).toHaveBeenCalledWith('skills');

    f.context.wsOpen('main', 'Settings');
    expect(f.context.openSettings).toHaveBeenCalledWith('overview');

    f.context.wsOpen('cowork', 'Agents');
    expect(f.context.cwOpenAgentSwitcherModal).toHaveBeenCalledOnce();

    f.context.wsOpen('main', 'Projects');
    expect(f.elements.homeViewProjects.click).toHaveBeenCalledOnce();

    f.context.wsOpen('main', 'Groups');
    expect(f.elements.homeGroupsBtn.click).toHaveBeenCalledOnce();

    f.context.wsOpen('cowork', 'Sessions');
    expect(f.context.cwSessionsModal).toHaveBeenCalledWith('sessions');

    f.context.wsOpen('cowork', 'Groups');
    expect(f.context.cwSessionsModal).toHaveBeenCalledWith('groups');
  });

  it('routes results through existing workflows without automatically creating or sending anything', () => {
    const f = fixture(); f.context.wsClose = vi.fn();
    f.context.wsActivate({ action: 'run', id: 'run-one', run: { projectPath: '/work/beta', mode: 'agent' } });
    expect(f.context.openRun).toHaveBeenCalledWith('run-one', { chatish: false, mode: 'agent' });
    f.context.wsActivate({ action: 'skill', id: 'check-build' });
    expect(f.context.S.skillQuery).toBe('check-build'); expect(f.context.openSettings).toHaveBeenCalledWith('skills');
    f.context.wsActivate({ action: 'new-agent' }); expect(f.context.cwAgentModal).toHaveBeenCalledWith(null);
    f.context.wsActivate({ action: 'new-cowork-session' }); expect(f.context.cwNewSessionModal).toHaveBeenCalledOnce();
    f.context.wsActivate({ action: 'new-session' }); expect(f.context.openHome).toHaveBeenCalledOnce();
    f.context.wsActivate({ action: 'now', card: { kind: 'request', id: 'approval' } }); expect(f.context.cwNowAction).toHaveBeenCalledWith('request', 'approval');
    expect(f.context.api).not.toHaveBeenCalled();
  });

  it('hides transport resume notices while preserving user messages that say continue', () => {
    const script = UI_HTML.split('<script>')[1]!.split('</script>')[0]!;
    const stream = {}, userBubble = vi.fn((text: string) => ({ text })), appendLive = vi.fn();
    const context = createContext({ S: { sessions: { run: { nodes: {} } } }, $: () => stream,
      syncWorkingActivity: vi.fn(), updateApproach: vi.fn(), toolActivityBoundary: () => false, mascotPulse: vi.fn(),
      settlePendingUserMessage: () => false, retireAbubble: vi.fn(), closeThought: vi.fn(),
      userBubble, appendLive, stickScroll: vi.fn(), document: { createElement: vi.fn() } });
    new Script(script.slice(script.indexOf('  function appendEvent('), script.indexOf('  function composerTodoItems('))).runInContext(context);
    context.appendEvent('run', { i: 1, text: 'continue — resuming this session' });
    expect(appendLive).not.toHaveBeenCalled(); expect(context.document.createElement).not.toHaveBeenCalled();
    context.appendEvent('run', { i: 2, text: 'user-msg continue' });
    expect(userBubble).toHaveBeenCalledWith('continue', 'run', null, undefined, 2);
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

  it('resolves settings aliases and keeps hidden sections searchable but out of navigation', () => {
    const f = fixture();
    expect(f.context.wsResolveSettingId('connected-apps')).toBe('connections');
    expect(f.context.wsResolveSettingId('custom-apis')).toBe('connections');
    expect(f.context.wsResolveSettingId('general')).toBe('general');
    const visible = f.context.wsSettingsSections(false).map((item: any) => item.id);
    const all = f.context.wsSettingsSections(true);
    expect(visible).not.toContain('developer');
    expect(all.find((item: any) => item.id === 'developer')).toMatchObject({ hidden: true, group: 'More' });
    expect(all.find((item: any) => item.id === 'connections')).toMatchObject({ aliases: ['connected-apps', 'apps', 'accounts', 'custom-apis'] });
    const items = f.context.wsBuildItems('main', { runs: [], skills: [], jobs: [], agents: [], conversations: [] });
    expect(items.find((item: any) => item.action === 'settings' && item.id === 'connections')).toMatchObject({ title: 'Connections' });
    expect(items.find((item: any) => item.action === 'settings' && item.id === 'developer')).toBeTruthy();
    expect(UI_HTML).toContain('window.gituPhoneQrSrc = gituPhoneQrSrc');
    expect(UI_HTML).toContain('agentgitu://connect?server=');
  });

  it('renders compact schedule cards with collapsible automation instructions and metadata badges', () => {
    const f = fixture();
    const items = [
      {
        category: 'Schedules',
        id: 'sc-1',
        title: 'Morning Sync',
        detail: 'Active · Every 1d · Team',
        action: 'conversation-schedule',
        icon: 'calendar',
        schedule: {
          enabled: true,
          every: '1d',
          goal: 'Morning Sync\nCheck blockers and report status across all active repos.'
        },
        conversation: { id: 'conv-1', title: 'Team' }
      },
      {
        category: 'Schedules',
        id: 'sc-2',
        title: 'Nightly Audit',
        detail: 'Paused · Every 3h · Security',
        action: 'conversation-schedule',
        icon: 'calendar',
        schedule: {
          enabled: false,
          every: '3h',
          goal: 'Run dependency vulnerability scan and alert on CVEs.'
        },
        conversation: { id: 'conv-2', title: 'Security' }
      }
    ];
    const html = items.map((item, index) => f.context.wsScheduleCardHtml({ index }, item)).join('');

    // Compact card structure
    expect(html).toContain('class="ws-result ws-schedule-card"');
    expect(html).toContain('class="ws-sc-header"');
    expect(html).toContain('class="ws-sc-top-row"');
    expect(html).toContain('class="ws-sc-title-btn"');
    expect(html).toContain('class="ws-sc-summary"');
    expect(html).toContain('class="ws-sc-meta"');
    expect(html).toContain('class="ws-sc-footer"');

    // Morning Sync badges and prompt
    expect(html).toContain('Team');
    expect(html).toContain('Check blockers and report status');
    expect(html).toContain('class="ws-sc-badge active"');
    expect(html).toContain('Daily');
    expect(html).toContain('class="ws-sc-toggle"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('View instructions');
    expect(html).toContain('class="ws-sc-instructions" id="ws-sc-inst-0" hidden');
    expect(html).toContain('Morning Sync\nCheck blockers and report status across all active repos.');

    // Nightly Audit paused badge
    expect(html).toContain('Security');
    expect(html).toContain('class="ws-sc-badge paused"');
    expect(html).toContain('Every 3 hours');
    expect(html).toContain('Run dependency vulnerability scan and alert on CVEs.');
  });

  it('renders one-time follow-up schedule cards with due date badges', () => {
    const f = fixture();
    const item = {
      category: 'Schedules',
      id: 'reminder-1',
      title: 'Follow up on PR review',
      detail: 'One-time · Engineer · Code Review',
      action: 'followup',
      icon: 'clock',
      followUp: {
        id: 'reminder-1',
        note: 'Please verify the unit tests pass on CI and merge the PR.',
        dueAt: '2099-01-01T10:00:00Z'
      },
      agent: { name: 'Engineer' },
      conversation: { title: 'Code Review' }
    };
    const html = f.context.wsScheduleCardHtml({ index: 0 }, item);

    expect(html).toContain('Engineer reminder · Code Review');
    expect(html).toContain('class="ws-sc-badge active"');
    expect(html).toContain('One-time');
    expect(html).toContain('Due ');
    expect(html).toContain('Please verify the unit tests pass on CI and merge the PR.');
  });

  it('scopes main sidebar Sessions and Groups strictly to the selected agent without mixing', () => {
    const f = fixture();
    const agents = [{ id: 'writer', name: 'Atlas' }, { id: 'coder', name: 'Nova' }];
    const conversations = [
      { id: 'dm-writer', title: 'Atlas Direct', kind: 'dm', memberIds: ['writer'] },
      { id: 'dm-coder', title: 'Nova Direct', kind: 'dm', memberIds: ['coder'] },
      { id: 'grp-shared', title: 'Docs + Code', kind: 'group', memberIds: ['writer', 'coder'] },
      { id: 'grp-nova', title: 'Build Squad', kind: 'group', memberIds: ['coder', 'ops'] },
    ];
    const runs = [
      { runId: 'run-writer', goal: 'Write API guide', project: 'alpha', status: 'completed', startedAt: '2026-11-10', coworkTask: { agentId: 'writer', agentName: 'Atlas' } },
      { runId: 'run-coder', goal: 'Fix webhook retry', project: 'alpha', status: 'completed', startedAt: '2026-11-11', coworkTask: { agentId: 'coder', agentName: 'Nova' } },
      { runId: 'run-general', goal: 'Main code task', project: 'alpha', status: 'completed', startedAt: '2026-11-12' },
    ];

    f.cw.agents = agents;
    f.cw.selectedAgentId = 'writer';
    const atlasItems = f.context.wsBuildItems('main', { agents, conversations, runs }, {});
    const atlasSessions = atlasItems.filter((item: any) => item.category === 'Sessions').map((item: any) => item.id);
    const atlasGroups = atlasItems.filter((item: any) => item.category === 'Groups').map((item: any) => item.id);
    expect(atlasSessions).toEqual(['dm-writer', 'run-writer']);
    expect(atlasGroups).toEqual(['grp-shared']);

    const grpAction = atlasItems.find((item: any) => item.id === 'grp-shared');
    f.context.wsClose = vi.fn();
    f.context.wsActivate(grpAction);
    expect(f.cw.homeAction).toEqual({ kind: 'conv', agentId: 'writer', convId: 'grp-shared', threadId: null });
    expect(f.context.openCowork).toHaveBeenCalledOnce();

    f.cw.selectedAgentId = 'coder';
    const novaItems = f.context.wsBuildItems('main', { agents, conversations, runs }, {});
    const novaSessions = novaItems.filter((item: any) => item.category === 'Sessions').map((item: any) => item.id);
    const novaGroups = novaItems.filter((item: any) => item.category === 'Groups').map((item: any) => item.id);
    expect(novaSessions).toEqual(['dm-coder', 'run-coder']);
    expect(novaGroups).toEqual(['grp-shared', 'grp-nova']);

    const allItems = f.context.wsBuildItems('main', { agents, conversations, runs }, { showAllAgents: true });
    expect(allItems.filter((item: any) => item.category === 'Sessions').map((item: any) => item.id)).toEqual(['run-writer', 'run-coder', 'run-general', 'dm-writer', 'dm-coder']);
    expect(allItems.filter((item: any) => item.category === 'Groups').map((item: any) => item.id)).toEqual(['grp-shared', 'grp-nova']);
  });

  it('scopes Cowork Sessions and Groups to the active/selected agent and exposes Groups navigation in sidebar and menu', () => {
    const f = fixture();
    const agents = [{ id: 'writer', name: 'Atlas' }, { id: 'coder', name: 'Nova' }];
    const conversations = [
      { id: 'dm-writer', title: 'Atlas Chat', kind: 'dm', memberIds: ['writer'] },
      { id: 'dm-coder', title: 'Nova Chat', kind: 'dm', memberIds: ['coder'] },
      { id: 'grp-atlas', title: 'Atlas Council', kind: 'group', memberIds: ['writer', 'ops'] },
      { id: 'grp-nova', title: 'Nova Bench', kind: 'group', memberIds: ['coder', 'ops'] },
    ];
    f.state.active = 'cowork';
    f.cw.agents = agents;
    f.cw.convs = conversations;
    f.cw.selectedAgentId = 'writer';

    const items = f.context.wsBuildItems('cowork', { agents, conversations }, {});
    expect(items.filter((item: any) => item.category === 'Sessions').map((item: any) => item.id)).toEqual(['dm-writer']);
    expect(items.filter((item: any) => item.category === 'Groups').map((item: any) => item.id)).toEqual(['grp-atlas']);

    expect(HOME_WORKSPACE_JS).toContain('id="homeGroupsBtn"');
    expect(HOME_WORKSPACE_JS).toContain('id="homeAgentGroups"');
    expect(HOME_WORKSPACE_JS).toContain('id="homeSelectedAgentChip"');
    expect(COWORK_JS).toContain('id="cwGroupsMenuBtn"');
  });
});
