import { PROJECT_PREFERENCES_JS } from './ui-project-preferences.js';
import { plushCharacterHtml } from './ui-characters.js';
// Compact home navigation with the same locally bundled Cowork companion.
export const HOME_CSS = String.raw`
  body:has(.home-sky) .sb,body:has(.home-sky) .topbar,body:has(.home-sky) .vresize,body:has(.home-sky) .side-fab,body:has(.home-sky) #mascotWrap,body:has(.home-sky) .mobile-nav-btn { display:none!important; }
  /* Share Cowork's exact calm framed-sheet design language across Code Home and Code Runs. */
  .home.home-sky { --home-sidebar-surface:var(--sidebar); position:relative; background:var(--bg); color:var(--text); padding:96px 36px 96px 36px; gap:28px; width:100%; justify-content:safe center; }
  .home.home-sky::before { content:''; position:fixed; inset:10px; background:var(--card); border:1px solid var(--border); border-radius:24px; box-shadow:var(--shadow); pointer-events:none; z-index:0; }
  .home.home-sky > .home-main { position:relative; z-index:1; margin:0; }
  .run.run-chat.code-workspace { --home-sidebar-surface:var(--sidebar); position:relative; padding:10px; background:var(--bg); }
  .run.run-chat.code-workspace::before { display:none; content:none; }
  .run.run-chat.code-workspace > .run-main { background:var(--card); border:1px solid var(--border); border-radius:24px; box-shadow:var(--shadow); overflow:hidden; padding-top:0; }
  .run.run-chat.code-workspace > .run-main > .stream { position:relative; z-index:1; }
  :root[data-theme=light] .run.run-chat.code-workspace { --home-sidebar-surface:var(--sidebar); background:var(--bg); }
  .run.code-workspace .cw-page-nav { position:fixed; inset:calc(22px + env(safe-area-inset-top, 0px)) auto auto 50%; transform:translateX(-50%); display:flex; justify-content:center; pointer-events:none; z-index:14; }
  .run.code-workspace .coding-checkpoints { margin:0 0 16px; }
  .run.code-workspace #mainChatHistory { display:none; }
  .home-main { position:relative; width:min(680px,100%); display:flex; flex-direction:column; gap:24px; flex:none; }
  .home-sky .home-main > .home-brand { position:static; }
  :root[data-theme=light] .home.home-sky { --home-sidebar-surface:var(--sidebar); background:var(--bg); }
  .home-sky .cw-page-nav { position:fixed; top:calc(22px + env(safe-area-inset-top, 0px)); left:50%; transform:translateX(-50%); z-index:14; display:flex; justify-content:center; pointer-events:none; }
  .home-sky .cw-top-nav { position:static; transform:none; display:inline-flex; align-items:center; gap:2px; padding:4px; border-radius:var(--radius-full, 9999px); pointer-events:auto; width:auto; max-width:none; background:var(--card2); border:1px solid var(--border); box-shadow:none; }
  :root[data-theme=dark] .home-sky .cw-top-nav { background:var(--card2); border-color:var(--border); box-shadow:none; }
  .home-sky .cw-top-nav button { display:inline-flex; align-items:center; justify-content:center; gap:7px; min-height:34px; padding:0 14px; border:0; border-radius:var(--radius-full, 9999px); background:transparent; color:var(--muted); font:inherit; font-size:12.5px; font-weight:500; cursor:pointer; white-space:nowrap; user-select:none; transition:background-color .18s ease,color .18s ease,box-shadow .18s ease,transform .14s cubic-bezier(.16,1,.3,1); }
  .home-sky .cw-top-nav button > span:not(.cw-chat-face) { display:inline!important; }
  .home-sky .cw-top-nav button:hover { background:var(--hover)!important; color:var(--text); }
  .home-sky .cw-top-nav button:active { transform:scale(.96); }
  .home-sky .cw-top-nav button[aria-pressed=true] { background:var(--dark)!important; color:var(--bg)!important; font-weight:600; box-shadow:none; }
  .home-sky .cw-top-nav button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .home-sky .cw-top-nav button > svg { width:16px; height:16px; flex:none; }
  :is(.home-sky,.run-chat) .cw-top-nav .cw-chat-face { display:inline-flex!important; align-items:center; justify-content:center; flex:none; width:26px; height:26px; }
  :is(.home-sky,.run-chat) .cw-top-nav .cw-chat-face .cw-ava { position:relative; width:26px!important; height:26px!important; border-radius:8px!important; overflow:visible!important; display:inline-flex; align-items:center; justify-content:center; background:transparent!important; box-shadow:none!important; }
  :is(.home-sky,.run-chat) .cw-top-nav .cw-chat-face .cw-ava .cw-plush { width:100%; height:100%; display:flex; align-items:center; justify-content:center; transform:none; }
  :is(.home-sky,.run-chat) .cw-top-nav .cw-chat-face .cw-ava img { position:relative!important; width:100%!important; height:100%!important; max-width:100%!important; left:0!important; top:0!important; object-fit:contain!important; transform:none!important; }
  :is(.home-sky,.run-chat) .cw-top-nav .cw-chat-face .cw-ava svg.cw-blink-overlay { position:absolute!important; inset:0!important; width:100%!important; height:100%!important; }
  /* Top-left Sessions/Projects drawer trigger & top-right Tools popover matching Cowork pixel-for-pixel */
  .home-menu-trigger { position:fixed; top:calc(22px + env(safe-area-inset-top, 0px)); left:22px; z-index:14; display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px; padding:0; border:1px solid var(--border); border-radius:50%; background:var(--card); color:var(--muted); cursor:pointer; box-shadow:var(--shadow); transition:background .18s ease,color .18s ease,border-color .18s ease,transform .14s cubic-bezier(.16,1,.3,1); }
  .home-menu-trigger:hover { color:var(--text); border-color:var(--border2); background:var(--hover); }
  .home-menu-trigger:active { transform:scale(.96); }
  .home-menu-trigger:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .home-menu-trigger svg { width:16px; height:16px; }
  .code-tools-toggle { position:fixed; top:calc(22px + env(safe-area-inset-top, 0px)); right:22px; z-index:14; display:inline-flex; align-items:center; justify-content:center; width:36px; height:36px; padding:0; border:1px solid var(--border); border-radius:50%; background:var(--card); color:var(--muted); cursor:pointer; box-shadow:var(--shadow); transition:background .18s ease,color .18s ease,border-color .18s ease,transform .14s cubic-bezier(.16,1,.3,1); }
  .code-tools-toggle:hover { color:var(--text); border-color:var(--border2); background:var(--hover); }
  .code-tools-toggle:active { transform:scale(.96); }
  .code-tools-toggle:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .code-tools-toggle svg { width:17px; height:17px; }
  .home-sky .home-brand { width:min(680px,100%); margin:0; padding:0; text-align:center; }
  .home-sky .home-brand-lockup { flex-direction:column; justify-content:center; align-items:center; gap:12px; }
  .home-sky .home-character,.home-sky .cw-plush.home-character { width:64px; height:64px; animation:none; flex:none; }
  .home-sky .home-brand h1 { font-size:28px; line-height:1.2; letter-spacing:-.035em; justify-content:center; text-align:center; color:var(--text); font-weight:600; }
  .home-sky .home-brand-copy { color:var(--muted); margin:6px 0 0; font-size:13.5px; text-align:center; }
  /* Slide-over navigation drawer (closed by default on desktop & mobile so Code matches Cowork's calm canvas). */
  .home-sidebar { display:none; position:fixed; inset:10px auto 10px 10px; z-index:50; width:min(296px, 86vw); flex-direction:column; padding:0; border:1px solid var(--border); border-radius:20px; background:var(--sidebar); box-shadow:var(--shadow-float); overflow:hidden; }
  .home-nav-backdrop { display:none; }
  .home-sky[data-nav-open=true] .home-sidebar { display:flex; }
  .home-sky[data-nav-open=true] .home-nav-backdrop { display:block; position:fixed; inset:0; background:var(--overlay); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px); z-index:49; }
  .home-sidebar-brand { display:flex; align-items:center; gap:10px; padding:14px 14px 13px; border-bottom:1px solid var(--border); margin-bottom:10px; }
  .home-sidebar-brand img { width:28px; height:28px; padding:4px; border-radius:var(--radius-inner, 8px); background:var(--dark); object-fit:contain; flex:none; }
  .home-sidebar-brand-copy { display:grid; gap:1px; min-width:0; }
  .home-sidebar-brand-title { font-size:14.5px; font-weight:650; letter-spacing:-.02em; color:var(--text); line-height:1.2; }
  .home-sidebar-brand-sub { font-size:11px; font-weight:500; color:var(--muted); line-height:1.2; }
  .home-sidebar-section-label { font-size:11px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; color:var(--faint); padding:6px 10px 4px; margin:0; }
  .home-sidebar-body { display:flex; flex-direction:column; flex:1; min-height:0; padding:0 10px; overflow:hidden; }
  .home-sidebar #homeCollapse { width:28px; min-height:28px; padding:4px; margin-left:auto; justify-content:center; flex:none; border-radius:var(--radius-full, 9999px); }
  .home-sidebar button { display:flex; align-items:center; gap:10px; width:100%; min-height:36px; padding:7px 12px; color:var(--muted); text-align:left; border-radius:var(--radius-full, 9999px); font-size:13px; font-weight:500; transition:background-color .14s ease,color .14s ease; }
  .home-sidebar button svg { width:16px; height:16px; flex:none; color:var(--faint); transition:color .14s ease; }
  .home-sidebar button:hover { background:var(--hover); color:var(--text); }
  .home-sidebar button:hover svg { color:var(--text); }
  .home-sidebar-search { display:flex; align-items:center; gap:8px; background:var(--card)!important; border:1px solid var(--border2)!important; border-radius:var(--radius-full, 9999px)!important; color:var(--muted); min-height:36px; padding:0 12px; margin:0 0 10px; font-size:12.5px; box-shadow:var(--shadow); }
  .home-sidebar-search:focus-within { border-color:var(--accent)!important; color:var(--text); }
  .home-sidebar-search svg { width:15px; height:15px; flex:none; color:var(--faint); }
  .home-sidebar-search input[type="search"] { flex:1; min-width:0; border:0!important; background:transparent!important; color:var(--text); font:inherit; font-size:12.5px; padding:6px 0!important; min-height:28px!important; outline:none; box-shadow:none!important; }
  .home-sidebar-hits { display:grid; gap:2px; margin:0 0 10px; padding:4px; border:1px solid var(--border); border-radius:14px; background:var(--card); max-height:180px; overflow:auto; }
  .home-sidebar-hits[hidden] { display:none!important; }
  .home-sidebar-hit { display:grid; gap:2px; padding:6px 10px!important; min-height:0!important; border-radius:10px!important; font-size:11.5px!important; }
  .home-sidebar-hit strong { font-size:12px; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .home-sidebar-hit small { font-size:11px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .home-session-toolbar { display:flex; align-items:center; justify-content:space-between; gap:4px; padding:2px 4px 4px 12px; }
  .home-sidebar .home-session-toolbar button { width:auto; min-height:26px; padding:3px 9px; font-size:11px; border-radius:999px; gap:4px; }
  .home-session-item { display:flex; align-items:center; gap:2px; min-width:0; }
  .home-sidebar .home-session-del { width:auto; min-height:26px; padding:2px 6px; font-size:10.5px; color:var(--faint); flex:none; border-radius:999px; justify-content:center; }
  .home-sidebar .home-session-del:hover { color:var(--err,#f87171); background:var(--hover); }
  .home-sidebar nav { display:grid; gap:2px; }
  .home-agent-pill { margin-left:auto; padding:2px 8px; border-radius:var(--radius-full, 9999px); background:var(--selection); color:var(--accent); font-size:11px; font-weight:600; max-width:96px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .home-agent-pill:empty { display:none; }
  .home-groups { width:100%; margin-bottom:14px; }
  .home-groups-heading { display:flex; align-items:center; justify-content:space-between; gap:6px; padding:0 2px; margin-bottom:4px; }
  .home-groups-heading h2 { margin:0; min-width:0; flex:1; }
  .home-sidebar .home-groups-heading #homeGroupsNav { min-height:28px; padding:4px 8px; font-size:11px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; color:var(--faint); }
  .home-sidebar .home-groups-heading #homeNewGroup { width:28px; min-height:28px; padding:5px; justify-content:center; flex:none; }
  .home-group-list { display:grid; gap:2px; }
  .home-sidebar .home-group-open { gap:8px; padding:7px 10px; min-height:34px; color:var(--text); }
  .home-group-open.is-active { background:var(--selection); color:var(--accent); font-weight:600; }
  .home-group-copy { display:grid; gap:2px; min-width:0; flex:1; }
  .home-group-copy strong { font-size:12.5px; font-weight:550; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .home-group-copy small { font-size:10.5px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .home-group-empty { font-size:11.5px; color:var(--muted); margin:2px 10px 6px; line-height:1.45; }
  .home-session-dd { margin:0; }
  .home-session-dd > summary { display:flex; align-items:center; gap:10px; width:100%; min-height:36px; padding:7px 12px; color:var(--muted); border-radius:var(--radius-full, 9999px); font-size:13px; font-weight:500; cursor:pointer; list-style:none; transition:background-color .14s ease,color .14s ease; }
  .home-session-dd > summary::-webkit-details-marker { display:none; }
  .home-session-dd > summary::after { content:'›'; margin-left:4px; color:var(--faint); transform:rotate(90deg); transition:transform .14s ease; }
  .home-session-dd[open] > summary::after { transform:rotate(-90deg); }
  .home-session-dd > summary:hover { background:var(--hover); color:var(--text); }
  .home-session-dd > summary svg { width:16px; height:16px; flex:none; color:var(--faint); }
  .home-session-count { margin-left:auto; font-size:10.5px; color:var(--faint); font-weight:600; }
  .home-session-count:empty { display:none; }
  .home-session-list { display:grid; gap:1px; max-height:240px; overflow:auto; padding:2px 0 6px 12px; }
  .home-sidebar .home-session-row { display:flex; align-items:center; gap:8px; width:100%; min-height:30px; padding:5px 10px; border-radius:999px; color:var(--muted); font-size:12px; font-weight:500; text-align:left; }
  .home-sidebar .home-session-row:hover { background:var(--hover); color:var(--text); }
  .home-sidebar .home-session-row.is-active { background:var(--selected); color:var(--text); font-weight:600; }
  .home-session-label { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .home-session-empty { padding:4px 8px 6px; font-size:11.5px; color:var(--faint); margin:0; line-height:1.45; }
  .home-sidebar-foot { margin-top:auto; display:grid; gap:2px; padding:10px 10px 12px; border-top:1px solid var(--border); }
  .home-composer-wrap { width:min(680px,100%); margin:0; }
  .home-sky .composer-topline { padding:0 6px 8px; }
  .home-project-label { display:none; }
  .home-attachment-policy { margin:0 10px 6px; color:var(--muted); font-size:11px; line-height:1.5; }
  .home-sky .composer-workspace { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 10px; border-radius:999px; border:1px solid var(--border); background:var(--card2); color:var(--text); max-width:min(260px,100%); min-width:0; flex:0 1 auto; font-size:12px; font-weight:600; box-shadow:none; transition:border-color .15s, background .15s; }
  .home-sky .composer-workspace:hover { border-color:var(--border2); background:var(--hover); }
  .home-sky .composer-workspace svg { width:14px; height:14px; color:var(--accent); flex:none; }
  .home-sky .composer-workspace::after { content:'▾'; color:var(--muted); font-size:10px; margin-left:1px; }
  .home-sky .composer { width:100%; padding:10px 12px; border:1.5px solid var(--border2); border-radius:var(--radius-chat, 28px); background:var(--card2); box-shadow:var(--shadow-float); transition:background-color .18s ease,border-color .18s ease,box-shadow .18s ease; }
  .home-sky .composer:focus-within { background:var(--card); border-color:var(--dark); box-shadow:var(--shadow-float); }
  .home-sky .composer textarea { min-height:58px; padding:8px 8px; font-size:14.5px; }
  .home-sky .composer-bar { padding:4px; gap:8px; align-items:center; }
  #view .home-sky .composer .send { display:inline-flex; align-items:center; justify-content:center; padding:0; width:32px; height:32px; border-radius:var(--radius-full, 9999px); flex:none; }
  #view .home-sky .composer .send:not(.stop):not(:disabled) { background:var(--dark)!important; color:var(--bg)!important; }
  #view .home-sky .composer .send:not(.stop):not(:disabled):hover { opacity:.88; }
  #view .home-sky .composer .send.stop { background:var(--err-dim)!important; color:var(--err)!important; border:1px solid var(--err-border)!important; }
  #view .home-sky .composer .send:disabled { background:var(--selected)!important; color:var(--faint)!important; }
  .home-sky .home-plus-menu { box-shadow:var(--shadow-float); }
  .home-sidebar-scroll { flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; margin-top:12px; }
  .home-projects { width:100%; }
  .home-project-heading { display:flex; align-items:center; justify-content:space-between; gap:6px; padding:0 2px; margin-bottom:4px; }
  .home-project-heading h2 { margin:0; min-width:0; }
  .home-sidebar .home-project-heading #homeProjectsNav { min-height:28px; padding:4px 8px; font-size:11px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; color:var(--faint); }
  .home-sidebar .home-project-heading #homeNewProject { width:28px; min-height:28px; padding:5px; justify-content:center; }
  .home-project-list { display:grid; gap:2px; }
  .home-project { display:flex; align-items:center; min-width:0; border-radius:12px; }
  .home-project.is-current { background:var(--selected); color:var(--text); font-weight:600; }
  .home-sidebar .home-project-open { gap:9px; padding:9px 8px; flex:1; min-width:0; color:var(--text); border-radius:12px; }
  .home-project-icon { display:grid; place-items:center; flex:none; color:var(--muted); }
  .home-project.is-current .home-project-icon { color:var(--accent); }
  .home-sidebar .home-project-expand,.home-sidebar .home-project-options { width:24px; min-height:32px; padding:5px 3px; flex:none; justify-content:center; }
  .home-project-group { min-width:0; }
  .home-sidebar .home-project-open { padding-left:2px; padding-right:2px; }
  .home-project-pin { display:flex; color:var(--muted); }
  .home-project-pin svg { width:11px!important; height:11px!important; }
  .home-project-badges { display:flex; flex-wrap:wrap; gap:3px; }
  .home-project-badges:empty { display:none; }
  .home-project-status { padding:2px 5px; border-radius:5px; font-size:9px; line-height:1.35; background:var(--hover); }
  .home-project-status.attention { color:var(--text); background:color-mix(in srgb,#d99416 20%,transparent); }
  .home-project-status.failed { color:var(--text); background:color-mix(in srgb,#e25353 18%,transparent); }
  .home-project-status.running { color:var(--accent); background:color-mix(in srgb,var(--accent) 12%,transparent); }
  .home-project-chats { padding:3px 0 8px 17px; }
  .home-project-chats[hidden] { display:none; }
  .home-sidebar .home-project-chat { min-height:32px; padding:6px 10px; gap:7px; font-size:11.5px; border-radius:999px; }
  .home-project-chat > span:not(.home-chat-dot) { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; flex:1; }
  .home-project-chat small { font-size:9px; flex:none; }
  .home-project-chat.is-active { background:var(--selected); color:var(--text); }
  .home-chat-dot { display:block; width:5px; height:5px; border-radius:50%; background:var(--muted); flex:none; }
  .home-chat-dot.attention { background:#d99416; }.home-chat-dot.failed { background:#e25353; }.home-chat-dot.running { background:var(--accent); }
  .home-project-chats p { margin:5px 8px; font-size:11px; color:var(--muted); }
  .home-sidebar .home-project-more { font-size:11px; min-height:30px; padding:6px 8px; }
  .home-project-dialog .box { width:min(420px,100%); }
  .home-project-dialog .bar,.home-project-dialog .foot { padding:16px 20px; }
  .home-project-dialog-body { padding:0 20px 12px; }
  .home-project-dialog-path { overflow-wrap:anywhere; font-size:11px; color:var(--muted); }
  .home-project-action-list { display:grid; gap:3px; margin-block:12px 20px; }
  .home-project-action-list button { padding:9px 10px; text-align:left; border-radius:8px; }
  .home-project-dialog label { display:block; font-size:12px; margin-bottom:8px; }
  .home-project-name-row { display:flex; gap:8px; }
  .home-project-name-row input { min-width:0; flex:1; border:1px solid var(--border2); border-radius:8px; padding:8px; background:var(--card); color:var(--text); }
  .home-project-dialog-note { font-size:11px; color:var(--muted); line-height:1.5; }
  .home-project-copy { display:grid; gap:3px; min-width:0; }
  .home-project-title { display:flex; align-items:center; gap:6px; min-width:0; }
  .home-project-title strong { font-size:12px; font-weight:550; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .home-project-current { width:5px; height:5px; border-radius:50%; background:var(--accent); flex:none; }
  .home-project-path { color:var(--muted); font-size:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .home-sidebar .home-project-resume { width:28px; min-height:30px; padding:6px; margin-right:3px; justify-content:center; color:var(--muted); flex:none; }
  .home-sidebar .home-projects-footer button { min-height:34px; font-size:12px; padding:7px 8px; margin-top:6px; }
  .home-project-summary { font-size:12px; color:var(--muted); padding:0 8px; }
  .home-project-empty { padding:12px 8px; color:var(--muted); line-height:1.5; }
  .home-project-empty strong { display:block; color:var(--text); margin-bottom:6px; font-size:12px; }
  .home-project-empty p { margin:0; font-size:12px; }
  @media(min-width:721px) and (max-height:800px) {
    .home-main { gap:20px; }
    .home-sky .composer textarea { min-height:52px; }
  }
  @media(max-width:720px) {
    .home.home-sky::before { inset:0; border-radius:0; border:0; box-shadow:none; }
    .run.run-chat.code-workspace { padding:0; }
    .run.run-chat.code-workspace > .run-main { border:0; border-radius:0; box-shadow:none; }
    .run.code-workspace .cw-page-nav, .home-sky .cw-page-nav { left:50%; top:calc(10px + env(safe-area-inset-top, 0px)); }
    .home.home-sky { padding:88px 16px 32px; gap:22px; }
    .home-sky .cw-top-nav { width:auto; max-width:calc(100vw - 104px); overflow-x:auto; scrollbar-width:none; }
    .home-sky .cw-top-nav::-webkit-scrollbar { display:none; width:0; height:0; }
    .home-menu-trigger { top:calc(10px + env(safe-area-inset-top, 0px)); left:8px; }
    .code-tools-toggle { top:calc(10px + env(safe-area-inset-top, 0px)); right:8px; }
    .home-sidebar { inset:0 auto 0 0; width:min(300px,86vw); max-height:100dvh; border-radius:0 20px 20px 0; border-left:0; border-top:0; border-bottom:0; }
  }
  @media(max-width:480px) {
    .home.home-sky { padding:84px 14px 24px; gap:20px; }
    .home-sky .home-brand h1 { font-size:24px; }
    .home-sky .home-brand-copy { font-size:12.5px; }
    .home-sky .home-character,.home-sky .cw-plush.home-character { width:48px; height:48px; }
    .home-sky .cw-top-nav { max-width:calc(100vw - 96px); gap:2px; padding:3px; }
    .home-sky .cw-top-nav button { padding:0 10px; min-height:32px; font-size:11.5px; gap:5px; }
    .home-sky .cw-top-nav button > span:not(.cw-chat-face) { display:inline!important; }
  }
  @media(max-height:600px) {
    .home.home-sky { justify-content:flex-start; padding-top:88px; padding-bottom:24px; }
  }
  .home > .home-cta { order: -1; width: min(540px, 100%); align-self: center; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .home-cta-btn { --cta-accent: var(--accent); display: flex; align-items: center; gap: 12px; min-width: 0; padding: 13px 15px; border: 1px solid var(--border); border-radius: 18px; background: var(--card2); color: var(--text); text-align: left; cursor: pointer; transition: background .18s ease, border-color .18s ease, transform .18s ease; }
  .home-cta-btn.team { --cta-accent: var(--run); }
  .home-cta-btn:hover { background: var(--hover); border-color: var(--cta-accent); transform: translateY(-2px); }
  .home-cta-btn:focus-visible { outline: 2px solid var(--cta-accent); outline-offset: 3px; }
  .home-cta-btn .cta-ico { display: grid; place-items: center; width: 34px; height: 34px; flex: none; border-radius: 10px; background: color-mix(in srgb, var(--cta-accent) 10%, var(--card)); color: var(--cta-accent); }
  .home-cta-btn .cta-ico svg { width: 18px; height: 18px; }
  .home-cta-btn .cta-body { min-width: 0; flex: 1; }
  .home-cta-btn .cta-t { display: block; font-size: 13px; font-weight: 600; }
  .home-cta-btn .cta-d { display: block; font-size: 11px; color: var(--muted); margin-top: 3px; }
  .home-cta-btn .cta-arrow { font-size: 17px; color: var(--muted); }
  .home-brand-lockup { display: flex; flex-direction:column; justify-content: center; align-items: center; gap: 10px; }
  .home-character { width:96px; height:96px; object-fit:contain; animation:homeCharacterFloat 5s ease-in-out infinite; }
  .cw-plush.home-character { width:96px; height:96px; animation:homeCharacterFloat 5s ease-in-out infinite; }
  @keyframes homeCharacterFloat { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-5px); } }
  .home .home-brand-lockup h1 { width: auto; }
  .home-composer-wrap { width:min(760px,100%); min-width:0; }
  .home-composer-wrap .composer { width:100%; }
  .home-blob { width: clamp(72px, 10vw, 108px); height: auto; flex: none; overflow: visible; }
  .home-blob-body { transform-origin: 60px 83px; animation: homeBlobBob 5s ease-in-out infinite; }
  .home-blob-eye { transform-box: fill-box; transform-origin: center; animation: homeBlobBlink 6s ease-in-out infinite; }
  .home-blob-eye.wink { animation-name: homeBlobWink; }
  .home-blob-tongue { transform-box: fill-box; transform-origin: center top; animation: homeBlobTongue 6s ease-in-out infinite; }
  .home-blob-shadow { transform-origin: 60px 108px; animation: homeBlobShadow 5s ease-in-out infinite; }
  @keyframes homeBlobBob { 0%,100% { transform: translateY(0) rotate(-5deg); } 45% { transform: translateY(-8px) rotate(5deg); } 65% { transform: translateY(-3px) rotate(0deg) scale(1.04,.96); } }
  @keyframes homeBlobBlink { 0%,44%,48%,100% { transform: scaleY(1); } 46% { transform: scaleY(.08); } }
  @keyframes homeBlobWink { 0%,18%,38%,44%,48%,100% { transform: scaleY(1); } 23%,33%,46% { transform: scaleY(.12); } }
  @keyframes homeBlobTongue { 0%,15%,40%,100% { transform: scaleY(.05); } 22%,33% { transform: scaleY(1); } }
  @keyframes homeBlobShadow { 0%,100% { transform: scaleX(1); opacity: .18; } 45% { transform: scaleX(.8); opacity: .1; } }
  @media (max-width: 480px) { .home > .home-cta { gap: 8px; } .home-cta-btn { padding: 11px; gap: 8px; } .home-cta-btn .cta-arrow { display: none; } .home-cta-btn .cta-d { font-size: 10px; } .home-brand-lockup { gap: 8px; } }
  @media (prefers-reduced-motion: reduce) { .home-character,.home-blob * { animation: none !important; } .home-blob-tongue { transform: scaleY(.05); } }
`;
export const HOME_WORKSPACE_JS = PROJECT_PREFERENCES_JS + String.raw`
  function cwEnterWorkspace(kind,agentId,convId,threadId) { cwEnsure().homeAction={kind:kind,agentId:agentId,convId:convId||null,threadId:threadId||null};openCowork(); }
  function homeSelectedAgent() {
    var cw=cwEnsure(),agents=cw.agents||[];
    return agents.find(function(agent){return agent.id===cw.selectedAgentId;})||agents[0]||null;
  }
  function homeConnectedGroups(agentId) {
    var cw=cwEnsure(),q=String((typeof S!=='undefined'&&S&&S.homeSidebarFilter)||'').trim().toLowerCase();
    return (cw.convs||[]).filter(function(conv){
      if(!conv||conv.kind!=='group')return false;
      if(agentId&&(!Array.isArray(conv.memberIds)||conv.memberIds.indexOf(agentId)<0))return false;
      if(q&&String(conv.title||'Group chat').toLowerCase().indexOf(q)<0)return false;
      return true;
    });
  }
  function homeRenderSidebarAgentState() {
    var cw=cwEnsure(),agent=homeSelectedAgent(),selId=agent?agent.id:(cw.selectedAgentId||'');
    var chip=$('homeSelectedAgentChip');
    if(chip)chip.textContent=agent?agent.name:'';
    var nav=$('cwCurrentChat');
    if(nav&&agent&&typeof cwAva==='function'){var face=nav.querySelector('.cw-chat-face');if(face)face.innerHTML=cwAva(agent);}
    var list=$('homeAgentGroups');
    if(!list)return;
    var groups=homeConnectedGroups(selId);
    if(!groups.length){
      list.innerHTML='<p class="home-group-empty">'+(agent?'No groups connected to '+esc(agent.name)+'.':'Select or create an agent to see groups.')+'</p>';
      return;
    }
    var byId=Object.create(null);(cw.agents||[]).forEach(function(item){byId[item.id]=item.name;});
    list.innerHTML=groups.map(function(conv){
      var names=(conv.memberIds||[]).map(function(id){return byId[id];}).filter(Boolean).join(', ');
      var subtitle=names||((conv.memberIds||[]).length+' members');
      var active=S&&S.active==='cowork'&&cw.active===conv.id;
      return '<button type="button" class="home-group-open'+(active?' is-active':'')+'" data-home-group="'+esc(conv.id)+'" title="'+esc(conv.title||'Group chat')+'">'+(typeof cwIcon==='function'?cwIcon('users'):icon('users'))+'<span class="home-group-copy"><strong>'+esc(conv.title||'Group chat')+'</strong><small>'+esc(subtitle)+'</small></span></button>';
    }).join('');
    list.querySelectorAll('[data-home-group]').forEach(function(btn){
      btn.onclick=function(){var id=btn.getAttribute('data-home-group');homeCloseNavigation();cwEnterWorkspace('conv',selId,id);};
    });
  }
  function homeRefreshSidebarProjects() {
    var target=$('homeProjectCards');
    if(target&&target._managed&&target._sessions)homeRenderProjects(target,target._managed,target._sessions);
  }
  function homeProjectKey(path) {
    var key=String(path||'').replace(/\\/g,'/').replace(/\/+$/,'');
    return /^[a-z]:\//i.test(key)||key.indexOf('//')===0?key.toLowerCase():key;
  }
  function homeSessionStamp(session){return String(session&&(session.updatedAt||session.finishedAt||session.startedAt)||'');}
  function homeBuildProjects(managed,sessions,activePath) {
    var projects=new Map(),activeKey=homeProjectKey(activePath);
    function add(path,name) {
      var key=homeProjectKey(path);if(!key)return null;
      if(!projects.has(key))projects.set(key,{path:path,name:name||basename(path),sessions:[],current:key===activeKey});
      return projects.get(key);
    }
    managed.forEach(function(project){add(project.path,project.name);});
    Object.keys(homeWorkspaceState().projects).forEach(function(key){var pref=homeWorkspaceState().projects[key];if(pref&&typeof pref.path==='string')add(pref.path,pref.name);});
    add(activePath);
    sessions.forEach(function(session){
      var path=session.projectPath||((session.project===basename(activePath))?activePath:'');
      var project=add(path,session.project);if(project)project.sessions.push(session);
    });
    return Array.from(projects.values()).map(function(project){
      project.sessions.sort(function(a,b){return homeSessionStamp(b).localeCompare(homeSessionStamp(a));});
      project.latest=project.sessions[0]||null;project.preference=homeProjectPreference(project.path);project.name=homeProjectName(project.path,project.name);project.status=homeProjectStatus(project.sessions);return project;
    }).sort(function(a,b){return Number(!!b.preference.pinned)-Number(!!a.preference.pinned)||Number(b.current)-Number(a.current)||homeSessionStamp(b.latest).localeCompare(homeSessionStamp(a.latest))||a.name.localeCompare(b.name);});
  }
  function homeSidebarPath(sessions) {
    var sess=S.sessions&&S.sessions[S.active],run=sess&&(sess.session||sess),saved=(sessions||[]).find(function(item){return item.runId===S.active;});
    return (run&&run.projectPath)||(saved&&saved.projectPath)||effectiveProjectPath();
  }
  function homeSelectProject(project) {
    rememberModelSelection('',project.path);
    homeCaptureDrafts();homeActivateDraft(project.path);homeUpdateProject(project.path,{});
    S.settings.projectPath=project.path;S.lastProjectPath=project.path;persist();updateProjChip();renderSidebar();
    var picker=$('homeProj');if(picker){picker.querySelector('span').textContent=homeProjectName(project.path,project.name);picker.setAttribute('aria-label','Project '+homeProjectName(project.path,project.name));}
  }
  function homeRunProjectLabel() {
    var path=homeSidebarPath(),name=homeProjectName(path),picker=$('runProject');
    if(picker){picker.querySelector('span').textContent=name;picker.setAttribute('aria-label','Project '+name);}
    return name;
  }
  function homeRunStatus(run) {
    var waiting=typeof waitingFor==='function'?waitingFor(run):(run.pendingQuestions?'your answer':null);
    if(waiting)return {kind:'attention',label:'Needs '+waiting};
    if(['blocked','review'].includes(run.status))return {kind:'attention',label:run.status==='review'?'Needs review':'Blocked'};
    if(run.status==='failed')return {kind:'failed',label:'Failed'};
    if(['running','waiting_for_model'].includes(run.status))return {kind:'running',label:run.status==='waiting_for_model'?'Retrying model':'Running'};
    return {kind:'idle',label:run.status==='completed'?'Completed':run.status==='aborted'?'Stopped':run.status==='stalled'?'Paused':run.status||'Saved'};
  }
  function homeProjectStatus(sessions) {
    var counts={attention:0,failed:0,running:0};sessions.forEach(function(run){var kind=homeRunStatus(run).kind;if(kind!=='idle')counts[kind]++;});
    return ['attention','failed','running'].filter(function(kind){return counts[kind];}).map(function(kind){return {kind:kind,count:counts[kind],label:kind==='attention'?'Needs attention':kind==='failed'?'Failed':'Running'};});
  }
  function homeProjectBadge(status) {return '<span class="home-project-status '+status.kind+'" title="'+status.count+' '+esc(status.label.toLowerCase())+'" aria-label="'+status.count+' '+esc(status.label.toLowerCase())+'">'+status.count+' '+(status.kind==='attention'?(status.count===1?'needs you':'need you'):esc(status.label.toLowerCase()))+'</span>';}
  function homeOpenProjectRun(project,run) {homeCloseNavigation();homeSelectProject(project);openRun(run.runId,{chatish:run.mode==='chat',mode:run.mode,projectPath:project.path});}
  function homeProjectDate(project) {
    var latest=project.latest,stamp=latest&&(latest.updatedAt||latest.finishedAt||latest.startedAt),date=stamp?new Date(stamp):null;
    return date&&Number.isFinite(date.getTime())?date.toLocaleDateString(undefined,{month:'short',day:'numeric'}):'';
  }
  function homeRenderSidebarSessions(sessions) {
    var target=$('homeSessionList'),count=$('homeSessionCount'),scopeBtn=$('homeSessionsScopeBtn');
    if(!target)return;
    var cw=cwEnsure(),selAgent=homeSelectedAgent(),selId=selAgent?selAgent.id:(cw.selectedAgentId||'');
    var showAll=Boolean(S.homeShowAllSessions);
    if(scopeBtn){
      scopeBtn.hidden=!selAgent;
      scopeBtn.textContent=showAll&&selAgent?('Only '+selAgent.name):'Show all';
    }
    var q=String(S.homeSidebarFilter||'').trim().toLowerCase();
    var convs=(cw.convs||[]).filter(function(conv){
      if(!conv||conv.kind==='group')return false;
      if(selId&&!showAll&&(!Array.isArray(conv.memberIds)||conv.memberIds.indexOf(selId)<0))return false;
      if(q&&String(conv.title||'Conversation').toLowerCase().indexOf(q)<0)return false;
      return true;
    });
    var runs=(sessions||[]).filter(function(run){
      if(q&&String((run&&run.goal)||'').toLowerCase().indexOf(q)<0&&String((run&&run.project)||'').toLowerCase().indexOf(q)<0)return false;
      return true;
    }).slice().sort(function(a,b){return homeSessionStamp(b).localeCompare(homeSessionStamp(a));});
    var total=convs.length+runs.length;
    if(count)count.textContent=total?String(total):'';
    var convHtml=convs.map(function(conv){
      var isAct=S.active==='cowork'&&cw.active===conv.id;
      return '<div class="home-session-item"><button type="button" class="home-session-row'+(isAct?' is-active':'')+'" data-home-conv="'+esc(conv.id)+'" title="'+esc(conv.title||'Conversation')+'"><span class="home-chat-dot idle" aria-hidden="true"></span><span class="home-session-label">'+esc(conv.title||'Conversation')+'</span></button><button type="button" class="home-session-del" data-home-del-conv="'+esc(conv.id)+'" aria-label="Delete session '+esc(conv.title||'Conversation')+'" title="Delete session">&times;</button></div>';
    }).join('');
    var runHtml=runs.map(function(run){
      var status=homeRunStatus(run);
      return '<div class="home-session-item"><button type="button" class="home-session-row'+(S.active===run.runId?' is-active':'')+'" data-home-session="'+esc(run.runId)+'" aria-current="'+(S.active===run.runId)+'" title="'+esc(run.goal||'Untitled task')+' · '+esc(status.label)+'"><span class="home-chat-dot '+status.kind+'" aria-hidden="true"></span><span class="home-session-label">'+esc(sessionTitle(run.goal)||'Untitled task')+'</span></button><button type="button" class="home-session-del" data-home-del-run="'+esc(run.runId)+'" aria-label="Delete session '+esc(sessionTitle(run.goal)||'Untitled task')+'" title="Delete session">&times;</button></div>';
    }).join('');
    var html=(convHtml||runHtml)?(convHtml+runHtml):'<p class="home-session-empty">'+(q?'No matching sessions.':'No sessions yet. Start a task to see it here.')+'</p>';
    if(target._markup===html)return;
    target._markup=html;target.innerHTML=html;
    target.querySelectorAll('[data-home-session]').forEach(function(button){
      button.onclick=function(){
        var run=runs.find(function(item){return item.runId===button.getAttribute('data-home-session');});
        if(!run)return;
        homeCloseNavigation();
        openRun(run.runId,{chatish:run.mode==='chat',mode:run.mode,projectPath:run.projectPath});
      };
    });
    target.querySelectorAll('[data-home-conv]').forEach(function(button){
      button.onclick=function(){
        var id=button.getAttribute('data-home-conv');
        if(!id)return;
        homeCloseNavigation();
        cwEnterWorkspace('conv',selId||null,id);
      };
    });
    target.querySelectorAll('[data-home-del-run]').forEach(function(button){
      button.onclick=function(event){
        event.stopPropagation();
        var id=button.getAttribute('data-home-del-run');
        if(button.dataset.confirmDelete!=='true'){button.dataset.confirmDelete='true';button.textContent='Delete?';return;}
        button.disabled=true;
        api('/api/runs/'+encodeURIComponent(id),{method:'DELETE'}).then(function(){
          if(S.active===id)openHome();
          else homeLoadProjects();
          if(typeof renderSidebar==='function')renderSidebar();
        }).catch(function(err){button.disabled=false;button.dataset.confirmDelete='false';button.textContent='×';if(typeof toast==='function')toast(err.message,true);});
      };
    });
    target.querySelectorAll('[data-home-del-conv]').forEach(function(button){
      button.onclick=function(event){
        event.stopPropagation();
        var id=button.getAttribute('data-home-del-conv');
        if(button.dataset.confirmDelete!=='true'){button.dataset.confirmDelete='true';button.textContent='Delete?';return;}
        button.disabled=true;
        var del=typeof cwDeleteSession==='function'?cwDeleteSession(id):api('/api/cowork/conversations/'+encodeURIComponent(id),{method:'DELETE'});
        Promise.resolve(del).then(function(){
          cw.convs=(cw.convs||[]).filter(function(c){return c.id!==id;});
          target._markup=null;
          homeRefreshSidebarProjects();
          homeRenderSidebarAgentState();
        }).catch(function(err){button.disabled=false;button.dataset.confirmDelete='false';button.textContent='×';if(typeof toast==='function')toast(err.message,true);});
      };
    });
  }
  function homeRenderProjects(target,managed,sessions) {
    if(!target.isConnected)return;
    var cwState=cwEnsure(),selAgentId=cwState.selectedAgentId;
    var selAgent=selAgentId&&(cwState.agents||[]).find(function(agent){return agent.id===selAgentId;});
    var visibleSessions=(selAgentId&&!S.homeShowAllSessions)?sessions.filter(function(run){return !run.coworkTask||run.coworkTask.agentId===selAgentId;}):sessions;
    homeRenderSidebarSessions(visibleSessions);
    var all=homeBuildProjects(managed,visibleSessions,homeSidebarPath(visibleSessions)),archived=!!S.codeArchiveView;
    var q=String(S.homeSidebarFilter||'').trim().toLowerCase();
    var visible=all.filter(function(project){
      var inView=archived?!!(project.preference.archived||project.preference.hidden):!(project.preference.archived||project.preference.hidden);
      if(!inView)return false;
      if(!q)return true;
      return String(project.name||'').toLowerCase().indexOf(q)>=0||String(project.path||'').toLowerCase().indexOf(q)>=0||(project.sessions||[]).some(function(s){return String(s.goal||'').toLowerCase().indexOf(q)>=0;});
    });
    var pinned=visible.filter(function(project){return project.preference.pinned;}),recent=visible.filter(function(project){return !project.preference.pinned;});
    var projects=(archived||S.codeShowAllProjects||q)?visible:pinned.concat(recent.slice(0,4));
    var viewAllBtn=$('homeViewProjects');
    if(viewAllBtn){
      viewAllBtn.setAttribute('aria-pressed',String(!!S.codeShowAllProjects));
      viewAllBtn.textContent=S.codeShowAllProjects?'Show fewer projects':'View all projects';
    }
    var focused=typeof document!=='undefined'&&document.activeElement,focusKey=focused&&target.contains&&target.contains(focused)?focused.getAttribute('data-home-focus'):null;
    var html=projects.length?'<div class="home-project-list">'+projects.map(function(project,index){
      var pref=project.preference,expanded=pref.expanded===undefined?project.current:!!pref.expanded,current=project.current,groupId='homeProjectChats-'+index;
      var chatRows=expanded?project.sessions.slice(0,pref.moreChats?project.sessions.length:6).map(function(run,runIndex){var status=homeRunStatus(run);return '<button type="button" class="home-project-chat'+(S.active===run.runId?' is-active':'')+'" data-home-chat="'+index+':'+runIndex+'" data-home-focus="chat:'+esc(run.runId)+'" aria-current="'+(S.active===run.runId)+'" title="'+esc(run.goal||'Untitled chat')+' · '+esc(status.label)+'"><span class="home-chat-dot '+status.kind+'" aria-hidden="true"></span><span>'+esc(sessionTitle(run.goal)||'Untitled chat')+'</span><small>'+esc(status.label)+'</small></button>';}).join(''):'';
      return '<article class="home-project-group"><div class="home-project'+(current?' is-current':'')+'"><button type="button" class="home-project-expand" data-home-expand="'+index+'" data-home-focus="expand:'+esc(project.path)+'" aria-label="'+(expanded?'Collapse':'Expand')+' chats for '+esc(project.name)+'" aria-expanded="'+expanded+'" aria-controls="'+groupId+'">'+icon(expanded?'chevDown':'chevRight')+'</button><button type="button" class="home-project-open" data-home-project="'+index+'" data-home-focus="select:'+esc(project.path)+'" aria-current="'+current+'" title="'+esc(project.path)+'" aria-label="Select project '+esc(project.name)+'"><span class="home-project-copy"><span class="home-project-title"><strong>'+esc(project.name)+'</strong>'+(pref.pinned?'<span class="home-project-pin" title="Pinned" aria-label="Pinned">'+icon('pin')+'</span>':'')+(current?'<span class="home-project-current" aria-label="Selected"></span>':'')+'</span><span class="home-project-path">'+esc(project.path)+'</span><span class="home-project-badges">'+project.status.map(homeProjectBadge).join('')+'</span></span></button><button type="button" class="home-project-options" data-home-options="'+index+'" data-home-focus="options:'+esc(project.path)+'" aria-label="Actions for '+esc(project.name)+'" title="Project actions">'+icon('more')+'</button></div><div class="home-project-chats" id="'+groupId+'"'+(expanded?'':' hidden')+'>'+chatRows+(expanded&&!project.sessions.length?'<p>No chats yet.</p>':'')+(expanded&&project.sessions.length>6?'<button type="button" class="home-project-more" data-home-more="'+index+'" data-home-focus="more:'+esc(project.path)+'">'+(pref.moreChats?'Show fewer chats':'Show all '+project.sessions.length+' chats')+'</button>':'')+'</div></article>';
    }).join('')+'</div>':'<div class="home-project-empty"><strong>'+(archived?'No archived or hidden projects':'A space for your next idea')+'</strong><p>'+(archived?'Archived projects can be restored here.':'Create a project or open a folder to keep your work and conversations together.')+'</p></div>';
    var coworkTasks=sessions.filter(function(run){return !!run.coworkTask&&(!selAgentId||run.coworkTask.agentId===selAgentId);}).sort(function(a,b){return homeSessionStamp(b).localeCompare(homeSessionStamp(a));});
    if(coworkTasks.length&&!archived){
      function codingRow(run){var status=homeRunStatus(run);return '<button type="button" class="home-project-chat'+(S.active===run.runId?' is-active':'')+'" data-main-coding-task="'+esc(run.runId)+'" title="'+esc(run.goal)+'"><span class="home-chat-dot '+status.kind+'" aria-hidden="true"></span><span>'+esc(sessionTitle(run.goal))+'<small>'+esc(run.coworkTask.agentName)+'</small></span><small>'+esc(status.label)+'</small></button>';}
      html='<section aria-label="Cowork coding tasks"><h3>Cowork coding'+(selAgent?' · '+esc(selAgent.name):'')+'</h3>'+coworkTasks.slice(0,8).map(codingRow).join('')+(coworkTasks.length>8?'<details><summary>Older coding tasks</summary>'+coworkTasks.slice(8).map(codingRow).join('')+'</details>':'')+'</section>'+html;
    }
    target._projects=projects;target._managed=managed;target._sessions=sessions;
    if(target._markup===html)return;target._markup=html;target.innerHTML=html;
    function project(button,key){return target._projects[Number(button.dataset[key])];}
    function refresh(){homeRenderProjects(target,target._managed,target._sessions);}
    target.querySelectorAll('[data-home-project]').forEach(function(button){button.onclick=function(){
      homeCloseNavigation();homeSelectProject(project(button,'homeProject'));if(S.active!=='home'){openHome();return;}refresh();var input=$('goal');if(input)input.focus({preventScroll:true});
    };});
    target.querySelectorAll('[data-home-expand]').forEach(function(button){button.onclick=function(){var p=project(button,'homeExpand');homeUpdateProject(p.path,{expanded:button.getAttribute('aria-expanded')!=='true'});refresh();};});
    target.querySelectorAll('[data-home-more]').forEach(function(button){button.onclick=function(){var p=project(button,'homeMore');homeUpdateProject(p.path,{moreChats:!homeProjectPreference(p.path).moreChats});refresh();};});
    target.querySelectorAll('[data-home-chat]').forEach(function(button){button.onclick=function(){var pair=button.dataset.homeChat.split(':'),p=target._projects[Number(pair[0])];homeOpenProjectRun(p,p.sessions[Number(pair[1])]);};});
    target.querySelectorAll('[data-home-options]').forEach(function(button){button.onclick=function(){homeProjectActions(project(button,'homeOptions'),button);};});
    if(focusKey)target.querySelectorAll('[data-home-focus]').forEach(function(button){if(button.getAttribute('data-home-focus')===focusKey)button.focus({preventScroll:true});});
  }
  function homeProjectActions(project,opener) {
    homeCloseNavigation();var modal=document.createElement('div');modal.className='modal home-project-dialog';
    var pref=homeProjectPreference(project.path),inactive=!!(pref.archived||pref.hidden);
    modal.innerHTML='<div class="box" role="dialog" aria-modal="true" aria-labelledby="homeProjectActionsTitle" tabindex="-1"><div class="bar"><strong id="homeProjectActionsTitle">'+esc(project.name)+'</strong></div><div class="home-project-dialog-body"><p class="home-project-dialog-path">'+esc(project.path)+'</p><div class="home-project-action-list"><button type="button" data-project-action="pin">'+(pref.pinned?'Unpin project':'Pin project')+'</button><button type="button" data-project-action="folder">Open folder</button>'+(project.latest?'<button type="button" data-project-action="continue">Continue latest chat</button>':'')+'<button type="button" data-project-action="'+(inactive?'restore':'archive')+'">'+(inactive?'Restore project':'Archive project')+'</button>'+(!inactive?'<button type="button" data-project-action="hide">Remove from sidebar</button>':'')+'</div><form id="homeRenameProject"><label for="homeProjectName">Project display name</label><div class="home-project-name-row"><input id="homeProjectName" maxlength="120" required value="'+esc(project.name)+'"><button type="submit" class="btn">Save name</button></div></form><p class="home-project-dialog-note">Names and visibility are saved on this device. Files and chat history are preserved.</p><p id="homeProjectActionStatus" role="status"></p></div><div class="foot"><button type="button" class="btn" data-cancel>Close</button></div></div>';
    document.body.appendChild(modal);
    function close(){modal.remove();if(opener&&opener.isConnected&&opener.getClientRects().length)opener.focus({preventScroll:true});else if($('homeMenu')&&$('homeMenu').getClientRects().length)$('homeMenu').focus();}
    function refresh(){var target=$('homeProjectCards');if(target)homeRenderProjects(target,target._managed||[],target._sessions||[]);}
    modal.querySelector('[data-cancel]').onclick=close;modal.onclick=function(event){if(event.target===modal)close();};
    modal.addEventListener('keydown',function(event){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}if(event.key==='Tab'){var items=Array.from(modal.querySelectorAll('button,input')),first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
    modal.querySelectorAll('[data-project-action]').forEach(function(button){button.onclick=async function(){var action=button.dataset.projectAction;
      if(action==='folder'){try{if(window.gituDesktop&&window.gituDesktop.openProjectFolder){var result=await window.gituDesktop.openProjectFolder(project.path);if(!result||!result.ok)throw new Error(result&&result.error||'Could not open this folder.');close();}else{close();openFolderBrowser('inspect',project.path);}}catch(error){modal.querySelector('[role=status]').textContent=error.message;}return;}
      if(action==='continue'){close();homeOpenProjectRun(project,project.latest);return;}
      homeUpdateProject(project.path,action==='pin'?{pinned:!pref.pinned}:action==='restore'?{archived:false,hidden:false}:action==='archive'?{archived:true,pinned:false}:{hidden:true,pinned:false});close();refresh();
    };});
    modal.querySelector('form').onsubmit=function(event){event.preventDefault();var name=modal.querySelector('input').value.trim();if(!name)return;homeUpdateProject(project.path,{name:name});var label=$('homeProj');if(label&&homeProjectKey(effectiveProjectPath())===homeProjectKey(project.path)){label.querySelector('span').textContent=name;label.setAttribute('aria-label','Project '+name);}close();refresh();};
    modal.querySelector('[data-project-action]').focus();
  }
  function homeNavigationHtml(agent) {
    var inRun=S.active!=='home'&&S.active!=='cowork';
    return '<button type="button" class="home-menu-trigger" id="homeMenu" aria-label="Projects and sessions" title="Projects and sessions" aria-expanded="false" aria-controls="homeSidebar">'+cwIcon('chat')+'</button>' +
      '<div class="home-nav-backdrop" id="homeNavBackdrop" aria-hidden="true"></div>' +
      '<aside class="home-sidebar" id="homeSidebar" aria-label="Code navigation">' +
        '<div class="home-sidebar-brand"><img src="/brand/agent-gitu-mark.svg" alt=""><div class="home-sidebar-brand-copy"><span class="home-sidebar-brand-title">Agent Gitu</span><span class="home-sidebar-brand-sub">Code workspace</span></div><button type="button" id="homeCollapse" aria-label="Close drawer" title="Close drawer">'+cwIcon('close')+'</button></div>' +
        '<div class="home-sidebar-body">' +
          '<label class="home-sidebar-search" for="homeSidebarSearch">'+cwIcon('search')+'<input type="search" id="homeSidebarSearch" autocomplete="off" placeholder="Filter chats, groups, projects…" aria-label="Filter sidebar"></label>' +
          '<div class="home-sidebar-hits" id="homeSidebarHits" hidden></div>' +
          '<p class="home-sidebar-section-label">Workspace</p>' +
          '<nav aria-label="Code workspace">' +
            (inRun?'<button type="button" id="homeNewChat">'+icon('pencil')+'<span>New task</span></button>':'') +
            '<details class="home-session-dd" id="homeSessionsDropdown" open><summary id="cwSessionsBtn" aria-label="Sessions" title="Sessions">'+cwIcon('chat')+'<span>Sessions</span><span class="home-session-count" id="homeSessionCount"></span></summary><div class="home-session-toolbar"><button type="button" id="homeNewSessionBtn">'+cwIcon('plus')+'<span>New session</span></button><button type="button" id="homeSessionsScopeBtn">Show all</button></div><div class="home-session-list" id="homeSessionList"><p class="home-session-empty">Loading sessions…</p></div></details>' +
            '<button type="button" id="homeAgentsBtn" aria-label="Agents" title="Switch agents (Grid)">'+cwIcon('users')+'<span>Agents</span><span class="home-agent-pill" id="homeSelectedAgentChip">'+(agent?esc(agent.name):'')+'</span></button>' +
            '<button type="button" id="homeGroupsBtn" aria-label="Groups" title="Connected groups">'+cwIcon('users')+'<span>Groups</span></button>' +
            '<button type="button" id="homeInboxBtn" aria-label="Inbox" title="Collaborative Inbox (Humans & Agents)">'+cwIcon('chat')+'<span>Inbox</span></button>' +
            '<button type="button" id="homeConnections" aria-label="Connections" title="Connections">'+cwIcon('link')+'<span>Connections</span></button>' +
            '<button type="button" id="homeBrowserBtn" aria-label="Browser" title="Browse websites with the main agent">'+icon('globe')+'<span>Browser</span></button>' +
            '<button type="button" id="homeGitBtn" aria-label="Git" title="Review changes, branches, and commits">'+icon('branch')+'<span>Git</span></button>' +
            (inRun?'<button type="button" id="homeTaskDetailsBtn" aria-label="Task details" title="Plan, approvals, verification, and progress">'+icon('layers')+'<span>Task details</span></button><button type="button" id="homeFilesBtn" aria-label="Files and details" title="Artifacts and changed files for this session">'+icon('folder')+'<span>Files &amp; details</span></button>':'') +
            '<button type="button" id="homeSkillsBtn" aria-label="Skills" title="Reusable agent skills">'+icon('bolt')+'<span>Skills</span></button>' +
            '<button type="button" id="homeScheduledBtn" aria-label="Scheduled" title="Scheduled tasks and reminders">'+icon('clock')+'<span>Scheduled</span></button>' +
          '</nav>' +
          '<div class="home-sidebar-scroll">' +
            '<section class="home-groups" id="homeAgentGroupsSection" aria-labelledby="homeGroupsTitle"><div class="home-groups-heading"><h2 id="homeGroupsTitle"><button type="button" id="homeGroupsNav" aria-label="Groups" title="Connected groups">'+cwIcon('users')+'<span>Groups</span></button></h2><button type="button" id="homeNewGroup" aria-label="New group" title="New group">'+cwIcon('plus')+'</button></div><div class="home-group-list" id="homeAgentGroups"><p class="home-group-empty">Loading groups…</p></div></section>' +
            '<section class="home-projects" aria-labelledby="homeProjectsTitle"><div class="home-project-heading"><h2 id="homeProjectsTitle"><button type="button" id="homeProjectsNav" aria-label="Projects" title="Projects">'+cwIcon('folder')+'<span>Projects</span></button></h2><button type="button" id="homeNewProject" aria-label="New project" title="New project">'+cwIcon('plus')+'</button></div><div id="homeProjectCards"><p class="home-project-summary" role="status">Loading projects…</p></div><div class="home-projects-footer"><button type="button" id="homeViewProjects">View all projects</button><button type="button" id="homeArchivedProjects" aria-pressed="false">Archived &amp; hidden</button></div></section>' +
          '</div>' +
        '</div>' +
        '<div class="home-sidebar-foot"><button type="button" id="cwInfoBtn" aria-label="Profile" title="Profile">'+cwIcon('user')+'<span>Profile</span></button><button type="button" id="homeSettings" aria-label="Settings" title="Settings">'+icon('gear')+'<span>Settings</span></button></div>' +
      '</aside>' +
      '<div class="cw-page-nav"><nav class="cw-top-nav" aria-label="App modes">' +
        '<button type="button" id="cwCurrentChat" aria-label="Cowork mode" title="Cowork mode" aria-pressed="false"><span class="cw-chat-face" aria-hidden="true">'+(agent?cwAva(agent):'<span class="cw-ava"><img src="/characters/orb.png?v=opendots1" alt="" draggable="false"></span>')+'</span><span>Cowork</span></button>' +
        '<button type="button" id="cwHomeBtn" aria-label="Code mode" title="Code mode" aria-pressed="true">'+cwIcon('home')+'<span>Code</span></button>' +
        '<button type="button" id="cwInboxBtn" aria-label="Inbox mode" title="Collaborative Inbox" aria-pressed="false">'+cwIcon('users')+'<span>Inbox</span></button>' +
      '</nav></div>' +
      '<button type="button" class="code-tools-toggle" id="codeToolsBtn" aria-label="Tools and activities" title="Tools and activities" popovertarget="codeToolsMenu">'+cwIcon('dots')+'</button>' +
      '<div class="cw-message-menu cw-tools-menu" id="codeToolsMenu" popover="auto" aria-label="Code workspace tools">' +
        (inRun?'<button type="button" class="cw-tool-item" id="codeNewTaskMenuBtn">'+icon('pencil')+'<span>New task</span></button>':'') +
        (inRun?'<button type="button" class="cw-tool-item" id="mainChatDetails">'+icon('layers')+'<span>Task details</span></button><button type="button" class="cw-tool-item" id="codeFilesMenuBtn">'+icon('folder')+'<span>Files &amp; details</span></button>':'') +
        '<button type="button" class="cw-tool-item" id="codeBrowserMenuBtn">'+icon('globe')+'<span>Browser</span></button>' +
        '<button type="button" class="cw-tool-item" id="codeGitMenuBtn">'+icon('branch')+'<span>Git</span></button>' +
        '<button type="button" class="cw-tool-item" id="codeAgentsMenuBtn">'+cwIcon('users')+'<span>Agents</span></button>' +
        '<button type="button" class="cw-tool-item" id="codeGroupsMenuBtn">'+cwIcon('users')+'<span>Groups</span></button>' +
        '<button type="button" class="cw-tool-item" id="codeProfileMenuBtn">'+cwIcon('user')+'<span>Profile</span></button>' +
        '<button type="button" class="cw-tool-item" id="codeConnectionsMenuBtn">'+cwIcon('link')+'<span>Connections</span></button>' +
        '<button type="button" class="cw-tool-item" id="codeSkillsMenuBtn">'+cwIcon('bolt')+'<span>Skills</span></button>' +
        '<button type="button" class="cw-tool-item" id="codeScheduledMenuBtn">'+cwIcon('clock')+'<span>Scheduled</span></button>' +
        '<button type="button" class="cw-tool-item" id="codeSettingsMenuBtn">'+cwIcon('sliders')+'<span>Settings</span></button>' +
      '</div>';
  }
  function homeCloseNavigation() {
    var menu=$('homeMenu');if(!menu)return;var root=menu.closest('.home-sky');if(root)root.dataset.navOpen='false';menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Projects and sessions');
  }
  function homeBindNavigation() {
    var root=document.querySelector('.home-sky'),menu=$('homeMenu');
    var collapse=$('homeCollapse');
    function close(){homeCloseNavigation();}
    if(collapse)collapse.onclick=function(){close();if(menu&&menu.focus)menu.focus();};
    menu.onclick=function(){var open=root.dataset.navOpen!=='true';root.dataset.navOpen=String(open);menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Close drawer':'Projects and sessions');if(open&&$('homeSidebarSearch'))$('homeSidebarSearch').focus();};
    $('homeNavBackdrop').onclick=close;
    root.addEventListener('keydown',function(event){if(root.dataset.navOpen==='true'&&event.key==='Escape'){event.preventDefault();close();menu.focus();}});
    var codeToolsBtn=$('codeToolsBtn'),codeToolsMenu=$('codeToolsMenu');
    if(codeToolsBtn&&codeToolsMenu){
      codeToolsBtn.onclick=function(){
        var rect=codeToolsBtn.getBoundingClientRect();
        codeToolsMenu.style.left='auto';
        codeToolsMenu.style.right=Math.max(12,Math.round(window.innerWidth-rect.right))+'px';
        codeToolsMenu.style.top=Math.round(rect.bottom+8)+'px';
        codeToolsMenu.style.bottom='auto';
      };
      codeToolsMenu.addEventListener('click',function(e){
        var item=e.target&&e.target.closest&&e.target.closest('button');
        if(item&&typeof codeToolsMenu.hidePopover==='function'){try{codeToolsMenu.hidePopover();}catch(err){}}
      });
    }
    var toggleAllProjects=function(){
      S.codeShowAllProjects=!S.codeShowAllProjects;
      var btn=$('homeViewProjects');
      if(btn){btn.setAttribute('aria-pressed',String(!!S.codeShowAllProjects));btn.textContent=S.codeShowAllProjects?'Show fewer projects':'View all projects';}
      var target=$('homeProjectCards');if(target)homeRenderProjects(target,target._managed||[],target._sessions||[]);
    };
    $('homeProjectsNav').onclick=toggleAllProjects;
    if($('homeAgentsBtn'))$('homeAgentsBtn').onclick=function(){homeCaptureDrafts();close();if(typeof cwOpenAgentSwitcherModal==='function')cwOpenAgentSwitcherModal();};
    var focusGroups=function(){
      if(root&&root.dataset)root.dataset.navOpen='true';
      var sec=$('homeAgentGroupsSection');if(sec&&typeof sec.scrollIntoView==='function')sec.scrollIntoView({behavior:'smooth',block:'nearest'});
      var list=$('homeAgentGroups'),first=list&&list.querySelector?list.querySelector('button'):null;
      if(first&&first.focus)first.focus();else if($('homeNewGroup')&&$('homeNewGroup').focus)$('homeNewGroup').focus();
    };
    var openInboxMode=function(){homeCaptureDrafts();close();if(window.__gituAstryx&&typeof window.__gituAstryx.openInbox==='function')window.__gituAstryx.openInbox();else window.location.assign('/inbox');};
    if($('homeGroupsBtn'))$('homeGroupsBtn').onclick=focusGroups;
    if($('homeInboxBtn'))$('homeInboxBtn').onclick=openInboxMode;
    if($('cwInboxBtn'))$('cwInboxBtn').onclick=openInboxMode;
    if($('homeGroupsNav'))$('homeGroupsNav').onclick=focusGroups;
    if($('homeNewGroup'))$('homeNewGroup').onclick=function(){homeCaptureDrafts();close();if(typeof cwGroupModal==='function')cwGroupModal(cwEnsure().selectedAgentId);else cwEnterWorkspace('chat',cwEnsure().selectedAgentId);};
    if($('homeConnections'))$('homeConnections').onclick=function(){homeCaptureDrafts();close();if(typeof cwOpenConnections==='function')cwOpenConnections();else openSettings('connections');};
    if($('homeBrowserBtn'))$('homeBrowserBtn').onclick=function(){close();if(typeof openToolPanel==='function')openToolPanel('browser');};
    if($('homeGitBtn'))$('homeGitBtn').onclick=function(){close();if(typeof openToolPanel==='function')openToolPanel('git');};
    if($('homeTaskDetailsBtn'))$('homeTaskDetailsBtn').onclick=function(){close();if(typeof openToolPanel==='function')openToolPanel('state');};
    if($('homeFilesBtn'))$('homeFilesBtn').onclick=function(){close();if(typeof openToolPanel==='function')openToolPanel('files');};
    if($('homeSkillsBtn'))$('homeSkillsBtn').onclick=function(){homeCaptureDrafts();close();openSettings('skills');};
    if($('homeScheduledBtn'))$('homeScheduledBtn').onclick=function(){homeCaptureDrafts();close();openSettings('cron');};
    if($('codeNewTaskMenuBtn'))$('codeNewTaskMenuBtn').onclick=function(){homeCaptureDrafts();openHome();};
    if($('codeFilesMenuBtn'))$('codeFilesMenuBtn').onclick=function(){if(typeof openToolPanel==='function')openToolPanel('files');};
    if($('codeBrowserMenuBtn'))$('codeBrowserMenuBtn').onclick=function(){if(typeof openToolPanel==='function')openToolPanel('browser');};
    if($('codeGitMenuBtn'))$('codeGitMenuBtn').onclick=function(){if(typeof openToolPanel==='function')openToolPanel('git');};
    if($('codeAgentsMenuBtn'))$('codeAgentsMenuBtn').onclick=function(){homeCaptureDrafts();if(typeof cwOpenAgentSwitcherModal==='function')cwOpenAgentSwitcherModal();};
    if($('codeGroupsMenuBtn'))$('codeGroupsMenuBtn').onclick=function(){homeCaptureDrafts();if(typeof cwSessionsModal==='function')cwSessionsModal('groups');else focusGroups();};
    if($('codeProfileMenuBtn'))$('codeProfileMenuBtn').onclick=function(){homeCaptureDrafts();var agent=cwProfileAgent()||cwEnsure().agents[0];cwEnterWorkspace(agent?'profile':'new',agent&&agent.id);};
    if($('codeConnectionsMenuBtn'))$('codeConnectionsMenuBtn').onclick=function(){homeCaptureDrafts();if(typeof cwOpenConnections==='function')cwOpenConnections();else openSettings('connections');};
    if($('codeSkillsMenuBtn'))$('codeSkillsMenuBtn').onclick=function(){homeCaptureDrafts();openSettings('skills');};
    if($('codeScheduledMenuBtn'))$('codeScheduledMenuBtn').onclick=function(){homeCaptureDrafts();openSettings('cron');};
    if($('codeSettingsMenuBtn'))$('codeSettingsMenuBtn').onclick=function(){homeCaptureDrafts();openSettings('overview');};
    if($('homeNewSessionBtn'))$('homeNewSessionBtn').onclick=function(){homeCaptureDrafts();close();if(typeof cwNewSessionModal==='function'&&cwEnsure().agents&&cwEnsure().agents.length)cwNewSessionModal();else openHome();};
    if($('homeSessionsScopeBtn'))$('homeSessionsScopeBtn').onclick=function(){S.homeShowAllSessions=!S.homeShowAllSessions;var target=$('homeSessionList');if(target)target._markup=null;homeRefreshSidebarProjects();};
    $('homeViewProjects').onclick=toggleAllProjects;
    $('homeNewProject').onclick=function(){close();newProject();};
    $('homeArchivedProjects').setAttribute('aria-pressed',String(!!S.codeArchiveView));
    $('homeArchivedProjects').textContent=S.codeArchiveView?'Back to projects':'Archived & hidden';
    $('homeArchivedProjects').onclick=function(){S.codeArchiveView=!S.codeArchiveView;this.setAttribute('aria-pressed',String(!!S.codeArchiveView));this.textContent=S.codeArchiveView?'Back to projects':'Archived & hidden';var target=$('homeProjectCards');if(target)homeRenderProjects(target,target._managed||[],target._sessions||[]);};
    if($('homeNewChat'))$('homeNewChat').onclick=function(){homeCaptureDrafts();close();openHome();};
    $('cwHomeBtn').onclick=function(){homeCaptureDrafts();if(S.active==='home')$('goal').focus();else openHome();};
    $('cwCurrentChat').onclick=function(){homeCaptureDrafts();cwEnterWorkspace('chat',cwEnsure().selectedAgentId);};
    $('cwInfoBtn').onclick=function(){homeCaptureDrafts();close();var agent=cwProfileAgent()||cwEnsure().agents[0];cwEnterWorkspace(agent?'profile':'new',agent&&agent.id);};
    $('homeSettings').onclick=function(){homeCaptureDrafts();close();openSettings('overview');};
    var searchInput=$('homeSidebarSearch');
    if(searchInput){
      searchInput.value=S.homeSidebarFilter||'';
      var recallTimer=null,recallSeq=0;
      searchInput.oninput=function(){
        S.homeSidebarFilter=searchInput.value;
        var sList=$('homeSessionList');if(sList)sList._markup=null;
        var pCards=$('homeProjectCards');if(pCards)pCards._markup=null;
        if(S.homeSidebarFilter&&$('homeSessionsDropdown'))$('homeSessionsDropdown').open=true;
        homeRefreshSidebarProjects();
        homeRenderSidebarAgentState();
        clearTimeout(recallTimer);
        var q=String(S.homeSidebarFilter||'').trim(),hitsEl=$('homeSidebarHits'),seq=++recallSeq;
        if(!hitsEl)return;
        if(q.length<2){hitsEl.hidden=true;hitsEl.innerHTML='';return;}
        recallTimer=setTimeout(function(){
          api('/api/cowork/search?q='+encodeURIComponent(q)+'&limit=8').then(function(data){
            if(seq!==recallSeq||!hitsEl.isConnected)return;
            var hits=(data&&data.hits)||[];
            if(!hits.length){hitsEl.hidden=true;hitsEl.innerHTML='';return;}
            hitsEl.hidden=false;
            hitsEl.innerHTML=hits.map(function(hit){
              return '<button type="button" class="home-sidebar-hit" data-home-hit-conv="'+esc(hit.conversationId)+'" data-home-hit-thread="'+esc(hit.threadId||'')+'"><strong>'+esc(hit.conversationTitle||'Conversation')+'</strong><small>'+esc(hit.snippet||'')+'</small></button>';
            }).join('');
            hitsEl.querySelectorAll('[data-home-hit-conv]').forEach(function(btn){
              btn.onclick=function(){
                var cid=btn.getAttribute('data-home-hit-conv'),tid=btn.getAttribute('data-home-hit-thread')||null;
                homeCloseNavigation();
                cwEnterWorkspace('conv',cwEnsure().selectedAgentId||null,cid,tid);
              };
            });
          }).catch(function(){if(seq===recallSeq){hitsEl.hidden=true;hitsEl.innerHTML='';}});
        },250);
      };
    }
    var timer=setInterval(function(){if(!root.isConnected){clearInterval(timer);return;}if(!document.hidden)homeLoadProjects();},5000);

    homeRenderSidebarAgentState();
  }
  async function homeLoadProjects() {
    var target=$('homeProjectCards');if(!target||target._loading)return;target._loading=true;
    var results=await Promise.allSettled([api('/api/projects'),api('/api/runs')]);target._loading=false;if(!target.isConnected)return;
    if(results.every(function(result){return result.status==='rejected';})) {
      target._markup=null;target.innerHTML='<div class="home-project-empty" role="alert"><strong>Could not load projects</strong><p>Please try again.</p><button class="btn" id="homeRetryProjects">Retry</button></div>';
      $('homeRetryProjects').onclick=homeLoadProjects;return;
    }
    var managed=results[0].status==='fulfilled'?results[0].value.projects||[]:[],sessions=results[1].status==='fulfilled'?results[1].value:[];
    homeRenderProjects(target,managed,sessions);
    if(results.some(function(result){return result.status==='rejected';})) {
      target._markup=null;target.insertAdjacentHTML('beforeend','<p class="home-project-summary" role="status">Some projects or conversations could not load. <button class="btn" id="homeRetryProjects">Retry</button></p>');$('homeRetryProjects').onclick=homeLoadProjects;
    }
  }
  async function homeLoadProfile() {
    var nav=$('cwCurrentChat');if(!nav)return;
    try {
      var results=await Promise.allSettled([api('/api/cowork/agents'),api('/api/cowork/conversations')]);
      if(!nav.isConnected)return;
      if(results[0].status!=='fulfilled')return;
      var data=results[0].value||{};
      var cw=cwEnsure();cw.agents=data.agents||[];cw.skills=data.availableSkills||[];
      if(results[1].status==='fulfilled'&&results[1].value&&Array.isArray(results[1].value.conversations))cw.convs=results[1].value.conversations;
      if(!cw.agents.some(function(agent){return agent.id===cw.selectedAgentId;})){
        cw.selectedAgentId=cw.agents[0]&&cw.agents[0].id;
        if(typeof cwSaveSelectedAgentId==='function')cwSaveSelectedAgentId(cw.selectedAgentId);
      }
      homeRenderSidebarAgentState();
      homeRefreshSidebarProjects();
    }catch(e){/* Profile access can retry when opened; it does not block projects. */}
  }
`;
export const HOME_CHARACTER_HTML = plushCharacterHtml('orb', 'home', '', 'home-character');

export const HOME_BLOB_HTML = '<svg class="home-blob" viewBox="0 0 120 120" aria-hidden="true" focusable="false">' +
  '<defs><radialGradient id="homeBlobFill" cx="30%" cy="20%" r="85%"><stop stop-color="#cbbdff"/><stop offset=".5" stop-color="#9580ff"/><stop offset="1" stop-color="#6550cf"/></radialGradient></defs>' +
  '<ellipse class="home-blob-shadow" cx="60" cy="108" rx="34" ry="5" fill="#7160cb" opacity=".18"/>' +
  '<g class="home-blob-body"><path d="M17 64C10 39 27 15 49 16C63 8 84 16 92 29C104 34 110 52 103 66C112 90 91 101 71 96C52 107 23 98 20 82C12 77 12 69 17 64Z" fill="url(#homeBlobFill)"/>' +
  '<ellipse cx="36" cy="33" rx="12" ry="6" fill="white" opacity=".22" transform="rotate(-32 36 33)"/>' +
  '<ellipse cx="33" cy="66" rx="8" ry="4" fill="#f4a4d2" opacity=".65"/><ellipse cx="87" cy="66" rx="8" ry="4" fill="#f4a4d2" opacity=".65"/>' +
  '<g class="home-blob-eye"><ellipse cx="44" cy="51" rx="6" ry="10" fill="#262144"/><circle cx="46" cy="48" r="2" fill="white"/></g>' +
  '<g class="home-blob-eye wink"><ellipse cx="77" cy="49" rx="6" ry="10" fill="#262144"/><circle cx="79" cy="46" r="2" fill="white"/></g>' +
  '<path d="M49 69Q60 85 72 67" fill="#36234e" stroke="#36234e" stroke-width="3" stroke-linecap="round"/>' +
  '<path class="home-blob-tongue" d="M58 74Q70 71 68 79Q64 90 59 81Z" fill="#ff91bd"/></g></svg>';
