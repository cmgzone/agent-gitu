import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compactHistory, Gitu, MAX_PROTOCOL_REPAIRS, PROTOCOL_REPAIR_INSTRUCTION } from '../src/agent/gitu.js';
import { extractLastJsonObject } from '../src/llm/llm.js';
import type { LlmClient, LlmMessage, LlmTurnResult } from '../src/llm/llm.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* temp cleanup */
    }
  }
});

function project(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `protocol-repair-${name}-`));
  dirs.push(dir);
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `repair-${name}` }));
  return dir;
}

describe('extractLastJsonObject', () => {
  it('picks the structured object that closes last, past prose with braces', () => {
    const reply =
      'I will check the config (uses {a: 1} style) then act. {"note":"intermediate"} Final decision: {"thought":"do it","action":{"type":"set_criteria","criteria":["done"]}}';
    expect(extractLastJsonObject(reply)).toEqual({ thought: 'do it', action: { type: 'set_criteria', criteria: ['done'] } });
  });

  it('prefers the outermost object when a nested object closes earlier', () => {
    const reply = 'noise {"action":{"type":"tool_call","tool":"list_files","params":{"path":"src"}}}';
    expect(extractLastJsonObject(reply)).toEqual({
      action: { type: 'tool_call', tool: 'list_files', params: { path: 'src' } },
    });
  });

  it('returns undefined when there is no parseable object', () => {
    expect(extractLastJsonObject('no json here {broken')).toBeUndefined();
  });
});

describe('compactHistory force', () => {
  it('bypasses the normal triggers only when forced', () => {
    const small: LlmMessage[] = Array.from({ length: 10 }, (_, i) => ({ role: 'user' as const, content: `message ${i}` }));
    expect(compactHistory([...small], undefined)).toBe(false);
    const forced = [...small];
    expect(compactHistory(forced, undefined, { force: true, keepRecent: 3, triggerMessages: 4 })).toBe(true);
    expect(forced.length).toBeLessThan(small.length);
  });
});

describe('Gitu protocol-repair layer', () => {
  const GOAL = 'Create a preview database';

  it('recovers a drifted prose reply with one constrained repair call', async () => {
    const root = project('repair');
    const events: string[] = [];
    const repairInputs: string[] = [];
    let call = 0;
    const llm: LlmClient = {
      name: 'drift-mock',
      async complete() {
        return '';
      },
      async completeStream() {
        return 'VERDICT: PASS\nFEEDBACK: nothing to flag.';
      },
      async completeTurn(messages: LlmMessage[]): Promise<LlmTurnResult> {
        const n = call++;
        if (n === 0) return { kind: 'text', text: 'I will carefully consider the situation and then decide what to do next.', metadata: {} };
        if (n === 1) {
          repairInputs.push(messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join('\n'));
          return { kind: 'text', text: JSON.stringify({ action: { type: 'set_criteria', criteria: ['runtime is verified'] } }), metadata: {} };
        }
        if (n === 2)
          return { kind: 'text', text: JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify runtime', verification: 'node --version' }] } }), metadata: {} };
        if (n === 3)
          return {
            kind: 'text',
            text: JSON.stringify({ action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' } }),
            metadata: {},
          };
        if (n === 4) {
          const text = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' ');
          const ids = [...text.matchAll(/(ev-\d{8}-[0-9a-f]{6})/g)].map((m) => m[1]);
          return { kind: 'text', text: JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: ids.at(-1) ?? 'ev-missing' } }), metadata: {} };
        }
        return { kind: 'text', text: JSON.stringify({ action: { type: 'complete', summary: 'done', risks: [], followUps: [] } }), metadata: {} };
      },
      async completeTurnStream(messages: LlmMessage[]): Promise<LlmTurnResult> {
        return llm.completeTurn!(messages);
      },
    };

    const { report } = await new Gitu({ cwd: root, llm, mode: 'fast', onEvent: (e) => events.push(e) }).run(GOAL);

    expect(report.status).toBe('complete');
    expect(events.some((e) => e.includes('protocol-repair call 1/'))).toBe(true);
    expect(events.some((e) => e.includes('recovered an executable action from the repair call'))).toBe(true);
    expect(repairInputs[0]).toContain(PROTOCOL_REPAIR_INSTRUCTION);
    // The repaired turn never counted as malformed.
    expect(events.some((e) => e.includes('no executable action (streak'))).toBe(false);
  }, 30000);

  it('caps repairs, falls back to the repair model, and forces drift compaction', async () => {
    const root = project('fallback');
    const events: string[] = [];
    let primaryTurns = 0;
    let repairTurns = 0;
    const garbage = { kind: 'text' as const, text: 'Analyzing the deployment architecture and considering the next steps.', metadata: {} };
    const primary: LlmClient = {
      name: 'drifting-primary',
      async complete() {
        return '';
      },
      async completeStream() {
        return '';
      },
      async completeTurn(): Promise<LlmTurnResult> {
        primaryTurns += 1;
        return garbage;
      },
      async completeTurnStream(): Promise<LlmTurnResult> {
        return primary.completeTurn();
      },
    };
    const actions = [
      JSON.stringify({ action: { type: 'set_criteria', criteria: ['runtime is verified'] } }),
      JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify runtime', verification: 'node --version' }] } }),
      JSON.stringify({ action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' } }),
    ];
    const repair: LlmClient = {
      name: 'repair-model',
      async complete() {
        return '';
      },
      async completeStream() {
        return 'VERDICT: PASS\nFEEDBACK: nothing to flag.';
      },
      async completeTurn(): Promise<LlmTurnResult> {
        repairTurns += 1;
        return { kind: 'text', text: actions[repairTurns - 1] ?? garbage.text, metadata: {} };
      },
      async completeTurnStream(messages: LlmMessage[]): Promise<LlmTurnResult> {
        return repair.completeTurn(messages);
      },
    };

    const { report } = await new Gitu({
      cwd: root,
      llm: primary,
      protocolRepairLlm: repair,
      mode: 'fast',
      onEvent: (e) => events.push(e),
    }).run(GOAL);

    // The drifting primary needed a repair every turn; the budget stops at 3
    // and the bounded lane breaker then stops the run — after the harness
    // forced a drift compaction.
    expect(primaryTurns).toBeGreaterThanOrEqual(MAX_PROTOCOL_REPAIRS + 1);
    expect(repairTurns).toBe(MAX_PROTOCOL_REPAIRS);
    expect(events.some((e) => /context\s+compacted/.test(e))).toBe(true);
    expect(report.status).toBe('blocked');
  }, 30000);

  it('normalizes direct native tool calls without invoking protocol repair', async () => {
    const root = project('native-direct');
    const events: string[] = [];
    let call = 0;
    const llm: LlmClient = {
      name: 'native-tool-mock',
      async complete() {
        return '';
      },
      async completeStream() {
        return 'VERDICT: PASS\nFEEDBACK: nothing to flag.';
      },
      async completeTurn(messages: LlmMessage[]): Promise<LlmTurnResult> {
        const n = call++;
        if (n === 0) {
          // Emits direct native tool call named "set_criteria" instead of agent_gitu_action
          return {
            kind: 'tool_calls',
            calls: [{ id: 'call-1', name: 'set_criteria', arguments: { criteria: ['runtime is verified'] } }],
            metadata: {},
          };
        }
        if (n === 1) {
          // Emits direct native tool call named "set_plan"
          return {
            kind: 'tool_calls',
            calls: [{ id: 'call-2', name: 'set_plan', arguments: { steps: [{ description: 'verify runtime', verification: 'node --version' }] } }],
            metadata: {},
          };
        }
        if (n === 2) {
          // Emits direct tool call "run_command" with parameter alias "cmd"
          return {
            kind: 'tool_calls',
            calls: [{ id: 'call-3', name: 'run_command', arguments: { cmd: 'node --version', reason: 'verify', expected: 'exit 0', stepId: 'step-1' } }],
            metadata: {},
          };
        }
        if (n === 3) {
          const text = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' ');
          const ids = [...text.matchAll(/(ev-\d{8}-[0-9a-f]{6})/g)].map((m) => m[1]);
          return {
            kind: 'tool_calls',
            calls: [{ id: 'call-4', name: 'claim_criterion', arguments: { criterionId: 'ac-1', evidenceId: ids.at(-1) ?? 'ev-missing' } }],
            metadata: {},
          };
        }
        return {
          kind: 'tool_calls',
          calls: [{ id: 'call-5', name: 'complete', arguments: { summary: 'done', risks: [], followUps: [] } }],
          metadata: {},
        };
      },
      async completeTurnStream(messages: LlmMessage[]): Promise<LlmTurnResult> {
        return llm.completeTurn!(messages);
      },
    };

    const { report } = await new Gitu({ cwd: root, llm, mode: 'fast', onEvent: (e) => events.push(e) }).run(GOAL);

    expect(report.status).toBe('complete');
    // Direct native tool calls must NOT trigger protocol-repair
    expect(events.some((e) => e.includes('protocol-repair call'))).toBe(false);
  }, 30000);
});

