import { CHARACTER_CSS, CHARACTER_JS } from './ui-characters.js';
import { ACTIVITY_MARK_HTML, REASONING_STREAM_JS } from './ui-activity.js';
import { COWORK_PANELS_CSS, COWORK_PANELS_JS } from './ui-cowork-panels.js';
import { COWORK_COLORS_CSS, COWORK_COLORS_JS } from './ui-cowork-colors.js';

/**
 * Cowork mode UI: a messaging-app style surface (agent roster, DMs, group
 * chats, Telegram/schedule panels) rendered inside the existing web app.
 * Exported as CSS + JS snippets injected into UI_HTML. The JS runs inside the
 * app's main IIFE, so it reuses the helpers there ($, esc, api, toast, S).
 *
 * Visuals: all chrome icons are inline SVG (cwIcon). Teammates use locally
 * bundled OpenDots plush images with activity driven by real progress. Agent
 * names always come from the user — templates only prefill instructions.
 * Written as String.raw and ES5-style so no escape or interpolation surprises
 * leak into the injected markup.
 */

export const COWORK_CSS = String.raw`
  .cw-message-actions { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .cw-message-more { position: absolute; top: 2px; right: 2px; width: 30px; height: 30px; border: 0; border-radius: 50%; background: transparent; color: var(--muted); font-size: 21px; line-height: 1; cursor: pointer; }
  .cw-message-more:hover, .cw-message-more:focus-visible { color: var(--text); background: var(--hover); }
  .cw-message-menu { position: fixed; margin: 0; padding: 6px; width: 164px; max-height: calc(100vh - 24px); overflow-y: auto; border: 1px solid var(--border); border-radius: 16px; background: var(--card); color: var(--text); box-shadow: 0 12px 40px rgba(0,0,0,.25); }
  .cw-message-menu button { display: block; width: 100%; text-align: left; font: inherit; font-size: 12px; color: var(--text); background: transparent; border: 0; border-radius: 10px; padding: 8px 10px; cursor: pointer; }
  .cw-message-menu button:hover, .cw-message-menu button:focus-visible { background: var(--hover); }
  .cw-message-menu button[data-cwaction="delete"] { color: var(--err); }
  .cw-message-menu button:disabled { opacity: .45; cursor: not-allowed; }
  .cw-message-status, .cw-message-refs { font-size: 11px; color: var(--muted); }
  .cw-message-status.failed { color: var(--err); }
  .cw-desktop-dialog .box { width: min(1320px, calc(100vw - 32px)); max-width: none; height: min(860px, calc(100dvh - 32px)); max-height: calc(100dvh - 32px); }
  .cw-desktop-screen { display: flex; flex: 1; align-items: center; justify-content: center; min-height: 0; background: #151821; overflow: hidden; }
  .cw-desktop-screen iframe { display: block; width: 100%; height: 100%; border: 0; }
  .cw-desktop-screen iframe[hidden] { display: none; }
  .cw-desktop-placeholder { padding: 48px 24px; text-align: center; color: #c3c6d1; max-width: 520px; }
  .cw-desktop-toolbar { display: flex; flex: none; flex-wrap: wrap; align-items: center; gap: 8px; padding: 12px 16px; }
  .cw-desktop-status { flex: 1; min-width: 180px; color: var(--muted); font-size: 12px; }
  .cw-desktop-dialog .box { background: #171624; color: #efeafa; border: 1px solid #b29bff26; border-radius: 20px; box-shadow: 0 24px 100px #05040c88; overflow: hidden; }
  .cw-desktop-dialog .bar { background: #211e31; border-bottom: 1px solid #c4b5fd1a; padding: 12px 16px; }
  .cw-desktop-dialog .btn { background: #2a263b; border: 1px solid #c4b5fd24; color: #eee9fb; border-radius: 10px; padding: 8px 11px; font-size: 12px; }
  .cw-desktop-dialog .btn:hover { background: #3a3154; }
  .cw-desktop-dialog .btn:focus-visible { outline: 2px solid #b5a0f4; outline-offset: 2px; }
  .cw-desktop-toolbar { background: #211e31; gap: 6px; padding: 10px 14px; }
  .cw-desktop-status { color: #c6bed8; min-width: 140px; }
  .cw-desktop-dialog .chip { color: #c6bed8; background: #ffffff05; border-color: #c4b5fd24; }
  .cw-desktop-handoff { padding: 10px 16px; background: #7660ba28; border-bottom: 1px solid #bba7ff24; color: #e2d8fc; font-size: 13px; }
  .cw-desktop-handoff[hidden] { display: none; }
  .cw-desktop-handoff b { margin-right: 10px; }
  .cw-desktop-dialog [data-control] { background: #7660ba; border-color: #a993e1; }
  .cw-desktop-dialog .box:fullscreen { width: 100vw; height: 100dvh; max-height: none; border-radius: 0; }
  @media(max-width:720px) { .cw-desktop-status { flex-basis: 100%; } .cw-desktop-dialog .chip { display: none; } }
  .cw-message-refs { margin-top: 6px; overflow-wrap: anywhere; }
  .cw-references > span { max-width: 280px; }

  /* ---- Cowork mode ---- */
  body.cowork .sb, body.cowork .mobile-nav-btn, body.cowork .vresize, body.cowork .topbar { display: none !important; }
  body.cowork #mascotWrap, body.cowork .side-fab { display: none !important; }
  body.cowork .modal { z-index: 100; }
  .cw { position: relative; flex: 1; display: flex; min-height: 0; min-width: 0; width: 100%; overflow: hidden; background: var(--bg); }
  .cw-panel-backdrop, .cw-panel-close, .cw-mobile-only { display: none; }
  .cw-rail { width: var(--sbw, 264px); flex: none; border-right: 1px solid var(--border); display: flex; flex-direction: column; min-height: 0; background: var(--sidebar); }
  .cw-rail-head { display: flex; align-items: center; gap: 6px; padding: 12px 12px 8px; font-weight: 700; letter-spacing: .06em; font-size: 12px; color: var(--text); }
  .cw-rail-head .cw-brand { display: inline-flex; align-items: center; gap: 7px; }
  .cw-rail-head .cw-brand svg { color: var(--accent); }
  .cw-rail-head .spacer { flex: 1; }
  .cw-rail-head .iconbtn { width: 26px; height: 26px; flex: none; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--border2); border-radius: 7px; background: transparent; color: var(--muted); }
  .cw-rail-head .iconbtn svg { width: 14px; height: 14px; }
  .cw-rail-head .iconbtn:hover { color: var(--text); border-color: var(--accent); }
  .cw-learn { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--border2); border-radius: 999px; background: transparent; color: var(--muted); font: inherit; font-size: 10px; letter-spacing: .04em; padding: 3px 8px; cursor: pointer; white-space: nowrap; }
  .cw-learn:hover { color: var(--text); border-color: var(--accent); }
  .cw-rail-head .cw-learn { min-width: 0; overflow: hidden; }
  .cw-learn span:last-child { overflow: hidden; text-overflow: ellipsis; }
  .cw-learn .cw-learn-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); flex: none; }
  .cw-learn.cw-learn-on { color: var(--text); border-color: var(--accent); }
  .cw-learn.cw-learn-on .cw-learn-dot { background: var(--accent); }
  .cw-learn.cw-learn-off { opacity: .55; }
  .cw-rail-search { padding: 0 12px 8px; }
  .cw-rail-search input { width: 100%; box-sizing: border-box; background: var(--card2); border: 1px solid var(--border2); border-radius: 8px; color: var(--text); padding: 6px 10px; font: inherit; font-size: 12px; }
  .cw-rail-search input:focus { outline: none; border-color: var(--accent); }
  .cw-hit { display: block; width: 100%; text-align: left; background: transparent; border: 0; border-bottom: 1px solid var(--border); padding: 8px 6px; color: var(--text); font: inherit; cursor: pointer; }
  .cw-hit:hover { background: var(--card2); }
  .cw-hit .cw-hit-title { font-size: 12px; font-weight: 600; }
  .cw-hit .cw-hit-snippet { font-size: 11px; color: var(--muted); margin-top: 2px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  @media (max-width: 720px) { .cw-learn span:last-child { display: none; } .cw-learn { padding: 3px 6px; } }
  .cw-rail-scroll { flex: 1; overflow-y: auto; padding: 4px 8px 12px; }
  .cw-sec { font-size: 10.5px; font-weight: 700; letter-spacing: .12em; color: var(--faint); margin: 14px 6px 6px; }
  .cw-sec:first-child { margin-top: 4px; }
  .cw-item { display: flex; align-items: center; gap: 9px; width: 100%; text-align: left; background: transparent; border: 1px solid transparent; border-radius: 10px; padding: 7px 8px; color: var(--text); margin-bottom: 2px; }
  .cw-item:hover { background: var(--hover); }
  .cw-item.cur { background: var(--run-dim); border-color: transparent; border-radius: 16px; }
  .cw-item-main { min-width: 0; flex: 1; }
  .cw-item-name { display: block; font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cw-item-sub { display: block; font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cw-teammate { gap: 8px; padding: 10px 8px; min-height: 62px; }
  .cw-teammate .cw-ava { width: 48px; height: 48px; overflow: visible; }
  .cw-teammate .cw-item-name { margin-bottom: 5px; }
  .cw-persona-status { display: flex; align-items: center; gap: 5px; min-width: 0; color: var(--muted); font-size: 11px; }
  .cw-persona-status[hidden] { display: none; }
  .cw-persona-status::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: var(--muted); flex: none; opacity: .65; }
  .cw-persona-status[data-active=true]::before { background: var(--accent); opacity: 1; }
  .cw-persona-status > span { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cw-ava { width: 40px; height: 40px; flex: none; border-radius: 13px; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; }
  .cw-ava img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .cw-ava svg { width: 100%; height: 100%; display: block; }
  .cw-row > .cw-ava { width: 46px; height: 46px; }
  .report-flat .cw-row > .cw-ava { width: 64px; height: 64px; }
  .cw-msgs .cw-row > .cw-ava { display: none; }
  .cw-chat-head .cw-ava { width: 76px; height: 76px; }
  .cw-item .cw-flag { flex: none; color: var(--muted); display: inline-flex; }
  .cw-item .cw-flag svg { width: 14px; height: 14px; }
  .cw-flag.gold { color: var(--evidence); }
  .cw-rail-foot { padding: 10px 12px; border-top: 1px solid var(--border); display: flex; gap: 8px; }
  .cw-rail-foot .btn { flex: 1; padding: 6px 10px; font-size: 12px; }
  .cw-empty-note { font-size: 11.5px; color: var(--muted); padding: 8px 6px 4px; line-height: 1.5; }
  .cw-chat { position: relative; flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .cw-composer-wrap { flex-shrink: 0; }
  .cw-jump-latest { position:absolute; z-index:3; left:50%; bottom:90px; transform:translateX(-50%); display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px; padding:0; border:1px solid var(--border2); border-radius:50%; color:var(--text); background:color-mix(in srgb,var(--bg) 85%,transparent); backdrop-filter:blur(12px); box-shadow:var(--shadow-float); }
  .cw-jump-latest[hidden] { display:none; }
  .cw-jump-latest svg { transform:rotate(180deg); width:18px; height:18px; }
  .cw-jump-latest:hover { color:var(--accent); background:var(--hover); }
  .cw-jump-latest:active { transform:translateX(-50%) scale(.92); }
  .cw-jump-latest:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
  .cw-chat-head { position: absolute; inset: 0 0 auto; z-index: 2; height: 0; background: transparent; border: 0; box-shadow: none; pointer-events: none; }
  .cw-chat-avatar { position: absolute; top: 8px; left: 50%; transform: translateX(-50%); display: inline-flex; flex-direction: column; gap: 4px; align-items: center; justify-content: center; max-width: calc(100% - 150px); background: transparent; }
  .cw-chat-avatar .cw-persona-status { max-width: 100%; box-sizing: border-box; padding: 3px 10px; font-size: 11px; line-height: 16px; color: var(--text);
    border: 1px solid color-mix(in srgb, var(--border2) 65%, transparent); border-radius: 999px;
    background: linear-gradient(135deg, rgba(255,255,255,.12), rgba(255,255,255,.03)), color-mix(in srgb, var(--bg) 68%, transparent);
    backdrop-filter: blur(16px) saturate(1.4); -webkit-backdrop-filter: blur(16px) saturate(1.4);
    box-shadow: 0 2px 12px rgba(0,0,0,.12), inset 0 1px 0 rgba(255,255,255,.12); }
  .cw-chat-avatar .cw-ava { overflow: visible; }
  #cwCharacterStatus[data-tool=true]::before { display: none; }
  .cw-persona-tool { display: inline-flex; flex: none; order: -1; font-style: normal; }
  .cw-persona-tool[hidden] { display: none; }
  .cw-chat-head button { pointer-events: auto; }
  .cw-visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  .cw-chat-head #cwInfoBtn { position: absolute; right: 16px; top: 16px; }
  .cw-chat-head #cwBack { position: absolute; left: 12px; top: 12px; }
  .cw-chat-head .chip { flex: none; display: inline-flex; align-items: center; gap: 5px; }
  .cw-chat-head .chip svg { width: 12px; height: 12px; }
  .cw-info-toggle { border: 1px solid var(--border2); background: transparent; color: var(--muted); border-radius: 8px; padding: 4px 10px; font-size: 12px; flex: none; }
  .cw-info-toggle:hover { color: var(--text); border-color: var(--accent); }
  .cw-panel-toggle { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: 0; border: 0; border-radius: 8px; background: transparent; box-shadow: none; color: var(--muted); }
  .cw-panel-toggle svg { width: 20px; height: 20px; }
  .cw-panel-toggle:hover { color: var(--text); }
  .cw-panel-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .cw-chat-glyph { width: 40px; height: 40px; flex: none; border-radius: 13px; background: var(--card2); color: var(--muted); display: inline-flex; align-items: center; justify-content: center; }
  .cw-chat-glyph svg { width: 17px; height: 17px; }
  .cw-item.cur .cw-chat-glyph { color: var(--accent); background: var(--selected); }
  .cw-thread-row { display: flex; align-items: center; gap: 2px; padding-left: 12px; }
  .cw-thread-row .cw-item { width: auto; min-width: 0; flex: 1; }
  .cw-thread-del { width: 24px; height: 28px; flex: none; border: 0; border-radius: 6px; background: transparent; color: var(--muted); cursor: pointer; padding: 5px; display: inline-flex; align-items: center; justify-content: center; }
  .cw-thread-del:hover { color: var(--err); background: var(--hover); }
  .cw-thread-del svg { width: 13px; height: 13px; }
  .cw-chat-new { width: calc(100% - 12px); margin-left: 12px; color: var(--muted); }
  .cw-chat-new svg { width: 17px; height: 17px; flex: none; }
  .cw-widget-ico { background: var(--selected); color: var(--accent); }
  .cw-widget-ico svg { width: 15px; height: 15px; }
  .cw-widget-body { display: flex; flex-direction: column; gap: 7px; }
  .cw-widget-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12.5px; border-bottom: 1px dashed var(--border); padding: 3px 0; }
  .cw-widget-row:last-child { border-bottom: 0; }
  .cw-widget-row .v { color: var(--text); font-weight: 600; }
  .cw-widget-row .l { color: var(--muted); }
  .cw-widget-row.done .l { text-decoration: line-through; opacity: .65; }
  .cw-widget-bar { height: 8px; border-radius: 999px; background: var(--card2); border: 1px solid var(--border); overflow: hidden; }
  .cw-widget-bar i { display: block; height: 100%; background: var(--accent); }
  .cw-widget-text { font-size: 12.5px; color: var(--text); white-space: pre-wrap; overflow-wrap: anywhere; }
  .cw-msgs { flex: 1; min-height: 0; margin-top: 0; overflow-y: auto; padding: 112px 22px 12px; display: flex; flex-direction: column; gap: 16px; }
  .cw-msgs > * { flex-shrink: 0; }
  .cw-row { display: flex; gap: 12px; max-width: min(92%, 820px); min-width: 0; }
  .cw-row.me { align-self: flex-end; flex-direction: row-reverse; max-width: min(74%, 680px); }
  /* Milky bubbles: frosted, semi-translucent cards built from the theme tokens,
     so they read creamy in light mode and softly glazed in dark mode. */
  .cw-bubble { position: relative; min-width: 0; overflow-wrap: anywhere; font-size: 15px; line-height: 1.58;
    background: color-mix(in srgb, var(--card) 76%, transparent);
    border: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
    border-radius: 20px; border-top-left-radius: 7px; padding: 10px 14px;
    backdrop-filter: blur(12px) saturate(1.35); -webkit-backdrop-filter: blur(12px) saturate(1.35);
    box-shadow: var(--shadow), inset 0 1px 0 color-mix(in srgb, var(--card) 60%, transparent);
    transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
  .cw-bubble:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--border2) 70%, transparent); box-shadow: var(--shadow-float), inset 0 1px 0 color-mix(in srgb, var(--card) 60%, transparent); }
  .cw-row.me .cw-bubble { background: color-mix(in srgb, var(--run-dim) 84%, transparent);
    border-color: color-mix(in srgb, var(--run-border) 45%, transparent);
    border-radius: 20px; border-top-left-radius: 20px; border-bottom-right-radius: 7px; padding: 10px 16px; }
  .cw-row.me .cw-message-more { top: 7px; right: 8px; }
  .cw-bubble .cw-meta { display: flex; align-items: center; gap: 7px; min-height: 24px; padding-right: 30px; font-size: 11px; color: var(--muted); margin-bottom: 5px; }
  .cw-row.me .cw-meta { justify-content: flex-end; }
  .cw-bubble .cw-meta .nm { font-weight: 700; color: var(--text); }
  .cw-bubble .cw-meta .tg { color: var(--faint); }
  .cw-sys { align-self: center; text-align: left; font-size: 12px; line-height: 1.6; color: var(--muted); background: transparent; border: 0; padding: 4px 12px; max-width: 90%; overflow-wrap: anywhere; }
  .cw-sys summary { cursor: pointer; font-weight: 600; }
  .cw-sys .cw-sys-detail { white-space: pre-wrap; margin-top: 8px; max-height: 280px; overflow: auto; }
  .cw-event-row { display: flex; align-items: flex-start; gap: 8px; }
  .cw-event-row > svg { width: 14px; height: 14px; flex: none; margin-top: 3px; }
  .cw-event-row strong { color: var(--text); font-weight: 500; }
  .cw-event-row .cw-event-detail { display: block; font-size: 11px; }
  .cw-checkpoints { align-self: center; width: fit-content; max-width: min(90%, 560px); color: var(--muted); font-size: 11.5px; }
  .cw-checkpoints summary { display: flex; align-items: center; gap: 8px; cursor: pointer; list-style: none; padding: 6px 11px; border: 1px solid var(--border2); border-radius: 999px; background: var(--card2); }
  .cw-checkpoints summary::-webkit-details-marker { display: none; }
  .cw-checkpoints summary:hover { border-color: var(--accent); color: var(--text); }
  .cw-checkpoints .cw-checkpoint-count { color: var(--text); font-weight: 600; }
  .cw-checkpoints .cw-checkpoint-check { color: var(--ok); font-weight: 700; }
  .cw-checkpoints .cw-checkpoint-action { color: var(--accent); margin-left: 3px; white-space: nowrap; }
  .cw-checkpoints[open] summary { border-radius: 11px 11px 0 0; }
  .cw-checkpoints ol { margin: 0; padding: 8px 14px 8px 30px; border: 1px solid var(--border2); border-top: 0; border-radius: 0 0 11px 11px; background: var(--card2); line-height: 1.65; max-height: 220px; overflow-y: auto; }
  .cw-checkpoints li { padding: 1px 0; }
  .cw-checkpoints time { color: var(--faint); margin-left: 7px; }
  .cw-work-history { width: 100%; max-width: min(94%, 820px); padding: 0 0 0 40px; box-sizing: border-box; font-size: 12px; color: var(--muted); }
  .cw-work-history > summary { cursor: pointer; padding: 5px 0; font-weight: 600; }
  .cw-work-history ol { list-style: none; margin: 4px 0 0; padding: 0 0 0 12px; border-left: 1px solid var(--border2); max-height: 230px; overflow-y: auto; }
  .cw-work-history li { padding: 6px 4px; }
  .cw-work-step { display: flex; flex-wrap: wrap; align-items: baseline; gap: 3px 8px; }
  .cw-work-step .result { color: var(--ok); font-size: 11px; }
  .cw-work-step .result.failed { color: var(--err); }
  .cw-work-step .action { color: var(--text); font-weight: 500; }
  .cw-work-step time { margin-left: auto; color: var(--faint); font-size: 10px; }
  .cw-work-update { margin: 3px 0 0; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
  .cw-checkpoint-report { width: calc(100% - 40px); max-width: 740px; margin-left: 40px; padding: 14px 18px; box-sizing: border-box; border: 1px solid var(--border2); border-radius: 14px; background: var(--card); }
  .cw-checkpoint-report header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 10px; margin-bottom: 9px; font-size: 11px; color: var(--muted); }
  .cw-checkpoint-report header strong { color: var(--text); font-size: 12px; }
  .cw-checkpoint-report time { margin-left: auto; color: var(--faint); }
  .cw-checkpoint-report p { margin: 7px 0 0; font-size: 13px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
  .cw-checkpoint-report .cw-checkpoint-next { color: var(--muted); }
  .cw-checkpoint-report .cw-checkpoint-issues { color: var(--warn, var(--text)); }
  .cw-code { display: block; background: var(--card2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font-family: var(--mono); font-size: 12px; overflow-x: auto; white-space: pre; margin: 6px 0; }
  /* Diff rows inside a code block: an edit rendered as plain text hides which
     lines were REMOVED, which is the half of the change the user needs most. */
  .cw-code .cw-dl.add { color: var(--ok); background: var(--ok-dim); display: inline-block; width: 100%; }
  .cw-code .cw-dl.remove { color: var(--err); background: var(--err-dim); display: inline-block; width: 100%; }
  .cw-bubble code { font-family: var(--mono); font-size: 12px; background: var(--card2); border-radius: 4px; padding: 1px 4px; }
  .cw-bubble .cw-mention { color: var(--accent); font-weight: 600; }
  .cw-bubble a { color: var(--run); }
  .cw-table { border-collapse: collapse; margin: 8px 0; font-size: 12.5px; display: block; overflow-x: auto; max-width: 100%; }
  .cw-table th, .cw-table td { border: 1px solid var(--border2); padding: 5px 10px; text-align: left; vertical-align: top; }
  .cw-table th { background: var(--card2); font-weight: 600; }
  .cw-table tbody tr:nth-child(even) { background: var(--card2); }
  .cw-h { margin: 8px 0 4px; font-weight: 700; line-height: 1.4; }
  .cw-h1 { font-size: 16px; }
  .cw-h2 { font-size: 14.5px; }
  .cw-h3 { font-size: 13.5px; }
  .cw-h4, .cw-h5, .cw-h6 { font-size: 13px; color: var(--muted); }
  .cw-embed { margin: 8px 0 4px; }
  .cw-embed iframe { display: block; width: 100%; max-width: 520px; aspect-ratio: 16 / 9; height: auto; border: 1px solid var(--border2); border-radius: 10px; background: #000; }
  .cw-progress-activity { margin-left: auto; }
  .cw-progress-activity .wtext { font-size: 11px; }
  #cwLive { display: flex; flex-direction: column; gap: 10px; }
  #cwLive[hidden] { display: none; }
  .cw-live-row { width: 100%; max-width: min(94%, 820px); }
  .cw-live-bubble { border-color: var(--run-border); border-left: 3px solid var(--accent); background: color-mix(in srgb, var(--run-dim) 58%, var(--card)); box-shadow: none; }
  .cw-live-bubble:hover { transform: none; box-shadow: none; border-color: var(--run-border); }
  .cw-live-bubble.has-tool { background: color-mix(in srgb, var(--selected) 72%, var(--card)); border-left-color: var(--evidence); }
  .cw-live-bubble { flex: 1; }
  .cw-live-bubble .cw-meta { margin-bottom: 2px; padding-right: 0; flex-wrap: wrap; gap: 3px 10px; }
  .cw-live-bubble .cw-meta .nm { min-width: 0; overflow-wrap: anywhere; }
  .cw-live-bubble .cw-progress-activity { flex-shrink: 0; }
  .cw-live-bubble .cw-progress-text { color: var(--text); font-size: 13px; line-height: 1.45; max-height: 7em; overflow-y: auto; }
  .cw-live-bubble .cw-live-kicker { display: block; color: var(--muted); font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 4px; }
  @keyframes cwpulse { 0%, 70%, 100% { opacity: .25; transform: translateY(0); } 35% { opacity: 1; transform: translateY(-2px); } }
  /* The live activity indicator: one small dot whose animation and colour track
     the phase — thinking, reasoning, responding, or a tool at work. */
  .cw-progress-activity .cw-phase-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--run); box-shadow: 0 0 6px var(--run); animation: cwphase 1.1s ease-in-out infinite; }
  @keyframes cwphase { 0%, 100% { transform: scale(.72); opacity: .45; } 50% { transform: scale(1); opacity: 1; } }
  .activity-indicator.phase-thinking .cw-phase-dot { background: var(--run); }
  .activity-indicator.phase-reasoning .cw-phase-dot { background: var(--evidence); box-shadow: 0 0 7px var(--evidence); animation-duration: 1.6s; }
  .activity-indicator.phase-reasoning .spinner { border-top-color: var(--evidence); }
  .activity-indicator.phase-reasoning .thinking-waves i { background: var(--evidence); animation-duration: 1.5s; }
  .activity-indicator.phase-responding .cw-phase-dot { background: var(--ok); box-shadow: 0 0 7px var(--ok); animation-duration: .6s; }
  .activity-indicator.phase-responding .spinner { display: none; }
  .activity-indicator.phase-responding .thinking-waves i { background: var(--ok); animation-duration: .45s; }
  .activity-indicator.phase-working .cw-phase-dot { background: var(--accent); box-shadow: 0 0 7px var(--accent); animation-duration: .9s; }
  .activity-indicator.phase-working .thinking-waves { display: none; }
  /* The tool's own mark: a favicon overlays the fallback glyph and removes
     itself when it cannot load (offline), which is when the glyph shows. */
  .cw-tool-ico { position: relative; display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; flex: none; color: var(--muted); }
  .cw-tool-ico svg { width: 13px; height: 13px; }
  .cw-tool-ico .cw-fav { position: absolute; inset: 0; width: 14px; height: 14px; border-radius: 3px; background: var(--card); }
  /* Streaming replies carry a caret while the model is still writing them. */
  .cw-progress-text::after { content: ''; display: inline-block; width: 7px; height: 13px; margin-left: 3px; vertical-align: -2px; border-radius: 1px; background: var(--accent); animation: cwcaret 1s steps(1) infinite; }
  .cw-progress-text[hidden]::after { display: none; }
  .cw-live-bubble.has-tool .cw-progress-text::after { display: none; }
  @keyframes cwcaret { 0%, 45% { opacity: 1; } 50%, 100% { opacity: 0; } }
  .cw-composer-wrap { display: flex; flex-direction: column; min-height: 0; max-height: 60%; padding: 10px 20px 16px; }
  .cw-composer-wrap > * { min-height: 0; }
  .cw-composer-wrap > .cw-composer { flex-shrink: 0; }
  .cw-composer-folders { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 8px; max-height: 64px; overflow-y: auto; }
  .cw-composer-folders[hidden] { display: none; }
  .cw-folder-tag { display: inline-flex; align-items: center; gap: 6px; max-width: min(100%, 360px); border: 1px solid var(--border2); background: var(--selected); color: var(--text); border-radius: 999px; padding: 4px 7px 4px 9px; font-size: 11.5px; }
  .cw-folder-tag > svg { width: 13px; height: 13px; color: var(--accent); flex: none; }
  .cw-folder-tag-label { min-width: 0; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
  .cw-folder-tag-path { min-width: 0; max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--faint); font-size: 10.5px; }
  .cw-folder-tag button { width: 20px; height: 20px; flex: none; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 999px; background: transparent; color: var(--muted); padding: 0; }
  .cw-folder-tag button:hover { color: var(--text); background: var(--hover); }
  .cw-folder-tag button svg { width: 12px; height: 12px; }

  .cw-mentions { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .cw-mentions button { font-size: 11.5px; border: 1px solid var(--border2); background: var(--card); color: var(--text); border-radius: 999px; padding: 2px 10px; }
  .cw-mentions button:hover { border-color: var(--accent); }
  .cw-composer { display: flex; align-items: flex-end; gap: 8px; background: var(--card); border: 1px solid var(--border); border-radius: 26px; padding: 12px; box-shadow: 0 8px 28px rgba(0,0,0,.1); }
  .cw-composer textarea { flex: 1; min-width: 0; background: transparent; border: 0; color: var(--text); resize: none; outline: none; max-height: min(160px, 20dvh); font: 15px/1.5 var(--sans); }
  .cw-composer .cw-send { width: 32px; height: 32px; flex: none; border-radius: 10px; border: 0; background: var(--accent); color: var(--on-accent); font-size: 15px; display: inline-flex; align-items: center; justify-content: center; }
  .cw-composer .cw-send:disabled { opacity: .4; cursor: default; }
  .cw-composer .cw-send.stop { background: var(--err); }
  .cw-composer .cw-send.queue { background: var(--run); color: #fff; }
  .cw-composer .cw-stop-secondary { width: 32px; height: 32px; flex: none; border: 1px solid var(--err-border); border-radius: 10px; background: var(--err-dim); color: var(--err); display: inline-flex; align-items: center; justify-content: center; }
  .cw-composer .cw-stop-secondary[hidden] { display: none; }
  .cw-composer .cw-stop-secondary svg { width: 14px; height: 14px; }
  .cw-attach { width: 32px; height: 32px; flex: none; border: 1px solid var(--border2); background: transparent; color: var(--muted); border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; }
  .cw-attach:hover { color: var(--text); border-color: var(--accent); }
  .cw-pending { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
  .cw-pending span { display: inline-flex; align-items: center; gap: 5px; max-width: 260px; border: 1px solid var(--border2); background: var(--card); border-radius: 8px; padding: 4px 8px; font-size: 11.5px; color: var(--muted); }
  .cw-pending button { border: 0; background: transparent; color: var(--muted); padding: 0; line-height: 1; }
  .cw-pending img { width: 36px; height: 36px; object-fit: cover; border-radius: 4px; }
  .cw-files { display: grid; gap: 7px; margin-top: 8px; }
  .cw-file { display: flex; align-items: center; gap: 9px; min-width: 230px; max-width: 520px; border: 1px solid var(--border2); background: var(--card2); border-radius: 10px; padding: 8px 10px; }
  .cw-thumb { display: block; max-width: 240px; max-height: 170px; border-radius: 8px; border: 1px solid var(--border2); object-fit: cover; margin-bottom: 6px; }
  .cw-media { display: block; width: 250px; max-width: 100%; height: 34px; margin-bottom: 6px; }
  .cw-media[controls] { height: 40px; }
  .cw-file-ico { color: var(--accent); display: inline-flex; flex: none; }
  .cw-file-ico svg { width: 20px; height: 20px; }
  .cw-file-main { flex: 1; min-width: 0; }
  .cw-file-name { display: block; font-weight: 600; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cw-file-meta { display: block; color: var(--faint); font-size: 10.5px; }
  .cw-file-actions { display: flex; gap: 5px; flex: none; }
  .cw-file-actions .btn { padding: 3px 8px; font-size: 11px; }
  .cw-work { display: grid; gap: 8px; margin-bottom: 8px; max-height: min(25dvh, 220px); overflow-y: auto; overscroll-behavior: contain; }
  .cw-pending, .cw-mentions { max-height: 64px; overflow-y: auto; }
  .cw-todos, .cw-request { border: 1px solid var(--border); background: var(--card); border-radius: 11px; padding: 8px 10px; }
  .cw-todos { border: 0; border-top: 1px solid var(--border); background: transparent; border-radius: 0; padding: 10px 4px; }
  .cw-todos summary { cursor: pointer; color: var(--muted); font-size: 11.5px; font-weight: 600; }
  .cw-todo { display: grid; grid-template-columns: 12px minmax(0, 1fr); gap: 2px 7px; align-items: start; margin-top: 6px; font-size: 11.5px; color: var(--muted); }
  .cw-todo > span:first-child { grid-row: 1 / span 2; }
  .cw-todo b { grid-column: 2; min-width: 0; overflow-wrap: anywhere; color: var(--text); font-weight: 500; }
  .cw-todo-meta { grid-column: 2; display: flex; flex-wrap: wrap; gap: 2px 12px; min-width: 0; }
  .cw-todo.done { opacity: .6; text-decoration: line-through; }
  .cw-todo .cw-todo-owner { min-width: 0; overflow-wrap: anywhere; color: var(--faint); }
  .cw-todo.in_progress > span:first-child { color: var(--accent); animation: cwpulse 1.2s infinite; }
  .cw-todo.blocked > span:first-child { color: var(--err); }
  .cw-orb-body { transform-origin: 50% 60%; animation: cworb-idle 5s ease-in-out infinite; }
  .cw-orb-eyes { transform-origin: 50% 45%; animation: cworb-blink 6.2s infinite; }
  .cw-ava.working .cw-orb-body { animation: cworb-work 1.4s ease-in-out infinite; }
  .cw-ava.working img { animation: cworb-work 1.4s ease-in-out infinite; }
  .cw-chat-head .cw-ava, .cw-avprev { overflow: visible; }
  .cw-item:hover .cw-ava { transform: rotate(-7deg); }
  .cw-ava { transition: transform .2s ease; }
  .cw button:focus-visible, .cw summary:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  .cw-composer:focus-within { border-color: var(--accent); }
  .cw-live-status { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 11px; }
  .cw-live-status::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--ok); }
  .cw-live-status.busy::before { background: var(--accent); animation: cwpulse 1.1s infinite; }
  @keyframes cworb-idle { 0%, 100% { transform: translateY(0) rotate(-4deg); } 50% { transform: translateY(-1.5px) rotate(4deg); } }
  @keyframes cworb-work { 0%, 100% { transform: translateY(0) rotate(-9deg); } 50% { transform: translateY(-3px) rotate(9deg); } }
  @keyframes cworb-blink { 0%, 43%, 47%, 100% { transform: scaleY(1); } 45% { transform: scaleY(.1); } }
  @media (prefers-reduced-motion: reduce) { .cw *, .cw *::before { animation: none !important; transition: none !important; } }
  .cw-request { border-color: var(--run-border); box-shadow: 0 0 0 1px var(--run-dim) inset; }
  .cw-request .k { color: var(--accent); font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
  .cw-request .t { font-size: 12.5px; font-weight: 650; margin-top: 3px; }
  .cw-request .d { font-size: 11.5px; color: var(--muted); margin-top: 3px; white-space: pre-wrap; }
  .cw-action-service { display: inline-flex; align-items: center; gap: 6px; margin: 8px 0; color: var(--muted); font-size: 12px; }
  .cw-action-service svg { width: 14px; height: 14px; }
  .cw-action-fields { display: grid; grid-template-columns: minmax(70px, 1fr) minmax(0, 3fr); gap: 6px 12px; margin: 8px 0; font-size: 12px; }
  .cw-action-fields dt { color: var(--muted); overflow-wrap: anywhere; }
  .cw-action-fields dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .cw-action-fields .cw-action-fields { margin: 0; }
  .cw-action-values { margin: 0; padding-left: 18px; }
  .cw-action-values li + li { margin-top: 4px; }
  .cw-action-account { margin-top: 8px; color: var(--muted); font-size: 11px; overflow-wrap: anywhere; }
  .cw-action-account summary { cursor: pointer; }
  .cw-request .cw-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .cw-request .cw-actions .btn { padding: 4px 10px; font-size: 11.5px; }
  .cw-request input { flex: 1; min-width: 150px; background: var(--card2); border: 1px solid var(--border2); color: var(--text); border-radius: 7px; padding: 5px 8px; }
.cw-request .cw-credential-form { margin-top: 8px; display: flex; flex-direction: column; gap: 8px; }
.cw-request .cw-credential-form .connection-fields { display: grid; gap: 8px; }
.cw-request .cw-credential-form .connection-field { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: var(--muted); }
.cw-request .cw-credential-form .connection-field input { background: var(--card2); border: 1px solid var(--border2); color: var(--text); border-radius: 7px; padding: 5px 8px; }
.cw-request .cw-credential-form .connection-secret-actions { display: flex; align-items: center; gap: 8px; }
.cw-request .cw-credential-form .connection-secret-actions .hint { flex: 1; font-size: 10.5px; color: var(--muted); }
.cw-request .cw-credential-form .connection-error { color: var(--err); font-size: 11.5px; }
.cw-request .cw-credential-form .cw-ssh-fingerprint { font: 11px/1.5 monospace; overflow-wrap: anywhere; padding: 6px 8px; background: var(--card2); border-radius: 6px; }
.cw-request .cw-credential-form .cw-ssh-confirm { display: flex; flex-direction: row; gap: 6px; align-items: flex-start; }
.cw-request .cw-credential-form .cw-ssh-confirm input[type="checkbox"] { width: auto; margin: 2px 0 0; padding: 0; accent-color: var(--accent); }
.cw-request .cw-credential-form .cw-ssh-confirm[hidden] { display: none; }
.cw-request .cw-credential-form > .btn { align-self: flex-start; padding: 4px 10px; font-size: 11.5px; }
  .cw-modal.cw-doc-modal .box { width: min(980px, 94vw); height: min(820px, 92dvh); max-height: 92dvh; }
  .cw-doc-modal .bar > span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cw-doc-frame { width: 100%; flex: 1; min-height: 0; border: 0; background: #fff; }
  .cw-info { width: 320px; box-sizing: border-box; flex: none; border-left: 1px solid var(--border); overflow-y: auto; padding: 0 18px 24px; min-height: 0; background: var(--bg); }
  .cw-info-bar { position: sticky; top: 0; z-index: 3; display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 -18px 18px; padding: 10px 14px 10px 18px; border-bottom: 1px solid var(--border); background: color-mix(in srgb, var(--bg) 92%, transparent); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
  .cw-info-title { display: flex; align-items: center; gap: 8px; min-width: 0; color: var(--text); font-size: 12px; font-weight: 600; }
  .cw-info-title svg { width: 16px; height: 16px; color: var(--muted); flex: none; }
  .cw-profile-close { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 32px; height: 32px; padding: 0; border: 0; border-radius: 9px; background: transparent; color: var(--muted); cursor: pointer; }
  .cw-profile-close:hover { color: var(--text); background: var(--hover); }
  .cw-profile-close svg { width: 18px; height: 18px; }
  .cw-info h4 { margin: 0 0 12px; font-size: 10.5px; letter-spacing: .12em; color: var(--faint); font-weight: 700; }
  .cw-info .cw-card { background: transparent; border: 0; border-bottom: 1px solid var(--border); border-radius: 0; padding: 4px 0 20px; margin-bottom: 20px; }
  .cw-profile-hero { display: flex; align-items: center; gap: 14px; padding: 0 0 12px; }
  .cw-profile-portrait { display: flex; align-items: center; justify-content: center; flex: none; width: 104px; height: 104px; border-radius: 28px; background: radial-gradient(circle, color-mix(in srgb, var(--accent) 12%, transparent), transparent 72%); }
  .cw-profile-hero .cw-ava { overflow: visible; }
  .cw-profile-identity { flex: 1; min-width: 0; }
  .cw-profile-name { margin: 0; max-width: 100%; color: var(--text); font-size: 21px; font-weight: 650; line-height: 1.25; overflow-wrap: anywhere; }
  .cw-profile-tagline { margin-top: 5px; color: var(--muted); font-size: 12px; line-height: 1.45; overflow-wrap: anywhere; }
  .cw-profile-hero .chip { display: inline-flex; align-items: center; gap: 5px; margin-top: 9px; font-size: 10.5px; }
  .cw-profile-presence { margin-bottom: 12px; }
  .cw-profile-presence .cw-persona-status { width: fit-content; max-width: 100%; border: 1px solid var(--border); border-radius: 999px; padding: 4px 9px; font-size: 11px; }
  .cw-profile-edit { display: flex; align-items: center; justify-content: center; gap: 7px; width: 100%; min-height: 34px; margin-bottom: 18px; border-radius: 10px; font-size: 12px; }
  .cw-profile-edit svg, .cw-profile-tags svg, .cw-profile-footer svg, .cw-profile-memory svg { width: 14px; height: 14px; flex: none; }
  .cw-profile-section { padding: 17px 0; border-top: 1px solid var(--border); }
  .cw-profile-heading, .cw-info .cw-profile-heading { display: flex; align-items: center; gap: 8px; margin: 0 0 13px; color: var(--text); font-size: 12px; font-weight: 600; letter-spacing: 0; }
  .cw-profile-heading svg { width: 16px; height: 16px; color: var(--muted); flex: none; }
  .cw-profile-copy, .cw-profile-description { margin: 0; color: var(--muted); font-size: 12px; line-height: 1.65; overflow-wrap: anywhere; }
  .cw-profile-copy { white-space: pre-wrap; padding-top: 12px; }
  .cw-profile-copy h5 { margin: 16px 0 7px; color: var(--text); font-size: 12px; font-weight: 600; }
  .cw-profile-copy h5:first-child { margin-top: 0; }
  .cw-profile-instructions { margin-top: 12px; }
  .cw-profile-instructions summary { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 0; font-size: 11.5px; font-weight: 500; color: var(--text); cursor: pointer; list-style: none; }
  .cw-profile-instructions summary::-webkit-details-marker { display: none; }
  .cw-profile-instructions summary svg { width: 14px; height: 14px; color: var(--muted); flex: none; transition: transform .15s ease; }
  .cw-profile-instructions[open] summary svg { transform: rotate(180deg); }
  .cw-profile-details { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 14px 10px; margin: 0; font-size: 12px; line-height: 1.45; }
  .cw-profile-details dt { display: flex; align-items: flex-start; gap: 7px; color: var(--muted); }
  .cw-profile-details dt svg { width: 14px; height: 14px; margin-top: 2px; flex: none; }
  .cw-profile-details dd { min-width: 0; margin: 0; color: var(--text); overflow-wrap: anywhere; }
  .cw-profile-provider { display: block; margin-top: 3px; font-size: 10.5px; color: var(--muted); }
  .cw-profile-tags, .cw-profile-skills { display: flex; flex-wrap: wrap; gap: 6px; }
  .cw-profile-tags { margin-top: 16px; }
  .cw-profile-tags .chip { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; }
  .cw-profile-skill { display: inline-flex; padding: 5px 8px; border-radius: 7px; background: var(--hover); color: var(--text); font-size: 11px; line-height: 1.4; overflow-wrap: anywhere; max-width: 100%; box-sizing: border-box; }
  .cw-profile-empty { font-size: 12px; color: var(--muted); }
  .cw-profile-memory { display: flex; align-items: center; gap: 10px; font-size: 11.5px; color: var(--muted); }
  .cw-profile-memory strong { color: var(--text); font-size: 21px; font-weight: 600; }
  .cw-profile-memory .btn { display: inline-flex; align-items: center; gap: 5px; margin-left: auto; padding: 5px 8px; font-size: 11px; }
  .cw-info .cw-profile .cw-computer-section { border: 1px solid var(--border); border-radius: 14px; padding: 14px; margin: 0 0 18px; background: color-mix(in srgb, var(--card) 55%, transparent); }
  .cw-computer-summary { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
  .cw-computer-summary .chip { font-size: 10.5px; }
  .cw-computer-summary .cw-computer-state { margin-left: auto; text-transform: capitalize; }
  .cw-profile .cw-computer-section p { margin: 10px 0 12px; color: var(--muted); font-size: 11.5px; line-height: 1.55; }
  .cw-computer-buttons { display: flex; flex-direction: column; gap: 7px; }
  .cw-computer-buttons .btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 32px; border-radius: 8px; font-size: 11.5px; }
  .cw-computer-buttons .btn svg { width: 14px; height: 14px; flex: none; }
  .cw-computer-secondary { display: flex; gap: 7px; }
  .cw-computer-secondary .btn { flex: 1; }
  .cw-computer-reason { color: var(--muted); font-size: 12px; line-height: 1.55; }
  .cw-computer-reason .cw-reason-code { display: inline-block; margin-right: 6px; padding: 1px 7px; border: 1px solid var(--border); border-radius: 999px; background: var(--hover); color: var(--text); font-family: var(--mono); font-size: 11px; }
  .cw-profile-footer { padding-top: 16px; border-top: 1px solid var(--border); }
  .cw-profile-footer .btn { display: inline-flex; align-items: center; gap: 7px; padding: 6px 0; border: 0; color: var(--err); background: transparent; font-size: 11.5px; }
  .cw-info .cw-mrow { display: flex; align-items: center; gap: 8px; padding: 5px 0; }
  .cw-info .cw-mrow .nm { flex: 1; min-width: 0; font-weight: 600; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cw-info .cw-mrow .tg { color: var(--muted); font-weight: 400; }
  .cw-info .cw-mrow button { background: transparent; border: 0; color: var(--muted); padding: 2px; display: inline-flex; }
  .cw-info .cw-mrow button svg { width: 14px; height: 14px; }
  .cw-info .cw-mrow button:hover { color: var(--text); }
  .cw-info .cw-mrow button.crown.on { color: var(--evidence); }
  .cw-info label { display: block; font-size: 11.5px; color: var(--muted); margin: 8px 0 3px; }
  .cw-info input[type=text], .cw-info input[type=password], .cw-info select, .cw-info textarea { width: 100%; background: var(--card2); border: 1px solid var(--border2); color: var(--text); border-radius: 8px; padding: 6px 9px; font: inherit; font-size: 12.5px; }
  .cw-info .cw-actions { display: flex; gap: 8px; margin-top: 10px; }
  .cw-info .cw-actions .btn { padding: 5px 12px; font-size: 12px; }
  .cw-info .cw-check { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--text); margin-top: 8px; }
  .cw-mission { background: var(--card2); border: 1px solid var(--border); border-radius: 10px; padding: 10px; margin-bottom: 8px; }
  .cw-mission .t { font-weight: 600; font-size: 12.5px; margin-bottom: 4px; overflow-wrap: anywhere; }
  .cw-mission .d { font-size: 11px; color: var(--muted); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .cw-mission .p { font-size: 11.5px; color: var(--muted); margin-top: 6px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .cw-mission .p.ok { color: var(--ok); }
  .cw-mission .p.warn { color: var(--evidence); }
  .cw-mission button { margin-top: 8px; padding: 3px 10px; font-size: 11.5px; }
  /* Sub-agent execution tree: who a teammate spawned, live spend against its
     grant, the evidence gate's verdict, and why anything is blocked. */
  .cw-tree { margin-top: 8px; border-top: 1px dashed var(--border); padding-top: 8px; }
  .cw-tree-title { display: flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: var(--faint); margin-bottom: 7px; }
  .cw-tree-title svg { width: 12px; height: 12px; }
  .cw-troot { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--muted); margin: 6px 0 3px; }
  .cw-troot .cw-tdot { background: var(--accent); }
  .cw-tnode { position: relative; padding: 2px 0 0 14px; }
  .cw-tnode::before { content: ''; position: absolute; left: 4px; top: 0; bottom: 2px; border-left: 1px solid var(--border2); }
  .cw-tnode:last-child::before { height: 14px; bottom: auto; }
  .cw-tnode::after { content: ''; position: absolute; left: 4px; top: 14px; width: 8px; border-top: 1px solid var(--border2); }
  .cw-trow { display: flex; align-items: center; gap: 7px; padding: 4px 8px; border-radius: 8px; background: var(--card); border: 1px solid var(--border); animation: cwtnode-in .3s ease; transition: border-color .3s ease, box-shadow .3s ease; }
  @keyframes cwtnode-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  .cw-tdot { width: 8px; height: 8px; border-radius: 50%; flex: none; background: var(--faint); }
  .cw-tnode.running .cw-trow { border-color: var(--run-border); box-shadow: 0 0 0 1px var(--run-dim) inset; }
  .cw-tnode.running .cw-tdot { background: var(--accent); box-shadow: 0 0 7px var(--accent); animation: cwpulse 1.1s infinite; }
  .cw-tnode.completed .cw-tdot { background: var(--ok); }
  .cw-tnode.failed .cw-tdot { background: var(--err); }
  .cw-tnode.blocked .cw-tdot { background: var(--evidence); box-shadow: 0 0 7px var(--evidence); animation: cwpulse 1.8s infinite; }
  .cw-tnode.terminated .cw-trow, .cw-tnode.orphaned .cw-trow { opacity: .62; }
  .cw-tname { font-weight: 600; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cw-tstatus { font-size: 10.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cw-tnode.failed .cw-tstatus { color: var(--err); }
  .cw-tnode.blocked .cw-tstatus { color: var(--evidence); }
  .cw-tnode.completed .cw-tstatus { color: var(--ok); }
  .cw-tevidence { font-size: 9.5px; font-weight: 700; letter-spacing: .02em; padding: 1px 6px; border-radius: 999px; border: 1px solid var(--border2); color: var(--muted); flex: none; }
  .cw-tevidence.ok { color: var(--ok); border-color: var(--ok); }
  .cw-tevidence.bad { color: var(--err); border-color: var(--err); }
  .cw-tbar { position: relative; flex: none; width: 58px; height: 4px; border-radius: 2px; background: var(--border); overflow: hidden; margin-left: auto; }
  .cw-tbar i { position: absolute; inset: 0 auto 0 0; display: block; background: var(--accent); border-radius: 2px; transition: width .6s ease; }
  .cw-tnode.completed .cw-tbar i { background: var(--ok); }
  .cw-tnode.failed .cw-tbar i { background: var(--err); }
  .cw-tspend { font-size: 10.5px; color: var(--muted); font-variant-numeric: tabular-nums; flex: none; }
  .cw-tnode .cw-tbar + .cw-tspend { margin-left: 0; }
  .cw-hero { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 24px; overflow: auto; text-align: center; }
  .cw-hero h1 { margin: 0; font-size: 26px; }
  .cw-hero p { margin: 0; color: var(--muted); max-width: 560px; }
  .cw-hero .cw-hero-ico { color: var(--accent); opacity: .9; }
  .cw-hero .cw-hero-ico svg { width: 56px; height: 56px; }
  .cw-hero .cw-hero-cta { display: flex; gap: 10px; }
  .cw-hero .cw-hero-back { margin-top: 4px; }
  /* Onboarding: before the first teammate exists, cowork is ONE full page —
     the roster rail and info panel would only frame an empty hero. */
  .cw.cw-empty .cw-rail, .cw.cw-empty .cw-info { display: none !important; }
  .cw-modal .box { width: 660px; }
  /* The app's generic progress-strip .bar rule sets height 6px + overflow
     hidden; without these overrides it crushes the modal header (the browse
     modal has the same latent bug). */
  .cw-modal .bar { height: auto; margin: 0; border-radius: 0; background: transparent; overflow: visible; flex: none; display: flex; gap: 8px; align-items: center; padding: 13px 16px; border-bottom: 1px solid var(--border); }
  .cw-modal .bar span { height: auto; font-weight: 600; font-size: 13.5px; }
  .cw-modal .cw-body { flex: 1; min-height: 0; padding: 14px 16px 18px; overflow-y: auto; }
  .cw-modal label { display: block; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--faint); margin: 14px 0 5px; font-weight: 700; }
  .cw-modal input[type=text], .cw-modal input[type=password], .cw-modal select, .cw-modal textarea { width: 100%; background: var(--card2); border: 1px solid var(--border2); color: var(--text); border-radius: 9px; padding: 8px 11px; font: inherit; font-size: 13px; }
  .cw-modal input[type=text]:focus, .cw-modal input[type=password]:focus, .cw-modal select:focus, .cw-modal textarea:focus { border-color: var(--accent); outline: none; }
  .cw-modal textarea { resize: vertical; min-height: 96px; line-height: 1.55; }
  .cw-avrow { display: flex; gap: 16px; align-items: center; margin-top: 6px; padding: 12px; background: var(--card2); border: 1px solid var(--border); border-radius: 12px; }
  .cw-avprev { width: 128px; height: 128px; flex: none; border-radius: 14px; background: var(--card2); border: 1px solid var(--border2); overflow: hidden; display: flex; align-items: center; justify-content: center; }
  .cw-avprev img, .cw-avprev svg { width: 116px; height: 116px; }
  .cw-avopts { flex: 1; min-width: 0; }
  .cw-avopts .cw-shapes { display: flex; flex-wrap: wrap; gap: 6px; }
  .cw-avopts .cw-shapes button { font-size: 12px; background: transparent; border: 1px solid var(--border2); color: var(--muted); border-radius: 9px; padding: 5px 13px; text-transform: capitalize; }
  .cw-avopts .cw-shapes button.cur { color: var(--text); border-color: var(--accent); background: var(--run-dim); font-weight: 600; }
  .cw-avopts .cw-colors { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .cw-avopts .cw-colors button { width: 26px; height: 26px; border-radius: 50%; border: 2px solid rgba(255,255,255,.12); }
  .cw-avopts .cw-colors button.cur { border-color: #fff; box-shadow: 0 0 0 2px var(--accent); }
  .cw-modal .cw-templates { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 2px; }
  .cw-modal .cw-templates button { font-size: 12px; background: var(--card2); border: 1px solid var(--border2); color: var(--text); border-radius: 999px; padding: 4px 13px; }
  .cw-modal .cw-templates button:hover { border-color: var(--accent); }
  .cw-modal .cw-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .cw-modal .cw-skills { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .cw-modal .cw-skills button { font-size: 11.5px; font-family: var(--mono); background: var(--card2); border: 1px solid var(--border2); color: var(--muted); border-radius: 999px; padding: 3px 11px; }
  .cw-modal .cw-skills button.on { color: var(--ok); border-color: var(--ok-border); }
  .cw-modal .cw-perm { display: flex; flex-direction: column; gap: 9px; margin-top: 12px; padding: 12px; background: var(--card2); border: 1px solid var(--border); border-radius: 12px; }
  .cw-modal .cw-perm label { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 12.5px; color: var(--text); text-transform: none; letter-spacing: 0; font-weight: 400; }
  .cw-modal .cw-note { font-size: 11px; color: var(--faint); margin-top: 10px; line-height: 1.5; }
  .cw-modal .cw-check { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text); }
  .cw-modal .cw-check input { width: 16px; height: 16px; accent-color: var(--accent); }
  .cw-modal .cw-foot { flex-shrink: 0; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: flex-end; padding: 12px 16px; border-top: 1px solid var(--border); background: var(--card2); }
  @media (max-width: 1180px) {
    .cw-info { display: none; position: static; width: min(320px, 42vw); box-sizing: border-box; background: var(--bg); }
    .cw-panel-backdrop { position: absolute; inset: 0; z-index: 50; border: 0; padding: 0; background: var(--overlay); }
    .cw.overlay-open .cw-panel-backdrop { display: block; }
  }
  @media (max-width: 720px) { .cw-msgs { padding: 98px 12px 8px; gap: 14px; } .cw-row, .cw-row.me { max-width: 100%; } .cw-composer-wrap { padding: 8px 12px 12px; } .cw-chat-avatar { top: 7px; } .cw-chat-head .cw-ava { width: 62px; height: 62px; } .cw-file { min-width: 0; flex-wrap: wrap; } .cw-file-actions { margin-left: auto; } .cw-modal .box { max-width: 96vw; } .cw-modal .cw-2col { grid-template-columns: 1fr; } .cw-info-toggle, .cw-panel-toggle, .cw-send, .cw-attach { min-height: 40px; min-width: 40px; } }
  @media (max-width: 720px) { .cw-info { width: 100%; border-left: 0; } .cw-profile-close { min-width: 40px; min-height: 40px; }
    .cw.info-open .cw-chat { display: none; }
    .cw-rail { width: min(300px, 86vw); position: fixed; inset: 0 auto 0 0; z-index: 80; transform: translateX(-105%); transition: transform .18s ease; box-shadow: none; background: var(--bg); }
    .cw-mobile-only, .cw-rail > .cw-panel-close { display: block; }
    .cw-rail > .cw-panel-close { align-self: flex-end; margin: 8px 12px 0; }
    .cw.rail-open .cw-rail { transform: none; box-shadow: 14px 0 40px rgba(0,0,0,.3); } }
  @media (max-height: 600px) { .cw-work { max-height: 18dvh; } .cw-pending, .cw-mentions { max-height: 40px; } .cw-chat-avatar { top: 5px; } .cw-chat-head .cw-ava { width: 52px; height: 52px; } .cw-msgs { padding-top: 84px; } }
  ${CHARACTER_CSS}
  ${COWORK_PANELS_CSS}
  ${COWORK_COLORS_CSS}
`;

export const COWORK_JS = String.raw`
  ${REASONING_STREAM_JS}
  ${CHARACTER_JS}
  ${COWORK_PANELS_JS}
  // ==================== COWORK MODE ====================
  var CW_DOT_COLORS = { 'dot-blue': '#5ba8ff', 'dot-mint': '#3fd68f', 'dot-orange': '#c9a86a', 'dot-purple': '#8f80ff' };
  var CW_SHAPES = ['dot-blue', 'dot-mint', 'dot-orange', 'dot-purple'];
  ${COWORK_COLORS_JS}
  function cwAvatarShape(shape, color) {
    if (CW_SHAPES.indexOf(shape) >= 0) return shape;
    // Existing profiles keep their identity and settings; display the plush
    // closest to their saved color until the user picks one explicitly.
    if (!/^#[0-9a-f]{6}$/i.test(color || '')) return 'dot-purple';
    var rgb = [1, 3, 5].map(function (i) { return parseInt(color.slice(i, i + 2), 16); });
    var best = 'dot-purple', distance = Infinity;
    CW_SHAPES.forEach(function (candidate) {
      var d = [1, 3, 5].reduce(function (sum, i, channel) { return sum + Math.pow(rgb[channel] - parseInt(CW_DOT_COLORS[candidate].slice(i, i + 2), 16), 2); }, 0);
      if (d < distance) { best = candidate; distance = d; }
    });
    return best;
  }
  // Neutral starting points for the INSTRUCTIONS field only. They never fill
  // the name (users name their own agents) and carry no branding.
  var CW_TEMPLATES = [
    { label: 'Coordinator', prompt: 'You lead a small agent team and own the user\'s outcome. Complete work yourself when your tools are sufficient. Choose useful bounded delegation by mentioning @Name when a specialist or parallel work helps, verify returned results, and deliver one clear answer. Make routine decisions yourself, preserve the user\'s constraints and prior approvals, and ask only for choices that materially change the result or a concrete missing dependency. Keep progress concise.' },
    { label: 'Engineer', prompt: 'You are a senior software engineer. Read code before changing it, make small focused edits, and verify with tests or builds. Answer with concrete file paths and evidence, and say plainly when something is not yet verified.' },
    { label: 'Researcher', prompt: 'You are a rigorous research analyst. Gather facts from files and the web, weigh sources, and answer with a short summary first, then supporting detail with links. Distinguish clearly between verified facts and your own inference.' },
    { label: 'Writer', prompt: 'You are a sharp product writer. Turn rough ideas into clear, tight prose — READMEs, announcements, specs. Prefer plain words, short sentences, and concrete examples. Never invent features or facts.' }
  ];

  // ---- inline SVG icon set (stroke style matches the app's ICONS) ----
  var CW_SVG_OPEN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var CW_ICONS = {
    users: CW_SVG_OPEN + '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    plus: CW_SVG_OPEN + '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    chat: CW_SVG_OPEN + '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    panel: CW_SVG_OPEN + '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M15 3v18"/></svg>',
    crown: CW_SVG_OPEN + '<path d="M2 18h20"/><path d="M3 18l1.5-9L9 13l3-7 3 7 4.5-4L21 18"/></svg>',
    plane: CW_SVG_OPEN + '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    clock: CW_SVG_OPEN + '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    close: CW_SVG_OPEN + '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    stop: CW_SVG_OPEN + '<rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    send: CW_SVG_OPEN + '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
    target: CW_SVG_OPEN + '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>'
    ,folder: CW_SVG_OPEN + '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'
    ,check: CW_SVG_OPEN + '<polyline points="20 6 9 17 4 12"/></svg>'
    ,bolt: CW_SVG_OPEN + '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'
    ,globe: CW_SVG_OPEN + '<circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a13.5 13.5 0 0 1 0 18a13.5 13.5 0 0 1 0-18z"/></svg>'
    ,link: CW_SVG_OPEN + '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>'
    ,file: CW_SVG_OPEN + '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
    ,paperclip: CW_SVG_OPEN + '<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>'
    ,terminal: CW_SVG_OPEN + '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>'
    ,edit: CW_SVG_OPEN + '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></svg>'
    ,search: CW_SVG_OPEN + '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
    ,eye: CW_SVG_OPEN + '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
    ,plug: CW_SVG_OPEN + '<path d="M9 2v6M15 2v6"/><path d="M6 8h12v3a6 6 0 0 1-12 0z"/><path d="M12 17v5"/></svg>'
    ,lock: CW_SVG_OPEN + '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>'
    ,user: CW_SVG_OPEN + '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2"/></svg>'
    ,monitor: CW_SVG_OPEN + '<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 21h8M12 16v5"/></svg>'
    ,cpu: CW_SVG_OPEN + '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/></svg>'
    ,sliders: CW_SVG_OPEN + '<path d="M4 7h4M12 7h8M4 17h8M16 17h4"/><circle cx="10" cy="7" r="2"/><circle cx="14" cy="17" r="2"/></svg>'
    ,memory: CW_SVG_OPEN + '<path d="M12 3v18M12 5a4 4 0 0 0-7-2 4 4 0 0 0-2 6 4 4 0 0 0 0 6 4 4 0 0 0 6 6 3 3 0 0 0 3-3M12 5a4 4 0 0 1 7-2 4 4 0 0 1 2 6 4 4 0 0 1 0 6 4 4 0 0 1-6 6 3 3 0 0 1-3-3"/></svg>'
    ,trash: CW_SVG_OPEN + '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></svg>'
    ,chevron: CW_SVG_OPEN + '<path d="m6 9 6 6 6-6"/></svg>'
    ,play: CW_SVG_OPEN + '<path d="m7 4 14 8-14 8z"/></svg>'
    ,image: CW_SVG_OPEN + '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 5 5 3-3 4 4"/></svg>'
    ,back: CW_SVG_OPEN + '<path d="M19 12H5m7-7-7 7 7 7"/></svg>'
    ,download: CW_SVG_OPEN + '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></svg>'
    ,map: CW_SVG_OPEN + '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>'
    ,external: CW_SVG_OPEN + '<path d="M14 3h7v7m0-7-11 11M10 3H3v18h18v-7"/></svg>'
  };
  function cwIcon(name) { return CW_ICONS[name] || ''; }

  /**
   * Brand domains for well-known MCP servers, so their tool calls can wear the
   * server's own mark. Unknown servers fall back to the plug glyph.
   */
  var CW_MCP_DOMAINS = {
    github: 'github.com', gitlab: 'gitlab.com', bitbucket: 'bitbucket.org', slack: 'slack.com', discord: 'discord.com',
    notion: 'notion.so', linear: 'linear.app', figma: 'figma.com', atlassian: 'atlassian.com', jira: 'atlassian.com',
    confluence: 'atlassian.com', trello: 'trello.com', asana: 'asana.com', airtable: 'airtable.com', hubspot: 'hubspot.com',
    salesforce: 'salesforce.com', shopify: 'shopify.com', stripe: 'stripe.com', paypal: 'paypal.com', twilio: 'twilio.com',
    supabase: 'supabase.com', firebase: 'firebase.google.com', postgres: 'postgresql.org', postgresql: 'postgresql.org',
    mysql: 'mysql.com', sqlite: 'sqlite.org', mongodb: 'mongodb.com', redis: 'redis.io', docker: 'docker.com',
    kubernetes: 'kubernetes.io', cloudflare: 'cloudflare.com', sentry: 'sentry.io', vercel: 'vercel.com', netlify: 'netlify.com',
    aws: 'aws.amazon.com', azure: 'azure.microsoft.com', google: 'google.com', gdrive: 'drive.google.com', gmail: 'gmail.com',
    gcalendar: 'calendar.google.com', gmaps: 'maps.google.com', youtube: 'youtube.com', spotify: 'spotify.com',
    brave: 'brave.com', 'brave-search': 'brave.com', exa: 'exa.ai', firecrawl: 'firecrawl.dev', context7: 'context7.com',
    playwright: 'playwright.dev', puppeteer: 'pptr.dev', browserbase: 'browserbase.com', zapier: 'zapier.com', n8n: 'n8n.io',
    grafana: 'grafana.com', datadog: 'datadoghq.com', snowflake: 'snowflake.com', telegram: 'telegram.org', x: 'x.com',
    twitter: 'x.com', linkedin: 'linkedin.com', reddit: 'reddit.com', wordpress: 'wordpress.org', webflow: 'webflow.com',
    facebook: 'facebook.com', instagram: 'instagram.com', googledrive: 'drive.google.com',
    googlecalendar: 'calendar.google.com', googlesheets: 'sheets.google.com', outlook: 'outlook.com',
  };

  /** A site/brand favicon that removes itself when it cannot load, revealing the glyph under it. */
  function cwFaviconHtml(domain) {
    var d = String(domain || '').trim().toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) return '';
    return '<img class="cw-fav" src="https://icons.duckduckgo.com/ip3/' + esc(d) + '.ico" alt="" width="14" height="14" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">';
  }

  /**
   * The icon for the tool a teammate is using right now: the site favicon for
   * browsing, a terminal for commands, the file/eye/search set for file work,
   * and for MCP calls the server's own mark when the name is a known brand.
   * Hover titles stay generic for file/shell work — commands and paths never
   * leak into the live row; only a public web host or an MCP label is named.
   */
  function cwToolIconHtml(p) {
    var tool = p && p.tool;
    if (!tool) return '';
    if (tool === 'connected_apps') {
      var service = String(p.appService || '').toLowerCase();
      return '<span class="cw-tool-ico" title="' + esc(service ? cwActionWords(service) : 'Connected app') + '">' + cwIcon('plug') + cwFaviconHtml(CW_MCP_DOMAINS[service]) + '</span>';
    }
    if (['browse', 'web_fetch', 'web_search', 'search_web'].indexOf(tool) >= 0) {
      // The server sends origin-only URLs; parse the host without depending on URL().
      var match = /^https?:\/\/([^/?#]+)/i.exec(String((p && p.webUrl) || ''));
      var host = match ? match[1].replace(/:\d+$/, '').toLowerCase() : '';
      return '<span class="cw-tool-ico" title="' + (host ? 'Browsing ' + esc(host) : 'Browsing the web') + '">' + cwIcon('globe') + cwFaviconHtml(host) + '</span>';
    }
    if (tool === 'mcp_call') {
      var server = String((p && p.mcpServer) || '').toLowerCase();
      var domain = CW_MCP_DOMAINS[server] || CW_MCP_DOMAINS[server.replace(/-?mcp$/, '').replace(/-server$/, '')] || '';
      return '<span class="cw-tool-ico" title="' + (server ? esc(server) + ' · MCP' : 'MCP tool') + '">' + cwIcon('plug') + cwFaviconHtml(domain) + '</span>';
    }
    var byName = {
      run_command: ['terminal', 'Running a command'], ssh_exec: ['terminal', 'Checking a connected server'], computer_process: ['terminal', 'Computer process'], computer_status: ['terminal', 'Computer status'],
      read_file: ['eye', 'Reading a file'], lsp_diagnostics: ['eye', 'Checking diagnostics'], lsp_definition: ['eye', 'Looking up a definition'],
      lsp_references: ['eye', 'Finding references'], lsp_hover: ['eye', 'Inspecting a symbol'], lsp_symbols: ['eye', 'Listing symbols'],
      write_file: ['edit', 'Writing a file'], apply_edit: ['edit', 'Editing a file'], create_document: ['file', 'Creating a document'],
      list_files: ['folder', 'Listing files'], folder_manage: ['folder', 'Managing folders'], search_files: ['search', 'Searching files'],
      search_history: ['search', 'Searching history'], conversation_history: ['chat', 'Reading the conversation'],
      todo_manage: ['check', 'Updating the checklist'], message_teammate: ['chat', 'Messaging a teammate'], gitu_task: ['bolt', 'Engineering task'],
      spawn_sub_agent: ['users', 'Spawning a worker'], share_file: ['paperclip', 'Sharing a file'], receive_file: ['paperclip', 'Receiving a file'],
      schedule_followup: ['clock', 'Scheduling a follow-up'], schedule_manage: ['clock', 'Managing the schedule'],
      create_skill: ['bolt', 'Saving a skill'], update_skill: ['bolt', 'Improving a skill'], use_skill: ['bolt', 'Loading a skill'], list_skills: ['bolt', 'Listing skills'],
      widget_manage: ['bolt', 'Updating a widget'], agent_memory: ['search', 'Remembering'], user_profile: ['users', 'Updating the profile'],
      ask_user: ['chat', 'Asking you'], request_permission: ['eye', 'Requesting permission'], recommend: ['bolt', 'Recommending a step'],
    };
    var entry = byName[tool] || ['bolt', 'Using a tool'];
    return '<span class="cw-tool-ico" title="' + esc(entry[1]) + '">' + cwIcon(entry[0]) + '</span>';
  }

  function cwEnsure() {
    if (!S.cw) S.cw = { agents: [], convs: [], skills: [], active: null, msgs: [], lastSeq: 0, lastChange: 0, busy: false, working: null, progress: null, progresses: [], timer: null, infoOpen: true, missions: [], artifacts: [], todos: [], requests: [], pendingFiles: [], threads: [], folders: [], widgets: [], threadId: null, learn: null, searchQuery: '', searchHits: [] };
    var cw = S.cw;
    if (!cw.lastChange) cw.lastChange = 0;
    if (!cw.outbox) cw.outbox = Object.create(null);
    if (!cw.messageLocks) cw.messageLocks = Object.create(null);
    if (!cw.removedMessages) cw.removedMessages = Object.create(null);
    if (!cw.referencedMessageIds) cw.referencedMessageIds = [];
    if (!cw.threads) cw.threads = [];
    if (!cw.folders) cw.folders = [];
    if (!cw.widgets) cw.widgets = [];
    if (cw.threadId === undefined) cw.threadId = null;
    return cw;
  }
  function cwChatKey() { var cw = cwEnsure(); return JSON.stringify([cw.active, cw.threadId || null]); }
  // Keep a small in-memory window of visited chats. The stream still refreshes
  // their state; this only avoids an empty transcript while the network responds.
  function cwRememberChat() {
    var cw = cwEnsure();
    if (!cw.active) return;
    var views = cw.chatViews || (cw.chatViews = new Map()), view = {};
    ['msgs', 'lastSeq', 'lastChange', 'workHistory', 'artifacts', 'todos', 'requests', 'subAgents', 'threads', 'folders', 'widgets'].forEach(function (key) {
      view[key] = Array.isArray(cw[key]) ? cw[key].slice() : cw[key];
    });
    views.delete(cwChatKey()); views.set(cwChatKey(), view);
    if (views.size > 12) views.delete(views.keys().next().value);
  }
  function cwRestoreChat() {
    var cw = cwEnsure(), view = cw.chatViews && cw.chatViews.get(cwChatKey());
    cw.subAgents = { nodes: [] };
    if (view) Object.keys(view).forEach(function (key) { if (view[key] !== undefined) cw[key] = Array.isArray(view[key]) ? view[key].slice() : view[key]; });
    cwLocalMessages().forEach(function (message) {
      if (!cw.removedMessages[cw.active + '/' + message.id] && !cw.msgs.some(function (existing) { return existing.id === message.id; })) cw.msgs.push(message);
    });
  }
  function cwScrollNodeKey(node) {
    return node.getAttribute('data-cwscroll-key') || node.getAttribute('data-cwworkhistory') || node.getAttribute('data-cwrequest-row') || node.getAttribute('data-cwcheckpoint') || node.getAttribute('data-cwsubagents') || node.getAttribute('data-cwmediagroup');
  }
  function cwCaptureScroll(wrap) {
    if (wrap.clientHeight === 0) return wrap._cwScrollState || { top: wrap.scrollTop, follow: true, key: null, offset: 0 };
    var state = { top: wrap.scrollTop, follow: wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 120, key: null, offset: 0 };
    if (wrap.getBoundingClientRect) {
      var top = wrap.getBoundingClientRect().top;
      Array.from(wrap.children).some(function (node) {
        var key = cwScrollNodeKey(node), rect = node.getBoundingClientRect();
        if (!key || rect.bottom <= top + 112) return false;
        state.key = key; state.offset = rect.top - top; return true;
      });
    }
    return state;
  }
  function cwRestoreScroll(wrap, state) {
    if (!wrap || !state) return;
    wrap._cwScrollState = state;
    if (wrap.clientHeight === 0) { cwUpdateJumpLatest(); return; }
    var anchor = state.key && Array.from(wrap.children).find(function (node) { return cwScrollNodeKey(node) === state.key; });
    wrap.scrollTop = state.follow ? wrap.scrollHeight : anchor ? wrap.scrollTop + anchor.getBoundingClientRect().top - wrap.getBoundingClientRect().top - state.offset : state.top;
    cwUpdateJumpLatest();
  }
  function cwUpdateJumpLatest() {
    var wrap = $('cwMsgs'), button = $('cwJumpLatest');
    if (!wrap || !button) return;
    var scroll = cwCaptureScroll(wrap);
    wrap._cwScrollState = scroll;
    button.hidden = scroll.follow;
    var composer = wrap.parentElement && wrap.parentElement.querySelector('.cw-composer-wrap');
    if (composer) button.style.bottom = (composer.offsetHeight + 12) + 'px';
  }
  function cwJumpLatest() {
    var wrap = $('cwMsgs');
    if (!wrap) return;
    wrap._cwScrollState = { top: wrap.scrollHeight, follow: true, key: null, offset: 0 };
    wrap.scrollTop = wrap.scrollHeight;
    cwUpdateJumpLatest();
  }
  function cwDraftKey() {
    var cw = cwEnsure();
    return cw.active ? 'hermes.cowork.draft.' + encodeURIComponent(cw.active) + '.' + encodeURIComponent(cw.threadId || 'main') : '';
  }
  function cwSaveDraft() {
    var input = $('cwInput'), key = cwDraftKey();
    if (!input || !key || typeof localStorage === 'undefined' || typeof credentialChatInput !== 'function') return;
    try {
      var safeText = credentialChatInput(input.value.slice(0, 20000)).safeText;
      if (safeText) localStorage.setItem(key, safeText);
      else localStorage.removeItem(key);
    } catch (e) {}
  }
  function cwRestoreDraft(input) {
    var key = cwDraftKey();
    if (!input || !key || typeof localStorage === 'undefined') return;
    try { input.value = localStorage.getItem(key) || ''; } catch (e) {}
    input.style.height = 'auto';
    if (input.value) input.style.height = Math.min(160, input.scrollHeight) + 'px';
  }
  function cwStopPoll() {
    var cw = S.cw;
    if (!cw) return;
    cwDisposeSubagentOrbs();
    if (cw.closeDesktop) cw.closeDesktop();
    cw.generation = (cw.generation || 0) + 1;
    if (cw.timer) { clearInterval(cw.timer); cw.timer = null; }
    if (cw.stream) { cw.stream.close(); cw.stream = null; }
    cw.streamOpen = false;
    cw.pollPromise = null;
  }

  // Bundled transparent images share a browser cache across every surface.
  function cwAvaImg(avatar, identity) {
    var shape = cwAvatarShape(avatar && avatar.shape, avatar && avatar.color);
    var filter=cwCharacterFilter(avatar,shape);
    return plushCharacterHtml(shape.slice(4), identity || '', filter);
  }
  function cwAva(agent, size) {
    var style = size ? ' style="width:' + size + 'px;height:' + size + 'px;border-radius:' + Math.round(size * 0.32) + 'px"' : '';
    var cw = cwEnsure();
    var busy = agent && cw.busy && ((cw.progresses || []).some(function (p) { return p.agentId === agent.id; }) || cw.working === agent.name);
    return '<span class="cw-ava' + (busy ? ' working' : '') + '" data-cw-avatar="' + esc(agent && agent.id || '') + '"' + style + '>' + cwAvaImg((agent && agent.avatar) || { color: '#8f80ff', shape: 'orb' }, agent && agent.id) + '</span>';
  }
  function cwAgentById(id) { var cw = cwEnsure(); for (var i = 0; i < cw.agents.length; i++) if (cw.agents[i].id === id) return cw.agents[i]; return null; }
  function cwCharacterActivity(agentId) {
    var cw = cwEnsure();
    // Questions can stay open across turns. Show this agent's live work first,
    // without making a paused teammate appear busy when another agent works.
    if (cw.busy) {
      var ps = cw.progresses && cw.progresses.length ? cw.progresses : (cw.progress ? [cw.progress] : []);
      var progress = ps.find(function (p) { return !agentId || p.agentId === agentId; });
      if (progress) return cwActivityLabel(progress);
      var member = cwAgentById(agentId), conv = cwActiveConv();
      if (!agentId || member && cw.working === member.name || !ps.length && !cw.working && conv && conv.kind === 'dm' && conv.memberIds[0] === agentId) return 'Thinking…';
    }
    return (cw.requests || []).some(function (r) { return r.status === 'open' && !r.appConnection && (!agentId || r.agentId === agentId); }) ? 'Waiting for you' : 'Ready';
  }
  function cwCharacterStatusHtml(agent, rail) {
    var activity = cwCharacterActivity(agent && agent.id);
    var label = rail ? (activity === 'Ready' ? agent.tagline || '' : activity) : 'AI teammate · ' + activity;
    return '<span class="cw-persona-status"' + (!label ? ' hidden' : '') + ' data-cw-agent-status="' + esc(agent.id) + '" data-status-surface="' + (rail ? 'rail' : 'profile') + '" data-active="' + (activity !== 'Ready') + '"><span>' + esc(label) + '</span></span>';
  }
  function cwUpdateCharacterActivity() {
    var cw = cwEnsure();
    document.querySelectorAll('[data-cw-agent-status]').forEach(function (node) {
      var agent = cwAgentById(node.getAttribute('data-cw-agent-status'));
      if (!agent) return;
      var activity = cwCharacterActivity(agent.id);
      var label = node.getAttribute('data-status-surface') === 'rail' ? (activity === 'Ready' ? agent.tagline || '' : activity) : 'AI teammate · ' + activity;
      var text = node.querySelector('span');
      if (text && text.textContent !== label) text.textContent = label;
      node.hidden = !label;
      node.setAttribute('data-active', String(activity !== 'Ready'));
    });
    var header = $('cwCharacterStatus');
    if (header) {
      var conv = cwActiveConv(), activity = cwCharacterActivity(conv && conv.kind === 'dm' ? conv.memberIds[0] : null);
      var label = (conv && conv.kind === 'group' ? 'AI team' : 'AI teammate') + ' · ' + activity;
      if (cw.queued) label += ' · ' + cw.queued + ' queued';
      var text = header.querySelector('span');
      if (text && text.textContent !== label) text.textContent = label;
      header.title = label;
      header.setAttribute('data-active', String(activity !== 'Ready'));
      var icon = header.querySelector('.cw-persona-tool');
      if (icon) {
        var ps = cw.busy ? (cw.progresses && cw.progresses.length ? cw.progresses : (cw.progress ? [cw.progress] : [])) : [];
        var progress = ps.find(function (p) { return !conv || conv.kind !== 'dm' || p.agentId === conv.memberIds[0]; });
        var iconHtml = progress ? cwToolIconHtml(progress) : '';
        if (icon._iconHtml !== iconHtml) { icon._iconHtml = iconHtml; icon.innerHTML = iconHtml; }
        icon.hidden = !iconHtml;
        header.setAttribute('data-tool', String(Boolean(iconHtml)));
      }
    }
  }
  function cwActiveConv() { var cw = cwEnsure(); for (var i = 0; i < cw.convs.length; i++) if (cw.convs[i].id === cw.active) return cw.convs[i]; return null; }
  function cwConvMembers(conv) { var out = []; for (var i = 0; i < conv.memberIds.length; i++) { var a = cwAgentById(conv.memberIds[i]); if (a) out.push(a); } return out; }

  function openCowork() {
    cwEnsure().connectionsOpen = false;
    cwEnsure().connectionRevision = (cwEnsure().connectionRevision || 0) + 1;
    S.active = 'cowork';
    document.body.classList.add('cowork');
    try { localStorage.setItem('hermes.cowork', 'open'); } catch (e) {}
    toggleMobileNav(false);
    stopStreams();
    cwStopPoll();
    renderSidebar();
    var cw = cwEnsure();
    cw.infoNarrowOpen = false;
    $('view').innerHTML =
      '<div class="cw" id="cw">' +
        '<button class="cw-panel-backdrop" id="cwPanelBackdrop" aria-label="Close panel" hidden></button>' +
        '<aside class="cw-rail">' +
          '<button class="cw-info-toggle cw-panel-close" id="cwCloseRail">Close chats</button>' +
          '<div class="cw-rail-head"><span class="cw-brand">' + cwIcon('users') + '<span>COWORK</span></span><button class="cw-learn" id="cwLearn" title="Cowork learning mode"></button><span class="spacer"></span>' +
          '<button class="iconbtn" id="cwAddAgent" title="New teammate" aria-label="New teammate">' + cwIcon('plus') + '</button>' +
          '<button class="iconbtn" id="cwAddGroup" title="New group chat" aria-label="New group chat">' + cwIcon('chat') + '</button>' +
          '<button class="iconbtn cw-rail-collapse" id="cwCollapseRail" aria-label="Collapse chats sidebar" title="Collapse chats sidebar">' + cwIcon('panel') + '</button></div>' +
          '<div class="cw-rail-search"><input type="search" id="cwSearch" placeholder="Search all chats…" title="Cross-session recall: every conversation, related phrasing included"></div>' +
          '<div class="cw-rail-scroll" id="cwRail"></div>' +
          '<div class="cw-connection-nav"><button class="iconbtn" id="cwConnections" aria-label="Connections" title="Connections">' + cwIcon('plug') + '</button><button class="iconbtn" id="cwLock" aria-label="Lock app" title="Lock app">' + cwIcon('lock') + '</button></div>' +
          '<div class="cw-rail-foot"><button class="iconbtn" id="cwExit" aria-label="Back to workspace" title="Back to workspace">' + cwIcon('back') + '</button>' + themeToggleHtml() + '<button class="btn ghost" id="cwGear" title="Settings" aria-label="Settings">' + cwIcon('gear') + '</button></div>' +
        '</aside>' +
        '<div class="cw-splitter" id="cwRailResize" role="separator" tabindex="0" aria-label="Resize chats sidebar" aria-orientation="vertical" aria-controls="cwRail" aria-valuemin="208" aria-valuemax="400" aria-valuenow="264"></div>' +
        '<section class="cw-chat" id="cwChat"></section>' +
        '<div class="cw-splitter" id="cwInfoResize" role="separator" tabindex="0" aria-label="Resize profile sidebar" aria-orientation="vertical" aria-controls="cwInfoPanel" aria-valuemin="260" aria-valuemax="460" aria-valuenow="320" hidden></div>' +
        '<aside class="cw-info" id="cwInfoPanel" aria-label="Chat details"><div class="cw-info-bar"><button class="cw-profile-close" id="cwCloseInfo" aria-label="Close panel" title="Close panel">' + cwIcon('close') + '</button></div><div id="cwInfo"></div></aside>' +
      '</div>';
    // The app's gear icon is registered in ICONS; reuse its markup.
    var gearBtn = $('cwGear');
    if (gearBtn && typeof icon === 'function') gearBtn.innerHTML = icon('gear');
    $('cwExit').onclick = cwExit;
    $('cwConnections').onclick = function () { cwOpenConnections(); };
    $('cwLock').onclick = function () { cwLockApp(); };
    $('cwGear').onclick = function () { cwClosePanels(); openSettings('cowork'); };
    $('cwPanelBackdrop').onclick = cwClosePanels;
    $('cwCloseRail').onclick = cwClosePanels;
    cwBindPanelControls();
    $('cwCloseInfo').onclick = function () {
      var cw = cwEnsure();
      if (window.innerWidth <= 1180) cw.infoNarrowOpen = false;
      else cw.infoOpen = false;
      if(window.innerWidth>720){cw.infoOpen=false;cwSavePanelPreferences();}
      cwSyncPanels();
      var button = $('cwInfoBtn');
      if (button) button.focus();
    };
    $('cwAddAgent').onclick = function () { cwAgentModal(null); };
    $('cwAddGroup').onclick = function () { cwGroupModal(); };
    var learnBtn = $('cwLearn');
    if (learnBtn) learnBtn.onclick = cwLearnCycle;
    cwLearnLoad();
    var searchBox = $('cwSearch');
    if (searchBox) {
      searchBox.onkeydown = function (event) {
        if (event.key !== 'Enter') return;
        var query = this.value.trim();
        if (!query) { cwEnsure().searchQuery = ''; cwEnsure().searchHits = []; cwRenderRail(); return; }
        api('/api/cowork/search?q=' + encodeURIComponent(query) + '&limit=20')
          .then(function (d) {
            var cw = cwEnsure();
            cw.searchQuery = query;
            cw.searchHits = d.hits || [];
            cwRenderRail();
            if (!(d.hits || []).length) toast('No past messages match that.');
          })
          .catch(function (e) { toast(e.message, true); });
      };
    }
    // Paint the known teammate immediately when returning from the workspace.
    // The roster refresh must not leave the newly mounted chat blank.
    cwRenderRail();
    if (cwActiveConv()) cwOpenConv(cw.active, cw.threadId);
    else cwRenderChat();
    cwLoad(true);
  }

  function cwExit() {
    cwEnsure().connectionsOpen = false;
    cwEnsure().connectionRevision = (cwEnsure().connectionRevision || 0) + 1;
    cwSaveDraft();
    cwRememberChat();
    cwStopPoll();
    document.body.classList.remove('cowork');
    document.body.classList.remove('cw-resizing');
    S.active = 'home';
    try { localStorage.setItem('hermes.cowork', 'closed'); } catch (e) {}
    openHome();
  }

  function cwSyncPanels() {
    var root = $('cw'), panel = $('cwInfoPanel');
    if (!root || !panel) return;
    var messages = $('cwMsgs');
    var scroll = messages && cwCaptureScroll(messages);
    var cw = cwEnsure(), narrow = window.innerWidth <= 1180;
    if(!cwActiveConv())cw.railCollapsed=false;
    cw.panelWidth = window.innerWidth;
    var railOpen = window.innerWidth <= 720 && root.classList.contains('rail-open');
    var infoOpen = !cw.connectionsOpen && !cw.galleryOpen && !railOpen && !!cwActiveConv() && (narrow ? !!cw.infoNarrowOpen : cw.infoOpen);
    var overlayOpen = railOpen;
    panel.style.display = infoOpen ? 'block' : 'none';
    root.classList.toggle('overlay-open', overlayOpen);
    root.classList.toggle('info-open', !!infoOpen);
    root.classList.toggle('rail-collapsed', window.innerWidth > 720 && !!cw.railCollapsed);
    cwApplyPanelWidths();
    $('cwPanelBackdrop').hidden = !overlayOpen;
    $('cwChat').inert = overlayOpen || (window.innerWidth <= 720 && infoOpen);
    var rail = root.querySelector('.cw-rail');
    rail.inert = window.innerWidth <= 720 ? !railOpen : !!cw.railCollapsed;
    var button = $('cwInfoBtn');
    if (button) { button.hidden = infoOpen; button.setAttribute('aria-expanded', String(infoOpen)); }
    var back = $('cwBack');
    if (back) { back.hidden=window.innerWidth>720&&!cw.railCollapsed;back.setAttribute('aria-expanded',String(window.innerWidth<=720?railOpen:!cw.railCollapsed)); }
    var closeInfo = $('cwCloseInfo');
    if (closeInfo) { var closeLabel = window.innerWidth <= 720 ? 'Back to chat' : 'Close panel'; closeInfo.setAttribute('aria-label', closeLabel); closeInfo.title = closeLabel; }
    cwRestoreScroll(messages, scroll);
  }

  function cwClosePanels() {
    var root = $('cw');
    if (!root) return;
    var wasRail = root.classList.contains('rail-open');
    root.classList.remove('rail-open');
    cwEnsure().infoNarrowOpen = false;
    cwSyncPanels();
    var trigger = $(wasRail ? 'cwBack' : 'cwInfoBtn');
    if (trigger) trigger.focus();
  }

  window.addEventListener('resize', function () {
    if (S.active !== 'cowork') return;
    var root = $('cw');
    if (root && window.innerWidth > 720) root.classList.remove('rail-open');
    var cw = cwEnsure();
    if (cw.panelWidth !== window.innerWidth) cw.infoNarrowOpen = false;
    cwSyncPanels();
    document.querySelectorAll('.cw-message-menu:popover-open').forEach(function (menu) { menu.hidePopover(); });
  });
  window.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || S.active !== 'cowork') return;
    if (document.querySelector('.modal:not([hidden]), .cw-message-menu:popover-open')) return;
    var root = $('cw');
    if (!root || (!root.classList.contains('overlay-open') && !(window.innerWidth <= 1180 && root.classList.contains('info-open')))) return;
    event.preventDefault(); event.stopPropagation(); cwClosePanels();
  }, true);

  /** Proactive learning badge: shows the current mode in the rail head and
   *  cycles reactive → proactive → off on click. The server is authoritative;
   *  the Settings select reads the same state. */
  function cwLearnMode() {
    var cw = cwEnsure();
    return (cw.learn && cw.learn.mode) || 'reactive';
  }
  function cwLearnLabel(mode) {
    return mode === 'proactive' ? 'scheduled' : mode === 'off' ? 'off' : 'each task';
  }
  function cwLearnLoad() {
    var cw = cwEnsure();
    api('/api/cowork/learning').then(function (d) {
      cw.learn = d || { mode: 'reactive' };
      cwLearnRender();
    }).catch(function () {});
  }
  function cwLearnRender() {
    var cw = cwEnsure();
    var el = $('cwLearn');
    if (!el || !cw.learn) return;
    var mode = cwLearnMode();
    el.className = 'cw-learn' + (mode === 'proactive' ? ' cw-learn-on' : mode === 'off' ? ' cw-learn-off' : '');
    var jobTip = function (job, label) {
      if (!job) return '';
      return job.enabled ? '\n' + label + ': every ' + job.every : '\n' + label + ': off';
    };
    var jobs = cw.learn.jobs || [];
    var tip = 'Cowork learning: ' + cwLearnLabel(mode) +
      jobTip(jobs.filter(function (j) { return j.id === 'cowork_learn_consolidate'; })[0], 'Memory consolidation') +
      jobTip(jobs.filter(function (j) { return j.id === 'cowork_learn_review'; })[0], 'Learning review') +
      jobTip(jobs.filter(function (j) { return j.id === 'cowork_learn_distill'; })[0], 'Transcript distillation') +
      '\nClick to change';
    el.setAttribute('title', tip);
    el.innerHTML = '<span class="cw-learn-dot"></span><span>' + esc('learn: ' + cwLearnLabel(mode)) + '</span>';
  }
  function cwLearnCycle() {
    var cw = cwEnsure();
    var mode = cwLearnMode();
    var next = mode === 'reactive' ? 'proactive' : mode === 'proactive' ? 'off' : 'reactive';
    api('/api/cowork/learning', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: next }) })
      .then(function (r) {
        cw.learn = cw.learn || {};
        cw.learn.mode = (r && r.mode) || next;
        if (S.settings) S.settings.cwLearn = cw.learn.mode;
        if (typeof persist === 'function') persist();
        cwLearnRender();
        toast('Cowork learning: ' + cwLearnLabel(cw.learn.mode));
      })
      .catch(function (e) { toast(e.message, true); });
  }

  function cwLoad(openFirst) {
    var cw = cwEnsure();
    var revision = cw.loadRevision = (cw.loadRevision || 0) + 1;
    return Promise.all([api('/api/cowork/agents'), api('/api/cowork/conversations')]).then(function (results) {
      if (S.active !== 'cowork' || cw.loadRevision !== revision) return;
      var d = results[0];
      cw.agents = d.agents || [];
      cw.skills = d.availableSkills || [];
      cw.memoryCounts = d.memoryCounts || {};
      cw.computers = d.computers || [];
      cw.cloudServers = d.cloudServers || [];
      cw.profile = d.profile || {};
      cw.convs = results[1].conversations || [];
      cwRenderRail();
      if (openFirst && cw.convs.length > 0 && !cwActiveConv()) cwOpenConv(cw.convs[cw.convs.length - 1].id);
      else if (!cw.active) cwRenderChat();
      else { cwRenderMembers(); cwRenderTyping(); cwRenderInfo(); }
    }).catch(function (e) { toast(e.message, true); });
  }

  function cwRenderRail() {
    var cw = cwEnsure();
    var el = $('cwRail');
    if (!el) return;
    var cwRoot = $('cw');
    if (cwRoot) cwRoot.classList.toggle('cw-empty', cw.agents.length === 0);
    // Active search: show cross-session recall results instead of the roster.
    if (cw.searchQuery) {
      var hits = cw.searchHits || [];
      var html = '<div class="cw-sec">RESULTS — "' + esc(cw.searchQuery) + '" (' + hits.length + ')</div>';
      if (!hits.length) html += '<div class="cw-empty-note">No past messages match. Related phrasing is included when an embedding provider is configured.</div>';
      hits.forEach(function (hit) {
        html += '<button class="cw-hit" data-conv="' + esc(hit.conversationId) + '">' +
          '<span class="cw-hit-title">' + esc(hit.conversationTitle) + ' · ' + esc(hit.role === 'agent' ? hit.agentName || 'agent' : hit.role) + '</span>' +
          '<span class="cw-hit-snippet">' + esc(hit.snippet) + '</span></button>';
      });
      html += '<button class="cw-item" id="cwSearchClear">← Back to the team</button>';
      el.innerHTML = html;
      el.querySelectorAll('[data-conv]').forEach(function (b) {
        b.onclick = function () { cw.searchQuery = ''; cw.searchHits = []; cwOpenConv(b.getAttribute('data-conv')); };
      });
      var clearBtn = $('cwSearchClear');
      if (clearBtn) clearBtn.onclick = function () { cw.searchQuery = ''; cw.searchHits = []; cwRenderRail(); };
      return;
    }
    var active = cwActiveConv();
    var selectedAgentId = cw.selectedAgentId || (active && (active.kind === 'dm' ? active.memberIds[0] : active.chiefId || active.memberIds[0]));
    var html = '<div class="cw-sec">TEAM</div>';
    if (cw.agents.length === 0) html += '<div class="cw-empty-note">No teammates yet. Create the first profile — pick a name, a character and instructions.</div>';
    cw.agents.forEach(function (a) {
      var selected = selectedAgentId === a.id;
      html += '<button class="cw-item cw-teammate' + (selected ? ' cur' : '') + '" data-agent="' + esc(a.id) + '">' + cwAva(a) +
        '<span class="cw-item-main"><span class="cw-item-name">' + esc(a.name) + '</span>' + cwCharacterStatusHtml(a, true) + '</span>' +
        (a.chiefOfStaff ? '<span class="cw-flag gold" title="Default chief of staff">' + cwIcon('crown') + '</span>' : '') + '</button>';
    });
    html += '<div class="cw-sec">THREADS' + (active && active.kind === 'group' ? ' · ' + esc(active.title) : '') + '</div>';
    if (!active || !selectedAgentId || !active.memberIds.includes(selectedAgentId)) {
      html += '<div class="cw-empty-note">Select a teammate to see their threads.</div>';
    } else {
      var flags = (active.telegram && active.telegram.enabled ? '<span class="cw-flag" title="Telegram gateway connected">' + cwIcon('plane') + '</span>' : '') +
        (active.schedule && active.schedule.enabled ? '<span class="cw-flag" title="Scheduled messages active">' + cwIcon('clock') + '</span>' : '');
      html += '<button class="cw-item' + (!cw.threadId ? ' cur' : '') + '" data-cwthread="" title="Main chat with ' + esc(active.title) + '">' +
        '<span class="cw-chat-glyph">' + cwIcon('chat') + '</span>' +
        '<span class="cw-item-main"><span class="cw-item-name">Main</span></span>' + flags + '</button>';
      (cw.threads || []).forEach(function (thread) {
        html += '<div class="cw-thread-row"><button class="cw-item' + (cw.threadId === thread.id ? ' cur' : '') + '" data-cwthread="' + esc(thread.id) + '" title="' + esc(thread.topic || thread.title) + '">' +
          '<span class="cw-chat-glyph">' + cwIcon('chat') + '</span>' +
          '<span class="cw-item-main"><span class="cw-item-name">' + esc(thread.title) + '</span>' + (thread.topic ? '<span class="cw-item-sub">' + esc(thread.topic) + '</span>' : '') + '</span></button>' +
          (cw.threadId === thread.id ? '<button class="cw-thread-del" data-delthread="' + esc(thread.id) + '" title="Delete this thread" aria-label="Delete ' + esc(thread.title) + '">' + cwIcon('close') + '</button>' : '') + '</div>';
      });
      html += '<button class="cw-item cw-chat-new" id="cwNewThread">' + cwIcon('plus') + '<span class="cw-item-main"><span class="cw-item-name">New thread</span></span></button>';
    }
    var rooms = cw.convs.filter(function (conversation) { return conversation.kind === 'group' && conversation.memberIds.includes(selectedAgentId) && conversation.id !== cw.active; });
    if (rooms.length) {
      html += '<div class="cw-sec">TEAM ROOMS</div>';
      rooms.forEach(function (room) {
        html += '<button class="cw-item" data-conv="' + esc(room.id) + '"><span class="cw-chat-glyph">' + cwIcon('users') + '</span>' +
          '<span class="cw-item-main"><span class="cw-item-name">' + esc(room.title) + '</span></span></button>';
      });
    }
    html += '<div class="cw-sec">WIDGETS</div>';
    if (!cw.widgets.length) html += '<div class="cw-empty-note">No widgets yet. Teammates pin live progress cards here; you can add one too.</div>';
    cw.widgets.forEach(function (w) {
      html += '<button class="cw-item cw-widget" data-widget="' + esc(w.id) + '" title="' + esc(w.title) + '">' +
        '<span class="cw-ava cw-widget-ico">' + cwWidgetIcon(w) + '</span>' +
        '<span class="cw-item-main"><span class="cw-item-name">' + esc(w.title) + '</span><span class="cw-item-sub">' + esc(cwWidgetSummary(w)) + '</span></span></button>';
    });
    html += '<button class="cw-item" id="cwNewWidget" style="opacity:.85">' + cwIcon('plus') + '<span class="cw-item-main"><span class="cw-item-name">New widget</span><span class="cw-item-sub">a live card for the active chat</span></span></button>';
    el.innerHTML = html;
    el.querySelectorAll('[data-agent]').forEach(function (b) {
      b.onclick = function () { cwOpenDm(b.getAttribute('data-agent')); };
    });
    el.querySelectorAll('[data-conv]').forEach(function (b) {
      b.onclick = function () { cwOpenConv(b.getAttribute('data-conv')); };
    });
    el.querySelectorAll('[data-cwthread]').forEach(function (b) {
      b.onclick = function () { cwSwitchThread(b.getAttribute('data-cwthread') || null); };
    });
    el.querySelectorAll('[data-delthread]').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-delthread');
        if (!confirm('Delete this thread and its messages?')) return;
        api('/api/cowork/conversations/' + encodeURIComponent(cw.active) + '/threads/' + encodeURIComponent(id), { method: 'DELETE' })
          .then(function () {
            cw.threads = (cw.threads || []).filter(function (thread) { return thread.id !== id; });
            cwSwitchThread(null);
            toast('Thread deleted');
          })
          .catch(function (e) { toast(e.message, true); });
      };
    });
    var addThread = $('cwNewThread');
    if (addThread) addThread.onclick = cwNewThreadModal;
    el.querySelectorAll('[data-widget]').forEach(function (b) {
      b.onclick = function () { cwWidgetModal(b.getAttribute('data-widget')); };
    });
    var newWidget = $('cwNewWidget');
    if (newWidget) {
      newWidget.onclick = function () {
        var conv = cwActiveConv();
        if (!conv) { toast('Open a chat first', true); return; }
        cwNewWidgetModal(conv);
      };
    }
  }

  function cwOpenDm(agentId) {
    var cw = cwEnsure();
    cw.selectedAgentId = agentId;
    var existing = cw.convs.find(function (c) { return c.kind === 'dm' && c.memberIds[0] === agentId; });
    if (existing) { if (existing.id !== cw.active || cw.connectionsOpen) cwOpenConv(existing.id); else cwRenderRail(); return; }
    api('/api/cowork/conversations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'dm', memberIds: [agentId] }) })
      .then(function (d) { cw.convs.push(d.conversation); cwRenderRail(); cwOpenConv(d.conversation.id); })
      .catch(function (e) { toast(e.message, true); });
  }

  function cwOpenConv(id, threadId) {
    var cw = cwEnsure();
    cw.connectionsOpen = false;
    cw.connectionRevision = (cw.connectionRevision || 0) + 1;
    cwSaveDraft();
    cwRememberChat();
    cwStopPoll();
    cw.active = id;
    var conversation = cw.convs.find(function (item) { return item.id === id; });
    if (conversation) {
      if (conversation.kind === 'dm') cw.selectedAgentId = conversation.memberIds[0];
      else if (!conversation.memberIds.includes(cw.selectedAgentId)) cw.selectedAgentId = conversation.chiefId || conversation.memberIds[0];
    }
    cw.threadId = (threadId === undefined ? conversation && conversation.activeThreadId : threadId) || null;
    cw.threadActivationSeq = conversation && conversation.threadActivationSeq || 0;
    cw.threads = [];
    cw.folders = [];
    cw.widgets = [];
    cw.msgs = cwLocalMessages();
    cw.lastSeq = 0;
    cw.lastChange = 0;
    cw.referencedMessageIds = [];
    cw.busy = false;
    cw.working = null;
    cw.progress = null;
    cw.progresses = [];
    cw.workHistory = [];
    cw.queued = 0;
    cw.artifacts = [];
    cw.todos = [];
    cw.requests = [];
    cw.pendingFiles = [];
    cw.rosterRevision = -1;
    cwRestoreChat();
    var cwRoot = $('cw');
    if (cwRoot) cwRoot.classList.remove('rail-open');
    cwRenderRail();
    cwRenderChat();
    cwStartStream(id);
    cwPoll();
    cw.timer = setInterval(cwPoll, 2000);
  }

  /** Switch between the Main thread and a topic thread; restarts the stream. */
  function cwSwitchThread(threadId) {
    var cw = cwEnsure();
    if (cw.threadId === (threadId || null)) return;
    cwSaveDraft();
    cwRememberChat();
    cwStopPoll();
    cw.threadId = threadId || null;
    cw.msgs = cwLocalMessages();
    cw.lastSeq = 0;
    cw.lastChange = 0;
    cw.referencedMessageIds = [];
    cw.busy = false;
    cw.working = null;
    cw.progress = null;
    cw.progresses = [];
    cw.workHistory = [];
    cw.queued = 0;
    cw.artifacts = [];
    cw.todos = [];
    cw.requests = [];
    cw.pendingFiles = [];
    cwRestoreChat();
    var cwRoot = $('cw');
    if (cwRoot) cwRoot.classList.remove('rail-open');
    cwRenderRail();
    cwRenderChat();
    cwStartStream(cw.active);
    cwPoll();
    cw.timer = setInterval(cwPoll, 2000);
  }

  function cwNewThreadModal() {
    var cw = cwEnsure();
    var conv = cwActiveConv();
    if (!conv) return;
    var modal = document.createElement('div');
    modal.className = 'modal cw-modal';
    modal.innerHTML =
      '<div class="box"><div class="bar"><span style="font-weight:600;font-size:13px">New thread</span><span style="flex:1"></span><button class="btn ghost" id="cwThCancel">Cancel</button></div>' +
      '<div class="cw-body">' +
        '<label>Thread title</label><input type="text" id="cwThTitle" maxlength="120" placeholder="Launch copy">' +
        '<label>Topic / brief (optional)</label><textarea id="cwThTopic" rows="2" placeholder="Only landing-page copy; leave pricing alone"></textarea>' +
        '<div class="cw-note">Threads keep unrelated topics apart. This thread gets its own messages and its own reply from the team; the Main thread stays clean.</div>' +
      '</div>' +
      '<div class="cw-foot"><span style="flex:1"></span><button class="btn dark" id="cwThSave">Create thread</button></div></div>';
    document.body.appendChild(modal);
    modal.querySelector('#cwThCancel').onclick = function () { modal.remove(); };
    modal.querySelector('#cwThSave').onclick = function () {
      var title = $('cwThTitle').value.trim();
      if (!title) { toast('Give the thread a title', true); return; }
      api('/api/cowork/conversations/' + encodeURIComponent(conv.id) + '/threads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: title, topic: $('cwThTopic').value.trim() }) })
        .then(function (d) {
          modal.remove();
          cw.threads = (cw.threads || []).concat([d.thread]);
          cwSwitchThread(d.thread.id);
        })
        .catch(function (e) { toast(e.message, true); });
    };
    setTimeout(function () { var t = $('cwThTitle'); if (t) t.focus(); }, 0);
  }

  function cwRenderChat() {
    cwEnsure().galleryOpen = false;
    var cw = cwEnsure();
    if (cw.connectionsOpen) return;
    var chat = $('cwChat');
    if (!chat) return;
    var previous = $('cwMsgs');
    var sameChat = chat.getAttribute('data-cwchat-key') === cwChatKey();
    var scroll = sameChat && previous ? cwCaptureScroll(previous) : null;
    chat.setAttribute('data-cwchat-key', cwChatKey());
    cwDisposeSubagentOrbs();
    var conv = cwActiveConv();
    document.title = conv ? conv.title + ' — Cowork' : 'Cowork — Agent Gitu';
    cwApplyCharacterTheme();
    if (!conv) {
      chat.innerHTML =
        '<div class="cw-hero">' +
          '<span class="cw-hero-ico">' + cwIcon('users') + '</span>' +
          '<h1>Your team, in one place</h1>' +
          '<p>Give your teammates real work. They remember progress, use your tools and browser, and bring back finished files. Work on this computer or choose an optional private computer for each teammate.</p>' +
          '<div class="cw-hero-cta"><button class="btn dark" id="cwHeroAgent">New teammate</button><button class="btn ghost" id="cwHeroGroup">New group chat</button></div>' +
          (cw.agents.length === 0 ? '<div class="cw-hero-back"><button class="btn ghost" id="cwHeroBack">Back to workspace</button></div>' : '') +
        '</div>';
      $('cwHeroAgent').onclick = function () { cwAgentModal(null); };
      $('cwHeroGroup').onclick = function () { cwGroupModal(); };
      var heroBack = $('cwHeroBack');
      if (heroBack) heroBack.onclick = cwExit;
      $('cwInfo').innerHTML = '';
      cwSyncPanels();
      return;
    }
    var members = cwConvMembers(conv);
    var activeThread = cw.threadId ? (cw.threads || []).filter(function (t) { return t.id === cw.threadId; })[0] : null;
    var headAva = conv.kind === 'group'
      ? '<span class="cw-ava" style="background:var(--selected);border:1px solid var(--border2);color:var(--muted)">' + cwIcon('users') + '</span>'
      : (members[0] ? cwAva(members[0]) : '<span class="cw-ava"></span>');
    chat.innerHTML =
      '<div class="cw-chat-head">' +
        '<button class="cw-info-toggle cw-mobile-only" id="cwBack" aria-expanded="false" aria-label="Open chats" title="Chats" aria-controls="cwRail">' + cwIcon('chat') + '</button>' +
        '<div class="cw-chat-avatar"><span id="cwChatAvatar" role="img" aria-label="' + esc((members[0] && members[0].name) || conv.title) + '">' + headAva + '</span><span class="cw-persona-status" id="cwCharacterStatus" role="status" aria-live="polite" aria-atomic="true"><span>AI teammate · Ready</span><i class="cw-persona-tool" aria-hidden="true" hidden></i></span></div>' +
        '<div class="cw-visually-hidden"><span id="cwChatTitle">' + esc(activeThread ? activeThread.title : conv.title) + '</span>' +
        '<span id="cwMemberNames">' + esc((activeThread ? conv.title + ' · ' : '') + members.map(function (m) { return '@' + m.name; }).join(' · ')) + '</span>' +
        '<span id="cwMissionBadge"' + ((cw.missions || []).some(function (m) { return m.conversationId === conv.id && m.status === 'running'; }) ? '' : ' hidden') + '>Mission running</span>' +
        (conv.telegram && conv.telegram.enabled ? '<span class="chip ok" title="Telegram gateway on">' + cwIcon('plane') + 'Telegram</span>' : '') +
        (conv.schedule && conv.schedule.enabled ? '<span class="chip" title="Scheduled messages on">' + cwIcon('clock') + esc(conv.schedule.every) + '</span>' : '') + '</div>' +
        '<button class="cw-gallery-toggle" id="cwMediaBtn" aria-label="Media and files" title="Media and files">' + cwIcon('image') + '</button>' +
        '<button class="cw-panel-toggle" id="cwInfoBtn" aria-label="Chat panel" title="Chat panel" aria-controls="cwInfoPanel" aria-expanded="false">' + cwIcon('panel') + '</button>' +
      '</div>' +
      '<div class="cw-msgs" id="cwMsgs"></div>' +
      '<button type="button" class="cw-jump-latest" id="cwJumpLatest" aria-label="Jump to latest messages" title="Jump to latest" aria-controls="cwMsgs" hidden>' + cwIcon('send') + '</button>' +
      '<div class="cw-composer-wrap">' +
        '<div class="cw-work" id="cwWork"></div>' +
        '<div class="cw-composer-folders" id="cwComposerFolders" aria-label="Tagged folders" hidden></div>' +
        '<div class="cw-pending" id="cwPending"></div>' +
        '<div class="cw-pending cw-references" id="cwReferences" aria-label="Referenced messages"></div>' +
        '<div class="cw-mentions" id="cwMentions"' + (conv.memberIds.length > 1 ? '' : ' hidden') + '></div>' +
        '<div class="cw-composer"><input type="file" id="cwFile" multiple hidden>' +
        '<button class="cw-attach" id="cwPlus" title="Files, mission, folder or schedule" aria-label="Add files, mission, folder or schedule" popovertarget="cwPlusMenu">' + cwIcon('plus') + '</button>' +
        '<textarea id="cwInput" rows="1" placeholder="' + (conv.memberIds.length > 1 ? 'Message the whole team — @Name to target someone' : 'Message ' + esc(conv.title)) + (activeThread ? ' — ' + esc(activeThread.title) : '') + '"></textarea>' +
        '<button class="cw-stop-secondary" id="cwStop" title="Stop the team" aria-label="Stop the team" hidden>' + cwIcon('stop') + '</button>' +
        '<button class="cw-send" id="cwSend" title="Send (Enter)" aria-label="Send message">' + cwIcon('send') + '</button>' +
        '<div class="cw-message-menu cw-plus-menu" id="cwPlusMenu" popover="auto" aria-label="Add to this chat">' +
          '<button type="button" data-cwplus="attach">' + cwIcon('paperclip') + ' Choose files</button>' +
          '<button type="button" data-cwplus="mission">' + cwIcon('target') + ' New mission</button>' +
          '<button type="button" data-cwplus="folder">' + cwIcon('folder') + ' Tag folder</button>' +
          '<button type="button" data-cwplus="schedule">' + cwIcon('clock') + ' Schedule</button>' +
        '</div></div>' +
      '</div>';
    $('cwMediaBtn').onclick = function () { cwOpenGallery(); };
    $('cwJumpLatest').onclick = function () { cwJumpLatest(); };
    $('cwInfoBtn').onclick = function () {
      if (window.innerWidth <= 1180) cw.infoNarrowOpen = !cw.infoNarrowOpen;
      else cw.infoOpen = !cw.infoOpen;
      if(window.innerWidth>720){if(window.innerWidth<=1180)cw.infoOpen=cw.infoNarrowOpen;cwSavePanelPreferences();}
      cwSyncPanels();
      if (cw.infoNarrowOpen && window.innerWidth <= 720) $('cwCloseInfo').focus();
    };
    cwSyncPanels();
    var back = $('cwBack');
    if (back) back.onclick = function () { var el = $('cw');if(window.innerWidth>720){cw.railCollapsed=false;cwSavePanelPreferences();cwSyncPanels();$('cwCollapseRail').focus();}else{if(el)el.classList.toggle('rail-open');cw.infoNarrowOpen=false;cwSyncPanels();$('cwCloseRail').focus();} };
    var input = $('cwInput');
    cwRestoreDraft(input);
    input.addEventListener('paste', cwPasteImages);
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); cwSend(); } });
    input.addEventListener('input', function () { input.style.height = 'auto'; input.style.height = Math.min(160, input.scrollHeight) + 'px'; cwSaveDraft(); cwRenderComposerAction(); cwUpdateJumpLatest(); });
    $('cwMsgs').addEventListener('toggle', function () { cwUpdateJumpLatest(); }, true);
    $('cwFile').onchange = function () { cwAddFiles(Array.prototype.slice.call($('cwFile').files || [])); $('cwFile').value = ''; };
    $('cwSend').onclick = cwSend;
    $('cwStop').onclick = cwStopRun;
    // "+" menu: Mission / Tag folder / Schedule. The popover toggles natively
    // via popovertarget; we only position it above the composer like the
    // per-message action menus.
    var plusBtn = $('cwPlus');
    var plusMenu = $('cwPlusMenu');
    if (plusBtn && plusMenu) {
      plusBtn.onclick = function () {
        var rect = plusBtn.getBoundingClientRect();
        plusMenu.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - 200)) + 'px';
        plusMenu.style.top = 'auto';
        plusMenu.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
      };
      plusMenu.querySelectorAll('[data-cwplus]').forEach(function (b) {
        b.onclick = function () {
          plusMenu.hidePopover();
          var action = b.getAttribute('data-cwplus');
          if (action === 'mission') cwMissionModal(conv);
          else if(action==='attach')$('cwFile').click();
          else if (action === 'folder') cwFolderModal(conv);
          else if (action === 'schedule') cwScheduleModal(conv);
        };
      });
    }
    cwRenderMembers();
    cwRenderMsgs();
    cwRenderWork();
    cwRenderFolders();
    cwRenderPending();
    cwRenderReferences();
    cwRenderInfo();
    cwRenderTyping();
    if (scroll) cwRestoreScroll($('cwMsgs'), scroll);
    else cwJumpLatest();
  }

  // Updating the roster must preserve the user's draft and cursor.
  function cwRenderMembers() {
    var cw = cwEnsure();
    var conv = cwActiveConv();
    if (!conv) return;
    var members = cwConvMembers(conv);
    var activeThread = cw.threadId ? (cw.threads || []).filter(function (thread) { return thread.id === cw.threadId; })[0] : null;
    var title = $('cwChatTitle');
    if (title) title.textContent = activeThread ? activeThread.title : conv.title;
    var names = $('cwMemberNames');
    if (names) names.textContent = (activeThread ? conv.title + ' · ' : '') + members.map(function (m) { return '@' + m.name; }).join(' · ');
    var input = $('cwInput');
    if (input && activeThread) input.placeholder = (conv.memberIds.length > 1 ? 'Message the whole team — @Name to target someone' : 'Message ' + conv.title) + ' — ' + activeThread.title;
    var men = $('cwMentions');
    if (men) men.innerHTML = '';
    if (conv.memberIds.length > 1 && men) {
      members.forEach(function (m) {
        var b = document.createElement('button');
        b.textContent = '@' + m.name;
        b.title = 'Insert @' + m.name;
        b.onclick = function () {
          var input = $('cwInput');
          if (!input) return;
          var at = input.selectionStart || input.value.length;
          input.value = input.value.slice(0, at) + '@' + m.name + ' ' + input.value.slice(at);
          cwSaveDraft();
          cwRenderComposerAction();
          input.focus();
        };
        men.appendChild(b);
      });
    }
  }

  function cwRenderMissionBadge() {
    var cw = cwEnsure();
    var badge = $('cwMissionBadge');
    if (!badge) return;
    badge.hidden = !(cw.missions || []).some(function (mission) { return mission.conversationId === cw.active && mission.status === 'running'; });
  }

  function cwArtifact(id) {
    var artifacts = cwEnsure().artifacts || [];
    for (var i = 0; i < artifacts.length; i++) if (artifacts[i].id === id) return artifacts[i];
    return null;
  }

  function cwBytes(size) {
    var value = Number(size) || 0;
    if (value < 1024) return value + ' B';
    if (value < 1048576) return Math.round(value / 1024) + ' KB';
    return (value / 1048576).toFixed(1) + ' MB';
  }

  // Shared files live on the gallery page; the transcript keeps a compact link.
  function cwFilesHtml(ids, role) {
    var files = (ids || []).map(cwArtifact).filter(Boolean);
    if (!files.length) return '';
    var cw=cwEnsure(),seen=cw.mediaStackSeen||(cw.mediaStackSeen=new Set()),key=files.map(function(file){return file.id;}).join(':'),fresh=!seen.has(key);seen.add(key);
    var sheets=files.slice(0,3).map(function(file,index){var mime=file.mime||'',preview=/^image\//i.test(mime)?'<img src="/api/cowork/artifacts/'+encodeURIComponent(file.id)+'?inline=1" alt="" loading="lazy" decoding="async">':cwIcon(/^video\//i.test(mime)?'play':/^audio\//i.test(mime)?'play':'file');return '<span class="cw-stack-sheet" style="--stack-delay:'+index*55+'ms">'+preview+'</span>';}).join('');
    return '<div class="cw-media-stack-row'+(role==='user'?' me':'')+'"><button class="cw-media-stack-trigger'+(fresh?' is-new':'')+'" data-cwgallery="' + esc(files[0].id) + '" aria-label="Open gallery: '+files.length+' shared '+(files.length===1?'file':'files')+'" title="' + esc(files.map(function(file){return file.name;}).join(', ')) + '"><span class="cw-media-stack" aria-hidden="true">'+sheets+'</span><span class="cw-media-stack-copy"><strong>'+(files.length===1?esc(files[0].name):files.length+' shared files')+'</strong><span>Open gallery '+cwIcon('back')+'</span></span></button></div>';
  }

  function cwBindFileCards(root) {
    if (!root) return;
    root.querySelectorAll('[data-cwpreview]').forEach(function (button) {
      button.onclick = function () { cwPreviewFile(button.getAttribute('data-cwpreview')); };
    });
    root.querySelectorAll('[data-cwgallery]').forEach(function (button) { button.onclick = function () { cwOpenGallery(button.getAttribute('data-cwgallery')); }; });
    cwBindRichCards(root);
  }

  function cwPreviewFile(id) {
    var file = cwArtifact(id);
    if (!file) { toast('That file is no longer available', true); return; }
    // Chrome and Electron draw PDFs with the built-in viewer, and a bare sandbox
    // attribute blocks that plugin, so PDFs load unsandboxed. Everything else
    // stays sandboxed (allow-downloads keeps the fallback page's download link
    // working) on top of the server's Content-Security-Policy.
    var isPdf = /^application\/pdf/i.test(file.mime || '') || /\.pdf$/i.test(file.name || '');
    var theme = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    var modal = document.createElement('div');
    modal.className = 'modal cw-modal cw-doc-modal';
    modal.innerHTML = '<div class="box" style="display:flex;flex-direction:column"><div class="bar"><span>' + esc(file.name) + '</span><span style="flex:1"></span>' +
      '<a class="btn ghost" href="/api/cowork/artifacts/' + encodeURIComponent(file.id) + '" download>Download</a><button class="btn ghost" data-close>Close</button></div>' +
      '<iframe class="cw-doc-frame" title="Document preview"' + (isPdf ? '' : ' sandbox="allow-downloads allow-popups allow-popups-to-escape-sandbox"') + ' src="/api/cowork/artifacts/' + encodeURIComponent(file.id) + '/preview?theme=' + theme + '&amp;embedded=1"></iframe></div>';
    document.body.appendChild(modal);
    modal.querySelector('[data-close]').onclick = function () { modal.remove(); };
  }

  // The credential card composes the secure connection form from
  // ui-connections.ts (connectionInputHtml). The key is typed here only and
  // posted straight to /api/connections; the request is then resolved with the
  // saved connection id, so the secret never enters chat history or prompts.
  function cwCredentialFormHtml(request) {
    var cred = request.credential || {};
    if (String(cred.providerHint || '').toLowerCase() === 'ssh' || /^ssh:/i.test(cred.baseUrl || '')) {
      return '<form class="cw-credential-form connection-form" data-cwsshcredential="' + esc(request.id) + '">' +
        '<div class="connection-fields">' +
        '<label class="connection-field"><span>Connection name</span><input name="label" value="' + esc(cred.label || 'SSH server') + '" required autocomplete="off"></label>' +
        '<label class="connection-field"><span>SSH address</span><input name="baseUrl" type="url" value="' + esc(cred.baseUrl || '') + '" placeholder="ssh://user@host:22" required autocomplete="off" spellcheck="false"></label>' +
        '<label class="connection-field"><span>SSH password</span><input name="password" type="password" required autocomplete="new-password"></label>' +
        '</div>' +
        '<div class="connection-secret-actions"><span class="hint">Password stays on this device and never enters chat.</span><button class="btn ghost" type="button" data-cwshowsshpassword>Show password</button></div>' +
        '<button class="btn ghost" type="button" data-cwcheckssh>Check server key</button>' +
        '<div class="cw-ssh-fingerprint" hidden></div>' +
        '<label class="connection-field cw-ssh-confirm" hidden><input type="checkbox" name="confirmHost"> This fingerprint matches my hosting console or known SSH host key.</label>' +
        '<div class="connection-error" role="alert" hidden></div>' +
        '<button type="submit" class="btn dark" data-cwsavessh>Test password and continue</button></form>';
    }
    var reauth = !!cred.connectionId;
    return '<form class="cw-credential-form connection-form" data-cwcredential="' + esc(request.id) + '"' + (reauth ? ' data-cwreauth="' + esc(cred.connectionId) + '"' : '') + '>' +
      '<div class="connection-fields">' +
      (reauth ? '' :
        connectionInputHtml('label', cred.label || cred.providerHint || '', true) +
        connectionInputHtml('provider', cred.providerHint || '', true) +
        connectionInputHtml('baseUrl', cred.baseUrl || '', true) +
        connectionInputHtml('validationPath', cred.validationPath || '/', false)) +
      connectionInputHtml('token', '', true) +
      '</div>' +
      '<div class="connection-secret-actions"><span class="hint">Saved securely on this device. Never sent to the model or chat history.</span><button class="btn ghost" type="button" data-cwshowkey aria-pressed="false">Show key</button></div>' +
      '<div class="connection-error" role="alert" hidden></div>' +
      '<button type="submit" class="btn dark" data-cwsavecredential>' + (reauth ? 'Update key and continue' : 'Save key and continue') + '</button></form>';
  }

  function cwBindCredentialForms(el) {
    el.querySelectorAll('[data-cwsshcredential]').forEach(function (form) {
      if (form.dataset.cwBound) return;
      form.dataset.cwBound = '1';
      var id = form.getAttribute('data-cwsshcredential');
      var address = form.querySelector('[name="baseUrl"]');
      var password = form.querySelector('[name="password"]');
      var fingerprint = form.querySelector('.cw-ssh-fingerprint');
      var confirm = form.querySelector('.cw-ssh-confirm');
      var confirmed = form.querySelector('[name="confirmHost"]');
      var error = form.querySelector('.connection-error');
      var check = form.querySelector('[data-cwcheckssh]');
      var save = form.querySelector('[data-cwsavessh]');
      var currentFingerprint = '';
      var checkedAddress = '';
      var fail = function (message) { error.textContent = message; error.hidden = false; };
      address.oninput = function () { currentFingerprint = ''; checkedAddress = ''; fingerprint.hidden = true; confirm.hidden = true; confirmed.checked = false; };
      var show = form.querySelector('[data-cwshowsshpassword]');
      show.onclick = function () {
        var visible = password.type === 'text';
        password.type = visible ? 'password' : 'text';
        show.textContent = visible ? 'Show password' : 'Hide password';
      };
      check.onclick = function () {
        if (!address.value.trim()) { fail('Enter the SSH address first.'); return; }
        error.hidden = true;
        check.disabled = true; check.textContent = 'Checking server key…';
        api('/api/cowork/requests/' + encodeURIComponent(id) + '/ssh-host-key', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ baseUrl: address.value.trim() }) })
          .then(function (result) {
            currentFingerprint = result.fingerprint;
            checkedAddress = address.value.trim();
            fingerprint.textContent = 'Server fingerprint: ' + currentFingerprint;
            fingerprint.hidden = false; confirm.hidden = false; confirmed.checked = false;
          }).catch(function (e) { fail((e && e.message) || 'Could not read the server key.'); })
          .finally(function () { check.disabled = false; check.textContent = 'Check server key'; });
      };
      form.onsubmit = function (event) {
        event.preventDefault();
        if (!form.reportValidity()) return;
        if (!currentFingerprint || checkedAddress !== address.value.trim() || !confirmed.checked) { fail('Check and confirm the SSH server fingerprint first.'); return; }
        error.hidden = true; save.disabled = true; save.textContent = 'Testing SSH…';
        api('/api/cowork/requests/' + encodeURIComponent(id) + '/ssh-save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: form.querySelector('[name="label"]').value.trim(), baseUrl: address.value.trim(), password: password.value, hostFingerprint: currentFingerprint }) })
          .then(function (result) {
            password.value = '';
            return api('/api/cowork/requests/' + encodeURIComponent(id), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'provide', connectionId: result.connection.id }) });
          }).then(function (result) {
            var cw = cwEnsure();
            cw.requests = (cw.requests || []).map(function (request) { return request.id === id ? result.request : request; });
            cwRenderInfo(); cwRenderRail(); cwPoll();
            toast('SSH connection verified and saved');
          }).catch(function (e) { fail((e && e.message) || 'SSH connection failed.'); })
          .finally(function () { save.disabled = false; save.textContent = 'Test password and continue'; });
      };
    });
    el.querySelectorAll('[data-cwcredential]').forEach(function (form) {
      if (form.dataset.cwBound) return;
      form.dataset.cwBound = '1';
      var show = form.querySelector('[data-cwshowkey]');
      if (show) show.onclick = function () {
        var tokenInput = form.querySelector('[data-connection-field="token"]');
        if (!tokenInput) return;
        var visible = tokenInput.type === 'text';
        tokenInput.type = visible ? 'password' : 'text';
        show.textContent = visible ? 'Show key' : 'Hide key';
        show.setAttribute('aria-pressed', visible ? 'false' : 'true');
      };
      form.onsubmit = function (event) {
        event.preventDefault();
        var cw = cwEnsure();
        var id = form.getAttribute('data-cwcredential');
        var reauth = form.getAttribute('data-cwreauth') || '';
        var error = form.querySelector('.connection-error');
        var fail = function (message) { if (error) { error.textContent = message; error.hidden = false; } else toast(message, true); };
        var values = {};
        form.querySelectorAll('[data-connection-field]').forEach(function (input) { values[input.getAttribute('data-connection-field')] = input.value.trim(); });
        if (!values.token) { fail('Paste the API key or token first.'); return; }
        var submit = form.querySelector('[data-cwsavecredential]');
        if (submit) { submit.disabled = true; submit.textContent = 'Saving…'; }
        var resetSubmit = function () {
          if (!submit) return;
          submit.disabled = false;
          submit.textContent = reauth ? 'Update key and continue' : 'Save key and continue';
        };
        var lookup = reauth
          ? api('/api/connections').then(function (data) {
              var existing = (data.connections || []).filter(function (connection) { return connection.id === reauth; })[0];
              if (!existing) throw new Error('The saved connection is gone — ask the agent to request a new one.');
              return existing;
            })
          : Promise.resolve(null);
        lookup.then(function (existing) {
          var profile = existing
            ? { id: existing.id, label: existing.label, provider: existing.provider, baseUrl: existing.baseUrl, documentationUrl: existing.documentationUrl, capabilities: existing.capabilities, operations: existing.operations, token: values.token }
            : {
                label: values.label || values.provider,
                provider: values.provider,
                baseUrl: values.baseUrl,
                capabilities: ['connection.discover'],
                operations: [{ id: 'validate', label: 'Validate saved connection', capability: 'connection.discover', method: 'GET', path: values.validationPath || '/', risk: 'read' }],
                token: values.token
              };
          return api('/api/connections', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profile) });
        }).then(function (result) {
          // Only the saved connection id goes back to the request — never the key.
          values.token = '';
          var tokenInput = form.querySelector('[data-connection-field="token"]');
          if (tokenInput) tokenInput.value = '';
          return api('/api/cowork/requests/' + encodeURIComponent(id), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'provide', connectionId: result.connection.id }) });
        }).then(function (d) {
          cw.requests = (cw.requests || []).map(function (request) { return request.id === id ? d.request : request; });
          cwRenderInfo(); cwRenderRail(); cwPoll();
          toast('Credential saved securely');
        }).catch(function (e) { fail((e && e.message) || 'Could not save the credential'); }).finally(function () {
          resetSubmit();
        });
      };
    });
  }

  function cwActionWords(value) {
    var text = String(value).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase();
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  function cwAppActionName(tool, service) {
    var prefix = String(service).toUpperCase() + '_';
    return cwActionWords(String(tool).toUpperCase().indexOf(prefix) === 0 ? String(tool).slice(prefix.length) : tool);
  }
  function cwActionValueHtml(value) {
    if (value === null) return 'Not set';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (Array.isArray(value)) return value.length ? '<ul class="cw-action-values">' + value.map(function (item) { return '<li>' + cwActionValueHtml(item) + '</li>'; }).join('') + '</ul>' : 'None';
    if (typeof value === 'object') {
      var keys = Object.keys(value);
      return keys.length ? '<dl class="cw-action-fields">' + keys.map(function (key) { return '<dt>' + esc(cwActionWords(key)) + '</dt><dd>' + cwActionValueHtml(value[key]) + '</dd>'; }).join('') + '</dl>' : 'None';
    }
    return esc(value === '' ? '(empty)' : value);
  }
  function cwAppApprovalPresentation(request) {
    // Older saved cards carry the exact action in their detail text. Format it
    // for review without changing the payload or the approval's signature.
    var heading = request.kind === 'recommendation' && /^Review this ([\w-]+) action:\r?\n/.exec(request.detail || '');
    var title = /^Run ([\w-]+)$/.exec(request.title || '');
    if (!heading || !title) return null;
    var service = heading[1], tool = title[1];
    var names = { gmail: 'Gmail', gdrive: 'Google Drive', googledrive: 'Google Drive', gcalendar: 'Google Calendar', googlecalendar: 'Google Calendar', googlesheets: 'Google Sheets' };
    var serviceName = names[service.toLowerCase()] || cwActionWords(service);
    var actionName = cwAppActionName(tool, service);
    var payload = request.appAction;
    if (payload === undefined) try { payload = JSON.parse(request.detail.slice(heading[0].length).split(/\r?\n/)[0]); } catch (e) {}
    var valid = payload && payload.service === service && payload.tool === tool && typeof payload.accountId === 'string' && payload.accountId && payload.args && typeof payload.args === 'object' && !Array.isArray(payload.args);
    var html = '<div class="cw-action-service">' + cwToolIconHtml({ tool: 'connected_apps', appService: service }) + '<span>' + esc(serviceName) + ' · Connected account</span></div>';
    if (valid) {
      if (Object.keys(payload.args).length) html += cwActionValueHtml(payload.args);
      html += '<div class="d">Accept once, or always allow this tool for this teammate and account. Manage saved permissions in Connections.</div>' +
        '<details class="cw-action-account"><summary>Account details</summary><div>Connection: ' + esc(payload.accountId) + '</div></details>';
    } else html += '<div class="d">The action details are incomplete. Ask your teammate to create a fresh review.</div>';
    return { title: actionName, serviceName: serviceName, html: html, valid: Boolean(valid) };
  }
  function cwRequestHtml(request) {
    if (request.appConnection) return cwAppConnectionHtml(request);
    var cw = cwEnsure();
    var agent = cwAgentById(request.agentId);
    var appApproval = cwAppApprovalPresentation(request);
    var label = appApproval ? 'App approval' : request.kind === 'permission' ? 'Permission request' : request.kind === 'question' ? 'Question' : request.kind === 'credential' ? 'Secure credential request' : 'Recommendation';
    var controls = '';
    if (request.status !== 'open') controls = '<span class="cw-request-result">' + (appApproval && request.response === 'Always allowed' ? 'Always allowed' : esc(request.status.charAt(0).toUpperCase() + request.status.slice(1)) + (request.response ? ' · ' + esc(request.response) : '')) + '</span>';
    else if (request.kind === 'permission') controls = '<button class="btn dark" data-cwrequest="' + esc(request.id) + '" data-action="approve">Allow</button><button class="btn ghost" data-cwrequest="' + esc(request.id) + '" data-action="deny">Deny</button>';
    else if (request.kind === 'recommendation') controls = '<button class="btn dark" data-cwrequest="' + esc(request.id) + '" data-action="accept">Accept</button><button class="btn ghost" data-cwrequest="' + esc(request.id) + '" data-action="dismiss">Dismiss</button>';
    else if (request.kind === 'credential') controls = cwCredentialFormHtml(request);
    else controls = (request.options || []).map(function (option) { return '<button class="btn ghost" data-cwrequest="' + esc(request.id) + '" data-action="answer" data-response="' + esc(option) + '">' + esc(option) + '</button>'; }).join('') + '<input data-cwanswer="' + esc(request.id) + '" aria-label="Answer: ' + esc(request.title) + '" placeholder="Type your answer"><button class="btn dark" data-cwrequest="' + esc(request.id) + '" data-action="answer">Send</button>';
    if (appApproval && !appApproval.valid && request.status === 'open') controls = controls.replace('data-action="accept"', 'data-action="accept" disabled');
    if (appApproval && appApproval.valid && request.status === 'open') controls = controls.replace('<button class="btn ghost"', '<button class="btn ghost" data-cwrequest="' + esc(request.id) + '" data-action="always-allow" title="Always allow this teammate to use this tool with this account. Revoke in Connections.">Always allow</button><button class="btn ghost"');
    if (request.desktopHandoff && request.status === 'open') controls = '<button class="btn dark" data-cwhandoff="' + esc(request.agentId) + '">Open computer</button>' + controls;
    if (cw.requestPending && cw.requestPending[request.id]) controls = controls.replace(/<(button|input)\b/g, '<$1 disabled');
    return '<div class="cw-row cw-request-row" data-cwrequest-row="' + esc(request.id) + '">' + cwAva(agent) + '<div class="cw-bubble">' +
      '<div class="cw-meta"><span class="nm">' + esc(agent ? agent.name : 'Teammate') + '</span><span class="tg">' + cwTime(request.createdAt) + '</span></div>' +
      '<div class="cw-request"><div class="k">' + label + '</div><div class="t">' + esc(appApproval ? appApproval.title : request.title) + '</div>' +
      (appApproval ? appApproval.html : request.detail ? '<div class="d">' + esc(request.detail) + '</div>' : '') + '<div class="cw-actions">' + controls + '</div></div></div></div>';
  }

  function cwRenderWork() {
    var cw = cwEnsure();
    var el = $('cwWork');
    if (!el) return;
    var messages = $('cwMsgs');
    var scroll = messages && cwCaptureScroll(messages);
    var todos = (cw.todos || []).filter(function (todo) { return todo.status !== 'cancelled'; });
    var active = todos.filter(function (todo) { return todo.status === 'pending' || todo.status === 'in_progress' || todo.status === 'blocked'; });
    var todoHtml = todos.length ? '<details class="cw-todos"' + ((cw.todoOpen === undefined ? active.length > 0 : cw.todoOpen) ? ' open' : '') + '><summary>' + active.length + ' active · ' + todos.length + ' total todo' + (todos.length === 1 ? '' : 's') + '</summary>' + todos.map(function (todo) {
      var owner = cwAgentById(todo.agentId);
      return '<div class="cw-todo ' + esc(todo.status) + '" title="' + esc(todo.note || '') + '"><span>' + (todo.status === 'done' ? '✓' : todo.status === 'blocked' ? '!' : '○') + '</span><b>' + esc(todo.text) + '</b><div class="cw-todo-meta"><span>' + esc(todo.status.replace('_', ' ')) + '</span><span class="cw-todo-owner">' + esc(owner ? '@' + owner.name : '') + '</span></div></div>';
    }).join('') + '</details>' : '';
    el.innerHTML = todoHtml;
    var checklist = el.querySelector('.cw-todos');
    if (checklist) checklist.ontoggle = function () { cw.todoOpen = checklist.open; };
    cwRestoreScroll(messages, scroll);
  }

  function cwBindRequests(el) {
    var cw = cwEnsure();
    if (typeof cwBindAppConnections === 'function') cwBindAppConnections(el);
    el.querySelectorAll('[data-cwhandoff]').forEach(function (button) {
      button.onclick = function () { cwOpenDesktop(button.getAttribute('data-cwhandoff')); };
    });
    el.querySelectorAll('[data-cwrequest]').forEach(function (button) {
      button.onclick = function () {
        var id = button.getAttribute('data-cwrequest');
        var action = button.getAttribute('data-action');
        var response = button.getAttribute('data-response') || '';
        var input = el.querySelector('[data-cwanswer="' + id + '"]');
        if (!response && input) response = input.value.trim();
        if (action === 'answer' && !response) { toast('Type an answer first', true); return; }
        var pending = cw.requestPending || (cw.requestPending = {});
        if (pending[id]) return;
        pending[id] = true;
        var convId = cw.active;
        el.querySelectorAll('[data-cwrequest="' + id + '"]').forEach(function (control) { control.disabled = true; });
        api('/api/cowork/requests/' + encodeURIComponent(id), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: action, response: response }) })
          .then(function (d) {
            if (cw.active !== convId) return;
            cw.requests = (cw.requests || []).map(function (request) { return request.id === id ? d.request : request; });
            if (d.agent) cw.agents = cw.agents.map(function (agent) { return agent.id === d.agent.id ? d.agent : agent; });
            cwRenderInfo(); cwRenderRail(); cwPoll();
          }).catch(function (e) { toast(e.message, true); }).finally(function () {
            delete pending[id];
            if (cw.active === convId) cwRenderMsgs();
          });
      };
    });
    cwBindCredentialForms(el);
  }

  function cwRenderFolders() {
    var cw = cwEnsure(), el = $('cwComposerFolders');
    if (!el) return;
    var folders = cw.folders || [];
    el.hidden = folders.length === 0;
    el.innerHTML = folders.map(function (folder) {
      var label = folder.label || folder.path || 'Folder';
      return '<span class="cw-folder-tag" title="' + esc(folder.path || label) + '">' + cwIcon('folder') +
        '<span class="cw-folder-tag-label">' + esc(label) + '</span>' +
        (folder.label && folder.path ? '<span class="cw-folder-tag-path">' + esc(folder.path) + '</span>' : '') +
        '<button type="button" data-cwuntag="' + esc(folder.id) + '" aria-label="Untag folder: ' + esc(label) + '" title="Untag folder">' + cwIcon('close') + '</button></span>';
    }).join('');
    el.querySelectorAll('[data-cwuntag]').forEach(function (button) {
      button.onclick = function () {
        var conv = cwActiveConv(), convId = conv && conv.id, id = button.getAttribute('data-cwuntag');
        if (!convId || !id) return;
        button.disabled = true;
        api('/api/cowork/conversations/' + encodeURIComponent(convId) + '/folders/' + encodeURIComponent(id), { method: 'DELETE' })
          .then(function () {
            if (cwEnsure().active !== convId) return;
            var folders = (cwEnsure().folders || []).filter(function (folder) { return folder.id !== id; });
            cwEnsure().folders = folders;
            cwRenderFolders();
            toast('Folder untagged');
          })
          .catch(function (e) { toast(e.message, true); })
          .finally(function () { button.disabled = false; });
      };
    });
  }

  function cwRenderPending() {
    var cw = cwEnsure();
    var el = $('cwPending');
    if (!el) return;
    el.innerHTML = (cw.pendingFiles || []).map(function (file, i) {
      var preview = /^data:image\/(png|jpeg|gif|webp|bmp);base64,/i.test(file.dataUrl || '') ? '<img src="' + esc(file.dataUrl) + '" alt="' + esc(file.name) + '">' : cwIcon('file');
      return '<span title="' + esc(file.name) + '">' + preview + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(file.name) + (file.loading ? ' · Loading…' : '') + '</span><button data-cwremovefile="' + i + '" title="Remove" aria-label="Remove ' + esc(file.name) + '">×</button></span>';
    }).join('');
    el.querySelectorAll('[data-cwremovefile]').forEach(function (button) { button.onclick = function () { cw.pendingFiles.splice(Number(button.getAttribute('data-cwremovefile')), 1); cwRenderPending(); }; });
    cwRenderComposerAction();
  }

  function cwPasteImages(event) {
    var clipboard = event.clipboardData;
    if (!clipboard) return;
    var images = Array.prototype.slice.call(clipboard.items || []).filter(function (item) {
      return item.kind === 'file' && /^image\//i.test(item.type);
    }).map(function (item) { return item.getAsFile(); }).filter(Boolean);
    if (!images.length) images = Array.prototype.slice.call(clipboard.files || []).filter(function (file) { return /^image\//i.test(file.type); });
    if (!images.length) return;
    // Preserve any accompanying text through the browser's normal paste action.
    if (!clipboard.getData('text/plain')) event.preventDefault();
    cwAddFiles(images);
  }

  function cwAddFiles(files) {
    var cw = cwEnsure();
    var pending = cw.pendingFiles || (cw.pendingFiles = []);
    var room = Math.max(0, 4 - pending.length);
    files.slice(0, room).forEach(function (file) {
      if (file.size > 20000000) { toast(file.name + ' is larger than 20 MB', true); return; }
      var attachment = { name: file.name || 'pasted-image.' + ((file.type || '').split('/')[1] || 'png'), type: file.type || '', dataUrl: '', loading: true };
      pending.push(attachment);
      var reader = new FileReader();
      reader.onload = function () {
        attachment.dataUrl = String(reader.result || '');
        delete attachment.loading;
        if (cw.pendingFiles === pending) cwRenderPending();
      };
      reader.onerror = function () {
        var index = pending.indexOf(attachment);
        if (index >= 0) pending.splice(index, 1);
        if (cw.pendingFiles === pending) { toast('Could not read ' + attachment.name, true); cwRenderPending(); }
      };
      reader.readAsDataURL(file);
    });
    cwRenderPending();
    if (files.length > room) toast('You can attach up to 4 files at once', true);
  }

  function cwLocalMessages() {
    var cw = cwEnsure();
    return Object.keys(cw.outbox).map(function (id) { return cw.outbox[id]; }).filter(function (entry) {
      return entry.conversationId === cw.active && (entry.payload.threadId || null) === (cw.threadId || null);
    }).map(function (entry) { return entry.message; });
  }

  function cwMessage(id) {
    return cwEnsure().msgs.find(function (m) { return m.id === id; });
  }

  // A seq-only fallback keeps older servers/fixtures working. Real rows always
  // reconcile by logical id, including the optimistic row before POST returns.
  function cwMergeMessage(m, fromSnapshot) {
    var cw = cwEnsure();
    // Only snapshots cover every row up to the cursor. Mutation responses can
    // arrive before intervening rows, so must not advance the polling cursor.
    if (fromSnapshot) cw.lastSeq = Math.max(cw.lastSeq, m.seq || 0);
    if (m.id && cw.removedMessages[cw.active + '/' + m.id]) return false;
    var at = cw.msgs.findIndex(function (old) { return m.id ? old.id === m.id : !old.id && old.seq === m.seq; });
    var old = at >= 0 ? cw.msgs[at] : null;
    if (old && !old.localOnly && ((m.changeSeq || 0) < (old.changeSeq || 0) || (m.revision || 0) < (old.revision || 0) || (m.attempt || 0) < (old.attempt || 0))) return false;
    if (m.id) delete cw.outbox[m.id];
    // Streams can repeat unchanged rows. Avoid replacing the transcript and
    // dismissing an open message menu on every heartbeat.
    if (old && JSON.stringify(old) === JSON.stringify(m)) return false;
    if (at >= 0) cw.msgs[at] = m; else cw.msgs.push(m);
    cw.msgs.sort(function (a, b) { return (a.seq || Infinity) - (b.seq || Infinity); });
    return true;
  }

  function cwRemoveMessage(id) {
    var cw = cwEnsure();
    cw.removedMessages[cw.active + '/' + id] = true;
    delete cw.outbox[id];
    cw.msgs = cw.msgs.filter(function (m) { return m.id !== id; });
    cw.referencedMessageIds = cw.referencedMessageIds.filter(function (ref) { return ref !== id; });
    cwRenderReferences();
  }

  function cwReferenceLabel(id) {
    var m = cwMessage(id);
    return m ? (m.role === 'user' ? 'You' : m.agentName || 'Message') + ': ' + (m.text || 'Attachment').slice(0, 80) : 'Message ' + id;
  }

  function cwRenderReferences() {
    var cw = cwEnsure(), el = $('cwReferences');
    if (!el) return;
    el.innerHTML = cw.referencedMessageIds.map(function (id) {
      return '<span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(cwReferenceLabel(id)) + '</span><button data-cwunreference="' + esc(id) + '" aria-label="Remove reference" title="Remove reference">×</button></span>';
    }).join('');
    el.querySelectorAll('[data-cwunreference]').forEach(function (b) { b.onclick = function () {
      cw.referencedMessageIds = cw.referencedMessageIds.filter(function (id) { return id !== b.getAttribute('data-cwunreference'); });
      cwRenderReferences();
    }; });
  }

  function cwMessageActive(m) { return m.status === 'sending' || m.status === 'retrying' || !!cwEnsure().messageLocks[m.id]; }

  function cwMessageActionsHtml(m) {
    if (!m.id) return '';
    var active = cwMessageActive(m);
    function button(action, label, disabled) { return '<button data-cwmessage="' + esc(m.id) + '" data-cwaction="' + action + '"' + (disabled ? ' disabled' : '') + '>' + label + '</button>'; }
    var refs = (m.referencedMessageIds || []).map(function (id) { return esc(cwReferenceLabel(id)); });
    var html = refs.length ? '<div class="cw-message-refs">References: ' + refs.join(' · ') + '</div>' : '';
    if (m.localOnly && m.files && m.files.length) html += '<div class="cw-message-refs">Attachments: ' + m.files.map(function (f) { return esc(f.name); }).join(', ') + '</div>';
    var menuId = 'cw-message-menu-' + m.id;
    html += '<div class="cw-message-actions"><button class="cw-message-more" type="button" popovertarget="' + esc(menuId) + '" aria-label="Message actions" title="Message actions">…</button><div class="cw-message-menu" id="' + esc(menuId) + '" popover="auto" aria-label="Message actions">' + button('copy', 'Copy', false);
    if (m.role === 'user') {
      html += button('edit', 'Edit', active);
      if (m.status === 'failed') html += button('retry', 'Retry', active);
    }
    html += button('reference', 'Reference', !!m.localOnly) + button('delete', 'Delete', active);
    html += '</div>';
    if (m.role === 'user' && m.status) html += '<span role="status" class="cw-message-status ' + esc(m.status) + '">' + esc(m.localOnly && m.status === 'failed' ? 'Delivery unconfirmed' : m.status) + '</span>';
    if (m.revision) html += '<span class="cw-message-status">Edited</span>';
    return html + '</div>';
  }

  function cwSystemEventHtml(message) {
    var cw = cwEnsure(), text = String(message.text || '');
    var reminder = /^Follow-up reminder from @([^:\n]+): ([\s\S]+)\. Act on it with your tools and report the result to the user here\.$/.exec(text);
    var instruction = reminder ? reminder[2] : text;
    var decision = /^The user responded to your (recommendation|question|permission) "([\s\S]+)": ([\s\S]+)\. Continue from that decision and report what you do\.$/.exec(instruction);
    var confirmation = /^(Recommendation|Question|Permission) (accepted|dismissed|answered|approved|denied): ([\s\S]+)\.$/.exec(text);
    var request = (cw.requests || []).slice().reverse().find(function (r) {
      if (decision) return r.kind === decision[1] && r.title === decision[2] && r.status !== 'open' && String(r.response || r.status) === decision[3];
      return confirmation && r.kind === confirmation[1].toLowerCase() && r.status === confirmation[2] && String(r.response || r.status) === confirmation[3] && Math.abs(Date.parse(r.resolvedAt) - Date.parse(message.ts)) < 3000;
    });
    if (!request && !reminder) return null;
    var agent = request && cwAgentById(request.agentId), app = request && cwAppApprovalPresentation(request);
    var title, detail, icon = 'clock';
    if (request) {
      var action = app ? app.title : request.title;
      if (decision) { title = (reminder ? reminder[1] : agent ? agent.name : 'Your teammate') + ' resumed work'; detail = 'After your response · ' + action; icon = 'bolt'; }
      else { title = (request.response === 'Always allowed' ? 'You always allowed ' : request.status === 'accepted' || request.status === 'approved' ? 'You approved ' : request.status === 'dismissed' || request.status === 'denied' ? 'You declined ' : 'You answered ') + action; detail = agent ? agent.name : ''; icon = 'check'; }
      if (app) detail += (detail ? ' · ' : '') + app.serviceName;
    } else { title = 'Scheduled follow-up · ' + reminder[1]; detail = reminder[2]; }
    return '<div class="cw-sys cw-event-row">' + cwIcon(icon) + '<div><strong>' + esc(title) + '</strong><span class="cw-event-detail">' + esc(detail) + '</span>' + cwFilesHtml(message.artifactIds) + '</div></div>';
  }
  function cwBubbleHtml(m) {
    var conv = cwActiveConv();
    var members = conv ? cwConvMembers(conv) : [];
    var agent = m.agentId ? cwAgentById(m.agentId) : null;
    if (m.role === 'system') {
      var event = cwSystemEventHtml(m);
      if (event !== null) return event;
      return m.text.length > 240 ? '<details class="cw-sys"><summary>' + esc(m.text.slice(0, 110)) + '…</summary><div class="cw-sys-detail">' + esc(m.text) + '</div>' + cwFilesHtml(m.artifactIds) + '</details>' : '<div class="cw-sys">' + esc(m.text) + cwFilesHtml(m.artifactIds) + '</div>';
    }
    if (m.role === 'user') {
      var via = '';
      if (m.via === 'telegram') via = ' · Telegram' + (m.from ? ' — ' + esc(m.from) : '');
      else if (m.via === 'schedule') via = ' · schedule';
      return '<div class="cw-row me"><div class="cw-bubble"><div class="cw-meta"><span class="nm">You</span><span class="tg">' + via + ' · ' + cwTime(m.ts) + '</span></div>' + cwBody(m.text, members, false) + cwMessageActionsHtml(m) + '</div></div>' + cwChatMediaHtml(m.text, 'user', m.id) + cwFilesHtml(m.artifactIds, 'user');
    }
    return cwReplyHtml(agent || { name: m.agentName || 'agent', avatar: { color: '#8f80ff', shape: 'cube' } }, cwTime(m.ts),
      cwBody(cwVisibleReply(m.text), members, false), cwMessageActionsHtml(m)) + cwChatMediaHtml(cwVisibleReply(m.text), 'agent', m.id) + cwFilesHtml(m.artifactIds, 'agent');
  }

  // Shared by Cowork replies and the main agent's completion report.
  function cwReplyHtml(agent, meta, body, actions) {
    return '<div class="cw-row">' + cwAva(agent) + '<div class="cw-bubble"><div class="cw-meta"><span class="nm">' + esc(agent.name) + '</span><span class="tg">' + esc(meta) + '</span></div>' + body + (actions || '') + '</div></div>';
  }

  // Older stored replies can contain raw tool protocol text. Hide that display
  // noise without changing stored messages or code examples in the reply.
  function cwVisibleReply(text) {
    return String(text || '').split(/(\x60\x60\x60[\s\S]*?(?:\x60\x60\x60|$)|\x60[^\x60\n]+\x60)/g).map(function (part, i) {
      if (i % 2) return part;
      return part.replace(/<tool>[\s\S]*?<\/tool>/gi, '')
        .replace(/<(?:[|｜]\s*(?:DSML\s*[|｜]\s*)?(?:tool_calls?|tool_name|parameters|calls|invoke)\b|[|｜]+\s*DSML\b|tool(?:\s|>|$)|tool_calls?\b|invoke\s+name\s*=)[\s\S]*$/gi, '')
        .replace(/<[|｜][^>]*$|<t(?:o(?:o(?:l)?)?)?$/gi, '');
    }).join('').trim();
  }

  function cwTime(ts) {
    var d = new Date(ts);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  // Small, safe rich-text renderer: escape first, then restore code fences,
  // inline code, bold, links, @mentions and markdown tables on the escaped
  // text. Backticks survive esc() unchanged, so \x60 matches them post-escape.
  // Tables are rebuilt from the raw (unescaped) source: each cell is escaped
  // individually, so no markup can smuggle through a pipe row.
  function cwTableHtml(block) {
    // A markdown table goes through the shared viewer whenever ui-outputs.js is
    // loaded, so the same pipe table renders identically on Coding and Cowork.
    // COWORK_JS is also evaluated standalone in its tests, and a table with no
    // body rows is rejected there, so the renderer below stays as the fallback.
    if (typeof outTableHtml === 'function') {
      var shared = outTableHtml(block);
      if (shared) return shared;
    }
    var rows = block.split('\n').map(function (line) { return line.trim(); }).filter(Boolean);
    if (rows.length < 2) return null;
    var isDivider = function (line) { return /^\|?[\s:|-]+\|?$/.test(line) && line.indexOf('-') >= 0; };
    if (!isDivider(rows[1])) return null;
    var cells = function (line) {
      var parts = line.replace(/^\|/, '').replace(/\|$/, '').split('|');
      return parts.map(function (cell) { return esc(cell.trim()); });
    };
    var head = cells(rows[0]);
    var body = rows.slice(2).map(cells);
    var html = '<table class="cw-table"><thead><tr>' + head.map(function (c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>';
    body.forEach(function (row) { html += '<tr>' + row.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; });
    return html + '</tbody></table>';
  }

  // A safe YouTube/Vimeo URL -> embeddable player URL; '' for anything else so
  // the link stays a plain anchor. Strict id charset — no query/fragment leaks in.
  /**
   * A fenced code block, with diff rows marked so a removal reads as a removal.
   * The text arrives ALREADY escaped by the caller, so it is never escaped again
   * here — only wrapped.
   */
  function cwCodeHtml(code) {
    var rows = String(code).replace(/^\n/, '').split('\n').map(function (row) {
      if (/^\+ /.test(row)) return '<span class="cw-dl add">' + row + '</span>';
      if (/^\u2212 |^- /.test(row)) return '<span class="cw-dl remove">' + row + '</span>';
      return row;
    }).join('\n');
    return '<span class="cw-code">' + rows + '</span>';
  }

  function cwVideoEmbed(destination) {
    var url;
    try { url = new URL(String(destination)); } catch (e) { return ''; }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return '';
    var host = url.hostname.toLowerCase().replace(/^www\./, ''), id = '';
    if (host === 'youtu.be') id = url.pathname.replace(/^\//, '');
    else if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
      else { var m = /^\/(embed|shorts|live)\/([^\/?#]+)/.exec(url.pathname); if (m) id = m[2]; }
    } else if (host === 'vimeo.com') { var v = /^\/(\d+)/.exec(url.pathname); if (v) id = v[1]; }
    id = String(id || '');
    if (host === 'vimeo.com') return /^\d{6,12}$/.test(id) ? 'https://player.vimeo.com/video/' + id : '';
    return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? 'https://www.youtube-nocookie.com/embed/' + id : '';
  }

  function cwMapLink(destination) {
    var url;try{url=new URL(destination);}catch(e){return null;}
    if(!/^https?:$/.test(url.protocol)||url.username||url.password)return null;
    var host=url.hostname.toLowerCase().replace(/^www\./,''),osm=host==='openstreetmap.org';
    if(!osm&&!(host==='maps.google.com'||host==='maps.app.goo.gl'||host==='goo.gl'&&/^\/maps(?:\/|$)/.test(url.pathname)||host==='google.com'&&/^\/maps(?:\/|$)/.test(url.pathname)))return null;
    var query=url.searchParams.get('q')||url.searchParams.get('query')||url.searchParams.get('ll')||'',coords=null;
    var pair=/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(query),path=/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(url.pathname),hash=/#map=\d+\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)/.exec(url.hash);
    if(pair||path||hash){var match=pair||path||hash;coords=[Number(match[1]),Number(match[2])];}
    if(osm&&url.searchParams.has('mlat')&&url.searchParams.has('mlon'))coords=[Number(url.searchParams.get('mlat')),Number(url.searchParams.get('mlon'))];
    if(coords&&(!Number.isFinite(coords[0])||!Number.isFinite(coords[1])||Math.abs(coords[0])>85||Math.abs(coords[1])>180))coords=null;
    var label=query&&!pair?query:'Map location',embed='';
    if(coords){var lat=coords[0],lon=coords[1],dx=.018,dy=.012;embed='https://www.openstreetmap.org/export/embed.html?bbox='+encodeURIComponent([Math.max(-180,lon-dx),lat-dy,Math.min(180,lon+dx),lat+dy].join(','))+'&layer=mapnik&marker='+encodeURIComponent(lat+','+lon);label=lat.toFixed(4)+', '+lon.toFixed(4);}
    return {kind:'map',url:url.href,key:'map:'+url.href,title:label,embed:embed,provider:osm?'OpenStreetMap':'Google Maps'};
  }
  function cwRichLinks(text) {
    var links=[],seen=new Set(),prose=String(text||'').replace(/\x60{3}[\s\S]*?(?:\x60{3}|$)|~{3}[\s\S]*?(?:~{3}|$)|\x60[^\x60\n]+\x60/g,'');
    var labels={};prose.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,function(_all,label,url){labels[url]=label;return _all;});
    (prose.match(/https?:\/\/[^\s<>"\x60]+/g)||[]).forEach(function(raw){
      var destination=raw.replace(/[.,;!?\])}]+$/g,''),video=cwVideoEmbed(destination),item;
      if(video){var yt=video.indexOf('youtube-nocookie.com')>=0;item={kind:'video',url:destination,key:video,embed:video,title:labels[destination]||(yt?'Video on YouTube':'Video on Vimeo'),provider:yt?'YouTube':'Vimeo',thumbnail:yt?'https://i.ytimg.com/vi/'+video.split('/').pop()+'/hqdefault.jpg':''};}
      else item=cwMapLink(destination);
      if(!item||seen.has(item.key))return;seen.add(item.key);if(labels[destination])item.title=labels[destination];links.push(item);
    });return links;
  }
  function cwRichCardHtml(item,index) {
    var cw=cwEnsure(),seen=cw.richMediaSeen||(cw.richMediaSeen=new Set()),fresh=!seen.has(item.key);seen.add(item.key);
    var map=item.kind==='map',preview;
    if(map)preview='<span class="cw-map-pin">'+cwIcon('map')+'<span>'+(item.embed?'View interactive map':'Open location')+'</span></span>';
    else preview=(item.thumbnail?'<img src="'+esc(item.thumbnail)+'" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">':'')+'<span class="cw-rich-play">'+cwIcon('play')+'</span>';
    var control=item.embed?'<button type="button" data-cwrichload="'+esc(item.embed)+'" data-rich-kind="'+item.kind+'" aria-label="'+esc((map?'View map: ':'Play video: ')+item.title)+'">'+preview+'</button>':'<a class="cw-rich-map-link" href="'+esc(item.url)+'" target="_blank" rel="noopener noreferrer">'+preview+'</a>';
    return '<article class="cw-rich-card'+(fresh?' is-new':'')+'" data-rich-key="'+esc(item.key)+'" style="--media-delay:'+Math.min((index||0)*40,200)+'ms"><div class="cw-embed"><div class="cw-rich-visual'+(map?' cw-map-cover':'')+'">'+control+'</div></div><div class="cw-rich-copy"><div><strong>'+esc(item.title)+'</strong><small>'+esc(item.provider)+'</small></div><a href="'+esc(item.url)+'" target="_blank" rel="noopener noreferrer" aria-label="Open '+esc(item.title)+' on '+esc(item.provider)+'">Open '+cwIcon('external')+'</a></div></article>';
  }
  function cwChatMediaHtml(text,role,messageId) {
    var links=cwRichLinks(text),signature=JSON.stringify(links.map(function(link){return [link.key,link.title,link.url];}));
    return links.length?'<div class="cw-rich-grid cw-chat-media-grid'+(role==='user'?' me':'')+'" data-cwmediagroup="'+esc(messageId||'')+'" data-media-signature="'+esc(signature)+'" aria-label="Videos and maps">'+links.map(cwRichCardHtml).join('')+'</div>':'';
  }
  function cwBindRichCards(root) {
    root.querySelectorAll('[data-cwrichload]').forEach(function(button){button.onclick=function(){
      var source=button.getAttribute('data-cwrichload'),url;try{url=new URL(source);}catch(e){return;}
      if(url.protocol!=='https:'||url.username||url.password||!((url.hostname==='www.youtube-nocookie.com'&&/^\/embed\/[A-Za-z0-9_-]{6,20}$/.test(url.pathname))||(url.hostname==='player.vimeo.com'&&/^\/video\/\d{6,12}$/.test(url.pathname))||(url.hostname==='www.openstreetmap.org'&&url.pathname==='/export/embed.html')))return;
      var frame=document.createElement('iframe');frame.src=source+(button.getAttribute('data-rich-kind')==='video'?'?autoplay=1&playsinline=1':'');frame.title=button.getAttribute('aria-label');frame.loading='lazy';frame.referrerPolicy='strict-origin-when-cross-origin';frame.allowFullscreen=true;frame.setAttribute('allow','autoplay; fullscreen; picture-in-picture');frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-presentation allow-popups');
      var visual=button.closest('.cw-rich-visual');visual.replaceChildren(frame);
    };});
  }

  // Markdown block layout the bubble can actually render: heading lines become
  // real headings, and decorative rule lines (----, ****, ====, ____) vanish.
  // Left alone they are printed as raw symbols, which reads as a broken reply.
  // Fenced code is copied verbatim, so a '#' comment inside a snippet never
  // becomes a heading. Display only: stored messages, files and artifacts keep
  // their exact text.
  function cwProseLayout(text) {
    var fenced = false, kept = [];
    String(text || '').split('\n').forEach(function (line) {
      if (/^ {0,3}(?:\x60{3,}|~{3,})/.test(line)) { fenced = !fenced; kept.push(line); return; }
      if (fenced) { kept.push(line); return; }
      var heading = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*$/.exec(line);
      if (heading) { kept.push('\x00H' + heading[1].length + '\x00' + heading[2]); return; }
      // A bare hash banner ("####") carries no text at all; drop it like a rule.
      if (/^ {0,3}#+[ \t]*$/.test(line)) return;
      if (/^ {0,3}([-=*_~\u2010-\u2015\u2022\u00b7\u2500-\u257f])[ \t]*(?:\1[ \t]*){2,}$/.test(line)) return;
      kept.push(line);
    });
    return kept.join('\n').replace(/\n{3,}/g, '\n\n');
  }

  function cwBody(text, members, includeRich) {
    // Pull pipe tables out of the raw text before escaping; anything left
    // behind is still escaped and line-broken below.
    var tables = [];
    // Structured skill output (a \x60\x60\x60output chart fence) is rendered by the
    // shared viewers in ui-outputs.js, so one skill produces the same chart,
    // table or preview on both surfaces. Each block is rendered on its own and
    // replaced by a placeholder, because everything below assumes plain text
    // that still has to be escaped. COWORK_JS is also evaluated standalone by
    // the tests, where the shared helper is absent, so the guard keeps the
    // fence as ordinary code in that case.
    var outs = [];
    var laid = cwProseLayout(text).replace(/(^|\n)\x60{3,}[ \t]*output[ \t]+(\S+)[^\n]*\n([\s\S]*?)\n\x60{3,}/g, function (all, lead, kind, payload) {
      if (typeof outRenderBlocks !== 'function') return all;
      var fence = '\x60\x60\x60output ' + kind + '\n' + payload + '\n\x60\x60\x60';
      var html = outRenderBlocks(fence);
      if (!html || html === fence) return all;
      outs.push(html);
      return lead + '\x00OUT' + (outs.length - 1) + '\x00';
    });
    var stripped = laid.replace(/(^|\n)(\|[^\n]*\|\n\|[\s:|-]*\|(?:\n\|[^\n]*\|)+)/g, function (all, lead, block) {
      var html = cwTableHtml(block.replace(/^\n/, ''));
      if (!html) return all;
      tables.push(html);
      return lead + '\x00TABLE' + (tables.length - 1) + '\x00';
    });
    // One grid of trusted previews; loading a player/map is a deliberate click.
    var richLinks = cwRichLinks(text);
    var richAnchors=[];
    function richAnchor(destination) {
      var canonical;try{canonical=new URL(destination).href;}catch(e){return '';}
      var item=richLinks.find(function(link){return new URL(link.url).href===canonical;});if(!item)return '';
      richAnchors.push('<a href="'+esc(item.url)+'" target="_blank" rel="noopener noreferrer">'+esc(item.title)+'</a>');return '\x00RICH'+(richAnchors.length-1)+'\x00';
    }
    var linked=stripped.split(/(\x60{3}[\s\S]*?(?:\x60{3}|$)|\x60[^\x60\n]+\x60)/g).map(function(part,index){if(index%2)return part;return part.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,function(all,_label,url){return richAnchor(url)||all;}).replace(/https?:\/\/[^\s<>"\x60]+/g,function(raw){var destination=raw.replace(/[.,;!?\])}]+$/g,'');var anchor=richAnchor(destination);return anchor?anchor+raw.slice(destination.length):raw;});}).join('');
    var out = esc(linked);
    out = out.replace(/\x60\x60\x60([\s\S]*?)\x60\x60\x60/g, function (all, code) { return '</span>' + cwCodeHtml(code) + '<span>'; });
    out = out.replace(/\x60([^\x60\n]+)\x60/g, function (all, code) { return '<code>' + code + '</code>'; });
    // Emphasis the bubble can render. Bold-italic runs are handled first so a
    // '***…***' reply never leaves a stray asterisk behind. Italic markers must
    // be tight and word-bounded, so snake_case and "2 * 3 * 4" stay literal.
    out = out.replace(/\*\*\*([^*\n]+)\*\*\*/g, '<b><i>$1</i></b>');
    out = out.replace(/___([^_\n]+)___/g, '<b><i>$1</i></b>');
    out = out.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    out = out.replace(/(^|[^*\w])\*(\S(?:[^*\n]*[^*\s])?)\*(?!\*)/g, '$1<i>$2</i>');
    out = out.replace(/(^|[^_\w])_(\S(?:[^_\n]*[^_\s])?)_(?![\w_])/g, '$1<i>$2</i>');
    out = out.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    (members || []).forEach(function (m) {
      var safe = String(m.name).replace(new RegExp('[^A-Za-z0-9_.\\-]', 'g'), '');
      if (!safe) return;
      out = out.replace(new RegExp('@(' + safe + ')', 'gi'), '<span class="cw-mention">@$1</span>');
    });
    // Heading placeholders now carry the line's already-formatted inner HTML.
    out = out.replace(/\x00H([1-6])\x00([^\n]*)/g, function (all, level, label) {
      return '</span><div class="cw-h cw-h' + level + '">' + label + '</div><span>';
    });
    out = out.replace(/\x00OUT(\d+)\x00/g, function (all, i) { return '</span>' + outs[Number(i)] + '<span>'; });
    out = out.replace(/\x00TABLE(\d+)\x00/g, function (all, i) { return '</span>' + tables[Number(i)] + '<span>'; });
    out = out.replace(/\x00RICH(\d+)\x00/g, function (all,i) { return richAnchors[Number(i)]; });
    out = out.replace(/\n/g, '<br>');
    // Removed rules leave blank lines behind; a bubble never starts or ends on one.
    out = out.replace(/^(?:[ \t]*<br>)+/, '').replace(/(?:<br>[ \t]*)+$/, '');
    return '<span>' + out + '</span>' + (includeRich!==false&&richLinks.length ? '<div class="cw-rich-grid" aria-label="Videos and maps">' + richLinks.map(cwRichCardHtml).join('') + '</div>' : '');
  }

  function cwToolActivityTitle(tool) {
    var titles = { read_file: 'Read file', list_files: 'Listed files', search_files: 'Searched files', write_file: 'Wrote file', apply_edit: 'Edited file', run_command: 'Ran workspace command', ssh_exec: 'Ran server command', browse: 'Browser action', web_fetch: 'Fetched web page', mcp_call: 'Connected service action', create_document: 'Created document', share_file: 'Shared file', message_teammate: 'Contacted teammate', request_permission: 'Requested permission', ask_user: 'Asked a question', gitu_task: 'Engineering task', spawn_sub_agent: 'Delegated work' };
    return titles[tool] || String(tool || 'Action').replace(/_/g, ' ');
  }

  function cwWorkHistoryHtml(steps) {
    var cw = cwEnsure(), first = steps[0];
    var key = String(cw.active || '') + ':' + String(cw.threadId || 'main') + ':' + first.id;
    var previousUpdate = '';
    var rows = steps.slice().reverse().map(function (step) {
      var update = cwVisibleReply(step.publicUpdate || '');
      var narration = update && update !== previousUpdate ? '<p class="cw-work-update">' + esc(update) + '</p>' : '';
      previousUpdate = update;
      return '<li><div class="cw-work-step"><span class="result' + (step.ok ? '' : ' failed') + '">' + (step.ok ? '✓ Completed' : '! Failed') + '</span><span class="action">' + esc(cwToolActivityTitle(step.tool)) + '</span><span>' + esc(step.agentName || '') + '</span><time datetime="' + esc(step.ts) + '">' + esc(cwTime(step.ts)) + '</time></div>' + narration + '</li>';
    }).join('');
    return '<details class="cw-work-history" data-cwworkhistory="' + esc(key) + '"><summary>Work details · ' + steps.length + ' action' + (steps.length === 1 ? '' : 's') + '</summary><ol aria-label="Work details, newest first">' + rows + '</ol></details>';
  }

  function cwCheckpointReportHtml(message) {
    var checkpoint = message.checkpoint;
    return '<section class="cw-checkpoint-report" aria-label="Progress update"><header><strong>Progress update</strong><span>' + esc(message.agentName || (cwAgentById(message.agentId) || {}).name || '') + '</span><time datetime="' + esc(message.ts) + '">' + esc(cwTime(message.ts)) + '</time></header><p>' + esc(checkpoint.accomplished) + '</p>' + (checkpoint.issues ? '<p class="cw-checkpoint-issues"><strong>Needs attention:</strong> ' + esc(checkpoint.issues) + '</p>' : '') + '<p class="cw-checkpoint-next"><strong>Next:</strong> ' + esc(checkpoint.next) + '</p></section>';
  }

  function cwSubagentGroups() {
    var cw = cwEnsure(), groups = Object.create(null);
    function visit(nodes) {
      (nodes || []).forEach(function (node) {
        if ((node.threadId || null) === (cw.threadId || null)) {
          var parent = node.rootAgentId || node.parentAgentId;
          var time = Date.parse(node.createdAt) || 0, anchor = null;
          (cw.msgs || []).forEach(function (message) {
            var at = Date.parse(message.ts) || 0;
            if (at <= time && (message.role === 'user' || message.agentId === parent) && (!anchor || at >= Date.parse(anchor.ts))) anchor = message;
          });
          var key = JSON.stringify([cw.active, cw.threadId || null, parent, node.missionId || '', anchor && anchor.id || 'start']);
          if (!groups[key]) groups[key] = { key: key, parent: parent, time: anchor ? (Date.parse(anchor.ts) || 0) + .1 : time, nodes: [] };
          groups[key].nodes.push(node);
        }
        visit(node.children);
      });
    }
    visit(cw.subAgents && cw.subAgents.nodes);
    return Object.keys(groups).map(function (key) { return groups[key]; });
  }

  function cwSubagentLayoutKey() {
    return JSON.stringify(cwSubagentGroups().map(function (group) { return [group.key, group.nodes.map(function (node) { return node.id; })]; }));
  }

  function cwDisposeSubagentOrbs() {
    var cw = S.cw;
    if (!cw) return;
    Object.keys(cw.subagentPresences || {}).forEach(function (key) { cw.subagentPresences[key].view.dispose(); });
    cw.subagentPresences = Object.create(null);
  }

  function cwSubagentPhase(node) {
    // Completion is the host's evidence-gated lifecycle, never a tool result.
    var terminal = { completed: 'complete', failed: 'failed', blocked: 'blocked', terminated: 'cancelled', orphaned: 'failed', starting: 'waiting' };
    return Object.prototype.hasOwnProperty.call(terminal, node.status) ? terminal[node.status] : node.activity && node.activity.phase || 'working';
  }

  function cwSyncSubagentOrbs() {
    var cw = cwEnsure(), wrap = $('cwMsgs');
    if (!wrap || typeof createSubagentOrbs !== 'function') return;
    var views = cw.subagentPresences || (cw.subagentPresences = Object.create(null));
    var hosts = new Map();
    Array.from(wrap.children).forEach(function (host) { var key = host.getAttribute('data-cwsubagents'); if (key) hosts.set(key, host); });
    var retained = new Set();
    cwSubagentGroups().forEach(function (group) {
      var host = hosts.get(group.key);
      if (!host) return;
      retained.add(group.key);
      var presence = views[group.key];
      if (presence && presence.host !== host) { presence.view.dispose(); presence = null; }
      if (!presence) {
        presence = views[group.key] = { host: host, view: createSubagentOrbs(host) };
        var parent = cwAgentById(group.parent);
        host.querySelector('.subagent-caption span').textContent = (parent ? parent.name + ' · ' : '') + 'Subagents';
      }
      group.nodes.forEach(function (node) {
        var job = presence.view.jobs[node.id], phase = cwSubagentPhase(node);
        var restored = job ? job.button.dataset.restored === 'true' : phase === 'complete' || phase === 'failed';
        var terminalText = { complete: 'Report verified and returned to the parent.', failed: 'Worker failed; review the parent report.', cancelled: 'Worker stopped.', blocked: 'Worker needs attention.' };
        var data = { id: node.id, name: node.role, task: node.objective, phase: phase,
          current: terminalText[phase] || node.activity && node.activity.current || (phase === 'waiting' ? 'Waiting to start…' : 'Working on the assignment…'),
          startedAt: node.startedAt || node.createdAt, finishedAt: node.finishedAt,
          contextTokens: node.activity && node.activity.contextTokens };
        job = presence.view.upsert(data, restored);
        (node.activity && node.activity.entries || []).forEach(function (entry) {
          if (entry.seq <= (job.cwActivitySeq || 0)) return;
          presence.view.upsert({ id: node.id, name: node.role, activity: entry.text, at: entry.at }, restored);
          job.cwActivitySeq = entry.seq;
        });
        if (terminalText[phase] && job.cwTerminalPhase !== phase) {
          presence.view.upsert({ id: node.id, name: node.role, activity: terminalText[phase], at: node.finishedAt }, restored);
          job.cwTerminalPhase = phase;
        }
      });
    });
    Object.keys(views).forEach(function (key) { if (!retained.has(key)) { views[key].view.dispose(); delete views[key]; } });
  }

  function cwTranscriptHtml() {
    var cw = cwEnsure();
    var entries = cw.msgs.map(function (message) { return { time: Date.parse(message.ts) || 0, message: message }; });
    (cw.requests || []).forEach(function (request) {
      entries.push({ time: Date.parse(request.createdAt) || 0, html: cwRequestHtml(request) });
    });
    (cw.workHistory || []).forEach(function (activity) {
      entries.push({ time: Date.parse(activity.ts) || 0, activity: activity });
    });
    cwSubagentGroups().forEach(function (group) {
      entries.push({ time: group.time, html: '<section data-cwsubagents="' + esc(group.key) + '" aria-label="Subagent activity"></section>' });
    });
    entries.sort(function (a, b) { return a.time - b.time; });
    var html = [];
    for (var i = 0; i < entries.length;) {
      var entry = entries[i];
      if (entry.activity) {
        var steps = [];
        while (i < entries.length && entries[i].activity) { steps.push(entries[i].activity); i++; }
        var report = entries[i] && entries[i].message;
        if (report && report.role === 'system' && report.checkpoint) {
          html.push(cwCheckpointReportHtml(report));
          i++;
        }
        html.push(cwWorkHistoryHtml(steps));
        continue;
      }
      if (entry.message && entry.message.role === 'system' && entry.message.checkpoint) {
        html.push(cwCheckpointReportHtml(entry.message));
        i++;
        continue;
      }
      var checkpoint = entry.message && /^(.+?) is continuing automatically after checkpoint (\d+)\.$/.exec(String(entry.message.text || ''));
      if (!checkpoint || entry.message.role !== 'system') {
        html.push(entry.message ? cwBubbleHtml(entry.message).replace(/^<([a-z]+)(?=[ >])/, '<$1 data-cwscroll-key="' + esc(entry.message.id || 'seq:' + entry.message.seq) + '"') : entry.html);
        i++;
        continue;
      }
      var group = [];
      var agentName = checkpoint[1];
      var first = entry.message;
      while (i < entries.length) {
        var next = entries[i].message;
        var match = next && next.role === 'system' && /^(.+?) is continuing automatically after checkpoint (\d+)\.$/.exec(String(next.text || ''));
        if (!match || match[1] !== agentName) break;
        group.push({ number: match[2], time: next.ts });
        i++;
      }
      var key = String(cw.active || '') + ':' + String(first.id || first.ts || entry.time);
      html.push('<details class="cw-checkpoints" data-cwcheckpoint="' + esc(key) + '"><summary><span class="cw-checkpoint-check" aria-hidden="true">✓</span><span class="cw-checkpoint-count">' + group.length + ' checkpoint' + (group.length === 1 ? '' : 's') + ' completed</span><span class="cw-checkpoint-action">View history</span></summary><ol>' + group.map(function (item) { return '<li>Checkpoint ' + esc(item.number) + '<time>' + esc(cwTime(item.time)) + '</time></li>'; }).join('') + '</ol></details>');
    }
    return html.join('');
  }

  function cwRenderMsgs() {
    var wrap = $('cwMsgs');
    if (!wrap) return;
    var cw = cwEnsure();
    var scroll = cwCaptureScroll(wrap);
    // Incoming messages and request updates must preserve an in-progress answer.
    var drafts = {}, focused = null;
    // Keep the live form node across polls. Recreating it would erase a typed
    // password and hide a validation error while the user is still working.
    var credentialForms = {};
    var expandedCheckpoints = {};
    var workHistoryState = {};
    wrap.querySelectorAll('details[data-cwworkhistory]').forEach(function (details) {
      workHistoryState[details.getAttribute('data-cwworkhistory')] = { open: details.open, scroll: details.querySelector('ol').scrollTop };
    });
    wrap.querySelectorAll('details[data-cwcheckpoint]').forEach(function (details) {
      if (details.open) expandedCheckpoints[details.getAttribute('data-cwcheckpoint')] = true;
    });
    wrap.querySelectorAll('[data-cwcredential], [data-cwsshcredential]').forEach(function (form) {
      var id = form.getAttribute('data-cwcredential') || form.getAttribute('data-cwsshcredential');
      if (id) credentialForms[id] = form;
    });
    wrap.querySelectorAll('[data-cwanswer]').forEach(function (input) {
      var id = input.getAttribute('data-cwanswer');
      drafts[id] = input.value;
      if (input === document.activeElement) focused = { id: id, start: input.selectionStart, end: input.selectionEnd };
    });
    cwReplaceTranscript(wrap, cwTranscriptHtml() + '<div id="cwLive" hidden></div>');
    wrap.querySelectorAll('details[data-cwworkhistory]').forEach(function (details) {
      var saved = workHistoryState[details.getAttribute('data-cwworkhistory')];
      if (saved) { details.open = saved.open; details.querySelector('ol').scrollTop = saved.scroll; }
    });
    wrap.querySelectorAll('details[data-cwcheckpoint]').forEach(function (details) {
      details.open = !!expandedCheckpoints[details.getAttribute('data-cwcheckpoint')];
    });
    wrap.querySelectorAll('[data-cwcredential], [data-cwsshcredential]').forEach(function (form) {
      var id = form.getAttribute('data-cwcredential') || form.getAttribute('data-cwsshcredential');
      if (credentialForms[id]) form.replaceWith(credentialForms[id]);
    });
    wrap.querySelectorAll('[data-cwanswer]').forEach(function (input) {
      var id = input.getAttribute('data-cwanswer');
      if (drafts[id] !== undefined) input.value = drafts[id];
      if (focused && focused.id === id) { input.focus({ preventScroll: true }); input.setSelectionRange(focused.start, focused.end); }
    });
    cwBindFileCards(wrap);
    cwBindRequests(wrap);
    wrap.querySelectorAll('.cw-message-more').forEach(function (b) { b.onclick = function () {
      var menu = document.getElementById(b.getAttribute('popovertarget'));
      // Native popovers provide outside-click/Escape dismissal and stay above
      // the scrolling transcript. Position beside the trigger within the viewport.
      var rect = b.getBoundingClientRect();
      menu.style.left = Math.max(12, Math.min(rect.right - 178, window.innerWidth - 190)) + 'px';
      menu.style.top = 'auto';
      menu.style.bottom = 'auto';
      if (rect.bottom + 220 > window.innerHeight) menu.style.bottom = Math.max(12, window.innerHeight - rect.top + 4) + 'px';
      else menu.style.top = (rect.bottom + 4) + 'px';
    }; });
    wrap.querySelectorAll('[data-cwaction]').forEach(function (b) { b.onclick = function () {
      var menu = b.closest('.cw-message-menu');
      if (menu) menu.hidePopover();
      cwMessageAction(b.getAttribute('data-cwaction'), b.getAttribute('data-cwmessage'));
    }; });
    wrap.onscroll = function () {
      wrap.querySelectorAll('.cw-message-menu:popover-open').forEach(function (menu) { menu.hidePopover(); });
      cwUpdateJumpLatest();
    };
    if (focused) scroll.follow = false;
    cwRenderProgress(scroll);
  }

  function cwReplaceTranscript(wrap,html) {
    var holder=document.createElement('div');holder.innerHTML=html;
    var media=new Map(),workers=new Map(),next=Array.from(holder.children);
    Array.from(wrap.children).forEach(function(node){var id=node.getAttribute('data-cwmediagroup');if(id)media.set(id,node);var key=node.getAttribute('data-cwsubagents');if(key)workers.set(key,node);});
    var keep=new Set();
    next=next.map(function(node){var key=node.getAttribute('data-cwsubagents'),worker=key&&workers.get(key);if(worker){keep.add(worker);return worker;}var id=node.getAttribute('data-cwmediagroup'),old=id&&media.get(id);if(old&&old.getAttribute('data-media-signature')===node.getAttribute('data-media-signature')){keep.add(old);return old;}return node;});
    // Leave live players connected. Inserting surrounding messages does not
    // reload their iframe or reset playback when an agent posts an update.
    Array.from(wrap.children).forEach(function(node){if(!keep.has(node))node.remove();});
    next.forEach(function(node,index){if(wrap.children[index]===node)return;var before=wrap.children[index]||null;if(node.parentElement===wrap&&typeof wrap.moveBefore==='function')wrap.moveBefore(node,before);else wrap.insertBefore(node,before);});
  }

  function cwActivityLabel(progress) {
    // Tools stay neutral on purpose: commands, file paths and tool names never
    // leak into the live row — the icon carries the "what", the label the phase.
    if (progress && progress.tool) return typeof progress.toolOk === 'boolean' ? (progress.toolOk ? 'Completed' : 'Failed') : 'Working…';
    var phase = progress && progress.phase;
    if (phase === 'reasoning') return 'Reasoning…';
    if (phase === 'responding') return 'Responding…';
    if (phase === 'working') return 'Working…';
    if (phase === 'thinking') return 'Thinking…';
    return progress && cwVisibleReply(progress.text) ? 'Working…' : 'Thinking…';
  }

  function cwToolProgressText(progress) {
    // Never include tool params here: they can contain private paths,
    // commands, or credentials. The public category is enough context.
    var tool = progress && progress.tool;
    if (tool === 'browse' || tool === 'web_fetch') return 'Checking the web for the requested information…';
    if (tool === 'read_file' || tool === 'list_files' || tool === 'search_files') return 'Checking the relevant files…';
    if (tool === 'write_file' || tool === 'apply_edit') return 'Updating the requested files…';
    if (tool === 'ssh_exec') return 'Checking the connected server…';
    if (tool === 'run_command' || tool === 'computer_process') return 'Running a check in the workspace…';
    if (tool === 'mcp_call') return 'Checking the connected service…';
    if (tool === 'search_history') return 'Checking earlier conversation context…';
    return tool ? 'Working on the next step…' : '';
  }

  /** thinking / reasoning / responding / working — drives the dot and waves. */
  function cwProgressPhase(progress) {
    if (progress && progress.tool) return 'working';
    var phase = progress && progress.phase;
    return phase === 'reasoning' || phase === 'responding' || phase === 'working' ? phase : 'thinking';
  }

  function cwRenderProgress(scroll) {
    var cw = cwEnsure();
    var wrap = $('cwMsgs');
    var live = $('cwLive');
    if (!wrap || !live) return;
    scroll = scroll || cwCaptureScroll(wrap);
    cwSyncSubagentOrbs();
    var ps = cw.busy ? ((cw.progresses && cw.progresses.length) ? cw.progresses : (cw.progress ? [cw.progress] : [])) : [];
    var workerIds = new Set();
    cwSubagentGroups().forEach(function (group) { group.nodes.forEach(function (node) { workerIds.add(node.id); }); });
    ps = ps.filter(function (progress) { return !workerIds.has(progress.agentId); });
    live.hidden = ps.length === 0;
    if (!ps.length) { live.innerHTML = ''; live._progressKey = null; cwRestoreScroll(wrap, scroll); return; }
    // Keep the avatar nodes alive across deltas so their animation never restarts.
    var key = JSON.stringify(ps.map(function (p) { var a = cwAgentById(p.agentId); return [p.agentId, p.agentName, a && a.avatar]; }));
    if (live._progressKey !== key) {
      live.innerHTML = ps.map(function (p) {
        return '<div class="cw-row cw-live-row">' + cwAva(cwAgentById(p.agentId)) + '<div class="cw-bubble cw-live-bubble"><span class="cw-live-kicker">Current activity</span><div class="cw-meta"><span class="nm">' + esc(p.agentName) + '</span><span class="cw-progress-activity activity-indicator"><span class="cw-phase-dot"></span>${ACTIVITY_MARK_HTML}<span class="cw-tool-ico"></span><span class="wtext"></span></span></div><div class="reasoning-stream" aria-label="Model reasoning" hidden></div><div class="cw-progress-text" style="white-space:pre-wrap"></div></div></div>';
      }).join('');
      live._progressKey = key;
    }
    var texts = live.querySelectorAll('.cw-progress-text');
    var labels = live.querySelectorAll('.cw-progress-activity .wtext');
    var indicators = live.querySelectorAll('.cw-progress-activity');
    var icons = live.querySelectorAll('.cw-progress-activity .cw-tool-ico');
    var bubbles = live.querySelectorAll('.cw-live-bubble');
    var reasoningStreams = live.querySelectorAll('.reasoning-stream');
    ps.forEach(function (p, i) {
      // Phase drives the animated dot: thinking, reasoning, responding, working.
      var indicator = indicators[i];
      var phase = cwProgressPhase(p);
      renderReasoningStream(reasoningStreams && reasoningStreams[i], p.reasoning);
      if (indicator && indicator._phase !== phase) {
        indicator._phase = phase;
        indicator.className = String(indicator.className || '').replace(/\s*phase-\w+/g, '') + ' phase-' + phase;
      }
      // Tool activity wears the tool's own mark (favicon, terminal, file, MCP brand).
      var icon = icons[i];
      var iconHtml = cwToolIconHtml(p);
      if (icon && icon._ico !== iconHtml) { icon.innerHTML = iconHtml; icon._ico = iconHtml; }
      if (bubbles[i]) bubbles[i].classList.toggle('has-tool', !!p.tool);
      var label = cwActivityLabel(p);
      if (labels[i].textContent !== label) labels[i].textContent = label;
      var streamed = cwVisibleReply(p.text);
      if (/^Continuing automatically \(checkpoint \d+\)/.test(streamed)) streamed = '';
      var currentTodo = (cw.todos || []).filter(function (todo) { return todo.agentId === p.agentId && todo.status === 'in_progress'; })[0];
      var text = p.tool ? cwToolProgressText(p) + (streamed ? '\n' + streamed : '') : (streamed || (currentTodo && currentTodo.text) || (p.reasoning ? '' : 'Working on the next step…'));
      if (texts[i].textContent !== text) texts[i].textContent = text;
      texts[i].hidden = !text;
    });
    cwRestoreScroll(wrap, scroll);
  }

  // Telegram + Discord gateways for an agent's DM, shown inside the
  // Edit-teammate modal. Saving writes to that agent's DM conversation.
  function cwAgentGatewayHtml(conv) {
    var tg = (conv && conv.telegram) || { enabled: false };
    var dc = (conv && conv.discord) || { enabled: false };
    var hint = 'Message your bot in a private Telegram chat (or add it to a group), send anything there, then press "Find chats". ' + esc(conv.title) + ' replies are mirrored back automatically.';
    return {
      html:
        '<label style="margin-top:16px">Messaging gateways — mirror this teammate\'s DM</label>' +
        '<div class="cw-card" style="border:1px solid var(--border);border-radius:10px;padding:10px;margin-bottom:10px">' +
          '<div class="cw-check"><input type="checkbox" id="cwTgOn"' + (tg.enabled ? ' checked' : '') + '> <span>Telegram</span></div>' +
          '<label>Bot token (from @BotFather)</label><input type="password" id="cwTgToken" value="" placeholder="' + (tg.tokenSaved ? 'Saved in this local app — leave blank to keep' : '123456:ABC-DEF...') + '">' +
          '<label>Telegram user or group chat ID</label>' +
          '<input type="text" id="cwTgChatId" value="' + esc(tg.chatId || '') + '" placeholder="Private: 123456789 · Group: -1001234567890">' +
          '<label>Or choose a recent chat</label>' +
          '<div style="display:flex;gap:6px"><select id="cwTgChat"><option value="' + esc(tg.chatId || '') + '">' + esc(tg.chatTitle || tg.chatId || '— pick a chat —') + '</option></select>' +
          '<button class="btn ghost" id="cwTgFind" style="flex:none">Find chats</button></div>' +
          '<div style="font-size:11px;color:var(--faint);margin-top:6px">' + hint + '</div>' +
          '<div class="cw-actions"><button class="btn dark" id="cwTgSave">Save Telegram</button></div>' +
        '</div>' +
        '<div class="cw-card" style="border:1px solid var(--border);border-radius:10px;padding:10px">' +
          '<div class="cw-check"><input type="checkbox" id="cwDcOn"' + (dc.enabled ? ' checked' : '') + '> <span>Discord</span></div>' +
          '<label>Bot token (from the Discord developer portal)</label><input type="password" id="cwDcToken" value="" placeholder="' + (dc.tokenSaved ? 'Saved in this local app — leave blank to keep' : 'MTIzNDU2Nzg...') + '">' +
          '<label>Or pick a server the bot is in</label>' +
          '<div style="display:flex;gap:6px"><select id="cwDcGuild"><option value="">— pick a server —</option></select>' +
          '<button class="btn ghost" id="cwDcFindGuilds" style="flex:none">Find servers</button></div>' +
          '<label>Text channel</label>' +
          '<div style="display:flex;gap:6px"><select id="cwDcChan"><option value="' + esc(dc.channelId || '') + '">' + esc(dc.channelName || dc.channelId || '— pick a channel —') + '</option></select>' +
          '<button class="btn ghost" id="cwDcFindChans" style="flex:none">Find channels</button></div>' +
          '<label>Or paste a channel ID</label><input type="text" id="cwDcChanId" value="' + esc(dc.channelId || '') + '" placeholder="123456789012345678">' +
          '<div style="font-size:11px;color:var(--faint);margin-top:6px">The bot needs the Message Content intent enabled in the developer portal. Agent replies and request cards are mirrored to the channel; reply approve / deny / accept / dismiss there to answer a card.</div>' +
          '<div class="cw-actions"><button class="btn dark" id="cwDcSave">Save Discord</button></div>' +
        '</div>',
      bind: function () {
        var cw = cwEnsure();
        $('cwTgFind').onclick = function () {
          var token = $('cwTgToken').value.trim();
          if (!token && !tg.tokenSaved) { toast('Paste the bot token first', true); return; }
          api('/api/cowork/telegram/chats', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: token, conversationId: conv.id }) })
            .then(function (d) {
              var sel = $('cwTgChat');
              sel.innerHTML = (d.chats || []).map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.title) + ' (' + esc(c.id) + ')</option>'; }).join('') || '<option value="">No chats found — message the bot first</option>';
              if (sel.value) $('cwTgChatId').value = sel.value;
            })
            .catch(function (e) { toast(e.message, true); });
        };
        $('cwTgChat').onchange = function () { if ($('cwTgChat').value) $('cwTgChatId').value = $('cwTgChat').value; };
        $('cwTgSave').onclick = function () {
          var sel = $('cwTgChat');
          var chatId = $('cwTgChatId').value.trim();
          var selectedTitle = sel && sel.value === chatId && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : chatId;
          var body = { telegram: { enabled: $('cwTgOn').checked, token: $('cwTgToken').value.trim(), chatId: chatId, chatTitle: selectedTitle } };
          api('/api/cowork/conversations/' + encodeURIComponent(conv.id), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
            .then(function (d) { cw.convs = cw.convs.map(function (c) { return c.id === d.conversation.id ? d.conversation : c; }); cwRenderChat(); cwRenderRail(); toast(d.conversation.telegram && d.conversation.telegram.enabled ? 'Telegram gateway connected' : 'Telegram gateway disabled'); })
            .catch(function (e) { toast(e.message, true); });
        };
        // Discord pairing: token stays local (sent once, then saved server-side).
        // Each node is optional in the DOM fixture; a missing node means the
        // card isn't rendered and the binding is skipped.
        var discordBody = function () {
          return { token: $('cwDcToken')?.value.trim() || undefined, guildId: $('cwDcGuild')?.value || undefined };
        };
        var cwDcFindGuilds = $('cwDcFindGuilds');
        if (cwDcFindGuilds) cwDcFindGuilds.onclick = function () {
          api('/api/cowork/discord/channels', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(discordBody()) })
            .then(function (d) {
              var sel = $('cwDcGuild');
              if (!sel) return;
              sel.innerHTML = '<option value="">— pick a server —</option>' + (d.guilds || []).map(function (g) { return '<option value="' + esc(g.id) + '">' + esc(g.name) + '</option>'; }).join('');
              if (!(d.guilds || []).length) toast('No servers found — is the token valid and the bot invited somewhere?', true);
            })
            .catch(function (e) { toast(e.message, true); });
        };
        var cwDcFindChans = $('cwDcFindChans');
        if (cwDcFindChans) cwDcFindChans.onclick = function () {
          var guildId = $('cwDcGuild')?.value;
          if (!guildId) { toast('Pick a server first', true); return; }
          api('/api/cowork/discord/channels', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(discordBody()) })
            .then(function (d) {
              var sel = $('cwDcChan');
              if (sel) sel.innerHTML = '<option value="">— pick a channel —</option>' + (d.channels || []).map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('');
            })
            .catch(function (e) { toast(e.message, true); });
        };
        var cwDcSave = $('cwDcSave');
        if (cwDcSave) cwDcSave.onclick = function () {
          var channelId = $('cwDcChan')?.value || $('cwDcChanId')?.value.trim() || '';
          var body = { discord: { enabled: $('cwDcOn')?.checked === true, token: $('cwDcToken')?.value.trim() || undefined, channelId: channelId } };
          api('/api/cowork/conversations/' + encodeURIComponent(conv.id), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
            .then(function (d) {
              cw.convs = cw.convs.map(function (c) { return c.id === d.conversation.id ? d.conversation : c; });
              cwRenderChat(); cwRenderRail(); cwLearnLoad();
              toast(d.conversation.discord && d.conversation.discord.enabled ? 'Discord gateway connected' : 'Discord gateway disabled');
            })
            .catch(function (e) { toast(e.message, true); });
        };
      }
    };
  }

  // Schedule editor as a modal, opened from the composer "+" menu. It edits the
  // same per-conversation schedule the side panel used to host inline.
  function cwScheduleModal(conv) {
    var sched = conv.schedule || { every: '', goal: '', enabled: false };
    var modal = document.createElement('div');
    modal.className = 'modal cw-modal';
    modal.innerHTML =
      '<div class="box"><div class="bar"><span style="font-weight:600;font-size:13px">Schedule this chat</span><span style="flex:1"></span><button class="btn ghost" id="cwScCancel">Cancel</button></div>' +
      '<div class="cw-body">' +
        '<label>Run every (e.g. 30m, 1h)</label><input type="text" id="cwScEvery" value="' + esc(sched.every || '') + '" placeholder="1h">' +
        '<label>Prompt to inject on schedule</label><textarea id="cwScGoal" rows="3" placeholder="Check the build and post a status update.">' + esc(sched.goal || '') + '</textarea>' +
        '<div class="cw-check"><input type="checkbox" id="cwScOn"' + (sched.enabled ? ' checked' : '') + '> <span>Enabled</span></div>' +
        (sched.lastRunAt ? '<div style="font-size:11px;color:var(--faint);margin-top:6px">Last run: ' + esc(shortDate(sched.lastRunAt)) + '</div>' : '') +
      '</div>' +
      '<div class="cw-foot"><span style="flex:1"></span><button class="btn dark" id="cwScSave">Save schedule</button></div></div>';
    document.body.appendChild(modal);
    modal.querySelector('#cwScCancel').onclick = function () { modal.remove(); };
    modal.querySelector('#cwScSave').onclick = function () {
      var body = { schedule: { every: $('cwScEvery').value, goal: $('cwScGoal').value, enabled: $('cwScOn').checked } };
      api('/api/cowork/conversations/' + encodeURIComponent(conv.id), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (d) {
          var cw = cwEnsure();
          cw.convs = cw.convs.map(function (c) { return c.id === d.conversation.id ? d.conversation : c; });
          modal.remove(); cwRenderChat(); cwRenderRail();
          toast(d.conversation.schedule && d.conversation.schedule.enabled ? 'Schedule saved' : 'Schedule disabled');
        })
        .catch(function (e) { toast(e.message, true); });
    };
    setTimeout(function () { var el = modal.querySelector('#cwScEvery'); if (el) el.focus(); }, 0);
  }


  function cwWidgetIcon(w) {
    var byKind = { stats: 'bolt', list: 'check', progress: 'target', links: 'globe', text: 'file' };
    return cwIcon(w && w.icon ? w.icon : byKind[(w && w.kind) || 'text'] || 'bolt');
  }

  function cwWidgetSummary(w) {
    var d = (w && w.data) || {};
    if (w.kind === 'stats') { var first = (d.items || [])[0]; return first ? first.label + ': ' + first.value + ((d.items || []).length > 1 ? ' +' + ((d.items || []).length - 1) : '') : 'no stats yet'; }
    if (w.kind === 'list') { var items = d.items || []; var done = items.filter(function (i) { return i.done; }).length; return items.length ? done + '/' + items.length + ' done' : 'empty list'; }
    if (w.kind === 'progress') return (Math.max(0, Math.min(100, Number(d.value) || 0))) + '%' + (d.label ? ' · ' + d.label : '');
    if (w.kind === 'links') { var links = d.items || []; return links.length + ' link' + (links.length === 1 ? '' : 's'); }
    var text = String(d.text || '');
    return text.length > 60 ? text.slice(0, 60) + '…' : (text || 'empty');
  }

  function cwWidgetBodyHtml(w) {
    var d = (w && w.data) || {};
    if (w.kind === 'stats') return '<div class="cw-widget-body">' + ((d.items || []).map(function (item) { return '<div class="cw-widget-row"><span class="l">' + esc(item.label) + '</span><span class="v">' + esc(item.value) + '</span></div>'; }).join('') || '<div class="meta">No stats yet.</div>') + '</div>';
    if (w.kind === 'list') return '<div class="cw-widget-body">' + ((d.items || []).map(function (item) { return '<div class="cw-widget-row' + (item.done ? ' done' : '') + '"><span class="l">' + esc(item.text) + '</span><span class="v">' + (item.done ? '✓' : '') + '</span></div>'; }).join('') || '<div class="meta">Empty list.</div>') + '</div>';
    if (w.kind === 'progress') { var value = Math.max(0, Math.min(100, Number(d.value) || 0)); return '<div class="cw-widget-body"><div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted)"><span>' + esc(d.label || 'Progress') + '</span><span>' + value + '%</span></div><div class="cw-widget-bar"><i style="width:' + value + '%"></i></div></div>'; }
    if (w.kind === 'links') return '<div class="cw-widget-body">' + ((d.items || []).map(function (item) { return '<div class="cw-widget-row"><a class="l" href="' + esc(item.url) + '" target="_blank" rel="noopener noreferrer">' + esc(item.label) + '</a></div>'; }).join('') || '<div class="meta">No links yet.</div>') + '</div>';
    return '<div class="cw-widget-text">' + esc(d.text || '') + '</div>';
  }

  function cwWidgetModal(id) {
    var cw = cwEnsure();
    var widget = null;
    (cw.widgets || []).forEach(function (w) { if (w.id === id) widget = w; });
    if (!widget) { toast('Widget not found', true); return; }
    var modal = document.createElement('div');
    modal.className = 'modal cw-modal';
    modal.innerHTML =
      '<div class="box"><div class="bar"><span style="font-weight:600;font-size:13px">' + esc(widget.title) + '</span><span style="flex:1"></span><button class="btn ghost" id="cwWgClose">Close</button></div>' +
      '<div class="cw-body">' + cwWidgetBodyHtml(widget) +
        '<div class="cw-note">Updated ' + esc(shortDate(widget.updatedAt || widget.createdAt)) + (widget.createdByAgentId ? ' by ' + esc((cwAgentById(widget.createdByAgentId) || {}).name || 'a teammate') : '') + '. Teammates refresh this with widget_manage.</div>' +
      '</div>' +
      '<div class="cw-foot"><button class="btn red" id="cwWgDel">Delete widget</button><span style="flex:1"></span><button class="btn ghost" id="cwWgDone">Done</button></div></div>';
    document.body.appendChild(modal);
    modal.querySelector('#cwWgClose').onclick = function () { modal.remove(); };
    modal.querySelector('#cwWgDone').onclick = function () { modal.remove(); };
    modal.querySelector('#cwWgDel').onclick = function () {
      if (!confirm('Delete widget "' + widget.title + '"?')) return;
      api('/api/cowork/widgets/' + encodeURIComponent(widget.id), { method: 'DELETE' })
        .then(function () { modal.remove(); cw.widgets = (cw.widgets || []).filter(function (w) { return w.id !== widget.id; }); cwRenderRail(); toast('Widget deleted'); })
        .catch(function (e) { toast(e.message, true); });
    };
  }

  function cwParseWidgetText(kind, text) {
    var lines = String(text || '').split('\n');
    if (kind === 'stats') return { items: lines.map(function (line) { var parts = line.split(/[:|]/); return { label: (parts[0] || '').trim(), value: (parts.slice(1).join(':') || '').trim() }; }).filter(function (item) { return item.label; }) };
    if (kind === 'list') return { items: lines.map(function (line) { var done = /^\s*(?:\[x\]|x\s+|✓\s*)/i.test(line); return { text: line.replace(/^\s*(?:\[x\]|x\s+|✓\s*)/i, '').trim(), done: done }; }).filter(function (item) { return item.text; }) };
    if (kind === 'progress') { var parts = String(text || '').split('|'); var value = parseInt(parts[parts.length - 1], 10); if (!isFinite(value)) value = parseInt(parts[0], 10); return { label: parts.length > 1 ? parts[0].trim() : 'Progress', value: isFinite(value) ? value : 0 }; }
    if (kind === 'links') return { items: lines.map(function (line) { var parts = line.split('|'); return parts.length > 1 ? { label: parts[0].trim(), url: parts.slice(1).join('|').trim() } : { label: line.trim(), url: line.trim() }; }).filter(function (item) { return item.label && /^https?:\/\//i.test(item.url); }) };
    return { text: String(text || '') };
  }

  function cwNewWidgetModal(conv) {
    var cw = cwEnsure();
    var modal = document.createElement('div');
    modal.className = 'modal cw-modal';
    modal.innerHTML =
      '<div class="box"><div class="bar"><span style="font-weight:600;font-size:13px">New widget</span><span style="flex:1"></span><button class="btn ghost" id="cwWnCancel">Cancel</button></div>' +
      '<div class="cw-body">' +
        '<div class="cw-2col"><div><label>Title</label><input type="text" id="cwWnTitle" maxlength="120" placeholder="Launch status"></div>' +
        '<div><label>Kind</label><select id="cwWnKind"><option value="text">Text</option><option value="stats">Stats — Label: value</option><option value="list">Checklist — x item = done</option><option value="progress">Progress — Label | percent</option><option value="links">Links — Label | https://...</option></select></div></div>' +
        '<label>Content</label><textarea id="cwWnBody" rows="5" placeholder="What should this card show?"></textarea>' +
        '<div class="cw-note">Widgets live in the cowork sidebar and refresh live when teammates call widget_manage.</div>' +
      '</div>' +
      '<div class="cw-foot"><span style="flex:1"></span><button class="btn dark" id="cwWnSave">Create widget</button></div></div>';
    document.body.appendChild(modal);
    modal.querySelector('#cwWnCancel').onclick = function () { modal.remove(); };
    modal.querySelector('#cwWnSave').onclick = function () {
      var title = $('cwWnTitle').value.trim();
      if (!title) { toast('Give the widget a title', true); return; }
      var kind = $('cwWnKind').value;
      api('/api/cowork/conversations/' + encodeURIComponent(conv.id) + '/widgets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: title, kind: kind, data: cwParseWidgetText(kind, $('cwWnBody').value) }) })
        .then(function (d) { modal.remove(); cw.widgets = (cw.widgets || []).filter(function (w) { return w.id !== d.widget.id; }).concat([d.widget]); cwRenderRail(); toast('Widget added to the sidebar'); })
        .catch(function (e) { toast(e.message, true); });
    };
  }

  function cwFolderModal(conv) {
    var modal = document.createElement('div');
    modal.className = 'modal cw-modal';
    modal.innerHTML =
      '<div class="box"><div class="bar"><span style="font-weight:600;font-size:13px">Tag a folder</span><span style="flex:1"></span><button class="btn ghost" id="cwFdCancel">Cancel</button></div>' +
      '<div class="cw-body"><div class="meta" id="cwFdPath">Loading…</div><div id="cwFdList" style="max-height:300px;overflow:auto;border:1px solid var(--border);border-radius:8px;margin:6px 0"></div>' +
      '<label>Label (optional)</label><input type="text" id="cwFdLabel" maxlength="80" placeholder="site"></div>' +
      '<div class="cw-foot"><span style="flex:1"></span><button class="btn dark" id="cwFdSave">Tag this folder</button></div></div>';
    document.body.appendChild(modal);
    var current = '';
    function load(p) {
      api('/api/browse?path=' + encodeURIComponent(p || '')).then(function (d) {
        current = d.atRoot ? '' : d.path;
        $('cwFdPath').textContent = d.atRoot ? 'This computer — pick a drive' : d.path;
        var html = '';
        if (!d.atRoot && d.path) html += '<div class="frow" data-up="1"><span class="ico">' + cwIcon('folder') + '</span>..</div>';
        html += (d.dirs || []).map(function (n) { var leaf = String(n).split(/[\\/]/).filter(Boolean).pop() || n; return '<div class="frow" data-dir="' + esc(n) + '" title="' + esc(n) + '"><span class="ico">' + cwIcon('folder') + '</span>' + esc(leaf) + '</div>'; }).join('');
        var box = $('cwFdList');
        box.innerHTML = html || '<div class="meta" style="padding:8px">No subfolders</div>';
        var up = box.querySelector('[data-up]');
        if (up) up.onclick = function () { load(current.replace(/[\\/][^\\/]*$/, '')); };
        box.querySelectorAll('[data-dir]').forEach(function (row) { row.onclick = function () { load(row.getAttribute('data-dir')); }; });
      }).catch(function (e) { toast(e.message, true); });
    }
    load('');
    modal.querySelector('#cwFdCancel').onclick = function () { modal.remove(); };
    modal.querySelector('#cwFdSave').onclick = function () {
      if (!current) { toast('Pick a folder first', true); return; }
      api('/api/cowork/conversations/' + encodeURIComponent(conv.id) + '/folders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: current, label: $('cwFdLabel').value.trim() }) })
        .then(function (d) {
          modal.remove();
          if (cwEnsure().active === conv.id) {
            cwEnsure().folders = (cwEnsure().folders || []).filter(function (folder) { return folder.id !== d.folder.id; }).concat([d.folder]);
            cwRenderFolders();
            cwRenderInfo();
          }
          toast('Folder tagged: ' + d.folder.label);
        })
        .catch(function (e) { toast(e.message, true); });
    };
  }

  /** One line describing what a worker is doing right now, as plainly as possible. */
  function cwTreeStatusLabel(node) {
    if (node.status === 'running') return 'working…';
    if (node.status === 'starting') return 'starting…';
    if (node.status === 'blocked') return 'blocked' + (node.statusReason ? ': ' + String(node.statusReason).slice(0, 60) : '');
    if (node.status === 'failed') return 'failed' + (node.statusReason ? ': ' + String(node.statusReason).slice(0, 60) : '');
    if (node.status === 'completed') return 'done ✓';
    return node.status;
  }

  /**
   * The live execution tree: who each teammate spawned, what every worker
   * costs against its grant, and whether the evidence gate accepted it.
   * Rendered under its mission card (or as ad-hoc workers when unscoped).
   */
  function cwSubAgentTreeHtml(conv, missionId) {
    var cw = cwEnsure();
    var tree = cw.subAgents;
    if (!tree || !tree.nodes || !tree.nodes.length) return '';
    var roots = tree.nodes.filter(function (node) { return (node.missionId || null) === (missionId || null); });
    if (!roots.length) return '';
    function subtreeSpend(node) {
      return (node.children || []).reduce(function (sum, child) { return sum + subtreeSpend(child); }, node.spend ? node.spend.costUsd : 0);
    }
    function nodeHtml(node) {
      var granted = node.grantedBudget && node.grantedBudget.maxCostUsd;
      var pct = granted ? Math.min(100, Math.round(((node.spend ? node.spend.costUsd : 0) / granted) * 100)) : null;
      var evidence = node.evidence
        ? '<span class="cw-tevidence ' + (node.evidence.accepted ? 'ok' : 'bad') + '" title="Evidence gate: ' + node.evidence.passed + ' of ' + node.evidence.total + ' record(s) passed">' + (node.evidence.accepted ? 'verified ' : 'rejected ') + node.evidence.passed + '/' + node.evidence.total + '</span>'
        : '';
      return '<div class="cw-tnode ' + esc(node.status) + '" title="' + esc(node.objective) + '">' +
        '<div class="cw-trow">' +
          '<span class="cw-tdot"></span>' +
          '<span class="cw-tname">' + esc(node.role) + '</span>' +
          '<span class="cw-tstatus">' + esc(cwTreeStatusLabel(node)) + '</span>' +
          evidence +
          (pct !== null ? '<span class="cw-tbar" title="' + pct + '% of the grant spent"><i style="width:' + pct + '%"></i></span>' : '') +
          '<span class="cw-tspend">$' + Number(node.spend ? node.spend.costUsd : 0).toFixed(2) + (granted ? ' / $' + Number(granted).toFixed(2) : '') + '</span>' +
        '</div>' +
        ((node.children && node.children.length) ? '<div class="cw-tchildren">' + node.children.map(nodeHtml).join('') + '</div>' : '') +
      '</div>';
    }
    var byParent = {};
    roots.forEach(function (node) { (byParent[node.parentAgentId] = byParent[node.parentAgentId] || []).push(node); });
    return Object.keys(byParent).map(function (parentId) {
      var parent = cwAgentById(parentId);
      var subs = byParent[parentId];
      var spent = subs.reduce(function (sum, node) { return sum + subtreeSpend(node); }, 0);
      return '<div class="cw-troot"><span class="cw-tdot"></span>' + esc(parent ? '@' + parent.name : 'worker') + ' spawned ' + subs.length + ' worker' + (subs.length === 1 ? '' : 's') + ' · $' + spent.toFixed(2) + '</div>' + subs.map(nodeHtml).join('');
    }).join('');
  }

  function cwMissionsHtml(conv) {
    var cw = cwEnsure();
    var missions = (cw.missions || []).filter(function (m) { return m.conversationId === conv.id; });
    var rows = missions.map(function (m) {
      var statusChip = m.status === 'running' ? '<span class="chip ok">running</span>'
        : m.status === 'blocked' ? '<span class="chip" style="color:var(--evidence)">blocked</span>'
        : m.status === 'done' ? '<span class="chip ok">done</span>'
        : m.status === 'failed' ? '<span class="chip bad">failed</span>'
        : '<span class="chip">cancelled</span>';
      var agent = cwAgentById(m.agentId);
      var tree = cwSubAgentTreeHtml(conv, m.id);
      return '<div class="cw-mission" data-mission="' + esc(m.id) + '">' +
        '<div class="t">' + esc(m.goal) + '</div>' +
        '<div class="d">' + statusChip + ' <span class="tg">' + (agent ? '@' + esc(agent.name) : '') + ' · session ' + m.turns + '/' + m.maxTurns + '</span>' +
        (m.budgetSpentUsd === undefined ? '' : ' <span class="tg">· $' + Number(m.budgetSpentUsd).toFixed(2) + (m.budget ? ' of $' + Number(m.budget.maxCostUsd).toFixed(2) : '') + ' spent</span>') +
        '</div>' +
        (m.progress ? '<div class="p">' + esc(m.progress.slice(0, 220)) + '</div>' : '') +
        (m.result ? '<div class="p ok">' + esc(m.result.slice(0, 300)) + '</div>' : '') +
        (m.blockers ? '<div class="p warn">' + esc(m.blockers.slice(0, 220)) + '</div>' : '') +
        (tree ? '<div class="cw-tree"><div class="cw-tree-title">' + cwIcon('target') + 'Worker tree</div>' + tree + '</div>' : '') +
        (m.status === 'running' || m.status === 'blocked' ? '<button class="btn ghost" data-cancelmission="' + esc(m.id) + '">Cancel mission</button>' : '') +
        (m.status === 'failed' && m.stoppedForBudget ? '<button class="btn ghost" data-raisemission="' + esc(m.id) + '">Add $5 and resume</button>' : '') +
        '</div>';
    }).join('');
    // Workers spawned outside any mission still render — as their own card.
    var adhoc = cwSubAgentTreeHtml(conv, null);
    return '<h4>MISSIONS</h4>' +
      (rows ? rows : '<div class="cw-empty-note">No missions yet. Give a teammate a goal and it works autonomously in sessions until done, blocked, or out of budget.</div>') +
      (adhoc ? '<div class="cw-mission"><div class="cw-tree" style="border-top:0;margin-top:0;padding-top:0"><div class="cw-tree-title">' + cwIcon('target') + 'Workers</div>' + adhoc + '</div></div>' : '') +
      '<button class="btn ghost" id="cwNewMission" style="width:100%;margin-bottom:12px">New mission</button>';
  }

  function cwBindMissions(el, conv) {
    var btn = el.querySelector('#cwNewMission');
    if (btn) btn.onclick = function () { cwMissionModal(conv); };
    el.querySelectorAll('[data-cancelmission]').forEach(function (b) {
      b.onclick = function () {
        if (!confirm('Cancel this mission? Its progress is kept in the transcript.')) return;
        api('/api/cowork/missions/' + encodeURIComponent(b.getAttribute('data-cancelmission')), { method: 'DELETE' }).catch(function (e) { toast(e.message, true); });
      };
    });
    el.querySelectorAll('[data-raisemission]').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-raisemission');
        var mission = null;
        (cwEnsure().missions || []).forEach(function (m) { if (m.id === id) mission = m; });
        // The API takes a total, not an increment, so +$5 on whatever it was
        // granted — or on what it already spent when it had no ceiling.
        var from = Number(mission && mission.budget ? mission.budget.maxCostUsd : 0) || Number(mission && mission.budgetSpentUsd) || 0;
        api('/api/cowork/missions/' + encodeURIComponent(id) + '/budget', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ budgetUsd: Math.round((from + 5) * 100) / 100 }),
        })
          .then(function () { toast('Budget raised — the mission is resuming'); })
          .catch(function (e) { toast(e.message, true); });
      };
    });
  }

  function cwMissionModal(conv) {
    var members = cwConvMembers(conv);
    var modal = document.createElement('div');
    modal.className = 'modal cw-modal';
    modal.innerHTML =
      '<div class="box"><div class="bar"><span style="font-weight:600;font-size:13px">New autonomous mission</span><span style="flex:1"></span><button class="btn ghost" id="cwMmCancel">Cancel</button></div>' +
      '<div class="cw-body">' +
        (conv.kind === 'group'
          ? '<div class="cw-2col"><div><label>Assigned teammate</label><select id="cwMmAgent">' + members.map(function (m) { return '<option value="' + esc(m.id) + '">@' + esc(m.name) + '</option>'; }).join('') + '</select></div>' +
            '<div><label>Session budget</label><input type="text" id="cwMmTurns" value="12"></div></div>'
          : '<div class="cw-2col"><div><label>Assigned teammate</label><input type="text" value="' + esc(members[0] ? members[0].name : '') + '" disabled></div>' +
            '<div><label>Session budget</label><input type="text" id="cwMmTurns" value="12"></div></div>') +
        '<label>Mission goal — what done looks like</label><textarea id="cwMmGoal" rows="3" placeholder="Build a landing page in my workspace for the coffee brand. Verify it renders."></textarea>' +
        '<label>Acceptance criteria — one per line</label><textarea id="cwMmCriteria" rows="4" placeholder="index.html exists and opens&#10;All links work&#10;A screenshot was reviewed"></textarea>' +
        '<label>Spend budget in USD — optional</label><input type="text" id="cwMmCost" placeholder="5 — blank shares this chat\'s delegation budget">' +
        '<div class="cw-note">The teammate works in autonomous sessions (in its virtual computer, or on your machine per its permissions), posts progress here after each session, and stops when done, blocked (reply in this chat to unblock it), or out of budget. The spend budget covers its own model calls and any engineering it delegates; it is enforced, not advisory.</div>' +
      '</div>' +
      '<div class="cw-foot"><span style="flex:1"></span><button class="btn dark" id="cwMmSave">Start mission</button></div></div>';
    document.body.appendChild(modal);
    modal.querySelector('#cwMmCancel').onclick = function () { modal.remove(); };
    modal.querySelector('#cwMmSave').onclick = function () {
      var criteria = $('cwMmCriteria').value.split('\n').map(function (c) { return c.trim(); }).filter(Boolean);
      var body = { goal: $('cwMmGoal').value, criteria: criteria, maxTurns: Number($('cwMmTurns').value) || 12 };
      var spend = Number(String($('cwMmCost').value || '').replace(/[^0-9.]/g, ''));
      if (spend > 0) body.budgetUsd = spend;
      if (conv.kind === 'group') body.agentId = $('cwMmAgent').value;
      api('/api/cowork/conversations/' + encodeURIComponent(conv.id) + '/missions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (d) {
          modal.remove();
          cwEnsure().missions = (cwEnsure().missions || []).filter(function (mission) { return mission.id !== d.mission.id; }).concat([d.mission]);
          toast('Mission started — progress will appear in this chat');
          cwRenderInfo();
          cwRenderChat();
        })
        .catch(function (e) { toast(e.message, true); });
    };
    setTimeout(function () { var g = modal.querySelector('#cwMmGoal'); if (g) g.focus(); }, 0);
  }

  function cwProfileHeading(iconName, title) {
    return '<h4 class="cw-profile-heading">' + cwIcon(iconName) + '<span>' + esc(title) + '</span></h4>';
  }
  function cwProfileDescription(text) {
    var paragraphs = String(text || '').split(/\n\s*\n/).map(function (p) { return p.replace(/^\s*#{1,6}\s+.*$/gm, '').trim(); });
    var description = (paragraphs.find(function (p) { return p; }) || '').replace(/\*\*|\x60/g, '').replace(/^>\s*/gm, '').replace(/\s+/g, ' ').trim();
    if (description.length <= 200) return description;
    var end = description.lastIndexOf(' ', 200);
    return description.slice(0, end > 120 ? end : 200) + '…';
  }
  function cwProfileInstructionsHtml(text) {
    // Instructions are profile content, not executable markup or embeds.
    return esc(text || '').replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>').split('\n').map(function (line) {
      var heading = /^\s*#{1,6}\s+(.+)$/.exec(line);
      return heading ? '<h5>' + heading[1] + '</h5>' : line;
    }).join('\n');
  }
  function cwRenderInfo() {
    var cw = cwEnsure();
    var conv = cwActiveConv();
    var el = $('cwInfo');
    if (!el) return;
    var profilePanel=$('cwInfoPanel'),profileScroll=profilePanel?profilePanel.scrollTop:0,focusedTool=document.activeElement&&typeof document.activeElement.getAttribute==='function'?document.activeElement.getAttribute('data-profile-tool'):null;
    if (!conv) { el.innerHTML = ''; return; }
    var members = cwConvMembers(conv);
    if (conv.kind === 'dm') {
      cwApplyCharacterTheme();
      var a = members[0];
      if (!a) { el.innerHTML = ''; return; }
      el.innerHTML =
        '<div class="cw-profile">' +
          '<div class="cw-profile-hero"><div class="cw-profile-portrait">' + cwAva(a, 112) + '</div><div class="cw-profile-identity">' +
            '<h2 class="cw-profile-name">' + esc(a.name) + '</h2>' +
            (a.tagline ? '<div class="cw-profile-tagline">' + esc(a.tagline) + '</div>' : '') +
            (a.chiefOfStaff ? '<span class="chip" title="Chief of staff">' + cwIcon('crown') + ' Chief of staff</span>' : '') +
            '<div class="cw-profile-presence">' + cwCharacterStatusHtml(a, false) + '</div></div></div>' +
          '<button class="btn ghost cw-profile-edit" id="cwEditAgent">' + cwIcon('edit') + '<span>Edit profile</span><span class="cw-profile-chevron">' + cwIcon('chevron') + '</span></button>' +
          cwProfileAppsHtml(a) +
          cwComputerHtml(a, true) +
          '<section class="cw-profile-section">' + cwProfileHeading('sliders', 'Configuration') + '<dl class="cw-profile-details">' +
            '<dt>' + cwIcon('cpu') + 'Model</dt><dd>' + esc(a.model || 'Default model') + (a.provider ? '<span class="cw-profile-provider">' + esc(a.provider) + '</span>' : '') + '</dd>' +
            (a.effort ? '<dt>' + cwIcon('bolt') + 'Reasoning</dt><dd>' + esc(a.effort) + '</dd>' : '') + '</dl>' +
            ((a.allowShell || a.allowWrites || a.allowConfig) ? '<div class="cw-profile-tags" aria-label="Permissions">' +
              (a.allowShell ? '<span class="chip">' + cwIcon('terminal') + 'Shell</span>' : '') +
              (a.allowWrites ? '<span class="chip">' + cwIcon('file') + 'File writes</span>' : '') +
              (a.allowConfig ? '<span class="chip">' + cwIcon('plug') + 'Tool setup</span>' : '') + '</div>' : '') + '</section>' +
          '<section class="cw-profile-section">' + cwProfileHeading('bolt', 'Skills') +
            (a.skills && a.skills.length ? '<div class="cw-profile-skills">' + a.skills.map(function (skill) { return '<span class="cw-profile-skill">' + esc(skill) + '</span>'; }).join('') + '</div>' : '<div class="cw-profile-empty">No skills assigned</div>') + '</section>' +
          '<section class="cw-profile-section">' + cwProfileHeading('memory', 'Memory') + '<div class="cw-profile-memory"><strong>' + ((cw.memoryCounts || {})[a.id] || 0) + '</strong><span>facts saved</span><button class="btn ghost" id="cwMemClear" title="Clear saved memory">' + cwIcon('trash') + 'Clear</button></div></section>' +
          '<section class="cw-profile-section">' + cwProfileHeading('user', 'About') + '<p class="cw-profile-description">' + esc(cwProfileDescription(a.systemPrompt)) + '</p><details class="cw-profile-instructions"><summary><span>Personality &amp; instructions</span>' + cwIcon('chevron') + '</summary><div class="cw-profile-copy">' + cwProfileInstructionsHtml(a.systemPrompt) + '</div></details></section>' +
          '<div class="cw-profile-footer"><button class="btn ghost" id="cwDelAgent">' + cwIcon('trash') + 'Delete teammate</button></div></div>';
      cwBindComputers(el);
      cwBindProfileTools(a);
      if(profilePanel)profilePanel.scrollTop=profileScroll;
      if(focusedTool){var previousTool=Array.from(el.querySelectorAll('[data-profile-tool]')).find(function(button){return button.getAttribute('data-profile-tool')===focusedTool;});if(previousTool)previousTool.focus({preventScroll:true});}
      $('cwMemClear').onclick = function () {
        if (!confirm('Erase everything ' + a.name + ' has remembered across conversations?')) return;
        api('/api/cowork/agents/' + encodeURIComponent(a.id) + '/memory', { method: 'DELETE' }).then(function () {
          cw.memoryCounts[a.id] = 0;
          cwRenderInfo();
          toast('Memory cleared');
        }).catch(function (e) { toast(e.message, true); });
      };
      $('cwEditAgent').onclick = function () { cwAgentModal(a); };
      $('cwAgentApps').onclick = function () { cwOpenConnections(a.id); };
      $('cwDelAgent').onclick = function () {
        if (!confirm('Delete ' + a.name + '? Their DM and profile are removed.')) return;
        api('/api/cowork/agents/' + encodeURIComponent(a.id), { method: 'DELETE' }).then(function () {
          cw.active = null; cw.msgs = []; cwLoad(true);
        }).catch(function (e) { toast(e.message, true); });
      };
      return;
    }
    // Group panel
    el.innerHTML =
      '<h4>MEMBERS</h4>' +
      '<div class="cw-card">' + members.map(function (m) {
        return '<div class="cw-mrow">' + cwAva(m, 40) + '<span class="nm">@' + esc(m.name) + ' <span class="tg">' + esc(m.tagline || '') + '</span></span>' +
          '<button class="crown' + (conv.chiefId === m.id ? ' on' : '') + '" data-chief="' + esc(m.id) + '" title="Make chief of staff">' + cwIcon('crown') + '</button>' +
          '<button data-remove="' + esc(m.id) + '" title="Remove from group">' + cwIcon('close') + '</button></div>';
      }).join('') +
      '<button class="btn ghost" id="cwAddMember" style="width:100%;margin-top:6px">Add member</button></div>' +
      members.map(function (member) { return cwComputerHtml(member, false); }).join('') +
      '<div class="cw-actions"><button class="btn red" id="cwDelConv">Delete chat</button></div>';
    el.querySelectorAll('[data-chief]').forEach(function (b) {
      b.onclick = function () {
        api('/api/cowork/conversations/' + encodeURIComponent(conv.id), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chiefId: b.getAttribute('data-chief') }) })
          .then(function (d) { cw.convs = cw.convs.map(function (c) { return c.id === d.conversation.id ? d.conversation : c; }); cwRenderChat(); cwRenderRail(); toast((cwAgentById(d.conversation.chiefId) || {}).name + ' is now chief of staff'); })
          .catch(function (e) { toast(e.message, true); });
      };
    });
    el.querySelectorAll('[data-remove]').forEach(function (b) {
      b.onclick = function () {
        var next = conv.memberIds.filter(function (id) { return id !== b.getAttribute('data-remove'); });
        api('/api/cowork/conversations/' + encodeURIComponent(conv.id), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ memberIds: next }) })
          .then(function (d) { cw.convs = cw.convs.map(function (c) { return c.id === d.conversation.id ? d.conversation : c; }); cwRenderChat(); cwRenderRail(); })
          .catch(function (e) { toast(e.message, true); });
      };
    });
    $('cwAddMember').onclick = function () {
      cwAddMemberModal(conv);
    };
    cwBindComputers(el);
    $('cwDelConv').onclick = function () {
      if (!confirm('Delete this chat and its whole transcript?')) return;
      api('/api/cowork/conversations/' + encodeURIComponent(conv.id), { method: 'DELETE' }).then(function () {
        cw.active = null; cw.msgs = []; cwStopPoll(); cwLoad(true);
      }).catch(function (e) { toast(e.message, true); });
    };
  }

  // Machine-readable failure reasons from the desktop service, each with the
  // operator action that clears it. Mirrors classifyUnavailable() in
  // src/cowork/computer.ts — keep both in sync when adding a code.
  var CW_COMPUTER_REASONS = {
    operation_not_supported: 'The desktop broker rejected this operation. Redeploy the broker so it runs the same build as this app.',
    runtime_not_installed: 'No container runtime is available. Install Docker on the server and restart the Gitu service.',
    browser_missing: 'The desktop image ships no Chromium. Rebuild the desktop image with a browser included.',
    display_start_failed: 'The display server (Xvfb/X11/VNC) did not start. Check the desktop image and its published ports.',
    timeout: 'The desktop did not answer in time. Retry, then check the broker logs.',
    unknown: 'The desktop service reported an unrecognised failure. Check the broker logs for the full error.'
  };

  function cwComputerReasonHtml(computer) {
    if (!computer || !computer.reason) return '';
    var code = String(computer.reason);
    var hint = CW_COMPUTER_REASONS[code] || 'The desktop service reported an unrecognised failure. Check the broker logs.';
    return '<p class="cw-computer-reason"><span class="cw-reason-code">' + esc(code) + '</span> ' + esc(hint) + '</p>';
  }

  function cwComputerHtml(agent, profile) {
    var heading = cwProfileHeading('monitor', profile ? 'Computer' : agent.name + ' · Computer');
    if(profile) {
      var current=(cwEnsure().computers||[]).find(function(item){return item.agentId===agent.id;})||{state:'stopped'},host=agent.useHostComputer;
      var state=host?'Available':current.state,technical=current.error||current.reason;
      return '<section class="cw-card cw-computer-section"><div class="cw-profile-computer-head">'+heading+'<span class="chip'+(state==='running'||host?' ok':'')+'">'+esc(state)+'</span></div><div class="cw-computer-summary"><span class="chip">'+(host?'My computer':agent.cloudConnectionId?'Cloud computer':'Private computer')+'</span></div><p>'+(host?'Uses the workspace, files and apps on this computer.':'Your private desktop, browser and files stay saved when stopped.')+'</p><div class="cw-computer-buttons"><button class="btn dark" data-computer="'+esc(agent.id)+'" data-action="desktop">'+cwIcon('monitor')+'Open desktop</button>'+(!host?'<div class="cw-computer-secondary"><button class="btn ghost" data-computer="'+esc(agent.id)+'" data-action="start"'+(state==='starting'||state==='running'?' disabled':'')+'>'+cwIcon('play')+(state==='sleeping'?'Wake':'Start')+'</button><button class="btn ghost" data-computer="'+esc(agent.id)+'" data-action="stop"'+(['running','starting','sleeping'].indexOf(state)<0?' disabled':'')+'>'+cwIcon('stop')+'Stop</button></div>':'')+'</div>'+(technical?'<details class="cw-computer-technical"><summary>View technical details</summary>'+(current.error?'<p>'+esc(current.error)+'</p>':'')+cwComputerReasonHtml(current)+'</details>':'')+'</section>';
    }
    if (agent.useHostComputer) {
      return '<section class="cw-card cw-computer-section">' + heading + '<div class="cw-computer-summary"><span class="chip">My computer</span></div>' +
        '<p>Works with the workspace, files and apps on this computer.</p>' +
        '<div class="cw-computer-buttons"><button class="btn dark" data-computer="' + esc(agent.id) + '" data-action="desktop">' + cwIcon('monitor') + 'Open desktop</button></div></section>';
    }
    var computer = (cwEnsure().computers || []).filter(function (c) { return c.agentId === agent.id; })[0] || { state: 'stopped' };
    return '<section class="cw-card cw-computer-section">' + heading + '<div class="cw-computer-summary"><span class="chip">' + (agent.cloudConnectionId ? 'Cloud computer' : 'Private computer') + '</span><span class="chip cw-computer-state' + (computer.state === 'running' ? ' ok' : '') + '">' + esc(computer.state) + '</span></div>' +
      '<p>Shared desktop with a browser, files and terminal. Files and browser sessions stay saved when stopped.</p>' +
      (computer.error ? '<p style="font-size:11.5px;color:var(--err)">' + esc(computer.error) + '</p>' : '') +
      cwComputerReasonHtml(computer) +
      '<div class="cw-computer-buttons"><button class="btn dark" data-computer="' + esc(agent.id) + '" data-action="desktop">' + cwIcon('monitor') + 'Open desktop</button>' +
      '<div class="cw-computer-secondary"><button class="btn ghost" data-computer="' + esc(agent.id) + '" data-action="start">' + cwIcon('play') + 'Start</button>' +
      '<button class="btn ghost" data-computer="' + esc(agent.id) + '" data-action="stop">' + cwIcon('stop') + 'Stop</button></div></div>' +
      '<div data-screen="' + esc(agent.id) + '"></div></section>';
  }

  function cwAddMemberModal(conv) {
    var cw = cwEnsure();
    var outside = cw.agents.filter(function (agent) { return conv.memberIds.indexOf(agent.id) < 0; });
    if (!outside.length) { toast('Every teammate is already in this chat'); return; }
    var modal = document.createElement('div');
    modal.className = 'modal cw-modal';
    modal.innerHTML = '<div class="box"><div class="bar"><span>Add members to ' + esc(conv.title) + '</span><span style="flex:1"></span><button class="btn ghost" data-cancel>Cancel</button></div>' +
      '<div class="cw-body"><label>Available teammates</label><div class="cw-skills">' + outside.map(function (agent) { return '<button type="button" data-member="' + esc(agent.id) + '">' + esc(agent.name) + (agent.tagline ? ' · ' + esc(agent.tagline) : '') + '</button>'; }).join('') + '</div></div>' +
      '<div class="cw-foot"><span style="flex:1"></span><button class="btn dark" data-save disabled>Add selected</button></div></div>';
    document.body.appendChild(modal);
    var chosen = [];
    modal.querySelector('[data-cancel]').onclick = function () { modal.remove(); };
    modal.querySelectorAll('[data-member]').forEach(function (button) {
      button.onclick = function () {
        var id = button.getAttribute('data-member');
        var index = chosen.indexOf(id);
        if (index >= 0) { chosen.splice(index, 1); button.classList.remove('on'); } else { chosen.push(id); button.classList.add('on'); }
        modal.querySelector('[data-save]').disabled = !chosen.length;
      };
    });
    modal.querySelector('[data-save]').onclick = function () {
      var save = modal.querySelector('[data-save]');
      save.disabled = true;
      api('/api/cowork/conversations/' + encodeURIComponent(conv.id), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ memberIds: conv.memberIds.concat(chosen) }) })
        .then(function (d) { modal.remove(); cw.convs = cw.convs.map(function (item) { return item.id === d.conversation.id ? d.conversation : item; }); cwRenderChat(); cwRenderRail(); })
        .catch(function (e) { toast(e.message, true); save.disabled = false; });
    };
  }

  function cwBindComputers(el) {
    el.querySelectorAll('[data-computer]').forEach(function (button) {
      button.onclick = function () {
        var id = button.getAttribute('data-computer');
        var action = button.getAttribute('data-action');
        if (action === 'desktop') { cwOpenDesktop(id); return; }
        button.disabled = true;
        api('/api/cowork/agents/' + encodeURIComponent(id) + '/computer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: action }) })
          .then(function (d) {
            var cw = cwEnsure();
            cw.computers = (cw.computers || []).filter(function (c) { return c.agentId !== id; }).concat([d.computer]);
            if (d.pngBase64) {
              var target = el.querySelector('[data-screen="' + id + '"]');
              if (target) {
                var img = document.createElement('img');
                img.src = 'data:image/png;base64,' + d.pngBase64;
                img.alt = 'Private browser screenshot'; img.style.width = '100%';
                target.replaceChildren(img);
              }
            } else cwRenderInfo();
          }).catch(function (e) { toast(e.message, true); }).finally(function () { button.disabled = false; });
      };
    });
  }

  function cwOpenDesktop(agentId) {
    var cw = cwEnsure(), agent = cwAgentById(agentId);
    if (!agent) return;
    if (cw.desktopSession && cw.desktopSession.agentId === agentId) { cw.desktopSession.focus(); return; }
    if (cw.closeDesktop) cw.closeDesktop();
    var modal = document.createElement('div');
    modal.className = 'modal cw-desktop-dialog';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', agent.name + ' desktop');
    modal.innerHTML = '<div class="box"><div class="bar"><b>' + esc(agent.name) + ' · Desktop</b><span style="flex:1"></span><button class="btn ghost" data-fullscreen>Fullscreen</button><button class="btn ghost" data-close>Close</button></div>' +
      '<div class="cw-desktop-handoff" data-handoff hidden><b>Your turn</b><span data-handoff-reason></span></div>' +
      '<div class="cw-desktop-screen"><iframe data-desktop hidden title="' + esc(agent.name) + ' interactive Linux desktop" allow="clipboard-read; clipboard-write"></iframe><p class="cw-desktop-placeholder" data-placeholder>Connecting to this teammate’s desktop…</p></div>' +
      '<div class="cw-desktop-toolbar"><span class="cw-desktop-status" role="status" data-status>Checking computer…</span><span class="chip">Shared computer</span><button class="btn" data-browser title="Regular Google Chrome for manual sign-in">Browser</button><button class="btn" data-agent_browser title="Browser used by the agent’s automated tools">Agent browser</button><button class="btn" data-files>Files</button><button class="btn" data-terminal>Terminal</button><button class="btn" data-control>Take control</button><button class="btn" data-sleep title="Pause the desktop and preserve open windows">Sleep</button><button class="btn" data-lock title="Lock the app with your password">Lock</button><button class="btn" data-start>Start desktop</button><button class="btn ghost" data-stop>Stop</button></div></div>';
    document.body.appendChild(modal);
    var screen = modal.querySelector('[data-desktop]'), placeholder = modal.querySelector('[data-placeholder]');
    var status = modal.querySelector('[data-status]'), start = modal.querySelector('[data-start]'), stop = modal.querySelector('[data-stop]');
    var controller = new AbortController(), timer = null, closed = false, pending = false, queuedAction = null, host = agent.useHostComputer, userControl = false, controlPending = false, controlRevision = 0, lastComputer = null, streamState = 'Connecting to live desktop…';
    var endpoint = '/api/cowork/agents/' + encodeURIComponent(agentId) + '/computer';
    function disconnect() {
      screen.hidden = true; screen.removeAttribute('src'); streamState = 'Connecting to live desktop…';
    }
    function close() {
      if (document.fullscreenElement === modal.querySelector('.box')) document.exitFullscreen().catch(function () {});
      closed = true; clearTimeout(timer); controller.abort(); disconnect(); modal.remove();
      document.removeEventListener('keydown', keydown);
      window.removeEventListener('message', desktopMessage);
      if (cw.closeDesktop === close) cw.closeDesktop = null;
      if (cw.desktopSession?.agentId === agentId) cw.desktopSession = null;
    }
    function keydown(e) { if (e.key === 'Escape' && document.activeElement !== screen) { e.preventDefault(); close(); } }
    function desktopMessage(e) {
      if (closed || screen.hidden || e.origin !== window.location.origin || e.source !== screen.contentWindow || !e.data || e.data.type !== 'gitu-desktop') return;
      if (['Live · Shared desktop', 'Reconnecting…', 'Desktop access was rejected.'].indexOf(e.data.state) < 0) return;
      streamState = e.data.state; status.textContent = streamState;
      if (userControl && streamState === 'Live · Shared desktop') focusDesktop();
    }
    function focusDesktop() {
      if (closed || screen.hidden) return;
      screen.focus();
      screen.contentWindow?.postMessage({ type: 'gitu-desktop-control', action: 'focus' }, window.location.origin);
    }
    // Ownership must not wait for a Docker status poll or reconnect the viewer.
    async function changeControl(action) {
      if (closed || host || controlPending) return false;
      controlPending = true; controlRevision++;
      modal.querySelector('[data-control]').disabled = true;
      status.textContent = action === 'take-control' ? 'Giving you control…' : 'Returning control to the agent…';
      try {
        var d = await api(endpoint, { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: action }) });
        if (closed) return false;
        cw.computers = (cw.computers || []).filter(function (c) { return c.agentId !== agentId; }).concat([d.computer]);
        update(d.computer);
        if (action === 'take-control') focusDesktop();
        return true;
      } catch (e) {
        if (!closed) status.textContent = e.message || 'Could not change desktop control';
        return false;
      } finally {
        controlPending = false;
        if (!closed) modal.querySelector('[data-control]').disabled = host || lastComputer?.state !== 'running';
      }
    }
    async function launch(app) {
      if (closed || screen.hidden || host) return;
      try {
        if (app === 'browser' && !userControl && !await changeControl('take-control')) return;
        await api(endpoint, { method: 'POST', signal: controller.signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'input', input: { action: 'launch', app: app } }) });
        focusDesktop();
      } catch (e) { if (!closed) status.textContent = e.message || 'Could not open application'; }
    }
    function update(computer) {
      lastComputer = computer;
      host = Boolean(computer.useHostComputer);
      ['browser', 'agent_browser', 'files', 'terminal', 'control', 'sleep'].forEach(function (app) { modal.querySelector('[data-' + app + ']').disabled = host || computer.state !== 'running'; });
      userControl = computer.control === 'user';
      modal.querySelector('[data-control]').disabled = controlPending || host || computer.state !== 'running';
      modal.querySelector('[data-control]').textContent = userControl ? 'Return to agent' : 'Take control';
      modal.querySelector('[data-handoff]').hidden = !userControl;
      modal.querySelector('[data-handoff-reason]').textContent = computer.handoff?.reason || 'The agent is waiting while you use the computer. Return control when finished.';
      start.textContent = host ? 'Use private desktop' : computer.state === 'sleeping' ? 'Wake desktop' : computer.state === 'unavailable' ? 'Retry startup' : 'Start desktop';
      start.disabled = !host && (computer.state === 'starting' || computer.state === 'running');
      stop.disabled = host || (computer.state !== 'starting' && computer.state !== 'running' && computer.state !== 'sleeping');
      status.textContent = host ? 'Using My computer' : computer.state === 'running' ? streamState : computer.state;
      if (host || computer.state !== 'running') {
        disconnect(); placeholder.hidden = false;
        placeholder.textContent = host ? 'Give this teammate its own Linux desktop with a private browser and workspace. Its next tasks will use that private computer.' : computer.error || (computer.state === 'sleeping' ? 'Sleeping. Your apps and open windows are preserved. Wake the desktop to continue.' : computer.state === 'starting' ? 'Starting the private desktop. First startup may take several minutes.' : 'Start this teammate’s private desktop to view its screen.');
      } else {
        if (!screen.getAttribute('src')) screen.src = endpoint + '/view';
        screen.hidden = false; placeholder.hidden = true;
      }
    }
    async function refresh(action) {
      if (closed) return;
      if (document.hidden && !action) { clearTimeout(timer); timer = setTimeout(function () { refresh(); }, 3000); return; }
      if (pending) { if (action) queuedAction = action; return; }
      pending = true; clearTimeout(timer);
      var revision = controlRevision;
      try {
        var d = await api(endpoint, { signal: controller.signal, ...(action ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: action }) } : {}) });
        if (closed) return;
        if (!action && (revision !== controlRevision || controlPending)) return;
        if (d.agent) { cw.agents = cw.agents.map(function (a) { return a.id === agentId ? d.agent : a; }); cwRenderRail(); cwRenderInfo(); }
        cw.computers = (cw.computers || []).filter(function (c) { return c.agentId !== agentId; }).concat([d.computer]);
        update(d.computer);
      } catch (e) {
        if (!closed && (action || (revision === controlRevision && !controlPending))) { status.textContent = e.message || 'Desktop connection unavailable'; start.disabled = false; if (screen.hidden) { placeholder.hidden = false; placeholder.textContent = status.textContent; } }
      } finally {
        pending = false;
        if (!closed) { var nextAction = queuedAction; queuedAction = null; timer = setTimeout(function () { refresh(nextAction); }, nextAction ? 0 : 3000); }
      }
    }
    cw.closeDesktop = close;
    cw.desktopSession = { agentId: agentId, focus: focusDesktop };
    modal.querySelector('[data-close]').onclick = close;
    start.onclick = function () { refresh(host ? 'use-private' : 'start'); };
    stop.onclick = function () { disconnect(); refresh('stop'); };
    ['browser', 'agent_browser', 'files', 'terminal'].forEach(function (app) { modal.querySelector('[data-' + app + ']').onclick = function () { launch(app); }; });
    modal.querySelector('[data-control]').onclick = function () { return changeControl(userControl ? 'return-control' : 'take-control'); };
    modal.querySelector('[data-sleep]').onclick = function () { disconnect(); refresh('sleep'); };
    modal.querySelector('[data-lock]').onclick = async function () {
      try { if (!host) await api(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'take-control' }) }); }
      finally { close(); cwLockApp(); }
    };
    modal.querySelector('[data-fullscreen]').onclick = function () {
      if (document.fullscreenElement) document.exitFullscreen();
      else modal.querySelector('.box').requestFullscreen?.();
    };
    document.addEventListener('keydown', keydown);
    window.addEventListener('message', desktopMessage);
    var cached = (cw.computers || []).find(function (computer) { return computer.agentId === agentId; });
    if (cached?.state === 'running' && !agent.useHostComputer) update(cached);
    refresh(); modal.querySelector('[data-close]').focus();
  }

  function cwShowDesktopHandoffs() {
    var cw = cwEnsure();
    if (S.active !== 'cowork' || !cw.active || document.hidden) return;
    var seen = cw.desktopHandoffsSeen || (cw.desktopHandoffsSeen = Object.create(null));
    (cw.requests || []).forEach(function (request) {
      if (!request.desktopHandoff || request.status !== 'open' || request.conversationId !== cw.active || seen[request.id]) return;
      var agent = cwAgentById(request.agentId);
      if (!agent || agent.useHostComputer) return;
      seen[request.id] = true;
      // Keep an already open computer usable; other handoffs retain their Open button.
      if (!cw.desktopSession || cw.desktopSession.agentId === request.agentId) cwOpenDesktop(request.agentId);
    });
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('visibilitychange', function () { if (!document.hidden) cwShowDesktopHandoffs(); });


  function cwStartStream(convId) {
    var cw = cwEnsure();
    if (typeof EventSource !== 'function') return;
    var generation = cw.generation;
    var stream = new EventSource('/api/cowork/conversations/' + encodeURIComponent(convId) + '/stream?after=' + cw.lastSeq + '&change=' + (cw.lastChange || 0) + '&thread=' + encodeURIComponent(cw.threadId || 'main'));
    cw.stream = stream;
    function current() { return S.active === 'cowork' && cw.active === convId && cw.generation === generation && cw.stream === stream; }
    stream.onopen = function () { if (current()) cw.streamOpen = true; };
    stream.onmessage = function (event) {
      if (!current()) return;
      try { cwApplySnapshot(JSON.parse(event.data)); } catch (e) { cw.streamOpen = false; cwPoll(); }
    };
    stream.onerror = function () { if (current()) { cw.streamOpen = false; cwPoll(); } };
  }

  function cwApplySnapshot(d) {
    var cw = cwEnsure();
    if (typeof d.messageChangeSeq === 'number' && d.messageChangeSeq < cw.lastChange) return;
    var rosterChanged = false;
    if (d.roster) {
      rosterChanged = JSON.stringify(cw.agents) !== JSON.stringify(d.roster.agents) || JSON.stringify(cw.convs) !== JSON.stringify(d.roster.conversations);
      cw.agents = d.roster.agents || [];
      cw.convs = d.roster.conversations || [];
    }
    if (d.rosterRevision !== undefined) cw.rosterRevision = d.rosterRevision;
    if (d.deleted) {
      cwStopPoll(); cw.active = null; cw.msgs = []; cw.busy = false; cw.progress = null; cw.progresses = [];
      cwRenderRail(); cwRenderChat(); return;
    }
    var added = false;
    // Ignore older change-feed payloads, but allow equal cursors (busy/progress
    // can change without a message mutation). Never move the cursor backwards.
    if (typeof d.messageChangeSeq !== 'number' || d.messageChangeSeq >= cw.lastChange) {
      (d.messages || []).concat(d.messageUpdates || []).forEach(function (m) {
        if (cwMergeMessage(m, true)) added = true;
      });
      (d.removedMessageIds || []).forEach(function (id) { cwRemoveMessage(id); added = true; });
      if (typeof d.messageChangeSeq === 'number') cw.lastChange = Math.max(cw.lastChange, d.messageChangeSeq);
    }
    if (added) cwRenderReferences();
    var wasBusy = cw.busy;
    cw.busy = Boolean(d.busy);
    cw.working = d.working || null;
    cw.progress = d.progress || null;
    cw.progresses = d.progresses || (d.progress ? [d.progress] : []);
    var historyChanged = JSON.stringify(cw.workHistory || []) !== JSON.stringify(d.workHistory || []);
    cw.workHistory = d.workHistory || [];
    cw.queued = d.queued || 0;
    var missionsChanged = JSON.stringify(cw.missions || []) !== JSON.stringify(d.missions || []);
    cw.missions = d.missions || [];
    var subAgentsChanged = JSON.stringify(cw.subAgents || null) !== JSON.stringify(d.subAgents || null);
    var previousWorkerLayout = cwSubagentLayoutKey();
    cw.subAgents = d.subAgents || null;
    var workerLayoutChanged = previousWorkerLayout !== cwSubagentLayoutKey();
    var artifactsChanged = JSON.stringify(cw.artifacts || []) !== JSON.stringify(d.artifacts || []);
    var requestsChanged = JSON.stringify(cw.requests || []) !== JSON.stringify(d.requests || []);
    var workChanged = JSON.stringify(cw.todos || []) !== JSON.stringify(d.todos || []);
    var threadsChanged = JSON.stringify(cw.threads || []) !== JSON.stringify(d.threads || []);
    var foldersChanged = Array.isArray(d.folders) && JSON.stringify(cw.folders || []) !== JSON.stringify(d.folders);
    var widgetsChanged = JSON.stringify(cw.widgets || []) !== JSON.stringify(d.widgets || []);
    cw.artifacts = d.artifacts || [];
    cw.todos = d.todos || [];
    cw.requests = d.requests || [];
    if (d.threads) cw.threads = d.threads;
    if (Array.isArray(d.folders)) cw.folders = d.folders;
    if (d.widgets) cw.widgets = d.widgets;
    if (typeof d.threadActivationSeq === 'number' && d.threadActivationSeq > (cw.threadActivationSeq || 0)) {
      cw.threadActivationSeq = d.threadActivationSeq;
      if ((d.activeThreadId || null) !== cw.threadId && (!d.activeThreadId || cw.threads.some(function (thread) { return thread.id === d.activeThreadId; }))) {
        cwSwitchThread(d.activeThreadId || null);
        return;
      }
    }
    if (cw.threadId && d.threads && !cw.threads.some(function (thread) { return thread.id === cw.threadId; })) { cwSwitchThread(null); return; }
    if (rosterChanged || widgetsChanged || threadsChanged) cwRenderRail();
    if (rosterChanged || threadsChanged) cwRenderMembers();
    if (cw.galleryOpen && typeof cwRenderGallery === 'function') cwRenderGallery();
    else if (added || rosterChanged || artifactsChanged || requestsChanged || historyChanged || workerLayoutChanged) cwRenderMsgs(); else cwRenderProgress();
    if (workChanged || rosterChanged) cwRenderWork();
    if (foldersChanged) cwRenderFolders();
    cwRenderTyping();
    if (missionsChanged || subAgentsChanged) { cwRenderMissionBadge(); cwRenderInfo(); }
    if (rosterChanged || foldersChanged || (wasBusy && !cw.busy)) cwRenderInfo();
    cwShowDesktopHandoffs();
  }

  function cwPoll() {
    var cw = cwEnsure();
    var conv = cwActiveConv();
    if (!conv || S.active !== 'cowork') return Promise.resolve();
    if (typeof cwPollAppConnections === 'function') cwPollAppConnections();
    var convId = conv.id;
    var generation = cw.generation;
      if (!cw.computersChecked || Date.now() - cw.computersChecked > 5000) {
        cw.computersChecked = Date.now();
        Promise.all(cwConvMembers(conv).map(function (a) {
          return api('/api/cowork/agents/' + encodeURIComponent(a.id) + '/computer').then(function (v) { return v.computer; });
        })).then(function (computers) {
          if (cw.active !== convId || cw.generation !== generation || S.active !== 'cowork') return;
          if (JSON.stringify(cw.computers) !== JSON.stringify(computers)) { cw.computers = computers; cwRenderInfo(); }
        }).catch(function () {});
      }
    if (cw.streamOpen) return Promise.resolve();
    if (cw.pollPromise) return cw.pollPromise;
    var request = api('/api/cowork/conversations/' + encodeURIComponent(convId) + '/messages?after=' + cw.lastSeq + '&change=' + (cw.lastChange || 0) + '&rosterRevision=' + (cw.rosterRevision === undefined ? -1 : cw.rosterRevision) + '&thread=' + encodeURIComponent(cw.threadId || 'main')).then(function (d) {
      if (cw.active !== convId || cw.generation !== generation || S.active !== 'cowork' || cw.streamOpen) return;
      cwApplySnapshot(d);
    }).catch(function () {}).finally(function () { if (cw.pollPromise === request) cw.pollPromise = null; });
    cw.pollPromise = request;
    return request;
  }

  function cwRenderComposerAction() {
    var cw = cwEnsure(), input = $('cwInput'), send = $('cwSend'), stop = $('cwStop');
    if (!input || !send) return;
    var hasMessage = Boolean(input.value.trim() || (cw.pendingFiles || []).length);
    var stopMode = cw.busy && !hasMessage;
    var queueMode = cw.busy && hasMessage;
    send.disabled = (!cw.busy && !hasMessage) || (cw.pendingFiles || []).some(function (file) { return file.loading; });
    send.classList.toggle('stop', stopMode);
    send.classList.toggle('queue', queueMode);
    send.innerHTML = stopMode ? cwIcon('stop') : cwIcon('send');
    send.title = stopMode ? 'Stop the team' : queueMode ? 'Queue this message while the team works' : 'Send (Enter)';
    send.setAttribute('aria-label', stopMode ? 'Stop the team' : queueMode ? 'Queue message' : 'Send message');
    send.onclick = stopMode ? cwStopRun : cwSend;
    if (stop) stop.hidden = !queueMode;
  }

  function cwRenderTyping() {
    var cw = cwEnsure();
    cwUpdateCharacterActivity();
    document.querySelectorAll('[data-cw-avatar]').forEach(function (node) {
      var id = node.getAttribute('data-cw-avatar');
      var member = cwAgentById(id);
      node.classList.toggle('working', Boolean(cw.busy && member && (cw.working === member.name || (cw.progresses || []).some(function (p) { return p.agentId === id; }))));
    });
    cwRenderComposerAction();
  }

  function cwStopRun() {
    var cw = cwEnsure();
    if (!cw.active) return;
    api('/api/cowork/conversations/' + encodeURIComponent(cw.active) + '/stop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      .then(function () { toast('Stopping the team…'); })
      .catch(function (e) { toast(e.message, true); });
  }

  function cwPostLocal(entry) {
    var cw = cwEnsure(), id = entry.payload.id;
    if (cw.messageLocks[id]) return Promise.resolve();
    cw.messageLocks[id] = true;
    entry.message.status = 'sending';
    cwRenderMsgs();
    function visible() { return cw.active === entry.conversationId && (cw.threadId || null) === (entry.payload.threadId || null); }
    return api('/api/cowork/conversations/' + encodeURIComponent(entry.conversationId) + '/messages', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry.payload)
    }).then(function (d) {
      if (d.message) {
        delete cw.outbox[id];
        if (visible()) cwMergeMessage(d.message);
      }
    }).catch(function (e) {
      // A snapshot may already have confirmed storage despite a lost response.
      // Only an unconfirmed row replays POST; stored failures use /retry.
      if (cw.outbox[id] === entry) {
        entry.message.status = 'failed';
        if (visible()) {
          entry.payload.referencedMessageIds.forEach(function (ref) {
            if (!cw.removedMessages[entry.conversationId + '/' + ref] && cw.referencedMessageIds.indexOf(ref) < 0) cw.referencedMessageIds.push(ref);
          });
          cwRenderReferences();
        }
      }
      toast(e.message, true);
    }).finally(function () {
      delete cw.messageLocks[id];
      if (visible()) { cwRenderMsgs(); cwPoll(); }
    });
  }

  function cwSend() {
    var cw = cwEnsure(), input = $('cwInput');
    if (!input) return;
    var text = input.value.trim(), files = (cw.pendingFiles || []).slice();
    if (files.some(function (file) { return file.loading; })) { toast('Wait for the attachments to finish loading'); return; }
    if (!text && !files.length) return;
    if (!cw.active) { toast('Open a chat first', true); return; }
    var id = crypto.randomUUID();
    var payload = { id: id, text: text, files: files, threadId: cw.threadId || null, referencedMessageIds: cw.referencedMessageIds.slice() };
    var entry = { conversationId: cw.active, payload: payload, message: {
      id: id, text: text, role: 'user', via: 'web', ts: new Date().toISOString(),
      status: 'sending', revision: 0, attempt: 0, localOnly: true,
      threadId: payload.threadId, referencedMessageIds: payload.referencedMessageIds, files: files
    } };
    cw.outbox[id] = entry;
    cw.msgs.push(entry.message);
    input.value = '';
    input.style.height = 'auto';
    cwSaveDraft();
    cw.pendingFiles = [];
    cw.referencedMessageIds = [];
    cwRenderPending();
    cwRenderReferences();
    return cwPostLocal(entry);
  }

  // Mutation responses are scoped to their original view; late responses must
  // not inject a row into a different conversation/thread.
  function cwMutateMessage(m, method, suffix, body) {
    var cw = cwEnsure(), convId = cw.active, threadId = cw.threadId || null;
    if (cw.messageLocks[m.id]) return Promise.resolve(false);
    cw.messageLocks[m.id] = true;
    cwRenderMsgs();
    return api('/api/cowork/conversations/' + encodeURIComponent(convId) + '/messages/' + encodeURIComponent(m.id) + suffix, {
      method: method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body)
    }).then(function (d) {
      if (method === 'DELETE') { cw.removedMessages[convId + '/' + m.id] = true; delete cw.outbox[m.id]; }
      if (cw.active === convId && (cw.threadId || null) === threadId) {
        if (method === 'DELETE') cwRemoveMessage(m.id);
        else if (d.message) cwMergeMessage(d.message);
      }
      return true;
    }).catch(function (e) {
      // A confirmed not-found is also a successful deletion of an unsent row;
      // network errors and active-message rejections must retain it.
      var missing = e.message === '404' || /^message not found$/i.test(e.message || '');
      try { missing = missing || /^message not found$/i.test(JSON.parse(e.message).error || ''); } catch (_) {}
      if (method === 'DELETE' && m.localOnly && missing) {
        delete cw.outbox[m.id];
        cw.removedMessages[convId + '/' + m.id] = true;
        if (cw.active === convId && (cw.threadId || null) === threadId) cwRemoveMessage(m.id);
        return true;
      }
      throw e;
    }).finally(function () {
      delete cw.messageLocks[m.id];
      if (cw.active === convId && (cw.threadId || null) === threadId) { cwRenderMsgs(); cwRenderReferences(); cwPoll(); }
    });
  }

  function cwMessageAction(action, id) {
    var cw = cwEnsure(), m = cwMessage(id);
    if (!m) return;
    if (action === 'copy') {
      if (typeof navigator === 'undefined' || !navigator.clipboard) { toast('Clipboard unavailable in this browser', true); return; }
      return navigator.clipboard.writeText(m.text || '').then(function () { toast('Copied'); }).catch(function (e) { toast(e.message, true); });
    }
    if (action === 'reference') {
      if (m.localOnly) return;
      if (cw.referencedMessageIds.indexOf(id) < 0) cw.referencedMessageIds.push(id);
      cwRenderReferences();
      var input = $('cwInput'); if (input) input.focus();
      return;
    }
    if (cwMessageActive(m)) return;
    if (action === 'edit' && m.role === 'user') return cwEditMessageModal(m);
    if (action === 'retry' && m.role === 'user' && m.status === 'failed') {
      if (cw.outbox[id]) return cwPostLocal(cw.outbox[id]);
      return cwMutateMessage(m, 'POST', '/retry', { attempt: m.attempt || 0 }).catch(function (e) { toast(e.message, true); });
    }
    if (action === 'delete' && confirm('Delete this message?')) {
      // Even an unconfirmed send may have reached the server. DELETE verifies
      // that it is not active before discarding the retained payload.
      return cwMutateMessage(m, 'DELETE', '').catch(function (e) { toast(e.message, true); });
    }
  }

  function cwEditMessageModal(m) {
    var cw = cwEnsure(), convId = cw.active, threadId = cw.threadId || null;
    var revision = m.revision || 0, local = !!m.localOnly;
    var modal = document.createElement('div');
    modal.className = 'modal cw-modal';
    modal.innerHTML = '<div class="box" role="dialog" aria-modal="true" aria-labelledby="cwEditTitle">' +
      '<div class="bar"><span id="cwEditTitle">Edit message</span><span style="flex:1"></span><button class="btn ghost" id="cwEditCancel">Cancel</button></div>' +
      '<div class="cw-body"><label for="cwEditText">Message</label><textarea id="cwEditText" rows="6"></textarea>' +
      '<div class="cw-note">Saving changes does not run the team. Attachments and references stay unchanged.</div></div>' +
      '<div class="cw-foot"><span style="flex:1"></span><button class="btn dark" id="cwEditSave">Save changes</button></div></div>';
    document.body.appendChild(modal);
    var input = modal.querySelector('#cwEditText'), save = modal.querySelector('#cwEditSave');
    input.value = m.text || '';
    function close() { modal.remove(); var composer = $('cwInput'); if (composer) composer.focus(); }
    modal.querySelector('#cwEditCancel').onclick = close;
    modal.onkeydown = function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Tab') {
        var first = modal.querySelector('#cwEditCancel'), last = save.disabled ? input : save;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    save.onclick = function () {
      var current = cwMessage(m.id), text = input.value.trim();
      if (cw.active !== convId || (cw.threadId || null) !== threadId || !current) { toast('This message is no longer open', true); close(); return; }
      if (cwMessageActive(current)) { toast('Wait until delivery finishes before editing', true); return; }
      if ((current.revision || 0) !== revision || !!current.localOnly !== local) { toast('Message changed. Reopen the editor for the latest version.', true); return; }
      if (!text && !(current.artifactIds || []).length && !(current.files || []).length) { toast('Enter a message', true); return; }
      if (local && cw.outbox[m.id]) {
        cw.outbox[m.id].payload.text = text;
        current.text = text;
        cwRenderMsgs(); close(); return;
      }
      save.disabled = true;
      return cwMutateMessage(current, 'PATCH', '', { text: text, revision: revision }).then(function (ok) {
        if (ok) close();
      }).catch(function (e) { toast(e.message, true); }).finally(function () { save.disabled = false; });
    };
    input.focus();
  }

  // ------------------- modals -------------------

  function cwCloudServerModal(onSaved) {
    var modal = document.createElement('div');
    modal.className = 'modal cw-modal';
    modal.innerHTML = '<div class="box" style="width:min(540px,calc(100vw - 32px))"><div class="bar"><strong>Add cloud server</strong><span style="flex:1"></span><button type="button" class="btn ghost" data-cancel>Cancel</button></div>' +
      '<form class="cw-body"><label style="display:block;margin-bottom:14px">Server name<input style="display:block;width:100%;margin-top:6px" name="label" required maxlength="120" placeholder="My VPS" autocomplete="off"></label><label style="display:block;margin-bottom:14px">SSH address<input style="display:block;width:100%;margin-top:6px" name="address" type="url" required placeholder="ssh://user@host:22" autocomplete="off" spellcheck="false"></label><label style="display:block;margin-bottom:14px">SSH password<input style="display:block;width:100%;margin-top:6px" name="password" type="password" required autocomplete="new-password"></label>' +
      '<button type="button" class="btn ghost" data-check>Check server identity</button><p class="cw-note" data-fingerprint hidden style="overflow-wrap:anywhere"></p><label data-confirm hidden><input name="confirm" type="checkbox" style="width:auto"> This fingerprint matches my hosting console or known server key.</label><p data-error role="alert" style="color:var(--err)" hidden></p><button type="submit" class="btn dark" data-connect disabled>Connect server</button></form></div>';
    document.body.appendChild(modal);
    var form = modal.querySelector('form'), address = form.elements.address, check = modal.querySelector('[data-check]'), connect = modal.querySelector('[data-connect]');
    var fingerprint = '', checkedAddress = '', busy = false;
    function update() { connect.disabled = busy || !fingerprint || !form.elements.confirm.checked || checkedAddress !== address.value.trim(); }
    function error(message) { var el = modal.querySelector('[data-error]'); el.textContent = message || ''; el.hidden = !message; }
    modal.querySelector('[data-cancel]').onclick = function () { modal.remove(); };
    address.oninput = function () { fingerprint = ''; checkedAddress = ''; form.elements.confirm.checked = false; modal.querySelector('[data-confirm]').hidden = true; modal.querySelector('[data-fingerprint]').hidden = true; update(); };
    form.elements.confirm.onchange = update;
    check.onclick = function () {
      if (!address.reportValidity()) return;
      var target = address.value.trim();
      check.disabled = true; fingerprint = ''; form.elements.confirm.checked = false; update(); error('');
      api('/api/cowork/cloud-servers/host-key', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ baseUrl: target }) }).then(function (result) {
        if (!modal.isConnected || target !== address.value.trim()) return;
        checkedAddress = target; fingerprint = result.hostFingerprint;
        modal.querySelector('[data-fingerprint]').textContent = fingerprint; modal.querySelector('[data-fingerprint]').hidden = false; modal.querySelector('[data-confirm]').hidden = false;
      }).catch(function (e) { error(e.message); }).finally(function () { check.disabled = false; update(); });
    };
    form.onsubmit = function (event) {
      event.preventDefault();
      if (connect.disabled || !form.reportValidity()) return;
      busy = true; check.disabled = true; update(); error('');
      api('/api/cowork/cloud-servers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ label: form.elements.label.value.trim(), baseUrl: checkedAddress, password: form.elements.password.value, hostFingerprint: fingerprint }) }).then(function (result) {
        form.elements.password.value = '';
        var cw = cwEnsure(); cw.cloudServers = (cw.cloudServers || []).filter(function (server) { return server.id !== result.server.id; }).concat([result.server]);
        modal.remove(); onSaved(result.server);
      }).catch(function (e) { error(e.message); }).finally(function () { busy = false; check.disabled = false; update(); });
    };
    form.elements.label.focus();
  }

  function cwAgentModal(agent) {
    var cw = cwEnsure();
    var isEdit = Boolean(agent && agent.id);
    // Gateways (Telegram/Discord) live on the agent's DM conversation. Find it
    // so the Edit-teammate modal can mirror and save them without a schema change.
    var dmConv = null;
    if (isEdit) dmConv = cw.convs.find(function (c) { return c.kind === 'dm' && c.memberIds[0] === agent.id; }) || null;
    var dmGw = dmConv ? cwAgentGatewayHtml(dmConv) : null;
    var d = {
      name: agent ? agent.name : '',
      tagline: agent ? agent.tagline : '',
      systemPrompt: agent ? agent.systemPrompt : '',
      avatar: {
        color: agent && agent.avatar && agent.avatar.color ? agent.avatar.color : '#8f80ff',
        shape: agent ? cwAvatarShape(agent.avatar && agent.avatar.shape, agent.avatar && agent.avatar.color) : 'dot-purple'
      },
      provider: agent ? (agent.provider || '') : (S.sel.model || '').split('::')[0],
      model: agent ? (agent.model || '') : (S.sel.model || '').split('::').slice(1).join('::'),
      effort: agent ? (agent.effort || '') : '',
      skills: agent ? (agent.skills || []).slice() : ['browser-workflow'],
      allowShell: agent ? Boolean(agent.allowShell) : false,
      allowWrites: agent ? Boolean(agent.allowWrites) : false,
      allowConfig: agent ? Boolean(agent.allowConfig) : false,
      useHostComputer: agent ? Boolean(agent.useHostComputer) : true,
      computerMode: agent && agent.cloudConnectionId ? 'cloud' : agent && !agent.useHostComputer ? 'private' : 'local',
      cloudConnectionId: agent ? agent.cloudConnectionId || '' : '',
      chiefOfStaff: agent ? Boolean(agent.chiefOfStaff) : false
    };
    var modal = document.createElement('div');
    modal.className = 'modal cw-modal';
    modal.innerHTML =
      '<div class="box"><div class="bar"><span style="font-weight:600;font-size:13px">' + (isEdit ? 'Edit teammate' : 'New teammate') + '</span><span style="flex:1"></span><button class="btn ghost" id="cwAmCancel">Cancel</button></div>' +
      '<div class="cw-body">' +
        '<div class="cw-2col"><div><label>Name — yours to choose</label><input type="text" id="cwAmName" value="' + esc(d.name) + '" maxlength="60" placeholder="e.g. Atlas, Vera, Rex…"></div>' +
        '<div><label>Role / tagline</label><input type="text" id="cwAmTag" value="' + esc(d.tagline) + '" maxlength="120" placeholder="Backend engineer"></div></div>' +
        '<label>Character</label>' +
        '<div class="cw-avrow">' +
          '<span class="cw-avprev" id="cwAmAvaWrap">' + cwAvaImg(d.avatar) + '</span>' +
          '<div class="cw-avopts">' +
            '<div class="cw-shapes" id="cwAmShapes" role="group" aria-label="Teammate character">' + CW_SHAPES.map(function (s) { return '<button type="button" data-shape="' + s + '" aria-pressed="' + (s === d.avatar.shape) + '"' + (s === d.avatar.shape ? ' class="cur"' : '') + '><span class="cw-shape-preview">' + cwAvaImg({ shape: s }) + '</span>' + CW_CHARACTER_NAMES[s] + '</button>'; }).join('') + '</div>' +
            '<div class="cw-avhint">Choose a plush teammate. Its activity follows the work in your chat.</div>' +
            '<div class="cw-character-color"><label for="cwAmColor">Character &amp; chat color</label><input type="color" id="cwAmColor" value="'+cwCharacterColor(d.avatar)+'" aria-label="Character and chat color"><div class="cw-colors" role="group" aria-label="Character colors">'+CW_CHARACTER_PALETTE.map(function(choice){return '<button type="button" data-character-color="'+choice[1]+'" style="background:'+choice[1]+'" aria-label="'+choice[0]+' character color" title="'+choice[0]+'" aria-pressed="'+(d.avatar.color===choice[1])+'"></button>';}).join('')+'</div></div>' +
            '<button type="button" class="cw-preview-work" id="cwAmWork" aria-pressed="false">Preview working animation</button>' +
          '</div>' +
        '</div>' +
        (!isEdit ? '<label>Starting points — fill instructions only, then make it yours</label><div class="cw-templates">' + CW_TEMPLATES.map(function (t, i) { return '<button type="button" data-template="' + i + '">' + esc(t.label) + '</button>'; }).join('') + '</div>' : '') +
        '<label>Personality &amp; instructions (the system prompt)</label><textarea id="cwAmPrompt" placeholder="Who is this agent, how does it think and answer?">' + esc(d.systemPrompt) + '</textarea>' +
        '<div class="cw-2col"><div><label>Model provider</label><select id="cwAmProv"><option value="">Server default</option>' + (S.models || []).map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === d.provider ? ' selected' : '') + '>' + esc(p.label || p.id) + '</option>'; }).join('') + '</select></div>' +
        '<div><label for="cwAmModel">Model</label><input type="text" id="cwAmModelSearch" placeholder="Search models…" aria-label="Search models for the selected provider" aria-controls="cwAmModel" autocomplete="off" spellcheck="false" style="margin-bottom:6px"><select id="cwAmModel" aria-describedby="cwAmModelCount"><option value="">Provider default</option></select><div id="cwAmModelCount" class="meta" role="status" aria-live="polite"></div></div></div>' +
        '<div class="cw-2col"><div><label>Effort</label><select id="cwAmEffort"><option value="">default</option><option value="low"' + (d.effort === 'low' ? ' selected' : '') + '>low</option><option value="medium"' + (d.effort === 'medium' ? ' selected' : '') + '>medium</option><option value="high"' + (d.effort === 'high' ? ' selected' : '') + '>high</option><option value="max"' + (d.effort === 'max' ? ' selected' : '') + '>max</option></select></div>' +
        '<div><label>Chief of staff</label><div class="cw-check" style="margin-top:8px"><input type="checkbox" id="cwAmChief"' + (d.chiefOfStaff ? ' checked' : '') + '> <span>Preselect as chief in new groups</span></div></div></div>' +
        '<label>Skills (loaded from the shared skill library)</label><div class="cw-skills" id="cwAmSkills">' +
          (cw.skills.length ? cw.skills.map(function (s) { return '<button data-skill="' + esc(s.name) + '"' + (d.skills.indexOf(s.name) >= 0 ? ' class="on"' : '') + '>' + esc(s.name) + '</button>'; }).join('') : '<span style="font-size:11.5px;color:var(--faint)">No skills defined yet — create them in Settings or by asking Gitu in a task.</span>') + '</div>' +
        '<div class="cw-perm">' +
          '<label><input type="checkbox" id="cwAmShell"' + (d.allowShell ? ' checked' : '') + '> Allow run_command</label>' +
          '<label><input type="checkbox" id="cwAmWrites"' + (d.allowWrites ? ' checked' : '') + '> Allow file writes</label>' +
          '<label><input type="checkbox" id="cwAmConfig"' + (d.allowConfig ? ' checked' : '') + '> Allow tool setup (add MCP servers, create skills, manage connections, create projects)</label>' +
        '</div>' +
        '<label for="cwAmComputer">Computer</label><select id="cwAmComputer"><option value="local"' + (d.computerMode === 'local' ? ' selected' : '') + '>My computer</option><option value="cloud"' + (d.computerMode === 'cloud' ? ' selected' : '') + '>Cloud computer</option><option value="private"' + (d.computerMode === 'private' ? ' selected' : '') + '>Private desktop on this computer</option></select>' +
        '<div id="cwAmCloud"' + (d.computerMode !== 'cloud' ? ' hidden' : '') + '><label for="cwAmCloudServer">Cloud server</label><select id="cwAmCloudServer"></select><button type="button" class="btn ghost" id="cwAmCloudAdd" style="margin-top:8px">Add cloud server</button></div>' +
        '<div class="cw-note" id="cwAmComputerNote"></div>' +
        (dmGw ? dmGw.html : '') +
      '</div>' +
      '<div class="cw-foot"><button class="btn ghost" id="cwAmDel"' + (isEdit ? '' : ' hidden') + '>Delete</button><span style="flex:1"></span><button class="btn dark" id="cwAmSave">' + (isEdit ? 'Save changes' : 'Create teammate') + '</button></div></div>';
    document.body.appendChild(modal);
    var computerSel = modal.querySelector('#cwAmComputer');
    var cloudSel = modal.querySelector('#cwAmCloudServer');
    function renderCloudServers(selected) {
      var servers = cw.cloudServers || [];
      cloudSel.innerHTML = '<option value="">Choose a server…</option>' + servers.map(function (server) { return '<option value="' + esc(server.id) + '"' + (server.id === selected ? ' selected' : '') + (!server.hasCredential ? ' disabled' : '') + '>' + esc(server.label) + ' · ' + esc(server.host) + (!server.hasCredential ? ' (reconnect required)' : '') + '</option>'; }).join('');
      if (selected && !servers.some(function (server) { return server.id === selected; })) cloudSel.innerHTML += '<option value="' + esc(selected) + '" selected disabled>Saved server is missing — reconnect it</option>';
    }
    function updateComputerChoice() {
      modal.querySelector('#cwAmCloud').hidden = computerSel.value !== 'cloud';
      modal.querySelector('#cwAmComputerNote').textContent = computerSel.value === 'cloud' ? 'A private Linux desktop on your server. You and the teammate can use the same screen, hand off control, and share files. The server needs Docker. Cloud tasks stay on the selected server.' : computerSel.value === 'private' ? 'A separate Linux desktop on this computer. Requires Docker here. Files and browser sessions are kept when stopped.' : 'Uses this Gitu app’s local workspace and browser. Docker is not required. Shell and file changes follow the permissions above.';
    }
    computerSel.onchange = updateComputerChoice;
    renderCloudServers(d.cloudConnectionId);
    updateComputerChoice();
    modal.querySelector('#cwAmCloudAdd').onclick = function () { cwCloudServerModal(function (server) { renderCloudServers(server.id); }); };
    if (dmGw) dmGw.bind();
    function refreshPreview() {
      var wrap = modal.querySelector('#cwAmAvaWrap');
      if (wrap) wrap.innerHTML = cwAvaImg(d.avatar);
      modal.querySelector('#cwAmColor').value=cwCharacterColor(d.avatar);
      modal.querySelectorAll('[data-character-color]').forEach(function(button){button.setAttribute('aria-pressed',String(button.getAttribute('data-character-color')===d.avatar.color));});
    }
    modal.querySelector('#cwAmColor').oninput=function(){d.avatar.color=cwCharacterColor({shape:d.avatar.shape,color:this.value});refreshPreview();};
    modal.querySelectorAll('[data-character-color]').forEach(function(button){button.onclick=function(){d.avatar.color=button.getAttribute('data-character-color');refreshPreview();};});
    modal.querySelector('#cwAmWork').onclick = function () {
      var working = this.getAttribute('aria-pressed') !== 'true';
      this.setAttribute('aria-pressed', String(working));
      this.textContent = working ? 'Preview idle animation' : 'Preview working animation';
      modal.querySelector('#cwAmAvaWrap').classList.toggle('working', working);
    };
    modal.querySelectorAll('[data-shape]').forEach(function (b) {
      b.onclick = function () {
        d.avatar.shape = b.getAttribute('data-shape');
        d.avatar.color = CW_DOT_COLORS[d.avatar.shape];
        modal.querySelectorAll('[data-shape]').forEach(function (x) { x.classList.remove('cur'); x.setAttribute('aria-pressed', 'false'); });
        b.classList.add('cur');
        b.setAttribute('aria-pressed', 'true');
        refreshPreview();
      };
    });
    modal.querySelectorAll('[data-template]').forEach(function (b) {
      b.onclick = function () {
        var t = CW_TEMPLATES[Number(b.getAttribute('data-template'))];
        $('cwAmPrompt').value = t.prompt;
        if (t.label === 'Coordinator') $('cwAmChief').checked = true;
      };
    });
    modal.querySelectorAll('[data-skill]').forEach(function (b) {
      b.onclick = function () {
        var s = b.getAttribute('data-skill');
        var i = d.skills.indexOf(s);
        if (i >= 0) { d.skills.splice(i, 1); b.classList.remove('on'); } else { d.skills.push(s); b.classList.add('on'); }
      };
    });
    var provSel = modal.querySelector('#cwAmProv');
    var modelSel = modal.querySelector('#cwAmModel');
    var modelSearch = modal.querySelector('#cwAmModelSearch');
    var modelCount = modal.querySelector('#cwAmModelCount');
    var fillModels = function () {
      var pid = provSel.value;
      var query = modelSearch.value;
      var group = catalogModelGroups(pid, query)[0];
      var matches = group ? group.models : [];
      var options = catalogSelectOptions(pid, d.model, query);
      // Filtering must not silently replace an existing choice with the default.
      if (d.model && !matches.some(function (m) { return m.id === d.model; })) {
        options = '<option value="' + esc(d.model) + '" selected>' + esc(d.model) + ' (current selection)</option>' + options;
      }
      modelSel.innerHTML = '<option value="">Provider default</option>' + options;
      modelSearch.disabled = !pid;
      modelCount.textContent = !pid ? 'Choose a provider to search models' :
        (matches.length ? matches.length + (matches.length === 1 ? ' model' : ' models') + (query.trim() ? ' match' : '') : 'No models match your search') +
        (d.model && !matches.some(function (m) { return m.id === d.model; }) ? ' · current selection kept' : '');
    };
    modelSearch.oninput = fillModels;
    provSel.onchange = function () { d.model = ''; modelSearch.value = ''; fillModels(); };
    modelSel.onchange = function () { d.model = modelSel.value; fillModels(); };
    fillModels();
    loadModelCatalog().then(function () {
      if (!modal.isConnected) return;
      var pid = provSel.value;
      d.model = modelSel.value || d.model;
      provSel.innerHTML = '<option value="">Server default</option>' + S.models.map(function (p) {
        return '<option value="' + esc(p.id) + '"' + (p.id === pid ? ' selected' : '') + '>' + esc(p.label || p.id) + '</option>';
      }).join('');
      fillModels();
    }).catch(function () { if (modal.isConnected) toast('Could not refresh models; showing the last catalog', true); });
    modal.querySelector('#cwAmCancel').onclick = function () { modal.remove(); };
    modal.querySelector('#cwAmSave').onclick = function () {
      if (computerSel.value === 'cloud' && (!cloudSel.value || cloudSel.selectedOptions[0].disabled)) { toast('Choose a saved cloud server or add one first.', true); return; }
      var body = {
        id: isEdit ? agent.id : undefined,
        name: $('cwAmName').value,
        avatar: d.avatar,
        tagline: $('cwAmTag').value,
        systemPrompt: $('cwAmPrompt').value,
        provider: provSel.value,
        model: modelSel.value,
        effort: $('cwAmEffort').value,
        skills: d.skills,
        allowShell: $('cwAmShell').checked,
        allowWrites: $('cwAmWrites').checked,
        allowConfig: $('cwAmConfig').checked,
        useHostComputer: computerSel.value === 'local',
        cloudConnectionId: computerSel.value === 'cloud' ? cloudSel.value : '',
        chiefOfStaff: $('cwAmChief').checked
      };
      api('/api/cowork/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (res) {
          modal.remove();
          var cw2 = cwEnsure();
          var found = false;
          cw2.agents = cw2.agents.map(function (a) { if (a.id === res.agent.id) { found = true; return res.agent; } return a; });
          if (!found) cw2.agents.push(res.agent);
          if (res.conversation && !cw2.convs.some(function (c) { return c.id === res.conversation.id; })) cw2.convs.push(res.conversation);
          cwRenderRail();
          if(isEdit){cwApplyCharacterTheme();cwRenderInfo();var active=cwActiveConv(),header=$('cwChatAvatar');if(header&&active&&active.kind==='dm'&&active.memberIds[0]===res.agent.id)header.innerHTML=cwAva(res.agent);}
          toast(isEdit ? 'Teammate updated' : res.agent.name + ' joined the team');
          if (!isEdit) cwOpenDm(res.agent.id);
        })
        .catch(function (e) { toast(e.message, true); });
    };
    var delBtn = modal.querySelector('#cwAmDel');
    if (isEdit && delBtn) {
      delBtn.onclick = function () {
        if (!confirm('Delete ' + agent.name + '?')) return;
        api('/api/cowork/agents/' + encodeURIComponent(agent.id), { method: 'DELETE' }).then(function () { modal.remove(); cwLoad(true); }).catch(function (e) { toast(e.message, true); });
      };
    }
    setTimeout(function () { var n = modal.querySelector('#cwAmName'); if (n && !isEdit) n.focus(); }, 0);
  }

  function cwGroupModal() {
    var cw = cwEnsure();
    if (cw.agents.length < 2) { toast('Create at least two teammates first — the + button in the rail.', true); cwAgentModal(null); return; }
    var modal = document.createElement('div');
    modal.className = 'modal cw-modal';
    modal.innerHTML =
      '<div class="box"><div class="bar"><span style="font-weight:600;font-size:13px">New group chat</span><span style="flex:1"></span><button class="btn ghost" id="cwGmCancel">Cancel</button></div>' +
      '<div class="cw-body">' +
        '<label>Group name</label><input type="text" id="cwGmTitle" placeholder="Product launch team" maxlength="120">' +
        '<label>Members (pick at least two)</label>' +
        '<div class="cw-skills" id="cwGmMembers">' + cw.agents.map(function (a) { return '<button data-id="' + esc(a.id) + '">' + esc(a.name) + '</button>'; }).join('') + '</div>' +
        '<label>Chief of staff (optional — coordinates who answers)</label>' +
        '<select id="cwGmChief"><option value="">No chief — first mentioned agent answers</option>' + cw.agents.map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(a.name) + '</option>'; }).join('') + '</select>' +
      '</div>' +
      '<div class="cw-foot"><span style="flex:1"></span><button class="btn dark" id="cwGmSave">Create group</button></div></div>';
    document.body.appendChild(modal);
    var chosen = [];
    modal.querySelectorAll('[data-id]').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-id');
        var i = chosen.indexOf(id);
        if (i >= 0) { chosen.splice(i, 1); b.classList.remove('on'); } else { chosen.push(id); b.classList.add('on'); }
      };
    });
    modal.querySelector('#cwGmCancel').onclick = function () { modal.remove(); };
    modal.querySelector('#cwGmSave').onclick = function () {
      if (chosen.length < 2) { toast('Pick at least two members', true); return; }
      api('/api/cowork/conversations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'group', title: $('cwGmTitle').value, memberIds: chosen, chiefId: $('cwGmChief').value }) })
        .then(function (d) { modal.remove(); cwEnsure().convs.push(d.conversation); cwRenderRail(); cwOpenConv(d.conversation.id); })
        .catch(function (e) { toast(e.message, true); });
    };
    setTimeout(function () { var t = modal.querySelector('#cwGmTitle'); if (t) t.focus(); }, 0);
  }
`;
