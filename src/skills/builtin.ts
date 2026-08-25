/**
 * Built-in skills: expertise SHIPPED with Gitu, expressed as skills instead of
 * hard-coded orchestrator strings.
 *
 * Core keeps every mechanism — task-kind classification, UI detection,
 * injection points, activation tracking. The KNOWLEDGE (how to investigate a
 * bug, how to keep frontend quality high) lives here in the skill layer, so
 * it is listable, visible to use_skill, and overridable: a user skill with
 * the same name shadows the built-in (project > global > builtin).
 */
import type { Skill } from './skills.js';

/** Task kinds mirrored locally to keep this module import-free. */
export type BuiltinTaskKind = 'bug-fix' | 'refactor' | 'test-failure' | 'explore' | 'feature';

export type BuiltinSkillDef = Omit<Skill, 'createdBy' | 'createdAt'> &
  Partial<Pick<Skill, 'createdBy' | 'createdAt'>> & {
    /** Strategy skills: core activates the one matching classifyTaskKind(). */
    taskKind?: BuiltinTaskKind;
    /** UI skill: core activates it when the task builds user-facing UI. */
    uiTask?: boolean;
  };

const EPOCH = '1970-01-01T00:00:00.000Z';

/** A built-in after def() has filled the required Skill bookkeeping fields. */
export type ResolvedBuiltinSkill = BuiltinSkillDef & Required<Pick<Skill, 'createdBy' | 'createdAt'>>;

function def(skill: BuiltinSkillDef): ResolvedBuiltinSkill {
  return { ...skill, createdBy: 'agent', createdAt: EPOCH };
}

/**
 * Investigation strategies — one per task kind. Content previously lived as
 * hard-coded strings in src/agent/task-strategy.ts.
 */
export const STRATEGY_SKILLS: Record<BuiltinTaskKind, ResolvedBuiltinSkill> = {
  'bug-fix': def({
    name: 'strategy-bug-fix',
    taskKind: 'bug-fix',
    description: 'Investigation strategy for bug fixes: reproduce first, trace with LSP, fix small.',
    instructions: `TASK STRATEGY — bug fix. Prove the bug before you touch anything:
1. REPRODUCE FIRST: run the command/test that demonstrates the reported wrong behavior and watch it FAIL. If you cannot reproduce it, do NOT edit — investigate environment/config differences or ask_user instead. Speculative fixes are forbidden.
2. Locate the failure: read the error/stack, then lsp_symbols to map the files involved.
3. lsp_definition at the failure site -> the implementation; lsp_references to enumerate every caller your fix could affect (a fix that breaks a caller is a new bug).
4. Record the root cause with set_hypothesis, then read_file the implementation and edit small.
5. Re-run the SAME reproduction command after the fix — it must go FAIL -> PASS. Completion is mechanically checked for this fail-then-pass pair; a green pre-existing suite alone is not accepted proof.
6. The automatic post-edit LSP check will report diagnostics for files you changed; fix them BEFORE running the real test/typecheck commands.
If LSP reports "unavailable", run the same sequence with search_files/read_file instead.`,
  }),

  refactor: def({
    name: 'strategy-refactor',
    taskKind: 'refactor',
    description: 'Investigation strategy for refactors: map every caller before moving anything.',
    instructions: `TASK STRATEGY — refactor. Map before you move anything:
1. lsp_definition for each symbol you plan to touch.
2. lsp_references to enumerate every call site and dependent.
3. read_file the implementations; note the public API surface.
4. Edit in small reversible steps; rely on the post-edit LSP diagnostics check.
5. Run the full test/typecheck/build commands before claiming completion.
If LSP reports "unavailable", use search_files/read_file to trace callers instead.`,
  }),

  'test-failure': def({
    name: 'strategy-test-failure',
    taskKind: 'test-failure',
    description: 'Investigation strategy for failing tests: diagnose the assertion before repairing.',
    instructions: `TASK STRATEGY — failing test. Diagnose before repairing:
1. Run the failing test and read its exact failure message and location.
2. lsp_definition at the failure location (the assertion line) -> the code under test.
3. lsp_references to see what the code under test touches.
4. lsp_diagnostics on both the test file and the implementation.
5. Repair small, re-run the failing test first, then run the full suite.
If LSP reports "unavailable", use search_files/read_file to trace the assertion back to its source instead.`,
  }),

  explore: def({
    name: 'strategy-explore',
    taskKind: 'explore',
    description: 'Investigation strategy for exploration: map structure first, read selectively.',
    instructions: `TASK STRATEGY — exploration. Map first, read selectively:
1. lsp_symbols on the entry points to see the structure.
2. Use the project lock's entrypoints to pick the files to start from.
3. Follow the call chain with lsp_definition/lsp_references from the entry point.
4. read_file only the symbols that matter; do not read whole files by default.
If LSP reports "unavailable", use search_files/read_file to trace the chain instead.`,
  }),

  feature: def({
    name: 'strategy-feature',
    taskKind: 'feature',
    description: 'Investigation strategy for new features: ground in the integration points first.',
    instructions: `TASK STRATEGY — new feature. Ground yourself before building:
1. Find the integration points: lsp_symbols + read_file on the files you will extend.
2. lsp_definition/lsp_references to see the existing APIs you must match.
3. Implement in small steps; rely on the post-edit LSP diagnostics check.
4. Verify with the real test/typecheck/build commands.
If LSP reports "unavailable", use search_files/read_file to find the integration points instead.`,
  }),
};

/**
 * Frontend quality bar — previously a hard-coded section of the system
 * prompt; now a skill the core injects when the task builds user-facing UI.
 */
export const FRONTEND_QUALITY_SKILL: ResolvedBuiltinSkill = def({
  name: 'frontend-quality-bar',
  uiTask: true,
  description: 'Non-negotiable quality bar for user-facing UI: design system, states, responsive, a11y.',
  instructions: `FRONTEND QUALITY BAR (this task builds user-facing UI — non-negotiable):
- Pick a small design system FIRST and reuse it everywhere: spacing scale (4/8/12/16/24/32px), one type scale, one accent palette incl. hover/focus/disabled states.
- Every view implements loading, empty, AND error states; forms validate inline and confirm success.
- Responsive at 375px, 768px, and desktop widths; no horizontal scroll; touch targets ≥40px.
- Accessibility basics: semantic elements, labels bound to inputs, visible focus styles, text contrast ≥4.5:1.
- Ship COMPLETE pages (title, favicon, nav/footer) — no lorem ipsum or TODO placeholders unless explicitly requested.`,
});

/** All built-in skills, in stable order. */
export function builtinSkills(): ResolvedBuiltinSkill[] {
  return [...Object.values(STRATEGY_SKILLS), FRONTEND_QUALITY_SKILL];
}

export function builtinSkillByName(name: string): ResolvedBuiltinSkill | undefined {
  return builtinSkills().find((s) => s.name === name);
}
