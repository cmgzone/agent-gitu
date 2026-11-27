import { UI_THEME_CSS } from './ui-theme.js';

export function authPage(
  setup: boolean,
  _local: boolean,
  _requiresEmail = true,
  _remoteRegistration = false,
  lanLogin = false,
  options: { google?: boolean; link?: boolean; pikrouterOAuth?: boolean } = {},
): string {
  const heading = setup ? 'Get started' : 'Sign in';

  return `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in — Agent Gitu</title><link rel="icon" type="image/svg+xml" href="/brand/agent-gitu-mark.svg"><style>${UI_THEME_CSS}
*{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%;min-height:100dvh;background:var(--bg);color:var(--text);font:14px/1.5 'Inter',system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
.auth-shell{min-height:100dvh;display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,0.92fr)}
.hero-pane{position:relative;overflow:hidden;background:#0d0f17;display:flex;flex-direction:column;justify-content:space-between;padding:28px 32px;color:#ffffff}
.hero-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 44%}
.hero-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,12,20,.42) 0%,rgba(10,12,20,.04) 42%,rgba(10,12,20,.74) 100%);pointer-events:none}
.hero-top,.hero-bottom{position:relative;z-index:2}
.brand-lockup{display:inline-flex;align-items:center;gap:10px;color:#ffffff;font-weight:650;font-size:15px;letter-spacing:-.015em}
.brand-lockup img{width:26px;height:26px;border-radius:7px}
.hero-caption{margin:0;font-size:clamp(22px,2.4vw,30px);line-height:1.18;letter-spacing:-.03em;font-weight:650;color:#ffffff;max-width:360px}

.auth-pane{position:relative;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:32px 24px;background:var(--bg)}
.auth-theme-btn{position:absolute;top:20px;right:20px;width:36px;height:36px;border-radius:999px;border:1px solid var(--border2,var(--border));background:var(--card);color:var(--text);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;transition:background .15s,transform .12s}
.auth-theme-btn:hover{background:var(--hover)}
.auth-theme-btn:active{transform:scale(.95)}
.auth-theme-btn svg{width:16px;height:16px}
.auth-card{width:100%;max-width:340px;display:flex;flex-direction:column;gap:24px}
.auth-head{display:flex;flex-direction:column;gap:6px}
.brand-mobile{display:none;align-items:center;gap:8px;font-weight:650;font-size:14.5px;color:var(--text);margin-bottom:8px}
.brand-mobile img{width:24px;height:24px;border-radius:6px}
h1{font-size:28px;line-height:1.15;letter-spacing:-.035em;font-weight:650;margin:0;color:var(--text)}
.hint{color:var(--muted);margin:0;font-size:14px}

.cta-stack{display:flex;flex-direction:column;gap:10px}
.pik-oauth-btn{width:100%;height:48px;border:0;border-radius:9999px;padding:0 20px;background:var(--dark);color:var(--bg);font:600 15px inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:var(--shadow);transition:opacity .15s,transform .12s}
.pik-oauth-btn:hover:not(:disabled){opacity:.9}
.pik-oauth-btn:active:not(:disabled){transform:scale(.985)}
.pik-oauth-btn:disabled{opacity:.6;cursor:wait}
.pik-oauth-btn svg{width:18px;height:18px;flex-shrink:0}
.auth-divider{display:flex;align-items:center;gap:10px;color:var(--faint);font-size:12px;margin:2px 0}
.auth-divider::before,.auth-divider::after{content:'';flex:1;height:1px;background:var(--border)}
.google-btn{width:100%;height:44px;border-radius:9999px;border:1px solid var(--border2,var(--border));background:var(--card);color:var(--text);font:500 14px inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:background .15s}
.google-btn:hover:not(:disabled){background:var(--hover)}
.google-btn:disabled{opacity:.6;cursor:wait}
.error{color:var(--err);margin:0;font-size:13px;background:var(--err-dim,rgba(239,68,68,.12));padding:10px 14px;border-radius:12px;border:1px solid var(--err-border,rgba(239,68,68,.3))}
.note{font-size:12px;color:var(--faint);margin:0;line-height:1.5}

@media (max-width: 899px){
  .auth-shell{grid-template-columns:1fr;grid-template-rows:220px 1fr}
  .hero-pane{padding:20px}
  .hero-caption{font-size:20px}
  .auth-pane{padding:28px 20px 36px;justify-content:flex-start}
  .brand-mobile{display:inline-flex}
  .auth-theme-btn{top:14px;right:14px}
}
</style></head><body><div class="auth-shell">
<section class="hero-pane" aria-label="Agent Gitu">
  <img class="hero-img" src="/brand/auth-hero.jpg" alt="" />
  <div class="hero-scrim" aria-hidden="true"></div>
  <div class="hero-top">
    <div class="brand-lockup"><img src="/brand/agent-gitu-mark.svg" alt="Agent Gitu" /><span>Agent Gitu</span></div>
  </div>
  <div class="hero-bottom">
    <p class="hero-caption">Your AI team, ready.</p>
  </div>
</section>

<main class="auth-pane">
  <button type="button" class="auth-theme-btn" id="themeToggle" aria-label="Toggle color theme"></button>
  <div class="auth-card">
    <div class="auth-head">
      <span class="brand-mobile"><img src="/brand/agent-gitu-mark.svg" alt="" />Agent Gitu</span>
      <h1 id="authHeading">${heading}</h1>
      <p class="hint" id="authHint">Continue to your workspace.</p>
    </div>

    <div class="cta-stack">
      <button type="button" class="pik-oauth-btn" id="pikOAuthBtn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg><span>Continue with Pikpam</span></button>
      ${options.google ? '<div class="auth-divider"><span>or</span></div><button type="button" class="google-btn" id="googleBtn"><span>Continue with Google</span></button>' : ''}
    </div>

    <p class="error" role="alert" id="error" hidden></p>
    <p class="note" id="authNote" ${lanLogin && !setup ? '' : 'hidden'}></p>
  </div>
</main>
</div><script>
(function initTheme() {
  var sunSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41"/></svg>';
  var moonSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  try {
    var saved = localStorage.getItem('gitu-theme');
    var pref = saved === 'light' || saved === 'dark' ? saved : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', pref);
    var toggle = document.getElementById('themeToggle');
    var syncIcon = function (m) {
      if (!toggle) return;
      toggle.innerHTML = m === 'dark' ? sunSvg : moonSvg;
      toggle.title = m === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    };
    syncIcon(pref);
    if (toggle) {
      toggle.onclick = function () {
        var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('gitu-theme', next); } catch (e) {}
        syncIcon(next);
      };
    }
  } catch (e) {}
})();

${lanLogin && !setup ? "const note=document.querySelector('.note');if(note){note.hidden=false;note.textContent='Local HTTP login is enabled; use only on trusted Wi-Fi.';}" : ''}
const PIKPAM_AUTHORIZE_BASE = 'https://pikpam.com/oauth/authorize?client_id=client_gitu_agent';
const pikOAuthBtn = document.getElementById('pikOAuthBtn');
const error = document.getElementById('error');

if (pikOAuthBtn) {
  pikOAuthBtn.onclick = async () => {
    pikOAuthBtn.disabled = true;
    const label = pikOAuthBtn.querySelector('span');
    if (label) label.textContent = 'Redirecting to Pikpam…';
    try {
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
      if (label) label.textContent = 'Continue with Pikpam';
    }
  };
}

const params = new URLSearchParams(window.location.search);
const callbackToken = params.get('token');
const userEmail = params.get('email');
const userId = params.get('user_id');
const callbackState = params.get('state');

if (callbackToken) {
  if (window.history && window.history.replaceState) {
    window.history.replaceState({}, '', window.location.pathname + (window.location.hash || ''));
  }
  try { localStorage.setItem('auth_token', callbackToken); } catch (e) {}
  if (pikOAuthBtn) {
    pikOAuthBtn.disabled = true;
    const label = pikOAuthBtn.querySelector('span');
    if (label) label.textContent = 'Signing in…';
  }
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
      const label = pikOAuthBtn.querySelector('span');
      if (label) label.textContent = 'Continue with Pikpam';
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
