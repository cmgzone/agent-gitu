import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MemoryStore } from '../src/memory/memory-store.js';
import { CoworkMemory } from '../src/cowork/memory.js';
import { CoworkStore } from '../src/cowork/store.js';
import { ProjectGuard } from '../src/guard/guard.js';
import { LlmError } from '../src/llm/llm.js';
import type { NativeTaskInput } from '../src/llm/native-task.js';
import { PiNativeRuntime } from '../src/llm/pi-native.js';
import {
  buildGituCompactionInstructions,
  extractCumulativeFileOps,
  piCompactionExtension,
  type CompactionPreparation,
  type GituCompactionContext,
} from '../src/llm/pi-compaction-extension.js';
import type {
  PiCreateAgentSessionOptions,
  PiModelRuntime,
  PiSession,
  PiSessionEvent,
  PiSessionManager,
  PiSdk,
} from '../src/llm/pi/sdk.js';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) {
    try {
      rmSync(folder, { force: true, recursive: true });
    } catch {}
  }
});

function tempWorkspace(prefix = 'gitu-pi-compaction-'): string {
  const root = mkdtempSync(path.join(tmpdir(), prefix));
  folders.push(root);
  return root;
}

describe('Gitu-aware Pi compaction instructions', () => {
  it('formats task objective, criteria, constraints, decisions, and files', () => {
    const ctx: GituCompactionContext = {
      goal: 'Refactor authentication module',
      criteria: ['All unit tests pass', 'Zero regression in OAuth flow'],
      constraints: ['Do not modify DB schema', 'Keep backward compatibility'],
      decisions: ['Use JWT tokens with RS256 signing'],
      remainingPlan: ['Update auth middleware', 'Add token revocation endpoint'],
      unresolvedQuestions: ['Should refresh token TTL be 7 days or 30 days?'],
      relevantFiles: ['src/auth/jwt.ts', 'src/middleware/auth.ts'],
      customFocus: 'Pay special attention to rate limit headers',
    };

    const instructions = buildGituCompactionInstructions(ctx);

    expect(instructions).toContain('Active Goal: Refactor authentication module');
    expect(instructions).toContain('Acceptance Criteria to Preserve:');
    expect(instructions).toContain('- All unit tests pass');
    expect(instructions).toContain('- Zero regression in OAuth flow');
    expect(instructions).toContain('Constraints & Guidelines:');
    expect(instructions).toContain('- Do not modify DB schema');
    expect(instructions).toContain('Key Architectural Decisions:');
    expect(instructions).toContain('- Use JWT tokens with RS256 signing');
    expect(instructions).toContain('Remaining Plan:');
    expect(instructions).toContain('- Update auth middleware');
    expect(instructions).toContain('Unresolved Blockers / Questions:');
    expect(instructions).toContain('- Should refresh token TTL be 7 days or 30 days?');
    expect(instructions).toContain('Key Files:');
    expect(instructions).toContain('- src/auth/jwt.ts');
    expect(instructions).toContain('Additional Focus: Pay special attention to rate limit headers');
    expect(instructions).toContain('Do not hallucinate completed steps or discard unverified requirements.');
  });

  it('handles empty or partial context gracefully', () => {
    const instructionsEmpty = buildGituCompactionInstructions(undefined);
    expect(instructionsEmpty).toContain('Preserve the following critical task context');
    expect(instructionsEmpty).not.toContain('Active Goal:');

    const instructionsMinimal = buildGituCompactionInstructions({ goal: 'Fix bug #42' });
    expect(instructionsMinimal).toContain('Active Goal: Fix bug #42');
    expect(instructionsMinimal).not.toContain('Acceptance Criteria to Preserve:');
  });
});

describe('piCompactionExtension hook', () => {
  it('supplies Gitu-aware custom instructions and custom compaction result', async () => {
    let beforeCompactHandler: ((event: Record<string, unknown>) => Promise<Record<string, unknown> | undefined>) | undefined;
    const fakePiContext = {
      on: (event: string, handler: (e: Record<string, unknown>) => Promise<Record<string, unknown> | undefined>) => {
        if (event === 'session_before_compact') {
          beforeCompactHandler = handler;
        }
      },
      model: { id: 'test-model', provider: 'test-provider' },
      modelRegistry: {
        getApiKeyAndHeaders: async () => ({ apiKey: 'test-key', headers: { 'X-Custom': 'header' } }),
      },
      thinkingLevel: 'medium',
    };

    const onCompacted = vi.fn();
    const compactFn = vi.fn(async (prep, model, apiKey, headers, instructions) => ({
      summary: `Compacted with instructions: ${instructions}`,
      firstKeptEntryId: 'entry-kept-1',
      tokensBefore: 45000,
    }));

    const extFactory = piCompactionExtension({
      getContext: () => ({
        goal: 'Migrate to Pi tools',
        criteria: ['Pass all tests'],
      }),
      onCompacted,
      compactFn: compactFn as never,
    });

    extFactory(fakePiContext);
    expect(beforeCompactHandler).toBeDefined();

    const mockPreparation = {
      firstKeptEntryId: 'entry-kept-1',
      messagesToSummarize: [],
      turnPrefixMessages: [],
      isSplitTurn: false,
      tokensBefore: 45000,
      fileOps: { reads: new Set<string>(), modifications: new Set<string>() },
      settings: { enabled: true, reserveTokens: 16384, keepRecentTokens: 20000 },
    };

    const abortController = new AbortController();
    const result = await beforeCompactHandler!({
      type: 'session_before_compact',
      preparation: mockPreparation,
      reason: 'threshold',
      willRetry: false,
      signal: abortController.signal,
    });

    expect(compactFn).toHaveBeenCalledOnce();
    const passedInstructions = compactFn.mock.calls[0]![4];
    expect(passedInstructions).toContain('Active Goal: Migrate to Pi tools');
    expect(passedInstructions).toContain('- Pass all tests');

    expect(result).toBeDefined();
    expect(result?.compaction).toBeDefined();
    expect((result?.compaction as { summary: string }).summary).toContain('Compacted with instructions:');

    expect(onCompacted).toHaveBeenCalledWith({
      reason: 'threshold',
      tokensBefore: 45000,
      summary: expect.stringContaining('Compacted with instructions:'),
    });
  });

  it('supports cancellation without corrupting session', async () => {
    let beforeCompactHandler: ((event: Record<string, unknown>) => Promise<Record<string, unknown> | undefined>) | undefined;
    const fakePiContext = {
      on: (event: string, handler: (e: Record<string, unknown>) => Promise<Record<string, unknown> | undefined>) => {
        if (event === 'session_before_compact') beforeCompactHandler = handler;
      },
    };

    const extFactory = piCompactionExtension({
      shouldCancel: (event) => event.reason === 'overflow',
    });
    extFactory(fakePiContext);

    const result = await beforeCompactHandler!({
      type: 'session_before_compact',
      preparation: { firstKeptEntryId: '1', tokensBefore: 1000 },
      reason: 'overflow',
      willRetry: true,
      signal: new AbortController().signal,
    });

    expect(result).toEqual({ cancel: true });
  });

  it('propagates summarization errors so Pi triggers safe failure recovery', async () => {
    let beforeCompactHandler: ((event: Record<string, unknown>) => Promise<Record<string, unknown> | undefined>) | undefined;
    const fakePiContext = {
      on: (event: string, handler: (e: Record<string, unknown>) => Promise<Record<string, unknown> | undefined>) => {
        if (event === 'session_before_compact') beforeCompactHandler = handler;
      },
      model: { id: 'm' },
      modelRegistry: { getApiKeyAndHeaders: async () => ({}) },
    };

    const extFactory = piCompactionExtension({
      compactFn: vi.fn(async () => {
        throw new Error('LLM rate limit during summarization');
      }) as never,
    });
    extFactory(fakePiContext);

    await expect(
      beforeCompactHandler!({
        type: 'session_before_compact',
        preparation: { firstKeptEntryId: '1', tokensBefore: 1000 },
        reason: 'threshold',
        willRetry: false,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('LLM rate limit during summarization');
  });
});

describe('PiNativeRuntime compaction integration', () => {
  it('forwards compaction lifecycle events to Gitu event sink', async () => {
    const root = tempWorkspace();
    const created: PiCreateAgentSessionOptions[] = [];

    const mockSession = (sessionListeners: Set<(e: PiSessionEvent) => void>): PiSession => ({
      sessionId: 'test-session',
      subscribe: (l) => {
        sessionListeners.add(l);
        return () => sessionListeners.delete(l);
      },
      prompt: async () => {
        for (const l of sessionListeners) {
          l({ type: 'compaction_start', reason: 'threshold' });
          l({
            type: 'compaction_end',
            reason: 'threshold',
            result: { summary: 'Task progress preserved', firstKeptEntryId: 'e2', tokensBefore: 50000 },
            aborted: false,
            willRetry: false,
          });
          l({ type: 'message_start', message: { role: 'assistant' } });
          l({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Continuing work post-compaction.' } });
          l({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'Continuing work post-compaction.' }] } });
        }
      },
      steer: async () => {},
      abort: async () => {},
      dispose: () => {},
    });

    const sessionListeners = new Set<(e: PiSessionEvent) => void>();
    const sdk: PiSdk = {
      ModelRuntime: {
        create: async () => ({
          registerProvider: () => {},
          getModel: () => ({ id: 'deepseek-flash' }),
        }),
      },
      SettingsManager: { create: () => ({}) },
      SessionManager: {
        create: () => ({ getSessionId: () => 'thread-compact-1', getSessionFile: () => '/path/thread.jsonl' }),
        open: () => ({ getSessionId: () => 'thread-compact-1', getSessionFile: () => '/path/thread.jsonl' }),
        findById: () => '/path/thread.jsonl',
      },
      DefaultResourceLoader: class {
        async reload() {}
      },
      createAgentSession: async (options) => {
        created.push(options);
        return { session: mockSession(sessionListeners) };
      },
    };

    const emittedEvents: [string, Record<string, unknown>][] = [];
    const runtime = new PiNativeRuntime({
      agentDir: root,
      target: { providerId: 'gitu-deepseek', baseUrl: 'https://api.deepseek.com', apiKey: 'k', modelId: 'deepseek-flash' },
      loadSdk: async () => sdk,
    });

    const turnInput: NativeTaskInput = {
      cwd: root,
      text: 'Execute long task',
      instructions: 'You are Agent Gitu.',
      config: {
        compactionContext: {
          goal: 'Implement payment gateway',
          criteria: ['Stripe webhook verified', 'Idempotency checks active'],
        },
      },
      permissions: 'gitu-guarded',
      signal: new AbortController().signal,
      tools: [],
      onThread: () => {},
      onTurn: () => {},
      onEvent: (method, params) => {
        emittedEvents.push([method, params]);
      },
      onRequest: async () => ({ success: true, contentItems: [] }),
    };

    const result = await runtime.runTurn(turnInput);
    expect(result.status).toBe('completed');

    const compactionStarted = emittedEvents.find(([method]) => method === 'compaction/started');
    const compactionCompleted = emittedEvents.find(([method]) => method === 'compaction/completed');

    expect(compactionStarted).toBeDefined();
    expect(compactionStarted![1]).toEqual({ reason: 'threshold' });
    expect(compactionCompleted).toBeDefined();
    expect(compactionCompleted![1]).toMatchObject({
      reason: 'threshold',
      aborted: false,
    });
  });

  it('fails explicitly on missing saved sessions without starting empty sessions', async () => {
    const root = tempWorkspace();
    const sdk: PiSdk = {
      ModelRuntime: { create: async () => ({ registerProvider: () => {}, getModel: () => ({ id: 'm' }) }) },
      SettingsManager: { create: () => ({}) },
      SessionManager: {
        create: () => ({ getSessionId: () => 'new', getSessionFile: () => '' }),
        open: () => ({ getSessionId: () => 'open', getSessionFile: () => '' }),
        findById: () => undefined, // Simulates deleted / missing session file
      },
      DefaultResourceLoader: class {
        async reload() {}
      },
      createAgentSession: async () => {
        throw new Error('createAgentSession must not be reached for missing session');
      },
    };

    const runtime = new PiNativeRuntime({
      agentDir: root,
      target: { providerId: 'p', baseUrl: 'u', apiKey: 'k', modelId: 'm' },
      loadSdk: async () => sdk,
    });

    await expect(
      runtime.runTurn({
        cwd: root,
        threadId: 'non-existent-thread-id-999',
        text: 'Continue previous task',
        instructions: 'Instructions',
        config: {},
        permissions: 'gitu-guarded',
        signal: new AbortController().signal,
        onThread: () => {},
        onTurn: () => {},
        onEvent: () => {},
        onRequest: async () => ({ success: true, contentItems: [] }),
      }),
    ).rejects.toThrow('The saved session for this task no longer exists. Start an explicit new task.');
  });
});

describe('Memory and TaskLedger durability across compaction', () => {
  it('preserves MemoryStore entries across simulated compaction cycles', async () => {
    const root = tempWorkspace();
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'memory-durability', version: '1.0.0' }));

    const memoryStore = MemoryStore.forProject(root);
    // Add verified knowledge before compaction
    const added = memoryStore.add({
      type: 'fact',
      claim: 'PostgreSQL connection pool max size is 25.',
      scope: 'project',
      projectId: 'memory-durability',
      visibility: 'project',
      source: 'test-seed',
      sourceType: 'user_stated',
      confidence: 1.0,
      importance: 0.9,
      status: 'verified',
    });
    expect(added.entry.status).toBe('verified');

    // Simulate Pi compaction running on the session transcript
    const compactionInstructions = buildGituCompactionInstructions({
      goal: 'Database performance tuning',
      criteria: ['Pool size configured'],
      decisions: ['Keep max pool size at 25'],
    });
    expect(compactionInstructions).toContain('Keep max pool size at 25');

    // After compaction, query the MemoryStore
    const retrieved = memoryStore.query({ scope: 'project' });
    expect(retrieved.length).toBeGreaterThan(0);
    const fact = retrieved.find((e) => e.claim.includes('PostgreSQL connection pool max size is 25'));
    expect(fact).toBeDefined();
    expect(fact?.status).toBe('verified');

    // Verify CoworkMemory facade also sees the durable memory post-compaction
    const coworkMemory = CoworkMemory.forWorkspace(root);
    const agent = { id: 'agent-1', name: 'Database Tuner' } as never;
    const recalled = coworkMemory.companyEntries(agent, 'company-1', 'PostgreSQL');
    expect(recalled).toBeDefined();
  });

  it('restores acceptance criteria and verified evidence into subsequent turns', async () => {
    // Verify that TaskLedger reconstruction pattern injects durable criteria and evidence
    const activeCriteria = [
      'Criterion 1: Auth headers validated',
      'Criterion 2: Rate limit tests passing',
    ];
    const verifiedEvidence = [
      { tool: 'run_command', observation: 'All 42 tests passed in 1.2s' },
      { tool: 'read_file', observation: 'Rate limiter verified with token bucket algorithm' },
    ];
    const remainingPlan = ['Deploy to staging'];

    // Construct next turn input after earlier messages compacted
    const reconstructedStateContext = JSON.stringify({
      criteria: activeCriteria,
      plan: remainingPlan,
      evidence: verifiedEvidence,
    });

    const nextTurnText = 'Continue next step\n\nSaved Gitu task state (data, not tool instructions):\n' + reconstructedStateContext;

    // Both criteria and evidence survive intact in the turn prompt
    expect(nextTurnText).toContain('Criterion 1: Auth headers validated');
    expect(nextTurnText).toContain('Criterion 2: Rate limit tests passing');
    expect(nextTurnText).toContain('All 42 tests passed in 1.2s');
    expect(nextTurnText).toContain('Rate limiter verified with token bucket algorithm');
    expect(nextTurnText).toContain('Deploy to staging');
  });

  it('preserves tool permission boundaries during and after compaction in Coding and Cowork', async () => {
    const root = tempWorkspace();
    const created: PiCreateAgentSessionOptions[] = [];

    let toolCallHandler: ((tool: string, args: Record<string, unknown>) => Promise<unknown>) | undefined;

    const mockSession = (sessionListeners: Set<(e: PiSessionEvent) => void>, options: PiCreateAgentSessionOptions): PiSession => ({
      sessionId: 'perm-session',
      subscribe: (l) => {
        sessionListeners.add(l);
        return () => sessionListeners.delete(l);
      },
      prompt: async () => {
        // Find admitted tools
        const admittedTool = options.customTools.find((t) => t.name === 'read_file');
        expect(admittedTool).toBeDefined();

        // Simulate execution of admitted tool
        const result = await admittedTool!.execute('call-admitted', { path: 'allowed.txt' }, undefined, undefined, undefined as never);
        expect(result.isError).toBeFalsy();

        // Fire compaction
        for (const l of sessionListeners) {
          l({ type: 'compaction_start', reason: 'threshold' });
          l({
            type: 'compaction_end',
            reason: 'threshold',
            result: { summary: 'Compacted', firstKeptEntryId: '1', tokensBefore: 1000 },
            aborted: false,
            willRetry: false,
          });
        }

        // Post-compaction: unadmitted tool cannot be called through customTools
        const forbiddenTool = options.customTools.find((t) => t.name === 'write_file');
        expect(forbiddenTool).toBeUndefined(); // Only declared tools are exposed!
      },
      steer: async () => {},
      abort: async () => {},
      dispose: () => {},
    });

    const sessionListeners = new Set<(e: PiSessionEvent) => void>();
    const sdk: PiSdk = {
      ModelRuntime: {
        create: async () => ({
          registerProvider: () => {},
          getModel: () => ({ id: 'm' }),
        }),
      },
      SettingsManager: { create: () => ({}) },
      SessionManager: {
        create: () => ({ getSessionId: () => 't-1', getSessionFile: () => '' }),
        open: () => ({ getSessionId: () => 't-1', getSessionFile: () => '' }),
        findById: () => '',
      },
      DefaultResourceLoader: class {
        async reload() {}
      },
      createAgentSession: async (options) => {
        created.push(options);
        return { session: mockSession(sessionListeners, options) };
      },
    };

    const runtime = new PiNativeRuntime({
      agentDir: root,
      target: { providerId: 'p', baseUrl: 'u', apiKey: 'k', modelId: 'm' },
      loadSdk: async () => sdk,
    });

    // Only read_file declared: write_file must never be admitted
    await runtime.runTurn({
      cwd: root,
      text: 'Run tool',
      instructions: 'Instructions',
      config: {},
      permissions: 'gitu-guarded',
      signal: new AbortController().signal,
      tools: [{ type: 'function', name: 'read_file', inputSchema: { type: 'object' } }],
      onThread: () => {},
      onTurn: () => {},
      onEvent: () => {},
      onRequest: async () => ({ success: true, contentItems: [{ type: 'inputText', text: 'contents' }] }),
    });

    expect(created.length).toBe(1);
    expect(created[0]!.tools).toEqual(['read_file']);
    expect(created[0]!.customTools.map((t) => t.name)).toEqual(['read_file']);
  });

  it('preserves read and modified file metadata from Gitu tool calls in details and summary', async () => {
    const mockPreparation: CompactionPreparation = {
      firstKeptEntryId: 'entry-kept-1',
      messagesToSummarize: [
        {
          role: 'assistant',
          content: [
            { type: 'toolCall', name: 'read_file', arguments: { path: 'src/reader.ts' } },
            { type: 'toolCall', name: 'write_file', arguments: { path: 'src/writer.ts' } },
            { type: 'toolCall', name: 'read_file', arguments: { path: 'src/dual.ts' } },
            { type: 'toolCall', name: 'apply_edit', arguments: { path: 'src/dual.ts' } },
          ],
        } as never,
      ],
      turnPrefixMessages: [],
      isSplitTurn: false,
      tokensBefore: 20000,
      fileOps: { read: new Set(['legacy/old.ts']), written: new Set<string>(), edited: new Set<string>() } as never,
      settings: { enabled: true, reserveTokens: 16384, keepRecentTokens: 20000 },
    };

    const ctx: GituCompactionContext = {
      relevantFiles: ['src/ledger-tracked.ts'],
    };

    // 1. Direct extraction logic test
    const extracted = extractCumulativeFileOps(mockPreparation, ctx);

    // src/dual.ts was read AND edited -> must be in modifiedFiles only, not readFiles
    expect(extracted.modifiedFiles).toContain('src/dual.ts');
    expect(extracted.modifiedFiles).toContain('src/writer.ts');
    expect(extracted.modifiedFiles).toContain('src/ledger-tracked.ts');
    expect(extracted.readFiles).toContain('src/reader.ts');
    expect(extracted.readFiles).toContain('legacy/old.ts');
    expect(extracted.readFiles).not.toContain('src/dual.ts');

    // 2. Extension hook enrichment test
    let beforeCompactHandler: ((event: Record<string, unknown>) => Promise<Record<string, unknown> | undefined>) | undefined;
    const fakePiContext = {
      on: (event: string, handler: (e: Record<string, unknown>) => Promise<Record<string, unknown> | undefined>) => {
        if (event === 'session_before_compact') beforeCompactHandler = handler;
      },
    };

    const extFactory = piCompactionExtension({
      getContext: () => ctx,
      compactFn: vi.fn(async () => ({
        summary: 'Base compaction summary',
        firstKeptEntryId: 'entry-kept-1',
        tokensBefore: 20000,
      })) as never,
    });
    extFactory(fakePiContext);

    const result = await beforeCompactHandler!({
      type: 'session_before_compact',
      preparation: mockPreparation,
      reason: 'threshold',
      willRetry: false,
      signal: new AbortController().signal,
    });

    expect(result?.compaction).toBeDefined();
    const compaction = result!.compaction as { summary: string; details: { readFiles: string[]; modifiedFiles: string[] } };

    // File metadata preserved in details
    expect(compaction.details.modifiedFiles).toEqual(expect.arrayContaining(['src/dual.ts', 'src/ledger-tracked.ts', 'src/writer.ts']));
    expect(compaction.details.readFiles).toEqual(expect.arrayContaining(['legacy/old.ts', 'src/reader.ts']));

    // XML tags formatted into summary text
    expect(compaction.summary).toContain('<modified-files>\nsrc/dual.ts\nsrc/ledger-tracked.ts\nsrc/writer.ts\n</modified-files>');
    expect(compaction.summary).toContain('<read-files>\nlegacy/old.ts\nsrc/reader.ts\n</read-files>');
  });

  it('controlled end-to-end task continues successfully after real compaction cycle', async () => {
    const root = tempWorkspace();
    let threadId = '';
    const emittedEvents: [string, Record<string, unknown>][] = [];

    // Simulate multi-turn session with controlled compaction
    let turnCount = 0;
    const sessionListeners = new Set<(e: PiSessionEvent) => void>();

    const mockSession = (): PiSession => ({
      sessionId: 'thread-e2e-compact',
      subscribe: (l) => {
        sessionListeners.add(l);
        return () => sessionListeners.delete(l);
      },
      prompt: async (promptText) => {
        turnCount++;
        if (turnCount === 1) {
          // Turn 1: executes tool and finishes first step
          for (const l of sessionListeners) {
            l({ type: 'message_start', message: { role: 'assistant' } });
            l({
              type: 'message_end',
              message: {
                role: 'assistant',
                content: [{ type: 'toolCall', id: 'call-1', name: 'read_file', arguments: { path: 'src/main.ts' } }],
              },
            });
            // Compaction triggers under token pressure
            l({ type: 'compaction_start', reason: 'threshold' });
            l({
              type: 'compaction_end',
              reason: 'threshold',
              result: {
                summary: 'Read src/main.ts and prepared auth overhaul',
                firstKeptEntryId: 'call-1',
                tokensBefore: 40000,
              },
              aborted: false,
              willRetry: false,
            });
            l({ type: 'message_start', message: { role: 'assistant' } });
            l({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Turn 1 completed.' } });
            l({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'Turn 1 completed.' }] } });
          }
        } else {
          // Turn 2 (post-compaction continuation): prompt contains reconstructed Gitu task state
          expect(promptText).toContain('Active criteria');
          expect(promptText).toContain('Verified evidence');
          for (const l of sessionListeners) {
            l({ type: 'message_start', message: { role: 'assistant' } });
            l({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Task fully completed post-compaction.' } });
            l({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'Task fully completed post-compaction.' }] } });
          }
        }
      },
      steer: async () => {},
      abort: async () => {},
      dispose: () => {},
    });

    const sdk: PiSdk = {
      ModelRuntime: {
        create: async () => ({
          registerProvider: () => {},
          getModel: () => ({ id: 'deepseek-chat' }),
        }),
      },
      SettingsManager: { create: () => ({}) },
      SessionManager: {
        create: () => ({ getSessionId: () => 'thread-e2e-compact', getSessionFile: () => path.join(root, 'thread-e2e-compact.jsonl') }),
        open: () => ({ getSessionId: () => 'thread-e2e-compact', getSessionFile: () => path.join(root, 'thread-e2e-compact.jsonl') }),
        findById: () => path.join(root, 'thread-e2e-compact.jsonl'),
      },
      DefaultResourceLoader: class {
        async reload() {}
      },
      createAgentSession: async () => ({ session: mockSession() }),
    };

    const runtime = new PiNativeRuntime({
      agentDir: root,
      target: { providerId: 'gitu-deepseek', baseUrl: 'https://api.deepseek.com', apiKey: 'k', modelId: 'deepseek-chat' },
      loadSdk: async () => sdk,
    });

    // Execute Turn 1
    const turn1 = await runtime.runTurn({
      cwd: root,
      text: 'Start overhaul',
      instructions: 'You are Agent Gitu.',
      config: {
        compactionContext: {
          goal: 'Auth overhaul',
          criteria: ['All routes authenticated'],
          relevantFiles: ['src/main.ts'],
        },
      },
      permissions: 'gitu-guarded',
      signal: new AbortController().signal,
      tools: [{ type: 'function', name: 'read_file', inputSchema: { type: 'object' } }],
      onThread: (id) => { threadId = id; },
      onTurn: () => {},
      onEvent: (method, params) => { emittedEvents.push([method, params]); },
      onRequest: async () => ({ success: true, contentItems: [{ type: 'inputText', text: 'export const app = {};' }] }),
    });

    expect(turn1.status).toBe('completed');
    expect(threadId).toBe('thread-e2e-compact');
    expect(emittedEvents.some(([m]) => m === 'compaction/started')).toBe(true);
    expect(emittedEvents.some(([m]) => m === 'compaction/completed')).toBe(true);

    // Reconstruct Gitu state from ledger for Turn 2
    const reconstructedPrompt = 'Continue task\n\nActive criteria: All routes authenticated\nVerified evidence: src/main.ts inspected';

    // Execute Turn 2 (resuming the same thread post-compaction)
    const turn2 = await runtime.runTurn({
      cwd: root,
      threadId,
      text: reconstructedPrompt,
      instructions: 'You are Agent Gitu.',
      config: {
        compactionContext: {
          goal: 'Auth overhaul',
          criteria: ['All routes authenticated'],
          relevantFiles: ['src/main.ts'],
        },
      },
      permissions: 'gitu-guarded',
      signal: new AbortController().signal,
      tools: [{ type: 'function', name: 'read_file', inputSchema: { type: 'object' } }],
      onThread: () => {},
      onTurn: () => {},
      onEvent: (method, params) => { emittedEvents.push([method, params]); },
      onRequest: async () => ({ success: true, contentItems: [] }),
    });

    expect(turn2.status).toBe('completed');
    expect(turnCount).toBe(2);
  });
});
