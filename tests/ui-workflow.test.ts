import { Script, createContext } from 'node:vm';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { UI_HTML } from '../src/server/ui.js';
import { SessionStore } from '../src/server/session-store.js';

function controls() {
  const makeButton = () => ({ disabled: false, title: '', attributes: {} as Record<string, string>,
    setAttribute(key: string, value: string) { this.attributes[key] = value; },
    classList: { toggle(_name: string, _active: boolean) {} } });
  const agent = makeButton(), plan = makeButton(), plus = makeButton();
  const state = { active: 'home', sessions: { a: { session: { status: 'completed' } }, b: { session: { status: 'running' } } } };
  const context = createContext({ S: state, $: (id: string) => ({ menuAgent: agent, menuPlan: plan, homePlusBtn: plus })[id as 'menuAgent' | 'menuPlan' | 'homePlusBtn'] ?? null });
  const source = UI_HTML.slice(UI_HTML.indexOf('  function planRequested('), UI_HTML.indexOf('  function controlsHtml('));
  new Script(source).runInContext(context);
  return { context, state, agent, plan, plus };
}

function composerChecklist(ledger: unknown) {
  const createPanel = () => ({ hidden: true, open: false, innerHTML: '', dataset: {} as Record<string, string>, ontoggle: null as null | (() => void) });
  let panel = createPanel();
  const state = { active: 'run-1', sessions: { 'run-1': { ledger } } as Record<string, { ledger: unknown; composerTodosOpen?: boolean }> };
  const context = createContext({
    S: state,
    $: (id: string) => id === 'composerTodos' ? panel : null,
    esc: (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
  });
  const source = UI_HTML.slice(UI_HTML.indexOf('  function composerTodoItems('), UI_HTML.indexOf('  function failureSummary('));
  new Script(source).runInContext(context);
  return { context, get panel() { return panel; }, state, recreatePanel() { panel = createPanel(); } };
}

describe('single Agent composer', () => {
  it('sends the selected effort when continuing an existing task', () => {
    let sent: { url: string; body: { effort?: string } } | undefined;
    const context = createContext({
      S: { active: 'run-1', sessions: { 'run-1': { session: { status: 'completed', mode: 'agent', provider: 'chatgpt', model: 'model' } } }, sel: { model: 'chatgpt::model', effort: 'max' }, settings: {} },
      $: () => null,
      removeUserBubble() {}, renderRunSide() {}, pendingFor: () => [], planRequested: () => false,
      appendPendingUserMessage: () => 'pending', updateSendState() {},
      api: (url: string, options: { body: string }) => {
        sent = { url, body: JSON.parse(options.body) };
        return new Promise(() => {});
      },
    });
    new Script(UI_HTML.slice(UI_HTML.indexOf('  function sendFollow('), UI_HTML.indexOf('  function appendPendingUserMessage('))).runInContext(context);
    context.sendFollow('Continue');
    expect(sent?.url).toBe('/api/runs/run-1/message');
    expect(sent?.body.effort).toBe('max');
  });

  it('shows recorded native effort and keeps the next-turn selection separate from legacy planner metadata', () => {
    const ledger = { actions: [], plan: [], evidence: [], filesChanged: [], checkpoints: [], execution: { mode: 'codex-native', native: {} as Record<string, string> }, effortPlan: { llmEffort: 'low' } };
    const body = { innerHTML: '' }, card = { hidden: false, scrollTop: 0 }, details = { open: false };
    const context = createContext({
      S: { sessions: { 'run-1': { session: {}, ledger } }, sel: { effort: 'max' } },
      $: (id: string) => ({ contextCardBody: body, contextCard: card, contextRunDetails: details })[id as 'contextCardBody'],
      renderContextRing() {}, esc: (value: unknown) => String(value ?? ''), shortDate: String,
    });
    new Script(UI_HTML.slice(UI_HTML.indexOf('  function renderContextCard('), UI_HTML.indexOf('  function openSettings('))).runInContext(context);
    context.renderContextCard('run-1');
    expect(body.innerHTML).not.toContain('low (run)');
    expect(body.innerHTML).toContain('Not recorded for this turn');
    expect(body.innerHTML).toContain('Selected for next turn');
    ledger.execution.native = { requestedEffort: 'max', effectiveEffort: 'high' };
    context.renderContextCard('run-1');
    expect(body.innerHTML).toContain('high (run)');
    expect(body.innerHTML).toContain('Requested effort');
    ledger.execution.native.effectiveEffort = 'max';
    context.renderContextCard('run-1');
    expect(body.innerHTML).toContain('max (run)');
    expect(body.innerHTML).not.toContain('Selected for next turn');
  });

  it('uses one workflow for start, follow-up, and recovery, without a saved mode picker', () => {
    expect(UI_HTML).not.toContain('id="wf"');
    expect(UI_HTML).not.toContain('id="gWf"');
    expect(UI_HTML).toContain('delete S.sel.wf;');
    expect(UI_HTML).toContain('delete S.settings.review;');
    expect(UI_HTML.match(/mode: 'agent'/g)).toHaveLength(3);
    expect(UI_HTML).toContain("setPlanRequested('home', false)");
    expect(UI_HTML).toContain('setPlanRequested(runId, false)');
    expect(() => new Script(UI_HTML.split('<script>')[1]!.split('</script>')[0]!)).not.toThrow();
  });

  it('keeps the temporary plan choice with its composer and clears it after consumption', () => {
    const { context, state, agent, plan } = controls();
    context.setPlanRequested('home', true);
    expect(plan.attributes['aria-checked']).toBe('true');
    expect(agent.attributes['aria-checked']).toBe('false');
    state.active = 'a';
    context.updatePlanControl();
    expect(plan.attributes['aria-checked']).toBe('false');
    context.setPlanRequested('a', true);
    context.setPlanRequested('home', false);
    expect(context.planRequested('a')).toBe(true);
    context.setPlanRequested('a', false);
    expect(plan.attributes['aria-checked']).toBe('false');
    expect(controls().context.planRequested('home')).toBe(false);
  });

  it('does not offer a new plan toggle while a task is executing', () => {
    const { context, state, agent, plan } = controls();
    state.active = 'b';
    context.updatePlanControl();
    expect(agent.disabled).toBe(true);
    expect(plan.disabled).toBe(true);
    state.sessions.b.session.status = 'completed';
    context.updatePlanControl();
    expect(agent.disabled).toBe(false);
    expect(plan.disabled).toBe(false);
  });

  it('keeps a collapsed checklist above the composer with the current item, progress, and every task available', () => {
    const listAt = UI_HTML.indexOf('id="composerTodos"');
    const inputAt = UI_HTML.indexOf('id="follow"');
    expect(listAt).toBeGreaterThan(-1);
    expect(listAt).toBeLessThan(inputAt);

    const { context, panel, state } = composerChecklist({
      plan: [
        { description: 'Build the new view', status: 'in_progress', subtasks: [{ text: 'Wire the UI', done: true }, { text: 'Polish the layout', done: false }] },
        { description: 'Verify the result', status: 'pending' },
      ],
    });
    context.renderComposerTodos('run-1');
    expect(panel.hidden).toBe(false);
    expect(panel.open).toBe(false);
    expect(panel.innerHTML.split('</summary>')[0]).toContain('Polish the layout');
    expect(panel.innerHTML.split('</summary>')[0]).toContain('1/3 done');
    expect(panel.innerHTML).toContain('Polish the layout');
    expect(panel.innerHTML).toContain('Verify the result');
    expect(panel.innerHTML).toContain('Wire the UI');
    expect(panel.innerHTML).toContain('Pending');
    expect(panel.innerHTML).not.toContain('Next');
    expect(panel.innerHTML).toContain('Working');

    state.sessions['run-1'].ledger = { plan: [{ description: 'Build the new view', status: 'done' }] };
    context.renderComposerTodos('run-1');
    expect(panel.hidden).toBe(false);
    expect(panel.innerHTML).toContain('Checklist complete');
    expect(panel.innerHTML).toContain('1/1 done');
  });

  it('preserves the checklist expansion through updates and separately for each task', () => {
    const harness = composerChecklist({ plan: [{ description: 'Build the view', status: 'in_progress' }] });
    const { context, state } = harness;
    context.renderComposerTodos('run-1');
    harness.panel.open = true;
    harness.panel.ontoggle?.();
    state.sessions['run-1'].ledger = { plan: [{ description: 'Verify the view', status: 'in_progress' }] };
    context.renderComposerTodos('run-1');
    expect(harness.panel.open).toBe(true);
    expect(harness.panel.innerHTML).toContain('Verify the view');

    state.sessions['run-2'] = { ledger: { plan: [{ description: 'A separate task', status: 'pending' }] } };
    state.active = 'run-2';
    harness.recreatePanel();
    context.renderComposerTodos('run-2');
    expect(harness.panel.open).toBe(false);

    state.active = 'run-1';
    harness.recreatePanel();
    context.renderComposerTodos('run-1');
    expect(harness.panel.open).toBe(true);
    harness.panel.open = false;
    harness.panel.ontoggle?.();
    context.renderComposerTodos('run-1');
    expect(harness.panel.open).toBe(false);
  });

  it('keeps plan order and explains an empty checklist without inventing progress', () => {
    const { context, panel, state } = composerChecklist({ plan: [
      { description: 'Prepare', status: 'done' },
      { description: 'Implement', status: 'pending', subtasks: ['First subtask', 'Second subtask'] },
      { description: 'Verify', status: 'pending' },
    ] });
    context.renderComposerTodos('run-1');
    expect(panel.innerHTML.split('</summary>')[0]).toContain('First subtask');
    const list = panel.innerHTML.split('</summary>')[1];
    expect(list.indexOf('First subtask')).toBeLessThan(list.indexOf('Second subtask'));
    expect(list.indexOf('Second subtask')).toBeLessThan(list.indexOf('Verify'));

    state.sessions['run-1'].ledger = { plan: [] };
    context.renderComposerTodos('run-1');
    expect(panel.hidden).toBe(false);
    expect(panel.innerHTML).toContain('No checklist yet');
    expect(panel.innerHTML).toContain('has not saved');
    expect(panel.innerHTML).not.toContain('done');
    state.sessions['run-1'].ledger = null;
    context.renderComposerTodos('run-1');
    expect(panel.hidden).toBe(true);
    state.sessions['run-1'].ledger = { plan: [{ description: 'Implement search', status: 'pending' }] };
    context.renderComposerTodos('run-1');
    expect(panel.hidden).toBe(false);
    expect(panel.innerHTML).toContain('0/1 done');
    expect(panel.innerHTML).not.toContain('No checklist yet');
  });

  it('restores unified sessions while preserving older chat and build history', () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'gitu-agent-sessions-')), 'sessions.db');
    let store = new SessionStore(file);
    for (const mode of ['agent', 'standard', 'chat'] as const) {
      store.upsertSession({ runId: mode, taskId: `task-${mode}`, mode, goal: 'Saved task', startedAt: new Date().toISOString(), status: 'completed' });
    }
    store.close();
    store = new SessionStore(file);
    try {
      expect(store.listSessions().map(s => s.mode).sort()).toEqual(['agent', 'chat', 'standard']);
      expect(store.getSessionByTaskId('task-agent')?.mode).toBe('agent');
    } finally { store.close(); }
  });
});
