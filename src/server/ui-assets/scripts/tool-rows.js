

  // Tool cards left in the "working" state — by a crashed or restarted app, an
  // approval timeout, or a history replay of a run that ended mid-tool —
  // suppress the global thinking/reasoning/responding line forever (a working
  // row "owns" the spinner) and keep their group flagged as running. Mark
  // everything that started before beforeMs as interrupted so a resumed run
  // gets its live indicator back. Rows started AFTER beforeMs (the current
  // run's own tools) are left untouched.
  function interruptWorkingToolRows(sess, beforeMs) {
    if (!sess || !sess.nodes) return;
    var swept = false;
    var groups = [];
    (sess.nodes.toolRows || []).forEach(function (row) {
      if (!row.isConnected || row.dataset.toolState !== 'working') return;
      if (beforeMs !== undefined && Number(row.dataset.startedAt || 0) >= beforeMs) return;
      swept = true;
      row.dataset.toolState = 'done';
      row.dataset.toolStatus = 'interrupted';
      var toolStatus = row.querySelector('.st');
      if (toolStatus) { toolStatus.className = 'st st-warn'; toolStatus.textContent = 'Interrupted'; }
      var outputLabel = row.querySelector('.output-label');
      if (outputLabel) outputLabel.textContent = 'Output · interrupted';
      var output = row.querySelector('pre');
      if (output) output.textContent = 'The run ended before this tool reported a result.';
      var interruptedGroup = toolActivityGroupForRow(row);
      if (interruptedGroup && groups.indexOf(interruptedGroup) < 0) groups.push(interruptedGroup);
    });
    if (!swept) return;
    groups.forEach(refreshToolActivityGroup);
    sealToolActivityGroup(sess, true);
  }

  // An operation can still be running when the agent streams a new public
  // update. Keep that live disclosure at the tail of the update it belongs
  // to; completed activity stays in its original chronological position.
  function followActiveToolActivity(stream, sess) {
    var group = sess && sess.nodes && sess.nodes.toolGroup;
    if (!stream || !group || !group.el || !group.el.isConnected) return;
    if (!group.el.querySelector('.tool-call[data-tool-state="working"]')) return;
    var working = $('working');
    if (working && working.parentNode === stream) stream.insertBefore(group.el, working);
    else stream.appendChild(group.el);
  }

  function toolActivityBoundary(text) {
    return /^(?:tdelta |thought |say |user-msg |activity (?:reasoning|content|tool)|think(?:\s|$)|evidence |plan |criteria |hypothesis |decision |ask-user|approval-required|queued |stopped |continue |done )/.test(String(text || ''));
  }

  // Tool lifecycle matching, shared by the legacy prose path and the typed
  // command frames. Matching on the stable parameter summary keeps parallel
  // rows independent and also handles completions that arrive out of order.
  // The duration suffix is only present on post-execution events; preflight
  // errors/denials do not own a running card and must not accidentally close
  // the previous one.
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
  function findToolRow(state, hint, allowFallback, exactOnly) {
    if (!state || !state.nodes) return null;
    var rows = activeToolRows(state);
    var raw = String(hint || '').trim();
    var key = normalizeToolKey(raw);
    var exact = null;
    for (var ri = 0; ri < rows.length; ri++) {
      var rowKey = String(rows[ri].dataset.toolKey || '');
      if (raw && (rowKey === raw || normalizeToolKey(rowKey) === key)) { exact = rows[ri]; break; }
    }
    if (exact) return exact;
    // A path-only lines event can match an edit; only accept an unambiguous
    // partial match after looking for every exact command match first. This
    // also recovers the prose summary's 160-character truncation: a typed
    // frame carries the full command, the card key holds the truncated one,
    // and containment is what re-links them.
    var partial = rows.filter(function (row) {
      var candidate = normalizeToolKey(row.dataset.toolKey || '');
      return key && candidate && (candidate.indexOf(key) >= 0 || key.indexOf(candidate) >= 0);
    });
    if (partial.length === 1) return partial[0];
    // Typed frames always carry the exact command, so they stop here: a frame
    // for a command the timeline never saw (replay without frames, a foreign
    // emitter) must not stamp an unrelated card. The fallbacks below exist for
    // legacy prose events that had no reliable correlation.
    if (exactOnly) return null;
    // A single active row is unambiguous even for older/replayed events.
    if (rows.length === 1) return rows[0];
    // Old persisted parallel events did not carry a correlation id. FIFO is
    // the least surprising recovery for those rows; new events match above.
    return allowFallback && state.nodes.parallelPending && rows.length ? rows[0] : null;
  }

  // Apply one terminal outcome to a tool card. info.durationMs comes from the
  // prose suffix or the typed event; info.exitCode is the raw fact from the
  // executor's typed event, shown as its own badge and never inferred back out
  // of prose. An absent code stays absent — no exit status, no badge.
  function applyToolOutcome(row, status, info) {
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
    var outputLabel = row.querySelector('.output-label');
    if (outputLabel) outputLabel.textContent = 'Output';
    var outputPre = row.querySelector('pre');
    if (outputPre && outputPre.textContent === 'Waiting for tool output…') outputPre.textContent = 'Tool ' + (status === 'ok' ? 'completed' : status) + '. No output was returned.';
    var duration = row.querySelector('.tool-duration');
    if (duration && info.durationMs != null) {
      var ms = Number(info.durationMs);
      duration.textContent = ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's';
    }
    if (info.exitCode !== undefined) {
      var head = row.querySelector('.tl-cmd');
      var badge = head && head.querySelector('.exit-code');
      if (head && !badge) {
        badge = document.createElement('span');
        var durEl = head.querySelector('.tool-duration');
        if (durEl) head.insertBefore(badge, durEl); else head.appendChild(badge);
      }
      if (badge) {
        badge.className = 'exit-code' + (info.exitCode === 0 ? '' : ' bad');
        badge.textContent = 'exit ' + info.exitCode;
      }
    }
    var detailsEl = row.querySelector('details');
    if (detailsEl && status !== 'ok') detailsEl.open = true;
    refreshToolActivityGroup(toolActivityGroupForRow(row));
  }

  // Finish the working card matching info.key. Returns the row, or null when
  // nothing is waiting on that key.
  function finishToolCard(state, status, info) {
    var key = String((info && info.key) || '').trim();
    if (!key) return null;
    var row = findToolRow(state, key, true, info && info.exactOnly);
    if (!row) return null;
    applyToolOutcome(row, status, info);
    state.nodes.lastTool = row;
    state.nodes.lastOutputTool = row;
    if (activeToolRows(state).length === 0) state.nodes.parallelPending = false;
    // Recently finished cards, so a typed frame that arrives just after the
    // prose line can still upgrade the card it belongs to. Only ever consulted
    // with an exact key match, so a wide pool is safe: the cap exists for the
    // live case (one pool entry per finished card in a session), while a replay
    // restores the whole visible window at once and the frames arrive right
    // after it — a 12-entry pool silently left every earlier restored command
    // without its exit badge.
    var recent = state.nodes.recentFinished || (state.nodes.recentFinished = []);
    recent.push({ key: normalizeToolKey(key), row: row });
    if (recent.length > (state.replaying ? MAX_REPLAY_EVENTS : 12)) recent.shift();
    return row;
  }

  // The legacy prose terminal line (ok … / error …), parsed from the text.
  function finishToolRow(state, status, eventBody) {
    var key = terminalToolSummary(eventBody);
    if (!key) return null;
    var elapsed = /\((\d+)ms\)$/.exec(eventBody);
    return finishToolCard(state, status, { key: key, durationMs: elapsed ? Number(elapsed[1]) : undefined });
  }

  // The typed command frame carries the raw command and the real exit code.
  // The prose line normally finished the card moments earlier — the executor
  // emits them adjacently, prose first — so the frame's job is to upgrade that
  // card with the exit fact, not to build a card of its own: prose keeps the
  // reason text the typed start does not carry, and replayed/restored sessions
  // have prose rows but no frames. Nothing to match means nothing to do.
  function applyCommandFinish(runId, typed) {
    var sess = S.sessions[runId];
    if (!sess || !typed || typed.type !== 'command_finished') return;
    var status = typed.ok ? 'ok' : 'error';
    var info = { key: typed.command, durationMs: typed.durationMs, exitCode: typed.exitCode, exactOnly: true };
    if (finishToolCard(sess, status, info)) return;
    var recent = sess.nodes.recentFinished || [];
    for (var i = recent.length - 1; i >= 0; i--) {
      if (recent[i].row.isConnected && recent[i].key === normalizeToolKey(typed.command)) {
        applyToolOutcome(recent[i].row, status, info);
        return;
      }
    }
  }

  // Attach the real diff to the edit's tool row. Removals render red and
  // additions green: a rewrite that deleted code must never look like a pure
  // addition, which is exactly what a count-only badge showed.
  function applyFileChange(runId, typed) {
    var sess = S.sessions[runId];
    if (!sess || !typed) return;
    var row = findToolRow(sess, typed.path, true);
    if (!row || !typed.diff || !typed.diff.length) return;
    if (row.querySelector('.diffview')) return;
    var wrap = document.createElement('div');
    wrap.className = 'diffview';
    for (var i = 0; i < typed.diff.length; i++) {
      var d = typed.diff[i] || {};
      // A "… N unchanged lines" row is a gap marker, not source.
      var gap = d.kind === 'context' && /^\u2026 \d+ (unchanged|more diff)/.test(String(d.text || ''));
      var line = document.createElement('div');
      line.className = 'dline ' + (gap ? 'gap' : (d.kind === 'add' ? 'add' : d.kind === 'remove' ? 'remove' : 'context'));
      var ln = document.createElement('span');
      ln.className = 'ln';
      ln.textContent = d.newLine || d.oldLine || '';
      var mark = document.createElement('span');
      mark.className = 'mark';
      mark.textContent = d.kind === 'add' ? '+' : d.kind === 'remove' ? '-' : '';
      var tx = document.createElement('span');
      tx.className = 'tx';
      tx.textContent = d.text || '';
      line.appendChild(ln);
      line.appendChild(mark);
      line.appendChild(tx);
      wrap.appendChild(line);
    }
    row.appendChild(wrap);
  }

  // The model's own reasoning. A run that thinks silently is indistinguishable
  // from a run that is stuck, so the trace is shown — collapsed by default,
  // live while it streams.
  function applyReasoning(runId, typed) {
    var stream = $('stream');
    var sess = S.sessions[runId];
    if (!stream || !sess || !typed || !typed.text) return;
    var box = sess.nodes && sess.nodes.think;
    if (!box) {
      var row = document.createElement('div');
      row.className = 'tl-row tl-think';
      box = document.createElement('details');
      box.className = 'thinkbox';
      var sum = document.createElement('summary');
      sum.textContent = "Model's reasoning";
      var pre = document.createElement('pre');
      box.appendChild(sum);
      box.appendChild(pre);
      row.appendChild(box);
      sess.nodes = sess.nodes || {};
      sess.nodes.think = box;
      sess.nodes.thinkOpen = true;
      appendLive(stream, row);
    }
    var body = box.querySelector('pre');
    if (body) body.textContent = typed.text;
    // Open while it is still arriving, and leave it open: the trace is the point.
    if (sess.nodes.thinkOpen) box.open = true;
  }

  // Refused actions, rendered from the typed frames the executor emits at the
  // gate that refused them. This family had no visible rendering before: a
  // refusal is decided in preflight, before the run row that would create a
  // card, so the legacy line only ever looked for a card that cannot exist —
  // and the text adapter maps it to a plain log row rather than guessing at a
  // reason from its wording. The structured code, the tool, and the full
  // detail message exist on the event alone.
  var POLICY_REASON_LABELS = {
    project_guard: 'workspace boundary',
    user_instruction: 'your instruction',
    approval_required: 'approval',
    risk_policy: 'risk policy',
    loop_detected: 'repetition guard',
    repeated_skill_operation: 'repeated operation',
    edit_pressure: 'edit pressure',
    budget_exhausted: 'budget exhausted',
    prerequisite_missing: 'missing prerequisite',
  };