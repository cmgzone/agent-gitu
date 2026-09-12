import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_JS } from '../src/server/ui-cowork.js';

function ui() {
  const agents = [{ id: 'chief', name: 'Chief' }];
  const convs = [{ id: 'group', kind: 'group', memberIds: ['chief'] }];
  const cw = { agents, convs, active: 'group', generation: 1, msgs: [], lastSeq: 0, busy: false, computersChecked: Date.now() };
  const input = { value: 'Unsent draft', selectionStart: 4 };
  const mentions = { innerHTML: '', appendChild: vi.fn() };
  const elements: Record<string, unknown> = { cwInput: input, cwMentions: mentions, cwMemberNames: { textContent: '' } };
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
  const context = createContext({
    S: { active: 'cowork', cw }, window: { addEventListener: vi.fn() },
    document: { createElement: () => ({}) }, $: (id: string) => elements[id],
    EventSource: Stream, clearInterval: vi.fn(), api,
  });
  new Script(COWORK_JS).runInContext(context);
  // Keep the actual snapshot, roster and stream lifecycle code. Rendering the
  // surrounding panels is covered by the browser fixture.
  for (const name of ['cwRenderRail', 'cwRenderMsgs', 'cwRenderInfo', 'cwRenderTyping', 'cwRenderProgress']) context[name] = vi.fn();
  return { context, cw: context.S.cw, input, mentions, streams, api };
}

describe('Cowork UI live updates', () => {
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
