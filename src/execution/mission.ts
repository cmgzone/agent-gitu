import { EvidenceEngine } from '../evidence/evidence.js';
import {
  parentReverifyCriterion,
  type OracleRunner,
  type ParentReverifyResult,
  type ReverifyLedgerView,
} from '../evidence/reverify.js';
import { nowIso, shortId } from '../util.js';
import type { AcceptanceCriterion, CriterionSpec, Evidence } from '../types.js';

/**
 * Formal mission execution tree (execution-hardening increment).
 *
 * Gitu previously had NO hierarchical lifecycle: a specialist self-report was
 * mirrored into the main ledger and trusted, there was no dependency graph, no
 * ownership coordination, no ABANDONED state, and no integration pass. This
 * module adds the coordination layer WITHOUT re-implementing evidence,
 * fingerprints, or the evidence engine — it reuses `EvidenceEngine`,
 * `parentReverifyCriterion`, and `getWorkspaceFingerprint` (injected).
 *
 * Lifecycle:
 *   WAITING → READY → IN_FLIGHT → SELF_VERIFIED
 *     → PARENT_REVERIFIED → INTEGRATION_VERIFIED  (happy path)
 *   FAILED | BLOCKED | ABANDONED                   (unhappy paths, all distinct)
 *
 * A status read is never re-execution: PARENT_REVERIFIED is only reached by
 * actually re-running each runnable oracle through `parentReverifyCriterion`.
 */

export type LeafState =
  | 'WAITING'
  | 'READY'
  | 'IN_FLIGHT'
  | 'SELF_VERIFIED'
  | 'PARENT_REVERIFIED'
  | 'INTEGRATION_VERIFIED'
  | 'FAILED'
  | 'BLOCKED'
  | 'ABANDONED';

/** States that count as "verified" for the purpose of unlocking dependents. */
const VERIFIED_STATES: ReadonlySet<LeafState> = new Set(['PARENT_REVERIFIED', 'INTEGRATION_VERIFIED']);
/** Terminal unhappy states — each distinct, none of them "success". */
const UNHAPPY_STATES: ReadonlySet<LeafState> = new Set(['FAILED', 'BLOCKED', 'ABANDONED']);

export interface LeafDef {
  id: string;
  objective: string;
  criteria: (string | CriterionSpec)[];
  dependencies?: string[];
  owner?: string;
  /** Repo-relative paths this leaf intends to touch (coordination, NOT a sandbox). */
  scope?: string[];
  branch?: string;
  /** Required leaves gate mission completion; optional leaves do not. */
  required?: boolean;
}

export interface Leaf {
  id: string;
  objective: string;
  required: boolean;
  branch?: string;
  owner?: string;
  scope: string[];
  dependencies: string[];
  criteria: AcceptanceCriterion[];
  evidence: Evidence[];
  state: LeafState;
  /** Audit trail of every transition. */
  history: { at: string; from: LeafState; to: LeafState; note?: string }[];
  stateReason?: string;
  /** Set of leaf ids still blocking this leaf (recomputed). */
  blockedBy: string[];
  /** Recovery attempts for early-stop discipline. */
  recoveryAttempts: number;
}

export interface BranchDef {
  id: string;
  leafIds: string[];
  /** Optional integration oracle run after all children are parent-reverified. */
  integration?: { objective: string; verification?: string };
}

export interface Branch {
  id: string;
  leafIds: string[];
  integration?: { objective: string; verification?: string };
  integrationState: 'PENDING' | 'VERIFIED' | 'FAILED';
  integrationEvidenceId?: string;
  integrationReason?: string;
}

export interface AuditReport {
  complete: boolean;
  /** Every required outcome enumerated, with its live state. */
  leaves: { id: string; required: boolean; state: LeafState; freshEvidence: boolean }[];
  blockers: string[];
  staleEvidence: { leafId: string; evidenceId: string }[];
  missingEvidence: string[];
  abandonedRequired: string[];
  integration: { branchId: string; state: Branch['integrationState'] }[];
  generatedAt: string;
}

/** Normalize a repo-relative path for overlap comparison. */
function normPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '').toLowerCase();
}

/** True when two repo-relative paths overlap (equal, or one nested in the other). */
export function pathsOverlap(a: string, b: string): boolean {
  const x = normPath(a);
  const y = normPath(b);
  if (!x || !y) return false;
  return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
}

/** True when two declared scopes share any path. */
export function scopesOverlap(a: string[], b: string[]): boolean {
  for (const p of a) for (const q of b) if (pathsOverlap(p, q)) return true;
  return false;
}

export class MissionGraph {
  readonly leaves = new Map<string, Leaf>();
  readonly branches = new Map<string, Branch>();
  private readonly engine = new EvidenceEngine();
  /** Leaves currently holding their scope (IN_FLIGHT). */
  private readonly inFlight = new Set<string>();
  /** User amendments applied to the contract (drives invalidation). */
  readonly amendments: { at: string; summary: string; affectedLeafIds: string[] }[] = [];

  defineLeaf(def: LeafDef): Leaf {
    if (this.leaves.has(def.id)) throw new Error(`duplicate leaf id "${def.id}"`);
    const criteria = EvidenceEngine.criteriaFromSpecs(EvidenceEngine.normalizeCriteria(def.criteria));
    const leaf: Leaf = {
      id: def.id,
      objective: def.objective,
      required: def.required !== false,
      branch: def.branch,
      owner: def.owner,
      scope: [...(def.scope ?? [])],
      dependencies: [...(def.dependencies ?? [])],
      criteria,
      evidence: [],
      state: 'WAITING',
      history: [],
      blockedBy: [],
      recoveryAttempts: 0,
    };
    this.leaves.set(def.id, leaf);
    this.recomputeReadiness();
    return leaf;
  }

  defineBranch(def: BranchDef): Branch {
    const branch: Branch = {
      id: def.id,
      leafIds: [...def.leafIds],
      integration: def.integration,
      integrationState: 'PENDING',
    };
    this.branches.set(def.id, branch);
    for (const leafId of def.leafIds) {
      const leaf = this.leaves.get(leafId);
      if (leaf) leaf.branch = def.id;
    }
    return branch;
  }

  get(id: string): Leaf | undefined {
    return this.leaves.get(id);
  }

  /** Number of leaves currently holding their scope (IN_FLIGHT). */
  inFlightCount(): number {
    return this.inFlight.size;
  }

  private transition(leaf: Leaf, to: LeafState, note?: string): void {
    const from = leaf.state;
    leaf.history.push({ at: nowIso(), from, to, note });
    leaf.state = to;
    if (to !== 'IN_FLIGHT') this.inFlight.delete(leaf.id);
    if (to === 'IN_FLIGHT') this.inFlight.add(leaf.id);
  }

  /** Recompute WAITING→READY based on dependency verification. Rolling: a
   *  newly-verified dependency makes its dependents eligible immediately. */
  recomputeReadiness(): void {
    for (const leaf of this.leaves.values()) {
      if (leaf.state !== 'WAITING') {
        leaf.blockedBy = [];
        continue;
      }
      const unmet = leaf.dependencies.filter((d) => {
        const dep = this.leaves.get(d);
        return !dep || !VERIFIED_STATES.has(dep.state);
      });
      leaf.blockedBy = unmet;
      if (unmet.length === 0) this.transition(leaf, 'READY', 'all dependencies verified');
    }
  }

  /** Leaves eligible for dispatch right now: READY, and scope-disjoint from
   *  everything already in flight AND from each other. Respects `concurrency`.
   *  Never invents dependencies — only declared `dependencies` gate readiness. */
  dispatchable(concurrency: number): Leaf[] {
    const held: string[][] = [...this.inFlight].map((id) => this.leaves.get(id)!.scope);
    const out: Leaf[] = [];
    // Deterministic order: insertion order of the leaves map.
    for (const leaf of this.leaves.values()) {
      if (leaf.state !== 'READY') continue;
      if (out.length >= concurrency) break;
      const clashesHeld = held.some((s) => scopesOverlap(leaf.scope, s));
      const clashesSelected = out.some((o) => scopesOverlap(leaf.scope, o.scope));
      if (clashesHeld || clashesSelected) continue;
      out.push(leaf);
    }
    return out;
  }

  /** Detect overlapping ownership among a set of candidate leaves (pre-dispatch). */
  ownershipConflicts(candidates: string[]): { a: string; b: string; shared: string[] }[] {
    const conflicts: { a: string; b: string; shared: string[] }[] = [];
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const A = this.leaves.get(candidates[i]!);
        const B = this.leaves.get(candidates[j]!);
        if (!A || !B) continue;
        const shared = A.scope.filter((p) => B.scope.some((q) => pathsOverlap(p, q)));
        if (shared.length > 0) conflicts.push({ a: A.id, b: B.id, shared });
      }
    }
    return conflicts;
  }

  /** Begin executing a leaf. Refuses if it would overlap an in-flight scope. */
  startLeaf(id: string): { ok: boolean; reason?: string } {
    const leaf = this.leaves.get(id);
    if (!leaf) return { ok: false, reason: `unknown leaf "${id}"` };
    if (leaf.state !== 'READY') return { ok: false, reason: `leaf "${id}" is ${leaf.state}, not READY` };
    for (const otherId of this.inFlight) {
      const other = this.leaves.get(otherId)!;
      if (scopesOverlap(leaf.scope, other.scope)) {
        return { ok: false, reason: `scope overlap with in-flight leaf "${otherId}" (${leaf.scope.join(', ')} ∩ ${other.scope.join(', ')})` };
      }
    }
    this.transition(leaf, 'IN_FLIGHT', `owner=${leaf.owner ?? '(unassigned)'}`);
    return { ok: true };
  }

  /** Specialist self-report. This is NEVER sufficient for completion — it only
   *  advances to SELF_VERIFIED and REQUIRES independent parent re-verification. */
  selfVerify(id: string, note?: string): { ok: boolean; reason?: string } {
    const leaf = this.leaves.get(id);
    if (!leaf) return { ok: false, reason: `unknown leaf "${id}"` };
    if (leaf.state !== 'IN_FLIGHT') return { ok: false, reason: `leaf "${id}" is ${leaf.state}, not IN_FLIGHT` };
    this.transition(leaf, 'SELF_VERIFIED', note ?? 'specialist self-report');
    return { ok: true };
  }

  private leafLedgerView(leaf: Leaf): ReverifyLedgerView {
    return { acceptanceCriteria: leaf.criteria, evidence: leaf.evidence };
  }

  /**
   * Independent parent re-verification. Actually re-runs every runnable oracle
   * (via the injected runner), detects stale evidence, and generates fresh
   * fingerprint-bound evidence. Only when EVERY required criterion verifies does
   * the leaf advance to PARENT_REVERIFIED. A failing re-run → FAILED. A runnable
   * criterion with no runner available → BLOCKED (never silently passed).
   */
  async parentReverify(
    id: string,
    opts: { runner?: OracleRunner; fingerprint?: string; workdir?: string },
  ): Promise<{ ok: boolean; state: LeafState; results: ParentReverifyResult[] }> {
    const leaf = this.leaves.get(id);
    if (!leaf) throw new Error(`unknown leaf "${id}"`);
    if (leaf.state !== 'SELF_VERIFIED') {
      throw new Error(`leaf "${id}" must be SELF_VERIFIED before parent re-verification (is ${leaf.state})`);
    }
    const view = this.leafLedgerView(leaf);
    const results: ParentReverifyResult[] = [];
    for (const c of leaf.criteria) {
      const r = await parentReverifyCriterion({
        ledger: view,
        criterionId: c.id,
        currentFingerprint: opts.fingerprint,
        runOracle: opts.runner,
        workdir: opts.workdir,
      });
      results.push(r);
    }
    let finalState: LeafState;
    const failed = results.filter((r) => r.mode === 'EXECUTED_FAIL');
    if (failed.length > 0) {
      // The oracle actually ran and FAILED — the specialist's claim is refuted.
      finalState = 'FAILED';
      this.transition(leaf, finalState, `re-verification failed: ${failed.map((f) => f.criterionId).join(', ')}`);
    } else if (results.some((r) => !r.verified)) {
      // Not confirmed: no runner available, weak/rejected oracle, or manual
      // criterion without fresh evidence. Never silently passed — BLOCKED keeps
      // it actionable and distinct from FAILED (which means actively refuted).
      finalState = 'BLOCKED';
      const why = results.filter((r) => !r.verified).map((r) => `${r.criterionId}:${r.mode}`).join(', ');
      this.transition(leaf, finalState, `not confirmed by parent re-verification (${why})`);
    } else {
      finalState = 'PARENT_REVERIFIED';
      this.transition(leaf, finalState, 'all criteria re-executed and verified');
      this.recomputeReadiness();
    }
    return { ok: finalState === 'PARENT_REVERIFIED', state: finalState, results };
  }

  /**
   * Integration verification for a branch: every child must already be
   * parent-reverified, then the integration oracle re-runs. A collection of
   * individually-passing leaves does NOT automatically compose — the integration
   * oracle is the authority (test M).
   */
  async verifyIntegration(
    branchId: string,
    opts: { runner?: OracleRunner; fingerprint?: string },
  ): Promise<{ ok: boolean; reason: string }> {
    const branch = this.branches.get(branchId);
    if (!branch) return { ok: false, reason: `unknown branch "${branchId}"` };
    const notReady = branch.leafIds.filter((id) => {
      const l = this.leaves.get(id);
      return !l || !VERIFIED_STATES.has(l.state);
    });
    if (notReady.length > 0) {
      branch.integrationState = 'FAILED';
      branch.integrationReason = `children not parent-reverified: ${notReady.join(', ')}`;
      return { ok: false, reason: branch.integrationReason };
    }
    if (!branch.integration || !branch.integration.verification) {
      // No integration oracle: composition is asserted by children alone.
      branch.integrationState = 'VERIFIED';
      for (const id of branch.leafIds) {
        const l = this.leaves.get(id);
        if (l && l.state === 'PARENT_REVERIFIED') this.transition(l, 'INTEGRATION_VERIFIED', 'branch integration (no oracle)');
      }
      return { ok: true, reason: 'no integration oracle; children verified' };
    }
    if (!opts.runner) {
      branch.integrationState = 'FAILED';
      branch.integrationReason = 'integration oracle present but no runner available';
      return { ok: false, reason: branch.integrationReason };
    }
    let passed = false;
    let output = '';
    try {
      const res = await opts.runner({
        command: branch.integration.verification,
        criterionId: `integration:${branchId}`,
        criterionText: branch.integration.objective,
        reason: 'branch integration verification',
      });
      passed = res.passed;
      output = res.output;
    } catch (err) {
      output = `integration crashed: ${(err as Error).message}`;
    }
    const ev: Evidence = {
      id: shortId('ev'),
      kind: 'test',
      label: `integration ${branchId}`,
      command: branch.integration.verification,
      passed,
      outputExcerpt: output.slice(0, 400),
      createdAt: nowIso(),
      workspaceFingerprint: opts.fingerprint,
    };
    branch.integrationEvidenceId = ev.id;
    if (passed) {
      branch.integrationState = 'VERIFIED';
      for (const id of branch.leafIds) {
        const l = this.leaves.get(id);
        if (l && l.state === 'PARENT_REVERIFIED') this.transition(l, 'INTEGRATION_VERIFIED', 'integration oracle passed');
      }
      return { ok: true, reason: 'integration oracle passed' };
    }
    branch.integrationState = 'FAILED';
    branch.integrationReason = output.slice(0, 200);
    return { ok: false, reason: `integration oracle failed: ${output.slice(0, 120)}` };
  }

  /** Formal abandonment. An abandoned REQUIRED leaf can never silently become
   *  success and must block mission completion. */
  abandon(id: string, reason: string): { ok: boolean; affectedCriteria: string[] } {
    const leaf = this.leaves.get(id);
    if (!leaf) return { ok: false, affectedCriteria: [] };
    if (VERIFIED_STATES.has(leaf.state)) {
      return { ok: false, affectedCriteria: [] }; // cannot abandon verified work
    }
    const affected = leaf.criteria.filter((c) => !c.satisfied).map((c) => c.id);
    leaf.stateReason = reason;
    this.transition(leaf, 'ABANDONED', reason);
    this.inFlight.delete(id); // release ownership
    return { ok: true, affectedCriteria: affected };
  }

  /** Mark a leaf failed (propagates to parent via audit/completion checks). */
  fail(id: string, reason: string): void {
    const leaf = this.leaves.get(id);
    if (!leaf || VERIFIED_STATES.has(leaf.state)) return;
    leaf.stateReason = reason;
    this.transition(leaf, 'FAILED', reason);
  }

  block(id: string, reason: string): void {
    const leaf = this.leaves.get(id);
    if (!leaf || VERIFIED_STATES.has(leaf.state)) return;
    leaf.stateReason = reason;
    this.transition(leaf, 'BLOCKED', reason);
  }

  /**
   * Early-stop / completion discipline. Repeated unsuccessful recovery that does
   * not change repository state / evidence is not progress. After `maxAttempts`
   * unproductive recoveries the leaf is explicitly BLOCKED (then ABANDONED on a
   * further unproductive attempt) instead of looping forever.
   */
  recordRecovery(id: string, producedProgress: boolean, maxAttempts = 3): LeafState {
    const leaf = this.leaves.get(id);
    if (!leaf) throw new Error(`unknown leaf "${id}"`);
    if (producedProgress) {
      leaf.recoveryAttempts = 0;
      return leaf.state;
    }
    leaf.recoveryAttempts += 1;
    if (leaf.state === 'BLOCKED' && leaf.recoveryAttempts > maxAttempts) {
      this.transition(leaf, 'ABANDONED', `abandoned after ${leaf.recoveryAttempts} unproductive recoveries`);
    } else if (leaf.recoveryAttempts >= maxAttempts && leaf.state !== 'ABANDONED') {
      this.transition(leaf, 'BLOCKED', `${leaf.recoveryAttempts} unproductive recovery attempts`);
    }
    return leaf.state;
  }

  /**
   * User amendment / contract invalidation. Changing a requirement invalidates
   * completion claims that depend on it: affected leaves drop back to WAITING
   * (recomputing readiness), their criteria are reset, and stale evidence is
   * marked. Unaffected verified work is preserved.
   */
  amend(summary: string, affectedLeafIds: string[]): { invalidated: string[]; preserved: string[] } {
    const invalidated: string[] = [];
    const preserved: string[] = [];
    for (const leaf of this.leaves.values()) {
      if (affectedLeafIds.includes(leaf.id)) {
        // Invalidate completion: reset criteria + evidence satisfaction.
        for (const c of leaf.criteria) {
          c.satisfied = false;
          c.evidenceIds = [];
        }
        for (const e of leaf.evidence) e.stale = true;
        if (!UNHAPPY_STATES.has(leaf.state)) {
          const wasVerified = VERIFIED_STATES.has(leaf.state);
          this.transition(leaf, 'WAITING', `amended: ${summary}`);
          if (wasVerified) invalidated.push(leaf.id);
        }
      } else if (VERIFIED_STATES.has(leaf.state)) {
        preserved.push(leaf.id);
      }
    }
    this.amendments.push({ at: nowIso(), summary, affectedLeafIds: [...affectedLeafIds] });
    this.recomputeReadiness();
    return { invalidated, preserved };
  }

  /** Add a newly-discovered dependency at runtime: update the graph, record the
   *  change, recalculate affected states, and continue from the updated graph. */
  addDependency(leafId: string, dependsOn: string, note?: string): { ok: boolean; reason?: string } {
    const leaf = this.leaves.get(leafId);
    const dep = this.leaves.get(dependsOn);
    if (!leaf) return { ok: false, reason: `unknown leaf "${leafId}"` };
    if (!dep) return { ok: false, reason: `unknown dependency "${dependsOn}"` };
    if (leaf.dependencies.includes(dependsOn)) return { ok: true };
    if (this.wouldCycle(leafId, dependsOn)) return { ok: false, reason: `adding ${leafId}→${dependsOn} creates a cycle` };
    leaf.dependencies.push(dependsOn);
    leaf.history.push({ at: nowIso(), from: leaf.state, to: leaf.state, note: `dependency added: ${dependsOn}${note ? ` (${note})` : ''}` });
    // If the new dependency is not yet verified, the leaf can no longer be READY.
    if (!VERIFIED_STATES.has(dep.state) && (leaf.state === 'READY' || leaf.state === 'WAITING')) {
      this.transition(leaf, 'WAITING', `new dependency "${dependsOn}" not yet verified`);
    }
    this.recomputeReadiness();
    return { ok: true };
  }

  private wouldCycle(from: string, to: string): boolean {
    // Would adding from→to (from depends on to) create a cycle? i.e. is `from`
    // reachable from `to` following dependency edges?
    const seen = new Set<string>();
    const stack = [to];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === from) return true;
      if (seen.has(cur)) continue;
      seen.add(cur);
      const l = this.leaves.get(cur);
      if (l) stack.push(...l.dependencies);
    }
    return false;
  }

  /**
   * Final mission audit. Generated from ACTUAL leaf/branch state and evidence —
   * never from a model's memory of what it believes it completed. Recalculates
   * every number from the live graph.
   */
  audit(opts: { fingerprint?: string } = {}): AuditReport {
    const leaves: AuditReport['leaves'] = [];
    const blockers: string[] = [];
    const staleEvidence: AuditReport['staleEvidence'] = [];
    const missingEvidence: string[] = [];
    const abandonedRequired: string[] = [];

    for (const leaf of this.leaves.values()) {
      // Fresh-evidence check: every required, satisfied criterion must be backed
      // by passed, non-stale evidence matching the current fingerprint.
      let fresh = true;
      for (const c of leaf.criteria) {
        if (!c.satisfied) {
          if (leaf.required) missingEvidence.push(`${leaf.id}/${c.id}: ${c.text}`);
          fresh = false;
          continue;
        }
        const backing = c.evidenceIds
          .map((id) => leaf.evidence.find((e) => e.id === id))
          .filter((e): e is Evidence => Boolean(e && e.passed && !e.stale));
        if (opts.fingerprint) {
          for (const e of backing) {
            if (e.workspaceFingerprint && e.workspaceFingerprint !== opts.fingerprint) {
              e.stale = true;
              staleEvidence.push({ leafId: leaf.id, evidenceId: e.id });
            }
          }
        }
        const stillValid = backing.some((e) => !e.stale);
        if (!stillValid) {
          fresh = false;
          if (leaf.required) missingEvidence.push(`${leaf.id}/${c.id}: stale or missing evidence`);
        }
      }
      leaves.push({ id: leaf.id, required: leaf.required, state: leaf.state, freshEvidence: fresh });

      if (leaf.required && UNHAPPY_STATES.has(leaf.state)) {
        blockers.push(`${leaf.id} is ${leaf.state}${leaf.stateReason ? ` (${leaf.stateReason})` : ''}`);
        if (leaf.state === 'ABANDONED') abandonedRequired.push(leaf.id);
      } else if (leaf.required && !VERIFIED_STATES.has(leaf.state)) {
        blockers.push(`${leaf.id} is ${leaf.state} — required work not yet independently verified`);
      } else if (leaf.required && VERIFIED_STATES.has(leaf.state) && !fresh) {
        blockers.push(`${leaf.id} is ${leaf.state} but its evidence is stale or missing against the current workspace`);
      }
    }

    const integration: AuditReport['integration'] = [];
    for (const branch of this.branches.values()) {
      integration.push({ branchId: branch.id, state: branch.integrationState });
      if (branch.integrationState === 'FAILED') {
        blockers.push(`branch "${branch.id}" integration failed: ${branch.integrationReason ?? 'unknown'}`);
      } else if (branch.integrationState === 'PENDING' && branch.integration) {
        blockers.push(`branch "${branch.id}" integration not yet verified`);
      }
    }

    const requiredOk = leaves.every(
      (l) => !l.required || (VERIFIED_STATES.has(l.state) && l.freshEvidence),
    );
    const integrationOk = [...this.branches.values()].every(
      (b) => !b.integration || b.integrationState === 'VERIFIED',
    );

    return {
      complete: requiredOk && integrationOk && blockers.length === 0,
      leaves,
      blockers,
      staleEvidence,
      missingEvidence,
      abandonedRequired,
      integration,
      generatedAt: nowIso(),
    };
  }
}
