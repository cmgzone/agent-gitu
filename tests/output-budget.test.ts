import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Hermes } from '../src/agent/gitu.js';
import { OpenAiCompatClient, type LlmClient, type LlmMessage, type LlmOptions, type LlmTurnResult } from '../src/llm/llm.js';
import {
  FINAL_ACTION_RESERVE_TOKENS,
  REASONING_ALLOWANCE_TOKENS,
  outputCapabilityFor,
  recoveryBudgetTokens,
  reduceEffortOneLevel,
  resolveOutputBudgetTokens,
} from '../src/llm/output-budget.js';
import { parseModelCatalog, resolveLlm, setModelCatalogForTest } from '../src/llm/providers.js';

// ---------------------------------------------------------------------------
// Policy math
// ---------------------------------------------------------------------------

describe('resolveOutputBudgetTokens', () => {
  const shares = { field: 'max_tokens' as const, reasoningSharesBudget: true };
  const separate = { field: 'max_tokens' as const, reasoningSharesBudget: false };

  it('adds the reasoning allowance to the final-action reserve when reasoning shares the budget', () => {
    expect(resolveOutputBudgetTokens({ effort: 'low', capability: shares, modelMaxOutputTokens: 8192 })).toBe(
      FINAL_ACTION_RESERVE_TOKENS + REASONING_ALLOWANCE_TOKENS.low,
    );
    expect(resolveOutputBudgetTokens({ effort: 'high', capability: shares, modelMaxOutputTokens: 32768 })).toBe(
      FINAL_ACTION_RESERVE_TOKENS + REASONING_ALLOWANCE_TOKENS.high,
    );
  });

  it('clamps to the model ceiling — never larger than the model allows', () => {
    expect(resolveOutputBudgetTokens({ effort: 'max', capability: shares, modelMaxOutputTokens: 8192 })).toBe(8192);
  });

  it('omits the field when the model ceiling is unknown — never guesses aggressively', () => {
    expect(resolveOutputBudgetTokens({ effort: 'max', capability: shares })).toBeUndefined();
  });

  it('omits the field when reasoning does not share the budget (no override)', () => {
    expect(resolveOutputBudgetTokens({ effort: 'high', capability: separate, modelMaxOutputTokens: 16384 })).toBeUndefined();
  });

  it('honors an absolute override and still clamps it', () => {
    expect(resolveOutputBudgetTokens({ capability: separate, overrideTokens: 12000, modelMaxOutputTokens: 16384 })).toBe(12000);
    expect(resolveOutputBudgetTokens({ capability: separate, overrideTokens: 99999, modelMaxOutputTokens: 16384 })).toBe(16384);
  });

  it('recovery budget is the original allowance plus extra headroom', () => {
    expect(recoveryBudgetTokens('medium')).toBeGreaterThan(FINAL_ACTION_RESERVE_TOKENS + REASONING_ALLOWANCE_TOKENS.medium);
  });

  it('steps effort down one level and stops at the floor', () => {
    expect(reduceEffortOneLevel('max')).toBe('high');
    expect(reduceEffortOneLevel('high')).toBe('medium');
    expect(reduceEffortOneLevel('medium')).toBe('low');
    expect(reduceEffortOneLevel('low')).toBeUndefined();
    expect(reduceEffortOneLevel(undefined)).toBeUndefined();
  });

  it('declares capability metadata per protocol family', () => {
    expect(outputCapabilityFor('deepseek', 'deepseek-v4-pro')).toEqual({ field: 'max_tokens', reasoningSharesBudget: true });
    expect(outputCapabilityFor('dashscope', 'qwen3.8-max')).toEqual({ field: 'max_tokens', reasoningSharesBudget: false });
    expect(outputCapabilityFor('openai', 'gpt-4.1-mini')).toEqual({ field: 'max_tokens', reasoningSharesBudget: true });
    // Reasoning-era OpenAI families renamed the field.
    expect(outputCapabilityFor('openai', 'gpt-5.6-sol')).toEqual({ field: 'max_completion_tokens', reasoningSharesBudget: true });
    expect(outputCapabilityFor('openai', 'o3')).toEqual({ field: 'max_completion_tokens', reasoningSharesBudget: true });
  });
});

// ---------------------------------------------------------------------------
// Wire behavior — the field only appears when the policy can express it safely
// ---------------------------------------------------------------------------

describe('OpenAiCompatClient output budget on the wire', () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function captureBody(): { bodies: Record<string, unknown>[] } {
    const bodies: Record<string, unknown>[] = [];
    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    return { bodies };
  }

  const msg = [{ role: 'user' as const, content: 'hi' }];

  it('sends a clamped max_tokens for DeepSeek thinking requests', async () => {
    const { bodies } = captureBody();
    const client = new OpenAiCompatClient({
      apiKey: 'k',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-pro',
      modelMaxOutputTokens: 8192,
    });
    await client.complete(msg, { effort: 'max' });
    expect(bodies[0]!['thinking']).toEqual({ type: 'enabled' });
    expect(bodies[0]!['max_tokens']).toBe(8192); // reserve + max allowance, clamped to the ceiling
    await client.complete(msg, { effort: 'low' });
    expect(bodies[1]!['max_tokens']).toBe(FINAL_ACTION_RESERVE_TOKENS + REASONING_ALLOWANCE_TOKENS.low);
  });

  it('sends no output-limit field when the model ceiling is unknown', async () => {
    const { bodies } = captureBody();
    const client = new OpenAiCompatClient({ apiKey: 'k', baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-pro' });
    await client.complete(msg, { effort: 'max' });
    expect(bodies[0]!['max_tokens']).toBeUndefined();
  });

  it('leaves DashScope alone (reasoning is bounded separately) unless overridden', async () => {
    const { bodies } = captureBody();
    const client = new OpenAiCompatClient({
      apiKey: 'k',
      baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
      model: 'qwen3.8-max',
      modelMaxOutputTokens: 16384,
    });
    await client.complete(msg, { effort: 'high' });
    expect(bodies[0]!['max_tokens']).toBeUndefined();
    expect(bodies[0]!['thinking_budget']).toBeDefined();
    await client.complete(msg, { effort: 'high', outputBudgetTokens: 12000 });
    expect(bodies[1]!['max_tokens']).toBe(12000);
  });

  it('uses max_completion_tokens for reasoning-era OpenAI families', async () => {
    const { bodies } = captureBody();
    const client = new OpenAiCompatClient({ apiKey: 'k', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.6-sol', modelMaxOutputTokens: 65536 });
    await client.complete(msg, { effort: 'high' });
    expect(bodies[0]!['max_completion_tokens']).toBeDefined();
    expect(bodies[0]!['max_tokens']).toBeUndefined();
  });

  it('resolves the ceiling from the provider catalog when it is warm', async () => {
    setModelCatalogForTest(
      parseModelCatalog({ deepseek: { models: { 'deepseek-v4-pro': { limit: { context: 128000, output: 8192 } } } } }),
    );
    try {
      const { bodies } = captureBody();
      const { client } = resolveLlm({ provider: 'deepseek', model: 'deepseek-v4-pro', env: { DEEPSEEK_API_KEY: 'k' } });
      await client.complete(msg, { effort: 'max' });
      expect(bodies[0]!['max_tokens']).toBe(8192);
    } finally {
      setModelCatalogForTest(undefined);
    }
  });
});

// ---------------------------------------------------------------------------
// Adaptive recovery — one retry with lower effort and a larger reserved budget
// ---------------------------------------------------------------------------

describe('Hermes adaptive recovery after a reasoning-only turn', () => {
  interface CapturedCall {
    effort?: string;
    outputBudgetTokens?: number;
  }

  function makeRecoveryLlm(calls: CapturedCall[], scripts: ((n: number, messages: LlmMessage[]) => LlmTurnResult)[]): LlmClient {
    let call = 0;
    const turnFor = (n: number, messages: LlmMessage[]): LlmTurnResult =>
      n === 0
        ? { kind: 'empty', metadata: { reasoning: 'Long deliberation consumed the entire output budget.' } }
        : scripts[n - 1]!(n - 1, messages);
    const client: LlmClient = {
      name: 'recovery-mock',
      async complete() {
        return '';
      },
      async completeStream() {
        return '';
      },
      async completeTurn(messages: LlmMessage[], opts?: LlmOptions): Promise<LlmTurnResult> {
        calls.push({ effort: opts?.effort, outputBudgetTokens: opts?.outputBudgetTokens });
        return turnFor(call++, messages);
      },
      async completeTurnStream(messages: LlmMessage[], opts?: LlmOptions): Promise<LlmTurnResult> {
        return client.completeTurn!(messages, opts);
      },
    };
    return client;
  }

  it('retries once with lower effort and a larger budget instead of counting the turn as malformed', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'output-budget-recovery-'));
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'budget-recovery' }));

    const calls: CapturedCall[] = [];
    const llm = makeRecoveryLlm(calls, [
      () => ({ kind: 'text', text: JSON.stringify({ action: { type: 'set_criteria', criteria: ['done'] } }), metadata: {} }),
      () => ({ kind: 'text', text: JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'x', verification: 'node --version' }] } }), metadata: {} }),
      () =>
        ({
          kind: 'text',
          text: JSON.stringify({ action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' } }),
          metadata: {},
        }) as LlmTurnResult,
      (_n, messages) => {
        const text = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' ');
        const ids = [...text.matchAll(/(ev-\d{8}-[0-9a-f]{6})/g)].map((m) => m[1]);
        return {
          kind: 'text',
          text: JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: ids.at(-1) ?? 'ev-missing' } }),
          metadata: {},
        };
      },
      () => ({ kind: 'text', text: JSON.stringify({ action: { type: 'complete', summary: 'done', risks: [], followUps: [] } }), metadata: {} }),
    ]);

    const events: string[] = [];
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', onEvent: (e) => events.push(e) });

    const { report } = await hermes.run('think forever');

    expect(report.status).toBe('complete');
    // Turn 1 ran at plan effort with no budget override and came back empty…
    expect(calls[0]!.outputBudgetTokens).toBeUndefined();
    const baseEffort = calls[0]!.effort as 'low' | 'medium' | 'high' | 'max' | undefined;
    // …the ONE recovery attempt lowered the effort and reserved extra budget…
    expect(calls[1]!.effort).toBe(reduceEffortOneLevel(baseEffort));
    expect(calls[1]!.outputBudgetTokens).toBe(recoveryBudgetTokens(baseEffort));
    // …and the recovery is one-shot: later turns revert to the plan effort.
    expect(calls[2]!.effort).toBe(baseEffort);
    expect(calls[2]!.outputBudgetTokens).toBeUndefined();
    expect(calls.filter((c) => c.outputBudgetTokens !== undefined)).toHaveLength(1);
    // The recovered turn was never counted as malformed.
    expect(events.some((e) => e.includes('only reasoning with no final content'))).toBe(false);
    expect(events.some((e) => e.includes('reasoning-only reply — one retry'))).toBe(true);
  }, 30000);
});
