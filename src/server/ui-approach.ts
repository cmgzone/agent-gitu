// Public task explanations come only from explicit action/event fields.
// Provider reasoning, protocol thoughts, and raw tool output are not inputs.
export const UI_APPROACH_JS = String.raw`
  var MAX_APPROACH_ENTRIES = 24;
  function approachEntry(text) {
    var match = /^(\S+)\s+([\s\S]*)$/.exec(String(text || ''));
    if (!match) return null;
    var tag = match[1], body = match[2].trim();
    var label = '', tone = '', detail = '';
    if (tag === 'run' && body.indexOf('finished: ') !== 0) {
      var summary = splitSummary(body);
      var reason = splitReason(body);
      label = 'Next action';
      detail = humanToolSummary(toolKind(summary), summary) + (reason ? ' — ' + reason : '');
    } else if (tag === 'hypothesis') {
      label = 'Working hypothesis'; detail = body;
    } else if (tag === 'decision') {
      label = 'Decision'; detail = body.replace(/^ad-\S+\s+—\s*/, '');
    } else if (tag === 'replan') {
      label = 'Plan updated'; detail = body;
    } else if (tag === 'plan') {
      label = 'Plan'; detail = body;
    } else if (tag === 'evidence') {
      var result = /^(\S+)\s+(PASS|FAIL)\s+\(([^)]+)\)/.exec(body);
      if (!result) return null;
      label = 'Verification'; tone = result[2] === 'PASS' ? 'pass' : 'fail';
      detail = result[3] + ' check ' + (tone === 'pass' ? 'passed' : 'failed') + ' · ' + result[1];
    } else {
      return null;
    }
    detail = detail.replace(/\s+/g, ' ').trim();
    if (!detail) return null;
    if (detail.length > 360) detail = detail.slice(0, 357) + '…';
    return { label: label, text: detail, tone: tone };
  }

  function approachState(sess) {
    return sess.nodes.approach || (sess.nodes.approach = { entries: [], count: 0, phase: 'Preparing', live: true, lastKey: '' });
  }
  function renderApproach(sess) {
    var panel = $('approachPanel');
    if (!panel || !sess) return;
    var state = approachState(sess);
    panel.hidden = Boolean(sess.chatish);
    panel.classList.toggle('is-live', state.live);
    var latest = state.entries[state.entries.length - 1];
    $('approachLatest').textContent = latest ? latest.text : 'The agent’s next action and brief rationale will appear here.';
    $('approachStatus').textContent = state.phase;
    $('approachCount').textContent = state.count ? String(state.count) : '';
    var log = $('approachLog');
    var atEnd = log.scrollHeight - log.scrollTop - log.clientHeight < 36;
    // Only append new explanations. Polling and activity signals must not
    // replace the log, reset text selection, or replay entry animations.
    state.entries.forEach(function (entry) {
      if (entry.el) return;
      var li = document.createElement('li');
      li.className = 'approach-entry' + (entry.tone ? ' ' + entry.tone : '') + (entry.replay ? ' replayed' : '');
      var label = document.createElement('span'); label.className = 'approach-label'; label.textContent = entry.label;
      var detail = document.createElement('span'); detail.className = 'approach-detail'; detail.textContent = entry.text;
      li.appendChild(label); li.appendChild(detail); log.appendChild(li); entry.el = li;
    });
    if (atEnd) log.scrollTop = log.scrollHeight;
    $('approachEmpty').hidden = Boolean(state.count);
    $('approachHistory').hidden = state.count <= MAX_APPROACH_ENTRIES;
    $('approachHistory').textContent = 'Showing the latest ' + state.entries.length + ' of ' + state.count + ' updates.';
  }
  function updateApproach(runId, ev) {
    var sess = S.sessions[runId];
    if (!sess || S.active !== runId || sess.chatish) return;
    var text = String(ev.text || '');
    // Raw provider reasoning and model JSON never enter this view.
    var entry = approachEntry(text);
    var state = approachState(sess);
    if (entry) {
      var key = entry.label + '\n' + entry.text;
      if (key !== state.lastKey) {
        entry.replay = Boolean(sess.replaying || ev.replay);
        state.entries.push(entry); state.lastKey = key; state.count++;
        if (state.entries.length > MAX_APPROACH_ENTRIES) {
          var old = state.entries.shift(); if (old.el) old.el.remove();
        }
      }
      state.phase = entry.label === 'Next action' ? 'Working' : entry.label === 'Verification' ? 'Verifying' : 'Planning';
      state.live = true;
    } else if (/^(think\s|activity reasoning)/.test(text)) {
      state.phase = 'Reviewing context'; state.live = true;
    } else if (/^(approval-required|ask-user)/.test(text)) {
      state.phase = 'Waiting for you'; state.live = false;
    } else if (/^(stopped\s|run finished:)/.test(text)) {
      state.phase = 'Run ended'; state.live = false;
    } else {
      return;
    }
    if (sess.replaying && sess.session && sess.session.status !== 'running') settleApproach(sess, sess.session);
    else renderApproach(sess);
  }
  function settleApproach(sess, session) {
    var state = approachState(sess);
    if (session.status !== 'running') {
      state.live = false;
      state.phase = ({ completed: 'Completed', failed: 'Failed', blocked: 'Blocked', waiting_for_model: 'Waiting for model' })[session.status] || 'Run ended';
    }
    renderApproach(sess);
  }
`;
