import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Script } from 'node:vm';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { CoworkComputer, type ComputerExec } from '../src/cowork/computer.js';
import { cleanTelegramText, parseTelegramRequestAction, sendTelegramDocument, sendTelegramRequestCard, TelegramReplyStream, TelegramPoller, telegramChunks, type TelegramFetch } from '../src/cowork/telegram.js';
import { CoworkStore, type CoworkRequest } from '../src/cowork/store.js';
import { buildCoworkMessages, runConversationTurn, type CoworkRunnerDeps, type CoworkProgress } from '../src/cowork/runner.js';
import { executeCoworkTool, stripToolMarkers } from '../src/cowork/tools.js';
import type { LlmClient, LlmMessage } from '../src/llm/llm.js';
import type { ToolContext } from '../src/tools/tools.js';
import { COWORK_JS } from '../src/server/ui-cowork.js';

const root = mkdtempSync(path.join(tmpdir(), 'cowork-runtime-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
afterEach(() => vi.useRealTimers());

function telegramMock() {
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  const fetchImpl: TelegramFetch = async (url, init) => {
    calls.push({ method: url.split('/').at(-1)!, body: JSON.parse(init!.body!) });
    return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, result: { message_id: calls.length } }) };
  };
  return { calls, fetchImpl };
}
const token = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ';

describe('Telegram live replies', () => {
  it('edits the same message, preserves plain text and drains final chunks', async () => {
    vi.useFakeTimers();
    const { calls, fetchImpl } = telegramMock();
    const stream = new TelegramReplyStream(token, '42', fetchImpl, 10);
    stream.update('Ada: hello');
    await vi.advanceTimersByTimeAsync(10);
    stream.update('Ada: hello <world> & code');
    await vi.advanceTimersByTimeAsync(10);
    await stream.finish('Ada: ' + 'x'.repeat(8000));
    expect(calls.slice(0, 2).map((c) => c.method)).toEqual(['sendMessage', 'editMessageText']);
    expect(calls[1]!.body['message_id']).toBe(1);
    expect(calls[1]!.body['text']).toBe('Ada: hello <world> & code');
    expect(calls.every((c) => c.body['parse_mode'] === undefined)).toBe(true);
    expect(calls.filter((c) => c.method === 'sendMessage')).toHaveLength(3);
    expect(
      calls
        .slice(2)
        .map((c) => c.body['text'])
        .join(''),
    ).toBe('Ada: ' + 'x'.repeat(8000));
    stream.update('late update');
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toHaveLength(5);
  });

  it('does not split surrogate pairs or lose whitespace', () => {
    const text = ' '.repeat(3799) + '🙂'.repeat(5000) + '\n';
    const chunks = telegramChunks(text);
    expect(chunks.join('')).toBe(text);
    expect(chunks.every((c) => c.length <= 3800 && !/[\uD800-\uDBFF]$/.test(c))).toBe(true);
  });

  it('sends clean request cards with inline Telegram actions', async () => {
    const dirty = 'Working…\n[browse: running]\nTools: browse: completed\n<tool>{"name":"ask_user","params":{}}</tool>\nDone ✓';
    expect(cleanTelegramText(dirty)).toBe('Working...\nDone done');
    expect(parseTelegramRequestAction('cwreq:cr-1:answer:1')).toEqual({ requestId: 'cr-1', action: 'answer', optionIndex: 1 });
    const request: CoworkRequest = {
      id: 'cr-1',
      conversationId: 'cc-1',
      agentId: 'ca-1',
      kind: 'question',
      title: 'Which region?',
      detail: 'Pick the deploy target.',
      options: ['EU', 'US'],
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    const { calls, fetchImpl } = telegramMock();
    await sendTelegramRequestCard(fetchImpl, token, '42', request, 'Ada');
    expect(calls[0]!.method).toBe('sendMessage');
    expect(calls[0]!.body['text']).toContain('Question');
    expect(calls[0]!.body['text']).toContain('1. EU');
    expect(calls[0]!.body['text']).not.toContain('<tool>');
    expect(calls[0]!.body['reply_markup']).toEqual({
      inline_keyboard: [
        [{ text: 'EU', callback_data: 'cwreq:cr-1:answer:0' }],
        [{ text: 'US', callback_data: 'cwreq:cr-1:answer:1' }],
      ],
    });
  });

  it('retries rate limits and reports final delivery failures', async () => {
    vi.useFakeTimers();
    let count = 0;
    const api: TelegramFetch = async () => {
      count++;
      return count === 1
        ? { ok: false, status: 429, text: async () => JSON.stringify({ ok: false, parameters: { retry_after: 2 } }) }
        : { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, result: { message_id: 1 } }) };
    };
    const stream = new TelegramReplyStream(token, '42', api);
    const finished = stream.finish('hello');
    await vi.advanceTimersByTimeAsync(1999);
    expect(count).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await finished;
    expect(count).toBe(2);
    const failed = new TelegramReplyStream(token, '42', async () => ({ ok: false, status: 403, text: async () => '{"ok":false,"description":"bot blocked"}' }));
    await expect(failed.finish('hello')).rejects.toThrow('bot blocked');
  });

  it('deduplicates update ids and starts only one polling loop per instance', async () => {
    let count = 0;
    const got: string[] = [];
    const api: TelegramFetch = async (_url, init) => {
      count++;
      if (count > 1) return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
      const update = { update_id: 20, message: { message_id: 1, date: Date.now() / 1000, chat: { id: 42 }, text: 'hello' } };
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, result: [update, update] }) };
    };
    const poller = new TelegramPoller({ token, chatId: '*', fetchImpl: api, onMessage: (_from, text, chat) => got.push(chat + ':' + text) });
    poller.start();
    poller.start();
    await vi.waitFor(() => expect(got).toHaveLength(1));
    poller.stop();
    expect(got).toEqual(['42:hello']);
    expect(count).toBe(2);
    expect(poller.chats()[0]!.id).toBe('42');
  });

  it('routes Telegram inline callbacks and acknowledges the button tap', async () => {
    const calls: { method: string; body: Record<string, unknown> }[] = [];
    const callbacks: { from: string; data: string; chatId: string; callbackId: string; messageId?: number }[] = [];
    let polls = 0;
    const api: TelegramFetch = async (url, init) => {
      const method = url.split('/').at(-1)!;
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : {};
      calls.push({ method, body });
      if (method === 'getUpdates') {
        polls++;
        if (polls === 1) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
              ok: true,
              result: [{ update_id: 40, callback_query: { id: 'cb-1', data: 'cwreq:cr-1:approve', message: { message_id: 9, chat: { id: 42 } }, from: { first_name: 'Ada' } } }],
            }),
          };
        }
        return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
      }
      return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, result: {} }) };
    };
    const poller = new TelegramPoller({
      token,
      chatId: '42',
      fetchImpl: api,
      onMessage: () => {},
      onCallback: (from, data, chatId, callbackId, messageId) => {
        callbacks.push({ from, data, chatId, callbackId, messageId });
        return 'Approved';
      },
    });
    poller.start();
    await vi.waitFor(() => expect(calls.some((call) => call.method === 'answerCallbackQuery')).toBe(true));
    poller.stop();
    expect(callbacks).toEqual([{ from: 'Ada', data: 'cwreq:cr-1:approve', chatId: '42', callbackId: 'cb-1', messageId: 9 }]);
    const answer = calls.find((call) => call.method === 'answerCallbackQuery')!;
    expect(answer.body).toEqual({ callback_query_id: 'cb-1', text: 'Approved', show_alert: false });
  });

  it('coalesces updates while a Telegram request is slow', async () => {
    vi.useFakeTimers();
    const { calls, fetchImpl } = telegramMock();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const slow: TelegramFetch = async (url, init) => {
      if (calls.length === 0) await gate;
      return fetchImpl(url, init);
    };
    const stream = new TelegramReplyStream(token, '42', slow, 10);
    stream.update('first');
    await vi.advanceTimersByTimeAsync(10);
    for (let i = 0; i < 50; i++) {
      stream.update('update ' + i);
      await vi.advanceTimersByTimeAsync(10);
    }
    const finished = stream.finish('final');
    release();
    await finished;
    expect(calls.map((c) => c.body['text'])).toEqual(['first', 'final']);
  });

  it('sends generated documents as multipart attachments', async () => {
    let form: FormData | undefined;
    const fetchImpl: TelegramFetch = async (_url, init) => {
      form = init?.body as FormData;
      return { ok: true, status: 200, text: async () => '{"ok":true,"result":{}}' };
    };
    await sendTelegramDocument(fetchImpl, token, '42', { name: 'report.txt', mime: 'text/plain', bytes: new TextEncoder().encode('ready') }, 'Agent result');
    expect(form).toBeInstanceOf(FormData);
    expect(form!.get('chat_id')).toBe('42');
    expect(form!.get('caption')).toBe('Agent result');
    const file = form!.get('document') as File;
    expect(file.name).toBe('report.txt');
    expect(await file.text()).toBe('ready');
  });

  it('downloads inbound documents and persists the next update offset', async () => {
    const offsets: number[] = [];
    const received: { text: string; file?: { name: string; dataBase64: string } }[] = [];
    let polls = 0;
    const bytes = new TextEncoder().encode('telegram file');
    const fetchImpl: TelegramFetch = async (url, init) => {
      if (url.includes('/file/')) return { ok: true, status: 200, text: async () => '', arrayBuffer: async () => bytes.buffer };
      if (url.endsWith('/getFile')) return { ok: true, status: 200, text: async () => '{"ok":true,"result":{"file_path":"documents/report.txt"}}' };
      polls++;
      if (polls === 1) {
        return { ok: true, status: 200, text: async () => JSON.stringify({ ok: true, result: [{ update_id: 75, message: { message_id: 9, date: Date.now() / 1000, chat: { id: 42 }, from: { first_name: 'Ada' }, caption: 'Please review', document: { file_id: 'doc-1', file_name: 'report.txt', mime_type: 'text/plain', file_size: bytes.length } } }] }) };
      }
      return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    };
    const poller = new TelegramPoller({
      token, chatId: '42', fetchImpl, initialOffset: 70,
      onOffset: (offset) => offsets.push(offset),
      onMessage: (_from, text, _chat, file) => received.push({ text, file }),
    });
    poller.start();
    await vi.waitFor(() => expect(received).toHaveLength(1));
    poller.stop();
    expect(offsets).toEqual([76]);
    expect(received[0]!.text).toBe('Please review');
    expect(received[0]!.file).toEqual({ name: 'report.txt', mime: 'text/plain', dataBase64: Buffer.from(bytes).toString('base64') });
  });
});

describe('private virtual computers', () => {
  it('creates a separate persistent container with no host mounts or ports per agent', async () => {
    const calls: { args: string[]; input?: string }[] = [];
    let created = false;
    const exec: ComputerExec = async (args, input) => {
      calls.push({ args, input });
      if (args[0] === 'container' && !created) throw new Error('missing');
      if (args[0] === 'create') created = true;
      if (args[0] === 'exec') return '{"ok":true,"output":"done"}';
      return '{}';
    };
    const a = new CoworkComputer('a', root, exec);
    const b = new CoworkComputer('b', root, exec);
    expect(a.name).not.toBe(b.name);
    expect(new CoworkComputer('a', root, exec).name).toBe(a.name);
    await a.execute('run_command', { command: 'echo $(private)' });
    const create = calls.find((c) => c.args[0] === 'create')!.args;
    expect(create).toContain('--cap-drop');
    expect(create.filter((c) => c.startsWith('type=volume'))).toHaveLength(2);
    expect(create.join(' ')).not.toMatch(/type=bind|--privileged|--publish|docker\.sock/);
    const invoke = calls.find((c) => c.args[0] === 'exec')!;
    expect(invoke.args.join(' ')).not.toContain('echo $(private)');
    expect(JSON.parse(invoke.input!).params.command).toBe('echo $(private)');
    await a.stop();
    expect(a.status().state).toBe('stopped');
    expect(calls.some((c) => c.args[0] === 'rm')).toBe(false);
  });

  it('fails explicitly when Docker is missing and never invokes a host fallback', async () => {
    const exec = vi.fn<ComputerExec>().mockRejectedValue(new Error('spawn docker ENOENT'));
    const a = new CoworkComputer('missing', root, exec);
    const result = await a.execute('run_command', { command: 'touch host' });
    expect(result.ok).toBe(false);
    expect(result.output).toContain('Install/start Docker Desktop');
    expect(a.status().state).toBe('unavailable');
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('shares only explicit artifacts within the same conversation', async () => {
    const exec: ComputerExec = async (args, input) => {
      if (args[0] !== 'exec') return '{}';
      const request = JSON.parse(input!);
      return JSON.stringify({
        ok: true,
        output: request.tool === 'export_file' ? Buffer.from('report').toString('base64') : 'received ' + Buffer.from(request.params.data, 'base64').toString(),
      });
    };
    const a = new CoworkComputer('publisher', root, exec);
    const b = new CoworkComputer('reader', root, exec);
    const shared = await a.execute('share_file', { path: 'report.md' }, undefined, 'room');
    const artifactId = shared.output.match(/Artifact id: ([a-f0-9-]+)/)![1];
    const received = await b.execute('receive_file', { artifactId, path: 'report.md' }, undefined, 'room');
    expect(received.output).toBe('received report');
    expect((await b.execute('receive_file', { artifactId, path: 'report.md' }, undefined, 'other-room')).ok).toBe(false);
    expect((await b.execute('receive_file', { artifactId: '../../secret', path: 'report.md' }, undefined, 'room')).ok).toBe(false);
  });

  it('enforces permissions before contacting the virtual computer or MCP', async () => {
    const computer = { execute: vi.fn() } as unknown as CoworkComputer;
    const perms = { allowShell: false, allowWrites: false, allowConfig: false, chief: false, browser: true };
    const scope = { agent: { id: 'a' }, computerFor: () => computer } as never;
    const mcp = { call: vi.fn() };
    for (const tool of ['run_command', 'write_file', 'mcp_call']) {
      const params = tool === 'run_command' ? { command: 'echo hi' } : tool === 'write_file' ? { path: 'a', content: 'b' } : { tool: 'mcp:s:t' };
      expect((await executeCoworkTool({ mcp } as unknown as ToolContext, tool, params, perms, scope)).ok).toBe(false);
    }
    expect(computer.execute).not.toHaveBeenCalled();
    expect(mcp.call).not.toHaveBeenCalled();
  });

  it('cancels the command inside the container when its caller aborts', async () => {
    let running = false;
    const calls: string[][] = [];
    const exec: ComputerExec = async (args, _input, signal) => {
      calls.push(args);
      if (args[0] === 'exec' && args[1] === '-i') {
        running = true;
        return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new Error('aborted'))));
      }
      return '{}';
    };
    const computer = new CoworkComputer('cancel-computer', root, exec);
    const controller = new AbortController();
    const execution = computer.execute('run_command', { command: 'sleep 100' }, controller.signal);
    await vi.waitFor(() => expect(running).toBe(true));
    controller.abort();
    expect((await execution).ok).toBe(false);
    expect(calls.some((args) => args.join(' ').includes('/cancel'))).toBe(true);
  });
});

describe('cowork streaming and tool execution', () => {
  function setup(name: string, client: Partial<LlmClient>, overrides: Partial<CoworkRunnerDeps> = {}) {
    const store = new CoworkStore(path.join(root, name + '.json'));
    const agent = store.saveAgent({ name, systemPrompt: 'Help the user.' });
    const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    const trigger = store.appendMessage(conversation.id, { role: 'user', text: 'help', via: 'web' });
    const deps: CoworkRunnerDeps = { agents: [agent], resolveLlm: () => client as LlmClient, toolContext: () => ({}) as ToolContext, ...overrides };
    return { store, agent, conversation, trigger, deps, history: [trigger], append: (m: Parameters<CoworkStore['appendMessage']>[1]) => store.appendMessage(conversation.id, m) };
  }

  it('emits partial content before completion and hides split or malformed tool markers', async () => {
    const progress: CoworkProgress[] = [];
    const client = {
      completeStream: async (_messages: LlmMessage[], _opts: unknown, delta: (text: string) => void) => {
        delta('Hello');
        expect(progress[0]!.text).toBe('Hello');
        for (const part of [' <t', 'ool>{"secret":"never visible"}', '</tool>']) delta(part);
        return 'Final answer';
      },
    };
    const result = await runConversationTurn(setup('stream', client, { onProgress: (p) => progress.push(p) }));
    expect(result.messages[0]!.text).toBe('Final answer');
    expect(progress.every((p) => !/secret|<t|never visible/.test(p.text))).toBe(true);
    expect(stripToolMarkers('Hello <tool>{broken}</tool>')).toBe('Hello');
  });

  it('never executes calls after cancellation, even if the model ignores the signal', async () => {
    const controller = new AbortController();
    const context = vi.fn();
    const client = {
      complete: async () => {
        controller.abort();
        return '<tool>{"name":"list_files","params":{}}</tool>';
      },
    };
    const result = await runConversationTurn(setup('cancel', client, { signal: controller.signal, toolContext: context }));
    expect(context).not.toHaveBeenCalled();
    expect(result.messages.at(-1)!.text).toContain('Stopped by user');
  });

  it('keeps the newest trigger when old history exceeds the transcript budget', () => {
    const input = setup('history', {});
    const history = Array.from({ length: 40 }, (_, i) => ({ ...input.trigger, text: i === 39 ? 'LATEST REQUEST' : 'x'.repeat(4000) }));
    const prompt = buildCoworkMessages(input.agent, input.conversation, [input.agent], history);
    expect(prompt[1]!.content).toContain('LATEST REQUEST');
    expect(String(prompt[1]!.content).length).toBeLessThan(25000);
  });

  it('reports tool budget exhaustion instead of pretending unexecuted tools succeeded', async () => {
    const client = { complete: async () => '<tool>{"name":"unknown","params":{}}</tool>' };
    const result = await runConversationTurn(setup('budget', client));
    const checkpoints = result.messages.filter((m) => m.role === 'system' && m.text.includes('continuing automatically'));
    expect(checkpoints).toHaveLength(3);
    const final = result.messages.filter((m) => m.role === 'agent').at(-1)!;
    expect(final.text).toContain('Work is incomplete');
    expect(final.tools).toHaveLength(24 * 4);
    expect(final.tools!.every((t) => !t.ok)).toBe(true);
  });

  it('keeps working across a budget segment until the task finishes', async () => {
    let calls = 0;
    const client = {
      complete: async () => {
        calls += 1;
        return calls <= 24 ? '<tool>{"name":"unknown","params":{}}</tool>' : 'Done after continuing.';
      },
    };
    const result = await runConversationTurn(setup('budget-finish', client));
    expect(result.messages.some((m) => m.role === 'system' && m.text.includes('continuing automatically'))).toBe(true);
    const final = result.messages.filter((m) => m.role === 'agent').at(-1)!;
    expect(final.text).toBe('Done after continuing.');
    expect(final.tools).toHaveLength(24);
  });

  it('routes names with spaces and reserves a chief synthesis turn', async () => {
    const input = setup('chief', { complete: async () => 'Summary complete' });
    const writer = input.store.saveAgent({ name: 'Research Writer', systemPrompt: 'Write.' });
    const conv = input.store.saveConversation({ kind: 'group', memberIds: [input.agent.id, writer.id], chiefId: input.agent.id });
    const trigger = input.store.appendMessage(conv.id, { role: 'user', text: '@Research Writer @chief help', via: 'web' });
    const result = await runConversationTurn({
      ...input,
      conversation: conv,
      trigger,
      history: [trigger],
      deps: { ...input.deps, agents: [input.agent, writer] },
      append: (m) => input.store.appendMessage(conv.id, m),
    });
    expect(result.messages.map((m) => m.agentName)).toEqual(['Research Writer', 'chief']);
  });

  it('keeps the injected cowork browser script syntactically valid', () => {
    expect(() => new Script(`(function(){${COWORK_JS}\n})`)).not.toThrow();
  });

  it('continues other workers after one fails and tells the chief about the failure', async () => {
    const input = setup('resilient-chief', {});
    const broken = input.store.saveAgent({ name: 'broken', systemPrompt: 'Help.' });
    const healthy = input.store.saveAgent({ name: 'healthy', systemPrompt: 'Help.' });
    const conversation = input.store.saveConversation({ kind: 'group', memberIds: [input.agent.id, broken.id, healthy.id], chiefId: input.agent.id });
    const deps = {
      ...input.deps,
      agents: [input.agent, broken, healthy],
      resolveLlm: (agent: { id: string }) =>
        ({
          complete: async (messages: LlmMessage[]) => {
            if (agent.id === broken.id) throw new Error('Invalid API key');
            if (agent.id === healthy.id) return 'My part succeeded.';
            expect(JSON.stringify(messages)).toContain('Could not complete my part: Invalid API key');
            return 'Summary: partial success; one worker needs its connection fixed.';
          },
        }) as LlmClient,
    };
    const result = await runConversationTurn({ ...input, conversation, deps, append: (m) => input.store.appendMessage(conversation.id, m) });
    const names = result.messages.map((m) => m.agentName);
    expect(new Set(names.slice(0, -1))).toEqual(new Set(['broken', 'healthy']));
    expect(names.at(-1)).toBe('resilient-chief');
    expect(result.messages.at(-1)!.text).toContain('partial success');
  });
});

describe('cowork uploaded media', () => {
  function setup(name: string, client: Partial<LlmClient>, overrides: Partial<CoworkRunnerDeps> = {}) {
    const store = new CoworkStore(path.join(root, name + '.json'));
    const agent = store.saveAgent({ name, systemPrompt: 'Help the user.' });
    const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    const trigger = store.appendMessage(conversation.id, { role: 'user', text: 'help', via: 'web' });
    const deps: CoworkRunnerDeps = { agents: [agent], resolveLlm: () => client as LlmClient, toolContext: () => ({}) as ToolContext, ...overrides };
    return { conversation, trigger, deps, history: [trigger], append: (m: Parameters<CoworkStore['appendMessage']>[1]) => store.appendMessage(conversation.id, m) };
  }

  it('hands uploads to the model: images as vision parts, text inline, binaries named', async () => {
    const seen: LlmMessage[][] = [];
    const client = { complete: async (messages: LlmMessage[]) => { seen.push(messages); return 'Got it.'; } };
    await runConversationTurn({
      ...setup('media', client),
      media: [
        { name: 'photo.png', mime: 'image/png', dataUrl: 'data:image/png;base64,AAAA' },
        { name: 'notes.txt', mime: 'text/plain', text: 'line one\nline two' },
        { name: 'bundle.zip', mime: 'application/zip' },
      ],
    });
    const last = seen[0]!.at(-1)!;
    expect(last.role).toBe('user');
    const prompt = JSON.stringify(last.content);
    expect(prompt).toContain('ATTACHED MEDIA');
    expect(prompt).toContain('line one');
    expect(prompt).toContain('bundle.zip');
    expect(prompt).toContain('data:image/png;base64,AAAA');
    expect(prompt).toContain('image_url');
  });

  it('tells text-only models they cannot see uploaded images', async () => {
    const seen: LlmMessage[][] = [];
    const client = { complete: async (messages: LlmMessage[]) => { seen.push(messages); return 'Got it.'; } };
    await runConversationTurn({
      ...setup('media-blind', client, { supportsImagesFor: () => false }),
      media: [{ name: 'photo.png', mime: 'image/png', dataUrl: 'data:image/png;base64,AAAA' }],
    });
    const last = seen[0]!.at(-1)!;
    expect(typeof last.content).toBe('string');
    expect(last.content as string).toContain('cannot view images');
    expect(last.content as string).not.toContain('data:image/png');
  });

  it('accepts voice notes, video and stickers from Telegram like documents', async () => {
    const received: { text: string; file?: { name: string; mime: string } }[] = [];
    let polls = 0;
    const bytes = new TextEncoder().encode('media');
    const fetchImpl: TelegramFetch = async (url, init) => {
      if (url.includes('/file/')) return { ok: true, status: 200, text: async () => '', arrayBuffer: async () => bytes.buffer };
      if (url.endsWith('/getFile')) return { ok: true, status: 200, text: async () => '{"ok":true,"result":{"file_path":"media/file"}}' };
      polls++;
      if (polls === 1) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            ok: true,
            result: [
              { update_id: 90, message: { message_id: 11, date: Date.now() / 1000, chat: { id: 42 }, from: { first_name: 'Ada' }, caption: 'Listen', voice: { file_id: 'v1', mime_type: 'audio/ogg', file_size: bytes.length } } },
              { update_id: 91, message: { message_id: 12, date: Date.now() / 1000, chat: { id: 42 }, from: { first_name: 'Ada' }, video: { file_id: 'vid1', mime_type: 'video/mp4', file_size: bytes.length } } },
              { update_id: 92, message: { message_id: 13, date: Date.now() / 1000, chat: { id: 42 }, from: { first_name: 'Ada' }, sticker: { file_id: 'st1', mime_type: 'image/webp', file_size: bytes.length } } },
            ],
          }),
        };
      }
      return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
    };
    const poller = new TelegramPoller({
      token,
      chatId: '42',
      fetchImpl,
      initialOffset: 88,
      onMessage: (_from, text, _chat, file) => received.push({ text, file: file ? { name: file.name, mime: file.mime } : undefined }),
    });
    poller.start();
    await vi.waitFor(() => expect(received).toHaveLength(3));
    poller.stop();
    expect(received.map((item) => item.file!.mime)).toEqual(['audio/ogg', 'video/mp4', 'image/webp']);
    expect(received[0]!.file!.name).toBe('telegram-voice-11');
    expect(received[0]!.text).toBe('Listen');
    expect(received[1]!.file!.name).toBe('telegram-video-12.mp4');
    expect(received[1]!.text).toBe('Attached telegram-video-12.mp4');
    expect(received[2]!.file!.name).toBe('telegram-sticker-13');
  });
});
