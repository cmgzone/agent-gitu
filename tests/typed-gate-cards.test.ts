import { describe, expect, it } from 'vitest';
import { createContext, Script } from 'node:vm';
import { UI_HTML } from '../src/server/ui.js';

/**
 * The typed gate cards. A live native frame renders and settles each card; the
 * polled session view is a fallback, not the source of truth. The card helpers
 * are extracted and executed because the browser bundle is a static string —
 * the same technique the credential-chat tests use.
 */
const CARD_JS = UI_HTML.slice(
  UI_HTML.indexOf('  function pendingApprovalsFor('),
  UI_HTML.indexOf('  function renderApprovals('),
);

type Question = { question: string; header?: string; options: string[] };

type CardSession = {
  typedApprovals?: Record<string, { id: string; summary?: string }>;
  typedPlanReview?: { id: string; criteria?: string[]; steps?: unknown[] } | null;
  typedQuestions?: { id: string; questions: Question[] } | null;
  settledGates?: Record<string, boolean>;
};

function harness() {
  const rendered: string[] = [];
  const context = createContext({});
  new Script(CARD_JS).runInContext(context);
  const sess: CardSession = {};
  context.S = { sessions: { run1: sess } };
  context.renderApprovals = () => {
    rendered.push('approval');
  };
  context.renderPlanReview = () => {
    rendered.push('plan-review');
  };
  context.renderQuestions = () => {
    rendered.push('questions');
  };
  return { context, sess, rendered };
}

function frame(typed: Record<string, unknown>, seq = 7) {
  return { seq, t: '2026-01-01T00:00:00.000Z', typed };
}

describe('typed gate cards', () => {
  it('renders the approval card from a live frame alone and stays single when the poll catches up', () => {
    const { context, rendered } = harness();
    context.handleTypedFrame(
      'run1',
      frame({
        type: 'approval_required',
        approvalId: 'appr_1',
        tool: 'run_command',
        why: 'destructive',
        summary: 'git push --force origin main',
      }),
    );
    expect(rendered).toEqual(['approval', 'plan-review', 'questions']);

    // No session view at all: the gate's own request is enough to render, so the
    // card no longer waits for (or depends on) the mirror poll.
    const fromFrame = context.pendingApprovalsFor(context.S.sessions.run1, undefined);
    expect(fromFrame).toHaveLength(1);
    expect(fromFrame[0]).toMatchObject({
      id: 'appr_1',
      tool: 'run_command',
      why: 'destructive',
      summary: 'git push --force origin main',
    });

    // The poll catches up: the same request is merged, not added a second time,
    // and the typed copy (which carries the detail) wins.
    const merged = context.pendingApprovalsFor(context.S.sessions.run1, {
      pendingApprovals: [{ id: 'appr_1', tool: 'run_command' }],
    });
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: 'appr_1', summary: 'git push --force origin main' });
  });

  it('renders the plan review card from the frame and settles it while the mirror lags', () => {
    const { context } = harness();
    context.handleTypedFrame(
      'run1',
      frame({
        type: 'plan_review_requested',
        requestId: 'pr_1',
        plan: 'criteria: tests pass',
        criteria: ['tests pass'],
        steps: [{ description: 'implement', verification: 'npm test' }],
      }),
    );
    // The card edits the agent's own criteria and steps, so a frame without them
    // could not render the review at all.
    const fromFrame = context.pendingPlanReviewFor(context.S.sessions.run1, undefined);
    expect(fromFrame).toMatchObject({
      id: 'pr_1',
      criteria: ['tests pass'],
      steps: [{ description: 'implement', verification: 'npm test' }],
    });

    context.handleTypedFrame('run1', frame({ type: 'plan_review_resolved', requestId: 'pr_1', decision: 'approved' }));
    expect(context.pendingPlanReviewFor(context.S.sessions.run1, { pendingPlanReview: { id: 'pr_1' } })).toBeNull();

    // Settling is scoped to the request that was settled: the next review the
    // mirror reports is a different request and must still render.
    const next = context.pendingPlanReviewFor(context.S.sessions.run1, { pendingPlanReview: { id: 'pr_2', criteria: [], steps: [] } });
    expect(next).toMatchObject({ id: 'pr_2' });
  });

  it('renders the question card with the options the agent offered', () => {
    const { context } = harness();
    context.handleTypedFrame(
      'run1',
      frame({
        type: 'questions_requested',
        requestId: 'q_1',
        questions: ['Which database?'],
        details: [{ question: 'Which database?', header: 'Storage', options: ['PostgreSQL', 'SQLite'] }],
      }),
    );
    expect(context.pendingQuestionsFor(context.S.sessions.run1, undefined)).toMatchObject({
      id: 'q_1',
      questions: [{ question: 'Which database?', header: 'Storage', options: ['PostgreSQL', 'SQLite'] }],
    });

    context.handleTypedFrame('run1', frame({ type: 'questions_answered', requestId: 'q_1', reason: 'timed out' }));
    expect(context.pendingQuestionsFor(context.S.sessions.run1, { pendingQuestions: { id: 'q_1' } })).toBeNull();
  });

  it('still renders a question frame that carried only the text projection', () => {
    // Defensive: a producer that sent texts without details must not produce an
    // empty card — it renders the questions with no options to offer.
    const { context } = harness();
    context.handleTypedFrame(
      'run1',
      frame({ type: 'questions_requested', requestId: 'q_2', questions: ['Which database?'] }),
    );
    expect(context.pendingQuestionsFor(context.S.sessions.run1, undefined)).toMatchObject({
      id: 'q_2',
      questions: [{ question: 'Which database?', options: [] }],
    });
  });

  it('ignores frames for families it does not own', () => {
    const { context, rendered } = harness();
    context.handleTypedFrame('run1', frame({ type: 'command_finished', ok: true, exitCode: 0 }, 9));
    context.handleTypedFrame('run1', { seq: 10, t: 'x' });
    context.handleTypedFrame('run-unknown', frame({ type: 'approval_required', approvalId: 'appr_9' }));
    expect(rendered).toEqual([]);
    expect(context.pendingApprovalsFor(context.S.sessions.run1, undefined)).toHaveLength(0);
    expect(context.pendingPlanReviewFor(context.S.sessions.run1, undefined)).toBeNull();
    // Unrelated traffic never even creates the cards' state.
    expect(context.S.sessions.run1.typedApprovals).toBeUndefined();
    expect(context.S.sessions.run1.settledGates).toBeUndefined();
  });

  it('dispatches frames before the rendered-row cursor so they can never move it', () => {
    // Frames carry seq (the runtime log cursor) and no i. Handling one after the
    // cursor guard — or giving it an i — would advance the durable row cursor
    // past rows that were never drawn.
    const handler = UI_HTML.indexOf('handleTypedFrame(runId, ev);');
    const cursorGuard = UI_HTML.indexOf('if (ev.i > sess.lastIndex) {');
    expect(handler).toBeGreaterThan(-1);
    expect(cursorGuard).toBeGreaterThan(handler);
    expect(UI_HTML).toContain('if (ev.i == null) {');
    // Every card action resolves the runtime request id it was rendered for.
    expect(UI_HTML).toContain("div.setAttribute('data-aid', a.id)");
    expect(UI_HTML).toContain("data-appr=\"' + esc(a.id) + '\"");
    expect(UI_HTML).toContain("api('/api/plan-review/' + pr.id");
    expect(UI_HTML).toContain("api('/api/answers/' + q.id");
  });
});
