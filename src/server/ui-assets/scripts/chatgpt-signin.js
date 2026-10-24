  function showChatgptSignIn(container, result, options) {
    options = options || {};
    if (container.chatgptSignInStop) container.chatgptSignInStop();
    var previous = container.querySelector('.chatgpt-signin');
    if (previous) previous.remove();
    if (result.alreadySignedIn) { if (options.onConnected) options.onConnected(); return; }
    var card = document.createElement('section');
    card.className = 'chatgpt-signin'; card.setAttribute('aria-label', 'Connect your ChatGPT account');
    card.innerHTML = '<div class="chatgpt-signin-eyebrow">CONNECT CHATGPT</div><h3>Finish signing in</h3>' +
      (result.userCode ? '<p>Your sign-in code is right here. You do not need a terminal.</p><label class="chatgpt-signin-label">Your one-time code<input class="chatgpt-signin-code" aria-label="Your one-time OpenAI sign-in code" readonly autocomplete="off" spellcheck="false"></label><div class="chatgpt-signin-actions"><button type="button" class="btn ghost" data-copy-code>Copy code</button><a class="btn dark" data-open-signin target="_blank" rel="noopener">Open OpenAI</a></div><ol><li>Copy the code above.</li><li>Open OpenAI and paste it into the code boxes.</li><li>Approve access, then return here. We will connect automatically.</li></ol><p class="chatgpt-signin-help">When OpenAI says “code displayed in your terminal”, use the code shown above in Agent Gitu.</p>' : '<p>Open OpenAI, approve access to your ChatGPT account, then return here.</p><div class="chatgpt-signin-actions"><a class="btn dark" data-open-signin target="_blank" rel="noopener">Open OpenAI</a></div>') +
      '<p class="chatgpt-signin-status" role="status" aria-live="polite">Waiting for you to approve in OpenAI…</p><button type="button" class="btn ghost" data-retry-signin hidden>Get a new code</button>';
    var status = card.querySelector('.chatgpt-signin-status');
    var code = card.querySelector('.chatgpt-signin-code');
    var copy = card.querySelector('[data-copy-code]');
    var link = card.querySelector('[data-open-signin]');
    link.href = result.url || result.authUrl;
    if (code) code.value = result.userCode;
    if (copy) copy.onclick = function () {
      code.focus(); code.select();
      Promise.resolve().then(function () { return navigator.clipboard.writeText(result.userCode); }).then(function () {
        copy.textContent = 'Copied'; status.textContent = 'Code copied. Choose Open OpenAI, then paste it into the code boxes.';
      }).catch(function () { status.textContent = 'The code is selected. Use Copy on your device, then choose Open OpenAI.'; });
    };
    container.appendChild(card);
    card.scrollIntoView({ block: 'start', behavior: 'instant' });
    var timer, stopped = false, deadline = Date.now() + 5 * 60 * 1000;
    function stop() { stopped = true; clearTimeout(timer); }
    container.chatgptSignInStop = stop;
    function expired() {
      stop(); card.dataset.state = 'expired';
      status.textContent = 'This sign-in attempt ended. Get a new code to try again.';
      if (copy) copy.disabled = true;
      link.hidden = true;
      var retry = card.querySelector('[data-retry-signin]'); retry.hidden = false;
      retry.onclick = function () { if (options.onRetry) options.onRetry(); };
      if (options.onEnded) options.onEnded();
    }
    function poll() {
      if (stopped || !card.isConnected) { stop(); return; }
      if (Date.now() >= deadline) { expired(); return; }
      api('/api/chatgpt/auth').then(function (state) {
        if (stopped || !card.isConnected) return;
        if (state && state.loggedIn) {
          stop(); card.dataset.state = 'connected';
          card.innerHTML = '<h3>ChatGPT connected</h3><p role="status">You are ready to use your ChatGPT subscription in Agent Gitu.</p>';
          if (options.onConnected) options.onConnected();
          return;
        }
        if (state && state.loginPending === false) { expired(); return; }
        timer = setTimeout(poll, 2000);
      }).catch(function () { if (!stopped) timer = setTimeout(poll, 2000); });
    }
    timer = setTimeout(poll, 1500);
    if (!result.userCode && result.url) window.open(result.url, '_blank', 'noopener');
    return { stop: stop, card: card };
  }
