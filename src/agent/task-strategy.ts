/**
 * Task-type → investigation strategy ACTIVATION.
 *
 * The core mechanism lives here: classify the goal into a task kind and
 * activate the matching strategy. The strategy CONTENT is expertise, so it
 * lives in the skill layer as built-in skills (src/skills/builtin.ts) —
 * listable, use_skill-able, and shadowable by user skills of the same name.
 */
import { builtinSkillByName } from '../skills/builtin.js';
import type { Skill } from '../skills/skills.js';
import type { InvestigationDepth, TargetHints } from '../types.js';

export type TaskKind = 'bug-fix' | 'refactor' | 'test-failure' | 'explore' | 'feature';

const KIND_PATTERNS: { kind: TaskKind; patterns: RegExp[] }[] = [
  {
    kind: 'test-failure',
    patterns: [
      /\b(failing tests?|test failure|test is failing|tests are failing|test (suites?|runs?) (is |are )?failing|tests? (is |are )?failing|broken tests?|flaky tests?|failed tests?)\b/i,
      /\b(make (the )?(unit )?tests? pass|fix (the )?tests?)\b/i,
      /\b(why (do|is|are).*tests?)\b/i,
    ],
  },
  {
    kind: 'bug-fix',
    patterns: [
      /\b(bug|fix|fixes|fixed|broken|crash|crashing|incorrect|wrong|not working|doesn'?t work|does not work|regression|issue #[0-9]+)\b/i,
      /\b(error|fails?|failure|undefined|null pointer|exception)\b/i,
    ],
  },
  {
    kind: 'refactor',
    patterns: [
      /\b(refactor|rename|restructure|reorgani[sz]e|moderni[sz]e|clean up|cleanup|simplify|extract|deduplicate|split into|consolidate)\b/i,
    ],
  },
  {
    kind: 'explore',
    patterns: [
      /\b(understand|explain|how does|what does|why (is|does|are)|investigate|explore|summarize|review|walk me through|learn (about )?this)\b/i,
    ],
  },
];

/** Determine investigation depth from concrete evidence and target hints. */
export function determineInvestigationDepth(goal: string, targetHints?: TargetHints): InvestigationDepth {
  const lower = goal.toLowerCase();

  // Explicit repository-wide scan / audit
  if (
    lower.includes('entire repo') ||
    lower.includes('whole repo') ||
    lower.includes('all files') ||
    lower.includes('security audit') ||
    lower.includes('architecture review') ||
    lower.includes('scan repository')
  ) {
    return 'repository';
  }

  // Explicit file target present in hints or goal
  if (targetHints && targetHints.files && targetHints.files.length > 0) {
    return 'direct';
  }

  const hasFileInGoal = /(?:[a-zA-Z0-9_\-./\\]+\.(?:ts|tsx|js|jsx|json|py|go|rs|css|html|md))\b/i.test(goal);
  if (hasFileInGoal) {
    return 'direct';
  }

  // Symbol or exact error in hints or goal
  if ((targetHints?.symbols && targetHints.symbols.length > 0) || (targetHints?.errors && targetHints.errors.length > 0)) {
    return 'local';
  }

  const kind = classifyTaskKind(goal);
  if (kind === 'refactor') {
    return 'dependency';
  }
  if (kind === 'explore') {
    return 'subsystem';
  }
  if (kind === 'bug-fix' || kind === 'test-failure') {
    return 'local';
  }

  return 'local';
}

/** Classify a task goal into a task kind (heuristic, no LLM round-trip). */
export function classifyTaskKind(goal: string): TaskKind {
  for (const { kind, patterns } of KIND_PATTERNS) {
    for (const re of patterns) {
      if (re.test(goal)) return kind;
    }
  }
  return 'feature';
}

/** The store surface this module needs (satisfied by SkillStore). */
export interface StrategySkillLookup {
  get(name: string): Skill | undefined;
}

/**
 * The strategy skill for a task kind. A user skill named `strategy-<kind>`
 * shadows the built-in, so teams can customize HOW Gitu investigates without
 * touching core.
 */
export function strategySkillFor(kind: TaskKind, store?: StrategySkillLookup): Skill {
  const name = `strategy-${kind}`;
  const shadowed = store?.get(name);
  if (shadowed) return shadowed;
  const builtin = builtinSkillByName(name);
  if (!builtin) throw new Error(`Missing built-in strategy skill: ${name}`);
  return builtin;
}

/**
 * Build the strategy section for a goal, or undefined when no LSP server
 * exists (the strategies are LSP-first; the gate stays a core mechanism).
 */
export function buildTaskStrategySection(goal: string, lspAvailable: boolean, store?: StrategySkillLookup): string | undefined {
  if (!lspAvailable || !goal.trim()) return undefined;
  return strategySkillFor(classifyTaskKind(goal), store).instructions;
}

