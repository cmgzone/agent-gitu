# Agent Gitu

A **bounded autonomous engineering agent**. Hermes is not a chatbot with shell
access — it is a control plane for autonomous work: it locks a project, plans
bounded actions, executes through policy-gated tools, verifies with evidence,
prevents loops, and only claims completion when every acceptance criterion is
backed by passing evidence.

> Hermes must know the difference between *"I did something"* and
> *"the task is actually complete."*

## Architecture

```
            CLI (src/cli.ts)
                 │
         Hermes orchestrator (src/agent/hermes.ts)
                 │
   ┌─────────────┼──────────────────────────────┐
   │             │                              │
ProjectGuard  TaskLedger                  LLM client
(scope lock)  (persistent task state)     (OpenAI-compatible)
   │
   ├── ContextEngine   ranked, role-labeled, budgeted context packs
   ├── Executor        policy-gated tool dispatch + action log
   │     ├── PolicyEngine    safe / moderate / dangerous tiers, approvals
   │     └── LoopDetector    action hashes + normalized error signatures
   ├── EvidenceEngine  evidence records + completion gate
   ├── CheckpointManager     git snapshots per step, rollback refs
   ├── MemoryStore     typed memory: project/decision/task/failure/…
   └── Reporter        completion reports
```

### The control loop

```
Lock project → criteria → context pack → plan →
  execute one action → observe → verify → record evidence →
  on failure: record, new hypothesis, never repeat blindly →
  when all criteria have passing evidence → complete → report + memory
```

### The guarantees

| Mechanism | What it prevents |
|---|---|
| **ProjectGuard** | Editing the wrong project / files outside scope |
| **TaskLedger** | Forgetting what was tried; lost state between turns |
| **EvidenceEngine + gate** | Saying "done" without proof |
| **Workspace fingerprint** | Citing stale evidence as fresh (any later edit invalidates it) |
| **LoopDetector** | Repeating the same failing action forever |
| **MalformedCallTracker** | Burning turns on a spiral of schema-broken tool calls |
| **PolicyEngine** | Unapproved destructive commands (fail-closed tiers) |
| **CheckpointManager** | Irreversible damage (git branch + snapshot per step) |
| **Specialist evidence gate** | Accepting a sub-agent's "done" without revalidating its evidence against the delegated contract |
| **Task↔session↔git binding** | Resuming a task in the wrong working tree or on the wrong branch |
| **LSP intelligence layer** | Blind text search for symbol facts; `lsp_diagnostics/definition/references/hover/symbols` + automatic post-edit diagnostics check, task-type → investigation strategies |

## Quick start

```bash
npm install
npm run build

# Web UI — agent state viewer (live task state, evidence, approval gates)
node dist/cli.js ui --port 8321        # then open http://localhost:8321

# Desktop app — Electron shell around the same Web UI, with the in-app browser
npm run app                            # builds, then launches the desktop window

# inside any project (package.json / pyproject.toml / cargo.toml / go.mod …)
node dist/cli.js init
node dist/cli.js run "Fix the streaming renderer" \
  --criteria "tool results stream incrementally|existing tests pass"

# inspect state afterwards
node dist/cli.js tasks
node dist/cli.js show <taskId>
node dist/cli.js report <taskId>
node dist/cli.js memory
```

Environment for `run`:

```
# Alibaba Cloud Model Studio / DashScope (provider: alibaba)
HERMES_ALIBABA_API_KEY | DASHSCOPE_API_KEY | ALIBABA_API_KEY
# endpoint defaults to the workspace URL built in for this deployment;
# override with --base-url or HERMES_BASE_URL

# OpenAI (provider: openai)
HERMES_OPENAI_API_KEY | OPENAI_API_KEY

# Any OpenAI-compatible endpoint (provider: custom)
HERMES_API_KEY  (+ optional HERMES_BASE_URL, HERMES_MODEL)
```

Select explicitly:

```bash
node dist/cli.js providers                       # show providers + key status
node dist/cli.js models --provider alibaba       # list all models (live from the endpoint when a key is set)
node dist/cli.js models --pick                   # interactive model chooser
node dist/cli.js run "goal" --provider alibaba --model qwen3.7-max
```

The alibaba catalog is fetched live from `GET /models` on your workspace
endpoint whenever an API key is configured, so new models appear
automatically; a built-in fallback list (qwen3.7-max, qwen3.7-plus,
qwen3.6-flash, qwen3-coder-*, deepseek-v4-*, kimi-k2.7-code, glm-5.2, ...)
is shown when offline or keyless.

## Development

```bash
npm run typecheck   # strict TS
npm test            # vitest: 284 tests incl. end-to-end runs with a mock LLM
```

### Layout

```
src/
  agent/      orchestrator + system/state prompts (strict JSON protocol)
  guard/      ProjectGuard — workspace detection, scope lock, boundary checks
  ledger/     TaskLedger — persistent task object (.hermes/tasks/<id>.json)
  context/    ContextEngine — file roles, relevance scoring, budgets
  executor/   Executor — dispatch, capture, action records
  policy/     PolicyEngine — risk tiers + command classifier (fail closed)
  loop/       LoopDetector — signature-based repeat prevention
  evidence/   EvidenceEngine — evidence records + completion gate
  checkpoint/ CheckpointManager — git branch/snapshot/rollback
  memory/     MemoryStore — typed, scoped memory (.hermes/memory.json)
  report/     Reporter — completion reports
  llm/        LlmClient interface, OpenAI-compatible client, scripted mock
  browser/    BrowserBridge interface + url normalization for the in-app browser
  tools/      read/write/edit/list/search/shell/browse implementations
desktop/      Electron main — desktop shell + offscreen agent browser
tests/        unit + end-to-end (mock LLM) suites
```

## Roadmap

- [x] Phase 1 — Control: project lock, ledger, action log, loop prevention
- [x] Phase 2 — Context: role labeling, relevance ranking, budgeted packs (basic)
- [x] Phase 3 — Verification: evidence capture, completion gate, reports
- [x] Phase 4 — Memory: typed entries, failure/task memory wired into runs
- [x] Phase 4 — Memory: typed entries, failure/task memory wired into runs
- [x] Phase 5 — UI: agent-state viewer WebUI (SSE live feed, criteria/plan/evidence panels, approval gates)
- [x] Electron desktop shell (offline, in-app browser for visual verification)
- [ ] Deeper context: import graphs, semantic search, edit history signals

## Web UI

`hermes ui` starts a zero-dependency HTTP server (built-in `node:http`) that
renders the agent's **state**, not a chat transcript:

- current task, status, hypothesis
- acceptance criteria with satisfied/open state + linked evidence
- plan steps with per-step status/attempts
- evidence list (PASS/FAIL, kind, command)
- files changed, blockers, completion report
- live activity feed via Server-Sent Events
- **approval gates**: dangerous actions pause the run until approved/denied in the UI
- collapsible left/right sidebars (tab handles, persisted per browser)
- **Browser panel**: the desktop app opens a real Chromium browser window
  (Chrome under the hood) that you can use like a normal browser. The agent
  drives it with the `browse` tool (navigate / screenshot / click / type /
  back / forward / reload); while it does, a "Hermes is driving the browser"
  banner and an animated cursor with click ripples are injected into the page
  so you always notice what it is doing. The Browser tab in the side panel is
  a live view of that window with its own address bar and an Open/Focus
  button. Screenshots are delivered to vision-capable models.
- **image attachments**: the composer accepts up to 4 images; they are sent to
  vision-capable models only (the model picker marks them, attach is disabled
  for text-only models)

The desktop shell (`npm run app`) is fully offline-capable: the server and UI
run locally inside Electron; only LLM calls need network. If port 8321 is
taken it binds a free port automatically.

## Agent Gitu home

On first launch Hermes creates its own workspace (never a drive root):

```
C:\Users\<you>\AgentGitu\
├── Projects\    default location for "New project" (change in Settings → Workspace)
├── Workspace\   free-form scratch space
├── Sessions\    session history database
├── Settings\    settings.json + stored API keys
└── Cache\       caches
```

`New project` in the sidebar creates `<home>\Projects\<name>\` (with a
`package.json` so the project guard detects it) and switches the session to
it. Override the home with `HERMES_HOME_DIR` if needed.

API: `GET /api/project|models|tasks|runs`, `POST /api/runs`,
`GET /api/runs/:id/stream` (SSE), `POST /api/approvals/:id`.


