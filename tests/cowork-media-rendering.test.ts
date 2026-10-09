import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_JS } from '../src/server/ui-cowork.js';
import { OUTPUT_JS } from '../src/server/ui-outputs.js';

function renderer() {
  const context = createContext({
    S: { cw: { agents: [], convs: [], widgets: [] } },
    window: { addEventListener: vi.fn(), location: { href: 'http://localhost/' } },
    document: { addEventListener: vi.fn(), querySelectorAll: () => [] },
    $: () => null,
    URL,
    esc: (value: unknown) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
  });
  new Script(OUTPUT_JS + '\n' + COWORK_JS).runInContext(context);
  return context;
}

describe('Cowork messages with the real shared media renderer', () => {
  it('renders Markdown map images once with escaped alternative text', () => {
    const ui = renderer();
    const text = 'Location: ![Map <route>](https://maps.example.test/route.png)';
    const body = ui.cwBody(text, [], false);
    expect(body).toContain('<img');
    expect(body).toContain('alt="Map &lt;route&gt;"');
    expect(body).not.toContain('![Map');
    expect(ui.cwChatMediaHtml(text, 'agent', 'message')).toBe('');
    expect((body.match(/<img/g) || []).length).toBe(1);
  });

  it('keeps image syntax and media links inside code samples literal', () => {
    const ui = renderer();
    const text = '`![Screenshot](https://example.test/screenshot.png)`\n```js\nconst clip = "https://example.test/clip.webm";\n```';
    const body = ui.cwBody(text, []);
    expect(body).not.toContain('<img');
    expect(body).not.toContain('<a');
    expect(ui.cwChatMediaHtml(text, 'agent', 'message')).toBe('');
    expect(ui.cwBody('~~~js\nconst clip = "https://example.test/clip.webm";\n~~~', [])).not.toContain('<a');
  });

  it('preserves balanced image URLs and avoids duplicate bare source previews', () => {
    const ui = renderer();
    const url = 'https://example.test/route_(1).png';
    const text = `![Route](${url} "Map preview")\nSource: ${url}`;
    const body = ui.cwBody(text, [], false);
    expect(body).toContain(`src="${url}"`);
    expect(body).not.toContain('.png)<');
    expect(ui.cwChatMediaHtml(text, 'agent', 'message')).toBe('');
    expect((body.match(/<img/g) || []).length).toBe(1);
  });

  it('turns direct video and audio links into native players', () => {
    const ui = renderer();
    const html = ui.cwChatMediaHtml('[Demo](https://example.test/demo.webm)\nhttps://example.test/music.mp3', 'agent', 'message');
    expect(html).toContain('<video');
    expect(html).toContain('<audio');
    expect(html).toContain('controls');
    expect(html).not.toContain('autoplay');
  });

  it('renders file and website cards beside maps and provider video cards', () => {
    const ui = renderer();
    const html = ui.cwChatMediaHtml('https://example.test/report.pdf\n[Reference](https://example.test/docs)\nhttps://www.youtube.com/watch?v=abcdefghijk\nhttps://www.openstreetmap.org/?mlat=-1.2864&mlon=36.8172', 'agent', 'message');
    expect(html).toContain('download="report.pdf"');
    expect(html).toContain('Reference');
    expect(html).toContain('example.test/favicon.ico');
    expect(html).toContain('Play video:');
    expect(html).toContain('View map:');
  });

  it('rejects credential-bearing media URLs and executable image URLs', () => {
    const ui = renderer();
    expect(ui.cwChatMediaHtml('https://user:secret@example.test/video.mp4', 'agent', 'message')).toBe('');
    const body = ui.cwBody('![Unsafe](javascript:alert(1))', []);
    expect(body).not.toContain('<img');
    expect(body).not.toContain('src="javascript:');
    expect(ui.cwBody('https://user:secret@example.test/video.mp4', [])).not.toContain('<a');
  });

  it('does not break a message when a URL has malformed percent encoding', () => {
    const ui = renderer();
    expect(() => ui.cwChatMediaHtml('https://example.test/%zz.mp4', 'agent', 'message')).not.toThrow();
  });

  it('uses the original floating photo style for direct image previews', () => {
    const ui = renderer();
    const text = 'https://example.test/route.png';
    expect(ui.cwChatImageLinksHtml(text)).toContain('<img');
    expect(ui.cwChatImageLinksHtml(text)).toContain('cw-photo-strip');
    expect(ui.cwChatImageLinksHtml(text)).not.toContain('out-card');
    expect(ui.cwChatMediaHtml(text, 'agent', 'message')).toBe('');
  });

  it('places attached images after both agent and user bubbles', () => {
    const ui = renderer();
    ui.cwAva = () => '';
    ui.cwMessageActionsHtml = () => '';
    ui.cwFilesHtml = () => '<img data-test-image="attachment">';
    const message = { id: 'message', text: 'Here is the image.', artifactIds: ['image'], ts: '2026-10-09T04:00:00Z' };
    for (const role of ['agent', 'user']) {
      const html = ui.cwBubbleHtml({ ...message, role });
      expect(html).toMatch(/class="cw-bubble"[\s\S]*<\/div><\/div><img data-test-image="attachment">$/);
    }
  });

  it('places Markdown and structured images outside the message without duplicates', () => {
    const ui = renderer();
    ui.cwAva = () => '';
    ui.cwMessageActionsHtml = () => '';
    ui.S.cw.artifacts = [{ id: 'image', name: 'Product', mime: 'image/png' }];
    const text = 'Here is the product.\n![Product](/api/cowork/artifacts/image)\n```output image\n{"url":"/api/cowork/artifacts/image"}\n```';
    for (const role of ['agent', 'user']) {
      const html = ui.cwBubbleHtml({ id: 'message', role, text, artifactIds: ['image'], ts: '2026-10-09T04:00:00Z' });
      const photoIndex = html.indexOf('<div class="cw-photo-strip');
      expect(html.slice(0, photoIndex)).not.toContain('<img');
      expect(html.slice(0, photoIndex)).toMatch(/<\/div><\/div>$/);
      expect(html).not.toContain('![Product]');
      expect(html).not.toContain('output image');
      expect((html.match(/<img/g) || []).length).toBe(1);
      expect(html).toContain('data-cwphoto="image"');
    }
  });

  it('keeps code image examples out of floating previews and validates remote image sources', () => {
    const ui = renderer();
    const parts = ui.cwChatImageParts('`![Code](https://example.test/code.png)`\n![Photo <name>](https://example.test/photo.png)\n![Unsafe](javascript:alert(1))');
    expect(parts.images).toHaveLength(1);
    expect(parts.text).toContain('![Code]');
    expect(parts.text).toContain('![Unsafe]');
    const html = ui.cwPhotoCardsHtml(parts.images, 'agent');
    expect(html).toContain('data-cwphoto-url="https://example.test/photo.png"');
    expect(html).toContain('alt="Photo &lt;name&gt;"');
    expect(html).not.toContain('javascript:');
  });
});
