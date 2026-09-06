import { Script, createContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { UI_HTML } from '../src/server/ui.js';

function source(name: string) {
  const declaration = new RegExp('^( +)function ' + name + '\\(', 'm').exec(UI_HTML)!;
  const start = declaration.index;
  const end = UI_HTML.indexOf('\n' + declaration[1] + '}', start);
  return UI_HTML.slice(start, end + declaration[1].length + 2);
}

function proseRenderer() {
  const emitted: { innerHTML: string }[] = [];
  const stream = { appendChild: (element: { innerHTML: string }) => emitted.push(element) };
  const context = createContext({
    URL,
    S: { sessions: { run: {} } },
    $: (id: string) => id === 'stream' ? stream : null,
    document: { createElement: () => ({ innerHTML: '', querySelector: () => null }) },
    JSON_LEAK_RE: /^\{\s*\\?"thought/,
    JSON_LEAK_MARKERS: ['{"thought', '{\\"thought'],
    flushStreamText: () => {}, devMode: () => false,
    reportFiles: () => [], reportChecks: () => [], browserHighlight: () => '',
    verificationSection: () => '', qualityMetricsHtml: () => '',
    chipFor: () => '', icon: () => '', setupCopyButton: () => {}, stickScroll: () => {},
  });
  new Script([
    'responseEscape', 'responseLink', 'responseInline', 'responseListItem', 'responseFence',
    'responseBlockStart', 'renderResponseText', 'stripJsonLeak', 'finalizeNarration',
    'parseOutcome', 'readableSummary', 'reportStatusLine', 'reportSideCard', 'appendSummary',
  ].map(source).join('\n') + '\nvar esc = responseEscape;').runInContext(context);
  return { context, emitted };
}

const longResponse = [
  'The activity stream now shows the actual command being executed and explains why it is needed. Each invocation keeps its own output, including repeated verification commands. The disclosure stays available after completion, so the result can be inspected later.',
  'Text arrives progressively in the conversation and keeps its original paragraphs when the response finishes. The todo list can be collapsed without losing the current task or completion count. These changes preserve the details needed to understand what changed, what was checked, and any remaining limitations.',
].join('\n\n');

// Public narration preserves the assistant’s complete explanation. Technical
// telemetry is disclosed separately and protocol objects never become prose.
describe('UI — narration structuring & technical disclosures', () => {
  it('renders telemetry as a collapsed Execution details card, not a meta line', () => {
    expect(UI_HTML).toContain("text.indexOf('telemetry ') === 0");
    expect(UI_HTML).toContain('<b>Execution details</b>');
    expect(UI_HTML).toContain('exec-grid');
    // Counters are parsed into label/value pairs, not echoed raw.
    expect(UI_HTML).toContain("var LABELS = { calls: 'Calls', toolCalls: 'Tool calls'");
  });

  it('finalizes long narration into complete paragraphs without adding a Next footer or checklist', () => {
    const { context } = proseRenderer();
    const attributes: Record<string, string> = {};
    const classes = new Set<string>();
    const text = {
      textContent: longResponse,
      innerHTML: '',
      getAttribute: (name: string) => attributes[name] || null,
      setAttribute: (name: string, value: string) => { attributes[name] = value; },
      classList: { add: (value: string) => classes.add(value) },
    };
    const node = { querySelector: () => text };
    context.finalizeNarration(node);
    expect(text.innerHTML).toBe(longResponse.split('\n\n').map(paragraph => '<p>' + paragraph + '</p>').join(''));
    expect(text.innerHTML).not.toContain('<li>');
    expect(text.innerHTML).not.toContain('Next:');
    expect(classes.has('response-prose')).toBe(true);
    const finalized = text.innerHTML;
    text.textContent = 'A second finalize must leave the rendered response alone.';
    context.finalizeNarration(node);
    expect(text.innerHTML).toBe(finalized);
  });

  it('preserves all sentences and more than 400 characters in both completion views', () => {
    const { context, emitted } = proseRenderer();
    expect(longResponse.length).toBeGreaterThan(400);
    const parsed = context.parseOutcome(longResponse);
    expect(parsed.lede).toBe(longResponse);
    const report = { summary: longResponse, status: 'complete', remainingRisks: [], followUps: [] };
    context.appendSummary('run', { report, goal: 'Improve the conversation', status: 'complete' });
    const expected = '<div class="r-lede response-prose">' + context.renderResponseText(longResponse) + '</div>';
    expect(emitted[0].innerHTML).toContain(expected);
    expect(context.reportSideCard(report)).toContain(expected);
  });

  it('separates legacy change metadata while preserving every sentence before it', () => {
    const { context } = proseRenderer();
    const parsed = context.parseOutcome(longResponse + '\nCHANGES (all inside repo_root): - NEW src/view.ts (400 chars) - UPDATED src/app.ts (800 chars)');
    expect(parsed.lede).toBe(longResponse);
    expect(parsed.changes).toEqual([{ action: 'NEW', path: 'src/view.ts' }, { action: 'UPDATED', path: 'src/app.ts' }]);
  });

  it('formats public prose safely and removes protocol leakage at finalization', () => {
    const { context } = proseRenderer();
    expect(context.renderResponseText('**Complete**\n\nUse `npm test`.\n\n<script>alert(1)</script>')).toBe(
      '<p><strong>Complete</strong></p><p>Use <code>npm test</code>.</p><p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
    const text = {
      textContent: 'Checking the output. {"thought":"internal protocol","action":',
      innerHTML: '',
      getAttribute: () => null, setAttribute: () => {}, classList: { add: () => {} },
    };
    context.finalizeNarration({ querySelector: () => text });
    expect(text.innerHTML).toBe('<p>Checking the output.</p>');
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
    expect(UI_HTML).toContain('verification checks passed');
    expect(UI_HTML).not.toContain('criteria satisfied');
  });

  it('parses the machine change dump into human-phrased changes', () => {
    expect(UI_HTML).toContain('function parseOutcome(summary)');
    expect(UI_HTML).toContain('function reportLede(summary)');
    expect(UI_HTML).toContain('dependency-free static website using vanilla HTML, CSS, and JavaScript');
    expect(UI_HTML).toContain('CHANGE_VERBS');
    expect(UI_HTML).toContain('What Gitu found');
  });

  it('hides all technical evidence behind one collapsed disclosure', () => {
    expect(UI_HTML).toContain('<b>Technical evidence</b>');
    expect(UI_HTML).toContain('telemetryGridHtml(');
    expect(UI_HTML).toContain('qualityMetricsHtml(');
    expect(UI_HTML).toContain('tokens / verified criterion');
  });

  it('rephrases machine counters in the progress header', () => {
    expect(UI_HTML).toContain("' actions · ' + L.evidence.length + ' checks'");
    expect(UI_HTML).toContain("'Plan step ' + done + ' of ' + total");
    expect(UI_HTML).not.toContain("' steps · ' + L.evidence.length + ' checks'");
  });

  it('collapses recovery noise and internal bookkeeping in the timeline', () => {
    // Consecutive recovery strategies group into one row with a repeat chip…
    expect(UI_HTML).toContain("text.indexOf('recovery ') === 0");
    expect(UI_HTML).toContain('sess.nodes.lastRecovery');
    // …and diff-snapshot/checkpoint bookkeeping folds into one disclosure.
    expect(UI_HTML).toContain('<b>Internal activity</b>');
    expect(UI_HTML).toContain("text.indexOf('report ') === 0 || text.indexOf('checkpoint ') === 0");
  });

  it('stamps timeline rows with their event time', () => {
    expect(UI_HTML).toContain("stamp.className = 'tl-time'");
    expect(UI_HTML).toContain('hhmm(ev.t)');
  });

  it('shows the run effort, compact dates, and a two-line blocker clamp', () => {
    expect(UI_HTML).toContain("L.effortPlan.llmEffort");
    expect(UI_HTML).toContain("shortDate(session.startedAt)");
    expect(UI_HTML).toContain("next.classList.toggle('wrapped'");
    expect(UI_HTML).toContain('webkit-line-clamp: 2');
  });
});
