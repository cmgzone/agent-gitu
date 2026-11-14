/** Translucent live activity, service connection bridges, and team collaboration animations in Cowork. */
export const COWORK_CLEAN_ACTIVITY_CSS = String.raw`
  .cw-working-row { width:100%; max-width:min(94%,660px); animation:cw-stage-in .22s cubic-bezier(.22,1,.36,1); }
  .cw-working-row[hidden] { display:none; }
  .cw-work-card { display:flex; flex-direction:column; gap:10px; min-width:0; max-width:100%; padding:12px 15px; border:1px solid color-mix(in srgb,var(--cw-stage-accent,var(--border2)) 38%,transparent); border-radius:20px; background:linear-gradient(135deg,color-mix(in srgb,var(--cw-stage-accent,var(--card)) 8%,var(--card)),color-mix(in srgb,var(--card) 78%,transparent)); box-shadow:0 12px 34px -18px rgba(0,0,0,.55),0 0 0 1px color-mix(in srgb,var(--cw-stage-accent,var(--accent)) 10%,transparent) inset; backdrop-filter:blur(12px) saturate(1.25); -webkit-backdrop-filter:blur(12px) saturate(1.25); transition:border-color .25s ease,box-shadow .25s ease; }
  .cw-working-head { display:flex; align-items:center; gap:11px; min-width:0; }
  .cw-work-lead { display:flex; align-items:center; flex:none; }
  .cw-work-lead:empty { display:none; }
  .cw-lead-stack { display:inline-flex; align-items:center; }
  .cw-stage-ava { position:relative; display:inline-flex; align-items:center; justify-content:center; width:38px; height:38px; border-radius:13px; background:color-mix(in srgb,var(--cw-node-color,var(--accent)) 14%,var(--card2)); border:1.5px solid color-mix(in srgb,var(--cw-node-color,var(--accent)) 56%,transparent); box-shadow:0 0 0 3px color-mix(in srgb,var(--cw-node-color,var(--accent)) 14%,transparent); padding:2px; flex:none; animation:cw-stage-breathe 2.2s ease-in-out infinite; }
  .cw-lead-stack .cw-stage-ava + .cw-stage-ava { margin-left:-10px; }
  .cw-stage-ava .cw-ava { width:32px; height:32px; background:transparent!important; filter:drop-shadow(0 2px 4px rgba(0,0,0,.28)); }
  .cw-stage-ava-ring { position:absolute; inset:-4px; border-radius:16px; border:1.5px solid color-mix(in srgb,var(--cw-node-color,var(--accent)) 58%,transparent); opacity:0; pointer-events:none; animation:cw-halo-ripple 2.1s cubic-bezier(.16,1,.3,1) infinite; }
  .cw-working-bubble { display:inline-flex; align-items:center; gap:8px; min-width:0; flex:1; padding:0; border:0; border-radius:0; background:transparent; color:var(--text); font-size:13px; font-weight:600; line-height:1.45; overflow-wrap:anywhere; }
  .cw-working-dot { width:7px; height:7px; flex:none; border-radius:50%; background:var(--cw-stage-accent,var(--accent)); box-shadow:0 0 9px var(--cw-stage-accent,var(--accent)); animation:cw-working-pulse 1.5s ease-in-out infinite; }
  .cw-work-elapsed { margin-left:auto; flex:none; font-size:11px; font-weight:600; font-variant-numeric:tabular-nums; color:var(--muted); padding:2px 8px; border-radius:999px; background:color-mix(in srgb,var(--text) 6%,transparent); border:1px solid color-mix(in srgb,var(--border2) 55%,transparent); }
  .cw-work-elapsed[hidden] { display:none; }
  .cw-work-stage { display:flex; flex-direction:column; gap:9px; min-width:0; }
  .cw-work-stage[hidden] { display:none; }
  .cw-conn-bridge { display:flex; align-items:center; gap:8px; min-width:0; padding:8px 10px; border-radius:14px; background:color-mix(in srgb,var(--bg) 52%,var(--card2)); border:1px solid color-mix(in srgb,var(--border2) 60%,transparent); }
  .cw-conn-node { display:inline-flex; align-items:center; gap:7px; min-width:0; max-width:44%; padding:5px 10px 5px 6px; border-radius:11px; background:color-mix(in srgb,var(--cw-bridge-color,var(--card)) 12%,var(--card)); border:1px solid color-mix(in srgb,var(--cw-bridge-color,var(--border2)) 42%,transparent); font-size:12px; font-weight:600; color:var(--text); }
  .cw-conn-target { --cw-bridge-color:var(--cw-bridge-target-color,#38bdf8); margin-left:auto; }
  .cw-conn-bridge.is-error .cw-conn-target { --cw-bridge-color:#ef4444; background:color-mix(in srgb,#ef4444 12%,var(--card)); border-color:color-mix(in srgb,#ef4444 55%,transparent); }
  .cw-conn-node-ico { width:20px; height:20px; flex:none; display:inline-flex; align-items:center; justify-content:center; border-radius:7px; background:color-mix(in srgb,var(--cw-bridge-color,var(--accent)) 16%,transparent); color:var(--cw-bridge-color,var(--accent)); overflow:hidden; }
  .cw-conn-node-ico .cw-ava { width:20px; height:20px; background:transparent!important; }
  .cw-conn-node-ico svg { width:13px; height:13px; display:block; }
  .cw-conn-node-ico img.cw-favicon { width:14px; height:14px; border-radius:3px; display:block; }
  .cw-conn-node-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cw-conn-wire { position:relative; flex:1; min-width:48px; height:22px; display:flex; align-items:center; justify-content:center; }
  .cw-conn-track { position:absolute; left:0; right:0; top:50%; height:2px; margin-top:-1px; border-radius:999px; background:linear-gradient(90deg,color-mix(in srgb,var(--cw-bridge-color,#60a5fa) 65%,transparent),color-mix(in srgb,var(--cw-bridge-target-color,#38bdf8) 78%,transparent)); opacity:.58; }
  .cw-conn-bridge.is-error .cw-conn-track { background:repeating-linear-gradient(90deg,#ef4444 0 5px,transparent 5px 10px); opacity:.78; }
  .cw-conn-packet { position:absolute; top:50%; left:0; width:7px; height:7px; margin-top:-3.5px; border-radius:50%; background:var(--cw-bridge-target-color,#60a5fa); box-shadow:0 0 10px var(--cw-bridge-target-color,#60a5fa),0 0 3px #fff; opacity:0; animation:cw-packet-flow 1.5s cubic-bezier(.4,0,.2,1) infinite; }
  .cw-conn-packet.cw-p2 { animation-delay:.5s; }
  .cw-conn-packet.cw-p3 { animation-delay:1s; }
  .cw-conn-bridge.is-return .cw-conn-packet { animation-name:cw-packet-return; }
  .cw-conn-bridge.is-error .cw-conn-packet { display:none; }
  .cw-conn-verb { position:relative; z-index:1; padding:1px 7px; border-radius:999px; font-size:10px; font-weight:700; letter-spacing:.03em; color:var(--muted); background:color-mix(in srgb,var(--card) 94%,transparent); border:1px solid color-mix(in srgb,var(--border2) 65%,transparent); white-space:nowrap; }
  .cw-collab-lanes { display:flex; align-items:center; flex-wrap:wrap; gap:6px; min-width:0; }
  .cw-collab-pill { display:inline-flex; align-items:center; gap:6px; min-width:0; max-width:100%; padding:4px 9px 4px 5px; border-radius:999px; background:color-mix(in srgb,var(--cw-node-color,var(--accent)) 10%,var(--card2)); border:1px solid color-mix(in srgb,var(--cw-node-color,var(--accent)) 32%,transparent); font-size:11.5px; animation:cw-step-in .24s cubic-bezier(.22,1,.36,1); }
  .cw-collab-pill.is-active { border-color:color-mix(in srgb,var(--cw-node-color,var(--accent)) 72%,transparent); box-shadow:0 0 14px -6px var(--cw-node-color,var(--accent)); }
  .cw-collab-pill.is-done { opacity:.84; border-color:color-mix(in srgb,#22c55e 42%,transparent); background:color-mix(in srgb,#22c55e 8%,var(--card2)); }
  .cw-collab-pill .cw-ava { width:22px; height:22px; background:transparent!important; flex:none; }
  .cw-collab-nm { font-weight:700; color:var(--text); flex:none; }
  .cw-collab-act { color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:155px; }
  .cw-collab-arrow { position:relative; display:inline-flex; align-items:center; justify-content:center; width:24px; height:16px; flex:none; }
  .cw-collab-arrow-line { position:relative; width:20px; height:2px; border-radius:999px; background:linear-gradient(90deg,var(--cw-from-color,#60a5fa),var(--cw-to-color,#a78bfa)); }
  .cw-collab-arrow-dot { position:absolute; top:-2px; left:0; width:6px; height:6px; border-radius:50%; background:#fff; box-shadow:0 0 8px var(--cw-to-color,#a78bfa); animation:cw-handoff-zip 1.15s ease-in-out infinite; }
  .cw-step-trail { display:flex; flex-direction:column; gap:5px; min-width:0; padding-top:4px; border-top:1px solid color-mix(in srgb,var(--border2) 38%,transparent); }
  .cw-step-item { position:relative; overflow:hidden; display:flex; align-items:center; gap:8px; min-width:0; padding:5px 8px; border-radius:10px; font-size:11.5px; line-height:1.35; color:var(--muted); animation:cw-step-in .22s cubic-bezier(.22,1,.36,1); }
  .cw-step-item.is-active { color:var(--text); background:color-mix(in srgb,var(--cw-step-color,var(--accent)) 10%,transparent); }
  .cw-step-item.is-active::after { content:''; position:absolute; inset:0; transform:translateX(-100%); background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--cw-step-color,var(--accent)) 14%,transparent),transparent); animation:cw-row-shimmer 2.1s ease-in-out infinite; pointer-events:none; }
  .cw-step-state { width:16px; height:16px; flex:none; display:inline-flex; align-items:center; justify-content:center; border-radius:50%; }
  .cw-step-state svg { width:11px; height:11px; display:block; }
  .cw-step-item.is-done .cw-step-state { background:color-mix(in srgb,#22c55e 18%,transparent); color:#22c55e; animation:cw-check-pop .28s cubic-bezier(.34,1.56,.64,1); }
  .cw-step-item.is-error .cw-step-state { background:color-mix(in srgb,#ef4444 18%,transparent); color:#ef4444; }
  .cw-step-item.is-active .cw-step-state { background:color-mix(in srgb,var(--cw-step-color,var(--accent)) 20%,transparent); color:var(--cw-step-color,var(--accent)); }
  .cw-step-spinner { width:7px; height:7px; border-radius:50%; background:currentColor; animation:cw-working-pulse 1.1s ease-in-out infinite; }
  .cw-step-who { font-weight:700; color:var(--text); flex:none; }
  .cw-step-label { min-width:0; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cw-step-target { display:inline-flex; align-items:center; gap:4px; flex:none; padding:1px 7px; border-radius:999px; font-size:10.5px; font-weight:600; background:color-mix(in srgb,var(--cw-step-color,var(--border2)) 12%,transparent); color:var(--text); border:1px solid color-mix(in srgb,var(--cw-step-color,var(--border2)) 30%,transparent); max-width:140px; }
  .cw-step-target-ico { display:inline-flex; align-items:center; justify-content:center; width:12px; height:12px; flex:none; }
  .cw-step-target-ico img.cw-favicon,.cw-step-target-ico svg { width:12px; height:12px; border-radius:2px; display:block; }
  .cw-step-target-tx { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cw-act-fallback-ava { width:100%; height:100%; display:inline-flex; align-items:center; justify-content:center; border-radius:50%; font-size:11px; font-weight:700; color:#fff; background:var(--cw-node-color,var(--accent)); }
  .cw-team-strip { position:absolute; top:56px; left:50%; transform:translateX(-50%); z-index:16; pointer-events:auto; display:inline-flex; align-items:center; gap:6px; max-width:calc(100% - 140px); padding:5px 10px; border-radius:999px; background:color-mix(in srgb,var(--card) 86%,transparent); border:1px solid color-mix(in srgb,var(--border2) 72%,transparent); backdrop-filter:blur(18px) saturate(1.35); -webkit-backdrop-filter:blur(18px) saturate(1.35); box-shadow:0 10px 28px -12px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.04) inset; overflow-x:auto; scrollbar-width:none; animation:cw-strip-in .24s cubic-bezier(.22,1,.36,1); }
  .cw-team-strip::-webkit-scrollbar { display:none; }
  .cw-team-strip[hidden] { display:none; }
  .cw-strip-badge { display:inline-flex; align-items:center; gap:5px; flex:none; padding:2px 7px; border-radius:999px; font-size:10.5px; font-weight:700; color:var(--accent); background:color-mix(in srgb,var(--accent) 14%,transparent); letter-spacing:.02em; }
  .cw-strip-pulse { width:6px; height:6px; border-radius:50%; background:currentColor; animation:cw-working-pulse 1.2s ease-in-out infinite; }
  .cw-strip-agent { display:inline-flex; align-items:center; gap:6px; flex:none; padding:3px 9px 3px 4px; border-radius:999px; border:1px solid color-mix(in srgb,var(--cw-node-color,var(--border2)) 38%,transparent); background:color-mix(in srgb,var(--cw-node-color,var(--card2)) 12%,var(--card2)); color:var(--text); font:inherit; font-size:11.5px; font-weight:600; cursor:pointer; transition:transform .14s ease,border-color .14s ease; }
  .cw-strip-agent:hover { transform:translateY(-1px); border-color:var(--cw-node-color,var(--accent)); }
  .cw-strip-agent.is-active { box-shadow:0 0 12px -4px var(--cw-node-color,var(--accent)); border-color:var(--cw-node-color,var(--accent)); }
  .cw-strip-agent.is-done { opacity:.84; border-color:color-mix(in srgb,#22c55e 45%,transparent); }
  .cw-strip-agent .cw-ava { width:20px; height:20px; background:transparent!important; flex:none; }
  .cw-strip-ico { display:inline-flex; align-items:center; justify-content:center; width:13px; height:13px; opacity:.92; }
  .cw-strip-ico img.cw-favicon,.cw-strip-ico svg { width:13px; height:13px; border-radius:2px; display:block; }
  .cw-receipt-row { width:100%; max-width:min(94%,660px); animation:cw-step-in .22s cubic-bezier(.22,1,.36,1); }
  .cw-receipt-row[hidden] { display:none; }
  .cw-receipt-card { display:inline-flex; flex-direction:column; gap:8px; max-width:100%; padding:7px 12px; border-radius:16px; background:color-mix(in srgb,var(--card) 74%,transparent); border:1px solid color-mix(in srgb,var(--border2) 55%,transparent); backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); font-size:12px; color:var(--muted); }
  .cw-receipt-head { display:inline-flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .cw-receipt-avas { display:inline-flex; align-items:center; }
  .cw-receipt-avas .cw-ava { width:20px; height:20px; background:transparent!important; }
  .cw-receipt-avas .cw-ava + .cw-ava { margin-left:-6px; }
  .cw-receipt-check { width:16px; height:16px; display:inline-flex; align-items:center; justify-content:center; border-radius:50%; background:color-mix(in srgb,#22c55e 18%,transparent); color:#22c55e; flex:none; }
  .cw-receipt-check.is-error { background:color-mix(in srgb,#ef4444 18%,transparent); color:#ef4444; }
  .cw-receipt-check svg,.cw-receipt-dismiss svg { width:11px; height:11px; display:block; }
  .cw-receipt-summary { color:var(--text); font-weight:600; }
  .cw-receipt-toggle,.cw-receipt-dismiss { background:transparent; border:0; color:var(--muted); font:inherit; font-size:11.5px; font-weight:600; cursor:pointer; padding:2px 6px; border-radius:8px; display:inline-flex; align-items:center; gap:3px; transition:color .14s ease,background .14s ease; }
  .cw-receipt-toggle:hover,.cw-receipt-dismiss:hover { color:var(--text); background:color-mix(in srgb,var(--text) 7%,transparent); }
  .cw-receipt-steps { display:flex; flex-direction:column; gap:4px; padding-top:6px; border-top:1px solid color-mix(in srgb,var(--border2) 40%,transparent); }
  .cw-receipt-steps[hidden] { display:none; }
  @keyframes cw-working-pulse { 0%,100% { opacity:.35; transform:scale(.9); } 50% { opacity:1; transform:scale(1.1); } }
  @keyframes cw-stage-in { from { opacity:0; transform:translateY(6px) scale(.98); } to { opacity:1; transform:none; } }
  @keyframes cw-strip-in { from { opacity:0; transform:translate(-50%,-8px) scale(.97); } to { opacity:1; transform:translate(-50%,0) scale(1); } }
  @keyframes cw-stage-breathe { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-1.5px); } }
  @keyframes cw-halo-ripple { 0% { opacity:.58; transform:scale(.94); } 100% { opacity:0; transform:scale(1.28); } }
  @keyframes cw-packet-flow { 0% { left:6%; opacity:0; transform:scale(.6); } 18% { opacity:1; transform:scale(1.05); } 82% { opacity:1; transform:scale(1.05); } 100% { left:90%; opacity:0; transform:scale(.6); } }
  @keyframes cw-packet-return { 0% { left:90%; opacity:0; transform:scale(.6); } 18% { opacity:1; transform:scale(1.05); } 82% { opacity:1; transform:scale(1.05); } 100% { left:6%; opacity:0; transform:scale(.6); } }
  @keyframes cw-handoff-zip { 0% { left:0; opacity:.2; transform:scale(.75); } 50% { opacity:1; transform:scale(1.15); } 100% { left:14px; opacity:.2; transform:scale(.75); } }
  @keyframes cw-step-in { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }
  @keyframes cw-check-pop { 0% { transform:scale(.5); opacity:0; } 70% { transform:scale(1.18); opacity:1; } 100% { transform:scale(1); opacity:1; } }
  @keyframes cw-row-shimmer { 0% { transform:translateX(-100%); } 100% { transform:translateX(120%); } }
  @keyframes cw-caret-glow { 0%,100% { opacity:1; box-shadow:0 0 8px var(--accent); } 50% { opacity:.22; box-shadow:none; } }
  .cw-clean-activity { display:flex; align-items:center; gap:12px; min-height:28px; margin:0 4px 8px; color:var(--muted); font-size:11.5px; }
  .cw-clean-activity[hidden], .cw-clean-activity [hidden] { display:none; }
  .cw-clean-status { display:flex; align-items:center; gap:8px; min-width:0; flex:1; }
  .cw-clean-status::before { content:''; width:5px; height:5px; border-radius:50%; flex:none; background:var(--accent); }
  .cw-clean-status span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cw-clean-activity button { flex:none; margin-left:auto; background:transparent; border:0; color:var(--muted); padding:6px 0 6px 8px; font:inherit; font-size:11px; cursor:pointer; }
  .cw-clean-activity button:hover { color:var(--text); }
  .cw .cw-live-row .cw-live-kicker { display:none; }
  .cw .cw-live-row .cw-meta { display:flex; align-items:center; flex-wrap:wrap; gap:6px 10px; min-height:24px; margin-bottom:7px; padding-right:0; }
  .cw .cw-live-row .cw-ava { box-shadow:0 0 0 2px color-mix(in srgb,var(--run,var(--accent)) 45%,transparent),0 0 16px -4px var(--run,var(--accent)); animation:cw-stage-breathe 2s ease-in-out infinite; }
  .cw .cw-live-row .cw-live-bubble { border:1px solid color-mix(in srgb,var(--run,var(--accent)) 36%,transparent); border-left:3px solid var(--run,var(--accent)); background:linear-gradient(180deg,color-mix(in srgb,var(--run-dim,var(--card)) 42%,var(--card)),color-mix(in srgb,var(--card) 92%,transparent)); box-shadow:0 12px 30px -18px rgba(0,0,0,.55); transition:border-color .22s ease,background .22s ease; }
  .cw .cw-live-row .cw-live-bubble.has-tool { border-color:color-mix(in srgb,var(--evidence,#f59e0b) 42%,transparent); border-left-color:var(--evidence,#f59e0b); }
  .cw .cw-live-row .cw-progress-activity { display:inline-flex; align-items:center; gap:6px; padding:2px 9px; border-radius:999px; font-size:11px; font-weight:600; background:color-mix(in srgb,var(--run,var(--accent)) 12%,transparent); border:1px solid color-mix(in srgb,var(--run,var(--accent)) 28%,transparent); color:var(--text); }
  .cw .cw-live-row .cw-progress-text { margin:0; }
  .cw .cw-live-row .cw-progress-text:not(:empty)::after { content:''; display:inline-block; width:2.5px; height:1.05em; margin-left:3px; vertical-align:-2px; border-radius:2px; background:var(--accent); box-shadow:0 0 8px var(--accent); animation:cw-caret-glow .85s ease-in-out infinite; }
  .cw .cw-live-row .cw-live-bubble.has-tool .cw-progress-text:not(:empty)::after { display:none; }
  .cw .cw-checkpoint-report { border:0; border-left:2px solid var(--border); border-radius:0; padding:4px 0 4px 14px; background:transparent; }
  .cw .cw-work-history > summary { font-weight:400; font-size:11px; color:var(--muted); }
  .cw .cw-work-history:not([open]) { display:none; }
  .cw .cw-work { display:none; }
  @media(max-width:600px) { .cw-team-strip { max-width:calc(100% - 96px); top:52px; } .cw-conn-verb { display:none; } }
  @media(prefers-reduced-motion:reduce) { .cw-working-dot,.cw-stage-ava,.cw-stage-ava-ring,.cw-conn-packet,.cw-collab-arrow-dot,.cw-step-item.is-active::after,.cw-step-spinner,.cw-strip-pulse,.cw .cw-live-row .cw-ava,.cw .cw-live-row .cw-progress-text:not(:empty)::after,.cw-working-row,.cw-team-strip,.cw-collab-pill,.cw-step-item,.cw-receipt-row { animation:none!important; } }
`;

export const COWORK_CLEAN_ACTIVITY_JS = String.raw`
  function cwActEsc(value) {
    return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function cwActSvg(kind) {
    if (kind==='check') return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 8.5 6.5 11.5 12.5 4.5"/></svg>';
    if (kind==='error' || kind==='close') return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5"/></svg>';
    if (kind==='users') return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="5.5" r="2.2"/><path d="M2 13c.4-2.1 2-3.2 4-3.2s3.6 1.1 4 3.2"/><circle cx="11.5" cy="6" r="1.7"/><path d="M11.2 10c1.4.2 2.4 1.1 2.8 2.6"/></svg>';
    if (kind==='globe') return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="5.5"/><path d="M2.5 8h11M8 2.5c1.7 1.7 1.7 9.3 0 11M8 2.5c-1.7 1.7-1.7 9.3 0 11"/></svg>';
    if (kind==='folder') return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M2.5 4.5a1 1 0 0 1 1-1h3l1.4 1.5h4.6a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z"/></svg>';
    if (kind==='edit') return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.8 3.2 12.8 6.2 5.4 13.5H2.5v-2.9z"/></svg>';
    if (kind==='terminal') return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m3.5 5 3 3-3 3M8.5 11.5h4"/></svg>';
    if (kind==='memory') return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="3" y="3" width="10" height="10" rx="2"/><circle cx="8" cy="8" r="1.8"/></svg>';
    if (kind==='plug') return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M6 2.5v3M10 2.5v3M4.5 5.5h7v2.2a3.5 3.5 0 0 1-7 0zM8 11.2v2.3"/></svg>';
    return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m8 2.2 1.3 3.7 3.7 1.3-3.7 1.3L8 12.2 6.7 8.5 3 7.2l3.7-1.3z"/></svg>';
  }
  function cwActAppDomain(app) {
    var k = String(app || '').toLowerCase().replace(/[^a-z0-9]+/g,'');
    var map = { github:'github.com', gmail:'mail.google.com', googlecalendar:'calendar.google.com', googledrive:'drive.google.com', googledocs:'docs.google.com', googlesheets:'sheets.google.com', linear:'linear.app', slack:'slack.com', notion:'notion.so', figma:'figma.com', stripe:'stripe.com', vercel:'vercel.com', supabase:'supabase.com', discord:'discord.com', telegram:'telegram.org', whatsapp:'web.whatsapp.com', pikpam:'pikpam.com', pikrouter:'pikpam.com' };
    return map[k] || '';
  }
  function cwActTitleCase(raw) {
    var s = String(raw || '').replace(/[_-]+/g,' ').trim();
    var brands = { github:'GitHub', pikrouter:'PikRouter', openai:'OpenAI', youtube:'YouTube', linkedin:'LinkedIn', whatsapp:'WhatsApp' };
    var low = s.toLowerCase().replace(/\s+/g,'');
    if (brands[low]) return brands[low];
    return s.replace(/\b[a-z]/g,function(ch){ return ch.toUpperCase(); });
  }
  function cwActAgentColor(agent) {
    var col = agent && typeof cwCharacterColor === 'function' ? cwCharacterColor(typeof cwEffectiveAvatar === 'function' ? cwEffectiveAvatar(agent) : agent.avatar) : '';
    return /^#[0-9a-f]{6}$/i.test(col || '') ? col : '#60a5fa';
  }
  function cwActAgentAva(agent, fallbackColor) {
    if (agent && typeof cwAva === 'function') return cwAva(agent);
    var name = (agent && agent.name) || 'AI';
    var letter = String(name).trim().charAt(0).toUpperCase() || 'A';
    var c = /^#[0-9a-f]{6}$/i.test(fallbackColor || '') ? fallbackColor : '#60a5fa';
    return '<span class="cw-act-fallback-ava" style="--cw-node-color:' + c + '">' + cwActEsc(letter) + '</span>';
  }
  function cwActTarget(p) {
    var tool = p && p.tool ? String(p.tool).toLowerCase() : '';
    var err = Boolean(p && p.toolOk === false);
    if (tool==='message_teammate' || tool==='spawn_subagent' || tool==='cowork_subagent' || tool==='delegate') {
      return { kind:'handoff', targetLabel:'Teammate Handoff', verb:err ? 'Handoff issue' : 'Handing off', color:err ? '#ef4444' : '#a78bfa', iconHtml:cwActSvg('users'), err:err };
    }
    if (p && p.appService) {
      var appLabel = cwActTitleCase(p.appService) || 'Connected App';
      var appDom = cwActAppDomain(p.appService);
      var appIco = (appDom && typeof cwFaviconHtml === 'function' ? cwFaviconHtml(appDom) : '') || (typeof cwToolIconHtml === 'function' ? cwToolIconHtml(p) : '') || cwActSvg('plug');
      return { kind:'app', targetLabel:appLabel, verb:err ? 'Failed' : 'Connected', color:err ? '#ef4444' : '#38bdf8', iconHtml:appIco, err:err };
    }
    if (p && p.mcpServer) {
      var srv = String(p.mcpServer);
      var mcpDom = (typeof CW_MCP_DOMAINS === 'object' && CW_MCP_DOMAINS && CW_MCP_DOMAINS[srv]) || '';
      var mcpIco = (mcpDom && typeof cwFaviconHtml === 'function' ? cwFaviconHtml(mcpDom) : '') || (typeof cwToolIconHtml === 'function' ? cwToolIconHtml(p) : '') || cwActSvg('plug');
      return { kind:'mcp', targetLabel:srv, verb:err ? 'Failed' : 'MCP Link', color:err ? '#ef4444' : '#2dd4bf', iconHtml:mcpIco, err:err };
    }
    if (p && p.webUrl) {
      var m = String(p.webUrl).match(/^https?:\/\/([^/?#:]+)/i);
      var host = m ? m[1].replace(/^www\./i,'') : 'Live Web';
      var webIco = (host && host.indexOf('.') >= 0 && typeof cwFaviconHtml === 'function' ? cwFaviconHtml(host) : '') || cwActSvg('globe');
      return { kind:'web', targetLabel:host, verb:err ? 'Failed' : 'Fetching', color:err ? '#ef4444' : '#60a5fa', iconHtml:webIco, err:err };
    }
    if (tool) {
      if (/(write|edit|patch|create|delete|rename)/.test(tool)) return { kind:'edit', targetLabel:'Workspace Changes', verb:err ? 'Failed' : 'Updating', color:err ? '#ef4444' : '#f59e0b', iconHtml:cwActSvg('edit'), err:err };
      if (/(bash|shell|exec|command|terminal|process)/.test(tool)) return { kind:'shell', targetLabel:'Workspace Shell', verb:err ? 'Failed' : 'Running', color:err ? '#ef4444' : '#a78bfa', iconHtml:cwActSvg('terminal'), err:err };
      if (tool.indexOf('memory') >= 0) return { kind:'memory', targetLabel:'Team Memory', verb:err ? 'Failed' : 'Syncing', color:err ? '#ef4444' : '#34d399', iconHtml:cwActSvg('memory'), err:err };
      if (/(web|fetch|search_web|browser)/.test(tool)) return { kind:'web', targetLabel:'Live Web', verb:err ? 'Failed' : 'Checking', color:err ? '#ef4444' : '#60a5fa', iconHtml:cwActSvg('globe'), err:err };
      if (/(read|grep|glob|find|list|inspect)/.test(tool)) return { kind:'files', targetLabel:'Workspace Files', verb:err ? 'Failed' : 'Reading', color:err ? '#ef4444' : '#38bdf8', iconHtml:cwActSvg('folder'), err:err };
      return { kind:'tool', targetLabel:'Workspace Tool', verb:err ? 'Failed' : 'Running', color:err ? '#ef4444' : '#60a5fa', iconHtml:(typeof cwToolIconHtml === 'function' ? cwToolIconHtml(p) : '') || cwActSvg('plug'), err:err };
    }
    var phase = p && p.phase ? String(p.phase) : '';
    if (phase==='responding') return { kind:'reply', targetLabel:'Live Response', verb:'Streaming', color:'#22c55e', iconHtml:cwActSvg('spark'), isReturn:true, err:false };
    if (phase==='reasoning') return { kind:'reason', targetLabel:'Reasoning Core', verb:'Analyzing', color:'#f59e0b', iconHtml:cwActSvg('spark'), err:false };
    return { kind:'think', targetLabel:'Agent Core', verb:'Planning', color:'#60a5fa', iconHtml:cwActSvg('spark'), err:false };
  }
  function cwActResolveAgent(p, cw) {
    var id = p && p.agentId ? String(p.agentId) : '';
    var name = p && p.agentName ? String(p.agentName) : '';
    var found = id && typeof cwAgentById === 'function' ? cwAgentById(id) : null;
    if (!found && name && cw && Array.isArray(cw.agents)) {
      found = cw.agents.find(function(a){ return a && a.name === name; }) || null;
    }
    if (!found && !id && !name && typeof cwActiveConv === 'function' && typeof cwConvMembers === 'function') {
      var conv = cwActiveConv();
      var mems = conv ? cwConvMembers(conv) : [];
      if (cw && cw.working) found = mems.find(function(a){ return a && a.name === cw.working; }) || null;
      if (!found && conv && conv.chiefId) found = mems.find(function(a){ return a && a.id === conv.chiefId; }) || null;
      if (!found) found = mems[0] || null;
    }
    return found || { id:id || name || 'lead', name:name || (cw && cw.working) || 'Teammate' };
  }
  function cwActSafeStepLabel(p) {
    if (!p) return 'Working on your request…';
    if (p.toolOk === false) return 'A step failed';
    if (p.tool) return typeof cwToolProgressText === 'function' ? cwToolProgressText(p) : 'Running a workspace step…';
    if (p.phase==='responding') return 'Writing a reply…';
    if (p.phase==='reasoning') return 'Thinking through options…';
    return 'Working on your request…';
  }
  function cwActFormatDuration(ms) {
    var sec = Math.max(0, Math.floor((ms || 0) / 100) / 10);
    return sec < 10 ? sec.toFixed(1) + 's' : Math.round(sec) + 's';
  }
  function cwActSyncTracker(cw, progresses, hasOpenReq) {
    var runKey = ((cw && cw.active) || 'default') + ':' + ((cw && cw.activeThreadId) || 'main');
    if (!cw._actRuns) cw._actRuns = {};
    if (!cw._actCompleted) cw._actCompleted = {};
    var now = Date.now();
    var run = cw._actRuns[runKey];
    if (cw.busy && !hasOpenReq) {
      if (!run || !run.busyActive) {
        run = { startedAt:now, steps:[], participants:[], handoffs:[], lastAgentKey:'', busyActive:true };
        cw._actRuns[runKey] = run;
        delete cw._actCompleted[runKey];
      }
      var list = progresses.length ? progresses : [{ agentName:(cw && cw.working) || '' }];
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        var agent = cwActResolveAgent(p, cw);
        var aKey = String(agent.id || agent.name || 'lead');
        var color = cwActAgentColor(agent);
        var tgt = cwActTarget(p);
        var label = cwActSafeStepLabel(p);
        var existingPart = run.participants.find(function(x){ return x.key === aKey; });
        if (!existingPart) {
          existingPart = { key:aKey, agent:agent, name:agent.name || 'Teammate', color:color, active:true, verb:tgt.verb, targetLabel:tgt.targetLabel, iconHtml:tgt.iconHtml };
          run.participants.push(existingPart);
        } else {
          existingPart.active = true;
          existingPart.verb = tgt.verb;
          existingPart.targetLabel = tgt.targetLabel;
          existingPart.iconHtml = tgt.iconHtml;
        }
        if (run.lastAgentKey && run.lastAgentKey !== aKey) {
          var prevPart = run.participants.find(function(x){ return x.key === run.lastAgentKey; });
          if (prevPart && !list.some(function(op){ var oa = cwActResolveAgent(op, cw); return String(oa.id || oa.name) === run.lastAgentKey; })) prevPart.active = false;
          if (!run.handoffs.some(function(h){ return h.from === run.lastAgentKey && h.to === aKey; })) run.handoffs.push({ from:run.lastAgentKey, to:aKey });
        }
        run.lastAgentKey = aKey;
        if (p.tool || p.appService || p.mcpServer || p.webUrl || p.phase==='responding' || p.phase==='reasoning' || p.toolOk === false) {
          var stepKey = aKey + '|' + label + '|' + tgt.targetLabel + '|' + (tgt.err ? 'err' : 'ok');
          var lastStep = run.steps[run.steps.length - 1];
          if (!lastStep || lastStep.key !== stepKey) {
            for (var j = 0; j < run.steps.length; j++) { if (run.steps[j].state === 'active') run.steps[j].state = 'done'; }
            run.steps.push({ key:stepKey, agentKey:aKey, agentName:agent.name || 'Teammate', agentColor:color, label:label, targetLabel:tgt.targetLabel, targetColor:tgt.color, iconHtml:tgt.iconHtml, state:tgt.err ? 'error' : 'active', ts:now });
            if (run.steps.length > 12) run.steps.shift();
          } else {
            lastStep.state = tgt.err ? 'error' : 'active';
          }
        }
      }
      return { runKey:runKey, run:run, completed:null };
    }
    if (run && run.busyActive) {
      run.busyActive = false;
      run.endedAt = now;
      for (var k = 0; k < run.steps.length; k++) { if (run.steps[k].state === 'active') run.steps[k].state = 'done'; }
      for (var m = 0; m < run.participants.length; m++) { run.participants[m].active = false; }
      if (run.steps.length > 0) {
        cw._actCompleted[runKey] = { startedAt:run.startedAt, endedAt:run.endedAt, steps:run.steps.slice(-8), participants:run.participants.slice(0,5), handoffs:run.handoffs.slice(0,5), expanded:false, dismissed:false };
      }
    }
    return { runKey:runKey, run:run, completed:cw._actCompleted[runKey] || null };
  }
  function cwActRenderTeamStrip(cw, progresses, sync) {
    var strip = $('cwTeamStrip');
    if (!strip || typeof document === 'undefined') return;
    var conv = typeof cwActiveConv === 'function' ? cwActiveConv() : null;
    var subList = Array.isArray(cw.subAgents) ? cw.subAgents.filter(function(sa){ return sa && sa.status === 'running'; }) : [];
    var run = sync && sync.run;
    var parts = run && Array.isArray(run.participants) ? run.participants.slice() : [];
    for (var s = 0; s < subList.length; s++) {
      var sa = subList[s];
      var sAg = cwActResolveAgent({ agentId:sa.agentId, agentName:sa.agentName }, cw);
      var sk = String(sAg.id || sAg.name || ('sub-' + s));
      if (!parts.some(function(x){ return x.key === sk; })) {
        parts.push({ key:sk, agent:sAg, name:sAg.name || 'Specialist', color:cwActAgentColor(sAg), active:true, verb:'Helping', targetLabel:'Task', iconHtml:cwActSvg('spark') });
      }
    }
    var activeCount = parts.filter(function(x){ return x.active; }).length;
    var showStrip = Boolean(cw.busy && (parts.length > 1 || subList.length > 0 || (conv && conv.kind === 'group' && parts.length > 0)));
    strip.hidden = !showStrip;
    if (!showStrip) { strip._cwSig = ''; if (strip.innerHTML) strip.innerHTML = ''; return; }
    var html = '<span class="cw-strip-badge"><span class="cw-strip-pulse" aria-hidden="true"></span><span>' + (parts.length > 1 ? parts.length + ' agents · ' + (activeCount > 1 ? 'Parallel' : 'Handoff') : 'Team live') + '</span></span>';
    for (var i = 0; i < parts.length && i < 4; i++) {
      var item = parts[i];
      if (i > 0) {
        var prev = parts[i - 1];
        html += '<span class="cw-collab-arrow" aria-hidden="true" style="--cw-from-color:' + prev.color + ';--cw-to-color:' + item.color + '"><span class="cw-collab-arrow-line"><span class="cw-collab-arrow-dot"></span></span></span>';
      }
      var cls = 'cw-strip-agent' + (item.active ? ' is-active' : ' is-done');
      html += '<button type="button" class="' + cls + '" data-team-strip-agent="' + cwActEsc(item.agent && item.agent.id ? item.agent.id : '') + '" style="--cw-node-color:' + item.color + '">' + cwActAgentAva(item.agent, item.color) + '<span>' + cwActEsc(item.name) + '</span>' + (item.iconHtml ? '<span class="cw-strip-ico" aria-hidden="true">' + item.iconHtml + '</span>' : '') + '</button>';
    }
    if (strip._cwSig !== html) { strip.innerHTML = html; strip._cwSig = html; }
    strip.onclick = function(ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('[data-team-strip-agent]') : null;
      if (!btn) return;
      var aid = btn.getAttribute('data-team-strip-agent');
      if (aid && typeof cwOpenDm === 'function') cwOpenDm(aid);
    };
  }
  function cwActRenderStage(cw, progresses, inChat, sync) {
    var lead = $('cwWorkingLead'), stage = $('cwWorkingStage'), elapsed = $('cwWorkingElapsed'), card = $('cwWorkingBubble');
    var run = sync && sync.run;
    if (!lead && !stage && !elapsed) return;
    if (!inChat) {
      if (elapsed) elapsed.hidden = true;
      if (stage) { stage.hidden = true; stage._cwSig = ''; }
      if (lead) { lead._cwSig = ''; if (lead.innerHTML) lead.innerHTML = ''; }
      return;
    }
    var list = progresses.length ? progresses : [{ agentName:(cw && cw.working) || '' }];
    var leadAgents = [], seen = {};
    for (var i = 0; i < list.length && leadAgents.length < 3; i++) {
      var ag = cwActResolveAgent(list[i], cw);
      var ak = String(ag.id || ag.name || i);
      if (!seen[ak]) { seen[ak] = true; leadAgents.push({ agent:ag, color:cwActAgentColor(ag) }); }
    }
    var primaryColor = leadAgents[0] ? leadAgents[0].color : '#60a5fa';
    if (card && card.style && card.style.setProperty) card.style.setProperty('--cw-stage-accent', primaryColor);
    if (lead) {
      var leadHtml = '<div class="cw-lead-stack">' + leadAgents.map(function(entry){
        return '<span class="cw-stage-ava" style="--cw-node-color:' + entry.color + '"><span class="cw-stage-ava-ring" aria-hidden="true"></span>' + cwActAgentAva(entry.agent, entry.color) + '</span>';
      }).join('') + '</div>';
      if (lead._cwSig !== leadHtml) { lead.innerHTML = leadHtml; lead._cwSig = leadHtml; }
    }
    if (elapsed && run) {
      elapsed.hidden = false;
      var elTxt = cwActFormatDuration(Date.now() - run.startedAt);
      if (elapsed.textContent !== elTxt) elapsed.textContent = elTxt;
    }
    if (!stage) return;
    var p0 = list[0];
    var leadAgent0 = leadAgents[0] ? leadAgents[0].agent : cwActResolveAgent(p0, cw);
    var tgt = cwActTarget(p0);
    var parts = run && run.participants ? run.participants : [];
    var steps = run && run.steps ? run.steps.slice(-4) : [];
    var stageHtml = '';
    stageHtml += '<div class="cw-conn-bridge' + (tgt.isReturn ? ' is-return' : '') + (tgt.err ? ' is-error' : '') + '" style="--cw-bridge-color:' + primaryColor + ';--cw-bridge-target-color:' + tgt.color + '">' +
      '<span class="cw-conn-node cw-conn-agent"><span class="cw-conn-node-ico">' + cwActAgentAva(leadAgent0, primaryColor) + '</span><span class="cw-conn-node-name">' + cwActEsc(leadAgent0.name || 'Teammate') + '</span></span>' +
      '<span class="cw-conn-wire" aria-hidden="true"><span class="cw-conn-track"></span><span class="cw-conn-packet cw-p1"></span><span class="cw-conn-packet cw-p2"></span><span class="cw-conn-packet cw-p3"></span><span class="cw-conn-verb">' + cwActEsc(tgt.verb) + '</span></span>' +
      '<span class="cw-conn-node cw-conn-target"><span class="cw-conn-node-ico">' + tgt.iconHtml + '</span><span class="cw-conn-node-name">' + cwActEsc(tgt.targetLabel) + '</span></span>' +
    '</div>';
    if (parts.length > 1) {
      stageHtml += '<div class="cw-collab-lanes">';
      for (var c = 0; c < parts.length && c < 4; c++) {
        var cp = parts[c];
        if (c > 0) stageHtml += '<span class="cw-collab-arrow" aria-hidden="true" style="--cw-from-color:' + parts[c-1].color + ';--cw-to-color:' + cp.color + '"><span class="cw-collab-arrow-line"><span class="cw-collab-arrow-dot"></span></span></span>';
        stageHtml += '<span class="cw-collab-pill ' + (cp.active ? 'is-active' : 'is-done') + '" style="--cw-node-color:' + cp.color + '">' + cwActAgentAva(cp.agent, cp.color) + '<span class="cw-collab-nm">' + cwActEsc(cp.name) + '</span><span class="cw-collab-act">' + cwActEsc(cp.targetLabel) + '</span></span>';
      }
      stageHtml += '</div>';
    }
    if (steps.length > 0) {
      stageHtml += '<div class="cw-step-trail">';
      for (var k = 0; k < steps.length; k++) {
        var st = steps[k];
        var sIcon = st.state==='done' ? cwActSvg('check') : st.state==='error' ? cwActSvg('error') : '<span class="cw-step-spinner"></span>';
        stageHtml += '<div class="cw-step-item is-' + st.state + '" style="--cw-step-color:' + st.targetColor + '">' +
          '<span class="cw-step-state" aria-hidden="true">' + sIcon + '</span>' +
          '<span class="cw-step-who">' + cwActEsc(st.agentName) + '</span>' +
          '<span class="cw-step-label">' + cwActEsc(st.label) + '</span>' +
          '<span class="cw-step-target"><span class="cw-step-target-ico">' + st.iconHtml + '</span><span class="cw-step-target-tx">' + cwActEsc(st.targetLabel) + '</span></span>' +
        '</div>';
      }
      stageHtml += '</div>';
    }
    stage.hidden = false;
    if (stage._cwSig !== stageHtml) { stage.innerHTML = stageHtml; stage._cwSig = stageHtml; }
  }
  function cwActRenderReceipt(cw, sync, hasOpenReq) {
    var box = $('cwWorkReceipt');
    if (!box || typeof document === 'undefined') return;
    var comp = sync && sync.completed;
    var show = Boolean(!cw.busy && !hasOpenReq && comp && !comp.dismissed && comp.steps && comp.steps.length > 0);
    box.hidden = !show;
    if (!show) { box._cwSig = ''; if (box.innerHTML) box.innerHTML = ''; return; }
    var hasErr = comp.steps.some(function(s){ return s.state === 'error'; });
    var dur = cwActFormatDuration((comp.endedAt || Date.now()) - (comp.startedAt || Date.now()));
    var teamCount = (comp.participants || []).length;
    var headSummary = (hasErr ? 'Finished with an issue' : teamCount > 1 ? teamCount + ' teammates finished' : 'Finished') + ' · ' + comp.steps.length + ' ' + (comp.steps.length === 1 ? 'step' : 'steps') + ' · ' + dur;
    var avas = (comp.participants || []).slice(0, 4).map(function(pt){ return cwActAgentAva(pt.agent, pt.color); }).join('');
    var rows = comp.steps.map(function(st){
      var sIcon = st.state==='error' ? cwActSvg('error') : cwActSvg('check');
      return '<div class="cw-step-item is-' + st.state + '" style="--cw-step-color:' + st.targetColor + '">' +
        '<span class="cw-step-state" aria-hidden="true">' + sIcon + '</span>' +
        '<span class="cw-step-who">' + cwActEsc(st.agentName) + '</span>' +
        '<span class="cw-step-label">' + cwActEsc(st.label) + '</span>' +
        '<span class="cw-step-target"><span class="cw-step-target-ico">' + st.iconHtml + '</span><span class="cw-step-target-tx">' + cwActEsc(st.targetLabel) + '</span></span>' +
      '</div>';
    }).join('');
    var html = '<div class="cw-receipt-card">' +
      '<div class="cw-receipt-head">' +
        '<span class="cw-receipt-avas">' + avas + '</span>' +
        '<span class="cw-receipt-check' + (hasErr ? ' is-error' : '') + '" aria-hidden="true">' + cwActSvg(hasErr ? 'error' : 'check') + '</span>' +
        '<span class="cw-receipt-summary">' + cwActEsc(headSummary) + '</span>' +
        '<button type="button" class="cw-receipt-toggle" data-cw-receipt-toggle aria-expanded="' + (comp.expanded ? 'true' : 'false') + '">' + (comp.expanded ? 'Hide steps' : 'Steps') + '</button>' +
        '<button type="button" class="cw-receipt-dismiss" data-cw-receipt-dismiss aria-label="Dismiss summary">' + cwActSvg('close') + '</button>' +
      '</div>' +
      '<div class="cw-receipt-steps"' + (comp.expanded ? '' : ' hidden') + '>' + rows + '</div>' +
    '</div>';
    if (box._cwSig !== html) { box.innerHTML = html; box._cwSig = html; }
    box.onclick = function(ev) {
      if (ev.target && ev.target.closest && ev.target.closest('[data-cw-receipt-dismiss]')) { comp.dismissed = true; cwRenderCleanActivity(); return; }
      if (ev.target && ev.target.closest && ev.target.closest('[data-cw-receipt-toggle]')) { comp.expanded = !comp.expanded; cwRenderCleanActivity(); }
    };
  }
  function cwCleanActivityText() {
    var cw=cwEnsure();
    if((cw.requests||[]).some(function(r){return r.status==='open';}))return 'Waiting for your response';
    if(!cw.busy)return '';
    var progresses=(cw.progresses&&cw.progresses.length)?cw.progresses:(cw.progress?[cw.progress]:[]);
    var progress=progresses[0];
    var label=progress&&progress.toolOk===false?'A step failed':progress&&progress.tool?cwToolProgressText(progress):progress&&progress.phase==='responding'?'Writing a reply…':'Working on your request…';
    var teammates=new Set(progresses.map(function(p){return p.agentId||p.agentName;}).filter(Boolean)).size;
    return label+(teammates>1?' · '+teammates+' teammates':'');
  }
  function cwRenderCleanActivity() {
    var line=$('cwCleanActivity');if(!line)return;
    var cw=cwEnsure(),text=cwCleanActivityText(),count=(cw.workHistory||[]).length;
    var working=$('cwWorkingBubble'),workingLabel=$('cwWorkingLabel');
    var progresses=(cw.progresses&&cw.progresses.length)?cw.progresses:(cw.progress?[cw.progress]:[]);
    var hasOpenReq=(cw.requests||[]).some(function(r){return r.status==='open';});
    var replying=progresses.some(function(p){if(typeof cwVisibleReply!=='function')return false;var t=cwVisibleReply(p.text);return !!t&&!/^(?:Continuing automatically \(checkpoint \d+\)|Working(?:\u2026|\.\.\.)$)/.test(t);});
    var inChat=!!working&&cw.busy&&!replying&&!hasOpenReq;
    var sync=cwActSyncTracker(cw,progresses,hasOpenReq);
    cwActRenderTeamStrip(cw,progresses,sync);
    cwActRenderStage(cw,progresses,inChat,sync);
    cwActRenderReceipt(cw,sync,hasOpenReq);
    if(working){
      var messages=$('cwMsgs'),atBottom=messages&&messages.scrollHeight-messages.scrollTop-messages.clientHeight<120;
      working.hidden=!inChat;
      if(workingLabel&&workingLabel.textContent!==(inChat?text:''))workingLabel.textContent=inChat?text:'';
      if(atBottom)messages.scrollTop=messages.scrollHeight;
    }
    line.hidden=!count&&(!text||inChat);
    var status=$('cwCleanStatus'),label=$('cwCleanLabel'),details=$('cwCleanDetails');
    status.hidden=!text||inChat;
    if(label.textContent!==text)label.textContent=text;
    details.hidden=!count;
    var detailText='Work details · '+count;
    if(details.textContent!==detailText)details.textContent=detailText;
    details.onclick=function(){
      var messages=$('cwMsgs');if(!messages)return;
      var groups=messages.querySelectorAll('details[data-cwworkhistory]'),latest=groups[groups.length-1];
      if(!latest)return;
      latest.open=true;
      latest.scrollIntoView({block:'nearest',behavior:'instant'});
      var summary=latest.querySelector('summary');if(summary)summary.focus({preventScroll:true});
    };
  }
`;
