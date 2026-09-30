import { HOME_BLOB_HTML } from './ui-home.js';

// Shared avatar motion, character choices and web activity marks.
export const CHARACTER_CSS = String.raw`
  .cw-ava > img, .cw-avprev > img, .cw-ava > svg:not(.home-blob), .cw-avprev > svg:not(.home-blob) { animation: cworb-idle 5s ease-in-out infinite; }
  .cw-ava.working > svg:not(.home-blob), .cw-ava.working > img, .cw-avprev.working > svg:not(.home-blob), .cw-avprev.working > img { animation: cworb-work 1.4s ease-in-out infinite; }
  .cw-modal .cw-shapes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .cw-modal .cw-shapes button { display: flex; align-items: center; gap: 6px; padding: 6px 8px; font-size: 11px; text-transform: none; }
  .cw-modal .cw-shapes button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .cw-shape-preview { display: inline-flex; width: 40px; height: 40px; flex: none; }
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
  @media (prefers-reduced-motion: reduce) { .cw-ava *, .cw-shape-preview *, .cw-avprev *, .cw-web-icon::after { animation: none !important; } }
`;

export const CHARACTER_JS = String.raw`
  var CW_CHARACTER_NAMES = { 'home-blob': 'Home Blob', orb: 'Round', cube: 'Cube', diamond: 'Diamond', pyramid: 'Pyramid' };
  var cwHomeBlobId = 0;
  function cwHomeBlob(color) {
    var id = 'cwHomeBlob' + (++cwHomeBlobId);
    var svg = ${JSON.stringify(HOME_BLOB_HTML)}.replace(/homeBlobFill/g, id);
    return color === '#8f80ff' ? svg : svg.replace('#9580ff', color).replace('#cbbdff', 'white').replace('#6550cf', color);
  }
  function cwGeometricBlobSvg(shape, color) {
    var id = 'cwBlobFill' + (++cwHomeBlobId);
    var body = shape === 'cube' ? '<rect x="6" y="6" width="28" height="28" rx="6"' :
      shape === 'diamond' ? '<path d="M20 2L37 19L20 37L3 19Z"' :
      shape === 'pyramid' ? '<path d="M20 3L38 35H2Z"' : '<ellipse cx="20" cy="21" rx="17" ry="16"';
    var eyes = shape === 'diamond'
      ? '<ellipse cx="15" cy="20" rx="1.9" ry="3.1" fill="#262144"/><path d="M23 20Q25 22 27 20" fill="none" stroke="#262144" stroke-width="1.7" stroke-linecap="round"/><circle cx="15.6" cy="19" r=".7" fill="white"/>'
      : '<ellipse cx="15" cy="20" rx="' + (shape === 'cube' ? '2.3' : '1.9') + '" ry="' + (shape === 'pyramid' ? '2.5' : '3.1') + '" fill="#262144"/><ellipse cx="25" cy="20" rx="' + (shape === 'cube' ? '2.3' : '1.9') + '" ry="' + (shape === 'pyramid' ? '2.5' : '3.1') + '" fill="#262144"/><circle cx="15.6" cy="19" r=".7" fill="white"/><circle cx="25.6" cy="19" r=".7" fill="white"/>';
    var smile = shape === 'cube' ? 'M15 26Q20 34 25 26Z' : shape === 'pyramid' ? 'M17 26Q20 31 23 26Z' : 'M16 26Q20 33 24 26Z';
    return '<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><radialGradient id="' + id + '" cx="28%" cy="18%" r="85%"><stop stop-color="#eee8ff"/><stop offset=".5" stop-color="' + color + '"/><stop offset="1" stop-color="' + color + '" stop-opacity=".8"/></radialGradient></defs>' + body + ' fill="url(#' + id + ')"/>' +
      '<g class="cw-orb-eyes">' + eyes + '</g>' +
      '<ellipse cx="11" cy="25" rx="2.5" ry="1.3" fill="#f4a4d2"/><ellipse cx="29" cy="25" rx="2.5" ry="1.3" fill="#f4a4d2"/><path d="' + smile + '" fill="#36234e"/><path d="M19 29Q23 28 22 31Q20 34 19 31Z" fill="#ff91bd"/></svg>';
  }
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
