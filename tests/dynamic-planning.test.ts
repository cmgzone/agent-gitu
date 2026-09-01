import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compactHistory, Hermes } from '../src/agent/gitu.js';
import { buildStateMessage, renderFullPlanMessage } from '../src/agent/prompt.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { ScriptedMockLlm, type LlmMessage } from '../src/llm/llm.js';

const countOf = (text: string, needle: string): number => text.split(needle).length - 1;

/** Newest user message = the freshly built state/observation the model must act on.
 *  History may legitimately retain older rich renders until compaction. */
function lastUserText(messages: LlmMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role === 'user' && typeof m.content === 'string') return m.content;
  }
  return '';
}

function makeLedger(name: string): { ledger: TaskLedger; dir: string } {
  const dir = mkdtempSync(path.join(tmpdir(), `hermes-plan-${name}-`));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `plan-${name}` }, null, 2));
  const guard = ProjectGuard.detect(dir);
  const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'Build dashboard', project: guard.lock, mode: 'standard' });
  return { ledger, dir };
}

function seedPlan(ledger: TaskLedger): void {
  ledger.setPlan([
    { description: 'Audit repository structure', verification: 'file list reviewed', area: 'backend', subtasks: ['scan src', 'scan tests'] },
    { description: 'Design database schema', verification: 'schema file exists', area: 'database', subtasks: ['entities', 'relations'] },
    { description: 'Build board UI', verification: 'browser shows five columns', area: 'frontend', subtasks: ['shell', 'columns', 'cards'] },
    { description: 'Wire API integration', verification: 'PATCH returns 200', area: 'integration' },
  ]);
  ledger.updateStep('step-1', { status: 'done' });
}

// ── buildStateMessage ────────────────────────────────────────────────────

describe('buildStateMessage - phase-aware rendering', () => {
  it('shows only new criteria and steps for a follow-up phase', () => {
    const { ledger } = makeLedger('follow-up-scope');
    ledger.setCriteria(['original dashboard works']);
    ledger.setPlan([{ description: 'Build the original dashboard', verification: 'npm test' }]);
    ledger.updateStep('step-1', { status: 'done' });
    ledger.ensureInitialWorkPhase('Build the original dashboard');
    ledger.completeActiveWorkPhase();
    const phase = ledger.startWorkPhase({ kind: 'follow_up', goal: 'Add a compact export button' });
    const [criterion] = ledger.appendCriteria(['export button works']);
    const [step] = ledger.appendPlan([{ description: 'Add export button', verification: 'npm test -- export' }]);
    ledger.setStatus('planning');

    const text = buildStateMessage(ledger, undefined, undefined, {
      goal: phase.goal,
      criterionIds: criterion ? [criterion.id] : [],
      planStepIds: step ? [step.id] : [],
      evidenceStartIndex: phase.evidenceStartIndex,
      files: [],
    });

    expect(text).toContain('TASK: Add a compact export button');
    expect(text).toContain('export button works');
    expect(text).toContain('Add export button');
    expect(text).not.toContain('original dashboard works');
    expect(text).not.toContain('Build the original dashboard');
  });

  it('renders PLAN and NEXT exactly once in PLANNING phase, richly', () => {
    const { ledger } = makeLedger('rich');
    seedPlan(ledger);
    ledger.setPlanDesign({ frontend: 'views: dashboard\ncomponents: card grid', backend: 'routes: GET /stats' });
    ledger.setStatus('planning');
    const text = buildStateMessage(ledger);

    expect(countOf(text, '\nPLAN:')).toBe(1);
    expect(countOf(text, '\nNEXT:')).toBe(1);
    expect(text).toContain('NEXT: step-2 (database)');
    // Rich: full verification strings, areas, todos (incl. completed), full design.
    expect(text).toContain('| verify: browser shows five columns');
    expect(text).toContain('[x] scan src');
    expect(text).toContain('[ ] entities');
    expect(text).toContain('PLAN DESIGN:');
    expect(text).toContain('FRONTEND:\n    views: dashboard');
    expect(text).toContain('BACKEND: routes: GET /stats');
  });

  it('renders PLAN and NEXT exactly once in EXECUTION phase, compactly', () => {
    const { ledger } = makeLedger('compact');
    seedPlan(ledger);
    ledger.setStatus('executing');
    const text = buildStateMessage(ledger);

    expect(countOf(text, '\nPLAN:')).toBe(1);
    expect(countOf(text, '\nNEXT:')).toBe(1);
    expect(countOf(text, 'NEXT:')).toBe(1);
    expect(text).toMatch(/PLAN: 1\/4 steps · 2\/7 todos/);
    // Completed step collapsed to one line - no repeated verification text,
    // no repeated completed todos.
    expect(text).toContain('✓ step-1 (backend)');
    expect(text).not.toContain('file list reviewed');
    expect(text).not.toContain('[x]');
    // Active step stays fully detailed.
    expect(text).toContain('▶ step-2 (database) Design database schema | verify: schema file exists');
    expect(text).toContain('[ ] entities');
    // Next actionable steps are compact one-liners without verification.
    expect(text).toContain('· step-3 (frontend)');
    expect(text).not.toContain('browser shows five columns');
    // NEXT keeps the area tag.
    expect(text).toContain('NEXT: step-2 (database)');
  });

  it('never hides failed/blocked steps in execution view', () => {
    const { ledger } = makeLedger('failed');
    seedPlan(ledger);
    ledger.updateStep('step-4', { status: 'failed' });
    ledger.setStatus('executing');
    const text = buildStateMessage(ledger);
    expect(text).toContain('⚠ step-4 (integration)');
    expect(text).toContain('verify: PATCH returns 200');
  });

  it('caps rendered completed steps and marks the overflow', () => {
    const { ledger } = makeLedger('donecap');
    ledger.setPlan(
      Array.from({ length: 13 }, (_x, i) => ({
        description: `task ${i + 1}`,
        verification: `v${i + 1}`,
        area: 'backend' as const,
      })),
    );
    for (let i = 1; i <= 12; i++) ledger.updateStep(`step-${i}`, { status: 'done' });
    ledger.setStatus('executing');
    const text = buildStateMessage(ledger);
    expect(text).toContain('(+4 earlier completed)');
    expect([...text.matchAll(/✓ step-/g)]).toHaveLength(8);
    expect(text).toContain('▶ step-13');
  });

  it('stays bounded under a maximal plan and is deterministic', () => {
    const { ledger } = makeLedger('bounded');
    ledger.setPlan(
      Array.from({ length: 30 }, (_x, i) => ({
        description: `${'x'.repeat(180)} #${i + 1}`,
        verification: `${'v'.repeat(120)} #${i + 1}`,
        area: 'shared' as const,
        subtasks: Array.from({ length: 8 }, (_y, j) => `${'t'.repeat(110)} s${j}`),
      })),
    );
    ledger.setStatus('executing');
    const first = buildStateMessage(ledger);
    const second = buildStateMessage(ledger);
    expect(first).toBe(second);
    // Regression guard: compact execution view must not blow up with plan size.
    expect(first.length).toBeLessThan(5000);
    expect(first).toContain('(+26 more queued)');
  });
});

describe('completed-task follow-ups', () => {
  it('appends new criteria and plan steps without replaying the completed plan', async () => {
    const { ledger, dir } = makeLedger('resume-completed');
    ledger.setCriteria(['original dashboard works']);
    ledger.data.acceptanceCriteria[0]!.satisfied = true;
    ledger.setPlan([{ description: 'Build the original dashboard', verification: 'npm test' }]);
    ledger.updateStep('step-1', { status: 'done' });
    ledger.data.planApproved = true;
    ledger.setStatus('completed');

    let firstState = '';
    const llm = new ScriptedMockLlm([
      (_call, messages) => {
        firstState = lastUserText(messages);
        return JSON.stringify({ action: { type: 'set_criteria', criteria: ['export button works'] } });
      },
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'Add export button', verification: 'npm test -- export' }] } }),
      () => JSON.stringify({ action: { type: 'request_block', reason: 'stop after checking the follow-up plan' } }),
    ]);

    const resumed = new Hermes({
      cwd: dir,
      llm,
      mode: 'fast',
      resume: { taskId: ledger.data.taskId, message: 'Add a compact export button' },
    });
    const { ledger: result } = await resumed.run('Add a compact export button');

    expect(firstState).toContain('TASK: Add a compact export button');
    expect(firstState).not.toContain('original dashboard works');
    expect(result.data.acceptanceCriteria.map((criterion) => criterion.text)).toEqual(['original dashboard works', 'export button works']);
    expect(result.data.plan.map((step) => step.description)).toEqual(['Build the original dashboard', 'Add export button']);
    expect(result.activeWorkPhase()?.kind).toBe('follow_up');
  }, 30000);
});

// ── Design records ───────────────────────────────────────────────────────

describe('plan design', () => {
  it('persists bounded sections (frontend/backend/integration caps)', () => {
    const { ledger } = makeLedger('designcaps');
    ledger.setPlanDesign({
      frontend: 'f'.repeat(1500),
      backend: 'b'.repeat(1500),
      integration: 'i'.repeat(900),
    });
    const d = ledger.data.planDesign!;
    expect(d.frontend?.length).toBe(1200);
    expect(d.backend?.length).toBe(1200);
    expect(d.integration?.length).toBe(800);
  });

  it('keeps only the sections provided (frontend-only task)', () => {
    const { ledger } = makeLedger('frontonly');
    ledger.setPlanDesign({ frontend: 'single page app' });
    expect(ledger.data.planDesign!.frontend).toBe('single page app');
    expect(ledger.data.planDesign!.backend).toBeUndefined();
    expect(ledger.data.planDesign!.integration).toBeUndefined();
  });

  it('survives history compaction (ledger-authoritative)', () => {
    const { ledger } = makeLedger('compact-survive');
    seedPlan(ledger);
    ledger.setPlanDesign({ frontend: 'views: dashboard', backend: 'routes: GET /stats' });
    ledger.setStatus('executing');

    const messages = [{ role: 'system' as const, content: 'SYS' }];
    for (let i = 0; i < 20; i++) messages.push({ role: i % 2 ? 'user' : 'assistant', content: `noise ${i} ${'n'.repeat(15_000)}` });
    expect(compactHistory(messages)).toBe(true);
    expect(messages.some((m) => typeof m.content === 'string' && m.content.includes('views: dashboard'))).toBe(false);

    const state = buildStateMessage(ledger);
    expect(state).toContain('PLAN DESIGN:');
    expect(state).toContain('▶ step-2');
  });
});

// ── Plan limits & todos ──────────────────────────────────────────────────

describe('plan limits and todos', () => {
  it('caps plans at 30 steps and todos at 8 per step, bounding field lengths', () => {
    const { ledger } = makeLedger('limits');
    ledger.setPlan(
      Array.from({ length: 35 }, (_x, i) => ({
        description: `d${i} ${'D'.repeat(300)}`,
        verification: `${'V'.repeat(300)}`,
        subtasks: Array.from({ length: 10 }, (_y, j) => `todo ${j} ${'T'.repeat(200)}`),
      })),
    );
    expect(ledger.data.plan).toHaveLength(30);
    const step = ledger.data.plan[0]!;
    expect(step.description.length).toBeLessThanOrEqual(220);
    expect(step.verification.length).toBeLessThanOrEqual(180);
    expect(step.subtasks).toHaveLength(8);
    expect(step.subtasks![0]!.text.length).toBeLessThanOrEqual(140);
  });

  it('cascades todo completion into step completion', () => {
    const { ledger } = makeLedger('cascade');
    ledger.setPlan([{ description: 'one step', verification: 'v', subtasks: ['a', 'b'] }]);
    expect(ledger.toggleSubtask('step-1', 0, true)).toBe(true);
    expect(ledger.data.plan[0]!.status).not.toBe('done');
    expect(ledger.toggleSubtask('step-1', 1)).toBe(true);
    expect(ledger.data.plan[0]!.status).toBe('done');
    expect(ledger.data.plan[0]!.subtasks!.every((t) => t.done)).toBe(true);
  });

  it('rejects out-of-range todo indexes', () => {
    const { ledger } = makeLedger('badidx');
    ledger.setPlan([{ description: 's', verification: 'v', subtasks: ['a'] }]);
    expect(ledger.toggleSubtask('step-1', 5)).toBe(false);
    expect(ledger.toggleSubtask('step-nope', 0)).toBe(false);
  });
});

// ── Dynamic replanning ───────────────────────────────────────────────────

describe('dynamic replanning', () => {
  it('revises one step in place and logs the reason', () => {
    const { ledger } = makeLedger('revise');
    seedPlan(ledger);
    const revised = ledger.reviseStep('step-3', { description: 'Reuse existing CardGrid component', addSubtasks: ['import CardGrid'] }, 'found reusable component');
    expect(revised!.description).toBe('Reuse existing CardGrid component');
    expect(revised!.subtasks!.some((t) => t.text === 'import CardGrid')).toBe(true);
    expect(ledger.data.planRevisions).toHaveLength(1);
    expect(ledger.data.planRevisions![0]).toMatchObject({ stepId: 'step-3', reason: 'found reusable component' });
    // Unrelated steps untouched.
    expect(ledger.step('step-2')!.description).toBe('Design database schema');
  });

  it('returns undefined for unknown steps', () => {
    const { ledger } = makeLedger('revise-unknown');
    seedPlan(ledger);
    expect(ledger.reviseStep('step-99', { description: 'x' }, 'why')).toBeUndefined();
  });

  it('shows full detail on demand via renderFullPlanMessage', () => {
    const { ledger } = makeLedger('fullplan');
    seedPlan(ledger);
    ledger.setPlanDesign({ frontend: 'views: dashboard' });
    ledger.reviseStep('step-2', { verification: 'sqlite file created' }, 'stack decision changed');
    const full = renderFullPlanMessage(ledger);
    expect(full).toContain('FULL PLAN');
    expect(full).toContain('| verify: browser shows five columns');
    expect(full).toContain('[x] scan src');
    expect(full).toContain('RECENT REVISIONS:');
    expect(full).toContain('stack decision changed');
  });
});

// ── Persistence ──────────────────────────────────────────────────────────

describe('persistence across reload', () => {
  it('retains design, todos and revisions through save/load', () => {
    const { ledger, dir } = makeLedger('persist');
    seedPlan(ledger);
    ledger.setPlanDesign({ frontend: 'views: v', backend: 'apis: a' });
    ledger.reviseStep('step-3', { description: 'revised UI' }, 'scope tightened');
    const reloaded = TaskLedger.load(path.resolve(dir), ledger.data.taskId)!;
    expect(reloaded.data.planDesign).toEqual(ledger.data.planDesign);
    expect(reloaded.data.plan[0]!.subtasks).toEqual(ledger.data.plan[0]!.subtasks);
    expect(reloaded.data.planRevisions![0]!.reason).toBe('scope tightened');
  });
});

// ── End-to-end: richer planning must NOT leak into execution context ─────

describe('Hermes e2e - dynamic planning', () => {
  it('plans richly, executes on compact state, and attributes telemetry by phase', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hermes-plan-e2e-'));
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'plan-e2e' }, null, 2));
    const events: string[] = [];
    // Markers padded BEYOND the 240-char compact preview so they can only be
    // seen when the FULL design is rendered (planning / show_plan).
    const filler = 'filler '.repeat(45); // ~315 chars
    const frontendFull = `${filler}UNIQUE-FRONTEND-VIEW-MARKER views: dashboard`;
    const backendFull = `${filler}UNIQUE-BACKEND-API-MARKER routes: GET /stats`;

    let designState = '';
    let executionState = '';
    let fullOnDemand = '';

    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['dashboard works'] } }),
      () =>
        JSON.stringify({
          action: { type: 'set_design', design: { frontend: frontendFull, backend: backendFull } },
        }),
      (_n, messages) => {
        // State message at set_plan time: design recorded, plan not yet.
        designState = lastUserText(messages);
        return JSON.stringify({
          action: {
            type: 'set_plan',
            steps: [
              { description: 'Build board UI', verification: 'browser shows five columns', area: 'frontend', subtasks: ['shell', 'columns', 'cards'] },
              { description: 'Wire stats API', verification: 'GET /stats returns 200', area: 'integration', subtasks: ['endpoint', 'client'] },
              { description: 'Document the dashboard', verification: 'README section exists', area: 'docs' },
            ],
          },
        });
      },
      (_n, messages) => {
        // First execution-phase state message.
        if (!executionState) executionState = lastUserText(messages);
        return JSON.stringify({ action: { type: 'toggle_todo', stepId: 'step-1', index: 0, done: true } });
      },
      () =>
        JSON.stringify({
          action: { type: 'toggle_todo', stepId: 'step-1', index: 1, done: true },
        }),
      (_n, messages) => JSON.stringify({ action: { type: 'toggle_todo', stepId: 'step-1', index: 2, done: true } }),
      // Ask for the FULL plan explicitly - the on-demand rich representation.
      () => JSON.stringify({ action: { type: 'show_plan' } }),
      (_n, messages) => {
        fullOnDemand = '';
        // The show_plan OBSERVATION is a user message; a fresh state message
        // follows right after in the same array, so scan for the observation.
        for (let i = messages.length - 1; i >= 0; i--) {
          const m = messages[i]!;
          if (m.role === 'user' && typeof m.content === 'string' && m.content.includes('FULL PLAN')) {
            fullOnDemand = m.content;
            break;
          }
        }
        return JSON.stringify({ action: { type: 'request_block', reason: 'scenario complete' } });
      },
    ]);

    const hermes = new Hermes({ cwd: dir, llm, mode: 'standard', onEvent: (e) => events.push(e) });
    const { ledger, report } = await hermes.run('Build a stats dashboard');

    // Ledger holds the rich artifacts regardless of what was sent to the model.
    expect(ledger.data.planDesign!.frontend).toContain('UNIQUE-FRONTEND-VIEW-MARKER');
    expect(ledger.data.planDesign!.backend).toContain('UNIQUE-BACKEND-API-MARKER');
    expect(ledger.data.plan).toHaveLength(3);
    expect(events.some((e) => e.startsWith('design   recorded:'))).toBe(true);

    // ── Pre-execution planning state: FULL design ──
    expect(designState).toContain('PLAN DESIGN:');
    expect(designState).toContain('UNIQUE-FRONTEND-VIEW-MARKER');
    expect(designState).toContain('UNIQUE-BACKEND-API-MARKER');

    // ── Execution state: COMPACT but decision-complete ──
    expect(executionState).toMatch(/PLAN: \d+\/\d+ steps · \d+\/\d+ todos/);
    expect(executionState).toContain('▶ step-1 (frontend)');
    expect(executionState).toContain('verify: browser shows five columns'); // active keeps its verification
    expect(executionState).toContain('[ ] columns'); // active open todos only
    expect(executionState).not.toContain('[x]');
    expect(executionState).toContain('· step-2 (integration)'); // next actionable, compact
    expect(executionState).toContain('EVIDENCE:');
    // The full planning payload must NOT be resent every turn: deep design
    // markers and non-active verifications are absent from compact state.
    expect(executionState).not.toContain('UNIQUE-FRONTEND-VIEW-MARKER');
    expect(executionState).not.toContain('UNIQUE-BACKEND-API-MARKER');
    expect(executionState).not.toContain('verify: GET /stats returns 200');
    expect(executionState).not.toContain('| verify: README section exists');

    // ── Rich detail remains available ON DEMAND (show_plan) ──
    expect(fullOnDemand).toContain('FULL PLAN');
    expect(fullOnDemand).toContain('UNIQUE-FRONTEND-VIEW-MARKER');
    expect(fullOnDemand).toContain('| verify: GET /stats returns 200');
    expect(fullOnDemand).toContain('[x] shell'); // completed todos visible in full view

    // ── Token telemetry: planning vs execution attribution ──
    const t = report.tokenTelemetry ?? ledger.data.tokenTelemetry;
    expect(t).toBeDefined();
    expect(t!.planningCalls).toBeGreaterThanOrEqual(2);
    expect(t!.executionCalls).toBeGreaterThanOrEqual(1);
    expect(t!.estimatedPlanningInput).toBeGreaterThan(0);
    expect(t!.estimatedExecutionInput).toBeGreaterThan(0);
  }, 60000);
});
