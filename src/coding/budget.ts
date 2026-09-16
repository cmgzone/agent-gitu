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
