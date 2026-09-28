/**
 * Cowork → cowork sub-agents: temporary workers a teammate spawns for one
 * objective, inside the same mission.
 *
 * The governing rule of this module, and the reason it exists separately from
 * the tool surface:
 *
 *   The parent agent may REQUEST a child. The host creates the child,
 *   determines its authority, and owns its lifecycle.
 *
 * So `spawn` never accepts authority from the model. The model supplies a
 * role, an objective and *requested* limits; everything authority-shaped is
 * computed here from host-trusted inputs:
 *
 *   agent request
 *      ↓
 *   validate request            (parseSubAgentParams — strict, like gitu_task)
 *      ↓
 *   check depth                 (host-tracked parent depth vs a hard ceiling)
 *      ↓
 *   clamp requested budget      (parent account's envelope minus its reserve)
 *      ↓
 *   intersect permissions       (parent ∩ requested ∩ host policy — never union)
 *      ↓
 *   create child budget account (charges propagate up the existing tree)
 *      ↓
 *   record SubAgentInstance     (ephemeral, mission-scoped, auditable)
 *      ↓
 *   run child                   (the host's job — this module owns no runtime)
 *
 * What this module deliberately reuses instead of reinventing: the budget
 * tree (`src/coding/budget.ts`) — a child's account is `parent.allocate()`,
 * so children share their parent's money rather than minting their own; and
 * the store's persistence, so a restart can sweep instances no runtime owns.
 * The evidence gate and approval chain need no changes: a child's work is
 * evidence its PARENT must verify, and any gate a child raises travels the
 * resolver chain the parent already uses — delegation cannot remove either.
 *
 * Depth is conservative on purpose: chief 0, durable cowork agent 1, sub-agent
 * 2, and `MAX_COWORK_DEPTH` caps v1 there. Raising it later is a one-line
 * change made after watching real missions, not something a spawn request can
 * do.
 */

import { budgetExhausted, type BudgetAccount, type BudgetSpend, type RunBudget } from '../coding/budget.js';
import { isManufacturedEvidenceCommand, isTrivialEvidenceCommand } from '../evidence/evidence.js';
import { excerpt } from '../util.js';
import type { ToolResult } from '../types.js';
import type { CoworkStore, SubAgentEvidenceDetail, SubAgentEvidenceReport, SubAgentInstance, SubAgentPermissions, SubAgentStatus } from './store.js';

/** Absolute spawn-depth ceiling for v1: chief 0 → cowork agent 1 → sub-agent 2. */
export const MAX_COWORK_DEPTH = 2;

/** Wall-clock defaults for one sub-agent run; the host enforces them. */
export const DEFAULT_SUBAGENT_RUNTIME_MINUTES = 15;
export const MAX_SUBAGENT_RUNTIME_MINUTES = 120;

/** Statuses in which an instance still holds resources and can transition. */
const ACTIVE_STATUSES: ReadonlySet<SubAgentStatus> = new Set(['starting', 'running', 'blocked']);

/** What the model asked for — a request, never an authorization. */
export interface SubAgentSpawnRequest {
  role: string;
  objective: string;
  /** Why the parent wants this child; persisted as `spawnedBy.reason`. */
  reason: string;
  requestedBudget: RunBudget;
  requestedPermissions?: Partial<SubAgentPermissions>;
  requestedSkills?: string[];
  maxRuntimeMinutes: number;
}

/**
 * Host-trusted spawn inputs. Everything here is asserted by the host about
 * the parent; none of it comes from the model's tool call.
 */
export interface SubAgentSpawnScope {
  store: CoworkStore;
  conversationId: string;
  /** The mission this spawn belongs to, when the turn is mission work. */
  missionId?: string;
  /** The parent as the host knows it: a durable agent id or an instance id. */
  parentAgentId: string;
  /** The durable agent at the root of this tree (depth 1). */
  rootAgentId: string;
  /** Host-tracked depth of the parent: chief 0, durable cowork agent 1. */
  parentDepth: number;
  /** The parent's effective permissions; the child can only ever lose some. */
  parentPermissions: SubAgentPermissions;
  parentSkills?: string[];
  /**
   * The account the child draws from — the mission's or conversation's, as
   * the host resolved it for the parent. Absent means unmetered at this
   * layer, which the spawn passes through honestly rather than inventing a
   * ceiling (the same contract `budgetPool` has in delegation).
   */
  parentAccount?: BudgetAccount;
  /** A host-wide ceiling applied after the parent's own permissions. */
  hostPermissions?: SubAgentPermissions;
  /** The host's depth allowance, clamped to MAX_COWORK_DEPTH. */
  maxDepth?: number;
}

export type SubAgentSpawnResult =
  | { ok: true; instance: SubAgentInstance; account?: BudgetAccount; permissions: SubAgentPermissions }
  | { ok: false; error: string };

const PERMISSION_KEYS = ['allowShell', 'allowWrites', 'allowConfig', 'browser'] as const;

/**
 * The one-way permission calculation: a child is the intersection of what its
 * parent holds, what it asked for, and what the host allows sub-agents at
 * all. Asking for more buys the intersection, never the union.
 */
export function intersectSubAgentPermissions(
  parent: SubAgentPermissions,
  requested?: Partial<SubAgentPermissions>,
  hostPolicy?: SubAgentPermissions,
): SubAgentPermissions {
  const child = {} as SubAgentPermissions;
  for (const key of PERMISSION_KEYS) {
    child[key] = parent[key] && (requested?.[key] ?? true) && (hostPolicy?.[key] ?? true);
  }
  return child;
}

/**
 * Parse the spawn tool's parameters strictly. A spawn starts a paid worker,
 * so a field the caller got wrong fails loudly here rather than being
 * silently defaulted into a different child than the one asked for.
 */
export function parseSubAgentParams(params: Record<string, unknown>): { ok: true; value: SubAgentSpawnRequest } | { ok: false; error: string } {
  const role = typeof params['role'] === 'string' ? params['role'].trim() : '';
  if (!role) return { ok: false, error: 'spawn_sub_agent requires a non-empty "role" (e.g. "competitor-researcher").' };
  const objective = typeof params['objective'] === 'string' ? params['objective'].trim() : '';
  if (!objective) return { ok: false, error: 'spawn_sub_agent requires a non-empty "objective" describing the work to complete.' };
  const reasonInput = params['reason'];
  const reason = typeof reasonInput === 'string' ? reasonInput.trim() : '';
  const budgetInput = params['budget'];
  if (budgetInput !== undefined && (typeof budgetInput !== 'object' || budgetInput === null || Array.isArray(budgetInput))) {
    return { ok: false, error: 'spawn_sub_agent "budget" must be an object like {"maxCostUsd":0.4,"maxTurns":20}.' };
  }
  const rawBudget = (budgetInput ?? {}) as Record<string, unknown>;
  const requestedBudget: RunBudget = {};
  for (const key of ['maxCostUsd', 'maxTurns', 'reserveUsd'] as const) {
    const value = rawBudget[key];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      return { ok: false, error: `spawn_sub_agent "budget.${key}" must be a positive number when given.` };
    }
    requestedBudget[key] = value;
  }
  const permsInput = params['permissions'];
  if (permsInput !== undefined && (typeof permsInput !== 'object' || permsInput === null || Array.isArray(permsInput))) {
    return { ok: false, error: 'spawn_sub_agent "permissions" must be an object like {"allowShell":false}.' };
  }
  const requestedPermissions: Partial<SubAgentPermissions> = {};
  for (const [key, value] of Object.entries((permsInput ?? {}) as Record<string, unknown>)) {
    if (!(PERMISSION_KEYS as readonly string[]).includes(key)) {
      return { ok: false, error: `spawn_sub_agent "permissions.${key}" is not a permission a sub-agent can hold.` };
    }
    if (typeof value !== 'boolean') return { ok: false, error: `spawn_sub_agent "permissions.${key}" must be boolean.` };
    requestedPermissions[key as keyof SubAgentPermissions] = value;
  }
  const skillsInput = params['skills'];
  if (skillsInput !== undefined && (!Array.isArray(skillsInput) || skillsInput.some((skill) => typeof skill !== 'string'))) {
    return { ok: false, error: 'spawn_sub_agent "skills" must be an array of skill names.' };
  }
  const runtimeInput = params['maxRuntimeMinutes'];
  let maxRuntimeMinutes = DEFAULT_SUBAGENT_RUNTIME_MINUTES;
  if (runtimeInput !== undefined) {
    if (typeof runtimeInput !== 'number' || !Number.isFinite(runtimeInput) || runtimeInput <= 0) {
      return { ok: false, error: 'spawn_sub_agent "maxRuntimeMinutes" must be a positive number of minutes.' };
    }
    maxRuntimeMinutes = Math.min(Math.round(runtimeInput), MAX_SUBAGENT_RUNTIME_MINUTES);
  }
  return {
    ok: true,
    value: {
      role,
      objective,
      reason: reason || `Parent requested a ${role} worker`,
      requestedBudget,
      ...(Object.keys(requestedPermissions).length > 0 ? { requestedPermissions } : {}),
      ...(Array.isArray(skillsInput) ? { requestedSkills: skillsInput.map((skill) => skill.trim()).filter(Boolean) } : {}),
      maxRuntimeMinutes,
    },
  };
}

/**
 * The spawn/clamp/terminate pipeline and the lifecycle of every instance it
 * creates.
 *
 * The manager owns no runtime: the host runs the child's turns and reports
 * the outcome back through `complete`/`fail`/`markBlocked`. What the manager
 * owns is everything an agent must never decide for itself — depth, the
 * clamped budget, the narrowed permissions, and the transitions that seal an
 * instance's account.
 */
export class CoworkSubAgents {
  /** Read-only handle for the execution layer; mutation still goes through the manager. */
  readonly store: CoworkStore;
  /** Live child accounts by instance id; sealed (dropped) at termination. */
  private readonly accounts = new Map<string, BudgetAccount>();
  /** Fired per instance at termination, before its account seals. */
  private readonly terminateListeners = new Set<(instanceId: string, reason: string) => void>();

  constructor(store: CoworkStore, private readonly onChange?: (conversationId: string) => void) {
    this.store = store;
  }

  /** Tell the host a tree changed, so subscribers re-render (SSE, panels). */
  private notify(conversationId: string | undefined): void {
    if (conversationId) this.onChange?.(conversationId);
  }

  /**
   * Subscribe to termination, for the execution layer's abort propagation.
   * The listener runs before the instance's account seals, so an in-flight
   * child turn is signalled while its charges still have somewhere to land.
   */
  onTerminate(listener: (instanceId: string, reason: string) => void): () => void {
    this.terminateListeners.add(listener);
    return () => {
      this.terminateListeners.delete(listener);
    };
  }

  /** The live budget account for an instance, while it has one. */
  accountFor(instanceId: string): BudgetAccount | undefined {
    return this.accounts.get(instanceId);
  }

  /** Instances still holding resources, optionally scoped to a mission. */
  active(missionId?: string): SubAgentInstance[] {
    return this.store.subAgents(missionId ? { missionId } : undefined).filter((instance) => ACTIVE_STATUSES.has(instance.status));
  }

  /** Direct children of one parent (a durable agent id or an instance id). */
  childrenOf(parentAgentId: string): SubAgentInstance[] {
    return this.store.subAgents().filter((instance) => instance.parentAgentId === parentAgentId);
  }

  /**
   * The execution tree for one conversation (optionally one mission): the
   * structure the Cowork UI renders for global visibility. Every node carries
   * LIVE spend while its account is open, so the picture is runtime truth
   * rather than a stale write-down, and totals roll the whole forest up.
   *
   * Children are nested by parent id, so a durable agent's workers appear as
   * roots and anything they spawn (a deeper tree, should `MAX_COWORK_DEPTH`
   * ever rise) nests beneath them.
   */
  tree(scope: { conversationId: string; missionId?: string }): SubAgentTree {
    const instances = this.store.subAgents({
      conversationId: scope.conversationId,
      ...(scope.missionId ? { missionId: scope.missionId } : {}),
    });
    const ids = new Set(instances.map((instance) => instance.id));
    const nodes = new Map<string, SubAgentTreeNode>(
      instances.map((instance) => {
        const account = this.accounts.get(instance.id);
        const spend = account ? account.spend() : instance.spend;
        const verdict = instance.evidence ? evaluateSubAgentEvidence(instance, instance.evidence) : undefined;
        return [
          instance.id,
          {
            id: instance.id,
            parentAgentId: instance.parentAgentId,
            rootAgentId: instance.rootAgentId,
            ...(instance.missionId ? { missionId: instance.missionId } : {}),
            depth: instance.depth,
            role: instance.role,
            objective: instance.objective,
            status: instance.status,
            ...(instance.statusReason ? { statusReason: instance.statusReason } : {}),
            spend: { costUsd: spend?.costUsd ?? 0, turns: spend?.turns ?? 0 },
            ...(instance.grantedBudget ? { grantedBudget: instance.grantedBudget } : {}),
            ...(verdict ? { evidence: { passed: verdict.passedRecords, total: verdict.totalRecords, accepted: verdict.accepted } } : {}),
            ...(instance.resultSummary ? { resultSummary: instance.resultSummary } : {}),
            createdAt: instance.createdAt,
            ...(instance.finishedAt ? { finishedAt: instance.finishedAt } : {}),
            children: [],
          },
        ];
      }),
    );
    const roots: SubAgentTreeNode[] = [];
    for (const instance of instances) {
      const node = nodes.get(instance.id)!;
      const parent = ids.has(instance.parentAgentId) ? nodes.get(instance.parentAgentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    const totals: SubAgentTreeTotals = { active: 0, blocked: 0, completed: 0, failed: 0, terminated: 0, orphaned: 0, spendUsd: 0 };
    for (const node of nodes.values()) {
      const status = node.status;
      if (status === 'starting' || status === 'running') totals.active += 1;
      else totals[status] += 1;
      totals.spendUsd += node.spend.costUsd;
    }
    totals.spendUsd = Math.round(totals.spendUsd * 100) / 100;
    return {
      conversationId: scope.conversationId,
      ...(scope.missionId ? { missionId: scope.missionId } : {}),
      nodes: roots,
      totals,
    };
  }

  /** Every instance in the conversation, terminal ones included (audit history). */
  history(conversationId: string): SubAgentInstance[] {
    return this.store.subAgents({ conversationId });
  }

  /**
   * Run the spawn pipeline for one agent request. Every denial is returned,
   * never thrown: a refused spawn is a normal tool result the parent reads.
   */
  spawn(scope: SubAgentSpawnScope, params: Record<string, unknown>, origin?: { requestId?: string }): SubAgentSpawnResult {
    const parsed = parseSubAgentParams(params);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const request = parsed.value;

    // Depth is host arithmetic on a host-tracked number; the request cannot
    // see it, let alone raise it.
    const maxDepth = Math.max(1, Math.min(MAX_COWORK_DEPTH, Math.floor(scope.maxDepth ?? MAX_COWORK_DEPTH)));
    const depth = scope.parentDepth + 1;
    if (depth > maxDepth) {
      return { ok: false, error: `Sub-agent depth limit reached: the parent is at depth ${scope.parentDepth} and this mission allows at most ${maxDepth}. Complete the work directly or report back instead.` };
    }

    // Provenance is validated before anything is created — a spawn record
    // pointing at a conversation or mission that does not exist is an audit
    // lie, so it is refused here rather than repaired later.
    if (!this.store.getConversation(scope.conversationId)) return { ok: false, error: 'spawn_sub_agent failed: the conversation no longer exists.' };
    if (scope.missionId !== undefined && !this.store.getMission(scope.missionId)) {
      return { ok: false, error: 'spawn_sub_agent failed: the mission no longer exists.' };
    }

    const permissions = intersectSubAgentPermissions(scope.parentPermissions, request.requestedPermissions, scope.hostPermissions);
    const parentSkills = scope.parentSkills ?? [];
    const skills = request.requestedSkills === undefined ? [...parentSkills] : request.requestedSkills.filter((skill) => parentSkills.includes(skill));

    // Budget: the parent's delegation ceiling bounds how many live children
    // it may have (a count of active instances, kept apart from the money and
    // turn exhaustion of the account itself), and the child draws from an
    // account inside the parent's envelope — the parent's reserve stays
    // unallocatable above it, and every child charge is visible at the parent.
    let account: BudgetAccount | undefined;
    if (scope.parentAccount) {
      if (scope.parentAccount.exhausted()) {
        return { ok: false, error: 'spawn_sub_agent refused: the parent budget is exhausted. Report back with what is done so far.' };
      }
      const maxSlots = scope.parentAccount.budget.maxSubagents;
      if (maxSlots !== undefined) {
        const activeSiblings = this.childrenOf(scope.parentAgentId).filter((instance) => instance.missionId === scope.missionId && ACTIVE_STATUSES.has(instance.status)).length;
        if (activeSiblings >= maxSlots) {
          return { ok: false, error: `spawn_sub_agent refused: the parent has reached its delegation limit of ${maxSlots} active sub-agent${maxSlots === 1 ? '' : 's'}. Wait for one to finish or do the work directly.` };
        }
      }
      account = scope.parentAccount.allocate(request.requestedBudget);
      if (budgetExhausted(account.budget, {})) {
        return { ok: false, error: 'spawn_sub_agent refused: nothing is left of the parent budget to grant a child.' };
      }
    }

    const instance = this.store.createSubAgent({
      conversationId: scope.conversationId,
      ...(scope.missionId !== undefined ? { missionId: scope.missionId } : {}),
      parentAgentId: scope.parentAgentId,
      rootAgentId: scope.rootAgentId,
      spawnedBy: { agentId: scope.parentAgentId, reason: request.reason, ...(origin?.requestId ? { requestId: origin.requestId } : {}) },
      depth,
      maxDepth,
      // The child sees the clamped envelope, not the request: asking for
      // $0.50 when $0.22 is allocatable produces a child that believes it
      // has $0.22.
      ...(account ? { grantedBudget: account.budget } : {}),
      permissions,
      skills,
      role: request.role,
      objective: request.objective,
      maxRuntimeMinutes: request.maxRuntimeMinutes,
    });
    if (account) this.accounts.set(instance.id, account);
    this.notify(instance.conversationId);
    return { ok: true, instance, ...(account ? { account } : {}), permissions };
  }

  /** starting/blocked → running, when the host begins the child's turn. */
  markRunning(id: string): SubAgentInstance | undefined {
    return this.transition(id, 'running');
  }

  /** running → blocked, with the reason the parent (and the UI) will read. */
  markBlocked(id: string, reason: string): SubAgentInstance | undefined {
    return this.transition(id, 'blocked', { statusReason: reason.slice(0, 500) });
  }

  /** Terminal: the child reported its result to its parent, gate-approved. */
  complete(id: string, resultSummary?: string, evidence?: SubAgentEvidenceReport): SubAgentInstance | undefined {
    return this.transition(id, 'completed', {
      ...(resultSummary ? { resultSummary: resultSummary.slice(0, 2_000) } : {}),
      ...(evidence ? { evidence } : {}),
    });
  }

  /** Terminal: the child crashed or could not finish its objective. */
  fail(id: string, reason: string): SubAgentInstance | undefined {
    return this.transition(id, 'failed', { statusReason: reason.slice(0, 500) });
  }

  /**
   * Terminal: stopped from outside (timeout, user stop, mission end, parent
   * death). Termination cascades: a dead parent's children cannot keep
   * spending, because the account they charge belongs to the parent's tree.
   *
   * Ordering matters: every live turn in the subtree is signalled (via
   * `onTerminate`) BEFORE any account seals — a sealed account whose model
   * calls are still running would keep spending against nothing.
   */
  terminate(id: string, reason: string): SubAgentInstance | undefined {
    const targets: { instance: SubAgentInstance; reason: string }[] = [];
    const collect = (instanceId: string, why: string): void => {
      const instance = this.store.getSubAgent(instanceId);
      if (!instance || !ACTIVE_STATUSES.has(instance.status)) return;
      for (const child of this.childrenOf(instanceId)) collect(child.id, `parent terminated: ${reason}`.slice(0, 500));
      targets.push({ instance, reason: why.slice(0, 500) });
    };
    collect(id, reason);
    for (const target of targets) {
      for (const listener of this.terminateListeners) listener(target.instance.id, target.reason);
    }
    for (const target of targets) this.transition(target.instance.id, 'terminated', { statusReason: target.reason });
    return targets.some((target) => target.instance.id === id) ? this.store.getSubAgent(id) : undefined;
  }

  /** Mission finished or cancelled: terminate every worker it still owns. */
  terminateMissionSubtree(missionId: string, reason: string): SubAgentInstance[] {
    return this.active(missionId).map((instance) => this.terminate(instance.id, reason)).filter((instance): instance is SubAgentInstance => Boolean(instance));
  }

  /**
   * Startup sweep: any instance still active whose id the live runtime does
   * not claim is a corpse from before a restart — its account is gone, its
   * turn will never report. Mark it orphaned and seal what is left.
   */
  sweepOrphans(runtimeOwns: (instanceId: string) => boolean): SubAgentInstance[] {
    const orphaned: SubAgentInstance[] = [];
    for (const instance of this.active()) {
      if (runtimeOwns(instance.id)) continue;
      const swept = this.transition(instance.id, 'orphaned', { statusReason: 'no live runtime owned this sub-agent after a restart' });
      if (swept) orphaned.push(swept);
    }
    return orphaned;
  }

  /**
   * One transition with the invariants in one place: terminal states are
   * final, settling seals the account after snapshotting its spend, and the
   * spend snapshot is what the audit trail reads once the live account is
   * gone.
   */
  private transition(id: string, status: SubAgentStatus, extra: { statusReason?: string; resultSummary?: string; evidence?: SubAgentEvidenceReport } = {}): SubAgentInstance | undefined {
    const instance = this.store.getSubAgent(id);
    if (!instance || !ACTIVE_STATUSES.has(instance.status)) return undefined;
    const patch: Partial<SubAgentInstance> = { status, ...extra };
    if (!ACTIVE_STATUSES.has(status)) {
      const account = this.accounts.get(id);
      if (account) {
        const spend: BudgetSpend = account.spend();
        patch.spend = { costUsd: spend.costUsd ?? 0, turns: spend.turns ?? 0, subagents: spend.subagents ?? 0 };
        this.accounts.delete(id);
      }
      patch.finishedAt = new Date().toISOString();
    }
    const updated = this.store.updateSubAgent(id, patch);
    this.notify(updated?.conversationId);
    return updated;
  }
}

// ─── execution ───────────────────────────────────────────────────────────────

/**
 * What the parent reads when its child settles. This is the ONLY output a
 * sub-agent produces: it travels as a tool result inside the parent's turn,
 * never as a conversation message — the parent decides what the human hears.
 */
export interface SubAgentResult {
  instanceId: string;
  status: 'completed' | 'failed';
  summary: string;
  usage: { costUsd: number; turns: number };
  /** Present when the child settled — the gate-validated report. */
  evidence?: SubAgentEvidenceReport;
}

/** Everything the host hands the child's isolated turn. */
export interface SubAgentChildRunInput {
  instance: SubAgentInstance;
  permissions: SubAgentPermissions;
  /**
   * The exact account created for this child at spawn — never a fallback to
   * the mission or root account. The runner fails closed when it is missing.
   */
  account: BudgetAccount;
  /** The parent's live shared pool remaining, so the child's briefing is honest. */
  availableSharedUsd?: number;
  /** Tripped by termination, the parent turn stopping, or the runtime cap. */
  signal: AbortSignal;
}

export interface SubAgentChildRunOutcome {
  summary: string;
  /** Informational: charges already happened live against the child account. */
  usage: { turns: number };
  /**
   * The child's evidence report, host-built from its actual tool trail. The
   * parent's gate validates it before the child may count as completed.
   */
  evidence?: SubAgentEvidenceReport;
}

/** The host-owned isolated child turn. The composition root supplies it. */
export type SubAgentChildRunner = (input: SubAgentChildRunInput) => Promise<SubAgentChildRunOutcome>;

/** What the tool surface gets: identity already bound, params the only input. */
export interface CoworkSubAgentBridge {
  run: (params: Record<string, unknown>) => Promise<ToolResult>;
}

/**
 * Host-derived identity of the agent calling spawn_sub_agent. Every field is
 * asserted by the host about the caller; the tool's params never carry any of
 * it, so a model cannot relocate its child into another mission or parent.
 */
export interface SubAgentToolScope {
  conversationId: string;
  missionId?: string;
  parentAgentId: string;
  rootAgentId: string;
  parentDepth: number;
  parentPermissions: SubAgentPermissions;
  parentSkills: string[];
  parentAccount?: BudgetAccount;
  hostPermissions?: SubAgentPermissions;
  /** The calling turn's signal: the child stops when the parent turn does. */
  signal?: AbortSignal;
}

/**
 * One node of the execution tree — projected from the runtime, not authored.
 * `spend` prefers the LIVE account (so a running child's cost is current) and
 * falls back to the sealed snapshot once its account is closed. This is the
 * structure a UI renders directly: indent by `depth`, show `status`,
 * `spend`, evidence state and the blocked reason.
 */
export interface SubAgentTreeNode {
  id: string;
  /** Who spawned it: a durable agent id, or a parent instance id. */
  parentAgentId: string;
  rootAgentId: string;
  /** The mission this worker belongs to (the UI groups trees by it). */
  missionId?: string;
  depth: number;
  role: string;
  objective: string;
  status: SubAgentStatus;
  /** Why it is blocked / failed / terminated, when it is. */
  statusReason?: string;
  spend: { costUsd: number; turns: number };
  grantedBudget?: SubAgentInstance['grantedBudget'];
  evidence?: { passed: number; total: number; accepted: boolean };
  resultSummary?: string;
  createdAt: string;
  finishedAt?: string;
  children: SubAgentTreeNode[];
}

export interface SubAgentTreeTotals {
  active: number;
  blocked: number;
  completed: number;
  failed: number;
  terminated: number;
  orphaned: number;
  spendUsd: number;
}

export interface SubAgentTree {
  conversationId: string;
  missionId?: string;
  /** Root nodes: children of durable agents. Their own children nest below. */
  nodes: SubAgentTreeNode[];
  totals: SubAgentTreeTotals;
}

// ─── evidence gate ────────────────────────────────────────────────────────────

/** Host policy for when a child's report may count as completed. */
export interface SubAgentEvidencePolicy {
  /** A completed child needs at least one evidence record that passed. */
  requirePassedEvidence: boolean;
  /** A completed child needs a non-empty report. */
  requireReport: boolean;
}

export const DEFAULT_SUBAGENT_EVIDENCE_POLICY: SubAgentEvidencePolicy = { requirePassedEvidence: true, requireReport: true };

/** One tool execution on the child's trail, as the host observed it. */
export interface SubAgentTrailEntry {
  tool: string;
  params: Record<string, unknown>;
  result: ToolResult;
}

/** Host-built report from the child's actual tool trail; never model-authored. */
export function buildSubAgentEvidenceReport(instance: SubAgentInstance, reportSummary: string, trail: SubAgentTrailEntry[]): SubAgentEvidenceReport {
  return {
    instanceId: instance.id,
    parentAgentId: instance.parentAgentId,
    depth: instance.depth,
    role: instance.role,
    reportSummary: reportSummary.slice(0, 4_000),
    evidence: trail.map((entry, index): SubAgentEvidenceDetail => ({
      id: `ce-${index + 1}`,
      tool: entry.tool,
      ...(typeof entry.params['command'] === 'string' ? { command: entry.params['command'] } : {}),
      kind: entry.tool === 'run_command' ? 'command' : 'tool_result',
      passed: entry.result.ok,
      outputExcerpt: excerpt(entry.result.output, 240),
    })),
  };
}

export interface SubAgentEvidenceVerdict {
  accepted: boolean;
  reasons: string[];
  passedRecords: number;
  totalRecords: number;
}

function recordInvalidReason(record: SubAgentEvidenceDetail): string | undefined {
  if (!record.passed) return 'evidence did not pass';
  if (record.command && isManufacturedEvidenceCommand(record.command)) return `evidence command "${record.command}" manufactures its own output and is not independent proof`;
  if (record.kind === 'command' && record.command && isTrivialEvidenceCommand(record.command)) return `evidence command "${record.command}" is a no-op and cannot verify work`;
  return undefined;
}

/**
 * The parent's independent check of a child's evidence — the cowork-layer
 * mirror of the engineering engine's specialist evidence gate. A child's
 * report is evidence FOR the parent to evaluate, never automatic proof: the
 * verdict here decides whether the child may count as completed, and the
 * reasons are what the parent reads when it is not.
 *
 * Three families of rejection, in order: a report that does not belong to
 * exactly this child at this depth under this parent (a child cannot mark its
 * own work verified, and a report cannot be replayed into another slot in the
 * tree); a report that says nothing; and a trail with nothing that passed —
 * including trails whose only "passing" command manufactured its own output
 * or was a no-op, reusing the shared evidence predicates so the two gates can
 * never drift apart on what counts as proof.
 */
export function evaluateSubAgentEvidence(
  instance: SubAgentInstance,
  report: SubAgentEvidenceReport | undefined,
  policy: SubAgentEvidencePolicy = DEFAULT_SUBAGENT_EVIDENCE_POLICY,
): SubAgentEvidenceVerdict {
  if (!report) {
    return { accepted: false, reasons: ['the sub-agent returned no evidence report'], passedRecords: 0, totalRecords: 0 };
  }
  const reasons: string[] = [];
  if (report.instanceId !== instance.id) reasons.push(`the report claims instance "${report.instanceId}", not the child that ran ("${instance.id}")`);
  if (report.parentAgentId !== instance.parentAgentId) reasons.push(`the report claims parent "${report.parentAgentId}", not "${instance.parentAgentId}"`);
  if (report.depth !== instance.depth) reasons.push(`the report claims depth ${report.depth}, not ${instance.depth}`);
  if (policy.requireReport && !report.reportSummary.trim()) reasons.push('the report is empty');
  const total = report.evidence.length;
  let passedRecords = 0;
  for (const record of report.evidence) {
    if (!record.passed) continue;
    // A "passing" record that manufactures its own output or is a no-op is
    // rejected explicitly — the reason travels to the parent with the verdict.
    const invalid = recordInvalidReason(record);
    if (invalid) reasons.push(`evidence ${record.id} (${record.tool}): ${invalid}`);
    else passedRecords += 1;
  }
  if (policy.requirePassedEvidence && total === 0) reasons.push('the child ran no tools, so its report carries no evidence');
  if (policy.requirePassedEvidence && total > 0 && passedRecords === 0) reasons.push('no evidence record passed; an unverified report is not completion');
  return { accepted: reasons.length === 0, reasons, passedRecords, totalRecords: total };
}

/**
 * The spawn_sub_agent execution path: spawn → bind the exact child account →
 * run the host's isolated turn → settle. It owns the per-run AbortController
 * so `CoworkSubAgents.terminate` reaches the running model and tool calls,
 * not just the store record.
 */
export class CoworkSubAgentRunner {
  private readonly controllers = new Map<string, AbortController>();

  constructor(
    private readonly manager: CoworkSubAgents,
    private readonly policy: SubAgentEvidencePolicy = DEFAULT_SUBAGENT_EVIDENCE_POLICY,
  ) {}

  /** True while this process executes the instance — the orphan sweep's answer. */
  runtimeOwns(instanceId: string): boolean {
    return this.controllers.has(instanceId);
  }

  /** Mission settled: terminate every worker it still owns (aborts live turns first). */
  terminateMissionSubtree(missionId: string, reason: string): SubAgentInstance[] {
    return this.manager.terminateMissionSubtree(missionId, reason);
  }

  /** Startup sweep, wired to this runner's live set by construction. */
  sweepOrphans(): SubAgentInstance[] {
    return this.manager.sweepOrphans((instanceId) => this.runtimeOwns(instanceId));
  }

  /** The execution tree the Cowork UI renders (live spend, gate state, nesting). */
  tree(scope: { conversationId: string; missionId?: string }): SubAgentTree {
    return this.manager.tree(scope);
  }

  /** Bind host-derived identity to a child runner, producing the tool bridge. */
  bridgeFor(scope: SubAgentToolScope, runChild: SubAgentChildRunner): CoworkSubAgentBridge {
    return { run: (params) => this.run(scope, runChild, params) };
  }

  async run(scope: SubAgentToolScope, runChild: SubAgentChildRunner, params: Record<string, unknown>): Promise<ToolResult> {
    const spawned = this.manager.spawn(
      {
        store: this.manager.store,
        conversationId: scope.conversationId,
        ...(scope.missionId !== undefined ? { missionId: scope.missionId } : {}),
        parentAgentId: scope.parentAgentId,
        rootAgentId: scope.rootAgentId,
        parentDepth: scope.parentDepth,
        parentPermissions: scope.parentPermissions,
        parentSkills: scope.parentSkills,
        ...(scope.parentAccount ? { parentAccount: scope.parentAccount } : {}),
        ...(scope.hostPermissions ? { hostPermissions: scope.hostPermissions } : {}),
      },
      params,
    );
    if (!spawned.ok) return { ok: false, output: spawned.error };
    const { instance, permissions } = spawned;

    // Fail closed: no child account means no run. Falling back to the mission
    // or root account would spend money the grant never covered.
    const account = this.manager.accountFor(instance.id);
    if (!account) {
      this.manager.fail(instance.id, 'no budget account was bound at spawn');
      return { ok: false, output: 'spawn_sub_agent failed closed: the child has no budget account of its own, so it cannot run. The host must supply a parent budget for sub-agent work.' };
    }

    const controller = new AbortController();
    this.controllers.set(instance.id, controller);
    const abortWith = (reason: unknown): void => controller.abort(reason instanceof Error ? reason : new Error(String(reason ?? 'terminated')));
    const offTerminate = this.manager.onTerminate((terminatedId, reason) => {
      if (terminatedId === instance.id) abortWith(reason);
    });
    const onParentAbort = (): void => abortWith(scope.signal?.reason ?? 'the parent turn stopped');
    scope.signal?.addEventListener('abort', onParentAbort, { once: true });
    const runtimeMinutes = instance.maxRuntimeMinutes ?? DEFAULT_SUBAGENT_RUNTIME_MINUTES;
    const timer = setTimeout(() => abortWith(`time limit reached (${runtimeMinutes} minutes)`), runtimeMinutes * 60_000);

    this.manager.markRunning(instance.id);
    try {
      const outcome = await runChild({
        instance,
        permissions,
        account,
        ...(scope.parentAccount?.remaining().costUsd !== undefined ? { availableSharedUsd: scope.parentAccount.remaining().costUsd } : {}),
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        this.manager.terminate(instance.id, String(controller.signal.reason ?? 'terminated'));
        return { ok: false, output: `Sub-agent "${instance.role}" was terminated before it could report: ${String(controller.signal.reason ?? 'terminated')}. Its budget account is sealed.` };
      }
      // The Evidence Gate: the child's report is evidence FOR the parent to
      // evaluate, never automatic proof. A rejected report means the child is
      // NOT completed — the reasons tell the parent exactly why.
      const verdict = evaluateSubAgentEvidence(instance, outcome.evidence, this.policy);
      if (!verdict.accepted) {
        this.manager.fail(instance.id, `evidence gate: ${verdict.reasons.join('; ')}`);
        return { ok: false, output: `Sub-agent "${instance.role}" was NOT accepted. Evidence gate: ${verdict.reasons.join('; ')}. Verify nothing on its behalf — re-spawn with a tighter objective or do the work directly.` };
      }
      const completed = this.manager.complete(instance.id, outcome.summary, outcome.evidence);
      if (!completed) return { ok: false, output: `Sub-agent "${instance.role}" was settled externally before its report landed.` };
      return { ok: true, output: subAgentResultSummary(completed) };
    } catch (err) {
      if (controller.signal.aborted) {
        this.manager.terminate(instance.id, String(controller.signal.reason ?? 'terminated'));
        return { ok: false, output: `Sub-agent "${instance.role}" was terminated: ${String(controller.signal.reason ?? 'terminated')}. Its budget account is sealed.` };
      }
      this.manager.fail(instance.id, (err as Error).message);
      return { ok: false, output: `Sub-agent "${instance.role}" failed: ${(err as Error).message}` };
    } finally {
      clearTimeout(timer);
      offTerminate();
      scope.signal?.removeEventListener('abort', onParentAbort);
      this.controllers.delete(instance.id);
    }
  }
}

/**
 * The tool result the parent reads. A summary on purpose — the same contract
 * as gitu_task: the parent must verify the work before claiming it as done.
 * The money line keeps the child's individual ceiling distinct from the
 * team's shared pool, because the ceiling was never a reservation.
 */
export function subAgentResultSummary(instance: SubAgentInstance): string {
  const lines = [
    `Sub-agent "${instance.role}" ${instance.status} (id ${instance.id}).`,
    `Report: ${instance.resultSummary ?? '(none)'}`,
  ];
  const spend = instance.spend;
  if (spend) {
    const ceiling = instance.grantedBudget?.maxCostUsd;
    lines.push(`Usage: $${(spend.costUsd ?? 0).toFixed(2)} across ${spend.turns ?? 0} turn(s)${ceiling !== undefined ? ` of its $${ceiling.toFixed(2)} ceiling, drawn from the team's shared budget` : ''}.`);
  }
  if (instance.evidence) {
    const verdict = evaluateSubAgentEvidence(instance, instance.evidence);
    lines.push(`Evidence: ${verdict.passedRecords}/${verdict.totalRecords} record(s) passed the gate — verify the work with your own tools before reporting it as done.`);
  } else {
    lines.push('Verify the work with your own tools before reporting it as done.');
  }
  return lines.join('\n');
}

