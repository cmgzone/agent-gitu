/** Full-page discovery keeps the live conversation mounted beneath it. */
export const WORKSPACE_SEARCH_CSS = String.raw`
  :root { --brand-blue:#0064e0; --brand-on-blue:#fff; }
  :is(#view,#settings,#workspaceSearch,.cw-modal,.cw-desktop-dialog) :is(button.on,button.cur,button.active,button.sel,button[aria-selected=true],button[aria-pressed=true]):not(.toggle):not([role=switch]):not(.cw-colors button):not(.cw-item),
  :is(#cw,.home-sky,.run-chat) .cw-top-nav button[aria-pressed=true],.cw-settings-dashboard .cw-profile-tabs button[aria-selected=true],.cw-settings-dashboard .cw-memory-filters [aria-pressed=true],.cw-settings-dashboard .btn.dark {
    background:var(--dark)!important; color:var(--bg)!important;
  }
  :is(#view,#settings,#workspaceSearch) :is(button[aria-selected=true],button[aria-pressed=true],button.cur):not(.cw-item):not(:disabled):hover { background:color-mix(in srgb,var(--dark) 88%,var(--bg))!important; }
  :is(#view,#settings,.cw-modal,.cw-desktop-dialog) .btn.dark { background:var(--dark)!important; color:var(--bg)!important; }
  .cw-chat-face { display:inline-flex; align-items:center; justify-content:center; flex:none; width:22px; height:22px; }
  .cw-chat-face .cw-ava { position:relative; width:22px!important; height:22px!important; border-radius:50%!important; overflow:hidden!important; display:inline-flex; align-items:center; justify-content:center; background:color-mix(in srgb,var(--accent) 15%,transparent)!important; box-shadow:0 0 0 1px rgba(255,255,255,.25); }
  .cw-chat-face .cw-ava .cw-plush { width:100%; height:100%; display:flex; align-items:center; justify-content:center; transform:scale(1.25); transform-origin:50% 50%; }
  .cw-chat-face .cw-ava img { position:relative!important; width:100%!important; height:100%!important; max-width:100%!important; left:0!important; top:0!important; object-fit:contain!important; transform:none!important; }
  .workspace-search-trigger,.home-settings-trigger { position:absolute; top:calc(12px + env(safe-area-inset-top, 0px)); left:16px; z-index:11; display:grid; place-items:center; width:36px; height:36px; padding:0; border-radius:50%; color:var(--muted); }
  .workspace-search-trigger svg,.home-settings-trigger svg { width:18px; height:18px; }
  .home-settings-trigger { left:auto; right:16px; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) { background:var(--overlay); padding:24px; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) .box { width:min(560px,100%); max-height:min(88dvh,calc(100dvh - 48px)); border-radius:var(--radius-chat,28px); background:var(--card); border:1px solid var(--border); box-shadow:var(--shadow-float); }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) .bar { padding:22px 24px 12px; border:0; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) .bar > span:first-child { font-size:18px; font-weight:600; letter-spacing:-.025em; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) .cw-body { padding:0 24px 22px; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) label { font-size:12px; font-weight:500; text-transform:none; letter-spacing:0; color:var(--text); margin:16px 0 8px; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) :is(input[type=text],input[type=password],textarea,select) { background:var(--card2); border-color:var(--border); border-radius:var(--radius-el,12px); padding:12px 14px; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) :is(input,textarea,select):focus { border-color:var(--accent); box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 14%,transparent); }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) .cw-note { color:var(--text); font-size:12px; line-height:1.6; margin-top:16px; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) .cw-foot { padding:0 24px 22px; border:0; background:transparent; }
  @media(max-width:600px) { .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) { padding:16px; }.modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) .box { max-height:min(88dvh,calc(100dvh - 32px)); }.modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) .bar { padding:18px 18px 10px; }.modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) .cw-body { padding:0 18px 18px; }.modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) .cw-foot { padding:0 18px 18px; } }
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
  .sb .navitem { min-height:36px; border-radius:var(--radius-el,12px); transition:background-color .16s ease,color .16s ease; }
  .sb .navitem.active { background:var(--selected); color:var(--text); font-weight:600; box-shadow:none; }
  .sb .navitem.active .ico { color:var(--text); }
  .sb .sect { margin:18px 10px 6px; font-size:10px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; }
  .sb .proj,.sb .chat { min-height:34px; border-radius:var(--radius-inner,8px); }
  .sb .chat.active { background:var(--selected); color:var(--text); }
  .sb .foot { padding:10px 12px; background:var(--sidebar); }
  .project-chip { min-height:38px; border-radius:var(--radius-el,12px); border-color:var(--border); background:var(--card); }
  .sb .newbtn:focus-visible,.sb .navitem:focus-visible,.sb .proj:focus-visible,.sb .chat:focus-visible { outline-offset:1px; }
  .settings:not(.settings-directory) { display:flex; overflow:hidden; padding:0; background:var(--cw-chat-surface); }
  .settings:not(.settings-directory) .setnav { display:flex; flex:0 0 248px; flex-direction:column; gap:4px; width:248px; height:100%; margin:0; padding:76px 14px 20px; border:0; border-right:1px solid color-mix(in srgb,var(--border2) 48%,transparent); border-radius:0; background:color-mix(in srgb,var(--sidebar) 58%,transparent); overflow-y:auto; backdrop-filter:blur(24px); }
  .settings:not(.settings-directory) .setnav::before { content:'Settings'; display:block; margin:2px 10px 10px; color:var(--muted); font-size:10px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; }
  .settings:not(.settings-directory) .setnav .sect { display:none; }
  .settings:not(.settings-directory) .setnav .back { order:-1; justify-content:flex-start; margin:0 0 10px; padding:9px 10px; border:1px solid color-mix(in srgb,var(--border2) 35%,transparent); border-radius:11px; color:var(--muted); }
  .settings:not(.settings-directory) .setnav .item { width:100%; min-height:40px; flex:none; justify-content:flex-start; padding:9px 11px; border:1px solid transparent; border-radius:11px; font-size:12.5px; }
  .settings:not(.settings-directory) .setnav .item:hover { background:color-mix(in srgb,var(--hover) 70%,transparent); }
  .settings:not(.settings-directory) .setnav .item.active { border-color:color-mix(in srgb,var(--brand-blue) 18%,transparent); background:color-mix(in srgb,var(--brand-blue) 11%,var(--selected)); color:var(--brand-blue); }
  .settings:not(.settings-directory) .setnav .item.active .ico { color:var(--brand-blue); }
  .settings:not(.settings-directory) .setbody { width:min(100%,1050px); max-width:1050px; height:100%; margin:0 auto; padding:66px clamp(26px,6vw,88px) 52px; overflow-y:auto; }
  .settings:not(.settings-directory) .setbody h1 { margin:0 0 8px; font-size:28px; letter-spacing:-.04em; }
  .settings:not(.settings-directory) .setbody > h1 + :is(p,.appearance-description) { margin:0 0 24px; color:var(--muted); font-size:13px; line-height:1.6; }
  .settings:not(.settings-directory) .setbody h2 { margin-top:30px; font-size:11px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
  .settings:not(.settings-directory) .setcard { border-radius:18px; }
  .settings:not(.settings-directory) .setrow { min-height:68px; padding:16px 18px; }
  .settings:not(.settings-directory) .setrow .t { font-size:13px; }
  .settings:not(.settings-directory) .setrow .d { max-width:660px; line-height:1.5; }
  .settings:not(.settings-directory) .settings-close { z-index:2; top:16px; right:18px; }
  @media(max-width:720px) { .settings:not(.settings-directory) { display:flex; flex-direction:column; overflow:auto; padding:74px 14px 28px; }.settings:not(.settings-directory) .setnav { width:100%; height:auto; flex:0 0 auto; flex-direction:row; gap:5px; margin:0 0 22px; padding:6px; border:1px solid color-mix(in srgb,var(--border2) 40%,transparent); border-radius:18px; background:color-mix(in srgb,var(--card) 68%,transparent); overflow-x:auto; overflow-y:hidden; }.settings:not(.settings-directory) .setnav::before { display:none; }.settings:not(.settings-directory) .setnav .back { flex:none; margin:0 3px 0 0; border:0; }.settings:not(.settings-directory) .setnav .item { width:auto; min-height:36px; padding:8px 11px; white-space:nowrap; }.settings:not(.settings-directory) .setbody { width:100%; height:auto; padding:0 0 20px; overflow:visible; }.settings:not(.settings-directory) .setbody h1 { font-size:24px; }.settings:not(.settings-directory) .setrow { align-items:flex-start; flex-wrap:wrap; }.settings:not(.settings-directory) .setrow .grow { min-width:180px; } }
  @media(max-width:600px) { .run-chat .progress { inset-inline:12px; padding:8px 10px; }.run-chat .bottom-composer { padding-inline:12px; } }
  @media(prefers-reduced-motion:reduce) { .workspace-search,.settings { animation:none!important; } }
`;

export const WORKSPACE_SEARCH_JS = String.raw`
  var workspaceSearchState=null;
  var WORKSPACE_SETTINGS=[
    ['files','folder','Files & storage','Choose attachment size limits and manage file transfers'],
    ['general','gear','General','Appearance, defaults, reasoning, and autonomy'],['cowork','users','Cowork','Team preferences, learning, and skill approvals'],
    ['providers','layers','Providers','Models, API keys, and provider accounts'],['connections','plug','Connections','Apps, accounts, and service permissions'],
    ['permissions','shield','Permissions','Workspace access and action approvals'],['workspace','folder','Workspace','Project locations, files, and constraints'],
    ['project','search','Project','Inspect your current project'],['agents','users','Specialist agents','Coding specialists and orchestration'],
    ['skills','bolt','Skills','Find, create, and manage reusable skills'],['mcp','plug','MCP servers','Tools and server connections'],
    ['cron','clock','Schedules','Scheduled tasks and recurring heartbeats'],['developer','gear','Developer','Diagnostics and development preferences']
  ];
  function wsNormalize(value) {return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
  function wsIcon(name) {return icon(name)||cwIcon(name)||actionSvg(name);}
  function wsFilter(items,query,category) {
    var terms=wsNormalize(query).trim().split(/\s+/).filter(Boolean);
    return items.filter(function(item){var text=wsNormalize(item.title+' '+item.detail+' '+(item.keywords||''));return (!category||category==='all'||item.category===category)&&terms.every(function(term){return text.indexOf(term)>=0;});});
  }
  function wsSettingsItems() {return WORKSPACE_SETTINGS.map(function(item){return {category:'Settings',title:item[2],detail:item[3],icon:item[1],action:'settings',id:item[0]};});}
  function wsBuildItems(mode,data) {
    var items=wsSettingsItems(),cw=cwEnsure();
    function item(category,title,detail,icon,action,id,extra){items.push(Object.assign({category:category,title:title,detail:detail,icon:icon,action:action,id:id},extra||{}));}
    if(mode==='main') {
      item('Tools','New session','Start a conversation in your selected project','plus','new-session');
      item('Tools','New project','Create a space for your next idea','folder','new-project');
      item('Tools','Browser','Browse websites with the main agent','globe','tool','browser');
      item('Tools','Git','Review changes, branches, and commits','branch','tool','git');
      item('Tools','Cowork','Work with your agent team','users','cowork');
      if(S.active!=='home'&&S.active!=='cowork'){item('Tools','Task details','Plan, approvals, verification, and progress','layers','tool','state');item('Tools','Files and details','Artifacts and changed files for this session','folder','tool','files');}
      (data.runs||[]).forEach(function(run){item('Sessions',sessionTitle(run.goal),[run.project,run.status,shortDate(run.startedAt)].filter(Boolean).join(' · '),'chat','run',run.runId,{run:run,keywords:run.goal,aux:'delete-run'});});
      homeBuildProjects(data.projects||[],data.runs||[],effectiveProjectPath()).forEach(function(project){item('Projects',project.name,project.sessions.length+' conversations','folder','project',project.path,{project:project});});
    } else {
      item('Tools','New session','Start a fresh conversation with one or more teammates','plus','new-cowork-session');
      item('Tools','Create agent','Choose a character, purpose, personality, and tools','plus','new-agent');
      item('Tools','New group chat','Bring teammates together','users','new-group');
      item('Tools','Connections','Manage apps and accounts for your team','plug','connections');
      item('Tools','Learning mode','Memory, team preferences, and skill approvals','bolt','settings','cowork');
      item('Tools','Lock app','Require authentication before returning','lock','lock');
      item('Tools','Main agent','Return to your coding workspace','terminal','home');
      (data.agents||[]).forEach(function(agent){item('Agents',agent.name,agent.tagline||agent.description||'AI teammate','users','agent',agent.id,{agent:agent,aux:'profile',keywords:agent.description});});
      (data.conversations||[]).forEach(function(conv){
        item('Sessions',conv.title||'Conversation',conv.kind==='group'?'Group conversation':'Agent conversation','chat','conversation',conv.id,{aux:'delete-conversation'});
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
    var routes=state.mode==='cowork'?[['agents','/api/cowork/agents'],['conversations','/api/cowork/conversations']]:[['runs','/api/runs'],['projects','/api/projects'],['skills','/api/skills'],['jobs','/api/cron']];
    var results=await Promise.allSettled(routes.map(function(route){return api(route[1]);}));if(workspaceSearchState!==state||state.loadRevision!==loadRevision)return;
    var data={},previousFailures=state.failures;state.failures=[];results.forEach(function(result,index){var key=routes[index][0];if(result.status==='rejected'){state.failures.push(key);return;}var value=result.value;
      if(key==='agents'){data.agents=value.agents||[];data.skills=value.availableSkills||[];var cw=cwEnsure();cw.agents=data.agents;cw.skills=data.skills;}
      else if(key==='runs')data.runs=Array.isArray(value)?value:[];
      else {data[key]=value[key]||[];if(key==='conversations')data.followUps=value.followUps||[];}
    });
    if(state.mode==='cowork'&&data.conversations)cwEnsure().convs=data.conversations;
    var items=wsBuildItems(state.mode,data),changed=state.loading||JSON.stringify(items)!==JSON.stringify(state.items)||JSON.stringify(previousFailures)!==JSON.stringify(state.failures);
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
    var filters=state.mode==='cowork'?['all','Sessions','Threads','Agents','Tools','Skills','Schedules','Activity','Settings','Messages']:['all','Sessions','Projects','Tools','Skills','Schedules','Settings'];
    $('workspaceSearchFilters').innerHTML=filters.map(function(filter){return '<button data-ws-filter="'+filter+'" aria-pressed="'+(state.category===filter)+'">'+(filter==='all'?'All':filter)+'</button>';}).join('');
    $('workspaceSearchFilters').querySelectorAll('[data-ws-filter]').forEach(function(button){button.onclick=function(){state.category=button.dataset.wsFilter;state.limit=30;wsRender(state);var next=$('workspaceSearchFilters').querySelector('[data-ws-filter="'+state.category+'"]');if(next)next.focus();if(state.mode==='cowork'&&state.category==='Schedules')wsLoad(state);};});
    var base=wsFilter(state.items,state.query,state.category),hits=(!state.category||state.category==='all'||state.category==='Messages')?state.hits:[],items=base.concat(hits);
    state.rendered=items;
    var groups=new Map();items.forEach(function(item,index){if(!groups.has(item.category))groups.set(item.category,[]);groups.get(item.category).push({item:item,index:index});});
    var order=state.mode==='cowork'?['Tools','Sessions','Threads','Agents','Messages','Activity','Skills','Schedules','Settings']:['Tools','Sessions','Projects','Skills','Schedules','Settings'];
    $('workspaceSearchStatus').textContent=state.loading?'Loading your workspace…':state.failures.length?'Some '+state.failures.join(', ')+' could not load. You can retry.':state.recallFailed?'Message search is unavailable. Other results are still available.':state.query?items.length+' result'+(items.length===1?'':'s'):'';
    var html=order.filter(function(group){return groups.has(group);}).map(function(group){var rows=groups.get(group);return '<section class="ws-group" data-ws-group="'+group+'"><h2>'+group+'<span>'+rows.length+'</span></h2><div class="ws-result-list" data-ws-group="'+group+'">'+rows.slice(0,state.limit).map(function(row){var item=row.item;return group==='Schedules'?wsScheduleCardHtml(row,item):'<div class="ws-result"><button class="ws-result-action" data-ws-result="'+row.index+'"><span class="ws-result-icon" aria-hidden="true">'+(item.agent?cwAva(item.agent):wsIcon(item.icon))+'</span><span class="ws-result-copy"><strong>'+esc(item.title)+'</strong><small>'+esc(item.detail)+'</small></span></button>'+(item.aux?'<button class="ws-aux" data-ws-aux="'+row.index+'" aria-label="'+esc(item.aux==='profile'?'Profile for '+item.title:'Delete session '+item.title)+'">'+(item.aux==='profile'?'Profile':actionSvg('trash'))+'</button>':'')+'</div>';}).join('')+'</div>'+(rows.length>state.limit?'<button class="ws-more" data-ws-more="'+group+'">Show '+(rows.length-state.limit)+' more</button>':'')+'</section>';}).join('');
    if(!items.length&&!state.loading)html='<div class="ws-empty">'+(state.mode==='cowork'&&state.category==='Schedules'&&!state.query?(state.failures.includes('conversations')?'Schedules could not load. Retry loading.':'No scheduled tasks yet. Ask a teammate to schedule a reminder, or use Schedule in the chat’s + menu.'):'No matches. Try a session title, agent name, skill, or setting.')+'</div>';
    if(state.mode==='cowork'&&state.category==='Sessions')html='<button class="btn dark" id="workspaceSearchNewSession">'+icon('plus')+'New session</button>'+html;
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
      if(workspaceSearchState!==state)return;
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
    else if(item.action==='settings')openSettings(item.id);
    else if(item.action==='skill'){S.skillQuery=item.id;openSettings('skills');}
    else if(item.action==='job')openSettings('cron');
    else if(item.action==='cowork')openCowork();
    else if(item.action==='agent')cwOpenDm(item.id);
    else if(item.action==='profile')cwOpenProfile(item.id);
    else if(item.action==='conversation')cwOpenConv(item.id,item.threadId);
    else if(item.action==='followup')cwOpenConv(item.conversationId,null);
    else if(item.action==='thread')cwSwitchThread(item.id);
    else if(item.action==='new-agent')cwAgentModal(null);
    else if(item.action==='new-cowork-session')cwNewSessionModal();
    else if(item.action==='new-group')cwGroupModal();
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
    var body=$('setbody');body.innerHTML='<p class="ws-context">Make Gitu yours</p><h1>Settings</h1><label class="ws-search-field">'+icon('search')+'<input type="search" id="settingsDirectoryQuery" aria-label="Search settings" placeholder="Search settings, tools, and preferences…"></label><div id="settingsDirectoryResults"></div>';
    var input=$('settingsDirectoryQuery');
    function render(){var items=wsFilter(wsSettingsItems(),input.value,'all'),target=$('settingsDirectoryResults');target.innerHTML='<section class="ws-group"><h2>Preferences and tools</h2><div class="ws-result-list">'+items.map(function(item){return '<div class="ws-result"><button class="ws-result-action" data-setting="'+item.id+'"><span class="ws-result-icon">'+icon(item.icon)+'</span><span class="ws-result-copy"><strong>'+esc(item.title)+'</strong><small>'+esc(item.detail)+'</small></span></button></div>';}).join('')+'</div>'+(items.length?'':'<p class="ws-empty">No matching settings.</p>')+'</section>';target.querySelectorAll('[data-setting]').forEach(function(button){button.onclick=function(){openSettings(button.dataset.setting);};});}
    input.oninput=render;render();
  }
`;
