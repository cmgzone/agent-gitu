# Cowork Hierarchical Sub-Agents — Design

Status: **implemented** — all slices. Spawn/clamp/terminate lifecycle
(`src/cowork/subagents.ts`), the `spawn_sub_agent` execution path (runner +
tools), cancellation propagation, mission-end termination, the startup orphan
sweep, the sub-agent Evidence Gate (host-built, attributed evidence reports
validated by the parent's runner before a child may count as completed), the
execution tree (`CoworkSubAgents.tree()` — live spend, gate verdict, nesting
by parent, totals — exposed at
`GET /api/cowork/conversations/:id/subagents?missionId=…` with an `onChange`
hook feeding the SSE publish path), and the live UI panel: the worker tree
renders inside each mission card in the Cowork chat panel
(`cwSubAgentTreeHtml` in `src/server/ui-cowork.ts`), with pulsing running
dots, spend-vs-grant bars, evidence chips, blocked reasons, and reduced-motion
support. Tests: `tests/cowork-subagents.test.ts`,
`tests/cowork-subagent-execution.test.ts`, `tests/cowork-ui-stream.test.ts`.
This document maps the hierarchical sub-agent architecture (Chief → cowork
agent → temporary sub-agents) onto the machinery that already exists in this
repository, names the gaps, and defines the enforcement points for each hard
rule.

The governing principle: **a sub-agent inherits constraints, not authority.**
A parent may delegate work; it may not delegate the budget ceiling, the
permission set, the evidence gate, or the approval requirement that binds it.

## What already exists

| Existing module | What it gives this design |
| --- | --- |
| `src/coding/budget.ts` | A real hierarchical budget tree. `RunBudget` (cost/turns/subagents/reserve), `allocateChildBudget` (clamp child to parent envelope), `validateAllocation` (sibling aggregate check), `createBudgetAccount` (child `charge()` propagates to the parent, `exhausted()` consults the parent, `regrant` mutates in place so children stay wired). Budget inheritance is largely solved here. |
| `src/cowork/delegation.ts` | The one-way authority pattern: the runtime mints request ids and settles gates; the cowork surface only renders and forwards answers. `DelegationSessionInput.parentBudget` already draws a delegated run from the mission/conversation envelope. `scope` is explicitly "labels, not permissions". |
| `src/cowork/chief-resolver.ts` + `src/chief/authority.ts` | Fail-closed authority: allow-list only, vetoes are final and checked first, anything unmatched escalates to the human. Delegation can never remove an approval requirement because the agent never holds the resolver. |
| `src/cowork/store.ts` (`CoworkAgent`) | Per-agent capability flags: `allowShell`, `allowWrites`, `allowConfig`, `useHostComputer`, `skills`, `chiefOfStaff`. Permission narrowing is a clamp over exactly these fields. |
| `src/cowork/tools.ts` (`CoworkToolPerms`) | The runtime gate projection of those flags (`shell` / `writes` / `config` / `chief` / `browser`). Child tool scopes are derived by intersection, never union. |
| `src/agent/subagent.ts` + `specialist-evidence.ts` + `specialist-checkpoints.ts` | The engineering-side precedent: spawn → work → report → terminate, with an evidence gate that revalidates a sub-agent's "done" against the delegated contract (README: "Specialist evidence gate"). |

## The gap

Today the cowork graph is two levels: you ↔ persistent teammates, with the
Chief of Staff as the only delegation hub, and `gitu_task` as the only
"spawn" path (a full engineering session). What the proposal adds is a third
level: a **non-chief cowork agent spawning its own temporary cowork
sub-agents**, with the engineering engine's specialist discipline brought up
into the cowork layer.

## Agent context

Refined against repo types:

```ts
type SubAgentContext = {
  agentId: string;               // ephemeral instance id, not a store profile id
  parentAgentId: string;         // required: only the root mission has none
  rootMissionId: string;

  depth: number;                 // parent.depth + 1, set by the host, never the agent
  maxDepth: number;              // clamped to a global ceiling (2 or 3)

  budget: RunBudget;             // src/coding/budget.ts — already hierarchical
  account: BudgetAccount;        // created via parentAccount.allocate(...)

  permissions: CoworkToolPerms;  // child = intersect(parent, requested)
  skills: string[];              // child ⊆ parent.skills
  evidencePolicy: EvidencePolicy;

  children: string[];            // live child instance ids, for the UI tree
};
```

`depth`, the clamped budget, and the narrowed permissions are all **assigned
by the host at spawn time**; the agent's `spawn_sub_agent` tool call is a
request, exactly like `maxCostUsd` in `DelegationRunOptions` is a request the
runtime clamps — never an authorization.


## Rule → enforcement point

1. **Depth limit.** Enforced in the spawn handler, not in the prompt:
   `if (parent.depth >= context.maxDepth) deny`. `maxDepth` itself is clamped
   to a compile-time absolute ceiling, the same pattern as
   `ABSOLUTE_DISCOVERY_BUDGET` in `src/connections/discovery-engine.ts`.
2. **Budget inheritance.** `parentAccount.allocate(requested)` — the existing
   account charges propagate up the tree, `canAllocate` refuses a child whose
   request survives clamping changed, and the parent's `reserveUsd` is never
   allocatable. Spawning agents cannot mint money because the account tree
   roots at the mission envelope the user set.
3. **Permission inheritance.** `childPerms = intersect(parentPerms, requested)`:
   every flag in `CoworkToolPerms` is boolean, so narrowing is mechanical.
   `skills` and tool namespaces narrow the same way. A child asking for a
   permission its parent lacks gets the parent's set (and the denial is
   logged), never a union.
4. **Evidence-gate inheritance.** The child returns a structured evidence
   report (reuse the `specialist-evidence.ts` report shape). The parent's own
   completion gate treats an unverified child report as missing evidence —
   the same "don't accept a sub-agent's done" rule the engineering engine
   already enforces. Verification authority stays with the parent's gate; a
   child cannot mark its own work verified when the policy requires
   independent verification.
5. **Approval inheritance.** Structural, not configured: gates are minted and
   settled by the runtime/host (the `delegation.ts` one-way rule), and the
   authority policy's vetoes are evaluated before any allow-list at every
   depth. A child hitting a spend/external-write/destructive gate raises a
   request into the same resolver chain the parent uses; the spawn call
   carries `scope` labels only.
6. **Parent ownership.** The sub-agent's report returns to the parent agent's
   context as a tool result; the parent decides the next action. Children
   never post to the conversation directly in v1 — the parent speaks for its
   subtree, which also keeps the transcript readable.
7. **Lifecycle control.** Sub-agents are ephemeral instances, not store
   profiles: created on spawn, terminated on report, timeout
   (`maxRuntimeMinutes`, enforced with the delegation timeout pattern), parent
   cancellation (the specialist runner already cancels in-flight children
   when its parent stops), or budget exhaustion. A terminated child's account
   is sealed so late charges are impossible.
8. **Global visibility.** The store gains a per-mission execution tree:
   `{ agentId, parentAgentId, depth, status, spend, evidenceState, blockedOn }`
   per node, updated on the same change-sequence event stream the transcript
   already uses. The Cowork UI renders the tree indented under the mission;
   every node is attributable because charges propagate through the account
   tree with the node's id attached.

## New surface area

- `src/cowork/subagents.ts` — spawn/clamp/terminate logic; the
  `spawn_sub_agent` tool registered only when the parent holds the sub-agent
  capability and `depth < maxDepth`.
- Store: ephemeral `SubAgentInstance` records plus the mission execution-tree
  index (separate from durable `CoworkAgent` profiles so a restart can
  orphan-sweep them).
- Evidence: extend `specialist-evidence.ts` report shape with
  `parentAgentId`/`depth` so a report is attributable to its slot in the tree.
- UI: mission tree panel (indentation = depth; node shows status, spend,
  evidence state, blocked reason).

## Explicit non-goals (v1)

- No child-initiated permission grants (mirrors `chief-resolver.ts`:
  "Permission grants are not supported").
- No child-to-child messaging; coordination flows through the common parent.
- No persistent sub-agents; anything durable is a teammate profile, which only
  the user (or a chief under the existing flags) creates.
- No widening of `ChiefAuthorityPolicy`: a sub-agent tree never makes the
  chief's delegated-answer envelope larger.
