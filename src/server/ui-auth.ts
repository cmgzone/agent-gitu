import { UI_THEME_CSS } from './ui-theme.js';
import { UI_BUTTON_CSS } from './ui-buttons.js';

export function authPage(
  setup: boolean,
  local: boolean,
  requiresEmail = true,
  remoteRegistration = false,
  lanLogin = false,
  options: { google?: boolean; link?: boolean; pikrouterOAuth?: boolean } = {},
): string {
  const heading = setup ? 'Create your workspace' : 'Welcome back';
  const subtitle = setup
    ? 'Sign in or register with Pikpam Hosted Auth to unlock your AI team, Cloud Agent, and unified schedules.'
    : 'Sign in with Pikpam Hosted Auth to unlock Agent Gitu across Web, Desktop, and Android.';
  const modePill = local ? 'Local & Cloud Ready' : remoteRegistration ? 'Hosted Workspace' : 'Pikpam Hosted Auth';
  const emailHint = requiresEmail ? 'Private workspace · End-to-end session auth' : 'Private workspace · Session protected';

  return `<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in with Pikpam — Agent Gitu</title><link rel="icon" type="image/svg+xml" href="/brand/agent-gitu-mark.svg"><style>${UI_THEME_CSS}
*{box-sizing:border-box}
html,body{margin:0;padding:0;min-height:100dvh;background:var(--bg);color:var(--text);font:14px/1.55 'Inter',system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
.auth-shell{min-height:100dvh;display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,0.92fr)}
.hero-pane{position:relative;overflow:hidden;background:#0e1018;display:flex;flex-direction:column;justify-content:space-between;padding:32px 36px;color:#f5f7ff}
.hero-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 42%;transform:scale(1.01);filter:saturate(1.05)}
.hero-scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,12,20,.64) 0%,rgba(10,12,20,.12) 38%,rgba(10,12,20,.26) 62%,rgba(10,12,20,.92) 100%);pointer-events:none}
.hero-top,.hero-bottom{position:relative;z-index:2}
.hero-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.brand-lockup{display:inline-flex;align-items:center;gap:10px;text-decoration:none;color:#ffffff;font-weight:700;font-size:15px;letter-spacing:-.01em}
.brand-lockup img{width:28px;height:28px;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.35)}
.hero-status{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:999px;background:rgba(15,18,28,.58);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(12px);font-size:12px;font-weight:500;color:rgba(245,247,255,.92)}
.live-dot{width:8px;height:8px;border-radius:999px;background:#22c55e;box-shadow:0 0 0 4px rgba(34,197,94,.22)}
.hero-bottom{max-width:480px;display:flex;flex-direction:column;gap:16px}
.hero-title{margin:0;font-size:clamp(26px,3.1vw,36px);line-height:1.14;letter-spacing:-.035em;font-weight:700;color:#ffffff}
.hero-sub{margin:0;font-size:14.5px;line-height:1.55;color:rgba(236,240,255,.78)}
.roster-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;border-radius:18px;background:rgba(15,18,28,.64);border:1px solid rgba(255,255,255,.14);backdrop-filter:blur(14px)}
.roster-avatars{display:flex;align-items:center}
.roster-avatars img{width:34px;height:34px;border-radius:999px;object-fit:cover;background:rgba(255,255,255,.08);border:2px solid #141724;margin-left:-8px}
.roster-avatars img:first-child{margin-left:0}
.roster-copy{display:flex;flex-direction:column;gap:1px;min-width:0}
.roster-copy strong{font-size:12.5px;color:#ffffff;font-weight:600}
.roster-copy span{font-size:12px;color:rgba(226,232,255,.72)}

.auth-pane{position:relative;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:36px 28px;background:var(--bg)}
.theme-toggle{position:absolute;top:20px;right:20px;border:1px solid var(--border);background:var(--card);color:var(--muted);border-radius:999px;padding:7px 12px;font:500 12px inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:color .15s,border-color .15s}
.theme-toggle:hover{color:var(--text);border-color:var(--border2,var(--border))}
.auth-card{width:100%;max-width:420px;display:flex;flex-direction:column;gap:18px}
.auth-meta{display:flex;align-items:center;justify-content:space-between;gap:10px}
.brand-mobile{display:none;align-items:center;gap:8px;font-weight:700;font-size:14.5px;color:var(--text)}
.brand-mobile img{width:24px;height:24px}
.pik-badge{font-size:11.5px;font-weight:600;padding:4px 10px;border-radius:999px;background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent);border:1px solid color-mix(in srgb,var(--accent) 28%,transparent)}
h1{font-size:28px;line-height:1.18;letter-spacing:-.035em;margin:0;color:var(--text)}
.hint{color:var(--muted);margin:6px 0 0;font-size:14px;line-height:1.55}

.goal-block{display:flex;flex-direction:column;gap:10px;padding:14px;border-radius:18px;background:var(--card);border:1px solid var(--border)}
.goal-label{font-size:12px;font-weight:600;color:var(--muted)}
.goal-chips{display:flex;flex-wrap:wrap;gap:6px}
.goal-chip{border:1px solid var(--border);background:transparent;color:var(--muted);border-radius:999px;padding:6px 11px;font:500 12px inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px;transition:all .15s}
.goal-chip:hover{color:var(--text);border-color:var(--border2,var(--border))}
.goal-chip[data-active="true"]{background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--text);border-color:color-mix(in srgb,var(--accent) 45%,transparent)}
.goal-dot{width:7px;height:7px;border-radius:999px;flex-shrink:0}
.goal-preview{display:flex;align-items:flex-start;gap:10px;padding-top:8px;border-top:1px solid var(--border)}
.goal-preview img{width:30px;height:30px;border-radius:999px;flex-shrink:0;object-fit:cover}
.goal-preview-copy{display:flex;flex-direction:column;gap:2px;min-width:0}
.goal-preview-copy strong{font-size:12px;color:var(--text)}
.goal-preview-copy span{font-size:12.5px;color:var(--muted);line-height:1.45}

.cta-stack{display:flex;flex-direction:column;gap:10px}
.pik-oauth-btn{width:100%;margin:0;border:0;border-radius:9999px;padding:14px 18px;background:var(--dark);color:var(--bg);font:600 15px inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:var(--shadow);transition:opacity .15s,transform .1s}
.pik-oauth-btn:hover{opacity:.92}
.pik-oauth-btn:active{transform:scale(.99)}
.pik-oauth-btn:disabled{opacity:.65;cursor:wait}
.auth-divider{display:flex;align-items:center;gap:10px;color:var(--muted);font-size:12px;margin:2px 0}
.auth-divider::before,.auth-divider::after{content:'';flex:1;height:1px;background:var(--border)}
.google-btn{width:100%;padding:12px 16px;border-radius:9999px;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:600}
.error{color:var(--err);margin:0;font-size:13.5px;background:var(--err-dim,rgba(239,68,68,.12));padding:10px 14px;border-radius:12px;border:1px solid color-mix(in srgb,var(--err) 30%,transparent)}
.trust-strip{display:flex;flex-wrap:wrap;gap:8px 14px;font-size:12px;color:var(--muted);padding-top:4px}
.trust-strip span{display:inline-flex;align-items:center;gap:5px}
.note{font-size:12px;color:var(--muted);margin:0;line-height:1.55}
.note a{color:var(--accent);text-decoration:none;font-weight:500}
.note a:hover{text-decoration:underline}

@media (max-width: 899px){
  .auth-shell{grid-template-columns:1fr;grid-template-rows:220px 1fr}
  .hero-pane{padding:20px 20px}
  .hero-title{font-size:22px}
  .hero-sub,.roster-bar{display:none}
  .auth-pane{padding:26px 20px 36px;justify-content:flex-start}
  .brand-mobile{display:inline-flex}
  .theme-toggle{top:14px;right:14px}
}
${UI_BUTTON_CSS}</style></head><body><div class="auth-shell">
<section class="hero-pane" aria-label="Agent Gitu showcase">
  <img class="hero-img" src="/brand/auth-hero.jpg" alt="" />
  <div class="hero-scrim" aria-hidden="true"></div>
  <div class="hero-top">
    <div class="brand-lockup"><img src="/brand/agent-gitu-mark.svg" alt="Agent Gitu" /><span>Agent Gitu</span></div>
    <div class="hero-status"><span class="live-dot" aria-hidden="true"></span><span>AI team ready</span></div>
  </div>
  <div class="hero-bottom">
    <h2 class="hero-title">Your always-on AI team, built for real work.</h2>
    <p class="hero-sub">Cowork chats, autonomous coding, calendar schedules, live desktop handoff, and shared client Inbox — synced across Web, Desktop, and Android.</p>
    <div class="roster-bar">
      <div class="roster-avatars">
        <img src="/characters/orb.png" alt="Nova" />
        <img src="/characters/block.png" alt="Kai" />
        <img src="/characters/nova.png" alt="Hexa" />
      </div>
      <div class="roster-copy">
        <strong>Nova, Kai &amp; Hexa are standing by</strong>
        <span>Sign in to launch your Cloud Agent or pair your computer</span>
      </div>
    </div>
  </div>
</section>

<main class="auth-pane">
  <button type="button" class="theme-toggle" id="themeToggle" aria-label="Toggle color theme">Theme</button>
  <div class="auth-card">
    <div class="auth-meta">
      <span class="brand-mobile"><img src="/brand/agent-gitu-mark.svg" alt="" />Agent Gitu</span>
      <span class="pik-badge">${modePill}</span>
    </div>
    <div>
      <h1 id="authHeading">${heading}</h1>
      <p class="hint" id="authHint">${subtitle}</p>
    </div>

    <div class="goal-block" aria-label="Choose a starter focus">
      <div class="goal-label">What should your AI team handle first?</div>
      <div class="goal-chips" id="goalChips">
        <button type="button" class="goal-chip" data-goal="digest" data-active="true"><span class="goal-dot" style="background:#ff6b57"></span>Daily briefings</button>
        <button type="button" class="goal-chip" data-goal="coding" data-active="false"><span class="goal-dot" style="background:#4c7df0"></span>Autonomous coding</button>
        <button type="button" class="goal-chip" data-goal="calendar" data-active="false"><span class="goal-dot" style="background:#9c6df2"></span>Calendar routines</button>
        <button type="button" class="goal-chip" data-goal="inbox" data-active="false"><span class="goal-dot" style="background:#22c55e"></span>Client Inbox</button>
      </div>
      <div class="goal-preview">
        <img id="goalAvatar" src="/characters/orb.png" alt="" />
        <div class="goal-preview-copy">
          <strong id="goalAgent">Nova · Chief of Staff</strong>
          <span id="goalQuote">“Every weekday morning I’ll organize your unread messages and top priorities.”</span>
        </div>
      </div>
    </div>

    <div class="cta-stack">
      <button type="button" class="pik-oauth-btn" id="pikOAuthBtn"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg><span>Continue with Pikpam</span></button>
      ${options.google ? '<div class="auth-divider"><span>or</span></div><button type="button" class="btn ghost google-btn" id="googleBtn"><span>Continue with Google</span></button>' : ''}
    </div>

    <p class="error" role="alert" id="error" hidden></p>

    <div class="trust-strip">
      <span>${emailHint}</span>
      <span>· Syncs to Desktop &amp; Android</span>
    </div>
    <p class="note" id="authNote">You will be redirected to Pikpam (pikpam.com) to securely authorize or register your account, then returned to Agent Gitu. Invited to a shared Inbox? Open your invite link from <a href="https://pikpam.com" target="_blank" rel="noreferrer">Pikpam</a>.</p>
  </div>
</main>
</div><script>
(function initTheme() {
  try {
    var saved = localStorage.getItem('gitu-theme');
    var pref = saved === 'light' || saved === 'dark' ? saved : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', pref);
    var toggle = document.getElementById('themeToggle');
    var syncLabel = function (m) { if (toggle) toggle.textContent = m === 'dark' ? 'Light mode' : 'Dark mode'; };
    syncLabel(pref);
    if (toggle) {
      toggle.onclick = function () {
        var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        try { localStorage.setItem('gitu-theme', next); } catch (e) {}
        syncLabel(next);
      };
    }
  } catch (e) {}
})();

(function initStarterGoals() {
  var goals = {
    digest: {
      agent: 'Nova · Chief of Staff',
      avatar: '/characters/orb.png',
      quote: '“Every weekday morning I’ll organize your unread messages and top priorities.”'
    },
    coding: {
      agent: 'Kai · Software Engineer',
      avatar: '/characters/block.png',
      quote: '“Point me at a project and I’ll plan edits, run checks, and pause for your approval.”'
    },
    calendar: {
      agent: 'Hexa · Research & Schedules',
      avatar: '/characters/nova.png',
      quote: '“Pick days on your Schedule Calendar and I’ll deliver recurring reports on time.”'
    },
    inbox: {
      agent: 'Nova · Collaborative Inbox',
      avatar: '/characters/orb.png',
      quote: '“Invite clients with a 1-click link while I take private notes and tasks silently.”'
    }
  };
  var chips = document.querySelectorAll('#goalChips .goal-chip');
  var avatarEl = document.getElementById('goalAvatar');
  var agentEl = document.getElementById('goalAgent');
  var quoteEl = document.getElementById('goalQuote');
  chips.forEach(function (chip) {
    chip.onclick = function () {
      var id = chip.getAttribute('data-goal') || 'digest';
      var info = goals[id] || goals.digest;
      chips.forEach(function (c) { c.setAttribute('data-active', String(c === chip)); });
      if (avatarEl) avatarEl.setAttribute('src', info.avatar);
      if (agentEl) agentEl.textContent = info.agent;
      if (quoteEl) quoteEl.textContent = info.quote;
      try { sessionStorage.setItem('gitu_starter_goal', id); } catch (e) {}
    };
  });
})();

${lanLogin && !setup ? "const note=document.querySelector('.note');if(note)note.textContent+=' Local HTTP login is enabled. Passwords and workspace data are unencrypted; use only trusted Wi-Fi.';" : ''}
const PIKPAM_AUTHORIZE_BASE = 'https://pikpam.com/oauth/authorize?client_id=client_gitu_agent';
const pikOAuthBtn = document.getElementById('pikOAuthBtn');
const error = document.getElementById('error');

if (pikOAuthBtn) {
  pikOAuthBtn.onclick = async () => {
    pikOAuthBtn.disabled = true;
    pikOAuthBtn.textContent = 'Redirecting to Pikpam…';
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
  if (window.history && window.history.replaceState) {
    window.history.replaceState({}, '', window.location.pathname + (window.location.hash || ''));
  }
  try { localStorage.setItem('auth_token', callbackToken); } catch (e) {}
  if (pikOAuthBtn) {
    pikOAuthBtn.disabled = true;
    pikOAuthBtn.textContent = 'Verifying with Pikpam…';
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
