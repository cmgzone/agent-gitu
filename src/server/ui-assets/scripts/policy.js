

  // Presentation only: the code is the fact, the label is how it reads. An
  // unrecognized code degrades to its own words rather than to nothing, so a
  // future emitter cannot silently render an empty card.
  function policyReasonLabel(typed) {
    var code = String((typed && typed.reason) || '');
    if (POLICY_REASON_LABELS[code]) return POLICY_REASON_LABELS[code];
    return code ? code.replace(/_/g, ' ') : 'policy';
  }

  function policyNoticeHtml(typed) {
    var blocked = typed.type === 'operation_blocked';
    var html = '<span class="tl-dot ' + (blocked ? 'dot-blocked' : 'dot-bad') + '"></span><div class="tl-body">' +
      '<span class="chip ' + (blocked ? 'warn' : 'bad') + '">' + esc(blocked ? 'blocked' : 'denied') + '</span> ' +
      '<b>' + esc(policyReasonLabel(typed)) + '</b>';
    var op = String(typed.operation || '').trim();
    if (op) html += ' <span class="policy-op">' + esc(op) + '</span>';
    if (typed.tool) html += ' <span class="policy-tool">' + esc(typed.tool) + '</span>';
    if (typed.detail) {
      var detail = String(typed.detail);
      if (typed.reason === 'loop_detected' || detail.length > 220) {
        var summary = typed.reason === 'loop_detected'
          ? 'Repeated action stopped. Use earlier results or try a different check.'
          : detail.slice(0, 150).replace(/\s+/g, ' ').trim() + (detail.length > 150 ? '…' : '');
        html += '<div class="policy-summary">' + esc(summary) + '</div>' +
          '<details class="policy-detail"><summary>Technical details</summary><div class="policy-raw">' + esc(detail) + '</div></details>';
      } else {
        html += '<div class="policy-detail">' + esc(detail) + '</div>';
      }
    }
    return html + ' <span class="chip warn repeat-count">&times;1</span></div>';
  }

  /**
   * Insert one timeline node where it belongs: before the working indicator,
   * with the replay styling and the timestamp stamp the prose path has always
   * used. Shared, so a typed card lands exactly like a prose row.
   */
  function insertTimelineNode(sess, el, iso) {
    var stream = $('stream');
    if (!stream) return;
    // A refused-action card counts *consecutive* refusals, so anything else
    // drawn in between ends the run of repeats. Recovery retries follow the
    // same rule via lastRecover.
    if (sess && sess.nodes) { sess.nodes.lastPolicy = null; sess.nodes.lastRecover = null; }
    if (sess && sess.replaying) el.classList.add('replayed');
    if (iso && el.classList && el.classList.contains('tl-row')) {
      var stamp = document.createElement('span');
      stamp.className = 'tl-time';
      stamp.textContent = hhmm(iso);
      stamp.title = new Date(iso).toLocaleString();
      el.appendChild(stamp);
    }
    var working = $('working');
    if (working) stream.insertBefore(el, working); else stream.appendChild(el);
    if ((!sess||!sess.replaying)&&el.matches('.usermsg,.abubble,.agent-report,.tl-note-row')) chatBubbleEntrance(el);
    trimTimeline(stream);
    stickScroll(stream);
  }

  // A refused action stays true of the run forever, so a restored frame renders
  // here too — unlike a gate request, whose runtime did not survive the restart.
  function applyPolicyNotice(runId, typed, frame) {
    var sess = S.sessions[runId];
    if (!sess || !sess.nodes) return;
    var key = String(typed.reason || '') + '|' + String(typed.operation || '');
    var last = sess.nodes.lastPolicy;
    if (last && last.key === key && last.el && last.el.isConnected) {
      last.count += 1;
      var chip = last.el.querySelector('.repeat-count');
      if (chip) chip.textContent = '×' + last.count;
      return;
    }
    var el = document.createElement('div');
    el.className = 'tl-row tl-policy';
    el.innerHTML = policyNoticeHtml(typed);
    // A restored notice is history, so it appears without the entrance
    // animation a live one gets — the same rule replayed rows follow.
    if (frame && frame.restored) el.classList.add('replayed');
    insertTimelineNode(sess, el, frame && frame.t);
    // Set after the insert, which has already cleared it as "something else
    // was drawn in between".
    sess.nodes.lastPolicy = { key: key, count: 1, el: el };
  }