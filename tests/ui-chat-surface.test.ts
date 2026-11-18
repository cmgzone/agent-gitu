import { createContext, Script } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { CHAT_BUBBLE_MOTION_JS, CHAT_SURFACE_CSS, CHAT_SURFACE_JS } from '../src/server/ui-chat-surface.js';
import { UI_HTML } from '../src/server/ui.js';

function fixture(reduced = false) {
  const media = { matches: reduced };
  const elements: Record<string, any> = {};
  const listeners: Record<string, () => void> = {};
  const sourceComposer = { left: 30, top: 330, width: 370, height: 100 };
  const sourceNav = { left: 70, top: 20, width: 290, height: 48 };
  const composer = { getBoundingClientRect: () => sourceComposer, animate: vi.fn() };
  const nav = { getBoundingClientRect: () => sourceNav, animate: vi.fn() };
  const content = { animate: vi.fn() };
  const view = { querySelector: (selector: string) => selector === '.composer,.cw-composer' ? composer : selector === '.cw-top-nav' ? nav : content };
  elements.view = view;
  for (const id of ['cwHomeBtn', 'cwCurrentChat', 'cwInfoBtn', 'mainChatHistory', 'mainChatDetails', 'mainWorkDetails']) {
    elements[id] = { setAttribute: vi.fn() };
  }
  elements.follow = { focus: vi.fn() };
  elements.approachPanel = { open: false, addEventListener: (name: string, listener: () => void) => { listeners[name] = listener; } };
  elements.stream = { dataset: { follow: 'true' } };
  const root = { isConnected: true, style: { setProperty: vi.fn() } };
  let height = 128, atBottom = true, drawerOpen = false;
  const wrapper = { getBoundingClientRect: () => ({ height }) };
  const disconnect = vi.fn(), observe = vi.fn();
  let resize: () => void = () => {};
  const context = createContext({
    $: (id: string) => elements[id], window: { matchMedia: () => media },
    document: { querySelector: (selector: string) => selector === '.run-chat' ? root : selector === '.run-chat .bottom-composer' ? wrapper : { classList: { contains: () => drawerOpen } } },
    ResizeObserver: class { constructor(callback: () => void) { resize = callback; } disconnect = disconnect; observe = observe; },
    nearBottom: () => atBottom, stickScroll: vi.fn(), openHome: vi.fn(), openToolPanel: vi.fn(),
    cwProfileAgent: () => ({ id: 'gitu' }), cwEnsure: () => ({ agents: [{ id: 'gitu' }] }), cwEnterWorkspace: vi.fn(),
    toggleMobileNav: vi.fn((open: boolean) => { drawerOpen = open; }), wsOpen: vi.fn(), api: vi.fn(),
  });
  new Script(CHAT_BUBBLE_MOTION_JS + CHAT_SURFACE_JS).runInContext(context);
  return { context, media, composer, nav, content, elements, root, observe, disconnect, listeners,
    resize: () => resize(), setHeight: (value: number) => { height = value; }, setAtBottom: (value: boolean) => { atBottom = value; } };
}

describe('Shared main-agent chat and Home motion', () => {
  it('moves the composer between its old and new centers while keeping render synchronous', () => {
    const f = fixture();
    const previous = f.context.captureChatTransition();
    f.composer.getBoundingClientRect = () => ({ left: 15, top: 790, width: 400, height: 120 });
    f.nav.getBoundingClientRect = () => ({ left: 70, top: 12, width: 290, height: 48 });
    f.context.playChatTransition(previous);
    expect(f.composer.animate.mock.calls[0]?.[0][0]).toEqual({ translate: '0px -470px', scale: '0.925 0.8333333333333334', opacity: .65 });
    expect(f.nav.animate.mock.calls[0]?.[0][0].translate).toBe('0px 8px');
    expect(f.content.animate).toHaveBeenCalledOnce();
    expect(f.context.api).not.toHaveBeenCalled();
  });

  it('honors reduced motion before and during a transition', () => {
    const f = fixture(true);
    expect(f.context.captureChatTransition()).toBeNull();
    f.context.chatBubbleEntrance(f.content);
    expect(f.content.animate).not.toHaveBeenCalled();
    f.media.matches = false;
    const previous = f.context.captureChatTransition();
    f.media.matches = true;
    f.context.playChatTransition(previous);
    expect(f.composer.animate).not.toHaveBeenCalled();
  });

  it('does not animate an unmeasurable surface or require the animation API', () => {
    const f = fixture();
    f.context.chatBubbleEntrance({});
    f.context.playChatTransition({ composer: { width: 0, height: 0 } });
    expect(f.composer.animate).not.toHaveBeenCalled();
    expect(f.nav.animate).not.toHaveBeenCalled();
  });

  it('keeps navigation, history, and task details separate from sending messages', () => {
    const f = fixture(); f.context.bindMainChatShell();
    f.elements.cwHomeBtn.onclick();
    f.elements.cwCurrentChat.onclick();
    f.elements.cwInfoBtn.onclick();
    f.elements.mainChatHistory.onclick(); f.elements.mainChatHistory.onclick();
    f.elements.mainChatDetails.onclick();
    expect(f.context.openHome).toHaveBeenCalledOnce();
    expect(f.elements.follow.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(f.context.cwEnterWorkspace).toHaveBeenCalledWith('profile', 'gitu');
    expect(f.context.wsOpen.mock.calls).toEqual([['main'], ['main']]);
    expect(f.context.toggleMobileNav).not.toHaveBeenCalled();
    expect(f.context.openToolPanel).toHaveBeenCalledWith('state');
    expect(f.context.api).not.toHaveBeenCalled();
  });

  it('uses one shared wide measure for the Code-mode stream and composer', () => {
    // Both surfaces must agree, or the composer drifts out of alignment with
    // the message column. The measure is a token so it cannot diverge again.
    expect(CHAT_SURFACE_CSS).toContain('--code-measure:1120px');
    // Match every occurrence; the base rule is the one carrying the measure.
    const streamRules = [...CHAT_SURFACE_CSS.matchAll(/\.run-chat \.stream \{[^}]*\}/g)].map((m) => m[0]);
    const composerRules = [...CHAT_SURFACE_CSS.matchAll(/\.run-chat \.bottom-composer \{[^}]*\}/g)].map((m) => m[0]);
    expect(streamRules.some((rule) => rule.includes('var(--code-measure)'))).toBe(true);
    expect(composerRules.some((rule) => rule.includes('var(--code-measure)'))).toBe(true);
    // The old narrow cap must not linger on either surface.
    for (const rule of [...streamRules, ...composerRules]) expect(rule).not.toContain('760px');
  });

  it('raises only the content wrapper above the Code-mode card', () => {
    // .run.run-chat.code-workspace reserves 256px for .home-sidebar, which is
    // position:fixed. A rule that set position:relative on EVERY direct child
    // also matched the sidebar, putting it back into flow after that 256px
    // padding: the sidebar rendered at x=256 and .run-main started at x=512,
    // leaving a 256px black band at the left and pushing the chat column right.
    const directChildPositionRules = [...CHAT_SURFACE_CSS.matchAll(/\.run\.run-chat\s*>([^{]+)\{([^}]*)\}/g)]
      .filter((match) => /position\s*:\s*relative/.test(match[2] ?? ''));
    expect(directChildPositionRules.map((match) => (match[1] ?? '').trim())).toEqual(['.run-main']);
  });

  it('orders the app switcher Cowork then Code and keeps Code reachable in Cowork', () => {
    // Cowork is the primary mode; Code stays one click away as the second pill.
    // The Cowork shell also used to hide #cwHomeBtn with CSS, which removed the
    // only path back to Code from the top bar.
    const navBlocks = [...UI_HTML.matchAll(/<nav class="cw-top-nav" aria-label="App modes">([\s\S]*?)<\/nav>/g)]
      .map((match) => match[1] ?? '');
    expect(navBlocks.length).toBeGreaterThanOrEqual(3);
    for (const block of navBlocks) {
      expect(block).toContain('id="cwCurrentChat"');
      expect(block).toContain('id="cwHomeBtn"');
      expect(block.indexOf('id="cwCurrentChat"')).toBeLessThan(block.indexOf('id="cwHomeBtn"'));
    }
    expect(UI_HTML).not.toContain('.cw .cw-top-nav #cwHomeBtn { display:none');
  });

  it('measures the composer in Code mode, where the Cowork-only controls are absent', () => {
    // `openRun` renders .run-chat markup with no #cwHomeBtn / #cwCurrentChat /
    // #cwInfoBtn. Binding those unconditionally threw a TypeError that aborted
    // this function before the composer was measured, so --main-composer-height
    // kept a stale default and stream text slid under the floating composer.
    const f = fixture();
    for (const id of ['cwHomeBtn', 'cwCurrentChat', 'cwInfoBtn']) delete f.elements[id];
    f.context.bindMainChatShell();
    expect(f.root.style.setProperty).toHaveBeenLastCalledWith('--main-composer-height', '128px');
    expect(f.observe).toHaveBeenCalledOnce();
  });

  it('reserves the growing composer height and preserves a user reading earlier messages', () => {
    const f = fixture(); f.context.bindMainChatShell();
    expect(f.root.style.setProperty).toHaveBeenLastCalledWith('--main-composer-height', '128px');
    expect(f.observe).toHaveBeenCalledOnce();
    f.context.stickScroll.mockClear(); f.setAtBottom(false); f.setHeight(244); f.resize();
    expect(f.root.style.setProperty).toHaveBeenLastCalledWith('--main-composer-height', '244px');
    expect(f.context.stickScroll).not.toHaveBeenCalled();
    f.setAtBottom(true); f.setHeight(280); f.resize();
    expect(f.context.stickScroll).toHaveBeenCalledOnce();
    f.root.isConnected = false; f.setHeight(300); f.resize();
    expect(f.root.style.setProperty).toHaveBeenCalledTimes(3);
  });

  it('disconnects old composer observers and reflects the work-details disclosure state', () => {
    const f = fixture(); f.context.bindMainChatShell();
    f.elements.mainWorkDetails.onclick(); f.listeners.toggle!();
    expect(f.elements.approachPanel.open).toBe(true);
    expect(f.elements.mainWorkDetails.setAttribute).toHaveBeenLastCalledWith('aria-expanded', 'true');
    f.context.captureChatTransition();
    expect(f.disconnect).toHaveBeenCalledOnce();
    f.context.captureChatTransition();
    expect(f.disconnect).toHaveBeenCalledOnce();
  });

  it('skips entrance animation for replayed main-agent bubbles', () => {
    const f = fixture();
    const bubble = { classList: { add: vi.fn() }, matches: () => true, animate: vi.fn() };
    const stream = { appendChild: vi.fn() };
    f.elements.working = null;
    f.context.S = { active: 'task', sessions: { task: { replaying: true } } };
    f.context.trimTimeline = vi.fn();
    const source = UI_HTML.slice(UI_HTML.indexOf('  function appendLive('), UI_HTML.indexOf('  function sendFollow('));
    const placement = UI_HTML.slice(UI_HTML.indexOf('  function placeDecisionCards('), UI_HTML.indexOf('  function renderApprovals('));
    new Script(placement + source).runInContext(f.context);
    f.context.appendLive(stream, bubble);
    expect(bubble.animate).not.toHaveBeenCalled();
    f.context.S.sessions.task.replaying = false;
    f.context.appendLive(stream, bubble);
    expect(bubble.animate).toHaveBeenCalledOnce();
  });
});
