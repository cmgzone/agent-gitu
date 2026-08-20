/**
 * Task-type → investigation strategy.
 *
 * Instead of handing the model twenty tools and saying "figure it out", the
 * goal text is classified into a task kind and a proven investigation
 * strategy is injected once at intake. Strategies are LSP-first (definition →
 * references → symbols) because language servers keep the project indexed;
 * every strategy states the fallback to search_files/read_file when LSP is
 * unavailable, and none of them substitute for real verification commands.
 */

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

/** Classify a task goal into a task kind (heuristic, no LLM round-trip). */
export function classifyTaskKind(goal: string): TaskKind {
  for (const { kind, patterns } of KIND_PATTERNS) {
    for (const re of patterns) {
      if (re.test(goal)) return kind;
    }
  }
  return 'feature';
}

const STRATEGIES: Record<TaskKind, string> = {
  'bug-fix': `TASK STRATEGY — bug fix. Investigate before you edit:
1. Locate the failure: read the error/stack or the failing test, then lsp_symbols to map the files involved.
2. lsp_definition at the failure sites -> the actual implementation.
3. lsp_references to enumerate every caller your fix could affect.
4. read_file the implementation and the failing test, then edit small.
5. The automatic post-edit LSP check will report diagnostics for files you changed; fix them BEFORE running the real test/typecheck commands.
If LSP reports "unavailable", run the same sequence with search_files/read_file instead.`,

  refactor: `TASK STRATEGY — refactor. Map before you move anything:
1. lsp_definition for each symbol you plan to touch.
2. lsp_references to enumerate every call site and dependent.
3. read_file the implementations; note the public API surface.
4. Edit in small reversible steps; rely on the post-edit LSP diagnostics check.
5. Run the full test/typecheck/build commands before claiming completion.
If LSP reports "unavailable", use search_files/read_file to trace callers instead.`,

  'test-failure': `TASK STRATEGY — failing test. Diagnose before repairing:
1. Run the failing test and read its exact failure message and location.
2. lsp_definition at the failure location (the assertion line) -> the code under test.
3. lsp_references to see what the code under test touches.
4. lsp_diagnostics on both the test file and the implementation.
5. Repair small, re-run the failing test first, then run the full suite.
If LSP reports "unavailable", use search_files/read_file to trace the assertion back to its source instead.`,

  explore: `TASK STRATEGY — exploration. Map first, read selectively:
1. lsp_symbols on the entry points to see the structure.
2. Use the project lock's entrypoints to pick the files to start from.
3. Follow the call chain with lsp_definition/lsp_references from the entry point.
4. read_file only the symbols that matter; do not read whole files by default.
If LSP reports "unavailable", use search_files/read_file to trace the chain instead.`,

  feature: `TASK STRATEGY — new feature. Ground yourself before building:
1. Find the integration points: lsp_symbols + read_file on the files you will extend.
2. lsp_definition/lsp_references to see the existing APIs you must match.
3. Implement in small steps; rely on the post-edit LSP diagnostics check.
4. Verify with the real test/typecheck/build commands.
If LSP reports "unavailable", use search_files/read_file to find the integration points instead.`,
};

/** Build the strategy section for a goal, or undefined when no LSP server exists. */
export function buildTaskStrategySection(goal: string, lspAvailable: boolean): string | undefined {
  if (!lspAvailable || !goal.trim()) return undefined;
  return STRATEGIES[classifyTaskKind(goal)];
}
