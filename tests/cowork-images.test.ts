import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { COWORK_IMAGES_JS } from '../src/server/ui-cowork-images.js';
import { COWORK_GALLERY_JS } from '../src/server/ui-gallery.js';

function motion(reduced = false) {
  const state = { active: 'chat', threadId: '' };
  const context = createContext({ cwEnsure: () => state, window: { matchMedia: () => ({ matches: reduced }) },
    esc: (s: unknown) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]),
  });
  new Script(COWORK_IMAGES_JS).runInContext(context);
  return { context, state };
}

describe('Cowork images and chat motion', () => {
  it('shows individually clickable images, escapes names and encodes artifact IDs', () => {
    const { context } = motion();
    const files = [{ id: 'photo?1', name: '<img onerror="bad">' }, { id: 'two', name: 'Second image' }];
    const html = context.cwPhotoCardsHtml(files, 'user') as string;
    expect(html.match(/data-cwphoto=/g)).toHaveLength(2);
    expect(html).toContain('cw-photo-strip me');
    expect(html).toContain('photo%3F1?inline=1');
    expect(html).toContain('&lt;img onerror=&quot;bad&quot;&gt;');
    expect(html).not.toContain('Open gallery');
    expect(html).toContain('is-new');
    expect(context.cwPhotoCardsHtml(files, 'user')).not.toContain('is-new');
  });

  it('animates a new message once and leaves replayed messages and stream updates still', () => {
    const { context } = motion();
    const row = { getAttribute: () => 'message-one', animate: vi.fn() };
    const root = { querySelectorAll: () => [row] };
    context.cwAnimateChatBubbles(root);
    context.cwAnimateChatBubbles(root);
    expect(row.animate).toHaveBeenCalledOnce();
    expect(row.animate.mock.calls[0]?.[1].duration).toBe(380);
  });
  it('keeps existing history still and animates only a new incoming message', () => {
    const {context}=motion();
    const old={getAttribute:()=> 'old',animate:vi.fn()},fresh={getAttribute:()=> 'fresh',animate:vi.fn()};
    context.cwPrimeChatBubbles([{id:'old',role:'agent'}]);
    context.cwAnimateChatBubbles({querySelectorAll:()=>[old,fresh]});
    expect(old.animate).not.toHaveBeenCalled();expect(fresh.animate).toHaveBeenCalledOnce();
    context.cwAnimateChatBubbles({querySelectorAll:()=>[old,fresh]});
    expect(fresh.animate).toHaveBeenCalledOnce();
  });

  it('respects reduced motion and scopes message IDs to their conversation', () => {
    const u = motion(true);
    const row = { getAttribute: () => 'one', animate: vi.fn() };
    u.context.cwAnimateChatBubbles({ querySelectorAll: () => [row] });
    expect(row.animate).not.toHaveBeenCalled();
    const other = motion();
    other.context.cwAnimateChatBubbles({ querySelectorAll: () => [row] });
    other.state.active = 'another-chat';
    const otherRow={getAttribute:()=> 'one',animate:vi.fn()};
    other.context.cwAnimateChatBubbles({ querySelectorAll: () => [otherRow] });
    expect(row.animate).toHaveBeenCalledOnce();expect(otherRow.animate).toHaveBeenCalledOnce();
  });

  it('keeps the lightbox script syntactically valid', () => {
    expect(() => new Script(COWORK_GALLERY_JS)).not.toThrow();
  });

  it('expands from the card center into the preview and rejects empty bounds', () => {
    const { context } = motion();
    expect(context.cwPhotoFlightTransform(
      { left: 100, top: 200, width: 150, height: 200 },
      { left: 250, top: 100, width: 300, height: 400 }, 0,
    )).toBe('translate(-225px,0px) rotate(0deg) scale(0.5,0.5)');
    expect(context.cwPhotoFlightTransform(null, { width: 300, height: 400 })).toBeNull();
    expect(context.cwPhotoFlightTransform({ width: 0, height: 200 }, { width: 300, height: 400 })).toBeNull();
  });

  it('leaves touch and reduced-motion pointer interactions still', () => {
    for (const reduced of [false, true]) {
      const { context } = motion(reduced);
      const handlers: Record<string, (event: { pointerType: string }) => void> = {};
      const add = vi.fn();
      const card = { dataset: {}, parentElement: { classList: { add } }, classList: { add },
        getBoundingClientRect: vi.fn(), addEventListener: (name: string, handler: typeof handlers[string]) => { handlers[name] = handler; } };
      context.cwBindPhotoMotion({ querySelectorAll: () => [card] });
      handlers.pointerenter?.({ pointerType: reduced ? 'mouse' : 'touch' });
      expect(add).not.toHaveBeenCalled();
      expect(card.getBoundingClientRect).not.toHaveBeenCalled();
    }
  });
});
