import { describe, expect, it } from 'vitest';
import {
  buildPlanNote,
  classifyRiskDomains,
  planRisk,
  selectSpecialists,
  type SpecialistDescriptor,
} from '../src/agent/risk-planner.js';
import { planEffort } from '../src/agent/effort-planner.js';

const ROSTER: SpecialistDescriptor[] = [
  { name: 'debugger', role: 'Root cause debugging and diagnosis' },
  { name: 'test-runner', role: 'Test authoring, QA, verification' },
  { name: 'security-auditor', role: 'Security review, auth, cryptography' },
  { name: 'finance-guard', role: 'Financial integrity and billing' },
  { name: 'data-migrator', role: 'Database migrations, schemas, data integrity' },
  { name: 'ui-critic', role: 'Frontend, UI/UX, visual verification' },
  { name: 'perf-prober', role: 'Performance profiling and optimization' },
  { name: 'architect', role: 'Architecture and refactoring' },
];

describe('classifyRiskDomains', () => {
  it('detects the risk categories in the routing table', () => {
    expect(classifyRiskDomains('Fix the crash in the scheduler')).toEqual(['bug']);
    expect(classifyRiskDomains('Fix session refresh')).toContain('security');
    expect(classifyRiskDomains('Handle payments and billing')).toContain('payments');
    expect(classifyRiskDomains('Migrate the database schema')).toContain('data');
    expect(classifyRiskDomains('Refactor the module to simplify it')).toContain('refactor');
    expect(classifyRiskDomains('Improve the frontend layout on small screens')).toContain('frontend');
    expect(classifyRiskDomains('Reduce latency of the search')).toContain('performance');
  });

  it('returns unknown for trivial low-risk requests', () => {
    expect(classifyRiskDomains('Rename this function')).toEqual(['unknown']);
    expect(classifyRiskDomains('Add a docstring')).toEqual(['unknown']);
  });
});

describe('selectSpecialists', () => {
  it('picks the security specialist for auth work and adds a test mate', () => {
    const chosen = selectSpecialists(['security'], ROSTER, 3);
    expect(chosen.map((r) => r.agent)).toEqual(['security-auditor', 'test-runner']);
    expect(chosen[0]?.domain).toBe('security');
  });

  it('covers each risk domain by priority and stops at the budget', () => {
    const chosen = selectSpecialists(['security', 'payments', 'data', 'bug'], ROSTER, 2);
    expect(chosen).toHaveLength(2);
    expect(chosen.map((r) => r.agent)).toEqual(['security-auditor', 'finance-guard']);
  });

  it('returns nothing when there is no risk or no roster', () => {
    expect(selectSpecialists(['unknown'], ROSTER, 3)).toEqual([]);
    expect(selectSpecialists(['security'], [], 3)).toEqual([]);
    expect(selectSpecialists(['security'], ROSTER, 0)).toEqual([]);
  });
});

describe('planRisk', () => {
  it('trivial + low complexity -> zero specialists, no required review', () => {
    const plan = planRisk('Rename this function', { complexity: 'low', specialists: ROSTER, maxSpecialists: 1 });
    expect(plan.risk).toBe('unknown');
    expect(plan.recommendedSpecialists).toEqual([]);
    expect(plan.requiredReview).toBeUndefined();
    expect(plan.strictVerification).toBe(false);
  });

  it('auth + high effort -> security reviewer, test mate, strict verification, required review', () => {
    // NB: avoiding the word "bug" in the goal so the security domain is the
    // only selection signal (the goal must route purely to auth work).
    const plan = planRisk('Fix session refresh token handling', {
      complexity: 'high',
      specialists: ROSTER,
      maxSpecialists: 3,
    });
    expect(plan.risk).toBe('security');
    expect(plan.strictVerification).toBe(true);
    expect(plan.requiredReview).toBe('security');
    expect(plan.recommendedSpecialists.map((r) => r.agent)).toEqual(['security-auditor', 'test-runner']);
  });

  it('payments risk routes to the financial/integrity specialist', () => {
    const plan = planRisk('Add refund handling', { complexity: 'medium', specialists: ROSTER, maxSpecialists: 2 });
    expect(plan.risk).toBe('payments');
    expect(plan.recommendedSpecialists.map((r) => r.agent)).toContain('finance-guard');
  });

  it('data migration routes to the data specialist', () => {
    const plan = planRisk('Migrate the database schema', { complexity: 'high', specialists: ROSTER, maxSpecialists: 2 });
    expect(plan.risk).toBe('data');
    expect(plan.recommendedSpecialists.map((r) => r.agent)).toContain('data-migrator');
  });

  it('strict risk still gets a reviewer even on a low-complexity task', () => {
    // low complexity + no strict risk -> zero specialists (above); but a
    // security/data touch must NOT be skipped just because it is small.
    const plan = planRisk('Fix the session refresh bug', { complexity: 'low', specialists: ROSTER, maxSpecialists: 1 });
    expect(plan.recommendedSpecialists.length).toBeGreaterThan(0);
    expect(plan.strictVerification).toBe(true);
  });
});

describe('buildPlanNote', () => {
  it('merges effort and risk guidance for the per-turn note', () => {
    const effort = planEffort('Fix the session refresh token bug', { explicitEffort: 'high' });
    const risk = planRisk('Fix the session refresh token bug', {
      complexity: effort.complexity,
      specialists: ROSTER,
      maxSpecialists: effort.maxSpecialists,
    });
    const note = buildPlanNote(effort, risk);
    expect(note).toContain('PLANNED EFFORT');
    expect(note).toContain('RISK ANALYSIS');
    expect(note).toContain('"security-auditor"');
    expect(note).toContain('review pass:');
  });
});