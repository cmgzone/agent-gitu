// Shared avatar motion, character choices and web activity marks.
export const CHARACTER_CSS = String.raw`
  .cw-ava > img, .cw-avprev > img, .cw-ava > svg, .cw-avprev > svg { animation: cworb-idle 5s ease-in-out infinite; }
  .cw-ava.working > svg, .cw-ava.working > img, .cw-avprev.working > svg, .cw-avprev.working > img { animation: cworb-work 1.4s ease-in-out infinite; }
  .cw-modal .cw-shapes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .cw-modal .cw-shapes button { display: flex; align-items: center; gap: 6px; padding: 6px 8px; font-size: 11px; }
  .cw-shape-preview { display: inline-flex; width: 32px; height: 32px; flex: none; }
  .cw-shape-preview svg, .cw-shape-preview img { width: 100%; height: 100%; object-fit: contain; }
  .cw-preview-work { border: 1px solid var(--border2); border-radius: 7px; background: var(--card2); color: var(--text); padding: 4px 8px; margin-top: 8px; font-size: 11px; }
  .cw-preview-work[aria-pressed=true] { border-color: var(--accent); }
  .cw-web-activity { display: inline-flex; align-items: center; gap: 7px; min-width: 0; color: var(--run); font-size: 11px; }
  .cw-tools .cw-web-activity, .cw-tools .cw-web-activity span { border: 0; padding: 0; font-family: var(--sans); color: var(--run); }
  .cw-web-icon { position: relative; display: inline-flex; width: 22px; height: 22px; flex: none; align-items: center; justify-content: center; border-radius: 6px; background: var(--card2); }
  .cw-web-icon svg { width: 16px; height: 16px; }
  .cw-web-icon img { position: absolute; width: 16px; height: 16px; background: var(--card2); border-radius: 3px; }
  .cw-web-activity.running .cw-web-icon::after { content: ''; position: absolute; inset: -2px; border: 1px solid transparent; border-top-color: var(--run); border-right-color: var(--run); border-radius: 8px; animation: cw-web-scan 1.5s linear infinite; }
  @keyframes cw-web-scan { to { transform: rotate(360deg); } }
  @media (max-width: 480px) { .cw-avrow { flex-direction: column; align-items: stretch; } .cw-avprev { align-self: center; } }
  @media (prefers-reduced-motion: reduce) { .cw-shape-preview *, .cw-avprev *, .cw-web-icon::after { animation: none !important; } }
`;

export const CHARACTER_JS = String.raw`
  var CW_CHARACTER_NAMES = { orb: 'Blob', cube: 'Cube' };
  function cwWebActivity(p) {
    if (!p || !/^(browse|web_fetch|web_search|search_web)$/.test(p.tool || '')) return '';
    var site = null;
    try { var url = new URL(p.webUrl); if (/^https?:$/.test(url.protocol) && !url.username && !url.password) site = url; } catch (e) {}
    var running = p.toolOk === undefined;
    var label = (running ? 'Searching the web' : p.toolOk ? 'Web search complete' : 'Web search failed');
    if (p.tool === 'web_fetch') label = running ? 'Reading the web' : p.toolOk ? 'Page read' : 'Page unavailable';
    if (site) label += ' · ' + site.hostname;
    var globe = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12 H21 M5 7 H19 M5 17 H19"/></svg>';
    return '<span class="cw-web-activity' + (running ? ' running' : '') + '"><span class="cw-web-icon">' + globe + (site ? '<img src="' + esc(site.origin + '/favicon.ico') + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : '') + '</span><span>' + esc(label) + '</span></span>';
  }
`;
