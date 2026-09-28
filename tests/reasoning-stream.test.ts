import { createContext, Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { UI_HTML } from '../src/server/ui.js';
import { REASONING_STREAM_JS } from '../src/server/ui-activity.js';

describe('main chat reasoning stream', () => {
  function renderer() {
    const sink = { textContent: '', hidden: true, scrollHeight: 200, scrollTop: 180, clientHeight: 20 };
    const sessions = { run: { nodes: {} as Record<string, unknown> } };
    const context = createContext({ S: { sessions }, $: (id: string) => id === 'workingReasoning' ? sink : {}, setWorking: () => {}, stickScroll: () => {} });
    const start = UI_HTML.indexOf('  function appendEvent(runId, ev) {');
    const end = UI_HTML.indexOf('\n  }', start);
    new Script(REASONING_STREAM_JS + '\n' + UI_HTML.slice(start, end + 4)).runInContext(context);
    return { sink, context, append: (i: number, text: string) => context.appendEvent('run', { i, text }) };
  }

  it('renders provider text safely below the indicator and ignores replayed resets/deltas', () => {
    const u = renderer();
    u.append(1, 'activity reasoning-reset');
    u.append(2, 'activity reasoning-delta "Reviewing <img src=x>"');
    u.append(3, 'activity reasoning-delta " evidence."');
    u.append(1, 'activity reasoning-reset');
    u.append(2, 'activity reasoning-delta "Reviewing <img src=x>"');
    expect(u.sink.textContent).toBe('Reviewing <img src=x> evidence.');
    expect(u.sink.hidden).toBe(false);
    u.append(4, 'activity reasoning-reset');
    expect(u.sink.textContent).toBe('');
    expect(u.sink.hidden).toBe(true);
    u.append(5, 'activity reasoning-delta {"invalid":true}');
    expect(u.sink.hidden).toBe(true);
  });

  it('bounds long text and preserves a user scroll position', () => {
    const u = renderer();
    u.sink.scrollTop = 5;
    u.context.renderReasoningStream(u.sink, 'x'.repeat(30000));
    expect(u.sink.textContent.length).toBe(24000);
    expect(u.sink.scrollTop).toBe(5);
    expect(UI_HTML).toContain('id="workingReasoning"');
  });
});
