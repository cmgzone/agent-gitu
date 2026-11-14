/** Theme tokens are shared by the workspace, Cowork, settings and overlays. */
export const UI_THEME_CSS = String.raw`
  :root {
    color-scheme: dark;
    --cw-chat-surface:var(--bg);
    --chat-cloud-light:transparent; --chat-cloud-shade:transparent;
    --bg: #111112; --card: #1f1f22; --card2: #161618; --sidebar: #161618;
    --border: #2a2a2e; --border2: #3c3c42; --line: #2e2e33;
    --text: #dfe2e5; --muted: #aaafb5; --faint: #91969e;
    --accent: #3e9efb; --on-accent: #0a1317; --dark: #f1f1f1;
    --hover: #252529; --selected: #2c2c31; --selection: #3a3a41;
    --ok: #7cd49c; --err: #f0958d; --run: #59adff; --evidence: #e3b963;
    --ok-dim: #1a2921; --err-dim: #311f1e; --run-dim: #1c2430; --amber-bg: #2b2416;
    --ok-border: #2c4a3a; --err-border: #5a3431; --run-border: #2f4561; --warn-border: #524322;
    --green: var(--ok); --red: var(--err); --blue: var(--run); --amber: var(--evidence);
    --overlay: rgba(0,0,0,.64); --shadow: 0 1px 2px rgba(0,0,0,.35), 0 4px 12px rgba(0,0,0,.25);
    --shadow-float: 0 8px 24px rgba(0,0,0,.45), 0 16px 48px rgba(0,0,0,.4); --thumb: #3c3c42;
    --radius-inner: 8px; --radius-el: 12px; --radius-card: 16px;
    --radius-bubble: 20px; --radius-chat: 28px; --radius-page: 32px; --radius-full: 9999px;
  }
  :root[data-theme="light"] {
    color-scheme: light;
    --cw-chat-surface:var(--bg);
    --chat-cloud-light:transparent; --chat-cloud-shade:transparent;
    --bg: #f1f4f7; --card: #ffffff; --card2: #eef2f6; --sidebar: #f1f4f7;
    --border: #e1e6ec; --border2: #cbd3dc; --line: #dde3ea;
    --text: #0a1317; --muted: #4e606f; --faint: #576572;
    --accent: #0064e0; --on-accent: #ffffff; --dark: #1b1b1b;
    --hover: #e7ecf2; --selected: #dfe5ec; --selection: #d2dae4;
    --ok: #1f6d43; --err: #b42318; --run: #0064e0; --evidence: #7a5400;
    --ok-dim: #ebf4ee; --err-dim: #fceeed; --run-dim: #ebf2fb; --amber-bg: #fbf5e6;
    --ok-border: #c2decb; --err-border: #efc7c3; --run-border: #c2d6f2; --warn-border: #ead7a4;
    --overlay: rgba(10,19,23,.32); --shadow: 0 1px 1px rgba(10,19,23,.05), 0 2px 8px rgba(10,19,23,.06);
    --shadow-float: 0 4px 12px rgba(10,19,23,.08), 0 16px 36px rgba(10,19,23,.1); --thumb: #bcc6d1;
  }
  .theme-toggle { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 32px; height: 32px; padding: 6px; color: var(--muted); border: 0; border-radius: var(--radius-inner); background: transparent; cursor: pointer; }
  #view .cw-top-nav button[aria-pressed=true] { background: var(--dark) !important; color: var(--bg); }
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
  .composer, .cw-composer { background: var(--card); border-radius: var(--radius-chat); box-shadow: var(--shadow); }
  .composer:focus-within, .cw-composer:focus-within { border-color: var(--border2); box-shadow: var(--shadow-float); }
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
  .appearance-preview { display: grid; grid-template-columns: 26% 1fr; gap: 10px; height: 64px; padding: 8px; border: 1px solid #e1e6ec; border-radius: 10px; background: #f1f4f7; }
  .appearance-preview > i { border-radius: 4px; background: #ffffff; border: 1px solid #e1e6ec; }
  .appearance-preview > b { align-self: center; height: 22px; border-top: 4px solid #1b1b1b; border-bottom: 4px solid #cbd3dc; margin-right: 12px; }
  .appearance-preview.dark { background: #111112; border-color: #2a2a2e; }
  .appearance-preview.dark > i { background: #1f1f22; border-color: #2a2a2e; }
  .appearance-preview.dark > b { border-top-color: #f1f1f1; border-bottom-color: #3c3c42; }
  .appearance-preview.system { background: linear-gradient(90deg, #f1f4f7 50%, #111112 50%); border-color: #7b848f; }
  .appearance-preview.system > i { border-color: transparent; }
  .appearance-preview.system > b { border-color: #8c96a2; }
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
    if(typeof cwApplyCharacterTheme==='function')cwApplyCharacterTheme();
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
