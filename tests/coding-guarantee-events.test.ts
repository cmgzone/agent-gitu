import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Executor } from '../src/executor/executor.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { LoopDetector } from '../src/loop/loop-detector.js';
import { PolicyEngine } from '../src/policy/policy.js';
import { SkillStore } from '../src/skills/skills.js';
import type { CodingEventPayload } from '../src/coding/events.js';

/**
 * Native guarantee events.
 *
 * `policy_denied` / `operation_blocked` are the strongest signals in the
 * stream: proof that the guard, a user instruction, the risk policy or the loop
 * detector actually intervened. So they must come from the gate's own decision
 * — never inferred from the wording the gate happened to print. Every test here
 * drives a real gate and asserts the reason code that gate produced.
 */

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hermes-guarantee-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'guarantee-test' }));
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  writeFileSync(path.join(dir, 'src', 'a.ts'), 'export const a = 1;\n');
  return dir;
}

interface Harness {
  executor: Executor;
  ledger: TaskLedger;
  events: CodingEventPayload[];
  dir: string;
}

function makeHarness(options: { policy?: PolicyEngine; loop?: LoopDetector; skills?: SkillStore; dir?: string } = {}): Harness {
  const dir = options.dir ?? makeProject();
  const guard = ProjectGuard.detect(dir);
  const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'guarantee events', project: guard.lock, mode: 'fast' });
  const events: CodingEventPayload[] = [];
  // Positions 5-14 are the optional capabilities; the typed sink rides in the
  // trailing options object, so no positional caller had to change.
  const executor = new Executor(
    guard,
    ledger,
    options.policy ?? new PolicyEngine(true),
    options.loop ?? new LoopDetector(),
    undefined,
    options.skills,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    { onCodingEvent: (event) => events.push(event) },
  );
  return { executor, ledger, events, dir };
}

describe('policy_denied', () => {
  it('reports a project-boundary refusal with the guard as the reason', async () => {
    const { executor, events, ledger } = makeHarness();
    const outcome = await executor.execute({
      tool: 'write_file',
      params: { path: '../escaped.ts', content: 'x' },
      reason: 'test',
      expected: 'file written',
    });
    expect(outcome.deniedByPolicy).toContain('DENIED by project boundary');
    expect(events).toEqual([
      {
        type: 'policy_denied',
        reason: 'project_guard',
        tool: 'write_file',
        operation: 'write ../escaped.ts',
        detail: expect.stringContaining('DENIED by project boundary'),
      },
    ]);
    expect(ledger.data.actions.at(-1)?.status).toBe('denied');
  });

  it('reports a standing user instruction as user_instruction', async () => {
    const { executor, events, ledger } = makeHarness();
    ledger.addInstruction({ text: 'no npm install', type: 'constraint', enforcement: 'hard', status: 'active', source: 'follow-up' });
    await executor.execute({ tool: 'run_command', params: { command: 'npm install left-pad' }, reason: 'test', expected: 'installed' });
    expect(events).toEqual([
      {
        type: 'policy_denied',
        reason: 'user_instruction',
        tool: 'run_command',
        operation: '$ npm install left-pad',
        detail: expect.stringContaining('USER INSTRUCTION VIOLATION'),
      },
    ]);
  });

  it('reports a declined approval as approval_required, structurally', async () => {
    // The real engine with a refusing handler: the authentic decline path.
    const { executor, events } = makeHarness({ policy: new PolicyEngine(false, () => false) });
    const outcome = await executor.execute({ tool: 'run_command', params: { command: 'rm -rf ./build' }, reason: 'test', expected: 'removed' });
    expect(outcome.deniedByPolicy).toBeTruthy();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'policy_denied', reason: 'approval_required', tool: 'run_command' });
    expect(events[0]?.detail).toContain('denied by user');
  });

  it('reports a tier refusal that never consulted approval as risk_policy', async () => {
    const policy = {
      evaluate: async () => ({ tier: 'dangerous' as const, allowed: false, requiresApproval: false, reason: 'refused by host policy' }),
    } as unknown as PolicyEngine;
    const { executor, events } = makeHarness({ policy });
    await executor.execute({ tool: 'run_command', params: { command: 'echo hi' }, reason: 'test', expected: 'ok' });
    expect(events).toEqual([{ type: 'policy_denied', reason: 'risk_policy', tool: 'run_command', operation: '$ echo hi', detail: 'refused by host policy' }]);
  });
});

describe('operation_blocked', () => {
  it('reports a repeated failing action as loop_detected, and only once', async () => {
    const { executor, events } = makeHarness();
    const call = () => executor.execute({ tool: 'read_file', params: { path: 'src/missing.ts' }, reason: 'test', expected: 'content' });
    await call();
    await call();
    const outcome = await call();
    expect(outcome.blockedByLoop).toBeTruthy();
    // The first two calls failed as ordinary tool errors, not as interventions.
    expect(events).toEqual([
      {
        type: 'operation_blocked',
        reason: 'loop_detected',
        tool: 'read_file',
        operation: 'read src/missing.ts',
        detail: expect.any(String),
      },
    ]);
  });

  it('reports a repeated skill read as repeated_skill_operation', async () => {
    const dir = makeProject();
    const { executor, events } = makeHarness({ dir, skills: SkillStore.forProject(dir) });
    const call = () => executor.execute({ tool: 'list_skills', params: {}, reason: 'test', expected: 'skills' });
    await call();
    await call();
    await call();
    expect(events).toEqual([
      {
        type: 'operation_blocked',
        reason: 'repeated_skill_operation',
        tool: 'list_skills',
        operation: 'list_skills {}',
        detail: expect.stringContaining('SKILL_OPERATION_REPEATED'),
      },
    ]);
  });

  it('reports edit pressure as edit_pressure', async () => {
    const loop = {
      evaluate: () => ({ allowed: true, reason: undefined }),
      fileEditPressure: () => ({ blocked: true, edits: 6, evidence: 0 }),
    } as unknown as LoopDetector;
    const { executor, events } = makeHarness({ loop });
    await executor.execute({ tool: 'write_file', params: { path: 'src/a.ts', content: 'x' }, reason: 'test', expected: 'file written' });
    expect(events).toEqual([
      {
        type: 'operation_blocked',
        reason: 'edit_pressure',
        tool: 'write_file',
        operation: 'write src/a.ts',
        detail: expect.stringContaining('EDIT PRESSURE'),
      },
    ]);
  });
});

describe('guarantee events stay silent when nothing intervened', () => {
  it('emits nothing for an action that is allowed and succeeds', async () => {
    const { executor, events } = makeHarness();
    const outcome = await executor.execute({ tool: 'read_file', params: { path: 'src/a.ts' }, reason: 'test', expected: 'content' });
    expect(outcome.result.ok).toBe(true);
    expect(events).toEqual([]);
  });

  it('emits nothing when the policy only logs a moderate change', async () => {
    const policy = {
      evaluate: async () => ({ tier: 'moderate' as const, allowed: true, requiresApproval: false, reason: 'workspace change (logged)' }),
    } as unknown as PolicyEngine;
    const { executor, events } = makeHarness({ policy });
    const outcome = await executor.execute({ tool: 'write_file', params: { path: 'src/b.ts', content: 'x' }, reason: 'test', expected: 'file written' });
    expect(outcome.result.ok).toBe(true);
    expect(events).toEqual([]);
  });
});
