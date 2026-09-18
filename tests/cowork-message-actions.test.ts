import { createContext, Script } from 'node:vm';
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_JS } from '../src/server/ui-cowork.js';

function fixture() {
  const nodes: Record<string, ReturnType<typeof node>> = {};
  function node() {
    return { value: '', innerHTML: '', style: { height: '' }, selectionStart: 0,
      focus: vi.fn(), remove: vi.fn(), disabled: false, onclick: null as null | (() => unknown),
      appendChild: vi.fn(), querySelectorAll: () => [],
      querySelector: (id: string) => nodes[id] ||= node(),
    };
  }
  const input = nodes.cwInput = node();
  nodes.cwReferences = node();
  nodes.cwMentions = node();
  const api = vi.fn().mockResolvedValue({});
  const copy = vi.fn().mockResolvedValue(undefined);
  const context = createContext({
    S: { active: 'cowork', cw: { active: 'conv', threadId: null, msgs: [], lastSeq: 0,
      agents: [{ id: 'chief', name: 'Chief' }], convs: [{ id: 'conv', kind: 'group', memberIds: ['chief'] }] } },
    window: { addEventListener: vi.fn() }, document: { createElement: node, body: { appendChild: vi.fn() } },
    navigator: { clipboard: { writeText: copy } }, crypto: { randomUUID }, URL,
    $: (id: string) => nodes[id], api, toast: vi.fn(), confirm: () => true,
    esc: (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    clearInterval: vi.fn(), setInterval: vi.fn(),
  });
  new Script(COWORK_JS).runInContext(context);
  for (const name of ['cwRenderMsgs', 'cwRenderProgress', 'cwRenderTyping', 'cwRenderRail', 'cwRenderInfo', 'cwRenderChat', 'cwPoll', 'cwStartStream']) context[name] = vi.fn();
  context.cwEnsure();
  return { context, cw: context.S.cw, nodes, input, api, copy };
}
function message(patch = {}) {
  return { id: 'm1', seq: 1, role: 'user', text: 'Original', revision: 0, attempt: 0, changeSeq: 1, status: 'sent', ...patch };
}

describe('cwBody markdown tables', () => {
  it('renders a pipe table as a real table, not raw ---|---', () => {
    const u = fixture();
    const html = u.context.cwBody('Before\n\n| Category | Status |\n|----------|--------|\n| Polish   | Done   |\n\nAfter', []);
    expect(html).toContain('<table class="cw-table">');
    expect(html).toContain('<th>Category</th>');
    expect(html).toContain('<td>Polish</td>');
    expect(html).not.toContain('----------|--------');
    expect(html).toContain('Before');
    expect(html).toContain('After');
  });

  it('escapes cell content so markup cannot smuggle through a table', () => {
    const u = fixture();
    const html = u.context.cwBody('| A | B |\n|---|---|\n| <img src=x onerror=alert(1)> | `code` |', []);
    expect(html).toContain('<table');
    expect(html).toContain('&lt;img src=x onerror=alert(1)>');
    expect(html).not.toContain('<img');
  });

  it('leaves non-table pipes and divider-less rows alone', () => {
    const u = fixture();
    expect(u.context.cwBody('a | b | c', [])).not.toContain('<table');
    expect(u.context.cwBody('| just | one |\n| row | here |', [])).not.toContain('<table');
  });

  it('embeds YouTube and Vimeo links as inline players in cowork bubbles', () => {
    const u = fixture();
    const html = u.context.cwBody('Watch https://www.youtube.com/watch?v=dQw4w9WgXcQ', []);
    expect(html).toContain('class="cw-embed"');
    expect(html).toContain('src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(html).toContain('allowfullscreen');
    expect(html).toContain('<a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"');
    expect(u.context.cwBody('https://youtu.be/dQw4w9WgXcQ', [])).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(u.context.cwBody('https://vimeo.com/123456789', [])).toContain('player.vimeo.com/video/123456789');
  });

  it('does not embed non-video links or hostile video URLs', () => {
    const u = fixture();
    expect(u.context.cwBody('Read https://example.com/docs', [])).not.toContain('cw-embed');
    expect(u.context.cwBody('https://youtu.be/abc', [])).not.toContain('cw-embed');
    expect(u.context.cwBody('https://www.youtube.com/watch', [])).not.toContain('cw-embed');
    expect(u.context.cwBody('https://notyoutube.com/watch?v=dQw4w9WgXcQ', [])).not.toContain('cw-embed');
    expect(u.context.cwBody('https://youtube.com/watch?v="><script>alert(1)</script>', [])).not.toContain('<script');
  });
});

describe('Cowork message actions', () => {
  it('renders Copy/Reference/Delete for outputs, edits only users, Retry only failures', () => {
    const u = fixture();
    const output = u.context.cwMessageActionsHtml(message({ role: 'agent' }));
    expect(output).toContain('>Copy<');
    expect(output).toContain('>Reference<');
    expect(output).toContain('>Delete<');
    expect(output).not.toContain('>Edit<');
    expect(output).not.toContain('>Retry<');
    expect(u.context.cwMessageActionsHtml(message())).not.toContain('>Retry<');
    expect(u.context.cwMessageActionsHtml(message({ status: 'failed' }))).toContain('>Retry<');
    for (const status of ['sending', 'retrying']) {
      expect(u.context.cwMessageActionsHtml(message({ status }))).toContain('data-cwaction="edit" disabled');
      expect(u.context.cwMessageActionsHtml(message({ status }))).toContain('data-cwaction="delete" disabled');
    }
  });

  it('copies raw user and output text', async () => {
    const u = fixture();
    for (const role of ['user', 'agent']) {
      u.cw.msgs = [message({ role, text: '**raw**\ntext' })];
      await u.context.cwMessageAction('copy', 'm1');
      expect(u.copy).toHaveBeenLastCalledWith('**raw**\ntext');
    }
  });

  it('keeps reference chips deduplicated and independent of member @mentions', () => {
    const u = fixture();
    u.cw.msgs = [message({ text: '<script>' })];
    u.input.value = 'Draft';
    u.context.cwMessageAction('reference', 'm1');
    u.context.cwMessageAction('reference', 'm1');
    expect(u.cw.referencedMessageIds).toEqual(['m1']);
    expect(u.input.value).toBe('Draft');
    expect(u.nodes.cwReferences!.innerHTML).toContain('&lt;script>');
    u.context.cwRenderMembers();
    const member = u.nodes.cwMentions!.appendChild.mock.calls[0]![0];
    member.onclick();
    expect(u.input.value).toBe('Draft@Chief ');
    expect(u.cw.referencedMessageIds).toEqual(['m1']);
  });

  it('retains failed POST payload and UUID, replays it, then retries stored failure via /retry', async () => {
    const u = fixture();
    u.input.value = 'Send';
    u.cw.pendingFiles = [{ name: 'a.txt', dataUrl: 'data:text/plain;base64,YQ==' }];
    u.cw.referencedMessageIds = ['ref'];
    u.api.mockRejectedValueOnce(new Error('offline'));
    await u.context.cwSend();
    const id = u.cw.msgs[0].id;
    const payload = u.api.mock.calls[0]![1].body;
    expect(JSON.parse(payload)).toMatchObject({ id, text: 'Send', referencedMessageIds: ['ref'] });
    expect(u.cw.msgs).toHaveLength(1);
    expect(u.cw.msgs[0].status).toBe('failed');
    expect(u.cw.referencedMessageIds).toEqual(['ref']);
    expect(u.cw.outbox[id].payload.files).toHaveLength(1);
    u.api.mockResolvedValueOnce({ message: message({ id, status: 'failed' }) });
    await u.context.cwMessageAction('retry', id);
    expect(u.api.mock.calls[1]![0]).toBe('/api/cowork/conversations/conv/messages');
    expect(u.api.mock.calls[1]![1].body).toBe(payload);
    expect(u.cw.msgs).toHaveLength(1);
    expect(u.cw.outbox[id]).toBeUndefined();
    u.api.mockResolvedValueOnce({ message: message({ id, attempt: 1, status: 'retrying', changeSeq: 2 }) });
    await u.context.cwMessageAction('retry', id);
    expect(u.api.mock.calls[2]![0]).toBe('/api/cowork/conversations/conv/messages/' + id + '/retry');
    expect(JSON.parse(u.api.mock.calls[2]![1].body)).toEqual({ attempt: 0 });
    expect(u.cw.msgs).toHaveLength(1);
  });
  it('does not skip intervening messages when POST responds before the snapshot', async () => {
    const u = fixture();
    u.input.value = 'Send';
    u.api.mockImplementationOnce((_url, opts) => Promise.resolve({ message: message({ id: JSON.parse(opts.body).id, seq: 5, changeSeq: 5 }) }));
    await u.context.cwSend();
    expect(u.cw.lastSeq).toBe(0);
    const own = u.cw.msgs[0];
    u.context.cwApplySnapshot({ messages: [message({ id: 'earlier', seq: 4 }), own], messageChangeSeq: 5 });
    expect(u.cw.msgs.map((m: { id: string }) => m.id)).toEqual(['earlier', own.id]);
    expect(u.cw.lastSeq).toBe(5);
  });

  it('discards an unconfirmed local row only on successful DELETE or confirmed not-found', async () => {
    const u = fixture();
    u.input.value = 'Unsent';
    u.api.mockRejectedValueOnce(new Error('offline'));
    await u.context.cwSend();
    const id = u.cw.msgs[0].id;
    u.api.mockRejectedValueOnce(new Error('offline'));
    await u.context.cwMessageAction('delete', id);
    expect(u.cw.outbox[id]).toBeDefined();
    u.api.mockRejectedValueOnce(new Error('{"error":"message not found"}'));
    await u.context.cwMessageAction('delete', id);
    expect(u.cw.outbox[id]).toBeUndefined();
    expect(u.cw.msgs).toEqual([]);
  });

  it('keeps stale modal edits and late mutation responses out of a different thread', async () => {
    const u = fixture();
    u.cw.msgs = [message()];
    u.context.cwMessageAction('edit', 'm1');
    u.context.cwMergeMessage(message({ revision: 1, changeSeq: 2 }));
    u.nodes['#cwEditText']!.value = 'Stale';
    await u.nodes['#cwEditSave']!.onclick!();
    expect(u.api).not.toHaveBeenCalled();
    let resolve!: (v: unknown) => void;
    u.api.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const pending = u.context.cwMutateMessage(u.cw.msgs[0], 'PATCH', '', { text: 'New', revision: 1 });
    u.context.cwSwitchThread('other');
    resolve({ message: message({ text: 'New', revision: 2, changeSeq: 3 }) });
    await pending;
    expect(u.cw.msgs).toEqual([]);
  });


  it('edits local failures without sending; stored edits PATCH the expected revision', async () => {
    const u = fixture();
    u.input.value = 'Before';
    u.api.mockRejectedValueOnce(new Error('offline'));
    await u.context.cwSend();
    const id = u.cw.msgs[0].id;
    u.context.cwMessageAction('edit', id);
    u.nodes['#cwEditText']!.value = 'After';
    await u.nodes['#cwEditSave']!.onclick!();
    expect(u.api).toHaveBeenCalledTimes(1);
    expect(u.cw.outbox[id].payload).toMatchObject({ id, text: 'After' });
    expect(u.cw.msgs[0]).toMatchObject({ id, text: 'After', status: 'failed' });
    u.context.cwMergeMessage(message({ id, revision: 3 }));
    u.context.cwMessageAction('edit', id);
    u.nodes['#cwEditText']!.value = 'Stored edit';
    u.api.mockResolvedValueOnce({ message: message({ id, text: 'Stored edit', revision: 4, changeSeq: 5 }) });
    await u.nodes['#cwEditSave']!.onclick!();
    expect(u.api.mock.calls[1]![1].method).toBe('PATCH');
    expect(JSON.parse(u.api.mock.calls[1]![1].body)).toEqual({ text: 'Stored edit', revision: 3 });
    expect(u.cw.msgs).toHaveLength(1);
    expect(u.cw.msgs[0].revision).toBe(4);
  });

  it('merges by id, ignores old revisions/cursors, and never resurrects deletions', () => {
    const u = fixture();
    u.cw.msgs = [message({ localOnly: true, seq: undefined })];
    u.context.cwApplySnapshot({ messages: [message()], messageUpdates: [message()], messageChangeSeq: 1 });
    expect(u.cw.msgs).toHaveLength(1);
    u.context.cwApplySnapshot({ messageUpdates: [message({ text: 'Edited', revision: 2, changeSeq: 4 })], messageChangeSeq: 4 });
    u.context.cwApplySnapshot({ messages: [message()], removedMessageIds: ['m1'], messageChangeSeq: 2 });
    u.context.cwMergeMessage(message({ revision: 1, changeSeq: 5 }));
    expect(u.cw.msgs[0].text).toBe('Edited');
    expect(u.cw.lastChange).toBe(4);
    u.cw.referencedMessageIds = ['m1'];
    u.context.cwApplySnapshot({ removedMessageIds: ['m1'], messageChangeSeq: 6 });
    u.context.cwMergeMessage(message({ changeSeq: 4 }));
    expect(u.cw.msgs).toEqual([]);
    expect(u.cw.referencedMessageIds).toEqual([]);
  });

  it('does not regress stream confirmation when POST later fails or returns old data', async () => {
    const u = fixture();
    let reject!: (e: Error) => void;
    u.api.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    u.input.value = 'Send';
    const pending = u.context.cwSend();
    const id = u.cw.msgs[0].id;
    u.context.cwApplySnapshot({ messages: [message({ id, status: 'sent', changeSeq: 3 })], messageChangeSeq: 3 });
    reject(new Error('response lost'));
    await pending;
    expect(u.cw.msgs).toHaveLength(1);
    expect(u.cw.msgs[0].status).toBe('sent');
    expect(u.cw.outbox[id]).toBeUndefined();
    u.context.cwMergeMessage(message({ id, status: 'sending' }));
    expect(u.cw.msgs[0].status).toBe('sent');
  });

  it('prevents duplicate retries and deletes only after server confirmation', async () => {
    const u = fixture();
    u.cw.msgs = [message({ status: 'failed' })];
    let resolve!: (v: unknown) => void;
    u.api.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const pending = u.context.cwMessageAction('retry', 'm1');
    u.context.cwMessageAction('retry', 'm1');
    u.context.cwMessageAction('delete', 'm1');
    expect(u.api).toHaveBeenCalledTimes(1);
    resolve({ message: message({ status: 'failed', attempt: 1, changeSeq: 2 }) });
    await pending;
    u.api.mockRejectedValueOnce(new Error('active'));
    await u.context.cwMessageAction('delete', 'm1');
    expect(u.cw.msgs).toHaveLength(1);
    u.api.mockResolvedValueOnce({ ok: true });
    await u.context.cwMessageAction('delete', 'm1');
    expect(u.cw.msgs).toHaveLength(0);
  });

  it('retains failed rows across view switches, resets cursors, and isolates late responses', async () => {
    const u = fixture();
    let reject!: (e: Error) => void;
    u.api.mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
    u.input.value = 'Keep me';
    u.cw.referencedMessageIds = ['ref'];
    const pending = u.context.cwSend();
    const id = u.cw.msgs[0].id;
    u.cw.lastChange = 42;
    u.context.cwSwitchThread('topic');
    expect(u.cw.lastChange).toBe(0);
    reject(new Error('offline'));
    await pending;
    expect(u.cw.msgs).toEqual([]);
    expect(u.cw.referencedMessageIds).toEqual([]);
    u.context.cwSwitchThread(null);
    expect(u.cw.msgs[0]).toMatchObject({ id, text: 'Keep me', status: 'failed', referencedMessageIds: ['ref'] });
    u.cw.lastChange = 12;
    u.context.cwOpenConv('other');
    expect(u.cw.lastChange).toBe(0);
    expect(u.cw.msgs).toEqual([]);
    u.context.cwOpenConv('conv');
    expect(u.cw.msgs[0].id).toBe(id);
  });

});
