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

  it('groups YouTube and Vimeo links into click-to-load preview cards', () => {
    const u = fixture();
    const html = u.context.cwBody('Watch https://www.youtube.com/watch?v=dQw4w9WgXcQ', []);
    expect(html).toContain('class="cw-embed"');
    expect(html).toContain('data-cwrichload="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(html).not.toContain('<iframe');
    expect(html).toContain('class="cw-rich-grid"');
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

describe('cwBody prose layout', () => {
  it('renders markdown headings as real headings, never as raw hashes', () => {
    const u = fixture();
    const html = u.context.cwBody(
      "Here's the inbox report.\n\n---\n\n## support@pikipos.com — Inbox Status\n\n### Two replies drafted\n\nSending is disabled.",
      [],
    );
    expect(html).toContain('<div class="cw-h cw-h2">support@pikipos.com — Inbox Status</div>');
    expect(html).toContain('<div class="cw-h cw-h3">Two replies drafted</div>');
    expect(html).not.toContain('#');
    expect(html).not.toContain('---');
    expect(html).toContain('Sending is disabled.');
  });

  it('drops decorative rule lines instead of printing their symbols', () => {
    const u = fixture();
    const html = u.context.cwBody('First part.\n\n*****\n\nSecond part.\n\n-----\n\n=====', []);
    expect(html).not.toContain('*****');
    expect(html).not.toContain('-----');
    expect(html).not.toContain('=====');
    expect(html).toBe('<span>First part.<br><br>Second part.</span>');
  });

  it('never leaves asterisks from bold-italic or italic runs', () => {
    const u = fixture();
    const html = u.context.cwBody('***Urgent*** and **bold** and *soft*', []);
    expect(html).toContain('<b><i>Urgent</i></b>');
    expect(html).toContain('<b>bold</b>');
    expect(html).toContain('<i>soft</i>');
    expect(html).not.toContain('*');
    const literal = u.context.cwBody('Use snake_case_table for 2 * 3 * 4 items', []);
    expect(literal).toContain('snake_case_table');
    expect(literal).toContain('2 * 3 * 4 items');
    expect(literal).not.toContain('<i>');
  });

  it('keeps fenced code verbatim: hash comments and dashed lines stay code', () => {
    const u = fixture();
    const html = u.context.cwBody('Sample:\n\n```python\n# a comment\n---\nprint(1)\n```', []);
    expect(html).toContain('cw-code');
    expect(html).toContain('# a comment');
    expect(html).toContain('---');
    expect(html).toContain('print(1)');
    expect(html).not.toContain('cw-h');
  });
});

describe('Cowork message actions', () => {
  it('interleaves requests with messages by creation time and keeps resolved answers inline', () => {
    const u = fixture();
    u.cw.msgs = [message({ text: 'Earlier message', ts: '2026-09-20T10:00:00Z' }), message({ id: 'm2', text: 'Later message', ts: '2026-09-20T10:02:00Z' })];
    const request = { id: 'q1', agentId: 'chief', kind: 'question', title: 'Choose a region', detail: 'Pick a launch region', options: ['EU', 'US'], status: 'open', createdAt: '2026-09-20T10:01:00Z' };
    u.cw.requests = [request];
    const html = u.context.cwTranscriptHtml();
    expect(html.indexOf('Earlier message')).toBeLessThan(html.indexOf('Choose a region'));
    expect(html.indexOf('Choose a region')).toBeLessThan(html.indexOf('Later message'));
    expect(html).toContain('cw-row cw-request-row');
    expect(html).toContain('aria-label="Answer: Choose a region"');
    const resolved = u.context.cwRequestHtml({ ...request, status: 'answered', response: 'EU <first>' });
    expect(resolved).toContain('Answered · EU &lt;first>');
    expect(resolved).not.toContain('data-cwrequest=');
    expect(resolved).not.toContain('<input');
  });

  it('renders requests from request-only snapshots without rebuilding the task list', () => {
    const u = fixture();
    u.context.cwRenderWork = vi.fn();
    const request = { id: 'q1', agentId: 'chief', kind: 'question', title: 'Choose', status: 'open' };
    u.context.cwApplySnapshot({ requests: [request] });
    expect(u.context.cwRenderMsgs).toHaveBeenCalledOnce();
    expect(u.context.cwRenderWork).not.toHaveBeenCalled();
    u.context.cwApplySnapshot({ requests: [request] });
    expect(u.context.cwRenderMsgs).toHaveBeenCalledOnce();
    u.context.cwApplySnapshot({ requests: [{ ...request, status: 'answered' }] });
    expect(u.context.cwRenderMsgs).toHaveBeenCalledTimes(2);
  });

  it('keeps typed answers, focus and selection while new messages arrive', () => {
    const u = fixture();
    // Restore the actual renderer; this fixture normally stubs surrounding UI.
    new Script(COWORK_JS).runInContext(u.context);
    u.context.cwRenderProgress = vi.fn();
    const before = { value: 'My answer draft', getAttribute: () => 'q1', selectionStart: 3, selectionEnd: 7 };
    const after = { ...before, value: '', focus: vi.fn(), setSelectionRange: vi.fn() };
    let rendered = false;
    const wrap = {
      scrollHeight: 700, scrollTop: 100, clientHeight: 400,
      get innerHTML() { return ''; }, set innerHTML(_html: string) { rendered = true; },
      querySelectorAll: (selector: string) => selector === '[data-cwanswer]' ? [rendered ? after : before] : [],
    };
    u.context.$ = (id: string) => id === 'cwMsgs' ? wrap : null;
    // This fixture models answer inputs; media DOM reconciliation has its own test.
    u.context.cwReplaceTranscript = (target: typeof wrap, html: string) => { target.innerHTML = html; };
    u.context.document.activeElement = before;
    u.context.cwRenderMsgs();
    expect(after.value).toBe('My answer draft');
    expect(after.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(after.setSelectionRange).toHaveBeenCalledWith(3, 7);
    expect(wrap.scrollTop).toBe(100);
  });

  it('submits inline answers once and replaces controls with the resolved request', async () => {
    const u = fixture();
    const request = { id: 'q1', agentId: 'chief', kind: 'question', status: 'open' };
    u.cw.requests = [request];
    const button = { disabled: false, onclick: null as null | (() => void), getAttribute: (name: string) => name === 'data-cwrequest' ? 'q1' : name === 'data-action' ? 'answer' : '' };
    const root = { querySelectorAll: (sel: string) => sel.indexOf('[data-cwrequest') === 0 ? [button] : [], querySelector: () => ({ value: '  EU  ' }) };
    let resolve: (value: unknown) => void = () => {};
    u.api.mockReturnValue(new Promise(done => { resolve = done; }));
    u.context.cwBindRequests(root);
    button.onclick!();
    button.onclick!();
    expect(u.api).toHaveBeenCalledOnce();
    expect(JSON.parse(u.api.mock.calls[0]![1].body)).toEqual({ action: 'answer', response: 'EU' });
    expect(button.disabled).toBe(true);
    resolve({ request: { ...request, status: 'answered', response: 'EU' } });
    await vi.waitFor(() => expect(u.context.cwRenderMsgs).toHaveBeenCalledOnce());
    expect(u.cw.requests[0].status).toBe('answered');
    expect(u.cw.requestPending.q1).toBeUndefined();
  });

  it('renders a secure credential card and provides only the saved connection id', async () => {
    const u = fixture();
    // connectionInputHtml lives in UI_CONNECTIONS_JS on the real page.
    u.context.connectionInputHtml = (field: string, value: string) =>
      `<input data-connection-field="${field}" value="${String(value ?? '').replace(/"/g, '&quot;')}" type="${field === 'token' ? 'password' : 'text'}">`;
    const request = { id: 'cr1', agentId: 'chief', kind: 'credential', title: 'GitHub API key', detail: 'Needed to call the GitHub API', options: [], status: 'open',
      credential: { providerHint: 'github', label: 'GitHub', baseUrl: 'https://api.github.com', validationPath: '/user' } };
    const html = u.context.cwRequestHtml(request);
    expect(html).toContain('Secure credential request');
    expect(html).toContain('data-cwcredential="cr1"');
    expect(html).toContain('type="password"');
    expect(html).toContain('value="https://api.github.com"');
    expect(html).not.toContain('data-cwanswer=');

    // Re-auth cards ask only for the key against the existing connection.
    const reauth = u.context.cwRequestHtml({ ...request, credential: { providerHint: 'github', connectionId: 'github' } });
    expect(reauth).toContain('data-cwreauth="github"');
    expect(reauth).not.toContain('data-connection-field="baseUrl"');

    // Submit: the key goes to POST /api/connections; only the connection id goes back.
    const fields = [
      { getAttribute: () => 'label', value: 'GitHub' },
      { getAttribute: () => 'provider', value: 'github' },
      { getAttribute: () => 'baseUrl', value: 'https://api.github.com' },
      { getAttribute: () => 'validationPath', value: '/user' },
      { getAttribute: () => 'token', value: 'ghp_secret' },
    ];
    const attrs: Record<string, string> = { 'data-cwcredential': 'cr1' };
    const form = {
      dataset: {},
      getAttribute: (name: string) => attrs[name] ?? '',
      querySelectorAll: (sel: string) => sel === '[data-connection-field]' ? fields : [],
      querySelector: (_sel: string) => null,
      onsubmit: null as null | ((event: { preventDefault: () => void }) => void),
    };
    u.context.cwBindCredentialForms({ querySelectorAll: (sel: string) => sel === '[data-cwcredential]' ? [form] : [] });
    u.api.mockResolvedValueOnce({ connection: { id: 'github' } }).mockResolvedValueOnce({ request: { ...request, status: 'provided' } });
    form.onsubmit!({ preventDefault: () => {} });
    await vi.waitFor(() => expect(u.api).toHaveBeenCalledTimes(2));
    const saveCall = u.api.mock.calls[0]!;
    expect(saveCall[0]).toBe('/api/connections');
    expect(JSON.parse(saveCall[1].body).token).toBe('ghp_secret');
    const provideCall = u.api.mock.calls[1]!;
    expect(provideCall[0]).toBe('/api/cowork/requests/cr1');
    expect(JSON.parse(provideCall[1].body)).toEqual({ action: 'provide', connectionId: 'github' });
  });

  it('keeps narrow panels closed until requested and restores the chat when dismissed', () => {
    const u = fixture();
    const classes = new Set<string>();
    const rail = { inert: false };
    const root = { classList: {
      contains: (name: string) => classes.has(name),
      toggle: (name: string, on: boolean) => on ? classes.add(name) : classes.delete(name),
      remove: (name: string) => classes.delete(name),
    }, querySelector: () => rail };
    const panel = { style: { display: '' } };
    const chat = { inert: false };
    const backdrop = { hidden: true };
    const trigger = { textContent: '', setAttribute: vi.fn(), focus: vi.fn() };
    const elements: Record<string, unknown> = { cw: root, cwInfoPanel: panel, cwChat: chat, cwPanelBackdrop: backdrop, cwInfoBtn: trigger, cwBack: trigger };
    u.context.$ = (id: string) => elements[id];
    u.cw.infoOpen = true;
    u.context.window.innerWidth = 1280;
    u.context.cwSyncPanels();
    expect(panel.style.display).toBe('block');
    expect(chat.inert).toBe(false);
    u.context.window.innerWidth = 900;
    u.context.cwSyncPanels();
    expect(panel.style.display).toBe('none');
    expect(backdrop.hidden).toBe(true);
    u.cw.infoNarrowOpen = true;
    u.context.cwSyncPanels();
    expect(panel.style.display).toBe('block');
    expect(chat.inert).toBe(false);
    expect(rail.inert).toBe(false);
    expect(backdrop.hidden).toBe(true);
    u.context.cwClosePanels();
    expect(panel.style.display).toBe('none');
    expect(chat.inert).toBe(false);
    expect(trigger.focus).toHaveBeenCalledOnce();
    u.context.window.innerWidth = 390;
    classes.add('rail-open');
    u.context.cwSyncPanels();
    expect(rail.inert).toBe(false);
    expect(chat.inert).toBe(true);
    u.context.cwClosePanels();
    expect(rail.inert).toBe(true);
    expect(chat.inert).toBe(false);
  });

  it('keeps the transcript and open menus intact when a stream repeats unchanged messages', () => {
    const u = fixture();
    u.cw.msgs = [message()];
    u.context.cwApplySnapshot({ messages: [message()], messageChangeSeq: 1 });
    expect(u.context.cwRenderMsgs).not.toHaveBeenCalled();
    expect(u.cw.lastSeq).toBe(1);
    u.context.cwApplySnapshot({ messages: [message({ text: 'Updated', revision: 1, changeSeq: 2 })], messageChangeSeq: 2 });
    expect(u.context.cwRenderMsgs).toHaveBeenCalledOnce();
  });

  it('puts actions in a native dismissible popover while keeping delivery status visible', () => {
    const u = fixture();
    const html = u.context.cwMessageActionsHtml(message({ status: 'failed' }));
    expect(html).toContain('popovertarget="cw-message-menu-m1"');
    expect(html).toContain('popover="auto"');
    expect(html).toMatch(/aria-label="Message actions"[^>]*>…<\/button>/);
    expect(html).toMatch(/data-cwaction="retry"[\s\S]*<\/div><span role="status"/);
  });

  it('removes tool metadata and leaked protocol from replies but preserves user text and code examples', () => {
    const u = fixture();
    u.context.cwAva = () => '';
    const text = 'Checking the file.\n<|tool_calls|>\n<|tool_call|>\n<|tool_name|>read_file<|tool_name|>\n<|parameters|>{"path":"script.sh"}';
    const html = u.context.cwBubbleHtml(message({ role: 'agent', text, tools: [{ name: 'read_file', ok: true }] }));
    expect(html).toContain('Checking the file.');
    expect(html).not.toContain('read_file');
    expect(html).not.toContain('script.sh');
    expect(html).not.toContain('cw-tools');
    expect(u.context.cwBubbleHtml(message({ text }))).toContain('read_file');
    const code = 'Example: `<tool>`\n```xml\n<|tool_calls|>\n```';
    expect(u.context.cwVisibleReply(code)).toBe(code);
    expect(u.context.cwVisibleReply('Checking. <tool>{"name":"read_file"}</tool> Done.')).toBe('Checking.  Done.');
    expect(u.context.cwVisibleReply('Checking. <|tool_ca')).toBe('Checking.');
  });

  it('shows prose or a neutral working indicator during tool execution', () => {
    const u = fixture();
    const text = { textContent: '' };
    const label = { textContent: '' };
    const icon = { innerHTML: '', _ico: undefined as string | undefined };
    const live = { hidden: true, innerHTML: '', _progressKey: null, querySelectorAll: (selector: string) => selector === '.cw-progress-text' ? [text] : selector === '.cw-progress-activity .wtext' ? [label] : selector === '.cw-progress-activity .cw-tool-ico' ? [icon] : [] };
    const wrap = { scrollHeight: 100, scrollTop: 0, clientHeight: 100 };
    u.context.$ = (id: string) => id === 'cwLive' ? live : id === 'cwMsgs' ? wrap : undefined;
    u.context.cwAva = () => '';
    u.cw.busy = true;
    u.cw.progresses = [{ agentId: 'chief', agentName: 'Chief', tool: 'run_command', detail: 'private command' }];
    new Script(COWORK_JS).runInContext(u.context);
    u.context.cwAva = () => '';
    u.context.cwRenderProgress();
    // The label stays neutral and the icon marks the activity — the command
    // text itself never reaches the live row.
    expect(label.textContent).toBe('Working…');
    expect(icon.innerHTML).toContain('title="Running a command"');
    expect(icon.innerHTML).not.toContain('private command');
    // A neutral public category fills the row until the agent sends its own
    // prose; the raw command never reaches the live row.
    expect(text.textContent).toBe('Running a check in the workspace…');
    expect(text.textContent).not.toContain('private command');
    expect(live.innerHTML).not.toContain('cw-progress-tool');
    u.cw.progresses[0]!.text = 'Here is the summary.';
    u.context.cwRenderProgress();
    expect(text.textContent).toBe('Running a check in the workspace…\nHere is the summary.');
  });

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
    u.cw.agents.push({ id: 'writer', name: 'Writer' });
    u.cw.convs[0].memberIds.push('writer');
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
