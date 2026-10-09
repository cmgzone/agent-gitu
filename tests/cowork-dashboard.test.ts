import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_DASHBOARD_JS } from '../src/server/ui-cowork-dashboard.js';
import { COWORK_JS } from '../src/server/ui-cowork.js';
import { CONNECTED_APPS_JS } from '../src/server/ui-connected-apps.js';
import { COWORK_PROFILE_JS } from '../src/server/ui-cowork-profile.js';
import { UI_HTML } from '../src/server/ui.js';

function fixture() {
  const agent = { id: 'gitu', name: 'Gitu', tagline: '', description: '', systemPrompt: 'Help the user.', roles: [], skills: ['browser-workflow'], avatar: { shape: 'dot-blue' } };
  const cw: any = { agents: [agent], convs: [{ id: 'dm', kind: 'dm', memberIds: ['gitu'] }], active: 'dm', selectedAgentId: 'gitu', skills: [{ name: 'browser-workflow', description: 'Browser tasks', scope: 'builtin' }], profileOpen: true, profileAgentId: 'gitu', profileSection: 'overview' };
  const elements: Record<string, any> = {};
  const buttons = ['personality', 'roles', 'skills', 'memory', 'connections'].map(section => ({ dataset: { profileSection: section }, focus: vi.fn() }));
  const root = { innerHTML: '', querySelectorAll: (selector: string) => selector === '[data-profile-section]' ? buttons : [] };
  elements.cwChat = root;
  for (const id of ['cwInfoBtn', 'cwProfileAvatar', 'cwProfileSettings', 'cwProfileNameEdit', 'cwProfileDescriptionEdit', 'cwProfileStart', 'cwProfileClose']) elements[id] = {};
  buttons.forEach((button, index) => { elements['cwProfileTab-' + buttons[index]!.dataset.profileSection] = button; });
  const context = createContext({
    cwEnsure: () => cw, cwAgentById: (id: string) => cw.agents.find((item: any) => item.id === id), cwActiveConv: () => cw.convs[0],
    $: (id: string) => elements[id], esc: (value: unknown) => String(value ?? '').replace(/</g, '&lt;'),
    cwIcon: (name: string) => `<svg data-icon="${name}"></svg>`, cwAva: () => '<span class="cw-ava"></span>',
    cwCharacterActivity: () => 'Ready', cwCharacterStatusHtml: () => '<span>Ready</span>', cwBindTopNav: vi.fn(), cwSyncPanels: vi.fn(),
    cwSaveDraft: vi.fn(), cwClosePanels: vi.fn(), cwRenderChat: vi.fn(), cwOpenDm: vi.fn(), cwPoll: vi.fn(), cwStartStream: vi.fn(),
    cwAgentModal: vi.fn(), cwMissionModal: vi.fn(), cwOpenConnections: vi.fn(), toast: vi.fn(), document: { title: '', querySelectorAll: () => [] },
    api: vi.fn(), cwRenderRail: vi.fn(), cwActionWords: (value: string) => value,
  });
  new Script(COWORK_DASHBOARD_JS).runInContext(context);
  return { context, cw, elements, buttons, root, agent };
}

describe('Full-page Cowork profile', () => {
  it('keeps the complete production browser script valid', () => {
    expect(() => new Script(COWORK_JS + CONNECTED_APPS_JS + COWORK_PROFILE_JS + COWORK_DASHBOARD_JS)).not.toThrow();
    const script = UI_HTML.slice(UI_HTML.indexOf('<script>') + 8, UI_HTML.indexOf('</script>'));
    expect(() => new Script(script)).not.toThrow();
  });

  it('navigates all five sections and supports keyboard selection', () => {
    const f = fixture();
    f.context.cwBindProfileForms = vi.fn(); f.context.cwUpdateProfileData = vi.fn();
    f.context.cwRenderProfilePage();
    expect(f.cw.profileSection).toBe('personality');
    expect(f.root.innerHTML).toContain('cwPersonalityForm');
    expect(f.root.innerHTML).not.toContain('Researcher');
    for (const button of f.buttons) {
      (button as any).onclick();
      expect(f.cw.profileSection).toBe(button.dataset.profileSection);
      expect(f.root.innerHTML).toContain(`aria-labelledby="cwProfileTab-${button.dataset.profileSection}"`);
      expect(f.root.innerHTML).not.toContain('cw-overview-grid');
    }
    f.buttons[0]!.focus.mockClear();
    (f.buttons[4] as any).onkeydown({ key: 'Home', preventDefault: vi.fn() });
    expect(f.cw.profileSection).toBe('personality');
    expect(f.buttons[0]!.focus).toHaveBeenCalledOnce();
    (f.buttons[0] as any).onkeydown({ key: 'ArrowLeft', preventDefault: vi.fn() });
    expect(f.cw.profileSection).toBe('connections');
  });

  it('closes the profile without sending a message or discarding a draft', () => {
    const f = fixture(); f.cw.timer = 1;
    f.elements.cwInput = { value: 'Keep this draft', focus: vi.fn() };
    f.context.cwBindProfileForms = vi.fn(); f.context.cwUpdateProfileData = vi.fn();
    f.context.cwRenderProfilePage(); f.elements.cwProfileClose.onclick();
    expect(f.cw.profileOpen).toBe(false);
    expect(f.context.cwRenderChat).toHaveBeenCalledOnce();
    expect(f.elements.cwInput.value).toBe('Keep this draft');
    expect(f.context.api).not.toHaveBeenCalled();
  });

  it('persists personality through a partial agent update and retains the current identity', async () => {
    const f = fixture(); const submit = { disabled: false };
    const form: any = { isConnected: true, querySelector: () => submit };
    f.elements.cwPersonalityForm = form; f.elements.cwProfileError = { textContent: '' };
    f.elements.cwTraits = { value: 'Friendly, Focused' }; f.elements.cwCommunication = { value: 'Brief and clear' };
    f.elements.cwProactivity = { value: 'suggest' }; f.elements.cwInstructions = { value: 'Answer carefully.' };
    f.context.api.mockResolvedValue({ agent: { ...f.agent, personality: { traits: ['Friendly', 'Focused'], communicationStyle: 'Brief and clear', proactivity: 'suggest' } } });
    f.context.cwRenderProfilePage = vi.fn();
    f.context.cwBindProfileForms(f.agent); form.onsubmit({ preventDefault: vi.fn() });
    await new Promise(resolve => setImmediate(resolve));
    const body = JSON.parse(f.context.api.mock.calls[0][1].body);
    expect(body).toEqual({ id: 'gitu', systemPrompt: 'Answer carefully.', personality: { traits: ['Friendly', 'Focused'], communicationStyle: 'Brief and clear', proactivity: 'suggest' } });
    expect(body).not.toHaveProperty('allowShell'); expect(body).not.toHaveProperty('useHostComputer');
    expect(f.cw.agents[0].personality.traits).toEqual(['Friendly', 'Focused']);
  });

  it('does not replace a different profile with a delayed API response', async () => {
    const f = fixture(); let finish: (value: any) => void = () => {};
    f.context.api.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    f.context.cwUpdateProfileData = vi.fn(); f.cw.profileRevision = 1;
    // One shared promise lets both independent requests settle together.
    const pending = new Promise(resolve => { finish = resolve; }); f.context.api.mockReturnValue(pending);
    const load = f.context.cwLoadProfileData('gitu', 1); f.cw.profileAgentId = 'nova'; f.cw.profileRevision = 2;
    finish({ entries: [{ claim: 'Private Gitu memory' }], accounts: [] }); await load;
    expect(f.cw.profileData.nova).toBeUndefined();
    expect(f.cw.profileData.gitu).toEqual({ loading: true });
  });

  it('reports registry availability and only active assigned app accounts', () => {
    const f = fixture(); f.agent.skills.push('missing-skill');
    const overview = f.context.cwProfileOverview(f.agent);
    expect(overview).toContain('Not in registry'); expect(overview).not.toContain('Coding');
    const accounts = f.context.cwConnectedProfileAccounts({ accounts: [
      { id: 'own', status: 'ACTIVE' }, { id: 'off', status: 'ACTIVE', disabled: true }, { id: 'expired', status: 'EXPIRED' },
    ], mail: { accounts: [{ id: 'mail', status: 'ACTIVE' }] } });
    expect(accounts.map((item: any) => item.id)).toEqual(['own', 'mail']);
  });

  it('Start Task returns to the current agent without sending or discarding a draft', () => {
    const f = fixture(); f.cw.timer = 1; f.elements.cwInput = { value: 'My draft', focus: vi.fn() };
    f.context.cwReturnToChat();
    expect(f.cw.profileOpen).toBe(false); expect(f.context.cwRenderChat).toHaveBeenCalledOnce();
    expect(f.elements.cwInput.value).toBe('My draft'); expect(f.elements.cwInput.focus).toHaveBeenCalledOnce();
    expect(f.context.api).not.toHaveBeenCalled();
  });
  it('opens the existing mission workflow for Start Task without executing it', () => {
    const f = fixture(); f.cw.timer = 1;
    f.context.cwStartProfileTask();
    expect(f.context.cwMissionModal).toHaveBeenCalledOnce();
    expect(f.context.api).not.toHaveBeenCalled();
    expect(f.cw.pendingProfileMissionAgentId).toBeNull();
  });

  it('keeps a new section editor intact after a previous save completes', async () => {
    const f = fixture(), submit = { disabled: false }, form = { isConnected: false, querySelector: () => submit };
    f.elements.cwProfileError = { textContent: '' }; f.context.cwRenderProfilePage = vi.fn();
    f.context.api.mockResolvedValue({ agent: { ...f.agent, description: 'Saved' } });
    await f.context.cwSaveProfileFields(f.agent, { description: 'Saved' }, form);
    expect(f.cw.agents[0].description).toBe('Saved');
    expect(f.context.cwRenderProfilePage).not.toHaveBeenCalled();
  });

});
