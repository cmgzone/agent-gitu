export const UI_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Gitu</title>
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
  .sb { width: var(--sbw, 264px); flex: none; border-right: 1px solid var(--border); background: var(--bg); display: flex; flex-direction: column; overflow: hidden; }
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
  .sb .proj .delx { display: none; border: 0; background: none; color: var(--muted); width: 20px; height: 20px; border-radius: 6px; align-items: center; justify-content: center; flex: none; padding: 0; }
  .sb .proj:hover .delx { display: inline-flex; }
  .sb .proj .delx:hover { color: var(--red); background: #fef2f2; }
  .sb .proj .delx svg { width: 11px; height: 11px; }
  .sb .chat { display: flex; align-items: center; gap: 8px; padding: 5px 10px 5px 26px; font-size: 12.5px; color: var(--muted); border-radius: 8px; cursor: pointer; border: 0; background: none; width: 100%; text-align: left; }
  .sb .chat:hover { background: #ebebe7; color: var(--text); }
  .sb .chat.active { background: #e5e3fb; color: var(--text); }
  .sb .chat .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--faint); flex: none; }
  .sb .chat .dot.running { background: var(--blue); animation: pulse 1.2s infinite; }
  .sb .chat .dot.completed { background: var(--green); }
  .sb .chat .dot.blocked, .sb .chat .dot.failed { background: var(--red); }
  .sb .foot { border-top: 1px solid var(--border); padding: 10px 12px; display: flex; gap: 8px; align-items: center; }
  .bulkbar { display: flex; gap: 6px; align-items: center; padding: 8px 10px; border-top: 1px solid var(--border); background: var(--bg); }
  .bulkbar #bulkCount { flex: 1; font-size: 12px; color: var(--muted); }
  .sb .chk { margin: 0; width: auto; accent-color: var(--accent); }
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
  .model-meta { color: var(--muted); font: 11px var(--mono); white-space: nowrap; }
  .pill .caret { color: var(--faint); font-size: 10px; }
  .model-pick { position: relative; cursor: pointer; }
  .model-pick.open, .model-pick.open:hover { background: #f0f0ec; color: var(--text); }
  .model-pick .mp-label { max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .model-menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 60; width: 370px; max-width: calc(100vw - 48px); background: var(--card); border: 1px solid var(--border2); border-radius: 10px; box-shadow: 0 12px 32px rgba(0,0,0,.15); padding: 6px; }
  .model-menu input { width: 100%; border: 1px solid var(--border); border-radius: 8px; padding: 6px 9px; font-size: 12.5px; outline: none; background: #fafaf8; color: var(--text); }
  .model-menu input:focus { border-color: var(--accent); }
  .model-list { max-height: 300px; overflow-y: auto; margin-top: 6px; }
  .model-sec { position: sticky; top: 0; z-index: 1; background: var(--card); padding: 6px 10px 3px; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .model-sec:first-child { padding-top: 2px; }
  .model-item { display: block; padding: 6px 10px 7px; border-radius: 7px; cursor: pointer; font-size: 12.5px; line-height: 1.35; }
  .model-item:hover, .model-item.hl { background: #f0f0ec; }
  .model-item.cur { box-shadow: inset 2px 0 0 var(--accent); }
  .model-item .mi-top { display: flex; align-items: center; gap: 8px; }
  .model-item .mi-prov { color: var(--muted); font-size: 10.5px; flex: none; }
  .model-item .mi-meta { margin-left: auto; color: var(--faint); font-size: 10px; font-family: var(--mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 58%; flex: none; }
  .model-item .mi-name { font-weight: 600; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .model-item .mi-name .vmark { color: var(--blue); font-style: normal; }
  .model-empty { color: var(--faint); font-size: 12px; padding: 10px 9px; text-align: center; }
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
  .meta-line.subagent-line { margin: 6px 0; padding: 7px 9px; border: 1px solid #bfdbfe; border-radius: 8px; background: #eff6ff; color: #315d9f; }
  .meta-line.subagent-line b { color: var(--blue); }
  .tool { border: 1px solid var(--border); background: var(--card); border-radius: 10px; margin: 8px 0; overflow: hidden; animation: toolIn .28s cubic-bezier(.21,1.02,.55,1.01) both; transition: box-shadow .3s, border-color .3s; }
  @keyframes toolIn { from { opacity: 0; transform: translateY(6px) scale(.985); } to { opacity: 1; transform: none; } }
  .tool .head { display: flex; align-items: center; gap: 9px; padding: 8px 12px; cursor: pointer; }
  .tool .head:hover { background: #fbfbf9; }
  .tool .tico { width: 24px; height: 24px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; flex: none; background: #f0f0ec; color: var(--muted); transition: background .3s, color .3s; }
  .tool .tico svg { width: 13px; height: 13px; }
  .tool .kind { font-family: var(--mono); font-size: 10px; letter-spacing: .5px; color: var(--muted); background: #f0f0ec; border-radius: 5px; padding: 2px 7px; flex: none; }
  .tool .sum { font-family: var(--mono); font-size: 12px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tool .reason { color: var(--muted); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tool .st { margin-left: auto; flex: none; display: inline-flex; align-items: center; gap: 6px; }
  .tool .spin { width: 12px; height: 12px; border: 2px solid #e4e4de; border-top-color: var(--dark); border-radius: 50%; animation: spin .7s linear infinite; flex: none; }
  .tool details { border-top: 1px solid var(--border); }
  .tool details[open] pre { animation: outFade .25s ease; }
  @keyframes outFade { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: none; } }
  .tool summary { padding: 5px 12px; font-size: 11px; color: var(--muted); cursor: pointer; user-select: none; }
  .tool pre { margin: 0; padding: 8px 12px 10px; font-family: var(--mono); font-size: 11.5px; color: #55554f; white-space: pre-wrap; word-break: break-word; max-height: 260px; overflow-y: auto; }
  .tool .lines { margin-left: 8px; font-family: var(--mono); font-size: 10.5px; color: var(--green); background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 5px; padding: 1px 7px; flex: none; }
  .tool.running { position: relative; border-color: #d9d9d3; }
  .tool.running::before { content: ''; position: absolute; top: 0; left: -40%; height: 2px; width: 40%; background: linear-gradient(90deg, transparent, var(--dark), transparent); animation: toolSweep 1.15s ease-in-out infinite; }
  @keyframes toolSweep { 0% { left: -40%; } 100% { left: 100%; } }
  .tool.running .tico { animation: ticoPulse 1.2s ease-in-out infinite; }
  @keyframes ticoPulse { 50% { transform: scale(1.1); opacity: .7; } }
  .tool.done-ok { border-color: #bbf7d0; box-shadow: 0 0 0 3px rgba(34,197,94,.08); }
  .tool.done-ok .tico { background: #f0fdf4; color: var(--green); }
  .tool.done-bad { border-color: #fecaca; box-shadow: 0 0 0 3px rgba(239,68,68,.08); animation: toolShake .32s; }
  .tool.done-bad .tico { background: #fef2f2; color: var(--red); }
  @keyframes toolShake { 20% { transform: translateX(-3px); } 50% { transform: translateX(3px); } 80% { transform: translateX(-2px); } }
  .tool .okmark { display: inline-flex; color: var(--green); }
  .tool .okmark svg polyline { stroke-dasharray: 26; stroke-dashoffset: 26; animation: drawCheck .45s ease .04s forwards; }
  @keyframes drawCheck { to { stroke-dashoffset: 0; } }
  .tool.k-edit .tico { background: #eef2ff; color: #4c5fd6; }
  .tool.k-read .tico { background: #eff6ff; color: var(--blue); }
  .tool.k-list .tico { background: #f0fdf4; color: var(--green); }
  .tool.k-search .tico { background: #fffbeb; color: var(--amber); }
  .tool.k-shell .tico { background: #16181d; color: #7ee2a8; }
  .tool.browser-tool { border-color: #c4b5fd; background: #faf9ff; box-shadow: inset 3px 0 0 var(--accent); }
  .tool.browser-tool .kind { color: #5b45c5; background: #ede9fe; }

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
  .summary-card .summary-head { display: flex; gap: 9px; align-items: center; justify-content: space-between; }
  .summary-card h2 { margin: 0; font-size: 15px; min-width: 0; }
  .summary-card .summary-stats { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .summary-card .summary-stat { color: var(--muted); font: 11px var(--mono); border: 1px solid var(--border); border-radius: 999px; padding: 3px 8px; background: #fafaf8; }
  .summary-card .sec { margin-top: 12px; }
  .summary-card .sec h4 { margin: 0 0 5px; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); }
  .summary-card .summary-copy { margin: 0; font-size: 12.5px; line-height: 1.55; white-space: pre-line; }
  .summary-card ul { margin: 0; padding-left: 18px; font-size: 12.5px; }
  .summary-card li { margin: 2px 0; }
  .file-chip { display: inline-block; font-family: var(--mono); font-size: 11px; border: 1px solid var(--border); border-radius: 6px; padding: 2px 7px; margin: 2px 4px 2px 0; background: #fafaf8; }
  .summary-card .verify-list { display: grid; gap: 6px; }
  .summary-card .verify-row { border: 1px solid var(--border); border-radius: 8px; padding: 7px 9px; font-size: 12px; display: flex; gap: 7px; align-items: flex-start; flex-wrap: wrap; }
  .summary-card .verify-kind { color: var(--muted); font: 10.5px var(--mono); padding-top: 3px; }
  .summary-card .verify-label { flex: 1; min-width: 150px; line-height: 1.4; }
  .summary-card .verify-row details { width: 100%; color: var(--muted); font-size: 11px; }
  .summary-card .verify-row summary { cursor: pointer; width: fit-content; }
  .summary-card .verify-row pre { margin: 6px 0 0; padding: 7px; max-height: 150px; overflow: auto; white-space: pre-wrap; word-break: break-word; border-radius: 6px; background: #fafaf8; font: 10.5px var(--mono); color: var(--muted); }

  @keyframes shimmer { 0% { background-position: -300px 0; } 100% { background-position: 300px 0; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  .working { display: flex; align-items: center; gap: 10px; padding: 12px 2px; }
  .working .spinner { width: 12px; height: 12px; border: 2px solid var(--border2); border-top-color: var(--dark); border-radius: 50%; animation: spin .8s linear infinite; flex: none; }
  .working .shimmer { height: 9px; width: 120px; border-radius: 5px; background: linear-gradient(90deg, #e8e8e3 25%, #f6f6f2 50%, #e8e8e3 75%); background-size: 600px 100%; animation: shimmer 1.3s linear infinite; flex: none; }
  .working .wtext { color: var(--muted); font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .run-side { width: var(--rsw, 380px); flex: none; display: flex; flex-direction: column; min-height: 0; }
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
  .toasts { position: fixed; top: 16px; right: 16px; z-index: 100; display: flex; flex-direction: column; gap: 8px; }
  .toast { background: #2a2a26; color: #fff; border-radius: 10px; padding: 10px 14px; font-size: 12.5px; max-width: 380px; box-shadow: 0 6px 24px rgba(0,0,0,.25); animation: tin .18s ease; white-space: pre-wrap; }
  .toast.err { background: #7f1d1d; }
  @keyframes tin { from { transform: translateY(-6px); opacity: 0; } }
  .modal { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 60; display: flex; align-items: center; justify-content: center; }
  .modal .box { width: 580px; max-width: 94vw; max-height: 72vh; background: var(--card); border-radius: 14px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.3); }
  .modal .bar { display: flex; gap: 8px; align-items: center; padding: 10px 14px; border-bottom: 1px solid var(--border); }
  .modal .bar .crumb { flex: 1; font-family: var(--mono); font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .modal .list { flex: 1; overflow-y: auto; padding: 6px; }
  .modal .frow { display: flex; gap: 9px; align-items: center; padding: 7px 10px; border-radius: 8px; cursor: pointer; font-size: 13px; }
  .modal .frow:hover { background: #f0f0ec; }
  .modal .frow .ico { color: var(--muted); display: inline-flex; }
  .modal .foot { padding: 10px 14px; border-top: 1px solid var(--border); display: flex; gap: 8px; align-items: center; }
  .sb .navitem .ico, .sb .proj .ico, .setnav .item .ico, .sug .ico { display: inline-flex; align-items: center; color: var(--muted); }
  .setlist .x svg { width: 12px; height: 12px; }
  .ubtns { display: flex; gap: 6px; justify-content: flex-end; margin-top: 4px; opacity: 0; transition: opacity .12s; }
  div:hover > .ubtns, div:hover .ubtns { opacity: 1; }
  .ubtn { border: 1px solid var(--border); background: #fff; color: var(--muted); border-radius: 6px; width: 24px; height: 22px; display: inline-flex; align-items: center; justify-content: center; }
  .ubtn:hover { color: var(--text); border-color: var(--border2); }
  .ubtn svg { width: 12px; height: 12px; }

  .shell.left-collapsed .sb { width: 44px; }
  .shell.left-collapsed .sb .scroll, .shell.left-collapsed .sb .foot,
  .shell.left-collapsed .sb .name, .shell.left-collapsed .sb .spacer,
  .shell.left-collapsed .sb #gearBtn { display: none; }
  .shell.left-collapsed .sb .head { padding: 14px 0 8px; justify-content: center; }
  .run-side .collapse-tab { margin-left: auto; border: 0; background: none; color: var(--muted); border-radius: 7px; width: 26px; height: 26px; align-self: center; font-size: 12px; }
  .run-side .collapse-tab:hover { background: #f0f0ec; color: var(--text); }
  .run-side .rail { display: none; flex-direction: column; align-items: center; padding-top: 10px; }
  .run-side .rail button { writing-mode: vertical-rl; border: 0; background: none; color: var(--muted); font-size: 11px; letter-spacing: 1.5px; padding: 12px 5px; border-radius: 7px; }
  .run-side .rail button:hover { background: #f0f0ec; color: var(--text); }
  .run.collapsed-side .run-side { width: 40px; }
  .run.collapsed-side .side-tabs, .run.collapsed-side .side-body { display: none; }
  .run.collapsed-side .run-side .rail { display: flex; }

  .vresize { width: 6px; flex: none; cursor: col-resize; margin: 0 -3px; z-index: 6; }
  .vresize:hover, .vresize.active { background: rgba(124, 108, 240, .35); }
  .shell.left-collapsed #sbResize, .run.collapsed-side #rsResize { display: none; }

  .abubble { max-width: 80%; background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 8px 12px; margin: 10px 0; font-size: 13px; white-space: pre-wrap; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
  .abubble .who { display: block; color: var(--accent); font-size: 10.5px; font-weight: 600; margin-bottom: 2px; }

  .shotmsg { margin: 10px 0; }
  .shotmsg img { display: block; max-width: 340px; width: 100%; border: 1px solid var(--border); border-radius: 10px; background: #fff; box-shadow: 0 2px 10px rgba(0,0,0,.06); margin-top: 4px; }
  .browser-shot img { border-color: #c4b5fd; }
  .browser-chat-highlight { display: flex; align-items: center; gap: 7px; width: fit-content; padding: 3px 8px; border-radius: 999px; color: #5b45c5; background: #ede9fe; font-size: 11px; }
  .browser-chat-highlight span { color: #7665ce; }
  .browser-highlight { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 12px; padding: 9px 10px; border: 1px solid #c4b5fd; border-radius: 9px; background: #faf9ff; color: #4c3bb1; font-size: 12px; }
  .browser-highlight > div { display: flex; align-items: center; gap: 7px; }
  .browser-highlight b { font-size: 11px; letter-spacing: .7px; text-transform: uppercase; }
  .browser-highlight > span { color: #6d5ac5; font: 10.5px var(--mono); }

  .skcard { padding: 12px 16px; border-bottom: 1px solid var(--border); }
  .skcard:last-child { border-bottom: 0; }
  .skhead { display: flex; gap: 8px; align-items: center; font-size: 13px; }
  .skhead .meta { color: var(--faint); font-size: 11px; }
  .skdesc { color: var(--muted); font-size: 12.5px; margin-top: 3px; }
  .skinstr { font-family: var(--mono); font-size: 11.5px; background: #fafaf8; border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; margin-top: 8px; white-space: pre-wrap; max-height: 260px; overflow: auto; }

  .thumbs { display: flex; gap: 6px; padding: 8px 8px 0; flex-wrap: wrap; }
  .thumbs .th { position: relative; }
  .thumbs img { width: 52px; height: 52px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); display: block; }
  .thumbs .rm { position: absolute; top: -7px; right: -7px; width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--border2); background: #fff; color: var(--muted); font-size: 10px; display: flex; align-items: center; justify-content: center; padding: 0; }
  .thumbs .rm:hover { color: var(--red); border-color: #fecaca; }
  .pill[disabled] { opacity: .4; cursor: not-allowed; }

  .grow-row { display: flex; gap: 6px; align-items: center; padding: 3px 0; }
  .gitpath { font-family: var(--mono); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  .gitpath:hover { color: var(--accent); }

  .bpanel2 .nav { display: flex; gap: 6px; align-items: center; margin-bottom: 8px; }
  .bpanel2 .nav input { flex: 1; border: 1px solid var(--border); border-radius: 8px; padding: 6px 9px; font-family: var(--mono); font-size: 12px; background: #fff; min-width: 0; }
  .bpanel2 .bwrap { position: relative; }
  .bpanel2 .bwrap img { width: 100%; display: block; border: 1px solid var(--border); border-radius: 10px; background: #fff; min-height: 160px; object-fit: top left; }
  .bdrive { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); z-index: 6; display: flex; align-items: center; gap: 7px; background: var(--accent); color: #fff; border-radius: 999px; padding: 6px 14px; font-size: 12px; font-weight: 600; box-shadow: 0 4px 16px rgba(124,108,240,.5); animation: pulse 1.4s infinite; white-space: nowrap; }
  .bdrive svg { width: 13px; height: 13px; }
  @media (max-width: 1080px) { .run-side { display: none; } }
</style>
</head>
<body>
<div class="shell">
  <aside class="sb">
    <div class="head">
      <span class="name">AGENT GITU</span>
      <span class="spacer"></span>
      <button class="iconbtn" id="gearBtn" title="settings">&#9881;</button>
      <button class="iconbtn" id="sbCollapse" title="collapse sidebar">&#171;</button>
    </div>
    <div class="scroll" id="sbScroll"></div>
    <div class="bulkbar" id="bulkBar" hidden>
      <span id="bulkCount">0 selected</span>
      <button class="btn red" id="bulkDel">Delete</button>
      <button class="btn ghost" id="bulkDone">Done</button>
    </div>
    <div class="foot">
      <span class="chip" id="projChip">…</span>
    </div>
  </aside>
  <div class="vresize" id="sbResize"></div>
  <div class="main">
    <div class="topbar" id="topbar"></div>
    <div class="view" id="view"></div>
  </div>
</div>
<div class="settings" id="settings" hidden>
  <aside class="setnav" id="setnav"></aside>
  <div class="setbody" id="setbody"></div>
</div>
<div class="toasts" id="toasts"></div>
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
    draft: '',
    sel: { wf: 'review', model: '', effort: 'high' },
    settings: { review: true, autoApprove: false, autoLearn: true, projectPath: '' },
    setSection: 'general',
    pendingImages: []
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
  function mascotPulse() {
    if (window.__mascot) window.__mascot.setMode('shoot');
    if (S.mascotTimer) clearTimeout(S.mascotTimer);
    S.mascotTimer = setTimeout(function () { if (window.__mascot) window.__mascot.setMode('idle'); }, 2500);
  }

  function toast(msg, isErr) {
    var wrap = $('toasts');
    if (!wrap) return;
    var t = document.createElement('div');
    t.className = 'toast' + (isErr ? ' err' : '');
    t.textContent = String(msg);
    wrap.appendChild(t);
    setTimeout(function () { t.remove(); }, 4500);
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
      var projPath = {};
      sessions.forEach(function (s) {
        var p = s.project || basename(S.settings.projectPath || '') || 'project';
        (byProj[p] = byProj[p] || []).push(s);
        if (s.projectPath && !projPath[p]) projPath[p] = s.projectPath;
      });
      var html = '<button class="newbtn" id="sbNew">' + icon('pencil') + ' New session</button>' +
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
          html += '<div class="proj" data-proj="' + esc(p) + '" title="set as active project for new sessions">' +
            '<button class="ubtn" data-collapse="' + esc(p) + '" title="' + (isCol ? 'expand sessions' : 'collapse sessions') + '" style="display:inline-flex;padding:2px;margin-right:2px">' + icon(isCol ? 'chevRight' : 'chevDown') + '</button>' +
            '<span class="ico">' + icon('folder') + '</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p) + '</span>' +
            (isCol ? '<span class="chip" style="margin-right:6px">' + byProj[p].length + '</span>' : '') +
            '<button class="delx" data-delproj="' + esc(p) + '" title="delete project and its sessions">' + icon('x') + '</button></div>';
        }
        if (!isCol) byProj[p].slice(0, S.manage ? 200 : 8).forEach(function (s) {
          if (S.manage) {
            html += '<label class="chat"><input type="checkbox" class="chk" data-selrun="' + esc(s.runId) + '"' + (S.selRuns && S.selRuns[s.runId] ? ' checked' : '') + '><span class="dot ' + esc(s.status) + '"></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(s.goal.slice(0, 34)) + '</span></label>';
          } else {
            html += '<button class="chat ' + (S.active === s.runId ? 'active' : '') + '" data-run="' + esc(s.runId) + '">' +
              '<span class="dot ' + esc(s.status) + '"></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(s.goal.slice(0, 34)) + '</span></button>';
          }
        });
      });
      $('sbScroll').innerHTML = html;
      $('sbNew').onclick = function () { openHome(); };
      $('sbNewProject').onclick = newProject;
      var byId = {};
      sessions.forEach(function (s) { byId[s.runId] = s; });
      $('sbScroll').querySelectorAll('[data-run]').forEach(function (el) {
        el.onclick = function () {
          var s = byId[el.getAttribute('data-run')];
          if (s && s.projectPath) S.lastProjectPath = s.projectPath;
          openRun(el.getAttribute('data-run'), { chatish: s && s.mode === 'chat', mode: s && s.mode });
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
          }
        };
      });
      $('sbScroll').querySelectorAll('[data-set]').forEach(function (el) {
        el.onclick = function () { openSettings(el.getAttribute('data-set')); };
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
    var name = S.settings.projectPath ? basename(S.settings.projectPath) : (S.project ? S.project.name : 'no project');
    $('projChip').textContent = ' ' + name;
  }

  function newProject() {
    var modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = '<div class="box" style="width:460px"><div class="bar"><span style="font-weight:600;font-size:13px">New project</span></div>' +
      '<div style="padding:14px 16px">' +
      '<input id="npName" placeholder="project name (e.g. my-app)" style="width:100%;border:1px solid var(--border);border-radius:8px;background:#fff;padding:8px 10px" autofocus>' +
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
    if (stop) stop.onclick = function () { api('/api/runs/' + S.active + '/stop', { method: 'POST' }).catch(function (e) { toast(e.message, true); }); };
  }

  function stopStreams() { if (S.es) { S.es.close(); S.es = null; } if (S.poll) { clearInterval(S.poll); S.poll = null; } }

  function openHome() {
    S.active = 'home';
    S.supersedeNext = null;
    stopStreams();
    stopBrowserPoll();
    renderSidebar();
    renderTopbar();
    var effProj = S.settings.projectPath || S.lastProjectPath;
    var name = effProj ? basename(effProj) : (S.project ? S.project.name : 'this project');
    $('view').innerHTML =
      '<div class="home">' +
      '<h1>What should we work on in <span class="u">' + esc(name) + '</span>?</h1>' +
      '<div class="sugs">' +
      '<button class="sug" data-sug="Explore and understand the codebase"><span class="ico" style="color:#2563eb">' + icon('search') + '</span>Explore and understand code</button>' +
      '<button class="sug" data-sug="Build a new feature, app, or tool"><span class="ico" style="color:#7c6cf0">' + icon('bolt') + '</span>Build a new feature, app, or tool</button>' +
      '<button class="sug" data-sug="Review the code and suggest changes"><span class="ico" style="color:#16a34a">' + icon('layers') + '</span>Review code and suggest changes</button>' +
      '<button class="sug" data-sug="Fix issues and failures"><span class="ico" style="color:#dc2626">' + icon('wrench') + '</span>Fix issues and failures</button>' +
      '</div>' +
      '<div class="composer"><textarea id="goal" rows="1" placeholder="Ask Agent Gitu to complete a task…"></textarea>' +
      '<div class="thumbs" id="thumbs" hidden></div>' +
      '<div class="composer-bar"><span class="pill" id="homeProj" title="active project for this session — click to change" style="max-width:180px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + icon('folder') + ' ' + esc(name) + '</span></span>' + controlsHtml() + '<button class="send" id="send" title="start">&#8593;</button></div></div>' +
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
  }

  function isFreeModelId(id) {
    id = String(id || '');
    return /-free$/i.test(id) || id === 'big-pickle';
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
    el.textContent = modelMetaText(m);
    el.title = m && m.metadata ? 'Live provider pricing and token limits via Models.dev' : 'Provider did not publish live pricing/limits for this model';
  }

  function modelOptionsHtml() {
    var out = '';
    S.models.forEach(function (p) {
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
        return p.id + ' / ' + titleCase(mid) + (p.models[j].free ? ' (free)' : '');
      }
      return p.id + ' / ' + titleCase(mid);
    }
    return String(value || '');
  }
  function syncModelLabel() {
    var lab = $('modelLabel');
    var model = $('model');
    var text = model ? modelLabelText(model.value) : '';
    if (lab) lab.textContent = text;
    var pick = $('modelPick');
    if (pick) pick.title = 'model: ' + (model ? model.value : '');
  }
  function modelMenuGroups(query) {
    var q = String(query || '').toLowerCase().trim();
    var out = [];
    S.models.forEach(function (p) {
      var matched = [];
      p.models.forEach(function (m) {
        var hay = (p.id + ' ' + m.id + ' ' + titleCase(m.id) + ' ' + modelMetaText(m)).toLowerCase();
        if (q && hay.indexOf(q) < 0) return;
        matched.push(m);
      });
      if (matched.length) out.push({ p: p, models: matched });
    });
    return out;
  }
  function renderModelMenu(query) {
    var list = $('modelList');
    if (!list) return;
    var groups = modelMenuGroups(query);
    var cur = $('model') ? $('model').value : '';
    if (!groups.length) {
      list.innerHTML = '<div class="model-empty">No models match “' + esc(query || '') + '”</div>';
      return;
    }
    var html = '';
    groups.forEach(function (g) {
      html += '<div class="model-sec" title="' + esc(g.p.label || g.p.id) + '">' + esc(g.p.label || g.p.id) + '</div>';
      g.models.forEach(function (m) {
        var val = g.p.id + '::' + m.id;
        html += '<div class="model-item' + (val === cur ? ' cur' : '') + '" data-val="' + esc(val) + '">' +
          '<div class="mi-top"><span class="mi-prov">' + esc(g.p.id) + '</span>' +
          '<span class="mi-meta">' + esc(modelMetaText(m)) + '</span></div>' +
          '<div class="mi-name">' + esc(titleCase(m.id)) + (m.vision ? ' <i class="vmark" title="supports images">&#9672;</i>' : '') + '</div>' +
          '</div>';
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
  }
  function bindModelMenu() {
    var pick = $('modelPick'), filter = $('modelFilter'), menu = $('modelMenu');
    if (!pick || !menu) return;
    pick.onclick = function (e) {
      if (e.target.closest('.model-menu')) return;
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
        if (p && !e.target.closest('#modelPick')) closeModelMenu();
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
  function fillEffort(id, pid) {
    var el = $(id);
    if (!el) return;
    var collapses = effortMaxHint(pid) === 'collapses-to-high';
    el.innerHTML = effortLevelsFor(pid).map(function (l) {
      var label = l === 'max' && collapses ? 'max (= high)' : l;
      return '<option value="' + l + '">' + label + '</option>';
    }).join('');
  }
  function controlsHtml() {
    return '<span class="pill"><select id="wf"><option value="review">Plan mode</option><option value="auto">Build mode</option><option value="chat">Chat mode</option></select><span class="caret">&#9662;</span></span>' +
      '<span class="pill model-pick" id="modelPick" title="choose model"><select id="model" hidden>' + modelOptionsHtml() + '</select><span class="mp-label" id="modelLabel"></span><span class="caret">&#9662;</span>' +
      '<div class="model-menu" id="modelMenu" hidden><input id="modelFilter" placeholder="Search models — provider, name, pricing…" autocomplete="off" spellcheck="false"><div class="model-list" id="modelList"></div></div></span><span class="model-meta" id="modelMeta"></span>' +
      '<span class="pill" title="intelligence level"><select id="effort"></select><span class="caret">&#9662;</span></span>' +
      '<span class="pill" id="attachBtn" title="attach images (vision models only)" style="cursor:pointer">' + icon('image') + '</span>' +
      '<input type="file" id="attachInput" accept="image/*" multiple hidden>';
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
    if (!S.pendingImages.length) { wrap.hidden = true; wrap.innerHTML = ''; return; }
    wrap.hidden = false;
    wrap.innerHTML = S.pendingImages.map(function (im, i) {
      return '<span class="th"><img src="' + im.dataUrl + '" alt="' + esc(im.name) + '" title="' + esc(im.name) + '"><button class="rm" data-rm="' + i + '" title="remove">&#10005;</button></span>';
    }).join('');
    wrap.querySelectorAll('[data-rm]').forEach(function (el) {
      el.onclick = function () { S.pendingImages.splice(Number(el.getAttribute('data-rm')), 1); renderThumbs(); };
    });
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
            if (S.pendingImages.length >= 4) { toast('Maximum 4 images per message', true); return; }
            downscaleImage(String(reader.result), function (final) {
              S.pendingImages.push({ name: 'pasted-image', dataUrl: final });
              renderThumbs();
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
      if (!f.type || f.type.indexOf('image/') !== 0) { toast('Only image files can be attached', true); return; }
      if (S.pendingImages.length >= 4) { toast('Maximum 4 images per message', true); return; }
      var reader = new FileReader();
      reader.onload = function () {
        downscaleImage(String(reader.result), function (final) {
          S.pendingImages.push({ name: f.name, dataUrl: final });
          renderThumbs();
        });
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
    if (vision) { attach.removeAttribute('disabled'); attach.title = 'attach images'; }
    else { attach.setAttribute('disabled', '1'); attach.title = 'current model does not support images'; }
  }

  function startRun() {
    var goal = $('goal') ? $('goal').value.trim() : '';
    if (!goal) { if ($('goal')) $('goal').focus(); return; }
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
        projectPath: S.settings.projectPath || S.lastProjectPath || undefined,
        scope: S.settings.scope || [],
        constraints: (S.settings.constraints || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean),
        images: S.pendingImages.length ? S.pendingImages : undefined
      })
    }).then(function (r) {
      S.draft = ''; persist();
      S.pendingImages = [];
      openRun(r.runId, { chatish: chatish, goal: goal });
      renderSidebar();
    }).catch(function (e) { toast('Failed to start: ' + e.message, true); });
  }

  function openRun(runId, opts) {
    S.active = runId;
    S.supersedeNext = null;
    stopStreams();
    var sess = S.sessions[runId] || (S.sessions[runId] = { events: [], ledger: null, session: null, side: 'state', nodes: {} });
    sess.nodes = {};
    if (opts && opts.chatish !== undefined) sess.chatish = opts.chatish;
    // Reflect the session's real mode in the workflow dropdown so changing it
    // and sending is an explicit switch (chat -> plan/build, or the reverse).
    if (opts && opts.mode) S.sel.wf = opts.mode === 'chat' ? 'chat' : opts.mode === 'fast' ? 'auto' : 'review';
    renderSidebar();
    renderTopbar();
    $('view').innerHTML =
      '<div class="run"><div class="run-main">' +
      '<div class="progress" id="progress" style="display:none"><span id="progText"></span><div class="pbar"><span id="progFill"></span></div></div>' +
      '<div class="stream" id="stream"></div>' +
      '<div class="bottom-composer"><div class="composer"><textarea id="follow" rows="1" placeholder="Message Agent Gitu… Enter sends to this session while working, or continues it when done"></textarea>' +
      '<div class="thumbs" id="thumbs" hidden></div>' +
      '<div class="composer-bar">' + controlsHtml() + '<button class="send" id="send2">&#8593;</button></div></div></div>' +
      '</div>' +
      '<div class="vresize" id="rsResize"></div>' +
      '<aside class="run-side"><div class="side-tabs" id="sideTabs"></div><div class="side-body" id="sideBody"></div>' +
      '<div class="rail"><button id="rsExpand" title="expand panel">PANEL &#171;</button></div></aside></div>';
    renderSideTabs(sess, runId);
    $('rsExpand').onclick = function () { S.settings.rightCollapsed = false; persist(); applyLayout(); };
    bindResize('rsResize', 'right');
    applyLayout();
    $('follow').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      var g = $('follow').value.trim();
      if (!g) return;
      sendFollow(g);
    });
    $('send2').onclick = function () { $('follow').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); };
    bindControls();
    bindPaste('follow');
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

  function userBubble(text, runId) {
    var div = document.createElement('div');
    div.style.cssText = 'display:flex;justify-content:flex-end;margin:10px 0;';
    div.setAttribute('data-ubtext', text);
    div.innerHTML = '<div style="max-width:75%;background:#eef2ff;border:1px solid #dbe3ff;border-radius:12px;padding:8px 12px;font-size:13px;white-space:pre-wrap">' +
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

  function removeUserBubble(runId, text) {
    var stream = $('stream');
    if (!stream) return;
    var target = null;
    stream.querySelectorAll('div[data-ubtext]').forEach(function (b) {
      if (b.getAttribute('data-ubtext') === text) target = b;
    });
    if (target) target.remove();
  }

  function appendLive(stream, el) {
    var w = $('working');
    if (w) stream.insertBefore(el, w); else stream.appendChild(el);
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
    var imgs = S.pendingImages.length ? S.pendingImages : undefined;
    var mc = (S.sel.model || '').split('::');
    var useSelectedModel = Boolean(sess && (sess.modelOverride || !sess.session || !sess.session.provider || !sess.session.model));
    // Show the outgoing message immediately. The server will replace this
    // pending display with its durable user-msg event once it is recorded.
    appendPendingUserMessage(runId, text);
    var follow = $('follow');
    if (follow) follow.value = '';
    api('/api/runs/' + runId + '/message', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      text: text, images: imgs,
      provider: useSelectedModel ? mc[0] : undefined, model: useSelectedModel ? mc[1] : undefined, useSelectedModel: useSelectedModel,
      // The workflow dropdown drives continuations too: an explicit selection
      // switches an existing session's mode (chat <-> plan/build).
      mode: S.sel.wf === 'chat' ? 'chat' : 'standard',
      review: S.sel.wf === 'review' ? S.settings.review : false,
      supersede: sup,
      autoApprove: S.settings.autoApprove
    }) })
      .then(function () {
        S.pendingImages = [];
        renderThumbs();
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
              goal: text, provider: mc[0], model: mc[1],
              mode: S.sel.wf === 'chat' ? 'chat' : 'standard',
              review: S.sel.wf === 'review' ? S.settings.review : false,
              autoApprove: S.settings.autoApprove,
              autoLearn: S.settings.autoLearn,
              effort: S.sel.effort,
              projectPath: S.settings.projectPath || S.lastProjectPath || undefined,
              images: imgs
            })
          }).then(function (r) { openRun(r.runId, { chatish: r.mode === 'chat' }); }).catch(function (e2) { toast(e2.message, true); });
        } else toast(msg, true);
      });
  }

  function appendPendingUserMessage(runId, text) {
    var stream = $('stream');
    var sess = S.sessions[runId];
    if (!stream || !sess) return;
    if (!sess.pendingUserMessages) sess.pendingUserMessages = [];
    sess.pendingUserMessages.push(text);
    sess.nodes.abubble = null;
    sess.nodes.thought = null;
    appendLive(stream, userBubble(text, runId));
    stream.scrollTop = stream.scrollHeight;
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
    if (text.indexOf('run ') === 0 || text.indexOf('think') === 0 || text.indexOf('delegate') === 0 || text.indexOf('subagent') === 0) mascotPulse();
    if (sess && sess.chatish && (
      text.indexOf('project ') === 0 || text.indexOf('ledger ') === 0 || text.indexOf('branch ') === 0 ||
      text.indexOf('context ') === 0 || text.indexOf('done ') === 0 || text.indexOf('run finished:') === 0 ||
      text.indexOf('criteria') === 0 || text.indexOf('plan ') === 0 || text.indexOf('think') === 0 ||
      text.indexOf('continue ') === 0)) {
      return;
    }
    var working = $('working');
    function insert(el) { if (working) stream.insertBefore(el, working); else stream.appendChild(el); }

    if (text.indexOf('tdelta ') === 0) {
      if (sess && sess.chatish) {
        if (!sess.nodes.abubble) {
          var ab = document.createElement('div');
          ab.className = 'abubble';
          ab.innerHTML = '<span class="who">Agent Gitu</span><span class="txt"></span>';
          insert(ab);
          sess.nodes.abubble = ab;
        }
        sess.nodes.abubble.querySelector('.txt').appendChild(document.createTextNode(text.slice(7)));
        stream.scrollTop = stream.scrollHeight;
        return;
      }
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
      if (sess && sess.chatish) {
        if (sess.nodes.abubble) {
          sess.nodes.abubble = null;
        } else {
          var ab2 = document.createElement('div');
          ab2.className = 'abubble';
          ab2.innerHTML = '<span class="who">Agent Gitu</span><span class="txt"></span>';
          ab2.querySelector('.txt').textContent = prose;
          appendLive(stream, ab2);
          stream.scrollTop = stream.scrollHeight;
        }
        return;
      }
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
    if (text.indexOf('user-msg ') === 0) {
      var userText = text.slice(9);
      var pending = sess && sess.pendingUserMessages;
      var pendingAt = pending ? pending.indexOf(userText) : -1;
      if (pendingAt >= 0) { pending.splice(pendingAt, 1); return; }
      sess.nodes.abubble = null; sess.nodes.thought = null; appendLive(stream, userBubble(userText, runId)); stream.scrollTop = stream.scrollHeight; return;
    }
    if (text.indexOf('queued ') === 0 || text.indexOf('stopped ') === 0 || text.indexOf('continue ') === 0) {
      var qm = document.createElement('div');
      qm.className = 'meta-line';
      var qtag = text.split(' ')[0];
      var qrest = text.slice(text.indexOf(' ') + 1);
      var dashIdx = qrest.indexOf(' — ');
      if (dashIdx >= 0) qrest = qrest.slice(dashIdx + 3);
      qm.innerHTML = '<b>' + esc(qtag) + '</b> ' + esc(qrest);
      appendLive(stream, qm);
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

    if (text.indexOf('browseshot ') === 0) {
      var shot = document.createElement('div');
      shot.className = 'shotmsg browser-shot';
      shot.innerHTML = '<div class="browser-chat-highlight"><b>Visual check</b><span>Browser screenshot</span></div><img alt="browser screenshot">';
      shot.querySelector('img').src = text.slice(11);
      appendLive(stream, shot);
      stream.scrollTop = stream.scrollHeight;
      return;
    }

    closeThought(runId);
    var tag = text.split(' ')[0];
    var body = text.slice(tag.length).trim();

    if (tag === 'run') {
       var kind = toolKind(body);
       var summary = splitSummary(body);
       var reason = splitReason(body);
       var card = document.createElement('div');
       card.className = 'tool k-' + kind + ' running' + (kind === 'browser' ? ' browser-tool' : '');
      card.innerHTML =
        '<div class="head"><span class="tico">' + icon(toolIconFor(kind)) + '</span>' +
        '<span class="kind">' + esc(kind) + '</span>' +
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
        tool.classList.remove('running');
        var st = tool.querySelector('.st');
        if (tag === 'ok') {
          tool.classList.add('done-ok');
          st.innerHTML = '<span class="okmark">' + icon('check') + '</span><span class="chip ok">ok</span>';
        } else if (tag === 'error') {
          tool.classList.add('done-bad');
          st.innerHTML = '<span class="chip bad">error</span>';
        } else if (tag === 'denied') {
          tool.classList.add('done-bad');
          st.innerHTML = '<span class="chip bad">denied</span>';
        } else {
          tool.classList.add('done-bad');
          st.innerHTML = '<span class="chip warn">blocked</span>';
        }
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
    else if (tag === 'subagent') { meta.className = 'meta-line subagent-line'; meta.innerHTML = '<b>specialist</b> ' + esc(body); }
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
    $('progText').textContent = (total ? 'Step ' + done + '/' + total : 'Planning…') + ' · ' + L.actions.length + ' actions · ' + L.evidence.length + ' evidence';
    var width = Math.min(100, Math.round((done / Math.max(1, total)) * 100));
    $('progFill').style.width = width + '%';
  }

  function pollRun(runId) {
    if (S.active !== runId) return;
    api('/api/runs/' + runId).then(function (session) {
      var sess = S.sessions[runId];
      if (!sess) return;
      sess.session = session;
      // On opening a persisted task, place its model in the composer. That
      // makes continuing it stable; a later picker change is deliberate and
      // is sent as a one-session model override.
      if (!sess.modelSynced && !sess.modelOverride && session.provider && session.model) {
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
      if (session.status !== 'running' && !sess.summaryShown && session.report) {
        sess.summaryShown = true;
        appendSummary(runId, session);
      }
      if (session.taskId) {
        api('/api/tasks/' + session.taskId).then(function (ledger) {
          var s2 = S.sessions[runId];
          if (s2) {
            s2.ledger = ledger;
            renderRunSide(runId);
            if (s2.chatish) { var pp = $('progress'); if (pp) pp.style.display = 'none'; } else updateProgress(ledger);
          }
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
          .catch(function (er) { toast(er.message, true); });
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
        .catch(function (er) { toast(er.message, true); });
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
        .catch(function (er) { toast(er.message, true); });
    };
    $('prChange').onclick = function () {
      api('/api/plan-review/' + pr.id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload(false)) })
        .catch(function (er) { toast(er.message, true); });
    };
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
        return { passed: item.passed !== false, kind: item.kind || 'check', label: readableCheckLabel(item.label || 'Verification recorded'), details: details };
      });
    }
    return (report.verification || []).map(compactVerification);
  }

  function checkRow(check) {
    var details = check.details
      ? '<details><summary>Show command and output</summary><pre>' + esc(check.details) + '</pre></details>'
      : '';
    return '<div class="verify-row"><span class="chip ' + (check.passed ? 'ok' : 'bad') + '">' + (check.passed ? 'PASS' : 'FAIL') + '</span>' +
      '<span class="verify-kind">' + esc(check.kind) + '</span><span class="verify-label">' + esc(check.label) + '</span>' + details + '</div>';
  }

  function verificationSection(checks) {
    if (!checks.length) return '';
    var shown = checks.slice(0, 6);
    var html = '<div class="sec"><h4>Verification</h4><div class="verify-list">' + shown.map(checkRow).join('') + '</div>';
    if (checks.length > shown.length) {
      html += '<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;color:var(--muted)">Show ' + (checks.length - shown.length) + ' more checks</summary><div class="verify-list" style="margin-top:7px">' + checks.slice(shown.length).map(checkRow).join('') + '</div></details>';
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
    var passed = checks.filter(function (check) { return check.passed; }).length;
    return '<div class="summary-card" style="margin:12px 0 0"><div class="summary-head"><h3 style="margin:0;font-size:12px;letter-spacing:1px;text-transform:uppercase;color:var(--muted)">Completion report</h3><span class="chip ' + (report.status === 'complete' ? 'ok' : 'bad') + '">' + esc(report.status) + '</span></div>' +
      '<p class="summary-copy" style="margin-top:9px">' + esc(shortText(readableSummary(report.summary), 360)) + '</p>' +
      browserHighlight(report.browserActivity) +
      '<div class="summary-stats"><span class="summary-stat">' + passed + '/' + checks.length + ' checks passed</span><span class="summary-stat">' + reportFiles(report).length + ' product files</span></div></div>';
  }

  function appendSummary(runId, session) {
    var stream = $('stream');
    if (!stream) return;
    var sess = S.sessions[runId];
    if (sess && sess.chatish) return;
    var r = session.report;
    var lineCounts = {};
    (sess.events || []).forEach(function (ev) {
      var t = String(ev.text);
      if (t.indexOf('lines ') === 0) {
        var parts = t.slice(6).split(' +');
        lineCounts[parts[0]] = (lineCounts[parts[0]] || 0) + (parseInt(parts[1], 10) || 0);
      }
    });
    var files = reportFiles(r);
    var checks = reportChecks(r);
    var passed = checks.filter(function (check) { return check.passed; }).length;
    var div = document.createElement('div');
    div.className = 'summary-card';
    var html = '<div class="summary-head"><h2>' + esc(session.goal) + '</h2>' + chipFor(session.status) + '</div>';
    html += '<div class="summary-stats"><span class="summary-stat">' + passed + '/' + checks.length + ' checks passed</span><span class="summary-stat">' + files.length + ' product files changed</span></div>';
    html += '<div class="sec"><h4>Outcome</h4><p class="summary-copy">' + esc(readableSummary(r.summary)) + '</p></div>';
    html += browserHighlight(r.browserActivity);
    if (files.length) {
      html += '<div class="sec"><h4>Product files changed</h4><ul>' + files.map(function (f) {
        return '<li><span class="file-chip">' + esc(f) + '</span>' + (lineCounts[f] ? ' <span style="color:var(--green);font-family:var(--mono);font-size:11px">+' + lineCounts[f] + ' lines</span>' : '') + '</li>';
      }).join('') + '</ul></div>';
    }
    html += verificationSection(checks);
    if (r.remainingRisks.length) html += '<div class="sec"><h4>Remaining risks</h4><ul>' + r.remainingRisks.map(function (v) { return '<li>' + esc(v) + '</li>'; }).join('') + '</ul></div>';
    if (r.followUps.length) html += '<div class="sec"><h4>Follow-ups</h4><ul>' + r.followUps.map(function (v) { return '<li>' + esc(v) + '</li>'; }).join('') + '</ul></div>';
    div.innerHTML = html;
    var working = $('working');
    if (working) stream.insertBefore(div, working); else stream.appendChild(div);
    stream.scrollTop = stream.scrollHeight;
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
    var html = failure
      ? '<div style="margin:0 0 14px;padding:10px;border:1px solid #f2caca;border-radius:9px;background:#fff5f5;color:#9b2828;font-size:12px;line-height:1.45"><b>Last attempt failed.</b> ' + esc(failure) + '<br>Choose an available model in the composer, then send a message to retry. Your task and history are preserved.</div>'
      : '';
    html += '<div class="section-h" style="margin-top:0">Acceptance criteria</div>';
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
    var visibleFiles = L.filesChanged.filter(reportableFile);
    html += visibleFiles.length ? visibleFiles.map(function (f) { return '<span class="file-chip">' + esc(f) + '</span>'; }).join('') : '<div class="empty">none</div>';
    if (L.blockers.length) {
      html += '<div class="section-h">Blockers</div>';
      L.blockers.forEach(function (b) { html += '<div class="crit"><span class="dot" style="background:var(--red)"></span><div>' + esc(b) + '</div></div>'; });
    }
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
    html += '<button class="collapse-tab" id="rsCollapse" title="collapse panel">&#187;</button>';
    el.innerHTML = html;
    el.querySelectorAll('.side-tab').forEach(function (t) {
      t.onclick = function () { sess.side = t.getAttribute('data-side'); renderSideTabs(sess, runId); renderRunSide(runId); };
    });
    $('tabMgr').onclick = function () { openTabMgr($('tabMgr'), sess, runId); };
    $('rsCollapse').onclick = function () { S.settings.rightCollapsed = true; persist(); applyLayout(); };
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

  function gitQueryPath() { return S.settings.projectPath || S.lastProjectPath || ''; }

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
        '<input id="gitMsg" placeholder="commit message" style="width:100%;border:1px solid var(--border);border-radius:8px;background:#fff;padding:7px 9px;margin-bottom:8px">' +
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
    renderSettings();
  }
  function closeSettings() { $('settings').hidden = true; }

  function refreshModels() {
    api('/api/models')
      .then(function (data) { S.models = data.providers; renderSettings(); })
      .catch(function () { renderSettings(); });
  }

  function renderSettings() {
    var items = [
      ['general', 'gear', 'General'],
      ['providers', 'layers', 'Providers'],
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
    } else if (S.setSection === 'providers') {
      b.innerHTML = '<h1>Providers</h1>' +
        '<p style="color:var(--muted);font-size:12.5px">LLM providers and API-key status. Click a model to make it the default for new runs.</p>' +
        '<div class="setcard" id="provBody"><div class="meta">loading providers…</div></div>';
      Promise.all([api('/api/models'), api('/api/keys').catch(function () { return { stored: [] }; })]).then(function (res) {
        var d = res[0];
        var stored = (res[1] && res[1].stored) || [];
        var body = $('provBody');
        if (!body) return;
        var cur = S.sel.model || '';
        var prov = d.providers || [];
        body.innerHTML = prov.map(function (p, i) {
          var storedVar = (p.keyEnvVars || []).filter(function (v) { return stored.indexOf(v) >= 0; })[0];
          var keyChip = p.hasKey ? '<span class="chip ok">key ready</span>' : '<span class="chip bad">no key</span>';
          var storedChip = storedVar ? '<span class="chip">stored</span>' : '';
          var liveChip = p.live ? '<span class="chip">live</span>' : '';
          var models = p.models || [];
          var shown = models.slice(0, 12);
          return '<div class="setrow" style="align-items:flex-start"><div class="grow">' +
            '<div class="t">' + esc(p.label) + ' <span class="meta">(' + esc(p.id) + ')</span> ' + keyChip + storedChip + ' ' + liveChip + '</div>' +
            '<div class="d">default: ' + esc(p.defaultModel) + (p.keyEnvVars && !p.hasKey ? ' · env: ' + esc(p.keyEnvVars.join(' | ')) : '') + '</div>' +
            '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px">' +
            shown.map(function (m) {
              var val = p.id + '::' + m.id;
              return '<button class="btn ' + (cur === val ? 'dark' : 'ghost') + '" data-model="' + esc(val) + '" style="padding:3px 9px;font-size:11px" title="' + esc((m.vision ? 'supports images' : 'text only') + (m.free ? ' · free (no credits needed)' : '') + ' · ' + modelMetaText(m)) + '">' + esc(m.id) + (m.vision ? ' ◉' : '') + (m.free ? ' (free)' : '') + '<span class="meta"> · ' + esc(modelMetaText(m)) + '</span></button>';
            }).join('') +
            (models.length > shown.length ? '<span class="meta">+' + (models.length - shown.length) + ' more</span>' : '') +
            '</div>' +
            '<div style="margin-top:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">' +
            '<input type="password" id="keyin-' + i + '" placeholder="paste ' + esc(p.id) + ' API key" style="margin:0;max-width:280px">' +
            '<button class="btn dark" data-savekey="' + i + '">Save key</button>' +
            (storedVar ? '<button class="btn ghost" data-delkey="' + esc(storedVar) + '">Remove stored key</button>' : '') +
            '</div>' +
            '</div></div>';
        }).join('') || '<div class="meta">no providers available</div>';
        body.querySelectorAll('[data-model]').forEach(function (btn) {
          btn.onclick = function () {
            S.sel.model = btn.getAttribute('data-model');
            persist();
            toast('Default model: ' + S.sel.model);
            renderSettings();
          };
        });
        body.querySelectorAll('[data-savekey]').forEach(function (btn) {
          btn.onclick = function () {
            var i = Number(btn.getAttribute('data-savekey'));
            var p = prov[i];
            var input = $('keyin-' + i);
            var key = input ? input.value.trim() : '';
            if (!p || !key) { toast('Paste an API key first', true); return; }
            var envVar = (p.keyEnvVars || [])[0];
            api('/api/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ envVar: envVar, key: key }) })
              .then(function () { toast('Key saved for ' + p.id); refreshModels(); })
              .catch(function (e) { toast(e.message, true); });
          };
        });
        body.querySelectorAll('[data-delkey]').forEach(function (btn) {
          btn.onclick = function () {
            var v = btn.getAttribute('data-delkey');
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
        '<div class="setlist"><input type="text" id="prPath" value="' + esc(S.settings.projectPath) + '" placeholder="C:\\path\\to\\project">' +
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
          '<p style="color:var(--muted);font-size:12.5px">Named worker agents that the main agent can run in parallel with the delegate tool on big projects. Up to three run at once; extra work stays queued with live status updates. Each agent can use a different provider, model, and reasoning effort.</p>' +
          '<div style="margin:12px 0"><button class="btn dark" id="agNew">+ New agent</button></div>' +
          '<div class="setcard" id="agForm" hidden><div class="setlist">' +
          '<input id="agName" placeholder="agent name (e.g. frontend, tester, researcher)">' +
          '<div class="row"><select id="agModel" style="flex:1">' + modelOptions('') + '</select><select id="agEffort"><option value="">effort: default</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="max">max</option></select></div>' +
          '<textarea id="agRole" rows="3" placeholder="role / specialty instructions (e.g. You are a frontend specialist: React, CSS, accessibility…)"></textarea>' +
          '<div class="row"><button class="btn dark" id="agSave">Save agent</button><button class="btn ghost" id="agCancel">Cancel</button><span class="meta" id="agMeta"></span></div></div></div>' +
          '<div class="setcard">' +
          (agents.length ? agents.map(function (a) {
            return '<div class="skcard"><div class="skhead"><b>' + esc(a.name) + '</b>' +
              '<span class="chip info">' + esc(a.provider ? a.provider + '/' : '') + esc(a.model || 'default') + '</span>' +
              (a.effort ? '<span class="chip">' + esc(a.effort) + '</span>' : '') +
              '<span style="flex:1"></span>' +
              '<button class="ubtn" data-agedit="' + esc(a.id) + '" title="edit">' + icon('pencil') + '</button>' +
              '<button class="ubtn" data-agdel="' + esc(a.id) + '" title="delete">' + icon('x') + '</button></div>' +
              '<div class="skdesc">' + esc(a.role) + '</div></div>';
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
          '<div style="display:flex;gap:8px;margin:12px 0"><input type="text" id="skSearch" placeholder="Search skills…" value="' + esc(S.skillQuery || '') + '" style="flex:1;border:1px solid var(--border);border-radius:8px;background:#fff;padding:7px 10px">' +
          '<button class="btn dark" id="skNew">+ New skill</button></div>' +
          '<div class="setcard" id="skFormCard" hidden style="margin-bottom:12px"><div class="setlist">' +
          '<input id="skName" placeholder="skill name (e.g. deploy-checklist)">' +
          '<input id="skDesc" placeholder="short description (shown to the agent)">' +
          '<textarea id="skInstr" rows="6" placeholder="step-by-step instructions"></textarea>' +
          '<div class="row"><button class="btn dark" id="skSave">Save skill</button><button class="btn ghost" id="skCancel">Cancel</button><span class="meta" id="skEditMeta"></span></div></div></div>' +
          '<div class="setcard">' +
          (skills.length ? skills.map(function (sk) {
            return '<div class="skcard">' +
              '<div class="skhead"><b>' + esc(sk.name) + '</b>' +
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
            return '<div class="row"><span class="grow"><b>' + esc(sv.name) + '</b> <span class="meta">' + esc(sv.command) + ' ' + esc((sv.args || []).join(' ')) + '</span></span><button class="x" data-x="' + esc(sv.name) + '' + icon('x') + '</button></div>';
          }).join('') : '<div class="meta">no servers yet</div>') +
          (d.tools.length ? '<div class="meta" style="margin-top:6px">tools: ' + esc(d.tools.map(function (t) { return 'mcp:' + t.server + ':' + t.name; }).join(', ')) + '</div>' : '') +
          '<div style="height:8px"></div><div class="row"><input id="mcName" placeholder="name (e.g. fs)" style="margin:0"><input id="mcCmd" placeholder="command (e.g. npx)" style="margin:0"></div><input id="mcArgs" placeholder="args separated by spaces">' +
          '<div class="row"><button class="btn dark" id="mcAdd">Add MCP server</button><button class="btn ghost" id="mcFs">+ filesystem MCP (official)</button></div></div></div>';
        b.querySelectorAll('[data-x]').forEach(function (el) {
          el.onclick = function () { api('/api/mcp/' + el.getAttribute('data-x'), { method: 'DELETE' }).then(function () { renderSettings(); }); };
        });
        $('mcAdd').onclick = function () {
          api('/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: $('mcName').value, command: $('mcCmd').value, args: $('mcArgs').value.split(/\s+/).filter(Boolean) }) })
            .then(function () { renderSettings(); }).catch(function (e) { toast(e.message, true); });
        };
        $('mcFs').onclick = function () {
          var root = S.settings.projectPath || (S.project && S.project.repoRoot) || '.';
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
            return '<div class="row"><span class="grow">every <b>' + esc(jb.every) + '</b> — ' + esc(jb.goal) + (jb.lastRunAt ? ' <span class="meta">(last ' + new Date(jb.lastRunAt).toLocaleTimeString() + ')</span>' : '') + '</span><button class="x" data-x="' + esc(jb.id) + '' + icon('x') + '</button></div>';
          }).join('') : '<div class="meta">no jobs yet</div>') +
          '<div style="height:8px"></div><div class="row"><div style="flex:1"><div class="meta">Schedule (e.g. 30, 30s, 5m, 1h — bare numbers are minutes)</div><input id="crEvery" placeholder="30m" style="margin:0"></div><div style="flex:2"><div class="meta">Goal for the agent</div><input id="crGoal" placeholder="e.g. run tests and fix failures" style="margin:0"></div></div>' +
          '<div class="row"><button class="btn dark" id="crAdd">Add cron job</button><button class="btn ghost" id="crHeart">+ heartbeat (30m)</button></div></div></div>';
        b.querySelectorAll('[data-x]').forEach(function (el) {
          el.onclick = function () { api('/api/cron/' + el.getAttribute('data-x'), { method: 'DELETE' }).then(function () { renderSettings(); }); };
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
    browseTo(S.settings.projectPath || '');
  }

  function browseTo(p, isFallback) {
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
    api('/api/project').then(function (p) { S.project = p; updateProjChip(); }).catch(function () { updateProjChip(); });
    api('/api/home').then(function (h) {
      var heal = function (p) {
        if (!p) return p;
        var i = p.indexOf('\\Hermes\\');
        if (i >= 0) return h.root + p.slice(i + 7);
        return p;
      };
      var np = heal(S.settings.projectPath);
      if (np !== S.settings.projectPath) { S.settings.projectPath = np; persist(); updateProjChip(); }
      S.lastProjectPath = heal(S.lastProjectPath);
    }).catch(function () {});
    api('/api/models').then(function (data) { S.models = data.providers; if (S.active === 'home') openHome(); }).catch(function () {});
    api('/api/files').then(function (data) { S.files = data.files || []; }).catch(function () {});
    $('gearBtn').onclick = function () { openSettings('general'); };
    $('gearBtn').innerHTML = icon('gear');
    $('sbCollapse').onclick = function () { S.settings.leftCollapsed = !S.settings.leftCollapsed; persist(); applyLayout(); };
    bindResize('sbResize', 'left');
    $('bulkDel').onclick = bulkDelete;
    $('bulkDone').onclick = function () { S.manage = false; S.selProj = {}; S.selRuns = {}; renderSidebar(); };
    $('browseCancel').onclick = function () { $('browseModal').hidden = true; };
    $('projChip').style.cursor = 'pointer';
    $('projChip').title = 'Choose a project folder';
    $('projChip').onclick = openFolderBrowser;
    updateProjChip();
    renderSidebar();
    renderTopbar();
    applyLayout();
    openHome();
  }
  boot();
})();
</script>
<div id="mascotWrap" style="position:fixed;right:14px;bottom:12px;z-index:45;pointer-events:none;width:240px;height:170px">
  <canvas id="mascotCanvas" style="width:240px;height:170px;image-rendering:pixelated"></canvas>
  <div id="mascotName" style="position:absolute;top:44px;left:0;font:700 11px ui-monospace,Menlo,Consolas,monospace;color:#fff;background:#2a2a26;border:1px solid #7c6cf0;border-radius:6px;padding:2px 8px;white-space:nowrap;opacity:0;transition:opacity .4s">Agent Gitu</div>
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
      if (modeT > 4.5) { mode = 'idle'; modeT = 0; }
    } else if (mode === 'shoot') {
      legL.rotation.x = 0.25; legR.rotation.x = -0.25;
      armR.rotation.x = -1.35 + Math.sin(t * 28) * 0.07;
      armR.rotation.z = 0;
      armL.rotation.x = 0.35;
      flash.visible = (Math.floor(t * 14) % 2 === 0);
      root.position.x = 2;
      root.position.y = Math.sin(t * 28) * 0.04;
    } else {
      legL.rotation.x = 0; legR.rotation.x = 0;
      armR.rotation.x = -0.85; armR.rotation.z = -0.08;
      armL.rotation.x = 0;
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
