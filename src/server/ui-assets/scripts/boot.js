

  function boot() {
    initializeOnboarding();
    syncCodingPermissions();
    if (S.settings.projectPath) {
      api('/api/browse?path=' + encodeURIComponent(S.settings.projectPath)).catch(function () {
        toast('Stored project path no longer exists — pick a folder', true);
        S.settings.projectPath = '';
        persist();
        updateProjChip();
      });
    }
    api('/api/project').then(function (p) {
      S.project = p;
      updateProjChip();
      renderSidebar();
      if (S.active === 'home') openHome();
    }).catch(function () {
      updateProjChip();
      if (S.active === 'home' && typeof restoreOfflineMainRun === 'function') restoreOfflineMainRun();
    });
    api('/api/home').then(function (h) {
      var heal = function (p) {
        if (!p) return p;
        var i = p.indexOf('\\AgentGitu\\');
        if (i >= 0) return h.root + p.slice(i + 10);
        // Restore projects created before the Gitu rename as well.
        i = p.indexOf('\\Hermes\\');
        if (i >= 0) return h.root + p.slice(i + 7);
        return p;
      };
      var np = heal(S.settings.projectPath);
      if (np !== S.settings.projectPath) { S.settings.projectPath = np; persist(); updateProjChip(); }
      S.lastProjectPath = heal(S.lastProjectPath);
    }).catch(function () {});
    loadModelCatalog().then(function () {
      if (S.active === 'home') openHome();
    }).catch(function () { S.modelsLoaded = true; if (S.active === 'home') openHome(); });
    api('/api/files').then(function (data) { S.files = data.files || []; }).catch(function () {});
    $('gearBtn').onclick = function () { toggleMobileNav(false); openSettings('overview'); };
    $('gearBtn').innerHTML = icon('gear');
    $('sbCowork').onclick = function () { toggleMobileNav(false); openCowork(); };
    $('sbCollapse').onclick = function () { S.settings.leftCollapsed = !S.settings.leftCollapsed; persist(); applyLayout(); };
    bindResize('sbResize', 'left');
    $('bulkDel').onclick = bulkDelete;
    $('bulkDone').onclick = function () { S.manage = false; S.selProj = {}; S.selRuns = {}; renderSidebar(); };
    $('browseCancel').onclick = function () { $('browseModal').hidden = true; };
    $('projChip').style.cursor = 'pointer';
    $('projChip').title = 'Choose a project folder';
    $('projChip').onclick = openFolderBrowser;
    $('mobileNav').onclick = function () { toggleMobileNav(true); };
    $('mobileBackdrop').onclick = function () { toggleMobileNav(false); };
    $('toolPanelClose').onclick = closeToolPanel;
    updateProjChip();
    renderSidebar();
    renderTopbar();
    applyLayout();
    var cwWasOpen = false;
    try { cwWasOpen = localStorage.getItem('hermes.cowork') === 'open'; } catch (e) {}
    if (cwWasOpen) openCowork(); else openHome();

    // One global Escape: closes the TOPMOST layer (tool panel → settings →
    // browse modal → dynamic modals) and returns focus to where it was.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var prev = document.activeElement;
      var sh = document.querySelector('.shell.mobile-nav-open');
      if (sh) { toggleMobileNav(false); refocusEl(prev); return; }
      var contextCard = $('contextCard');
      if (contextCard && !contextCard.hidden) { toggleContextCard(false); $('contextToggle').focus(); return; }
      var toolPanel = $('toolPanel');
      if (toolPanel && !toolPanel.hidden) { closeToolPanel(); refocusEl(prev); return; }
      var st = $('settings');
      if (st && !st.hidden) { closeSettings(); refocusEl(prev); return; }
      var bm = $('browseModal');
      if (bm && !bm.hidden) { bm.hidden = true; refocusEl(prev); return; }
      var modals = document.querySelectorAll('.modal');
      for (var i = modals.length - 1; i >= 0; i--) {
        var m = modals[i];
        if (m.hidden) continue;
        var cancel = m.querySelector('[data-cancel]') || m.querySelector('.btn.ghost');
        if (cancel && cancel.onclick) cancel.click(); else m.remove();
        refocusEl(prev);
        return;
      }
    });
    window.addEventListener('resize', function () { if (window.innerWidth > 720) toggleMobileNav(false); });
  }
  function refocusEl(el) { if (el && el.isConnected && el.focus) { try { el.focus(); } catch (e) {} } }
  /* GITU_BINDING_COWORK_JS */
  /* GITU_BINDING_FILE_UPLOAD_JS */
  /* GITU_BINDING_COMPANY_JS */
  /* GITU_BINDING_COMPANY_CONNECTIONS_JS */
  /* GITU_BINDING_COMPANY_WALLETS_JS */
  /* GITU_BINDING_VOICE_JS */
  /* GITU_BINDING_COWORK_GALLERY_JS */
  /* GITU_BINDING_COWORK_PROFILE_JS */
  /* GITU_BINDING_COWORK_DASHBOARD_JS */
  /* GITU_BINDING_HOME_WORKSPACE_JS */
  /* GITU_BINDING_REPORT_DETAILS_JS */
  /* GITU_BINDING_SUBAGENT_JS */
  /* GITU_BINDING_OUTPUT_JS */
  /* GITU_BINDING_ONBOARDING_JS */
  /* GITU_BINDING_UI_BUTTON_JS */
  boot();
  window.gituOpenPushTarget = async function (target) {
    if (!target || !['run','cowork','home'].includes(target.target)) throw new Error('Invalid notification destination.');
    if (target.target !== 'home' && !/^[\w-]{1,150}$/.test(target.targetId || '')) throw new Error('Invalid notification destination.');
    if (target.companyId && !/^[\w-]{1,150}$/.test(target.companyId)) throw new Error('Invalid company destination.');
    if (target.threadId && !/^[\w-]{1,150}$/.test(target.threadId)) throw new Error('Invalid thread destination.');
    closeSettings();
    if (typeof toggleMobileNav === 'function') toggleMobileNav(false);
    var modals = document.querySelectorAll('.modal:not([hidden])');
    for (var i = 0; i < modals.length; i++) {
      var modal = modals[i], cancel = modal.querySelector('[data-cancel]') || modal.querySelector('.btn.ghost');
      if (cancel && cancel.onclick) cancel.click(); else modal.remove();
    }
    if (target.target === 'run') { openRun(target.targetId); return; }
    if (target.target === 'cowork' && target.companyId) { await companyOpen(target.companyId); Companies.tab = 'Chat'; companyRender(); return; }
    if (target.target === 'cowork') {
      if (typeof cwClosePanels === 'function') cwClosePanels();
      if (S.active !== 'cowork' || !$('cw')) openCowork();
      await cwLoad(false);
      if (!cwEnsure().convs.some(function (conversation) { return conversation.id === target.targetId; })) throw new Error('This conversation is no longer available.');
      cwOpenConv(target.targetId, target.threadId || undefined); return;
    }
    openHome();
  };
  window.gituAndroidBack = function () {
    var settings = $('settings');
    if (settings && !settings.hidden) { closeSettings(); return true; }
    var modals = document.querySelectorAll('.modal:not([hidden])');
    for (var i = modals.length - 1; i >= 0; i--) {
      var modal = modals[i], cancel = modal.querySelector('[data-cancel]') || modal.querySelector('.btn.ghost');
      if (cancel && cancel.onclick) cancel.click(); else modal.remove();
      return true;
    }
    var shell = document.querySelector('.shell');
    if (shell && shell.classList.contains('mobile-nav-open')) { toggleMobileNav(false); return true; }
    var panel = $('cwPanelBackdrop');
    if (panel && !panel.hidden && typeof cwClosePanels === 'function') { cwClosePanels(); return true; }
    if (S.active === 'cowork' && typeof cwExit === 'function') { cwExit(); return true; }
    if (S.active !== 'home') { openHome(); return true; }
    return false;
  };
