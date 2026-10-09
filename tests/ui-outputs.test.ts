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
    URL, atob, console,
  });
  new Script(OUTPUT_JS).runInContext(context);
  return context as unknown as Record<string, (...args: unknown[]) => unknown>;
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

  it('parses reordered YouTube parameters, live URLs, start times and Vimeo player URLs', () => {
    expect(api.outVideoEmbed('https://youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=1m30s')).toContain('embed/dQw4w9WgXcQ?start=90');
    expect(api.outVideoEmbed('https://youtube.com/live/dQw4w9WgXcQ')).toContain('embed/dQw4w9WgXcQ');
    expect(api.outVideoEmbed('https://player.vimeo.com/video/76979871')).toContain('player.vimeo.com/video/76979871');
  });

  it('does not trust lookalike hosts, credentials or executable media schemes', () => {
    for (const url of [
      'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
      'https://evil.example/youtube.com/watch?v=dQw4w9WgXcQ',
    ]) {
      expect(api.outVideoUrl(url)).toBe('');
      expect(api.outVideoEmbed(url)).not.toContain('<iframe');
    }
    for (const url of ['javascript:alert(1).mp4', 'data:text/html,a.mp4', 'https://user:pass@example.com/a.mp4']) {
      expect(api.outVideoEmbed(url)).toBeNull();
    }
  });

  it('plays multiple media formats and artifact URLs with explicit MIME metadata', () => {
    expect(api.outVideoEmbed({ url: '/api/cowork/artifacts/f1/content', mime: 'video/webm', title: 'Demo' })).toContain('<video');
    expect(api.outVideoEmbed('https://cdn.example.com/clip.webm?token=1')).toContain('<video');
    expect(api.outAudioEmbed({ url: '/api/cowork/artifacts/f2/content', title: 'Voice memo' })).toContain('aria-label="Voice memo"');
    expect(api.outVideoEmbed('https://cdn.example.com/note.ogg')).toContain('<audio');
    expect(api.outAudioEmbed('https://cdn.example.com/note.wav')).toContain('preload="none"');
  });

  it('keeps an openable source when an unknown video provider cannot be embedded', () => {
    const html = api.outVideoEmbed({ url: 'https://example.com/watch/123', title: 'Recording' }) as string;
    expect(html).toContain('out-link');
    expect(html).toContain('Recording');
    expect(html).not.toContain('<iframe');
  });

  it('returns null for input that cannot become a safe embed', () => {
    expect(api.outVideoEmbed('')).toBeNull();
    expect(api.outVideoEmbed('   ')).toBeNull();
    expect(api.outVideoEmbed('not a url')).toBeNull();
  });
});

describe('shared output viewers: images, files and links', () => {
  it('renders a full image and accessible gallery links with escaped captions', () => {
    const image = api.outImageHtml({ url: 'https://example.com/map.png', alt: 'Map "area"', caption: '<Berlin>' }) as string;
    expect(image).toContain('alt="Map &quot;area&quot;"');
    expect(image).toContain('<figcaption>&lt;Berlin&gt;</figcaption>');
    const gallery = api.outGalleryHtml(['https://example.com/a.jpg']) as string;
    expect(gallery).toContain('<a href="https://example.com/a.jpg"');
    expect(gallery).toContain('<img');
  });

  it('accepts raster image data but excludes HTML, SVG data and off-origin root paths', () => {
    expect(api.outImageHtml('data:image/png;base64,iVBORw0KGgo=')).toContain('<img');
    for (const url of ['data:text/html,<script>1</script>', 'data:image/svg+xml;base64,PHN2Zz4=', 'javascript:alert(1)', '//evil.example/image.png', '/\\evil.example/image.png']) {
      expect(api.outImageHtml(url)).toBeNull();
    }
  });

  it('validates download URLs and displays filenames without query strings plus readable sizes', () => {
    const html = api.outDocsHtml([
      { url: '/api/cowork/artifacts/report%20final.pdf?download=1', size: 2048 },
      { url: 'javascript:alert(1)', name: 'Bad.pdf' },
    ]) as string;
    expect(html).toContain('report final.pdf');
    expect(html).toContain('2 KB');
    expect(html).not.toContain('Bad.pdf');
    expect(html).not.toContain('javascript:');
  });

  it('builds escaped source cards and classifies ordinary rich media URLs', () => {
    const html = api.outLinksHtml({ url: 'https://example.com/report', title: '<Report>', description: '"Summary"' }) as string;
    expect(html).toContain('&lt;Report&gt;');
    expect(html).toContain('&quot;Summary&quot;');
    expect(html).toContain('noopener noreferrer');
    expect(api.outUrlKind('https://example.com/a.png')).toBe('image');
    expect(api.outUrlKind('https://example.com/a.webm')).toBe('video');
    expect(api.outUrlKind('https://example.com/a.wav')).toBe('audio');
    expect(api.outUrlKind('https://example.com/a.pdf')).toBe('file');
    expect(api.outUrlKind('https://example.com/page')).toBe('link');
  });

  it('uses a site favicon with a delegated fallback and never requests one for artifact routes', () => {
    expect(api.outLinksHtml('https://example.com/report')).toContain('src="https://example.com/favicon.ico"');
    expect(api.outLinksHtml('https://example.com/report')).toContain('data-out-favicon="1"');
    expect(api.outLinksHtml('/api/cowork/artifacts/report/content')).not.toContain('favicon.ico');
    expect(api.outLinksHtml('http://localhost/api/cowork/artifacts/report/content')).not.toContain('favicon.ico');
  });

  it('replaces a failed favicon with its fallback through the captured error listener', () => {
    const listeners: Record<string, (event: unknown) => void> = {};
    const context = createContext({
      URL, window: { location: { href: 'http://localhost/' } },
      document: { addEventListener: (name: string, listener: (event: unknown) => void) => { listeners[name] = listener; } },
    });
    new Script(OUTPUT_JS).runInContext(context);
    const fallback = { hidden: true };
    const image = { hidden: false, nextElementSibling: fallback, getAttribute: () => '1' };
    listeners.error({ target: image });
    expect(image.hidden).toBe(true);
    expect(fallback.hidden).toBe(false);
  });
});

describe('shared output viewers: maps and previews', () => {
  it('embeds zero coordinates and lng aliases with an openable map source', () => {
    const html = api.outMapHtml({ lat: 0, lng: 0, title: 'Equator' }) as string;
    expect(html).toContain('openstreetmap.org/export/embed.html');
    expect(html).toContain('marker=0%2C0');
    expect(html).toContain('title="Equator"');
    expect(html).toContain('Open source');
    expect(api.outMapHtml({ lat: null, lon: null })).toBeNull();
    expect(api.outMapHtml({ lat: 95, lon: 0 })).toBeNull();
  });

  it('turns map URLs and place names into interactive maps', () => {
    expect(api.outMapHtml('https://www.openstreetmap.org/#map=12/-1.286/36.817')).toContain('marker=-1.286%2C36.817');
    expect(api.outMapHtml('https://www.google.com/maps/@-1.286,36.817,13z')).toContain('openstreetmap.org/export/embed.html');
    expect(api.outMapHtml({ q: 'Nairobi, Kenya' })).toContain('q=Nairobi%2C%20Kenya&amp;output=embed');
  });

  it('renders map images and keeps unrecognized maps as safe source links', () => {
    const html = api.outMapHtml({ imageUrl: 'https://example.com/map.png', title: 'Route', caption: 'Walking route' }) as string;
    expect(html).toContain('<img');
    expect(html).toContain('Walking route');
    expect(api.outMapHtml({ url: 'https://maps.example.com/route' })).toContain('out-link');
    expect(api.outMapHtml({ url: 'javascript:alert(1)' })).toBeNull();
  });

  it('decodes HTML data URLs into isolated srcdoc and rejects executable URL schemes', () => {
    const html = api.outPreviewFrame('data:text/html,%3Cbutton%3EGo%3C%2Fbutton%3E') as string;
    expect(html).toContain('srcdoc="&lt;button&gt;Go&lt;/button&gt;"');
    expect(html).not.toContain('allow-same-origin');
    expect(api.outPreviewFrame('data:text/html;base64,PGI+SGVsbG88L2I+')).toContain('srcdoc="&lt;b&gt;Hello&lt;/b&gt;"');
    expect(api.outPreviewFrame('javascript:alert(1)')).toBeNull();
  });

  it('keeps same-origin HTML artifact previews isolated from the app', () => {
    const html = api.outPreviewFrame({ url: '/api/cowork/artifacts/demo/preview', title: 'Demo' }) as string;
    expect(html).toContain('src="/api/cowork/artifacts/demo/preview"');
    expect(html).toContain('sandbox=');
    expect(html).not.toContain('allow-same-origin');
    expect(api.outPreviewFrame({ url: '//evil.example/demo' })).toBeNull();
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

  it('supports object payloads for widgets and image, audio, file, link and HTML fences', () => {
    expect(api.outRenderBlock('image', { url: 'https://example.com/map.png', title: 'Map' })).toContain('<img');
    expect(api.outRenderBlock('audio', { url: '/api/cowork/artifacts/a/content' })).toContain('<audio');
    expect(api.outRenderBlock('file', { url: '/api/cowork/artifacts/f/content', name: 'report.pdf' })).toContain('download="report.pdf"');
    expect(api.outRenderBlock('link', { url: 'https://example.com/page', title: 'Page' })).toContain('out-link');
    expect(api.outRenderBlocks('```output html\n{"html":"<button>Go</button>","title":"Demo"}\n```')).toContain('srcdoc=');
    expect(api.outRenderBlocks('```OUTPUT map-image\nhttps://example.com/map.png\n```')).toContain('<img');
  });
});
