/**
 * Hierarchical run budgets.
 *
 * A Cowork mission, its teammates, and any coding session a teammate delegates
 * all spend the same user money. Flat per-agent budgets let a child outspend
 * its parent; one shared flat budget lets a single runaway loop consume the
 * whole mission. So a budget forms a tree, and every child allocation is
 * clamped to what its parent has left *after* that parent's own reserve — no
 * child can exceed what its parent assigned. This matters most for scheduled,
 * unattended missions, where no one is watching the spend.
 */

export interface RunBudget {
  maxCostUsd?: number;
  maxTurns?: number;
  /** Delegation slots (specialists for Gitu, teammates for Cowork). */
  maxSubagents?: number;
  /** Held back for recovery/replanning; never allocatable to children. */
  reserveUsd?: number;
}

/** What a parent may hand out: its ceiling minus its own recovery reserve. */
export function allocatableUsd(budget: RunBudget): number {
  if (budget.maxCostUsd === undefined) return Number.POSITIVE_INFINITY;
  return Math.max(0, budget.maxCostUsd - Math.max(0, budget.reserveUsd ?? 0));
}

/** Clamp one requested child budget to the parent's allocatable envelope. */
export function allocateChildBudget(parent: RunBudget, requested: RunBudget): RunBudget {
  const child: RunBudget = {};
  const ceiling = allocatableUsd(parent);
  if (requested.maxCostUsd !== undefined) child.maxCostUsd = Math.min(requested.maxCostUsd, ceiling);
  if (requested.maxTurns !== undefined) child.maxTurns = parent.maxTurns === undefined ? requested.maxTurns : Math.min(requested.maxTurns, parent.maxTurns);
  if (requested.maxSubagents !== undefined) child.maxSubagents = parent.maxSubagents === undefined ? requested.maxSubagents : Math.min(requested.maxSubagents, parent.maxSubagents);
  if (requested.reserveUsd !== undefined) child.reserveUsd = Math.min(requested.reserveUsd, child.maxCostUsd ?? ceiling);
  return child;
}

/**
 * Reasons a set of sibling allocations is invalid, as human-readable strings.
 * Empty means every child fits both its parent's ceiling and the parent's
 * allocatable envelope in aggregate.
 */
export function validateAllocation(parent: RunBudget, children: RunBudget[]): string[] {
  const problems: string[] = [];
  const ceiling = allocatableUsd(parent);
  let cost = 0;
  let turns = 0;
  let subagents = 0;
  // Tracked so a single overspend produces one message, not a duplicate
  // restatement of it by the aggregate check below.
  let costOver = false;
  let turnsOver = false;
  let subagentsOver = false;
  children.forEach((child, index) => {
    const label = `child ${index + 1}`;
    if (child.maxCostUsd !== undefined) {
      cost += child.maxCostUsd;
      if (child.maxCostUsd > ceiling) {
        problems.push(`${label} exceeds the parent's allocatable budget ($${child.maxCostUsd} > $${ceiling})`);
        costOver = true;
      }
    }
    if (child.maxTurns !== undefined) {
      turns += child.maxTurns;
      if (parent.maxTurns !== undefined && child.maxTurns > parent.maxTurns) {
        problems.push(`${label} exceeds the parent's turn ceiling (${child.maxTurns} > ${parent.maxTurns})`);
        turnsOver = true;
      }
    }
    if (child.maxSubagents !== undefined) {
      subagents += child.maxSubagents;
      if (parent.maxSubagents !== undefined && child.maxSubagents > parent.maxSubagents) {
        problems.push(`${label} exceeds the parent's delegation ceiling (${child.maxSubagents} > ${parent.maxSubagents})`);
        subagentsOver = true;
      }
    }
  });
  // Aggregates are only reported when no single child already explained the
  // overspend, so a caller sees one reason per violation.
  if (!costOver && Number.isFinite(ceiling) && cost > ceiling) problems.push(`children allocate $${cost} but the parent can only hand out $${ceiling}`);
  if (!turnsOver && parent.maxTurns !== undefined && turns > parent.maxTurns) problems.push(`children allocate ${turns} turns but the parent only has ${parent.maxTurns}`);
  if (!subagentsOver && parent.maxSubagents !== undefined && subagents > parent.maxSubagents)
    problems.push(`children allocate ${subagents} delegations but the parent only has ${parent.maxSubagents}`);
  return problems;
}

/** Spend so far, in the same dimensions as `RunBudget`. */
export interface BudgetSpend {
  costUsd?: number;
  turns?: number;
  subagents?: number;
}

/** True when a dimension of the budget is used up. Unset ceilings never stop. */
export function budgetExhausted(budget: RunBudget, spent: BudgetSpend): boolean {
  if (budget.maxCostUsd !== undefined && (spent.costUsd ?? 0) >= budget.maxCostUsd) return true;
  if (budget.maxTurns !== undefined && (spent.turns ?? 0) >= budget.maxTurns) return true;
  if (budget.maxSubagents !== undefined && (spent.subagents ?? 0) >= budget.maxSubagents) return true;
  return false;
}

/**
 * A live allocation.
 *
 * `RunBudget` is a plan; an account is the plan plus what has actually been
 * spent, and it is the only thing a caller should make a stop decision from.
 * Budgets alone cannot answer "may I start another turn?" once two siblings are
 * spending the same envelope concurrently, and the whole point of the hierarchy
 * is that a parent's remaining money bounds every child, including children it
 * has already handed money to.
 *
 * Two rules make it safe:
 *
 *   1. `charge` is applied, never refused. By the time spend is observable the
 *      money is already gone; refusing to record it would only hide the overrun.
 *      The return value is the signal to stop handing out work.
 *   2. `allocate` clamps to what is left — the parent's ceiling minus its own
 *      spend and minus the reserve it holds back for recovery. A child is
 *      therefore structurally incapable of outspending its parent, and the next
 *      sibling's allocation shrinks as earlier siblings spend.
 */
export interface BudgetAccount {
  /** The plan this account currently runs under, as last granted. */
  readonly budget: RunBudget;
  /** Spend recorded here, including everything charged by descendants. */
  spend(): BudgetSpend;
  /** What is left of each ceiling; a dimension is `undefined` when uncapped. */
  remaining(): BudgetSpend;
  /** True when any ceiling in this account or an ancestor is used up. */
  exhausted(): boolean;
  /**
   * Record spend here and on every ancestor. Returns false once a ceiling in the
   * chain is used up, which is the caller's signal to stop new work.
   */
  charge(delta: BudgetSpend): boolean;
  /**
   * A child allocation inside this account's remaining envelope. Spending it is
   * visible here, so siblings compete for the same money rather than each
   * receiving the parent's full ceiling.
   */
  allocate(requested: RunBudget): BudgetAccount;
  /**
   * The same work, granted a new ceiling — in place, so the account keeps its
   * identity and its place in the chain above and below it.
   *
   * Spend already recorded here carries over, so work given more money resumes
   * inside one envelope instead of starting a second one that would forget what
   * the first already cost. Whatever ceiling sits above is unchanged and still
   * bounds this account, so a re-granted child cannot escape its parent.
   */
  regrant(budget: RunBudget): BudgetAccount;
  /** True when every ceiling in `requested` fits what this account can hand out. */
  canAllocate(requested: RunBudget): boolean;
}

/**
 * What `allocate` may hand a child: the remaining ceiling minus the reserve the
 * *parent* holds back. The reserve belongs to the parent's budget, not to the
 * request — a child asking for a number must not be able to lift the parent's
 * recovery hold by leaving it out.
 */
function childEnvelope(requested: RunBudget, remaining: BudgetSpend, parentReserveUsd = 0): RunBudget {
  const budget = requested;
  const reserve = Math.max(0, parentReserveUsd);
  const capCost = (value: number | undefined): number | undefined => {
    if (remaining.costUsd === undefined) return value;
    const usable = Math.max(0, remaining.costUsd - reserve);
    return value === undefined ? usable : Math.min(value, usable);
  };
  const cap = (value: number | undefined, left: number | undefined): number | undefined =>
    left === undefined ? value : value === undefined ? left : Math.min(value, left);
  return {
    maxCostUsd: capCost(budget.maxCostUsd),
    maxTurns: cap(budget.maxTurns, remaining.turns),
    maxSubagents: cap(budget.maxSubagents, remaining.subagents),
    // A child's own reserve is part of its envelope, so it can never exceed it.
    reserveUsd: requested.reserveUsd === undefined ? undefined : Math.min(requested.reserveUsd, capCost(requested.maxCostUsd) ?? Number.POSITIVE_INFINITY),
  };
}

/**
 * Create an account for `budget`, optionally inside a parent allocation.
 *
 * The parent is charged whenever this account is, which is what makes a pool of
 * delegations (one host ceiling, many sessions) enforceable rather than a set of
 * independent caps that each look affordable on their own.
 */
export function createBudgetAccount(budget: RunBudget, parent?: BudgetAccount): BudgetAccount {
  const spent: BudgetSpend = { costUsd: 0, turns: 0, subagents: 0 };
  // The ceiling moves on `regrant`, so read it through a binding rather than the
  // parameter: every other closure has to see the current grant, not the first.
  let current = budget;
  const account: BudgetAccount = {
    get budget() {
      return current;
    },
    spend: () => ({ ...spent }),
    remaining: () => ({
      costUsd: current.maxCostUsd === undefined ? undefined : Math.max(0, current.maxCostUsd - (spent.costUsd ?? 0)),
      turns: current.maxTurns === undefined ? undefined : Math.max(0, current.maxTurns - (spent.turns ?? 0)),
      subagents: current.maxSubagents === undefined ? undefined : Math.max(0, current.maxSubagents - (spent.subagents ?? 0)),
    }),
    exhausted: () => budgetExhausted(current, spent) || Boolean(parent?.exhausted()),
    charge: (delta) => {
      spent.costUsd = (spent.costUsd ?? 0) + (delta.costUsd ?? 0);
      spent.turns = (spent.turns ?? 0) + (delta.turns ?? 0);
      spent.subagents = (spent.subagents ?? 0) + (delta.subagents ?? 0);
      const room = parent ? parent.charge(delta) : true;
      return room && !budgetExhausted(current, spent);
    },
    allocate: (requested) => createBudgetAccount(childEnvelope(requested, account.remaining(), current.reserveUsd), account),
    // In place, so an account keeps its identity: children already charging it
    // still propagate here, and it still propagates to the parent it was drawn
    // from. A replacement object would silently strand both.
    regrant: (next) => {
      current = next;
      return account;
    },
    canAllocate: (requested) => {
      const envelope = childEnvelope(requested, account.remaining(), current.reserveUsd);
      // `childEnvelope` never widens a dimension, so "fits" means the caller's
      // own request survived clamping unchanged and something is left to spend.
      if (requested.maxCostUsd !== undefined && envelope.maxCostUsd !== requested.maxCostUsd) return false;
      if (requested.maxTurns !== undefined && envelope.maxTurns !== requested.maxTurns) return false;
      if (requested.maxSubagents !== undefined && envelope.maxSubagents !== requested.maxSubagents) return false;
      return !account.exhausted();
    },
  };
  return account;
}
