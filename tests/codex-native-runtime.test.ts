import { describe, expect, it, vi } from 'vitest';
import { CodexNativeRuntime, nativeConfigToml, nativeProviderError, type NativeRpc } from '../src/llm/codex-native.js';
import type { NativeRecord, NativeTaskInput } from '../src/llm/native-task.js';
import { ScriptedMockLlm, UsageTrackingClient } from '../src/llm/llm.js';

class Rpc implements NativeRpc {
  event?: (method: string, params: NativeRecord) => void;
  serverRequest?: (method: string, params: NativeRecord) => Promise<NativeRecord>;
  failure?: (error: Error) => void;
  calls: { method: string; params: NativeRecord }[] = [];
  closes = 0;
  turn = 'turn-1';
  started?: () => void;
  async request(method: string, params: NativeRecord): Promise<NativeRecord> {
    this.calls.push({ method, params });
    if (method === 'account/read') return { account: { type: 'chatgpt' } };
    if (method === 'thread/start' || method === 'thread/resume')
      return { thread: { id: 'thread-1', status: { type: 'idle' } }, activePermissionProfile: { id: 'gitu-task' }, approvalPolicy: 'on-request', approvalsReviewer: 'user' };
    if (method === 'turn/start') {
      this.started?.();
      return { turn: { id: this.turn } };
    }
    return {};
  }
  onEvent(listener: (method: string, params: NativeRecord) => void): void {
    this.event = listener;
  }
  onRequest(listener: (method: string, params: NativeRecord) => Promise<NativeRecord>): void {
    this.serverRequest = listener;
  }
  onFailure(listener: (error: Error) => void): void {
    this.failure = listener;
  }
  async close(): Promise<void> {
    this.closes++;
  }
  emit(method: string, params: NativeRecord = {}): void {
    this.event?.(method, { threadId: 'thread-1', turnId: this.turn, ...params });
  }
  finish(status = 'completed'): void {
    this.emit('turn/completed', { turn: { id: this.turn, status } });
  }
}

function input(overrides: Partial<NativeTaskInput> = {}): NativeTaskInput {
  return {
    cwd: process.cwd(),
    text: 'Read and edit the selected project.',
    instructions: 'Gitu owns scope.',
    config: {},
    permissions: 'gitu-task',
    signal: new AbortController().signal,
    onThread: vi.fn(),
    onTurn: vi.fn(),
    onEvent: vi.fn(),
    onRequest: async () => ({ decision: 'decline' }),
    ...overrides,
  };
}

async function waitStart(rpc: Rpc): Promise<void> {
  for (let count = 0; count < 10 && !rpc.calls.some((call) => call.method === 'turn/start'); count++) await Promise.resolve();
  await Promise.resolve();
}

describe('native Codex owns exactly one execution loop', () => {
  it.each([undefined, 'thread-1'])('sends max effort on a new or resumed turn (thread=%s) and reports admitted settings', async (threadId) => {
    const rpc = new Rpc();
    const runtime = new CodexNativeRuntime('model', async () => rpc);
    const onSettings = vi.fn();
    const work = runtime.runTurn(input({ threadId, effort: 'max', onSettings }));
    await waitStart(rpc);
    rpc.finish();
    await work;
    expect(rpc.calls.find((call) => call.method === 'turn/start')?.params['effort']).toBe('max');
    expect(onSettings).toHaveBeenCalledExactlyOnceWith({ model: 'model', requestedEffort: 'max', effectiveEffort: 'max' });
  });

  it('streams multiple native tool items and completes without a Gitu action decoder or another turn', async () => {
    const rpc = new Rpc(),
      runtime = new CodexNativeRuntime('gpt-5.6-luna', async () => rpc),
      opts = input();
    const work = runtime.runTurn(opts);
    await waitStart(rpc);
    rpc.emit('item/started', { item: { id: 'command-1', type: 'commandExecution' } });
    rpc.emit('item/completed', { item: { id: 'command-1', type: 'commandExecution', exitCode: 0 } });
    rpc.emit('item/completed', { item: { id: 'edit-1', type: 'fileChange', status: 'completed' } });
    rpc.emit('item/completed', { item: { id: 'answer-1', type: 'agentMessage', text: 'Edited and checked.' } });
    rpc.finish();
    expect((await work).status).toBe('completed');
    expect(rpc.calls.map((c) => c.method)).toEqual(['config/read', 'account/read', 'thread/start', 'turn/start']);
    expect(opts.onEvent).toHaveBeenCalledTimes(5);
    expect(rpc.closes).toBe(1);
    expect(rpc.calls[2]!.params).toMatchObject({ permissions: 'gitu-task', approvalPolicy: 'on-request', approvalsReviewer: 'user' });
    expect(rpc.calls[2]!.params['sandbox']).toBeUndefined();
  });

  it('progress and empty messages never cause another turn', async () => {
    const rpc = new Rpc(),
      runtime = new CodexNativeRuntime('model', async () => rpc);
    const work = runtime.runTurn(input());
    await waitStart(rpc);
    rpc.emit('item/agentMessage/delta', { itemId: 'comment', delta: 'Looking into it…' });
    rpc.emit('item/completed', { item: { id: 'comment', type: 'agentMessage', phase: 'commentary', text: 'Looking into it…' } });
    expect(rpc.calls.filter((c) => c.method === 'turn/start')).toHaveLength(1);
    rpc.finish();
    await work;
    expect(rpc.calls.filter((c) => c.method === 'turn/start')).toHaveLength(1);
  });

  it('resumes the saved thread with a delta instead of replaying its history', async () => {
    const rpc = new Rpc(),
      runtime = new CodexNativeRuntime('model', async () => rpc);
    const work = runtime.runTurn(input({ threadId: 'thread-1', text: 'Continue from the failed check.' }));
    await waitStart(rpc);
    rpc.finish();
    await work;
    expect(rpc.calls[2]!.method).toBe('thread/resume');
    expect(rpc.calls[2]!.params).toMatchObject({ threadId: 'thread-1', excludeTurns: true });
    expect(rpc.calls[3]!.params['input']).toEqual([{ type: 'text', text: 'Continue from the failed check.' }]);
  });

  it('rejects duplicate concurrent turns but allows separate tasks concurrently', async () => {
    const a = new Rpc(),
      b = new Rpc(),
      ra = new CodexNativeRuntime('model', async () => a),
      rb = new CodexNativeRuntime('model', async () => b);
    const first = ra.runTurn(input()),
      second = rb.runTurn(input());
    await waitStart(a);
    await waitStart(b);
    await expect(ra.runTurn(input())).rejects.toThrow('already running');
    a.finish();
    b.finish();
    await Promise.all([first, second]);
  });

  it('interrupts and closes on cancellation without continuing', async () => {
    const rpc = new Rpc(),
      runtime = new CodexNativeRuntime('model', async () => rpc),
      controller = new AbortController();
    const work = runtime.runTurn(input({ signal: controller.signal }));
    await waitStart(rpc);
    controller.abort();
    await expect(work).rejects.toMatchObject({ details: { kind: 'aborted' } });
    expect(rpc.calls.some((c) => c.method === 'turn/interrupt')).toBe(true);
    expect(rpc.calls.filter((c) => c.method === 'turn/start')).toHaveLength(1);
  });

  it('does not replay tools after a network disconnection', async () => {
    const rpc = new Rpc(),
      connect = vi.fn(async () => rpc),
      runtime = new CodexNativeRuntime('model', connect);
    const work = runtime.runTurn(input());
    await waitStart(rpc);
    rpc.failure?.(new Error('Connection lost after edit.'));
    await expect(work).rejects.toThrow('Connection lost after edit');
    expect(connect).toHaveBeenCalledTimes(1);
    expect(rpc.calls.filter((c) => c.method === 'turn/start')).toHaveLength(1);
  });

  it('ends the active turn when Gitu rejects further no-progress execution', async () => {
    const rpc = new Rpc(),
      runtime = new CodexNativeRuntime('model', async () => rpc);
    const work = runtime.runTurn(
      input({
        onRequest: async () => {
          throw new Error('No progress after repeated denials.');
        },
      }),
    );
    await waitStart(rpc);
    await expect(rpc.serverRequest!('item/tool/call', { threadId: 'thread-1', turnId: rpc.turn })).rejects.toThrow('No progress');
    await expect(work).rejects.toThrow('No progress');
    expect(rpc.calls.filter((call) => call.method === 'turn/start')).toHaveLength(1);
    expect(rpc.closes).toBeGreaterThanOrEqual(1);
  });

  it('requires ChatGPT authentication and never falls back to API billing', async () => {
    const rpc = new Rpc(),
      request = rpc.request.bind(rpc);
    rpc.request = async (method, params) => (method === 'account/read' ? { account: { type: 'apiKey' } } : request(method, params));
    const runtime = new CodexNativeRuntime('model', async () => rpc);
    await expect(runtime.runTurn(input())).rejects.toMatchObject({ details: { kind: 'auth' } });
    expect(rpc.calls.some((call) => call.method === 'turn/start')).toBe(false);
  });

  it.each([
    ['401 Sign in required', 'auth'],
    ['usage limit reached', 'quota_exhausted'],
    ['429 rate limit', 'rate_limit_temporary'],
  ])('reports %s distinctly', async (message, kind) => {
    const rpc = new Rpc(),
      runtime = new CodexNativeRuntime('model', async () => rpc);
    const work = runtime.runTurn(input());
    await waitStart(rpc);
    rpc.emit('turn/completed', { turn: { id: rpc.turn, status: 'failed', error: { message } } });
    await expect(work).rejects.toMatchObject({ details: { kind } });
  });

  it('ignores other threads and declines stale approval requests', async () => {
    const rpc = new Rpc(),
      runtime = new CodexNativeRuntime('model', async () => rpc),
      opts = input();
    const work = runtime.runTurn(opts);
    await waitStart(rpc);
    rpc.emit('item/completed', { threadId: 'other', item: { type: 'fileChange' } });
    expect(await rpc.serverRequest?.('item/fileChange/requestApproval', { threadId: 'other', turnId: rpc.turn })).toEqual({ decision: 'decline' });
    expect(opts.onEvent).not.toHaveBeenCalled();
    rpc.finish();
    await work;
  });

  it('keeps a productive turn alive until its explicit completion', async () => {
    const rpc = new Rpc(),
      runtime = new CodexNativeRuntime('model', async () => rpc);
    const work = runtime.runTurn(input());
    await waitStart(rpc);
    for (let i = 0; i < 100; i++) rpc.emit('item/commandExecution/outputDelta', { delta: 'productive output ' + i });
    await Promise.resolve();
    expect(rpc.closes).toBe(0);
    rpc.finish();
    expect((await work).status).toBe('completed');
  });

  it('charges only new usage and preserves native routing through the usage wrapper', async () => {
    const rpc = new Rpc(),
      runtime = new CodexNativeRuntime('model', async () => rpc),
      charged = vi.fn();
    const client = Object.assign(new ScriptedMockLlm([]), { nativeTask: runtime });
    const tracked = new UsageTrackingClient(client, charged);
    const work = tracked.nativeTask!.runTurn(input({ threadId: 'thread-1' }));
    await waitStart(rpc);
    rpc.emit('thread/tokenUsage/updated', {
      tokenUsage: { total: { inputTokens: 1000, outputTokens: 500, cachedInputTokens: 0 }, last: { inputTokens: 10, outputTokens: 20, cachedInputTokens: 0 } },
    });
    rpc.emit('thread/tokenUsage/updated', { tokenUsage: { total: { inputTokens: 1000, outputTokens: 500, cachedInputTokens: 0 } } });
    rpc.emit('thread/tokenUsage/updated', { tokenUsage: { total: { inputTokens: 1015, outputTokens: 530, cachedInputTokens: 2 } } });
    rpc.finish();
    await work;
    expect(charged.mock.calls.map((c) => c[0])).toEqual([
      { inputTokens: 10, outputTokens: 20, cachedTokens: 0 },
      { inputTokens: 15, outputTokens: 30, cachedTokens: 2 },
    ]);
  });
});

it('encodes permission tables as TOML rather than JSON object syntax', () => {
  expect(nativeConfigToml({ filesystem: { ':workspace_roots': { '.': 'write', '.hermes': 'deny' } } })).toBe('{"filesystem"={":workspace_roots"={"."="write",".hermes"="deny"}}}');
  expect(nativeProviderError({ message: '401' }).details.kind).toBe('auth');
});
