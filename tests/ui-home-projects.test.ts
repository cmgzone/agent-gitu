import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { HOME_WORKSPACE_JS } from '../src/server/ui-home.js';

function fixture() {
  const buttons: Record<string, any[]> = {};
  const target = { isConnected: true, innerHTML: '', querySelectorAll: (selector: string) => buttons[selector] || [], insertAdjacentHTML: vi.fn() };
  const label = { textContent: '' };
  const picker = { querySelector: () => label, setAttribute: vi.fn() };
  const elements: Record<string, any> = { homeProjectCards: target, homeProj: picker, goal: { value: 'Keep this draft', focus: vi.fn() }, homeRetryProjects: {} };
  const state = { settings: { projectPath: 'C:\\work\\alpha' }, lastProjectPath: '', draft: 'Keep this draft' };
  const cowork: any = { selectedAgentId: 'chosen' };
  const context = createContext({
    S: state, $: (id: string) => elements[id], api: vi.fn(),
    basename: (path: string) => String(path).replace(/\\/g, '/').split('/').pop() || path,
    effectiveProjectPath: () => state.settings.projectPath,
    esc: (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    sessionTitle: (goal: string) => goal, icon: () => '<svg></svg>', cwIcon: () => '<svg></svg>',
    persist: vi.fn(), updateProjChip: vi.fn(), renderSidebar: vi.fn(), openRun: vi.fn(),
    cwEnsure: () => cowork, cwProfileAgent: () => cowork.agents?.find((agent: any) => agent.id === cowork.selectedAgentId), cwAva: (agent: any) => `<img data-agent="${agent.id}">`,
  });
  new Script(HOME_WORKSPACE_JS).runInContext(context);
  return { context, target, buttons, elements, state, label, cowork };
}

describe('Home projects', () => {
  it('includes empty projects and the selected workspace, merges Windows paths, and keeps equal folder names separate', () => {
    const f = fixture();
    const projects = f.context.homeBuildProjects([
      { path: 'C:\\work\\alpha', name: 'alpha' }, { path: 'C:\\work\\new', name: 'new' },
    ], [
      { runId: 'old', projectPath: 'c:/WORK/alpha/', project: 'alpha', startedAt: '2026-10-08' },
      { runId: 'latest', projectPath: 'C:\\work\\alpha', project: 'alpha', startedAt: '2026-10-09' },
      { runId: 'different', projectPath: 'D:\\other\\alpha', project: 'alpha', startedAt: '2026-10-07' },
    ], 'C:\\work\\selected');
    expect(projects).toHaveLength(4);
    expect(projects[0].path).toBe('C:\\work\\selected');
    expect(projects[1].latest.runId).toBe('latest');
    expect(projects[1].sessions).toHaveLength(2);
    expect(projects.find((project: any) => project.name === 'new').latest).toBeNull();
    expect(f.context.homeProjectKey('/work/Alpha')).not.toBe(f.context.homeProjectKey('/work/alpha'));
  });

  it('selects a project without sending or losing the draft, and resumes only its latest run', () => {
    const f = fixture(), select: any = { dataset: { homeProject: '1' } }, resume: any = { dataset: { homeResume: '1' } };
    f.buttons['[data-home-project]'] = [select]; f.buttons['[data-home-resume]'] = [resume];
    const managed = [{ name: 'beta', path: 'C:\\work\\beta' }];
    const sessions = [{ runId: 'beta-chat', projectPath: 'C:\\work\\beta', goal: 'Plan the release', mode: 'agent', startedAt: '2026-10-09' }];
    f.context.homeRenderProjects(f.target, managed, sessions);
    select.onclick();
    expect(f.state.settings.projectPath).toBe('C:\\work\\beta');
    expect(f.state.lastProjectPath).toBe('C:\\work\\beta');
    expect(f.label.textContent).toBe('beta');
    expect(f.state.draft).toBe('Keep this draft');
    expect(f.elements.goal.value).toBe('Keep this draft');
    expect(f.context.openRun).not.toHaveBeenCalled();
    expect(f.context.api).not.toHaveBeenCalled();
    // Rerender changes the current project's sorted index to zero.
    resume.dataset.homeResume = '0'; resume.onclick();
    expect(f.context.openRun).toHaveBeenCalledWith('beta-chat', { chatish: false, mode: 'agent' });
  });

  it('escapes project labels, goals, and paths while offering creation guidance when empty', () => {
    const f = fixture();
    f.state.settings.projectPath = '';
    f.context.homeRenderProjects(f.target, [{ name: '<script>bad</script>', path: 'C:\\work\\a"bad' }], [{ runId: 'chat', projectPath: 'C:\\work\\a"bad', goal: '<img onerror=bad>', startedAt: '2026-10-09' }]);
    expect(f.target.innerHTML).not.toContain('<script>');
    expect(f.target.innerHTML).toContain('&lt;img onerror=bad>');
    expect(f.target.innerHTML).toContain('a&quot;bad');
    f.context.homeRenderProjects(f.target, [], []);
    expect(f.target.innerHTML).toContain('Create a project or open a folder');
  });

  it('keeps session projects usable if directory listing fails and offers a retry', async () => {
    const f = fixture();
    f.context.api.mockImplementation((path: string) => path === '/api/projects' ? Promise.reject(new Error('unavailable')) : Promise.resolve([{ runId: 'alpha-chat', projectPath: 'C:\\work\\alpha', goal: 'Continue my work' }]));
    await f.context.homeLoadProjects();
    expect(f.target.innerHTML).toContain('Continue my work');
    expect(f.target.insertAdjacentHTML).toHaveBeenCalledWith('beforeend', expect.stringContaining('Some projects or conversations could not load'));
    expect(f.elements.homeRetryProjects.onclick).toBeTypeOf('function');
  });

  it('does not overwrite a page after leaving Home while a request is pending', async () => {
    const f = fixture();
    const resolvers: ((value: any) => void)[] = [];
    f.context.api.mockImplementation(() => new Promise((done) => { resolvers.push(done); }));
    const load = f.context.homeLoadProjects(); f.target.isConnected = false;
    resolvers[0]!({ projects: [{ path: 'C:\\work\\new', name: 'new' }] }); resolvers[1]!([]);
    await load;
    expect(f.target.innerHTML).toBe('');
  });

  it('loads the selected profile face without rendering agent cards or changing the draft', async () => {
    const f = fixture(), face = { innerHTML: '' };
    f.elements.cwCurrentChat = { isConnected: true, querySelector: () => face };
    f.context.api.mockResolvedValue({ agents: [{ id: 'first' }, { id: 'chosen' }], availableSkills: ['research'] });
    await f.context.homeLoadProfile();
    expect(f.cowork.selectedAgentId).toBe('chosen');
    expect(face.innerHTML).toContain('data-agent="chosen"');
    expect(f.target.innerHTML).toBe('');
    expect(f.state.draft).toBe('Keep this draft');
  });
});
