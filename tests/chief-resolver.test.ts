import { describe, expect, it, vi } from 'vitest';
import { ChiefOfStaff, describeChiefRequest, requestSignature, type ChiefAdvisor } from '../src/chief/chief.js';
import { CHIEF_DECISION_ACTIONS, describeChiefDecision, type ChiefInput } from '../src/coding/chief.js';

/**
 * Chief of Staff tests.
 *
 * The chief is the automated *surface* for a request, so what matters is not that
 * it answers — the policy tests cover that — but the three properties the runtime
 * relies on: a veto is final, judgment never grants authority, and an identical
 * request asked twice gets one answer.
 */

const at = '1970-01-01T00:00:00.000Z';
const context = { sessionId: 'run_1', goal: 'Fix the parser', agentId: 'agent_1', requestedBy: 'Scout' };

function approval(command: string, tool = 'run_command'): ChiefInput {
  return {
    request: {
      kind: 'approval',
      tier: 'dangerous',
      request: { id: 'appr_1', tool, why: 'unrecognized command (fail closed)', summary: JSON.stringify({ command }), requestedAt: at },
    },
    context,
  };
}

function plan(verification = 'npm test'): ChiefInput {
  return {
    request: { kind: 'plan_review', request: { id: 'pr_1', criteria: ['tests pass'], steps: [{ description: 'implement', verification }], requestedAt: at } },
    context,
  };
}

function question(text = 'Which test runner should I use?'): ChiefInput {
  return {
    request: { kind: 'questions', request: { id: 'q_1', questions: [{ question: text, options: ['npm test'] }], requestedAt: at } },
    context,
  };
}

describe('ChiefOfStaff — one resolver for all three requests', () => {
  it('approves a routine command, reviews a verified plan and answers a known question', async () => {
    const chief = new ChiefOfStaff({
      policy: { questions: { answers: [{ when: /which test runner/i, answer: 'Use npm test.' }] } },
      now: () => at,
    });
    await expect(chief.decide(approval('npm test'))).resolves.toMatchObject({ action: 'approve' });
    await expect(chief.decide(plan())).resolves.toMatchObject({ action: 'approve' });
    await expect(chief.decide(question())).resolves.toEqual({ action: 'answer', answer: 'Use npm test.' });
    expect(chief.decisions.map((record) => record.requestKind)).toEqual(['approval', 'plan_review', 'questions']);
    expect(chief.decisions.every((record) => record.source === 'policy')).toBe(true);
    expect(chief.decisions[0]).toMatchObject({ requestId: 'appr_1', at, summary: 'run_command: npm test' });
  });

  it('answers each request in the vocabulary only that request accepts', async () => {
    const chief = new ChiefOfStaff();
    expect((await chief.decide(question('Unanswerable?'))).action).toBe('escalate');
    expect((await chief.decide(plan(''))).action).toBe('request_changes');
    expect((await chief.decide(approval('rm -rf /'))).action).toBe('escalate');
  });

  it('every action it can produce is declared in CHIEF_DECISION_ACTIONS', async () => {
    const chief = new ChiefOfStaff({ policy: { questions: { answers: [{ when: /./, answer: 'yes' }] } } });
    const produced = [await chief.decide(approval('npm test')), await chief.decide(plan('')), await chief.decide(question('Anything?'))];
    for (const decision of produced) expect(CHIEF_DECISION_ACTIONS).toContain(decision.action);
  });
});

describe('ChiefOfStaff — a veto is final', () => {
  it('escalates a high-impact action without consulting the advisor at all', async () => {
    const advisor = vi.fn(async () => ({ action: 'approve', reason: 'looks fine to me' }) as const);
    const chief = new ChiefOfStaff({ advisor: advisor as ChiefAdvisor });
    const decision = await chief.decide(approval('bash scripts/deploy.sh production'));
    expect(decision.action).toBe('escalate');
    // The veto is checked before every rule, so a judgment layer cannot even see the
    // request — that ordering is what makes "high-impact always reaches you" a
    // property of the code rather than a hope about how the advisor behaves.
    expect(advisor).not.toHaveBeenCalled();
    expect(chief.decisions[0]?.source).toBe('policy');
  });

  it('escalates an external tool even when the command looks routine', async () => {
    const chief = new ChiefOfStaff();
    const decision = await chief.decide(approval('npm test', 'connection:stripe'));
    expect(decision.action).toBe('escalate');
  });

  it('escalates a spend-bearing request once the session is at its floor', async () => {
    const chief = new ChiefOfStaff();
    const input = approval('npm test');
    input.context = { ...input.context, budget: { remainingUsd: 0.05 } };
    expect((await chief.decide(input)).action).toBe('escalate');
  });

  it('re-checks the spend guard before reusing an earlier approval', async () => {
    const chief = new ChiefOfStaff();
    const funded = approval('npm test');
    funded.context = { ...funded.context, budget: { remainingUsd: 5 } };
    expect((await chief.decide(funded)).action).toBe('approve');
    // The same request, later, with the money gone: consistency must not outrank the
    // budget, or a session could keep spending its way past the floor on recurrence.
    const drained = approval('npm test');
    drained.context = { ...drained.context, budget: { remainingUsd: 0.01 } };
    expect((await chief.decide(drained)).action).toBe('escalate');
    expect(chief.decisions[1]?.source).toBe('policy');
  });

  it('does not reuse an escalation as if it were a standing answer', async () => {
    const chief = new ChiefOfStaff();
    expect((await chief.decide(approval('rm -rf /'))).action).toBe('escalate');
    expect((await chief.decide(approval('rm -rf /'))).action).toBe('escalate');
    expect(chief.decisions.map((record) => record.source)).toEqual(['policy', 'policy']);
  });
});

describe('ChiefOfStaff — judgment answers, it never grants', () => {
  it('answers a question the standing rules do not cover', async () => {
    const advisor = vi.fn(async () => ({ action: 'answer', answer: 'Use the existing SQLite store.' }) as const);
    const chief = new ChiefOfStaff({ advisor: advisor as ChiefAdvisor });
    await expect(chief.decide(question('Which database?'))).resolves.toEqual({ action: 'answer', answer: 'Use the existing SQLite store.' });
    expect(chief.decisions[0]?.source).toBe('advisor');
    // The advisor sees the same request the runtime raised, with the session's own
    // context — it is a judgment call about this request, not a general licence.
    expect(advisor.mock.calls[0]?.[0]).toMatchObject({ input: { context: { sessionId: 'run_1', goal: 'Fix the parser', requestedBy: 'Scout' } } });
  });

  it('ignores an advisor that tries to approve, because only the policy may grant', async () => {
    const advisor = vi.fn(async () => ({ action: 'approve', reason: 'the tests will pass' }) as const);
    const chief = new ChiefOfStaff({ advisor: advisor as ChiefAdvisor });
    expect((await chief.decide(approval('node scripts/whatever.mjs'))).action).toBe('escalate');
    expect(advisor).not.toHaveBeenCalled();
  });

  it('ignores an advisor reply that cannot settle the request it was asked about', async () => {
    const advisor = vi.fn(async () => ({ action: 'request_changes', note: 'rewrite it' }) as const);
    const chief = new ChiefOfStaff({ advisor: advisor as ChiefAdvisor });
    expect((await chief.decide(question('Which database?'))).action).toBe('escalate');
  });

  it('treats an advisor that throws as having no opinion, and never rejects', async () => {
    const advisor = vi.fn(async () => {
      throw new Error('provider unreachable');
    });
    const chief = new ChiefOfStaff({ advisor: advisor as ChiefAdvisor });
    const decision = await chief.decide(question('Which database?'));
    expect(decision.action).toBe('escalate');
    expect(decision.action === 'escalate' && decision.reason).toContain('no standing policy answer');
  });

  it('never asks the advisor about a plan review', async () => {
    const advisor = vi.fn(async () => ({ action: 'approve', reason: 'fine' }) as const);
    const chief = new ChiefOfStaff({ advisor: advisor as ChiefAdvisor, policy: { planReviews: { autoReview: false } } });
    expect((await chief.decide(plan())).action).toBe('escalate');
    expect(advisor).not.toHaveBeenCalled();
  });
});

describe('ChiefOfStaff — previous decisions', () => {
  it('answers an identical request from the first decision instead of deciding twice', async () => {
    const advisor = vi.fn(async () => ({ action: 'answer', answer: 'Use SQLite.' }) as const);
    const chief = new ChiefOfStaff({ advisor: advisor as ChiefAdvisor });
    const first = await chief.decide(question('Which database?'));
    const second = await chief.decide(question('Which   database?'));
    expect(second).toEqual(first);
    expect(advisor).toHaveBeenCalledTimes(1);
    expect(chief.decisions[1]?.source).toBe('recurrence');
  });

  it('recognizes a repeated approval by the command it runs, not by its request id', async () => {
    const chief = new ChiefOfStaff();
    await chief.decide(approval('npm test'));
    const repeated = { ...approval('npm test') };
    repeated.request = { ...repeated.request, request: { ...repeated.request.request, id: 'appr_2' } };
    await chief.decide(repeated);
    expect(chief.decisions[1]?.source).toBe('recurrence');
    expect(chief.decisions[1]?.requestId).toBe('appr_2');
  });

  it('keeps only the configured history', async () => {
    const chief = new ChiefOfStaff({ historyLimit: 2 });
    await chief.decide(approval('npm test'));
    await chief.decide(approval('npm run lint'));
    await chief.decide(approval('npm run build'));
    expect(chief.decisions).toHaveLength(2);
    expect(chief.decisions.map((record) => record.summary)).toEqual(['run_command: npm run lint', 'run_command: npm run build']);
  });

  it('records the scope the owning surface labelled, so a decision can be explained', async () => {
    const chief = new ChiefOfStaff({ scope: { missionId: 'm_1', teammate: 'Scout' } });
    const seen: ChiefInput[] = [];
    const advisor: ChiefAdvisor = async ({ input, decisions }) => {
      seen.push(input);
      // The advisor sees the chief's own history, which is how an answer stays
      // consistent with what was already decided in the session.
      expect(decisions).toEqual([]);
      return { action: 'answer', answer: 'yes' };
    };
    const withAdvisor = new ChiefOfStaff({ scope: { missionId: 'm_1', teammate: 'Scout' }, advisor });
    await withAdvisor.decide(question('Should the migration be additive?'));
    expect(seen[0]?.context.scope).toEqual({ missionId: 'm_1', teammate: 'Scout' });
    expect(chief.decisions).toHaveLength(0);
  });
});

describe('ChiefOfStaff — request descriptions', () => {
  it('describes a request and a decision in one line each', () => {
    expect(describeChiefRequest(approval('npm test').request)).toBe('run_command: npm test');
    expect(describeChiefRequest(plan().request)).toContain('plan review (1 step');
    expect(describeChiefRequest(question().request)).toContain('question: Which test runner');
    expect(describeChiefDecision({ action: 'escalate', reason: 'production deployment' })).toBe('production deployment');
    expect(describeChiefDecision({ action: 'request_changes', note: 'needs verification' })).toBe('needs verification');
  });

  it('keys recurrence on the request, so a different command is a different request', () => {
    expect(requestSignature(approval('npm test').request)).not.toBe(requestSignature(approval('npm run lint').request));
    expect(requestSignature(approval('npm test').request)).toBe(requestSignature(approval('npm test').request));
  });
});
