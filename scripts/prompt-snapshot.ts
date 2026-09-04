/**
 * Prompt architecture snapshot — measures representative prompt compositions
 * so the prompt refactor is judged by numbers, not vibes.
 *
 * Usage: npx tsx scripts/prompt-snapshot.ts [--json]
 * Scenarios: simple bug fix, failing test, frontend (UI), connection/provider,
 * delegated specialist. Each reports core/system chars, strategy chars,
 * task-state chars, and the total fixed-instruction chars.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { buildStateMessage, buildSystemPrompt } from '../src/agent/prompt.js';
import { RecoveryOrchestrator } from '../src/recovery/recovery-orchestrator.js';
import { buildTaskStrategySection } from '../src/agent/task-strategy.js';
import { builtinSkillByName } from '../src/skills/builtin.js';
import { renderSkillContract } from '../src/skills/skills.js';
import { buildSystemPrompt as buildSpecialistPrompt, renderSpecialistHandoff, type SpecialistHandoff } from '../src/agent/subagent.js';

interface ScenarioResult {
  scenario: string;
  systemChars: number;
  strategyChars: number;
  stateChars: number;
  fixedChars: number;
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

function scenarioResults(): ScenarioResult[] {
  const results: ScenarioResult[] = [];

  // 1. Simple bug fix (native protocol, no browser, no connections).
  {
    const { dir, guard, memory, ledger } = makeProject('bugfix');
    const orchestrator = new RecoveryOrchestrator(() => {}, { repoRoot: dir });
    flappyState(ledger, orchestrator);
    const system = buildSystemPrompt(guard, memory, {
      lspSection: LSP_SECTION,
      autoLearn: true,
      uiTask: false,
    });
    const strategy = buildTaskStrategySection('fix the greeting bug in index.js', true) ?? '';
    const state = buildStateMessage(ledger, undefined, undefined, undefined, orchestrator.renderPromptSection());
    results.push({
      scenario: '1. simple bug fix',
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
    const system = buildSystemPrompt(guard, memory, { lspSection: LSP_SECTION, autoLearn: true, uiTask: false });
    const strategy = buildTaskStrategySection('the test suite is failing after the refactor', true) ?? '';
    const state = buildStateMessage(ledger, undefined, undefined, undefined, orchestrator.renderPromptSection());
    results.push({
      scenario: '2. failing test',
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
    const system = buildSystemPrompt(guard, memory, {
      hasBrowser: true,
      vision: true,
      autoLearn: true,
      uiTask: true,
      uiQualityContract: renderSkillContract(quality, 440),
    });
    const strategy = buildTaskStrategySection('build a dashboard landing page with dark mode', true) ?? '';
    const state = buildStateMessage(ledger);
    results.push({
      scenario: '3. frontend task',
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
    const system = buildSystemPrompt(guard, memory, {
      mcpSection: '- mcp server "github" (npx @modelcontextprotocol/server-github)',
      lspSection: LSP_SECTION,
      autoLearn: true,
      uiTask: false,
    });
    const strategy = buildTaskStrategySection('deploy the app using the saved provider connection', true) ?? '';
    const state = buildStateMessage(ledger);
    results.push({
      scenario: '4. connection/provider task',
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
    const system = buildSystemPrompt(guard, memory, {
      lspSection: LSP_SECTION,
      capabilityContext: { protocolMode: 'structured_text', planningRelevant: true, lspAvailable: true, skillsAvailable: true, autoLearn: true },
    });
    const strategy = buildTaskStrategySection('the test suite is failing after the refactor', true) ?? '';
    const state = buildStateMessage(ledger, undefined, undefined, undefined, orchestrator.renderPromptSection());
    results.push({
      scenario: '4b. failing test (text proto)',
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
  console.log('scenario'.padEnd(28) + 'system'.padStart(9) + 'strategy'.padStart(10) + 'state'.padStart(9) + 'fixed'.padStart(9));
  let sys = 0;
  let strat = 0;
  let state = 0;
  let fixed = 0;
  for (const r of results) {
    console.log(
      r.scenario.padEnd(28) +
        String(r.systemChars).padStart(9) +
        String(r.strategyChars).padStart(10) +
        String(r.stateChars).padStart(9) +
        String(r.fixedChars).padStart(9),
    );
    sys += r.systemChars;
    strat += r.strategyChars;
    state += r.stateChars;
    fixed += r.fixedChars;
  }
  console.log('-'.repeat(65));
  console.log(
    'TOTAL'.padEnd(28) + String(sys).padStart(9) + String(strat).padStart(10) + String(state).padStart(9) + String(fixed).padStart(9),
  );
}

const json = process.argv.includes('--json');
const results = scenarioResults();
if (json) console.log(JSON.stringify(results, null, 2));
else printTable(results);
