import { describe, expect, it } from 'vitest';
import { createContext, Script } from 'node:vm';
import { UI_HTML } from '../src/server/ui.js';

/**
 * The typed approval card. A live native frame renders and settles the card;
 * the polled session view is a fallback, not the source of truth. The card's
 * two helpers are extracted and executed because the browser bundle is a static
 * string — the same technique the credential-chat tests use.
 */
const CARD_JS = UI_HTML.slice(
  UI_HTML.indexOf('  function pendingApprovalsFor('),
  UI_HTML.indexOf('  function renderApprovals('),
);

type CardSession = {
  typedApprovals?: Record<string, { id: string; tool?: string; why?: string; summary?: string }>;
  settledApprovals?: Record<string, boolean>;
};

function harness() {
  const rendered: string[] = [];
  const context = createContext({});
  new Script(CARD_JS).runInContext(context);
  const sess: CardSession = {};
  context.S = { sessions: { run1: sess } };
  context.renderApprovals = (runId: string) => {
    rendered.push(runId);
  };
  return { context, sess, rendered };
}

function required(approvalId: string) {
  return {
    seq: 7,
    t: '2026-01-01T00:00:00.000Z',
    typed: {
      type: 'approval_required',
      approvalId,
      tool: 'run_command',
      why: 'destructive',
      summary: 'git push --force origin main',
    },
  };
}

describe('typed approval card', () => {
  it('renders from a live frame alone and stays single when the poll catches up', () => {
    const { context, rendered } = harness();
    context.handleTypedFrame('run1', required('appr_1'));
    expect(rendered).toEqual(['run1']);

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

  it('settles the card on the resolution frame even while the mirror still lists the request', () => {
    const { context, rendered } = harness();
    context.handleTypedFrame('run1', required('appr_1'));
    context.handleTypedFrame('run1', {
      seq: 8,
      t: '2026-01-01T00:00:01.000Z',
      typed: { type: 'approval_resolved', approvalId: 'appr_1', approved: false },
    });
    expect(rendered).toEqual(['run1', 'run1']);

    // The mirror lags the runtime by up to one poll interval. A card left
    // clickable in that window offers an id nothing can answer any more.
    const stillListed = context.pendingApprovalsFor(context.S.sessions.run1, {
      pendingApprovals: [{ id: 'appr_1' }],
    });
    expect(stillListed).toHaveLength(0);
    expect(context.S.sessions.run1.typedApprovals).toEqual({});
    expect(context.S.sessions.run1.settledApprovals).toMatchObject({ appr_1: true });
  });

  it('ignores frames for families it does not own', () => {
    const { context, rendered } = harness();
    context.handleTypedFrame('run1', { seq: 9, t: 'x', typed: { type: 'command_finished', ok: true, exitCode: 0 } });
    context.handleTypedFrame('run1', { seq: 10, t: 'x' });
    context.handleTypedFrame('run-unknown', required('appr_9'));
    expect(rendered).toEqual([]);
    expect(context.pendingApprovalsFor(context.S.sessions.run1, undefined)).toHaveLength(0);
    // Unrelated traffic never even creates the card's state.
    expect(context.S.sessions.run1.typedApprovals).toBeUndefined();
  });

  it('dispatches frames before the rendered-row cursor so they can never move it', () => {
    // Frames carry `seq` (the runtime log cursor) and no `i`. Handling one after
    // the cursor guard — or giving it an `i` — would advance the durable row
    // cursor past rows that were never drawn.
    const handler = UI_HTML.indexOf('handleTypedFrame(runId, ev);');
    const cursorGuard = UI_HTML.indexOf('if (ev.i > sess.lastIndex) {');
    expect(handler).toBeGreaterThan(-1);
    expect(cursorGuard).toBeGreaterThan(handler);
    expect(UI_HTML).toContain('if (ev.i == null) {');
    // Every card action resolves the runtime request id it was rendered for.
    expect(UI_HTML).toContain("div.setAttribute('data-aid', a.id)");
    expect(UI_HTML).toContain("data-appr=\"' + esc(a.id) + '\"");
  });
});
