
  function userBubble(text, runId, ubId, ts) {
    // Unique per-send identity: edit/retry/failure/removal must never target
    // the wrong copy when the user sends the exact same text twice.
    var id = ubId || 'ub-' + Date.now().toString(36) + '-' + (++UB_SEQ);
    var div = document.createElement('div');
    div.className = 'usermsg';
    div.setAttribute('data-ubid', id);
    div.setAttribute('data-ubtext', text);
    // Same anatomy as the Cowork "me" bubble: a right-aligned meta line with the
    // sender and send time, then the bubble itself. All styling lives in
    // .usermsg/.ub so the two chats render identically.
    div.innerHTML = '<div class="ub"><div class="umeta"><span class="nm">You</span><span class="tg">' + esc(hhmm(ts || new Date().toISOString())) + '</span></div>' + esc(text) +
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

  function safeRunFileUrl(value) {
    var url = String(value || '');
    return url.indexOf('/api/runs/') === 0 ? url : '';
  }

  function sessionFileCard(meta) {
    var card = document.createElement('div');
    var kind = meta && meta.kind === 'user' ? 'user' : 'assistant';
    card.className = 'session-file ' + kind;
    card.setAttribute('data-file-id', String((meta && meta.id) || ''));

    var previewUrl = safeRunFileUrl(meta && meta.previewUrl);
    var downloadUrl = safeRunFileUrl(meta && meta.downloadUrl);
    var mime = String((meta && meta.mime) || 'application/octet-stream');
    if (previewUrl && mime.indexOf('image/') === 0) {
      var preview = document.createElement('img');
      preview.className = 'file-preview';
      preview.alt = '';
      preview.src = previewUrl;
      card.appendChild(preview);
    } else if (previewUrl && mime.indexOf('video/') === 0) {
      card.classList.add('has-media');
      var video = document.createElement('video');
      video.className = 'file-media';
      video.controls = true;
      video.preload = 'metadata';
      video.src = previewUrl;
      card.appendChild(video);
    } else if (previewUrl && mime.indexOf('audio/') === 0) {
      card.classList.add('has-media');
      var audio = document.createElement('audio');
      audio.className = 'file-media';
      audio.controls = true;
      audio.preload = 'none';
      audio.src = previewUrl;
      card.appendChild(audio);
    } else {
      var fileIcon = document.createElement('span');
      fileIcon.className = 'file-ico';
      fileIcon.innerHTML = icon('file');
      card.appendChild(fileIcon);
    }

    var main = document.createElement('span');
    main.className = 'file-main';
    var name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = String((meta && meta.name) || 'attachment');
    name.title = name.textContent;
    var detail = document.createElement('span');
    detail.className = 'file-meta';
    detail.textContent = (kind === 'user' ? 'you attached' : 'Agent Gitu created') + ' · ' + mime + ' · ' + humanBytes(meta && meta.size);
    main.appendChild(name);
    main.appendChild(detail);
    card.appendChild(main);

    var actions = document.createElement('span');
    actions.className = 'file-actions';
    if (previewUrl) {
      var open = document.createElement('a');
      open.href = previewUrl;
      open.target = '_blank';
      open.rel = 'noopener';
      open.textContent = 'Open';
      actions.appendChild(open);
    }
    if (downloadUrl) {
      var download = document.createElement('a');
      download.href = downloadUrl;
      download.download = name.textContent;
      download.textContent = 'Download';
      actions.appendChild(download);
    }
    card.appendChild(actions);
    return card;
  }

  function removeNarrationReplacedByFile(sess) {
    if (!sess || !sess.nodes) return;
    var live = sess.nodes.abubble || sess.nodes.thought;
    if (live && live.parentNode) live.parentNode.removeChild(live);
    sess.nodes.abubble = null;
    sess.nodes.thought = null;
  }

  function removeUserBubble(runId, text, ubId) {
    var stream = $('stream');
    if (!stream) return;
    var target = ubId ? stream.querySelector('div[data-ubid="' + ubId + '"]') : null;
    if (!target) {
      stream.querySelectorAll('div[data-ubtext]').forEach(function (b) {
        if (b.getAttribute('data-ubtext') === text) target = b;
      });
    }
    if (target) target.remove();
  }

  function nearBottom(el) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  function resetStreamRenderState(sess) {
    sess.summaryShown = null;
    sess.connShown = null;
    sess.qShown = null;
    sess.prShown = null;
    sess.apprShown = {};
    // Typed gate state is live-only: native events are not persisted yet, so a
    // restored or re-rendered session must not keep a card whose frames are gone.
    sess.typedApprovals = {};
    sess.typedPlanReview = null;
    sess.typedQuestions = null;
    sess.settledGates = {};
    sess.pendingUserMessages = [];
  }
  // A report belongs to the run that just ended.  Once a user starts another
  // task in the same session, leaving that final card at the bottom makes it
  // look as if the new request was ignored.  The durable event history is
  // retained; this only removes the stale terminal presentation while the
  // continuation is active.
  function clearRenderedReport(runId) {
    var stream = $('stream');
    if (!stream) return;
    var reports = stream.querySelectorAll('.report-flat');
    for (var i = 0; i < reports.length; i++) reports[i].remove();
    var sess = S.sessions[runId];
    if (sess) sess.summaryShown = null;
  }
  function retainUsageEstimate(sess, incoming) {
    var previous = sess && sess.session && sess.session.usage;
    var next = incoming && incoming.usage;
    // A catalog refresh can briefly omit price metadata. Keep the last
    // accumulated estimate instead of making a visible price turn into “—”.
    if (previous && next && typeof previous.costUsd === 'number' && typeof next.costUsd !== 'number') {
      next.costUsd = previous.costUsd;
      next.costIncomplete = true;
    }
  }
  function updateJumpLatest(stream) {
    var jump = $('jumpLatest');
    if (jump) {
      jump.hidden = nearBottom(stream);
      var composer = document.querySelector('.bottom-composer');
      if (composer) jump.style.bottom = (composer.offsetHeight + 12) + 'px';
    }
  }
  // Chase the bottom ONLY when the user is already reading the tail — never
  // yank someone who scrolled up to re-read. Force=true for action-required
  // content (approvals, failures) where attention matters more than position.
  function stickScroll(stream, force) {
    if (!stream) return;
    if (force || stream.dataset.follow !== 'false') {
      stream.scrollTop = stream.scrollHeight;
      stream.dataset.follow = 'true';
    }
    updateJumpLatest(stream);
  }
  var MAX_REPLAY_EVENTS = 240;
  var MAX_TIMELINE_NODES = 220;
  function trimTimeline(stream) {
    if (!stream) return;
    var nodes = Array.prototype.slice.call(stream.children).filter(function (el) {
      return el.classList.contains('tl-row') || el.classList.contains('shotmsg') || el.classList.contains('abubble') || el.classList.contains('session-file') || el.classList.contains('intake-line');
    });
    if (nodes.length <= MAX_TIMELINE_NODES) return;
    var removeCount = nodes.length - MAX_TIMELINE_NODES;
    for (var i = 0; i < removeCount; i++) nodes[i].remove();
    var total = Number(stream.dataset.trimmed || '0') + removeCount;
    stream.dataset.trimmed = String(total);
    var note = stream.querySelector('.timeline-trim-note');
    if (!note) {
      note = document.createElement('div');
      note.className = 'timeline-trim-note';
      stream.insertBefore(note, stream.firstChild);
    }
    note.textContent = total + ' older activity item' + (total === 1 ? '' : 's') + ' hidden for performance. Full history remains stored.';
  }
  function appendLive(stream, el) {
    var w = $('working');
    var state = S.sessions[S.active];
    if (state && state.replaying) el.classList.add('replayed');
    if (w) stream.insertBefore(el, w); else stream.appendChild(el);
    if ((!state||!state.replaying)&&el.matches('.usermsg,.abubble,.agent-report,.tl-note-row')) chatBubbleEntrance(el);
    trimTimeline(stream);
    stickScroll(stream);
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
    var attached = pendingFor().length ? pendingFor() : undefined;
    var review = !running && planRequested(runId);
    var mc = (S.sel.model || '').split('::');
    var useSelectedModel = Boolean(sess && (sess.modelOverride || !sess.session || !sess.session.provider || !sess.session.model));
    // Show the outgoing message immediately. The server will replace this
    // pending display with its durable user-msg event once it is recorded.
    var sentBubbleId = appendPendingUserMessage(runId, text);
    var follow = $('follow');
    if (follow) follow.value = '';
    var send2 = $('send2');
    if (send2) send2.disabled = true;
    // Textarea cleared: if the agent is still running the button reverts to Stop.
    updateSendState();
    api('/api/runs/' + runId + '/message', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      text: text, files: attached,
      delivery: running ? S.delivery : undefined,
      provider: useSelectedModel ? mc[0] : undefined, model: useSelectedModel ? mc[1] : undefined, useSelectedModel: useSelectedModel,
      effort: S.sel.effort,
      mode: 'agent',
      review: review,
      supersede: sup,
      autoApprove: S.settings.autoApprove
    }) })
      .then(function (result) {
        // The server has accepted the continuation. Remove the terminal card
        // from the previous task before showing the new task's activity.
        // Keeping it visible until the new task completes made an old report
        // appear to be the response to the freshly submitted message.
        if (!running && result && result.ok) clearRenderedReport(runId);
        settlePendingUserMessage(runId, result && result.safeText !== undefined ? result.safeText : credentialChatInput(text).safeText, sentBubbleId, false);
        if (!running) setPlanRequested(runId, false);
        sess.chatish = false;
        if (!running) {
          // Mark the resume boundary: tool cards started BEFORE this moment
          // belong to earlier interrupted runs and must never suppress the
          // thinking indicator (see interruptWorkingToolRows).
          sess.runStartedAtMs = Date.now();
        }
        pendingFor().length = 0;
        renderThumbs();
        setWorking(result && result.credentialRequired ? 'Waiting for secure connection details…' : 'Thinking…');
        // Terminal sessions intentionally close their SSE stream. A follow-up
        // starts the same session again, so reopen it here; polling only
        // refreshes status/ledger and cannot carry live tdelta prose events.
        if (!S.es) connect(runId);
        if (!S.poll) S.poll = setInterval(function () { pollRun(runId); }, 1500);
        pollRun(runId);
      })
      .catch(function (er) {
        var msg = String(er.message);
        if (msg.indexOf('run not found') >= 0) {
          var mc = (S.sel.model || '').split('::');
          api('/api/runs', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              goal: text, provider: mc[0], model: mc[1],
              mode: 'agent',
              review: review,
              autoApprove: S.settings.autoApprove,
              autoLearn: S.settings.autoLearn,
              effort: S.sel.effort,
              autonomy: autonomyBody(),
              projectPath: effectiveProjectPath() || undefined,
              files: attached
            })
          }).then(function (r) { setPlanRequested(runId, false); openRun(r.runId, { chatish: false }); }).catch(function (e2) { failUserBubble(runId, text, e2.message, sentBubbleId); toast(e2.message, true); });
        } else {
          failUserBubble(runId, text, msg, sentBubbleId);
          toast(msg, true);
        }
      })
      .then(function () { var b = $('send2'); if (b) b.disabled = false; });
  }

  function appendPendingUserMessage(runId, text) {
    var stream = $('stream');
    var sess = S.sessions[runId];
    if (!stream || !sess) return null;
    if (!sess.pendingUserMessages) sess.pendingUserMessages = [];
    retireAbubble(sess);
    closeThought(runId);
    var bubble = userBubble('Sending message…', runId);
    bubble.classList.add('pending');
    var ubId = bubble.getAttribute('data-ubid');
    // Remember the send time so the confirmed bubble shows the same clock time.
    sess.pendingUserMessages.push({ id: ubId, text: credentialChatInput(text).safeText, ts: new Date().toISOString() });
    appendLive(stream, bubble);
    stickScroll(stream, true);
    return ubId;
  }

  function settlePendingUserMessage(runId, safeText, ubId, consume) {
    var sess = S.sessions[runId];
    var pending = sess && sess.pendingUserMessages;
    if (!pending) return false;
    var index = pending.findIndex(function (item) { return ubId ? item.id === ubId : item.text === safeText; });
    if (index < 0) return false;
    var item = pending[index];
    item.text = safeText;
    var stream = S.active === runId && $('stream');
    var bubble = stream && stream.querySelector('div[data-ubid="' + item.id + '"]');
    if (bubble && !item.displayed) { bubble.replaceWith(userBubble(safeText, runId, item.id, item.ts)); item.displayed = true; }
    if (consume) pending.splice(index, 1);
    return Boolean(bubble);
  }