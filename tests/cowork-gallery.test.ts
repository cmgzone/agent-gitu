import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_JS } from '../src/server/ui-cowork.js';
import { COWORK_GALLERY_JS } from '../src/server/ui-gallery.js';

function fixture() {
  const createElement = vi.fn(() => ({ setAttribute: vi.fn() }));
  const cw = { active: 'dm', agents: [], convs: [], artifacts: [] as any[], msgs: [] as any[] };
  const context = createContext({
    S: { cw }, URL, window: { addEventListener: vi.fn() }, document: { createElement },
    esc: (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'),
  });
  new Script(COWORK_JS + COWORK_GALLERY_JS).runInContext(context);
  return { context, cw, createElement };
}

describe('Cowork media gallery', () => {
  it('collects shared artifacts and unique videos/maps, with readable link titles', () => {
    const u = fixture();
    u.cw.artifacts = [
      { id: 'image-1', name: 'Screenshot.png', mime: 'image/png', createdAt: '2026-10-04T08:00:00Z' },
      { id: 'audio-1', name: 'Recording.mp3', mime: 'audio/mpeg' },
      { id: 'video-1', name: 'Demo.mp4', mime: 'video/mp4' },
      { id: 'file-1', name: 'Plan.pdf', mime: 'application/pdf' },
    ];
    u.cw.msgs = [{ text: '[Walkthrough](https://youtu.be/dQw4w9WgXcQ)\nhttps://youtube.com/watch?v=dQw4w9WgXcQ\n[Office](https://maps.google.com/?q=-1.2864,36.8172)', ts: '2026-10-04T09:00:00Z' }];
    const items = u.context.cwGalleryItems();
    expect(items).toHaveLength(6);
    expect(items.map((item: any) => item.kind).sort()).toEqual(['audio', 'files', 'images', 'maps', 'videos', 'videos']);
    expect(items[0].name).toBe('Walkthrough');
    expect(items[1].name).toBe('Office');
  });

  it('puts safe image thumbnails in the stack and saves native players for the gallery', () => {
    const u = fixture();
    u.cw.artifacts = ['image/png', 'video/mp4', 'audio/mpeg', 'application/pdf'].map((mime, i) => ({ id: 'file-' + i, name: 'File <' + i + '>', mime, size: 20 }));
    const html = u.context.cwFilesHtml(u.cw.artifacts.map(file => file.id), 'agent');
    expect(html.match(/class="cw-stack-sheet"/g)).toHaveLength(3);
    expect(html).toContain('data-cwgallery="file-0"');
    expect(html).toContain('4 shared files');
    expect(html).toContain('is-new');
    expect(html).not.toMatch(/<video|<audio|<iframe|cw-bubble/);
    expect(u.context.cwFilesHtml(['file-0', 'file-1', 'file-2', 'file-3'])).not.toContain('is-new');
    const item = { file: u.cw.artifacts[0], id: 'file:file-0', kind: 'images', date: '' };
    const tile = u.context.cwGalleryFileHtml(item, 0, true);
    expect(tile).toContain('File &lt;0>');
    expect(tile).toContain('href="/api/cowork/artifacts/file-0" download');
    expect(tile).toContain('data-cwmediapreview="file-0"');
    expect(u.context.cwGalleryFileHtml({ ...item, kind: 'videos' }, 1, true)).toContain('<video controls preload="metadata"');
    expect(u.context.cwGalleryFileHtml({ ...item, kind: 'audio' }, 2, true)).toContain('<audio controls preload="none"');
  });

  it('uses canonical click-to-load media without autoplaying or embedding code examples', () => {
    const u = fixture();
    const html = u.context.cwBody('[Intro](https://youtube.com/watch?v=dQw4w9WgXcQ&autoplay=1)\nhttps://youtu.be/dQw4w9WgXcQ', []);
    expect(html.match(/class="cw-rich-card(?: is-new)?"/g)).toHaveLength(1);
    expect(html).toContain('>Intro</a>');
    expect(html).toContain('data-cwrichload="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"');
    expect(html).not.toContain('<iframe');
    expect(u.context.cwRichLinks('```\nhttps://youtu.be/dQw4w9WgXcQ\n``` `https://vimeo.com/123456789`')).toHaveLength(0);
    expect(u.context.cwRichLinks('https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ\nhttps://user@youtube.com/watch?v=dQw4w9WgXcQ')).toHaveLength(0);
  });

  it('keeps the chat media grid separate from message prose', () => {
    const u = fixture();
    const text = 'Watch [Intro](https://youtu.be/dQw4w9WgXcQ)';
    expect(u.context.cwBody(text, [], false)).not.toContain('cw-rich-grid');
    expect(u.context.cwBody(text, [], false)).toContain('>Intro</a>');
    const grid = u.context.cwChatMediaHtml(text, 'user');
    expect(grid).toContain('cw-rich-grid cw-chat-media-grid me');
    expect(grid).not.toContain('cw-bubble');
  });

  it('keeps a playing media grid connected while surrounding messages update', () => {
    const u = fixture();
    function node(attributes: Record<string, string> = {}): any {
      const element: any = { children: [], parentElement: null, getAttribute: (name: string) => attributes[name] ?? null };
      element.remove = vi.fn(() => { if (element.parentElement) element.parentElement.children = element.parentElement.children.filter((child: any) => child !== element); element.parentElement = null; });
      element.insertBefore = vi.fn((child: any, before: any) => { if (child.parentElement) child.remove(); const index = before ? element.children.indexOf(before) : element.children.length; element.children.splice(index, 0, child); child.parentElement = element; });
      return element;
    }
    const wrap = node(), playing = node({ 'data-cwmediagroup': 'message-1', 'data-media-signature': 'same-video' });
    const oldMessage = node(), newMessage = node(), freshReply = node();
    wrap.children = [oldMessage, playing];
    wrap.children.forEach((child: any) => { child.parentElement = wrap; });
    const holder = node();
    holder.children = [newMessage, node({ 'data-cwmediagroup': 'message-1', 'data-media-signature': 'same-video' }), freshReply];
    holder.children.forEach((child: any) => { child.parentElement = holder; });
    u.createElement.mockReturnValueOnce(holder);
    u.context.cwReplaceTranscript(wrap, 'updated transcript');
    expect(wrap.children[0]).toBe(newMessage);
    expect(wrap.children[1]).toBe(playing);
    expect(wrap.children[2]).toBe(freshReply);
    expect(playing.remove).not.toHaveBeenCalled();
    expect(playing.parentElement).toBe(wrap);
    holder.children = [node({ 'data-cwmediagroup': 'message-1', 'data-media-signature': 'edited-video' })];
    u.createElement.mockReturnValueOnce(holder);
    u.context.cwReplaceTranscript(wrap, 'edited transcript');
    expect(playing.remove).toHaveBeenCalledOnce();
    expect(wrap.children[0]).not.toBe(playing);
  });

  it('renders coordinates as a map and leaves address/short links as real location links', () => {
    const u = fixture();
    const map = u.context.cwMapLink('https://maps.google.com/?q=-1.2864,36.8172');
    expect(new URL(map.embed).hostname).toBe('www.openstreetmap.org');
    expect(new URL(map.embed).searchParams.get('marker')).toBe('-1.2864,36.8172');
    expect(u.context.cwMapLink('https://openstreetmap.org/#map=15/-1.2864/36.8172').embed).toBeTruthy();
    for (const url of ['https://maps.google.com/?q=Nairobi', 'https://maps.app.goo.gl/Example', 'https://maps.google.com/?q=200,300']) {
      const item = u.context.cwMapLink(url);
      expect(item.embed).toBe('');
      expect(u.context.cwRichCardHtml(item, 0)).toContain('href="' + url + '"');
    }
    expect(u.context.cwMapLink('javascript:alert(1)')).toBeNull();
    expect(u.context.cwMapLink('https://maps.google.com.evil.test/?q=0,0')).toBeNull();
    expect(u.context.cwMapLink('https://user@maps.google.com/?q=0,0')).toBeNull();
  });

  it('only starts a known player on click and rejects an arbitrary iframe destination', () => {
    const u = fixture();
    const replaceChildren = vi.fn();
    const button = (source: string) => ({
      onclick: null as null | (() => void),
      getAttribute: (name: string) => name === 'data-cwrichload' ? source : name === 'data-rich-kind' ? 'video' : 'Play intro',
      closest: () => ({ replaceChildren }),
    });
    const valid = button('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    const hostile = button('https://evil.test/embed/dQw4w9WgXcQ');
    u.context.cwBindRichCards({ querySelectorAll: () => [valid, hostile] });
    expect(u.createElement).not.toHaveBeenCalled();
    hostile.onclick!();
    expect(u.createElement).not.toHaveBeenCalled();
    valid.onclick!();
    expect(u.createElement).toHaveBeenCalledOnce();
    expect(replaceChildren.mock.calls[0]![0].src).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1&playsinline=1');
  });
});
