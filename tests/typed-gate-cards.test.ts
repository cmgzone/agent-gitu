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

/** The hoisted tool-lifecycle helpers, shared by prose and typed frames. */
const TOOL_JS = UI_HTML.slice(
  UI_HTML.indexOf('  function terminalToolSummary('),
  UI_HTML.indexOf('  function appendEvent(runId, ev) {'),
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
  // Command frames are consumed by the tool-card path (a separate slice); this
  // harness stubs it out to test the gate families in isolation.
  context.applyCommandFinish = () => undefined;
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

  it('carries the event requestedAt into card state, falling back to the transport stamp', () => {
    // A native event carries when the agent asked; only a legacy-classified
    // event without one borrows the transport timestamp, which diverges under
    // replay. Cards must surface true request age.
    const { context, sess } = harness();
    context.handleTypedFrame(
      'run1',
      frame({ type: 'approval_required', approvalId: 'appr_t', tool: 'run_command', why: 'why', requestedAt: '2026-01-01T00:00:00.000Z' }),
    );
    expect(context.pendingApprovalsFor(sess, undefined)[0].requestedAt).toBe('2026-01-01T00:00:00.000Z');

    const legacy = harness();
    legacy.context.handleTypedFrame(
      'run1',
      frame({ type: 'approval_required', approvalId: 'appr_l', tool: 'run_command', why: 'why' }, 8),
    );
    expect(legacy.context.pendingApprovalsFor(legacy.sess, undefined)[0].requestedAt).toBe('2026-01-01T00:00:00.000Z'); // the frame's t

    const review = harness();
    review.context.handleTypedFrame(
      'run1',
      frame({ type: 'plan_review_requested', requestId: 'pr_t', plan: 'p', requestedAt: '2026-01-02T00:00:00.000Z' }),
    );
    expect(review.context.pendingPlanReviewFor(review.sess, undefined)!.requestedAt).toBe('2026-01-02T00:00:00.000Z');
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

  it('reads a restored frame as history: no gate card, but the exit fact still lands', () => {
    // After a restart the store replays typed frames beside the prose rows. A
    // gate request among them was raised by a runtime this process does not
    // have, so a card for it would offer buttons that resolve nothing — and
    // would never clear, since no resolution can ever follow.
    const { context, sess, rendered } = harness();
    context.handleTypedFrame('run1', {
      ...frame({ type: 'approval_required', approvalId: 'appr_old', tool: 'run_command', why: 'destructive', summary: 'rm -rf build' }),
      restored: true,
    });
    expect(sess.typedApprovals).toBeUndefined();
    expect(rendered).toEqual([]);
    expect(context.pendingApprovalsFor(sess, undefined)).toHaveLength(0);

    // A command frame is not a request: it only enriches the card the replayed
    // prose rebuilt, so history is exactly when it is useful.
    const applied: Record<string, unknown>[] = [];
    context.applyCommandFinish = (_runId: string, typed: Record<string, unknown>) => {
      applied.push(typed);
    };
    context.handleTypedFrame('run1', {
      ...frame({ type: 'command_finished', command: 'node --version', ok: true, exitCode: 0 }, 11),
      restored: true,
    });
    expect(applied).toHaveLength(1);

    // The mark decides, not the type: the same request arriving live — the
    // fast path a reconnect uses — still opens the card.
    context.handleTypedFrame(
      'run1',
      frame({ type: 'approval_required', approvalId: 'appr_live', tool: 'run_command', why: 'destructive', summary: 'rm -rf build' }, 12),
    );
    expect(sess.typedApprovals?.appr_live).toBeTruthy();
  });
});

describe('typed command frames', () => {
  /** A stub tool card: the prose path built it, the frame path upgrades it. */
  function toolHarness() {
    const context = createContext({});
    // Defined outside the extracted slice; a no-op stub keeps the harness to
    // the lifecycle logic under test.
    context.refreshToolActivityGroup = () => undefined;
    context.toolActivityGroupForRow = () => null;
    // The exit badge is the one DOM node applyToolOutcome creates itself.
    context.document = { createElement: () => ({ className: '', textContent: '' }) };
    new Script(TOOL_JS).runInContext(context);
    const head = {
      createdBadge: undefined as { className: string; textContent: string } | undefined,
      querySelector: () => null,
      insertBefore: function (badge: { className: string; textContent: string }) {
        head.createdBadge = badge;
      },
      appendChild: function (badge: { className: string; textContent: string }) {
        head.createdBadge = badge;
      },
    };
    const durationEl = { textContent: '0s' };
    const detailsEl = { open: false };
    const row = {
      // One stable stub per selector: applyToolOutcome must mutate the same
      // nodes the assertions read back.
      querySelector: (sel: string) => {
        if (sel === '.tl-dot') return { className: 'tl-dot dot-run' };
        if (sel === '.st') return { className: 'st st-run' };
        if (sel === '.tool-duration') return durationEl;
        if (sel === '.output-label') return { textContent: 'Output · waiting for result' };
        if (sel === 'pre') return { textContent: 'Waiting for tool output…' };
        if (sel === '.tl-cmd') return head;
        if (sel === 'details') return detailsEl;
        return null;
      },
      classList: { add: () => undefined },
      dataset: { toolKey: 'node --version', toolState: 'working' } as Record<string, string>,
      isConnected: true,
    };
    const state = { nodes: { toolRows: [row] } as Record<string, unknown> };
    context.S = { sessions: { run1: state } };
    return { context, row, head, state };
  }

  it('applies the real exit code as its own badge, ok and failing alike', () => {
    const { context, row, head } = toolHarness();
    context.applyToolOutcome(row, 'ok', { exitCode: 0, durationMs: 1840 });
    expect(row.dataset.toolState).toBe('done');
    expect(row.dataset.toolStatus).toBe('ok');
    expect(row.querySelector('.tool-duration').textContent).toBe('1.8s');
    // The badge is the point of this increment: the raw fact from the tool
    // result, not a value inferred back out of the ok/error prose line.
    expect(head.createdBadge!.className).toBe('exit-code');
    expect(head.createdBadge!.textContent).toBe('exit 0');

    const bad = toolHarness();
    context.applyToolOutcome(bad.row, 'error', { exitCode: 3, durationMs: 220 });
    expect(bad.head.createdBadge!.className).toBe('exit-code bad');
    expect(bad.head.createdBadge!.textContent).toBe('exit 3');
    // A failing command opens its output disclosure, as the prose path always did.
    expect(bad.row.querySelector('details').open).toBe(true);
  });

  it('shows no badge when the process never produced an exit status', () => {
    // Timeout, cancellation, spawn failure: exitCode is genuinely absent, and
    // manufacturing a 1 would be inventing a fact.
    const { context, row, head } = toolHarness();
    context.applyToolOutcome(row, 'error', { durationMs: 60_000 });
    expect(row.dataset.toolStatus).toBe('error');
    expect(head.createdBadge).toBeUndefined();
  });

  it('upgrades the prose-finished card by exact command match', () => {
    // The executor emits prose and its typed event adjacently, prose first, so
    // the frame usually finds the card already finished. The prose line must
    // still do the finishing (state, duration); the frame then re-finds that
    // same card by key and adds only the exit fact prose cannot express.
    const { context, row, head, state } = toolHarness();
    const finished = context.finishToolRow(state, 'ok', '$ node --version (1840ms)');
    expect(finished).toBe(row);
    expect(row.dataset.toolState).toBe('done');
    expect(head.createdBadge).toBeUndefined(); // prose alone never invents a code

    context.applyCommandFinish('run1', { type: 'command_finished', command: 'node --version', ok: true, exitCode: 0, durationMs: 1840 });
    expect(head.createdBadge!.textContent).toBe('exit 0');
    expect(row.dataset.toolState).toBe('done'); // upgraded, not resurrected
  });

  it('does nothing for a command the timeline never saw', () => {
    // Typed frames always carry the exact command, so they match exactly: a
    // frame for a command the timeline never saw (replay without frames, a
    // foreign emitter) must not stamp its exit code onto an unrelated working
    // card — which is exactly what the prose fallback would have done.
    const { context, row, head, state } = toolHarness();
    context.applyCommandFinish('run1', { type: 'command_finished', command: 'npm install', ok: false, exitCode: 1 });
    expect(head.createdBadge).toBeUndefined();
    expect(row.dataset.toolState).toBe('working');
    // Prose keeps the fallback: a legacy terminal line with the same loose
    // correlation may finish the single active row, as it always did.
    context.finishToolRow(state, 'ok', '$ npm install (10ms)');
    expect(row.dataset.toolState).toBe('done');
  });
});
