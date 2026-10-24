

  function closeToolPanel() {
    var panel = $('toolPanel');
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    S.panelKind = '';
    stopBrowserPoll();
    renderSidebar();
  }

  function openToolPanel(kind) {
    if (kind === 'browser' && $('stream')) { showChatBrowser(); return; }
    var panel = $('toolPanel');
    if (!panel) return;
    if (!panel.hidden && S.panelKind === kind) { closeToolPanel(); return; }
    toggleContextCard(false);
    stopBrowserPoll();
    S.panelKind = kind;
    panel.hidden = false;
    $('toolPanelTitle').textContent = kind === 'browser' ? 'Browser' : kind === 'git' ? 'Git' : kind==='files'?'Files & details':'Task details';
    $('sideBody').innerHTML = '';
    $('sideBody')._runFilesSignature=null;
    toggleMobileNav(false);
    renderSidebar();
    if (kind === 'browser') showBrowserPanel(S.active);
    else if (kind === 'git') renderGitPanel(S.active);
    else if(kind==='files')renderRunFiles(S.active);
    else if (S.active !== 'home') renderRunSide(S.active);
  }

  function toggleMobileNav(open) {
    var shell = document.querySelector('.shell');
    var btn = $('mobileNav');
    if (!shell) return;
    shell.classList.toggle('mobile-nav-open', Boolean(open));
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    var history=$('mainChatHistory');if(history)history.setAttribute('aria-expanded',open?'true':'false');
  }

  function applyWidths() {
    var rs = document.documentElement.style;
    rs.setProperty('--sbw', (S.settings.sbWidth || 264) + 'px');
  }

  function bindResize(id) {
    var h = $(id);
    if (!h) return;
    h.addEventListener('mousedown', function (e) {
      e.preventDefault();
      var el = document.querySelector('.sb');
      if (!el) return;
      var startX = e.clientX;
      var startW = el.getBoundingClientRect().width;
      h.classList.add('active');
      var move = function (ev) {
        var dx = ev.clientX - startX;
        var w = Math.max(200, Math.min(760, Math.round(startW + dx)));
        S.settings.sbWidth = w;
        applyWidths();
      };
      var up = function () {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        h.classList.remove('active');
        persist();
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  function clientNormalize(input) {
    var url = String(input || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) {
      if (/^localhost(:\d+)?/i.test(url) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?/.test(url)) url = 'http://' + url;
      else if (url.indexOf('.') < 0 && url.indexOf(':') < 0) url = 'https://www.bing.com/search?q=' + encodeURIComponent(url);
      else url = 'https://' + url;
    }
    return url;
  }

  function gitQueryPath() { return effectiveProjectPath(); }

  function renderGitPanel(runId) {
    var body = $('sideBody');
    body.innerHTML = '<div style="padding:4px 2px"><div id="gitHead" class="meta" style="margin-bottom:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">loading…</div><div id="gitBody"></div></div>';
    refreshGit();
  }

  function refreshGit() {
    api('/api/git?path=' + encodeURIComponent(gitQueryPath())).then(function (g) {
      var head = $('gitHead');
      var gb = $('gitBody');
      if (!head || !gb) return;
      if (!g.available) {
        head.textContent = 'Not a git repository' + (g.root ? ' (' + g.root + ')' : '') + '.';
        gb.innerHTML = '<p class="meta">Initialize git to track changes, commit and push from here.</p><button class="btn dark" id="gitInit">git init</button>';
        $('gitInit').onclick = function () {
          api('/api/git/init', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: gitQueryPath() }) })
            .then(function () { toast('git initialized'); refreshGit(); })
            .catch(function (e) { toast(e.message, true); });
        };
        return;
      }
      var files = g.files || [];
      head.innerHTML = '<span class="chip info">' + esc(g.branch || '?') + '</span>' +
        (g.ahead ? ' <span class="chip">ahead ' + g.ahead + '</span>' : '') +
        (g.behind ? ' <span class="chip warn">behind ' + g.behind + '</span>' : '') +
        '<span class="meta" style="word-break:break-all;flex:1">' + esc(g.remote || 'no remote') + '</span>' +
        '<button class="ubtn" id="gitRefresh" title="refresh">' + icon('retry') + '</button>';
      $('gitRefresh').onclick = refreshGit;
      var html = '<div class="section-h" style="margin-top:0">Working tree (' + files.length + ')</div>';
      if (!files.length) html += '<div class="empty">clean — no changes</div>';
      html += files.map(function (f) {
        return '<div class="grow-row"><label style="display:flex;gap:7px;align-items:center;flex:1;cursor:pointer;min-width:0">' +
          '<input type="checkbox" class="chk gitf" data-f="' + esc(f.path) + '" style="margin:0;width:auto" checked>' +
          '<span class="chip ' + (f.untracked ? 'warn' : 'info') + '" style="flex:none">' + esc(f.status) + '</span>' +
          '<span class="gitpath" data-diff="' + esc(f.path) + '" title="view diff">' + esc(f.path) + '</span></label>' +
          (f.untracked ? '' : '<button class="ubtn gitdiscard" data-d="' + esc(f.path) + '" title="discard changes">' + icon('x') + '</button>') +
          '</div>';
      }).join('');
      html += '<pre class="skinstr" id="gitDiff" hidden></pre>';
      html += '<div class="section-h">Commit &amp; push</div>' +
        '<input id="gitMsg" placeholder="commit message" style="width:100%;border:1px solid var(--border2);border-radius:8px;background:var(--card2);color:var(--text);padding:7px 9px;margin-bottom:8px">' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
        '<button class="btn dark" id="gitCommitSel">Commit selected</button>' +
        '<button class="btn ghost" id="gitCommitAll">Commit all</button>' +
        '<button class="btn ghost" id="gitPush">' + (g.ahead ? 'Push (' + g.ahead + ')' : 'Push') + '</button>' +
        '</div>';
      gb.innerHTML = html;
      gb.querySelectorAll('[data-diff]').forEach(function (el) {
        el.onclick = function () {
          var pre = $('gitDiff');
          var f = el.getAttribute('data-diff');
          if (pre.dataset.cur === f && !pre.hidden) { pre.hidden = true; return; }
          pre.hidden = false; pre.dataset.cur = f; pre.textContent = 'loading diff…';
          api('/api/git/diff?path=' + encodeURIComponent(gitQueryPath()) + '&file=' + encodeURIComponent(f)).then(function (d) {
            pre.textContent = d.diff || '(no unstaged diff — file may be untracked or staged)';
          }).catch(function (e) { pre.textContent = e.message; });
        };
      });
      gb.querySelectorAll('.gitdiscard').forEach(function (el) {
        el.onclick = function () {
          var f = el.getAttribute('data-d');
          if (!confirm('Discard local changes in ' + f + '?')) return;
          api('/api/git/discard', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: gitQueryPath(), file: f }) })
            .then(function () { toast('Discarded ' + f); refreshGit(); })
            .catch(function (e) { toast(e.message, true); });
        };
      });
      function selected() {
        var out = [];
        gb.querySelectorAll('.gitf').forEach(function (cb) { if (cb.checked) out.push(cb.getAttribute('data-f')); });
        return out;
      }
      function commit(filesOrNull) {
        var msg = $('gitMsg').value.trim();
        if (!msg) { toast('Commit message required', true); $('gitMsg').focus(); return; }
        if (filesOrNull && !filesOrNull.length) { toast('No files selected', true); return; }
        var payload = { path: gitQueryPath(), message: msg };
        if (filesOrNull) payload.files = filesOrNull;
        api('/api/git/commit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
          .then(function (d) { toast('Committed ' + d.commit); $('gitMsg').value = ''; refreshGit(); })
          .catch(function (e) { toast(e.message, true); });
      }
      $('gitCommitSel').onclick = function () { commit(selected()); };
      $('gitCommitAll').onclick = function () { commit(null); };
      $('gitPush').onclick = function () {
        api('/api/git/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: gitQueryPath() }) })
          .then(function () { toast('Pushed to remote'); refreshGit(); })
          .catch(function (e) { toast(e.message, true); });
      };
    }).catch(function (e) {
      var head = $('gitHead');
      if (head) head.textContent = e.message;
    });
  }

  function stopBrowserPoll() { if (S.bPoll) { clearInterval(S.bPoll); S.bPoll = null; } }

  function showBrowserPanel() {
    stopBrowserPoll();
    $('sideBody').innerHTML='<iframe title="Workspace browser" src="/api/server-browser/workspace/view" style="width:100%;height:75dvh;border:0;border-radius:12px"></iframe>';
  }
  function showChatBrowser() {
    var stream=$('stream');if(!stream)return;
    var card=$('chatBrowserCard');
    if(!card){card=document.createElement('section');card.id='chatBrowserCard';card.className='chat-browser-card';card.setAttribute('aria-label','Workspace browser');card.innerHTML='<header><strong>Browser</strong><span style="flex:1"></span><button type="button" class="btn ghost" data-expand>Expand</button><button type="button" class="btn ghost" data-close>Close</button></header><iframe title="Workspace browser" src="/api/server-browser/workspace/view"></iframe>';stream.appendChild(card);card.querySelector('[data-close]').onclick=function(){card.remove();};card.querySelector('[data-expand]').onclick=function(){card.classList.toggle('is-expanded');this.textContent=card.classList.contains('is-expanded')?'Collapse':'Expand';};}
    card.scrollIntoView({block:'nearest'});
  }

  function reportText(r) {
    var lines = [r.status.toUpperCase() + ' — ' + r.summary];
    if (r.phase && r.phase.kind === 'follow_up') lines.push('Scope: follow-up work (earlier task history preserved)');
    if (r.changes && r.changes.length) lines.push('', 'Delivered:', '  ' + r.changes.join('\n  '));
    if ((r.filesChanged || []).length) lines.push('Files: ' + r.filesChanged.join(', '));
    if ((r.verification || []).length) lines.push('', 'Verification:', '  ' + r.verification.join('\n  '));
    if ((r.remainingRisks || []).length) lines.push('', 'Risks:', '  ' + r.remainingRisks.join('\n  '));
    if ((r.followUps || []).length) lines.push('', 'Follow-ups:', '  ' + r.followUps.join('\n  '));
    return lines.join('\n');
  }

  function toggleContextCard(open) {
    var card = $('contextCard'), button = $('contextToggle');
    if (!card || !button) return;
    var visible = open === undefined ? card.hidden : Boolean(open);
    card.hidden = !visible;
    button.setAttribute('aria-expanded', visible ? 'true' : 'false');
    if (visible) { closeToolPanel(); renderContextCard(S.active); }
  }

  function renderContextRing(runId) {
    var button = $('contextToggle'), sess = S.sessions[runId];
    if (!button || !sess) return;
    var session = sess.session, usage = session && session.usage;
    var model = session && session.provider && session.model ? modelInfo(session.provider + '::' + session.model) : null;
    var capacity = usage && usage.contextWindowTokens || model && model.metadata && model.metadata.contextTokens;
    var used = usage && usage.contextTokens;
    var known = typeof used === 'number' && typeof capacity === 'number' && capacity > 0;
    var percent = known ? Math.min(100, Math.max(0, used / capacity * 100)) : 0;
    var active = session && session.status === 'running';
    button.classList.toggle('using', Boolean(active));
    button.classList.toggle('unknown', !known);
    button.style.setProperty('--context-color', known ? percent >= 90 ? 'var(--err)' : percent >= 70 ? 'var(--evidence)' : 'var(--ok)' : active ? 'var(--run)' : 'var(--muted)');
    button.querySelector('.context-ring-progress').style.strokeDashoffset = String(100 - percent);
    var title = known ? 'Context: ' + Math.round(percent) + '% · ' + used.toLocaleString() + ' / ' + capacity.toLocaleString() + ' tokens (latest model call)' : 'Context usage unavailable · open session details';
    button.title = title;
    button.setAttribute('aria-label', title);
  }

  function renderContextCard(runId) {
    renderContextRing(runId);
    var sess = S.sessions[runId];
    var body = $('contextCardBody');
    if (!body || !sess || $('contextCard').hidden) return;
    var scrollTop = $('contextCard').scrollTop;
    var L = sess.ledger;
    var session = sess.session;
    var U = session && session.usage;
    var model = session && session.provider && session.model ? modelInfo(session.provider + '::' + session.model) : null;
    var contextWindow = U && U.contextWindowTokens || model && model.metadata && model.metadata.contextTokens;
    var html = '<div class="stat-grid">';
    function stat(k, v, mono) { html += '<div class="stat"><div class="k">' + esc(k) + '</div><div class="v ' + (mono ? 'mono' : '') + '" title="' + esc(v) + '">' + esc(v) + '</div></div>'; }
    stat('Input tokens', U ? Number(U.inputTokens || 0).toLocaleString() : '—', true);
    stat('Cached tokens', U ? Number(U.cachedTokens || 0).toLocaleString() : '—', true);
    stat('Output tokens', U ? Number(U.outputTokens || 0).toLocaleString() : '—', true);
    stat('Model context window', typeof contextWindow === 'number' ? contextWindow.toLocaleString() : 'Unavailable', true);
    stat('Latest context use', U && typeof U.contextTokens === 'number' ? U.contextTokens.toLocaleString() : 'Unavailable', true);
    html += '</div>';
    html += '<div class="section-h">Action breakdown</div>';
    if (L && L.actions.length) {
      var counts = { read: 0, write: 0, command: 0, other: 0 };
      L.actions.forEach(function (a) {
        if (a.tool === 'read_file' || a.tool === 'list_files' || a.tool === 'search_files') counts.read++;
        else if (a.tool === 'write_file' || a.tool === 'apply_edit') counts.write++;
        else if (a.tool === 'run_command') counts.command++;
        else counts.other++;
      });
      var total = L.actions.length;
      function pct(n) { return Math.round((n / total) * 1000) / 10; }
      html += '<div class="bar">' +
        '<span style="width:' + pct(counts.read) + '%;background:var(--ok)"></span>' +
        '<span style="width:' + pct(counts.write) + '%;background:var(--evidence)"></span>' +
        '<span style="width:' + pct(counts.command) + '%;background:var(--run)"></span>' +
        '<span style="width:' + pct(counts.other) + '%;background:var(--muted)"></span></div>' +
        '<div class="legend"><span><i style="background:var(--ok)"></i>Reads ' + pct(counts.read) + '%</span>' +
        '<span><i style="background:var(--evidence)"></i>Writes ' + pct(counts.write) + '%</span>' +
        '<span><i style="background:var(--run)"></i>Commands ' + pct(counts.command) + '%</span>' +
        '<span><i style="background:var(--muted)"></i>Other ' + pct(counts.other) + '%</span></div>';
    } else html += '<div class="empty">No actions yet</div>';
    html += '<details id="contextRunDetails"><summary>Run details</summary><div class="stat-grid" style="margin-top:10px">';
    stat('Session', runId, true);
    stat('Status', session ? session.status : '—');
    stat('Provider', session && session.provider ? session.provider : '—');
    stat('Model', session && session.model ? prettyModelName(session.model) : '—');
    stat('Mode', L ? L.mode : '—');
    var nativeRun = L && L.execution && L.execution.mode === 'codex-native';
    var nativeSettings = nativeRun && L.execution.native;
    var actualEffort = nativeRun ? nativeSettings && nativeSettings.effectiveEffort : L && L.effortPlan && L.effortPlan.llmEffort;
    stat('Effort', actualEffort ? actualEffort + ' (run)' : 'Not recorded for this turn');
    if (nativeSettings && nativeSettings.requestedEffort && nativeSettings.requestedEffort !== actualEffort) stat('Requested effort', nativeSettings.requestedEffort);
    if (S.sel.effort && S.sel.effort !== actualEffort) stat('Selected for next turn', S.sel.effort);
    stat('Started', session ? shortDate(session.startedAt) : '—');
    stat('Finished', session && session.finishedAt ? shortDate(session.finishedAt) : 'running…');
    if (L) {
      stat('Actions', L.actions.length);
      stat('Plan attempts', L.plan.reduce(function (n, s) { return n + s.attempts; }, 0));
      stat('Evidence', L.evidence.length);
      stat('Files changed', L.filesChanged.length);
      stat('Checkpoints', L.checkpoints.length);
    }
    html += '</div><div class="section-h">Usage &amp; cost</div><div class="stat-grid">';
    stat('Messages', U ? U.messages : 0);
    stat(U && U.costIncomplete ? 'Estimated cost' : 'Total cost', U && typeof U.costUsd === 'number' ? (U.costIncomplete ? '~$' : '$') + U.costUsd.toFixed(4) : '—', true);
    html += '</div></details>';
    var wasOpen = $('contextRunDetails') && $('contextRunDetails').open;
    body.innerHTML = html;
    $('contextRunDetails').open = Boolean(wasOpen);
    $('contextCard').scrollTop = scrollTop;
  }
