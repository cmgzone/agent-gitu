import { createContext, Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { UI_HTML } from '../src/server/ui.js';

const STAGE_JS = UI_HTML.slice(
  UI_HTML.indexOf('  function collectSessionStages('),
  UI_HTML.indexOf('  function loadCodingCheckpoints('),
);

function makeStageHarness() {
  const context = createContext({
    S: { active: 'run1', sessions: {} },
    MAX_REPLAY_EVENTS: 240,
    shortText: (text: string, max: number) => (text.length > max ? text.slice(0, max - 1) + '…' : text),
    esc: (v: unknown) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
    nearBottom: () => true,
    $: () => null,
  });
  new Script(STAGE_JS).runInContext(context);
  return context;
}

describe('Code mode minimal dot-only stage rail', () => {
  it('renders only the dot rail and tooltip without extra stage banners or composer buttons', () => {
    const js = UI_HTML.split('<script>')[1]!.split('</script>')[0]!;
    expect(() => new Function(js)).not.toThrow();
    expect(UI_HTML).toContain('id="stageDotRail"');
    expect(UI_HTML).toContain('id="stageRailTip"');
    expect(UI_HTML).toContain('data-stage-event-id');
    expect(UI_HTML).toContain('function jumpToStage(');
    expect(UI_HTML).toContain('function returnToLatest(');
    expect(UI_HTML).not.toContain('id="stagesToggle"');
    expect(UI_HTML).not.toContain('id="stagesCard"');
    expect(UI_HTML).not.toContain('id="stageFloatNav"');
    expect(UI_HTML).not.toContain('id="stageViewBanner"');
  });

  it('opens a new stage dot strictly when a user message is sent', () => {
    const ctx = makeStageHarness();
    // No user-msg events -> no dots, even if plans/tools/notes exist.
    expect(
      ctx.collectSessionStages({
        session: { status: 'completed', goal: 'Synthetic goal' },
        events: [
          { i: 0, t: '2026-11-19T10:00:00.000Z', text: 'plan 2 steps' },
          { i: 1, t: '2026-11-19T10:00:01.000Z', text: 'run npm test' },
          { i: 2, t: '2026-11-19T10:00:02.000Z', text: 'say Done' },
        ],
      }),
    ).toEqual([]);

    const stages = ctx.collectSessionStages({
      session: { status: 'completed' },
      events: [
        { i: 0, t: '2026-11-19T10:00:00.000Z', text: 'user-msg Set up auth router' },
        { i: 1, t: '2026-11-19T10:00:02.000Z', text: 'plan 2 steps' },
        { i: 2, t: '2026-11-19T10:00:03.000Z', text: 'run write src/auth.ts' },
        { i: 3, t: '2026-11-19T10:00:05.000Z', text: 'done completed — Auth router ready' },
        { i: 4, t: '2026-11-19T10:05:00.000Z', text: 'user-msg Fix OAuth callback error' },
        { i: 5, t: '2026-11-19T10:05:05.000Z', text: 'run npm test' },
        { i: 6, t: '2026-11-19T10:10:00.000Z', text: 'user-msg Add rate limiting' },
      ],
    });
    expect(stages).toHaveLength(3);
    expect(stages.map((s: { index: number; eventId: number; title: string }) => [s.index, s.eventId, s.title])).toEqual([
      [1, 0, 'Set up auth router'],
      [2, 4, 'Fix OAuth callback error'],
      [3, 6, 'Add rate limiting'],
    ]);
  });

  it('hydrates trimmed historical stages on dot click and returns to live tail on last dot click while preserving live gates', () => {
    const events: Array<{ i: number; t: string; text: string }> = [];
    let cursor = 0;
    for (let stage = 1; stage <= 6; stage++) {
      events.push({ i: cursor++, t: `2026-11-19T10:0${stage}:00.000Z`, text: `user-msg Stage ${stage} task` });
      for (let k = 0; k < 49; k++) {
        events.push({ i: cursor++, t: `2026-11-19T10:0${stage}:01.000Z`, text: `note Stage ${stage} step ${k}` });
      }
    }

    const appendedIds: number[] = [];
    const makeNode = () => ({
      id: '',
      className: '',
      innerHTML: '',
      textContent: '',
      dataset: {} as Record<string, string>,
      remove() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
      getAttribute() { return null; },
      classList: { add() {}, remove() {}, toggle() {} },
      getBoundingClientRect() { return { top: 0 }; },
      isConnected: true,
    });
    const streamEl = {
      children: [] as Array<ReturnType<typeof makeNode>>,
      dataset: {} as Record<string, string>,
      scrollTop: 0,
      scrollHeight: 1000,
      insertBefore(node: ReturnType<typeof makeNode>) { this.children.push(node); },
      appendChild(node: ReturnType<typeof makeNode>) { this.children.push(node); },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      getBoundingClientRect() { return { top: 0 }; },
    };

    const sess: Record<string, unknown> = {
      events,
      session: { status: 'completed' },
      nodes: {},
      viewingStage: null,
      typedApprovals: { appr_live: { id: 'appr_live' } },
      typedPlanReview: null,
      typedQuestions: null,
      settledGates: { old_1: true },
    };

    const context = createContext({
      S: { active: 'run1', sessions: { run1: sess } },
      MAX_REPLAY_EVENTS: 240,
      shortText: (text: string) => text,
      esc: (v: unknown) => String(v ?? ''),
      nearBottom: () => true,
      $: (id: string) => (id === 'stream' ? streamEl : null),
      document: { createElement: () => makeNode() },
      resetStreamRenderState: (s: Record<string, unknown>) => {
        s.typedApprovals = {};
        s.settledGates = {};
      },
      appendEvent: (_runId: string, ev: { i: number }) => { appendedIds.push(ev.i); },
      appendSummary: () => undefined,
      renderApprovals: () => undefined,
      renderPlanReview: () => undefined,
      renderQuestions: () => undefined,
      renderErrorCard: () => undefined,
      stickScroll: () => undefined,
      setWorking: () => undefined,
    });
    new Script(STAGE_JS).runInContext(context);

    // Click archived dot 1 (eventId=0).
    context.jumpToStage('run1', 1);
    expect(sess.viewingStage).toBe(1);
    expect(appendedIds[0]).toBe(0);
    expect(appendedIds).toHaveLength(240);
    expect(sess.typedApprovals).toEqual({ appr_live: { id: 'appr_live' } });
    expect(sess.settledGates).toEqual({ old_1: true });

    // Click last dot (6) -> returns seamlessly to live tail (indices 60..299).
    appendedIds.length = 0;
    context.jumpToStage('run1', 6);
    expect(sess.viewingStage).toBeNull();
    expect(appendedIds[0]).toBe(60);
    expect(appendedIds.at(-1)).toBe(299);
    expect(sess.typedApprovals).toEqual({ appr_live: { id: 'appr_live' } });
  });
});
