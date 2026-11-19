

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
    var isLive = !frame.restored && (!sess.session || sess.session.status === 'running');
    if (typed.type === 'command_started') {
      if (isLive && typeof setWorking === 'function') setWorking('Running ' + (typeof shortText === 'function' ? shortText(typed.command || 'command', 70) : (typed.command || 'command')) + '…');
      return;
    }
    if (typed.type === 'command_finished') { applyCommandFinish(runId, typed); return; }
    // A file change and the model's reasoning are both display-only facts the
    // prose stream cannot carry: the diff body (with its removals) and the trace
    // itself. Handled before the gate section so a restored frame renders too.
    if (typed.type === 'file_changed') { applyFileChange(runId, typed); return; }
    if (typed.type === 'reasoning') {
      applyReasoning(runId, typed);
      if (isLive && typeof setWorking === 'function') setWorking('Reasoning…');
      return;
    }
    if (isLive && typeof setWorking === 'function') {
      if (typed.type === 'test_started') { setWorking('Running tests…'); return; }
      if (typed.type === 'file_read' && typed.path) { setWorking('Reading ' + (typeof shortText === 'function' ? shortText(typed.path, 70) : typed.path) + '…'); return; }
      if (typed.type === 'recovering') { setWorking('Recovering' + (typed.message && typeof shortText === 'function' ? ' — ' + shortText(typed.message, 80) : '') + '…'); return; }
    }
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
      var canRemember = a.tool === 'run_command';
      var canGrantFull = !(S.settings && S.settings.autoApprove) && (
        a.tool === 'run_command' || a.tool === 'read_file' || a.tool === 'list_files' ||
        a.tool === 'search_files' || a.tool === 'write_file' || a.tool === 'edit_file' ||
        a.tool === 'apply_edit' || a.tool === 'delete_file'
      );
      div.innerHTML =
        '<h3>' + esc(presentation.title) + '</h3>' +
        '<div class="meta-line">' + esc(presentation.detail) + '</div>' +
        (presentation.preview ? '<div class="approval-preview"><code>' + esc(presentation.preview) + '</code></div>' : '') +
        cardTechnicalDetails([a.why,a.summary].filter(Boolean).join('\n\n'),a.id) +
        (canRemember ? '<label class="meta-line" style="display:flex;align-items:center;gap:6px;margin:8px 0 4px;cursor:pointer"><input type="checkbox" class="appr-remember-cb" style="width:auto;margin:0"> Always allow this command via Chief of Staff</label>' : '') +
        '<div class="actions"><button class="btn dark" data-appr="' + esc(a.id) + '" data-ok="1">Approve</button>' +
        (canGrantFull ? '<button class="btn ghost" data-appr="' + esc(a.id) + '" data-ok="1" data-grant-full="1">Approve &amp; full access</button>' : '') +
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
      var btn = e.target && e.target.closest ? e.target.closest('[data-appr]') : e.target;
      var id = btn && btn.getAttribute && btn.getAttribute('data-appr');
      if (id) {
        // Lock the card's buttons immediately: a double-click used to POST
        // the decision twice (second one 404s as "already resolved").
        var card = btn.closest ? btn.closest('.approval') : null;
        var approved = btn.getAttribute('data-ok') === '1';
        var grantFull = approved && btn.getAttribute('data-grant-full') === '1';
        var rememberCb = card ? card.querySelector('.appr-remember-cb') : null;
        var payload = { approved: approved };
        if (approved && rememberCb && rememberCb.checked) payload.rememberForChief = true;
        if (card) card.querySelectorAll('button,input').forEach(function (b) { b.disabled = true; });
        var beforeApprove = grantFull
          ? api('/api/coding-permissions', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ access: 'full' }),
            }).then(function (saved) {
              S.settings.autoApprove = saved.access === 'full';
              persist();
              if (typeof updateCodingAccessControl === 'function') updateCodingAccessControl();
              var setBtn = $('pAuto');
              if (setBtn) setBtn.classList.toggle('on', !!S.settings.autoApprove);
            })
          : Promise.resolve();
        beforeApprove
          .then(function () {
            return api('/api/approvals/' + id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
          })
          .then(function (r) {
            if (grantFull) toast('Full access enabled and action approved');
            else if (r && r.rememberError) toast(r.rememberError, true);
            else if (r && r.rememberedRule) toast('Saved standing command rule for Chief of Staff');
          })
          .catch(function (er) {
            if (card) card.querySelectorAll('button,input').forEach(function (b) { b.disabled = false; });
            toast(er.message, true);
          });
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
    var qCountLabel = questions.length === 1 ? '1 question' : questions.length + ' questions';
    var canRememberAny = questions.some(function (qq) { return qq.kind !== 'workspace'; });
    var qIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01"/></svg>';
    var html =
      '<div class="qcard-head">' +
        '<span class="qcard-badge">' + qIcon + 'Input needed</span>' +
        '<span class="qcard-count">' + esc(qCountLabel) + '</span>' +
      '</div>' +
      '<h3>Agent Gitu needs your input</h3>';
    questions.forEach(function (qq, qi) {
      var title = cardPlainText(qq.question, 'The agent needs your decision.', 180);
      var qBody = typeof cardQuestionDetail === 'function' ? cardQuestionDetail(qq.detail) : { detail: cardPlainText(qq.detail, 'Open the technical details for more information.'), technical: '' };
      var tech = title !== qq.question ? [qq.question, qq.detail].filter(Boolean).join('\n\n') : qBody.technical;
      html +=
        '<div class="q">' +
          (qq.header ? '<span class="q-tag">' + esc(qq.header) + '</span>' : '') +
          '<div class="qt">' + esc(title) + '</div>' +
          (qBody.detail ? '<div class="q-detail">' + esc(qBody.detail) + '</div>' : '') +
          cardTechnicalDetails(tech, q.id + '-' + qi) +
          (qq.kind === 'workspace' ? '<div style="margin:6px 0 8px"><button type="button" class="btn ghost" data-workspace-controls="1">Open folder access controls</button></div>' : '') +
          (qq.options.length ? '<div class="opts" role="group" aria-label="Suggested answers">' + qq.options.map(function (op, oi) {
            return '<button type="button" class="opt" data-q="' + qi + '" data-o="' + oi + '" aria-pressed="false">' + esc(op) + '</button>';
          }).join('') + '</div>' : '') +
          '<input class="custom" data-q="' + qi + '" placeholder="' + (qq.options.length ? 'Add a note or write a different answer (optional)…' : 'Type your answer…') + '">' +
        '</div>';
    });
    if (canRememberAny) {
      var defaultPattern = questions.length === 1 ? String(questions[0].question || '') : '';
      html +=
        '<div class="chat-question-remember-box">' +
          '<label class="chat-question-remember"><input type="checkbox" id="qRememberChief"> Remember ' + (questions.length > 1 ? 'these answers' : 'this answer') + ' for Chief of Staff</label>' +
          '<div class="chat-question-remember-opts" id="qRememberOpts" hidden>' +
            (questions.length === 1
              ? '<div class="chat-question-remember-field"><span>Match phrase</span><input type="text" id="qRememberPattern" value="' + esc(defaultPattern) + '" placeholder="Question text or /regex/"></div>'
              : '<div class="chat-question-remember-field"><span>Matching</span><div class="meta-line" style="margin:4px 0 0">Saves one standing rule per answered question.</div></div>') +
            '<div class="chat-question-remember-field"><span>Scope</span><select id="qRememberScope"><option value="workspace" selected>This workspace</option><option value="global">Global</option></select></div>' +
          '</div>' +
        '</div>';
    }
    html +=
      '<div class="qcard-footer">' +
        '<span class="qcard-hint">Ctrl / ⌘ + Enter to send</span>' +
        '<button type="button" class="btn dark" id="qSend">' + (questions.length > 1 ? 'Send answers' : 'Send answer') + '</button>' +
      '</div>' +
      '<p class="chat-question-error qcard-error" role="alert"></p>';
    div.innerHTML = html;
    var working = $('working');
    if (working) stream.insertBefore(div, working); else stream.appendChild(div);
    stickScroll(stream, true);
    var rememberCbInit = $('qRememberChief');
    var rememberOptsEl = $('qRememberOpts');
    if (rememberCbInit && rememberOptsEl) {
      rememberCbInit.onchange = function () { rememberOptsEl.hidden = !rememberCbInit.checked; };
    }
    var customInputs = div.querySelectorAll ? div.querySelectorAll('.custom') : [];
    for (var ci = 0; ci < customInputs.length; ci++) {
      (function (inp) {
        inp.oninput = function () {
          var errNode = div.querySelector('.qcard-error');
          if (errNode && errNode.textContent) errNode.textContent = '';
        };
        inp.onkeydown = function (ev) {
          if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey) && !ev.isComposing) {
            ev.preventDefault();
            var sendBtn = $('qSend');
            if (sendBtn && sendBtn.onclick) sendBtn.onclick();
          }
        };
      })(customInputs[ci]);
    }
    div.onclick = function (e) {
      if (e.target.closest && e.target.closest('[data-workspace-controls]')) { openFolderBrowser('tag'); return; }
      var btn = e.target.closest && e.target.closest('.opt');
      if (!btn) return;
      var qi = btn.getAttribute('data-q');
      var chosen = questions[Number(qi)].options[Number(btn.getAttribute('data-o'))];
      var deselect = selections[qi] === chosen;
      var siblings = div.querySelectorAll('.opt[data-q="' + qi + '"]');
      for (var i2 = 0; i2 < siblings.length; i2++) {
        siblings[i2].classList.remove('sel');
        if (siblings[i2].setAttribute) siblings[i2].setAttribute('aria-pressed', 'false');
      }
      if (deselect) {
        delete selections[qi];
      } else {
        btn.classList.add('sel');
        if (btn.setAttribute) btn.setAttribute('aria-pressed', 'true');
        selections[qi] = chosen;
      }
      var errNode = div.querySelector('.qcard-error');
      if (errNode && errNode.textContent) errNode.textContent = '';
    };
    $('qSend').onclick = function () {
      if (this.disabled) return;
      var resolvedVals = questions.map(function (qq, qi2) {
        var custom = div.querySelector('.custom[data-q="' + qi2 + '"]');
        var extra = custom && custom.value ? custom.value.trim() : '';
        var picked = selections[qi2] || '';
        if (picked && extra) return extra.indexOf(picked) === 0 ? extra : picked + ' — ' + extra;
        return picked || extra;
      });
      if (!resolvedVals.some(Boolean)) {
        var errNode = div.querySelector('.qcard-error');
        if (errNode) errNode.textContent = 'Choose an option or write an answer first.';
        return;
      }
      this.disabled = true;
      var rememberCb = $('qRememberChief');
      var rememberForChief = Boolean(rememberCb && rememberCb.checked);
      var patternInput = $('qRememberPattern');
      var scopeSelect = $('qRememberScope');
      if (rememberCb) rememberCb.disabled = true;
      if (patternInput) patternInput.disabled = true;
      if (scopeSelect) scopeSelect.disabled = true;
      var restore = (function (b, cb, pat, sc) {
        return function () {
          b.disabled = false;
          if (cb) cb.disabled = false;
          if (pat) pat.disabled = false;
          if (sc) sc.disabled = false;
        };
      })(this, rememberCb, patternInput, scopeSelect);
      var answers = questions.map(function (qq, qi2) {
        return qq.question + ' — ' + (resolvedVals[qi2] || '(no answer)');
      }).join('\n');
      var answerPayload = { answer: answers };
      if (rememberForChief) {
        answerPayload.rememberForChief = true;
        if (scopeSelect && scopeSelect.value) answerPayload.chiefScope = scopeSelect.value;
        var customPat = patternInput && patternInput.value ? patternInput.value.trim() : '';
        answerPayload.chiefEntries = questions.map(function (qq, qi2) {
          var val = resolvedVals[qi2];
          if (!val || qq.kind === 'workspace') return null;
          var entry = { question: qq.question, answer: val };
          if (questions.length === 1 && customPat) entry.pattern = customPat;
          return entry;
        }).filter(Boolean);
      }
      api('/api/answers/' + q.id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(answerPayload) })
        .then(function (r) {
          if (r && r.rememberError) toast(r.rememberError, true);
          else if (r && r.rememberedRules && r.rememberedRules.length > 1) toast('Saved ' + r.rememberedRules.length + ' standing answers for Chief of Staff');
          else if (r && r.rememberedRule) toast('Saved standing answer for Chief of Staff');
        })
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