import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_SESSIONS_JS } from '../src/server/ui-cowork-sessions.js';
import { COWORK_NOW_JS } from '../src/server/ui-cowork-now.js';

function fixture() {
  const cw: any = { agents: [{ id: 'chief', name: 'Chief' }, { id: 'writer', name: 'Writer' }],
    convs: [{ id: 'old', kind: 'dm', memberIds: ['chief'] }, { id: 'keep', kind: 'dm', memberIds: ['writer'] }],
    active: 'old', threadId: 'topic', msgs: [{ id: 'message' }], busy: true,
    outbox: { old: { conversationId: 'old' }, keep: { conversationId: 'keep' } },
    chatViews: new Map([[JSON.stringify(['old', 'topic']), {}], [JSON.stringify(['keep', null]), {}]]) };
  const drafts = new Map([['hermes.cowork.draft.old.main', 'Old draft'], ['hermes.cowork.draft.old.topic.widget', '{}'], ['hermes.cowork.draft.keep.main', 'Keep draft']]);
  const controls: Record<string, any> = { '#cwSessionCancel': {}, '#cwSessionName': { value: '  Fresh research  ' }, '#cwSessionSave': { disabled: false } };
  const members = cw.agents.map((agent: any) => ({ getAttribute: () => agent.id, classList: { toggle: vi.fn() }, setAttribute: vi.fn() }));
  const modal: any = { isConnected: true, innerHTML: '', setAttribute: vi.fn(), querySelector: (selector: string) => controls[selector], querySelectorAll: () => members };
  const close = vi.fn(() => { modal.isConnected = false; });
  const context = createContext({ S: { active: 'cowork' }, cwEnsure: () => cw, cwActiveConv: () => cw.convs.find((item: any) => item.id === cw.active),
    esc: (value: unknown) => String(value ?? '').replace(/</g, '&lt;'), cwIcon: (name: string) => `<svg data-icon="${name}"></svg>`,
    document: { createElement: () => modal, body: { appendChild: vi.fn() } }, cwBindDialog: () => close,
    localStorage: { get length() { return drafts.size; }, key: (index: number) => [...drafts.keys()][index], removeItem: (key: string) => drafts.delete(key) },
    api: vi.fn(), toast: vi.fn(), cwAgentModal: vi.fn(), cwOpenConv: vi.fn(), cwStopPoll: vi.fn(), cwRenderChat: vi.fn(), cwRenderRail: vi.fn(), cwPurgeOfflineChat: vi.fn(), cwPersistOfflineRoster: vi.fn() });
  new Script(COWORK_SESSIONS_JS).runInContext(context);
  return { context, cw, drafts, modal, controls, members, close };
}

describe('Cowork session controls', () => {
  it('creates a fresh session with the same teammate without reusing the existing chat', async () => {
    const f = fixture(); f.context.api.mockResolvedValue({ conversation: { id: 'fresh', kind: 'dm', memberIds: ['chief'] } });
    f.context.cwNewSessionModal();
    await f.controls['#cwSessionSave'].onclick();
    expect(JSON.parse(f.context.api.mock.calls[0][1].body)).toEqual({ kind: 'dm', title: 'Fresh research', memberIds: ['chief'] });
    expect(f.cw.convs.map((item: any) => item.id)).toEqual(['old', 'keep', 'fresh']);
    expect(f.context.cwOpenConv).toHaveBeenCalledWith('fresh', null);
  });

  it('supports a group session and prevents duplicate submissions', async () => {
    const f = fixture(); let finish!: (value: any) => void;
    f.context.api.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    f.context.cwNewSessionModal(); f.members[1].onclick();
    const saving = f.controls['#cwSessionSave'].onclick(); f.controls['#cwSessionSave'].onclick();
    expect(f.context.api).toHaveBeenCalledOnce();
    expect(JSON.parse(f.context.api.mock.calls[0][1].body)).toMatchObject({ kind: 'group', memberIds: ['chief', 'writer'] });
    finish({ conversation: { id: 'group', memberIds: ['chief', 'writer'] } }); await saving;
  });

  it('requires a teammate and permits retry after a failed creation', async () => {
    const f = fixture(); f.context.cwNewSessionModal(); f.members[0].onclick();
    f.controls['#cwSessionSave'].onclick(); expect(f.context.api).not.toHaveBeenCalled();
    f.members[1].onclick(); f.context.api.mockRejectedValue(new Error('offline'));
    await f.controls['#cwSessionSave'].onclick();
    expect(f.controls['#cwSessionSave'].disabled).toBe(false); expect(f.modal.isConnected).toBe(true);
    expect(f.cw.convs).toHaveLength(2); expect(f.context.toast).toHaveBeenCalledWith('offline', true);
  });

  it('keeps a delayed creation from navigating after the dialog is dismissed', async () => {
    const f = fixture(); let finish!: (value: any) => void;
    f.context.api.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    f.context.cwNewSessionModal(); const saving = f.controls['#cwSessionSave'].onclick(); f.close();
    finish({ conversation: { id: 'fresh' } }); await saving;
    expect(f.cw.convs.at(-1).id).toBe('fresh'); expect(f.context.cwOpenConv).not.toHaveBeenCalled();
  });

  it('opens teammate creation when no teammates exist', () => {
    const f = fixture(); f.cw.agents = []; f.context.cwNewSessionModal();
    expect(f.context.cwAgentModal).toHaveBeenCalledWith(null); expect(f.context.api).not.toHaveBeenCalled();
  });

  it('deletes an active session, stops its stream, clears its drafts, and opens a remaining session', async () => {
    const f = fixture(); f.context.api.mockResolvedValue({});
    await f.context.cwDeleteSession('old');
    expect(f.context.api).toHaveBeenCalledWith('/api/cowork/conversations/old', { method: 'DELETE' });
    expect(f.context.cwStopPoll).toHaveBeenCalledOnce(); expect(f.context.cwOpenConv).toHaveBeenCalledWith('keep');
    expect(f.cw).toMatchObject({ active: null, threadId: null, msgs: [], busy: false });
    expect(Object.keys(f.cw.outbox)).toEqual(['keep']); expect(f.cw.chatViews.size).toBe(1);
    expect([...f.drafts.entries()]).toEqual([['hermes.cowork.draft.keep.main', 'Keep draft']]);
  });

  it('preserves the current session when deleting another one', async () => {
    const f = fixture(); f.context.api.mockResolvedValue({}); await f.context.cwDeleteSession('keep');
    expect(f.cw.active).toBe('old'); expect(f.cw.msgs).toHaveLength(1); expect(f.cw.busy).toBe(true);
    expect(f.context.cwStopPoll).not.toHaveBeenCalled(); expect(f.context.cwOpenConv).not.toHaveBeenCalled();
  });

  it('renders an empty chat when the last session is deleted', async () => {
    const f = fixture(); f.cw.convs = [f.cw.convs[0]]; f.context.api.mockResolvedValue({});
    await f.context.cwDeleteSession('old');
    expect(f.context.cwRenderChat).toHaveBeenCalledOnce(); expect(f.context.cwOpenConv).not.toHaveBeenCalled();
    expect(f.cw.convs).toEqual([]);
  });

  it('preserves session state and drafts when deletion fails', async () => {
    const f = fixture(); f.context.api.mockRejectedValue(new Error('offline'));
    await expect(f.context.cwDeleteSession('old')).rejects.toThrow('offline');
    expect(f.cw.active).toBe('old'); expect(f.cw.convs).toHaveLength(2); expect(f.drafts.size).toBe(3);
    expect(f.context.cwStopPoll).not.toHaveBeenCalled();
  });

  it('connects the visible session controls to creation and session management', () => {
    const f = fixture(), elements: Record<string, any> = { cwSessionsBtn: {}, cwNewSessionBtn: {} };
    f.context.$ = (id: string) => elements[id]; f.context.wsOpen = vi.fn();
    new Script(COWORK_NOW_JS).runInContext(f.context); f.context.cwBindTopNav();
    elements.cwSessionsBtn.onclick(); expect(f.context.wsOpen).toHaveBeenCalledWith('cowork', 'Sessions');
    elements.cwNewSessionBtn.onclick(); expect(f.modal.innerHTML).toContain('Create session');
    expect(f.context.cwSessionNavHtml()).toContain('aria-label="New session"');
  });
});
