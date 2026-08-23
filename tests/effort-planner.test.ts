import { describe, expect, it } from 'vitest';
import {
  classifyTaskComplexity,
  planEffort,
} from '../src/agent/effort-planner.js';

describe('classifyTaskComplexity', () => {
  it('flags trivial doc/formatting/typo requests as low', () => {
    expect(classifyTaskComplexity('Fix the typo in the README').complexity).toBe('low');
    expect(classifyTaskComplexity('Add a docstring to greet').complexity).toBe('low');
    expect(classifyTaskComplexity('Run prettier on src').complexity).toBe('low');
    expect(classifyTaskComplexity('Bump the version to 1.1.0').complexity).toBe('low');
  });

  it('flags architecture / security / data-integrity work as high', () => {
    expect(classifyTaskComplexity('Redesign the auth subsystem').complexity).toBe('high');
    expect(classifyTaskComplexity('Add payment handling and billing').complexity).toBe('high');
    expect(classifyTaskComplexity('Migrate the database schema').complexity).toBe('high');
    expect(classifyTaskComplexity('Fix a race condition in the scheduler').complexity).toBe('high');
  });

  it('treats a large upfront scope as high', () => {
    const scope = Array.from({ length: 6 }, (_x, i) => `src/file${i}.ts`);
    expect(classifyTaskComplexity('Refactor the module', { scopeFiles: scope }).complexity).toBe('high');
    expect(classifyTaskComplexity('Add a feature', { criteriaCount: 6 }).complexity).toBe('high');
  });

  it('falls back to medium for ordinary work and short single-file asks to low', () => {
    expect(classifyTaskComplexity('Fix the crash in auth')).toBeTypeOf('object');
    expect(classifyTaskComplexity('Something ordinary').complexity).toBe('medium');
    expect(classifyTaskComplexity('Short single-file tweak', { scopeFiles: ['src/a.ts'] }).complexity).toBe('low');
  });

  it('respects an explicit effort override and chat mode', () => {
    expect(classifyTaskComplexity('anything', { explicitEffort: 'high' }).complexity).toBe('high');
    expect(classifyTaskComplexity('anything', { explicitEffort: 'low' }).complexity).toBe('low');
    expect(classifyTaskComplexity('rebuild the whole auth stack', { mode: 'chat' }).complexity).toBe('low');
  });
});

describe('planEffort', () => {
  it('budgets low-complexity work cheaply (few turns, one specialist, no review)', () => {
    const plan = planEffort('Fix the typo in the README');
    expect(plan.complexity).toBe('low');
    expect(plan.maxSpecialists).toBe(1);
    expect(plan.requireReview).toBe(false);
    expect(plan.verificationDepth).toBe('light');
    expect(plan.maxTurns).toBeLessThan(planEffort('something ordinary').maxTurns);
  });

  it('budgets high-complexity work with reviewers and a large specialist pool', () => {
    const plan = planEffort('Design and implement a new authentication system');
    const cheap = planEffort('Fix the typo in the README');
    expect(plan.complexity).toBe('high');
    expect(plan.maxSpecialists).toBeGreaterThanOrEqual(4);
    expect(plan.requireReview).toBe(true);
    expect(plan.verificationDepth).toBe('thorough');
    expect(plan.contextBudget.maxBytes).toBeGreaterThan(cheap.contextBudget.maxBytes);
  });

  it('scales the context budget with the model window', () => {
    const small = planEffort('Add a feature', { contextWindowTokens: 16_000 });
    const large = planEffort('Add a feature', { contextWindowTokens: 200_000 });
    expect(large.contextBudget.maxBytes).toBeGreaterThan(small.contextBudget.maxBytes);
    expect(large.contextBudget.maxFiles).toBeGreaterThanOrEqual(small.contextBudget.maxFiles);
  });
});