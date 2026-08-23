import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { SkillStore } from '../src/skills/skills.js';

// Point the global layer at a temp dir for isolation.
const globalDir = mkdtempSync(path.join(tmpdir(), 'hermes-global-skills-'));

describe('layered skill store (project + global)', () => {
  it('saves project skills in .hermes/skills and global skills in the workspace layer', () => {
    const proj = mkdtempSync(path.join(tmpdir(), 'hermes-skill-proj-'));
    const store = SkillStore.forProject(proj);
    // Force this test's temp dir as the "global" layer regardless of real home.
    const scoped = new SkillStore(SkillStore.projectSkillsDir(proj), globalDir);

    const p = scoped.create({ name: 'proj-only', description: 'd', instructions: '1', scope: 'project' });
    expect(p.scope).toBeUndefined(); // not persisted on disk
    expect(existsSync(path.join(proj, '.hermes', 'skills', 'proj-only.json'))).toBe(true);

    const g = scoped.create({ name: 'shared-deploy', description: 'd', instructions: '1', scope: 'global' });
    expect(g.name).toBe('shared-deploy');
    expect(existsSync(path.join(globalDir, 'shared-deploy.json'))).toBe(true);

    const names = scoped.list().map((s) => s.name).sort();
    expect(names).toEqual(['proj-only', 'shared-deploy']);
    const scopes = Object.fromEntries(scoped.list().map((s) => [s.name, s.scope]));
    expect(scopes['proj-only']).toBe('project');
    expect(scopes['shared-deploy']).toBe('global');
  });

  it('lets project skills override same-name globals without touching them', () => {
    const proj = mkdtempSync(path.join(tmpdir(), 'hermes-skill-ovr-'));
    writeFileSync(path.join(globalDir, 'deploy.json'), JSON.stringify({
      name: 'deploy', description: 'global version', instructions: 'global steps',
      createdBy: 'user', createdAt: new Date().toISOString(),
    }));
    const scoped = new SkillStore(SkillStore.projectSkillsDir(proj), globalDir);

    scoped.create({ name: 'deploy', description: 'project version', instructions: 'project steps' });

    const got = scoped.get('deploy')!;
    expect(got.description).toBe('project version');
    expect(got.scope).toBe('project');
    // Global file untouched.
    const raw = JSON.parse(readFileSync(path.join(globalDir, 'deploy.json'), 'utf8')) as { description: string };
    expect(raw.description).toBe('global version');

    // Removing the project copy reveals the global again.
    expect(scoped.remove('deploy')).toBe(true);
    const back = scoped.get('deploy')!;
    expect(back.scope).toBe('global');
    expect(back.instructions).toBe('global steps');
  });

  it('removes global skills when no project copy exists', () => {
    const proj = mkdtempSync(path.join(tmpdir(), 'hermes-skill-rm-'));
    const scoped = new SkillStore(SkillStore.projectSkillsDir(proj), globalDir);
    scoped.create({ name: 'only-global', description: 'd', instructions: 'i', scope: 'global' });
    expect(scoped.remove('only-global')).toBe(true);
    expect(existsSync(path.join(globalDir, 'only-global.json'))).toBe(false);
    expect(scoped.get('only-global')).toBeUndefined();
  });
});
