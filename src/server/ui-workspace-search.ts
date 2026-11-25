import { WORKSPACE_SETTINGS_CATALOG } from '../shared/workspace-settings.js';

/** Full-page discovery keeps the live conversation mounted beneath it. */
export const WORKSPACE_SEARCH_CSS = String.raw`
  :root { --brand-blue:#0064e0; --brand-on-blue:#fff; }
  :is(#view,#settings,#workspaceSearch,.cw-modal,.cw-desktop-dialog) :is(button.on,button.cur,button.active,button.sel,button[aria-selected=true],button[aria-pressed=true]):not(.toggle):not([role=switch]):not(.cw-colors button):not(.cw-shapes button):not(.cw-item):not([data-connection-category]):not(.setnav .item):not(.navitem):not(#cwServicesAvailable):not(#cwServicesConnected):not([data-profile-section]):not([data-cwmemfilter]):not(#cwServicesHeartbeat),
  :is(#cw,.home-sky,.run-chat) .cw-top-nav button[aria-pressed=true] {
    background:var(--dark)!important; color:var(--bg)!important;
  }
  :is(#view,#settings,#workspaceSearch) :is(button[aria-selected=true],button[aria-pressed=true],button.cur):not(.cw-item):not(.cw-shapes button):not([data-connection-category]):not(.setnav .item):not(.navitem):not(#cwServicesAvailable):not(#cwServicesConnected):not([data-profile-section]):not([data-cwmemfilter]):not(#cwServicesHeartbeat):not(:disabled):hover { background:color-mix(in srgb,var(--dark) 88%,var(--bg))!important; }
  :is(#view,#settings,.cw-modal:not(.cw-agent-editor):not(.cw-agent-switcher-modal),.cw-desktop-dialog) .btn.dark { background:var(--dark)!important; color:var(--bg)!important; }
  .cw-chat-face { display:inline-flex; align-items:center; justify-content:center; flex:none; width:22px; height:22px; }
  .cw-chat-face .cw-ava { position:relative; width:22px!important; height:22px!important; border-radius:50%!important; overflow:hidden!important; display:inline-flex; align-items:center; justify-content:center; background:color-mix(in srgb,var(--accent) 15%,transparent)!important; box-shadow:0 0 0 1px rgba(255,255,255,.25); }
  .cw-chat-face .cw-ava .cw-plush { width:100%; height:100%; display:flex; align-items:center; justify-content:center; transform:scale(1.25); transform-origin:50% 50%; }
  .cw-chat-face .cw-ava img { position:relative!important; width:100%!important; height:100%!important; max-width:100%!important; left:0!important; top:0!important; object-fit:contain!important; transform:none!important; }
  .workspace-search-trigger,.home-settings-trigger { position:absolute; top:calc(12px + env(safe-area-inset-top, 0px)); left:16px; z-index:11; display:grid; place-items:center; width:36px; height:36px; padding:0; border-radius:50%; color:var(--muted); }
  .workspace-search-trigger svg,.home-settings-trigger svg { width:18px; height:18px; }
  .home-settings-trigger { left:auto; right:16px; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal):not(.cw-agent-switcher-modal) { background:var(--overlay); padding:24px; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal):not(.cw-agent-switcher-modal) .box { width:min(560px,100%); max-height:min(88dvh,calc(100dvh - 48px)); border-radius:var(--radius-chat,28px); background:var(--card); border:1px solid var(--border); box-shadow:var(--shadow-float); }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal):not(.cw-agent-switcher-modal) .bar { padding:22px 24px 12px; border:0; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal):not(.cw-agent-switcher-modal) .bar > span:first-child { font-size:18px; font-weight:600; letter-spacing:-.025em; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal):not(.cw-agent-switcher-modal) .cw-body { padding:0 24px 22px; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal):not(.cw-agent-switcher-modal) label { font-size:12px; font-weight:500; text-transform:none; letter-spacing:0; color:var(--text); margin:16px 0 8px; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal):not(.cw-agent-switcher-modal) :is(input[type=text],input[type=password],textarea,select) { background:var(--card2); border-color:var(--border); border-radius:var(--radius-el,12px); padding:12px 14px; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal):not(.cw-agent-switcher-modal) :is(input,textarea,select):focus { border-color:var(--accent); box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 14%,transparent); }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal):not(.cw-agent-switcher-modal) .cw-note { color:var(--text); font-size:12px; line-height:1.6; margin-top:16px; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal):not(.cw-agent-switcher-modal) .cw-foot { padding:0 24px 22px; border:0; background:transparent; }
  @media(max-width:600px) { .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal):not(.cw-agent-switcher-modal) { padding:16px; }.modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal):not(.cw-agent-switcher-modal) .box { max-height:min(88dvh,calc(100dvh - 32px)); }.modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal):not(.cw-agent-switcher-modal) .bar { padding:18px 18px 10px; }.modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal):not(.cw-agent-switcher-modal) .cw-body { padding:0 18px 18px; }.modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal):not(.cw-agent-switcher-modal) .cw-foot { padding:0 18px 18px; } }
  body:has(.run-chat) .sb { display:none!important; }
  .workspace-search { position:fixed; inset:0; z-index:70; overflow:auto; color:var(--text); background:var(--bg); overscroll-behavior:contain; }
  .workspace-search::before { display:none; content:none; }
  .workspace-search-close,.settings-close { position:fixed; z-index:3; top:20px; right:24px; width:38px; height:38px; display:grid; place-items:center; border-radius:var(--radius-full,9999px); color:var(--muted); padding:0; background:var(--card)!important; border:1px solid var(--border)!important; box-shadow:var(--shadow)!important; }
  .workspace-search-close:hover,.settings-close:hover { color:var(--text); background:var(--hover)!important; }
  .workspace-search-close svg,.settings-close svg { width:18px; height:18px; }
  .workspace-search-main { position:relative; width:min(880px,100%); margin:0 auto; padding:clamp(44px,6.5vh,72px) 24px 64px; }
  .ws-context { color:var(--muted); font-size:11px; font-weight:600; letter-spacing:.11em; text-transform:uppercase; margin:0 4px 10px; }
  .ws-search-field { display:flex; align-items:center; gap:12px; width:100%; min-height:54px; padding:0 18px; border:1px solid var(--border); border-radius:var(--radius-card,16px); background:var(--card); box-shadow:var(--shadow); transition:border-color .18s ease,box-shadow .18s ease,background-color .18s ease; }
  .ws-search-field:focus-within { border-color:var(--border2); background:var(--card); box-shadow:var(--shadow-float); }
  .ws-search-field > svg { width:19px; height:19px; flex:none; color:var(--accent); opacity:.9; }
  :is(#workspaceSearch,#settings) .ws-search-field input[type=search] { flex:1; min-width:0; border:0; border-radius:0; background:transparent; padding:14px 0; font-size:15.5px; font-weight:450; min-height:52px; outline:none; box-shadow:none; color:var(--text); }
  .ws-search-field input::placeholder { color:var(--muted); font-weight:400; }
  .ws-search-field kbd { font:500 10.5px var(--mono); color:var(--muted); background:var(--card2); border:1px solid var(--border); border-radius:var(--radius-inner,8px); padding:3px 7px; letter-spacing:.02em; }
  .ws-filters { display:flex; align-items:center; flex-wrap:nowrap; overflow-x:auto; scrollbar-width:none; gap:4px; margin:14px 0 22px; padding:4px; border-radius:var(--radius-full,9999px); background:var(--card); border:1px solid var(--border); box-shadow:var(--shadow); }
  .ws-filters::-webkit-scrollbar { display:none; }
  .ws-filters button { display:inline-flex; align-items:center; justify-content:center; gap:6px; flex:none; white-space:nowrap; min-height:32px; padding:5px 14px; border-radius:var(--radius-full,9999px); color:var(--muted); font:inherit; font-size:12px; font-weight:500; }
  .ws-filters button:hover { color:var(--text); background:var(--hover)!important; }
  .ws-filters button[aria-pressed=true] { font-weight:600; box-shadow:0 2px 8px -2px rgba(34,107,214,.38)!important; }
  .ws-status { color:var(--muted); font-size:12px; margin:0 6px 14px; }
  .ws-Status:empty,.ws-status:empty { display:none; }
  .ws-group { margin:22px 0; }
  .ws-group h2 { display:flex; align-items:center; justify-content:space-between; font-size:11.5px; font-weight:600; text-transform:uppercase; letter-spacing:.07em; color:var(--muted); margin:0 4px 10px; }
  .ws-group h2 span { display:inline-flex; align-items:center; justify-content:center; min-width:22px; height:20px; padding:0 7px; border-radius:var(--radius-full,9999px); font-size:11px; font-weight:600; letter-spacing:0; background:var(--card2); border:1px solid var(--border); color:var(--muted); }
  .ws-result-list { padding:4px; background:var(--card); border:1px solid var(--border); border-radius:var(--radius-card,16px); box-shadow:var(--shadow); }
  .ws-result { display:flex; align-items:center; gap:4px; min-width:0; }
  .ws-result + .ws-result { border-top:1px solid var(--border); }
  .ws-result-action { display:flex; align-items:center; gap:12px; flex:1; min-width:0; padding:11px 13px; border-radius:var(--radius-el,12px); text-align:left; color:var(--text); }
  .ws-result-icon { display:grid; place-items:center; width:36px; height:36px; flex:none; border-radius:10px; background:var(--run-dim); color:var(--accent); border:1px solid var(--run-border); }
  .ws-result-icon > svg { width:17px; height:17px; }
  .ws-result-icon .cw-ava { width:36px; height:36px; background:transparent!important; }
  .ws-result-copy { display:flex; flex-direction:column; min-width:0; gap:2px; }
  .ws-result-copy strong { font-size:13.5px; font-weight:600; letter-spacing:-.01em; line-height:1.3; overflow-wrap:anywhere; }
  .ws-result-copy small { color:var(--muted); font-size:12px; line-height:1.35; overflow:hidden; display:-webkit-box; -webkit-line-clamp:1; -webkit-box-orient:vertical; }
  .ws-result-list[data-ws-group="Tools"],.ws-result-list[data-ws-group="Agents"],.ws-result-list[data-ws-group="Skills"],.ws-result-list[data-ws-group="Projects"],.ws-result-list[data-ws-group="Settings"] { display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:8px; padding:0; background:transparent!important; border:0!important; box-shadow:none!important; backdrop-filter:none; -webkit-backdrop-filter:none; }
  .ws-result-list[data-ws-group="Agents"],.ws-result-list[data-ws-group="Skills"],.ws-result-list[data-ws-group="Projects"],.ws-result-list[data-ws-group="Settings"] { grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); }
  .ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Agents"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]) .ws-result { background:var(--card); border:1px solid var(--border); border-radius:var(--radius-card,16px); box-shadow:var(--shadow); transition:border-color .16s ease,background-color .16s ease,transform .14s ease,box-shadow .16s ease; }
  .ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Agents"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]) .ws-result + .ws-result { border-top:1px solid var(--border); }
  .ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Agents"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]) .ws-result:hover { background:var(--card); border-color:var(--border2); box-shadow:var(--shadow-float); transform:translateY(-1px); }
  .ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Agents"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]) .ws-result-action { height:100%; border-radius:14px; }
  .ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Agents"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]) .ws-result-action:hover { background:transparent!important; }
  .ws-result-list[data-ws-group="Schedules"] { display:flex; flex-direction:column; gap:8px; padding:0; background:transparent!important; border:0!important; box-shadow:none!important; backdrop-filter:none; -webkit-backdrop-filter:none; }
  .ws-result-list[data-ws-group="Schedules"] .ws-result + .ws-result { border-top:1px solid color-mix(in srgb,var(--border2) 55%,transparent); }
  .ws-aux { color:var(--muted); flex:none; padding:8px 10px; margin-right:6px; border-radius:999px; font-size:11px; font-weight:500; }
  .ws-actions-bar { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; margin-bottom:14px; }
  .ws-scope-toggle { display:inline-flex; align-items:center; gap:6px; min-height:34px; padding:6px 12px; border-radius:var(--radius-full,9999px); background:var(--card)!important; border:1px solid var(--border)!important; color:var(--text); font-size:12px; font-weight:500; }
  .ws-scope-toggle:hover { border-color:var(--border2)!important; background:var(--hover)!important; }
  .ws-aux svg { width:15px; height:15px; }
  .ws-empty { padding:36px 20px; text-align:center; color:var(--muted); font-size:13px; line-height:1.6; background:var(--card); border:1px solid var(--border); border-radius:var(--radius-card,16px); }
  .ws-more { display:inline-flex; align-items:center; justify-content:center; margin:10px auto 0; padding:7px 16px; font-size:12px; font-weight:500; color:var(--accent); background:var(--card)!important; border:1px solid var(--border)!important; border-radius:var(--radius-full,9999px); }
  .ws-schedule-card { display:flex; flex-direction:column; align-items:stretch; width:100%; padding:14px 16px; border-radius:var(--radius-card,16px); background:var(--card); border:1px solid var(--border); margin:0; box-sizing:border-box; box-shadow:var(--shadow); transition:border-color .18s ease,background-color .18s ease,box-shadow .18s ease; }
  .ws-schedule-card:hover { background:var(--card); border-color:var(--border2); box-shadow:var(--shadow-float); }
  .ws-sc-header { display:flex; align-items:flex-start; gap:12px; min-width:0; width:100%; }
  .ws-sc-icon-wrap { display:grid; place-items:center; width:38px; height:38px; flex:none; border-radius:12px; background:color-mix(in srgb,var(--run,#226bd6) 12%,var(--card)); color:var(--run,#226bd6); }
  .ws-sc-icon-wrap svg { width:18px; height:18px; }
  .ws-sc-main { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
  .ws-sc-top-row { display:flex; align-items:center; justify-content:space-between; gap:8px; min-width:0; }
  .ws-sc-title-btn { background:none; border:0; padding:0; margin:0; font:inherit; color:var(--text); font-size:14px; font-weight:600; letter-spacing:-.01em; text-align:left; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0; display:block; }
  .ws-sc-title-btn:hover { color:var(--accent,#226bd6); text-decoration:underline; }
  .ws-sc-summary { font-size:12.5px; color:var(--muted); line-height:1.45; margin:0; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; word-break:break-word; }
  .ws-sc-meta { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-top:8px; }
  .ws-sc-badge { display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:999px; font-size:11px; font-weight:500; line-height:1.3; border:1px solid transparent; flex:none; }
  .ws-sc-badge.active { background:color-mix(in srgb,#2e9b5f 14%,var(--card)); color:#2e9b5f; border-color:color-mix(in srgb,#2e9b5f 30%,transparent); }
  .ws-sc-badge.paused { background:color-mix(in srgb,var(--muted) 12%,var(--card)); color:var(--muted); border-color:color-mix(in srgb,var(--border2) 60%,transparent); }
  .ws-sc-badge.frequency { background:color-mix(in srgb,var(--card2,#f5f5f5) 80%,transparent); color:var(--text); border-color:color-mix(in srgb,var(--border2) 50%,transparent); }
  .ws-sc-badge.next { background:color-mix(in srgb,var(--accent,#226bd6) 10%,var(--card)); color:var(--accent,#226bd6); border-color:color-mix(in srgb,var(--accent,#226bd6) 24%,transparent); }
  .ws-sc-badge.context { background:color-mix(in srgb,var(--muted) 8%,var(--card)); color:var(--muted); max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ws-sc-footer { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:10px; padding-top:8px; border-top:1px solid color-mix(in srgb,var(--border) 40%,transparent); }
  .ws-sc-toggle { display:inline-flex; align-items:center; gap:6px; background:none; border:0; padding:6px 10px; margin:-6px -10px; font:inherit; font-size:11.5px; font-weight:500; color:var(--accent,#226bd6); cursor:pointer; border-radius:8px; min-height:36px; transition:background .15s ease,color .15s ease; }
  .ws-sc-toggle:hover { background:color-mix(in srgb,var(--accent,#226bd6) 10%,transparent); }
  .ws-sc-chevron { display:inline-block; font-size:11px; transition:transform .2s cubic-bezier(.16,1,.3,1); }
  .ws-sc-toggle.expanded .ws-sc-chevron { transform:rotate(90deg); }
  .ws-sc-instructions { margin-top:10px; padding:10px 14px; background:color-mix(in srgb,var(--card2,#f5f5f5) 60%,transparent); border:1px solid color-mix(in srgb,var(--border2) 50%,transparent); border-radius:12px; overflow:hidden; transition:opacity .2s ease,max-height .25s cubic-bezier(.16,1,.3,1); box-sizing:border-box; }
  .ws-sc-instructions[hidden] { display:none!important; }
  .ws-sc-instructions-label { font-size:10.5px; font-weight:600; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); margin-bottom:6px; }
  .ws-sc-prompt { font-family:inherit; font-size:12px; line-height:1.55; color:var(--text); margin:0; white-space:pre-wrap; word-break:break-word; max-height:280px; overflow-y:auto; }
  @media(max-width:600px) { .ws-schedule-card { padding:12px; margin:4px 0; }.ws-sc-icon-wrap { width:32px; height:32px; border-radius:10px; }.ws-sc-icon-wrap svg { width:16px; height:16px; }.ws-sc-title-btn { font-size:13.5px; }.ws-sc-summary { font-size:12px; }.ws-sc-meta { gap:4px; }.ws-sc-badge { font-size:10.5px; padding:2px 7px; }.ws-sc-toggle { font-size:11px; min-height:40px; } }
  .settings { display:block; overflow:auto; background:var(--bg); color:var(--text); padding:90px 24px 40px; }
  .settings .setnav { width:min(920px,100%); margin:0 auto 28px; display:flex; flex-wrap:wrap; gap:5px; padding:6px; border:1px solid var(--border); border-radius:var(--radius-full,9999px); background:var(--card); box-shadow:var(--shadow); overflow:visible; }
  .settings .setnav .sect { display:none; }
  .settings .setnav .item,.settings .setnav .back { display:flex; align-items:center; gap:7px; width:auto; padding:9px 12px; border-radius:999px; margin:0; font-size:12px; min-height:36px; }
  .settings .setbody { max-width:780px; margin:0 auto; overflow:visible; padding:0 0 24px; }
  .settings .setbody h1 { font-size:26px; letter-spacing:-.04em; }
  .settings .setbody h2 { font-size:13px; }
  .settings .setcard,.settings .appearance-card { border-radius:var(--radius-card,16px); background:var(--card); border-color:var(--border); box-shadow:var(--shadow); }
  .settings .setrow { padding:20px; }
  .settings .setlist { padding:20px; }
  .settings .setbody :is(input:not([type=checkbox]):not([type=radio]),textarea,select) { border-radius:12px; }
  .settings .btn.dark { background:var(--dark)!important; color:var(--bg)!important; }
  .settings.settings-directory { padding-top:clamp(110px,20vh,180px); }
  .settings-directory .setnav { display:none; }
  .settings-directory h1 { text-align:center; margin-bottom:28px; }
  .settings-directory .ws-context { text-align:center; }
  .settings-directory .ws-result-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; padding:0; background:transparent!important; border:0!important; box-shadow:none!important; }
  .settings-directory .ws-result { background:var(--card); border:1px solid var(--border); border-radius:var(--radius-card,16px); box-shadow:var(--shadow); transition:border-color .16s ease,background-color .16s ease,transform .14s ease,box-shadow .16s ease; }
  .settings-directory .ws-result:hover { background:var(--card); border-color:var(--border2); box-shadow:var(--shadow-float); transform:translateY(-1px); }
  .settings-directory .ws-result + .ws-result { border-top:1px solid var(--border); }
  .settings-top-back { position:absolute; top:22px; left:22px; display:flex; align-items:center; gap:8px; color:var(--muted); font-size:12px; padding:10px; border-radius:999px; }
  .settings-top-back svg { width:18px; height:18px; }
  @media(max-width:600px) { .workspace-search-trigger { top:calc(10px + env(safe-area-inset-top, 0px)); left:12px; }.workspace-search-close,.settings-close { right:14px; top:calc(12px + env(safe-area-inset-top, 0px)); width:36px; height:36px; }.workspace-search-main { padding:calc(18px + env(safe-area-inset-top, 0px)) 14px calc(32px + env(safe-area-inset-bottom, 0px)); }.ws-context { margin:6px 46px 10px 4px; font-size:10.5px; }.ws-search-field { min-height:48px; padding:0 14px; border-radius:14px; gap:10px; }.ws-search-field input[type=search] { font-size:15px; min-height:46px; padding:11px 0; }.ws-search-field kbd { display:none; }.ws-filters { margin:10px 0 16px; padding:3px; border-radius:12px; gap:3px; }.ws-filters button { min-height:32px; padding:5px 11px; font-size:12px; border-radius:9px; }.ws-group { margin:16px 0; }.ws-result-action { padding:10px 12px; gap:10px; }.ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]),.settings-directory .ws-result-list { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }.ws-result-list[data-ws-group="Agents"] { grid-template-columns:1fr; gap:8px; }.ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]) .ws-result-action,.settings-directory .ws-result-action { flex-direction:column; align-items:flex-start; gap:8px; padding:12px; }.ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]) .ws-result-icon,.settings-directory .ws-result-icon { width:32px; height:32px; border-radius:9px; }.ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]) .ws-result-icon > svg,.settings-directory .ws-result-icon > svg { width:16px; height:16px; }.ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]) .ws-result-copy strong,.settings-directory .ws-result-copy strong { font-size:13px; line-height:1.25; }.ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]) .ws-result-copy small,.settings-directory .ws-result-copy small { font-size:11.5px; -webkit-line-clamp:2; }.ws-aux { padding:8px; }.settings { padding:82px 16px 28px; }.settings .setnav { flex-wrap:nowrap; overflow-x:auto; border-radius:999px; }.settings .setnav .item { flex:none; white-space:nowrap; }.settings .setrow { flex-wrap:wrap; }.settings .setrow .grow { min-width:180px; } }
  @media(max-width:340px) { .ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]),.settings-directory .ws-result-list { grid-template-columns:1fr; } }
  /* The live coding surface keeps its navigation compact and its work area calm. */
  .run-chat .cw-page-nav { top:14px; }
  .run-chat .cw-top-nav { min-height:42px; padding:4px; border-radius:999px; }
  .run-chat .chat-shell-button { width:40px; height:40px; border:1px solid var(--border); background:var(--card); box-shadow:var(--shadow); }
  .run-chat .chat-shell-button:hover { color:var(--text); background:var(--hover); }
  .run-chat .progress { max-width:760px; margin-inline:auto; padding:10px 14px; border:1px solid var(--border); border-radius:var(--radius-card,16px); background:var(--card); box-shadow:var(--shadow); }
  .run-chat .bottom-composer { padding-bottom:max(22px,env(safe-area-inset-bottom)); }
  .run-chat .composer { border:1px solid var(--border); }
  .run-chat .composer:focus-within { border-color:var(--border2); box-shadow:var(--shadow-float); }
  .sb { background:var(--sidebar); border-right-color:var(--border); }
  .sb .head { min-height:58px; padding:14px 14px 10px; }
  .sb .head .name { letter-spacing:.09em; font-size:12px; }
  .sb .iconbtn { transition:background-color .16s ease,color .16s ease,transform .16s ease; }
  .sb .iconbtn:hover { transform:translateY(-1px); }
  .sb .scroll { padding:8px 10px 14px; }
  .sb .newbtn { min-height:40px; padding:8px 12px; border-radius:var(--radius-el,12px); background:var(--card); box-shadow:var(--shadow); }
  .sb .navitem { min-height:36px; border-radius:var(--radius-inner,8px); font-size:13.5px; font-weight:500; color:var(--muted); transition:background-color .14s ease,color .14s ease; }
  .sb .navitem:hover { color:var(--text); }
  .sb .navitem.active { background:var(--selected); color:var(--text); font-weight:600; box-shadow:none; }
  .sb .navitem.active .ico { color:var(--accent); }
  .sb .sect { margin:18px 10px 6px; font-size:10px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; }
  .sb .proj,.sb .chat { min-height:34px; border-radius:var(--radius-inner,8px); }
  .sb .chat.active { background:var(--selected); color:var(--text); }
  .sb .foot { padding:10px 12px; background:var(--sidebar); }
  .project-chip { min-height:38px; border-radius:var(--radius-el,12px); border-color:var(--border); background:var(--card); }
  .sb .newbtn:focus-visible,.sb .navitem:focus-visible,.sb .proj:focus-visible,.sb .chat:focus-visible { outline-offset:1px; }
  /* Pikpam Cloud Console tokens & layout for all non-Cowork-chat surfaces (Cowork chat #cw:not(.page-open) stays untouched). */
  :root:not([data-theme="light"]) :is(.settings,.workspace-search,.home.home-sky,.code-workspace,.run.run-chat,.sb,.cw.page-open) {
    --bg:#09090b;
    --sidebar:#0b0c10;
    --card:#111318;
    --card2:#161922;
    --hover:#1a1e29;
    --selected:#1b1f2b;
    --border:rgba(255,255,255,.08);
    --border2:rgba(255,255,255,.14);
    --text:#f4f4f5;
    --muted:#9ca3af;
    --faint:#6b7280;
    --accent:#3b82f6;
    --on-accent:#ffffff;
    --dark:#e4e4e7;
    --ok:#4ade80;
    --ok-dim:rgba(34,197,94,.12);
    --err:#f87171;
    --err-dim:rgba(239,68,68,.14);
    --err-border:rgba(239,68,68,.30);
    --run:#f59e0b;
    --run-dim:rgba(245,158,11,.14);
    --cw-chat-surface:#09090b;
    --home-sidebar-surface:#0b0c10;
    --radius-card:12px;
    --radius-inner:8px;
    --shadow:0 1px 2px rgba(0,0,0,.4);
    --shadow-float:0 16px 40px rgba(0,0,0,.6);
  }
  :root:not([data-theme="light"]) .home.home-sky::before,
  :root:not([data-theme="light"]) .run.run-chat.code-workspace::before {
    background:radial-gradient(ellipse 68% 42% at 50% -6%,rgba(59,130,246,.07),transparent 72%);
  }
  :root:not([data-theme="light"]) :is(.home-sky,.run-chat,.cw.page-open) .cw-top-nav {
    background:#111318; border:1px solid rgba(255,255,255,.09); box-shadow:none; backdrop-filter:none; -webkit-backdrop-filter:none;
  }
  :root:not([data-theme="light"]) :is(.home-sky,.run-chat,.cw.page-open) .cw-top-nav button { color:#9ca3af; }
  :root:not([data-theme="light"]) :is(.home-sky,.run-chat,.cw.page-open) .cw-top-nav button:hover { color:#f4f4f5; background:#1a1e29!important; }
  :root:not([data-theme="light"]) :is(.home-sky,.run-chat,.cw.page-open) .cw-top-nav button[aria-pressed=true] {
    background:#1d222e!important; color:#ffffff!important; border:1px solid rgba(255,255,255,.11); box-shadow:none;
  }
  :root:not([data-theme="light"]) .home-cta-btn { background:#111318; border:1px solid rgba(255,255,255,.08); border-radius:12px; }
  :root:not([data-theme="light"]) .home-cta-btn:hover { background:#161922; border-color:rgba(255,255,255,.16); }
  :root:not([data-theme="light"]) :is(.home-sky,.run-chat) .composer { background:#111318; border:1px solid rgba(255,255,255,.11); box-shadow:0 8px 30px rgba(0,0,0,.35); }
  :root:not([data-theme="light"]) .cw.page-open { background:#09090b; }
  :root:not([data-theme="light"]) .cw.page-open .cw-profile-page { background:#09090b; }
  :root:not([data-theme="light"]) .cw.page-open .cw-sky-card { background:#141923; border:1px solid rgba(255,255,255,.10); border-radius:14px; box-shadow:none; }
  :root:not([data-theme="light"]) .cw.page-open .cw-profile-task-row { background:#14171f; border-top-color:rgba(255,255,255,.08); }
  :root:not([data-theme="light"]) .cw-dashboard .btn,
  :root:not([data-theme="light"]) .cw.page-open .cw-services .btn { background:#161922; border:1px solid rgba(255,255,255,.10); color:#f4f4f5; border-radius:8px; box-shadow:none; }
  :root:not([data-theme="light"]) .cw-dashboard .btn:hover,
  :root:not([data-theme="light"]) .cw.page-open .cw-services .btn:hover { background:#1e222e; border-color:rgba(255,255,255,.18); }

  #settings.settings { display:grid; grid-template-columns:248px minmax(0,1fr); grid-template-rows:52px minmax(0,1fr); grid-template-areas:"nav top" "nav body"; overflow:hidden; padding:0; background:var(--bg); }
  #settings.settings .setnav { grid-area:nav; display:flex; flex-direction:column; flex-wrap:nowrap; gap:2px; width:248px; height:100%; margin:0; padding:16px 12px 14px; border:0; border-right:1px solid var(--border); border-radius:0; background:var(--sidebar); box-shadow:none; overflow-y:auto; }
  #settings.settings .setnav::before { display:none; }
  .setnav-brand { display:flex; align-items:center; gap:10px; padding:4px 8px 14px; margin-bottom:2px; }
  .setnav-brand img { width:26px; height:26px; border-radius:7px; flex:none; }
  .setnav-brand-copy { display:grid; line-height:1.2; min-width:0; }
  .setnav-brand-copy strong { font-size:14px; font-weight:600; color:var(--text); letter-spacing:-.01em; }
  .setnav-brand-copy span { font-size:11px; color:var(--muted); }
  #settings.settings .setnav .sect { display:block; margin:16px 10px 4px; color:var(--faint); font-size:11px; font-weight:600; letter-spacing:.04em; text-transform:none; }
  #settings.settings .setnav .back { order:0; justify-content:flex-start; margin:0 0 6px; padding:7px 10px; min-height:34px; border:1px solid var(--border); border-radius:var(--radius-inner,8px); background:var(--card); color:var(--muted); font-size:12.5px; font-weight:500; width:100%; }
  #settings.settings .setnav .back:hover { background:var(--hover); border-color:var(--border2); color:var(--text); }
  #settings.settings .setnav .item { width:100%; min-height:34px; flex:none; justify-content:flex-start; gap:10px; padding:0 10px; border:1px solid transparent; border-radius:var(--radius-inner,8px); color:var(--muted); font-size:13px; font-weight:500; transition:background-color .14s ease,color .14s ease,border-color .14s ease; }
  #settings.settings .setnav .item:hover { background:var(--hover); color:var(--text); }
  #settings.settings .setnav .item.active { border-color:var(--border2); background:var(--card2); color:var(--text); font-weight:600; }
  #settings.settings .setnav .item.active .ico { color:var(--accent); }
  .setnav-foot { margin-top:auto; padding:12px 10px 4px; border-top:1px solid var(--border); display:grid; gap:4px; }
  .setnav-account { display:grid; gap:2px; font-size:12px; }
  .setnav-account strong { color:var(--text); font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .setnav-account span { color:var(--faint); font-size:11px; }
  .settings-top-back[hidden],#settings.settings .settings-top-back { display:none!important; }
  #settings.settings .console-topbar { grid-area:top; display:flex; align-items:center; justify-content:space-between; gap:12px; height:52px; padding:0 28px; background:var(--sidebar); border-bottom:1px solid var(--border); }
  #settings.settings .settings-close { display:none; }
  .console-topbar-left { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--muted); min-width:0; }
  .console-crumb-root { color:var(--muted); }
  .console-crumb-sep { color:var(--faint); }
  .console-crumb-cur { color:var(--text); font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .console-topbar-right { display:flex; align-items:center; gap:8px; flex:none; }
  .console-topbar .theme-toggle { width:30px; height:30px; padding:5px; border-radius:8px!important; border:1px solid var(--border2)!important; background:var(--card)!important; color:var(--text)!important; }
  .console-topbar .theme-toggle:hover { background:var(--hover)!important; }
  .console-credit-pill { height:30px; padding:0 11px; border-radius:8px!important; border:1px solid var(--border2)!important; background:var(--card)!important; color:var(--text)!important; font:600 12px var(--mono); cursor:pointer; }
  .console-credit-pill:hover { background:var(--hover)!important; }
  .console-top-btn { height:30px; padding:0 12px; border-radius:8px!important; border:1px solid var(--border2)!important; background:var(--card2)!important; color:var(--text)!important; font-size:12.5px; font-weight:500; cursor:pointer; }
  .console-top-btn:hover { background:var(--hover)!important; }
  #settings.settings .setnav .back { border:1px solid var(--border)!important; background:var(--card)!important; }
  #settings.settings .setnav .item.active { border-color:var(--border2)!important; background:var(--card2)!important; color:var(--text)!important; }
  #settings.settings .setnav .item:hover { background:var(--hover)!important; }
  /* Astryx contentWidth discipline: full-bleed scroll track so scrollbar sits on window edge, centered measure via padding */
  #settings.settings .setbody { grid-area:body; width:100%; max-width:none; height:100%; margin:0; padding:28px max(24px,calc((100% - 760px) / 2)) 64px; overflow-y:auto; }
  #settings.settings:has(.connection-page-head) .setbody,
  #settings.settings[data-sec="connections"] .setbody { max-width:none; padding-inline:max(24px,calc((100% - 1040px) / 2)); }
  #settings.settings .setbody h1 { margin:0 0 6px; font-size:25px; font-weight:600; letter-spacing:-.025em; line-height:1.22; text-align:left; }
  #settings.settings .setbody > h1 + :is(p,.appearance-description,.connection-intro,.ws-dir-sub) { margin:0 0 22px; color:var(--muted); font-size:13.5px; line-height:1.5; max-width:640px; }
  #settings.settings .setbody h2 { margin-top:26px; font-size:15px; font-weight:600; letter-spacing:-.015em; color:var(--text); }
  #settings.settings .setcard { background:var(--card); border-radius:var(--radius-card,12px); border:1px solid var(--border); box-shadow:none; overflow:hidden; }
  #settings.settings .setrow { min-height:60px; padding:14px 18px; border-bottom-color:var(--border); gap:16px; }
  #settings.settings .setrow .t { font-size:13.5px; font-weight:500; }
  #settings.settings .setrow .d { max-width:560px; line-height:1.48; font-size:12.5px; color:var(--muted); }
  #settings.settings .set-disclosure { border:1px solid var(--border); border-radius:8px; padding:10px 12px; background:var(--card2); }
  #settings.settings .set-disclosure summary { cursor:pointer; font-size:12.5px; font-weight:500; color:var(--text); user-select:none; }
  #settings.settings .set-file-scroll { max-height:220px; overflow-y:auto; margin-top:10px; border-top:1px solid var(--border); padding-top:8px; }
  #settings.settings .set-field-label { font-size:12.5px; font-weight:500; color:var(--text); margin-top:4px; }
  #settings.settings .set-links-foot { display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:16px; }
  #settings.settings .settings-close { z-index:2; top:16px; right:18px; }
  /* Overview directory: left-aligned hairline list rows instead of 2-col card soup */
  #settings.settings-directory .ws-context { text-align:left; margin:0 0 6px; font-size:11px; letter-spacing:.08em; }
  #settings.settings-directory .ws-search-field { min-height:42px; padding:0 14px; border-radius:10px; margin-bottom:6px; box-shadow:none; }
  #settings.settings-directory .ws-search-field input[type=search] { min-height:40px; padding:8px 0; font-size:14px; }
  #settings.settings-directory .ws-group { margin:22px 0 0; }
  #settings.settings-directory .ws-group h2 { margin:0 0 8px; font-size:12px; font-weight:600; color:var(--faint); letter-spacing:.04em; text-transform:uppercase; display:flex; align-items:center; justify-content:space-between; }
  #settings.settings-directory .ws-result-list { display:flex; flex-direction:column; gap:0; background:var(--card)!important; border:1px solid var(--border)!important; border-radius:var(--radius-card,12px)!important; overflow:hidden; padding:0; box-shadow:none!important; }
  #settings.settings-directory .ws-result { background:transparent!important; border:0!important; border-bottom:1px solid var(--border)!important; border-radius:0!important; box-shadow:none!important; }
  #settings.settings-directory .ws-result:last-child { border-bottom:0!important; }
  #settings.settings-directory .ws-result-action { flex-direction:row; align-items:center; width:100%; padding:12px 16px; gap:12px; border-radius:0; }
  #settings.settings-directory .ws-result-action:hover { background:var(--hover); }
  #settings.settings-directory .ws-result-icon { width:30px; height:30px; border-radius:8px; flex:none; }
  #settings.settings-directory .ws-result-copy { flex:1; min-width:0; display:flex; flex-direction:column; gap:2px; }
  #settings.settings-directory .ws-result-copy strong { font-size:13.5px; }
  #settings.settings-directory .ws-result-copy small { font-size:12px; -webkit-line-clamp:1; }
  .ws-row-chev { color:var(--faint); font-size:18px; line-height:1; flex:none; }
  /* Workspace search calm hairline lists & focus width */
  .workspace-search-main { max-width:800px; }
  .workspace-search-main .ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Agents"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]) {
    display:flex; flex-direction:column; gap:0; background:var(--card)!important; border:1px solid var(--border); border-radius:var(--radius-card,12px); overflow:hidden; padding:0;
  }
  .workspace-search-main .ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Agents"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]) .ws-result {
    background:transparent!important; border:0; border-bottom:1px solid var(--border); border-radius:0;
  }
  .workspace-search-main .ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Agents"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]) .ws-result:last-child { border-bottom:0; }
  .workspace-search-main .ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Agents"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]) .ws-result-action {
    flex-direction:row; align-items:center; padding:11px 14px; gap:12px;
  }
  .workspace-search-main .ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Agents"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]) .ws-result-icon { width:30px; height:30px; border-radius:8px; }
  /* Calm Code Sidebar grouping: primary action + compact 2-up/3-up pills + collapsible extension drawer */
  .sb-action-row { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:6px; }
  .sb .sb-action-row .newbtn,.sb .sb-action-row .sb-chip { min-height:32px; padding:6px 8px; margin:0; font-size:12px; justify-content:center; width:100%; border-radius:8px; box-shadow:none; }
  .sb-tool-strip { display:grid; grid-template-columns:repeat(auto-fit,minmax(0,1fr)); gap:4px; margin-top:6px; padding:3px; background:var(--card); border:1px solid var(--border); border-radius:9px; }
  .sb .sb-tool-strip .sb-chip { min-height:28px; padding:0 6px; margin:0; justify-content:center; gap:5px; font-size:11.5px; border-radius:6px; width:100%; }
  .sb .sb-tool-strip .sb-chip.active { background:var(--card2); border:1px solid var(--border2); }
  .sb-config-drawer { margin-top:6px; border:1px solid var(--border); border-radius:9px; background:transparent; }
  .sb-config-drawer summary { list-style:none; cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:6px; padding:7px 10px; font-size:12px; font-weight:500; color:var(--muted); user-select:none; }
  .sb-config-drawer summary::-webkit-details-marker { display:none; }
  .sb-config-drawer summary:hover { color:var(--text); }
  .sb-config-meta { font-size:10.5px; color:var(--faint); font-weight:400; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sb-config-drawer[open] .sb-config-meta { display:none; }
  .sb-config-grid { display:grid; grid-template-columns:1fr 1fr; gap:4px; padding:0 6px 6px; border-top:1px solid var(--border); padding-top:6px; }
  .sb .sb-config-grid .sb-chip { min-height:30px; padding:0 8px; margin:0; font-size:11.5px; gap:6px; border-radius:6px; width:100%; }
  /* Calm Code Home project sidebar: hide inactive long OS paths & reveal row menu on hover/focus */
  .home-project:not(.is-current) .home-project-path { display:none; }
  .home-project { padding:6px 6px; gap:4px; }
  .home-project-options { opacity:0; transition:opacity .12s ease; }
  .home-project:hover .home-project-options,.home-project:focus-within .home-project-options,.home-project.is-current .home-project-options { opacity:1; }
  .home-project-badges:empty { display:none; }
  @media(max-width:720px) { #settings.settings { display:flex; flex-direction:column; overflow:auto; padding:60px 14px 28px; }#settings.settings .console-topbar { display:none; }#settings.settings .settings-close { display:inline-flex; }#settings.settings .setnav { width:100%; height:auto; flex:0 0 auto; flex-direction:row; gap:5px; margin:0 0 18px; padding:6px; border:1px solid var(--border); border-radius:12px; background:var(--card); overflow-x:auto; overflow-y:hidden; }#settings.settings .setnav-brand,#settings.settings .setnav-foot,#settings.settings .setnav .sect { display:none; }#settings.settings .setnav .back { flex:none; width:auto; margin:0 3px 0 0; }#settings.settings .setnav .item { width:auto; min-height:34px; padding:7px 11px; white-space:nowrap; }#settings.settings .setbody { width:100%; height:auto; padding:0 0 20px; overflow:visible; }#settings.settings .setbody h1 { font-size:22px; }#settings.settings .setrow { align-items:flex-start; flex-wrap:wrap; }#settings.settings .setrow .grow { min-width:180px; } }
  @media(max-width:600px) { .run-chat .progress { inset-inline:12px; padding:8px 10px; }.run-chat .bottom-composer { padding-inline:12px; } }
  @media(prefers-reduced-motion:reduce) { .workspace-search,.settings { animation:none!important; } }

  /* Pikpam Cloud Console Connections & Profile surfaces */
  :root { --astryx-ok:#4ade80; --astryx-err:#f87171; --astryx-warn:#f59e0b; --astryx-on-accent:#FFFFFF; }
  :root[data-theme="light"] { --astryx-ok:#0D8626; --astryx-err:#E3193B; --astryx-warn:#EB6E00; }
  .astryx-status-inline { display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:500; color:var(--muted); }
  .astryx-status-inline.ok { color:var(--astryx-ok); }
  .astryx-status-inline.err { color:var(--astryx-err); }
  .astryx-status-inline.warn { color:var(--astryx-warn); }
  .astryx-status-dot { width:7px; height:7px; border-radius:9999px; flex:none; background:var(--muted); }
  .astryx-status-dot.ok { background:var(--astryx-ok); }
  .astryx-status-dot.err { background:var(--astryx-err); }
  .astryx-status-dot.warn { background:var(--astryx-warn); }

  .connection-page-head { display:flex; flex-direction:column; gap:6px; margin:0 0 16px; }
  .connection-page-head h1 { margin:0; font-size:26px; line-height:1.22; font-weight:600; letter-spacing:-0.025em; color:var(--text); }
  .connection-page-head .connection-intro { margin:0; font-size:13.5px; line-height:1.5; color:var(--muted); max-width:720px; }
  .connection-manager-tabs { display:flex; align-items:center; gap:20px; border-bottom:1px solid var(--border); margin:0 0 20px; padding:0; }
  .connection-manager-tabs [data-connection-category] { position:relative; display:inline-flex; align-items:center; gap:8px; padding:8px 2px 11px; min-height:38px; border:0; border-radius:0; background:transparent; color:var(--muted); font-size:13.5px; font-weight:500; cursor:pointer; box-shadow:none; }
  .connection-manager-tabs [data-connection-category]:hover { color:var(--text); background:transparent; }
  .connection-manager-tabs [data-connection-category][aria-pressed="true"] { color:var(--text); font-weight:600; background:transparent; }
  .connection-manager-tabs [data-connection-category][aria-pressed="true"]::after { content:""; position:absolute; left:0; right:0; bottom:-1px; height:2px; border-radius:2px; background:var(--accent); }
  .connection-manager-tabs [data-connection-category] svg { width:16px; height:16px; opacity:.78; }
  .connection-manager-tabs [data-connection-category][aria-pressed="true"] svg { color:var(--accent); opacity:1; }

  /* Collapsible toolkit strip on Connections so Connected accounts + Browse grid sit cleanly above the fold */
  .cw-console-sides-bar { background:var(--card); border:1px solid var(--border); border-radius:var(--radius-card,12px); overflow:hidden; }
  .cw-console-sides-bar summary { list-style:none; cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:14px; padding:11px 16px; transition:background .12s ease; }
  .cw-console-sides-bar summary::-webkit-details-marker { display:none; }
  .cw-console-sides-bar summary:hover { background:var(--hover); }
  .cw-sides-summary-copy { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; min-width:0; }
  .cw-sides-summary-copy strong { font-size:13px; font-weight:600; color:var(--text); }
  .cw-sides-summary-copy span { font-size:12px; color:var(--muted); }
  .cw-sides-toggle { flex:none; font-size:11.5px; font-weight:500; color:var(--muted); padding:3px 9px; border-radius:6px; border:1px solid var(--border); background:var(--card2); }
  .cw-console-sides-bar[open] summary { border-bottom:1px solid var(--border); }
  .cw-console-sides-bar[open] .cw-sides-toggle { color:var(--text); border-color:var(--border2); }
  .cw-console-sides-bar .cw-console-sides { padding:12px; background:var(--bg); }
  .cw-console-sides { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
  .cw-console-side-card { display:grid; gap:7px; padding:16px 18px; background:var(--card); border:1px solid var(--border); border-radius:var(--radius-card,12px); }
  .cw-side-eyebrow { font-size:10.5px; font-weight:600; letter-spacing:.08em; color:var(--faint); text-transform:uppercase; }
  .cw-console-side-card strong { font-size:14.5px; font-weight:600; color:var(--text); }
  .cw-console-side-card p { margin:0; font-size:12.5px; color:var(--muted); line-height:1.48; }
  .cw-side-chips { display:flex; flex-wrap:wrap; gap:6px; margin-top:4px; }
  .cw-side-chips span { font-size:11.5px; color:var(--muted); padding:2px 8px; border-radius:6px; background:var(--card2); border:1px solid var(--border); }

  .cw-connected-summary { display:grid; gap:10px; }
  .cw-connected-summary[hidden] { display:none; }
  .cw-connected-sum-head h2 { margin:0; font-size:15px; font-weight:600; color:var(--text); }
  .cw-connected-sum-head p { margin:3px 0 0; font-size:12.5px; color:var(--muted); }
  .cw-connected-table { background:var(--card); border:1px solid var(--border); border-radius:var(--radius-card,12px); overflow:hidden; }
  .cw-table-head { display:grid; grid-template-columns:minmax(180px,1.5fr) minmax(130px,1fr) minmax(110px,.75fr) auto; gap:14px; padding:10px 18px; border-bottom:1px solid var(--border); font-size:11.5px; font-weight:500; color:var(--faint); }
  .cw-service-row.is-table { display:grid; grid-template-columns:minmax(180px,1.5fr) minmax(130px,1fr) minmax(110px,.75fr) auto; align-items:center; gap:14px; padding:12px 18px; border:0; border-bottom:1px solid var(--border); border-radius:0; background:transparent; margin:0; }
  .cw-service-row.is-table:last-child { border-bottom:0; }
  .cw-service-row.is-table:hover { background:var(--hover); }
  .cw-table-app { display:flex; align-items:center; gap:12px; min-width:0; }
  .cw-table-id code { font-family:var(--mono); font-size:12px; color:var(--muted); overflow-wrap:anywhere; }
  .cw-table-status { display:flex; align-items:center; }
  .cw-table-actions { display:flex; align-items:center; justify-content:flex-end; gap:8px; flex-wrap:wrap; }
  .cw-sum-status { display:inline-flex; align-items:center; gap:7px; font-size:12px; font-weight:500; color:var(--muted); }
  .cw-sum-status.ok { color:var(--astryx-ok); }
  .cw-sum-status.warn { color:var(--astryx-warn); }
  .cw-sum-status.err { color:var(--astryx-err); }
  .cw-sum-dot { width:7px; height:7px; border-radius:9999px; background:var(--muted); flex:none; }
  .cw-sum-status.ok .cw-sum-dot { background:var(--astryx-ok); }
  .cw-sum-status.warn .cw-sum-dot { background:var(--astryx-warn); }
  .cw-sum-status.err .cw-sum-dot { background:var(--astryx-err); }

  .connection-api-heading { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; margin:0 0 16px; }
  .connection-api-heading h2 { margin:0; font-size:16px; font-weight:600; color:var(--text); }
  .connection-api-heading .connection-intro { margin:4px 0 0; font-size:13px; color:var(--muted); }
  #connAddApi,#workspaceAddApi { min-height:36px; padding:0 14px; border-radius:var(--radius-inner,8px); background:var(--accent); color:var(--astryx-on-accent); border:1px solid transparent; font-size:13px; font-weight:600; }
  #connAddApi:hover,#workspaceAddApi:hover { filter:brightness(1.06); }

  .astryx-api-list { background:var(--card); border:1px solid var(--border); border-radius:var(--radius-card,12px); overflow:hidden; padding:0; display:flex; flex-direction:column; gap:0; }
  .astryx-api-row { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:14px 18px; border-bottom:1px solid var(--border); transition:background .12s ease; }
  .astryx-api-row:last-child { border-bottom:0; }
  .astryx-api-row:hover { background:var(--hover); }
  .astryx-item-icon { width:36px; height:36px; flex:none; display:inline-flex; align-items:center; justify-content:center; border-radius:8px; background:var(--card2); border:1px solid var(--border); color:var(--accent); font-size:14px; font-weight:600; }
  .astryx-row-main { min-width:0; flex:1; display:grid; gap:3px; }
  .astryx-row-title-line { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .astryx-row-title-line strong { font-size:14px; font-weight:600; color:var(--text); }
  .astryx-row-meta { font-size:12.5px; color:var(--muted); overflow-wrap:anywhere; }
  .astryx-row-actions { display:flex; align-items:center; gap:8px; flex:none; flex-wrap:wrap; }
  .astryx-row-actions .btn { min-height:32px; padding:0 12px; border-radius:var(--radius-inner,8px); background:var(--card2); color:var(--text); border:1px solid var(--border); font-size:12.5px; font-weight:500; }
  .astryx-row-actions .btn:hover { background:var(--hover); border-color:color-mix(in srgb,var(--accent) 40%,var(--border)); }
  .astryx-row-actions .btn[data-cndel]:hover { color:var(--astryx-err); border-color:color-mix(in srgb,var(--astryx-err) 45%,var(--border)); }
  .astryx-empty-list { background:var(--card); border:1px solid var(--border); border-radius:var(--radius-card,12px); padding:28px 20px; text-align:center; display:grid; justify-items:center; gap:6px; }
  .astryx-empty-list strong { font-size:14px; font-weight:600; color:var(--text); }
  .astryx-empty-list p { margin:0; font-size:13px; color:var(--muted); max-width:420px; }

  .cw-services { display:grid; gap:18px; min-width:0; }
  .cw-services-head { display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; }
  .cw-services-head h2 { margin:0; font-size:15px; font-weight:600; color:var(--text); }
  .cw-services-head p { margin:2px 0 0; font-size:12.5px; color:var(--muted); }
  .cw-services-controls-right { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .cw-services-controls { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  .cw-services-search { display:flex; align-items:center; gap:8px; min-width:0; flex:1; max-width:420px; }
  .cw-search-input-wrap { position:relative; display:flex; align-items:center; flex:1; min-width:180px; }
  .cw-search-input-wrap svg { position:absolute; left:11px; width:15px; height:15px; color:var(--muted); pointer-events:none; }
  #cwServicesQuery { width:100%; height:36px; padding:0 12px 0 34px; border-radius:var(--radius-inner,8px); border:1px solid var(--border); background:var(--card); color:var(--text); font-size:13px; }
  #cwServicesQuery:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 22%,transparent); }
  .cw-search-submit { height:36px; padding:0 14px; border-radius:var(--radius-inner,8px); border:1px solid var(--border2); background:var(--card2); color:var(--text); font-size:13px; font-weight:500; flex:none; }
  .cw-search-submit:hover { background:var(--hover); }
  .cw-services-actions { display:flex; align-items:center; gap:12px; }
  #cwServicesRefresh { width:34px; height:34px; padding:0; display:inline-flex; align-items:center; justify-content:center; border-radius:var(--radius-inner,8px); border:1px solid var(--border); background:var(--card); color:var(--muted); }
  #cwServicesRefresh:hover { color:var(--text); background:var(--hover); }
  .cw-services-showing { font-size:12.5px; color:var(--muted); white-space:nowrap; }
  .cw-services-tabs { display:inline-flex; align-items:center; gap:2px; padding:3px; border-radius:9px; background:var(--card2); border:1px solid var(--border); }
  .cw-services-tabs button { height:28px; padding:0 12px; border:0; border-radius:6px; background:transparent; color:var(--muted); font-size:12.5px; font-weight:500; display:inline-flex; align-items:center; gap:6px; box-shadow:none; }
  .cw-services-tabs button[aria-selected="true"] { background:var(--card); color:var(--text); font-weight:600; box-shadow:0 1px 2px color-mix(in srgb,#000 16%,transparent); }
  .cw-services-count { display:inline-flex; align-items:center; justify-content:center; min-width:18px; height:18px; padding:0 5px; border-radius:9999px; background:color-mix(in srgb,var(--accent) 16%,transparent); color:var(--accent); font-size:11px; font-weight:600; }
  .cw-services-count:empty { display:none; }
  .cw-services-agent { display:inline-flex; align-items:center; gap:8px; font-size:12.5px; color:var(--muted); }
  #cwServicesAgent { height:34px; padding:0 10px; border-radius:var(--radius-inner,8px); border:1px solid var(--border); background:var(--card); color:var(--text); font-size:12.5px; }
  .cw-app-heartbeat { display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:10px 14px; border-radius:10px; background:var(--card); border:1px solid var(--border); }
  #cwServicesHeartbeat { min-height:28px; padding:0 11px; border-radius:var(--radius-inner,8px); border:1px solid var(--border); background:var(--card2); color:var(--text); font-size:12px; font-weight:500; display:inline-flex; align-items:center; gap:7px; }
  #cwServicesHeartbeat::before { content:""; width:7px; height:7px; border-radius:9999px; background:var(--muted); flex:none; }
  #cwServicesHeartbeat[aria-pressed="true"] { border-color:color-mix(in srgb,var(--astryx-ok) 45%,var(--border)); color:var(--text); }
  #cwServicesHeartbeat[aria-pressed="true"]::before { background:var(--astryx-ok); }
  .cw-app-heartbeat small { font-size:12px; color:var(--muted); line-height:1.4; }
  .cw-services-content { display:grid; gap:22px; }
  .cw-service-section { display:grid; gap:12px; }
  .cw-service-section h3,.cw-service-section h2 { margin:0; font-size:13px; font-weight:600; letter-spacing:.01em; color:var(--muted); }
  .cw-service-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; background:transparent; border:0; border-radius:0; overflow:visible; }
  .cw-service-row.is-card { display:flex; flex-direction:column; align-items:stretch; text-align:left; gap:10px; padding:18px; border:1px solid var(--border); border-radius:var(--radius-card,12px); background:var(--card); box-shadow:none; margin:0; transition:background .12s ease,border-color .14s ease; }
  .cw-service-row.is-card:hover { background:var(--card2); border-color:var(--border2); }
  .cw-service-card-top { display:flex; align-items:center; width:100%; gap:12px; min-width:0; }
  .cw-service-desc { margin:0; width:100%; text-align:left; font-size:12.5px; color:var(--muted); line-height:1.48; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; min-height:37px; }
  .cw-service-card-foot { margin-top:auto; width:100%; display:flex; align-items:center; gap:8px; padding-top:4px; }
  .cw-service-card-foot .cw-service-action:first-child { flex:1; width:100%; justify-content:center; min-height:36px; border-radius:8px; }
  .cw-service-keybtn { width:36px; height:36px; padding:0; justify-content:center; }
  .cw-service-row:not(.is-card):not(.is-table) { display:flex; align-items:center; gap:14px; padding:14px 18px; border:1px solid var(--border); border-radius:var(--radius-card,12px); background:var(--card); }
  .cw-service-symbol { width:34px; height:34px; flex:none; border-radius:8px; border:1px solid var(--border); background:var(--card2); display:inline-grid; place-items:center; overflow:hidden; font-size:13px; font-weight:600; color:var(--text); }
  .cw-service-symbol>* { grid-area:1/1; }
  .cw-service-logo { width:24px; height:24px; object-fit:contain; }
  .cw-service-copy { min-width:0; flex:1; display:grid; gap:2px; }
  .cw-service-copy h3 { margin:0; font-size:14.5px; font-weight:600; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .cw-service-copy p { margin:0; font-size:12px; color:var(--muted); line-height:1.4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .cw-service-status { display:inline-flex; align-items:center; gap:6px; margin-top:2px; padding:0; border:0; background:transparent; font-size:11.5px; font-weight:500; color:var(--muted); }
  .cw-service-status::before { content:""; width:7px; height:7px; border-radius:9999px; background:var(--astryx-warn); flex:none; }
  .cw-service-status.connected { color:var(--astryx-ok); }
  .cw-service-status.connected::before { background:var(--astryx-ok); }
  .cw-service-action { display:inline-flex; align-items:center; justify-content:center; gap:7px; min-height:34px; padding:0 13px; border-radius:var(--radius-inner,8px)!important; font-size:12.5px; font-weight:500; flex:none; cursor:pointer; }
  .cw-service-action svg { width:14px; height:14px; flex:none; }
  .cw-service-action:not(.ghost) { background:var(--accent)!important; color:var(--astryx-on-accent)!important; border:1px solid transparent!important; font-weight:600; }
  .cw-service-action:not(.ghost):hover { filter:brightness(1.06); }
  .cw-service-action.ghost { background:var(--card2)!important; color:var(--text)!important; border:1px solid var(--border2)!important; font-weight:500; }
  .cw-service-action.ghost:hover { background:var(--hover)!important; border-color:rgba(255,255,255,.22)!important; }
  :root:not([data-theme="light"]) .cw-service-row.is-card .cw-service-card-foot .cw-service-action:not(.cw-danger-action) { background:#161922!important; color:#f4f4f5!important; border:1px solid rgba(255,255,255,.12)!important; font-weight:500; }
  :root:not([data-theme="light"]) .cw-service-row.is-card .cw-service-card-foot .cw-service-action:not(.cw-danger-action):hover { background:#1e2433!important; border-color:rgba(255,255,255,.22)!important; filter:none; }
  :root:not([data-theme="light"]) .cw-service-symbol { background:#161922; border-color:rgba(255,255,255,.10); color:#e4e4e7; }
  .cw-service-action.connected { color:var(--astryx-ok); border-color:color-mix(in srgb,var(--astryx-ok) 45%,var(--border)); }
  .cw-service-action.cw-danger-action { background:rgba(127,29,29,.25)!important; color:#fca5a5!important; border:1px solid rgba(239,68,68,.35)!important; }
  .cw-service-action.cw-danger-action:hover { background:rgba(127,29,29,.38)!important; border-color:rgba(239,68,68,.50)!important; }
  :root[data-theme="light"] .cw-service-action.cw-danger-action { background:rgba(227,25,59,.08)!important; color:#c81e3a!important; border:1px solid rgba(227,25,59,.25)!important; }
  .cw-app-suggestion { background:var(--card); border:1px solid var(--border); border-left:3px solid var(--accent); border-radius:var(--radius-card,12px); padding:14px 18px; display:grid; gap:6px; }
  .cw-service-empty { background:var(--card); border:1px solid var(--border); border-radius:var(--radius-card,12px); padding:26px 20px; text-align:center; font-size:13px; color:var(--muted); }
  @media(max-width:1040px) { .cw-service-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } .cw-console-sides { grid-template-columns:1fr; } }
  @media(max-width:640px) { .cw-service-grid { grid-template-columns:1fr; } .cw-table-head { display:none; } .cw-service-row.is-table { grid-template-columns:1fr; gap:8px; } .cw-table-actions { justify-content:flex-start; } }
  .cw-mail-section { display:grid; gap:10px; }
  .cw-mail-row-controls { display:flex; align-items:center; gap:8px; flex-wrap:wrap; flex:none; }
  .cw-mail-form,.custom-connection { background:var(--card); border:1px solid var(--border); border-radius:var(--radius-card,12px); padding:20px; display:grid; gap:14px; }
  .custom-connection-head { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; padding-bottom:12px; border-bottom:1px solid var(--border); }
  .custom-connection-head h2,.custom-connection-head h3 { margin:0; font-size:17px; font-weight:600; color:var(--text); }
  .custom-connection-fields { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:12px; }
  .custom-connection-field { display:grid; gap:6px; font-size:13px; font-weight:500; color:var(--text); }
  .custom-connection-field input,.custom-connection-field select,.custom-connection-field textarea,.cw-mail-form input,.cw-mail-form select { min-height:36px; padding:7px 11px; border-radius:var(--radius-inner,8px); border:1px solid var(--border); background:var(--card2); color:var(--text); font-size:13px; }
  .custom-connection-field input:focus,.custom-connection-field select:focus,.custom-connection-field textarea:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 22%,transparent); }
  .custom-connection-footer { display:flex; align-items:center; justify-content:flex-end; gap:8px; padding-top:12px; border-top:1px solid var(--border); }
  .custom-connection-footer .btn.dark { background:var(--accent); color:var(--astryx-on-accent); border:1px solid transparent; }

  /* Pikpam Customer Dashboard palette & surface system across non-Cowork-chat views (active Cowork chat untouched) */
  :root:not([data-theme="light"]) :is(#settings,#workspaceSearch,#cw.cw.page-open,.cw-agent-editor.modal,.cw-agent-switcher-modal.modal,#view .home.home-sky) {
    --bg:#090B10; --sidebar:#10141B; --card:#141923; --card2:#19202B; --hover:#1E2736;
    --border:rgba(255,255,255,.10); --border2:rgba(255,255,255,.18); --accent:#3B82F6; --radius-card:14px; --radius-inner:10px;
  }
  :root[data-theme="light"] :is(#settings,#workspaceSearch,#cw.cw.page-open,.cw-agent-editor.modal,.cw-agent-switcher-modal.modal,#view .home.home-sky) {
    --bg:#F7F8FA; --sidebar:#FFFFFF; --card:#FFFFFF; --card2:#EEF1F6; --hover:#E6ECF5;
    --border:rgba(0,0,0,.08); --border2:rgba(0,0,0,.15); --accent:#0057D8; --radius-card:14px; --radius-inner:10px;
  }

  .cw-profile-page { width:100%; height:100%; overflow:auto; background:var(--bg); padding:74px 24px 56px; }
  .cw-profile-close { position:fixed; top:16px; right:20px; z-index:30; width:34px; height:34px; border-radius:var(--radius-inner,10px); border:1px solid var(--border); background:var(--card); color:var(--muted); display:inline-flex; align-items:center; justify-content:center; cursor:pointer; }
  .cw-profile-close:hover { color:var(--text); background:var(--hover); }
  .cw-settings-dashboard { max-width:1160px; margin:0 auto; display:grid; gap:20px; }
  .cw-identity-hero { display:grid; grid-template-columns:minmax(0,1.35fr) minmax(0,1fr); gap:14px; align-items:stretch; background:transparent; border:0; border-radius:0; overflow:visible; }
  .cw-identity { display:flex; align-items:center; gap:16px; padding:18px 20px; background:var(--card); border:1px solid var(--border); border-radius:var(--radius-card,14px); margin:0; }
  .cw-identity-avatar { width:56px; height:56px; flex:none; padding:0; border-radius:12px; border:1px solid var(--border); background:var(--card2); display:inline-flex; align-items:center; justify-content:center; cursor:pointer; overflow:hidden; box-shadow:none; }
  .cw-identity-meta { min-width:0; flex:1; display:grid; gap:4px; }
  .cw-identity-meta h1 { margin:0; display:flex; align-items:center; gap:8px; }
  .cw-name-edit { padding:0; border:0; background:transparent; color:var(--text); font-size:21px; font-weight:600; line-height:1.25; letter-spacing:-.02em; text-align:left; cursor:pointer; }
  .cw-name-edit:hover { color:var(--accent); }
  .cw-identity-description { padding:0; border:0; background:transparent; color:var(--muted); font-size:13px; line-height:1.45; text-align:left; cursor:pointer; margin:0; }
  .cw-identity-actions { display:flex; align-items:center; gap:8px; flex:none; align-self:center; margin:0; }
  #cwProfileSettings { width:auto; min-height:36px; padding:0 13px; gap:6px; display:inline-flex; align-items:center; justify-content:center; border-radius:var(--radius-inner,10px); border:1px solid var(--border); background:var(--card2); color:var(--text); font-size:13px; font-weight:500; }
  #cwProfileSettings:hover { background:var(--hover); }
  .cw-profile-kpi-col { display:grid; gap:12px; align-content:stretch; }
  .cw-profile-kpi-row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  #cw.cw.page-open .cw-kpi-card { min-height:0; padding:14px 16px!important; border-radius:var(--radius-card,14px)!important; background:var(--card)!important; border:1px solid var(--border)!important; display:flex!important; flex-direction:column!important; align-items:flex-start!important; justify-content:center!important; gap:6px!important; cursor:pointer; transition:border-color .15s ease,transform .15s ease; }
  #cw.cw.page-open .cw-kpi-card:hover { border-color:var(--border2)!important; transform:translateY(-1px); }
  #cw.cw.page-open .cw-kpi-head { display:inline-flex!important; align-items:center!important; gap:6px!important; flex:none!important; }
  #cw.cw.page-open .cw-kpi-head svg { width:14px!important; height:14px!important; color:var(--accent)!important; flex:none!important; }
  #cw.cw.page-open .cw-kpi-card small { display:block; font-size:12px; color:var(--muted); margin:0!important; }
  #cw.cw.page-open .cw-kpi-card strong { display:block; font-size:16px; font-weight:600; color:var(--text); white-space:nowrap; }
  .cw-profile-task-row { display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; padding:14px 18px; border:1px solid var(--border); border-radius:var(--radius-card,14px); background:var(--card); margin:0; }
  .cw-profile-task-row strong { display:block; font-size:14px; font-weight:600; color:var(--text); }
  .cw-profile-task-row p { margin:2px 0 0; font-size:12.5px; color:var(--muted); }
  #cwProfileStart { min-height:36px; padding:0 16px; border-radius:var(--radius-inner,10px); background:var(--accent); color:var(--astryx-on-accent,#fff); border:1px solid transparent; font-size:13px; font-weight:600; display:inline-flex; align-items:center; gap:7px; }
  #cwProfileStart:hover { filter:brightness(1.06); }
  .cw-profile-tabs { display:flex; align-items:center; gap:20px; overflow-x:auto; border-bottom:1px solid var(--border); padding:0; margin:0; }
  .cw-profile-tabs [role="tab"] { position:relative; flex:none; display:inline-flex; align-items:center; gap:8px; padding:10px 2px 12px; min-height:40px; border:0; border-radius:0; background:transparent; color:var(--muted); font-size:13.5px; font-weight:500; cursor:pointer; }
  .cw-profile-tabs [role="tab"]:hover { color:var(--text); }
  .cw-profile-tabs [role="tab"][aria-selected="true"] { color:var(--text); font-weight:600; }
  .cw-profile-tabs [role="tab"][aria-selected="true"]::after { content:""; position:absolute; left:0; right:0; bottom:-1px; height:2px; border-radius:2px; background:var(--accent); }
  .cw-profile-tabs [role="tab"] svg { width:16px; height:16px; opacity:.78; }
  .cw-profile-tabs [role="tab"][aria-selected="true"] svg { color:var(--accent); opacity:1; }
  .cw-detail-page { display:grid; gap:16px; }
  .cw-detail-title h2 { margin:0; font-size:18px; font-weight:600; color:var(--text); letter-spacing:-.015em; }
  .cw-detail-title p { margin:4px 0 0; font-size:13px; color:var(--muted); }
  .cw-profile-page .cw-sky-card { background:var(--card); border:1px solid var(--border); border-radius:var(--radius-card,14px); box-shadow:none; backdrop-filter:none; }
  .cw-profile-form { display:grid; gap:16px; }
  .cw-profile-form.cw-sky-card { padding:20px 22px; }
  #cwPersonalityForm { grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
  #cwPersonalityForm > .cw-form-columns,
  #cwPersonalityForm > .cw-form-error,
  #cwPersonalityForm > .cw-form-actions { grid-column:1 / -1; }
  #cwPersonalityForm textarea { min-height:132px; }
  .cw-profile-overview-cards { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }
  .cw-overview-mini { display:flex; flex-direction:column; justify-content:space-between; gap:12px; padding:18px 20px; }
  .cw-overview-mini h3 { margin:0; font-size:15px; font-weight:600; color:var(--text); }
  .cw-overview-mini p { margin:0; font-size:13px; color:var(--muted); line-height:1.45; }
  .cw-overview-mini .btn { align-self:flex-start; }
  .cw-overview-mini-actions { display:flex; gap:8px; flex-wrap:wrap; }
  .cw-form-columns { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
  .cw-profile-form label { display:block; margin:0 0 6px; font-size:13px; font-weight:500; color:var(--text); }
  .cw-profile-form small { display:block; margin-top:5px; font-size:12px; color:var(--muted); }
  .cw-profile-form input:not([type="checkbox"]):not([type="radio"]),.cw-profile-form select,.cw-profile-form textarea,.cw-memory-search { width:100%; padding:8px 12px; border-radius:var(--radius-inner,10px); border:1px solid var(--border); background:var(--card2); color:var(--text); font-size:13.5px; line-height:1.45; }
  .cw-profile-form input:not([type="checkbox"]):not([type="radio"]):focus,.cw-profile-form select:focus,.cw-profile-form textarea:focus,.cw-memory-search:focus { outline:none; border-color:var(--accent); box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 22%,transparent); }
  .cw-form-actions { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; padding-top:12px; }
  .cw-form-actions .btn.dark { min-height:36px; padding:0 16px; border-radius:var(--radius-inner,10px); background:var(--accent); color:var(--astryx-on-accent,#fff); border:1px solid transparent; font-size:13px; font-weight:600; display:inline-flex; align-items:center; gap:6px; }
  #cwRolesForm { grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; }
  #cwRolesForm > div:nth-child(3),
  #cwRolesForm > .cw-form-error,
  #cwRolesForm > .cw-form-actions { grid-column:1 / -1; }
  #cwRoleRows.cw-profile-form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; background:transparent; border:0; border-radius:0; overflow:visible; padding:0; }
  .cw-role-editor { display:grid; grid-template-columns:auto 1fr auto; align-items:start; gap:12px; padding:16px 18px; border:1px solid var(--border); border-radius:var(--radius-card,14px); background:var(--card2); }
  #cwSkillsForm .cw-connections-grid,#cwProfileConnected .cw-connections-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; background:transparent; border:0; border-radius:0; overflow:visible; }
  .cw-skill-option { display:flex; flex-direction:row; align-items:flex-start; gap:12px; margin:0; padding:16px 18px; border:1px solid var(--border); border-radius:var(--radius-card,14px); background:var(--card); cursor:pointer; transition:border-color .15s ease,transform .15s ease; }
  .cw-skill-option:hover { border-color:var(--border2); transform:translateY(-1px); background:var(--card); }
  .cw-skill-option h3 { margin:0; font-size:14px; font-weight:600; color:var(--text); }
  .cw-skill-option p { margin:4px 0 0; font-size:13px; color:var(--muted); }
  .cw-connection-card { padding:18px 20px; border:1px solid var(--border); border-radius:var(--radius-card,14px); background:var(--card); display:flex; flex-direction:column; justify-content:space-between; gap:10px; }
  .cw-card-heading { display:flex; align-items:center; gap:12px; margin-bottom:4px; }
  .cw-card-heading h2 { margin:0; font-size:15px; font-weight:600; color:var(--text); }
  .cw-connected-label { display:inline-flex; align-items:center; gap:6px; margin:2px 0 0; font-size:12px; font-weight:500; color:var(--astryx-ok); }
  .cw-memory-layout { display:grid; grid-template-columns:minmax(0,1.05fr) minmax(0,1fr); gap:16px; align-items:start; }
  .cw-memory-layout > .cw-sky-card { padding:18px 20px; display:grid; gap:12px; }
  .cw-memory-filters { display:flex; align-items:center; gap:4px; flex-wrap:wrap; padding:3px; border-radius:10px; background:var(--card2); border:1px solid var(--border); }
  [data-memory-filter] { min-height:28px; padding:0 10px; border:0; border-radius:7px; background:transparent; color:var(--muted); font-size:12px; font-weight:500; }
  [data-memory-filter][aria-pressed="true"] { background:var(--card); color:var(--text); font-weight:600; }
  .cw-memory-list { display:flex; flex-direction:column; border:1px solid var(--border); border-radius:12px; overflow:hidden; }
  [data-memory-id] { display:grid; gap:3px; text-align:left; padding:11px 14px; border:0; border-bottom:1px solid var(--border); border-radius:0; background:transparent; color:var(--text); cursor:pointer; }
  [data-memory-id]:last-child { border-bottom:0; }
  [data-memory-id]:hover { background:var(--hover); }
  [data-memory-id][aria-pressed="true"] { background:var(--selected); }
  /* Console surface polish & ID-anchored UI_BUTTON_CSS specificity overrides (leaves active Cowork chat untouched) */
  :root:not([data-theme="light"]) #cw.cw.page-open > .cw-chat::before,
  :root:not([data-theme="light"]) #cw.cw.page-open > .cw-chat::after { display:none!important; }
  :root:not([data-theme="light"]) #cw.cw.page-open .cw-profile-page .cw-sky-card { background:#141923!important; border:1px solid rgba(255,255,255,.10)!important; border-radius:14px!important; box-shadow:none!important; backdrop-filter:none!important; -webkit-backdrop-filter:none!important; }
  :root:not([data-theme="light"]) #cw.cw.page-open .cw-profile-page .cw-profile-task-row { background:#141923!important; border:1px solid rgba(255,255,255,.10)!important; }
  #cw.cw.page-open .cw-profile-page .cw-profile-tabs,
  #cw.cw.page-open .cw-settings-dashboard .cw-profile-tabs { position:static!important; display:flex!important; align-items:center!important; gap:22px!important; padding:0!important; margin:0 0 20px!important; border:0!important; border-bottom:1px solid var(--border)!important; border-radius:0!important; background:transparent!important; box-shadow:none!important; backdrop-filter:none!important; -webkit-backdrop-filter:none!important; overflow-x:auto; }
  #cw.cw.page-open .cw-profile-page .cw-profile-tabs button[role="tab"],
  #cw.cw.page-open .cw-settings-dashboard .cw-profile-tabs button[role="tab"] { position:relative!important; flex:none!important; flex-direction:row!important; min-width:0!important; min-height:40px!important; padding:10px 4px 12px!important; border:0!important; border-radius:0!important; background:transparent!important; color:var(--muted)!important; font-size:13.5px!important; font-weight:500!important; box-shadow:none!important; }
  #cw.cw.page-open .cw-profile-page .cw-profile-tabs button[role="tab"]:hover,
  #cw.cw.page-open .cw-settings-dashboard .cw-profile-tabs button[role="tab"]:hover { background:transparent!important; color:var(--text)!important; transform:none!important; }
  #cw.cw.page-open .cw-profile-page .cw-profile-tabs button[role="tab"][aria-selected="true"],
  #cw.cw.page-open .cw-settings-dashboard .cw-profile-tabs button[role="tab"][aria-selected="true"] { background:transparent!important; color:var(--text)!important; font-weight:600!important; box-shadow:none!important; }
  #cw.cw.page-open .cw-profile-page .cw-profile-tabs button[role="tab"][aria-selected="true"] svg,
  #cw.cw.page-open .cw-settings-dashboard .cw-profile-tabs button[role="tab"][aria-selected="true"] svg { color:var(--accent)!important; opacity:1!important; }
  #cw.cw.page-open .cw-profile-page .cw-profile-tabs button[role="tab"][aria-selected="true"]::after,
  #cw.cw.page-open .cw-settings-dashboard .cw-profile-tabs button[role="tab"][aria-selected="true"]::after { content:""; position:absolute; left:0; right:0; bottom:-1px; height:2px; border-radius:2px; background:var(--accent); }
  :root:not([data-theme="light"]) #cw.cw.page-open .cw-profile-page .cw-profile-form input:not([type="checkbox"]):not([type="radio"]),
  :root:not([data-theme="light"]) #cw.cw.page-open .cw-profile-page .cw-profile-form textarea,
  :root:not([data-theme="light"]) #cw.cw.page-open .cw-profile-page .cw-profile-form select,
  :root:not([data-theme="light"]) #cw.cw.page-open .cw-profile-page .cw-memory-search { background:#19202B!important; border:1px solid rgba(255,255,255,.10)!important; border-radius:10px!important; color:#f4f4f5!important; }
  :root:not([data-theme="light"]) #cw.cw.page-open .cw-profile-close { background:#141923!important; border:1px solid rgba(255,255,255,.10)!important; color:#9ca3af!important; border-radius:10px!important; }
  #cw.cw.page-open .cw-profile-close svg, #cw.cw.page-open .workspace-search-trigger svg { color:var(--muted)!important; }
  :root:not([data-theme="light"]) #cw.cw.page-open .cw-profile-page .btn:not(.dark):not([role="tab"]) { background:#19202B!important; border:1px solid rgba(255,255,255,.12)!important; color:#f4f4f5!important; border-radius:10px!important; }
  :root:not([data-theme="light"]) #cw.cw.page-open .cw-profile-page .btn.dark { background:var(--accent)!important; border:1px solid transparent!important; color:#ffffff!important; border-radius:10px!important; font-weight:600!important; }
  #cw.cw.page-open .cw-top-nav { display:inline-flex!important; align-items:center!important; width:auto!important; background:var(--card)!important; border:1px solid var(--border)!important; border-radius:999px!important; padding:3px!important; gap:2px!important; box-shadow:none!important; }
  #cw.cw.page-open .cw-top-nav button[aria-pressed=true] { background:var(--accent)!important; color:#ffffff!important; border:0!important; border-radius:999px!important; font-weight:600!important; box-shadow:none!important; }
  #cw.cw.page-open .cw-top-nav button[aria-pressed=false] { background:transparent!important; border:0!important; color:var(--muted)!important; }
  #settings:not(.settings-directory) .console-topbar .theme-toggle { width:30px; height:30px; padding:5px; border-radius:8px!important; border:1px solid var(--border2)!important; background:var(--card)!important; color:var(--text)!important; }
  #settings:not(.settings-directory) .console-topbar .theme-toggle:hover { background:var(--hover)!important; }
  #settings:not(.settings-directory) .console-credit-pill { height:30px; padding:0 11px; border-radius:8px!important; border:1px solid var(--border2)!important; background:var(--card)!important; color:var(--text)!important; font:600 12px var(--mono); }
  #settings:not(.settings-directory) .console-credit-pill:hover { background:var(--hover)!important; }
  #settings:not(.settings-directory) .console-top-btn { height:30px; padding:0 12px; border-radius:8px!important; border:1px solid var(--border2)!important; background:var(--card2)!important; color:var(--text)!important; font-size:12.5px; font-weight:500; }
  #settings:not(.settings-directory) .console-top-btn:hover { background:var(--hover)!important; }
  #settings:not(.settings-directory) .setnav .back { border:1px solid var(--border)!important; background:var(--card)!important; border-radius:8px!important; }
  #settings:not(.settings-directory) .setnav .item.active { border-color:var(--border2)!important; background:var(--card2)!important; color:var(--text)!important; border-radius:8px!important; }
  #settings:not(.settings-directory) .setnav .item:hover { background:var(--hover)!important; }
  #settings .btn.ghost,
  :is(#settings,#cw.cw.page-open) .connection-manager-tabs [role="tab"],
  :is(#settings,#cw.cw.page-open) .cw-services-tabs [role="tab"],
  :is(#settings,#cw.cw.page-open) .cw-search-submit,
  :is(#settings,#cw.cw.page-open) .cw-service-action.ghost { min-height:34px; padding:0 13px; border-radius:10px!important; border:1px solid var(--border2)!important; background:var(--card2)!important; color:var(--text)!important; font-size:12.5px; font-weight:500; }
  #settings .btn.ghost:hover,
  :is(#settings,#cw.cw.page-open) .connection-manager-tabs [role="tab"]:hover,
  :is(#settings,#cw.cw.page-open) .cw-services-tabs [role="tab"]:hover,
  :is(#settings,#cw.cw.page-open) .cw-search-submit:hover,
  :is(#settings,#cw.cw.page-open) .cw-service-action.ghost:hover { background:var(--hover)!important; border-color:var(--border2)!important; }
  :is(#settings,#cw.cw.page-open) #cwServicesRefresh { width:34px; min-width:34px; height:34px; min-height:34px; padding:0!important; border-radius:10px!important; border:1px solid var(--border2)!important; background:var(--card2)!important; color:var(--text)!important; display:inline-flex; align-items:center; justify-content:center; }
  :is(#settings,#cw.cw.page-open) #cwServicesRefresh svg { width:15px; height:15px; display:block; }
  :is(#settings,#cw.cw.page-open) .connection-manager-tabs [role="tab"][aria-pressed="true"],
  :is(#settings,#cw.cw.page-open) .cw-services-tabs [role="tab"][aria-selected="true"] { background:#132440!important; border-color:rgba(59,130,246,.55)!important; color:#f4f4f5!important; font-weight:600; }
  :root[data-theme="light"] :is(#settings,#cw.cw.page-open) :is(.connection-manager-tabs [role="tab"][aria-pressed="true"],.cw-services-tabs [role="tab"][aria-selected="true"]) { background:#E6F0FF!important; color:#0052CC!important; border-color:rgba(0,87,216,.35)!important; }
  #settings .btn.dark,
  :is(#settings,#cw.cw.page-open) .cw-service-action:not(.ghost):not(.cw-danger-action) { min-height:34px; padding:0 14px; border-radius:10px!important; background:var(--accent)!important; color:var(--astryx-on-accent,#fff)!important; border:1px solid transparent!important; font-weight:600; }
  :root:not([data-theme="light"]) :is(#settings,#cw.cw.page-open) .cw-service-row.is-card .cw-service-card-foot .cw-service-action:not(.cw-danger-action) { background:#19202B!important; color:#f4f4f5!important; border:1px solid rgba(255,255,255,.12)!important; font-weight:500; }
  :root:not([data-theme="light"]) :is(#settings,#cw.cw.page-open) .cw-service-row.is-card .cw-service-card-foot .cw-service-action:not(.cw-danger-action):hover { background:#1E2736!important; border-color:rgba(255,255,255,.22)!important; }
  :is(#settings,#cw.cw.page-open) .cw-service-action.cw-danger-action { min-height:30px; padding:0 11px; border-radius:8px!important; background:rgba(127,29,29,.25)!important; color:#fca5a5!important; border:1px solid rgba(239,68,68,.35)!important; }
  :is(#settings,#cw.cw.page-open) .cw-service-action.cw-danger-action:hover { background:rgba(127,29,29,.38)!important; border-color:rgba(239,68,68,.50)!important; }
  :root[data-theme="light"] :is(#settings,#cw.cw.page-open) .cw-service-action.cw-danger-action { background:rgba(227,25,59,.08)!important; color:#c81e3a!important; border:1px solid rgba(227,25,59,.25)!important; }
  :root:not([data-theme="light"]) #view .home.home-sky .setup-card { background:#141923!important; border:1px solid rgba(255,255,255,.10)!important; border-radius:14px!important; padding:18px 20px!important; }
  /* Pikpam Cloud Console Settings width + multi-column card grids (replaces linear stacks) */
  #settings.settings .setbody { padding:24px max(24px,calc((100% - 1120px) / 2)) 56px!important; }
  #settings.settings-directory .setbody { max-width:none; padding:44px max(24px,calc((100% - 1120px) / 2)) 56px!important; }
  .ws-dir-head { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-bottom:18px; }
  .ws-dir-head-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .ws-overview-kpis { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; margin:0 0 18px; }
  #settings .ws-kpi-card { background:var(--card)!important; border:1px solid var(--border)!important; border-radius:var(--radius-card,14px)!important; padding:15px 17px!important; display:flex!important; flex-direction:column!important; align-items:flex-start!important; justify-content:space-between!important; gap:6px!important; text-align:left; cursor:pointer; min-width:0; transition:border-color .16s ease,transform .14s ease; }
  #settings .ws-kpi-card:hover { border-color:var(--border2)!important; transform:translateY(-1px); }
  #settings .ws-kpi-head { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--muted); min-width:0; }
  #settings .ws-kpi-head svg { width:14px; height:14px; color:var(--accent); flex:none; }
  #settings .ws-kpi-card strong { width:100%; font-size:16px; font-weight:600; color:var(--text); line-height:1.3; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  #settings .ws-kpi-card small { font-size:12px; color:var(--accent); margin-top:2px; font-weight:500; white-space:nowrap; }
  .ws-settings-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; margin-top:14px; align-items:start; }
  .ws-grid-card { padding:18px 20px!important; display:grid; gap:12px; }
  .ws-grid-card-foot { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  #settings #connectionsBody { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; background:transparent!important; border:0!important; box-shadow:none!important; padding:0!important; }
  #settings #connectionsBody > .setrow.astryx-api-row { background:var(--card); border:1px solid var(--border)!important; border-radius:var(--radius-card,14px); padding:16px 18px; margin:0; }
  #settings #connectionsBody > .astryx-empty-list { grid-column:1 / -1; background:var(--card); border:1px solid var(--border); border-radius:var(--radius-card,14px); }
  #settings.settings-directory .ws-result-list,
  .workspace-search-main .ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Agents"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]) {
    display:grid!important; grid-template-columns:repeat(3,minmax(0,1fr))!important; gap:12px!important;
    background:transparent!important; border:0!important; border-radius:0!important; overflow:visible!important; padding:0!important; box-shadow:none!important;
  }
  .workspace-search-main .ws-result-list[data-ws-group="Schedules"] { display:grid!important; grid-template-columns:repeat(2,minmax(0,1fr))!important; gap:12px!important; }
  #settings.settings-directory .ws-result,
  .workspace-search-main .ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Agents"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]) .ws-result {
    background:var(--card)!important; border:1px solid var(--border)!important; border-radius:var(--radius-card,14px)!important; overflow:hidden; box-shadow:none!important;
    transition:border-color .16s ease,transform .14s ease;
  }
  #settings.settings-directory .ws-result:hover,
  .workspace-search-main .ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Agents"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]) .ws-result:hover {
    border-color:var(--border2)!important; transform:translateY(-1px);
  }
  #settings.settings-directory .ws-result-action,
  .workspace-search-main .ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Agents"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]) .ws-result-action {
    flex-direction:column!important; align-items:flex-start!important; gap:10px!important; padding:16px 18px!important; height:100%!important;
  }
  #settings.settings-directory .ws-row-chev { display:none!important; }
  #settings.settings-directory .ws-result-copy small { -webkit-line-clamp:2!important; }
  .workspace-search-main { width:min(1120px,100%)!important; }
  #settings:not(.settings-directory) .connection-page-head { margin-bottom:10px; }
  #settings:not(.settings-directory) .connection-manager-tabs { margin-bottom:12px; }
  #settings:not(.settings-directory) .cw-console-sides { gap:14px; }
  #settings:not(.settings-directory) .cw-console-side-card { padding:16px 18px; gap:6px; border-radius:14px; }
  #settings:not(.settings-directory) .cw-services { gap:14px; }
  #settings:not(.settings-directory) .cw-table-head { padding:8px 16px; }
  #settings:not(.settings-directory) .cw-service-row.is-table { padding:9px 16px; }
  .cw-pikpam-foot-note { margin-top:4px; font-size:12px; }
  .cw-app-heartbeat { margin-top:18px; }
  :is(#cwAgentModal,.cw-modal.cw-agent-editor,.cw-agent-editor.modal) .btn.dark {
    background:var(--accent)!important; border-color:var(--accent)!important; color:#ffffff!important;
  }
  :is(#cwAgentModal,.cw-modal.cw-agent-editor,.cw-agent-editor.modal) .btn.dark:not(:disabled):hover {
    background:color-mix(in srgb,var(--accent) 88%,#000)!important; border-color:color-mix(in srgb,var(--accent) 88%,#000)!important;
  }
  :is(#cwAgentModal,.cw-modal.cw-agent-editor,.cw-agent-editor.modal) .cw-shapes button.cur {
    border-color:var(--accent)!important; background:color-mix(in srgb,var(--accent) 18%,var(--card))!important; color:var(--text)!important;
  }
  @media(max-width:1020px) {
    .cw-identity-hero,#cwPersonalityForm,#cwRolesForm,#cwRoleRows.cw-profile-form,.cw-profile-overview-cards,#cwSkillsForm .cw-connections-grid,#cwProfileConnected .cw-connections-grid,.ws-overview-kpis,.ws-settings-grid,#settings #connectionsBody,#settings.settings-directory .ws-result-list,.workspace-search-main .ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Agents"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]) {
      grid-template-columns:repeat(2,minmax(0,1fr))!important;
    }
    .cw-identity-hero { grid-template-columns:1fr!important; }
  }
  @media(max-width:720px) {
    .cw-profile-page { padding:68px 14px 44px; }
    .cw-identity { padding:14px 16px; }
    .cw-profile-kpi-row,.cw-profile-overview-cards,#cwSkillsForm .cw-connections-grid,#cwProfileConnected .cw-connections-grid,.cw-connections-grid,.ws-overview-kpis,#settings.settings-directory .ws-result-list,.workspace-search-main .ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Agents"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]) {
      grid-template-columns:repeat(2,minmax(0,1fr))!important; gap:10px!important;
    }
    .cw-overview-mini:last-child:nth-child(odd),.ws-kpi-card:last-child:nth-child(odd) { grid-column:1 / -1; }
    .cw-memory-layout,#cwPersonalityForm,#cwRolesForm,#cwRoleRows.cw-profile-form,.ws-settings-grid,#settings #connectionsBody,.workspace-search-main .ws-result-list[data-ws-group="Schedules"] { grid-template-columns:1fr!important; }
    .cw-modal.cw-agent-editor .cw-2col { grid-template-columns:repeat(2,minmax(0,1fr))!important; gap:10px!important; align-items:end!important; }
    .cw-modal.cw-agent-editor .cw-perm { grid-template-columns:repeat(2,minmax(0,1fr))!important; gap:8px!important; }
    .cw-modal.cw-agent-editor .cw-perm > label:last-child:nth-child(odd) { grid-column:1 / -1; }
    .cw-modal.cw-agent-editor .cw-shapes { grid-template-columns:repeat(3,minmax(0,1fr))!important; gap:6px!important; }
    #settings .setnav-brand,#settings .setnav-foot { display:none!important; }
    #settings.settings .setbody,#settings.settings-directory .setbody { padding:18px 14px 36px!important; }
    #settings.settings-directory .ws-result-action,.workspace-search-main .ws-result-list .ws-result-action { padding:12px 13px!important; gap:6px!important; }
    .cw-skill-option,.cw-connection-card { padding:12px!important; gap:8px!important; min-width:0; }
    .cw-connection-head { flex-wrap:wrap; gap:6px; }
    .cw-overview-mini { padding:12px!important; }
    .astyx-api-row,.cw-service-row { flex-wrap:wrap; }
  }
  @media(max-width:340px) {
    .cw-profile-kpi-row,.cw-profile-overview-cards,#cwSkillsForm .cw-connections-grid,#cwProfileConnected .cw-connections-grid,.cw-connections-grid,.ws-overview-kpis,#settings.settings-directory .ws-result-list,.workspace-search-main .ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Agents"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]),.cw-modal.cw-agent-editor .cw-2col,.cw-modal.cw-agent-editor .cw-perm { grid-template-columns:1fr!important; }
    .cw-modal.cw-agent-editor .cw-shapes { grid-template-columns:repeat(2,minmax(0,1fr))!important; }
  }
`;

const WORKSPACE_SETTINGS_ROWS = JSON.stringify(
  WORKSPACE_SETTINGS_CATALOG.map((item) => [
    item.id,
    item.icon,
    item.title,
    item.detail,
    item.group,
    item.keywords || '',
    (item.aliases || []).join(','),
    item.hidden ? 'hidden' : '',
  ]),
);

export const WORKSPACE_SEARCH_JS = String.raw`
  var workspaceSearchState=null;
  var WORKSPACE_SETTINGS=${WORKSPACE_SETTINGS_ROWS};
  function wsResolveSettingId(id) {
    var raw = String(id || '').trim().toLowerCase();
    if (!raw) return 'overview';
    var match = WORKSPACE_SETTINGS.find(function(item){ return item[0] === raw; });
    if (match) return match[0];
    match = WORKSPACE_SETTINGS.find(function(item){ return String(item[6] || '').split(',').map(function(v){ return v.trim(); }).filter(Boolean).indexOf(raw) >= 0; });
    return match ? match[0] : raw;
  }
  function wsSettingsSections(includeHidden) {
    return WORKSPACE_SETTINGS.filter(function(item){ return includeHidden || item[7] !== 'hidden'; }).map(function(item){
      return { id:item[0], icon:item[1], title:item[2], detail:item[3], group:item[4] || 'More', keywords:item[5] || '', aliases:String(item[6] || '').split(',').map(function(v){ return v.trim(); }).filter(Boolean), hidden:item[7] === 'hidden' };
    });
  }
  if (typeof window !== 'undefined') window.GITU_WORKSPACE_SETTINGS = wsSettingsSections(true);
  function wsNormalize(value) {return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
  function wsIcon(name) {return icon(name)||cwIcon(name)||actionSvg(name);}
  function wsFilter(items,query,category) {
    var terms=wsNormalize(query).trim().split(/\s+/).filter(Boolean);
    return items.filter(function(item){var text=wsNormalize(item.title+' '+item.detail+' '+(item.keywords||''));return (!category||category==='all'||item.category===category)&&terms.every(function(term){return text.indexOf(term)>=0;});});
  }
  function wsSettingsItems() {return wsSettingsSections(true).map(function(item){return {category:'Settings',title:item.title,detail:item.detail,icon:item.icon,action:'settings',id:item.id,keywords:item.keywords||''};});}
  function wsSelectedAgentId(data) {
    var cw=typeof cwEnsure==='function'?cwEnsure():{};
    var sel=cw.selectedAgentId;
    if(sel){
      var roster=(data&&Array.isArray(data.agents)&&data.agents.length)?data.agents:(cw.agents||[]);
      if(!roster.length||roster.some(function(agent){return agent.id===sel;}))return sel;
    }
    var active=typeof cwActiveConv==='function'?cwActiveConv():null;
    if(active)return active.kind==='dm'?(active.memberIds&&active.memberIds[0])||'':(active.chiefId||(active.memberIds&&active.memberIds[0])||'');
    return '';
  }
  function wsSelectedAgent(data) {
    var cw=typeof cwEnsure==='function'?cwEnsure():{},id=wsSelectedAgentId(data);
    if(!id)return null;
    var roster=(data&&Array.isArray(data.agents)&&data.agents.length)?data.agents:(cw.agents||[]);
    return roster.find(function(agent){return agent.id===id;})||{id:id,name:id};
  }
  function wsConvMembers(conv,cw) {
    if(conv&&Array.isArray(conv.memberIds))return conv.memberIds;
    var cached=cw&&Array.isArray(cw.convs)&&cw.convs.find(function(c){return c.id===conv.id;});
    return (cached&&Array.isArray(cached.memberIds))?cached.memberIds:null;
  }
  function wsBuildItems(mode,data,state) {
    var items=wsSettingsItems(),cw=cwEnsure();
    var selectedAgentId=wsSelectedAgentId(data),showAll=Boolean(state&&state.showAllAgents);
    function item(category,title,detail,icon,action,id,extra){items.push(Object.assign({category:category,title:title,detail:detail,icon:icon,action:action,id:id},extra||{}));}
    if(mode==='main') {
      item('Tools','New session','Start a conversation in your selected project','plus','new-session');
      item('Tools','New project','Create a space for your next idea','folder','new-project');
      item('Tools','Browser','Browse websites with the main agent','globe','tool','browser');
      item('Tools','Git','Review changes, branches, and commits','branch','tool','git');
      item('Tools','Cowork','Work with your agent team','users','cowork');
      if(S.active!=='home'&&S.active!=='cowork'){item('Tools','Task details','Plan, approvals, verification, and progress','layers','tool','state');item('Tools','Files and details','Artifacts and changed files for this session','folder','tool','files');}
      var mainRuns=data.runs||[],mainConvs=data.conversations||cw.convs||[];
      if(selectedAgentId&&!showAll){
        mainConvs.forEach(function(conv){
          var members=wsConvMembers(conv,cw);
          if(!Array.isArray(members)||members.indexOf(selectedAgentId)<0)return;
          if(conv.kind==='group')item('Groups',conv.title||'Group conversation','Connected group','users','conversation',conv.id,{aux:'delete-conversation',enterWorkspace:true,agentId:selectedAgentId,conversation:conv});
          else item('Sessions',conv.title||'Conversation','Agent conversation','chat','conversation',conv.id,{aux:'delete-conversation',enterWorkspace:true,agentId:selectedAgentId,conversation:conv});
        });
        mainRuns.filter(function(run){return run.coworkTask&&run.coworkTask.agentId===selectedAgentId;}).forEach(function(run){
          item('Sessions',sessionTitle(run.goal),[run.coworkTask.agentName,run.project,run.status,shortDate(run.startedAt)].filter(Boolean).join(' · '),'chat','run',run.runId,{run:run,keywords:run.goal,aux:'delete-run'});
        });
      } else {
        mainRuns.forEach(function(run){item('Sessions',sessionTitle(run.goal),[run.project,run.status,shortDate(run.startedAt)].filter(Boolean).join(' · '),'chat','run',run.runId,{run:run,keywords:run.goal,aux:'delete-run'});});
        if(showAll&&Array.isArray(mainConvs)){
          mainConvs.forEach(function(conv){
            if(conv.kind==='group')item('Groups',conv.title||'Group conversation','Group conversation','users','conversation',conv.id,{aux:'delete-conversation',enterWorkspace:true,conversation:conv});
            else item('Sessions',conv.title||'Conversation','Agent conversation','chat','conversation',conv.id,{aux:'delete-conversation',enterWorkspace:true,conversation:conv});
          });
        }
      }
      homeBuildProjects(data.projects||[],data.runs||[],effectiveProjectPath()).forEach(function(project){item('Projects',project.name,project.sessions.length+' conversations','folder','project',project.path,{project:project});});
    } else {
      item('Tools','New session','Start a fresh conversation with one or more teammates','plus','new-cowork-session');
      item('Tools','Create agent','Choose a character, purpose, personality, and tools','plus','new-agent');
      item('Tools','New group chat','Bring teammates together','users','new-group');
      item('Tools','Connections','Manage apps, accounts, and custom APIs','plug','connections');
      item('Tools','Learning mode','Memory, team preferences, and skill approvals','bolt','settings','cowork');
      item('Tools','Sign out of workspace','End this session on this device and return to sign-in','lock','lock');
      item('Tools','Main agent','Return to your coding workspace','terminal','home');
      (data.agents||[]).forEach(function(agent){item('Agents',agent.name,agent.tagline||agent.description||'AI teammate','users','agent',agent.id,{agent:agent,aux:'profile',keywords:agent.description});});
      (data.conversations||[]).forEach(function(conv){
        var members=wsConvMembers(conv,cw);
        var connected=!selectedAgentId||showAll||(members?members.indexOf(selectedAgentId)>=0:(!cw.active||conv.id===cw.active));
        if(conv.kind==='group'){
          if(connected)item('Groups',conv.title||'Group conversation','Connected group','users','conversation',conv.id,{aux:'delete-conversation',conversation:conv});
        } else if(connected) {
          item('Sessions',conv.title||'Conversation','Agent conversation','chat','conversation',conv.id,{aux:'delete-conversation',conversation:conv});
        }
        if(conv.schedule&&conv.schedule.every)item('Schedules',conv.schedule.goal||conv.title+' recurring task',(conv.schedule.enabled?'Active':'Paused')+' · Every '+conv.schedule.every+' · '+(conv.title||'Conversation'),'clock','conversation-schedule',conv.id,{keywords:conv.title,schedule:conv.schedule,conversation:conv});
      });
      (data.followUps||[]).slice().sort(function(a,b){return Date.parse(a.dueAt)-Date.parse(b.dueAt);}).forEach(function(followUp){
        var conv=(data.conversations||[]).find(function(conv){return conv.id===followUp.conversationId;}),agent=(data.agents||[]).find(function(agent){return agent.id===followUp.agentId;});
        if(!conv)return;
        item('Schedules',followUp.note,'One-time · Due '+new Date(followUp.dueAt).toLocaleString()+' · '+(agent?agent.name+' · ':'')+(conv.title||'Conversation'),'clock','followup',followUp.id,{conversationId:conv.id,keywords:followUp.dueAt,followUp:followUp,conversation:conv,agent:agent});
      });
      if(cwActiveConv()) {
        item('Tools','New thread','A separate topic in the current conversation','plus','new-thread');
        item('Tools','New mission','Give the current agent a task to finish','target','mission');
        item('Tools','Tag folder','Give this conversation folder context','folder','tag-folder');
        item('Tools','Schedule this chat','Configure recurring messages','clock','schedule');
        item('Tools','New widget','Pin a useful panel to this conversation','panel','new-widget');
        (cw.threads||[]).forEach(function(thread){item('Threads',thread.title,thread.topic||'Thread in '+cwActiveConv().title,'chat','thread',thread.id);});
        cwNowCards().filter(function(card){return card.kind!=='schedule';}).forEach(function(card){item('Activity',card.title,card.detail,card.icon,'now',card.id,{card:card});});
      }
    }
    (data.skills||[]).forEach(function(skill){item('Skills',skill.name,skill.description||'Reusable agent skill','bolt','skill',skill.name);});
    if(mode==='main')(data.jobs||[]).forEach(function(job){item('Schedules',job.goal,'Every '+job.every,'clock','job',job.id,{job:job});});
    return items;
  }
  function wsClose(refocus) {
    var state=workspaceSearchState;if(!state)return;
    workspaceSearchState=null;clearTimeout(state.timer);clearTimeout(state.refreshTimer);state.revision++;
    var page=$('workspaceSearch');if(page)page.remove();
    state.surfaces.forEach(function(surface){if(surface.node.isConnected)surface.node.inert=surface.inert;});
    document.body.classList.remove('workspace-search-open');document.title=state.title;
    if(refocus!==false&&state.focus&&state.focus.isConnected&&state.focus.focus)state.focus.focus({preventScroll:true});
  }
  function wsOpen(mode,category) {
    if(workspaceSearchState){$('workspaceSearchInput').focus();return;}
    if(typeof cwSaveDraft==='function')cwSaveDraft();
    var state={mode:mode||((S.active==='cowork')?'cowork':'main'),query:'',category:category||'all',items:[],hits:[],limit:8,loading:true,failures:[],revision:0,timer:null,focus:document.activeElement,title:document.title,surfaces:[]};
    ['shell','settings'].forEach(function(name){var node=name==='shell'?document.querySelector('.shell'):$('settings');if(node){state.surfaces.push({node:node,inert:node.inert});node.inert=true;}});
    workspaceSearchState=state;document.title='Search — Gitu';document.body.classList.add('workspace-search-open');
    var page=document.createElement('section');page.id='workspaceSearch';page.className='workspace-search';page.setAttribute('role','dialog');page.setAttribute('aria-modal','true');page.setAttribute('aria-labelledby','workspaceSearchTitle');
    page.innerHTML='<button class="workspace-search-close" id="workspaceSearchClose" aria-label="Close search">'+icon('x')+'</button><main class="workspace-search-main"><h1 id="workspaceSearchTitle" class="cw-visually-hidden">Search '+(state.mode==='cowork'?'Cowork':'main agent')+'</h1><p class="ws-context">'+(state.mode==='cowork'?'Your team, tools, and conversations':'Your projects, tools, and conversations')+'</p><label class="ws-search-field">'+icon('search')+'<input id="workspaceSearchInput" type="search" autocomplete="off" placeholder="'+(state.mode==='cowork'?'Search agents, chats, skills, and tools…':'Search sessions, skills, schedules, and tools…')+'" aria-label="Search workspace"><kbd>Esc</kbd></label><div class="ws-filters" id="workspaceSearchFilters" aria-label="Search categories"></div><p class="ws-status" id="workspaceSearchStatus" role="status" aria-live="polite"></p><div id="workspaceSearchResults"></div></main>';
    document.body.appendChild(page);$('workspaceSearchClose').onclick=function(){wsClose();};
    var input=$('workspaceSearchInput');input.oninput=function(){state.query=input.value;state.limit=8;state.hits=[];state.recallFailed=false;state.revision++;clearTimeout(state.timer);wsRender(state);if(state.mode==='cowork'&&state.query.trim().length>=2)state.timer=setTimeout(function(){wsRecall(state);},300);};
    page.onkeydown=function(event){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();wsClose();return;}
      if(event.key==='ArrowDown'&&event.target===input){var first=page.querySelector('.ws-result-action');if(first){event.preventDefault();first.focus();}}
      if(event.key==='Tab'){var controls=Array.from(page.querySelectorAll('button:not(:disabled),input'));var first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
    };
    if(page.animate&&!chatMotionReduced())page.animate([{opacity:0,filter:'blur(5px)'},{opacity:1,filter:'blur(0)'}],{duration:280,easing:'cubic-bezier(.16,1,.3,1)'});
    input.focus({preventScroll:true});wsRender(state);wsLoad(state);
  }
  async function wsLoad(state) {
    var loadRevision=state.loadRevision=(state.loadRevision||0)+1;
    var routes=state.mode==='cowork'?[['agents','/api/cowork/agents'],['conversations','/api/cowork/conversations']]:[['runs','/api/runs'],['projects','/api/projects'],['skills','/api/skills'],['jobs','/api/cron'],['agents','/api/cowork/agents'],['conversations','/api/cowork/conversations']];
    var results=await Promise.allSettled(routes.map(function(route){return api(route[1]);}));if(workspaceSearchState!==state||state.loadRevision!==loadRevision)return;
    var data={},previousFailures=state.failures;state.failures=[];results.forEach(function(result,index){var key=routes[index][0];if(result.status==='rejected'){if(state.mode==='cowork'||(key!=='agents'&&key!=='conversations'))state.failures.push(key);return;}var value=result.value||{};
      if(key==='agents'){data.agents=value.agents||[];data.skills=data.skills||value.availableSkills||[];var cw=cwEnsure();cw.agents=data.agents;if(value.availableSkills)cw.skills=value.availableSkills;}
      else if(key==='runs')data.runs=Array.isArray(value)?value:[];
      else {data[key]=value[key]||[];if(key==='conversations')data.followUps=value.followUps||[];}
    });
    if(Array.isArray(data.conversations))cwEnsure().convs=data.conversations;
    state.rawData=data;
    var items=wsBuildItems(state.mode,data,state),changed=state.loading||JSON.stringify(items)!==JSON.stringify(state.items)||JSON.stringify(previousFailures)!==JSON.stringify(state.failures);
    state.items=items;state.loading=false;if(changed)wsRender(state);wsScheduleRefresh(state);
  }
  function wsScheduleRefresh(state) {
    if(state.mode!=='cowork'||workspaceSearchState!==state)return;
    clearTimeout(state.refreshTimer);
    state.refreshTimer=setTimeout(function(){if(workspaceSearchState!==state)return;if(state.category==='Schedules')wsLoad(state);else wsScheduleRefresh(state);},10000);
  }
  async function wsRecall(state) {
    var revision=state.revision,query=state.query.trim();
    try{var data=await api('/api/cowork/search?q='+encodeURIComponent(query)+'&limit=20');if(workspaceSearchState!==state||state.revision!==revision)return;
      state.hits=(data.hits||[]).map(function(hit){return {category:'Messages',title:hit.conversationTitle||'Conversation',detail:hit.snippet||'',icon:'chat',action:'conversation',id:hit.conversationId,threadId:hit.threadId};});wsRender(state);
    }catch(e){if(workspaceSearchState===state&&state.revision===revision){state.recallFailed=true;wsRender(state);}}
  }
  function wsParseGoalText(goal,fallbackTitle){
    var text=String(goal||'').trim();
    if(!text)return {title:fallbackTitle||'Scheduled task',summary:'No instructions provided.'};
    var colonMatch=/^([A-Z][A-Za-z0-9 _-]{1,35}):\s*([\s\S]+)$/.exec(text);
    if(colonMatch){
      var heading=colonMatch[1].trim(),body=colonMatch[2].trim(),firstLine=body.split(/\r?\n/)[0].slice(0,100);
      return {title:heading,summary:firstLine+(body.length>firstLine.length?'…':'')};
    }
    var lines=text.split(/\r?\n/).map(function(l){return l.trim();}).filter(Boolean);
    if(lines.length>1){
      var lineTitle=lines[0].replace(/^#+\s*/,'').slice(0,50),rest=lines.slice(1).join(' ').slice(0,100);
      return {title:fallbackTitle||lineTitle,summary:rest+(lines.slice(1).join(' ').length>rest.length?'…':'')};
    }
    if(fallbackTitle&&fallbackTitle!=='Conversation'){
      var sum=text.slice(0,100);
      return {title:fallbackTitle,summary:sum+(text.length>100?'…':'')};
    }
    var sentenceMatch=/^([^.!?\n]{6,60}[.!?])\s*([\s\S]*)$/.exec(text);
    if(sentenceMatch){
      var sTitle=sentenceMatch[1].replace(/[.!?]$/,'').trim(),sRest=sentenceMatch[2].trim(),sSummary=sRest?sRest.slice(0,100):text;
      return {title:sTitle,summary:sSummary+(sRest&&sRest.length>100?'…':'')};
    }
    var shortTitle=text.length>44?text.slice(0,44).replace(/\s+\S*$/,'')+'…':text;
    return {title:shortTitle,summary:text};
  }

  function wsFormatFrequency(every){
    var s=String(every||'').trim();
    if(!s||s==='One-time')return s||'One-time';
    if(/^(\d+)\s*m(?:in(?:utes?)?)?$/i.test(s))return 'Every '+RegExp.$1+'m';
    if(/^(\d+)\s*h(?:ours?)?$/i.test(s))return 'Every '+RegExp.$1+(RegExp.$1==='1'?' hour':' hours');
    if(/^1\s*d(?:ays?)?$/i.test(s))return 'Daily';
    if(/^(\d+)\s*d(?:ays?)?$/i.test(s))return 'Every '+RegExp.$1+' days';
    if(/^1\s*w(?:eeks?)?$/i.test(s))return 'Weekly';
    if(/^(\d+)\s*w(?:eeks?)?$/i.test(s))return 'Every '+RegExp.$1+' weeks';
    if(/^\d+$/.test(s))return 'Every '+s+'m';
    return s.toLowerCase().startsWith('every')?s:'Every '+s;
  }

  function wsComputeNextRun(lastRunAt,every){
    if(!lastRunAt||!every)return '';
    try{
      var lastMs=Date.parse(lastRunAt);if(isNaN(lastMs))return '';
      var trimmed=String(every).trim(),intervalMs=0;
      var m=trimmed.match(/^(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hours?|d|days?|w|weeks?)?$/i);
      if(m){
        var n=Number(m[1]),unit=(m[2]||'m').toLowerCase();
        if(unit.startsWith('s'))intervalMs=n*1000;
        else if(unit.startsWith('h'))intervalMs=n*3600000;
        else if(unit.startsWith('d'))intervalMs=n*86400000;
        else if(unit.startsWith('w'))intervalMs=n*604800000;
        else intervalMs=n*60000;
      }
      if(!intervalMs)return '';
      var nextMs=lastMs+intervalMs,now=Date.now();
      while(nextMs<=now)nextMs+=intervalMs;
      var nextDate=new Date(nextMs);
      var isToday=nextDate.toDateString()===new Date().toDateString();
      return isToday?'Next: '+nextDate.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'Next: '+nextDate.toLocaleDateString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
    }catch(e){return '';}
  }

  function wsParseScheduleInfo(item){
    var rawGoal='',title='',summary='',every='',enabled=true,lastRunAt=null,dueAt=null,context='';
    if(item.schedule){
      rawGoal=item.schedule.goal||'';every=item.schedule.every||'';enabled=item.schedule.enabled!==false;lastRunAt=item.schedule.lastRunAt||null;
      title=(item.conversation&&item.conversation.title)||'';context=(item.conversation&&item.conversation.title)||'Chat';
    }else if(item.followUp){
      rawGoal=item.followUp.note||'';every='One-time';enabled=true;dueAt=item.followUp.dueAt||null;
      var agentName=item.agent&&item.agent.name,convTitle=item.conversation&&item.conversation.title;
      title=agentName?(agentName+' reminder'):'Reminder';if(convTitle)title+=' · '+convTitle;
      context=convTitle||(agentName||'Follow-up');
    }else if(item.job){
      rawGoal=item.job.goal||'';every=item.job.every||'';enabled=item.job.enabled!==false;lastRunAt=item.job.lastRunAt||null;context='Cron';
    }else{
      rawGoal=item.title||'';enabled=(item.detail||'').indexOf('Paused')<0;
      var mEvery=/Every\s+([^·]+)/i.exec(item.detail||'');
      if(mEvery)every=mEvery[1].trim();else if((item.detail||'').indexOf('One-time')>=0)every='One-time';
    }
    var parsed=wsParseGoalText(rawGoal,title);
    title=title||parsed.title;summary=parsed.summary||rawGoal;
    var instructions=rawGoal||item.title||'';
    var frequency=wsFormatFrequency(every);
    var nextText='';
    if(dueAt){
      try{
        var dueDate=new Date(dueAt);
        var isToday=dueDate.toDateString()===new Date().toDateString();
        nextText=isToday?'Due '+dueDate.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'Due '+dueDate.toLocaleDateString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
      }catch(e){}
    }else if(lastRunAt&&every){
      nextText=wsComputeNextRun(lastRunAt,every);
    }
    return {title:title||'Scheduled task',summary:summary,instructions:instructions,enabled:enabled,frequency:frequency,nextText:nextText,context:context};
  }

  function wsScheduleCardHtml(row,item){
    var info=wsParseScheduleInfo(item);
    var statusBadge='<span class="ws-sc-badge '+(info.enabled?'active':'paused')+'">'+(info.enabled?'Active':'Paused')+'</span>';
    var freqBadge=info.frequency?'<span class="ws-sc-badge frequency">'+esc(info.frequency)+'</span>':'';
    var nextBadge=info.nextText?'<span class="ws-sc-badge next">'+esc(info.nextText)+'</span>':'';
    var contextBadge=info.context&&info.context!==info.title?'<span class="ws-sc-badge context" title="'+esc(info.context)+'">'+esc(info.context)+'</span>':'';
    return '<div class="ws-result ws-schedule-card">'+
      '<div class="ws-sc-header">'+
        '<span class="ws-sc-icon-wrap" aria-hidden="true">'+wsIcon(item.icon||'clock')+'</span>'+
        '<div class="ws-sc-main">'+
          '<div class="ws-sc-top-row">'+
            '<button type="button" class="ws-sc-title-btn" data-ws-result="'+row.index+'" title="'+esc(info.title)+'">'+esc(info.title)+'</button>'+
            (item.aux?'<button class="ws-aux" data-ws-aux="'+row.index+'" aria-label="'+esc(item.aux==='profile'?'Profile for '+item.title:'Delete '+info.title)+'">'+(item.aux==='profile'?'Profile':actionSvg('trash'))+'</button>':'')+
          '</div>'+
          '<p class="ws-sc-summary">'+esc(info.summary)+'</p>'+
          '<div class="ws-sc-meta">'+statusBadge+freqBadge+nextBadge+contextBadge+'</div>'+
        '</div>'+
      '</div>'+
      '<div class="ws-sc-footer">'+
        '<button type="button" class="ws-sc-toggle" data-ws-sc-toggle="'+row.index+'" aria-expanded="false" aria-controls="ws-sc-inst-'+row.index+'">'+
          '<span class="ws-sc-chevron" aria-hidden="true">▸</span>'+
          '<span class="ws-sc-toggle-label">View instructions</span>'+
        '</button>'+
      '</div>'+
      '<div class="ws-sc-instructions" id="ws-sc-inst-'+row.index+'" hidden>'+
        '<div class="ws-sc-instructions-label">Automation instructions</div>'+
        '<pre class="ws-sc-prompt">'+esc(info.instructions||'No instructions provided.')+'</pre>'+
      '</div>'+
    '</div>';
  }

  function wsRender(state) {
    if(workspaceSearchState!==state)return;
    var filters=state.mode==='cowork'?['all','Sessions','Groups','Threads','Agents','Tools','Skills','Schedules','Activity','Settings','Messages']:['all','Sessions','Groups','Projects','Tools','Skills','Schedules','Settings'];
    $('workspaceSearchFilters').innerHTML=filters.map(function(filter){return '<button data-ws-filter="'+filter+'" aria-pressed="'+(state.category===filter)+'">'+(filter==='all'?'All':filter)+'</button>';}).join('');
    $('workspaceSearchFilters').querySelectorAll('[data-ws-filter]').forEach(function(button){button.onclick=function(){state.category=button.dataset.wsFilter;state.limit=30;wsRender(state);var next=$('workspaceSearchFilters').querySelector('[data-ws-filter="'+state.category+'"]');if(next)next.focus();if(state.mode==='cowork'&&state.category==='Schedules')wsLoad(state);};});
    var base=wsFilter(state.items,state.query,state.category),hits=(!state.category||state.category==='all'||state.category==='Messages')?state.hits:[],items=base.concat(hits);
    state.rendered=items;
    var groups=new Map();items.forEach(function(item,index){if(!groups.has(item.category))groups.set(item.category,[]);groups.get(item.category).push({item:item,index:index});});
    var order=state.mode==='cowork'?['Tools','Sessions','Groups','Threads','Agents','Messages','Activity','Skills','Schedules','Settings']:['Tools','Sessions','Groups','Projects','Skills','Schedules','Settings'];
    var activeAgent=wsSelectedAgent(state.rawData);
    var scopeStatus=(activeAgent&&(state.category==='Sessions'||state.category==='Groups'))?(!state.showAllAgents?(state.category==='Groups'?'Showing groups connected to '+activeAgent.name:'Showing sessions for '+activeAgent.name):'Showing all '+(state.category==='Groups'?'groups':'sessions')):'';
    $('workspaceSearchStatus').textContent=state.loading?'Loading your workspace…':state.failures.length?'Some '+state.failures.join(', ')+' could not load. You can retry.':state.recallFailed?'Message search is unavailable. Other results are still available.':state.query?items.length+' result'+(items.length===1?'':'s'):scopeStatus;
    var limit=(!state.query&&state.category==='all')?Math.min(state.limit||8,4):(state.limit||8);
    var html=order.filter(function(group){return groups.has(group);}).map(function(group){var rows=groups.get(group);return '<section class="ws-group" data-ws-group="'+group+'"><h2>'+group+'<span>'+rows.length+'</span></h2><div class="ws-result-list" data-ws-group="'+group+'">'+rows.slice(0,limit).map(function(row){var item=row.item;return group==='Schedules'?wsScheduleCardHtml(row,item):'<div class="ws-result"><button class="ws-result-action" data-ws-result="'+row.index+'"><span class="ws-result-icon" aria-hidden="true">'+(item.agent?cwAva(item.agent):wsIcon(item.icon))+'</span><span class="ws-result-copy"><strong>'+esc(item.title)+'</strong><small>'+esc(item.detail)+'</small></span></button>'+(item.aux?'<button class="ws-aux" data-ws-aux="'+row.index+'" aria-label="'+esc(item.aux==='profile'?'Profile for '+item.title:'Delete session '+item.title)+'">'+(item.aux==='profile'?'Profile':actionSvg('trash'))+'</button>':'')+'</div>';}).join('')+'</div>'+(rows.length>limit?'<button class="ws-more" data-ws-more="'+group+'">Show '+(rows.length-limit)+' more</button>':'')+'</section>';}).join('');
    if(!items.length&&!state.loading){
      var emptyMsg='No matches. Try a session title, agent name, skill, or setting.';
      if(state.mode==='cowork'&&state.category==='Schedules'&&!state.query)emptyMsg=state.failures.includes('conversations')?'Schedules could not load. Retry loading.':'No scheduled tasks yet. Ask a teammate to schedule a reminder, or use Schedule in the chat’s + menu.';
      else if(state.category==='Groups'&&!state.query)emptyMsg=(activeAgent&&!state.showAllAgents)?('No groups connected to '+esc(activeAgent.name)+' yet.'):'No groups created yet.';
      else if(state.category==='Sessions'&&!state.query&&activeAgent&&!state.showAllAgents)emptyMsg='No sessions for '+esc(activeAgent.name)+' yet. Start a new session or view all sessions.';
      html='<div class="ws-empty">'+emptyMsg+'</div>';
    }
    var actionBtns='';
    if(state.category==='Sessions'&&(state.mode==='cowork'||activeAgent))actionBtns+='<button class="btn dark" id="workspaceSearchNewSession">'+icon('plus')+'New session</button>';
    if(state.category==='Groups')actionBtns+='<button class="btn dark" id="workspaceSearchNewGroup">'+icon('plus')+'New group</button>';
    if(activeAgent&&(state.category==='Sessions'||state.category==='Groups'))actionBtns+='<button type="button" class="ws-scope-toggle" id="workspaceSearchScopeToggle">'+(state.showAllAgents?esc('Only '+activeAgent.name):'Show all')+'</button>';
    if(actionBtns)html='<div class="ws-actions-bar">'+actionBtns+'</div>'+html;
    if(state.failures.length)html='<button class="btn" id="workspaceSearchRetry">'+icon('retry')+'Retry loading</button>'+html;
    var target=$('workspaceSearchResults');target.innerHTML=html;
    target.querySelectorAll('[data-ws-result]').forEach(function(button){button.onclick=function(){wsActivate(state.rendered[Number(button.dataset.wsResult)]);};});
    target.querySelectorAll('[data-ws-more]').forEach(function(button){button.onclick=function(){state.limit+=30;wsRender(state);};});
    target.querySelectorAll('[data-ws-aux]').forEach(function(button){button.onclick=function(){var item=state.rendered[Number(button.dataset.wsAux)];if(item.aux==='profile')wsActivate({action:'profile',id:item.id});else if(item.aux==='delete-conversation')wsDeleteConversation(state,item,button);else wsDeleteRun(state,item,button);};});
    target.querySelectorAll('[data-ws-sc-toggle]').forEach(function(button){
      button.onclick=function(event){
        event.stopPropagation();event.preventDefault();
        var card=button.closest('.ws-schedule-card');if(!card)return;
        var inst=card.querySelector('.ws-sc-instructions');if(!inst)return;
        var expanded=button.getAttribute('aria-expanded')==='true';
        var next=!expanded;
        button.setAttribute('aria-expanded',String(next));
        button.classList.toggle('expanded',next);
        var label=button.querySelector('.ws-sc-toggle-label');
        if(label)label.textContent=next?'Hide instructions':'View instructions';
        var chevron=button.querySelector('.ws-sc-chevron');
        if(chevron)chevron.textContent=next?'▾':'▸';
        if(next){
          inst.hidden=false;inst.style.maxHeight='0px';inst.style.opacity='0';
          void inst.offsetHeight;
          inst.style.maxHeight=Math.min(inst.scrollHeight+30,320)+'px';
          inst.style.opacity='1';
        } else {
          inst.style.maxHeight='0px';inst.style.opacity='0';
          setTimeout(function(){if(button.getAttribute('aria-expanded')==='false')inst.hidden=true;},240);
        }
      };
    });
    if($('workspaceSearchNewSession'))$('workspaceSearchNewSession').onclick=function(){wsActivate({action:'new-cowork-session'});};
    if($('workspaceSearchNewGroup'))$('workspaceSearchNewGroup').onclick=function(){wsActivate({action:'new-group',agentId:activeAgent&&activeAgent.id});};
    if($('workspaceSearchScopeToggle'))$('workspaceSearchScopeToggle').onclick=function(){state.showAllAgents=!state.showAllAgents;state.items=wsBuildItems(state.mode,state.rawData||{runs:[],conversations:cwEnsure().convs||[],agents:cwEnsure().agents||[]},state);wsRender(state);};
    if($('workspaceSearchRetry'))$('workspaceSearchRetry').onclick=function(){state.loading=true;wsRender(state);wsLoad(state);};
  }
  function wsDeleteRun(state,item,button) {
    if(button.dataset.confirmDelete!=='true'){button.dataset.confirmDelete='true';button.textContent='Delete?';button.setAttribute('aria-label','Confirm deleting '+item.title);return;}
    button.disabled=true;api('/api/runs/'+encodeURIComponent(item.id),{method:'DELETE'}).then(function(){
      if(S.active===item.id){wsClose(false);openHome();return;}if(workspaceSearchState!==state)return;
      state.items=state.items.filter(function(result){return result.action!=='run'||result.id!==item.id;});renderSidebar();wsRender(state);wsLoad(state);
    }).catch(function(error){if(button.isConnected){button.disabled=false;button.dataset.confirmDelete='false';button.textContent='Retry';}toast(error.message,true);});
  }
  function wsDeleteConversation(state,item,button) {
    if(button.disabled)return;
    if(button.dataset.confirmDelete!=='true'){button.dataset.confirmDelete='true';button.textContent='Delete?';button.setAttribute('aria-label','Confirm deleting session '+item.title+' and all its threads and messages');return;}
    button.disabled=true;
    return cwDeleteSession(item.id).then(function(){
      if(typeof homeRenderSidebarAgentState==='function')homeRenderSidebarAgentState();
      if(workspaceSearchState!==state)return;
      if(state.rawData&&Array.isArray(state.rawData.conversations))state.rawData.conversations=state.rawData.conversations.filter(function(c){return c.id!==item.id;});
      state.items=state.items.filter(function(result){return !(['conversation','conversation-schedule'].includes(result.action)&&result.id===item.id)&&!(result.action==='followup'&&result.conversationId===item.id);});
      state.hits=state.hits.filter(function(result){return result.id!==item.id;});wsRender(state);wsLoad(state);
    }).catch(function(error){if(button.isConnected){button.disabled=false;button.dataset.confirmDelete='false';button.textContent='Retry';}toast(error.message,true);});
  }
  function wsActivate(item) {
    if(!item)return;wsClose(false);
    if($('settings')&&!$('settings').hidden)closeSettings();
    if(item.action==='run'){S.lastProjectPath=item.run.projectPath||S.lastProjectPath;openRun(item.id,{chatish:item.run.mode==='chat',mode:item.run.mode});}
    else if(item.action==='new-session'||item.action==='home'){if(S.active==='cowork')cwExit();else openHome();}
    else if(item.action==='new-project')newProject();
    else if(item.action==='project'){homeSelectProject(item.project);openHome();}
    else if(item.action==='tool')openToolPanel(item.id);
    else if(item.action==='settings')openSettings(typeof wsResolveSettingId==='function'?wsResolveSettingId(item.id):item.id);
    else if(item.action==='skill'){S.skillQuery=item.id;openSettings('skills');}
    else if(item.action==='job')openSettings('cron');
    else if(item.action==='cowork')openCowork();
    else if(item.action==='agent')cwOpenDm(item.id);
    else if(item.action==='profile')cwOpenProfile(item.id);
    else if(item.action==='conversation'){if(item.enterWorkspace&&S.active!=='cowork'&&typeof cwEnterWorkspace==='function')cwEnterWorkspace('conv',item.agentId||null,item.id,item.threadId||null);else cwOpenConv(item.id,item.threadId);}
    else if(item.action==='followup')cwOpenConv(item.conversationId,null);
    else if(item.action==='thread')cwSwitchThread(item.id);
    else if(item.action==='new-agent')cwAgentModal(null);
    else if(item.action==='new-cowork-session')cwNewSessionModal();
    else if(item.action==='new-group')cwGroupModal(item.agentId);
    else if(item.action==='connections')cwOpenConnections();
    else if(item.action==='lock')cwLockApp();
    else if(item.action==='new-thread')cwNewThreadModal();
    else if(item.action==='mission')cwMissionModal(cwActiveConv());
    else if(item.action==='tag-folder')cwFolderModal(cwActiveConv());
    else if(item.action==='schedule')cwScheduleModal(cwActiveConv());
    else if(item.action==='conversation-schedule'){cwOpenConv(item.id);cwScheduleModal(cwActiveConv());}
    else if(item.action==='new-widget')cwNewWidgetModal(cwActiveConv());
    else if(item.action==='now')cwNowAction(item.card.kind,item.card.id);
  }
  function wsSettingsDirectory() {
    var body=$('setbody'),cw=(typeof cwEnsure==='function'?cwEnsure():{}),agents=(cw&&cw.agents)||[];
    var rawProj=typeof effectiveProjectPath==='function'?effectiveProjectPath():(S&&S.settings&&S.settings.projectPath)||'';
    var projLabel=rawProj&&typeof basename==='function'?basename(rawProj):(rawProj||'Local workspace');
    var rawModel=(S&&S.sel&&S.sel.model)||'';
    var modelLabel=rawModel?rawModel.replace(/^pikrouter::/i,''):'PikRouter default';
    var teamLabel=agents.length?agents.length+' '+(agents.length===1?'teammate':'teammates'):'No teammates yet';
    body.innerHTML='<div class="ws-dir-head"><div><p class="ws-context" style="margin-bottom:6px;text-align:left">Console overview</p><h1 style="margin:0 0 4px;text-align:left">Workspace overview</h1><p class="ws-dir-sub" style="margin:0;text-align:left">Manage your workspace, AI models, connections, team capabilities, and security.</p></div><div class="ws-dir-head-actions"><button type="button" class="btn ghost" data-setting="providers">Providers</button><button type="button" class="btn dark" data-setting="connections">Connections</button></div></div>'+
      '<div class="ws-overview-kpis">'+
        '<button type="button" class="ws-kpi-card" data-setting="workspace"><span class="ws-kpi-head">'+icon('folder')+'<span>Active project</span></span><strong>'+esc(projLabel)+'</strong><small>Workspace →</small></button>'+
        '<button type="button" class="ws-kpi-card" data-setting="providers"><span class="ws-kpi-head">'+icon('layers')+'<span>Default model</span></span><strong>'+esc(modelLabel)+'</strong><small>Providers →</small></button>'+
        '<button type="button" class="ws-kpi-card" data-setting="cowork"><span class="ws-kpi-head">'+icon('users')+'<span>Agent team</span></span><strong>'+esc(teamLabel)+'</strong><small>Team &amp; learning →</small></button>'+
      '</div>'+
      '<label class="ws-search-field">'+icon('search')+'<input type="search" id="settingsDirectoryQuery" aria-label="Search settings" placeholder="Search settings, tools, and preferences…"></label><div id="settingsDirectoryResults"></div>';
    if(body.querySelectorAll)body.querySelectorAll('.ws-dir-head [data-setting], .ws-overview-kpis [data-setting]').forEach(function(button){button.onclick=function(){openSettings(button.dataset.setting);};});
    var input=$('settingsDirectoryQuery');
    function rowHtml(item){return '<div class="ws-result"><button class="ws-result-action" data-setting="'+item.id+'"><span class="ws-result-icon">'+icon(item.icon)+'</span><span class="ws-result-copy"><strong>'+esc(item.title)+'</strong><small>'+esc(item.detail)+'</small></span><span class="ws-row-chev" aria-hidden="true">&#8250;</span></button></div>';}
    function render(){
      var q=(input.value||'').trim(),all=wsSettingsSections(true),target=$('settingsDirectoryResults');
      if(q){
        var items=wsFilter(all.map(function(item){return {category:'Settings',title:item.title,detail:item.detail,icon:item.icon,action:'settings',id:item.id,keywords:item.keywords||''};}),q,'all');
        target.innerHTML='<section class="ws-group"><h2>Preferences and tools</h2><div class="ws-result-list">'+items.map(rowHtml).join('')+'</div>'+(items.length?'':'<p class="ws-empty">No matching settings.</p>')+'</section>';
      }else{
        var groups=['Console','AI & Integrations','Workspace & Safety','More'];
        target.innerHTML=groups.map(function(group){
          var list=all.filter(function(item){ return !item.hidden && item.group===group; });
          return list.length?'<section class="ws-group"><h2>'+group+'</h2><div class="ws-result-list">'+list.map(rowHtml).join('')+'</div></section>':'';
        }).join('');
      }
      target.querySelectorAll('[data-setting]').forEach(function(button){button.onclick=function(){openSettings(button.dataset.setting);};});
    }
    input.oninput=render;render();input.focus({preventScroll:true});
  }
`;
