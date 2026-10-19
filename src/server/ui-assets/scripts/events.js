

  function appendEvent(runId, ev) {
    var stream = $('stream');
    if (!stream) return;
    var sess = S.sessions[runId];
    var text = String(ev.text);
    // Event IDs identify transport replays. Identical commands with different
    // IDs are real invocations and each must keep its own output.
    if (sess && sess.nodes && ev.i != null) {
      var seen = sess.nodes.renderedEventIds || (sess.nodes.renderedEventIds = new Set());
      if (seen.has(ev.i)) return;
      seen.add(ev.i);
      if (seen.size > 2000) seen.delete(seen.values().next().value);
    }
    if (text.indexOf('live-chat ') === 0) {
      if (!sess || !sess.nodes) return;
      try {
        var exchange=JSON.parse(text.slice(10)),row=document.createElement('div');row.className='live-chat-exchange';
        row.innerHTML='<small>'+esc(exchange.role==='user'?'You · Live conversation':'Agent Gitu · Live conversation')+'</small>'+md(String(exchange.content||''));
        insertTimelineNode(sess,row,ev.t);stickScroll(stream);return;
      } catch { return; }
    }
    syncWorkingActivity(runId, text);
    if (text === 'activity preparing-project' || text === 'activity indexing-project' || text === 'activity preparing-model') {
      return;
    }
    if (text === 'activity reasoning-reset' || text.indexOf('activity reasoning-delta ') === 0) {
      if (!sess || !sess.nodes) return;
      if (text === 'activity reasoning-reset') sess.nodes.reasoningText = '';
      else {
        try {
          var reasoningDelta = JSON.parse(text.slice('activity reasoning-delta '.length));
          if (typeof reasoningDelta !== 'string') return;
          sess.nodes.reasoningText = (sess.nodes.reasoningText || '') + reasoningDelta;
          sess.nodes.reasoningText = sess.nodes.reasoningText.slice(-24000);
        } catch (e) { return; }
      }
      renderReasoningStream($('workingReasoning'), sess.nodes.reasoningText);
      if (text !== 'activity reasoning-reset') setWorking('Reasoning…');
      stickScroll(stream);
      return;
    }
    updateApproach(runId, ev);
    // The next assistant event starts a fresh activity group after the prior
    // one has settled. Do not split an in-flight parallel batch.
    if (sess && toolActivityBoundary(text)) sealToolActivityGroup(sess);
    if (text.indexOf('think') === 0 || text.indexOf('plan ') === 0 || text.indexOf('activity reasoning') === 0) mascotState('thinking');
    else if (text.indexOf('activity content') === 0 || text.indexOf('activity tool') === 0) mascotState('thinking');
    else if (text.indexOf('run write') === 0 || text.indexOf('run edit') === 0) mascotState('coding');
    else if (text.indexOf('run $') === 0 || text.indexOf('run ') === 0) mascotState('testing');
    else if (text.indexOf('evidence') === 0 && text.indexOf('PASS') >= 0) mascotState('celebrate');
    else if (text.indexOf('blocked') === 0 || text.indexOf('denied') === 0) mascotState('shield');
    else mascotPulse();

    if (sess && sess.chatish && (
      text.indexOf('run ') === 0 || text.indexOf('ok ') === 0 || text.indexOf('error ') === 0 ||
      text.indexOf('denied ') === 0 || text.indexOf('blocked ') === 0 || text.indexOf('out ') === 0 ||
      text.indexOf('meta ') === 0 || text.indexOf('checkpoint ') === 0 || text.indexOf('plan ') === 0 ||
      text.indexOf('criteria ') === 0 || text.indexOf('evidence ') === 0 || text.indexOf('hypothesis ') === 0 ||
      text.indexOf('context ') === 0 || text.indexOf('delegate ') === 0 || text.indexOf('subagent ') === 0
    )) return;

    function insert(el) {
      insertTimelineNode(sess, el, ev && ev.t);
    }

    if (text.indexOf('subagent-state ') === 0) {
      applySubagentState(runId, insert, text);
      return;
    }

    if (text.indexOf('file ') === 0) {
      try {
        var fileMeta = JSON.parse(text.slice(5));
        if (fileMeta && fileMeta.replacesLongText) removeNarrationReplacedByFile(sess);
        recordRunFile(sess,fileMeta);
        if(fileMeta&&fileMeta.kind==='user')insert(sessionFileCard(fileMeta));
        else if(sess){var fileLink=sessionFilesLink(sess,runId);if(!fileLink.isConnected)insert(fileLink);}
        renderRunFiles(runId);
        stickScroll(stream);
      } catch (e) {
        // Ignore malformed metadata rather than rendering unsafe raw JSON.
      }
      return;
    }

    if (text.indexOf('tdelta ') === 0 || text.indexOf('thought ') === 0) {
      var chunk = text.indexOf('tdelta ') === 0 ? text.slice(7) : text.slice(8);
      if (sess && sess.chatish) {
        setWorking(null);
        if (!sess.nodes.abubble) {
          var ab = document.createElement('div');
          ab.className = 'abubble';
          ab.innerHTML = '<span class="who">Agent Gitu</span><span class="txt"></span>';
          appendLive(stream, ab);
          sess.nodes.abubble = ab;
        }
        queueStreamText(sess.nodes.abubble.querySelector('.txt'), chunk, sess.replaying);
        return;
      }
      // Never create the prose row for a whitespace-only opening chunk.
      // Providers (especially reasoning models) frequently lead with "\n" or
      // " " before real content; without this guard those empty deltas produce
      // a visible bullet row with no text.
      if (!sess.nodes.thought && !chunk.trim()) return;
      if (!sess.nodes.thought) {
        var t = document.createElement('div');
        // The model sometimes leaks its raw JSON action object into the
        // prose stream (truncated output retried mid-JSON). Normal mode
        // never renders it — not even collapsed: the leak is protocol
        // garbage, and the working indicator already says what matters.
        // Developer mode keeps the old collapsed technical row.
        if (JSON_LEAK_RE.test(chunk)) {
          if (!devMode()) { setWorking('Thinking…'); return; }
          t.className = 'tl-row tl-meta';
          t.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><details class="exec-details"><summary><b>Raw model output</b><span class="chev">\u25B8</span></summary><pre class="exec-pre"></pre></details></div>';
        } else {
          t.className = 'tl-row tl-note-row tl-stream-row';
          t.dataset.streamState = 'live';
          t.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><div class="stream-live" aria-hidden="true">Agent Gitu · writing</div><div class="stream-text"><span class="txt"></span><span class="caret"></span></div></div>';
        }
        insert(t);
        sess.nodes.thought = t;
        followActiveToolActivity(stream, sess);
      }
      var sink = sess.nodes.thought.querySelector('.exec-pre') || sess.nodes.thought.querySelector('.txt');
      queueStreamText(sink, chunk, sess.replaying);
      return;
    }
    if (text.indexOf('reason ') === 0) {
      // Internal reasoning traces never render for users — a narration row
      // reads "Checking the streaming handler", not the raw reason stream.
      // Developer mode still exposes the trace.
      if (!devMode()) return;
      if (sess && sess.chatish) return;
      if (!sess.nodes.thought) {
        var t3 = document.createElement('div');
        t3.className = 'tl-row tl-note-row';
        t3.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><span class="txt"></span><span class="caret"></span></div>';
        insert(t3);
        sess.nodes.thought = t3;
      }
      queueStreamText(sess.nodes.thought.querySelector('.txt'), text.slice(7), sess.replaying);
      return;
    }

    if (text.indexOf('say ') === 0) {
      if (sess.nodes.thought) flushStreamText(sess.nodes.thought.querySelector('.txt'));
      var prose = text.slice(4);
      if (!prose.trim()) { closeThought(runId); return; }
      if (sess && sess.chatish) {
        if (sess.nodes.abubble) {
          retireAbubble(sess);
        } else {
          var ab2 = document.createElement('div');
          ab2.className = 'abubble';
          ab2.innerHTML = '<span class="who">Agent Gitu</span><span class="txt"></span>';
          ab2.querySelector('.txt').textContent = prose;
          finalizeNarration(ab2);
          appendLive(stream, ab2);
          stickScroll(stream);
        }
        return;
      }
      if (sess.nodes.thought) {
        // A streaming row already exists — patch it to the authoritative final
        // text and close it. Never insert a second row; the streaming node IS
        // the narration node. This eliminates the "BOOM whole sentence"
        // teleport when the final prose diverges from the partial stream.
        var txt = sess.nodes.thought.querySelector('.txt');
        if (txt && txt.textContent !== prose) {
          txt.textContent = '';
          txt.appendChild(document.createTextNode(prose));
        }
      } else {
        // No streaming happened — insert a static row as before.
        var pp = document.createElement('div');
        pp.className = 'tl-row tl-note-row';
        pp.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><span class="txt">' + esc(prose) + '</span></div>';
        finalizeNarration(pp);
        insert(pp);
      }
      closeThought(runId);
      return;
    }
    if (text.indexOf('activity reasoning') === 0) { setWorking('Reasoning…'); return; }
    if (text.indexOf('activity content') === 0) {
      if (!sess || !sess.chatish) setWorking('Responding…');
      return;
    }
    if (text.indexOf('activity tool') === 0) {
      if (!sess || !sess.chatish) { closeThought(runId); setWorking('Preparing tool action…'); }
      return;
    }
    if (text.indexOf('think') === 0) { setWorking(publicThinkingStatus(text)); return; }
    if (text.indexOf('approval-required') === 0) { setWorking('Waiting for your approval…'); return; }
    if (text.indexOf('ask-user') === 0) { closeThought(runId); setWorking('Waiting for your answers…'); return; }
    if (text.indexOf('user-msg ') === 0) {
      var userText = text.slice(9);
      if (settlePendingUserMessage(runId, userText, null, true)) return;
      retireAbubble(sess); closeThought(runId); appendLive(stream, userBubble(userText, runId)); stickScroll(stream, true); return;
    }
    if (text.indexOf('continue ') === 0) return;
    if (text.indexOf('queued ') === 0 || text.indexOf('stopped ') === 0) {
      var qm = document.createElement('div');
      qm.className = 'tl-row tl-meta';
      var qtag = text.split(' ')[0];
      var qrest = text.slice(text.indexOf(' ') + 1);
      var dashIdx = qrest.indexOf(' — ');
      if (dashIdx >= 0) qrest = qrest.slice(dashIdx + 3);
      qm.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><b>' + esc(qtag) + '</b> ' + esc(qrest) + '</div>';
      appendLive(stream, qm);
      return;
    }
    if (text.indexOf('parallel') === 0) {
      // Parallel executors emit all run events up front, then interleave each
      // completion. The one Tool activity disclosure below owns that batch;
      // a second "parallel" timeline row would duplicate the same event.
      closeThought(runId);
      sess.nodes.nextToolBatchHint = text.slice(9).trim();
      sess.nodes.parallelPending = true;
      sess.nodes.toolRows = sess.nodes.toolRows || [];
      setWorking('Running parallel tools…');
      return;
    }
    if (text.indexOf('lines ') === 0) {
      // "+12 lines" (legacy) and "+12 -3 lines" (current): the removal count is
      // part of what the user has to see, so it gets its own red counter.
      var counts = /\s+\+(\d+)(?:\s+-(\d+))?\s+lines.*$/i.exec(text);
      var lineHint = text.slice(6).replace(counts ? counts[0] : /\s+\+\d+\s+lines.*$/i, '').trim();
      var toolCard = findToolRow(sess, lineHint, true);
      if (toolCard && !toolCard.querySelector('.lines')) {
        var addedTarget = counts ? parseInt(counts[1], 10) || 0 : 0;
        var removedTarget = counts && counts[2] ? parseInt(counts[2], 10) || 0 : 0;
        var badge = document.createElement('span');
        badge.className = 'lines';
        var plus = document.createElement('span');
        plus.textContent = '+0';
        var minus = document.createElement('span');
        minus.className = 'del';
        badge.appendChild(plus);
        badge.appendChild(minus);
        var cmdRow = toolCard.querySelector('.tl-cmd');
        cmdRow.insertBefore(badge, cmdRow.querySelector('.st'));
        var startT = Date.now();
        var anim = setInterval(function () {
          var pr = Math.min(1, (Date.now() - startT) / 700);
          plus.textContent = '+' + Math.round(addedTarget * pr);
          minus.textContent = removedTarget ? '-' + Math.round(removedTarget * pr) : '';
          if (pr >= 1) clearInterval(anim);
        }, 40);
      }
      return;
    }

    // Token telemetry arrives once per run as "telemetry <renderTelemetry()>".
    // Normal users get one quiet human line ("8 tool actions · 87K tokens");
    // the full counter grid (compactions, planning calls, wasted calls, …)
    // is Developer-mode detail.
    if (text.indexOf('telemetry ') === 0) {
      closeThought(runId);
      var trow = document.createElement('div');
      trow.className = 'tl-row tl-meta';
      if (!devMode()) {
        var mTools = /toolCalls=(\d+)/.exec(text);
        var mIn = /input=(\d+)/.exec(text);
        var tok = mIn ? humanTokenCount(parseInt(mIn[1], 10)) : '';
        var bits = [];
        if (mTools) bits.push(mTools[1] + ' tool actions');
        if (tok) bits.push(tok + ' tokens used');
        trow.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><b>Run stats</b> ' + esc(bits.join(' · ') || 'completed') + '</div>';
      } else {
      var LABELS = { calls: 'Calls', toolCalls: 'Tool calls', compactions: 'Compactions',
        planning: 'Planning calls', execution: 'Execution calls', screenshots: 'Screenshots',
        wasted: 'Wasted calls', input: 'Input tokens', cached: 'Cached tokens', output: 'Output tokens' };
      var pairs = [];
      var kre = /([~\w.]+)=([^\s()]+)/g, km;
      while ((km = kre.exec(text))) {
        if (km[1] === 'telemetry') continue;
        pairs.push([km[1], km[2]]);
      }
      var sum = '';
      var mcalls = /calls=(\d+)/.exec(text);
      if (mcalls) sum = mcalls[1] + ' model calls';
      var thtml = '<details class="exec-details"><summary><b>Execution details</b>' +
        (sum ? ' <span class="exec-sum">' + esc(sum) + '</span>' : '') +
        '<span class="chev">\u25B8</span></summary><div class="exec-grid">';
      for (var pi = 0; pi < pairs.length; pi++) {
        thtml += '<span class="k">' + esc(LABELS[pairs[pi][0]] || pairs[pi][0]) + '</span>' +
                 '<span class="v">' + esc(pairs[pi][1]) + '</span>';
      }
      thtml += '</div></details>';
      trow.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body">' + thtml + '</div>';
      }
      appendLive(stream, trow);
      stickScroll(stream);
      return;
    }

    // Consecutive recovery rows (the same discovery strategy repeating across
    // strategies/attempts) collapse into one row with a repeat chip — the
    // recovery ladder is noise-dense by design, but rarely worth N lines.
    // Normal users get ONE calm human line with no ladder detail or counts;
    // the full ladder is Developer-mode diagnostic.
    if (text.indexOf('recovery ') === 0) {
      closeThought(runId);
      if (!devMode()) {
        if (sess.nodes.lastRecovery && sess.nodes.lastRecovery.el && sess.nodes.lastRecovery.el.isConnected) {
          stickScroll(stream);
          return;
        }
        var rHuman = document.createElement('div');
        rHuman.className = 'tl-row tl-meta';
        rHuman.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body">Retrying the model&hellip;</div>';
        sess.nodes.lastRecovery = { key: 'human', count: 1, el: rHuman };
        insert(rHuman);
        stickScroll(stream);
        return;
      }
      var rKey = text.slice(9).split(' — ')[0].split(':')[0].trim();
      var lastR = sess.nodes.lastRecovery;
      if (lastR && lastR.key === rKey && lastR.el && lastR.el.isConnected) {
        lastR.count++;
        var rChip = lastR.el.querySelector('.repeat-count');
        if (rChip) rChip.textContent = '×' + lastR.count;
        stickScroll(stream);
        return;
      }
      var rRow = document.createElement('div');
      rRow.className = 'tl-row tl-meta';
      rRow.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><b>recovery</b> ' + esc(text.slice(9).trim()) + ' <span class="chip warn repeat-count">×1</span></div>';
      sess.nodes.lastRecovery = { key: rKey, count: 1, el: rRow };
      insert(rRow);
      stickScroll(stream);
      return;
    }

    // A model retry is the moment Gitu noticed a failure and is actively
    // correcting it — the run is NOT frozen and NOT repeating the same
    // mistake. That distinction is trust-critical, so it renders for normal
    // users from the typed companion (attempt, maxAttempts, the real reason)
    // whenever one exists. The classifier has attached it to recover rows
    // all along; old restored rows without one still fall through to the
    // allowlist fallback below, unchanged. Developer mode keeps the raw
    // line: this arm is the calm human rendering, not the diagnostic.
    // Consecutive retries of the same cause collapse in place (the same
    // ×N convention the refusal card and the recovery ladder use).
    if (text.indexOf('recover ') === 0) {
      closeThought(runId);
      if (devMode()) {
        // Developer mode keeps the raw diagnostic line: this arm is the calm
        // human rendering, not the diagnostic. Fall through to the allowlist
        // view below instead of returning.
        sess.nodes.lastRecover = null;
      } else {
      var recTyped = ev.typed && ev.typed.type === 'recovering' ? ev.typed : null;
      // Same-cause collapse: the cause is the structured message when the
      // companion has one, else the prose detail. A DIFFERENT cause (or any
      // other row drawn in between — insert() clears lastRecover) starts a
      // new card, so the count can only ever mean consecutive.
      var recBody = text.replace(/^recover\s+/, '');
      var recCause = recTyped && recTyped.message ? String(recTyped.message) : recBody;
      var lastRec = sess.nodes.lastRecover;
      if (lastRec && lastRec.el && lastRec.el.isConnected && lastRec.cause === recCause) {
        lastRec.count++;
        var recChip = lastRec.el.querySelector('.repeat-count');
        if (recChip) recChip.textContent = '×' + lastRec.count;
        // Retries escalate: 1/3 then 2/3 changes the numbers even when the
        // cause is identical. Without a companion the prose may not carry
        // counts either; the card then says only "retrying".
        var recUp = lastRec.el.querySelector('.recover-nums');
        if (recUp) {
          var recA = recTyped && typeof recTyped.attempt === 'number' ? recTyped.attempt : (lastRec.attempt || 1) + 1;
          var recM = recTyped && typeof recTyped.maxAttempts === 'number' ? recTyped.maxAttempts : lastRec.max;
          recUp.textContent = recM ? 'retry ' + recA + ' of ' + recM : '';
          lastRec.attempt = recA; lastRec.max = recM || 0;
        }
        stickScroll(stream);
        return;
      }
      var recEl = document.createElement('div');
      recEl.className = 'tl-row tl-meta';
      var recHtml = '<span class="tl-dot dot-note"></span><div class="tl-body">' +
        '<span class="chip warn">\u21BB</span> <b>recovering</b>';
      if (recTyped && typeof recTyped.attempt === 'number' && typeof recTyped.maxAttempts === 'number') {
        recHtml += ' <span class="recover-nums">retry ' + recTyped.attempt + ' of ' + recTyped.maxAttempts + '</span>';
      } else if (recTyped && typeof recTyped.attempt === 'number') {
        recHtml += ' <span class="recover-nums">retry ' + recTyped.attempt + '</span>';
      }
      var recDetail = recTyped && recTyped.message ? String(recTyped.message) : recBody;
      if (recDetail) recHtml += '<div class="recover-detail">' + esc(recDetail) + '</div>';
      recHtml += ' <span class="chip warn repeat-count">\u00D71</span>';
      recEl.innerHTML = recHtml;
      // Set after the insert, which has already cleared lastRecover as
      // "something else was drawn in between" — the same ordering the
      // refused-action card documents.
      insert(recEl);
      sess.nodes.lastRecover = { cause: recCause, count: 1, el: recEl, attempt: recTyped && typeof recTyped.attempt === 'number' ? recTyped.attempt : 1, max: recTyped && typeof recTyped.maxAttempts === 'number' ? recTyped.maxAttempts : 0 };
      setWorking('Recovering' + (recDetail ? ' — ' + shortText(recDetail, 90) : '') + '…');
      stickScroll(stream);
      return;
      }
    }

    // Machine bookkeeping (diff snapshots, specialist checkpoints) accumulates
    // into ONE collapsed group instead of narrating over the agent's work —
    // and is Developer-only: normal users never see internal activity.
    if (text.indexOf('report ') === 0 || text.indexOf('checkpoint ') === 0) {
      closeThought(runId);
      if (!devMode()) return;
      if (!sess.nodes.internal) {
        var ig = document.createElement('div');
        ig.className = 'tl-row tl-meta';
        ig.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><details class="exec-details"><summary><b>Internal activity</b><span class="exec-sum internal-count">1 entry</span><span class="chev">\u25B8</span></summary><pre class="exec-pre"></pre></details></div>';
        sess.nodes.internal = ig;
        sess.nodes.internalCount = 0;
        insert(ig);
      }
      sess.nodes.internalCount++;
      var igCount = sess.nodes.internal.querySelector('.internal-count');
      if (igCount) igCount.textContent = sess.nodes.internalCount + (sess.nodes.internalCount === 1 ? ' entry' : ' entries');
      var igSink = sess.nodes.internal.querySelector('.exec-pre');
      if (igSink) igSink.appendChild(document.createTextNode(text + '\n'));
      stickScroll(stream);
      return;
    }

    if (text.indexOf('browseshot ') === 0) {
      var shot = document.createElement('div');
      shot.className = 'shotmsg browser-shot';
      shot.innerHTML = '<div class="browser-chat-highlight"><b>Visual check</b><span>Browser screenshot</span></div><img alt="browser screenshot">';
      shot.querySelector('img').src = text.slice(11);
      appendLive(stream, shot);
      stickScroll(stream);
      return;
    }

    closeThought(runId);
    var tag = text.split(' ')[0];
    var body = text.slice(tag.length).trim();

    // End-of-run status echo from the server ("run finished: failed/blocked/...").
    // The "run " prefix would otherwise render as a fake tool card with an
    // empty output disclosure. Status is already shown by the header chip,
    // the "done" meta row, the error card and the summary card.
    if (text.indexOf('run finished: ') === 0) return;

    if (tag === 'run') {
      var kind = toolKind(body);
      var summary = splitSummary(body);
      var reason = splitReason(body);
      var group = ensureToolActivityGroup(sess, insert);
      sess.nodes.nextToolBatchHint = '';
      row = document.createElement('div');
      row.className = 'tool-call' + (kind === 'browser' ? ' tl-browser' : '');
      row.dataset.toolKind = kind;
      row.innerHTML =
        '<button type="button" class="tl-cmd tool-call-head" aria-expanded="false">' +
          '<span class="tool-kind" aria-hidden="true">' + ({ shell: '&gt;_', read: '≡', edit: '±', search: '⌕', list: '▤', browser: '◎', tool: '◇' }[kind] || '◇') + '</span>' +
          '<span class="cmd">' + esc(humanToolSummary(kind, summary)) + '</span>' +
          (reason ? '<span class="why">— ' + esc(reason) + '</span>' : '') +
          '<span class="st st-run">Running</span><span class="tool-duration">0s</span><span class="tool-chevron" aria-hidden="true">›</span>' +
        '</button>' +
        '<details class="tl-out"><summary><span class="output-label">Output · waiting for result</span><button type="button" class="tool-btn-copy" title="Copy output">' + icon('copy') + ' Copy</button></summary>' +
          '<code class="tool-command">' + esc(summary) + '</code>' +
          (reason ? '<p class="tool-purpose">' + esc(reason) + '</p>' : '') +
          '<pre>Waiting for tool output…</pre></details>';
      var commandButton = row.querySelector('.tool-call-head');
      var outputDetails = row.querySelector('.tl-out');
      commandButton.title = summary + (reason ? '\n' + reason : '');
      outputDetails.id = 'tool-output-' + runId + '-' + ev.i;
      commandButton.setAttribute('aria-controls', outputDetails.id);
      commandButton.onclick = function (e) {
        e.stopPropagation();
        outputDetails.open = !outputDetails.open;
        commandButton.setAttribute('aria-expanded', String(outputDetails.open));
      };
      outputDetails.addEventListener('toggle', function () {
        commandButton.setAttribute('aria-expanded', String(outputDetails.open));
      });

      var copyBtn = row.querySelector('.tool-btn-copy');
      setupCopyButton(copyBtn, function () {
        var pre = row.querySelector('pre');
        return (pre && pre.textContent) || summary;
      });

      var list = group.el.querySelector('.tool-group-list');
      if (list) list.appendChild(row);
      sess.nodes.lastTool = row;
      sess.nodes.toolRows = sess.nodes.toolRows || [];
      row.dataset.toolKey = summary;
      row.dataset.toolReason = reason;
      row.dataset.toolState = 'working';
      row.dataset.startedAt = String(Date.parse(ev.t) || Date.now());
      sess.nodes.toolRows.push(row);
      refreshToolActivityGroup(group.el);
      var wt = workingTextFor(text);
      if (wt) setWorking(wt);
      stickScroll(stream);
      return;
    }
    if (tag === 'ok' || tag === 'error' || tag === 'denied' || tag === 'blocked') {
      var tool = finishToolRow(sess, tag, body);
      // No duration means this was a preflight denial/schema error, for which
      // no run card exists.  Do not mutate an unrelated active card.
      if (!tool) return;
      setWorking(activeToolRows(sess).length ? 'Running parallel tools…' : 'Thinking…');
      return;
    }
    if (tag === 'out') {
      // out follows its own terminal event, so prefer that correlated row;
      // lastTool remains a compatibility fallback for old event streams.
      var t2 = sess.nodes.lastOutputTool || sess.nodes.lastTool || findToolRow(sess, '', true);
      if (t2) {
        var detailsEl = t2.querySelector('details');
        var preEl = t2.querySelector('pre');
        var cleanOut = body.replace(/ ⏎ /g, '\n');
        setupOutputFolding(detailsEl, preEl, cleanOut);
        decorateToolDiff(t2, preEl, cleanOut);
        var outputLabel = t2.querySelector('.output-label');
        var outputLines = cleanOut ? cleanOut.split('\n').length : 0;
        if (outputLabel) outputLabel.textContent = 'Output · ' + outputLines + (outputLines === 1 ? ' line' : ' lines');
        stickScroll(stream);
      }
      return;
    }
    // Intake burst → one quiet silver line. Errors (fatal/blocked/denied)
    // and agent output are never grouped — they stay prominent in the stream.
    if (INTAKE_TAGS[tag]) {
      upsertIntakeLine(runId, insert, tag, body);
      return;
    }
    // Specialist lifecycle + activity → one living card per job (never a pile of lines).
    var mSpec = SPEC_LIFECYCLE.exec(text);
    if (mSpec) {
      upsertSpecialistCard(runId, insert, mSpec[1], mSpec[2], mSpec[3], mSpec[4], ev.t);
      var wt3 = workingTextFor(text);
      if (wt3) setWorking(wt3);
      return;
    }
    if (text.indexOf('subagent ') === 0 && attachSpecialistActivity(runId, text, ev.t)) {
      return;
    }
    var meta = document.createElement('div');
    if (tag === 'evidence') {
      // The typed companion carries the real verdict — a substring check for
      // PASS could misread a passing line whose label merely contains FAIL — plus the
      // id and kind as separate fields. The prose parse stays for rows without a
      // companion: old databases, or a row the classifier demoted to log.
      var evTyped = ev.typed && ev.typed.type === 'evidence_recorded' ? ev.typed : null;
      var isPass = evTyped ? evTyped.passed === true : body.indexOf('PASS') >= 0;
      var evBody = evTyped
        ? (evTyped.kind ? evTyped.kind + ' ' : '') + String(evTyped.evidenceId || '') + (isPass ? ' passed' : ' failed')
        : body;
      meta.className = 'tl-row tl-ev';
      meta.innerHTML = '<span class="tl-dot dot-ev"></span><div class="tl-body"><span class="ev-pill ' + (isPass ? 'pass' : 'fail') + '">' + (isPass ? '&#10003; ' : '&#10005; ') + esc(evBody) + '</span></div>';
    } else if (tag === 'plan') {
      // Same companion rule: the count and the follow-up distinction are
      // structured on the event; the regex on the line is the fallback.
      var planTyped = ev.typed && ev.typed.type === 'plan_created' ? ev.typed : null;
      var followUp = planTyped ? false : / follow-up steps$/.test(body);
      var stepCount = planTyped ? planTyped.steps : parseInt(body, 10) || 0;
      meta.className = 'tl-row tl-meta';
      meta.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><b>plan</b> ' + esc(stepCount + (followUp ? ' follow-up' : '') + (stepCount === 1 ? ' step' : ' steps')) + ' — review it, then approve to build</div>';
    } else if (tag === 'subagent') {
      meta.className = 'tl-row tl-meta subagent-note';
      meta.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><b>specialist</b> ' + esc(body) + '</div>';
    } else if (tag === 'done') {
      if (!devMode()) return;
      // End-of-run echo: show the conversational outcome, not the raw
      // CHANGES dump (the full report card below carries the detail).
      var dDash = body.indexOf(' — ');
      var dParsed = parseOutcome(dDash >= 0 ? body.slice(dDash + 3) : body);
      meta.className = 'tl-row tl-meta';
      meta.innerHTML = '<span class="tl-dot dot-ok"></span><div class="tl-body"><b>🎉 ' + esc(dDash >= 0 ? body.slice(0, dDash) : 'done') + '</b> — ' + esc(shortText(reportLede(dParsed.lede), 220)) + '</div>';
    } else if (tag === 'problem' || tag === 'resolved' || tag === 'note' || tag === 'hypothesis' || tag === 'step' || tag === 'todo' || tag === 'decision' || tag === 'replan') {
      // Designed narration rows: the agent's story while it works. These are
      // runtime sentences (already user-facing), so normal users see them —
      // unlike the dev-only fallback below.
      var storyLabels = { problem: 'recovery', resolved: 'recovery', note: 'working', hypothesis: 'theory', step: 'step', todo: 'todo', decision: 'decision', replan: 'replan' };
      var storyTone = tag === 'problem' ? 'dot-bad' : (tag === 'resolved' || tag === 'step' || tag === 'todo') ? 'dot-ok' : 'dot-note';
      meta.className = 'tl-row tl-meta';
      meta.innerHTML = '<span class="tl-dot ' + storyTone + '"></span><div class="tl-body"><b>' + esc(storyLabels[tag]) + '</b> ' + esc(body) + '</div>';
    } else if (tag === 'warn') {
      // warn rows are model-health diagnostics (reasoning-only replies,
      // malformed streaks). Actionable failures surface through the error
      // card, so normal users never see them; Developer mode does.
      if (!devMode()) { closeThought(runId); return; }
      var warnKey = body.replace(/\s*\(streak \d+\)/i, '').replace(/^\d+ replies in a row /i, 'replies in a row ').trim();
      var previousWarn = sess.nodes.lastWarn;
      if (previousWarn && previousWarn.el && previousWarn.el.isConnected && previousWarn.key === warnKey) {
        previousWarn.count++;
        var repeat = previousWarn.el.querySelector('.repeat-count');
        if (repeat) repeat.textContent = '×' + previousWarn.count;
        stickScroll(stream);
        return;
      }
      meta.className = 'tl-row tl-meta';
      meta.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><b>warn</b> ' + esc(warnKey) + ' <span class="chip warn repeat-count">×1</span></div>';
      sess.nodes.lastWarn = { key: warnKey, count: 1, el: meta };
    } else {
      sess.nodes.lastWarn = null;
      sess.nodes.lastRecovery = null;
      sess.nodes.lastRecover = null;
      // ARCHITECTURAL RULE — the timeline is allowlisted. The tags above are
      // explicitly designed UI; ANY other (future, internal) event tag is
      // hidden for normal users and shown only in Developer mode. A newly
      // added server event can never accidentally become user-facing.
      if (!devMode()) { closeThought(runId); return; }
      meta.className = 'tl-row tl-meta';
      meta.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><b>' + esc(tag) + '</b> ' + esc(body) + '</div>';
    }
    insert(meta);
    var wt2 = workingTextFor(text);
    if (wt2) setWorking(wt2);
    stickScroll(stream);
  }