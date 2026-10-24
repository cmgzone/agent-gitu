# Proactivity implementation update — 23 October 2026

The findings below describe the earlier installation. The current implementation addresses scheduler ownership, explicit proactivity preferences, retry health, daily background app-review allowances and durable personal work. It introduces an existing-profile migration or a new default **P.A** chief, morning/evening priority briefs, quiet hours, deduplicated notices and assistant preferences accessible from Cowork navigation.

P.A can discover and inspect owner-selected and known locked Main Agent repositories through read-only project grants. Company workspaces and private-computer boundaries stay scoped. Completed coding tasks automatically receive a review when proactive assistance and coding reviews are enabled. A verified pass requires recorded code inspection; UI work additionally requires browser evidence. Missing preview/access is a blocker. Verified defects can be handed to Main Agent with at most two repair passes per original task; repeated findings reuse the existing repair, and exhausted repairs raise a user decision card. Coding still uses the current saved Main Agent model and existing approval/checkpoint policies.

Personal reminders and scheduled work use persistent queued/running/succeeded/failed states with retry leases. A source is consumed only after successful work. Failed app reviews retain separate attempt/success/error/retry health. Daily app-review call, output-token and priced-cost reservations are shared; models without price data remain bounded by call/token allowances and are shown as unpriced. Assistant preferences expose quiet hours, limits and background failures.

Delivery still depends on a running Gitu server. Updates are saved to chat and queued work catches up after restart. This update does not add Android/OS push delivery while the server is stopped. Automatic visual verification also depends on an accessible preview and granted browser tools; it does not imply every project UI was checked.

User message bubbles now follow the active agent avatar colour, with black or white text chosen for contrast. Widget surfaces retain their existing appearance.

Validation: 51 focused tests passed across coding handoffs, automatic reviews, repository boundaries, budgets, retries, profile preferences and colour contrast. The staged update is additionally checked independently of unrelated checkout changes.

---

# Agent proactivity review — 23 October 2026

Proactivity has a working foundation, but is not complete enough to treat as a reliable unattended assistant. This review inspected the implementation, the installed app's saved settings and task metadata, and an isolated scheduler probe. No real agent was woken and no live schedules or permissions were changed by the review.

## What exists

- Conversation schedules, durable follow-up records, internal teammate inboxes and multi-session missions.
- Email arrival monitoring with persistent arrival IDs and controlled drafting rather than automatic external sending.
- Company review jobs, a persistent company queue, scheduler ownership, worker limits and budget enforcement.
- Scheduled memory consolidation, learning reviews and transcript distillation.
- Connected-app reviews that use explicitly allowed read tools, require evidence, create useful widgets, suppress unchanged findings and respect dismissed cards.
- Coding handoffs to Main Agent Gitu, visible tasks and project checkpoints.

## Issues to resolve first

1. **Maintenance jobs can become coding tasks.** `GituServer.start()` starts the general `CronScheduler` for the active project. `startCoworkLearning()` creates another scheduler over the home workspace's same cron file. Neither scheduler filters job ownership. When the project is the home workspace, either scheduler can claim a job intended for the other. An isolated probe of the installed scheduler sent `cowork_learn_apps` to the ordinary coding callback once and the learning callback zero times. The real session database also contains repeated `[cron 15m] Review permitted connected apps...` coding tasks, including failed attempts. Give each job a type/owner, separate dispatchers or stores, and test both schedulers together across restarts.

2. **The default per-agent preference is inconsistent.** `agentProfileInstructions()` treats an unset personality as “Follow the user's lead.” Background app selection instead admits any preference other than the explicit `reactive` string, including an unset preference. All 15 saved personal profiles inspected had no explicit proactivity value. Require an explicit opt-in, and make the UI, prompt and scheduler use the same resolved preference.

3. **A failed review can remain silent for six hours.** App review state records `checkedAt` before account discovery, reads or model work succeeds. That prevents storms, but an account/network failure consumes the whole interval without a durable success/error distinction. Record last attempt, last success, next retry, failure reason and a bounded backoff separately. Show blocked or unhealthy monitoring in the interface.

4. **Personal background reviews lack a shared daily spend allowance.** App reviews call the personal agent's model directly. Existing company and mission budgets do not establish a single allowance for personal background reviews. Add a daily background budget and per-agent action limit with visible usage.

5. **Background delivery depends on the running server.** The reviewed timers run in the Gitu server process. The current Android workspace shell has no verified push-notification delivery path for closed-app alerts. Provide reliable server operation, missed-event catch-up, phone notifications, quiet hours and urgency controls.

6. **Completion of a wake is weaker than completion of its work.** Several personal paths mark reminders/schedules admitted before the model turn has succeeded. The company queue already has stronger persisted job states. Extend explicit queued/running/succeeded/failed/retry states to personal scheduled work and keep failed work visible to the chief.

## Current installation

- Global learning mode is `proactive`.
- Maintenance jobs are registered: daily consolidation/review/distillation and a 15-minute app-review dispatcher, with a six-hour per-agent review limit.
- No personal conversation schedules, personal missions, pending follow-ups or undelivered internal inbox messages were present in the saved data inspected.
- Saved app-review attempts existed for five agents. Their recorded finding lists were empty; a recorded attempt is not proof of a successful review.

## What the chief should do after those fixes

1. Give one morning brief covering today's priorities, overdue work, blockers and decisions that need the user.
2. Watch task progress across projects and companies. Route coding to Main Agent Gitu, track completion and checkpoints, and report a concrete outcome through the requesting coworker.
3. Detect failures, expired connections, pending approvals and stalled handoffs. Retry bounded transient failures; escalate missing credentials or repeated failure with a useful next step.
4. Turn verified events into suggested actions: important email arrivals, upcoming calendar deadlines, project changes and completed or failed tasks. Extend the existing event infrastructure rather than repeatedly scanning everything.
5. Prepare drafts, plans, checklists and internal assignments within the user's granted scope. Perform additional actions only according to the selected proactivity level and existing action permissions.
6. Give a short end-of-day report: finished, blocked, next, and background cost. Remain quiet when there is no useful change.

The recommended order is scheduler correctness and consistent preferences first, reliable retries and a background budget second, then chief oversight, daily briefs and phone notifications.
