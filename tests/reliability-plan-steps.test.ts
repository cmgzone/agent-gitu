import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Hermes } from '../src/agent/hermes.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { toolRunCommand } from '../src/tools/tools.js';
import { ScriptedMockLlm, type LlmMessage } from '../src/llm/llm.js';

function makeProject(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `hermes-p16-${name}-`));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `p16-${name}` }));
  return dir;
}

/** Hermes flow: criteria + plan + one passing verification command + claim + complete. */
function flowScript(command: string, withStepId: boolean) {
  return [
    () =>
      JSON.stringify({
        action: { type: 'set_criteria', criteria: [{ text: 'node runs', verification: command, evidenceType: 'command_success' }] },
      }),
      () =>
        JSON.stringify({
          action: { type: 'set_plan', steps: [{ description: 'verify node runs', verification: command }] },
        }),
      () =>
        JSON.stringify({
          action: {
            type: 'tool_call',
            ...(withStepId ? { stepId: 'step-1' } : {}),
            tool: 'run_command',
            params: { command },
            reason: 'verify',
            expected: 'exit 0',
          },
        }),
      (_n: number, messages: LlmMessage[]) => {
        const text = messages.map((m) => m.content).join('\n');
        const evId = (text.match(/(ev-\d{8}-[0-9a-f]{6})/) ?? [])[1] ?? 'ev-x';
        return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: evId } });
      },
      () => JSON.stringify({ action: { type: 'complete', summary: 'done', risks: [], followUps: [] } }),
  ];
}

describe('Hermes — plan steps are marked done when their verification passes', () => {
  it('auto-completes the matching step even when the model omits stepId', async () => {
    const dir = makeProject('autodone');
    const events: string[] = [];
    const hermes = new Hermes({
      cwd: dir,
      llm: new ScriptedMockLlm(flowScript('node --version', false)),
      mode: 'fast',
      onEvent: (e) => events.push(e),
    });

    const { ledger, report } = await hermes.run('verify node');

    expect(report.status).toBe('complete');
    expect(ledger.data.plan[0]!.status).toBe('done');
    expect(events.some((e) => e.includes('step     step-1 done'))).toBe(true);
  }, 30000);

  it('still marks the step done when the model provides an explicit stepId', async () => {
    const dir = makeProject('explicit');
    const hermes = new Hermes({
      cwd: dir,
      llm: new ScriptedMockLlm(flowScript('node --version', true)),
      mode: 'fast',
    });

    const { ledger } = await hermes.run('verify node');

    expect(ledger.data.plan[0]!.status).toBe('done');
  }, 30000);

  it('does NOT auto-complete steps whose verification does not match the command', async () => {
    const dir = makeProject('nomatch');
    const llm = new ScriptedMockLlm([
      () =>
        JSON.stringify({
          action: { type: 'set_criteria', criteria: [{ text: 'node runs', verification: 'node --version', evidenceType: 'command_success' }] },
        }),
      () =>
        JSON.stringify({
          action: { type: 'set_plan', steps: [{ description: 'run the auth suite', verification: 'npm test -- auth' }] },
        }),
      () => JSON.stringify({ action: { type: 'tool_call', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' } }),
      (_n: number, messages: LlmMessage[]) => {
        const text = messages.map((m) => m.content).join('\n');
        const evId = (text.match(/(ev-\d{8}-[0-9a-f]{6})/) ?? [])[1] ?? 'ev-x';
        return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: evId } });
      },
      () => JSON.stringify({ action: { type: 'complete', summary: 'done', risks: [], followUps: [] } }),
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast' });

    const { ledger } = await hermes.run('verify node');

    // The criterion was satisfied by node --version, but the auth-suite step
    // demands npm test -- auth — it must stay open.
    expect(ledger.data.acceptanceCriteria[0]!.satisfied).toBe(true);
    expect(ledger.data.plan[0]!.status).toBe('pending');
  }, 30000);
});

describe('run_command — timeout kills the process tree before evidence resolves', () => {
  it('resolves ok:false with a timeout note and does not hang past the deadline', async () => {
    const dir = makeProject('timeout');
    const guard = ProjectGuard.detect(dir);
    const started = Date.now();
    const result = await toolRunCommand(
      { guard, cwd: dir },
      { command: 'node -e "setTimeout(() => {}, 60000)"', timeoutMs: 1500 },
    );
    const elapsed = Date.now() - started;

    expect(result.ok).toBe(false);
    expect(result.output).toContain('timeout after 1500ms');
    // Resolved shortly after the deadline — not blocked by surviving children.
    expect(elapsed).toBeLessThan(15_000);
  }, 30000);

  it('still resolves normally for fast commands', async () => {
    const dir = makeProject('fast');
    const guard = ProjectGuard.detect(dir);
    const result = await toolRunCommand({ guard, cwd: dir }, { command: 'node --version', timeoutMs: 30_000 });
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
  }, 30000);
});