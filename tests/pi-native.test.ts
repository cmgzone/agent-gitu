import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { LlmError } from '../src/llm/llm.js';
import type { NativeTaskInput, NativeTaskResult } from '../src/llm/native-task.js';
import {
  classifyPiError,
  piAdmissionExtension,
  piProviderConfig,
  PiNativeRuntime,
  thinkingLevelFor,
  toToolResult,
} from '../src/llm/pi-native.js';
import type {
  PiCreateAgentSessionOptions,
  PiImage,
  PiModelRuntime,
  PiProviderConfig,
  PiResourceLoaderOptions,
  PiSession,
  PiSessionEvent,
  PiSessionManager,
  PiSdk,
} from '../src/llm/pi/sdk.js';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { force: true, recursive: true });
});

function workspace(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'gitu-pi-'));
  folders.push(root);
  return root;
}

/** A session that lets the scenario drive pi's event stream. */
class FakeSession implements PiSession {
  readonly listeners = new Set<(event: PiSessionEvent) => void>();
  readonly prompts: { text: string; images?: PiImage[] }[] = [];
  readonly steers: string[] = [];
  aborted = false;
  disposed = false;
  constructor(
    readonly sessionId: string,
    private readonly scenario: (session: FakeSession, text: string) => Promise<void>,
  ) {}
  subscribe(listener: (event: PiSessionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  async prompt(text: string, options?: { images?: PiImage[] }): Promise<void> {
    this.prompts.push({ text, ...(options?.images ? { images: options.images } : {}) });
    await this.scenario(this, text);
  }
  async steer(text: string): Promise<void> {
    this.steers.push(text);
  }
  async abort(): Promise<void> {
    this.aborted = true;
  }
  dispose(): void {
    this.disposed = true;
  }
  emit(event: PiSessionEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
}

interface Harness {
  runtime: PiNativeRuntime;
  sessions: FakeSession[];
  options: PiCreateAgentSessionOptions[];
  registered: PiProviderConfig[];
  reloads: () => number;
  created: string[];
  opened: string[];
}

function harness(
  scenario: (session: FakeSession, text: string) => Promise<void>,
  known: Record<string, string> = {},
  onAdmission?: (entry: { tool: string; args: Record<string, unknown> }) => void,
  // `hasModel: false` reproduces a model runtime that never registered the
  // configured model, which is the only way that failure reaches a user.
  setup: { hasModel?: boolean } = {},
): Harness {
  const sessions: FakeSession[] = [];
  const options: PiCreateAgentSessionOptions[] = [];
  const registered: PiProviderConfig[] = [];
  const created: string[] = [];
  const opened: string[] = [];
  let reloadCount = 0;
  const modelRuntime: PiModelRuntime = {
    registerProvider: (providerId, config) => registered.push(config),
    getModel: (providerId, modelId) => (setup.hasModel === false ? undefined : { providerId, modelId }),
  };
  const manager = (id: string, file: string): PiSessionManager => ({
    getSessionId: () => id,
    getSessionFile: () => file,
  });
  const sdk: PiSdk = {
    ModelRuntime: { create: async () => modelRuntime },
    SettingsManager: { create: () => ({}) },
    SessionManager: {
      create: (_cwd, sessionDir) => {
        created.push(sessionDir ?? '');
        return manager('pi-session-new', path.join(sessionDir ?? '', 'pi-session-new.jsonl'));
      },
      open: (file) => {
        opened.push(file);
        return manager(path.basename(file).replace(/\.jsonl$/, ''), file);
      },
      findById: (_cwd, id) => known[id],
    },
    DefaultResourceLoader: class {
      constructor(readonly loaderOptions: PiResourceLoaderOptions) {}
      async reload(): Promise<void> {
        reloadCount++;
      }
    },
    createAgentSession: async (sessionOptions) => {
      options.push(sessionOptions);
      const session = new FakeSession(`pi-session-${sessions.length + 1}`, scenario);
      sessions.push(session);
      return { session };
    },
  };
  const runtime = new PiNativeRuntime({
    agentDir: workspace(),
    target: { providerId: 'gitu-deepseek', baseUrl: 'https://api.deepseek.com', apiKey: 'k', modelId: 'deepseek-flash' },
    loadSdk: async () => sdk,
    ...(onAdmission ? { onAdmission } : {}),
  });
  return { runtime, sessions, options, registered, reloads: () => reloadCount, created, opened };
}

function input(overrides: Partial<NativeTaskInput> = {}): NativeTaskInput {
  return {
    cwd: workspace(),
    text: 'Do the work.',
    instructions: 'You are Agent Gitu.',
    config: {},
    permissions: 'gitu-guarded',
    signal: new AbortController().signal,
    tools: [{ type: 'function', name: 'read_file', description: 'Read a file', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } }],
    onThread: vi.fn(),
    onTurn: vi.fn(),
    onSettings: vi.fn(),
    onEvent: vi.fn(async () => {}),
    onRequest: vi.fn(async () => ({ success: true, contentItems: [{ type: 'inputText', text: 'ok' }] })),
    ...overrides,
  };
}

function eventsOf(target: NativeTaskInput): [string, Record<string, unknown>][] {
  return (target.onEvent as ReturnType<typeof vi.fn>).mock.calls as [string, Record<string, unknown>][];
}

describe('pi as a provider-owned loop', () => {
  it('maps text and thinking deltas and reports the final answer', async () => {
    const onUsage = vi.fn();
    const h = harness(async (session) => {
      session.emit({ type: 'message_start', message: { role: 'assistant' } });
      session.emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'The answer ' } });
      session.emit({ type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'considering' } });
      session.emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'is 42.' } });
      session.emit({
        type: 'message_end',
        message: { role: 'assistant', content: [{ type: 'text', text: 'The answer is 42.' }], usage: { input: 100, output: 20, cacheRead: 5, cacheWrite: 0 } },
      });
    });
    const request = input({ onUsage });
    await h.runtime.runTurn(request);

    const received = eventsOf(request);
    expect(received.map(([method]) => method)).toEqual([
      'item/started',
      'item/agentMessage/delta',
      'item/reasoning/delta',
      'item/agentMessage/delta',
      'item/completed',
    ]);
    expect(received[0]![1]).toEqual({ item: { type: 'agentMessage', id: 'pi-msg-1' } });
    expect(received[1]![1]).toEqual({ itemId: 'pi-msg-1', delta: 'The answer ' });
    expect(received[4]![1]).toEqual({
      item: { type: 'agentMessage', id: 'pi-msg-1', text: 'The answer is 42.', phase: 'final_answer' },
    });
    expect(onUsage).toHaveBeenCalledWith({ inputTokens: 100, outputTokens: 20, cachedTokens: 5 });
  });

  it('reports a tool-calling message as commentary, not as the answer', async () => {
    const h = harness(async (session) => {
      session.emit({ type: 'message_start', message: { role: 'assistant' } });
      session.emit({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'toolCall', id: 'c1', name: 'read_file' }] } });
    });
    const request = input();
    await h.runtime.runTurn(request);
    expect(eventsOf(request).at(-1)![1]).toEqual({
      item: { type: 'agentMessage', id: 'pi-msg-1', text: '', phase: 'commentary' },
    });
  });

  it('exposes only declared Gitu tools and leaves pi built-ins off', async () => {
    const h = harness(async () => {});
    await h.runtime.runTurn(input({ tools: [{ type: 'function', name: 'ssh_exec', description: 'Run', inputSchema: { type: 'object' } }] }));
    const options = h.options[0]!;
    expect(options.noTools).toBe('builtin');
    expect(options.tools).toEqual(['ssh_exec']);
    expect(options.customTools.map((tool) => tool.name)).toEqual(['ssh_exec']);
    expect(options.customTools[0]!.executionMode).toBe('sequential');
  });

  it('routes a tool call through the consumer approval path and returns its result to pi', async () => {
    const onRequest = vi.fn(async () => ({ success: true, contentItems: [{ type: 'inputText', text: 'file contents' }] }));
    const h = harness(async (session) => {
      const result = await h.options[0]!.customTools[0]!.execute('call-7', { path: 'a.txt' }, undefined, undefined, undefined as never);
      expect(result.content).toEqual([{ type: 'text', text: 'file contents' }]);
      expect(result.isError).toBe(false);
    });
    const request = input({ onRequest });
    await h.runtime.runTurn(request);
    expect(onRequest).toHaveBeenCalledWith('item/tool/call', {
      callId: 'call-7',
      turnId: 'pi-turn-1',
      tool: 'read_file',
      arguments: { path: 'a.txt' },
    });
  });

  it('registers the Gitu provider on the model runtime and loads the system prompt', async () => {
    const h = harness(async () => {});
    const request = input({ instructions: 'You are Agent Gitu.' });
    await h.runtime.runTurn(request);
    expect(h.registered).toEqual([
      expect.objectContaining({ baseUrl: 'https://api.deepseek.com', api: 'openai-completions', models: [expect.objectContaining({ id: 'deepseek-flash' })] }),
    ]);
    const loader = h.options[0]!.resourceLoader as unknown as { loaderOptions: PiResourceLoaderOptions };
    expect(loader.loaderOptions.systemPrompt).toBe('You are Agent Gitu.');
    expect(h.reloads()).toBe(1);
    expect(h.options[0]!.thinkingLevel).toBe('medium');
  });

  it('records the session thread and resumes it instead of starting a new one', async () => {
    const h = harness(async () => {});
    const request = input();
    await h.runtime.runTurn(request);
    expect(request.onThread).toHaveBeenCalledWith('pi-session-new');
    expect(request.onTurn).toHaveBeenCalledWith('pi-turn-1');
    expect(request.onSettings).toHaveBeenCalledWith({ model: 'deepseek-flash', requestedEffort: undefined, effectiveEffort: undefined });
    expect(h.created).toHaveLength(1);

    const resume = harness(async () => {}, { 'pi-session-1': path.join('sessions', 'pi-session-1.jsonl') });
    const first = input({ threadId: 'pi-session-1' });
    await resume.runtime.runTurn(first);
    expect(resume.opened).toEqual([path.join('sessions', 'pi-session-1.jsonl')]);
    expect(resume.created).toHaveLength(0);
    expect(first.onThread).toHaveBeenCalledWith('pi-session-1');
  });

  it('refuses to silently restart an unknown saved session', async () => {
    const h = harness(async () => {});
    await expect(h.runtime.runTurn(input({ threadId: 'gone' }))).rejects.toThrow('no longer exists');
    expect(h.created).toHaveLength(0);
  });

  it('steers an active turn and reports an interrupted status on abort', async () => {
    const controller = new AbortController();
    const h = harness(async (session) => {
      await h.runtime.steer('stop and reconsider');
      controller.abort();
    });
    const request = input({ signal: controller.signal });
    const result: NativeTaskResult = await h.runtime.runTurn(request);
    expect(h.sessions[0]!.steers).toEqual(['stop and reconsider']);
    expect(h.sessions[0]!.aborted).toBe(true);
    expect(result.status).toBe('interrupted');
  });

  it('steering is unavailable before a turn starts and after it ends', async () => {
    const h = harness(async () => {});
    await expect(h.runtime.steer('too early')).rejects.toThrow('no active turn');
  });

  it('disposes the session when the turn ends and never reuses one runtime slot', async () => {
    const h = harness(async () => {});
    await h.runtime.runTurn(input());
    expect(h.sessions[0]!.disposed).toBe(true);
  });

  it('classifies a provider failure into Gitu failure classes', async () => {
    const h = harness(async () => {
      throw new Error('401 Unauthorized: invalid api key');
    });
    await expect(h.runtime.runTurn(input())).rejects.toMatchObject({ details: { kind: 'auth' } });
  });

  it('never reports a runtime slot as busy after a failed turn', async () => {
    let fail = true;
    const h = harness(async () => {
      if (fail) throw new Error('429 rate limit');
    });
    await expect(h.runtime.runTurn(input())).rejects.toBeInstanceOf(LlmError);
    fail = false;
    await expect(h.runtime.runTurn(input())).resolves.toMatchObject({ status: 'completed' });
  });
});

describe('pi admission policy hook', () => {
  it('blocks a tool outside the task grant and audits every admitted call', async () => {
    const admitted: { tool: string; args: Record<string, unknown> }[] = [];
    let handler: (event: Record<string, unknown>) => Promise<{ block: true; reason: string } | undefined> = async () => undefined;
    const extension = piAdmissionExtension(new Set(['read_file']), (entry) => admitted.push(entry));
    (extension as (pi: { on: (event: string, h: typeof handler) => unknown }) => void)({
      on: (_event, h) => {
        handler = h;
      },
    });
    await expect(handler({ toolName: 'run_command', input: { command: 'rm -rf /' } })).resolves.toMatchObject({ block: true });
    expect(admitted).toEqual([]);
    await expect(handler({ toolName: 'read_file', input: { path: 'a.txt' } })).resolves.toBeUndefined();
    expect(admitted).toEqual([{ tool: 'read_file', args: { path: 'a.txt' } }]);
  });
});

describe('pi mapping helpers', () => {
  it('maps Gitu effort levels onto pi thinking levels', () => {
    expect(thinkingLevelFor('low')).toBe('low');
    expect(thinkingLevelFor('MAX')).toBe('max');
    expect(thinkingLevelFor(undefined)).toBe('medium');
    expect(thinkingLevelFor('nonsense')).toBe('medium');
  });

  it('namespaces the provider so a pi built-in catalog is never replaced', () => {
    expect(piProviderConfig({ providerId: 'gitu-deepseek', baseUrl: 'https://api.deepseek.com', apiKey: 'k', modelId: 'm' }).models![0]!.input).toEqual(['text']);
  });

  it('converts a refused or image-bearing tool result without inventing content', () => {
    expect(toToolResult({ success: false, contentItems: [{ type: 'inputText', text: 'refused' }] })).toEqual({
      content: [{ type: 'text', text: 'refused' }],
      details: undefined,
      isError: true,
    });
    expect(toToolResult({ success: true, contentItems: [{ type: 'inputImage', imageUrl: 'data:image/png;base64,AAA' }] })).toEqual({
      content: [{ type: 'image', mimeType: 'image/png', data: 'AAA' }],
      details: undefined,
      isError: false,
    });
    expect(toToolResult({ success: true })).toEqual({
      content: [{ type: 'text', text: 'The operation completed.' }],
      details: undefined,
      isError: false,
    });
  });

  it('keeps an aborted turn classified as aborted, not as a provider error', async () => {
    const error = new LlmError('stopped', { kind: 'aborted' });
    expect(classifyPiError(error)).toBe(error);
    expect(classifyPiError(new Error('fetch failed')).details.kind).toBe('network');
    expect(classifyPiError(new Error('insufficient quota')).details.kind).toBe('quota_exhausted');
  });

  it('reports a failed turn without naming the runtime or the registration namespace', async () => {
    const h = harness(async () => {
      throw new Error('gitu-deepseek rejected the credential for gitu-deepseek');
    });
    const failure = (await h.runtime.runTurn(input()).catch((error: Error) => error)) as Error;
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toBe('The model turn failed: deepseek rejected the credential for deepseek');
    expect(failure.message).not.toContain('gitu-');
    expect(failure.message).not.toMatch(/\bpi\b|-native|runtime/i);
  });

  it('names the provider, not its internal registration id, when the model is unavailable', async () => {
    const h = harness(async () => {}, {}, undefined, { hasModel: false });
    const failure = (await h.runtime.runTurn(input()).catch((error: Error) => error)) as Error;
    expect(failure.message).toBe('The model "deepseek-flash" is not available from provider "deepseek". Check the provider configuration.');
    expect(failure.message).not.toContain('gitu-');
  });
});
