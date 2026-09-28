/** Theme tokens are shared by the workspace, Cowork, settings and overlays. */
export const UI_THEME_CSS = String.raw`
  :root {
    color-scheme: dark;
    --bg: #111111; --card: #1b1b1b; --card2: #161616; --sidebar: #161616;
    --border: #2c2c2c; --border2: #414141; --line: #303030;
    --text: #e8e8e8; --muted: #a3a3a3; --faint: #898989;
    --accent: #8f80ff; --on-accent: #171717; --dark: #8f80ff;
    --hover: #262626; --selected: #2b2b2b; --selection: #454545;
    --ok: #9bb7a3; --err: #dba59e; --run: #5ba8ff; --evidence: #c6b78f;
    --ok-dim: #202b24; --err-dim: #322421; --run-dim: #25282c; --amber-bg: #2b281f;
    --ok-border: #3d5144; --err-border: #62443e; --run-border: #46515c; --warn-border: #574d36;
    --green: var(--ok); --red: var(--err); --blue: var(--run); --amber: var(--evidence);
    --overlay: rgba(0,0,0,.6); --shadow: 0 4px 16px rgba(0,0,0,.18);
    --shadow-float: 0 16px 48px rgba(0,0,0,.28); --thumb: #444444;
  }
  :root[data-theme="light"] {
    color-scheme: light;
    --bg: #fafaf9; --card: #ffffff; --card2: #f3f3f1; --sidebar: #f2f2f0;
    --border: #dededb; --border2: #c7c7c2; --line: #d8d8d4;
    --text: #242422; --muted: #62625e; --faint: #6c6c67;
    --accent: #6755c8; --on-accent: #ffffff; --dark: #6755c8;
    --hover: #eaeae7; --selected: #e5e5e1; --selection: #d9d9d4;
    --ok: #3c654a; --err: #9c4239; --run: #285eaa; --evidence: #77602c;
    --ok-dim: #eef3ee; --err-dim: #fbefec; --run-dim: #edf0f3; --amber-bg: #f6f2e8;
    --ok-border: #c4d5c8; --err-border: #e3c4bc; --run-border: #c5d0d9; --warn-border: #ddd0af;
    --overlay: rgba(20,20,18,.32); --shadow: 0 2px 8px rgba(20,20,18,.04);
    --shadow-float: 0 16px 48px rgba(20,20,18,.12); --thumb: #bdbdb6;
  }
  .theme-toggle { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 32px; height: 32px; padding: 6px; color: var(--muted); border: 0; border-radius: 8px; background: transparent; cursor: pointer; }
  .theme-toggle:hover { background: var(--hover); color: var(--text); }
  .theme-toggle svg { width: 17px; height: 17px; }
  .theme-toggle .theme-moon, [data-theme="light"] .theme-toggle .theme-sun { display: none; }
  [data-theme="light"] .theme-toggle .theme-moon { display: block; }
  .sb .foot { display: flex; align-items: center; gap: 8px; }
  .sb .foot .project-chip { flex: 1; min-width: 0; }
  .cw-rail-foot .theme-toggle { align-self: center; }
  /* Quiet surfaces and a clear type hierarchy replace decorative glow. */
  body { background: var(--bg); }
  input::placeholder, textarea::placeholder { color: var(--faint); opacity: 1; }
  #mascotWrap { display: none !important; }
  .home::before { display: none; }
  .home-eyebrow { color: var(--muted); font-weight: 500; letter-spacing: .08em; }
  .home h1 { font-weight: 600; letter-spacing: -.035em; }
  .home-eyebrow::before { display: none; }
  .sb .head .name { font-weight: 600; font-size: 12px; letter-spacing: .05em; }
  .sb .newbtn, .sb .newbtn:hover { border-color: var(--border); box-shadow: none; transform: none; }
  .sug { box-shadow: none; }
  .sug:hover { background: var(--card2); box-shadow: none; border-color: var(--border2); transform: none; }
  .sug .ico { color: var(--muted) !important; }
  .setup-card { background: var(--card); border-color: var(--border); }
  .setup-card:hover { background: var(--card2); border-color: var(--border2); }
  .composer, .cw-composer { background: var(--card); box-shadow: var(--shadow); }
  .composer:focus-within, .cw-composer:focus-within { border-color: var(--muted); box-shadow: none; }
  .cw-row.me .cw-bubble, .usermsg .ub, .cw-item.cur { background: var(--selected); }
  .cw-item.cur { border-color: transparent; }
  .cw-bubble .cw-meta .nm, .usermsg .umeta .nm { font-weight: 600; }
  .cw-chat-head .cw-tt .t1 { font-weight: 600; }
  .cw-item:hover .cw-ava { transform: none; }
  .cw-flag.gold, .cw-chat-head .cw-tt .t1 svg { color: var(--muted); }
  .cw-request { border: 0; background: transparent; box-shadow: none; border-radius: 0; padding: 0; }
  .cw-request .k { color: var(--muted); letter-spacing: .04em; }
  .cw-request .t { font-size: 13.5px; font-weight: 600; margin-top: 6px; }
  .cw-request .d { font-size: 13px; line-height: 1.65; margin-top: 4px; }
  .cw-request .cw-actions { margin-top: 12px; }
  .cw-request-result { font-size: 12px; color: var(--muted); white-space: pre-wrap; }
  .cw-avopts .cw-colors button { border-color: var(--border); }
  .cw-avopts .cw-colors button.cur { border-color: var(--card); }
  .cw-rail-foot #cwGear { flex: none; width: 32px; padding: 6px; }
  .modal .box, .model-menu, .cw-message-menu, .jump-latest, .toast { box-shadow: var(--shadow-float); }
  .toast.err { background: var(--card); color: var(--err); }
  .bdrive, .side-fab { color: var(--on-accent); box-shadow: var(--shadow); animation: none; }
  .send.stop, .cw-composer .cw-send.stop { background: var(--err-dim); color: var(--err); border: 1px solid var(--err-border); animation: none; }
  .toggle.on { background: var(--accent); }
  .toggle.on::after { background: var(--on-accent); }
  .appearance-description { color: var(--muted); font-size: 13px; margin: 0 0 16px; }
  .appearance-options { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; max-width: 620px; margin: 0 0 32px; }
  .appearance-option { position: relative; cursor: pointer; min-width: 0; }
  .appearance-option input { position: absolute; width: 1px; height: 1px; opacity: 0; }
  .appearance-option > span { display: block; padding: 10px; border: 1px solid var(--border); border-radius: 12px; background: var(--card); }
  .appearance-option input:checked + span { border-color: var(--text); box-shadow: 0 0 0 1px var(--text); }
  .appearance-option input:focus-visible + span { outline: 2px solid var(--text); outline-offset: 4px; }
  .appearance-label { display: flex; justify-content: space-between; align-items: center; padding-top: 9px; font-size: 12px; font-weight: 500; color: var(--text); }
  .appearance-label::after { content: ''; width: 6px; height: 6px; border-radius: 50%; background: transparent; }
  .appearance-option input:checked + span .appearance-label::after { background: var(--text); }
  .appearance-preview { display: grid; grid-template-columns: 26% 1fr; gap: 10px; height: 64px; padding: 8px; border: 1px solid #dededb; border-radius: 6px; background: #fafaf9; }
  .appearance-preview > i { border-radius: 3px; background: #e5e5e1; }
  .appearance-preview > b { align-self: center; height: 22px; border-top: 4px solid #bdbdb6; border-bottom: 4px solid #dededb; margin-right: 12px; }
  .appearance-preview.dark { background: #171717; border-color: #303030; }
  .appearance-preview.dark > i { background: #303030; }
  .appearance-preview.dark > b { border-top-color: #929292; border-bottom-color: #414141; }
  .appearance-preview.system { background: linear-gradient(90deg, #fafaf9 50%, #171717 50%); border-color: #82827c; }
  .appearance-preview.system > b { border-color: #92928c; }
  @media (max-width: 480px) { .appearance-options { gap: 8px; } .appearance-option > span { padding: 8px; } .appearance-preview { height: 52px; gap: 6px; } }
`;

/** Runs before the first paint so a saved light theme never flashes dark. */
export const UI_THEME_BOOTSTRAP = String.raw`
  (function () {
    var choice = 'system';
    try { var saved = JSON.parse(localStorage.getItem('hermes.settings') || 'null'); choice = saved && saved.settings && saved.settings.theme || choice; } catch (e) {}
    if (['light', 'dark', 'system'].indexOf(choice) < 0) choice = 'system';
    var dark = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', choice === 'system' ? (dark ? 'dark' : 'light') : choice);
  })();
`;

export const UI_THEME_JS = String.raw`
  var themeMedia = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function themeChoice(value) { return ['light', 'dark', 'system'].indexOf(value) < 0 ? 'system' : value; }
  function themeToggleLabel() { return 'Switch to ' + (document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark') + ' mode'; }
  function applyTheme() {
    var choice = themeChoice(S.settings.theme);
    S.settings.theme = choice;
    document.documentElement.setAttribute('data-theme', choice === 'system' ? (themeMedia && themeMedia.matches ? 'dark' : 'light') : choice);
    document.querySelectorAll('[data-theme-toggle]').forEach(function (button) { button.title = themeToggleLabel(); button.setAttribute('aria-label', themeToggleLabel()); });
    document.querySelectorAll('[data-appearance-choice]').forEach(function (input) { input.checked = input.value === choice; });
  }
  function setTheme(choice) { S.settings.theme = themeChoice(choice); applyTheme(); persist(); }
  function themeToggleHtml() {
    return '<button type="button" class="theme-toggle" data-theme-toggle title="' + themeToggleLabel() + '" aria-label="' + themeToggleLabel() + '"><svg class="theme-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg><svg class="theme-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z"/></svg></button>';
  }
  function themeOptionsHtml() {
    return '<h2>Appearance</h2><p class="appearance-description">Choose a theme, or match your device.</p><div class="appearance-options" role="radiogroup" aria-label="Appearance">' + ['light', 'dark', 'system'].map(function (choice) {
      return '<label class="appearance-option"><input type="radio" name="appearance" data-appearance-choice value="' + choice + '"' + (themeChoice(S.settings.theme) === choice ? ' checked' : '') + '><span><span class="appearance-preview ' + choice + '" aria-hidden="true"><i></i><b></b></span><span class="appearance-label">' + choice[0].toUpperCase() + choice.slice(1) + '</span></span></label>';
    }).join('') + '</div>';
  }
  applyTheme();
  if (themeMedia) {
    var onSystemTheme = function () { if (S.settings.theme === 'system') applyTheme(); };
    if (themeMedia.addEventListener) themeMedia.addEventListener('change', onSystemTheme);
    else if (themeMedia.addListener) themeMedia.addListener(onSystemTheme);
  }
  document.addEventListener('click', function (event) {
    if (event.target && event.target.closest && event.target.closest('[data-theme-toggle]')) setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  });
  document.addEventListener('change', function (event) {
    if (event.target && event.target.matches && event.target.matches('[data-appearance-choice]')) setTheme(event.target.value);
  });
`;
