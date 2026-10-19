

  // A failed send previously left an optimistic bubble that looked DELIVERED
  // (cleanup ran only on the success path). Mark it failed, surface the
  // reason inline, and offer one-click retry.
  function failUserBubble(runId, text, errMsg, ubId) {
    var stream = $('stream');
    var sess = S.sessions[runId];
    if (!stream || !sess) return;
    if (sess.pendingUserMessages) {
      var idx = sess.pendingUserMessages.findIndex(function (item) { return ubId ? item.id === ubId : item.text === credentialChatInput(text).safeText; });
      if (idx >= 0) sess.pendingUserMessages.splice(idx, 1);
    }
    // Prefer the unique bubble id: two identical texts must not fail/retry
    // each other's bubbles.
    var target = ubId ? stream.querySelector('div[data-ubid="' + ubId + '"]') : null;
    if (!target) {
      stream.querySelectorAll('div[data-ubtext]').forEach(function (b) {
        if (b.getAttribute('data-ubtext') === text) target = b;
      });
    }
    if (!target) { toast(errMsg || 'send failed', true); return; }
    if (target.querySelector('.sendfail')) return;
    target.classList.add('failed');
    var row = document.createElement('div');
    row.className = 'sendfail';
    row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:6px;color:var(--err);font-size:11.5px';
    var msgSpan = document.createElement('span');
    msgSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px';
    msgSpan.textContent = String(errMsg || 'send failed').slice(0, 160);
    var btn = document.createElement('button');
    btn.className = 'btn ghost';
    btn.style.cssText = 'padding:3px 10px;font-size:11.5px';
    btn.innerHTML = icon('retry') + ' Retry';
    btn.onclick = function () {
      target.remove();
      sendFollow(text);
    };
    row.appendChild(msgSpan);
    row.appendChild(btn);
    target.querySelector(':scope > div').appendChild(row);
    stickScroll(stream, true);
  }

  function closeThought(runId) {
    var sess = S.sessions[runId];
    var node = sess.nodes.thought;
    if (node) {
      flushStreamText(node.querySelector('.exec-pre'));
      var c = node.querySelector('.caret'); if (c) c.remove();
      if (node.classList.contains('tl-stream-row')) node.dataset.streamState = 'done';
      dedupeNarration(sess, node, 'lastThoughtText');
      finalizeNarration(node);
      sess.nodes.thought = null;
    }
  }
  // ── Narration finalization ─────────────────────────────────────────────
  // Stream plain text, then apply safe formatting without rewriting or
  // shortening the response. Protocol leaks never become conversation.
  // Matches a raw JSON action object prefix whether or not the stream cut
  // off before the closing quote: '{"thought"…', '{"thought' (truncated),
  // and the escaped '{\"thought\"' variants.
  var JSON_LEAK_RE = /^\{\s*\\?"thought/;
  var JSON_LEAK_MARKERS = ['{"thought', '{\\"thought'];
  function stripJsonLeak(t) {
    var cut = -1;
    for (var i = 0; i < JSON_LEAK_MARKERS.length; i++) {
      var at = t.indexOf(JSON_LEAK_MARKERS[i]);
      if (at >= 0 && (cut < 0 || at < cut)) cut = at;
    }
    if (cut < 0) return t;
    return t.slice(0, cut).replace(/[\s,;·—-]+$/, '');
  }
  // Called once per narration node when its stream ends. Idempotent via
  // data-final so replays/retries never restructure twice.
  function finalizeNarration(el) {
    var txt = el.querySelector('.txt');
    flushStreamText(txt);
    if (!txt || txt.getAttribute('data-final')) return;
    txt.setAttribute('data-final', '1');
    var raw = txt.textContent || '';
    var clean = stripJsonLeak(raw);
    var trimmed = clean.trim();
    // The WHOLE node is a leaked action object: never show schema noise as
    // conversation. Normal mode drops it entirely; Developer mode keeps the
    // old collapsed disclosure.
    if (JSON_LEAK_RE.test(trimmed)) {
      txt.textContent = '';
      if (!devMode()) return;
      var d = document.createElement('details');
      d.className = 'exec-details';
      d.innerHTML = '<summary><b>Raw model output</b><span class="chev">\u25B8</span></summary><pre class="exec-pre"></pre>';
      d.querySelector('.exec-pre').textContent = trimmed;
      txt.appendChild(d);
      return;
    }
    if (clean !== raw) txt.textContent = clean;
    txt.classList.add('response-prose');
    txt.innerHTML = renderResponseText(clean);
  }
  // ── Retry-duplicate collapsing ──────────────────────────────────────────
  // After a transient LLM failure the retry re-streams the SAME thought, and
  // the interleaved "recover …" events close the previous row — so every
  // attempt rendered as an identical narration row. Collapse exact repeats
  // entirely; if the retry continues FURTHER than the failed attempt, keep
  // only the new tail.
  function dedupeNarration(sess, el, memoKey) {
    var txt = el.querySelector('.txt');
    flushStreamText(txt);
    if (!txt) return;
    var raw = (txt.textContent || '').trim();
    if (!raw) return;
    var prev = sess[memoKey] || '';
    if (prev) {
      if (raw === prev) { el.remove(); return; }
      if (raw.length > prev.length && raw.indexOf(prev) === 0) {
        txt.textContent = raw.slice(prev.length).replace(/^[\s.,;—-]+/, '');
      }
    }
    sess[memoKey] = raw;
  }
  // An agent bubble ends whenever the next turn starts; sanitize + structure
  // it at exactly that moment instead of leaving streaming text frozen.
  function retireAbubble(sess) {
    var b = sess.nodes.abubble;
    if (!b) return;
    sess.nodes.abubble = null;
    dedupeNarration(sess, b, 'lastBubbleText');
    finalizeNarration(b);
  }
  function toolKind(summary) {
    if (summary.indexOf('write ') === 0) return 'edit';
    if (summary.indexOf('edit ') === 0) return 'edit';
    if (summary.indexOf('read ') === 0) return 'read';
    if (summary.indexOf('list ') === 0) return 'list';
    if (summary.indexOf('search ') === 0) return 'search';
    if (summary.indexOf('$ ') === 0) return 'shell';
    if (summary.indexOf('browse') === 0) return 'browser';
    return 'tool';
  }
  // Human tool labels: what Gitu is doing, not the wire format. The raw
  // summary stays on dataset.toolKey for run/ok/error correlation.
  function humanToolSummary(kind, summary) {
    if (kind === 'read') return 'Read ' + summary.slice(5);
    if (kind === 'edit') return 'Edit ' + summary.slice(summary.indexOf(' ') + 1);
    if (kind === 'list') return 'List ' + summary.slice(5);
    if (kind === 'search') return 'Search ' + summary.slice(7);
    if (kind === 'browser') return 'Browser · ' + summary;
    if (kind === 'shell') return summary.slice(2);
    return summary;
  }
  function splitSummary(body) { var d = body.indexOf(' — '); return d >= 0 ? body.slice(0, d) : body; }
  function splitReason(body) { var d = body.indexOf(' — '); return d >= 0 ? body.slice(d + 3) : ''; }
  function publicThinkingStatus(text) {
    var description = String(text || '').replace(/^think\s*/, '').replace(/\s+/g, ' ').trim();
    if (!description || /[{}\[\]]/.test(description)) return 'Thinking…';
    return 'Thinking · ' + description.charAt(0).toUpperCase() + shortText(description.slice(1), 90).replace(/[.!?]+$/, '') + '…';
  }
  function workingTextFor(text) {
    if (text.indexOf('think') === 0) return publicThinkingStatus(text);
    if (text.indexOf('run ') === 0) {
      var summary = splitSummary(text.slice(4)).trim();
      var k = toolKind(summary);
      if (k === 'edit') return 'Editing ' + summary.slice(summary.indexOf(' ') + 1) + '…';
      if (k === 'read') return 'Reading ' + summary.slice(5) + '…';
      if (k === 'list') return 'Listing ' + summary.slice(5) + '…';
       if (k === 'search') return 'Searching…';
       if (k === 'browser') return 'Checking in browser…';
      if (k === 'shell') return 'Running ' + summary.slice(2) + '…';
      return 'Working: ' + summary + '…';
    }
    if (text.indexOf('plan ') === 0) return 'Building plan…';
    if (text.indexOf('criteria') === 0) return 'Defining acceptance criteria…';
    if (text.indexOf('evidence') === 0) return 'Recording evidence…';
    if (text.indexOf('verify ') === 0) return 'Verifying locally…';
    if (text.indexOf('claim') === 0) return 'Checking acceptance…';
    if (text.indexOf('problem') === 0) return 'Investigating a failure…';
    if (text.indexOf('resolved') === 0) return 'Resuming the plan…';
    if (text.indexOf('replan') === 0) return 'Updating the plan…';
    if (text.indexOf('hypothesis') === 0) return 'Working out the cause…';
    if (text.indexOf('context') === 0) return 'Selecting context…';
    return null;
  }
  // Presentation filters may hide technical rows, but must not hide the
  // actual run phase. Never let a background chat replace the active status.
  function syncWorkingActivity(runId, text) {
    if (S.active && S.active !== runId) return;
    var status = null;
    if (text === 'activity indexing-project') status = 'Indexing project…';
    else if (text === 'activity preparing-project') status = 'Preparing project…';
    else if (text === 'activity preparing-model') status = 'Preparing model…';
    else if (text.indexOf('activity reasoning') === 0) status = 'Reasoning…';
    else if (text.indexOf('activity content') === 0 || text.indexOf('activity tool') === 0) status = 'Thinking…';
    else if (/^(?:ok|error|denied|blocked) /.test(text)) status = 'Thinking…';
    else status = workingTextFor(text);
    if (status) setWorking(status);
  }
  // Working indicator with an elapsed-seconds counter that escalates after
  // 60s on the SAME phase text — a hung command becomes visible instead of
  // looking alive forever. Counter resets whenever the phase text changes.
  function setWorking(text) {
    var w = $('working');
    if (!w) return;
    if (!text) {
      w.style.display = 'none';
      w.classList.remove('slow');
      if (S.workingTimer) { clearInterval(S.workingTimer); S.workingTimer = null; }
      S.workingSince = null; S.lastWorkingText = null;
      var e0 = $('workingElapsed'); if (e0) e0.textContent = '';
      return;
    }
    // A tool row owns its own spinner. Otherwise keep the live thinking line
    // at the tail so the animation follows the current narration.
    w.style.display = document.querySelector('.tool-call[data-tool-state="working"]') ? 'none' : 'flex';
    if (text !== S.lastWorkingText) { S.lastWorkingText = text; S.workingSince = Date.now(); w.classList.remove('slow'); }
    var t = $('workingText');
    if (t && t.textContent !== text) t.textContent = text;
    var activeSession = S.sessions[S.active];
    renderReasoningStream($('workingReasoning'), activeSession && activeSession.nodes && activeSession.nodes.reasoningText);
    if (!S.workingTimer) {
      S.workingTimer = setInterval(function () {
        if (!document.hidden) document.querySelectorAll('.tool-call[data-tool-state="working"]').forEach(function (row) {
          var duration = row.querySelector('.tool-duration');
          if (duration) duration.textContent = Math.max(0, Math.floor((Date.now() - Number(row.dataset.startedAt)) / 1000)) + 's';
        });
        var sec = Math.floor((Date.now() - (S.workingSince || Date.now())) / 1000);
        var e = $('workingElapsed');
        if (e) e.textContent = sec >= 3 ? '· ' + sec + 's' : '';
        var ww = $('working');
        if (ww && sec >= 60) ww.classList.add('slow');
      }, 1000);
    }
  }

  function setupCopyButton(btn, textGetter) {
    if (!btn) return;
    btn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      var str = typeof textGetter === 'function' ? textGetter() : String(textGetter || '');
      if (!str) return;
      navigator.clipboard.writeText(str).then(function () {
        btn.classList.add('copied');
        var old = btn.innerHTML;
        btn.innerHTML = icon('check') + ' Copied';
        setTimeout(function () {
          btn.classList.remove('copied');
          btn.innerHTML = old;
        }, 1500);
      }).catch(function () {});
    };
  }

  function setupOutputFolding(detailsEl, preEl, text) {
    if (!detailsEl || !preEl) return;
    preEl.textContent = text;
    var lines = text.split('\n');
    var oldBtn = detailsEl.querySelector('.fold-btn');
    if (oldBtn) oldBtn.remove();
    if (lines.length > 8) {
      preEl.classList.add('folded');
      var foldBtn = document.createElement('button');
      foldBtn.className = 'fold-btn';
      foldBtn.type = 'button';
      var hiddenCount = lines.length - 6;
      foldBtn.textContent = 'Show ' + hiddenCount + ' more lines…';
      foldBtn.onclick = function (e) {
        e.stopPropagation();
        var isFolded = preEl.classList.toggle('folded');
        foldBtn.textContent = isFolded ? ('Show ' + hiddenCount + ' more lines…') : 'Show less';
      };
      detailsEl.appendChild(foldBtn);
    } else {
      preEl.classList.remove('folded');
    }
  }

  // Actual patch output gets line color and counts. Plain edit acknowledgements
  // stay plain: a successful write does not tell us how many lines changed.
  function decorateToolDiff(row, preEl, output) {
    if (!row || row.dataset.toolKind !== 'edit' || !preEl) return;
    var lines = String(output || '').split('\n');
    var patch = lines.some(function (line) { return /^diff --git |^@@ |^--- /.test(line); });
    if (!patch) return;
    var added = 0, removed = 0;
    lines.forEach(function (line) {
      if (line.charAt(0) === '+' && line.indexOf('+++') !== 0) added++;
      if (line.charAt(0) === '-' && line.indexOf('---') !== 0) removed++;
    });
    if (!added && !removed) return;
    preEl.classList.add('tool-diff');
    preEl.textContent = '';
    lines.forEach(function (line, index) {
      var span = document.createElement('span');
      span.className = 'tool-diff-line' +
        (line.charAt(0) === '+' && line.indexOf('+++') !== 0 ? ' add' :
        line.charAt(0) === '-' && line.indexOf('---') !== 0 ? ' del' :
        /^@@ |^diff --git /.test(line) ? ' hunk' : '');
      span.textContent = line + (index < lines.length - 1 ? '\n' : '');
      preEl.appendChild(span);
    });
    var head = row.querySelector('.tool-call-head');
    if (!head) return;
    var stat = head.querySelector('.tool-change-stat');
    if (!stat) {
      stat = document.createElement('span');
      stat.className = 'tool-change-stat';
      var status = head.querySelector('.st');
      if (status) head.insertBefore(stat, status); else head.appendChild(stat);
    }
    stat.innerHTML = '<span class="added">+' + added + '</span><span class="removed">−' + removed + '</span>';
    stat.setAttribute('aria-label', added + ' lines added, ' + removed + ' lines removed');
  }

  // Specialists share one quiet presence grid beneath the parent narration.
  var SPEC_LIFECYCLE = /^subagent (\S+) \[(queued|running|completed|failed|cancelled|blocked|paused)\] (sub-[^\s]+) — ?([\s\S]*)$/;