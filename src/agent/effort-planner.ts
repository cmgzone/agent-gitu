import type { EffortPlan, TaskComplexity } from '../types.js';
import { MAX_CONTEXT_BUDGET_BYTES } from '../context/context-engine.js';

export type { EffortPlan, TaskComplexity } from '../types.js';

export interface EffortPlannerOptions {
  scopeFiles?: string[];
  criteriaCount?: number;
  mode?: 'fast' | 'standard' | 'chat';
  explicitEffort?: 'low' | 'medium' | 'high' | 'max';
  contextWindowTokens?: number;
}

const LOW_PATTERNS = [
  /\b(typos?|spelling|misspell(ed|ing)?)\b/i,
  /\b(readme|docs?|documentation|add comments?|docstrings?|license|changelog)\b/i,
  // Formatting keywords only count when they clearly target code style — a
  // bare "format" also matches "format the data as JSON", which is real work.
  /\b(prettify|lint(ing)?|eslint|prettier|whitespace|indentation|reformat)\b|\bformat(ting)?\s+(the\s+)?(code|files?|sources?|project|styles?)\b/i,
  /\b(rename (variable|function|symbol|const|let|file)|(bump|update|increment)( the)? version|small fix|quick fix|one[- ]line)\b/i,
  /\b(check (version|status|if)|what version|print|is [a-z0-9_-]+ (installed|available))\b/i,
];

const HIGH_PATTERNS = [
  /\b(architect(ure)?|redesign|overhaul|system design|re-architect|rebuild from scratch)\b/i,
  /\b(auth(entication|orization)?|oauth|jwt|security|vulnerabilit(y|ies)|rbac|crypto|encryption|permissions? system)\b/i,
  // "migrate X to Y" alone is far too broad ("migrate the blog to Hugo");
  // migrations only escalate when a database/schema/data store is involved.
  /\b(database migration|schema migration|db migration|(database|db|schema).*migrat(e|ion|ing)|migrat(e|ion|ing).*(database|db|schema)|data integrity|payment|billing|stripe|checkout)\b/i,
  /\b(full-?stack|end-to-end|distributed|microservices?|concurrency|race conditions?|multi-tenant|performance overhaul)\b/i,
];

// Frontend/UI builds are turn-hungry: scaffold → run dev server → screenshot →
// tweak cycles routinely exhaust a medium budget mid-polish, leaving half-built
// UI behind. They get the high budget (60 turns, thorough verification).
// Checked AFTER the quick-fix patterns, so "quick fix css typo" stays low while
// "build a landing page" escalates.
const FRONTEND_PATTERNS = [
  /\bfront-?end\b/i,
  /\bweb ?(?:site|page|app)\b/,
  /\blanding(?: page)?\b/i,
  /\bdashboard\b/i,
  /\badmin (?:panel|console)\b/i,
  /\bportfolio\b/i,
  /\buser interface\b/i,
  /\bui (?:components?|screens?|views?)\b/i,
  /\b(responsive|design system|mockup|wireframe)\b/i,
  /\b(dark mode|light mode)\b/i,
  /\bhero section\b/i,
];

/**
 * Classify the complexity of a task based on goal text, scope, criteria count, and configuration.
 */
export function classifyTaskComplexity(
  goal: string,
  opts: EffortPlannerOptions = {},
): { complexity: TaskComplexity; reason: string } {
  if (opts.mode === 'chat') {
    return { complexity: 'low', reason: 'chat mode is conversational and requires minimal effort budget' };
  }

  if (opts.explicitEffort) {
    if (opts.explicitEffort === 'low') {
      return { complexity: 'low', reason: 'explicit user configuration: effort=low' };
    }
    if (opts.explicitEffort === 'high' || opts.explicitEffort === 'max') {
      return { complexity: 'high', reason: `explicit user configuration: effort=${opts.explicitEffort}` };
    }
    return { complexity: 'medium', reason: 'explicit user configuration: effort=medium' };
  }

  // Large scope or heavy criteria upfront indicates high complexity
  if ((opts.scopeFiles && opts.scopeFiles.length >= 5) || (opts.criteriaCount && opts.criteriaCount >= 5)) {
    return {
      complexity: 'high',
      reason: `large initial scope (${opts.scopeFiles?.length ?? 0} files, ${opts.criteriaCount ?? 0} criteria)`,
    };
  }

  // Check high-complexity keyword patterns
  for (const re of HIGH_PATTERNS) {
    if (re.test(goal)) {
      return { complexity: 'high', reason: `goal matches high-complexity pattern: ${re.source}` };
    }
  }

  // Check low-complexity keyword patterns
  for (const re of LOW_PATTERNS) {
    if (re.test(goal)) {
      return { complexity: 'low', reason: `goal matches low-complexity pattern: ${re.source}` };
    }
  }

  // Frontend/UI builds escalate to high — but only after the quick-fix check
  // above, so small styling touch-ups are not billed as full builds.
  for (const re of FRONTEND_PATTERNS) {
    if (re.test(goal)) {
      return { complexity: 'high', reason: `goal matches frontend/UI pattern: ${re.source}` };
    }
  }

  // Single-file scoped small request
  if (opts.scopeFiles && opts.scopeFiles.length === 1 && goal.trim().length < 60) {
    return { complexity: 'low', reason: 'focused single-file scope with concise goal' };
  }

  return { complexity: 'medium', reason: 'standard task complexity' };
}

/** True when the goal text reads as a frontend/UI build (shared with the prompt builder). */
export function isFrontendGoal(goal: string): boolean {
  return FRONTEND_PATTERNS.some((re) => re.test(goal));
}

/**
 * Plan the effort parameters (turns, specialists, context budget, review depth)
 * adaptively for a given task.
 */
export function planEffort(goal: string, opts: EffortPlannerOptions = {}): EffortPlan {
  const { complexity, reason } = classifyTaskComplexity(goal, opts);

  if (opts.mode === 'chat') {
    return {
      complexity: 'low',
      reason,
      llmEffort: opts.explicitEffort ?? 'low',
      maxTurns: 10,
      maxSpecialists: 0,
      contextBudget: { maxFiles: 2, maxBytes: 5_000 },
      requireReview: false,
      verificationDepth: 'light',
    };
  }

  const windowTokens = opts.contextWindowTokens ?? 32_000;
  const scale = windowTokens >= 128_000 ? 1.5 : windowTokens <= 16_000 ? 0.7 : 1.0;
  // Context packs are a grounding sample, not a repo dump: budgets stay in the
  // ~30-50K char band (the engine hard-caps injected content at 48K chars).
  const budgetBytes = (base: number, floor: number): number =>
    Math.max(floor, Math.min(MAX_CONTEXT_BUDGET_BYTES, Math.round(base * scale)));

  switch (complexity) {
    case 'low':
      return {
        complexity: 'low',
        reason,
        llmEffort: opts.explicitEffort ?? 'low',
        maxTurns: 20,
        maxSpecialists: 1,
        contextBudget: {
          maxFiles: Math.max(2, Math.round(4 * scale)),
          maxBytes: budgetBytes(12_000, 8_000),
        },
        requireReview: false,
        verificationDepth: 'light',
      };

    case 'high':
      return {
        complexity: 'high',
        reason,
        llmEffort: opts.explicitEffort ?? 'high',
        maxTurns: 60,
        maxSpecialists: 4,
        contextBudget: {
          maxFiles: Math.max(10, Math.round(12 * scale)),
          maxBytes: budgetBytes(48_000, 40_000),
        },
        requireReview: true,
        verificationDepth: 'thorough',
      };

    case 'medium':
    default:
      return {
        complexity: 'medium',
        reason,
        llmEffort: opts.explicitEffort ?? 'medium',
        maxTurns: 35,
        maxSpecialists: 2,
        contextBudget: {
          maxFiles: Math.max(5, Math.round(10 * scale)),
          maxBytes: budgetBytes(30_000, 20_000),
        },
        requireReview: false,
        verificationDepth: 'standard',
      };
  }
}
