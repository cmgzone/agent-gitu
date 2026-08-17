import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { CodeIndex } from './code-index.js';
import type { ProjectGuard } from '../guard/project-guard.js';
import type { ContextPack, FileRef, FileRole } from '../types.js';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'fix', 'add',
  'make', 'so', 'that', 'this', 'it', 'is', 'are', 'be', 'as', 'at', 'by', 'from',
]);

export interface ContextBudget {
  maxFiles: number;
  /** Character budget for source attached to the model prompt. */
  maxBytes: number;
}

export const DEFAULT_CONTEXT_BUDGET: ContextBudget = { maxFiles: 12, maxBytes: 40_000 };

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
    maxFiles: Math.max(8, Math.min(24, Math.floor(sourceTokens / 3_000))),
    maxBytes: Math.max(30_000, Math.min(160_000, sourceTokens * 4)),
  };
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_.]+/)
    .map((t) => t.replace(/[_-]+/g, ''))
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/** Dotfile configs that are useful to code context and safe to read. */
export function isContextConfigDotfile(name: string): boolean {
  const base = path.basename(name).toLowerCase();
  return (
    base.startsWith('.eslintrc') || base.startsWith('.prettierrc') || base.startsWith('.stylelintrc') ||
    base === '.editorconfig' || base === '.npmrc' || base === '.babelrc'
  );
}

export function classifyRole(relPath: string): FileRole {
  const p = relPath.replace(/\\/g, '/').toLowerCase();
  const base = path.basename(p);
  if (/(^|\/)(node_modules|dist|build|out|coverage|target|__pycache__)\//.test(p)) return 'artifact';
  if (/\.(md|rst|txt)$/.test(p)) return 'docs';
  if (/\.(test|spec)\.[a-z]+$/.test(base) || /(^|\/)(tests?|__tests__)\//.test(p)) return 'test';
  if (/\.(d\.ts)$/.test(base) || /(^|\/)(types?|interfaces?)\.[a-z]+$/.test(base)) return 'interface';
  if (
    base === 'package.json' || base === 'tsconfig.json' || /\.(config|rc)\.[a-z]+$/.test(base) ||
    isContextConfigDotfile(base) ||
    base === 'vite.config.ts' || base === 'vitest.config.ts' ||
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

  buildPack(goal: string, budget: ContextBudget = DEFAULT_CONTEXT_BUDGET): ContextPack {
    const root = this.guard.lock.repoRoot;
    const goalTokens = new Set(tokenize(goal));
    const files: FileRef[] = [];
    const ignores = new Set(this.guard.lock.ignorePaths);

    if (this.index) {
      // A watcher is an optimisation, not a consistency boundary. It may be
      // inside its debounce window (or unavailable on the current platform)
      // when a new run starts, so take a cheap metadata snapshot here. Only
      // changed files are read and re-tokenized by CodeIndex.refresh().
      this.index.refresh(root, ignores);
      const contentMatches = this.index.contentMatches(goalTokens);
      for (const f of this.index.fileList()) {
        files.push({ path: f.path, role: f.role, score: this.score(f.path, f.role, goalTokens, contentMatches.get(f.path)) });
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
            const rel = this.guard.toRelative(full);
            const role = classifyRole(rel);
            if (role === 'artifact' || role === 'unknown') continue;
            files.push({ path: rel, role, score: this.score(rel, role, goalTokens) });
          }
        }
      };

      walk(root, 0);
    }

    const entrypoints = new Set(this.guard.lock.entrypoints);
    for (const f of files) {
      if (entrypoints.has(f.path)) f.score += 0.3;
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

  private score(relPath: string, role: FileRole, goalTokens: Set<string>, contentTerms?: Set<string>): number {
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
    // Content recall: fraction of goal terms found in the file's body (from the
    // persistent index). Boosts files the goal's wording matches semantically.
    const contentMatch = contentTerms ? contentTerms.size / Math.max(1, goalTokens.size) : 0;
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
    return [
      section('Primary files', pack.primaryFiles),
      section('Tests', pack.testFiles),
      section('Related', pack.relatedFiles),
      section('Config', pack.configFiles),
    ]
      .filter(Boolean)
      .join('\n');
  }

  renderPackWithContent(pack: ContextPack): string {
    const maxTotal = Math.min(pack.budget.maxBytes || DEFAULT_CONTEXT_BUDGET.maxBytes, 160_000);
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
        '\nCURRENT CODE (the real state of this codebase — ground your plan in it; use read_file/search_files to see more before planning):\n' +
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
