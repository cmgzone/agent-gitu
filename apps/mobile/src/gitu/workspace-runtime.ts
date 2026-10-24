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
  :is(.cw-composer,.composer,.cw-top-nav,.cw-bubble,.abubble,.agent-report,.tl-note-row,.ub,.setcard,.appearance-card,.ws-search-field,.ws-result-list,.cw-panel-card,.cw-widget-lane) { background-color:var(--card)!important; }
  :is(.cw-panel-backdrop,.cw-widget-backdrop,.mobile-backdrop,.modal.cw-modal) { background:var(--overlay)!important; }
  .cw-message-more { opacity:1!important; }
  :is(.stream,.cw-msgs,.home-brand,.workspace-search) { filter:none!important; }
  html { -webkit-text-size-adjust:100%; }
  * { scrollbar-width:none!important; }
  *::-webkit-scrollbar { display:none!important; width:0!important; height:0!important; }
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
