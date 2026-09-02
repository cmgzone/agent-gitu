export const UI_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Gitu</title>
  <style>
  /* Bundled fonts (served locally from /fonts/*, no CDN, offline-safe). */
  @font-face { font-family: 'Inter'; font-style: normal; font-weight: 400; font-display: swap; src: url('/fonts/inter-latin-400-normal.woff2') format('woff2'); }
  @font-face { font-family: 'Inter'; font-style: normal; font-weight: 500; font-display: swap; src: url('/fonts/inter-latin-500-normal.woff2') format('woff2'); }
  @font-face { font-family: 'Inter'; font-style: normal; font-weight: 600; font-display: swap; src: url('/fonts/inter-latin-600-normal.woff2') format('woff2'); }
  @font-face { font-family: 'JetBrains Mono'; font-style: normal; font-weight: 400; font-display: swap; src: url('/fonts/jetbrains-mono-latin-400-normal.woff2') format('woff2'); }
  @font-face { font-family: 'JetBrains Mono'; font-style: normal; font-weight: 700; font-display: swap; src: url('/fonts/jetbrains-mono-latin-700-normal.woff2') format('woff2'); }
  /* Timeline palette (agent-timeline-mockup): bg/ok/err/run/evidence + line. */
  :root {
    --bg: #0d1017;
    --card: #131826;
    --card2: #0f141f;
    --border: #1e2534;
    --border2: #2b3448;
    --text: #e6ebf4;
    --muted: #8b94a7;
    --faint: #75809a;
    --dark: #e6ebf4;
    --ok: #3fd68f;
    --err: #ff6465;
    --run: #5ba8ff;
    --evidence: #c9a86a;
    --line: #212939;
    --ok-dim: rgba(63,214,143,.13);
    --err-dim: rgba(255,100,101,.13);
    --run-dim: rgba(91,168,255,.12);
    --hover: #1a2231;
    --green: var(--ok);
    --red: var(--err);
    --blue: var(--run);
    --amber: var(--evidence);
    --amber-bg: rgba(201,168,106,.12);
    --accent: #8f80ff;
    --sans: 'Inter', -apple-system, 'Segoe UI', system-ui, sans-serif;
    --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    /* Native controls (select popups, scrollbars, checkboxes) render dark —
       without this Chromium flashes a WHITE dropdown list on every select. */
    color-scheme: dark;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; background: radial-gradient(circle at 48% -18%, rgba(143,128,255,.13), transparent 33rem), var(--bg); color: var(--text); font: 13.5px/1.6 var(--sans); }
  ::selection { background: rgba(143,128,255,.35); }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #232c3f; border-radius: 5px; border: 2px solid var(--bg); }
  ::-webkit-scrollbar-thumb:hover { background: #2e3950; }
  /* Counters never jitter as numbers change (Inter tnum). */
  #progText, .spec-turns, .stat .v { font-feature-settings: 'tnum' 1; font-variant-numeric: tabular-nums; }
  button { font: inherit; cursor: pointer; }
  button:focus-visible, [role=button]:focus-visible, [tabindex]:focus-visible,
  select:focus-visible, input:focus-visible, textarea:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  select, textarea, input { font: inherit; }
  /* Dark-theme fallbacks for form controls that have no styling of their own
     (e.g. the agent-modal Model/Effort selects and Name/Role fields) — they
     otherwise render with UA white-background/black-text defaults on the dark
     UI. More specific rules (.pill select, .setrow select/input,
     .composer textarea) override these below. */
  select { color: var(--text); background: var(--card2); border: 1px solid var(--border2); border-radius: 8px; padding: 6px 10px; font-size: 12.5px; }
  input:not([type=checkbox]):not([type=radio]), textarea { color: var(--text); background: var(--card2); border: 1px solid var(--border2); border-radius: 8px; padding: 6px 10px; }
  select:focus, input:not([type=checkbox]):not([type=radio]):focus, textarea:focus { outline: none; border-color: var(--accent); }
  select option { background: var(--card); color: var(--text); }
  [hidden] { display: none !important; }

  .shell { display: flex; height: 100%; min-width: 0; }
  .mobile-nav-btn, .mobile-backdrop { display: none; }
  .sb { width: var(--sbw, 264px); flex: none; border-right: 1px solid var(--border); background: linear-gradient(180deg, rgba(19,24,38,.72), var(--bg) 150px); display: flex; flex-direction: column; overflow: hidden; }
  .sb .head { display: flex; align-items: center; gap: 8px; padding: 16px 14px 10px; }
  .sb .head .name { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; letter-spacing: 2px; font-size: 14px; }
  .brand-mark { width: 22px; height: 22px; flex: none; border-radius: 6px; }
  .sb .head .spacer { flex: 1; }
  .sb .iconbtn { background: none; border: 0; color: var(--muted); width: 28px; height: 28px; border-radius: 7px; font-size: 15px; }
  .sb .iconbtn:hover { background: var(--hover); color: var(--text); }
  .sb .scroll { flex: 1; overflow-y: auto; padding: 4px 10px 10px; }
  .sb .newbtn { margin: 6px 4px 10px; display: flex; align-items: center; gap: 9px; border: 1px solid rgba(143,128,255,.34); background: linear-gradient(135deg, rgba(143,128,255,.20), rgba(91,168,255,.12)); color: var(--text); border-radius: 10px; padding: 9px 11px; font-weight: 650; font-size: 13px; width: calc(100% - 8px); text-align: left; transition: transform .16s ease, border-color .16s ease, background .16s ease; }
  .sb .newbtn:hover { background: linear-gradient(135deg, rgba(143,128,255,.31), rgba(91,168,255,.18)); border-color: rgba(143,128,255,.62); transform: translateY(-1px); }
  .sb .navitem { display: flex; align-items: center; gap: 9px; padding: 7px 10px; border-radius: 8px; color: var(--text); font-size: 13px; cursor: pointer; border: 0; background: none; width: 100%; text-align: left; }
  .sb .navitem:hover { background: var(--hover); }
  .sb .navitem .ico { width: 16px; text-align: center; color: var(--muted); }
  .sb .sect { font-size: 11px; color: var(--muted); margin: 14px 10px 4px; }
  .sb .proj { display: flex; align-items: center; gap: 8px; padding: 6px 10px; font-size: 12.5px; font-weight: 600; color: var(--text); border-radius: 8px; cursor: pointer; }
  .sb .proj:hover { background: var(--hover); }
  .sb .proj.activeproj { background: rgba(143,128,255,.10); }
  .sb .proj.activeproj .ico { color: var(--accent); }
  .sb .proj .delx { display: none; border: 0; background: none; color: var(--muted); width: 24px; height: 24px; border-radius: 6px; align-items: center; justify-content: center; flex: none; padding: 0; position: relative; }
  /* Invisible halo brings the ~24px control to a ~32px touch target. */
  .sb .proj .delx::after { content: ''; position: absolute; inset: -4px; }
  .sb .proj:hover .delx { display: inline-flex; }
  .sb .proj .delx:hover { color: var(--err); background: var(--err-dim); }
  .sb .proj .delx svg { width: 11px; height: 11px; }
  .sb .chat { display: flex; align-items: flex-start; gap: 8px; padding: 5px 10px 5px 26px; font-size: 12.5px; color: var(--muted); border-radius: 8px; cursor: pointer; border: 0; background: none; width: 100%; text-align: left; position: relative; }
  .sb .chat .dot { margin-top: 4px; }
  .sb .chat .chat-label { flex: 1; min-width: 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; line-height: 1.35; padding: 1px 0; }
  .sb .chat:hover { background: var(--hover); color: var(--text); }
  /* Per-session hover delete — single-session cleanup no longer requires
     discovering bulk-manage mode. Two-click arm/confirm, no native dialogs. */
  .sb .chat .rowdel { display: none; margin-left: auto; border: 0; background: none; color: var(--muted); width: 22px; height: 22px; border-radius: 6px; align-items: center; justify-content: center; flex: none; padding: 0; position: relative; cursor: pointer; }
  .sb .chat .rowdel::after { content: ''; position: absolute; inset: -3px; }
  .sb .chat:hover .rowdel, .sb .chat .rowdel.armed { display: inline-flex; }
  .sb .chat .rowdel:hover { color: var(--err); background: var(--err-dim); }
  .sb .chat .rowdel.armed { color: #fff; background: var(--err); }
  .sb .chat .rowdel.armed::after { content: 'sure?'; inset: 0 -34px 0 auto; font-size: 10.5px; color: var(--err); display: flex; align-items: center; white-space: nowrap; }
  .sb .more-row { display: flex; align-items: center; gap: 6px; padding: 4px 10px 4px 26px; font-size: 11.5px; color: var(--faint); border: 0; background: none; width: 100%; text-align: left; cursor: pointer; }
  .sb .more-row:hover { color: var(--text); background: var(--hover); border-radius: 8px; }
  .sb .chat.active { background: rgba(143,128,255,.16); color: var(--text); }
  .sb .chat .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--faint); flex: none; }
  .sb .chat .dot.running { background: var(--blue); animation: pulse 1.2s infinite; }
  .sb .chat .dot.waiting { background: var(--amber); animation: pulse 1.2s infinite; }
  .sb .chat .dot.completed { background: var(--green); }
  .sb .chat .dot.blocked, .sb .chat .dot.failed { background: var(--red); }
  /* Inline end-of-stream failure card (mirrors the State-panel banner into the main column). */
  .run-stop-note { margin: 7px 0; color: rgba(151,164,194,.58); font-size: 10px; line-height: 1.35; letter-spacing: .01em; }
  /* A user message whose send FAILED — kept visible with retry, no longer "pending". */
  .usermsg.failed > div { border-color: rgba(255,100,101,.55) !important; opacity: .85; }
  .sb .foot { border-top: 1px solid var(--border); padding: 10px 12px; display: flex; gap: 8px; align-items: center; }
  .bulkbar { display: flex; gap: 6px; align-items: center; padding: 8px 10px; border-top: 1px solid var(--border); background: var(--bg); }
  .bulkbar #bulkCount { flex: 1; font-size: 12px; color: var(--muted); }
  .sb .chk { margin: 0; width: auto; accent-color: var(--accent); }
  .sb .foot .chip { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--muted); }
  .project-chip { width: 100%; text-align: left; background: transparent; border: 1px solid var(--border); }
  @keyframes pulse { 50% { opacity: .35; } }

  .main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .topbar { display: flex; align-items: center; gap: 10px; padding: 10px 20px; border-bottom: 1px solid var(--border); flex: none; }
  .topbar .title { font-weight: 600; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .topbar .spacer { flex: 1; }
  .view { flex: 1; overflow: hidden; display: flex; flex-direction: column; }

  .home { position: relative; isolation: isolate; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; padding: 24px; overflow: auto; }
  .home::before { content: ''; position: absolute; z-index: -1; width: min(920px, 86vw); height: 520px; top: calc(50% - 270px); border-radius: 50%; background: radial-gradient(ellipse, rgba(91,168,255,.075), rgba(143,128,255,.04) 39%, transparent 70%); pointer-events: none; }
  .home-intro { width: min(760px, 94vw); }
  .home-eyebrow { display: flex; align-items: center; gap: 7px; margin-bottom: 8px; color: #b9b1ff; font-size: 10.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
  .home-eyebrow::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 0 4px var(--ok-dim); }
  .home h1 { font-size: clamp(24px, 3vw, 32px); font-weight: 650; letter-spacing: -.035em; line-height: 1.18; margin: 0; }
  .home h1 .u { border-bottom: 2px dotted var(--faint); }
  .home-copy { max-width: 580px; margin: 8px 0 0; color: var(--muted); font-size: 13px; }
  .sugs { display: grid; grid-template-columns: repeat(4, 170px); gap: 10px; }
  @media (max-width: 900px) { .sugs { grid-template-columns: repeat(2, 170px); } }  .sug { min-height: 130px; background: linear-gradient(155deg, rgba(27,34,49,.94), var(--card)); border: 1px solid var(--border); border-radius: 13px; padding: 14px; text-align: left; cursor: pointer; font-size: 12.5px; color: var(--text); transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease; }
  .sug:hover { border-color: rgba(143,128,255,.48); box-shadow: 0 12px 30px rgba(2,6,17,.28); transform: translateY(-2px); }
  .sug .ico { font-size: 15px; display: block; margin-bottom: 10px; }
  .sug-title { display: block; font-weight: 650; line-height: 1.38; }
  .sug-hint { display: block; margin-top: 5px; color: var(--faint); font-size: 11px; line-height: 1.38; }
  .setup-card { border: 1px solid rgba(91,168,255,.34); background: var(--run-dim); color: var(--text); border-radius: 12px; padding: 12px 14px; }
  .setup-card:hover { border-color: var(--run); background: rgba(91,168,255,.16); }
  .setup-card h3 { color: #cfe6ff; font-size: 12px; letter-spacing: .6px; text-transform: uppercase; }
  .setup-card .setup-action { display: inline-block; margin-top: 6px; color: var(--run); font-size: 12px; font-weight: 650; }
  .composer { width: min(760px, 94vw); background: linear-gradient(145deg, rgba(24,31,47,.98), var(--card)); border: 1px solid var(--border2); border-radius: 14px; box-shadow: 0 1px 2px rgba(0,0,0,.12), 0 12px 32px rgba(0,0,0,.15); padding: 6px 8px 8px; transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease; }
  .composer:focus-within { border-color: rgba(143,128,255,.72); box-shadow: 0 0 0 3px rgba(143,128,255,.12), 0 16px 38px rgba(0,0,0,.24); }
  .composer textarea { width: 100%; border: 0; outline: none; resize: none; background: transparent; color: var(--text); font: inherit; padding: 10px 10px 6px; min-height: 44px; max-height: 180px; }
  .composer textarea::placeholder { color: var(--faint); }
  .composer-bar { display: flex; align-items: center; gap: 5px; padding: 2px 6px; flex-wrap: wrap; }
  .pill { background: none; border: 0; color: var(--muted); border-radius: 8px; padding: 5px 9px; display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; }
  .pill:hover { background: var(--hover); color: var(--text); }
  .control-pill { border: 1px solid transparent; }
  .control-prefix { color: var(--faint); font-size: 10px; font-weight: 650; letter-spacing: .55px; text-transform: uppercase; }
  .pill select { border: 0; background: none; color: inherit; outline: none; font-size: 12.5px; appearance: none; -webkit-appearance: none; padding-right: 2px; max-width: 220px; }
  .model-meta { color: var(--faint); font: 10.5px var(--mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px; }
  .model-control { position: relative; display: inline-flex; min-width: 0; }
  .pill .caret { color: var(--faint); font-size: 10px; }
  .model-pick { cursor: pointer; min-width: 0; }
  .model-pick.open, .model-pick.open:hover { background: var(--hover); color: var(--text); }
  .model-pick .mp-label { max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .model-menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 60; width: 370px; max-width: calc(100vw - 48px); background: var(--card); border: 1px solid var(--border2); border-radius: 10px; box-shadow: 0 12px 32px rgba(0,0,0,.15); padding: 6px; }
  .model-menu input { width: 100%; border: 1px solid var(--border); border-radius: 8px; padding: 6px 9px; font-size: 12.5px; outline: none; background: var(--card2); color: var(--text); }
  .model-menu input:focus { border-color: var(--accent); }
  .model-list { max-height: 300px; overflow-y: auto; margin-top: 6px; }
  .model-sec { position: sticky; top: 0; z-index: 1; background: var(--card); padding: 6px 10px 3px; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .model-sec:first-child { padding-top: 2px; }
  .model-item { display: block; width: 100%; padding: 6px 10px 7px; border: 0; background: none; color: inherit; text-align: left; border-radius: 7px; cursor: pointer; font-size: 12.5px; line-height: 1.35; }
  .model-item:hover, .model-item.hl { background: var(--hover); }
  .model-item.cur { box-shadow: inset 2px 0 0 var(--accent); }
  .model-item .mi-top { display: flex; align-items: center; gap: 8px; }
  .model-item .mi-prov { color: var(--muted); font-size: 10.5px; flex: none; }
  .model-item .mi-meta { margin-left: auto; color: var(--faint); font-size: 10px; font-family: var(--mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 58%; flex: none; }
  .model-item .mi-name { font-weight: 600; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .model-item .mi-name .vmark { color: var(--blue); font-style: normal; }
  .model-empty { color: var(--faint); font-size: 12px; padding: 10px 9px; text-align: center; line-height: 1.5; }
  .model-list mark { background: rgba(143,128,255,.28); color: inherit; border-radius: 3px; }
  .model-count { padding: 5px 10px 2px; margin-top: 4px; border-top: 1px solid var(--border); color: var(--faint); font-size: 10.5px; text-align: right; }
  .send { margin-left: auto; width: 32px; height: 32px; border-radius: 10px; border: 0; background: linear-gradient(135deg, #a99cff, #6f98ff); color: #fff; font-size: 14px; box-shadow: 0 4px 12px rgba(112,134,255,.28); transition: transform .16s ease, filter .16s ease, box-shadow .16s ease; }
  .send:not(:disabled):hover { filter: brightness(1.1); box-shadow: 0 7px 18px rgba(112,134,255,.38); transform: translateY(-1px); }
  /* Send ⇄ Stop: while the agent runs the same button stops it. */
  .send.stop { background: var(--err); color: #fff; font-size: 11px; animation: stopPulse 1.6s ease-in-out infinite; }
  .send.stop:hover { filter: brightness(1.12); }
  @keyframes stopPulse { 0%,100% { box-shadow: 0 0 0 0 rgba(255,100,101,.45); } 50% { box-shadow: 0 0 0 5px rgba(255,100,101,0); } }
  #wfChip { flex: none; }
  .send:disabled { background: #2b3448; }

  .run { flex: 1; display: flex; min-height: 0; }
  .run-main { flex: 1; display: flex; flex-direction: column; min-width: 0; border-right: 1px solid var(--border); }
  /* ── Activity timeline ───────────────────────────────────────────────────
     One continuous vertical rule down the left of the feed; every entry is a
     row with a dot marker sitting on the line. No bordered cards. */
  .progress { display: flex; align-items: center; gap: 10px; padding: 8px 24px 2px; flex: none; font-family: var(--mono); font-size: 10.5px; letter-spacing: .4px; color: var(--muted); }
  .progress .plabel { white-space: nowrap; }
  .progress .pbar { flex: 1; height: 2px; border-radius: 1px; background: var(--line); overflow: hidden; }
  .progress .pbar span { display: block; height: 100%; width: 0; background: var(--run); transition: width .5s ease; }
  .stream { position: relative; flex: 1; overflow-y: auto; padding: 10px 24px 18px 20px; }
  .run-overview { display: flex; align-items: center; gap: 12px; padding: 12px 24px 10px; border-bottom: 1px solid var(--border); background: linear-gradient(180deg, rgba(19,24,38,.78), var(--bg)); flex: none; min-width: 0; }
  .run-overview-main { display: flex; align-items: flex-start; gap: 9px; min-width: 0; flex: 1; }
  .run-overview-dot { width: 9px; height: 9px; margin-top: 6px; border-radius: 50%; background: var(--faint); flex: none; }
  .run-overview-dot.running { background: var(--run); box-shadow: 0 0 0 4px var(--run-dim); }
  .run-overview-dot.completed { background: var(--ok); }
  .run-overview-dot.failed, .run-overview-dot.blocked { background: var(--err); }
  .run-overview-dot.waiting { background: var(--evidence); }
  .run-overview-goal { color: var(--text); font-size: 13px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .run-overview-next { color: var(--muted); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .run-overview-next.wrapped { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; line-height: 1.45; }
  .run-overview-stats { display: flex; align-items: center; gap: 7px; color: var(--muted); font: 10.5px var(--mono); white-space: nowrap; }
  .run-overview .details-btn { border: 1px solid var(--border2); background: rgba(19,24,38,.84); color: var(--text); border-radius: 8px; padding: 5px 10px; font-size: 11.5px; transition: background .15s ease, border-color .15s ease; }
  .run-overview .details-btn:hover { background: var(--hover); border-color: rgba(143,128,255,.48); }
  .timeline-trim-note { margin: 4px 0 10px 20px; color: var(--faint); font-size: 11.5px; }
  .stream::before { content: ''; position: absolute; left: 24px; top: 0; bottom: 0; width: 1px; background: var(--line); }
  .tl-row { position: relative; display: flex; align-items: flex-start; gap: 11px; padding: 5px 0; min-width: 0; animation: toolIn .22s ease-out both; }
  .tl-dot { position: relative; z-index: 1; flex: none; width: 9px; height: 9px; margin-top: 6px; border-radius: 50%; background: var(--bg); box-shadow: inset 0 0 0 1.5px var(--faint); transition: box-shadow .25s ease, background .25s ease; }
  .tl-dot.dot-run { box-shadow: inset 0 0 0 1.5px var(--run); animation: tlPulse 1.5s ease-out infinite; }
  .tl-dot.dot-ok { box-shadow: inset 0 0 0 1.5px var(--ok); animation: none; }
  .tl-dot.dot-bad { box-shadow: inset 0 0 0 1.5px var(--err); animation: dotPop .35s ease; }
  .tl-dot.dot-blocked { box-shadow: inset 0 0 0 1.5px var(--evidence); animation: none; }
  /* Evidence pass/fail: small filled amber dot */
  .tl-dot.dot-ev { width: 7px; height: 7px; margin-top: 7px; margin-left: 1px; background: var(--evidence); box-shadow: none; animation: none; }
  /* Plain narration/thought: tiny unfilled dot, no color */
  .tl-dot.dot-note { width: 5px; height: 5px; margin-top: 8px; margin-left: 2px; background: transparent; box-shadow: inset 0 0 0 1px var(--faint); opacity: .65; animation: none; }
  @keyframes tlPulse { 0% { box-shadow: inset 0 0 0 1.5px var(--run), 0 0 0 0 rgba(91,168,255,.4); } 100% { box-shadow: inset 0 0 0 1.5px var(--run), 0 0 0 7px rgba(91,168,255,0); } }
  @keyframes dotPop { 30% { transform: scale(1.4); } }
  .tl-body { flex: 1; min-width: 0; }
  /* Narration / thought text: full-weight sans body — reads MORE prominent
     than the mono tool lines around it. */
  .tl-note-row { padding: 9px 0; }
  .tl-note-row .tl-body { font-size: 13.5px; font-weight: 500; line-height: 1.6; color: var(--text); white-space: pre-wrap; word-break: break-word; }
  .thought { padding: 9px 0 9px 20px; color: var(--text); white-space: pre-wrap; font-weight: 500; }
  .thought .caret, .tl-note-row .caret { display: inline-block; width: 7px; height: 14px; background: var(--run); vertical-align: -2px; animation: pulse 1s infinite; margin-left: 2px; }
  /* ── Collapsible technical sections ─────────────────────────────────────
     Telemetry and raw-model JSON are machine output, not conversation:
     collapsed by default so the feed answers what/why/proof/next first,
     implementation detail one click away. */
  .exec-details { margin: 3px 0; border: 1px solid var(--border); border-radius: 8px; background: rgba(255,255,255,.02); overflow: hidden; }
  .exec-details summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 7px; padding: 5px 10px; font-size: 11.5px; color: var(--muted); user-select: none; }
  .exec-details summary::-webkit-details-marker { display: none; }
  .exec-details summary:hover { background: var(--hover); }
  .exec-details summary b { color: var(--text); font-weight: 600; }
  .exec-details .chev { display: inline-block; transition: transform .14s ease; color: var(--faint); font-size: 10px; }
  .exec-details[open] .chev { transform: rotate(90deg); }
  .exec-details .exec-sum { color: var(--faint); font-family: var(--mono); font-size: 10.5px; }
  .exec-grid { display: grid; grid-template-columns: minmax(96px, max-content) 1fr; gap: 1px 14px; padding: 6px 12px 9px; font-family: var(--mono); font-size: 10.5px; }
  .exec-grid .k { color: var(--faint); }
  .exec-grid .v { color: var(--text); font-feature-settings: 'tnum' 1; }
  .exec-pre { margin: 0; padding: 6px 12px 9px; font-family: var(--mono); font-size: 10.5px; color: var(--muted); white-space: pre-wrap; word-break: break-all; max-height: 220px; overflow-y: auto; }
  /* Dense narration: long verification reports become headline + checklist +
     footer instead of one wall of pre-wrapped text. Same words, structure. */
  .tl-body .dense-note, .abubble .dense-note { white-space: normal; display: block; }
  .dense-headline { display: block; font-weight: 650; }
  .dense-items { list-style: none; margin: 3px 0 2px; padding: 0; }
  .dense-items li { position: relative; padding-left: 15px; margin: 2px 0; }
  .dense-items li::before { position: absolute; left: 1px; top: 0; color: var(--faint); content: '\00B7'; font-weight: 700; }
  .dense-items li.ev::before { content: '\2713'; color: var(--ok); }
  .dense-foot { display: block; margin-top: 3px; color: var(--run); font-weight: 600; }
  /* Generic quiet metadata rows (plan/criteria/queued/parallel/…) */
  .meta-line { color: var(--muted); font-size: 12px; padding: 3px 2px; }
  .meta-line b { color: var(--text); font-weight: 600; }
  .tl-meta .tl-body { color: var(--muted); font-size: 12px; padding: 1px 0; }
  .tl-meta b { color: var(--muted); font-weight: 600; }
  .tl-meta.subagent-note b { color: var(--run); }
  /* ── Delegated specialist: nested under its parent entry ────────────────
     Not a second card — an indent with its own left border rule; agent name,
     turn count and usage tag inline in one row, narration lines below. */
  .tl-sub-row .tl-body { min-width: 0; }
  .tl-sub-head { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 12px; cursor: pointer; border-radius: 7px; padding: 2px 4px; margin: -2px -4px; }
  .tl-sub-head:hover { background: var(--hover); }
  .tl-sub-head:focus-visible { outline: 1px solid var(--accent); outline-offset: 1px; }
  /* Tap-to-peek specialist cards: chevron rotates when open, collapsed shows
     a one-line preview of the latest activity. */
  .spec-chev { display: inline-flex; align-items: center; color: var(--faint); flex: none; transition: transform .14s ease; }
  .spec-chev svg { width: 11px; height: 11px; }
  .tl-sub-row.open .spec-chev { transform: rotate(90deg); color: var(--text); }
  .spec-preview { font-family: var(--mono); font-size: 10.5px; color: var(--faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 1px 2px 3px 15px; min-height: 14px; }
  .tl-sub-row.open .spec-preview { display: none; }
  .spec-name { font-weight: 600; font-size: 12px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 0 1 auto; }
  .spec-turns { font-family: var(--mono); font-size: 10.5px; color: var(--muted); font-feature-settings: 'tnum' 1; font-variant-numeric: tabular-nums; flex: none; white-space: nowrap; }
  .spec-tag { font-family: var(--mono); font-size: 9px; letter-spacing: .7px; text-transform: uppercase; color: var(--muted); border: 1px solid var(--border2); border-radius: 999px; padding: 1px 7px; flex: none; }
  .tl-sub-status { margin-left: auto; font-family: var(--mono); font-size: 10px; letter-spacing: .5px; color: var(--muted); flex: none; white-space: nowrap; }
  .st.st-run, .tl-sub-status.st-run { color: var(--run); }
  .st.st-ok, .tl-sub-status.st-ok { color: var(--ok); }
  .st.st-err, .tl-sub-status.st-err { color: var(--err); }
  .st.st-warn, .tl-sub-status.st-warn { color: var(--evidence); }
  .st.st-idle, .tl-sub-status.st-idle { color: var(--faint); }
  .tl-sub-task { padding: 3px 0 1px; font-size: 11.5px; line-height: 1.55; color: var(--muted); font-style: italic; white-space: pre-wrap; word-break: break-word; }
  /* The sub-agent's own left border rule, indented under the parent entry */
  .tl-sub-rail { margin: 4px 0 0 3px; border-left: 1px solid var(--line); padding-left: 13px; }
  .spec-logline { font-size: 11.5px; line-height: 1.55; color: var(--muted); padding: 2px 0; white-space: pre-wrap; word-break: break-word; animation: outFade .18s ease-out; }
  .spec-logline:last-child { color: var(--text); opacity: .85; }
  /* ── Intake metadata: quiet silver line, collapses the resume burst ────── */
  .intake-line { margin: 2px 0; font-size: 11.5px; color: var(--faint); cursor: pointer; user-select: none; -webkit-user-select: none; }
  .intake-line:hover { color: var(--muted); }
  .intake-head { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; min-width: 0; }
  .intake-chev { display: inline-flex; flex: none; transform: rotate(-90deg); transition: transform .15s ease; }
  .intake-line.open .intake-chev { transform: none; }
  .intake-chev svg { width: 11px; height: 11px; }
  .intake-title { font-weight: 500; flex: none; }
  .intake-digest { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .intake-rows { display: none; padding: 3px 0 4px 16px; cursor: auto; user-select: text; -webkit-user-select: text; }
  .intake-line.open .intake-rows { display: block; animation: outFade .15s ease-out; }
  .intake-row { font-size: 11.5px; line-height: 1.55; color: var(--muted); white-space: pre-wrap; word-break: break-word; }
  /* Evidence result: compact inline pill, not a full-width card */
  .ev-pill { display: inline-flex; align-items: center; max-width: 100%; font-family: var(--mono); font-size: 10.5px; letter-spacing: .2px; border-radius: 999px; padding: 2px 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ev-pill.pass { color: var(--ok); background: var(--ok-dim); box-shadow: inset 0 0 0 1px rgba(63,214,143,.3); }
  .ev-pill.fail { color: var(--err); background: var(--err-dim); box-shadow: inset 0 0 0 1px rgba(255,100,101,.3); }
  /* ── Tool call rows: one monospace line on the timeline ─────────────────
     $ <command> — italic why — right-aligned status. Output collapsed inside
     a native <details>; no bordered container around the call itself. */
  @keyframes toolIn { from { opacity: 0; transform: translateY(6px) scale(.985); } to { opacity: 1; transform: none; } }
  @keyframes outFade { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: none; } }
  .tl-tool.done-bad { animation: rowFlash .6s ease; }
  @keyframes rowFlash { 0% { background: rgba(255,100,101,.09); } 100% { background: transparent; } }
  .tl-cmd { display: flex; align-items: baseline; gap: 8px; min-width: 0; font-family: var(--mono); font-size: 12px; cursor: pointer; border-radius: 6px; }
  .tl-cmd:hover .cmd { color: #fff; }
  .tl-cmd .cmd { color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 0 10000 auto; }
  .tl-cmd .why { color: var(--faint); font-style: italic; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1 9999 auto; }
  .st { margin-left: auto; flex: none; display: inline-flex; align-items: center; gap: 6px; font-family: var(--mono); font-size: 10px; letter-spacing: .5px; color: var(--faint); }
  .lines { font-family: var(--mono); font-size: 10px; color: var(--ok); background: var(--ok-dim); border-radius: 5px; padding: 1px 6px; flex: none; }
  /* Collapsed output disclosure */
  .tl-out { margin-top: 2px; max-width: 100%; }
  .tl-out summary { list-style: none; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; -webkit-user-select: none; font-family: var(--mono); font-size: 10px; letter-spacing: .6px; color: var(--faint); padding: 2px 0; }
  .tl-out summary::-webkit-details-marker { display: none; }
  .tl-out summary::before { content: '\25B8'; font-size: 9px; transition: transform .15s ease; }
  .tl-out[open] summary::before { transform: rotate(90deg); }
  .tl-out summary:hover { color: var(--muted); }
  .tool-btn-copy { display: inline-flex; align-items: center; gap: 4px; background: none; border: 1px solid var(--border2); border-radius: 5px; padding: 4px 8px; font-size: 10px; font-family: var(--mono); color: var(--faint); cursor: pointer; transition: all .2s; min-height: 26px; }
  .tool-btn-copy:hover { background: var(--hover); color: var(--text); }
  .tool-btn-copy.copied { color: var(--ok); border-color: rgba(63,214,143,.4); }
  .tool-btn-copy svg { width: 10px; height: 10px; }
  .tl-out[open] pre { animation: outFade .25s ease; }
  .tl-out pre { margin: 4px 0 0; padding: 8px 10px; font-family: var(--mono); font-size: 11px; line-height: 1.55; color: #a7b1c5; white-space: pre-wrap; word-break: break-word; max-height: 260px; overflow-y: auto; border-radius: 8px; background: var(--card2); box-shadow: inset 0 0 0 1px var(--border); }
  .tl-out pre.folded { max-height: 110px; overflow: hidden; position: relative; border-radius: 8px 8px 0 0; }
  .fold-btn { display: block; width: 100%; padding: 4px 10px; background: var(--card2); border: 0; box-shadow: inset 0 0 0 1px var(--border), inset 0 1px 0 var(--border); border-radius: 0 0 8px 8px; color: var(--run); font-size: 10.5px; text-align: left; cursor: pointer; font-family: var(--mono); }
  .fold-btn:hover { color: var(--text); }

  .chip { font-size: 11px; border-radius: 999px; padding: 2px 9px; border: 1px solid var(--border2); color: var(--muted); }
  .chip.ok { color: var(--ok); border-color: rgba(63,214,143,.35); background: var(--ok-dim); }
  .chip.bad { color: var(--err); border-color: rgba(255,100,101,.35); background: var(--err-dim); }
  .chip.info { color: var(--run); border-color: rgba(91,168,255,.35); background: var(--run-dim); }
  .chip.warn { color: var(--evidence); border-color: rgba(201,168,106,.4); background: var(--amber-bg); }
  .crit-req { font-family: var(--mono); font-size: 11px; color: var(--muted); margin-top: 3px; }
  .crit-req code { background: var(--card2); border-radius: 4px; padding: 1px 5px; color: var(--text); }

  .review-card, .approval { border: 1px solid rgba(201,168,106,.35); background: var(--amber-bg); border-radius: 12px; padding: 14px 16px; margin: 12px 0; }
  .review-card h3, .approval h3 { margin: 0 0 8px; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: var(--evidence); }
  .review-card label { display: block; font-size: 11px; color: var(--muted); margin: 8px 0 3px; }
  .review-card textarea { width: 100%; border: 1px solid var(--border2); border-radius: 8px; background: var(--card2); color: var(--text); padding: 7px 9px; font-family: var(--mono); font-size: 11.5px; resize: vertical; }
  .review-card .actions, .approval .actions { display: flex; gap: 8px; margin-top: 12px; align-items: center; }
  .review-card input { flex: 1; border: 1px solid var(--border2); border-radius: 8px; background: var(--card2); color: var(--text); padding: 6px 9px; font-size: 12px; }
  .btn { border: 0; border-radius: 8px; padding: 6px 14px; font-size: 12.5px; font-weight: 600; }
  .btn.dark { background: var(--dark); color: #10141d; }
  .btn.ghost { background: transparent; color: var(--text); border: 1px solid var(--border2); }
  .btn.red { background: transparent; color: var(--err); border: 1px solid rgba(255,100,101,.35); }
  .approval pre { font-family: var(--mono); font-size: 11.5px; background: var(--card2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; overflow-x: auto; margin: 6px 0 10px; }
  .md-plan { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 4px 14px; margin: 6px 0; }
  .md-plan h4 { margin: 12px 0 6px; font-size: 12px; letter-spacing: .8px; text-transform: uppercase; color: var(--muted); }
  .md-plan ol { margin: 0 0 12px; padding-left: 20px; }
  .md-plan li { margin: 8px 0; font-size: 13px; }
  .md-plan li .ver { display: block; color: var(--muted); font-size: 11.5px; }
  .md-plan ul { margin: 0 0 12px; padding-left: 20px; font-size: 12.5px; }

  .qcard { border: 1px solid rgba(91,168,255,.35); background: rgba(91,168,255,.07); border-radius: 12px; padding: 14px 16px; margin: 12px 0; }
  .qcard h3 { margin: 0 0 10px; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: var(--run); }
  .qcard .q { margin-bottom: 12px; }
  .qcard .q .qt { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
  .qcard .opts { display: flex; gap: 6px; flex-wrap: wrap; }
  .qcard .opt { border: 1px solid var(--border2); background: var(--card2); color: var(--text); border-radius: 999px; padding: 4px 12px; font-size: 12px; cursor: pointer; }
  .qcard .opt.sel { border-color: var(--run); color: var(--run); background: var(--run-dim); }
  .qcard .custom { width: 100%; margin-top: 6px; border: 1px solid var(--border2); border-radius: 8px; padding: 6px 9px; font-size: 12px; background: var(--card2); color: var(--text); }

  .summary-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 18px 20px; margin: 16px 0; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
  .summary-card .summary-head { display: flex; gap: 9px; align-items: center; justify-content: space-between; }
  .summary-card h2 { margin: 0; font-size: 15px; min-width: 0; }
  .summary-card .summary-stats { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .summary-card .summary-stat { color: var(--muted); font: 11px var(--mono); border: 1px solid var(--border); border-radius: 999px; padding: 3px 8px; background: var(--card2); }
  .summary-card .sec { margin-top: 12px; }
  .summary-card .sec h4 { margin: 0 0 5px; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); }
  .summary-card .summary-copy { margin: 0; font-size: 12.5px; line-height: 1.55; white-space: pre-line; }
  .summary-card ul { margin: 0; padding-left: 18px; font-size: 12.5px; }
  .summary-card li { margin: 2px 0; }
  .file-chip { display: inline-block; font-family: var(--mono); font-size: 11px; border: 1px solid var(--border); border-radius: 6px; padding: 2px 7px; margin: 2px 4px 2px 0; background: var(--card2); color: inherit; text-decoration: none; }
  a.file-chip:hover { border-color: var(--border2); color: var(--text); background: var(--hover); }
  .summary-card .verify-list { display: grid; gap: 6px; }
  .summary-card .verify-row { border: 1px solid var(--border); border-radius: 8px; padding: 7px 9px; font-size: 12px; display: flex; gap: 7px; align-items: flex-start; flex-wrap: wrap; }
  .summary-card .verify-kind { color: var(--muted); font: 10.5px var(--mono); padding-top: 3px; }
  .summary-card .verify-label { flex: 1; min-width: 150px; line-height: 1.4; }
  .summary-card .verify-row details { width: 100%; color: var(--muted); font-size: 11px; }
  .summary-card .verify-row summary { cursor: pointer; width: fit-content; }
  .summary-card .verify-row pre { margin: 6px 0 0; padding: 7px; max-height: 150px; overflow: auto; white-space: pre-wrap; word-break: break-word; border-radius: 6px; background: var(--card2); font: 10.5px var(--mono); color: var(--muted); }
  /* ── Flat completion report ──────────────────────────────────────────────
     The end-of-run report is a document, not a dashboard: no bordered card,
     just typography, spacing and hairline separators. Outcome first, then
     findings/changes/status, technical evidence collapsed by default. */
  .report-flat { padding: 14px 0 6px; margin: 16px 0 4px; border-top: 1px solid var(--border); }
  .report-flat .r-headline { display: flex; align-items: center; gap: 10px; }
  .report-flat h2 { margin: 0; font-size: 17px; }
  .report-flat .r-headline .tool-btn-copy { margin-left: auto; }
  .report-flat .r-lede { margin: 8px 0 0; font-size: 13.5px; line-height: 1.6; color: var(--text); }
  .report-flat .r-status { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 10px; font-size: 12.5px; color: var(--muted); }
  .report-flat .r-status b { color: var(--text); font-weight: 600; }
  .report-flat .r-sec { margin-top: 16px; }
  .report-flat .r-sec h4 { margin: 0 0 6px; font-size: 12.5px; font-weight: 650; color: var(--text); }
  .report-flat .r-sec ul { margin: 0; padding: 0; list-style: none; font-size: 12.5px; line-height: 1.55; }
  .report-flat .r-sec li { position: relative; padding-left: 16px; margin: 3px 0; }
  .report-flat .r-sec li::before { content: '\2022'; position: absolute; left: 4px; color: var(--faint); }
  .report-flat .r-files { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
  .report-flat .r-note { margin-top: 7px; font-size: 12px; color: var(--muted); }
  .report-flat .sec { margin-top: 14px; }
  .report-flat .sec h4 { margin: 0 0 6px; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); }
  .report-flat ul { margin: 0; padding-left: 18px; font-size: 12.5px; }
  .report-flat li { margin: 2px 0; }
  .report-flat .verify-list { display: grid; gap: 6px; }
  .report-flat .verify-row { border: 1px solid var(--border); border-radius: 8px; padding: 7px 9px; font-size: 12px; display: flex; gap: 7px; align-items: flex-start; flex-wrap: wrap; }
  .report-flat .verify-kind { color: var(--muted); font: 10.5px var(--mono); padding-top: 3px; }
  .report-flat .verify-label { flex: 1; min-width: 150px; line-height: 1.4; }
  .report-flat .verify-row details { width: 100%; color: var(--muted); font-size: 11px; }
  .report-flat .verify-row summary { cursor: pointer; width: fit-content; }
  .report-flat .verify-row pre { margin: 6px 0 0; padding: 7px; max-height: 150px; overflow: auto; white-space: pre-wrap; word-break: break-word; border-radius: 6px; background: var(--card2); font: 10.5px var(--mono); color: var(--muted); }

  @keyframes shimmer { 0% { background-position: -300px 0; } 100% { background-position: 300px 0; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  .working { display: flex; align-items: center; gap: 10px; padding: 12px 2px 12px 40px; }
  .working .spinner { width: 12px; height: 12px; border: 2px solid var(--border2); border-top-color: var(--run); border-radius: 50%; animation: spin .8s linear infinite; flex: none; }
  .working .shimmer { height: 9px; width: 120px; border-radius: 5px; background: linear-gradient(90deg, #161e2e 25%, #212b42 50%, #161e2e 75%); background-size: 600px 100%; animation: shimmer 1.3s linear infinite; flex: none; }
  .working .wtext { color: var(--muted); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .run-side { width: var(--rsw, 380px); flex: none; display: flex; flex-direction: column; min-height: 0; }
  .side-tabs { display: flex; gap: 4px; padding: 10px 14px 0; flex: none; }
  .side-tab { border: 1px solid transparent; background: none; color: var(--muted); border-radius: 8px 8px 0 0; padding: 6px 14px; font-size: 12.5px; }
  .side-tab.active { background: var(--card); border-color: var(--border); border-bottom-color: var(--card); color: var(--text); }
  .side-body { flex: 1; overflow-y: auto; background: var(--card); border-top: 1px solid var(--border); padding: 16px 18px; }
  .side-summary { border: 1px solid var(--border); background: var(--card2); border-radius: 10px; padding: 10px 11px; margin-bottom: 12px; }
  .side-summary .t { font-weight: 650; font-size: 12.5px; }
  .side-summary .d { color: var(--muted); font-size: 11.5px; margin-top: 3px; }
  .side-more { margin-top: 6px; color: var(--muted); font-size: 11.5px; }
  .side-more > summary { cursor: pointer; padding: 4px 0; }
  .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 18px; }
  .stat .k { font-size: 11px; color: var(--muted); margin-bottom: 2px; }
  .stat .v { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stat .v.mono { font-family: var(--mono); font-weight: 500; font-size: 12px; }
  .section-h { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); margin: 20px 0 8px; }
  .crit { display: flex; gap: 8px; padding: 5px 0; font-size: 12.5px; align-items: flex-start; }
  .crit .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex: none; background: var(--faint); }
  .crit.done .dot { background: var(--green); }
  .crit .ev-ids { font-family: var(--mono); font-size: 10.5px; color: var(--muted); }
  .step { display: flex; gap: 8px; padding: 4px 0; font-size: 12.5px; }
  .step .st { font-family: var(--mono); font-size: 10.5px; width: 76px; flex: none; color: var(--muted); padding-top: 1px; }
  .step .st.done { color: var(--green); } .step .st.failed, .step .st.blocked { color: var(--red); } .step .st.in_progress { color: var(--blue); }
  .bar { height: 6px; border-radius: 3px; background: var(--line); overflow: hidden; display: flex; margin: 8px 0 6px; }
  .bar span { height: 100%; }
  .legend { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 12px; font-size: 11px; color: var(--muted); }
  .legend i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; margin-right: 4px; }
  .tl-time { margin-left: auto; flex: none; align-self: flex-start; margin-top: 5px; color: var(--faint); font: 10px var(--mono); opacity: .8; }
  .raw { border: 1px solid var(--border); border-radius: 8px; margin-top: 8px; overflow: hidden; }
  .raw .row { display: flex; justify-content: space-between; gap: 10px; padding: 6px 10px; font-family: var(--mono); font-size: 11px; border-bottom: 1px solid var(--border); color: var(--muted); }
  .raw .row:last-child { border-bottom: 0; }
  .raw .row .t { color: var(--faint); flex: none; }
  .empty { color: var(--faint); font-size: 12.5px; padding: 4px 0; }

  .bottom-composer { border-top: 1px solid var(--border); padding: 10px 26px 14px; flex: none; background: linear-gradient(180deg, rgba(13,16,23,.72), var(--bg)); }
  .bottom-composer .composer { width: 100%; box-shadow: none; }

  .settings { position: fixed; inset: 0; background: var(--bg); z-index: 40; display: flex; }
  .setnav { width: 264px; border-right: 1px solid var(--border); padding: 16px 10px; overflow-y: auto; }
  .setnav .back { display: flex; gap: 8px; align-items: center; border: 0; background: none; color: var(--muted); font-size: 13px; padding: 6px 10px; border-radius: 8px; margin-bottom: 10px; }
  .setnav .back:hover { background: var(--hover); color: var(--text); }
  .setnav .item { display: flex; gap: 10px; align-items: center; padding: 8px 10px; border-radius: 8px; font-size: 13px; cursor: pointer; border: 0; background: none; width: 100%; text-align: left; color: var(--text); }
  .setnav .item:hover { background: var(--hover); }
  .setnav .item.active { background: rgba(143,128,255,.16); }
  .setnav .sect { font-size: 11px; color: var(--muted); margin: 14px 10px 4px; }
  .setbody { flex: 1; overflow-y: auto; padding: 34px 8vw; }
  .setbody h1 { font-size: 22px; font-weight: 600; margin: 0 0 20px; }
  .setbody h2 { font-size: 13px; font-weight: 600; margin: 26px 0 10px; }
  .setcard { background: var(--card); border: 1px solid var(--border); border-radius: 14px; }
  .setrow { display: flex; align-items: center; gap: 16px; padding: 14px 18px; border-bottom: 1px solid var(--border); }
  .setrow:last-child { border-bottom: 0; }
  .setrow .grow { flex: 1; }
  .setrow .t { font-weight: 600; font-size: 13px; }
  .setrow .d { color: var(--muted); font-size: 12px; margin-top: 2px; }
  .setrow select, .setrow input[type=text] { border: 1px solid var(--border2); border-radius: 8px; background: var(--card2); color: var(--text); padding: 6px 10px; font-size: 12.5px; }
  .prov-head { display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; padding: 3px 6px; margin: 0 -6px; border-radius: 8px; }
  .prov-head:hover { background: var(--hover); }
  .prov-chev { flex: none; color: var(--faint); font-size: 10px; transition: transform .15s ease; }
  .prov-open .prov-chev { transform: rotate(90deg); }
  .pm-wrap { position: relative; display: inline-block; }
  .pm-btn { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--border2); background: var(--card2); color: var(--text); border-radius: 8px; padding: 5px 11px; font-size: 12px; cursor: pointer; max-width: 360px; }
  .pm-btn:hover { border-color: var(--border2); }
  .pm-btn .pm-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pm-btn .caret { color: var(--muted); font-size: 9px; transition: transform .15s ease; }
  .pm-wrap.open .pm-btn { border-color: var(--accent); }
  .pm-wrap.open .caret { transform: rotate(180deg); }
  .pm-menu { width: 340px; left: 0; }
  .provider-toolbar { display: flex; align-items: center; gap: 10px; margin: 0 0 12px; }
  .provider-toolbar input { flex: 1; min-width: 160px; }
  .provider-toolbar .meta { color: var(--muted); font-size: 11.5px; white-space: nowrap; }
  .keysec { display: none; margin-top: 10px; align-items: center; gap: 6px; flex-wrap: wrap; }
  .keysec.show { display: flex; }
  .keysec .hint { width: 100%; color: var(--faint); font-size: 11px; }
  .model-item .mi-cur { color: var(--accent); font-weight: 700; flex: none; }
  .toggle { width: 38px; height: 22px; border-radius: 999px; background: #333d52; border: 0; position: relative; transition: background .15s; flex: none; }
  .toggle.on { background: var(--blue); }
  .toggle::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left .15s; }
  .toggle.on::after { left: 19px; }
  .setlist { padding: 10px 18px; }
  .setlist .row { display: flex; gap: 8px; align-items: center; padding: 6px 0; font-size: 12.5px; }
  .setlist .row .grow { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .setlist .x { color: var(--faint); cursor: pointer; border: 0; background: none; }
  .setlist .x:hover { color: var(--red); }
  .setlist input, .setlist textarea { width: 100%; border: 1px solid var(--border2); border-radius: 8px; background: var(--card2); color: var(--text); padding: 6px 9px; font-size: 12px; margin-bottom: 6px; }
  .setlist .meta { color: var(--muted); font-size: 11px; }
  .toasts { position: fixed; top: 16px; right: 16px; z-index: 100; display: flex; flex-direction: column; gap: 8px; }
  .toast { background: #1b2334; color: var(--text); border: 1px solid var(--border2); border-radius: 10px; padding: 10px 14px; font-size: 12.5px; max-width: 380px; box-shadow: 0 6px 24px rgba(0,0,0,.45); animation: tin .18s ease; white-space: pre-wrap; }
  .toast.err { background: rgba(255,100,101,.12); border-color: rgba(255,100,101,.4); color: #ffb3b4; }
  .toast-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
  .toast-actions button { background: none; border: 1px solid rgba(255,179,180,.4); color: #ffb3b4; border-radius: 6px; padding: 3px 10px; font-size: 11.5px; cursor: pointer; min-height: 24px; }
  .toast-actions button:hover { background: rgba(255,100,101,.15); }
  .welapsed { color: var(--faint); font-family: var(--mono); font-size: 10.5px; margin-left: 2px; }
  .working.slow { border-color: rgba(217,119,6,.55); }
  .working.slow .wtext { color: #fbbf24; }
  .working.slow .welapsed { color: #fbbf24; }
  @keyframes tin { from { transform: translateY(-6px); opacity: 0; } }
  .modal { position: fixed; inset: 0; background: rgba(4,6,10,.6); z-index: 60; display: flex; align-items: center; justify-content: center; }
  .modal .box { width: 580px; max-width: 94vw; max-height: 72vh; background: var(--card); border-radius: 14px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.3); }
  .modal .bar { display: flex; gap: 8px; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--border); }
  .modal .bar .crumb { flex: 1; font-family: var(--mono); font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .modal .list { flex: 1; overflow-y: auto; padding: 6px; }
  .modal .frow { display: flex; gap: 9px; align-items: center; padding: 7px 10px; border-radius: 8px; cursor: pointer; font-size: 13px; }
  .modal .frow:hover { background: var(--hover); }
  .modal .frow .ico { color: var(--muted); display: inline-flex; }
  .modal .foot { padding: 10px 14px; border-top: 1px solid var(--border); display: flex; gap: 8px; align-items: center; }
  .sb .navitem .ico, .sb .proj .ico, .setnav .item .ico, .sug .ico { display: inline-flex; align-items: center; color: var(--muted); }
  .sugs .sug .ico { display: flex; margin-bottom: 10px; }
  .setlist .x svg { width: 12px; height: 12px; }
  .ubtns { display: flex; gap: 6px; justify-content: flex-end; margin-top: 4px; opacity: 0; transition: opacity .12s; }
  div:hover > .ubtns, div:hover .ubtns { opacity: 1; }
  .ubtn { border: 1px solid var(--border2); background: var(--card2); color: var(--muted); border-radius: 6px; width: 28px; height: 26px; display: inline-flex; align-items: center; justify-content: center; }
  .ubtn:hover { color: var(--text); border-color: var(--border2); }
  .ubtn svg { width: 12px; height: 12px; }

  .shell.left-collapsed .sb { width: 44px; }
  .shell.left-collapsed .sb .scroll, .shell.left-collapsed .sb .foot,
  .shell.left-collapsed .sb .name, .shell.left-collapsed .sb .spacer,
  .shell.left-collapsed .sb #gearBtn { display: none; }
  .shell.left-collapsed .sb .head { padding: 14px 0 8px; justify-content: center; }
  .run-side .collapse-tab { margin-left: auto; border: 0; background: none; color: var(--muted); border-radius: 7px; width: 28px; height: 28px; align-self: center; font-size: 12px; }
  .run-side .collapse-tab:hover { background: var(--hover); color: var(--text); }
  .run-side .rail { display: none; flex-direction: column; align-items: center; padding-top: 10px; }
  .run-side .rail button { writing-mode: vertical-rl; border: 0; background: none; color: var(--muted); font-size: 11px; letter-spacing: 1.5px; padding: 12px 5px; border-radius: 7px; }
  .run-side .rail button:hover { background: var(--hover); color: var(--text); }
  .run.collapsed-side .run-side { width: 40px; }
  .run.collapsed-side .side-tabs, .run.collapsed-side .side-body { display: none; }
  .run.collapsed-side .run-side .rail { display: flex; }

  .vresize { width: 6px; flex: none; cursor: col-resize; margin: 0 -3px; z-index: 6; }
  .vresize:hover, .vresize.active { background: rgba(124, 108, 240, .35); }
  .shell.left-collapsed #sbResize, .run.collapsed-side #rsResize { display: none; }

  .abubble { max-width: 80%; background: var(--card); border: 1px solid var(--border2); border-radius: 12px; padding: 8px 12px; margin: 10px 0 10px 20px; font-size: 13px; white-space: pre-wrap; box-shadow: 0 1px 2px rgba(0,0,0,.25); }
  .abubble .who { display: block; color: var(--accent); font-size: 10.5px; font-weight: 600; margin-bottom: 2px; }
  .session-file { position: relative; max-width: 520px; margin: 9px 0 9px 20px; border: 1px solid var(--border2); border-radius: 12px; background: var(--card); padding: 10px 11px; display: flex; gap: 10px; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,.18); }
  .session-file.user { margin-left: auto; border-color: rgba(91,168,255,.34); background: rgba(91,168,255,.08); }
  .session-file .file-ico { width: 34px; height: 34px; flex: none; display: inline-flex; align-items: center; justify-content: center; color: var(--run); border: 1px solid var(--border); border-radius: 9px; background: var(--card2); }
  .session-file.user .file-ico { color: var(--blue); }
  .session-file .file-main { flex: 1; min-width: 0; }
  .session-file .file-name { color: var(--text); font-size: 12.5px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .session-file .file-meta { margin-top: 2px; color: var(--faint); font: 10.5px var(--mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .session-file .file-actions { display: flex; gap: 5px; align-items: center; flex: none; }
  .session-file .file-actions a { color: var(--muted); border: 1px solid var(--border); border-radius: 7px; padding: 4px 7px; font-size: 11px; text-decoration: none; }
  .session-file .file-actions a:hover { color: var(--text); border-color: var(--border2); background: var(--hover); }
  .session-file .file-preview { width: 48px; height: 48px; flex: none; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); background: var(--card2); }

  .shotmsg { margin: 10px 0 10px 20px; }
  .shotmsg img { display: block; max-width: 340px; width: 100%; border: 1px solid var(--border2); border-radius: 10px; background: var(--card2); box-shadow: 0 2px 10px rgba(0,0,0,.3); margin-top: 4px; }
  .browser-shot img { border-color: rgba(143,128,255,.45); }
  .browser-chat-highlight { display: flex; align-items: center; gap: 7px; width: fit-content; padding: 3px 8px; border-radius: 999px; color: #b7aaff; background: rgba(143,128,255,.14); font-size: 11px; }
  .browser-chat-highlight span { color: var(--accent); }
  .browser-highlight { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 12px; padding: 9px 10px; border: 1px solid rgba(143,128,255,.4); border-radius: 9px; background: rgba(143,128,255,.08); color: #cfc6ff; font-size: 12px; }
  .browser-highlight > div { display: flex; align-items: center; gap: 7px; }
  .browser-highlight b { font-size: 11px; letter-spacing: .7px; text-transform: uppercase; }
  .browser-highlight > span { color: var(--accent); font: 10.5px var(--mono); }

  .skcard { padding: 12px 16px; border-bottom: 1px solid var(--border); }
  .skcard:last-child { border-bottom: 0; }
  .skhead { display: flex; gap: 8px; align-items: center; font-size: 13px; }
  .skhead .meta { color: var(--faint); font-size: 11px; }
  .skdesc { color: var(--muted); font-size: 12.5px; margin-top: 3px; }
  .skinstr { font-family: var(--mono); font-size: 11.5px; background: var(--card2); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; margin-top: 8px; white-space: pre-wrap; max-height: 260px; overflow: auto; }

  .thumbs { display: flex; gap: 6px; padding: 8px 8px 0; flex-wrap: wrap; }
  .thumbs .th { position: relative; }
  .thumbs img { width: 52px; height: 52px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); display: block; }
  .thumbs .th-file { width: min(230px, 100%); height: 52px; display: flex; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: 8px; padding: 6px 26px 6px 8px; background: var(--card2); }
  .thumbs .th-file .th-ico { color: var(--run); flex: none; display: inline-flex; }
  .thumbs .th-file .th-info { min-width: 0; }
  .thumbs .th-file .th-name { display: block; color: var(--text); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .thumbs .th-file .th-size { display: block; color: var(--faint); font: 10px var(--mono); margin-top: 2px; }
  .thumbs .rm { position: absolute; top: -7px; right: -7px; width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--border2); background: var(--card2); color: var(--muted); font-size: 11px; display: flex; align-items: center; justify-content: center; padding: 0; }
  /* Invisible hit-area expansion so the small round button meets ~28px touch targets. */
  .thumbs .rm::after { content: ''; position: absolute; inset: -5px; border-radius: 50%; }
  .thumbs .rm:hover { color: var(--err); border-color: rgba(255,100,101,.4); }
  .pill[disabled] { opacity: .4; cursor: not-allowed; }

  .grow-row { display: flex; gap: 6px; align-items: center; padding: 3px 0; }
  .gitpath { font-family: var(--mono); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  .gitpath:hover { color: var(--accent); }

  .bpanel2 .nav { display: flex; gap: 6px; align-items: center; margin-bottom: 8px; }
  .bpanel2 .nav input { flex: 1; border: 1px solid var(--border2); border-radius: 8px; padding: 6px 9px; font-family: var(--mono); font-size: 12px; background: var(--card2); color: var(--text); min-width: 0; }
  .bpanel2 .bwrap { position: relative; }
  .bpanel2 .bwrap img { width: 100%; display: block; border: 1px solid var(--border); border-radius: 10px; background: var(--card2); min-height: 160px; object-fit: top left; }
  .bdrive { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); z-index: 6; display: flex; align-items: center; gap: 7px; background: var(--accent); color: #fff; border-radius: 999px; padding: 6px 14px; font-size: 12px; font-weight: 600; box-shadow: 0 4px 16px rgba(124,108,240,.5); animation: pulse 1.4s infinite; white-space: nowrap; }
  .bdrive svg { width: 13px; height: 13px; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: .01ms !important; }
  }
  /* Narrow windows: the right panel becomes a slide-in overlay instead of
     disappearing — Browser/Git/state must stay reachable, not vanish. */
  @media (max-width: 1080px) {
    .run-side { position: fixed; right: 0; top: 0; bottom: 0; width: min(430px, 94vw); transform: translateX(105%); transition: transform .16s ease; box-shadow: -14px 0 40px rgba(0,0,0,.5); z-index: 70; }
    .run-side.narrow-open { transform: none; }
    .side-fab { display: inline-flex; }
  }
  .side-fab { display: none; position: fixed; right: 16px; bottom: 18px; z-index: 71; border-radius: 999px; padding: 10px 15px; background: var(--accent); color: #fff; border: 0; font-weight: 600; font-size: 12.5px; box-shadow: 0 6px 20px rgba(0,0,0,.4); align-items: center; gap: 7px; cursor: pointer; }
  .side-fab svg { width: 14px; height: 14px; }
  @media (max-width: 1080px) { .side-fab { display: inline-flex; } }
  @media (max-width: 720px) {
    .shell { width: 100%; }
    .mobile-nav-btn { display: flex; align-items: center; gap: 9px; min-height: 46px; padding: 0 14px; border: 0; border-bottom: 1px solid var(--border); background: var(--bg); color: var(--text); font-weight: 700; letter-spacing: .8px; flex: none; }
    .mobile-nav-btn .hamb { color: var(--muted); font-size: 18px; }
    .mobile-backdrop { position: fixed; inset: 0; z-index: 79; border: 0; padding: 0; background: rgba(4,6,10,.66); }
    .shell.mobile-nav-open .mobile-backdrop { display: block; }
    .sb { position: fixed; inset: 0 auto 0 0; z-index: 80; width: min(320px, 88vw) !important; transform: translateX(-105%); transition: transform .18s ease; box-shadow: 14px 0 40px rgba(0,0,0,.48); }
    .shell.mobile-nav-open .sb { transform: none; }
    .shell.left-collapsed .sb { width: min(320px, 88vw) !important; }
    .shell.left-collapsed .sb .scroll, .shell.left-collapsed .sb .foot,
    .shell.left-collapsed .sb .name, .shell.left-collapsed .sb .spacer,
    .shell.left-collapsed .sb #gearBtn { display: flex; }
    .shell.left-collapsed .sb .head { padding: 14px 14px 8px; justify-content: flex-start; }
    #sbResize, #sbCollapse { display: none !important; }
    .main { width: 100%; min-width: 0; }
    .home { justify-content: flex-start; gap: 14px; padding: 26px 14px 20px; }
    .home h1 { width: 100%; text-align: left; font-size: 21px; line-height: 1.35; }
    .sugs { width: 100%; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .sug { min-width: 0; min-height: 92px; padding: 12px; }
    .composer { width: 100%; }
    .composer-bar { gap: 4px; padding-inline: 2px; }
    .composer-bar .pill, .composer-bar .send { min-height: 40px; }
    .control-prefix { display: none; }
    .model-control { max-width: calc(100% - 78px); }
    .model-pick .mp-label { max-width: 150px; }
    .model-menu { position: fixed; left: 12px; right: 12px; bottom: 72px; top: auto; width: auto; max-width: none; }
    .model-meta { display: none; }
    .bottom-composer { padding: 8px 10px 10px; }
    .stream { padding: 8px 12px 16px 10px; }
    .stream::before { left: 14px; }
    .progress { padding: 7px 12px 2px; }
    .progress #progMeta { display: none; }
    .run-overview { align-items: flex-start; padding: 10px 12px; flex-wrap: wrap; }
    .run-overview-main { flex-basis: calc(100% - 72px); }
    .run-overview-stats { order: 3; width: 100%; padding-left: 18px; }
    .run-overview .details-btn { margin-left: auto; }
    .run-side { width: min(430px, 100vw); }
    .side-fab { bottom: 116px; right: 10px; padding: 9px 12px; }
    .side-fab { display: none !important; }
    .settings { flex-direction: column; }
    .setnav { width: 100%; flex: none; display: flex; gap: 4px; align-items: center; padding: 8px; border-right: 0; border-bottom: 1px solid var(--border); overflow-x: auto; overflow-y: hidden; }
    .setnav .back { margin: 0 4px 0 0; flex: none; }
    .setnav .sect { display: none; }
    .setnav .item { width: auto; white-space: nowrap; flex: none; }
    .setbody { padding: 22px 14px 32px; }
    .setrow { align-items: flex-start; flex-direction: column; gap: 9px; }
    .setrow select, .setrow input[type=text] { width: 100%; }
    .provider-toolbar { align-items: stretch; flex-direction: column; }
    .modal .box { max-height: 88vh; }
    .toasts { left: 10px; right: 10px; top: 10px; }
    .toast { max-width: none; }
    #mascotWrap { display: none !important; }
  }
</style>
</head>
<body>
<div class="shell">
  <aside class="sb">
    <div class="head">
      <span class="name"><img class="brand-mark" src="/brand/agent-gitu-mark.svg" alt=""><span>AGENT GITU</span></span>
      <span class="spacer"></span>
      <button class="iconbtn" id="gearBtn" title="settings" aria-label="Open settings">&#9881;</button>
      <button class="iconbtn" id="sbCollapse" title="collapse sidebar" aria-label="Collapse sidebar">&#171;</button>
    </div>
    <div class="scroll" id="sbScroll"></div>
    <div class="bulkbar" id="bulkBar" hidden>
      <span id="bulkCount">0 selected</span>
      <button class="btn red" id="bulkDel">Delete</button>
      <button class="btn ghost" id="bulkDone">Done</button>
    </div>
    <div class="foot">
      <button type="button" class="chip project-chip" id="projChip">…</button>
    </div>
  </aside>
  <button type="button" class="mobile-backdrop" id="mobileBackdrop" aria-label="Close navigation"></button>
  <div class="vresize" id="sbResize"></div>
  <div class="main">
    <button type="button" class="mobile-nav-btn" id="mobileNav" aria-label="Open navigation" aria-expanded="false"><span class="hamb">&#9776;</span><span>AGENT GITU</span></button>
    <div class="topbar" id="topbar" style="display:none"></div>
    <div class="view" id="view"></div>
  </div>
</div>
<div class="settings" id="settings" hidden>
  <aside class="setnav" id="setnav"></aside>
  <div class="setbody" id="setbody"></div>
</div>
<div class="toasts" id="toasts" role="status" aria-live="polite"></div>
<div class="modal" id="browseModal" hidden>
  <div class="box">
    <div class="bar"><span style="font-weight:600;font-size:13px">Choose a project folder</span><span class="crumb" id="browseCrumb"></span></div>
    <div class="list" id="browseList"></div>
    <div class="foot"><span class="chip ok" id="browseProjChip" style="display:none">project detected</span><span style="flex:1"></span><button class="btn ghost" id="browseCancel">Cancel</button><button class="btn dark" id="browseUse">Use this folder</button></div>
  </div>
</div>
<script>
(function () {
  var S = {
    active: 'home', project: null, models: [], sessions: {}, es: null, poll: null, files: [],
    modelsLoaded: false,
    draft: '',
    sel: { wf: 'review', model: '', effort: 'high' },
    settings: { review: true, autoApprove: false, autoLearn: true, projectPath: '' },
    setSection: 'general',
    pendingFiles: []
  };
  try {
    var saved = JSON.parse(localStorage.getItem('hermes.settings') || 'null');
    if (saved) {
      if (saved.sel) for (var k in saved.sel) S.sel[k] = saved.sel[k];
      if (saved.settings) for (var k2 in saved.settings) S.settings[k2] = saved.settings[k2];
      if (typeof S.settings.scope === 'string') S.settings.scope = S.settings.scope.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      if (!Array.isArray(S.settings.scope)) S.settings.scope = [];
      S.draft = saved.draft || '';
    }
  } catch (e) {}
  function persist() {
    try { localStorage.setItem('hermes.settings', JSON.stringify({ sel: S.sel, settings: S.settings, draft: S.draft })); } catch (e) {}
  }
  function $(id) { return document.getElementById(id); }
  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function mascotState(mode) {
    if (window.__mascot) window.__mascot.setMode(mode);
    if (S.mascotTimer) clearTimeout(S.mascotTimer);
    S.mascotTimer = setTimeout(function () { if (window.__mascot) window.__mascot.setMode('idle'); }, 1800);
  }
  function mascotPulse() {
    mascotState('testing');
  }

  function toast(msg, isErr) {
    var wrap = $('toasts');
    if (!wrap) return;
    var text = String(msg == null ? '' : msg);
    // Raw HTML error pages / JSON dumps used to fill the whole toast box.
    if (text.length > 320) text = text.slice(0, 320) + '…';
    var t = document.createElement('div');
    t.className = 'toast' + (isErr ? ' err' : '');
    var body = document.createElement('div');
    body.className = 'toast-body';
    body.textContent = text;
    t.appendChild(body);
    if (isErr) {
      // Errors persist until dismissed and carry recovery affordances.
      var actions = document.createElement('div');
      actions.className = 'toast-actions';
      var copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy';
      copyBtn.onclick = function () { navigator.clipboard.writeText(String(msg)).catch(function () {}); copyBtn.textContent = 'Copied'; setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1200); };
      var dismiss = document.createElement('button');
      dismiss.textContent = 'Dismiss';
      dismiss.onclick = function () { t.remove(); };
      actions.appendChild(copyBtn);
      actions.appendChild(dismiss);
      t.appendChild(actions);
      wrap.appendChild(t);
      setTimeout(function () { t.remove(); }, 15000);
    } else {
      wrap.appendChild(t);
      setTimeout(function () { t.remove(); }, 4500);
    }
    // Keep at most four toasts on screen; drop the oldest.
    while (wrap.children.length > 4) wrap.removeChild(wrap.firstChild);
  }
  var SVG_OPEN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
  var ICONS = {
    gear: SVG_OPEN + '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    shield: SVG_OPEN + '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    folder: SVG_OPEN + '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    bolt: SVG_OPEN + '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    plug: SVG_OPEN + '<path d="M9 7V3"/><path d="M15 7V3"/><path d="M6 7h12v4a6 6 0 0 1-12 0V7z"/><path d="M12 17v4"/></svg>',
    clock: SVG_OPEN + '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
    pencil: SVG_OPEN + '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
    x: SVG_OPEN + '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
    back: SVG_OPEN + '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    search: SVG_OPEN + '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>',
    check: SVG_OPEN + '<polyline points="20 6 9 17 4 12"/></svg>',
    wrench: SVG_OPEN + '<path d="M14.7 6.3a4.5 4.5 0 0 0-6 6L3 18l3 3 5.7-5.7a4.5 4.5 0 0 0 6-6L14 13l-3-3 3.7-3.7z"/></svg>',
    retry: SVG_OPEN + '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    layers: SVG_OPEN + '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    image: SVG_OPEN + '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    copy: SVG_OPEN + '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    branch: SVG_OPEN + '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>',
    globe: SVG_OPEN + '<circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a13.5 13.5 0 0 1 0 18a13.5 13.5 0 0 1 0-18z"/></svg>',
    terminal: SVG_OPEN + '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
    file: SVG_OPEN + '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
    list: SVG_OPEN + '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    chevDown: SVG_OPEN + '<polyline points="6 9 12 15 18 9"/></svg>',
    chevRight: SVG_OPEN + '<polyline points="9 6 15 12 9 18"/></svg>'
  };
  var TOOL_ICONS = { edit: 'pencil', read: 'file', list: 'list', search: 'search', shell: 'terminal', browser: 'globe', tool: 'wrench' };
  function toolIconFor(kind) { return TOOL_ICONS[kind] || 'wrench'; }
  function icon(name) { return ICONS[name] || ''; }
  function api(path, opts) {
    return fetch(path, opts).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || String(r.status)); });
      return r.json();
    });
  }
  function titleCase(m) { return m.replace(/(^|[-.])([a-z])/g, function (a, sep, ch) { return sep + ch.toUpperCase(); }); }
  // Display-only model-name polish: family casing that titleCase cannot know.
  function prettyModelName(mid) { return titleCase(mid).replace(/Deepseek/gi, 'DeepSeek'); }
  function hhmm(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }); }
  function shortDate(iso) { var d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }); }
  function basename(p) { var parts = String(p).replace(/\\/g, '/').split('/'); return parts[parts.length - 1] || p; }
  function effectiveProjectPath() {
    return S.settings.projectPath || S.lastProjectPath || (S.project && S.project.repoRoot) || '';
  }
  function effectiveProjectName() {
    var path = effectiveProjectPath();
    return path ? basename(path) : 'no project selected';
  }
  function providerIsUsable(p) { return Boolean(p && (p.usable || p.hasKey || p.signedIn)); }
  function chipFor(status) {
    if (status === 'completed') return '<span class="chip ok">complete</span>';
    if (status === 'blocked') return '<span class="chip bad">blocked</span>';
    if (status === 'failed') return '<span class="chip bad">failed</span>';
    if (status === 'review') return '<span class="chip warn">awaiting review</span>';
    if (status === 'running') return '<span class="chip info">running</span>';
    return '<span class="chip">' + esc(status || 'idle') + '</span>';
  }
  // A "running" session may actually be BLOCKED ON THE USER: approval,
  // questions, or plan review. Surfacing that state is critical — it is the
  // difference between an agent working and an agent silently waiting.
  function waitingFor(s) {
    if (!s) return null;
    if (s.pendingPlanReview) return 'plan review';
    if (s.pendingQuestions) return 'your answer';
    if (s.pendingConnection) return 'secure connection setup';
    if (s.pendingApprovals && s.pendingApprovals.length) return 'approval';
    return null;
  }
  function hasAnyProviderKey() {
    return (S.models || []).some(providerIsUsable);
  }
  function ensureUsableModelSelection() {
    var current = String(S.sel.model || '');
    var found = false;
    (S.models || []).forEach(function (p) {
      if (!providerIsUsable(p)) return;
      (p.models || []).forEach(function (m) { if (current === p.id + '::' + m.id) found = true; });
    });
    if (found) return;
    var firstProvider = (S.models || []).filter(providerIsUsable)[0];
    if (!firstProvider) { S.sel.model = ''; return; }
    var firstModel = (firstProvider.models || []).filter(function (m) { return m.id === firstProvider.defaultModel; })[0] || firstProvider.models[0];
    S.sel.model = firstModel ? firstProvider.id + '::' + firstModel.id : '';
    persist();
  }
  var TITLE_BASE = 'Agent Gitu';
  function updateTitle() {
    var anyWait = false;
    Object.keys(S.sessions || {}).forEach(function (id) {
      if (waitingFor(S.sessions[id] && S.sessions[id].session)) anyWait = true;
    });
    document.title = (anyWait ? '⏸ ' : '') + TITLE_BASE;
  }

  function renderSidebar() {
    api('/api/runs').then(function (sessions) {
      var byProj = {};
      var projPath = {};
      sessions.forEach(function (s) {
        var p = s.project || effectiveProjectName();
        (byProj[p] = byProj[p] || []).push(s);
        if (s.projectPath && !projPath[p]) projPath[p] = s.projectPath;
      });
      var activePath = effectiveProjectPath();
      var html = '<button class="newbtn" id="sbNew" title="starts in: ' + esc(activePath || 'choose a project first') + '">' + icon('pencil') + ' New session <span style="opacity:.6;font-weight:500;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">· ' + esc(effectiveProjectName()) + '</span></button>' +
        '<button class="newbtn" id="sbNewProject" style="background:none;border:1px dashed var(--border2)">' + icon('folder') + ' New project</button>' +
        '<button class="navitem" data-set="cron"><span class="ico">' + icon('clock') + '</span>Scheduled</button>' +
        '<button class="navitem" data-set="skills"><span class="ico">' + icon('bolt') + '</span>Skills</button>' +
        '<button class="navitem" data-set="mcp"><span class="ico">' + icon('plug') + '</span>MCP servers</button>' +
        '<button class="navitem" data-set="workspace"><span class="ico">' + icon('folder') + '</span>Workspace</button>' +
        '<div class="sect" style="display:flex;align-items:center">Projects<span style="flex:1"></span><button class="ubtn" id="sbManage" title="select multiple to delete" style="display:inline-flex">' + (S.manage ? icon('check') : icon('pencil')) + '</button></div>';
      var names = Object.keys(byProj);
      if (!names.length) html += '<div class="empty" style="padding-left:10px">No chats yet</div>';
      if (!S.settings.collapsedProj) S.settings.collapsedProj = {};
      var collapsed = S.settings.collapsedProj;
      names.forEach(function (p) {
        var hasActive = byProj[p].some(function (s) { return s.runId === S.active; });
        var isCol = !S.manage && collapsed[p] === true && !hasActive;
        if (S.manage) {
          html += '<label class="proj"><input type="checkbox" class="chk" data-selproj="' + esc(p) + '"' + (S.selProj && S.selProj[p] ? ' checked' : '') + '><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p) + '</span></label>';
        } else {
          // Visually mark WHICH project new sessions will land in.
          var isActive = projPath[p] && projPath[p] === activePath;
          html += '<div class="proj' + (isActive ? ' activeproj' : '') + '" data-proj="' + esc(p) + '" role="button" tabindex="0" aria-current="' + (isActive ? 'true' : 'false') + '" title="' + (isActive ? 'active project for new sessions' : 'set as active project for new sessions') + '">' +
            '<button class="ubtn" data-collapse="' + esc(p) + '" title="' + (isCol ? 'expand sessions' : 'collapse sessions') + '" style="display:inline-flex;padding:2px;margin-right:2px">' + icon(isCol ? 'chevRight' : 'chevDown') + '</button>' +
            '<span class="ico">' + icon('folder') + '</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p) + '</span>' +
            (isActive ? '<span class="chip" style="margin-right:6px;background:rgba(143,128,255,.14);color:#cfc6ff">active</span>' : '') +
            (isCol ? '<span class="chip" style="margin-right:6px">' + byProj[p].length + '</span>' : '') +
            '<button class="delx" data-delproj="' + esc(p) + '" title="delete project and its sessions">' + icon('x') + '</button></div>';
        }
        if (!isCol) {
          if (!S.moreProjects) S.moreProjects = {};
          var expanded = S.moreProjects[p] === true;
          var visible = expanded ? 200 : 8;
          byProj[p].slice(0, S.manage ? 200 : visible).forEach(function (s) {
            var wf = waitingFor(s);
            if (S.manage) {
              html += '<label class="chat"><input type="checkbox" class="chk" data-selrun="' + esc(s.runId) + '"' + (S.selRuns && S.selRuns[s.runId] ? ' checked' : '') + '><span class="dot ' + esc(s.status) + '"></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(s.goal.slice(0, 34)) + '</span></label>';
            } else {
              html += '<button class="chat ' + (S.active === s.runId ? 'active' : '') + '" data-run="' + esc(s.runId) + '" title="' + esc(s.goal) + (wf ? '\n⏸ waiting for you — ' + wf : '') + '">' +
                '<span class="dot ' + (wf ? 'waiting' : esc(s.status)) + '"></span><span class="chat-label">' + esc(s.goal) + '</span>' +
                '<span class="rowdel" data-delrun="' + esc(s.runId) + '" title="delete this session" role="button" tabindex="0" aria-label="Delete session">' + icon('x') + '</span></button>';
            }
          });
          // Silent truncation used to hide older sessions forever.
          if (!S.manage && !expanded && byProj[p].length > 8) {
            html += '<button class="more-row" data-more="' + esc(p) + '">Show ' + (byProj[p].length - 8) + ' older sessions…</button>';
          } else if (!S.manage && expanded && byProj[p].length > 8) {
            html += '<button class="more-row" data-less="' + esc(p) + '">Show fewer</button>';
          }
        }
      });
      $('sbScroll').innerHTML = html;
      updateTitle();
      $('sbNew').onclick = function () { openHome(); };
      $('sbNewProject').onclick = newProject;
      var byId = {};
      sessions.forEach(function (s) { byId[s.runId] = s; });
      $('sbScroll').querySelectorAll('[data-run]').forEach(function (el) {
        el.onclick = function (e) {
          if (e.target && e.target.closest && e.target.closest('.rowdel')) return;
          var s = byId[el.getAttribute('data-run')];
          if (s && s.projectPath) S.lastProjectPath = s.projectPath;
          openRun(el.getAttribute('data-run'), { chatish: s && s.mode === 'chat', mode: s && s.mode });
          toggleMobileNav(false);
        };
      });
      // Two-click arm/confirm session delete: first click arms (red "sure?"),
      // second click within 2.5s deletes. No native confirm dialogs.
      $('sbScroll').querySelectorAll('[data-delrun]').forEach(function (el) {
        el.onclick = function (e) {
          e.stopPropagation();
          var id = el.getAttribute('data-delrun');
          if (!el.classList.contains('armed')) {
            el.classList.add('armed');
            setTimeout(function () { el.classList.remove('armed'); }, 2500);
            return;
          }
          el.closest('.chat').style.opacity = '.4';
          api('/api/runs/' + id, { method: 'DELETE' })
            .then(function () { renderSidebar(); if (S.active === id) openHome(); })
            .catch(function (er) { renderSidebar(); toast(er.message, true); });
        };
        el.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); el.click(); } };
      });
      $('sbScroll').querySelectorAll('[data-more],[data-less]').forEach(function (el) {
        el.onclick = function () {
          var p = el.getAttribute('data-more') || el.getAttribute('data-less');
          S.moreProjects[p] = el.getAttribute('data-more') ? true : false;
          renderSidebar();
        };
      });
      $('sbScroll').querySelectorAll('[data-proj]').forEach(function (el) {
        el.onclick = function () {
          var n = el.getAttribute('data-proj');
          if (projPath[n]) {
            S.settings.projectPath = projPath[n];
            S.lastProjectPath = projPath[n];
            persist();
            updateProjChip();
            toast('Active project: ' + n);
            toggleMobileNav(false);
            if (S.active === 'home') openHome();
          }
        };
        el.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } };
      });
      $('sbScroll').querySelectorAll('[data-set]').forEach(function (el) {
        el.onclick = function () { toggleMobileNav(false); openSettings(el.getAttribute('data-set')); };
      });
      $('sbScroll').querySelectorAll('[data-delproj]').forEach(function (el) {
        el.onclick = function (e) {
          e.stopPropagation();
          deleteProjectFlow(el.getAttribute('data-delproj'), projPath[el.getAttribute('data-delproj')]);
        };
      });
      $('sbScroll').querySelectorAll('[data-collapse]').forEach(function (el) {
        el.onclick = function (e) {
          e.stopPropagation();
          var n = el.getAttribute('data-collapse');
          if (collapsed[n]) delete collapsed[n]; else collapsed[n] = true;
          persist();
          renderSidebar();
        };
      });
      if ($('sbManage')) $('sbManage').onclick = function () { S.manage = !S.manage; S.selProj = {}; S.selRuns = {}; renderSidebar(); };
      $('sbScroll').querySelectorAll('[data-selproj]').forEach(function (el) {
        el.onchange = function () { var n = el.getAttribute('data-selproj'); if (el.checked) S.selProj[n] = projPath[n] || ''; else delete S.selProj[n]; updateBulk(); };
      });
      $('sbScroll').querySelectorAll('[data-selrun]').forEach(function (el) {
        el.onchange = function () { var id = el.getAttribute('data-selrun'); if (el.checked) S.selRuns[id] = true; else delete S.selRuns[id]; updateBulk(); };
      });
      updateBulk();
    }).catch(function () {});
    api('/api/cron').then(function (d) { S.cronCount = (d.jobs || []).length; }).catch(function () {});
  }

  function updateProjChip() {
    var name = effectiveProjectName();
    $('projChip').textContent = ' ' + name;
    $('projChip').title = effectiveProjectPath() ? 'Active project: ' + effectiveProjectPath() + ' — click to change' : 'Choose a project folder';
  }

  function newProject() {
    var modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = '<div class="box" style="width:460px"><div class="bar"><span style="font-weight:600;font-size:13px">New project</span></div>' +
      '<div style="padding:14px 16px">' +
      '<input id="npName" placeholder="project name (e.g. my-app)" style="width:100%;border:1px solid var(--border2);border-radius:8px;background:var(--card2);color:var(--text);padding:8px 10px" autofocus>' +
      '<div id="npWhere" style="margin-top:8px;color:var(--muted);font-size:12px">Created under the Agent Gitu Projects folder.</div>' +
      '</div>' +
      '<div class="foot"><span style="flex:1"></span><button class="btn ghost" id="npCancel">Cancel</button><button class="btn dark" id="npGo">Create project</button></div></div>';
    document.body.appendChild(modal);
    api('/api/home').then(function (h) { var w = $('npWhere'); if (w) w.innerHTML = 'Created under <span style="font-family:var(--mono)">' + esc(h.projectsPath) + '</span>'; }).catch(function () {});
    var create = function () {
      var name = $('npName').value.trim();
      if (!name) { $('npName').focus(); return; }
      api('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name }) })
        .then(function (d) {
          modal.remove();
          S.settings.projectPath = d.path;
          persist();
          updateProjChip();
          renderSidebar();
          toast('Project created at ' + d.path);
          openHome();
        })
        .catch(function (e) { toast(e.message, true); });
    };
    modal.querySelector('#npCancel').onclick = function () { modal.remove(); };
    modal.querySelector('#npGo').onclick = create;
    modal.querySelector('#npName').addEventListener('keydown', function (e) { if (e.key === 'Enter') create(); });
    setTimeout(function () { var n = $('npName'); if (n) n.focus(); }, 0);
  }

  function updateBulk() {
    var bar = $('bulkBar');
    if (!bar) return;
    bar.hidden = !S.manage;
    var np = Object.keys(S.selProj || {}).length;
    var nr = Object.keys(S.selRuns || {}).length;
    var c = $('bulkCount');
    if (c) c.textContent = np + ' project(s), ' + nr + ' session(s) selected';
  }

  function bulkDelete() {
    var projs = Object.keys(S.selProj || {});
    var runs = Object.keys(S.selRuns || {});
    if (!projs.length && !runs.length) { toast('Nothing selected', true); return; }
    var go = function (deleteFiles) {
      var chain = Promise.resolve();
      projs.forEach(function (p) {
        chain = chain.then(function () {
          return api('/api/projects', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: p, path: S.selProj[p] || undefined, deleteFiles: deleteFiles }) }).catch(function (e) { toast(e.message, true); });
        });
      });
      if (runs.length) {
        chain = chain.then(function () {
          return api('/api/runs/delete-many', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: runs }) }).catch(function (e) { toast(e.message, true); });
        });
      }
      chain.then(function () {
        var goneActive = runs.indexOf(S.active) >= 0;
        S.selProj = {}; S.selRuns = {}; S.manage = false;
        if (goneActive) openHome();
        renderSidebar();
        toast('Deleted ' + projs.length + ' project(s), ' + runs.length + ' session(s)');
      });
    };
    if (projs.length) {
      var modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = '<div class="box" style="width:460px"><div class="bar"><span style="font-weight:600;font-size:13px">Delete selection</span></div>' +
        '<div style="padding:14px 16px;font-size:13px">Delete <b>' + projs.length + '</b> project(s) and <b>' + runs.length + '</b> session(s)?' +
        '<label style="display:flex;gap:8px;margin-top:10px;font-size:12.5px;cursor:pointer"><input type="checkbox" id="bdFiles" style="margin:2px 0 0;width:auto"> Also delete the project folders (only folders inside Agent Gitu Projects are removed)</label>' +
        '<div style="margin-top:8px;color:var(--muted);font-size:12px">This cannot be undone.</div></div>' +
        '<div class="foot"><span style="flex:1"></span><button class="btn ghost" id="bdCancel">Cancel</button><button class="btn red" id="bdGo">Delete</button></div></div>';
      document.body.appendChild(modal);
      modal.querySelector('#bdCancel').onclick = function () { modal.remove(); };
      modal.querySelector('#bdGo').onclick = function () { var df = modal.querySelector('#bdFiles').checked; modal.remove(); go(df); };
    } else {
      if (!confirm('Delete ' + runs.length + ' session(s)?')) return;
      go(false);
    }
  }

  function deleteProjectFlow(name, path) {
    var modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = '<div class="box" style="width:460px"><div class="bar"><span style="font-weight:600;font-size:13px">Delete project</span></div>' +
      '<div style="padding:14px 16px;font-size:13px">Delete <b>' + esc(name) + '</b> and all of its sessions?' +
      (path ? '<label style="display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-size:12.5px;cursor:pointer"><input type="checkbox" id="dpFiles" style="margin:2px 0 0;width:auto"> <span>Also delete the project folder<br><span style="color:var(--muted);font-family:var(--mono);font-size:11px">' + esc(path) + '</span></span></label>' : '') +
      '<div style="margin-top:10px;color:var(--muted);font-size:12px">Sessions are removed permanently. This cannot be undone.</div></div>' +
      '<div class="foot"><span style="flex:1"></span><button class="btn ghost" id="dpCancel">Cancel</button><button class="btn red" id="dpGo">Delete</button></div></div>';
    document.body.appendChild(modal);
    modal.querySelector('#dpCancel').onclick = function () { modal.remove(); };
    modal.querySelector('#dpGo').onclick = function () {
      var cb = modal.querySelector('#dpFiles');
      var del = cb ? cb.checked : false;
      api('/api/projects', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name, path: path, deleteFiles: del }) })
        .then(function (d) {
          modal.remove();
          toast('Project deleted' + (d.removedSessions ? ' — ' + d.removedSessions + ' session(s) removed' : ''));
          var sess = S.sessions[S.active];
          if (sess && sess.session && (sess.session.project === name || (path && sess.session.projectPath === path))) openHome();
          renderSidebar();
        })
        .catch(function (e) { toast(e.message, true); });
    };
  }

  function renderTopbar() {
    // The old goal-title strip (title + status chips + Stop) was removed:
    // the goal lives in the sidebar/progress, and Stop now lives on the
    // composer's send button (Send ⇄ Stop). The bar stays hidden.
    var tb = $('topbar');
    if (tb) tb.style.display = 'none';
    updateTitle();
    updateSendState();
  }

  // The composer send button doubles as STOP while the agent is running —
  // one button, context-aware, always where your hand already is.
  function updateSendState() {
    var b = $('send2');
    if (!b) return;
    var sess = S.sessions[S.active];
    var s = sess && sess.session;
    var running = Boolean(s && s.status === 'running');
    var waiting = waitingFor(s);
    // Typing yields the button back to Send so you can queue a follow-up.
    var f = $('follow');
    var typing = Boolean((f && f.value.trim()) || S.pendingFiles.length);
    var stopMode = running && !typing;
    b.classList.toggle('stop', stopMode);
    b.title = stopMode ? 'Stop the agent' : 'send (Enter)';
    b.setAttribute('aria-label', stopMode ? 'Stop the agent' : 'Send message');
    b.innerHTML = stopMode ? '&#9632;' : '&#8593;';
    // Surface interrupts right above the composer where action happens.
    var bar = b.parentElement;
    if (bar) {
      var chip = bar.querySelector('#wfChip');
      if (waiting) {
        if (!chip) {
          chip = document.createElement('span');
          chip.id = 'wfChip';
          chip.className = 'chip warn';
          bar.insertBefore(chip, bar.firstChild);
        }
        chip.textContent = '⏸ waiting for you — ' + waiting;
        chip.title = 'the agent is blocked and needs your input in the stream';
      } else if (chip) chip.remove();
    }
  }

  function stopStreams() { if (S.es) { S.es.close(); S.es = null; } if (S.poll) { clearInterval(S.poll); S.poll = null; } }

  function openHome() {
    S.active = 'home';
    S.supersedeNext = null;
    toggleMobileNav(false);
    if ($('sideFab')) $('sideFab').hidden = true;
    stopStreams();
    stopBrowserPoll();
    renderSidebar();
    renderTopbar();
    var effProj = effectiveProjectPath();
    var name = effectiveProjectName();
    var keyless = S.modelsLoaded && !hasAnyProviderKey();
    var heading = effProj
      ? 'What should we work on in <span class="u">' + esc(name) + '</span>?'
      : 'What should we work on?';
    var homeCopy = effProj
      ? 'Describe the outcome you want. Gitu will plan, make changes, and show the evidence behind every result.'
      : 'Choose a project, then describe the outcome you want. Gitu will keep the work scoped and evidence-backed.';
    $('view').innerHTML =
      '<div class="home">' +
      '<div class="home-intro"><div class="home-eyebrow">Ready when you are</div><h1>' + heading + '</h1><p class="home-copy">' + homeCopy + '</p></div>' +
      (keyless
        ? '<button class="setup-card" id="keylessCta" style="cursor:pointer;width:100%;text-align:left;display:block;margin:0 auto 8px;max-width:760px">' +
          '<h3 style="margin:0 0 4px">Connect a model provider</h3>' +
          '<div class="meta-line">Choose a provider and add a key to start your first task.</div><span class="setup-action">Open provider settings →</span></button>'
      : '') +
      '<div class="sugs">' +
      '<button class="sug" data-sug="Explore and understand the codebase"><span class="ico" style="color:var(--run)">' + icon('search') + '</span><span class="sug-title">Explore the codebase</span><span class="sug-hint">Map the architecture and find the right starting point.</span></button>' +
      '<button class="sug" data-sug="Build a new feature, app, or tool"><span class="ico" style="color:var(--accent)">' + icon('bolt') + '</span><span class="sug-title">Build something new</span><span class="sug-hint">Turn an idea into a planned, verified change.</span></button>' +
      '<button class="sug" data-sug="Review the code and suggest changes"><span class="ico" style="color:var(--ok)">' + icon('layers') + '</span><span class="sug-title">Review the code</span><span class="sug-hint">Check quality, risks, and practical next improvements.</span></button>' +
      '<button class="sug" data-sug="Fix issues and failures"><span class="ico" style="color:var(--err)">' + icon('wrench') + '</span><span class="sug-title">Fix an issue</span><span class="sug-hint">Investigate a failure and verify the repair.</span></button>' +
      '</div>' +
      '<div class="composer"><textarea id="goal" rows="1" placeholder="Ask Agent Gitu to complete a task…"></textarea>' +
      '<div class="thumbs" id="thumbs" hidden></div>' +
      '<div class="composer-bar"><button type="button" class="pill control-pill" id="homeProj" title="active project for this session — click to change" style="max-width:190px"><span class="control-prefix">Project</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + icon('folder') + ' ' + esc(name) + '</span></button>' + controlsHtml() + '<button class="send" id="send" title="Start task" aria-label="Start task"' + (S.modelsLoaded && hasAnyProviderKey() ? '' : ' disabled') + '>&#8593;</button></div></div>' +
      '</div>';
    var ta = $('goal');
    ta.value = S.draft;
    ta.addEventListener('input', function () { S.draft = ta.value; persist(); ta.style.height = 'auto'; ta.style.height = Math.min(180, ta.scrollHeight) + 'px'; });
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); startRun(); } });
    $('view').querySelectorAll('[data-sug]').forEach(function (el) {
      el.onclick = function () { ta.value = el.getAttribute('data-sug'); S.draft = ta.value; persist(); ta.focus(); };
    });
    bindControls();
    bindPaste('goal');
    $('send').onclick = startRun;
    $('homeProj').onclick = openFolderBrowser;
    var kcta = $('keylessCta');
    if (kcta) kcta.onclick = function () { openSettings('providers'); };
  }

  function isFreeModelId(id) {
    id = String(id || '');
    return /-free$/i.test(id) || /:free$/i.test(id) || id === 'big-pickle';
  }

  function modelInfo(value) {
    var parts = String(value || '').split('::');
    var pid = parts[0], mid = parts[1];
    for (var i = 0; i < S.models.length; i++) {
      var p = S.models[i];
      if (p.id !== pid) continue;
      for (var j = 0; j < p.models.length; j++) if (p.models[j].id === mid) return p.models[j];
    }
    return null;
  }
  function formatTokens(n) {
    if (typeof n !== 'number') return '';
    if (n >= 1000000) return (Math.round(n / 100000) / 10) + 'M';
    return Math.round(n / 1000) + 'K';
  }
  function formatPrice(n) {
    if (typeof n !== 'number') return '';
    if (n === 0) return 'free';
    if (n < 0.01) return '$' + n.toFixed(4);
    if (n < 1) return '$' + n.toFixed(2);
    return '$' + (Math.round(n * 100) / 100).toFixed(2);
  }
  function modelMetaText(model) {
    if (!model) return 'limits and pricing unavailable';
    var meta = model.metadata || {};
    var parts = [];
    if (meta.contextTokens) parts.push(formatTokens(meta.contextTokens) + ' context');
    if (typeof meta.inputPricePerMillion === 'number' && typeof meta.outputPricePerMillion === 'number') {
      parts.push(formatPrice(meta.inputPricePerMillion) + ' in / ' + formatPrice(meta.outputPricePerMillion) + ' out per 1M');
    } else if (model.free) {
      parts.push('free');
    }
    return parts.length ? parts.join(' · ') : 'limits and pricing unavailable';
  }
  function updateModelMeta() {
    var el = $('modelMeta');
    if (!el) return;
    var m = modelInfo(S.sel.model);
    el.textContent = m ? 'ⓘ' : '';
    el.title = modelMetaText(m);
    el.setAttribute('aria-label', m ? 'Model details: ' + modelMetaText(m) : 'Model details unavailable');
  }

  function modelOptionsHtml() {
    var out = '';
    S.models.forEach(function (p) {
      if (!providerIsUsable(p)) return;
      var defaultInfo = null;
      for (var d = 0; d < p.models.length; d++) if (p.models[d].id === p.defaultModel) defaultInfo = p.models[d];
      out += '<option value="' + esc(p.id + '::' + p.defaultModel) + '">' + esc(p.id + ' / ' + titleCase(p.defaultModel)) + (isFreeModelId(p.defaultModel) ? ' (free)' : '') + (defaultInfo ? ' — ' + esc(modelMetaText(defaultInfo)) : '') + '</option>';
      p.models.forEach(function (m) {
        if (m.id === p.defaultModel) return;
        out += '<option value="' + esc(p.id + '::' + m.id) + '">' + esc(p.id + ' / ' + titleCase(m.id)) + (m.free ? ' (free)' : '') + ' — ' + esc(modelMetaText(m)) + '</option>';
      });
    });
    return out;
  }
  function modelLabelText(value) {
    var parts = String(value || '').split('::');
    var pid = parts[0], mid = parts[1];
    for (var i = 0; i < S.models.length; i++) {
      var p = S.models[i];
      if (p.id !== pid) continue;
      for (var j = 0; j < p.models.length; j++) {
        if (p.models[j].id !== mid) continue;
        return p.id + ' / ' + prettyModelName(mid) + (p.models[j].free ? ' (free)' : '');
      }
      return p.id + ' / ' + prettyModelName(mid);
    }
    return String(value || '');
  }
  function syncModelLabel() {
    var lab = $('modelLabel');
    var model = $('model');
    var text = model ? modelLabelText(model.value) : '';
    if (lab) lab.textContent = text || (S.modelsLoaded ? 'Choose model' : 'Loading models…');
    var pick = $('modelPick');
    if (pick) {
      pick.title = text ? 'Model: ' + text : 'Choose model';
      pick.setAttribute('aria-label', pick.title);
    }
  }
  // What the model search box matches against: provider, ids, human name,
  // context size and capability flags — deliberately NOT prices, so the filter
  // input never references or depends on cost.
  function modelSearchText(p, m) {
    var meta = m.metadata || {};
    var parts = [p.id, m.id, titleCase(m.id)];
    if (meta.contextTokens) parts.push(formatTokens(meta.contextTokens) + ' context');
    if (m.free) parts.push('free');
    if (m.vision) parts.push('vision images');
    return parts.join(' ').toLowerCase();
  }
  // Highlight the first occurrence of the (already lower-cased) query inside
  // text, keeping the original casing of the rendered string.
  function markMatch(text, q) {
    if (!q) return esc(text);
    var idx = String(text).toLowerCase().indexOf(q);
    if (idx < 0) return esc(text);
    return esc(text.slice(0, idx)) + '<mark>' + esc(text.slice(idx, idx + q.length)) + '</mark>' + esc(text.slice(idx + q.length));
  }
  function modelMenuGroups(query) {
    var q = String(query || '').toLowerCase().trim();
    var out = [];
    S.models.forEach(function (p) {
      if (!providerIsUsable(p)) return;
      var matched = [];
      p.models.forEach(function (m) {
        if (q && modelSearchText(p, m).indexOf(q) < 0) return;
        matched.push(m);
      });
      if (matched.length) out.push({ p: p, models: matched });
    });
    return out;
  }
  function renderModelMenu(query) {
    var list = $('modelList');
    if (!list) return;
    var q = String(query || '').toLowerCase().trim();
    var groups = modelMenuGroups(query);
    var cur = $('model') ? $('model').value : '';
    var total = groups.reduce(function (n, g) { return n + g.models.length; }, 0);
    var count = $('modelCount');
    if (count) count.textContent = total + (total === 1 ? ' model' : ' models') + (q ? (total === 1 ? ' matches' : ' match') : '');
    if (!groups.length) {
      list.innerHTML = '<div class="model-empty">No models match &ldquo;' + esc(query || '') + '&rdquo;<br><span style="font-size:11px">Try a provider or model name</span></div>';
      return;
    }
    var html = '';
    groups.forEach(function (g) {
      html += '<div class="model-sec" title="' + esc(g.p.label || g.p.id) + '">' + esc(g.p.label || g.p.id) + '</div>';
      g.models.forEach(function (m) {
        var val = g.p.id + '::' + m.id;
        html += '<button type="button" class="model-item' + (val === cur ? ' cur' : '') + '" data-val="' + esc(val) + '" role="option" aria-selected="' + (val === cur ? 'true' : 'false') + '">' +
          '<div class="mi-top"><span class="mi-prov">' + markMatch(g.p.id, q) + '</span>' +
          '<span class="mi-meta">' + esc(modelMetaText(m)) + '</span></div>' +
          '<div class="mi-name">' + markMatch(titleCase(m.id), q) + (m.vision ? ' <i class="vmark" title="supports images">&#9672;</i>' : '') + '</div>' +
          '</button>';
      });
    });
    list.innerHTML = html;
    var first = list.querySelector('.model-item');
    if (first) first.classList.add('hl');
  }
  function modelMenuMove(dir) {
    var items = $('modelList') ? $('modelList').querySelectorAll('.model-item') : [];
    if (!items.length) return;
    var cur = -1;
    for (var i = 0; i < items.length; i++) if (items[i].classList.contains('hl')) { cur = i; break; }
    var next = cur < 0 ? (dir > 0 ? 0 : items.length - 1) : (cur + dir + items.length) % items.length;
    if (cur >= 0) items[cur].classList.remove('hl');
    items[next].classList.add('hl');
    if (items[next].scrollIntoView) items[next].scrollIntoView({ block: 'nearest' });
  }
  function pickModel(val) {
    var model = $('model');
    if (!model || !val) return;
    model.value = val;
    model.dispatchEvent(new Event('change'));
    syncModelLabel();
    closeModelMenu();
  }
  function openModelMenu() {
    var menu = $('modelMenu'), pick = $('modelPick'), filter = $('modelFilter');
    if (!menu || !pick) return;
    menu.hidden = false;
    pick.classList.add('open');
    pick.setAttribute('aria-expanded', 'true');
    if (filter) {
      filter.value = '';
      renderModelMenu('');
      setTimeout(function () { filter.focus(); }, 0);
    } else renderModelMenu('');
  }
  function closeModelMenu() {
    var menu = $('modelMenu'), pick = $('modelPick');
    if (menu) menu.hidden = true;
    if (pick) pick.classList.remove('open');
    if (pick) pick.setAttribute('aria-expanded', 'false');
  }
  function bindModelMenu() {
    var pick = $('modelPick'), filter = $('modelFilter'), menu = $('modelMenu');
    if (!pick || !menu) return;
    pick.onclick = function () {
      if (menu.hidden) openModelMenu(); else closeModelMenu();
    };
    if (filter) {
      filter.oninput = function () { renderModelMenu(filter.value); };
      filter.onkeydown = function (e) {
        if (e.key === 'Enter') {
          var hl = $('modelList').querySelector('.model-item.hl') || $('modelList').querySelector('.model-item');
          if (hl) pickModel(hl.getAttribute('data-val'));
          e.preventDefault();
        } else if (e.key === 'ArrowDown') { modelMenuMove(1); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { modelMenuMove(-1); e.preventDefault(); }
        else if (e.key === 'Escape') { closeModelMenu(); }
        e.stopPropagation();
      };
    }
    if ($('modelList')) $('modelList').onmousedown = function (e) {
      var item = e.target.closest ? e.target.closest('.model-item') : null;
      if (item) { e.preventDefault(); pickModel(item.getAttribute('data-val')); }
    };
    if (!S.modelMenuDocBound) {
      S.modelMenuDocBound = true;
      document.addEventListener('click', function (e) {
        var p = $('modelPick');
        if (p && !e.target.closest('.model-control')) closeModelMenu();
      });
    }
  }
  function provOf(v) { return v.split('::')[0]; }
  function effortLevelsFor(pid) {
    for (var i = 0; i < S.models.length; i++) if (S.models[i].id === pid) return S.models[i].effortLevels || ['low', 'medium', 'high', 'max'];
    return ['low', 'medium', 'high', 'max'];
  }
  function effortMaxHint(pid) {
    for (var i = 0; i < S.models.length; i++) if (S.models[i].id === pid) return S.models[i].maxEffort || 'collapses-to-high';
    return 'collapses-to-high';
  }
  function effortLabel(pid, level) {
    for (var i = 0; i < S.models.length; i++) {
      if (S.models[i].id !== pid) continue;
      return (S.models[i].effortLabels && S.models[i].effortLabels[level]) || level;
    }
    return level;
  }
  function fillEffort(id, pid) {
    var el = $(id);
    if (!el) return;
    var collapses = effortMaxHint(pid) === 'collapses-to-high';
    el.innerHTML = effortLevelsFor(pid).map(function (l) {
      var label = l === 'max' && collapses ? 'max (= high)' : effortLabel(pid, l);
      return '<option value="' + l + '">' + esc(label) + '</option>';
    }).join('');
  }
  function controlsHtml() {
    return '<label class="pill control-pill"><span class="control-prefix">Mode</span><select id="wf" aria-label="Workflow mode"><option value="review">Plan</option><option value="auto">Build</option><option value="chat">Chat</option></select><span class="caret">&#9662;</span></label>' +
      '<span class="model-control"><select id="model" hidden>' + modelOptionsHtml() + '</select><button type="button" class="pill control-pill model-pick" id="modelPick" title="Choose model" aria-haspopup="listbox" aria-expanded="false"' + (S.modelsLoaded && hasAnyProviderKey() ? '' : ' disabled') + '><span class="control-prefix">Model</span><span class="mp-label" id="modelLabel">' + (S.modelsLoaded ? 'Choose model' : 'Loading models…') + '</span><span class="caret">&#9662;</span></button>' +
      '<div class="model-menu" id="modelMenu" hidden><input id="modelFilter" placeholder="Search models…" aria-label="Search models" autocomplete="off" spellcheck="false"><div class="model-list" id="modelList" role="listbox"></div><div class="model-count" id="modelCount"></div></div></span><span class="model-meta" id="modelMeta"></span>' +
      '<label class="pill control-pill" title="Reasoning effort"><span class="control-prefix">Effort</span><select id="effort" aria-label="Reasoning effort"></select><span class="caret">&#9662;</span></label>' +
      '<button type="button" class="pill" id="attachBtn" title="Attach files or documents" aria-label="Attach files or documents">' + icon('file') + '</button>' +
      '<input type="file" id="attachInput" multiple hidden>';
  }
  function currentVision() {
    var parts = String(S.sel.model || '').split('::');
    var pid = parts[0], mid = parts[1];
    for (var i = 0; i < S.models.length; i++) {
      var p = S.models[i];
      if (p.id !== pid) continue;
      for (var j = 0; j < p.models.length; j++) if (p.models[j].id === mid) return Boolean(p.models[j].vision);
      for (var k = 0; k < p.models.length; k++) if (p.models[k].id === p.defaultModel) return Boolean(p.models[k].vision);
      return true;
    }
    return true;
  }
  function renderThumbs() {
    var wrap = $('thumbs');
    if (!wrap) return;
    if (!S.pendingFiles.length) { wrap.hidden = true; wrap.innerHTML = ''; updateSendState(); return; }
    wrap.hidden = false;
    wrap.innerHTML = S.pendingFiles.map(function (file, i) {
      var isImage = String(file.type || '').indexOf('image/') === 0;
      var content = isImage
        ? '<img src="' + file.dataUrl + '" alt="' + esc(file.name) + '" title="' + esc(file.name) + '">'
        : '<span class="th-ico">' + icon('file') + '</span><span class="th-info"><span class="th-name" title="' + esc(file.name) + '">' + esc(file.name) + '</span><span class="th-size">' + humanBytes(file.size) + '</span></span>';
      return '<span class="th' + (isImage ? '' : ' th-file') + '">' + content + '<button class="rm" data-rm="' + i + '" title="Remove attachment" aria-label="Remove ' + esc(file.name) + '">&#10005;</button></span>';
    }).join('');
    wrap.querySelectorAll('[data-rm]').forEach(function (el) {
      el.onclick = function () { S.pendingFiles.splice(Number(el.getAttribute('data-rm')), 1); renderThumbs(); };
    });
    updateSendState();
  }
  var MAX_PENDING_FILES = 8;
  var MAX_PENDING_FILE_BYTES = 8 * 1024 * 1024;
  var MAX_PENDING_TOTAL_BYTES = 20 * 1024 * 1024;
  function humanBytes(value) {
    var n = Math.max(0, Number(value) || 0);
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }
  function dataUrlBytes(dataUrl) {
    var comma = String(dataUrl || '').indexOf(',');
    if (comma < 0) return 0;
    return Math.max(0, Math.floor((dataUrl.length - comma - 1) * 3 / 4));
  }
  function pendingFileBytes() {
    return S.pendingFiles.reduce(function (sum, file) { return sum + (Number(file.size) || dataUrlBytes(file.dataUrl)); }, 0);
  }
  function addPendingFile(file, dataUrl) {
    if (S.pendingFiles.length >= MAX_PENDING_FILES) { toast('Maximum 8 files per message', true); return; }
    var size = Number(file.size) || dataUrlBytes(dataUrl);
    if (size > MAX_PENDING_FILE_BYTES) { toast(file.name + ' is larger than 8 MB', true); return; }
    if (pendingFileBytes() + size > MAX_PENDING_TOTAL_BYTES) { toast('Attachments exceed the 20 MB combined limit', true); return; }
    S.pendingFiles.push({ name: file.name || 'attachment', type: file.type || 'application/octet-stream', size: size, dataUrl: dataUrl });
    renderThumbs();
  }
  function downscaleImage(dataUrl, cb) {
    var img = new Image();
    img.onload = function () {
      var max = 1280;
      var scale = Math.min(1, max / Math.max(img.width, img.height));
      if (scale === 1 && dataUrl.length < 700000) { cb(dataUrl); return; }
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      try { cb(c.toDataURL('image/jpeg', 0.85)); } catch (e) { cb(dataUrl); }
    };
    img.onerror = function () { cb(dataUrl); };
    img.src = dataUrl;
  }
  function bindPaste(id) {
    var ta = $(id);
    if (!ta || ta.dataset.pasteBound) return;
    ta.dataset.pasteBound = '1';
    ta.addEventListener('paste', function (e) {
      var cd = e.clipboardData || window.clipboardData;
      if (!cd || !cd.items) return;
      for (var i = 0; i < cd.items.length; i++) {
        var it = cd.items[i];
        if (it.type && it.type.indexOf('image/') === 0) {
          var file = it.getAsFile();
          if (!file) continue;
          e.preventDefault();
          var reader = new FileReader();
          reader.onload = function () {
            downscaleImage(String(reader.result), function (final) {
              addPendingFile({ name: file.name || 'pasted-image.png', type: file.type || 'image/png', size: dataUrlBytes(final) }, final);
              toast('Image pasted — it will be sent with your next message');
            });
          };
          reader.readAsDataURL(file);
        }
      }
    });
  }

  function onAttachFiles(files) {
    Array.prototype.slice.call(files).forEach(function (f) {
      if (S.pendingFiles.length >= MAX_PENDING_FILES) { toast('Maximum 8 files per message', true); return; }
      if (f.size > MAX_PENDING_FILE_BYTES) { toast(f.name + ' is larger than 8 MB', true); return; }
      if (pendingFileBytes() + f.size > MAX_PENDING_TOTAL_BYTES) { toast('Attachments exceed the 20 MB combined limit', true); return; }
      var reader = new FileReader();
      reader.onload = function () {
        var original = String(reader.result);
        if (f.type && f.type.indexOf('image/') === 0) {
          downscaleImage(original, function (final) { addPendingFile(f, final); });
        } else addPendingFile(f, original);
      };
      reader.readAsDataURL(f);
    });
  }
  function bindControls() {
    var wf = $('wf'), model = $('model'), effort = $('effort');
    if (wf) wf.value = S.sel.wf;
    if (model) { if (S.sel.model) model.value = S.sel.model; if (!model.value && model.options.length) model.value = model.options[0].value; S.sel.model = model.value; }
    fillEffort('effort', provOf(S.sel.model));
    if (effort) effort.value = S.sel.effort;
    if (wf) wf.onchange = function () { S.sel.wf = wf.value; persist(); };
    if (model) model.onchange = function () {
      S.sel.model = model.value;
      var activeSession = S.sessions[S.active];
      if (activeSession) activeSession.modelOverride = true;
      fillEffort('effort', provOf(model.value)); persist(); updateAttachState(); updateModelMeta();
    };
    if (effort) effort.onchange = function () { S.sel.effort = effort.value; persist(); };
    var attach = $('attachBtn'), input = $('attachInput');
    if (attach) attach.onclick = function () { if (!attach.hasAttribute('disabled') && input) input.click(); };
    if (input) input.onchange = function () { onAttachFiles(input.files); input.value = ''; };
    updateAttachState();
    updateModelMeta();
    renderThumbs();
    syncModelLabel();
    bindModelMenu();
  }
  function updateAttachState() {
    var attach = $('attachBtn');
    if (!attach) return;
    var vision = currentVision();
    attach.removeAttribute('disabled');
    attach.title = vision ? 'Attach files, documents, or images' : 'Attach files or documents (this model cannot inspect image pixels)';
  }

  function startRun() {
    if (S.starting) return;
    var goal = $('goal') ? $('goal').value.trim() : '';
    if (!goal && S.pendingFiles.length) goal = 'Please review the attached file or document.';
    if (!goal) { if ($('goal')) $('goal').focus(); return; }
    if (!S.modelsLoaded) { toast('Models are still loading — try again in a moment'); return; }
    // First-run funnel: a keyless install can only produce a failing run.
    // Gate it behind provider setup with a one-click path instead.
    if (!hasAnyProviderKey() || !S.sel.model) {
      toast('Connect a model provider first — opening Providers', true);
      openSettings('providers');
      return;
    }
    S.starting = true;
    var sendBtns = [$('send'), $('send2')];
    sendBtns.forEach(function (b) { if (b) b.disabled = true; });
    var unlock = function () {
      S.starting = false;
      sendBtns.forEach(function (b) { if (b) b.disabled = false; });
    };
    var mc = (S.sel.model || '').split('::');
    // Workflow is an explicit user choice.  Guessing from a short prompt was
    // able to turn an unfinished task into a conversation and hide its state.
    var chatish = S.sel.wf === 'chat';
    api('/api/runs', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        goal: goal, provider: mc[0], model: mc[1],
        mode: chatish ? 'chat' : 'standard',
        review: S.sel.wf === 'review' ? S.settings.review : false,
        autoApprove: S.settings.autoApprove,
        autoLearn: S.settings.autoLearn,
        effort: S.sel.effort,
        projectPath: effectiveProjectPath() || undefined,
        scope: S.settings.scope || [],
        constraints: (S.settings.constraints || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean),
        files: S.pendingFiles.length ? S.pendingFiles : undefined
      })
    }).then(function (r) {
      unlock();
      S.draft = ''; persist();
      S.pendingFiles = [];
      openRun(r.runId, { chatish: chatish, goal: goal });
      renderSidebar();
    }, function (e) {
      unlock();
      toast('Failed to start: ' + e.message, true);
    });
  }

  function openRun(runId, opts) {
    S.active = runId;
    S.supersedeNext = null;
    toggleMobileNav(false);
    if ($('sideFab')) $('sideFab').hidden = false;
    stopStreams();
    var sess = S.sessions[runId] || (S.sessions[runId] = { events: [], ledger: null, session: null, side: 'state', nodes: {} });
    sess.nodes = {};
    sess.justOpened = true;
    if (opts && opts.chatish !== undefined) sess.chatish = opts.chatish;
    // Reflect the session's real mode in the workflow dropdown so changing it
    // and sending is an explicit switch (chat -> plan/build, or the reverse).
    if (opts && opts.mode) S.sel.wf = opts.mode === 'chat' ? 'chat' : opts.mode === 'fast' ? 'auto' : 'review';
    renderSidebar();
    renderTopbar();
    $('view').innerHTML =
      '<div class="run"><div class="run-main">' +
      '<div class="run-overview" id="runOverview"><div class="run-overview-main"><span class="run-overview-dot" id="runOverviewDot"></span><div style="min-width:0"><div class="run-overview-next" id="runOverviewNext">Connecting to task state</div></div></div><div class="run-overview-stats" id="runOverviewStats"></div><button type="button" class="details-btn" id="overviewPanel">Details</button></div>' +
      '<div class="progress" id="progress" style="display:none"><span class="plabel" id="progText"></span><div class="pbar"><span id="progFill"></span></div><span class="plabel" id="progMeta"></span></div>' +
      '<div class="stream" id="stream"></div>' +
      '<div class="bottom-composer"><div class="composer"><textarea id="follow" rows="1" placeholder="Message Agent Gitu…" title="Enter sends to this session while working, or continues it when done"></textarea>' +
      '<div class="thumbs" id="thumbs" hidden></div>' +
      '<div class="composer-bar">' + controlsHtml() + '<button class="send" id="send2" aria-label="Send message">&#8593;</button></div></div></div>' +
      '</div>' +
      '<div class="vresize" id="rsResize"></div>' +
      '<aside class="run-side"><div class="side-tabs" id="sideTabs"></div><div class="side-body" id="sideBody"></div>' +
      '<div class="rail"><button id="rsExpand" title="expand panel">PANEL &#171;</button></div></aside></div>';
    renderSideTabs(sess, runId);
    $('overviewPanel').onclick = showRunPanel;
    $('rsExpand').onclick = function () { S.settings.rightCollapsed = false; persist(); applyLayout(); };
    bindResize('rsResize', 'right');
    applyLayout();
  $('follow').addEventListener('keydown', function (e) {
    // Shift+Enter inserts a newline, same as the home composer — the
    // auto-grow textarea exists precisely for multi-line follow-ups.
    if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();
      var g = $('follow').value.trim();
      if (!g && S.pendingFiles.length) g = 'Please review the attached file or document.';
      if (!g) return;
      sendFollow(g);
    });
  // Typing flips the button to Send even while the agent is running.
  $('follow').addEventListener('input', function () { this.style.height = 'auto'; this.style.height = Math.min(180, this.scrollHeight) + 'px'; updateSendState(); });
    $('send2').onclick = function () {
      // Branch on the button's CURRENT mode (Stop ■ vs Send ↑): while the
      // agent runs, typing flips it to Send so a click queues the message.
      var b = $('send2');
      if (b && b.classList.contains('stop')) {
        if (b) { b.disabled = true; setTimeout(function () { if (b) b.disabled = false; }, 1200); }
        api('/api/runs/' + S.active + '/stop', { method: 'POST' })
          .then(function () { toast('Stop requested — finishing the current step…'); })
          .catch(function (e) { toast(e.message, true); });
        return;
      }
      $('follow').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    };
    updateSendState();
    bindControls();
    bindPaste('follow');
    var replayEvents = sess.events;
    if (replayEvents.length > MAX_REPLAY_EVENTS) {
      var hiddenCount = replayEvents.length - MAX_REPLAY_EVENTS;
      var historyNote = document.createElement('div');
      historyNote.className = 'timeline-trim-note';
      historyNote.textContent = hiddenCount + ' earlier event' + (hiddenCount === 1 ? '' : 's') + ' are preserved in session history. Showing the latest activity.';
      $('stream').appendChild(historyNote);
      replayEvents = replayEvents.slice(-MAX_REPLAY_EVENTS);
    }
    replayEvents.forEach(function (ev) { appendEvent(runId, ev); });
    sess.lastIndex = sess.events.length ? sess.events[sess.events.length - 1].i : -1;
    var w = document.createElement('div');
    w.className = 'working'; w.id = 'working';
    w.setAttribute('role', 'status');
    w.setAttribute('aria-live', 'polite');
    w.innerHTML = '<span class="spinner"></span><span class="shimmer"></span><span class="wtext" id="workingText">Connecting…</span><span class="welapsed" id="workingElapsed"></span>';
    $('stream').appendChild(w);
    setWorking('Thinking…');
    renderRunSide(runId);
    connect(runId);
    pollRun(runId);
    S.poll = setInterval(function () { pollRun(runId); }, 1500);
  }

  function connect(runId) {
    stopStreams();
    var es = new EventSource('/api/runs/' + runId + '/stream');
    S.es = es;
    es.onmessage = function (msg) {
      var ev = JSON.parse(msg.data);
      var sess = S.sessions[runId];
      if (!sess) return;
      // Stream is alive again: clear any reconnecting state.
      S.esFailures = 0;
      if (S.reconnecting) {
        S.reconnecting = false;
        setWorking(sess.session && sess.session.status === 'running' ? 'Thinking…' : null);
      }
      if (sess.lastIndex == null) sess.lastIndex = -1;
      if (ev.i > sess.lastIndex) {
        sess.lastIndex = ev.i;
        sess.events.push(ev);
        appendEvent(runId, ev);
        if (sess.session && sess.session.status !== 'running') setWorking(null);
      }
    };
    // A dead socket previously left "Thinking…" on screen forever. Back off
    // and reconnect; the poller keeps backfilling events meanwhile.
    es.onerror = function () {
      var sess = S.sessions[runId];
      try { es.close(); } catch (e) {}
      if (S.es === es) S.es = null;
      if (!sess || S.active !== runId) return;
      if (sess.session && sess.session.status && sess.session.status !== 'running') return;
      S.esFailures = (S.esFailures || 0) + 1;
      S.reconnecting = true;
      setWorking('Connection lost — reconnecting…');
      var delay = Math.min(10000, 1000 * S.esFailures);
      setTimeout(function () {
        var s2 = S.sessions[runId];
        if (!s2 || S.active !== runId || S.es) return;
        if (s2.session && s2.session.status !== 'running') { setWorking(null); S.reconnecting = false; return; }
        connect(runId);
      }, delay);
    };
  }

  function userBubble(text, runId) {
    var div = document.createElement('div');
    div.className = 'usermsg';
    div.style.cssText = 'display:flex;justify-content:flex-end;margin:10px 0;';
    div.setAttribute('data-ubtext', text);
    div.innerHTML = '<div style="max-width:75%;background:rgba(91,168,255,.1);border:1px solid rgba(91,168,255,.32);border-radius:12px;padding:8px 12px;font-size:13px;white-space:pre-wrap">' +
      '<span style="color:var(--blue);font-size:10.5px;display:block;margin-bottom:2px">you</span>' + esc(text) +
      '<div class="ubtns"><button class="ubtn" title="edit and resend" data-ub="edit">' + icon('pencil') + '</button>' +
      '<button class="ubtn" title="retry" data-ub="retry">' + icon('retry') + '</button>' + '</div></div>';
    div.querySelector('[data-ub="edit"]').onclick = function () {
      var f = $('follow') || $('goal');
      if (f) { f.value = text; f.focus(); }
      S.supersedeNext = text;
    };
    div.querySelector('[data-ub="retry"]').onclick = function () {
      var sess = S.sessions[runId || S.active];
      var running = sess && sess.session && sess.session.status === 'running';
      if (running) { sendFollow(text); return; }
      div.remove();
      sendFollow(text, text);
    };
    return div;
  }

  function safeRunFileUrl(value) {
    var url = String(value || '');
    return url.indexOf('/api/runs/') === 0 ? url : '';
  }

  function sessionFileCard(meta) {
    var card = document.createElement('div');
    var kind = meta && meta.kind === 'user' ? 'user' : 'assistant';
    card.className = 'session-file ' + kind;
    card.setAttribute('data-file-id', String((meta && meta.id) || ''));

    var previewUrl = safeRunFileUrl(meta && meta.previewUrl);
    var downloadUrl = safeRunFileUrl(meta && meta.downloadUrl);
    var mime = String((meta && meta.mime) || 'application/octet-stream');
    if (previewUrl && mime.indexOf('image/') === 0) {
      var preview = document.createElement('img');
      preview.className = 'file-preview';
      preview.alt = '';
      preview.src = previewUrl;
      card.appendChild(preview);
    } else {
      var fileIcon = document.createElement('span');
      fileIcon.className = 'file-ico';
      fileIcon.innerHTML = icon('file');
      card.appendChild(fileIcon);
    }

    var main = document.createElement('span');
    main.className = 'file-main';
    var name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = String((meta && meta.name) || 'attachment');
    name.title = name.textContent;
    var detail = document.createElement('span');
    detail.className = 'file-meta';
    detail.textContent = (kind === 'user' ? 'you attached' : 'Agent Gitu created') + ' · ' + mime + ' · ' + humanBytes(meta && meta.size);
    main.appendChild(name);
    main.appendChild(detail);
    card.appendChild(main);

    var actions = document.createElement('span');
    actions.className = 'file-actions';
    if (previewUrl) {
      var open = document.createElement('a');
      open.href = previewUrl;
      open.target = '_blank';
      open.rel = 'noopener';
      open.textContent = 'Open';
      actions.appendChild(open);
    }
    if (downloadUrl) {
      var download = document.createElement('a');
      download.href = downloadUrl;
      download.download = name.textContent;
      download.textContent = 'Download';
      actions.appendChild(download);
    }
    card.appendChild(actions);
    return card;
  }

  function removeNarrationReplacedByFile(sess) {
    if (!sess || !sess.nodes) return;
    var live = sess.nodes.abubble || sess.nodes.thought;
    if (live && live.parentNode) live.parentNode.removeChild(live);
    sess.nodes.abubble = null;
    sess.nodes.thought = null;
  }

  function removeUserBubble(runId, text) {
    var stream = $('stream');
    if (!stream) return;
    var target = null;
    stream.querySelectorAll('div[data-ubtext]').forEach(function (b) {
      if (b.getAttribute('data-ubtext') === text) target = b;
    });
    if (target) target.remove();
  }

  function nearBottom(el) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < 400;
  }
  // Chase the bottom ONLY when the user is already reading the tail — never
  // yank someone who scrolled up to re-read. Force=true for action-required
  // content (approvals, failures) where attention matters more than position.
  function stickScroll(stream, force) {
    if (!stream) return;
    if (force || nearBottom(stream)) stream.scrollTop = stream.scrollHeight;
  }
  var MAX_REPLAY_EVENTS = 240;
  var MAX_TIMELINE_NODES = 220;
  function trimTimeline(stream) {
    if (!stream) return;
    var nodes = Array.prototype.slice.call(stream.children).filter(function (el) {
      return el.classList.contains('tl-row') || el.classList.contains('shotmsg') || el.classList.contains('abubble') || el.classList.contains('session-file') || el.classList.contains('intake-line');
    });
    if (nodes.length <= MAX_TIMELINE_NODES) return;
    var removeCount = nodes.length - MAX_TIMELINE_NODES;
    for (var i = 0; i < removeCount; i++) nodes[i].remove();
    var total = Number(stream.dataset.trimmed || '0') + removeCount;
    stream.dataset.trimmed = String(total);
    var note = stream.querySelector('.timeline-trim-note');
    if (!note) {
      note = document.createElement('div');
      note.className = 'timeline-trim-note';
      stream.insertBefore(note, stream.firstChild);
    }
    note.textContent = total + ' older activity item' + (total === 1 ? '' : 's') + ' hidden for performance. Full history remains stored.';
  }
  function appendLive(stream, el) {
    var w = $('working');
    var stick = nearBottom(stream);
    if (w) stream.insertBefore(el, w); else stream.appendChild(el);
    trimTimeline(stream);
    if (stick) stream.scrollTop = stream.scrollHeight;
  }

  function sendFollow(text, supersede) {
    var runId = S.active;
    var sess = S.sessions[runId];
    var sup = supersede || S.supersedeNext || undefined;
    S.supersedeNext = null;
    var running = sess && sess.session && sess.session.status === 'running';
    if (sup && running) sup = undefined;
    if (sup) removeUserBubble(runId, sup);
    if (sess && sess.session && sess.session.status !== 'running') {
      // A continuation cannot change the kind of its existing session.  In
      // particular, "continue" must not make a failed standard task look like
      // a chat session and hide its ledger/transcript.
      sess.chatish = sess.session.mode === 'chat';
      renderRunSide(runId);
    }
    var attached = S.pendingFiles.length ? S.pendingFiles : undefined;
    var mc = (S.sel.model || '').split('::');
    var useSelectedModel = Boolean(sess && (sess.modelOverride || !sess.session || !sess.session.provider || !sess.session.model));
    // Show the outgoing message immediately. The server will replace this
    // pending display with its durable user-msg event once it is recorded.
    appendPendingUserMessage(runId, text);
    var follow = $('follow');
    if (follow) follow.value = '';
    var send2 = $('send2');
    if (send2) send2.disabled = true;
    // Textarea cleared: if the agent is still running the button reverts to Stop.
    updateSendState();
    api('/api/runs/' + runId + '/message', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      text: text, files: attached,
      provider: useSelectedModel ? mc[0] : undefined, model: useSelectedModel ? mc[1] : undefined, useSelectedModel: useSelectedModel,
      // The workflow dropdown drives continuations too: an explicit selection
      // switches an existing session's mode (chat <-> plan/build).
      mode: S.sel.wf === 'chat' ? 'chat' : 'standard',
      review: S.sel.wf === 'review' ? S.settings.review : false,
      supersede: sup,
      autoApprove: S.settings.autoApprove
    }) })
      .then(function () {
        S.pendingFiles = [];
        renderThumbs();
        setWorking('Thinking…');
        // Terminal sessions intentionally close their SSE stream. A follow-up
        // starts the same session again, so reopen it here; polling only
        // refreshes status/ledger and cannot carry live tdelta prose events.
        if (!S.es) connect(runId);
        if (!S.poll) S.poll = setInterval(function () { pollRun(runId); }, 1500);
      })
      .catch(function (er) {
        var msg = String(er.message);
        if (msg.indexOf('run not found') >= 0) {
          var mc = (S.sel.model || '').split('::');
          api('/api/runs', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              goal: text, provider: mc[0], model: mc[1],
              mode: S.sel.wf === 'chat' ? 'chat' : 'standard',
              review: S.sel.wf === 'review' ? S.settings.review : false,
              autoApprove: S.settings.autoApprove,
              autoLearn: S.settings.autoLearn,
              effort: S.sel.effort,
              projectPath: effectiveProjectPath() || undefined,
              files: attached
            })
          }).then(function (r) { openRun(r.runId, { chatish: r.mode === 'chat' }); }).catch(function (e2) { failUserBubble(runId, text, e2.message); toast(e2.message, true); });
        } else {
          failUserBubble(runId, text, msg);
          toast(msg, true);
        }
      })
      .then(function () { var b = $('send2'); if (b) b.disabled = false; });
  }

  function appendPendingUserMessage(runId, text) {
    var stream = $('stream');
    var sess = S.sessions[runId];
    if (!stream || !sess) return;
    if (!sess.pendingUserMessages) sess.pendingUserMessages = [];
    sess.pendingUserMessages.push(text);
    retireAbubble(sess);
    closeThought(runId);
    appendLive(stream, userBubble(text, runId));
    stickScroll(stream, true);
  }

  // A failed send previously left an optimistic bubble that looked DELIVERED
  // (cleanup ran only on the success path). Mark it failed, surface the
  // reason inline, and offer one-click retry.
  function failUserBubble(runId, text, errMsg) {
    var stream = $('stream');
    var sess = S.sessions[runId];
    if (!stream || !sess) return;
    if (sess.pendingUserMessages) {
      var idx = sess.pendingUserMessages.indexOf(text);
      if (idx >= 0) sess.pendingUserMessages.splice(idx, 1);
    }
    var target = null;
    stream.querySelectorAll('div[data-ubtext]').forEach(function (b) {
      if (b.getAttribute('data-ubtext') === text) target = b;
    });
    if (!target) { toast(errMsg || 'send failed', true); return; }
    if (target.querySelector('.sendfail')) return;
    target.classList.add('failed');
    var row = document.createElement('div');
    row.className = 'sendfail';
    row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:6px;color:var(--err);font-size:11.5px';
    var msgSpan = document.createElement('span');
    msgSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px';
    msgSpan.textContent = String(errMsg || 'send failed').slice(0, 160);
    var btn = document.createElement('button');
    btn.className = 'btn ghost';
    btn.style.cssText = 'padding:3px 10px;font-size:11.5px';
    btn.innerHTML = icon('retry') + ' Retry';
    btn.onclick = function () {
      target.remove();
      sendFollow(text);
    };
    row.appendChild(msgSpan);
    row.appendChild(btn);
    target.querySelector(':scope > div').appendChild(row);
    stickScroll(stream, true);
  }

  function closeThought(runId) {
    var sess = S.sessions[runId];
    var node = sess.nodes.thought;
    if (node) {
      var c = node.querySelector('.caret'); if (c) c.remove();
      dedupeNarration(sess, node, 'lastThoughtText');
      finalizeNarration(node);
      sess.nodes.thought = null;
    }
  }
  // ── Narration finalization ─────────────────────────────────────────────
  // While a thought streams it is raw text; when it closes we decide how it
  // should be read: plain sentence(s), structured headline+checklist for
  // dense verification reports, or a collapsed disclosure if the model
  // leaked its raw JSON action object into prose (truncated-output retry).
  var DENSE_MIN_CHARS = 320;
  // Matches a raw JSON action object prefix whether or not the stream cut
  // off before the closing quote: '{"thought"…', '{"thought' (truncated),
  // and the escaped '{\"thought\"' variants.
  var JSON_LEAK_RE = /^\{\s*\\?"thought/;
  var JSON_LEAK_MARKERS = ['{"thought', '{\\"thought'];
  function stripJsonLeak(t) {
    var cut = -1;
    for (var i = 0; i < JSON_LEAK_MARKERS.length; i++) {
      var at = t.indexOf(JSON_LEAK_MARKERS[i]);
      if (at >= 0 && (cut < 0 || at < cut)) cut = at;
    }
    if (cut < 0) return t;
    return t.slice(0, cut).replace(/[\s,;·—-]+$/, '');
  }
  function sentencesOf(text) {
    var out = [], cur = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      cur += ch;
      if ((ch === '.' || ch === '!' || ch === '?') && (i + 1 >= text.length || text.charAt(i + 1) === ' ')) {
        out.push(cur.trim()); cur = '';
      }
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  var EVIDENCE_RE = /(\u2713|confirm|commit|evidence|manifest|untracked|absent|verified|manifest\.txt)/i;
  var FOOT_RE = /^(?:and\s+)?(next|then|now)\b[:,]?\s*/i;
  function denseNoteHtml(sents) {
    var head = sents[0];
    var rest = sents.slice(1);
    var foot = null;
    if (rest.length && FOOT_RE.test(rest[rest.length - 1])) foot = rest.pop();
    var h = '<span class="dense-headline">' + esc(head) + '</span>';
    if (rest.length) {
      h += '<ul class="dense-items">';
      for (var i = 0; i < rest.length; i++) {
        h += '<li' + (EVIDENCE_RE.test(rest[i]) ? ' class="ev"' : '') + '>' + esc(rest[i]) + '</li>';
      }
      h += '</ul>';
    }
    if (foot) h += '<span class="dense-foot">\u25B8 ' + esc(foot) + '</span>';
    return h;
  }
  // Called once per narration node when its stream ends. Idempotent via
  // data-final so replays/retries never restructure twice.
  function finalizeNarration(el) {
    var txt = el.querySelector('.txt');
    if (!txt || txt.getAttribute('data-final')) return;
    txt.setAttribute('data-final', '1');
    var raw = txt.textContent || '';
    var clean = stripJsonLeak(raw);
    var trimmed = clean.trim();
    // The WHOLE node is a leaked action object: never show schema noise as
    // conversation — collapse behind an "Execution details" disclosure.
    if (JSON_LEAK_RE.test(trimmed)) {
      txt.textContent = '';
      var d = document.createElement('details');
      d.className = 'exec-details';
      d.innerHTML = '<summary><b>Raw model output</b><span class="chev">\u25B8</span></summary><pre class="exec-pre"></pre>';
      d.querySelector('.exec-pre').textContent = trimmed;
      txt.appendChild(d);
      return;
    }
    if (clean !== raw) txt.textContent = clean;
    var sents = sentencesOf(clean);
    if (clean.length < DENSE_MIN_CHARS || sents.length < 3) return;
    txt.classList.add('dense-note');
    txt.innerHTML = denseNoteHtml(sents);
  }
  // ── Retry-duplicate collapsing ──────────────────────────────────────────
  // After a transient LLM failure the retry re-streams the SAME thought, and
  // the interleaved "recover …" events close the previous row — so every
  // attempt rendered as an identical narration row. Collapse exact repeats
  // entirely; if the retry continues FURTHER than the failed attempt, keep
  // only the new tail.
  function dedupeNarration(sess, el, memoKey) {
    var txt = el.querySelector('.txt');
    if (!txt) return;
    var raw = (txt.textContent || '').trim();
    if (!raw) return;
    var prev = sess[memoKey] || '';
    if (prev) {
      if (raw === prev) { el.remove(); return; }
      if (raw.length > prev.length && raw.indexOf(prev) === 0) {
        txt.textContent = raw.slice(prev.length).replace(/^[\s.,;—-]+/, '');
      }
    }
    sess[memoKey] = raw;
  }
  // An agent bubble ends whenever the next turn starts; sanitize + structure
  // it at exactly that moment instead of leaving streaming text frozen.
  function retireAbubble(sess) {
    var b = sess.nodes.abubble;
    if (!b) return;
    sess.nodes.abubble = null;
    dedupeNarration(sess, b, 'lastBubbleText');
    finalizeNarration(b);
  }
  function toolKind(summary) {
    if (summary.indexOf('write ') === 0) return 'edit';
    if (summary.indexOf('edit ') === 0) return 'edit';
    if (summary.indexOf('read ') === 0) return 'read';
    if (summary.indexOf('list ') === 0) return 'list';
    if (summary.indexOf('search ') === 0) return 'search';
    if (summary.indexOf('$ ') === 0) return 'shell';
    if (summary.indexOf('browse') === 0) return 'browser';
    return 'tool';
  }
  function splitSummary(body) { var d = body.indexOf(' — '); return d >= 0 ? body.slice(0, d) : body; }
  function splitReason(body) { var d = body.indexOf(' — '); return d >= 0 ? body.slice(d + 3) : ''; }
  function workingTextFor(text) {
    if (text.indexOf('think') === 0) return 'Thinking…';
    if (text.indexOf('run ') === 0) {
      var summary = splitSummary(text.slice(4));
      var k = toolKind(summary);
      if (k === 'edit') return 'Editing ' + summary.slice(summary.indexOf(' ') + 1) + '…';
      if (k === 'read') return 'Reading ' + summary.slice(5) + '…';
      if (k === 'list') return 'Listing ' + summary.slice(5) + '…';
       if (k === 'search') return 'Searching…';
       if (k === 'browser') return 'Checking in browser…';
      if (k === 'shell') return 'Running ' + summary.slice(2) + '…';
      return 'Working: ' + summary + '…';
    }
    if (text.indexOf('plan ') === 0) return 'Building plan…';
    if (text.indexOf('criteria') === 0) return 'Defining acceptance criteria…';
    if (text.indexOf('evidence') === 0) return 'Recording evidence…';
    if (text.indexOf('claim') === 0) return 'Checking acceptance…';
    if (text.indexOf('hypothesis') === 0) return 'Updating hypothesis…';
    if (text.indexOf('context') === 0) return 'Selecting context…';
    return null;
  }
  // Working indicator with an elapsed-seconds counter that escalates after
  // 60s on the SAME phase text — a hung command becomes visible instead of
  // looking alive forever. Counter resets whenever the phase text changes.
  function setWorking(text) {
    var w = $('working');
    if (!w) return;
    if (!text) {
      w.style.display = 'none';
      w.classList.remove('slow');
      if (S.workingTimer) { clearInterval(S.workingTimer); S.workingTimer = null; }
      S.workingSince = null; S.lastWorkingText = null;
      var e0 = $('workingElapsed'); if (e0) e0.textContent = '';
      return;
    }
    w.style.display = 'flex';
    if (text !== S.lastWorkingText) { S.lastWorkingText = text; S.workingSince = Date.now(); w.classList.remove('slow'); }
    var t = $('workingText');
    if (t && t.textContent !== text) t.textContent = text;
    if (!S.workingTimer) {
      S.workingTimer = setInterval(function () {
        var sec = Math.floor((Date.now() - (S.workingSince || Date.now())) / 1000);
        var e = $('workingElapsed');
        if (e) e.textContent = sec >= 3 ? '· ' + sec + 's' : '';
        var ww = $('working');
        if (ww && sec >= 60) ww.classList.add('slow');
      }, 1000);
    }
  }

  function setupCopyButton(btn, textGetter) {
    if (!btn) return;
    btn.onclick = function (e) {
      e.stopPropagation();
      var str = typeof textGetter === 'function' ? textGetter() : String(textGetter || '');
      if (!str) return;
      navigator.clipboard.writeText(str).then(function () {
        btn.classList.add('copied');
        var old = btn.innerHTML;
        btn.innerHTML = icon('check') + ' Copied';
        setTimeout(function () {
          btn.classList.remove('copied');
          btn.innerHTML = old;
        }, 1500);
      }).catch(function () {});
    };
  }

  function setupOutputFolding(detailsEl, preEl, text) {
    if (!detailsEl || !preEl) return;
    preEl.textContent = text;
    var lines = text.split('\n');
    var oldBtn = detailsEl.querySelector('.fold-btn');
    if (oldBtn) oldBtn.remove();
    if (lines.length > 8) {
      preEl.classList.add('folded');
      var foldBtn = document.createElement('button');
      foldBtn.className = 'fold-btn';
      foldBtn.type = 'button';
      var hiddenCount = lines.length - 6;
      foldBtn.textContent = 'Show ' + hiddenCount + ' more lines…';
      foldBtn.onclick = function (e) {
        e.stopPropagation();
        var isFolded = preEl.classList.toggle('folded');
        foldBtn.textContent = isFolded ? ('Show ' + hiddenCount + ' more lines…') : 'Show less';
      };
      detailsEl.appendChild(foldBtn);
    } else {
      preEl.classList.remove('folded');
    }
  }

  // ── Delegated specialists ───────────────────────────────────────────────
  // One living timeline group per delegated job (keyed by job id): an inline
  // header row (agent name · turn count · specialist tag · status) with the
  // sub-agent's narration lines nested below under their own border rule.
  var SPEC_LOG_CAP = 40;
  var SPEC_LIFECYCLE = /^subagent (\S+) \[(queued|running|completed|failed|cancelled)\] (sub-[^\s]+) — ?([\s\S]*)$/;
  var SPEC_STATUS = {
    queued: ['st st-idle', '&#8943; queued'],
    working: ['st st-run', '&#8943; working'],
    done: ['st st-ok', '&#10003; done'],
    failed: ['st st-err', '&#10005; failed'],
    cancelled: ['st st-warn', '&#10005; cancelled']
  };

  function specSetStatus(st, label) {
    var m = SPEC_STATUS[label] || ['st st-idle', esc(label)];
    st.statusEl.className = 'tl-sub-status ' + m[0];
    st.statusEl.innerHTML = m[1];
    if (st.dotEl) {
      st.dotEl.className = 'tl-dot ' + (label === 'done' ? 'dot-ok' : (label === 'failed' || label === 'cancelled') ? 'dot-bad' : label === 'working' ? 'dot-run' : 'dot-note');
      if (label !== 'working') st.dotEl.style.animation = 'none';
    }
  }
  function specPushActivity(st, line) {
    st.activity.push(line);
    if (st.activity.length > SPEC_LOG_CAP) st.activity.splice(0, st.activity.length - SPEC_LOG_CAP);
    // Collapsed cards stay cheap: only the one-line preview updates.
    if (st.open) renderSpecLog(st);
    updateSpecPreview(st);
  }
  function updateSpecPreview(st) {
    if (!st.prevEl) return;
    var last = st.activity.length ? st.activity[st.activity.length - 1] : '';
    st.prevEl.textContent = last || st.task || '';
  }
  // Tap-to-peek: header toggles the activity log; collapsed shows just the
  // latest line so you can see what the specialist is doing right now.
  function applySpecCollapse(st) {
    if (!st.log) return;
    st.log.hidden = !st.open;
    st.el.classList.toggle('open', Boolean(st.open));
    var head = st.headEl;
    if (head) {
      head.setAttribute('aria-expanded', st.open ? 'true' : 'false');
      head.title = st.open ? 'click to collapse' : 'click to expand activity';
    }
    if (st.open) renderSpecLog(st);
    updateSpecPreview(st);
  }
  function renderSpecLog(st) {
    st.log.innerHTML = '';
    st.activity.slice(-SPEC_LOG_CAP).forEach(function (line) {
      var d = document.createElement('div');
      d.className = 'spec-logline';
      d.textContent = line;
      st.log.appendChild(d);
    });
    st.log.scrollTop = st.log.scrollHeight;
  }
  function upsertSpecialistCard(runId, insert, name, status, jobId, detail) {
    var sess = S.sessions[runId];
    if (!sess) return;
    sess.nodes.specs = sess.nodes.specs || {};
    var st = sess.nodes.specs[jobId];
    if (!st) {
      var group = document.createElement('div');
      group.className = 'tl-row tl-sub-row';
      group.innerHTML =
        '<span class="tl-dot dot-run"></span>' +
        '<div class="tl-body">' +
          '<div class="tl-sub-head" role="button" tabindex="0" aria-expanded="false" title="click to expand activity">' +
            '<span class="spec-chev">' + icon('chevRight') + '</span>' +
            '<span class="spec-name">' + esc(name) + '</span>' +
            '<span class="spec-turns"></span>' +
            '<span class="spec-tag">specialist</span>' +
            '<span class="tl-sub-status st st-idle">&#8943; queued</span>' +
          '</div>' +
          '<div class="tl-sub-task" hidden></div>' +
          '<div class="spec-preview"></div>' +
          '<div class="tl-sub-rail" hidden></div>' +
        '</div>';
      st = sess.nodes.specs[jobId] = {
        el: group,
        name: name,
        task: '',
        activity: [],
        open: false,
        dotEl: group.querySelector('.tl-dot'),
        statusEl: group.querySelector('.tl-sub-status'),
        turnsEl: group.querySelector('.spec-turns'),
        taskEl: group.querySelector('.tl-sub-task'),
        prevEl: group.querySelector('.spec-preview'),
        headEl: group.querySelector('.tl-sub-head'),
        log: group.querySelector('.tl-sub-rail')
      };
      var toggle = function () { st.open = !st.open; applySpecCollapse(st); };
      st.headEl.onclick = toggle;
      st.headEl.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
      insert(group);
      applySpecCollapse(st);
    }
    if (status === 'queued') {
      st.task = detail;
      st.taskEl.hidden = false;
      st.taskEl.textContent = detail;
      specSetStatus(st, 'queued');
    } else if (status === 'running') {
      specSetStatus(st, 'working');
      var tm = /turn (\d+)\/(\d+)/.exec(detail);
      st.turnsEl.textContent = tm ? 'turn ' + tm[1] + '/' + tm[2] : '';
    } else {
      specSetStatus(st, status === 'completed' ? 'done' : status);
      st.turnsEl.textContent = '';
      if (detail) specPushActivity(st, detail);
      // A failed specialist is exactly when you WANT the log open.
      if (status === 'failed' || status === 'cancelled') { st.open = true; applySpecCollapse(st); }
    }
    var stream = $('stream');
    if (stream) stickScroll(stream);
  }
  function attachSpecialistActivity(runId, text) {
    var sess = S.sessions[runId];
    if (!sess || !sess.nodes.specs) return false;
    var rest = text.slice('subagent '.length);
    var name = rest.split(/[\s:]/)[0];
    if (!name) return false;
    var pick = null;
    Object.keys(sess.nodes.specs).forEach(function (id) {
      if (sess.nodes.specs[id].name === name) pick = sess.nodes.specs[id]; // insertion order → last job wins
    });
    if (!pick) return false;
    specPushActivity(pick, rest.slice(name.length).replace(/^[:—\-\s]+/, ''));
    return true;
  }

  // ── Intake metadata line ────────────────────────────────────────────────
  // The resume burst (project/ledger/branch/risk/effort/context/…) collapses
  // into one quiet silver text line. Metadata = quiet; agent output = normal;
  // errors (fatal/blocked/done) are NEVER grouped — they stay prominent.
  var INTAKE_TAGS = { project: 1, ledger: 1, branch: 1, criteria: 1, skill: 1, risk: 1, effort: 1, context: 1 };

  function intakeDigestPart(tag, body) {
    if (tag === 'project') {
      var m = /^locked:\s*([^@\n]+?)\s+@/.exec(body);
      return m ? m[1] : '';
    }
    if (tag === 'effort') {
      var e = /^([a-z]+)/i.exec(body);
      return e ? e[1] + ' effort' : '';
    }
    if (tag === 'context') {
      var c = /^(\d+) primary/.exec(body);
      return c ? c[1] + ' files' : '';
    }
    return '';
  }
  function upsertIntakeLine(runId, insert, tag, body) {
    var sess = S.sessions[runId];
    if (!sess) return;
    var streamEl = $('stream');
    var st = sess.nodes.intake;
    // Singleton guarantee: retries and resume bursts re-emit the whole intake
    // set, so NEVER insert a second line — adopt the one already in the
    // stream (clearing its rows; the burst repopulates them immediately).
    if ((!st || !st.el.isConnected) && streamEl) {
      var existing = streamEl.querySelector('.intake-line');
      if (existing) {
        existing.querySelector('.intake-rows').innerHTML = '';
        st = sess.nodes.intake = { el: existing, seen: {}, digest: {} };
      }
    }
    if (!st) {
      var el = document.createElement('div');
      el.className = 'tl-row intake-line';
      el.innerHTML =
        '<span class="tl-dot dot-note"></span>' +
        '<div class="tl-body"><span class="intake-head">' +
          '<span class="intake-chev">' + icon('chevDown') + '</span>' +
          '<span class="intake-title">Session</span>' +
          '<span class="intake-digest"></span>' +
        '</span>' +
        '<div class="intake-rows"></div></div>';
      el.querySelector('.intake-head').addEventListener('click', function () {
        el.classList.toggle('open');
      });
      st = sess.nodes.intake = { el: el, seen: {}, digest: {} };
      insert(el);
    }
    // Dedupe identical tag+body pairs on replays/retries.
    var rowKey = tag + '::' + body;
    if (!st.seen[rowKey]) {
      st.seen[rowKey] = 1;
      var row = document.createElement('div');
      row.className = 'intake-row';
      row.textContent = tag.charAt(0).toUpperCase() + tag.slice(1) + ': ' + body;
      st.el.querySelector('.intake-rows').appendChild(row);
      var part = intakeDigestPart(tag, body);
      if (part) st.digest[tag] = part;
    }
    var created = false;
    for (var key in st.seen) {
      if (key.indexOf('ledger::created:') === 0) { created = true; break; }
    }
    st.el.querySelector('.intake-title').textContent = created ? 'Session started' : 'Session resumed';
    var d = st.digest;
    st.el.querySelector('.intake-digest').textContent =
      ['project', 'effort', 'context'].map(function (k) { return d[k]; }).filter(Boolean).map(function (s) { return '\u00B7 ' + s; }).join(' ');
    var stream = $('stream');
    if (stream) stickScroll(stream);
  }

  function appendEvent(runId, ev) {
    var stream = $('stream');
    if (!stream) return;
    var sess = S.sessions[runId];
    var text = String(ev.text);
    if (text.indexOf('think') === 0 || text.indexOf('plan ') === 0) mascotState('thinking');
    else if (text.indexOf('run write') === 0 || text.indexOf('run edit') === 0) mascotState('coding');
    else if (text.indexOf('run $') === 0 || text.indexOf('run ') === 0) mascotState('testing');
    else if (text.indexOf('evidence') === 0 && text.indexOf('PASS') >= 0) mascotState('celebrate');
    else if (text.indexOf('blocked') === 0 || text.indexOf('denied') === 0) mascotState('shield');
    else mascotPulse();

    if (sess && sess.chatish && (
      text.indexOf('run ') === 0 || text.indexOf('ok ') === 0 || text.indexOf('error ') === 0 ||
      text.indexOf('denied ') === 0 || text.indexOf('blocked ') === 0 || text.indexOf('out ') === 0 ||
      text.indexOf('meta ') === 0 || text.indexOf('checkpoint ') === 0 || text.indexOf('plan ') === 0 ||
      text.indexOf('criteria ') === 0 || text.indexOf('evidence ') === 0 || text.indexOf('hypothesis ') === 0 ||
      text.indexOf('context ') === 0 || text.indexOf('delegate ') === 0 || text.indexOf('subagent ') === 0
    )) return;

    var working = $('working');
    function insert(el) {
      if (ev && ev.t && el.classList && el.classList.contains('tl-row')) {
        var stamp = document.createElement('span');
        stamp.className = 'tl-time';
        stamp.textContent = hhmm(ev.t);
        stamp.title = new Date(ev.t).toLocaleString();
        el.appendChild(stamp);
      }
      if (working) stream.insertBefore(el, working); else stream.appendChild(el); trimTimeline(stream);
    }

    if (text.indexOf('file ') === 0) {
      try {
        var fileMeta = JSON.parse(text.slice(5));
        if (fileMeta && fileMeta.replacesLongText) removeNarrationReplacedByFile(sess);
        insert(sessionFileCard(fileMeta || {}));
        stickScroll(stream);
      } catch (e) {
        // Ignore malformed metadata rather than rendering unsafe raw JSON.
      }
      return;
    }

    if (text.indexOf('tdelta ') === 0 || text.indexOf('thought ') === 0) {
      var chunk = text.indexOf('tdelta ') === 0 ? text.slice(7) : text.slice(8);
      if (sess && sess.chatish) {
        if (!sess.nodes.abubble) {
          var ab = document.createElement('div');
          ab.className = 'abubble';
          ab.innerHTML = '<span class="who">Agent Gitu</span><span class="txt"></span>';
          appendLive(stream, ab);
          sess.nodes.abubble = ab;
        }
        sess.nodes.abubble.querySelector('.txt').appendChild(document.createTextNode(chunk));
        stickScroll(stream);
        return;
      }
      if (!sess.nodes.thought) {
        var t = document.createElement('div');
        // The model sometimes leaks its raw JSON action object into the
        // prose stream (truncated output retried mid-JSON). If the VERY
        // FIRST chunk is that leak, open a collapsed technical row instead
        // of a normal narration row so schema noise never shows as prose.
        if (JSON_LEAK_RE.test(chunk)) {
          t.className = 'tl-row tl-meta';
          t.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><details class="exec-details"><summary><b>Raw model output</b><span class="chev">\u25B8</span></summary><pre class="exec-pre"></pre></details></div>';
        } else {
          t.className = 'tl-row tl-note-row';
          t.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><span class="txt"></span><span class="caret"></span></div>';
        }
        insert(t);
        sess.nodes.thought = t;
      }
      var sink = sess.nodes.thought.querySelector('.exec-pre') || sess.nodes.thought.querySelector('.txt');
      sink.appendChild(document.createTextNode(chunk));
      stickScroll(stream);
      return;
    }
    if (text.indexOf('reason ') === 0) {
      if (sess && sess.chatish) return;
      if (!sess.nodes.thought) {
        var t3 = document.createElement('div');
        t3.className = 'tl-row tl-note-row';
        t3.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><span class="txt"></span><span class="caret"></span></div>';
        insert(t3);
        sess.nodes.thought = t3;
      }
      sess.nodes.thought.querySelector('.txt').appendChild(document.createTextNode(text.slice(7)));
      stickScroll(stream);
      return;
    }

    if (text.indexOf('say ') === 0) {
      var prose = text.slice(4);
      if (!prose.trim()) { closeThought(runId); return; }
      if (sess && sess.chatish) {
        if (sess.nodes.abubble) {
          retireAbubble(sess);
        } else {
          var ab2 = document.createElement('div');
          ab2.className = 'abubble';
          ab2.innerHTML = '<span class="who">Agent Gitu</span><span class="txt"></span>';
          ab2.querySelector('.txt').textContent = prose;
          finalizeNarration(ab2);
          appendLive(stream, ab2);
          stickScroll(stream);
        }
        return;
      }
      var cur = sess.nodes.thought ? sess.nodes.thought.querySelector('.txt').textContent : '';
      cur = (cur || '').trim();
      if (!cur || (prose.indexOf(cur) !== 0 && cur.indexOf(prose) !== 0)) {
        var pp = document.createElement('div');
        pp.className = 'tl-row tl-note-row';
        pp.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><span class="txt">' + esc(prose) + '</span></div>';
        finalizeNarration(pp);
        insert(pp);
      }
      closeThought(runId);
      return;
    }
    if (text.indexOf('think') === 0) { setWorking('Thinking…'); return; }
    if (text.indexOf('approval-required') === 0) { setWorking('Waiting for your approval…'); return; }
    if (text.indexOf('ask-user') === 0) { closeThought(runId); setWorking('Waiting for your answers…'); return; }
    if (text.indexOf('user-msg ') === 0) {
      var userText = text.slice(9);
      var pending = sess && sess.pendingUserMessages;
      var pendingAt = pending ? pending.indexOf(userText) : -1;
      if (pendingAt >= 0) { pending.splice(pendingAt, 1); return; }
      retireAbubble(sess); closeThought(runId); appendLive(stream, userBubble(userText, runId)); stickScroll(stream, true); return;
    }
    if (text.indexOf('queued ') === 0 || text.indexOf('stopped ') === 0 || text.indexOf('continue ') === 0) {
      var qm = document.createElement('div');
      qm.className = 'tl-row tl-meta';
      var qtag = text.split(' ')[0];
      var qrest = text.slice(text.indexOf(' ') + 1);
      var dashIdx = qrest.indexOf(' — ');
      if (dashIdx >= 0) qrest = qrest.slice(dashIdx + 3);
      qm.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><b>' + esc(qtag) + '</b> ' + esc(qrest) + '</div>';
      appendLive(stream, qm);
      return;
    }
    if (text.indexOf('parallel') === 0) {
      var pm = document.createElement('div');
      pm.className = 'tl-row tl-meta';
      pm.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><b>parallel</b> ' + esc(text.slice(9)) + ' — running concurrently</div>';
      insert(pm);
      // Parallel executors emit all run events up front, then interleave
      // each call's ok/error and out events as the promises settle.  A
      // single lastTool pointer cannot represent that lifecycle: the last
      // card stays in sync while earlier cards spin forever.  Keep the batch
      // marker so terminal events can use the active-row queue as a safe
      // fallback when an older server event has no matching command key.
      sess.nodes.parallelPending = true;
      sess.nodes.toolRows = sess.nodes.toolRows || [];
      setWorking('Running parallel tools…');
      return;
    }
    if (text.indexOf('lines ') === 0) {
      var lineHint = text.slice(6).replace(/\s+\+\d+\s+lines.*$/i, '').trim();
      var toolCard = findToolRow(sess, lineHint, true);
      if (toolCard && !toolCard.querySelector('.lines')) {
        var badge = document.createElement('span');
        badge.className = 'lines';
        badge.textContent = '+0 lines';
        var cmdRow = toolCard.querySelector('.tl-cmd');
        cmdRow.insertBefore(badge, cmdRow.querySelector('.st'));
        var target = parseInt(text.split('+')[1] || '0', 10) || 0;
        var startT = Date.now();
        var anim = setInterval(function () {
          var pr = Math.min(1, (Date.now() - startT) / 700);
          badge.textContent = '+' + Math.round(target * pr) + ' lines';
          if (pr >= 1) clearInterval(anim);
        }, 40);
      }
      return;
    }

    // Token telemetry arrives once per run as "telemetry <renderTelemetry()>".
    // It is machine output, not conversation: render as a collapsed
    // "Execution details" disclosure with the counters in a parsed grid.
    if (text.indexOf('telemetry ') === 0) {
      closeThought(runId);
      var LABELS = { calls: 'Calls', toolCalls: 'Tool calls', compactions: 'Compactions',
        planning: 'Planning calls', execution: 'Execution calls', screenshots: 'Screenshots',
        wasted: 'Wasted calls', input: 'Input tokens', cached: 'Cached tokens', output: 'Output tokens' };
      var pairs = [];
      var kre = /([~\w.]+)=([^\s()]+)/g, km;
      while ((km = kre.exec(text))) {
        if (km[1] === 'telemetry') continue;
        pairs.push([km[1], km[2]]);
      }
      var sum = '';
      var mcalls = /calls=(\d+)/.exec(text);
      if (mcalls) sum = mcalls[1] + ' model calls';
      var trow = document.createElement('div');
      trow.className = 'tl-row tl-meta';
      var thtml = '<details class="exec-details"><summary><b>Execution details</b>' +
        (sum ? ' <span class="exec-sum">' + esc(sum) + '</span>' : '') +
        '<span class="chev">\u25B8</span></summary><div class="exec-grid">';
      for (var pi = 0; pi < pairs.length; pi++) {
        thtml += '<span class="k">' + esc(LABELS[pairs[pi][0]] || pairs[pi][0]) + '</span>' +
                 '<span class="v">' + esc(pairs[pi][1]) + '</span>';
      }
      thtml += '</div></details>';
      trow.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body">' + thtml + '</div>';
      appendLive(stream, trow);
      stickScroll(stream);
      return;
    }

    // Consecutive recovery rows (the same discovery strategy repeating across
    // strategies/attempts) collapse into one row with a repeat chip — the
    // recovery ladder is noise-dense by design, but rarely worth N lines.
    if (text.indexOf('recovery ') === 0) {
      closeThought(runId);
      var rKey = text.slice(9).split(' — ')[0].split(':')[0].trim();
      var lastR = sess.nodes.lastRecovery;
      if (lastR && lastR.key === rKey && lastR.el && lastR.el.isConnected) {
        lastR.count++;
        var rChip = lastR.el.querySelector('.repeat-count');
        if (rChip) rChip.textContent = '×' + lastR.count;
        stickScroll(stream);
        return;
      }
      var rRow = document.createElement('div');
      rRow.className = 'tl-row tl-meta';
      rRow.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><b>recovery</b> ' + esc(text.slice(9).trim()) + ' <span class="chip warn repeat-count">×1</span></div>';
      sess.nodes.lastRecovery = { key: rKey, count: 1, el: rRow };
      insert(rRow);
      stickScroll(stream);
      return;
    }

    // Machine bookkeeping (diff snapshots, specialist checkpoints) accumulates
    // into ONE collapsed group instead of narrating over the agent's work.
    if (text.indexOf('report ') === 0 || text.indexOf('checkpoint ') === 0) {
      closeThought(runId);
      if (!sess.nodes.internal) {
        var ig = document.createElement('div');
        ig.className = 'tl-row tl-meta';
        ig.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><details class="exec-details"><summary><b>Internal activity</b><span class="exec-sum internal-count">1 entry</span><span class="chev">\u25B8</span></summary><pre class="exec-pre"></pre></details></div>';
        sess.nodes.internal = ig;
        sess.nodes.internalCount = 0;
        insert(ig);
      }
      sess.nodes.internalCount++;
      var igCount = sess.nodes.internal.querySelector('.internal-count');
      if (igCount) igCount.textContent = sess.nodes.internalCount + (sess.nodes.internalCount === 1 ? ' entry' : ' entries');
      var igSink = sess.nodes.internal.querySelector('.exec-pre');
      if (igSink) igSink.appendChild(document.createTextNode(text + '\n'));
      stickScroll(stream);
      return;
    }

    if (text.indexOf('browseshot ') === 0) {
      var shot = document.createElement('div');
      shot.className = 'shotmsg browser-shot';
      shot.innerHTML = '<div class="browser-chat-highlight"><b>Visual check</b><span>Browser screenshot</span></div><img alt="browser screenshot">';
      shot.querySelector('img').src = text.slice(11);
      appendLive(stream, shot);
      stickScroll(stream);
      return;
    }

    closeThought(runId);
    var tag = text.split(' ')[0];
    var body = text.slice(tag.length).trim();

    // Tool lifecycle events carry the same parameter summary as their run
    // event.  Matching on that stable key keeps parallel rows independent and
    // also handles completions that arrive out of order.  The duration suffix
    // is only present on post-execution events; preflight errors/denials do not
    // own a running card and must not accidentally close the previous one.
    function terminalToolSummary(value) {
      var m = /^(.*?)(?:\s+\(\d+ms\))$/.exec(String(value || '').trim());
      return m ? m[1].trim() : '';
    }
    function normalizeToolKey(value) {
      return String(value || '').replace(/^\$\s*/, '').replace(/\s+/g, ' ').trim();
    }
    function activeToolRows(state) {
      var rows = state && state.nodes && state.nodes.toolRows;
      if (!rows) return [];
      // The timeline is bounded; drop cards evicted by trimTimeline so the
      // lifecycle queue cannot retain detached DOM nodes forever.
      state.nodes.toolRows = rows.filter(function (row) { return row && row.isConnected && row.dataset.toolState === 'working'; });
      return state.nodes.toolRows;
    }
    function findToolRow(state, hint, allowFallback) {
      if (!state || !state.nodes) return null;
      var rows = activeToolRows(state);
      var raw = String(hint || '').trim();
      var key = normalizeToolKey(raw);
      var exact = null;
      for (var ri = rows.length - 1; ri >= 0; ri--) {
        var rowKey = String(rows[ri].dataset.toolKey || '');
        if (raw && (rowKey === raw || normalizeToolKey(rowKey) === key)) { exact = rows[ri]; break; }
        // lines <path> +N lines has only a path hint, so allow it to bind to
        // the corresponding write/edit summary without relying on event order.
        if (key && (normalizeToolKey(rowKey).indexOf(key) >= 0 || key.indexOf(normalizeToolKey(rowKey)) >= 0)) { exact = rows[ri]; break; }
      }
      if (exact) return exact;
      // A single active row is unambiguous even for older/replayed events.
      if (rows.length === 1) return rows[0];
      // Old persisted parallel events did not carry a correlation id. FIFO is
      // the least surprising recovery for those rows; new events match above.
      return allowFallback && state.nodes.parallelPending && rows.length ? rows[0] : null;
    }
    function finishToolRow(state, status, eventBody) {
      var key = terminalToolSummary(eventBody);
      if (!key) return null;
      var row = findToolRow(state, key, true);
      if (!row) return null;
      var dotEl = row.querySelector('.tl-dot');
      var stEl = row.querySelector('.st');
      if (status === 'ok') {
        if (dotEl) dotEl.className = 'tl-dot dot-ok';
        if (stEl) { stEl.className = 'st st-ok'; stEl.innerHTML = '&#10003; ok'; }
      } else if (status === 'error') {
        if (dotEl) dotEl.className = 'tl-dot dot-bad';
        if (stEl) { stEl.className = 'st st-err'; stEl.innerHTML = '&#10005; error'; }
        row.classList.add('done-bad');
      } else if (status === 'denied') {
        if (dotEl) dotEl.className = 'tl-dot dot-bad';
        if (stEl) { stEl.className = 'st st-err'; stEl.innerHTML = '&#10005; denied'; }
        row.classList.add('done-bad');
      } else {
        if (dotEl) dotEl.className = 'tl-dot dot-blocked';
        if (stEl) { stEl.className = 'st st-warn'; stEl.innerHTML = '&#10005; blocked'; }
      }
      row.dataset.toolState = 'done';
      row.dataset.toolStatus = status;
      state.nodes.lastTool = row;
      state.nodes.lastOutputTool = row;
      if (activeToolRows(state).length === 0) state.nodes.parallelPending = false;
      return row;
    }

    // End-of-run status echo from the server ("run finished: failed/blocked/...").
    // The "run " prefix would otherwise render as a fake tool card with an
    // empty output disclosure. Status is already shown by the header chip,
    // the "done" meta row, the error card and the summary card.
    if (text.indexOf('run finished: ') === 0) return;

    if (tag === 'run') {
      var kind = toolKind(body);
      var summary = splitSummary(body);
      var reason = splitReason(body);
      var row = document.createElement('div');
      row.className = 'tl-row tl-tool' + (kind === 'browser' ? ' tl-browser' : '');
      row.innerHTML =
        '<span class="tl-dot dot-run"></span>' +
        '<div class="tl-body">' +
          '<div class="tl-cmd">' +
            '<span class="cmd">' + (summary.indexOf('$ ') === 0 ? '' : '$ ') + esc(summary) + '</span>' +
            (reason ? '<span class="why">— ' + esc(reason) + '</span>' : '') +
            '<span class="st st-run">&#8943; working</span>' +
          '</div>' +
          '<details class="tl-out"><summary><span>output</span><button type="button" class="tool-btn-copy" title="Copy output">' + icon('copy') + ' Copy</button></summary><pre></pre></details>' +
        '</div>';

      var copyBtn = row.querySelector('.tool-btn-copy');
      setupCopyButton(copyBtn, function () {
        var pre = row.querySelector('pre');
        return (pre && pre.textContent) || summary;
      });

      insert(row);
      sess.nodes.lastTool = row;
      sess.nodes.toolRows = sess.nodes.toolRows || [];
      row.dataset.toolKey = summary;
      row.dataset.toolState = 'working';
      sess.nodes.toolRows.push(row);
      var wt = workingTextFor(text);
      if (wt) setWorking(wt);
      stickScroll(stream);
      return;
    }
    if (tag === 'ok' || tag === 'error' || tag === 'denied' || tag === 'blocked') {
      var tool = finishToolRow(sess, tag, body);
      // No duration means this was a preflight denial/schema error, for which
      // no run card exists.  Do not mutate an unrelated active card.
      if (!tool) return;
      setWorking(activeToolRows(sess).length ? 'Running parallel tools…' : 'Thinking…');
      return;
    }
    if (tag === 'out') {
      // out follows its own terminal event, so prefer that correlated row;
      // lastTool remains a compatibility fallback for old event streams.
      var t2 = sess.nodes.lastOutputTool || sess.nodes.lastTool || findToolRow(sess, '', true);
      if (t2) {
        var detailsEl = t2.querySelector('details');
        var preEl = t2.querySelector('pre');
        var cleanOut = body.replace(/ ⏎ /g, '\n');
        setupOutputFolding(detailsEl, preEl, cleanOut);
      }
      return;
    }
    // Intake burst → one quiet silver line. Errors (fatal/blocked/denied)
    // and agent output are never grouped — they stay prominent in the stream.
    if (INTAKE_TAGS[tag]) {
      upsertIntakeLine(runId, insert, tag, body);
      return;
    }
    // Specialist lifecycle + activity → one living card per job (never a pile of lines).
    var mSpec = SPEC_LIFECYCLE.exec(text);
    if (mSpec) {
      upsertSpecialistCard(runId, insert, mSpec[1], mSpec[2], mSpec[3], mSpec[4]);
      var wt3 = workingTextFor(text);
      if (wt3) setWorking(wt3);
      return;
    }
    if (text.indexOf('subagent ') === 0 && attachSpecialistActivity(runId, text)) {
      return;
    }
    var meta = document.createElement('div');
    if (tag === 'evidence') {
      var isPass = body.indexOf('PASS') >= 0;
      meta.className = 'tl-row tl-ev';
      meta.innerHTML = '<span class="tl-dot dot-ev"></span><div class="tl-body"><span class="ev-pill ' + (isPass ? 'pass' : 'fail') + '">' + (isPass ? '&#10003; ' : '&#10005; ') + esc(body) + '</span></div>';
    } else if (tag === 'plan') {
      meta.className = 'tl-row tl-meta';
      meta.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><b>plan</b> ' + esc(body) + ' — review it, then approve to build</div>';
    } else if (tag === 'subagent') {
      meta.className = 'tl-row tl-meta subagent-note';
      meta.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><b>specialist</b> ' + esc(body) + '</div>';
    } else if (tag === 'done') {
      // End-of-run echo: show the conversational outcome, not the raw
      // CHANGES dump (the full report card below carries the detail).
      var dDash = body.indexOf(' — ');
      var dParsed = parseOutcome(dDash >= 0 ? body.slice(dDash + 3) : body);
      meta.className = 'tl-row tl-meta';
      meta.innerHTML = '<span class="tl-dot dot-ok"></span><div class="tl-body"><b>🎉 ' + esc(dDash >= 0 ? body.slice(0, dDash) : 'done') + '</b> — ' + esc(shortText(reportLede(dParsed.lede), 220)) + '</div>';
    } else if (tag === 'warn') {
      var warnKey = body.replace(/\s*\(streak \d+\)/i, '').replace(/^\d+ replies in a row /i, 'replies in a row ').trim();
      var previousWarn = sess.nodes.lastWarn;
      if (previousWarn && previousWarn.el && previousWarn.el.isConnected && previousWarn.key === warnKey) {
        previousWarn.count++;
        var repeat = previousWarn.el.querySelector('.repeat-count');
        if (repeat) repeat.textContent = '×' + previousWarn.count;
        stickScroll(stream);
        return;
      }
      meta.className = 'tl-row tl-meta';
      meta.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><b>warn</b> ' + esc(warnKey) + ' <span class="chip warn repeat-count">×1</span></div>';
      sess.nodes.lastWarn = { key: warnKey, count: 1, el: meta };
    } else {
      sess.nodes.lastWarn = null;
      sess.nodes.lastRecovery = null;
      meta.className = 'tl-row tl-meta';
      meta.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><b>' + esc(tag) + '</b> ' + esc(body) + '</div>';
    }
    insert(meta);
    var wt2 = workingTextFor(text);
    if (wt2) setWorking(wt2);
    stickScroll(stream);
  }

  function updateProgress(L) {
    var p = $('progress');
    if (!p || !L) return;
    var done = 0;
    L.plan.forEach(function (s) { if (s.status === 'done') done++; });
    var total = L.plan.length;
    p.style.display = 'flex';
    $('progText').textContent = total ? 'Plan step ' + done + ' of ' + total : 'Planning…';
    $('progMeta').textContent = L.actions.length + ' actions · ' + L.evidence.length + ' checks';
    var width = Math.min(100, Math.round((done / Math.max(1, total)) * 100));
    $('progFill').style.width = width + '%';
  }

  function renderRunOverview(session, ledger) {
    var next = $('runOverviewNext'), stats = $('runOverviewStats'), dot = $('runOverviewDot');
    if (!next || !session) return;
    var waiting = waitingFor(session);
    var status = waiting ? 'waiting' : (session.status || 'idle');
    dot.className = 'run-overview-dot ' + status;
    // The blocker line is the most important sentence on screen when a run
    // stops — let it wrap to two lines instead of clipping mid-sentence.
    next.classList.toggle('wrapped', status === 'blocked' || status === 'failed');
    var current = '';
    if (ledger && ledger.blockers && ledger.blockers.length) current = 'Blocked: ' + ledger.blockers[ledger.blockers.length - 1];
    if (!current && waiting) current = 'Needs your ' + waiting + ' before work can continue';
    if (!current && ledger && ledger.plan) {
      var step = ledger.plan.filter(function (s) { return s.status === 'in_progress'; })[0] || ledger.plan.filter(function (s) { return s.status === 'pending'; })[0];
      if (step) current = (step.status === 'in_progress' ? 'Working on: ' : 'Next: ') + step.description;
    }
    if (!current) current = status === 'completed' ? 'Completed — review the result and evidence' : status === 'failed' ? 'Failed — review the blocker and retry options' : status === 'blocked' ? 'Blocked — review the required action' : status === 'running' ? 'Preparing the next action' : 'Task state ready';
    next.textContent = current;
    next.title = current;
    var statBits = [status === 'waiting' ? 'needs input' : status];
    if (ledger && ledger.acceptanceCriteria) {
      var satisfied = ledger.acceptanceCriteria.filter(function (c) { return c.satisfied; }).length;
      statBits.push(satisfied + '/' + ledger.acceptanceCriteria.length + ' criteria');
    }
    if (ledger && ledger.filesChanged && ledger.filesChanged.length) statBits.push(ledger.filesChanged.length + ' files');
    stats.textContent = statBits.join(' · ');
  }

  function pollRun(runId) {
    if (S.active !== runId) return;
    api('/api/runs/' + runId).then(function (session) {
      var sess = S.sessions[runId];
      if (!sess) return;
      S.pollFailures = 0;
      sess.session = session;
      renderRunOverview(session, sess.ledger);
      // On opening a persisted task, place its model in the composer. That
      // makes continuing it stable; a later picker change is deliberate and
      // is sent as a one-session model override.
      // EXCEPT when the last attempt failed on billing: yanking the picker
      // back to the dead paid model would silently eat the user's free-model
      // recovery — leave the composer alone so their selection stands.
      var billingFail = !!(session.error && /(401|no credits|insufficient balance|billing)/i.test(session.error));
      if (!sess.modelSynced && !sess.modelOverride && session.provider && session.model && !billingFail) {
        var sessionModel = session.provider + '::' + session.model;
        if (modelInfo(sessionModel)) {
          S.sel.model = sessionModel;
          var picker = $('model');
          if (picker) picker.value = sessionModel;
          syncModelLabel();
          updateAttachState();
          updateModelMeta();
        }
        sess.modelSynced = true;
      }
      // Session mode is durable. Never infer chat mode from an empty ledger:
      // a task can fail before it has planned anything and still be a task.
      sess.chatish = session.mode === 'chat';
      renderTopbar();
      renderApprovals(runId, session);
      renderPlanReview(runId, session);
      renderQuestions(runId, session);
      renderConnectionRequest(runId, session);
      renderErrorCard(runId, session);
      if (session.status !== 'running' && !sess.summaryShown && session.report) {
        sess.summaryShown = true;
        appendSummary(runId, session);
      }
      if (session.status === 'running') sess.justOpened = false;
      if (session.taskId) {
        api('/api/tasks/' + session.taskId).then(function (ledger) {
          var s2 = S.sessions[runId];
          if (s2) {
            s2.ledger = ledger;
            renderRunSide(runId);
            renderRunOverview(session, ledger);
            if (s2.chatish) { var pp = $('progress'); if (pp) pp.style.display = 'none'; } else updateProgress(ledger);
          }
        }).catch(function () {});
      } else renderRunSide(runId);
      if (session.status !== 'running') {
        setWorking(null);
        if (S.es) { try { S.es.close(); } catch (e) {} S.es = null; }
        S.reconnecting = false;
        if (S.poll) { clearInterval(S.poll); S.poll = null; }
        renderSidebar();
      }
    }).catch(function () {
      // Silent network death used to leave the spinner forever. Count and
      // surface it; SSE onerror handles the visible reconnect state.
      S.pollFailures = (S.pollFailures || 0) + 1;
      if (S.pollFailures === 3) toast('Connection issues — retrying…', true);
    });
  }

  // Keep a stopped run discoverable without echoing the full provider error
  // into the conversation. Details contains the actionable error and retry
  // guidance; the stream only needs a quiet state marker.
  function renderErrorCard(runId, session) {
    var stream = $('stream');
    var sess = S.sessions[runId];
    if (!stream || !sess) return;
    var key = session && session.error ? String(session.error) : '';
    var existing = stream.querySelector('.run-stop-note');
    if (!key || session.status === 'running') {
      if (existing) existing.remove();
      sess.errShownKey = '';
      return;
    }
    if (sess.errShownKey === key && existing) return;
    if (existing) existing.remove();
    sess.errShownKey = key;
    var div = document.createElement('div');
    div.className = 'run-stop-note';
    div.textContent = 'Run stopped — see Details to review and retry.';
    var w = $('working');
    if (w) stream.insertBefore(div, w); else stream.appendChild(div);
    stickScroll(stream, true);
  }

  function renderApprovals(runId, session) {
    var stream = $('stream');
    if (!stream) return;
    var sess = S.sessions[runId];
    sess.apprShown = sess.apprShown || {};
    var pending = {};
    (session.pendingApprovals || []).forEach(function (a) {
      pending[a.id] = true;
      if (sess.apprShown[a.id]) return;
      sess.apprShown[a.id] = true;
      var div = document.createElement('div');
      div.className = 'approval';
      div.setAttribute('data-aid', a.id);
      div.innerHTML =
        '<h3>approval required — ' + esc(a.tool) + '</h3>' +
        '<div class="meta-line">' + esc(a.why) + '</div>' +
        '<pre>' + esc(a.summary) + '</pre>' +
        '<div class="actions"><button class="btn dark" data-appr="' + esc(a.id) + '" data-ok="1">Approve</button>' +
        '<button class="btn red" data-appr="' + esc(a.id) + '" data-ok="0">Deny</button></div>';
      var working = $('working');
      if (working) stream.insertBefore(div, working); else stream.appendChild(div);
      stickScroll(stream, true);
    });
    var olds = stream.querySelectorAll('.approval');
    for (var i = 0; i < olds.length; i++) {
      if (!pending[olds[i].getAttribute('data-aid')]) olds[i].remove();
    }
    stream.onclick = function (e) {
      var id = e.target.getAttribute && e.target.getAttribute('data-appr');
      if (id) {
        // Lock the card's buttons immediately: a double-click used to POST
        // the decision twice (second one 404s as "already resolved").
        var card = e.target.closest ? e.target.closest('.approval') : null;
        if (card) card.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
        api('/api/approvals/' + id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approved: e.target.getAttribute('data-ok') === '1' }) })
          .catch(function (er) { toast(er.message, true); });
        return;
      }
      var head = e.target.closest && e.target.closest('.tl-tool .tl-cmd');
      if (head) {
        var det = head.parentElement.querySelector('details');
        if (det) det.open = !det.open;
      }
    };
  }

  function renderQuestions(runId, session) {
    var stream = $('stream');
    if (!stream) return;
    var sess = S.sessions[runId];
    var q = session.pendingQuestions;
    if (!q) {
      if (sess.qShown) {
        sess.qShown = null;
        var olds = stream.querySelectorAll('.qcard');
        for (var i = 0; i < olds.length; i++) olds[i].remove();
      }
      return;
    }
    if (sess.qShown === q.id) return;
    sess.qShown = q.id;
    var old = stream.querySelectorAll('.qcard');
    for (var j = 0; j < old.length; j++) old[j].remove();
    var selections = {};
    var div = document.createElement('div');
    div.className = 'qcard';
    var html = '<h3>Agent Gitu has a few questions before starting</h3>';
    q.questions.forEach(function (qq, qi) {
      html += '<div class="q"><div class="qt">' + esc(qq.header ? qq.header + ' — ' : '') + esc(qq.question) + '</div><div class="opts">';
      qq.options.forEach(function (op, oi) {
        html += '<button class="opt" data-q="' + qi + '" data-o="' + oi + '">' + esc(op) + '</button>';
      });
      html += '</div><input class="custom" data-q="' + qi + '" placeholder="or type your own answer…"></div>';
    });
    html += '<div class="actions"><button class="btn dark" id="qSend">Send answers</button></div>';
    div.innerHTML = html;
    var working = $('working');
    if (working) stream.insertBefore(div, working); else stream.appendChild(div);
    stickScroll(stream, true);
    div.onclick = function (e) {
      var btn = e.target.closest && e.target.closest('.opt');
      if (!btn) return;
      var qi = btn.getAttribute('data-q');
      var siblings = div.querySelectorAll('.opt[data-q="' + qi + '"]');
      for (var i2 = 0; i2 < siblings.length; i2++) siblings[i2].classList.remove('sel');
      btn.classList.add('sel');
      selections[qi] = q.questions[Number(qi)].options[Number(btn.getAttribute('data-o'))];
    };
    $('qSend').onclick = function () {
      if (this.disabled) return;
      this.disabled = true;
      var restore = (function (b) { return function () { b.disabled = false; }; })(this);
      var answers = q.questions.map(function (qq, qi2) {
        var custom = div.querySelector('.custom[data-q="' + qi2 + '"]');
        var val = (custom && custom.value.trim()) || selections[qi2] || '(no answer)';
        return qq.question + ' — ' + val;
      }).join('\n');
      api('/api/answers/' + q.id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answer: answers }) })
        .catch(function (er) { restore(); toast(er.message, true); });
    };
  }

  function renderConnectionRequest(runId, session) {
    var stream = $('stream');
    if (!stream) return;
    var sess = S.sessions[runId];
    var pending = session.pendingConnection;
    if (!pending) {
      if (sess.connShown) {
        sess.connShown = null;
        var oldCards = stream.querySelectorAll('.connection-card');
        for (var oi = 0; oi < oldCards.length; oi++) oldCards[oi].remove();
      }
      return;
    }
    if (sess.connShown === pending.id) return;
    sess.connShown = pending.id;
    var olds = stream.querySelectorAll('.connection-card');
    for (var i = 0; i < olds.length; i++) olds[i].remove();
    var req = pending.requirement || {};
    var isReauth = req.requestType === 'reauth';
    var provider = req.providerHint || 'provider';
    var caps = req.capabilities || [];
    var setup = req.setup || {};
    var apiKeyOnly = Boolean(setup.baseUrl && setup.validationPath);
    var label = setup.label || provider;
    var configurationFields =
      '<input class="conn-label" placeholder="Connection name" value="' + esc(label) + '">' +
      '<input class="conn-provider" placeholder="Provider identifier" value="' + esc(provider) + '">' +
      '<input class="conn-base" placeholder="Base URL (HTTPS, or HTTP only for localhost)" value="' + esc(setup.baseUrl || '') + '">' +
      '<input class="conn-docs" placeholder="Documentation URL (optional, HTTPS)" value="' + esc(setup.documentationUrl || '') + '">' +
      '<input class="conn-path" placeholder="Read-only validation path" value="' + esc(setup.validationPath || '/') + '">';
    var documentation = setup.documentationUrl
      ? ' Documentation source: <a href="' + esc(setup.documentationUrl) + '" target="_blank" rel="noreferrer">' + esc(setup.documentationUrl) + '</a>.'
      : '';
    var formFields = apiKeyOnly
      ? '<div class="hint" style="margin-top:10px">Gitu filled the provider endpoint and validation route from available provider information.' + documentation + ' Review them below only if they are not correct for this account.</div>' +
        '<input class="conn-token" type="password" autocomplete="new-password" placeholder="Paste API key or token — never sent to the model" style="margin-top:8px">' +
        '<details style="margin-top:8px"><summary style="cursor:pointer;color:var(--muted)">Review or change connection details</summary><div style="display:grid;gap:8px;margin-top:8px">' + configurationFields + '</div></details>'
      : configurationFields +
        '<input class="conn-token" type="password" autocomplete="new-password" placeholder="Paste API key or token — never sent to the model">' +
        '<div class="hint">If you only have an API key, ask Gitu to find the provider’s official API documentation first; it can prefill safe endpoint details when they are verified.</div>';
    var div = document.createElement('div');
    div.className = 'qcard connection-card';
    div.innerHTML = '<h3>' + (isReauth ? 'reauthorize saved connection' : 'secure connection setup') + '</h3>' +
      '<div class="meta-line">' + (isReauth
        ? 'The saved credential for "' + esc(label) + '" was positively rejected or expired (' + esc(req.requestType || 'reauth') + ' auth evidence). Replacing it is the only required action — endpoint, documentation, and registered operations are kept. <strong>A missing capability is never a reason to re-enter a credential.</strong>'
        : 'Agent Gitu needs ' + esc(req.description || 'provider access') + ' for ' + esc(req.requiredFor || 'this task') + '. Your credential is validated locally and is never shown to the model, task history, generated skill, or logs.') + '</div>' +
      '<div style="display:grid;gap:8px;margin-top:10px">' + formFields + '</div>' +
      (caps.length ? '<div class="hint" style="margin-top:8px">Required capabilities: ' + esc(caps.join(', ')) + '</div>' : '') +
      '<div class="actions"><button class="btn dark" data-saveconnection>' + (apiKeyOnly ? 'Save API key, validate, and resume' : 'Save, validate, and resume') + '</button></div>';
    var working = $('working');
    if (working) stream.insertBefore(div, working); else stream.appendChild(div);
    stickScroll(stream, true);
    var save = div.querySelector('[data-saveconnection]');
    save.onclick = function () {
      if (save.disabled) return;
      save.disabled = true; save.textContent = 'Validating…';
      var body = {
        label: div.querySelector('.conn-label').value,
        provider: div.querySelector('.conn-provider').value,
        baseUrl: div.querySelector('.conn-base').value,
        documentationUrl: div.querySelector('.conn-docs').value,
        validationPath: div.querySelector('.conn-path').value || '/',
        token: div.querySelector('.conn-token').value,
        capabilities: caps
      };
      api('/api/runs/' + encodeURIComponent(runId) + '/connection', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        .then(function () { div.querySelector('.conn-token').value = ''; toast('Connection validated — task is resuming'); })
        .catch(function (e) { save.disabled = false; save.textContent = 'Save, validate, and resume'; toast((e && e.message) || 'Connection could not be validated', true); });
    };
  }

  function renderPlanReview(runId, session) {
    var stream = $('stream');
    if (!stream) return;
    var sess = S.sessions[runId];
    var pr = session.pendingPlanReview;
    if (!pr) {
      if (sess.prShown) {
        sess.prShown = null;
        var olds = stream.querySelectorAll('.review-card');
        for (var i = 0; i < olds.length; i++) olds[i].remove();
      }
      return;
    }
    if (sess.prShown === pr.id) return;
    sess.prShown = pr.id;
    var old = stream.querySelectorAll('.review-card');
    for (var j = 0; j < old.length; j++) old[j].remove();
    var div = document.createElement('div');
    div.className = 'review-card';
    div.innerHTML =
      '<h3>plan review — read the plan, edit if needed, then choose</h3>' +
      '<div class="md-plan" id="prDoc">' +
      '<h4>Acceptance criteria</h4><ul>' + pr.criteria.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>' +
      '<h4>Plan</h4><ol>' + pr.steps.map(function (s, i2) {
        return '<li><b>Step ' + (i2 + 1) + '.</b> ' + esc(s.description) + '<span class="ver">Verification: ' + esc(s.verification) + '</span></li>';
      }).join('') + '</ol></div>' +
      '<div id="prEdit" style="display:none">' +
      '<label>Acceptance criteria (one per line)</label>' +
      '<textarea id="prCrit" rows="' + Math.max(2, pr.criteria.length) + '">' + esc(pr.criteria.join('\n')) + '</textarea>' +
      '<label>Plan steps (one per line: description | verification)</label>' +
      '<textarea id="prSteps" rows="' + Math.max(3, pr.steps.length + 1) + '">' + esc(pr.steps.map(function (s) { return s.description + ' | ' + s.verification; }).join('\n')) + '</textarea>' +
      '</div>' +
      '<div class="actions"><button class="btn dark" id="prApprove">Approve &amp; Build</button>' +
      '<button class="btn ghost" id="prEditBtn">Edit plan</button>' +
      '<input id="prNote" placeholder="Requested changes (optional)…">' +
      '<button class="btn ghost" id="prChange">Request changes</button></div>';
    var working = $('working');
    if (working) stream.insertBefore(div, working); else stream.appendChild(div);
    stickScroll(stream, true);
    var editing = false;
    $('prEditBtn').onclick = function () {
      editing = !editing;
      $('prEdit').style.display = editing ? 'block' : 'none';
      $('prDoc').style.display = editing ? 'none' : 'block';
      $('prEditBtn').textContent = editing ? 'Preview' : 'Edit plan';
    };
    function payload(approved) {
      var criteria = pr.criteria;
      var steps = pr.steps;
      if (editing) {
        criteria = $('prCrit').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        steps = $('prSteps').value.split('\n').map(function (line) {
          var parts = line.split('|');
          return { description: (parts[0] || '').trim(), verification: (parts.slice(1).join('|') || 'manual check').trim() };
        }).filter(function (s) { return s.description; });
      }
      return { approved: approved, note: $('prNote').value.trim() || undefined, criteria: criteria, steps: steps };
    }
    function prPost(approved) {
      var btns = [$('prApprove'), $('prChange')];
      if (btns.some(function (b) { return b && b.disabled; })) return;
      btns.forEach(function (b) { if (b) b.disabled = true; });
      api('/api/plan-review/' + pr.id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload(approved)) })
        .catch(function (er) {
          btns.forEach(function (b) { if (b) b.disabled = false; });
          toast(er.message, true);
        });
    }
    $('prApprove').onclick = function () { prPost(true); };
    $('prChange').onclick = function () { prPost(false); };
  }

  function reportableFile(file) {
    var path = String(file || '').replace(/\\/g, '/').replace(/^\.\//, '');
    var lower = path.toLowerCase();
    if (!path || /(^|\/)(?:\.hermes|node_modules|coverage|\.cache|\.freebuff)(?:\/|$)/.test(lower)) return false;
    return !/(^|\/)(?:[^/]*[_-]tmp|tmp[_-][^/]*)\.[^/]+$/i.test(path);
  }

  function reportFiles(report) {
    var seen = {};
    return (report.filesChanged || []).filter(function (file) {
      if (!reportableFile(file) || seen[file]) return false;
      seen[file] = true;
      return true;
    });
  }

  function readableSummary(summary) {
    return String(summary || '')
      .replace(/\s+\((\d+)\)\s+/g, function (_all, number) { return '\n' + number + '. '; })
      .replace(/\s+•\s+/g, '\n• ')
      .trim();
  }

  // Keep generated completion cards focused on the result. Some exploration
  // summaries append a generic stack description that reads like stray chat
  // narration; it is still available in the collapsed raw-summary disclosure.
  function reportLede(summary) {
    return readableSummary(summary)
      .replace(/\s*This is a dependency-free static website using vanilla HTML, CSS, and JavaScript\.?/i, '')
      .trim();
  }

  // ── Outcome parsing ─────────────────────────────────────────────────────
  // The model's summary often embeds a machine-style change dump
  // ("CHANGES (all inside repo_root): - NEW path (4490 chars) …"). Split it:
  // the prose before the dump is the outcome the user reads; the dump
  // becomes a human-phrased change list ("Added x", not "NEW x (4490 chars)").
  var CHANGE_VERBS = { NEW: 'Added', CREATED: 'Added', UPDATED: 'Updated', MODIFIED: 'Updated', REWROTE: 'Rewrote', DELETED: 'Removed', REMOVED: 'Removed' };
  function parseOutcome(summary) {
    var text = String(summary || '').replace(/\s+/g, ' ').trim();
    var out = { lede: text, changes: [], criteriaNote: '', sourceNote: '' };
    var crit = text.match(/(all \d+ acceptance criteria[^.]*\.)/i);
    if (crit) out.criteriaNote = crit[1];
    var src = text.match(/(no (?:production\/)?source code was (?:modified|changed)\.)/i);
    if (src) out.sourceNote = src[1];
    var cut = text.search(/\bCHANGES?\s*\(/i);
    var head = cut >= 0 ? text.slice(0, cut).trim() : text;
    var sents = sentencesOf(head);
    out.lede = sents.length > 2 ? sents.slice(0, 2).join(' ') : head;
    var rest = cut >= 0 ? text.slice(cut) : '';
    var cre = /[-\u2022]\s*(NEW|CREATED|UPDATED|MODIFIED|REWROTE|DELETED|REMOVED)\s+([^\s(,;:]+)/g;
    var m;
    while ((m = cre.exec(rest))) {
      out.changes.push({ action: m[1].toUpperCase(), path: m[2].replace(/[).,]+$/, '') });
    }
    return out;
  }
  // One status strip answering: did it work, was it verified, what moved.
  function reportStatusLine(status, checks, passed, changeCount) {
    var bits = [];
    bits.push(status === 'complete' ? '<span>🟢 <b>Completed</b></span>'
      : status === 'blocked' ? '<span>⚠️ <b>Blocked</b></span>' : '<span>❌ <b>Failed</b></span>');
    if (checks.length) {
      bits.push(passed === checks.length
        ? '<span>✅ All ' + checks.length + ' verification checks passed</span>'
        : '<span>' + (passed ? '⚠️' : '❌') + ' ' + passed + '/' + checks.length + ' verification checks passed</span>');
    }
    bits.push(changeCount
      ? '<span>🛠️ ' + changeCount + ' file' + (changeCount === 1 ? '' : 's') + ' changed</span>'
      : '<span>🔒 No source code was modified</span>');
    return '<div class="r-status">' + bits.join('') + '</div>';
  }
  function telemetryGridHtml(t) {
    var rows = [['Calls', t.calls], ['Tool calls', t.toolCalls], ['Compactions', t.compactions],
      ['Planning calls', t.planningCalls], ['Execution calls', t.executionCalls], ['Screenshots', t.screenshots],
      ['Wasted calls', t.wastedCalls], ['Input tokens', t.inputTokens], ['Cached tokens', t.cachedTokens],
      ['Output tokens', t.outputTokens]];
    var html = '<div class="sec"><h4>Token telemetry</h4><div class="exec-grid">';
    rows.forEach(function (p) { html += '<span class="k">' + p[0] + '</span><span class="v">' + esc(String(p[1])) + '</span>'; });
    return html + '</div></div>';
  }

  function shortText(text, limit) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    return text.length > limit ? text.slice(0, Math.max(1, limit - 1)).trim() + '…' : text;
  }

  function readableCheckLabel(label) {
    label = String(label || '').replace(/\s+/g, ' ').trim();
    var lower = label.toLowerCase();
    if (/\bnpm\s+(?:run\s+)?test\b/.test(lower)) return 'Project test suite';
    if (/\bnpm\s+run\s+(?:build|lint|typecheck)\b/.test(lower)) return shortText(label.match(/npm\s+run\s+\S+/i)?.[0] || label, 100);
    if (/^\$?\s*node\s+-e\b/i.test(label)) return 'Node verification command';
    return shortText(label, 150);
  }

  function compactVerification(text) {
    var raw = String(text || '').replace(/\s+/g, ' ').trim();
    var match = raw.match(/^(PASS|FAIL)\s*\[([^\]]+)\]\s*(.*)$/i);
    var status = match ? match[1].toUpperCase() : (/\bFAIL\b/i.test(raw) ? 'FAIL' : 'PASS');
    var kind = match ? match[2] : 'check';
    var label = match ? match[3] : raw;
    label = readableCheckLabel(label);
    return { passed: status === 'PASS', kind: kind, label: label || 'Verification recorded', details: raw };
  }

  function reportChecks(report) {
    if (Array.isArray(report.verificationDetails) && report.verificationDetails.length) {
      return report.verificationDetails.map(function (item) {
        var details = '';
        if (item.command) details += 'Command\n' + item.command;
        if (item.outputExcerpt) details += (details ? '\n\n' : '') + 'Output\n' + item.outputExcerpt;
        return { passed: item.passed !== false, kind: item.kind || 'check', label: readableCheckLabel(item.label || 'Verification recorded'), details: details, authority: item.authority || 'latest' };
      });
    }
    return (report.verification || []).map(function (item) {
      var parsed = compactVerification(item);
      parsed.authority = 'latest';
      return parsed;
    });
  }

  function checkRow(check) {
    var details = check.details
      ? '<details><summary>Show command and output</summary><pre>' + esc(check.details) + '</pre></details>'
      : '';
    return '<div class="verify-row"><span class="chip ' + (check.passed ? 'ok' : 'bad') + '">' + (check.passed ? 'PASS' : 'FAIL') + '</span>' +
      '<span class="verify-kind">' + esc(check.kind) + '</span><span class="verify-label">' + esc(check.label) + '</span>' +
      (check.authority === 'historical' ? '<span class="verify-kind">historical</span>' : '') + details + '</div>';
  }

  function verificationSection(checks) {
    if (!checks.length) return '';
    var latest = checks.filter(function (check) { return check.authority !== 'historical'; });
    var historical = checks.filter(function (check) { return check.authority === 'historical'; });
    var shown = latest.slice(0, 6);
    var html = '<div class="sec"><h4>Latest / authoritative verification</h4><div class="verify-list">' +
      (shown.length ? shown.map(checkRow).join('') : '<div class="empty">No verification ran against the final workspace state.</div>') + '</div>';
    if (latest.length > shown.length) {
      html += '<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;color:var(--muted)">Show ' + (latest.length - shown.length) + ' more current checks</summary><div class="verify-list" style="margin-top:7px">' + latest.slice(shown.length).map(checkRow).join('') + '</div></details>';
    }
    if (historical.length) {
      html += '<details style="margin-top:10px"><summary style="cursor:pointer;font-size:12px;color:var(--muted)">Historical evidence (' + historical.length + ')</summary><div class="verify-list" style="margin-top:7px">' + historical.map(checkRow).join('') + '</div></details>';
    }
    return html + '</div>';
  }

  function browserHighlight(activity) {
    if (!activity || !Number(activity.total)) return '';
    var total = Math.max(0, Number(activity.total) || 0);
    var successful = Math.max(0, Math.min(total, Number(activity.successful) || 0));
    var screenshots = Math.max(0, Number(activity.screenshots) || 0);
    return '<div class="browser-highlight"><div><b>Visual verification</b></div><span>' + successful + '/' + total + ' browser actions succeeded' +
      (screenshots ? ' · ' + screenshots + ' screenshot' + (screenshots === 1 ? '' : 's') : '') + '</span></div>';
  }

  function reportSideCard(report) {
    var checks = reportChecks(report);
    var currentChecks = checks.filter(function (check) { return check.authority !== 'historical'; });
    var passed = currentChecks.filter(function (check) { return check.passed; }).length;
    var files = reportFiles(report);
    var parsed = parseOutcome(report.summary);
    var ok = report.status === 'complete';
    var icon = ok ? '🎉' : (report.status === 'blocked' ? '⚠️' : '❌');
    var html = '<div class="report-flat" style="margin:12px 0 0;border-top:0;padding-top:0">' +
      '<div class="r-headline"><h2 style="font-size:14.5px">' + icon + ' ' + (ok ? 'Done' : (report.status === 'blocked' ? 'Blocked' : 'Failed')) + '</h2>' +
      '<span class="chip ' + (ok ? 'ok' : 'bad') + '">' + esc(report.status) + '</span>' +
      (report.phase && report.phase.kind === 'follow_up' ? '<span class="chip" style="margin-left:6px">follow-up</span>' : '') + '</div>' +
      '<p class="r-lede">' + esc(shortText(reportLede(parsed.lede || report.summary), 360)) + '</p>' +
      reportStatusLine(report.status, currentChecks, passed, files.length || (report.changes || []).length || parsed.changes.length) +
      browserHighlight(report.browserActivity) +
      ((checks.length || report.qualityMetrics) ? '<details class="exec-details" style="margin-top:12px"><summary><b>Technical evidence</b><span class="chev">\u25B8</span></summary>' + verificationSection(checks) + qualityMetricsHtml(report.qualityMetrics) + '</details>' : '') +
      '</div>';
    return html;
  }

  function qualityMetricsHtml(metrics) {
    if (!metrics || typeof metrics.score !== 'number') return '';
    var criteria = metrics.criteria || {};
    var verification = metrics.verification || {};
    var bits = [
      Math.round(metrics.score) + '/100 outcome quality',
      (Number(criteria.satisfied) || 0) + '/' + (Number(criteria.total) || 0) + ' criteria',
      (Number(verification.passing) || 0) + '/' + (Number(verification.authoritative) || 0) + ' final checks',
    ];
    if (typeof metrics.tokensPerVerifiedCriterion === 'number') bits.push(Math.round(metrics.tokensPerVerifiedCriterion).toLocaleString() + ' tokens / verified criterion');
    if (typeof metrics.wastedCallRate === 'number') bits.push(Math.round(metrics.wastedCallRate * 100) + '% wasted calls');
    return '<div class="r-note" data-quality-metrics><b>Outcome quality</b> · ' + esc(bits.join(' · ')) + '</div>';
  }

  function appendSummary(runId, session) {
    var stream = $('stream');
    if (!stream) return;
    var sess = S.sessions[runId];
    if (sess && sess.chatish) return;
    var r = session.report;
    var files = reportFiles(r);
    var checks = reportChecks(r);
    var currentChecks = checks.filter(function (check) { return check.authority !== 'historical'; });
    var passed = currentChecks.filter(function (check) { return check.passed; }).length;
    var parsed = parseOutcome(r.summary);
    var div = document.createElement('div');
    div.className = 'report-flat';
    var ok = r.status === 'complete';
    var doneIcon = ok ? '🎉' : (r.status === 'blocked' ? '⚠️' : '❌');
    var doneWord = ok ? 'Done' : (r.status === 'blocked' ? 'Blocked' : 'Failed');
    var html = '<div class="r-headline"><h2 title="' + esc(session.goal) + '">' + doneIcon + ' ' + doneWord + '</h2>' + chipFor(session.status) +
      '<button class="tool-btn-copy" data-sumcopy title="copy the full report as text">' + icon('copy') + ' Copy report</button></div>';
    html += '<p class="r-lede">' + esc(shortText(reportLede(parsed.lede || r.summary), 400)) + '</p>';
    html += reportStatusLine(r.status, currentChecks, passed, files.length || (r.changes || []).length || parsed.changes.length);
    if (r.phase && r.phase.kind === 'follow_up') html += '<div class="r-note">Follow-up delivery — earlier task work was preserved and is not repeated here.</div>';
    var findings = (r.findings || []).slice(0, 5);
    if (findings.length) {
      html += '<div class="r-sec"><h4>🔍 What Gitu found</h4><ul>' + findings.map(function (f) {
        return '<li>' + esc(shortText(f.claim, 220)) + '</li>';
      }).join('') + '</ul></div>';
    }
    // The reporter now emits short, reader-facing delivery lines. Legacy
    // summaries still fall back to the old parser, so saved runs keep their
    // useful detail without forcing raw tool output into the report.
    var deliveryItems = Array.isArray(r.changes) && r.changes.length
      ? r.changes.slice(0, 8)
      : parsed.changes.slice(0, 8).map(function (c) { return (CHANGE_VERBS[c.action] || 'Changed') + ' ' + c.path; });
    if (deliveryItems.length || files.length) {
      html += '<div class="r-sec"><h4>🛠️ Delivered</h4>' +
        (deliveryItems.length ? '<ul>' + deliveryItems.map(function (item) { return '<li>' + esc(shortText(item, 260)) + '</li>'; }).join('') + '</ul>' : '') +
        (files.length ? '<div class="r-files">' + files.slice(0, 12).map(function (f) { return projectFileChipHtml(runId, f, f); }).join('') + '</div>' : '<div class="r-note">🔒 No source code was modified.</div>') +
        '</div>';
    } else if (!files.length) {
      html += '<div class="r-note">🔒 No source code was modified.</div>';
    }
    html += browserHighlight(r.browserActivity);
    if (r.remainingRisks.length) html += '<div class="r-sec"><h4>⚠️ Remaining risks</h4><ul>' + r.remainingRisks.map(function (v) { return '<li>' + esc(v) + '</li>'; }).join('') + '</ul></div>';
    if (r.followUps.length) html += '<div class="r-sec"><h4>→ Follow-ups</h4><ul>' + r.followUps.map(function (v) { return '<li>' + esc(v) + '</li>'; }).join('') + '</ul></div>';
    // Technical evidence — verification rows, the raw model summary and the
    // token telemetry all live behind ONE collapsed disclosure. Available,
    // not in the way.
    var evHtml = verificationSection(checks);
    var rawHtml = '<div class="sec"><h4>Raw summary</h4><pre class="exec-pre" style="max-height:240px">' + esc(readableSummary(r.summary)) + '</pre></div>';
    var teleHtml = r.tokenTelemetry ? telemetryGridHtml(r.tokenTelemetry) : '';
    var qualityHtml = qualityMetricsHtml(r.qualityMetrics);
    if (evHtml || rawHtml || teleHtml || qualityHtml) {
      html += '<details class="exec-details" style="margin-top:16px"><summary><b>Technical evidence</b><span class="chev">\u25B8</span></summary>' + qualityHtml + evHtml + rawHtml + teleHtml + '</details>';
    }
    div.innerHTML = html;
    // The full-report text exporter finally gets a consumer.
    setupCopyButton(div.querySelector('[data-sumcopy]'), function () { return reportText(r); });
    var working = $('working');
    if (working) stream.insertBefore(div, working); else stream.appendChild(div);
    if (sess && sess.justOpened) stream.scrollTop = 0;
    else stickScroll(stream, true);
    if (sess) sess.justOpened = false;
  }

  function projectFileChipHtml(runId, path, downloadPath) {
    if (!downloadPath) return '<span class="file-chip">' + esc(path) + '</span>';
    var url = '/api/runs/' + encodeURIComponent(runId) + '/project-file?path=' + encodeURIComponent(downloadPath);
    return '<a class="file-chip" href="' + esc(url) + '" download title="Download ' + esc(path) + '">' + esc(path) + '</a>';
  }

  function renderRunSide(runId) {
    var sess = S.sessions[runId];
    var body = $('sideBody');
    if (!body || !sess) return;
    if (sess.side === 'context') { renderContext(runId); stopBrowserPoll(); return; }
    if (sess.side === 'browser') { showBrowserPanel(runId); return; }
    if (sess.side === 'git') { renderGitPanel(runId); stopBrowserPoll(); return; }
    stopBrowserPoll();
    if (sess.chatish) { body.innerHTML = '<div class="empty" style="padding:16px 6px">Conversation session — no task state.</div>'; return; }
    var L = sess.ledger;
    if (!L) { body.innerHTML = '<div class="empty">Waiting for task ledger…</div>'; return; }
    var failure = sess.session && sess.session.error;
    var satisfied = L.acceptanceCriteria.filter(function (c) { return c.satisfied; }).length;
    var planDone = L.plan.filter(function (s) { return s.status === 'done'; }).length;
    var subscriptionRuntimeFailure = typeof failure === 'string' && /(ChatGPT subscription runtime could not start|ChatGPT subscription request failed:\s*spawn\s+(?:EFTYPE|ENOENT|EACCES|EPERM))/i.test(failure);
    var recoveryHint = subscriptionRuntimeFailure
      ? 'The local Codex runtime could not start. Restart Agent Gitu; if it persists, repair or reinstall Agent Gitu (or update Codex), then retry. Changing models will not fix this runtime error.'
      : 'Choose an available model in the composer, then send a message to retry. Your task and history are preserved.';
    var html = failure
      ? '<div style="margin:0 0 14px;padding:10px;border:1px solid rgba(255,100,101,.4);border-radius:9px;background:rgba(255,100,101,.1);color:#ffb3b4;font-size:12px;line-height:1.45"><b>Last attempt failed.</b> ' + esc(failure) + '<br>' + recoveryHint + '</div>'
      : '';
    html += '<div class="side-summary"><div class="t">Task state</div><div class="d">' +
      satisfied + '/' + L.acceptanceCriteria.length + ' criteria · ' + planDone + '/' + L.plan.length + ' plan steps · ' + L.evidence.length + ' checks</div></div>';
    if (L.blockers.length) {
      html += '<div class="section-h" style="margin-top:0">Blockers</div>';
      L.blockers.slice(-3).forEach(function (b) { html += '<div class="crit"><span class="dot" style="background:var(--red)"></span><div>' + esc(b) + '</div></div>'; });
    }
    html += '<div class="section-h" style="margin-top:0">Acceptance criteria</div>';
    if (!L.acceptanceCriteria.length) html += '<div class="empty">none set yet</div>';
    var orderedCriteria = L.acceptanceCriteria.filter(function (c) { return !c.satisfied; }).concat(L.acceptanceCriteria.filter(function (c) { return c.satisfied; }));
    function criterionHtml(c) {
      var reqHtml = c.verification
        ? '<div class="crit-req">Required: <code>' + esc(c.verification) + '</code>' +
          (c.evidenceType && c.evidenceType !== 'any' ? ' <span class="chip" style="font-size:10px;padding:0 5px">' + esc(c.evidenceType) + '</span>' : '') + '</div>'
        : '';
      return '<div class="crit ' + (c.satisfied ? 'done' : '') + '"><span class="dot"></span><div style="flex:1">' + esc(c.text) +
        reqHtml +
        (c.evidenceIds && c.evidenceIds.length ? '<div class="ev-ids">' + esc(c.evidenceIds.join(', ')) + ' ✓</div>' : '') + '</div></div>';
    }
    html += orderedCriteria.slice(0, 6).map(criterionHtml).join('');
    if (orderedCriteria.length > 6) html += '<details class="side-more"><summary>Show ' + (orderedCriteria.length - 6) + ' more criteria</summary>' + orderedCriteria.slice(6).map(criterionHtml).join('') + '</details>';
    html += '<div class="section-h">Plan' + (L.planApproved ? ' <span class="chip ok" style="margin-left:6px">approved</span>' : '') + '</div>';
    if (!L.plan.length) html += '<div class="empty">no plan yet</div>';
    var orderedPlan = L.plan.filter(function (s) { return s.status === 'in_progress'; }).concat(L.plan.filter(function (s) { return s.status === 'pending'; }), L.plan.filter(function (s) { return s.status !== 'in_progress' && s.status !== 'pending'; }));
    function planHtml(s) { return '<div class="step"><span class="st ' + s.status + '">' + esc(s.status) + '</span><div>' + esc(s.description) + ' <span style="color:var(--faint)">· ' + esc(s.verification) + '</span></div></div>'; }
    html += orderedPlan.slice(0, 6).map(planHtml).join('');
    if (orderedPlan.length > 6) html += '<details class="side-more"><summary>Show ' + (orderedPlan.length - 6) + ' more plan steps</summary>' + orderedPlan.slice(6).map(planHtml).join('') + '</details>';
    html += '<div class="section-h">Evidence</div>';
    if (!L.evidence.length) html += '<div class="empty">none yet</div>';
    function evidenceHtml(e) { return '<div class="step"><span class="st ' + (e.passed ? 'done' : 'failed') + '">' + (e.passed ? 'PASS' : 'FAIL') + '</span><div>' + esc(e.label) + '</div></div>'; }
    var recentEvidence = L.evidence.slice(-8);
    html += recentEvidence.map(evidenceHtml).join('');
    if (L.evidence.length > 8) html += '<details class="side-more"><summary>Show ' + (L.evidence.length - 8) + ' older checks</summary>' + L.evidence.slice(0, -8).map(evidenceHtml).join('') + '</details>';
    html += '<div class="section-h">Files changed</div>';
    var visibleFiles = L.filesChanged.filter(reportableFile);
    html += visibleFiles.length ? visibleFiles.slice(0, 12).map(function (f) { return projectFileChipHtml(runId, f, f); }).join('') : '<div class="empty">none</div>';
    if (visibleFiles.length > 12) html += '<details class="side-more"><summary>Show ' + (visibleFiles.length - 12) + ' more files</summary>' + visibleFiles.slice(12).map(function (f) { return projectFileChipHtml(runId, f, f); }).join('') + '</details>';
    if (L.report) html += reportSideCard(L.report);
    body.innerHTML = html;
  }

  function applyLayout() {
    applyWidths();
    var shell = document.querySelector('.shell');
    if (shell) shell.classList.toggle('left-collapsed', !!S.settings.leftCollapsed);
    var run = document.querySelector('.run');
    if (run) run.classList.toggle('collapsed-side', !!S.settings.rightCollapsed);
    var btn = $('sbCollapse');
    if (btn) btn.innerHTML = S.settings.leftCollapsed ? '&#187;' : '&#171;';
  }

  function toggleMobileNav(open) {
    var shell = document.querySelector('.shell');
    var btn = $('mobileNav');
    if (!shell) return;
    shell.classList.toggle('mobile-nav-open', Boolean(open));
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function showRunPanel() {
    var rs = document.querySelector('.run-side');
    if (!rs) return;
    if (window.innerWidth <= 1080) {
      rs.classList.add('narrow-open');
      var fab = $('sideFab');
      if (fab) fab.querySelector('span').textContent = 'Close';
    } else {
      S.settings.rightCollapsed = false;
      persist();
      applyLayout();
    }
  }

  function applyWidths() {
    var rs = document.documentElement.style;
    rs.setProperty('--sbw', (S.settings.sbWidth || 264) + 'px');
    rs.setProperty('--rsw', (S.settings.sideWidth || 380) + 'px');
  }

  function bindResize(id, side) {
    var h = $(id);
    if (!h) return;
    h.addEventListener('mousedown', function (e) {
      e.preventDefault();
      var el = side === 'left' ? document.querySelector('.sb') : document.querySelector('.run-side');
      if (!el) return;
      var startX = e.clientX;
      var startW = el.getBoundingClientRect().width;
      h.classList.add('active');
      var move = function (ev) {
        var dx = ev.clientX - startX;
        var w = Math.max(200, Math.min(760, Math.round(side === 'left' ? startW + dx : startW - dx)));
        if (side === 'left') S.settings.sbWidth = w; else S.settings.sideWidth = w;
        applyWidths();
      };
      var up = function () {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        h.classList.remove('active');
        persist();
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  function sideTabsState() {
    if (!S.settings.sideTabs) S.settings.sideTabs = { state: true, context: true, browser: true, git: true };
    return S.settings.sideTabs;
  }

  function renderSideTabs(sess, runId) {
    var el = $('sideTabs');
    if (!el) return;
    var tabs = sideTabsState();
    if (tabs[sess.side] === false) {
      sess.side = tabs.state !== false ? 'state' : tabs.context !== false ? 'context' : 'browser';
    }
    var html = '';
    if (tabs.state !== false) html += '<button class="side-tab ' + (sess.side === 'state' ? 'active' : '') + '" data-side="state">State</button>';
    if (tabs.context !== false) html += '<button class="side-tab ' + (sess.side === 'context' ? 'active' : '') + '" data-side="context">Context</button>';
    if (tabs.browser !== false) html += '<button class="side-tab ' + (sess.side === 'browser' ? 'active' : '') + '" data-side="browser">' + icon('globe') + ' Browser</button>';
    if (tabs.git !== false) html += '<button class="side-tab ' + (sess.side === 'git' ? 'active' : '') + '" data-side="git">' + icon('branch') + ' Git</button>';
    html += '<button class="collapse-tab" id="tabMgr" title="add / remove tabs" style="font-size:14px">+</button>';
    html += '<button class="collapse-tab" id="rsCollapse" title="close details panel" aria-label="Close details panel">&#187;</button>';
    el.innerHTML = html;
    el.querySelectorAll('.side-tab').forEach(function (t) {
      t.onclick = function () { sess.side = t.getAttribute('data-side'); renderSideTabs(sess, runId); renderRunSide(runId); };
    });
    $('tabMgr').onclick = function () { openTabMgr($('tabMgr'), sess, runId); };
    $('rsCollapse').onclick = function () {
      var panel = document.querySelector('.run-side');
      if (window.innerWidth <= 1080 && panel) {
        panel.classList.remove('narrow-open');
        var fab = $('sideFab');
        if (fab) fab.querySelector('span').textContent = 'Panel';
        return;
      }
      S.settings.rightCollapsed = true;
      persist();
      applyLayout();
    };
  }

  function closeTabMgr() { var m = $('tabMgrMenu'); if (m) m.remove(); }

  function openTabMgr(anchor, sess, runId) {
    closeTabMgr();
    var defs = [['state', 'State'], ['context', 'Context'], ['browser', 'Browser'], ['git', 'Git']];
    var tabs = sideTabsState();
    var d = document.createElement('div');
    d.id = 'tabMgrMenu';
    var r = anchor.getBoundingClientRect();
    d.style.cssText = 'position:fixed;z-index:70;background:var(--card);border:1px solid var(--border);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:6px;min-width:150px;top:' + (r.bottom + 6) + 'px;right:' + (window.innerWidth - r.right) + 'px';
    d.innerHTML = defs.map(function (x) {
      return '<label style="display:flex;gap:8px;align-items:center;padding:5px 8px;border-radius:7px;cursor:pointer;font-size:12.5px"><input type="checkbox" data-tab="' + x[0] + '"' + (tabs[x[0]] !== false ? ' checked' : '') + ' style="margin:0;width:auto">' + x[1] + '</label>';
    }).join('');
    document.body.appendChild(d);
    d.querySelectorAll('input[data-tab]').forEach(function (cb) {
      cb.onchange = function () {
        var key = cb.getAttribute('data-tab');
        var count = 0;
        defs.forEach(function (x) { if (x[0] === key ? cb.checked : S.settings.sideTabs[x[0]] !== false) count++; });
        if (count === 0) { cb.checked = true; toast('At least one tab must stay visible', true); return; }
        S.settings.sideTabs[key] = cb.checked;
        persist();
        renderSideTabs(sess, runId);
        renderRunSide(runId);
      };
    });
    setTimeout(function () {
      document.addEventListener('mousedown', function close(e) {
        if (!d.contains(e.target) && e.target !== anchor) { d.remove(); document.removeEventListener('mousedown', close); }
      });
    }, 0);
  }

  function clientNormalize(input) {
    var url = String(input || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) {
      if (/^localhost(:\d+)?/i.test(url) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?/.test(url)) url = 'http://' + url;
      else if (url.indexOf('.') < 0 && url.indexOf(':') < 0) url = 'https://www.bing.com/search?q=' + encodeURIComponent(url);
      else url = 'https://' + url;
    }
    return url;
  }

  function gitQueryPath() { return effectiveProjectPath(); }

  function renderGitPanel(runId) {
    var body = $('sideBody');
    body.innerHTML = '<div style="padding:4px 2px"><div id="gitHead" class="meta" style="margin-bottom:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">loading…</div><div id="gitBody"></div></div>';
    refreshGit();
  }

  function refreshGit() {
    api('/api/git?path=' + encodeURIComponent(gitQueryPath())).then(function (g) {
      var head = $('gitHead');
      var gb = $('gitBody');
      if (!head || !gb) return;
      if (!g.available) {
        head.textContent = 'Not a git repository' + (g.root ? ' (' + g.root + ')' : '') + '.';
        gb.innerHTML = '<p class="meta">Initialize git to track changes, commit and push from here.</p><button class="btn dark" id="gitInit">git init</button>';
        $('gitInit').onclick = function () {
          api('/api/git/init', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: gitQueryPath() }) })
            .then(function () { toast('git initialized'); refreshGit(); })
            .catch(function (e) { toast(e.message, true); });
        };
        return;
      }
      var files = g.files || [];
      head.innerHTML = '<span class="chip info">' + esc(g.branch || '?') + '</span>' +
        (g.ahead ? ' <span class="chip">ahead ' + g.ahead + '</span>' : '') +
        (g.behind ? ' <span class="chip warn">behind ' + g.behind + '</span>' : '') +
        '<span class="meta" style="word-break:break-all;flex:1">' + esc(g.remote || 'no remote') + '</span>' +
        '<button class="ubtn" id="gitRefresh" title="refresh">' + icon('retry') + '</button>';
      $('gitRefresh').onclick = refreshGit;
      var html = '<div class="section-h" style="margin-top:0">Working tree (' + files.length + ')</div>';
      if (!files.length) html += '<div class="empty">clean — no changes</div>';
      html += files.map(function (f) {
        return '<div class="grow-row"><label style="display:flex;gap:7px;align-items:center;flex:1;cursor:pointer;min-width:0">' +
          '<input type="checkbox" class="chk gitf" data-f="' + esc(f.path) + '" style="margin:0;width:auto" checked>' +
          '<span class="chip ' + (f.untracked ? 'warn' : 'info') + '" style="flex:none">' + esc(f.status) + '</span>' +
          '<span class="gitpath" data-diff="' + esc(f.path) + '" title="view diff">' + esc(f.path) + '</span></label>' +
          (f.untracked ? '' : '<button class="ubtn gitdiscard" data-d="' + esc(f.path) + '" title="discard changes">' + icon('x') + '</button>') +
          '</div>';
      }).join('');
      html += '<pre class="skinstr" id="gitDiff" hidden></pre>';
      html += '<div class="section-h">Commit &amp; push</div>' +
        '<input id="gitMsg" placeholder="commit message" style="width:100%;border:1px solid var(--border2);border-radius:8px;background:var(--card2);color:var(--text);padding:7px 9px;margin-bottom:8px">' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
        '<button class="btn dark" id="gitCommitSel">Commit selected</button>' +
        '<button class="btn ghost" id="gitCommitAll">Commit all</button>' +
        '<button class="btn ghost" id="gitPush">' + (g.ahead ? 'Push (' + g.ahead + ')' : 'Push') + '</button>' +
        '</div>';
      gb.innerHTML = html;
      gb.querySelectorAll('[data-diff]').forEach(function (el) {
        el.onclick = function () {
          var pre = $('gitDiff');
          var f = el.getAttribute('data-diff');
          if (pre.dataset.cur === f && !pre.hidden) { pre.hidden = true; return; }
          pre.hidden = false; pre.dataset.cur = f; pre.textContent = 'loading diff…';
          api('/api/git/diff?path=' + encodeURIComponent(gitQueryPath()) + '&file=' + encodeURIComponent(f)).then(function (d) {
            pre.textContent = d.diff || '(no unstaged diff — file may be untracked or staged)';
          }).catch(function (e) { pre.textContent = e.message; });
        };
      });
      gb.querySelectorAll('.gitdiscard').forEach(function (el) {
        el.onclick = function () {
          var f = el.getAttribute('data-d');
          if (!confirm('Discard local changes in ' + f + '?')) return;
          api('/api/git/discard', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: gitQueryPath(), file: f }) })
            .then(function () { toast('Discarded ' + f); refreshGit(); })
            .catch(function (e) { toast(e.message, true); });
        };
      });
      function selected() {
        var out = [];
        gb.querySelectorAll('.gitf').forEach(function (cb) { if (cb.checked) out.push(cb.getAttribute('data-f')); });
        return out;
      }
      function commit(filesOrNull) {
        var msg = $('gitMsg').value.trim();
        if (!msg) { toast('Commit message required', true); $('gitMsg').focus(); return; }
        if (filesOrNull && !filesOrNull.length) { toast('No files selected', true); return; }
        var payload = { path: gitQueryPath(), message: msg };
        if (filesOrNull) payload.files = filesOrNull;
        api('/api/git/commit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
          .then(function (d) { toast('Committed ' + d.commit); $('gitMsg').value = ''; refreshGit(); })
          .catch(function (e) { toast(e.message, true); });
      }
      $('gitCommitSel').onclick = function () { commit(selected()); };
      $('gitCommitAll').onclick = function () { commit(null); };
      $('gitPush').onclick = function () {
        api('/api/git/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: gitQueryPath() }) })
          .then(function () { toast('Pushed to remote'); refreshGit(); })
          .catch(function (e) { toast(e.message, true); });
      };
    }).catch(function (e) {
      var head = $('gitHead');
      if (head) head.textContent = e.message;
    });
  }

  function stopBrowserPoll() { if (S.bPoll) { clearInterval(S.bPoll); S.bPoll = null; } }

  function startBrowserPoll() {
    stopBrowserPoll();
    S.bPoll = setInterval(refreshBrowserView, 2500);
  }

  function refreshBrowserView() {
    api('/api/browser').then(function (d) {
      var hint = $('bHint2');
      if (!hint) return;
      if (!d.has) {
        hint.textContent = 'The browser window opens in the desktop app on first use (npm run app).';
        var im = $('bImg2');
        if (im) im.removeAttribute('src');
        return;
      }
      hint.textContent = (d.state.title || '(blank page)') + (d.state.driving ? ' — Agent Gitu is driving' : '');
      var u = $('bUrl2');
      if (u && document.activeElement !== u) u.value = d.state.url === 'about:blank' ? '' : d.state.url || '';
      var bb = $('bBack2'), ff = $('bFwd2');
      if (bb) bb.disabled = !d.state.canBack;
      if (ff) ff.disabled = !d.state.canForward;
      var drv = $('bDrive2');
      if (drv) drv.hidden = !d.state.driving;
      api('/api/browser/screenshot').then(function (shot) {
        var img = $('bImg2');
        if (img && shot.pngBase64) img.src = 'data:image/png;base64,' + shot.pngBase64;
      }).catch(function () {});
    }).catch(function () {});
  }

  function showBrowserPanel(runId) {
    var body = $('sideBody');
    body.innerHTML =
      '<div class="bpanel2">' +
      '<div class="nav">' +
      '<button class="ubtn" id="bBack2" title="back" style="width:28px;height:26px">' + icon('back') + '</button>' +
      '<button class="ubtn" id="bFwd2" title="forward" style="width:28px;height:26px;transform:scaleX(-1)">' + icon('back') + '</button>' +
      '<button class="ubtn" id="bReload2" title="reload" style="width:28px;height:26px">' + icon('retry') + '</button>' +
      '<input id="bUrl2" placeholder="Enter address" spellcheck="false">' +
      '<button class="btn dark" id="bGo2">Go</button>' +
      '<button class="btn ghost" id="bOpen2" title="open / focus the browser window">Open</button>' +
      '</div>' +
      '<div class="bwrap"><div class="bdrive" id="bDrive2" hidden>' + icon('bolt') + ' Agent Gitu is driving the browser</div><img id="bImg2" alt="live browser view"></div>' +
      '<div class="empty" id="bHint2" style="margin-top:8px"></div></div>';
    $('bBack2').onclick = function () { api('/api/browser/back', { method: 'POST' }).then(refreshBrowserView).catch(function (e) { toast(e.message, true); }); };
    $('bFwd2').onclick = function () { api('/api/browser/forward', { method: 'POST' }).then(refreshBrowserView).catch(function (e) { toast(e.message, true); }); };
    $('bReload2').onclick = function () { api('/api/browser/reload', { method: 'POST' }).then(refreshBrowserView).catch(function (e) { toast(e.message, true); }); };
    $('bGo2').onclick = function () {
      var url = clientNormalize($('bUrl2').value);
      if (!url) return;
      api('/api/browser/navigate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: url }) })
        .then(refreshBrowserView).catch(function (e) { toast(e.message, true); });
    };
    $('bUrl2').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('bGo2').click(); });
    $('bOpen2').onclick = function () { api('/api/browser/focus', { method: 'POST' }).then(refreshBrowserView).catch(function (e) { toast(e.message, true); }); };
    refreshBrowserView();
    startBrowserPoll();
  }

  function reportText(r) {
    var lines = [r.status.toUpperCase() + ' — ' + r.summary];
    if (r.phase && r.phase.kind === 'follow_up') lines.push('Scope: follow-up work (earlier task history preserved)');
    if (r.changes && r.changes.length) lines.push('', 'Delivered:', '  ' + r.changes.join('\n  '));
    if (r.filesChanged.length) lines.push('Files: ' + r.filesChanged.join(', '));
    if (r.verification.length) lines.push('', 'Verification:', '  ' + r.verification.join('\n  '));
    if (r.remainingRisks.length) lines.push('', 'Risks:', '  ' + r.remainingRisks.join('\n  '));
    if (r.followUps.length) lines.push('', 'Follow-ups:', '  ' + r.followUps.join('\n  '));
    return lines.join('\n');
  }

  function renderContext(runId) {
    var sess = S.sessions[runId];
    var body = $('sideBody');
    var L = sess.ledger;
    var session = sess.session;
    var html = '<div class="stat-grid">';
    function stat(k, v, mono) { html += '<div class="stat"><div class="k">' + esc(k) + '</div><div class="v ' + (mono ? 'mono' : '') + '" title="' + esc(v) + '">' + esc(v) + '</div></div>'; }
    stat('Session', runId, true);
    stat('Status', session ? session.status : '—');
    stat('Provider', session && session.provider ? session.provider : '—');
    stat('Model', session && session.model ? prettyModelName(session.model) : '—');
    stat('Mode', L ? L.mode : '—');
    // The run's EFFECTIVE effort (the effort planner may escalate); the
    // composer selection is only what the NEXT run would use.
    stat('Effort', (L && L.effortPlan && L.effortPlan.llmEffort) ? L.effortPlan.llmEffort + ' (run)' : (S.sel.effort || '—'));
    stat('Started', session ? shortDate(session.startedAt) : '—');
    stat('Finished', session && session.finishedAt ? shortDate(session.finishedAt) : 'running…');
    if (L) {
      stat('Actions', L.actions.length);
      stat('Plan attempts', L.plan.reduce(function (n, s) { return n + s.attempts; }, 0));
      stat('Evidence', L.evidence.length);
      stat('Files changed', L.filesChanged.length);
      stat('Checkpoints', L.checkpoints.length);
    }
    html += '</div>';
    var U = session && session.usage;
    html += '<div class="section-h">Usage &amp; cost</div><div class="stat-grid">';
    stat('Messages', U ? U.messages : 0);
    stat('Input tokens', U ? formatTokens(U.inputTokens) : '—', true);
    stat('Cached tokens', U ? formatTokens(U.cachedTokens) : '—', true);
    stat('Output tokens', U ? formatTokens(U.outputTokens) : '—', true);
    stat('Total cost', U && typeof U.costUsd === 'number' ? '$' + U.costUsd.toFixed(4) : '—', true);
    html += '</div>';
    if (L && L.actions.length) {
      var counts = { read: 0, write: 0, command: 0, other: 0 };
      L.actions.forEach(function (a) {
        if (a.tool === 'read_file' || a.tool === 'list_files' || a.tool === 'search_files') counts.read++;
        else if (a.tool === 'write_file' || a.tool === 'apply_edit') counts.write++;
        else if (a.tool === 'run_command') counts.command++;
        else counts.other++;
      });
      var total = L.actions.length;
      function pct(n) { return Math.round((n / total) * 1000) / 10; }
      html += '<div class="section-h">Action breakdown</div><div class="bar">' +
        '<span style="width:' + pct(counts.read) + '%;background:#16a34a"></span>' +
        '<span style="width:' + pct(counts.write) + '%;background:#d97706"></span>' +
        '<span style="width:' + pct(counts.command) + '%;background:#8a6d1a"></span>' +
        '<span style="width:' + pct(counts.other) + '%;background:#9ca3af"></span></div>' +
        '<div class="legend"><span><i style="background:#16a34a"></i>Reads ' + pct(counts.read) + '%</span>' +
        '<span><i style="background:#d97706"></i>Writes ' + pct(counts.write) + '%</span>' +
        '<span><i style="background:#8a6d1a"></i>Commands ' + pct(counts.command) + '%</span>' +
        '<span><i style="background:#9ca3af"></i>Other ' + pct(counts.other) + '%</span></div>';
    }
    html += '<div class="section-h">Raw events</div><div class="raw">';
    var evs = (sess.events || []).filter(function (e) { return String(e.text).indexOf('tdelta') !== 0; }).slice(-60).reverse();
    if (!evs.length) html += '<div class="row"><span>no events yet</span></div>';
    evs.forEach(function (ev) {
      html += '<div class="row"><span>' + esc(String(ev.text).slice(0, 90)) + '</span><span class="t">' + esc(new Date(ev.t).toLocaleTimeString()) + '</span></div>';
    });
    html += '</div>';
    body.innerHTML = html;
  }

  function openSettings(section) {
    S.setSection = section || 'general';
    $('settings').hidden = false;
    if ($('sideFab')) $('sideFab').hidden = true;
    renderSettings();
  }
  function closeSettings() {
    $('settings').hidden = true;
    if ($('sideFab')) $('sideFab').hidden = S.active === 'home';
  }

  function refreshModels() {
    api('/api/models')
      .then(function (data) { S.models = data.providers; S.modelsLoaded = true; ensureUsableModelSelection(); renderSettings(); })
      .catch(function () { renderSettings(); });
  }

  function renderSettings() {
    var items = [
      ['general', 'gear', 'General'],
      ['providers', 'layers', 'Providers'],
      ['connections', 'plug', 'Connections'],
      ['permissions', 'shield', 'Permissions'],
      ['workspace', 'folder', 'Workspace'],
      ['project', 'search', 'Project'],
      ['agents', 'plug', 'Specialist agents'],
      ['skills', 'bolt', 'Skills'],
      ['mcp', 'plug', 'MCP servers'],
      ['cron', 'clock', 'Scheduled / heartbeat']
    ];
    $('setnav').innerHTML =
      '<button class="back" id="setBack">' + icon('back') + ' Back to app</button>' +
      '<div class="sect">Settings</div>' +
      items.map(function (it) {
        return '<button class="item ' + (S.setSection === it[0] ? 'active' : '') + '" data-sec="' + it[0] + '"><span class="ico">' + icon(it[1]) + '</span>' + it[2] + '</button>';
      }).join('');
    $('setBack').onclick = closeSettings;
    $('setnav').querySelectorAll('[data-sec]').forEach(function (el) {
      el.onclick = function () { S.setSection = el.getAttribute('data-sec'); renderSettings(); };
    });
    var b = $('setbody');
    // Async sections seed an instant loading row instead of a blank flash.
    if (S.setSection !== 'general' && S.setSection !== 'workspace') {
      b.innerHTML = '<h1>' + esc(S.setSection === 'mcp' ? 'MCP servers' : S.setSection === 'skills' ? 'Skills' : S.setSection === 'agents' ? 'Specialist agents' : S.setSection === 'cron' ? 'Scheduled / heartbeat' : S.setSection === 'connections' ? 'Connections' : S.setSection) + '</h1><p class="meta" style="color:var(--muted);font-size:12.5px">loading…</p>';
    }
    if (S.setSection === 'general') {
      b.innerHTML = '<h1>General</h1>' +
        '<h2>Defaults</h2><div class="setcard">' +
        '<div class="setrow"><div class="grow"><div class="t">Default workflow</div><div class="d">Plan mode pauses for your review; Build runs straight through; Chat answers only.</div></div>' +
        '<select id="gWf"><option value="review">Plan mode</option><option value="auto">Build mode</option><option value="chat">Chat mode</option></select></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Intelligence level</div><div class="d">Reasoning effort sent to the model (dynamic per provider).</div></div><select id="gEffort"></select></div>' +
        '</div>';
      $('gWf').value = S.sel.wf;
      fillEffort('gEffort', provOf(S.sel.model));
      $('gEffort').value = S.sel.effort;
      $('gWf').onchange = function () { S.sel.wf = $('gWf').value; persist(); };
      $('gEffort').onchange = function () { S.sel.effort = $('gEffort').value; persist(); };
    } else if (S.setSection === 'connections') {
      b.innerHTML = '<h1>Connections</h1>' +
        '<p style="color:var(--muted);font-size:12.5px">Save a provider connection once, then let tasks reuse its documented capabilities. Credentials stay separate from global skills, task history, and model context.</p>' +
        '<div class="setcard" style="margin-bottom:12px"><div class="t" style="margin-bottom:10px">Add a provider connection</div>' +
        '<div class="d" style="margin-bottom:10px">The form registers a read-only validation path. During a task, Gitu can research a documented write operation and show its exact request for your individual approval; it never gains unrestricted provider write access.</div>' +
        '<div style="display:grid;gap:8px;max-width:620px">' +
        '<input id="connLabel" placeholder="Connection name (for example: Production platform)">' +
        '<input id="connProvider" placeholder="Provider identifier (for example: platform-api)">' +
        '<input id="connBaseUrl" placeholder="Base URL (HTTPS, or HTTP only for localhost)">' +
        '<input id="connDocsUrl" placeholder="Documentation URL (optional, HTTPS)">' +
        '<input id="connCapabilities" placeholder="Capabilities, comma-separated (for example: servers.read, databases.read)">' +
        '<input id="connValidationPath" value="/" placeholder="Read-only validation path, for example: /api/v1/servers">' +
        '<input id="connToken" type="password" autocomplete="new-password" placeholder="Paste API key or token — never sent to the model">' +
        '<div><button class="btn dark" id="saveConnection">Save and validate</button></div></div></div>' +
        '<div class="setcard" id="connectionsBody"><div class="meta">loading connections…</div></div>';
      function renderConnections() {
        api('/api/connections').then(function (data) {
          var body = $('connectionsBody');
          if (!body || S.setSection !== 'connections') return;
          var rows = data.connections || [];
          body.innerHTML = rows.map(function (c) {
            var capabilities = (c.capabilities || []).join(', ') || 'no declared capabilities';
            var status = c.lastValidationStatus === 'ok' ? '<span class="chip ok">validated</span>' : c.lastValidationStatus === 'failed' ? '<span class="chip bad">validation failed</span>' : '<span class="chip">not tested</span>';
            return '<div class="setrow" style="align-items:flex-start"><div class="grow"><div class="t">' + esc(c.label) + ' ' + status + '</div><div class="d">' + esc(c.provider) + ' · ' + esc(capabilities) + '</div><div class="hint">' + esc(c.baseUrl) + (c.documentationUrl ? ' · docs configured' : '') + ' · credential ' + (c.hasCredential ? 'saved locally' : 'missing') + '</div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost" data-testconn="' + esc(c.id) + '">Test</button><button class="btn ghost" data-delconn="' + esc(c.id) + '">Remove</button></div></div>';
          }).join('') || '<div class="meta">No saved connections yet.</div>';
          body.querySelectorAll('[data-testconn]').forEach(function (btn) {
            btn.onclick = function () {
              var id = btn.getAttribute('data-testconn'); btn.disabled = true; btn.textContent = 'Testing…';
              api('/api/connections/' + encodeURIComponent(id) + '/test', { method: 'POST' }).then(function () { toast('Connection validated'); renderConnections(); }).catch(function (e) { toast((e && e.message) || 'Connection failed', true); }).finally(function () { btn.disabled = false; btn.textContent = 'Test'; });
            };
          });
          body.querySelectorAll('[data-delconn]').forEach(function (btn) {
            btn.onclick = function () {
              var id = btn.getAttribute('data-delconn');
              if (!window.confirm('Remove this connection, its local credential, and its generated global skill?')) return;
              api('/api/connections/' + encodeURIComponent(id), { method: 'DELETE' }).then(function () { toast('Connection removed'); renderConnections(); }).catch(function (e) { toast((e && e.message) || 'Could not remove connection', true); });
            };
          });
        }).catch(function (e) { if ($('connectionsBody')) $('connectionsBody').innerHTML = '<div class="meta">Could not load connections: ' + esc((e && e.message) || 'unknown error') + '</div>'; });
      }
      $('saveConnection').onclick = function () {
        var btn = this;
        var caps = $('connCapabilities').value.split(',').map(function (v) { return v.trim(); }).filter(Boolean);
        var capability = caps[0] || 'connection.discover';
        var profile = {
          label: $('connLabel').value,
          provider: $('connProvider').value,
          baseUrl: $('connBaseUrl').value,
          documentationUrl: $('connDocsUrl').value,
          capabilities: caps.length ? caps : [capability],
          operations: [{ id: 'validate', label: 'Validate saved connection', capability: capability, method: 'GET', path: $('connValidationPath').value || '/', risk: 'read' }],
          token: $('connToken').value
        };
        btn.disabled = true; btn.textContent = 'Saving…';
        api('/api/connections', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profile) })
          .then(function (result) { return api('/api/connections/' + encodeURIComponent(result.connection.id) + '/test', { method: 'POST' }); })
          .then(function () { $('connToken').value = ''; toast('Connection saved and validated'); renderConnections(); })
          .catch(function (e) { toast((e && e.message) || 'Could not save connection', true); })
          .finally(function () { btn.disabled = false; btn.textContent = 'Save and validate'; });
      };
      renderConnections();
    } else if (S.setSection === 'providers') {
      b.innerHTML = '<h1>Providers</h1>' +
        '<p style="color:var(--muted);font-size:12.5px">Connect a provider, then choose the default model used for new tasks.</p>' +
        '<div class="setcard" style="margin-bottom:10px"><div class="setrow"><div class="grow"><div class="t">Bring your own compatible provider</div><div class="d">Add an OpenAI-compatible endpoint. Its key stays in Agent Gitu’s local key store; native tools safely downgrade when unsupported.</div></div><button class="btn dark" id="addCustomProvider">Add provider</button><button class="btn ghost" id="editFallbackModels">Fallback models</button></div></div>' +
        '<div class="provider-toolbar"><input type="text" id="providerFilter" placeholder="Filter providers…" aria-label="Filter providers"><span class="meta" id="providerSummary"></span></div>' +
        '<div class="setcard" id="provBody"><div class="meta">loading providers…</div></div>';
      var addCustomProvider = $('addCustomProvider');
      if (addCustomProvider) addCustomProvider.onclick = function () {
        var label = window.prompt('Provider name (for example: Team gateway)');
        if (!label) return;
        var slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
        if (!slug) { toast('Use a name with letters or numbers', true); return; }
        var baseUrl = window.prompt('OpenAI-compatible base URL (HTTPS, or HTTP only for localhost)');
        if (!baseUrl) return;
        var defaultModel = window.prompt('Default model ID');
        if (!defaultModel) return;
        var keyEnvVar = 'HERMES_CUSTOM_' + slug.toUpperCase().replace(/-/g, '_');
        var toolMode = window.prompt('Tool mode: auto, native, structured_text, or text', 'auto') || 'auto';
        var profile = { id: 'custom-' + slug, label: label, baseUrl: baseUrl, defaultModel: defaultModel, keyEnvVar: keyEnvVar, toolMode: toolMode };
        api('/api/provider-profiles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profile) })
          .then(function () {
            var key = window.prompt('Paste an API key now (optional — you can add it from the provider row)');
            if (!key) { toast('Custom provider saved'); refreshModels(); return null; }
            return api('/api/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ envVar: keyEnvVar, key: key }) });
          })
          .then(function () { refreshModels(); })
          .catch(function (e) { toast((e && e.message) || 'Could not save provider', true); });
      };
      var editFallbackModels = $('editFallbackModels');
      if (editFallbackModels) editFallbackModels.onclick = function () {
        api('/api/model-fallbacks').then(function (data) {
          var current = (data.fallbackModels || []).join(', ');
          var raw = window.prompt('Fallbacks in priority order, comma-separated (provider::model). Cross-provider fallbacks run only when listed here.', current);
          if (raw === null) return;
          var fallbackModels = raw.split(',').map(function (v) { return v.trim(); }).filter(Boolean);
          return api('/api/model-fallbacks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fallbackModels: fallbackModels }) })
            .then(function () { toast('Fallback models saved'); });
        }).catch(function (e) { toast((e && e.message) || 'Could not save fallbacks', true); });
      };
      Promise.all([api('/api/models'), api('/api/keys').catch(function () { return { stored: [] }; })]).then(function (res) {
        var d = res[0];
        var stored = (res[1] && res[1].stored) || [];
        var body = $('provBody');
        if (!body || S.setSection !== 'providers') return;
        var cur = S.sel.model || '';
        var prov = (d.providers || []).slice().sort(function (a, b) { return Number(providerIsUsable(b)) - Number(providerIsUsable(a)); });
        var readyCount = prov.filter(providerIsUsable).length;
        if ($('providerSummary')) $('providerSummary').textContent = readyCount + ' ready · ' + (prov.length - readyCount) + ' need setup';
        body.innerHTML = prov.map(function (p, i) {
          var storedVar = (p.keyEnvVars || []).filter(function (v) { return stored.indexOf(v) >= 0; })[0];
          var usable = providerIsUsable(p);
          var keyChip = p.hasKey ? '<span class="chip ok">key ready</span>' : '<span class="chip bad">needs key</span>';
          var storedChip = storedVar ? '<span class="chip">stored</span>' : '';
          var liveChip = p.live ? '<span class="chip">live</span>' : '';
          var models = p.models || [];
          var selInProv = cur.indexOf(p.id + '::') === 0 ? cur.split('::')[1] : '';
          var activeChip = selInProv ? '<span class="chip ok">active</span>' : '';
          var btnModel = titleCase(selInProv || p.defaultModel);
          if (p.auth === 'chatgpt-subscription') {
            // Codex owns this credential; Agent Gitu only receives safe
            // signed-in / plan state and never sees a token or email address.
            keyChip = usable
              ? '<span class="chip ok">signed in' + (p.planType ? ' · ' + esc(p.planType) : '') + '</span>'
              : '<span class="chip bad">' + (p.available === false ? 'Codex unavailable' : 'not signed in') + '</span>';
          }
          var setupLabel = p.auth === 'chatgpt-subscription' ? 'Sign in first' : 'Add key first';
          var modelTitle = usable ? 'Search ' + esc(p.label) + ' models' : setupLabel;
          var manageTitle = p.auth === 'chatgpt-subscription' ? 'manage ChatGPT sign-in' : (storedVar || p.hasKey ? 'manage' : 'add') + ' the API key';
          return '<div class="setrow" data-provider-row="' + esc((p.label + ' ' + p.id).toLowerCase()) + '" style="align-items:flex-start"><div class="grow">' +
            '<div class="prov-head" data-provhead="' + i + '" role="button" tabindex="0" aria-expanded="false" title="Tap to ' + manageTitle + '">' +
              '<span class="prov-chev">&#9654;</span>' +
              '<div><div class="t">' + esc(p.label) + ' <span class="meta">(' + esc(p.id) + ')</span> ' + keyChip + storedChip + ' ' + liveChip + activeChip + '</div>' +
              '<div class="d">' + models.length + ' models' + (p.keyEnvVars && !p.hasKey ? ' · env: ' + esc(p.keyEnvVars.join(' | ')) : '') + '</div></div>' +
            '</div>' +
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:4px">' +
              '<div class="pm-wrap" data-pmwrap="' + i + '">' +
                '<button type="button" class="pm-btn" data-pmbtn="' + i + '" title="' + modelTitle + '"' + (usable ? '' : ' disabled') + '>' +
                  '<span class="pm-name">' + esc(usable ? btnModel : setupLabel) + '</span>' +
                  '<span class="caret">&#9660;</span>' +
                '</button>' +
                '<div class="model-menu pm-menu" hidden><input type="text" placeholder="Search models…"><div class="model-list"></div><div class="model-count"></div></div>' +
              '</div>' +
            '</div>' +
            '<div class="keysec">' +
              (p.auth === 'chatgpt-subscription'
                ? (usable
                    ? '<div class="hint">Connected through local Codex' + (p.planType ? ' (' + esc(p.planType) + ')' : '') + '. Your ChatGPT credentials remain in Codex.</div>'
                    : '<button type="button" class="btn dark" id="chatgptSignin">Sign in with ChatGPT</button>' +
                      '<div class="hint">Opens the secure Codex sign-in flow. It uses the models included with your ChatGPT plan instead of an API key.</div>')
                : '<input type="password" id="keyin-' + i + '" placeholder="paste ' + esc(p.id) + ' API key"' + (p.keyEnvVars && p.keyEnvVars.length ? ' title="stored locally as env var ' + esc(p.keyEnvVars.join(' or ')) + '"' : '') + ' style="margin:0;max-width:280px">' +
                  '<button class="btn dark" data-savekey="' + i + '">Save key</button>' +
                  '<button class="btn ghost" data-eye="' + i + '" title="show or hide the key">Show</button>' +
                  (storedVar ? '<button class="btn ghost" data-delkey="' + esc(storedVar) + '">Remove stored key</button>' : '') +
                  (p.custom ? '<button class="btn ghost" data-testprofile="' + esc(p.id) + '" data-profilemodel="' + esc(p.defaultModel) + '">Test connection</button><button class="btn ghost" data-deleteprofile="' + esc(p.id) + '">Remove provider</button>' : '') +
                  (p.keyEnvVars && p.keyEnvVars.length ? '<div class="hint">stored locally as env var ' + esc(p.keyEnvVars.join(' or ')) + '</div>' : '')) +
            '</div>' +
            '</div></div>';
        }).join('') || '<div class="meta">no providers available</div>';
        var cgSignin = $('chatgptSignin');
        if (cgSignin) cgSignin.onclick = function () {
          cgSignin.disabled = true;
          cgSignin.textContent = 'Opening sign-in…';
          api('/api/chatgpt/login', { method: 'POST' }).then(function (r) {
            if (r && r.url) window.open(r.url, '_blank', 'noopener');
            var tries = 0;
            var poll = function () {
              tries += 1;
              if (tries > 150) return; // ~5 min, matching the server-side timeout
              api('/api/chatgpt/auth').then(function (st) {
                if (st && st.loggedIn) {
                  toast('ChatGPT connected');
                  renderSettings();
                  return;
                }
                setTimeout(poll, 2000);
              }).catch(function () { setTimeout(poll, 2000); });
            };
            setTimeout(poll, 1500);
          }).catch(function (e) {
            cgSignin.disabled = false;
            cgSignin.textContent = 'Sign in with ChatGPT';
            toast('ChatGPT sign-in failed: ' + ((e && e.message) || e), true);
          });
        };
        body.querySelectorAll('[data-testprofile]').forEach(function (btn) {
          btn.onclick = function () {
            var id = btn.getAttribute('data-testprofile');
            var model = btn.getAttribute('data-profilemodel');
            btn.disabled = true;
            btn.textContent = 'Testing…';
            api('/api/provider-profiles/' + encodeURIComponent(id) + '/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: model }) })
              .then(function () { toast('Connection successful'); })
              .catch(function (e) { toast((e && e.message) || 'Connection failed', true); })
              .finally(function () { btn.disabled = false; btn.textContent = 'Test connection'; });
          };
        });
        body.querySelectorAll('[data-deleteprofile]').forEach(function (btn) {
          btn.onclick = function () {
            var id = btn.getAttribute('data-deleteprofile');
            if (!window.confirm('Remove this provider profile? Its locally stored key is not deleted.')) return;
            api('/api/provider-profiles/' + encodeURIComponent(id), { method: 'DELETE' })
              .then(function () { toast('Provider removed'); refreshModels(); })
              .catch(function (e) { toast((e && e.message) || 'Could not remove provider', true); });
          };
        });
        var providerFilter = $('providerFilter');
        if (providerFilter) providerFilter.oninput = function () {
          var q = providerFilter.value.toLowerCase().trim();
          body.querySelectorAll('[data-provider-row]').forEach(function (row) {
            row.hidden = Boolean(q && row.getAttribute('data-provider-row').indexOf(q) < 0);
          });
        };
        function closeAllPm(except) {
          body.querySelectorAll('.pm-wrap.open').forEach(function (w) {
            if (w === except) return;
            w.classList.remove('open');
            var m = w.querySelector('.model-menu');
            if (m) m.hidden = true;
          });
        }
        function pmRender(wrap) {
          var p = prov[Number(wrap.getAttribute('data-pmwrap'))];
          if (!p) return;
          var q = (wrap.querySelector('.model-menu input').value || '').toLowerCase().trim();
          var list = wrap.querySelector('.model-list');
          var curVal = S.sel.model || '';
          var matched = (p.models || []).filter(function (m) {
            if (!q) return true;
            return modelSearchText(p, m).indexOf(q) >= 0;
          });
          var count = wrap.querySelector('.model-count');
          if (count) count.textContent = matched.length + (matched.length === 1 ? ' model' : ' models') + (q ? (matched.length === 1 ? ' matches' : ' match') : '');
          list.innerHTML = matched.map(function (m) {
            var val = p.id + '::' + m.id;
            return '<button type="button" class="model-item' + (val === curVal ? ' cur' : '') + '" data-val="' + esc(val) + '" role="option" aria-selected="' + (val === curVal ? 'true' : 'false') + '">' +
              '<div class="mi-top"><span class="mi-prov">' + (m.free ? 'free · no credits needed' : '') + '</span>' +
              '<span class="mi-meta">' + esc(modelMetaText(m)) + '</span>' +
              (val === curVal ? '<span class="mi-cur" title="current default">&#10003;</span>' : '') + '</div>' +
              '<div class="mi-name">' + markMatch(titleCase(m.id), q) + (m.vision ? ' <i class="vmark" title="supports images">&#9672;</i>' : '') + '</div>' +
              '</button>';
          }).join('') || '<div class="model-empty">No models match &ldquo;' + esc(q) + '&rdquo;<br><span style="font-size:11px">Try a model name</span></div>';
          var hl = list.querySelector('.model-item');
          if (hl) hl.classList.add('hl');
        }
        function pickProvModel(val) {
          S.sel.model = val;
          persist();
          toast('Default model: ' + modelLabelText(val));
          closeAllPm();
          renderSettings();
        }
        body.querySelectorAll('[data-pmbtn]').forEach(function (btn) {
          btn.onclick = function (e) {
            e.stopPropagation();
            var wrap = btn.closest('.pm-wrap');
            var menu = wrap.querySelector('.model-menu');
            var opening = menu.hidden;
            closeAllPm(wrap);
            if (!opening) return;
            wrap.classList.add('open');
            menu.hidden = false;
            var inp = menu.querySelector('input');
            inp.value = '';
            pmRender(wrap);
            setTimeout(function () { inp.focus(); }, 0);
          };
        });
        body.querySelectorAll('[data-pmwrap]').forEach(function (wrap) {
          var inp = wrap.querySelector('.model-menu input');
          inp.oninput = function () { pmRender(wrap); };
          inp.onkeydown = function (e) {
            var items = wrap.querySelectorAll('.model-item');
            if (e.key === 'Enter') {
              var hl = wrap.querySelector('.model-item.hl') || items[0];
              if (hl) pickProvModel(hl.getAttribute('data-val'));
              e.preventDefault();
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              var dir = e.key === 'ArrowDown' ? 1 : -1;
              var at = -1;
              for (var k = 0; k < items.length; k++) if (items[k].classList.contains('hl')) { at = k; break; }
              var next = at < 0 ? (dir > 0 ? 0 : items.length - 1) : (at + dir + items.length) % items.length;
              if (at >= 0) items[at].classList.remove('hl');
              items[next].classList.add('hl');
              if (items[next].scrollIntoView) items[next].scrollIntoView({ block: 'nearest' });
              e.preventDefault();
            } else if (e.key === 'Escape') {
              closeAllPm();
            }
            e.stopPropagation();
          };
          wrap.querySelector('.model-list').onmousedown = function (e) {
            var item = e.target.closest ? e.target.closest('.model-item') : null;
            if (item) { e.preventDefault(); pickProvModel(item.getAttribute('data-val')); }
          };
        });
        body.querySelectorAll('[data-provhead]').forEach(function (head) {
          head.onclick = function () {
            var idx = Number(head.getAttribute('data-provhead'));
            var row = head.closest('.setrow');
            var wasOpen = row.classList.contains('prov-open');
            body.querySelectorAll('.setrow').forEach(function (r) {
              r.classList.remove('prov-open');
              var ph = r.querySelector('[data-provhead]');
              if (ph) ph.setAttribute('aria-expanded', 'false');
              var ks = r.querySelector('.keysec');
              if (ks) ks.classList.remove('show');
            });
            if (!wasOpen) {
              row.classList.add('prov-open');
              head.setAttribute('aria-expanded', 'true');
              S.provOpen = idx;
              var ks = row.querySelector('.keysec');
              if (ks) ks.classList.add('show');
              var pin = ks ? ks.querySelector('input[type=password]') : null;
              if (pin) setTimeout(function () { pin.focus(); }, 0);
            } else S.provOpen = null;
          };
          head.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); head.click(); } };
        });
        if (typeof S.provOpen === 'number') {
          var orow = body.querySelectorAll('.setrow')[S.provOpen];
          if (orow && orow.querySelector('[data-provhead]')) {
            orow.classList.add('prov-open');
            orow.querySelector('[data-provhead]').setAttribute('aria-expanded', 'true');
            var oks = orow.querySelector('.keysec');
            if (oks) oks.classList.add('show');
          } else S.provOpen = null;
        }
        if (!S.provDocBound) {
          S.provDocBound = true;
          document.addEventListener('click', function (e) {
            var b2 = document.getElementById('provBody');
            if (!b2 || !b2.isConnected) return;
            if (e.target.closest && e.target.closest('.pm-wrap')) return;
            b2.querySelectorAll('.pm-wrap.open').forEach(function (w) {
              w.classList.remove('open');
              var m = w.querySelector('.model-menu');
              if (m) m.hidden = true;
            });
          });
        }
        body.querySelectorAll('[data-savekey]').forEach(function (btn) {
          btn.onclick = function () {
            var i = Number(btn.getAttribute('data-savekey'));
            var p = prov[i];
            var input = $('keyin-' + i);
            var key = input ? input.value.trim() : '';
            if (!p || !key) { toast('Paste an API key first', true); return; }
            var envVar = (p.keyEnvVars || [])[0];
            S.provOpen = i;
            api('/api/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ envVar: envVar, key: key }) })
              .then(function () { toast('Key saved for ' + p.id); refreshModels(); })
              .catch(function (e) { toast(e.message, true); });
          };
        });
        body.querySelectorAll('[data-eye]').forEach(function (btn) {
          btn.onclick = function () {
            var i = Number(btn.getAttribute('data-eye'));
            var inp = $('keyin-' + i);
            if (!inp) return;
            var show = inp.type === 'password';
            inp.type = show ? 'text' : 'password';
            btn.textContent = show ? 'Hide' : 'Show';
          };
        });
        body.querySelectorAll('[data-delkey]').forEach(function (btn) {
          btn.onclick = function () {
            var v = btn.getAttribute('data-delkey');
            var head = btn.closest('.setrow') ? btn.closest('.setrow').querySelector('[data-provhead]') : null;
            if (head) S.provOpen = Number(head.getAttribute('data-provhead'));
            api('/api/keys/' + v, { method: 'DELETE' })
              .then(function () { toast('Removed ' + v); refreshModels(); })
              .catch(function (e) { toast(e.message, true); });
          };
        });
      }).catch(function () {
        var body = $('provBody');
        if (body) body.innerHTML = '<div class="meta">failed to load providers</div>';
      });
    } else if (S.setSection === 'permissions') {
      b.innerHTML = '<h1>Permissions</h1>' +
        '<div class="setcard">' +
        '<div class="setrow"><div class="grow"><div class="t">Auto-learn reusable skills</div><div class="d">After a successful task the agent reflects on what it did and saves any repeatable multi-step pattern (deploy flows, design conventions, checklists) as a skill with create_skill. Turn off to stop all proactive skill creation.</div></div><button class="toggle ' + (S.settings.autoLearn ? 'on' : '') + '" id="pLearn"></button></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Plan review</div><div class="d">In Plan mode the agent waits for your approval before building.</div></div><button class="toggle ' + (S.settings.review ? 'on' : '') + '" id="pReview"></button></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Auto-approve dangerous actions</div><div class="d">Skips the approval gate for destructive commands. Significantly increases risk of data loss.</div></div><button class="toggle ' + (S.settings.autoApprove ? 'on' : '') + '" id="pAuto"></button></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Loop prevention</div><div class="d">Repeated failing actions are blocked automatically. Always on.</div></div><button class="toggle on" disabled></button></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Evidence gate</div><div class="d">Tasks cannot complete without passing evidence for every criterion. Always on.</div></div><button class="toggle on" disabled></button></div>' +
        '</div>';
      $('pLearn').onclick = function () { S.settings.autoLearn = !S.settings.autoLearn; persist(); renderSettings(); };
      $('pReview').onclick = function () { S.settings.review = !S.settings.review; persist(); renderSettings(); };
      $('pAuto').onclick = function () { S.settings.autoApprove = !S.settings.autoApprove; persist(); renderSettings(); };
    } else if (S.setSection === 'workspace') {
      Promise.all([api('/api/files'), api('/api/home')]).then(function (res) {
        var files = res[0].files || [];
        var home = res[1];
        var sel = S.settings.scope || [];
        b.innerHTML = '<h1>Workspace</h1>' +
          '<div class="setcard"><div class="setrow"><div class="grow"><div class="t">Agent Gitu home</div><div class="d" style="font-family:var(--mono)">' + esc(home.root) + '</div></div></div>' +
          '<div class="setrow"><div class="grow"><div class="t">Projects folder</div><div class="d">Where "New project" creates folders. Defaults to &lt;home&gt;/Projects.</div></div></div>' +
          '<div class="setlist"><input type="text" id="wsProjects" value="' + esc(home.projectsPath) + '" placeholder="' + esc(home.projects) + '">' +
          '<div class="row"><button class="btn dark" id="wsProjectsSave">Save projects folder</button><button class="btn ghost" id="wsProjectsReset">Reset to default</button></div></div></div>' +
          '<h2>File scope</h2>' +
          '<p style="color:var(--muted);font-size:12.5px">Choose which files Agent Gitu should work on. The agent is instructed to stay inside this selection. Leave empty to allow the whole project.</p>' +
          '<div class="setcard"><div class="setlist" style="max-height:300px;overflow-y:auto">' +
          (files.map(function (f) {
            return '<div class="row"><label style="display:flex;gap:8px;align-items:center;font-family:var(--mono);font-size:11.5px"><input type="checkbox" data-f="' + esc(f) + '"' + (sel.indexOf(f) >= 0 ? ' checked' : '') + ' style="width:auto;margin:0">' + esc(f) + '</label></div>';
          }).join('') || '<div class="meta">no files found</div>') +
          '</div></div>' +
          '<h2>Constraints</h2><div class="setcard"><div class="setlist">' +
          '<textarea id="wsCons" rows="3" placeholder="Extra rules, one per line (e.g. Do not touch the billing module)">' + esc(S.settings.constraints || '') + '</textarea>' +
          '<div class="row"><button class="btn dark" id="wsSave">Save workspace</button><button class="btn ghost" id="wsClear">Clear selection</button></div></div></div>';
        $('wsSave').onclick = function () {
          var chosen = [];
          b.querySelectorAll('input[data-f]').forEach(function (cb) { if (cb.checked) chosen.push(cb.getAttribute('data-f')); });
          S.settings.scope = chosen;
          S.settings.constraints = $('wsCons').value;
          persist();
          toast('Workspace saved — ' + chosen.length + ' file(s) in scope');
        };
        $('wsClear').onclick = function () { S.settings.scope = []; persist(); renderSettings(); };
        $('wsProjectsSave').onclick = function () {
          api('/api/home/workspace', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectsPath: $('wsProjects').value.trim() }) })
            .then(function (d) { toast('Projects folder: ' + d.projectsPath); renderSettings(); })
            .catch(function (e) { toast(e.message, true); });
        };
        $('wsProjectsReset').onclick = function () {
          api('/api/home/workspace', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectsPath: '' }) })
            .then(function () { toast('Projects folder reset to default'); renderSettings(); })
            .catch(function (e) { toast(e.message, true); });
        };
      });
    } else if (S.setSection === 'project') {
      b.innerHTML = '<h1>Project</h1>' +
        '<div class="setcard"><div class="setrow"><div class="grow"><div class="t">Active project path</div><div class="d">Each project has its own chats, skills, MCP servers and cron jobs.</div></div></div>' +
        '<div class="setlist"><input type="text" id="prPath" value="' + esc(effectiveProjectPath()) + '" placeholder="C:\\path\\to\\project">' +
        '<div class="row"><button class="btn dark" id="prSave">Save project</button><button class="btn ghost" id="prBrowse">Browse folders…</button></div></div></div>';
      $('prBrowse').onclick = openFolderBrowser;
      $('prSave').onclick = function () {
        S.settings.projectPath = $('prPath').value.trim();
        persist();
        updateProjChip();
        renderSidebar();
      };
    } else if (S.setSection === 'agents') {
      Promise.all([api('/api/agents'), api('/api/models')]).then(function (res) {
        var agents = res[0].agents || [];
        var provs = res[1].providers || [];
        function modelOptions(sel) {
          var out = '<option value="">(default model)</option>';
          provs.forEach(function (p) {
            out += '<optgroup label="' + esc(p.id) + (p.hasKey ? '' : ' (no key)') + '">';
            (p.models || []).forEach(function (m) {
              out += '<option value="' + esc(p.id + '::' + m.id) + '"' + (sel === p.id + '::' + m.id ? ' selected' : '') + '>' + esc(m.id) + (m.vision ? ' ◉' : '') + (m.free ? ' (free)' : '') + '</option>';
            });
            out += '</optgroup>';
          });
          return out;
        }
        b.innerHTML = '<h1>Specialist agents</h1>' +
          '<p style="color:var(--muted);font-size:12.5px">Named worker agents that the main agent can run in parallel with the delegate tool on big projects. The main agent uses the <b>Agent ID / Name</b> to delegate tasks. Each agent can use a different provider, model, and reasoning effort.</p>' +
          '<div style="margin:12px 0"><button class="btn dark" id="agNew">+ New agent</button></div>' +
          '<div class="setcard" id="agForm" hidden><div class="setlist">' +
          '<div><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Agent Name / Identifier (used by delegate):</label>' +
          '<input id="agName" placeholder="e.g. explore, frontend, tester, researcher"></div>' +
          '<div class="row"><div style="flex:1"><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Model & Provider:</label>' +
          '<select id="agModel" style="width:100%">' + modelOptions('') + '</select></div>' +
          '<div><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Effort:</label>' +
          '<select id="agEffort"><option value="">effort: default</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="max">max</option></select></div></div>' +
          '<div><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Role & Specialty Instructions:</label>' +
          '<textarea id="agRole" rows="3" placeholder="e.g. You are a repository exploration specialist: trace code paths, identify symbols, discover references…"></textarea></div>' +
          '<div class="row"><button class="btn dark" id="agSave">Save agent</button><button class="btn ghost" id="agCancel">Cancel</button><span class="meta" id="agMeta"></span></div></div></div>' +
          '<div class="setcard">' +
          (agents.length ? agents.map(function (a) {
            return '<div class="skcard"><div class="skhead"><b style="font-size:14px">' + esc(a.name) + '</b>' +
              '<span class="chip" style="background:rgba(143,128,255,.14);color:#cfc6ff;font-weight:600;font-size:11px">SPECIALIST</span>' +
              '<span style="flex:1"></span>' +
              '<button class="ubtn" data-agedit="' + esc(a.id) + '" title="edit">' + icon('pencil') + '</button>' +
              '<button class="ubtn" data-agdel="' + esc(a.id) + '" title="delete">' + icon('x') + '</button></div>' +
              '<div style="display:flex;gap:12px;align-items:center;margin:6px 0 4px;font-size:12px;flex-wrap:wrap">' +
              '<span><b>Agent ID:</b> <code style="font-family:var(--mono);background:var(--card2);border:1px solid var(--border);padding:2px 6px;border-radius:4px;color:var(--text);font-weight:600">' + esc(a.name) + '</code></span>' +
              '<span><b>Model:</b> <code style="font-family:var(--mono);background:var(--card2);border:1px solid var(--border);padding:2px 6px;border-radius:4px;color:var(--muted)">' + esc(a.provider ? a.provider + '/' : '') + esc(a.model || 'default') + '</code></span>' +
              (a.effort ? '<span class="chip">' + esc(a.effort) + '</span>' : '') +
              '</div>' +
              '<div class="skdesc" style="margin-top:4px">' + esc(a.role) + '</div></div>';
          }).join('') : '<div class="setlist"><div class="meta">no agents yet — create one and the main agent will start delegating independent sub-tasks to it.</div></div>') +
          '</div>';
        var form = $('agForm');
        $('agNew').onclick = function () {
          form.hidden = false;
          $('agName').value = ''; $('agRole').value = ''; $('agModel').value = ''; $('agEffort').value = ''; $('agMeta').textContent = '';
        };
        $('agCancel').onclick = function () { form.hidden = true; };
        $('agSave').onclick = function () {
          var mv = ($('agModel').value || '').split('::');
          var payload = {
            id: S.agEditing || undefined,
            name: $('agName').value,
            role: $('agRole').value,
            provider: mv[0] || undefined,
            model: mv[1] || undefined,
            effort: $('agEffort').value || undefined
          };
          api('/api/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
            .then(function () { S.agEditing = null; toast('Agent saved'); renderSettings(); })
            .catch(function (e) { toast(e.message, true); });
        };
        b.querySelectorAll('[data-agedit]').forEach(function (el) {
          el.onclick = function () {
            var a = agents.filter(function (x) { return x.id === el.getAttribute('data-agedit'); })[0];
            if (!a) return;
            form.hidden = false;
            S.agEditing = a.id;
            $('agName').value = a.name;
            $('agRole').value = a.role;
            $('agEffort').value = a.effort || '';
            $('agModel').value = a.provider && a.model ? a.provider + '::' + a.model : (a.model || '');
            $('agMeta').textContent = 'editing ' + a.name;
          };
        });
        b.querySelectorAll('[data-agdel]').forEach(function (el) {
          el.onclick = function () {
            var id = el.getAttribute('data-agdel');
            var a = agents.filter(function (x) { return x.id === id; })[0];
            if (!confirm('Delete agent "' + (a ? a.name : id) + '"?')) return;
            api('/api/agents/' + id, { method: 'DELETE' }).then(function () { toast('Agent deleted'); renderSettings(); }).catch(function (e) { toast(e.message, true); });
          };
        });
      });
    } else if (S.setSection === 'skills') {
      api('/api/skills').then(function (d) {
        var all = d.skills || [];
        var q = (S.skillQuery || '').toLowerCase();
        var skills = all.filter(function (sk) { return !q || sk.name.indexOf(q) >= 0 || (sk.description || '').toLowerCase().indexOf(q) >= 0; });
        b.innerHTML = '<h1>Skills</h1>' +
          '<p style="color:var(--muted);font-size:12.5px">Reusable step-by-step knowledge. The agent applies them with use_skill and learns new ones with create_skill.</p>' +
          '<div style="display:flex;gap:8px;margin:12px 0"><input type="text" id="skSearch" placeholder="Search skills…" value="' + esc(S.skillQuery || '') + '" style="flex:1;border:1px solid var(--border2);border-radius:8px;background:var(--card2);color:var(--text);padding:7px 10px">' +
          '<button class="btn dark" id="skNew">+ New skill</button></div>' +
          '<div class="setcard" id="skFormCard" hidden style="margin-bottom:12px"><div class="setlist">' +
          '<input id="skName" placeholder="skill name (e.g. deploy-checklist)">' +
          '<input id="skDesc" placeholder="short description (shown to the agent)">' +
          '<textarea id="skInstr" rows="6" placeholder="step-by-step instructions"></textarea>' +
          '<label style="display:flex;gap:7px;align-items:center;font-size:12px;color:var(--muted);cursor:pointer"><input type="checkbox" id="skGlobal"> Available in every project (global)</label>' +
          '<div class="row"><button class="btn dark" id="skSave">Save skill</button><button class="btn ghost" id="skCancel">Cancel</button><span class="meta" id="skEditMeta"></span></div></div></div>' +
          '<div class="setcard">' +
          (skills.length ? skills.map(function (sk) {
            return '<div class="skcard">' +
              '<div class="skhead"><b>' + esc(sk.name) + '</b>' +
              (sk.scope === 'global' ? '<span class="chip ok" title="available in every project">global</span>' : '<span class="chip" title="only in this project">project</span>') +
              '<span class="chip ' + (sk.createdBy === 'agent' ? 'info' : '') + '">' + esc(sk.createdBy || 'agent') + '</span>' +
              '<span class="meta">' + esc((sk.createdAt || '').slice(0, 10)) + '</span>' +
              '<span style="flex:1"></span>' +
              '<button class="ubtn" data-skview="' + esc(sk.name) + '" title="view instructions">' + icon('layers') + '</button>' +
              '<button class="ubtn" data-skedit="' + esc(sk.name) + '" title="edit">' + icon('pencil') + '</button>' +
              '<button class="ubtn" data-skcopy="' + esc(sk.name) + '" title="copy instructions">' + icon('copy') + '</button>' +
              '<button class="ubtn" data-skdel="' + esc(sk.name) + '" title="delete">' + icon('x') + '</button></div>' +
              '<div class="skdesc">' + esc(sk.description || '(no description)') + '</div>' +
              '<pre class="skinstr" data-pre="' + esc(sk.name) + '" hidden>' + esc(sk.instructions || '') + '</pre>' +
              '</div>';
          }).join('') : '<div class="setlist"><div class="meta">no skills' + (q ? ' match "' + esc(q) + '"' : ' yet — the agent creates skills when it learns repeatable patterns') + '</div></div>') +
          '</div>';
        $('skSearch').oninput = function () {
          S.skillQuery = $('skSearch').value;
          renderSettings();
          setTimeout(function () { var el = $('skSearch'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 0);
        };
        var form = $('skFormCard');
        function openForm(skill) {
          form.hidden = false;
          $('skName').value = skill ? skill.name : '';
          $('skName').disabled = Boolean(skill);
          $('skDesc').value = skill ? skill.description : '';
          $('skInstr').value = skill ? skill.instructions : '';
          $('skEditMeta').textContent = skill ? 'editing ' + skill.name : '';
          S.skEditing = skill ? skill.name : null;
        }
        $('skNew').onclick = function () { openForm(null); };
        $('skCancel').onclick = function () { form.hidden = true; S.skEditing = null; };
        $('skSave').onclick = function () {
          var payload = { name: $('skName').value, description: $('skDesc').value, instructions: $('skInstr').value };
          var g = $('skGlobal');
          if (!S.skEditing && g && g.checked) payload['global'] = true;
          var url = S.skEditing ? '/api/skills/' + encodeURIComponent(S.skEditing) : '/api/skills';
          api(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
            .then(function () { S.skEditing = null; toast('Skill saved'); renderSettings(); })
            .catch(function (e) { toast(e.message, true); });
        };
        b.querySelectorAll('[data-skview]').forEach(function (el) {
          el.onclick = function () { var pre = b.querySelector('[data-pre="' + el.getAttribute('data-skview') + '"]'); if (pre) pre.hidden = !pre.hidden; };
        });
        b.querySelectorAll('[data-skedit]').forEach(function (el) {
          el.onclick = function () { openForm(all.filter(function (x) { return x.name === el.getAttribute('data-skedit'); })[0]); };
        });
        b.querySelectorAll('[data-skcopy]').forEach(function (el) {
          el.onclick = function () {
            var sk = all.filter(function (x) { return x.name === el.getAttribute('data-skcopy'); })[0];
            if (sk) navigator.clipboard.writeText(sk.instructions).then(function () { toast('Instructions copied'); }, function () { toast('Copy failed', true); });
          };
        });
        b.querySelectorAll('[data-skdel]').forEach(function (el) {
          el.onclick = function () {
            var name = el.getAttribute('data-skdel');
            if (!confirm('Delete skill "' + name + '"?')) return;
            api('/api/skills/' + encodeURIComponent(name), { method: 'DELETE' }).then(function () { toast('Skill deleted'); renderSettings(); }).catch(function (e) { toast(e.message, true); });
          };
        });
      });
    } else if (S.setSection === 'mcp') {
      api('/api/mcp').then(function (d) {
        b.innerHTML = '<h1>MCP servers</h1><p style="color:var(--muted);font-size:12.5px">External tool servers (filesystem, browser, databases…). Their tools require approval before running.</p>' +
          '<div class="setcard"><div class="setlist">' +
          (d.servers.length ? d.servers.map(function (sv) {
            var scope = d.scopes && d.scopes[sv.name];
            return '<div class="row"><span class="grow"><b>' + esc(sv.name) + '</b>' +
              (scope === 'global' ? ' <span class="chip ok" title="available in every project">global</span>' : ' <span class="chip" title="only in this project">project</span>') +
              ' <span class="meta">' + esc(sv.command) + ' ' + esc((sv.args || []).join(' ')) + '</span></span><button class="x" data-x="' + esc(sv.name) + '" title="remove server">' + icon('x') + '</button></div>';
          }).join('') : '<div class="meta">no servers yet</div>') +
          (d.tools.length ? '<div class="meta" style="margin-top:6px">tools: ' + esc(d.tools.map(function (t) { return 'mcp:' + t.server + ':' + t.name; }).join(', ')) + '</div>' : '') +
          '<div style="height:8px"></div><div class="row"><input id="mcName" placeholder="name (e.g. fs)" style="margin:0"><input id="mcCmd" placeholder="command (e.g. npx)" style="margin:0"></div><input id="mcArgs" placeholder="args separated by spaces">' +
          '<label style="display:flex;gap:7px;align-items:center;font-size:12px;color:var(--muted);cursor:pointer"><input type="checkbox" id="mcGlobal" checked> Available in every project (global)</label>' +
          '<div class="row"><button class="btn dark" id="mcAdd">Add MCP server</button><button class="btn ghost" id="mcFs">+ filesystem MCP (official)</button></div></div></div>';
        b.querySelectorAll('[data-x]').forEach(function (el) {
          el.onclick = function () { api('/api/mcp/' + el.getAttribute('data-x'), { method: 'DELETE' }).then(function () { renderSettings(); }).catch(function (e) { toast(e.message, true); }); };
        });
        $('mcAdd').onclick = function () {
          api('/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: $('mcName').value, command: $('mcCmd').value, args: $('mcArgs').value.split(/\s+/).filter(Boolean), global: $('mcGlobal').checked }) })
            .then(function () { renderSettings(); }).catch(function (e) { toast(e.message, true); });
        };
        $('mcFs').onclick = function () {
          var root = effectiveProjectPath() || '.';
          api('/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'fs', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', root] }) })
            .then(function () { toast('Filesystem MCP added for ' + root); renderSettings(); })
            .catch(function (e) { toast(e.message, true); });
        };
      });
    } else if (S.setSection === 'cron') {
      api('/api/cron').then(function (d) {
        b.innerHTML = '<h1>Scheduled / heartbeat</h1><p style="color:var(--muted);font-size:12.5px">Cron jobs start agent runs on a schedule. A heartbeat periodically checks project health.</p>' +
          '<div class="setcard"><div class="setlist">' +
          (d.jobs.length ? d.jobs.map(function (jb) {
            return '<div class="row"><span class="grow">every <b>' + esc(jb.every) + '</b> — ' + esc(jb.goal) + (jb.lastRunAt ? ' <span class="meta">(last ' + new Date(jb.lastRunAt).toLocaleTimeString() + ')</span>' : '') + '</span><button class="x" data-x="' + esc(jb.id) + '" title="remove job">' + icon('x') + '</button></div>';
          }).join('') : '<div class="meta">no jobs yet</div>') +
          '<div style="height:8px"></div><div class="row"><div style="flex:1"><div class="meta">Schedule (e.g. 30, 30s, 5m, 1h — bare numbers are minutes)</div><input id="crEvery" placeholder="30m" style="margin:0"></div><div style="flex:2"><div class="meta">Goal for the agent</div><input id="crGoal" placeholder="e.g. run tests and fix failures" style="margin:0"></div></div>' +
          '<div class="row"><button class="btn dark" id="crAdd">Add cron job</button><button class="btn ghost" id="crHeart">+ heartbeat (30m)</button></div></div></div>';
        b.querySelectorAll('[data-x]').forEach(function (el) {
          el.onclick = function () { api('/api/cron/' + el.getAttribute('data-x'), { method: 'DELETE' }).then(function () { renderSettings(); }).catch(function (e) { toast(e.message, true); }); };
        });
        $('crAdd').onclick = function () {
          api('/api/cron', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ every: $('crEvery').value, goal: $('crGoal').value }) })
            .then(function () { renderSettings(); }).catch(function (e) { toast(e.message, true); });
        };
        $('crHeart').onclick = function () {
          api('/api/cron', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ every: '30m', goal: 'Heartbeat: inspect the project, run tests/typecheck, fix or report anything broken.' }) })
            .then(function () { renderSettings(); }).catch(function (e) { toast(e.message, true); });
        };
      });
    }
  }

  function openFolderBrowser() {
    $('browseModal').hidden = false;
    browseTo(effectiveProjectPath());
  }

  function browseTo(p, isFallback) {
    // Instant loading row: the list used to sit blank mid-navigation.
    var bl = $('browseList');
    if (bl) bl.innerHTML = '<div class="meta" style="padding:8px">loading…</div>';
    api('/api/browse?path=' + encodeURIComponent(p || '')).then(renderBrowser).catch(function (e) {
      if (!isFallback) { browseTo('', true); } else { toast(e.message, true); }
    });
  }

  function renderBrowser(d) {
    var box = $('browseList');
    var html = '';
    if (!d.atRoot && d.path) {
      html += '<div class="frow" data-up="1"><span class="ico">' + icon('back') + '</span><span style="color:var(--muted)">..</span></div>';
    }
    if (d.atRoot) html += '<div class="empty" style="padding:6px 10px">This computer — pick a drive</div>';
    html += (d.dirs || []).map(function (n) {
      return '<div class="frow" data-dir="' + esc(n) + '"><span class="ico">' + icon('folder') + '</span>' + esc(n) + '</div>';
    }).join('');
    if (!d.atRoot && !(d.dirs || []).length) html += '<div class="empty" style="padding:6px 10px">no subfolders</div>';
    box.innerHTML = html;
    $('browseCrumb').textContent = d.atRoot ? 'This computer' : d.path;
    $('browseProjChip').style.display = d.isProject ? '' : 'none';
    box.querySelectorAll('[data-dir]').forEach(function (el) {
      el.onclick = function () {
        var name = el.getAttribute('data-dir');
        var base = d.atRoot ? '' : String(d.path).replace(/[\\/]$/, '');
        browseTo(base ? base + '\\' + name : name);
      };
    });
    var up = box.querySelector('[data-up]');
    if (up) up.onclick = function () { browseTo(d.parent || ''); };
    $('browseUse').onclick = function () {
      if (d.atRoot || !d.path) { toast('Open a folder first', true); return; }
      S.settings.projectPath = d.path;
      persist();
      updateProjChip();
      renderSidebar();
      $('browseModal').hidden = true;
      toast('Project set to ' + d.path);
      if (S.active === 'home') openHome();
    };
  }

  function boot() {
    if (S.settings.projectPath) {
      api('/api/browse?path=' + encodeURIComponent(S.settings.projectPath)).catch(function () {
        toast('Stored project path no longer exists — pick a folder', true);
        S.settings.projectPath = '';
        persist();
        updateProjChip();
      });
    }
    api('/api/project').then(function (p) {
      S.project = p;
      updateProjChip();
      renderSidebar();
      if (S.active === 'home') openHome();
    }).catch(function () { updateProjChip(); });
    api('/api/home').then(function (h) {
      var heal = function (p) {
        if (!p) return p;
        var i = p.indexOf('\\AgentGitu\\');
        if (i >= 0) return h.root + p.slice(i + 10);
        // Restore projects created before the Gitu rename as well.
        i = p.indexOf('\\Hermes\\');
        if (i >= 0) return h.root + p.slice(i + 7);
        return p;
      };
      var np = heal(S.settings.projectPath);
      if (np !== S.settings.projectPath) { S.settings.projectPath = np; persist(); updateProjChip(); }
      S.lastProjectPath = heal(S.lastProjectPath);
    }).catch(function () {});
    api('/api/models').then(function (data) {
      S.models = data.providers;
      S.modelsLoaded = true;
      ensureUsableModelSelection();
      if (S.active === 'home') openHome();
    }).catch(function () { S.modelsLoaded = true; if (S.active === 'home') openHome(); });
    api('/api/files').then(function (data) { S.files = data.files || []; }).catch(function () {});
    $('gearBtn').onclick = function () { toggleMobileNav(false); openSettings('general'); };
    $('gearBtn').innerHTML = icon('gear');
    $('sbCollapse').onclick = function () { S.settings.leftCollapsed = !S.settings.leftCollapsed; persist(); applyLayout(); };
    bindResize('sbResize', 'left');
    $('bulkDel').onclick = bulkDelete;
    $('bulkDone').onclick = function () { S.manage = false; S.selProj = {}; S.selRuns = {}; renderSidebar(); };
    $('browseCancel').onclick = function () { $('browseModal').hidden = true; };
    $('projChip').style.cursor = 'pointer';
    $('projChip').title = 'Choose a project folder';
    $('projChip').onclick = openFolderBrowser;
    $('mobileNav').onclick = function () { toggleMobileNav(true); };
    $('mobileBackdrop').onclick = function () { toggleMobileNav(false); };
    updateProjChip();
    renderSidebar();
    renderTopbar();
    applyLayout();
    openHome();

    // Narrow-window panel toggle: the right side becomes an overlay instead
    // of being removed entirely (Browser/Git used to vanish ≤1080px).
    var fab = document.createElement('button');
    fab.className = 'side-fab';
    fab.id = 'sideFab';
    fab.hidden = true;
    fab.innerHTML = icon('layers') + '<span>Panel</span>';
    fab.title = 'toggle the state / browser / git panel';
    fab.onclick = function () {
      var rs = document.querySelector('.run-side');
      if (!rs) return;
      if (rs.classList.contains('narrow-open')) {
        rs.classList.remove('narrow-open');
        fab.querySelector('span').textContent = 'Panel';
      } else showRunPanel();
    };
    document.body.appendChild(fab);

    // One global Escape: closes the TOPMOST layer (panel overlay → settings →
    // browse modal → dynamic modals) and returns focus to where it was.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var prev = document.activeElement;
      var sh = document.querySelector('.shell.mobile-nav-open');
      if (sh) { toggleMobileNav(false); refocusEl(prev); return; }
      var rs2 = document.querySelector('.run-side.narrow-open');
      if (rs2) { rs2.classList.remove('narrow-open'); var f2 = $('sideFab'); if (f2) f2.querySelector('span').textContent = 'Panel'; refocusEl(prev); return; }
      var st = $('settings');
      if (st && !st.hidden) { closeSettings(); refocusEl(prev); return; }
      var bm = $('browseModal');
      if (bm && !bm.hidden) { bm.hidden = true; refocusEl(prev); return; }
      var modals = document.querySelectorAll('.modal');
      for (var i = modals.length - 1; i >= 0; i--) {
        var m = modals[i];
        if (m.hidden) continue;
        var cancel = m.querySelector('[data-cancel]') || m.querySelector('.btn.ghost');
        if (cancel && cancel.onclick) cancel.click(); else m.remove();
        refocusEl(prev);
        return;
      }
    });
    window.addEventListener('resize', function () { if (window.innerWidth > 720) toggleMobileNav(false); });
  }
  function refocusEl(el) { if (el && el.isConnected && el.focus) { try { el.focus(); } catch (e) {} } }
  boot();
})();
</script>
<div id="mascotWrap" style="position:fixed;right:14px;bottom:12px;z-index:45;pointer-events:none;width:240px;height:170px">
  <canvas id="mascotCanvas" aria-hidden="true" style="width:240px;height:170px;image-rendering:pixelated"></canvas>
  <div id="mascotName" style="position:absolute;top:44px;left:0;font-family:var(--mono);font-weight:700;font-size:11px;color:#fff;background:#1b2334;border:1px solid #8f80ff;border-radius:6px;padding:2px 8px;white-space:nowrap;opacity:0;transition:opacity .4s">Agent Gitu</div>
</div>
<script type="module">
import * as THREE from '/vendor/three.module.js';
(function () {
  var canvas = document.getElementById('mascotCanvas');
  if (!canvas) return;
  canvas.width = 120;
  canvas.height = 85;
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false });
  } catch (e) {
    return;
  }
  renderer.setClearColor(0x000000, 0);
  var scene = new THREE.Scene();
  var cam = new THREE.OrthographicCamera(-12, 12, 8.5, -8.5, 0.1, 100);
  cam.position.set(0, 2, 30);
  cam.lookAt(0, 2.4, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 1.7));
  var dl = new THREE.DirectionalLight(0xffffff, 1.1);
  dl.position.set(4, 8, 10);
  scene.add(dl);

  function box(w, h, d, c) {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c }));
  }
  var SKIN = 0xe8b98a, SUIT = 0x23231f, PANT = 0x1a1a17, GUN = 0x3a3a36, ACC = 0x7c6cf0;

  var root = new THREE.Group();
  scene.add(root);

  var legL = new THREE.Group(); legL.position.set(-0.45, 1.7, 0);
  var legLM = box(0.7, 1.7, 0.7, PANT); legLM.position.y = -0.85; legL.add(legLM); root.add(legL);
  var legR = new THREE.Group(); legR.position.set(0.45, 1.7, 0);
  var legRM = box(0.7, 1.7, 0.7, PANT); legRM.position.y = -0.85; legR.add(legRM); root.add(legR);

  var torso = box(1.9, 1.9, 1.0, SUIT); torso.position.y = 2.75; root.add(torso);
  var tie = box(0.3, 1.1, 0.12, ACC); tie.position.set(0, 2.8, 0.55); root.add(tie);

  var head = box(1.5, 1.5, 1.5, SKIN); head.position.y = 4.5; root.add(head);
  var shades = box(1.52, 0.35, 0.25, 0x111111); shades.position.set(0, 4.65, 0.7); root.add(shades);
  var hat = box(1.7, 0.5, 1.7, 0x111111); hat.position.y = 5.45; root.add(hat);
  var brim = box(1.7, 0.12, 0.9, 0x111111); brim.position.set(0, 5.25, 1.15); root.add(brim);

  var armL = new THREE.Group(); armL.position.set(-1.25, 3.6, 0);
  var armLM = box(0.55, 1.6, 0.55, SUIT); armLM.position.y = -0.7; armL.add(armLM); root.add(armL);
  var armR = new THREE.Group(); armR.position.set(1.25, 3.6, 0);
  var armRM = box(0.55, 1.6, 0.55, SUIT); armRM.position.y = -0.7; armR.add(armRM);
  var gun = new THREE.Group(); gun.position.set(0, -1.5, 0.2);
  var g1 = box(0.35, 0.5, 1.7, GUN); g1.position.set(0, 0, 0.6); gun.add(g1);
  var g2 = box(0.3, 0.7, 0.4, GUN); g2.position.set(0, -0.45, 0.1); gun.add(g2);
  var flash = box(0.55, 0.55, 0.6, 0xffd23a); flash.position.set(0, 0.05, 1.7); flash.visible = false; gun.add(flash);
  armR.add(gun); root.add(armR);

  var mode = 'walk';
  var modeT = 0;
  var t = 0;
  var nameX = -11;
  var nameEl = document.getElementById('mascotName');
  window.__mascot = {
    setMode: function (m) {
      if (m !== mode) { mode = m; modeT = 0; }
    }
  };

  var clock = new THREE.Clock();
  function tick() {
    requestAnimationFrame(tick);
    var dt = Math.min(0.05, clock.getDelta());
    t += dt;
    modeT += dt;

    if (mode === 'walk') {
      var s = Math.sin(t * 9);
      legL.rotation.x = s * 0.7; legR.rotation.x = -s * 0.7;
      armL.rotation.x = -s * 0.5;
      armR.rotation.x = -0.5; armR.rotation.z = -0.12;
      root.position.x = Math.min(2, -9 + modeT * 3.2);
      root.position.y = Math.abs(Math.cos(t * 9)) * 0.15;
      if (modeT > 4.0) { mode = 'idle'; modeT = 0; }
    } else if (mode === 'thinking') {
      legL.rotation.x = 0; legR.rotation.x = 0;
      armL.rotation.x = -1.2; armL.rotation.z = 0.4;
      armR.rotation.x = -0.5; armR.rotation.z = -0.1;
      head.rotation.z = 0.15; head.rotation.x = Math.sin(t * 3) * 0.05;
      root.position.x = 2;
      root.position.y = Math.sin(t * 2) * 0.04;
      if (modeT > 1.8) { mode = 'idle'; modeT = 0; head.rotation.z = 0; head.rotation.x = 0; }
    } else if (mode === 'coding') {
      legL.rotation.x = 0; legR.rotation.x = 0;
      armL.rotation.x = -1.1 + Math.sin(t * 20) * 0.15; armL.rotation.z = 0.15;
      armR.rotation.x = -1.1 + Math.cos(t * 20) * 0.15; armR.rotation.z = -0.15;
      root.position.x = 2;
      root.position.y = Math.sin(t * 2) * 0.04;
      if (modeT > 1.8) { mode = 'idle'; modeT = 0; }
    } else if (mode === 'testing') {
      legL.rotation.x = 0; legR.rotation.x = 0;
      armL.rotation.x = -0.3; armL.rotation.z = 0;
      armR.rotation.x = -1.35 + Math.sin(t * 6) * 0.05; armR.rotation.z = -0.05;
      root.position.x = 2;
      root.position.y = Math.sin(t * 2) * 0.04;
      if (modeT > 1.8) { mode = 'idle'; modeT = 0; }
    } else if (mode === 'celebrate') {
      legL.rotation.x = 0.15; legR.rotation.x = -0.15;
      armL.rotation.x = -2.2 + Math.sin(t * 12) * 0.1; armL.rotation.z = 0.3;
      armR.rotation.x = -2.2 + Math.sin(t * 12) * 0.1; armR.rotation.z = -0.3;
      root.position.x = 2;
      root.position.y = 0.3 + Math.abs(Math.sin(t * 10)) * 0.25;
      if (modeT > 1.8) { mode = 'idle'; modeT = 0; }
    } else if (mode === 'shield') {
      legL.rotation.x = 0.2; legR.rotation.x = -0.2;
      armL.rotation.x = -1.5; armL.rotation.z = 0.6;
      armR.rotation.x = -1.5; armR.rotation.z = -0.6;
      root.position.x = 2;
      root.position.y = Math.sin(t * 2) * 0.03;
      if (modeT > 1.8) { mode = 'idle'; modeT = 0; }
    } else if (mode === 'shoot') {
      legL.rotation.x = 0.25; legR.rotation.x = -0.25;
      armR.rotation.x = -1.35 + Math.sin(t * 28) * 0.07;
      armR.rotation.z = 0;
      armL.rotation.x = 0.35;
      flash.visible = (Math.floor(t * 14) % 2 === 0);
      root.position.x = 2;
      root.position.y = Math.sin(t * 28) * 0.04;
      if (modeT > 1.8) { mode = 'idle'; modeT = 0; }
    } else {
      legL.rotation.x = 0; legR.rotation.x = 0;
      armR.rotation.x = -0.85; armR.rotation.z = -0.08;
      armL.rotation.x = 0; armL.rotation.z = 0;
      head.rotation.z = 0; head.rotation.x = 0;
      flash.visible = false;
      root.position.x = 2;
      root.position.y = Math.sin(t * 2) * 0.06;
    }
    var targetX = root.position.x - 5.2;
    nameX += (targetX - nameX) * 0.05;
    if (nameEl) {
      nameEl.style.left = Math.round((nameX + 12) / 24 * 240) + 'px';
      nameEl.style.opacity = mode === 'idle' ? '0.85' : '1';
    }
    renderer.render(scene, cam);
  }
  tick();
})();
</script>
</body>
</html>
`;
