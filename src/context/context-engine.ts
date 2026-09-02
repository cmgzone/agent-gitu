import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { CodeIndex } from './code-index.js';
import { recentChangeScores } from './change-signals.js';
import type { ProjectGuard } from '../guard/project-guard.js';
import type { ContextPack, FileRef, FileRole } from '../types.js';
import { EMBED_MAX_CHARS, type Embedder } from './embeddings.js';

export const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'of',
  'to',
  'in',
  'on',
  'for',
  'with',
  'fix',
  'add',
  'make',
  'so',
  'that',
  'this',
  'it',
  'is',
  'are',
  'be',
  'as',
  'at',
  'by',
  'from',
]);

export interface ContextBudget {
  maxFiles: number;
  /** Character budget for source attached to the model prompt. */
  maxBytes: number;
}

export const DEFAULT_CONTEXT_BUDGET: ContextBudget = { maxFiles: 12, maxBytes: 40_000 };

/** Hard ceiling for source context injected into the prompt. The pack is a
 *  grounding sample, not a repo dump — anything beyond ~48K chars (~12K
 *  tokens) costs more per turn than it informs, and the agent can always
 *  read_file/search_files for more. */
export const MAX_CONTEXT_BUDGET_BYTES = 48_000;
export const MAX_CONTEXT_BUDGET_FILES = 12;

/**
 * Convert a model's context window into a safe source-context budget. More
 * than half of the window remains available for system instructions, user
 * history, tool observations, and the model's response.
 */
export function contextBudgetForWindow(contextWindowTokens?: number): ContextBudget {
  if (!contextWindowTokens || !Number.isFinite(contextWindowTokens) || contextWindowTokens <= 0) {
    return { ...DEFAULT_CONTEXT_BUDGET };
  }
  const sourceTokens = Math.floor(contextWindowTokens * 0.4);
  return {
    maxFiles: Math.max(8, Math.min(MAX_CONTEXT_BUDGET_FILES, Math.floor(sourceTokens / 3_000))),
    maxBytes: Math.max(24_000, Math.min(MAX_CONTEXT_BUDGET_BYTES, sourceTokens * 4)),
  };
}

export function tokenize(text: string): string[] {
  // Identifier-aware: a goal saying "user token" must match parseUserToken.
  // Emits the compound token AND its camelCase parts so both styles retrieve.
  const out: string[] = [];
  for (const raw of text.split(/[^a-zA-Z0-9_.]+/)) {
    const t = raw.replace(/[_-]+/g, '');
    if (!t) continue;
    const base = t.toLowerCase();
    if (base.length >= 3 && !STOPWORDS.has(base)) out.push(base);
    const parts = raw.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(' ');
    if (parts.length > 1) {
      for (const p of parts) {
        const lp = p.toLowerCase().replace(/[_-]+/g, '');
        if (lp.length >= 3 && !STOPWORDS.has(lp)) out.push(lp);
      }
    }
  }
  return out;
}

/** Dotfile configs that are useful to code context and safe to read. */
export function isContextConfigDotfile(name: string): boolean {
  const base = path.basename(name).toLowerCase();
  return base.startsWith('.eslintrc') || base.startsWith('.prettierrc') || base.startsWith('.stylelintrc') || base === '.editorconfig' || base === '.npmrc' || base === '.babelrc';
}

export function classifyRole(relPath: string): FileRole {
  const p = relPath.replace(/\\/g, '/').toLowerCase();
  const base = path.basename(p);
  if (/(^|\/)(node_modules|dist|build|out|coverage|target|__pycache__)\//.test(p)) return 'artifact';
  if (/\.(md|rst|txt)$/.test(p)) return 'docs';
  if (/\.(test|spec)\.[a-z]+$/.test(base) || /(^|\/)(tests?|__tests__)\//.test(p)) return 'test';
  if (/\.(d\.ts)$/.test(base) || /(^|\/)(types?|interfaces?)\.[a-z]+$/.test(base)) return 'interface';
  if (
    base === 'package.json' ||
    base === 'tsconfig.json' ||
    /\.(config|rc)\.[a-z]+$/.test(base) ||
    isContextConfigDotfile(base) ||
    base === 'vite.config.ts' ||
    base === 'vitest.config.ts' ||
    /\.(ya?ml|toml|ini)$/.test(p)
  ) {
    return 'config';
  }
  if (/generated|\.gen\.|\.min\.|\.bundle\./.test(p)) return 'generated';
  if (/(^|\/)(legacy|deprecated|old)\//.test(p)) return 'legacy';
  if (/\.(ts|tsx|js|jsx|py|rs|go|java|cs|c|cpp|rb|php)$/.test(base)) return 'implementation';
  return 'unknown';
}

export class ContextEngine {
  constructor(
    private readonly guard: ProjectGuard,
    private readonly index?: CodeIndex,
  ) {}

  buildPack(goal: string, budget: ContextBudget = DEFAULT_CONTEXT_BUDGET, extraTexts: string[] = []): ContextPack {
    const root = this.guard.lock.repoRoot;
    // Acceptance criteria and pinned verification commands carry signal the
    // one-line goal often lacks ("auth flow" vs "add rate limiting to
    // /api/login per AC-2") — fold them into retrieval.
    const goalTokens = new Set(tokenize([goal, ...extraTexts].join('\n')));
    const files: FileRef[] = [];
    const ignores = new Set(this.guard.lock.ignorePaths);
    // Recent local work helps disambiguate broad tasks, but contributes only a
    // small tie-breaker so a stale or unrelated edit cannot outrank a direct
    // goal/content match.
    const changeScores = recentChangeScores(root);

    if (this.index) {
      // A watcher is an optimisation, not a consistency boundary. It may be
      // inside its debounce window (or unavailable on the current platform)
      // when a new run starts, so take a cheap metadata snapshot here. Only
      // changed files are read and re-tokenized by CodeIndex.refresh().
      this.index.refresh(root, ignores);
      const contentScores = this.index.contentMatchScores(goalTokens);
      for (const f of this.index.fileList()) {
        files.push({ path: f.path, role: f.role, score: this.score(f.path, f.role, goalTokens, undefined, contentScores.get(f.path)) });
      }
    } else {
      const walk = (dir: string, depth: number): void => {
        if (depth > 8 || files.length > 2000) return;
        let entries: string[];
        try {
          entries = readdirSync(dir);
        } catch {
          return;
        }
        for (const name of entries) {
          // Keep private VCS/agent state out. Safe config dotfiles are handled
          // by classifyRole; unknown dotfiles, including .env, are not read.
          if (ignores.has(name) || name === '.git' || name === '.hermes' || (name.startsWith('.') && name !== '.github' && !isContextConfigDotfile(name))) continue;
          const full = path.join(dir, name);
          let st;
          try {
            st = statSync(full);
          } catch {
            continue;
          }
          if (st.isDirectory()) {
            if (name.startsWith('.') && name !== '.github') continue;
            walk(full, depth + 1);
          } else if (st.size < 200 * 1024) {
            // Per-file cap enforcement: one large directory must not blow
            // past the 2000-file ceiling by its entire contents.
            if (files.length >= 2000) return;
            const rel = this.guard.toRelative(full);
            const role = classifyRole(rel);
            if (role === 'artifact' || role === 'unknown') continue;
            files.push({ path: rel, role, score: this.score(rel, role, goalTokens) });
          }
        }
      };

      walk(root, 0);
    }

    if (this.index && files.length > 0) {
      // Start from only the strongest lexical/content candidates. Following
      // every import from every source would turn a graph boost into a noisy
      // whole-repository expansion on ordinary tasks.
      const roots = [...files]
        .sort((a, b) => b.score - a.score)
        .filter((f) => f.score >= 0.2)
        .slice(0, 4)
        .map((f) => f.path);
      const dependencies = this.index.dependencyScores(roots);
      for (const f of files) {
        const graph = dependencies.get(f.path) ?? 0;
        const recent = changeScores.get(f.path) ?? 0;
        // These caps preserve lexical/IDF dominance while still allowing a
        // directly imported helper or actively edited neighbour into the
        // bounded sample.
        f.score = Math.round((f.score + graph * 0.14 + recent * 0.06) * 100) / 100;
      }
    } else if (changeScores.size > 0) {
      for (const f of files) {
        const recent = changeScores.get(f.path) ?? 0;
        f.score = Math.round((f.score + recent * 0.06) * 100) / 100;
      }
    }

    // Extract explicit file targets from goal text
    const explicitTargets = new Set<string>();
    const fileRegex = /(?:[a-zA-Z0-9_\-./\\]+\.(?:ts|tsx|js|jsx|json|py|go|rs|css|html|md))\b/gi;
    let match: RegExpExecArray | null;
    while ((match = fileRegex.exec(goal)) !== null) {
      explicitTargets.add(match[0].replace(/\\/g, '/').toLowerCase());
    }

    const hasStrongTarget = explicitTargets.size > 0;
    const entrypoints = new Set(this.guard.lock.entrypoints);
    for (const f of files) {
      const normalizedPath = f.path.replace(/\\/g, '/').toLowerCase();
      const isExplicitTarget = explicitTargets.has(normalizedPath) || Array.from(explicitTargets).some((t) => normalizedPath.endsWith('/' + t) || t.endsWith('/' + normalizedPath));
      if (isExplicitTarget) {
        f.score += 2.0;
      } else if (entrypoints.has(f.path)) {
        // Boost entrypoints moderately only when no strong target was explicitly specified
        f.score += hasStrongTarget ? 0.05 : 0.3;
      }
    }

    files.sort((a, b) => b.score - a.score);
    const top = files.slice(0, budget.maxFiles * 3);

    const pack: ContextPack = {
      taskSummary: goal,
      primaryFiles: top.filter((f) => f.role === 'implementation' || f.role === 'entrypoint').slice(0, budget.maxFiles),
      relatedFiles: top.filter((f) => f.role === 'interface' || f.role === 'docs').slice(0, 4),
      testFiles: top.filter((f) => f.role === 'test').slice(0, 4),
      configFiles: top.filter((f) => f.role === 'config').slice(0, 3),
      excludedPaths: [...ignores],
      budget,
    };
    return pack;
  }

  /**
   * Hybrid retrieval: the lexical/IDF pack blended with embedding cosine
   * similarity. Semantic matches catch conceptually-related files that share
   * no vocabulary with the goal ("rate limiting" → throttle.ts). Degrades
   * gracefully: any embedder failure simply returns the lexical pack. The
   * lexical score stays dominant (0.65) because exact identifier overlap is
   * still the strongest single signal for code tasks.
   */
  async buildPackHybrid(
    goal: string,
    budget: ContextBudget = DEFAULT_CONTEXT_BUDGET,
    extraTexts: string[] = [],
    embedder?: Embedder,
  ): Promise<{ pack: ContextPack; semantic: boolean }> {
    const pack = this.buildPack(goal, budget, extraTexts);
    if (!embedder || !this.index) return { pack, semantic: false };
    try {
      await this.index.updateVectors(embedder);
      const query = [goal, ...extraTexts].join('\n').slice(0, EMBED_MAX_CHARS);
      const sem = await this.index.semanticSearch(embedder, query);
      if (sem.size === 0) return { pack, semantic: false };
      const blend = (refs: FileRef[]): FileRef[] =>
        refs.map((r) => {
          const s = sem.get(r.path);
          if (s === undefined) return r;
          return { ...r, score: Math.round((r.score * 0.65 + s * 0.35) * 100) / 100 };
        });
      for (const key of ['primaryFiles', 'testFiles', 'relatedFiles', 'configFiles'] as const) {
        pack[key] = blend(pack[key]).sort((a, b) => b.score - a.score);
      }
      return { pack, semantic: true };
    } catch {
      return { pack, semantic: false };
    }
  }

  private score(relPath: string, role: FileRole, goalTokens: Set<string>, contentTerms?: Set<string>, contentScore?: number): number {
    const pathTokens = new Set(tokenize(relPath));
    let overlap = 0;
    for (const t of goalTokens) {
      if (pathTokens.has(t)) overlap += 1;
      else {
        for (const pt of pathTokens) {
          if (pt.includes(t) || t.includes(pt)) {
            overlap += 0.5;
            break;
          }
        }
      }
    }
    const pathMatch = goalTokens.size > 0 ? overlap / goalTokens.size : 0;
    // Content recall: prefer the IDF-weighted score from the index when
    // available; fall back to raw matched-term fraction for legacy callers.
    const contentMatch = contentScore !== undefined ? contentScore : contentTerms ? contentTerms.size / Math.max(1, goalTokens.size) : 0;
    const roleBonus: Record<FileRole, number> = {
      entrypoint: 0.15,
      implementation: 0.1,
      interface: 0.08,
      test: 0.12,
      config: 0.05,
      docs: 0.02,
      generated: -0.5,
      legacy: -0.2,
      dependency: -0.5,
      artifact: -1,
      unknown: -0.1,
    };
    return Math.round((pathMatch * 0.7 + contentMatch * 0.2 + roleBonus[role] + 0.01) * 100) / 100;
  }

  renderPack(pack: ContextPack): string {
    const section = (title: string, refs: FileRef[]): string =>
      refs.length === 0 ? '' : `${title}:\n${refs.map((r) => `  - ${r.path} [${r.role}] (score ${r.score})`).join('\n')}`;
    return [section('Primary files', pack.primaryFiles), section('Tests', pack.testFiles), section('Related', pack.relatedFiles), section('Config', pack.configFiles)]
      .filter(Boolean)
      .join('\n');
  }

  /** Resolve a user/model hint ("llm.ts", "src/llm/llm.ts", partial path) to a
   *  real in-repo file. Direct hit first, then a bounded basename walk. */
  private resolveHintedFile(hint: string): string | undefined {
    const cleaned = hint.replace(/\\/g, '/').replace(/^\.\//, '').trim();
    if (!cleaned || cleaned.length < 2) return undefined;
    const tryPath = (rel: string): string | undefined => {
      try {
        const abs = this.guard.resolve(rel);
        this.guard.assertInside(abs);
        if (existsSync(abs) && statSync(abs).isFile()) return this.guard.toRelative(abs).replace(/\\/g, '/');
      } catch {
        /* outside the repo or unreadable */
      }
      return undefined;
    };
    const direct = tryPath(cleaned);
    if (direct) return direct;
    const lower = cleaned.toLowerCase();
    try {
      const ignores = new Set(this.guard.lock.ignorePaths);
      const stack = [this.guard.lock.repoRoot];
      while (stack.length > 0 && stack.length < 200) {
        const dir = stack.pop()!;
        let entries: string[];
        try {
          entries = readdirSync(dir);
        } catch {
          continue;
        }
        for (const name of entries) {
          if (ignores.has(name) || name === '.git' || name === '.hermes') continue;
          const full = path.join(dir, name);
          let st;
          try {
            st = statSync(full);
          } catch {
            continue;
          }
          if (st.isDirectory()) {
            stack.push(full);
            continue;
          }
          const rel = this.guard.toRelative(full).replace(/\\/g, '/');
          const relLower = rel.toLowerCase();
          if (relLower === lower || relLower.endsWith('/' + lower)) return rel;
        }
      }
    } catch {
      /* filesystem errors simply yield no fast path */
    }
    return undefined;
  }

  /** Nearest plausible test for a target: sibling test/spec file or a tests/ twin. */
  private nearestTestFor(relPath: string): string | undefined {
    const ext = path.extname(relPath);
    const base = relPath.slice(0, relPath.length - ext.length);
    const baseName = path.basename(base);
    const candidates = [`${base}.test${ext}`, `${base}.spec${ext}`, `tests/${baseName}.test${ext}`, `test/${baseName}.test${ext}`, `src/${baseName}.test${ext}`];
    for (const c of candidates) {
      try {
        const abs = this.guard.resolve(c);
        if (existsSync(abs)) return this.guard.toRelative(abs).replace(/\\/g, '/');
      } catch {
        continue;
      }
    }
    return undefined;
  }

  /**
   * Targeted fast path for DIRECT-depth tasks: read the explicitly hinted
   * target file(s) (plus their nearest test) and skip repository-wide
   * scoring entirely. Returns undefined when no hint resolves to a real
   * file, so the caller falls back to the ranked repository pack.
   */
  buildTargetedPack(goal: string, targetFiles: string[], budget: ContextBudget = DEFAULT_CONTEXT_BUDGET): ContextPack | undefined {
    const primary: FileRef[] = [];
    const seen = new Set<string>();
    for (const hint of targetFiles.slice(0, budget.maxFiles)) {
      const resolved = this.resolveHintedFile(hint);
      if (!resolved || seen.has(resolved)) continue;
      seen.add(resolved);
      primary.push({ path: resolved, role: classifyRole(resolved), score: 1 });
    }
    if (primary.length === 0) return undefined;
    const testFiles: FileRef[] = [];
    for (const p of primary) {
      const test = this.nearestTestFor(p.path);
      if (test && !seen.has(test)) {
        seen.add(test);
        testFiles.push({ path: test, role: 'test', score: 0.9 });
      }
    }
    return {
      taskSummary: goal,
      primaryFiles: primary,
      relatedFiles: [],
      testFiles,
      configFiles: [],
      excludedPaths: [],
      budget,
    };
  }

  renderPackWithContent(pack: ContextPack): string {
    const maxTotal = Math.min(pack.budget.maxBytes || DEFAULT_CONTEXT_BUDGET.maxBytes, MAX_CONTEXT_BUDGET_BYTES);
    const perFile = Math.max(4_000, Math.min(8_000, Math.floor(maxTotal / Math.max(1, pack.budget.maxFiles))));
    const parts: string[] = [this.renderPack(pack)];

    const targets: FileRef[] = [...pack.primaryFiles, ...pack.testFiles];
    if (targets.length === 0) {
      for (const ep of this.guard.lock.entrypoints.slice(0, 3)) {
        targets.push({ path: ep, role: 'entrypoint', score: 0 });
      }
    }

    const included: string[] = [];
    let used = 0;
    for (const ref of targets) {
      if (used >= maxTotal) break;
      const content = this.peekFile(ref.path, perFile);
      if (!content) continue;
      const slice = content.slice(0, Math.max(0, Math.min(perFile, maxTotal - used)));
      if (!slice) break;
      included.push(`--- ${ref.path} [${ref.role}] ---\n${slice}`);
      used += slice.length;
    }

    if (included.length > 0) {
      parts.push(
        '\nCONTEXT SAMPLE (a partial retrieval preview — NOT the whole codebase; files are truncated and important code may be missing. Ground your exploration in it, but read_file/search_files every file you intend to change before planning or editing):\n' +
          included.join('\n\n'),
      );
    }
    return parts.join('\n');
  }

  peekFile(relPath: string, maxChars = 3000): string | undefined {
    try {
      const abs = this.guard.resolve(relPath);
      this.guard.assertInside(abs);
      return readFileSync(abs, 'utf8').slice(0, maxChars);
    } catch {
      return undefined;
    }
  }
}
