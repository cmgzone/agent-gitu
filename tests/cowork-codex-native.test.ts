import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runNativeCoworkTurn } from '../src/cowork/codex-native.js';
import { CoworkMemory } from '../src/cowork/memory.js';
import { coworkNativeTools } from '../src/cowork/tools.js';
import { CoworkStore } from '../src/cowork/store.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { LlmError, ScriptedMockLlm } from '../src/llm/llm.js';
import type { NativeTaskInput } from '../src/llm/native-task.js';
import type { LlmMessage } from '../src/llm/llm.js';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { force: true, recursive: true });
});

function fixture(
  scenario: (input: NativeTaskInput) => Promise<void>,
  onProgress?: (text: string) => void,
  // `baseDelayMs` keeps a retry test off the real backoff, and `signal` lets it
  // exercise Stop during that wait.
  options: { baseDelayMs?: number; signal?: AbortSignal } = {},
) {
  const root = mkdtempSync(path.join(tmpdir(), 'gitu-native-cowork-'));
  folders.push(root);
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'native-cowork-test', version: '1.0.0' }));
  writeFileSync(path.join(root, 'a.txt'), 'Before');
  const store = new CoworkStore(path.join(root, 'cowork.json'));
  const agent = store.saveAgent({
    name: 'Native worker',
    systemPrompt: 'Be concise.',
    avatar: { color: '#123456', shape: 'cube' },
    tagline: '',
    useHostComputer: true,
    allowWrites: true,
    allowShell: false,
  });
  const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
  const runTurn = vi.fn(async (input: NativeTaskInput) => {
    input.onThread('native-thread');
    input.onTurn('native-turn');
    await scenario(input);
    return { threadId: 'native-thread', turnId: 'native-turn', status: 'completed' as const };
  });
  const steer = vi.fn(async () => {});
  const client = Object.assign(new ScriptedMockLlm([]), { nativeTask: { mode: 'codex-native' as const, runTurn, steer } });
  const ctx = { guard: ProjectGuard.detect(root), cwd: root };
  const onTool = vi.fn();
  const run = (messages: LlmMessage[] = [{ role: 'user', content: 'Read a.txt.' }]) =>
    runNativeCoworkTurn({
      client,
      ctx,
      agent,
      conversationId: conversation.id,
      messages,
      store,
      scope: { store, agent, memory: CoworkMemory.forWorkspace(root), conversationId: conversation.id },
      tools: coworkNativeTools(agent, false),
      perms: { allowShell: agent.allowShell, allowWrites: true, allowConfig: false, chief: false, browser: false },
      onTool,
      onProgress,
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.baseDelayMs !== undefined ? { recovery: { baseDelayMs: options.baseDelayMs } } : {}),
    });
  return { root, store, agent, conversation, ctx, runTurn, run, onTool, steer };
}

async function finish(input: NativeTaskInput, text = 'Done.'): Promise<void> {
  await input.onEvent('item/completed', { item: { id: 'final', type: 'agentMessage', text, phase: 'final_answer' } });
}

describe('native Cowork execution', () => {
  it('creates a real question card for a direct unanswered question in a native final',async()=>{
    const f=fixture(input=>finish(input,'Which region should I use?\n- Europe\n- Africa'));
    const result=await f.run();
    expect(result.waiting).toBe(true);expect(f.store.requests(f.conversation.id)).toEqual([expect.objectContaining({kind:'question',title:'Which region should I use?',options:['Europe','Africa']})]);
    expect(f.onTool).toHaveBeenCalledWith('ask_user',expect.anything(),expect.objectContaining({ok:true}));
  });
  it('reconciles separate items and authoritative text before the turn closes', async () => {
    const updates: string[] = [];
    const f = fixture(async input => {
      await input.onEvent('item/agentMessage/delta', { itemId: 'commentary', delta: 'Checking now.' });
      await input.onEvent('item/agentMessage/delta', { itemId: 'answer', delta: 'The result is ' });
      await input.onEvent('item/completed', { item: { id: 'commentary', type: 'agentMessage', phase: 'commentary', text: 'Checking now.' } });
      await input.onEvent('item/completed', { item: { id: 'answer', type: 'agentMessage', phase: 'final_answer', text: 'The result is ready.' } });
      expect(updates).toEqual(['Checking now.', 'The result is', 'The result is ready.']);
    }, text => updates.push(text));
    expect((await f.run()).text).toBe('The result is ready.');
  });
  it('removes completion metadata from native finals and every streamed marker prefix', async () => {
    const progress: string[] = [];
    const f = fixture(async input => {
      const raw = 'Please review the email.\n<cowork_state>waiting</cowork_state>';
      for (const char of raw) await input.onEvent('item/agentMessage/delta', { delta: char });
      await finish(input, raw);
      expect(input.instructions).not.toContain('COMPLETION STATE:');
    });
    const result = await runNativeCoworkTurn({ client: Object.assign(new ScriptedMockLlm([]), { nativeTask: { mode: 'codex-native' as const, runTurn: f.runTurn, steer: f.steer } }), ctx: f.ctx, agent: f.agent, conversationId: f.conversation.id, store: f.store,
      messages: [{ role: 'system', content: 'COMPLETION STATE: emit a private marker.\nHelp the user.' }, { role: 'user', content: 'Read email.' }], tools: [], perms: { allowShell: false, allowWrites: false, allowConfig: false, chief: false, browser: false }, onProgress: text => progress.push(text) });
    expect(result.text).toBe('Please review the email.');
    expect(progress.every(text => !text.includes('<') && !text.includes('cowork_state'))).toBe(true);
    expect(f.runTurn).toHaveBeenCalledOnce();
  });

  it('keeps pending command status polls running while steering unchanged terminal results before stopping', async () => {
    const polling = fixture(async input => {
      for (let i = 0; i < 6; i++) expect((await input.onRequest('item/tool/call', { turnId: 'native-turn', callId: 'poll-' + i, tool: 'run_command', arguments: { action: 'status', id: 'cmd-1' } }))['success']).toBe(true);
      await finish(input, 'The command is still running.');
    });
    polling.agent.allowShell = true;
    Object.assign(polling.ctx, { authorizeTool: vi.fn(async () => ({ ok: true, status: 'running', output: 'Still running', payload: { id: 'cmd-1' } })) });
    expect((await polling.run()).text).toContain('still running');
    expect(polling.steer).not.toHaveBeenCalled();
    const terminal = fixture(async input => {
      for (let i = 0; i < 4; i++) await input.onRequest('item/tool/call', { turnId: 'native-turn', callId: 'same-' + i, tool: 'read_file', arguments: { path: 'a.txt' } });
    });
    await expect(terminal.run()).rejects.toThrow('unchanged result without progress');
    expect(terminal.steer).toHaveBeenCalledOnce();
    expect(terminal.steer.mock.calls[0]![0]).toContain('different useful action');
  });

  it('ends repeated requests outside the agent grant without starting another turn', async () => {
    const f = fixture(async (input) => {
      for (let i = 0; i < 4; i++)
        await input.onRequest('item/tool/call', { turnId: 'native-turn', callId: 'denied-' + i, tool: 'run_command', arguments: { command: 'echo forbidden' } });
    });
    await expect(f.run()).rejects.toThrow('denied or waiting request without progress');
    expect(f.runTurn).toHaveBeenCalledTimes(1);
    expect(f.onTool).not.toHaveBeenCalled();
  });

  it('retries a transient native failure that happened before any function ran', async () => {
    const progress: string[] = [];
    const f = fixture(async (input) => {
      await finish(input, 'Done.');
    }, (text) => progress.push(text), { baseDelayMs: 1 });
    // The original implementation, read before the spy is re-programmed: the
    // mock is the runtime's own runTurn, so calling it by reference would recurse.
    const original = f.runTurn.getMockImplementation()!;
    let attempts = 0;
    f.runTurn.mockImplementation(async (input: NativeTaskInput) => {
      if (++attempts === 1) throw new LlmError('503 service unavailable', { kind: 'provider_unavailable' });
      return original(input);
    });
    expect((await f.run()).text).toBe('Done.');
    expect(attempts).toBe(2);
    expect(progress.join('\n')).toContain('attempt 2/3');
  });

  it('does not re-enter a native turn that already ran a function', async () => {
    const f = fixture(async (input) => {
      expect((await input.onRequest('item/tool/call', { turnId: 'native-turn', callId: 'read', tool: 'read_file', arguments: { path: 'a.txt' } }))['success']).toBe(true);
      throw new LlmError('503 service unavailable', { kind: 'provider_unavailable' });
    }, undefined, { baseDelayMs: 1 });
    await expect(f.run()).rejects.toThrow('503 service unavailable');
    expect(f.runTurn).toHaveBeenCalledTimes(1);
    expect(f.onTool).toHaveBeenCalledTimes(1);
  });

  it('lets Stop cancel the recovery wait instead of sitting out the backoff', async () => {
    const controller = new AbortController();
    const f = fixture(async () => {
      throw new LlmError('503 service unavailable', { kind: 'provider_unavailable' });
    }, undefined, { baseDelayMs: 60_000, signal: controller.signal });
    const pending = f.run().then(() => 'resolved', (error: Error) => error.message);
    await vi.waitFor(() => expect(f.runTurn).toHaveBeenCalledTimes(1));
    controller.abort();
    expect(await pending).toMatch(/abort/i);
    expect(f.runTurn).toHaveBeenCalledTimes(1);
  }, 15_000);

  it('executes scoped functions once and persists native continuity', async () => {
    const f = fixture(async (input) => {
      const params = { callId: 'edit', turnId: 'native-turn', tool: 'write_file', arguments: { path: 'a.txt', content: 'After' } };
      expect((await input.onRequest('item/tool/call', params))['success']).toBe(true);
      expect((await input.onRequest('item/tool/call', params))['success']).toBe(true);
      await finish(input);
    });
    expect((await f.run()).text).toBe('Done.');
    expect(f.onTool).toHaveBeenCalledTimes(1);
    expect(readFileSync(path.join(f.root, 'a.txt'), 'utf8')).toBe('After');
    const key = [f.conversation.id, f.agent.id, '', 'chat'].join(':');
    const loaded = new CoworkStore(path.join(f.root, 'cowork.json'));
    expect(loaded.nativeCodexSession(key)?.threadId).toBe('native-thread');
    loaded.deleteConversation(f.conversation.id);
    expect(loaded.nativeCodexSession(key)).toBeUndefined();
  });

  it('resumes only the appended conversation input', async () => {
    const f = fixture((input) => finish(input));
    await f.run([{ role: 'user', content: 'First request.' }]);
    await f.run([
      { role: 'user', content: 'First request.' },
      { role: 'assistant', content: 'Done.' },
      { role: 'user', content: 'Follow-up request.' },
    ]);
    const input = f.runTurn.mock.calls[1]![0];
    expect(input.threadId).toBe('native-thread');
    expect(input.text).toContain('Follow-up request.');
    expect(input.text).not.toContain('First request.');
    expect(f.runTurn).toHaveBeenCalledTimes(2);
  });

  it('rejects a function outside the agent grant and all direct OS expansions', async () => {
    const f = fixture(async (input) => {
      expect((await input.onRequest('item/tool/call', { turnId: 'native-turn', callId: 'shell', tool: 'run_command', arguments: { command: 'echo bad' } }))['success']).toBe(false);
      expect(await input.onRequest('item/commandExecution/requestApproval', {})).toEqual({ decision: 'decline' });
      expect(await input.onRequest('item/permissions/requestApproval', {})).toEqual({ permissions: {}, scope: 'turn' });
      await finish(input);
    });
    await f.run();
    expect(f.onTool).not.toHaveBeenCalled();
  });

  it('keeps a stable guarded function for changed permissions between turns', async () => {
    const f = fixture(async (input) => {
      const result = await input.onRequest('item/tool/call', {
        turnId: 'native-turn',
        callId: 'generic',
        tool: 'gitu_cowork',
        arguments: { tool: 'read_file', params: { path: 'a.txt' } },
      });
      expect(result['success']).toBe(true);
      await finish(input);
    });
    await f.run();
    expect(f.onTool).toHaveBeenCalledTimes(1);
  });

  it('does not accept progress as a final answer or retry the native turn', async () => {
    const f = fixture(async (input) => {
      await input.onEvent('item/completed', { item: { id: 'progress', type: 'agentMessage', phase: 'commentary', text: 'Working…' } });
    });
    await expect(f.run()).rejects.toThrow('no final response');
    expect(f.runTurn).toHaveBeenCalledTimes(1);
  });

  it('denies built-in OS attempts with a correction and continues with guarded functions', async () => {
    const f = fixture(async (input) => {
      await input.onEvent('item/started', { item: { id: 'cmd-1', type: 'commandExecution' } });
      await input.onEvent('item/completed', { item: { id: 'cmd-1', type: 'commandExecution', status: 'failed', exitCode: 1 } });
      // Restarted or duplicated events of the same attempt must stay one denial.
      await input.onEvent('item/started', { item: { id: 'cmd-1', type: 'commandExecution' } });
      expect((await input.onRequest('item/commandExecution/requestApproval', {}))['decision']).toBe('decline');
      expect((await input.onRequest('item/fileChange/requestApproval', {}))['decision']).toBe('decline');
      const recovered = await input.onRequest('item/tool/call', {
        turnId: 'native-turn',
        callId: 'recovered-read',
        tool: 'read_file',
        arguments: { path: 'a.txt' },
      });
      expect(recovered['success']).toBe(true);
      expect(JSON.stringify(recovered)).toContain('Before');
      await finish(input);
    });
    expect((await f.run()).text).toBe('Done.');
    expect(f.onTool).toHaveBeenCalledTimes(1);
    expect(f.steer).toHaveBeenCalledTimes(1);
    expect(String(f.steer.mock.calls[0]![0])).toContain('guarded functions');
    expect(f.runTurn).toHaveBeenCalledTimes(1);
  });

  it('stops a model that keeps attempting built-in OS execution or mutates files natively', async () => {
    const repeated = fixture(async (input) => {
      for (let i = 0; i < 3; i++) await input.onEvent('item/started', { item: { id: 'cmd-' + i, type: 'commandExecution' } });
    });
    await expect(repeated.run()).rejects.toThrow('kept attempting built-in OS execution');
    expect(repeated.runTurn).toHaveBeenCalledTimes(1);
    const mutation = fixture(async (input) => {
      await input.onEvent('item/completed', { item: { id: 'edit-1', type: 'fileChange', status: 'completed', changes: [{ path: 'a.txt' }] } });
    });
    await expect(mutation.run()).rejects.toThrow('changed files through built-in execution');
    expect(JSON.stringify(readFileSync(path.join(mutation.root, 'a.txt'), 'utf8'))).toContain('Before');
  });
});
