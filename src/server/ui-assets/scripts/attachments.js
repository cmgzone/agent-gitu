
  function renderThumbs() {
    var wrap = $('thumbs');
    if (!wrap) return;
    if (!pendingFor().length) { wrap.hidden = true; wrap.innerHTML = ''; updateSendState(); return; }
    wrap.hidden = false;
    wrap.innerHTML = pendingFor().map(function (file, i) {
      var isImage = String(file.type || '').indexOf('image/') === 0 && !!(file.previewUrl||file.dataUrl);
      var content = isImage
        ? '<img src="' + (file.previewUrl||file.dataUrl) + '" alt="' + esc(file.name) + '" title="' + esc(file.name) + '">'
        : '<span class="th-ico">' + icon('file') + '</span><span class="th-info"><span class="th-name" title="' + esc(file.name) + '">' + esc(file.name) + '</span><span class="th-size">' + humanBytes(file.size) + '</span></span>';
      return '<span class="th' + (isImage ? '' : ' th-file') + '">' + content + (file.loading?'<span>'+Math.round((file.progress||0)*100)+'%</span>':'')+(file.error?'<button class="btn ghost" data-file-retry="'+i+'">Retry</button>':'')+'<button class="rm" data-rm="' + i + '" title="Remove attachment" aria-label="Remove ' + esc(file.name) + '">&#10005;</button></span>';
    }).join('');
    wrap.querySelectorAll('[data-rm]').forEach(function (el) {
      el.onclick = function () { var file=pendingFor().splice(Number(el.getAttribute('data-rm')), 1)[0];if(file&&file.cancel)file.cancel(); renderThumbs(); };
    });
    updateSendState();
    wrap.querySelectorAll('[data-file-retry]').forEach(function(button){button.onclick=function(){var file=pendingFor()[Number(button.dataset.fileRetry)];if(file&&file.retry)file.retry();};});
  }
  function renderTaggedFolders(runId) {
    var wrap = $('runFolderTags');
    if (!wrap || S.active !== runId) return;
    var sess = S.sessions[runId];
    var folders = (sess && (sess.taggedFolders || (sess.session && sess.session.taggedFolders))) || [];
    var writable = (sess && (sess.writableFolders || (sess.session && sess.session.writableFolders))) || [];
    wrap.hidden = !folders.length;
    wrap.innerHTML = folders.length ? '<span class="label">Tagged folders</span>' + folders.map(function (folder) {
      var canWrite = writable.indexOf(folder) !== -1;
      return '<span class="run-folder-tag" title="' + esc(folder) + '"><span class="name">' + icon('folder') + ' ' + esc(basename(folder)) + '</span><span class="permission">' + (canWrite ? 'Can edit' : 'Read only') + '</span><button type="button" data-folder-write="' + esc(folder) + '" title="' + (canWrite ? 'Revoke write permission' : 'Allow the agent to edit this folder') + '">' + (canWrite ? 'Revoke writes' : 'Allow writes') + '</button><button type="button" data-untag-folder="' + esc(folder) + '" aria-label="Remove folder ' + esc(basename(folder)) + '" title="Remove this folder">×</button></span>';
    }).join('') : '';
    wrap.querySelectorAll('[data-folder-write]').forEach(function (button) {
      button.onclick = function () {
        var folder = button.getAttribute('data-folder-write');
        var grant = writable.indexOf(folder) === -1;
        if (grant && !confirm('Allow Agent Gitu to create, edit, and delete files inside this folder for this chat?\n\n' + folder)) return;
        api('/api/runs/' + encodeURIComponent(runId) + '/folders', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: folder, writable: grant }) })
          .then(function (data) {
            if (!S.sessions[runId]) return;
            S.sessions[runId].writableFolders = data.writableFolders || [];
            if (S.sessions[runId].session) S.sessions[runId].session.writableFolders = data.writableFolders || [];
            renderTaggedFolders(runId);
            toast(grant ? 'Write access granted for this chat' : 'Write access revoked');
          }).catch(function (error) { toast(error.message, true); });
      };
    });
    wrap.querySelectorAll('[data-untag-folder]').forEach(function (button) {
      button.onclick = function () {
        var folder = button.getAttribute('data-untag-folder');
        api('/api/runs/' + encodeURIComponent(runId) + '/folders', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: folder }) })
          .then(function (data) {
            if (!S.sessions[runId]) return;
            S.sessions[runId].taggedFolders = data.folders || [];
            S.sessions[runId].writableFolders = data.writableFolders || [];
            if (S.sessions[runId].session) S.sessions[runId].session.taggedFolders = data.folders || [];
            if (S.sessions[runId].session) S.sessions[runId].session.writableFolders = data.writableFolders || [];
            renderTaggedFolders(runId);
            toast('Folder untagged');
          }).catch(function (error) { toast(error.message, true); });
      };
    });
  }
  function humanBytes(value) {
    var n = Math.max(0, Number(value) || 0);
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }
  function dataUrlBytes(dataUrl) {
    var comma = String(dataUrl || '').indexOf(',');
    if (comma < 0) return 0;
    return Math.max(0, Math.floor((dataUrl.length - comma - 1) * 3 / 4));
  }
  function pendingFileBytes() {
    return pendingFor().reduce(function (sum, file) { return sum + (Number(file.size) || dataUrlBytes(file.dataUrl)); }, 0);
  }
  function addPendingFile(file, dataUrl) {
    fetch(dataUrl).then(function(response){return response.blob();}).then(function(blob){attachBinary(new File([blob],file.name||'attachment',{type:file.type||blob.type}),pendingFor(),'coding',renderThumbs);});
  }
  function downscaleImage(dataUrl, cb) {
    cb(dataUrl);
  }
  function bindPaste(id) {
    var ta = $(id);
    if (!ta || ta.dataset.pasteBound) return;
    ta.dataset.pasteBound = '1';
    ta.addEventListener('paste', function (e) {
      var cd = e.clipboardData || window.clipboardData;
      if (!cd || !cd.items) return;
      for (var i = 0; i < cd.items.length; i++) {
        var it = cd.items[i];
        if (it.type && it.type.indexOf('image/') === 0) {
          // let, not var: reader.onload fires asynchronously AFTER the loop has
          // advanced, and a shared var-file binding made every pasted image
          // inherit the last file's name/type.
          let file = it.getAsFile();
          if (!file) continue;
          e.preventDefault();
          var reader = new FileReader();
          reader.onload = function () {
            downscaleImage(String(reader.result), function (final) {
              addPendingFile({ name: file.name || 'pasted-image.png', type: file.type || 'image/png', size: dataUrlBytes(final) }, final);
              toast('Image pasted — it will be sent with your next message');
            });
          };
          reader.readAsDataURL(file);
        }
      }
    });
  }

  function onAttachFiles(files) {
    Array.prototype.slice.call(files).forEach(function (f) {
      attachBinary(f,pendingFor(),'coding',renderThumbs);
    });
  }
  // The per-run autonomy the composer is set to. persistent:true is the default
  // everywhere it is omitted, so this only ever narrows the policy.
  function autonomyBody() {
    var body = { persistent: true };
    var ceiling = Number(S.sel.spendCeilingUsd);
    if (String(S.sel.spendCeilingUsd || '').trim() && Number.isFinite(ceiling) && ceiling > 0) body.maxCostUsd = ceiling;
    return body;
  }
  function bindControls() {
    bindGituVoice();
    var model = $('model'), effort = $('effort');
    updatePlanControl();
    if (model) { if (S.sel.model) model.value = S.sel.model; if (!model.value && model.options.length) model.value = model.options[0].value; S.sel.model = model.value; }
    fillEffort('effort', provOf(S.sel.model));
    if (effort) effort.value = S.sel.effort;
    if (model) model.onchange = function () {
      S.sel.model = model.value;
      var activeSession = S.sessions[S.active];
      if (activeSession) activeSession.modelOverride = true;
      fillEffort('effort', provOf(model.value)); persist(); updateAttachState(); updateModelMeta();
    };
    if (effort) effort.onchange = function () { S.sel.effort = effort.value; persist(); };

    var input = $('attachInput');
    if (input) input.onchange = function () { onAttachFiles(input.files); input.value = ''; };
    updateAttachState();
    updateModelMeta();
    renderThumbs();
    syncModelLabel();
    bindModelMenu();
    // The plus menu holds task mode, file picking, and secondary actions.
    var plusBtn = $('homePlusBtn'), plusMenu = $('homePlusMenu');
    if (plusBtn && plusMenu) {
      plusBtn.onclick = function (e) {
        e.stopPropagation();
        var open = plusMenu.hasAttribute('hidden');
        if (open) {
          plusMenu.removeAttribute('hidden');
          var rect = plusBtn.getBoundingClientRect();
          plusMenu.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - plusMenu.offsetWidth - 12)) + 'px';
          plusMenu.style.top = Math.max(12, rect.top - plusMenu.offsetHeight - 8) + 'px';
          plusBtn.setAttribute('aria-expanded', 'true');
        } else {
          plusMenu.setAttribute('hidden', '');
          plusBtn.setAttribute('aria-expanded', 'false');
        }
      };
      plusMenu.querySelectorAll('[data-hp]').forEach(function (b) {
        b.onclick = function () {
          plusMenu.setAttribute('hidden', '');
          plusBtn.setAttribute('aria-expanded', 'false');
          var action = b.getAttribute('data-hp');
          if (action === 'agent') setPlanRequested(S.active, false);
          else if (action === 'plan') setPlanRequested(S.active, true);
          else if (action === 'attach') { var ai = $('attachInput'); if (ai) ai.click(); }
          else if (action === 'folder') openFolderBrowser(S.active === 'home' ? 'project' : 'tag');
          else if (action === 'schedule') openSettings('cron');
        };
      });
      if (!plusMenu._boundOutside) {
        plusMenu._boundOutside = true;
        document.addEventListener('click', function (e) {
          if (!plusMenu.hasAttribute('hidden') && e.target !== plusBtn && !plusBtn.contains(e.target) && !plusMenu.contains(e.target)) {
            plusMenu.setAttribute('hidden', '');
            plusBtn.setAttribute('aria-expanded', 'false');
          }
        });
      }
    }
  }
  function updateAttachState() {
    showFileLimitNear($('attachInput'));
    var attach = document.querySelector('#homePlusMenu [data-hp="attach"]');
    if (!attach) return;
    var vision = currentVision();
    attach.title = vision ? 'Choose files, documents, or images' : 'Choose files or documents (this model cannot inspect image pixels)';
  }