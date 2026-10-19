
  window.__bootErrors = [];
  window.addEventListener('error', function (e) { window.__bootErrors.push(String(e && e.message) + ' @ ' + String(e && e.filename) + ':' + String(e && e.lineno)); });
  window.addEventListener('unhandledrejection', function (e) { window.__bootErrors.push('unhandled: ' + String(e && e.reason)); });
  /* GITU_BINDING_UI_MOTION_JS */
  /* GITU_BINDING_CHAT_SURFACE_JS */
  /* GITU_BINDING_WORKSPACE_SEARCH_JS */
  /* GITU_BINDING_UI_APPROACH_JS */
  /* GITU_BINDING_UI_RESPONSE_JS */
  /* GITU_BINDING_UI_CONNECTIONS_JS */
  /* GITU_BINDING_CONNECTED_APPS_JS */
  /* GITU_BINDING_CUSTOM_CONNECTION_JS */
  /* GITU_BINDING_CHAT_CREDENTIAL_HELPERS_JS */
  /* GITU_BINDING_UI_MODEL_CATALOG_JS */
  var S = {
    active: 'home', project: null, models: [], sessions: {}, es: null, poll: null, files: [],
    modelsLoaded: false,
    draft: '',
    sel: { model: '', effort: 'high', persistent: true, spendCeilingUsd: '' },
    settings: { autoApprove: false, autoLearn: true, projectPath: '', devMode: false, cwLearn: 'reactive', theme: 'system' },
    setSection: 'general',
    delivery: 'steer',
    pendingFiles: []
  };
  try {
    var saved = JSON.parse(localStorage.getItem('hermes.settings') || 'null');
    if (saved) {
      if (saved.sel) for (var k in saved.sel) S.sel[k] = saved.sel[k];
      if (saved.settings) for (var k2 in saved.settings) S.settings[k2] = saved.settings[k2];
      if (typeof S.settings.scope === 'string') S.settings.scope = S.settings.scope.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      if (!Array.isArray(S.settings.scope)) S.settings.scope = [];
      S.draft = saved.draft || '';
    }
  } catch (e) {}
  // Old workflow preferences must never re-enable persistent planning.
  delete S.sel.wf;
  delete S.settings.review;
  S.sel.persistent = true;
  function persist() {
    try { localStorage.setItem('hermes.settings', JSON.stringify({ sel: S.sel, settings: S.settings, draft: credentialChatInput(S.draft || '').safeText })); } catch (e) {}
  }
  /* GITU_BINDING_UI_THEME_JS */
  document.querySelector('.sb .foot').insertAdjacentHTML('beforeend', themeToggleHtml());
  function $(id) { return document.getElementById(id); }
  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  // Users see what Gitu is doing and why it matters — not the internal agent
  // protocol. Raw diagnostics (protocol repairs, recovery ladders, internal
  // bookkeeping, unknown event tags) render only in Developer mode.
  function devMode() { return Boolean(S.settings.devMode); }
  function humanTokenCount(n) {
    if (!isFinite(n) || n <= 0) return '';
    return n >= 1000 ? (Math.round(n / 100) / 10) + 'K' : String(n);
  }
  // Attachments are per-composer, never global: a screenshot staged on the
  // home composer or in Session A must not ride along when you switch to
  // Session B and send there.
  function pendingFor() {
    if (S.active === 'home') {
      if (!S.homePendingFiles) S.homePendingFiles = [];
      return S.homePendingFiles;
    }
    var sess = S.sessions[S.active] || (S.sessions[S.active] = { events: [], ledger: null, session: null, side: 'state', nodes: {}, pendingFiles: [] });
    if (!sess.pendingFiles) sess.pendingFiles = [];
    return sess.pendingFiles;
  }
  function mascotState(mode) {
    if (window.__mascot) window.__mascot.setMode(mode);
    if (S.mascotTimer) clearTimeout(S.mascotTimer);
    S.mascotTimer = setTimeout(function () { if (window.__mascot) window.__mascot.setMode('idle'); }, 1800);
  }
  function mascotPulse() {
    mascotState('testing');
  }

  function toast(msg, isErr) {
    var wrap = $('toasts');
    if (!wrap) return;
    var text = String(msg == null ? '' : msg);
    // Raw HTML error pages / JSON dumps used to fill the whole toast box.
    if (text.length > 320) text = text.slice(0, 320) + '…';
    var t = document.createElement('div');
    t.className = 'toast' + (isErr ? ' err' : '');
    var body = document.createElement('div');
    body.className = 'toast-body';
    body.textContent = text;
    t.appendChild(body);
    if (isErr) {
      // Errors persist until dismissed and carry recovery affordances.
      var actions = document.createElement('div');
      actions.className = 'toast-actions';
      var copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy';
      copyBtn.onclick = function () { navigator.clipboard.writeText(String(msg)).catch(function () {}); copyBtn.textContent = 'Copied'; setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1200); };
      var dismiss = document.createElement('button');
      dismiss.textContent = 'Dismiss';
      dismiss.onclick = function () { t.remove(); };
      actions.appendChild(copyBtn);
      actions.appendChild(dismiss);
      t.appendChild(actions);
      wrap.appendChild(t);
      setTimeout(function () { t.remove(); }, 15000);
    } else {
      wrap.appendChild(t);
      setTimeout(function () { t.remove(); }, 4500);
    }
    // Keep at most four toasts on screen; drop the oldest.
    while (wrap.children.length > 4) wrap.removeChild(wrap.firstChild);
  }
  var SVG_OPEN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
  var ICONS = {
    plus: SVG_OPEN + '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    gear: SVG_OPEN + '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    shield: SVG_OPEN + '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    folder: SVG_OPEN + '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    bolt: SVG_OPEN + '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    plug: SVG_OPEN + '<path d="M9 7V3"/><path d="M15 7V3"/><path d="M6 7h12v4a6 6 0 0 1-12 0V7z"/><path d="M12 17v4"/></svg>',
    clock: SVG_OPEN + '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
    pencil: SVG_OPEN + '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
    x: SVG_OPEN + '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
    back: SVG_OPEN + '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    search: SVG_OPEN + '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>',
    check: SVG_OPEN + '<polyline points="20 6 9 17 4 12"/></svg>',
    wrench: SVG_OPEN + '<path d="M14.7 6.3a4.5 4.5 0 0 0-6 6L3 18l3 3 5.7-5.7a4.5 4.5 0 0 0 6-6L14 13l-3-3 3.7-3.7z"/></svg>',
    retry: SVG_OPEN + '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    layers: SVG_OPEN + '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    image: SVG_OPEN + '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    copy: SVG_OPEN + '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    branch: SVG_OPEN + '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>',
    globe: SVG_OPEN + '<circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a13.5 13.5 0 0 1 0 18a13.5 13.5 0 0 1 0-18z"/></svg>',
    terminal: SVG_OPEN + '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
    file: SVG_OPEN + '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
    list: SVG_OPEN + '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    users: SVG_OPEN + '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    chevDown: SVG_OPEN + '<polyline points="6 9 12 15 18 9"/></svg>',
    chevRight: SVG_OPEN + '<polyline points="9 6 15 12 9 18"/></svg>'
  };
  var TOOL_ICONS = { edit: 'pencil', read: 'file', list: 'list', search: 'search', shell: 'terminal', browser: 'globe', tool: 'wrench' };
  function toolIconFor(kind) { return TOOL_ICONS[kind] || 'wrench'; }
  function icon(name) { return ICONS[name] || ''; }
  function api(path, opts) {
    return fetch(path, opts).then(function (r) {
      if (r.status === 401) return r.clone().json().catch(function () { return {}; }).then(function (data) { if (data.code === 'APP_LOCKED') { location.replace('/auth'); throw new Error('Unlock Agent Gitu to continue.'); } return r.text().then(function (t) { throw new Error(t || 'Unauthorized'); }); });
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || String(r.status)); });
      return r.json();
    });
  }
  function titleCase(m) { return m.replace(/(^|[-.])([a-z])/g, function (a, sep, ch) { return sep + ch.toUpperCase(); }); }
  // Display-only model-name polish: family casing that titleCase cannot know.
  function prettyModelName(mid) { return titleCase(mid).replace(/Deepseek/gi, 'DeepSeek'); }
  function hhmm(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }); }
  function shortDate(iso) { var d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }); }
  function basename(p) { var parts = String(p).replace(/\\/g, '/').split('/'); return parts[parts.length - 1] || p; }
  function effectiveProjectPath() {
    return S.settings.projectPath || S.lastProjectPath || (S.project && S.project.repoRoot) || '';
  }
  function effectiveProjectName() {
    var path = effectiveProjectPath();
    return path ? basename(path) : 'no project selected';
  }
  function providerIsUsable(p) { return Boolean(p && (p.usable || p.hasKey || p.signedIn)); }
  function chipFor(status) {
    if (status === 'completed') return '<span class="chip ok">complete</span>';
    if (status === 'blocked') return '<span class="chip bad">blocked</span>';
    if (status === 'failed') return '<span class="chip bad">failed</span>';
    if (status === 'waiting_for_model') return '<span class="chip warn">retrying model</span>';
    if (status === 'stalled') return '<span class="chip warn">paused</span>';
    if (status === 'aborted') return '<span class="chip warn">stopped</span>';
    if (status === 'review') return '<span class="chip warn">awaiting review</span>';
    if (status === 'running') return '<span class="chip info">running</span>';
    return '<span class="chip">' + esc(status || 'idle') + '</span>';
  }
  // A "running" session may actually be BLOCKED ON THE USER: approval,
  // questions, or plan review. Surfacing that state is critical — it is the
  // difference between an agent working and an agent silently waiting.
  function waitingFor(s) {
    if (!s) return null;
    if (s.pendingPlanReview) return 'plan review';
    if (s.pendingQuestions) return 'your answer';
    if (s.pendingConnection) return 'secure connection setup';
    if (s.pendingApprovals && s.pendingApprovals.length) return 'approval';
    return null;
  }
  function hasAnyProviderKey() {
    return (S.models || []).some(providerIsUsable);
  }
  function ensureUsableModelSelection() {
    var current = String(S.sel.model || '');
    var found = false;
    (S.models || []).forEach(function (p) {
      if (!providerIsUsable(p)) return;
      (p.models || []).forEach(function (m) { if (current === p.id + '::' + m.id) found = true; });
    });
    if (found) return;
    var firstProvider = (S.models || []).filter(providerIsUsable)[0];
    if (!firstProvider) { S.sel.model = ''; return; }
    var firstModel = (firstProvider.models || []).filter(function (m) { return m.id === firstProvider.defaultModel; })[0] || firstProvider.models[0];
    S.sel.model = firstModel ? firstProvider.id + '::' + firstModel.id : '';
    persist();
  }
  var TITLE_BASE = 'Agent Gitu';
  function updateTitle() {
    var anyWait = false;
    Object.keys(S.sessions || {}).forEach(function (id) {
      if (waitingFor(S.sessions[id] && S.sessions[id].session)) anyWait = true;
    });
    document.title = (anyWait ? '⏸ ' : '') + TITLE_BASE;
  }

  function sessionTitle(goal) {
    var raw = String(goal || '').trim();
    if (!raw) return 'Untitled session';
    var repoMatch = raw.match(/github\.com\/[^\s/]+\/([a-z0-9._-]+)/i);
    var repoName = repoMatch ? repoMatch[1].replace(/\.git$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : '';
    if (/\bcontinue\b/i.test(raw) && /\bblack\s*box\b/i.test(raw)) return 'Continue Black Box work';
    if (repoName && /\blanding\s+page\b/i.test(raw) && /\b(real information|details|content)\b/i.test(raw)) {
      return 'Update landing page with ' + repoName + ' details';
    }
    var heading = raw.length > 240 && raw.match(/^#{1,3}\s+([^\n]+)/m);
    var text = heading ? heading[1] : raw;
    text = text.replace(/^\[cron\s+[^\]]+\]\s*/i, '')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/^[\s*_#>\d.)-]+/, '')
      .replace(/^(?:yes[.!]?\s+|please\s+|can you\s+|could you\s+|i (?:want|need) you to\s+)/i, '')
      .replace(/\*\*/g, '')
      .replace(/\s+/g, ' ').trim();
    if (!text) return repoName ? 'Work on ' + repoName : 'Untitled session';
    var sentence = text.split(/[.!?](?:\s|$)/)[0].trim();
    var words = sentence.split(/\s+/).slice(0, 9);
    var title = words.join(' ').replace(/[,:;\s-]+$/, '');
    if (sentence.split(/\s+/).length > words.length) title += '…';
    return title.charAt(0).toUpperCase() + title.slice(1);
  }