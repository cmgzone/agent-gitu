import { createContext, Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { SUBAGENT_JS } from '../src/server/ui-subagents.js';
import { CHARACTER_JS } from '../src/server/ui-characters.js';
import { UI_HTML } from '../src/server/ui.js';

import { Element } from './helpers/subagent-dom.js';

function renderer() {
  const body = new Element(); body.attached = true;
  const session = { nodes: {} as { subagentPresence?: { view: { jobs: Record<string, { button: Element; activity: { text: string }[] }>; dispose: () => void } } }, replaying: false };
  const timers = new Set<() => void>();
  const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const context = createContext({
    S: { sessions: { run: session } }, esc, icon: () => '<svg></svg>',
    document: { body, createElement: (tag: string) => new Element(tag), addEventListener: () => {}, removeEventListener: () => {} },
    window: { innerWidth: 375, innerHeight: 812, addEventListener: () => {}, removeEventListener: () => {} },
    setInterval: (fn: () => void) => { timers.add(fn); return fn; }, clearInterval: (fn: () => void) => timers.delete(fn),
    setTimeout: () => 1, clearTimeout: () => {},
  });
  const source = (name: string) => {
    const match = new RegExp('^( +)function ' + name + '\\(', 'm').exec(UI_HTML)!;
    const end = UI_HTML.indexOf('\n' + match[1] + '}', match.index);
    return UI_HTML.slice(match.index, end + match[1].length + 2);
  };
  new Script(CHARACTER_JS + SUBAGENT_JS + ['specialistPresence', 'applySubagentState'].map(source).join('\n')).runInContext(context);
  const apply = context.applySubagentState as (run: string, insert: (node: Element) => void, event: string) => void;
  return { body, session, timers, send: (data: Record<string, unknown>) => apply('run', node => body.appendChild(node), 'subagent-state ' + JSON.stringify(data)) };
}

function helpers() {
  const context = createContext({});
  new Script(SUBAGENT_JS).runInContext(context);
  return context as {
    subagentPhase: (state: string) => string;
    subagentElapsed: (start: string | undefined, finish: string | undefined, now: number) => string;
    subagentContext: (tokens?: number) => string;
    subagentCounts: (jobs: { phase?: string; status?: string }[]) => string;
  };
}

describe('subagent presence semantics', () => {
  const ui = helpers();
  it('keeps live phases distinct and reads legacy lifecycle history', () => {
    for (const phase of ['working', 'reasoning', 'tool', 'waiting', 'blocked', 'complete', 'failed', 'idle', 'cancelled']) {
      expect(ui.subagentPhase(phase)).toBe(phase);
    }
    expect(ui.subagentPhase('running')).toBe('working');
    expect(ui.subagentPhase('queued')).toBe('waiting');
    expect(ui.subagentPhase('completed')).toBe('complete');
    expect(ui.subagentPhase('paused')).toBe('blocked');
    expect(ui.subagentPhase('unrecognized')).toBe('idle');
    expect(ui.subagentPhase('constructor')).toBe('idle');
  });
  it('freezes elapsed time at finish and never fabricates missing timing', () => {
    const start = '2026-10-07T10:00:00Z';
    const now = Date.parse('2026-10-07T10:02:12Z');
    expect(ui.subagentElapsed(start, undefined, now)).toBe('2m 12s');
    expect(ui.subagentElapsed(start, '2026-10-07T10:00:42Z', now)).toBe('42s');
    expect(ui.subagentElapsed(undefined, undefined, now)).toBe('—');
    expect(ui.subagentElapsed(start, undefined, Date.parse(start) - 1)).toBe('0s');
  });
  it('identifies estimated context and distinguishes missing context from zero', () => {
    expect(ui.subagentContext(18400)).toBe('≈18.4k tokens');
    expect(ui.subagentContext(0)).toBe('≈0 tokens');
    expect(ui.subagentContext()).toBe('Not reported');
    expect(ui.subagentContext(-10)).toBe('Not reported');
  });
  it('never counts blocked or failed specialists as completed', () => {
    expect(ui.subagentCounts([{ status: 'completed' }, { phase: 'blocked' }, { phase: 'reasoning' }, { phase: 'failed' }, { phase: 'cancelled' }]))
      .toBe('1 active · 1 done · 2 need attention · 1 inactive');
    expect(ui.subagentCounts([{ status: 'completed' }, { status: 'completed' }])).toBe('2 done');
  });
});

describe('keyed specialist interaction', () => {
  it('preserves orb and ring nodes during phase updates and separates same-name workers', () => {
    const ui = renderer();
    ui.send({ id: 'one', name: 'Reviewer', phase: 'working', task: 'Review code' });
    ui.send({ id: 'two', name: 'Reviewer', phase: 'waiting', task: 'Review accessibility' });
    const first = ui.session.nodes.subagentPresence!.view.jobs.one.button;
    const ring = first.querySelector('.subagent-ring');
    ui.send({ id: 'one', name: 'Reviewer', phase: 'tool', current: 'Inspect code' });
    expect(ui.body.querySelectorAll('.subagent-orb')).toHaveLength(2);
    expect(ui.session.nodes.subagentPresence!.view.jobs.one.button).toBe(first);
    expect(first.querySelector('.subagent-ring')).toBe(ring);
    expect(first.dataset.phase).toBe('tool');
    expect(ui.session.nodes.subagentPresence!.view.jobs.two.button.dataset.phase).toBe('waiting');
    ui.session.nodes.subagentPresence!.view.dispose();
  });
  it('opens details, then the live activity trace, and disposes timers on close', () => {
    const ui = renderer();
    ui.send({ id: 'one', name: 'Researcher', phase: 'reasoning', task: 'Compare prices', contextTokens: 18400, activity: 'Started' });
    const button = ui.session.nodes.subagentPresence!.view.jobs.one.button;
    button.onfocus!();
    expect(ui.body.querySelector('.subagent-peek')!.textContent).toContain('Compare prices');
    expect(ui.body.querySelector('.subagent-peek')!.textContent).toContain('≈18.4k tokens');
    button.onclick!(); button.onclick!();
    const dialog = ui.body.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    ui.send({ id: 'one', name: 'Researcher', current: 'Comparing annual plans', activity: 'Read annual pricing' });
    expect(dialog.querySelector('ol')!.textContent).toContain('Read annual pricing');
    expect(dialog.querySelector('.subagent-context')!.textContent).toContain('Comparing annual plans');
    dialog.close();
    expect(ui.body.querySelector('dialog')).toBeNull();
    expect(ui.body.querySelector('.subagent-peek')!.hidden).toBe(true);
    expect(ui.timers.size).toBe(0);
    ui.session.nodes.subagentPresence!.view.dispose();
  });
  it('keeps historical terminal animations suppressed and escapes text in details', () => {
    const ui = renderer(); ui.session.replaying = true;
    ui.send({ id: 'one', name: '<script>bad</script>', phase: 'complete', task: '<img onerror=bad>', finishedAt: '2026-10-07T10:00:42Z' });
    const button = ui.session.nodes.subagentPresence!.view.jobs.one.button;
    expect(button.dataset.restored).toBe('true');
    button.onfocus!();
    const peek = ui.body.querySelector('.subagent-peek')!;
    expect(peek.querySelector('script')).toBeNull(); expect(peek.querySelector('img')).toBeNull();
    expect(peek.textContent).toContain('&lt;script&gt;');
    ui.session.nodes.subagentPresence!.view.dispose();
    expect(ui.body.querySelector('.subagent-peek')).toBeNull();
  });
});
