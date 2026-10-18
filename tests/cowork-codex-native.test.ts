import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runNativeCoworkTurn } from '../src/cowork/codex-native.js';
import { coworkNativeTools } from '../src/cowork/tools.js';
import { CoworkStore } from '../src/cowork/store.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import type { NativeTaskInput } from '../src/llm/native-task.js';
import type { LlmMessage } from '../src/llm/llm.js';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { force: true, recursive: true });
});

function fixture(scenario: (input: NativeTaskInput) => Promise<void>) {
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
      tools: coworkNativeTools(agent, false),
      perms: { allowShell: false, allowWrites: true, allowConfig: false, chief: false, browser: false },
      onTool,
    });
  return { root, store, agent, conversation, runTurn, run, onTool, steer };
}

async function finish(input: NativeTaskInput, text = 'Done.'): Promise<void> {
  await input.onEvent('item/completed', { item: { id: 'final', type: 'agentMessage', text, phase: 'final_answer' } });
}

describe('native Cowork execution', () => {
  it('ends repeated requests outside the agent grant without starting another turn', async () => {
    const f = fixture(async (input) => {
      for (let i = 0; i < 4; i++)
        await input.onRequest('item/tool/call', { turnId: 'native-turn', callId: 'denied-' + i, tool: 'run_command', arguments: { command: 'echo forbidden' } });
    });
    await expect(f.run()).rejects.toThrow('denied or waiting request without progress');
    expect(f.runTurn).toHaveBeenCalledTimes(1);
    expect(f.onTool).not.toHaveBeenCalled();
  });

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
