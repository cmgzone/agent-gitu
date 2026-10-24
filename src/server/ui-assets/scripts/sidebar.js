

  function renderSidebar() {
    if($('homeProjectCards')){homeLoadProjects();updateTitle();return;}
    api('/api/runs').then(function (sessions) {
      var byProj = {};
      var projPath = {};
      sessions.forEach(function (s) {
        var p = s.project || effectiveProjectName();
        (byProj[p] = byProj[p] || []).push(s);
        if (s.projectPath && !projPath[p]) projPath[p] = s.projectPath;
      });
      var activePath = effectiveProjectPath();
      var html = '<button class="newbtn" id="sbNew" title="starts in: ' + esc(activePath || 'choose a project first') + '">' + icon('pencil') + ' New session <span style="opacity:.6;font-weight:500;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">· ' + esc(effectiveProjectName()) + '</span></button>' +
        '<button class="newbtn" id="sbNewProject" style="background:none;border:1px dashed var(--border2)">' + icon('folder') + ' New project</button>' +
        '<button class="navitem" data-set="cron"><span class="ico">' + icon('clock') + '</span>Scheduled</button>' +
        '<button class="navitem" data-set="skills"><span class="ico">' + icon('bolt') + '</span>Skills</button>' +
        '<button class="navitem" data-set="mcp"><span class="ico">' + icon('plug') + '</span>MCP servers</button>' +
        '<button class="navitem" data-set="workspace"><span class="ico">' + icon('folder') + '</span>Workspace</button>' +
        (S.active !== 'home' ? '<button class="navitem' + (S.panelKind === 'state' && !$('toolPanel').hidden ? ' active' : '') + '" data-tool="state"><span class="ico">' + icon('layers') + '</span>Task details</button>' : '') +
        '<button class="navitem' + (S.panelKind === 'browser' && !$('toolPanel').hidden ? ' active' : '') + '" data-tool="browser"><span class="ico">' + icon('globe') + '</span>Browser</button>' +
        '<button class="navitem' + (S.panelKind === 'git' && !$('toolPanel').hidden ? ' active' : '') + '" data-tool="git"><span class="ico">' + icon('branch') + '</span>Git</button>' +
        '<div class="sect" style="display:flex;align-items:center">Projects<span style="flex:1"></span><button class="ubtn" id="sbManage" title="select multiple to delete" style="display:inline-flex">' + (S.manage ? icon('check') : icon('pencil')) + '</button></div>';
      var names = Object.keys(byProj);
      if (!names.length) html += '<div class="empty" style="padding-left:10px">No chats yet</div>';
      if (!S.settings.collapsedProj) S.settings.collapsedProj = {};
      var collapsed = S.settings.collapsedProj;
      names.forEach(function (p) {
        var hasActive = byProj[p].some(function (s) { return s.runId === S.active; });
        var isCol = !S.manage && collapsed[p] === true && !hasActive;
        if (S.manage) {
          html += '<label class="proj"><input type="checkbox" class="chk" data-selproj="' + esc(p) + '"' + (S.selProj && S.selProj[p] ? ' checked' : '') + '><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p) + '</span></label>';
        } else {
          // Visually mark WHICH project new sessions will land in.
          var isActive = projPath[p] && projPath[p] === activePath;
          html += '<div class="proj' + (isActive ? ' activeproj' : '') + '" data-proj="' + esc(p) + '" role="button" tabindex="0" aria-current="' + (isActive ? 'true' : 'false') + '" title="' + (isActive ? 'active project for new sessions' : 'set as active project for new sessions') + '">' +
            '<button class="ubtn" data-collapse="' + esc(p) + '" title="' + (isCol ? 'expand sessions' : 'collapse sessions') + '" style="display:inline-flex;padding:2px;margin-right:2px">' + icon(isCol ? 'chevRight' : 'chevDown') + '</button>' +
            '<span class="ico">' + icon('folder') + '</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p) + '</span>' +
            (isActive ? '<span class="chip" style="margin-right:6px;background:var(--selected);color:var(--text)">active</span>' : '') +
            (isCol ? '<span class="chip" style="margin-right:6px">' + byProj[p].length + '</span>' : '') +
            '<button class="delx" data-delproj="' + esc(p) + '" title="delete project and its sessions">' + icon('x') + '</button></div>';
        }
        if (!isCol) {
          if (!S.moreProjects) S.moreProjects = {};
          var expanded = S.moreProjects[p] === true;
          var visible = expanded ? 200 : 8;
          byProj[p].slice(0, S.manage ? 200 : visible).forEach(function (s) {
            var wf = waitingFor(s);
            if (S.manage) {
              html += '<label class="chat"><input type="checkbox" class="chk" data-selrun="' + esc(s.runId) + '"' + (S.selRuns && S.selRuns[s.runId] ? ' checked' : '') + '><span class="dot ' + esc(s.status) + '"></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(sessionTitle(s.goal)) + '</span></label>';
            } else {
              html += '<button class="chat ' + (S.active === s.runId ? 'active' : '') + '" data-run="' + esc(s.runId) + '" title="' + esc(s.goal) + (wf ? '\n⏸ waiting for you — ' + wf : '') + '">' +
                '<span class="dot ' + (wf ? 'waiting' : esc(s.status)) + '"></span><span class="chat-label">' + esc(sessionTitle(s.goal)) + '</span>' +
                '<span class="rowdel" data-delrun="' + esc(s.runId) + '" title="delete this session" role="button" tabindex="0" aria-label="Delete session">' + icon('x') + '</span></button>';
            }
          });
          // Silent truncation used to hide older sessions forever.
          if (!S.manage && !expanded && byProj[p].length > 8) {
            html += '<button class="more-row" data-more="' + esc(p) + '">Show ' + (byProj[p].length - 8) + ' older sessions…</button>';
          } else if (!S.manage && expanded && byProj[p].length > 8) {
            html += '<button class="more-row" data-less="' + esc(p) + '">Show fewer</button>';
          }
        }
      });
      $('sbScroll').innerHTML = html;
      updateTitle();
      $('sbNew').onclick = function () { openHome(); };
      $('sbNewProject').onclick = newProject;
      var byId = {};
      sessions.forEach(function (s) { byId[s.runId] = s; });
      $('sbScroll').querySelectorAll('[data-run]').forEach(function (el) {
        el.onclick = function (e) {
          if (e.target && e.target.closest && e.target.closest('.rowdel')) return;
          var s = byId[el.getAttribute('data-run')];
          if (s && s.projectPath) S.lastProjectPath = s.projectPath;
          openRun(el.getAttribute('data-run'), { chatish: s && s.mode === 'chat', mode: s && s.mode });
          toggleMobileNav(false);
        };
      });
      // Two-click arm/confirm session delete: first click arms (red "sure?"),
      // second click within 2.5s deletes. No native confirm dialogs.
      $('sbScroll').querySelectorAll('[data-delrun]').forEach(function (el) {
        el.onclick = function (e) {
          e.stopPropagation();
          var id = el.getAttribute('data-delrun');
          if (!el.classList.contains('armed')) {
            el.classList.add('armed');
            setTimeout(function () { el.classList.remove('armed'); }, 2500);
            return;
          }
          el.closest('.chat').style.opacity = '.4';
          api('/api/runs/' + id, { method: 'DELETE' })
            .then(function () { renderSidebar(); if (S.active === id) openHome(); })
            .catch(function (er) { renderSidebar(); toast(er.message, true); });
        };
        el.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); el.click(); } };
      });
      $('sbScroll').querySelectorAll('[data-more],[data-less]').forEach(function (el) {
        el.onclick = function () {
          var p = el.getAttribute('data-more') || el.getAttribute('data-less');
          S.moreProjects[p] = el.getAttribute('data-more') ? true : false;
          renderSidebar();
        };
      });
      $('sbScroll').querySelectorAll('[data-proj]').forEach(function (el) {
        el.onclick = function () {
          var n = el.getAttribute('data-proj');
          if (projPath[n]) {
            S.settings.projectPath = projPath[n];
            S.lastProjectPath = projPath[n];
            persist();
            updateProjChip();
            toast('Active project: ' + n);
            toggleMobileNav(false);
            if (S.active === 'home') openHome();
          }
        };
        el.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } };
      });
      $('sbScroll').querySelectorAll('[data-set]').forEach(function (el) {
        el.onclick = function () { toggleMobileNav(false); openSettings(el.getAttribute('data-set')); };
      });
      $('sbScroll').querySelectorAll('[data-tool]').forEach(function (el) {
        el.onclick = function () { openToolPanel(el.getAttribute('data-tool')); };
      });
      $('sbScroll').querySelectorAll('[data-delproj]').forEach(function (el) {
        el.onclick = function (e) {
          e.stopPropagation();
          deleteProjectFlow(el.getAttribute('data-delproj'), projPath[el.getAttribute('data-delproj')]);
        };
      });
      $('sbScroll').querySelectorAll('[data-collapse]').forEach(function (el) {
        el.onclick = function (e) {
          e.stopPropagation();
          var n = el.getAttribute('data-collapse');
          if (collapsed[n]) delete collapsed[n]; else collapsed[n] = true;
          persist();
          renderSidebar();
        };
      });
      if ($('sbManage')) $('sbManage').onclick = function () { S.manage = !S.manage; S.selProj = {}; S.selRuns = {}; renderSidebar(); };
      $('sbScroll').querySelectorAll('[data-selproj]').forEach(function (el) {
        el.onchange = function () { var n = el.getAttribute('data-selproj'); if (el.checked) S.selProj[n] = projPath[n] || ''; else delete S.selProj[n]; updateBulk(); };
      });
      $('sbScroll').querySelectorAll('[data-selrun]').forEach(function (el) {
        el.onchange = function () { var id = el.getAttribute('data-selrun'); if (el.checked) S.selRuns[id] = true; else delete S.selRuns[id]; updateBulk(); };
      });
      updateBulk();
    }).catch(function () {});
    api('/api/cron').then(function (d) { S.cronCount = (d.jobs || []).length; }).catch(function () {});
  }

  function updateProjChip() {
    var name = effectiveProjectName();
    $('projChip').textContent = ' ' + name;
    $('projChip').title = effectiveProjectPath() ? 'Active project: ' + effectiveProjectPath() + ' — click to change' : 'Choose a project folder';
  }

  function newProject() {
    var modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = '<div class="box" style="width:460px"><div class="bar"><span style="font-weight:600;font-size:13px">New project</span></div>' +
      '<div style="padding:14px 16px">' +
      '<input id="npName" placeholder="project name (e.g. my-app)" style="width:100%;border:1px solid var(--border2);border-radius:8px;background:var(--card2);color:var(--text);padding:8px 10px" autofocus>' +
      '<div id="npWhere" style="margin-top:8px;color:var(--muted);font-size:12px">Created under the Agent Gitu Projects folder.</div>' +
      '</div>' +
      '<div class="foot"><span style="flex:1"></span><button class="btn ghost" id="npCancel">Cancel</button><button class="btn dark" id="npGo">Create project</button></div></div>';
    document.body.appendChild(modal);
    api('/api/home').then(function (h) { var w = $('npWhere'); if (w) w.innerHTML = 'Created under <span style="font-family:var(--mono)">' + esc(h.projectsPath) + '</span>'; }).catch(function () {});
    var create = function () {
      var name = $('npName').value.trim();
      if (!name) { $('npName').focus(); return; }
      api('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name }) })
        .then(function (d) {
          modal.remove();
          homeSelectProject({path:d.path,name:basename(d.path)});
          updateProjChip();
          renderSidebar();
          toast('Project created at ' + d.path);
          openHome();
        })
        .catch(function (e) { toast(e.message, true); });
    };
    modal.querySelector('#npCancel').onclick = function () { modal.remove(); };
    modal.querySelector('#npGo').onclick = create;
    modal.querySelector('#npName').addEventListener('keydown', function (e) { if (e.key === 'Enter') create(); });
    setTimeout(function () { var n = $('npName'); if (n) n.focus(); }, 0);
  }

  function updateBulk() {
    var bar = $('bulkBar');
    if (!bar) return;
    bar.hidden = !S.manage;
    var np = Object.keys(S.selProj || {}).length;
    var nr = Object.keys(S.selRuns || {}).length;
    var c = $('bulkCount');
    if (c) c.textContent = np + ' project(s), ' + nr + ' session(s) selected';
  }

  function bulkDelete() {
    var projs = Object.keys(S.selProj || {});
    var runs = Object.keys(S.selRuns || {});
    if (!projs.length && !runs.length) { toast('Nothing selected', true); return; }
    var go = function (deleteFiles) {
      var chain = Promise.resolve();
      projs.forEach(function (p) {
        chain = chain.then(function () {
          return api('/api/projects', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: p, path: S.selProj[p] || undefined, deleteFiles: deleteFiles }) }).catch(function (e) { toast(e.message, true); });
        });
      });
      if (runs.length) {
        chain = chain.then(function () {
          return api('/api/runs/delete-many', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: runs }) }).catch(function (e) { toast(e.message, true); });
        });
      }
      chain.then(function () {
        var goneActive = runs.indexOf(S.active) >= 0;
        S.selProj = {}; S.selRuns = {}; S.manage = false;
        if (goneActive) openHome();
        renderSidebar();
        toast('Deleted ' + projs.length + ' project(s), ' + runs.length + ' session(s)');
      });
    };
    if (projs.length) {
      var modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = '<div class="box" style="width:460px"><div class="bar"><span style="font-weight:600;font-size:13px">Delete selection</span></div>' +
        '<div style="padding:14px 16px;font-size:13px">Delete <b>' + projs.length + '</b> project(s) and <b>' + runs.length + '</b> session(s)?' +
        '<label style="display:flex;gap:8px;margin-top:10px;font-size:12.5px;cursor:pointer"><input type="checkbox" id="bdFiles" style="margin:2px 0 0;width:auto"> Also delete the project folders (only folders inside Agent Gitu Projects are removed)</label>' +
        '<div style="margin-top:8px;color:var(--muted);font-size:12px">This cannot be undone.</div></div>' +
        '<div class="foot"><span style="flex:1"></span><button class="btn ghost" id="bdCancel">Cancel</button><button class="btn red" id="bdGo">Delete</button></div></div>';
      document.body.appendChild(modal);
      modal.querySelector('#bdCancel').onclick = function () { modal.remove(); };
      modal.querySelector('#bdGo').onclick = function () { var df = modal.querySelector('#bdFiles').checked; modal.remove(); go(df); };
    } else {
      if (!confirm('Delete ' + runs.length + ' session(s)?')) return;
      go(false);
    }
  }

  function deleteProjectFlow(name, path) {
    var modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = '<div class="box" style="width:460px"><div class="bar"><span style="font-weight:600;font-size:13px">Delete project</span></div>' +
      '<div style="padding:14px 16px;font-size:13px">Delete <b>' + esc(name) + '</b> and all of its sessions?' +
      (path ? '<label style="display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-size:12.5px;cursor:pointer"><input type="checkbox" id="dpFiles" style="margin:2px 0 0;width:auto"> <span>Also delete the project folder<br><span style="color:var(--muted);font-family:var(--mono);font-size:11px">' + esc(path) + '</span></span></label>' : '') +
      '<div style="margin-top:10px;color:var(--muted);font-size:12px">Sessions are removed permanently. This cannot be undone.</div></div>' +
      '<div class="foot"><span style="flex:1"></span><button class="btn ghost" id="dpCancel">Cancel</button><button class="btn red" id="dpGo">Delete</button></div></div>';
    document.body.appendChild(modal);
    modal.querySelector('#dpCancel').onclick = function () { modal.remove(); };
    modal.querySelector('#dpGo').onclick = function () {
      var cb = modal.querySelector('#dpFiles');
      var del = cb ? cb.checked : false;
      api('/api/projects', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name, path: path, deleteFiles: del }) })
        .then(function (d) {
          modal.remove();
          toast('Project deleted' + (d.removedSessions ? ' — ' + d.removedSessions + ' session(s) removed' : ''));
          var sess = S.sessions[S.active];
          if (sess && sess.session && (sess.session.project === name || (path && sess.session.projectPath === path))) openHome();
          renderSidebar();
        })
        .catch(function (e) { toast(e.message, true); });
    };
  }

  function renderTopbar() {
    // The old goal-title strip (title + status chips + Stop) was removed:
    // the goal lives in the sidebar/progress, and Stop now lives on the
    // composer's send button (Send ⇄ Stop). The bar stays hidden.
    var tb = $('topbar');
    if (tb) tb.style.display = 'none';
    updateTitle();
    updateSendState();
  }