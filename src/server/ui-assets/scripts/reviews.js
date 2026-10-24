

  // A live frame and the polled session view are two views of the same pending
  // request. They are merged on the runtime request id, so the frame renders the
  // card immediately and the poll catching up neither duplicates it (the render
  // key is remembered) nor removes it.
  function pendingApprovalsFor(sess, session) {
    var merged = {};
    var typed = sess.typedApprovals || {};
    Object.keys(typed).forEach(function (id) { merged[id] = typed[id]; });
    ((session && session.pendingApprovals) || []).forEach(function (a) { if (!merged[a.id]) merged[a.id] = a; });
    // A resolution frame settles the request at once; the mirror may still list
    // it for another poll interval, and a card the user can still click after
    // another surface answered is exactly the stale gate this removes.
    var settled = sess.settledGates || {};
    Object.keys(settled).forEach(function (id) { delete merged[id]; });
    return Object.keys(merged).map(function (id) { return merged[id]; });
  }

  // The gates that hold one request at a time merge on the same terms: the live
  // frame wins, the view is the fallback, and a request a frame already settled
  // is not resurrected by a mirror that still lists it.
  function pendingGateFor(typed, settled, view) {
    if (typed) return typed;
    if (view && settled[view.id]) return null;
    return view || null;
  }

  function pendingPlanReviewFor(sess, session) {
    return pendingGateFor(sess.typedPlanReview || null, sess.settledGates || {}, session && session.pendingPlanReview);
  }

  function pendingQuestionsFor(sess, session) {
    return pendingGateFor(sess.typedQuestions || null, sess.settledGates || {}, session && session.pendingQuestions);
  }

  // The structured questions when the emitter supplied them. A frame that only
  // carried the text projection still renders, with nothing to offer as options.
  function questionDetails(typed) {
    if (typed.details && typed.details.length) return typed.details;
    return (typed.questions || []).map(function (text) { return { question: text, options: [] }; });
  }

  // Native frames for the gate families a card renders, plus the command
  // lifecycle. Every gate action a card offers posts the request id it was
  // rendered for — never "whatever is pending now" — so a second surface
  // (Cowork, the Chief of Staff) answering first cannot make this card resolve
  // a different request. Frames marked "restored" are reconstructed from the
  // store after a restart and are read as history, not as pending work.
  function handleTypedFrame(runId, frame) {
    var sess = S.sessions[runId];
    var typed = frame && frame.typed;
    if (!sess || !typed) return;
    // Commands are display-only: the prose run row already built their card
    // (it carries the reason text, which the typed start does not), so the
    // start frame is a no-op and the finish frame only contributes the exit
    // code fact prose cannot express.
    if (typed.type === 'command_started') return;
    if (typed.type === 'command_finished') { applyCommandFinish(runId, typed); return; }
  // A file change and the model's reasoning are both display-only facts the
  // prose stream cannot carry: the diff body (with its removals) and the trace
  // itself. Handled before the gate section so a restored frame renders too.
  if (typed.type === 'file_changed') { applyFileChange(runId, typed); return; }
  if (typed.type === 'reasoning') { applyReasoning(runId, typed); return; }
    // A refused action is a fact about the run, not a request: it renders from a
    // restored frame too, which is why it is handled before the history guard.
    if (typed.type === 'policy_denied' || typed.type === 'operation_blocked') {
      applyPolicyNotice(runId, typed, frame);
      return;
    }
    // Everything below is a gate. A restored frame is history: the process that
    // raised its gate did not survive the restart, so a request the log happens
    // to end with was never ours to answer, and a card for it would offer
    // buttons that resolve nothing. A live reconnect replays frames without the
    // mark, and a still-pending gate is in the session view either way — so
    // ignoring history costs nothing that is actually live. Commands returned
    // above: their frames only enrich rows the replay has already rebuilt.
    if (frame.restored) return;
    var settled = null;
    if (typed.type === 'approval_required') {
      sess.typedApprovals = sess.typedApprovals || {};
      sess.typedApprovals[typed.approvalId] = {
        id: typed.approvalId, tool: typed.tool, why: typed.why, summary: typed.summary,
        requestedAt: typed.requestedAt || frame.t,
      };
    } else if (typed.type === 'approval_resolved') {
      if (sess.typedApprovals) delete sess.typedApprovals[typed.approvalId];
      settled = typed.approvalId;
    } else if (typed.type === 'plan_review_requested') {
      sess.typedPlanReview = {
        id: typed.requestId, criteria: typed.criteria || [], steps: typed.steps || [],
        // The event's requestedAt is when the agent asked; the frame's transport
        // stamp only substitutes for a legacy-classified event without one.
        requestedAt: typed.requestedAt || frame.t,
      };
    } else if (typed.type === 'plan_review_resolved') {
      sess.typedPlanReview = null;
      settled = typed.requestId;
    } else if (typed.type === 'questions_requested') {
      sess.typedQuestions = { id: typed.requestId, questions: questionDetails(typed), requestedAt: typed.requestedAt || frame.t };
    } else if (typed.type === 'questions_answered') {
      sess.typedQuestions = null;
      settled = typed.requestId;
    } else {
      return;
    }
    sess.settledGates = sess.settledGates || {};
    if (settled) sess.settledGates[settled] = true;
    renderApprovals(runId, sess.session);
    renderPlanReview(runId, sess.session);
    renderQuestions(runId, sess.session);
  }


  function placeDecisionCards(stream){
    if(!stream||!stream.querySelectorAll)return;
    var cards=Array.from(stream.querySelectorAll('.approval,.review-card,.qcard')),anchor=$('working'),focused=document.activeElement,selection=focused&&typeof focused.selectionStart==='number'?{start:focused.selectionStart,end:focused.selectionEnd}:null,moved=false;
    for(var i=cards.length-1;i>=0;i--){var card=cards[i];if(card.nextElementSibling!==anchor){if(stream.moveBefore&&card.parentNode===stream)stream.moveBefore(card,anchor);else stream.insertBefore(card,anchor);moved=true;}anchor=card;}
    if(moved&&focused&&focused.isConnected&&cards.some(function(card){return card.contains(focused);})){focused.focus({preventScroll:true});if(selection&&focused.setSelectionRange)focused.setSelectionRange(selection.start,selection.end);}
  }

  function renderApprovals(runId, session) {
    var stream = $('stream');
    if (!stream) return;
    var sess = S.sessions[runId];
    sess.apprShown = sess.apprShown || {};
    var pending = {};
    pendingApprovalsFor(sess, session).forEach(function (a) {
      pending[a.id] = true;
      if (sess.apprShown[a.id]) return;
      sess.apprShown[a.id] = true;
      var div = document.createElement('div');
      div.className = 'approval';
      div.setAttribute('data-aid', a.id);
      var presentation=cardActionPresentation(a.tool,a.why,a.summary);
      div.innerHTML =
        '<h3>' + esc(presentation.title) + '</h3>' +
        '<div class="meta-line">' + esc(presentation.detail) + '</div>' +
        cardTechnicalDetails([a.why,a.summary].filter(Boolean).join('\n\n'),a.id) +
        '<div class="actions"><button class="btn dark" data-appr="' + esc(a.id) + '" data-ok="1">Approve</button>' +
        '<button class="btn red" data-appr="' + esc(a.id) + '" data-ok="0">Deny</button></div>';
      var working = $('working');
      if (working) stream.insertBefore(div, working); else stream.appendChild(div);
      stickScroll(stream, true);
    });
    placeDecisionCards(stream);
    var olds = stream.querySelectorAll('.approval');
    for (var i = 0; i < olds.length; i++) {
      if (!pending[olds[i].getAttribute('data-aid')]) olds[i].remove();
    }
    stream.onclick = function (e) {
      var id = e.target.getAttribute && e.target.getAttribute('data-appr');
      if (id) {
        // Lock the card's buttons immediately: a double-click used to POST
        // the decision twice (second one 404s as "already resolved").
        var card = e.target.closest ? e.target.closest('.approval') : null;
        if (card) card.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
        api('/api/approvals/' + id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approved: e.target.getAttribute('data-ok') === '1' }) })
          .catch(function (er) { toast(er.message, true); });
        return;
      }
    };
  }

  function renderQuestions(runId, session) {
    var stream = $('stream');
    if (!stream) return;
    var sess = S.sessions[runId];
    var q = pendingQuestionsFor(sess, session);
    if (!q) {
      if (sess.qShown) {
        sess.qShown = null;
        var olds = stream.querySelectorAll('.qcard');
        for (var i = 0; i < olds.length; i++) olds[i].remove();
      }
      return;
    }
    if (sess.qShown === q.id) { placeDecisionCards(stream); return; }
    sess.qShown = q.id;
    var old = stream.querySelectorAll('.qcard');
    for (var j = 0; j < old.length; j++) old[j].remove();
    var selections = {};
    var questions = (q.questions || []).filter(function(qq){return qq && typeof qq === 'object';}).map(function(qq){
      var options = Array.isArray(qq.options) ? qq.options : [];
      var seen = {};
      return { question: qq.question, header: qq.header, detail: qq.detail, kind: qq.kind, options: options.map(function(option){
        var label = typeof option === 'string' ? option : option && typeof option === 'object' ? option.label : '';
        return typeof label === 'string' && label.trim() !== '[object Object]' ? label.trim() : '';
      }).filter(function(label){var key=qq.kind==='workspace'&&label.charAt(0)==='/'?label:label.toLowerCase();if(!label||Object.prototype.hasOwnProperty.call(seen,key))return false;seen[key]=true;return true;}) };
    });
    var div = document.createElement('div');
    div.className = 'qcard';
    var html = '<h3>Agent Gitu needs your input</h3>';
    questions.forEach(function (qq, qi) {
      var title=cardPlainText(qq.question,'The agent needs your decision.',160),detail=cardPlainText(qq.detail,'Open the technical details for more information.');
      html += '<div class="q"><div class="qt">' + esc(qq.header ? qq.header + ' — ' : '') + esc(title) + '</div>' + (qq.detail ? '<div class="meta" style="margin:6px 0;overflow-wrap:anywhere">' + esc(detail) + '</div>' : '') + cardTechnicalDetails(title!==qq.question||qq.detail&&detail!==qq.detail?[qq.question,qq.detail].filter(Boolean).join('\n\n'):'',q.id+'-'+qi) + (qq.kind === 'workspace' ? '<button class="btn ghost" data-workspace-controls="1">Open folder access controls</button>' : '') + '<div class="opts">';
      qq.options.forEach(function (op, oi) {
        html += '<button class="opt" data-q="' + qi + '" data-o="' + oi + '">' + esc(op) + '</button>';
      });
      html += '</div><input class="custom" data-q="' + qi + '" placeholder="or type your own answer…"></div>';
    });
    html += '<div class="actions"><button class="btn dark" id="qSend">Send answers</button></div>';
    div.innerHTML = html;
    var working = $('working');
    if (working) stream.insertBefore(div, working); else stream.appendChild(div);
    stickScroll(stream, true);
    div.onclick = function (e) {
      if (e.target.closest && e.target.closest('[data-workspace-controls]')) { openFolderBrowser('tag'); return; }
      var btn = e.target.closest && e.target.closest('.opt');
      if (!btn) return;
      var qi = btn.getAttribute('data-q');
      var siblings = div.querySelectorAll('.opt[data-q="' + qi + '"]');
      for (var i2 = 0; i2 < siblings.length; i2++) siblings[i2].classList.remove('sel');
      btn.classList.add('sel');
      selections[qi] = questions[Number(qi)].options[Number(btn.getAttribute('data-o'))];
    };
    $('qSend').onclick = function () {
      if (this.disabled) return;
      this.disabled = true;
      var restore = (function (b) { return function () { b.disabled = false; }; })(this);
      var answers = questions.map(function (qq, qi2) {
        var custom = div.querySelector('.custom[data-q="' + qi2 + '"]');
        var val = (custom && custom.value.trim()) || selections[qi2] || '(no answer)';
        return qq.question + ' — ' + val;
      }).join('\n');
      api('/api/answers/' + q.id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answer: answers }) })
        .catch(function (er) { restore(); toast(er.message, true); });
    };
  }

  function renderPlanReview(runId, session) {
    var stream = $('stream');
    if (!stream) return;
    var sess = S.sessions[runId];
    var pr = pendingPlanReviewFor(sess, session);
    if (!pr) {
      if (sess.prShown) {
        sess.prShown = null;
        var olds = stream.querySelectorAll('.review-card');
        for (var i = 0; i < olds.length; i++) olds[i].remove();
      }
      return;
    }
    if (sess.prShown === pr.id) { placeDecisionCards(stream); return; }
    sess.prShown = pr.id;
    var old = stream.querySelectorAll('.review-card');
    for (var j = 0; j < old.length; j++) old[j].remove();
    var div = document.createElement('div');
    div.className = 'review-card';
    div.innerHTML =
      '<h3>Review the proposed work</h3><p>Check the plan before the agent makes changes. You can approve it or ask for changes.</p>' +
      '<div><b>What will happen</b><ul>'+pr.steps.slice(0,3).map(function(step){return '<li>'+esc(cardPlainText(step.description,'Complete a project step and check the result.',140))+'</li>';}).join('')+'</ul></div><details id="prFullDetails"><summary>Technical details and full plan</summary>' +
      '<div class="md-plan" id="prDoc">' +
      (pr.criteria.length ? '<h4>Acceptance criteria</h4><ul>' + pr.criteria.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>' : '') +
      '<h4>Plan</h4><ol>' + pr.steps.map(function (s, i2) {
        return '<li><b>Step ' + (i2 + 1) + '.</b> ' + esc(s.description) + '<span class="ver">Verification: ' + esc(s.verification) + '</span></li>';
      }).join('') + '</ol></div>' +
      '</details><div id="prEdit" style="display:none">' +
      '<label>Acceptance criteria (optional, one per line)</label>' +
      '<textarea id="prCrit" rows="' + Math.max(2, pr.criteria.length) + '">' + esc(pr.criteria.join('\n')) + '</textarea>' +
      '<label>Plan steps (one per line: description | verification)</label>' +
      '<textarea id="prSteps" rows="' + Math.max(3, pr.steps.length + 1) + '">' + esc(pr.steps.map(function (s) { return s.description + ' | ' + s.verification; }).join('\n')) + '</textarea>' +
      '</div>' +
      '<div class="actions"><button class="btn dark" id="prApprove">Approve &amp; Build</button>' +
      '<button class="btn ghost" id="prEditBtn">Edit plan</button>' +
      '<input id="prNote" placeholder="Requested changes (optional)…">' +
      '<button class="btn ghost" id="prChange">Request changes</button></div>';
    var working = $('working');
    if (working) stream.insertBefore(div, working); else stream.appendChild(div);
    stickScroll(stream, true);
    var editing = false;
    $('prEditBtn').onclick = function () {
      editing = !editing;
      $('prFullDetails').open = !editing;
      $('prEdit').style.display = editing ? 'block' : 'none';
      $('prDoc').style.display = editing ? 'none' : 'block';
      $('prEditBtn').textContent = editing ? 'Preview' : 'Edit plan';
    };
    function payload(approved) {
      var criteria = pr.criteria;
      var steps = pr.steps;
      if (editing) {
        criteria = $('prCrit').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        steps = $('prSteps').value.split('\n').map(function (line) {
          var parts = line.split('|');
          return { description: (parts[0] || '').trim(), verification: (parts.slice(1).join('|') || 'manual check').trim() };
        }).filter(function (s) { return s.description; });
      }
      return { approved: approved, note: $('prNote').value.trim() || undefined, criteria: criteria, steps: steps };
    }
    function prPost(approved) {
      var btns = [$('prApprove'), $('prChange')];
      if (btns.some(function (b) { return b && b.disabled; })) return;
      btns.forEach(function (b) { if (b) b.disabled = true; });
      api('/api/plan-review/' + pr.id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload(approved)) })
        .catch(function (er) {
          btns.forEach(function (b) { if (b) b.disabled = false; });
          toast(er.message, true);
        });
    }
    $('prApprove').onclick = function () { prPost(true); };
    $('prChange').onclick = function () { prPost(false); };
  }

  function reportableFile(file) {
    var path = String(file || '').replace(/\\/g, '/').replace(/^\.\//, '');
    var lower = path.toLowerCase();
    if (!path || /(^|\/)(?:\.hermes|node_modules|coverage|\.cache|\.freebuff)(?:\/|$)/.test(lower)) return false;
    return !/(^|\/)(?:[^/]*[_-]tmp|tmp[_-][^/]*)\.[^/]+$/i.test(path);
  }

  function reportFiles(report) {
    var seen = {};
    return (report.filesChanged || []).filter(function (file) {
      if (!reportableFile(file) || seen[file]) return false;
      seen[file] = true;
      return true;
    });
  }

  function readableSummary(summary) {
    return String(summary || '')
      .replace(/\s+\((\d+)\)\s+/g, function (_all, number) { return '\n' + number + '. '; })
      .replace(/\s+•\s+/g, '\n• ')
      .trim();
  }