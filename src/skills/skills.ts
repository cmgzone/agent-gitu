import { createHash } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, realpathSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { builtinSkills } from './builtin.js';
import { ensureGituHome } from '../workspace/home.js';

export type SkillScope = 'global' | 'project' | 'builtin';
export type SkillRisk = 'low' | 'medium' | 'high';
export type SkillFormat = 'json' | 'skill-md' | 'builtin';

/** Portable, authored metadata. Runtime scope and source paths are never persisted here. */
export interface SkillManifest {
  name: string;
  description: string;
  version: string | number;
  aliases?: string[];
  keywords?: string[];
  specialists?: string[];
  requires?: { tools?: string[]; capabilities?: string[] };
  risk?: SkillRisk;
  createdBy?: 'user' | 'agent';
  createdAt?: string;
}

export interface SkillIdentity {
  name: string;
  version: string;
  contentHash: string;
  scope: SkillScope;
}

export interface Skill {
  name: string;
  description: string;
  /** Empty for a discovered-but-not-loaded SKILL.md entry. */
  instructions: string;
  createdBy: 'user' | 'agent';
  createdAt: string;
  aliases?: string[];
  keywords?: string[];
  specialists?: string[];
  requires?: { tools?: string[]; capabilities?: string[] };
  risk?: SkillRisk;
  version?: string | number;
  /** Which layer this entry lives in (set on read; persisted value ignored). */
  scope?: SkillScope;
  /** Source details are runtime-only and deliberately not serialized by create/update. */
  sourcePath?: string;
  sourceRoot?: string;
  format?: SkillFormat;
  loaded?: boolean;
  contentHash?: string;
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

export interface SkillSelectionContext {
  task?: string;
  planStep?: string;
  repositorySignals?: string[];
  fileExtensions?: string[];
  specialist?: string;
  availableTools?: Iterable<string>;
  availableCapabilities?: Iterable<string>;
  activeSkills?: Iterable<string>;
  priorUsedSkills?: Iterable<string>;
}

export interface SkillRequirementResult {
  ok: boolean;
  code?: 'SKILL_REQUIREMENTS_UNMET';
  missingTools: string[];
  missingCapabilities: string[];
}

export interface SkillActivationResult {
  ok: boolean;
  skill?: Skill;
  identity?: SkillIdentity;
  code?: 'SKILL_REQUIREMENTS_UNMET';
  message?: string;
}

export type SkillDiagnosticCode = 'SKILL_INVALID_FRONTMATTER' | 'SKILL_TOO_LARGE' | 'SKILL_DUPLICATE' | 'SKILL_REFERENCE_DENIED' | 'SKILL_SCAN_LIMIT';

export interface SkillDiagnostic {
  code: SkillDiagnosticCode;
  path: string;
  message: string;
  scope?: Exclude<SkillScope, 'builtin'>;
}

export interface SkillLimits {
  maxSkillCount: number;
  maxSkillMdBytes: number;
  maxJsonBytes: number;
  maxFrontmatterBytes: number;
  maxReferenceBytes: number;
  maxLoadedSkillsPerTask: number;
  maxLoadedInstructionChars: number;
  maxAliases: number;
  maxKeywords: number;
}

export const DEFAULT_SKILL_LIMITS: SkillLimits = {
  maxSkillCount: 400,
  maxSkillMdBytes: 128 * 1024,
  maxJsonBytes: 128 * 1024,
  maxFrontmatterBytes: 16 * 1024,
  maxReferenceBytes: 96 * 1024,
  maxLoadedSkillsPerTask: 6,
  maxLoadedInstructionChars: 24_000,
  maxAliases: 32,
  maxKeywords: 48,
};

const TEXT_REFERENCE_EXTENSIONS = new Set(['.md', '.txt', '.json', '.yml', '.yaml', '.toml', '.ini', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.css', '.html', '.xml', '.py', '.sh']);

function normalizeToken(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeName(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function normalizeStrings(value: unknown, cap: number): string[] | undefined {
  const items = Array.isArray(value) ? value : typeof value === 'string' && value.trim() ? [value] : [];
  const normalized = [...new Set(items.map((item) => String(item).trim().toLowerCase()).filter(Boolean))].slice(0, cap);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeRequirements(value: unknown, limits: SkillLimits): SkillManifest['requires'] | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const tools = normalizeStrings(source['tools'], limits.maxAliases);
  const capabilities = normalizeStrings(source['capabilities'], limits.maxAliases);
  return tools || capabilities ? { ...(tools ? { tools } : {}), ...(capabilities ? { capabilities } : {}) } : undefined;
}

function normalizeManifest(raw: Record<string, unknown>, limits: SkillLimits): SkillManifest | undefined {
  const name = normalizeName(raw['name']);
  const description = String(raw['description'] ?? '').trim().replace(/\s+/g, ' ').slice(0, 500);
  if (!name || !description) return undefined;
  const version = typeof raw['version'] === 'number' || typeof raw['version'] === 'string' ? raw['version'] : '1';
  const createdBy = raw['createdBy'] === 'agent' ? 'agent' : raw['createdBy'] === 'user' ? 'user' : undefined;
  const risk = raw['risk'] === 'low' || raw['risk'] === 'medium' || raw['risk'] === 'high' ? raw['risk'] : undefined;
  const aliases = normalizeStrings(raw['aliases'], limits.maxAliases);
  const keywords = normalizeStrings(raw['keywords'], limits.maxKeywords);
  const specialists = normalizeStrings(raw['specialists'], limits.maxAliases);
  const requires = normalizeRequirements(raw['requires'], limits);
  return {
    name,
    description,
    version,
    ...(aliases ? { aliases } : {}),
    ...(keywords ? { keywords } : {}),
    ...(specialists ? { specialists } : {}),
    ...(requires ? { requires } : {}),
    ...(risk ? { risk } : {}),
    ...(createdBy ? { createdBy } : {}),
    ...(typeof raw['createdAt'] === 'string' && raw['createdAt'].trim() ? { createdAt: raw['createdAt'].trim().slice(0, 80) } : {}),
  };
}

function skillFromManifest(manifest: SkillManifest, input: { scope: SkillScope; format: SkillFormat; sourcePath?: string; sourceRoot?: string; instructions?: string; loaded?: boolean }): Skill {
  const instructions = input.instructions ?? '';
  const skill: Skill = {
    name: manifest.name,
    description: manifest.description,
    instructions,
    createdBy: manifest.createdBy ?? 'user',
    createdAt: manifest.createdAt ?? '',
    version: manifest.version,
    aliases: manifest.aliases,
    keywords: manifest.keywords,
    specialists: manifest.specialists,
    requires: manifest.requires,
    risk: manifest.risk,
    scope: input.scope,
    format: input.format,
    sourcePath: input.sourcePath,
    sourceRoot: input.sourceRoot,
    loaded: input.loaded ?? true,
  };
  if (skill.loaded) skill.contentHash = contentHashFor(skill);
  return skill;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function manifestFor(skill: Skill): SkillManifest {
  return {
    name: skill.name,
    description: skill.description,
    version: skill.version ?? '1',
    ...(skill.aliases?.length ? { aliases: skill.aliases } : {}),
    ...(skill.keywords?.length ? { keywords: skill.keywords } : {}),
    ...(skill.specialists?.length ? { specialists: skill.specialists } : {}),
    ...(skill.requires ? { requires: skill.requires } : {}),
    ...(skill.risk ? { risk: skill.risk } : {}),
    ...(skill.createdBy ? { createdBy: skill.createdBy } : {}),
    ...(skill.createdAt ? { createdAt: skill.createdAt } : {}),
  };
}

export function contentHashFor(skill: Pick<Skill, 'name' | 'description' | 'version' | 'aliases' | 'keywords' | 'specialists' | 'requires' | 'risk' | 'createdBy' | 'createdAt' | 'instructions'>): string {
  return createHash('sha256').update(`${stableJson(manifestFor(skill as Skill))}\n${skill.instructions.replace(/\r\n/g, '\n')}`).digest('hex');
}

export function skillIdentity(skill: Skill): SkillIdentity {
  if (!skill.loaded) throw new Error(`Skill "${skill.name}" must be loaded before its identity can be used.`);
  return { name: skill.name, version: String(skill.version ?? '1'), contentHash: skill.contentHash ?? contentHashFor(skill), scope: skill.scope ?? 'project' };
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
      matrix[i]![j] = b.charAt(i - 1) === a.charAt(j - 1)
        ? matrix[i - 1]![j - 1]!
        : Math.min(matrix[i - 1]![j - 1]! + 1, matrix[i - 1]![j]! + 1, matrix[i]![j - 1]! + 1);
    }
  }
  return matrix[bn]![an]!;
}

const STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were', 'will', 'with', 'using', 'use', 'how', 'do', 'can', 'please']);

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word containment: a skill named "test" must NOT fire on "latest". */
function containsAsWord(haystack: string, needle: string): boolean {
  if (needle.length < 3 || haystack.length < needle.length) return false;
  return new RegExp(`(^|[^a-z0-9_-])${escapeRegex(needle)}($|[^a-z0-9_-])`, 'i').test(haystack);
}

function normalizedSet(values: Iterable<string> | undefined): Set<string> {
  return new Set(values ? [...values].map((value) => String(value).trim().toLowerCase()).filter(Boolean) : []);
}

function compatibleWithSpecialist(skill: Skill, specialist: string | undefined): boolean {
  if (!specialist || !skill.specialists || skill.specialists.length === 0) return true;
  return skill.specialists.map((value) => value.toLowerCase()).includes(specialist.toLowerCase());
}

function parseInlineOrScalar(value: string): string | string[] {
  const clean = value.trim().replace(/^['"]|['"]$/g, '');
  if (clean.startsWith('[') && clean.endsWith(']')) return clean.slice(1, -1).split(',').map((item) => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
  return clean;
}

/** Intentionally small YAML subset for a bounded, dependency-free manifest parser. */
function parseFrontmatterYaml(text: string): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  let section: string | undefined;
  let nested: string | undefined;
  for (const rawLine of text.replace(/\r\n/g, '\n').split('\n')) {
    if (!rawLine.trim() || rawLine.trimStart().startsWith('#')) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trim();
    const item = /^-\s+(.+)$/.exec(line);
    if (item) {
      if (section && nested) {
        const parent = (out[section] ??= {}) as Record<string, unknown>;
        const list = Array.isArray(parent[nested]) ? parent[nested] as string[] : [];
        list.push(String(parseInlineOrScalar(item[1]!)));
        parent[nested] = list;
      } else if (section) {
        const list = Array.isArray(out[section]) ? out[section] as string[] : [];
        list.push(String(parseInlineOrScalar(item[1]!)));
        out[section] = list;
      } else return undefined;
      continue;
    }
    const pair = /^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/.exec(line);
    if (!pair) return undefined;
    const key = pair[1];
    if (!key) return undefined;
    const rawValue = pair[2] ?? '';
    if (indent === 0) {
      section = key;
      nested = undefined;
      out[key] = rawValue ? parseInlineOrScalar(rawValue) : key === 'requires' ? {} : [];
    } else if (section === 'requires') {
      nested = key;
      const parent = out['requires'] as Record<string, unknown>;
      parent[key] = rawValue ? parseInlineOrScalar(rawValue) : [];
    } else return undefined;
  }
  return out;
}

function frontmatterFromPrefix(prefix: string): { raw: Record<string, unknown>; bodyOffset: number } | undefined {
  const normalized = prefix.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) return undefined;
  const end = normalized.indexOf('\n---\n', 4);
  if (end < 0) return undefined;
  const raw = parseFrontmatterYaml(normalized.slice(4, end));
  return raw ? { raw, bodyOffset: end + 5 } : undefined;
}

function readPrefix(file: string, bytes: number): string {
  const fd = openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const count = readSync(fd, buffer, 0, bytes, 0);
    return buffer.subarray(0, count).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

function serializeFrontmatter(manifest: SkillManifest): string {
  const list = (values: string[] | undefined): string | undefined => values?.length ? `[${values.map((value) => JSON.stringify(value)).join(', ')}]` : undefined;
  const lines = [
    `name: ${manifest.name}`,
    `description: ${JSON.stringify(manifest.description)}`,
    `version: ${JSON.stringify(String(manifest.version))}`,
    list(manifest.aliases) ? `aliases: ${list(manifest.aliases)}` : undefined,
    list(manifest.keywords) ? `keywords: ${list(manifest.keywords)}` : undefined,
    list(manifest.specialists) ? `specialists: ${list(manifest.specialists)}` : undefined,
    manifest.requires?.tools?.length || manifest.requires?.capabilities?.length ? 'requires:' : undefined,
    manifest.requires?.tools?.length ? `  tools: ${list(manifest.requires.tools)}` : undefined,
    manifest.requires?.capabilities?.length ? `  capabilities: ${list(manifest.requires.capabilities)}` : undefined,
    manifest.risk ? `risk: ${manifest.risk}` : undefined,
    manifest.createdBy ? `createdBy: ${manifest.createdBy}` : undefined,
    manifest.createdAt ? `createdAt: ${JSON.stringify(manifest.createdAt)}` : undefined,
  ].filter((line): line is string => Boolean(line));
  return `---\n${lines.join('\n')}\n---\n`;
}

function toLegacyRecord(skill: Skill): Record<string, unknown> {
  return {
    name: skill.name,
    description: skill.description,
    instructions: skill.instructions,
    createdBy: skill.createdBy,
    createdAt: skill.createdAt,
    ...(skill.version !== undefined ? { version: skill.version } : {}),
    ...(skill.aliases?.length ? { aliases: skill.aliases } : {}),
    ...(skill.keywords?.length ? { keywords: skill.keywords } : {}),
    ...(skill.specialists?.length ? { specialists: skill.specialists } : {}),
    ...(skill.requires ? { requires: skill.requires } : {}),
    ...(skill.risk ? { risk: skill.risk } : {}),
  };
}

export class SkillResolver {
  constructor(private readonly store: SkillStore) {}

  resolve(query: string, context: SkillSelectionContext = {}): SkillResolutionResult {
    const skills = this.store.list();
    if (skills.length === 0) return { highConfidence: [], suggestions: [], allMatches: [] };
    const combinedQuery = [query, context.task, context.planStep, ...(context.repositorySignals ?? []), ...(context.fileExtensions ?? [])].filter(Boolean).join(' ');
    const queryTokens = combinedQuery.toLowerCase().split(/[\s,._\-:;!?/\\]+/).filter(Boolean).map(normalizeToken).filter((token) => token.length > 1 && !STOP_WORDS.has(token));
    const normalizedQuery = normalizeToken(query);
    const active = normalizedSet(context.activeSkills);
    const used = normalizedSet(context.priorUsedSkills);
    const matches: SkillMatch[] = [];

    for (const skill of skills) {
      const normName = normalizeToken(skill.name);
      const aliases = (skill.aliases ?? []).map(normalizeToken);
      const keywords = (skill.keywords ?? []).map(normalizeToken);
      const descTokens = skill.description.toLowerCase().split(/[\s,._\-:;!?/\\]+/).map(normalizeToken).filter(Boolean);
      let score = 0;
      let reason = '';
      if (normName === normalizedQuery || aliases.includes(normalizedQuery)) {
        score = 1;
        reason = 'Exact name/alias match';
      } else if (containsAsWord(query, skill.name)) {
        score = 0.95;
        reason = `Skill name "${skill.name}" in task`;
      } else {
        const matchingAlias = (skill.aliases ?? []).find((alias) => containsAsWord(query, alias));
        if (matchingAlias) {
          score = 0.9;
          reason = `Alias "${matchingAlias}" in task`;
        } else {
          let tokenScore = 0;
          const terms: string[] = [];
          for (const token of queryTokens) {
            if (normName.includes(token) || token.includes(normName)) { tokenScore += 0.4; terms.push(token); }
            else if (keywords.some((keyword) => keyword.includes(token) || token.includes(keyword))) { tokenScore += 0.3; terms.push(token); }
            else if (descTokens.includes(token)) { tokenScore += 0.15; terms.push(token); }
          }
          if (queryTokens.some((token) => token.length >= 4 && levenshtein(token, normName) <= 2)) { tokenScore = Math.max(tokenScore, 0.7); terms.push(`fuzzy:${skill.name}`); }
          if (tokenScore === 0) continue;
          score = Math.min(0.89, tokenScore);
          reason = `Matched terms: ${[...new Set(terms)].join(', ')}`;
        }
      }
      const contextReasons: string[] = [];
      if (context.specialist) {
        if (compatibleWithSpecialist(skill, context.specialist)) {
          if (skill.specialists?.length) { score += 0.14; contextReasons.push(`compatible with ${context.specialist}`); }
        } else { score -= 0.5; contextReasons.push(`incompatible with ${context.specialist}`); }
      }
      if (active.has(skill.name.toLowerCase())) { score += 0.05; contextReasons.push('already active'); }
      if (used.has(skill.name.toLowerCase())) { score += 0.03; contextReasons.push('used earlier in job'); }
      if (!this.store.checkRequirements(skill, context).ok) { score -= 0.25; contextReasons.push('requirements unavailable'); }
      matches.push({ skill, score: Math.max(0, Math.min(1, score)), reason: `${reason}${contextReasons.length ? `; ${contextReasons.join(', ')}` : ''}` });
    }
    matches.sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name));
    return {
      highConfidence: matches.filter((match) => match.score >= 0.75 && compatibleWithSpecialist(match.skill, context.specialist) && this.store.checkRequirements(match.skill, context).ok).map((match) => match.skill),
      suggestions: matches.filter((match) => match.score >= 0.3 && match.score < 0.75),
      allMatches: matches,
    };
  }
}

/** `list()` discovers metadata only; `get()`/`activate()` are the full-body load boundary. */
export class SkillStore {
  private readonly limits: SkillLimits;
  private lastDiagnostics: SkillDiagnostic[] = [];

  constructor(
    private readonly dir: string,
    private readonly globalDir?: string,
    private readonly builtinSkillEntries: Skill[] = [],
    limits: Partial<SkillLimits> = {},
  ) { this.limits = { ...DEFAULT_SKILL_LIMITS, ...limits }; }

  static projectSkillsDir(repoRoot: string): string { return path.join(repoRoot, '.hermes', 'skills'); }
  static forProject(repoRoot: string): SkillStore { return new SkillStore(SkillStore.projectSkillsDir(repoRoot), SkillStore.globalSkillsDir(), builtinSkills()); }
  static globalSkillsDir(): string { return path.join(ensureGituHome().root, 'Skills'); }
  diagnostics(): SkillDiagnostic[] { return [...this.lastDiagnostics]; }
  private diagnostic(code: SkillDiagnosticCode, file: string, message: string, scope?: Exclude<SkillScope, 'builtin'>): void { this.lastDiagnostics.push({ code, path: file, message, scope }); }

  private discoverJson(file: string, scope: Exclude<SkillScope, 'builtin'>): Skill | undefined {
    try {
      if (statSync(file).size > this.limits.maxJsonBytes) { this.diagnostic('SKILL_TOO_LARGE', file, `JSON skill exceeds ${this.limits.maxJsonBytes} bytes.`, scope); return undefined; }
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
      const manifest = normalizeManifest(raw, this.limits);
      const instructions = typeof raw['instructions'] === 'string' ? raw['instructions'].trim() : '';
      if (!manifest || !instructions) { this.diagnostic('SKILL_INVALID_FRONTMATTER', file, 'JSON skill requires name, description, and instructions.', scope); return undefined; }
      return skillFromManifest(manifest, { scope, format: 'json', sourcePath: file, sourceRoot: path.dirname(file), instructions, loaded: true });
    } catch { this.diagnostic('SKILL_INVALID_FRONTMATTER', file, 'JSON skill could not be parsed.', scope); return undefined; }
  }

  private discoverMarkdown(file: string, scope: Exclude<SkillScope, 'builtin'>): Skill | undefined {
    try {
      const size = statSync(file).size;
      if (size > this.limits.maxSkillMdBytes) { this.diagnostic('SKILL_TOO_LARGE', file, `SKILL.md exceeds ${this.limits.maxSkillMdBytes} bytes.`, scope); return undefined; }
      const frontmatter = frontmatterFromPrefix(readPrefix(file, Math.min(size, this.limits.maxFrontmatterBytes)));
      if (!frontmatter) { this.diagnostic('SKILL_INVALID_FRONTMATTER', file, 'SKILL.md must start with bounded YAML frontmatter.', scope); return undefined; }
      const manifest = normalizeManifest(frontmatter.raw, this.limits);
      if (!manifest) { this.diagnostic('SKILL_INVALID_FRONTMATTER', file, 'SKILL.md frontmatter requires name and description.', scope); return undefined; }
      return skillFromManifest(manifest, { scope, format: 'skill-md', sourcePath: file, sourceRoot: path.dirname(file), instructions: '', loaded: false });
    } catch { return undefined; }
  }

  private discoverLayer(dir: string | undefined, scope: Exclude<SkillScope, 'builtin'>): Skill[] {
    if (!dir || !existsSync(dir)) return [];
    let entries: Array<{ name: string; isFile(): boolean; isDirectory(): boolean }>;
    try { entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)); } catch { return []; }
    const candidates = entries.filter((entry) => (entry.isFile() && entry.name.endsWith('.json')) || entry.isDirectory()).slice(0, this.limits.maxSkillCount);
    if (entries.length > candidates.length) this.diagnostic('SKILL_SCAN_LIMIT', dir, `Only the first ${this.limits.maxSkillCount} skill entries were scanned.`, scope);
    const json = new Map<string, Skill>();
    const markdown = new Map<string, Skill>();
    for (const entry of candidates) {
      if (entry.isFile() && entry.name.endsWith('.json')) { const skill = this.discoverJson(path.join(dir, entry.name), scope); if (skill) json.set(normalizeToken(skill.name), skill); }
      if (entry.isDirectory()) { const skill = this.discoverMarkdown(path.join(dir, entry.name, 'SKILL.md'), scope); if (skill) markdown.set(normalizeToken(skill.name), skill); }
    }
    for (const [name, markdownSkill] of markdown) {
      const jsonSkill = json.get(name);
      if (jsonSkill) this.diagnostic('SKILL_DUPLICATE', markdownSkill.sourcePath ?? dir, `SKILL.md for "${markdownSkill.name}" overrides ${path.basename(jsonSkill.sourcePath ?? 'JSON skill')}.`, scope);
      json.set(name, markdownSkill);
    }
    return [...json.values()];
  }

  list(): Skill[] {
    this.lastDiagnostics = [];
    const builtins = this.builtinSkillEntries.map((skill) => ({ ...skill, scope: 'builtin' as const, format: 'builtin' as const, loaded: true, contentHash: contentHashFor(skill) }));
    const globals = this.discoverLayer(this.globalDir, 'global');
    const project = this.discoverLayer(this.dir, 'project');
    const byName = new Map<string, Skill>();
    for (const skill of builtins) byName.set(normalizeToken(skill.name), skill);
    for (const skill of globals) byName.set(normalizeToken(skill.name), skill);
    for (const skill of project) byName.set(normalizeToken(skill.name), skill);
    return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  private loadMarkdown(metadata: Skill): Skill | undefined {
    if (!metadata.sourcePath || !existsSync(metadata.sourcePath)) return undefined;
    try {
      if (statSync(metadata.sourcePath).size > this.limits.maxSkillMdBytes) return undefined;
      const raw = readFileSync(metadata.sourcePath, 'utf8');
      const frontmatter = frontmatterFromPrefix(raw);
      const manifest = frontmatter ? normalizeManifest(frontmatter.raw, this.limits) : undefined;
      const body = frontmatter ? raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').slice(frontmatter.bodyOffset).trim() : '';
      if (!manifest || !body) return undefined;
      return skillFromManifest(manifest, { scope: metadata.scope ?? 'project', format: 'skill-md', sourcePath: metadata.sourcePath, sourceRoot: metadata.sourceRoot, instructions: body, loaded: true });
    } catch { return undefined; }
  }

  get(name: string): Skill | undefined {
    const norm = normalizeToken(name);
    const metadata = this.list().find((skill) => normalizeToken(skill.name) === norm || (skill.aliases ?? []).some((alias) => normalizeToken(alias) === norm));
    if (!metadata) return undefined;
    return metadata.format === 'skill-md' && !metadata.loaded ? this.loadMarkdown(metadata) : metadata;
  }

  resolver(): SkillResolver { return new SkillResolver(this); }

  checkRequirements(skill: Skill, context: SkillSelectionContext = {}): SkillRequirementResult {
    const availableTools = normalizedSet(context.availableTools);
    const availableCapabilities = normalizedSet(context.availableCapabilities);
    const requiredTools = skill.requires?.tools ?? [];
    const requiredCapabilities = skill.requires?.capabilities ?? [];
    // No inventory means the runtime has not proven the requirement exists.
    // That is deliberately different from an explicit empty inventory.
    const missingTools = context.availableTools === undefined ? [...requiredTools] : requiredTools.filter((tool) => !availableTools.has(tool.toLowerCase()));
    const missingCapabilities = context.availableCapabilities === undefined ? [...requiredCapabilities] : requiredCapabilities.filter((capability) => !availableCapabilities.has(capability.toLowerCase()));
    return { ok: missingTools.length === 0 && missingCapabilities.length === 0, ...(missingTools.length || missingCapabilities.length ? { code: 'SKILL_REQUIREMENTS_UNMET' as const } : {}), missingTools, missingCapabilities };
  }

  activate(name: string, context: SkillSelectionContext = {}): SkillActivationResult {
    const skill = this.get(name);
    if (!skill) return { ok: false, message: `Unknown skill: ${name}` };
    const requirements = this.checkRequirements(skill, context);
    if (!requirements.ok) {
      const missing = [...requirements.missingTools.map((tool) => `tool:${tool}`), ...requirements.missingCapabilities.map((capability) => `capability:${capability}`)].join(', ');
      return { ok: false, code: 'SKILL_REQUIREMENTS_UNMET', message: `SKILL_REQUIREMENTS_UNMET: ${skill.name} requires ${missing}.` };
    }
    return { ok: true, skill, identity: skillIdentity(skill) };
  }

  identity(name: string): SkillIdentity | undefined { const skill = this.get(name); return skill ? skillIdentity(skill) : undefined; }

  create(input: { name: string; description: string; instructions: string; createdBy?: 'user' | 'agent'; aliases?: string[]; keywords?: string[]; specialists?: string[]; requires?: SkillManifest['requires']; risk?: SkillRisk; version?: string | number; scope?: 'global' | 'project' }): Skill {
    const name = normalizeName(input.name);
    if (!name) throw new Error('Skill name is required');
    if (!input.instructions.trim()) throw new Error('Skill instructions are required');
    const manifest = normalizeManifest({ name, description: input.description, version: input.version ?? '1', aliases: input.aliases, keywords: input.keywords, specialists: input.specialists, requires: input.requires, risk: input.risk, createdBy: input.createdBy ?? 'agent', createdAt: new Date().toISOString() }, this.limits);
    if (!manifest) throw new Error('Skill name and description are required');
    const skill = skillFromManifest(manifest, { scope: input.scope ?? 'project', format: 'json', instructions: input.instructions.trim(), loaded: true });
    const targetDir = input.scope === 'global' ? (this.globalDir ?? SkillStore.globalSkillsDir()) : this.dir;
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(path.join(targetDir, `${name}.json`), JSON.stringify(toLegacyRecord(skill), null, 2));
    const { scope: _scope, format: _format, sourcePath: _path, sourceRoot: _root, loaded: _loaded, contentHash: _hash, ...legacy } = skill;
    return legacy;
  }

  update(name: string, patch: { description?: string; instructions?: string; aliases?: string[]; keywords?: string[] }): Skill {
    const existing = this.get(name);
    if (!existing) throw new Error(`Unknown skill: ${name}`);
    if (patch.instructions !== undefined && !patch.instructions.trim()) throw new Error('Skill instructions are required');
    const skill: Skill = { ...existing, description: (patch.description ?? existing.description).trim().slice(0, 500), instructions: (patch.instructions ?? existing.instructions).trim(), aliases: patch.aliases !== undefined ? normalizeStrings(patch.aliases, this.limits.maxAliases) : existing.aliases, keywords: patch.keywords !== undefined ? normalizeStrings(patch.keywords, this.limits.maxKeywords) : existing.keywords, loaded: true };
    skill.contentHash = contentHashFor(skill);
    const target = existing.sourcePath ?? path.join(existing.scope === 'global' ? (this.globalDir ?? this.dir) : this.dir, `${existing.name}.json`);
    mkdirSync(path.dirname(target), { recursive: true });
    if (existing.format === 'skill-md') writeFileSync(target, `${serializeFrontmatter(manifestFor(skill))}\n${skill.instructions}\n`);
    else writeFileSync(target, JSON.stringify(toLegacyRecord(skill), null, 2));
    return skill;
  }

  remove(name: string): boolean {
    const existing = this.get(name);
    if (!existing || existing.scope === 'builtin' || !existing.sourcePath || !existsSync(existing.sourcePath)) return false;
    unlinkSync(existing.sourcePath);
    return true;
  }

  readReference(name: string, requestedPath: string): { ok: true; content: string } | { ok: false; code: 'SKILL_REFERENCE_DENIED'; message: string } {
    const skill = this.get(name);
    if (!skill?.sourceRoot || skill.format !== 'skill-md') return { ok: false, code: 'SKILL_REFERENCE_DENIED', message: 'References are available only to directory SKILL.md skills.' };
    const normalized = requestedPath.replace(/\\/g, '/').trim();
    if (!normalized || path.isAbsolute(normalized) || normalized.split('/').includes('..')) return { ok: false, code: 'SKILL_REFERENCE_DENIED', message: 'Reference path must be relative and remain inside the skill directory.' };
    if (!normalized.startsWith('references/')) return { ok: false, code: 'SKILL_REFERENCE_DENIED', message: 'Only files under references/ may be loaded with use_skill_reference.' };
    try {
      const root = realpathSync(skill.sourceRoot);
      const resolved = realpathSync(path.resolve(root, normalized));
      const relative = path.relative(root, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) return { ok: false, code: 'SKILL_REFERENCE_DENIED', message: 'Reference resolves outside the skill directory.' };
      if (!TEXT_REFERENCE_EXTENSIONS.has(path.extname(resolved).toLowerCase())) return { ok: false, code: 'SKILL_REFERENCE_DENIED', message: 'Reference file type is not approved for text loading.' };
      if (statSync(resolved).size > this.limits.maxReferenceBytes) return { ok: false, code: 'SKILL_REFERENCE_DENIED', message: `Reference exceeds ${this.limits.maxReferenceBytes} bytes.` };
      return { ok: true, content: readFileSync(resolved, 'utf8') };
    } catch { return { ok: false, code: 'SKILL_REFERENCE_DENIED', message: 'Reference does not exist or cannot be safely resolved.' }; }
  }

  renderForPrompt(activeSkillNames?: string[], opts: { maxSkills?: number; descriptionMaxChars?: number } = {}): string {
    const skills = this.list();
    if (skills.length === 0) return '(no skills yet — you can create reusable skills with create_skill)';
    const activeSet = new Set(activeSkillNames?.map(normalizeToken) ?? []);
    const maxSkills = Math.max(1, opts.maxSkills ?? 8);
    const descriptionMaxChars = Math.max(40, opts.descriptionMaxChars ?? 180);
    const ordered = [...skills.filter((skill) => activeSet.has(normalizeToken(skill.name))), ...skills.filter((skill) => !activeSet.has(normalizeToken(skill.name)))];
    const rendered = ordered.slice(0, maxSkills).map((skill) => {
      const alias = skill.aliases?.length ? ` (aliases: ${skill.aliases.slice(0, 3).join(', ')})` : '';
      const description = skill.description.length > descriptionMaxChars ? `${skill.description.slice(0, descriptionMaxChars - 1)}…` : skill.description;
      const specialists = skill.specialists?.length ? `; specialists: ${skill.specialists.join(', ')}` : '';
      const active = activeSet.has(normalizeToken(skill.name));
      return `- ${skill.name}@${String(skill.version ?? '1')}${alias}\n  ${description}\n  scope: ${skill.scope ?? 'project'}${specialists}; status: ${active ? 'active [ACTIVE IN CURRENT TASK]' : 'available'}`;
    }).join('\n');
    const hidden = Math.max(0, ordered.length - maxSkills);
    return hidden > 0 ? `${rendered}\n- … ${hidden} more skill(s) available via list_skills` : rendered;
  }
}

/** Small durable contract for active skills; never call this during discovery. */
export function renderSkillContract(skill: Pick<Skill, 'name' | 'description' | 'instructions'>, maxChars = 360): string {
  const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text);
  const rules = skill.instructions.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).filter((line) => /^[-*•]|^\d+[.)]/.test(line)).slice(0, 3);
  const summary = (rules.length ? rules : [skill.instructions.replace(/\s+/g, ' ').trim()]).join(' ').replace(/\s+/g, ' ').trim();
  const header = `✓ ${skill.name}: ${clip(skill.description.replace(/\s+/g, ' ').trim(), 150)}`;
  return clip(`${header}\n  Contract: ${clip(summary, Math.max(80, maxChars - header.length - 22))}`, maxChars);
}
