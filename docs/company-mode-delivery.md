# Company mode delivery tracking

This is an implementation checkpoint, not a release-completion declaration.

## Codex model update — 21 October 2026

The local 0.4.13 update upgrades the bundled Codex SDK/runtime from 0.155.1 to
0.163.0 and updates the subscription fallback model list. All 189 focused checks
pass; GPT-6.1 Sol is discovered by the packaged runtime and answers a minimal
real request through the source bridge. See [validation](codex-model-update.md).
The Windows Setup and Portable packages both pass archive and embedded runtime
verification, including a SHA-256 comparison of the bundled Codex executable.

## Project navigation and reliability — 20 October 2026

The local 0.4.12 update adds expandable project chats, pinning, display names,
archive/restore, folder opening, status badges, separate drafts and consistent
Code navigation. All 288 distinct focused checks and desktop/mobile browser flows pass;
the staged Electron app matches 362 runtime/desktop/asset files and passes its
isolated health and Company checks. The real Alibaba connection check returned
an account access/payment restriction. See [behavior and remaining acceptance](project-navigation.md).
Both 0.4.12 Windows Setup and Portable packages pass archive integrity and
current-source verification. The broader fast run and focused reruns together
contain 3,135 distinct passing checks and 19 skips; the original fast run had
three failures, documented with their resolutions in the linked audit.

## Code home layout — 20 October 2026

The local 0.4.11 update moves recent projects and creation controls to a
collapsible sidebar, centers the task composer and keeps Code/Cowork as the
main mode switch. Forty focused checks and production-UI browser flows across
desktop/mobile and light/dark themes pass. See [layout and validation](code-home-layout.md).

## Company management from Cowork chat — 20 October 2026

The local 0.4.10 update adds detailed company lookup/search, native management
operations through the caller's company membership, live Cowork cards with
meeting review and question answers, and automatic shared memories of completed
meetings, tasks and workflow runs. Owner approvals and resource authority remain
enforced. See [behavior and validation](cowork-company-chat.md).

## Cowork company workspaces — 20 October 2026

The local 0.4.9 update moves Companies into Cowork navigation and replaces
company-only agent identities with memberships in the canonical Cowork roster.
Cowork teammates can create drafts, add existing teammates and share company
memory. Personalities, models and personal memory follow the same identity;
permissions, transcripts, budgets, resources and desktops remain scoped.
Existing profiles/history and attributable memories migrate without changing
saved agent IDs. See [implementation and validation](cowork-company-workspaces.md).

## Agent-initiated coordination — 20 October 2026

The local 0.4.8 update adds a durable meeting-request path for active employees,
including profiles without shell, configuration or file-write access. Requests
retain their author, reason, agenda and participants, deduplicate retries, and
wake the CEO through the existing Company queue. Authorized review schedules
one meeting atomically; the actual Cowork meeting runtime records each
participant's contribution. Requests and workflow proposals do not expand
organizational, tool, account or spending grants.

Employees can now propose typed workflow drafts using the native `propose`
action (`create` is an alias), without needing designer authority. Director
version approval and live-run authorization remain separate. Proposal retries
reuse their saved version, including after a later draft revision. Native
workflow validation now checks the supplied workflow input as well as the
definition.

Overview includes a director coordination view with pending requests, saved
discussion excerpts, exact-meeting links, workflow drafts, live/blocked runs
and exact-run navigation. Your decisions includes coordination reviews.
Boardroom identifies requesters and supports request review; Company Chat
links to coordination and current discussions. Context and scheduled-review
prompts teach agents when and how to use these actions. The browser checks
now select Chromium on Linux/macOS instead of requiring Windows Edge.

The new isolated integration coverage runs an actual Company chat through
the tool dispatcher and a separate employee-request → CEO review → two-agent
discussion through the durable runtime, using scripted model responses.
The expanded browser flow verifies request approval/decline, workflow and
discussion navigation, chat notices, preserved drafts, themes and mobile
layout. Compilation, lint and formatting checks passed. The packaged native
runtime passed isolated server health and coordination checks; 357 runtime,
desktop and asset files matched the workspace. `scripts/company-package-smoke.mjs`
repeats that comparison and runs the packaged Electron executable as Node.

Both Windows 0.4.8 executables passed archive and application-payload CRC
checks, and their embedded updated Company modules matched the final compiled
files. SHA-256 sidecars and the build manifest are in `release/windows-0.4.8`.
The full regression completed with 3,308 passes, 18 failures and 20 skipped
tests; all 28 Company-related suites passed. See
[the validation report](company-coordination-validation.md) for exact scope and
remaining failures. This is a local release candidate, not a claim of full
release acceptance. Native install/update/uninstall, live external providers
and cross-platform acceptance remain required. Existing unrelated local edits
were preserved and are included in local builds.

## Earlier checkpoints

The 0.4.7 Company management update adds scoped organization authority, moderated Boardroom meetings, approved handbook versions, evidence-based onboarding, immutable workflows with real mission execution, a visual workflow editor with separate simulation, and opt-in Google Calendar synchronization. The complete checkpoint is in [company-management-plan.md](company-management-plan.md). The source was merged into `main` and pushed to GitHub. Release preparation passed 177 checks across 25 suites, compilation, full lint, formatting and all four management browser flows.

Windows x64 0.4.7 Setup and Portable installers were built locally in `release/windows-0.4.7`. Both payloads passed archive integrity checks, all 629 bundled files matched source or committed Git bytes for checkout line-ending changes, and the bundled runtime passed CLI startup, isolated server health, background search/cancellation and Company management checks. SHA-256 sidecars and a build manifest record the artifacts. Setup assembly required a retry from the verified archive after a write failure; older staging was preserved, space recovered through compression, and additional output compression disabled. Native installation/update/uninstall, tray lifecycle, live Calendar and cross-platform acceptance remain pending.

The 0.4.6 source update redesigns Company navigation, owner decisions, task details and performance reporting using Paperclip as a design reference while retaining Agent Gitu's theme and shared chat. Four charts expose company-scoped recorded model activity, known AI spending, task status and teammate assignments, with 7/14/30-day ranges and task drilldowns. Work omits completed scheduler ticks and supports status, teammate and text filters. Questions appear near the conversation and in top-level decisions with drafts preserved. Full access command verification stays with the agent; legacy unfinished command reviews migrate to agent-managed history without claiming success, while uncertain external actions still require reconciliation. See [company-dashboard-ui.md](company-dashboard-ui.md).

Connections now has one workspace manager in Settings for apps, accounts and custom APIs; Company Resources manages their scoped grants. The shared custom API form includes a provider picker, masked credentials, optional advanced settings, inline test feedback and correction of the same saved connection after failure. Native Brave and Tavily API research works in Code, Cowork and Company without a browser or private computer, using granted accounts and fixed provider transports. Browser tools remain available for interactions and visual checks. Search API fees remain separate from AI model spending.

All 45 initial focused Company checks and the subsequent 56 connection/search/recovery/HTTP checks passed. Synthetic desktop/mobile Company and Settings flows passed, including chart drilldowns, task drafts, preserved chat, failed-test retry, credential correction, local-IP provider identifiers and grants only after successful connection checks. Compilation, targeted lint and formatting passed. The inert preview displays actual modules with explicitly marked demo data; App modes starts 14 pixels from the top at both 532×712 and 1440×900.

Windows x64 0.4.6 Setup and Portable packages built locally after disk space became available. Both payloads passed CRC checks, all 587 bundled files matched source, voice-worker resources matched, and the bundled executable passed CLI startup, isolated server health, background search and cancellation checks. SHA-256 sidecars and a build manifest record the artifacts in `release/windows-0.4.6`. Native installation/update/uninstall, tray lifecycle and the existing provider/cross-platform release gates remain open; GitHub Actions is still blocked by the account billing lock.

The 0.4.5 update fixes workspace recovery in the shared Coding runtime, including coding delegated by Cowork and Company. It verifies the selected checkout, distinguishes filesystem access from the subscription reasoning sandbox, rejects unrelated credentials as folder choices, pauses unavailable projects without selecting a different repository, and saves clarification answers across continuation and restart. Routine authorized work continues automatically; real permission denials still require explicit approval. All 180 focused regressions passed, with compilation, targeted lint and format checks. All 12 native Electron question-flow checks also passed against the packaged application modules in the matching pinned Electron runtime, including native mouse submission, continuation of the same task and exclusion of another folder. The complete diagnosis and test scope are in [workspace-question-recovery.md](workspace-question-recovery.md).

Windows x64 0.4.5 Setup and Portable packages built locally. Both payloads passed CRC checks, all 573 bundled files matched source, voice-worker resources matched, and the bundled executable passed CLI startup, isolated server health, background search and cancellation checks. SHA-256 sidecars and a build manifest record the artifacts. Installer assembly initially failed with a partial Portable output while C: had approximately 500 MB free; the precise cause is unconfirmed. Only those generated 0.4.5 executable outputs were removed. Assembly then succeeded using the completed archive after CRC and changed-file comparisons. Native installation/update/uninstall, tray lifecycle and cross-platform release checks remain pending.

The 0.4.4 search update addresses a Windows main-thread hang during Coding repository search. Persisted task events stopped at the search call, and a read-only reproduction of the installed implementation exceeded five seconds. Its CPU trace included synchronous file reads and project boundary checks. Search now uses asynchronous directory, file and permission-check I/O, off-thread pattern matching, and cancellation supplied by Coding and Cowork. It stops reading once the requested result count is reached and identifies incomplete result sets. There is no fixed scan duration, entry-count cutoff or directory-depth cutoff; directory links are deduplicated to prevent cycles. Existing read permissions, source-file size filtering and model output bounds remain. All 52 focused tool/guard/Company host-access checks pass, including deep source trees, directory cycles and cancellation during pathological regex matching. The compiled read-only reproduction on the same project returned results in 14.5 seconds while servicing 685 event-loop heartbeats at a 20 ms interval. The build, targeted lint and format checks pass. This diagnoses one reproduced hang path; it does not establish the cause of every reported native close.

Windows x64 0.4.4 Setup and Portable packages built locally. Both payloads passed CRC checks, all 569 bundled files matched source, voice-worker resources matched, and the bundled runtime passed CLI startup, isolated server health, background search and cancellation checks. SHA-256 sidecars and a build manifest record the artifacts. Native installation/update/uninstall, tray lifecycle and cross-platform release checks remain pending.

The 0.4.3 update replaces the Company redirect into Cowork’s teammate connection screen with company-scoped account setup. Mailboxes and Composio accounts can be granted to a company without requiring teammate access; owner-selected assignments are managed separately. Existing accounts require explicit company import, and removing access leaves other companies’ shared accounts intact. Mailbox recommendations open setup instead of prematurely accepting an unsigned connection. They resolve only after active sign-in and assignment to the requesting agent; running companies wake that conversation once. Delayed team updates cannot restore revoked company access. Friendly errors replace raw JSON messages, the app search uses the shared form styling, and setup returns to its saved resource step.

This change passes 50 focused connection/mail/assignment checks and 52 Company direction/Coding regression checks, plus the synthetic desktop/mobile flow including company sign-in, mailbox recommendations, accounts with no teammate access, upload resume/cancel and a 21 MiB video. The inert standalone connections preview loads without script errors. Typecheck, full lint, format checks and the build pass. Windows x64 Setup and Portable 0.4.3 packages are in `release/windows-0.4.3`; both payloads passed CRC checks, all 567 bundled files matched source, voice-worker resources matched, and the bundled runtime passed CLI startup and an isolated server health check. SHA-256 sidecars and a build manifest record the artifacts. The native release checks below remain pending.

The 0.4.2 update fixes a missing Composio setup form caused by the selected-teammate API reporting `configured: true` without a provider key. Workspace Settings and Company now open the connected-app flow, and company grant selection lists the owner's active accounts without auto-granting them. Company Team shows each agent's current assignments, mission progress, blockers, live tools and temporary-helper objectives; completed work remains in Work history. Team refresh preserves focus/computer controls and serializes status requests. All 80 distinct focused connection/mail/task/desktop regressions pass, as do synthetic desktop/mobile assignment flows, typecheck and lint. Windows x64 Setup and Portable packages were rebuilt with the Coding stream counter fix in `release/windows-0.4.2`. Both embedded payloads passed CRC checks, all 563 bundled files matched the compiled source, voice-worker resources matched, and the bundled runtime passed CLI startup and an isolated server health check. SHA-256 sidecars and a build manifest record these local artifacts. A stalled network fetch was replaced with the local Electron 43.4.0 archive after its SHA-256 matched the installed package's release manifest. Native installation, tray lifecycle and cross-platform release checks remain pending.

Desktop logs showed valid sign-in documents repeatedly classified as startup failures and a delivery control calling missing `cwUpdateSend`. Both defects are corrected, with regression checks for accepting the sign-in document and clicking delivery controls. The owner clarified that freezes also occur while the main Coding agent works on large projects. Coding event allocation scanned the complete transcript for every streamed chunk, making long runs quadratic on the Electron main thread. It now initializes a high-water counter once and increments it without rescanning, preserving cursor gaps and avoiding reuse after superseding the newest row. Both targeted cursor checks pass, including a 50,000-event transcript and 1,000 additional chunks; typecheck and targeted lint pass. Native crash collection is enabled locally with uploads disabled; renderer hangs and child-process exits are logged. Existing logs and Windows application events did not identify a fatal exit, so the reported whole-app close remains unconfirmed until diagnostics reproduce it. These fixes are not a claim that native crash validation has passed.

The 0.4.1 update aligns Company setup with the shared theme, orders modes Code/Cowork/Company, uses catalog-backed provider/model selectors, bounds/searches resource lists and decision details, and excludes superseded approvals from the pending count. Cowork can create durable company drafts with isolated lead IDs and a chat card; grants, budgets, file policy and Start remain owner decisions. Company/temporary-helper access is blocked and repeated creation is deduplicated across concurrent calls and restart. Live status and Cowork cards report actual worker state without interrupting focused navigation. The update passes 52 focused regressions, a real isolated-server creation/card integration check, typecheck, full lint and synthetic desktop/mobile/theme flows. Windows x64 Setup and Portable packages were built in `release/windows-0.4.1`; both payloads passed archive CRC checks, all 563 bundled files matched source, and the bundled runtime passed CLI startup and isolated server health checks. SHA-256 files and `Agent-Gitu-0.4.1-build-manifest.json` record the verified artifacts. Native installation/update/uninstall, tray lifecycle and cross-platform release checks remain pending.

Latest local validation: the Windows package passed checksum verification, bundled CLI startup, server health, archive extraction and data preservation across extraction of an update. Service installation remains unverified. The container integration script passed locally using the pinned Node runtime and an isolated Edge browser: company isolation, a 21 MiB upload resumed across server restart, checksum verification, video ranges and archive/restore. Linux container execution and Chromium validation are configured in CI but have not run here.

The subsequent reference/memory controls and Drive/OneDrive recovery changes pass 35 focused storage checks, the build, typecheck and lint; the recovery suite passes all ten cases. Synthetic desktop/mobile UI checks also pass. The earlier package must be refreshed after the remaining implementation work before release. Automatic approval review blocked removal of the disposable installer test directory; it remains intact.

The next checkpoint adds scoped S3 recovery and connection grant binding (42 focused checks), bounded browser SHA-256 verification, explicit upload resume/cancel controls (28 focused checks), and restrained Company styling with computer controls that follow actual state. Synthetic desktop/mobile flow checks pass, including upload resume/cancel and a verified 21 MiB video upload. Budget image/cached-price reservations and parallel helper slot recovery pass focused checks. A fresh fast regression run passes 2,563 cases with 19 skipped and no failures. Custom provider folder grants and uncertain submissions pass 24 storage checks; stable OneDrive recovery passes 30 cloud checks.

Quota-backed private computer provisioning, protected process execution and recovery pass 54 focused checks. Actual XFS kernel enforcement and the native guard compilation remain pending Linux CI. Windows desktop installer startup, tray close/reopen, Quit and data-preserving updates, plus native service lifecycle checks on all supported platforms, are now configured in CI and remain unverified. The user-visible demo is inert and the existing owner runtime has not been accessed.

GitHub Actions did not start the jobs on draft PR #5 because the cmgzone account is locked by a billing issue. The owner deferred resolving that issue. This is an external release-validation blocker; native platform checks have not passed. Final integration into main and release publication remain pending completion and validation.

Subsequent download-handshake scope checks, cancellation and company pause/recovery pass 50 focused checks. Company tabs now support arrow keys, Home/End and a single keyboard focus target; the synthetic desktop/mobile flows pass. The refreshed inert preview includes those controls. Mailbox discovery, exact model-facing schemas, native read/write permissions, approval waits and legacy encryption migration pass all 15 mailbox checks. Related Company, app, hosted-browser and continuity checks pass; all ten recovery cases pass in the final isolated run. The HTTP suite passes its remaining cases after replacing obsolete pause fixtures and correcting the completed-session continuation fixture. Typecheck, full lint, formatting and the build pass. Browser dependency failures now report unavailable state and HTTP 503 with setup guidance.

At the owner's explicit request, Windows x64 Setup and Portable builds for 0.4.0 were generated locally in `release/windows-0.4.0`. Both embedded payloads passed archive CRC checks. All 559 bundled runtime, desktop and asset files matched the current source, the bundled voice worker matched, and the packaged runtime passed CLI startup and an isolated server health check. SHA-256 files and `Agent-Gitu-0.4.0-build-manifest.json` record the artifacts, feature branch, base commit and included uncommitted changes. Lighter compression was used to reduce memory pressure; the interrupted maximum-compression archive was excluded and preserved separately. Installation/update/uninstall and tray lifecycle still require the disposable Windows CI runner. The installer smoke script's CI restriction was not bypassed.

The fresh 0.4.0 CLI archive also built successfully, but its extraction/update smoke check remains pending. These local packages are not a fully validated published release. Final delivery must preserve the existing Agent Gitu theme, use professional, purposeful screens and polished interactions, then commit the completed, validated work to `main`.

- [x] Company persistence, scopes, private snapshots and navigation/setup/detail UI.
- [x] Durable coordinator, versioned steering, questions, worker/helper admission, approvals and uncertain-action recovery controls.
- [x] Metered company model calls and finite budget reservations.
- [x] Local/remote private computers, binary Docker/broker/SSH transport and server browser bridge.
- [x] API/MCP connections, protected OAuth credentials and wallet grants/action journal.
- [x] User-chosen file ceilings, binary resumable web transfers, range downloads and native/custom storage adapters.
- [x] Tray lifecycle, service commands, versioned runtime packages and cross-platform CI configuration.
- [x] Global worker/computer configuration and durable computer admission; restart stops orphaned helpers on saved servers and retains uncertain capacity.
- [x] Shared Company chat design, draft preservation, delivery controls and responsive desktop/mobile checks.
- [x] Optional Use my computer owner grant, off by default, with live revocation checks and visible fallback notices.
- [x] Storage connection editing, supported-grant UI, disconnect credential revocation and transfer cancellation, verified with synthetic browser checks.
- [x] Complete finite pricing checks, per-attempt price snapshots and upload cancellation during chunk reception.
- [x] External reference import/removal with live grants, and owner memory correction/archive controls; API and desktop/mobile browser checks pass.
- [x] Empty OneDrive upload reconciliation retains its destination and protects conflicting provider files; mocked recovery checks pass.
- [x] Drive uploads persist provider IDs and folder scope before submission, recover expired sessions and verify uncertain completions; mocked checks pass.
- [x] S3 recovers expired multipart sessions and lost acknowledgements at the same destination, retains conflicts, validates saved scope/progress and bounds automatic recovery; mocked checks pass.
- [x] Storage account/folder changes and OAuth reconnects cannot reuse unfinished upload grants; late token refresh cannot restore an old account. External references retain their original grant.
- [x] Browser uploads compute SHA-256 in bounded slices and verify it before publication, with explicit Company file resume/cancel controls and network-error recovery.
- [x] Company screens follow the existing theme with restrained surfaces, visible keyboard focus and computer controls reflecting state and control ownership; synthetic desktop/mobile checks pass.
- [ ] Validate kernel disk quotas and process guards in real private computers; reconcile migration of legacy unbounded volumes.
- [ ] Verify native provider recovery, quota reporting, cancellation and authentication expiry across all adapters.
- [ ] Verify model pricing/output reservations and delegated coding inside private computers.
- [x] Finish keyboard tab navigation and the synthetic connection/file/computer flows on desktop and mobile.
- [ ] Run full regressions and platform/container/installer/service smoke validation; resolve new failures.
- [ ] Publish a verified versioned release after release checks pass.
- [x] Fix email tool visibility and connected-account execution, including exact schemas, read/write restrictions, approval waits and encrypted legacy migration; local regressions pass.

Separate personal-computer pairing for a hosted installation is outside this version. The optional Use my computer grant applies to the installation host, as described in the operating guide.
