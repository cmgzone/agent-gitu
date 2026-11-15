/**
 * Cowork Workbench, Command Palette, Slash Commands, Context Meter,
 * Grounded Citation Chips, Step Replay Branching, and Proactive Pulse Digest.
 *
 * Written in ES5-compatible String.raw so it can be evaluated both inside the
 * browser IIFE and standalone in Vitest VM contexts.
 */
export const COWORK_WORKBENCH_CSS = String.raw`
  /* ---- Slash Command Menu & Command Palette ---- */
  .cw-slash-menu { position: absolute; left: 16px; right: 16px; bottom: calc(100% + 8px); max-width: 420px; max-height: 280px; overflow-y: auto; padding: 6px; border: 1px solid var(--border2); border-radius: 16px; background: var(--card); color: var(--text); box-shadow: 0 14px 42px rgba(0,0,0,.28); z-index: 25; }
  .cw-slash-menu[hidden] { display: none !important; }
  .cw-slash-item { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; padding: 8px 11px; border: 0; border-radius: 10px; background: transparent; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
  .cw-slash-item:hover, .cw-slash-item.active, .cw-slash-item:focus-visible { background: var(--hover); outline: none; }
  .cw-slash-cmd { font-family: var(--mono); font-size: 12px; font-weight: 600; color: var(--accent); }
  .cw-slash-desc { font-size: 11.5px; color: var(--muted); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cw-palette-modal .box { width: min(580px, 94vw); max-height: min(520px, 84dvh); overflow: hidden; display: flex; flex-direction: column; }
  .cw-palette-search { width: 100%; box-sizing: border-box; padding: 12px 16px; border: 0; border-bottom: 1px solid var(--border); background: var(--card2); color: var(--text); font: inherit; font-size: 14px; outline: none; }
  .cw-palette-list { flex: 1; min-height: 0; overflow-y: auto; padding: 8px; display: flex; flex-direction: column; gap: 3px; }
  .cw-palette-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; padding: 9px 12px; border: 0; border-radius: 10px; background: transparent; color: var(--text); font: inherit; text-align: left; cursor: pointer; }
  .cw-palette-row:hover, .cw-palette-row.active { background: var(--hover); }
  .cw-palette-row strong { font-size: 12.5px; font-weight: 600; }
  .cw-palette-row span { font-size: 11px; color: var(--muted); }
  .cw-palette-tag { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; padding: 2px 7px; border-radius: 999px; border: 1px solid var(--border2); color: var(--muted); }

  /* ---- Context, Token & Cost Meter Pill ---- */
  .cw-context-bar { display: none !important; }
  .cw-plus-menu { width: 204px; }
  .cw-plus-context { margin-top: 4px; padding: 7px 10px 4px; border-top: 1px solid var(--border); font-size: 10.5px; color: var(--muted); display: flex; flex-direction: column; gap: 5px; font-variant-numeric: tabular-nums; }
  .cw-plus-context[hidden] { display: none !important; }
  .cw-context-pill { display: inline-flex; align-items: center; gap: 7px; padding: 3px 9px; border: 1px solid var(--border); border-radius: 999px; background: color-mix(in srgb, var(--card) 72%, transparent); font-variant-numeric: tabular-nums; }
  .cw-context-meter-track { width: 44px; height: 4px; border-radius: 99px; background: var(--border); overflow: hidden; display: inline-block; }
  .cw-context-meter-fill { display: block; height: 100%; background: var(--accent); border-radius: inherit; transition: width .2s ease; }
  .cw-context-meter-fill.warn { background: var(--evidence, #d97706); }
  .cw-context-meter-fill.high { background: var(--err, #dc2626); }
  .cw-context-actions { display: inline-flex; align-items: center; gap: 6px; }
  .cw-context-btn { border: 1px solid var(--border2); border-radius: 999px; background: transparent; color: var(--muted); font: inherit; font-size: 10.5px; padding: 2px 8px; cursor: pointer; }
  .cw-context-btn:hover { color: var(--text); border-color: var(--accent); }

  /* ---- Side-by-Side Live Workbench (Canvas) ---- */
  .cw-workbench { width: min(460px, 44vw); flex: none; border-left: 1px solid var(--border); background: var(--card); display: flex; flex-direction: column; min-height: 0; z-index: 14; }
  .cw-workbench[hidden] { display: none !important; }
  .cw-workbench-head { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--border); background: var(--card2); }
  .cw-workbench-head strong { flex: 1; min-width: 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cw-workbench-toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 8px 14px; border-bottom: 1px solid var(--border); font-size: 11.5px; }
  .cw-workbench-toolbar select { background: var(--card2); border: 1px solid var(--border2); color: var(--text); border-radius: 7px; padding: 4px 8px; font: inherit; font-size: 11.5px; }
  .cw-workbench-body { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 12px 14px; gap: 10px; overflow-y: auto; }
  .cw-workbench-editor { flex: 1; width: 100%; min-height: 220px; box-sizing: border-box; resize: none; border: 1px solid var(--border2); border-radius: 10px; padding: 12px; background: var(--bg); color: var(--text); font: 12.5px/1.6 var(--mono); }
  .cw-workbench-diff { padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); font: 11.5px/1.55 var(--mono); white-space: pre-wrap; overflow-x: auto; max-height: 180px; overflow-y: auto; }
  .cw-workbench-diff[hidden] { display: none !important; }
  .cw-workbench-foot { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-top: 1px solid var(--border); background: var(--card2); }
  .cw-workbench-foot input { flex: 1; min-width: 0; background: var(--bg); border: 1px solid var(--border2); color: var(--text); border-radius: 8px; padding: 6px 10px; font: inherit; font-size: 12px; }
  @media (max-width: 900px) { .cw-workbench { position: absolute; inset: 0 0 0 auto; width: min(440px, 92vw); box-shadow: -12px 0 36px rgba(0,0,0,.3); } }

  /* ---- Grounded Citation Chips & Source Inspector ---- */
  .cw-citations { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; padding-top: 6px; border-top: 1px dashed color-mix(in srgb, var(--border) 70%, transparent); }
  .cw-citation-chip { display: inline-flex; align-items: center; gap: 5px; max-width: 220px; padding: 2px 8px; border: 1px solid var(--border2); border-radius: 999px; background: color-mix(in srgb, var(--card) 75%, transparent); color: var(--muted); font: inherit; font-size: 10.5px; cursor: pointer; text-decoration: none; }
  .cw-citation-chip:hover { color: var(--text); border-color: var(--accent); }
  .cw-citation-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cw-citation-kind { font-weight: 700; text-transform: uppercase; font-size: 9px; letter-spacing: .04em; color: var(--accent); }

  /* ---- Step Replay & Branching Controls ---- */
  .cw-work-step-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 10px; margin-bottom: 6px; border-radius: 8px; background: color-mix(in srgb, var(--card2) 80%, transparent); font-size: 11px; color: var(--muted); }
  .cw-branch-step-btn { margin-left: auto; border: 1px solid var(--border2); border-radius: 6px; background: transparent; color: var(--muted); font: inherit; font-size: 10.5px; padding: 2px 7px; cursor: pointer; }
  .cw-branch-step-btn:hover { color: var(--text); border-color: var(--accent); }

  /* ---- Proactive Pulse / Morning Brief Modal ---- */
  .cw-pulse-modal .box { width: min(680px, 94vw); max-height: min(640px, 88dvh); }
  .cw-pulse-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin-bottom: 14px; }
  .cw-pulse-stat { padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--card2); }
  .cw-pulse-stat small { display: block; font-size: 10.5px; color: var(--muted); text-transform: uppercase; letter-spacing: .05em; }
  .cw-pulse-stat strong { display: block; margin-top: 3px; font-size: 18px; font-weight: 650; color: var(--text); }
  .cw-pulse-list { display: flex; flex-direction: column; gap: 8px; }
  .cw-pulse-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--card2); }
  .cw-pulse-row-main { min-width: 0; flex: 1; }
  .cw-pulse-row-main strong { display: block; font-size: 12.5px; color: var(--text); overflow-wrap: anywhere; }
  .cw-pulse-row-main span { display: block; font-size: 11px; color: var(--muted); margin-top: 2px; }
  .cw-status-badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-size: 10.5px; font-weight: 600; border: 1px solid var(--border2); color: var(--text); white-space: nowrap; }
  .cw-status-badge[data-status="Completed"] { color: var(--ok); border-color: var(--ok); }
  .cw-status-badge[data-status="In Progress"] { color: var(--accent); border-color: var(--accent); }
  .cw-status-badge[data-status="Blocked"], .cw-status-badge[data-status="Requires Approval"] { color: var(--evidence, #d97706); border-color: var(--evidence, #d97706); }
  .cw-status-badge[data-status="Failed"] { color: var(--err); border-color: var(--err); }
  .cw .cw-composer-wrap > .cw-composer-topline,
  .cw-composer-topline {
    display: flex; align-items: center; gap: 8px; min-width: 0;
    padding: 0 6px 8px; pointer-events: none;
  }
  .cw-composer-topline > * { pointer-events: auto; }
  .cw-project-pill {
    display: inline-flex; align-items: center; gap: 6px;
    height: 28px; padding: 0 9px; border-radius: 999px;
    border: 1px solid var(--border); background: var(--bg2); color: var(--text);
    font-size: 12px; font-weight: 600; cursor: pointer; flex: 0 0 auto;
    max-width: min(260px, 100%); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    box-shadow: var(--shadow-sm);
    transition: border-color .15s, background .15s, transform .12s;
  }
  .cw-project-pill:hover { border-color: var(--border-strong); background: var(--card); }
  .cw-project-pill svg { width: 14px; height: 14px; flex-shrink: 0; color: var(--accent); }
  .cw-project-pill-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cw-project-pill-caret { font-size: 10px; opacity: .65; margin-left: 1px; }
  .cw-project-menu { min-width: 240px; max-width: 300px; padding: 6px; border-radius: 16px; }
  .cw-project-menu-head {
    padding: 6px 10px 4px; font-size: 10px; font-weight: 700;
    letter-spacing: .08em; text-transform: uppercase; color: var(--muted);
  }
  .cw-project-menu button.cw-project-item,
  .cw-project-item {
    width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 8px 10px; border: 0; border-radius: 10px; background: transparent;
    color: var(--text); font-size: 12.5px; text-align: left; cursor: pointer;
  }
  .cw-project-menu button.cw-project-item[data-cwproj-action],
  .cw-project-item[data-cwproj-action] { justify-content: flex-start; }
  .cw-project-menu button.cw-project-item[data-cwproj-action="clear"],
  .cw-project-item[data-cwproj-action="clear"] { justify-content: space-between; }
  .cw-project-menu button.cw-project-item svg,
  .cw-project-item svg { width: 15px; height: 15px; flex: 0 0 auto; color: var(--muted); }
  .cw-project-item:hover { background: var(--hover); }
  .cw-project-menu button.cw-project-item.active,
  .cw-project-item.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
  .cw-project-item.active .cw-project-item-path { color: inherit; opacity: .78; }
  .cw-project-item-path {
    font-size: 11px; color: var(--muted);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 110px;
  }
  .cw-project-menu-sep { height: 1px; background: var(--border); margin: 5px 4px; }
  .cw-rail-sec-row { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px 4px; }
  .cw-rail-add {
    border: 1px solid var(--border); background: var(--card); color: var(--text);
    border-radius: 8px; width: 22px; height: 22px;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 14px; line-height: 1; cursor: pointer;
  }
  .cw-rail-add:hover { border-color: var(--border-strong); background: var(--hover); }
  .cw-rail-project-btn {
    width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 7px 10px; border: 0; border-radius: 10px; background: transparent;
    color: var(--text); font-size: 12.5px; text-align: left; cursor: pointer;
  }
  .cw-rail-project-btn:hover { background: var(--hover); }
  .cw-rail-project-btn.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
  @media (min-width: 721px) {
    .cw:not(.page-open) > .cw-workbench:not([hidden]) {
      border: 1px solid var(--border); border-radius: 24px;
      box-shadow: var(--shadow); margin-left: 10px; overflow: hidden; background: var(--card);
    }
  }
  .cw-rail-coding { display: flex; flex-direction: column; gap: 4px; padding: 0 6px 6px; }
  .cw-rail-coding-empty { font-size: 11.5px; color: var(--muted); padding: 4px 10px 8px; }
  .cw-rail-coding-btn {
    width: 100%; display: flex; align-items: flex-start; gap: 8px;
    padding: 8px 10px; border: 1px solid transparent; border-radius: 12px; background: transparent;
    color: var(--text); font-size: 12px; text-align: left; cursor: pointer;
    transition: background .15s ease, border-color .15s ease;
  }
  .cw-rail-coding-btn:hover { background: var(--hover); }
  .cw-rail-coding-btn.active { background: var(--accent-soft); border-color: var(--border-strong); color: var(--accent); }
  .cw-rail-coding-dot {
    width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; margin-top: 4px;
    background: var(--muted);
  }
  .cw-rail-coding-dot.is-live { background: #16a34a; box-shadow: 0 0 0 3px rgba(22,163,74,.2); animation: cwWbPulse 1.6s ease-in-out infinite; }
  .cw-rail-coding-dot.is-warn { background: #d97706; box-shadow: 0 0 0 3px rgba(217,119,6,.2); }
  .cw-rail-coding-dot.is-done { background: #16a34a; opacity: .78; }
  .cw-rail-coding-dot.is-fail { background: #dc2626; }
  .cw-rail-coding-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .cw-rail-coding-goal { font-weight: 600; line-height: 1.3; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cw-rail-coding-meta { font-size: 10.5px; color: var(--muted); display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cw-wb-code-meta {
    display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;
    padding: 8px 14px; border-bottom: 1px solid var(--border); background: var(--card); font-size: 11.5px;
  }
  .cw-wb-meta-left, .cw-wb-meta-right { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; min-width: 0; }
  .cw-wb-status {
    display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 999px;
    font-weight: 600; font-size: 11px; background: var(--card2); border: 1px solid var(--border); color: var(--text);
  }
  .cw-wb-status::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--muted); }
  .cw-wb-status.is-live { background: rgba(22,163,74,.12); border-color: rgba(22,163,74,.32); color: #15803d; }
  .cw-wb-status.is-live::before { background: #16a34a; animation: cwWbPulse 1.5s ease-in-out infinite; }
  .cw-wb-status.is-warn { background: rgba(217,119,6,.12); border-color: rgba(217,119,6,.35); color: #b45309; }
  .cw-wb-status.is-warn::before { background: #d97706; }
  .cw-wb-status.is-done { background: rgba(22,163,74,.1); border-color: rgba(22,163,74,.25); color: #15803d; }
  .cw-wb-status.is-done::before { background: #16a34a; }
  .cw-wb-status.is-fail { background: rgba(220,38,38,.12); border-color: rgba(220,38,38,.32); color: #b91c1c; }
  .cw-wb-status.is-fail::before { background: #dc2626; }
  .cw-wb-pill {
    display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px;
    background: var(--card2); border: 1px solid var(--border); color: var(--muted); font-size: 11px;
    max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .cw-workbench-body.is-coding { padding: 12px 14px; gap: 10px; background: var(--bg); }
  .cw-wb-feed { display: flex; flex-direction: column; gap: 10px; flex: 1; min-height: 0; }
  .cw-wb-msg {
    display: flex; flex-direction: column; gap: 5px; padding: 10px 12px; border-radius: 14px;
    border: 1px solid var(--border); background: var(--card); font-size: 12.5px; line-height: 1.55;
    box-shadow: 0 1px 2px rgba(0,0,0,.04); overflow-wrap: anywhere;
  }
  .cw-wb-msg.is-user {
    align-self: flex-end; max-width: 90%; background: var(--accent-soft);
    border-color: var(--border-strong); border-bottom-right-radius: 4px;
  }
  .cw-wb-msg.is-agent { border-bottom-left-radius: 4px; }
  .cw-wb-msg.is-streaming { border-color: rgba(22,163,74,.38); box-shadow: 0 0 0 2px rgba(22,163,74,.08); }
  .cw-wb-msg-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; font-weight: 700; color: var(--muted); }
  .cw-wb-msg-body code { font-family: var(--mono); font-size: 11.5px; padding: 1px 5px; border-radius: 5px; background: var(--card2); border: 1px solid var(--border); }
  .cw-wb-msg-body pre { margin: 6px 0 2px; padding: 8px 10px; border-radius: 9px; background: var(--bg); border: 1px solid var(--border); font: 11.5px/1.5 var(--mono); overflow-x: auto; white-space: pre-wrap; }
  .cw-wb-caret { display: inline-block; width: 7px; height: 13px; margin-left: 3px; vertical-align: text-bottom; border-radius: 2px; background: var(--accent); animation: cwWbBlink 1s steps(2, start) infinite; }
  .cw-wb-think {
    border: 1px dashed var(--border2); border-radius: 12px; background: var(--card);
    padding: 7px 10px; font-size: 12px; color: var(--muted);
  }
  .cw-wb-think summary { cursor: pointer; font-weight: 600; color: var(--text); font-size: 11.5px; }
  .cw-wb-think pre { margin: 6px 0 0; font: 11.5px/1.5 var(--mono); white-space: pre-wrap; max-height: 180px; overflow-y: auto; }
  .cw-wb-step {
    border: 1px solid var(--border); border-radius: 12px; background: var(--card);
    padding: 8px 10px; font-size: 12px; display: flex; flex-direction: column; gap: 5px;
  }
  .cw-wb-step.is-running { border-color: rgba(22,163,74,.35); }
  .cw-wb-step.is-error { border-color: rgba(220,38,38,.35); }
  .cw-wb-step-row { display: flex; align-items: center; gap: 7px; min-width: 0; }
  .cw-wb-step-ico {
    width: 20px; height: 20px; border-radius: 6px; flex: 0 0 auto;
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--card2); border: 1px solid var(--border); font: 600 11px/1 var(--mono); color: var(--text);
  }
  .cw-wb-step-title { flex: 1; min-width: 0; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cw-wb-step-why { font-size: 11.5px; color: var(--muted); padding-left: 27px; overflow-wrap: anywhere; }
  .cw-wb-step-state { font-size: 10.5px; font-weight: 600; padding: 2px 7px; border-radius: 999px; background: var(--card2); color: var(--muted); flex: 0 0 auto; }
  .cw-wb-step.is-running .cw-wb-step-state { background: rgba(22,163,74,.14); color: #15803d; }
  .cw-wb-step.is-done .cw-wb-step-state { color: #15803d; }
  .cw-wb-step.is-error .cw-wb-step-state { background: rgba(220,38,38,.12); color: #b91c1c; }
  .cw-wb-diffstat { display: inline-flex; gap: 4px; font: 600 11px/1 var(--mono); flex: 0 0 auto; }
  .cw-wb-diffstat .add { color: #16a34a; }
  .cw-wb-diffstat .del { color: #dc2626; }
  .cw-wb-step-details { padding-left: 27px; font-size: 11.5px; }
  .cw-wb-step-details summary { cursor: pointer; color: var(--muted); font-size: 11px; }
  .cw-wb-step-pre { margin: 5px 0 0; padding: 7px 9px; border-radius: 8px; background: var(--bg); border: 1px solid var(--border); font: 11px/1.45 var(--mono); white-space: pre-wrap; max-height: 170px; overflow: auto; }
  .cw-wb-diffbox { margin-top: 5px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); overflow: auto; max-height: 190px; font: 11px/1.45 var(--mono); }
  .cw-wb-dline { display: flex; gap: 6px; padding: 1px 8px; white-space: pre; }
  .cw-wb-dline.add { background: rgba(22,163,74,.12); color: #15803d; }
  .cw-wb-dline.remove { background: rgba(220,38,38,.11); color: #b91c1c; }
  .cw-wb-dline .ln { min-width: 26px; color: var(--muted); user-select: none; text-align: right; }
  .cw-wb-note {
    display: flex; align-items: flex-start; gap: 8px; padding: 7px 10px; border-radius: 10px;
    background: var(--card2); border: 1px solid var(--border); font-size: 12px; color: var(--text);
  }
  .cw-wb-note.is-pass { border-color: rgba(22,163,74,.32); background: rgba(22,163,74,.08); }
  .cw-wb-note.is-fail { border-color: rgba(220,38,38,.32); background: rgba(220,38,38,.08); }
  .cw-wb-note.is-warn { border-color: rgba(217,119,6,.32); background: rgba(217,119,6,.08); }
  .cw-wb-gate {
    display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; border-radius: 12px;
    border: 1px solid rgba(217,119,6,.45); background: rgba(217,119,6,.09); font-size: 12px;
  }
  .cw-wb-gate-actions { display: flex; flex-wrap: wrap; gap: 6px; }
  .cw-wb-report {
    display: flex; flex-direction: column; gap: 8px; padding: 11px 12px; border-radius: 14px;
    border: 1px solid var(--border); background: var(--card); font-size: 12px;
  }
  .cw-wb-filechips { display: flex; flex-wrap: wrap; gap: 5px; }
  .cw-wb-filechip {
    display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 8px;
    background: var(--bg); border: 1px solid var(--border); font: 11px/1.3 var(--mono); color: var(--text);
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .cw-wb-empty { padding: 16px 12px; text-align: center; color: var(--muted); font-size: 12px; border: 1px dashed var(--border); border-radius: 12px; }
  @keyframes cwWbPulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .45; transform: scale(.86); } }
  @keyframes cwWbBlink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
  @media (max-width: 720px) {
    .cw .cw-composer-wrap > .cw-composer-topline,
    .cw-composer-topline { padding: 0 4px 6px; }
    .cw-project-pill { max-width: min(240px, 100%); padding: 0 8px; font-size: 12px; }
  }
`;

export const COWORK_WORKBENCH_JS = String.raw`
  var CW_SLASH_COMMANDS = [
    { cmd: '/workbench', label: 'Open Workbench', desc: 'Open side-by-side live draft & code workbench' },
    { cmd: '/pulse', label: 'Pulse Digest', desc: 'Open Morning Brief and status overview' },
    { cmd: '/compact', label: 'Compact Context', desc: 'Summarize and trim older context to save tokens' },
    { cmd: '/handoff', label: 'Handoff Task', desc: 'Delegate or hand off current context to another teammate' },
    { cmd: '/compare', label: 'Compare Teammates', desc: 'Ask two teammates to weigh in on this prompt' },
    { cmd: '/connect', label: 'Connected Apps', desc: 'Open app connections and credentials' },
    { cmd: '/model', label: 'Switch Model', desc: 'Edit active teammate provider or model' }
  ];

  function cwModelCatalogMeta(agent) {
    var modelsList = typeof S === 'object' && S && Array.isArray(S.models) ? S.models : [];
    var providerId = agent && agent.provider ? String(agent.provider).toLowerCase() : '';
    var modelId = agent && agent.model ? String(agent.model).toLowerCase() : '';
    if (!modelId && !providerId) return null;
    var fallbackMeta = null;
    for (var i = 0; i < modelsList.length; i++) {
      var p = modelsList[i];
      if (!p || !Array.isArray(p.models)) continue;
      var pMatch = !providerId || String(p.id || '').toLowerCase() === providerId;
      for (var j = 0; j < p.models.length; j++) {
        var entry = p.models[j];
        if (!entry) continue;
        var entryId = String(entry.id || '').toLowerCase();
        if (modelId && entryId === modelId) {
          if (pMatch && entry.metadata) return entry.metadata;
          if (!fallbackMeta && entry.metadata) fallbackMeta = entry.metadata;
        }
      }
    }
    return fallbackMeta;
  }

  function cwFormatUsd(costUsd) {
    if (typeof costUsd !== 'number' || !isFinite(costUsd) || costUsd <= 0) return '$0.00';
    if (costUsd < 0.0001) return '<$0.0001';
    if (costUsd < 0.01) return '$' + costUsd.toFixed(4);
    return '$' + costUsd.toFixed(2);
  }

  function cwFormatCredits(credits, opts) {
    var includeUnit = !opts || opts.includeUnit !== false;
    if (typeof credits !== 'number' || !isFinite(credits) || credits <= 0) {
      return includeUnit ? '0 credits' : '0';
    }
    var numStr;
    if (credits < 0.01) {
      numStr = credits.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
    } else if (credits % 1 === 0) {
      numStr = credits.toFixed(0);
    } else {
      numStr = credits.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    }
    if (!includeUnit) return numStr;
    return credits === 1 ? '1 credit' : numStr + ' credits';
  }

  function cwEstimateContextUsage() {
    var cw = cwEnsure();
    var msgs = cw.msgs || [];
    var chars = 0;
    for (var i = 0; i < msgs.length; i++) {
      chars += String(msgs[i] && msgs[i].text || '').length;
    }
    var history = cw.workHistory || [];
    for (var j = 0; j < history.length; j++) {
      chars += String(history[j] && history[j].publicUpdate || '').length + 80;
    }
    var estimatedTokens = Math.max(0, Math.round(chars / 4));
    var conv = typeof cwActiveConv === 'function' ? cwActiveConv() : null;
    var agentId = cw.selectedAgentId || (conv && (conv.kind === 'dm' ? conv.memberIds[0] : conv.chiefId || conv.memberIds[0]));
    var agent = agentId && typeof cwAgentById === 'function' ? cwAgentById(agentId) : null;
    var serverUsage = cw.usage && typeof cw.usage === 'object' ? cw.usage : null;
    var catalogMeta = cwModelCatalogMeta(agent || (serverUsage ? { provider: serverUsage.provider, model: serverUsage.model } : null));

    var subTree = cw.subAgents && typeof cw.subAgents === 'object' ? cw.subAgents : null;
    var subNodes = subTree && Array.isArray(subTree.nodes) ? subTree.nodes : [];
    var subInputTokens = 0;
    var subOutputTokens = 0;
    var subCachedTokens = 0;
    var subContextTokens = 0;
    var subNodeCostUsd = 0;
    for (var k = 0; k < subNodes.length; k++) {
      var node = subNodes[k];
      if (!node) continue;
      if (node.spend) {
        subInputTokens += Number(node.spend.inputTokens) || 0;
        subOutputTokens += Number(node.spend.outputTokens) || 0;
        subCachedTokens += Number(node.spend.cachedTokens) || 0;
        subNodeCostUsd += Number(node.spend.costUsd) || 0;
      }
      if (node.activity && Number(node.activity.contextTokens) > subContextTokens) {
        subContextTokens = Number(node.activity.contextTokens);
      }
    }
    var subTotalSpendUsd = subTree && subTree.totals && typeof subTree.totals.spendUsd === 'number'
      ? subTree.totals.spendUsd
      : subNodeCostUsd;

    var missions = Array.isArray(cw.missions) ? cw.missions : [];
    var missionSpendUsd = 0;
    var missionMaxBudgetUsd = 0;
    for (var mIdx = 0; mIdx < missions.length; mIdx++) {
      var mItem = missions[mIdx];
      if (!mItem) continue;
      if (typeof mItem.budgetSpentUsd === 'number') missionSpendUsd += mItem.budgetSpentUsd;
      if (typeof mItem.budgetMaxCostUsd === 'number') missionMaxBudgetUsd += mItem.budgetMaxCostUsd;
    }

    var inputTokens = serverUsage && typeof serverUsage.inputTokens === 'number'
      ? Math.max(serverUsage.inputTokens, subInputTokens)
      : subInputTokens;
    var outputTokens = serverUsage && typeof serverUsage.outputTokens === 'number'
      ? Math.max(serverUsage.outputTokens, subOutputTokens)
      : subOutputTokens;
    var cachedTokens = serverUsage && typeof serverUsage.cachedTokens === 'number'
      ? Math.max(serverUsage.cachedTokens, subCachedTokens)
      : subCachedTokens;
    var liveContextTokens = (serverUsage && Number(serverUsage.contextTokens)) || subContextTokens || inputTokens;
    var hasRealTokens = liveContextTokens > 0 || outputTokens > 0;
    var tokens = hasRealTokens ? liveContextTokens : estimatedTokens;

    var maxTokens = (catalogMeta && (catalogMeta.contextTokens || catalogMeta.inputTokens))
      || (serverUsage && Number(serverUsage.contextWindow))
      || 128000;

    var inputCostPerM = (catalogMeta && typeof catalogMeta.inputPricePerMillion === 'number')
      ? catalogMeta.inputPricePerMillion
      : (serverUsage && typeof serverUsage.inputPricePerMillion === 'number')
        ? serverUsage.inputPricePerMillion
        : null;
    var outputCostPerM = (catalogMeta && typeof catalogMeta.outputPricePerMillion === 'number')
      ? catalogMeta.outputPricePerMillion
      : (serverUsage && typeof serverUsage.outputPricePerMillion === 'number')
        ? serverUsage.outputPricePerMillion
        : null;
    var cachedCostPerM = (catalogMeta && typeof catalogMeta.cachedInputPricePerMillion === 'number')
      ? catalogMeta.cachedInputPricePerMillion
      : (serverUsage && typeof serverUsage.cachedInputPricePerMillion === 'number')
        ? serverUsage.cachedInputPricePerMillion
        : null;

    if (inputCostPerM === null) {
      inputCostPerM = 0.25;
      var modelHint = String((agent && agent.model) || (serverUsage && serverUsage.model) || '').toLowerCase();
      if (modelHint.indexOf('opus') >= 0 || modelHint.indexOf('gpt-5') >= 0 || modelHint.indexOf('pro') >= 0) inputCostPerM = 2.5;
      else if (modelHint.indexOf('sonnet') >= 0 || modelHint.indexOf('gpt-4') >= 0) inputCostPerM = 1.0;
      else if (modelHint.indexOf('flash') >= 0 || modelHint.indexOf('mini') >= 0 || modelHint.indexOf('deepseek') >= 0) inputCostPerM = 0.15;
    }
    if (outputCostPerM === null) outputCostPerM = inputCostPerM * 3;
    if (cachedCostPerM === null) cachedCostPerM = inputCostPerM;

    var serverCostUsd = serverUsage && typeof serverUsage.costUsd === 'number' ? serverUsage.costUsd : 0;
    var delegatedSpendUsd = Math.max(subTotalSpendUsd, missionSpendUsd);
    var recordedCostUsd = Math.max(serverCostUsd, delegatedSpendUsd);
    var catalogTokenCostUsd = 0;
    if (hasRealTokens) {
      var uncachedInput = Math.max(0, inputTokens - cachedTokens);
      catalogTokenCostUsd = (uncachedInput / 1000000) * inputCostPerM
        + (cachedTokens / 1000000) * cachedCostPerM
        + (outputTokens / 1000000) * outputCostPerM;
    }
    var hasRealSpend = recordedCostUsd > 0 || hasRealTokens || (serverUsage && Number(serverUsage.turns) > 0);
    var costUsd = recordedCostUsd > 0
      ? recordedCostUsd
      : hasRealTokens
        ? catalogTokenCostUsd
        : (tokens / 1000000) * inputCostPerM;

    var pct = Math.min(100, Math.round((tokens / Math.max(1, maxTokens)) * 100));
    var modelLabel = (catalogMeta && catalogMeta.displayName)
      || (agent && (agent.model || agent.provider))
      || (serverUsage && (serverUsage.modelLabel || serverUsage.model || serverUsage.provider))
      || 'Default model';
    var budgetMaxCostUsd = (serverUsage && typeof serverUsage.budgetMaxCostUsd === 'number')
      ? serverUsage.budgetMaxCostUsd
      : (missionMaxBudgetUsd > 0 ? missionMaxBudgetUsd : null);

    var isCredits = Boolean(
      (serverUsage && (serverUsage.isCredits || /pikrouter|pikprovider|^pik$/i.test(serverUsage.provider || ''))) ||
      (agent && /pikrouter|pikprovider|^pik$/i.test(agent.provider || '')) ||
      (typeof window !== 'undefined' && (window.__pikRouterActive || (window.__pikRouterCredits && window.__pikRouterCredits.balance !== undefined)))
    );
    var creditsUsed = 0;
    var creditsBalance = null;
    var creditRate = (serverUsage && serverUsage.creditRate)
      || (typeof window !== 'undefined' && window.__pikRouterCredits && window.__pikRouterCredits.creditRate)
      || '100 Credits = $1.00 USD';
    var costFormatted = '';

    if (isCredits) {
      if (serverUsage && typeof serverUsage.creditsUsed === 'number') {
        creditsUsed = serverUsage.creditsUsed;
      } else {
        var rawCredits = costUsd * 100;
        creditsUsed = rawCredits < 0.01 && rawCredits > 0 ? Number(rawCredits.toFixed(4)) : Number(rawCredits.toFixed(2));
      }
      if (serverUsage && typeof serverUsage.creditsBalance === 'number') {
        creditsBalance = serverUsage.creditsBalance;
      } else if (typeof window !== 'undefined' && window.__pikRouterCredits && typeof window.__pikRouterCredits.balance === 'number') {
        creditsBalance = window.__pikRouterCredits.available !== undefined ? window.__pikRouterCredits.available : window.__pikRouterCredits.balance;
      }
      var usageStr = cwFormatCredits(creditsUsed);
      if (creditsBalance !== null && creditsBalance !== undefined) {
        costFormatted = usageStr + ' (' + cwFormatCredits(creditsBalance, { includeUnit: false }) + ' left)';
      } else {
        costFormatted = usageStr;
      }
    } else {
      costFormatted = cwFormatUsd(costUsd);
    }

    return {
      tokens: tokens,
      inputTokens: inputTokens,
      outputTokens: outputTokens,
      cachedTokens: cachedTokens,
      maxTokens: maxTokens,
      percent: pct,
      costUsd: costUsd,
      costFormatted: costFormatted,
      budgetMaxCostUsd: budgetMaxCostUsd,
      isReal: Boolean(hasRealSpend),
      modelLabel: modelLabel,
      isCredits: isCredits,
      creditsUsed: creditsUsed,
      creditsBalance: creditsBalance,
      creditRate: creditRate
    };
  }

  function cwRenderContextMeter() {
    var host = $('cwPlusContext') || $('cwContextBar');
    if (!host) return;
    var cw = cwEnsure();
    var conv = typeof cwActiveConv === 'function' ? cwActiveConv() : null;
    if (!conv || cw.profileOpen || cw.connectionsOpen) {
      host.hidden = true;
      return;
    }
    host.hidden = false;
    var usage = cwEstimateContextUsage();
    var tone = usage.percent >= 85 ? ' high' : usage.percent >= 65 ? ' warn' : '';
    var tokLabel = usage.tokens >= 1000 ? (usage.tokens / 1000).toFixed(1) + 'k' : String(usage.tokens);
    var maxLabel = usage.maxTokens >= 1000 ? Math.round(usage.maxTokens / 1000) + 'k' : String(usage.maxTokens);
    var titleParts = [
      (usage.isReal ? 'Live Cowork usage' : 'Estimated context usage') + ' (' + usage.modelLabel + ')',
      'Context window: ' + usage.tokens + ' / ' + usage.maxTokens + ' tokens (' + usage.percent + '%)'
    ];
    if (usage.inputTokens || usage.outputTokens) {
      titleParts.push('Tokens: ' + usage.inputTokens + ' in / ' + usage.outputTokens + ' out' + (usage.cachedTokens ? ' (' + usage.cachedTokens + ' cached)' : ''));
    }
    if (usage.isCredits) {
      var creditsTitle = 'PikRouter Credits: ' + cwFormatCredits(usage.creditsUsed) + ' used';
      if (usage.creditsBalance !== null && usage.creditsBalance !== undefined) {
        creditsTitle += ' · ' + cwFormatCredits(usage.creditsBalance) + ' remaining balance';
      }
      creditsTitle += ' (Rate: ' + (usage.creditRate || '100 Credits = $1.00 USD') + ') · Click "Top up" to add credits';
      titleParts.push(creditsTitle);
    } else if (usage.budgetMaxCostUsd) {
      titleParts.push('Spend: ' + usage.costFormatted + ' / $' + Number(usage.budgetMaxCostUsd).toFixed(2) + ' budget');
    } else {
      titleParts.push('Price: ' + usage.costFormatted + (usage.isReal ? ' actual' : ' est.'));
    }
    var topupBtn = usage.isCredits ? ' · <button type="button" class="cw-topup-link" id="cwMeterTopup" style="background:none;border:none;color:var(--accent,#8f80ff);font-weight:600;cursor:pointer;padding:0;text-decoration:underline" title="Top up PikRouter credits">Top up</button>' : '';
    host.innerHTML =
      '<div class="cw-context-pill" title="' + esc(titleParts.join(' · ')) + '">' +
        '<span class="cw-context-meter-track"><span class="cw-context-meter-fill' + tone + '" style="width:' + usage.percent + '%"></span></span>' +
        '<span>' + esc(tokLabel) + '/' + esc(maxLabel) + ' tok · ' + usage.percent + '% · ' + esc(usage.costFormatted) + topupBtn + '</span>' +
      '</div>';
    var topupEl = $('cwMeterTopup');
    if (topupEl) {
      topupEl.onclick = function (e) {
        e.stopPropagation();
        if (typeof openPikRouterTopup === 'function') openPikRouterTopup();
        else window.location.href = 'https://pikpam.com/oauth/topup?client_id=client_gitu_agent&redirect_uri=' + encodeURIComponent(window.location.origin + window.location.pathname);
      };
    }
  }

  function cwExtractCitations(message) {
    if (!message || message.role === 'user' || message.role === 'system') return [];
    var text = String(message.text || '');
    var seen = Object.create(null);
    var citations = [];
    function add(kind, label, target) {
      var key = kind + ':' + label;
      if (!label || seen[key] || citations.length >= 6) return;
      seen[key] = true;
      citations.push({ kind: kind, label: label, target: target || label });
    }
    var urlMatches = text.match(/https?:\/\/[^\s<>"\x60)\]]+/g) || [];
    urlMatches.forEach(function (raw) {
      var clean = raw.replace(/[.,;!?\])}]+$/, '');
      try {
        var u = new URL(clean);
        add('Web', u.hostname.replace(/^www\./, ''), u.href);
      } catch (e) {}
    });
    var fileMatches = text.match(/(?:^|[\s\x60(])((?:src|tests|docs|packages|scripts)\/[A-Za-z0-9_./-]+\.[A-Za-z0-9]+)/g) || [];
    fileMatches.forEach(function (raw) {
      var path = raw.replace(/^[\s\x60(]+/, '');
      add('File', path, path);
    });
    return citations;
  }

  function cwCitationsHtml(message) {
    var list = cwExtractCitations(message);
    if (!list.length) return '';
    return '<div class="cw-citations" aria-label="Grounded sources">' + list.map(function (item) {
      if (item.kind === 'Web' && /^https?:\/\//i.test(item.target)) {
        return '<a class="cw-citation-chip" href="' + esc(item.target) + '" target="_blank" rel="noopener noreferrer" title="' + esc(item.target) + '"><span class="cw-citation-kind">Web</span><span>' + esc(item.label) + '</span></a>';
      }
      return '<button type="button" class="cw-citation-chip" data-cwcitation="' + esc(item.target) + '" data-cwcitation-kind="' + esc(item.kind) + '" title="Inspect source: ' + esc(item.target) + '"><span class="cw-citation-kind">' + esc(item.kind) + '</span><span>' + esc(item.label) + '</span></button>';
    }).join('') + '</div>';
  }

  function cwBindCitations(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll('[data-cwcitation]').forEach(function (btn) {
      btn.onclick = function () {
        var target = btn.getAttribute('data-cwcitation') || '';
        var kind = btn.getAttribute('data-cwcitation-kind') || 'Source';
        cwOpenWorkbench({
          title: kind + ' Source · ' + target,
          content: '# Source Inspection\n\n- **Type:** ' + kind + '\n- **Reference:** \x60' + target + '\x60\n\nAsk your teammate to inspect or modify \x60' + target + '\x60 directly from the workbench.'
        });
      };
    });
  }

  function cwBranchFromStep(stepIndex) {
    var cw = cwEnsure();
    var steps = (cw.workHistory || []).slice().reverse();
    var step = steps[stepIndex];
    if (!step) return;
    var title = typeof cwToolActivityTitle === 'function' ? cwToolActivityTitle(step.tool) : String(step.tool || 'Action');
    var status = step.ok ? 'Completed' : 'Failed';
    var summary = step.publicUpdate ? ' — "' + String(step.publicUpdate).slice(0, 140) + '"' : '';
    var input = $('cwInput');
    if (!input) return;
    var prefix = '[Branch from step: ' + title + ' (' + status + ')' + summary + ']\nContinue from this step and ';
    input.value = input.value ? input.value + '\n' + prefix : prefix;
    if (input.style) {
      input.style.height = 'auto';
      if (input.scrollHeight) input.style.height = Math.min(160, input.scrollHeight) + 'px';
    }
    if (typeof cwSaveDraft === 'function') cwSaveDraft();
    if (typeof cwRenderComposerAction === 'function') cwRenderComposerAction();
    if (typeof input.focus === 'function') input.focus();
    if (typeof toast === 'function') toast('Branched from step: ' + title);
  }

  function cwBindWorkHistoryBranching(root) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll('[data-cwbranch-step]').forEach(function (btn) {
      btn.onclick = function (e) {
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        var idx = Number(btn.getAttribute('data-cwbranch-step') || 0);
        cwBranchFromStep(idx);
      };
    });
  }

  function cwEnsureWorkbench() {
    var cw = cwEnsure();
    if (!cw.workbench) {
      cw.workbench = { open: false, activeIndex: 0, showDiff: false, items: [] };
    }
    return cw.workbench;
  }

  function cwComputeLineDiff(prevText, nextText) {
    var a = String(prevText || '').split('\n');
    var b = String(nextText || '').split('\n');
    var max = Math.max(a.length, b.length);
    var out = [];
    for (var i = 0; i < max; i++) {
      if (a[i] === b[i]) {
        if (a[i] !== undefined) out.push('  ' + a[i]);
      } else {
        if (a[i] !== undefined) out.push('- ' + a[i]);
        if (b[i] !== undefined) out.push('+ ' + b[i]);
      }
    }
    return out.join('\n');
  }

  function cwOpenWorkbench(entry) {
    var wb = cwEnsureWorkbench();
    if (entry && entry.content !== undefined) {
      var prev = wb.items.length ? wb.items[wb.items.length - 1].content : '';
      wb.items.push({
        id: entry.id || ('wb-' + (wb.items.length + 1)),
        title: entry.title || ('Revision ' + (wb.items.length + 1)),
        content: String(entry.content || ''),
        previousContent: prev,
        ts: new Date().toISOString()
      });
      wb.activeIndex = wb.items.length - 1;
    } else if (!wb.items.length) {
      var cw = cwEnsure();
      var lastAgentMsg = (cw.msgs || []).slice().reverse().find(function (m) { return m.role === 'agent'; });
      wb.items.push({
        id: (lastAgentMsg && lastAgentMsg.id) || 'wb-1',
        title: lastAgentMsg ? ('Reply from ' + (lastAgentMsg.agentName || 'Teammate')) : 'Scratchpad Draft',
        content: lastAgentMsg ? String(lastAgentMsg.text || '') : '# Live Workbench\n\nDraft reports, code snippets, or instructions side-by-side with your chat.',
        previousContent: '',
        ts: new Date().toISOString()
      });
      wb.activeIndex = 0;
    }
    wb.open = true;
    cwRenderWorkbench();
  }

  function cwToggleWorkbench() {
    var wb = cwEnsureWorkbench();
    if (wb.open) {
      wb.open = false;
      cwRenderWorkbench();
    } else {
      cwOpenWorkbench();
    }
  }

  function cwCodingStatusInfo(status, needsAttention) {
    var s = String(status || 'running').toLowerCase();
    if (needsAttention) return { label: 'Needs response', tone: 'warn', active: true };
    if (s === 'waiting_for_model') return { label: 'Waiting for model', tone: 'warn', active: true };
    if (s === 'running') return { label: 'Coding live', tone: 'live', active: true };
    if (s === 'failed' || s === 'error') return { label: 'Failed', tone: 'fail', active: false };
    if (s === 'blocked' || s === 'denied') return { label: 'Blocked', tone: 'warn', active: false };
    if (s === 'stopped' || s === 'aborted' || s === 'cancelled') return { label: 'Stopped', tone: 'warn', active: false };
    return { label: 'Done', tone: 'done', active: false };
  }

  function cwEscapeCodeFence(text) {
    var tick = String.fromCharCode(96);
    var fence = tick + tick + tick;
    var parts = String(text || '').split(fence);
    var out = '';
    for (var i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        var block = parts[i].replace(/^[a-z0-9_-]{1,20}\r?\n/i, '');
        out += '<pre>' + esc(block.trim()) + '</pre>';
      } else {
        var seg = esc(parts[i]);
        var codeRe = new RegExp(tick + '([^' + tick + '\\n]+)' + tick, 'g');
        seg = seg.replace(codeRe, '<code>$1</code>');
        seg = seg.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
        seg = seg.replace(/\r?\n/g, '<br>');
        out += seg;
      }
    }
    return out;
  }

  function cwFormatCodingReport(report) {
    if (!report) return null;
    if (typeof report === 'string') {
      var trimmed = report.trim();
      return trimmed ? { summary: trimmed, verification: [], risks: [], files: [] } : null;
    }
    if (typeof report !== 'object') return null;
    var sum = typeof report.summary === 'string' ? report.summary.trim() : '';
    var idx = sum.indexOf('\nCHANGES:');
    if (idx > 0) sum = sum.slice(0, idx).trim();
    var ver = Array.isArray(report.verification) ? report.verification.map(function (v) { return String(v || '').trim(); }).filter(Boolean) : [];
    var risks = Array.isArray(report.remainingRisks) ? report.remainingRisks.map(function (r) { return String(r || '').trim(); }).filter(Boolean) : [];
    var files = Array.isArray(report.filesChanged) ? report.filesChanged.map(function (f) { return String(f || '').trim(); }).filter(Boolean) : [];
    if (!sum && !ver.length && !risks.length && !files.length) return null;
    return { summary: sum, verification: ver, risks: risks, files: files };
  }

  function cwCodingToolMeta(rawBody) {
    var body = String(rawBody || '').trim();
    var idx = body.indexOf(' — ');
    var summary = (idx >= 0 ? body.slice(0, idx) : body).trim();
    var reason = idx >= 0 ? body.slice(idx + 3).trim() : '';
    var kind = 'tool';
    var ico = '◇';
    var label = summary || 'Tool action';
    if (summary.indexOf('$ ') === 0) {
      kind = 'shell';
      ico = '>_';
      var cmd = summary.slice(2).trim();
      label = cmd ? 'Ran ' + cmd : 'Ran command';
    } else if (/^(?:write|edit|update|patch|append|create)\s+/i.test(summary)) {
      kind = 'edit';
      ico = '±';
      var target = summary.replace(/^(?:write|edit|update|patch|append|create)\s+/i, '').trim();
      label = target ? 'Edited ' + target : 'Edited file';
    } else if (/^(?:read|view|inspect|open)\s+/i.test(summary)) {
      kind = 'read';
      ico = '≡';
      var rTarget = summary.replace(/^(?:read|view|inspect|open)\s+/i, '').trim();
      label = rTarget ? 'Read ' + rTarget : 'Read file';
    } else if (/^(?:search|grep|rg|find)\s+/i.test(summary)) {
      kind = 'search';
      ico = '⌕';
      label = 'Searched ' + summary.replace(/^(?:search|grep|rg|find)\s+/i, '').trim();
    } else if (/^(?:list|ls|tree|dir)\b/i.test(summary)) {
      kind = 'list';
      ico = '▤';
      label = summary;
    } else if (/^(?:browser|browse|navigate|click)\b/i.test(summary)) {
      kind = 'browser';
      ico = '◎';
      label = summary;
    }
    return { kind: kind, ico: ico, summary: summary, reason: reason, label: label };
  }

  function cwNormalizeToolKey(text) {
    return String(text || '').trim().replace(/^\$\s+/, '').replace(/^(?:write|edit|update|patch|read|search)\s+/i, '').replace(/\s+\(\d+ms\)$/, '').toLowerCase();
  }

  function cwTrimToolOutput(raw) {
    var s = String(raw || '').replace(/ ⏎ /g, '\n').trim();
    if (!s) return '';
    var lines = s.split('\n');
    if (lines.length > 60) s = '...\n' + lines.slice(-60).join('\n');
    if (s.length > 4000) s = '...\n' + s.slice(-4000);
    return s;
  }

  function cwPushCodingFeed(entry, item) {
    if (!entry) return item;
    entry.feedItems = entry.feedItems || [];
    entry.feedItems.push(item);
    if (entry.feedItems.length > 180) entry.feedItems = entry.feedItems.slice(-180);
    return item;
  }

  function cwFindCodingStep(entry, hint, allowSettled) {
    if (!entry || !Array.isArray(entry.feedItems)) return null;
    var key = cwNormalizeToolKey(hint);
    for (var i = entry.feedItems.length - 1; i >= 0; i--) {
      var it = entry.feedItems[i];
      if (!it || it.kind !== 'step') continue;
      if (!allowSettled && it.status !== 'running') continue;
      if (!key || cwNormalizeToolKey(it.summary) === key || cwNormalizeToolKey(it.path) === key) return it;
    }
    if (key) {
      for (var j = entry.feedItems.length - 1; j >= 0; j--) {
        var it2 = entry.feedItems[j];
        if (!it2 || it2.kind !== 'step') continue;
        if (!allowSettled && it2.status !== 'running') continue;
        var sKey = cwNormalizeToolKey(it2.summary);
        if (sKey.indexOf(key) >= 0 || key.indexOf(sKey) >= 0) return it2;
      }
    }
    for (var k = entry.feedItems.length - 1; k >= 0; k--) {
      var it3 = entry.feedItems[k];
      if (it3 && it3.kind === 'step' && (allowSettled || it3.status === 'running')) return it3;
    }
    return null;
  }

  function cwAddCodingFile(entry, filePath) {
    var clean = String(filePath || '').trim();
    if (!clean || !entry) return;
    entry.files = entry.files || [];
    for (var i = 0; i < entry.files.length; i++) {
      var existing = entry.files[i];
      var p = (existing && (existing.path || existing.name || existing.id)) || String(existing || '');
      if (p === clean) return;
    }
    entry.files.push({ path: clean });
  }

  function cwStopCodingStream() {
    var wb = cwEnsureWorkbench();
    if (wb._reconnectTimer && typeof clearTimeout === 'function') {
      clearTimeout(wb._reconnectTimer);
      wb._reconnectTimer = null;
    }
    if (wb._runEs) {
      try { wb._runEs.close(); } catch (e) {}
      wb._runEs = null;
    }
    wb._runStreamId = null;
    wb._streamNotice = '';
  }

  function cwSyncCodingWorkbenchStatus(tasks) {
    var wb = cwEnsureWorkbench();
    if (!wb.open || !Array.isArray(wb.items) || !Array.isArray(tasks)) return;
    var current = wb.items[wb.activeIndex];
    if (!current || !current.runId) return;
    var match = null;
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i] && tasks[i].runId === current.runId) { match = tasks[i]; break; }
    }
    if (!match) return;
    var changed = current.status !== match.status || Boolean(current.needsAttention) !== Boolean(match.needsAttention);
    if (!changed) return;
    var wasActive = cwCodingStatusInfo(current.status, current.needsAttention).active;
    current.status = match.status || current.status;
    current.needsAttention = Boolean(match.needsAttention);
    var st = cwCodingStatusInfo(current.status, current.needsAttention);
    current.title = 'Code: ' + (current.project || 'Workspace') + ' (' + st.label + ')';
    cwRefreshCodingView(current, false);
    if (wasActive && !st.active) cwRefreshCodingRunDetails(current);
  }

  function cwRefreshCodingRunDetails(entry) {
    if (!entry || !entry.runId || entry._fetchingSummary || typeof api !== 'function') return;
    entry._fetchingSummary = true;
    api('/api/runs/' + encodeURIComponent(entry.runId)).then(function (task) {
      entry._fetchingSummary = false;
      if (!task) return;
      entry.status = task.status || entry.status;
      entry.needsAttention = Boolean(task.needsAttention);
      if (task.error !== undefined) entry.error = task.error || '';
      if (task.report !== undefined) entry.report = task.report;
      if (Array.isArray(task.files) && task.files.length) entry.files = task.files;
      if (Array.isArray(task.pendingApprovals)) entry.pendingApprovals = task.pendingApprovals;
      if (task.pendingPlanReview !== undefined) entry.pendingPlanReview = task.pendingPlanReview;
      if (task.pendingQuestions !== undefined) entry.pendingQuestions = task.pendingQuestions;
      var st = cwCodingStatusInfo(entry.status, entry.needsAttention);
      entry.title = 'Code: ' + (entry.project || 'Workspace') + ' (' + st.label + ')';
      cwRefreshCodingView(entry, false);
      if (typeof cwRenderRailCoding === 'function') cwRenderRailCoding();
    }).catch(function () {
      entry._fetchingSummary = false;
    });
  }

  function cwBindCodingFeedActions(feedEl, entry) {
    if (!feedEl || typeof feedEl.querySelectorAll !== 'function') return;
    var apprBtns = feedEl.querySelectorAll('[data-cw-appr]');
    for (var i = 0; i < apprBtns.length; i++) {
      (function (btn) {
        btn.onclick = function () {
          var apprId = btn.getAttribute('data-cw-appr');
          var ok = btn.getAttribute('data-cw-ok') === '1';
          if (!apprId || typeof api !== 'function') return;
          btn.disabled = true;
          api('/api/approvals/' + encodeURIComponent(apprId), {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ approved: ok })
          }).then(function () {
            entry.pendingApprovals = (entry.pendingApprovals || []).filter(function (a) { return a && a.id !== apprId; });
            cwRefreshCodingView(entry, false);
          }).catch(function (err) {
            btn.disabled = false;
            if (typeof toast === 'function') toast((err && err.message) || 'Approval failed', true);
          });
        };
      })(apprBtns[i]);
    }
    var fullBtns = feedEl.querySelectorAll('[data-cw-open-run]');
    for (var j = 0; j < fullBtns.length; j++) {
      fullBtns[j].onclick = function () {
        if (typeof openRun === 'function') openRun(entry.runId);
      };
    }
  }

  function cwBuildCodingMetaHtml(entry) {
    var st = cwCodingStatusInfo(entry.status, entry.needsAttention);
    var wb = cwEnsureWorkbench();
    var left = '<span class="cw-wb-status is-' + esc(st.tone) + '">' + esc(st.label) + '</span>';
    if (entry.project) left += '<span class="cw-wb-pill" title="' + esc(entry.projectPath || entry.project) + '">' + esc(entry.project) + '</span>';
    if (entry.branch) left += '<span class="cw-wb-pill">' + esc(entry.branch) + '</span>';
    if (entry.mode) left += '<span class="cw-wb-pill">' + esc(entry.mode) + '</span>';
    if (wb._streamNotice) left += '<span class="cw-wb-pill">' + esc(wb._streamNotice) + '</span>';
    var right = '';
    if (wb.items && wb.items.length > 1) {
      right += '<select id="cwWbVersion" aria-label="Workbench version">' + wb.items.map(function (it, idx) {
        return '<option value="' + idx + '"' + (idx === wb.activeIndex ? ' selected' : '') + '>' + esc(it.title) + '</option>';
      }).join('') + '</select>';
    }
    return '<div class="cw-wb-meta-left">' + left + '</div>' + (right ? '<div class="cw-wb-meta-right">' + right + '</div>' : '');
  }

  function cwRenderCodingFeedHtml(entry) {
    var parts = [];
    if (entry.goal) {
      parts.push(
        '<div class="cw-wb-msg is-user">' +
          '<div class="cw-wb-msg-head"><span>You · Goal</span></div>' +
          '<div class="cw-wb-msg-body">' + cwEscapeCodeFence(entry.goal) + '</div>' +
        '</div>'
      );
    }
    if (entry.reasoningText && entry.reasoningText.trim()) {
      var rt = entry.reasoningText.trim();
      parts.push(
        '<details class="cw-wb-think" data-step-key="think">' +
          '<summary>Thought process (' + rt.length + ' chars)</summary>' +
          '<pre>' + esc(rt) + '</pre>' +
        '</details>'
      );
    }
    var items = entry.feedItems || [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it) continue;
      if (it.kind === 'user') {
        parts.push(
          '<div class="cw-wb-msg is-user">' +
            '<div class="cw-wb-msg-head"><span>You</span></div>' +
            '<div class="cw-wb-msg-body">' + cwEscapeCodeFence(it.text || '') + '</div>' +
          '</div>'
        );
      } else if (it.kind === 'agent') {
        parts.push(
          '<div class="cw-wb-msg is-agent">' +
            '<div class="cw-wb-msg-head"><span>Agent Gitu</span></div>' +
            '<div class="cw-wb-msg-body">' + cwEscapeCodeFence(it.text || '') + '</div>' +
          '</div>'
        );
      } else if (it.kind === 'step') {
        var cls = 'cw-wb-step is-' + esc(it.status || 'running');
        var stateTxt = it.status === 'running' ? 'Running' : (it.status === 'error' ? 'Failed' : (it.status === 'blocked' ? 'Blocked' : 'Done'));
        if (typeof it.exitCode === 'number' && it.exitCode !== 0 && it.status === 'error') stateTxt = 'Exit ' + it.exitCode;
        var diffBadge = '';
        if (it.added || it.removed) {
          diffBadge = '<span class="cw-wb-diffstat">' +
            (it.added ? '<span class="add">+' + it.added + '</span>' : '') +
            (it.removed ? '<span class="del">-' + it.removed + '</span>' : '') +
          '</span>';
        }
        var detailsHtml = '';
        if (Array.isArray(it.diff) && it.diff.length) {
          var diffRows = '';
          for (var d = 0; d < it.diff.length && d < 120; d++) {
            var dl = it.diff[d] || {};
            var dCls = dl.kind === 'add' ? 'add' : (dl.kind === 'remove' ? 'remove' : 'context');
            var prefix = dl.kind === 'add' ? '+' : (dl.kind === 'remove' ? '-' : ' ');
            diffRows += '<div class="cw-wb-dline ' + dCls + '"><span class="ln">' + esc(dl.newLine || dl.oldLine || '') + '</span><span>' + esc(prefix + (dl.text || '')) + '</span></div>';
          }
          detailsHtml = '<details class="cw-wb-step-details" data-step-key="step-' + esc(it.id) + '"><summary>View diff</summary><div class="cw-wb-diffbox">' + diffRows + '</div></details>';
        } else if (it.output) {
          detailsHtml = '<details class="cw-wb-step-details" data-step-key="step-' + esc(it.id) + '"><summary>View output</summary><pre class="cw-wb-step-pre">' + esc(it.output) + '</pre></details>';
        }
        parts.push(
          '<div class="' + cls + '">' +
            '<div class="cw-wb-step-row">' +
              '<span class="cw-wb-step-ico" aria-hidden="true">' + esc(it.ico || '◇') + '</span>' +
              '<span class="cw-wb-step-title" title="' + esc(it.summary || it.label || '') + '">' + esc(it.label || it.summary || 'Action') + '</span>' +
              diffBadge +
              '<span class="cw-wb-step-state">' + esc(stateTxt) + '</span>' +
            '</div>' +
            (it.reason ? '<div class="cw-wb-step-why">' + esc(it.reason) + '</div>' : '') +
            detailsHtml +
          '</div>'
        );
      } else if (it.kind === 'note') {
        var nCls = 'cw-wb-note' + (it.tone ? ' is-' + esc(it.tone) : '');
        parts.push('<div class="' + nCls + '"><strong>' + esc(it.label || 'Update') + '</strong><span>' + esc(it.text || '') + '</span></div>');
      }
    }
    if (entry.streamText && entry.streamText.trim()) {
      var stLabel = entry.streamKind === 'thinking' ? 'Agent Gitu · thinking' : 'Agent Gitu · writing';
      parts.push(
        '<div class="cw-wb-msg is-agent is-streaming">' +
          '<div class="cw-wb-msg-head"><span>' + esc(stLabel) + '</span></div>' +
          '<div class="cw-wb-msg-body"><span id="cwWbStreamTxt">' + cwEscapeCodeFence(entry.streamText) + '</span><span class="cw-wb-caret" aria-hidden="true"></span></div>' +
        '</div>'
      );
    }
    var approvals = Array.isArray(entry.pendingApprovals) ? entry.pendingApprovals : [];
    for (var a = 0; a < approvals.length; a++) {
      var ap = approvals[a];
      if (!ap) continue;
      parts.push(
        '<div class="cw-wb-gate">' +
          '<strong>Approval needed: ' + esc(ap.tool || 'Action') + '</strong>' +
          '<div>' + esc(ap.why || ap.summary || 'Waiting for your approval before continuing.') + '</div>' +
          '<div class="cw-wb-gate-actions">' +
            '<button type="button" class="btn dark" data-cw-appr="' + esc(ap.id) + '" data-cw-ok="1">Approve</button>' +
            '<button type="button" class="btn ghost" data-cw-appr="' + esc(ap.id) + '" data-cw-ok="0">Deny</button>' +
          '</div>' +
        '</div>'
      );
    }
    if (entry.pendingPlanReview) {
      parts.push(
        '<div class="cw-wb-gate">' +
          '<strong>Plan ready for review</strong>' +
          '<div>Review and approve the plan before implementation begins.</div>' +
          (typeof openRun === 'function' ? '<div class="cw-wb-gate-actions"><button type="button" class="btn dark" data-cw-open-run="1">Review plan in full view</button></div>' : '') +
        '</div>'
      );
    }
    if (entry.pendingQuestions) {
      var qFirst = entry.pendingQuestions.questions && entry.pendingQuestions.questions[0];
      var qText = typeof qFirst === 'string' ? qFirst : (qFirst && qFirst.question) || 'The coding agent has a question for you.';
      parts.push(
        '<div class="cw-wb-gate">' +
          '<strong>Agent needs your input</strong>' +
          '<div>' + esc(qText) + '</div>' +
          (typeof openRun === 'function' ? '<div class="cw-wb-gate-actions"><button type="button" class="btn dark" data-cw-open-run="1">Answer in full view</button></div>' : '') +
        '</div>'
      );
    }
    if (entry.error) {
      parts.push('<div class="cw-wb-note is-fail"><strong>Error</strong><span>' + esc(entry.error) + '</span></div>');
    }
    var rep = cwFormatCodingReport(entry.report);
    var fileList = (entry.files && entry.files.length) ? entry.files : ((rep && rep.files.length) ? rep.files.map(function (p) { return { path: p }; }) : []);
    if (rep || fileList.length) {
      var repHtml = '<div class="cw-wb-report">';
      if (rep && rep.summary) repHtml += '<div class="cw-wb-msg-head"><span>Summary</span></div><div class="cw-wb-msg-body">' + cwEscapeCodeFence(rep.summary) + '</div>';
      if (rep && rep.verification.length) {
        repHtml += '<div><strong>Checks:</strong> ' + esc(rep.verification.join(' · ')) + '</div>';
      }
      if (fileList.length) {
        repHtml += '<div class="cw-wb-msg-head"><span>Files (' + fileList.length + ')</span></div><div class="cw-wb-filechips">';
        for (var f = 0; f < fileList.length && f < 24; f++) {
          var fp = fileList[f];
          var fn = (fp && (fp.path || fp.name || fp.id)) || String(fp || '');
          if (fn) repHtml += '<span class="cw-wb-filechip">' + esc(fn) + '</span>';
        }
        repHtml += '</div>';
      }
      repHtml += '</div>';
      parts.push(repHtml);
    }
    if (!items.length && !entry.streamText && !rep && !fileList.length && !entry.error) {
      var liveSt = cwCodingStatusInfo(entry.status, entry.needsAttention);
      parts.push('<div class="cw-wb-empty">' + esc(liveSt.active ? 'Connected — waiting for the next coding step…' : 'No streamed steps recorded for this run yet.') + '</div>');
    }
    return parts.join('');
  }

  function cwRefreshCodingView(entry, deltaOnly) {
    var wb = cwEnsureWorkbench();
    var pane = $('cwWorkbench');
    if (!pane || !wb.open) return;
    var current = wb.items[wb.activeIndex];
    if (!current || !current.runId || (entry && current.runId !== entry.runId)) return;
    var feedEl = $('cwWbFeed');
    if (!feedEl) {
      cwRenderWorkbench();
      return;
    }
    if (deltaOnly) {
      var streamTxt = $('cwWbStreamTxt');
      if (streamTxt) {
        streamTxt.innerHTML = cwEscapeCodeFence(current.streamText || '');
        var nearB = (feedEl.scrollHeight - feedEl.scrollTop - feedEl.clientHeight) < 56;
        if (nearB) feedEl.scrollTop = feedEl.scrollHeight;
        return;
      }
    }
    var openKeys = {};
    if (typeof feedEl.querySelectorAll === 'function') {
      var openEls = feedEl.querySelectorAll('details[open][data-step-key]');
      for (var i = 0; i < openEls.length; i++) {
        var k = openEls[i].getAttribute('data-step-key');
        if (k) openKeys[k] = true;
      }
    }
    var nearBottom = (feedEl.scrollHeight - feedEl.scrollTop - feedEl.clientHeight) < 56;
    var metaEl = $('cwWbMeta');
    if (metaEl) metaEl.innerHTML = cwBuildCodingMetaHtml(current);
    var verSel = $('cwWbVersion');
    if (verSel) verSel.onchange = function () { wb.activeIndex = Number(verSel.value) || 0; cwRenderWorkbench(); };
    feedEl.innerHTML = cwRenderCodingFeedHtml(current);
    cwBindCodingFeedActions(feedEl, current);
    if (typeof feedEl.querySelectorAll === 'function') {
      var dets = feedEl.querySelectorAll('details[data-step-key]');
      for (var j = 0; j < dets.length; j++) {
        if (openKeys[dets[j].getAttribute('data-step-key')]) dets[j].open = true;
      }
    }
    if (nearBottom) feedEl.scrollTop = feedEl.scrollHeight;
  }

  function cwIngestCodingEvent(entry, ev) {
    if (!entry || !ev) return;
    if (ev.i != null) {
      entry._seenIds = entry._seenIds || {};
      if (entry._seenIds[ev.i]) return;
      entry._seenIds[ev.i] = true;
    }
    if (ev.i == null && ev.typed) {
      var tp = ev.typed;
      if (tp.type === 'reasoning' && tp.text) {
        entry.reasoningText = String(tp.text);
        cwRefreshCodingView(entry, false);
        return;
      }
      if (tp.type === 'file_changed' && tp.path) {
        cwAddCodingFile(entry, tp.path);
        var editStep = cwFindCodingStep(entry, tp.path, true);
        if (editStep && editStep.kind === 'edit') {
          if (typeof tp.linesAdded === 'number') editStep.added = tp.linesAdded;
          if (typeof tp.linesRemoved === 'number') editStep.removed = tp.linesRemoved;
          if (Array.isArray(tp.diff) && tp.diff.length) editStep.diff = tp.diff;
        } else {
          cwPushCodingFeed(entry, {
            kind: 'step',
            id: ++entry._stepCounter,
            toolKind: 'edit',
            ico: '±',
            label: 'Edited ' + tp.path,
            summary: tp.path,
            path: tp.path,
            status: 'done',
            added: typeof tp.linesAdded === 'number' ? tp.linesAdded : 0,
            removed: typeof tp.linesRemoved === 'number' ? tp.linesRemoved : 0,
            diff: Array.isArray(tp.diff) ? tp.diff : null
          });
        }
        cwRefreshCodingView(entry, false);
        return;
      }
      if (tp.type === 'command_finished') {
        var cmdStep = cwFindCodingStep(entry, tp.command || '', true);
        if (cmdStep) {
          cmdStep.status = tp.ok ? 'done' : 'error';
          if (typeof tp.exitCode === 'number') cmdStep.exitCode = tp.exitCode;
          cwRefreshCodingView(entry, false);
        }
        return;
      }
      if (tp.type === 'file_read' && tp.path) {
        cwPushCodingFeed(entry, { kind: 'step', id: ++entry._stepCounter, toolKind: 'read', ico: '≡', label: 'Read ' + tp.path, summary: tp.path, path: tp.path, status: 'done' });
        cwRefreshCodingView(entry, false);
        return;
      }
      if (tp.type === 'test_started' && tp.command) {
        cwPushCodingFeed(entry, { kind: 'step', id: ++entry._stepCounter, toolKind: 'shell', ico: '>_', label: 'Running tests: ' + tp.command, summary: tp.command, status: 'running' });
        cwRefreshCodingView(entry, false);
        return;
      }
      if (tp.type === 'test_finished') {
        var tStep = cwFindCodingStep(entry, tp.command || '', true);
        if (tStep) {
          tStep.status = tp.status === 'passed' ? 'done' : 'error';
        } else {
          cwPushCodingFeed(entry, {
            kind: 'note',
            tone: tp.status === 'passed' ? 'pass' : 'fail',
            label: 'Tests ' + (tp.status || 'finished'),
            text: tp.command || ''
          });
        }
        cwRefreshCodingView(entry, false);
        return;
      }
      if (tp.type === 'policy_denied' || tp.type === 'operation_blocked') {
        cwPushCodingFeed(entry, {
          kind: 'note',
          tone: 'warn',
          label: tp.type === 'policy_denied' ? 'Blocked by policy' : 'Guard notice',
          text: [tp.operation, tp.detail].filter(Boolean).join(' — ') || (tp.reason || 'Action stopped')
        });
        cwRefreshCodingView(entry, false);
        return;
      }
      if (tp.type === 'completed' || tp.type === 'failed') {
        entry.status = tp.type === 'completed' ? 'completed' : 'failed';
        if (tp.reason) entry.error = tp.reason;
        cwRefreshCodingView(entry, false);
        cwRefreshCodingRunDetails(entry);
        return;
      }
      if (ev.restored) return;
      if (tp.type === 'approval_required' && tp.approvalId) {
        entry.pendingApprovals = (entry.pendingApprovals || []).filter(function (a) { return a && a.id !== tp.approvalId; });
        entry.pendingApprovals.push({ id: tp.approvalId, tool: tp.tool, why: tp.why, summary: tp.summary });
        entry.needsAttention = true;
        cwRefreshCodingView(entry, false);
      } else if (tp.type === 'approval_resolved') {
        entry.pendingApprovals = (entry.pendingApprovals || []).filter(function (a) { return a && a.id !== tp.approvalId; });
        entry.needsAttention = entry.pendingApprovals.length > 0 || Boolean(entry.pendingPlanReview) || Boolean(entry.pendingQuestions);
        cwRefreshCodingView(entry, false);
      } else if (tp.type === 'plan_review_requested') {
        entry.pendingPlanReview = { id: tp.requestId, criteria: tp.criteria || [], steps: tp.steps || [] };
        entry.needsAttention = true;
        cwRefreshCodingView(entry, false);
      } else if (tp.type === 'plan_review_resolved') {
        entry.pendingPlanReview = null;
        entry.needsAttention = (entry.pendingApprovals || []).length > 0 || Boolean(entry.pendingQuestions);
        cwRefreshCodingView(entry, false);
      } else if (tp.type === 'questions_requested') {
        entry.pendingQuestions = { id: tp.requestId, questions: tp.questions || [] };
        entry.needsAttention = true;
        cwRefreshCodingView(entry, false);
      } else if (tp.type === 'questions_answered') {
        entry.pendingQuestions = null;
        entry.needsAttention = (entry.pendingApprovals || []).length > 0 || Boolean(entry.pendingPlanReview);
        cwRefreshCodingView(entry, false);
      }
      return;
    }

    var text = String(ev.text || '');
    if (!text) return;
    if (text === 'activity reasoning-reset') { entry.reasoningText = ''; cwRefreshCodingView(entry, false); return; }
    if (text.indexOf('activity reasoning-delta ') === 0) {
      try {
        var rDelta = JSON.parse(text.slice('activity reasoning-delta '.length));
        if (typeof rDelta === 'string') {
          entry.reasoningText = ((entry.reasoningText || '') + rDelta).slice(-16000);
          cwRefreshCodingView(entry, false);
        }
      } catch (e) {}
      return;
    }
    if (text.indexOf('live-chat ') === 0) {
      try {
        var ex = JSON.parse(text.slice(10));
        if (ex && ex.content) {
          cwPushCodingFeed(entry, { kind: ex.role === 'user' ? 'user' : 'agent', text: String(ex.content) });
          cwRefreshCodingView(entry, false);
        }
      } catch (e2) {}
      return;
    }
    if (text.indexOf('tdelta ') === 0 || text.indexOf('thought ') === 0) {
      var isThought = text.indexOf('thought ') === 0;
      var chunk = text.slice(isThought ? 8 : 7);
      if (!entry.streamText && !chunk.trim()) return;
      if (!entry.streamText && /^\s*\{/.test(chunk)) return;
      var hadStream = Boolean(entry.streamText);
      entry.streamText = (entry.streamText || '') + chunk;
      entry.streamKind = isThought ? 'thinking' : 'writing';
      cwRefreshCodingView(entry, hadStream);
      return;
    }
    if (text.indexOf('say ') === 0) {
      var prose = text.slice(4).trim();
      entry.streamText = '';
      if (!prose) { cwRefreshCodingView(entry, false); return; }
      var lastItem = entry.feedItems.length ? entry.feedItems[entry.feedItems.length - 1] : null;
      if (lastItem && lastItem.kind === 'agent' && String(lastItem.text || '').trim() === prose) {
        cwRefreshCodingView(entry, false);
        return;
      }
      cwPushCodingFeed(entry, { kind: 'agent', text: prose });
      cwRefreshCodingView(entry, false);
      return;
    }
    if (text.indexOf('user-msg ') === 0) {
      var uText = text.slice(9).trim();
      if (!uText) return;
      if (entry._lastSteer === uText) { entry._lastSteer = ''; return; }
      cwPushCodingFeed(entry, { kind: 'user', text: uText });
      cwRefreshCodingView(entry, false);
      return;
    }
    if (text.indexOf('run finished: ') === 0) {
      entry.status = text.slice('run finished: '.length).trim() || entry.status;
      var stFin = cwCodingStatusInfo(entry.status, entry.needsAttention);
      entry.title = 'Code: ' + (entry.project || 'Workspace') + ' (' + stFin.label + ')';
      cwRefreshCodingView(entry, false);
      cwRefreshCodingRunDetails(entry);
      return;
    }
    if (text.indexOf('lines ') === 0) {
      var cnt = /\s+\+(\d+)(?:\s+-(\d+))?\s+lines.*$/i.exec(text);
      var lHint = text.slice(6).replace(cnt ? cnt[0] : '', '').trim();
      var stepHit = cwFindCodingStep(entry, lHint, true);
      if (stepHit) {
        if (cnt) {
          stepHit.added = parseInt(cnt[1], 10) || 0;
          stepHit.removed = cnt[2] ? (parseInt(cnt[2], 10) || 0) : 0;
        }
        cwRefreshCodingView(entry, false);
      }
      return;
    }
    var sp = text.indexOf(' ');
    var tag = sp >= 0 ? text.slice(0, sp) : text;
    var body = sp >= 0 ? text.slice(sp + 1).trim() : '';
    if (tag === 'run') {
      var tm = cwCodingToolMeta(body);
      var newStep = {
        kind: 'step',
        id: ++entry._stepCounter,
        toolKind: tm.kind,
        ico: tm.ico,
        label: tm.label,
        summary: tm.summary,
        reason: tm.reason,
        path: tm.kind === 'edit' || tm.kind === 'read' ? tm.summary.replace(/^(?:write|edit|update|patch|append|create|read|view|inspect|open)\s+/i, '').trim() : '',
        status: 'running',
        added: 0,
        removed: 0,
        diff: null,
        output: ''
      };
      if (newStep.toolKind === 'edit' && newStep.path) cwAddCodingFile(entry, newStep.path);
      cwPushCodingFeed(entry, newStep);
      cwRefreshCodingView(entry, false);
      return;
    }
    if (tag === 'ok' || tag === 'error' || tag === 'denied' || tag === 'blocked') {
      var targetStep = cwFindCodingStep(entry, body, false);
      if (targetStep) {
        targetStep.status = tag === 'ok' ? 'done' : (tag === 'denied' || tag === 'blocked' ? 'blocked' : 'error');
        entry._lastOutputStep = targetStep;
        cwRefreshCodingView(entry, false);
      }
      return;
    }
    if (tag === 'out') {
      var outStep = entry._lastOutputStep || cwFindCodingStep(entry, '', true);
      if (outStep) {
        outStep.output = cwTrimToolOutput(body);
        cwRefreshCodingView(entry, false);
      }
      return;
    }
    if (tag === 'evidence') {
      var evPass = ev.typed && ev.typed.type === 'evidence_recorded' ? ev.typed.passed === true : body.indexOf('PASS') >= 0;
      cwPushCodingFeed(entry, { kind: 'note', tone: evPass ? 'pass' : 'fail', label: evPass ? 'Verified' : 'Check failed', text: body });
      cwRefreshCodingView(entry, false);
      return;
    }
    if (tag === 'plan' || tag === 'step' || tag === 'todo' || tag === 'decision' || tag === 'replan' || tag === 'problem' || tag === 'resolved' || tag === 'recover') {
      var lblMap = { plan: 'Plan', step: 'Step', todo: 'Todo', decision: 'Decision', replan: 'Replan', problem: 'Recovery', resolved: 'Resolved', recover: 'Retrying' };
      var tone = tag === 'problem' ? 'warn' : (tag === 'resolved' || tag === 'step' ? 'pass' : '');
      cwPushCodingFeed(entry, { kind: 'note', tone: tone, label: lblMap[tag] || tag, text: body });
      cwRefreshCodingView(entry, false);
    }
  }

  function cwStartCodingStream(entry) {
    if (!entry || !entry.runId || typeof EventSource !== 'function') return;
    var wb = cwEnsureWorkbench();
    if (wb._runEs && wb._runStreamId === entry.runId) return;
    cwStopCodingStream();
    wb._runStreamId = entry.runId;
    var es = new EventSource('/api/runs/' + encodeURIComponent(entry.runId) + '/stream');
    wb._runEs = es;
    if (typeof es.addEventListener === 'function') {
      es.addEventListener('replay-end', function () {
        entry.historyReady = true;
        if (!cwCodingStatusInfo(entry.status, entry.needsAttention).active) {
          cwStopCodingStream();
        }
      });
    }
    es.onmessage = function (msg) {
      if (wb._runEs !== es) return;
      wb._streamNotice = '';
      var ev = null;
      try { ev = JSON.parse(msg && msg.data); } catch (e) { return; }
      cwIngestCodingEvent(entry, ev);
    };
    es.onerror = function () {
      if (wb._runEs !== es) return;
      try { es.close(); } catch (e) {}
      wb._runEs = null;
      var info = cwCodingStatusInfo(entry.status, entry.needsAttention);
      if (!wb.open || wb._runStreamId !== entry.runId || (!info.active && entry.historyReady)) {
        wb._streamNotice = '';
        return;
      }
      wb._streamNotice = 'Reconnecting…';
      cwRefreshCodingView(entry, false);
      if (typeof setTimeout === 'function') {
        wb._reconnectTimer = setTimeout(function () {
          wb._reconnectTimer = null;
          var cur = wb.items && wb.items[wb.activeIndex];
          if (wb.open && cur && cur.runId === entry.runId) {
            cwStartCodingStream(cur);
          }
        }, 2000);
      }
    };
  }

  function cwRenderCodingWorkbench(pane, wb, current) {
    pane.innerHTML =
      '<div class="cw-workbench-head">' +
        '<strong>' + esc(current.title || 'Coding Live') + '</strong>' +
        (typeof openRun === 'function' ? '<button type="button" class="btn ghost" id="cwWbOpenFull">Full view</button>' : '') +
        '<button type="button" class="btn ghost" id="cwWbClose" aria-label="Close workbench">Close</button>' +
      '</div>' +
      '<div class="cw-wb-code-meta" id="cwWbMeta">' + cwBuildCodingMetaHtml(current) + '</div>' +
      '<div class="cw-workbench-body is-coding">' +
        '<div class="cw-wb-feed" id="cwWbFeed">' + cwRenderCodingFeedHtml(current) + '</div>' +
      '</div>' +
      '<div class="cw-workbench-foot">' +
        '<input type="text" id="cwWbInstruction" placeholder="Steer this coding agent without leaving Cowork...">' +
        '<button type="button" class="btn dark" id="cwWbAsk">Steer agent</button>' +
      '</div>';
    var closeBtn = $('cwWbClose');
    if (closeBtn) closeBtn.onclick = function () { wb.open = false; cwStopCodingStream(); cwRenderWorkbench(); };
    var fullBtn = $('cwWbOpenFull');
    if (fullBtn) fullBtn.onclick = function () { if (typeof openRun === 'function') openRun(current.runId); };
    var verSel = $('cwWbVersion');
    if (verSel) verSel.onchange = function () { wb.activeIndex = Number(verSel.value) || 0; cwRenderWorkbench(); };
    var feedEl = $('cwWbFeed');
    cwBindCodingFeedActions(feedEl, current);
    if (feedEl && feedEl.scrollHeight) feedEl.scrollTop = feedEl.scrollHeight;
    var askBtn = $('cwWbAsk');
    var askInput = $('cwWbInstruction');
    var sendSteer = function () {
      var instr = askInput && String(askInput.value || '').trim();
      if (!instr) { if (typeof toast === 'function') toast('Enter steering instructions first'); return; }
      current._lastSteer = instr;
      cwPushCodingFeed(current, { kind: 'user', text: instr });
      if (askInput) askInput.value = '';
      cwRefreshCodingView(current, false);
      if (typeof api === 'function') {
        api('/api/runs/' + encodeURIComponent(current.runId) + '/message', {
          method: 'POST',
          body: JSON.stringify({ text: instr, delivery: 'steer' })
        }).then(function () {
          if (typeof toast === 'function') toast('Steering message sent to coding agent');
          if (!wb._runEs) cwInspectCodingTask(current.runId);
        }).catch(function (err) {
          if (typeof toast === 'function') toast((err && err.message) || 'Could not steer agent', true);
        });
      }
    };
    if (askBtn) askBtn.onclick = sendSteer;
    if (askInput) {
      askInput.onkeydown = function (e) {
        if (e && e.key === 'Enter' && !e.shiftKey) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          sendSteer();
        }
      };
    }
    cwStartCodingStream(current);
  }

  function cwRenderRailCoding() {
    var host = $('cwRailCoding');
    if (!host) return;
    var cw = cwEnsure();
    var wb = cwEnsureWorkbench();
    var activeRunId = wb.open && wb.items && wb.items[wb.activeIndex] ? wb.items[wb.activeIndex].runId : '';
    var tasks = Array.isArray(cw.codingTasks) ? cw.codingTasks : [];
    var seen = {};
    var unique = [];
    for (var i = 0; i < tasks.length; i++) {
      var t = tasks[i];
      if (!t || !t.runId || seen[t.runId]) continue;
      seen[t.runId] = true;
      unique.push(t);
    }
    if (!unique.length) {
      host.innerHTML = '<div class="cw-rail-coding-empty">No coding runs in this chat yet</div>';
      return;
    }
    var eFn = typeof esc === 'function' ? esc : function (v) { return String(v || ''); };
    host.innerHTML = '<div class="cw-rail-coding">' + unique.slice(0, 8).map(function (t) {
      var info = cwCodingStatusInfo(t.status, t.needsAttention);
      var isAct = activeRunId === t.runId;
      var goalText = String(t.goal || 'Background coding task').trim();
      if (goalText.length > 52) goalText = goalText.slice(0, 49) + '…';
      var dotCls = 'cw-rail-coding-dot is-' + info.tone;
      return '<button type="button" class="cw-rail-coding-btn' + (isAct ? ' active' : '') + '" data-main-coding-task="' + eFn(t.runId) + '" title="' + eFn(t.goal || t.runId) + '">' +
        '<span class="' + dotCls + '" aria-hidden="true"></span>' +
        '<span class="cw-rail-coding-main">' +
          '<span class="cw-rail-coding-goal">' + eFn(goalText) + '</span>' +
          '<span class="cw-rail-coding-meta"><span>' + eFn(info.label) + '</span>' + (t.project ? '<span>· ' + eFn(t.project) + '</span>' : '') + '</span>' +
        '</span>' +
      '</button>';
    }).join('') + '</div>';
    if (typeof host.querySelectorAll === 'function') {
      var btns = host.querySelectorAll('[data-main-coding-task]');
      for (var j = 0; j < btns.length; j++) {
        (function (btn) {
          btn.onclick = function (e) {
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            var id = btn.getAttribute('data-main-coding-task');
            if (id) cwInspectCodingTask(id);
          };
        })(btns[j]);
      }
    }
  }

  function cwRenderWorkbench() {
    var pane = $('cwWorkbench');
    if (!pane) return;
    var wb = cwEnsureWorkbench();
    pane.hidden = !wb.open;
    if (!wb.open) {
      cwStopCodingStream();
      if (typeof cwRenderRailCoding === 'function') cwRenderRailCoding();
      return;
    }
    var current = wb.items[wb.activeIndex] || { id: 'wb-0', title: 'Workbench', content: '', previousContent: '' };
    if (current && current.runId) {
      cwRenderCodingWorkbench(pane, wb, current);
      if (typeof cwRenderRailCoding === 'function') cwRenderRailCoding();
      return;
    }
    cwStopCodingStream();
    if (typeof cwRenderRailCoding === 'function') cwRenderRailCoding();
    var optionsHtml = wb.items.map(function (item, idx) {
      return '<option value="' + idx + '"' + (idx === wb.activeIndex ? ' selected' : '') + '>' + esc('v' + (idx + 1) + ' · ' + item.title) + '</option>';
    }).join('');
    var diffText = wb.showDiff ? cwComputeLineDiff(current.previousContent || '', current.content || '') : '';
    pane.innerHTML =
      '<div class="cw-workbench-head">' +
        '<strong>' + esc(current.title) + '</strong>' +
        '<button type="button" class="btn ghost" id="cwWbClose" aria-label="Close workbench">Close</button>' +
      '</div>' +
      '<div class="cw-workbench-toolbar">' +
        '<select id="cwWbVersion" aria-label="Workbench version">' + optionsHtml + '</select>' +
        '<button type="button" class="btn ghost" id="cwWbDiffBtn" aria-pressed="' + String(!!wb.showDiff) + '">Diff</button>' +
        '<button type="button" class="btn ghost" id="cwWbSaveRev">Save revision</button>' +
        '<button type="button" class="btn ghost" id="cwWbCopy">Copy</button>' +
      '</div>' +
      '<div class="cw-workbench-body">' +
        '<pre class="cw-workbench-diff" id="cwWbDiff"' + (wb.showDiff ? '' : ' hidden') + '>' + esc(diffText || 'No previous revision to diff.') + '</pre>' +
        '<textarea class="cw-workbench-editor" id="cwWbEditor" aria-label="Workbench editor">' + esc(current.content) + '</textarea>' +
      '</div>' +
      '<div class="cw-workbench-foot">' +
        '<input type="text" id="cwWbInstruction" placeholder="Ask teammate to revise selection or draft…">' +
        '<button type="button" class="btn dark" id="cwWbAsk">Ask</button>' +
      '</div>';
    var closeBtn = $('cwWbClose');
    if (closeBtn) closeBtn.onclick = function () { wb.open = false; cwRenderWorkbench(); };
    var verSel = $('cwWbVersion');
    if (verSel) verSel.onchange = function () { wb.activeIndex = Number(verSel.value) || 0; cwRenderWorkbench(); };
    var diffBtn = $('cwWbDiffBtn');
    if (diffBtn) diffBtn.onclick = function () { wb.showDiff = !wb.showDiff; cwRenderWorkbench(); };
    var editor = $('cwWbEditor');
    var saveRev = $('cwWbSaveRev');
    if (saveRev && editor) {
      saveRev.onclick = function () {
        cwOpenWorkbench({ title: current.title + ' (edited)', content: editor.value });
        if (typeof toast === 'function') toast('Saved workbench revision v' + wb.items.length);
      };
    }
    var copyBtn = $('cwWbCopy');
    if (copyBtn && editor) {
      copyBtn.onclick = function () {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          navigator.clipboard.writeText(editor.value).then(function () { if (typeof toast === 'function') toast('Copied workbench content'); });
        }
      };
    }
    var askBtn = $('cwWbAsk');
    var askInput = $('cwWbInstruction');
    if (askBtn && (editor || current.runId)) {
      if (askInput && current.runId) askInput.placeholder = 'Steer this coding agent without leaving Cowork...';
      if (current.runId) askBtn.textContent = 'Steer agent';
      askBtn.onclick = function () {
        if (current.runId) {
          var steerText = (askInput && askInput.value.trim()) || 'Report current progress and next steps.';
          if (typeof api === 'function') {
            api('/api/runs/' + encodeURIComponent(current.runId) + '/message', {
              method: 'POST',
              body: JSON.stringify({ text: steerText, delivery: 'steer' })
            }).then(function () {
              if (askInput) askInput.value = '';
              if (typeof toast === 'function') toast('Sent instruction to coding agent');
              if (typeof cwInspectCodingTask === 'function') cwInspectCodingTask(current.runId);
            }).catch(function (err) {
              if (typeof toast === 'function') toast((err && err.message) || 'Failed to message coding agent', true);
            });
          }
          return;
        }
        var selStart = editor.selectionStart || 0;
        var selEnd = editor.selectionEnd || 0;
        var excerpt = selEnd > selStart ? editor.value.slice(selStart, selEnd) : editor.value.slice(0, 400);
        var instruction = (askInput && askInput.value.trim()) || 'Please revise and improve this draft';
        var chatInput = $('cwInput');
        if (chatInput) {
          chatInput.value = instruction + ':\n\n\x60\x60\x60\n' + excerpt + '\n\x60\x60\x60';
          if (typeof cwSaveDraft === 'function') cwSaveDraft();
          if (typeof cwRenderComposerAction === 'function') cwRenderComposerAction();
          if (typeof chatInput.focus === 'function') chatInput.focus();
        }
      };
    }
  }

  function cwBuildPulseDigest() {
    var cw = cwEnsure();
    var items = [];
    (cw.requests || []).forEach(function (r) {
      if (r.status === 'open') {
        items.push({
          status: 'Requires Approval',
          title: r.title || 'Pending teammate request',
          detail: (r.kind || 'request') + (r.detail ? ' · ' + r.detail : '')
        });
      }
    });
    (cw.missions || []).forEach(function (m) {
      var st = m.status === 'running' ? 'In Progress' : m.status === 'completed' ? 'Completed' : m.status === 'failed' ? 'Failed' : 'Pending';
      items.push({
        status: st,
        title: m.title || m.goal || 'Mission',
        detail: m.summary || ('Mission status: ' + st)
      });
    });
    (cw.todos || []).forEach(function (t) {
      var st = t.status === 'done' || t.status === 'completed' ? 'Completed' : t.status === 'blocked' ? 'Blocked' : t.status === 'in_progress' ? 'In Progress' : 'Pending';
      items.push({
        status: st,
        title: t.text || 'Task',
        detail: 'Task status: ' + st
      });
    });
    (cw.workHistory || []).slice(-5).forEach(function (w) {
      items.push({
        status: w.ok === false ? 'Failed' : 'Completed',
        title: (typeof cwToolActivityTitle === 'function' ? cwToolActivityTitle(w.tool) : w.tool) || 'Action',
        detail: w.publicUpdate || (w.agentName ? 'Executed by ' + w.agentName : 'Tool step')
      });
    });
    var counts = {
      'Requires Approval': 0,
      'Blocked': 0,
      'In Progress': 0,
      'Failed': 0,
      'Pending': 0,
      'Completed': 0
    };
    items.forEach(function (item) {
      if (counts[item.status] !== undefined) counts[item.status]++;
    });
    return { counts: counts, items: items };
  }

  function cwOpenPulseModal() {
    var digest = cwBuildPulseDigest();
    var modal = document.createElement('div');
    modal.className = 'modal cw-modal cw-pulse-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Proactive Pulse Digest');
    var statOrder = ['Requires Approval', 'Blocked', 'In Progress', 'Failed', 'Pending', 'Completed'];
    var statsHtml = statOrder.map(function (label) {
      return '<div class="cw-pulse-stat"><small>' + esc(label) + '</small><strong>' + digest.counts[label] + '</strong></div>';
    }).join('');
    var rowsHtml = digest.items.length ? digest.items.map(function (item) {
      return '<div class="cw-pulse-row">' +
        '<div class="cw-pulse-row-main"><strong>' + esc(item.title) + '</strong><span>' + esc(item.detail) + '</span></div>' +
        '<span class="cw-status-badge" data-status="' + esc(item.status) + '">' + esc(item.status) + '</span>' +
      '</div>';
    }).join('') : '<div class="cw-note">No active items recorded yet. All systems nominal.</div>';
    modal.innerHTML =
      '<div class="box">' +
        '<div class="bar"><span>Pulse Operational Digest</span><span style="flex:1"></span><button type="button" class="btn ghost" id="cwPulseClose">Close</button></div>' +
        '<div class="cw-body">' +
          '<div class="cw-pulse-grid">' + statsHtml + '</div>' +
          '<div class="cw-pulse-list">' + rowsHtml + '</div>' +
        '</div>' +
        '<div class="cw-foot">' +
          '<button type="button" class="btn ghost" id="cwPulseInsert">Insert summary into chat</button>' +
          '<span style="flex:1"></span>' +
          '<button type="button" class="btn dark" id="cwPulseDone">Done</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    var close = typeof cwBindDialog === 'function' ? cwBindDialog(modal, '#cwPulseClose') : function () { if (modal.remove) modal.remove(); };
    var closeBtn = modal.querySelector('#cwPulseClose');
    if (closeBtn) closeBtn.onclick = close;
    var doneBtn = modal.querySelector('#cwPulseDone');
    if (doneBtn) doneBtn.onclick = close;
    var insertBtn = modal.querySelector('#cwPulseInsert');
    if (insertBtn) {
      insertBtn.onclick = function () {
        var lines = ['# Operational Status Report', ''];
        statOrder.forEach(function (k) {
          if (digest.counts[k] > 0) lines.push('- **' + k + ':** ' + digest.counts[k]);
        });
        lines.push('');
        digest.items.slice(0, 8).forEach(function (item) {
          lines.push('- [' + item.status + '] ' + item.title + ' — ' + item.detail);
        });
        var input = $('cwInput');
        if (input) {
          input.value = lines.join('\n');
          if (typeof cwSaveDraft === 'function') cwSaveDraft();
          if (typeof cwRenderComposerAction === 'function') cwRenderComposerAction();
        }
        close();
      };
    }
    return modal;
  }

  function cwRunSlashCommand(cmd) {
    var cw = cwEnsure();
    var input = $('cwInput');
    var menu = $('cwSlashMenu');
    if (menu) menu.hidden = true;
    var clean = String(cmd || '').trim().split(/\s+/)[0].toLowerCase();
    if (clean === '/workbench') {
      if (input && input.value.trim() === '/workbench') input.value = '';
      cwOpenWorkbench();
      return true;
    }
    if (clean === '/pulse') {
      if (input && input.value.trim() === '/pulse') input.value = '';
      cwOpenPulseModal();
      return true;
    }
    if (clean === '/compact') {
      if (input) {
        input.value = 'Summarize our progress, decisions, and pending items into a concise checkpoint using standard status labels (Completed, In Progress, Blocked, Failed, Pending, Requires Approval) so we can continue with a clean context.';
        if (typeof cwSaveDraft === 'function') cwSaveDraft();
        if (typeof cwRenderComposerAction === 'function') cwRenderComposerAction();
        if (typeof input.focus === 'function') input.focus();
      }
      return true;
    }
    if (clean === '/handoff') {
      var other = (cw.agents || []).find(function (a) { return a.id !== cw.selectedAgentId; }) || (cw.agents || [])[0];
      if (input) {
        input.value = (other ? '@' + other.name + ' ' : '') + 'Handoff request — please review the latest steps and take over the next milestone: ';
        if (typeof cwSaveDraft === 'function') cwSaveDraft();
        if (typeof cwRenderComposerAction === 'function') cwRenderComposerAction();
        if (typeof input.focus === 'function') input.focus();
      }
      return true;
    }
    if (clean === '/compare') {
      var names = (cw.agents || []).slice(0, 2).map(function (a) { return '@' + a.name; }).join(' ');
      if (input) {
        input.value = (names ? names + ' ' : '') + 'Compare approaches and provide independent recommendations for: ';
        if (typeof cwSaveDraft === 'function') cwSaveDraft();
        if (typeof cwRenderComposerAction === 'function') cwRenderComposerAction();
        if (typeof input.focus === 'function') input.focus();
      }
      return true;
    }
    if (clean === '/connect') {
      if (input && input.value.trim() === '/connect') input.value = '';
      if (typeof cwOpenConnections === 'function') cwOpenConnections(cw.selectedAgentId);
      return true;
    }
    if (clean === '/model') {
      if (input && input.value.trim() === '/model') input.value = '';
      var agent = cw.selectedAgentId && typeof cwAgentById === 'function' ? cwAgentById(cw.selectedAgentId) : (cw.agents || [])[0];
      if (agent && typeof cwAgentModal === 'function') cwAgentModal(agent);
      return true;
    }
    return false;
  }

  function cwUpdateSlashMenu() {
    var input = $('cwInput'), menu = $('cwSlashMenu');
    if (!input || !menu) return;
    var val = String(input.value || '');
    if (val.charAt(0) !== '/' || /\s/.test(val)) {
      menu.hidden = true;
      return;
    }
    var query = val.toLowerCase();
    var matches = CW_SLASH_COMMANDS.filter(function (item) {
      return item.cmd.indexOf(query) === 0 || item.label.toLowerCase().indexOf(query.slice(1)) >= 0;
    });
    if (!matches.length) {
      menu.hidden = true;
      return;
    }
    menu.hidden = false;
    menu.innerHTML = matches.map(function (item, idx) {
      return '<button type="button" class="cw-slash-item' + (idx === 0 ? ' active' : '') + '" data-cwslash="' + esc(item.cmd) + '">' +
        '<span class="cw-slash-cmd">' + esc(item.cmd) + '</span>' +
        '<span class="cw-slash-desc">' + esc(item.desc) + '</span>' +
      '</button>';
    }).join('');
    menu.querySelectorAll('[data-cwslash]').forEach(function (btn) {
      btn.onclick = function () {
        cwRunSlashCommand(btn.getAttribute('data-cwslash'));
      };
    });
  }

  function cwCommandPaletteItems(query) {
    var cw = cwEnsure();
    var q = String(query || '').trim().toLowerCase();
    var items = [];
    CW_SLASH_COMMANDS.forEach(function (c) {
      items.push({ kind: 'Command', title: c.label + ' (' + c.cmd + ')', detail: c.desc, action: function () { cwRunSlashCommand(c.cmd); } });
    });
    (cw.agents || []).forEach(function (a) {
      items.push({ kind: 'Teammate', title: a.name, detail: a.tagline || a.model || 'Open direct chat', action: function () { if (typeof cwOpenDm === 'function') cwOpenDm(a.id); } });
    });
    (cw.threads || []).forEach(function (t) {
      items.push({ kind: 'Thread', title: t.title, detail: t.topic || 'Switch to thread', action: function () { if (typeof cwSwitchThread === 'function') cwSwitchThread(t.id); } });
    });
    return items.filter(function (item) {
      if (!q) return true;
      return item.title.toLowerCase().indexOf(q) >= 0 || item.detail.toLowerCase().indexOf(q) >= 0 || item.kind.toLowerCase().indexOf(q) >= 0;
    });
  }

  function cwOpenCommandPalette() {
    var existing = document.querySelector && document.querySelector('.cw-palette-modal');
    if (existing && existing.remove) existing.remove();
    var modal = document.createElement('div');
    modal.className = 'modal cw-modal cw-palette-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Command Palette');
    modal.innerHTML =
      '<div class="box">' +
        '<input type="text" class="cw-palette-search" id="cwPaletteSearch" placeholder="Type a command, teammate, or thread…">' +
        '<div class="cw-palette-list" id="cwPaletteList"></div>' +
      '</div>';
    document.body.appendChild(modal);
    var close = typeof cwBindDialog === 'function' ? cwBindDialog(modal, '#cwPaletteSearch') : function () { if (modal.remove) modal.remove(); };
    var search = modal.querySelector('#cwPaletteSearch');
    var list = modal.querySelector('#cwPaletteList');
    var currentItems = [];
    function render() {
      currentItems = cwCommandPaletteItems(search ? search.value : '');
      if (!list) return;
      list.innerHTML = currentItems.map(function (item, idx) {
        return '<button type="button" class="cw-palette-row' + (idx === 0 ? ' active' : '') + '" data-cwpalette-idx="' + idx + '">' +
          '<div><strong>' + esc(item.title) + '</strong><br><span>' + esc(item.detail) + '</span></div>' +
          '<span class="cw-palette-tag">' + esc(item.kind) + '</span>' +
        '</button>';
      }).join('') || '<div class="cw-note" style="padding:12px">No matching commands or teammates.</div>';
      list.querySelectorAll('[data-cwpalette-idx]').forEach(function (btn) {
        btn.onclick = function () {
          var item = currentItems[Number(btn.getAttribute('data-cwpalette-idx'))];
          close();
          if (item && item.action) item.action();
        };
      });
    }
    if (search) {
      search.oninput = render;
      search.onkeydown = function (e) {
        if (e.key === 'Enter' && currentItems[0]) {
          e.preventDefault();
          var chosen = currentItems[0];
          close();
          chosen.action();
        }
      };
    }
    render();
    return modal;
  }

  if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    window.addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && String(event.key || '').toLowerCase() === 'k') {
        if (typeof S !== 'undefined' && S.active === 'cowork') {
          event.preventDefault();
          cwOpenCommandPalette();
        }
      }
    });
  }

  function cwBasename(p) {
    if (!p) return '';
    if (typeof basename === 'function') return basename(p);
    var parts = String(p).replace(/[\\\/]+$/, '').split(/[\\\/]/);
    return parts[parts.length - 1] || String(p);
  }

  function cwStateRef() {
    if (typeof cwEnsure === 'function') return cwEnsure();
    if (typeof S !== 'undefined' && S && S.cw) return S.cw;
    return null;
  }

  function cwActiveProjectPath() {
    var cwState = cwStateRef();
    if (cwState && cwState.activeProjectPath) return cwState.activeProjectPath;
    if (typeof S !== 'undefined' && S && S.settings && S.settings.projectPath) return S.settings.projectPath;
    return '';
  }

  function cwActiveProjectName() {
    var cwState = cwStateRef();
    if (cwState && cwState.activeProjectName) return cwState.activeProjectName;
    var p = cwActiveProjectPath();
    return p ? cwBasename(p) : 'Default workspace';
  }

  function cwSyncActiveProject(path, name, skipSave) {
    var resolvedPath = path || '';
    var resolvedName = name || (resolvedPath ? cwBasename(resolvedPath) : '');
    var cwState = cwStateRef();
    if (cwState) {
      cwState.activeProjectPath = resolvedPath;
      cwState.activeProjectName = resolvedName;
      if (resolvedPath) cwState.projectCleared = false;
      else if (!skipSave) cwState.projectCleared = true;
      if (resolvedPath) {
        if (!Array.isArray(cwState.projects)) cwState.projects = [];
        var exists = cwState.projects.some(function (p) { return p && p.path === resolvedPath; });
        if (!exists) cwState.projects.unshift({ path: resolvedPath, name: resolvedName });
      }
    }
    if (typeof S !== 'undefined' && S && S.settings) {
      S.settings.projectPath = resolvedPath;
      if (!resolvedPath && !skipSave && typeof S.lastProjectPath === 'string') {
        S.lastProjectPath = '';
        if (typeof persist === 'function') persist();
      }
      if (typeof updateProjChip === 'function') updateProjChip();
    }
    cwRenderProjectPill();
    cwRenderRailProjects();
    if (!skipSave && typeof api === 'function') {
      api('/api/model-selection', {
        method: 'POST',
        body: JSON.stringify({ projectPath: resolvedPath })
      }).catch(function () {});
    }
  }

  function cwLoadProjectsList() {
    if (typeof api !== 'function') return Promise.resolve([]);
    return Promise.all([
      api('/api/projects').catch(function () { return { projects: [] }; }),
      api('/api/model-selection').catch(function () { return {}; })
    ]).then(function (res) {
      var list = (res[0] && Array.isArray(res[0].projects)) ? res[0].projects : [];
      var cwState = cwStateRef();
      if (cwState) cwState.projects = list;
      var cleared = Boolean((res[1] && res[1].projectCleared) || (cwState && cwState.projectCleared));
      if (cwState && res[1] && res[1].projectCleared !== undefined) cwState.projectCleared = Boolean(res[1].projectCleared);
      var selectedPath = (res[1] && res[1].projectPath) || (!cleared && typeof S !== 'undefined' && S && S.settings && S.settings.projectPath) || '';
      if (selectedPath) {
        var matched = null;
        for (var i = 0; i < list.length; i++) {
          if (list[i] && list[i].path === selectedPath) { matched = list[i]; break; }
        }
        cwSyncActiveProject(selectedPath, (matched && matched.name) || cwBasename(selectedPath), true);
      } else if (cwState && !cleared && !cwState.activeProjectPath && list.length === 1 && list[0] && list[0].path) {
        cwSyncActiveProject(list[0].path, list[0].name || cwBasename(list[0].path), false);
      } else {
        if (cleared && cwState) {
          cwState.activeProjectPath = '';
          cwState.activeProjectName = '';
          if (typeof S !== 'undefined' && S && S.settings) S.settings.projectPath = '';
        }
        cwRenderProjectPill();
        cwRenderRailProjects();
      }
      return list;
    }).catch(function () {
      cwRenderProjectPill();
      cwRenderRailProjects();
      return [];
    });
  }

  function cwRenderProjectPill() {
    var cwState = cwStateRef();
    var btn = typeof $ === 'function' ? $('cwProjectBtn') : null;
    var activePath = cwActiveProjectPath();
    var activeName = activePath ? cwBasename(activePath) : ((cwState && cwState.activeProjectName) || 'Default workspace');
    var eFn = typeof esc === 'function' ? esc : function (s) { return String(s || ''); };
    if (btn) {
      btn.title = activePath ? ('Active project: ' + activePath) : 'Default workspace (General) — or choose a project';
      btn.innerHTML = (typeof cwIcon === 'function' ? cwIcon('folder') : '') +
        '<span class="cw-project-pill-name">' + eFn(activeName) + '</span>' +
        '<span class="cw-project-pill-caret" aria-hidden="true">&#9662;</span>';
    }
    var menu = typeof $ === 'function' ? $('cwProjectMenu') : null;
    if (!menu) return;
    var projects = (cwState && Array.isArray(cwState.projects)) ? cwState.projects.slice() : [];
    if (activePath && !projects.some(function (p) { return p && p.path === activePath; })) {
      projects.unshift({ path: activePath, name: activeName });
    }
    var isDefault = !activePath;
    var html = '<div class="cw-project-menu-head">Workspace &amp; Project</div>' +
      '<button type="button" class="cw-project-item' + (isDefault ? ' active' : '') + '" data-cwproj-action="clear" title="General chat in your default workspace (no project selected)">' +
        '<span>Default workspace (General)</span>' +
        '<span class="cw-project-item-path">' + (isDefault ? 'Active' : '') + '</span>' +
      '</button>';
    if (!projects.length) {
      html += '<div class="cw-empty-note" style="padding:6px 10px;">No projects yet — create one or pick a folder.</div>';
    } else {
      html += '<div class="cw-project-menu-sep"></div>';
      html += projects.map(function (p, idx) {
        var isAct = activePath && p.path === activePath;
        var label = p.name || cwBasename(p.path);
        return '<button type="button" class="cw-project-item' + (isAct ? ' active' : '') + '" data-cwproj-idx="' + idx + '" title="' + eFn(p.path) + '">' +
          '<span>' + eFn(label) + '</span>' +
          '<span class="cw-project-item-path">' + (isAct ? 'Active' : '') + '</span>' +
        '</button>';
      }).join('');
    }
    html += '<div class="cw-project-menu-sep"></div>' +
      '<button type="button" class="cw-project-item" data-cwproj-action="new">' + (typeof cwIcon === 'function' ? cwIcon('plus') : '+') + ' <span>Create new project…</span></button>' +
      '<button type="button" class="cw-project-item" data-cwproj-action="browse">' + (typeof cwIcon === 'function' ? cwIcon('folder') : '') + ' <span>Open existing folder…</span></button>';
    menu.innerHTML = html;
    if (typeof menu.querySelectorAll === 'function') {
      menu.querySelectorAll('[data-cwproj-idx]').forEach(function (itemBtn) {
        itemBtn.onclick = function () {
          var proj = projects[Number(itemBtn.getAttribute('data-cwproj-idx'))];
          if (menu.hidePopover) try { menu.hidePopover(); } catch {}
          if (proj && proj.path) {
            cwSyncActiveProject(proj.path, proj.name || cwBasename(proj.path));
            if (typeof toast === 'function') toast('Project switched to ' + (proj.name || cwBasename(proj.path)));
          }
        };
      });
      menu.querySelectorAll('[data-cwproj-action]').forEach(function (actBtn) {
        actBtn.onclick = function () {
          var act = actBtn.getAttribute('data-cwproj-action');
          if (menu.hidePopover) try { menu.hidePopover(); } catch {}
          if (act === 'clear') {
            cwSyncActiveProject('', '');
            if (typeof toast === 'function') toast('Switched to Default workspace (General)');
          } else if (act === 'new' && typeof newProject === 'function') newProject();
          else if (act === 'browse' && typeof openFolderBrowser === 'function') openFolderBrowser('project');
        };
      });
    }
  }

  function cwRenderRailProjects() {
    var el = typeof $ === 'function' ? $('cwRailProjects') : null;
    if (!el) return;
    var cwState = cwStateRef();
    var activePath = cwActiveProjectPath();
    var list = (cwState && Array.isArray(cwState.projects)) ? cwState.projects.slice() : [];
    var eFn = typeof esc === 'function' ? esc : function (s) { return String(s || ''); };
    if (activePath && !list.some(function (p) { return p && p.path === activePath; })) {
      list.unshift({ path: activePath, name: cwBasename(activePath) });
    }
    if (!list.length) {
      el.innerHTML = '<div class="cw-empty-note">No projects yet. Create one so coding tasks run inside it.</div>';
      return;
    }
    el.innerHTML = list.map(function (p, idx) {
      var isAct = activePath && p.path === activePath;
      var label = p.name || cwBasename(p.path);
      return '<button type="button" class="cw-rail-project-btn' + (isAct ? ' active' : '') + '" data-cwrailproj-idx="' + idx + '" title="' + eFn(p.path) + '">' +
        '<span>' + eFn(label) + '</span>' +
        (isAct ? '<span class="cw-project-item-path">Active</span>' : '') +
      '</button>';
    }).join('');
    if (typeof el.querySelectorAll === 'function') {
      el.querySelectorAll('[data-cwrailproj-idx]').forEach(function (btn) {
        btn.onclick = function () {
          var proj = list[Number(btn.getAttribute('data-cwrailproj-idx'))];
          if (proj && proj.path) cwSyncActiveProject(proj.path, proj.name || cwBasename(proj.path));
        };
      });
    }
  }

  function cwInspectCodingTask(runId) {
    if (!runId || typeof api !== 'function') return Promise.resolve();
    return api('/api/runs/' + encodeURIComponent(runId)).then(function (task) {
      var resolvedRunId = (task && task.runId) || runId;
      var projLabel = (task && (task.project || cwBasename(task.projectPath || ''))) || 'Workspace';
      var status = (task && task.status) || 'running';
      var needsAtt = Boolean(task && task.needsAttention);
      var statusInfo = cwCodingStatusInfo(status, needsAtt);
      var repFmt = cwFormatCodingReport(task && task.report);
      var lines = [];
      lines.push('# Coding Task: ' + projLabel + ' (' + statusInfo.label + ')');
      if (task && task.goal) lines.push('Goal: ' + task.goal);
      if (repFmt && repFmt.summary) lines.push(repFmt.summary);
      var wb = cwEnsureWorkbench();
      var entryId = 'run-' + resolvedRunId;
      var existingIdx = -1;
      if (wb && Array.isArray(wb.items)) {
        for (var k = 0; k < wb.items.length; k++) {
          var cand = wb.items[k];
          if (cand && (cand.runId === resolvedRunId || cand.id === entryId)) {
            existingIdx = k;
            break;
          }
        }
      }
      var target = null;
      if (existingIdx >= 0) {
        wb.activeIndex = existingIdx;
        wb.open = true;
        target = wb.items[existingIdx];
      } else {
        cwOpenWorkbench({
          id: entryId,
          title: 'Code: ' + projLabel + ' (' + statusInfo.label + ')',
          content: lines.join('\n')
        });
        target = wb && Array.isArray(wb.items) && wb.items.length ? wb.items[wb.items.length - 1] : null;
      }
      if (target) {
        target.id = entryId;
        target.runId = resolvedRunId;
        target.coding = true;
        target.title = 'Code: ' + projLabel + ' (' + statusInfo.label + ')';
        target.goal = (task && task.goal) || target.goal || '';
        target.project = projLabel;
        target.projectPath = (task && task.projectPath) || '';
        target.worktreePath = (task && task.worktreePath) || '';
        target.branch = (task && task.branch) || '';
        target.mode = (task && task.mode) || '';
        target.status = status;
        target.needsAttention = needsAtt;
        target.error = (task && task.error) || '';
        target.report = (task && task.report) || null;
        if (task && Array.isArray(task.files)) target.files = task.files;
        else if (!Array.isArray(target.files)) target.files = [];
        if (task && Array.isArray(task.pendingApprovals)) target.pendingApprovals = task.pendingApprovals;
        if (task && task.pendingPlanReview !== undefined) target.pendingPlanReview = task.pendingPlanReview;
        if (task && task.pendingQuestions !== undefined) target.pendingQuestions = task.pendingQuestions;
        if (!Array.isArray(target.feedItems)) target.feedItems = [];
        if (!target._seenIds) target._seenIds = {};
        if (typeof target._stepCounter !== 'number') target._stepCounter = 0;
        cwRenderWorkbench();
      }
      return task;
    }).catch(function (err) {
      if (typeof toast === 'function') toast((err && err.message) || 'Could not inspect coding task', true);
    });
  }
`;
