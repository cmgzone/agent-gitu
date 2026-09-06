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
  get textContent(): string { return this.text + this.children.map(child => child.textContent).join(''); }
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
  appendChild(child: Element) { child.parent = this; this.children.push(child); return child; }
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
  const context = createContext({
    S: { sessions: { run: session } },
    $: (id: string) => id === 'stream' ? stream : null,
    document: { createElement: (tag: string) => new Element(tag) },
    updateApproach: () => {}, mascotState: () => {}, mascotPulse: () => {},
    closeThought: () => {}, setWorking: () => {}, trimTimeline: () => {}, stickScroll: () => {},
    setupCopyButton: () => {}, icon: () => '',
    setupOutputFolding: (_details: Element, pre: Element, value: string) => { pre.textContent = value; },
    esc: (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
  });
  const functions = ['toolKind', 'humanToolSummary', 'splitSummary', 'splitReason', 'workingTextFor',
    'toolActivityGroupForRow', 'toolActivityHint', 'refreshToolActivityGroup', 'sealToolActivityGroup',
    'createToolActivityGroup', 'ensureToolActivityGroup', 'toolActivityBoundary', 'appendEvent',
    'normalizeToolKey', 'activeToolRows', 'findToolRow'];
  // The two tiny split helpers share a line; their declarations are exact.
  const code = functions.map(name => name === 'splitSummary' || name === 'splitReason'
    ? UI_HTML.match(new RegExp('  function ' + name + '\\([^\\n]+'))![0] : source(name)).join('\n');
  new Script(code).runInContext(context);
  return {
    stream, session, context,
    event: (i: number, text: string) => context.appendEvent('run', { i, text }),
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
});
