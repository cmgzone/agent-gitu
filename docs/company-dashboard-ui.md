# Company dashboard and task experience

Company mode now uses a persistent workspace sidebar, a company switch, live teammate identities, readable assignments, and performance charts. The existing Agent Gitu light/dark theme and shared Cowork chat renderer remain the visual foundation. Code, Cowork and Company retain that order in the mode selector.

## Design reference

The owner requested Paperclip as inspiration. The reference inspection covered its [dashboard screenshot](https://github.com/paperclipai/paperclip/blob/master/screenshots/PR-8000-home-flag-off.png), [task-detail screenshot](https://github.com/paperclipai/paperclip/blob/master/screenshots/PR-8000-task-thread-flag-off.png), [sidebar implementation](https://github.com/paperclipai/paperclip/blob/master/ui/src/components/Sidebar.tsx), and [design principles](https://github.com/paperclipai/paperclip/blob/master/DESIGN.md), inspected on 13 October 2026. This is an original implementation for Gitu's existing UI/runtime, informed by the navigation, scanning hierarchy and task-property layout; no Paperclip runtime, branding or source components were imported.

## Owner flows

- Switch companies from the sidebar, or select a section without losing the company context. On narrow screens the sections become a scrolling horizontal navigation. Both orientations support keyboard selection with arrow keys, Home and End.
- Open a teammate's sidebar identity to focus their actual assignments and computer controls. Working indicators require real runtime activity; saved task status alone does not make an avatar appear to be working.
- Work shows saved tasks, helpers and pending owner requests. Completed scheduler review/mission dispatch ticks are not business deliverables. Filter by Active, Results or All tasks, then by status, teammate or search. Results without a recorded summary say so.
- Expand an assignment to read its progress, blocker, expected outcome, result and assignee. Ask about this task creates an editable question draft with that task's context. It neither submits a message nor steers the company's direction; an existing nonempty chat draft is preserved.
- Overview shows current direction and unresolved owner decisions near the top. Open questions from any company teammate also appear in the company conversation with their identity. Background refreshes preserve typed answers.
- Performance shows daily model attempts, known AI spending, saved task status and active assignments per teammate. Choose 7, 14 or 30 days; click a task status or teammate to open matching work. Daily values are accessible in a table. Unknown prices remain unknown, and wallet, storage and computer charges are not included in the AI spending chart.

## Data and recovery

`GET /api/companies/:id/dashboard?days=7|14|30` aggregates only that company's persisted model attempts, using its configured timezone and calendar dates. Usage projections omit prompts, credentials and per-attempt configuration. The response also supplies current saved assignments for chart drilldowns. Empty periods show no activity. A model attempt's stable persisted ID prevents it from being counted twice when the same attempt is reconciled.

Full access delegates command verification/recovery to the agent while preserving shell, file, computer and direction checks. Historical unfinished command approval/recovery records in Full access companies migrate transactionally to `agent-managed`, retain their parameters, and explicitly do not confirm completion. Switching back to Supervised requires a fresh approval. Uncertain external email, app and wallet actions remain subject to reconciliation before retrying.

External recovery presentation now names the operation, recipient and subject when available. Raw parameters are collapsed under Technical details. The result form starts without a selected outcome, requires evidence, and offers a neutral leave-unresolved action. Saving a result does not silently change grants or claim that an unchecked action completed.

## Verification

The 45 focused Company tests passed, covering recovery, grants, direction handling, usage chart isolation/date boundaries/DST, scoped HTTP and file transfers. The synthetic desktop/mobile browser flow passed, including chart period changes and status drilldowns, task context drafts, preserved drafts, navigation focus, readable recovery, provider selection, connections and a 21 MiB file upload. The separate inert preview renders the actual UI modules with explicit demo data and cannot run an agent or external action.

Native install/update/uninstall, tray lifecycle, provider-backed recovery and cross-platform release checks remain the delivery gates recorded in `company-mode-delivery.md`. This UI checkpoint does not declare the complete application released.

The parent AGENTS.md requires Byterover retrieval/storage. Neither tool was exposed in this session; this document records the reusable design and implementation findings instead of claiming a memory-tool call.

## Unified connections and API research

Workspace Connections now contains Apps & accounts and Custom APIs in Settings. The former Cowork page is removed from its entry path: profile, chat and workspace shortcuts open this manager without replacing the conversation or switching modes. Leaving it invalidates pending UI responses. Company navigation calls its scoped connection/account/storage/permission view Resources, making the access boundary explicit.

The shared custom API form uses a service picker, connection name and address, a masked credential with an explicit reveal control, optional advanced settings, inline status, and Save and test. Known services fill their addresses and documented validation routes. Custom services derive their provider identifier from the address, including localhost/IP endpoints. A failed test retains the saved ID; retrying does not create another connection. Credential correction edits that same record and preserves other still-granted operations. Cancelling clears the credential input; leaving before completion prevents a late company grant. A company-created API is granted to its original company only after a successful check.

The new `web_search` tool works in Code, Cowork and Company independently of browser, shell or private-computer availability. It uses an explicitly granted, credentialed Brave or Tavily profile; multiple accounts require an exact connection ID rather than an arbitrary selection. Provider origins and authentication headers are fixed by the host, redirects are disabled, responses are bounded and redacted, and revoked company access prevents delivery of late results. Search queries return source URLs/snippets for subsequent verification with `web_fetch`. Browser interactions remain available for sign-in, forms, visual checks and content plain fetching cannot read. Other granted API/MCP search tools remain usable.

Native transport contracts were checked against [Brave's documentation](https://api-dashboard.search.brave.com/app/documentation/web-search/get-started) and [Tavily's Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search). Search API fees belong to the external provider and are separate from the model-attempt AI spending chart. No live paid search calls were made during verification.

The subsequent 56 focused connection, search, Company, recovery and HTTP tests passed. The separate Settings browser flow passed desktop/mobile rendering, mode/chat preservation, provider autofill, masked credentials, test retry, credential correction and local-IP identifier generation. The Company browser flow also verifies that a failed test creates no company grant and successful retry grants the existing saved resource exactly once. These checks use inert network fixtures.

The preview's fixed demonstration banner previously reserved 66 pixels above the Company page. It now uses an unobtrusive bottom notice, retaining the explicit demonstration warning without shifting navigation. Browser measurements at 532×712 and 1440×900 place App modes 14 pixels from the top, matching the production layout.
