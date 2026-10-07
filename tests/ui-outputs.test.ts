import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { OUTPUT_JS } from '../src/server/ui-outputs.js';

/**
 * The shared viewers ship as an ES5-style snippet that normally runs inside the
 * app IIFE. These tests evaluate it standalone and pull the pure helpers out, so
 * pipe-table parsing, SVG generation and URL resolution are all covered without
 * a DOM. Only the globals the snippet touches at definition time are stubbed.
 */
function load() {
  const el = () => ({
    innerHTML: '', textContent: '', value: '', style: {}, dataset: {}, classList: { add: vi.fn(), remove: vi.fn() },
    setAttribute: vi.fn(), getAttribute: () => null, appendChild: vi.fn(), addEventListener: vi.fn(),
    querySelectorAll: () => [], querySelector: () => null, remove: vi.fn(), focus: vi.fn(),
  });
  const context = createContext({
    document: {
      createElement: vi.fn(el), createTextNode: vi.fn((v: string) => ({ textContent: v })),
      querySelector: vi.fn(() => null), querySelectorAll: vi.fn(() => []),
      addEventListener: vi.fn(), body: el(), documentElement: el(),
    },
    window: { addEventListener: vi.fn(), location: { href: 'http://localhost/' } },
    navigator: { clipboard: { writeText: vi.fn() } },
    console,
  });
  new Script(OUTPUT_JS).runInContext(context);
  return context as unknown as Record<string, (arg?: unknown) => unknown>;
}

const api = load();

describe('shared output viewers: escaping and numbers', () => {
  it('escapes markup so a cell or title cannot smuggle HTML', () => {
    expect(api.outEsc('<b>&"x\'y</b>')).toBe(
      '&lt;b&gt;&amp;&quot;x&#39;y&lt;/b&gt;',
    );
  });

  it('renders null and undefined as an empty string', () => {
    expect(api.outEsc(null)).toBe('');
    expect(api.outEsc(undefined)).toBe('');
  });

  it('rounds numbers by magnitude and degrades non-finite values to 0', () => {
    expect(api.outNum(1234.56)).toBe('1235');
    expect(api.outNum(12.34)).toBe('12.3');
    expect(api.outNum(0.1234)).toBe('0.12');
    expect(api.outNum(NaN)).toBe('0');
  });
});

describe('shared output viewers: pipe tables', () => {
  const table = ['| Skill | Result |', '| --- | ---: |', '| Research | 9 |', '| Coding | 7 |'].join('\n');

  it('builds a sortable table with a header row and one body row per line', () => {
    const html = api.outTableHtml(table) as string;
    expect(html).toContain('out-tbl');
    expect(html).toContain('out-sort');
    expect(html).toContain('>Skill<');
    expect(html).toContain('>Research<');
    expect(html).toContain('>Coding<');
  });

  it('escapes cell content instead of rendering it as markup', () => {
    const html = api.outTableHtml(['| a |', '| --- |', '| <img src=x onerror=alert(1)> |'].join('\n')) as string;
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
  });

  it('rejects blocks that are not pipe tables so plain prose still renders as prose', () => {
    expect(api.outTableHtml('just a sentence')).toBeNull();
    expect(api.outTableHtml('| a | b |')).toBeNull();
  });

  it('rejects a table whose second line is not a divider row', () => {
    expect(api.outTableHtml(['| a |', '| not a divider |', '| 1 |'].join('\n'))).toBeNull();
  });
});

describe('shared output viewers: chart SVG', () => {
  it('draws one bar per data point and labels each category', () => {
    const svg = api.outChartSvg({
      type: 'bar', labels: ['a', 'b'], series: [{ name: 'p50', data: [12, 9] }],
    }) as string;
    expect(svg).toContain('out-svg');
    expect(svg).toContain('class="out-bar"');
    expect(svg).toContain('>a<');
    expect(svg).toContain('>b<');
  });

  it('renders a polyline and a legend entry per series for line charts', () => {
    const svg = api.outChartSvg({
      type: 'line', labels: ['x', 'y'], series: [{ name: 'latency', data: [3, 5] }, { name: 'errors', data: [1, 0] }],
    }) as string;
    expect(svg).toContain('<polyline');
    expect(svg).toContain('latency');
    expect(svg).toContain('errors');
  });

  it('returns null for a payload that has no series to draw', () => {
    expect(api.outChartSvg({ labels: ['a'] })).toBeNull();
    expect(api.outChartSvg(null)).toBeNull();
  });
});

describe('shared output viewers: media URL resolution', () => {
  it('rewrites YouTube watch, short and youtu.be links to the nocookie embed', () => {
    for (const url of [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://youtu.be/dQw4w9WgXcQ',
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    ]) {
      const html = api.outVideoEmbed(url) as string;
      expect(html).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ');
    }
  });

  it('resolves Vimeo links to the player and selects a tag by file type', () => {
    expect(api.outVideoEmbed('https://vimeo.com/76979871')).toContain('player.vimeo.com/video/76979871');
    expect(api.outVideoEmbed('https://cdn.example.com/clip.mp4')).toContain('<video');
    expect(api.outVideoEmbed('https://cdn.example.com/note.mp3')).toContain('<audio');
  });

  it('returns null for input that cannot become a safe embed', () => {
    expect(api.outVideoEmbed('')).toBeNull();
    expect(api.outVideoEmbed('   ')).toBeNull();
    expect(api.outVideoEmbed('not a url')).toBeNull();
  });
});

describe('shared output viewers: fenced block dispatch', () => {
  it('rewrites an output fence into a viewer card and keeps the surrounding prose', () => {
    const out = api.outRenderBlocks('Before\n\n```output table\n| a |\n| --- |\n| 1 |\n```\n\nAfter') as string;
    expect(out).toContain('out-card');
    expect(out).toContain('Before');
    expect(out).toContain('After');
    expect(out).not.toContain('```output');
  });

  it('leaves ordinary code fences untouched so the normal renderer still owns them', () => {
    const code = '```js\nconst a = 1;\n```';
    expect(api.outRenderBlocks(code)).toBe(code);
  });

  it('leaves a block whose closing fence has not arrived alone, so streaming is safe', () => {
    const partial = '```output chart\n{"type":"bar"';
    expect(api.outRenderBlocks(partial)).toBe(partial);
  });

  it('returns an unknown kind unchanged instead of swallowing the text', () => {
    const odd = '```output mystery\nhello\n```';
    expect(api.outRenderBlocks(odd)).toBe(odd);
  });

  it('renders a video fence as a frame and JSON as an escaped pre block', () => {
    const v = api.outRenderBlocks('```output video\nhttps://vimeo.com/76979871\n```') as string;
    expect(v).toContain('out-frame');
    const j = api.outRenderBlocks('```output json\n{"a":1}\n```') as string;
    expect(j).toContain('out-pre');
    expect(j).toContain('&quot;a&quot;');
  });
});
