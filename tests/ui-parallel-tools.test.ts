import { describe, expect, it } from 'vitest';
import { UI_HTML } from '../src/server/ui.js';

describe('UI — parallel tool lifecycle', () => {
  it('tracks each tool row independently instead of completing only lastTool', () => {
    expect(UI_HTML).toContain('sess.nodes.toolRows = sess.nodes.toolRows || []');
    expect(UI_HTML).toContain('row.dataset.toolState = \'working\'');
    expect(UI_HTML).toContain('function terminalToolSummary(value)');
    expect(UI_HTML).toContain('state.nodes.lastOutputTool = row');
    expect(UI_HTML).toContain("setWorking(activeToolRows(sess).length ? 'Running parallel tools…' : 'Thinking…')");
  });
});
