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
  .cw-context-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 3px 10px 6px; font-size: 11px; color: var(--muted); }
  .cw-context-bar[hidden] { display: none !important; }
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
    var tokens = Math.max(0, Math.round(chars / 4));
    var conv = typeof cwActiveConv === 'function' ? cwActiveConv() : null;
    var agentId = cw.selectedAgentId || (conv && (conv.kind === 'dm' ? conv.memberIds[0] : conv.chiefId || conv.memberIds[0]));
    var agent = agentId && typeof cwAgentById === 'function' ? cwAgentById(agentId) : null;
    var maxTokens = 128000;
    var inputCostPerM = 0.25;
    if (agent && agent.model) {
      var m = String(agent.model).toLowerCase();
      if (m.indexOf('opus') >= 0 || m.indexOf('gpt-5') >= 0 || m.indexOf('pro') >= 0) inputCostPerM = 2.5;
      else if (m.indexOf('sonnet') >= 0 || m.indexOf('gpt-4') >= 0) inputCostPerM = 1.0;
      else if (m.indexOf('flash') >= 0 || m.indexOf('mini') >= 0 || m.indexOf('deepseek') >= 0) inputCostPerM = 0.15;
    }
    var pct = Math.min(100, Math.round((tokens / maxTokens) * 100));
    var costUsd = (tokens / 1000000) * inputCostPerM;
    return {
      tokens: tokens,
      maxTokens: maxTokens,
      percent: pct,
      costFormatted: costUsd < 0.005 ? '<$0.01' : '$' + costUsd.toFixed(2),
      modelLabel: (agent && (agent.model || agent.provider)) || 'Default model'
    };
  }

  function cwRenderContextMeter() {
    var host = $('cwContextBar');
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
    host.innerHTML =
      '<div class="cw-context-pill" title="Estimated active context window usage (' + esc(usage.modelLabel) + ')">' +
        '<span class="cw-context-meter-track"><span class="cw-context-meter-fill' + tone + '" style="width:' + usage.percent + '%"></span></span>' +
        '<span>' + esc(tokLabel) + ' tok · ' + usage.percent + '% · ' + esc(usage.costFormatted) + '</span>' +
      '</div>' +
      '<div class="cw-context-actions">' +
        '<button type="button" class="cw-context-btn" id="cwPulseTrigger" title="Open Pulse Digest (/pulse)">Pulse</button>' +
        '<button type="button" class="cw-context-btn" id="cwWorkbenchTrigger" title="Toggle Side-by-Side Workbench (/workbench)">Workbench</button>' +
        '<button type="button" class="cw-context-btn" id="cwCompactTrigger" title="Compact conversation context (/compact)">Compact</button>' +
      '</div>';
    var pulseBtn = $('cwPulseTrigger');
    if (pulseBtn) pulseBtn.onclick = function () { cwOpenPulseModal(); };
    var wbBtn = $('cwWorkbenchTrigger');
    if (wbBtn) wbBtn.onclick = function () { cwToggleWorkbench(); };
    var compactBtn = $('cwCompactTrigger');
    if (compactBtn) compactBtn.onclick = function () { cwRunSlashCommand('/compact'); };
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

  function cwRenderWorkbench() {
    var pane = $('cwWorkbench');
    if (!pane) return;
    var wb = cwEnsureWorkbench();
    pane.hidden = !wb.open;
    if (!wb.open) return;
    var current = wb.items[wb.activeIndex] || { id: 'wb-0', title: 'Workbench', content: '', previousContent: '' };
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
    if (askBtn && editor) {
      askBtn.onclick = function () {
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
`;
