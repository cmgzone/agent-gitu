import { describe, expect, it } from 'vitest';
import { allocateChildBudget, allocatableUsd, budgetExhausted, createBudgetAccount, validateAllocation } from '../src/coding/budget.js';

describe('allocatableUsd', () => {
  it('withholds the recovery reserve from the allocatable envelope', () => {
    expect(allocatableUsd({ maxCostUsd: 5, reserveUsd: 0.4 })).toBeCloseTo(4.6);
    expect(allocatableUsd({ maxCostUsd: 5 })).toBe(5);
  });

  it('treats an unset ceiling as unbounded', () => {
    expect(allocatableUsd({})).toBe(Number.POSITIVE_INFINITY);
  });

  it('never returns a negative envelope', () => {
    expect(allocatableUsd({ maxCostUsd: 1, reserveUsd: 3 })).toBe(0);
  });
});

describe('allocateChildBudget', () => {
  it('clamps a child to what the parent can actually hand out', () => {
    const child = allocateChildBudget({ maxCostUsd: 5, reserveUsd: 0.4 }, { maxCostUsd: 10 });
    expect(child.maxCostUsd).toBeCloseTo(4.6);
  });

  it('clamps turns and delegation slots to the parent ceiling', () => {
    const child = allocateChildBudget({ maxTurns: 40, maxSubagents: 2 }, { maxTurns: 100, maxSubagents: 9 });
    expect(child.maxTurns).toBe(40);
    expect(child.maxSubagents).toBe(2);
  });

  it('preserves a request when the parent dimension is unbounded', () => {
    const child = allocateChildBudget({}, { maxTurns: 10, maxSubagents: 3 });
    expect(child).toEqual({ maxTurns: 10, maxSubagents: 3 });
  });

  it('leaves unrequested dimensions unset instead of inventing defaults', () => {
    expect(allocateChildBudget({ maxCostUsd: 5 }, {})).toEqual({});
  });
});

describe('validateAllocation', () => {
  it('accepts a mission split that respects the parent envelope', () => {
    // The shape this exists for: a $5 mission funding research, engineering and review.
    const mission = { maxCostUsd: 5 };
    const children = [{ maxCostUsd: 0.75 }, { maxCostUsd: 3.5 }, { maxCostUsd: 0.75 }];
    expect(validateAllocation(mission, children)).toEqual([]);
  });

  it('accepts Gitu subdividing its own assignment without touching its reserve', () => {
    // 3.50 - 0.40 reserve = 3.10 handable: 2.50 main + 0.60 subagents fits exactly.
    const gitu = { maxCostUsd: 3.5, reserveUsd: 0.4 };
    expect(validateAllocation(gitu, [{ maxCostUsd: 2.5 }, { maxCostUsd: 0.6 }])).toEqual([]);
  });

  it('reports a child that exceeds the parent envelope', () => {
    const problems = validateAllocation({ maxCostUsd: 5, reserveUsd: 0.4 }, [{ maxCostUsd: 6 }]);
    expect(problems.join(' ')).toContain('exceeds the parent');
  });

  it('reports siblings that collectively overspend the parent', () => {
    const problems = validateAllocation({ maxCostUsd: 5 }, [{ maxCostUsd: 3 }, { maxCostUsd: 3 }]);
    expect(problems.join(' ')).toContain('can only hand out');
  });

  it('reports turn and delegation overspend', () => {
    expect(validateAllocation({ maxTurns: 10 }, [{ maxTurns: 11 }]).length).toBe(1);
    expect(validateAllocation({ maxTurns: 10 }, [{ maxTurns: 6 }, { maxTurns: 6 }]).length).toBe(1);
    expect(validateAllocation({ maxSubagents: 1 }, [{ maxSubagents: 2 }]).length).toBe(1);
  });

  it('does not police dimensions the parent left unbounded', () => {
    expect(validateAllocation({}, [{ maxCostUsd: 100, maxTurns: 500, maxSubagents: 20 }])).toEqual([]);
  });
});

describe('budgetExhausted', () => {
  it('stops at the ceiling for each dimension', () => {
    expect(budgetExhausted({ maxCostUsd: 1 }, { costUsd: 1 })).toBe(true);
    expect(budgetExhausted({ maxCostUsd: 1 }, { costUsd: 0.99 })).toBe(false);
    expect(budgetExhausted({ maxTurns: 3 }, { turns: 3 })).toBe(true);
    expect(budgetExhausted({ maxSubagents: 1 }, { subagents: 1 })).toBe(true);
  });

  it('never stops a dimension that has no ceiling', () => {
    expect(budgetExhausted({}, { costUsd: 1_000, turns: 10_000, subagents: 100 })).toBe(false);
  });
});

describe('BudgetAccount', () => {
  it('records spend it is charged and reports what is left', () => {
    const account = createBudgetAccount({ maxCostUsd: 2, maxTurns: 10 });
    expect(account.charge({ costUsd: 0.5, turns: 2 })).toBe(true);
    expect(account.spend()).toEqual({ costUsd: 0.5, turns: 2, subagents: 0 });
    expect(account.remaining()).toEqual({ costUsd: 1.5, turns: 8, subagents: undefined });
    expect(account.exhausted()).toBe(false);
  });

  it('keeps recording the charge that used the allocation up, then says so', () => {
    const account = createBudgetAccount({ maxCostUsd: 1 });
    // The money is already spent by the time a caller can observe it, so the
    // overrun is recorded rather than hidden; the return value is the signal.
    expect(account.charge({ costUsd: 1.5 })).toBe(false);
    expect(account.spend().costUsd).toBeCloseTo(1.5);
    expect(account.remaining().costUsd).toBe(0);
    expect(account.exhausted()).toBe(true);
  });

  it('never calls an account with no ceilings exhausted, however much it spends', () => {
    const account = createBudgetAccount({});
    expect(account.charge({ costUsd: 900, turns: 4_000 })).toBe(true);
    expect(account.remaining()).toEqual({ costUsd: undefined, turns: undefined, subagents: undefined });
  });

  it('clamps a child allocation to what the parent has left', () => {
    const pool = createBudgetAccount({ maxCostUsd: 5 });
    pool.charge({ costUsd: 3 });
    const child = pool.allocate({ maxCostUsd: 4 });
    expect(child.budget.maxCostUsd).toBeCloseTo(2);
    expect(child.exhausted()).toBe(false);
  });

  it('holds the parent reserve back from what a child may be given', () => {
    const pool = createBudgetAccount({ maxCostUsd: 5, reserveUsd: 1 });
    const child = pool.allocate({ maxCostUsd: 9 });
    expect(child.budget.maxCostUsd).toBeCloseTo(4);
  });

  it('charges every ancestor, so a sibling allocated later gets only what is left', () => {
    const pool = createBudgetAccount({ maxCostUsd: 1 });
    const first = pool.allocate({ maxCostUsd: 1 });
    expect(first.charge({ costUsd: 0.6 })).toBe(true);
    const second = pool.allocate({ maxCostUsd: 1 });
    expect(second.budget.maxCostUsd).toBeCloseTo(0.4);
    expect(second.charge({ costUsd: 0.4 })).toBe(false);
    expect(pool.spend().costUsd).toBeCloseTo(1);
    expect(pool.exhausted()).toBe(true);
    // An allocation made earlier still reports itself spent: the chain is what
    // stops work, not each child's own snapshot of the ceiling.
    expect(first.exhausted()).toBe(true);
  });

  it('stops a child whose own envelope still has room once the pool is spent', () => {
    const pool = createBudgetAccount({ maxCostUsd: 1 });
    const first = pool.allocate({ maxCostUsd: 1 });
    const second = pool.allocate({ maxCostUsd: 1 });
    expect(first.charge({ costUsd: 0.7 })).toBe(true);
    // Both snapshots said $1 — an allocation is what was left when it was made,
    // so the pool, not the snapshot, is what actually has money.
    expect(second.charge({ costUsd: 0.5 })).toBe(false);
    expect(pool.spend().costUsd).toBeCloseTo(1.2);
  });

  it('reports exhaustion up a chain even when the child was given the full pool', () => {
    const pool = createBudgetAccount({ maxCostUsd: 2 });
    const child = pool.allocate({ maxCostUsd: 2 });
    expect(child.charge({ costUsd: 1 })).toBe(true);
    expect(child.charge({ costUsd: 1 })).toBe(false);
    expect(child.exhausted()).toBe(true);
  });

  it('defaults an unbounded request to the parent remaining, never to more', () => {
    const pool = createBudgetAccount({ maxCostUsd: 3, maxTurns: 20 });
    const child = pool.allocate({});
    expect(child.budget.maxCostUsd).toBe(3);
    expect(child.budget.maxTurns).toBe(20);
  });

  it('answers canAllocate from what is actually left', () => {
    const pool = createBudgetAccount({ maxCostUsd: 2 });
    expect(pool.canAllocate({ maxCostUsd: 2 })).toBe(true);
    expect(pool.canAllocate({ maxCostUsd: 3 })).toBe(false);
    expect(pool.canAllocate({ maxTurns: 10 })).toBe(true);
    pool.charge({ costUsd: 0.5 });
    expect(pool.canAllocate({ maxCostUsd: 2 })).toBe(false);
    expect(pool.canAllocate({ maxCostUsd: 1.5 })).toBe(true);
  });
});
