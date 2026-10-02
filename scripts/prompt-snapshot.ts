/**
 * Prompt architecture snapshot — measures representative prompt compositions
 * so the prompt refactor is judged by numbers, not vibes.
 *
 * Usage: npx tsx scripts/prompt-snapshot.ts [--json]
 * Scenarios: simple bug fix, failing test, frontend (UI), connection/provider,
 * delegated specialist. Each reports the layered composition
 * (core / capability contracts / optional modules / presentation), the
 * strategy and task-state payloads, and the total fixed-instruction chars.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { buildStateMessage, buildSystemPrompt, type PromptCompositionMetrics, type SystemPromptOptions } from '../src/agent/prompt.js';
import { loadOutputStyle } from '../src/agent/output-style.js';
import { RecoveryOrchestrator } from '../src/recovery/recovery-orchestrator.js';
import { buildTaskStrategySection } from '../src/agent/task-strategy.js';
import { builtinSkillByName } from '../src/skills/builtin.js';
import { renderSkillContract } from '../src/skills/skills.js';
import { buildSystemPrompt as buildSpecialistPrompt, renderSpecialistHandoff, type SpecialistHandoff } from '../src/agent/subagent.js';

interface ScenarioResult {
  scenario: string;
  coreChars: number;
  capabilityChars: number;
  moduleChars: number;
  presentationChars: number;
  systemChars: number;
  strategyChars: number;
  stateChars: number;
  fixedChars: number;
}

/** buildSystemPrompt + captured layer metrics, so scenarios stay one-liners. */
function measureSystem(guard: ProjectGuard, memory: MemoryStore, opts: SystemPromptOptions): { system: string; metrics: PromptCompositionMetrics } {
  let metrics: PromptCompositionMetrics = { coreChars: 0, capabilityChars: 0, moduleChars: 0 };
  const system = buildSystemPrompt(guard, memory, {
    ...opts,
    onMetrics: (m) => {
      metrics = m;
    },
  });
  return { system, metrics };
}

function makeProject(name: string): { dir: string; guard: ProjectGuard; memory: MemoryStore; ledger: TaskLedger } {
  const dir = mkdtempSync(path.join(tmpdir(), `prompt-snap-${name}-`));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `snap-${name}` }));
  const guard = ProjectGuard.detect(dir);
  const memory = MemoryStore.forProject(dir);
  const ledger = TaskLedger.create({ repoRoot: dir, goal: '', project: guard.lock, mode: 'standard' });
  return { dir, guard, memory, ledger };
}

function flappyState(ledger: TaskLedger, orchestrator: RecoveryOrchestrator): void {
  ledger.setCriteria(['the steady-speed check passes', 'the pipe-cull accounting is correct']);
  ledger.setPlan([
    { description: 'fix the steady-speed accounting in game.js', verification: 'npm test' },
    { description: 'fix the pipe cull accounting', verification: 'npm run test:cull' },
  ]);
  orchestrator.onActionOutcome(
    {
      tool: 'run_command',
      params: { command: 'npm test' },
      reason: 'verify speed behavior',
      expected: 'steady speed holds',
      command: 'npm test',
      toolOk: true,
      output: 'FAIL game.test.js\n  expected steady speed 403.6 but received 406.8',
      semanticVerdict: { verdict: 'contradiction', explanation: 'speed assertion failed', blocking: true },
    },
    ledger,
  );
}

const LSP_SECTION = '- typescript-language-server server → lsp tools for: typescript, javascript';
const PRESENTATION_CHARS = loadOutputStyle().length;

function scenarioResults(): ScenarioResult[] {
  const results: ScenarioResult[] = [];

  // 1. Simple bug fix (native protocol, no browser, no connections).
  {
    const { dir, guard, memory, ledger } = makeProject('bugfix');
    const orchestrator = new RecoveryOrchestrator(() => {}, { repoRoot: dir });
    flappyState(ledger, orchestrator);
    const { system, metrics } = measureSystem(guard, memory, {
      lspSection: LSP_SECTION,
      autoLearn: true,
      uiTask: false,
      capabilityContext: { planningRelevant: true },
    });
    const strategy = buildTaskStrategySection('fix the greeting bug in index.js', true) ?? '';
    const state = buildStateMessage(ledger, undefined, undefined, undefined, orchestrator.renderPromptSection());
    results.push({
      scenario: '1. simple bug fix',
      ...metrics,
      presentationChars: PRESENTATION_CHARS,
      systemChars: system.length,
      strategyChars: strategy.length,
      stateChars: state.length,
      fixedChars: system.length + strategy.length,
    });
    rmSync(dir, { recursive: true, force: true });
  }

  // 2. Failing test.
  {
    const { dir, guard, memory, ledger } = makeProject('testfail');
    const orchestrator = new RecoveryOrchestrator(() => {}, { repoRoot: dir });
    flappyState(ledger, orchestrator);
    const { system, metrics } = measureSystem(guard, memory, {
      lspSection: LSP_SECTION,
      autoLearn: true,
      uiTask: false,
      capabilityContext: { planningRelevant: true },
    });
    const strategy = buildTaskStrategySection('the test suite is failing after the refactor', true) ?? '';
    const state = buildStateMessage(ledger, undefined, undefined, undefined, orchestrator.renderPromptSection());
    results.push({
      scenario: '2. failing test',
      ...metrics,
      presentationChars: PRESENTATION_CHARS,
      systemChars: system.length,
      strategyChars: strategy.length,
      stateChars: state.length,
      fixedChars: system.length + strategy.length,
    });
    rmSync(dir, { recursive: true, force: true });
  }

  // 3. Frontend task (browser available, vision, quality contract).
  {
    const { dir, guard, memory, ledger } = makeProject('frontend');
    const quality = builtinSkillByName('frontend-quality-bar')!;
    const { system, metrics } = measureSystem(guard, memory, {
      hasBrowser: true,
      vision: true,
      autoLearn: true,
      uiTask: true,
      uiQualityContract: renderSkillContract(quality, 440),
      capabilityContext: { planningRelevant: true },
    });
    const strategy = buildTaskStrategySection('build a dashboard landing page with dark mode', true) ?? '';
    const state = buildStateMessage(ledger);
    results.push({
      scenario: '3. frontend task',
      ...metrics,
      presentationChars: PRESENTATION_CHARS,
      systemChars: system.length,
      strategyChars: strategy.length,
      stateChars: state.length,
      fixedChars: system.length + strategy.length,
    });
    rmSync(dir, { recursive: true, force: true });
  }

  // 4. Connection/provider task (MCP + saved connections + browser).
  {
    const { dir, guard, memory, ledger } = makeProject('connection');
    const { system, metrics } = measureSystem(guard, memory, {
      mcpSection: '- mcp server "github" (npx @modelcontextprotocol/server-github)',
      lspSection: LSP_SECTION,
      autoLearn: true,
      uiTask: false,
      capabilityContext: { planningRelevant: true, connectionsRelevant: true },
    });
    const strategy = buildTaskStrategySection('deploy the app using the saved provider connection', true) ?? '';
    const state = buildStateMessage(ledger);
    results.push({
      scenario: '4. connection/provider task',
      ...metrics,
      presentationChars: PRESENTATION_CHARS,
      systemChars: system.length,
      strategyChars: strategy.length,
      stateChars: state.length,
      fixedChars: system.length + strategy.length,
    });
    rmSync(dir, { recursive: true, force: true });
  }

  // 4b. Failing test over a TEXT protocol (structured_text): pays for the
  // full action grammar — the honest cost for text-only providers.
  {
    const { dir, guard, memory, ledger } = makeProject('textproto');
    const orchestrator = new RecoveryOrchestrator(() => {}, { repoRoot: dir });
    flappyState(ledger, orchestrator);
    const { system, metrics } = measureSystem(guard, memory, {
      lspSection: LSP_SECTION,
      capabilityContext: { protocolMode: 'structured_text', planningRelevant: true, lspAvailable: true, skillsAvailable: true, autoLearn: true },
    });
    const strategy = buildTaskStrategySection('the test suite is failing after the refactor', true) ?? '';
    const state = buildStateMessage(ledger, undefined, undefined, undefined, orchestrator.renderPromptSection());
    results.push({
      scenario: '4b. failing test (text proto)',
      ...metrics,
      presentationChars: PRESENTATION_CHARS,
      systemChars: system.length,
      strategyChars: strategy.length,
      stateChars: state.length,
      fixedChars: system.length + strategy.length,
    });
    rmSync(dir, { recursive: true, force: true });
  }

  // 5. Delegated specialist task.
  {
    const { dir } = makeProject('specialist');
    const specialistSystem = buildSpecialistPrompt('explorer', 'code exploration and mapping', dir, false, [
      { id: 'ac-1', text: 'the failing check is identified', evidenceIds: [], satisfied: false },
    ]);
    const handoff = renderSpecialistHandoff({
      parentGoal: 'Fix the failing game-speed checks and keep the suite green.',
      assignment: 'Map the pipe-cull accounting and identify why culled counters never increment.',
      startingFiles: [{ path: 'src/game/pipes.ts', role: 'implementation', note: 'cull accounting lives here' }],
      planSteps: [{ description: 'fix the pipe cull accounting', verification: 'npm run test:cull' }],
      verificationTargets: ['npm run test:cull'],
      excerpts: [{ path: 'src/game/pipes.ts', content: 'function cullPipes(pipes, distance) { return pipes.filter((p) => p.y < distance); }' }],
    } as SpecialistHandoff);
    results.push({
      scenario: '5. delegated specialist',
      coreChars: specialistSystem.length,
      capabilityChars: 0,
      moduleChars: 0,
      presentationChars: 0,
      systemChars: specialistSystem.length,
      strategyChars: 0,
      stateChars: handoff.length,
      fixedChars: specialistSystem.length,
    });
    rmSync(dir, { recursive: true, force: true });
  }

  return results;
}

function printTable(results: ScenarioResult[]): void {
  const header = 'scenario'.padEnd(28) + 'core'.padStart(8) + 'caps'.padStart(8) + 'modules'.padStart(9) + 'style'.padStart(8) + 'system'.padStart(8) + 'strategy'.padStart(9) + 'state'.padStart(8) + 'fixed'.padStart(8);
  console.log(header);
  const totals = { core: 0, caps: 0, modules: 0, style: 0, system: 0, strategy: 0, state: 0, fixed: 0 };
  for (const r of results) {
    console.log(
      r.scenario.padEnd(28) +
        String(r.coreChars).padStart(8) +
        String(r.capabilityChars).padStart(8) +
        String(r.moduleChars).padStart(9) +
        String(r.presentationChars).padStart(8) +
        String(r.systemChars).padStart(8) +
        String(r.strategyChars).padStart(9) +
        String(r.stateChars).padStart(8) +
        String(r.fixedChars).padStart(8),
    );
    totals.core += r.coreChars;
    totals.caps += r.capabilityChars;
    totals.modules += r.moduleChars;
    totals.style += r.presentationChars;
    totals.system += r.systemChars;
    totals.strategy += r.strategyChars;
    totals.state += r.stateChars;
    totals.fixed += r.fixedChars;
  }
  console.log('-'.repeat(header.length));
  console.log(
    'TOTAL'.padEnd(28) +
      String(totals.core).padStart(8) +
      String(totals.caps).padStart(8) +
      String(totals.modules).padStart(9) +
      String(totals.style).padStart(8) +
      String(totals.system).padStart(8) +
      String(totals.strategy).padStart(9) +
      String(totals.state).padStart(8) +
      String(totals.fixed).padStart(8),
  );
  console.log('\nLayers: core = always-on principles/boundary/authority/protocol; caps = per-run capability contracts;');
  console.log('modules = optional task modules (scope, catalogs, UI quality, workflow); style = presentation layer.');
  console.log('system = composed system prompt; fixed = system + strategy (paid on every call of the run).');
}

const json = process.argv.includes('--json');
const results = scenarioResults();
if (json) console.log(JSON.stringify(results, null, 2));
else printTable(results);
