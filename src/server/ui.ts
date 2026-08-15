export const UI_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hermes — Agent State</title>
<style>
  :root {
    --bg: #0b0e14;
    --panel: #121722;
    --panel2: #171d2b;
    --border: #232b3d;
    --text: #d7dce6;
    --muted: #8b93a7;
    --accent: #7aa2ff;
    --green: #4ade80;
    --red: #f87171;
    --amber: #fbbf24;
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  header {
    display: flex; align-items: center; gap: 14px; padding: 12px 20px;
    border-bottom: 1px solid var(--border); background: var(--panel);
    position: sticky; top: 0; z-index: 5;
  }
  header .logo { font-weight: 700; letter-spacing: 2px; color: var(--accent); }
  header .proj { color: var(--muted); font-family: var(--mono); font-size: 12px; }
  header .spacer { flex: 1; }
  .badge {
    display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px;
    border: 1px solid var(--border); color: var(--muted); font-family: var(--mono);
  }
  .badge.ok { color: var(--green); border-color: rgba(74,222,128,.4); }
  .badge.bad { color: var(--red); border-color: rgba(248,113,113,.4); }
  .badge.warn { color: var(--amber); border-color: rgba(251,191,36,.4); }
  .badge.info { color: var(--accent); border-color: rgba(122,162,255,.4); }
  main { display: grid; grid-template-columns: 340px 1fr; gap: 16px; padding: 16px 20px; max-width: 1500px; margin: 0 auto; }
  @media (max-width: 980px) { main { grid-template-columns: 1fr; } }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; }
  .card h2 { margin: 0 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 1.2px; color: var(--muted); }
  label { display: block; font-size: 12px; color: var(--muted); margin: 10px 0 4px; }
  input[type=text], select, textarea {
    width: 100%; background: var(--panel2); color: var(--text); border: 1px solid var(--border);
    border-radius: 7px; padding: 8px 10px; font: inherit;
  }
  textarea { resize: vertical; min-height: 64px; font-family: var(--mono); font-size: 12px; }
  button {
    background: var(--accent); color: #0b0e14; border: 0; border-radius: 7px; padding: 9px 16px;
    font-weight: 600; cursor: pointer; font-size: 13px;
  }
  button.secondary { background: var(--panel2); color: var(--text); border: 1px solid var(--border); }
  button.danger { background: var(--red); }
  button:disabled { opacity: .5; cursor: not-allowed; }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .task-item {
    padding: 9px 11px; border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px;
    cursor: pointer; background: var(--panel2);
  }
  .task-item:hover { border-color: var(--accent); }
  .task-item.active { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
  .task-item .goal { font-size: 13px; margin: 4px 0; }
  .task-item .meta { font-family: var(--mono); font-size: 11px; color: var(--muted); }
  .crit { display: flex; gap: 8px; align-items: flex-start; padding: 6px 0; border-bottom: 1px dashed var(--border); }
  .crit:last-child { border-bottom: 0; }
  .crit .dot { width: 9px; height: 9px; border-radius: 50%; margin-top: 5px; flex: none; background: var(--muted); }
  .crit.done .dot { background: var(--green); }
  .crit .txt { font-size: 13px; }
  .crit .ev { font-family: var(--mono); font-size: 11px; color: var(--muted); }
  .step { display: flex; gap: 8px; padding: 5px 0; font-size: 13px; border-bottom: 1px dashed var(--border); }
  .step:last-child { border-bottom: 0; }
  .step .st { font-family: var(--mono); font-size: 11px; flex: none; width: 84px; }
  .st.done { color: var(--green); } .st.failed, .st.blocked { color: var(--red); }
  .st.in_progress { color: var(--amber); } .st.pending { color: var(--muted); }
  .ev-item { display: flex; gap: 8px; padding: 5px 0; border-bottom: 1px dashed var(--border); font-size: 13px; }
  .ev-item:last-child { border-bottom: 0; }
  .ev-item .pass { color: var(--green); font-family: var(--mono); font-size: 11px; flex: none; width: 44px; }
  .ev-item .fail { color: var(--red); font-family: var(--mono); font-size: 11px; flex: none; width: 44px; }
  #eventFeed {
    font-family: var(--mono); font-size: 12px; background: #0a0d13; border: 1px solid var(--border);
    border-radius: 8px; padding: 10px 12px; height: 260px; overflow-y: auto; white-space: pre-wrap; color: #aeb6c8;
  }
  #eventFeed .t { color: #525b70; }
  .file-chip { display: inline-block; font-family: var(--mono); font-size: 12px; background: var(--panel2); border: 1px solid var(--border); border-radius: 6px; padding: 2px 8px; margin: 2px 4px 2px 0; }
  .approval { border: 1px solid rgba(251,191,36,.5); background: rgba(251,191,36,.07); border-radius: 10px; padding: 14px; margin-bottom: 14px; }
  .approval pre { font-family: var(--mono); font-size: 12px; background: #0a0d13; padding: 8px; border-radius: 6px; overflow-x: auto; }
  .report pre { white-space: pre-wrap; font-family: var(--mono); font-size: 12px; color: var(--text); }
  .empty { color: var(--muted); font-size: 13px; padding: 8px 0; }
  .hyp { font-size: 13px; color: var(--text); background: var(--panel2); border-left: 3px solid var(--accent); padding: 8px 10px; border-radius: 4px; }
  .status-line { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
  .goal-big { font-size: 16px; font-weight: 600; margin: 4px 0 10px; }
</style>
</head>
<body>
<header>
  <span class="logo">HERMES</span>
  <span class="proj" id="projectInfo">loading project…</span>
  <span class="spacer"></span>
  <span class="badge info" id="modelBadge">model: —</span>
  <span class="badge" id="connBadge">connecting…</span>
</header>
<main>
  <aside>
    <div class="card">
      <h2>New task</h2>
      <label for="goalInput">Goal</label>
      <textarea id="goalInput" placeholder="What should Hermes complete?"></textarea>
      <label for="criteriaInput">Acceptance criteria (one per line, optional)</label>
      <textarea id="criteriaInput" placeholder="tests pass&#10;no type errors"></textarea>
      <label for="modelSelect">Model</label>
      <select id="modelSelect"></select>
      <label for="modeSelect">Mode</label>
      <select id="modeSelect">
        <option value="standard">standard (context pack)</option>
        <option value="fast">fast (minimal ceremony)</option>
      </select>
      <div class="row" style="margin-top:12px">
        <button id="startBtn">Start task</button>
      </div>
    </div>
    <div class="card">
      <h2>Runs &amp; tasks</h2>
      <div id="taskList"><div class="empty">No tasks yet.</div></div>
    </div>
  </aside>
  <section id="detail">
    <div class="card"><div class="empty">Start a task or select one from the list to see live agent state.</div></div>
  </section>
</main>
<script>
(function () {
  var state = {
    project: null, models: [], runs: {}, activeRunId: null,
    es: null, pollTimer: null, listTimer: null
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function api(path, opts) {
    return fetch(path, opts).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw new Error(path + ' -> ' + res.status + ' ' + t); });
      return res.json();
    });
  }

  function statusBadge(status) {
    var cls = 'badge ';
    if (status === 'completed') cls += 'ok';
    else if (status === 'blocked' || status === 'failed' || status === 'aborted') cls += 'bad';
    else if (status === 'executing' || status === 'planning' || status === 'verifying') cls += 'info';
    else cls += 'warn';
    return '<span class="' + cls + '">' + esc(status) + '</span>';
  }

  function loadProject() {
    api('/api/project').then(function (p) {
      state.project = p;
      $('projectInfo').textContent = p.name + ' @ ' + p.repoRoot + (p.branch ? ' (' + p.branch + ')' : '');
    }).catch(function () { $('projectInfo').textContent = 'no project locked'; });
  }

  function loadModels() {
    api('/api/models').then(function (data) {
      state.models = data;
      var sel = $('modelSelect');
      sel.innerHTML = '';
      data.providers.forEach(function (prov) {
        var opt = document.createElement('option');
        opt.value = prov.id + '::' + prov.defaultModel;
        opt.textContent = prov.id + ' / ' + prov.defaultModel + ' (default)';
        if (prov.id === data.defaultProvider) opt.selected = true;
        sel.appendChild(opt);
        prov.models.forEach(function (m) {
          if (m === prov.defaultModel) return;
          var o = document.createElement('option');
          o.value = prov.id + '::' + m;
          o.textContent = prov.id + ' / ' + m;
          sel.appendChild(o);
        });
      });
      var def = data.providers.find(function (p) { return p.id === data.defaultProvider; });
      $('modelBadge').textContent = 'model: ' + (def ? def.defaultModel : '—');
    }).catch(function () {});
  }

  function startRun() {
    var goal = $('goalInput').value.trim();
    if (!goal) { alert('Enter a goal first.'); return; }
    var criteria = $('criteriaInput').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    var modelChoice = $('modelSelect').value.split('::');
    var body = {
      goal: goal,
      criteria: criteria.length ? criteria : undefined,
      provider: modelChoice[0],
      model: modelChoice[1],
      mode: $('modeSelect').value
    };
    $('startBtn').disabled = true;
    api('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) {
        $('goalInput').value = '';
        openRun(r.runId);
        refreshRunList();
      })
      .catch(function (e) { alert('Failed to start: ' + e.message); })
      .finally(function () { $('startBtn').disabled = false; });
  }

  function openRun(runId) {
    state.activeRunId = runId;
    if (state.es) { state.es.close(); state.es = null; }
    if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
    var feed = [];
    renderRunShell(runId, feed);
    var es = new EventSource('/api/runs/' + runId + '/stream');
    state.es = es;
    es.onopen = function () { $('connBadge').textContent = 'live'; $('connBadge').className = 'badge ok'; };
    es.onerror = function () { $('connBadge').textContent = 'reconnecting…'; $('connBadge').className = 'badge warn'; };
    es.onmessage = function (msg) {
      var ev = JSON.parse(msg.data);
      feed.push(ev);
      appendEvent(ev);
      var m = String(ev.text).match(/ledger\s+created:\s+(\S+)/);
      if (m && !state.runs[runId]) state.runs[runId] = {};
      if (m) { state.runs[runId].taskId = m[1]; ensureLedgerPolling(runId); }
    };
    ensureLedgerPolling(runId);
  }

  function ensureLedgerPolling(runId) {
    if (state.pollTimer) return;
    state.pollTimer = setInterval(function () { pollRun(runId); }, 1500);
    pollRun(runId);
  }

  function pollRun(runId) {
    if (state.activeRunId !== runId) return;
    api('/api/runs/' + runId).then(function (session) {
      renderApprovals(session);
      if (session.taskId) {
        state.runs[runId] = state.runs[runId] || {};
        state.runs[runId].taskId = session.taskId;
        api('/api/tasks/' + session.taskId).then(function (ledger) {
          renderLedger(runId, ledger, session);
          if (['completed', 'blocked', 'failed', 'aborted'].indexOf(ledger.status) >= 0) {
            if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
          }
        }).catch(function () {});
      }
      refreshRunList();
    }).catch(function () {});
  }

  function renderRunShell(runId, feed) {
    $('detail').innerHTML =
      '<div class="card" id="statusCard"><div class="empty">Waiting for agent to start…</div></div>' +
      '<div id="approvalZone"></div>' +
      '<div class="card" id="stateCard" style="display:none"></div>' +
      '<div class="card"><h2>Live activity</h2><div id="eventFeed"></div></div>';
    state.feedEl = $('eventFeed');
    feed.forEach(appendEvent);
  }

  function appendEvent(ev) {
    if (!state.feedEl) return;
    var line = document.createElement('div');
    var t = new Date(ev.t).toLocaleTimeString();
    line.innerHTML = '<span class="t">' + esc(t) + '</span>  ' + esc(ev.text);
    state.feedEl.appendChild(line);
    state.feedEl.scrollTop = state.feedEl.scrollHeight;
  }

  function renderApprovals(session) {
    var zone = $('approvalZone');
    if (!zone) return;
    var pending = session.pendingApprovals || [];
    if (!pending.length) { zone.innerHTML = ''; return; }
    zone.innerHTML = pending.map(function (a) {
      return '<div class="approval">' +
        '<div class="row"><span class="badge warn">APPROVAL REQUIRED</span> <b>' + esc(a.tool) + '</b> <span class="badge">' + esc(a.why) + '</span></div>' +
        '<pre>' + esc(a.summary) + '</pre>' +
        '<div class="row">' +
        '<button onclick="window.__approve(\'' + esc(a.id) + '\', true)">Approve</button>' +
        '<button class="danger" onclick="window.__approve(\'' + esc(a.id) + '\', false)">Deny</button>' +
        '</div></div>';
    }).join('');
  }

  window.__approve = function (id, approved) {
    api('/api/approvals/' + id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approved: approved }) })
      .catch(function (e) { alert(e.message); });
  };

  function renderLedger(runId, ledger, session) {
    var card = $('stateCard');
    var statusCard = $('statusCard');
    if (!card || !statusCard) return;
    card.style.display = 'block';

    statusCard.innerHTML =
      '<div class="status-line">' + statusBadge(ledger.status) +
      (session && session.status === 'running' ? ' <span class="badge info">run active</span>' : '') +
      ' <span class="badge">' + esc(ledger.taskId) + '</span>' +
      ' <span class="badge">' + esc(ledger.mode) + ' mode</span></div>' +
      '<div class="goal-big">' + esc(ledger.goal) + '</div>' +
      (ledger.currentHypothesis ? '<div class="hyp"><b>Hypothesis:</b> ' + esc(ledger.currentHypothesis) + '</div>' : '');

    var html = '';

    html += '<h2>Acceptance criteria</h2>';
    if (!ledger.acceptanceCriteria.length) html += '<div class="empty">none set yet</div>';
    html += ledger.acceptanceCriteria.map(function (c) {
      return '<div class="crit ' + (c.satisfied ? 'done' : '') + '"><span class="dot"></span>' +
        '<div><div class="txt">' + esc(c.text) + '</div>' +
        (c.evidenceIds.length ? '<div class="ev">evidence: ' + esc(c.evidenceIds.join(', ')) + '</div>' : '') +
        '</div></div>';
    }).join('');

    html += '<h2 style="margin-top:16px">Plan</h2>';
    if (!ledger.plan.length) html += '<div class="empty">no plan yet</div>';
    html += ledger.plan.map(function (s) {
      return '<div class="step"><span class="st ' + s.status + '">' + esc(s.status) + '</span>' +
        '<div>' + esc(s.description) + ' <span style="color:var(--muted)">· verify: ' + esc(s.verification) + ' · attempts ' + s.attempts + '</span></div></div>';
    }).join('');

    html += '<h2 style="margin-top:16px">Evidence</h2>';
    if (!ledger.evidence.length) html += '<div class="empty">none recorded yet</div>';
    html += ledger.evidence.map(function (e) {
      return '<div class="ev-item"><span class="' + (e.passed ? 'pass' : 'fail') + '">' + (e.passed ? 'PASS' : 'FAIL') + '</span>' +
        '<div><div>' + esc(e.label) + '</div><div class="ev">[' + esc(e.kind) + '] ' + esc(e.command || '') + ' · ' + esc(e.id) + '</div></div></div>';
    }).join('');

    html += '<h2 style="margin-top:16px">Files changed</h2>';
    html += ledger.filesChanged.length
      ? ledger.filesChanged.map(function (f) { return '<span class="file-chip">' + esc(f) + '</span>'; }).join('')
      : '<div class="empty">none</div>';

    if (ledger.blockers.length) {
      html += '<h2 style="margin-top:16px">Blockers</h2>' +
        ledger.blockers.map(function (b) { return '<div class="crit"><span class="dot" style="background:var(--red)"></span><div class="txt">' + esc(b) + '</div></div>'; }).join('');
    }

    if (ledger.report) {
      html += '<h2 style="margin-top:16px">Completion report</h2><div class="report"><pre>' + esc(renderReport(ledger.report)) + '</pre></div>';
    }

    card.innerHTML = html;
  }

  function renderReport(r) {
    var lines = [];
    lines.push('Status: ' + r.status.toUpperCase());
    lines.push('Summary: ' + r.summary);
    if (r.filesChanged.length) lines.push('Files: ' + r.filesChanged.join(', '));
    if (r.verification.length) lines.push('Verification:\n  ' + r.verification.join('\n  '));
    if (r.remainingRisks.length) lines.push('Risks:\n  ' + r.remainingRisks.join('\n  '));
    if (r.followUps.length) lines.push('Follow-ups:\n  ' + r.followUps.join('\n  '));
    return lines.join('\n');
  }

  function refreshRunList() {
    api('/api/runs').then(function (sessions) {
      var el = $('taskList');
      if (!sessions.length) { el.innerHTML = '<div class="empty">No tasks yet.</div>'; return; }
      el.innerHTML = sessions.map(function (s) {
        var active = s.runId === state.activeRunId ? ' active' : '';
        var st = s.status === 'running' ? '<span class="badge info">running</span>' : statusBadge(s.status);
        return '<div class="task-item' + active + '" onclick="window.__openRun(\'' + esc(s.runId) + '\')">' +
          '<div class="row">' + st + ' <span class="meta">' + esc(s.runId) + '</span></div>' +
          '<div class="goal">' + esc(s.goal) + '</div>' +
          '<div class="meta">' + new Date(s.startedAt).toLocaleString() + (s.taskId ? ' · ' + esc(s.taskId) : '') + '</div>' +
          '</div>';
      }).join('');
    }).catch(function () {});
  }

  window.__openRun = function (runId) { openRun(runId); };

  $('startBtn').addEventListener('click', startRun);
  loadProject();
  loadModels();
  refreshRunList();
  state.listTimer = setInterval(refreshRunList, 5000);
})();
</script>
</body>
</html>
`;
