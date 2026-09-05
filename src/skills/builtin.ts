/**
 * Built-in skills: expertise SHIPPED with Gitu, expressed as skills instead of
 * hard-coded orchestrator strings.
 *
 * Core keeps every mechanism — task-kind classification, UI detection,
 * injection points, activation tracking. The KNOWLEDGE (how to investigate a
 * bug, how to keep frontend quality high) lives here in the skill layer, so it
 * is listable, visible to use_skill, and overridable: a user skill with
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
 * Investigation strategies — one per task kind. Keep these short and
 * action-oriented. Host-side recovery/evidence controls enforce invariants;
 * the strategy should help the model solve the task, not restate the runtime.
 */
export const STRATEGY_SKILLS: Record<BuiltinTaskKind, ResolvedBuiltinSkill> = {
  'bug-fix': def({
    name: 'strategy-bug-fix',
    taskKind: 'bug-fix',
    description: 'Direct bug-fix strategy: follow the failure to the implementation, repair small, verify.',
    instructions: `TASK STRATEGY — bug fix. Follow the shortest evidence path:
1. Start from the reported error, failing command/test, stack trace, or named file. If a concrete reproduction command exists, run it once and capture the failure.
2. Read the failure site and the implementation it points to. Use lsp_definition/search_files only when the location is not already clear.
3. Inspect callers/references only when the proposed change can affect them or local evidence is insufficient.
4. Once the cause is clear, record that root cause with set_hypothesis, then make the smallest repair that addresses the observed failure.
5. Re-run the targeted reproduction/verification first, then the relevant broader checks.
Do not turn a local bug into a repository survey; widen only when the evidence requires it.`,
  }),

  refactor: def({
    name: 'strategy-refactor',
    taskKind: 'refactor',
    description: 'Investigation strategy for refactors: targeted mapping before moving anything.',
    instructions: `TASK STRATEGY — refactor. Map before you move anything:
1. lsp_definition for each symbol you plan to touch.
2. lsp_references to enumerate call sites for THOSE symbols — the refactor's blast radius, not the whole codebase.
3. read_file the implementations; note the public API surface.
4. Edit in small reversible steps; rely on the post-edit LSP diagnostics check.
5. Run the full test/typecheck/build commands before claiming completion.
If LSP reports "unavailable", use search_files/read_file to trace callers instead.`,
  }),

  'test-failure': def({
    name: 'strategy-test-failure',
    taskKind: 'test-failure',
    description: 'Direct failing-test strategy: diagnose the assertion, repair the local cause, verify immediately.',
    instructions: `TASK STRATEGY — failing test. Diagnose, repair, verify:
1. Run the failing test and read its exact assertion/error and location.
2. Read the code under test directly. Use lsp_definition only when the trace does not already identify it.
3. If the immediate code explains the failure, repair it now; expand to callers/dependencies only when it does not.
4. Re-run the failing test immediately after the repair.
5. When targeted verification passes, run the full suite or the relevant typecheck/build checks.
Avoid repeated reads of unchanged evidence; once the cause is clear, act. If LSP is unavailable, use search_files/read_file only as needed.`,
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
  description: 'Review frontend UI for control intent, placement, interaction logic, visual quality, responsiveness, and accessibility.',
  instructions: `FRONTEND QUALITY BAR (this task builds user-facing UI — non-negotiable):
- Create an intent map. Every interactive control needs a justified purpose and placement.
- Every interactive control needs evidence from the request, acceptance criteria, or an established product pattern. Do not invent buttons, links, menus, fields, or calls to action to fill space.
- Audit control placement, prominence, label, target/handler, state behavior, and duplicates before completion.
- Preserve the existing information architecture unless the task requires changing it. Inspect adjacent screens and shared components before adding, moving, or removing navigation and actions.
- Pick a small design system and reuse it everywhere: spacing scale, type scale, accent palette, and hover/focus/disabled states.
- Every view implements the states it can actually enter: loading, empty, error, validation, disabled, and success. Do not add irrelevant decorative states.
- Responsive at 375px, 768px, and desktop widths; no horizontal scroll; touch targets ≥40px.
- Accessibility basics: semantic elements, labels bound to inputs, visible focus styles, text contrast ≥4.5:1, and keyboard-operable controls.
- Verify the real interaction path, not just the render: exercise primary actions and inspect final screenshots/evidence for misplaced, misleading, unrequested, duplicated, or nonfunctional controls.
- Ship complete requested views with real content structure—no lorem ipsum, TODO placeholders, or unrelated sections unless explicitly requested.`,
});

/** All built-in skills, in stable order. */
export function builtinSkills(): ResolvedBuiltinSkill[] {
  return [...Object.values(STRATEGY_SKILLS), FRONTEND_QUALITY_SKILL];
}

export function builtinSkillByName(name: string): ResolvedBuiltinSkill | undefined {
  return builtinSkills().find((s) => s.name === name);
}
