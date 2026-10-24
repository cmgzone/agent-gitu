# Coding-agent question replies — 21 October 2026

The Code conversation had two independent duplication paths. Native Codex
streamed an answer and then emitted its completed snapshot as another text
chunk. The UI also appended a completion report with the same final answer.
Questions without a final question mark could additionally enter implementation
acceptance checks, producing an answer followed by a complaint about missing
code changes.

## Changed behavior

- A native completed message uses the existing authoritative `say` event. The
  UI replaces the partial stream with that snapshot in both coding and chat mode.
- An exact duplicate completion report stays out of the conversation. Polling
  before the final SSE message is reconciled too. New limitations, findings and
  genuine failure outcomes remain visible.
- The full report is available in a collapsed **Completion report** disclosure
  in **Task details**, including its verification and file information.
- Replies to follow-up questions have explicit `responseKind: discussion`
  metadata. Their unfinished coding task remains paused with its original goal;
  its paused status does not create a second copy of the discussion answer.
- Ordinary grammatical questions can omit `?`. Explicit implementation
  requests remain work. Per-turn narration state resets at user-message and
  history-replay boundaries, preserving identical answers to separate questions.

## Validation

There are 121 distinct passing checks across
`.qa/single-answer-tests-final.json` (119) and
`.qa/single-answer-discussion-tests.json` (80, with overlap). They cover native
supervision, question classification, follow-up continuity, report rendering,
credential handoff and main chat behavior. The initial combined invocation hit
one existing native-check timeout; the unchanged timeout passed in subsequent
runs. The older assertion that reports must never appear in task details was
updated to the intended disclosure behavior.
The final report-history cases also pass in `.qa/single-answer-history-tests.json`;
they preserve all 121 distinct checks after the last rendering adjustment.

The real-browser fixture `.qa/single-answer-browser.ts` passes streamed snapshot
replacement, poll-before-SSE delivery, repeated questions, paused discussions,
report access, visible limitations, chat mode and reopened-history replay. Source
build, targeted ESLint and whitespace checks pass.

## Preview delivery

`release/question-replies-preview/win-unpacked/Agent Gitu.exe` is a separate
preview of this source patch on the 0.4.13 runtime. Compiled source, desktop code
and executable entry points are independent copies. Immutable dependency,
runtime and asset files use NTFS hard links to conserve disk space. The existing
0.4.13 Setup and Portable downloads have not been replaced.
The preview passed isolated Electron startup and Company health checks, and all
362 runtime, desktop and asset files match source. `preview-manifest.json`
records the focused checks and hashes of the changed runtime modules.

Use Gitu's tray menu **Quit Agent Gitu and stop agents** before switching to the
preview, so its engine can own the workspace. Installation/update/uninstall and
a full repository regression are not covered by these checks.
