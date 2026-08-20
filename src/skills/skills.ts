import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface Skill {
  name: string;
  description: string;
  instructions: string;
  createdBy: 'user' | 'agent';
  createdAt: string;
  aliases?: string[];
  keywords?: string[];
}

export interface SkillMatch {
  skill: Skill;
  score: number;
  reason: string;
}

export interface SkillResolutionResult {
  highConfidence: Skill[];
  suggestions: SkillMatch[];
  allMatches: SkillMatch[];
}

function normalizeToken(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function levenshtein(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix: number[][] = [];
  for (let i = 0; i <= bn; i++) matrix[i] = [i];
  for (let j = 0; j <= an; j++) matrix[0]![j] = j;
  for (let i = 1; i <= bn; i++) {
    for (let j = 1; j <= an; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i]![j] = matrix[i - 1]![j - 1]!;
      } else {
        matrix[i]![j] = Math.min(
          matrix[i - 1]![j - 1]! + 1,
          matrix[i]![j - 1]! + 1,
          matrix[i - 1]![j]! + 1,
        );
      }
    }
  }
  return matrix[bn]![an]!;
}

const STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were', 'will', 'with', 'using', 'use', 'how', 'do', 'can', 'please']);

export class SkillResolver {
  constructor(private readonly store: SkillStore) {}

  resolve(query: string): SkillResolutionResult {
    const skills = this.store.list();
    if (skills.length === 0) {
      return { highConfidence: [], suggestions: [], allMatches: [] };
    }

    const rawTokens = query.toLowerCase().split(/[\s,._\-:;!?/\\]+/).filter(Boolean);
    const queryTokens = rawTokens.map(normalizeToken).filter((t) => t.length > 1 && !STOP_WORDS.has(t));
    const normalizedQuery = normalizeToken(query);

    const matches: SkillMatch[] = [];

    for (const skill of skills) {
      const normName = normalizeToken(skill.name);
      const aliases = (skill.aliases ?? []).map(normalizeToken);
      const keywords = (skill.keywords ?? []).map(normalizeToken);
      const descTokens = skill.description.toLowerCase().split(/[\s,._\-:;!?/\\]+/).map(normalizeToken).filter(Boolean);

      // 1. Exact name or alias match
      if (normName === normalizedQuery || aliases.includes(normalizedQuery)) {
        matches.push({ skill, score: 1.0, reason: 'Exact name/alias match' });
        continue;
      }

      // Check if skill name or alias is contained in query as a full phrase or substring
      if (skill.name.length >= 3 && query.toLowerCase().includes(skill.name.toLowerCase())) {
        matches.push({ skill, score: 0.95, reason: `Skill name "${skill.name}" in task` });
        continue;
      }
      const matchingAlias = (skill.aliases ?? []).find((a) => a.length >= 3 && query.toLowerCase().includes(a.toLowerCase()));
      if (matchingAlias) {
        matches.push({ skill, score: 0.9, reason: `Alias "${matchingAlias}" in task` });
        continue;
      }

      // 2. Keyword & Token overlap
      let tokenScore = 0;
      let matchedTerms: string[] = [];

      for (const token of queryTokens) {
        if (normName.includes(token) || token.includes(normName)) {
          tokenScore += 0.4;
          matchedTerms.push(token);
        } else if (keywords.some((k) => k.includes(token) || token.includes(k))) {
          tokenScore += 0.3;
          matchedTerms.push(token);
        } else if (descTokens.includes(token)) {
          tokenScore += 0.15;
          matchedTerms.push(token);
        }
      }

      // 3. Fuzzy match / Levenshtein distance on skill name
      if (queryTokens.some((t) => t.length >= 4 && levenshtein(t, normName) <= 2)) {
        tokenScore = Math.max(tokenScore, 0.7);
        matchedTerms.push(`fuzzy:${skill.name}`);
      }

      if (tokenScore > 0) {
        const finalScore = Math.min(0.89, tokenScore);
        matches.push({
          skill,
          score: finalScore,
          reason: `Matched terms: ${[...new Set(matchedTerms)].join(', ')}`,
        });
      }
    }

    matches.sort((a, b) => b.score - a.score);

    const highConfidence = matches.filter((m) => m.score >= 0.75).map((m) => m.skill);
    const suggestions = matches.filter((m) => m.score >= 0.3 && m.score < 0.75);

    return {
      highConfidence,
      suggestions,
      allMatches: matches,
    };
  }
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
    const norm = normalizeToken(name);
    return this.list().find((s) => normalizeToken(s.name) === norm || (s.aliases ?? []).some((a) => normalizeToken(a) === norm));
  }

  resolver(): SkillResolver {
    return new SkillResolver(this);
  }

  create(input: {
    name: string;
    description: string;
    instructions: string;
    createdBy?: 'user' | 'agent';
    aliases?: string[];
    keywords?: string[];
  }): Skill {
    const name = input.name.trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-').slice(0, 60);
    if (!name) throw new Error('Skill name is required');
    if (!input.instructions.trim()) throw new Error('Skill instructions are required');
    const skill: Skill = {
      name,
      description: input.description.trim().slice(0, 300),
      instructions: input.instructions.trim(),
      createdBy: input.createdBy ?? 'agent',
      createdAt: new Date().toISOString(),
      aliases: input.aliases && input.aliases.length > 0 ? input.aliases.map((a) => a.trim().toLowerCase()).filter(Boolean) : undefined,
      keywords: input.keywords && input.keywords.length > 0 ? input.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean) : undefined,
    };
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(path.join(this.dir, `${name}.json`), JSON.stringify(skill, null, 2));
    return skill;
  }

  update(name: string, patch: { description?: string; instructions?: string; aliases?: string[]; keywords?: string[] }): Skill {
    const existing = this.get(name);
    if (!existing) throw new Error(`Unknown skill: ${name}`);
    if (patch.instructions !== undefined && !patch.instructions.trim()) {
      throw new Error('Skill instructions are required');
    }
    const skill: Skill = {
      ...existing,
      description: (patch.description ?? existing.description).trim().slice(0, 300),
      instructions: (patch.instructions ?? existing.instructions).trim(),
      aliases: patch.aliases !== undefined ? patch.aliases.map((a) => a.trim().toLowerCase()).filter(Boolean) : existing.aliases,
      keywords: patch.keywords !== undefined ? patch.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean) : existing.keywords,
    };
    writeFileSync(path.join(this.dir, `${existing.name}.json`), JSON.stringify(skill, null, 2));
    return skill;
  }

  remove(name: string): boolean {
    const existing = this.get(name);
    if (!existing) return false;
    const file = path.join(this.dir, `${existing.name}.json`);
    if (!existsSync(file)) return false;
    unlinkSync(file);
    return true;
  }

  renderForPrompt(activeSkillNames?: string[]): string {
    const skills = this.list();
    if (skills.length === 0) return '(no skills yet — you can create reusable skills with create_skill)';
    const activeSet = new Set(activeSkillNames?.map(normalizeToken) ?? []);
    return skills
      .map((s) => {
        const isActive = activeSet.has(normalizeToken(s.name));
        const aliasStr = s.aliases && s.aliases.length ? ` (aliases: ${s.aliases.join(', ')})` : '';
        return `- ${s.name}${aliasStr}: ${s.description}${isActive ? ' [ACTIVE IN CURRENT TASK]' : ''}`;
      })
      .join('\n');
  }
}
