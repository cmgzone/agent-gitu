import { describe, expect, it } from 'vitest';
import { UI_HTML } from '../src/server/ui.js';

describe('UI — parallel tool lifecycle', () => {
  it('groups an agent turn into one expandable activity card while tracking nested calls independently', () => {
    expect(UI_HTML).toContain("el.className = 'tl-row tl-tool-group'");
    expect(UI_HTML).toContain('class="tool-group-list"');
    expect(UI_HTML).toContain('ensureToolActivityGroup(sess, insert)');
    expect(UI_HTML).toContain('group.callsByKey[key]');
    expect(UI_HTML).toContain('refreshToolActivityGroup(group.el)');
    expect(UI_HTML).toContain('tool-group-shimmer');
    // The old standalone parallel narration is folded into the same card.
    expect(UI_HTML).toContain('second "parallel" timeline row would duplicate the same event');
  });

  it('tracks each nested call independently instead of completing only lastTool', () => {
    expect(UI_HTML).toContain('sess.nodes.toolRows = sess.nodes.toolRows || []');
    expect(UI_HTML).toContain('row.dataset.toolState = \'working\'');
    expect(UI_HTML).toContain('function terminalToolSummary(value)');
    expect(UI_HTML).toContain('state.nodes.lastOutputTool = row');
    expect(UI_HTML).toContain("setWorking(activeToolRows(sess).length ? 'Running parallel tools…' : 'Thinking…')");
  });
});
