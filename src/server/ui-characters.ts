// Inline vector characters keep their moving parts live at every avatar size.
export const CHARACTER_CSS = String.raw`
  .cw-character { overflow: visible; }
  .cw-character-body { transform-origin: 24px 30px; animation: cw-character-float 3.8s ease-in-out infinite; }
  .cw-character-eyes { transform-origin: 24px 22px; animation: cw-character-blink 5.6s infinite; }
  .cw-character-arm { transform-box: fill-box; transform-origin: 50% 10%; animation: cw-character-wave 2.6s ease-in-out infinite; }
  .cw-character-sprout .cw-character-arm { transform-origin: 50% 100%; }
  .cw-character-ufo .cw-character-body { animation-duration: 2.8s; }
  .cw-character-jelly .cw-character-body { animation-name: cw-character-squish; }
  .working .cw-character-body { animation: cw-character-work .85s ease-in-out infinite; }
  .working .cw-character-arm { animation-duration: .45s; }
  .working .cw-character-eyes { animation-duration: 3s; }
  .cw-ava > img, .cw-avprev > img, .cw-ava > svg:not(.cw-character), .cw-avprev > svg:not(.cw-character) { animation: cworb-idle 5s ease-in-out infinite; }
  .cw-ava.working > svg:not(.cw-character), .cw-avprev.working > img { animation: cworb-work 1.4s ease-in-out infinite; }
  .cw-modal .cw-shapes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
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
  @keyframes cw-character-float { 0%, 100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-2px) rotate(3deg); } }
  @keyframes cw-character-squish { 0%, 100% { transform: scale(1.03,.96); } 50% { transform: translateY(-2px) scale(.97,1.03); } }
  @keyframes cw-character-work { 0%, 100% { transform: translateY(0) rotate(-6deg); } 50% { transform: translateY(-3px) rotate(6deg); } }
  @keyframes cw-character-wave { 0%, 100% { transform: rotate(-12deg); } 50% { transform: rotate(16deg); } }
  @keyframes cw-character-blink { 0%, 44%, 48%, 100% { transform: scaleY(1); } 46% { transform: scaleY(.08); } }
  @keyframes cw-web-scan { to { transform: rotate(360deg); } }
  @media (max-width: 480px) { .cw-avrow { flex-direction: column; align-items: stretch; } .cw-avprev { align-self: center; } }
  @media (prefers-reduced-motion: reduce) { .cw-character *, .cw-shape-preview *, .cw-avprev *, .cw-web-icon::after { animation: none !important; } }
`;

export const CHARACTER_JS = String.raw`
  var CW_CHARACTER_NAMES = { orb: 'Orb', jelly: 'Jelly', cat: 'Cat bot', sprout: 'Sprout', ufo: 'UFO', cube: 'Cube', visor: 'Visor', antenna: 'Antenna', bot: 'Robot' };
  function cwCharacterSvg(avatar) {
    var shape = avatar && avatar.shape;
    if (['jelly', 'cat', 'sprout', 'ufo'].indexOf(shape) < 0) return '';
    var color = /^#[0-9a-f]{6}$/i.test(avatar.color) ? avatar.color : '#8f80ff';
    var body = '';
    var eyes = '<g class="cw-character-eyes"><ellipse cx="18" cy="22" rx="2" ry="3" fill="#172035"/><ellipse cx="30" cy="22" rx="2" ry="3" fill="#172035"/><circle cx="18.6" cy="21" r=".7" fill="white"/><circle cx="30.6" cy="21" r=".7" fill="white"/></g>';
    var smile = '<path d="M21 28 Q24 32 27 28" fill="none" stroke="#172035" stroke-width="1.6" stroke-linecap="round"/>';
    if (shape === 'jelly') body = '<path d="M8 30 C4 5 41 3 40 29 Q44 39 36 37 Q31 43 25 37 Q18 43 13 37 Q4 40 8 30" fill="' + color + '"/><ellipse cx="16" cy="13" rx="5" ry="2.5" fill="white" opacity=".3" transform="rotate(-25 16 13)"/><path class="cw-character-arm" d="M7 25 Q1 18 4 17 M40 25 Q47 19 44 17" fill="none" stroke="' + color + '" stroke-width="3" stroke-linecap="round"/>';
    if (shape === 'cat') body = '<path class="cw-character-arm" d="M35 36 Q46 37 42 27" fill="none" stroke="' + color + '" stroke-width="4" stroke-linecap="round"/><rect x="14" y="29" width="21" height="12" rx="6" fill="' + color + '"/><path d="M9 22 L9 5 20 12 Q24 10 28 12 L39 5 39 24 Q38 34 24 34 Q9 34 9 22" fill="' + color + '"/><path d="M12 10 L18 14 12 17 M36 10 L30 14 36 17" fill="#ffb9dc"/><path d="M6 25 H13 M5 29 L13 27 M35 25 H43 M35 27 L43 29" stroke="#172035" stroke-width="1.2" stroke-linecap="round"/>';
    if (shape === 'sprout') body = '<path class="cw-character-arm" d="M24 15 C9 14 12 1 24 11 C26 0 39 3 24 15" fill="#74df96"/><rect x="9" y="14" width="30" height="21" rx="9" fill="' + color + '"/><path d="M15 33 H33 L30 43 H18Z" fill="#cd8866"/><path d="M13 34 H35" stroke="#efb393" stroke-width="3" stroke-linecap="round"/>';
    if (shape === 'ufo') body = '<path d="M12 28 V22 C12 3 36 3 36 22 V28" fill="' + color + '"/><path d="M15 17 Q17 10 23 10" fill="none" stroke="white" stroke-width="2" opacity=".35" stroke-linecap="round"/><ellipse cx="24" cy="32" rx="21" ry="7" fill="#657089"/><ellipse cx="24" cy="30" rx="21" ry="5" fill="' + color + '"/><g class="cw-character-arm" fill="#fff0a9"><circle cx="11" cy="32" r="1.8"/><circle cx="24" cy="34" r="1.8"/><circle cx="37" cy="32" r="1.8"/></g>';
    return '<svg class="cw-character cw-character-' + shape + '" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><ellipse cx="24" cy="45" rx="13" ry="2" fill="#080d18" opacity=".25"/><g class="cw-character-body">' + body + eyes + (shape === 'ufo' ? '' : smile) + '</g></svg>';
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
