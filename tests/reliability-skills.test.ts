import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Hermes } from '../src/agent/gitu.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import { SkillStore } from '../src/skills/skills.js';

function makeProject(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `hermes-rsv-${name}-`));
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: `rsv-${name}`, scripts: { test: 'node --version' } }, null, 2),
  );
  return dir;
}

function findEvidenceId(messages: { role: string; content: unknown }[]): string {
  const text = messages.map((m) => String(m.content)).join('\n');
  return (text.match(/(ev-\d{8}-[0-9a-f]{6})/) ?? [])[1] ?? 'ev-missing';
}

/** Standard fast-mode build script that opens the evidence gate and completes. */
function buildScript(): ScriptedMockLlm {
  return new ScriptedMockLlm([
    () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['verification command passes'] } }),
    () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify', verification: 'node --version' }] } }),
    () =>
      JSON.stringify({
        action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' },
      }),
    (n, messages) => JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: findEvidenceId(messages) } }),
    () => JSON.stringify({ action: { type: 'complete', summary: 'done', risks: [], followUps: [] } }),
  ]);
}

describe('SkillResolver — multi-strategy matching', () => {
  function storeWith(): SkillStore {
    const dir = makeProject('resolver');
    const store = SkillStore.forProject(dir);
    store.create({
      name: 'typescript-refactor',
      description: 'Refactor TypeScript code safely with strict mode',
      instructions: '1. read the file\n2. apply strict typing',
      aliases: ['ts-migration'],
      keywords: ['typescript', 'refactor', 'strict'],
    });
    return store;
  }

  it('resolves an exact skill name as high confidence', () => {
    const store = storeWith();
    const result = store.resolver().resolve('typescript-refactor');
    expect(result.highConfidence.map((s) => s.name)).toContain('typescript-refactor');
    expect(result.allMatches[0]?.score).toBe(1);
  });

  it('resolves an alias as high confidence', () => {
    const store = storeWith();
    const result = store.resolver().resolve('ts-migration');
    expect(result.highConfidence.map((s) => s.name)).toContain('typescript-refactor');
    expect(result.allMatches[0]?.reason).toContain('Exact');
  });

  it('resolves by keyword overlap', () => {
    const store = storeWith();
    const result = store.resolver().resolve('I need to refactor something');
    const hit = result.allMatches.find((m) => m.skill.name === 'typescript-refactor');
    expect(hit).toBeDefined();
    expect(result.suggestions.map((m) => m.skill.name)).toContain('typescript-refactor');
  });

  it('resolves a misspelled name via fuzzy (Levenshtein) matching', () => {
    const store = storeWith();
    // 'typescriptrefactr' is one character off the normalized name
    // 'typescriptrefactor' and shares no exact tokens — only fuzzy can hit.
    const result = store.resolver().resolve('typescriptrefactr');
    const hit = result.allMatches.find((m) => m.skill.name === 'typescript-refactor');
    expect(hit).toBeDefined();
    expect(hit!.reason).toContain('fuzzy:typescript-refactor');
    expect(hit!.score).toBe(0.7);
  });

  it('does not suggest unrelated queries', () => {
    const store = storeWith();
    const result = store.resolver().resolve('please order pizza for lunch');
    expect(result.allMatches).toHaveLength(0);
  });
});

describe('TaskLedger — active skill persistence and usage tracking', () => {
  it('persists activeSkills and usedSkills across save/reload', () => {
    const dir = makeProject('persist');
    const guard = ProjectGuard.detect(dir);
    const ledger = TaskLedger.create({
      repoRoot: path.resolve(dir),
      goal: 'g',
      project: guard.lock,
      mode: 'fast',
      activeSkills: ['typescript-refactor'],
    });
    ledger.addUsedSkill('typescript-refactor');
    ledger.addUsedSkill('typescript-refactor'); // dedupe
    ledger.addUsedSkill('build-guide');
    ledger.save();

    const reloaded = TaskLedger.load(path.resolve(dir), ledger.data.taskId);
    expect(reloaded?.data.activeSkills).toEqual(['typescript-refactor']);
    expect(reloaded?.data.usedSkills).toEqual(['typescript-refactor', 'build-guide']);
  });

  it('setActiveSkills replaces the active set', () => {
    const dir = makeProject('setactive');
    const guard = ProjectGuard.detect(dir);
    const ledger = TaskLedger.create({ repoRoot: path.resolve(dir), goal: 'g', project: guard.lock, mode: 'fast' });
    ledger.setActiveSkills(['a', 'b', 'a']);
    expect(ledger.data.activeSkills).toEqual(['a', 'b']);
  });
});

describe('Hermes — skill usage runtime tracking', () => {
  it('records used skills into the ledger when the model loads one with use_skill', async () => {
    const dir = makeProject('used');
    const skills = SkillStore.forProject(path.resolve(dir));
    skills.create({
      name: 'typescript-refactor',
      description: 'Refactor TypeScript code safely',
      instructions: 'always read the file before editing',
    });
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['verification command passes'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify', verification: 'node --version' }] } }),
      () =>
        JSON.stringify({
          action: { type: 'tool_call', stepId: 'step-1', tool: 'use_skill', params: { name: 'typescript-refactor' }, reason: 'load the refactor skill', expected: 'skill instructions' },
        }),
      () =>
        JSON.stringify({
          action: { type: 'tool_call', stepId: 'step-2', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' },
        }),
      (_n, messages) => JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: findEvidenceId(messages) } }),
      () => JSON.stringify({ action: { type: 'complete', summary: 'done', risks: [], followUps: [] } }),
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', skills });
    const { ledger } = await hermes.run('Refactor the typescript module');

    expect(ledger.data.status).toBe('completed');
    expect(ledger.data.usedSkills).toContain('typescript-refactor');

    // Persists to disk for continuation visibility.
    const reloaded = TaskLedger.load(path.resolve(dir), ledger.data.taskId);
    expect(reloaded?.data.usedSkills).toContain('typescript-refactor');
  }, 30000);

  it('does not record a used skill when use_skill fails or the skill does not exist', async () => {
    const dir = makeProject('unused');
    const skills = SkillStore.forProject(path.resolve(dir));
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['verification command passes'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify', verification: 'node --version' }] } }),
      () =>
        JSON.stringify({
          action: { type: 'tool_call', stepId: 'step-1', tool: 'use_skill', params: { name: 'no-such-skill' }, reason: 'attempt to load a missing skill', expected: 'skill instructions' },
        }),
      () =>
        JSON.stringify({
          action: { type: 'tool_call', stepId: 'step-2', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' },
        }),
      (_n, messages) => JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: findEvidenceId(messages) } }),
      () => JSON.stringify({ action: { type: 'complete', summary: 'done', risks: [], followUps: [] } }),
    ]);
    const hermes = new Hermes({ cwd: dir, llm, mode: 'fast', skills });
    const { ledger } = await hermes.run('verify the project');

    expect(ledger.data.status).toBe('completed');
    expect(ledger.data.usedSkills ?? []).not.toContain('no-such-skill');
  }, 30000);
});

describe('Hermes — automatic skill activation and continuation continuity', () => {
  it('auto-activates a high-confidence skill for the task goal', async () => {
    const dir = makeProject('activate');
    const skills = SkillStore.forProject(path.resolve(dir));
    skills.create({
      name: 'typescript-refactor',
      description: 'Refactor TypeScript code safely',
      instructions: '1. read first\n2. strict types only',
    });
    const events: string[] = [];
    const hermes = new Hermes({ cwd: dir, llm: buildScript(), mode: 'fast', skills, onEvent: (e) => events.push(e) });
    const { ledger } = await hermes.run('Refactor the typescript module');

    expect(ledger.data.activeSkills).toContain('typescript-refactor');
    expect(events.some((e) => e.includes('auto-activated'))).toBe(true);
    const tasks = TaskLedger.list(path.resolve(dir));
    const fromDisk = tasks.find((t) => t.data.taskId === ledger.data.taskId);
    expect(fromDisk?.data.activeSkills).toContain('typescript-refactor');
  });

  it('restores previously active skills in a continuation', async () => {
    const dir = makeProject('continuity');
    const skills = SkillStore.forProject(path.resolve(dir));
    skills.create({
      name: 'typescript-refactor',
      description: 'Refactor TypeScript code safely',
      instructions: 'always read the file before editing',
    });

    // Run 1 activates the skill.
    const hermes1 = new Hermes({ cwd: dir, llm: buildScript(), mode: 'fast', skills });
    const { ledger: l1 } = await hermes1.run('Refactor the typescript module');
    expect(l1.data.activeSkills).toContain('typescript-refactor');
    const taskId = l1.data.taskId;

    // Run 2 (resume) must see the skill in the system prompt and state message.
    let captured: { role: string; content: string }[] = [];
    const continuation = new ScriptedMockLlm([
      (_n, messages) => {
        captured = messages.map((m) => ({ role: m.role, content: String(m.content) }));
        return JSON.stringify({ action: { type: 'complete', summary: 'acknowledged', chat: true } });
      },
    ]);
    const hermes2 = new Hermes({
      cwd: dir,
      llm: continuation,
      mode: 'fast',
      skills,
      resume: { taskId, message: 'keep going with the refactor' },
    });
    const { ledger: l2 } = await hermes2.run('Refactor the typescript module');

    expect(l2.data.taskId).toBe(taskId);
    expect(l2.data.activeSkills).toContain('typescript-refactor');
    const allText = captured.map((m) => m.content).join('\n');
    expect(allText).toContain('typescript-refactor');
    expect(allText).toContain('always read the file before editing');
  });
});
