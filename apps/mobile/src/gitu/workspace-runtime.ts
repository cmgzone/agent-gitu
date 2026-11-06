// Older desktop installations also need this shim when opened over LAN HTTP.
// getRandomValues is available there even when randomUUID is secure-context-only.
export const WORKSPACE_COMPAT_JS = String.raw`
(function () {
  if (window.crypto && !window.crypto.randomUUID) {
    window.crypto.randomUUID = function () {
      var bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      var hex = Array.from(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
      return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
    };
  }
})();
true;
`;

// Keep this in the APK too, so a phone can use an older desktop server clearly.
export const MOBILE_WORKSPACE_CSS = String.raw`
  #cw .cw-chat::before, #cw .cw-chat::after { display:none!important; }
  *, *::before, *::after { backdrop-filter:none!important; -webkit-backdrop-filter:none!important; }
  :is(.cw-composer,.composer,.cw-top-nav,.cw-bubble,.abubble,.agent-report,.tl-note-row,.ub,.setcard,.appearance-card,.ws-search-field,.ws-filters,.ws-result-list:not([data-ws-group="Tools"]):not([data-ws-group="Agents"]):not([data-ws-group="Skills"]):not([data-ws-group="Projects"]):not([data-ws-group="Settings"]):not([data-ws-group="Schedules"]):not(.settings-directory .ws-result-list),.ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Agents"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]) .ws-result,.settings-directory .ws-result,.ws-schedule-card,.cw-panel-card,.cw-widget-lane) { background-color:var(--card)!important; }
  :is(.cw-panel-backdrop,.cw-widget-backdrop,.mobile-backdrop,.modal.cw-modal) { background:var(--overlay)!important; }
  .cw-message-more { opacity:1!important; }
  :is(.stream,.cw-msgs,.home-brand,.workspace-search) { filter:none!important; }
  html { -webkit-text-size-adjust:100%; }
  * { scrollbar-width:none!important; }
  *::-webkit-scrollbar { display:none!important; width:0!important; height:0!important; }
  @media(max-width:600px) {
    .workspace-search-main { padding:calc(18px + env(safe-area-inset-top, 0px)) 14px calc(32px + env(safe-area-inset-bottom, 0px))!important; }
    .ws-context { margin:6px 46px 10px 4px!important; font-size:10.5px!important; }
    .ws-filters { display:flex!important; flex-wrap:nowrap!important; overflow-x:auto!important; margin:10px 0 16px!important; padding:3px!important; border-radius:12px!important; gap:3px!important; }
    .ws-filters button { flex:none!important; white-space:nowrap!important; min-height:32px!important; padding:5px 11px!important; font-size:12px!important; border-radius:9px!important; }
    .ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]),.settings-directory .ws-result-list { display:grid!important; grid-template-columns:repeat(2,minmax(0,1fr))!important; gap:8px!important; padding:0!important; background:transparent!important; border:0!important; box-shadow:none!important; }
    .ws-result-list[data-ws-group="Agents"] { display:grid!important; grid-template-columns:1fr!important; gap:8px!important; padding:0!important; background:transparent!important; border:0!important; box-shadow:none!important; }
    .ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]) .ws-result-action,.settings-directory .ws-result-action { flex-direction:column!important; align-items:flex-start!important; gap:8px!important; padding:12px!important; }
    .ws-result-list:is([data-ws-group="Tools"],[data-ws-group="Skills"],[data-ws-group="Projects"],[data-ws-group="Settings"]) .ws-result-icon,.settings-directory .ws-result-icon { width:32px!important; height:32px!important; border-radius:9px!important; }
  }
`;

export const WORKSPACE_LOADED_JS = WORKSPACE_COMPAT_JS + String.raw`
(function () {
  if (!document.getElementById('gitu-native-style')) {
    var style = document.createElement('style');
    style.id = 'gitu-native-style';
    style.textContent = ${JSON.stringify(MOBILE_WORKSPACE_CSS)};
    document.head.appendChild(style);
  }
})();
true;
`;
