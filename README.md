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

| Mechanism                           | What it prevents                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ProjectGuard**                    | Editing the wrong project / files outside scope                                                                                                                                 |
| **TaskLedger**                      | Forgetting what was tried; lost state between turns                                                                                                                             |
| **EvidenceEngine + gate**           | Saying "done" without proof                                                                                                                                                     |
| **Workspace fingerprint**           | Citing stale evidence as fresh (any later edit invalidates it)                                                                                                                  |
| **LoopDetector**                    | Repeating the same failing action forever                                                                                                                                       |
| **MalformedCallTracker**            | Burning turns on a spiral of schema-broken tool calls                                                                                                                           |
| **PolicyEngine**                    | Unapproved destructive commands (fail-closed tiers)                                                                                                                             |
| **CheckpointManager**               | Irreversible damage (git branch + snapshot per step)                                                                                                                            |
| **Specialist evidence gate**        | Accepting a sub-agent's "done" without revalidating its evidence against the delegated contract                                                                                 |
| **Adaptive effort planner**         | Initial turn allowances expand while progress continues; stalled work pauses, while explicit spending and specialist limits remain enforced                                     |
| **Risk-based specialist selection** | Using the wrong specialist (or any specialist) for low-risk work: risk classifier → right-sized roster, with domain review gates for security/payments/data                     |
| **Task↔session↔git binding**        | Resuming a task in the wrong working tree or on the wrong branch                                                                                                                |
| **LSP intelligence layer**          | Blind text search for symbol facts; `lsp_diagnostics/definition/references/hover/symbols` + automatic post-edit diagnostics check, task-type → investigation strategies         |
| **Chief of staff**                  | Unattended agents stalling on their own gates, or granting themselves authority: an explicit authority policy decides routine requests, everything high-impact escalates to you |

Web UI runs and `gitu run` bootstrap missing built-in language servers on first
LSP use (once per server); progress is streamed into the run (or printed by the
CLI).
The allowlist covers TypeScript/JavaScript, Python, Go, Rust, C#, and CSS using
their native package managers. Custom `.hermes/lsp.json` commands and languages
without a trusted installer remain opt-in and continue to use the normal
`search_files`/`read_file` fallback. Set `autoInstallLsp: false` in
`GituServer` configuration to disable this behavior.

### Task recovery

- Verification correction attempts apply to the same unchanged result. A repair
  or a changed check outcome starts a new correction opportunity. Repeated
  completion claims cannot waive missing UI verification.
- Productive work can continue beyond four effort extensions. A segment with no
  new verifiable progress pauses with an explanation and preserves completed work.
- Workspace tasks retry temporary network, rate-limit, and provider failures
  automatically, starting after 15 seconds and backing off to five minutes.
  Provider `Retry-After` instructions can require a longer wait. Pending retries
  survive an app restart; Stop, deletion, and manual continuation cancel them.
- Cowork keeps the current model request and completed tool results through
  temporary outages. Both engines share recovery classification and completion
  state decisions. Authentication, billing, and exhausted quota require a
  configured fallback or user action instead of repeated automatic attempts.

### Live reasoning in chat

Main chat and Cowork show provider-exposed reasoning text or thought summaries
under the animated activity indicator. Each teammate has its own stream. A new
model round or transport retry clears partial reasoning; answer text remains
separate. The live view keeps the latest 24,000 characters and lets you scroll
back without snapping to the bottom.

OpenRouter requests visible reasoning, Gemini requests thought summaries, and
compatible providers and the ChatGPT subscription bridge forward exposed text.
Models that do not return reasoning continue to show their activity status.
Internal action `thought` fields and encrypted reasoning blocks are not rendered.

## Quick start

Use Node.js 22.22.3 or newer.

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

# OpenMuse-derived mobile companion — Android, iOS and web
npm run mobile:install
npm run mobile:build:web                # served at /companion/ by the Gitu server
# Setup (server access key and phone connection): apps/mobile/README.md

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

### Account registration and connected services

Desktop and web servers require a registered workspace account by default. On first launch,
open `http://127.0.0.1:8321` on the server computer and register with your name, email, and a unique passphrase
of at least 15 characters. Registration creates the first workspace owner; then
sign in with your email and password. Email is a local sign-in identifier; this
desktop account flow does not send verification or recovery emails. The password gate protects the UI, APIs, previews,
downloads, and mobile companion. Passwords are stored as salted scrypt hashes;
sessions use HttpOnly cookies, expire after eight hours, and are revoked by
**Cowork → Lock app** or a server restart. Five failed logins trigger a
15-minute cooldown. Keep the password in your password manager.

In **Cowork → Connections**, enter your Composio project API key once, search
for a service, choose **Connect → Continue sign-in**, and complete authorization
with that service. Refresh to see the account status. Use **Reconnect** for
expired access or **Disconnect** to revoke a connection. On Windows, the key is
encrypted with DPAPI for the current OS user. Hosted servers can enable
encrypted key entry with `AGENT_GITU_SECRETS_KEY`, or set `COMPOSIO_API_KEY`
in the server environment. OAuth credentials are managed by
Composio and are never returned by the connection API or given to agents.

Cowork agents can discover connected tools with `connected_apps`. Execution
requires their write/config capabilities and a human review of the exact
service, account, tool and arguments. Approvals expire after 15 minutes and
can be used once. The server binds execution to your connected account;
service calls are sent without automatic retries.

Remote password login requires HTTPS. For an HTTPS reverse proxy running on
the same machine, set `AGENT_GITU_TRUST_LOCAL_PROXY=1` and
`AGENT_GITU_PUBLIC_ORIGIN=https://your-gitu-host`. The proxy must preserve Host,
replace `X-Forwarded-Proto` with `https`, and be the only remote path to the
loopback-bound server. Native mobile access also requires its existing access
key; enter your registered email and password in the companion connection form.

For a hosted workspace, follow [the Coolify deployment guide](deploy/README.md).
Remote first-owner registration requires HTTPS and a private
`AGENT_GITU_REGISTRATION_TOKEN` of at least 32 characters. The code is accepted
only before the owner account exists; it cannot replace an account or sign in.

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
# Uses https://api.deepseek.com; default model: deepseek-flash.

# Google AI Studio / Gemini API (provider: gemini)
HERMES_GEMINI_API_KEY | GEMINI_API_KEY | GOOGLE_API_KEY
# Uses the OpenAI-compatibility endpoint
# (https://generativelanguage.googleapis.com/v1beta/openai);
# default model: gemini-3.7-flash. Get a key at https://aistudio.google.com/apikey

# Any OpenAI-compatible endpoint (provider: custom)
HERMES_API_KEY  (+ optional HERMES_BASE_URL, HERMES_MODEL)
```

Select explicitly:

```bash
node dist/cli.js providers                       # show providers + key status
node dist/cli.js models --provider alibaba       # list all models (live from the endpoint when a key is set)
node dist/cli.js models --provider deepseek      # list DeepSeek models (deepseek-flash, deepseek-v4-pro, ...)
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
- [x] Chief of staff: policy-bounded auto-resolution of approvals, plan reviews and clarification questions for delegated work
- [ ] External baseline benchmark vs OpenCode/Codex

## Web UI

`gitu ui` starts a zero-dependency HTTP server (built-in `node:http`) that
renders the agent's **state**, not a chat transcript:

- current task, status, hypothesis
- acceptance criteria with satisfied/open state + linked evidence
- plan steps with per-step status/attempts
- evidence list (PASS/FAIL, kind, command)
- files changed, blockers, completion report
- **code diffs**: every change is a real line-level diff against the file's
  previous content — removals in red, additions in green, and both counted
  (`+12 -3`) on the tool card. A rewrite that deleted code can no longer read as a
  pure addition, which is what an addition-only counter always showed.
- **model reasoning**: the provider's reasoning trace is shown live in a
  collapsible "Model's reasoning" block, so a run that is thinking is visibly
  thinking rather than an unexplained spinner.
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

## Cowork mode

Cowork is a second mode, opened from the home page card or the 👥 button in the
sidebar. Instead of task runs it gives you a messaging-style team surface:

- **Agent profiles** — create named teammates (personality prompt, avatar,
  provider/model, effort, per-agent skills, opt-in shell/write permissions).
  Instruction presets cover coordination, engineering, research and writing.
  Choose an animated orb or a voxel avatar; reduced-motion preferences are respected.
- **DMs and group chats** — chat with one teammate directly, or assemble a
  group. Unmentioned requests run workers in parallel batches, then the
  **chief of staff** synthesizes their results. `@Name` targets teammates;
  targeted handoff chains are bounded to prevent loops.
  Messages arriving while the team works are queued and answered in order.
- **Optional computers** — new teammates default to **My computer**, using the
  Agent Gitu workspace and desktop browser without Docker. Existing profiles
  keep their computer selection. Uncheck My computer in the profile to use
  a private computer. Each private computer gets a persistent Linux container
  with its own `/workspace`, shell and Chromium browser session. Install and
  start Docker Desktop with Linux containers enabled. Use **Start** in the
  agent's computer card, or let its first computer tool start it. The first
  start builds `assets/cowork-computer/Dockerfile` and downloads Chromium;
  allow several minutes. **Open desktop** shows that teammate's Linux desktop
  and visible Chromium window, refreshing every two seconds. The viewer is
  view-only, with Start/Stop controls. Teammates on My computer can explicitly
  switch using **Use private desktop** while idle. This uses Docker containers,
  not a separate hypervisor VM. Upgrading an older private computer preserves
  its workspace/home volumes and retains the old container as a backup.
  Containers have 2 CPUs, 2 GB memory, no host mounts or published ports.
  Stop preserves the volumes; deleting a teammate retains its computer data.
  Long-running app servers use `run_command` with `background: true`; agents
  inspect their output or stop them with `computer_process`.
  If Docker is unavailable, the tool dispatcher reports its host fallback;
  permission switches still apply. Existing Workspace files remain in place.
- **Tools and skills** — agents read/search and edit their own computer files.
  Use `share_file` and `receive_file` to pass artifacts within a conversation.
  Shell and writes are enabled per profile. Skills, memory and connections
  remain app services; MCP runs as a trusted host extension, with separate
  per-agent manager/configuration, and calling it requires shell, write and
  tool-setup permissions. An agent is serialized across chats to protect its
  private browser and files.
- **Productivity** — `create_document` generates real PDF, PPTX, DOCX and XLSX
  files using bundled libraries, without Python, Office or Docker. It validates
  the generated file structure; visual review remains a separate check. Cowork
  automatically presents an Open/Download card. This app service creates files
  in the Agent Gitu workspace even when the teammate uses a private computer;
  `receive_file` can transfer the shared artifact into that computer.
- **Document previews** — the Open card renders a safe local page for every
  artifact: PDFs and raster images go to the browser's own viewer, SVG is drawn
  as an inert image, DOCX/XLSX/PPTX are extracted into text and tables, and
  text, code, markup and config files are shown escaped. Types that cannot be
  read (legacy Office binaries, archives, exotic formats) get an identity card
  with a download button instead of a dead end. Scripts, macros, embedded
  objects and external resources never execute.
- **Media in chat** — attach up to four files per message (20 MB each) of any
  type from the composer, or send documents, photos, voice notes, audio, video
  and stickers from Telegram. Images reach vision-capable teammates as real
  image input, text-like files are inlined into the prompt, images draw inline
  thumbnails, and audio and video play right in the transcript.
- **Browser skills for every provider** — the built-in `browser-workflow` skill
  teaches page inspection, navigation, forms, verification and sign-in handoff.
  Screenshots reach models that support images; text-only models use page
  evidence. Shared desktop browser work is serialized for each tool session
  so another teammate cannot navigate it away mid-task.
- **Continuity** — every turn loads the saved checklist, artifact references,
  request answers and recent tool checkpoints. `conversation_history` retrieves
  older decisions and URLs beyond the prompt window. Repeated todo additions
  reuse the existing item and preserve its status; pending identical handoffs
  and follow-ups are deduplicated. Tool checkpoints persist after every action,
  including when a later model call fails. These mechanisms apply to all providers.
- **Progress summaries** — long Cowork turns save a plain-language update at
  each continuation checkpoint: what was accomplished, any unresolved problems,
  and what comes next. Work details stay collapsed beneath the update and can
  be expanded when needed. If summarizing is unavailable, a factual update
  from saved results lets the task continue without replaying actions.
- **Telegram gateway** — link a bot token (@BotFather) and a chat to any
  conversation: Telegram messages arrive as user messages and every agent
  reply streams through edited messages, including tool activity and final
  tool outcomes. Delivery is serialized, rate-limit responses are retried,
  and one poller per bot routes updates to all its linked chats. Tool markers
  never appear in the stream. Delivery failures appear in the web transcript.
- **Schedules** — agents use `schedule_manage` to list, create, update, pause,
  resume or delete recurring work. Cowork stores one schedule per conversation;
  the main agent can manage multiple jobs. Intervals include `30m`, `1h`, `1d`
  and `1w`; jobs run while Gitu is open. Identical creates reuse the saved job.
- **Provider tool transport** — DeepSeek DSML (including spaced/split markers)
  executes through the same dispatcher as other providers and stays out of chat.
  Incomplete calls are never executed. ChatGPT subscription instructions use
  runtime configuration, with instruction files for large Windows contexts.
- **Chief of staff** — delegated engineering (`gitu_task`) is unattended, so
  every gate it raises is offered to a chief of staff before it reaches you. The
  chief decides only what the session's **authority policy** names as routine
  (verification and inspection commands), approves a plan whose every step names
  its verification, sends an unverified plan back for replanning, and answers a
  question a standing rule covers. Everything else escalates to you as a request
  card: production deployments, destructive data operations, credential material,
  force pushes, privilege escalation, external provider or MCP writes, and any
  session down to the last of its budget. High-impact vetoes are final and are
  never offered to a judgment layer. Questions the standing rules do not cover are
  answered by a **model advisor**: one bounded call, made with the delegating
  teammate's own provider and charged to the mission's envelope (a spent envelope
  buys no answers), and it may only _answer_ — a reply that claims an approval is
  discarded, and an answer is information, so what the agent does next still faces
  its own gates. Each decision is recorded with who decided and why, and shown in
  the conversation. Configure it per host with `chiefOfStaff: { policy, advisor }`
  (`advisor: false` for policy-only, or supply your own), or `false` to turn the
  chief off (interactive runs keep every gate for you by design).
- **Long commands and verification** — a command never blocks a turn on output.
  Every call answers with a status: `exited` with an exit code, or `running` with
  a job id that stays pollable (`{"action":"status","id":"cmd-3"}`) and stoppable
  (`{"action":"stop","id":"cmd-3"}`). `waitMs` (default 60 s) is how long a call
  waits for a terminal state; `timeoutMs` remains the hard kill deadline, has no
  implicit value, and is respected without a ten-minute cap. Stop cancels the
  process tree, and evidence is only ever recorded from a command that reached a
  terminal state — never from one that is still running. The main agent accepts
  relevant document/browser evidence for productivity work, still checks code
  changes, and reports a blocker after two unsuccessful evidence-correction
  opportunities.

Data lives in `<AgentGitu home>/Cowork/cowork.json` (profiles, conversations,
transcripts, gateway tokens). API surface: `/api/cowork/agents`,
`/api/cowork/agents/:id/computer` (GET status; POST start/stop/screenshot),
`/api/cowork/conversations[/:id/messages|stop]`, `/api/cowork/telegram/chats`.

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
