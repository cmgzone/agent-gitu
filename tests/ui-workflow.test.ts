import { Script, createContext } from 'node:vm';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { UI_HTML } from '../src/server/ui.js';
import { SessionStore } from '../src/server/session-store.js';

function controls() {
  const button = { disabled: false, textContent: '', title: '', style: {}, attributes: {} as Record<string, string>,
    setAttribute(key: string, value: string) { this.attributes[key] = value; } };
  const state = { active: 'home', sessions: { a: { session: { status: 'completed' } }, b: { session: { status: 'running' } } } };
  const context = createContext({ S: state, $: (id: string) => id === 'planOnce' ? button : null });
  const source = UI_HTML.slice(UI_HTML.indexOf('  function planRequested('), UI_HTML.indexOf('  function controlsHtml('));
  new Script(source).runInContext(context);
  return { context, state, button };
}

function composerChecklist(ledger: unknown) {
  const panel = { hidden: true, innerHTML: '', dataset: {} as Record<string, string> };
  const state = { active: 'run-1', sessions: { 'run-1': { ledger } } };
  const context = createContext({
    S: state,
    $: (id: string) => id === 'composerTodos' ? panel : null,
    esc: (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
  });
  const source = UI_HTML.slice(UI_HTML.indexOf('  function composerTodoItems('), UI_HTML.indexOf('  function renderRunOverview('));
  new Script(source).runInContext(context);
  return { context, panel, state };
}

describe('single Agent composer', () => {
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
    const { context, state, button } = controls();
    context.setPlanRequested('home', true);
    expect(button.attributes['aria-pressed']).toBe('true');
    expect(button.textContent).toBe('Plan once');
    state.active = 'a';
    context.updatePlanControl();
    expect(button.attributes['aria-pressed']).toBe('false');
    context.setPlanRequested('a', true);
    context.setPlanRequested('home', false);
    expect(context.planRequested('a')).toBe(true);
    context.setPlanRequested('a', false);
    expect(button.attributes['aria-pressed']).toBe('false');
    expect(controls().context.planRequested('home')).toBe(false);
  });

  it('does not offer a new plan toggle while a task is executing', () => {
    const { context, state, button } = controls();
    state.active = 'b';
    context.updatePlanControl();
    expect(button.disabled).toBe(true);
    state.sessions.b.session.status = 'completed';
    context.updatePlanControl();
    expect(button.disabled).toBe(false);
  });

  it('keeps the active task checklist directly above the run composer', () => {
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
    expect(panel.innerHTML).toContain('Polish the layout');
    expect(panel.innerHTML).toContain('Verify the result');
    expect(panel.innerHTML).not.toContain('Wire the UI');
    expect(panel.innerHTML).toContain('Working');

    state.sessions['run-1'].ledger = { plan: [{ description: 'Build the new view', status: 'done' }] };
    context.renderComposerTodos('run-1');
    expect(panel.hidden).toBe(true);
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
