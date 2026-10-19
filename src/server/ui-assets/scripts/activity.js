
  function specialistPresence(runId, insert) {
    var sess = S.sessions[runId];
    if (!sess) return null;
    var presence = sess.nodes.subagentPresence;
    if (!presence || !presence.host.isConnected) {
      if (presence) presence.view.dispose();
      var host = document.createElement('div');
      presence = sess.nodes.subagentPresence = { host: host, view: createSubagentOrbs(host) };
      sess.nodes.specs = presence.view.jobs;
      insert(host);
    }
    return presence.view;
  }
  function upsertSpecialistCard(runId, insert, name, status, jobId, detail, at) {
    var view = specialistPresence(runId, insert);
    if (!view) return;
    var job = view.jobs[jobId];
    if (job && job.structured) return;
    var data = { id: jobId, name: name, status: status };
    if (status === 'queued') data.task = detail;
    else if (status === 'running') { data.current = detail; if (!job || !job.startedAt) data.startedAt = at; }
    else { data.current = detail; data.finishedAt = at; }
    data.at = at; data.activity = detail;
    view.upsert(data, Boolean(S.sessions[runId].replaying));
  }
  function applySubagentState(runId, insert, text) {
    try {
      var data = JSON.parse(text.slice('subagent-state '.length));
      if (!data || typeof data.id !== 'string' || typeof data.name !== 'string') return;
      var view = specialistPresence(runId, insert);
      if (!view) return;
      var job = view.upsert(data, Boolean(S.sessions[runId].replaying));
      if (job) job.structured = true;
    } catch (e) { /* Malformed telemetry never becomes raw chat text. */ }
  }
  function attachSpecialistActivity(runId, text, at) {
    var sess = S.sessions[runId];
    if (!sess || !sess.nodes.specs || !sess.nodes.subagentPresence) return false;
    var rest = text.slice('subagent '.length), name = rest.split(/[ :]/)[0], pick;
    Object.keys(sess.nodes.specs).forEach(function (id) { if (sess.nodes.specs[id].name === name) pick = sess.nodes.specs[id]; });
    if (!pick) return false;
    // Executor events already have a job-correlated structured companion.
    if (pick.structured && rest.slice(name.length).indexOf(':') === 0) return true;
    var line = rest.slice(name.length).replace(/^[:—\-\s]+/, '');
    sess.nodes.subagentPresence.view.upsert({ id: pick.id, name: pick.name, activity: line, at: at });
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
        // Nothing to expand in normal mode (rows are Developer-only).
        if (!devMode()) return;
        el.classList.toggle('open');
      });
      st = sess.nodes.intake = { el: el, seen: {}, digest: {} };
      insert(el);
    }
    // Dedupe identical tag+body pairs on replays/retries. The collapsed rows
    // (Project:/Ledger:/Branch:/…) are Developer detail: normal users get the
    // quiet digest line only ("Session started · project · high effort · 3 files").
    var rowKey = tag + '::' + body;
    if (!st.seen[rowKey]) {
      st.seen[rowKey] = 1;
      if (devMode()) {
        var row = document.createElement('div');
        row.className = 'intake-row';
        row.textContent = tag.charAt(0).toUpperCase() + tag.slice(1) + ': ' + body;
        st.el.querySelector('.intake-rows').appendChild(row);
      }
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

  // ── Grouped tool activity ──────────────────────────────────────────────
  // A model turn can make several calls (especially a parallel action). Keep
  // them in one disclosure anchored after that turn rather than echoing a
  // separate timeline card for every lifecycle event. The rows inside remain
  // independently addressable so out-of-order parallel completions still
  // update the right call.
  function toolActivityGroupForRow(row) {
    return row && row.closest ? row.closest('.tl-tool-group') : null;
  }

  function toolActivityHint(summary, working) {
    var text = String(summary || '').trim();
    var verbs = { read: ['Reading', 'Read'], write: ['Writing', 'Wrote'], edit: ['Editing', 'Edited'], list: ['Listing', 'Listed'], search: ['Searching', 'Searched'] };
    var match = /^(read|write|edit|list|search)\s+([\s\S]*)$/.exec(text);
    if (match) return verbs[match[1]][working ? 0 : 1] + ' ' + match[2];
    if (text.indexOf('$ ') === 0) return (working ? 'Running ' : 'Ran ') + text.slice(2);
    return text || (working ? 'Preparing action' : 'Action completed');
  }

  function refreshToolActivityGroup(groupEl) {
    if (!groupEl || !groupEl.isConnected) return;
    var rows = Array.prototype.slice.call(groupEl.querySelectorAll('.tool-call'));
    var running = 0, troubled = 0, current = null;
    rows.forEach(function (row) {
      var state = String(row.dataset.toolState || '');
      if (state === 'working') { running++; if (!current) current = row; }
      var outcome = String(row.dataset.toolStatus || '');
      if (outcome === 'error' || outcome === 'denied' || outcome === 'blocked' || outcome === 'interrupted') troubled++;
    });
    var status = running ? 'working' : troubled ? 'attention' : 'complete';
    groupEl.dataset.toolGroupState = status;
    var count = groupEl.querySelector('.tool-group-count');
    if (count) count.textContent = rows.length + (rows.length === 1 ? ' activity' : ' activities');
    current = current || rows[rows.length - 1];
    var title = groupEl.querySelector('.tool-group-title');
    var hint = groupEl.querySelector('.tool-group-hint');
    if (title && current) title.textContent = toolActivityHint(current.dataset.toolKey, !!running);
    if (hint) hint.textContent = current ? String(current.dataset.toolReason || '') : '';
    var label = groupEl.querySelector('.tool-group-state');
    if (label) label.textContent = running > 1 ? running + ' running' : status === 'attention' ? 'Needs attention' : status === 'complete' ? 'Complete' : '';
    var dot = groupEl.querySelector(':scope > .tl-dot');
    if (dot) dot.className = 'tl-dot ' + (status === 'working' ? 'dot-run' : status === 'attention' ? 'dot-bad' : 'dot-ok');
    var summary = groupEl.querySelector('.tool-group-details > summary');
    if (summary) {
      summary.title = (title ? title.textContent : '') + (hint && hint.textContent ? '\n' + hint.textContent : '');
      summary.setAttribute('aria-label', (title ? title.textContent + '. ' : '') + 'Show ' + rows.length + ' activities and outputs');
    }
  }

  function sealToolActivityGroup(sess, force) {
    if (!sess || !sess.nodes || !sess.nodes.toolGroup) return;
    var group = sess.nodes.toolGroup;
    if (!group.el || !group.el.isConnected) { sess.nodes.toolGroup = null; return; }
    if (!force && group.el.querySelector('.tool-call[data-tool-state="working"]')) return;
    group.accepting = false;
    sess.nodes.toolGroup = null;
  }

  function createToolActivityGroup(sess, insert) {
    var el = document.createElement('div');
    el.className = 'tl-row tl-tool-group';
    el.dataset.toolGroupState = 'working';
    el.innerHTML =
      '<span class="tl-dot dot-run"></span>' +
      '<div class="tl-body"><details class="tool-group-details">' +
        '<summary aria-label="Show tool activity">' +
          '<span class="tool-group-orbit" aria-hidden="true"></span>' +
          '<span class="tool-group-chevron" aria-hidden="true">›</span>' +
          '<span class="tool-group-copy"><span class="tool-group-title" aria-live="polite">Preparing action</span><span class="tool-group-hint"></span></span>' +
          '<span class="tool-group-count">0 activities</span>' +
          '<span class="tool-group-state"></span>' +
        '</summary>' +
        '<div class="tool-group-list"></div>' +
      '</details></div>';
    var details = el.querySelector('.tool-group-details');
    var summary = el.querySelector('.tool-group-details > summary');
    if (details && summary) {
      summary.setAttribute('aria-expanded', 'false');
      details.addEventListener('toggle', function () { summary.setAttribute('aria-expanded', String(details.open)); });
    }
    insert(el);
    var group = { el: el, accepting: true };
    sess.nodes.toolGroup = group;
    return group;
  }

  function ensureToolActivityGroup(sess, insert) {
    var group = sess && sess.nodes && sess.nodes.toolGroup;
    if (group && group.el && group.el.isConnected && group.accepting) return group;
    return createToolActivityGroup(sess, insert);
  }