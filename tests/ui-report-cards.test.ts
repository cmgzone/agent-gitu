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

  it('collapses narration rows duplicated by LLM retries', () => {
    // A retried stream re-sends the same thought; without dedupe each attempt
    // rendered as an identical row (dozens of copies in long runs).
    expect(UI_HTML).toContain('dedupeNarration(sess, node');
    expect(UI_HTML).toContain('dedupeNarration(sess, b,');
    expect(UI_HTML).toContain("sess[memoKey] = raw;");
  });

  it('collapses leaked raw JSON action objects behind a disclosure', () => {
    expect(UI_HTML).toContain('stripJsonLeak');
    expect(UI_HTML).toContain('Raw model output');
    expect(UI_HTML).toContain('JSON_LEAK_MARKERS');
    // The detector must match TRUNCATED leaks too — the stream can cut off
    // at exactly `{"thought` with no closing quote (regression: only the
    // full `{"thought"` marker was matched, so the fragment rendered).
    expect(UI_HTML).toContain("var JSON_LEAK_RE = /^\\{\\s*\\\\?\"thought/;");
    expect(UI_HTML).toContain("'{\"thought', '{\\\\\"thought'");
    // A thought stream that STARTS with the leak opens the technical row
    // directly instead of a narration row.
    expect(UI_HTML).toContain('JSON_LEAK_RE.test(chunk)');
  });

  it('renders the completion report as flat sections, not a bordered card', () => {
    // Main report uses the flat document layout; the old bordered summary
    // card is gone from the report path.
    expect(UI_HTML).toContain("div.className = 'report-flat'");
    expect(UI_HTML).not.toContain("div.className = 'summary-card'");
    expect(UI_HTML).toContain('reportStatusLine(');
    // Conversational outcome first — not "1/3 checks passed" stats chips.
    expect(UI_HTML).toContain("doneIcon + ' ' + doneWord");
    expect(UI_HTML).toContain('criteria satisfied');
    expect(UI_HTML).not.toContain("checks passed</span>");
  });

  it('parses the machine change dump into human-phrased changes', () => {
    expect(UI_HTML).toContain('function parseOutcome(summary)');
    expect(UI_HTML).toContain('CHANGE_VERBS');
    expect(UI_HTML).toContain('What Gitu found');
  });

  it('hides all technical evidence behind one collapsed disclosure', () => {
    expect(UI_HTML).toContain('<b>Technical evidence</b>');
    expect(UI_HTML).toContain('telemetryGridHtml(');
  });

  it('rephrases machine counters in the progress header', () => {
    expect(UI_HTML).toContain("' steps · ' + L.evidence.length + ' checks'");
    expect(UI_HTML).not.toContain("actions · ' + L.evidence.length + ' evidence'");
  });
});
