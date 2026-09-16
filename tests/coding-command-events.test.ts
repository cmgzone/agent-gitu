import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Executor } from '../src/executor/executor.js';
import { Gitu } from '../src/agent/gitu.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { LoopDetector } from '../src/loop/loop-detector.js';
import { PolicyEngine } from '../src/policy/policy.js';
import type { CodingEventPayload } from '../src/coding/events.js';

/**
 * Native command lifecycle: `command_started` / `command_finished`.
 *
 * The rule under test is that the tool reports execution facts and the executor
 * turns them into events. So `ok` is this layer's interpretation while
 * `exitCode` is the raw fact — and the raw fact is *absent*, not fabricated,
 * when a process produced no exit status at all. The legacy text stream must
 * stay byte-for-byte unchanged throughout.
 */

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hermes-cmdevents-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'cmd-events-test' }));
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  writeFileSync(path.join(dir, 'src', 'a.ts'), 'export const a = 1;\n');
  return dir;
}

interface Harness {
  executor: Executor;
  events: CodingEventPayload[];
}

function makeHarness(options: { signal?: () => AbortSignal | undefined; onEvent?: (line: string) => void } = {}): Harness {
  const dir = makeProject();
  const guard = ProjectGuard.detect(dir);
  const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'command events', project: guard.lock, mode: 'fast' });
  const events: CodingEventPayload[] = [];
  // PolicyEngine(true) auto-approves, so a deliberately failing command reaches
  // the shell rather than being stopped at the approval gate.
  const executor = new Executor(
    guard,
    ledger,
    new PolicyEngine(true),
    new LoopDetector(),
    options.onEvent,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { signal: options.signal, onCodingEvent: (event) => events.push(event) },
  );
  return { executor, events };
}

const run = (executor: Executor, command: string, reason = 'test') => executor.execute({ tool: 'run_command', params: { command }, reason, expected: 'command output' });

describe('command_finished carries the real exit code', () => {
  it('reports a successful command as ok with exit code 0', async () => {
    const { executor, events } = makeHarness();
    const outcome = await run(executor, 'echo hello');
    expect(outcome.result.ok).toBe(true);
    expect(events).toEqual([
      { type: 'command_started', command: 'echo hello' },
      { type: 'command_finished', command: 'echo hello', ok: true, exitCode: 0, durationMs: expect.any(Number) },
    ]);
    const finished = events[1];
    expect(finished && 'exitCode' in finished).toBe(true);
    expect((finished as { durationMs: number }).durationMs).toBeGreaterThanOrEqual(0);
  });

  it('reports the exact nonzero exit code of a failing command', async () => {
    const { executor, events } = makeHarness();
    const outcome = await run(executor, 'exit 3');
    expect(outcome.result.ok).toBe(false);
    expect(events).toEqual([
      { type: 'command_started', command: 'exit 3' },
      { type: 'command_finished', command: 'exit 3', ok: false, exitCode: 3, durationMs: expect.any(Number) },
    ]);
  });

  it('emits exactly one command_started and one command_finished per command', async () => {
    const { executor, events } = makeHarness();
    await run(executor, 'echo one');
    await run(executor, 'echo two');
    expect(events.filter((event) => event.type === 'command_started')).toHaveLength(2);
    expect(events.filter((event) => event.type === 'command_finished')).toHaveLength(2);
  });
});

describe('command_finished when there is no exit status', () => {
  it('omits exitCode rather than inventing one when the command never launched', async () => {
    const controller = new AbortController();
    controller.abort();
    const { executor, events } = makeHarness({ signal: () => controller.signal });
    const outcome = await run(executor, 'echo hello');
    expect(outcome.result.ok).toBe(false);
    expect(outcome.result.output).toContain('cancelled before launch');
    expect(outcome.result.exitCode).toBeUndefined();
    const finished = events.find((event) => event.type === 'command_finished');
    expect(finished).toEqual({ type: 'command_finished', command: 'echo hello', ok: false, durationMs: expect.any(Number) });
    // Absent, not merely undefined-valued: consumers can tell the difference.
    expect(finished && 'exitCode' in finished).toBe(false);
  });
});

describe('command lifecycle stays off non-command tools', () => {
  it('emits no command events for a file read', async () => {
    const { executor, events } = makeHarness();
    const outcome = await executor.execute({ tool: 'read_file', params: { path: 'src/a.ts' }, reason: 'test', expected: 'content' });
    expect(outcome.result.ok).toBe(true);
    expect(events).toEqual([]);
  });
});

describe('legacy text output is unchanged', () => {
  it('keeps the run/ok/out line shapes byte-for-byte', async () => {
    const text: string[] = [];
    const { executor } = makeHarness({ onEvent: (line) => text.push(line) });
    await run(executor, 'echo hello', 'legacy check');
    expect(text[0]).toBe('run      $ echo hello — legacy check');
    // The emitter pads to a 9-column keyword and then adds a separator space.
    expect(text[1]).toMatch(/^ok {8}\$ echo hello \(\d+ms\)$/);
    expect(text[2]).toMatch(/^out {6}hello/);
  });

  it('keeps the error line shape for a failing command', async () => {
    const text: string[] = [];
    const { executor } = makeHarness({ onEvent: (line) => text.push(line) });
    await run(executor, 'exit 3', 'legacy check');
    expect(text[1]).toMatch(/^error {5}\$ exit 3 \(\d+ms\)$/);
    // The legacy text still prints the display exit code exactly as before.
    expect(text.some((line) => line.startsWith('out ') && line.includes('[exit 3]'))).toBe(true);
  });
});

describe('end to end through the real agent', () => {
  it('carries exitCode from the tool result all the way to the typed sink', async () => {
    // The wiring under test: GituConfig.onCodingEvent -> Gitu -> Executor ->
    // run_command -> structured ToolResult -> command_finished. The HTTP layer
    // above this is covered by the server suite.
    const dir = makeProject();
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ thought: 'plan', action: { type: 'set_plan', steps: [{ description: 'verify node', verification: 'node --version' }] } }),
      () =>
        JSON.stringify({
          thought: 'verify',
          action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify runtime', expected: 'exit 0' },
        }),
      () => JSON.stringify({ thought: 'stop', action: { type: 'request_block', reason: 'test collected the events it needed' } }),
    ]);
    const events: CodingEventPayload[] = [];
    const gitu = new Gitu({
      cwd: dir,
      llm,
      mode: 'fast',
      criteria: ['node --version runs'],
      autoApprove: true,
      requirePlanReview: false,
      onCodingEvent: (event) => events.push(event),
    });

    await gitu.run('Check the Node runtime version');

    const started = events.filter((event) => event.type === 'command_started');
    const finished = events.filter((event) => event.type === 'command_finished');
    expect(started).toEqual([{ type: 'command_started', command: 'node --version' }]);
    expect(finished).toHaveLength(1);
    expect(finished[0]).toMatchObject({ command: 'node --version', ok: true, exitCode: 0 });
    expect((finished[0] as { durationMs?: number }).durationMs).toBeGreaterThanOrEqual(0);
    // The command lifecycle arrives in order, exactly once.
    expect(events.indexOf(started[0]!)).toBeLessThan(events.indexOf(finished[0]!));
  });
});
