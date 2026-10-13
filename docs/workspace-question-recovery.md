# Workspace and clarification recovery — 0.4.5

## Confirmed cause

`ConnectionRegistry.profileMatches` applied `every()` to an empty capability list. With no provider hint either, every saved credential matched a local workspace prerequisite. The generic resolver then inserted a complete imperative description into `Which <description> should Gitu use for <requiredFor>?`, producing the malformed question and unrelated account choices shown in the report.

The subscription reasoning transport deliberately uses an empty directory and a read-only sandbox. Those settings isolate its own tools; they do not determine Gitu's project access. The previous instruction distinguished the environments, but supplied no host filesystem access snapshot or dedicated workspace recovery. Consequently the model's unsupported access claim could enter connector recovery.

A separate startup fallback replaced a failed selected-project detection with the server's default project for indexing and service setup. Missing child paths could also resolve upward to a parent project's marker. Both paths now fail closed.

## Resulting behavior

The selected project is resolved to an existing directory before project detection. Gitu uses its canonical locked checkout, including the active worktree where applicable. An asynchronous host probe checks directory existence, guarded read access, guarded filesystem write access, and suitability as a command working directory. The probe never writes a test file or executes a command to obtain authority. Real file operations and commands still apply the existing guard and risk policy.

Workspace recovery runs before connector discovery. An already usable selected workspace is reused automatically, even if the model wrongly cites the reasoning sandbox or labels that unsupported claim a permission problem. An observed tool denial still requires the existing permission controls. A requested `workspacePath` cannot silently replace the selected checkout. Unavailable or mismatched targets pause with the task history retained. No missing project falls back to another repository. An OS permission failure while saving task state pauses before model execution; disk-full and unrelated failures retain their actual errors.

Workspace questions accept only actual accessible directories under existing grants, with the access required by the question. Read-only reference choices cannot be used as writable coding workspaces. Candidate aliases are deduplicated after canonicalization. Distinct POSIX paths retain their case. Invalid paths, files, removed directories, private state and unrelated connector labels are excluded.

Connector recovery requires a provider hint or concrete capabilities. Matching account choices are validated; unavailable accounts are excluded. Duplicate resource IDs are removed; different resources sharing a display name include their IDs so they remain distinguishable. Other business/style questions retain their own options and never receive a connection inventory.

Clarification answers are saved in the existing task ledger, keyed by goal, question and choices. Continuations and model retries reuse those answers, and current-goal answers return to model context after compaction or restart. Changing the goal or available choices permits a new question. Timeout defaults are not saved as user decisions.

Routine authorized investigation, edits and verification continue autonomously. Genuine ambiguity still reaches the user. A denied command remains denied after a conversational “yes”; an explicit policy approval is still required. Permission blocks do not generate an additional generic workspace question after the permission decision. Folder read grants, file-write grants, command approval and external-service access remain separate. Folder tags never rebind a task's locked project.

The question card uses the existing app controls and theme, explains the required input, opens the existing folder access controls and contains long paths at narrow widths. It says “needs your input” rather than claiming every question occurs before work begins. Settled cards are removed.

## Changed files

| Area | Files |
| --- | --- |
| Workspace access and recovery | `src/recovery/workspace.ts`, `src/recovery/prerequisites.ts`, `src/guard/project-guard.ts` |
| Agent routing, context and durable answers | `src/agent/gitu.ts`, `src/agent/question-memory.ts`, `src/agent/prompt.ts` |
| Typed questions and prerequisites | `src/agent/action-parser.ts`, `src/agent/recovery-synthesizer.ts`, `src/types.ts`, `src/coding/contract.ts`, `src/coding/events.ts` |
| Connector matching and health | `src/connections/connections.ts` |
| Reasoning transport instructions | `src/llm/codex-subscription.ts` |
| Startup and question UI | `src/server/server.ts`, `src/server/ui.ts` |
| Regression checks | `tests/workspace-recovery.test.ts`, `tests/question-options.test.ts`, `tests/prerequisites.test.ts`, `tests/connections.test.ts`, `tests/server.test.ts` |
| Native flow check | `scripts/workspace-question-smoke.cjs`, `scripts/workspace-question-preload.cjs` |
| Version | `package.json`, `package-lock.json` |

## Verification

All 180 focused tests passed. They cover writable, read-only, missing and multiple directories; invalid and inaccessible targets; duplicate choices; irrelevant accounts; grant revocation during an asynchronous probe; unsupported model permission claims versus observed command denial and approval; the same task continuing without repeated investigation; saved answers across ledger reload; changed goals and choices; and other question types. Existing Agent workflow, project guard, connection, subscription-bridge and HTTP approval/question regressions are included. TypeScript compilation, targeted lint, repository formatting and whitespace checks passed.

After `npm run build`, run `electron scripts/workspace-question-smoke.cjs` for the isolated native check. It creates a disposable owner and two real sample directories. The actual Gitu engine and HTTP runtime produce the question; the actual Electron renderer displays it, opens folder controls and submits a selected answer to the real answer endpoint using native mouse input. The fixture checks that choices and the submit button are uncovered. The engine reuses the answer when the question is repeated, edits and verifies only the selected sample, retains the task ID, and removes the answered card. All 12 flow checks passed. Desktop and narrow-window screenshots are saved in its fixture directory. `GITU_SMOKE_BUNDLE` selects a packaged application directory for the same check.

The model is scripted so the regression is deterministic. This proves application routing, permissions, UI and continuation; it does not prove that every live model will obey the instructions. The OS-level read-only denial is simulated in the probe test; actual application read-only grants and actual command denial/approval are exercised. No user repository, live credential, owner runtime, or installed desktop is modified by these tests.

Both Windows x64 0.4.5 packages passed archive CRC checks. All 573 bundled runtime, desktop and asset files matched source; voice-worker files matched separately. The bundled executable passed CLI startup, isolated server health, background search and cancellation. SHA-256 sidecars and `Agent-Gitu-0.4.5-build-manifest.json` record the result. The 12 native question-flow checks passed using the packaged application modules in the matching pinned Electron runtime, with screenshots inspected at desktop and narrow widths. This does not launch the installed product's main entry point or prove its installer/tray lifecycle. The first installer assembly failed with a partial executable; retrying from the CRC-verified final archive succeeded. The initial assembly failure's precise cause is unconfirmed.

Changing a task to an unrelated repository is not inferred from a chat answer. Select the intended project explicitly; restore the locked folder to resume an existing task. Native installation/update/uninstall, tray lifecycle and macOS/Linux release checks remain separate release gates. Cross-platform GitHub Actions remain unavailable while the account's billing lock is in effect.

The parent workspace's Byterover tools are unavailable in this session. This document preserves the confirmed cause and reusable recovery pattern in the repository instead of claiming a memory-tool write occurred.
