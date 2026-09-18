import { CHARACTER_CSS, CHARACTER_JS } from './ui-characters.js';

/**
 * Cowork mode UI: a messaging-app style surface (agent roster, DMs, group
 * chats, Telegram/schedule panels) rendered inside the existing web app.
 * Exported as CSS + JS snippets injected into UI_HTML. The JS runs inside the
 * app's main IIFE, so it reuses the helpers there ($, esc, api, toast, S).
 *
 * Visuals: all chrome icons are inline SVG (cwIcon), and every agent is drawn
 * as a voxel character by the bundled three.js (window.__coworkAvatar, defined
 * in ui.ts) with an inline-SVG identicon fallback. No emoji anywhere; agent
 * names always come from the user — templates only prefill instructions.
 * Written as String.raw and ES5-style so no escape or interpolation surprises
 * leak into the injected markup.
 */

export const COWORK_CSS = String.raw`
  .cw-message-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; align-items: center; }
  .cw-message-actions button { font-size: 11px; color: var(--muted); background: transparent; border: 1px solid var(--border2); border-radius: 5px; padding: 3px 7px; }
  .cw-message-actions button:hover, .cw-message-actions button:focus-visible { color: var(--text); border-color: var(--accent); }
  .cw-message-actions button:disabled { opacity: .45; cursor: not-allowed; }
  .cw-message-status, .cw-message-refs { font-size: 11px; color: var(--muted); }
  .cw-message-status.failed { color: var(--bad, #f87171); }
  .cw-message-refs { margin-top: 6px; overflow-wrap: anywhere; }
  .cw-references > span { max-width: 280px; }

  /* ---- Cowork mode ---- */
  body.cowork .sb, body.cowork .mobile-nav-btn, body.cowork .vresize, body.cowork .topbar { display: none !important; }
  .cw { flex: 1; display: flex; min-height: 0; width: 100%; background: var(--bg); }
  .cw-rail { width: var(--sbw, 264px); flex: none; border-right: 1px solid var(--border); display: flex; flex-direction: column; min-height: 0; background: linear-gradient(180deg, rgba(19,24,38,.72), var(--bg) 150px); }
  .cw-rail-head { display: flex; align-items: center; gap: 6px; padding: 12px 12px 8px; font-weight: 700; letter-spacing: .06em; font-size: 12px; color: var(--text); }
  .cw-rail-head .cw-brand { display: inline-flex; align-items: center; gap: 7px; }
  .cw-rail-head .cw-brand svg { color: var(--accent); }
  .cw-rail-head .spacer { flex: 1; }
  .cw-rail-head .iconbtn { width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--border2); border-radius: 7px; background: transparent; color: var(--muted); }
  .cw-rail-head .iconbtn svg { width: 14px; height: 14px; }
  .cw-rail-head .iconbtn:hover { color: var(--text); border-color: var(--accent); }
  .cw-learn { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--border2); border-radius: 999px; background: transparent; color: var(--muted); font: inherit; font-size: 10px; letter-spacing: .04em; padding: 3px 8px; cursor: pointer; white-space: nowrap; }
  .cw-learn:hover { color: var(--text); border-color: var(--accent); }
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
  .cw-item.cur { background: var(--run-dim); border-color: rgba(91,168,255,.35); }
  .cw-item-main { min-width: 0; flex: 1; }
  .cw-item-name { display: block; font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cw-item-sub { display: block; font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cw-ava { width: 28px; height: 28px; flex: none; border-radius: 9px; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; }
  .cw-ava img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .cw-ava svg { width: 100%; height: 100%; display: block; }
  .cw-item .cw-flag { flex: none; color: var(--muted); display: inline-flex; }
  .cw-item .cw-flag svg { width: 14px; height: 14px; }
  .cw-flag.gold { color: var(--evidence); }
  .cw-rail-foot { padding: 10px 12px; border-top: 1px solid var(--border); display: flex; gap: 8px; }
  .cw-rail-foot .btn { flex: 1; padding: 6px 10px; font-size: 12px; }
  .cw-empty-note { font-size: 11.5px; color: var(--muted); padding: 8px 6px 4px; line-height: 1.5; }
  .cw-chat { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .cw-chat-head { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--border); min-height: 52px; }
  .cw-chat-head .cw-tt { min-width: 0; flex: 1; }
  .cw-chat-head .cw-tt .t1 { font-weight: 700; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; }
  .cw-chat-head .cw-tt .t1 svg { width: 14px; height: 14px; color: var(--evidence); flex: none; }
  .cw-chat-head .cw-tt .t2 { font-size: 11.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cw-chat-head .chip { flex: none; display: inline-flex; align-items: center; gap: 5px; }
  .cw-chat-head .chip svg { width: 12px; height: 12px; }
  .cw-info-toggle { border: 1px solid var(--border2); background: transparent; color: var(--muted); border-radius: 8px; padding: 4px 10px; font-size: 12px; flex: none; }
  .cw-info-toggle:hover { color: var(--text); border-color: var(--accent); }
  .cw-threads { display: flex; align-items: center; gap: 6px; padding: 7px 16px; border-bottom: 1px solid var(--border); overflow-x: auto; min-height: 38px; }
  .cw-thread { border: 1px solid var(--border2); background: transparent; color: var(--muted); border-radius: 999px; padding: 3px 12px; font-size: 12px; white-space: nowrap; display: inline-flex; align-items: center; gap: 5px; }
  .cw-thread:hover { color: var(--text); border-color: var(--accent); }
  .cw-thread.cur { color: #fff; background: var(--run-dim); border-color: rgba(91,168,255,.45); }
  .cw-thread.new { border-style: dashed; }
  .cw-thread-del { border: 0; background: transparent; color: var(--muted); cursor: pointer; padding: 2px; display: inline-flex; }
  .cw-thread-del:hover { color: var(--err); }
  .cw-thread-del svg { width: 12px; height: 12px; }
  .cw-widget-ico { background: rgba(143,128,255,.14); color: var(--accent); }
  .cw-widget-ico svg { width: 15px; height: 15px; }
  .cw-widget-body { display: flex; flex-direction: column; gap: 7px; }
  .cw-widget-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12.5px; border-bottom: 1px dashed var(--border); padding: 3px 0; }
  .cw-widget-row:last-child { border-bottom: 0; }
  .cw-widget-row .v { color: var(--text); font-weight: 600; }
  .cw-widget-row .l { color: var(--muted); }
  .cw-widget-row.done .l { text-decoration: line-through; opacity: .65; }
  .cw-widget-bar { height: 8px; border-radius: 999px; background: var(--card2); border: 1px solid var(--border); overflow: hidden; }
  .cw-widget-bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--accent), var(--run)); }
  .cw-widget-text { font-size: 12.5px; color: var(--text); white-space: pre-wrap; overflow-wrap: anywhere; }
  .cw-msgs { flex: 1; overflow-y: auto; padding: 18px 20px 8px; display: flex; flex-direction: column; gap: 12px; }
  .cw-row { display: flex; gap: 9px; max-width: 86%; }
  .cw-row.me { align-self: flex-end; flex-direction: row-reverse; max-width: 74%; }
  .cw-bubble { background: var(--card); border: 1px solid var(--border); border-radius: 13px; padding: 8px 12px; font-size: 13.5px; line-height: 1.55; overflow-wrap: anywhere; }
  .cw-row.me .cw-bubble { background: var(--run-dim); border-color: rgba(91,168,255,.35); }
  .cw-bubble .cw-meta { display: flex; align-items: center; gap: 7px; font-size: 11px; color: var(--muted); margin-bottom: 3px; }
  .cw-row.me .cw-meta { justify-content: flex-end; }
  .cw-bubble .cw-meta .nm { font-weight: 700; color: var(--text); }
  .cw-bubble .cw-meta .tg { color: var(--faint); }
  .cw-tools { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .cw-tools span { font-size: 10.5px; font-family: var(--mono); border: 1px solid var(--border2); color: var(--muted); border-radius: 6px; padding: 1px 6px; }
  .cw-tools span.ok { color: var(--ok); border-color: rgba(63,214,143,.4); }
  .cw-tools span.bad { color: var(--err); border-color: rgba(255,100,101,.4); }
  .cw-sys { align-self: center; text-align: left; font-size: 12px; line-height: 1.6; color: var(--muted); background: var(--card2); border: 1px solid var(--border); border-radius: 10px; padding: 8px 12px; max-width: 90%; overflow-wrap: anywhere; }
  .cw-sys summary { cursor: pointer; font-weight: 600; }
  .cw-sys .cw-sys-detail { white-space: pre-wrap; margin-top: 8px; max-height: 280px; overflow: auto; }
  .cw-code { display: block; background: var(--card2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font-family: var(--mono); font-size: 12px; overflow-x: auto; white-space: pre; margin: 6px 0; }
  .cw-bubble code { font-family: var(--mono); font-size: 12px; background: var(--card2); border-radius: 4px; padding: 1px 4px; }
  .cw-bubble .cw-mention { color: var(--accent); font-weight: 600; }
  .cw-bubble a { color: var(--run); }
  .cw-table { border-collapse: collapse; margin: 8px 0; font-size: 12.5px; display: block; overflow-x: auto; max-width: 100%; }
  .cw-table th, .cw-table td { border: 1px solid var(--border2); padding: 5px 10px; text-align: left; vertical-align: top; }
  .cw-table th { background: var(--card2); font-weight: 600; }
  .cw-table tbody tr:nth-child(even) { background: rgba(255,255,255,.02); }
  .cw-embed { margin: 8px 0 4px; }
  .cw-embed iframe { display: block; width: 100%; max-width: 520px; aspect-ratio: 16 / 9; height: auto; border: 1px solid var(--border2); border-radius: 10px; background: #000; }
  .cw-typing { display: flex; align-items: center; gap: 8px; padding: 2px 22px 10px; font-size: 12px; color: var(--muted); }
  .cw-typing .dots { display: inline-flex; gap: 3px; }
  .cw-typing .dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); animation: cwpulse 1.1s infinite; }
  .cw-typing .dots i:nth-child(2) { animation-delay: .18s; } .cw-typing .dots i:nth-child(3) { animation-delay: .36s; }
  @keyframes cwpulse { 0%, 70%, 100% { opacity: .25; transform: translateY(0); } 35% { opacity: 1; transform: translateY(-2px); } }
  .cw-composer-wrap { padding: 10px 20px 16px; }
  .cw-mentions { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .cw-mentions button { font-size: 11.5px; border: 1px solid var(--border2); background: var(--card); color: var(--text); border-radius: 999px; padding: 2px 10px; }
  .cw-mentions button:hover { border-color: var(--accent); }
  .cw-composer { display: flex; align-items: flex-end; gap: 8px; background: linear-gradient(145deg, rgba(24,31,47,.98), var(--card)); border: 1px solid var(--border2); border-radius: 14px; padding: 8px 10px; box-shadow: 0 12px 32px rgba(0,0,0,.15); }
  .cw-composer textarea { flex: 1; background: transparent; border: 0; color: var(--text); resize: none; outline: none; max-height: 160px; font: inherit; line-height: 1.5; }
  .cw-composer .cw-send { width: 32px; height: 32px; flex: none; border-radius: 10px; border: 0; background: var(--accent); color: #fff; font-size: 15px; display: inline-flex; align-items: center; justify-content: center; }
  .cw-composer .cw-send:disabled { opacity: .4; cursor: default; }
  .cw-composer .cw-send.stop { background: var(--err); }
  .cw-attach { width: 32px; height: 32px; flex: none; border: 1px solid var(--border2); background: transparent; color: var(--muted); border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; }
  .cw-attach:hover { color: var(--text); border-color: var(--accent); }
  .cw-pending { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; }
  .cw-pending span { display: inline-flex; align-items: center; gap: 5px; max-width: 260px; border: 1px solid var(--border2); background: var(--card); border-radius: 8px; padding: 4px 8px; font-size: 11.5px; color: var(--muted); }
  .cw-pending button { border: 0; background: transparent; color: var(--muted); padding: 0; line-height: 1; }
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
  .cw-work { display: grid; gap: 8px; margin-bottom: 8px; max-height: min(30vh, 260px); overflow-y: auto; overscroll-behavior: contain; }
  .cw-todos, .cw-request { border: 1px solid var(--border); background: var(--card); border-radius: 11px; padding: 8px 10px; }
  .cw-todos summary { cursor: pointer; color: var(--muted); font-size: 11.5px; font-weight: 600; }
  .cw-todo { display: flex; gap: 7px; align-items: flex-start; margin-top: 6px; font-size: 11.5px; color: var(--muted); }
  .cw-todo b { color: var(--text); font-weight: 500; }
  .cw-todo.done { opacity: .6; text-decoration: line-through; }
  .cw-todo .cw-todo-owner { margin-left: auto; white-space: nowrap; color: var(--faint); }
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
  .cw-request { border-color: rgba(91,168,255,.42); box-shadow: 0 0 0 1px rgba(91,168,255,.08) inset; }
  .cw-request .k { color: var(--accent); font-size: 10px; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
  .cw-request .t { font-size: 12.5px; font-weight: 650; margin-top: 3px; }
  .cw-request .d { font-size: 11.5px; color: var(--muted); margin-top: 3px; white-space: pre-wrap; }
  .cw-request .cw-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .cw-request .cw-actions .btn { padding: 4px 10px; font-size: 11.5px; }
  .cw-request input { flex: 1; min-width: 150px; background: var(--card2); border: 1px solid var(--border2); color: var(--text); border-radius: 7px; padding: 5px 8px; }
  .cw-doc-modal .box { width: min(980px, 94vw); height: min(820px, 92vh); }
  .cw-doc-frame { width: 100%; flex: 1; min-height: 0; border: 0; background: #fff; }
  .cw-info { width: 300px; flex: none; border-left: 1px solid var(--border); overflow-y: auto; padding: 14px; min-height: 0; }
  .cw-info h4 { margin: 2px 0 8px; font-size: 11px; letter-spacing: .1em; color: var(--faint); font-weight: 700; }
  .cw-info .cw-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 12px; margin-bottom: 12px; }
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
  .cw-modal .cw-body { padding: 14px 16px 18px; overflow-y: auto; }
  .cw-modal label { display: block; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--faint); margin: 14px 0 5px; font-weight: 700; }
  .cw-modal input[type=text], .cw-modal input[type=password], .cw-modal select, .cw-modal textarea { width: 100%; background: var(--card2); border: 1px solid var(--border2); color: var(--text); border-radius: 9px; padding: 8px 11px; font: inherit; font-size: 13px; }
  .cw-modal input[type=text]:focus, .cw-modal input[type=password]:focus, .cw-modal select:focus, .cw-modal textarea:focus { border-color: var(--accent); outline: none; }
  .cw-modal textarea { resize: vertical; min-height: 96px; line-height: 1.55; }
  .cw-avrow { display: flex; gap: 16px; align-items: center; margin-top: 6px; padding: 12px; background: var(--card2); border: 1px solid var(--border); border-radius: 12px; }
  .cw-avprev { width: 104px; height: 104px; flex: none; border-radius: 14px; background: radial-gradient(circle at 50% 30%, rgba(143,128,255,.16), rgba(13,16,23,.6)); border: 1px solid var(--border2); overflow: hidden; display: flex; align-items: center; justify-content: center; }
  .cw-avprev img, .cw-avprev svg { width: 92px; height: 92px; }
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
  .cw-modal .cw-skills button.on { color: var(--ok); border-color: rgba(63,214,143,.5); }
  .cw-modal .cw-perm { display: flex; flex-direction: column; gap: 9px; margin-top: 12px; padding: 12px; background: var(--card2); border: 1px solid var(--border); border-radius: 12px; }
  .cw-modal .cw-perm label { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 12.5px; color: var(--text); text-transform: none; letter-spacing: 0; font-weight: 400; }
  .cw-modal .cw-note { font-size: 11px; color: var(--faint); margin-top: 10px; line-height: 1.5; }
  .cw-modal .cw-check { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text); }
  .cw-modal .cw-check input { width: 16px; height: 16px; accent-color: var(--accent); }
  .cw-modal .cw-foot { display: flex; gap: 8px; align-items: center; justify-content: flex-end; padding: 12px 16px; border-top: 1px solid var(--border); background: rgba(15,20,31,.6); }
  @media (max-width: 1080px) { .cw-info { display: none; position: absolute; inset: 56px 0 0 auto; z-index: 60; width: min(340px, 92vw); background: var(--bg); box-shadow: -12px 0 35px rgba(0,0,0,.3); } }
  @media (max-width: 720px) { .cw-msgs { padding: 14px 12px 8px; } .cw-row, .cw-row.me { max-width: 100%; } .cw-composer-wrap { padding: 8px 12px 12px; } .cw-chat-head { padding: 8px 12px; gap: 7px; } .cw-file { min-width: 0; flex-wrap: wrap; } .cw-file-actions { margin-left: auto; } .cw-modal .box { max-width: 96vw; } .cw-modal .cw-2col { grid-template-columns: 1fr; } .cw-info-toggle, .cw-send, .cw-attach { min-height: 40px; min-width: 40px; } }
  @media (max-width: 720px) { .cw-rail { width: min(300px, 86vw); position: fixed; inset: 0 auto 0 0; z-index: 80; transform: translateX(-105%); transition: transform .18s ease; box-shadow: 14px 0 40px rgba(0,0,0,.48); background: var(--bg); }
    .cw.rail-open .cw-rail { transform: none; } }
  ${CHARACTER_CSS}
`;

export const COWORK_JS = String.raw`
  ${CHARACTER_JS}
  // ==================== COWORK MODE ====================
  var CW_COLORS = ['#8f80ff', '#5ba8ff', '#3fd68f', '#c9a86a', '#ff6465', '#e670c8', '#4ec3d9', '#9dd65b'];
  var CW_SHAPES = ['orb', 'jelly', 'cat', 'sprout', 'ufo', 'cube', 'visor', 'antenna', 'bot'];
  // Neutral starting points for the INSTRUCTIONS field only. They never fill
  // the name (users name their own agents) and carry no branding.
  var CW_TEMPLATES = [
    { label: 'Coordinator', prompt: 'You coordinate a small agent team. Break requests into clear assignments, hand each part to the right teammate by mentioning @Name, chase status, and synthesize results into one decisive answer. Keep the user goal, constraints and deadlines front and center. Write concisely; never ramble.' },
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
  };
  function cwIcon(name) { return CW_ICONS[name] || ''; }

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
  function cwStopPoll() {
    var cw = S.cw;
    if (!cw) return;
    cw.generation = (cw.generation || 0) + 1;
    if (cw.timer) { clearInterval(cw.timer); cw.timer = null; }
    if (cw.stream) { cw.stream.close(); cw.stream = null; }
    cw.streamOpen = false;
    cw.pollPromise = null;
  }

  // ---- avatars: three.js voxel characters, SVG identicon fallback ----
  window.__cwAvaCache = {};
  function cwAvaDataUrl(avatar) {
    var key = (avatar && avatar.color || '') + '|' + (avatar && avatar.shape || '');
    if (window.__cwAvaCache[key]) return window.__cwAvaCache[key];
    var url = null;
    if (window.__coworkAvatar && window.__coworkAvatar.render) url = window.__coworkAvatar.render(avatar || {}, 96);
    if (url) window.__cwAvaCache[key] = url;
    return url;
  }
  function cwAvaSvg(avatar) {
    var color = (avatar && /^#[0-9a-f]{6}$/i.test(avatar.color)) ? avatar.color : '#8f80ff';
    if (avatar && avatar.shape === 'orb') return '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g class="cw-orb-body"><circle cx="20" cy="21" r="16" fill="' + color + '"/><ellipse cx="14" cy="12" rx="6" ry="3" fill="#fff" opacity=".13" transform="rotate(-30 14 12)"/><g class="cw-orb-eyes" fill="#fff"><rect x="14" y="15" width="3.5" height="7" rx="1.75" transform="rotate(-12 16 18)"/><rect x="23" y="14" width="3.5" height="7" rx="1.75" transform="rotate(-12 25 17)"/></g></g></svg>';
    var shape = (avatar && avatar.shape) || 'cube';
    var visor = shape === 'visor'
      ? '<rect x="6" y="14" width="20" height="7" rx="2.5" fill="#10141d"/><rect x="10" y="16.4" width="3.4" height="2.4" fill="#eaf2ff"/><rect x="18.6" y="16.4" width="3.4" height="2.4" fill="#eaf2ff"/>'
      : '<rect x="11" y="15" width="3.4" height="4.6" fill="#10141d"/><rect x="17.6" y="15" width="3.4" height="4.6" fill="#10141d"/>' +
        (shape === 'antenna' ? '<rect x="15" y="3" width="2" height="5" fill="' + color + '"/><circle cx="16" cy="3.4" r="2" fill="' + color + '"/>' : '') +
        (shape === 'bot' ? '<rect x="4" y="13" width="2.6" height="7" fill="' + color + '"/><rect x="25.4" y="13" width="2.6" height="7" fill="' + color + '"/>' : '');
    return '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<rect x="5" y="8" width="22" height="18" rx="3" fill="' + color + '"/>' + visor +
      '<rect x="9" y="26" width="14" height="5" rx="1.5" fill="rgba(0,0,0,.45)"/></svg>';
  }
  function cwAvaImg(avatar) {
    var character = cwCharacterSvg(avatar);
    if (character) return character;
    if (avatar && avatar.shape === 'orb') return cwAvaSvg(avatar);
    var url = cwAvaDataUrl(avatar);
    return url ? '<img src="' + url + '" alt="">' : cwAvaSvg(avatar);
  }
  function cwAva(agent, size) {
    var style = size ? ' style="width:' + size + 'px;height:' + size + 'px;border-radius:' + Math.round(size * 0.32) + 'px"' : '';
    var cw = cwEnsure();
    var busy = agent && cw.busy && ((cw.progresses || []).some(function (p) { return p.agentId === agent.id; }) || cw.working === agent.name);
    return '<span class="cw-ava' + (busy ? ' working' : '') + '" data-cw-avatar="' + esc(agent && agent.id || '') + '"' + style + '>' + cwAvaImg((agent && agent.avatar) || { color: '#8f80ff', shape: 'orb' }) + '</span>';
  }
  function cwAgentById(id) { var cw = cwEnsure(); for (var i = 0; i < cw.agents.length; i++) if (cw.agents[i].id === id) return cw.agents[i]; return null; }
  // The three.js renderer registers in a deferred module, possibly after the
  // first paint; redraw SVG fallbacks as real characters once it is ready.
  window.addEventListener('coworkavatarsready', function () {
    if (S.active !== 'cowork') return;
    cwRenderRail();
    cwRenderMsgs();
    cwRenderInfo();
  });
  function cwActiveConv() { var cw = cwEnsure(); for (var i = 0; i < cw.convs.length; i++) if (cw.convs[i].id === cw.active) return cw.convs[i]; return null; }
  function cwConvMembers(conv) { var out = []; for (var i = 0; i < conv.memberIds.length; i++) { var a = cwAgentById(conv.memberIds[i]); if (a) out.push(a); } return out; }

  function openCowork() {
    S.active = 'cowork';
    document.body.classList.add('cowork');
    try { localStorage.setItem('hermes.cowork', 'open'); } catch (e) {}
    toggleMobileNav(false);
    stopStreams();
    cwStopPoll();
    renderSidebar();
    var cw = cwEnsure();
    $('view').innerHTML =
      '<div class="cw" id="cw">' +
        '<aside class="cw-rail">' +
          '<div class="cw-rail-head"><span class="cw-brand">' + cwIcon('users') + '<span>COWORK</span></span><button class="cw-learn" id="cwLearn" title="Cowork learning mode"></button><span class="spacer"></span>' +
          '<button class="iconbtn" id="cwAddAgent" title="New teammate" aria-label="New teammate">' + cwIcon('plus') + '</button>' +
          '<button class="iconbtn" id="cwAddGroup" title="New group chat" aria-label="New group chat">' + cwIcon('chat') + '</button></div>' +
          '<div class="cw-rail-search"><input type="search" id="cwSearch" placeholder="Search all chats…" title="Cross-session recall: every conversation, related phrasing included"></div>' +
          '<div class="cw-rail-scroll" id="cwRail"></div>' +
          '<div class="cw-rail-foot"><button class="btn ghost" id="cwExit">Back to workspace</button><button class="btn ghost" id="cwGear" title="Settings" aria-label="Settings">' + cwIcon('gear') + '</button></div>' +
        '</aside>' +
        '<section class="cw-chat" id="cwChat"></section>' +
        '<aside class="cw-info" id="cwInfo"></aside>' +
      '</div>';
    // The app's gear icon is registered in ICONS; reuse its markup.
    var gearBtn = $('cwGear');
    if (gearBtn && typeof icon === 'function') gearBtn.innerHTML = icon('gear');
    $('cwExit').onclick = cwExit;
    $('cwGear').onclick = function () { openSettings('cowork'); };
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
    cwLoad(true);
  }

  function cwExit() {
    cwStopPoll();
    document.body.classList.remove('cowork');
    S.active = 'home';
    try { localStorage.setItem('hermes.cowork', 'closed'); } catch (e) {}
    openHome();
  }

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
    api('/api/cowork/agents').then(function (d) {
      cw.agents = d.agents || [];
      cw.skills = d.availableSkills || [];
      cw.memoryCounts = d.memoryCounts || {};
      cw.computers = d.computers || [];
      cw.profile = d.profile || {};
      return api('/api/cowork/conversations');
    }).then(function (d) {
      cw.convs = d.conversations || [];
      cwRenderRail();
      if (openFirst && cw.convs.length > 0 && !cwActiveConv()) cwOpenConv(cw.convs[cw.convs.length - 1].id);
      else if (!cw.active) cwRenderChat();
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
    var html = '<div class="cw-sec">TEAM</div>';
    if (cw.agents.length === 0) html += '<div class="cw-empty-note">No teammates yet. Create the first profile — pick a name, a character and instructions.</div>';
    cw.agents.forEach(function (a) {
      html += '<button class="cw-item" data-agent="' + esc(a.id) + '">' + cwAva(a) +
        '<span class="cw-item-main"><span class="cw-item-name">' + esc(a.name) + '</span><span class="cw-item-sub">' + esc(a.tagline || 'tap to chat') + '</span></span>' +
        (a.chiefOfStaff ? '<span class="cw-flag gold" title="Default chief of staff">' + cwIcon('crown') + '</span>' : '') + '</button>';
    });
    html += '<div class="cw-sec">CHATS</div>';
    if (cw.convs.length === 0) html += '<div class="cw-empty-note">No conversations. Open a DM from the team list, or build a group chat.</div>';
    cw.convs.forEach(function (c) {
      var members = cwConvMembers(c);
      var sub = c.kind === 'group' ? members.map(function (m) { return m.name; }).join(', ') : (members[0] ? members[0].tagline : '');
      var ava = c.kind === 'group'
        ? '<span class="cw-ava" style="background:rgba(143,128,255,.14);border:1px dashed var(--border2);color:var(--muted)">' + cwIcon('users') + '</span>'
        : (members[0] ? cwAva(members[0]) : '<span class="cw-ava"></span>');
      html += '<button class="cw-item' + (c.id === cw.active ? ' cur' : '') + '" data-conv="' + esc(c.id) + '">' + ava +
        '<span class="cw-item-main"><span class="cw-item-name">' + esc(c.title) + '</span><span class="cw-item-sub">' + esc(sub) + '</span></span>' +
        (c.telegram && c.telegram.enabled ? '<span class="cw-flag" title="Telegram gateway connected">' + cwIcon('plane') + '</span>' : '') +
        (c.schedule && c.schedule.enabled ? '<span class="cw-flag" title="Scheduled messages active">' + cwIcon('clock') + '</span>' : '') +
        '</button>';
    });
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
    var existing = null;
    cw.convs.forEach(function (c) { if (c.kind === 'dm' && c.memberIds.length === 1 && c.memberIds[0] === agentId) existing = c; });
    if (existing) { cwOpenConv(existing.id); return; }
    api('/api/cowork/conversations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'dm', memberIds: [agentId] }) })
      .then(function (d) { cw.convs.push(d.conversation); cwRenderRail(); cwOpenConv(d.conversation.id); })
      .catch(function (e) { toast(e.message, true); });
  }

  function cwOpenConv(id, threadId) {
    var cw = cwEnsure();
    cwStopPoll();
    cw.active = id;
    cw.threadId = threadId || null;
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
    cw.queued = 0;
    cw.artifacts = [];
    cw.todos = [];
    cw.requests = [];
    cw.pendingFiles = [];
    cw.rosterRevision = -1;
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
    cw.queued = 0;
    cw.artifacts = [];
    cw.todos = [];
    cw.requests = [];
    cw.pendingFiles = [];
    cwRenderRail();
    cwRenderChat();
    cwStartStream(cw.active);
    cwPoll();
    cw.timer = setInterval(cwPoll, 2000);
  }

  function cwRenderThreads() {
    var cw = cwEnsure();
    var el = $('cwThreads');
    if (!el) return;
    var html = '<button class="cw-thread' + (!cw.threadId ? ' cur' : '') + '" data-thread="" title="Main conversation">Main</button>';
    (cw.threads || []).forEach(function (thread) {
      html += '<button class="cw-thread' + (cw.threadId === thread.id ? ' cur' : '') + '" data-thread="' + esc(thread.id) + '" title="' + esc(thread.topic || thread.title) + '">' + esc(thread.title) + '</button>';
      if (cw.threadId === thread.id) html += '<button class="cw-thread-del" data-delthread="' + esc(thread.id) + '" title="Delete this thread">' + cwIcon('close') + '</button>';
    });
    html += '<button class="cw-thread new" id="cwNewThread">' + cwIcon('plus') + ' Thread</button>';
    el.innerHTML = html;
    el.querySelectorAll('[data-thread]').forEach(function (b) {
      b.onclick = function () { cwSwitchThread(b.getAttribute('data-thread') || null); };
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
    var add = $('cwNewThread');
    if (add) add.onclick = cwNewThreadModal;
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
          cwRenderThreads();
          cwSwitchThread(d.thread.id);
        })
        .catch(function (e) { toast(e.message, true); });
    };
    setTimeout(function () { var t = $('cwThTitle'); if (t) t.focus(); }, 0);
  }

  function cwRenderChat() {
    var cw = cwEnsure();
    var chat = $('cwChat');
    if (!chat) return;
    var conv = cwActiveConv();
    document.title = conv ? conv.title + ' — Cowork' : 'Cowork — Agent Gitu';
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
      return;
    }
    var members = cwConvMembers(conv);
    var chief = conv.chiefId ? cwAgentById(conv.chiefId) : null;
    var activeThread = cw.threadId ? (cw.threads || []).filter(function (t) { return t.id === cw.threadId; })[0] : null;
    var headAva = conv.kind === 'group'
      ? '<span class="cw-ava" style="background:rgba(143,128,255,.14);border:1px solid var(--border2);color:var(--muted)">' + cwIcon('users') + '</span>'
      : (members[0] ? cwAva(members[0]) : '<span class="cw-ava"></span>');
    chat.innerHTML =
      '<div class="cw-chat-head">' +
        (window.innerWidth <= 720 ? '<button class="cw-info-toggle" id="cwBack">Back</button>' : '') +
        headAva +
        '<div class="cw-tt"><div class="t1">' + esc(conv.title) + (conv.kind === 'group' && chief ? '<span title="Chief of staff: ' + esc(chief.name) + '">' + cwIcon('crown') + '</span>' : '') + '</div>' +
        '<div class="t2" id="cwMemberNames">' + esc(members.map(function (m) { return '@' + m.name; }).join(' · ')) + '</div></div>' +
        '<span class="chip ok" id="cwMissionBadge" title="An autonomous mission is running in this chat"' + ((cw.missions || []).some(function (m) { return m.conversationId === conv.id && m.status === 'running'; }) ? '' : ' hidden') + '>' + cwIcon('target') + 'Mission</span>' +
        (conv.telegram && conv.telegram.enabled ? '<span class="chip ok" title="Telegram gateway on">' + cwIcon('plane') + 'Telegram</span>' : '') +
        (conv.schedule && conv.schedule.enabled ? '<span class="chip" title="Scheduled messages on">' + cwIcon('clock') + esc(conv.schedule.every) + '</span>' : '') +
        '<button class="cw-info-toggle" id="cwInfoBtn">' + (cw.infoOpen ? 'Hide panel' : 'Chat panel') + '</button>' +
      '</div>' +
      '<div class="cw-threads" id="cwThreads"></div>' +
      '<div class="cw-msgs" id="cwMsgs"></div>' +
      '<div class="cw-typing" id="cwTyping" hidden></div>' +
      '<div class="cw-composer-wrap">' +
        '<div class="cw-work" id="cwWork"></div>' +
        '<div class="cw-pending" id="cwPending"></div>' +
        '<div class="cw-pending cw-references" id="cwReferences" aria-label="Referenced messages"></div>' +
        '<div class="cw-mentions" id="cwMentions"' + (conv.kind === 'group' ? '' : ' hidden') + '></div>' +
        '<div class="cw-composer"><input type="file" id="cwFile" multiple hidden>' +
        '<button class="cw-attach" id="cwAttach" title="Attach documents or files" aria-label="Attach files">' + cwIcon('paperclip') + '</button>' +
        '<textarea id="cwInput" rows="1" placeholder="' + (conv.kind === 'group' ? 'Message the whole team — @Name to target someone' : 'Message ' + esc(conv.title)) + (activeThread ? ' — ' + esc(activeThread.title) : '') + '"></textarea>' +
        '<button class="cw-send" id="cwSend" title="Send (Enter)" aria-label="Send message">' + cwIcon('send') + '</button></div>' +
      '</div>';
    $('cwInfoBtn').onclick = function () { cw.infoOpen = !cw.infoOpen; $('cwInfo').style.display = cw.infoOpen ? 'block' : 'none'; $('cwInfoBtn').textContent = cw.infoOpen ? 'Hide panel' : 'Chat panel'; };
    $('cwInfo').style.display = cw.infoOpen ? 'block' : 'none';
    var back = $('cwBack');
    if (back) back.onclick = function () { var el = $('cw'); if (el) el.classList.toggle('rail-open'); };
    var input = $('cwInput');
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); cwSend(); } });
    input.addEventListener('input', function () { input.style.height = 'auto'; input.style.height = Math.min(160, input.scrollHeight) + 'px'; });
    $('cwAttach').onclick = function () { $('cwFile').click(); };
    $('cwFile').onchange = function () { cwAddFiles(Array.prototype.slice.call($('cwFile').files || [])); $('cwFile').value = ''; };
    $('cwSend').onclick = cwSend;
    cwRenderThreads();
    cwRenderMembers();
    cwRenderMsgs();
    cwRenderWork();
    cwRenderPending();
    cwRenderReferences();
    cwRenderInfo();
    cwRenderTyping();
  }

  // Updating the roster must preserve the user's draft and cursor.
  function cwRenderMembers() {
    var conv = cwActiveConv();
    if (!conv) return;
    var members = cwConvMembers(conv);
    var names = $('cwMemberNames');
    if (names) names.textContent = members.map(function (m) { return '@' + m.name; }).join(' · ');
    var men = $('cwMentions');
    if (men) men.innerHTML = '';
    if (conv.kind === 'group' && men) {
      members.forEach(function (m) {
        var b = document.createElement('button');
        b.textContent = '@' + m.name;
        b.title = 'Insert @' + m.name;
        b.onclick = function () {
          var input = $('cwInput');
          if (!input) return;
          var at = input.selectionStart || input.value.length;
          input.value = input.value.slice(0, at) + '@' + m.name + ' ' + input.value.slice(at);
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

  // Every artifact has a preview route: PDFs and images render in the browser's
  // own viewer, documents render as sanitized text/table pages, and exotic
  // binaries get an info card with a download link. So Open is always offered.
  // Images draw inline thumbnails; audio/video render inline players. Both load
  // through the artifact route with ?inline=1 (same-origin, nosniff).
  function cwFilesHtml(ids) {
    var files = (ids || []).map(cwArtifact).filter(Boolean);
    if (!files.length) return '';
    return '<div class="cw-files">' + files.map(function (file) {
      var inline = '/api/cowork/artifacts/' + encodeURIComponent(file.id) + '?inline=1';
      var mime = file.mime || '';
      var media = '';
      if (/^image\/(png|jpeg|gif|webp)/i.test(mime)) media = '<img class="cw-thumb" loading="lazy" alt="' + esc(file.name) + '" src="' + inline + '">';
      else if (/^audio\//i.test(mime)) media = '<audio class="cw-media" controls preload="none" src="' + inline + '"></audio>';
      else if (/^video\//i.test(mime)) media = '<video class="cw-media" controls preload="metadata" src="' + inline + '"></video>';
      return '<div class="cw-file"><span class="cw-file-ico">' + cwIcon('file') + '</span><span class="cw-file-main">' +
        media +
        '<span class="cw-file-name" title="' + esc(file.name) + '">' + esc(file.name) + '</span><span class="cw-file-meta">' + esc(cwBytes(file.size)) + '</span></span>' +
        '<span class="cw-file-actions"><button class="btn ghost" data-cwpreview="' + esc(file.id) + '">Open</button>' +
        '<a class="btn ghost" href="/api/cowork/artifacts/' + encodeURIComponent(file.id) + '" download>Download</a></span></div>';
    }).join('') + '</div>';
  }

  function cwBindFileCards(root) {
    if (!root) return;
    root.querySelectorAll('[data-cwpreview]').forEach(function (button) {
      button.onclick = function () { cwPreviewFile(button.getAttribute('data-cwpreview')); };
    });
  }

  function cwPreviewFile(id) {
    var file = cwArtifact(id);
    if (!file) { toast('That file is no longer available', true); return; }
    // Chrome and Electron draw PDFs with the built-in viewer, and a bare sandbox
    // attribute blocks that plugin, so PDFs load unsandboxed. Everything else
    // stays sandboxed (allow-downloads keeps the fallback page's download link
    // working) on top of the server's Content-Security-Policy.
    var isPdf = /^application\/pdf/i.test(file.mime || '') || /\.pdf$/i.test(file.name || '');
    var modal = document.createElement('div');
    modal.className = 'modal cw-modal cw-doc-modal';
    modal.innerHTML = '<div class="box" style="display:flex;flex-direction:column"><div class="bar"><span>' + esc(file.name) + '</span><span style="flex:1"></span>' +
      '<a class="btn ghost" href="/api/cowork/artifacts/' + encodeURIComponent(file.id) + '" download>Download</a><button class="btn ghost" data-close>Close</button></div>' +
      '<iframe class="cw-doc-frame" title="Document preview"' + (isPdf ? '' : ' sandbox="allow-downloads"') + ' src="/api/cowork/artifacts/' + encodeURIComponent(file.id) + '/preview"></iframe></div>';
    document.body.appendChild(modal);
    modal.querySelector('[data-close]').onclick = function () { modal.remove(); };
  }

  function cwRequestHtml(request) {
    var agent = cwAgentById(request.agentId);
    var label = request.kind === 'permission' ? 'Permission request' : request.kind === 'question' ? 'Question' : 'Recommendation';
    var controls = '';
    if (request.kind === 'permission') controls = '<button class="btn dark" data-cwrequest="' + esc(request.id) + '" data-action="approve">Allow</button><button class="btn ghost" data-cwrequest="' + esc(request.id) + '" data-action="deny">Deny</button>';
    else if (request.kind === 'recommendation') controls = '<button class="btn dark" data-cwrequest="' + esc(request.id) + '" data-action="accept">Accept</button><button class="btn ghost" data-cwrequest="' + esc(request.id) + '" data-action="dismiss">Dismiss</button>';
    else controls = (request.options || []).map(function (option) { return '<button class="btn ghost" data-cwrequest="' + esc(request.id) + '" data-action="answer" data-response="' + esc(option) + '">' + esc(option) + '</button>'; }).join('') + '<input data-cwanswer="' + esc(request.id) + '" placeholder="Type your answer"><button class="btn dark" data-cwrequest="' + esc(request.id) + '" data-action="answer">Send</button>';
    return '<div class="cw-request"><div class="k">' + label + (agent ? ' · @' + esc(agent.name) : '') + '</div><div class="t">' + esc(request.title) + '</div>' +
      (request.detail ? '<div class="d">' + esc(request.detail) + '</div>' : '') + '<div class="cw-actions">' + controls + '</div></div>';
  }

  function cwRenderWork() {
    var cw = cwEnsure();
    var el = $('cwWork');
    if (!el) return;
    var open = (cw.requests || []).filter(function (request) { return request.status === 'open'; });
    var todos = (cw.todos || []).filter(function (todo) { return todo.status !== 'cancelled'; });
    var active = todos.filter(function (todo) { return todo.status === 'pending' || todo.status === 'in_progress' || todo.status === 'blocked'; });
    var todoHtml = todos.length ? '<details class="cw-todos"' + ((cw.todoOpen === undefined ? active.length > 0 : cw.todoOpen) ? ' open' : '') + '><summary>' + active.length + ' active · ' + todos.length + ' total todo' + (todos.length === 1 ? '' : 's') + '</summary>' + todos.map(function (todo) {
      var owner = cwAgentById(todo.agentId);
      return '<div class="cw-todo ' + esc(todo.status) + '" title="' + esc(todo.note || '') + '"><span>' + (todo.status === 'done' ? '✓' : todo.status === 'blocked' ? '!' : '○') + '</span><b>' + esc(todo.text) + '</b><span>· ' + esc(todo.status.replace('_', ' ')) + '</span><span class="cw-todo-owner">' + esc(owner ? '@' + owner.name : '') + '</span></div>';
    }).join('') + '</details>' : '';
    el.innerHTML = open.map(cwRequestHtml).join('') + todoHtml;
    var checklist = el.querySelector('.cw-todos');
    if (checklist) checklist.ontoggle = function () { cw.todoOpen = checklist.open; };
    el.querySelectorAll('[data-cwrequest]').forEach(function (button) {
      button.onclick = function () {
        var id = button.getAttribute('data-cwrequest');
        var action = button.getAttribute('data-action');
        var response = button.getAttribute('data-response') || '';
        var input = el.querySelector('[data-cwanswer="' + id + '"]');
        if (!response && input) response = input.value.trim();
        if (action === 'answer' && !response) { toast('Type an answer first', true); return; }
        button.disabled = true;
        api('/api/cowork/requests/' + encodeURIComponent(id), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: action, response: response }) })
          .then(function (d) {
            cw.requests = (cw.requests || []).map(function (request) { return request.id === id ? d.request : request; });
            if (d.agent) cw.agents = cw.agents.map(function (agent) { return agent.id === d.agent.id ? d.agent : agent; });
            cwRenderWork(); cwRenderInfo(); cwRenderRail(); cwPoll();
          }).catch(function (e) { toast(e.message, true); button.disabled = false; });
      };
    });
  }

  function cwRenderPending() {
    var cw = cwEnsure();
    var el = $('cwPending');
    if (!el) return;
    el.innerHTML = (cw.pendingFiles || []).map(function (file, i) { return '<span title="' + esc(file.name) + '">' + cwIcon('file') + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(file.name) + '</span><button data-cwremovefile="' + i + '" title="Remove">×</button></span>'; }).join('');
    el.querySelectorAll('[data-cwremovefile]').forEach(function (button) { button.onclick = function () { cw.pendingFiles.splice(Number(button.getAttribute('data-cwremovefile')), 1); cwRenderPending(); }; });
  }

  function cwAddFiles(files) {
    var cw = cwEnsure();
    var room = Math.max(0, 4 - (cw.pendingFiles || []).length);
    files.slice(0, room).forEach(function (file) {
      if (file.size > 20000000) { toast(file.name + ' is larger than 20 MB', true); return; }
      var reader = new FileReader();
      reader.onload = function () { cw.pendingFiles.push({ name: file.name, type: file.type || '', dataUrl: String(reader.result || '') }); cwRenderPending(); };
      reader.onerror = function () { toast('Could not read ' + file.name, true); };
      reader.readAsDataURL(file);
    });
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
    html += '<div class="cw-message-actions">' + button('copy', 'Copy', false);
    if (m.role === 'user') {
      html += button('edit', 'Edit', active);
      if (m.status === 'failed') html += button('retry', 'Retry', active);
    }
    html += button('reference', 'Reference', !!m.localOnly) + button('delete', 'Delete', active);
    if (m.role === 'user' && m.status) html += '<span role="status" class="cw-message-status ' + esc(m.status) + '">' + esc(m.localOnly && m.status === 'failed' ? 'Delivery unconfirmed' : m.status) + '</span>';
    if (m.revision) html += '<span class="cw-message-status">Edited</span>';
    return html + '</div>';
  }

  function cwBubbleHtml(m) {
    var conv = cwActiveConv();
    var members = conv ? cwConvMembers(conv) : [];
    var agent = m.agentId ? cwAgentById(m.agentId) : null;
    if (m.role === 'system') return m.text.length > 240 ? '<details class="cw-sys"><summary>' + esc(m.text.slice(0, 110)) + '…</summary><div class="cw-sys-detail">' + esc(m.text) + '</div>' + cwFilesHtml(m.artifactIds) + '</details>' : '<div class="cw-sys">' + esc(m.text) + cwFilesHtml(m.artifactIds) + '</div>';
    if (m.role === 'user') {
      var via = '';
      if (m.via === 'telegram') via = ' · Telegram' + (m.from ? ' — ' + esc(m.from) : '');
      else if (m.via === 'schedule') via = ' · schedule';
      return '<div class="cw-row me"><div class="cw-bubble"><div class="cw-meta"><span class="nm">You</span><span class="tg">' + via + ' · ' + cwTime(m.ts) + '</span></div>' + cwBody(m.text, members) + cwFilesHtml(m.artifactIds) + cwMessageActionsHtml(m) + '</div></div>';
    }
    var toolChips = '';
    if (m.tools && m.tools.length > 0) {
      toolChips = '<div class="cw-tools">' + m.tools.map(function (t) { return '<span class="' + (t.ok ? 'ok' : 'bad') + '" title="' + (t.ok ? 'completed' : 'failed') + '">' + esc(t.name) + '</span>'; }).join('') + '</div>';
    }
    return '<div class="cw-row">' + cwAva(agent || { name: m.agentName || 'agent', avatar: { color: '#8f80ff', shape: 'cube' } }) +
      '<div class="cw-bubble"><div class="cw-meta"><span class="nm">' + esc(m.agentName || 'agent') + '</span><span class="tg">' + cwTime(m.ts) + '</span></div>' +
      cwBody(m.text, members) + toolChips + cwFilesHtml(m.artifactIds) + cwMessageActionsHtml(m) + '</div></div>';
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
  function cwVideoEmbed(destination) {
    var url;
    try { url = new URL(String(destination)); } catch (e) { return ''; }
    if (!/^https?:$/.test(url.protocol)) return '';
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

  function cwBody(text, members) {
    // Pull pipe tables out of the raw text before escaping; anything left
    // behind is still escaped and line-broken below.
    var tables = [];
    var stripped = String(text || '').replace(/(^|\n)(\|[^\n]*\|\n\|[\s:|-]*\|(?:\n\|[^\n]*\|)+)/g, function (all, lead, block) {
      var html = cwTableHtml(block.replace(/^\n/, ''));
      if (!html) return all;
      tables.push(html);
      return lead + '\x00TABLE' + (tables.length - 1) + '\x00';
    });
    // A video link (YouTube/Vimeo) becomes a real inline player, like the main
    // chat. Splice placeholders in before escaping — same pattern as tables.
    var videos = [];
    var videoStripped = stripped.replace(/https?:\/\/[^\s<]+/g, function (all) {
      var embed = cwVideoEmbed(all);
      if (!embed) return all;
      // The player is an addition, not a replacement: keep the clickable link
      // too. This HTML is spliced in AFTER escaping (like tables), so it must be
      // built here with its own escaping and must never be escaped again.
      var link = '<a href="' + esc(all) + '" target="_blank" rel="noopener noreferrer">' + esc(all) + '</a>';
      var player = '<div class="cw-embed"><iframe src="' + esc(embed) + '" title="Embedded video" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"></iframe></div>';
      videos.push(link + player);
      return '\x00VIDEO' + (videos.length - 1) + '\x00';
    });
    var out = esc(videoStripped);
    out = out.replace(/\x60\x60\x60([\s\S]*?)\x60\x60\x60/g, function (all, code) { return '</span><span class="cw-code">' + String(code).replace(/^\n/, '') + '</span><span>'; });
    out = out.replace(/\x60([^\x60\n]+)\x60/g, function (all, code) { return '<code>' + code + '</code>'; });
    out = out.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    out = out.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    (members || []).forEach(function (m) {
      var safe = String(m.name).replace(new RegExp('[^A-Za-z0-9_.\\-]', 'g'), '');
      if (!safe) return;
      out = out.replace(new RegExp('@(' + safe + ')', 'gi'), '<span class="cw-mention">@$1</span>');
    });
    out = out.replace(/\x00TABLE(\d+)\x00/g, function (all, i) { return '</span>' + tables[Number(i)] + '<span>'; });
    out = out.replace(/\x00VIDEO(\d+)\x00/g, function (all, i) { return '</span>' + videos[Number(i)] + '<span>'; });
    out = out.replace(/\n/g, '<br>');
    return '<span>' + out + '</span>';
  }

  function cwRenderMsgs() {
    var wrap = $('cwMsgs');
    if (!wrap) return;
    var cw = cwEnsure();
    var nearBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 120;
    wrap.innerHTML = cw.msgs.map(function (m) { return cwBubbleHtml(m); }).join('') + '<div id="cwLive" hidden></div>';
    cwBindFileCards(wrap);
    wrap.querySelectorAll('[data-cwaction]').forEach(function (b) { b.onclick = function () {
      cwMessageAction(b.getAttribute('data-cwaction'), b.getAttribute('data-cwmessage'));
    }; });
    cwRenderProgress();
    if (nearBottom || cw.msgs.length <= 2) wrap.scrollTop = wrap.scrollHeight;
  }

  function cwRenderProgress() {
    var cw = cwEnsure();
    var wrap = $('cwMsgs');
    var live = $('cwLive');
    if (!wrap || !live) return;
    var nearBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 120;
    var ps = cw.busy ? ((cw.progresses && cw.progresses.length) ? cw.progresses : (cw.progress ? [cw.progress] : [])) : [];
    live.hidden = ps.length === 0;
    if (!ps.length) { live.innerHTML = ''; live._progressKey = null; return; }
    // Keep the avatar nodes alive across deltas so their animation never restarts.
    var key = JSON.stringify(ps.map(function (p) { var a = cwAgentById(p.agentId); return [p.agentId, p.agentName, a && a.avatar]; }));
    if (live._progressKey !== key) {
      live.innerHTML = ps.map(function (p) {
        return '<div class="cw-row">' + cwAva(cwAgentById(p.agentId)) + '<div class="cw-bubble"><div class="cw-meta"><span class="nm">' + esc(p.agentName) + '</span><span>working…</span></div><div class="cw-progress-text" style="white-space:pre-wrap"></div><div class="cw-tools cw-progress-tool"></div></div></div>';
      }).join('');
      live._progressKey = key;
    }
    var texts = live.querySelectorAll('.cw-progress-text');
    var tools = live.querySelectorAll('.cw-progress-tool');
    ps.forEach(function (p, i) {
      // Prefer the agent's streamed prose; when it has not said anything yet,
      // show WHAT it is doing (the command, file, or page) instead of a bare
      // "Working…", so the live bubble is never an unexplained spinner.
      texts[i].textContent = p.text || p.detail || 'Working…';
      var status = p.tool ? esc(p.tool + (p.toolOk === undefined ? ' — running…' : p.toolOk ? ' — completed' : ' — failed')) : '';
      var detail = p.detail && p.text ? esc(p.detail) : ''; // detail already shown as text when prose is absent
      var html = cwWebActivity(p) || [detail, status].filter(Boolean).join(' · ');
      if (tools[i]._html !== html) { tools[i].innerHTML = html; tools[i]._html = html; }
    });
    if (nearBottom) wrap.scrollTop = wrap.scrollHeight;
  }

  // Telegram + schedule cards are available on EVERY conversation: a DM
  // gateway is how an agent gets its own bot, groups link a shared room.
  function cwGatewayHtml(conv, kind) {
    var tg = conv.telegram || { enabled: false };
    var dc = conv.discord || { enabled: false };
    var sched = conv.schedule || { every: '', goal: '', enabled: false };
    var hint = kind === 'dm'
      ? 'Message your bot in a private Telegram chat (or add it to a group), send anything there, then press "Find chats". ' + esc(conv.title) + ' replies are mirrored back automatically.'
      : 'Add your bot to the Telegram group (or DM it), send any message there, then press "Find chats". Agent replies are mirrored back automatically.';
    return {
      html:
        '<h4>TELEGRAM GATEWAY</h4>' +
        '<div class="cw-card">' +
          '<div class="cw-check"><input type="checkbox" id="cwTgOn"' + (tg.enabled ? ' checked' : '') + '> <span>Connect this chat to Telegram</span></div>' +
          '<label>Bot token (from @BotFather)</label><input type="password" id="cwTgToken" value="" placeholder="' + (tg.tokenSaved ? 'Saved in this local app — leave blank to keep' : '123456:ABC-DEF...') + '">' +
          '<label>Telegram user or group chat ID</label>' +
          '<input type="text" id="cwTgChatId" value="' + esc(tg.chatId || '') + '" placeholder="Private: 123456789 · Group: -1001234567890">' +
          '<label>Or choose a recent chat</label>' +
          '<div style="display:flex;gap:6px"><select id="cwTgChat"><option value="' + esc(tg.chatId || '') + '">' + esc(tg.chatTitle || tg.chatId || '— pick a chat —') + '</option></select>' +
          '<button class="btn ghost" id="cwTgFind" style="flex:none">Find chats</button></div>' +
          '<div style="font-size:11px;color:var(--faint);margin-top:6px">For a private bot chat, your numeric Telegram user ID is also the chat ID. Group IDs are usually negative and may start with -100.</div>' +
          '<div style="font-size:11px;color:var(--faint);margin-top:6px">' + hint + '</div>' +
          '<div class="cw-actions"><button class="btn dark" id="cwTgSave">Save gateway</button></div>' +
        '</div>' +
        '<h4>DISCORD GATEWAY</h4>' +
        '<div class="cw-card">' +
          '<div class="cw-check"><input type="checkbox" id="cwDcOn"' + (dc.enabled ? ' checked' : '') + '> <span>Connect this chat to Discord</span></div>' +
          '<label>Bot token (from the Discord developer portal)</label><input type="password" id="cwDcToken" value="" placeholder="' + (dc.tokenSaved ? 'Saved in this local app — leave blank to keep' : 'MTIzNDU2Nzg...') + '">' +
          '<label>Or pick a server the bot is in</label>' +
          '<div style="display:flex;gap:6px"><select id="cwDcGuild"><option value="">— pick a server —</option></select>' +
          '<button class="btn ghost" id="cwDcFindGuilds" style="flex:none">Find servers</button></div>' +
          '<label>Text channel</label>' +
          '<div style="display:flex;gap:6px"><select id="cwDcChan"><option value="' + esc(dc.channelId || '') + '">' + esc(dc.channelName || dc.channelId || '— pick a channel —') + '</option></select>' +
          '<button class="btn ghost" id="cwDcFindChans" style="flex:none">Find channels</button></div>' +
          '<label>Or paste a channel ID</label><input type="text" id="cwDcChanId" value="' + esc(dc.channelId || '') + '" placeholder="123456789012345678">' +
          '<div style="font-size:11px;color:var(--faint);margin-top:6px">The bot needs the Message Content intent enabled in the developer portal. Agent replies and request cards are mirrored to the channel; reply approve / deny / accept / dismiss there to answer a card.</div>' +
          '<div class="cw-actions"><button class="btn dark" id="cwDcSave">Save gateway</button></div>' +
        '</div>' +
        '<h4>SCHEDULE</h4>' +
        '<div class="cw-card">' +
          '<label>Run every (e.g. 30m, 1h)</label><input type="text" id="cwSchEvery" value="' + esc(sched.every || '') + '" placeholder="1h">' +
          '<label>Prompt to inject on schedule</label><textarea id="cwSchGoal" rows="2">' + esc(sched.goal || '') + '</textarea>' +
          '<div class="cw-check"><input type="checkbox" id="cwSchOn"' + (sched.enabled ? ' checked' : '') + '> <span>Enabled</span></div>' +
          (sched.lastRunAt ? '<div style="font-size:11px;color:var(--faint);margin-top:6px">Last run: ' + esc(shortDate(sched.lastRunAt)) + '</div>' : '') +
          '<div class="cw-actions"><button class="btn dark" id="cwSchSave">Save schedule</button></div>' +
        '</div>',
      bind: function () {
        // cw must be the state object: the page also has a DOM element with
        // id="cw", and bare cw in this scope resolves to that element (or
        // throws), so saving the gateway used to crash on cw.convs.map.
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
        $('cwSchSave').onclick = function () {
          var body = { schedule: { every: $('cwSchEvery').value, goal: $('cwSchGoal').value, enabled: $('cwSchOn').checked } };
          api('/api/cowork/conversations/' + encodeURIComponent(conv.id), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
            .then(function (d) { cw.convs = cw.convs.map(function (c) { return c.id === d.conversation.id ? d.conversation : c; }); cwRenderChat(); cwRenderRail(); toast(d.conversation.schedule && d.conversation.schedule.enabled ? 'Schedule saved' : 'Schedule disabled'); })
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

  function cwFoldersHtml(conv) {
    var cw = cwEnsure();
    var folders = (cw.folders && cw.folders.length ? cw.folders : conv.folders) || [];
    return '<h4>TAGGED FOLDERS</h4><div class="cw-card">' +
      (folders.length
        ? folders.map(function (folder) {
            return '<div class="cw-mrow"><span class="ico">' + cwIcon('folder') + '</span><span class="nm" title="' + esc(folder.path) + '">' + esc(folder.label) + ' <span class="tg">' + esc(folder.path) + '</span></span>' +
              '<button data-untag="' + esc(folder.id) + '" title="Untag folder">' + cwIcon('close') + '</button></div>';
          }).join('')
        : '<div class="meta">No folders tagged yet. Tag a project folder and the team works inside it.</div>') +
      '<button class="btn ghost" id="cwTagFolder" style="width:100%;margin-top:6px">Tag folder</button></div>';
  }

  function cwBindFolders(el, conv) {
    el.querySelectorAll('[data-untag]').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-untag');
        api('/api/cowork/conversations/' + encodeURIComponent(conv.id) + '/folders/' + encodeURIComponent(id), { method: 'DELETE' })
          .then(function () {
            cwEnsure().folders = (cwEnsure().folders || []).filter(function (folder) { return folder.id !== id; });
            cwRenderInfo();
            toast('Folder untagged');
          })
          .catch(function (e) { toast(e.message, true); });
      };
    });
    var tag = $('cwTagFolder');
    if (tag) tag.onclick = function () { cwFolderModal(conv); };
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
          cwEnsure().folders = (cwEnsure().folders || []).filter(function (folder) { return folder.id !== d.folder.id; }).concat([d.folder]);
          cwRenderInfo();
          toast('Folder tagged: ' + d.folder.label);
        })
        .catch(function (e) { toast(e.message, true); });
    };
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
      return '<div class="cw-mission" data-mission="' + esc(m.id) + '">' +
        '<div class="t">' + esc(m.goal) + '</div>' +
        '<div class="d">' + statusChip + ' <span class="tg">' + (agent ? '@' + esc(agent.name) : '') + ' · session ' + m.turns + '/' + m.maxTurns + '</span>' +
        (m.budgetSpentUsd === undefined ? '' : ' <span class="tg">· $' + Number(m.budgetSpentUsd).toFixed(2) + (m.budget ? ' of $' + Number(m.budget.maxCostUsd).toFixed(2) : '') + ' spent</span>') +
        '</div>' +
        (m.progress ? '<div class="p">' + esc(m.progress.slice(0, 220)) + '</div>' : '') +
        (m.result ? '<div class="p ok">' + esc(m.result.slice(0, 300)) + '</div>' : '') +
        (m.blockers ? '<div class="p warn">' + esc(m.blockers.slice(0, 220)) + '</div>' : '') +
        (m.status === 'running' || m.status === 'blocked' ? '<button class="btn ghost" data-cancelmission="' + esc(m.id) + '">Cancel mission</button>' : '') +
        (m.status === 'failed' && m.stoppedForBudget ? '<button class="btn ghost" data-raisemission="' + esc(m.id) + '">Add $5 and resume</button>' : '') +
        '</div>';
    }).join('');
    return '<h4>MISSIONS</h4>' +
      (rows ? rows : '<div class="cw-empty-note">No missions yet. Give a teammate a goal and it works autonomously in sessions until done, blocked, or out of budget.</div>') +
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

  function cwRenderInfo() {
    var cw = cwEnsure();
    var conv = cwActiveConv();
    var el = $('cwInfo');
    if (!el) return;
    if (!conv) { el.innerHTML = ''; return; }
    var members = cwConvMembers(conv);
    if (conv.kind === 'dm') {
      var a = members[0];
      if (!a) { el.innerHTML = ''; return; }
      var gw = cwGatewayHtml(conv, 'dm');
      el.innerHTML =
        '<h4>TEAMMATE</h4>' +
        '<div class="cw-card"><div class="cw-mrow">' + cwAva(a, 44) + '<span class="nm">' + esc(a.name) + ' <span class="tg">' + esc(a.tagline || '') + '</span></span></div>' +
        '<div style="font-size:12px;color:var(--muted);margin-top:8px;white-space:pre-wrap;max-height:180px;overflow-y:auto">' + esc(a.systemPrompt.slice(0, 600)) + (a.systemPrompt.length > 600 ? '…' : '') + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">' +
          '<span class="chip">' + esc((a.provider ? a.provider + ' / ' : '') + (a.model || 'default model')) + '</span>' +
          (a.effort ? '<span class="chip">effort: ' + esc(a.effort) + '</span>' : '') +
          (a.chiefOfStaff ? '<span class="chip" style="color:var(--evidence);display:inline-flex;align-items:center;gap:4px">' + cwIcon('crown') + 'chief of staff</span>' : '') +
          (a.allowShell ? '<span class="chip" style="color:var(--amber)">shell allowed</span>' : '') +
          (a.allowWrites ? '<span class="chip" style="color:var(--amber)">writes allowed</span>' : '') +
          (a.allowConfig ? '<span class="chip" style="color:var(--amber)">tool setup</span>' : '') +
          (a.useHostComputer ? '<span class="chip ok">using my computer</span>' : '') +
        '</div>' +
        (a.skills && a.skills.length ? '<div style="margin-top:8px;font-size:11.5px;color:var(--muted)">Skills: ' + esc(a.skills.join(', ')) + '</div>' : '') +
        '<div style="margin-top:10px;font-size:11.5px;color:var(--muted);display:flex;align-items:center;gap:8px">Persistent memory: <b>' + ((cw.memoryCounts || {})[a.id] || 0) + '</b> facts <button class="btn ghost" id="cwMemClear" style="padding:2px 8px;font-size:11px">Clear</button></div>' +
        '<div class="cw-actions"><button class="btn ghost" id="cwEditAgent">Edit profile</button></div></div>' +
        cwMissionsHtml(conv) +
        cwComputerHtml(a) + cwFoldersHtml(conv) + gw.html +
        '<div class="cw-actions"><button class="btn red" id="cwDelAgent">Delete teammate</button></div>';
      gw.bind();
      cwBindMissions(el, conv);
      cwBindComputers(el);
      cwBindFolders(el, conv);
      $('cwMemClear').onclick = function () {
        if (!confirm('Erase everything ' + a.name + ' has remembered across conversations?')) return;
        api('/api/cowork/agents/' + encodeURIComponent(a.id) + '/memory', { method: 'DELETE' }).then(function () {
          cw.memoryCounts[a.id] = 0;
          cwRenderInfo();
          toast('Memory cleared');
        }).catch(function (e) { toast(e.message, true); });
      };
      $('cwEditAgent').onclick = function () { cwAgentModal(a); };
      $('cwDelAgent').onclick = function () {
        if (!confirm('Delete ' + a.name + '? Their DM and profile are removed.')) return;
        api('/api/cowork/agents/' + encodeURIComponent(a.id), { method: 'DELETE' }).then(function () {
          cw.active = null; cw.msgs = []; cwLoad(true);
        }).catch(function (e) { toast(e.message, true); });
      };
      return;
    }
    // Group panel
    var gw = cwGatewayHtml(conv, 'group');
    el.innerHTML =
      '<h4>MEMBERS</h4>' +
      '<div class="cw-card">' + members.map(function (m) {
        return '<div class="cw-mrow">' + cwAva(m, 26) + '<span class="nm">@' + esc(m.name) + ' <span class="tg">' + esc(m.tagline || '') + '</span></span>' +
          '<button class="crown' + (conv.chiefId === m.id ? ' on' : '') + '" data-chief="' + esc(m.id) + '" title="Make chief of staff">' + cwIcon('crown') + '</button>' +
          '<button data-remove="' + esc(m.id) + '" title="Remove from group">' + cwIcon('close') + '</button></div>';
      }).join('') +
      '<button class="btn ghost" id="cwAddMember" style="width:100%;margin-top:6px">Add member</button></div>' +
      cwMissionsHtml(conv) + members.map(cwComputerHtml).join('') + cwFoldersHtml(conv) + gw.html +
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
    gw.bind();
    cwBindMissions(el, conv);
    cwBindComputers(el);
    cwBindFolders(el, conv);
    $('cwDelConv').onclick = function () {
      if (!confirm('Delete this chat and its whole transcript?')) return;
      api('/api/cowork/conversations/' + encodeURIComponent(conv.id), { method: 'DELETE' }).then(function () {
        cw.active = null; cw.msgs = []; cwStopPoll(); cwLoad(true);
      }).catch(function (e) { toast(e.message, true); });
    };
  }

  function cwComputerHtml(agent) {
    if (agent.useHostComputer) {
      return '<div class="cw-card"><h4>' + esc(agent.name) + ' · COMPUTER</h4><div class="chip ok">My computer</div>' +
        '<p style="font-size:11.5px;color:var(--muted)">Uses the Agent Gitu workspace on this computer directly. Docker is not required. Shell and file changes still follow this teammate’s permissions.</p></div>';
    }
    var computer = (cwEnsure().computers || []).filter(function (c) { return c.agentId === agent.id; })[0] || { state: 'stopped' };
    return '<div class="cw-card"><h4>' + esc(agent.name) + ' · COMPUTER</h4><div class="chip">' + esc(computer.state) + '</div>' +
      '<p style="font-size:11.5px;color:var(--muted)">Private Linux files, shell and browser. Files and browser sessions persist when stopped.</p>' +
      (computer.error ? '<p style="font-size:11.5px;color:var(--err)">' + esc(computer.error) + '</p>' : '') +
      '<div class="cw-actions"><button class="btn ghost" data-computer="' + esc(agent.id) + '" data-action="start">Start</button>' +
      '<button class="btn ghost" data-computer="' + esc(agent.id) + '" data-action="stop">Stop</button>' +
      '<button class="btn ghost" data-computer="' + esc(agent.id) + '" data-action="screenshot">View browser</button></div>' +
      '<div data-screen="' + esc(agent.id) + '"></div></div>';
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
    cw.queued = d.queued || 0;
    var missionsChanged = JSON.stringify(cw.missions || []) !== JSON.stringify(d.missions || []);
    cw.missions = d.missions || [];
    var artifactsChanged = JSON.stringify(cw.artifacts || []) !== JSON.stringify(d.artifacts || []);
    var workChanged = JSON.stringify(cw.todos || []) !== JSON.stringify(d.todos || []) || JSON.stringify(cw.requests || []) !== JSON.stringify(d.requests || []);
    var threadsChanged = JSON.stringify(cw.threads || []) !== JSON.stringify(d.threads || []);
    var foldersChanged = JSON.stringify(cw.folders || []) !== JSON.stringify(d.folders || []);
    var widgetsChanged = JSON.stringify(cw.widgets || []) !== JSON.stringify(d.widgets || []);
    cw.artifacts = d.artifacts || [];
    cw.todos = d.todos || [];
    cw.requests = d.requests || [];
    if (d.threads) cw.threads = d.threads;
    if (d.folders) cw.folders = d.folders;
    if (d.widgets) cw.widgets = d.widgets;
    if (rosterChanged || widgetsChanged) cwRenderRail();
    if (threadsChanged) cwRenderThreads();
    if (rosterChanged) cwRenderMembers();
    if (added || rosterChanged || artifactsChanged) cwRenderMsgs(); else cwRenderProgress();
    if (workChanged || rosterChanged) cwRenderWork();
    cwRenderTyping();
    if (missionsChanged) { cwRenderMissionBadge(); cwRenderInfo(); }
    if (rosterChanged || foldersChanged || (wasBusy && !cw.busy)) cwRenderInfo();
  }

  function cwPoll() {
    var cw = cwEnsure();
    var conv = cwActiveConv();
    if (!conv || S.active !== 'cowork') return Promise.resolve();
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

  function cwRenderTyping() {
    var cw = cwEnsure();
    var el = $('cwTyping');
    var btn = $('cwSend');
    if (!el || !btn) return;
    document.querySelectorAll('[data-cw-avatar]').forEach(function (node) {
      var id = node.getAttribute('data-cw-avatar');
      var member = cwAgentById(id);
      node.classList.toggle('working', Boolean(cw.busy && member && (cw.working === member.name || (cw.progresses || []).some(function (p) { return p.agentId === id; }))));
    });
    if (cw.busy) {
      var parallel = (cw.progresses || []).map(function (p) { return p.agentName; });
      var agent = null;
      for (var i = 0; i < cw.agents.length; i++) if (cw.working && cw.agents[i].name === cw.working) agent = cw.agents[i];
      el.innerHTML = '<span class="dots"><i></i><i></i><i></i></span> ' + (agent ? cwAva(agent, 18) + ' <b>' + esc(agent.name) + '</b> is thinking…' : 'the team is thinking…');
      if (parallel.length > 1) el.textContent = parallel.length + ' teammates working in parallel: ' + parallel.join(', ');
      else if (cw.progress) el.innerHTML = '<span class="cw-live-status busy">' + esc(cw.progress.agentName) + '</span> ' + (cwWebActivity(cw.progress) || esc(cw.progress.tool ? cw.progress.tool.replace(/_/g, ' ') : 'is writing…'));
      if (cw.queued) el.innerHTML += '<span>' + cw.queued + ' queued</span>';
      el.hidden = false;
      btn.classList.add('stop');
      btn.innerHTML = cwIcon('stop');
      btn.title = 'Stop the team';
      btn.onclick = cwStopRun;
    } else {
      el.hidden = true;
      btn.classList.remove('stop');
      btn.innerHTML = cwIcon('send');
      btn.title = 'Send (Enter)';
      btn.onclick = cwSend;
    }
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

  function cwAgentModal(agent) {
    var cw = cwEnsure();
    var isEdit = Boolean(agent && agent.id);
    var d = {
      name: agent ? agent.name : '',
      tagline: agent ? agent.tagline : '',
      systemPrompt: agent ? agent.systemPrompt : '',
      avatar: {
        color: agent && agent.avatar && agent.avatar.color ? agent.avatar.color : CW_COLORS[0],
        shape: agent && agent.avatar && agent.avatar.shape ? agent.avatar.shape : CW_SHAPES[0]
      },
      provider: agent ? (agent.provider || '') : '',
      model: agent ? (agent.model || '') : '',
      effort: agent ? (agent.effort || '') : '',
      skills: agent ? (agent.skills || []).slice() : ['browser-workflow'],
      allowShell: agent ? Boolean(agent.allowShell) : false,
      allowWrites: agent ? Boolean(agent.allowWrites) : false,
      allowConfig: agent ? Boolean(agent.allowConfig) : false,
      useHostComputer: agent ? Boolean(agent.useHostComputer) : true,
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
            '<div class="cw-shapes" id="cwAmShapes" role="group" aria-label="Bot character">' + CW_SHAPES.map(function (s) { return '<button type="button" data-shape="' + s + '" aria-pressed="' + (s === d.avatar.shape) + '"' + (s === d.avatar.shape ? ' class="cur"' : '') + '><span class="cw-shape-preview">' + cwAvaImg({ shape: s, color: d.avatar.color }) + '</span>' + CW_CHARACTER_NAMES[s] + '</button>'; }).join('') + '</div>' +
            '<div class="cw-colors" id="cwAmColors">' + CW_COLORS.map(function (c) { return '<button type="button" data-color="' + c + '" style="background:' + c + '"' + (c === d.avatar.color ? ' class="cur"' : '') + ' aria-label="color ' + c + '"></button>'; }).join('') + '</div>' +
            '<div class="cw-avhint">A little personality, always in motion. Watch your bot bounce, blink and wiggle while it works.</div>' +
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
          '<label><input type="checkbox" id="cwAmHost"' + (d.useHostComputer ? ' checked' : '') + '> My computer — no Docker required (uncheck for a private computer)</label>' +
        '</div>' +
        '<div class="cw-note">“Use my computer” gives this teammate direct access to the Agent Gitu workspace on this Windows computer, so Docker does not need to be started. Shell, writes and tool setup remain opt-in per agent.</div>' +
      '</div>' +
      '<div class="cw-foot"><button class="btn ghost" id="cwAmDel"' + (isEdit ? '' : ' hidden') + '>Delete</button><span style="flex:1"></span><button class="btn dark" id="cwAmSave">' + (isEdit ? 'Save changes' : 'Create teammate') + '</button></div></div>';
    document.body.appendChild(modal);
    function refreshPreview() {
      var wrap = modal.querySelector('#cwAmAvaWrap');
      if (wrap) wrap.innerHTML = cwAvaImg(d.avatar);
      modal.querySelectorAll('[data-shape]').forEach(function (b) { b.querySelector('.cw-shape-preview').innerHTML = cwAvaImg({ shape: b.getAttribute('data-shape'), color: d.avatar.color }); });
    }
    modal.querySelector('#cwAmWork').onclick = function () {
      var working = this.getAttribute('aria-pressed') !== 'true';
      this.setAttribute('aria-pressed', String(working));
      this.textContent = working ? 'Preview idle animation' : 'Preview working animation';
      modal.querySelector('#cwAmAvaWrap').classList.toggle('working', working);
    };
    modal.querySelectorAll('[data-shape]').forEach(function (b) {
      b.onclick = function () {
        d.avatar.shape = b.getAttribute('data-shape');
        modal.querySelectorAll('[data-shape]').forEach(function (x) { x.classList.remove('cur'); x.setAttribute('aria-pressed', 'false'); });
        b.classList.add('cur');
        b.setAttribute('aria-pressed', 'true');
        refreshPreview();
      };
    });
    modal.querySelectorAll('[data-color]').forEach(function (b) {
      b.onclick = function () {
        d.avatar.color = b.getAttribute('data-color');
        modal.querySelectorAll('[data-color]').forEach(function (x) { x.classList.remove('cur'); });
        b.classList.add('cur');
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
        useHostComputer: $('cwAmHost').checked,
        chiefOfStaff: $('cwAmChief').checked
      };
      api('/api/cowork/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (res) {
          modal.remove();
          var cw2 = cwEnsure();
          var found = false;
          cw2.agents = cw2.agents.map(function (a) { if (a.id === res.agent.id) { found = true; return res.agent; } return a; });
          if (!found) cw2.agents.push(res.agent);
          cwRenderRail();
          toast(isEdit ? 'Teammate updated' : res.agent.name + ' joined the team');
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
