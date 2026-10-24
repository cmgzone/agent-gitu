# Company questions and management from Cowork — 0.4.10

Cowork can retrieve saved company details and perform daily management without
opening a separate conversation. `company_manage inspect` accepts a company ID
and a section: overview, team, tasks, meetings, workflows, runs, handbook,
activity, spending or knowledge. A `resourceId` selects an exact task, meeting,
workflow or run. Meeting contributions and lists support `offset`/`limit`
pagination with a returned `nextOffset`.

`search` finds matching tasks, meeting contributions, decisions, workflows,
runs, approved handbook content and shared memories. Results carry record IDs
and sections for follow-up inspection. Queries from nonmembers search shared
company knowledge. Detailed meeting reads retain attendance rules; workflow
reads retain assignment rules. Personal memories, credentials and unrelated
Cowork conversations are excluded.

The `boardroom`, `workflow`, `organization`, `onboarding` and `task` actions
forward `input` to their existing native agent tools. `help` returns their
schemas and instructions, optionally selecting an operation with `query`.
The host resolves the caller's target-company membership and runs normal tool
authorization, permission checks, organizational authority and execution
policy. It never forwards requests as the director. Company Start,
resource/budget changes, employee activation and director approvals remain
owner controls. The native task `maxSessions` parameter controls the requested
session count within the company's cap.

Creation/proposal/request receipts are deduplicated by company, direction,
caller, originating Cowork user message, native tool, arguments and permissions.
Concurrent attempts share a pending operation; successful receipts persist
through restart. Revoked organizational authority is checked before replay.
Receipts describe the saved invocation; use inspection for the current state.

## Shared outcome memory

Completed meetings publish decision states and follow-up references. Completed
tasks with a saved result publish a bounded reported result. Completed workflow
runs publish version, step states and mission references. These deterministic
summaries carry record provenance and remain unverified memory candidates.
Private personal notes and restricted meeting transcripts are not published.

Indexing runs during coordinator preparation/recovery, immediately after
successful mission completion, and on company status/knowledge reads. Durable
content markers prevent duplicate entries or recreation of unchanged archived
notes. History backfill processes at most ten changes per pass to keep status
requests responsive. Changed source records supersede earlier summaries. A reverted report
creates a fresh candidate without reviving superseded history. Indexing errors
are logged for retry and do not turn successful work into a failed operation.

## Cowork chat cards

Successful status, inspection and native management calls attach the company's live
card to the originating Cowork chat. The existing creation card gains the same
live detail. Cards show active tasks, blockers, approval counts, meeting
requests, discussions, workflow drafts and active/blocked runs. The owner can
schedule or decline meeting requests and answer company questions directly.
Workflow/action approvals link to their existing review controls. Discussion
and workflow links select the exact saved record.

Polling preserves focused question drafts and pending submissions. Failed
answers retain the draft and allow retry; saved answer receipts survive reload.
Cards use existing theme tokens and work on desktop and mobile.

## Validation and limits

The final combined Company/Cowork/memory run passed 335 of 336 checks at the
default timeout. The remaining 505-record audit retention check exceeded its
15-second limit twice; all 21 memory-scoping checks passed with a 60-second
CLI allowance; the retention check completed in 8.2 seconds on that rerun.
The audit test and its default timeout were not edited. Across that run
and final focused reruns, 337 unique checks passed. Focused checks cover
ordinary Cowork chat lookup, native operation forwarding, retry receipts,
revoked authority, workflow approval boundaries, automatic outcome revisions,
archived memory and recovery. `scripts/cowork-company-cards-ui-smoke.ts`
exercises real temporary server data, question failure/retry/reload, meeting
scheduling, exact discussion/workflow navigation and mobile dark layout.

The build, repository lint, formatting, real-server browser flows and packaged
runtime checks also passed. The Windows stage matches 360 runtime/desktop/asset
files. Both Windows installer archives passed integrity checks, and seventeen
critical embedded modules match the final compiled build. Local artifacts and
SHA-256 sidecars are in `release/windows-0.4.10/`; the build manifest records
validation scope, the audit timing rerun and uncommitted source inclusion.

Live external models, extended unattended runs, native installation,
update/uninstall and other operating systems still need acceptance testing.
The earlier project-wide unresolved cases remain documented in
`company-coordination-validation.md`; these changes do not declare the entire
application complete.
