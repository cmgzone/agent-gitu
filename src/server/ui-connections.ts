// Connection requests expose only missing inputs. Known setup remains editable
// in a disclosure, and draft credentials stay only in the current form's DOM.
export const UI_CONNECTIONS_JS = String.raw`
  function connectionRequestFields(req) {
    var setup = req.setup || {};
    var values = { label: setup.label || req.providerHint || '', provider: req.providerHint || '', baseUrl: setup.baseUrl || '', documentationUrl: setup.documentationUrl || '', validationPath: setup.validationPath || '/', token: '' };
    var required = Array.isArray(req.requiredFields) ? req.requiredFields.slice() : (req.existingConnectionId || req.requestType === 'reauth' ? ['token'] : ['provider', 'baseUrl', 'token']);
    required = required.filter(function (key, index) {
      return ['provider', 'baseUrl', 'validationPath', 'token'].indexOf(key) >= 0 && required.indexOf(key) === index && (key === 'token' || !values[key]);
    });
    return { values: values, required: required };
  }

  function connectionInputHtml(key, value, required) {
    var labels = { label: 'Connection name', provider: 'Provider', baseUrl: 'API address', documentationUrl: 'API documentation', validationPath: 'Connection test path', token: 'API key or access token' };
    var hints = { label: 'A name you will recognize', provider: 'For example: github', baseUrl: 'https://api.example.com', documentationUrl: 'https://docs.example.com', validationPath: '/ or a documented read-only route', token: 'Paste your key here' };
    var type = key === 'token' ? 'password' : (key === 'baseUrl' || key === 'documentationUrl' ? 'url' : 'text');
    return '<label class="connection-field"><span>' + labels[key] + (required ? '' : ' <small>optional</small>') + '</span><input data-connection-field="' + key + '" name="' + key + '" type="' + type + '" value="' + esc(value) + '" placeholder="' + hints[key] + '" autocomplete="' + (key === 'token' ? 'new-password' : 'off') + '"' + (required ? ' required' : '') + ' spellcheck="false"></label>';
  }

  function renderConnectionRequest(runId, session) {
    var stream = $('stream');
    var sess = S.sessions[runId];
    if (!stream || !sess) return;
    var pending = session.pendingConnection;
    var cards = stream.querySelectorAll('.connection-card');
    if (!pending) {
      sess.connShown = null;
      for (var oi = 0; oi < cards.length; oi++) cards[oi].remove();
      return;
    }
    // A poll must never replace inputs while the user is typing, and opening
    // the task again must recreate its form even if the request id is unchanged.
    if (sess.connShown === pending.id && cards.length) return;
    sess.connShown = pending.id;
    for (var i = 0; i < cards.length; i++) cards[i].remove();
    var req = pending.requirement || {};
    var model = connectionRequestFields(req);
    var values = model.values, required = model.required;
    var label = values.label || 'your provider';
    var isModelProvider = req.credentialTarget && req.credentialTarget.kind === 'model-provider';
    var config = isModelProvider ? [] : ['label', 'provider', 'baseUrl', 'documentationUrl', 'validationPath'];
    var primary = required.map(function (key) { return connectionInputHtml(key, values[key], true); }).join('');
    var advanced = config.filter(function (key) { return required.indexOf(key) < 0; }).map(function (key) { return connectionInputHtml(key, values[key], false); }).join('');
    var submitLabel = required.length === 1 && required[0] === 'token' ? 'Save key and continue' : 'Connect and continue';
    var div = document.createElement('div');
    div.className = 'qcard connection-card';
    div.innerHTML = '<h3>' + (req.requestType === 'reauth' ? 'Update access to ' : 'Connect ') + esc(label) + '</h3>' +
      '<div class="meta-line">' + (req.requestType === 'reauth' ? 'Your saved key needs to be replaced. Your other connection settings are already saved.' : esc(req.description || 'Access is needed to continue this task.')) + '</div>' +
      (req.requiredFor ? '<div class="hint">Needed for: ' + esc(req.requiredFor) + '</div>' : '') +
      '<form class="connection-form"><div class="connection-fields">' + primary + '</div>' +
      (required.indexOf('token') >= 0 ? '<div class="connection-secret-actions"><span class="hint">Saved securely on this device. Never sent to the model or task history.</span><button class="btn ghost" type="button" data-showconnectionkey aria-pressed="false">Show key</button></div>' : '') +
      (advanced ? '<details class="connection-details"><summary>Review connection settings</summary><div class="connection-fields">' + advanced + '</div></details>' : '') +
      '<div class="connection-error" role="alert" hidden></div><div class="actions"><button type="submit" class="btn dark" data-saveconnection>' + submitLabel + '</button></div></form>';
    var working = $('working');
    if (working) stream.insertBefore(div, working); else stream.appendChild(div);
    stickScroll(stream, true);
    var form = div.querySelector('form');
    var save = div.querySelector('[data-saveconnection]');
    var error = div.querySelector('.connection-error');
    var reveal = div.querySelector('[data-showconnectionkey]');
    if (reveal) reveal.onclick = function () {
      var token = div.querySelector('[data-connection-field="token"]');
      var showing = token.type === 'password';
      token.type = showing ? 'text' : 'password';
      reveal.textContent = showing ? 'Hide key' : 'Show key';
      reveal.setAttribute('aria-pressed', String(showing));
    };
    form.onsubmit = function (event) {
      event.preventDefault();
      if (save.disabled || !form.reportValidity()) return;
      var body = {};
      div.querySelectorAll('[data-connection-field]').forEach(function (input) {
        var key = input.getAttribute('data-connection-field');
        var value = input.value.trim();
        // Credential refreshes only submit changed settings, so a one-field
        // form cannot accidentally overwrite a saved endpoint or operation.
        if (!req.existingConnectionId || required.indexOf(key) >= 0 || value !== values[key]) body[key] = value;
      });
      if (!req.existingConnectionId && !isModelProvider) {
        body.label = body.label || body.provider;
        body.validationPath = body.validationPath || '/';
        body.capabilities = req.capabilities || [];
      }
      save.disabled = true; save.textContent = 'Checking connection…'; error.hidden = true;
      api('/api/runs/' + encodeURIComponent(runId) + '/connection', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        .then(function () {
          var token = div.querySelector('[data-connection-field="token"]');
          if (token) token.value = '';
          toast('Connection ready — continuing your task');
          pollRun(runId);
        })
        .catch(function (e) {
          save.disabled = false; save.textContent = submitLabel;
          error.textContent = (e && e.message) || 'Could not connect. Check the details and try again.';
          error.hidden = false;
        });
    };
  }
`;
