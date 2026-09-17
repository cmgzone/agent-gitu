import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { Gitu } from '../src/agent/gitu.js';
import { ChiefOfStaff } from '../src/chief/chief.js';
import { modelChiefAdvisor } from '../src/chief/advisor.js';
import { DEFAULT_AUTHORITY_POLICY } from '../src/chief/authority.js';
import type { ChiefAdvisorRequest, ChiefDecision, ChiefInput, ChiefResolver } from '../src/coding/chief.js';
import { GituSessionRuntime, type GituCodingSession } from '../src/coding/session-runtime.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import type { CompletionReport } from '../src/types.js';

/**
 * Chief of staff through the runtime's own gates.
 *
 * The chief is a *surface*, not a second approval system, so these assert the
 * integration rather than the policy: a decision it makes settles the request the
 * runtime minted (same id, same events, one promise), an escalation reaches the
 * person's surface and leaves them the answer, and a request that another surface
 * already settled is never re-narrated as the chief's.
 */

function makeProject(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hermes-chief-'));
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'chief-test' }));
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  writeFileSync(path.join(dir, 'src', 'a.ts'), 'export const a = 1;\n');
  return dir;
}

function completeReport(): CompletionReport {
  return { taskId: 't_1', goal: 'Fix the parser', status: 'complete', summary: 'done', changes: [], filesChanged: [], verification: [] };
}

type Sinks = GituCodingSession['gates'];

interface Harness {
  session: GituCodingSession;
  sinks: Sinks;
  /** The requests a person's surface was shown, in order. */
  cards: string[];
  types: () => string[];
  event: (type: string) => Record<string, unknown> | undefined;
}

function harness(options: { chief?: ChiefResolver; budgetUsd?: number } = {}): Harness {
  const dir = makeProject();
  let sinks: Sinks | undefined;
  const runtime = new GituSessionRuntime({
    createEngine: (_request, _options, captured) => {
      sinks = captured;
      return { run: async () => ({ ledger: { data: { taskId: 't_1' } }, report: completeReport() }), queueMessage: () => {}, stop: () => {} } as unknown as Gitu;
    },
  });
  const cards: string[] = [];
  const session = runtime.createSession({
    goal: 'Fix the parser',
    workspace: { type: 'host', path: dir },
    ...(options.budgetUsd !== undefined ? { budget: { maxCostUsd: options.budgetUsd } } : {}),
    ...(options.chief ? { chief: options.chief } : {}),
    runOptions: () => ({ workspaceRoot: dir, llm: new ScriptedMockLlm([() => '{}']), mode: 'fast' }),
    // The engine is injected above, so host services are never reached — but the
    // runtime requires them to exist before it accepts a run at all.
    deps: {} as never,
    onApprovalRequired: (request) => cards.push(`approval:${request.tool}`),
    onPlanReviewRequested: () => cards.push('plan_review'),
    onQuestionsRequested: () => cards.push('questions'),
    gateTimeoutMs: 5_000,
  });
  void session.run('Fix the parser');
  return {
    session,
    sinks: sinks!,
    cards,
    types: () => session.events().map((event) => event.type),
    event: (type) => session.events().find((event) => event.type === type) as unknown as Record<string, unknown> | undefined,
  };
}

/** A chief whose decision is resolved by the test, so the race can be driven. */
function deferredChief(): { chief: ChiefResolver; resolve: (decision: ChiefDecision) => void } {
  let settle: (decision: ChiefDecision) => void = () => undefined;
  return {
    chief: { decide: () => new Promise<ChiefDecision>((resolve) => (settle = resolve)) },
    resolve: (decision) => settle(decision),
  };
}

const command = (value: string): string => JSON.stringify({ command: value });

describe('chief of staff — approvals through the runtime gate', () => {
  it('settles a routine approval itself, with no card and one promise kept', async () => {
    const h = harness({ chief: new ChiefOfStaff() });
    const pending = h.sinks.approvalHandler({ tool: 'run_command', tier: 'dangerous', why: 'unrecognized command (fail closed)', summary: command('npm test') });
    await expect(pending).resolves.toBe(true);
    expect(h.cards).toEqual([]);
    // The resolution stands on its own; the chief event adds who decided and why.
    expect(h.types()).toEqual(['run_started', 'approval_required', 'approval_resolved', 'chief_decided']);
    expect(h.event('approval_resolved')).toMatchObject({ approved: true });
    expect(h.event('approval_resolved')?.reason).toContain('routine command');
    expect(h.event('chief_decided')).toMatchObject({ requestKind: 'approval', action: 'approve' });
    expect(h.session.getState().pendingApproval).toBeUndefined();
  });

  it('escalates an approval it may not decide, and leaves the person the answer', async () => {
    const h = harness({ chief: new ChiefOfStaff() });
    const pending = h.sinks.approvalHandler({ tool: 'run_command', tier: 'dangerous', why: 'recursive delete', summary: command('rm -rf build') });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.cards).toEqual(['approval:run_command']);
    expect(h.event('chief_decided')).toMatchObject({ action: 'escalate' });
    expect(h.session.events().some((event) => event.type === 'approval_resolved')).toBe(false);

    // The request is still the runtime's, so the person answers it exactly as before.
    const approvalId = h.session.getState().pendingApproval!.id;
    h.session.approve(approvalId, true);
    await expect(pending).resolves.toBe(true);
    expect(h.session.events().filter((event) => event.type === 'approval_resolved')).toHaveLength(1);
  });

  it('tells the chief what the session may still spend', async () => {
    const seen: ChiefInput[] = [];
    const chief: ChiefResolver = {
      decide: async (input) => {
        seen.push(input);
        return { action: 'escalate', reason: 'asking the person' };
      },
    };
    const h = harness({ chief, budgetUsd: 2 });
    void h.sinks.approvalHandler({ tool: 'run_command', tier: 'dangerous', why: 'unrecognized command (fail closed)', summary: command('npm test') });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seen[0]?.context).toMatchObject({ goal: 'Fix the parser', budget: { remainingUsd: 2, ceilingUsd: 2 } });
    expect(seen[0]?.request).toMatchObject({ kind: 'approval', tier: 'dangerous' });
  });

  it('does not resurface a request another surface already released', async () => {
    const deferred = deferredChief();
    const h = harness({ chief: deferred.chief });
    const pending = h.sinks.approvalHandler({ tool: 'run_command', tier: 'dangerous', why: 'recursive delete', summary: command('rm -rf build') });
    expect(h.cards).toEqual([]);

    // A stop, a release, or a correction supersedes the request while the chief is
    // still thinking about it — the documented way a pending gate goes stale.
    h.session.releasePendingGates('superseded by the user reply');
    await expect(pending).resolves.toBe(false);
    deferred.resolve({ action: 'approve', reason: 'it looked routine to me' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(h.cards).toEqual([]);
    expect(h.session.events().some((event) => event.type === 'chief_decided')).toBe(false);
    expect(h.session.events().filter((event) => event.type === 'approval_resolved')).toHaveLength(1);
    expect(h.event('approval_resolved')).toMatchObject({ approved: false });
  });

  it('escalates when the chief itself fails, instead of stalling the run', async () => {
    const chief: ChiefResolver = {
      decide: async () => {
        throw new Error('policy service unavailable');
      },
    };
    const h = harness({ chief });
    const pending = h.sinks.approvalHandler({ tool: 'run_command', tier: 'dangerous', why: 'recursive delete', summary: command('rm -rf build') });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.cards).toEqual(['approval:run_command']);
    expect(h.event('chief_decided')).toMatchObject({ action: 'escalate' });
    expect(String(h.event('chief_decided')?.detail)).toContain('could not be consulted');
    // Still answerable: a resolver that broke has no authority, and no veto either.
    h.session.approve(h.session.getState().pendingApproval!.id, false);
    await expect(pending).resolves.toBe(false);
  });

  it('behaves exactly as before when no chief is configured', async () => {
    const h = harness();
    void h.sinks.approvalHandler({ tool: 'run_command', tier: 'dangerous', why: 'recursive delete', summary: command('rm -rf build') });
    // Surfaced synchronously: without a chief there is nothing to wait for.
    expect(h.cards).toEqual(['approval:run_command']);
    expect(h.session.events().some((event) => event.type === 'chief_decided')).toBe(false);
  });
});

describe('chief of staff — plan reviews and questions through the runtime gates', () => {
  it('approves a plan whose steps name their verification', async () => {
    const h = harness({ chief: new ChiefOfStaff() });
    const pending = h.sinks.planReviewHandler({ criteria: ['tests pass'], steps: [{ description: 'implement', verification: 'npm test' }] });
    await expect(pending).resolves.toMatchObject({ approved: true });
    expect(h.cards).toEqual([]);
    expect(h.event('plan_review_resolved')).toMatchObject({ decision: 'approved' });
    expect(h.session.getState().pendingPlanReview).toBeUndefined();
  });

  it('sends an unverified plan back to the agent rather than to the person', async () => {
    const h = harness({ chief: new ChiefOfStaff() });
    const pending = h.sinks.planReviewHandler({ criteria: ['tests pass'], steps: [{ description: 'rewrite the parser', verification: '' }] });
    const decision = await pending;
    expect(decision.approved).toBe(false);
    expect(decision.note).toContain('rewrite the parser');
    // A refusal carrying a note is a replan, not a stop — the person never sees it.
    expect(h.cards).toEqual([]);
    expect(h.event('plan_review_resolved')).toMatchObject({ decision: 'changes_requested' });
  });

  it('escalates a plan that commits to something high-impact', async () => {
    const h = harness({ chief: new ChiefOfStaff() });
    const pending = h.sinks.planReviewHandler({
      criteria: ['ship it'],
      steps: [
        { description: 'implement', verification: 'npm test' },
        { description: 'deploy to production', verification: 'check the live site' },
      ],
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.cards).toEqual(['plan_review']);
    expect(String(h.event('chief_decided')?.detail)).toContain('production deployment');
    // The person's answer still settles it, through the same runtime method.
    h.session.approvePlan(h.session.getState().pendingPlanReview!.id, { approved: false });
    await expect(pending).resolves.toMatchObject({ approved: false });
  });

  it('answers a question from a standing rule, with no card', async () => {
    const chief = new ChiefOfStaff({ policy: { questions: { answers: [{ when: /which test runner/i, answer: 'Use the repository runner: npm test.' }] } } });
    const h = harness({ chief });
    const pending = h.sinks.askUserHandler([{ question: 'Which test runner should I use?', options: ['npm test', 'jest'] }]);
    await expect(pending).resolves.toBe('Use the repository runner: npm test.');
    expect(h.cards).toEqual([]);
    expect(h.event('questions_answered')).toBeTruthy();
    expect(h.session.getState().pendingQuestions).toBeUndefined();
  });

  it('leaves a question it has no answer for to the person', async () => {
    const h = harness({ chief: new ChiefOfStaff() });
    const pending = h.sinks.askUserHandler([{ question: 'Which database should we migrate to?', options: [] }]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.cards).toEqual(['questions']);
    expect(h.event('chief_decided')).toMatchObject({ requestKind: 'questions', action: 'escalate' });
    h.session.answerQuestions(h.session.getState().pendingQuestions!.id, 'SQLite');
    await expect(pending).resolves.toBe('SQLite');
  });

  it('answers a question through the gate with the model-backed advisor', async () => {
    // The real advisor, the real chief, the runtime's own gate: one model call in,
    // the engine's own askUser promise answered, and no card for the person.
    const llm = new ScriptedMockLlm([() => '{"answer":"Additive, then backfill."}']);
    const chief = new ChiefOfStaff({ advisor: modelChiefAdvisor({ llm, providerId: 'test', model: 'test', priceOf: () => 0, policy: DEFAULT_AUTHORITY_POLICY }) });
    const h = harness({ chief, budgetUsd: 1 });
    const pending = h.sinks.askUserHandler([{ question: 'Additive schema change or a rewrite?', options: ['additive', 'rewrite'] }]);
    await expect(pending).resolves.toBe('Additive, then backfill.');
    expect(h.cards).toEqual([]);
    expect(h.event('chief_decided')).toMatchObject({ requestKind: 'questions', action: 'answer' });
    expect(h.session.getState().pendingQuestions).toBeUndefined();
  });

  it('asks a host-supplied advisor only where judgment can help', async () => {
    const advisor = vi.fn(async ({ input }: ChiefAdvisorRequest) => (input.request.kind === 'questions' ? { action: 'answer' as const, answer: 'Additive migration.' } : undefined));
    const h = harness({ chief: new ChiefOfStaff({ advisor }) });
    const pending = h.sinks.askUserHandler([{ question: 'Should the migration be additive?', options: [] }]);
    await expect(pending).resolves.toBe('Additive migration.');
    expect(advisor).toHaveBeenCalledTimes(1);
    expect(h.cards).toEqual([]);
  });
});
