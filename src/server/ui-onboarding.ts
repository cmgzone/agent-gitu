export const ONBOARDING_CSS = String.raw`
  .gitu-opening { position:fixed; inset:0; z-index:300; padding:24px; box-sizing:border-box; background:var(--cw-chat-surface,var(--bg)); display:grid; place-items:center; text-align:center; }
  .opening-content { width:min(100%,360px); }
  .gitu-opening img { display:block; width:72px; height:72px; margin:0 auto; }
  .gitu-opening h1 { font-size:26px; font-weight:600; letter-spacing:-.7px; margin:24px 0 8px; }
  .gitu-opening p { margin:0; color:var(--muted); font-size:13px; line-height:1.65; text-wrap:balance; }
  .opening-dots { display:flex; justify-content:center; gap:6px; margin-top:24px; }
  .opening-dots i { width:4px; height:4px; border-radius:50%; background:var(--run); animation:setupPulse 1.6s ease-in-out infinite; }
  .opening-dots i:nth-child(2) { animation-delay:.16s; }.opening-dots i:nth-child(3) { animation-delay:.32s; }
  .gitu-opening #startupReload { margin-top:24px; border-radius:999px; padding:10px 20px; background:var(--run)!important; color:var(--card); }
  .gitu-opening.is-error .opening-dots { display:none; }
  @keyframes setupPulse { 0%,80%,100% { opacity:.28; } 40% { opacity:1; } }
  .setup-wizard { position:fixed; inset:0; z-index:250; overflow-y:auto; background:var(--cw-chat-surface,var(--bg)); padding:40px 24px; box-sizing:border-box; display:grid; place-items:safe center; }
  .setup-frame { width:min(100%,900px); display:grid; grid-template-columns:210px minmax(0,1fr); border:1px solid color-mix(in srgb,var(--border) 50%,transparent); background:color-mix(in srgb,var(--card) 72%,transparent); border-radius:28px; box-shadow:0 20px 60px -36px rgba(18,44,70,.2); overflow:hidden; }
  .setup-aside { padding:32px 24px; background:transparent; border-right:1px solid color-mix(in srgb,var(--border) 60%,transparent); }
  .setup-brand { display:flex; align-items:center; gap:10px; font-size:14px; font-weight:600; }
  .setup-brand img { width:32px; height:32px; }
  .setup-aside p { color:var(--muted); font-size:12px; line-height:1.65; margin:20px 0 32px; }
  .setup-steps { list-style:none; padding:0; margin:0; display:grid; gap:20px; }
  .setup-steps li { display:flex; align-items:center; gap:10px; color:var(--muted); font-size:12px; }
  .setup-steps li[aria-current=step] { color: var(--text); font-weight: 600; }
  .setup-step-number { border:1px solid color-mix(in srgb,var(--border2) 65%,transparent); border-radius:50%; width:26px; height:26px; display:grid; place-items:center; font-size:11px; flex:none; }
  [aria-current=step] .setup-step-number { background:var(--run); border-color:var(--run); color:var(--card); }
  .setup-main { min-width: 0; padding: 36px; }
  .setup-main h1 { font-size:25px; line-height:1.25; font-weight:600; letter-spacing:-.7px; margin:0 0 10px; text-wrap:balance; }
  .setup-main .setup-description { color:var(--muted); margin:0 0 28px; font-size:13px; line-height:1.65; }
  .setup-main h2 { font-size: 15px; margin-top: 24px; }
  .setup-main label.setup-field { display: block; font-size: 12px; font-weight: 600; margin: 16px 0 6px; }
  #setupWizard .setup-main :is(select,input:not([type=radio])) { width:100%; min-width:0; box-sizing:border-box; font:inherit; font-size:13px; padding:12px 14px; border-radius:14px; border:1px solid color-mix(in srgb,var(--border2) 70%,transparent); background:color-mix(in srgb,var(--card) 72%,transparent); color:var(--text); }
  .setup-main :is(select,input):focus-visible { outline:2px solid var(--run); outline-offset:3px; }
  .setup-key-row { display: flex; gap: 8px; }
  .setup-key-row input { flex: 1; }
  .setup-provider-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
  .setup-note { font-size:12px; color:var(--muted); margin-top:10px; line-height:1.65; }
  .setup-message { font-size:13px; color:var(--text); line-height:1.65; padding:14px 16px; border-radius:18px; background:color-mix(in srgb,var(--card) 88%,transparent); margin-top:20px; white-space:pre-wrap; overflow-wrap:anywhere; }
  .setup-message:empty { display:none; }
  .setup-message.error { background:var(--err-dim); color:var(--err); }
  .setup-footer { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-top:32px; padding-top:0; border:0; }
  .setup-wizard .btn { border-radius:999px; min-height:40px; padding:9px 18px; font-size:12px; }
  #setupWizard .btn.dark { background:var(--run)!important; color:var(--card); border-color:transparent; }
  #setupWizard .btn.dark:hover { background:color-mix(in srgb,var(--run) 86%,var(--text))!important; }
  .setup-wizard .btn.ghost { color:var(--muted); border-color:transparent; }
  .setup-footer > div { display: flex; gap: 8px; }
  .setup-modes { display: grid; gap: 12px; }
  .setup-mode { display:flex; gap:14px; padding:20px; border-radius:20px; border:1px solid color-mix(in srgb,var(--border2) 70%,transparent); background:color-mix(in srgb,var(--card) 50%,transparent); cursor:pointer; }
  .setup-mode:has(input:checked) { border-color:var(--run); box-shadow:inset 0 0 0 1px var(--run); background:color-mix(in srgb,var(--run) 6%,var(--card)); }
  .setup-mode input { width:16px; flex:none; margin:5px 0 0; align-self:start; accent-color:var(--run); }
  .setup-mode b { display: block; font-size: 15px; margin-bottom: 5px; }
  .setup-mode small { font-size: 12px; line-height: 1.7; color: var(--muted); }
  @media(max-width:720px) { .setup-wizard { padding:24px 16px; }.setup-frame { grid-template-columns:1fr; border-radius:24px; }.setup-aside { padding:22px 24px; border-right:0; border-bottom:1px solid color-mix(in srgb,var(--border) 60%,transparent); }.setup-aside p { display:none; }.setup-steps { display:flex; gap:16px; margin-top:22px; flex-wrap:wrap; }.setup-main { padding:28px 24px; } }
  @media(max-width:420px) { .setup-wizard { padding:16px 12px; }.setup-main { padding:24px 20px; }.setup-aside { padding:20px; }.setup-steps { gap:12px; }.setup-steps li { gap:6px; font-size:11px; }.setup-step-number { width:22px; height:22px; }.setup-main h1 { font-size:23px; }.setup-footer,.setup-footer > div { flex-wrap:wrap; }.setup-footer > div { margin-left:auto; } }
  @media(prefers-reduced-motion:reduce) { .opening-dots i { animation:none; } }
`;

export const ONBOARDING_HTML = String.raw`
<div id="startupCover" class="gitu-opening"><div class="opening-content"><img src="/brand/agent-gitu-mark.svg" alt="Agent Gitu icon"><h1>Agent Gitu</h1><p id="startupMessage" role="status" aria-live="polite">Opening your workspace…</p><div class="opening-dots" aria-hidden="true"><i></i><i></i><i></i></div><button id="startupReload" class="btn dark" hidden>Try again</button></div></div>
<div id="setupWizard" class="setup-wizard" role="dialog" aria-modal="true" aria-labelledby="setupTitle" hidden></div>
`;

export const ONBOARDING_JS = String.raw`
  var setupState = null;
  function setupMessage(text, error) {
    var el = $('setupMessage');
    if (el) { el.textContent = text; el.className = 'setup-message' + (error ? ' error' : ''); el.setAttribute('role', error ? 'alert' : 'status'); }
  }
  function setupProvider() { return (S.models || []).find(function (p) { return p.id === setupState.provider; }); }
  function setupModelValue(p) {
    if (!p) return '';
    var selected = setupState.model || S.sel.model || '';
    if (selected.indexOf(p.id + '::') === 0 && (p.models || []).some(function (m) { return p.id + '::' + m.id === selected; })) return selected;
    var model = (p.models || []).find(function (m) { return m.id === p.defaultModel; }) || (p.models || [])[0];
    return model ? p.id + '::' + model.id : '';
  }
  function setupConnectionHtml() {
    var providers = S.models || [];
    if (!providers.length) return '<p class="setup-note">Load your providers to connect a model, or set this up later.</p><button class="btn ghost" id="setupRefresh">Load providers</button>';
    var p = setupProvider() || providers.find(providerIsUsable) || providers[0];
    setupState.provider = p.id;
    setupState.model = setupModelValue(p);
    var ready = providerIsUsable(p);
    var subscription = p.auth === 'chatgpt-subscription';
    return '<label class="setup-field" for="setupProvider">Model provider</label><select id="setupProvider">' + providers.map(function (item) {
      return '<option value="' + esc(item.id) + '"' + (p.id === item.id ? ' selected' : '') + '>' + esc(item.label || item.id) + (providerIsUsable(item) ? ' · Connected' : '') + '</option>';
    }).join('') + '</select>' +
      (ready ? '<p class="setup-note">' + (subscription ? 'ChatGPT is signed in.' : 'A key is already available for this provider.') + '</p>' : '') +
      (subscription ? '<p class="setup-note">Use your ChatGPT account through the existing sign-in connection.</p><div class="setup-provider-actions"><button class="btn dark" id="setupSignIn">Sign in with ChatGPT</button><button class="btn ghost" id="setupRefresh">Check sign-in</button></div>' :
        (p.keyEnvVars || []).length ? '<label class="setup-field" for="setupKey">' + (ready ? 'Replace API key (optional)' : 'API key') + '</label><div class="setup-key-row"><input id="setupKey" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your API key"><button class="btn ghost" id="setupShowKey" aria-label="Show API key">Show</button></div><p class="setup-note">Saved in Agent Gitu’s local key store.</p><div class="setup-provider-actions"><button class="btn dark" id="setupSaveKey">Save key</button><button class="btn ghost" id="setupRefresh">Refresh models</button></div>' : '<p class="setup-note">This provider does not need an API key here.</p><button class="btn ghost" id="setupRefresh">Refresh connection</button>') +
      '<label class="setup-field" for="setupModel">Default model</label><select id="setupModel"' + (ready ? '' : ' disabled') + '>' + (p.models || []).map(function (m) {
        var value = p.id + '::' + m.id;
        return '<option value="' + esc(value) + '"' + (setupState.model === value ? ' selected' : '') + '>' + esc(m.id) + '</option>';
      }).join('') + '</select>';
  }
  function renderSetup() {
    var root = $('setupWizard');
    var step = setupState.step;
    var titles = ['Make yourself at home', 'Connect your intelligence', 'How would you like to work?'];
    var descriptions = ['Choose the look that feels right. You can change it anytime.', 'Connect a provider and pick a model for your tasks.', 'Choose where to start. You can switch between both workspaces anytime.'];
    var content = step === 0 ? themeOptionsHtml().replace(/name="appearance"/g, 'name="setupAppearance"') : step === 1 ? setupConnectionHtml() :
      '<div class="setup-modes" role="radiogroup" aria-label="Starting workspace">' + [{ id: 'coding', title: 'Coding', description: 'Build apps, fix bugs, and work directly with your code and project files.' }, { id: 'cowork', title: 'Cowork', description: 'Work with a team of agents on research, documents, planning, and everyday tasks.' }].map(function (mode) {
        return '<label class="setup-mode"><input type="radio" name="setupMode" value="' + mode.id + '"' + (setupState.mode === mode.id ? ' checked' : '') + '><span><b>' + mode.title + '</b><small>' + mode.description + '</small></span></label>';
      }).join('') + '</div>';
    root.innerHTML = '<div class="setup-frame"><aside class="setup-aside"><div class="setup-brand"><img src="/brand/agent-gitu-mark.svg" alt=""><span>Agent Gitu</span></div><p>Your ideas. A little help.<br>Let’s get you set up.</p><ol class="setup-steps">' + ['Appearance', 'Connection', 'Workspace'].map(function (name, i) {
      return '<li' + (i === step ? ' aria-current="step"' : '') + '><span class="setup-step-number">' + (i + 1) + '</span>' + name + '</li>';
    }).join('') + '</ol></aside><section class="setup-main"><h1 id="setupTitle" tabindex="-1">' + titles[step] + '</h1><p class="setup-description">' + descriptions[step] + '</p>' + content +
      '<div id="setupMessage" class="setup-message" role="status" aria-live="polite"></div><footer class="setup-footer"><button class="btn ghost" id="setupBack"' + (step === 0 ? ' hidden' : '') + '>Back</button><div>' + (step === 1 ? '<button class="btn ghost" id="setupSkip">Set up later</button>' : '') + '<button class="btn dark" id="setupNext">' + (step === 2 ? 'Open ' + (setupState.mode === 'cowork' ? 'Cowork' : 'Coding') : 'Continue') + '</button></div></footer></section></div>';
    $('setupBack').onclick = function () { setupState.step--; renderSetup(); };
    $('setupNext').onclick = function () {
      if (step === 1) {
        var p = setupProvider();
        if ($('setupKey') && $('setupKey').value.trim()) { setupMessage('Save your API key before continuing.', true); return; }
        if (!providerIsUsable(p) || !setupState.model) { setupMessage('Connect a provider and choose a model, or select Set up later.', true); return; }
        S.sel.model = setupState.model;
        persist();
      }
      if (step === 2) { finishSetup(); return; }
      setupState.step++;
      renderSetup();
      if (setupState.step === 1 && !S.modelsLoaded) refreshSetupProviders();
    };
    if ($('setupSkip')) $('setupSkip').onclick = function () { setupState.step = 2; renderSetup(); };
    if ($('setupProvider')) $('setupProvider').onchange = function () { setupState.provider = this.value; setupState.model = ''; renderSetup(); };
    if ($('setupModel')) $('setupModel').onchange = function () { setupState.model = this.value; };
    if ($('setupShowKey')) $('setupShowKey').onclick = function () {
      var input = $('setupKey'); var show = input.type === 'password'; input.type = show ? 'text' : 'password';
      this.textContent = show ? 'Hide' : 'Show'; this.setAttribute('aria-label', show ? 'Hide API key' : 'Show API key');
    };
    if ($('setupSaveKey')) $('setupSaveKey').onclick = saveSetupKey;
    if ($('setupRefresh')) $('setupRefresh').onclick = refreshSetupProviders;
    if ($('setupSignIn')) $('setupSignIn').onclick = function () {
      setupOperation(async function () {
        var result = await api('/api/chatgpt/login', { method: 'POST' });
        if (result.url) window.open(result.url, '_blank', 'noopener');
        setupMessage('Complete sign-in in your browser, then choose Check sign-in.');
      });
    };
    root.querySelectorAll('[name=setupMode]').forEach(function (input) { input.onchange = function () { setupState.mode = input.value; $('setupNext').textContent = 'Open ' + (input.value === 'cowork' ? 'Cowork' : 'Coding'); }; });
    $('setupTitle').focus();
  }
  async function setupOperation(action) {
    if (setupState.busy) return;
    setupState.busy = true;
    var controls = Array.from($('setupWizard').querySelectorAll('button, input, select')).map(function (el) { return { el: el, disabled: el.disabled }; });
    controls.forEach(function (item) { item.el.disabled = true; });
    try { await action(); }
    catch (e) { setupMessage('Could not complete this step. Please try again.', true); }
    finally { setupState.busy = false; controls.forEach(function (item) { if (item.el.isConnected) item.el.disabled = item.disabled; }); }
  }
  async function refreshSetupProviders() {
    return setupOperation(async function () {
      setupMessage('Loading providers…');
      await loadModelCatalog(true);
      renderSetup();
      setupMessage(providerIsUsable(setupProvider()) ? 'Connection available. Choose your model to continue.' : 'Choose a provider and connect it, or set this up later.');
    });
  }
  async function saveSetupKey() {
    var p = setupProvider();
    var input = $('setupKey');
    var key = input && input.value.trim();
    if (!key || !p || !(p.keyEnvVars || []).length) { setupMessage('Paste an API key first.', true); return; }
    return setupOperation(async function () {
      setupMessage('Saving key…');
      await api('/api/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ envVar: p.keyEnvVars[0], key: key }) });
      input.value = '';
      key = '';
      try { await loadModelCatalog(true); renderSetup(); setupMessage('Key saved. Choose a model to continue.'); }
      catch (e) { setupMessage('Key saved. Refresh models to finish connecting.', true); }
    });
  }
  function openSetupWizard() {
    setupState = { step: 0, provider: (S.sel.model || '').split('::')[0], model: S.sel.model || '', mode: S.settings.startMode || 'coding', busy: false };
    document.querySelector('.shell').inert = true;
    $('startupCover').className = 'gitu-opening';
    var cw = $('cw'); if (cw) cw.inert = true;
    $('setupWizard').hidden = false;
    $('setupWizard').onkeydown = function (event) {
      if (event.key !== 'Tab') return;
      var controls = Array.from(this.querySelectorAll('button:not([disabled]):not([hidden]), input:not([disabled]), select:not([disabled])'));
      var first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === $('setupTitle'))) { event.preventDefault(); if (last) last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); if (first) first.focus(); }
    };
    renderSetup();
    // The page underneath may still be loading the catalog. Do not replace a
    // key field while the user is typing; the connection step refreshes itself.
  }
  async function finishSetup() {
    return setupOperation(async function () {
      setupMessage('Saving your setup…');
      await api('/api/onboarding', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme: S.settings.theme, mode: setupState.mode, model: S.sel.model || '' }) });
      S.settings.onboardingComplete = true;
      S.settings.startMode = setupState.mode;
      persist();
      $('setupWizard').hidden = true;
      $('setupWizard').innerHTML = '';
      document.querySelector('.shell').inert = false;
      var cw = $('cw'); if (cw) cw.inert = false;
      if (setupState.mode === 'cowork') openCowork(); else cwExit();
    });
  }
  var onboardingLoading = false;
  async function initializeOnboarding() {
    if (onboardingLoading) return;
    onboardingLoading = true;
    document.querySelector('.shell').inert = true;
    $('startupCover').className = 'gitu-opening';
    $('startupMessage').textContent = 'Opening your workspace…';
    $('startupReload').hidden = true;
    try {
      var prefs = await api('/api/onboarding', { signal: AbortSignal.timeout(15000) });
      if (!prefs.completed) openSetupWizard();
      else {
        if (!S.settings.onboardingComplete) {
          S.settings.theme = prefs.theme;
          S.settings.startMode = prefs.mode;
          if (prefs.model) S.sel.model = prefs.model;
          S.settings.onboardingComplete = true;
          applyTheme(); persist();
        }
        var lastMode = null;
        try { lastMode = localStorage.getItem('hermes.cowork'); } catch (e) {}
        if (lastMode === 'open' || (!lastMode && prefs.mode === 'cowork')) openCowork();
        document.querySelector('.shell').inert = false;
      }
      $('startupCover').hidden = true;
    } catch (e) {
      console.error('Agent Gitu setup could not initialize:', e);
      $('startupCover').className = 'gitu-opening is-error';
      $('startupMessage').textContent = 'Could not load your setup. Please try again.';
      $('startupReload').hidden = false;
      $('startupReload').onclick = initializeOnboarding;
      $('startupReload').focus();
    } finally { onboardingLoading = false; }
  }
`;
