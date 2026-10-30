/**
 * End-to-end proof that a Gitu surface runs on pi.
 *
 * This drives the *real* cowork runner (`runNativeCoworkTurn`) — the same entry
 * point that interactive chat, missions, temporary workers, sub-agents and the
 * Telegram/channel gateway use — against a real `PiNativeRuntime`, with only the
 * pi package itself faked. A tool really reads a file, so the assertion covers
 * the whole chain: pi custom tool → `item/tool/call` → Gitu's permission path →
 * tool result back to pi.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runNativeCoworkTurn } from '../src/cowork/codex-native.js';
import { CoworkMemory } from '../src/cowork/memory.js';
import { coworkNativeTools } from '../src/cowork/tools.js';
import { CoworkStore } from '../src/cowork/store.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { PiNativeRuntime } from '../src/llm/pi-native.js';
import type { PiCreateAgentSessionOptions, PiModelRuntime, PiSession, PiSessionEvent, PiSessionManager, PiSdk } from '../src/llm/pi/sdk.js';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { force: true, recursive: true });
});

function fakeSdk(
  scenario: (session: PiSession, options: PiCreateAgentSessionOptions) => Promise<void>,
  options: PiCreateAgentSessionOptions[],
): PiSdk {
  const modelRuntime: PiModelRuntime = { registerProvider: () => {}, getModel: (providerId, modelId) => ({ providerId, modelId }) };
  const manager: PiSessionManager = { getSessionId: () => 'pi-thread-1', getSessionFile: () => '/sessions/pi-thread-1.jsonl' };
  return {
    ModelRuntime: { create: async () => modelRuntime },
    SettingsManager: { create: () => ({}) },
    SessionManager: { create: () => manager, open: () => manager, findById: () => undefined },
    DefaultResourceLoader: class {
      async reload(): Promise<void> {}
    },
    createAgentSession: async (sessionOptions) => {
      options.push(sessionOptions);
      const listeners = new Set<(event: PiSessionEvent) => void>();
      const session: PiSession = {
        sessionId: 'pi-thread-1',
        subscribe: (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        prompt: async () => {
          const emit = (event: PiSessionEvent): void => {
            for (const listener of [...listeners]) listener(event);
          };
          await scenario(
            {
              ...session,
              emit,
            } as PiSession & { emit: (event: PiSessionEvent) => void },
            sessionOptions,
          );
        },
        steer: async () => {},
        abort: async () => {},
        dispose: () => {},
      };
      return { session };
    },
  } as unknown as PiSdk;
}

describe('Cowork runs on pi', () => {
  it('executes a real guarded tool and reports the answer through the pi loop', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'gitu-pi-cowork-'));
    folders.push(root);
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'pi-cowork', version: '1.0.0' }));
    writeFileSync(path.join(root, 'a.txt'), 'Before');
    const store = new CoworkStore(path.join(root, 'cowork.json'));
    const agent = store.saveAgent({
      name: 'Pi worker',
      systemPrompt: 'Be concise.',
      avatar: { color: '#123456', shape: 'cube' },
      tagline: '',
      useHostComputer: true,
      allowWrites: true,
      allowShell: false,
    });
    const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });

    const created: PiCreateAgentSessionOptions[] = [];
    const sdk = fakeSdk(async (session, sessionOptions) => {
      const emit = (session as unknown as { emit: (event: PiSessionEvent) => void }).emit;
      // Round one: the model reads a file through Gitu's own guarded function.
      emit({ type: 'message_start', message: { role: 'assistant' } });
      const readFile = sessionOptions.customTools.find((tool) => tool.name === 'read_file');
      expect(readFile).toBeDefined();
      const result = await readFile!.execute('call-1', { path: 'a.txt' }, undefined, undefined, undefined as never);
      expect(result.content).toEqual([{ type: 'text', text: expect.stringContaining('Before') }]);
      emit({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'toolCall', id: 'call-1', name: 'read_file' }] } });
      // Round two: the final answer.
      emit({ type: 'message_start', message: { role: 'assistant' } });
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'The file says Before.' } });
      emit({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'The file says Before.' }] } });
    }, created);

    const runtime = new PiNativeRuntime({
      agentDir: root,
      target: { providerId: 'gitu-deepseek', baseUrl: 'https://api.deepseek.com', apiKey: 'k', modelId: 'deepseek-flash' },
      loadSdk: async () => sdk,
    });
    const onTool = vi.fn();
    const client = Object.assign(new ScriptedMockLlm([]), { nativeTask: runtime });

    const result = await runNativeCoworkTurn({
      client,
      ctx: { guard: ProjectGuard.detect(root), cwd: root },
      agent,
      conversationId: conversation.id,
      messages: [{ role: 'user', content: 'Read a.txt and report it.' }],
      store,
      scope: { store, agent, memory: CoworkMemory.forWorkspace(root), conversationId: conversation.id },
      tools: coworkNativeTools(agent, false),
      perms: { allowShell: false, allowWrites: true, allowConfig: false, chief: false, browser: false },
      onTool,
    });

    // The pi loop's final answer reached the chat transcript.
    expect(result.text).toBe('The file says Before.');
    expect(result.waiting).toBe(false);
    // Gitu's guarded tool really ran, through Gitu's own permission path.
    expect(onTool).toHaveBeenCalledWith('read_file', { path: 'a.txt' }, expect.objectContaining({ ok: true }));
    expect(onTool.mock.calls[0]![2].output).toContain('Before');
    // The pi session is recorded as this conversation's continuation, so the
    // next turn resumes the same pi transcript rather than replaying the work.
    const key = [conversation.id, agent.id, '', 'chat'].join(':');
    expect(store.nativeCodexSession(key)?.threadId).toBe('pi-thread-1');
  });

  it('refuses a function outside the agent grant without executing it', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'gitu-pi-cowork-deny-'));
    folders.push(root);
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'pi-cowork-deny', version: '1.0.0' }));
    const store = new CoworkStore(path.join(root, 'cowork.json'));
    const agent = store.saveAgent({
      name: 'Locked worker',
      systemPrompt: 'Be concise.',
      avatar: { color: '#123456', shape: 'cube' },
      tagline: '',
      useHostComputer: true,
      allowWrites: false,
      allowShell: false,
    });
    const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });

    const created: PiCreateAgentSessionOptions[] = [];
    const shellResults: unknown[] = [];
    const sdk = fakeSdk(async (session, sessionOptions) => {
      const emit = (session as unknown as { emit: (event: PiSessionEvent) => void }).emit;
      emit({ type: 'message_start', message: { role: 'assistant' } });
      const shell = sessionOptions.customTools.find((tool) => tool.name === 'run_command');
      if (shell) {
        const result = await shell.execute('call-9', { command: 'echo bad' }, undefined, undefined, undefined as never);
        shellResults.push(result);
      }
      emit({ type: 'message_start', message: { role: 'assistant' } });
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'I cannot run shell commands.' } });
      emit({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'I cannot run shell commands.' }] } });
    }, created);

    const onTool = vi.fn();
    const result = await runNativeCoworkTurn({
      client: Object.assign(new ScriptedMockLlm([]), {
        nativeTask: new PiNativeRuntime({
          agentDir: root,
          target: { providerId: 'gitu-deepseek', baseUrl: 'https://api.deepseek.com', apiKey: 'k', modelId: 'deepseek-flash' },
          loadSdk: async () => sdk,
        }),
      }),
      ctx: { guard: ProjectGuard.detect(root), cwd: root },
      agent,
      conversationId: conversation.id,
      messages: [{ role: 'user', content: 'Run a shell command.' }],
      store,
      scope: { store, agent, memory: CoworkMemory.forWorkspace(root), conversationId: conversation.id },
      tools: coworkNativeTools(agent, false),
      perms: { allowShell: false, allowWrites: false, allowConfig: false, chief: false, browser: false },
      onTool,
    });

    expect(result.text).toBe('I cannot run shell commands.');
    // A shell tool is not even declared for a teammate without shell permission.
    expect(onTool).not.toHaveBeenCalled();
    expect(shellResults).toEqual([]);
  });

  it('stops the turn when the host declares memory but supplies no memory scope', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'gitu-pi-cowork-nomemory-'));
    folders.push(root);
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'pi-cowork-nomemory', version: '1.0.0' }));
    const store = new CoworkStore(path.join(root, 'cowork.json'));
    const agent = store.saveAgent({
      name: 'Forgetful worker',
      systemPrompt: 'Be concise.',
      avatar: { color: '#123456', shape: 'cube' },
      tagline: '',
      useHostComputer: true,
      allowWrites: true,
      allowShell: false,
    });
    const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });

    // agent_memory is declared for every teammate, so a host without a memory
    // store must be told at once rather than mid-turn.
    const created: PiCreateAgentSessionOptions[] = [];
    const sdk = fakeSdk(async () => {
      throw new Error('the model must never be asked to work without the declared memory tool');
    }, created);
    const onTool = vi.fn();

    await expect(
      runNativeCoworkTurn({
        client: Object.assign(new ScriptedMockLlm([]), {
          nativeTask: new PiNativeRuntime({
            agentDir: root,
            target: { providerId: 'gitu-deepseek', baseUrl: 'https://api.deepseek.com', apiKey: 'k', modelId: 'deepseek-flash' },
            loadSdk: async () => sdk,
          }),
        }),
        ctx: { guard: ProjectGuard.detect(root), cwd: root },
        agent,
        conversationId: conversation.id,
        messages: [{ role: 'user', content: 'Remember that I prefer short reports.' }],
        store,
        tools: coworkNativeTools(agent, false),
        perms: { allowShell: false, allowWrites: true, allowConfig: false, chief: false, browser: false },
        onTool,
      }),
    ).rejects.toThrow(/memory is not wired[\s\S]*deps\.memory/);
    // Nothing ran: no pi session was created and no tool was executed.
    expect(created).toEqual([]);
    expect(onTool).not.toHaveBeenCalled();
  });

  it('remembers and recalls through the pi loop, and the fact outlives the turn', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'gitu-pi-cowork-memory-'));
    folders.push(root);
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'pi-cowork-memory', version: '1.0.0' }));
    const store = new CoworkStore(path.join(root, 'cowork.json'));
    const agent = store.saveAgent({
      name: 'Memory worker',
      systemPrompt: 'Be concise.',
      avatar: { color: '#123456', shape: 'cube' },
      tagline: '',
      useHostComputer: true,
      allowWrites: true,
      allowShell: false,
    });
    const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    const claim = 'Deploy window is Friday 02:00 UTC.';

    const created: PiCreateAgentSessionOptions[] = [];
    const sdk = fakeSdk(async (session, sessionOptions) => {
      const emit = (session as unknown as { emit: (event: PiSessionEvent) => void }).emit;
      const memoryTool = sessionOptions.customTools.find((tool) => tool.name === 'agent_memory');
      expect(memoryTool).toBeDefined();
      // Round one: the model persists a fact. The write goes through Gitu's
      // guarded function, so it lands in the shared store, not in pi's session.
      emit({ type: 'message_start', message: { role: 'assistant' } });
      const remembered = await memoryTool!.execute('call-1', { action: 'remember', text: claim }, undefined, undefined, undefined as never);
      expect(remembered.isError).toBeFalsy();
      expect(remembered.content).toEqual([{ type: 'text', text: expect.stringContaining('Remembered') }]);
      emit({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'toolCall', id: 'call-1', name: 'agent_memory' }] } });
      // Round two: the same session reads the fact back by query.
      emit({ type: 'message_start', message: { role: 'assistant' } });
      const recalled = await memoryTool!.execute('call-2', { action: 'recall', query: 'deploy window' }, undefined, undefined, undefined as never);
      expect(recalled.isError).toBeFalsy();
      expect(recalled.content).toEqual([{ type: 'text', text: expect.stringContaining(claim) }]);
      emit({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'toolCall', id: 'call-2', name: 'agent_memory' }] } });
      // Round three: the final answer.
      emit({ type: 'message_start', message: { role: 'assistant' } });
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Saved it and read it back.' } });
      emit({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'Saved it and read it back.' }] } });
    }, created);

    const onTool = vi.fn();
    const result = await runNativeCoworkTurn({
      client: Object.assign(new ScriptedMockLlm([]), {
        nativeTask: new PiNativeRuntime({
          agentDir: root,
          target: { providerId: 'gitu-deepseek', baseUrl: 'https://api.deepseek.com', apiKey: 'k', modelId: 'deepseek-flash' },
          loadSdk: async () => sdk,
        }),
      }),
      ctx: { guard: ProjectGuard.detect(root), cwd: root },
      agent,
      conversationId: conversation.id,
      messages: [{ role: 'user', content: 'Remember our deploy window.' }],
      store,
      scope: { store, agent, memory: CoworkMemory.forWorkspace(root), conversationId: conversation.id },
      tools: coworkNativeTools(agent, false),
      perms: { allowShell: false, allowWrites: true, allowConfig: false, chief: false, browser: false },
      onTool,
    });

    expect(result.text).toBe('Saved it and read it back.');
    // Both calls were admitted and executed through the same guarded path.
    expect(onTool).toHaveBeenCalledWith('agent_memory', { action: 'remember', text: claim }, expect.objectContaining({ ok: true }));
    expect(onTool).toHaveBeenCalledWith('agent_memory', { action: 'recall', query: 'deploy window' }, expect.objectContaining({ ok: true }));
    // The fact lives in Gitu's store for this workspace: a fresh facade reads it
    // back after the pi session was disposed, so the next session starts with it.
    const reopened = CoworkMemory.forWorkspace(root);
    expect(reopened.count(agent)).toBe(1);
    expect(reopened.recall(agent, 'deploy window')).toContain(claim);
  });
});
