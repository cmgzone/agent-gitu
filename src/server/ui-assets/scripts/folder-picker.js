

  function openFolderBrowser(mode,targetPath) {
    S.browseInspect=mode==='inspect';
    $('browseUse').hidden=S.browseInspect;
    S.browseTagRun = mode === 'tag' && S.active !== 'home' ? S.active : null;
    $('browseTitle').textContent = S.browseInspect?'Project folder':S.browseTagRun ? 'Tag a read-only reference folder' : 'Choose a project folder';
    $('browseUse').textContent = S.browseTagRun ? 'Tag folder' : 'Use this folder';
    $('browseModal').hidden = false;
    var sess = S.browseTagRun && S.sessions[S.browseTagRun];
    browseTo(targetPath||(sess && sess.session && sess.session.projectPath) || effectiveProjectPath());
  }

  function browseTo(p, isFallback) {
    // Instant loading row: the list used to sit blank mid-navigation.
    var bl = $('browseList');
    if (bl) bl.innerHTML = '<div class="meta" style="padding:8px">loading…</div>';
    api('/api/browse?path=' + encodeURIComponent(p || '')).then(renderBrowser).catch(function (e) {
      if (!isFallback) { browseTo('', true); } else { toast(e.message, true); }
    });
  }

  function renderBrowser(d) {
    var box = $('browseList');
    var html = '';
    if (!d.atRoot && d.path) {
      html += '<div class="frow" data-up="1"><span class="ico">' + icon('back') + '</span><span style="color:var(--muted)">..</span></div>';
    }
    if (d.atRoot) html += '<div class="empty" style="padding:6px 10px">This computer — pick a drive</div>';
    html += (d.dirs || []).map(function (n) {
      var leaf = String(n).split(/[\\/]/).filter(Boolean).pop() || n;
      return '<div class="frow" data-dir="' + esc(n) + '" title="' + esc(n) + '"><span class="ico">' + icon('folder') + '</span>' + esc(leaf) + '</div>';
    }).join('');
    if (!d.atRoot && !(d.dirs || []).length) html += '<div class="empty" style="padding:6px 10px">no subfolders</div>';
    box.innerHTML = html;
    $('browseCrumb').textContent = d.atRoot ? 'This computer' : d.path;
    $('browseProjChip').style.display = d.isProject ? '' : 'none';
    box.querySelectorAll('[data-dir]').forEach(function (el) {
      el.onclick = function () {
        // The server returns fully-joined native paths — navigate with them
        // as-is; never hand-concatenate separators here.
        browseTo(el.getAttribute('data-dir'));
      };
    });
    var up = box.querySelector('[data-up]');
    if (up) up.onclick = function () { browseTo(d.parent || ''); };
    $('browseUse').onclick = function () {
      if(S.browseInspect)return;
      if (d.atRoot || !d.path) { toast('Open a folder first', true); return; }
      if (S.browseTagRun) {
        var runId = S.browseTagRun;
        api('/api/runs/' + encodeURIComponent(runId) + '/folders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: d.path }) })
          .then(function (data) {
            var sess = S.sessions[runId];
            if (sess) {
              sess.taggedFolders = data.folders || [];
              sess.writableFolders = data.writableFolders || [];
              if (sess.session) sess.session.taggedFolders = data.folders || [];
              if (sess.session) sess.session.writableFolders = data.writableFolders || [];
            }
            if (S.active === runId) renderTaggedFolders(runId);
            $('browseModal').hidden = true;
            S.browseTagRun = null;
            toast('Folder tagged for read-only access');
          }).catch(function (error) { toast(error.message, true); });
        return;
      }
      homeSelectProject({path:d.path,name:basename(d.path)});
      $('browseModal').hidden = true;
      toast('Project set to ' + d.path);
      if (S.active === 'home') openHome();
    };
  }