import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_CLEAN_ACTIVITY_JS } from '../src/server/ui-cowork-activity.js';

function activity(withWorkingBubble = false) {
  const state = { busy: true, progresses: [] as Record<string, unknown>[], requests: [] as Record<string, unknown>[], workHistory: [] as unknown[] };
  const summary = { focus: vi.fn() };
  const history = { open: false, scrollIntoView: vi.fn(), querySelector: () => summary };
  const elements: Record<string, any> = {
    cwCleanActivity: { hidden: true }, cwCleanStatus: { hidden: true },
    cwCleanLabel: { textContent: '' }, cwCleanDetails: { hidden: true, textContent: '', onclick: null },
    cwMsgs: { querySelectorAll: () => [history], scrollHeight: 1000, scrollTop: 100, clientHeight: 500 },
  };
  if (withWorkingBubble) { elements.cwWorkingBubble = { hidden: true }; elements.cwWorkingLabel = { textContent: '' }; }
  const context = createContext({ cwEnsure: () => state, $: (id: string) => elements[id], cwToolProgressText: () => 'Checking the relevant files…', cwVisibleReply: (text: string) => text || '' });
  new Script(COWORK_CLEAN_ACTIVITY_JS).runInContext(context);
  return { state, elements, context, history, summary };
}

describe('Cowork clean activity', () => {
  it('updates the translucent bubble from live tool activity without exposing private details', () => {
    const u = activity(true);
    u.context.cwRenderCleanActivity();
    expect(u.elements.cwWorkingBubble.hidden).toBe(false);
    expect(u.elements.cwWorkingLabel.textContent).toBe('Working on your request…');
    expect(u.elements.cwCleanActivity.hidden).toBe(true);
    u.state.progresses = [{ tool: 'read_file', params: 'private-path', reasoning: 'private reasoning' }];
    u.context.cwRenderCleanActivity();
    expect(u.elements.cwWorkingLabel.textContent).toBe('Checking the relevant files…');
    u.context.cwToolProgressText = () => 'Updating the requested files…';
    u.state.progresses = [{ tool: 'write_file', params: 'private-path' }];
    u.context.cwRenderCleanActivity();
    expect(u.elements.cwWorkingLabel.textContent).toBe('Updating the requested files…');
    expect(u.elements.cwMsgs.scrollTop).toBe(100);
  });

  it('gives way to public streamed replies and disappears when work stops', () => {
    const u = activity(true);
    u.state.progresses = [{ phase: 'responding', text: '' }];
    u.context.cwRenderCleanActivity();
    expect(u.elements.cwWorkingLabel.textContent).toBe('Writing a reply…');
    u.state.progresses[0].text = 'Here is the comparison.';
    u.context.cwRenderCleanActivity();
    expect(u.elements.cwWorkingBubble.hidden).toBe(true);
    expect(u.elements.cwWorkingLabel.textContent).toBe('');
    u.state.busy = false;
    u.context.cwRenderCleanActivity();
    expect(u.elements.cwCleanActivity.hidden).toBe(true);
  });

  it('keeps failures truthful and puts unanswered requests near the input', () => {
    const u = activity(true);
    u.state.progresses = [{ tool: 'read_file', toolOk: false }];
    u.context.cwRenderCleanActivity();
    expect(u.elements.cwWorkingLabel.textContent).toBe('A step failed');
    u.state.requests = [{ status: 'open' }];
    u.context.cwRenderCleanActivity();
    expect(u.elements.cwWorkingBubble.hidden).toBe(true);
    expect(u.elements.cwCleanStatus.hidden).toBe(false);
    expect(u.elements.cwCleanLabel.textContent).toBe('Waiting for your response');
  });

  it('shows a short fallback before the first progress event and disappears when idle', () => {
    const u = activity();
    u.context.cwRenderCleanActivity();
    expect(u.elements.cwCleanActivity.hidden).toBe(false);
    expect(u.elements.cwCleanLabel.textContent).toBe('Working on your request…');
    expect(u.elements.cwCleanDetails.hidden).toBe(true);
    u.state.busy = false;
    u.context.cwRenderCleanActivity();
    expect(u.elements.cwCleanActivity.hidden).toBe(true);
  });

  it('uses a public tool category without exposing parameters, reasoning, or live reply text', () => {
    const u = activity();
    u.state.progresses = [{ agentId: 'one', tool: 'read_file', params: 'secret-path', reasoning: 'private reasoning', text: 'Long reply' }, { agentId: 'two', tool: 'read_file' }, { agentId: 'one', tool: 'read_file' }];
    expect(u.context.cwCleanActivityText()).toBe('Checking the relevant files… · 2 teammates');
  });

  it('makes an unresolved question visible even when the agent is idle', () => {
    const u = activity();
    u.state.busy = false;
    u.state.requests = [{ status: 'open' }];
    expect(u.context.cwCleanActivityText()).toBe('Waiting for your response');
    u.state.requests = [{ status: 'accepted' }];
    expect(u.context.cwCleanActivityText()).toBe('');
  });

  it('opens the latest work history on demand and keeps it available when work stops', () => {
    const u = activity();
    u.state.busy = false;
    u.state.workHistory = [{}, {}];
    u.context.cwRenderCleanActivity();
    expect(u.elements.cwCleanStatus.hidden).toBe(true);
    expect(u.elements.cwCleanDetails.textContent).toBe('Work details · 2');
    expect(u.history.open).toBe(false);
    u.elements.cwCleanDetails.onclick();
    expect(u.history.open).toBe(true);
    expect(u.summary.focus).toHaveBeenCalledOnce();
  });

  it('reports a failed step without claiming the task succeeded', () => {
    const u = activity();
    u.state.progresses = [{ agentId: 'one', tool: 'read_file', toolOk: false }];
    expect(u.context.cwCleanActivityText()).toBe('A step failed');
  });
});
