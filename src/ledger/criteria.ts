import type { AcceptanceCriterion, CriterionStatus } from '../types.js';

/**
 * Criterion lifecycle rules — the single source of truth.
 *
 * A criterion is part of the task contract until it is RETIRED. Retirement is
 * deliberately narrow (`superseded`, `not_applicable`) because those are the
 * only states where evidence can no longer exist: a criterion that was replaced
 * by a new direction, or one that never applied. `failed` and `blocked` are
 * diagnostic states that stay in the contract — the work is still owed, the
 * runtime just reports it honestly instead of as an untouched "open" item.
 *
 * Every gate, count and renderer must go through these helpers rather than
 * reading `satisfied` directly, so nothing can disagree about what still counts.
 */

/** Structural shape: partial criterion-like objects (report items, metrics
 *  inputs) can be classified without being full ledger rows. */
export interface CriterionLike {
  satisfied?: boolean;
  status?: CriterionStatus;
  supersededBy?: string;
}

/** The lifecycle state, deriving it when the row predates the lifecycle. */
export function criterionStatus(criterion: CriterionLike): CriterionStatus {
  if (criterion.status) return criterion.status;
  return criterion.satisfied ? 'satisfied' : 'active';
}

/** Retired criteria are history: they never gate, never need evidence, and are
 *  never delegated. */
export function isCriterionRetired(criterion: CriterionLike): boolean {
  const status = criterionStatus(criterion);
  return status === 'superseded' || status === 'not_applicable';
}

/** The criteria that still make up the task contract. */
export function requiredCriteria<T extends CriterionLike>(criteria: readonly T[]): T[] {
  return criteria.filter((criterion) => !isCriterionRetired(criterion));
}

/** Every required criterion is satisfied — the "earlier scope is complete" test
 *  that must ignore retired history. */
export function allRequiredSatisfied(criteria: readonly CriterionLike[]): boolean {
  return requiredCriteria(criteria).every((criterion) => criterion.satisfied === true);
}

/** Criteria that still owe work (required, not yet satisfied). */
export function openCriteria<T extends CriterionLike>(criteria: readonly T[]): T[] {
  return requiredCriteria(criteria).filter((criterion) => criterion.satisfied !== true);
}

/** Compact lifecycle label for the state message. */
export function criterionLabel(criterion: AcceptanceCriterion): string {
  switch (criterionStatus(criterion)) {
    case 'satisfied':
      return 'SATISFIED';
    case 'failed':
      return 'FAILED';
    case 'blocked':
      return 'BLOCKED';
    case 'not_applicable':
      return 'NOT APPLICABLE';
    case 'superseded':
      return criterion.supersededBy ? `SUPERSEDED → ${criterion.supersededBy}` : 'SUPERSEDED';
    default:
      return 'open';
  }
}
