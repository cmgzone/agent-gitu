import { UI_THEME_CSS } from './ui-theme.js';
import { UI_BUTTON_CSS } from './ui-buttons.js';

export function authPage(setup: boolean, local: boolean, requiresEmail = true, remoteRegistration = false, lanLogin = false, _options: { google?: boolean; link?: boolean } = {}): string {
  const initialMode = setup ? 'register' : 'login';
  const canRenderForm = !setup || local || remoteRegistration;
  return `<!doctype html><html data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${setup ? 'Create account with PikRouter —' : 'Sign in with PikRouter —'} Agent Gitu</title><style>${UI_THEME_CSS}
*{box-sizing:border-box}body{margin:0;min-height:100dvh;display:grid;place-items:center;background:var(--bg);color:var(--text);font:15px/1.6 system-ui,sans-serif;padding:24px}.auth{width:100%;max-width:430px;background:var(--card);border:1px solid var(--border);border-radius:18px;padding:28px 26px;box-shadow:0 16px 40px rgba(15,23,42,.06)}.brand-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 20px}.brand{color:var(--accent);font-weight:700;margin:0;font-size:15px}.pik-badge{font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);border:1px solid color-mix(in srgb,var(--accent) 28%,transparent)}h1{font-size:26px;line-height:1.22;letter-spacing:-.03em;margin:0 0 8px}.hint{color:var(--muted);margin:0 0 20px;font-size:14px}.pik-oauth-btn{width:100%;margin:0 0 18px;border:0;border-radius:11px;padding:13px 16px;background:var(--accent);color:var(--on-accent);font:600 15px system-ui;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 6px 18px color-mix(in srgb,var(--accent) 28%,transparent)}.pik-oauth-btn:hover{filter:brightness(1.05)}.auth-divider{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:12px;margin:0 0 16px}.auth-divider::before,.auth-divider::after{content:'';flex:1;height:1px;background:var(--border)}.auth-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:4px;background:var(--bg2,rgba(148,163,184,.12));border:1px solid var(--border);border-radius:12px;margin:0 0 16px}.auth-tab{margin:0;width:100%;padding:8px 10px;border-radius:8px;border:0;background:transparent;color:var(--muted);font:600 13px system-ui;cursor:pointer;transition:background .15s,color .15s}.auth-tab.active{background:var(--card);color:var(--text);box-shadow:0 1px 3px rgba(15,23,42,.08)}label{display:block;margin:14px 0 6px;font-weight:600;font-size:13px}input{width:100%;border:1px solid var(--border2);border-radius:10px;padding:11px 14px;font:inherit;background:var(--bg);color:var(--text)}input:focus{outline:2px solid var(--accent);outline-offset:2px}button#submit{width:100%;margin-top:20px;border:1px solid var(--border2);border-radius:10px;padding:11px;background:var(--bg);color:var(--text);font:600 14px system-ui;cursor:pointer}button:disabled{opacity:.6;cursor:wait}.error{color:var(--err);margin-top:14px;font-size:14px}.note{font-size:12px;color:var(--muted);margin-top:18px;text-align:center}
${UI_BUTTON_CSS}</style></head><body><main class="auth"><div class="brand-row"><p class="brand">Agent Gitu</p><span class="pik-badge">PikRouter Unified Auth</span></div><h1 id="authHeading">${setup ? 'Create your account' : 'Sign in with PikRouter'}</h1><p class="hint" id="authHint">${setup ? (local || remoteRegistration ? 'Continue with PikRouter to sign in or register your account and automatically configure your default AI provider.' : 'Sign in or create the first PikRouter account on the computer running Agent Gitu, then return here.') : 'Use your PikRouter account to unlock Agent Gitu and connect your default AI provider.'}</p>${canRenderForm ? `<button type="button" class="pik-oauth-btn" id="pikOAuthBtn"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg><span>Continue with PikRouter (Sign In / Register)</span></button><div class="auth-divider"><span>or use PikRouter email &amp; password</span></div><div class="auth-tabs" role="tablist" aria-label="PikRouter authentication mode"><button type="button" class="auth-tab${initialMode === 'login' ? ' active' : ''}" id="tabLogin" data-mode="login">Sign in with PikRouter</button><button type="button" class="auth-tab${initialMode === 'register' ? ' active' : ''}" id="tabRegister" data-mode="register">Create your account</button></div><form id="authForm" data-mode="${initialMode}">${setup && !local && remoteRegistration ? '<label for="registrationToken">Private setup code</label><input id="registrationToken" name="registrationToken" type="password" autocomplete="off" required>' : ''}<div id="nameGroup"${initialMode === 'register' ? '' : ' hidden'}><label for="name">Your name</label><input id="name" name="name" type="text" autocomplete="name" placeholder="Ada Lovelace"${initialMode === 'register' ? ' required' : ''}></div>${setup || requiresEmail ? '<label for="email">PikRouter email</label><input id="email" name="email" type="email" autocomplete="username" placeholder="you@example.com" required autofocus>' : '<label for="email">PikRouter email</label><input id="email" name="email" type="email" autocomplete="username" placeholder="you@example.com" required autofocus>'}<label for="password" id="passwordLabel">${initialMode === 'register' ? 'Create password' : 'Password'}</label><input id="password" name="password" type="password" autocomplete="${initialMode === 'register' ? 'new-password' : 'current-password'}" minlength="6" required><div id="confirmGroup"${initialMode === 'register' ? '' : ' hidden'}><label for="confirm">Confirm password</label><input id="confirm" type="password" autocomplete="new-password" minlength="6"${initialMode === 'register' ? ' required' : ''}></div><p class="error" role="alert" id="error" hidden></p><button id="submit" type="submit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg><span id="submitLabel">${initialMode === 'register' ? 'Create PikRouter account' : 'Sign in with PikRouter'}</span></button></form><p class="note" id="authNote">${initialMode === 'register' ? 'Creates a PikRouter account with starter credits and sets PikRouter as your default AI provider.' : 'Authenticates with PikRouter (pikrouter.pikpam.com) and configures your default AI provider automatically.'}</p>` : ''}</main><script>
${lanLogin && !setup ? "const note=document.querySelector('.note');if(note)note.textContent+=' Local HTTP login is enabled. Passwords and workspace data are unencrypted; use only trusted Wi-Fi.';" : ''}
const form = document.getElementById('authForm');
const pikOAuthBtn = document.getElementById('pikOAuthBtn');
const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const heading = document.getElementById('authHeading');
const nameGroup = document.getElementById('nameGroup');
const nameInput = document.getElementById('name');
const confirmGroup = document.getElementById('confirmGroup');
const confirmInput = document.getElementById('confirm');
const passwordInput = document.getElementById('password');
const passwordLabel = document.getElementById('passwordLabel');
const submitLabel = document.getElementById('submitLabel');
const authNote = document.getElementById('authNote');
const error = document.getElementById('error');

if (pikOAuthBtn) {
  pikOAuthBtn.onclick = () => {
    pikOAuthBtn.disabled = true;
    const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
    try { localStorage.setItem('pikrouter_oauth_state', state); } catch (e) {}
    const redirectUri = window.location.origin + '/callback';
    const authUrl = \`https://pikrouter.pikpam.com/oauth/authorize?client_id=client_nexus_65f8f5f9a0c92bf1&redirect_uri=\${encodeURIComponent(redirectUri)}&state=\${encodeURIComponent(state)}\`;
    window.location.href = authUrl;
  };
}

const params = new URLSearchParams(window.location.search);
const callbackToken = params.get('token');
const userEmail = params.get('email');
const userId = params.get('user_id');
const callbackState = params.get('state');
if (callbackToken) {
  try { localStorage.setItem('auth_token', callbackToken); } catch (e) {}
  if (pikOAuthBtn) {
    pikOAuthBtn.disabled = true;
    pikOAuthBtn.textContent = 'Completing PikRouter sign-in…';
  }
  fetch('/api/auth/pikrouter', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: callbackToken, email: userEmail, userId: userId, state: callbackState })
  }).then(async response => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not complete PikRouter sign-in.');
    location.replace('/');
  }).catch(e => {
    if (error) { error.textContent = e.message; error.hidden = false; }
    if (pikOAuthBtn) { pikOAuthBtn.disabled = false; pikOAuthBtn.textContent = 'Continue with PikRouter (Sign In / Register)'; }
  });
}

let authMode = ${JSON.stringify(initialMode)};
function setAuthMode(mode) {
  authMode = mode === 'register' ? 'register' : 'login';
  if (form) form.dataset.mode = authMode;
  if (tabLogin) tabLogin.classList.toggle('active', authMode === 'login');
  if (tabRegister) tabRegister.classList.toggle('active', authMode === 'register');
  if (heading) heading.textContent = authMode === 'register' ? 'Create your account' : 'Sign in with PikRouter';
  if (nameGroup) nameGroup.hidden = authMode !== 'register';
  if (nameInput) nameInput.required = authMode === 'register';
  if (confirmGroup) confirmGroup.hidden = authMode !== 'register';
  if (confirmInput) confirmInput.required = authMode === 'register';
  if (passwordLabel) passwordLabel.textContent = authMode === 'register' ? 'Create password' : 'Password';
  if (passwordInput) passwordInput.autocomplete = authMode === 'register' ? 'new-password' : 'current-password';
  if (submitLabel) submitLabel.textContent = authMode === 'register' ? 'Create PikRouter account' : 'Sign in with PikRouter';
  if (authNote) authNote.textContent = authMode === 'register'
    ? 'Creates a PikRouter account with starter credits and sets PikRouter as your default AI provider.'
    : 'Authenticates with PikRouter (pikrouter.pikpam.com) and configures your default AI provider automatically.';
  if (error) error.hidden = true;
}
if (tabLogin) tabLogin.onclick = () => setAuthMode('login');
if (tabRegister) tabRegister.onclick = () => setAuthMode('register');
if (form) form.onsubmit = async event => {
  event.preventDefault();
  const button = document.getElementById('submit');
  if (error) error.hidden = true;
  if (authMode === 'register' && confirmInput && passwordInput.value !== confirmInput.value) {
    error.textContent = 'The passwords do not match.';
    error.hidden = false;
    return;
  }
  button.disabled = true;
  try {
    const response = await fetch('/api/auth/pikrouter', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        mode: authMode,
        email: document.getElementById('email').value,
        password: passwordInput.value,
        ...(authMode === 'register' && nameInput ? { name: nameInput.value } : {}),
        ${setup && !local && remoteRegistration ? 'registrationToken: document.getElementById("registrationToken").value,' : ''}
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not authenticate with PikRouter.');
    if (data && data.token) {
      try { localStorage.setItem('auth_token', data.token); } catch (e) {}
    }
    passwordInput.value = '';
    if (confirmInput) confirmInput.value = '';
    location.replace('/');
  } catch (e) {
    error.textContent = e.message;
    error.hidden = false;
    button.disabled = false;
  }
};
</script></body></html>`;
}
