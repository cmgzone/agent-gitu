import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface Skill {
  name: string;
  description: string;
  instructions: string;
  createdBy: 'user' | 'agent';
  createdAt: string;
}

export class SkillStore {
  constructor(private readonly dir: string) {}

  static forProject(repoRoot: string): SkillStore {
    return new SkillStore(path.join(repoRoot, '.hermes', 'skills'));
  }

  list(): Skill[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          return JSON.parse(readFileSync(path.join(this.dir, f), 'utf8')) as Skill;
        } catch {
          return undefined;
        }
      })
      .filter((s): s is Skill => Boolean(s && s.name));
  }

  get(name: string): Skill | undefined {
    return this.list().find((s) => s.name === name);
  }

  create(input: { name: string; description: string; instructions: string; createdBy?: 'user' | 'agent' }): Skill {
    const name = input.name.trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-').slice(0, 60);
    if (!name) throw new Error('Skill name is required');
    if (!input.instructions.trim()) throw new Error('Skill instructions are required');
    const skill: Skill = {
      name,
      description: input.description.trim().slice(0, 300),
      instructions: input.instructions.trim(),
      createdBy: input.createdBy ?? 'agent',
      createdAt: new Date().toISOString(),
    };
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(path.join(this.dir, `${name}.json`), JSON.stringify(skill, null, 2));
    return skill;
  }

  remove(name: string): boolean {
    const file = path.join(this.dir, `${name}.json`);
    if (!existsSync(file)) return false;
    unlinkSync(file);
    return true;
  }

  renderForPrompt(): string {
    const skills = this.list();
    if (skills.length === 0) return '(no skills yet — you can create reusable skills with create_skill)';
    return skills.map((s) => `- ${s.name}: ${s.description}`).join('\n');
  }
}
