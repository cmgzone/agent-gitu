/** The profile shares the chat surface, in the unified Pikpam Cloud Console grid layout. */
export const COWORK_PROFILE_SETTINGS_CSS = String.raw`
  #cw.cw.profile-open {
    background:var(--bg); color:var(--text);
  }
  .cw.profile-open .cw-top-nav { background:var(--card2); border-color:var(--border); backdrop-filter:none; -webkit-backdrop-filter:none; padding:3px; gap:2px; border-radius:999px; }
  .cw.profile-open .cw-top-nav button { color:var(--muted); min-height:34px; padding:0 14px; border-radius:999px; font-size:12.5px; font-weight:500; }
  .cw.profile-open .cw-top-nav button > span { display:inline!important; }
  .cw.profile-open .cw-top-nav button[aria-pressed=true] { background:var(--accent,#3B82F6)!important; color:#ffffff!important; font-weight:600; box-shadow:none; }
  .cw-profile-close { position:absolute; right:20px; top:calc(12px + env(safe-area-inset-top, 0px)); z-index:11; width:34px; height:34px; display:grid; place-items:center; border:1px solid var(--border); border-radius:10px; background:var(--card); color:var(--muted); backdrop-filter:none; -webkit-backdrop-filter:none; cursor:pointer; }
  .cw-profile-close:hover { color:var(--text); background:var(--hover); }
  .cw-profile-close svg { width:16px; height:16px; }
  .cw.profile-open .cw-profile-page { padding:76px 24px 48px; color:var(--text); scroll-padding-top:88px; }
  .cw-settings-dashboard { max-width:1160px; margin:0 auto; display:grid; gap:20px; }
  .cw-settings-dashboard .cw-identity { grid-template-columns:56px minmax(0,1fr) auto; gap:14px; margin:0; }
  .cw-settings-dashboard .cw-identity-avatar { width:56px; height:56px; padding:0; border:1px solid var(--border); border-radius:12px; box-shadow:none; background:var(--card2); animation:none; }
  .cw-settings-dashboard .cw-identity-avatar .cw-ava { background:var(--card2)!important; border-radius:10px; }
  .cw-settings-dashboard .cw-identity h1 { font-size:22px; letter-spacing:-.025em; margin:0 0 2px; }
  .cw-settings-dashboard .cw-name-edit:hover { color:var(--accent); }
  .cw-settings-dashboard .cw-identity-description { font-size:13px; color:var(--muted); margin:0 0 4px; line-height:1.45; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .cw-settings-dashboard .cw-persona-status { color:var(--muted); font-size:11.5px; }
  .cw-settings-dashboard .cw-identity-actions { grid-column:auto; align-self:center; margin:0; }
  .cw-settings-dashboard .cw-identity-actions .btn { flex:none; min-height:36px; padding:0 14px; }
  .cw-profile-task-row { display:flex; justify-content:space-between; align-items:center; gap:14px; padding:14px 18px; margin:0; }
  .cw-profile-task-row strong { display:block; font-size:13.5px; }
  .cw-profile-task-row p { margin:3px 0 0; color:var(--muted); font-size:12.5px; }
  .cw-settings-dashboard .cw-profile-tabs { position:static; display:flex; gap:4px; padding:0; margin:0; border:0; border-bottom:1px solid var(--border); border-radius:0; background:transparent; backdrop-filter:none; -webkit-backdrop-filter:none; overflow-x:auto; }
  .cw-settings-dashboard .cw-profile-tabs button { flex:none; flex-direction:row; justify-content:center; gap:7px; min-width:0; min-height:40px; padding:10px 4px 12px; border-radius:0; color:var(--muted); font-size:13.5px; font-weight:500; white-space:nowrap; }
  .cw-settings-dashboard .cw-profile-tabs svg { width:16px; height:16px; }
  .cw-settings-dashboard .cw-profile-tabs button:hover { background:transparent; color:var(--text); transform:none; }
  .cw-settings-dashboard .cw-profile-tabs button[aria-selected=true] { background:transparent; color:var(--text); font-weight:600; box-shadow:none; }
  .cw-settings-dashboard .cw-detail-title { margin:0 0 14px; }
  .cw-settings-dashboard .cw-detail-title h2 { font-size:17px; font-weight:600; letter-spacing:-.015em; }
  .cw-settings-dashboard .cw-detail-title p { font-size:13px; color:var(--muted); }
  .cw-settings-dashboard .cw-sky-card { padding:18px 20px; border-radius:14px; border:1px solid var(--border); background:var(--card); box-shadow:none; backdrop-filter:none; -webkit-backdrop-filter:none; }
  .cw-settings-dashboard .btn { min-height:36px; border-radius:10px; padding:0 14px; font-size:13px; background:var(--card2); border:1px solid var(--border); color:var(--text); }
  .cw-settings-dashboard .btn.dark { background:var(--accent); border-color:transparent; color:#fff; font-weight:600; box-shadow:none; }
  .cw-settings-dashboard .btn:hover { background:var(--hover); }
  .cw-settings-dashboard .btn.dark:hover { background:var(--accent); filter:brightness(1.06); }
  .cw-settings-dashboard button:focus-visible,.cw-profile-close:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .cw-settings-dashboard .cw-profile-form { gap:16px; }
  .cw-settings-dashboard .cw-profile-form label,.cw-settings-dashboard .cw-memory-editor label { font-size:12.5px; font-weight:500; }
  .cw-settings-dashboard .cw-profile-form input:not([type=checkbox]):not([type=radio]),.cw-settings-dashboard .cw-profile-form textarea,.cw-settings-dashboard .cw-profile-form select,.cw-memory-search,.cw-memory-editor textarea { background:var(--card2); border:1px solid var(--border); border-radius:10px; color:var(--text); font-size:13.5px; }
  .cw-settings-dashboard .cw-profile-form small,.cw-settings-dashboard .cw-empty,.cw-settings-dashboard .cw-skill-option p,.cw-settings-dashboard .cw-sky-tile small,.cw-settings-dashboard .cw-memory-editor p,.cw-settings-dashboard .cw-memory-editor li,.cw-settings-dashboard .cw-connection-card p,.cw-settings-dashboard .cw-connection-card li { color:var(--muted); }
  .cw-settings-dashboard .cw-form-actions { padding-top:14px; border-top:1px solid var(--border); }
  .cw-settings-dashboard .cw-role-editor,.cw-settings-dashboard .cw-sky-tile { background:var(--card); border:1px solid var(--border); border-radius:14px; color:var(--text); }
  .cw-settings-dashboard .cw-connections-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }
  .cw-settings-dashboard .cw-memory-layout { display:grid; grid-template-columns:minmax(0,1.05fr) minmax(0,1fr); gap:16px; }
  .cw-settings-dashboard .cw-memory-list { max-height:360px; }
  .cw-settings-dashboard .cw-memory-filters [aria-pressed=true] { background:var(--card); color:var(--text); }
  .cw-settings-dashboard .cw-card-heading > svg { width:22px; height:22px; color:var(--accent); }
  @media(max-width:980px) { .cw-settings-dashboard .cw-connections-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  @media(max-width:720px) {
    .cw.profile-open .cw-profile-page { padding:74px 16px 28px; }
    .cw-settings-dashboard .cw-identity { grid-template-columns:48px minmax(0,1fr) auto; gap:12px; }
    .cw-settings-dashboard .cw-identity-avatar { width:48px; height:48px; }
    .cw-settings-dashboard .cw-identity h1 { font-size:20px; }
    .cw-settings-dashboard .cw-sky-card { padding:16px; }
    .cw-settings-dashboard .cw-connections-grid,.cw-settings-dashboard .cw-memory-layout { grid-template-columns:1fr; }
    .cw-profile-task-row { padding:14px 16px; }
  }
  @media(max-width:440px) { .cw-profile-close { top:calc(10px + env(safe-area-inset-top, 0px)); right:12px; width:34px; height:34px; }.cw-settings-dashboard .cw-profile-task-row .btn { flex:none; } }
`;
