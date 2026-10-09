/** Agent-created panels use durable cowork widgets; the same cards become a
 * notification tray on smaller screens. This snippet runs in the app IIFE. */
export const COWORK_WIDGETS_CSS = String.raw`
  .cw-widget-lane { flex: 0 0 260px; width: 260px; min-height: 0; box-sizing: border-box; padding: 100px 16px 18px 20px; display: flex; flex-direction: column; gap: 14px; overflow: hidden; background: transparent; }
  .cw-widget-lane[hidden], .cw-widget-toggle[hidden], .cw-widget-backdrop[hidden] { display: none !important; }
  .cw-widget-lane-head { display: flex; align-items: center; gap: 8px; padding: 0; flex: none; }
  .cw-widget-lane-head h2 { margin: 0; font-size: 11.5px; line-height: 18px; font-weight: 500; color: var(--text); opacity: .78; }
  .cw-widget-lane-head > span { flex: 1; }
  .cw-widget-close { display: none; }
  .cw-widget-cards { display: flex; flex-direction: column; gap: 16px; overflow-y: auto; overflow-x: hidden; min-height: 0; padding: 0 2px 2px; overscroll-behavior: contain; scrollbar-width: none; }
  .cw-widget-cards::-webkit-scrollbar { display: none; width: 0; height: 0; }
  .cw-panel-card { flex: none; padding: 14px; border: 0; border-radius: 20px; background: color-mix(in srgb,var(--card) 54%,transparent); backdrop-filter: blur(18px) saturate(1.1); -webkit-backdrop-filter: blur(18px) saturate(1.1); box-shadow: 0 10px 28px -22px rgba(18,44,70,.22); color: var(--text); overflow: hidden; }
  .cw-panel-card-head { display: flex; align-items: flex-start; gap: 7px; margin-bottom: 9px; }
  .cw-panel-card-head h3 { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 500; line-height: 18px; margin: 1px 0 0; overflow-wrap: anywhere; }
  .cw-panel-card-icon { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; flex: none; border-radius: 0; background: transparent; color: var(--text); opacity: .78; }
  .cw-panel-card-icon svg { width: 12px; height: 12px; }
  .cw-widget-dismiss, .cw-widget-close { flex: none; width: 28px; height: 28px; border: 0; border-radius: 50%; padding: 6px; background: transparent; color: var(--text); opacity: .72; cursor: pointer; }
  .cw-widget-dismiss { margin: -3px -4px 0 0; }
  .cw-widget-dismiss svg, .cw-widget-close svg { width: 16px; height: 16px; }
  .cw-widget-dismiss:hover, .cw-widget-close:hover { background: transparent; color: var(--text); opacity: 1; }
  .cw-widget-dismiss:disabled { opacity: .4; cursor: wait; }
  .cw-widget-dismiss:focus-visible, .cw-widget-close:focus-visible, .cw-widget-toggle:focus-visible, .cw-widget-new:focus-visible, .cw-widget-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
  .cw-panel-card-foot { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 9px; color: var(--text); opacity: .78; font-size: 9.5px; line-height: 15px; }
  .cw-panel-card-foot time { opacity: 1; }
  .cw-widget-card-body { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .cw-widget-card-text { margin: 0; color: var(--text); font-size: 12px; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
  .cw-widget-stats { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 12px 10px; }
  .cw-widget-stat { padding: 1px 0; border: 0; border-radius: 0; background: transparent; min-width: 0; }
  .cw-widget-stat dt { color: var(--text); opacity: .78; font-size: 10px; line-height: 15px; overflow-wrap: anywhere; }
  .cw-widget-stat dd { margin: 2px 0 0; font-size: 15px; font-weight: 500; line-height: 20px; overflow-wrap: anywhere; }
  .cw-widget-stats dl { margin: 0; }
  .cw-widget-checks { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 7px; }
  .cw-widget-checks li { display: flex; gap: 7px; align-items: flex-start; font-size: 11.5px; line-height: 18px; overflow-wrap: anywhere; }
  .cw-widget-check-mark { flex: none; width: 14px; height: 14px; margin-top: 2px; border: 1px solid var(--border2); border-radius: 5px; display: grid; place-items: center; font-size: 10px; }
  .cw-widget-checks .done { color: var(--text); opacity: .78; }
  .cw-widget-checks .done .cw-widget-check-mark { color: var(--text); background: transparent; border-color: transparent; }
  .cw-widget-progress-label { display: flex; justify-content: space-between; gap: 10px; font-size: 10.5px; color: var(--text); opacity: .78; }
  .cw-widget-progress { height: 3px; border-radius: 99px; overflow: hidden; background: color-mix(in srgb, var(--text) 8%, transparent); }
  .cw-widget-progress > span { display: block; height: 100%; background: var(--accent); border-radius: inherit; }
  .cw-widget-link { display: flex; align-items: center; gap: 8px; padding: 5px 0; border: 0; border-radius: 0; background: transparent; color: var(--text); text-decoration: none; min-width: 0; }
  .cw-widget-link:hover { background: transparent; }
  .cw-widget-link:hover strong { text-decoration: underline; text-underline-offset: 3px; }
  .cw-widget-link-icon { position: relative; width: 25px; height: 25px; border-radius: 0; flex: none; display: grid; place-items: center; color: var(--text); background: transparent; }
  .cw-widget-link-icon svg { width: 15px; height: 15px; }
  .cw-widget-link-icon .cw-fav { position: absolute; width: 18px; height: 18px; border-radius: 3px; }
  .cw-widget-link-icon .out-link-icon { position: absolute; inset: 4px; width: 18px; height: 18px; border-radius: 3px; background: transparent; }
  .cw-widget-link-info { flex: 1; min-width: 0; }
  .cw-widget-link-info strong, .cw-widget-link-info small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cw-widget-link-info strong { font-size: 11px; font-weight: 500; }
  .cw-widget-link-info small { font-size: 9.5px; color: var(--text); opacity: .78; margin-top: 1px; }
  .cw-widget-link-arrow { color: var(--text); opacity: .78; font-size: 11px; flex: none; }
  .cw-widget-schedule { display: flex; flex-direction: column; gap: 11px; }
  .cw-widget-event { display: block; font-size: 11px; line-height: 17px; }
  .cw-widget-event::before { content: none; }
  .cw-widget-event strong, .cw-widget-event time, .cw-widget-event small { display: block; overflow-wrap: anywhere; }
  .cw-widget-event strong { font-weight: 500; }
  .cw-widget-event time, .cw-widget-event small { font-size: 10px; color: var(--text); opacity: .78; }
  .cw-widget-event a { color: var(--text); text-decoration: none; }
  .cw-widget-event a:hover { text-decoration: underline; }
  .cw-widget-media { min-width: 0; overflow: hidden; }
  .cw-widget-media .out-card { margin: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
  .cw-widget-media .out-head { border: 0; background: transparent; padding: 0 0 5px; gap: 6px; }
  .cw-widget-media .out-title { font-size: 10px; font-weight: 400; color: var(--text); opacity: .78; }
  .cw-widget-media .out-kind { display: none; }
  .cw-widget-media .out-btn { padding: 2px 0 2px 5px; border: 0; border-radius: 0; background: transparent; font-size: 10px; color: var(--text); opacity: .78; }
  .cw-widget-media .out-btn:hover { opacity: 1; text-decoration: underline; text-underline-offset: 3px; }
  .cw-widget-media .out-body { padding: 0; }
  .cw-widget-media .out-docs, .cw-widget-media .out-gal { grid-template-columns: 1fr; }
  .cw-widget-media .out-image img, .cw-widget-media .out-gal img { height: auto; max-height: 160px; object-fit: contain; background: transparent; border-radius: 6px; }
  .cw-widget-media .out-frame { border-radius: 6px; background: transparent; }
  .cw-widget-media .out-doc, .cw-widget-media .out-link, .cw-widget-media .out-source { padding: 5px 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
  .cw-widget-media .out-doc:hover, .cw-widget-media .out-link:hover { background: transparent; }
  .cw-widget-media .out-doc:hover .out-n, .cw-widget-media .out-link:hover strong { text-decoration: underline; text-underline-offset: 3px; }
  .cw-widget-media .out-ic { width: 23px; height: 23px; border-radius: 0; background: transparent !important; color: var(--text); opacity: .78; font-size: 9px; font-weight: 500; }
  .cw-widget-media .out-n, .cw-widget-media .out-link strong { font-size: 11px; font-weight: 500; }
  .cw-widget-media .out-m, .cw-widget-media .out-link small, .cw-widget-media .out-source, .cw-widget-media .out-note, .cw-widget-media .out-image figcaption, .cw-widget-media .out-gal figcaption { font-size: 10px; color: var(--text); opacity: .78; }
  .cw-widget-media .out-source a, .cw-widget-media .out-note a { color: var(--text); }
  .cw-widget-new { flex: none; width: 100%; border: 0; border-radius: 0; padding: 8px 0; font: inherit; font-size: 10.5px; color: var(--text); opacity: .78; background: transparent; cursor: pointer; display: flex; align-items: center; justify-content: flex-start; gap: 7px; }
  .cw-widget-new svg { width: 14px; height: 14px; }
  .cw-widget-new:hover { color: var(--text); opacity: 1; background: transparent; }
  .cw-widget-empty { margin: 0; padding: 14px 0; color: var(--text); opacity: .78; font-size: 11.5px; line-height: 1.6; }
  .cw-widget-toggle, .cw-widget-backdrop { display: none; }
  @media(max-width:1024px) {
    .cw .cw-msgs { padding-top:120px; scroll-padding-top:120px; }
    .cw-widget-toggle { position: absolute; left: 12px; top: 70px; z-index: 5; display: inline-flex; align-items: center; gap: 7px; min-height: 40px; padding: 7px 10px; border: 0; border-radius: 0; font: inherit; font-size: 11px; color: var(--text); background: transparent; cursor: pointer; }
    .cw-widget-toggle svg { width: 15px; height: 15px; }
    .cw-widget-count { min-width: 17px; height: 17px; padding: 0 3px; box-sizing: border-box; display: grid; place-items: center; border: 0; border-radius: 0; font-size: 10px; background: transparent; color: var(--text); opacity: .78; }
    .cw-widget-lane { display: none; position: absolute; z-index: 12; top: 118px; left: 12px; right: 12px; width: auto; max-width: 410px; max-height: calc(100% - 134px); padding: 14px 18px 16px; border: 0; border-radius: 24px; background: color-mix(in srgb,var(--card) 72%,transparent); backdrop-filter: blur(24px) saturate(1.1); -webkit-backdrop-filter: blur(24px) saturate(1.1); box-shadow: 0 18px 50px -28px rgba(18,44,70,.25); }
    .cw-widget-lane .cw-panel-card { padding: 10px 0; border-radius: 0; background: transparent; backdrop-filter: none; -webkit-backdrop-filter: none; box-shadow: none; }
    .cw.widgets-open .cw-widget-lane { display: flex; }
    .cw-widget-close { display: inline-flex; align-items: center; justify-content: center; min-width: 36px; min-height: 36px; }
    .cw-widget-dismiss { width: 32px; height: 32px; margin-top: -4px; }
    #cw .cw-widget-backdrop { position: absolute; inset: 0; z-index: 11; border: 0; padding: 0; background: color-mix(in srgb,var(--bg) 15%,transparent) !important; backdrop-filter: blur(14px) saturate(.85); -webkit-backdrop-filter: blur(14px) saturate(.85); }
    .cw.widgets-open .cw-widget-backdrop { display: block; }
  }
  @media(max-width:480px) { .cw-widget-toggle > .cw-widget-toggle-label { display: none; } .cw-widget-toggle { padding-inline: 10px; } }
  /* Every widget is an independent card in the top grid. */
  .cw .cw-msgs { padding-top: 120px; scroll-padding-top: 120px; }
  .cw-widget-toggle { position: absolute; left: 12px; top: 70px; z-index: 5; display: inline-flex; align-items: center; gap: 7px; min-height: 40px; border: 0; padding: 7px 10px; background: transparent; color: var(--text); cursor: pointer; }
  .cw-widget-toggle svg { width: 15px; height: 15px; }
  .cw-widget-lane { display: none; position: absolute; z-index: 12; top: 118px; left: 12px; right: 12px; width: auto; max-width: none; max-height: calc(100% - 134px); padding: 0 4px 12px; gap: 12px; border: 0; border-radius: 0; background: transparent; backdrop-filter: none; -webkit-backdrop-filter: none; box-shadow: none; }
  .cw.widgets-open .cw-widget-lane { display: flex; }
  .cw-widget-lane-head { padding: 0 12px; }
  .cw-widget-close { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; }
  .cw-widget-cards { display: grid; grid-template-columns: repeat(auto-fill,minmax(min(100%,280px),1fr)); align-items: start; gap: 14px; padding: 2px; }
  .cw-widget-lane .cw-panel-card { padding: 16px; border-radius: 22px; background: color-mix(in srgb,var(--card) 78%,transparent); backdrop-filter: blur(24px) saturate(1.1); -webkit-backdrop-filter: blur(24px) saturate(1.1); box-shadow: 0 12px 36px -26px rgba(18,44,70,.22); min-width: 0; }
  #cw .cw-widget-backdrop { display: none; position: absolute; inset: 0; z-index: 11; border: 0; padding: 0; background: color-mix(in srgb,var(--bg) 15%,transparent) !important; backdrop-filter: blur(14px) saturate(.85); -webkit-backdrop-filter: blur(14px) saturate(.85); }
  #cw.widgets-open .cw-widget-backdrop { display: block; }
  .cw-widget-new { width: auto; align-self: flex-start; padding: 8px 12px; font-size: 12px; }
  .cw-widget-new[hidden] { display: none !important; }
  .cw-widget-intent { display: flex; align-items: center; gap: 10px; padding: 6px 14px; font-size: 12px; color: var(--text); }
  .cw-widget-intent[hidden] { display: none; }
  .cw-widget-intent button { width: 28px; height: 28px; border: 0; border-radius: 50%; color: var(--text); background: transparent; }
  .cw-widget-intent svg { width: 14px; height: 14px; }
  .cw-widget-checks label { display: flex; gap: 8px; align-items: flex-start; cursor: pointer; }
  .cw-widget-checks input { margin: 3px 0 0; accent-color: var(--accent); }
  .cw-widget-app-frame { display: block; width: 100%; min-height: 180px; max-height: 900px; resize: vertical; overflow: auto; border: 0; border-radius: 10px; background: transparent; }
  .cw-widget-app-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .cw-widget-app-actions button { border: 1px solid var(--border2); border-radius: 12px; padding: 7px 10px; color: var(--text); font: inherit; font-size: 11px; cursor: pointer; }
  .cw-widget-options { width: 28px; height: 28px; border: 0; border-radius: 50%; padding: 0; color: var(--text); font-size: 18px; cursor: pointer; }
  [data-widget-drag] { cursor: grab; }
  .cw-widget-menu { margin: auto; min-width: 200px; border: 0; border-radius: 18px; padding: 10px; color: var(--text); background: var(--card); box-shadow: 0 12px 40px #0002; }
  .cw-widget-menu::backdrop { background: transparent; }
  .cw-widget-menu button { display: block; width: 100%; padding: 9px 12px; text-align: left; border: 0; border-radius: 10px; font: inherit; color: var(--text); cursor: pointer; }
  .cw-widget-app-modal .box { width: min(1000px,96vw); }
  .cw-widget-app-modal .cw-widget-card-body { padding: 12px; }
  .cw-widget-app-modal .cw-widget-app-frame { height: min(70vh,700px) !important; }
`;

export const COWORK_WIDGETS_JS = String.raw`
  function cwWidgetOrder(widget) { return typeof widget.order === 'number' ? widget.order : Date.parse(widget.createdAt); }
  function cwWidgetsShellHtml() {
    return '<button type="button" class="cw-widget-toggle" id="cwWidgetToggle" aria-label="Open widgets" aria-controls="cwWidgetLane" aria-expanded="false" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg><span class="cw-widget-toggle-label">Widgets</span><span class="cw-widget-count" id="cwWidgetCount" aria-live="polite" aria-atomic="true">0</span></button>' +
      '<button type="button" class="cw-widget-backdrop" id="cwWidgetBackdrop" aria-label="Close widgets" tabindex="-1" hidden></button>' +
      '<aside class="cw-widget-lane" id="cwWidgetLane" aria-labelledby="cwWidgetLaneTitle" tabindex="-1" hidden><div class="cw-widget-lane-head"><h2 id="cwWidgetLaneTitle">Widgets</h2><span></span><button type="button" class="cw-widget-close" id="cwWidgetClose" aria-label="Close widgets">' + cwIcon('close') + '</button></div><div class="cw-widget-cards" id="cwWidgetCards"></div><div style="display:flex;gap:12px"><button type="button" class="cw-widget-new" id="cwWidgetNew">' + cwIcon('plus') + 'Create a widget</button><button type="button" class="cw-widget-new" id="cwWidgetUndo" hidden>Undo dismiss</button></div></aside>';
  }
  function cwWidgetSafeUrl(value) {
    if (typeof outSafeUrl === 'function') return outSafeUrl(value, 'link');
    var url = String(value || '').trim();
    if (/^\/api\/cowork\/artifacts\/[\w-]+(?:\/preview)?(?:\?[^#\s]*)?(?:#[^\s]*)?$/.test(url)) return url;
    try { var parsed = new URL(url); return /^https?:$/.test(parsed.protocol) && !parsed.username && !parsed.password ? parsed.href : ''; } catch (e) { return ''; }
  }
  function cwWidgetLinkHtml(item) {
    var url = cwWidgetSafeUrl(item.url || item.href), host = '';
    if (!url) return '';
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) {}
    var title = item.title || item.label || item.name || host || 'Open file';
    var favicon = host ? typeof outFaviconHtml === 'function' ? outFaviconHtml(url) : typeof cwFaviconHtml === 'function' ? cwFaviconHtml(host) : '' : '';
    return '<a class="cw-widget-link" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer"><span class="cw-widget-link-icon">' + cwIcon('globe') + favicon + '</span><span class="cw-widget-link-info"><strong>' + esc(title) + '</strong><small>' + esc(item.caption || host || 'Shared file') + '</small></span><span class="cw-widget-link-arrow" aria-hidden="true">↗</span></a>';
  }
  function cwWidgetStatsHtml(items) {
    return items && items.length ? '<div class="cw-widget-stats">' + items.map(function (item) { return '<dl class="cw-widget-stat"><dt>' + esc(item.label) + '</dt><dd>' + esc(item.value) + '</dd></dl>'; }).join('') + '</div>' : '';
  }
  function cwWidgetCardBodyHtml(widget) {
    var d = widget && widget.data || {}, html = '';
    if (widget.kind === 'stats') html = cwWidgetStatsHtml(d.items || []);
    else if (widget.kind === 'list') html = '<ul class="cw-widget-checks">' + (d.items || []).map(function (item, index) { return '<li' + (item.done ? ' class="done"' : '') + '><label><input type="checkbox" data-widget-check="' + esc(widget.id) + '" data-index="' + index + '"' + (item.done ? ' checked' : '') + '><span>' + esc(item.text) + '</span></label></li>'; }).join('') + '</ul>';
    else if (widget.kind === 'app') html = '<iframe class="cw-widget-app-frame" data-widget-app="' + esc(widget.id) + '" src="/api/cowork/widgets/' + encodeURIComponent(widget.id) + '/app" title="' + esc(widget.title) + '" style="height:' + (d.height || 360) + 'px" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer"></iframe>' + '<div class="cw-widget-app-actions">' + (d.actions || []).map(function (action) { return '<button type="button" data-widget-action="' + esc(widget.id) + '" data-action="' + esc(action.name) + '">' + esc(action.label) + '</button>'; }).join('') + '</div>';
    else if (widget.kind === 'progress') { var value = Math.max(0, Math.min(100, Number(d.value) || 0)); html = '<div class="cw-widget-progress-label"><span>' + esc(d.label || 'Progress') + '</span><span>' + value + '%</span></div><div class="cw-widget-progress" role="progressbar" aria-label="' + esc(d.label || widget.title) + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + value + '"><span style="width:' + value + '%"></span></div>'; }
    else if (widget.kind === 'links') html = (d.items || []).map(cwWidgetLinkHtml).join('');
    else {
      if (d.text) html += '<p class="cw-widget-card-text">' + esc(d.text) + '</p>';
      if (widget.kind === 'rich') {
        html += cwWidgetStatsHtml(d.stats || []);
        if (d.schedule && d.schedule.length) html += '<div class="cw-widget-schedule">' + d.schedule.map(function (item) { var url = cwWidgetSafeUrl(item.url); return '<div class="cw-widget-event"><div><strong>' + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' : '') + esc(item.label) + (url ? '</a>' : '') + '</strong>' + (item.when ? '<time>' + esc(item.when) + '</time>' : '') + (item.note ? '<small>' + esc(item.note) + '</small>' : '') + '</div></div>'; }).join('') + '</div>';
        (d.items || []).forEach(function (item) {
          if (item.type === 'link') html += cwWidgetLinkHtml(item);
          else { var rendered = typeof outRenderBlock === 'function' ? outRenderBlock(item.type, item) : typeof outBlockHtml === 'function' ? outBlockHtml(item.type, JSON.stringify(item)) : ''; html += rendered ? '<div class="cw-widget-media">' + rendered + '</div>' : cwWidgetLinkHtml(item); }
        });
      }
    }
    return '<div class="cw-widget-card-body">' + (html || '<p class="cw-widget-empty">No content yet.</p>') + '</div>';
  }
  function cwWidgetCardHtml(widget) {
    var author = widget.createdByAgentId && cwAgentById(widget.createdByAgentId), updated = widget.updatedAt || widget.createdAt;
    var menu = 'cwWidgetMenu-' + widget.id;
    return '<article class="cw-panel-card" data-cw-widget-card="' + esc(widget.id) + '"><div class="cw-panel-card-head">' +
      '<span class="cw-panel-card-icon" draggable="true" data-widget-drag="' + esc(widget.id) + '" title="Drag to reorder" aria-hidden="true">' + cwWidgetIcon(widget) + '</span><h3>' + esc(widget.title) + '</h3>' +
      '<button type="button" class="cw-widget-options" popovertarget="' + esc(menu) + '" aria-label="Options for ' + esc(widget.title) + '">⋯</button>' +
      '<button type="button" class="cw-widget-dismiss" data-cw-widget-dismiss="' + esc(widget.id) + '" aria-label="Dismiss ' + esc(widget.title) + '" title="Dismiss widget">' + cwIcon('close') + '</button></div>' +
      '<div class="cw-widget-menu" id="' + esc(menu) + '" popover="auto">' + ['edit','share','up','down'].concat(widget.kind === 'app' ? ['expand','size'] : []).map(function (action) { var label = { edit:'Edit with agent',share:widget.shared ? 'Keep in this chat' : 'Show across chats',up:'Move up',down:'Move down',expand:'Expand app',size:'Resize card' }[action]; return '<button type="button" data-widget-option="' + esc(widget.id) + '" data-option="' + action + '">' + label + '</button>'; }).join('') + '</div>' +
      cwWidgetCardBodyHtml(widget) + '<footer class="cw-panel-card-foot"><span>' + esc(author ? author.name : widget.createdByAgentId ? 'Teammate' : 'You') + '</span>' + (updated ? '<span aria-hidden="true">·</span><time datetime="' + esc(updated) + '">' + esc(typeof shortDate === 'function' ? shortDate(updated) : updated) + '</time>' : '') + '</footer></article>';
  }
  function cwWidgetsClose(returnFocus) {
    var cw = cwEnsure(); cw.widgetsOpen = false; cwRenderWidgets();
    if (returnFocus !== false) { var trigger = $('cwWidgetToggle'); if (trigger && !trigger.hidden) trigger.focus(); }
  }
  function cwWidgetsToggle() {
    var cw = cwEnsure(); cw.widgetsOpen = !cw.widgetsOpen; cwRenderWidgets();
    if (cw.widgetsOpen) { var close = $('cwWidgetClose'); if (close) close.focus(); }
  }
  function cwBindWidgetControls() {
    var toggle = $('cwWidgetToggle'), close = $('cwWidgetClose'), backdrop = $('cwWidgetBackdrop'), add = $('cwWidgetNew'), cards = $('cwWidgetCards'), lane = $('cwWidgetLane');
    if (toggle) toggle.onclick = cwWidgetsToggle;
    if (close) close.onclick = function () { cwWidgetsClose(); };
    if (backdrop) backdrop.onclick = function () { cwWidgetsClose(); };
    if (add) add.onclick = function () { var conv = cwActiveConv(); if (conv) cwNewWidgetModal(conv); };
    var undo = $('cwWidgetUndo'), cw = cwEnsure();
    if (undo) { undo.hidden = !cw.widgetUndo; undo.onclick = function () { var previous = cw.widgetUndo; if (!previous) return; cwWidgetPatch(previous, { op:'restore' }).then(function () { cw.widgetUndo = null; cwRenderWidgets(); }).catch(function () {}); }; }
    if (cards) cards.ondragstart = function (event) { var handle = event.target.closest('[data-widget-drag]'); if (!handle) return; cw.dragWidgetId = handle.getAttribute('data-widget-drag'); event.dataTransfer.setData('text/plain',cw.dragWidgetId); event.dataTransfer.effectAllowed = 'move'; };
    if (cards) cards.ondragover = function (event) { if (cw.dragWidgetId && event.target.closest('[data-cw-widget-card]')) event.preventDefault(); };
    if (cards) cards.ondragend = function () { cw.dragWidgetId = null; };
    if (cards) cards.ondrop = function (event) {
      var target = event.target.closest('[data-cw-widget-card]'); if (!target || !cw.dragWidgetId) return; event.preventDefault();
      var widgets = cw.widgets || [], widget = widgets.find(function (item) { return item.id === cw.dragWidgetId; }), before = widgets.find(function (item) { return item.id === target.getAttribute('data-cw-widget-card'); });
      cw.dragWidgetId = null; if (widget && before && widget !== before) cwWidgetPatch(widget,{op:'layout',order:cwWidgetOrder(before)-1}).catch(function () {});
    };
    if (cards) cards.onchange = function (event) {
      var check = event.target.closest('[data-widget-check]'); if (!check) return;
      var widget = (cwEnsure().widgets || []).find(function (item) { return item.id === check.getAttribute('data-widget-check'); });
      if (!widget) return; check.disabled = true;
      cwWidgetPatch(widget, { op:'toggle',index:Number(check.getAttribute('data-index')),done:check.checked }).catch(function () { check.disabled = false; check.checked = !check.checked; });
    };
    if (cards) cards.onclick = function (event) {
      var option = event.target.closest('[data-widget-option]'), actionButton = event.target.closest('[data-widget-action]');
      if (option || actionButton) {
        var control = option || actionButton, id = control.getAttribute(option ? 'data-widget-option' : 'data-widget-action');
        var widgets = cwEnsure().widgets || [], widget = widgets.find(function (item) { return item.id === id; });
        if (!widget) return;
        var menu = control.closest('[popover]'); if (menu && menu.hidePopover) menu.hidePopover();
        if (actionButton) { var action = (widget.data.actions || []).find(function (item) { return item.name === control.getAttribute('data-action'); }); if (action) cwRunWidgetAction(widget, action); return; }
        var operation = option.getAttribute('data-option');
        if (operation === 'edit') cwBeginWidgetRequest('edit', widget);
        else if (operation === 'expand') cwWidgetOpenApp(widget);
        else if (operation === 'share') cwWidgetPatch(widget, { op:'layout',shared:!widget.shared }).catch(function () {});
        else if (operation === 'size') api('/api/cowork/widgets/' + encodeURIComponent(widget.id), {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({data:{height:widget.data.height >= 540 ? 240 : (widget.data.height || 360) + 180}})}).then(function (result) { cwWidgetMerge(result.widget); }).catch(function (error) { toast(error.message,true); });
        else if (operation === 'up' || operation === 'down') {
          var ordered = widgets.slice().sort(function (a,b) { return cwWidgetOrder(a) - cwWidgetOrder(b); });
          var neighbor = ordered[ordered.indexOf(widget) + (operation === 'up' ? -1 : 1)];
          if (neighbor) cwWidgetPatch(widget, { op:'layout',order:cwWidgetOrder(neighbor) + (operation === 'up' ? -1 : 1) }).catch(function () {});
        }
        return;
      }
      var button = event.target.closest('[data-cw-widget-dismiss]'); if (!button || !cards.contains(button)) return;
      var id = button.getAttribute('data-cw-widget-dismiss'), cw = cwEnsure(), conversationId = cw.active;
      button.disabled = true;
      api('/api/cowork/widgets/' + encodeURIComponent(id), { method: 'DELETE' }).then(function () {
        cw.widgetUndo = { id:id,conversationId:conversationId };
        if (cw.active === conversationId) { cw.widgets = (cw.widgets || []).filter(function (widget) { return widget.id !== id; }); cwRenderWidgets(); cwRenderRail(); var next = cards.querySelector('[data-cw-widget-dismiss]') || $('cwWidgetClose'); if (next && cw.widgetsOpen) next.focus(); }
        toast('Widget dismissed — you can undo it');
      }).catch(function (error) { button.disabled = false; toast(error.message, true); });
    };
    if (lane) lane.onkeydown = function (event) {
      if (!cwEnsure().widgetsOpen) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cwWidgetsClose(); }
      if (event.key !== 'Tab') return;
      var focusable = Array.prototype.slice.call(lane.querySelectorAll('button:not([disabled]),a[href],input,select,textarea,video[controls],audio[controls],[tabindex="0"]')).filter(function (element) { return !element.hidden && element.offsetParent !== null; });
      if (!focusable.length) { event.preventDefault(); lane.focus(); return; }
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === lane)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
  }
  function cwRenderWidgets() {
    var cw = cwEnsure(), lane = $('cwWidgetLane'), cards = $('cwWidgetCards'), toggle = $('cwWidgetToggle'), root = $('cw'), count = $('cwWidgetCount'), backdrop = $('cwWidgetBackdrop');
    if (!lane || !cards || !root) return;
    var conv = cwActiveConv(), visible = Boolean(conv && !cw.profileOpen && !cw.connectionsOpen), widgets = (cw.widgets || []).filter(function (widget) { return widget.conversationId === cw.active || widget.shared; }).sort(function (a,b) { return cwWidgetOrder(a) - cwWidgetOrder(b); });
    if (!visible) cw.widgetsOpen = false;
    if (cw.widgetConversationId !== cw.active) { cw.widgetsOpen = window.innerWidth > 1024 && widgets.length > 0; cw.widgetConversationId = cw.active; }
    if (cw.widgetCreationPending === cw.active && widgets.length > (cw.widgetLastCount || 0)) { cw.widgetsOpen = true; cw.widgetCreationPending = null; }
    cw.widgetLastCount = widgets.length;
    var open = visible && Boolean(cw.widgetsOpen), signature = cw.active + '|' + JSON.stringify(widgets) + '|' + JSON.stringify((cw.agents || []).map(function (agent) { return [agent.id,agent.name]; }));
    if (cards._widgetSignature !== signature) { cards._widgetSignature = signature; cwRenderWidgetGrid(cards,widgets); }
    lane.hidden = !open;
    lane.setAttribute('role','dialog'); if (open) lane.setAttribute('aria-modal','true'); else lane.removeAttribute('aria-modal');
    root.classList.toggle('widgets-open', open);
    if (toggle) { toggle.hidden = !visible; toggle.setAttribute('aria-expanded',String(open)); toggle.setAttribute('aria-label',(open ? 'Close' : 'Open') + ' widgets, ' + widgets.length + ' card' + (widgets.length === 1 ? '' : 's')); }
    if (count) count.textContent = String(widgets.length);
    if (backdrop) backdrop.hidden = !open;
    lane.querySelectorAll('iframe[data-widget-app]').forEach(function (frame) { if (frame._widgetVisible !== open) { frame._widgetVisible = open; if (frame.contentWindow) frame.contentWindow.postMessage({type:'gitu-widget-visibility',visible:open},'*'); } });
    cwBindWidgetControls();
  }
  window.addEventListener('resize', function () { if (S.active === 'cowork') cwRenderWidgets(); });
`;
