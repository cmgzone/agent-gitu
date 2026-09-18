import { describe, expect, it } from 'vitest';
import { createContext, Script } from 'node:vm';
import { UI_HTML } from '../src/server/ui.js';

/** Runs the real sessionFileCard against a minimal element mock. */
function setup() {
  function element(tag = 'div'): any {
    const node: any = {
      tagName: tag, className: '', textContent: '', title: '', src: '', href: '',
      alt: '', controls: false, preload: '', download: '', target: '', rel: '',
      children: [] as any[],
      classList: { added: [] as string[], add(name: string) { this.added.push(name); } },
      setAttribute(name: string, value: string) { node[name] = value; },
      appendChild(child: any) { node.children.push(child); return child; },
    };
    return node;
  }
  const context = createContext({
    document: { createElement: element },
    icon: () => '<svg></svg>',
    humanBytes: () => '12 KB',
  });
  const slice = UI_HTML.slice(
    UI_HTML.indexOf('  function safeRunFileUrl('),
    UI_HTML.indexOf('  function removeNarrationReplacedByFile('),
  );
  new Script(slice).runInContext(context);
  return { context, card: (meta: unknown) => context.sessionFileCard(meta) as any };
}

const base = { id: 'f1', name: 'clip.mp4', size: 12_345, kind: 'assistant', downloadUrl: '/api/runs/r1/files/f1' };

describe('Run-file cards render inline media', () => {
  it('plays video and audio inline instead of showing a bare icon', () => {
    const { card } = setup();
    const video = card({ ...base, mime: 'video/mp4', previewUrl: '/api/runs/r1/files/f1?inline=1' });
    const player = video.children.find((c: any) => c.tagName === 'video');
    expect(player).toBeTruthy();
    expect(player.controls).toBe(true);
    expect(player.src).toBe('/api/runs/r1/files/f1?inline=1');
    expect(player.preload).toBe('metadata');
    expect(video.classList.added).toContain('has-media');

    const audio = card({ ...base, name: 'clip.mp3', mime: 'audio/mpeg', previewUrl: '/api/runs/r1/files/f1?inline=1' });
    const sound = audio.children.find((c: any) => c.tagName === 'audio');
    expect(sound).toBeTruthy();
    expect(sound.controls).toBe(true);
    expect(sound.preload).toBe('none');
  });

  it('still renders images as thumbnails and unknown types as an icon card', () => {
    const { card } = setup();
    const image = card({ ...base, name: 'shot.png', mime: 'image/png', previewUrl: '/api/runs/r1/files/f1?inline=1' });
    expect(image.children.find((c: any) => c.tagName === 'img')).toBeTruthy();
    expect(image.classList.added).not.toContain('has-media');

    const zip = card({ ...base, name: 'bundle.zip', mime: 'application/zip' });
    expect(zip.children.some((c: any) => c.className === 'file-ico')).toBe(true);
    expect(zip.classList.added).not.toContain('has-media');
  });

  it('never trusts an off-origin preview URL for a media player', () => {
    const { card } = setup();
    const video = card({ ...base, mime: 'video/mp4', previewUrl: 'https://evil.example.com/x.mp4' });
    expect(video.children.find((c: any) => c.tagName === 'video')).toBeUndefined();
    expect(video.classList.added).not.toContain('has-media');
  });
});