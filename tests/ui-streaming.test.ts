import { describe, expect, it } from 'vitest';
import { Script, createContext } from 'node:vm';
import { UI_MOTION_JS } from '../src/server/ui-motion.js';
import { UI_HTML } from '../src/server/ui.js';

class TextElement {
  children: TextElement[] = [];
  parent: TextElement | null = null;
  value = '';
  isConnected = true;
  classes = new Set<string>();
  className = '';
  classList = { add: (s: string) => this.classes.add(s), remove: (s: string) => this.classes.delete(s) };
  get textContent(): string { return this.value + this.children.map(c => c.textContent).join(''); }
  set textContent(s: string) { this.value = s; this.children = []; }
  appendData(s: string) { this.value += s; }
  appendChild(c: TextElement) { c.parent = this; this.children.push(c); return c; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
}

function renderer() {
  let now = 0, next = 0;
  const frames = new Map<number, (time: number) => void>();
  const listeners: Record<string, () => void> = {};
  const preference = { matches: false, addEventListener: (_: string, fn: () => void) => { listeners.motion = fn; } };
  const document = {
    hidden: false,
    createTextNode: (s: string) => { const n = new TextElement(); n.textContent = s; return n; },
    createElement: () => new TextElement(),
    addEventListener: (event: string, fn: () => void) => { listeners[event] = fn; },
  };
  const context = createContext({
    window: { matchMedia: () => preference }, document, performance: { now: () => now },
    requestAnimationFrame: (fn: (time: number) => void) => { frames.set(++next, fn); return next; },
    cancelAnimationFrame: (id: number) => frames.delete(id), $: () => null,
  });
  new Script(UI_MOTION_JS).runInContext(context);
  return {
    frames, preference, document, listeners,
    sink: new TextElement(),
    queue: (sink: TextElement, chunk: string, instant = false) => context.queueStreamText(sink, chunk, instant),
    flush: (sink: TextElement) => context.flushStreamText(sink),
    frame: (ms: number) => {
      now += ms;
      const callbacks = [...frames.values()]; frames.clear();
      callbacks.forEach(fn => fn(now));
    },
  };
}

describe('UI streaming renderer', () => {
  it('ships valid JavaScript in the actual HTML template', () => {
    const script = UI_HTML.match(/<script>([\s\S]*?)<\/script>/)![1];
    expect(() => new Script(script)).not.toThrow();
  });

  it('coalesces provider deltas into one frame and preserves exact text on completion', () => {
    const r = renderer();
    ['Hello ', '<script>alert(1)</script>', '\n世界 👩‍💻'].forEach(s => r.queue(r.sink, s));
    expect(r.frames.size).toBe(1);
    expect(r.sink.textContent).toBe('');
    r.flush(r.sink);
    expect(r.sink.textContent).toBe('Hello <script>alert(1)</script>\n世界 👩‍💻');
    expect(r.frames.size).toBe(0);
    expect(r.sink.children.length).toBe(1);
  });

  it('reveals bursts progressively and catches up within 180ms', () => {
    const r = renderer(), text = 'A quick sentence. '.repeat(500);
    r.queue(r.sink, text);
    r.frame(16);
    expect(r.sink.textContent.length).toBeGreaterThan(0);
    expect(r.sink.textContent.length).toBeLessThan(text.length);
    r.frame(180);
    expect(r.sink.textContent).toBe(text);
    expect(r.frames.size).toBe(0);
  });

  it('keeps long responses to a text node and one animated tail', () => {
    const r = renderer();
    for (let i = 0; i < 1000; i++) {
      r.queue(r.sink, 'word ');
      r.frame(32);
      expect(r.sink.children.length).toBeLessThanOrEqual(2);
    }
    r.flush(r.sink);
    expect(r.sink.textContent).toBe('word '.repeat(1000));
    expect(r.sink.classes.has('text-streaming')).toBe(false);
  });

  it('renders replay, reduced motion, and background-tab content immediately', () => {
    for (const mode of ['replay', 'motion', 'hidden']) {
      const r = renderer();
      r.preference.matches = mode === 'motion';
      r.document.hidden = mode === 'hidden';
      r.queue(r.sink, 'Complete history', mode === 'replay');
      expect(r.sink.textContent).toBe('Complete history');
      expect(r.frames.size).toBe(0);
    }
  });

  it('flushes pending text when motion preference changes or the tab is hidden', () => {
    const r = renderer();
    r.queue(r.sink, 'Pending text');
    r.document.hidden = true;
    r.listeners.visibilitychange();
    expect(r.sink.textContent).toBe('Pending text');
    r.document.hidden = false;
    r.queue(r.sink, ' and more');
    r.preference.matches = true;
    r.listeners.motion();
    expect(r.sink.textContent).toBe('Pending text and more');
    expect(r.frames.size).toBe(0);
  });

  it('does not split emoji surrogate pairs at the reveal boundary', () => {
    const r = renderer();
    r.queue(r.sink, 'x'.repeat(11) + '😀' + 'y'.repeat(20));
    r.frame(16);
    expect(r.sink.textContent.endsWith('\uD83D')).toBe(false);
    r.flush(r.sink);
    expect(r.sink.textContent).toBe('x'.repeat(11) + '😀' + 'y'.repeat(20));
  });

  it('releases disconnected sinks instead of scheduling frames forever', () => {
    const r = renderer();
    r.queue(r.sink, 'Old session');
    r.sink.isConnected = false;
    r.frame(16);
    expect(r.frames.size).toBe(0);
    expect(r.sink.classes.has('text-streaming')).toBe(false);
  });

  it('preserves a reader’s position across large updates until they jump to latest', () => {
    const start = UI_HTML.indexOf('  function nearBottom(el)');
    const end = UI_HTML.indexOf('  var MAX_REPLAY_EVENTS', start);
    const context = createContext({ $: () => null });
    new Script(UI_HTML.slice(start, end)).runInContext(context);
    const stream = { scrollTop: 150, scrollHeight: 1000, clientHeight: 500, dataset: { follow: 'false' } };
    stream.scrollHeight += 3000;
    context.stickScroll(stream);
    expect(stream.scrollTop).toBe(150);
    context.stickScroll(stream, true);
    expect(stream.scrollTop).toBe(stream.scrollHeight);
    expect(stream.dataset.follow).toBe('true');
    stream.scrollHeight += 2000;
    context.stickScroll(stream);
    expect(stream.scrollTop).toBe(stream.scrollHeight);
  });
});
