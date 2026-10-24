import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { HOME_WORKSPACE_JS } from '../src/server/ui-home.js';

function fixture() {
  const buttons: Record<string, any[]> = {};
  const target = { isConnected: true, innerHTML: '', querySelectorAll: (selector: string) => buttons[selector] || [], insertAdjacentHTML: vi.fn() };
  const label = { textContent: '' };
  const picker = { querySelector: () => label, setAttribute: vi.fn() };
  const elements: Record<string, any> = { homeProjectCards: target, homeProj: picker, goal: { value: 'Keep this draft', style:{height:''}, focus: vi.fn() }, homeRetryProjects: {} };
  const state: any = { active:'home', settings: { projectPath: 'C:\\work\\alpha' }, lastProjectPath: '', draft: 'Keep this draft' };
  const cowork: any = { selectedAgentId: 'chosen' };
  const context = createContext({
    credentialChatInput:(value:string)=>({safeText:value.replace(/secret/g,'[redacted]')}),
    S: state, $: (id: string) => elements[id], api: vi.fn(),
    basename: (path: string) => String(path).replace(/\\/g, '/').split('/').pop() || path,
    effectiveProjectPath: () => state.settings.projectPath,
    esc: (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    sessionTitle: (goal: string) => goal, icon: () => '<svg></svg>', cwIcon: () => '<svg></svg>',
    persist: vi.fn(), rememberModelSelection: vi.fn(), updateProjChip: vi.fn(), renderSidebar: vi.fn(), openRun: vi.fn(),
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

  it('keeps separate project drafts and attachments, and opens the requested chat', () => {
    const f = fixture(), select: any = { dataset: { homeProject: '1' } }, chat:any={dataset:{homeChat:'0:0'}};
    f.buttons['[data-home-project]'] = [select];f.buttons['[data-home-chat]']=[chat];
    const file={name:'alpha.png'};f.state.homePendingFiles=[file];
    const managed = [{ name: 'beta', path: 'C:\\work\\beta' }];
    const sessions = [{ runId: 'beta-chat', projectPath: 'C:\\work\\beta', goal: 'Plan the release', mode: 'agent', startedAt: '2026-10-09' }];
    f.context.homeRenderProjects(f.target, managed, sessions);select.onclick();
    expect(f.state.settings.projectPath).toBe('C:\\work\\beta');
    expect(f.label.textContent).toBe('beta');expect(f.state.draft).toBe('');
    expect(f.state.homePendingFiles).toEqual([]);
    f.elements.goal.value='Beta draft';f.context.homeSaveDraft('Beta draft');
    f.context.homeSelectProject({path:'C:\\work\\alpha',name:'alpha'});
    expect(f.elements.goal.value).toBe('Keep this draft');expect(f.state.homePendingFiles).toEqual([file]);
    f.context.homeSelectProject({path:'C:\\work\\beta',name:'beta'});
    expect(f.elements.goal.value).toBe('Beta draft');
    expect(f.context.openRun).not.toHaveBeenCalled();
    f.context.homeRenderProjects(f.target,managed,sessions);chat.onclick();
    expect(f.context.openRun).toHaveBeenCalledWith('beta-chat',{chatish:false,mode:'agent',projectPath:'C:\\work\\beta'});
    expect(f.context.api).not.toHaveBeenCalled();
  });

  it('keeps pinned projects visible, gives renamed folders separate identities, and restores archived history', () => {
    const f=fixture(),projects=Array.from({length:7},(_,i)=>({path:'C:/work/p'+i,name:'p'+i}));
    f.context.homeUpdateProject(projects[6]!.path,{pinned:true,name:'Pinned research'});
    f.context.homeUpdateProject(projects[0]!.path,{archived:true});
    f.context.homeRenderProjects(f.target,projects,[]);
    expect(f.target.innerHTML).toContain('Pinned research');expect(f.target.innerHTML).not.toContain('Select project p0');
    f.state.codeArchiveView=true;f.context.homeRenderProjects(f.target,projects,[]);
    expect(f.target.innerHTML).toContain('Select project p0');
    f.context.homeUpdateProject(projects[0]!.path,{archived:false});f.state.codeArchiveView=false;
    expect(f.context.homeBuildProjects(projects,[],projects[0]!.path).find((p:any)=>p.path===projects[0]!.path).current).toBe(true);
    expect(f.context.api).not.toHaveBeenCalled();
  });

  it('derives attention badges from actual saved gates and task states', () => {
    const f=fixture();expect(JSON.parse(JSON.stringify(f.context.homeProjectStatus([
      {status:'running',pendingQuestions:{id:'question'}},{status:'running'},{status:'failed'},{status:'completed'}
    ])))).toEqual([{kind:'attention',count:1,label:'Needs attention'},{kind:'failed',count:1,label:'Failed'},{kind:'running',count:1,label:'Running'}]);
  });

  it('redacts every saved draft and does not erase newer text after an older submission finishes', () => {
    const f=fixture();f.context.homeActivateDraft(f.state.settings.projectPath);
    f.context.homeSaveDraft('secret draft');f.context.homeSaveFollowDraft('run','secret follow');
    expect(f.context.homeWorkspaceSnapshot().drafts['c:/work/alpha']).toBe('[redacted] draft');
    expect(f.context.homeWorkspaceSnapshot().followDrafts.run).toBe('[redacted] follow');
    f.context.homeClearStartedDraft(f.state.settings.projectPath,'previous draft');expect(f.state.draft).toBe('secret draft');
    f.context.homeClearStartedDraft(f.state.settings.projectPath,'secret draft');expect(f.state.draft).toBe('');expect(f.elements.goal.value).toBe('');
    f.context.homeRestoreFollowDraft('run','older');expect(f.state.codeWorkspace.followDrafts.run).toBe('secret follow');
  });

  it('escapes project labels and paths while offering creation guidance when empty', () => {
    const f = fixture();
    f.state.settings.projectPath = '';
    f.context.homeRenderProjects(f.target, [{ name: '<script>bad</script>', path: 'C:\\work\\a"bad' }], [{ runId: 'chat', projectPath: 'C:\\work\\a"bad', goal: '<img onerror=bad>', startedAt: '2026-10-09' }]);
    expect(f.target.innerHTML).not.toContain('<script>');
    expect(f.target.innerHTML).not.toContain('<img onerror=bad>');
    expect(f.target.innerHTML).toContain('a&quot;bad');
    f.context.homeRenderProjects(f.target, [], []);
    expect(f.target.innerHTML).toContain('Create a project or open a folder');
  });

  it('keeps session projects usable if directory listing fails and offers a retry', async () => {
    const f = fixture();
    f.context.api.mockImplementation((path: string) => path === '/api/projects' ? Promise.reject(new Error('unavailable')) : Promise.resolve([{ runId: 'alpha-chat', projectPath: 'C:\\work\\alpha', goal: 'Continue my work' }]));
    await f.context.homeLoadProjects();
    expect(f.target.innerHTML).toContain('data-home-chat="0:0"');
    expect(f.target.innerHTML).toContain('C:\\work\\alpha');
    expect(f.target.insertAdjacentHTML).toHaveBeenCalledWith('beforeend', expect.stringContaining('Some projects or conversations could not load'));
    expect(f.elements.homeRetryProjects.onclick).toBeTypeOf('function');
  });

  it('clears a transient loading error when the same projects recover', async () => {
    const f=fixture(),success=(path:string)=>Promise.resolve(path==='/api/projects'?{projects:[]}:[]);
    f.context.api.mockImplementation(success);await f.context.homeLoadProjects();
    const healthy=f.target.innerHTML;expect(healthy).toContain('Select project alpha');
    f.context.api.mockRejectedValue(new Error('offline'));await f.context.homeLoadProjects();
    expect(f.target.innerHTML).toContain('Could not load projects');
    f.context.api.mockImplementation(success);await f.context.homeLoadProjects();
    expect(f.target.innerHTML).toBe(healthy);
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
