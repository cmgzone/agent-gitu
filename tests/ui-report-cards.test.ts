import { describe, expect, it } from 'vitest';
import { UI_HTML } from '../src/server/ui.js';

// The activity stream must read like an agent report, not a terminal log:
// dense verification prose is structured (headline + checklist + next-step
// footer), token telemetry collapses behind "Execution details", and raw
// model-JSON leaks never render as conversational text.
describe('UI — narration structuring & technical disclosures', () => {
  it('renders telemetry as a collapsed Execution details card, not a meta line', () => {
    expect(UI_HTML).toContain("text.indexOf('telemetry ') === 0");
    expect(UI_HTML).toContain('<b>Execution details</b>');
    expect(UI_HTML).toContain('exec-grid');
    // Counters are parsed into label/value pairs, not echoed raw.
    expect(UI_HTML).toContain("var LABELS = { calls: 'Calls', toolCalls: 'Tool calls'");
  });

  it('structures dense verification notes as headline + checklist + footer', () => {
    expect(UI_HTML).toContain('denseNoteHtml(sents)');
    expect(UI_HTML).toContain('.dense-headline');
    expect(UI_HTML).toContain('.dense-items li.ev');
    expect(UI_HTML).toContain('.dense-foot');
    // Only long, multi-sentence notes are restructured; short ones stay plain.
    expect(UI_HTML).toContain('DENSE_MIN_CHARS');
  });

  it('finalizes narration exactly once, when the thought/bubble closes', () => {
    expect(UI_HTML).toContain('finalizeNarration(node)');
    expect(UI_HTML).toContain('retireAbubble(sess);');
    expect(UI_HTML).toContain("txt.setAttribute('data-final'");
  });

  it('collapses leaked raw JSON action objects behind a disclosure', () => {
    expect(UI_HTML).toContain('stripJsonLeak');
    expect(UI_HTML).toContain('Raw model output');
    expect(UI_HTML).toContain('JSON_LEAK_MARKERS');
  });
});
