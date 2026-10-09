/** Bridge only frames mounted by the host. App scripts never receive host APIs. */
export const WIDGET_APP_RUNTIME_JS = String.raw`
  function cwWidgetIntentHtml() {
    return '<div class="cw-widget-intent" id="cwWidgetIntent" hidden><span id="cwWidgetIntentLabel"></span><button type="button" id="cwWidgetIntentCancel" aria-label="Cancel widget request">' + cwIcon('close') + '</button></div>';
  }
  function cwRenderWidgetIntent() {
    var cw = cwEnsure(), box = $('cwWidgetIntent'), input = $('cwInput'), label = $('cwWidgetIntentLabel'), cancel = $('cwWidgetIntentCancel');
    if (!box || !input) return;
    if (!input.dataset.messagePlaceholder) input.dataset.messagePlaceholder = input.getAttribute('placeholder') || 'Message your agent';
    var request = cw.widgetRequest;
    box.hidden = !request;
    if (label) label.textContent = request ? request.mode === 'create' ? 'Create a widget' : request.mode === 'edit' ? 'Edit widget' : 'Widget action' : '';
    input.placeholder = request ? request.mode === 'create' ? 'Describe the widget or mini app you want…' : 'Tell your agent what to change or do…' : input.dataset.messagePlaceholder;
    if (cancel) cancel.onclick = function () { cw.widgetRequest = null; cwSaveDraft(); cwRenderWidgetIntent(); input.focus(); };
  }
  function cwBeginWidgetRequest(mode, widget, action, values) {
    var cw = cwEnsure();
    if (widget && widget.conversationId !== cw.active) { cwOpenConv(widget.conversationId); cw = cwEnsure(); }
    cwWidgetsClose(false);
    if (typeof cwClosePanels === 'function') cwClosePanels();
    cw.widgetRequest = { mode: mode, widgetId: widget && widget.id, action: action && action.name, input: values || undefined };
    var input = $('cwInput');
    if (!input) return;
    if (action) input.value = (input.value.trim() ? input.value + '\n\n' : '') + action.prompt;
    cwRenderWidgetIntent(); cwSaveDraft(); cwRenderComposerAction(); input.focus();
  }
  function cwWidgetMerge(updated) {
    var cw = cwEnsure();
    cw.widgets = (cw.widgets || []).filter(function (widget) { return widget.id !== updated.id; }).concat([updated]);
    cwRenderWidgets();
  }
  function cwWidgetPatch(widget, payload) {
    return api('/api/cowork/widgets/' + encodeURIComponent(widget.id), { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }).then(function (result) { cwWidgetMerge(result.widget); return result.widget; }).catch(function (error) { toast(error.message, true); throw error; });
  }
  function cwRunWidgetAction(widget, action) {
    var cw = cwEnsure(), key = widget.id + '/' + action.name;
    if (!cw.widgetActionLocks) cw.widgetActionLocks = {};
    if (cw.widgetActionLocks[key]) return;
    cw.widgetActionLocks[key] = true;
    return api('/api/cowork/conversations/' + encodeURIComponent(widget.conversationId) + '/messages', { method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ id:crypto.randomUUID(),text:action.prompt,widgetRequest:{mode:'action',widgetId:widget.id,action:action.name} }) }).then(function () { if (cw.active === widget.conversationId) cwPoll(); }).catch(function (error) { toast(error.message,true); }).finally(function () { delete cw.widgetActionLocks[key]; });
  }
  function cwWidgetOpenApp(widget) {
    var modal = document.createElement('div'); modal.className = 'modal cw-modal cw-widget-app-modal';
    modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true'); modal.setAttribute('aria-label',widget.title);
    modal.innerHTML = '<div class="box"><div class="bar"><strong>' + esc(widget.title) + '</strong><span style="flex:1"></span><button type="button" id="cwWidgetAppClose">Close</button></div>' + cwWidgetCardBodyHtml(widget) + '</div>';
    document.body.appendChild(modal); var close = cwBindDialog(modal, '#cwWidgetAppClose'); modal.querySelector('#cwWidgetAppClose').onclick = close;
  }
  function cwWidgetCardSignature(widget) {
    var copy = Object.assign({}, widget), data = Object.assign({}, widget.data);
    if (widget.kind === 'app') { delete data.state; delete copy.stateRevision; delete copy.updatedAt; }
    copy.data = data; return JSON.stringify(copy);
  }
  function cwRenderWidgetGrid(cards, widgets) {
    if (!widgets.length) { cards.innerHTML = '<p class="cw-widget-empty">Describe a widget or mini app to your agent to get started.</p>'; return; }
    Array.prototype.slice.call(cards.children).forEach(function (card) { if (!widgets.some(function (widget) { return card.getAttribute('data-cw-widget-card') === widget.id; })) card.remove(); });
    widgets.forEach(function (widget, index) {
      var signature = cwWidgetCardSignature(widget), card = cards.querySelector('[data-cw-widget-card="' + widget.id + '"]');
      if (!card || card._widgetSignature !== signature) {
        var wrapper = document.createElement('div'); wrapper.innerHTML = cwWidgetCardHtml(widget);
        var next = wrapper.firstElementChild; next._widgetSignature = signature;
        if (card) card.replaceWith(next); else cards.appendChild(next);
        card = next;
      } else if (widget.kind === 'app') {
        var frame = card.querySelector('iframe[data-widget-app]');
        if (frame && frame.contentWindow) frame.contentWindow.postMessage({ type:'gitu-widget-state',state:widget.data.state || {} }, '*');
      }
      if (cards.children[index] !== card) cards.insertBefore(card, cards.children[index] || null);
    });
  }
  window.addEventListener('message', function (event) {
    var message = event.data;
    if (!message || message.type !== 'gitu-widget' || typeof message.id !== 'string') return;
    var frame = Array.prototype.find.call(document.querySelectorAll('iframe[data-widget-app]'), function (node) { return node.contentWindow === event.source; });
    if (!frame) return;
    var widget = (cwEnsure().widgets || []).find(function (item) { return item.id === frame.getAttribute('data-widget-app'); });
    if (!widget || widget.kind !== 'app') return;
    var payload = message.payload || {}, result;
    function reply(value, error) { if (frame.isConnected) frame.contentWindow.postMessage({ type: 'gitu-widget-result', id: message.id, result: value, error: error }, '*'); }
    if (message.method === 'resize') { frame.style.height = Math.max(180, Math.min(900, Number(payload.height) || 360)) + 'px'; reply(true); return; }
    if (message.method === 'agent') {
      var action = (widget.data.actions || []).find(function (item) { return item.name === payload.name; });
      if (!action) { reply(null, 'Unknown widget action'); return; }
      cwBeginWidgetRequest('action', widget, action, payload.input); reply({ staged: true }); return;
    }
    if (['state','saveState','fetch'].indexOf(message.method) < 0) { reply(null, 'Unsupported widget request'); return; }
    if (message.method === 'fetch' && frame.offsetParent === null) { reply(null, 'widget-hidden'); return; }
    result = api('/api/cowork/widgets/' + encodeURIComponent(widget.id) + '/runtime', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: message.method, state: payload, name: payload.name, params:payload.params }) });
    result.then(function (response) {
      if (message.method === 'saveState') { widget.data.state = response.state; widget.stateRevision = response.revision; }
      reply(message.method === 'fetch' ? response.data : response.state);
    }).catch(function (error) { reply(null, error.message); });
  });
`;
