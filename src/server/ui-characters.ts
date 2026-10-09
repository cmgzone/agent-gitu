
// Shared avatar motion, character choices and web activity marks.
/** The same markup runs in the browser and builds the static home character. */
export function plushCharacterHtml(color: string, identity = '', filter = '', className = ''): string {
  // Eye bounds match the original 512px PNGs. A clipped sample of the same
  // plush texture becomes an eyelid; no flattened/recolored assets are needed.
  const eyes: Record<string, number[][]> = {
    blue: [[155, 206, 54, 68, 228, 165], [304, 206, 54, 68, 230, 165]],
    purple: [[153, 193, 55, 65, 229, 155], [302, 193, 55, 65, 228, 155]],
    orange: [[175, 190, 46, 58, 235, 154], [306, 171, 46, 57, 238, 140]],
    mint: [[171, 230, 45, 55, 232, 200], [294, 230, 46, 57, 231, 198]],
  };
  if (!Object.prototype.hasOwnProperty.call(eyes, color)) color = 'purple';
  let seed = 0;
  const key = color + identity;
  for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
  const source = '/characters/' + color + '.png?v=opendots1';
  let style = '--blink-period:' + (5.6 + seed % 24 / 10) + 's;--blink-offset:-' + (seed % 50 / 10) + 's;--plush-offset:-' + (seed % 37 / 10) + 's';
  if (filter && /^[a-z0-9().,% +\-]+$/i.test(filter)) style += ';filter:' + filter;
  const extra = /^[a-z0-9 \-]*$/i.test(className) ? className : '';
  let lids = '';
  for (const eye of eyes[color]!) {
    const x = eye[0]!, y = eye[1]!, width = eye[2]!, height = eye[3]!;
    const size = 'width:' + width + 'px;height:' + height + 'px';
    lids += '<svg x="' + x + '" y="' + y + '" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" style="' + size + ';clip-path:ellipse(50% 50%)"><svg class="cw-blink-lid" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" style="' + size + '"><image href="' + source + '" x="-' + eye[4] + '" y="-' + eye[5] + '" width="512" height="512"/><path d="M 8 ' + Math.round(height * .52) + ' Q ' + Math.round(width / 2) + ' ' + Math.round(height * .68) + ' ' + (width - 8) + ' ' + Math.round(height * .52) + '" fill="none" stroke="#231921" stroke-width="5" stroke-linecap="round"/></svg></svg>';
  }
  return '<span class="cw-plush' + (extra ? ' ' + extra : '') + '" data-plush="' + color + '" style="' + style + '" aria-hidden="true"><img src="' + source + '" alt="" width="512" height="512" draggable="false"><svg class="cw-blink-overlay" viewBox="0 0 512 512" fill="none" aria-hidden="true">' + lids + '</svg></span>';
}

export const CHARACTER_CSS = String.raw`
  .cw-plush { position:relative; display:inline-block; width:100%; height:100%; flex:none; pointer-events:none; transform-origin:50% 85%; animation:plush-breathe 6.2s ease-in-out infinite; animation-delay:var(--plush-offset,0s); }
  .cw-plush > img { display:block; width:100%; height:100%; object-fit:contain; animation:none !important; }
  .cw-plush > svg.cw-blink-overlay { position:absolute; inset:0; display:block; width:100%; height:100%; overflow:visible; }
  .cw-blink-lid { clip-path:inset(0 0 100% 0); animation:plush-blink var(--blink-period,6.4s) ease-in-out infinite; animation-delay:var(--blink-offset,0s); }
  .cw-ava.working > .cw-plush, .cw-avprev.working > .cw-plush { animation-name:plush-attentive; animation-duration:3.8s; }
  .cw-shape-preview > .cw-plush { animation-duration:7s; }
  .subagent-orb > .cw-plush { animation:none; transform:none; }
  @keyframes plush-breathe { 0%,100% { transform:translateY(0) rotate(-.6deg) scale(1); } 50% { transform:translateY(-1px) rotate(.6deg) scale(1.008); } }
  @keyframes plush-attentive { 0%,100% { transform:translateY(0) rotate(-1deg); } 50% { transform:translateY(-1.5px) rotate(1deg); } }
  @keyframes plush-blink { 0%,40%,45%,100% { clip-path:inset(0 0 100% 0); } 41.4%,42.8% { clip-path:inset(0); } }
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
  @media (prefers-reduced-motion: reduce) { .cw-plush, .cw-plush *, .cw-ava *, .cw-shape-preview *, .cw-avprev *, .cw-web-icon::after { animation: none !important; } .cw-blink-lid { clip-path:inset(0 0 100% 0); } }
`;

export const CHARACTER_JS = String.raw`
  ${plushCharacterHtml.toString()}
  var CW_CHARACTER_NAMES = { 'dot-blue': 'Blue', 'dot-mint': 'Mint', 'dot-orange': 'Orange', 'dot-purple': 'Purple' };
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
