import { Script, createContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { UI_HTML } from '../src/server/ui.js';

function source(name: string) {
  const declaration = new RegExp('^( +)function ' + name + '\\(', 'm').exec(UI_HTML)!;
  const start = declaration.index;
  const end = UI_HTML.indexOf('\n' + declaration[1] + '}', start);
  return UI_HTML.slice(start, end + declaration[1].length + 2);
}

// Minimal DOM surface used by the actual activity renderer. It parses its
// generated markup, so selectors and disclosure wiring are exercised too.
class Element {
  children: Element[] = [];
  parent: Element | null = null;
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  listeners: Record<string, () => void> = {};
  className = '';
  text = '';
  id = '';
  title = '';
  open = false;
  attached = false;
  onclick?: (event: { stopPropagation: () => void }) => void;
  constructor(readonly tag = 'div') {}
  classList = {
    add: (value: string) => { this.className += ' ' + value; },
    contains: (value: string) => this.className.split(/\s+/).includes(value),
  };
  get isConnected(): boolean { return this.attached || !!this.parent?.isConnected; }
  // DOM order is children interleaved with this node's own text runs, but the
  // naive parser in innerHTML cannot interleave (a text run after </b> lands in
  // this.text). Appending this.text last keeps real DOM order for the shapes
  // these tests create.
  get textContent(): string { return this.children.map(child => child.textContent).join('') + this.text; }
  set textContent(value: string) { this.text = value; this.children = []; }
  set innerHTML(value: string) {
    this.children = []; this.text = '';
    const stack: Element[] = [this];
    for (const token of value.match(/<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('</')) { stack.pop(); continue; }
      if (!token.startsWith('<')) { stack[stack.length - 1].text += token; continue; }
      const tag = /^<(\w+)/.exec(token)?.[1];
      if (!tag) continue;
      const element = new Element(tag);
      for (const match of token.matchAll(/([\w-]+)="([^"]*)"/g)) element.setAttribute(match[1], match[2]);
      stack[stack.length - 1].appendChild(element);
      if (!['br', 'img', 'input', 'hr'].includes(tag)) stack.push(element);
    }
  }
  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
    if (name === 'class') this.className = value;
  }
  getAttribute(name: string) { return this.attributes[name] || null; }
  addEventListener(event: string, listener: () => void) { this.listeners[event] = listener; }
  appendChild(child: Element) {
    if (child.parent) child.parent.children = child.parent.children.filter(existing => existing !== child);
    child.parent = this; this.children.push(child); return child;
  }
  insertBefore(child: Element, before: Element | null) {
    if (!before) return this.appendChild(child);
    if (child.parent) child.parent.children = child.parent.children.filter(existing => existing !== child);
    child.parent = this;
    const index = this.children.indexOf(before);
    this.children.splice(index < 0 ? this.children.length : index, 0, child);
    return child;
  }
  matches(selector: string): boolean {
    const attr = /\[data-tool-state="([^"]+)"\]/.exec(selector);
    if (attr && this.dataset.toolState !== attr[1]) return false;
    selector = selector.replace(/\[.*?\]/g, '');
    return selector.startsWith('.') ? this.classList.contains(selector.slice(1)) : this.tag === selector;
  }
  querySelectorAll(selector: string): Element[] {
    if (selector.startsWith(':scope > ')) return this.children.filter(child => child.matches(selector.slice(9)));
    const split = selector.split(' > ');
    if (split.length > 1) return this.querySelectorAll(split[0]).flatMap(parent => parent.children.filter(child => child.matches(split[1])));
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector: string) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector: string): Element | null { return this.matches(selector) ? this : this.parent?.closest(selector) || null; }
}

function renderer() {
  const stream = new Element(); stream.attached = true;
  const session = { nodes: {} as { toolRows?: Element[]; parallelPending?: boolean; toolGroup?: { el: Element } } };
  let narrationClosures = 0;
  const context = createContext({
    S: { sessions: { run: session } },
    $: (id: string) => id === 'stream' ? stream : null,
    document: { createElement: (tag: string) => new Element(tag) },
    updateApproach: () => {}, mascotState: () => {}, mascotPulse: () => {},
    closeThought: () => { narrationClosures++; }, setWorking: () => {}, trimTimeline: () => {}, stickScroll: () => {},
    hhmm: (iso: string) => 'T' + iso,
    // No intake or specialist tag matches here; falling through to the generic
    // meta block is what exercises the evidence row the stamp test uses.
    INTAKE_TAGS: {} as Record<string, boolean>,
    // Tests run as a normal user (devMode false): the recovering arm renders
    // its calm card instead of falling through to the raw diagnostic line.
    devMode: () => false,
    SPEC_LIFECYCLE: /(?!)/,
    // Client global the recall pool sizes itself against during replay.
    MAX_REPLAY_EVENTS: 240,
    setupCopyButton: () => {}, icon: () => '',
    setupOutputFolding: (_details: Element, pre: Element, value: string) => { pre.textContent = value; },
    esc: (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  });
  const functions = ['toolKind', 'humanToolSummary', 'splitSummary', 'splitReason', 'workingTextFor',
    'toolActivityGroupForRow', 'toolActivityHint', 'refreshToolActivityGroup', 'sealToolActivityGroup',
    'createToolActivityGroup', 'ensureToolActivityGroup', 'followActiveToolActivity', 'toolActivityBoundary', 'appendEvent',
    'normalizeToolKey', 'activeToolRows', 'findToolRow',
    // Tool-lifecycle matching was hoisted out of appendEvent so the typed
    // command frames can share it; the prose path now calls these top-level too.
    'terminalToolSummary', 'applyToolOutcome', 'finishToolCard', 'finishToolRow',
    // Timeline insertion is shared the same way: the prose row and the typed
    // refusal card must land in the same place, in the same way.
    'insertTimelineNode',
    // The frame path that upgrades finished cards with the exit fact. It runs
    // to the gate renderers, which need their own state readers; stubbing the
    // renderers keeps this harness on the command lifecycle.
    'handleTypedFrame', 'applyCommandFinish', 'normalizeToolKey', 'applyPolicyNotice',
    // The recovering arm truncates the cause for the working indicator.
    'shortText',
    'pendingApprovalsFor', 'pendingPlanReviewFor', 'pendingQuestionsFor'];
  context.renderApprovals = () => undefined;
  context.renderPlanReview = () => undefined;
  context.renderQuestions = () => undefined;
  // The two tiny split helpers share a line; their declarations are exact.
  const code = functions.map(name => name === 'splitSummary' || name === 'splitReason'
    ? UI_HTML.match(new RegExp('  function ' + name + '\\([^\\n]+'))![0] : source(name)).join('\n');
  new Script(code).runInContext(context);
  return {
    stream, session, context, narrationClosures: () => narrationClosures,
    event: (i: number, text: string, t?: string, typed?: Record<string, unknown>) =>
      context.appendEvent('run', { i, text, ...(t ? { t } : {}), ...(typed ? { typed } : {}) }),
    rows: () => stream.querySelectorAll('.tool-call'),
    group: () => stream.querySelector('.tl-tool-group')!,
  };
}

describe('UI — parallel tool lifecycle', () => {
  it('shows the exact active command and reason, then advances as parallel calls finish', () => {
    const r = renderer();
    r.event(0, 'parallel inspect source and run checks');
    r.event(1, 'run read src/server/ui.ts — Locate the activity renderer');
    r.event(2, 'run $ npm test — Verify the updated interactions');
    // The parallel phase and each run command close the previous narration,
    // so newer streamed prose never grows above active activity.
    expect(r.narrationClosures()).toBe(3);
    expect(r.stream.querySelectorAll('.tl-tool-group')).toHaveLength(1);
    expect(r.group().querySelector('.tool-group-title')!.textContent).toBe('Reading src/server/ui.ts');
    expect(r.group().querySelector('.tool-group-hint')!.textContent).toBe('Locate the activity renderer');
    expect(r.group().querySelector('.tool-group-state')!.textContent).toBe('2 running');
    expect(r.group().querySelector('.tool-group-details')!.open).toBe(false);
    r.event(3, 'ok read src/server/ui.ts (120ms)');
    expect(r.group().querySelector('.tool-group-title')!.textContent).toBe('Running npm test');
    expect(r.group().querySelector('.tool-group-hint')!.textContent).toBe('Verify the updated interactions');
    expect(r.group().querySelector('.tool-group-state')!.textContent).toBe('');
    r.event(4, 'ok $ npm test (1500ms)');
    expect(r.group().dataset.toolGroupState).toBe('complete');
    expect(r.group().querySelector('.tool-group-title')!.textContent).toBe('Ran npm test');
    expect(r.group().querySelector('.tool-group-count')!.textContent).toBe('2 activities');
  });

  it('ignores replayed event IDs while repeated real commands retain independent outputs and disclosures', () => {
    const r = renderer();
    r.event(0, 'run $ npm test — First verification');
    r.event(0, 'run $ npm test — First verification');
    r.event(1, 'run $ npm test — Verify after the follow-up edit');
    expect(r.rows()).toHaveLength(2);
    const [first, second] = r.rows();
    r.event(2, 'ok $ npm test (25ms)');
    r.event(3, 'out First run: 12 tests passed');
    expect(first.dataset.toolState).toBe('done');
    expect(second.dataset.toolState).toBe('working');
    r.event(4, 'ok $ npm test (30ms)');
    r.event(5, 'out Second run: 14 tests passed');
    r.event(3, 'out First run: 12 tests passed');
    expect(first.querySelector('pre')!.textContent).toBe('First run: 12 tests passed');
    expect(second.querySelector('pre')!.textContent).toBe('Second run: 14 tests passed');
    const button = second.querySelector('.tool-call-head')!;
    const disclosure = second.querySelector('.tl-out')!;
    expect(button.getAttribute('aria-controls')).toBe(disclosure.id);
    expect(disclosure.id).not.toBe(first.querySelector('.tl-out')!.id);
    button.onclick!({ stopPropagation: () => {} });
    expect(disclosure.open).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(first.querySelector('.tl-out')!.open).toBe(false);
    disclosure.open = false; disclosure.listeners.toggle();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps a live activity line beside the newest narration without moving completed evidence', () => {
    const r = renderer();
    r.event(0, 'run read src/ui.ts');
    const group = r.group();
    const narration = new Element('div');
    narration.className = 'tl-note-row';
    r.stream.appendChild(narration);
    r.context.followActiveToolActivity(r.stream, r.session);
    expect(r.stream.children.at(-1)).toBe(group);

    r.event(1, 'ok read src/ui.ts (10ms)');
    const newerNarration = new Element('div');
    newerNarration.className = 'tl-note-row';
    r.stream.appendChild(newerNarration);
    r.context.followActiveToolActivity(r.stream, r.session);
    expect(r.stream.children.at(-1)).toBe(newerNarration);
  });

  it('correlates an exact command before a shorter overlapping command and leaves ambiguous hints unmatched', () => {
    const r = renderer();
    r.event(0, 'run $ npm test');
    r.event(1, 'run $ npm test -- ui');
    r.event(2, 'run read src/ui.ts');
    expect(r.context.findToolRow(r.session, 'npm test', false)).toBe(r.rows()[0]);
    expect(r.context.findToolRow(r.session, 'npm test -- ui', false)).toBe(r.rows()[1]);
    expect(r.context.findToolRow(r.session, 'npm', false)).toBeNull();
    r.event(3, 'ok $ npm test -- ui (10ms)');
    expect(r.rows()[0].dataset.toolState).toBe('working');
    expect(r.rows()[1].dataset.toolState).toBe('done');
    expect(r.context.findToolRow(r.session, 'src/ui.ts', false)).toBe(r.rows()[2]);
  });

  it('keeps failures visible in the group and opens the failed call output', () => {
    const r = renderer();
    r.event(0, 'run $ npm test');
    r.event(1, 'error $ npm test (5ms)');
    r.event(2, 'out Assertion failed');
    expect(r.group().dataset.toolGroupState).toBe('attention');
    expect(r.group().querySelector('.tool-group-state')!.textContent).toBe('Needs attention');
    expect(r.rows()[0].querySelector('.tl-out')!.open).toBe(true);
    expect(r.rows()[0].querySelector('pre')!.textContent).toBe('Assertion failed');
  });

  it('renders evidence pills from the typed companion and falls back to the prose parse', () => {
    // The typed companion carries the real verdict, the id, and the kind as
    // separate fields; the prose line is the fallback for rows without one.
    const r = renderer();
    // Typed row: a passing line whose LABEL contains FAIL would fool a substring
    // check — the pill must come from the structured verdict.
    r.event(0, 'evidence ev-1 PASS (test)', '2026-01-01T12:00:00.000Z', { type: 'evidence_recorded', evidenceId: 'ev-1', passed: true, kind: 'test' });
    let pill = r.stream.querySelector('.ev-pill');
    expect(pill.classList.contains('pass')).toBe(true);
    // The check/cross rides the pill as an HTML entity (innerHTML), so match
    // the entity rather than the decoded glyph.
    expect(pill.textContent).toContain('&#10003;');
    expect(pill.textContent).toContain('test ev-1 passed');
    expect(pill.textContent).not.toContain('(test)');

    // Typed failing row.
    r.event(1, 'evidence ev-2 FAIL (typecheck)', undefined, { type: 'evidence_recorded', evidenceId: 'ev-2', passed: false, kind: 'typecheck' });
    const pills = r.stream.querySelectorAll('.ev-pill');
    pill = pills[pills.length - 1];
    expect(pill.classList.contains('fail')).toBe(true);
    expect(pill.textContent).toContain('&#10005;');
    expect(pill.textContent).toContain('typecheck ev-2 failed');

    // Untyped row (old database, or a line the classifier demoted): the prose
    // parse must still decide the pill.
    r.event(2, 'evidence ev-3 FAIL (build)');
    pill = r.stream.querySelectorAll('.ev-pill')[2];
    expect(pill.classList.contains('fail')).toBe(true);
    expect(pill.textContent).toContain('FAIL');
    r.event(3, 'evidence ev-4 PASS (lint)');
    pill = r.stream.querySelectorAll('.ev-pill')[3];
    expect(pill.classList.contains('pass')).toBe(true);

    // Typed decides where prose is unreliable: the legacy classifier needs the
    // PASS/FAIL token in a fixed shape, so a future emitter that changes the
    // line's wording would demote it to log — the companion still renders the
    // verdict pill. (Also: the prose parse cannot be trusted to read a verdict
    // out of free text, as the id itself could contain the token.)
    r.event(4, 'evidence', undefined, { type: 'evidence_recorded', evidenceId: 'ev-5', passed: true, kind: 'command' });
    pill = r.stream.querySelectorAll('.ev-pill')[4];
    expect(pill.classList.contains('pass')).toBe(true);
    expect(pill.textContent).toContain('command ev-5 passed');
  });

  it('renders plan rows from the typed companion and falls back to the prose parse', () => {
    const r = renderer();
    r.event(0, 'plan     3 steps', undefined, { type: 'plan_created', steps: 3 });
    let row = r.stream.querySelectorAll('.tl-meta')[0];
    expect(row.textContent).toContain('plan 3 steps — review it, then approve to build');

    // The follow-up distinction is prose-only today; the fallback must keep it.
    r.event(1, 'plan     2 follow-up steps');
    row = r.stream.querySelectorAll('.tl-meta')[1];
    expect(row.textContent).toContain('plan 2 follow-up steps');

    // Singular. The typed companion must decide when prose is unreliable — a
    // future emitter may stop padding the keyword to a fixed column, which
    // would leave the legacy classifier's regex nothing to match.
    r.event(2, 'plan 1 steps', undefined, { type: 'plan_created', steps: 1 });
    row = r.stream.querySelectorAll('.tl-meta')[2];
    expect(row.textContent).toContain('plan 1 step —');
    // And a row whose prose carries no count at all still renders from the
    // companion rather than saying "0 steps".
    r.event(3, 'plan', undefined, { type: 'plan_created', steps: 7 });
    row = r.stream.querySelectorAll('.tl-meta')[3];
    expect(row.textContent).toContain('plan 7 steps —');
  });

  it('stamps an inserted row with its own event time', () => {
    // The timeline stamp moved into the shared inserter when the typed cards
    // began to use it too, so this proves the prose path still stamps rows —
    // the insert call and the stamp now live in different functions.
    const r = renderer();
    r.event(0, 'evidence ev-20260101-abc123 PASS verification passed', '2026-01-01T12:34:00.000Z');
    expect(r.stream.querySelector('.tl-time')!.textContent).toBe('T2026-01-01T12:34:00.000Z');
  });

  it('badges every restored command the replay rebuilt, not just the last twelve', () => {
    // On restore, rows replay first and frames arrive right after. The recall
    // pool the finish frames consult must span the whole visible window — a
    // 12-entry cap left every earlier restored command without its exit badge.
    const r = renderer();
    const commands = 40;
    // The client holds sess.replaying true across the whole replay burst, as
    // openStream does; the pool size keys off that flag.
    r.session.replaying = true;
    for (let i = 0; i < commands; i++) {
      r.event(i * 2, `run $ node cmd-${i}.js`);
      r.event(i * 2 + 1, `ok $ node cmd-${i}.js (10ms)`);
    }
    r.session.replaying = false;
    // All 40 rows replayed, none still working.
    expect(r.rows()).toHaveLength(commands);
    expect(r.rows().every((row) => row.dataset.toolState === 'done')).toBe(true);

    // The frames arrive, in order, after the replay.
    for (let i = 0; i < commands; i++) {
      r.context.handleTypedFrame('run', { seq: 1000 + i, t: 't', typed: { type: 'command_finished', command: `node cmd-${i}.js`, ok: true, exitCode: 0 } });
    }
    const badged = r.rows().filter((row) => row.querySelector('.exit-code'));
    expect(badged, `all ${commands} commands deserve their exit badge`).toHaveLength(commands);
  });

  it('renders recovering cards from the typed companion and falls back to the prose line', () => {
    // A model retry is the moment the agent notices a failure and corrects it;
    // the run is neither frozen nor repeating itself. The typed companion
    // carries the attempt, the max, and the real cause; the prose line is the
    // fallback for rows without one (old databases, demoted classifications).
    const r = renderer();
    // Typed row: retry numbers from the payload, not the text.
    r.event(0, 'recover  model reply was malformed — retry 2/3 in 1.0s', undefined, { type: 'recovering', message: 'model reply was malformed', attempt: 2, maxAttempts: 3 });
    let row = r.stream.querySelectorAll('.tl-meta')[0];
    expect(row.textContent).toContain('recovering');
    expect(row.textContent).toContain('retry 2 of 3');
    expect(row.textContent).toContain('model reply was malformed');

    // Typed row whose prose carries no retry count: the companion decides.
    // (Distinct cause — a same-cause retry would collapse into the card above.)
    r.event(1, 'recover  something failed', undefined, { type: 'recovering', message: 'something failed', attempt: 1, maxAttempts: 4 });
    row = r.stream.querySelectorAll('.tl-meta')[1];
    expect(row.textContent).toContain('retry 1 of 4');

    // The reason text lives on the payload; prose can be vague.
    r.event(2, 'recover  failed — retry 3/4', undefined, { type: 'recovering', message: 'the real reason: provider 500', attempt: 3, maxAttempts: 4 });
    row = r.stream.querySelectorAll('.tl-meta')[2];
    expect(row.textContent).toContain('the real reason: provider 500');

    // Malformed/short prose still renders correctly from typed data: the tag
    // prefix matches but the line has no usable detail after it.
    r.event(3, 'recover  ', undefined, { type: 'recovering', message: 'bad reply shape', attempt: 2, maxAttempts: 5 });
    row = r.stream.querySelectorAll('.tl-meta')[3];
    expect(row.textContent).toContain('retry 2 of 5');
    expect(row.textContent).toContain('bad reply shape');

    // Consecutive retries of the same cause collapse in place, escalating the
    // retry numbers (1/4 then 2/4) instead of stacking cards.
    r.event(4, 'recover  provider 500 — retry 1/4 in 1.0s', undefined, { type: 'recovering', message: 'provider 500', attempt: 1, maxAttempts: 4 });
    r.event(5, 'recover  provider 500 — retry 2/4 in 2.0s', undefined, { type: 'recovering', message: 'provider 500', attempt: 2, maxAttempts: 4 });
    const metas = r.stream.querySelectorAll('.tl-meta');
    expect(metas.length).toBe(5); // no sixth card — event 5 collapsed into event 4's
    const coll = metas[4];
    expect(coll.textContent).toContain('retry 2 of 4');
    expect(coll.textContent).toContain('\u00D72');

    // A different cause starts a new card even when it is also a retry.
    r.event(6, 'recover  other cause — retry 1/3', undefined, { type: 'recovering', message: 'other cause', attempt: 1, maxAttempts: 3 });
    expect(r.stream.querySelectorAll('.tl-meta').length).toBe(6);
  });

  it('renders untyped recover rows from prose without fabricating structure', () => {
    // Untyped rows (old restored databases) have no counts to render as the
    // structured numbers — the fallback shows the raw line as the cause and
    // must not re-parse prose into the typed card's "retry N of M" shape.
    const r = renderer();
    r.event(0, 'recover  something failed — retry 2/3 in 1.0s');
    const row = r.stream.querySelectorAll('.tl-meta')[0];
    expect(row.textContent).toContain('recovering');
    expect(row.textContent).toContain('something failed — retry 2/3 in 1.0s');
    // No fabricated numbers: the retry phrase survives only as raw detail.
    expect(row.querySelector('.recover-nums')).toBeNull();
  });

  it('leaves a refused action to its typed frame instead of drawing a prose card', () => {
    // A refusal is decided in preflight, before the run row that creates a card,
    // so the legacy line has never rendered anything: it is the typed
    // policy_denied/operation_blocked frame that draws the family's card. This
    // pins that split, so the frame can never become a second rendering of a row
    // that already drew one.
    const r = renderer();
    r.event(0, 'run read_file {"path":"../../outside.txt"} — inspect');
    const drawn = r.stream.children.length;
    r.event(1, 'denied   read_file {"path":"../../outside.txt"} (DENIED by project boundary: outside the workspace)');
    expect(r.stream.children.length).toBe(drawn);
    // And the active card is untouched — an unmatched refusal must not close an
    // unrelated working tool.
    expect(r.rows()[0].dataset.toolState).toBe('working');
    expect(r.rows()[0].querySelector('.st')!.textContent).not.toContain('denied');
  });
});
