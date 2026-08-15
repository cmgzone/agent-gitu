export const UI_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Hermes</title>
<style>
  :root {
    --bg: #f4f4f2;
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
    --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    margin: 0; background: var(--bg); color: var(--text);
    font: 13.5px/1.55 -apple-system, "Segoe UI", system-ui, sans-serif;
    display: flex; flex-direction: column;
  }
  button { font: inherit; cursor: pointer; }
  select { font: inherit; }

  .topbar {
    display: flex; align-items: center; gap: 6px; padding: 8px 12px;
    border-bottom: 1px solid var(--border); flex: none;
  }
  .icon-btn {
    background: none; border: 0; color: var(--muted); border-radius: 7px;
    width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center;
    font-size: 15px;
  }
  .icon-btn:hover { background: #ebebe7; color: var(--text); }
  .logo { font-weight: 700; letter-spacing: 3px; font-size: 12px; color: var(--dark); margin-right: 8px; }
  .tabs { display: flex; gap: 4px; align-items: center; overflow-x: auto; max-width: 60%; }
  .tab {
    display: inline-flex; align-items: center; gap: 7px; padding: 6px 10px;
    border-radius: 8px; color: var(--muted); font-size: 12.5px; white-space: nowrap;
    border: 1px solid transparent; background: none; max-width: 220px;
  }
  .tab .label { overflow: hidden; text-overflow: ellipsis; }
  .tab.active { background: #e9e9e5; color: var(--text); border-color: var(--border); }
  .tab .x { color: var(--faint); font-size: 12px; }
  .tab .x:hover { color: var(--red); }
  .tab .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--faint); flex: none; }
  .tab .dot.running { background: var(--blue); animation: pulse 1.2s infinite; }
  .tab .dot.completed { background: var(--green); }
  .tab .dot.blocked, .tab .dot.failed { background: var(--red); }
  @keyframes pulse { 50% { opacity: .35; } }
  .spacer { flex: 1; }
  .proj-chip {
    display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px;
    background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 4px 10px;
    max-width: 340px; overflow: hidden; white-space: nowrap;
  }
  .proj-chip b { color: var(--text); font-weight: 600; }

  .view { flex: 1; overflow: hidden; display: flex; flex-direction: column; }

  .home { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; padding: 24px; overflow: auto; }
  .wordmark {
    font-size: clamp(56px, 9vw, 108px); font-weight: 800; letter-spacing: .04em;
    color: rgba(30, 30, 26, .07); user-select: none; line-height: 1; margin-bottom: 6px;
  }
  .composer {
    width: min(720px, 94vw); background: var(--card); border: 1px solid var(--border);
    border-radius: 14px; box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.05);
    padding: 6px 8px 8px;
  }
  .composer textarea {
    width: 100%; border: 0; outline: none; resize: none; background: transparent; color: var(--text);
    font: inherit; padding: 10px 10px 6px; min-height: 44px; max-height: 180px;
  }
  .composer textarea::placeholder { color: var(--faint); }
  .composer-bar { display: flex; align-items: center; gap: 4px; padding: 2px 6px; }
  .pill {
    background: none; border: 0; color: var(--muted); border-radius: 8px; padding: 5px 9px;
    display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px;
  }
  .pill:hover { background: #f0f0ec; color: var(--text); }
  .pill select { border: 0; background: none; color: inherit; outline: none; font-size: 12.5px; -webkit-appearance: none; appearance: none; padding-right: 2px; }
  .pill .caret { color: var(--faint); font-size: 10px; }
  .send {
    margin-left: auto; width: 30px; height: 30px; border-radius: 9px; border: 0;
    background: var(--dark); color: #fff; font-size: 14px;
  }
  .send:disabled { background: #c9c9c3; }
  .home-meta { color: var(--muted); font-size: 12.5px; display: flex; gap: 8px; align-items: center; }
  .home-meta .sep { color: var(--faint); }

  .run { flex: 1; display: flex; min-height: 0; }
  .run-main { flex: 1; display: flex; flex-direction: column; min-width: 0; border-right: 1px solid var(--border); }
  .run-head { padding: 14px 22px 8px; display: flex; align-items: center; gap: 10px; flex: none; }
  .run-head .goal { font-weight: 600; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip { font-size: 11px; border-radius: 999px; padding: 2px 9px; border: 1px solid var(--border2); color: var(--muted); }
  .chip.ok { color: var(--green); border-color: #bbf7d0; background: #f0fdf4; }
  .chip.bad { color: var(--red); border-color: #fecaca; background: #fef2f2; }
  .chip.info { color: var(--blue); border-color: #bfdbfe; background: #eff6ff; }
  .chip.warn { color: var(--amber); border-color: #fde68a; background: var(--amber-bg); }

  .stream { flex: 1; overflow-y: auto; padding: 6px 22px 18px; }
  .ev { display: flex; gap: 10px; padding: 7px 0; border-bottom: 1px solid #eeeEE9; font-size: 12.5px; }
  .ev:last-child { border-bottom: 0; }
  .ev .tag { font-family: var(--mono); font-size: 10.5px; flex: none; width: 64px; padding-top: 2px; color: var(--muted); }
  .ev .tag.ok { color: var(--green); } .ev .tag.error, .ev .tag.denied { color: var(--red); }
  .ev .tag.blocked { color: var(--amber); } .ev .tag.run { color: var(--blue); }
  .ev .body { font-family: var(--mono); font-size: 12px; color: #44443f; white-space: pre-wrap; word-break: break-word; }
  .ev .body .sub { color: var(--muted); }

  .approval {
    border: 1px solid #fde68a; background: var(--amber-bg); border-radius: 12px;
    padding: 12px 14px; margin: 10px 0;
  }
  .approval .head { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
  .approval pre { font-family: var(--mono); font-size: 11.5px; background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; overflow-x: auto; margin: 6px 0 10px; }
  .btn { border: 0; border-radius: 8px; padding: 6px 14px; font-size: 12.5px; font-weight: 600; }
  .btn.dark { background: var(--dark); color: #fff; }
  .btn.ghost { background: #fff; color: var(--text); border: 1px solid var(--border2); }
  .btn.red { background: #fff; color: var(--red); border: 1px solid #fecaca; }

  .report-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; margin: 12px 0; }
  .report-card h3 { margin: 0 0 8px; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); }
  .report-card pre { font-family: var(--mono); font-size: 12px; white-space: pre-wrap; margin: 0; }

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
  .file-chip { display: inline-block; font-family: var(--mono); font-size: 11px; border: 1px solid var(--border); border-radius: 6px; padding: 2px 7px; margin: 2px 4px 2px 0; background: #fafaf8; }
  .raw { border: 1px solid var(--border); border-radius: 8px; margin-top: 8px; overflow: hidden; }
  .raw .row { display: flex; justify-content: space-between; gap: 10px; padding: 6px 10px; font-family: var(--mono); font-size: 11px; border-bottom: 1px solid var(--border); color: #55554f; }
  .raw .row:last-child { border-bottom: 0; }
  .raw .row .t { color: var(--faint); flex: none; }
  .empty { color: var(--faint); font-size: 12.5px; padding: 4px 0; }

  .bottom-composer { border-top: 1px solid var(--border); padding: 10px 22px 14px; flex: none; background: var(--bg); }
  .bottom-composer .composer { width: 100%; box-shadow: none; }
  @media (max-width: 1080px) { .run-side { display: none; } }
</style>
</head>
<body>
<div class="topbar">
  <button class="icon-btn" title="menu">&#9776;</button>
  <span class="logo">HERMES</span>
  <nav class="tabs" id="tabs"></nav>
  <button class="icon-btn" id="newTab" title="new session">+</button>
  <span class="spacer"></span>
  <span class="proj-chip" id="projChip">loading…</span>
</div>
<div class="view" id="view"></div>
<script>
(function () {
  var S = {
    tabs: [{ id: 'home', label: 'New session', status: null }],
    active: 'home',
    project: null,
    models: [],
    sessions: {},
    es: null,
    poll: null
  };

  function $(id) { return document.getElementById(id); }
  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML; }
  function api(path, opts) {
    return fetch(path, opts).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || (r.status + '')); });
      return r.json();
    });
  }

  function chipFor(status) {
    if (status === 'completed') return '<span class="chip ok">complete</span>';
    if (status === 'blocked') return '<span class="chip bad">blocked</span>';
    if (status === 'failed') return '<span class="chip bad">failed</span>';
    if (status === 'running') return '<span class="chip info">running</span>';
    return '<span class="chip">' + esc(status || 'idle') + '</span>';
  }

  function renderTabs() {
    $('tabs').innerHTML = S.tabs.map(function (t) {
      var dot = t.id === 'home' ? '' : '<span class="dot ' + esc(t.status || '') + '"></span>';
      var x = t.id === 'home' ? '' : '<span class="x" data-x="' + esc(t.id) + '">&#10005;</span>';
      return '<button class="tab ' + (S.active === t.id ? 'active' : '') + '" data-tab="' + esc(t.id) + '">' +
        dot + '<span class="label">' + esc(t.label) + '</span>' + x + '</button>';
    }).join('');
    var nav = $('tabs');
    nav.onclick = function (e) {
      var x = e.target.getAttribute && e.target.getAttribute('data-x');
      if (x) { closeTab(x); e.stopPropagation(); return; }
      var id = e.target.closest('[data-tab]');
      if (id) openTab(id.getAttribute('data-tab'));
    };
  }

  function openTab(id) {
    S.active = id;
    stopStreams();
    renderTabs();
    if (id === 'home') renderHome(); else renderRun(id);
  }

  function closeTab(id) {
    S.tabs = S.tabs.filter(function (t) { return t.id !== id; });
    delete S.sessions[id];
    if (S.active === id) openTab('home'); else renderTabs();
  }

  function ensureRunTab(runId, label, status) {
    var t = null;
    for (var i = 0; i < S.tabs.length; i++) if (S.tabs[i].id === runId) t = S.tabs[i];
    if (!t) { t = { id: runId, label: label, status: status }; S.tabs.push(t); }
    t.status = status;
    if (label && t.label === 'New session') t.label = label;
    return t;
  }

  function stopStreams() {
    if (S.es) { S.es.close(); S.es = null; }
    if (S.poll) { clearInterval(S.poll); S.poll = null; }
  }

  function renderHome() {
    var modelOpts = '';
    S.models.forEach(function (p) {
      modelOpts += '<option value="' + esc(p.id + '::' + p.defaultModel) + '">' + esc(titleCase(p.defaultModel)) + '</option>';
      p.models.forEach(function (m) {
        if (m === p.defaultModel) return;
        modelOpts += '<option value="' + esc(p.id + '::' + m) + '">' + esc(titleCase(m)) + '</option>';
      });
    });
    var git = S.project && S.project.branch ? S.project.branch : 'No Git';
    var name = S.project ? S.project.name : 'no project';
    $('view').innerHTML =
      '<div class="home">' +
      '<div class="wordmark">hermes</div>' +
      '<div class="composer">' +
      '<textarea id="goal" rows="1" placeholder="Ask Hermes to complete a task…"></textarea>' +
      '<div class="composer-bar">' +
      '<button class="icon-btn" title="attach">+</button>' +
      '<span class="pill"><select id="mode"><option value="standard">Standard</option><option value="fast">Fast</option></select><span class="caret">&#9662;</span></span>' +
      '<span class="pill"><select id="model">' + modelOpts + '</select><span class="caret">&#9662;</span></span>' +
      '<span class="pill"><select id="budget"><option value="40">40 actions</option><option value="20">20 actions</option><option value="80">80 actions</option></select><span class="caret">&#9662;</span></span>' +
      '<button class="send" id="send" title="start">&#8593;</button>' +
      '</div></div>' +
      '<div class="home-meta"><span>&#9632; <b>' + esc(name) + '</b></span><span class="sep">/</span><span>&#8645; ' + esc(git) + '</span></div>' +
      '</div>';
    var ta = $('goal');
    ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(180, ta.scrollHeight) + 'px'; });
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); startRun(); } });
    $('send').onclick = startRun;
  }

  function titleCase(m) {
    return m.replace(/(^|[-.])([a-z])/g, function (all, sep, ch) { return sep + ch.toUpperCase(); });
  }

  function startRun() {
    var goal = $('goal').value.trim();
    if (!goal) { $('goal').focus(); return; }
    var mc = $('model').value.split('::');
    api('/api/runs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ goal: goal, provider: mc[0], model: mc[1], mode: $('mode').value, maxActions: Number($('budget').value) })
    }).then(function (r) {
      ensureRunTab(r.runId, goal.slice(0, 40), 'running');
      openTab(r.runId);
    }).catch(function (e) { alert('Failed to start: ' + e.message); });
  }

  function renderRun(runId) {
    var sess = S.sessions[runId] || (S.sessions[runId] = { events: [], ledger: null, session: null, side: 'state' });
    $('view').innerHTML =
      '<div class="run">' +
      '<div class="run-main">' +
      '<div class="run-head"><span class="goal" id="rGoal"></span><span id="rChip"></span></div>' +
      '<div class="stream" id="stream"></div>' +
      '<div class="bottom-composer"><div class="composer">' +
      '<textarea id="follow" rows="1" placeholder="New session… (Enter to start)"></textarea>' +
      '<div class="composer-bar"><span class="pill" id="miniModel"></span><button class="send" id="send2">&#8593;</button></div>' +
      '</div></div>' +
      '</div>' +
      '<aside class="run-side">' +
      '<div class="side-tabs">' +
      '<button class="side-tab ' + (sess.side === 'state' ? 'active' : '') + '" data-side="state">State</button>' +
      '<button class="side-tab ' + (sess.side === 'context' ? 'active' : '') + '" data-side="context">Context</button>' +
      '</div>' +
      '<div class="side-body" id="sideBody"></div>' +
      '</aside>' +
      '</div>';
    var tabs = document.querySelectorAll('.side-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].onclick = function () { sess.side = this.getAttribute('data-side'); renderRun(runId); };
    }
    var ta = $('follow');
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        var g = ta.value.trim();
        if (!g) return;
        api('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: g }) })
          .then(function (r) { ensureRunTab(r.runId, g.slice(0, 40), 'running'); openTab(r.runId); })
          .catch(function (er) { alert(er.message); });
      }
    });
    $('send2').onclick = function () {
      var ev = new KeyboardEvent('keydown', { key: 'Enter' });
      ta.dispatchEvent(ev);
    };
    replayEvents(runId);
    renderSide(runId);
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

  function tagClass(text) {
    if (text.indexOf('ok ') === 0) return 'ok';
    if (text.indexOf('error ') === 0) return 'error';
    if (text.indexOf('denied ') === 0) return 'denied';
    if (text.indexOf('blocked ') === 0) return 'blocked';
    if (text.indexOf('run ') === 0) return 'run';
    if (text.indexOf('evidence ') === 0) return 'ok';
    return '';
  }

  function appendEvent(runId, ev) {
    var stream = $('stream');
    if (!stream) return;
    var text = String(ev.text);
    if (text.indexOf('approval-required') === 0) return;
    var parts = text.split(' ');
    var tag = parts[0] || '';
    var rest = text.slice(tag.length).trim();
    var div = document.createElement('div');
    div.className = 'ev';
    div.innerHTML = '<span class="tag ' + tagClass(text) + '">' + esc(tag) + '</span><div class="body">' + esc(rest) + '</div>';
    stream.appendChild(div);
    stream.scrollTop = stream.scrollHeight;
  }

  function replayEvents(runId) {
    var sess = S.sessions[runId];
    var stream = $('stream');
    if (!stream || !sess) return;
    stream.innerHTML = '';
    sess.events.forEach(function (ev) { appendEvent(runId, ev); });
  }

  function pollRun(runId) {
    if (S.active !== runId) return;
    api('/api/runs/' + runId).then(function (session) {
      var sess = S.sessions[runId];
      if (!sess) return;
      sess.session = session;
      var tab = ensureRunTab(runId, session.goal.slice(0, 40), session.status);
      renderTabs();
      var g = $('rGoal'); if (g) g.textContent = session.goal;
      var c = $('rChip'); if (c) c.innerHTML = chipFor(session.status) + ' <span class="chip">' + esc(runId) + '</span>';
      renderApprovals(runId, session);
      if (session.taskId) {
        api('/api/tasks/' + session.taskId).then(function (ledger) {
          var s2 = S.sessions[runId];
          if (s2) { s2.ledger = ledger; renderSide(runId); }
        }).catch(function () {});
      } else {
        renderSide(runId);
      }
      if (session.status !== 'running' && S.poll) { clearInterval(S.poll); S.poll = null; }
    }).catch(function () {});
  }

  function renderApprovals(runId, session) {
    var stream = $('stream');
    if (!stream) return;
    var existing = stream.querySelectorAll('.approval');
    for (var i = 0; i < existing.length; i++) existing[i].remove();
    (session.pendingApprovals || []).forEach(function (a) {
      var div = document.createElement('div');
      div.className = 'approval';
      div.innerHTML =
        '<div class="head"><span class="chip warn">approval required</span><b>' + esc(a.tool) + '</b><span class="chip">' + esc(a.why) + '</span></div>' +
        '<pre>' + esc(a.summary) + '</pre>' +
        '<div><button class="btn dark" data-appr="' + esc(a.id) + '" data-ok="1">Approve</button> ' +
        '<button class="btn red" data-appr="' + esc(a.id) + '" data-ok="0">Deny</button></div>';
      stream.appendChild(div);
      stream.scrollTop = stream.scrollHeight;
    });
    stream.onclick = function (e) {
      var id = e.target.getAttribute && e.target.getAttribute('data-appr');
      if (!id) return;
      var ok = e.target.getAttribute('data-ok') === '1';
      api('/api/approvals/' + id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approved: ok }) })
        .catch(function (er) { alert(er.message); });
    };
  }

  function renderSide(runId) {
    var sess = S.sessions[runId];
    var body = $('sideBody');
    if (!body || !sess) return;
    if (sess.side === 'context') { renderContext(runId); return; }
    var L = sess.ledger;
    var html = '';
    if (!L) { body.innerHTML = '<div class="empty">Waiting for task ledger…</div>'; return; }

    html += '<div class="section-h" style="margin-top:0">Acceptance criteria</div>';
    if (!L.acceptanceCriteria.length) html += '<div class="empty">none set yet</div>';
    L.acceptanceCriteria.forEach(function (c) {
      html += '<div class="crit ' + (c.satisfied ? 'done' : '') + '"><span class="dot"></span><div>' + esc(c.text) +
        (c.evidenceIds.length ? '<div class="ev-ids">' + esc(c.evidenceIds.join(', ')) + '</div>' : '') + '</div></div>';
    });

    html += '<div class="section-h">Plan</div>';
    if (!L.plan.length) html += '<div class="empty">no plan yet</div>';
    L.plan.forEach(function (s) {
      html += '<div class="step"><span class="st ' + s.status + '">' + esc(s.status) + '</span><div>' + esc(s.description) +
        ' <span style="color:var(--faint)">· ' + esc(s.verification) + '</span></div></div>';
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

    if (L.report) {
      html += '<div class="report-card"><h3>Completion report</h3><pre>' + esc(reportText(L.report)) + '</pre></div>';
    }
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
    function stat(k, v, mono) {
      html += '<div class="stat"><div class="k">' + esc(k) + '</div><div class="v ' + (mono ? 'mono' : '') + '">' + esc(v) + '</div></div>';
    }
    stat('Session', runId, true);
    stat('Status', session ? session.status : '—');
    stat('Provider', session && session.provider ? session.provider : '—');
    stat('Model', session && session.model ? session.model : '—');
    stat('Mode', L ? L.mode : '—');
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
      html += '<div class="section-h">Action breakdown</div>' +
        '<div class="bar">' +
        '<span style="width:' + pct(counts.read) + '%;background:#16a34a"></span>' +
        '<span style="width:' + pct(counts.write) + '%;background:#d97706"></span>' +
        '<span style="width:' + pct(counts.command) + '%;background:#8a6d1a"></span>' +
        '<span style="width:' + pct(counts.other) + '%;background:#9ca3af"></span>' +
        '</div>' +
        '<div class="legend">' +
        '<span><i style="background:#16a34a"></i>Reads ' + pct(counts.read) + '%</span>' +
        '<span><i style="background:#d97706"></i>Writes ' + pct(counts.write) + '%</span>' +
        '<span><i style="background:#8a6d1a"></i>Commands ' + pct(counts.command) + '%</span>' +
        '<span><i style="background:#9ca3af"></i>Other ' + pct(counts.other) + '%</span>' +
        '</div>';
    }

    html += '<div class="section-h">Raw events</div><div class="raw">';
    var evs = (sess.events || []).slice(-60).reverse();
    if (!evs.length) html += '<div class="row"><span>no events yet</span></div>';
    evs.forEach(function (ev) {
      html += '<div class="row"><span>' + esc(String(ev.text).slice(0, 90)) + '</span><span class="t">' + esc(new Date(ev.t).toLocaleTimeString()) + '</span></div>';
    });
    html += '</div>';
    body.innerHTML = html;
  }

  function boot() {
    api('/api/project').then(function (p) {
      S.project = p;
      $('projChip').innerHTML = '<b>' + esc(p.name) + '</b> ' + esc(p.branch || '· no git');
    }).catch(function () { $('projChip').textContent = 'no project'; });
    api('/api/models').then(function (data) { S.models = data.providers; if (S.active === 'home') renderHome(); }).catch(function () {});
    api('/api/runs').then(function (sessions) {
      sessions.slice(0, 6).forEach(function (s) { ensureRunTab(s.runId, s.goal.slice(0, 40), s.status); });
      renderTabs();
    }).catch(function () {});
    $('newTab').onclick = function () { openTab('home'); };
    renderTabs();
    renderHome();
  }

  boot();
})();
</script>
</body>
</html>
`;
