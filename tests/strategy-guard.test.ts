import { describe, expect, it } from 'vitest';
import { BLOCKED_TRANSITIONS, QuestionGuard, StrategyGuard, type EstablishedFact } from '../src/agent/strategy-guard.js';

describe('StrategyGuard', () => {
  it('allows the first attempts of a strategy', () => {
    const guard = new StrategyGuard();
    expect(guard.evaluate('capability', 'conn:app8:update', 'Update application').allowed).toBe(true);
    expect(guard.blocked()).toBeUndefined();
  });

  it('exhausts a capability after two failures and refuses the next attempt with an unlock', () => {
    const guard = new StrategyGuard();
    guard.noteFailure('capability', 'conn:app8:update', 'Update application', 'rejected', 'Connection operation "Update application" was rejected by policy.');
    expect(guard.evaluate('capability', 'conn:app8:update', 'Update application').allowed).toBe(true);
    guard.noteFailure('capability', 'conn:app8:update', 'Update application', 'rejected', 'Connection operation "Update application" was rejected by policy.');

    const verdict = guard.evaluate('capability', 'conn:app8:update', 'Update application');
    expect(verdict.allowed).toBe(false);
    expect(verdict.failures).toBe(2);
    expect(verdict.reason).toMatch(/failed 2×/);
    expect(verdict.reason).toMatch(/user input granting access/i);
  });

  it('keeps the same identity when the model rewrites the reason or body', () => {
    const guard = new StrategyGuard();
    guard.noteFailure('capability', 'conn:app8:update', 'Update application', 'rejected');
    guard.noteFailure('capability', 'conn:app8:update', 'Update application', 'rejected');
    // A reworded label is still the same strategy key: the count does not reset.
    expect(guard.evaluate('capability', 'conn:app8:update', 'Update application (retry)').allowed).toBe(false);
  });

  it('a success spends the history instead of merely pausing it', () => {
    const guard = new StrategyGuard();
    guard.noteFailure('capability', 'conn:app8:update', 'Update application', 'failed');
    guard.noteFailure('capability', 'conn:app8:update', 'Update application', 'failed');
    guard.noteSuccess('capability', 'conn:app8:update');
    expect(guard.blocked()).toBeUndefined();
    guard.noteFailure('capability', 'conn:app8:update', 'Update application', 'failed');
    expect(guard.evaluate('capability', 'conn:app8:update', 'Update application').allowed).toBe(true);
  });

  it('blocks a connection operation proposal after three failures, not before', () => {
    const guard = new StrategyGuard();
    const key = 'coolify:set-envs:POST:/api/v1/envs';
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      expect(guard.evaluate('connection-operation', key, 'Update envs').allowed).toBe(true);
      guard.noteAttempt('connection-operation', key, 'Update envs');
      guard.noteFailure('connection-operation', key, 'Update envs', 'unknown', 'request not run');
    }
    expect(guard.evaluate('connection-operation', key, 'Update envs').allowed).toBe(false);
  });

  it('counts a proposal that never ran as an attempt but not as a failure', () => {
    const guard = new StrategyGuard();
    guard.noteAttempt('connection-operation', 'k', 'Label');
    expect(guard.evaluate('connection-operation', 'k', 'Label').allowed).toBe(true);
    expect(guard.exhausted()).toHaveLength(0);
  });

  it('re-opens exhaustion when the world changes (user input)', () => {
    const guard = new StrategyGuard();
    guard.noteFailure('capability', 'conn:app8:update', 'Update application', 'rejected');
    guard.noteFailure('capability', 'conn:app8:update', 'Update application', 'rejected');
    expect(guard.blocked()?.state).toBe('CAPABILITY_BLOCKED');

    const unlocked = guard.noteExternalChange();
    expect(unlocked.map((strategy) => strategy.label)).toEqual(['Update application']);
    expect(guard.blocked()).toBeUndefined();
    expect(guard.evaluate('capability', 'conn:app8:update', 'Update application').allowed).toBe(true);
  });

  it('renders the blocked state, exhausted strategies and allowed transitions', () => {
    const guard = new StrategyGuard();
    guard.noteFailure('capability', 'conn:app8:update', 'Update application', 'rejected', 'permission scope missing');
    guard.noteFailure('capability', 'conn:app8:update', 'Update application', 'rejected', 'permission scope missing');

    const rendered = guard.render();
    expect(rendered).toContain('RUNTIME POLICY');
    expect(rendered).toContain('BLOCKED STATE: CAPABILITY_BLOCKED');
    expect(rendered).toContain('EXHAUSTED STRATEGIES');
    expect(rendered).toContain('Update application [capability] — 2 failed attempt(s) of 2');
    expect(rendered).toContain('last: rejected — permission scope missing');
    expect(rendered).toContain('ALLOWED NEXT TRANSITIONS');
    for (const transition of BLOCKED_TRANSITIONS) expect(rendered).toContain(transition);
  });

  it('renders nothing while no strategy is exhausted, so the normal path pays no tokens', () => {
    const guard = new StrategyGuard();
    guard.noteFailure('capability', 'a', 'A', 'failed');
    expect(guard.render()).toBe('');
  });

  it('names the last outcome in the refusal note handed back to the model', () => {
    const guard = new StrategyGuard();
    guard.noteFailure('capability', 'conn:app8:update', 'Update application', 'rejected', 'HTTP 403 for app8');
    guard.noteFailure('capability', 'conn:app8:update', 'Update application', 'rejected', 'HTTP 403 for app8');
    const note = guard.blockedNote('capability', 'conn:app8:update', 'Update application');
    expect(note).toContain('RUNTIME POLICY BLOCK');
    expect(note).toContain('Last outcome: rejected — HTTP 403 for app8');
    expect(note).toMatch(/refuses another identical attempt/i);
  });
});

const decision = (text: string): EstablishedFact => ({ text, source: 'decision ad-1' });

describe('QuestionGuard', () => {
  it('delivers a genuinely new question', () => {
    const guard = new QuestionGuard();
    const decisionResult = guard.evaluate([{ question: 'Which application should I deploy to?', options: ['app7', 'app8'] }]);
    expect(decisionResult.deliver).toBe(true);
    expect(decisionResult.questions).toHaveLength(1);
  });

  it('refuses a repeat of a question the task already asked and answers it from the record', () => {
    const guard = new QuestionGuard();
    const first = { question: 'Which application should I deploy to?', header: 'Target', options: ['app7', 'app8'] };
    expect(guard.evaluate([first]).deliver).toBe(true);
    guard.noteAnswer([first], 'app8');

    // Reworded, punctuated repeat — same question.
    const repeat = { question: 'which application should i deploy to??', header: 'target', options: ['app7', 'app8'] };
    const decisionResult = guard.evaluate([repeat]);
    expect(decisionResult.deliver).toBe(false);
    expect(decisionResult.answers[0]).toContain('Already asked in this task');
    expect(decisionResult.answers[0]).toContain('app8');
  });

  it('refuses a question the ledger already pins and names the source', () => {
    const guard = new QuestionGuard();
    const decisionResult = guard.evaluate(
      [{ question: 'Which application should the broker launch?', options: ['app7', 'app8'] }],
      [decision('Production target: app8 (remote Coolify + broker); local Docker is not part of production')],
    );
    expect(decisionResult.deliver).toBe(false);
    expect(decisionResult.answers[0]).toContain('Answered by decision ad-1');
    expect(decisionResult.answers[0]).toContain('pinned value: app8');
    expect(decisionResult.answers[0]).toMatch(/record a new decision that supersedes it/i);
  });

  it('does not refuse a question that no established fact actually answers', () => {
    const guard = new QuestionGuard();
    // A preference with no concrete pin, and a topic outside the target words.
    expect(
      guard.evaluate([{ question: 'Which database should we use?', options: ['postgres', 'sqlite'] }], [decision('Prefer Postgres over MySQL')]).deliver,
    ).toBe(true);
    expect(
      guard.evaluate([{ question: 'Which files should be changed?', options: ['a', 'b'] }], [decision('Production target: app8')]).deliver,
    ).toBe(true);
  });

  it('delivers only the new questions when a batch is partially answered', () => {
    const guard = new QuestionGuard();
    const asked = { question: 'Which application should I deploy to?', options: ['app7', 'app8'] };
    guard.noteAnswer([asked], 'app8');
    const fresh = { question: 'Which region should the database live in?', options: ['eu', 'us'] };
    const decisionResult = guard.evaluate([asked, fresh], []);
    expect(decisionResult.deliver).toBe(true);
    expect(decisionResult.questions).toEqual([fresh]);
    expect(decisionResult.answers).toHaveLength(1);
  });

  it('remembers an unanswered delivery so it is not treated as new', () => {
    const guard = new QuestionGuard();
    const question = { question: 'Which application should I deploy to?', options: ['app7', 'app8'] };
    expect(guard.evaluate([question]).deliver).toBe(true);
    // Delivery alone does not record an answer: the same question is still fresh
    // until the user actually answers (noteAnswer), so an interrupted ask is not
    // silently swallowed.
    expect(guard.evaluate([question]).deliver).toBe(true);
    guard.noteAnswer([question], 'app8');
    expect(guard.evaluate([question]).deliver).toBe(false);
    expect(guard.answeredCount()).toBe(1);
  });
});
