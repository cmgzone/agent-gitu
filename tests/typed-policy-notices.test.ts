import { describe, expect, it } from 'vitest';
import { createContext, Script } from 'node:vm';
import { UI_HTML } from '../src/server/ui.js';

/**
 * The refused-action cards. This family renders from the typed frames the
 * executor emits at the gate that refused the action, because the legacy line
 * cannot carry what the card shows: the structured reason code, and — for three
 * of the five emit sites — the real detail message rather than a summary of it.
 *
 * Extracted and executed like the other UI tests, because the browser bundle is
 * one static string. The slice runs from the label table to appendEvent, so it
 * contains the notice builder, the shared timeline insertion, and the state the
 * repeat counter keeps.
 */
const POLICY_JS = UI_HTML.slice(
  UI_HTML.indexOf('  var POLICY_REASON_LABELS = {'),
  UI_HTML.indexOf('  function appendEvent(runId, ev) {'),
);

/** The minimal DOM surface the slice touches. It parses generated markup. */
class El {
  children: El[] = [];
  parent: El | null = null;
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  className = '';
  text = '';
  title = '';
  id = '';
  attached = false;
  constructor(readonly tag = 'div') {}
  classList = {
    add: (value: string) => {
      this.className += ' ' + value;
    },
    contains: (value: string) => this.className.split(/\s+/).includes(value),
  };
  get isConnected(): boolean {
    return this.attached || !!this.parent?.isConnected;
  }
  get textContent(): string {
    return this.text + this.children.map((child) => child.textContent).join('');
  }
  set textContent(value: string) {
    this.text = value;
    this.children = [];
  }
  set innerHTML(value: string) {
    this.children = [];
    this.text = '';
    const stack: El[] = [this];
    for (const token of value.match(/<[^>]+>|[^<]+/g) || []) {
      if (token.startsWith('</')) {
        stack.pop();
        continue;
      }
      if (!token.startsWith('<')) {
        stack[stack.length - 1]!.text += token;
        continue;
      }
      const tag = /^<(\w+)/.exec(token)?.[1];
      if (!tag) continue;
      const element = new El(tag);
      for (const match of token.matchAll(/([\w-]+)="([^"]*)"/g)) element.setAttribute(match[1]!, match[2]!);
      stack[stack.length - 1]!.appendChild(element);
      if (!['br', 'img', 'input', 'hr'].includes(tag)) stack.push(element);
    }
  }
  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
    if (name === 'class') this.className = value;
  }
  getAttribute(name: string) {
    return this.attributes[name] || null;
  }
  appendChild(child: El) {
    if (child.parent) child.parent.children = child.parent.children.filter((existing) => existing !== child);
    child.parent = this;
    this.children.push(child);
    return child;
  }
  insertBefore(child: El, before: El | null) {
    if (!before) return this.appendChild(child);
    if (child.parent) child.parent.children = child.parent.children.filter((existing) => existing !== child);
    child.parent = this;
    const index = this.children.indexOf(before);
    this.children.splice(index < 0 ? this.children.length : index, 0, child);
    return child;
  }
  matches(selector: string): boolean {
    return selector.startsWith('.') ? this.classList.contains(selector.slice(1)) : this.tag === selector;
  }
  querySelectorAll(selector: string): El[] {
    return this.children.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

type Notice = Record<string, unknown>;

function harness() {
  const stream = new El();
  stream.attached = true;
  const working = new El();
  stream.appendChild(working);
  const session = { nodes: {} as Record<string, unknown> };
  const S = { sessions: { run1: session } as Record<string, unknown> };
  const context = createContext({
    S,
    $: (id: string) => (id === 'stream' ? stream : id === 'working' ? working : null),
    document: { createElement: (tag: string) => new El(tag) },
    esc: (value: unknown) =>
      String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'),
    // The card's own time comes from the frame, which is how a restored notice
    // keeps the moment it happened rather than the moment it was replayed.
    hhmm: (iso: string) => 'stamp:' + iso,
    trimTimeline: () => undefined,
    stickScroll: () => undefined,
  });
  new Script(POLICY_JS).runInContext(context);
  const notice = (typed: Notice, frame?: Notice) => context.applyPolicyNotice('run1', typed, frame ?? { t: '2026-01-01T00:00:00.000Z' });
  return { context, stream, working, session, notice };
}

describe('typed refusal cards', () => {
  it('renders a denial with the reason code, the operation, and the real detail', () => {
    const { stream, working, notice } = harness();
    notice({
      type: 'policy_denied',
      reason: 'project_guard',
      tool: 'read_file',
      operation: 'read_file {"path":"../../outside.txt"}',
      detail: 'DENIED by project boundary: /tmp/outside.txt is outside the workspace',
    });

    const card = stream.querySelector('.tl-policy')!;
    expect(card, 'the frame alone draws the card').toBeTruthy();
    expect(card.textContent).toContain('denied');
    // The code is the fact; the label is how it reads. The legacy line carried
    // neither — it was mapped to a plain log row on purpose.
    expect(card.textContent).toContain('workspace boundary');
    expect(card.querySelector('.policy-op')!.textContent).toContain('../../outside.txt');
    expect(card.querySelector('.policy-tool')!.textContent).toBe('read_file');
    expect(card.querySelector('.policy-detail')!.textContent).toContain('outside the workspace');
    expect(card.querySelector('.tl-time')!.textContent).toBe('stamp:2026-01-01T00:00:00.000Z');
    // Placed like every other timeline node: ahead of the working indicator.
    expect(stream.children.indexOf(card)).toBeLessThan(stream.children.indexOf(working));
  });

  it('renders a block, and says what the loop guard actually decided', () => {
    const { stream, notice } = harness();
    notice({
      type: 'operation_blocked',
      reason: 'loop_detected',
      tool: 'run_command',
      operation: '$ npm test',
      // The prose line said only "loop prevention"; the message is the part the
      // user needs to understand why the agent changed direction.
      detail: 'The same action failed 3 times with the same output.',
    });
    const card = stream.querySelector('.tl-policy')!;
    expect(card.textContent).toContain('blocked');
    expect(card.textContent).toContain('repetition guard');
    expect(card.querySelector('.policy-detail')!.textContent).toContain('failed 3 times');
    // Distinct card styling from a denial, so the two are not read as one thing.
    expect(card.querySelector('.dot-blocked')).toBeTruthy();
  });

  it('cannot render an empty card: an unknown code degrades to its own words', () => {
    const { stream, notice } = harness();
    notice({ type: 'policy_denied', reason: 'some_future_guard', operation: 'write_file' });
    expect(stream.querySelector('.tl-policy')!.textContent).toContain('some future guard');
    // Nothing to say about the detail: no empty block is drawn for it.
    expect(stream.querySelector('.policy-detail')).toBeNull();

    const next = harness();
    next.notice({ type: 'operation_blocked', operation: 'git status' });
    expect(next.stream.querySelector('.tl-policy')!.textContent).toContain('policy');
  });

  it('collapses only consecutive repeats of the same refusal', () => {
    const { context, stream, session, notice } = harness();
    notice({ type: 'policy_denied', reason: 'user_instruction', operation: 'git push', detail: 'You said not to push.' });
    notice({ type: 'policy_denied', reason: 'user_instruction', operation: 'git push', detail: 'You said not to push.' });
    // Repeating one refusal is one line with a count, not a wall of cards.
    expect(stream.querySelectorAll('.tl-policy')).toHaveLength(1);
    expect(stream.querySelector('.repeat-count')!.textContent).toBe('×2');

    // A different refusal is its own card.
    notice({ type: 'policy_denied', reason: 'project_guard', operation: 'read file /etc/hosts' });
    expect(stream.querySelectorAll('.tl-policy')).toHaveLength(2);

    // The same refusal again, but no longer consecutive: something else was
    // drawn in between, so it is a new event rather than a third repetition.
    const other = context.document.createElement('div');
    other.className = 'tl-row';
    context.insertTimelineNode(session, other, undefined);
    notice({ type: 'policy_denied', reason: 'project_guard', operation: 'read file /etc/hosts' });
    expect(stream.querySelectorAll('.tl-policy')).toHaveLength(3);
    expect((session.nodes as { lastPolicy?: { count: number } }).lastPolicy!.count).toBe(1);
  });

  it('counts a restored refusal like any other fact, and dispatches it before the history guard', () => {
    // A refusal stays true of the run forever, so a replayed frame may not be
    // swallowed the way a restored *request* is: there is nothing to answer, so
    // a gate in history is skipped, but a fact in history is still shown.
    const { stream, notice } = harness();
    notice({ type: 'policy_denied', reason: 'edit_pressure', operation: 'write src/a.ts', detail: 'No passing evidence yet.' }, {
      t: '2026-01-01T00:00:05.000Z',
      restored: true,
    });
    // Drawn from history exactly as from a live frame, and stamped with the
    // moment it happened rather than the moment it was replayed.
    const card = stream.querySelector('.tl-policy');
    expect(card).toBeTruthy();
    expect(card!.querySelector('.policy-detail')!.textContent).toContain('No passing evidence yet.');
    expect(card!.querySelector('.tl-time')!.textContent).toBe('stamp:2026-01-01T00:00:05.000Z');
    // History arrives without the entrance animation, like any replayed row.
    expect(card!.classList.contains('replayed')).toBe(true);

    const policyAt = UI_HTML.indexOf("typed.type === 'policy_denied'");
    const historyGuard = UI_HTML.indexOf('if (frame.restored) return;');
    expect(policyAt).toBeGreaterThan(-1);
    expect(historyGuard).toBeGreaterThan(-1);
    expect(policyAt).toBeLessThan(historyGuard);
  });
});
