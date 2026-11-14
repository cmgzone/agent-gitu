import { UI_THEME_CSS } from './ui-theme.js';
import { UI_BUTTON_CSS } from './ui-buttons.js';

export function authPage(setup: boolean, local: boolean, requiresEmail = true, remoteRegistration = false, lanLogin = false, options: { google?: boolean; link?: boolean; pikrouterOAuth?: boolean } = {}): string {
  return `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in with Pikpam — Agent Gitu</title><style>${UI_THEME_CSS}
*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,sans-serif;padding:24px}.auth{width:100%;max-width:430px;background:var(--card);border:1px solid var(--border);border-radius:24px;padding:30px 28px;box-shadow:var(--shadow-float)}.brand-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 20px}.brand{color:var(--accent);font-weight:700;margin:0;font-size:15px}.pik-badge{font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);border:1px solid color-mix(in srgb,var(--accent) 28%,transparent)}h1{font-size:26px;line-height:1.22;letter-spacing:-.03em;margin:0 0 8px}.hint{color:var(--muted);margin:0 0 24px;font-size:14px}.pik-oauth-btn{width:100%;margin:0 0 16px;border:0;border-radius:9999px;padding:14px 18px;background:var(--dark);color:var(--bg);font:600 15px system-ui;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:var(--shadow);transition:opacity .15s,transform .1s}.pik-oauth-btn:hover{opacity:.9}.pik-oauth-btn:active{transform:scale(.99)}.pik-oauth-btn:disabled{opacity:.65;cursor:wait}.auth-divider{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:12px;margin:12px 0 16px}.auth-divider::before,.auth-divider::after{content:'';flex:1;height:1px;background:var(--border)}.error{color:var(--err);margin:14px 0 0;font-size:14px;background:var(--err-dim,rgba(239,68,68,.1));padding:10px 14px;border-radius:12px}.note{font-size:12px;color:var(--muted);margin-top:20px;text-align:center;line-height:1.5}
${UI_BUTTON_CSS}</style></head><body><main class="auth"><div class="brand-row"><p class="brand">Agent Gitu</p><span class="pik-badge">Pikpam Hosted Auth</span></div><h1 id="authHeading">Sign in with Pikpam</h1><p class="hint" id="authHint">Sign in or create your account using Pikpam Hosted Authorization to unlock Agent Gitu and start routing AI requests.</p><button type="button" class="pik-oauth-btn" id="pikOAuthBtn"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg><span>Continue with Pikpam</span></button>${options.google ? '<div class="auth-divider"><span>or</span></div><button type="button" class="btn ghost" id="googleBtn" style="width:100%;padding:12px;border-radius:11px;display:flex;align-items:center;justify-content:center;gap:8px"><span>Continue with Google</span></button>' : ''}<p class="error" role="alert" id="error" hidden></p><p class="note" id="authNote">You will be redirected to Pikpam (pikpam.com) to securely authorize or register your account, then returned to Agent Gitu.</p></main><script>
${lanLogin && !setup ? "const note=document.querySelector('.note');if(note)note.textContent+=' Local HTTP login is enabled. Passwords and workspace data are unencrypted; use only trusted Wi-Fi.';" : ''}
const PIKPAM_AUTHORIZE_BASE = 'https://pikpam.com/oauth/authorize?client_id=client_gitu_agent';
const pikOAuthBtn = document.getElementById('pikOAuthBtn');
const error = document.getElementById('error');

if (pikOAuthBtn) {
  pikOAuthBtn.onclick = async () => {
    pikOAuthBtn.disabled = true;
    pikOAuthBtn.textContent = 'Redirecting to Pikpam…';
    try {
      // Request a server-generated state token that is also bound to an HttpOnly cookie.
      // This prevents link-sharing and CSRF: the cookie is browser-only and cannot be
      // shared with another person even if they receive the callback URL.
      const startRes = await fetch('/api/auth/pikrouter/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ redirectPath: '/callback' })
      });
      const startData = await startRes.json().catch(() => ({}));
      if (!startRes.ok) throw new Error(startData.error || 'Could not start Pikpam sign-in.');
      window.location.href = startData.authUrl || (PIKPAM_AUTHORIZE_BASE + '&redirect_uri=' + encodeURIComponent(window.location.origin + '/callback'));
    } catch (e) {
      if (error) { error.textContent = (e && e.message) ? e.message : String(e); error.hidden = false; }
      pikOAuthBtn.disabled = false;
      pikOAuthBtn.textContent = 'Continue with Pikpam';
    }
  };
}

const params = new URLSearchParams(window.location.search);
const callbackToken = params.get('token');
const userEmail = params.get('email');
const userId = params.get('user_id');
const callbackState = params.get('state');

if (callbackToken) {
  // Immediately strip the token from the URL so it cannot be shared, bookmarked, or logged.
  if (window.history && window.history.replaceState) {
    window.history.replaceState({}, '', window.location.pathname + (window.location.hash || ''));
  }
  try { localStorage.setItem('auth_token', callbackToken); } catch (e) {}
  if (pikOAuthBtn) {
    pikOAuthBtn.disabled = true;
    pikOAuthBtn.textContent = 'Verifying with Pikpam…';
  }
  // POST the token + echoed state to the server. The server validates the echoed state
  // against the HttpOnly cookie it set when the login was initiated. If another person
  // navigated to the same callback URL, their browser won't have the matching cookie.
  fetch('/api/auth/pikrouter', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: callbackToken, email: userEmail, userId: userId, state: callbackState })
  }).then(async response => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not complete Pikpam sign-in.');
    location.replace('/');
  }).catch(e => {
    if (error) { error.textContent = (e && e.message) ? e.message : String(e); error.hidden = false; }
    if (pikOAuthBtn) {
      pikOAuthBtn.disabled = false;
      pikOAuthBtn.textContent = 'Continue with Pikpam';
    }
  });
}

${options.google ? `const googleBtn = document.getElementById('googleBtn');
if (googleBtn) {
  googleBtn.onclick = async () => {
    googleBtn.disabled = true;
    try {
      const response = await fetch('/api/auth/google/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ link: ${JSON.stringify(Boolean(options.link))} })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not start Google sign-in.');
      if (data.url) window.location.href = data.url;
    } catch (e) {
      if (error) { error.textContent = e.message; error.hidden = false; }
      googleBtn.disabled = false;
    }
  };
}` : ''}
</script></body></html>`;
}
