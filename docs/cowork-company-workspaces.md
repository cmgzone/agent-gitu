# Cowork company workspaces — 0.4.9

Company is an optional workspace inside Cowork. The application has Code and
Cowork modes; Cowork provides a Companies workspace button and breadcrumb.
Company setup selects an existing Cowork lead, using that profile's personality
and model configuration. It no longer has its own agent/model creation form.

## One roster and execution engine

The normal Cowork store owns permanent agent identities. Company snapshots
retain membership settings and scoped conversations, tasks, requests, artifacts
and execution permissions. Their roster views resolve the current Cowork
profile by its original ID. Identity edits follow the agent across workspaces;
company tool grants and computer selections remain with that membership.

`company_manage create` links the caller as lead by default, with optional
`leadId` and `memberIds` from the Cowork roster. `agents` discovers profiles;
`add_agent` and `remove_agent` join or detach existing identities. Creation and
membership changes require the Cowork profile's configuration/write permission.
Owner setup still chooses budgets, resources and Start. Newly joined employees
enter onboarding and retain the existing activation/authority gates.

The Team page exposes the same membership operations. A teammate may belong to
several companies. Detaching a membership preserves the Cowork profile, personal
memory and other memberships. Deleting a Cowork profile is blocked while it has
company memberships. Hires made with Cowork's existing `team_manage` become
ordinary Cowork profiles; their company permissions do not become global grants.

Tool contexts, desktop caches, sockets and durable desktop records include the
company scope. Desktop capacity counts both workspaces when one agent has two
desktops. Active or reserved desktops must be stopped before removing a member;
an unavailable display for a desktop with no held capacity does not prevent
removing an unused membership. Subscription callbacks retain their original
workspace even when a shared profile change wakes several chats.

## Shared Cowork memory

Cowork's existing MemoryStore holds personal and shared company memory. Every
Cowork teammate receives current company summaries and can use
`company_manage recall` with a company `id` and optional `query`. `remember`
with `id` and `text` saves a shared company note. These operations also work for
read-only teammates; notes follow the existing candidate/verification lifecycle.
Personal notes retain their original ownership and follow the same agent
between Cowork and its company memberships.

Files & Knowledge shows shared company notes and provides **Share with Cowork**.
Director-approved handbook pointers use this same shared memory store and are
withdrawn when the corresponding handbook entry is archived. The structured
company record remains authoritative for roles, grants, budgets and policy.

## Existing data

Legacy company-only profiles are imported once into the Cowork roster with
their existing IDs, preserving references in transcripts, meetings, workflows
and jobs. Name collisions are disambiguated. Migration markers prevent an old
snapshot from recreating a subsequently deleted Cowork profile. Existing
company grants stay scoped; importing a profile grants no global file, shell,
configuration or computer access.

Legacy shared memories and attributable personal notes are imported
idempotently into Cowork memory. Personal ownership and handbook provenance
are preserved, and the original memory files remain available for recovery.
Legacy desktop records are read using their company scope and adopt the new
composite key on their next write.

## Validation

Validated locally on 20 October 2026:

- 30 Company-related test files: **192 passed, zero failed/skipped**.
- Additional Cowork store/HTTP, navigation, dashboard, profile, character and
  message-action checks passed in the broader regression run.
- The real-server Cowork company browser flow, general Company UI smoke,
  Boardroom smoke and shared question-card smoke passed. Native Cowork
  chat/profile navigation also passed hit-target checks at 1360, 390 and
  360 pixels, including the Companies action and search control.
- The real-server shared-roster stream test passed: a profile edit from a
  company refreshes both chats in their original transcript scopes.
- TypeScript build, repository lint, formatting and whitespace checks passed.
- The Windows application stage matches **358** compiled/runtime files.
  Electron 43.4.0's own Node runtime passed server health, same-identity company
  membership, shared-memory and meeting/workflow checks.

The added tests cover shared identity across companies, profile edits, scoped
permissions, hiring, detach/restart, legacy profile/memory migration, shared
recall, private-memory ownership, handbook approval/archive and desktop slots.
A real-server tool test covers company creation, adding an existing teammate
from a company conversation, scoped tools/desktops, shared memory and restart.

`scripts/cowork-company-ui-smoke.ts` uses the production UI modules against a
temporary real server. It verifies choosing a Cowork lead, adding/removing a
membership, sharing company memory, Cowork navigation and mobile layout.
Boardroom and question-card browser checks cover their existing flows.

The earlier full-project regression run still has unrelated unresolved cases
documented in [the coordination validation report](company-coordination-validation.md).
This checkpoint does not declare the entire project complete. Native installer
installation/update/uninstall, live providers and other operating systems still
require separate acceptance checks.

## Local Windows artifacts

The 0.4.9 installer and portable application are in `release/windows-0.4.9/`.
Both finished archives passed integrity checks, and thirteen embedded Company,
Cowork, memory and navigation modules match the final compiled build. SHA-256
sidecars and `Agent-Gitu-0.4.9-build-manifest.json` record the resulting files
and verification scope. These artifacts were built locally; they were not
installed or published.
