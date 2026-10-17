# ChatGPT subscription execution in Agent Gitu

Implementation and verification record, 15 October 2026.

## Outcome and scope

ChatGPT subscription tasks now default to a Codex app-server agent loop. Codex owns the model/tool lifecycle; Gitu supervises permissions, durable task state, progress, cancellation, and final verification. Coding tasks, coding specialists, Cowork chats, missions, and temporary Cowork workers use this route. Other providers retain their existing Gitu runner.

On this Windows installation, native Codex **OS shell and patch tools remain disabled**. The official app-server dynamic functions call Gitu's guarded executor instead. This is a native Codex agent loop with application tools, not unrestricted native shell execution. The distinction is deliberate and visible in runtime status and persisted `toolExecution: gitu-guarded` metadata.

The implementation removes Gitu's action-JSON handoff and automatic outer continuation from this route. It cannot guarantee that a model will never repeat itself or that the subscription service will always be available. Repeated unchanged operations stop for review; productive command polling has no application deadline.

## Investigation findings

The legacy integration launches bundled Codex through `codex exec`, using supported Codex ChatGPT authentication. Its reasoning sandbox deliberately cannot edit the selected project. Gitu advertises its application actions in the prompt, parses the returned payload, executes the action, and sends the observation to a subsequent model request. Both the subscription bridge and Gitu have response-repair or continuation behavior. Changes to instructions/history can also replace the legacy reasoning thread.

This exposed several concrete failure paths:

- The model could mistake its deliberately restricted reasoning sandbox for missing Gitu tools and repeatedly describe a fix instead of dispatching it.
- Invalid application action payloads could terminate a run or trigger format repair. The screenshots include this exact error.
- A cleanup error such as Windows `EBUSY` could replace the outcome after useful execution. Cleanup is now nonfatal and process closure is awaited.
- Malformed command status requests could try to execute shell source named `status`, losing the association with the original managed command. The shared runner now normalizes only the unambiguous malformed shape with an existing `cmd-N` identifier; explicit shell execution is preserved.
- Rebuilding application context/index state on follow-ups and prose-only plans contributed to misleading indexing/checklist status. Native execution bypasses the Gitu code-index stage and writes actual checklist updates into TaskLedger.

These are observed implementation defects and plausible contributors to the reported behavior. The investigation does not establish one exclusive cause for every historical loop, or demonstrate that the ChatGPT subscription service itself is universally less reliable than other providers.

## Architecture

```text
Gitu UI / task / worker
  -> provider routing
  -> native task supervisor
  -> Codex app-server thread + one native turn
  -> structured dynamic function requests
  -> Gitu Executor / policy / ProjectGuard / managed command jobs
  -> structured function results returned to the same native turn
  -> explicit native turn completion
  -> Gitu acceptance and instruction checks
  -> task report
```

The app-server RPC uses `initialize`, `account/read`, `thread/start` or `thread/resume`, `turn/start`, `turn/steer`, and `turn/interrupt`. It streams item events and token usage. A final message and a completed native turn are separate from a verified Gitu task.

Dynamic functions include guarded reads/edits/search/commands, `gitu_task` for criteria/checklists/evidence, and `gitu_service` for the existing Gitu service catalog. The native code-mode host must be enabled to dispatch these functions on the tested Codex runtime; disabling it advertises tools the model cannot invoke. Gitu never asks the native model to emit legacy action JSON.

## Security and approvals

The installed Codex 0.155.1 runtime was probed directly, rather than relying only on generated types. It rejected explicitly setting the retired `untrusted` approval value. Its Windows elevated sandbox also rejected restricted read profiles unless granted effective `:root` read access. Broadening file authority was not an acceptable fix.

The selected design therefore:

- Pins a named, read-only native permission profile with network disabled, and verifies the effective profile and human approval reviewer before starting a turn.
- Disables native shell/unified execution, image-file tools, hosted browsing, host skill discovery, hooks, unrelated plugins/connectors, and native autonomous child agents. Configured MCP servers are disabled by name for the task.
- Declines raw OS approvals and permission expansion with a visible denial. Built-in OS effects are never approved. Coding stops native attempts at start; Cowork denies each stray built-in attempt with a steering correction and stops only for a completed built-in mutation or attempts that persist after denial.
- Executes effects through Gitu's existing policy, human approval callbacks, ProjectGuard, file restrictions, registered connection handlers, audits, and specialist supervision.
- Uses a minimal child environment and supported Codex sign-in. `account/read` must report ChatGPT authentication; API billing is never a fallback. No password, token extraction, or copied auth file is introduced.
- Preserves plan review when required, connected-operation approvals, and narrower worker grants. User questions/pause instructions prevent further mutations while allowing inspection.

The profile does not independently sandbox Gitu's host tools; those tools retain Gitu's existing enforcement boundary. Native OS tools can only be enabled in a future change after proving equivalent enforcement on supported hosts. This implementation intentionally does not grant that authority.

## Sessions, completion, and recovery

TaskLedger persists the Codex thread, current turn, workspace, execution mode, checklist phase, and admitted function-call identifiers. Admission is saved before a side effect. Duplicate requests return a cached result within the turn; an uncertain call admitted before interruption is not automatically replayed.

Follow-ups resume the same saved native thread, send the new instruction and current Gitu task state, preserve historical completed checklist items, and add a new work phase where appropriate. Cowork stores native session identity and a conversation-prefix fingerprint so normal follow-ups send appended messages. A workspace mismatch requires explicit new-task selection.

There is one authoritative native turn. Empty/progress-only output, a provider error, or failed acceptance does not start another native turn. Native errors do not trigger automatic provider fallback or Gitu's timed model-recovery restart. The compatibility bridge is used only through explicit configuration.

The supervisor checks real command outcomes, current workspace fingerprints, criteria, open checklist items, and active user instructions before reporting success. Existing passing evidence is reused. A running command is polled using its original `cmd-N` job ID, including after exit; verification never relaunches a compiler merely to recover its result.

Cancellation interrupts the native turn, terminates its owned runtime process tree, aborts Gitu command execution, and preserves the task. Separate tasks can execute concurrently; duplicate execution of the same native task/runtime is rejected. Repeated unchanged command results receive one steering correction before stopping. Repeated unchanged application requests and Cowork denials also stop without an outer restart.

## Files

New runtime modules:

- `src/llm/native-task.ts`: provider-owned execution contract.
- `src/llm/codex-native.ts`: official app-server transport, events, auth check, sessions, cancellation, usage.
- `src/coding/native-codex-permissions.ts`: restrictive native configuration.
- `src/coding/native-codex-supervisor.ts`: Gitu tools, ledger/checklists, policies, evidence, reporting.
- `src/cowork/codex-native.ts`: shared native execution for Cowork surfaces.

Integration changes cover `src/llm/{llm,providers,resilient,codex-subscription}.ts`, `src/agent/{gitu,subagent,task-recovery}.ts`, `src/cowork/{runner,store}.ts`, `src/server/server.ts`, and `src/types.ts`. Shared command request normalization is in the existing action parser, executor, policy, tools, and utility paths. Other earlier authorized indexing, product-limit, continuity, and UI fixes remain in the working tree.

## Verification

Automated coverage includes native runtime/supervisor/Cowork/provider routing, legacy subscription payload handling, command management/lifecycle, continuity, recovery, and specialist supervision. Native tests exercise simple answers, actual guarded reads/edits/commands, denied effects, duplicate admission, concurrent runtime isolation, token accounting, progress/empty output, explicit completion, disconnects, auth/quota errors, checklist persistence, and no-progress termination. Browser/network restrictions are checked at permission/dispatch boundaries; this is not a live test of every external browser/provider.

Final results across the targeted regression batches: **236 distinct tests in 19 files passed**, including 38 native runtime/supervisor/Cowork/routing tests. `npm run build`, full `npm run lint`, lint on subsequently changed files, and `git diff --check` passed. One command-event fixture initially timed out because its synthetic blocker was not a valid task prerequisite; it now stops on the observed terminal command event and all nine command-event tests pass. The source and assertions still exercise the real Gitu/Executor event path.

Live tests used the real installed Codex binary, ChatGPT authentication, and `gpt-5.6-luna` against disposable projects:

1. Read a module, observe a failing check, edit it, retrieve a passing check from its original command job, and complete a real four-step checklist.
2. Continue the same Gitu task and Codex thread, make a second edit, preserve the old completed checklist, add new steps, and pass verification.
3. Start a deliberately productive long-running command, stop Gitu, and confirm the child PID is gone and the native status is interrupted.
4. Resume that interrupted thread for a read-only question and confirm no command or worker is restarted. The original unfinished work remains paused.
5. Probe the native JavaScript dispatcher without file/network effects: `process`, `require`, and `fetch` were undefined; importing `node:fs` failed with `unsupported import in exec`.

Machine-readable local records are in ignored `.qa/native-live-result.json`, `.qa/native-continuation-result.json`, `.qa/native-cancellation-result.json`, and `.qa/native-interruption-recovery-result.json`. Build, lint, regression, and deployment records are also retained under `.qa/`.

The installed application was patched from the verified build with SHA-256 checks. Its 56 changed/new build files are recorded in `.qa/native-installed-manifest.json`. Previous files were saved under `C:/Users/Admin/AppData/Local/Programs/Agent Gitu/resources/patch-backups/native-codex-guarded-runtime-20261015-144558/` for rollback. Dependencies and the bundled Codex version were not changed.

A further real ChatGPT fixture imported the **installed** runtime, made the requested edit, retrieved the original command job's passing result, completed all four checklist steps, and produced a verified complete report. After restart, the application served HTTP 200 and revealed its sign-in window; all 56 installed file hashes matched. Records: `.qa/native-installed-live-result.json` and `.qa/native-installed-health.json`.

The legacy and native routes are compared by routing and response-contract regressions. The native live fixtures completed; no statistically meaningful production reliability comparison or reproduction of the user's entire mail task was performed. These checks support removing the handoff failure path, not a claim that all future loops are impossible.

## Configuration and remaining limits

ChatGPT native execution is the default; no new API key is required. `ResolveOptions.subscriptionExecutionMode: 'legacy'` or `GITU_CHATGPT_EXECUTION_MODE=legacy` selects the old bridge explicitly for diagnosis/rollback. This flag should be set before starting a task, not used as an automatic mid-task fallback. Other providers continue using their existing runner.

The runtime remains bundled Codex 0.155.1. A later runtime update needs protocol/security conformance checks again. Direct native OS execution is unavailable on this host under the required constraints. Live validation covered one subscription model and disposable projects, not every model, external integration, worker merge conflict, or long-lived development server. Native tasks use deterministic Gitu acceptance/instruction gates rather than introducing a second independent model-review loop.

After the application restart, continue the existing Gitu task. A new chat is unnecessary. Earlier edits and evidence remain in its ledger; switching from the legacy bridge to native execution creates a native thread for that existing task using saved Gitu state.

## References studied

- [Codex app-server](https://learn.chatgpt.com/docs/app-server) and [Codex SDK](https://learn.chatgpt.com/docs/codex-sdk): supported integration choices and lifecycle.
- [Codex permissions](https://learn.chatgpt.com/docs/permissions), [advanced configuration](https://learn.chatgpt.com/docs/config-file/config-advanced), and [approval/security guidance](https://learn.chatgpt.com/docs/agent-approvals-security): permission profiles and platform constraints.
- [Paperclip Codex adapter documentation](https://github.com/paperclipai/paperclip/blob/master/docs/adapters/codex-local.md), [local execution](https://github.com/paperclipai/paperclip/blob/master/packages/adapters/codex-local/src/server/execute.ts), [ACP](https://github.com/paperclipai/paperclip/blob/master/packages/adapters/codex-local/src/server/acp.ts), and [event parsing](https://github.com/paperclipai/paperclip/blob/master/packages/adapters/codex-local/src/server/parse.ts).

Paperclip provided useful patterns for session identity, incremental wake prompts, streamed progress, and process supervision. Its auth materialization and optional sandbox/approval bypass settings were not copied. Generated protocol references and retrieved source snapshots are retained locally under `.qa/native-codex-reference/`; actual binary probes resolved discrepancies with the generated schema.
