

  function startRun() {
    if (S.starting) return;
    var goal = $('goal') ? $('goal').value.trim() : '';
    if (!goal && pendingFor().length) goal = 'Please review the attached file or document.';
    if (!goal) { if ($('goal')) $('goal').focus(); return; }
    if (!S.modelsLoaded) { toast('Models are still loading — try again in a moment'); return; }
    // First-run funnel: a keyless install can only produce a failing run.
    // Gate it behind provider setup with a one-click path instead.
    if (!hasAnyProviderKey() || !S.sel.model) {
      toast('Connect a model provider first — opening Providers', true);
      openSettings('providers');
      return;
    }
    S.starting = true;
    var sendBtns = [$('send'), $('send2')];
    sendBtns.forEach(function (b) { if (b) b.disabled = true; });
    var unlock = function () {
      S.starting = false;
      sendBtns.forEach(function (b) { if (b) b.disabled = false; });
    };
    var mc = (S.sel.model || '').split('::');
    var review = planRequested('home');
    api('/api/runs', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        goal: goal, provider: mc[0], model: mc[1],
        mode: 'agent',
        review: review,
        autoApprove: S.settings.autoApprove,
        autoLearn: S.settings.autoLearn,
        effort: S.sel.effort,
        autonomy: autonomyBody(),
        projectPath: effectiveProjectPath() || undefined,
        scope: S.settings.scope || [],
        constraints: (S.settings.constraints || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean),
        files: pendingFor().length ? pendingFor() : undefined
      })
    }).then(function (r) {
      unlock();
      setPlanRequested('home', false);
      S.draft = ''; persist();
      pendingFor().length = 0;
      openRun(r.runId, { chatish: false, goal: goal });
      renderSidebar();
    }, function (e) {
      unlock();
      toast('Failed to start: ' + e.message, true);
    });
  }

  function openRun(runId, opts) {
    var transition=captureChatTransition();if(S.active===runId)transition=null;
    document.body.classList.remove('cowork');
    S.active = runId;
    S.supersedeNext = null;
    toggleMobileNav(false);
    closeToolPanel();
    stopStreams();
    var sess = S.sessions[runId] || (S.sessions[runId] = { events: [], ledger: null, session: null, side: 'state', nodes: {}, pendingFiles: [] });
    sess.nodes = {};
    resetStreamRenderState(sess);
    sess.justOpened = true;
    sess.historyReady = false;
    // Attachments are per-composer: switching sessions must show THAT
    // session's staged files (or none), never the previous one's.
    renderThumbs();
    if (opts && opts.chatish !== undefined) sess.chatish = opts.chatish;
    renderSidebar();
    renderTopbar();
    $('view').innerHTML =
      '<div class="run run-chat"><div class="run-main">' + cwPageNavHtml('chat',cwProfileAgent()) +
      '<button type="button" class="chat-shell-button" id="mainChatHistory" aria-label="Search sessions and tools" title="Search">'+cwIcon('search')+'</button>' +
      '<button type="button" class="chat-shell-button" id="mainChatDetails" aria-label="Open task details" title="Task details">'+cwIcon('panel')+'</button>' +
      '<div class="progress" id="progress" style="display:none"><span class="plabel" id="progText"></span><div class="pbar"><span id="progFill"></span></div><span class="plabel" id="progMeta"></span></div>' +
      '<details class="approach-panel" id="approachPanel"><summary title="Show the agent’s approach and verification updates"><span class="approach-title">Approach</span><span class="approach-count" id="approachCount"></span><span class="approach-latest" id="approachLatest"></span><span class="approach-status" id="approachStatus"></span></summary><ol class="approach-log" id="approachLog" aria-label="Approach updates" tabindex="0"></ol><p class="approach-note" id="approachEmpty">A brief explanation of the next action appears as the agent works.</p><p class="approach-note" id="approachHistory" hidden></p><p class="approach-note">Progress summaries · hypotheses remain unverified until checked.</p></details>' +
      '<div class="stream" id="stream" role="region" aria-label="Agent activity" tabindex="0"></div>' +
      '<button type="button" class="jump-latest" id="jumpLatest" hidden>↓ Jump to latest</button>' +
      '<div class="bottom-composer"><details class="composer-todos" id="composerTodos" aria-label="Current task checklist" hidden></details><div class="composer-topline"><button type="button" class="composer-workspace" id="runProject" aria-label="Project '+esc(effectiveProjectName())+'" title="Choose project">'+icon('folder')+'<span>'+esc(effectiveProjectName())+'</span></button>' +
      '<button type="button" class="main-work-details" id="mainWorkDetails" aria-expanded="false" aria-controls="approachPanel">Work details</button>' +
      '<button type="button" class="context-trigger unknown" id="contextToggle" title="Session context and token usage" aria-label="Session context and token usage" aria-expanded="false" aria-controls="contextCard"><svg viewBox="0 0 24 24" aria-hidden="true"><circle class="context-ring-track" cx="12" cy="12" r="9"/><circle class="context-ring-progress" cx="12" cy="12" r="9" pathLength="100"/><circle class="context-ring-core" cx="12" cy="12" r="2"/></svg></button></div>' +
      '<div class="composer"><textarea id="follow" rows="1" placeholder="Message Agent Gitu…" title="Enter sends to this session while working, or continues it when done"></textarea>' +
      '<div class="thumbs" id="thumbs" hidden></div><div class="run-folder-tags" id="runFolderTags" aria-label="Tagged reference folders" hidden></div>' +
      '<div class="composer-bar">' + controlsHtml() + '<button class="send" id="send2" aria-label="Send message">&#8593;</button></div>' +
      '<div class="context-card" id="contextCard" hidden><div class="context-card-head"><span>Session context</span><button type="button" class="ubtn" id="contextClose" aria-label="Close context card">&times;</button></div><div id="contextCardBody"></div></div></div></div>' +
      '</div></div>';
    $('contextToggle').onclick = function () { toggleContextCard(); };
    $('runProject').onclick = openFolderBrowser;
    $('contextClose').onclick = function () { toggleContextCard(false); };
    renderApproach(sess);
    $('approachPanel').open = Boolean(sess.approachOpen);
    $('approachPanel').addEventListener('toggle', function () { sess.approachOpen = this.open; });
    $('stream').addEventListener('scroll', function () {
      this.dataset.follow = nearBottom(this) ? 'true' : 'false';
      updateJumpLatest(this);
    }, { passive: true });
    $('jumpLatest').onclick = function () { stickScroll($('stream'), true); };
    applyLayout();
    renderComposerTodos(runId);
    renderTaggedFolders(runId);
  $('follow').addEventListener('keydown', function (e) {
    // Shift+Enter inserts a newline, same as the home composer — the
    // auto-grow textarea exists precisely for multi-line follow-ups.
    if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();
      var g = $('follow').value.trim();
      if (!g && pendingFor().length) g = 'Please review the attached file or document.';
      if (!g) return;
      sendFollow(g);
    });
  // Typing flips the button to Send even while the agent is running.
  $('follow').addEventListener('input', function () { this.style.height = 'auto'; this.style.height = Math.min(180, this.scrollHeight) + 'px'; updateSendState(); });
    $('send2').onclick = function () {
      // Branch on the button's CURRENT mode (Stop ■ vs Send ↑): while the
      // agent runs, typing flips it to Send so a click queues the message.
      var b = $('send2');
      if (b && b.classList.contains('stop')) {
        if (b) { b.disabled = true; setTimeout(function () { if (b) b.disabled = false; }, 1200); }
        api('/api/runs/' + S.active + '/stop', { method: 'POST' })
          .then(function () { toast('Stop requested — finishing the current step…'); })
          .catch(function (e) { toast(e.message, true); });
        return;
      }
      $('follow').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    };
    updateSendState();
    bindControls();
    bindPaste('follow');
    var replayEvents = sess.events;
    if (replayEvents.length > MAX_REPLAY_EVENTS) {
      var hiddenCount = replayEvents.length - MAX_REPLAY_EVENTS;
      var historyNote = document.createElement('div');
      historyNote.className = 'timeline-trim-note';
      historyNote.textContent = hiddenCount + ' earlier event' + (hiddenCount === 1 ? '' : 's') + ' are preserved in session history. Showing the latest activity.';
      $('stream').appendChild(historyNote);
      replayEvents = replayEvents.slice(-MAX_REPLAY_EVENTS);
    }
    sess.replaying = true;
    replayEvents.forEach(function (ev) { appendEvent(runId, ev); });
    sess.replaying = false;
    sess.lastIndex = sess.events.length ? sess.events[sess.events.length - 1].i : -1;
    var w = document.createElement('div');
    w.className = 'working activity-indicator'; w.id = 'working';
    w.setAttribute('role', 'status');
    w.setAttribute('aria-live', 'polite');
    w.innerHTML = '/* GITU_BINDING_ACTIVITY_MARK_HTML */<span class="wtext" id="workingText">Connecting…</span><span class="welapsed" id="workingElapsed"></span><div class="reasoning-stream" id="workingReasoning" aria-label="Model reasoning" hidden></div>';
    $('stream').appendChild(w);
    setWorking('Thinking…');
    renderRunSide(runId);
    connect(runId);
    pollRun(runId);
    S.poll = setInterval(function () { pollRun(runId); }, 1500);
    bindMainChatShell();
    playChatTransition(transition);
  }

  function connect(runId) {
    stopStreams();
    var es = new EventSource('/api/runs/' + runId + '/stream');
    S.es = es;
    es.addEventListener('replay-end', function () {
      var sess = S.sessions[runId];
      if (!sess || S.active !== runId) return;
      sess.historyReady = true;
      if (sess.session && sess.session.status !== 'running') {
        setWorking(null);
        es.close();
        if (S.es === es) S.es = null;
      }
    });
    es.onmessage = function (msg) {
      var ev = JSON.parse(msg.data);
      var sess = S.sessions[runId];
      if (!sess) return;
      // Stream is alive again: clear any reconnecting state.
      S.esFailures = 0;
      if (S.reconnecting) {
        S.reconnecting = false;
        setWorking(sess.session && sess.session.status === 'running' ? 'Thinking…' : null);
      }
      // A native frame carries seq (the runtime log cursor) and never i (the
      // rendered-row cursor), so it updates typed state here instead of moving
      // the cursor. The legacy prose row for the same transition still renders
      // separately, and neither is derived from the other.
      if (ev.i == null) {
        handleTypedFrame(runId, ev);
        return;
      }
      if (sess.lastIndex == null) sess.lastIndex = -1;
      if (ev.i > sess.lastIndex) {
        sess.lastIndex = ev.i;
        sess.events.push(ev);
        sess.replaying = Boolean(ev.replay);
        appendEvent(runId, ev);
        sess.replaying = false;
        if (sess.session && sess.session.status !== 'running') setWorking(null);
      }
    };
    // A dead socket previously left "Thinking…" on screen forever. Back off
    // and reconnect; the poller keeps backfilling events meanwhile.
    es.onerror = function () {
      var sess = S.sessions[runId];
      try { es.close(); } catch (e) {}
      if (S.es === es) S.es = null;
      if (!sess || S.active !== runId) return;
      if (sess.session && sess.session.status && sess.session.status !== 'running' && sess.historyReady) return;
      S.esFailures = (S.esFailures || 0) + 1;
      S.reconnecting = true;
      setWorking('Connection lost — reconnecting…');
      var delay = Math.min(10000, 1000 * S.esFailures);
      setTimeout(function () {
        var s2 = S.sessions[runId];
        if (!s2 || S.active !== runId || S.es) return;
        if (s2.session && s2.session.status !== 'running') { setWorking(null); S.reconnecting = false; return; }
        connect(runId);
      }, delay);
    };
  }

  var UB_SEQ = 0;