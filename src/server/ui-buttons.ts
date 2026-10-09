// One action treatment across chat, settings, onboarding and authentication.
// Selection surfaces retain their state; controls have no resting card chrome.
export const UI_BUTTON_CSS = String.raw`
  :is(button, a.btn):not(.mobile-backdrop):not(.cw-panel-backdrop):not(.toggle):not([role="switch"]):not(.cw-colors button):not(.cw-profile-tool) {
    border: 0 !important;
    background: transparent !important;
    box-shadow: none !important;
    transition: color .16s ease, background-color .16s ease, transform .12s ease, opacity .16s ease;
    -webkit-tap-highlight-color: transparent;
  }
  :is(button, a.btn):not(.mobile-backdrop):not(.cw-panel-backdrop):not(.toggle):not([role="switch"]):not(.cw-colors button):not(:disabled):hover {
    background: color-mix(in srgb, var(--accent) 9%, transparent) !important;
  }
  :is(button, a.btn):not(.mobile-backdrop):not(.cw-panel-backdrop):not(.toggle):not([role="switch"]):not(:disabled):active { transform: translateY(1px) scale(.97); }
  :is(button, a.btn):focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  :is(button, a.btn):disabled { opacity: .4; cursor: default; }
  .btn, a.btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; border-radius: 999px; min-height: 32px; text-decoration: none; }
  .btn.dark, a.btn.dark, .cw-composer .cw-send, button.send, button.side-fab { color: var(--accent); }
  .btn.red, .cw-composer .cw-send.stop, .cw-stop-secondary, button.stop { color: var(--err); }
  .cw-composer .cw-send.queue { color: var(--run); }
  .sb .chat .rowdel.armed { color: var(--err); }
  .action-glyph { display: inline-flex; vertical-align: middle; flex: none; pointer-events: none; }
  .action-glyph svg { width: 17px; height: 17px; }
  button:not(.btn) > .action-glyph:not(:only-child) { margin-inline-end: 7px; }
  :is(.iconbtn, .ubtn, .cw-attach, .cw-send, .cw-info-toggle, .cw-panel-toggle, .cw-profile-close, .close, .send) { border-radius: 50%; }
  :is(button.on, button.cur, button.active, button.sel, button[aria-selected="true"], button[aria-pressed="true"]):not(.cw-colors button):not(.toggle):not([role="switch"]) { background: var(--selected) !important; }
  .cw-rail-head .iconbtn { width: 30px; height: 30px; }
  .cw-chat-head #cwBack { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: 0; }
  .cw-chat-head #cwBack svg, .cw-attach svg, .cw-send svg, .cw-panel-toggle svg { width: 19px; height: 19px; }
  .auth button { color: var(--accent); display: flex; align-items: center; justify-content: center; gap: 9px; }
  .auth button svg { width: 19px; height: 19px; }
  @media (pointer: coarse) { :is(.btn, .iconbtn, .ubtn, .cw-attach, .cw-send, .cw-info-toggle, .cw-panel-toggle, .cw-profile-close, .close, .send) { min-width: 44px; min-height: 44px; } }
  @media (prefers-reduced-motion: reduce) { :is(button, a.btn) { transition: none !important; } :is(button, a.btn):active { transform: none !important; } }
`;

// Rendered controls arrive through several independent views. Decorate only
// new/changed controls, never streamed prose, and preserve their names/handlers.
export const UI_BUTTON_JS = String.raw`
  function actionIconName(label) {
    var text = String(label || '').trim().toLowerCase();
    if (/^(report|message) actions$/.test(text)) return 'more';
    if (/delete|remove|revoke/.test(text)) return 'trash';
    if (/close|cancel|dismiss|skip/.test(text)) return 'x';
    if (/always allow/.test(text)) return 'shield';
    if (/accept|approve|save|done|apply|confirm|copied/.test(text)) return 'check';
    if (/connect|account|sign in|register/.test(text)) return 'plug';
    if (/refresh|retry|restart|reload/.test(text)) return 'retry';
    if (/download|export/.test(text)) return 'download';
    if (/upload|attach/.test(text)) return 'upload';
    if (/lock|password/.test(text)) return 'lock';
    if (/back|return|collapse/.test(text)) return 'back';
    if (/edit|rename/.test(text)) return 'pencil';
    if (/search|find/.test(text)) return 'search';
    if (/folder|project|files/.test(text)) return 'folder';
    if (/browser|website|web/.test(text)) return 'globe';
    if (/terminal|shell/.test(text)) return 'terminal';
    if (/team|agent|profile|cowork/.test(text)) return 'users';
    if (/schedule|history/.test(text)) return 'clock';
    if (/settings|setup|configure/.test(text)) return 'gear';
    if (/copy/.test(text)) return 'copy';
    if (/stop|pause/.test(text)) return 'stop';
    if (/send/.test(text)) return 'send';
    if (/new|add|create|install/.test(text)) return 'plus';
    if (/start|continue|open|launch|run/.test(text)) return 'play';
    return null;
  }
  function actionSvg(name) {
    var paths = {
      more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
      trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
      lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',
      download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
      upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 16v5h16v-5"/>',
      play: '<path d="m8 4 12 8-12 8z"/>',
      stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
      send: '<path d="M12 20V4m-7 7 7-7 7 7"/>'
    };
    return paths[name] ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + paths[name] + '</svg>' : icon(name);
  }
  function decorateActionButton(button) {
    if (button.matches('.mobile-backdrop,.cw-panel-backdrop,.cw-widget-backdrop,.toggle,[role="switch"],.cw-colors button,.cw-learn')) return;
    var existing = button.querySelector('svg,img,input');
    if (existing) {
      if (existing.tagName.toLowerCase() === 'svg') { existing.setAttribute('aria-hidden', 'true'); existing.setAttribute('focusable', 'false'); }
      return;
    }
    var label = button.getAttribute('aria-label') || button.getAttribute('title') || button.textContent.trim();
    if (!label) return;
    // A loading placeholder is not an accessible name for an icon control.
    if (/^[×«»↑↓+−⚙⋯…]$/.test(label)) return;
    var name = actionIconName(label);
    if (!name) return;
    var glyph = actionSvg(name);
    if (!glyph) return;
    var iconOnly = button.matches('.iconbtn,.ubtn,.close,.send,.cw-stop-secondary') || /^[×«»↑↓+−⚙⋯…]$/.test(button.textContent.trim());
    if (iconOnly) {
      button.setAttribute('aria-label', label);
      if (!button.getAttribute('title')) button.setAttribute('title', label);
      button.textContent = '';
    }
    button.insertAdjacentHTML('afterbegin', '<span class="action-glyph" aria-hidden="true">' + glyph + '</span>');
  }
  function decorateActionControls(root) {
    if (root.nodeType !== 1) return;
    if (root.matches('button,a.btn')) decorateActionButton(root);
    root.querySelectorAll('button,a.btn').forEach(decorateActionButton);
  }
  decorateActionControls(document.body);
  new MutationObserver(function (records) {
    var controls = new Set();
    records.forEach(function (record) {
      record.addedNodes.forEach(function (node) { if (node.nodeType === 1) decorateActionControls(node); });
      var parent = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      var button = parent && parent.closest('button,a.btn');
      if (button) controls.add(button);
    });
    controls.forEach(decorateActionButton);
  }).observe(document.body, { childList: true, subtree: true });
`;
