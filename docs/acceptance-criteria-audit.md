# Acceptance criteria investigation

15 October 2026. Scope: shared acceptance/evidence handling across providers, native Codex final verification, and continuation of existing tasks.

## What the mail agent actually did

The session `run-20261013-a10bc7`, task `hermes-task-20261013-a296e6`, was blocked when inspected. No installed Gitu-owned Codex process was executing it. The log records implementation work, 17 changed files, and a passing TypeScript check. Its last continuation answered the user's request to explain what happened and preserved the unfinished work as paused discussion.

Earlier, the final verifier had tried to execute these criterion descriptions as PowerShell source:

- `Focused automated regression test command for thread-search; repository typecheck where supported.`
- `Focused regression test plus source-level verification of separate search subscription and inbox path.`
- `Run available test/typecheck/build commands and record outputs.`

PowerShell reported that `Focused`, `repository`, and `Run` were not commands. This is a confirmed Gitu metadata/execution bug, not proof that the model failed to edit. The application also still had real functional/UI test gaps; a passing typecheck alone does not establish correct mail search behavior. No mail project source, criteria, or evidence was changed by this investigation.

The separate scheduled connected-app review was failing with an Alibaba account/model access error. That background failure was not a native ChatGPT execution loop.

## How criteria work

Each criterion has a stable ID and requirement text, optional exact verification command and evidence type, linked evidence IDs, and an acceptance flag. Tools record actual checks and their outcomes. Linking must match the criterion's command/type contract and current workspace. Final completion requires all active criteria, required checks, and relevant plan/instruction gates to pass. Completed historical phases remain separate from a new follow-up's requirements.

Plain criteria without a pinned command/type have a weaker contract. The engine cannot establish that an arbitrary test semantically covers a requirement; the chosen check must actually exercise that behavior. Binding a command is metadata repair and never counts as passing evidence.

## Defects corrected

1. **Descriptions executed as commands.** A read-only preflight parses/resolves command names in the actual host shell without invoking the proposed check. Native intake rejects unresolved verification descriptions; final verification reports the unresolved contract instead of executing it. Parent re-verification uses the same preflight before launching an oracle. Project-specific commands remain supported; this is not an executable allowlist.
2. **Locked invalid verification could not be repaired.** Native `gitu_service` now supports `bind_criterion_verification`, including saved threads with older tool catalogs. The shared runner accepts a matching `set_criteria` proposal to repair a missing/invalid verification on the same requirement. Requirement text and evidence type remain unchanged. Existing executable pinned commands cannot be replaced by this repair. Original descriptive guidance is retained in `verificationInstructions`; the repaired criterion still needs real evidence.
3. **Final gate trusted previously linked flags too much.** The shared evidence gate now rechecks command, evidence type, and nonzero exit status when loading/evaluating links. An older pass cannot conceal a newer failure for the same check/workspace.
4. **Fingerprint coverage stopped early.** Git scans stopped at 4,000 files; non-Git scans at 5,000 files or depth 12. Edits beyond those limits could leave the same fingerprint. Those ceilings are removed. Hashing streams large files and bounds simultaneous reads rather than limiting project coverage. Nested selected folders recognize parent Git repositories and remain scoped to the selected folder. Symlinks are fingerprinted as links, not traversed outside the workspace. Unreadable/incomplete coverage is explicitly rejected as proof of freshness.
5. **Follow-up deduplication dropped requirements.** Criteria with the same wording in a later work phase were discarded because deduplication searched completed history. Deduplication now applies within the active phase, preserving history and assigning the new requirement a fresh ID.
6. **Copy fixes triggered behavioral bug rigor.** A request to “fix the typo in README.md” triggered root-cause and fail-before/pass-after requirements just because it contained “fix.” Copy corrections now use ordinary verification; explicit runtime/behavioral failures retain bug rigor. Classification remains a heuristic.

The evidence and fingerprint fixes are shared across provider runners. Native Codex receives the additional preflight/repair integration needed for the actual observed defect. Other providers retain their existing execution architecture.

## Validation and limits

Regression coverage includes the three actual descriptive strings, resolving custom project commands without executing them, repair without changing requirements, immutable valid command pins, persisted command/type mismatches, later failed checks, incomplete fingerprints, edits beyond 5,000 files and the previous depth limit, nested Git selection, same-worded follow-up requirements, and copy-versus-runtime bug classification.

A real ChatGPT subscription run with the original malformed verification text successfully bound `node verify.cjs`, edited a disposable module, ran its actual assertion, linked its passing evidence, and completed its checklist. No descriptive sentence was launched. The same repair is exercised through the existing shared Gitu runner with a scripted provider.

Final targeted results: **202 tests across 13 files passed across regression batches and focused rechecks**. Build, full lint followed by lint on the final affected files, and diff whitespace checks passed. The full-coverage fingerprint tests cover both Git and non-Git projects beyond 5,000 files. An initial slow scan was replaced with parallel content reads; two regression timeouts exposed the copy-classification defect and a test's synthetic-blocker termination, both corrected and rechecked. The specialist evidence test now ends at the observed rejection while retaining its acceptance assertions.

The installed app received 23 changed/new compiled files with SHA-256 verification and was restarted. Its HTTP endpoint returned 200 and its sign-in window appeared. An installed-module smoke check confirmed description rejection, requirement-preserving repair, rejection of an older pass after a newer failure, and ordinary verification for a copy correction. Backup: `C:/Users/Admin/AppData/Local/Programs/Agent Gitu/resources/patch-backups/acceptance-verification-20261015-222103/`. Deployment and test manifests are in `.qa/acceptance-installed-manifest.json`, `.qa/acceptance-installed-health.json`, and `.qa/acceptance-validation-summary.json`.

Local records: `.qa/acceptance-live-result.json`, `.qa/acceptance-*.log`. Build, lint, installed-file verification, and regression results are retained there. The mail task itself has not been completed or rerun by this audit. Continue that same task after the installed update so it can bind meaningful functional checks and resolve its remaining test/UI dependencies.

Command-name resolution does not prove that arguments, scripts, or dependencies are correct. A resolved command can still fail normally, and all normal Gitu permissions and approval requirements still apply. The new gate does not automatically accept weaker checks or bypass unfinished requirements.
