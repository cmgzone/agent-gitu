import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { builtinSkillByName, builtinSkills } from '../src/skills/builtin.js';
import { renderSkillContract, SkillStore } from '../src/skills/skills.js';
import { buildSystemPrompt } from '../src/agent/prompt.js';
import { buildTaskStrategySection, strategySkillFor } from '../src/agent/task-strategy.js';

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hermes-builtin-skills-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'builtin-skills-test' }));
  return dir;
}

describe('built-in skill tier', () => {
  it('ships strategy + UI expertise as skills, visible through forProject', () => {
    const store = SkillStore.forProject(makeProject());
    const names = store.list().map((s) => s.name);
    for (const expected of ['strategy-bug-fix', 'strategy-refactor', 'strategy-test-failure', 'strategy-explore', 'strategy-feature', 'frontend-quality-bar']) {
      expect(names).toContain(expected);
    }
    expect(store.get('strategy-bug-fix')?.scope).toBe('builtin');
  });

  it('does not add builtins when constructed with the 2-arg form (isolation for embedders)', () => {
    const dir = makeProject();
    const scoped = new SkillStore(SkillStore.projectSkillsDir(dir), tmpdir());
    expect(scoped.list()).toEqual([]);
  });

  it('lets a user skill shadow a built-in by name without touching it', () => {
    const dir = makeProject();
    const store = SkillStore.forProject(dir);
    store.create({ name: 'strategy-bug-fix', description: 'team custom', instructions: 'TEAM CUSTOM STRATEGY: use our internal reproducer script first.' });

    const shadowed = store.get('strategy-bug-fix')!;
    expect(shadowed.scope).toBe('project');
    expect(shadowed.instructions).toContain('TEAM CUSTOM STRATEGY');

    // The activation mechanism picks up the shadowed content.
    expect(strategySkillFor('bug-fix', store).instructions).toContain('TEAM CUSTOM STRATEGY');
    expect(buildTaskStrategySection('Fix the crash', true, store)).toContain('TEAM CUSTOM STRATEGY');

    // Without a store, the built-in content is used.
    expect(buildTaskStrategySection('Fix the crash', true)).toContain('shortest evidence path');

    // Removing the user copy reveals the built-in again.
    expect(store.remove('strategy-bug-fix')).toBe(true);
    expect(store.get('strategy-bug-fix')?.scope).toBe('builtin');
  });

  it('keeps every strategy skill aligned with its task kind', () => {
    for (const skill of builtinSkills()) {
      if (!skill.taskKind) continue;
      expect(skill.name).toBe(`strategy-${skill.taskKind}`);
      expect(skill.instructions).toContain('TASK STRATEGY');
    }
  });

  it('exposes builtins to the resolver so use_skill can load them', () => {
    const store = SkillStore.forProject(makeProject());
    const resolution = store.resolver().resolve('strategy-bug-fix');
    expect(resolution.highConfidence.some((s) => s.name === 'strategy-bug-fix')).toBe(true);
  });
});

describe('frontend quality bar as a skill', () => {
  it('exists as a built-in and injects into the system prompt for UI tasks', () => {
    const skill = builtinSkillByName('frontend-quality-bar');
    expect(skill).toBeTruthy();
    const dir = makeProject();
    const guard = ProjectGuard.detect(dir);
    const memory = { renderForPrompt: () => '' } as unknown as MemoryStore;
    const prompt = buildSystemPrompt(guard, memory, { uiTask: true });
    expect(prompt).toContain('FRONTEND QUALITY BAR');
    expect(prompt).toContain('intent map');
    expect(prompt).toContain('Do not invent buttons');

    const plain = buildSystemPrompt(guard, memory, { uiTask: false });
    expect(plain).not.toContain('FRONTEND QUALITY BAR');
  });

  it('accepts a shadowing override via uiQualityInstructions', () => {
    const dir = makeProject();
    const guard = ProjectGuard.detect(dir);
    const memory = { renderForPrompt: () => '' } as unknown as MemoryStore;
    const store = SkillStore.forProject(dir);
    store.create({ name: 'frontend-quality-bar', description: 'team bar', instructions: 'TEAM UI RULES: 8px grid only.' });
    const prompt = buildSystemPrompt(guard, memory, {
      uiTask: true,
      uiQualityInstructions: store.get('frontend-quality-bar')?.instructions,
    });
    expect(prompt).toContain('TEAM UI RULES');
    expect(prompt).not.toContain('intent map');
  });

  it('uses a small durable contract while keeping the full procedure in the skill store', () => {
    const skill = builtinSkillByName('frontend-quality-bar')!;
    const contract = renderSkillContract(skill, 260);
    expect(contract.length).toBeLessThanOrEqual(260);
    expect(contract).toContain('frontend-quality-bar');
    expect(contract).toContain('intent map');
    expect(contract).toContain('Every interactive control');
    expect(skill.instructions.length).toBeGreaterThan(contract.length);
  });

  it('caps the per-turn skill catalog while keeping active skills first', () => {
    const store = SkillStore.forProject(makeProject());
    for (let i = 0; i < 12; i++) {
      store.create({ name: `playbook-${i}`, description: `Long description ${'d'.repeat(300)}`, instructions: `Do the thing ${i}.` });
    }
    const prompt = store.renderForPrompt(['playbook-11'], { maxSkills: 4, descriptionMaxChars: 80 });
    expect(prompt).toContain('playbook-11');
    expect(prompt).toContain('[ACTIVE IN CURRENT TASK]');
    expect(prompt).toContain('more skill(s) available via list_skills');
    expect(prompt.length).toBeLessThan(700);
  });
});
