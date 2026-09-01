# Agent Gitu

A **bounded autonomous engineering agent**. Gitu is not a chatbot with shell
access — it is a control plane for autonomous work: it locks a project, plans
bounded actions, executes through policy-gated tools, verifies with evidence,
prevents loops, and only claims completion when every acceptance criterion is
backed by passing evidence.

> Gitu must know the difference between _"I did something"_ and
> _"the task is actually complete."_

## Architecture

```
            CLI (src/cli.ts)
                 │
         Gitu orchestrator (src/agent/gitu.ts)
                 │
   ┌─────────────┼──────────────────────────────┐
   │             │                              │
ProjectGuard  TaskLedger                  LLM client
(scope lock)  (persistent task state)     (OpenAI-compatible)
   │
   ├── ContextEngine   ranked, role-labeled, budgeted packs + lexical/semantic/import-history signals
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

| Mechanism                           | What it prevents                                                                                                                                                        |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ProjectGuard**                    | Editing the wrong project / files outside scope                                                                                                                         |
| **TaskLedger**                      | Forgetting what was tried; lost state between turns                                                                                                                     |
| **EvidenceEngine + gate**           | Saying "done" without proof                                                                                                                                             |
| **Workspace fingerprint**           | Citing stale evidence as fresh (any later edit invalidates it)                                                                                                          |
| **LoopDetector**                    | Repeating the same failing action forever                                                                                                                               |
| **MalformedCallTracker**            | Burning turns on a spiral of schema-broken tool calls                                                                                                                   |
| **PolicyEngine**                    | Unapproved destructive commands (fail-closed tiers)                                                                                                                     |
| **CheckpointManager**               | Irreversible damage (git branch + snapshot per step)                                                                                                                    |
| **Specialist evidence gate**        | Accepting a sub-agent's "done" without revalidating its evidence against the delegated contract                                                                         |
| **Adaptive effort planner**         | Runaway cost on open-ended work: per-task budgets cap turns and specialist delegations by task complexity                                                               |
| **Risk-based specialist selection** | Using the wrong specialist (or any specialist) for low-risk work: risk classifier → right-sized roster, with domain review gates for security/payments/data             |
| **Task↔session↔git binding**        | Resuming a task in the wrong working tree or on the wrong branch                                                                                                        |
| **LSP intelligence layer**          | Blind text search for symbol facts; `lsp_diagnostics/definition/references/hover/symbols` + automatic post-edit diagnostics check, task-type → investigation strategies |

Web UI runs and `gitu run` bootstrap missing built-in language servers on first
LSP use (once per server); progress is streamed into the run (or printed by the
CLI).
The allowlist covers TypeScript/JavaScript, Python, Go, Rust, C#, and CSS using
their native package managers. Custom `.hermes/lsp.json` commands and languages
without a trusted installer remain opt-in and continue to use the normal
`search_files`/`read_file` fallback. Set `autoInstallLsp: false` in
`GituServer` configuration to disable this behavior.

## Quick start

`gitu` is the primary command and public API name. `hermes` remains a
compatibility command, and existing `.hermes` task state and `hermes/*` task
branches are retained so upgrading never loses resumable work. New task
branches use `gitu/*`.

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
# ChatGPT subscription — no API key (provider: chatgpt)
gitu login                       # opens Codex's secure ChatGPT sign-in
gitu run "goal" --provider chatgpt
# Agent Gitu uses the local Codex runtime and its authenticated model list.
# It never reads, writes, or sends your ChatGPT credentials itself.
# Sign out with `codex logout` when needed.

# Alibaba Cloud Model Studio / DashScope (provider: alibaba)
HERMES_ALIBABA_API_KEY | DASHSCOPE_API_KEY | ALIBABA_API_KEY
# endpoint defaults to the workspace URL built in for this deployment;
# override with --base-url or HERMES_BASE_URL

# OpenAI (provider: openai)
HERMES_OPENAI_API_KEY | OPENAI_API_KEY

# DeepSeek direct API (provider: deepseek)
HERMES_DEEPSEEK_API_KEY | DEEPSEEK_API_KEY
# Uses https://api.deepseek.com and the built-in DeepSeek V4 model list.

# Any OpenAI-compatible endpoint (provider: custom)
HERMES_API_KEY  (+ optional HERMES_BASE_URL, HERMES_MODEL)
```

Select explicitly:

```bash
node dist/cli.js providers                       # show providers + key status
node dist/cli.js models --provider alibaba       # list all models (live from the endpoint when a key is set)
node dist/cli.js models --provider deepseek      # list DeepSeek V4 models
node dist/cli.js models --pick                   # interactive model chooser
node dist/cli.js run "goal" --provider alibaba --model qwen3.7-max
```

The alibaba catalog is fetched live from `GET /models` on your workspace
endpoint whenever an API key is configured, so new models appear
automatically; a built-in fallback list (qwen3.7-max, qwen3.7-plus,
qwen3.6-flash, qwen3-coder-_, deepseek-v4-_, kimi-k2.7-code, glm-5.2, ...)
is shown when offline or keyless.

### Sign in with ChatGPT

`gitu login` opens the supported browser sign-in managed by the local Codex
runtime. Codex owns the authentication and requests; Agent Gitu does not read,
write, or transmit your ChatGPT tokens. Your subscription is used without an
OpenAI API key, subject to the limits of your ChatGPT plan:

```bash
gitu login                                            # browser sign-in
gitu providers                                        # shows ChatGPT plan readiness
gitu run "Fix the flaky test" --provider chatgpt
codex logout                                          # sign out when needed
```

In the Web UI (and desktop app): **Settings → Providers → ChatGPT →
"Sign in with ChatGPT"**. The models displayed there come from the current
local Codex model list, so they match the active ChatGPT plan; usage is subject
to that plan's limits rather than API credits.

## Development

```bash
npm run quality        # typecheck, lint, scoped format gate, fast tests, build
npm run test:fast      # rapid feedback; skips long integration/reliability suites
npm run test:full      # complete Vitest suite (also npm test)
npm run test:coverage  # full suite with enforced coverage thresholds
npm run benchmark:skills
npm run eval:summary -- path/to/results.json
```

`test:fast` is intended for the edit loop; `test:full` and coverage remain the
release/CI contract. Completion reports include an evidence-based quality score,
token cost per verified criterion, and wasted-call rate. Real-model evaluation
outputs are local by default; summarize a reviewed results JSON instead of
committing raw provider responses or logs.

### Layout

```
src/
  agent/      orchestrator + system/state prompts (strict JSON protocol)
  guard/      ProjectGuard — workspace detection, scope lock, boundary checks
  ledger/     TaskLedger — persistent task object (.hermes/tasks/<id>.json)
  context/    ContextEngine — lexical/IDF, semantic, import-graph, and recent-change retrieval
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
- [x] Phase 6 — Adaptive effort: per-task complexity → turn / specialist / context budgets, enforced in the orchestrator
- [x] Phase 7 — Risk-based specialists: risk classifier + right-sized roster selection, steering, domain review gates
- [x] Electron desktop shell (offline, in-app browser for visual verification)
- [x] Deeper context: import graphs, semantic search, edit history signals
- [x] Quality scoring and token cost-per-verified-criterion telemetry
- [ ] External baseline benchmark vs OpenCode/Codex

## Web UI

`gitu ui` starts a zero-dependency HTTP server (built-in `node:http`) that
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
  back / forward / reload); while it does, a "Gitu is driving the browser"
  banner and an animated cursor with click ripples are injected into the page
  so you always notice what it is doing. The Browser tab in the side panel is
  a live view of that window with its own address bar and an Open/Focus
  button. Screenshots are delivered to vision-capable models.
- **image attachments**: the composer accepts up to 4 images; they are sent to
  vision-capable models only (the model picker marks them, attach is disabled
  for text-only models)
- **provider-neutral connections**: when a task needs a named provider and
  capability, Gitu first checks saved connections, then pauses on a local
  connection form instead of asking for a token in chat. A successful setup
  creates a reusable global provider skill containing only documentation,
  capabilities, and allowlisted operations. The credential remains in the
  local key store and is never added to model context, task events, ledgers,
  generated skills, or general `web_fetch` headers.

Connections are intentionally generic: a profile has a provider identifier,
base URL, documentation link, capabilities, and fixed operations. Models can
request a capability but cannot construct arbitrary authenticated headers or
endpoints. Read-only validation runs automatically; future write operations
remain subject to Gitu's existing approval policy.

The desktop shell (`npm run app`) is fully offline-capable: the server and UI
run locally inside Electron; only LLM calls need network. If port 8321 is
taken it binds a free port automatically.

## Agent Gitu home

On first launch Gitu creates its own workspace (never a drive root):

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
it. Override the home with `AGENT_GITU_HOME` if needed (`HERMES_HOME_DIR` is
still accepted for compatibility).

API: `GET /api/project|models|tasks|runs`, `POST /api/runs`,
`GET /api/runs/:id/stream` (SSE), `POST /api/approvals/:id`.
