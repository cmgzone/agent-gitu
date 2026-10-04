/**
 * End-to-end rendering for the shared output viewers.
 *
 * tests/ui-outputs-parity.test.ts stubs outRenderBlocks with a spy, so it only
 * proves that both chat surfaces delegate to the shared helper. It never proves
 * that the helper actually produces a chart, a sortable table, a download link
 * or an isolated mini-app preview. These tests run the REAL OUTPUT_JS with no
 * stub and assert on the HTML it emits.
 *
 * The app injects OUTPUT_JS into its main IIFE, where a top-level function
 * declaration becomes a global. A vm context reproduces that exactly, so the
 * code under test is the same string the browser receives.
 */
import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { OUTPUT_JS } from '../src/server/ui-outputs.js';

type AnyRecord = Record<string, unknown>;

const FENCE = String.fromCharCode(96).repeat(3);

/** Run the real OUTPUT_JS and return its outRenderBlocks. */
function renderBlocks(): (text: string) => string {
  function stubElement(): AnyRecord {
    return {
      innerHTML: '', textContent: '', value: '', style: {}, dataset: {},
      classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn(), contains: () => false },
      setAttribute: vi.fn(), getAttribute: () => null, appendChild: vi.fn(),
      addEventListener: vi.fn(), querySelectorAll: () => [], querySelector: () => null,
      remove: vi.fn(), focus: vi.fn(), selectionStart: 0, disabled: false,
    };
  }
  const context = createContext({
    document: {
      createElement: vi.fn(stubElement),
      createTextNode: vi.fn((v: string) => ({ textContent: v })),
      querySelector: vi.fn(() => null), querySelectorAll: vi.fn(() => []),
      addEventListener: vi.fn(), body: stubElement(), documentElement: stubElement(),
    },
    window: { addEventListener: vi.fn(), location: { href: 'http://localhost/' } },
    navigator: { clipboard: { writeText: vi.fn() } },
    URL, console,
  });
  new Script(String(OUTPUT_JS)).runInContext(context);
  const fn = context.outRenderBlocks;
  expect(typeof fn).toBe('function');
  return fn as (text: string) => string;
}

const render = renderBlocks();

const block = (kind: string, payload: string) => [FENCE + 'output ' + kind, payload, FENCE].join('\n');

describe('shared output viewers: real rendering', () => {
  it('renders a bar chart as inline SVG inside an output card', () => {
    const html = render(block('chart', JSON.stringify({
      type: 'bar', title: 'By skill',
      labels: ['Research', 'Data'],
      series: [{ name: 'Charts', data: [4, 11] }],
    })));
    expect(html).toMatch(/out-card/);
    expect(html).toMatch(/<svg/i);
    expect(html).toMatch(/Research/);
    expect(html).not.toContain(FENCE);
  });

  it('renders a pie chart too', () => {
    const html = render(block('chart', JSON.stringify({
      type: 'pie', labels: ['A', 'B'], series: [{ name: 'Runs', data: [14, 9] }],
    })));
    expect(html).toMatch(/<svg/i);
    expect(html).not.toContain(FENCE);
  });

  it('renders a sortable table with sort controls', () => {
    const html = render(block('table', [
      '| Skill | Result |',
      '| --- | ---: |',
      '| Research | 9 |',
    ].join('\n')));
    expect(html).toMatch(/out-tbl/);
    expect(html).toMatch(/out-sort/);
    expect(html).toContain('Research');
    expect(html).not.toContain(FENCE);
  });

  it('isolates an interactive mini-app preview in a sandboxed iframe', () => {
    const html = render(block('preview', '<button id="go">Go</button>'));
    expect(html).toMatch(/<iframe/i);
    // Isolation is the whole point: the preview must be sandboxed, never top-level.
    expect(html).toMatch(/sandbox=/i);
    expect(html).toMatch(/srcdoc=/i);
  });

  it('renders documents as real download links', () => {
    const html = render(block('docs', JSON.stringify([
      { url: 'https://example.com/report.pdf', name: 'report.pdf' },
    ])));
    expect(html).toMatch(/<a\s/i);
    expect(html).toMatch(/download=/i);
    expect(html).toContain('report.pdf');
  });

  it('renders a gallery as images', () => {
    const html = render(block('gallery', JSON.stringify([
      { url: 'https://example.com/a.png' }, { url: 'https://example.com/b.png' },
    ])));
    expect(html).toMatch(/<img/i);
    expect(html).toContain('a.png');
  });

  it('embeds a YouTube URL as a video player', () => {
    const html = render(block('video', 'https://www.youtube.com/watch?v=abc123'));
    expect(html).toMatch(/<iframe/i);
    expect(html).toMatch(/youtube/i);
  });
});

describe('shared output viewers: safety and error handling', () => {
  it('leaves malformed JSON as escaped text instead of throwing', () => {
    const html = render(block('chart', '{ this is not json '));
    // No viewer is fabricated, and nothing escaped the string layer.
    expect(html).not.toMatch(/<svg/i);
    expect(html).toMatch(/not json/);
  });

  it('escapes markup so hostile payload text cannot inject HTML', () => {
    const html = render(block('table', '| a | b |\n| --- | --- |\n| <img src=x onerror=alert(1)> | y |'));
    expect(html).not.toMatch(/<img src=x/i);
    expect(html).toMatch(/&lt;img/);
  });

  it('leaves an unclosed fence alone mid-stream', () => {
    const streaming = FENCE + 'output chart\n{"type":"bar"';
    expect(render(streaming)).toBe(streaming);
  });

  it('passes ordinary code fences through untouched', () => {
    const code = [FENCE + 'js', 'const a = 1;', FENCE].join('\n');
    expect(render(code)).toBe(code);
  });

  it('keeps surrounding prose intact when one block is converted', () => {
    const text = ['Before.', '', block('chart', JSON.stringify({
      type: 'bar', labels: ['x'], series: [{ name: 's', data: [1] }],
    })), '', 'After.'].join('\n');
    const html = render(text);
    expect(html).toContain('Before.');
    expect(html).toContain('After.');
    expect(html).toMatch(/<svg/i);
  });
});
