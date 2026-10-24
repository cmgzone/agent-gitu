# Project navigation and reliability — 20 October 2026

Version 0.4.12 adds the same Code sidebar to the home screen and active chats.
The centered home composer, mobile drawer, saved collapsed width and matching
light/dark colors continue to work.

## Project and chat controls

- Expand a project to open its saved chats, with the active chat highlighted.
  The selected project starts expanded; expansion and Show all chats are saved.
- Pinned projects stay visible before four recent unpinned projects.
- Project actions provide pin/unpin, a display name, Open folder, Continue latest
  chat, archive, restore and Remove from sidebar. Archived & hidden exposes the
  restore controls. Renaming changes the display label; folders, sessions and
  run identities keep their existing paths and IDs. Active chat labels track the
  actual run folder even when a different project is selected for new tasks. Archive/hide preserves all
  files and chat history, and works while a chat is running.
- Badges report saved pending questions/approvals/reviews, running/retrying tasks
  and failures. Expanded chats show their individual status. The sidebar refreshes
  every five seconds while the page is visible and retains keyboard focus during
  updates. Leaving the view disposes its refresh timer.
- Each project has its own saved task draft and in-memory staged attachments.
  Each chat has its own saved follow-up draft. Draft text is redacted through the
  existing credential filter before local storage is written. Upload staging is
  not persisted across reloads. A delayed task-start response cannot clear a
  different project's draft or attachments added after submission.
- Preferences and drafts are saved on this device, keyed by canonical folder
  path or run ID. Equal folder names remain separate. They are not a new server
  project registry or a change to Company memory sharing.
- Desktop Open folder uses an explicit preload method. The native handler accepts
  only a directory from the trusted main app frame and origin, resolves its real
  path, and handles unavailable folders and OS failures. It cannot open arbitrary
  executable files. Web clients open the existing folder browser for inspection.

## Reliability audit

The earlier six-suite audit was reproduced: 74 checks passed and 17 failed.
The final focused audit passes 99 checks, including the autonomy suite and an
additional comparison of persistent and bounded specialist behavior.

The documented `persistent: false` policy now honors the legacy specialist
estimate and a generic request to block. Structured prerequisite recovery keeps
its existing authority. Persistent autonomy retains continued recovery and
uncapped specialist estimates; the new paired regression verifies both policies.
Explicit acceptance of a strict-risk quality-review warning now emits an audit
notice as well as recording the accepted risk.

Old bounded-run fixtures now select that policy explicitly. Observation fixtures
retain earlier screenshots/follow-up context across later recovery calls rather
than overwriting their observations. Page text is tested against the current
full-digest contract. The regression-proof fixture verifies the command declared
by its criterion and still requires the report to disclose missing fail-before /
pass-after proof. An unrelated command cannot satisfy a declared verification.
The source mobile CLI passed the isolated rerun and the final combined rerun;
its initial startup deadline failure was not reproduced in those runs. Its
startup deadline was not increased.

## Validation and remaining gates

All 288 distinct focused checks pass across six reports:

- `.qa/reliability-sidebar-final.json`: 99 checks.
- `.qa/sidebar-safety-final.json`: 115 checks, including credentials, prerequisite
  recovery, quality reviews, follow-up continuity and native directory access.
- `.qa/sidebar-company-final.json`: 22 coordination, workspace and shared-memory
  checks.
- `.qa/sidebar-composer-final.json`: 21 composer, model-loading and report checks.
- `.qa/sidebar-context-final.json`: 31 checks, overlapping earlier UI checks and
  adding recovery from a temporary sidebar loading failure.
- `.qa/sidebar-desktop-memory-final.json`: 33 checks covering desktop startup,
  trusted folder access and memory scoping/audit persistence.

The broader fast suite completed with 3,042 passed, three failed and 19 skipped.
Two desktop startup fixtures resolved the new folder module relative to the test
file; the fixture now resolves desktop modules from the actual desktop entry.
The unchanged 505-event memory audit exceeded its 15-second limit under the
combined run and passed on rerun in 12.3 seconds with the same limit. All three
cases and their surrounding suites pass in the 33-check rerun above. Merging
the fast run with the focused reports yields 3,135 distinct passing checks and
19 skipped checks. This is not a claim that the original fast invocation passed
or that its memory-audit timing variability is resolved.

The production UI fixture passes at 1600×900, 1360×768, 390×844 and 360×740 in
light/dark themes. It covers project selection, pinning, display names, archive /
restore, folder targets, shared navigation in real Code chat rendering, draft
restoration after reload, collapsed-width restoration, composer centering, and
project/draft/attachment isolation while a real task-start response is delayed.
Screenshots are in `.qa/project-sidebar/`.

The source build and targeted ESLint checks pass. The staged Electron 43.4.0 /
Node 24.18.1 app passed isolated startup, server health and the Company operations
smoke check; 362 runtime/desktop/asset files match current source. These results
do not replace a full repository regression rerun or native installation,
update/uninstall, tray, cross-platform and private-computer acceptance checks.

A minimal real request to the configured Alibaba `qwen3.8-max` model received
HTTP 400. The provider reported access denied / account standing with an overdue
payment help reference. No project files or business accounts were sent, and no
saved model selection was changed. Live Company endurance and recovery remain
unverified. The redacted result is `.qa/provider-live-sidebar.json`.

## Local Windows delivery

Both `release/windows-0.4.12/Agent-Gitu-Setup-0.4.12.exe` and
`release/windows-0.4.12/Agent-Gitu-Portable-0.4.12.exe` were assembled successfully.
Each executable archive and application payload passed CRC checks, and 27
critical navigation, desktop, agent and Company modules match current compiled
source by SHA-256. Adjacent `.sha256` files and
`Agent-Gitu-0.4.12-build-manifest.json` record the exact artifacts and checks.
The complete unpacked app remains in `release/windows-0.4.12/win-unpacked/`.
Close the older app before launching the new version.

An earlier assembly ran out of disk space. Automatic approval review rejected
removing older release leftovers without a detailed reason, so those files were
preserved. Disk space subsequently became available and both final packages
were built and verified. No installation, update/uninstall, publication or tray
lifecycle acceptance was performed.
