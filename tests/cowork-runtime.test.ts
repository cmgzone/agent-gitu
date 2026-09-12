import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Script } from 'node:vm';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { CoworkComputer, type ComputerExec } from '../src/cowork/computer.js';
import { TelegramReplyStream, TelegramPoller, telegramChunks, type TelegramFetch } from '../src/cowork/telegram.js';
import { CoworkStore } from '../src/cowork/store.js';
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
    expect(result.messages[0]!.text).toContain('Work is incomplete');
    expect(result.messages[0]!.tools).toHaveLength(8);
    expect(result.messages[0]!.tools!.every((t) => !t.ok)).toBe(true);
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
    let chiefCalls = 0;
    const deps = {
      ...input.deps,
      agents: [input.agent, broken, healthy],
      resolveLlm: (agent: { id: string }) =>
        ({
          complete: async (messages: LlmMessage[]) => {
            if (agent.id === broken.id) throw new Error('Invalid API key');
            if (agent.id === healthy.id) return 'My part succeeded.';
            if (chiefCalls++ === 0) return '@broken @healthy please help.';
            expect(JSON.stringify(messages)).toContain('Could not complete my part: Invalid API key');
            return 'Summary: partial success; one worker needs its connection fixed.';
          },
        }) as LlmClient,
    };
    const result = await runConversationTurn({ ...input, conversation, deps, append: (m) => input.store.appendMessage(conversation.id, m) });
    expect(result.messages.map((m) => m.agentName)).toEqual(['resilient-chief', 'broken', 'healthy', 'resilient-chief']);
    expect(result.messages.at(-1)!.text).toContain('partial success');
  });
});
