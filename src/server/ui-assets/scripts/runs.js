  var OFFLINE_MAIN_RUN_PREFIX = 'gitu.offline.main-run.v1.';
  var OFFLINE_MAIN_ACTIVE_KEY = 'gitu.offline.main-run.active.v1';
  function persistOfflineMainRun(runId) {
    var sess = S.sessions && S.sessions[runId];
    if (!sess || !runId) return;
    if (sess.offlineSaveTimer) clearTimeout(sess.offlineSaveTimer);
    sess.offlineSaveTimer = setTimeout(function () {
      sess.offlineSaveTimer = null;
      try {
        var session = sess.session || {},
          snapshot = {
            runId: runId,
            chatish: Boolean(sess.chatish),
            projectPath: sess.projectPath || session.projectPath,
            session: {
              runId: session.runId || runId, goal: session.goal, mode: session.mode,
              status: session.status, startedAt: session.startedAt, finishedAt: session.finishedAt,
              report: session.report, error: session.error, projectPath: session.projectPath,
              project: session.project, taskId: session.taskId, provider: session.provider,
              model: session.model, effort: session.effort, progress: session.progress
            },
            events: (sess.events || []).slice(-160).map(function (event) {
              return { i: event.i, t: event.t, text: event.text, typed: event.typed };
            })
          }, value = JSON.stringify(snapshot);
        while (value.length > 350000 && snapshot.events.length > 1) {
          snapshot.events.shift(); value = JSON.stringify(snapshot);
        }
        localStorage.setItem(OFFLINE_MAIN_RUN_PREFIX + encodeURIComponent(runId), value);
        localStorage.setItem(OFFLINE_MAIN_ACTIVE_KEY, runId);
      } catch (error) {}
    }, 300);
  }
  function restoreOfflineMainRun() {
    try {
      var runId = localStorage.getItem(OFFLINE_MAIN_ACTIVE_KEY);
      if (!runId || !/^[\w-]{1,150}$/.test(runId)) return false;
      var snapshot = JSON.parse(localStorage.getItem(OFFLINE_MAIN_RUN_PREFIX + encodeURIComponent(runId)) || 'null');
      if (!snapshot || snapshot.runId !== runId || !Array.isArray(snapshot.events)) return false;
      S.sessions[runId] = {
        events: snapshot.events, session: snapshot.session || null, chatish: Boolean(snapshot.chatish),
        projectPath: snapshot.projectPath, side: 'state', nodes: {}, pendingFiles: [],
        lastIndex: snapshot.events.length ? snapshot.events[snapshot.events.length - 1].i : -1,
        offlineSnapshot: true
      };
      openRun(runId, { chatish: Boolean(snapshot.chatish), projectPath: snapshot.projectPath });
      setWorking(null);
      var stream = $('stream');
      if (stream) {
        var note = document.createElement('div'); note.className = 'timeline-trim-note';
        note.textContent = 'Saved conversation · offline copy'; stream.insertBefore(note, stream.firstChild);
      }
      toast('Showing the saved Agent conversation offline.');
      return true;
    } catch (error) { return false; }
  }

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
    homeCaptureDrafts();
    var startedProject=effectiveProjectPath(),startedFiles=pendingFor(),sentFiles=startedFiles.slice();
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
        projectPath: startedProject || undefined,
        scope: S.settings.scope || [],
        constraints: (S.settings.constraints || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean),
        files: sentFiles.length ? sentFiles : undefined
      })
    }).then(function (r) {
      unlock();
      setPlanRequested('home', false);
      homeClearStartedDraft(startedProject,goal);
      sentFiles.forEach(function(file){var index=startedFiles.indexOf(file);if(index>=0)startedFiles.splice(index,1);});
      openRun(r.runId, { chatish: false, goal: goal, projectPath:startedProject });
      renderSidebar();
    }, function (e) {
      unlock();
      toast('Failed to start: ' + e.message, true);
    });
  }

  if (typeof document.addEventListener === 'function') document.addEventListener('click', function (event) {
    var button = event.target && event.target.closest && event.target.closest('[data-main-coding-task]');
    if (!button) return;
    var id = button.getAttribute('data-main-coding-task');
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) return;
    event.preventDefault();
    if (typeof S !== 'undefined' && S.active === 'cowork' && typeof cwInspectCodingTask === 'function') {
      cwInspectCodingTask(id);
      return;
    }
    api('/api/runs/' + id).then(function (task) { openRun(id, { projectPath: task.projectPath, mode: task.mode }); }).catch(function (error) { toast(error.message, true); });
  });

  function renderCoworkCodingSource(session) {
    var stream=$('stream'),source=session.coworkTask,card=$('coworkCodingSource');
    if(!stream||!source)return;
    if(!card){card=document.createElement('div');card.id='coworkCodingSource';card.className='timeline-trim-note';stream.insertBefore(card,stream.firstChild);}
    if(source.execution==='private'&&$('runProject')){var project=$('runProject');project.disabled=true;project.title='This project is on the teammate’s private computer';project.querySelector('span').textContent=session.project||'Private project';}
    var signature=JSON.stringify(source);if(card.dataset.source===signature)return;card.dataset.source=signature;
    card.innerHTML='<span>Main Agent Gitu · requested by '+esc(source.agentName)+' · '+(source.execution==='private'?'Private computer':'Project workspace')+'</span> <button type="button" class="btn ghost">Message '+esc(source.agentName)+'</button>';
    card.querySelector('button').onclick=function(){
      openCowork(); cwOpenConv(source.conversationId);
    };
    if($('follow'))$('follow').placeholder='Message the coding agent · '+source.agentName+' stays informed';
  }

  function collectSessionStages(sess) {
    var events = (sess && sess.events) || [];
    var stages = [];
    for (var i = 0; i < events.length; i++) {
      var ev = events[i];
      var text = String((ev && ev.text) || '');
      if (text.indexOf('user-msg ') === 0) {
        if (stages.length) stages[stages.length - 1].endPos = i;
        var prompt = text.slice(9).trim();
        stages.push({
          index: stages.length + 1,
          eventId: ev.i,
          startPos: i,
          endPos: events.length,
          prompt: prompt,
          title: shortText(prompt || ('Message ' + (stages.length + 1)), 76),
          time: ev.t || '',
        });
      }
    }
    return stages;
  }

  function currentVisibleStageIndex(runId) {
    var sess = S.sessions[runId];
    if (!sess) return 0;
    var stages = collectSessionStages(sess);
    if (!stages.length) return 0;
    if (sess.viewingStage != null) return Math.max(1, Math.min(stages.length, sess.viewingStage));
    var stream = $('stream');
    if (!stream || nearBottom(stream)) return stages.length;
    var anchors = stream.querySelectorAll('.usermsg[data-stage-event-id]');
    if (!anchors.length) return stages.length;
    var streamTop = stream.getBoundingClientRect().top + 130;
    var bestId = null;
    for (var i = 0; i < anchors.length; i++) {
      var rect = anchors[i].getBoundingClientRect();
      if (rect.top <= streamTop) bestId = anchors[i].getAttribute('data-stage-event-id');
      else if (bestId === null) { bestId = anchors[i].getAttribute('data-stage-event-id'); break; }
    }
    if (bestId != null) {
      for (var s = 0; s < stages.length; s++) {
        if (String(stages[s].eventId) === String(bestId)) return stages[s].index;
      }
    }
    return stages.length;
  }

  function scrollStreamToNode(stream, el, instant) {
    if (!stream || !el) return;
    var streamRect = stream.getBoundingClientRect();
    var elRect = el.getBoundingClientRect();
    var topOffset = (typeof window !== 'undefined' && window.innerWidth <= 720) ? 86 : 96;
    var targetTop = Math.max(0, stream.scrollTop + (elRect.top - streamRect.top) - topOffset);
    stream.dataset.follow = 'false';
    if (!instant && typeof stream.scrollTo === 'function') stream.scrollTo({ top: targetTop, behavior: 'smooth' });
    else stream.scrollTop = targetTop;
    el.classList.remove('stage-jump-highlight');
    void el.offsetWidth;
    el.classList.add('stage-jump-highlight');
    setTimeout(function () { if (el.isConnected) el.classList.remove('stage-jump-highlight'); }, 1600);
    updateStageDotRail(S.active);
  }

  function renderTrimNote(stream, hiddenCount) {
    if (!stream || hiddenCount <= 0) return;
    var note = document.createElement('div');
    note.className = 'timeline-trim-note';
    note.textContent = hiddenCount + ' earlier event' + (hiddenCount === 1 ? '' : 's') + ' preserved in history.';
    var working = $('working');
    if (working) stream.insertBefore(note, working); else stream.appendChild(note);
  }

  function renderStreamSlice(runId, opts) {
    var stream = $('stream');
    var sess = S.sessions[runId];
    if (!stream || !sess || S.active !== runId) return;
    var preserve = {
      typedApprovals: sess.typedApprovals || {},
      typedPlanReview: sess.typedPlanReview || null,
      typedQuestions: sess.typedQuestions || null,
      settledGates: sess.settledGates || {},
      checkpoints: sess.checkpoints || [],
      checkpointsFetchedAt: sess.checkpointsFetchedAt || 0,
    };
    Array.prototype.slice.call(stream.children).forEach(function (child) {
      if (child.id === 'runCheckpoints' || child.id === 'coworkCodingSource' || child.id === 'working') return;
      child.remove();
    });
    stream.dataset.trimmed = '0';
    sess.nodes = {};
    resetStreamRenderState(sess);
    sess.typedApprovals = preserve.typedApprovals;
    sess.typedPlanReview = preserve.typedPlanReview;
    sess.typedQuestions = preserve.typedQuestions;
    sess.settledGates = preserve.settledGates;
    sess.checkpoints = preserve.checkpoints;
    sess.checkpointsFetchedAt = preserve.checkpointsFetchedAt;

    var viewingStage = opts && opts.viewingStage != null ? opts.viewingStage : null;
    sess.viewingStage = viewingStage;
    var startPos = opts && typeof opts.startPos === 'number'
      ? Math.max(0, Math.min(sess.events.length, opts.startPos))
      : Math.max(0, sess.events.length - MAX_REPLAY_EVENTS);
    var slice = viewingStage != null
      ? sess.events.slice(startPos, Math.min(sess.events.length, startPos + MAX_REPLAY_EVENTS))
      : sess.events.slice(startPos);

    if (viewingStage == null && startPos > 0) renderTrimNote(stream, startPos);

    sess.replaying = true;
    slice.forEach(function (ev) { appendEvent(runId, ev); });
    sess.replaying = false;
    if (sess.session && ['running', 'waiting_for_model'].indexOf(sess.session.status) < 0) setWorking(null);

    if (viewingStage == null) {
      if (sess.session && sess.session.status !== 'running' && sess.session.report) {
        appendSummary(runId, sess.session);
        sess.summaryShown = JSON.stringify([sess.session.finishedAt, sess.session.report]);
      }
      renderApprovals(runId, sess.session);
      renderPlanReview(runId, sess.session);
      renderQuestions(runId, sess.session);
      renderErrorCard(runId, sess.session);
      if (opts && opts.highlightEventId != null) {
        var targetInTail = stream.querySelector('.usermsg[data-stage-event-id="' + String(opts.highlightEventId) + '"]');
        if (targetInTail) scrollStreamToNode(stream, targetInTail, true);
        else stickScroll(stream, true);
      } else {
        stickScroll(stream, true);
      }
    } else {
      var targetHist = opts && opts.highlightEventId != null
        ? stream.querySelector('.usermsg[data-stage-event-id="' + String(opts.highlightEventId) + '"]')
        : null;
      if (targetHist) scrollStreamToNode(stream, targetHist, true);
      else { stream.dataset.follow = 'false'; stream.scrollTop = 0; }
    }
    updateStageDotRail(runId);
  }

  function jumpToStage(runId, stageNumber) {
    var sess = S.sessions[runId];
    var stream = $('stream');
    if (!sess || !stream || S.active !== runId) return;
    var stages = collectSessionStages(sess);
    var target = stages[stageNumber - 1];
    if (!target) return;
    hideStageRailTip();
    if (stageNumber === stages.length && sess.viewingStage != null) {
      returnToLatest(runId);
      return;
    }
    var tailStart = Math.max(0, sess.events.length - MAX_REPLAY_EVENTS);
    if (sess.viewingStage == null && target.startPos >= tailStart) {
      var existing = stream.querySelector('.usermsg[data-stage-event-id="' + String(target.eventId) + '"]');
      if (existing) {
        scrollStreamToNode(stream, existing);
        updateStageDotRail(runId);
        return;
      }
    }
    if (target.startPos >= tailStart) {
      renderStreamSlice(runId, { startPos: tailStart, viewingStage: null, highlightEventId: target.eventId });
    } else {
      renderStreamSlice(runId, { startPos: target.startPos, viewingStage: target.index, highlightEventId: target.eventId });
    }
  }

  function returnToLatest(runId) {
    var sess = S.sessions[runId];
    var stream = $('stream');
    if (!sess || !stream || S.active !== runId) return;
    hideStageRailTip();
    if (sess.viewingStage != null) {
      var tailStart = Math.max(0, sess.events.length - MAX_REPLAY_EVENTS);
      renderStreamSlice(runId, { startPos: tailStart, viewingStage: null, highlightEventId: null });
      return;
    }
    stickScroll(stream, true);
    updateStageDotRail(runId);
  }

  function hideStageRailTip() {
    var tip = $('stageRailTip');
    if (tip) tip.hidden = true;
  }

  function showStageRailTip(dotEl, text) {
    var tip = $('stageRailTip');
    var main = dotEl && dotEl.closest ? dotEl.closest('.run-main') : null;
    if (!tip || !dotEl || !main || !text) return;
    var mainRect = main.getBoundingClientRect();
    var dotRect = dotEl.getBoundingClientRect();
    tip.textContent = text;
    tip.hidden = false;
    var top = Math.max(68, Math.min(mainRect.height - 96, (dotRect.top - mainRect.top) + dotRect.height / 2));
    tip.style.top = top + 'px';
  }

  function updateStageDotRail(runId) {
    if (S.active !== runId) return;
    var rail = $('stageDotRail');
    var sess = S.sessions[runId];
    if (!rail || !sess) return;
    var stages = collectSessionStages(sess);
    if (stages.length < 2) {
      rail.hidden = true;
      hideStageRailTip();
      return;
    }
    rail.hidden = false;
    var currentIdx = currentVisibleStageIndex(runId);
    var sig = stages.map(function (st) { return st.index + ':' + st.eventId + ':' + st.title; }).join('|');
    if (rail.dataset.stageSig !== sig) {
      rail.dataset.stageSig = sig;
      rail.innerHTML = stages.map(function (st) {
        var isLast = st.index === stages.length;
        var label = st.title || ('Stage ' + st.index);
        return '<button type="button" class="stage-rail-dot" data-stage-dot="' + esc(String(st.index)) + '" data-stage-tip="' + esc(label) + '" aria-label="Jump to stage ' + esc(String(st.index)) + ': ' + esc(label) + '"' + (isLast ? ' data-stage-last="1"' : '') + '><span class="srd-pip" aria-hidden="true"></span></button>';
      }).join('');
      rail.querySelectorAll('.stage-rail-dot').forEach(function (dot) {
        var idx = Number(dot.getAttribute('data-stage-dot') || '1');
        var tipText = dot.getAttribute('data-stage-tip') || '';
        dot.onclick = function () {
          if (dot.getAttribute('data-stage-last') === '1' && sess.viewingStage != null) returnToLatest(runId);
          else jumpToStage(runId, idx);
        };
        dot.onmouseenter = function () { showStageRailTip(dot, tipText); };
        dot.onmouseleave = hideStageRailTip;
        dot.onfocus = function () { showStageRailTip(dot, tipText); };
        dot.onblur = hideStageRailTip;
        dot.onkeydown = function (e) {
          if (e.key === 'ArrowUp' && dot.previousElementSibling) { e.preventDefault(); dot.previousElementSibling.focus(); }
          else if (e.key === 'ArrowDown' && dot.nextElementSibling) { e.preventDefault(); dot.nextElementSibling.focus(); }
        };
      });
    }
    var dots = rail.querySelectorAll('.stage-rail-dot');
    for (var i = 0; i < dots.length; i++) {
      var active = Number(dots[i].getAttribute('data-stage-dot')) === currentIdx;
      dots[i].classList.toggle('is-current', active);
      dots[i].setAttribute('aria-current', active ? 'step' : 'false');
    }
  }

  function loadCodingCheckpoints(runId) {
    var body=$('runCheckpointList');if(!body||S.active!==runId)return;
    body.textContent='Loading checkpoints…';
    Promise.all([api('/api/runs/'+encodeURIComponent(runId)+'/checkpoints'),api('/api/runs/'+encodeURIComponent(runId))]).then(function(values){
      if(S.active!==runId||!body.isConnected)return;
      var data=values[0],current=values[1],active=current&&['running','waiting_for_model'].indexOf(current.status)>=0;
      body.innerHTML='<p class="approach-note">Project files are saved before each coding attempt. Restoring keeps a recovery copy. Later edits to changed files are protected.</p>'+(data.checkpoints||[]).map(function(cp){return '<div style="display:flex;gap:12px;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid var(--border)"><span style="min-width:0;overflow-wrap:anywhere"><strong>'+esc(cp.label)+'</strong><br><small>'+esc(new Date(cp.createdAt).toLocaleString())+' · '+(cp.changedFiles===undefined?'Saving task changes':esc(String(cp.changedFiles))+' changed files')+(cp.restoredAt?' · Restored':'')+'</small></span><button type="button" class="btn ghost" data-restore-checkpoint="'+esc(cp.id)+'"'+(active||!cp.sealedAt||cp.restoredAt?' disabled':'')+'>Restore</button></div>';}).join('')+(!(data.checkpoints||[]).length?'<p class="approach-note">A checkpoint appears when the next coding task starts.</p>':'')+(active?'<p class="approach-note">Stop the task and wait for it to finish before restoring.</p>':'');
      body.querySelectorAll('[data-restore-checkpoint]').forEach(function(button){button.onclick=function(){
        button.disabled=true;button.textContent='Restoring…';
        api('/api/runs/'+encodeURIComponent(runId)+'/checkpoints/'+encodeURIComponent(button.dataset.restoreCheckpoint)+'/restore',{method:'POST'}).then(function(){toast('Checkpoint restored. A recovery copy is saved.');pollRun(runId);loadCodingCheckpoints(runId);}).catch(function(error){button.disabled=false;button.textContent='Restore';toast(error.message,true);});
      };});
    }).catch(function(error){if(body.isConnected)body.textContent=error.message;});
  }

  function openRun(runId, opts) {
    homeCaptureDrafts();
    var transition=captureChatTransition();if(S.active===runId)transition=null;
    document.body.classList.remove('cowork');
    S.active = runId;
    try { window.dispatchEvent(new CustomEvent('gitu:view-change', { detail: { active: runId } })); } catch (e) {}
    S.supersedeNext = null;
    toggleMobileNav(false);
    closeToolPanel();
    stopStreams();
    var sess = S.sessions[runId] || (S.sessions[runId] = { events: [], ledger: null, session: null, side: 'state', nodes: {}, pendingFiles: [] });
    try {
      var cacheKey = OFFLINE_MAIN_RUN_PREFIX + encodeURIComponent(runId);
      for (var index = localStorage.length - 1; index >= 0; index--) {
        var key = localStorage.key(index);
        if (key && key.indexOf(OFFLINE_MAIN_RUN_PREFIX) === 0 && key !== cacheKey) localStorage.removeItem(key);
      }
      localStorage.setItem(OFFLINE_MAIN_ACTIVE_KEY, runId);
    } catch (error) {}
    persistOfflineMainRun(runId);
    if(opts&&opts.projectPath)sess.projectPath=opts.projectPath;
    sess.nodes = {};
    sess.viewingStage = null;
    resetStreamRenderState(sess);
    sess.justOpened = true;
    sess.historyReady = false;
    // Attachments are per-composer: switching sessions must show THAT
    // session's staged files (or none), never the previous one's.
    renderThumbs();
    if (opts && opts.chatish !== undefined) sess.chatish = opts.chatish;
    renderSidebar();
    renderTopbar();
    var runProjectName=homeProjectName(homeSidebarPath());
    $('view').innerHTML =
      '<div class="run run-chat home-sky code-workspace">' + homeNavigationHtml(cwProfileAgent()) + '<div class="run-main">' +
      '<button type="button" class="chat-shell-button" id="mainChatHistory" aria-label="Search sessions and tools" title="Search">'+cwIcon('search')+'</button>' +
      '<button type="button" class="chat-shell-button" id="mainChatDetails" aria-label="Open task details" title="Task details">'+cwIcon('panel')+'</button>' +
      '<details class="approach-panel" id="approachPanel"><summary title="Show the agent’s approach and verification updates"><span class="approach-title">Approach</span><span class="approach-count" id="approachCount"></span><span class="approach-latest" id="approachLatest"></span><span class="approach-status" id="approachStatus"></span></summary><ol class="approach-log" id="approachLog" aria-label="Approach updates" tabindex="0"></ol><p class="approach-note" id="approachEmpty">A brief explanation of the next action appears as the agent works.</p><p class="approach-note" id="approachHistory" hidden></p><p class="approach-note">Progress summaries · hypotheses remain unverified until checked.</p></details>' +
      '<nav class="stage-dot-rail" id="stageDotRail" aria-label="Session stages" hidden></nav><div class="stage-rail-tip" id="stageRailTip" role="tooltip" hidden></div>' +
      '<div class="stream" id="stream" role="region" aria-label="Agent activity" tabindex="0"><details class="coding-checkpoints" id="runCheckpoints"><summary>Checkpoints &amp; rollback</summary><div id="runCheckpointList" style="padding:0 14px 10px"></div></details></div>' +
      '<button type="button" class="jump-latest" id="jumpLatest" hidden>↓ Jump to latest</button>' +
      '<div class="bottom-composer"><details class="composer-todos" id="composerTodos" aria-label="Current task checklist" hidden></details><div class="composer-topline"><button type="button" class="composer-workspace" id="runProject" aria-label="Project '+esc(runProjectName)+'" title="Browse project folder">'+icon('folder')+'<span>'+esc(runProjectName)+'</span></button>' +
      '<button type="button" class="main-work-details" id="mainWorkDetails" aria-expanded="false" aria-controls="approachPanel">Work details</button>' +
      codingAccessPillHtml() +
      '<button type="button" class="context-trigger unknown" id="contextToggle" title="Session context and token usage" aria-label="Session context and token usage" aria-expanded="false" aria-controls="contextCard"><svg viewBox="0 0 24 24" aria-hidden="true"><circle class="context-ring-track" cx="12" cy="12" r="9"/><circle class="context-ring-progress" cx="12" cy="12" r="9" pathLength="100"/><circle class="context-ring-core" cx="12" cy="12" r="2"/></svg></button></div>' +
      '<div class="composer"><textarea id="follow" rows="1" placeholder="Message Agent Gitu…" title="Enter sends to this session while working, or continues it when done"></textarea>' +
      '<div class="thumbs" id="thumbs" hidden></div><div class="run-folder-tags" id="runFolderTags" aria-label="Tagged reference folders" hidden></div>' +
      '<div class="composer-bar">' + controlsHtml() + '<button type="button" class="pill new-task-pill" id="newTaskToggle" aria-pressed="false" aria-label="Start a new task in this session" title="Start a new task in this session instead of continuing the current one">New task</button>' + '<button class="send" id="send2" aria-label="Send message">&#8593;</button></div>' +
      '<div class="context-card" id="contextCard" hidden><div class="context-card-head"><span>Session context</span><button type="button" class="ubtn" id="contextClose" aria-label="Close context card">&times;</button></div><div id="contextCardBody"></div></div></div></div>' +
      '</div></div>';
    $('follow').value=homeWorkspaceState().followDrafts[runId]||'';
    $('runCheckpoints').addEventListener('toggle',function(){if(this.open)loadCodingCheckpoints(runId);});
    $('contextToggle').onclick = function () { toggleContextCard(); };
    $('runProject').onclick = function(){openFolderBrowser('inspect',homeSidebarPath());};
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
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return;
      e.preventDefault();
      var g = $('follow').value.trim();
      if (!g && pendingFor().length) g = 'Please review the attached file or document.';
      if (!g) return;
      sendFollow(g);
    });
  // Typing flips the button to Send even while the agent is running.
  $('follow').addEventListener('input', function () { homeSaveFollowDraft(runId,this.value); this.style.height = 'auto'; this.style.height = Math.min(180, this.scrollHeight) + 'px'; updateSendState(); });
    $('newTaskToggle').onclick = function () {
      // A press applies to the next message only; sendFollow resets it once the
      // server has accepted the message as a new task.
      var pressed = this.getAttribute('aria-pressed') !== 'true';
      this.setAttribute('aria-pressed', String(pressed));
      this.classList.toggle('active', pressed);
      this.title = pressed
        ? 'This message starts a new task in this session'
        : 'Start a new task in this session instead of continuing the current one';
      updateSendState();
    };
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
      renderTrimNote($('stream'), hiddenCount);
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
    w.innerHTML = '/* GITU_BINDING_ACTIVITY_MARK_HTML */<span class="wtool-ico" id="workingToolIcon" aria-hidden="true" hidden></span><span class="wtext" id="workingText">Connecting…</span><span class="welapsed" id="workingElapsed"></span><div class="reasoning-stream" id="workingReasoning" aria-label="Model reasoning" hidden></div>';
    $('stream').appendChild(w);
    setWorking('Thinking…');
    updateStageDotRail(runId);
    renderRunSide(runId);
    connect(runId);
    pollRun(runId);
    S.poll = setInterval(function () { pollRun(runId); }, 1500);
    bindMainChatShell();
    homeBindNavigation();homeLoadProjects();homeLoadProfile();
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
      updateStageDotRail(runId);
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
        persistOfflineMainRun(runId);
        if (sess.viewingStage != null) {
          updateStageDotRail(runId);
          return;
        }
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
