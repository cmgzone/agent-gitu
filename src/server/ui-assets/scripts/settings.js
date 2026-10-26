

  function syncCodingPermissions() {
    return api('/api/coding-permissions').then(function (saved) {
      // Import an existing full-access choice once; a fresh client's default
      // must never overwrite another device's saved permission choice.
      if (!saved.configured && S.settings.autoApprove === true) return api('/api/coding-permissions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ access: 'full' }) });
      return saved;
    }).then(function (saved) { S.settings.autoApprove = saved.access === 'full'; persist(); return saved; }).catch(function () {});
  }
  function openSettings(section) {
    S.setSection = section || 'overview';
    closeToolPanel();
    var shell=document.querySelector('.shell');if($('settings').hidden){S.settingsFocus=document.activeElement;S.settingsShellInert=shell.inert;}
    shell.inert=true;
    $('settings').hidden = false;
    renderSettings();
    if (S.setSection === 'permissions') syncCodingPermissions().then(function () { var button = $('pAuto'); if (button) button.classList.toggle('on', !!S.settings.autoApprove); });
    var focus=$('settingsDirectoryQuery')||$('setnav').querySelector('[aria-current="page"]');if(focus)focus.focus({preventScroll:true});
    $('settings').onkeydown=function(event){if(event.key!=='Tab')return;var controls=Array.from(this.querySelectorAll('button:not(:disabled),input:not([type=hidden]):not(:disabled),textarea:not(:disabled),select:not(:disabled)')).filter(function(node){return node.getClientRects().length;});var first=controls[0],last=controls[controls.length-1];if(!first)return;if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}};
  }
  function closeSettings() {
    if($('settings').hidden)return;
    $('settings').hidden = true;
    if(typeof cwCloseConnectionManager==='function')cwCloseConnectionManager();
    document.querySelector('.shell').inert=!!S.settingsShellInert;
    var focus=S.settingsFocus&&S.settingsFocus.isConnected?S.settingsFocus:$('homeSettings')||$('mainChatHistory')||$('cwBack')||$('cwPageSearch');if(focus)focus.focus({preventScroll:true});
  }

  function refreshModels() {
    loadModelCatalog(true)
      .then(function () { renderSettings(); })
      .catch(function () { renderSettings(); });
  }

  function renderSettings() {
    var items = WORKSPACE_SETTINGS;
    if(S.setSection!=='connections'&&typeof cwCloseConnectionManager==='function')cwCloseConnectionManager();
    var settings=$('settings');settings.classList.toggle('settings-directory',S.setSection==='overview');
    var close=$('settingsClose');if(!close){settings.insertAdjacentHTML('afterbegin','<button class="settings-close" id="settingsClose" aria-label="Close settings">'+icon('x')+'</button><button class="settings-top-back" id="settingsDirectoryBack">'+icon('back')+'<span>All settings</span></button>');close=$('settingsClose');}
    close.onclick=closeSettings;$('settingsDirectoryBack').hidden=S.setSection==='overview';$('settingsDirectoryBack').onclick=function(){openSettings('overview');};
    $('setnav').innerHTML =
      '<button class="back" id="setBack">' + icon('search') + ' Search</button>' +
      '<div class="sect">Settings</div>' +
      items.map(function (it) {
        return '<button class="item ' + (S.setSection === it[0] ? 'active' : '') + '" data-sec="' + it[0] + '" aria-current="'+(S.setSection===it[0]?'page':'false')+'"><span class="ico">' + icon(it[1]) + '</span>' + it[2] + '</button>';
      }).join('');
    $('setBack').onclick = function(){wsOpen();};
    $('setnav').querySelectorAll('[data-sec]').forEach(function (el) {
      el.onclick = function () { S.setSection = el.getAttribute('data-sec'); renderSettings(); };
    });
    var b = $('setbody');
    if(S.setSection==='overview'){wsSettingsDirectory();return;}
    if(S.setSection==='files'){renderFileSettings(b);return;}
    // Async sections seed an instant loading row instead of a blank flash.
    if (S.setSection !== 'general' && S.setSection !== 'workspace') {
      b.innerHTML = '<h1>' + esc(S.setSection === 'mcp' ? 'MCP servers' : S.setSection === 'skills' ? 'Skills' : S.setSection === 'agents' ? 'Specialist agents' : S.setSection === 'cron' ? 'Scheduled / heartbeat' : S.setSection === 'connections' ? 'Connections' : S.setSection) + '</h1><p class="meta" style="color:var(--muted);font-size:12.5px">loading…</p>';
    }
    if (S.setSection === 'general') {
      b.innerHTML = '<h1>General</h1>' + themeOptionsHtml() +
        '<h2>Defaults</h2><div class="setcard">' +
        '<div class="setrow"><div class="grow"><div class="t">Agent workflow</div><div class="d">One conversation for questions and changes. Quick edits get focused checks. Use Plan in the composer to review a plan for one request, then continue building.</div></div><span class="chip">Always on</span></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Intelligence level</div><div class="d">Reasoning effort sent to the model (dynamic per provider).</div></div><select id="gEffort"></select></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Keep going until done</div><div class="d">The agent recovers from provider and protocol errors — empty completions, malformed replies, repeated calls — instead of stopping itself mid-task. Off restores the original fail-fast limits.</div></div><input type="checkbox" id="gPersist" style="width:18px;height:18px;flex:none"></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Spend ceiling</div><div class="d">Optional per-run limit in USD. Left empty, a run is never stopped for cost — only by you, or by finishing the task.</div></div><input type="text" id="gSpend" inputmode="decimal" placeholder="none" style="width:96px;background:var(--card2);border:1px solid var(--border2);color:var(--text);border-radius:8px;padding:6px 9px;font:inherit;font-size:13px"></div>' +
        '</div>';
      b.insertAdjacentHTML('beforeend','<h2>Account</h2><div class="setcard" id="googleAccountSettings"><div class="setrow"><div class="grow"><div class="t">Google sign-in</div><div class="d">Checking configuration…</div></div></div></div>');
      if (window.ReactNativeWebView) {
        b.insertAdjacentHTML('beforeend', '<h2>Sign out</h2><div class="setcard"><div class="setrow"><div class="grow"><div class="t">Log out of this phone</div><div class="d">Return to the server chooser. Saved conversation copies are removed from this device.</div></div><button class="btn ghost" id="gituAndroidLogout">Log out</button></div></div>');
        $('gituAndroidLogout').onclick = async function () {
          var button = this; button.disabled = true;
          try {
            await api('/api/auth/logout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
            for (var index = localStorage.length - 1; index >= 0; index--) {
              var key = localStorage.key(index);
              if (key && (key.indexOf('hermes.cowork.offline.') === 0 || key.indexOf('gitu.offline.main-run.') === 0 || key === 'gitu.offline.main-run.active.v1')) localStorage.removeItem(key);
            }
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'gitu-logout' }));
          } catch (error) { toast(error.message || 'Could not log out. Check the connection and retry.', true); button.disabled = false; }
        };
      }
      api('/api/auth/status').then(function(status){var card=$('googleAccountSettings');if(!card)return;card.querySelector('.d').textContent=status.googleEnabled?(status.googleLinked?'Your Google account is linked. You can use Google on the sign-in screen.':'Link the Google account matching your workspace owner email.'): 'The server owner can enable Google sign-in with a Google OAuth client and an HTTPS public address.';if(status.googleEnabled&&!status.googleLinked){var link=document.createElement('a');link.className='btn';link.href='/auth?link=google';link.textContent='Link Google account';card.querySelector('.setrow').appendChild(link);}}).catch(function(){});
      var googleCard=$('googleAccountSettings'),details=document.createElement('details');
      details.style.padding='12px';details.innerHTML='<summary>Configure Google sign-in</summary><p class="meta">Create a Web application OAuth client in Google Cloud. Register the callback shown below. Your client secret stays on this Gitu server.</p><form id="googleOAuthForm"><label>Public address<input name="origin" type="url" placeholder="https://gitu.example.com" required></label><label>Google client ID<input name="clientId" autocomplete="off" required></label><label>Client secret<input name="clientSecret" type="password" autocomplete="new-password" placeholder="Leave blank to keep saved secret"></label><p data-callback class="meta"></p><button type="submit" class="btn">Save Google configuration</button><p data-result role="status" class="meta"></p></form>';
      googleCard.appendChild(details);
      var googleForm=details.querySelector('form'),googleResult=details.querySelector('[data-result]'),callbackLabel=details.querySelector('[data-callback]');
      googleForm.querySelectorAll('label').forEach(function(label){label.style.display='grid';label.style.gap='6px';label.style.margin='12px 0';});
      googleForm.elements.origin.oninput=function(){try{callbackLabel.textContent='Callback: '+new URL(this.value).origin+'/auth/google/callback';}catch(error){callbackLabel.textContent='Enter your HTTPS Gitu address (or localhost).';}};
      details.ontoggle=function(){if(!details.open||details._loaded)return;details._loaded=true;api('/api/auth/google/settings').then(function(value){googleForm.elements.origin.value=value.origin;googleForm.elements.clientId.value=value.clientId;callbackLabel.textContent=value.callback?'Callback: '+value.callback:'Callback: your Gitu public origin + /auth/google/callback';}).catch(function(error){googleResult.textContent=error.message;});};
      googleForm.onsubmit=async function(event){event.preventDefault();var save=googleForm.querySelector('button');save.disabled=true;try{var result=await api('/api/auth/google/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({origin:googleForm.elements.origin.value,clientId:googleForm.elements.clientId.value,clientSecret:googleForm.elements.clientSecret.value})});googleForm.elements.clientSecret.value='';callbackLabel.textContent='Callback: '+result.callback;googleResult.textContent='Saved. Google sign-in is available. Register this exact callback in Google Cloud.';renderSettings();}catch(error){googleForm.elements.clientSecret.value='';googleResult.textContent=error.message;}finally{save.disabled=false;}};
      fillEffort('gEffort', provOf(S.sel.model));
      $('gEffort').value = S.sel.effort;
      $('gEffort').onchange = function () { S.sel.effort = $('gEffort').value; persist(); };
      var gPersist = $('gPersist'), gSpend = $('gSpend');
      if (gPersist) gPersist.checked = S.sel.persistent !== false;
      if (gSpend) gSpend.value = String(S.sel.spendCeilingUsd || '');
      var saveAutonomy = function () {
        var raw = String(gSpend.value || '').trim();
        var persistent = gPersist.checked;
        // An empty field sends null, which clears the ceiling — "no spend
        // limit" must stay expressible, and it is the default.
        api('/api/autonomy', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ persistent: persistent, maxCostUsd: raw === '' ? null : raw })
        }).then(function (saved) {
          S.sel.persistent = saved.persistent !== false;
          S.sel.spendCeilingUsd = saved.maxCostUsd === undefined ? '' : String(saved.maxCostUsd);
          persist();
          toast('Autonomy: ' + (S.sel.persistent ? 'keeps going until done' : 'fail fast') + (S.sel.spendCeilingUsd ? ' · $' + S.sel.spendCeilingUsd + ' ceiling' : ''));
        }).catch(function (e) { toast(e.message, true); });
      };
      if (gPersist) gPersist.onchange = saveAutonomy;
      if (gSpend) gSpend.onchange = saveAutonomy;
      api('/api/home').then(function (h) {
        if (!$('gPersist') || S.setSection !== 'general') return;
        var a = (h && h.autonomy) || {};
        $('gPersist').checked = a.persistent !== false;
        if ($('gSpend')) $('gSpend').value = a.maxCostUsd === undefined ? '' : String(a.maxCostUsd);
      }).catch(function () {});
      b.insertAdjacentHTML('beforeend', '<h2>Getting started</h2><p class="appearance-description">Choose your theme, connect a provider, and pick a workspace.</p><button class="btn ghost" id="setupAgain">Open setup wizard</button>');
      $('setupAgain').onclick = function () { closeSettings(); openSetupWizard(); };
      if (window.gituAndroidPush) {
        b.insertAdjacentHTML('beforeend', '<h2>Android notifications</h2><div class="setcard" id="androidPushCard"><div class="setrow"><div class="grow"><div class="t">Task updates on this phone</div><div class="d" id="androidPushStatus">Checking notification settings…</div></div><button class="btn ghost" id="androidPushToggle" disabled>Enable</button><button class="btn ghost" id="androidPushTest" disabled>Send test</button></div></div>');
        var pushState;
        var renderPush = function (status) {
          if (S.setSection !== 'general' || !$('androidPushStatus')) return;
          pushState = status;
          $('androidPushStatus').textContent = !status.supported ? 'This APK needs Firebase configuration. Ask the server owner for the updated Android build.' : !status.available ? 'The server owner must configure Firebase notifications.' : status.enabled && status.permission === 'granted' ? 'On: completed tasks, questions, approvals, and teammate replies. Message contents stay out of notifications.' : status.enabled ? 'Android notification permission is off. Enable it in Android Settings.' : 'Receive task updates while the app is in the background.';
          $('androidPushToggle').textContent = status.enabled ? 'Disable' : 'Enable';
          $('androidPushToggle').disabled = !status.enabled && (!status.supported || !status.available);
          $('androidPushTest').disabled = !status.enabled || !status.available || status.permission !== 'granted';
        };
        var refreshPush = function () { return window.gituAndroidPush.status().then(renderPush); };
        $('androidPushToggle').onclick = function () {
          var button = this; button.disabled = true;
          (pushState && pushState.enabled ? window.gituAndroidPush.disable() : window.gituAndroidPush.enable()).then(refreshPush).catch(function (error) { toast(error.message, true); return refreshPush(); });
        };
        $('androidPushTest').onclick = function () { var button=this; button.disabled=true; window.gituAndroidPush.test().then(function () { toast('Test notification sent to Firebase'); }).catch(function (error) { toast(error.message, true); }).finally(refreshPush); };
        refreshPush().catch(function () { if ($('androidPushStatus')) $('androidPushStatus').textContent = 'Could not read notification settings. Reopen Settings to retry.'; });
      }
      if (window.gituDesktop && typeof window.gituDesktop.phoneAccess === 'function') {
        b.insertAdjacentHTML('beforeend', '<h2>Phone access</h2><div class="setcard" id="phoneAccessCard"><div class="setrow"><div class="grow"><div class="t">Connect your Android phone</div><div class="d">Checking your Wi-Fi address…</div></div></div></div>');
        var renderPhoneAccess = function (status) {
          var card = $('phoneAccessCard'); if (!card || S.setSection !== 'general') return;
          var addresses = status && status.addresses || [];
          card.innerHTML = '<div class="setrow"><div class="grow"><div class="t">'+(status && status.enabled ? 'Starts automatically with Gitu' : 'Phone access is disabled')+'</div><div class="d">Connect both devices to the same Wi-Fi. Choose Local network in Android and sign in with your Gitu email and password.</div></div></div>' +
            addresses.map(function (address) { return '<div class="setrow"><div class="grow"><code style="overflow-wrap:anywhere">'+esc(address)+'</code></div></div>'; }).join('') +
            '<div class="setrow"><div class="grow"><div class="d">'+esc(status && status.pending ? 'Waiting for the Windows permission request…' : status && status.allowed ? 'Windows network permission is configured.' : status && status.message || 'No Wi-Fi address is available. Check your network connection.')+'</div><div class="d">Local HTTP sends passwords and workspace data unencrypted. Use trusted Wi-Fi.</div></div></div>' +
            (status && status.enabled ? '<div class="setrow"><button class="btn ghost" id="allowPhoneAccess">Allow Wi-Fi access</button><button class="btn ghost" id="refreshPhoneAccess">Refresh address</button></div>' : '');
          if ($('refreshPhoneAccess')) $('refreshPhoneAccess').onclick = function () { window.gituDesktop.phoneAccess().then(renderPhoneAccess).catch(function (error) { toast(error.message, true); }); };
          if ($('allowPhoneAccess')) $('allowPhoneAccess').onclick = function () { var button=this;button.disabled=true;window.gituDesktop.allowPhoneAccess().then(renderPhoneAccess).catch(function (error) { toast(error.message, true); }).finally(function(){if(button.isConnected)button.disabled=false;}); };
        };
        window.gituDesktop.phoneAccess().then(renderPhoneAccess).catch(function () { renderPhoneAccess({ enabled: true, addresses: [], message: 'Could not read phone access. Reopen Gitu and try again.' }); });
      }
    } else if (S.setSection === 'cowork') {
      b.innerHTML = '<h1>Cowork</h1>' +
        '<p style="color:var(--muted);font-size:12.5px;max-width:640px">Shared context for your agent team. Every teammate receives this in their system prompt, and they will update it themselves when you ask them to in a chat (or when you share something durable about you).</p>' +
        '<div class="setcard" style="margin-bottom:12px"><div class="t" style="margin:14px 18px 10px">About you</div>' +
        '<div style="display:grid;gap:8px;max-width:620px;padding:0 18px 16px">' +
        '<input id="cwSetName" placeholder="Your name" style="background:var(--card2);border:1px solid var(--border2);color:var(--text);border-radius:8px;padding:7px 10px;font:inherit;font-size:13px">' +
        '<textarea id="cwSetAbout" rows="4" placeholder="About you — role, company, current focus…" style="background:var(--card2);border:1px solid var(--border2);color:var(--text);border-radius:8px;padding:7px 10px;font:inherit;font-size:13px;resize:vertical"></textarea>' +
        '<textarea id="cwSetPrefs" rows="3" placeholder="Working preferences — tone, hours, tools to prefer or avoid…" style="background:var(--card2);border:1px solid var(--border2);color:var(--text);border-radius:8px;padding:7px 10px;font:inherit;font-size:13px;resize:vertical"></textarea>' +
        '<div><button class="btn dark" id="cwSetProfileSave">Save</button></div></div></div>' +
        '<div class="setcard" style="margin-bottom:12px"><div class="setrow"><div class="grow"><div class="t">Learning mode</div><div class="d">Choose how your team learns from its conversations.</div></div><select id="cwLearningMode" aria-label="Cowork learning mode"><option value="off">Off</option><option value="reactive">When asked</option><option value="proactive">Proactive</option></select></div><div class="setrow"><div class="grow"><div class="t">Require approval for skill changes</div><div class="d">When on, teammates cannot save or improve skills directly — their changes are staged here for your review first. Applies to the whole team.</div></div><input type="checkbox" id="cwSkillApproval" style="width:18px;height:18px;flex:none"' + '></div>' +
        '<div id="cwPendingBody"></div></div>';
      api('/api/cowork/profile').then(function (d) {
        if (S.setSection !== 'cowork' || !$('cwSetName')) return;
        $('cwSetName').value = (d.profile && d.profile.name) || '';
        $('cwSetAbout').value = (d.profile && d.profile.about) || '';
        $('cwSetPrefs').value = (d.profile && d.profile.preferences) || '';
      }).catch(function () {});
      api('/api/cowork/profile').then(function (d) {
        if (S.setSection !== 'cowork' || !$('cwSetName')) return;
        $('cwSetName').value = (d.profile && d.profile.name) || '';
        $('cwSetAbout').value = (d.profile && d.profile.about) || '';
        $('cwSetPrefs').value = (d.profile && d.profile.preferences) || '';
      }).catch(function () {});
      // Skill-write approval: a review panel that lists staged teammate skill
      // changes, plus the toggle that turns staging on.
      api('/api/cowork/learning').then(function (d) {
        if (S.setSection !== 'cowork' || !$('cwSkillApproval')) return;
        $('cwSkillApproval').checked = d.skillApproval === true;
        if($('cwLearningMode'))$('cwLearningMode').value=d.mode||'reactive';
      }).catch(function () {});
      $('cwLearningMode').onchange=function(){var control=this,mode=control.value;control.disabled=true;api('/api/cowork/learning',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:mode})}).then(function(saved){cwEnsure().learn=saved;toast('Learning mode updated');}).catch(function(error){if(control.isConnected)control.value=cwLearnMode();toast(error.message,true);}).finally(function(){if(control.isConnected)control.disabled=false;});};
      $('cwSkillApproval').onchange = function () {
        api('/api/cowork/learning', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ skillApproval: $('cwSkillApproval').checked }) })
          .then(function () { toast($('cwSkillApproval').checked ? 'Skill changes now need your approval' : 'Skill changes apply directly'); renderSettings(); })
          .catch(function (e) { toast(e.message, true); });
      };
      var pendingBody = $('cwPendingBody');
      api('/api/cowork/skills/pending').then(function (d) {
        if (S.setSection !== 'cowork' || !$('cwPendingBody')) return;
        var items = d.pending || [];
        if (!items.length) { $('cwPendingBody').innerHTML = '<div style="font-size:12px;color:var(--muted);padding:0 18px 14px">Nothing waiting. Teammates stage changes here when approval is on.</div>'; return; }
        $('cwPendingBody').innerHTML = items.map(function (p) {
          return '<div style="border-top:1px solid var(--border);padding:10px 18px">' +
            '<div style="font-weight:600;font-size:13px">' + esc(p.name) + ' <span class="chip">' + (p.kind === 'create' ? 'new skill' : 'improve') + '</span></div>' +
            '<div style="font-size:11.5px;color:var(--muted);margin-top:2px">' + esc(p.description || '') + '</div>' +
            '<pre style="white-space:pre-wrap;font-family:var(--mono);font-size:11px;background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:8px;margin-top:6px;max-height:140px;overflow:auto">' + esc(p.instructions || '(no instruction changes)') + '</pre>' +
            '<div style="display:flex;gap:8px;margin-top:8px"><button class="btn dark" data-cwapprove="' + esc(p.id) + '">Approve</button><button class="btn ghost" data-cwreject="' + esc(p.id) + '">Reject</button></div>' +
            '</div>';
        }).join('');
        $('cwPendingBody').querySelectorAll('[data-cwapprove]').forEach(function (btn) {
          btn.onclick = function () {
            var id = this.getAttribute('data-cwapprove');
            api('/api/cowork/skills/pending/' + encodeURIComponent(id) + '/approve', { method: 'POST' })
              .then(function (r) { toast(r.skill ? 'Skill "' + r.skill.name + '" saved' : 'Skill approved'); renderSettings(); })
              .catch(function (e) { toast(e.message, true); });
          };
        });
        $('cwPendingBody').querySelectorAll('[data-cwreject]').forEach(function (b) {
          b.onclick = function () {
            api('/api/cowork/skills/pending/' + encodeURIComponent(this.getAttribute('data-cwreject')) + '/reject', { method: 'POST' })
              .then(function () { toast('Change rejected'); renderSettings(); })
              .catch(function (e) { toast(e.message, true); });
          };
        });
      }).catch(function () {});
      $('cwSetProfileSave').onclick = function () {
        var btn = this;
        btn.disabled = true; btn.textContent = 'Saving…';
        api('/api/cowork/profile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: $('cwSetName').value, about: $('cwSetAbout').value, preferences: $('cwSetPrefs').value }) })
          .then(function () { toast('Team context saved'); })
          .catch(function (e) { toast(e.message, true); })
          .finally(function () { btn.disabled = false; btn.textContent = 'Save'; });
      };
    } else if (S.setSection === 'developer') {
      b.innerHTML = '<h1>Developer</h1>' +
        '<div class="setcard">' +
        '<div class="setrow"><div class="grow"><div class="t">Show agent diagnostics</div>' +
        '<div class="d">Renders the raw agent protocol in the timeline: model protocol repairs, recovery ladders, malformed-reply streaks, internal activity (checkpoints, diff snapshots), full token telemetry, and internal events that are hidden by default. Normal users should leave this off.</div></div>' +
        '<label style="display:flex;align-items:center;gap:8px;flex:none"><input type="checkbox" id="gDevMode" ' + (S.settings.devMode ? 'checked' : '') + ' style="width:18px;height:18px"><span style="font-size:12.5px">' + (S.settings.devMode ? 'on' : 'off') + '</span></label></div>' +
        '</div>';
      $('gDevMode').onchange = function () {
        S.settings.devMode = $('gDevMode').checked;
        persist();
        renderSettings();
      };
    } else if (S.setSection === 'connections') {
      b.innerHTML = '<h1>Connections</h1><p class="connection-intro">Apps, accounts and APIs in one place. Choose team access for connected accounts; grant company access from its resource settings.</p><nav class="connection-manager-tabs" aria-label="Connection categories"><button class="btn ghost" data-connection-category="apps" aria-pressed="true">Apps & accounts</button><button class="btn ghost" data-connection-category="apis" aria-pressed="false">Custom APIs</button></nav><section id="workspaceAppsPanel"></section><section id="workspaceApiPanel" hidden><div class="connection-api-heading"><div><h2>Custom APIs</h2><p class="connection-intro">Connect a service with its own API key or access token.</p></div><button class="btn dark" id="workspaceAddApi">Add connection</button></div><div id="connectionsBody"><p role="status">Loading saved APIs…</p></div><div id="workspaceConnectionForm"></div></section>';
      cwMountConnections($('workspaceAppsPanel'));
      b.querySelectorAll('[data-connection-category]').forEach(function(button){button.onclick=function(){var apps=button.dataset.connectionCategory==='apps';$('workspaceAppsPanel').hidden=!apps;$('workspaceApiPanel').hidden=apps;b.querySelectorAll('[data-connection-category]').forEach(function(tab){tab.setAttribute('aria-pressed',String(tab===button));});};});
      $('workspaceAddApi').onclick=function(){mountCustomConnection($('workspaceConnectionForm'),{onSaved:function(){renderConnections();},onCancel:function(){$('workspaceConnectionForm').innerHTML='';}});};
      function renderConnections() {
        api('/api/connections').then(function (data) {
          var body = $('connectionsBody');
          if (!body || S.setSection !== 'connections') return;
          var rows = data.connections || [];
          body.innerHTML = rows.map(function (c) {
            var capabilities = (c.capabilities || []).join(', ') || 'no declared capabilities';
            var status = c.lastValidationStatus === 'ok' ? '<span class="chip ok">validated</span>' : c.lastValidationStatus === 'failed' ? '<span class="chip bad">validation failed</span>' : '<span class="chip">not tested</span>';
            return '<div class="setrow" style="align-items:flex-start"><div class="grow"><div class="t">' + esc(c.label) + ' ' + status + '</div><div class="d">' + esc(c.provider) + ' · ' + esc(capabilities) + '</div><div class="hint">' + esc(c.baseUrl) + (c.documentationUrl ? ' · docs configured' : '') + ' · credential ' + (c.hasCredential ? 'saved locally' : 'missing') + '</div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost" data-editconn="' + esc(c.id) + '">Edit</button><button class="btn ghost" data-testconn="' + esc(c.id) + '">Test</button><button class="btn ghost" data-delconn="' + esc(c.id) + '">Remove</button></div></div>';
          }).join('') || '<div class="meta">No saved connections yet.</div>';
          body.querySelectorAll('[data-editconn]').forEach(function(btn){btn.onclick=function(){mountCustomConnection($('workspaceConnectionForm'),{profile:rows.find(function(c){return c.id===btn.dataset.editconn;}),onSaved:function(){renderConnections();}});};});
          body.querySelectorAll('[data-testconn]').forEach(function (btn) {
            btn.onclick = function () {
              var id = btn.getAttribute('data-testconn'); btn.disabled = true; btn.textContent = 'Testing…';
              api('/api/connections/' + encodeURIComponent(id) + '/test', { method: 'POST' }).then(function () { toast('Connection validated'); renderConnections(); }).catch(function (e) { toast((e && e.message) || 'Connection failed', true); }).finally(function () { btn.disabled = false; btn.textContent = 'Test'; });
            };
          });
          body.querySelectorAll('[data-delconn]').forEach(function (btn) {
            btn.onclick = function () {
              var id = btn.getAttribute('data-delconn');
              if (!window.confirm('Remove this connection, its local credential, and its generated global skill?')) return;
              api('/api/connections/' + encodeURIComponent(id), { method: 'DELETE' }).then(function () { toast('Connection removed'); renderConnections(); }).catch(function (e) { toast((e && e.message) || 'Could not remove connection', true); });
            };
          });
        }).catch(function (e) { if ($('connectionsBody')) $('connectionsBody').innerHTML = '<div class="meta">Could not load connections: ' + esc((e && e.message) || 'unknown error') + '</div>'; });
      }
      renderConnections();
    } else if (S.setSection === 'providers') {
      b.innerHTML = '<h1>Providers</h1>' +
        '<p style="color:var(--muted);font-size:12.5px">Connect a provider, then choose the default model used for new tasks.</p>' +
        '<div class="setcard" style="margin-bottom:10px"><div class="setrow"><div class="grow"><div class="t">Bring your own compatible provider</div><div class="d">Add an OpenAI-compatible endpoint. Its key stays in Agent Gitu’s local key store; native tools safely downgrade when unsupported.</div></div><button class="btn dark" id="addCustomProvider">Add provider</button><button class="btn ghost" id="editFallbackModels">Fallback models</button></div></div>' +
        '<div class="provider-toolbar"><input type="text" id="providerFilter" placeholder="Filter providers…" aria-label="Filter providers"><span class="meta" id="providerSummary"></span></div>' +
        '<div class="setcard" id="provBody"><div class="meta">loading providers…</div></div>';
      var addCustomProvider = $('addCustomProvider');
      if (addCustomProvider) addCustomProvider.onclick = function () {
        var label = window.prompt('Provider name (for example: Team gateway)');
        if (!label) return;
        var slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
        if (!slug) { toast('Use a name with letters or numbers', true); return; }
        var baseUrl = window.prompt('OpenAI-compatible base URL (HTTPS, or HTTP only for localhost)');
        if (!baseUrl) return;
        var defaultModel = window.prompt('Default model ID');
        if (!defaultModel) return;
        var keyEnvVar = 'HERMES_CUSTOM_' + slug.toUpperCase().replace(/-/g, '_');
        var toolMode = window.prompt('Tool mode: auto, native, structured_text, or text', 'auto') || 'auto';
        var profile = { id: 'custom-' + slug, label: label, baseUrl: baseUrl, defaultModel: defaultModel, keyEnvVar: keyEnvVar, toolMode: toolMode };
        api('/api/provider-profiles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profile) })
          .then(function () {
            var key = window.prompt('Paste an API key now (optional — you can add it from the provider row)');
            if (!key) { toast('Custom provider saved'); refreshModels(); return null; }
            return api('/api/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ envVar: keyEnvVar, key: key }) });
          })
          .then(function () { refreshModels(); })
          .catch(function (e) { toast((e && e.message) || 'Could not save provider', true); });
      };
      var editFallbackModels = $('editFallbackModels');
      if (editFallbackModels) editFallbackModels.onclick = function () {
        api('/api/model-fallbacks').then(function (data) {
          var current = (data.fallbackModels || []).join(', ');
          var raw = window.prompt('Fallbacks in priority order, comma-separated (provider::model). Cross-provider fallbacks run only when listed here.', current);
          if (raw === null) return;
          var fallbackModels = raw.split(',').map(function (v) { return v.trim(); }).filter(Boolean);
          return api('/api/model-fallbacks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fallbackModels: fallbackModels }) })
            .then(function () { toast('Fallback models saved'); });
        }).catch(function (e) { toast((e && e.message) || 'Could not save fallbacks', true); });
      };
      Promise.all([loadModelCatalog(), api('/api/keys').catch(function () { return { stored: [] }; })]).then(function (res) {
        var stored = (res[1] && res[1].stored) || [];
        var body = $('provBody');
        if (!body || S.setSection !== 'providers') return;
        var cur = S.sel.model || '';
        var prov = S.models.slice().sort(function (a, b) { return Number(providerIsUsable(b)) - Number(providerIsUsable(a)); });
        var readyCount = prov.filter(providerIsUsable).length;
        if ($('providerSummary')) $('providerSummary').textContent = readyCount + ' ready · ' + (prov.length - readyCount) + ' need setup';
        body.innerHTML = prov.map(function (p, i) {
          var storedVar = (p.keyEnvVars || []).filter(function (v) { return stored.indexOf(v) >= 0; })[0];
          var usable = providerIsUsable(p);
          var keyChip = p.hasKey ? '<span class="chip ok">key ready</span>' : '<span class="chip bad">needs key</span>';
          var storedChip = storedVar ? '<span class="chip">stored</span>' : '';
          var liveChip = p.live ? '<span class="chip">live</span>' : '';
          var models = p.models || [];
          var selInProv = cur.indexOf(p.id + '::') === 0 ? cur.split('::')[1] : '';
          var activeChip = selInProv ? '<span class="chip ok">active</span>' : '';
          var btnModel = titleCase(selInProv || p.defaultModel);
          if (p.auth === 'chatgpt-subscription') {
            // Codex owns this credential; Agent Gitu only receives safe
            // signed-in / plan state and never sees a token or email address.
            keyChip = usable
              ? '<span class="chip ok">signed in' + (p.planType ? ' · ' + esc(p.planType) : '') + '</span>'
              : '<span class="chip bad">' + (p.available === false ? 'Codex unavailable' : 'not signed in') + '</span>';
          }
          var setupLabel = p.auth === 'chatgpt-subscription' ? 'Sign in first' : 'Add key first';
          var modelTitle = usable ? 'Search ' + esc(p.label) + ' models' : setupLabel;
          var manageTitle = p.auth === 'chatgpt-subscription' ? 'manage ChatGPT sign-in' : (storedVar || p.hasKey ? 'manage' : 'add') + ' the API key';
          return '<div class="setrow" data-provider-row="' + esc((p.label + ' ' + p.id).toLowerCase()) + '" style="align-items:flex-start"><div class="grow">' +
            '<div class="prov-head" data-provhead="' + i + '" role="button" tabindex="0" aria-expanded="false" title="Tap to ' + manageTitle + '">' +
              '<span class="prov-chev">&#9654;</span>' +
              '<div><div class="t">' + esc(p.label) + ' <span class="meta">(' + esc(p.id) + ')</span> ' + keyChip + storedChip + ' ' + liveChip + activeChip + '</div>' +
              '<div class="d">' + models.length + ' models' + (p.keyEnvVars && !p.hasKey ? ' · env: ' + esc(p.keyEnvVars.join(' | ')) : '') + '</div></div>' +
            '</div>' +
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:4px">' +
              '<div class="pm-wrap" data-pmwrap="' + i + '">' +
                '<button type="button" class="pm-btn" data-pmbtn="' + i + '" title="' + modelTitle + '"' + (usable ? '' : ' disabled') + '>' +
                  '<span class="pm-name">' + esc(usable ? btnModel : setupLabel) + '</span>' +
                  '<span class="caret">&#9660;</span>' +
                '</button>' +
                '<div class="model-menu pm-menu" hidden><input type="text" placeholder="Search models…"><div class="model-list"></div><div class="model-count"></div></div>' +
              '</div>' +
            '</div>' +
            '<div class="keysec">' +
              (p.auth === 'chatgpt-subscription'
                ? (usable
                    ? '<div class="hint">Connected through local Codex' + (p.planType ? ' (' + esc(p.planType) + ')' : '') + '. Your ChatGPT credentials remain in Codex.</div>'
                    : '<button type="button" class="btn dark" id="chatgptSignin">Sign in with ChatGPT</button>' +
                      '<div class="hint">Opens the secure Codex sign-in flow. It uses the models included with your ChatGPT plan instead of an API key.</div>')
                : '<input type="password" id="keyin-' + i + '" placeholder="paste ' + esc(p.id) + ' API key"' + (p.keyEnvVars && p.keyEnvVars.length ? ' title="stored locally as env var ' + esc(p.keyEnvVars.join(' or ')) + '"' : '') + ' style="margin:0;max-width:280px">' +
                  '<button class="btn dark" data-savekey="' + i + '">Save key</button>' +
                  '<button class="btn ghost" data-eye="' + i + '" title="show or hide the key">Show</button>' +
                  (storedVar ? '<button class="btn ghost" data-delkey="' + esc(storedVar) + '">Remove stored key</button>' : '') +
                  (p.custom ? '<button class="btn ghost" data-testprofile="' + esc(p.id) + '" data-profilemodel="' + esc(p.defaultModel) + '">Test connection</button><button class="btn ghost" data-deleteprofile="' + esc(p.id) + '">Remove provider</button>' : '') +
                  (p.keyEnvVars && p.keyEnvVars.length ? '<div class="hint">stored locally as env var ' + esc(p.keyEnvVars.join(' or ')) + '</div>' : '')) +
            '</div>' +
            '</div></div>';
        }).join('') || '<div class="meta">no providers available</div>';
        var cgSignin = $('chatgptSignin');
        if (cgSignin) cgSignin.onclick = function () {
          cgSignin.disabled = true;
          cgSignin.textContent = 'Opening sign-in…';
          api('/api/chatgpt/login', { method: 'POST' }).then(function (r) {
            if (r && r.alreadySignedIn) { renderSettings(); return; }
            cgSignin.textContent = 'Waiting for sign-in…';
            showChatgptSignIn(cgSignin.parentElement, r, {
              onConnected: function () { toast('ChatGPT connected'); renderSettings(); },
              onEnded: function () { cgSignin.disabled = false; cgSignin.textContent = 'Sign in with ChatGPT'; },
              onRetry: function () { cgSignin.click(); }
            });
          }).catch(function (e) {
            cgSignin.disabled = false;
            cgSignin.textContent = 'Sign in with ChatGPT';
            toast('ChatGPT sign-in failed: ' + ((e && e.message) || e), true);
          });
        };
        body.querySelectorAll('[data-testprofile]').forEach(function (btn) {
          btn.onclick = function () {
            var id = btn.getAttribute('data-testprofile');
            var model = btn.getAttribute('data-profilemodel');
            btn.disabled = true;
            btn.textContent = 'Testing…';
            api('/api/provider-profiles/' + encodeURIComponent(id) + '/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: model }) })
              .then(function () { toast('Connection successful'); })
              .catch(function (e) { toast((e && e.message) || 'Connection failed', true); })
              .finally(function () { btn.disabled = false; btn.textContent = 'Test connection'; });
          };
        });
        body.querySelectorAll('[data-deleteprofile]').forEach(function (btn) {
          btn.onclick = function () {
            var id = btn.getAttribute('data-deleteprofile');
            if (!window.confirm('Remove this provider profile? Its locally stored key is not deleted.')) return;
            api('/api/provider-profiles/' + encodeURIComponent(id), { method: 'DELETE' })
              .then(function () { toast('Provider removed'); refreshModels(); })
              .catch(function (e) { toast((e && e.message) || 'Could not remove provider', true); });
          };
        });
        var providerFilter = $('providerFilter');
        if (providerFilter) providerFilter.oninput = function () {
          var q = providerFilter.value.toLowerCase().trim();
          body.querySelectorAll('[data-provider-row]').forEach(function (row) {
            row.hidden = Boolean(q && row.getAttribute('data-provider-row').indexOf(q) < 0);
          });
        };
        function closeAllPm(except) {
          body.querySelectorAll('.pm-wrap.open').forEach(function (w) {
            if (w === except) return;
            w.classList.remove('open');
            var m = w.querySelector('.model-menu');
            if (m) m.hidden = true;
          });
        }
        function pmRender(wrap) {
          var p = prov[Number(wrap.getAttribute('data-pmwrap'))];
          if (!p) return;
          var q = (wrap.querySelector('.model-menu input').value || '').toLowerCase().trim();
          var list = wrap.querySelector('.model-list');
          var curVal = S.sel.model || '';
          var group = catalogModelGroups(p.id, q)[0];
          var matched = group ? group.models : [];
          var count = wrap.querySelector('.model-count');
          if (count) count.textContent = matched.length + (matched.length === 1 ? ' model' : ' models') + (q ? (matched.length === 1 ? ' matches' : ' match') : '');
          list.innerHTML = matched.map(function (m) {
            var val = p.id + '::' + m.id;
            return '<button type="button" class="model-item' + (val === curVal ? ' cur' : '') + '" data-val="' + esc(val) + '" role="option" aria-selected="' + (val === curVal ? 'true' : 'false') + '">' +
              '<div class="mi-top"><span class="mi-prov">' + (m.free ? 'free · no credits needed' : '') + '</span>' +
              '<span class="mi-meta">' + esc(modelMetaText(m)) + '</span>' +
              (val === curVal ? '<span class="mi-cur" title="current default">&#10003;</span>' : '') + '</div>' +
              '<div class="mi-name">' + modelBrandHtml(val,m) + markMatch(titleCase(m.id), q) + (m.vision ? ' <i class="vmark" title="supports images">&#9672;</i>' : '') + '</div>' +
              '</button>';
          }).join('') || '<div class="model-empty">No models match &ldquo;' + esc(q) + '&rdquo;<br><span style="font-size:11px">Try a model name</span></div>';
          var hl = list.querySelector('.model-item');
          if (hl) hl.classList.add('hl');
        }
        function pickProvModel(val) {
          S.sel.model = val;
          persist();
          toast('Default model: ' + modelLabelText(val));
          closeAllPm();
          renderSettings();
        }
        body.querySelectorAll('[data-pmbtn]').forEach(function (btn) {
          btn.onclick = function (e) {
            e.stopPropagation();
            var wrap = btn.closest('.pm-wrap');
            var menu = wrap.querySelector('.model-menu');
            var opening = menu.hidden;
            closeAllPm(wrap);
            if (!opening) return;
            wrap.classList.add('open');
            menu.hidden = false;
            var inp = menu.querySelector('input');
            inp.value = '';
            pmRender(wrap);
            setTimeout(function () { inp.focus(); }, 0);
          };
        });
        body.querySelectorAll('[data-pmwrap]').forEach(function (wrap) {
          var inp = wrap.querySelector('.model-menu input');
          inp.oninput = function () { pmRender(wrap); };
          inp.onkeydown = function (e) {
            var items = wrap.querySelectorAll('.model-item');
            if (e.key === 'Enter') {
              var hl = wrap.querySelector('.model-item.hl') || items[0];
              if (hl) pickProvModel(hl.getAttribute('data-val'));
              e.preventDefault();
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              // A filtered-empty list has no rows to highlight — navigating
              // must not crash on items[-1].
              if (!items.length) { e.preventDefault(); return; }
              var dir = e.key === 'ArrowDown' ? 1 : -1;
              var at = -1;
              for (var k = 0; k < items.length; k++) if (items[k].classList.contains('hl')) { at = k; break; }
              var next = at < 0 ? (dir > 0 ? 0 : items.length - 1) : (at + dir + items.length) % items.length;
              if (at >= 0) items[at].classList.remove('hl');
              items[next].classList.add('hl');
              if (items[next].scrollIntoView) items[next].scrollIntoView({ block: 'nearest' });
              e.preventDefault();
            } else if (e.key === 'Escape') {
              closeAllPm();
            }
            e.stopPropagation();
          };
          wrap.querySelector('.model-list').onmousedown = function (e) {
            var item = e.target.closest ? e.target.closest('.model-item') : null;
            if (item) { e.preventDefault(); pickProvModel(item.getAttribute('data-val')); }
          };
        });
        body.querySelectorAll('[data-provhead]').forEach(function (head) {
          head.onclick = function () {
            var idx = Number(head.getAttribute('data-provhead'));
            var row = head.closest('.setrow');
            var wasOpen = row.classList.contains('prov-open');
            body.querySelectorAll('.setrow').forEach(function (r) {
              r.classList.remove('prov-open');
              var ph = r.querySelector('[data-provhead]');
              if (ph) ph.setAttribute('aria-expanded', 'false');
              var ks = r.querySelector('.keysec');
              if (ks) ks.classList.remove('show');
            });
            if (!wasOpen) {
              row.classList.add('prov-open');
              head.setAttribute('aria-expanded', 'true');
              S.provOpen = idx;
              var ks = row.querySelector('.keysec');
              if (ks) ks.classList.add('show');
              var pin = ks ? ks.querySelector('input[type=password]') : null;
              if (pin) setTimeout(function () { pin.focus(); }, 0);
            } else S.provOpen = null;
          };
          head.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); head.click(); } };
        });
        if (typeof S.provOpen === 'number') {
          var orow = body.querySelectorAll('.setrow')[S.provOpen];
          if (orow && orow.querySelector('[data-provhead]')) {
            orow.classList.add('prov-open');
            orow.querySelector('[data-provhead]').setAttribute('aria-expanded', 'true');
            var oks = orow.querySelector('.keysec');
            if (oks) oks.classList.add('show');
          } else S.provOpen = null;
        }
        if (!S.provDocBound) {
          S.provDocBound = true;
          document.addEventListener('click', function (e) {
            var b2 = document.getElementById('provBody');
            if (!b2 || !b2.isConnected) return;
            if (e.target.closest && e.target.closest('.pm-wrap')) return;
            b2.querySelectorAll('.pm-wrap.open').forEach(function (w) {
              w.classList.remove('open');
              var m = w.querySelector('.model-menu');
              if (m) m.hidden = true;
            });
          });
        }
        body.querySelectorAll('[data-savekey]').forEach(function (btn) {
          btn.onclick = function () {
            var i = Number(btn.getAttribute('data-savekey'));
            var p = prov[i];
            var input = $('keyin-' + i);
            var key = input ? input.value.trim() : '';
            if (!p || !key) { toast('Paste an API key first', true); return; }
            var envVar = (p.keyEnvVars || [])[0];
            S.provOpen = i;
            api('/api/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ envVar: envVar, key: key }) })
              .then(function () { toast('Key saved for ' + p.id); refreshModels(); })
              .catch(function (e) { toast(e.message, true); });
          };
        });
        body.querySelectorAll('[data-eye]').forEach(function (btn) {
          btn.onclick = function () {
            var i = Number(btn.getAttribute('data-eye'));
            var inp = $('keyin-' + i);
            if (!inp) return;
            var show = inp.type === 'password';
            inp.type = show ? 'text' : 'password';
            btn.textContent = show ? 'Hide' : 'Show';
          };
        });
        body.querySelectorAll('[data-delkey]').forEach(function (btn) {
          btn.onclick = function () {
            var v = btn.getAttribute('data-delkey');
            var head = btn.closest('.setrow') ? btn.closest('.setrow').querySelector('[data-provhead]') : null;
            if (head) S.provOpen = Number(head.getAttribute('data-provhead'));
            api('/api/keys/' + v, { method: 'DELETE' })
              .then(function () { toast('Removed ' + v); refreshModels(); })
              .catch(function (e) { toast(e.message, true); });
          };
        });
      }).catch(function () {
        var body = $('provBody');
        if (body) body.innerHTML = '<div class="meta">failed to load providers</div>';
      });
    } else if (S.setSection === 'permissions') {
      b.innerHTML = '<h1>Permissions</h1>' +
        '<div class="setcard">' +
        '<div class="setrow"><div class="grow"><div class="t">Auto-learn reusable skills</div><div class="d">After a successful task the agent reflects on what it did and saves any repeatable multi-step pattern (deploy flows, design conventions, checklists) as a skill with create_skill. Turn off to stop all proactive skill creation.</div></div><button class="toggle ' + (S.settings.autoLearn ? 'on' : '') + '" id="pLearn"></button></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Cowork learning mode</div><div class="d">When your cowork teammates learn from their work. <b>On each task</b> reflects after every completed turn (the original behavior). <b>Scheduled review</b> keeps ordinary turns quiet and reflects on a timer instead, plus a daily memory consolidation sweep. <b>Off</b> stops cowork learning entirely.</div></div><select id="pCwLearn"><option value="reactive">On each task (original)</option><option value="proactive">Scheduled review</option><option value="off">Off</option></select></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Plan review</div><div class="d">In Plan mode the agent waits for your approval before building.</div></div><button class="toggle ' + (S.settings.review ? 'on' : '') + '" id="pReview"></button></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Full coding access</div><div class="d">Run coding tasks without approval cards, including tasks sent by P.A. Shared across desktop, mobile and hosted sessions.</div></div><button class="toggle ' + (S.settings.autoApprove ? 'on' : '') + '" id="pAuto" aria-label="Full coding access"></button></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Loop prevention</div><div class="d">Repeated failing actions are blocked automatically. Always on.</div></div><button class="toggle on" disabled></button></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Evidence gate</div><div class="d">Tasks cannot complete without passing evidence for every criterion. Always on.</div></div><button class="toggle on" disabled></button></div>' +
        '</div>';
      $('pLearn').onclick = function () { S.settings.autoLearn = !S.settings.autoLearn; persist(); renderSettings(); };
      $('pReview').onclick = function () { S.settings.review = !S.settings.review; persist(); renderSettings(); };
      $('pAuto').onclick = function () { var button = this, next = !S.settings.autoApprove; button.disabled = true; api('/api/coding-permissions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ access: next ? 'full' : 'ask' }) }).then(function (saved) { S.settings.autoApprove = saved.access === 'full'; persist(); renderSettings(); }).catch(function (error) { toast(error.message, true); button.disabled = false; }); };
      var cwLearn = $('pCwLearn');
      if (cwLearn) {
        if (['reactive', 'proactive', 'off'].indexOf(S.settings.cwLearn) < 0) S.settings.cwLearn = 'reactive';
        cwLearn.value = S.settings.cwLearn;
        // The server is authoritative (the loop also runs when this UI is closed).
        api('/api/cowork/learning').then(function (r) {
          if (!r || ['reactive', 'proactive', 'off'].indexOf(r.mode) < 0) return;
          S.settings.cwLearn = r.mode; persist();
          if ($('pCwLearn')) $('pCwLearn').value = r.mode;
        }).catch(function () {});
        cwLearn.onchange = function () {
          var mode = this.value;
          var label = mode === 'proactive' ? 'Scheduled review' : mode === 'off' ? 'Off' : 'On each task';
          S.settings.cwLearn = mode;
          persist();
          api('/api/cowork/learning', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: mode }) })
            .then(function (r) {
              S.settings.cwLearn = (r && r.mode) || mode;
              persist();
              toast('Cowork learning: ' + label);
              renderSettings();
            })
            .catch(function (e) { toast(e.message, true); });
        };
      }
    } else if (S.setSection === 'workspace') {
      Promise.all([api('/api/files'), api('/api/home')]).then(function (res) {
        var files = res[0].files || [];
        var home = res[1];
        var sel = S.settings.scope || [];
        b.innerHTML = '<h1>Workspace</h1>' +
          '<div class="setcard"><div class="setrow"><div class="grow"><div class="t">Agent Gitu home</div><div class="d" style="font-family:var(--mono)">' + esc(home.root) + '</div></div></div>' +
          '<div class="setrow"><div class="grow"><div class="t">Projects folder</div><div class="d">Where "New project" creates folders. Defaults to &lt;home&gt;/Projects.</div></div></div>' +
          '<div class="setlist"><input type="text" id="wsProjects" value="' + esc(home.projectsPath) + '" placeholder="' + esc(home.projects) + '">' +
          '<div class="row"><button class="btn dark" id="wsProjectsSave">Save projects folder</button><button class="btn ghost" id="wsProjectsReset">Reset to default</button></div></div></div>' +
          '<h2>File scope</h2>' +
          '<p style="color:var(--muted);font-size:12.5px">Choose which files Agent Gitu should work on. The agent is instructed to stay inside this selection. Leave empty to allow the whole project.</p>' +
          '<div class="setcard"><div class="setlist" style="max-height:300px;overflow-y:auto">' +
          (files.map(function (f) {
            return '<div class="row"><label style="display:flex;gap:8px;align-items:center;font-family:var(--mono);font-size:11.5px"><input type="checkbox" data-f="' + esc(f) + '"' + (sel.indexOf(f) >= 0 ? ' checked' : '') + ' style="width:auto;margin:0">' + esc(f) + '</label></div>';
          }).join('') || '<div class="meta">no files found</div>') +
          '</div></div>' +
          '<h2>Constraints</h2><div class="setcard"><div class="setlist">' +
          '<textarea id="wsCons" rows="3" placeholder="Extra rules, one per line (e.g. Do not touch the billing module)">' + esc(S.settings.constraints || '') + '</textarea>' +
          '<div class="row"><button class="btn dark" id="wsSave">Save workspace</button><button class="btn ghost" id="wsClear">Clear selection</button></div></div></div>';
        $('wsSave').onclick = function () {
          var chosen = [];
          b.querySelectorAll('input[data-f]').forEach(function (cb) { if (cb.checked) chosen.push(cb.getAttribute('data-f')); });
          S.settings.scope = chosen;
          S.settings.constraints = $('wsCons').value;
          persist();
          toast('Workspace saved — ' + chosen.length + ' file(s) in scope');
        };
        $('wsClear').onclick = function () { S.settings.scope = []; persist(); renderSettings(); };
        $('wsProjectsSave').onclick = function () {
          api('/api/home/workspace', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectsPath: $('wsProjects').value.trim() }) })
            .then(function (d) { toast('Projects folder: ' + d.projectsPath); renderSettings(); })
            .catch(function (e) { toast(e.message, true); });
        };
        $('wsProjectsReset').onclick = function () {
          api('/api/home/workspace', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectsPath: '' }) })
            .then(function () { toast('Projects folder reset to default'); renderSettings(); })
            .catch(function (e) { toast(e.message, true); });
        };
      });
    } else if (S.setSection === 'project') {
      b.innerHTML = '<h1>Project</h1>' +
        '<div class="setcard"><div class="setrow"><div class="grow"><div class="t">Active project path</div><div class="d">Each project has its own chats, skills, MCP servers and cron jobs.</div></div></div>' +
        '<div class="setlist"><input type="text" id="prPath" value="' + esc(effectiveProjectPath()) + '" placeholder="C:\\path\\to\\project">' +
        '<div class="row"><button class="btn dark" id="prSave">Save project</button><button class="btn ghost" id="prBrowse">Browse folders…</button></div></div></div>';
      $('prBrowse').onclick = openFolderBrowser;
      $('prSave').onclick = function () {
        S.settings.projectPath = $('prPath').value.trim();
        persist();
        updateProjChip();
        renderSidebar();
      };
    } else if (S.setSection === 'agents') {
      Promise.all([api('/api/agents'), loadModelCatalog()]).then(function (res) {
        var agents = res[0].agents || [];
        if (S.setSection !== 'agents') return;
        function modelOptions(sel) {
          return '<option value="">(default model)</option>' + catalogSelectOptions(undefined, sel);
        }
        b.innerHTML = '<h1>Specialist agents</h1>' +
          '<p style="color:var(--muted);font-size:12.5px">Named worker agents that the main agent can run in parallel with the delegate tool on big projects. The main agent uses the <b>Agent ID / Name</b> to delegate tasks. Each agent can use a different provider, model, and reasoning effort.</p>' +
          '<div style="margin:12px 0"><button class="btn dark" id="agNew">+ New agent</button></div>' +
          '<div class="setcard" id="agForm" hidden><div class="setlist">' +
          '<div><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Agent Name / Identifier (used by delegate):</label>' +
          '<input id="agName" placeholder="e.g. explore, frontend, tester, researcher"></div>' +
          '<div class="row"><div style="flex:1"><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Model & Provider:</label>' +
          '<select id="agModel" style="width:100%">' + modelOptions('') + '</select></div>' +
          '<div><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Effort:</label>' +
          '<select id="agEffort"><option value="">effort: default</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="max">max</option></select></div></div>' +
          '<div><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Role & Specialty Instructions:</label>' +
          '<textarea id="agRole" rows="3" placeholder="e.g. You are a repository exploration specialist: trace code paths, identify symbols, discover references…"></textarea></div>' +
          '<div class="row"><button class="btn dark" id="agSave">Save agent</button><button class="btn ghost" id="agCancel">Cancel</button><span class="meta" id="agMeta"></span></div></div></div>' +
          '<div class="setcard">' +
          (agents.length ? agents.map(function (a) {
            return '<div class="skcard"><div class="skhead"><b style="font-size:14px">' + esc(a.name) + '</b>' +
              '<span class="chip" style="background:var(--selected);color:var(--text);font-weight:600;font-size:11px">SPECIALIST</span>' +
              '<span style="flex:1"></span>' +
              '<button class="ubtn" data-agedit="' + esc(a.id) + '" title="edit">' + icon('pencil') + '</button>' +
              '<button class="ubtn" data-agdel="' + esc(a.id) + '" title="delete">' + icon('x') + '</button></div>' +
              '<div style="display:flex;gap:12px;align-items:center;margin:6px 0 4px;font-size:12px;flex-wrap:wrap">' +
              '<span><b>Agent ID:</b> <code style="font-family:var(--mono);background:var(--card2);border:1px solid var(--border);padding:2px 6px;border-radius:4px;color:var(--text);font-weight:600">' + esc(a.name) + '</code></span>' +
              '<span><b>Model:</b> <code style="font-family:var(--mono);background:var(--card2);border:1px solid var(--border);padding:2px 6px;border-radius:4px;color:var(--muted)">' + esc(a.provider ? a.provider + '/' : '') + esc(a.model || 'default') + '</code></span>' +
              (a.effort ? '<span class="chip">' + esc(a.effort) + '</span>' : '') +
              '</div>' +
              '<div class="skdesc" style="margin-top:4px">' + esc(a.role) + '</div></div>';
          }).join('') : '<div class="setlist"><div class="meta">no agents yet — create one and the main agent will start delegating independent sub-tasks to it.</div></div>') +
          '</div>';
        var form = $('agForm');
        $('agNew').onclick = function () {
          form.hidden = false;
          $('agName').value = ''; $('agRole').value = ''; $('agModel').value = ''; $('agEffort').value = ''; $('agMeta').textContent = '';
        };
        $('agCancel').onclick = function () { form.hidden = true; };
        $('agSave').onclick = function () {
          var mv = ($('agModel').value || '').split('::');
          var payload = {
            id: S.agEditing || undefined,
            name: $('agName').value,
            role: $('agRole').value,
            provider: mv[0] || undefined,
            model: mv[1] || undefined,
            effort: $('agEffort').value || undefined
          };
          api('/api/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
            .then(function () { S.agEditing = null; toast('Agent saved'); renderSettings(); })
            .catch(function (e) { toast(e.message, true); });
        };
        b.querySelectorAll('[data-agedit]').forEach(function (el) {
          el.onclick = function () {
            var a = agents.filter(function (x) { return x.id === el.getAttribute('data-agedit'); })[0];
            if (!a) return;
            form.hidden = false;
            S.agEditing = a.id;
            $('agName').value = a.name;
            $('agRole').value = a.role;
            $('agEffort').value = a.effort || '';
            $('agModel').value = a.provider && a.model ? a.provider + '::' + a.model : (a.model || '');
            $('agMeta').textContent = 'editing ' + a.name;
          };
        });
        b.querySelectorAll('[data-agdel]').forEach(function (el) {
          el.onclick = function () {
            var id = el.getAttribute('data-agdel');
            var a = agents.filter(function (x) { return x.id === id; })[0];
            if (!confirm('Delete agent "' + (a ? a.name : id) + '"?')) return;
            api('/api/agents/' + id, { method: 'DELETE' }).then(function () { toast('Agent deleted'); renderSettings(); }).catch(function (e) { toast(e.message, true); });
          };
        });
      });
    } else if (S.setSection === 'skills') {
      api('/api/skills').then(function (d) {
        var all = d.skills || [];
        var q = (S.skillQuery || '').toLowerCase();
        var skills = all.filter(function (sk) { return !q || sk.name.indexOf(q) >= 0 || (sk.description || '').toLowerCase().indexOf(q) >= 0; });
        b.innerHTML = '<h1>Skills</h1>' +
          '<p style="color:var(--muted);font-size:12.5px">Reusable step-by-step knowledge. The agent applies them with use_skill and learns new ones with create_skill.</p>' +
          '<div style="display:flex;gap:8px;margin:12px 0"><input type="text" id="skSearch" placeholder="Search skills…" value="' + esc(S.skillQuery || '') + '" style="flex:1">' +
          '<button class="btn dark" id="skNew">+ New skill</button></div>' +
          '<div class="setcard" id="skFormCard" hidden style="margin-bottom:12px"><div class="setlist">' +
          '<input id="skName" placeholder="skill name (e.g. deploy-checklist)">' +
          '<input id="skDesc" placeholder="short description (shown to the agent)">' +
          '<textarea id="skInstr" rows="6" placeholder="step-by-step instructions"></textarea>' +
          '<label style="display:flex;gap:7px;align-items:center;font-size:12px;color:var(--muted);cursor:pointer"><input type="checkbox" id="skGlobal"> Available in every project (global)</label>' +
          '<div class="row"><button class="btn dark" id="skSave">Save skill</button><button class="btn ghost" id="skCancel">Cancel</button><span class="meta" id="skEditMeta"></span></div></div></div>' +
          '<div class="setcard">' +
          (skills.length ? skills.map(function (sk) {
            return '<div class="skcard">' +
              '<div class="skhead"><b>' + esc(sk.name) + '</b>' +
              (sk.scope === 'global' ? '<span class="chip ok" title="available in every project">global</span>' : '<span class="chip" title="only in this project">project</span>') +
              '<span class="chip ' + (sk.createdBy === 'agent' ? 'info' : '') + '">' + esc(sk.createdBy || 'agent') + '</span>' +
              '<span class="meta">' + esc((sk.createdAt || '').slice(0, 10)) + '</span>' +
              '<span style="flex:1"></span>' +
              '<button class="ubtn" data-skview="' + esc(sk.name) + '" title="view instructions">' + icon('layers') + '</button>' +
              '<button class="ubtn" data-skedit="' + esc(sk.name) + '" title="edit">' + icon('pencil') + '</button>' +
              '<button class="ubtn" data-skcopy="' + esc(sk.name) + '" title="copy instructions">' + icon('copy') + '</button>' +
              '<button class="ubtn" data-skdel="' + esc(sk.name) + '" title="delete">' + icon('x') + '</button></div>' +
              '<div class="skdesc">' + esc(sk.description || '(no description)') + '</div>' +
              '<pre class="skinstr" data-pre="' + esc(sk.name) + '" hidden>' + esc(sk.instructions || '') + '</pre>' +
              '</div>';
          }).join('') : '<div class="setlist"><div class="meta">no skills' + (q ? ' match "' + esc(q) + '"' : ' yet — the agent creates skills when it learns repeatable patterns') + '</div></div>') +
          '</div>';
        $('skSearch').oninput = function () {
          S.skillQuery = $('skSearch').value;
          renderSettings();
          setTimeout(function () { var el = $('skSearch'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 0);
        };
        var form = $('skFormCard');
        function openForm(skill) {
          form.hidden = false;
          $('skName').value = skill ? skill.name : '';
          $('skName').disabled = Boolean(skill);
          $('skDesc').value = skill ? skill.description : '';
          $('skInstr').value = skill ? skill.instructions : '';
          $('skEditMeta').textContent = skill ? 'editing ' + skill.name : '';
          S.skEditing = skill ? skill.name : null;
        }
        $('skNew').onclick = function () { openForm(null); };
        $('skCancel').onclick = function () { form.hidden = true; S.skEditing = null; };
        $('skSave').onclick = function () {
          var payload = { name: $('skName').value, description: $('skDesc').value, instructions: $('skInstr').value };
          var g = $('skGlobal');
          if (!S.skEditing && g && g.checked) payload['global'] = true;
          var url = S.skEditing ? '/api/skills/' + encodeURIComponent(S.skEditing) : '/api/skills';
          api(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
            .then(function () { S.skEditing = null; toast('Skill saved'); renderSettings(); })
            .catch(function (e) { toast(e.message, true); });
        };
        b.querySelectorAll('[data-skview]').forEach(function (el) {
          el.onclick = function () { var pre = b.querySelector('[data-pre="' + el.getAttribute('data-skview') + '"]'); if (pre) pre.hidden = !pre.hidden; };
        });
        b.querySelectorAll('[data-skedit]').forEach(function (el) {
          el.onclick = function () { openForm(all.filter(function (x) { return x.name === el.getAttribute('data-skedit'); })[0]); };
        });
        b.querySelectorAll('[data-skcopy]').forEach(function (el) {
          el.onclick = function () {
            var sk = all.filter(function (x) { return x.name === el.getAttribute('data-skcopy'); })[0];
            if (sk) navigator.clipboard.writeText(sk.instructions).then(function () { toast('Instructions copied'); }, function () { toast('Copy failed', true); });
          };
        });
        b.querySelectorAll('[data-skdel]').forEach(function (el) {
          el.onclick = function () {
            var name = el.getAttribute('data-skdel');
            if (!confirm('Delete skill "' + name + '"?')) return;
            api('/api/skills/' + encodeURIComponent(name), { method: 'DELETE' }).then(function () { toast('Skill deleted'); renderSettings(); }).catch(function (e) { toast(e.message, true); });
          };
        });
      });
    } else if (S.setSection === 'mcp') {
      api('/api/mcp').then(function (d) {
        b.innerHTML = '<h1>MCP servers</h1><p style="color:var(--muted);font-size:12.5px">External tool servers (filesystem, browser, databases…). Their tools require approval before running.</p>' +
          '<div class="setcard"><div class="setlist">' +
          (d.servers.length ? d.servers.map(function (sv) {
            var scope = d.scopes && d.scopes[sv.name];
            return '<div class="row"><span class="grow"><b>' + esc(sv.name) + '</b>' +
              (scope === 'global' ? ' <span class="chip ok" title="available in every project">global</span>' : ' <span class="chip" title="only in this project">project</span>') +
              ' <span class="meta">' + esc(sv.command) + ' ' + esc((sv.args || []).join(' ')) + '</span></span><button class="x" data-x="' + esc(sv.name) + '" title="remove server">' + icon('x') + '</button></div>';
          }).join('') : '<div class="meta">no servers yet</div>') +
          (d.tools.length ? '<div class="meta" style="margin-top:6px">tools: ' + esc(d.tools.map(function (t) { return 'mcp:' + t.server + ':' + t.name; }).join(', ')) + '</div>' : '') +
          '<div style="height:8px"></div><div class="row"><input id="mcName" placeholder="name (e.g. fs)" style="margin:0"><input id="mcCmd" placeholder="command (e.g. npx)" style="margin:0"></div><input id="mcArgs" placeholder="args separated by spaces">' +
          '<label style="display:flex;gap:7px;align-items:center;font-size:12px;color:var(--muted);cursor:pointer"><input type="checkbox" id="mcGlobal" checked> Available in every project (global)</label>' +
          '<div class="row"><button class="btn dark" id="mcAdd">Add MCP server</button><button class="btn ghost" id="mcFs">+ filesystem MCP (official)</button></div></div></div>';
        b.querySelectorAll('[data-x]').forEach(function (el) {
          el.onclick = function () { api('/api/mcp/' + el.getAttribute('data-x'), { method: 'DELETE' }).then(function () { renderSettings(); }).catch(function (e) { toast(e.message, true); }); };
        });
        $('mcAdd').onclick = function () {
          api('/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: $('mcName').value, command: $('mcCmd').value, args: $('mcArgs').value.split(/\s+/).filter(Boolean), global: $('mcGlobal').checked }) })
            .then(function () { renderSettings(); }).catch(function (e) { toast(e.message, true); });
        };
        $('mcFs').onclick = function () {
          var root = effectiveProjectPath() || '.';
          api('/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'fs', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', root] }) })
            .then(function () { toast('Filesystem MCP added for ' + root); renderSettings(); })
            .catch(function (e) { toast(e.message, true); });
        };
      });
    } else if (S.setSection === 'cron') {
      api('/api/cron').then(function (d) {
        b.innerHTML = '<h1>Scheduled / heartbeat</h1><p style="color:var(--muted);font-size:12.5px">Cron jobs start agent runs on a schedule. A heartbeat periodically checks project health.</p>' +
          '<div class="setcard"><div class="setlist">' +
          (d.jobs.length ? d.jobs.map(function (jb) {
            return '<div class="row"><span class="grow">every <b>' + esc(jb.every) + '</b> — ' + esc(jb.goal) + (jb.lastRunAt ? ' <span class="meta">(last ' + new Date(jb.lastRunAt).toLocaleTimeString() + ')</span>' : '') + '</span><button class="x" data-x="' + esc(jb.id) + '" title="remove job">' + icon('x') + '</button></div>';
          }).join('') : '<div class="meta">no jobs yet</div>') +
          '<div style="height:8px"></div><div class="row"><div style="flex:1"><div class="meta">Schedule (e.g. 30, 30s, 5m, 1h — bare numbers are minutes)</div><input id="crEvery" placeholder="30m" style="margin:0"></div><div style="flex:2"><div class="meta">Goal for the agent</div><input id="crGoal" placeholder="e.g. run tests and fix failures" style="margin:0"></div></div>' +
          '<div class="row"><button class="btn dark" id="crAdd">Add cron job</button><button class="btn ghost" id="crHeart">+ heartbeat (30m)</button></div></div></div>';
        b.querySelectorAll('[data-x]').forEach(function (el) {
          el.onclick = function () { api('/api/cron/' + el.getAttribute('data-x'), { method: 'DELETE' }).then(function () { renderSettings(); }).catch(function (e) { toast(e.message, true); }); };
        });
        $('crAdd').onclick = function () {
          api('/api/cron', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ every: $('crEvery').value, goal: $('crGoal').value }) })
            .then(function () { renderSettings(); }).catch(function (e) { toast(e.message, true); });
        };
        $('crHeart').onclick = function () {
          api('/api/cron', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ every: '30m', goal: 'Heartbeat: inspect the project, run tests/typecheck, fix or report anything broken.' }) })
            .then(function () { renderSettings(); }).catch(function (e) { toast(e.message, true); });
        };
      });
    }
  }
