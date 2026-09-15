import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_JS } from '../src/server/ui-cowork.js';

function ui() {
  const agents = [{ id: 'chief', name: 'Chief' }];
  const convs = [{ id: 'group', kind: 'group', memberIds: ['chief'] }];
  const cw = { agents, convs, active: 'group', generation: 1, msgs: [], lastSeq: 0, busy: false, computersChecked: Date.now() };
  const input = { value: 'Unsent draft', selectionStart: 4 };
  const mentions = { innerHTML: '', appendChild: vi.fn() };
  const gateway = {
    cwTgFind: { onclick: null as null | (() => void) },
    cwTgSave: { onclick: null as null | (() => void) },
    cwTgChat: { value: '', selectedOptions: [] as { textContent?: string }[], innerHTML: '', onchange: null as null | (() => void) },
    cwTgChatId: { value: '' },
    cwTgToken: { value: '' },
    cwTgOn: { checked: true },
    cwSchSave: { onclick: null as null | (() => void) },
    cwSchEvery: { value: '' },
    cwSchGoal: { value: '' },
    cwSchOn: { checked: false },
  };
  const elements: Record<string, unknown> = { cwInput: input, cwMentions: mentions, cwMemberNames: { textContent: '' }, ...gateway };
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
  const modals: { className: string; innerHTML: string }[] = [];
  const context = createContext({
    S: { active: 'cowork', cw }, window: { addEventListener: vi.fn() },
    document: {
      createElement: () => {
        const element = { className: '', innerHTML: '', querySelector: () => ({ onclick: null }), remove: vi.fn(), appendChild: vi.fn() };
        modals.push(element);
        return element;
      },
      body: { appendChild: vi.fn() },
    },
    $: (id: string) => elements[id],
    EventSource: Stream, clearInterval: vi.fn(), api, toast: vi.fn(),
    esc: (s: unknown) => String(s ?? ''),
  });
  new Script(COWORK_JS).runInContext(context);
  // Keep the actual snapshot, roster and stream lifecycle code. Rendering the
  // surrounding panels is covered by the browser fixture.
  for (const name of ['cwRenderRail', 'cwRenderMsgs', 'cwRenderInfo', 'cwRenderTyping', 'cwRenderProgress']) context[name] = vi.fn();
  return { context, cw: context.S.cw, input, mentions, streams, api, gateway, modals };
}

describe('Cowork UI live updates', () => {
  it('includes direct-computer permission, member picker, work cards and document previews', () => {
    expect(COWORK_JS).toContain('id="cwAmHost"');
    expect(COWORK_JS).toContain('function cwAddMemberModal');
    expect(COWORK_JS).not.toContain("prompt('Add member");
    expect(COWORK_JS).toContain('data-cwrequest');
    expect(COWORK_JS).toContain('/api/cowork/artifacts/');
    expect(COWORK_JS).toContain('id="cwFile"');
    expect(COWORK_JS).toContain('id="cwTgChatId"');
    expect(COWORK_JS).toContain('Telegram user or group chat ID');
  });

  it('saves the Telegram gateway into cowork state, not the id="cw" DOM element', async () => {
    const u = ui();
    u.api.mockResolvedValue({
      ok: true,
      conversation: { id: 'group', kind: 'group', memberIds: ['chief'], telegram: { enabled: true, chatId: '42', chatTitle: 'Taskium', tokenSaved: true } },
    });
    u.context.cwGatewayHtml(u.cw.convs[0], 'dm').bind();
    u.gateway.cwTgSave.onclick!();
    await vi.waitFor(() => expect((u.cw.convs[0] as any).telegram.enabled).toBe(true));
    expect(u.api).toHaveBeenCalledWith('/api/cowork/conversations/group', expect.objectContaining({ method: 'POST' }));
  });

  it('tracks threads, folders and widgets from live snapshots', () => {
    const u = ui();
    u.context.cwStartStream('group');
    u.streams[0]!.receive({
      busy: false,
      messages: [],
      threadId: null,
      threads: [{ id: 'th-1', title: 'Launch copy' }],
      folders: [{ id: 'fd-1', label: 'site', path: 'C:/site' }],
      widgets: [{ id: 'wg-1', title: 'Build', kind: 'progress', data: { value: 40 } }],
    });
    expect(u.streams[0]!.url).toContain('thread=main');
    expect(u.cw.threads.map((thread: any) => thread.title)).toEqual(['Launch copy']);
    expect(u.cw.folders[0].label).toBe('site');
    expect(u.cw.widgets[0].title).toBe('Build');
  });

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

  it('keeps simultaneous teammate progress in the live snapshot', () => {
    const u = ui();
    u.context.cwStartStream('group');
    u.streams[0]!.receive({
      busy: true,
      messages: [],
      progresses: [
        { agentId: 'chief', agentName: 'Chief', text: 'Coordinating' },
        { agentId: 'scout', agentName: 'Scout', text: 'Researching' },
      ],
    });
    expect(u.cw.progresses.map((progress: any) => progress.agentName)).toEqual(['Chief', 'Scout']);
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

  it('opens PDF previews without the sandbox attribute that blocks the built-in viewer', () => {
    const u = ui();
    u.cw.artifacts = [{ id: 'cf-pdf', name: 'report.pdf', mime: 'application/pdf', size: 2048 }];
    u.context.cwPreviewFile('cf-pdf');
    const modal = u.modals.at(-1)!;
    expect(modal.innerHTML).toContain('/api/cowork/artifacts/cf-pdf/preview');
    expect(modal.innerHTML).not.toContain('sandbox');
  });

  it('keeps other previews sandboxed and offers Open for every file type', () => {
    const u = ui();
    u.cw.artifacts = [{ id: 'cf-zip', name: 'bundle.zip', mime: 'application/zip', size: 512 }];
    u.context.cwPreviewFile('cf-zip');
    expect(u.modals.at(-1)!.innerHTML).toContain('sandbox="allow-downloads"');
    expect(u.context.cwFilesHtml(['cf-zip'])).toContain('data-cwpreview="cf-zip"');
  });

  it('renders media artifacts inline: image thumbnails and audio/video players', () => {
    const u = ui();
    u.cw.artifacts = [
      { id: 'cf-img', name: 'shot.png', mime: 'image/png', size: 10 },
      { id: 'cf-aud', name: 'clip.mp3', mime: 'audio/mpeg', size: 10 },
      { id: 'cf-vid', name: 'clip.mp4', mime: 'video/mp4', size: 10 },
      { id: 'cf-doc', name: 'report.pdf', mime: 'application/pdf', size: 10 },
    ];
    const html = u.context.cwFilesHtml(['cf-img', 'cf-aud', 'cf-vid', 'cf-doc']);
    expect(html).toContain('<img class="cw-thumb"');
    expect(html).toContain('/api/cowork/artifacts/cf-img?inline=1');
    expect(html).toContain('<audio class="cw-media" controls');
    expect(html).toContain('<video class="cw-media" controls');
    // PDFs stay on the Open/Preview path; only real media streams inline.
    expect(html).not.toContain('cf-doc?inline=1');
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
