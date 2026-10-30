import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runNativeCodexTask } from '../src/coding/native-codex-supervisor.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { PolicyEngine } from '../src/policy/policy.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { PiNativeRuntime } from '../src/llm/pi-native.js';
import type { PiCreateAgentSessionOptions, PiModelRuntime, PiSession, PiSessionEvent, PiSessionManager, PiSdk } from '../src/llm/pi/sdk.js';
import type { GituConfig } from '../src/agent/gitu.js';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function fakeSdk(
  scenario: (session: PiSession, options: PiCreateAgentSessionOptions) => Promise<void>,
  options: PiCreateAgentSessionOptions[] = [],
): PiSdk {
  const modelRuntime: PiModelRuntime = {
    registerProvider: () => {},
    getModel: (providerId, modelId) => ({ providerId, modelId }),
    getModels: () => [],
    listCredentials: async () => [{ providerId: 'openai-codex', type: 'oauth' }],
    getAuth: async () => undefined,
    completeSimple: async () => ({ content: [], stopReason: 'stop' }),
    login: async () => ({}),
    logout: async () => {},
  };
  const manager: PiSessionManager = {
    getSessionId: () => 'pi-session-evidence-1',
    getSessionFile: () => '/sessions/pi-session-evidence-1.jsonl',
  };
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
        sessionId: 'pi-session-evidence-1',
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

function fixture(scenario: (session: PiSession, options: PiCreateAgentSessionOptions) => Promise<void>, criteria?: { text: string; verification?: string }[]) {
  const root = mkdtempSync(path.join(tmpdir(), 'gitu-pi-gate-'));
  folders.push(root);
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'pi-gate-test', version: '1.0.0' }));
  writeFileSync(path.join(root, 'service.cjs'), 'module.exports = { port: 3000 };\n');

  const guard = ProjectGuard.detect(root);
  const ledger = TaskLedger.create({ repoRoot: root, project: guard.lock, goal: 'Update service.cjs port to 8080 and verify', mode: 'agent' });
  ledger.ensureInitialWorkPhase(ledger.data.goal);

  const sdk = fakeSdk(scenario);
  const runtime = new PiNativeRuntime({
    agentDir: root,
    target: { providerId: 'openai-codex', builtin: true, baseUrl: '', apiKey: '', modelId: 'gpt-6-astra' },
    loadSdk: async () => sdk,
  });

  const llm = Object.assign(new ScriptedMockLlm([]), { nativeTask: runtime });
  const config: GituConfig = {
    cwd: root,
    llm,
    mode: 'agent',
    requirePlanReview: false,
    autoLearn: false,
    approvalHandler: () => true,
    criteria: criteria ?? [{ text: 'service syntax is valid', verification: 'node --check service.cjs' }],
  };

  const run = () =>
    runNativeCodexTask({
      config,
      guard,
      ledger,
      memory: MemoryStore.forProject(root),
      policy: new PolicyEngine(true, () => true),
      signal: new AbortController().signal,
      goal: ledger.data.goal,
      message: ledger.data.goal,
    });

  return { root, guard, ledger, run };
}

describe('Pi runtime evidence gate verification', () => {
  it('blocks completion when Pi modifies files but required verification fails', async () => {
    const f = fixture(async (session, options) => {
      const emit = (session as unknown as { emit: (event: PiSessionEvent) => void }).emit;

      // 1. Tool execution: Pi edits service.cjs to have invalid syntax
      const editTool = options.customTools.find((t) => t.name === 'gitu_apply_edit');
      expect(editTool).toBeDefined();
      await editTool!.execute('call-1', { path: 'service.cjs', oldString: '3000', newString: '8080 syntax error' }, undefined, undefined, undefined as never);

      // 2. Pi concludes with a final answer message
      emit({ type: 'message_start', message: { role: 'assistant' } });
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Updated port to 8080.' } });
      emit({
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Updated port to 8080.' }],
        },
      });
    });

    const result = await f.run();
    expect(result.report.status).toBe('blocked');
    expect(f.ledger.data.blockers.join(' ')).toContain('acceptance criteria remain unverified');
    expect(result.report.verificationDetails?.some((v) => !v.passed)).toBe(true);
  });

  it('allows completion when Pi modifies files and verification command passes', async () => {
    const f = fixture(async (session, options) => {
      const emit = (session as unknown as { emit: (event: PiSessionEvent) => void }).emit;

      // 1. Tool execution: Pi edits service.cjs to valid syntax
      const editTool = options.customTools.find((t) => t.name === 'gitu_apply_edit');
      expect(editTool).toBeDefined();
      await editTool!.execute('call-1', { path: 'service.cjs', oldString: '3000', newString: '8080' }, undefined, undefined, undefined as never);

      // 2. Pi concludes with final answer message
      emit({ type: 'message_start', message: { role: 'assistant' } });
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Port successfully updated to 8080.' } });
      emit({
        type: 'message_end',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Port successfully updated to 8080.' }],
        },
      });
    });

    const result = await f.run();
    expect(result.report.status).toBe('complete');
    expect(readFileSync(path.join(f.root, 'service.cjs'), 'utf8')).toContain('8080');
    expect(f.ledger.data.execution?.mode).toBe('pi-native');
    expect(result.report.verificationDetails?.some((v) => v.passed && v.command === 'node --check service.cjs')).toBe(true);
  });
});
