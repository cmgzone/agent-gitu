/** Compact, keyed specialist presence. Only the outer ring moves. */
export const SUBAGENT_CSS = String.raw`
  .subagent-presence { margin: 14px 0 20px 22px; width: fit-content; max-width: calc(100% - 22px); background: none; border: 0; }
  .cw-msgs > .subagent-presence { margin: 12px 0 22px 18px; }
  .subagent-caption { color: var(--muted); font-size: 11px; margin-bottom: 9px; display: flex; gap: 8px; align-items: center; }
  .subagent-count { color: var(--faint); }
  .subagent-grid { display: grid; grid-template-columns: repeat(3, 46px); gap: 10px 13px; width: fit-content; }
  button.subagent-orb { position: relative; display: grid; place-items: center; width: 46px; height: 46px; padding: 0; border: 0; border-radius: 50%; background: transparent !important; isolation: isolate; }
  button.subagent-orb:hover, button.subagent-orb[aria-expanded="true"] { background: transparent !important; }
  .subagent-face { width: 34px; height: 34px; object-fit: contain; pointer-events: none; animation: none; transform: none; transition: filter .18s; }
  .subagent-orb:hover .subagent-face { filter: brightness(1.06); }
  .subagent-ring { --ring-color: #929398; --ring-speed: 7s; position: absolute; inset: 2px; border-radius: 50%; pointer-events: none; box-shadow: inset 0 0 0 1.5px var(--ring-color); opacity: .65; }
  .subagent-ring::after { content: ''; position: absolute; inset: 0; border-radius: inherit; padding: 1.5px; background: conic-gradient(from 0deg, transparent 18%, var(--ring-color) 55%, #70dbec 76%, transparent 96%); mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); mask-composite: exclude; opacity: 0; }
  .subagent-orb[data-phase="working"] .subagent-ring, .subagent-orb[data-phase="tool"] .subagent-ring { --ring-color: #4d9fea; --ring-speed: var(--working-speed, 7s); opacity: 1; box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--ring-color) 28%, transparent); }
  .subagent-orb[data-phase="working"] .subagent-ring::after, .subagent-orb[data-phase="tool"] .subagent-ring::after { opacity: 1; animation: subagent-turn var(--ring-speed) linear infinite; animation-delay: var(--ring-offset, 0s); }
  .subagent-orb[data-phase="tool"] .subagent-ring { --ring-speed: 1.6s; }
  .subagent-orb[data-phase="reasoning"] .subagent-ring { --ring-color: #9c7bea; animation: subagent-glow 2.8s ease-in-out infinite; }
  .subagent-orb[data-phase="waiting"] .subagent-ring { --ring-color: #c79541; animation: subagent-breathe 4s ease-in-out infinite; }
  .subagent-orb[data-phase="blocked"] .subagent-ring { --ring-color: #c79541; animation: subagent-blocked 3s ease-in-out infinite; }
  .subagent-orb[data-phase="complete"] .subagent-ring { --ring-color: #47956b; opacity: .9; }
  .subagent-orb[data-phase="complete"] .subagent-ring::after { background: conic-gradient(transparent 35%, #9ce0b3 75%, transparent 95%); animation: subagent-success .85s ease-out 1; }
  .subagent-orb[data-phase="failed"] .subagent-ring { --ring-color: #ce6e6e; opacity: .9; animation: subagent-failed .65s ease-out 1; }
  .subagent-orb[data-phase="cancelled"] .subagent-ring { --ring-color: #a18d6a; }
  .subagent-orb[data-restored="true"] .subagent-ring, .subagent-orb[data-restored="true"] .subagent-ring::after { animation: none; }
  .subagent-peek { position: fixed; z-index: 72; width: min(300px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); overflow: auto; padding: 17px 18px; background: var(--card); color: var(--text); border: 1px solid var(--border); border-radius: 14px; box-shadow: var(--shadow-float); animation: subagent-reveal .16s ease-out; }
  .subagent-peek[hidden] { display: none; }
  .subagent-peek h3, .subagent-dialog h3 { font-size: 14px; margin: 0 0 5px; }
  .subagent-objective { color: var(--muted); font-size: 12px; line-height: 1.6; margin: 0 0 14px; overflow-wrap: anywhere; }
  .subagent-peek .subagent-objective, .subagent-peek .subagent-metrics dd:nth-of-type(2) { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
  .subagent-metrics { display: grid; grid-template-columns: 62px minmax(0, 1fr); gap: 7px 12px; font-size: 12px; margin: 0; }
  .subagent-metrics dt { color: var(--faint); }
  .subagent-metrics dd { margin: 0; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
  .subagent-peek .subagent-open { display: inline-flex; align-items: center; gap: 6px; margin-top: 13px; padding: 4px 0; color: var(--accent); font-size: 12px; }
  .subagent-open svg { width: 14px; height: 14px; }
  .subagent-dialog { width: min(620px, calc(100vw - 24px)); max-height: min(78vh, 740px); margin: auto; padding: 0; color: var(--text); background: var(--card); border: 1px solid var(--border); border-radius: 18px; box-shadow: var(--shadow-float); }
  .subagent-dialog::backdrop { background: var(--overlay); backdrop-filter: blur(3px); }
  .subagent-dialog header { display: flex; align-items: center; gap: 12px; padding: 20px 22px 12px; }
  .subagent-dialog header h3 { flex: 1; margin: 0; }
  .subagent-dialog header button { display: grid; place-items: center; width: 32px; height: 32px; padding: 0; }
  .subagent-dialog header svg { width: 17px; height: 17px; }
  .subagent-dialog-body { padding: 0 22px 22px; overflow: auto; max-height: calc(78vh - 68px); }
  .subagent-trace { border-top: 1px solid var(--border); margin-top: 20px; padding-top: 16px; }
  .subagent-trace h4 { font-size: 12px; margin: 0 0 12px; }
  .subagent-trace ol { list-style: none; margin: 0; padding: 0; }
  .subagent-trace li { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 12px; font-size: 12px; line-height: 1.6; padding: 7px 0; }
  .subagent-trace time { color: var(--faint); font-variant-numeric: tabular-nums; }
  .subagent-trace li span { white-space: pre-wrap; overflow-wrap: anywhere; }
  @keyframes subagent-turn { to { transform: rotate(360deg); } }
  @keyframes subagent-glow { 0%, 100% { opacity: .65; box-shadow: inset 0 0 0 1.5px var(--ring-color), 0 0 0 0 transparent; } 50% { opacity: 1; box-shadow: inset 0 0 0 1.5px var(--ring-color), 0 0 9px 1px #9c7bea25; } }
  @keyframes subagent-breathe { 0%, 100% { opacity: .4; } 50% { opacity: .95; } }
  @keyframes subagent-blocked { 0%, 100% { opacity: .55; --ring-color: #c79541; } 50% { opacity: 1; --ring-color: #ce6e6e; } }
  @keyframes subagent-success { 0% { opacity: 1; transform: rotate(-90deg); } 80% { opacity: 1; } 100% { opacity: 0; transform: rotate(270deg); } }
  @keyframes subagent-failed { 0%, 100% { opacity: .9; } 45% { opacity: .25; box-shadow: inset 0 0 0 2px var(--ring-color), 0 0 9px #ce6e6e35; } }
  @keyframes subagent-reveal { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  @media (max-width: 560px) { .subagent-presence, .cw-msgs > .subagent-presence { margin-left: 0; max-width: 100%; } }
  @media (prefers-reduced-motion: reduce) { .subagent-ring, .subagent-ring::after, .subagent-peek { animation: none !important; } .subagent-orb[data-phase="working"] .subagent-ring, .subagent-orb[data-phase="tool"] .subagent-ring { box-shadow: inset 0 0 0 1.5px var(--ring-color); } }
`;

export const SUBAGENT_JS = String.raw`
  var SUBAGENT_LABELS = { working: 'Working', reasoning: 'Reasoning', tool: 'Using a tool', waiting: 'Waiting', blocked: 'Blocked', complete: 'Complete', failed: 'Failed', idle: 'Idle', cancelled: 'Cancelled' };
  function subagentPhase(value) {
    var aliases = { queued: 'waiting', running: 'working', completed: 'complete', done: 'complete', paused: 'blocked' };
    return Object.prototype.hasOwnProperty.call(SUBAGENT_LABELS, value) ? value : Object.prototype.hasOwnProperty.call(aliases, value) ? aliases[value] : 'idle';
  }
  function subagentElapsed(start, finish, now) {
    var a = Date.parse(start), b = finish ? Date.parse(finish) : now;
    if (!Number.isFinite(a) || !Number.isFinite(b)) return '—';
    var seconds = Math.max(0, Math.floor((b - a) / 1000));
    return seconds < 60 ? seconds + 's' : seconds < 3600 ? Math.floor(seconds / 60) + 'm ' + (seconds % 60) + 's' : Math.floor(seconds / 3600) + 'h ' + Math.floor(seconds % 3600 / 60) + 'm';
  }
  function subagentContext(tokens) {
    if (!Number.isFinite(tokens) || tokens < 0) return 'Not reported';
    return '≈' + (tokens >= 1000 ? (tokens / 1000).toFixed(1) + 'k' : Math.round(tokens)) + ' tokens';
  }
  function subagentCounts(jobs) {
    var counts = { active: 0, complete: 0, attention: 0, idle: 0 };
    jobs.forEach(function (job) {
      var phase = subagentPhase(job.phase || job.status);
      counts[phase === 'complete' ? 'complete' : phase === 'failed' || phase === 'blocked' ? 'attention' : phase === 'idle' || phase === 'cancelled' ? 'idle' : 'active']++;
    });
    return [counts.active ? counts.active + ' active' : '', counts.complete ? counts.complete + ' done' : '', counts.attention ? counts.attention + ' need attention' : '', counts.idle ? counts.idle + ' inactive' : ''].filter(Boolean).join(' · ');
  }
  function createSubagentOrbs(host) {
    var jobs = Object.create(null), selected = null, pinned = false, peek = null, dialog = null, tick = null, closeTimer = null, returnFocus = null, ignoreFocus = false;
    host.className = 'subagent-presence';
    host.innerHTML = '<div class="subagent-caption"><span>Subagents</span><span class="subagent-count"></span></div><div class="subagent-grid" role="group" aria-label="Subagents"></div>';
    var grid = host.querySelector('.subagent-grid');
    function detailHtml(job) {
      return '<h3>' + esc(job.name) + '</h3><p class="subagent-objective">' + esc(job.task || 'Assignment not reported') + '</p><dl class="subagent-metrics">' +
        '<dt>Status</dt><dd>' + esc(SUBAGENT_LABELS[job.phase]) + '</dd><dt>Current</dt><dd>' + esc(job.current || '—') + '</dd>' +
        '<dt>Context</dt><dd title="Estimated size of the latest model request">' + esc(subagentContext(job.contextTokens)) + '</dd>' +
        '<dt>Elapsed</dt><dd data-subagent-elapsed>' + esc(subagentElapsed(job.startedAt, job.finishedAt, Date.now())) + '</dd></dl>';
    }
    function stopTick() { if (tick) clearInterval(tick); tick = null; }
    function startTick() {
      stopTick();
      tick = setInterval(function () {
        if (!host.isConnected) { dispose(); return; }
        var job = jobs[selected];
        if (!job) return;
        [peek, dialog].forEach(function (surface) {
          var el = surface && surface.querySelector('[data-subagent-elapsed]');
          if (el) el.textContent = subagentElapsed(job.startedAt, job.finishedAt, Date.now());
        });
      }, 1000);
    }
    function positionPeek() {
      if (!peek || peek.hidden || !jobs[selected]) return;
      var rect = jobs[selected].button.getBoundingClientRect(), height = peek.getBoundingClientRect().height;
      peek.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - peek.offsetWidth - 12)) + 'px';
      peek.style.top = Math.max(12, Math.min(rect.bottom + 10, window.innerHeight - height - 12)) + 'px';
    }
    function closePeek() {
      if (pinned) return;
      if (peek) peek.hidden = true;
      Object.keys(jobs).forEach(function (id) { jobs[id].button.setAttribute('aria-expanded', 'false'); });
      if (!dialog) stopTick();
    }
    function scheduleClose() { clearTimeout(closeTimer); closeTimer = setTimeout(closePeek, 120); }
    function renderPeek() {
      var job = jobs[selected];
      if (!job || !peek || peek.hidden) return;
      peek.querySelector('.subagent-peek-content').innerHTML = detailHtml(job);
      positionPeek();
    }
    function showPeek(id, pin) {
      clearTimeout(closeTimer);
      if (!peek) {
        peek = document.createElement('div'); peek.className = 'subagent-peek';
        peek.setAttribute('role', 'region'); peek.setAttribute('aria-label', 'Subagent details');
        peek.innerHTML = '<div class="subagent-peek-content"></div><button class="subagent-open" type="button">Open context ' + icon('chevRight') + '</button>';
        peek.onpointerenter = function () { clearTimeout(closeTimer); };
        peek.onpointerleave = scheduleClose;
        peek.querySelector('button').onclick = openContext;
        document.body.appendChild(peek);
      }
      selected = id; pinned = Boolean(pin); peek.hidden = false;
      Object.keys(jobs).forEach(function (key) { jobs[key].button.setAttribute('aria-expanded', String(key === id)); });
      renderPeek(); startTick();
    }
    function renderContext() {
      if (!dialog || !jobs[selected]) return;
      var job = jobs[selected];
      dialog.querySelector('.subagent-context').innerHTML = detailHtml(job);
      var list = dialog.querySelector('ol');
      // Append the complete recorded trace incrementally; live updates preserve scroll.
      job.activity.slice(list.children.length).forEach(function (entry) {
        var row = document.createElement('li');
        row.innerHTML = '<time>' + esc(entry.at ? new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—') + '</time><span></span>';
        row.querySelector('span').textContent = entry.text; list.appendChild(row);
      });
      dialog.querySelector('.subagent-trace h4').textContent = 'Activity trace · ' + job.activity.length;
    }
    function openContext() {
      if (!jobs[selected] || dialog) return;
      returnFocus = jobs[selected].button;
      pinned = false; closePeek();
      dialog = document.createElement('dialog'); dialog.className = 'subagent-dialog';
      dialog.setAttribute('aria-label', 'Subagent context and activity');
      dialog.innerHTML = '<header><h3>Subagent context</h3><button type="button" aria-label="Close context">' + icon('x') + '</button></header><div class="subagent-dialog-body"><div class="subagent-context"></div><section class="subagent-trace"><h4>Activity trace</h4><ol></ol></section></div>';
      dialog.querySelector('button').onclick = function () { dialog.close(); };
      dialog.addEventListener('close', function () { dialog.remove(); dialog = null; stopTick(); if (returnFocus && returnFocus.isConnected) { ignoreFocus = true; returnFocus.focus(); ignoreFocus = false; } });
      document.body.appendChild(dialog); renderContext(); dialog.showModal(); startTick();
    }
    function outside(event) {
      if (!host.isConnected) { dispose(); return; }
      if (peek && !peek.hidden && !peek.contains(event.target) && !host.contains(event.target)) { pinned = false; closePeek(); }
    }
    function escape(event) {
      if (event.key === 'Escape' && peek && !peek.hidden && !dialog) {
        event.preventDefault(); event.stopImmediatePropagation(); pinned = false; closePeek();
        if (jobs[selected]) { ignoreFocus = true; jobs[selected].button.focus(); ignoreFocus = false; }
      }
    }
    function upsert(data, restored) {
      if (!data || typeof data.id !== 'string' || !data.id || typeof data.name !== 'string') return;
      var job = jobs[data.id];
      if (!job) {
        var button = document.createElement('button'); button.type = 'button'; button.className = 'subagent-orb';
        button.dataset.jobId = data.id; button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-haspopup', 'dialog');
        var seed = Array.from(data.id).reduce(function (sum, c) { return sum + c.charCodeAt(0); }, 0);
        var color = ['blue', 'purple', 'orange', 'mint'][seed % 4];
        var face = typeof plushCharacterHtml === 'function' ? plushCharacterHtml(color, data.id, '', 'subagent-face') : '<img class="subagent-face" src="/characters/' + color + '.png?v=opendots1" alt="" draggable="false">';
        button.innerHTML = '<span class="subagent-ring" aria-hidden="true"></span>' + face;
        button.querySelector('.subagent-ring').style.setProperty('--ring-offset', -(seed % 7) + 's');
        button.querySelector('.subagent-ring').style.setProperty('--working-speed', (6 + seed % 30 / 10) + 's');
        button.onpointerenter = function () { if (!pinned && !dialog) showPeek(data.id, false); };
        button.onpointerleave = scheduleClose;
        button.onfocus = function () { if (!ignoreFocus && !pinned && !dialog) showPeek(data.id, false); };
        button.onblur = function (event) { if (!peek || !peek.contains(event.relatedTarget)) scheduleClose(); };
        button.onclick = function () { if (selected === data.id && pinned) openContext(); else showPeek(data.id, true); };
        grid.appendChild(button);
        job = jobs[data.id] = { id: data.id, name: data.name, phase: 'idle', activity: [], button: button };
      }
      ['name', 'task', 'current', 'startedAt', 'finishedAt', 'contextTokens'].forEach(function (key) { if (data[key] !== undefined) job[key] = data[key]; });
      var phase = subagentPhase(data.phase || data.status || job.phase);
      if (phase !== job.phase || !job.button.dataset.phase) { job.phase = phase; job.button.dataset.phase = phase; }
      job.button.dataset.restored = restored && (phase === 'complete' || phase === 'failed') ? 'true' : 'false';
      job.button.setAttribute('aria-label', job.name + ' · ' + SUBAGENT_LABELS[phase]);
      if (data.activity) job.activity.push({ at: data.at, text: String(data.activity) });
      host.querySelector('.subagent-count').textContent = subagentCounts(Object.keys(jobs).map(function (id) { return jobs[id]; }));
      if (selected === data.id) { renderPeek(); renderContext(); }
      return job;
    }
    function dispose() {
      stopTick(); clearTimeout(closeTimer);
      document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', positionPeek); window.removeEventListener('scroll', positionPeek, true);
      if (peek) peek.remove(); if (dialog) dialog.close();
    }
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape, true);
    window.addEventListener('resize', positionPeek); window.addEventListener('scroll', positionPeek, true);
    return { upsert: upsert, jobs: jobs, dispose: dispose };
  }
`;
