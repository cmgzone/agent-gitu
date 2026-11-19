import { COWORK_PROFILE_SETTINGS_CSS } from './ui-cowork-profile-settings.js';

/** Full-page profiles reuse the Cowork store, registry and authorization APIs. */
export const COWORK_DASHBOARD_CSS = String.raw`
  .cw.page-open { background:var(--cw-chat-surface); color:var(--text); }
  .cw.page-open > .cw-rail,.cw.page-open > .cw-splitter,.cw.page-open > .cw-info { display:none!important; }
  .cw.page-open > .cw-chat { width:100%; background:none; flex:1; overflow:hidden; }
  .cw-profile-page { height:100%; overflow:auto; padding:82px 28px 32px; color:var(--text); scroll-padding-top:90px; }
  .cw-page-nav { position:absolute; top:calc(12px + env(safe-area-inset-top, 0px)); left:50%; transform:translateX(-50%); z-index:10; }
  .cw.page-open .cw-top-nav { position:static; transform:none; background:color-mix(in srgb,var(--card) 54%,transparent); border:1px solid rgba(255,255,255,.25); box-shadow:0 3px 8px #1f5da71c; backdrop-filter:blur(20px) saturate(1.15); -webkit-backdrop-filter:blur(20px) saturate(1.15); padding:3px; gap:2px; border-radius:999px; }
  .cw.page-open .cw-top-nav button { color:var(--muted); min-height:34px; padding:0 14px; border-radius:999px; font-size:12.5px; font-weight:500; }
  .cw.page-open .cw-top-nav button > span { display:inline!important; }
  .cw.page-open .cw-top-nav button[aria-pressed=true] { color:#ffffff!important; background:var(--brand-blue,#226bd6)!important; font-weight:600; box-shadow:0 2px 8px -1px rgba(34,107,214,.45); }
  .cw-dashboard { max-width:1216px; margin:0 auto; }
  .cw-profile-tabs { display:flex; gap:8px; padding:5px; border:1px solid var(--border2); border-radius:24px; background:color-mix(in srgb,var(--card) 54%,transparent); margin:0 0 24px; }
  .cw-profile-tabs button { flex:1; min-width:120px; display:flex; flex-direction:column; align-items:center; gap:8px; min-height:88px; padding:12px; border:0; border-radius:20px; background:transparent; color:var(--text); font:inherit; font-size:15px; cursor:pointer; transition:background .18s,transform .18s; }
  .cw-profile-tabs svg { width:30px; height:30px; stroke-width:1.8; }
  .cw-profile-tabs button:hover { background:color-mix(in srgb,var(--card) 76%,transparent); transform:translateY(-1px); }
  .cw-profile-tabs button[aria-selected=true] { background:var(--selected); color:var(--accent); }
  .cw-dashboard button:focus-visible,.cw-dashboard a:focus-visible,.cw-page-nav button:focus-visible { outline:3px solid var(--accent); outline-offset:3px; }
  .cw-identity { display:grid; grid-template-columns:220px 1fr auto; gap:30px; align-items:center; margin:0 8px 22px; }
  .cw-identity-avatar { width:208px; height:208px; padding:10px; border:2px solid var(--border); border-radius:50%; background:var(--selected); box-shadow:inset 0 0 0 7px var(--accent); cursor:pointer; }
  .cw-identity-avatar .cw-ava { width:100%; height:100%; background:var(--card2)!important; border-radius:50%; overflow:hidden; }
  .cw-identity-avatar .cw-ava img { width:100%; height:100%; object-fit:contain; }
  .cw-identity-avatar[data-active=true] { animation:cw-profile-breathe 4s ease-in-out infinite; }
  .cw-identity > div { min-width:0; }
  .cw-role-badges span { max-width:100%; overflow-wrap:anywhere; }
  .cw-skill-option > span { min-width:0; overflow-wrap:anywhere; }
  .cw-identity h1 { font-size:clamp(32px,4vw,52px); line-height:1.1; letter-spacing:-.045em; margin:0 0 8px; }
  .cw-name-edit { padding:0; border:0; background:none; color:inherit; font:inherit; cursor:pointer; text-align:left; overflow-wrap:anywhere; }
  .cw-name-edit:hover { color:var(--accent); }
  .cw-role-badges,.cw-trait-list { display:flex; flex-wrap:wrap; gap:8px; }
  .cw-role-badges span,.cw-trait-list span { padding:7px 16px; border-radius:999px; background:color-mix(in srgb,var(--card) 76%,transparent); border:1px solid var(--border); color:var(--text); font-size:13px; }
  .cw-role-badges .primary { color:var(--bg); background:var(--accent); border-color:var(--accent); }
  .cw-identity-description { display:block; padding:0; border:0; background:none; text-align:left; font:inherit; color:var(--muted); margin:12px 0 8px; max-width:580px; line-height:1.5; cursor:pointer; }
  .cw-identity .cw-persona-status { background:none; border:0; color:var(--muted); font-size:12px; padding:0; }
  .cw-identity-actions { display:flex; gap:10px; align-self:start; margin-top:8px; }
  .cw-dashboard .btn,.cw-agent-editor .btn,.cw.page-open .cw-services .btn { min-height:42px; border-radius:999px; padding:9px 18px; font-size:13px; background:color-mix(in srgb,var(--card) 76%,transparent); border:1px solid var(--border); color:var(--text); display:inline-flex; gap:8px; align-items:center; justify-content:center; cursor:pointer; transition:background .18s,transform .18s; }
  .cw-dashboard .btn.dark,.cw-agent-editor .btn.dark,.cw.page-open .cw-services .btn.dark { background:var(--accent); color:var(--on-accent); border-color:var(--accent); box-shadow:0 3px 8px #0762d425; }
  .cw-dashboard .btn:hover,.cw-agent-editor .btn:hover,.cw.page-open .cw-services .btn:hover { transform:translateY(-1px); background:var(--hover); }
  .cw-dashboard .btn.dark:hover,.cw-agent-editor .btn.dark:hover { background:var(--accent); }
  .cw-dashboard .btn:disabled { opacity:.55; cursor:wait; transform:none; }
  .cw-overview-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .cw-sky-card { min-width:0; padding:20px; border:1px solid var(--card2); border-radius:20px; background:color-mix(in srgb,var(--card) 68%,transparent); box-shadow:0 2px 4px #24669e08; }
  .cw-summary-card { cursor:pointer; transition:background .18s,transform .18s; }
  .cw-summary-card:hover { background:var(--hover); transform:translateY(-2px); }
  .cw-card-heading { display:flex; align-items:flex-start; gap:14px; margin-bottom:14px; }
  .cw-card-heading > svg { width:32px; height:32px; flex:none; color:var(--accent); }
  .cw-card-heading h2 { margin:0 0 4px; font-size:22px; letter-spacing:-.025em; }
  .cw-card-heading p { margin:0; font-size:14px; line-height:1.5; color:var(--muted); }
  .cw-sky-tiles { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
  .cw-sky-tile { display:flex; align-items:center; gap:12px; min-width:0; min-height:70px; padding:12px; border:1px solid var(--border); border-radius:16px; background:color-mix(in srgb,var(--card) 78%,transparent); color:var(--text); text-align:left; font:inherit; font-size:13px; }
  .cw-sky-tile > svg { width:27px; height:27px; flex:none; color:var(--accent); }
  .cw-sky-tile strong,.cw-sky-tile small { display:block; }
  .cw-sky-tile small { color:var(--muted); line-height:1.35; margin-top:3px; font-size:12px; }
  .cw-sky-tile > span { flex:1; min-width:0; overflow-wrap:break-word; }
  .cw-sky-tile > .cw-profile-tool-icon { flex:none; }
  .cw-overview-roles { grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); }
  .cw-overview-roles .cw-sky-tile { flex-direction:column; align-items:flex-start; gap:8px; }
  .cw-connected-strip { margin-top:12px; }
  .cw-connected-strip .cw-card-heading { align-items:center; }
  .cw-connected-strip .cw-card-heading > div { flex:1; }
  .cw-connected-strip .cw-sky-tiles { grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); }
  .cw-connected-label { color:var(--ok)!important; }
  .cw-empty { padding:12px 0; font-size:14px; color:var(--muted); line-height:1.6; }
  .cw-empty .btn { margin-top:10px; }
  .cw-detail-page { animation:cw-profile-enter .2s ease-out both; }
  .cw-detail-title { display:flex; justify-content:space-between; gap:12px; align-items:center; margin:4px 0 18px; }
  .cw-detail-title h2 { margin:0 0 4px; font-size:30px; letter-spacing:-.035em; }
  .cw-detail-title p { margin:0; color:var(--muted); line-height:1.5; }
  .cw-profile-form { display:grid; gap:16px; }
  .cw-profile-form label,.cw-memory-editor label { display:block; font-size:14px; font-weight:600; margin-bottom:7px; }
  .cw-profile-form input:not([type=checkbox]):not([type=radio]),.cw-profile-form textarea,.cw-profile-form select,.cw-memory-search,.cw-memory-editor textarea { width:100%; padding:12px 14px; background:var(--card2); border:1px solid var(--border); color:var(--text); border-radius:13px; font:inherit; font-size:14px; outline:none; }
  .cw-profile-form input:focus,.cw-profile-form textarea:focus,.cw-profile-form select:focus,.cw-memory-search:focus,.cw-memory-editor textarea:focus { outline:2px solid var(--accent); outline-offset:2px; }
  .cw-profile-form textarea { min-height:110px; resize:vertical; }
  .cw-profile-form .cw-instructions { min-height:160px; }
  .cw-profile-form small { display:block; margin-top:6px; color:var(--muted); line-height:1.5; }
  .cw-form-columns { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .cw-form-actions { display:flex; align-items:center; gap:12px; justify-content:flex-end; }
  .cw-form-error { color:var(--err); flex:1; margin:0; font-size:13px; }
  .cw-role-editor { display:grid; grid-template-columns:auto 1fr auto; align-items:start; gap:12px; padding:16px; background:color-mix(in srgb,var(--card) 78%,transparent); border:1px solid var(--border); border-radius:16px; }
  .cw-role-editor > input { margin-top:15px; width:18px; height:18px; accent-color:var(--accent); }
  .cw-role-editor textarea { min-height:75px; margin-top:8px; }
  .cw-role-editor .btn { padding:9px 12px; }
  .cw-skill-option { display:flex; align-items:flex-start; gap:12px; }
  .cw-skill-option > input { margin-top:6px; width:18px; height:18px; accent-color:var(--accent); flex:none; }
  .cw-skill-option h3 { margin:0 0 6px; font-size:16px; }
  .cw-skill-option p { margin:0 0 10px; color:var(--muted); line-height:1.5; font-size:13px; }
  .cw-skill-option summary { font-size:12px; cursor:pointer; }
  .cw-memory-layout { display:grid; grid-template-columns:1.1fr 1fr; gap:16px; }
  .cw-memory-search { margin-bottom:12px; }
  .cw-memory-filters { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }
  .cw-memory-filters .btn { font-size:12px; min-height:34px; padding:7px 12px; }
  .cw-memory-filters [aria-pressed=true] { background:var(--text); color:var(--bg); }
  .cw-memory-list { display:grid; gap:8px; max-height:520px; overflow:auto; }
  .cw-memory-list button { width:100%; cursor:pointer; display:block; }
  .cw-memory-list button[aria-pressed=true] { border:2px solid var(--accent); }
  .cw-memory-list small { margin-top:8px; }
  .cw-memory-editor textarea { min-height:130px; resize:vertical; }
  .cw-memory-editor p,.cw-memory-editor li { color:var(--muted); font-size:13px; line-height:1.6; overflow-wrap:anywhere; }
  .cw-memory-editor details { margin:14px 0; }
  .cw-memory-editor summary { cursor:pointer; }
  .cw-memory-editor .cw-form-actions { justify-content:space-between; }
  .cw-connections-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
  .cw-connection-card .cw-card-heading h2 { font-size:18px; }
  .cw-connection-card p,.cw-connection-card li { font-size:13px; line-height:1.6; color:var(--muted); }
  .cw-connection-card .cw-form-actions { justify-content:flex-start; flex-wrap:wrap; }
  .cw.page-open .cw-services { height:100%; max-width:none; padding:92px max(24px,calc((100% - 1216px)/2)) 28px; background:none; color:var(--text); }
  .cw.page-open .cw-services-head h1 { font-size:36px; letter-spacing:-.035em; }
  .cw.page-open .cw-services p { color:var(--muted); }
  .cw.page-open .cw-services-controls { padding:15px; background:color-mix(in srgb,var(--card) 68%,transparent); border:1px solid var(--border); border-radius:20px; }
  .cw.page-open .cw-service-row { background:color-mix(in srgb,var(--card) 76%,transparent); padding:15px; border:1px solid var(--card2); border-radius:17px; }
  .cw.page-open .cw-service-grid { gap:12px; }
  .cw.page-open .cw-services input,.cw.page-open .cw-services select { background:var(--card2); color:var(--text); border-color:var(--border); }
  .cw-agent-editor.modal { padding:0; background:var(--bg); color:var(--text); backdrop-filter:none; -webkit-backdrop-filter:none; }
  .cw-agent-editor.modal .box { width:100%; max-width:none; height:100%; max-height:none; border:0; border-radius:0; background:var(--bg); box-shadow:none; }
  .cw-agent-editor .bar,.cw-agent-editor .cw-foot { width:min(100%,1160px); margin:0 auto; padding:14px 24px; border:0; background:none; }
  .cw-agent-editor .bar { border-bottom:1px solid var(--border); }
  .cw-agent-editor .cw-foot { border-top:1px solid var(--border); }
  .cw-agent-editor .bar > span:first-child { font-size:18px!important; font-weight:600; letter-spacing:-.025em; }
  .cw-agent-editor .btn { border-radius:10px; min-height:36px; padding:0 14px; font-size:13px; border:1px solid var(--border); background:var(--card2); color:var(--text); }
  .cw-agent-editor .btn:hover { background:var(--hover); }
  .cw-agent-editor .btn.dark { border-radius:10px; background:var(--accent)!important; color:#ffffff!important; border:1px solid transparent!important; font-weight:600; box-shadow:none; }
  .cw-agent-editor .btn.dark:hover { background:var(--accent)!important; filter:brightness(1.06); }
  .cw-agent-editor .cw-body { width:min(100%,1160px); margin:0 auto; padding:18px 24px 28px; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; align-items:stretch; align-content:start; }
  .cw-agent-editor .cw-editor-section { background:var(--card); border:1px solid var(--border); border-radius:14px; padding:18px 20px; margin:0; display:flex; flex-direction:column; }
  .cw-agent-editor .cw-editor-section:has(#cwAmCreateTeam),
  .cw-agent-editor .cw-editor-section:last-child:nth-child(odd):not(:first-child) { grid-column:1 / -1; }
  .cw-agent-editor #cwAmPrompt { flex:1; min-height:220px; }
  .cw-editor-section h2 { font-size:15px; font-weight:600; margin:0 0 12px; letter-spacing:-.015em; }
  .cw-agent-editor input:not([type=checkbox]):not([type=color]),.cw-agent-editor textarea,.cw-agent-editor select { background:var(--card2); color:var(--text); border:1px solid var(--border); border-radius:10px; }
  .cw-agent-editor .cw-avrow { display:grid; grid-template-columns:92px minmax(0,1fr); gap:12px 14px; align-items:start; padding:12px; margin-top:6px; border-radius:12px; background:var(--card2); border:1px solid var(--border); }
  .cw-agent-editor .cw-avprev { width:92px; height:92px; border-radius:12px; }
  .cw-agent-editor .cw-avprev img,.cw-agent-editor .cw-avprev svg { width:84px; height:84px; }
  .cw-agent-editor .cw-shapes { display:grid!important; grid-template-columns:repeat(auto-fill,minmax(78px,1fr))!important; gap:6px!important; }
  .cw-agent-editor .cw-shapes button { padding:5px 7px!important; font-size:11px!important; min-height:32px; justify-content:flex-start; }
  .cw-agent-editor .cw-shapes button.cur { border-color:var(--accent)!important; background:color-mix(in srgb,var(--accent) 18%,var(--card))!important; color:var(--text)!important; }
  .cw-agent-editor .cw-perm { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; margin-top:12px; padding:12px; background:var(--card2); border:1px solid var(--border); border-radius:10px; }
  .cw-agent-editor .cw-shapes button,.cw-agent-editor .cw-templates button,.cw-agent-editor .cw-skills button { background:var(--card2); color:var(--text); border:1px solid var(--border); border-radius:8px; }
  .cw-agent-editor .cw-skills button.on { border-color:var(--accent)!important; background:color-mix(in srgb,var(--accent) 18%,var(--card))!important; color:var(--text)!important; }
  .cw-agent-editor .cw-avhint,.cw-agent-editor .cw-note { color:var(--muted); }
  @keyframes cw-profile-breathe { 50% { transform:translateY(-2px) scale(1.008); } }
  @keyframes cw-profile-enter { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }
  @media(max-width:1100px) { .cw-identity { grid-template-columns:168px 1fr; gap:22px; }.cw-identity-avatar { width:160px; height:160px; }.cw-identity-actions { grid-column:2; margin-top:-12px; }.cw-profile-page { padding-inline:24px; }.cw-connections-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  @media(max-width:860px) { .cw-agent-editor .cw-body { grid-template-columns:1fr; } .cw-agent-editor .cw-perm { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  .cw-agent-switcher-modal .box { width:min(740px,94vw); max-height:min(86dvh,760px); background:var(--bg); border:1px solid var(--border); border-radius:16px; display:flex; flex-direction:column; overflow:hidden; box-shadow:var(--shadow-float); }
  .cw-agent-switcher-modal .bar { display:flex; align-items:center; gap:10px; padding:14px 18px; border-bottom:1px solid var(--border); background:var(--sidebar); }
  .cw-agent-switcher-modal .bar h2 { margin:0; font-size:15.5px; font-weight:600; color:var(--text); }
  .cw-switcher-count { display:inline-flex; align-items:center; justify-content:center; min-width:22px; height:20px; padding:0 7px; border-radius:999px; font-size:11px; font-weight:600; background:var(--card2); border:1px solid var(--border); color:var(--muted); }
  .cw-switcher-toolbar { display:flex; align-items:center; gap:10px; padding:14px 18px 0; }
  .cw-sw-search { flex:1; min-width:0; display:flex; align-items:center; gap:9px; height:38px; padding:0 12px; background:var(--card); border:1px solid var(--border2); border-radius:10px; transition:border-color .15s ease,box-shadow .15s ease; }
  .cw-sw-search:focus-within { border-color:var(--accent); box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 16%,transparent); }
  .cw-sw-search svg { width:15px; height:15px; color:var(--muted); flex:none; }
  #cwAgentSwitcher #cwSwitcherSearch { flex:1 1 auto!important; width:100%!important; min-width:0!important; height:100%!important; border:0!important; background:transparent!important; color:var(--text)!important; font:inherit!important; font-size:13px!important; padding:0!important; margin:0!important; outline:none!important; box-shadow:none!important; border-radius:0!important; }
  .cw-switcher-body { flex:1; min-height:0; overflow-y:auto; padding:14px 18px 18px; }
  .cw-agent-switcher-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:10px; }
  #cwAgentSwitcher .cw-sw-card-wrap { position:relative; display:flex; min-width:0; }
  #cwAgentSwitcher .cw-sw-card { width:100%; display:flex!important; flex-direction:column!important; align-items:flex-start!important; gap:10px!important; padding:14px!important; min-width:0; text-align:left; background:var(--card)!important; border:1px solid var(--border)!important; border-radius:14px!important; color:var(--text)!important; cursor:pointer; transition:border-color .15s ease,background-color .15s ease,transform .12s ease; }
  #cwAgentSwitcher .cw-sw-card:hover { border-color:var(--border2)!important; background:var(--card2)!important; transform:translateY(-1px); }
  #cwAgentSwitcher .cw-sw-card.is-active { border-color:var(--accent)!important; background:color-mix(in srgb,var(--accent) 10%,var(--card))!important; }
  #cwAgentSwitcher .cw-sw-card-del { position:absolute; top:10px; right:10px; z-index:2; min-width:26px; height:26px; padding:0 6px; border:1px solid transparent; border-radius:8px; background:transparent; color:var(--muted); display:inline-flex; align-items:center; justify-content:center; font:inherit; font-size:11px; font-weight:600; cursor:pointer; transition:color .14s ease,background-color .14s ease,border-color .14s ease; }
  #cwAgentSwitcher .cw-sw-card-del svg { width:13px; height:13px; flex:none; }
  #cwAgentSwitcher .cw-sw-card-del:hover { color:var(--err); background:color-mix(in srgb,var(--err) 12%,var(--card)); border-color:color-mix(in srgb,var(--err) 30%,transparent); }
  #cwAgentSwitcher .cw-sw-card-del.armed { color:#fff; background:var(--err); border-color:var(--err); padding:0 8px; }
  #cwAgentSwitcher .cw-sw-btn.danger { background:color-mix(in srgb,var(--err) 12%,var(--card))!important; border:1px solid color-mix(in srgb,var(--err) 32%,transparent)!important; color:var(--err)!important; }
  #cwAgentSwitcher .cw-sw-btn.danger:hover { background:color-mix(in srgb,var(--err) 18%,var(--card))!important; }
  #cwAgentSwitcher .cw-sw-btn.danger.armed { background:var(--err)!important; border-color:var(--err)!important; color:#fff!important; }
  .cw-sw-card-top { width:100%; display:flex; align-items:center; justify-content:space-between; gap:8px; min-width:0; }
  .cw-sw-card-ava { width:42px; height:42px; border-radius:12px; background:var(--card2); border:1px solid var(--border); display:inline-flex; align-items:center; justify-content:center; flex:none; padding:3px; }
  .cw-sw-card-ava .cw-ava { width:36px; height:36px; }
  .cw-sw-card-active { font-size:10.5px; font-weight:600; padding:2px 8px; border-radius:999px; background:color-mix(in srgb,var(--accent) 18%,var(--card)); border:1px solid color-mix(in srgb,var(--accent) 45%,transparent); color:var(--accent); white-space:nowrap; }
  .cw-sw-card-copy { width:100%; min-width:0; display:grid; gap:2px; }
  .cw-sw-card-copy strong { font-size:14px; font-weight:600; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cw-sw-card-copy span { font-size:12px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  #cwAgentSwitcher .cw-sw-btn { display:inline-flex!important; align-items:center!important; justify-content:center!important; gap:6px!important; height:34px; padding:0 12px!important; border-radius:10px!important; font:inherit!important; font-size:12.5px!important; font-weight:500!important; cursor:pointer; white-space:nowrap; flex:none; }
  #cwAgentSwitcher .cw-sw-btn svg { width:14px; height:14px; flex:none; }
  #cwAgentSwitcher .cw-sw-btn.ghost { background:var(--card2)!important; border:1px solid var(--border2)!important; color:var(--text)!important; }
  #cwAgentSwitcher .cw-sw-btn.ghost:hover { background:var(--hover)!important; }
  #cwAgentSwitcher .cw-sw-btn.primary { height:38px; padding:0 14px!important; background:var(--accent)!important; border:1px solid transparent!important; color:var(--astryx-on-accent,#fff)!important; font-weight:600!important; }
  #cwAgentSwitcher .cw-sw-btn.primary:hover { filter:brightness(1.06); }
  @media(max-width:720px) {
    .cw-agent-switcher-modal .bar,.cw-switcher-toolbar,.cw-switcher-body { padding-inline:14px; }
    .cw-agent-switcher-grid { grid-template-columns:repeat(2,minmax(0,1fr))!important; gap:10px!important; }
    #cwAgentSwitcher .cw-sw-card { padding:12px!important; gap:8px!important; }
  }
  @media(max-width:320px) { .cw-agent-switcher-grid { grid-template-columns:1fr!important; } }
  @media(max-width:720px) { .cw-profile-page { padding:68px 14px 28px; }.cw-page-nav { top:calc(10px + env(safe-area-inset-top, 0px)); }.cw-profile-tabs { overflow:auto; border-radius:0; margin-bottom:18px; gap:14px; }.cw-profile-tabs button { min-width:0; min-height:38px; font-size:13px; padding:8px 2px 10px; }.cw-profile-tabs svg { width:16px; height:16px; }.cw-identity { grid-template-columns:48px 1fr auto; gap:12px; margin:0; }.cw-identity-avatar { width:48px; height:48px; padding:0; box-shadow:none; }.cw-identity h1 { font-size:20px; }.cw-identity-description { font-size:12.5px; }.cw-role-badges { gap:5px; }.cw-role-badges span { font-size:11px; padding:5px 10px; }.cw-identity-actions { grid-column:auto; margin:0; }.cw-identity-actions .btn { flex:none; min-height:34px; }.cw-overview-grid,.cw-memory-layout { grid-template-columns:1fr; }.cw-connections-grid { grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }.cw-sky-card { padding:14px 16px; border-radius:14px; }.cw-card-heading { gap:10px; }.cw-card-heading h2 { font-size:16px; }.cw-card-heading p { font-size:12.5px; }.cw-connected-strip .cw-card-heading { flex-wrap:wrap; }.cw-connected-strip .cw-card-heading .btn { width:100%; }.cw-detail-title { align-items:flex-start; }.cw-detail-title h2 { font-size:17px; }.cw-detail-title .btn { padding:8px 12px; font-size:12px; }.cw-role-editor { gap:8px; padding:12px; }.cw-role-editor .btn { padding:8px; }.cw.page-open .cw-services { padding:82px 16px 24px; }.cw.page-open .cw-services-head { gap:12px; }.cw-agent-editor .cw-body,.cw-agent-editor .bar,.cw-agent-editor .cw-foot { padding-inline:14px; }.cw-agent-editor .cw-editor-section { padding:14px 16px; }.cw-agent-editor .cw-avrow { grid-template-columns:1fr; }.cw-agent-editor .cw-avprev { width:80px; height:80px; margin:0 auto; }.cw-agent-editor .cw-avprev img,.cw-agent-editor .cw-avprev svg { width:72px; height:72px; }.cw-agent-editor .cw-shapes { grid-template-columns:repeat(3,minmax(0,1fr))!important; }.cw-agent-editor .cw-perm { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }.cw-agent-editor #cwAmPrompt { min-height:130px; } }
  @media(prefers-reduced-motion:reduce) { .cw-identity-avatar,.cw-detail-page { animation:none!important; }.cw-dashboard * { transition:none!important; } }
${COWORK_PROFILE_SETTINGS_CSS}
`;

export const COWORK_DASHBOARD_JS = String.raw`
  var CW_PROFILE_SECTIONS=[['personality','heart','Personality'],['roles','user','Roles'],['skills','spark','Skills'],['memory','database','Memory'],['connections','link','Connections']];
  function cwProfileIcon(name) {
    var paths={heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',spark:'<path d="m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7L12 2Z"/>',database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',link:'<path d="m9 15 6-6m-5-3 2-2a5 5 0 0 1 7 7l-2 2m-3 5-2 2a5 5 0 0 1-7-7l2-2"/>'};
    return paths[name]?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>':cwIcon(name);
  }
  function cwPageNavHtml(active,agent) {
    var inCowork=Boolean(document.body&&document.body.classList&&document.body.classList.contains('cowork'));
    return (active!=='chat'?'<button class="workspace-search-trigger" id="cwPageSearch" aria-label="Search workspace" title="Search">'+cwIcon('search')+'</button>':'')+'<div class="cw-page-nav"><nav class="cw-top-nav" aria-label="App modes"><button type="button" id="cwCurrentChat" aria-pressed="'+inCowork+'"><span class="cw-chat-face" aria-hidden="true">'+(agent?cwAva(agent):'<span class="cw-ava"><img src="/characters/blue.png?v=opendots1" alt="" draggable="false"></span>')+'</span><span>Cowork</span></button><button type="button" id="cwHomeBtn" aria-pressed="'+(!inCowork)+'">'+cwIcon('home')+'<span>Code</span></button></nav></div>';
  }
  function cwProfileAgent() { var cw=cwEnsure(),conv=cwActiveConv();return cwAgentById((cw.profileOpen?cw.profileAgentId:cw.connectionsOpen?cw.connectionsAgentId:cw.selectedAgentId)||(conv&&(conv.chiefId||conv.memberIds[0]))); }
  function cwOpenProfile(agentId,section) {
    var cw=cwEnsure();cwSaveDraft();cwClosePanels();cw.memoryFilter='all';cw.memorySelectedId=null;cw.galleryOpen=false;cw.connectionsOpen=false;cw.connectionRevision=(cw.connectionRevision||0)+1;
    var conv=cwActiveConv(),agent=cwAgentById(agentId||cw.selectedAgentId||(conv&&(conv.chiefId||conv.memberIds[0])));
    if(!agent){toast('Choose a teammate to view their profile.');return;}
    if(typeof window!=='undefined'&&window.__gituAstryx&&typeof window.__gituAstryx.openProfile==='function'){window.__gituAstryx.openProfile(agent.id,section||'personality');return;}
    cw.profileAgentId=agent.id;cw.profileOpen=true;cw.profileSection=section||'personality';cw.profileRevision=(cw.profileRevision||0)+1;
    cwRenderProfilePage();cwSyncPanels();cwLoadProfileData(agent.id,cw.profileRevision);
  }
  function cwReturnToChat() {
    var cw=cwEnsure(),agent=cwProfileAgent();cw.profileOpen=false;cw.profileRevision=(cw.profileRevision||0)+1;cw.connectionsOpen=false;cw.connectionRevision=(cw.connectionRevision||0)+1;
    cwRenderChat();cwSyncPanels();if(agent&&(!cwActiveConv()||cwActiveConv().kind!=='dm'||cwActiveConv().memberIds[0]!==agent.id))cwOpenDm(agent.id);
    var input=$('cwInput');if(input)input.focus({preventScroll:true});
    if(!cw.timer&&cw.active){cwStartStream(cw.active);cwPoll();cw.timer=setInterval(cwPoll,2000);}
  }
  function cwProfileErrorText(error,fallback) {try{var parsed=JSON.parse(error.message);return parsed.error||fallback;}catch(e){return error.message||fallback;}}
  function cwStartProfileTask() {var cw=cwEnsure(),agent=cwProfileAgent();if(!agent)return;cw.pendingProfileMissionAgentId=agent.id;cwReturnToChat();cwFinishProfileTaskNavigation();}
  function cwFinishProfileTaskNavigation() {var cw=cwEnsure(),conv=cwActiveConv();if(cw.pendingProfileMissionAgentId&&conv&&conv.kind==='dm'&&conv.memberIds[0]===cw.pendingProfileMissionAgentId){cw.pendingProfileMissionAgentId=null;cwMissionModal();}}
  async function cwLoadProfileData(agentId,revision) {
    var cw=cwEnsure(),cache=cw.profileData||(cw.profileData={});cache[agentId]={loading:true};cwUpdateProfileData();
    var results=await Promise.allSettled([api('/api/cowork/agents/'+encodeURIComponent(agentId)+'/memory'),api('/api/connected-apps?agentId='+encodeURIComponent(agentId))]);
    if(!cw.profileOpen||cw.profileAgentId!==agentId||cw.profileRevision!==revision)return;
    var memory=results[0],apps=results[1];
    cache[agentId]={loading:false,entries:memory.status==='fulfilled'?memory.value.entries||[]:[],memoryError:memory.status==='rejected',apps:apps.status==='fulfilled'?apps.value:null,appsError:apps.status==='rejected'};
    if(apps.status==='fulfilled')cwSetAppConnectionState(agentId,apps.value);
    if(memory.status==='fulfilled')(cw.memoryCounts||(cw.memoryCounts={}))[agentId]=memory.value.count;
    cwUpdateProfileData();
  }
  function cwProfileData() { var cw=cwEnsure();return (cw.profileData||{})[cw.profileAgentId]||{loading:true,entries:[]}; }
  function cwConnectedProfileAccounts(data) {
    if(!data)return [];return (data.accounts||[]).concat(data.mail&&data.mail.accounts||[]).filter(function(account){return account.status==='ACTIVE'&&!account.disabled;}).filter(function(account,index,all){return all.findIndex(function(item){return item.id===account.id;})===index;});
  }
  function cwProfileAccountName(account,data) { var service=(data.services||[]).find(function(item){return item.slug===account.toolkit;});return service?service.name:({github:'GitHub',gmail:'Gmail',mail:'Mailbox',googledrive:'Google Drive',googlecalendar:'Google Calendar'}[account.toolkit]||cwActionWords(account.toolkit)); }
  function cwMemoryCategory(entry) { if(entry.type==='preference')return 'preferences';if(['project','project_fact'].indexOf(entry.type)>=0||/\bproject\b/i.test(entry.claim))return 'projects';if(['procedure','skill','success_pattern','task','episode','pattern','episodic','lesson'].indexOf(entry.type)>=0)return 'context';return 'facts'; }
  var CW_MEMORY_CATEGORIES=[['preferences','user','Preferences'],['projects','folder','Projects'],['context','clock','Long-term context'],['facts','file','Important facts']];
  function cwProfileCardHead(iconName,title,copy) {return '<div class="cw-card-heading">'+cwProfileIcon(iconName)+'<div><h2>'+esc(title)+'</h2><p>'+esc(copy)+'</p></div></div>';}
  function cwProfileSummary(section,iconName,title,copy,content) {return '<section class="cw-sky-card cw-summary-card" role="button" tabindex="0" data-profile-summary="'+section+'" aria-label="Open '+esc(title)+'">'+cwProfileCardHead(iconName,title,copy)+content+'</section>';}
  function cwProfileOverview(agent) {
    var traits=agent.personality&&agent.personality.traits||[],roles=agent.roles||[],registry=cwEnsure().skills||[],skills=(agent.skills||[]).map(function(name){return registry.find(function(skill){return skill.name===name;})||{name:name,missing:true};});
    var personality=cwProfileSummary('personality','heart','Personality',agent.personality&&agent.personality.communicationStyle||'Set the tone, habits, and instructions that guide your teammate.',traits.length?'<div class="cw-trait-list">'+traits.map(function(trait){return '<span>'+esc(trait)+'</span>';}).join('')+'</div>':'<p class="cw-empty">Make this teammate feel like yours.</p>');
    var role=cwProfileSummary('roles','user','Agent name and roles',agent.description||agent.tagline||'Give your teammate a clear purpose.',roles.length?'<div class="cw-sky-tiles cw-overview-roles">'+roles.map(function(role){return '<div class="cw-sky-tile">'+cwIcon(role.id===agent.primaryRoleId?'crown':'user')+'<span><strong>'+esc(role.name)+'</strong><small>'+esc(role.responsibilities||'No responsibilities added')+'</small></span></div>';}).join('')+'</div>':'<p class="cw-empty">No roles assigned. Add responsibilities here.</p>');
    var skill=cwProfileSummary('skills','spark','Skills','Capabilities from your shared skill library.',skills.length?'<div class="cw-sky-tiles">'+skills.slice(0,4).map(function(item){return '<div class="cw-sky-tile">'+cwIcon('terminal')+'<span><strong>'+esc(item.name)+'</strong><small>'+esc(item.missing?'Not in registry':item.description||'Assigned skill')+'</small></span></div>';}).join('')+'</div>':'<p class="cw-empty">Choose registered skills for this teammate.</p>');
    var memory=cwProfileSummary('memory','database','Memory','Private context that helps this teammate understand your work.','<div class="cw-sky-tiles" id="cwMemorySummary">'+CW_MEMORY_CATEGORIES.map(function(category){return '<div class="cw-sky-tile">'+cwIcon(category[1])+'<span><strong>'+category[2]+'</strong><small>Loading memories…</small></span></div>';}).join('')+'</div>');
    return '<div class="cw-overview-grid">'+personality+role+skill+memory+'</div><section class="cw-sky-card cw-connected-strip">'+cwProfileCardHead('link','Connected apps','Tools and services assigned to this teammate.')+'<div id="cwProfileConnected"><p class="cw-empty" role="status">Checking connections…</p></div></section>';
  }
  function cwProfileFormActions() { return '<div class="cw-form-actions"><p class="cw-form-error" id="cwProfileError" role="alert"></p><button class="btn dark" type="submit">'+cwIcon('check')+'Save changes</button></div>'; }
  function cwPersonalityPage(agent) { var p=agent.personality||{};return '<form id="cwPersonalityForm" class="cw-profile-form cw-sky-card"><div class="cw-form-columns"><div><label for="cwTraits">Personality traits</label><input id="cwTraits" value="'+esc((p.traits||[]).join(', '))+'" placeholder="Focused, friendly, reliable"><small>Separate traits with commas. Choose up to ten.</small></div><div><label for="cwProactivity">Proactivity</label><select id="cwProactivity"><option value="reactive">Follow my lead</option><option value="suggest"'+(p.proactivity==='suggest'?' selected':'')+'>Suggest useful next steps</option><option value="proactive"'+(p.proactivity==='proactive'?' selected':'')+'>Take initiative and keep me informed</option></select><small>Suggestions follow the existing task permissions.</small></div></div><div><label for="cwCommunication">Communication style</label><textarea id="cwCommunication" placeholder="Clear, concise, and warm…">'+esc(p.communicationStyle||'')+'</textarea></div><div><label for="cwInstructions">Behavioral instructions</label><textarea id="cwInstructions" class="cw-instructions" placeholder="How should this teammate approach its work?">'+esc(agent.systemPrompt||'')+'</textarea></div>'+cwProfileFormActions()+'</form>'; }
  function cwRoleRowHtml(role,primary) {return '<div class="cw-role-editor" data-role-id="'+esc(role.id)+'"><input type="radio" name="cwPrimaryRole" value="'+esc(role.id)+'" aria-label="Set this role as primary"'+(primary?' checked':'')+'><div><input data-role-title value="'+esc(role.name)+'" aria-label="Role name" placeholder="Role name" required><textarea data-role-responsibilities aria-label="Responsibilities" placeholder="Responsibilities for this role">'+esc(role.responsibilities||'')+'</textarea></div><button type="button" class="btn" data-remove-role aria-label="Remove role">'+cwIcon('close')+'</button></div>'; }
  function cwRolesPage(agent) {return '<form id="cwRolesForm" class="cw-profile-form cw-sky-card"><div class="cw-form-columns"><div><label for="cwProfileName">Agent name</label><input id="cwProfileName" value="'+esc(agent.name)+'" required></div><div><label for="cwProfileTagline">Short tagline</label><input id="cwProfileTagline" value="'+esc(agent.tagline||'')+'"></div></div><div><label for="cwDescription">Description</label><textarea id="cwDescription">'+esc(agent.description||'')+'</textarea></div><div><label>Assigned roles</label><p class="cw-empty">Select the primary role. Each role describes this teammate’s responsibilities.</p><div id="cwRoleRows" class="cw-profile-form">'+(agent.roles||[]).map(function(role){return cwRoleRowHtml(role,role.id===agent.primaryRoleId);}).join('')+'</div><button type="button" class="btn" id="cwAddRole" style="margin-top:12px">'+cwIcon('plus')+'Add role</button></div>'+cwProfileFormActions()+'</form>'; }
  function cwSkillsPage(agent) {
    var registry=cwEnsure().skills||[],assigned=agent.skills||[],missing=assigned.filter(function(name){return !registry.some(function(skill){return skill.name===name;});});
    return '<form id="cwSkillsForm" class="cw-profile-form"><div class="cw-connections-grid">'+registry.map(function(skill){return '<label class="cw-sky-card cw-skill-option"><input type="checkbox" data-profile-skill="'+esc(skill.name)+'"'+(assigned.indexOf(skill.name)>=0?' checked':'')+(skill.name==='browser-workflow'?' disabled':'')+'><span><h3>'+esc(skill.name)+'</h3><p>'+esc(skill.description||'No description supplied by this skill.')+'</p><small>'+esc(skill.name==='browser-workflow'?'Core skill ? always assigned':'Available in registry')+'</small><details><summary>Details</summary><p>Scope: '+esc(skill.scope||'Shared library')+'</p></details></span></label>';}).join('')+'</div>'+(!registry.length?'<div class="cw-sky-card cw-empty">No skills are registered yet. Create or install skills in Settings to assign them here.<br><button type="button" class="btn" id="cwSkillLibrary">Open skill settings</button></div>':'')+(missing.length?'<div class="cw-sky-card"><h3>Unavailable assignments</h3><p class="cw-empty">These saved skills are missing from the registry. Uncheck to remove an assignment.</p>'+missing.map(function(name){return '<label><input type="checkbox" data-profile-skill="'+esc(name)+'" checked> '+esc(name)+' — unavailable</label>';}).join('')+'</div>':'')+cwProfileFormActions()+'</form>';
  }
  function cwMemoryPage() {return '<div class="cw-memory-layout"><section class="cw-sky-card"><input class="cw-memory-search" id="cwMemorySearch" type="search" aria-label="Search memories" placeholder="Search this teammate’s memories"><div class="cw-memory-filters">'+[['all','','All']].concat(CW_MEMORY_CATEGORIES).map(function(category){return '<button class="btn" data-memory-filter="'+category[0]+'" aria-pressed="'+(category[0]==='all')+'">'+category[2]+'</button>';}).join('')+'</div><div class="cw-memory-list" id="cwMemoryList" aria-live="polite"></div></section><section class="cw-sky-card cw-memory-editor" id="cwMemoryDetail"><p class="cw-empty">Select a memory to read its source, make a correction, or archive it.</p></section></div>';}
  function cwRenderProfilePage() {
    var cw=cwEnsure(),agent=cwProfileAgent(),root=$('cwChat');if(!root||!agent)return;
    if(typeof cwApplyCharacterTheme==='function')cwApplyCharacterTheme();
    var section=CW_PROFILE_SECTIONS.some(function(item){return item[0]===cw.profileSection;})?cw.profileSection:'personality';cw.profileSection=section;
    var selected=section,heading=CW_PROFILE_SECTIONS.find(function(item){return item[0]===section;})[2];
    var rolesList=agent.roles||[],skillsList=agent.skills||[];
    var kpiHtml='<div class="cw-profile-kpi-col"><div class="cw-profile-kpi-row"><button type="button" class="cw-sky-tile cw-kpi-card" data-profile-jump="roles"><span class="cw-kpi-head">'+cwIcon('user')+'<small>Roles</small></span><strong>'+(rolesList.length?rolesList.length+(rolesList.length===1?' role':' roles'):'Default role')+'</strong></button><button type="button" class="cw-sky-tile cw-kpi-card" data-profile-jump="skills"><span class="cw-kpi-head">'+cwIcon('spark')+'<small>Skills</small></span><strong>'+skillsList.length+' '+(skillsList.length===1?'skill':'skills')+'</strong></button></div><section class="cw-profile-task-row"><div><strong>Work with '+esc(agent.name)+'</strong><p>Give your teammate a task to work on.</p></div><button class="btn dark" id="cwProfileStart">'+cwIcon('play')+'Start Task</button></section></div>';
    var overviewCardsHtml=section==='personality'?'<div class="cw-profile-overview-cards"><section class="cw-sky-card cw-overview-mini"><h3>Roles &amp; purpose</h3><p>'+(rolesList.length?rolesList.slice(0,3).map(function(r){return esc(r.name||r.title||'Role');}).join(', '):'No custom roles added yet.')+'</p><button type="button" class="btn" data-profile-jump="roles">Edit roles</button></section><section class="cw-sky-card cw-overview-mini"><h3>Enabled skills</h3><p>'+(skillsList.length?skillsList.slice(0,4).map(function(s){return esc(s);}).join(', '):'Core browser workflow enabled.')+'</p><button type="button" class="btn" data-profile-jump="skills">Configure skills</button></section><section class="cw-sky-card cw-overview-mini"><h3>Apps &amp; memory</h3><p>Manage OAuth toolkits, API access, and private agent memory.</p><div class="cw-overview-mini-actions"><button type="button" class="btn" data-profile-jump="connections">Connected apps</button><button type="button" class="btn" data-profile-jump="memory">Memory</button></div></section></div>':'';
    root.innerHTML=cwPageNavHtml('profile',agent)+'<button class="cw-profile-close" id="cwProfileClose" aria-label="Close profile and return to chat">'+cwIcon('close')+'</button><main class="cw-profile-page"><div class="cw-dashboard cw-settings-dashboard"><div class="cw-identity-hero"><section class="cw-identity" aria-label="Agent identity"><button class="cw-identity-avatar" id="cwProfileAvatar" aria-label="Change '+esc(agent.name)+' avatar">'+cwAva(agent)+'</button><div class="cw-identity-meta"><h1><button class="cw-name-edit" id="cwProfileNameEdit">'+esc(agent.name)+'</button></h1><button class="cw-identity-description" id="cwProfileDescriptionEdit">'+esc(agent.tagline||agent.description||'Your everyday teammate')+'</button>'+cwCharacterStatusHtml(agent,false)+'</div><div class="cw-identity-actions"><button class="btn" id="cwProfileSettings" aria-label="Agent settings" title="Open full grid editor">'+cwIcon('sliders')+'<span>Edit all</span></button></div></section>'+kpiHtml+'</div><nav class="cw-profile-tabs" role="tablist" aria-label="Profile sections">'+CW_PROFILE_SECTIONS.map(function(item){return '<button role="tab" id="cwProfileTab-'+item[0]+'" data-profile-section="'+item[0]+'" aria-selected="'+(item[0]===selected)+'" tabindex="'+(item[0]===selected?0:-1)+'" aria-controls="cwProfileContent">'+cwProfileIcon(item[1])+'<span>'+item[2]+'</span></button>';}).join('')+'</nav><div id="cwProfileContent" role="tabpanel" aria-labelledby="cwProfileTab-'+selected+'"><div class="cw-detail-page"><div class="cw-detail-title"><div><h2>'+heading+'</h2><p>'+({personality:'How your teammate thinks, communicates, and helps.',roles:'A clear identity and purpose for your teammate.',skills:'Choose capabilities from the existing skill registry.',memory:'Search and manage this teammate’s private memories.',connections:'Apps with active access for this teammate.'}[section])+'</p></div></div>'+(section==='personality'?cwPersonalityPage(agent)+overviewCardsHtml:section==='roles'?cwRolesPage(agent):section==='skills'?cwSkillsPage(agent):section==='memory'?cwMemoryPage():'<div id="cwProfileConnected"></div>')+'</div></div></div></main>';
    if(root.querySelectorAll)root.querySelectorAll('[data-profile-jump]').forEach(function(jumpBtn){jumpBtn.onclick=function(){var targetTab=root.querySelector('#cwProfileTab-'+jumpBtn.dataset.profileJump);if(targetTab)targetTab.click();};});
    document.title=agent.name+' · Profile — Gitu';cwBindTopNav();var infoBtn=$('cwInfoBtn');if(infoBtn)infoBtn.onclick=function(){cwOpenProfile(agent.id);};
    var buttons=Array.from(root.querySelectorAll('[data-profile-section]'));buttons.forEach(function(button,index){button.onclick=function(){cw.profileSection=button.dataset.profileSection;cwRenderProfilePage();$('cwProfileTab-'+cw.profileSection).focus({preventScroll:true});};button.onkeydown=function(event){var next;if(event.key==='ArrowRight')next=(index+1)%buttons.length;else if(event.key==='ArrowLeft')next=(index+buttons.length-1)%buttons.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=buttons.length-1;else return;event.preventDefault();cw.profileSection=buttons[next].dataset.profileSection;cwRenderProfilePage();$('cwProfileTab-'+cw.profileSection).focus();};});
    root.querySelectorAll('[data-profile-summary]').forEach(function(card){var open=function(){cw.profileSection=card.dataset.profileSummary;cwRenderProfilePage();};card.onclick=open;card.onkeydown=function(event){if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}};});
    $('cwProfileAvatar').onclick=$('cwProfileSettings').onclick=function(){cwAgentModal(agent);};$('cwProfileNameEdit').onclick=$('cwProfileDescriptionEdit').onclick=function(){cw.profileSection='roles';cwRenderProfilePage();};$('cwProfileStart').onclick=cwStartProfileTask;
    $('cwProfileClose').onclick=cwReturnToChat;
    cwBindProfileForms(agent);cwUpdateProfileData();cwSyncPanels();
  }
  async function cwSaveProfileFields(agent,fields,form) {
    var button=form.querySelector('[type=submit]'),error=$('cwProfileError');if(button.disabled)return;button.disabled=true;error.textContent='';
    try { var result=await api('/api/cowork/agents',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.assign({id:agent.id},fields))});var cw=cwEnsure();cw.agents=cw.agents.map(function(item){return item.id===result.agent.id?result.agent:item;});if(result.conversation)cw.convs=cw.convs.map(function(item){return item.id===result.conversation.id?result.conversation:item;});cwRenderRail();if(form.isConnected&&cw.profileOpen&&cw.profileAgentId===agent.id)cwRenderProfilePage();toast('Changes saved'); }
    catch(e){if(form.isConnected){error.textContent=cwProfileErrorText(e,'Could not save changes.');button.disabled=false;}}
  }
  function cwBindProfileForms(agent) {
    var form=$('cwPersonalityForm');if(form)form.onsubmit=function(event){event.preventDefault();cwSaveProfileFields(agent,{systemPrompt:$('cwInstructions').value,personality:{traits:$('cwTraits').value.split(',').map(function(trait){return trait.trim();}).filter(Boolean),communicationStyle:$('cwCommunication').value,proactivity:$('cwProactivity').value}},this);};
    form=$('cwRolesForm');if(form){var bindRemove=function(){form.querySelectorAll('[data-remove-role]').forEach(function(button){button.onclick=function(){button.closest('[data-role-id]').remove();};});};bindRemove();$('cwAddRole').onclick=function(){if(form.querySelectorAll('[data-role-id]').length>=8){toast('Choose up to eight roles.');return;}var id='role-'+Date.now().toString(36);$('cwRoleRows').insertAdjacentHTML('beforeend',cwRoleRowHtml({id:id,name:'',responsibilities:''},!form.querySelector('[name=cwPrimaryRole]:checked')));bindRemove();form.querySelector('[data-role-id="'+id+'"] [data-role-title]').focus();};form.onsubmit=function(event){event.preventDefault();var primary=form.querySelector('[name=cwPrimaryRole]:checked');cwSaveProfileFields(agent,{name:$('cwProfileName').value,tagline:$('cwProfileTagline').value,description:$('cwDescription').value,roles:Array.from(form.querySelectorAll('[data-role-id]')).map(function(row){return {id:row.dataset.roleId,name:row.querySelector('[data-role-title]').value,responsibilities:row.querySelector('[data-role-responsibilities]').value};}),primaryRoleId:primary?primary.value:''},this);};}
    form=$('cwSkillsForm');if(form)form.onsubmit=function(event){event.preventDefault();cwSaveProfileFields(agent,{skills:Array.from(this.querySelectorAll('[data-profile-skill]:checked')).map(function(input){return input.dataset.profileSkill;})},this);};if($('cwSkillLibrary'))$('cwSkillLibrary').onclick=function(){openSettings('skills');};
    var search=$('cwMemorySearch');if(search){search.oninput=cwRenderMemoryList;document.querySelectorAll('[data-memory-filter]').forEach(function(button){button.onclick=function(){cwEnsure().memoryFilter=button.dataset.memoryFilter;document.querySelectorAll('[data-memory-filter]').forEach(function(item){item.setAttribute('aria-pressed',String(item===button));});cwRenderMemoryList();};});}
  }
  function cwUpdateProfileData() {
    if(!cwEnsure().profileOpen)return;var agent=cwProfileAgent(),data=cwProfileData(),summary=$('cwMemorySummary');
    if(summary)summary.innerHTML=CW_MEMORY_CATEGORIES.map(function(category){var count=(data.entries||[]).filter(function(entry){return cwMemoryCategory(entry)===category[0];}).length;return '<div class="cw-sky-tile">'+cwIcon(category[1])+'<span><strong>'+category[2]+'</strong><small>'+esc(data.loading?'Loading…':data.memoryError?'Could not load memories':count+' '+(count===1?'memory':'memories'))+'</small></span></div>';}).join('');
    var connected=$('cwProfileConnected');if(connected){connected.innerHTML=cwProfileConnectionsHtml(agent,data);cwBindProfileConnections(agent,connected);}
    if($('cwMemoryList'))cwRenderMemoryList();
  }
  function cwProfileConnectionsHtml(agent,data) {
    if(data.loading)return '<p class="cw-empty" role="status">Checking assigned connections…</p>';
    if(data.appsError)return '<p class="cw-empty" role="alert">Could not check connections.</p><button class="btn" data-profile-retry>Try again</button>';
    var apps=data.apps||{},accounts=cwConnectedProfileAccounts(apps),detailed=cwEnsure().profileSection==='connections';
    if(!accounts.length)return '<div class="cw-empty"><strong>A little more connected.</strong><p>No apps are connected for '+esc(agent.name)+' yet. Choose the tools this teammate can use.</p><button class="btn dark" data-profile-manage>'+cwIcon('plus')+'Add connections</button></div>';
    var html=accounts.map(function(account){var name=cwProfileAccountName(account,apps),service=(apps.services||[]).find(function(item){return item.slug===account.toolkit;})||{slug:account.toolkit,name:name},permissions=(apps.appPermissions||[]).filter(function(permission){return permission.agentId===agent.id&&permission.accountId===account.id;});
      if(!detailed)return '<button class="cw-sky-tile" data-profile-connections>'+cwServiceIcon(service)+'<span><strong>'+esc(name)+'</strong><small class="cw-connected-label">● Connected</small></span>'+cwIcon('chevron')+'</button>';
      return '<article class="cw-sky-card cw-connection-card"><div class="cw-card-heading">'+cwServiceIcon(service)+'<div><h2>'+esc(name)+'</h2><p class="cw-connected-label">● Connected</p></div></div><p>Assigned account '+esc(account.id.slice(-8))+'. Actions follow your existing approval rules.</p>'+(permissions.length?'<details><summary>Always allowed capabilities</summary><ul>'+permissions.map(function(p){return '<li>'+esc(cwAppActionName(p.tool,p.service))+'</li>';}).join('')+'</ul></details>':'<p>No actions granted permanent approval.</p>')+'<div class="cw-form-actions"><button class="btn" data-profile-manage>Manage</button><button class="btn" data-profile-disconnect="'+esc(account.id)+'">Disconnect</button></div></article>';
    }).join('');return '<div class="'+(detailed?'cw-connections-grid':'cw-sky-tiles')+'">'+html+'</div><button class="btn" style="margin-top:12px" data-profile-manage>Manage connections '+cwIcon('chevron')+'</button>';
  }
  function cwBindProfileConnections(agent,root) {
    root.querySelectorAll('[data-profile-manage]').forEach(function(button){button.onclick=function(){cwOpenConnections(agent.id);};});root.querySelectorAll('[data-profile-connections]').forEach(function(button){button.onclick=function(){cwEnsure().profileSection='connections';cwRenderProfilePage();};});
    root.querySelectorAll('[data-profile-retry]').forEach(function(button){button.onclick=function(){var cw=cwEnsure();cwLoadProfileData(agent.id,++cw.profileRevision);};});
    root.querySelectorAll('[data-profile-disconnect]').forEach(function(button){button.onclick=async function(){if(button.disabled)return;button.disabled=true;try{await api('/api/connected-apps/disconnect',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({agentId:agent.id,accountId:button.dataset.profileDisconnect})});var cw=cwEnsure();cwLoadProfileData(agent.id,++cw.profileRevision);}catch(e){toast('Could not disconnect this account.',true);button.disabled=false;}};});cwBindServiceIcons(root);
  }
  function cwRenderMemoryList() {
    var list=$('cwMemoryList');if(!list)return;var cw=cwEnsure(),data=cwProfileData(),query=($('cwMemorySearch').value||'').toLowerCase(),filter=cw.memoryFilter||'all';
    var entries=(data.entries||[]).filter(function(entry){return (filter==='all'||cwMemoryCategory(entry)===filter)&&entry.claim.toLowerCase().indexOf(query)>=0;});
    list.innerHTML=data.loading?'<p class="cw-empty" role="status">Loading private memories…</p>':data.memoryError?'<p class="cw-empty" role="alert">Could not load memories.</p><button class="btn" id="cwMemoryRetry">Try again</button>':entries.length?entries.map(function(entry){return '<button class="cw-sky-tile" data-memory-id="'+esc(entry.id)+'" aria-pressed="'+(cw.memorySelectedId===entry.id)+'"><strong>'+esc(entry.claim)+'</strong><small>'+esc(entry.type)+' · '+esc(new Date(entry.updatedAt||entry.createdAt).toLocaleDateString())+'</small></button>';}).join(''):'<p class="cw-empty">'+(query||filter!=='all'?'No memories match this search.':'No private memories saved yet. Ask this teammate to remember something in chat.')+'</p>';
    if($('cwMemoryRetry'))$('cwMemoryRetry').onclick=function(){cwLoadProfileData(cw.profileAgentId,++cw.profileRevision);};
    list.querySelectorAll('[data-memory-id]').forEach(function(button){button.onclick=function(){cwOpenMemoryDetail(button.dataset.memoryId);};});
  }
  async function cwOpenMemoryDetail(id) {
    var cw=cwEnsure(),agent=cwProfileAgent(),revision=cw.profileRevision;cw.memorySelectedId=id;cwRenderMemoryList();var detail=$('cwMemoryDetail');detail.innerHTML='<p class="cw-empty" role="status">Loading memory details…</p>';
    try{var data=await api('/api/cowork/agents/'+encodeURIComponent(agent.id)+'/memory/'+encodeURIComponent(id));if(!cw.profileOpen||cw.profileAgentId!==agent.id||cw.profileRevision!==revision||cw.memorySelectedId!==id||!detail.isConnected)return;
      var entry=data.entry,redacted=/\[credential removed|\[.*redact|<browser__redacted/i.test(entry.claim);
      detail.innerHTML='<form id="cwMemoryEdit"><label for="cwMemoryClaim">Memory</label><textarea id="cwMemoryClaim" required'+(redacted?' readonly':'')+'>'+esc(entry.claim)+'</textarea>'+(redacted?'<p>Sensitive text is hidden. You can archive this memory.</p>':'')+'<p>'+esc(entry.status)+' · Updated '+esc(new Date(entry.updatedAt||entry.createdAt).toLocaleString())+'</p><details><summary>Source &amp; history</summary><p>'+esc(entry.sourceType||'Unknown source')+' · '+esc(entry.source||'Source not recorded')+'</p>'+(entry.evidence?'<p>'+esc(entry.evidence)+'</p>':'')+'<ul>'+(data.audit||[]).map(function(event){return '<li>'+esc(event.event)+' · '+esc(event.at||'')+(event.reason?' — '+esc(event.reason):'')+'</li>';}).join('')+'</ul></details><p role="alert" class="cw-form-error" id="cwMemoryError"></p><div class="cw-form-actions"><button class="btn" type="button" id="cwMemoryArchive">Archive</button><button class="btn dark" type="submit"'+(redacted?' disabled':'')+'>Save correction</button></div></form>';
      $('cwMemoryEdit').onsubmit=async function(event){event.preventDefault();var button=this.querySelector('[type=submit]');button.disabled=true;try{await api('/api/cowork/agents/'+encodeURIComponent(agent.id)+'/memory/'+encodeURIComponent(id),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({claim:$('cwMemoryClaim').value,expectedUpdatedAt:entry.updatedAt})});cw.memorySelectedId=null;detail.innerHTML='<p class="cw-empty">Correction saved. The earlier entry remains in the audit history.</p>';cwLoadProfileData(agent.id,++cw.profileRevision);}catch(e){if(detail.isConnected){$('cwMemoryError').textContent=cwProfileErrorText(e,'Could not save this memory.');button.disabled=false;}}};
      $('cwMemoryArchive').onclick=async function(){this.disabled=true;try{await api('/api/cowork/agents/'+encodeURIComponent(agent.id)+'/memory/'+encodeURIComponent(id),{method:'DELETE'});cw.memorySelectedId=null;detail.innerHTML='<p class="cw-empty">Memory archived.</p>';cwLoadProfileData(agent.id,++cw.profileRevision);}catch(e){toast('Could not archive this memory.',true);if(this.isConnected)this.disabled=false;}};
    }catch(e){if(detail.isConnected)detail.innerHTML='<p class="cw-empty" role="alert">Could not open this memory. Refresh the page to try again.</p>';}
  }
  function cwOpenAgentSwitcherModal() {
    if(typeof window!=='undefined'&&window.__gituAstryx&&typeof window.__gituAstryx.openSwitcher==='function'){window.__gituAstryx.openSwitcher();return;}
    var existing=$('cwAgentSwitcher')||document.querySelector('.cw-agent-switcher-modal');if(existing)existing.remove();
    var cw=cwEnsure(),modal=document.createElement('div');
    modal.id='cwAgentSwitcher';
    modal.className='modal cw-modal cw-agent-switcher-modal';
    modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','cwSwitcherTitle');
    var iconFn=typeof cwIcon==='function'?cwIcon:function(n){return typeof icon==='function'?icon(n):'';};
    modal.innerHTML='<div class="box"><div class="bar"><h2 id="cwSwitcherTitle">Agent Switcher</h2><span class="cw-switcher-count" id="cwSwitcherCount">0</span><span style="flex:1"></span><button type="button" class="cw-sw-btn danger" id="cwSwDeleteAll" aria-label="Delete all agents" hidden>'+iconFn('trash')+'<span>Delete all</span></button><button type="button" class="cw-sw-btn ghost" id="cwSwClose" aria-label="Close switcher">'+iconFn('close')+'<span>Close</span></button></div><div class="cw-switcher-toolbar"><div class="cw-sw-search">'+iconFn('search')+'<input id="cwSwitcherSearch" type="search" placeholder="Search agents…" aria-label="Search agents"></div><button type="button" class="cw-sw-btn primary" id="cwSwNewAgent">'+iconFn('plus')+'<span>New agent</span></button></div><div class="cw-switcher-body"><div class="cw-agent-switcher-grid" id="cwSwitcherGrid"></div></div></div>';
    document.body.appendChild(modal);
    var close=typeof cwBindDialog==='function'?cwBindDialog(modal,'#cwSwitcherSearch'):function(){modal.remove();};
    var delAllArmed=false,delAllTimer=null;
    function resetDelAll(){
      delAllArmed=false;
      if(delAllTimer){clearTimeout(delAllTimer);delAllTimer=null;}
      var btn=$('cwSwDeleteAll');
      if(btn){if(btn.classList)btn.classList.remove('armed');btn.innerHTML=iconFn('trash')+'<span>Delete all</span>';}
    }
    function render(){
      var grid=$('cwSwitcherGrid'),countEl=$('cwSwitcherCount'),qEl=$('cwSwitcherSearch'),delAllBtn=$('cwSwDeleteAll');if(!grid)return;
      var query=String(qEl&&qEl.value||'').trim().toLowerCase(),agents=(cw.agents||[]).slice();
      var active=typeof cwActiveConv==='function'?cwActiveConv():null;
      var currentId=(S&&S.active==='cowork'&&active&&active.kind==='dm'&&active.memberIds&&active.memberIds[0])||cw.selectedAgentId||cw.profileAgentId;
      var filtered=query?agents.filter(function(a){return (a.name+' '+(a.tagline||'')).toLowerCase().indexOf(query)>=0;}):agents;
      if(countEl)countEl.textContent=String(agents.length);
      if(delAllBtn){delAllBtn.hidden=agents.length===0;if(!agents.length)resetDelAll();}
      if(!filtered.length){grid.innerHTML='<p class="cw-empty" style="grid-column:1 / -1">'+(agents.length?'No agents match that search.':'No agents yet. Create one to start.')+'</p>';return;}
      grid.innerHTML=filtered.map(function(agent){
        var isCurrent=agent.id===currentId,tagline=String(agent.tagline||'').trim();
        return '<div class="cw-sw-card-wrap"><button type="button" class="cw-sw-card'+(isCurrent?' is-active':'')+'" data-sw-chat="'+esc(agent.id)+'" aria-current="'+(isCurrent?'true':'false')+'"><div class="cw-sw-card-top"><span class="cw-sw-card-ava">'+cwAva(agent)+'</span>'+(isCurrent?'<span class="cw-sw-card-active">Active</span>':'')+'</div><div class="cw-sw-card-copy"><strong>'+esc(agent.name)+'</strong>'+(tagline?'<span>'+esc(tagline)+'</span>':'')+'</div></button><button type="button" class="cw-sw-card-del" data-sw-del="'+esc(agent.id)+'" data-sw-del-name="'+esc(agent.name)+'" title="Delete '+esc(agent.name)+' (click twice)" aria-label="Delete '+esc(agent.name)+'">'+iconFn('trash')+'</button></div>';
      }).join('');
      grid.querySelectorAll('[data-sw-chat]').forEach(function(btn){if(btn.classList&&btn.classList.contains('cw-sw-card-del'))return;btn.onclick=function(){var id=btn.getAttribute('data-sw-chat');close();if(typeof cwSelectAgent==='function'){cwSelectAgent(id);}else if(S&&S.active==='cowork'&&typeof cwOpenDm==='function'){cwOpenDm(id);}else if(typeof cwEnterWorkspace==='function'){cwEnterWorkspace('chat',id);}};});
      grid.querySelectorAll('[data-sw-del]').forEach(function(btn){
        if(!btn||!btn.classList||!btn.classList.contains('cw-sw-card-del'))return;
        var armTimer=null;
        btn.onclick=function(e){
          if(e&&e.stopPropagation)e.stopPropagation();
          var id=btn.getAttribute('data-sw-del'),name=btn.getAttribute('data-sw-del-name')||'agent';
          if(!btn.classList.contains('armed')){
            btn.classList.add('armed');btn.textContent='Sure?';
            armTimer=setTimeout(function(){btn.classList.remove('armed');btn.innerHTML=iconFn('trash');},2500);
            return;
          }
          if(armTimer)clearTimeout(armTimer);
          btn.disabled=true;
          var run=typeof cwQuickDeleteAgent==='function'?cwQuickDeleteAgent(id,name):api('/api/cowork/agents/'+encodeURIComponent(id),{method:'DELETE'}).then(function(){cw.agents=(cw.agents||[]).filter(function(a){return a.id!==id;});});
          run.then(function(){if(modal.isConnected)render();}).catch(function(){btn.disabled=false;btn.classList.remove('armed');btn.innerHTML=iconFn('trash');});
        };
      });
    }
    var delAllBtn=$('cwSwDeleteAll');
    if(delAllBtn){
      delAllBtn.onclick=function(){
        if(!delAllArmed){
          delAllArmed=true;
          if(delAllBtn.classList)delAllBtn.classList.add('armed');
          delAllBtn.textContent='Sure? ('+(cw.agents||[]).length+')';
          delAllTimer=setTimeout(resetDelAll,3000);
          return;
        }
        resetDelAll();
        delAllBtn.disabled=true;
        var run=typeof cwDeleteAllAgents==='function'?cwDeleteAllAgents():api('/api/cowork/agents',{method:'DELETE'}).then(function(){cw.agents=[];});
        run.then(function(){delAllBtn.disabled=false;if(modal.isConnected)render();}).catch(function(){delAllBtn.disabled=false;});
      };
    }
    $('cwSwClose').onclick=close;
    $('cwSwNewAgent').onclick=function(){close();if(typeof cwAgentModal==='function')cwAgentModal(null);};
    $('cwSwitcherSearch').oninput=render;
    render();
    api('/api/cowork/agents').then(function(data){if(!modal.isConnected)return;if(data&&Array.isArray(data.agents)){cw.agents=data.agents;cw.skills=data.availableSkills||cw.skills||[];if(!cw.agents.some(function(a){return a.id===cw.selectedAgentId;}))cw.selectedAgentId=cw.agents[0]&&cw.agents[0].id;render();}}).catch(function(){});
  }
`;
