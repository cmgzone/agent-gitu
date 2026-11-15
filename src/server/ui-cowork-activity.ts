/** Calm, animation-free live text updates and completion step summaries in Cowork. */
export const COWORK_CLEAN_ACTIVITY_CSS = String.raw`
  .cw-working-row { width:100%; max-width:min(94%,660px); }
  .cw-working-row[hidden] { display:none; }
  .cw-work-card { display:flex; flex-direction:column; gap:6px; min-width:0; max-width:100%; padding:10px 14px; border:1px solid var(--border); border-left:3px solid var(--border2); border-radius:14px; background:var(--card); box-shadow:none; }
  .cw-working-head { display:flex; align-items:baseline; gap:10px; min-width:0; }
  .cw-work-lead, .cw-working-dot, .cw-team-strip { display:none; }
  .cw-working-bubble { display:flex; align-items:baseline; justify-content:space-between; gap:10px; min-width:0; flex:1; padding:0; border:0; border-radius:0; background:transparent; color:var(--text); font-size:13px; font-weight:600; line-height:1.45; overflow-wrap:anywhere; }
  .cw-work-elapsed { margin-left:auto; flex:none; font-size:11px; font-weight:500; font-variant-numeric:tabular-nums; color:var(--muted); }
  .cw-work-elapsed[hidden] { display:none; }
  .cw-work-stage { display:flex; flex-direction:column; gap:4px; min-width:0; }
  .cw-work-stage[hidden] { display:none; }
  .cw-step-trail { display:flex; flex-direction:column; gap:3px; min-width:0; padding-top:6px; border-top:1px solid var(--border); }
  .cw-step-item { display:flex; align-items:baseline; gap:7px; min-width:0; padding:2px 0; font-size:12px; line-height:1.4; color:var(--muted); }
  .cw-step-item.is-active { color:var(--text); }
  .cw-step-item.is-error { color:#ef4444; }
  .cw-step-state { width:14px; flex:none; text-align:center; font-size:11px; font-weight:600; color:var(--muted); }
  .cw-step-item.is-done .cw-step-state { color:#22c55e; }
  .cw-step-item.is-error .cw-step-state { color:#ef4444; }
  .cw-step-item.is-active .cw-step-state { color:var(--text); }
  .cw-step-who { font-weight:600; color:var(--text); flex:none; }
  .cw-step-label { min-width:0; flex:1; overflow-wrap:anywhere; }
  .cw-receipt-row { width:100%; max-width:min(94%,660px); }
  .cw-receipt-row[hidden] { display:none; }
  .cw-receipt-card { display:inline-flex; flex-direction:column; gap:8px; max-width:100%; padding:7px 12px; border-radius:14px; background:var(--card); border:1px solid var(--border); font-size:12px; color:var(--muted); }
  .cw-receipt-head { display:inline-flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .cw-receipt-avas { display:none; }
  .cw-receipt-check { width:14px; height:14px; display:inline-flex; align-items:center; justify-content:center; color:#22c55e; font-size:11px; font-weight:700; flex:none; }
  .cw-receipt-check.is-error { color:#ef4444; }
  .cw-receipt-summary { color:var(--text); font-weight:600; }
  .cw-receipt-toggle,.cw-receipt-dismiss { background:transparent; border:0; color:var(--muted); font:inherit; font-size:11.5px; font-weight:600; cursor:pointer; padding:2px 6px; border-radius:8px; display:inline-flex; align-items:center; gap:3px; }
  .cw-receipt-toggle:hover,.cw-receipt-dismiss:hover { color:var(--text); background:var(--hover); }
  .cw-receipt-steps { display:flex; flex-direction:column; gap:3px; padding-top:6px; border-top:1px solid var(--border); }
  .cw-receipt-steps[hidden] { display:none; }
  .cw-clean-activity { display:flex; align-items:center; gap:12px; min-height:28px; margin:0 4px 8px; color:var(--muted); font-size:11.5px; }
  .cw-clean-activity[hidden], .cw-clean-activity [hidden] { display:none; }
  .cw-clean-status { display:flex; align-items:center; gap:8px; min-width:0; flex:1; }
  .cw-clean-status span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cw-clean-activity button { flex:none; margin-left:auto; background:transparent; border:0; color:var(--muted); padding:6px 0 6px 8px; font:inherit; font-size:11px; cursor:pointer; }
  .cw-clean-activity button:hover { color:var(--text); }
  .cw .cw-live-row .cw-live-kicker { display:none; }
  .cw .cw-live-row .cw-meta { display:flex; align-items:center; flex-wrap:wrap; gap:6px 10px; min-height:24px; margin-bottom:7px; padding-right:0; }
  .cw .cw-live-row .cw-ava { animation:none; box-shadow:none; }
  .cw .cw-live-row .cw-live-bubble { border:1px solid var(--border); border-left:3px solid var(--border2); background:var(--card); box-shadow:none; }
  .cw .cw-live-row .cw-progress-activity { display:inline-flex; align-items:center; gap:5px; padding:1px 8px; border-radius:999px; font-size:11px; font-weight:500; background:var(--card2); border:1px solid var(--border); color:var(--muted); }
  .cw .cw-live-row .cw-progress-activity :is(.cw-phase-dot,.spinner,.thinking-waves) { display:none; }
  .cw .cw-live-row .cw-progress-text { margin:0; }
  .cw .cw-live-row .cw-progress-text:not(:empty)::after { display:none; }
  .cw .cw-checkpoint-report { border:0; border-left:2px solid var(--border); border-radius:0; padding:4px 0 4px 14px; background:transparent; }
  .cw .cw-work-history > summary { font-weight:400; font-size:11px; color:var(--muted); }
  .cw .cw-work-history:not([open]) { display:none; }
  .cw .cw-work { display:none; }
  @media(max-width:720px) { .cw-msgs .cw-work-lead, .cw-msgs .cw-conn-agent .cw-conn-node-ico, .cw-msgs .cw-collab-pill > .cw-ava, .cw-msgs .cw-receipt-avas { display:none; } .cw-msgs .cw-conn-agent { padding-left:10px; } .cw-msgs .cw-collab-pill { padding-left:9px; } }
`;

export const COWORK_CLEAN_ACTIVITY_JS = String.raw`
  function cwActEsc(value) {
    return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function cwActRedact(raw) {
    var s = String(raw || '').replace(/\s+/g, ' ').trim();
    if (!s) return '';
    s = s.replace(/https?:\/\/[^\s"'<>]+/gi, function (match) {
      var noCred = match.replace(/^(https?:\/\/)[^/@\s]+@/i, '$1');
      return noCred.split(/[?#]/)[0];
    });
    s = s.replace(/\b(authorization)\b(\s*[:=]\s*)(?:(?:bearer|basic|token)\s+)?([^\s"']+)/gi, '$1$2***');
    s = s.replace(/\b(bearer|token|password|passwd|secret|api[_-]?key|access[_-]?token)\b(\s*[:=]\s*|\s+)([^\s"']+)/gi, '$1$2***');
    s = s.replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{8,}\b/g, '***').replace(/\b(?:ghp|gho|github_pat|AIza)[A-Za-z0-9_-]{8,}\b/g, '***');
    return s.length > 120 ? s.slice(0, 117).trimEnd() + '…' : s;
  }
  function cwActHost(url) {
    var m = String(url || '').match(/^https?:\/\/(?:[^/@\s]+@)?([^/?#:\s]+)/i);
    return m ? m[1].replace(/^www\./i, '') : '';
  }
  function cwActFallbackToolText(p) {
    var tool = p && p.tool ? String(p.tool) : '';
    var detail = p && p.detail ? String(p.detail).trim() : '';
    var host = cwActHost(p && p.webUrl);
    if (p && p.appService) {
      var appAction = detail.indexOf('app ') === 0 ? cwActRedact(detail.replace(/^app\s+[^\s·]+\s*·?\s*/, '')) : '';
      return 'Using ' + cwActRedact(p.appService) + (appAction ? ' (' + appAction + ')' : '') + '…';
    }
    if (p && p.mcpServer) {
      var mcpTool = detail.indexOf('mcp ') === 0 ? cwActRedact(detail.slice(4)) : '';
      return 'Using ' + cwActRedact(p.mcpServer) + (mcpTool ? ' (' + mcpTool + ')' : '') + '…';
    }
    if (host) return (tool === 'web_fetch' ? 'Fetching ' : 'Checking ') + host + '…';
    if (tool === 'read_file' && detail.indexOf('read ') === 0 && detail.length > 5) return 'Reading ' + cwActRedact(detail.slice(5)) + '…';
    if (tool === 'write_file' && detail.indexOf('write ') === 0 && detail.length > 6) return 'Writing ' + cwActRedact(detail.slice(6)) + '…';
    if (tool === 'apply_edit' && detail.indexOf('edit ') === 0 && detail.length > 5) return 'Editing ' + cwActRedact(detail.slice(5)) + '…';
    if (tool === 'list_files' && detail.indexOf('list ') === 0 && detail.length > 5) return 'Listing files in ' + cwActRedact(detail.slice(5)) + '…';
    if (tool === 'search_files' && detail.indexOf('search ') === 0 && detail.length > 7) return 'Searching ' + cwActRedact(detail.slice(7)) + '…';
    if ((tool === 'run_command' || tool === 'computer_process') && detail.indexOf('$ ') === 0 && detail.length > 2) return 'Running: ' + cwActRedact(detail.slice(2));
    if (tool === 'message_teammate' || tool === 'spawn_subagent' || tool === 'cowork_subagent' || tool === 'delegate') {
      return detail ? 'Coordinating: ' + cwActRedact(detail.replace(/^(?:delegate|message)\s+/, '')) : 'Coordinating with teammate…';
    }
    return tool ? 'Running ' + tool.replace(/_/g, ' ') + '…' : '';
  }
  function cwActResolveAgent(p, cw) {
    var id = p && p.agentId ? String(p.agentId) : '';
    var name = p && p.agentName ? String(p.agentName) : '';
    var found = id && typeof cwAgentById === 'function' ? cwAgentById(id) : null;
    if (!found && name && cw && Array.isArray(cw.agents)) {
      found = cw.agents.find(function(a){ return a && a.name === name; }) || null;
    }
    if (!found && !id && !name && typeof cwActiveConv === 'function' && typeof cwConvMembers === 'function') {
      var conv = cwActiveConv();
      var mems = conv ? cwConvMembers(conv) : [];
      if (cw && cw.working) found = mems.find(function(a){ return a && a.name === cw.working; }) || null;
      if (!found && conv && conv.chiefId) found = mems.find(function(a){ return a && a.id === conv.chiefId; }) || null;
      if (!found) found = mems[0] || null;
    }
    return found || { id:id || name || 'lead', name:name || (cw && cw.working) || '' };
  }
  function cwActIsPlaceholderText(t) {
    return !t || /^(?:Working(?:\u2026|\.\.\.)|Thinking(?:\u2026|\.\.\.))$/i.test(t);
  }
  function cwActSafeStepLabel(p, cw, priorStepsCount) {
    if (!p) {
      var idleTodo = cw && Array.isArray(cw.todos) ? cw.todos.find(function(t){ return t && t.status === 'in_progress'; }) : null;
      return idleTodo && idleTodo.text ? 'Working on: ' + cwActRedact(idleTodo.text) : 'Working on your request…';
    }
    var toolText = p.tool ? ((typeof cwToolProgressText === 'function' ? cwToolProgressText(p) : '') || cwActFallbackToolText(p)) : '';
    if (p.toolOk === false) {
      return (p.detail && toolText) ? 'Failed: ' + toolText.replace(/…$/, '') : 'A step failed';
    }
    if (p.tool) {
      return toolText || 'Running a workspace step…';
    }
    var vis = typeof cwVisibleReply === 'function' ? cwVisibleReply(p.text || '') : String(p.text || '');
    var firstLine = vis ? cwActRedact(vis.split(/\r?\n/)[0]) : '';
    if (firstLine && !cwActIsPlaceholderText(firstLine)) return firstLine;
    var activeTodo = cw && Array.isArray(cw.todos) ? cw.todos.find(function(t){ return t && t.status === 'in_progress' && (!p.agentId || !t.agentId || t.agentId === p.agentId); }) : null;
    if (activeTodo && activeTodo.text) return 'Working on: ' + cwActRedact(activeTodo.text);
    if (p.phase === 'responding') return 'Writing a reply…';
    if (p.phase === 'reasoning') return priorStepsCount ? 'Reviewing results for the next step…' : 'Planning the next step…';
    return priorStepsCount ? 'Preparing the next step…' : 'Working on your request…';
  }
  function cwActFormatDuration(ms) {
    var sec = Math.max(0, Math.floor((ms || 0) / 100) / 10);
    return sec < 10 ? sec.toFixed(1) + 's' : Math.round(sec) + 's';
  }
  function cwActHasMeaningfulStep(p, cw, label) {
    if (!p) return false;
    if (p.tool || p.appService || p.mcpServer || p.webUrl || p.toolOk === false) return true;
    if (p.phase === 'responding' || p.phase === 'reasoning') return true;
    if (cw && Array.isArray(cw.todos) && cw.todos.some(function(t){ return t && t.status === 'in_progress'; })) return true;
    return Boolean(label && label !== 'Working on your request…');
  }
  function cwActSyncTracker(cw, progresses, hasOpenReq) {
    var runKey = ((cw && cw.active) || 'default') + ':' + ((cw && cw.activeThreadId) || 'main');
    if (!cw._actRuns) cw._actRuns = {};
    if (!cw._actCompleted) cw._actCompleted = {};
    var now = Date.now();
    var run = cw._actRuns[runKey];
    if (cw.busy && !hasOpenReq) {
      if (!run || !run.busyActive) {
        run = { startedAt:now, steps:[], participants:[], busyActive:true };
        cw._actRuns[runKey] = run;
        delete cw._actCompleted[runKey];
      }
      var list = progresses.length ? progresses : [{ agentName:(cw && cw.working) || '' }];
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        var agent = cwActResolveAgent(p, cw);
        var aKey = String(agent.id || agent.name || 'lead');
        var label = cwActSafeStepLabel(p, cw, run.steps.length);
        if (agent.name) {
          var existingPart = run.participants.find(function(x){ return x.key === aKey; });
          if (!existingPart) {
            run.participants.push({ key:aKey, name:agent.name, label:label, active:true });
          } else {
            existingPart.active = true;
            existingPart.label = label;
          }
        }
        if (cwActHasMeaningfulStep(p, cw, label)) {
          var stepKey = aKey + '|' + label + '|' + (p.toolOk === false ? 'err' : 'ok');
          var lastStep = run.steps[run.steps.length - 1];
          if (!lastStep || lastStep.key !== stepKey) {
            for (var j = 0; j < run.steps.length; j++) { if (run.steps[j].state === 'active') run.steps[j].state = 'done'; }
            run.steps.push({ key:stepKey, agentKey:aKey, agentName:agent.name || '', label:label, state:p.toolOk === false ? 'error' : 'active', ts:now });
            if (run.steps.length > 12) run.steps.shift();
          } else {
            lastStep.state = p.toolOk === false ? 'error' : 'active';
          }
        }
      }
      return { runKey:runKey, run:run, completed:null };
    }
    if (run && run.busyActive) {
      run.busyActive = false;
      run.endedAt = now;
      for (var k = 0; k < run.steps.length; k++) { if (run.steps[k].state === 'active') run.steps[k].state = 'done'; }
      for (var m = 0; m < run.participants.length; m++) { run.participants[m].active = false; }
      if (run.steps.length > 0) {
        cw._actCompleted[runKey] = { startedAt:run.startedAt, endedAt:run.endedAt, steps:run.steps.slice(-8), participants:run.participants.slice(0,5), expanded:false, dismissed:false };
      }
    }
    return { runKey:runKey, run:run, completed:cw._actCompleted[runKey] || null };
  }
  function cwActRenderTeamStrip() {
    var strip = $('cwTeamStrip');
    if (!strip) return;
    strip.hidden = true;
    strip._cwSig = '';
    if (strip.innerHTML) strip.innerHTML = '';
  }
  function cwActRenderStepRow(st) {
    var glyph = st.state === 'done' ? '✓' : st.state === 'error' ? '!' : '•';
    var who = st.agentName ? '<span class="cw-step-who">' + cwActEsc(st.agentName) + '</span>' : '';
    return '<div class="cw-step-item is-' + st.state + '"><span class="cw-step-state" aria-hidden="true">' + glyph + '</span>' + who + '<span class="cw-step-label">' + cwActEsc(st.label) + '</span></div>';
  }
  function cwActRenderStage(cw, progresses, inChat, sync) {
    var lead = $('cwWorkingLead'), stage = $('cwWorkingStage'), elapsed = $('cwWorkingElapsed');
    var run = sync && sync.run;
    if (lead) { lead.hidden = true; lead._cwSig = ''; if (lead.innerHTML) lead.innerHTML = ''; }
    if (!stage && !elapsed) return;
    if (!inChat) {
      if (elapsed) elapsed.hidden = true;
      if (stage) { stage.hidden = true; stage._cwSig = ''; if (stage.innerHTML) stage.innerHTML = ''; }
      return;
    }
    if (elapsed && run) {
      elapsed.hidden = false;
      var elTxt = cwActFormatDuration(Date.now() - run.startedAt);
      if (elapsed.textContent !== elTxt) elapsed.textContent = elTxt;
    }
    if (!stage) return;
    var parts = run && run.participants ? run.participants.filter(function(pt){ return pt.active; }) : [];
    var steps = run && run.steps ? run.steps.slice(-5) : [];
    var showStage = steps.length > 1 || parts.length > 1;
    if (!showStage) {
      stage.hidden = true;
      stage._cwSig = '';
      if (stage.innerHTML) stage.innerHTML = '';
      return;
    }
    var stageHtml = '<div class="cw-step-trail">';
    if (parts.length > 1) {
      stageHtml += parts.slice(0, 4).map(function(pt){
        return cwActRenderStepRow({ agentName:pt.name, label:pt.label, state:'active' });
      }).join('');
    } else {
      stageHtml += steps.map(cwActRenderStepRow).join('');
    }
    stageHtml += '</div>';
    stage.hidden = false;
    if (stage._cwSig !== stageHtml) { stage.innerHTML = stageHtml; stage._cwSig = stageHtml; }
  }
  function cwActRenderReceipt(cw, sync, hasOpenReq) {
    var box = $('cwWorkReceipt');
    if (!box) return;
    var comp = sync && sync.completed;
    var show = Boolean(!cw.busy && !hasOpenReq && comp && !comp.dismissed && comp.steps && comp.steps.length > 0);
    box.hidden = !show;
    if (!show) { box._cwSig = ''; if (box.innerHTML) box.innerHTML = ''; return; }
    var hasErr = comp.steps.some(function(s){ return s.state === 'error'; });
    var dur = cwActFormatDuration((comp.endedAt || Date.now()) - (comp.startedAt || Date.now()));
    var teamCount = (comp.participants || []).length;
    var headSummary = (hasErr ? 'Finished with an issue' : teamCount > 1 ? teamCount + ' teammates finished' : 'Finished') + ' · ' + comp.steps.length + ' ' + (comp.steps.length === 1 ? 'step' : 'steps') + ' · ' + dur;
    var rows = comp.steps.map(cwActRenderStepRow).join('');
    var html = '<div class="cw-receipt-card">' +
      '<div class="cw-receipt-head">' +
        '<span class="cw-receipt-check' + (hasErr ? ' is-error' : '') + '" aria-hidden="true">' + (hasErr ? '!' : '✓') + '</span>' +
        '<span class="cw-receipt-summary">' + cwActEsc(headSummary) + '</span>' +
        '<button type="button" class="cw-receipt-toggle" data-cw-receipt-toggle aria-expanded="' + (comp.expanded ? 'true' : 'false') + '">' + (comp.expanded ? 'Hide steps' : 'Steps') + '</button>' +
        '<button type="button" class="cw-receipt-dismiss" data-cw-receipt-dismiss aria-label="Dismiss summary">×</button>' +
      '</div>' +
      '<div class="cw-receipt-steps"' + (comp.expanded ? '' : ' hidden') + '>' + rows + '</div>' +
    '</div>';
    if (box._cwSig !== html) { box.innerHTML = html; box._cwSig = html; }
    box.onclick = function(ev) {
      if (ev.target && ev.target.closest && ev.target.closest('[data-cw-receipt-dismiss]')) { comp.dismissed = true; cwRenderCleanActivity(); return; }
      if (ev.target && ev.target.closest && ev.target.closest('[data-cw-receipt-toggle]')) { comp.expanded = !comp.expanded; cwRenderCleanActivity(); }
    };
  }
  function cwCleanActivityText() {
    var cw=cwEnsure();
    if((cw.requests||[]).some(function(r){return r.status==='open';}))return 'Waiting for your response';
    if(!cw.busy)return '';
    var progresses=(cw.progresses&&cw.progresses.length)?cw.progresses:(cw.progress?[cw.progress]:[]);
    var progress=progresses[0];
    var runKey = ((cw && cw.active) || 'default') + ':' + ((cw && cw.activeThreadId) || 'main');
    var run = cw._actRuns && cw._actRuns[runKey];
    var priorSteps = run && Array.isArray(run.steps) ? run.steps.length : 0;
    var label = cwActSafeStepLabel(progress, cw, priorSteps);
    var teammates=new Set(progresses.map(function(p){return p.agentId||p.agentName;}).filter(Boolean)).size;
    return label+(teammates>1?' · '+teammates+' teammates':'');
  }
  function cwRenderCleanActivity() {
    var line=$('cwCleanActivity');if(!line)return;
    var cw=cwEnsure(),progresses=(cw.progresses&&cw.progresses.length)?cw.progresses:(cw.progress?[cw.progress]:[]);
    var working=$('cwWorkingBubble'),workingLabel=$('cwWorkingLabel');
    var hasOpenReq=(cw.requests||[]).some(function(r){return r.status==='open';});
    var replying=progresses.some(function(p){if(typeof cwVisibleReply!=='function')return false;var t=cwVisibleReply(p.text);return !!t&&!/^(?:Continuing automatically \(checkpoint \d+\)|Working(?:\u2026|\.\.\.)$)/.test(t);});
    var inChat=!!working&&cw.busy&&!replying&&!hasOpenReq;
    var sync=cwActSyncTracker(cw,progresses,hasOpenReq);
    var text=cwCleanActivityText();
    cwActRenderTeamStrip();
    cwActRenderStage(cw,progresses,inChat,sync);
    cwActRenderReceipt(cw,sync,hasOpenReq);
    if(working){
      var messages=$('cwMsgs'),atBottom=messages&&messages.scrollHeight-messages.scrollTop-messages.clientHeight<120;
      working.hidden=!inChat;
      if(workingLabel&&workingLabel.textContent!==(inChat?text:''))workingLabel.textContent=inChat?text:'';
      if(atBottom)messages.scrollTop=messages.scrollHeight;
    }
    line.hidden=!((cw.workHistory||[]).length)&&(!text||inChat);
    var status=$('cwCleanStatus'),label=$('cwCleanLabel'),details=$('cwCleanDetails');
    status.hidden=!text||inChat;
    if(label.textContent!==text)label.textContent=text;
    var count=(cw.workHistory||[]).length;
    details.hidden=!count;
    var detailText='Work details · '+count;
    if(details.textContent!==detailText)details.textContent=detailText;
    details.onclick=function(){
      var messages=$('cwMsgs');if(!messages)return;
      var groups=messages.querySelectorAll('details[data-cwworkhistory]'),latest=groups[groups.length-1];
      if(!latest)return;
      latest.open=true;
      latest.scrollIntoView({block:'nearest',behavior:'instant'});
      var summary=latest.querySelector('summary');if(summary)summary.focus({preventScroll:true});
    };
  }
`;
