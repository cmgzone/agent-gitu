export const UI_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hermes</title>
<style>
  :root {
    --bg: #f7f7f5;
    --card: #ffffff;
    --border: #e6e6e2;
    --border2: #d8d8d3;
    --text: #23231f;
    --muted: #8b8b84;
    --faint: #b9b9b2;
    --dark: #2a2a26;
    --green: #16a34a;
    --red: #dc2626;
    --amber: #b45309;
    --amber-bg: #fffbeb;
    --blue: #2563eb;
    --accent: #7c6cf0;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 13.5px/1.6 -apple-system, "Segoe UI", system-ui, sans-serif; }
  button { font: inherit; cursor: pointer; }
  select, textarea, input { font: inherit; }
  [hidden] { display: none !important; }

  .shell { display: flex; height: 100%; }
  .sb { width: 264px; flex: none; border-right: 1px solid var(--border); background: var(--bg); display: flex; flex-direction: column; overflow: hidden; }
  .sb .head { display: flex; align-items: center; gap: 8px; padding: 14px 14px 8px; }
  .sb .head .name { font-weight: 700; letter-spacing: 2px; font-size: 14px; }
  .sb .head .spacer { flex: 1; }
  .sb .iconbtn { background: none; border: 0; color: var(--muted); width: 28px; height: 28px; border-radius: 7px; font-size: 15px; }
  .sb .iconbtn:hover { background: #ebebe7; color: var(--text); }
  .sb .scroll { flex: 1; overflow-y: auto; padding: 4px 10px 10px; }
  .sb .newbtn { margin: 6px 4px 10px; display: flex; align-items: center; gap: 9px; border: 0; background: #ebebe7; border-radius: 9px; padding: 8px 11px; font-weight: 600; font-size: 13px; width: calc(100% - 8px); text-align: left; }
  .sb .newbtn:hover { background: #e2e2dd; }
  .sb .navitem { display: flex; align-items: center; gap: 9px; padding: 7px 10px; border-radius: 8px; color: var(--text); font-size: 13px; cursor: pointer; border: 0; background: none; width: 100%; text-align: left; }
  .sb .navitem:hover { background: #ebebe7; }
  .sb .navitem .ico { width: 16px; text-align: center; color: var(--muted); }
  .sb .sect { font-size: 11px; color: var(--muted); margin: 14px 10px 4px; }
  .sb .proj { display: flex; align-items: center; gap: 8px; padding: 6px 10px; font-size: 12.5px; font-weight: 600; color: var(--text); border-radius: 8px; cursor: pointer; }
  .sb .proj:hover { background: #ebebe7; }
  .sb .chat { display: flex; align-items: center; gap: 8px; padding: 5px 10px 5px 26px; font-size: 12.5px; color: var(--muted); border-radius: 8px; cursor: pointer; border: 0; background: none; width: 100%; text-align: left; }
  .sb .chat:hover { background: #ebebe7; color: var(--text); }
  .sb .chat.active { background: #e5e3fb; color: var(--text); }
  .sb .chat .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--faint); flex: none; }
  .sb .chat .dot.running { background: var(--blue); animation: pulse 1.2s infinite; }
  .sb .chat .dot.completed { background: var(--green); }
  .sb .chat .dot.blocked, .sb .chat .dot.failed { background: var(--red); }
  .sb .foot { border-top: 1px solid var(--border); padding: 10px 12px; display: flex; gap: 8px; align-items: center; }
  .sb .foot .chip { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--muted); }
  @keyframes pulse { 50% { opacity: .35; } }

  .main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .topbar { display: flex; align-items: center; gap: 10px; padding: 10px 20px; border-bottom: 1px solid var(--border); flex: none; }
  .topbar .title { font-weight: 600; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .topbar .spacer { flex: 1; }
  .view { flex: 1; overflow: hidden; display: flex; flex-direction: column; }

  .home { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; padding: 24px; overflow: auto; }
  .home h1 { font-size: 24px; font-weight: 600; margin: 0; }
  .home h1 .u { border-bottom: 2px dotted var(--faint); }
  .sugs { display: grid; grid-template-columns: repeat(4, 170px); gap: 12px; }
  @media (max-width: 900px) { .sugs { grid-template-columns: repeat(2, 170px); } }
  .sug { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 14px; text-align: left; cursor: pointer; font-size: 12.5px; color: var(--text); }
  .sug:hover { border-color: var(--border2); box-shadow: 0 2px 10px rgba(0,0,0,.05); }
  .sug .ico { font-size: 15px; display: block; margin-bottom: 10px; }
  .composer { width: min(760px, 94vw); background: var(--card); border: 1px solid var(--border); border-radius: 14px; box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.05); padding: 6px 8px 8px; }
  .composer textarea { width: 100%; border: 0; outline: none; resize: none; background: transparent; color: var(--text); font: inherit; padding: 10px 10px 6px; min-height: 44px; max-height: 180px; }
  .composer textarea::placeholder { color: var(--faint); }
  .composer-bar { display: flex; align-items: center; gap: 4px; padding: 2px 6px; flex-wrap: wrap; }
  .pill { background: none; border: 0; color: var(--muted); border-radius: 8px; padding: 5px 9px; display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; }
  .pill:hover { background: #f0f0ec; color: var(--text); }
  .pill select { border: 0; background: none; color: inherit; outline: none; font-size: 12.5px; appearance: none; -webkit-appearance: none; padding-right: 2px; max-width: 220px; }
  .pill .caret { color: var(--faint); font-size: 10px; }
  .send { margin-left: auto; width: 30px; height: 30px; border-radius: 9px; border: 0; background: var(--dark); color: #fff; font-size: 14px; }
  .send:disabled { background: #c9c9c3; }

  .run { flex: 1; display: flex; min-height: 0; }
  .run-main { flex: 1; display: flex; flex-direction: column; min-width: 0; border-right: 1px solid var(--border); }
  .progress { display: flex; align-items: center; gap: 12px; padding: 6px 26px 6px; color: var(--muted); font-size: 11.5px; flex: none; }
  .progress .pbar { flex: 1; height: 4px; border-radius: 2px; background: #e7e7e2; overflow: hidden; }
  .progress .pbar span { display: block; height: 100%; width: 0; background: var(--dark); transition: width .5s ease; }
  .stream { flex: 1; overflow-y: auto; padding: 8px 26px 18px; }
  .thought { padding: 10px 2px; color: var(--text); white-space: pre-wrap; }
  .thought .caret { display: inline-block; width: 7px; height: 14px; background: var(--dark); vertical-align: -2px; animation: pulse 1s infinite; margin-left: 2px; }
  .meta-line { color: var(--muted); font-size: 12px; padding: 3px 2px; }
  .meta-line b { color: var(--text); font-weight: 600; }
  .tool { border: 1px solid var(--border); background: var(--card); border-radius: 10px; margin: 8px 0; overflow: hidden; }
  .tool .head { display: flex; align-items: center; gap: 9px; padding: 8px 12px; cursor: pointer; }
  .tool .head:hover { background: #fbfbf9; }
  .tool .kind { font-family: var(--mono); font-size: 10px; letter-spacing: .5px; color: var(--muted); background: #f0f0ec; border-radius: 5px; padding: 2px 7px; flex: none; }
  .tool .sum { font-family: var(--mono); font-size: 12px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tool .reason { color: var(--muted); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tool .st { margin-left: auto; flex: none; }
  .tool .spin { width: 10px; height: 10px; border: 2px solid var(--border2); border-top-color: var(--dark); border-radius: 50%; animation: spin .8s linear infinite; flex: none; }
  .tool details { border-top: 1px solid var(--border); }
  .tool summary { padding: 5px 12px; font-size: 11px; color: var(--muted); cursor: pointer; user-select: none; }
  .tool pre { margin: 0; padding: 8px 12px 10px; font-family: var(--mono); font-size: 11.5px; color: #55554f; white-space: pre-wrap; word-break: break-word; max-height: 260px; overflow-y: auto; }
  .tool .lines { margin-left: 8px; font-family: var(--mono); font-size: 10.5px; color: var(--green); background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 5px; padding: 1px 7px; flex: none; }

  .chip { font-size: 11px; border-radius: 999px; padding: 2px 9px; border: 1px solid var(--border2); color: var(--muted); }
  .chip.ok { color: var(--green); border-color: #bbf7d0; background: #f0fdf4; }
  .chip.bad { color: var(--red); border-color: #fecaca; background: #fef2f2; }
  .chip.info { color: var(--blue); border-color: #bfdbfe; background: #eff6ff; }
  .chip.warn { color: var(--amber); border-color: #fde68a; background: var(--amber-bg); }

  .review-card, .approval { border: 1px solid #fde68a; background: var(--amber-bg); border-radius: 12px; padding: 14px 16px; margin: 12px 0; }
  .review-card h3, .approval h3 { margin: 0 0 8px; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: var(--amber); }
  .review-card label { display: block; font-size: 11px; color: var(--muted); margin: 8px 0 3px; }
  .review-card textarea { width: 100%; border: 1px solid var(--border); border-radius: 8px; background: #fff; padding: 7px 9px; font-family: var(--mono); font-size: 11.5px; resize: vertical; }
  .review-card .actions, .approval .actions { display: flex; gap: 8px; margin-top: 12px; align-items: center; }
  .review-card input { flex: 1; border: 1px solid var(--border); border-radius: 8px; background: #fff; padding: 6px 9px; font-size: 12px; }
  .btn { border: 0; border-radius: 8px; padding: 6px 14px; font-size: 12.5px; font-weight: 600; }
  .btn.dark { background: var(--dark); color: #fff; }
  .btn.ghost { background: #fff; color: var(--text); border: 1px solid var(--border2); }
  .btn.red { background: #fff; color: var(--red); border: 1px solid #fecaca; }
  .approval pre { font-family: var(--mono); font-size: 11.5px; background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; overflow-x: auto; margin: 6px 0 10px; }
  .md-plan { background: #fff; border: 1px solid var(--border); border-radius: 10px; padding: 4px 14px; margin: 6px 0; }
  .md-plan h4 { margin: 12px 0 6px; font-size: 12px; letter-spacing: .8px; text-transform: uppercase; color: var(--muted); }
  .md-plan ol { margin: 0 0 12px; padding-left: 20px; }
  .md-plan li { margin: 8px 0; font-size: 13px; }
  .md-plan li .ver { display: block; color: var(--muted); font-size: 11.5px; }
  .md-plan ul { margin: 0 0 12px; padding-left: 20px; font-size: 12.5px; }

  .qcard { border: 1px solid #bfdbfe; background: #eff6ff; border-radius: 12px; padding: 14px 16px; margin: 12px 0; }
  .qcard h3 { margin: 0 0 10px; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: var(--blue); }
  .qcard .q { margin-bottom: 12px; }
  .qcard .q .qt { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
  .qcard .opts { display: flex; gap: 6px; flex-wrap: wrap; }
  .qcard .opt { border: 1px solid var(--border2); background: #fff; border-radius: 999px; padding: 4px 12px; font-size: 12px; cursor: pointer; }
  .qcard .opt.sel { border-color: var(--blue); color: var(--blue); background: #eff6ff; }
  .qcard .custom { width: 100%; margin-top: 6px; border: 1px solid var(--border); border-radius: 8px; padding: 6px 9px; font-size: 12px; background: #fff; }

  .summary-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 18px 20px; margin: 16px 0; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
  .summary-card h2 { margin: 0 0 4px; font-size: 15px; }
  .summary-card .sec { margin-top: 12px; }
  .summary-card .sec h4 { margin: 0 0 5px; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); }
  .summary-card ul { margin: 0; padding-left: 18px; font-size: 12.5px; }
  .summary-card li { margin: 2px 0; }
  .file-chip { display: inline-block; font-family: var(--mono); font-size: 11px; border: 1px solid var(--border); border-radius: 6px; padding: 2px 7px; margin: 2px 4px 2px 0; background: #fafaf8; }

  @keyframes shimmer { 0% { background-position: -300px 0; } 100% { background-position: 300px 0; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  .working { display: flex; align-items: center; gap: 10px; padding: 12px 2px; }
  .working .spinner { width: 12px; height: 12px; border: 2px solid var(--border2); border-top-color: var(--dark); border-radius: 50%; animation: spin .8s linear infinite; flex: none; }
  .working .shimmer { height: 9px; width: 120px; border-radius: 5px; background: linear-gradient(90deg, #e8e8e3 25%, #f6f6f2 50%, #e8e8e3 75%); background-size: 600px 100%; animation: shimmer 1.3s linear infinite; flex: none; }
  .working .wtext { color: var(--muted); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .run-side { width: 380px; flex: none; display: flex; flex-direction: column; min-height: 0; }
  .side-tabs { display: flex; gap: 4px; padding: 10px 14px 0; flex: none; }
  .side-tab { border: 1px solid transparent; background: none; color: var(--muted); border-radius: 8px 8px 0 0; padding: 6px 14px; font-size: 12.5px; }
  .side-tab.active { background: var(--card); border-color: var(--border); border-bottom-color: var(--card); color: var(--text); }
  .side-body { flex: 1; overflow-y: auto; background: var(--card); border-top: 1px solid var(--border); padding: 16px 18px; }
  .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 18px; }
  .stat .k { font-size: 11px; color: var(--muted); margin-bottom: 2px; }
  .stat .v { font-size: 12.5px; font-weight: 600; word-break: break-word; }
  .stat .v.mono { font-family: var(--mono); font-weight: 500; font-size: 12px; }
  .section-h { font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); margin: 20px 0 8px; }
  .crit { display: flex; gap: 8px; padding: 5px 0; font-size: 12.5px; align-items: flex-start; }
  .crit .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex: none; background: var(--faint); }
  .crit.done .dot { background: var(--green); }
  .crit .ev-ids { font-family: var(--mono); font-size: 10.5px; color: var(--muted); }
  .step { display: flex; gap: 8px; padding: 4px 0; font-size: 12.5px; }
  .step .st { font-family: var(--mono); font-size: 10.5px; width: 76px; flex: none; color: var(--muted); padding-top: 1px; }
  .step .st.done { color: var(--green); } .step .st.failed, .step .st.blocked { color: var(--red); } .step .st.in_progress { color: var(--blue); }
  .bar { height: 6px; border-radius: 3px; background: #eee; overflow: hidden; display: flex; margin: 8px 0 6px; }
  .bar span { height: 100%; }
  .legend { display: flex; gap: 12px; flex-wrap: wrap; font-size: 11px; color: var(--muted); }
  .legend i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; margin-right: 4px; }
  .raw { border: 1px solid var(--border); border-radius: 8px; margin-top: 8px; overflow: hidden; }
  .raw .row { display: flex; justify-content: space-between; gap: 10px; padding: 6px 10px; font-family: var(--mono); font-size: 11px; border-bottom: 1px solid var(--border); color: #55554f; }
  .raw .row:last-child { border-bottom: 0; }
  .raw .row .t { color: var(--faint); flex: none; }
  .empty { color: var(--faint); font-size: 12.5px; padding: 4px 0; }

  .bottom-composer { border-top: 1px solid var(--border); padding: 10px 26px 14px; flex: none; background: var(--bg); }
  .bottom-composer .composer { width: 100%; box-shadow: none; }

  .settings { position: fixed; inset: 0; background: var(--bg); z-index: 40; display: flex; }
  .setnav { width: 264px; border-right: 1px solid var(--border); padding: 16px 10px; overflow-y: auto; }
  .setnav .back { display: flex; gap: 8px; align-items: center; border: 0; background: none; color: var(--muted); font-size: 13px; padding: 6px 10px; border-radius: 8px; margin-bottom: 10px; }
  .setnav .back:hover { background: #ebebe7; color: var(--text); }
  .setnav .item { display: flex; gap: 10px; align-items: center; padding: 8px 10px; border-radius: 8px; font-size: 13px; cursor: pointer; border: 0; background: none; width: 100%; text-align: left; color: var(--text); }
  .setnav .item:hover { background: #ebebe7; }
  .setnav .item.active { background: #e5e3fb; }
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
  .setrow select, .setrow input[type=text] { border: 1px solid var(--border); border-radius: 8px; background: #fff; padding: 6px 10px; font-size: 12.5px; }
  .toggle { width: 38px; height: 22px; border-radius: 999px; background: #d6d6d0; border: 0; position: relative; transition: background .15s; flex: none; }
  .toggle.on { background: var(--blue); }
  .toggle::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left .15s; }
  .toggle.on::after { left: 19px; }
  .setlist { padding: 10px 18px; }
  .setlist .row { display: flex; gap: 8px; align-items: center; padding: 6px 0; font-size: 12.5px; }
  .setlist .row .grow { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .setlist .x { color: var(--faint); cursor: pointer; border: 0; background: none; }
  .setlist .x:hover { color: var(--red); }
  .setlist input, .setlist textarea { width: 100%; border: 1px solid var(--border); border-radius: 8px; background: #fff; padding: 6px 9px; font-size: 12px; margin-bottom: 6px; }
  .setlist .meta { color: var(--muted); font-size: 11px; }
  @media (max-width: 1080px) { .run-side { display: none; } }
</style>
</head>
<body>
<div class="shell">
  <aside class="sb">
    <div class="head">
      <span class="name">HERMES</span>
      <span class="spacer"></span>
      <button class="iconbtn" id="gearBtn" title="settings">&#9881;</button>
    </div>
    <div class="scroll" id="sbScroll"></div>
    <div class="foot">
      <span class="chip" id="projChip">…</span>
    </div>
  </aside>
  <div class="main">
    <div class="topbar" id="topbar"></div>
    <div class="view" id="view"></div>
  </div>
</div>
<div class="settings" id="settings" hidden>
  <aside class="setnav" id="setnav"></aside>
  <div class="setbody" id="setbody"></div>
</div>
<script>
(function () {
  var S = {
    active: 'home', project: null, models: [], sessions: {}, es: null, poll: null, files: [],
    draft: '',
    sel: { wf: 'review', model: '', budget: '40', effort: 'high' },
    settings: { review: true, autoApprove: false, projectPath: '' },
    setSection: 'general'
  };
  try {
    var saved = JSON.parse(localStorage.getItem('hermes.settings') || 'null');
    if (saved) {
      if (saved.sel) for (var k in saved.sel) S.sel[k] = saved.sel[k];
      if (saved.settings) for (var k2 in saved.settings) S.settings[k2] = saved.settings[k2];
      S.draft = saved.draft || '';
    }
  } catch (e) {}
  function persist() {
    try { localStorage.setItem('hermes.settings', JSON.stringify({ sel: S.sel, settings: S.settings, draft: S.draft })); } catch (e) {}
  }
  function $(id) { return document.getElementById(id); }
  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function api(path, opts) {
    return fetch(path, opts).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || String(r.status)); });
      return r.json();
    });
  }
  function titleCase(m) { return m.replace(/(^|[-.])([a-z])/g, function (a, sep, ch) { return sep + ch.toUpperCase(); }); }
  function basename(p) { var parts = String(p).replace(/\\/g, '/').split('/'); return parts[parts.length - 1] || p; }
  function chipFor(status) {
    if (status === 'completed') return '<span class="chip ok">complete</span>';
    if (status === 'blocked') return '<span class="chip bad">blocked</span>';
    if (status === 'failed') return '<span class="chip bad">failed</span>';
    if (status === 'review') return '<span class="chip warn">awaiting review</span>';
    if (status === 'running') return '<span class="chip info">running</span>';
    return '<span class="chip">' + esc(status || 'idle') + '</span>';
  }

  function renderSidebar() {
    api('/api/runs').then(function (sessions) {
      var byProj = {};
      sessions.forEach(function (s) {
        var p = s.project || basename(S.settings.projectPath || '') || 'project';
        (byProj[p] = byProj[p] || []).push(s);
      });
      var html = '<button class="newbtn" id="sbNew">&#9998; New session</button>' +
        '<button class="navitem" data-set="cron"><span class="ico">&#9200;</span>Scheduled</button>' +
        '<button class="navitem" data-set="skills"><span class="ico">&#9889;</span>Skills</button>' +
        '<button class="navitem" data-set="mcp"><span class="ico">&#128268;</span>MCP servers</button>' +
        '<div class="sect">Projects</div>';
      var names = Object.keys(byProj);
      if (!names.length) html += '<div class="empty" style="padding-left:10px">No chats yet</div>';
      names.forEach(function (p) {
        html += '<div class="proj" data-projpick="' + esc(p) + '">&#128193; ' + esc(p) + '</div>';
        byProj[p].slice(0, 8).forEach(function (s) {
          html += '<button class="chat ' + (S.active === s.runId ? 'active' : '') + '" data-run="' + esc(s.runId) + '">' +
            '<span class="dot ' + esc(s.status) + '"></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(s.goal.slice(0, 34)) + '</span></button>';
        });
      });
      $('sbScroll').innerHTML = html;
      $('sbNew').onclick = function () { openHome(); };
      $('sbScroll').querySelectorAll('[data-run]').forEach(function (el) {
        el.onclick = function () { openRun(el.getAttribute('data-run')); };
      });
      $('sbScroll').querySelectorAll('[data-set]').forEach(function (el) {
        el.onclick = function () { openSettings(el.getAttribute('data-set')); };
      });
      $('sbScroll').querySelectorAll('[data-projpick]').forEach(function (el) {
        el.onclick = function () {
          S.settings.projectPath = el.getAttribute('data-projpick');
          persist();
          updateProjChip();
        };
      });
    }).catch(function () {});
    api('/api/cron').then(function (d) { S.cronCount = (d.jobs || []).length; }).catch(function () {});
  }

  function updateProjChip() {
    var name = S.settings.projectPath ? basename(S.settings.projectPath) : (S.project ? S.project.name : 'no project');
    $('projChip').textContent = ' ' + name;
  }

  function renderTopbar() {
    var tb = $('topbar');
    if (S.active === 'home') {
      tb.innerHTML = '<span class="title">New session</span><span class="spacer"></span>';
      return;
    }
    var sess = S.sessions[S.active];
    var s = sess && sess.session;
    tb.innerHTML = '<span class="title">' + esc(s ? s.goal : '') + '</span>' +
      (s ? chipFor(s.status) : '') +
      (s && s.taskId ? ' <span class="chip">' + esc(s.taskId) + '</span>' : '') +
      '<span class="spacer"></span>' +
      '<button class="btn red" id="stopBtn" style="' + (s && s.status === 'running' ? '' : 'display:none') + '">Stop</button>';
    var stop = $('stopBtn');
    if (stop) stop.onclick = function () { api('/api/runs/' + S.active + '/stop', { method: 'POST' }).catch(function (e) { alert(e.message); }); };
  }

  function stopStreams() { if (S.es) { S.es.close(); S.es = null; } if (S.poll) { clearInterval(S.poll); S.poll = null; } }

  function openHome() {
    S.active = 'home';
    stopStreams();
    renderSidebar();
    renderTopbar();
    var name = S.settings.projectPath ? basename(S.settings.projectPath) : (S.project ? S.project.name : 'this project');
    $('view').innerHTML =
      '<div class="home">' +
      '<h1>What should we work on in <span class="u">' + esc(name) + '</span>?</h1>' +
      '<div class="sugs">' +
      '<button class="sug" data-sug="Explore and understand the codebase"><span class="ico" style="color:#2563eb">&#128269;</span>Explore and understand code</button>' +
      '<button class="sug" data-sug="Build a new feature, app, or tool"><span class="ico" style="color:#7c6cf0">&#128296;</span>Build a new feature, app, or tool</button>' +
      '<button class="sug" data-sug="Review the code and suggest changes"><span class="ico" style="color:#16a34a">&#9989;</span>Review code and suggest changes</button>' +
      '<button class="sug" data-sug="Fix issues and failures"><span class="ico" style="color:#dc2626">&#128295;</span>Fix issues and failures</button>' +
      '</div>' +
      '<div class="composer"><textarea id="goal" rows="1" placeholder="Ask Hermes to complete a task…"></textarea>' +
      '<div class="composer-bar">' + controlsHtml(true) + '<button class="send" id="send" title="start">&#8593;</button></div></div>' +
      '</div>';
    var ta = $('goal');
    ta.value = S.draft;
    ta.addEventListener('input', function () { S.draft = ta.value; persist(); ta.style.height = 'auto'; ta.style.height = Math.min(180, ta.scrollHeight) + 'px'; });
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); startRun(); } });
    $('view').querySelectorAll('[data-sug]').forEach(function (el) {
      el.onclick = function () { ta.value = el.getAttribute('data-sug'); S.draft = ta.value; persist(); ta.focus(); };
    });
    bindControls();
    $('send').onclick = startRun;
  }

  function modelOptionsHtml() {
    var out = '';
    S.models.forEach(function (p) {
      out += '<option value="' + esc(p.id + '::' + p.defaultModel) + '">' + esc(p.id + ' / ' + titleCase(p.defaultModel)) + '</option>';
      p.models.forEach(function (m) {
        if (m === p.defaultModel) return;
        out += '<option value="' + esc(p.id + '::' + m) + '">' + esc(p.id + ' / ' + titleCase(m)) + '</option>';
      });
    });
    return out;
  }
  function provOf(v) { return v.split('::')[0]; }
  function effortLevelsFor(pid) {
    for (var i = 0; i < S.models.length; i++) if (S.models[i].id === pid) return S.models[i].effortLevels || ['low', 'medium', 'high', 'max'];
    return ['low', 'medium', 'high', 'max'];
  }
  function fillEffort(id, pid) {
    var el = $(id);
    if (!el) return;
    el.innerHTML = effortLevelsFor(pid).map(function (l) { return '<option value="' + l + '">' + l + '</option>'; }).join('');
  }
  function controlsHtml(showBudget) {
    return '<span class="pill"><select id="wf"><option value="review">Plan mode</option><option value="auto">Build mode</option><option value="chat">Chat mode</option></select><span class="caret">&#9662;</span></span>' +
      '<span class="pill"><select id="model">' + modelOptionsHtml() + '</select><span class="caret">&#9662;</span></span>' +
      '<span class="pill" title="intelligence level"><select id="effort"></select><span class="caret">&#9662;</span></span>' +
      (showBudget ? '<span class="pill"><select id="budget"><option value="40">40 actions</option><option value="20">20 actions</option><option value="80">80 actions</option></select><span class="caret">&#9662;</span></span>' : '');
  }
  function bindControls() {
    var wf = $('wf'), model = $('model'), effort = $('effort'), budget = $('budget');
    if (wf) wf.value = S.sel.wf;
    if (model) { if (S.sel.model) model.value = S.sel.model; if (!model.value && model.options.length) model.value = model.options[0].value; S.sel.model = model.value; }
    if (budget) budget.value = S.sel.budget;
    fillEffort('effort', provOf(S.sel.model));
    if (effort) effort.value = S.sel.effort;
    if (wf) wf.onchange = function () { S.sel.wf = wf.value; persist(); };
    if (model) model.onchange = function () { S.sel.model = model.value; fillEffort('effort', provOf(model.value)); persist(); };
    if (effort) effort.onchange = function () { S.sel.effort = effort.value; persist(); };
    if (budget) budget.onchange = function () { S.sel.budget = budget.value; persist(); };
  }

  function startRun() {
    var goal = $('goal') ? $('goal').value.trim() : '';
    if (!goal) { if ($('goal')) $('goal').focus(); return; }
    var mc = (S.sel.model || '').split('::');
    api('/api/runs', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        goal: goal, provider: mc[0], model: mc[1],
        mode: S.sel.wf === 'chat' ? 'chat' : 'standard',
        review: S.sel.wf === 'review' ? S.settings.review : false,
        autoApprove: S.settings.autoApprove,
        effort: S.sel.effort,
        projectPath: S.settings.projectPath || undefined,
        maxActions: Number(S.sel.budget),
        scope: (S.settings.scope || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean),
        constraints: (S.settings.constraints || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean)
      })
    }).then(function (r) {
      S.draft = ''; persist();
      openRun(r.runId);
      renderSidebar();
    }).catch(function (e) { alert('Failed to start: ' + e.message); });
  }

  function openRun(runId) {
    S.active = runId;
    stopStreams();
    var sess = S.sessions[runId] || (S.sessions[runId] = { events: [], ledger: null, session: null, side: 'state', nodes: {} });
    sess.nodes = {};
    renderSidebar();
    renderTopbar();
    $('view').innerHTML =
      '<div class="run"><div class="run-main">' +
      '<div class="progress" id="progress" style="display:none"><span id="progText"></span><div class="pbar"><span id="progFill"></span></div></div>' +
      '<div class="stream" id="stream"></div>' +
      '<div class="bottom-composer"><div class="composer"><textarea id="follow" rows="1" placeholder="Message Hermes… Enter sends to this session while working, or continues it when done"></textarea>' +
      '<div class="composer-bar">' + controlsHtml(false) + '<button class="send" id="send2">&#8593;</button></div></div></div>' +
      '</div>' +
      '<aside class="run-side"><div class="side-tabs">' +
      '<button class="side-tab ' + (sess.side === 'state' ? 'active' : '') + '" data-side="state">State</button>' +
      '<button class="side-tab ' + (sess.side === 'context' ? 'active' : '') + '" data-side="context">Context</button>' +
      '</div><div class="side-body" id="sideBody"></div></aside></div>';
    var tabs = document.querySelectorAll('.side-tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].onclick = function () { sess.side = this.getAttribute('data-side'); renderRunSide(runId); };
    $('follow').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var g = $('follow').value.trim();
      if (!g) return;
      api('/api/runs/' + runId + '/message', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: g }) })
        .then(function () {
          $('follow').value = '';
          var stream = $('stream');
          if (stream) {
            var bubble = userBubble(g);
            var working = $('working');
            if (working) stream.insertBefore(bubble, working); else stream.appendChild(bubble);
            stream.scrollTop = stream.scrollHeight;
          }
          setWorking('Thinking…');
          if (!S.poll) S.poll = setInterval(function () { pollRun(runId); }, 1500);
        })
        .catch(function (er) {
          var msg = String(er.message);
          if (msg.indexOf('run not found') >= 0) {
            var mc = (S.sel.model || '').split('::');
            api('/api/runs', {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                goal: g, provider: mc[0], model: mc[1],
                mode: S.sel.wf === 'chat' ? 'chat' : 'standard',
                review: S.sel.wf === 'review' ? S.settings.review : false,
                autoApprove: S.settings.autoApprove,
                effort: S.sel.effort,
                projectPath: S.settings.projectPath || undefined
              })
            }).then(function (r) { openRun(r.runId); }).catch(function (e2) { alert(e2.message); });
          } else alert(msg);
        });
    });
    $('send2').onclick = function () { $('follow').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); };
    bindControls();
    sess.events.forEach(function (ev) { appendEvent(runId, ev); });
    sess.lastIndex = sess.events.length ? sess.events[sess.events.length - 1].i : -1;
    var w = document.createElement('div');
    w.className = 'working'; w.id = 'working';
    w.innerHTML = '<span class="spinner"></span><span class="shimmer"></span><span class="wtext" id="workingText">Connecting…</span>';
    $('stream').appendChild(w);
    setWorking('Thinking…');
    renderRunSide(runId);
    connect(runId);
    pollRun(runId);
    S.poll = setInterval(function () { pollRun(runId); }, 1500);
  }

  function connect(runId) {
    var es = new EventSource('/api/runs/' + runId + '/stream');
    S.es = es;
    es.onmessage = function (msg) {
      var ev = JSON.parse(msg.data);
      var sess = S.sessions[runId];
      if (!sess) return;
      if (sess.lastIndex == null) sess.lastIndex = -1;
      if (ev.i > sess.lastIndex) { sess.lastIndex = ev.i; sess.events.push(ev); appendEvent(runId, ev); }
    };
  }

  function userBubble(text) {
    var div = document.createElement('div');
    div.style.cssText = 'display:flex;justify-content:flex-end;margin:10px 0;';
    div.innerHTML = '<div style="max-width:75%;background:#eef2ff;border:1px solid #dbe3ff;border-radius:12px;padding:8px 12px;font-size:13px;white-space:pre-wrap">' +
      '<span style="color:var(--blue);font-size:10.5px;display:block;margin-bottom:2px">you</span>' + esc(text) + '</div>';
    return div;
  }

  function closeThought(runId) {
    var sess = S.sessions[runId];
    var node = sess.nodes.thought;
    if (node) { var c = node.querySelector('.caret'); if (c) c.remove(); sess.nodes.thought = null; }
  }
  function toolKind(summary) {
    if (summary.indexOf('write ') === 0) return 'edit';
    if (summary.indexOf('edit ') === 0) return 'edit';
    if (summary.indexOf('read ') === 0) return 'read';
    if (summary.indexOf('list ') === 0) return 'list';
    if (summary.indexOf('search ') === 0) return 'search';
    if (summary.indexOf('$ ') === 0) return 'shell';
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
  function setWorking(text) {
    var w = $('working');
    if (!w) return;
    if (!text) { w.style.display = 'none'; return; }
    w.style.display = 'flex';
    var t = $('workingText');
    if (t && t.textContent !== text) t.textContent = text;
  }

  function appendEvent(runId, ev) {
    var stream = $('stream');
    if (!stream) return;
    var sess = S.sessions[runId];
    var text = String(ev.text);
    var working = $('working');
    function insert(el) { if (working) stream.insertBefore(el, working); else stream.appendChild(el); }

    if (text.indexOf('tdelta ') === 0) {
      if (!sess.nodes.thought) {
        var p = document.createElement('div');
        p.className = 'thought';
        p.innerHTML = '<span class="txt"></span><span class="caret"></span>';
        insert(p);
        sess.nodes.thought = p;
      }
      sess.nodes.thought.querySelector('.txt').appendChild(document.createTextNode(text.slice(7)));
      stream.scrollTop = stream.scrollHeight;
      return;
    }
    if (text.indexOf('say ') === 0) {
      var prose = text.slice(4);
      if (!prose.trim()) { closeThought(runId); return; }
      var cur = sess.nodes.thought ? sess.nodes.thought.querySelector('.txt').textContent : '';
      cur = (cur || '').trim();
      if (!cur || (prose.indexOf(cur) !== 0 && cur.indexOf(prose) !== 0)) {
        var pp = document.createElement('div');
        pp.className = 'thought';
        pp.innerHTML = '<span class="txt">' + esc(prose) + '</span>';
        insert(pp);
      }
      closeThought(runId);
      return;
    }
    if (text.indexOf('think') === 0) { setWorking('Thinking…'); return; }
    if (text.indexOf('approval-required') === 0) { setWorking('Waiting for your approval…'); return; }
    if (text.indexOf('ask-user') === 0) { closeThought(runId); setWorking('Waiting for your answers…'); return; }
    if (text.indexOf('user-msg ') === 0) { insert(userBubble(text.slice(9))); stream.scrollTop = stream.scrollHeight; return; }
    if (text.indexOf('queued ') === 0 || text.indexOf('stopped ') === 0 || text.indexOf('continue ') === 0) {
      var qm = document.createElement('div');
      qm.className = 'meta-line';
      var qtag = text.split(' ')[0];
      var qrest = text.slice(text.indexOf(' ') + 1);
      var dashIdx = qrest.indexOf(' — ');
      if (dashIdx >= 0) qrest = qrest.slice(dashIdx + 3);
      qm.innerHTML = '<b>' + esc(qtag) + '</b> ' + esc(qrest);
      insert(qm);
      return;
    }
    if (text.indexOf('parallel') === 0) {
      var pm = document.createElement('div');
      pm.className = 'meta-line';
      pm.innerHTML = '<b>parallel</b> ' + esc(text.slice(9)) + ' — running concurrently';
      insert(pm);
      setWorking('Running parallel tools…');
      return;
    }
    if (text.indexOf('lines ') === 0) {
      var toolCard = sess.nodes.lastTool;
      if (toolCard && !toolCard.querySelector('.lines')) {
        var badge = document.createElement('span');
        badge.className = 'lines';
        badge.textContent = '+0 lines';
        toolCard.querySelector('.head').insertBefore(badge, toolCard.querySelector('.st'));
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

    closeThought(runId);
    var tag = text.split(' ')[0];
    var body = text.slice(tag.length).trim();

    if (tag === 'run') {
      var summary = splitSummary(body);
      var reason = splitReason(body);
      var card = document.createElement('div');
      card.className = 'tool';
      card.innerHTML =
        '<div class="head"><span class="kind">' + esc(toolKind(summary)) + '</span>' +
        '<span class="sum">' + esc(summary) + '</span>' +
        (reason ? '<span class="reason">— ' + esc(reason) + '</span>' : '') +
        '<span class="st"><span class="spin"></span></span></div>' +
        '<details><summary>output</summary><pre></pre></details>';
      insert(card);
      sess.nodes.lastTool = card;
      var wt = workingTextFor(text);
      if (wt) setWorking(wt);
      stream.scrollTop = stream.scrollHeight;
      return;
    }
    if (tag === 'ok' || tag === 'error' || tag === 'denied' || tag === 'blocked') {
      var tool = sess.nodes.lastTool;
      if (tool) {
        var st = tool.querySelector('.st');
        st.innerHTML = tag === 'ok' ? '<span class="chip ok">ok</span>' : tag === 'error' ? '<span class="chip bad">error</span>' : tag === 'denied' ? '<span class="chip bad">denied</span>' : '<span class="chip warn">blocked</span>';
      }
      setWorking('Thinking…');
      return;
    }
    if (tag === 'out') {
      var t2 = sess.nodes.lastTool;
      if (t2) t2.querySelector('pre').textContent = body.replace(/ ⏎ /g, '\n');
      return;
    }
    var meta = document.createElement('div');
    meta.className = 'meta-line';
    if (tag === 'evidence') meta.innerHTML = '<b style="color:' + (body.indexOf('PASS') >= 0 ? 'var(--green)' : 'var(--red)') + '">evidence</b> ' + esc(body);
    else if (tag === 'plan') meta.innerHTML = '<b>plan</b> ' + esc(body) + ' — review it, then approve to build';
    else meta.innerHTML = '<b>' + esc(tag) + '</b> ' + esc(body);
    insert(meta);
    var wt2 = workingTextFor(text);
    if (wt2) setWorking(wt2);
    stream.scrollTop = stream.scrollHeight;
  }

  function updateProgress(L) {
    var p = $('progress');
    if (!p || !L) return;
    var done = 0;
    L.plan.forEach(function (s) { if (s.status === 'done') done++; });
    var total = L.plan.length;
    p.style.display = 'flex';
    $('progText').textContent = (total ? 'Step ' + done + '/' + total : 'Planning…') + ' · ' + L.actions.length + '/' + L.budgets.maxActions + ' actions · ' + L.evidence.length + ' evidence';
    var width = Math.min(100, Math.round((done / Math.max(1, total)) * 70 + (L.actions.length / Math.max(1, L.budgets.maxActions)) * 30));
    $('progFill').style.width = width + '%';
  }

  function pollRun(runId) {
    if (S.active !== runId) return;
    api('/api/runs/' + runId).then(function (session) {
      var sess = S.sessions[runId];
      if (!sess) return;
      sess.session = session;
      renderTopbar();
      renderApprovals(runId, session);
      renderPlanReview(runId, session);
      renderQuestions(runId, session);
      if (session.status !== 'running' && !sess.summaryShown && session.report) {
        sess.summaryShown = true;
        appendSummary(runId, session);
      }
      if (session.taskId) {
        api('/api/tasks/' + session.taskId).then(function (ledger) {
          var s2 = S.sessions[runId];
          if (s2) { s2.ledger = ledger; renderRunSide(runId); updateProgress(ledger); }
        }).catch(function () {});
      } else renderRunSide(runId);
      if (session.status !== 'running') {
        setWorking(null);
        if (S.poll) { clearInterval(S.poll); S.poll = null; }
        renderSidebar();
      }
    }).catch(function () {});
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
      stream.scrollTop = stream.scrollHeight;
    });
    var olds = stream.querySelectorAll('.approval');
    for (var i = 0; i < olds.length; i++) {
      if (!pending[olds[i].getAttribute('data-aid')]) olds[i].remove();
    }
    stream.onclick = function (e) {
      var id = e.target.getAttribute && e.target.getAttribute('data-appr');
      if (id) {
        api('/api/approvals/' + id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approved: e.target.getAttribute('data-ok') === '1' }) })
          .catch(function (er) { alert(er.message); });
        return;
      }
      var head = e.target.closest && e.target.closest('.tool .head');
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
    var html = '<h3>Hermes has a few questions before starting</h3>';
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
    stream.scrollTop = stream.scrollHeight;
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
      var answers = q.questions.map(function (qq, qi2) {
        var custom = div.querySelector('.custom[data-q="' + qi2 + '"]');
        var val = (custom && custom.value.trim()) || selections[qi2] || '(no answer)';
        return qq.question + ' → ' + val;
      }).join('\n');
      api('/api/answers/' + q.id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answer: answers }) })
        .catch(function (er) { alert(er.message); });
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
    stream.scrollTop = stream.scrollHeight;
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
    $('prApprove').onclick = function () {
      api('/api/plan-review/' + pr.id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload(true)) })
        .catch(function (er) { alert(er.message); });
    };
    $('prChange').onclick = function () {
      api('/api/plan-review/' + pr.id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload(false)) })
        .catch(function (er) { alert(er.message); });
    };
  }

  function appendSummary(runId, session) {
    var stream = $('stream');
    if (!stream) return;
    var r = session.report;
    var sess = S.sessions[runId];
    var lineCounts = {};
    (sess.events || []).forEach(function (ev) {
      var t = String(ev.text);
      if (t.indexOf('lines ') === 0) {
        var parts = t.slice(6).split(' +');
        lineCounts[parts[0]] = (lineCounts[parts[0]] || 0) + (parseInt(parts[1], 10) || 0);
      }
    });
    var div = document.createElement('div');
    div.className = 'summary-card';
    var html = '<h2>' + esc(session.goal) + '</h2>' + chipFor(session.status);
    html += '<div class="sec"><h4>What was done</h4><p style="margin:0;font-size:12.5px">' + esc(r.summary) + '</p></div>';
    if (r.filesChanged.length) {
      html += '<div class="sec"><h4>Files</h4><ul>' + r.filesChanged.map(function (f) {
        return '<li><span class="file-chip">' + esc(f) + '</span>' + (lineCounts[f] ? ' <span style="color:var(--green);font-family:var(--mono);font-size:11px">+' + lineCounts[f] + ' lines</span>' : '') + '</li>';
      }).join('') + '</ul></div>';
    }
    if (r.verification.length) html += '<div class="sec"><h4>Verification evidence</h4><ul>' + r.verification.map(function (v) { return '<li>' + esc(v) + '</li>'; }).join('') + '</ul></div>';
    if (r.remainingRisks.length) html += '<div class="sec"><h4>Remaining risks</h4><ul>' + r.remainingRisks.map(function (v) { return '<li>' + esc(v) + '</li>'; }).join('') + '</ul></div>';
    if (r.followUps.length) html += '<div class="sec"><h4>Follow-ups</h4><ul>' + r.followUps.map(function (v) { return '<li>' + esc(v) + '</li>'; }).join('') + '</ul></div>';
    div.innerHTML = html;
    stream.appendChild(div);
    stream.scrollTop = stream.scrollHeight;
  }

  function renderRunSide(runId) {
    var sess = S.sessions[runId];
    var body = $('sideBody');
    if (!body || !sess) return;
    if (sess.side === 'context') { renderContext(runId); return; }
    var L = sess.ledger;
    if (!L) { body.innerHTML = '<div class="empty">Waiting for task ledger…</div>'; return; }
    var html = '<div class="section-h" style="margin-top:0">Acceptance criteria</div>';
    if (!L.acceptanceCriteria.length) html += '<div class="empty">none set yet</div>';
    L.acceptanceCriteria.forEach(function (c) {
      html += '<div class="crit ' + (c.satisfied ? 'done' : '') + '"><span class="dot"></span><div>' + esc(c.text) +
        (c.evidenceIds.length ? '<div class="ev-ids">' + esc(c.evidenceIds.join(', ')) + '</div>' : '') + '</div></div>';
    });
    html += '<div class="section-h">Plan' + (L.planApproved ? ' <span class="chip ok" style="margin-left:6px">approved</span>' : '') + '</div>';
    if (!L.plan.length) html += '<div class="empty">no plan yet</div>';
    L.plan.forEach(function (s) {
      html += '<div class="step"><span class="st ' + s.status + '">' + esc(s.status) + '</span><div>' + esc(s.description) + ' <span style="color:var(--faint)">· ' + esc(s.verification) + '</span></div></div>';
    });
    html += '<div class="section-h">Evidence</div>';
    if (!L.evidence.length) html += '<div class="empty">none yet</div>';
    L.evidence.forEach(function (e) {
      html += '<div class="step"><span class="st ' + (e.passed ? 'done' : 'failed') + '">' + (e.passed ? 'PASS' : 'FAIL') + '</span><div>' + esc(e.label) + '</div></div>';
    });
    html += '<div class="section-h">Files changed</div>';
    html += L.filesChanged.length ? L.filesChanged.map(function (f) { return '<span class="file-chip">' + esc(f) + '</span>'; }).join('') : '<div class="empty">none</div>';
    if (L.blockers.length) {
      html += '<div class="section-h">Blockers</div>';
      L.blockers.forEach(function (b) { html += '<div class="crit"><span class="dot" style="background:var(--red)"></span><div>' + esc(b) + '</div></div>'; });
    }
    if (L.report) html += '<div class="summary-card" style="margin:12px 0 0"><h3 style="margin:0 0 8px;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--muted)">Completion report</h3><pre style="font-family:var(--mono);font-size:12px;white-space:pre-wrap;margin:0">' + esc(reportText(L.report)) + '</pre></div>';
    body.innerHTML = html;
  }

  function reportText(r) {
    var lines = [r.status.toUpperCase() + ' — ' + r.summary];
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
    function stat(k, v, mono) { html += '<div class="stat"><div class="k">' + esc(k) + '</div><div class="v ' + (mono ? 'mono' : '') + '">' + esc(v) + '</div></div>'; }
    stat('Session', runId, true);
    stat('Status', session ? session.status : '—');
    stat('Provider', session && session.provider ? session.provider : '—');
    stat('Model', session && session.model ? session.model : '—');
    stat('Mode', L ? L.mode : '—');
    stat('Effort', S.sel.effort);
    stat('Started', session ? new Date(session.startedAt).toLocaleString() : '—');
    stat('Finished', session && session.finishedAt ? new Date(session.finishedAt).toLocaleString() : 'running…');
    if (L) {
      stat('Actions', L.actions.length + ' / ' + L.budgets.maxActions);
      stat('Plan attempts', L.plan.reduce(function (n, s) { return n + s.attempts; }, 0) + ' / ' + L.budgets.maxPlanAttempts);
      stat('Evidence', L.evidence.length);
      stat('Files changed', L.filesChanged.length);
      stat('Checkpoints', L.checkpoints.length);
    }
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
    renderSettings();
  }
  function closeSettings() { $('settings').hidden = true; }

  function renderSettings() {
    var items = [
      ['general', '⚙', 'General'],
      ['permissions', '🛡', 'Permissions'],
      ['project', '📁', 'Project'],
      ['skills', '⚡', 'Skills'],
      ['mcp', '🔌', 'MCP servers'],
      ['cron', '⏰', 'Scheduled / heartbeat']
    ];
    $('setnav').innerHTML =
      '<button class="back" id="setBack">&#8592; Back to app</button>' +
      '<div class="sect">Settings</div>' +
      items.map(function (it) {
        return '<button class="item ' + (S.setSection === it[0] ? 'active' : '') + '" data-sec="' + it[0] + '"><span>' + it[1] + '</span>' + it[2] + '</button>';
      }).join('');
    $('setBack').onclick = closeSettings;
    $('setnav').querySelectorAll('[data-sec]').forEach(function (el) {
      el.onclick = function () { S.setSection = el.getAttribute('data-sec'); renderSettings(); };
    });
    var b = $('setbody');
    if (S.setSection === 'general') {
      b.innerHTML = '<h1>General</h1>' +
        '<h2>Defaults</h2><div class="setcard">' +
        '<div class="setrow"><div class="grow"><div class="t">Default workflow</div><div class="d">Plan mode pauses for your review; Build runs straight through; Chat answers only.</div></div>' +
        '<select id="gWf"><option value="review">Plan mode</option><option value="auto">Build mode</option><option value="chat">Chat mode</option></select></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Intelligence level</div><div class="d">Reasoning effort sent to the model (dynamic per provider).</div></div><select id="gEffort"></select></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Action budget</div><div class="d">Maximum tool actions per task before the agent must stop.</div></div>' +
        '<select id="gBudget"><option value="20">20</option><option value="40">40</option><option value="80">80</option></select></div>' +
        '</div>';
      $('gWf').value = S.sel.wf;
      fillEffort('gEffort', provOf(S.sel.model));
      $('gEffort').value = S.sel.effort;
      $('gBudget').value = S.sel.budget;
      $('gWf').onchange = function () { S.sel.wf = $('gWf').value; persist(); };
      $('gEffort').onchange = function () { S.sel.effort = $('gEffort').value; persist(); };
      $('gBudget').onchange = function () { S.sel.budget = $('gBudget').value; persist(); };
    } else if (S.setSection === 'permissions') {
      b.innerHTML = '<h1>Permissions</h1>' +
        '<div class="setcard">' +
        '<div class="setrow"><div class="grow"><div class="t">Plan review</div><div class="d">In Plan mode the agent waits for your approval before building.</div></div><button class="toggle ' + (S.settings.review ? 'on' : '') + '" id="pReview"></button></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Auto-approve dangerous actions</div><div class="d">Skips the approval gate for destructive commands. Significantly increases risk of data loss.</div></div><button class="toggle ' + (S.settings.autoApprove ? 'on' : '') + '" id="pAuto"></button></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Loop prevention</div><div class="d">Repeated failing actions are blocked automatically. Always on.</div></div><button class="toggle on" disabled></button></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Evidence gate</div><div class="d">Tasks cannot complete without passing evidence for every criterion. Always on.</div></div><button class="toggle on" disabled></button></div>' +
        '</div>';
      $('pReview').onclick = function () { S.settings.review = !S.settings.review; persist(); renderSettings(); };
      $('pAuto').onclick = function () { S.settings.autoApprove = !S.settings.autoApprove; persist(); renderSettings(); };
    } else if (S.setSection === 'project') {
      b.innerHTML = '<h1>Project</h1>' +
        '<div class="setcard"><div class="setrow"><div class="grow"><div class="t">Active project path</div><div class="d">Each project has its own chats, skills, MCP servers and cron jobs.</div></div></div>' +
        '<div class="setlist"><input type="text" id="prPath" value="' + esc(S.settings.projectPath) + '" placeholder="C:\\path\\to\\project">' +
        '<div class="row"><button class="btn dark" id="prSave">Save project</button></div></div></div>';
      $('prSave').onclick = function () {
        S.settings.projectPath = $('prPath').value.trim();
        persist();
        updateProjChip();
        renderSidebar();
      };
    } else if (S.setSection === 'skills') {
      api('/api/skills').then(function (d) {
        b.innerHTML = '<h1>Skills</h1><p style="color:var(--muted);font-size:12.5px">Reusable knowledge. The agent can learn new skills with create_skill; you can add your own here.</p>' +
          '<div class="setcard"><div class="setlist">' +
          (d.skills.length ? d.skills.map(function (sk) {
            return '<div class="row"><span class="grow"><b>' + esc(sk.name) + '</b> — ' + esc(sk.description) + ' <span class="meta">(' + esc(sk.createdBy) + ')</span></span><button class="x" data-x="' + esc(sk.name) + '">✕</button></div>';
          }).join('') : '<div class="meta">no skills yet</div>') +
          '<div style="height:8px"></div><input id="skName" placeholder="skill name (e.g. deploy-checklist)"><input id="skDesc" placeholder="short description"><textarea id="skInstr" rows="3" placeholder="step-by-step instructions"></textarea>' +
          '<div class="row"><button class="btn dark" id="skAdd">Add skill</button></div></div></div>';
        b.querySelectorAll('[data-x]').forEach(function (el) {
          el.onclick = function () { api('/api/skills/' + el.getAttribute('data-x'), { method: 'DELETE' }).then(function () { renderSettings(); }); };
        });
        $('skAdd').onclick = function () {
          api('/api/skills', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: $('skName').value, description: $('skDesc').value, instructions: $('skInstr').value }) })
            .then(function () { renderSettings(); }).catch(function (e) { alert(e.message); });
        };
      });
    } else if (S.setSection === 'mcp') {
      api('/api/mcp').then(function (d) {
        b.innerHTML = '<h1>MCP servers</h1><p style="color:var(--muted);font-size:12.5px">External tool servers (filesystem, browser, databases…). Their tools require approval before running.</p>' +
          '<div class="setcard"><div class="setlist">' +
          (d.servers.length ? d.servers.map(function (sv) {
            return '<div class="row"><span class="grow"><b>' + esc(sv.name) + '</b> <span class="meta">' + esc(sv.command) + ' ' + esc((sv.args || []).join(' ')) + '</span></span><button class="x" data-x="' + esc(sv.name) + '">✕</button></div>';
          }).join('') : '<div class="meta">no servers yet</div>') +
          (d.tools.length ? '<div class="meta" style="margin-top:6px">tools: ' + esc(d.tools.map(function (t) { return 'mcp:' + t.server + ':' + t.name; }).join(', ')) + '</div>' : '') +
          '<div style="height:8px"></div><div class="row"><input id="mcName" placeholder="name (e.g. fs)" style="margin:0"><input id="mcCmd" placeholder="command (e.g. npx)" style="margin:0"></div><input id="mcArgs" placeholder="args separated by spaces">' +
          '<div class="row"><button class="btn dark" id="mcAdd">Add MCP server</button></div></div></div>';
        b.querySelectorAll('[data-x]').forEach(function (el) {
          el.onclick = function () { api('/api/mcp/' + el.getAttribute('data-x'), { method: 'DELETE' }).then(function () { renderSettings(); }); };
        });
        $('mcAdd').onclick = function () {
          api('/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: $('mcName').value, command: $('mcCmd').value, args: $('mcArgs').value.split(/\s+/).filter(Boolean) }) })
            .then(function () { renderSettings(); }).catch(function (e) { alert(e.message); });
        };
      });
    } else if (S.setSection === 'cron') {
      api('/api/cron').then(function (d) {
        b.innerHTML = '<h1>Scheduled / heartbeat</h1><p style="color:var(--muted);font-size:12.5px">Cron jobs start agent runs on a schedule. A heartbeat periodically checks project health.</p>' +
          '<div class="setcard"><div class="setlist">' +
          (d.jobs.length ? d.jobs.map(function (jb) {
            return '<div class="row"><span class="grow">every <b>' + esc(jb.every) + '</b> — ' + esc(jb.goal) + (jb.lastRunAt ? ' <span class="meta">(last ' + new Date(jb.lastRunAt).toLocaleTimeString() + ')</span>' : '') + '</span><button class="x" data-x="' + esc(jb.id) + '">✕</button></div>';
          }).join('') : '<div class="meta">no jobs yet</div>') +
          '<div style="height:8px"></div><div class="row"><input id="crEvery" placeholder="every 30m" style="margin:0"><input id="crGoal" placeholder="goal for the agent" style="margin:0"></div>' +
          '<div class="row"><button class="btn dark" id="crAdd">Add cron job</button><button class="btn ghost" id="crHeart">+ heartbeat (30m)</button></div></div></div>';
        b.querySelectorAll('[data-x]').forEach(function (el) {
          el.onclick = function () { api('/api/cron/' + el.getAttribute('data-x'), { method: 'DELETE' }).then(function () { renderSettings(); }); };
        });
        $('crAdd').onclick = function () {
          api('/api/cron', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ every: $('crEvery').value, goal: $('crGoal').value }) })
            .then(function () { renderSettings(); }).catch(function (e) { alert(e.message); });
        };
        $('crHeart').onclick = function () {
          api('/api/cron', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ every: '30m', goal: 'Heartbeat: inspect the project, run tests/typecheck, fix or report anything broken.' }) })
            .then(function () { renderSettings(); }).catch(function (e) { alert(e.message); });
        };
      });
    }
  }

  function boot() {
    api('/api/project').then(function (p) { S.project = p; updateProjChip(); }).catch(function () { updateProjChip(); });
    api('/api/models').then(function (data) { S.models = data.providers; if (S.active === 'home') openHome(); }).catch(function () {});
    api('/api/files').then(function (data) { S.files = data.files || []; }).catch(function () {});
    $('gearBtn').onclick = function () { openSettings('general'); };
    updateProjChip();
    renderSidebar();
    renderTopbar();
    openHome();
  }
  boot();
})();
</script>
</body>
</html>
`;
