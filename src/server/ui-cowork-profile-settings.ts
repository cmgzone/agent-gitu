/** The profile shares the chat surface, with a compact settings layout. */
export const COWORK_PROFILE_SETTINGS_CSS = String.raw`
  #cw.cw.profile-open {
    background:var(--cw-chat-surface,var(--bg)); color:var(--text);
  }
  .cw.profile-open .cw-top-nav { background:color-mix(in srgb,var(--card) 54%,transparent); border-color:color-mix(in srgb,var(--border2) 60%,transparent); backdrop-filter:blur(20px) saturate(1.15); -webkit-backdrop-filter:blur(20px) saturate(1.15); }
  .cw.profile-open .cw-top-nav button { color:var(--text); }
  .cw.profile-open .cw-top-nav button[aria-pressed=true] { background:var(--text); color:var(--bg); }
  .cw-profile-close { position:absolute; right:22px; top:18px; z-index:11; width:46px; height:46px; display:grid; place-items:center; border:1px solid color-mix(in srgb,var(--border2) 50%,transparent); border-radius:50%; background:color-mix(in srgb,var(--card) 74%,transparent); color:var(--text); backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px); cursor:pointer; }
  .cw-profile-close svg { width:20px; height:20px; }
  .cw.profile-open .cw-profile-page { padding:112px 28px 40px; color:var(--text); scroll-padding-top:90px; }
  .cw-settings-dashboard { max-width:640px; }
  .cw-settings-dashboard .cw-identity { grid-template-columns:64px minmax(0,1fr) auto; gap:16px; margin:0 0 20px; }
  .cw-settings-dashboard .cw-identity-avatar { width:64px; height:64px; padding:0; border:0; box-shadow:none; background:transparent; animation:none; }
  .cw-settings-dashboard .cw-identity-avatar .cw-ava { background:color-mix(in srgb,var(--card) 65%,transparent)!important; }
  .cw-settings-dashboard .cw-identity h1 { font-size:30px; letter-spacing:-.035em; margin:0 0 4px; }
  .cw-settings-dashboard .cw-name-edit:hover { color:var(--accent); }
  .cw-settings-dashboard .cw-identity-description { font-size:12px; color:var(--muted); margin:0 0 5px; line-height:1.4; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .cw-settings-dashboard .cw-persona-status { color:var(--muted); font-size:11px; }
  .cw-settings-dashboard .cw-identity-actions { grid-column:auto; align-self:center; margin:0; }
  .cw-settings-dashboard .cw-identity-actions .btn { flex:none; width:42px; height:42px; padding:0; }
  .cw-profile-task-row { display:flex; justify-content:space-between; align-items:center; gap:16px; padding:16px 20px; margin-bottom:14px; }
  .cw-profile-task-row strong { display:block; font-size:14px; }
  .cw-profile-task-row p { margin:4px 0 0; color:var(--muted); font-size:12px; }
  .cw-settings-dashboard .cw-profile-tabs { position:sticky; top:72px; z-index:2; gap:4px; padding:5px; margin:0 0 24px; border-radius:999px; background:color-mix(in srgb,var(--card) 78%,transparent); border-color:color-mix(in srgb,var(--border2) 60%,transparent); backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px); overflow-x:auto; }
  .cw-settings-dashboard .cw-profile-tabs button { flex-direction:row; justify-content:center; gap:7px; min-width:102px; min-height:42px; padding:10px 12px; border-radius:999px; color:var(--text); font-size:12px; white-space:nowrap; }
  .cw-settings-dashboard .cw-profile-tabs svg { width:17px; height:17px; }
  .cw-settings-dashboard .cw-profile-tabs button:hover { background:color-mix(in srgb,var(--hover) 75%,transparent); transform:none; }
  .cw-settings-dashboard .cw-profile-tabs button[aria-selected=true] { background:var(--text); color:var(--bg); box-shadow:0 2px 6px #10294018; }
  .cw-settings-dashboard .cw-detail-title { margin:0 5px 14px; }
  .cw-settings-dashboard .cw-detail-title h2 { font-size:19px; letter-spacing:-.025em; }
  .cw-settings-dashboard .cw-detail-title p { font-size:12px; color:var(--muted); }
  .cw-settings-dashboard .cw-sky-card { padding:22px; border-radius:24px; border:1px solid color-mix(in srgb,var(--border2) 55%,transparent); background:color-mix(in srgb,var(--card) 68%,transparent); box-shadow:inset 0 1px 0 #ffffff29,0 8px 28px #16314805; backdrop-filter:blur(18px); -webkit-backdrop-filter:blur(18px); }
  .cw-settings-dashboard .btn { min-height:36px; padding:8px 14px; font-size:12px; background:color-mix(in srgb,var(--card) 85%,transparent); border-color:color-mix(in srgb,var(--border2) 70%,transparent); color:var(--text); }
  .cw-settings-dashboard .btn.dark { background:var(--text); border-color:var(--text); color:var(--bg); box-shadow:none; }
  .cw-settings-dashboard .btn:hover { background:var(--hover); }
  .cw-settings-dashboard .btn.dark:hover { background:color-mix(in srgb,var(--text) 85%,var(--accent)); }
  .cw-settings-dashboard button:focus-visible,.cw-profile-close:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
  .cw-settings-dashboard .cw-profile-form { gap:20px; }
  .cw-settings-dashboard .cw-profile-form label,.cw-settings-dashboard .cw-memory-editor label { font-size:12px; }
  .cw-settings-dashboard .cw-profile-form input:not([type=checkbox]):not([type=radio]),.cw-settings-dashboard .cw-profile-form textarea,.cw-settings-dashboard .cw-profile-form select,.cw-settings-dashboard .cw-memory-search,.cw-settings-dashboard .cw-memory-editor textarea { background:color-mix(in srgb,var(--card) 92%,transparent); border-color:color-mix(in srgb,var(--border2) 75%,transparent); color:var(--text); font-size:13px; }
  .cw-settings-dashboard .cw-profile-form small,.cw-settings-dashboard .cw-empty,.cw-settings-dashboard .cw-skill-option p,.cw-settings-dashboard .cw-sky-tile small,.cw-settings-dashboard .cw-memory-editor p,.cw-settings-dashboard .cw-memory-editor li,.cw-settings-dashboard .cw-connection-card p,.cw-settings-dashboard .cw-connection-card li { color:var(--muted); }
  .cw-settings-dashboard .cw-form-actions { padding-top:14px; border-top:1px solid color-mix(in srgb,var(--border) 60%,transparent); }
  .cw-settings-dashboard .cw-role-editor,.cw-settings-dashboard .cw-sky-tile { background:color-mix(in srgb,var(--card) 78%,transparent); border-color:color-mix(in srgb,var(--border2) 65%,transparent); color:var(--text); }
  .cw-settings-dashboard .cw-connections-grid,.cw-settings-dashboard .cw-memory-layout { grid-template-columns:1fr; }
  .cw-settings-dashboard .cw-memory-list { max-height:280px; }
  .cw-settings-dashboard .cw-memory-filters [aria-pressed=true] { background:var(--text); color:var(--bg); }
  .cw-settings-dashboard .cw-card-heading > svg { width:24px; height:24px; color:var(--accent); }
  @media(max-width:720px) {
    .cw.profile-open .cw-profile-page { padding:112px 16px 28px; }
    .cw-settings-dashboard .cw-identity { grid-template-columns:54px minmax(0,1fr) auto; gap:12px; }
    .cw-settings-dashboard .cw-identity-avatar { width:54px; height:54px; }
    .cw-settings-dashboard .cw-identity h1 { font-size:26px; }
    .cw-settings-dashboard .cw-sky-card { padding:18px; }
    .cw-settings-dashboard .cw-profile-tabs { border-radius:26px; }
    .cw-settings-dashboard .cw-profile-tabs button { min-width:106px; }
    .cw-profile-task-row { padding:14px 18px; }
  }
  @media(max-width:440px) { .cw-profile-close { top:66px; right:16px; width:34px; height:34px; }.cw-settings-dashboard .cw-profile-task-row p { max-width:160px; }.cw-settings-dashboard .cw-profile-task-row .btn { flex:none; } }
`;
