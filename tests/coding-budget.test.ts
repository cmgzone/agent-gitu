import { describe, expect, it } from 'vitest';
import { allocateChildBudget, allocatableUsd, budgetExhausted, validateAllocation } from '../src/coding/budget.js';

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
