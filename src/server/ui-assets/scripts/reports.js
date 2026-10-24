

  // Keep generated completion cards focused on the result. Some exploration
  // summaries append a generic stack description that reads like stray chat
  // narration; it is still available in the collapsed raw-summary disclosure.
  function reportLede(summary) {
    return readableSummary(summary)
      .replace(/\s*This is a dependency-free static website using vanilla HTML, CSS, and JavaScript\.?/i, '')
      .trim();
  }

  // ── Outcome parsing ─────────────────────────────────────────────────────
  // The model's summary often embeds a machine-style change dump
  // ("CHANGES (all inside repo_root): - NEW path (4490 chars) …"). Split it:
  // the prose before the dump is the outcome the user reads; the dump
  // becomes a human-phrased change list ("Added x", not "NEW x (4490 chars)").
  var CHANGE_VERBS = { NEW: 'Added', CREATED: 'Added', UPDATED: 'Updated', MODIFIED: 'Updated', REWROTE: 'Rewrote', DELETED: 'Removed', REMOVED: 'Removed' };
  function parseOutcome(summary) {
    var text = String(summary || '').trim();
    var out = { lede: text, changes: [], criteriaNote: '', sourceNote: '' };
    var crit = text.match(/(all \d+ acceptance criteria[^.]*\.)/i);
    if (crit) out.criteriaNote = crit[1];
    var src = text.match(/(no (?:production\/)?source code was (?:modified|changed)\.)/i);
    if (src) out.sourceNote = src[1];
    var cut = text.search(/\bCHANGES?\s*\(/i);
    var head = cut >= 0 ? text.slice(0, cut).trim() : text;
    out.lede = head;
    var rest = cut >= 0 ? text.slice(cut) : '';
    var cre = /[-\u2022]\s*(NEW|CREATED|UPDATED|MODIFIED|REWROTE|DELETED|REMOVED)\s+([^\s(,;:]+)/g;
    var m;
    while ((m = cre.exec(rest))) {
      out.changes.push({ action: m[1].toUpperCase(), path: m[2].replace(/[).,]+$/, '') });
    }
    return out;
  }
  // One status strip answering: did it work, was it verified, what moved.
  function reportStatusLine(status, checks, passed, fileCount, updateCount, executionReportOnly) {
    var bits = [];
    bits.push(status === 'complete' ? '<span>🟢 <b>Completed</b></span>'
      : status === 'blocked' ? '<span>⚠️ <b>Blocked</b></span>'
      : status === 'paused' ? '<span>⏸️ <b>Paused</b></span>'
      : status === 'aborted' ? '<span>⏹️ <b>Stopped</b></span>' : '<span>❌ <b>Failed</b></span>');
    if (checks.length) {
      bits.push(passed === checks.length
        ? '<span>✅ All ' + checks.length + ' verification checks passed</span>'
        : '<span>' + (passed ? '⚠️' : '❌') + ' ' + passed + ' passed · ' + (checks.length - passed) + ' failed verification attempt' + (checks.length - passed === 1 ? '' : 's') + '</span>');
    }
    bits.push(executionReportOnly ? '<span>File changes and checks: see execution report</span>' : fileCount
      ? '<span>🛠️ ' + fileCount + ' file' + (fileCount === 1 ? '' : 's') + ' changed</span>'
      : updateCount ? '<span>🛠️ ' + updateCount + ' update' + (updateCount === 1 ? '' : 's') + ' reported</span>'
      : '<span>🔒 No source code was modified</span>');
    return '<div class="r-status">' + bits.join('') + '</div>';
  }
  function telemetryGridHtml(t) {
    var rows = [['Calls', t.calls], ['Tool calls', t.toolCalls], ['Compactions', t.compactions],
      ['Planning calls', t.planningCalls], ['Execution calls', t.executionCalls], ['Screenshots', t.screenshots],
      ['Wasted calls', t.wastedCalls], ['Input tokens', t.inputTokens], ['Cached tokens', t.cachedTokens],
      ['Output tokens', t.outputTokens]];
    var html = '<div class="sec"><h4>Token telemetry</h4><div class="exec-grid">';
    rows.forEach(function (p) { html += '<span class="k">' + p[0] + '</span><span class="v">' + esc(String(p[1])) + '</span>'; });
    return html + '</div></div>';
  }

  function shortText(text, limit) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    return text.length > limit ? text.slice(0, Math.max(1, limit - 1)).trim() + '…' : text;
  }

  function readableCheckLabel(label) {
    label = String(label || '').replace(/\s+/g, ' ').trim();
    var lower = label.toLowerCase();
    if (/\bnpm\s+(?:run\s+)?test\b/.test(lower)) return 'Project test suite';
    if (/\bnpm\s+run\s+(?:build|lint|typecheck)\b/.test(lower)) return shortText(label.match(/npm\s+run\s+\S+/i)?.[0] || label, 100);
    if (/^\$?\s*node\s+-e\b/i.test(label)) return 'Node verification command';
    return shortText(label, 150);
  }

  function compactVerification(text) {
    var raw = String(text || '').replace(/\s+/g, ' ').trim();
    var match = raw.match(/^(PASS|FAIL)\s*\[([^\]]+)\]\s*(.*)$/i);
    var status = match ? match[1].toUpperCase() : (/\bFAIL\b/i.test(raw) ? 'FAIL' : 'PASS');
    var kind = match ? match[2] : 'check';
    var label = match ? match[3] : raw;
    label = readableCheckLabel(label);
    return { passed: status === 'PASS', kind: kind, label: label || 'Verification recorded', details: raw };
  }

  function reportChecks(report) {
    if (Array.isArray(report.verificationDetails) && report.verificationDetails.length) {
      return report.verificationDetails.map(function (item) {
        var details = '';
        if (item.command) details += 'Command\n' + item.command;
        if (item.outputExcerpt) details += (details ? '\n\n' : '') + 'Output\n' + item.outputExcerpt;
        return { passed: item.passed !== false, kind: item.kind || 'check', label: readableCheckLabel(item.label || 'Verification recorded'), details: details, authority: item.authority || 'latest' };
      });
    }
    return (report.verification || []).map(function (item) {
      var parsed = compactVerification(item);
      parsed.authority = 'latest';
      return parsed;
    });
  }

  function checkRow(check) {
    var details = check.details
      ? '<details><summary>Show command and output</summary><pre>' + esc(check.details) + '</pre></details>'
      : '';
    return '<div class="verify-row"><span class="chip ' + (check.passed ? 'ok' : 'bad') + '">' + (check.passed ? 'PASS' : 'FAIL') + '</span>' +
      '<span class="verify-kind">' + esc(check.kind) + '</span><span class="verify-label">' + esc(check.label) + '</span>' +
      (check.authority === 'historical' ? '<span class="verify-kind">historical</span>' : '') + details + '</div>';
  }

  function verificationSection(checks) {
    if (!checks.length) return '';
    var latest = checks.filter(function (check) { return check.authority !== 'historical'; });
    var historical = checks.filter(function (check) { return check.authority === 'historical'; });
    var shown = latest.slice(0, 6);
    var html = '<div class="sec"><h4>Latest / authoritative verification</h4><div class="verify-list">' +
      (shown.length ? shown.map(checkRow).join('') : '<div class="empty">No verification ran against the final workspace state.</div>') + '</div>';
    if (latest.length > shown.length) {
      html += '<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;color:var(--muted)">Show ' + (latest.length - shown.length) + ' more current checks</summary><div class="verify-list" style="margin-top:7px">' + latest.slice(shown.length).map(checkRow).join('') + '</div></details>';
    }
    if (historical.length) {
      html += '<details style="margin-top:10px"><summary style="cursor:pointer;font-size:12px;color:var(--muted)">Historical evidence (' + historical.length + ')</summary><div class="verify-list" style="margin-top:7px">' + historical.map(checkRow).join('') + '</div></details>';
    }
    return html + '</div>';
  }

  function browserHighlight(activity) {
    if (!activity || !Number(activity.total)) return '';
    var total = Math.max(0, Number(activity.total) || 0);
    var successful = Math.max(0, Math.min(total, Number(activity.successful) || 0));
    var screenshots = Math.max(0, Number(activity.screenshots) || 0);
    return '<div class="browser-highlight"><div><b>Visual verification</b></div><span>' + successful + '/' + total + ' browser actions succeeded' +
      (screenshots ? ' · ' + screenshots + ' screenshot' + (screenshots === 1 ? '' : 's') : '') + '</span></div>';
  }

  function reportMessageText(report) {
    var parsed = parseOutcome(report.summary);
    var parts = [parsed.lede || readableSummary(report.summary)];
    var findings = (report.findings || []).map(function (item) { return item.claim; }).filter(Boolean);
    var changes = (report.changes || []).length ? report.changes : parsed.changes.map(function (item) { return (CHANGE_VERBS[item.action] || 'Changed') + ' ' + item.path; });
    function section(title, items) {
      if (items && items.length) parts.push('### ' + title + '\n' + items.map(function (item) { return '- ' + String(item); }).join('\n'));
    }
    section('Findings', findings);
    section('Delivered', changes);
    section('Remaining risks', report.remainingRisks);
    section('Follow-ups', report.followUps);
    return parts.join('\n\n');
  }

  function reportReplyHtml(report, runId, actions) {
    var displayStatus = report.status === 'failed' && /^Work paused because/.test(report.failureReason || '') ? 'paused' : report.status;
    var checks = reportChecks(report);
    var currentChecks = checks.filter(function (check) { return check.authority !== 'historical'; });
    var files = reportFiles(report);
    var body = renderResponseText(cwVisibleReply(reportMessageText(report)));
    if(runId)body+='<button type="button" class="agent-report-files" data-report-files="'+esc(runId)+'">'+icon('file')+'Files &amp; details'+(files.length?' · '+files.length+' changed':'')+'</button>';
    var evidence = verificationSection(checks) + browserHighlight(report.browserActivity) + qualityMetricsHtml(report.qualityMetrics);
    if (report.tokenTelemetry && devMode()) evidence += telemetryGridHtml(report.tokenTelemetry);
    if (evidence) body += '<details class="exec-details" style="margin-top:12px"><summary><b>Technical evidence</b><span class="chev">\u25B8</span></summary>' +
      reportStatusLine(displayStatus, currentChecks, currentChecks.filter(function (check) { return check.passed; }).length, files.length, (report.changes || []).length, report.executionReportOnly) + evidence + '</details>';
    var status = { complete: 'Completed', blocked: 'Blocked', aborted: 'Stopped', failed: 'Failed', paused: 'Paused' }[displayStatus] || displayStatus;
    if (report.phase && report.phase.kind === 'follow_up') status += ' · Follow-up';
    return '<article class="agent-report" aria-label="Agent Gitu report"><header class="agent-report-heading"><b>Agent Gitu</b><span class="agent-report-status" data-status="'+esc(displayStatus)+'">'+esc(status)+'</span>'+(actions||'')+'</header><div class="agent-report-body">'+body+'</div></article>';
  }

  function reportSideCard(report) {
    return '<div class="report-flat">' + reportReplyHtml(report, null, '') + '</div>';
  }
  function qualityMetricsHtml(metrics) {
    if (!metrics || typeof metrics.score !== 'number') return '';
    var criteria = metrics.criteria || {};
    var verification = metrics.verification || {};
    var bits = [
      Math.round(metrics.score) + '/100 outcome quality',
      (Number(criteria.satisfied) || 0) + '/' + (Number(criteria.total) || 0) + ' criteria',
      (Number(verification.passing) || 0) + '/' + (Number(verification.authoritative) || 0) + ' final checks',
    ];
    if (typeof metrics.tokensPerVerifiedCriterion === 'number') bits.push(Math.round(metrics.tokensPerVerifiedCriterion).toLocaleString() + ' tokens / verified criterion');
    if (typeof metrics.wastedCallRate === 'number') bits.push(Math.round(metrics.wastedCallRate * 100) + '% wasted calls');
    return '<div class="r-note" data-quality-metrics><b>Outcome quality</b> · ' + esc(bits.join(' · ')) + '</div>';
  }

  function reportChangedFilesHtml(runId, files) {
    if (!files.length) return '';
    function row(path) {
      var url = '/api/runs/' + encodeURIComponent(runId) + '/project-file?path=' + encodeURIComponent(path);
      return '<a class="report-file-row" href="' + esc(url) + '" download aria-label="Download ' + esc(path) + '">' +
        '<span class="report-file-path">' + esc(path) + '</span><span class="report-file-action">Download ↓</span></a>';
    }
    var html = '<section class="report-files" aria-label="Changed files"><div class="report-files-head">' + icon('file') +
      '<span>Changed files</span><span class="report-files-count">' + files.length + '</span></div>' + files.map(row).join('');
    return html + '</section>';
  }

  function reportRepeatsReply(report, reply) {
    if (!report || !reply) return false;
    // A paused task's report can contain delivery facts from work before the
    // question. Those remain in task details, rather than repeating its answer.
    if (report.status === 'blocked' && report.responseKind === 'discussion' && !(report.remainingRisks || []).length && !(report.followUps || []).length) return String(report.summary || '').trim() === String(reply).trim();
    return report.status === 'complete' && reportMessageText(report).trim() === String(reply).trim();
  }

  function appendSummary(runId, session) {
    var stream = $('stream');
    if (!stream) return;
    var sess = S.sessions[runId];
    if (sess && sess.chatish) return;
    var r = session.report;
    if (reportRepeatsReply(r, sess && sess.lastPublicReply)) return;
    var div = document.createElement('div');
    div.className = 'report-flat';
    var menuId = 'report-menu-' + runId;
    var actions = '<div class="cw-message-actions"><button class="cw-message-more" type="button" popovertarget="' + esc(menuId) + '" aria-label="Report actions" title="Report actions">…</button>' +
      '<div class="cw-message-menu" id="' + esc(menuId) + '" popover="auto"><button data-sumcopy>Copy report</button></div></div>';
    div.innerHTML = reportReplyHtml(r, runId, actions);
    var filesButton=div.querySelector('[data-report-files]');if(filesButton)filesButton.onclick=function(){openToolPanel('files');};
    setupCopyButton(div.querySelector('[data-sumcopy]'), function () { return reportText(r); });
    var more = div.querySelector('.cw-message-more');
    if (more) more.onclick = function () {
      var menu = div.querySelector('.cw-message-menu'), rect = more.getBoundingClientRect();
      menu.style.left = Math.max(12, Math.min(rect.right - 164, window.innerWidth - 176)) + 'px';
      menu.style.top = Math.max(12, Math.min(rect.bottom + 4, window.innerHeight - 80)) + 'px';
    };
    var working = $('working');
    if (working) stream.insertBefore(div, working); else stream.appendChild(div);
    if (sess && sess.justOpened) stream.scrollTop = 0;
    else stickScroll(stream, true);
    if (sess) sess.justOpened = false;
  }

  function projectFileChipHtml(runId, path, downloadPath) {
    if (!downloadPath) return '<span class="file-chip">' + esc(path) + '</span>';
    var url = '/api/runs/' + encodeURIComponent(runId) + '/project-file?path=' + encodeURIComponent(downloadPath);
    return '<a class="file-chip" href="' + esc(url) + '" download title="Download ' + esc(path) + '">' + esc(path) + '</a>';
  }

  function renderRunSide(runId) {
    if(S.panelKind==='files'){renderRunFiles(runId);return;}
    var sess = S.sessions[runId];
    var body = $('sideBody');
    if (!body || !sess || S.panelKind !== 'state' || $('toolPanel').hidden) return;
    if (sess.chatish) { body.innerHTML = '<div class="empty" style="padding:16px 6px">Conversation session — no task state.</div>'; return; }
    var L = sess.ledger;
    if (!L) { body.innerHTML = '<div class="empty">Waiting for task ledger…</div>'; return; }
    var failure = sess.session && sess.session.error;
    var modelWaiting = sess.session && sess.session.status === 'waiting_for_model';
    var satisfied = L.acceptanceCriteria.filter(function (c) { return c.satisfied; }).length;
    var planDone = L.plan.filter(function (s) { return s.status === 'done'; }).length;
    // The card leads with a classified headline; the raw provider error stays
    // visible-but-secondary,
    // clamped, and copyable.
    var failSummary = failure ? failureSummary(failure) : null;
    if (modelWaiting && failSummary) {
      failSummary.title = 'Waiting for the model to recover';
      failSummary.hint = 'This task will retry automatically. Completed work is saved; you can stop it or select another model.';
    }
    var html = failure
      ? '<div class="side-fail"><div class="ft">&#9888; ' + esc(failSummary.title) + '</div>' +
        '<div class="fmsg" title="' + esc(failure) + '">' + esc(failure) + '</div>' +
        (failSummary.hint ? '<div class="fhint">' + esc(failSummary.hint) + '</div>' : '') +
        '<div class="facts">' +
        (failSummary.canSwitchModel ? '<button type="button" class="btn dark" id="sideFailSwitch">Switch model &amp; retry</button><button type="button" class="btn ghost" id="sideFailSettings">Provider settings</button>' : '') +
        '<button type="button" class="btn ghost" id="sideFailCopy">Copy error</button></div></div>'
      : '';
    html += '<div class="side-summary"><div class="t">Task state</div><div class="d">' +
      (L.acceptanceCriteria.length ? satisfied + '/' + L.acceptanceCriteria.length + ' criteria · ' : '') +
      (L.plan.length ? planDone + '/' + L.plan.length + ' plan steps · ' : '') + L.evidence.length + ' checks</div></div>';
    if (sess.session && sess.session.report) html += '<details class="task-report-details"><summary>Completion report</summary>' + reportSideCard(sess.session.report) + '</details>';
    var visibleBlockers = L.blockers.filter(function (b) { return b !== failure; });
    if (visibleBlockers.length) {
      html += '<div class="section-h" style="margin-top:0">Blockers</div>';
      visibleBlockers.slice(-3).forEach(function (b) { html += '<div class="crit"><span class="dot" style="background:var(--red)"></span><div>' + esc(b) + '</div></div>'; });
    }
    if (L.acceptanceCriteria.length || L.mode !== 'agent') html += '<div class="section-h" style="margin-top:0">Acceptance criteria</div>';
    if (!L.acceptanceCriteria.length && L.mode !== 'agent') html += '<div class="empty">none set yet</div>';
    var orderedCriteria = L.acceptanceCriteria.filter(function (c) { return !c.satisfied; }).concat(L.acceptanceCriteria.filter(function (c) { return c.satisfied; }));
    function criterionHtml(c) {
      var reqHtml = c.verification
        ? '<div class="crit-req">Required: <code>' + esc(c.verification) + '</code>' +
          (c.evidenceType && c.evidenceType !== 'any' ? ' <span class="chip" style="font-size:10px;padding:0 5px">' + esc(c.evidenceType) + '</span>' : '') + '</div>'
        : '';
      return '<div class="crit ' + (c.satisfied ? 'done' : '') + '"><span class="dot"></span><div style="flex:1">' + esc(c.text) +
        reqHtml +
        (c.evidenceIds && c.evidenceIds.length ? '<div class="ev-ids">' + esc(c.evidenceIds.join(', ')) + ' ✓</div>' : '') + '</div></div>';
    }
    html += orderedCriteria.slice(0, 6).map(criterionHtml).join('');
    if (orderedCriteria.length > 6) html += '<details class="side-more"><summary>Show ' + (orderedCriteria.length - 6) + ' more criteria</summary>' + orderedCriteria.slice(6).map(criterionHtml).join('') + '</details>';
    if (L.plan.length || L.mode !== 'agent') html += '<div class="section-h">Plan' + (L.planApproved ? ' <span class="chip ok" style="margin-left:6px">approved</span>' : '') + '</div>';
    if (!L.plan.length && L.mode !== 'agent') html += '<div class="empty">no plan yet</div>';
    var orderedPlan = L.plan.filter(function (s) { return s.status === 'in_progress'; }).concat(L.plan.filter(function (s) { return s.status === 'pending'; }), L.plan.filter(function (s) { return s.status !== 'in_progress' && s.status !== 'pending'; }));
    function planHtml(s) { return '<div class="step"><span class="st ' + s.status + '">' + esc(s.status) + '</span><div>' + esc(s.description) + ' <span style="color:var(--faint)">· ' + esc(s.verification) + '</span></div></div>'; }
    html += orderedPlan.slice(0, 6).map(planHtml).join('');
    if (orderedPlan.length > 6) html += '<details class="side-more"><summary>Show ' + (orderedPlan.length - 6) + ' more plan steps</summary>' + orderedPlan.slice(6).map(planHtml).join('') + '</details>';
    html += '<div class="section-h">Evidence</div>';
    if (!L.evidence.length) html += '<div class="empty">none yet</div>';
    function evidenceHtml(e) { return '<div class="ev-row ' + (e.passed ? 'pass' : 'fail') + '"><span class="ev-chip ' + (e.passed ? 'pass' : 'fail') + '">' + (e.passed ? 'PASS' : 'FAIL') + '</span><span class="ev-text">' + esc(e.label) + '</span></div>'; }
    var recentEvidence = L.evidence.slice(-8);
    html += '<div class="side-evidence">' + recentEvidence.map(evidenceHtml).join('') + '</div>';
    if (L.evidence.length > 8) html += '<details class="side-more"><summary>Show ' + (L.evidence.length - 8) + ' older checks</summary><div class="side-evidence">' + L.evidence.slice(0, -8).map(evidenceHtml).join('') + '</div></details>';
    html += '<div class="section-h">Files changed</div>';
    var visibleFiles = L.filesChanged.filter(reportableFile);
    html += visibleFiles.length ? visibleFiles.slice(0, 12).map(function (f) { return projectFileChipHtml(runId, f, f); }).join('') : '<div class="empty">none</div>';
    if (visibleFiles.length > 12) html += '<details class="side-more"><summary>Show ' + (visibleFiles.length - 12) + ' more files</summary>' + visibleFiles.slice(12).map(function (f) { return projectFileChipHtml(runId, f, f); }).join('') + '</details>';
    body.innerHTML = html;
    if (failure) {
      var failSwitch = $('sideFailSwitch');
      if (failSwitch) failSwitch.onclick = function () {
        closeToolPanel();
        var pick = $('modelPick');
        if (pick && !pick.disabled) openModelMenu();
        else { var follow = $('follow'); if (follow) follow.focus(); }
      };
      var failSettings = $('sideFailSettings');
      if (failSettings) failSettings.onclick = function () { openSettings('providers'); };
      setupCopyButton($('sideFailCopy'), failure);
    }
  }

  function applyLayout() {
    applyWidths();
    var shell = document.querySelector('.shell');
    if (shell) shell.classList.toggle('left-collapsed', !!S.settings.leftCollapsed);
    var btn = $('sbCollapse');
    if (btn) btn.innerHTML = S.settings.leftCollapsed ? '&#187;' : '&#171;';
  }
