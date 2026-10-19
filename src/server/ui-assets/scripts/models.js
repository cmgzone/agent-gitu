

  // The composer send button doubles as STOP while the agent is running —
  // one button, context-aware, always where your hand already is.
  function updateSendState() {
    updatePlanControl();
    var b = $('send2');
    if (!b) return;
    var sess = S.sessions[S.active];
    var s = sess && sess.session;
    var running = Boolean(s && (s.status === 'running' || s.status === 'waiting_for_model'));
    var waiting = waitingFor(s);
    // Typing yields the button back to Send so you can steer or queue a follow-up.
    var f = $('follow');
    var typing = Boolean((f && f.value.trim()) || pendingFor().length);
    var stopMode = running && !typing;
    b.classList.toggle('stop', stopMode);
    b.title = stopMode ? 'Stop the agent' : 'send (Enter)';
    b.setAttribute('aria-label', stopMode ? 'Stop the agent' : 'Send message');
    b.innerHTML = stopMode ? '&#9632;' : '&#8593;';
    b.disabled=!stopMode&&pendingFor().some(function(file){return file.loading||file.error;});
    // Surface interrupts right above the composer where action happens.
    var bar = b.parentElement;
    if (bar) {
      var chip = bar.querySelector('#wfChip');
      if (waiting) {
        if (!chip) {
          chip = document.createElement('span');
          chip.id = 'wfChip';
          chip.className = 'chip warn';
          bar.insertBefore(chip, bar.firstChild);
        }
        chip.textContent = '⏸ waiting for you — ' + waiting;
        chip.title = 'the agent is blocked and needs your input in the stream';
      } else if (chip) chip.remove();
      // Explicit delivery choice for messages sent mid-run: STEER injects the
      // text into the live run at the next step; QUEUE holds it until the run
      // completes, then it starts a fresh follow-up. The label always states
      // what actually happens — it used to say "queue" while steering.
      var toggle = bar.querySelector('#deliveryToggle');
      if (running && typing) {
        if (!toggle) {
          toggle = document.createElement('span');
          toggle.id = 'deliveryToggle';
          toggle.style.cssText = 'display:inline-flex;gap:0;margin-left:6px;flex:none';
          toggle.innerHTML =
            '<button type="button" data-del="steer" class="btn ghost" style="border-radius:8px 0 0 8px;padding:4px 9px;font-size:11px"></button>' +
            '<button type="button" data-del="queue" class="btn ghost" style="border-radius:0 8px 8px 0;padding:4px 9px;font-size:11px"></button>';
          toggle.querySelectorAll('[data-del]').forEach(function (btn) {
            btn.onclick = function () { S.delivery = btn.getAttribute('data-del'); updateSendState(); };
          });
          bar.insertBefore(toggle, b);
        }
        var steerBtn = toggle.querySelector('[data-del="steer"]');
        var queueBtn = toggle.querySelector('[data-del="queue"]');
        steerBtn.textContent = '⚡ Steer';
        queueBtn.textContent = '⏳ Queue';
        steerBtn.title = 'Send into the running task now — the agent takes it into account at the next step';
        queueBtn.title = 'Hold the message until the current run finishes, then it starts a fresh follow-up';
        steerBtn.style.opacity = S.delivery === 'steer' ? '1' : '0.45';
        queueBtn.style.opacity = S.delivery === 'queue' ? '1' : '0.45';
        steerBtn.style.fontWeight = S.delivery === 'steer' ? '700' : '400';
        queueBtn.style.fontWeight = S.delivery === 'queue' ? '700' : '400';
      } else if (toggle) toggle.remove();
    }
  }

  function stopStreams() {
    flushLiveText(); if (S.es) { S.es.close(); S.es = null; } if (S.poll) { clearInterval(S.poll); S.poll = null; } cwStopPoll();
    Object.keys(S.sessions || {}).forEach(function (id) {
      var presence = S.sessions[id].nodes && S.sessions[id].nodes.subagentPresence;
      if (presence) presence.view.dispose();
    });
  }

  function openHome() {
    var transition=captureChatTransition();if(S.active==='home')transition=null;
    document.body.classList.remove('cowork');
    S.active = 'home';
    S.supersedeNext = null;
    toggleMobileNav(false);
    closeToolPanel();
    stopStreams();
    stopBrowserPoll();
    renderSidebar();
    renderTopbar();
    var effProj = effectiveProjectPath();
    var name = effectiveProjectName();
    var keyless = S.modelsLoaded && !hasAnyProviderKey();
    $('view').innerHTML =
      '<div class="home home-sky">' + cwPageNavHtml('home',cwProfileAgent()) +
      '<button class="home-settings-trigger" id="homeSettings" aria-label="Open settings" title="Settings">'+icon('gear')+'</button>' +
      '<header class="home-brand">' +
      '<div class="home-brand-lockup">' + /* GITU_VALUE_HOME_CHARACTER_JSON */ null + '<h1><span>Agent</span><span><span class="home-brand-name">Gitu</span><i class="home-brand-spark" aria-hidden="true"></i></span></h1></div>' +
      '<p class="home-brand-copy">A little spark. A working idea. Let’s build it.</p></header>' +
      (keyless
        ? '<button class="setup-card" id="keylessCta" style="cursor:pointer;width:100%;text-align:left;display:block;margin:0 auto 8px;max-width:760px">' +
          '<h3 style="margin:0 0 4px">Connect a model provider</h3>' +
          '<div class="meta-line">Choose a provider and add a key to start your first task.</div><span class="setup-action">Open provider settings →</span></button>'
      : '') +
      '<div class="home-composer-wrap"><div class="composer-topline"><button type="button" class="composer-workspace" id="homeProj" aria-label="Project '+esc(name)+'" title="Choose project">'+icon('folder')+'<span>'+esc(name)+'</span></button></div>' +
      '<div class="composer"><textarea id="goal" rows="1" placeholder="Ask Agent Gitu to complete a task…"></textarea>' +
      '<div class="thumbs" id="thumbs" hidden></div>' +
      '<div class="composer-bar">' + controlsHtml() + '<button class="send" id="send" title="Start task" aria-label="Start task"' + (S.modelsLoaded && hasAnyProviderKey() ? '' : ' disabled') + '>&#8593;</button></div></div></div>' +
      '<section class="home-projects" aria-labelledby="homeProjectsTitle"><div class="home-project-heading"><h2 id="homeProjectsTitle">Projects</h2><div class="home-project-actions"><button class="btn" id="homeNewProject">'+cwIcon('plus')+'New project</button></div></div><div id="homeProjectCards"><p role="status">Loading projects…</p></div></section></div>';
    $('cwHomeBtn').onclick=function(){$('goal').focus();};$('cwCurrentChat').onclick=function(){cwEnterWorkspace('chat',cwEnsure().selectedAgentId);};$('cwInfoBtn').onclick=function(){var agent=cwProfileAgent()||cwEnsure().agents[0];cwEnterWorkspace(agent?'profile':'new',agent&&agent.id);};$('homeNewProject').onclick=newProject;$('homeSettings').onclick=function(){openSettings('overview');};$('cwPageSearch').onclick=function(){wsOpen('main');};homeLoadProjects();homeLoadProfile();
    var ta = $('goal');
    ta.value = S.draft;
    ta.addEventListener('input', function () { S.draft = ta.value; persist(); ta.style.height = 'auto'; ta.style.height = Math.min(180, ta.scrollHeight) + 'px'; });
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); startRun(); } });
    bindControls();
    bindPaste('goal');
    $('send').onclick = startRun;
    $('homeProj').onclick = openFolderBrowser;
    var kcta = $('keylessCta');
    if (kcta) kcta.onclick = function () { openSettings('providers'); };
    playChatTransition(transition);
  }

  function isFreeModelId(id) {
    id = String(id || '');
    return /-free$/i.test(id) || /:free$/i.test(id) || id === 'big-pickle';
  }

  function modelInfo(value) {
    var parts = String(value || '').split('::');
    var pid = parts[0], mid = parts[1];
    for (var i = 0; i < S.models.length; i++) {
      var p = S.models[i];
      if (p.id !== pid) continue;
      for (var j = 0; j < p.models.length; j++) if (p.models[j].id === mid) return p.models[j];
    }
    return null;
  }
  function formatTokens(n) {
    if (typeof n !== 'number') return '';
    if (n >= 1000000) return (Math.round(n / 100000) / 10) + 'M';
    return Math.round(n / 1000) + 'K';
  }
  function formatPrice(n) {
    if (typeof n !== 'number') return '';
    if (n === 0) return 'free';
    if (n < 0.01) return '$' + n.toFixed(4);
    if (n < 1) return '$' + n.toFixed(2);
    return '$' + (Math.round(n * 100) / 100).toFixed(2);
  }
  function modelMetaText(model) {
    if (!model) return 'limits and pricing unavailable';
    var meta = model.metadata || {};
    var parts = [];
    if (meta.contextTokens) parts.push(formatTokens(meta.contextTokens) + ' context');
    if (typeof meta.inputPricePerMillion === 'number' && typeof meta.outputPricePerMillion === 'number') {
      parts.push(formatPrice(meta.inputPricePerMillion) + ' in / ' + formatPrice(meta.outputPricePerMillion) + ' out per 1M');
    } else if (model.free) {
      parts.push('free');
    }
    return parts.length ? parts.join(' · ') : 'limits and pricing unavailable';
  }
  function updateModelMeta() {
    var el = $('modelMeta');
    if (!el) return;
    var m = modelInfo(S.sel.model);
    el.textContent = m ? 'ⓘ' : '';
    el.title = modelMetaText(m);
    el.setAttribute('aria-label', m ? 'Model details: ' + modelMetaText(m) : 'Model details unavailable');
  }

  function modelOptionsHtml() {
    var out = '';
    catalogModelGroups(undefined, '', true).forEach(function (g) {
      var p = g.p;
      g.models.forEach(function (m) {
        out += '<option value="' + esc(p.id + '::' + m.id) + '">' + esc(p.id + ' / ' + titleCase(m.id)) + (m.free ? ' (free)' : '') + ' — ' + esc(modelMetaText(m)) + '</option>';
      });
    });
    return out;
  }
  function modelLabelText(value) {
    var parts = String(value || '').split('::');
    var mid = parts.slice(1).join('::') || parts[0];
    return prettyModelName(String(mid || '').split('/').pop());
  }
  function modelBrandHtml(value,info) {
    var parts=String(value||'').split('::'),model=info||modelInfo(value),brand=model&&model.brand;
    var id=brand&&brand.id||model&&model.ownedBy||parts.slice(1).join('::').split('/')[0]||parts[0],initial=String(id||'AI').slice(0,2).toUpperCase();
    var url=brand&&brand.iconUrl,valid=typeof url==='string'&&/^\/api\/model-icons\/(lab|provider)\/[a-z0-9][a-z0-9-]{0,63}\.svg$/.test(url);
    return '<span class="model-brand" aria-hidden="true"><span class="model-brand-fallback">'+esc(initial)+'</span>'+(valid?'<img class="model-brand-logo" src="'+esc(url)+'" width="18" height="18" loading="lazy" alt="" onload="this.parentElement.classList.add(\'loaded\')" onerror="this.parentElement.classList.remove(\'loaded\');this.remove()">':'')+'</span>';
  }
  function syncModelLabel() {
    var lab = $('modelLabel');
    var model = $('model');
    var text = model ? modelLabelText(model.value) : '';
    if (lab) lab.innerHTML = (text?modelBrandHtml(model.value):'')+'<span class="model-short-name">'+esc(text || (S.modelsLoaded ? 'Choose model' : 'Loading models…'))+'</span>';
    var pick = $('modelPick');
    if (pick) {
      pick.title = text ? 'Model: ' + text : 'Choose model';
      pick.setAttribute('aria-label', pick.title);
    }
  }
  // What the model search box matches against: provider, ids, human name,
  // context size and capability flags — deliberately NOT prices, so the filter
  // input never references or depends on cost.
  function modelSearchText(p, m) {
    var meta = m.metadata || {};
    var parts = [p.id, m.id, titleCase(m.id)];
    if (meta.contextTokens) parts.push(formatTokens(meta.contextTokens) + ' context');
    if (m.free) parts.push('free');
    if (m.vision) parts.push('vision images');
    return parts.join(' ').toLowerCase();
  }
  // Highlight the first occurrence of the (already lower-cased) query inside
  // text, keeping the original casing of the rendered string.
  function markMatch(text, q) {
    if (!q) return esc(text);
    var idx = String(text).toLowerCase().indexOf(q);
    if (idx < 0) return esc(text);
    return esc(text.slice(0, idx)) + '<mark>' + esc(text.slice(idx, idx + q.length)) + '</mark>' + esc(text.slice(idx + q.length));
  }
  function modelMenuGroups(query) {
    return catalogModelGroups(undefined, query, true);
  }
  function renderModelMenu(query) {
    var list = $('modelList');
    if (!list) return;
    var q = String(query || '').toLowerCase().trim();
    var groups = modelMenuGroups(query);
    var cur = $('model') ? $('model').value : '';
    var total = groups.reduce(function (n, g) { return n + g.models.length; }, 0);
    var count = $('modelCount');
    if (count) count.textContent = total + (total === 1 ? ' model' : ' models') + (q ? (total === 1 ? ' matches' : ' match') : '');
    if (!groups.length) {
      list.innerHTML = '<div class="model-empty">No models match &ldquo;' + esc(query || '') + '&rdquo;<br><span style="font-size:11px">Try a provider or model name</span></div>';
      return;
    }
    var html = '';
    groups.forEach(function (g) {
      html += '<div class="model-sec" title="' + esc(g.p.label || g.p.id) + '">' + esc(g.p.label || g.p.id) + '</div>';
      g.models.forEach(function (m) {
        var val = g.p.id + '::' + m.id;
        html += '<button type="button" class="model-item' + (val === cur ? ' cur' : '') + '" data-val="' + esc(val) + '" role="option" aria-selected="' + (val === cur ? 'true' : 'false') + '">' +
          '<div class="mi-top"><span class="mi-prov">' + markMatch(g.p.id, q) + '</span>' +
          '<span class="mi-meta">' + esc(modelMetaText(m)) + '</span></div>' +
          '<div class="mi-name">' + modelBrandHtml(val,m) + markMatch(titleCase(m.id), q) + (m.vision ? ' <i class="vmark" title="supports images">&#9672;</i>' : '') + '</div>' +
          '</button>';
      });
    });
    list.innerHTML = html;
    var first = list.querySelector('.model-item');
    if (first) first.classList.add('hl');
  }
  function modelMenuMove(dir) {
    var items = $('modelList') ? $('modelList').querySelectorAll('.model-item') : [];
    if (!items.length) return;
    var cur = -1;
    for (var i = 0; i < items.length; i++) if (items[i].classList.contains('hl')) { cur = i; break; }
    var next = cur < 0 ? (dir > 0 ? 0 : items.length - 1) : (cur + dir + items.length) % items.length;
    if (cur >= 0) items[cur].classList.remove('hl');
    items[next].classList.add('hl');
    if (items[next].scrollIntoView) items[next].scrollIntoView({ block: 'nearest' });
  }
  function pickModel(val) {
    var model = $('model');
    if (!model || !val) return;
    model.value = val;
    model.dispatchEvent(new Event('change'));
    syncModelLabel();
    closeModelMenu();
  }
  function openModelMenu() {
    var menu = $('modelMenu'), pick = $('modelPick'), filter = $('modelFilter');
    if (!menu || !pick) return;
    menu.hidden = false;
    pick.classList.add('open');
    pick.setAttribute('aria-expanded', 'true');
    if (filter) {
      filter.value = '';
      renderModelMenu('');
      setTimeout(function () { filter.focus(); }, 0);
    } else renderModelMenu('');
  }
  function closeModelMenu() {
    var menu = $('modelMenu'), pick = $('modelPick');
    if (menu) menu.hidden = true;
    if (pick) pick.classList.remove('open');
    if (pick) pick.setAttribute('aria-expanded', 'false');
  }
  function bindModelMenu() {
    var pick = $('modelPick'), filter = $('modelFilter'), menu = $('modelMenu');
    if (!pick || !menu) return;
    pick.onclick = function () {
      if (menu.hidden) openModelMenu(); else closeModelMenu();
    };
    if (filter) {
      filter.oninput = function () { renderModelMenu(filter.value); };
      filter.onkeydown = function (e) {
        if (e.key === 'Enter') {
          var hl = $('modelList').querySelector('.model-item.hl') || $('modelList').querySelector('.model-item');
          if (hl) pickModel(hl.getAttribute('data-val'));
          e.preventDefault();
        } else if (e.key === 'ArrowDown') { modelMenuMove(1); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { modelMenuMove(-1); e.preventDefault(); }
        else if (e.key === 'Escape') { closeModelMenu(); }
        e.stopPropagation();
      };
    }
    if ($('modelList')) $('modelList').onmousedown = function (e) {
      var item = e.target.closest ? e.target.closest('.model-item') : null;
      if (item) { e.preventDefault(); pickModel(item.getAttribute('data-val')); }
    };
    if (!S.modelMenuDocBound) {
      S.modelMenuDocBound = true;
      document.addEventListener('click', function (e) {
        var p = $('modelPick');
        if (p && !e.target.closest('.model-control')) closeModelMenu();
      });
    }
  }
  function provOf(v) { return v.split('::')[0]; }
  function effortLevelsFor(pid) {
    for (var i = 0; i < S.models.length; i++) if (S.models[i].id === pid) return S.models[i].effortLevels || ['low', 'medium', 'high', 'max'];
    return ['low', 'medium', 'high', 'max'];
  }
  function effortMaxHint(pid) {
    for (var i = 0; i < S.models.length; i++) if (S.models[i].id === pid) return S.models[i].maxEffort || 'collapses-to-high';
    return 'collapses-to-high';
  }
  function effortLabel(pid, level) {
    for (var i = 0; i < S.models.length; i++) {
      if (S.models[i].id !== pid) continue;
      return (S.models[i].effortLabels && S.models[i].effortLabels[level]) || level;
    }
    return level;
  }
  function fillEffort(id, pid) {
    var el = $(id);
    if (!el) return;
    var collapses = effortMaxHint(pid) === 'collapses-to-high';
    el.innerHTML = effortLevelsFor(pid).map(function (l) {
      var label = l === 'max' && collapses ? 'max (= high)' : effortLabel(pid, l);
      return '<option value="' + l + '">' + esc(label) + '</option>';
    }).join('');
  }
  function planRequested(runId) {
    return Boolean(runId === 'home' ? S.homePlanRequested : S.sessions[runId] && S.sessions[runId].planRequested);
  }
  function setPlanRequested(runId, enabled) {
    if (runId === 'home') S.homePlanRequested = enabled;
    else if (S.sessions[runId]) S.sessions[runId].planRequested = enabled;
    if (S.active === runId) updatePlanControl();
  }
  function updatePlanControl() {
    var agent = $('menuAgent'), plan = $('menuPlan'), plus = $('homePlusBtn');
    if (!agent || !plan) return;
    var sess = S.sessions[S.active];
    var busy = Boolean(sess && sess.session && sess.session.status === 'running');
    var enabled = planRequested(S.active);
    agent.disabled = plan.disabled = busy || Boolean(S.starting);
    agent.setAttribute('aria-checked', String(!enabled));
    plan.setAttribute('aria-checked', String(enabled));
    agent.classList.toggle('active', !enabled);
    plan.classList.toggle('active', enabled);
    plan.title = busy ? 'Available when this task finishes' : 'Pause for plan review before making changes';
    if (plus) plus.title = enabled ? 'More actions · Plan mode selected' : 'More actions · Agent mode selected';
  }
  function controlsHtml() {
    return voicePhoneButton('mainVoiceCall') + '<button type="button" class="pill control-pill" id="homePlusBtn" title="More actions" aria-label="More actions" aria-haspopup="menu" aria-expanded="false">' + icon('plus') + '</button>' +
      '<div class="home-plus-menu" id="homePlusMenu" hidden role="menu" aria-label="More actions">' +
        '<button type="button" id="menuAgent" data-hp="agent" role="menuitemradio" aria-checked="true"><span class="ico">' + icon('bolt') + '</span>Agent mode<span class="check">✓</span></button>' +
        '<button type="button" id="menuPlan" data-hp="plan" role="menuitemradio" aria-checked="false"><span class="ico">' + icon('layers') + '</span>Plan mode<span class="check">✓</span></button>' +
        '<button type="button" data-hp="attach" role="menuitem"><span class="ico">' + icon('file') + '</span>Choose files</button>' +
        '<button type="button" data-hp="folder" role="menuitem"><span class="ico">' + icon('folder') + '</span>' + (S.active === 'home' ? 'Choose project folder' : 'Tag reference folder') + '</button>' +
        '<button type="button" data-hp="schedule" role="menuitem"><span class="ico">' + icon('clock') + '</span>Schedule a run</button>' +
      '</div>' +
      '<span class="model-control"><select id="model" hidden>' + modelOptionsHtml() + '</select><button type="button" class="pill control-pill model-pick" id="modelPick" title="Choose model" aria-haspopup="listbox" aria-expanded="false"' + (S.modelsLoaded && hasAnyProviderKey() ? '' : ' disabled') + '><span class="mp-label" id="modelLabel">' + (S.modelsLoaded ? 'Choose model' : 'Loading models…') + '</span></button>' +
      '<div class="model-menu" id="modelMenu" hidden><input id="modelFilter" placeholder="Search models…" aria-label="Search models" autocomplete="off" spellcheck="false"><div class="model-list" id="modelList" role="listbox"></div><div class="model-count" id="modelCount"></div><div class="model-menu-settings"><label for="effort">Reasoning effort</label><select id="effort" aria-label="Reasoning effort"></select><span class="model-meta" id="modelMeta"></span></div></div></span>' +
      '<input type="file" id="attachInput" multiple hidden>';
  }
  function currentVision() {
    var parts = String(S.sel.model || '').split('::');
    var pid = parts[0], mid = parts[1];
    for (var i = 0; i < S.models.length; i++) {
      var p = S.models[i];
      if (p.id !== pid) continue;
      for (var j = 0; j < p.models.length; j++) if (p.models[j].id === mid) return Boolean(p.models[j].vision);
      for (var k = 0; k < p.models.length; k++) if (p.models[k].id === p.defaultModel) return Boolean(p.models[k].vision);
      return true;
    }
    return true;
  }