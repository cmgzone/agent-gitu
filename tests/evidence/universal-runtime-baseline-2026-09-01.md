# Full-suite baseline before universality acceptance gates

Date: 2026-09-01 · Branch: `hermes/hermes-task-20260828-d3362e`

## Why this exists

Before merging the Universal Connection Runtime (`cd6bec1`) toward `main`, a
clean baseline of the known-failing full-suite tests is recorded so future
regressions cannot be dismissed as "already broken".

## Full suite at HEAD (`cd6bec1` — Add Universal Connection Runtime with tests)

Raw output: `baseline-full-suite-2026-09-01.log` (same directory).

```
Test Files  5 failed | 68 passed (73)
     Tests  8 failed | 879 passed (887)
```

Failing tests:

1. `tests/server.test.ts` > HermesServer > switches a chat session to build mode when the follow-up sends mode: standard
2. `tests/server.test.ts` > HermesServer > resumes a standard session as a task and adopts the picker model for legacy sessions
3. `tests/hermes.test.ts` > Hermes end-to-end (mock LLM) > switches a chat ledger to build mode when resuming with a different mode
4. `tests/specialist-checkpoints.test.ts` > durable specialist checkpoint recovery > preserves committed work in a recovery file when SQLite checkpoints fail mid-run
5. `tests/prerequisites.test.ts` > Gitu prerequisite blocking flow > resolves a missing prerequisite before honoring request_block, then continues the task
6. `tests/prerequisites.test.ts` > Gitu prerequisite blocking flow > proposes a documented provider write through the host approval channel and continues after it runs
7. `tests/task-strategy.test.ts` > Hermes task-strategy injection > injects the bug-fix strategy at intake when LSP servers exist
8. `tests/task-strategy.test.ts` > Hermes task-strategy injection > does not inject a strategy when no LSP servers are available

## Parent commit (`0ba9fb3` — Optimize risk-aware completion verification)

The same five files were run in a clean worktree at the parent commit, i.e.
**without** the Universal Connection Runtime commit:

```
Test Files  5 failed (5)
     Tests  9 failed | 78 passed (87)
```

Failures at parent — all 8 HEAD failures reproduce identically, plus one
additional failure that passes at HEAD:

1. HermesServer > switches a chat session to build mode when the follow-up sends mode: standard
2. HermesServer > resumes a standard session as a task and adopts the picker model for legacy sessions
3. Hermes end-to-end (mock LLM) > switches a chat ledger to build mode when resuming with a different mode
4. Hermes end-to-end (mock LLM) > extends the turn budget while the run keeps producing verified progress ← **passes at HEAD**
5. durable specialist checkpoint recovery > preserves committed work in a recovery file when SQLite checkpoints fail mid-run
6. Gitu prerequisite blocking flow > resolves a missing prerequisite before honoring request_block, then continues the task
7. Gitu prerequisite blocking flow > proposes a documented provider write through the host approval channel and continues after it runs
8. Hermes task-strategy injection > injects the bug-fix strategy at intake when LSP servers exist
9. Hermes task-strategy injection > does not inject a strategy when no LSP servers are available

## Conclusion

- All 8 failures at HEAD predate the Universal Connection Runtime commit.
- None of the failing files exercise `src/connections/runtime` or
  `tests/connections-runtime*.test.ts`.
- The runtime commit introduced **zero** new full-suite failures (and the
  branch coincidentally stopped seeing one pre-existing flake).
- Regression rule going forward: the focused runtime suites
  (`tests/connections-runtime.test.ts`,
  `tests/connections-runtime-universality.test.ts`) and the full-suite count
  **8 failed | 879+ passed** are the baseline; any increase is a real
  regression, any decrease is an improvement to record here.
