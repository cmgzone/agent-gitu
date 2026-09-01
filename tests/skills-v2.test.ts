import { existsSync, mkdirSync, mkdtempSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SpecialistCheckpointStore, reconcileSpecialistSkillState, type SpecialistCheckpoint } from '../src/agent/specialist-checkpoints.js';
import { Executor } from '../src/executor/executor.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { LoopDetector } from '../src/loop/loop-detector.js';
import { PolicyEngine } from '../src/policy/policy.js';
import { DEFAULT_SKILL_LIMITS, SkillStore } from '../src/skills/skills.js';

function project(label: string): string {
  const root = mkdtempSync(path.join(tmpdir(), `gitu-skills-v2-${label}-`));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: label }));
  return root;
}

function markdownSkill(root: string, name: string, body = 'Follow the skill instructions.', extra = ''): string {
  const dir = path.join(root, '.hermes', 'skills', name);
  mkdirSync(dir, { recursive: true });
  const content = `---\nname: ${name}\ndescription: Build ${name} safely\nversion: 1\naliases:\n  - ${name}-alias\nkeywords:\n  - ${name}\nspecialists:\n  - frontend\n${extra}---\n\n# ${name}\n${body}\n`;
  writeFileSync(path.join(dir, 'SKILL.md'), content);
  return dir;
}

function checkpoint(input: { root: string; skills?: SpecialistCheckpoint['selectedSkills'] }): SpecialistCheckpoint {
  const now = new Date().toISOString();
  return {
    logicalJobId: 'logical-skills-v2',
    executionJobId: 'physical-skills-v2',
    executionAttempt: 1,
    specialistType: 'frontend',
    delegatedTask: 'Build a frontend',
    delegatedTaskHash: '1234',
    repositoryPath: input.root,
    worktreePath: input.root,
    branch: 'main',
    currentTurn: 1,
    changedFiles: [],
    selectedSkills: input.skills ?? [],
    checkpointedAt: now,
    resumeStatus: 'RESUME_CONTEXT_ONLY',
    resumable: true,
    createdAt: now,
    updatedAt: now,
  };
}

describe('Skills v2 directory compatibility and progressive disclosure', () => {
  it('keeps legacy JSON skills working and loads SKILL.md metadata lazily', () => {
    const root = project('json-and-md');
    const store = new SkillStore(SkillStore.projectSkillsDir(root), path.join(root, 'global'));
    store.create({ name: 'legacy', description: 'old', instructions: 'legacy full instructions' });
    markdownSkill(root, 'react-frontend', 'VERY PRIVATE FULL BODY');

    const discovered = store.list();
    expect(discovered.find((skill) => skill.name === 'legacy')?.instructions).toContain('legacy full');
    const markdown = discovered.find((skill) => skill.name === 'react-frontend')!;
    expect(markdown.loaded).toBe(false);
    expect(markdown.instructions).toBe('');
    expect(store.renderForPrompt().includes('VERY PRIVATE FULL BODY')).toBe(false);
    expect(store.get('react-frontend')?.instructions).toContain('VERY PRIVATE FULL BODY');
  });

  it('preserves project-over-global precedence and makes SKILL.md beat same-layer JSON', () => {
    const root = project('precedence');
    const global = path.join(root, 'global');
    const globalStore = new SkillStore(SkillStore.projectSkillsDir(root), global);
    globalStore.create({ name: 'deploy', description: 'global deploy', instructions: 'global body', scope: 'global' });
    markdownSkill(root, 'deploy', 'project markdown body');
    const projectStore = new SkillStore(SkillStore.projectSkillsDir(root), global);
    expect(projectStore.get('deploy')?.scope).toBe('project');
    expect(projectStore.get('deploy')?.instructions).toContain('project markdown');

    projectStore.create({ name: 'deploy', description: 'project json', instructions: 'json body' });
    expect(projectStore.get('deploy')?.format).toBe('skill-md');
    expect(projectStore.diagnostics().some((diagnostic) => diagnostic.code === 'SKILL_DUPLICATE')).toBe(true);
  });

  it('uses contextual specialist and requirement ranking without making it LLM-driven', () => {
    const root = project('ranking');
    markdownSkill(root, 'frontend-only', 'frontend body');
    const store = new SkillStore(SkillStore.projectSkillsDir(root), path.join(root, 'global'));
    const backend = store.resolver().resolve('frontend-only', { specialist: 'backend' });
    expect(backend.highConfidence.map((skill) => skill.name)).not.toContain('frontend-only');
    const frontend = store.resolver().resolve('frontend-only', { specialist: 'frontend', availableTools: ['read_file'] });
    expect(frontend.highConfidence.map((skill) => skill.name)).toContain('frontend-only');
  });

  it('fails closed when requirements are missing and does not load unrelated skills', () => {
    const root = project('requirements');
    markdownSkill(root, 'needs-browser', 'browser body', 'requires:\n  tools:\n    - browser\n');
    markdownSkill(root, 'unrelated', 'UNRELATED FULL BODY');
    const store = new SkillStore(SkillStore.projectSkillsDir(root), path.join(root, 'global'));
    const activation = store.activate('needs-browser', { availableTools: ['read_file'] });
    expect(activation.ok).toBe(false);
    expect(activation.code).toBe('SKILL_REQUIREMENTS_UNMET');
    expect(store.list().find((skill) => skill.name === 'unrelated')?.loaded).toBe(false);
  });

  it('handles a 200-skill library without injecting all instruction bodies', () => {
    const root = project('large-library');
    for (let index = 0; index < 200; index++) markdownSkill(root, `skill-${index}`, `INSTRUCTION-BODY-${index}`);
    const store = new SkillStore(SkillStore.projectSkillsDir(root), path.join(root, 'global'));
    const started = Date.now();
    const catalog = store.renderForPrompt([], { maxSkills: 8 });
    expect(store.list()).toHaveLength(200);
    expect(catalog).not.toContain('INSTRUCTION-BODY-');
    expect(catalog.length).toBeLessThan(3000);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('Skills v2 safety, identity, and anti-loop boundaries', () => {
  it('rejects reference traversal, escaped symlinks, and oversized references', () => {
    const root = project('references');
    const dir = markdownSkill(root, 'reference-skill');
    const references = path.join(dir, 'references');
    mkdirSync(references, { recursive: true });
    writeFileSync(path.join(references, 'ok.md'), 'safe reference');
    writeFileSync(path.join(root, 'outside.md'), 'outside');
    symlinkSync(path.join(root, 'outside.md'), path.join(references, 'escaped.md'));
    writeFileSync(path.join(references, 'large.md'), 'x'.repeat(128));
    const store = new SkillStore(SkillStore.projectSkillsDir(root), path.join(root, 'global'), [], { maxReferenceBytes: 64 });
    expect(store.readReference('reference-skill', '../outside.md').code).toBe('SKILL_REFERENCE_DENIED');
    expect(store.readReference('reference-skill', 'references/escaped.md').code).toBe('SKILL_REFERENCE_DENIED');
    expect(store.readReference('reference-skill', 'references/large.md').code).toBe('SKILL_REFERENCE_DENIED');
    expect(store.readReference('reference-skill', 'references/ok.md')).toEqual({ ok: true, content: 'safe reference' });
  });

  it('caps malformed/oversized directory skills individually', () => {
    const root = project('limits');
    const dir = path.join(root, '.hermes', 'skills', 'too-large');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: too-large\ndescription: too large\nversion: 1\n---\n${'x'.repeat(1024)}`);
    markdownSkill(root, 'healthy');
    const store = new SkillStore(SkillStore.projectSkillsDir(root), path.join(root, 'global'), [], { maxSkillMdBytes: 256, maxFrontmatterBytes: DEFAULT_SKILL_LIMITS.maxFrontmatterBytes });
    expect(store.list().map((skill) => skill.name)).toEqual(['healthy']);
    expect(store.diagnostics().some((diagnostic) => diagnostic.code === 'SKILL_TOO_LARGE')).toBe(true);
  });

  it('records exact checkpoint identities and stops resume on changed or missing instructions', () => {
    const root = project('checkpoint');
    const dir = markdownSkill(root, 'checkpoint-skill', 'version one');
    const store = new SkillStore(SkillStore.projectSkillsDir(root), path.join(root, 'global'));
    const identity = store.identity('checkpoint-skill')!;
    const guard = ProjectGuard.detect(root);
    const ledger = TaskLedger.create({ repoRoot: root, goal: 'resume with the same skill', project: guard.lock, mode: 'fast' });
    ledger.setSelectedSkills([identity]);
    expect(TaskLedger.load(root, ledger.data.taskId)?.data.selectedSkills).toEqual([identity]);
    const checkpointStore = new SpecialistCheckpointStore(root);
    checkpointStore.upsert(checkpoint({ root, skills: [identity] }));
    checkpointStore.close();

    // Re-open both durable inputs exactly as a resumed specialist process does.
    const restartedCheckpointStore = new SpecialistCheckpointStore(root);
    const restartedSkills = new SkillStore(SkillStore.projectSkillsDir(root), path.join(root, 'global'));
    expect(reconcileSpecialistSkillState(restartedCheckpointStore.get('logical-skills-v2'), restartedSkills)).toBe('SKILL_STATE_MATCH');

    writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: checkpoint-skill\ndescription: Build checkpoint-skill safely\nversion: 1\n---\n\nversion two\n`);
    expect(reconcileSpecialistSkillState(restartedCheckpointStore.get('logical-skills-v2'), restartedSkills)).toBe('SKILL_STATE_CHANGED');
    unlinkSync(path.join(dir, 'SKILL.md'));
    expect(reconcileSpecialistSkillState(restartedCheckpointStore.get('logical-skills-v2'), restartedSkills)).toBe('SKILL_STATE_MISSING');
    restartedCheckpointStore.close();
  });

  it('never executes bundled scripts and blocks repeated identical skill reads', async () => {
    const root = project('script-and-loop');
    const dir = markdownSkill(root, 'script-skill', 'read the instructions');
    mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    const marker = path.join(root, 'script-ran.txt');
    writeFileSync(path.join(dir, 'scripts', 'danger.mjs'), `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`);
    const store = new SkillStore(SkillStore.projectSkillsDir(root), path.join(root, 'global'));
    expect(store.get('script-skill')?.instructions).toContain('read the instructions');
    expect(existsSync(marker)).toBe(false);

    const guard = ProjectGuard.detect(root);
    const ledger = TaskLedger.create({ repoRoot: root, goal: 'g', project: guard.lock, mode: 'fast' });
    const executor = new Executor(guard, ledger, new PolicyEngine(false), new LoopDetector(), undefined, store);
    expect((await executor.execute({ tool: 'use_skill', params: { name: 'script-skill' }, reason: '', expected: '' })).result.ok).toBe(true);
    expect((await executor.execute({ tool: 'use_skill', params: { name: 'script-skill' }, reason: '', expected: '' })).result.ok).toBe(true);
    const repeated = await executor.execute({ tool: 'use_skill', params: { name: 'script-skill' }, reason: '', expected: '' });
    expect(repeated.result.ok).toBe(false);
    expect(repeated.result.output).toContain('SKILL_OPERATION_REPEATED');
    expect(existsSync(marker)).toBe(false);
  });
});
