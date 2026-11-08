import { Script, createContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { startsUnrelatedTask, classifyFollowUp } from '../src/agent/follow-up.js';
import { UI_HTML } from '../src/server/ui.js';

/** A task bound to message search, as the ledger would record it. */
const searchTask = {
  goal: 'Fix individual message search in src/search.ts',
  files: ['src/search.ts'],
  symbols: ['searchMessages'],
  plan: ['Reproduce the failing search in tests/search.test.ts', 'Verify the search ranking'],
  criteria: ['Searching for a sender returns every matching message'],
};

describe('starting a new task inside a session', () => {
  it.each([
    'Add a dark mode toggle to the settings screen',
    'Fix the login redirect loop on mobile',
    'Improve error handling in the dashboard',
  ])('treats an unrelated request as a new task: %s', (message) => {
    expect(startsUnrelatedTask(message, searchTask)).toBe(true);
    // The classifier alone falls through to REFINE for these; the scope check is
    // what rescues them from being folded into the previous task.
    expect(classifyFollowUp(message).kind).toBe('REFINE');
  });

  it.each([
    'Fix the search ranking for multi-word queries',
    'Refactor searchMessages to stream results',
    'Edit src/search.ts to keep the subject line',
    'Make it faster',
    'and fix the issue',
    'thanks',
    'why is the search so slow?',
  ])('keeps a related or backward-looking message a continuation: %s', (message) => {
    expect(startsUnrelatedTask(message, searchTask)).toBe(false);
  });

  it('never invents a new task without a task scope to compare against', () => {
    expect(startsUnrelatedTask('Add a dark mode toggle to the settings screen', undefined)).toBe(false);
    expect(startsUnrelatedTask('Add a dark mode toggle to the settings screen', { goal: '' })).toBe(false);
  });

  it('does not override the classifier for wording that is already explicit', () => {
    // Explicit new-task wording is handled by NEW_TASK_PATTERNS; the overlap
    // rule only covers the default REFINE fallthrough.
    expect(classifyFollowUp('new task: add a dark mode toggle').kind).toBe('NEW_TASK');
    expect(startsUnrelatedTask('Continue with the same task', searchTask)).toBe(false);
  });
});

describe('composer new-task affordance', () => {
  function harness(pressed: boolean) {
    let sent: { url: string; body: Record<string, unknown> } | undefined;
    const toggle = {
      pressed,
      attributes: {} as Record<string, string>,
      getAttribute(key: string) {
        return key === 'aria-pressed' ? (this.pressed ? 'true' : 'false') : null;
      },
      setAttribute(key: string, value: string) {
        this.attributes[key] = value;
        if (key === 'aria-pressed') this.pressed = value === 'true';
      },
      classList: { toggle() {} },
    };
    const context = createContext({
      S: { active: 'run-1', sessions: { 'run-1': { session: { status: 'completed', mode: 'agent', provider: 'p', model: 'm' } } }, sel: { model: 'p::m', effort: 'max' }, settings: {} },
      $: (id: string) => (id === 'newTaskToggle' ? toggle : null),
      removeUserBubble() {},
      renderRunSide() {},
      pendingFor: () => [],
      planRequested: () => false,
      appendPendingUserMessage: () => 'pending',
      updateSendState() {},
      homeSaveFollowDraft() {},
      homeRestoreFollowDraft() {},
      api: (url: string, options: { body: string }) => {
        sent = { url, body: JSON.parse(options.body) as Record<string, unknown> };
        return new Promise(() => {});
      },
    });
    new Script(UI_HTML.slice(UI_HTML.indexOf('  function sendFollow('), UI_HTML.indexOf('  function appendPendingUserMessage('))).runInContext(context);
    return { context, toggle, get sent() { return sent; } };
  }

  it('offers a New task control in the session composer', () => {
    const markupAt = UI_HTML.indexOf('id="newTaskToggle"');
    expect(markupAt).toBeGreaterThan(-1);
    expect(UI_HTML.slice(markupAt, UI_HTML.indexOf('</button>', markupAt))).toContain('aria-pressed="false"');
  });

  it('sends newTask only when the toggle is pressed', () => {
    const pressed = harness(true);
    pressed.context.sendFollow('Add a dark mode toggle');
    expect(pressed.sent?.url).toBe('/api/runs/run-1/message');
    expect(pressed.sent?.body.newTask).toBe(true);

    const idle = harness(false);
    idle.context.sendFollow('Add a dark mode toggle');
    expect(idle.sent?.body.newTask).toBeUndefined();
  });
});
