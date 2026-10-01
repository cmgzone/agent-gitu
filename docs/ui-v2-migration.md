# UI v2 migration: OpenMuse-derived client + AG-UI adapter

Status: **paused** — the original Gitu UI is the active web and desktop
interface. The proposed Expo UI cutover was reverted after review.

The OpenMuse-derived client now runs as a separate **mobile companion**, not a
desktop UI cutover. Its active entry is `apps/mobile/src/gitu/app.tsx`, backed by
Gitu's authenticated REST API and cursor-based mobile event pages. It includes
chat, task activity, approvals, plan review, questions and reviewed text-file
editing. Teams connects to Cowork's shared teammate profiles, group/direct chats,
topic threads, live activity and request decisions. Web export is served at
`/companion/`; native Android/iOS share the
same client. See `apps/mobile/README.md` for setup and current limits.
The AG-UI architecture and migration phases below remain the historical,
paused replacement proposal.

## Goal

Replace the server-rendered UI (`src/server/ui*.ts`, ~660 KB of template
strings, displayed in an Electron shell via `desktop/main.cjs`) with the
OpenMuse `apps/mobile` client (React Native/Expo, one codebase for
iOS/Android/web). Gitu keeps its own server, runtime, task engine,
persistence and computer runtime; only the UI layer is adopted.

OpenMuse source: <https://github.com/CopilotKit/openmuse> (MIT). Vendored
copy lives in `apps/mobile/` with `apps/mobile/LICENSE-OPENMUSE` preserving
the copyright notice.

## Architecture

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│ apps/mobile (Expo)          │         │ Gitu server (node:http)      │
│  chat / composer / cards    │  AG-UI  │  /api/copilotkit  (Phase 1)  │
│  approvals / evidence gate  │◀───────▶│   └─ GituAguiAgent           │
│  cowork / mission control   │  REST   │        └─ GituRunBridge ──┐  │
│  budgets / permissions      │◀───────▶│  existing /api/* routes   │  │
└─────────────────────────────┘         └───────────────────────────│──┘
                                        RunSession.subscribers ◀────┘
```

- The client speaks **AG-UI** via `@copilotkit/react-native/headless`
  (exactly as upstream OpenMuse does).
- `src/server/ag-ui.ts` is the adapter: `AguiTranslator` projects Gitu's
  session stream (prose rows + typed `CodingEvent`s) onto AG-UI events;
  `GituAguiAgent` (an `AbstractAgent`) is the run-level wrapper.
- `GituRunBridge` is the seam `server.ts` implements over `RunSession`:
  start/continue a run, subscribe to `session.subscribers` (replaying the
  durable backlog first), report terminal status.

## Event mapping

| Gitu source                       | AG-UI                                              |
| --------------------------------- | -------------------------------------------------- |
| `say …` prose row                 | TEXT_MESSAGE_START / CONTENT / END                 |
| `user-msg …` row                  | dropped (client already rendered the input)        |
| `file {…}` row                    | CUSTOM `gitu.file.shared`                          |
| unclassified prose                | CUSTOM `gitu.log`                                  |
| `command_started/finished`        | TOOL_CALL_* `run_command` (correlated by command)  |
| `test_started/finished`           | TOOL_CALL_* `run_tests`                            |
| `file_read` / `file_changed`      | TOOL_CALL_* `read_file` / `edit_file` (synthetic)  |
| `approval_required/resolved`      | CUSTOM `gitu.approval.*` + open/closed tool call   |
| `plan_review_requested/resolved`  | CUSTOM `gitu.plan_review.*` + tool call            |
| `questions_requested/answered`    | CUSTOM `gitu.questions.*` + tool call              |
| `evidence_recorded`               | CUSTOM `gitu.evidence.recorded` + STATE_DELTA      |
| `plan_created`                    | CUSTOM `gitu.plan.created`                         |
| `chief_decided`                   | CUSTOM `gitu.chief.decided`                        |
| `policy_denied`/`operation_blocked` | CUSTOM `gitu.policy.denied` / `gitu.operation.blocked` |
| `checkpoint_created/restored`     | CUSTOM `gitu.checkpoint.*`                         |
| `recovering`                      | CUSTOM `gitu.recovering`                           |
| `completed` / `failed`            | CUSTOM `gitu.run.completed/failed` + RUN_FINISHED / RUN_ERROR |

Planned (not yet emitted): Cowork sub-agents → SUBAGENT_STARTED/FINISHED;
budget updates → CUSTOM `gitu.budget.updated` + STATE_DELTA `/budget`.

## Phases

0. **Foundation (done)** — vendor `apps/mobile`, add `@ag-ui/core` /
   `@ag-ui/client` / `rxjs`, land `src/server/ag-ui.ts` + translator/agent
   tests.
1. **Mount the endpoint** — implement `GituRunBridge` over `RunSession` in
   `server.ts`; expose the agent through `@copilotkit/runtime`
   (`createCopilotHonoHandler`-equivalent; Gitu uses raw `node:http`, so a
   thin fetch-style adapter or a Hono sidecar on an internal port). Decide:
   mount in-process vs sidecar.
2. **Client adaptation** — rebrand `apps/mobile` (Gitu name/colors/mascot),
   point `EXPO_PUBLIC_API_URL` at the Gitu server, replace OpenMuse's
   mail/calendar screens with Gitu screens (Cowork, Mission Control, Agent
   Tree, Evidence Gate, Coding Workspace, Budgets, Permissions) fed by the
   existing REST routes and the custom `gitu.*` events.
3. **Electron cutover** — `expo export` the web build, serve it from the
   Gitu server, point `desktop/main.cjs` at it. Web and mobile share the one
   client.
4. **Removal (needs explicit approval)** — delete `src/server/ui*.ts`,
   `tests/ui.test.ts`, `tests/cowork-ui.test.ts`, `tests/mobile-web.test.ts`
   and the HTML-serving routes once the new UI reaches parity.

## Verifying

```sh
npx vitest run tests/ag-ui-translator.test.ts   # adapter unit tests
npx tsc --noEmit && npx eslint src/server/ag-ui.ts
```
