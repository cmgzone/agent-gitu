

  function updateProgress(L) {
    var p = $('progress');
    if (!p || !L) return;
    var done = 0;
    L.plan.forEach(function (s) { if (s.status === 'done') done++; });
    var total = L.plan.length;
    if (L.mode === 'agent' && !total) { p.style.display = 'none'; return; }
    p.style.display = 'flex';
    $('progText').textContent = total ? 'Plan step ' + done + ' of ' + total : 'Planning…';
    $('progMeta').textContent = L.actions.length + ' actions · ' + L.evidence.length + ' checks';
    var width = Math.min(100, Math.round((done / Math.max(1, total)) * 100));
    $('progFill').style.width = width + '%';
  }

  // Flatten plan steps into the small, actionable checklist shown immediately
  // above the composer. A step with subtasks contributes its subtasks; a
  // simple step contributes itself. Only the first unfinished subtask of the
  // active step is marked as "working", so the list always has one clear next
  // item even when the ledger has not updated individual todo statuses yet.
  function composerTodoItems(ledger) {
    if (!ledger || !Array.isArray(ledger.plan)) return [];
    var items = [];
    ledger.plan.forEach(function (step) {
      if (!step) return;
      var stepText = String(step.description || '').trim();
      var stepStatus = String(step.status || 'pending');
      var todos = Array.isArray(step.subtasks) ? step.subtasks : [];
      if (!todos.length) {
        if (stepText) items.push({ text: stepText, parent: '', status: stepStatus, index: items.length });
        return;
      }
      var firstOpen = -1;
      todos.forEach(function (todo, todoIndex) {
        var done = typeof todo === 'string' ? false : Boolean(todo && todo.done);
        if (firstOpen === -1 && !done) firstOpen = todoIndex;
      });
      todos.forEach(function (todo, todoIndex) {
        var text = typeof todo === 'string' ? todo : String(todo && todo.text || '');
        text = String(text || '').trim();
        if (!text) return;
        var done = stepStatus === 'done' || (typeof todo !== 'string' && Boolean(todo && todo.done));
        var status = done ? 'done' : stepStatus;
        if (status === 'in_progress' && todoIndex !== firstOpen) status = 'pending';
        items.push({ text: text, parent: stepText, status: status, index: items.length });
      });
    });
    return items;
  }

  function composerTodoStatus(status) {
    if (status === 'in_progress') return { rank: 0, label: 'Working', className: 'active' };
    if (status === 'blocked') return { rank: 1, label: 'Blocked', className: 'blocked' };
    if (status === 'failed') return { rank: 1, label: 'Needs retry', className: 'failed' };
    if (status === 'done') return { rank: 3, label: 'Done', className: 'done' };
    return { rank: 2, label: 'Pending', className: 'pending' };
  }

  function renderComposerTodos(runId) {
    if (S.active !== runId) return;
    var panel = $('composerTodos');
    var sess = S.sessions[runId];
    if (!panel || !sess) return;
    if (panel.dataset.runId !== runId) {
      panel.dataset.runId = runId;
      panel.open = Boolean(sess.composerTodosOpen);
      panel.ontoggle = function () {
        var owner = S.sessions[this.dataset.runId];
        if (owner) owner.composerTodosOpen = this.open;
      };
      delete panel.dataset.signature;
    }
    var allItems = composerTodoItems(sess.ledger);
    if (!allItems.length) {
      panel.hidden = !sess.ledger;
      panel.innerHTML = sess.ledger ? '<summary class="composer-todos-head"><span class="composer-todos-title">To-do</span><span class="composer-todos-current">No checklist yet</span></summary><p class="composer-todo-text">The agent has not saved a task checklist yet.</p>' : '';
      panel.dataset.signature = 'empty';
      return;
    }
    var currentItems = allItems.filter(function (item) { return item.status !== 'done'; }).sort(function (a, b) {
      var ar = composerTodoStatus(a.status).rank;
      var br = composerTodoStatus(b.status).rank;
      return ar - br || a.index - b.index;
    });
    var done = allItems.filter(function (item) { return item.status === 'done'; }).length;
    var signature = allItems.map(function (item) { return [item.text, item.parent, item.status].join('\u0001'); }).join('\u0002');
    if (!panel.hidden && panel.dataset.signature === signature) return;
    panel.hidden = false;
    panel.dataset.signature = signature;
    var current = currentItems.length ? currentItems[0].text : 'Checklist complete';
    var count = done + '/' + allItems.length + ' done';
    panel.innerHTML = '<summary class="composer-todos-head"><span class="composer-todos-title">To-do</span><span class="composer-todos-current" title="' + esc(current) + '">' + esc(current) + '</span><span class="composer-todos-count">' + esc(count) + '</span></summary><ol class="composer-todo-list" aria-label="Task checklist">' +
      allItems.map(function (item) {
        var meta = composerTodoStatus(item.status);
        var parent = item.parent && item.parent !== item.text
          ? '<span class="composer-todo-parent" title="' + esc(item.parent) + '"> · ' + esc(item.parent) + '</span>'
          : '';
        var mark = meta.className === 'done' ? '&#10003;' : (meta.className === 'blocked' || meta.className === 'failed' ? '!' : '');
        return '<li class="composer-todo ' + meta.className + '"><span class="composer-todo-mark">' + mark + '</span><span class="composer-todo-text" title="' + esc(item.text) + '">' + esc(item.text) + parent + '</span><span class="composer-todo-state">' + esc(meta.label) + '</span></li>';
      }).join('') + '</ol>';
  }

  // Classify a raw provider/runtime error into a human headline plus a
  // recovery hint. Task details show the headline and retain the raw error
  // in a copyable failure card.
  function failureSummary(error) {
    var text = String(error || '').replace(/\s+/g, ' ').trim();
    if (!text) return { title: 'The run failed', hint: '', canSwitchModel: true };
    if (/Verification could not be completed after two correction opportunities/i.test(text)) {
      return { title: 'Verification stopped this run', hint: 'Review the checks in Technical evidence. Correct a failing check or command, then continue this session to verify again.', canSwitchModel: false };
    }
    if (/Work paused because/i.test(text)) {
      return { title: 'Work paused after no new progress', hint: 'Completed work is saved. Review the last action and continue with a different approach or additional information.', canSwitchModel: false };
    }
    if (/ChatGPT subscription runtime could not start|ChatGPT subscription request failed:\s*spawn\s+(?:EFTYPE|ENOENT|EACCES|EPERM)/i.test(text)) {
      return { title: 'The local Codex runtime could not start', hint: 'Restart Agent Gitu; if it persists, repair or reinstall Agent Gitu (or update Codex), then retry. Changing models will not fix this runtime error.', canSwitchModel: false };
    }
    if (/usage (?:limit|cap)|quota (?:exceeded|exhausted)|insufficient[_ -]quota|purchase more credits|no credits|insufficient balance|\bbilling\b|\b402\b/i.test(text)) {
      var reset = /(?:try again|resets?)\s+(at|in)\s+([^.;,)]+)/i.exec(text);
      var title = /chatgpt/i.test(text) ? 'ChatGPT plan usage limit reached' : 'The selected model ran out of quota or credits';
      if (reset) title += ' — try again ' + reset[1].toLowerCase() + ' ' + reset[2].trim();
      return { title: title, hint: 'Switch models to retry now, or wait for the quota to reset. Your task and history are preserved.', canSwitchModel: true };
    }
    if (/\b401\b|invalid api key|incorrect api key|unauthorized|authentication failed/i.test(text)) {
      return { title: 'The provider rejected its API key', hint: 'Check the key in provider settings, then retry. Your task and history are preserved.', canSwitchModel: true };
    }
    if (/\b429\b|rate limit|too many requests/i.test(text)) {
      return { title: 'The provider rate-limited the request', hint: 'Wait a moment and retry, or switch to another model. Your task and history are preserved.', canSwitchModel: true };
    }
    if (/fetch failed|econnrefused|enotfound|etimedout|econnreset|socket hang up|network error|stream (?:disconnected|ended|closed)/i.test(text)) {
      return { title: 'Could not reach the model provider', hint: 'Check your connection and retry. Your task and history are preserved.', canSwitchModel: true };
    }
    return { title: shortText(text, 140), hint: 'Your task and history are preserved — pick an available model in the composer and send a message to retry.', canSwitchModel: true };
  }

  function pollRun(runId) {
    if (S.active !== runId) return;
    api('/api/runs/' + runId).then(function (session) {
      var sess = S.sessions[runId];
      if (!sess || S.active !== runId) return;
      S.pollFailures = 0;
      retainUsageEstimate(sess, session);
      sess.session = session;
      if (typeof persistOfflineMainRun === 'function') persistOfflineMainRun(runId);
      homeRunProjectLabel();
      renderCoworkCodingSource(session);
      sess.taggedFolders = session.taggedFolders || [];
      sess.writableFolders = session.writableFolders || [];
      renderTaggedFolders(runId);
      renderContextCard(runId);
      // A resumed run replays the whole history over SSE, re-creating tool
      // cards from earlier interrupted runs in the "working" state — those
      // suppress the thinking/reasoning/responding indicator for the entire
      // run. Keep sweeping anything that predates this run's start (5s clock-
      // skew margin); the run's own live tool cards are left alone.
      if (sess.runStartedAtMs) interruptWorkingToolRows(sess, sess.runStartedAtMs - 5000);
      // On opening a persisted task, place its model in the composer. That
      // makes continuing it stable; a later picker change is deliberate and
      // is sent as a one-session model override.
      // EXCEPT when the last attempt failed on billing: yanking the picker
      // back to the dead paid model would silently eat the user's free-model
      // recovery — leave the composer alone so their selection stands.
      var billingFail = !!(session.error && /(401|no credits|insufficient balance|billing|usage (?:limit|cap)|quota (?:exceeded|exhausted)|insufficient[_ -]quota|purchase more credits)/i.test(session.error));
      if (!sess.modelSynced && !sess.modelOverride && session.provider && session.model && !billingFail) {
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
      settleApproach(sess, session);
      renderTopbar();
      renderApprovals(runId, session);
      renderPlanReview(runId, session);
      renderQuestions(runId, session);
      renderConnectionRequest(runId, session);
      renderErrorCard(runId, session);
      var summaryKey = session.report && JSON.stringify([session.finishedAt, session.report]);
      if (session.status !== 'running' && session.report && sess.summaryShown !== summaryKey) {
        appendSummary(runId, session);
        sess.summaryShown = summaryKey;
      }
      if (session.status === 'running') {
        sess.justOpened = false;
        if (!S.es) {
          connect(runId);
          S.poll = setInterval(function () { pollRun(runId); }, 1500);
        }
      }
      if (session.taskId) {
        api('/api/tasks/' + session.taskId).then(function (ledger) {
          var s2 = S.sessions[runId];
          if (s2 && S.active === runId) {
            s2.ledger = ledger;
            renderRunSide(runId);
            renderContextCard(runId);
            renderComposerTodos(runId);
            if (s2.chatish) { var pp = $('progress'); if (pp) pp.style.display = 'none'; } else updateProgress(ledger);
          }
        }).catch(function () {});
      } else renderRunSide(runId);
      if (session.status === 'waiting_for_model') {
        interruptWorkingToolRows(sess, undefined);
        var retryAt = session.modelRecovery && session.modelRecovery.nextRetryAt;
        var retrySeconds = retryAt ? Math.max(0, Math.ceil((Date.parse(retryAt) - Date.now()) / 1000)) : 0;
        setWorking('Waiting for the model — retrying automatically' + (retrySeconds ? ' in ' + retrySeconds + 's' : '') + '…');
        updateSendState();
        renderSidebar();
      } else if (session.status !== 'running') {
        retireAbubble(sess);
        closeThought(runId);
        interruptWorkingToolRows(sess, undefined);
        setWorking(null);
        if (S.es && sess.historyReady) { try { S.es.close(); } catch (e) {} S.es = null; }
        S.reconnecting = false;
        if (S.poll) { clearInterval(S.poll); S.poll = null; }
        renderSidebar();
      }
    }).catch(function () {
      // Silent network death used to leave the spinner forever. Count and
      // surface it; SSE onerror handles the visible reconnect state.
      S.pollFailures = (S.pollFailures || 0) + 1;
      if (S.pollFailures === 3) toast('Connection issues — retrying…', true);
    });
  }

  // Keep a stopped run discoverable without echoing the full provider error
  // into the conversation. Details contains the actionable error and retry
  // guidance; the stream only needs a quiet state marker.
  function renderErrorCard(runId, session) {
    var stream = $('stream');
    var sess = S.sessions[runId];
    if (!stream || !sess) return;
    var key = session && session.error ? String(session.error) : '';
    var existing = stream.querySelector('.run-stop-note');
    if (!key || session.status === 'running' || session.status === 'waiting_for_model') {
      if (existing) existing.remove();
      sess.errShownKey = '';
      return;
    }
    if (sess.errShownKey === key && existing) return;
    if (existing) existing.remove();
    sess.errShownKey = key;
    var div = document.createElement('div');
    div.className = 'run-stop-note';
    div.textContent = 'Run stopped — see Task details in the left sidebar to review and retry.';
    var w = $('working');
    if (w) stream.insertBefore(div, w); else stream.appendChild(div);
    stickScroll(stream, true);
  }
