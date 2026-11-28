export const ONBOARDING_CSS = String.raw`
  .gitu-opening { position:fixed; inset:0; z-index:300; padding:24px; box-sizing:border-box; background:var(--cw-chat-surface,var(--bg)); display:grid; place-items:center; text-align:center; }
  .opening-content { width:min(100%,360px); }
  .gitu-opening img { display:block; width:72px; height:72px; margin:0 auto; }
  .gitu-opening h1 { font-size:26px; font-weight:600; letter-spacing:-.7px; margin:24px 0 8px; }
  .gitu-opening p { margin:0; color:var(--muted); font-size:13px; line-height:1.65; text-wrap:balance; }
  .opening-dots { display:flex; justify-content:center; gap:6px; margin-top:24px; }
  .opening-dots i { width:4px; height:4px; border-radius:50%; background:var(--run); animation:setupPulse 1.6s ease-in-out infinite; }
  .opening-dots i:nth-child(2) { animation-delay:.16s; }.opening-dots i:nth-child(3) { animation-delay:.32s; }
  .gitu-opening #startupReload { margin-top:24px; border-radius:999px; padding:10px 20px; background:var(--dark)!important; color:var(--bg)!important; }
  .gitu-opening.is-error .opening-dots { display:none; }
  @keyframes setupPulse { 0%,80%,100% { opacity:.28; } 40% { opacity:1; } }
  /* Setup wizard: same surface language as the Cowork chat — a rounded card on
     the app background, a floating pill nav, neutral cards, inverted (dark)
     selection, composer-style inputs and the shared rise-in motion. */
  .setup-wizard { position:fixed; inset:0; z-index:250; overflow:hidden; background:var(--bg); padding:10px; box-sizing:border-box; display:flex; flex-direction:column; height:100dvh; }
  .setup-frame { position:relative; flex:1; min-height:0; width:100%; display:flex; flex-direction:column; overflow-y:auto; scrollbar-width:none; border:1px solid var(--border); background:var(--card); border-radius:24px; box-shadow:var(--shadow); }
  .setup-frame::-webkit-scrollbar { display:none; width:0; height:0; }
  .setup-aside { position:sticky; top:0; z-index:20; display:grid; grid-template-columns:minmax(0,1fr) auto minmax(0,1fr); align-items:center; gap:16px; padding:12px 16px 18px; background:linear-gradient(to bottom,var(--card) 62%,transparent); border:0; }
  .setup-brand { justify-self:start; display:flex; align-items:center; gap:9px; font-size:13.5px; font-weight:600; letter-spacing:-.01em; color:var(--text); }
  .setup-brand img { width:28px; height:28px; border-radius:8px; }
  .setup-aside p { order:3; justify-self:end; margin:0; color:var(--muted); font-size:11px; line-height:1.4; text-align:right; }
  .setup-steps { order:2; list-style:none; margin:0; padding:4px; display:flex; align-items:center; gap:2px; border:1px solid var(--border); border-radius:var(--radius-full,9999px); background:var(--card2); }
  .setup-steps li { display:inline-flex; align-items:center; gap:7px; min-height:34px; padding:0 14px 0 8px; border-radius:999px; color:var(--muted); font-size:12.5px; font-weight:500; white-space:nowrap; transition:background-color .18s ease,color .18s ease; }
  .setup-steps li[data-done=true] { color:var(--text); }
  .setup-steps li[aria-current=step] { background:var(--dark); color:var(--bg); font-weight:600; }
  .setup-step-number { width:20px; height:20px; flex:none; display:grid; place-items:center; border-radius:50%; border:1px solid color-mix(in srgb,currentColor 30%,transparent); font-size:10.5px; font-weight:600; }
  [aria-current=step] .setup-step-number { background:var(--bg); border-color:var(--bg); color:var(--dark); }
  .setup-main { width:min(100%,1080px); margin:0 auto; flex:1; min-width:0; padding:20px 24px 0; box-sizing:border-box; display:flex; flex-direction:column; }
  .setup-main.setup-main-narrow { width:min(100%,calc(var(--chat-column-width,620px) + 48px)); }
  .setup-main h1 { margin:0 0 6px; font-size:26px; line-height:1.2; font-weight:550; letter-spacing:-.04em; text-wrap:balance; }
  .setup-main h1:focus { outline:none; }
  .setup-main .setup-description { max-width:600px; margin:0 0 22px; color:var(--muted); font-size:13px; line-height:1.6; }
  .setup-main h2 { margin-top:24px; font-size:15px; font-weight:550; letter-spacing:-.02em; }
  .setup-main label.setup-field { display:block; margin:18px 0 7px; color:var(--muted); font-size:11px; font-weight:500; }
  #setupWizard .setup-main :is(select,textarea,input:not([type=radio]):not([type=checkbox]):not([type=color]):not(.chatgpt-signin-code)) { width:100%; min-width:0; box-sizing:border-box; font:inherit; font-size:13.5px; padding:11px 14px; border-radius:16px; border:1.5px solid var(--border2); background:var(--card2); color:var(--text); transition:background-color .18s ease,border-color .18s ease; }
  #setupWizard .setup-main :is(select,textarea,input):focus { outline:none; background:var(--card); border-color:var(--dark); }
  #setupWizard .setup-main :is(select,textarea,input):focus-visible { outline:none; }
  .setup-key-row { display:flex; gap:8px; }
  .setup-key-row input { flex:1; }
  .setup-provider-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
  .setup-note { margin-top:10px; color:var(--muted); font-size:12px; line-height:1.6; }
  .setup-message { margin-top:16px; width:fit-content; max-width:100%; box-sizing:border-box; padding:12px 16px; border:1px solid var(--border); border-radius:18px; border-top-left-radius:6px; background:var(--card); box-shadow:var(--shadow); color:var(--text); font-size:13.5px; line-height:1.55; white-space:pre-wrap; overflow-wrap:anywhere; }
  .setup-message:empty { display:none; }
  .setup-message.error { background:var(--err-dim); border-color:color-mix(in srgb,var(--err) 35%,transparent); color:var(--err); box-shadow:none; }
  .setup-footer { position:sticky; bottom:0; z-index:15; display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:auto; padding:28px 0 16px; background:linear-gradient(to top,var(--card) 58%,transparent); border:0; }
  .setup-footer > div { display:flex; gap:8px; margin-left:auto; }
  .setup-wizard .btn { min-height:38px; padding:8px 18px; border-radius:999px; font-size:12.5px; font-weight:500; transition:background-color .18s ease,color .18s ease,border-color .18s ease,transform .14s cubic-bezier(.16,1,.3,1); }
  .setup-wizard .btn:active { transform:scale(.96); }
  .setup-wizard .btn:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  #setupWizard .btn.dark { background:var(--dark)!important; color:var(--bg)!important; border-color:transparent!important; padding:8px 22px; font-weight:600; box-shadow:none!important; }
  #setupWizard .btn.dark:hover { background:color-mix(in srgb,var(--dark) 86%,var(--bg))!important; }
  .setup-wizard .btn.ghost { color:var(--muted); border-color:transparent; background:transparent; }
  .setup-wizard .btn.ghost:hover { color:var(--text); background:var(--hover)!important; }
  .setup-modes { display:grid; gap:10px; }
  .setup-mode { display:flex; gap:14px; padding:16px; border-radius:18px; border:1px solid var(--border); background:var(--card); box-shadow:var(--shadow); cursor:pointer; transition:background-color .16s ease,border-color .16s ease; }
  .setup-mode:hover { background:var(--hover); border-color:var(--border2); }
  .setup-mode:has(input:checked) { border-color:var(--dark); box-shadow:inset 0 0 0 1px var(--dark),var(--shadow); }
  .setup-mode input { width:16px; flex:none; margin:3px 0 0; align-self:start; accent-color:var(--dark); }
  .setup-mode b { display:block; margin-bottom:4px; font-size:13.5px; font-weight:600; }
  .setup-mode small { color:var(--muted); font-size:12px; line-height:1.6; }
  /* Agent mode switch = the Cowork floating pill nav. */
  .setup-agent-modes { display:inline-flex; align-self:flex-start; max-width:100%; gap:2px; padding:4px; margin-bottom:18px; border:1px solid var(--border); border-radius:var(--radius-full,9999px); background:var(--card2); overflow-x:auto; scrollbar-width:none; }
  .setup-agent-modes::-webkit-scrollbar { display:none; }
  .setup-agent-mode { position:relative; display:inline-flex; align-items:center; gap:7px; min-height:34px; padding:0 14px 0 11px; border:0!important; border-radius:999px; background:transparent!important; color:var(--muted)!important; font:inherit; font-size:12.5px; font-weight:500; white-space:nowrap; cursor:pointer; box-shadow:none!important; transition:background-color .18s ease,color .18s ease,transform .14s cubic-bezier(.16,1,.3,1); }
  .setup-agent-mode:hover { background:var(--hover)!important; color:var(--text)!important; }
  .setup-agent-mode:active { transform:scale(.96); }
  .setup-agent-mode[aria-pressed=true] { background:var(--dark)!important; color:var(--bg)!important; font-weight:600; }
  .setup-agent-mode:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .setup-mode-ico { display:inline-flex; align-items:center; justify-content:center; flex:none; color:inherit; }
  .setup-mode-ico svg { width:16px; height:16px; }
  .setup-mode-copy { display:block; min-width:0; }
  .setup-mode-copy b { font-size:inherit; font-weight:inherit; color:inherit; }
  .setup-mode-copy span { position:absolute; width:1px; height:1px; margin:-1px; padding:0; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
  .setup-agents-toolbar { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:12px; color:var(--muted); font-size:12px; }
  .setup-agents-count { display:inline-flex; align-items:center; gap:7px; color:var(--text); font-weight:500; }
  .setup-agents-count svg { width:16px; height:16px; color:var(--muted); }
  .setup-agents-toolbar > div { display:flex; gap:6px; flex-wrap:wrap; }
  #setupWizard .setup-agents-toolbar .btn.ghost { border:1px solid var(--border)!important; background:var(--card2)!important; color:var(--text); font-size:12px; }
  #setupWizard .setup-agents-toolbar .btn.ghost:hover { background:var(--hover)!important; border-color:var(--border2)!important; }
  .setup-agent-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(250px,1fr)); gap:12px; padding:2px 0 8px; }
  .setup-agent-card { position:relative; display:flex; align-items:flex-start; gap:13px; padding:14px; border-radius:18px; border:1px solid var(--border)!important; background:var(--card)!important; color:var(--text)!important; text-align:left; font:inherit; cursor:pointer; box-shadow:var(--shadow)!important; transition:background-color .16s ease,border-color .16s ease,box-shadow .16s ease,transform .14s cubic-bezier(.16,1,.3,1); }
  .setup-agent-card:hover { background:var(--hover)!important; border-color:var(--border2)!important; }
  .setup-agent-card:active { transform:scale(.985); }
  .setup-agent-card:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .setup-agent-card.is-selected { border-color:var(--dark)!important; box-shadow:inset 0 0 0 1px var(--dark),var(--shadow)!important; }
  .setup-agent-ava-wrap { position:relative; width:48px; height:48px; flex:none; display:inline-flex; align-items:center; justify-content:center; padding:3px; box-sizing:border-box; border-radius:14px; background:color-mix(in srgb,var(--card2) 90%,transparent); border:1px solid color-mix(in srgb,var(--border2) 70%,transparent); box-shadow:0 4px 12px -4px rgba(0,0,0,.28); }
  .setup-agent-ava-wrap img { width:40px; height:40px; object-fit:contain; display:block; }
  .setup-agent-role-badge { position:absolute; right:-5px; bottom:-5px; width:20px; height:20px; display:inline-flex; align-items:center; justify-content:center; border-radius:50%; background:var(--card); border:1px solid var(--border2); color:var(--muted); box-shadow:var(--shadow); }
  .setup-agent-role-badge svg { width:11px; height:11px; }
  .setup-agent-card.is-selected .setup-agent-role-badge { background:var(--dark); border-color:var(--dark); color:var(--bg); }
  .setup-agent-card-body { min-width:0; flex:1; }
  .setup-agent-card-head { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:13.5px; font-weight:600; }
  .setup-agent-title { display:inline-flex; align-items:center; gap:6px; min-width:0; }
  .setup-agent-mascot { padding:1px 7px; border-radius:999px; border:1px solid var(--border); background:var(--card2); color:var(--muted); font-size:10.5px; font-weight:500; }
  .setup-agent-tag { margin-top:3px; color:var(--text); font-size:12px; font-weight:500; }
  .setup-agent-desc { margin-top:3px; color:var(--muted); font-size:11.5px; line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .setup-agent-check { flex:none; display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:999px; border:1px solid var(--border); background:var(--card2); color:var(--muted); font-size:11px; font-weight:500; transition:background-color .16s ease,color .16s ease,border-color .16s ease; }
  .setup-agent-check svg { width:12px; height:12px; }
  .setup-agent-card.is-selected .setup-agent-check { background:var(--dark); border-color:var(--dark); color:var(--bg); font-weight:600; }
  .setup-team-banner { display:flex; align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap; margin-bottom:12px; padding:14px 16px; border-radius:18px; border:1px solid var(--border); background:var(--card2); }
  .setup-team-banner b { display:block; margin-bottom:3px; font-size:13.5px; font-weight:600; }
  .setup-team-banner small { display:block; color:var(--muted); font-size:12px; line-height:1.5; }
  .setup-team-roster-strip { display:flex; align-items:center; flex-wrap:wrap; gap:4px; }
  .setup-team-roster-strip img { width:30px; height:30px; padding:2px; object-fit:contain; border-radius:10px; background:var(--card); border:1px solid var(--border); }
  .setup-custom-box { display:grid; gap:12px; padding:18px; border-radius:20px; border:1px solid var(--border); background:var(--card); box-shadow:var(--shadow); }
  .setup-custom-row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  .setup-char-grid { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:8px; margin-top:6px; }
  .setup-char-pick { display:flex; flex-direction:column; align-items:center; gap:5px; padding:9px 6px; border-radius:14px; border:1px solid var(--border)!important; background:var(--card2)!important; color:var(--muted)!important; font:inherit; font-size:11px; font-weight:500; cursor:pointer; box-shadow:none!important; transition:background-color .15s ease,border-color .15s ease,color .15s ease; }
  .setup-char-pick:hover { background:var(--hover)!important; border-color:var(--border2)!important; color:var(--text)!important; }
  .setup-char-pick[aria-pressed=true] { background:var(--card)!important; border-color:var(--dark)!important; color:var(--text)!important; font-weight:600; box-shadow:inset 0 0 0 1px var(--dark)!important; }
  .setup-char-pick img { width:36px; height:36px; object-fit:contain; display:block; }
  .setup-custom-colors { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin-top:8px; }
  .setup-custom-colors input[type=color] { width:32px; height:32px; padding:2px; border-radius:50%; border:1px solid var(--border2); background:var(--card); cursor:pointer; }
  .setup-color-dot { width:22px; height:22px; padding:0!important; border-radius:50%!important; border:2px solid var(--card)!important; box-shadow:0 0 0 1px var(--border)!important; cursor:pointer; }
  .setup-color-dot[aria-pressed=true] { box-shadow:0 0 0 2px var(--dark)!important; }
  .setup-sr-only-select { position:absolute; width:1px; height:1px; opacity:0; pointer-events:none; }
  .setup-custom-queue { display:flex; flex-wrap:wrap; gap:6px; }
  .setup-custom-chip { display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:999px; border:1px solid var(--border); background:var(--card2); font-size:12px; }
  .setup-summary-pill { width:fit-content; max-width:100%; box-sizing:border-box; margin-top:16px; padding:9px 16px; border-radius:var(--radius-full,9999px); border:1px solid var(--border); background:var(--card2); color:var(--text); font-size:12.5px; }
  .setup-phone { display:flex; align-items:center; gap:16px; margin-top:16px; padding:16px; border:1px solid var(--border); border-radius:18px; background:var(--card); box-shadow:var(--shadow); }
  .setup-phone img { width:132px; height:132px; flex:none; padding:8px; border-radius:12px; background:#fff; }
  .setup-phone img[hidden] { display:none; }
  .setup-phone-copy { min-width:0; display:grid; gap:5px; }
  .setup-phone-copy .t { font-size:13.5px; font-weight:600; }
  .setup-phone-copy .d { color:var(--muted); font-size:12px; line-height:1.55; }
  .setup-phone-copy code { color:var(--text); font-size:11.5px; overflow-wrap:anywhere; }
  .setup-phone-copy .btn { justify-self:start; margin-top:2px; min-height:30px; padding:4px 12px; font-size:11.5px; }
  /* Step changes rise in like Cowork chat content; selection re-renders don't. */
  .setup-main.is-entering > :not(.setup-footer) { animation:setupRise .36s cubic-bezier(.16,1,.3,1) both; }
  .setup-main.is-entering > :nth-child(2) { animation-delay:.03s; }
  .setup-main.is-entering > :nth-child(n+3):not(.setup-footer) { animation-delay:.06s; }
  @keyframes setupRise { from { opacity:0; transform:translate3d(0,14px,0); filter:blur(4px); } to { opacity:1; transform:none; filter:none; } }
  @media(max-width:520px) { .setup-phone { flex-direction:column; align-items:flex-start; } .setup-phone img { align-self:center; width:168px; height:168px; } }
  @media(max-width:780px) {
    .setup-wizard { padding:0; }
    .setup-frame { border:0; border-radius:0; box-shadow:none; }
    .setup-aside { grid-template-columns:minmax(0,1fr); justify-items:center; gap:10px; padding:calc(10px + env(safe-area-inset-top, 0px)) 12px 16px; }
    .setup-brand { justify-self:center; }
    .setup-aside p { display:none; }
    .setup-steps { max-width:100%; overflow-x:auto; scrollbar-width:none; }
    .setup-steps li { padding:0 12px 0 7px; font-size:12px; }
    .setup-main { padding:12px 16px 0; }
    .setup-main h1 { font-size:22px; }
    .setup-agent-grid,.setup-custom-row { grid-template-columns:1fr; }
    .setup-char-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }
    .setup-footer { padding-bottom:calc(12px + env(safe-area-inset-bottom, 0px)); }
  }
  @media(max-width:420px) { .setup-steps li { gap:5px; padding:0 10px 0 6px; font-size:11.5px; } .setup-step-number { width:18px; height:18px; font-size:10px; } .setup-main h1 { font-size:20px; } .setup-agent-mode { padding:0 11px 0 9px; font-size:12px; } .setup-footer,.setup-footer > div { flex-wrap:wrap; } }
  @media(prefers-reduced-motion:reduce) { .opening-dots i { animation:none; } .setup-main.is-entering > * { animation:none; } .setup-agent-mode,.setup-agent-card,.setup-char-pick,.setup-steps li,.setup-wizard .btn { transition:none; } }
`;

export const ONBOARDING_HTML = String.raw`
<div id="startupCover" class="gitu-opening"><div class="opening-content"><img src="/brand/agent-gitu-mark.svg" alt="Agent Gitu icon"><h1>Agent Gitu</h1><p id="startupMessage" role="status" aria-live="polite">Opening your workspace…</p><div class="opening-dots" aria-hidden="true"><i></i><i></i><i></i></div><button id="startupReload" class="btn dark" hidden>Try again</button></div></div>
<div id="setupWizard" class="setup-wizard" role="dialog" aria-modal="true" aria-labelledby="setupTitle" hidden></div>
`;

export const ONBOARDING_JS = String.raw`
  var SETUP_ICONS = {
    pick: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M17.5 13.5v7M14 17h7"/>',
    team: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="3.5"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a3.5 3.5 0 0 1 0 6.75"/>',
    custom: '<path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5"/>',
    crown: '<path d="M3 18h18"/><path d="M4 18 2.5 8.5 8 12l4-6.5L16 12l5.5-3.5L20 18"/>',
    cloud: '<path d="M17.5 19H9a5 5 0 0 1-.5-9.98A6 6 0 0 1 20.1 11 4 4 0 0 1 17.5 19Z"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09Z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2Z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 12c0 1.66 3.58 3 8 3s8-1.34 8-3"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9.5 12 2 2 3.5-3.5"/>',
    store: '<path d="m2 7 2-4h16l2 4"/><path d="M4 7v13a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V7"/><path d="M2 7c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3"/><path d="M9.5 21v-5a2.5 2.5 0 0 1 5 0v5"/>',
    headset: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
    compass: '<circle cx="12" cy="12" r="9"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
    pen: '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="m2 2 7.586 7.586"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'
  };
  function setupIconSvg(name) {
    var body = SETUP_ICONS[name] || '';
    return body ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + '</svg>' : '';
  }
  var PIKPAM_READY_AGENTS = [
    {
      name: 'P.A',
      mascot: 'Orb',
      icon: 'crown',
      tagline: 'Chief of Staff & Pikpam Coordinator',
      description: 'Coordinates your Pikpam team, prioritizes daily tasks, delegates coding & deployments, and delivers verified outcomes.',
      avatar: { shape: 'dot-orb', color: '#ff6b57' },
      chiefOfStaff: true,
      allowShell: true,
      allowWrites: true,
      allowConfig: true,
      useHostComputer: false,
      skills: ['browser-workflow', 'pikpam-ecosystem', 'productivity'],
      systemPrompt: 'You are P.A, Chief of Staff on Pikpam. Coordinate specialists, keep priorities clear, delegate coding or Pikpam Cloud deployment when helpful, verify returned results, and deliver concise outcomes.'
    },
    {
      name: 'Atlas',
      mascot: 'Block',
      icon: 'cloud',
      tagline: 'Pikpam Cloud & VPS Architect',
      description: 'Manages Pikpam Cloud projects, dedicated VPS infrastructure, Docker/Compose services, and runtime health checks.',
      avatar: { shape: 'dot-block', color: '#4c7df0' },
      chiefOfStaff: false,
      allowShell: true,
      allowWrites: true,
      allowConfig: true,
      useHostComputer: true,
      skills: ['pikpam-ecosystem'],
      systemPrompt: 'You are Atlas, a Pikpam Cloud and VPS architect. Activate pikpam-ecosystem with use_skill and operate Pikpam Cloud through the saved pikpam connection (list_connections, connection_read, connection_operation) to inspect VPS plans/instances, services, telemetry, logs, env vars, backups, and cloud projects, and verify health before reporting.'
    },
    {
      name: 'Nova',
      mascot: 'Nova',
      icon: 'rocket',
      tagline: 'GitHub & Deployment Engineer',
      description: 'Clones GitHub repositories into Pikpam Cloud, configures managed app-env secrets, and ships verified builds.',
      avatar: { shape: 'dot-nova', color: '#9c6df2' },
      chiefOfStaff: false,
      allowShell: true,
      allowWrites: true,
      allowConfig: false,
      useHostComputer: true,
      skills: ['pikpam-ecosystem'],
      systemPrompt: 'You are Nova, Pikpam GitHub & Deployment specialist. Activate pikpam-ecosystem with use_skill and use the saved pikpam connection (list_connections, connection_read, connection_operation) to manage cloud projects, apps, app environment variables, VPS deployments, and verify live HTTPS endpoints.'
    },
    {
      name: 'Forge',
      mascot: 'Hexa',
      icon: 'code',
      tagline: 'Full-Stack Coding Engineer',
      description: 'Writes, refactors, and tests backend APIs and frontend interfaces directly inside your active project.',
      avatar: { shape: 'dot-hexa', color: '#3fd68f' },
      chiefOfStaff: false,
      allowShell: true,
      allowWrites: true,
      allowConfig: false,
      useHostComputer: true,
      skills: ['frontend-design', 'pikpam-ecosystem'],
      systemPrompt: 'You are Forge, a senior full-stack engineer on Pikpam. Read existing files before editing, build clean UIs and APIs in the selected project workspace, and verify changes with builds and tests.'
    },
    {
      name: 'Vault',
      mascot: 'Plus',
      icon: 'database',
      tagline: 'Database & Storage Engineer',
      description: 'Designs PostgreSQL schemas, manages Redis queues, runs safe migrations, and configures Pikpam storage volumes.',
      avatar: { shape: 'dot-plus', color: '#7ccf35' },
      chiefOfStaff: false,
      allowShell: true,
      allowWrites: true,
      allowConfig: false,
      useHostComputer: true,
      skills: ['pikpam-ecosystem'],
      systemPrompt: 'You are Vault, Pikpam database & storage engineer. Activate pikpam-ecosystem with use_skill and use the saved pikpam connection (list_connections, connection_read, connection_operation) to manage Pikpam S3 storage plans/volumes (list, attach, detach, order link), VPS backups, and scoped PIKPAM_POSTGRES_URL / PIKPAM_REDIS_URL securely without exposing ports or credentials.'
    },
    {
      name: 'Aegis',
      mascot: 'Penta',
      icon: 'shield',
      tagline: 'Domains, SSL & Security Lead',
      description: 'Searches & connects domains on Pikpam Cloud, manages DNS records, routes domains to VPS apps, verifies HTTPS/TLS, and audits security.',
      avatar: { shape: 'dot-penta', color: '#f39b52' },
      chiefOfStaff: false,
      allowShell: true,
      allowWrites: false,
      allowConfig: false,
      useHostComputer: true,
      skills: ['pikpam-ecosystem'],
      systemPrompt: 'You are Aegis, Pikpam domains, DNS, SSL & security specialist. Activate pikpam-ecosystem with use_skill and use the saved pikpam connection (list_connections, connection_read, connection_operation) to search domain availability & TLD pricing, list owned domains, connect external domains and verify TXT ownership, manage DNS records (A/AAAA/CNAME/TXT/MX/SPF/DKIM), route domains to VPS apps, verify DNS & HTTPS readiness, prepare domain order/renewal checkout links for the user to pay, and audit credential hygiene without exposing secrets.'
    },
    {
      name: 'Pulse',
      mascot: 'Dia',
      icon: 'store',
      tagline: 'Pikpam Commerce & Growth Strategist',
      description: 'Optimizes pikpam.com storefront catalogs, product listings, pricing strategy, and merchant conversion funnels.',
      avatar: { shape: 'dot-dia', color: '#29b7ad' },
      chiefOfStaff: false,
      allowShell: false,
      allowWrites: true,
      allowConfig: false,
      useHostComputer: true,
      skills: ['browser-workflow', 'pikpam-ecosystem', 'productivity'],
      systemPrompt: 'You are Pulse, Pikpam Commerce & Growth strategist. Help merchants and founders launch, organize, and grow storefronts, domains, and conversion funnels on pikpam.com with clear actionable plans.'
    },
    {
      name: 'Clara',
      mascot: 'Pill',
      icon: 'headset',
      tagline: 'Customer Success & Email Lead',
      description: 'Manages Pikpam custom-domain mailboxes, triages inbox threads, drafts empathetic customer follow-ups, and keeps approvals organized.',
      avatar: { shape: 'dot-pill', color: '#ec4899' },
      chiefOfStaff: false,
      allowShell: false,
      allowWrites: true,
      allowConfig: false,
      useHostComputer: true,
      skills: ['browser-workflow', 'pikpam-ecosystem', 'productivity'],
      systemPrompt: 'You are Clara, Customer Success & Email Lead on Pikpam. Activate pikpam-ecosystem with use_skill when managing Pikpam custom-domain email settings, email domains, mailboxes, or mailbox messages through the saved pikpam connection. Triage incoming support requests, surface urgent blockers, and always require approval before sending emails.'
    },
    {
      name: 'Scout',
      mascot: 'Tip',
      icon: 'compass',
      tagline: 'Research & Market Intelligence',
      description: 'Runs live web research, benchmarks competitors and APIs, and returns concise cited briefings.',
      avatar: { shape: 'dot-tip', color: '#eab308' },
      chiefOfStaff: false,
      allowShell: false,
      allowWrites: false,
      allowConfig: false,
      useHostComputer: true,
      skills: ['browser-workflow'],
      systemPrompt: 'You are Scout, a rigorous research analyst. Gather verified facts from files and the web, compare options objectively, and cite sources clearly.'
    },
    {
      name: 'Lyra',
      mascot: 'Luna',
      icon: 'pen',
      tagline: 'Product Docs, Content & Deck Writer',
      description: 'Creates crisp launch copy, technical READMEs, campaign docs, and formatted PDF, PPTX, Word, or XLSX exports.',
      avatar: { shape: 'dot-luna', color: '#4f6396' },
      chiefOfStaff: false,
      allowShell: false,
      allowWrites: true,
      allowConfig: false,
      useHostComputer: true,
      skills: ['productivity', 'frontend-design'],
      systemPrompt: 'You are Lyra, Product Content & Docs writer on Pikpam. Turn rough ideas into tight copy, technical READMEs, release notes, and polished PDF/PPTX/Word/XLSX deliverables.'
    }
  ];
  var SETUP_SHAPE_COLORS = {
    'dot-orb': '#ff6b57', 'dot-block': '#4c7df0', 'dot-tip': '#eab308', 'dot-hexa': '#3fd68f', 'dot-nova': '#9c6df2',
    'dot-dia': '#29b7ad', 'dot-penta': '#f39b52', 'dot-luna': '#4f6396', 'dot-plus': '#7ccf35', 'dot-pill': '#ec4899'
  };
  var SETUP_SHAPE_OPTIONS = [
    ['dot-orb', 'Orb (Coral)'],
    ['dot-block', 'Block (Blue)'],
    ['dot-tip', 'Tip (Amber)'],
    ['dot-hexa', 'Hexa (Mint)'],
    ['dot-nova', 'Nova (Violet)'],
    ['dot-dia', 'Dia (Teal)'],
    ['dot-penta', 'Penta (Orange)'],
    ['dot-luna', 'Luna (Indigo)'],
    ['dot-plus', 'Plus (Lime)'],
    ['dot-pill', 'Pill (Rose)']
  ];
  var SETUP_COLOR_SWATCHES = [['Coral', '#ff6b57'], ['Blue', '#4c7df0'], ['Amber', '#eab308'], ['Mint', '#3fd68f'], ['Violet', '#9c6df2'], ['Teal', '#29b7ad'], ['Orange', '#f39b52'], ['Indigo', '#4f6396'], ['Lime', '#7ccf35'], ['Rose', '#e66ca9']];
  function setupCharFilter(shape, color) {
    if (typeof cwCharacterFilter === 'function') return cwCharacterFilter({ shape: shape, color: color }, shape);
    var base = SETUP_SHAPE_COLORS[shape];
    if (!base || !/^#[0-9a-f]{6}$/i.test(color || '') || color.toLowerCase() === base) return '';
    var rgb = function (hex) { return [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16); }); };
    var hue = function (c) {
      var v = rgb(c).map(function (n) { return n / 255; }), hi = Math.max.apply(Math, v), lo = Math.min.apply(Math, v), d = hi - lo;
      if (!d) return 0;
      return ((hi === v[0] ? (v[1] - v[2]) / d : hi === v[1] ? (v[2] - v[0]) / d + 2 : (v[0] - v[1]) / d + 4) * 60 + 360) % 360;
    };
    var t = rgb(color), s = rgb(base), th = Math.max.apply(Math, t), tl = Math.min.apply(Math, t), sh = Math.max.apply(Math, s), sl = Math.min.apply(Math, s);
    var sat = th ? (th - tl) / th : 0, ssat = sh ? (sh - sl) / sh : 1;
    return 'hue-rotate(' + Math.round(hue(color) - hue(base)) + 'deg) saturate(' + Math.min(2, ssat ? sat / ssat : 1).toFixed(2) + ') brightness(' + Math.max(0.25, Math.min(1.8, sh ? th / sh : 1)).toFixed(2) + ')';
  }
  function buildSetupCustomAgent(draft) {
    var d = draft || {};
    var name = String(d.name || '').trim();
    var shape = SETUP_SHAPE_COLORS[d.shape] ? d.shape : 'dot-orb';
    var color = /^#[0-9a-f]{6}$/i.test(String(d.color || '')) ? String(d.color).toLowerCase() : (SETUP_SHAPE_COLORS[shape] || '#ff6b57');
    return {
      name: name,
      tagline: String(d.tagline || '').trim() || 'Custom specialist',
      systemPrompt: String(d.systemPrompt || '').trim() || ('You are ' + name + ', a helpful Pikpam specialist.'),
      avatar: { shape: shape, color: color },
      skills: ['browser-workflow', 'pikpam-ecosystem'],
      allowShell: true,
      allowWrites: true,
      allowConfig: false,
      useHostComputer: true,
      chiefOfStaff: false
    };
  }
  var setupState = null;
  function setupMessage(text, error) {
    var el = $('setupMessage');
    if (el) { el.textContent = text; el.className = 'setup-message' + (error ? ' error' : ''); el.setAttribute('role', error ? 'alert' : 'status'); }
  }
  function setupAllProviders() {
    var list = S.models || [];
    var pikOnly = list.filter(function (p) { return p && p.id === 'pikrouter'; });
    return pikOnly.length ? pikOnly : list;
  }
  function setupProvider() { return setupAllProviders().find(function (p) { return p.id === setupState.provider; }); }
  function setupModelValue(p) {
    if (!p) return '';
    var selected = setupState.model || S.sel.model || '';
    if (selected.indexOf(p.id + '::') === 0 && (p.models || []).some(function (m) { return p.id + '::' + m.id === selected; })) return selected;
    var model = (p.models || []).find(function (m) { return m.id === p.defaultModel; }) || (p.models || [])[0];
    return model ? p.id + '::' + model.id : '';
  }
  function syncSetupCustomDraft() {
    if (!setupState || !setupState.customDraft) return;
    if ($('setupCustomName')) setupState.customDraft.name = $('setupCustomName').value;
    if ($('setupCustomTagline')) setupState.customDraft.tagline = $('setupCustomTagline').value;
    if ($('setupCustomShape')) setupState.customDraft.shape = $('setupCustomShape').value;
    if ($('setupCustomColor') && /^#[0-9a-f]{6}$/i.test($('setupCustomColor').value || '')) setupState.customDraft.color = $('setupCustomColor').value.toLowerCase();
    if ($('setupCustomPrompt')) setupState.customDraft.systemPrompt = $('setupCustomPrompt').value;
  }
  function setupAgentSummaryText() {
    if (!setupState) return '';
    if (setupState.agentChoiceMode === 'team') return 'Full Pikpam Team: all ' + PIKPAM_READY_AGENTS.length + ' ready-made agents + shared team chat will be created.';
    if (setupState.agentChoiceMode === 'custom') {
      var queued = (setupState.customAgents || []).length + (setupState.customDraft && setupState.customDraft.name && setupState.customDraft.name.trim() ? 1 : 0);
      return 'Custom Agent mode: ' + Math.max(1, queued) + ' custom teammate' + (queued === 1 ? '' : 's') + ' ready to create.';
    }
    var count = (setupState.selectedAgentIndexes || []).length;
    return 'Ready-made Pikpam Agents: ' + count + ' of ' + PIKPAM_READY_AGENTS.length + ' selected.';
  }
  function setupAgentsHtml() {
    var mode = setupState.agentChoiceMode || 'pick';
    var selected = setupState.selectedAgentIndexes || [];
    var modesHtml =
      '<div class="setup-agent-modes" role="tablist" aria-label="Agent onboarding options">' +
        '<button type="button" class="setup-agent-mode" id="setupModePick" data-agent-mode="pick" aria-pressed="' + (mode === 'pick') + '">' +
          '<span class="setup-mode-ico" aria-hidden="true">' + setupIconSvg('pick') + '</span>' +
          '<span class="setup-mode-copy"><b>Choose Agents (10)</b><span>Pick from 10 ready-made pikpam.com agents</span></span>' +
        '</button>' +
        '<button type="button" class="setup-agent-mode" id="setupModeTeam" data-agent-mode="team" aria-pressed="' + (mode === 'team') + '">' +
          '<span class="setup-mode-ico" aria-hidden="true">' + setupIconSvg('team') + '</span>' +
          '<span class="setup-mode-copy"><b>Choose Full Team</b><span>Create all 10 Pikpam agents + team chat</span></span>' +
        '</button>' +
        '<button type="button" class="setup-agent-mode" id="setupModeCustom" data-agent-mode="custom" aria-pressed="' + (mode === 'custom') + '">' +
          '<span class="setup-mode-ico" aria-hidden="true">' + setupIconSvg('custom') + '</span>' +
          '<span class="setup-mode-copy"><b>Create Custom Agent</b><span>Define your own custom specialist</span></span>' +
        '</button>' +
      '</div>';
    if (mode === 'custom') {
      var draft = setupState.customDraft || { name: '', tagline: '', shape: 'dot-orb', systemPrompt: '' };
      var queueHtml = (setupState.customAgents || []).length
        ? '<div class="setup-custom-queue" id="setupCustomQueue">' + setupState.customAgents.map(function (a, idx) {
            return '<span class="setup-custom-chip"><span>' + esc(a.name) + (a.tagline ? ' · ' + esc(a.tagline) : '') + '</span><button type="button" class="btn ghost" style="min-height:20px;padding:0 6px" data-remove-custom="' + idx + '" aria-label="Remove ' + esc(a.name) + '">&times;</button></span>';
          }).join('') + '</div>'
        : '';
      var activeShape = SETUP_SHAPE_COLORS[draft.shape] ? draft.shape : 'dot-orb';
      var activeColor = /^#[0-9a-f]{6}$/i.test(draft.color || '') ? String(draft.color).toLowerCase() : (SETUP_SHAPE_COLORS[activeShape] || '#ff6b57');
      var visualChars = SETUP_SHAPE_OPTIONS;
      return modesHtml +
        '<div class="setup-custom-box">' +
          '<div class="setup-custom-row">' +
            '<div><label class="setup-field" style="margin-top:0" for="setupCustomName">Agent name</label><input id="setupCustomName" type="text" value="' + esc(draft.name || '') + '" placeholder="e.g. Kira, Orion, Maya…"></div>' +
            '<div><label class="setup-field" style="margin-top:0" for="setupCustomTagline">Role / specialty</label><input id="setupCustomTagline" type="text" value="' + esc(draft.tagline || '') + '" placeholder="e.g. Pikpam Store Manager"></div>' +
          '</div>' +
          '<div>' +
            '<label class="setup-field" style="margin-top:0" for="setupCustomShape">Character mascot</label>' +
            '<div class="setup-char-grid" role="group" aria-label="Choose custom character mascot">' +
              visualChars.map(function (opt) {
                var shape = opt[0];
                var charName = shape.replace(/^dot-/, '');
                var label = String(opt[1]).split(' ')[0];
                var charFilter = activeShape === shape ? setupCharFilter(shape, activeColor) : '';
                return '<button type="button" class="setup-char-pick" data-setup-char="' + shape + '" aria-pressed="' + (activeShape === shape) + '">' +
                  '<img src="/characters/' + esc(charName) + '.png?v=opendots1" alt="" width="36" height="36" loading="lazy"' + (charFilter ? ' style="filter:' + esc(charFilter) + '"' : '') + '>' +
                  '<span>' + esc(label) + '</span>' +
                '</button>';
              }).join('') +
            '</div>' +
            '<div class="setup-custom-colors">' +
              '<label class="setup-field" style="margin-top:0" for="setupCustomColor">Character color</label>' +
              '<input type="color" id="setupCustomColor" value="' + esc(activeColor) + '" aria-label="Character color">' +
              SETUP_COLOR_SWATCHES.map(function (choice) {
                return '<button type="button" class="setup-color-dot" data-setup-color="' + choice[1] + '" style="background:' + choice[1] + '" title="' + choice[0] + '" aria-label="' + choice[0] + ' color" aria-pressed="' + (activeColor === choice[1]) + '"></button>';
              }).join('') +
            '</div>' +
            '<select id="setupCustomShape" class="setup-sr-only-select" tabindex="-1" aria-label="Character mascot">' +
              SETUP_SHAPE_OPTIONS.map(function (opt) {
                return '<option value="' + opt[0] + '"' + (activeShape === opt[0] ? ' selected' : '') + '>' + opt[1] + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<div><label class="setup-field" style="margin-top:0" for="setupCustomPrompt">Instructions (system prompt)</label><textarea id="setupCustomPrompt" rows="3" placeholder="Describe what this agent focuses on and how it should work on Pikpam…">' + esc(draft.systemPrompt || '') + '</textarea></div>' +
          queueHtml +
          '<div class="setup-provider-actions" style="margin-top:2px"><button type="button" class="btn ghost" id="setupCustomAdd">+ Save &amp; add another custom agent</button></div>' +
        '</div>';
    }
    var teamBanner = mode === 'team'
      ? '<div class="setup-team-banner"><div><b>Complete 10-Agent Pikpam Team</b><small>All 10 Pikpam specialists below will be created together with a shared <strong>Pikpam Team</strong> room coordinated by P.A.</small></div><div class="setup-team-roster-strip" aria-hidden="true">' + PIKPAM_READY_AGENTS.map(function (agent) {
          var charName = String(agent.avatar.shape || 'dot-orb').replace(/^dot-/, '');
          return '<img src="/characters/' + esc(charName) + '.png?v=opendots1" alt="" width="28" height="28" loading="lazy">';
        }).join('') + '</div></div>'
      : '<div class="setup-agents-toolbar"><span class="setup-agents-count">' + setupIconSvg('team') + '<span>' + selected.length + ' of ' + PIKPAM_READY_AGENTS.length + ' Pikpam agents selected</span></span><div><button type="button" class="btn ghost" id="setupSelectAllAgents" style="min-height:30px;padding:4px 12px">Select all 10</button><button type="button" class="btn ghost" id="setupStarterAgents" style="min-height:30px;padding:4px 12px">Starter 3</button></div></div>';
    var gridHtml = '<div class="setup-agent-grid" id="setupAgentGrid">' + PIKPAM_READY_AGENTS.map(function (agent, idx) {
      var isPicked = mode === 'team' || selected.indexOf(idx) >= 0;
      var charName = String(agent.avatar.shape || 'dot-orb').replace(/^dot-/, '');
      var tint = agent.avatar && agent.avatar.color ? agent.avatar.color : '#5ba8ff';
      return '<button type="button" class="setup-agent-card' + (isPicked ? ' is-selected' : '') + '" id="setupAgent' + idx + '" data-setup-agent-idx="' + idx + '" aria-pressed="' + isPicked + '" style="--agent-tint:' + esc(tint) + '">' +
        '<span class="setup-agent-ava-wrap" aria-hidden="true">' +
          '<img src="/characters/' + esc(charName) + '.png?v=opendots1" alt="" width="44" height="44" loading="lazy">' +
          '<span class="setup-agent-role-badge">' + setupIconSvg(agent.icon || 'crown') + '</span>' +
        '</span>' +
        '<span class="setup-agent-card-body">' +
          '<span class="setup-agent-card-head">' +
            '<span class="setup-agent-title"><span>' + esc(agent.name) + '</span>' + (agent.mascot ? '<span class="setup-agent-mascot">' + esc(agent.mascot) + '</span>' : '') + '</span>' +
            '<span class="setup-agent-check">' + setupIconSvg(isPicked ? 'check' : 'plus') + '<span>' + (isPicked ? 'Selected' : 'Add') + '</span></span>' +
          '</span>' +
          '<div class="setup-agent-tag">' + esc(agent.tagline) + '</div>' +
          '<div class="setup-agent-desc">' + esc(agent.description) + '</div>' +
        '</span>' +
      '</button>';
    }).join('') + '</div>';
    return modesHtml + teamBanner + gridHtml;
  }
  function setupConnectionHtml() {
    var providers = setupAllProviders();
    if (!providers.length) return '<p class="setup-note">Load your PikRouter connection to continue, or set this up later.</p><button class="btn ghost" id="setupRefresh">Load PikRouter</button>';
    var p = setupProvider() || providers.find(function (item) { return item.id === 'pikrouter'; }) || providers.find(providerIsUsable) || providers[0];
    setupState.provider = p.id;
    setupState.model = setupModelValue(p);
    var ready = providerIsUsable(p);
    var pikAuth = p.id === 'pikrouter';
    return '<label class="setup-field" for="setupProvider">Active provider (PikRouter only)</label><select id="setupProvider">' + providers.map(function (item) {
      return '<option value="' + esc(item.id) + '"' + (p.id === item.id ? ' selected' : '') + '>' + esc(item.label || item.id) + (item.id === 'pikrouter' ? ' · Active' : '') + (providerIsUsable(item) ? ' · Connected' : '') + '</option>';
    }).join('') + '</select>' +
      (ready ? '<p class="setup-note">' + (pikAuth ? 'Pikpam PikRouter is connected and ready to route all AI requests.' : 'A key is already available for this provider.') + '</p>' : '') +
      (pikAuth ? '<div class="setup-provider-actions" style="margin-bottom:10px"><button class="btn dark" id="setupPikOAuth">' + (ready ? 'Switch or Reconnect with Pikpam' : 'Continue with Pikpam (Hosted Authorize &amp; Register)') + '</button><button class="btn ghost" id="setupRefresh">Refresh models</button></div>' :
        (p.keyEnvVars || []).length ? '<label class="setup-field" for="setupKey">' + (ready ? 'Replace API key (optional)' : 'API key') + '</label><div class="setup-key-row"><input id="setupKey" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your API key"><button class="btn ghost" id="setupShowKey" aria-label="Show API key">Show</button></div><p class="setup-note">Saved in Agent Gitu’s local key store.</p><div class="setup-provider-actions"><button class="btn dark" id="setupSaveKey">Save key</button><button class="btn ghost" id="setupRefresh">Refresh models</button></div>' : '<p class="setup-note">This provider does not need an API key here.</p><button class="btn ghost" id="setupRefresh">Refresh connection</button>') +
      '<label class="setup-field" for="setupModel">Default model</label><select id="setupModel"' + (ready ? '' : ' disabled') + '>' + (p.models || []).map(function (m) {
        var value = p.id + '::' + m.id;
        return '<option value="' + esc(value) + '"' + (setupState.model === value ? ' selected' : '') + '>' + esc(m.id) + '</option>';
      }).join('') + '</select>';
  }
  function renderSetup() {
    var root = $('setupWizard');
    var step = setupState.step;
    var titles = ['Choose your Pikpam agents', 'Connect PikRouter AI', 'Make yourself at home'];
    var descriptions = [
      'Pick from 10 ready-made pikpam.com agents, launch the full 10-agent team, or create your own custom agent.',
      'PikRouter (pikpam.com) is the sole AI provider for your workspace and agents.',
      'Choose your workspace theme. Your selected agents will open right inside Cowork.'
    ];
    var content = step === 0 ? setupAgentsHtml() : step === 1 ? setupConnectionHtml() :
      themeOptionsHtml().replace(/name="appearance"/g, 'name="setupAppearance"') +
      '<div class="setup-summary-pill">' + esc(setupAgentSummaryText()) + '</div>' +
      '<div class="setup-modes" role="radiogroup" aria-label="Starting workspace" hidden>' + [{ id: 'cowork', title: 'Cowork (Recommended)', description: 'Collaborate with your Pikpam agents while coding runs behind the scenes.' }, { id: 'coding', title: 'Coding', description: 'Open directly into local coding mode.' }].map(function (mode) {
        return '<label class="setup-mode"><input type="radio" name="setupMode" value="' + mode.id + '"' + (setupState.mode === mode.id ? ' checked' : '') + '><span><b>' + mode.title + '</b><small>' + mode.description + '</small></span></label>';
      }).join('') + '</div>' +
      '<div class="setup-phone" id="setupPhone"><img id="setupPhoneQr" alt="QR code to connect the Agent Gitu mobile app" width="132" height="132" hidden><div class="setup-phone-copy"><div class="t">Connect your phone</div><div class="d" id="setupPhoneCopy">Scan this code with your phone camera to open Agent Gitu there.</div><code id="setupPhoneAddress"></code><button type="button" class="btn ghost" id="setupPhoneRefresh">Refresh address</button></div></div>';
    // The rounded frame is the scroller; keep its position across selection
    // re-renders and only replay the entrance when the step changes.
    var canQuery = typeof root.querySelector === 'function';
    var prevFrame = canQuery ? root.querySelector('.setup-frame') : null;
    var prevScroll = prevFrame ? prevFrame.scrollTop : 0;
    var entering = setupState.renderedStep !== step;
    setupState.renderedStep = step;
    root.innerHTML = '<div class="setup-frame"><aside class="setup-aside"><div class="setup-brand"><img src="/brand/agent-gitu-mark.svg" alt=""><span>Agent Gitu</span></div><p>Your Pikpam team. Powered by PikRouter.</p><ol class="setup-steps">' + ['Agents', 'PikRouter', 'Finish'].map(function (name, i) {
      return '<li' + (i === step ? ' aria-current="step"' : i < step ? ' data-done="true"' : '') + '><span class="setup-step-number">' + (i + 1) + '</span>' + name + '</li>';
    }).join('') + '</ol></aside><section class="setup-main' + (step !== 0 ? ' setup-main-narrow' : '') + (entering ? ' is-entering' : '') + '"><h1 id="setupTitle" tabindex="-1">' + titles[step] + '</h1><p class="setup-description">' + descriptions[step] + '</p>' + content +
      '<div id="setupMessage" class="setup-message" role="status" aria-live="polite"></div><footer class="setup-footer"><button class="btn ghost" id="setupBack"' + (step === 0 ? ' hidden' : '') + '>Back</button><div>' + (step === 1 ? '<button class="btn ghost" id="setupSkip">Set up later</button>' : '') + '<button class="btn dark" id="setupNext">' + (step === 2 ? 'Open ' + (setupState.mode === 'cowork' ? 'Cowork' : 'Coding') : 'Continue') + '</button></div></footer></section></div>';
    var frame = canQuery ? root.querySelector('.setup-frame') : null;
    if (frame && !entering) frame.scrollTop = prevScroll;
    $('setupBack').onclick = function () { if (step === 0) return; setupState.step--; renderSetup(); };
    $('setupNext').onclick = function () {
      if (step === 0) {
        syncSetupCustomDraft();
        if (setupState.agentChoiceMode === 'pick' && !(setupState.selectedAgentIndexes || []).length) {
          setupMessage('Select at least one ready-made Pikpam agent, choose the full team, or create a custom agent.', true);
          return;
        }
        if (setupState.agentChoiceMode === 'custom') {
          var hasDraftName = Boolean(setupState.customDraft && setupState.customDraft.name && setupState.customDraft.name.trim());
          if (!hasDraftName && !(setupState.customAgents || []).length) {
            setupMessage('Enter a name for your custom agent before continuing.', true);
            return;
          }
        }
      }
      if (step === 1) {
        var p = setupProvider();
        if ($('setupKey') && $('setupKey').value.trim()) { setupMessage('Save your API key before continuing.', true); return; }
        if (!providerIsUsable(p) || !setupState.model) { setupMessage('Connect a provider and choose a model, or select Set up later.', true); return; }
        S.sel.model = setupState.model;
        rememberModelSelection(setupState.model);
        persist();
      }
      if (step === 2) { finishSetup(); return; }
      setupState.step++;
      renderSetup();
      if (setupState.step === 1 && !S.modelsLoaded) refreshSetupProviders();
    };
    root.querySelectorAll('[data-agent-mode]').forEach(function (btn) {
      btn.onclick = function () {
        syncSetupCustomDraft();
        setupState.agentChoiceMode = btn.getAttribute('data-agent-mode') || 'pick';
        if (setupState.agentChoiceMode === 'team') setupState.selectedAgentIndexes = PIKPAM_READY_AGENTS.map(function (_, i) { return i; });
        renderSetup();
      };
    });
    root.querySelectorAll('[data-setup-agent-idx]').forEach(function (card) {
      card.onclick = function () {
        var idx = Number(card.getAttribute('data-setup-agent-idx'));
        if (setupState.agentChoiceMode === 'team') setupState.agentChoiceMode = 'pick';
        var arr = setupState.selectedAgentIndexes || [];
        var pos = arr.indexOf(idx);
        if (pos >= 0) arr.splice(pos, 1); else arr.push(idx);
        arr.sort(function (a, b) { return a - b; });
        setupState.selectedAgentIndexes = arr;
        renderSetup();
      };
    });
    if ($('setupSelectAllAgents')) $('setupSelectAllAgents').onclick = function () {
      setupState.agentChoiceMode = 'pick';
      setupState.selectedAgentIndexes = PIKPAM_READY_AGENTS.map(function (_, i) { return i; });
      renderSetup();
    };
    if ($('setupStarterAgents')) $('setupStarterAgents').onclick = function () {
      setupState.agentChoiceMode = 'pick';
      setupState.selectedAgentIndexes = [0, 1, 3];
      renderSetup();
    };
    function syncSetupCharVisuals() {
      var shape = (setupState.customDraft && setupState.customDraft.shape) || 'dot-orb';
      var color = (setupState.customDraft && setupState.customDraft.color) || SETUP_SHAPE_COLORS[shape] || '#ff6b57';
      if ($('setupCustomColor')) $('setupCustomColor').value = color;
      root.querySelectorAll('[data-setup-color]').forEach(function (dot) {
        dot.setAttribute('aria-pressed', String(dot.getAttribute('data-setup-color') === color));
      });
      root.querySelectorAll('[data-setup-char]').forEach(function (other) {
        var pressed = other.getAttribute('data-setup-char') === shape;
        other.setAttribute('aria-pressed', String(pressed));
        var img = typeof other.querySelector === 'function' ? other.querySelector('img') : null;
        if (img && img.style) img.style.filter = pressed ? setupCharFilter(shape, color) : '';
      });
    }
    root.querySelectorAll('[data-setup-char]').forEach(function (btn) {
      btn.onclick = function () {
        var shape = btn.getAttribute('data-setup-char') || 'dot-orb';
        syncSetupCustomDraft();
        if (!setupState.customDraft) setupState.customDraft = {};
        setupState.customDraft.shape = shape;
        if (!setupState.customDraft.customColorPicked) setupState.customDraft.color = SETUP_SHAPE_COLORS[shape] || '#ff6b57';
        if ($('setupCustomShape')) $('setupCustomShape').value = shape;
        syncSetupCharVisuals();
      };
    });
    if ($('setupCustomShape')) $('setupCustomShape').onchange = function () {
      var shape = this.value || 'dot-orb';
      if (!setupState.customDraft) setupState.customDraft = {};
      setupState.customDraft.shape = shape;
      if (!setupState.customDraft.customColorPicked) setupState.customDraft.color = SETUP_SHAPE_COLORS[shape] || '#ff6b57';
      syncSetupCharVisuals();
    };
    if ($('setupCustomColor')) $('setupCustomColor').oninput = function () {
      syncSetupCustomDraft();
      if (!setupState.customDraft) setupState.customDraft = {};
      setupState.customDraft.customColorPicked = true;
      setupState.customDraft.color = String(this.value || '').toLowerCase();
      syncSetupCharVisuals();
    };
    root.querySelectorAll('[data-setup-color]').forEach(function (dot) {
      dot.onclick = function () {
        syncSetupCustomDraft();
        if (!setupState.customDraft) setupState.customDraft = {};
        setupState.customDraft.customColorPicked = true;
        setupState.customDraft.color = dot.getAttribute('data-setup-color') || '#ff6b57';
        syncSetupCharVisuals();
      };
    });
    if ($('setupCustomAdd')) $('setupCustomAdd').onclick = function () {
      syncSetupCustomDraft();
      var draft = setupState.customDraft || {};
      if (!String(draft.name || '').trim()) { setupMessage('Enter a name for your custom agent first.', true); return; }
      setupState.customAgents.push(buildSetupCustomAgent(draft));
      var nextShape = draft.shape || 'dot-orb';
      setupState.customDraft = { name: '', tagline: '', shape: nextShape, color: SETUP_SHAPE_COLORS[nextShape] || '#ff6b57', systemPrompt: '' };
      setupMessage('Added ' + setupState.customAgents[setupState.customAgents.length - 1].name + ' to your setup queue.');
      renderSetup();
    };
    root.querySelectorAll('[data-remove-custom]').forEach(function (btn) {
      btn.onclick = function () {
        setupState.customAgents.splice(Number(btn.getAttribute('data-remove-custom')), 1);
        renderSetup();
      };
    });
    if ($('setupSkip')) $('setupSkip').onclick = function () { setupState.step = 2; renderSetup(); };
    if ($('setupProvider')) $('setupProvider').onchange = function () { setupState.provider = this.value; setupState.model = ''; renderSetup(); };
    if ($('setupModel')) $('setupModel').onchange = function () { setupState.model = this.value; };
    if ($('setupShowKey')) $('setupShowKey').onclick = function () {
      var input = $('setupKey'); var show = input.type === 'password'; input.type = show ? 'text' : 'password';
      this.textContent = show ? 'Hide' : 'Show'; this.setAttribute('aria-label', show ? 'Hide API key' : 'Show API key');
    };
    if ($('setupSaveKey')) $('setupSaveKey').onclick = saveSetupKey;
    if ($('setupPikOAuth')) $('setupPikOAuth').onclick = function () { startPikRouterOAuth('/callback'); };
    if ($('setupRefresh')) $('setupRefresh').onclick = refreshSetupProviders;
    root.querySelectorAll('[name=setupMode]').forEach(function (input) { input.onchange = function () { setupState.mode = input.value; $('setupNext').textContent = 'Open ' + (input.value === 'cowork' ? 'Cowork' : 'Coding'); }; });
    if (step === 2) {
      var phoneQr = function (address) {
        var image = $('setupPhoneQr'), copy = $('setupPhoneCopy'), label = $('setupPhoneAddress');
        if (!image) return;
        if (!address) {
          image.hidden = true;
          image.src = '';
          if (label) label.textContent = '';
          if (copy) copy.textContent = 'Use an address your phone can reach, such as your computer’s private network IP. In the desktop app, see Settings → General → Phone access.';
          return;
        }
        var link = typeof window !== 'undefined' && typeof window.gituPhoneConnectLink === 'function' ? window.gituPhoneConnectLink(address) : 'agentgitu://connect?server=' + encodeURIComponent(address);
        image.hidden = false;
        image.src = typeof window !== 'undefined' && typeof window.gituPhoneQrSrc === 'function' ? window.gituPhoneQrSrc(address) : '/api/qr?text=' + encodeURIComponent(link);
        image.alt = 'QR code to open ' + address + ' in Agent Gitu';
        if (label) label.textContent = address;
        if (copy) copy.textContent = 'Scan this code with your phone camera to open Agent Gitu there. Work stays on this server. Local HTTP is unencrypted; use trusted Wi-Fi.';
      };
      var pageLocation = typeof location !== 'undefined' ? location : null;
      var loopback = !pageLocation || /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(pageLocation.hostname);
      var phoneOrigin = pageLocation && !loopback ? pageLocation.origin : '';
      var loadPhoneAccess = function () {
        return typeof window !== 'undefined' && window.gituDesktop && typeof window.gituDesktop.phoneAccess === 'function'
          ? window.gituDesktop.phoneAccess()
          : Promise.resolve(null);
      };
      phoneQr(phoneOrigin);
      loadPhoneAccess().then(function (status) {
        var address = typeof window !== 'undefined' && typeof window.gituPhoneAccessibleAddress === 'function' ? window.gituPhoneAccessibleAddress(status && status.addresses) : status && status.addresses && status.addresses[0];
        if (address && $('setupPhoneQr')) phoneQr(address);
      }).catch(function () {});
      if ($('setupPhoneRefresh')) $('setupPhoneRefresh').onclick = function () {
        var button = this;
        button.disabled = true;
        loadPhoneAccess().then(function (status) {
          var address = typeof window !== 'undefined' && typeof window.gituPhoneAccessibleAddress === 'function' ? window.gituPhoneAccessibleAddress(status && status.addresses) : status && status.addresses && status.addresses[0];
          phoneQr(address || phoneOrigin);
        }).catch(function () {
          phoneQr(phoneOrigin);
        }).finally(function () { if (button.isConnected) button.disabled = false; });
      };
    }
    $('setupTitle').focus();
  }
  async function createOnboardingAgents() {
    if (!setupState) return;
    syncSetupCustomDraft();
    var specs = [];
    var createTeamChat = false;
    if (setupState.agentChoiceMode === 'team') {
      specs = PIKPAM_READY_AGENTS.slice();
      createTeamChat = true;
    } else if (setupState.agentChoiceMode === 'custom') {
      specs = (setupState.customAgents || []).slice();
      if (setupState.customDraft && setupState.customDraft.name && setupState.customDraft.name.trim()) {
        specs.push(buildSetupCustomAgent(setupState.customDraft));
      }
    } else {
      specs = (setupState.selectedAgentIndexes || []).map(function (i) { return PIKPAM_READY_AGENTS[i]; }).filter(Boolean);
      if (specs.length === PIKPAM_READY_AGENTS.length) createTeamChat = true;
    }
    if (!specs.length) return;
    var existingAgents = [];
    try {
      var rosterRes = await api('/api/cowork/agents');
      if (rosterRes && Array.isArray(rosterRes.agents)) existingAgents = rosterRes.agents;
    } catch {}
    var selParts = String(S.sel.model || '').split('::');
    var activeProv = selParts[0] || (setupState.provider || 'pikrouter');
    var activeModel = selParts.slice(1).join('::');
    var byName = Object.create(null);
    existingAgents.forEach(function (a) { if (a && a.name) byName[String(a.name).toLowerCase()] = a; });
    var memberIds = [];
    var chiefId = '';
    for (var i = 0; i < specs.length; i++) {
      var spec = specs[i];
      var key = String(spec.name || '').toLowerCase();
      if (byName[key] && byName[key].id) {
        memberIds.push(byName[key].id);
        if (spec.chiefOfStaff && !chiefId) chiefId = byName[key].id;
        continue;
      }
      try {
        var created = await api('/api/cowork/agents', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: spec.name,
            tagline: spec.tagline || '',
            description: spec.description || '',
            systemPrompt: spec.systemPrompt || '',
            avatar: spec.avatar || { shape: 'dot-orb', color: '#ff6b57' },
            provider: activeProv || 'pikrouter',
            model: activeModel || '',
            skills: Array.isArray(spec.skills) ? spec.skills : [],
            allowShell: Boolean(spec.allowShell),
            allowWrites: spec.allowWrites !== false,
            allowConfig: Boolean(spec.allowConfig),
            useHostComputer: Boolean(spec.useHostComputer),
            chiefOfStaff: Boolean(spec.chiefOfStaff)
          })
        });
        if (created && created.agent && created.agent.id) {
          memberIds.push(created.agent.id);
          if (spec.chiefOfStaff && !chiefId) chiefId = created.agent.id;
        }
      } catch {}
    }
    if (createTeamChat && memberIds.length >= 2) {
      try {
        await api('/api/cowork/conversations', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'group', title: 'Pikpam Team', memberIds: memberIds, chiefId: chiefId || memberIds[0] })
        });
      } catch {}
    }
  }
  async function setupOperation(action) {
    if (setupState.busy) return;
    setupState.busy = true;
    var controls = Array.from($('setupWizard').querySelectorAll('button, input, select, textarea')).map(function (el) { return { el: el, disabled: el.disabled }; });
    controls.forEach(function (item) { item.el.disabled = true; });
    try { await action(); }
    catch (e) { setupMessage('Could not complete this step. Please try again.', true); }
    finally { setupState.busy = false; controls.forEach(function (item) { if (item.el.isConnected) item.el.disabled = item.disabled; }); }
  }
  async function refreshSetupProviders() {
    return setupOperation(async function () {
      setupMessage('Loading PikRouter…');
      await loadModelCatalog(true);
      renderSetup();
      setupMessage(providerIsUsable(setupProvider()) ? 'PikRouter connected. Choose your model to continue.' : 'Connect PikRouter to continue, or select Set up later.');
    });
  }
  async function saveSetupKey() {
    var p = setupProvider();
    var input = $('setupKey');
    var key = input && input.value.trim();
    if (!key || !p || !(p.keyEnvVars || []).length) { setupMessage('Paste an API key first.', true); return; }
    return setupOperation(async function () {
      setupMessage('Saving key…');
      await api('/api/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ envVar: p.keyEnvVars[0], key: key }) });
      input.value = '';
      key = '';
      try { await loadModelCatalog(true); renderSetup(); setupMessage('Key saved. Choose a model to continue.'); }
      catch (e) { setupMessage('Key saved. Refresh models to finish connecting.', true); }
    });
  }
  function openSetupWizard() {
    setupState = {
      step: 0,
      provider: (S.sel.model || '').split('::')[0] || 'pikrouter',
      model: S.sel.model || '',
      mode: S.settings.startMode || 'cowork',
      busy: false,
      agentChoiceMode: 'pick',
      selectedAgentIndexes: [0, 1, 3],
      customDraft: { name: '', tagline: '', shape: 'dot-orb', systemPrompt: '' },
      customAgents: []
    };
    document.querySelector('.shell').inert = true;
    $('startupCover').className = 'gitu-opening';
    var cw = $('cw'); if (cw) cw.inert = true;
    $('setupWizard').hidden = false;
    $('setupWizard').onkeydown = function (event) {
      if (event.key !== 'Tab') return;
      var controls = Array.from(this.querySelectorAll('button:not([disabled]):not([hidden]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'));
      var first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === $('setupTitle'))) { event.preventDefault(); if (last) last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); if (first) first.focus(); }
    };
    renderSetup();
    // The page underneath may still be loading the catalog. Do not replace a
    // key field while the user is typing; the connection step refreshes itself.
  }
  async function finishSetup() {
    return setupOperation(async function () {
      setupMessage('Creating your Pikpam workspace…');
      await api('/api/onboarding', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme: S.settings.theme, mode: setupState.mode, model: S.sel.model || '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
      try { await createOnboardingAgents(); } catch {}
      S.settings.onboardingComplete = true;
      S.settings.startMode = setupState.mode;
      persist();
      $('setupWizard').hidden = true;
      $('setupWizard').innerHTML = '';
      document.querySelector('.shell').inert = false;
      var cw = $('cw'); if (cw) cw.inert = false;
      if (setupState.mode === 'cowork') {
        openCowork();
        if (typeof cwLoad === 'function') cwLoad(true);
      } else cwExit();
    });
  }
  var onboardingLoading = false;
  async function initializeOnboarding() {
    if (onboardingLoading) return;
    onboardingLoading = true;
    document.querySelector('.shell').inert = true;
    $('startupCover').className = 'gitu-opening';
    $('startupMessage').textContent = 'Opening your workspace…';
    $('startupReload').hidden = true;
    var startupStage = 'setup';
    try {
      var prefs = await api('/api/onboarding', { signal: AbortSignal.timeout(15000) });
      startupStage = 'workspace';
      if (!prefs.completed) openSetupWizard();
      else {
        var themeChanged = false;
        // Seed the server theme only when this origin has never stored a
        // choice. A stored light/dark choice wins over older server prefs.
        if (!S.themeLoaded) { S.settings.theme = prefs.theme; themeChanged = true; }
        if (!S.settings.onboardingComplete) {
          S.settings.startMode = prefs.mode;
          if (prefs.model&&!S.savedSelectionAt) S.sel.model = prefs.model;
          S.settings.onboardingComplete = true;
          themeChanged = true;
        }
        if (themeChanged) { applyTheme(); persist(); }
        var lastMode = null;
        try { lastMode = localStorage.getItem('hermes.cowork'); } catch (e) {}
        if (prefs.mode === 'coding' && lastMode === 'closed') openHome();
        else openCowork();
        document.querySelector('.shell').inert = false;
      }
      $('startupCover').hidden = true;
    } catch (e) {
      console.error('Agent Gitu startup failed (' + startupStage + '): ' + String(e && e.name || 'Error') + ': ' + String(e && e.message || e));
      $('startupCover').className = 'gitu-opening.is-error'.replace('.', ' ');
      $('startupMessage').textContent = startupStage === 'workspace' ? 'Could not open your workspace. Please try again.' : 'Could not load your setup. Please try again.';
      $('startupReload').hidden = false;
      $('startupReload').onclick = initializeOnboarding;
      $('startupReload').focus();
    } finally { onboardingLoading = false; }
  }
`;
