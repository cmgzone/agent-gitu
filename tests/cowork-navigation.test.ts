import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_JS } from '../src/server/ui-cowork.js';
import { Element } from './helpers/subagent-dom.js';

function fixture() {
  const cw: any = { active: 'atlas', threadId: null, agents: [{ id: 'atlas', name: 'Atlas' }, { id: 'nova', name: 'Nova' }],
    convs: [{ id: 'atlas', kind: 'dm', memberIds: ['atlas'] }, { id: 'nova', kind: 'dm', memberIds: ['nova'] }],
    msgs: [], workHistory: [], requests: [], artifacts: [], todos: [], subAgents: { nodes: [] }, computersChecked: Date.now() };
  const elements: Record<string, any> = {};
  const api = vi.fn().mockResolvedValue({});
  const context = createContext({ S: { active: 'cowork', cw }, api, toast: vi.fn(), esc: (value: unknown) => String(value ?? ''),
    $: (id: string) => elements[id], window: { innerWidth: 1440, addEventListener: vi.fn() },
    document: { createElement: (tag: string) => new Element(tag), addEventListener: vi.fn(), activeElement: null },
    setInterval: vi.fn(), clearInterval: vi.fn() });
  new Script(COWORK_JS).runInContext(context);
  for (const name of ['cwRenderRail', 'cwRenderChat', 'cwRenderMembers', 'cwRenderTyping', 'cwRenderInfo', 'cwStartStream', 'cwPoll', 'cwBindFileCards', 'cwBindRequests', 'cwSyncSubagentOrbs']) context[name] = vi.fn();
  return { context, cw, api, elements };
}

class ScrollWrap extends Element {
  clientHeight = 240;
  onscroll?: () => void;
  private position = 0;
  get scrollHeight() { return this.children.length * 200; }
  get scrollTop() { return this.position; }
  set scrollTop(value: number) { this.position = Math.max(0, Math.min(value || 0, this.scrollHeight - this.clientHeight)); }
  override appendChild(child: Element) {
    super.appendChild(child);
    child.getBoundingClientRect = () => {
      const top = this.children.indexOf(child) * 200 - this.scrollTop;
      return { top, bottom: top + 200, left: 0, width: 400, height: 200 };
    };
  }
  override insertBefore(child: Element, before: Element | null) {
    super.insertBefore(child, before);
    child.getBoundingClientRect = () => {
      const top = this.children.indexOf(child) * 200 - this.scrollTop;
      return { top, bottom: top + 200, left: 0, width: 400, height: 200 };
    };
  }
  override getBoundingClientRect() { return { top: 0, bottom: 240, left: 0, width: 400, height: 240 }; }
}

function transcript() {
  const u = fixture(), wrap = new ScrollWrap();
  u.cw.msgs = Array.from({ length: 8 }, (_, i) => ({ id: 'm-' + i, seq: i + 1, role: 'user', ts: new Date(i * 1000).toISOString(), text: 'Message ' + i }));
  u.elements.cwMsgs = wrap;
  // Simulate native scroll clamping while the old transcript is removed.
  const replace = u.context.cwReplaceTranscript;
  u.context.cwReplaceTranscript = (element: ScrollWrap, html: string) => {
    replace(element, html);
    element.scrollTop = 0;
    u.elements.cwLive = element.children.at(-1);
  };
  u.context.cwRenderMsgs();
  return { ...u, wrap };
}

describe('Cowork chat navigation', () => {
  it('loads the roster and conversations together instead of making the second wait', async () => {
    const u = fixture();
    let roster!: (data: unknown) => void, rooms!: (data: unknown) => void;
    u.api.mockImplementation((url: string) => new Promise(resolve => { if (url.endsWith('/agents')) roster = resolve; else rooms = resolve; }));
    const load = u.context.cwLoad(true);
    expect(u.api.mock.calls.map(([url]) => url)).toEqual(['/api/cowork/agents', '/api/cowork/conversations']);
    rooms({ conversations: u.cw.convs }); roster({ agents: u.cw.agents }); await load;
    expect(u.context.cwRenderMembers).toHaveBeenCalledOnce();
    expect(u.context.cwRenderChat).not.toHaveBeenCalled();
  });

  it('ignores an old roster request after leaving Cowork or starting a newer refresh', async () => {
    const u = fixture(), pending: ((data: unknown) => void)[] = [];
    u.api.mockImplementation(() => new Promise(resolve => pending.push(resolve)));
    const older = u.context.cwLoad(true), newer = u.context.cwLoad(true);
    pending[2]!({ agents: u.cw.agents }); pending[3]!({ conversations: u.cw.convs }); await newer;
    pending[0]!({ agents: [] }); pending[1]!({ conversations: [] }); await older;
    expect(u.cw.agents).toHaveLength(2); expect(u.cw.convs).toHaveLength(2);
    const departed = u.context.cwLoad(true); u.context.S.active = 'home';
    pending[4]!({ agents: [] }); pending[5]!({ conversations: [] }); await departed;
    expect(u.cw.agents).toHaveLength(2);
  });

  it('restores a visited teammate before polling and keeps another thread’s messages isolated', () => {
    const u = fixture();
    u.cw.msgs = [{ id: 'saved', seq: 8, text: 'Atlas report' }]; u.cw.lastSeq = 8; u.cw.lastChange = 12;
    u.cw.workHistory = [{ id: 'step', tool: 'read_file' }]; u.cw.subAgents = { nodes: [{ id: 'atlas-worker' }] };
    u.context.cwOpenConv('nova');
    expect(u.cw.msgs).toEqual([]); expect(u.cw.subAgents.nodes).toEqual([]);
    u.cw.msgs = [{ id: 'nova-report', text: 'Nova report' }];
    u.context.cwOpenConv('atlas');
    expect(u.cw.msgs.map((message: any) => message.id)).toEqual(['saved']);
    expect(u.cw.lastSeq).toBe(8); expect(u.cw.lastChange).toBe(12); expect(u.cw.workHistory[0].id).toBe('step');
    expect(u.context.cwRenderChat.mock.invocationCallOrder.at(-1)).toBeLessThan(u.context.cwPoll.mock.invocationCallOrder.at(-1));
    u.context.cwSwitchThread('topic'); expect(u.cw.msgs).toEqual([]);
    u.context.cwSwitchThread(null); expect(u.cw.msgs[0].id).toBe('saved');
  });

  it('bounds visited-chat memory and merges optimistic messages without duplicating them', () => {
    const u = fixture();
    for (let i = 0; i < 20; i++) { u.cw.active = 'room-' + i; u.context.cwRememberChat(); }
    expect(u.cw.chatViews.size).toBe(12);
    u.cw.outbox = { pending: { conversationId: u.cw.active, payload: {}, message: { id: 'pending', text: 'Draft', localOnly: true } } };
    u.context.cwRestoreChat(); u.context.cwRestoreChat();
    expect(u.cw.msgs.filter((message: any) => message.id === 'pending')).toHaveLength(1);
    expect(u.cw.outbox.pending).toBeDefined();
  });

  it('preserves a visible message across transcript replacement and inserted earlier activity', () => {
    const u = transcript(); u.wrap.scrollTop = 450;
    const before = u.wrap.children.find(node => node.getAttribute('data-cwscroll-key') === 'm-3')!.getBoundingClientRect().top;
    u.cw.msgs.unshift({ id: 'earlier', role: 'user', ts: new Date(-1000).toISOString(), text: 'Earlier update' });
    u.context.cwRenderMsgs();
    expect(u.wrap.scrollTop).toBe(650);
    expect(u.wrap.children.find(node => node.getAttribute('data-cwscroll-key') === 'm-3')!.getBoundingClientRect().top).toBe(before);
    expect(u.wrap._cwScrollState.follow).toBe(false);
  });

  it('follows new messages at the bottom and keeps manual scrolling available without a scroll button', () => {
    const u = transcript();
    expect(u.wrap.scrollTop).toBe(u.wrap.scrollHeight - u.wrap.clientHeight);
    u.cw.msgs.push({ id: 'new', role: 'user', ts: new Date(9000).toISOString(), text: 'Newest message' });
    u.context.cwRenderMsgs();
    expect(u.wrap.scrollTop).toBe(u.wrap.scrollHeight - u.wrap.clientHeight);
    u.wrap.scrollTop = 100; u.wrap.onscroll?.();
    expect(u.wrap._cwScrollState.follow).toBe(false);
    expect(COWORK_JS).not.toContain('id="cwJumpLatest"');
    u.context.cwJumpLatest();
    expect(u.wrap.scrollTop).toBe(u.wrap.scrollHeight - u.wrap.clientHeight);
    expect(u.wrap._cwScrollState.follow).toBe(true);
  });

  it('retains the reading position while a mobile profile hides the transcript', () => {
    const u = transcript(); u.wrap.scrollTop = 450; u.context.cwUpdateJumpLatest();
    const saved = u.context.cwCaptureScroll(u.wrap);
    u.wrap.clientHeight = 0;
    u.cw.msgs.push({ id: 'hidden-update', role: 'user', ts: new Date(9000).toISOString(), text: 'Update while hidden' });
    u.context.cwRenderMsgs();
    const hiddenState = u.context.cwCaptureScroll(u.wrap);
    u.wrap.clientHeight = 240; u.context.cwRestoreScroll(u.wrap, hiddenState);
    expect(u.wrap.scrollTop).toBe(450); expect(u.wrap._cwScrollState.follow).toBe(false);
    expect(saved.follow).toBe(false);
    u.wrap.clientHeight = 0; u.context.cwJumpLatest();
    const follow = u.context.cwCaptureScroll(u.wrap);
    u.wrap.clientHeight = 240; u.context.cwRestoreScroll(u.wrap, follow);
    expect(u.wrap.scrollTop).toBe(u.wrap.scrollHeight - u.wrap.clientHeight);
  });
});
