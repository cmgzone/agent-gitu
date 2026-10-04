import { HOME_CSS, HOME_CHARACTER_HTML } from './ui-home.js';
import { UI_MODEL_CATALOG_JS } from './ui-model-catalog.js';
import { UI_MOTION_JS } from './ui-motion.js';
import { UI_BUTTON_CSS, UI_BUTTON_JS } from './ui-buttons.js';
import { COWORK_GALLERY_CSS, COWORK_GALLERY_JS } from './ui-gallery.js';
import { COWORK_PROFILE_CSS, COWORK_PROFILE_JS } from './ui-cowork-profile.js';
import { REPORT_DETAILS_CSS, REPORT_DETAILS_JS } from './ui-report-details.js';
import { ACTIVITY_CSS, ACTIVITY_MARK_HTML } from './ui-activity.js';
import { UI_APPROACH_JS } from './ui-approach.js';
import { UI_RESPONSE_JS } from './ui-response.js';
import { UI_CONNECTIONS_JS } from './ui-connections.js';
import { CONNECTED_APPS_CSS, CONNECTED_APPS_JS } from './ui-connected-apps.js';
import { COWORK_CSS, COWORK_JS } from './ui-cowork.js';
import { CHAT_CREDENTIAL_HELPERS_JS } from './credential-chat.js';
import { UI_THEME_CSS, UI_THEME_BOOTSTRAP, UI_THEME_JS } from './ui-theme.js';
import { ONBOARDING_CSS, ONBOARDING_HTML, ONBOARDING_JS } from './ui-onboarding.js';

export const UI_HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Gitu</title>
<link rel="icon" type="image/svg+xml" href="/brand/agent-gitu-mark.svg">
<script id="themeBootstrap">${UI_THEME_BOOTSTRAP}</script>
  <style>
  /* Bundled fonts (served locally from /fonts/*, no CDN, offline-safe). */
  @font-face { font-family: 'Inter'; font-style: normal; font-weight: 400; font-display: swap; src: url('/fonts/inter-latin-400-normal.woff2') format('woff2'); }
  @font-face { font-family: 'Inter'; font-style: normal; font-weight: 500; font-display: swap; src: url('/fonts/inter-latin-500-normal.woff2') format('woff2'); }
  @font-face { font-family: 'Inter'; font-style: normal; font-weight: 600; font-display: swap; src: url('/fonts/inter-latin-600-normal.woff2') format('woff2'); }
  @font-face { font-family: 'JetBrains Mono'; font-style: normal; font-weight: 400; font-display: swap; src: url('/fonts/jetbrains-mono-latin-400-normal.woff2') format('woff2'); }
  @font-face { font-family: 'JetBrains Mono'; font-style: normal; font-weight: 700; font-display: swap; src: url('/fonts/jetbrains-mono-latin-700-normal.woff2') format('woff2'); }
  :root {
    --sans: 'Inter', -apple-system, 'Segoe UI', system-ui, sans-serif;
    --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 13.5px/1.6 var(--sans); }
  ::selection { background: var(--border2); }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--thumb); border-radius: 5px; border: 2px solid var(--bg); }
  ::-webkit-scrollbar-thumb:hover { background: var(--border2); }
  /* Counters never jitter as numbers change (Inter tnum). */
  #progText, .spec-turns, .stat .v { font-feature-settings: 'tnum' 1; font-variant-numeric: tabular-nums; }
  button { font: inherit; cursor: pointer; }
  button:focus-visible, [role=button]:focus-visible, [tabindex]:focus-visible,
  select:focus-visible, input:focus-visible, textarea:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  select, textarea, input { font: inherit; }
  /* Dark-theme fallbacks for form controls that have no styling of their own
     (e.g. the agent-modal Model/Effort selects and Name/Role fields) — they
     otherwise render with UA white-background/black-text defaults on the dark
     UI. More specific rules (.pill select, .setrow select/input,
     .composer textarea) override these below. */
  select { color: var(--text); background: var(--card2); border: 1px solid var(--border2); border-radius: 8px; padding: 6px 10px; font-size: 12.5px; }
  input:not([type=checkbox]):not([type=radio]), textarea { color: var(--text); background: var(--card2); border: 1px solid var(--border2); border-radius: 8px; padding: 6px 10px; }
  select:focus, input:not([type=checkbox]):not([type=radio]):focus, textarea:focus { outline: none; border-color: var(--accent); }
  select option { background: var(--card); color: var(--text); }
  [hidden] { display: none !important; }

  .shell { display: flex; height: 100%; min-width: 0; }
  .mobile-nav-btn, .mobile-backdrop { display: none; }
  .sb { width: var(--sbw, 264px); flex: none; border-right: 1px solid var(--border); background: var(--sidebar); display: flex; flex-direction: column; overflow: hidden; }
  .sb .head { display: flex; align-items: center; gap: 8px; padding: 16px 14px 10px; }
  .sb .head .name { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; letter-spacing: 2px; font-size: 14px; }
  .brand-mark { width: 22px; height: 22px; flex: none; border-radius: 6px; }
  .sb .head .spacer { flex: 1; }
  .sb .iconbtn { background: none; border: 0; color: var(--muted); width: 28px; height: 28px; border-radius: 7px; font-size: 15px; }
  .sb .iconbtn:hover { background: var(--hover); color: var(--text); }
  .sb .scroll { flex: 1; overflow-y: auto; padding: 4px 10px 10px; }
  .sb .newbtn { margin: 4px 2px 6px; display: flex; align-items: center; gap: 8px; border: 1px solid var(--border2); background: var(--card); color: var(--text); border-radius: 9px; padding: 7px 10px; font-weight: 650; font-size: 13px; width: calc(100% - 8px); text-align: left; transition: transform .16s ease, border-color .16s ease, background .16s ease; }
  .sb .newbtn:hover { background: var(--hover); border-color: var(--border2); transform: translateY(-1px); }
  .sb .navitem { display: flex; align-items: center; gap: 9px; padding: 7px 10px; border-radius: 8px; color: var(--text); font-size: 13px; cursor: pointer; border: 0; background: none; width: 100%; text-align: left; }
  .sb .navitem:hover { background: var(--hover); }
  .sb .navitem.active { background: var(--selected); color: var(--text); }
  .sb .navitem .ico { width: 16px; text-align: center; color: var(--muted); }
  .sb .sect { font-size: 11px; color: var(--muted); margin: 14px 10px 4px; }
  .sb .proj { display: flex; align-items: center; gap: 8px; padding: 6px 10px; font-size: 12.5px; font-weight: 600; color: var(--text); border-radius: 8px; cursor: pointer; }
  .sb .proj:hover { background: var(--hover); }
  .sb .proj.activeproj { background: var(--selected); }
  .sb .proj.activeproj .ico { color: var(--accent); }
  .sb .proj .delx { display: none; border: 0; background: none; color: var(--muted); width: 24px; height: 24px; border-radius: 6px; align-items: center; justify-content: center; flex: none; padding: 0; position: relative; }
  /* Invisible halo brings the ~24px control to a ~32px touch target. */
  .sb .proj .delx::after { content: ''; position: absolute; inset: -4px; }
  .sb .proj:hover .delx { display: inline-flex; }
  .sb .proj .delx:hover { color: var(--err); background: var(--err-dim); }
  .sb .proj .delx svg { width: 11px; height: 11px; }
  .sb .chat { display: flex; align-items: center; gap: 9px; padding: 6px 10px 6px 22px; font-size: 12.5px; color: var(--muted); border-radius: 8px; cursor: pointer; border: 0; background: none; width: 100%; text-align: left; position: relative; }
  .sb .chat .dot { margin-top: 0; }
  .sb .chat .chat-label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.3; }
  .sb .chat:hover { background: var(--hover); color: var(--text); }
  /* Per-session hover delete — single-session cleanup no longer requires
     discovering bulk-manage mode. Two-click arm/confirm, no native dialogs. */
  .sb .chat .rowdel { display: none; margin-left: auto; border: 0; background: none; color: var(--muted); width: 22px; height: 22px; border-radius: 6px; align-items: center; justify-content: center; flex: none; padding: 0; position: relative; cursor: pointer; }
  .sb .chat .rowdel::after { content: ''; position: absolute; inset: -3px; }
  .sb .chat:hover .rowdel, .sb .chat .rowdel.armed { display: inline-flex; }
  .sb .chat .rowdel:hover { color: var(--err); background: var(--err-dim); }
  .sb .chat .rowdel.armed { color: #fff; background: var(--err); }
  .sb .chat .rowdel.armed::after { content: 'sure?'; inset: 0 -34px 0 auto; font-size: 10.5px; color: var(--err); display: flex; align-items: center; white-space: nowrap; }
  .sb .more-row { display: flex; align-items: center; gap: 6px; padding: 4px 10px 4px 22px; font-size: 11.5px; color: var(--faint); border: 0; background: none; width: 100%; text-align: left; cursor: pointer; }
  .sb .more-row:hover { color: var(--text); background: var(--hover); border-radius: 8px; }
  .sb .chat.active { background: var(--selected); color: var(--text); }
  .sb .chat .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--faint); flex: none; }
  .sb .chat .dot.running { background: var(--blue); animation: pulse 1.2s infinite; }
  .sb .chat .dot.waiting { background: var(--amber); animation: pulse 1.2s infinite; }
  .sb .chat .dot.completed { background: var(--green); }
  .sb .chat .dot.blocked, .sb .chat .dot.failed { background: var(--red); }
  /* Inline end-of-stream failure note in the activity timeline. */
  .run-stop-note { margin: 7px 0; color: var(--faint); font-size: 10px; line-height: 1.35; letter-spacing: .01em; }
  /* A user message whose send FAILED — kept visible with retry, no longer "pending". */
  .usermsg.failed > div { border-color: var(--err-border) !important; opacity: .85; }
  .sb .foot { border-top: 1px solid var(--border); padding: 10px 12px; display: flex; gap: 8px; align-items: center; }
  .bulkbar { display: flex; gap: 6px; align-items: center; padding: 8px 10px; border-top: 1px solid var(--border); background: var(--bg); }
  .bulkbar #bulkCount { flex: 1; font-size: 12px; color: var(--muted); }
  .sb .chk { margin: 0; width: auto; accent-color: var(--accent); }
  .sb .foot .chip { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--muted); }
  .project-chip { width: 100%; text-align: left; background: transparent; border: 1px solid var(--border); }
  @keyframes pulse { 50% { opacity: .35; } }

  .main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  .topbar { display: flex; align-items: center; gap: 10px; padding: 10px 20px; border-bottom: 1px solid var(--border); flex: none; }
  .topbar .title { font-weight: 600; font-size: 13.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .topbar .spacer { flex: 1; }
  .view { flex: 1; overflow: hidden; display: flex; flex-direction: column; }

  .home { position: relative; isolation: isolate; flex: 1; min-height: 0; display: flex; flex-direction: column; align-items: center; gap: 18px; padding: 32px 24px; overflow: auto; }
  .home > :not(.home-particles) { flex-shrink: 0; max-width: 100%; }
  .home > :last-child { margin-bottom: auto; }
  .home > .composer, .home > .home-cta { width: min(760px, 100%); }
  .home::before { content: ''; position: absolute; z-index: -1; width: min(920px, 86vw); height: 520px; top: calc(50% - 270px); border-radius: 50%; background: none; pointer-events: none; }
  .home-intro { width: min(760px, 94vw); }
  .home-eyebrow { display: flex; align-items: center; gap: 7px; margin-bottom: 8px; color: var(--text); font-size: 10.5px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
  .home-eyebrow::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--ok); box-shadow: 0 0 0 4px var(--ok-dim); }
  .home h1 { font-size: clamp(24px, 3vw, 32px); font-weight: 650; letter-spacing: -.035em; line-height: 1.18; margin: 0; }
  .home h1 .u { border-bottom: 2px dotted var(--faint); }
  .home-copy { max-width: 580px; margin: 8px 0 0; color: var(--muted); font-size: 13px; }
  /* The wordmark owns a row so it never sits behind the home controls. */
  .home-brand { position: relative; width: min(760px, 100%); margin-top: auto; padding: 12px 0 16px; text-align: center; }
  .home-brand-kicker { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 14px; color: var(--muted); font: 10px var(--mono); letter-spacing: .18em; text-transform: uppercase; }
  .home-brand-kicker::before, .home-brand-kicker::after { content: ''; width: 28px; height: 1px; background: var(--border2); }
  .home .home-brand h1 { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: center; column-gap: .22em; font-size: clamp(38px, 6vw, 72px); font-weight: 600; letter-spacing: -.055em; line-height: 1.15; text-align: center; }
  .home-brand-name { color: var(--accent); background: linear-gradient(115deg, var(--accent) 15%, var(--run) 90%); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
  .home-brand-spark { display: inline-block; width: 8px; height: 8px; margin-left: 6px; border-radius: 2px; background: var(--run); transform: rotate(-12deg); vertical-align: baseline; }
  .home-brand-copy { margin: 14px 0 0; color: var(--muted); font-size: 13px; line-height: 1.6; }
  /* Two layers of tiny shining particles drifting across the home background. */
  .home-particles { position: absolute; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; }
  .home-particles::before, .home-particles::after { content: ''; position: absolute; inset: -20%; border-radius: 50%; background-repeat: repeat;
    background-image: radial-gradient(1.6px 1.6px at 12% 22%, color-mix(in srgb, var(--text) 55%, transparent) 50%, transparent 52%),
      radial-gradient(1.3px 1.3px at 68% 14%, color-mix(in srgb, var(--accent) 70%, transparent) 50%, transparent 52%),
      radial-gradient(1.8px 1.8px at 84% 62%, color-mix(in srgb, var(--text) 40%, transparent) 50%, transparent 52%),
      radial-gradient(1.2px 1.2px at 30% 78%, color-mix(in srgb, var(--text) 50%, transparent) 50%, transparent 52%),
      radial-gradient(1.5px 1.5px at 52% 44%, color-mix(in srgb, var(--run) 60%, transparent) 50%, transparent 52%),
      radial-gradient(1.2px 1.2px at 92% 88%, color-mix(in srgb, var(--text) 45%, transparent) 50%, transparent 52%);
    background-size: 620px 620px; opacity: .5; animation: homeDrift 90s linear infinite, homeTwinkle 5.5s ease-in-out infinite alternate; }
  .home-particles::after { background-size: 460px 460px; opacity: .35; animation-duration: 130s, 7s; animation-direction: reverse, alternate; }
  @keyframes homeDrift { from { transform: translate3d(0, 0, 0); } to { transform: translate3d(-3%, -2.5%, 0); } }
  @keyframes homeTwinkle { from { opacity: .22; } to { opacity: .55; } }
${HOME_CSS}
  /* The + menu on every composer: attach, tag a folder, schedule. */
  .home-plus-menu { position: fixed; z-index: 70; min-width: 210px; padding: 6px; border: 1px solid var(--border); border-radius: 14px; background: var(--card); box-shadow: var(--shadow-float); }
  .home-plus-menu button { display: flex; align-items: center; gap: 9px; width: 100%; text-align: left; font: inherit; font-size: 12.5px; color: var(--text); background: transparent; border: 0; border-radius: 9px; padding: 8px 10px; cursor: pointer; }
  .home-plus-menu button:hover { background: var(--hover); }
  .home-plus-menu button.active { background: var(--selected); }
  .home-plus-menu button:disabled { opacity: .5; cursor: not-allowed; }
  .home-plus-menu .check { margin-left: auto; color: var(--accent); opacity: 0; }
  .home-plus-menu button.active .check { opacity: 1; }
  .home-plus-menu button .ico { color: var(--muted); display: inline-flex; }
  .home-plus-menu button .ico svg { width: 15px; height: 15px; }
  .sugs { display: grid; grid-template-columns: repeat(4, 170px); gap: 10px; }
  @media (max-width: 900px) { .sugs { grid-template-columns: repeat(2, 170px); } }  .sug { min-height: 130px; background: var(--card); border: 1px solid var(--border); border-radius: 13px; padding: 14px; text-align: left; cursor: pointer; font-size: 12.5px; color: var(--text); transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease; }
  .sug:hover { border-color: var(--border2); box-shadow: 0 12px 30px rgba(2,6,17,.28); transform: translateY(-2px); }
  .sug .ico { font-size: 15px; display: block; margin-bottom: 10px; }
  .sug-title { display: block; font-weight: 650; line-height: 1.38; }
  .sug-hint { display: block; margin-top: 5px; color: var(--faint); font-size: 11px; line-height: 1.38; }
  .setup-card { border: 1px solid var(--run-border); background: var(--run-dim); color: var(--text); border-radius: 12px; padding: 12px 14px; }
  .setup-card:hover { border-color: var(--run); background: var(--run-dim); }
  .setup-card h3 { color: var(--text); font-size: 12px; letter-spacing: .6px; text-transform: uppercase; }
  .setup-card .setup-action { display: inline-block; margin-top: 6px; color: var(--run); font-size: 12px; font-weight: 650; }
  .composer { position: relative; width: min(760px, 94vw); background: var(--card); border: 1px solid var(--border2); border-radius: 14px; box-shadow: 0 1px 2px rgba(0,0,0,.12), 0 12px 32px rgba(0,0,0,.15); padding: 6px 8px 8px; transition: border-color .18s ease, box-shadow .18s ease, transform .18s ease; }
  .composer:focus-within { border-color: var(--border2); box-shadow: 0 0 0 3px var(--selected), 0 16px 38px rgba(0,0,0,.24); }
  .composer textarea { width: 100%; border: 0; outline: none; resize: none; background: transparent; color: var(--text); font: 15px/1.5 var(--sans); padding: 10px 10px 6px; min-height: 44px; max-height: 180px; }
  .composer textarea::placeholder { color: var(--faint); }
  .composer-bar { display: flex; align-items: center; gap: 5px; padding: 2px 6px; flex-wrap: wrap; }
  .run-folder-tags { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; padding: 7px 9px 0; }
  .run-folder-tags[hidden] { display: none; }
  .run-folder-tags .label { color: var(--muted); font-size: 11px; margin-right: 2px; }
  .run-folder-tag { display: inline-flex; align-items: center; gap: 5px; min-width: 0; max-width: min(360px, 100%); border: 1px solid var(--border2); border-radius: 999px; background: var(--card2); color: var(--text); padding: 3px 6px 3px 9px; font-size: 11px; }
  .run-folder-tag .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .run-folder-tag .permission { color: var(--muted); white-space: nowrap; }
  .run-folder-tag button { flex: none; border: 0; background: transparent; color: var(--muted); padding: 0 2px; font: inherit; cursor: pointer; }
  .run-folder-tag button:hover { color: var(--text); }
  .run-folder-tag button[data-untag-folder]:hover { color: var(--err); }
  .context-trigger { display: grid; place-items: center; width: 32px; height: 32px; flex: none; border: 0; border-radius: 50%; background: none; color: var(--muted); padding: 4px; cursor: pointer; }
  .context-trigger:hover, .context-trigger[aria-expanded="true"] { background: var(--hover); color: var(--text); }
  .context-trigger svg { width: 24px; height: 24px; transform: rotate(-90deg); overflow: visible; }
  .context-ring-track { fill: none; stroke: var(--border2); stroke-width: 2.5; }
  .context-ring-progress { fill: none; stroke: var(--context-color, var(--muted)); stroke-width: 2.5; stroke-linecap: round; stroke-dasharray: 100; stroke-dashoffset: 100; transition: stroke-dashoffset .6s ease, stroke .4s ease; }
  .context-ring-core { fill: var(--context-color, var(--muted)); opacity: .65; }
  .context-trigger.using .context-ring-progress { animation: contextPulse 1.8s ease-in-out infinite; }
  .context-trigger.using.unknown .context-ring-progress { stroke-dasharray: 18 82; stroke-dashoffset: 0; transform-origin: 12px 12px; animation: contextSpin 2.4s linear infinite; }
  @keyframes contextPulse { 50% { filter: drop-shadow(0 0 2px var(--context-color, var(--muted))); opacity: .65; } }
  @keyframes contextSpin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .context-ring-progress { animation: none !important; transition: none; } }
  .context-card { position: absolute; right: 8px; bottom: calc(100% + 8px); z-index: 65; width: min(390px, calc(100vw - 32px)); max-height: min(65vh, 560px); overflow-y: auto; padding: 15px; border: 1px solid var(--border2); border-radius: 14px; background: var(--card); box-shadow: var(--shadow-float); }
  .context-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: 13px; font-weight: 650; }
  .context-card .section-h { margin-top: 14px; }
  .context-card .stat-grid { gap: 10px 14px; }
  .context-card details > summary { cursor: pointer; color: var(--muted); font-size: 11.5px; margin-top: 12px; }
  .pill { background: none; border: 0; color: var(--muted); border-radius: 8px; padding: 5px 9px; display: inline-flex; align-items: center; gap: 5px; font-size: 12.5px; }
  .pill:hover { background: var(--hover); color: var(--text); }
  .control-pill { border: 1px solid transparent; }
  #homePlusBtn { width: 32px; height: 32px; padding: 0; flex: none; justify-content: center; border-color: var(--border2); background: transparent; color: var(--muted); cursor: pointer; }
  #homePlusBtn:hover, #homePlusBtn[aria-expanded="true"] { border-color: var(--border2); background: var(--hover); color: var(--text); }
  #homePlusBtn svg { width: 16px; height: 16px; }
  .control-prefix { color: var(--faint); font-size: 10px; font-weight: 650; letter-spacing: .55px; text-transform: uppercase; }
  .pill select { border: 0; background: none; color: inherit; outline: none; font-size: 12.5px; appearance: none; -webkit-appearance: none; padding-right: 2px; max-width: 220px; }
  .model-meta { color: var(--faint); font: 10.5px var(--mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px; }
  .model-control { position: relative; display: inline-flex; min-width: 0; }
  .pill .caret { color: var(--faint); font-size: 10px; }
  .model-pick { cursor: pointer; min-width: 0; }
  .model-pick.open, .model-pick.open:hover { background: var(--hover); color: var(--text); }
  .model-pick .mp-label { max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .model-menu { position: absolute; top: calc(100% + 6px); left: 0; z-index: 60; width: 370px; max-width: calc(100vw - 48px); background: var(--card); border: 1px solid var(--border2); border-radius: 10px; box-shadow: 0 12px 32px rgba(0,0,0,.15); padding: 6px; }
  .model-menu input { width: 100%; border: 1px solid var(--border); border-radius: 8px; padding: 6px 9px; font-size: 12.5px; outline: none; background: var(--card2); color: var(--text); }
  .model-menu input:focus { border-color: var(--accent); }
  .model-list { max-height: 300px; overflow-y: auto; margin-top: 6px; }
  .model-sec { position: sticky; top: 0; z-index: 1; background: var(--card); padding: 6px 10px 3px; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .model-sec:first-child { padding-top: 2px; }
  .model-item { display: block; width: 100%; padding: 6px 10px 7px; border: 0; background: none; color: inherit; text-align: left; border-radius: 7px; cursor: pointer; font-size: 12.5px; line-height: 1.35; }
  .model-item:hover, .model-item.hl { background: var(--hover); }
  .model-item.cur { box-shadow: inset 2px 0 0 var(--accent); }
  .model-item .mi-top { display: flex; align-items: center; gap: 8px; }
  .model-item .mi-prov { color: var(--muted); font-size: 10.5px; flex: none; }
  .model-item .mi-meta { margin-left: auto; color: var(--faint); font-size: 10px; font-family: var(--mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 58%; flex: none; }
  .model-item .mi-name { font-weight: 600; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .model-item .mi-name .vmark { color: var(--blue); font-style: normal; }
  .model-empty { color: var(--faint); font-size: 12px; padding: 10px 9px; text-align: center; line-height: 1.5; }
  .model-list mark { background: var(--selected); color: inherit; border-radius: 3px; }
  .model-count { padding: 5px 10px 2px; margin-top: 4px; border-top: 1px solid var(--border); color: var(--faint); font-size: 10.5px; text-align: right; }
  .send { margin-left: auto; width: 32px; height: 32px; border-radius: 10px; border: 0; background: var(--accent); color: var(--on-accent); font-size: 14px; transition: opacity .16s ease; }
  .send:not(:disabled):hover { opacity: .85; }
  /* Send ⇄ Stop: while the agent runs the same button stops it. */
  .send.stop { background: var(--err); color: #fff; font-size: 11px; animation: stopPulse 1.6s ease-in-out infinite; }
  .send.stop:hover { filter: brightness(1.12); }
  @keyframes stopPulse { 0%,100% { box-shadow: 0 0 0 0 var(--err-border); } 50% { box-shadow: 0 0 0 5px transparent; } }
  #wfChip { flex: none; }
  .send:disabled { background: var(--border2); }

  .run { flex: 1; display: flex; min-height: 0; }
  .run-main { position: relative; flex: 1; display: flex; flex-direction: column; min-width: 0; }
  /* ── Activity timeline ───────────────────────────────────────────────────
     A continuous vertical rule anchors narration and compact tool cards. */
  .progress { display: flex; align-items: center; gap: 10px; padding: 8px 24px 2px; flex: none; font-family: var(--mono); font-size: 10.5px; letter-spacing: .4px; color: var(--muted); }
  .progress .plabel { white-space: nowrap; }
  .progress .pbar { flex: 1; height: 2px; border-radius: 1px; background: var(--line); overflow: hidden; }
  .progress .pbar span { display: block; height: 100%; width: 0; background: var(--run); transition: width .5s ease; }
  .stream { position: relative; flex: 1; overflow-y: auto; padding: 10px 24px 18px 20px; }
  .timeline-trim-note { margin: 4px 0 10px 20px; color: var(--faint); font-size: 11.5px; }
  .stream::before { content: none; }
  .tl-row { position: relative; display: flex; align-items: flex-start; gap: 11px; padding: 5px 0; min-width: 0; animation: toolIn .22s ease-out both; }
  .tl-dot { position: relative; z-index: 1; flex: none; width: 9px; height: 9px; margin-top: 6px; border-radius: 50%; background: var(--bg); box-shadow: inset 0 0 0 1.5px var(--faint); transition: box-shadow .25s ease, background .25s ease; }
  .tl-dot.dot-run { box-shadow: inset 0 0 0 1.5px var(--run); animation: tlPulse 1.5s ease-out infinite; }
  .tl-dot.dot-ok { box-shadow: inset 0 0 0 1.5px var(--ok); animation: none; }
  .tl-dot.dot-bad { box-shadow: inset 0 0 0 1.5px var(--err); animation: dotPop .35s ease; }
  .tl-dot.dot-blocked { box-shadow: inset 0 0 0 1.5px var(--evidence); animation: none; }
  /* Evidence pass/fail: small filled amber dot */
  .tl-dot.dot-ev { width: 7px; height: 7px; margin-top: 7px; margin-left: 1px; background: var(--evidence); box-shadow: none; animation: none; }
  /* Plain narration/thought: tiny unfilled dot, no color */
  .tl-dot.dot-note { width: 5px; height: 5px; margin-top: 8px; margin-left: 2px; background: transparent; box-shadow: inset 0 0 0 1px var(--faint); opacity: .65; animation: none; }
  @keyframes tlPulse { 0% { box-shadow: inset 0 0 0 1.5px var(--run), 0 0 0 0 var(--run-border); } 100% { box-shadow: inset 0 0 0 1.5px var(--run), 0 0 0 7px transparent; } }
  @keyframes dotPop { 30% { transform: scale(1.4); } }
  .tl-body { flex: 1; min-width: 0; }
  /* Narration / thought text: full-weight sans body — reads MORE prominent
     than the mono tool lines around it. */
  .tl-note-row { padding: 9px 0; }
  .tl-note-row .tl-body { font-size: 15px; font-weight: 400; line-height: 1.65; color: var(--text); white-space: pre-wrap; overflow-wrap: anywhere; }
  .tl-stream-row .stream-live { display: none; align-items: center; gap: 7px; margin-bottom: 4px; color: var(--muted); font: 11px var(--mono); white-space: nowrap; }
  .tl-stream-row[data-stream-state="live"] .stream-live { display: inline-flex; }
  .tl-stream-row .stream-live::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--run); box-shadow: 0 0 0 3px var(--run-dim); }
  .tl-stream-row .stream-text { min-width: 0; }
  .tl-note-row > .tl-dot, .tl-tool-group > .tl-dot { display: none; }
  .tl-note-row > .tl-time, .tl-tool-group > .tl-time { display: none; }
  .response-prose { display: block; white-space: normal; overflow-wrap: anywhere; line-height: 1.75; }
  .response-prose p { margin: 0 0 .9em; }
  .response-prose > :last-child { margin-bottom: 0; }
  .response-prose h1, .response-prose h2, .response-prose h3, .response-prose h4, .response-prose h5, .response-prose h6 { margin: 1.1em 0 .45em; color: var(--text); font-size: 1.06em; line-height: 1.5; font-weight: 600; }
  .response-prose ul, .response-prose ol { margin: .4em 0 1em; padding-left: 22px; }
  .response-prose li { padding: 2px 0; }
  .response-prose code { font: .9em var(--mono); color: var(--text); }
  .response-prose pre { padding: 8px 0 8px 14px; margin: .8em 0; border-left: 2px solid var(--border2); overflow-x: auto; white-space: pre; }
  .response-code-language { color: var(--faint); font: 10.5px var(--mono); margin-top: 14px; }
  .response-prose a { color: var(--run); text-decoration: underline; text-underline-offset: 3px; }
  .response-embed { margin: .7em 0 1em; }
  .response-embed iframe { display: block; width: 100%; max-width: 560px; aspect-ratio: 16 / 9; height: auto; border: 1px solid var(--border2); border-radius: 10px; background: #000; }
  .thought { padding: 9px 0 9px 20px; color: var(--text); white-space: pre-wrap; font-weight: 500; }
  .thought .caret, .tl-note-row .caret { display: inline-block; width: 7px; height: 14px; background: var(--run); vertical-align: -2px; animation: pulse 1s infinite; margin-left: 2px; }
  /* ── Collapsible technical sections ─────────────────────────────────────
     Telemetry and raw-model JSON are machine output, not conversation:
     collapsed by default so the feed answers what/why/proof/next first,
     implementation detail one click away. */
  .exec-details { margin: 3px 0; border: 1px solid var(--border); border-radius: 8px; background: var(--card2); overflow: hidden; }
  .exec-details summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 7px; padding: 5px 10px; font-size: 11.5px; color: var(--muted); user-select: none; }
  .exec-details summary::-webkit-details-marker { display: none; }
  .exec-details summary:hover { background: var(--hover); }
  .exec-details summary b { color: var(--text); font-weight: 600; }
  .exec-details .chev { display: inline-block; transition: transform .14s ease; color: var(--faint); font-size: 10px; }
  .exec-details[open] .chev { transform: rotate(90deg); }
  .exec-details .exec-sum { color: var(--faint); font-family: var(--mono); font-size: 10.5px; }
  .exec-grid { display: grid; grid-template-columns: minmax(96px, max-content) 1fr; gap: 1px 14px; padding: 6px 12px 9px; font-family: var(--mono); font-size: 10.5px; }
  .exec-grid .k { color: var(--faint); }
  .exec-grid .v { color: var(--text); font-feature-settings: 'tnum' 1; }
  .exec-pre { margin: 0; padding: 6px 12px 9px; font-family: var(--mono); font-size: 10.5px; color: var(--muted); white-space: pre-wrap; word-break: break-all; max-height: 220px; overflow-y: auto; }
  /* Dense narration: long verification reports become headline + checklist +
     footer instead of one wall of pre-wrapped text. Same words, structure. */
  /* Generic quiet metadata rows (plan/criteria/queued/parallel/…) */
  .meta-line { color: var(--muted); font-size: 12px; padding: 3px 2px; }
  .meta-line b { color: var(--text); font-weight: 600; }
  .tl-meta .tl-body { color: var(--muted); font-size: 12px; padding: 1px 0; }
  .tl-meta b { color: var(--muted); font-weight: 600; }
  .tl-meta.subagent-note b { color: var(--run); }
  /* ── Delegated specialist: nested under its parent entry ────────────────
     Not a second card — an indent with its own left border rule; agent name,
     turn count and usage tag inline in one row, narration lines below. */
  .tl-sub-row .tl-body { min-width: 0; }
  .tl-sub-head { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 12px; cursor: pointer; border-radius: 7px; padding: 2px 4px; margin: -2px -4px; }
  .tl-sub-head:hover { background: var(--hover); }
  .tl-sub-head:focus-visible { outline: 1px solid var(--accent); outline-offset: 1px; }
  /* Tap-to-peek specialist cards: chevron rotates when open, collapsed shows
     a one-line preview of the latest activity. */
  .spec-chev { display: inline-flex; align-items: center; color: var(--faint); flex: none; transition: transform .14s ease; }
  .spec-chev svg { width: 11px; height: 11px; }
  .tl-sub-row.open .spec-chev { transform: rotate(90deg); color: var(--text); }
  .spec-preview { font-family: var(--mono); font-size: 10.5px; color: var(--faint); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 1px 2px 3px 15px; min-height: 14px; }
  .tl-sub-row.open .spec-preview { display: none; }
  .spec-name { font-weight: 600; font-size: 12px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 0 1 auto; }
  .spec-turns { font-family: var(--mono); font-size: 10.5px; color: var(--muted); font-feature-settings: 'tnum' 1; font-variant-numeric: tabular-nums; flex: none; white-space: nowrap; }
  .spec-tag { font-family: var(--mono); font-size: 9px; letter-spacing: .7px; text-transform: uppercase; color: var(--muted); border: 1px solid var(--border2); border-radius: 999px; padding: 1px 7px; flex: none; }
  .tl-sub-status { margin-left: auto; font-family: var(--mono); font-size: 10px; letter-spacing: .5px; color: var(--muted); flex: none; white-space: nowrap; }
  .st.st-run, .tl-sub-status.st-run { color: var(--run); }
  .st.st-ok, .tl-sub-status.st-ok { color: var(--ok); }
  .st.st-err, .tl-sub-status.st-err { color: var(--err); }
  .st.st-warn, .tl-sub-status.st-warn { color: var(--evidence); }
  .st.st-idle, .tl-sub-status.st-idle { color: var(--faint); }
  .tl-sub-task { padding: 3px 0 1px; font-size: 11.5px; line-height: 1.55; color: var(--muted); font-style: italic; white-space: pre-wrap; word-break: break-word; }
  /* The sub-agent's own left border rule, indented under the parent entry */
  .tl-sub-rail { margin: 4px 0 0 3px; border-left: 1px solid var(--line); padding-left: 13px; }
  .spec-logline { font-size: 11.5px; line-height: 1.55; color: var(--muted); padding: 2px 0; white-space: pre-wrap; word-break: break-word; animation: outFade .18s ease-out; }
  .spec-logline:last-child { color: var(--text); opacity: .85; }
  /* ── Intake metadata: quiet silver line, collapses the resume burst ────── */
  .intake-line { margin: 2px 0; font-size: 11.5px; color: var(--faint); cursor: pointer; user-select: none; -webkit-user-select: none; }
  .intake-line:hover { color: var(--muted); }
  .intake-head { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; min-width: 0; }
  .intake-chev { display: inline-flex; flex: none; transform: rotate(-90deg); transition: transform .15s ease; }
  .intake-line.open .intake-chev { transform: none; }
  .intake-chev svg { width: 11px; height: 11px; }
  .intake-title { font-weight: 500; flex: none; }
  .intake-digest { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .intake-rows { display: none; padding: 3px 0 4px 16px; cursor: auto; user-select: text; -webkit-user-select: text; }
  .intake-line.open .intake-rows { display: block; animation: outFade .15s ease-out; }
  .intake-row { font-size: 11.5px; line-height: 1.55; color: var(--muted); white-space: pre-wrap; word-break: break-word; }
  /* Evidence result: compact inline pill, not a full-width card */
  .ev-pill { display: inline-flex; align-items: center; max-width: 100%; font-family: var(--mono); font-size: 10.5px; letter-spacing: .2px; border-radius: 999px; padding: 2px 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ev-pill.pass { color: var(--ok); background: var(--ok-dim); box-shadow: inset 0 0 0 1px var(--ok-border); }
  .ev-pill.fail { color: var(--err); background: var(--err-dim); box-shadow: inset 0 0 0 1px var(--err-border); }
  /* ── Tool call rows: one monospace line on the timeline ─────────────────
     Command, context, duration, and status above a native output disclosure. */
  @keyframes toolIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes outFade { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: none; } }
  .tl-tool.done-bad { animation: rowFlash .6s ease; }
  @keyframes rowFlash { 0% { background: var(--err-dim); } 100% { background: transparent; } }
  .tl-cmd { display: flex; align-items: baseline; gap: 8px; min-width: 0; font-family: var(--mono); font-size: 12px; cursor: pointer; border-radius: 6px; }
  .tl-cmd:hover .cmd { color: var(--text); }
  .tl-cmd .cmd { color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 0 10000 auto; }
  .tl-cmd .why { color: var(--faint); font-style: italic; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1 9999 auto; }
  .st { margin-left: auto; flex: none; display: inline-flex; align-items: center; gap: 6px; font-family: var(--mono); font-size: 10px; letter-spacing: .5px; color: var(--faint); }
  .lines { font-family: var(--mono); font-size: 10px; color: var(--ok); background: var(--ok-dim); border-radius: 5px; padding: 1px 6px; flex: none; }
  .lines .del { color: var(--err); margin-left: 4px; }
  /* Code diff. Removals red, additions green, both counted: a rewrite that
     deleted code must never read as a pure addition. */
  .diffview { margin: 6px 0 2px 12px; padding: 4px 0; border-left: 2px solid var(--border2); border-radius: 3px; font-family: var(--mono); font-size: 11.5px; line-height: 1.5; overflow-x: auto; }
  .diffview .dline { display: flex; gap: 8px; padding: 0 8px; white-space: pre; }
  .diffview .dline .ln { min-width: 2.8em; text-align: right; color: var(--faint); opacity: .55; user-select: none; }
  .diffview .dline .mark { width: 1ch; opacity: .85; }
  .diffview .dline .tx { min-width: 0; }
  .diffview .dline.add { background: var(--ok-dim); color: var(--ok); }
  .diffview .dline.remove { background: var(--err-dim); color: var(--err); }
  .diffview .dline.context { color: var(--faint); }
  .diffview .dline.gap { color: var(--faint); font-style: italic; opacity: .7; }
  /* The model's own reasoning: a run that thinks silently is indistinguishable
     from a run that is stuck. */
  .thinkbox { margin: 2px 0 6px 12px; border-left: 2px solid var(--border2); padding: 2px 0 2px 10px; }
  .thinkbox summary { cursor: pointer; color: var(--faint); font-size: 11px; }
  .thinkbox pre { margin: 4px 0 0; font-family: var(--mono); font-size: 11.5px; line-height: 1.55; color: var(--text); opacity: .82; white-space: pre-wrap; word-break: break-word; max-height: 320px; overflow-y: auto; }
  /* Collapsed output disclosure */
  .tl-out { margin-top: 2px; max-width: 100%; }
  .tl-out summary { list-style: none; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; user-select: none; -webkit-user-select: none; font-family: var(--mono); font-size: 10px; letter-spacing: .6px; color: var(--faint); padding: 2px 0; }
  .tl-out summary::-webkit-details-marker { display: none; }
  .tl-out summary::before { content: '\25B8'; font-size: 9px; transition: transform .15s ease; }
  .tl-out[open] summary::before { transform: rotate(90deg); }
  .tl-out summary:hover { color: var(--muted); }
  .tool-btn-copy { display: inline-flex; align-items: center; gap: 4px; background: none; border: 1px solid var(--border2); border-radius: 5px; padding: 4px 8px; font-size: 10px; font-family: var(--mono); color: var(--faint); cursor: pointer; transition: all .2s; min-height: 26px; }
  .tool-btn-copy:hover { background: var(--hover); color: var(--text); }
  .tool-btn-copy.copied { color: var(--ok); border-color: var(--ok-border); }
  .tool-btn-copy svg { width: 10px; height: 10px; }
  .tl-out[open] pre { animation: outFade .25s ease; }
  .tl-out pre { margin: 4px 0 0; padding: 8px 0; font-family: var(--mono); font-size: 11.5px; line-height: 1.65; color: var(--muted); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 320px; overflow-y: auto; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
  .tl-out pre.folded { max-height: 110px; overflow: hidden; position: relative; border-radius: 8px 8px 0 0; }
  /* Live work: quiet surfaces, clear states, and motion only at the edge. */
  .stream { overflow-anchor: none; }
  .replayed, .replayed .dot-ok, .replayed .dot-bad { animation: none !important; }
  .text-arrival { animation: textArrival .18s ease-out both; }
  @keyframes textArrival { from { opacity: .3; } to { opacity: 1; } }
  .text-streaming::after { content: ''; display: inline-block; width: 2px; height: 1em; margin-left: 3px; vertical-align: -.12em; border-radius: 1px; background: var(--run); animation: streamCaret 1s steps(1, end) infinite; }
  @keyframes streamCaret { 50% { opacity: 0; } }
  .tl-note-row:has(.text-streaming) .caret { display: none; }
  /* Tool calls belong to the agent response that caused them. A single
     expandable activity group keeps a long run readable while still making
     every command and its output available with one tap. */
  .tl-tool-group { padding: 5px 0; }
  .tl-tool-group > .tl-body { min-width: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
  .tool-group-details { margin: 0; }
  .tool-group-details > summary { list-style: none; display: flex; align-items: center; gap: 9px; min-height: 34px; padding: 5px 0; cursor: pointer; user-select: none; -webkit-user-select: none; }
  .tool-group-details > summary::-webkit-details-marker { display: none; }
  .tool-group-details > summary:hover .tool-group-title { color: var(--text); }
  .tool-group-details > summary:focus-visible, .tool-call-head:focus-visible { outline: 2px solid var(--run); outline-offset: 3px; }
  .tool-group-orbit { width: 12px; height: 12px; border: 1.5px solid var(--run-dim); border-top-color: var(--run); border-radius: 50%; animation: spin .85s linear infinite; flex: none; }
  .tl-tool-group:not([data-tool-group-state=working]) .tool-group-orbit { display: none; }
  .tool-group-copy { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .tool-group-title { color: var(--muted); font-size: 12.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tool-group-hint { color: var(--faint); font-size: 11.5px; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tool-group-hint:empty { display: none; }
  .tool-group-count { color: var(--faint); font-size: 10.5px; white-space: nowrap; flex: none; }
  .tool-group-state { margin-left: auto; display: inline-flex; align-items: center; gap: 5px; color: var(--faint); font: 10px var(--mono); letter-spacing: .35px; white-space: nowrap; }
  .tl-tool-group[data-tool-group-state=working] .tool-group-state { color: var(--run); }
  .tl-tool-group[data-tool-group-state=attention] .tool-group-state { color: var(--err); }
  .tool-group-state:empty { display: none; }
  .tl-tool-group[data-tool-group-state=working] .tool-group-title { color: var(--muted); background: linear-gradient(100deg, var(--muted) 30%, var(--text) 48%, var(--muted) 66%); background-size: 250% 100%; background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent; animation: toolTextShimmer 2.4s linear infinite; }
  @keyframes toolTextShimmer { from { background-position: 160% 0; } to { background-position: -90% 0; } }
  @media (prefers-reduced-motion: reduce) { .tl-tool-group[data-tool-group-state=working] .tool-group-title { background: none; -webkit-text-fill-color: currentColor; animation: none; } }
  .tool-group-chevron { color: var(--faint); transition: transform .18s ease; flex: none; }
  .tool-group-details[open] .tool-group-chevron { transform: rotate(90deg); }
  .tool-group-list { padding: 3px 0 7px 21px; background: transparent; }
  .tool-call { position: relative; min-width: 0; border: 0; animation: toolIn .2s ease-out both; }
  .tool-call:last-child { border-bottom: 0; }
  .tool-call.done-bad { animation: rowFlash .6s ease; }
  .tool-call-head { width: 100%; border: 0; border-radius: 0; background: transparent; text-align: left; color: inherit; padding: 8px 0; align-items: center; }
  .tool-call-head:hover .cmd { color: var(--text); }
  .tool-call-head .cmd { flex: 1 1 auto; }
  .tool-call-head .why { flex: 0 2 auto; max-width: 36%; }
  .tool-call[data-tool-kind="edit"] .tool-kind { color: var(--run); }
  .tool-call[data-tool-kind="edit"] .cmd { font-family: var(--mono); text-decoration: underline dotted; text-decoration-color: var(--border2); text-underline-offset: 3px; }
  .tool-change-stat { display: inline-flex; gap: 6px; flex: none; color: var(--faint); font: 10.5px var(--mono); white-space: nowrap; }
  .tool-change-stat .added { color: var(--ok); }
  .tool-change-stat .removed { color: var(--err); }
  .tool-diff { padding: 8px 0 !important; border: 1px solid var(--border) !important; border-radius: 8px !important; background: var(--card2) !important; }
  .tool-diff-line { padding: 0 2px; white-space: pre-wrap; overflow-wrap: anywhere; }
  .tool-diff-line.add { color: var(--ok); background: var(--ok-dim); }
  .tool-diff-line.del { color: var(--err); background: var(--err-dim); }
  .tool-diff-line.hunk { color: var(--run); }
  .tool-kind { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 20px; flex: none; border: 0; color: var(--faint); font: 11px var(--mono); background: transparent; }
  .tool-duration { color: var(--faint); font: 10px var(--mono); font-variant-numeric: tabular-nums; flex: none; min-width: 32px; text-align: right; }
  .exit-code { font: 10px var(--mono); color: var(--faint); flex: none; }
  .exit-code.bad { color: var(--err); }
  .tool-chevron { color: var(--faint); transition: transform .18s ease; }
  .tl-cmd[aria-expanded=true] .tool-chevron { transform: rotate(90deg); }
  .tool-call .tl-out { margin: 0; }
  .tool-call .tl-out:not([open]) { display: none; }
  .tool-call .tl-out[open] { padding: 0 0 10px 24px; border: 0; }
  .tool-command { display: block; color: var(--muted); font: 11px/1.6 var(--mono); white-space: pre-wrap; overflow-wrap: anywhere; }
  .tool-purpose { margin: 4px 0; color: var(--muted); font-size: 12px; line-height: 1.6; }
  .tool-call .tl-out summary { display: flex; padding-top: 7px; }
  .tool-call .tl-out summary::before { display: none; }
  .tool-call .tool-btn-copy { margin-left: auto; }
  .tool-call .st-run::before { content: ''; width: 9px; height: 9px; border: 1.5px solid var(--run-dim); border-top-color: var(--run); border-radius: 50%; animation: toolSpin .9s linear infinite; }
  @keyframes toolSpin { to { transform: rotate(360deg); } }
  .jump-latest { position: absolute; z-index: 5; bottom: 152px; left: 50%; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; padding: 7px 14px; border: 1px solid var(--border2); border-radius: 999px; color: var(--text); background: var(--card); box-shadow: 0 6px 24px rgba(0,0,0,.3); font-size: 11px; }
  .jump-latest:hover { background: var(--hover); border-color: var(--run); }
  .approach-panel { flex: none; min-width: 0; margin: 0 20px 8px; border: 0; border-radius: 0; background: transparent; overflow: hidden; }
  .approach-panel > summary { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 9px 12px; cursor: pointer; list-style: none; }
  .approach-panel > summary::-webkit-details-marker { display: none; }
  .approach-panel > summary::before { content: '›'; color: var(--faint); transition: transform .18s ease; }
  .approach-panel[open] > summary::before { transform: rotate(90deg); }
  .approach-panel > summary:hover { background: var(--hover); }
  .approach-title { font-weight: 600; color: var(--text); font-size: 12px; }
  .approach-count { font: 10px var(--mono); color: var(--faint); }
  .approach-latest { flex: 1; min-width: 0; color: var(--muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .approach-status { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; flex: none; font: 10px var(--mono); color: var(--faint); }
  .approach-panel.is-live .approach-status::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: var(--accent); animation: pulse 1.5s ease-in-out infinite; }
  .approach-log { list-style: none; margin: 0; padding: 0 12px; max-height: min(210px, 27vh); overflow-y: auto; overflow-anchor: none; }
  .approach-entry { display: grid; grid-template-columns: 120px minmax(0,1fr); gap: 12px; border-top: 1px solid var(--border); padding: 8px 0; font-size: 11.5px; line-height: 1.5; animation: outFade .18s ease-out; }
  .approach-label { color: var(--faint); font-size: 10.5px; }
  .approach-detail { white-space: pre-wrap; overflow-wrap: anywhere; color: var(--muted); }
  .approach-entry:last-child .approach-detail { color: var(--text); }
  .approach-entry.pass .approach-label { color: var(--ok); }
  .approach-entry.fail .approach-label { color: var(--err); }
  .approach-note { margin: 0; padding: 4px 12px 10px; color: var(--faint); font-size: 10.5px; }
  @media (max-width: 720px) { .approach-panel { margin: 0 10px 6px; } .approach-latest { display: none; } .approach-entry { grid-template-columns: 1fr; gap: 2px; } }
  @media (max-width: 720px) { .tool-call .why { display: none; } .tool-call .tl-cmd { gap: 6px; } .tool-group-state { display: none; } .tool-group-list { padding-left: 10px; } .tool-call .st { letter-spacing: 0; } }
  .fold-btn { display: block; width: 100%; padding: 4px 0; background: transparent; border: 0; box-shadow: none; color: var(--run); font-size: 10.5px; text-align: left; cursor: pointer; font-family: var(--mono); }
  .fold-btn:hover { color: var(--text); }

  .chip { font-size: 11px; border-radius: 999px; padding: 2px 9px; border: 1px solid var(--border2); color: var(--muted); }
  .chip.ok { color: var(--ok); border-color: var(--ok-border); background: var(--ok-dim); }
  .chip.bad { color: var(--err); border-color: var(--err-border); background: var(--err-dim); }
  .chip.info { color: var(--run); border-color: var(--run-border); background: var(--run-dim); }
  .chip.warn { color: var(--evidence); border-color: var(--warn-border); background: var(--amber-bg); }
  /* A refused action: the reason code, the operation it refused, and the real
     detail message — none of which the legacy line carried. Quiet by design:
     the agent refusing itself is context, not a headline. */
  .tl-policy .policy-op { font-family: var(--mono); font-size: 11.5px; color: var(--muted); overflow-wrap: anywhere; }
  .tl-policy .policy-tool { font-family: var(--mono); font-size: 11px; color: var(--faint); }
  .tl-policy .policy-summary { color: var(--muted); font-size: 11.5px; line-height: 1.5; margin-top: 4px; }
  .tl-policy .policy-detail { color: var(--muted); font-size: 11.5px; line-height: 1.5; margin-top: 4px; overflow-wrap: anywhere; }
  .tl-policy details.policy-detail summary { width: fit-content; cursor: pointer; color: var(--faint); font-size: 11px; }
  .tl-policy details.policy-detail summary:hover { color: var(--text); }
  .tl-policy .policy-raw { max-height: 180px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; padding: 8px 10px; margin-top: 6px; border-radius: 7px; background: var(--card2); user-select: text; }
  .tl-meta .recover-detail { color: var(--muted); font-size: 11.5px; line-height: 1.5; margin-top: 3px; overflow-wrap: anywhere; }
  .crit-req { font-family: var(--mono); font-size: 11px; color: var(--muted); margin-top: 3px; }
  .crit-req code { background: var(--card2); border-radius: 4px; padding: 1px 5px; color: var(--text); }

  .review-card, .approval { border: 1px solid var(--warn-border); background: var(--amber-bg); border-radius: 12px; padding: 14px 16px; margin: 12px 0; }
  .review-card h3, .approval h3 { margin: 0 0 8px; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: var(--evidence); }
  .review-card label { display: block; font-size: 11px; color: var(--muted); margin: 8px 0 3px; }
  .review-card textarea { width: 100%; border: 1px solid var(--border2); border-radius: 8px; background: var(--card2); color: var(--text); padding: 7px 9px; font-family: var(--mono); font-size: 11.5px; resize: vertical; }
  .review-card .actions, .approval .actions { display: flex; gap: 8px; margin-top: 12px; align-items: center; }
  .review-card .actions { flex-wrap: wrap; }
  .review-card .actions .btn { flex: none; }
  .review-card .actions input { min-width: 0; flex: 1 1 160px; }
  .review-card input { flex: 1; border: 1px solid var(--border2); border-radius: 8px; background: var(--card2); color: var(--text); padding: 6px 9px; font-size: 12px; }
  .btn { border: 0; border-radius: 8px; padding: 6px 14px; font-size: 12.5px; font-weight: 600; }
  .btn.dark { background: var(--dark); color: var(--on-accent); }
  .btn.ghost { background: transparent; color: var(--text); border: 1px solid var(--border2); }
  .btn.red { background: transparent; color: var(--err); border: 1px solid var(--err-border); }
  .approval pre { font-family: var(--mono); font-size: 11.5px; background: var(--card2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; overflow-x: auto; margin: 6px 0 10px; }
  .md-plan { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 4px 14px; margin: 6px 0; }
  .md-plan h4 { margin: 12px 0 6px; font-size: 12px; letter-spacing: .8px; text-transform: uppercase; color: var(--muted); }
  .md-plan ol { margin: 0 0 12px; padding-left: 20px; }
  .md-plan li { margin: 8px 0; font-size: 13px; }
  .md-plan li .ver { display: block; color: var(--muted); font-size: 11.5px; }
  .md-plan ul { margin: 0 0 12px; padding-left: 20px; font-size: 12.5px; }

  .qcard { border: 1px solid var(--run-border); background: var(--run-dim); border-radius: 12px; padding: 14px 16px; margin: 12px 0; }
  .qcard h3 { margin: 0 0 10px; font-size: 12px; letter-spacing: 1px; text-transform: uppercase; color: var(--run); }
  .qcard .q { margin-bottom: 12px; }
  .qcard .q .qt { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
  .qcard .opts { display: flex; gap: 6px; flex-wrap: wrap; }
  .qcard .opt { border: 1px solid var(--border2); background: var(--card2); color: var(--text); border-radius: 999px; padding: 4px 12px; font-size: 12px; cursor: pointer; }
  .qcard .opt.sel { border-color: var(--run); color: var(--run); background: var(--run-dim); }
  .qcard .custom { width: 100%; margin-top: 6px; border: 1px solid var(--border2); border-radius: 8px; padding: 6px 9px; font-size: 12px; background: var(--card2); color: var(--text); }

  .summary-card { background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 18px 20px; margin: 16px 0; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
  .summary-card .summary-head { display: flex; gap: 9px; align-items: center; justify-content: space-between; }
  .summary-card h2 { margin: 0; font-size: 15px; min-width: 0; }
  .summary-card .summary-stats { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .summary-card .summary-stat { color: var(--muted); font: 11px var(--mono); border: 1px solid var(--border); border-radius: 999px; padding: 3px 8px; background: var(--card2); }
  .summary-card .sec { margin-top: 12px; }
  .summary-card .sec h4 { margin: 0 0 5px; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); }
  .summary-card .summary-copy { margin: 0; font-size: 12.5px; line-height: 1.55; white-space: pre-line; }
  .summary-card ul { margin: 0; padding-left: 18px; font-size: 12.5px; }
  .summary-card li { margin: 2px 0; }
  .file-chip { display: inline-block; font-family: var(--mono); font-size: 11px; border: 1px solid var(--border); border-radius: 6px; padding: 2px 7px; margin: 2px 4px 2px 0; background: var(--card2); color: inherit; text-decoration: none; }
  a.file-chip:hover { border-color: var(--border2); color: var(--text); background: var(--hover); }
  .summary-card .verify-list { display: grid; gap: 6px; }
  .summary-card .verify-row { border: 1px solid var(--border); border-radius: 8px; padding: 7px 9px; font-size: 12px; display: flex; gap: 7px; align-items: flex-start; flex-wrap: wrap; }
  .summary-card .verify-kind { color: var(--muted); font: 10.5px var(--mono); padding-top: 3px; }
  .summary-card .verify-label { flex: 1; min-width: 150px; line-height: 1.4; }
  .summary-card .verify-row details { width: 100%; color: var(--muted); font-size: 11px; }
  .summary-card .verify-row summary { cursor: pointer; width: fit-content; }
  .summary-card .verify-row pre { margin: 6px 0 0; padding: 7px; max-height: 150px; overflow: auto; white-space: pre-wrap; word-break: break-word; border-radius: 6px; background: var(--card2); font: 10.5px var(--mono); color: var(--muted); }
  /* Completion reports share Cowork reply styling. Verification details
     remain available in the collapsed technical evidence disclosure. */
  .report-flat { padding: 0; margin: 16px 0; min-width: 0; }
  .report-flat .r-headline { display: flex; align-items: center; gap: 10px; }
  .report-flat h2 { margin: 0; font-size: 17px; }
  .report-flat .r-headline .tool-btn-copy { margin-left: auto; }
  .report-flat .r-lede { margin: 8px 0 0; font-size: 13.5px; line-height: 1.6; color: var(--text); }
  .report-flat .r-status { display: flex; flex-wrap: wrap; gap: 6px 18px; margin-top: 10px; font-size: 12.5px; color: var(--muted); }
  .report-flat .r-status b { color: var(--text); font-weight: 600; }
  .report-flat .r-sec { margin-top: 16px; }
  .report-flat .r-sec h4 { margin: 0 0 6px; font-size: 12.5px; font-weight: 650; color: var(--text); }
  .report-flat .r-sec ul { margin: 0; padding: 0; list-style: none; font-size: 12.5px; line-height: 1.55; }
  .report-flat .r-sec li { position: relative; padding-left: 16px; margin: 3px 0; }
  .report-flat .r-sec li::before { content: '\2022'; position: absolute; left: 4px; color: var(--faint); }
  .report-flat .r-files { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
  .report-files { margin-top: 12px; border: 1px solid var(--border2); border-radius: 12px; overflow: hidden; background: var(--card2); }
  .report-files-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; color: var(--text); font-size: 12.5px; font-weight: 600; border-bottom: 1px solid var(--border); }
  .report-files-head svg { width: 15px; height: 15px; color: var(--run); }
  .report-files-count { margin-left: auto; color: var(--faint); font: 11px var(--mono); }
  .report-file-row { display: flex; align-items: center; gap: 12px; min-width: 0; padding: 7px 12px; color: var(--muted); font: 11.5px var(--mono); text-decoration: none; }
  .report-file-row + .report-file-row { border-top: 1px solid var(--border); }
  .report-file-row:hover { background: var(--hover); color: var(--text); }
  .report-file-path { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .report-file-action { margin-left: auto; flex: none; color: var(--faint); font: 11px var(--sans); }
  .report-files-more > summary { cursor: pointer; padding: 9px 12px; color: var(--muted); font-size: 11.5px; border-top: 1px solid var(--border); }
  .report-files-more > summary:hover { color: var(--text); background: var(--hover); }
  .r-delivery-more { margin-top: 7px; }
  .r-delivery-more > summary { width: fit-content; cursor: pointer; color: var(--muted); font-size: 11.5px; }
  .r-delivery-more > summary:hover { color: var(--text); }
  .r-delivery-more > ul { margin-top: 7px; }
  .report-flat .r-note { margin-top: 7px; font-size: 12px; color: var(--muted); }
  .report-flat .sec { margin-top: 14px; }
  .report-flat .sec h4 { margin: 0 0 6px; font-size: 11px; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); }
  .report-flat ul { margin: 0; padding-left: 18px; font-size: 12.5px; }
  .report-flat li { margin: 2px 0; }
  .report-flat .verify-list { display: grid; gap: 6px; }
  .report-flat .verify-row { border: 1px solid var(--border); border-radius: 8px; padding: 7px 9px; font-size: 12px; display: flex; gap: 7px; align-items: flex-start; flex-wrap: wrap; }
  .report-flat .verify-kind { color: var(--muted); font: 10.5px var(--mono); padding-top: 3px; }
  .report-flat .verify-label { flex: 1; min-width: 150px; line-height: 1.4; }
  .report-flat .verify-row details { width: 100%; color: var(--muted); font-size: 11px; }
  .report-flat .verify-row summary { cursor: pointer; width: fit-content; }
  .report-flat .verify-row pre { margin: 6px 0 0; padding: 7px; max-height: 150px; overflow: auto; white-space: pre-wrap; word-break: break-word; border-radius: 6px; background: var(--card2); font: 10.5px var(--mono); color: var(--muted); }
  .connection-fields { display: grid; gap: 12px; margin-top: 12px; }
  .connection-field { display: grid; gap: 5px; font-size: 12.5px; color: var(--text); }
  .connection-field small { color: var(--faint); font-weight: normal; }
  .connection-field input { min-width: 0; width: 100%; }
  .connection-secret-actions { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
  .connection-secret-actions .hint { flex: 1; }
  .connection-details { margin-top: 14px; color: var(--muted); font-size: 12px; }
  .connection-details summary { cursor: pointer; }
  .connection-error { color: var(--red); margin-top: 12px; font-size: 12.5px; }
  .step.cancelled, .step .st.cancelled, .composer-todo.cancelled { color: var(--muted); opacity: .7; }
  .composer-todo.cancelled .composer-todo-text { text-decoration: line-through; }
  /* The user's own message mirrors the Cowork "me" bubble exactly: same milky
     surface, same asymmetric corners, same right-aligned meta line, so both
     chats read the same. Theme overrides live in ui-theme.ts. */
  .usermsg { display: flex; justify-content: flex-end; margin: 10px 0; }
  .usermsg .ub { position: relative; min-width: 0; max-width: min(74%, 680px); overflow-wrap: anywhere; white-space: pre-wrap; font-size: 15px; line-height: 1.58;
    background: color-mix(in srgb, var(--run-dim) 84%, transparent);
    border: 1px solid color-mix(in srgb, var(--run-border) 45%, transparent);
    border-radius: 20px; border-bottom-right-radius: 7px; padding: 10px 16px;
    backdrop-filter: blur(12px) saturate(1.35); -webkit-backdrop-filter: blur(12px) saturate(1.35);
    box-shadow: var(--shadow), inset 0 1px 0 color-mix(in srgb, var(--card) 60%, transparent);
    transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; }
  .usermsg .ub:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--border2) 70%, transparent); box-shadow: var(--shadow-float), inset 0 1px 0 color-mix(in srgb, var(--card) 60%, transparent); }
  .usermsg .umeta { display: flex; align-items: center; justify-content: flex-end; gap: 7px; min-height: 24px; font-size: 11px; color: var(--muted); margin-bottom: 5px; }
  .usermsg .umeta .nm { font-weight: 700; color: var(--text); }
  .usermsg .umeta .tg { color: var(--faint); }
  .usermsg.pending .ubtns { display: none; }

  @keyframes spin { to { transform: rotate(360deg); } }
  ${ACTIVITY_CSS}
  .working.activity-indicator { padding: 10px 2px 12px; }

  .run-side { position: fixed; top: 0; bottom: 0; left: var(--sbw, 264px); z-index: 70; width: min(420px, calc(100vw - var(--sbw, 264px))); display: flex; flex-direction: column; min-height: 0; border-right: 1px solid var(--border2); background: var(--card); box-shadow: 14px 0 40px rgba(0,0,0,.35); }
  .shell.left-collapsed .run-side { left: 44px; width: min(420px, calc(100vw - 44px)); }
  .side-panel-head { display: flex; align-items: center; gap: 10px; min-height: 46px; padding: 7px 14px; border-bottom: 1px solid var(--border); font-weight: 650; }
  .side-panel-head .close { margin-left: auto; border: 0; border-radius: 7px; background: none; color: var(--muted); width: 28px; height: 28px; font-size: 18px; }
  .side-panel-head .close:hover { background: var(--hover); color: var(--text); }
  .side-body { flex: 1; overflow-y: auto; background: var(--card); border-top: 1px solid var(--border); padding: 16px 18px; }
  .side-summary { border: 1px solid var(--border); background: var(--card2); border-radius: 10px; padding: 11px 13px; margin-bottom: 12px; border-left: 3px solid var(--accent); }
  .side-summary .t { font-weight: 650; font-size: 12.5px; letter-spacing: .02em; }
  .side-summary .d { color: var(--muted); font-size: 11.5px; margin-top: 4px; font-family: var(--mono); }
  .side-more { margin-top: 6px; color: var(--muted); font-size: 11.5px; }
  .side-more > summary { cursor: pointer; padding: 4px 0; }
  .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 18px; }
  .stat .k { font-size: 11px; color: var(--muted); margin-bottom: 2px; }
  .stat .v { font-size: 12.5px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stat .v.mono { font-family: var(--mono); font-weight: 500; font-size: 12px; }
  .section-h { font-size: 10.5px; letter-spacing: .09em; text-transform: uppercase; color: var(--muted); margin: 20px 0 8px; padding-bottom: 5px; border-bottom: 1px solid var(--border); font-weight: 700; }
  .crit { display: flex; gap: 8px; padding: 6px 9px; font-size: 12.5px; align-items: flex-start; border: 1px solid var(--border); background: var(--card2); border-radius: 8px; margin-bottom: 5px; }
  .crit.done { opacity: .78; border-color: var(--ok-border); }
  .crit .dot { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; flex: none; background: var(--faint); }
  .crit.done .dot { background: var(--green); }
  .crit .ev-ids { font-family: var(--mono); font-size: 10.5px; color: var(--muted); }
  .step { display: flex; gap: 8px; padding: 4px 0; font-size: 12.5px; }
  .step .st { font-family: var(--mono); font-size: 10.5px; width: 76px; flex: none; color: var(--muted); padding-top: 1px; }
  .step .st.done { color: var(--green); } .step .st.failed, .step .st.blocked { color: var(--red); } .step .st.in_progress { color: var(--blue); }
  /* Evidence checks read as scannable cards instead of flat wrapped rows. */
  .side-evidence { display: flex; flex-direction: column; gap: 6px; }
  .ev-row { display: flex; align-items: flex-start; gap: 8px; border: 1px solid var(--border); background: var(--card2); border-radius: 8px; padding: 6px 9px; font-size: 12px; }
  .ev-row.pass { border-color: var(--ok-border); background: color-mix(in srgb, var(--ok-dim) 30%, var(--card2)); }
  .ev-row.fail { border-color: var(--err-border); background: color-mix(in srgb, var(--err-dim) 30%, var(--card2)); }
  .ev-chip { flex: none; font-family: var(--mono); font-size: 9.5px; font-weight: 700; letter-spacing: .06em; border-radius: 999px; padding: 2px 7px; margin-top: 1px; }
  .ev-chip.pass { color: var(--ok); background: var(--ok-dim); box-shadow: inset 0 0 0 1px var(--ok-border); }
  .ev-chip.fail { color: var(--err); background: var(--err-dim); box-shadow: inset 0 0 0 1px var(--err-border); }
  .ev-text { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.4; }
  .ev-row:hover .ev-text { white-space: normal; overflow-wrap: anywhere; }
  .side-fail { margin: 0 0 14px; padding: 11px 12px; border: 1px solid var(--err-border); border-radius: 9px; background: var(--err-dim); color: var(--err); font-size: 12px; line-height: 1.5; }
  .side-fail .ft { font-weight: 700; display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
  .side-fail .fmsg { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
  .side-fail .fhint { margin-top: 7px; color: var(--muted); }
  .side-fail .facts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
  .side-fail .facts .btn { padding: 5px 11px; font-size: 11.5px; border-radius: 7px; }
  .bar { height: 6px; border-radius: 3px; background: var(--line); overflow: hidden; display: flex; margin: 8px 0 6px; }
  .bar span { height: 100%; }
  .legend { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 12px; font-size: 11px; color: var(--muted); }
  .legend i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; margin-right: 4px; }
  .tl-time { margin-left: auto; flex: none; align-self: flex-start; margin-top: 5px; color: var(--faint); font: 10px var(--mono); opacity: .8; }
  .empty { color: var(--faint); font-size: 12.5px; padding: 4px 0; }

  .bottom-composer { padding: 10px 26px 14px; flex: none; background: var(--bg); }
  .bottom-composer .composer { width: 100%; box-shadow: none; }
  /* The current checklist lives at the point of action. It is deliberately
     compact: the agent's next work item stays visible without competing with
     the conversation or forcing people back into the details panel. */
  .composer-todos { margin: 0 0 5px; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
  .composer-todos-head { display: flex; align-items: center; gap: 9px; min-height: 34px; padding: 6px 3px; cursor: pointer; list-style: none; color: var(--muted); }
  .composer-todos-head::-webkit-details-marker { display: none; }
  .composer-todos-head::before { content: ''; width: 5px; height: 5px; margin: 0 4px 0 2px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(-45deg); transition: transform .18s ease; flex: none; }
  .composer-todos[open] > .composer-todos-head::before { transform: rotate(45deg); }
  .composer-todos-head:hover { color: var(--text); }
  .composer-todos-head:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .composer-todos-title { flex: none; font-size: 11.5px; font-weight: 500; }
  .composer-todos-current { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--text); }
  .composer-todos-count { margin-left: auto; color: var(--muted); font: 10.5px var(--mono); white-space: nowrap; }
  .composer-todo-list { max-height: 180px; overflow-y: auto; margin: 0; padding: 2px 0 8px 20px; list-style: none; scrollbar-gutter: stable; }
  .composer-todo { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; gap: 7px; align-items: start; padding: 5px 3px; color: var(--text); font-size: 12px; line-height: 1.5; }
  .composer-todo.active { color: var(--text); }
  .composer-todo.done { color: var(--muted); }
  .composer-todo.blocked, .composer-todo.failed { color: var(--err); }
  .composer-todo-mark { display: grid; place-items: center; width: 13px; height: 13px; margin-top: 2px; border: 1px solid var(--border2); border-radius: 50%; color: transparent; font-size: 9px; line-height: 1; }
  .composer-todo.active .composer-todo-mark { border-color: var(--run); background: var(--run); box-shadow: 0 0 0 3px var(--run-dim); }
  .composer-todo.active .composer-todo-mark::after { content: ''; width: 5px; height: 5px; border-radius: 50%; background: #fff; animation: pulse 1.35s ease-in-out infinite; }
  .composer-todo.done .composer-todo-mark { border-color: var(--ok); background: var(--ok-dim); color: var(--ok); }
  .composer-todo.blocked .composer-todo-mark, .composer-todo.failed .composer-todo-mark { border-color: var(--err); background: var(--err-dim); color: var(--err); }
  .composer-todo-text { min-width: 0; overflow-wrap: anywhere; }
  .composer-todo.done .composer-todo-text { text-decoration: line-through; text-decoration-color: var(--faint); }
  .composer-todo-parent { color: var(--faint); font-size: 10.5px; }
  .composer-todo-state { color: var(--faint); font: 10px var(--mono); text-transform: uppercase; white-space: nowrap; }
  .composer-todo.active .composer-todo-state { color: var(--run); }
  .composer-todo.done .composer-todo-state { color: var(--ok); }
  .composer-todo.blocked .composer-todo-state, .composer-todo.failed .composer-todo-state { color: var(--err); }

  .settings { position: fixed; inset: 0; background: var(--bg); z-index: 40; display: flex; }
  .setnav { width: 264px; border-right: 1px solid var(--border); padding: 16px 10px; overflow-y: auto; }
  .setnav .back { display: flex; gap: 8px; align-items: center; border: 0; background: none; color: var(--muted); font-size: 13px; padding: 6px 10px; border-radius: 8px; margin-bottom: 10px; }
  .setnav .back:hover { background: var(--hover); color: var(--text); }
  .setnav .item { display: flex; gap: 10px; align-items: center; padding: 8px 10px; border-radius: 8px; font-size: 13px; cursor: pointer; border: 0; background: none; width: 100%; text-align: left; color: var(--text); }
  .setnav .item:hover { background: var(--hover); }
  .setnav .item.active { background: var(--selected); }
  .setnav .sect { font-size: 11px; color: var(--muted); margin: 14px 10px 4px; }
  .setbody { flex: 1; overflow-y: auto; padding: 34px 8vw; }
  .setbody h1 { font-size: 22px; font-weight: 600; margin: 0 0 20px; }
  .setbody h2 { font-size: 13px; font-weight: 600; margin: 26px 0 10px; }
  .setcard { background: var(--card); border: 1px solid var(--border); border-radius: 14px; }
  .setrow { display: flex; align-items: center; gap: 16px; padding: 14px 18px; border-bottom: 1px solid var(--border); }
  .setrow:last-child { border-bottom: 0; }
  .setrow .grow { flex: 1; }
  .setrow .t { font-weight: 600; font-size: 13px; }
  .setrow .d { color: var(--muted); font-size: 12px; margin-top: 2px; }
  .setrow select, .setrow input[type=text] { border: 1px solid var(--border2); border-radius: 8px; background: var(--card2); color: var(--text); padding: 6px 10px; font-size: 12.5px; }
  .prov-head { display: flex; align-items: center; gap: 10px; cursor: pointer; user-select: none; padding: 3px 6px; margin: 0 -6px; border-radius: 8px; }
  .prov-head:hover { background: var(--hover); }
  .prov-chev { flex: none; color: var(--faint); font-size: 10px; transition: transform .15s ease; }
  .prov-open .prov-chev { transform: rotate(90deg); }
  .pm-wrap { position: relative; display: inline-block; }
  .pm-btn { display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--border2); background: var(--card2); color: var(--text); border-radius: 8px; padding: 5px 11px; font-size: 12px; cursor: pointer; max-width: 360px; }
  .pm-btn:hover { border-color: var(--border2); }
  .pm-btn .pm-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pm-btn .caret { color: var(--muted); font-size: 9px; transition: transform .15s ease; }
  .pm-wrap.open .pm-btn { border-color: var(--accent); }
  .pm-wrap.open .caret { transform: rotate(180deg); }
  .pm-menu { width: 340px; left: 0; }
  .provider-toolbar { display: flex; align-items: center; gap: 10px; margin: 0 0 12px; }
  .provider-toolbar input { flex: 1; min-width: 160px; }
  .provider-toolbar .meta { color: var(--muted); font-size: 11.5px; white-space: nowrap; }
  .keysec { display: none; margin-top: 10px; align-items: center; gap: 6px; flex-wrap: wrap; }
  .keysec.show { display: flex; }
  .keysec .hint { width: 100%; color: var(--faint); font-size: 11px; }
  .model-item .mi-cur { color: var(--accent); font-weight: 700; flex: none; }
  .toggle { width: 38px; height: 22px; border-radius: 999px; background: var(--border2); border: 0; position: relative; transition: background .15s; flex: none; }
  .toggle.on { background: var(--blue); }
  .toggle::after { content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: left .15s; }
  .toggle.on::after { left: 19px; }
  .setlist { padding: 10px 18px; }
  .setlist .row { display: flex; gap: 8px; align-items: center; padding: 6px 0; font-size: 12.5px; }
  .setlist .row .grow { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .setlist .x { color: var(--faint); cursor: pointer; border: 0; background: none; }
  .setlist .x:hover { color: var(--red); }
  .setlist input, .setlist textarea { width: 100%; border: 1px solid var(--border2); border-radius: 8px; background: var(--card2); color: var(--text); padding: 6px 9px; font-size: 12px; margin-bottom: 6px; }
  .setlist .meta { color: var(--muted); font-size: 11px; }
  .toasts { position: fixed; top: 16px; right: 16px; z-index: 100; display: flex; flex-direction: column; gap: 8px; }
  .toast { background: var(--card); color: var(--text); border: 1px solid var(--border2); border-radius: 10px; padding: 10px 14px; font-size: 12.5px; max-width: 380px; box-shadow: 0 6px 24px rgba(0,0,0,.45); animation: tin .18s ease; white-space: pre-wrap; }
  .toast.err { background: var(--err-dim); border-color: var(--err-border); color: var(--err); }
  .toast-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }
  .toast-actions button { background: none; border: 1px solid var(--err-border); color: var(--err); border-radius: 6px; padding: 3px 10px; font-size: 11.5px; cursor: pointer; min-height: 24px; }
  .toast-actions button:hover { background: var(--err-dim); }
  .welapsed { color: var(--faint); font-family: var(--mono); font-size: 10.5px; margin-left: 2px; }
  .working.slow { border-color: var(--warn-border); }
  .working.slow .wtext { color: var(--evidence); }
  .working.slow .welapsed { color: var(--evidence); }
  @keyframes tin { from { transform: translateY(-6px); opacity: 0; } }
  .modal { position: fixed; inset: 0; background: var(--overlay); z-index: 60; display: flex; align-items: center; justify-content: center; }
  .modal .box { width: 580px; max-width: 94vw; max-height: 72vh; background: var(--card); border-radius: 14px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.3); }
  /* Modal headers share the .bar class name with the 6px progress strip.
     Re-assert every strip property here so headers render as real bars. */
  .modal .bar { height: auto; margin: 0; border-radius: 0; background: transparent; overflow: visible; flex: none; display: flex; gap: 8px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border); }
  .modal .bar span { height: auto; }
  .modal .bar .crumb { flex: 1; font-family: var(--mono); font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .modal .list { flex: 1; overflow-y: auto; padding: 6px; }
  .modal .frow { display: flex; gap: 9px; align-items: center; padding: 7px 10px; border-radius: 8px; cursor: pointer; font-size: 13px; }
  .modal .frow:hover { background: var(--hover); }
  .modal .frow .ico { color: var(--muted); display: inline-flex; }
  .modal .foot { padding: 10px 14px; border-top: 1px solid var(--border); display: flex; gap: 8px; align-items: center; }
  .sb .navitem .ico, .sb .proj .ico, .setnav .item .ico, .sug .ico { display: inline-flex; align-items: center; color: var(--muted); }
  .sugs .sug .ico { display: flex; margin-bottom: 10px; }
  .setlist .x svg { width: 12px; height: 12px; }
  .ubtns { display: flex; gap: 6px; justify-content: flex-end; margin-top: 6px; opacity: 0; transition: opacity .12s; }
  div:hover > .ubtns, div:hover .ubtns { opacity: 1; }
  .ubtn { border: 1px solid color-mix(in srgb, var(--border2) 60%, transparent); background: color-mix(in srgb, var(--card2) 70%, transparent); color: var(--muted); border-radius: 999px; width: 30px; height: 26px; display: inline-flex; align-items: center; justify-content: center; }
  .ubtn:hover { color: var(--text); border-color: var(--border2); }
  .ubtn svg { width: 12px; height: 12px; }

  .shell.left-collapsed .sb { width: 44px; border-right: 0; background: var(--bg); }
  .shell.left-collapsed .sb .scroll, .shell.left-collapsed .sb .foot,
  .shell.left-collapsed .sb .name, .shell.left-collapsed .sb .spacer,
  .shell.left-collapsed .sb #gearBtn { display: none; }
  .shell.left-collapsed .sb .head { padding: 14px 0 8px; justify-content: center; }
  .vresize { width: 6px; flex: none; cursor: col-resize; margin: 0 -3px; z-index: 6; }
  .vresize:hover, .vresize.active { background: var(--border2); }
  .shell.left-collapsed #sbResize { display: none; }

  .abubble { max-width: 100%; background: transparent; border: 0; border-radius: 0; padding: 8px 0; margin: 10px 0; font-size: 14px; line-height: 1.75; white-space: pre-wrap; box-shadow: none; }
  .abubble .who { display: block; color: var(--accent); font-size: 10.5px; font-weight: 600; margin-bottom: 2px; }
  .session-file { position: relative; max-width: 520px; margin: 9px 0 9px 20px; border: 1px solid var(--border2); border-radius: 12px; background: var(--card); padding: 10px 11px; display: flex; gap: 10px; align-items: center; box-shadow: 0 1px 2px rgba(0,0,0,.18); }
  .session-file.user { margin-left: auto; border-color: var(--run-border); background: var(--run-dim); }
  .session-file .file-ico { width: 34px; height: 34px; flex: none; display: inline-flex; align-items: center; justify-content: center; color: var(--run); border: 1px solid var(--border); border-radius: 9px; background: var(--card2); }
  .session-file.user .file-ico { color: var(--blue); }
  .session-file .file-main { flex: 1; min-width: 0; }
  .session-file .file-name { color: var(--text); font-size: 12.5px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .session-file .file-meta { margin-top: 2px; color: var(--faint); font: 10.5px var(--mono); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .session-file .file-actions { display: flex; gap: 5px; align-items: center; flex: none; }
  .session-file .file-actions a { color: var(--muted); border: 1px solid var(--border); border-radius: 7px; padding: 4px 7px; font-size: 11px; text-decoration: none; }
  .session-file .file-actions a:hover { color: var(--text); border-color: var(--border2); background: var(--hover); }
  .session-file .file-preview { width: 48px; height: 48px; flex: none; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); background: var(--card2); }
  .session-file.has-media { flex-direction: column; align-items: stretch; }
  .session-file .file-media { width: 100%; max-height: 300px; border-radius: 8px; border: 1px solid var(--border); background: #000; display: block; }
  .session-file.has-media audio.file-media { max-height: none; }

  .shotmsg { margin: 10px 0 10px 20px; }
  .shotmsg img { display: block; max-width: 340px; width: 100%; border: 1px solid var(--border2); border-radius: 10px; background: var(--card2); box-shadow: 0 2px 10px rgba(0,0,0,.3); margin-top: 4px; }
  .browser-shot img { border-color: var(--border2); }
  .browser-chat-highlight { display: flex; align-items: center; gap: 7px; width: fit-content; padding: 3px 8px; border-radius: 999px; color: var(--text); background: var(--selected); font-size: 11px; }
  .browser-chat-highlight span { color: var(--accent); }
  .browser-highlight { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-top: 12px; padding: 9px 10px; border: 1px solid var(--border2); border-radius: 9px; background: var(--selected); color: var(--text); font-size: 12px; }
  .browser-highlight > div { display: flex; align-items: center; gap: 7px; }
  .browser-highlight b { font-size: 11px; letter-spacing: .7px; text-transform: uppercase; }
  .browser-highlight > span { color: var(--accent); font: 10.5px var(--mono); }

  .skcard { padding: 12px 16px; border-bottom: 1px solid var(--border); }
  .skcard:last-child { border-bottom: 0; }
  .skhead { display: flex; gap: 8px; align-items: center; font-size: 13px; }
  .skhead .meta { color: var(--faint); font-size: 11px; }
  .skdesc { color: var(--muted); font-size: 12.5px; margin-top: 3px; }
  .skinstr { font-family: var(--mono); font-size: 11.5px; background: var(--card2); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; margin-top: 8px; white-space: pre-wrap; max-height: 260px; overflow: auto; }

  .thumbs { display: flex; gap: 6px; padding: 8px 8px 0; flex-wrap: wrap; }
  .thumbs .th { position: relative; }
  .thumbs img { width: 52px; height: 52px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); display: block; }
  .thumbs .th-file { width: min(230px, 100%); height: 52px; display: flex; align-items: center; gap: 8px; border: 1px solid var(--border); border-radius: 8px; padding: 6px 26px 6px 8px; background: var(--card2); }
  .thumbs .th-file .th-ico { color: var(--run); flex: none; display: inline-flex; }
  .thumbs .th-file .th-info { min-width: 0; }
  .thumbs .th-file .th-name { display: block; color: var(--text); font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .thumbs .th-file .th-size { display: block; color: var(--faint); font: 10px var(--mono); margin-top: 2px; }
  .thumbs .rm { position: absolute; top: -7px; right: -7px; width: 22px; height: 22px; border-radius: 50%; border: 1px solid var(--border2); background: var(--card2); color: var(--muted); font-size: 11px; display: flex; align-items: center; justify-content: center; padding: 0; }
  /* Invisible hit-area expansion so the small round button meets ~28px touch targets. */
  .thumbs .rm::after { content: ''; position: absolute; inset: -5px; border-radius: 50%; }
  .thumbs .rm:hover { color: var(--err); border-color: var(--err-border); }
  .pill[disabled] { opacity: .4; cursor: not-allowed; }

  .grow-row { display: flex; gap: 6px; align-items: center; padding: 3px 0; }
  .gitpath { font-family: var(--mono); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
  .gitpath:hover { color: var(--accent); }

  .bpanel2 .nav { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 8px; }
  .bpanel2 .nav input { flex: 1; border: 1px solid var(--border2); border-radius: 8px; padding: 6px 9px; font-family: var(--mono); font-size: 12px; background: var(--card2); color: var(--text); min-width: 0; }
  .bpanel2 .bwrap { position: relative; }
  .bpanel2 .bwrap img { width: 100%; display: block; border: 1px solid var(--border); border-radius: 10px; background: var(--card2); min-height: 160px; object-fit: top left; }
  .bdrive { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); z-index: 6; display: flex; align-items: center; gap: 7px; background: var(--accent); color: #fff; border-radius: 999px; padding: 6px 14px; font-size: 12px; font-weight: 600; box-shadow: 0 4px 16px rgba(124,108,240,.5); animation: pulse 1.4s infinite; white-space: nowrap; }
  .bdrive svg { width: 13px; height: 13px; }
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: .01ms !important; }
  }
  @media (max-width: 720px) {
    .shell { width: 100%; }
    .usermsg .ub { max-width: 100%; }
    .mobile-nav-btn { display: flex; align-items: center; gap: 9px; min-height: 46px; padding: 0 14px; border: 0; border-bottom: 1px solid var(--border); background: var(--bg); color: var(--text); font-weight: 700; letter-spacing: .8px; flex: none; }
    .mobile-nav-btn .hamb { color: var(--muted); font-size: 18px; }
    .mobile-backdrop { position: fixed; inset: 0; z-index: 79; border: 0; padding: 0; background: var(--overlay); }
    .shell.mobile-nav-open .mobile-backdrop { display: block; }
    .sb { position: fixed; inset: 0 auto 0 0; z-index: 80; width: min(320px, 88vw) !important; transform: translateX(-105%); transition: transform .18s ease; box-shadow: 14px 0 40px rgba(0,0,0,.48); }
    .shell.mobile-nav-open .sb { transform: none; }
    .shell.left-collapsed .sb { width: min(320px, 88vw) !important; }
    .shell.left-collapsed .sb .scroll, .shell.left-collapsed .sb .foot,
    .shell.left-collapsed .sb .name, .shell.left-collapsed .sb .spacer,
    .shell.left-collapsed .sb #gearBtn { display: flex; }
    .shell.left-collapsed .sb .head { padding: 14px 14px 8px; justify-content: flex-start; }
    #sbResize, #sbCollapse { display: none !important; }
    .main { width: 100%; min-width: 0; }
    .home { justify-content: flex-start; gap: 14px; padding: 26px 14px 20px; }
    .home h1 { width: 100%; text-align: left; font-size: 21px; line-height: 1.35; }
    .sugs { width: 100%; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .sug { min-width: 0; min-height: 92px; padding: 12px; }
    .composer { width: 100%; }
    .composer-bar { gap: 4px; padding-inline: 2px; }
    .composer-bar .pill, .composer-bar .send { min-height: 40px; }
    .control-prefix { display: none; }
    .model-control { max-width: calc(100% - 78px); }
    .model-pick .mp-label { max-width: 150px; }
    .model-menu { position: fixed; left: 12px; right: 12px; bottom: 72px; top: auto; width: auto; max-width: none; }
    .model-meta { display: none; }
    .bottom-composer { padding: 8px 10px 10px; }
    .stream { padding: 8px 12px 16px 10px; }
    .stream::before { left: 14px; }
    .progress { padding: 7px 12px 2px; }
    .progress #progMeta { display: none; }
    .run-side, .shell.left-collapsed .run-side { left: 0; width: min(430px, 100vw); z-index: 81; }
    .settings { flex-direction: column; }
    .setnav { width: 100%; flex: none; display: flex; gap: 4px; align-items: center; padding: 8px; border-right: 0; border-bottom: 1px solid var(--border); overflow-x: auto; overflow-y: hidden; }
    .setnav .back { margin: 0 4px 0 0; flex: none; }
    .setnav .sect { display: none; }
    .setnav .item { width: auto; white-space: nowrap; flex: none; }
    .setbody { padding: 22px 14px 32px; }
    .setrow { align-items: flex-start; flex-direction: column; gap: 9px; }
    .setrow select, .setrow input[type=text] { width: 100%; }
    .provider-toolbar { align-items: stretch; flex-direction: column; }
    .modal .box { max-height: 88vh; }
    .toasts { left: 10px; right: 10px; top: 10px; }
    .toast { max-width: none; }
    #mascotWrap { display: none !important; }
  }
  ${COWORK_CSS}
  ${CONNECTED_APPS_CSS}
  ${UI_THEME_CSS}
  ${ONBOARDING_CSS}
  ${UI_BUTTON_CSS}
  ${COWORK_GALLERY_CSS}
  ${COWORK_PROFILE_CSS}
  ${REPORT_DETAILS_CSS}
</style>
</head>
<body>
${ONBOARDING_HTML}
<div class="shell">
  <aside class="sb">
    <div class="head">
      <span class="name"><img class="brand-mark" src="/brand/agent-gitu-mark.svg" alt=""><span>AGENT GITU</span></span>
      <span class="spacer"></span>
      <button class="iconbtn" id="sbCowork" title="Cowork mode — your agent team" aria-label="Open Cowork mode"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></button>
      <button class="iconbtn" id="gearBtn" title="settings" aria-label="Open settings">&#9881;</button>
      <button class="iconbtn" id="sbCollapse" title="collapse sidebar" aria-label="Collapse sidebar">&#171;</button>
    </div>
    <div class="scroll" id="sbScroll"></div>
    <div class="bulkbar" id="bulkBar" hidden>
      <span id="bulkCount">0 selected</span>
      <button class="btn red" id="bulkDel">Delete</button>
      <button class="btn ghost" id="bulkDone">Done</button>
    </div>
    <div class="foot">
      <button type="button" class="chip project-chip" id="projChip">…</button>
    </div>
  </aside>
  <button type="button" class="mobile-backdrop" id="mobileBackdrop" aria-label="Close navigation"></button>
  <div class="vresize" id="sbResize"></div>
  <aside class="run-side" id="toolPanel" aria-label="Tool panel" hidden><div class="side-panel-head"><span id="toolPanelTitle">Task details</span><button type="button" class="close" id="toolPanelClose" aria-label="Close tool panel">&times;</button></div><div class="side-body" id="sideBody"></div></aside>
  <div class="main">
    <button type="button" class="mobile-nav-btn" id="mobileNav" aria-label="Open navigation" title="Navigation" aria-expanded="false"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>
    <div class="topbar" id="topbar" style="display:none"></div>
    <div class="view" id="view"></div>
  </div>
</div>
<div class="settings" id="settings" hidden>
  <aside class="setnav" id="setnav"></aside>
  <div class="setbody" id="setbody"></div>
</div>
<div class="toasts" id="toasts" role="status" aria-live="polite"></div>
<div class="modal" id="browseModal" hidden>
  <div class="box">
    <div class="bar"><span style="font-weight:600;font-size:13px" id="browseTitle">Choose a project folder</span><span class="crumb" id="browseCrumb"></span></div>
    <div class="list" id="browseList"></div>
    <div class="foot"><span class="chip ok" id="browseProjChip" style="display:none">project detected</span><span style="flex:1"></span><button class="btn ghost" id="browseCancel">Cancel</button><button class="btn dark" id="browseUse">Use this folder</button></div>
  </div>
</div>
<script>
(function () {
  window.__bootErrors = [];
  window.addEventListener('error', function (e) { window.__bootErrors.push(String(e && e.message) + ' @ ' + String(e && e.filename) + ':' + String(e && e.lineno)); });
  window.addEventListener('unhandledrejection', function (e) { window.__bootErrors.push('unhandled: ' + String(e && e.reason)); });
  ${UI_MOTION_JS}
  ${UI_APPROACH_JS}
  ${UI_RESPONSE_JS}
  ${UI_CONNECTIONS_JS}
  ${CONNECTED_APPS_JS}
  ${CHAT_CREDENTIAL_HELPERS_JS}
  ${UI_MODEL_CATALOG_JS}
  var S = {
    active: 'home', project: null, models: [], sessions: {}, es: null, poll: null, files: [],
    modelsLoaded: false,
    draft: '',
    sel: { model: '', effort: 'high', persistent: true, spendCeilingUsd: '' },
    settings: { autoApprove: false, autoLearn: true, projectPath: '', devMode: false, cwLearn: 'reactive', theme: 'system' },
    setSection: 'general',
    delivery: 'steer',
    pendingFiles: []
  };
  try {
    var saved = JSON.parse(localStorage.getItem('hermes.settings') || 'null');
    if (saved) {
      if (saved.sel) for (var k in saved.sel) S.sel[k] = saved.sel[k];
      if (saved.settings) for (var k2 in saved.settings) S.settings[k2] = saved.settings[k2];
      if (typeof S.settings.scope === 'string') S.settings.scope = S.settings.scope.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
      if (!Array.isArray(S.settings.scope)) S.settings.scope = [];
      S.draft = saved.draft || '';
    }
  } catch (e) {}
  // Old workflow preferences must never re-enable persistent planning.
  delete S.sel.wf;
  delete S.settings.review;
  S.sel.persistent = true;
  function persist() {
    try { localStorage.setItem('hermes.settings', JSON.stringify({ sel: S.sel, settings: S.settings, draft: credentialChatInput(S.draft || '').safeText })); } catch (e) {}
  }
  ${UI_THEME_JS}
  document.querySelector('.sb .foot').insertAdjacentHTML('beforeend', themeToggleHtml());
  function $(id) { return document.getElementById(id); }
  function esc(s) { var d = document.createElement('div'); d.textContent = String(s == null ? '' : s); return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  // Users see what Gitu is doing and why it matters — not the internal agent
  // protocol. Raw diagnostics (protocol repairs, recovery ladders, internal
  // bookkeeping, unknown event tags) render only in Developer mode.
  function devMode() { return Boolean(S.settings.devMode); }
  function humanTokenCount(n) {
    if (!isFinite(n) || n <= 0) return '';
    return n >= 1000 ? (Math.round(n / 100) / 10) + 'K' : String(n);
  }
  // Attachments are per-composer, never global: a screenshot staged on the
  // home composer or in Session A must not ride along when you switch to
  // Session B and send there.
  function pendingFor() {
    if (S.active === 'home') {
      if (!S.homePendingFiles) S.homePendingFiles = [];
      return S.homePendingFiles;
    }
    var sess = S.sessions[S.active] || (S.sessions[S.active] = { events: [], ledger: null, session: null, side: 'state', nodes: {}, pendingFiles: [] });
    if (!sess.pendingFiles) sess.pendingFiles = [];
    return sess.pendingFiles;
  }
  function mascotState(mode) {
    if (window.__mascot) window.__mascot.setMode(mode);
    if (S.mascotTimer) clearTimeout(S.mascotTimer);
    S.mascotTimer = setTimeout(function () { if (window.__mascot) window.__mascot.setMode('idle'); }, 1800);
  }
  function mascotPulse() {
    mascotState('testing');
  }

  function toast(msg, isErr) {
    var wrap = $('toasts');
    if (!wrap) return;
    var text = String(msg == null ? '' : msg);
    // Raw HTML error pages / JSON dumps used to fill the whole toast box.
    if (text.length > 320) text = text.slice(0, 320) + '…';
    var t = document.createElement('div');
    t.className = 'toast' + (isErr ? ' err' : '');
    var body = document.createElement('div');
    body.className = 'toast-body';
    body.textContent = text;
    t.appendChild(body);
    if (isErr) {
      // Errors persist until dismissed and carry recovery affordances.
      var actions = document.createElement('div');
      actions.className = 'toast-actions';
      var copyBtn = document.createElement('button');
      copyBtn.textContent = 'Copy';
      copyBtn.onclick = function () { navigator.clipboard.writeText(String(msg)).catch(function () {}); copyBtn.textContent = 'Copied'; setTimeout(function () { copyBtn.textContent = 'Copy'; }, 1200); };
      var dismiss = document.createElement('button');
      dismiss.textContent = 'Dismiss';
      dismiss.onclick = function () { t.remove(); };
      actions.appendChild(copyBtn);
      actions.appendChild(dismiss);
      t.appendChild(actions);
      wrap.appendChild(t);
      setTimeout(function () { t.remove(); }, 15000);
    } else {
      wrap.appendChild(t);
      setTimeout(function () { t.remove(); }, 4500);
    }
    // Keep at most four toasts on screen; drop the oldest.
    while (wrap.children.length > 4) wrap.removeChild(wrap.firstChild);
  }
  var SVG_OPEN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
  var ICONS = {
    plus: SVG_OPEN + '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    gear: SVG_OPEN + '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    shield: SVG_OPEN + '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
    folder: SVG_OPEN + '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    bolt: SVG_OPEN + '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    plug: SVG_OPEN + '<path d="M9 7V3"/><path d="M15 7V3"/><path d="M6 7h12v4a6 6 0 0 1-12 0V7z"/><path d="M12 17v4"/></svg>',
    clock: SVG_OPEN + '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
    pencil: SVG_OPEN + '<path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
    x: SVG_OPEN + '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
    back: SVG_OPEN + '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    search: SVG_OPEN + '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/></svg>',
    check: SVG_OPEN + '<polyline points="20 6 9 17 4 12"/></svg>',
    wrench: SVG_OPEN + '<path d="M14.7 6.3a4.5 4.5 0 0 0-6 6L3 18l3 3 5.7-5.7a4.5 4.5 0 0 0 6-6L14 13l-3-3 3.7-3.7z"/></svg>',
    retry: SVG_OPEN + '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    layers: SVG_OPEN + '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    image: SVG_OPEN + '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
    copy: SVG_OPEN + '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    branch: SVG_OPEN + '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>',
    globe: SVG_OPEN + '<circle cx="12" cy="12" r="9"/><line x1="3" y1="12" x2="21" y2="12"/><path d="M12 3a13.5 13.5 0 0 1 0 18a13.5 13.5 0 0 1 0-18z"/></svg>',
    terminal: SVG_OPEN + '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>',
    file: SVG_OPEN + '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
    list: SVG_OPEN + '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    users: SVG_OPEN + '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    chevDown: SVG_OPEN + '<polyline points="6 9 12 15 18 9"/></svg>',
    chevRight: SVG_OPEN + '<polyline points="9 6 15 12 9 18"/></svg>'
  };
  var TOOL_ICONS = { edit: 'pencil', read: 'file', list: 'list', search: 'search', shell: 'terminal', browser: 'globe', tool: 'wrench' };
  function toolIconFor(kind) { return TOOL_ICONS[kind] || 'wrench'; }
  function icon(name) { return ICONS[name] || ''; }
  function api(path, opts) {
    return fetch(path, opts).then(function (r) {
      if (r.status === 401) return r.clone().json().catch(function () { return {}; }).then(function (data) { if (data.code === 'APP_LOCKED') { location.replace('/auth'); throw new Error('Unlock Agent Gitu to continue.'); } return r.text().then(function (t) { throw new Error(t || 'Unauthorized'); }); });
      if (!r.ok) return r.text().then(function (t) { throw new Error(t || String(r.status)); });
      return r.json();
    });
  }
  function titleCase(m) { return m.replace(/(^|[-.])([a-z])/g, function (a, sep, ch) { return sep + ch.toUpperCase(); }); }
  // Display-only model-name polish: family casing that titleCase cannot know.
  function prettyModelName(mid) { return titleCase(mid).replace(/Deepseek/gi, 'DeepSeek'); }
  function hhmm(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }); }
  function shortDate(iso) { var d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }); }
  function basename(p) { var parts = String(p).replace(/\\/g, '/').split('/'); return parts[parts.length - 1] || p; }
  function effectiveProjectPath() {
    return S.settings.projectPath || S.lastProjectPath || (S.project && S.project.repoRoot) || '';
  }
  function effectiveProjectName() {
    var path = effectiveProjectPath();
    return path ? basename(path) : 'no project selected';
  }
  function providerIsUsable(p) { return Boolean(p && (p.usable || p.hasKey || p.signedIn)); }
  function chipFor(status) {
    if (status === 'completed') return '<span class="chip ok">complete</span>';
    if (status === 'blocked') return '<span class="chip bad">blocked</span>';
    if (status === 'failed') return '<span class="chip bad">failed</span>';
    if (status === 'waiting_for_model') return '<span class="chip warn">retrying model</span>';
    if (status === 'stalled') return '<span class="chip warn">paused</span>';
    if (status === 'aborted') return '<span class="chip warn">stopped</span>';
    if (status === 'review') return '<span class="chip warn">awaiting review</span>';
    if (status === 'running') return '<span class="chip info">running</span>';
    return '<span class="chip">' + esc(status || 'idle') + '</span>';
  }
  // A "running" session may actually be BLOCKED ON THE USER: approval,
  // questions, or plan review. Surfacing that state is critical — it is the
  // difference between an agent working and an agent silently waiting.
  function waitingFor(s) {
    if (!s) return null;
    if (s.pendingPlanReview) return 'plan review';
    if (s.pendingQuestions) return 'your answer';
    if (s.pendingConnection) return 'secure connection setup';
    if (s.pendingApprovals && s.pendingApprovals.length) return 'approval';
    return null;
  }
  function hasAnyProviderKey() {
    return (S.models || []).some(providerIsUsable);
  }
  function ensureUsableModelSelection() {
    var current = String(S.sel.model || '');
    var found = false;
    (S.models || []).forEach(function (p) {
      if (!providerIsUsable(p)) return;
      (p.models || []).forEach(function (m) { if (current === p.id + '::' + m.id) found = true; });
    });
    if (found) return;
    var firstProvider = (S.models || []).filter(providerIsUsable)[0];
    if (!firstProvider) { S.sel.model = ''; return; }
    var firstModel = (firstProvider.models || []).filter(function (m) { return m.id === firstProvider.defaultModel; })[0] || firstProvider.models[0];
    S.sel.model = firstModel ? firstProvider.id + '::' + firstModel.id : '';
    persist();
  }
  var TITLE_BASE = 'Agent Gitu';
  function updateTitle() {
    var anyWait = false;
    Object.keys(S.sessions || {}).forEach(function (id) {
      if (waitingFor(S.sessions[id] && S.sessions[id].session)) anyWait = true;
    });
    document.title = (anyWait ? '⏸ ' : '') + TITLE_BASE;
  }

  function sessionTitle(goal) {
    var raw = String(goal || '').trim();
    if (!raw) return 'Untitled session';
    var repoMatch = raw.match(/github\.com\/[^\s/]+\/([a-z0-9._-]+)/i);
    var repoName = repoMatch ? repoMatch[1].replace(/\.git$/i, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : '';
    if (/\bcontinue\b/i.test(raw) && /\bblack\s*box\b/i.test(raw)) return 'Continue Black Box work';
    if (repoName && /\blanding\s+page\b/i.test(raw) && /\b(real information|details|content)\b/i.test(raw)) {
      return 'Update landing page with ' + repoName + ' details';
    }
    var heading = raw.length > 240 && raw.match(/^#{1,3}\s+([^\n]+)/m);
    var text = heading ? heading[1] : raw;
    text = text.replace(/^\[cron\s+[^\]]+\]\s*/i, '')
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/^[\s*_#>\d.)-]+/, '')
      .replace(/^(?:yes[.!]?\s+|please\s+|can you\s+|could you\s+|i (?:want|need) you to\s+)/i, '')
      .replace(/\*\*/g, '')
      .replace(/\s+/g, ' ').trim();
    if (!text) return repoName ? 'Work on ' + repoName : 'Untitled session';
    var sentence = text.split(/[.!?](?:\s|$)/)[0].trim();
    var words = sentence.split(/\s+/).slice(0, 9);
    var title = words.join(' ').replace(/[,:;\s-]+$/, '');
    if (sentence.split(/\s+/).length > words.length) title += '…';
    return title.charAt(0).toUpperCase() + title.slice(1);
  }

  function renderSidebar() {
    api('/api/runs').then(function (sessions) {
      var byProj = {};
      var projPath = {};
      sessions.forEach(function (s) {
        var p = s.project || effectiveProjectName();
        (byProj[p] = byProj[p] || []).push(s);
        if (s.projectPath && !projPath[p]) projPath[p] = s.projectPath;
      });
      var activePath = effectiveProjectPath();
      var html = '<button class="newbtn" id="sbNew" title="starts in: ' + esc(activePath || 'choose a project first') + '">' + icon('pencil') + ' New session <span style="opacity:.6;font-weight:500;font-size:11.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0">· ' + esc(effectiveProjectName()) + '</span></button>' +
        '<button class="newbtn" id="sbNewProject" style="background:none;border:1px dashed var(--border2)">' + icon('folder') + ' New project</button>' +
        '<button class="navitem" data-set="cron"><span class="ico">' + icon('clock') + '</span>Scheduled</button>' +
        '<button class="navitem" data-set="skills"><span class="ico">' + icon('bolt') + '</span>Skills</button>' +
        '<button class="navitem" data-set="mcp"><span class="ico">' + icon('plug') + '</span>MCP servers</button>' +
        '<button class="navitem" data-set="workspace"><span class="ico">' + icon('folder') + '</span>Workspace</button>' +
        (S.active !== 'home' ? '<button class="navitem' + (S.panelKind === 'state' && !$('toolPanel').hidden ? ' active' : '') + '" data-tool="state"><span class="ico">' + icon('layers') + '</span>Task details</button>' : '') +
        '<button class="navitem' + (S.panelKind === 'browser' && !$('toolPanel').hidden ? ' active' : '') + '" data-tool="browser"><span class="ico">' + icon('globe') + '</span>Browser</button>' +
        '<button class="navitem' + (S.panelKind === 'git' && !$('toolPanel').hidden ? ' active' : '') + '" data-tool="git"><span class="ico">' + icon('branch') + '</span>Git</button>' +
        '<div class="sect" style="display:flex;align-items:center">Projects<span style="flex:1"></span><button class="ubtn" id="sbManage" title="select multiple to delete" style="display:inline-flex">' + (S.manage ? icon('check') : icon('pencil')) + '</button></div>';
      var names = Object.keys(byProj);
      if (!names.length) html += '<div class="empty" style="padding-left:10px">No chats yet</div>';
      if (!S.settings.collapsedProj) S.settings.collapsedProj = {};
      var collapsed = S.settings.collapsedProj;
      names.forEach(function (p) {
        var hasActive = byProj[p].some(function (s) { return s.runId === S.active; });
        var isCol = !S.manage && collapsed[p] === true && !hasActive;
        if (S.manage) {
          html += '<label class="proj"><input type="checkbox" class="chk" data-selproj="' + esc(p) + '"' + (S.selProj && S.selProj[p] ? ' checked' : '') + '><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p) + '</span></label>';
        } else {
          // Visually mark WHICH project new sessions will land in.
          var isActive = projPath[p] && projPath[p] === activePath;
          html += '<div class="proj' + (isActive ? ' activeproj' : '') + '" data-proj="' + esc(p) + '" role="button" tabindex="0" aria-current="' + (isActive ? 'true' : 'false') + '" title="' + (isActive ? 'active project for new sessions' : 'set as active project for new sessions') + '">' +
            '<button class="ubtn" data-collapse="' + esc(p) + '" title="' + (isCol ? 'expand sessions' : 'collapse sessions') + '" style="display:inline-flex;padding:2px;margin-right:2px">' + icon(isCol ? 'chevRight' : 'chevDown') + '</button>' +
            '<span class="ico">' + icon('folder') + '</span><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p) + '</span>' +
            (isActive ? '<span class="chip" style="margin-right:6px;background:var(--selected);color:var(--text)">active</span>' : '') +
            (isCol ? '<span class="chip" style="margin-right:6px">' + byProj[p].length + '</span>' : '') +
            '<button class="delx" data-delproj="' + esc(p) + '" title="delete project and its sessions">' + icon('x') + '</button></div>';
        }
        if (!isCol) {
          if (!S.moreProjects) S.moreProjects = {};
          var expanded = S.moreProjects[p] === true;
          var visible = expanded ? 200 : 8;
          byProj[p].slice(0, S.manage ? 200 : visible).forEach(function (s) {
            var wf = waitingFor(s);
            if (S.manage) {
              html += '<label class="chat"><input type="checkbox" class="chk" data-selrun="' + esc(s.runId) + '"' + (S.selRuns && S.selRuns[s.runId] ? ' checked' : '') + '><span class="dot ' + esc(s.status) + '"></span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(sessionTitle(s.goal)) + '</span></label>';
            } else {
              html += '<button class="chat ' + (S.active === s.runId ? 'active' : '') + '" data-run="' + esc(s.runId) + '" title="' + esc(s.goal) + (wf ? '\n⏸ waiting for you — ' + wf : '') + '">' +
                '<span class="dot ' + (wf ? 'waiting' : esc(s.status)) + '"></span><span class="chat-label">' + esc(sessionTitle(s.goal)) + '</span>' +
                '<span class="rowdel" data-delrun="' + esc(s.runId) + '" title="delete this session" role="button" tabindex="0" aria-label="Delete session">' + icon('x') + '</span></button>';
            }
          });
          // Silent truncation used to hide older sessions forever.
          if (!S.manage && !expanded && byProj[p].length > 8) {
            html += '<button class="more-row" data-more="' + esc(p) + '">Show ' + (byProj[p].length - 8) + ' older sessions…</button>';
          } else if (!S.manage && expanded && byProj[p].length > 8) {
            html += '<button class="more-row" data-less="' + esc(p) + '">Show fewer</button>';
          }
        }
      });
      $('sbScroll').innerHTML = html;
      updateTitle();
      $('sbNew').onclick = function () { openHome(); };
      $('sbNewProject').onclick = newProject;
      var byId = {};
      sessions.forEach(function (s) { byId[s.runId] = s; });
      $('sbScroll').querySelectorAll('[data-run]').forEach(function (el) {
        el.onclick = function (e) {
          if (e.target && e.target.closest && e.target.closest('.rowdel')) return;
          var s = byId[el.getAttribute('data-run')];
          if (s && s.projectPath) S.lastProjectPath = s.projectPath;
          openRun(el.getAttribute('data-run'), { chatish: s && s.mode === 'chat', mode: s && s.mode });
          toggleMobileNav(false);
        };
      });
      // Two-click arm/confirm session delete: first click arms (red "sure?"),
      // second click within 2.5s deletes. No native confirm dialogs.
      $('sbScroll').querySelectorAll('[data-delrun]').forEach(function (el) {
        el.onclick = function (e) {
          e.stopPropagation();
          var id = el.getAttribute('data-delrun');
          if (!el.classList.contains('armed')) {
            el.classList.add('armed');
            setTimeout(function () { el.classList.remove('armed'); }, 2500);
            return;
          }
          el.closest('.chat').style.opacity = '.4';
          api('/api/runs/' + id, { method: 'DELETE' })
            .then(function () { renderSidebar(); if (S.active === id) openHome(); })
            .catch(function (er) { renderSidebar(); toast(er.message, true); });
        };
        el.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); el.click(); } };
      });
      $('sbScroll').querySelectorAll('[data-more],[data-less]').forEach(function (el) {
        el.onclick = function () {
          var p = el.getAttribute('data-more') || el.getAttribute('data-less');
          S.moreProjects[p] = el.getAttribute('data-more') ? true : false;
          renderSidebar();
        };
      });
      $('sbScroll').querySelectorAll('[data-proj]').forEach(function (el) {
        el.onclick = function () {
          var n = el.getAttribute('data-proj');
          if (projPath[n]) {
            S.settings.projectPath = projPath[n];
            S.lastProjectPath = projPath[n];
            persist();
            updateProjChip();
            toast('Active project: ' + n);
            toggleMobileNav(false);
            if (S.active === 'home') openHome();
          }
        };
        el.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el.click(); } };
      });
      $('sbScroll').querySelectorAll('[data-set]').forEach(function (el) {
        el.onclick = function () { toggleMobileNav(false); openSettings(el.getAttribute('data-set')); };
      });
      $('sbScroll').querySelectorAll('[data-tool]').forEach(function (el) {
        el.onclick = function () { openToolPanel(el.getAttribute('data-tool')); };
      });
      $('sbScroll').querySelectorAll('[data-delproj]').forEach(function (el) {
        el.onclick = function (e) {
          e.stopPropagation();
          deleteProjectFlow(el.getAttribute('data-delproj'), projPath[el.getAttribute('data-delproj')]);
        };
      });
      $('sbScroll').querySelectorAll('[data-collapse]').forEach(function (el) {
        el.onclick = function (e) {
          e.stopPropagation();
          var n = el.getAttribute('data-collapse');
          if (collapsed[n]) delete collapsed[n]; else collapsed[n] = true;
          persist();
          renderSidebar();
        };
      });
      if ($('sbManage')) $('sbManage').onclick = function () { S.manage = !S.manage; S.selProj = {}; S.selRuns = {}; renderSidebar(); };
      $('sbScroll').querySelectorAll('[data-selproj]').forEach(function (el) {
        el.onchange = function () { var n = el.getAttribute('data-selproj'); if (el.checked) S.selProj[n] = projPath[n] || ''; else delete S.selProj[n]; updateBulk(); };
      });
      $('sbScroll').querySelectorAll('[data-selrun]').forEach(function (el) {
        el.onchange = function () { var id = el.getAttribute('data-selrun'); if (el.checked) S.selRuns[id] = true; else delete S.selRuns[id]; updateBulk(); };
      });
      updateBulk();
    }).catch(function () {});
    api('/api/cron').then(function (d) { S.cronCount = (d.jobs || []).length; }).catch(function () {});
  }

  function updateProjChip() {
    var name = effectiveProjectName();
    $('projChip').textContent = ' ' + name;
    $('projChip').title = effectiveProjectPath() ? 'Active project: ' + effectiveProjectPath() + ' — click to change' : 'Choose a project folder';
  }

  function newProject() {
    var modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = '<div class="box" style="width:460px"><div class="bar"><span style="font-weight:600;font-size:13px">New project</span></div>' +
      '<div style="padding:14px 16px">' +
      '<input id="npName" placeholder="project name (e.g. my-app)" style="width:100%;border:1px solid var(--border2);border-radius:8px;background:var(--card2);color:var(--text);padding:8px 10px" autofocus>' +
      '<div id="npWhere" style="margin-top:8px;color:var(--muted);font-size:12px">Created under the Agent Gitu Projects folder.</div>' +
      '</div>' +
      '<div class="foot"><span style="flex:1"></span><button class="btn ghost" id="npCancel">Cancel</button><button class="btn dark" id="npGo">Create project</button></div></div>';
    document.body.appendChild(modal);
    api('/api/home').then(function (h) { var w = $('npWhere'); if (w) w.innerHTML = 'Created under <span style="font-family:var(--mono)">' + esc(h.projectsPath) + '</span>'; }).catch(function () {});
    var create = function () {
      var name = $('npName').value.trim();
      if (!name) { $('npName').focus(); return; }
      api('/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name }) })
        .then(function (d) {
          modal.remove();
          S.settings.projectPath = d.path;
          persist();
          updateProjChip();
          renderSidebar();
          toast('Project created at ' + d.path);
          openHome();
        })
        .catch(function (e) { toast(e.message, true); });
    };
    modal.querySelector('#npCancel').onclick = function () { modal.remove(); };
    modal.querySelector('#npGo').onclick = create;
    modal.querySelector('#npName').addEventListener('keydown', function (e) { if (e.key === 'Enter') create(); });
    setTimeout(function () { var n = $('npName'); if (n) n.focus(); }, 0);
  }

  function updateBulk() {
    var bar = $('bulkBar');
    if (!bar) return;
    bar.hidden = !S.manage;
    var np = Object.keys(S.selProj || {}).length;
    var nr = Object.keys(S.selRuns || {}).length;
    var c = $('bulkCount');
    if (c) c.textContent = np + ' project(s), ' + nr + ' session(s) selected';
  }

  function bulkDelete() {
    var projs = Object.keys(S.selProj || {});
    var runs = Object.keys(S.selRuns || {});
    if (!projs.length && !runs.length) { toast('Nothing selected', true); return; }
    var go = function (deleteFiles) {
      var chain = Promise.resolve();
      projs.forEach(function (p) {
        chain = chain.then(function () {
          return api('/api/projects', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: p, path: S.selProj[p] || undefined, deleteFiles: deleteFiles }) }).catch(function (e) { toast(e.message, true); });
        });
      });
      if (runs.length) {
        chain = chain.then(function () {
          return api('/api/runs/delete-many', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: runs }) }).catch(function (e) { toast(e.message, true); });
        });
      }
      chain.then(function () {
        var goneActive = runs.indexOf(S.active) >= 0;
        S.selProj = {}; S.selRuns = {}; S.manage = false;
        if (goneActive) openHome();
        renderSidebar();
        toast('Deleted ' + projs.length + ' project(s), ' + runs.length + ' session(s)');
      });
    };
    if (projs.length) {
      var modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = '<div class="box" style="width:460px"><div class="bar"><span style="font-weight:600;font-size:13px">Delete selection</span></div>' +
        '<div style="padding:14px 16px;font-size:13px">Delete <b>' + projs.length + '</b> project(s) and <b>' + runs.length + '</b> session(s)?' +
        '<label style="display:flex;gap:8px;margin-top:10px;font-size:12.5px;cursor:pointer"><input type="checkbox" id="bdFiles" style="margin:2px 0 0;width:auto"> Also delete the project folders (only folders inside Agent Gitu Projects are removed)</label>' +
        '<div style="margin-top:8px;color:var(--muted);font-size:12px">This cannot be undone.</div></div>' +
        '<div class="foot"><span style="flex:1"></span><button class="btn ghost" id="bdCancel">Cancel</button><button class="btn red" id="bdGo">Delete</button></div></div>';
      document.body.appendChild(modal);
      modal.querySelector('#bdCancel').onclick = function () { modal.remove(); };
      modal.querySelector('#bdGo').onclick = function () { var df = modal.querySelector('#bdFiles').checked; modal.remove(); go(df); };
    } else {
      if (!confirm('Delete ' + runs.length + ' session(s)?')) return;
      go(false);
    }
  }

  function deleteProjectFlow(name, path) {
    var modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = '<div class="box" style="width:460px"><div class="bar"><span style="font-weight:600;font-size:13px">Delete project</span></div>' +
      '<div style="padding:14px 16px;font-size:13px">Delete <b>' + esc(name) + '</b> and all of its sessions?' +
      (path ? '<label style="display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-size:12.5px;cursor:pointer"><input type="checkbox" id="dpFiles" style="margin:2px 0 0;width:auto"> <span>Also delete the project folder<br><span style="color:var(--muted);font-family:var(--mono);font-size:11px">' + esc(path) + '</span></span></label>' : '') +
      '<div style="margin-top:10px;color:var(--muted);font-size:12px">Sessions are removed permanently. This cannot be undone.</div></div>' +
      '<div class="foot"><span style="flex:1"></span><button class="btn ghost" id="dpCancel">Cancel</button><button class="btn red" id="dpGo">Delete</button></div></div>';
    document.body.appendChild(modal);
    modal.querySelector('#dpCancel').onclick = function () { modal.remove(); };
    modal.querySelector('#dpGo').onclick = function () {
      var cb = modal.querySelector('#dpFiles');
      var del = cb ? cb.checked : false;
      api('/api/projects', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: name, path: path, deleteFiles: del }) })
        .then(function (d) {
          modal.remove();
          toast('Project deleted' + (d.removedSessions ? ' — ' + d.removedSessions + ' session(s) removed' : ''));
          var sess = S.sessions[S.active];
          if (sess && sess.session && (sess.session.project === name || (path && sess.session.projectPath === path))) openHome();
          renderSidebar();
        })
        .catch(function (e) { toast(e.message, true); });
    };
  }

  function renderTopbar() {
    // The old goal-title strip (title + status chips + Stop) was removed:
    // the goal lives in the sidebar/progress, and Stop now lives on the
    // composer's send button (Send ⇄ Stop). The bar stays hidden.
    var tb = $('topbar');
    if (tb) tb.style.display = 'none';
    updateTitle();
    updateSendState();
  }

  // The composer send button doubles as STOP while the agent is running —
  // one button, context-aware, always where your hand already is.
  function updateSendState() {
    updatePlanControl();
    var b = $('send2');
    if (!b) return;
    var sess = S.sessions[S.active];
    var s = sess && sess.session;
    var running = Boolean(s && (s.status === 'running' || s.status === 'waiting_for_model'));
    var waiting = waitingFor(s);
    // Typing yields the button back to Send so you can steer or queue a follow-up.
    var f = $('follow');
    var typing = Boolean((f && f.value.trim()) || pendingFor().length);
    var stopMode = running && !typing;
    b.classList.toggle('stop', stopMode);
    b.title = stopMode ? 'Stop the agent' : 'send (Enter)';
    b.setAttribute('aria-label', stopMode ? 'Stop the agent' : 'Send message');
    b.innerHTML = stopMode ? '&#9632;' : '&#8593;';
    // Surface interrupts right above the composer where action happens.
    var bar = b.parentElement;
    if (bar) {
      var chip = bar.querySelector('#wfChip');
      if (waiting) {
        if (!chip) {
          chip = document.createElement('span');
          chip.id = 'wfChip';
          chip.className = 'chip warn';
          bar.insertBefore(chip, bar.firstChild);
        }
        chip.textContent = '⏸ waiting for you — ' + waiting;
        chip.title = 'the agent is blocked and needs your input in the stream';
      } else if (chip) chip.remove();
      // Explicit delivery choice for messages sent mid-run: STEER injects the
      // text into the live run at the next step; QUEUE holds it until the run
      // completes, then it starts a fresh follow-up. The label always states
      // what actually happens — it used to say "queue" while steering.
      var toggle = bar.querySelector('#deliveryToggle');
      if (running && typing) {
        if (!toggle) {
          toggle = document.createElement('span');
          toggle.id = 'deliveryToggle';
          toggle.style.cssText = 'display:inline-flex;gap:0;margin-left:6px;flex:none';
          toggle.innerHTML =
            '<button type="button" data-del="steer" class="btn ghost" style="border-radius:8px 0 0 8px;padding:4px 9px;font-size:11px"></button>' +
            '<button type="button" data-del="queue" class="btn ghost" style="border-radius:0 8px 8px 0;padding:4px 9px;font-size:11px"></button>';
          toggle.querySelectorAll('[data-del]').forEach(function (btn) {
            btn.onclick = function () { S.delivery = btn.getAttribute('data-del'); updateSendState(); };
          });
          bar.insertBefore(toggle, b);
        }
        var steerBtn = toggle.querySelector('[data-del="steer"]');
        var queueBtn = toggle.querySelector('[data-del="queue"]');
        steerBtn.textContent = '⚡ Steer';
        queueBtn.textContent = '⏳ Queue';
        steerBtn.title = 'Send into the running task now — the agent takes it into account at the next step';
        queueBtn.title = 'Hold the message until the current run finishes, then it starts a fresh follow-up';
        steerBtn.style.opacity = S.delivery === 'steer' ? '1' : '0.45';
        queueBtn.style.opacity = S.delivery === 'queue' ? '1' : '0.45';
        steerBtn.style.fontWeight = S.delivery === 'steer' ? '700' : '400';
        queueBtn.style.fontWeight = S.delivery === 'queue' ? '700' : '400';
      } else if (toggle) toggle.remove();
    }
  }

  function stopStreams() { flushLiveText(); if (S.es) { S.es.close(); S.es = null; } if (S.poll) { clearInterval(S.poll); S.poll = null; } cwStopPoll(); }

  function openHome() {
    S.active = 'home';
    S.supersedeNext = null;
    toggleMobileNav(false);
    closeToolPanel();
    stopStreams();
    stopBrowserPoll();
    renderSidebar();
    renderTopbar();
    var effProj = effectiveProjectPath();
    var name = effectiveProjectName();
    var keyless = S.modelsLoaded && !hasAnyProviderKey();
    $('view').innerHTML =
      '<div class="home">' +
      '<nav class="home-cta" aria-label="Workspace modes">' +
      '<button type="button" class="home-cta-btn" id="homeCodingBtn" aria-label="Coding" aria-describedby="homeCodingDesc">' +
      '<span class="cta-ico" aria-hidden="true">' + icon('terminal') + '</span>' +
      '<span class="cta-body"><span class="cta-t">Coding</span><span class="cta-d" id="homeCodingDesc">Build something</span></span><span class="cta-arrow" aria-hidden="true">&#8599;</span></button>' +
      '<button type="button" class="home-cta-btn team" id="coworkCta" aria-label="Cowork" aria-describedby="homeCoworkDesc">' +
      '<span class="cta-ico" aria-hidden="true">' + icon('users') + '</span>' +
      '<span class="cta-body"><span class="cta-t">Cowork</span><span class="cta-d" id="homeCoworkDesc">Meet your team</span></span><span class="cta-arrow" aria-hidden="true">&#8599;</span></button>' +
      '</nav>' +
      '<header class="home-brand"><div class="home-brand-kicker" aria-hidden="true">&lt;/&gt; Ideas into action</div>' +
      '<div class="home-brand-lockup">' + ${JSON.stringify(HOME_CHARACTER_HTML)} + '<h1><span>Agent</span><span><span class="home-brand-name">Gitu</span><i class="home-brand-spark" aria-hidden="true"></i></span></h1></div>' +
      '<p class="home-brand-copy">A little spark. A working idea. Let’s build it.</p></header>' +
      '<div class="home-particles" aria-hidden="true"></div>' +
      (keyless
        ? '<button class="setup-card" id="keylessCta" style="cursor:pointer;width:100%;text-align:left;display:block;margin:0 auto 8px;max-width:760px">' +
          '<h3 style="margin:0 0 4px">Connect a model provider</h3>' +
          '<div class="meta-line">Choose a provider and add a key to start your first task.</div><span class="setup-action">Open provider settings →</span></button>'
      : '') +
      '<div class="composer"><textarea id="goal" rows="1" placeholder="Ask Agent Gitu to complete a task…"></textarea>' +
      '<div class="thumbs" id="thumbs" hidden></div>' +
      '<div class="composer-bar">' + controlsHtml('<button type="button" class="pill control-pill" id="homeProj" aria-label="Project ' + esc(name) + '" title="active project for this session — click to change" style="max-width:190px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + icon('folder') + ' ' + esc(name) + '</span></button>') + '<button class="send" id="send" title="Start task" aria-label="Start task"' + (S.modelsLoaded && hasAnyProviderKey() ? '' : ' disabled') + '>&#8593;</button></div></div>' +
      '</div>';
    var ta = $('goal');
    ta.value = S.draft;
    ta.addEventListener('input', function () { S.draft = ta.value; persist(); ta.style.height = 'auto'; ta.style.height = Math.min(180, ta.scrollHeight) + 'px'; });
    ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); startRun(); } });
    var codingBtn = $('homeCodingBtn');
    if (codingBtn) codingBtn.onclick = function () { ta.focus(); };
    bindControls();
    bindPaste('goal');
    $('send').onclick = startRun;
    $('homeProj').onclick = openFolderBrowser;
    var kcta = $('keylessCta');
    if (kcta) kcta.onclick = function () { openSettings('providers'); };
    var ccta = $('coworkCta');
    if (ccta) ccta.onclick = function () { openCowork(); };
  }

  function isFreeModelId(id) {
    id = String(id || '');
    return /-free$/i.test(id) || /:free$/i.test(id) || id === 'big-pickle';
  }

  function modelInfo(value) {
    var parts = String(value || '').split('::');
    var pid = parts[0], mid = parts[1];
    for (var i = 0; i < S.models.length; i++) {
      var p = S.models[i];
      if (p.id !== pid) continue;
      for (var j = 0; j < p.models.length; j++) if (p.models[j].id === mid) return p.models[j];
    }
    return null;
  }
  function formatTokens(n) {
    if (typeof n !== 'number') return '';
    if (n >= 1000000) return (Math.round(n / 100000) / 10) + 'M';
    return Math.round(n / 1000) + 'K';
  }
  function formatPrice(n) {
    if (typeof n !== 'number') return '';
    if (n === 0) return 'free';
    if (n < 0.01) return '$' + n.toFixed(4);
    if (n < 1) return '$' + n.toFixed(2);
    return '$' + (Math.round(n * 100) / 100).toFixed(2);
  }
  function modelMetaText(model) {
    if (!model) return 'limits and pricing unavailable';
    var meta = model.metadata || {};
    var parts = [];
    if (meta.contextTokens) parts.push(formatTokens(meta.contextTokens) + ' context');
    if (typeof meta.inputPricePerMillion === 'number' && typeof meta.outputPricePerMillion === 'number') {
      parts.push(formatPrice(meta.inputPricePerMillion) + ' in / ' + formatPrice(meta.outputPricePerMillion) + ' out per 1M');
    } else if (model.free) {
      parts.push('free');
    }
    return parts.length ? parts.join(' · ') : 'limits and pricing unavailable';
  }
  function updateModelMeta() {
    var el = $('modelMeta');
    if (!el) return;
    var m = modelInfo(S.sel.model);
    el.textContent = m ? 'ⓘ' : '';
    el.title = modelMetaText(m);
    el.setAttribute('aria-label', m ? 'Model details: ' + modelMetaText(m) : 'Model details unavailable');
  }

  function modelOptionsHtml() {
    var out = '';
    catalogModelGroups(undefined, '', true).forEach(function (g) {
      var p = g.p;
      g.models.forEach(function (m) {
        out += '<option value="' + esc(p.id + '::' + m.id) + '">' + esc(p.id + ' / ' + titleCase(m.id)) + (m.free ? ' (free)' : '') + ' — ' + esc(modelMetaText(m)) + '</option>';
      });
    });
    return out;
  }
  function modelLabelText(value) {
    var parts = String(value || '').split('::');
    var pid = parts[0], mid = parts[1];
    for (var i = 0; i < S.models.length; i++) {
      var p = S.models[i];
      if (p.id !== pid) continue;
      for (var j = 0; j < p.models.length; j++) {
        if (p.models[j].id !== mid) continue;
        return p.id + ' / ' + prettyModelName(mid) + (p.models[j].free ? ' (free)' : '');
      }
      return p.id + ' / ' + prettyModelName(mid);
    }
    return String(value || '');
  }
  function syncModelLabel() {
    var lab = $('modelLabel');
    var model = $('model');
    var text = model ? modelLabelText(model.value) : '';
    if (lab) lab.textContent = text || (S.modelsLoaded ? 'Choose model' : 'Loading models…');
    var pick = $('modelPick');
    if (pick) {
      pick.title = text ? 'Model: ' + text : 'Choose model';
      pick.setAttribute('aria-label', pick.title);
    }
  }
  // What the model search box matches against: provider, ids, human name,
  // context size and capability flags — deliberately NOT prices, so the filter
  // input never references or depends on cost.
  function modelSearchText(p, m) {
    var meta = m.metadata || {};
    var parts = [p.id, m.id, titleCase(m.id)];
    if (meta.contextTokens) parts.push(formatTokens(meta.contextTokens) + ' context');
    if (m.free) parts.push('free');
    if (m.vision) parts.push('vision images');
    return parts.join(' ').toLowerCase();
  }
  // Highlight the first occurrence of the (already lower-cased) query inside
  // text, keeping the original casing of the rendered string.
  function markMatch(text, q) {
    if (!q) return esc(text);
    var idx = String(text).toLowerCase().indexOf(q);
    if (idx < 0) return esc(text);
    return esc(text.slice(0, idx)) + '<mark>' + esc(text.slice(idx, idx + q.length)) + '</mark>' + esc(text.slice(idx + q.length));
  }
  function modelMenuGroups(query) {
    return catalogModelGroups(undefined, query, true);
  }
  function renderModelMenu(query) {
    var list = $('modelList');
    if (!list) return;
    var q = String(query || '').toLowerCase().trim();
    var groups = modelMenuGroups(query);
    var cur = $('model') ? $('model').value : '';
    var total = groups.reduce(function (n, g) { return n + g.models.length; }, 0);
    var count = $('modelCount');
    if (count) count.textContent = total + (total === 1 ? ' model' : ' models') + (q ? (total === 1 ? ' matches' : ' match') : '');
    if (!groups.length) {
      list.innerHTML = '<div class="model-empty">No models match &ldquo;' + esc(query || '') + '&rdquo;<br><span style="font-size:11px">Try a provider or model name</span></div>';
      return;
    }
    var html = '';
    groups.forEach(function (g) {
      html += '<div class="model-sec" title="' + esc(g.p.label || g.p.id) + '">' + esc(g.p.label || g.p.id) + '</div>';
      g.models.forEach(function (m) {
        var val = g.p.id + '::' + m.id;
        html += '<button type="button" class="model-item' + (val === cur ? ' cur' : '') + '" data-val="' + esc(val) + '" role="option" aria-selected="' + (val === cur ? 'true' : 'false') + '">' +
          '<div class="mi-top"><span class="mi-prov">' + markMatch(g.p.id, q) + '</span>' +
          '<span class="mi-meta">' + esc(modelMetaText(m)) + '</span></div>' +
          '<div class="mi-name">' + markMatch(titleCase(m.id), q) + (m.vision ? ' <i class="vmark" title="supports images">&#9672;</i>' : '') + '</div>' +
          '</button>';
      });
    });
    list.innerHTML = html;
    var first = list.querySelector('.model-item');
    if (first) first.classList.add('hl');
  }
  function modelMenuMove(dir) {
    var items = $('modelList') ? $('modelList').querySelectorAll('.model-item') : [];
    if (!items.length) return;
    var cur = -1;
    for (var i = 0; i < items.length; i++) if (items[i].classList.contains('hl')) { cur = i; break; }
    var next = cur < 0 ? (dir > 0 ? 0 : items.length - 1) : (cur + dir + items.length) % items.length;
    if (cur >= 0) items[cur].classList.remove('hl');
    items[next].classList.add('hl');
    if (items[next].scrollIntoView) items[next].scrollIntoView({ block: 'nearest' });
  }
  function pickModel(val) {
    var model = $('model');
    if (!model || !val) return;
    model.value = val;
    model.dispatchEvent(new Event('change'));
    syncModelLabel();
    closeModelMenu();
  }
  function openModelMenu() {
    var menu = $('modelMenu'), pick = $('modelPick'), filter = $('modelFilter');
    if (!menu || !pick) return;
    menu.hidden = false;
    pick.classList.add('open');
    pick.setAttribute('aria-expanded', 'true');
    if (filter) {
      filter.value = '';
      renderModelMenu('');
      setTimeout(function () { filter.focus(); }, 0);
    } else renderModelMenu('');
  }
  function closeModelMenu() {
    var menu = $('modelMenu'), pick = $('modelPick');
    if (menu) menu.hidden = true;
    if (pick) pick.classList.remove('open');
    if (pick) pick.setAttribute('aria-expanded', 'false');
  }
  function bindModelMenu() {
    var pick = $('modelPick'), filter = $('modelFilter'), menu = $('modelMenu');
    if (!pick || !menu) return;
    pick.onclick = function () {
      if (menu.hidden) openModelMenu(); else closeModelMenu();
    };
    if (filter) {
      filter.oninput = function () { renderModelMenu(filter.value); };
      filter.onkeydown = function (e) {
        if (e.key === 'Enter') {
          var hl = $('modelList').querySelector('.model-item.hl') || $('modelList').querySelector('.model-item');
          if (hl) pickModel(hl.getAttribute('data-val'));
          e.preventDefault();
        } else if (e.key === 'ArrowDown') { modelMenuMove(1); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { modelMenuMove(-1); e.preventDefault(); }
        else if (e.key === 'Escape') { closeModelMenu(); }
        e.stopPropagation();
      };
    }
    if ($('modelList')) $('modelList').onmousedown = function (e) {
      var item = e.target.closest ? e.target.closest('.model-item') : null;
      if (item) { e.preventDefault(); pickModel(item.getAttribute('data-val')); }
    };
    if (!S.modelMenuDocBound) {
      S.modelMenuDocBound = true;
      document.addEventListener('click', function (e) {
        var p = $('modelPick');
        if (p && !e.target.closest('.model-control')) closeModelMenu();
      });
    }
  }
  function provOf(v) { return v.split('::')[0]; }
  function effortLevelsFor(pid) {
    for (var i = 0; i < S.models.length; i++) if (S.models[i].id === pid) return S.models[i].effortLevels || ['low', 'medium', 'high', 'max'];
    return ['low', 'medium', 'high', 'max'];
  }
  function effortMaxHint(pid) {
    for (var i = 0; i < S.models.length; i++) if (S.models[i].id === pid) return S.models[i].maxEffort || 'collapses-to-high';
    return 'collapses-to-high';
  }
  function effortLabel(pid, level) {
    for (var i = 0; i < S.models.length; i++) {
      if (S.models[i].id !== pid) continue;
      return (S.models[i].effortLabels && S.models[i].effortLabels[level]) || level;
    }
    return level;
  }
  function fillEffort(id, pid) {
    var el = $(id);
    if (!el) return;
    var collapses = effortMaxHint(pid) === 'collapses-to-high';
    el.innerHTML = effortLevelsFor(pid).map(function (l) {
      var label = l === 'max' && collapses ? 'max (= high)' : effortLabel(pid, l);
      return '<option value="' + l + '">' + esc(label) + '</option>';
    }).join('');
  }
  function planRequested(runId) {
    return Boolean(runId === 'home' ? S.homePlanRequested : S.sessions[runId] && S.sessions[runId].planRequested);
  }
  function setPlanRequested(runId, enabled) {
    if (runId === 'home') S.homePlanRequested = enabled;
    else if (S.sessions[runId]) S.sessions[runId].planRequested = enabled;
    if (S.active === runId) updatePlanControl();
  }
  function updatePlanControl() {
    var agent = $('menuAgent'), plan = $('menuPlan'), plus = $('homePlusBtn');
    if (!agent || !plan) return;
    var sess = S.sessions[S.active];
    var busy = Boolean(sess && sess.session && sess.session.status === 'running');
    var enabled = planRequested(S.active);
    agent.disabled = plan.disabled = busy || Boolean(S.starting);
    agent.setAttribute('aria-checked', String(!enabled));
    plan.setAttribute('aria-checked', String(enabled));
    agent.classList.toggle('active', !enabled);
    plan.classList.toggle('active', enabled);
    plan.title = busy ? 'Available when this task finishes' : 'Pause for plan review before making changes';
    if (plus) plus.title = enabled ? 'More actions · Plan mode selected' : 'More actions · Agent mode selected';
  }
  function controlsHtml(projectControl) {
    return '<button type="button" class="pill control-pill" id="homePlusBtn" title="More actions" aria-label="More actions" aria-haspopup="menu" aria-expanded="false">' + icon('plus') + '</button>' +
      '<div class="home-plus-menu" id="homePlusMenu" hidden role="menu" aria-label="More actions">' +
        '<button type="button" id="menuAgent" data-hp="agent" role="menuitemradio" aria-checked="true"><span class="ico">' + icon('bolt') + '</span>Agent mode<span class="check">✓</span></button>' +
        '<button type="button" id="menuPlan" data-hp="plan" role="menuitemradio" aria-checked="false"><span class="ico">' + icon('layers') + '</span>Plan mode<span class="check">✓</span></button>' +
        '<button type="button" data-hp="attach" role="menuitem"><span class="ico">' + icon('file') + '</span>Choose files</button>' +
        '<button type="button" data-hp="folder" role="menuitem"><span class="ico">' + icon('folder') + '</span>' + (S.active === 'home' ? 'Choose project folder' : 'Tag reference folder') + '</button>' +
        '<button type="button" data-hp="schedule" role="menuitem"><span class="ico">' + icon('clock') + '</span>Schedule a run</button>' +
      '</div>' +
      (projectControl || '') + '<span class="model-control"><select id="model" hidden>' + modelOptionsHtml() + '</select><button type="button" class="pill control-pill model-pick" id="modelPick" title="Choose model" aria-haspopup="listbox" aria-expanded="false"' + (S.modelsLoaded && hasAnyProviderKey() ? '' : ' disabled') + '><span class="mp-label" id="modelLabel">' + (S.modelsLoaded ? 'Choose model' : 'Loading models…') + '</span><span class="caret">&#9662;</span></button>' +
      '<div class="model-menu" id="modelMenu" hidden><input id="modelFilter" placeholder="Search models…" aria-label="Search models" autocomplete="off" spellcheck="false"><div class="model-list" id="modelList" role="listbox"></div><div class="model-count" id="modelCount"></div></div></span><span class="model-meta" id="modelMeta"></span>' +
      '<label class="pill control-pill" title="Reasoning effort"><span class="control-prefix">Effort</span><select id="effort" aria-label="Reasoning effort"></select><span class="caret">&#9662;</span></label>' +
      '<input type="file" id="attachInput" multiple hidden>';
  }
  function currentVision() {
    var parts = String(S.sel.model || '').split('::');
    var pid = parts[0], mid = parts[1];
    for (var i = 0; i < S.models.length; i++) {
      var p = S.models[i];
      if (p.id !== pid) continue;
      for (var j = 0; j < p.models.length; j++) if (p.models[j].id === mid) return Boolean(p.models[j].vision);
      for (var k = 0; k < p.models.length; k++) if (p.models[k].id === p.defaultModel) return Boolean(p.models[k].vision);
      return true;
    }
    return true;
  }
  function renderThumbs() {
    var wrap = $('thumbs');
    if (!wrap) return;
    if (!pendingFor().length) { wrap.hidden = true; wrap.innerHTML = ''; updateSendState(); return; }
    wrap.hidden = false;
    wrap.innerHTML = pendingFor().map(function (file, i) {
      var isImage = String(file.type || '').indexOf('image/') === 0;
      var content = isImage
        ? '<img src="' + file.dataUrl + '" alt="' + esc(file.name) + '" title="' + esc(file.name) + '">'
        : '<span class="th-ico">' + icon('file') + '</span><span class="th-info"><span class="th-name" title="' + esc(file.name) + '">' + esc(file.name) + '</span><span class="th-size">' + humanBytes(file.size) + '</span></span>';
      return '<span class="th' + (isImage ? '' : ' th-file') + '">' + content + '<button class="rm" data-rm="' + i + '" title="Remove attachment" aria-label="Remove ' + esc(file.name) + '">&#10005;</button></span>';
    }).join('');
    wrap.querySelectorAll('[data-rm]').forEach(function (el) {
      el.onclick = function () { pendingFor().splice(Number(el.getAttribute('data-rm')), 1); renderThumbs(); };
    });
    updateSendState();
  }
  function renderTaggedFolders(runId) {
    var wrap = $('runFolderTags');
    if (!wrap || S.active !== runId) return;
    var sess = S.sessions[runId];
    var folders = (sess && (sess.taggedFolders || (sess.session && sess.session.taggedFolders))) || [];
    var writable = (sess && (sess.writableFolders || (sess.session && sess.session.writableFolders))) || [];
    wrap.hidden = !folders.length;
    wrap.innerHTML = folders.length ? '<span class="label">Tagged folders</span>' + folders.map(function (folder) {
      var canWrite = writable.indexOf(folder) !== -1;
      return '<span class="run-folder-tag" title="' + esc(folder) + '"><span class="name">' + icon('folder') + ' ' + esc(basename(folder)) + '</span><span class="permission">' + (canWrite ? 'Can edit' : 'Read only') + '</span><button type="button" data-folder-write="' + esc(folder) + '" title="' + (canWrite ? 'Revoke write permission' : 'Allow the agent to edit this folder') + '">' + (canWrite ? 'Revoke writes' : 'Allow writes') + '</button><button type="button" data-untag-folder="' + esc(folder) + '" aria-label="Remove folder ' + esc(basename(folder)) + '" title="Remove this folder">×</button></span>';
    }).join('') : '';
    wrap.querySelectorAll('[data-folder-write]').forEach(function (button) {
      button.onclick = function () {
        var folder = button.getAttribute('data-folder-write');
        var grant = writable.indexOf(folder) === -1;
        if (grant && !confirm('Allow Agent Gitu to create, edit, and delete files inside this folder for this chat?\n\n' + folder)) return;
        api('/api/runs/' + encodeURIComponent(runId) + '/folders', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: folder, writable: grant }) })
          .then(function (data) {
            if (!S.sessions[runId]) return;
            S.sessions[runId].writableFolders = data.writableFolders || [];
            if (S.sessions[runId].session) S.sessions[runId].session.writableFolders = data.writableFolders || [];
            renderTaggedFolders(runId);
            toast(grant ? 'Write access granted for this chat' : 'Write access revoked');
          }).catch(function (error) { toast(error.message, true); });
      };
    });
    wrap.querySelectorAll('[data-untag-folder]').forEach(function (button) {
      button.onclick = function () {
        var folder = button.getAttribute('data-untag-folder');
        api('/api/runs/' + encodeURIComponent(runId) + '/folders', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: folder }) })
          .then(function (data) {
            if (!S.sessions[runId]) return;
            S.sessions[runId].taggedFolders = data.folders || [];
            S.sessions[runId].writableFolders = data.writableFolders || [];
            if (S.sessions[runId].session) S.sessions[runId].session.taggedFolders = data.folders || [];
            if (S.sessions[runId].session) S.sessions[runId].session.writableFolders = data.writableFolders || [];
            renderTaggedFolders(runId);
            toast('Folder untagged');
          }).catch(function (error) { toast(error.message, true); });
      };
    });
  }
  var MAX_PENDING_FILES = 8;
  var MAX_PENDING_FILE_BYTES = 8 * 1024 * 1024;
  var MAX_PENDING_TOTAL_BYTES = 20 * 1024 * 1024;
  function humanBytes(value) {
    var n = Math.max(0, Number(value) || 0);
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + ' KB';
    return (n / (1024 * 1024)).toFixed(1) + ' MB';
  }
  function dataUrlBytes(dataUrl) {
    var comma = String(dataUrl || '').indexOf(',');
    if (comma < 0) return 0;
    return Math.max(0, Math.floor((dataUrl.length - comma - 1) * 3 / 4));
  }
  function pendingFileBytes() {
    return pendingFor().reduce(function (sum, file) { return sum + (Number(file.size) || dataUrlBytes(file.dataUrl)); }, 0);
  }
  function addPendingFile(file, dataUrl) {
    if (pendingFor().length >= MAX_PENDING_FILES) { toast('Maximum 8 files per message', true); return; }
    var size = Number(file.size) || dataUrlBytes(dataUrl);
    if (size > MAX_PENDING_FILE_BYTES) { toast(file.name + ' is larger than 8 MB', true); return; }
    if (pendingFileBytes() + size > MAX_PENDING_TOTAL_BYTES) { toast('Attachments exceed the 20 MB combined limit', true); return; }
    pendingFor().push({ name: file.name || 'attachment', type: file.type || 'application/octet-stream', size: size, dataUrl: dataUrl });
    renderThumbs();
  }
  function downscaleImage(dataUrl, cb) {
    var img = new Image();
    img.onload = function () {
      var max = 1280;
      var scale = Math.min(1, max / Math.max(img.width, img.height));
      if (scale === 1 && dataUrl.length < 700000) { cb(dataUrl); return; }
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      try { cb(c.toDataURL('image/jpeg', 0.85)); } catch (e) { cb(dataUrl); }
    };
    img.onerror = function () { cb(dataUrl); };
    img.src = dataUrl;
  }
  function bindPaste(id) {
    var ta = $(id);
    if (!ta || ta.dataset.pasteBound) return;
    ta.dataset.pasteBound = '1';
    ta.addEventListener('paste', function (e) {
      var cd = e.clipboardData || window.clipboardData;
      if (!cd || !cd.items) return;
      for (var i = 0; i < cd.items.length; i++) {
        var it = cd.items[i];
        if (it.type && it.type.indexOf('image/') === 0) {
          // let, not var: reader.onload fires asynchronously AFTER the loop has
          // advanced, and a shared var-file binding made every pasted image
          // inherit the last file's name/type.
          let file = it.getAsFile();
          if (!file) continue;
          e.preventDefault();
          var reader = new FileReader();
          reader.onload = function () {
            downscaleImage(String(reader.result), function (final) {
              addPendingFile({ name: file.name || 'pasted-image.png', type: file.type || 'image/png', size: dataUrlBytes(final) }, final);
              toast('Image pasted — it will be sent with your next message');
            });
          };
          reader.readAsDataURL(file);
        }
      }
    });
  }

  function onAttachFiles(files) {
    Array.prototype.slice.call(files).forEach(function (f) {
      if (pendingFor().length >= MAX_PENDING_FILES) { toast('Maximum 8 files per message', true); return; }
      if (f.size > MAX_PENDING_FILE_BYTES) { toast(f.name + ' is larger than 8 MB', true); return; }
      if (pendingFileBytes() + f.size > MAX_PENDING_TOTAL_BYTES) { toast('Attachments exceed the 20 MB combined limit', true); return; }
      var reader = new FileReader();
      reader.onload = function () {
        var original = String(reader.result);
        if (f.type && f.type.indexOf('image/') === 0) {
          downscaleImage(original, function (final) { addPendingFile(f, final); });
        } else addPendingFile(f, original);
      };
      reader.readAsDataURL(f);
    });
  }
  // The per-run autonomy the composer is set to. persistent:true is the default
  // everywhere it is omitted, so this only ever narrows the policy.
  function autonomyBody() {
    var body = { persistent: true };
    var ceiling = Number(S.sel.spendCeilingUsd);
    if (String(S.sel.spendCeilingUsd || '').trim() && Number.isFinite(ceiling) && ceiling > 0) body.maxCostUsd = ceiling;
    return body;
  }
  function bindControls() {
    var model = $('model'), effort = $('effort');
    updatePlanControl();
    if (model) { if (S.sel.model) model.value = S.sel.model; if (!model.value && model.options.length) model.value = model.options[0].value; S.sel.model = model.value; }
    fillEffort('effort', provOf(S.sel.model));
    if (effort) effort.value = S.sel.effort;
    if (model) model.onchange = function () {
      S.sel.model = model.value;
      var activeSession = S.sessions[S.active];
      if (activeSession) activeSession.modelOverride = true;
      fillEffort('effort', provOf(model.value)); persist(); updateAttachState(); updateModelMeta();
    };
    if (effort) effort.onchange = function () { S.sel.effort = effort.value; persist(); };

    var input = $('attachInput');
    if (input) input.onchange = function () { onAttachFiles(input.files); input.value = ''; };
    updateAttachState();
    updateModelMeta();
    renderThumbs();
    syncModelLabel();
    bindModelMenu();
    // The plus menu holds task mode, file picking, and secondary actions.
    var plusBtn = $('homePlusBtn'), plusMenu = $('homePlusMenu');
    if (plusBtn && plusMenu) {
      plusBtn.onclick = function (e) {
        e.stopPropagation();
        var open = plusMenu.hasAttribute('hidden');
        if (open) {
          plusMenu.removeAttribute('hidden');
          var rect = plusBtn.getBoundingClientRect();
          plusMenu.style.left = Math.max(12, Math.min(rect.left, window.innerWidth - plusMenu.offsetWidth - 12)) + 'px';
          plusMenu.style.top = Math.max(12, rect.top - plusMenu.offsetHeight - 8) + 'px';
          plusBtn.setAttribute('aria-expanded', 'true');
        } else {
          plusMenu.setAttribute('hidden', '');
          plusBtn.setAttribute('aria-expanded', 'false');
        }
      };
      plusMenu.querySelectorAll('[data-hp]').forEach(function (b) {
        b.onclick = function () {
          plusMenu.setAttribute('hidden', '');
          plusBtn.setAttribute('aria-expanded', 'false');
          var action = b.getAttribute('data-hp');
          if (action === 'agent') setPlanRequested(S.active, false);
          else if (action === 'plan') setPlanRequested(S.active, true);
          else if (action === 'attach') { var ai = $('attachInput'); if (ai) ai.click(); }
          else if (action === 'folder') openFolderBrowser(S.active === 'home' ? 'project' : 'tag');
          else if (action === 'schedule') openSettings('cron');
        };
      });
      if (!plusMenu._boundOutside) {
        plusMenu._boundOutside = true;
        document.addEventListener('click', function (e) {
          if (!plusMenu.hasAttribute('hidden') && e.target !== plusBtn && !plusBtn.contains(e.target) && !plusMenu.contains(e.target)) {
            plusMenu.setAttribute('hidden', '');
            plusBtn.setAttribute('aria-expanded', 'false');
          }
        });
      }
    }
  }
  function updateAttachState() {
    var attach = document.querySelector('#homePlusMenu [data-hp="attach"]');
    if (!attach) return;
    var vision = currentVision();
    attach.title = vision ? 'Choose files, documents, or images' : 'Choose files or documents (this model cannot inspect image pixels)';
  }

  function startRun() {
    if (S.starting) return;
    var goal = $('goal') ? $('goal').value.trim() : '';
    if (!goal && pendingFor().length) goal = 'Please review the attached file or document.';
    if (!goal) { if ($('goal')) $('goal').focus(); return; }
    if (!S.modelsLoaded) { toast('Models are still loading — try again in a moment'); return; }
    // First-run funnel: a keyless install can only produce a failing run.
    // Gate it behind provider setup with a one-click path instead.
    if (!hasAnyProviderKey() || !S.sel.model) {
      toast('Connect a model provider first — opening Providers', true);
      openSettings('providers');
      return;
    }
    S.starting = true;
    var sendBtns = [$('send'), $('send2')];
    sendBtns.forEach(function (b) { if (b) b.disabled = true; });
    var unlock = function () {
      S.starting = false;
      sendBtns.forEach(function (b) { if (b) b.disabled = false; });
    };
    var mc = (S.sel.model || '').split('::');
    var review = planRequested('home');
    api('/api/runs', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        goal: goal, provider: mc[0], model: mc[1],
        mode: 'agent',
        review: review,
        autoApprove: S.settings.autoApprove,
        autoLearn: S.settings.autoLearn,
        effort: S.sel.effort,
        autonomy: autonomyBody(),
        projectPath: effectiveProjectPath() || undefined,
        scope: S.settings.scope || [],
        constraints: (S.settings.constraints || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean),
        files: pendingFor().length ? pendingFor() : undefined
      })
    }).then(function (r) {
      unlock();
      setPlanRequested('home', false);
      S.draft = ''; persist();
      pendingFor().length = 0;
      openRun(r.runId, { chatish: false, goal: goal });
      renderSidebar();
    }, function (e) {
      unlock();
      toast('Failed to start: ' + e.message, true);
    });
  }

  function openRun(runId, opts) {
    S.active = runId;
    S.supersedeNext = null;
    toggleMobileNav(false);
    closeToolPanel();
    stopStreams();
    var sess = S.sessions[runId] || (S.sessions[runId] = { events: [], ledger: null, session: null, side: 'state', nodes: {}, pendingFiles: [] });
    sess.nodes = {};
    resetStreamRenderState(sess);
    sess.justOpened = true;
    sess.historyReady = false;
    // Attachments are per-composer: switching sessions must show THAT
    // session's staged files (or none), never the previous one's.
    renderThumbs();
    if (opts && opts.chatish !== undefined) sess.chatish = opts.chatish;
    renderSidebar();
    renderTopbar();
    $('view').innerHTML =
      '<div class="run"><div class="run-main">' +
      '<div class="progress" id="progress" style="display:none"><span class="plabel" id="progText"></span><div class="pbar"><span id="progFill"></span></div><span class="plabel" id="progMeta"></span></div>' +
      '<details class="approach-panel" id="approachPanel"><summary title="Show the agent’s approach and verification updates"><span class="approach-title">Approach</span><span class="approach-count" id="approachCount"></span><span class="approach-latest" id="approachLatest"></span><span class="approach-status" id="approachStatus"></span></summary><ol class="approach-log" id="approachLog" aria-label="Approach updates" tabindex="0"></ol><p class="approach-note" id="approachEmpty">A brief explanation of the next action appears as the agent works.</p><p class="approach-note" id="approachHistory" hidden></p><p class="approach-note">Progress summaries · hypotheses remain unverified until checked.</p></details>' +
      '<div class="stream" id="stream" role="region" aria-label="Agent activity" tabindex="0"></div>' +
      '<button type="button" class="jump-latest" id="jumpLatest" hidden>↓ Jump to latest</button>' +
      '<div class="bottom-composer"><details class="composer-todos" id="composerTodos" aria-label="Current task checklist" hidden></details><div class="composer"><textarea id="follow" rows="1" placeholder="Message Agent Gitu…" title="Enter sends to this session while working, or continues it when done"></textarea>' +
      '<div class="thumbs" id="thumbs" hidden></div><div class="run-folder-tags" id="runFolderTags" aria-label="Tagged reference folders" hidden></div>' +
      '<div class="composer-bar">' + controlsHtml() + '<button type="button" class="context-trigger unknown" id="contextToggle" title="Session context and token usage" aria-label="Session context and token usage" aria-expanded="false" aria-controls="contextCard"><svg viewBox="0 0 24 24" aria-hidden="true"><circle class="context-ring-track" cx="12" cy="12" r="9"/><circle class="context-ring-progress" cx="12" cy="12" r="9" pathLength="100"/><circle class="context-ring-core" cx="12" cy="12" r="2"/></svg></button><button class="send" id="send2" aria-label="Send message">&#8593;</button></div>' +
      '<div class="context-card" id="contextCard" hidden><div class="context-card-head"><span>Session context</span><button type="button" class="ubtn" id="contextClose" aria-label="Close context card">&times;</button></div><div id="contextCardBody"></div></div></div></div>' +
      '</div></div>';
    $('contextToggle').onclick = function () { toggleContextCard(); };
    $('contextClose').onclick = function () { toggleContextCard(false); };
    renderApproach(sess);
    $('approachPanel').open = Boolean(sess.approachOpen);
    $('approachPanel').addEventListener('toggle', function () { sess.approachOpen = this.open; });
    $('stream').addEventListener('scroll', function () {
      this.dataset.follow = nearBottom(this) ? 'true' : 'false';
      updateJumpLatest(this);
    }, { passive: true });
    $('jumpLatest').onclick = function () { stickScroll($('stream'), true); };
    applyLayout();
    renderComposerTodos(runId);
    renderTaggedFolders(runId);
  $('follow').addEventListener('keydown', function (e) {
    // Shift+Enter inserts a newline, same as the home composer — the
    // auto-grow textarea exists precisely for multi-line follow-ups.
    if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();
      var g = $('follow').value.trim();
      if (!g && pendingFor().length) g = 'Please review the attached file or document.';
      if (!g) return;
      sendFollow(g);
    });
  // Typing flips the button to Send even while the agent is running.
  $('follow').addEventListener('input', function () { this.style.height = 'auto'; this.style.height = Math.min(180, this.scrollHeight) + 'px'; updateSendState(); });
    $('send2').onclick = function () {
      // Branch on the button's CURRENT mode (Stop ■ vs Send ↑): while the
      // agent runs, typing flips it to Send so a click queues the message.
      var b = $('send2');
      if (b && b.classList.contains('stop')) {
        if (b) { b.disabled = true; setTimeout(function () { if (b) b.disabled = false; }, 1200); }
        api('/api/runs/' + S.active + '/stop', { method: 'POST' })
          .then(function () { toast('Stop requested — finishing the current step…'); })
          .catch(function (e) { toast(e.message, true); });
        return;
      }
      $('follow').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    };
    updateSendState();
    bindControls();
    bindPaste('follow');
    var replayEvents = sess.events;
    if (replayEvents.length > MAX_REPLAY_EVENTS) {
      var hiddenCount = replayEvents.length - MAX_REPLAY_EVENTS;
      var historyNote = document.createElement('div');
      historyNote.className = 'timeline-trim-note';
      historyNote.textContent = hiddenCount + ' earlier event' + (hiddenCount === 1 ? '' : 's') + ' are preserved in session history. Showing the latest activity.';
      $('stream').appendChild(historyNote);
      replayEvents = replayEvents.slice(-MAX_REPLAY_EVENTS);
    }
    sess.replaying = true;
    replayEvents.forEach(function (ev) { appendEvent(runId, ev); });
    sess.replaying = false;
    sess.lastIndex = sess.events.length ? sess.events[sess.events.length - 1].i : -1;
    var w = document.createElement('div');
    w.className = 'working activity-indicator'; w.id = 'working';
    w.setAttribute('role', 'status');
    w.setAttribute('aria-live', 'polite');
    w.innerHTML = '${ACTIVITY_MARK_HTML}<span class="wtext" id="workingText">Connecting…</span><span class="welapsed" id="workingElapsed"></span><div class="reasoning-stream" id="workingReasoning" aria-label="Model reasoning" hidden></div>';
    $('stream').appendChild(w);
    setWorking('Thinking…');
    renderRunSide(runId);
    connect(runId);
    pollRun(runId);
    S.poll = setInterval(function () { pollRun(runId); }, 1500);
  }

  function connect(runId) {
    stopStreams();
    var es = new EventSource('/api/runs/' + runId + '/stream');
    S.es = es;
    es.addEventListener('replay-end', function () {
      var sess = S.sessions[runId];
      if (!sess || S.active !== runId) return;
      sess.historyReady = true;
      if (sess.session && sess.session.status !== 'running') {
        setWorking(null);
        es.close();
        if (S.es === es) S.es = null;
      }
    });
    es.onmessage = function (msg) {
      var ev = JSON.parse(msg.data);
      var sess = S.sessions[runId];
      if (!sess) return;
      // Stream is alive again: clear any reconnecting state.
      S.esFailures = 0;
      if (S.reconnecting) {
        S.reconnecting = false;
        setWorking(sess.session && sess.session.status === 'running' ? 'Thinking…' : null);
      }
      // A native frame carries seq (the runtime log cursor) and never i (the
      // rendered-row cursor), so it updates typed state here instead of moving
      // the cursor. The legacy prose row for the same transition still renders
      // separately, and neither is derived from the other.
      if (ev.i == null) {
        handleTypedFrame(runId, ev);
        return;
      }
      if (sess.lastIndex == null) sess.lastIndex = -1;
      if (ev.i > sess.lastIndex) {
        sess.lastIndex = ev.i;
        sess.events.push(ev);
        sess.replaying = Boolean(ev.replay);
        appendEvent(runId, ev);
        sess.replaying = false;
        if (sess.session && sess.session.status !== 'running') setWorking(null);
      }
    };
    // A dead socket previously left "Thinking…" on screen forever. Back off
    // and reconnect; the poller keeps backfilling events meanwhile.
    es.onerror = function () {
      var sess = S.sessions[runId];
      try { es.close(); } catch (e) {}
      if (S.es === es) S.es = null;
      if (!sess || S.active !== runId) return;
      if (sess.session && sess.session.status && sess.session.status !== 'running' && sess.historyReady) return;
      S.esFailures = (S.esFailures || 0) + 1;
      S.reconnecting = true;
      setWorking('Connection lost — reconnecting…');
      var delay = Math.min(10000, 1000 * S.esFailures);
      setTimeout(function () {
        var s2 = S.sessions[runId];
        if (!s2 || S.active !== runId || S.es) return;
        if (s2.session && s2.session.status !== 'running') { setWorking(null); S.reconnecting = false; return; }
        connect(runId);
      }, delay);
    };
  }

  var UB_SEQ = 0;
  function userBubble(text, runId, ubId, ts) {
    // Unique per-send identity: edit/retry/failure/removal must never target
    // the wrong copy when the user sends the exact same text twice.
    var id = ubId || 'ub-' + Date.now().toString(36) + '-' + (++UB_SEQ);
    var div = document.createElement('div');
    div.className = 'usermsg';
    div.setAttribute('data-ubid', id);
    div.setAttribute('data-ubtext', text);
    // Same anatomy as the Cowork "me" bubble: a right-aligned meta line with the
    // sender and send time, then the bubble itself. All styling lives in
    // .usermsg/.ub so the two chats render identically.
    div.innerHTML = '<div class="ub"><div class="umeta"><span class="nm">You</span><span class="tg">' + esc(hhmm(ts || new Date().toISOString())) + '</span></div>' + esc(text) +
      '<div class="ubtns"><button class="ubtn" title="edit and resend" data-ub="edit">' + icon('pencil') + '</button>' +
      '<button class="ubtn" title="retry" data-ub="retry">' + icon('retry') + '</button>' + '</div></div>';
    div.querySelector('[data-ub="edit"]').onclick = function () {
      var f = $('follow') || $('goal');
      if (f) { f.value = text; f.focus(); }
      S.supersedeNext = text;
    };
    div.querySelector('[data-ub="retry"]').onclick = function () {
      var sess = S.sessions[runId || S.active];
      var running = sess && sess.session && sess.session.status === 'running';
      if (running) { sendFollow(text); return; }
      div.remove();
      sendFollow(text, text);
    };
    return div;
  }

  function safeRunFileUrl(value) {
    var url = String(value || '');
    return url.indexOf('/api/runs/') === 0 ? url : '';
  }

  function sessionFileCard(meta) {
    var card = document.createElement('div');
    var kind = meta && meta.kind === 'user' ? 'user' : 'assistant';
    card.className = 'session-file ' + kind;
    card.setAttribute('data-file-id', String((meta && meta.id) || ''));

    var previewUrl = safeRunFileUrl(meta && meta.previewUrl);
    var downloadUrl = safeRunFileUrl(meta && meta.downloadUrl);
    var mime = String((meta && meta.mime) || 'application/octet-stream');
    if (previewUrl && mime.indexOf('image/') === 0) {
      var preview = document.createElement('img');
      preview.className = 'file-preview';
      preview.alt = '';
      preview.src = previewUrl;
      card.appendChild(preview);
    } else if (previewUrl && mime.indexOf('video/') === 0) {
      card.classList.add('has-media');
      var video = document.createElement('video');
      video.className = 'file-media';
      video.controls = true;
      video.preload = 'metadata';
      video.src = previewUrl;
      card.appendChild(video);
    } else if (previewUrl && mime.indexOf('audio/') === 0) {
      card.classList.add('has-media');
      var audio = document.createElement('audio');
      audio.className = 'file-media';
      audio.controls = true;
      audio.preload = 'none';
      audio.src = previewUrl;
      card.appendChild(audio);
    } else {
      var fileIcon = document.createElement('span');
      fileIcon.className = 'file-ico';
      fileIcon.innerHTML = icon('file');
      card.appendChild(fileIcon);
    }

    var main = document.createElement('span');
    main.className = 'file-main';
    var name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = String((meta && meta.name) || 'attachment');
    name.title = name.textContent;
    var detail = document.createElement('span');
    detail.className = 'file-meta';
    detail.textContent = (kind === 'user' ? 'you attached' : 'Agent Gitu created') + ' · ' + mime + ' · ' + humanBytes(meta && meta.size);
    main.appendChild(name);
    main.appendChild(detail);
    card.appendChild(main);

    var actions = document.createElement('span');
    actions.className = 'file-actions';
    if (previewUrl) {
      var open = document.createElement('a');
      open.href = previewUrl;
      open.target = '_blank';
      open.rel = 'noopener';
      open.textContent = 'Open';
      actions.appendChild(open);
    }
    if (downloadUrl) {
      var download = document.createElement('a');
      download.href = downloadUrl;
      download.download = name.textContent;
      download.textContent = 'Download';
      actions.appendChild(download);
    }
    card.appendChild(actions);
    return card;
  }

  function removeNarrationReplacedByFile(sess) {
    if (!sess || !sess.nodes) return;
    var live = sess.nodes.abubble || sess.nodes.thought;
    if (live && live.parentNode) live.parentNode.removeChild(live);
    sess.nodes.abubble = null;
    sess.nodes.thought = null;
  }

  function removeUserBubble(runId, text, ubId) {
    var stream = $('stream');
    if (!stream) return;
    var target = ubId ? stream.querySelector('div[data-ubid="' + ubId + '"]') : null;
    if (!target) {
      stream.querySelectorAll('div[data-ubtext]').forEach(function (b) {
        if (b.getAttribute('data-ubtext') === text) target = b;
      });
    }
    if (target) target.remove();
  }

  function nearBottom(el) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  function resetStreamRenderState(sess) {
    sess.summaryShown = null;
    sess.connShown = null;
    sess.qShown = null;
    sess.prShown = null;
    sess.apprShown = {};
    // Typed gate state is live-only: native events are not persisted yet, so a
    // restored or re-rendered session must not keep a card whose frames are gone.
    sess.typedApprovals = {};
    sess.typedPlanReview = null;
    sess.typedQuestions = null;
    sess.settledGates = {};
    sess.pendingUserMessages = [];
  }
  // A report belongs to the run that just ended.  Once a user starts another
  // task in the same session, leaving that final card at the bottom makes it
  // look as if the new request was ignored.  The durable event history is
  // retained; this only removes the stale terminal presentation while the
  // continuation is active.
  function clearRenderedReport(runId) {
    var stream = $('stream');
    if (!stream) return;
    var reports = stream.querySelectorAll('.report-flat');
    for (var i = 0; i < reports.length; i++) reports[i].remove();
    var sess = S.sessions[runId];
    if (sess) sess.summaryShown = null;
  }
  function retainUsageEstimate(sess, incoming) {
    var previous = sess && sess.session && sess.session.usage;
    var next = incoming && incoming.usage;
    // A catalog refresh can briefly omit price metadata. Keep the last
    // accumulated estimate instead of making a visible price turn into “—”.
    if (previous && next && typeof previous.costUsd === 'number' && typeof next.costUsd !== 'number') {
      next.costUsd = previous.costUsd;
      next.costIncomplete = true;
    }
  }
  function updateJumpLatest(stream) {
    var jump = $('jumpLatest');
    if (jump) {
      jump.hidden = nearBottom(stream);
      var composer = document.querySelector('.bottom-composer');
      if (composer) jump.style.bottom = (composer.offsetHeight + 12) + 'px';
    }
  }
  // Chase the bottom ONLY when the user is already reading the tail — never
  // yank someone who scrolled up to re-read. Force=true for action-required
  // content (approvals, failures) where attention matters more than position.
  function stickScroll(stream, force) {
    if (!stream) return;
    if (force || stream.dataset.follow !== 'false') {
      stream.scrollTop = stream.scrollHeight;
      stream.dataset.follow = 'true';
    }
    updateJumpLatest(stream);
  }
  var MAX_REPLAY_EVENTS = 240;
  var MAX_TIMELINE_NODES = 220;
  function trimTimeline(stream) {
    if (!stream) return;
    var nodes = Array.prototype.slice.call(stream.children).filter(function (el) {
      return el.classList.contains('tl-row') || el.classList.contains('shotmsg') || el.classList.contains('abubble') || el.classList.contains('session-file') || el.classList.contains('intake-line');
    });
    if (nodes.length <= MAX_TIMELINE_NODES) return;
    var removeCount = nodes.length - MAX_TIMELINE_NODES;
    for (var i = 0; i < removeCount; i++) nodes[i].remove();
    var total = Number(stream.dataset.trimmed || '0') + removeCount;
    stream.dataset.trimmed = String(total);
    var note = stream.querySelector('.timeline-trim-note');
    if (!note) {
      note = document.createElement('div');
      note.className = 'timeline-trim-note';
      stream.insertBefore(note, stream.firstChild);
    }
    note.textContent = total + ' older activity item' + (total === 1 ? '' : 's') + ' hidden for performance. Full history remains stored.';
  }
  function appendLive(stream, el) {
    var w = $('working');
    var state = S.sessions[S.active];
    if (state && state.replaying) el.classList.add('replayed');
    if (w) stream.insertBefore(el, w); else stream.appendChild(el);
    trimTimeline(stream);
    stickScroll(stream);
  }

  function sendFollow(text, supersede) {
    var runId = S.active;
    var sess = S.sessions[runId];
    var sup = supersede || S.supersedeNext || undefined;
    S.supersedeNext = null;
    var running = sess && sess.session && sess.session.status === 'running';
    if (sup && running) sup = undefined;
    if (sup) removeUserBubble(runId, sup);
    if (sess && sess.session && sess.session.status !== 'running') {
      // A continuation cannot change the kind of its existing session.  In
      // particular, "continue" must not make a failed standard task look like
      // a chat session and hide its ledger/transcript.
      sess.chatish = sess.session.mode === 'chat';
      renderRunSide(runId);
    }
    var attached = pendingFor().length ? pendingFor() : undefined;
    var review = !running && planRequested(runId);
    var mc = (S.sel.model || '').split('::');
    var useSelectedModel = Boolean(sess && (sess.modelOverride || !sess.session || !sess.session.provider || !sess.session.model));
    // Show the outgoing message immediately. The server will replace this
    // pending display with its durable user-msg event once it is recorded.
    var sentBubbleId = appendPendingUserMessage(runId, text);
    var follow = $('follow');
    if (follow) follow.value = '';
    var send2 = $('send2');
    if (send2) send2.disabled = true;
    // Textarea cleared: if the agent is still running the button reverts to Stop.
    updateSendState();
    api('/api/runs/' + runId + '/message', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      text: text, files: attached,
      delivery: running ? S.delivery : undefined,
      provider: useSelectedModel ? mc[0] : undefined, model: useSelectedModel ? mc[1] : undefined, useSelectedModel: useSelectedModel,
      mode: 'agent',
      review: review,
      supersede: sup,
      autoApprove: S.settings.autoApprove
    }) })
      .then(function (result) {
        // The server has accepted the continuation. Remove the terminal card
        // from the previous task before showing the new task's activity.
        // Keeping it visible until the new task completes made an old report
        // appear to be the response to the freshly submitted message.
        if (!running && result && result.ok) clearRenderedReport(runId);
        settlePendingUserMessage(runId, result && result.safeText !== undefined ? result.safeText : credentialChatInput(text).safeText, sentBubbleId, false);
        if (!running) setPlanRequested(runId, false);
        sess.chatish = false;
        if (!running) {
          // Mark the resume boundary: tool cards started BEFORE this moment
          // belong to earlier interrupted runs and must never suppress the
          // thinking indicator (see interruptWorkingToolRows).
          sess.runStartedAtMs = Date.now();
        }
        pendingFor().length = 0;
        renderThumbs();
        setWorking(result && result.credentialRequired ? 'Waiting for secure connection details…' : 'Thinking…');
        // Terminal sessions intentionally close their SSE stream. A follow-up
        // starts the same session again, so reopen it here; polling only
        // refreshes status/ledger and cannot carry live tdelta prose events.
        if (!S.es) connect(runId);
        if (!S.poll) S.poll = setInterval(function () { pollRun(runId); }, 1500);
        pollRun(runId);
      })
      .catch(function (er) {
        var msg = String(er.message);
        if (msg.indexOf('run not found') >= 0) {
          var mc = (S.sel.model || '').split('::');
          api('/api/runs', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              goal: text, provider: mc[0], model: mc[1],
              mode: 'agent',
              review: review,
              autoApprove: S.settings.autoApprove,
              autoLearn: S.settings.autoLearn,
              effort: S.sel.effort,
              autonomy: autonomyBody(),
              projectPath: effectiveProjectPath() || undefined,
              files: attached
            })
          }).then(function (r) { setPlanRequested(runId, false); openRun(r.runId, { chatish: false }); }).catch(function (e2) { failUserBubble(runId, text, e2.message, sentBubbleId); toast(e2.message, true); });
        } else {
          failUserBubble(runId, text, msg, sentBubbleId);
          toast(msg, true);
        }
      })
      .then(function () { var b = $('send2'); if (b) b.disabled = false; });
  }

  function appendPendingUserMessage(runId, text) {
    var stream = $('stream');
    var sess = S.sessions[runId];
    if (!stream || !sess) return null;
    if (!sess.pendingUserMessages) sess.pendingUserMessages = [];
    retireAbubble(sess);
    closeThought(runId);
    var bubble = userBubble('Sending message…', runId);
    bubble.classList.add('pending');
    var ubId = bubble.getAttribute('data-ubid');
    // Remember the send time so the confirmed bubble shows the same clock time.
    sess.pendingUserMessages.push({ id: ubId, text: credentialChatInput(text).safeText, ts: new Date().toISOString() });
    appendLive(stream, bubble);
    stickScroll(stream, true);
    return ubId;
  }

  function settlePendingUserMessage(runId, safeText, ubId, consume) {
    var sess = S.sessions[runId];
    var pending = sess && sess.pendingUserMessages;
    if (!pending) return false;
    var index = pending.findIndex(function (item) { return ubId ? item.id === ubId : item.text === safeText; });
    if (index < 0) return false;
    var item = pending[index];
    item.text = safeText;
    var stream = S.active === runId && $('stream');
    var bubble = stream && stream.querySelector('div[data-ubid="' + item.id + '"]');
    if (bubble && !item.displayed) { bubble.replaceWith(userBubble(safeText, runId, item.id, item.ts)); item.displayed = true; }
    if (consume) pending.splice(index, 1);
    return Boolean(bubble);
  }

  // A failed send previously left an optimistic bubble that looked DELIVERED
  // (cleanup ran only on the success path). Mark it failed, surface the
  // reason inline, and offer one-click retry.
  function failUserBubble(runId, text, errMsg, ubId) {
    var stream = $('stream');
    var sess = S.sessions[runId];
    if (!stream || !sess) return;
    if (sess.pendingUserMessages) {
      var idx = sess.pendingUserMessages.findIndex(function (item) { return ubId ? item.id === ubId : item.text === credentialChatInput(text).safeText; });
      if (idx >= 0) sess.pendingUserMessages.splice(idx, 1);
    }
    // Prefer the unique bubble id: two identical texts must not fail/retry
    // each other's bubbles.
    var target = ubId ? stream.querySelector('div[data-ubid="' + ubId + '"]') : null;
    if (!target) {
      stream.querySelectorAll('div[data-ubtext]').forEach(function (b) {
        if (b.getAttribute('data-ubtext') === text) target = b;
      });
    }
    if (!target) { toast(errMsg || 'send failed', true); return; }
    if (target.querySelector('.sendfail')) return;
    target.classList.add('failed');
    var row = document.createElement('div');
    row.className = 'sendfail';
    row.style.cssText = 'display:flex;gap:8px;align-items:center;margin-top:6px;color:var(--err);font-size:11.5px';
    var msgSpan = document.createElement('span');
    msgSpan.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px';
    msgSpan.textContent = String(errMsg || 'send failed').slice(0, 160);
    var btn = document.createElement('button');
    btn.className = 'btn ghost';
    btn.style.cssText = 'padding:3px 10px;font-size:11.5px';
    btn.innerHTML = icon('retry') + ' Retry';
    btn.onclick = function () {
      target.remove();
      sendFollow(text);
    };
    row.appendChild(msgSpan);
    row.appendChild(btn);
    target.querySelector(':scope > div').appendChild(row);
    stickScroll(stream, true);
  }

  function closeThought(runId) {
    var sess = S.sessions[runId];
    var node = sess.nodes.thought;
    if (node) {
      flushStreamText(node.querySelector('.exec-pre'));
      var c = node.querySelector('.caret'); if (c) c.remove();
      if (node.classList.contains('tl-stream-row')) node.dataset.streamState = 'done';
      dedupeNarration(sess, node, 'lastThoughtText');
      finalizeNarration(node);
      sess.nodes.thought = null;
    }
  }
  // ── Narration finalization ─────────────────────────────────────────────
  // Stream plain text, then apply safe formatting without rewriting or
  // shortening the response. Protocol leaks never become conversation.
  // Matches a raw JSON action object prefix whether or not the stream cut
  // off before the closing quote: '{"thought"…', '{"thought' (truncated),
  // and the escaped '{\"thought\"' variants.
  var JSON_LEAK_RE = /^\{\s*\\?"thought/;
  var JSON_LEAK_MARKERS = ['{"thought', '{\\"thought'];
  function stripJsonLeak(t) {
    var cut = -1;
    for (var i = 0; i < JSON_LEAK_MARKERS.length; i++) {
      var at = t.indexOf(JSON_LEAK_MARKERS[i]);
      if (at >= 0 && (cut < 0 || at < cut)) cut = at;
    }
    if (cut < 0) return t;
    return t.slice(0, cut).replace(/[\s,;·—-]+$/, '');
  }
  // Called once per narration node when its stream ends. Idempotent via
  // data-final so replays/retries never restructure twice.
  function finalizeNarration(el) {
    var txt = el.querySelector('.txt');
    flushStreamText(txt);
    if (!txt || txt.getAttribute('data-final')) return;
    txt.setAttribute('data-final', '1');
    var raw = txt.textContent || '';
    var clean = stripJsonLeak(raw);
    var trimmed = clean.trim();
    // The WHOLE node is a leaked action object: never show schema noise as
    // conversation. Normal mode drops it entirely; Developer mode keeps the
    // old collapsed disclosure.
    if (JSON_LEAK_RE.test(trimmed)) {
      txt.textContent = '';
      if (!devMode()) return;
      var d = document.createElement('details');
      d.className = 'exec-details';
      d.innerHTML = '<summary><b>Raw model output</b><span class="chev">\u25B8</span></summary><pre class="exec-pre"></pre>';
      d.querySelector('.exec-pre').textContent = trimmed;
      txt.appendChild(d);
      return;
    }
    if (clean !== raw) txt.textContent = clean;
    txt.classList.add('response-prose');
    txt.innerHTML = renderResponseText(clean);
  }
  // ── Retry-duplicate collapsing ──────────────────────────────────────────
  // After a transient LLM failure the retry re-streams the SAME thought, and
  // the interleaved "recover …" events close the previous row — so every
  // attempt rendered as an identical narration row. Collapse exact repeats
  // entirely; if the retry continues FURTHER than the failed attempt, keep
  // only the new tail.
  function dedupeNarration(sess, el, memoKey) {
    var txt = el.querySelector('.txt');
    flushStreamText(txt);
    if (!txt) return;
    var raw = (txt.textContent || '').trim();
    if (!raw) return;
    var prev = sess[memoKey] || '';
    if (prev) {
      if (raw === prev) { el.remove(); return; }
      if (raw.length > prev.length && raw.indexOf(prev) === 0) {
        txt.textContent = raw.slice(prev.length).replace(/^[\s.,;—-]+/, '');
      }
    }
    sess[memoKey] = raw;
  }
  // An agent bubble ends whenever the next turn starts; sanitize + structure
  // it at exactly that moment instead of leaving streaming text frozen.
  function retireAbubble(sess) {
    var b = sess.nodes.abubble;
    if (!b) return;
    sess.nodes.abubble = null;
    dedupeNarration(sess, b, 'lastBubbleText');
    finalizeNarration(b);
  }
  function toolKind(summary) {
    if (summary.indexOf('write ') === 0) return 'edit';
    if (summary.indexOf('edit ') === 0) return 'edit';
    if (summary.indexOf('read ') === 0) return 'read';
    if (summary.indexOf('list ') === 0) return 'list';
    if (summary.indexOf('search ') === 0) return 'search';
    if (summary.indexOf('$ ') === 0) return 'shell';
    if (summary.indexOf('browse') === 0) return 'browser';
    return 'tool';
  }
  // Human tool labels: what Gitu is doing, not the wire format. The raw
  // summary stays on dataset.toolKey for run/ok/error correlation.
  function humanToolSummary(kind, summary) {
    if (kind === 'read') return 'Read ' + summary.slice(5);
    if (kind === 'edit') return 'Edit ' + summary.slice(summary.indexOf(' ') + 1);
    if (kind === 'list') return 'List ' + summary.slice(5);
    if (kind === 'search') return 'Search ' + summary.slice(7);
    if (kind === 'browser') return 'Browser · ' + summary;
    if (kind === 'shell') return summary.slice(2);
    return summary;
  }
  function splitSummary(body) { var d = body.indexOf(' — '); return d >= 0 ? body.slice(0, d) : body; }
  function splitReason(body) { var d = body.indexOf(' — '); return d >= 0 ? body.slice(d + 3) : ''; }
  function publicThinkingStatus(text) {
    var description = String(text || '').replace(/^think\s*/, '').replace(/\s+/g, ' ').trim();
    if (!description || /[{}\[\]]/.test(description)) return 'Thinking…';
    return 'Thinking · ' + description.charAt(0).toUpperCase() + shortText(description.slice(1), 90).replace(/[.!?]+$/, '') + '…';
  }
  function workingTextFor(text) {
    if (text.indexOf('think') === 0) return publicThinkingStatus(text);
    if (text.indexOf('run ') === 0) {
      var summary = splitSummary(text.slice(4));
      var k = toolKind(summary);
      if (k === 'edit') return 'Editing ' + summary.slice(summary.indexOf(' ') + 1) + '…';
      if (k === 'read') return 'Reading ' + summary.slice(5) + '…';
      if (k === 'list') return 'Listing ' + summary.slice(5) + '…';
       if (k === 'search') return 'Searching…';
       if (k === 'browser') return 'Checking in browser…';
      if (k === 'shell') return 'Running ' + summary.slice(2) + '…';
      return 'Working: ' + summary + '…';
    }
    if (text.indexOf('plan ') === 0) return 'Building plan…';
    if (text.indexOf('criteria') === 0) return 'Defining acceptance criteria…';
    if (text.indexOf('evidence') === 0) return 'Recording evidence…';
    if (text.indexOf('claim') === 0) return 'Checking acceptance…';
    if (text.indexOf('problem') === 0) return 'Investigating a failure…';
    if (text.indexOf('resolved') === 0) return 'Resuming the plan…';
    if (text.indexOf('replan') === 0) return 'Updating the plan…';
    if (text.indexOf('hypothesis') === 0) return 'Working out the cause…';
    if (text.indexOf('context') === 0) return 'Selecting context…';
    return null;
  }
  // Working indicator with an elapsed-seconds counter that escalates after
  // 60s on the SAME phase text — a hung command becomes visible instead of
  // looking alive forever. Counter resets whenever the phase text changes.
  function setWorking(text) {
    var w = $('working');
    if (!w) return;
    if (!text) {
      w.style.display = 'none';
      w.classList.remove('slow');
      if (S.workingTimer) { clearInterval(S.workingTimer); S.workingTimer = null; }
      S.workingSince = null; S.lastWorkingText = null;
      var e0 = $('workingElapsed'); if (e0) e0.textContent = '';
      return;
    }
    // A tool row owns its own spinner. Otherwise keep the live thinking line
    // at the tail so the animation follows the current narration.
    w.style.display = document.querySelector('.tool-call[data-tool-state="working"]') ? 'none' : 'flex';
    if (text !== S.lastWorkingText) { S.lastWorkingText = text; S.workingSince = Date.now(); w.classList.remove('slow'); }
    var t = $('workingText');
    if (t && t.textContent !== text) t.textContent = text;
    var activeSession = S.sessions[S.active];
    renderReasoningStream($('workingReasoning'), activeSession && activeSession.nodes && activeSession.nodes.reasoningText);
    if (!S.workingTimer) {
      S.workingTimer = setInterval(function () {
        if (!document.hidden) document.querySelectorAll('.tool-call[data-tool-state="working"]').forEach(function (row) {
          var duration = row.querySelector('.tool-duration');
          if (duration) duration.textContent = Math.max(0, Math.floor((Date.now() - Number(row.dataset.startedAt)) / 1000)) + 's';
        });
        var sec = Math.floor((Date.now() - (S.workingSince || Date.now())) / 1000);
        var e = $('workingElapsed');
        if (e) e.textContent = sec >= 3 ? '· ' + sec + 's' : '';
        var ww = $('working');
        if (ww && sec >= 60) ww.classList.add('slow');
      }, 1000);
    }
  }

  function setupCopyButton(btn, textGetter) {
    if (!btn) return;
    btn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      var str = typeof textGetter === 'function' ? textGetter() : String(textGetter || '');
      if (!str) return;
      navigator.clipboard.writeText(str).then(function () {
        btn.classList.add('copied');
        var old = btn.innerHTML;
        btn.innerHTML = icon('check') + ' Copied';
        setTimeout(function () {
          btn.classList.remove('copied');
          btn.innerHTML = old;
        }, 1500);
      }).catch(function () {});
    };
  }

  function setupOutputFolding(detailsEl, preEl, text) {
    if (!detailsEl || !preEl) return;
    preEl.textContent = text;
    var lines = text.split('\n');
    var oldBtn = detailsEl.querySelector('.fold-btn');
    if (oldBtn) oldBtn.remove();
    if (lines.length > 8) {
      preEl.classList.add('folded');
      var foldBtn = document.createElement('button');
      foldBtn.className = 'fold-btn';
      foldBtn.type = 'button';
      var hiddenCount = lines.length - 6;
      foldBtn.textContent = 'Show ' + hiddenCount + ' more lines…';
      foldBtn.onclick = function (e) {
        e.stopPropagation();
        var isFolded = preEl.classList.toggle('folded');
        foldBtn.textContent = isFolded ? ('Show ' + hiddenCount + ' more lines…') : 'Show less';
      };
      detailsEl.appendChild(foldBtn);
    } else {
      preEl.classList.remove('folded');
    }
  }

  // Actual patch output gets line color and counts. Plain edit acknowledgements
  // stay plain: a successful write does not tell us how many lines changed.
  function decorateToolDiff(row, preEl, output) {
    if (!row || row.dataset.toolKind !== 'edit' || !preEl) return;
    var lines = String(output || '').split('\n');
    var patch = lines.some(function (line) { return /^diff --git |^@@ |^--- /.test(line); });
    if (!patch) return;
    var added = 0, removed = 0;
    lines.forEach(function (line) {
      if (line.charAt(0) === '+' && line.indexOf('+++') !== 0) added++;
      if (line.charAt(0) === '-' && line.indexOf('---') !== 0) removed++;
    });
    if (!added && !removed) return;
    preEl.classList.add('tool-diff');
    preEl.textContent = '';
    lines.forEach(function (line, index) {
      var span = document.createElement('span');
      span.className = 'tool-diff-line' +
        (line.charAt(0) === '+' && line.indexOf('+++') !== 0 ? ' add' :
        line.charAt(0) === '-' && line.indexOf('---') !== 0 ? ' del' :
        /^@@ |^diff --git /.test(line) ? ' hunk' : '');
      span.textContent = line + (index < lines.length - 1 ? '\n' : '');
      preEl.appendChild(span);
    });
    var head = row.querySelector('.tool-call-head');
    if (!head) return;
    var stat = head.querySelector('.tool-change-stat');
    if (!stat) {
      stat = document.createElement('span');
      stat.className = 'tool-change-stat';
      var status = head.querySelector('.st');
      if (status) head.insertBefore(stat, status); else head.appendChild(stat);
    }
    stat.innerHTML = '<span class="added">+' + added + '</span><span class="removed">−' + removed + '</span>';
    stat.setAttribute('aria-label', added + ' lines added, ' + removed + ' lines removed');
  }

  // ── Delegated specialists ───────────────────────────────────────────────
  // One living timeline group per delegated job (keyed by job id): an inline
  // header row (agent name · turn count · specialist tag · status) with the
  // sub-agent's narration lines nested below under their own border rule.
  var SPEC_LOG_CAP = 40;
  var SPEC_LIFECYCLE = /^subagent (\S+) \[(queued|running|completed|failed|cancelled)\] (sub-[^\s]+) — ?([\s\S]*)$/;
  var SPEC_STATUS = {
    queued: ['st st-idle', '&#8943; queued'],
    working: ['st st-run', '&#8943; working'],
    done: ['st st-ok', '&#10003; done'],
    failed: ['st st-err', '&#10005; failed'],
    cancelled: ['st st-warn', '&#10005; cancelled']
  };

  function specSetStatus(st, label) {
    var m = SPEC_STATUS[label] || ['st st-idle', esc(label)];
    st.statusEl.className = 'tl-sub-status ' + m[0];
    st.statusEl.innerHTML = m[1];
    if (st.dotEl) {
      st.dotEl.className = 'tl-dot ' + (label === 'done' ? 'dot-ok' : (label === 'failed' || label === 'cancelled') ? 'dot-bad' : label === 'working' ? 'dot-run' : 'dot-note');
      if (label !== 'working') st.dotEl.style.animation = 'none';
    }
  }
  function specPushActivity(st, line) {
    st.activity.push(line);
    if (st.activity.length > SPEC_LOG_CAP) st.activity.splice(0, st.activity.length - SPEC_LOG_CAP);
    // Collapsed cards stay cheap: only the one-line preview updates.
    if (st.open) renderSpecLog(st);
    updateSpecPreview(st);
  }
  function updateSpecPreview(st) {
    if (!st.prevEl) return;
    var last = st.activity.length ? st.activity[st.activity.length - 1] : '';
    st.prevEl.textContent = last || st.task || '';
  }
  // Tap-to-peek: header toggles the activity log; collapsed shows just the
  // latest line so you can see what the specialist is doing right now.
  function applySpecCollapse(st) {
    if (!st.log) return;
    // The raw per-specialist activity rail (protocol lines, job internals)
    // is Developer-only. Normal users see the card plus its one-line preview.
    st.log.hidden = !st.open || !devMode();
    st.el.classList.toggle('open', Boolean(st.open && devMode()));
    var head = st.headEl;
    if (head) {
      head.setAttribute('aria-expanded', st.open && devMode() ? 'true' : 'false');
      head.title = st.open && devMode() ? 'click to collapse' : 'click to expand activity';
    }
    if (st.open) renderSpecLog(st);
    updateSpecPreview(st);
  }
  function renderSpecLog(st) {
    st.log.innerHTML = '';
    st.activity.slice(-SPEC_LOG_CAP).forEach(function (line) {
      var d = document.createElement('div');
      d.className = 'spec-logline';
      d.textContent = line;
      st.log.appendChild(d);
    });
    st.log.scrollTop = st.log.scrollHeight;
  }
  function upsertSpecialistCard(runId, insert, name, status, jobId, detail) {
    var sess = S.sessions[runId];
    if (!sess) return;
    sess.nodes.specs = sess.nodes.specs || {};
    var st = sess.nodes.specs[jobId];
    if (!st) {
      var group = document.createElement('div');
      group.className = 'tl-row tl-sub-row';
      group.innerHTML =
        '<span class="tl-dot dot-run"></span>' +
        '<div class="tl-body">' +
          '<div class="tl-sub-head" role="button" tabindex="0" aria-expanded="false" title="click to expand activity">' +
            '<span class="spec-chev">' + icon('chevRight') + '</span>' +
            '<span class="spec-name">' + esc(name) + '</span>' +
            '<span class="spec-turns"></span>' +
            '<span class="spec-tag">specialist</span>' +
            '<span class="tl-sub-status st st-idle">&#8943; queued</span>' +
          '</div>' +
          '<div class="tl-sub-task" hidden></div>' +
          '<div class="spec-preview"></div>' +
          '<div class="tl-sub-rail" hidden></div>' +
        '</div>';
      st = sess.nodes.specs[jobId] = {
        el: group,
        name: name,
        task: '',
        activity: [],
        open: false,
        dotEl: group.querySelector('.tl-dot'),
        statusEl: group.querySelector('.tl-sub-status'),
        turnsEl: group.querySelector('.spec-turns'),
        taskEl: group.querySelector('.tl-sub-task'),
        prevEl: group.querySelector('.spec-preview'),
        headEl: group.querySelector('.tl-sub-head'),
        log: group.querySelector('.tl-sub-rail')
      };
      var toggle = function () { st.open = !st.open; applySpecCollapse(st); };
      st.headEl.onclick = toggle;
      st.headEl.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
      insert(group);
      applySpecCollapse(st);
    }
    if (status === 'queued') {
      st.task = detail;
      st.taskEl.hidden = false;
      st.taskEl.textContent = detail;
      specSetStatus(st, 'queued');
    } else if (status === 'running') {
      specSetStatus(st, 'working');
      var tm = /turn (\d+)\/(\d+)/.exec(detail);
      st.turnsEl.textContent = tm ? 'turn ' + tm[1] + '/' + tm[2] : '';
    } else {
      specSetStatus(st, status === 'completed' ? 'done' : status);
      st.turnsEl.textContent = '';
      if (detail) specPushActivity(st, detail);
      // A failed specialist is exactly when you WANT the log open.
      if (status === 'failed' || status === 'cancelled') { st.open = true; applySpecCollapse(st); }
    }
    var stream = $('stream');
    if (stream) stickScroll(stream);
  }
  function attachSpecialistActivity(runId, text) {
    var sess = S.sessions[runId];
    if (!sess || !sess.nodes.specs) return false;
    var rest = text.slice('subagent '.length);
    var name = rest.split(/[\s:]/)[0];
    if (!name) return false;
    var pick = null;
    Object.keys(sess.nodes.specs).forEach(function (id) {
      if (sess.nodes.specs[id].name === name) pick = sess.nodes.specs[id]; // insertion order → last job wins
    });
    if (!pick) return false;
    specPushActivity(pick, rest.slice(name.length).replace(/^[:—\-\s]+/, ''));
    return true;
  }

  // ── Intake metadata line ────────────────────────────────────────────────
  // The resume burst (project/ledger/branch/risk/effort/context/…) collapses
  // into one quiet silver text line. Metadata = quiet; agent output = normal;
  // errors (fatal/blocked/done) are NEVER grouped — they stay prominent.
  var INTAKE_TAGS = { project: 1, ledger: 1, branch: 1, criteria: 1, skill: 1, risk: 1, effort: 1, context: 1 };

  function intakeDigestPart(tag, body) {
    if (tag === 'project') {
      var m = /^locked:\s*([^@\n]+?)\s+@/.exec(body);
      return m ? m[1] : '';
    }
    if (tag === 'effort') {
      var e = /^([a-z]+)/i.exec(body);
      return e ? e[1] + ' effort' : '';
    }
    if (tag === 'context') {
      var c = /^(\d+) primary/.exec(body);
      return c ? c[1] + ' files' : '';
    }
    return '';
  }
  function upsertIntakeLine(runId, insert, tag, body) {
    var sess = S.sessions[runId];
    if (!sess) return;
    var streamEl = $('stream');
    var st = sess.nodes.intake;
    // Singleton guarantee: retries and resume bursts re-emit the whole intake
    // set, so NEVER insert a second line — adopt the one already in the
    // stream (clearing its rows; the burst repopulates them immediately).
    if ((!st || !st.el.isConnected) && streamEl) {
      var existing = streamEl.querySelector('.intake-line');
      if (existing) {
        existing.querySelector('.intake-rows').innerHTML = '';
        st = sess.nodes.intake = { el: existing, seen: {}, digest: {} };
      }
    }
    if (!st) {
      var el = document.createElement('div');
      el.className = 'tl-row intake-line';
      el.innerHTML =
        '<span class="tl-dot dot-note"></span>' +
        '<div class="tl-body"><span class="intake-head">' +
          '<span class="intake-chev">' + icon('chevDown') + '</span>' +
          '<span class="intake-title">Session</span>' +
          '<span class="intake-digest"></span>' +
        '</span>' +
        '<div class="intake-rows"></div></div>';
      el.querySelector('.intake-head').addEventListener('click', function () {
        // Nothing to expand in normal mode (rows are Developer-only).
        if (!devMode()) return;
        el.classList.toggle('open');
      });
      st = sess.nodes.intake = { el: el, seen: {}, digest: {} };
      insert(el);
    }
    // Dedupe identical tag+body pairs on replays/retries. The collapsed rows
    // (Project:/Ledger:/Branch:/…) are Developer detail: normal users get the
    // quiet digest line only ("Session started · project · high effort · 3 files").
    var rowKey = tag + '::' + body;
    if (!st.seen[rowKey]) {
      st.seen[rowKey] = 1;
      if (devMode()) {
        var row = document.createElement('div');
        row.className = 'intake-row';
        row.textContent = tag.charAt(0).toUpperCase() + tag.slice(1) + ': ' + body;
        st.el.querySelector('.intake-rows').appendChild(row);
      }
      var part = intakeDigestPart(tag, body);
      if (part) st.digest[tag] = part;
    }
    var created = false;
    for (var key in st.seen) {
      if (key.indexOf('ledger::created:') === 0) { created = true; break; }
    }
    st.el.querySelector('.intake-title').textContent = created ? 'Session started' : 'Session resumed';
    var d = st.digest;
    st.el.querySelector('.intake-digest').textContent =
      ['project', 'effort', 'context'].map(function (k) { return d[k]; }).filter(Boolean).map(function (s) { return '\u00B7 ' + s; }).join(' ');
    var stream = $('stream');
    if (stream) stickScroll(stream);
  }

  // ── Grouped tool activity ──────────────────────────────────────────────
  // A model turn can make several calls (especially a parallel action). Keep
  // them in one disclosure anchored after that turn rather than echoing a
  // separate timeline card for every lifecycle event. The rows inside remain
  // independently addressable so out-of-order parallel completions still
  // update the right call.
  function toolActivityGroupForRow(row) {
    return row && row.closest ? row.closest('.tl-tool-group') : null;
  }

  function toolActivityHint(summary, working) {
    var text = String(summary || '').trim();
    var verbs = { read: ['Reading', 'Read'], write: ['Writing', 'Wrote'], edit: ['Editing', 'Edited'], list: ['Listing', 'Listed'], search: ['Searching', 'Searched'] };
    var match = /^(read|write|edit|list|search)\s+([\s\S]*)$/.exec(text);
    if (match) return verbs[match[1]][working ? 0 : 1] + ' ' + match[2];
    if (text.indexOf('$ ') === 0) return (working ? 'Running ' : 'Ran ') + text.slice(2);
    return text || (working ? 'Preparing action' : 'Action completed');
  }

  function refreshToolActivityGroup(groupEl) {
    if (!groupEl || !groupEl.isConnected) return;
    var rows = Array.prototype.slice.call(groupEl.querySelectorAll('.tool-call'));
    var running = 0, troubled = 0, current = null;
    rows.forEach(function (row) {
      var state = String(row.dataset.toolState || '');
      if (state === 'working') { running++; if (!current) current = row; }
      var outcome = String(row.dataset.toolStatus || '');
      if (outcome === 'error' || outcome === 'denied' || outcome === 'blocked' || outcome === 'interrupted') troubled++;
    });
    var status = running ? 'working' : troubled ? 'attention' : 'complete';
    groupEl.dataset.toolGroupState = status;
    var count = groupEl.querySelector('.tool-group-count');
    if (count) count.textContent = rows.length + (rows.length === 1 ? ' activity' : ' activities');
    current = current || rows[rows.length - 1];
    var title = groupEl.querySelector('.tool-group-title');
    var hint = groupEl.querySelector('.tool-group-hint');
    if (title && current) title.textContent = toolActivityHint(current.dataset.toolKey, !!running);
    if (hint) hint.textContent = current ? String(current.dataset.toolReason || '') : '';
    var label = groupEl.querySelector('.tool-group-state');
    if (label) label.textContent = running > 1 ? running + ' running' : status === 'attention' ? 'Needs attention' : status === 'complete' ? 'Complete' : '';
    var dot = groupEl.querySelector(':scope > .tl-dot');
    if (dot) dot.className = 'tl-dot ' + (status === 'working' ? 'dot-run' : status === 'attention' ? 'dot-bad' : 'dot-ok');
    var summary = groupEl.querySelector('.tool-group-details > summary');
    if (summary) {
      summary.title = (title ? title.textContent : '') + (hint && hint.textContent ? '\n' + hint.textContent : '');
      summary.setAttribute('aria-label', (title ? title.textContent + '. ' : '') + 'Show ' + rows.length + ' activities and outputs');
    }
  }

  function sealToolActivityGroup(sess, force) {
    if (!sess || !sess.nodes || !sess.nodes.toolGroup) return;
    var group = sess.nodes.toolGroup;
    if (!group.el || !group.el.isConnected) { sess.nodes.toolGroup = null; return; }
    if (!force && group.el.querySelector('.tool-call[data-tool-state="working"]')) return;
    group.accepting = false;
    sess.nodes.toolGroup = null;
  }

  function createToolActivityGroup(sess, insert) {
    var el = document.createElement('div');
    el.className = 'tl-row tl-tool-group';
    el.dataset.toolGroupState = 'working';
    el.innerHTML =
      '<span class="tl-dot dot-run"></span>' +
      '<div class="tl-body"><details class="tool-group-details">' +
        '<summary aria-label="Show tool activity">' +
          '<span class="tool-group-orbit" aria-hidden="true"></span>' +
          '<span class="tool-group-chevron" aria-hidden="true">›</span>' +
          '<span class="tool-group-copy"><span class="tool-group-title" aria-live="polite">Preparing action</span><span class="tool-group-hint"></span></span>' +
          '<span class="tool-group-count">0 activities</span>' +
          '<span class="tool-group-state"></span>' +
        '</summary>' +
        '<div class="tool-group-list"></div>' +
      '</details></div>';
    var details = el.querySelector('.tool-group-details');
    var summary = el.querySelector('.tool-group-details > summary');
    if (details && summary) {
      summary.setAttribute('aria-expanded', 'false');
      details.addEventListener('toggle', function () { summary.setAttribute('aria-expanded', String(details.open)); });
    }
    insert(el);
    var group = { el: el, accepting: true };
    sess.nodes.toolGroup = group;
    return group;
  }

  function ensureToolActivityGroup(sess, insert) {
    var group = sess && sess.nodes && sess.nodes.toolGroup;
    if (group && group.el && group.el.isConnected && group.accepting) return group;
    return createToolActivityGroup(sess, insert);
  }

  // Tool cards left in the "working" state — by a crashed or restarted app, an
  // approval timeout, or a history replay of a run that ended mid-tool —
  // suppress the global thinking/reasoning/responding line forever (a working
  // row "owns" the spinner) and keep their group flagged as running. Mark
  // everything that started before beforeMs as interrupted so a resumed run
  // gets its live indicator back. Rows started AFTER beforeMs (the current
  // run's own tools) are left untouched.
  function interruptWorkingToolRows(sess, beforeMs) {
    if (!sess || !sess.nodes) return;
    var swept = false;
    var groups = [];
    (sess.nodes.toolRows || []).forEach(function (row) {
      if (!row.isConnected || row.dataset.toolState !== 'working') return;
      if (beforeMs !== undefined && Number(row.dataset.startedAt || 0) >= beforeMs) return;
      swept = true;
      row.dataset.toolState = 'done';
      row.dataset.toolStatus = 'interrupted';
      var toolStatus = row.querySelector('.st');
      if (toolStatus) { toolStatus.className = 'st st-warn'; toolStatus.textContent = 'Interrupted'; }
      var outputLabel = row.querySelector('.output-label');
      if (outputLabel) outputLabel.textContent = 'Output · interrupted';
      var output = row.querySelector('pre');
      if (output) output.textContent = 'The run ended before this tool reported a result.';
      var interruptedGroup = toolActivityGroupForRow(row);
      if (interruptedGroup && groups.indexOf(interruptedGroup) < 0) groups.push(interruptedGroup);
    });
    if (!swept) return;
    groups.forEach(refreshToolActivityGroup);
    sealToolActivityGroup(sess, true);
  }

  // An operation can still be running when the agent streams a new public
  // update. Keep that live disclosure at the tail of the update it belongs
  // to; completed activity stays in its original chronological position.
  function followActiveToolActivity(stream, sess) {
    var group = sess && sess.nodes && sess.nodes.toolGroup;
    if (!stream || !group || !group.el || !group.el.isConnected) return;
    if (!group.el.querySelector('.tool-call[data-tool-state="working"]')) return;
    var working = $('working');
    if (working && working.parentNode === stream) stream.insertBefore(group.el, working);
    else stream.appendChild(group.el);
  }

  function toolActivityBoundary(text) {
    return /^(?:tdelta |thought |say |user-msg |activity (?:reasoning|content|tool)|think(?:\s|$)|evidence |plan |criteria |hypothesis |decision |ask-user|approval-required|queued |stopped |continue |done )/.test(String(text || ''));
  }

  // Tool lifecycle matching, shared by the legacy prose path and the typed
  // command frames. Matching on the stable parameter summary keeps parallel
  // rows independent and also handles completions that arrive out of order.
  // The duration suffix is only present on post-execution events; preflight
  // errors/denials do not own a running card and must not accidentally close
  // the previous one.
  function terminalToolSummary(value) {
    var m = /^(.*?)(?:\s+\(\d+ms\))$/.exec(String(value || '').trim());
    return m ? m[1].trim() : '';
  }
  function normalizeToolKey(value) {
    return String(value || '').replace(/^\$\s*/, '').replace(/\s+/g, ' ').trim();
  }
  function activeToolRows(state) {
    var rows = state && state.nodes && state.nodes.toolRows;
    if (!rows) return [];
    // The timeline is bounded; drop cards evicted by trimTimeline so the
    // lifecycle queue cannot retain detached DOM nodes forever.
    state.nodes.toolRows = rows.filter(function (row) { return row && row.isConnected && row.dataset.toolState === 'working'; });
    return state.nodes.toolRows;
  }
  function findToolRow(state, hint, allowFallback, exactOnly) {
    if (!state || !state.nodes) return null;
    var rows = activeToolRows(state);
    var raw = String(hint || '').trim();
    var key = normalizeToolKey(raw);
    var exact = null;
    for (var ri = 0; ri < rows.length; ri++) {
      var rowKey = String(rows[ri].dataset.toolKey || '');
      if (raw && (rowKey === raw || normalizeToolKey(rowKey) === key)) { exact = rows[ri]; break; }
    }
    if (exact) return exact;
    // A path-only lines event can match an edit; only accept an unambiguous
    // partial match after looking for every exact command match first. This
    // also recovers the prose summary's 160-character truncation: a typed
    // frame carries the full command, the card key holds the truncated one,
    // and containment is what re-links them.
    var partial = rows.filter(function (row) {
      var candidate = normalizeToolKey(row.dataset.toolKey || '');
      return key && candidate && (candidate.indexOf(key) >= 0 || key.indexOf(candidate) >= 0);
    });
    if (partial.length === 1) return partial[0];
    // Typed frames always carry the exact command, so they stop here: a frame
    // for a command the timeline never saw (replay without frames, a foreign
    // emitter) must not stamp an unrelated card. The fallbacks below exist for
    // legacy prose events that had no reliable correlation.
    if (exactOnly) return null;
    // A single active row is unambiguous even for older/replayed events.
    if (rows.length === 1) return rows[0];
    // Old persisted parallel events did not carry a correlation id. FIFO is
    // the least surprising recovery for those rows; new events match above.
    return allowFallback && state.nodes.parallelPending && rows.length ? rows[0] : null;
  }

  // Apply one terminal outcome to a tool card. info.durationMs comes from the
  // prose suffix or the typed event; info.exitCode is the raw fact from the
  // executor's typed event, shown as its own badge and never inferred back out
  // of prose. An absent code stays absent — no exit status, no badge.
  function applyToolOutcome(row, status, info) {
    var dotEl = row.querySelector('.tl-dot');
    var stEl = row.querySelector('.st');
    if (status === 'ok') {
      if (dotEl) dotEl.className = 'tl-dot dot-ok';
      if (stEl) { stEl.className = 'st st-ok'; stEl.innerHTML = '&#10003; ok'; }
    } else if (status === 'error') {
      if (dotEl) dotEl.className = 'tl-dot dot-bad';
      if (stEl) { stEl.className = 'st st-err'; stEl.innerHTML = '&#10005; error'; }
      row.classList.add('done-bad');
    } else if (status === 'denied') {
      if (dotEl) dotEl.className = 'tl-dot dot-bad';
      if (stEl) { stEl.className = 'st st-err'; stEl.innerHTML = '&#10005; denied'; }
      row.classList.add('done-bad');
    } else {
      if (dotEl) dotEl.className = 'tl-dot dot-blocked';
      if (stEl) { stEl.className = 'st st-warn'; stEl.innerHTML = '&#10005; blocked'; }
    }
    row.dataset.toolState = 'done';
    row.dataset.toolStatus = status;
    var outputLabel = row.querySelector('.output-label');
    if (outputLabel) outputLabel.textContent = 'Output';
    var outputPre = row.querySelector('pre');
    if (outputPre && outputPre.textContent === 'Waiting for tool output…') outputPre.textContent = 'Tool ' + (status === 'ok' ? 'completed' : status) + '. No output was returned.';
    var duration = row.querySelector('.tool-duration');
    if (duration && info.durationMs != null) {
      var ms = Number(info.durationMs);
      duration.textContent = ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(1) + 's';
    }
    if (info.exitCode !== undefined) {
      var head = row.querySelector('.tl-cmd');
      var badge = head && head.querySelector('.exit-code');
      if (head && !badge) {
        badge = document.createElement('span');
        var durEl = head.querySelector('.tool-duration');
        if (durEl) head.insertBefore(badge, durEl); else head.appendChild(badge);
      }
      if (badge) {
        badge.className = 'exit-code' + (info.exitCode === 0 ? '' : ' bad');
        badge.textContent = 'exit ' + info.exitCode;
      }
    }
    var detailsEl = row.querySelector('details');
    if (detailsEl && status !== 'ok') detailsEl.open = true;
    refreshToolActivityGroup(toolActivityGroupForRow(row));
  }

  // Finish the working card matching info.key. Returns the row, or null when
  // nothing is waiting on that key.
  function finishToolCard(state, status, info) {
    var key = String((info && info.key) || '').trim();
    if (!key) return null;
    var row = findToolRow(state, key, true, info && info.exactOnly);
    if (!row) return null;
    applyToolOutcome(row, status, info);
    state.nodes.lastTool = row;
    state.nodes.lastOutputTool = row;
    if (activeToolRows(state).length === 0) state.nodes.parallelPending = false;
    // Recently finished cards, so a typed frame that arrives just after the
    // prose line can still upgrade the card it belongs to. Only ever consulted
    // with an exact key match, so a wide pool is safe: the cap exists for the
    // live case (one pool entry per finished card in a session), while a replay
    // restores the whole visible window at once and the frames arrive right
    // after it — a 12-entry pool silently left every earlier restored command
    // without its exit badge.
    var recent = state.nodes.recentFinished || (state.nodes.recentFinished = []);
    recent.push({ key: normalizeToolKey(key), row: row });
    if (recent.length > (state.replaying ? MAX_REPLAY_EVENTS : 12)) recent.shift();
    return row;
  }

  // The legacy prose terminal line (ok … / error …), parsed from the text.
  function finishToolRow(state, status, eventBody) {
    var key = terminalToolSummary(eventBody);
    if (!key) return null;
    var elapsed = /\((\d+)ms\)$/.exec(eventBody);
    return finishToolCard(state, status, { key: key, durationMs: elapsed ? Number(elapsed[1]) : undefined });
  }

  // The typed command frame carries the raw command and the real exit code.
  // The prose line normally finished the card moments earlier — the executor
  // emits them adjacently, prose first — so the frame's job is to upgrade that
  // card with the exit fact, not to build a card of its own: prose keeps the
  // reason text the typed start does not carry, and replayed/restored sessions
  // have prose rows but no frames. Nothing to match means nothing to do.
  function applyCommandFinish(runId, typed) {
    var sess = S.sessions[runId];
    if (!sess || !typed || typed.type !== 'command_finished') return;
    var status = typed.ok ? 'ok' : 'error';
    var info = { key: typed.command, durationMs: typed.durationMs, exitCode: typed.exitCode, exactOnly: true };
    if (finishToolCard(sess, status, info)) return;
    var recent = sess.nodes.recentFinished || [];
    for (var i = recent.length - 1; i >= 0; i--) {
      if (recent[i].row.isConnected && recent[i].key === normalizeToolKey(typed.command)) {
        applyToolOutcome(recent[i].row, status, info);
        return;
      }
    }
  }

  // Attach the real diff to the edit's tool row. Removals render red and
  // additions green: a rewrite that deleted code must never look like a pure
  // addition, which is exactly what a count-only badge showed.
  function applyFileChange(runId, typed) {
    var sess = S.sessions[runId];
    if (!sess || !typed) return;
    var row = findToolRow(sess, typed.path, true);
    if (!row || !typed.diff || !typed.diff.length) return;
    if (row.querySelector('.diffview')) return;
    var wrap = document.createElement('div');
    wrap.className = 'diffview';
    for (var i = 0; i < typed.diff.length; i++) {
      var d = typed.diff[i] || {};
      // A "… N unchanged lines" row is a gap marker, not source.
      var gap = d.kind === 'context' && /^\u2026 \d+ (unchanged|more diff)/.test(String(d.text || ''));
      var line = document.createElement('div');
      line.className = 'dline ' + (gap ? 'gap' : (d.kind === 'add' ? 'add' : d.kind === 'remove' ? 'remove' : 'context'));
      var ln = document.createElement('span');
      ln.className = 'ln';
      ln.textContent = d.newLine || d.oldLine || '';
      var mark = document.createElement('span');
      mark.className = 'mark';
      mark.textContent = d.kind === 'add' ? '+' : d.kind === 'remove' ? '-' : '';
      var tx = document.createElement('span');
      tx.className = 'tx';
      tx.textContent = d.text || '';
      line.appendChild(ln);
      line.appendChild(mark);
      line.appendChild(tx);
      wrap.appendChild(line);
    }
    row.appendChild(wrap);
  }

  // The model's own reasoning. A run that thinks silently is indistinguishable
  // from a run that is stuck, so the trace is shown — collapsed by default,
  // live while it streams.
  function applyReasoning(runId, typed) {
    var stream = $('stream');
    var sess = S.sessions[runId];
    if (!stream || !sess || !typed || !typed.text) return;
    var box = sess.nodes && sess.nodes.think;
    if (!box) {
      var row = document.createElement('div');
      row.className = 'tl-row tl-think';
      box = document.createElement('details');
      box.className = 'thinkbox';
      var sum = document.createElement('summary');
      sum.textContent = "Model's reasoning";
      var pre = document.createElement('pre');
      box.appendChild(sum);
      box.appendChild(pre);
      row.appendChild(box);
      sess.nodes = sess.nodes || {};
      sess.nodes.think = box;
      sess.nodes.thinkOpen = true;
      appendLive(stream, row);
    }
    var body = box.querySelector('pre');
    if (body) body.textContent = typed.text;
    // Open while it is still arriving, and leave it open: the trace is the point.
    if (sess.nodes.thinkOpen) box.open = true;
  }

  // Refused actions, rendered from the typed frames the executor emits at the
  // gate that refused them. This family had no visible rendering before: a
  // refusal is decided in preflight, before the run row that would create a
  // card, so the legacy line only ever looked for a card that cannot exist —
  // and the text adapter maps it to a plain log row rather than guessing at a
  // reason from its wording. The structured code, the tool, and the full
  // detail message exist on the event alone.
  var POLICY_REASON_LABELS = {
    project_guard: 'workspace boundary',
    user_instruction: 'your instruction',
    approval_required: 'approval',
    risk_policy: 'risk policy',
    loop_detected: 'repetition guard',
    repeated_skill_operation: 'repeated operation',
    edit_pressure: 'edit pressure',
    budget_exhausted: 'budget exhausted',
    prerequisite_missing: 'missing prerequisite',
  };

  // Presentation only: the code is the fact, the label is how it reads. An
  // unrecognized code degrades to its own words rather than to nothing, so a
  // future emitter cannot silently render an empty card.
  function policyReasonLabel(typed) {
    var code = String((typed && typed.reason) || '');
    if (POLICY_REASON_LABELS[code]) return POLICY_REASON_LABELS[code];
    return code ? code.replace(/_/g, ' ') : 'policy';
  }

  function policyNoticeHtml(typed) {
    var blocked = typed.type === 'operation_blocked';
    var html = '<span class="tl-dot ' + (blocked ? 'dot-blocked' : 'dot-bad') + '"></span><div class="tl-body">' +
      '<span class="chip ' + (blocked ? 'warn' : 'bad') + '">' + esc(blocked ? 'blocked' : 'denied') + '</span> ' +
      '<b>' + esc(policyReasonLabel(typed)) + '</b>';
    var op = String(typed.operation || '').trim();
    if (op) html += ' <span class="policy-op">' + esc(op) + '</span>';
    if (typed.tool) html += ' <span class="policy-tool">' + esc(typed.tool) + '</span>';
    if (typed.detail) {
      var detail = String(typed.detail);
      if (typed.reason === 'loop_detected' || detail.length > 220) {
        var summary = typed.reason === 'loop_detected'
          ? 'Repeated action stopped. Use earlier results or try a different check.'
          : detail.slice(0, 150).replace(/\s+/g, ' ').trim() + (detail.length > 150 ? '…' : '');
        html += '<div class="policy-summary">' + esc(summary) + '</div>' +
          '<details class="policy-detail"><summary>Technical details</summary><div class="policy-raw">' + esc(detail) + '</div></details>';
      } else {
        html += '<div class="policy-detail">' + esc(detail) + '</div>';
      }
    }
    return html + ' <span class="chip warn repeat-count">&times;1</span></div>';
  }

  /**
   * Insert one timeline node where it belongs: before the working indicator,
   * with the replay styling and the timestamp stamp the prose path has always
   * used. Shared, so a typed card lands exactly like a prose row.
   */
  function insertTimelineNode(sess, el, iso) {
    var stream = $('stream');
    if (!stream) return;
    // A refused-action card counts *consecutive* refusals, so anything else
    // drawn in between ends the run of repeats. Recovery retries follow the
    // same rule via lastRecover.
    if (sess && sess.nodes) { sess.nodes.lastPolicy = null; sess.nodes.lastRecover = null; }
    if (sess && sess.replaying) el.classList.add('replayed');
    if (iso && el.classList && el.classList.contains('tl-row')) {
      var stamp = document.createElement('span');
      stamp.className = 'tl-time';
      stamp.textContent = hhmm(iso);
      stamp.title = new Date(iso).toLocaleString();
      el.appendChild(stamp);
    }
    var working = $('working');
    if (working) stream.insertBefore(el, working); else stream.appendChild(el);
    trimTimeline(stream);
    stickScroll(stream);
  }

  // A refused action stays true of the run forever, so a restored frame renders
  // here too — unlike a gate request, whose runtime did not survive the restart.
  function applyPolicyNotice(runId, typed, frame) {
    var sess = S.sessions[runId];
    if (!sess || !sess.nodes) return;
    var key = String(typed.reason || '') + '|' + String(typed.operation || '');
    var last = sess.nodes.lastPolicy;
    if (last && last.key === key && last.el && last.el.isConnected) {
      last.count += 1;
      var chip = last.el.querySelector('.repeat-count');
      if (chip) chip.textContent = '×' + last.count;
      return;
    }
    var el = document.createElement('div');
    el.className = 'tl-row tl-policy';
    el.innerHTML = policyNoticeHtml(typed);
    // A restored notice is history, so it appears without the entrance
    // animation a live one gets — the same rule replayed rows follow.
    if (frame && frame.restored) el.classList.add('replayed');
    insertTimelineNode(sess, el, frame && frame.t);
    // Set after the insert, which has already cleared it as "something else
    // was drawn in between".
    sess.nodes.lastPolicy = { key: key, count: 1, el: el };
  }

  function appendEvent(runId, ev) {
    var stream = $('stream');
    if (!stream) return;
    var sess = S.sessions[runId];
    var text = String(ev.text);
    // Event IDs identify transport replays. Identical commands with different
    // IDs are real invocations and each must keep its own output.
    if (sess && sess.nodes && ev.i != null) {
      var seen = sess.nodes.renderedEventIds || (sess.nodes.renderedEventIds = new Set());
      if (seen.has(ev.i)) return;
      seen.add(ev.i);
      if (seen.size > 2000) seen.delete(seen.values().next().value);
    }
    if (text === 'activity preparing-project' || text === 'activity indexing-project') {
      setWorking(text === 'activity indexing-project' ? 'Indexing project…' : 'Preparing project…');
      return;
    }
    if (text === 'activity reasoning-reset' || text.indexOf('activity reasoning-delta ') === 0) {
      if (!sess || !sess.nodes) return;
      if (text === 'activity reasoning-reset') sess.nodes.reasoningText = '';
      else {
        try {
          var reasoningDelta = JSON.parse(text.slice('activity reasoning-delta '.length));
          if (typeof reasoningDelta !== 'string') return;
          sess.nodes.reasoningText = (sess.nodes.reasoningText || '') + reasoningDelta;
          sess.nodes.reasoningText = sess.nodes.reasoningText.slice(-24000);
        } catch (e) { return; }
      }
      renderReasoningStream($('workingReasoning'), sess.nodes.reasoningText);
      if (text !== 'activity reasoning-reset') setWorking('Reasoning…');
      stickScroll(stream);
      return;
    }
    updateApproach(runId, ev);
    // The next assistant event starts a fresh activity group after the prior
    // one has settled. Do not split an in-flight parallel batch.
    if (sess && toolActivityBoundary(text)) sealToolActivityGroup(sess);
    if (text.indexOf('think') === 0 || text.indexOf('plan ') === 0 || text.indexOf('activity reasoning') === 0) mascotState('thinking');
    else if (text.indexOf('activity content') === 0 || text.indexOf('activity tool') === 0) mascotState('thinking');
    else if (text.indexOf('run write') === 0 || text.indexOf('run edit') === 0) mascotState('coding');
    else if (text.indexOf('run $') === 0 || text.indexOf('run ') === 0) mascotState('testing');
    else if (text.indexOf('evidence') === 0 && text.indexOf('PASS') >= 0) mascotState('celebrate');
    else if (text.indexOf('blocked') === 0 || text.indexOf('denied') === 0) mascotState('shield');
    else mascotPulse();

    if (sess && sess.chatish && (
      text.indexOf('run ') === 0 || text.indexOf('ok ') === 0 || text.indexOf('error ') === 0 ||
      text.indexOf('denied ') === 0 || text.indexOf('blocked ') === 0 || text.indexOf('out ') === 0 ||
      text.indexOf('meta ') === 0 || text.indexOf('checkpoint ') === 0 || text.indexOf('plan ') === 0 ||
      text.indexOf('criteria ') === 0 || text.indexOf('evidence ') === 0 || text.indexOf('hypothesis ') === 0 ||
      text.indexOf('context ') === 0 || text.indexOf('delegate ') === 0 || text.indexOf('subagent ') === 0
    )) return;

    function insert(el) {
      insertTimelineNode(sess, el, ev && ev.t);
    }

    if (text.indexOf('file ') === 0) {
      try {
        var fileMeta = JSON.parse(text.slice(5));
        if (fileMeta && fileMeta.replacesLongText) removeNarrationReplacedByFile(sess);
        recordRunFile(sess,fileMeta);
        if(fileMeta&&fileMeta.kind==='user')insert(sessionFileCard(fileMeta));
        else if(sess){var fileLink=sessionFilesLink(sess,runId);if(!fileLink.isConnected)insert(fileLink);}
        renderRunFiles(runId);
        stickScroll(stream);
      } catch (e) {
        // Ignore malformed metadata rather than rendering unsafe raw JSON.
      }
      return;
    }

    if (text.indexOf('tdelta ') === 0 || text.indexOf('thought ') === 0) {
      var chunk = text.indexOf('tdelta ') === 0 ? text.slice(7) : text.slice(8);
      if (sess && sess.chatish) {
        setWorking(null);
        if (!sess.nodes.abubble) {
          var ab = document.createElement('div');
          ab.className = 'abubble';
          ab.innerHTML = '<span class="who">Agent Gitu</span><span class="txt"></span>';
          appendLive(stream, ab);
          sess.nodes.abubble = ab;
        }
        queueStreamText(sess.nodes.abubble.querySelector('.txt'), chunk, sess.replaying);
        return;
      }
      // Never create the prose row for a whitespace-only opening chunk.
      // Providers (especially reasoning models) frequently lead with "\n" or
      // " " before real content; without this guard those empty deltas produce
      // a visible bullet row with no text.
      if (!sess.nodes.thought && !chunk.trim()) return;
      if (!sess.nodes.thought) {
        var t = document.createElement('div');
        // The model sometimes leaks its raw JSON action object into the
        // prose stream (truncated output retried mid-JSON). Normal mode
        // never renders it — not even collapsed: the leak is protocol
        // garbage, and the working indicator already says what matters.
        // Developer mode keeps the old collapsed technical row.
        if (JSON_LEAK_RE.test(chunk)) {
          if (!devMode()) { setWorking('Thinking…'); return; }
          t.className = 'tl-row tl-meta';
          t.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><details class="exec-details"><summary><b>Raw model output</b><span class="chev">\u25B8</span></summary><pre class="exec-pre"></pre></details></div>';
        } else {
          t.className = 'tl-row tl-note-row tl-stream-row';
          t.dataset.streamState = 'live';
          t.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><div class="stream-live" aria-hidden="true">Agent Gitu · writing</div><div class="stream-text"><span class="txt"></span><span class="caret"></span></div></div>';
        }
        insert(t);
        sess.nodes.thought = t;
        followActiveToolActivity(stream, sess);
      }
      var sink = sess.nodes.thought.querySelector('.exec-pre') || sess.nodes.thought.querySelector('.txt');
      queueStreamText(sink, chunk, sess.replaying);
      return;
    }
    if (text.indexOf('reason ') === 0) {
      // Internal reasoning traces never render for users — a narration row
      // reads "Checking the streaming handler", not the raw reason stream.
      // Developer mode still exposes the trace.
      if (!devMode()) return;
      if (sess && sess.chatish) return;
      if (!sess.nodes.thought) {
        var t3 = document.createElement('div');
        t3.className = 'tl-row tl-note-row';
        t3.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><span class="txt"></span><span class="caret"></span></div>';
        insert(t3);
        sess.nodes.thought = t3;
      }
      queueStreamText(sess.nodes.thought.querySelector('.txt'), text.slice(7), sess.replaying);
      return;
    }

    if (text.indexOf('say ') === 0) {
      if (sess.nodes.thought) flushStreamText(sess.nodes.thought.querySelector('.txt'));
      var prose = text.slice(4);
      if (!prose.trim()) { closeThought(runId); return; }
      if (sess && sess.chatish) {
        if (sess.nodes.abubble) {
          retireAbubble(sess);
        } else {
          var ab2 = document.createElement('div');
          ab2.className = 'abubble';
          ab2.innerHTML = '<span class="who">Agent Gitu</span><span class="txt"></span>';
          ab2.querySelector('.txt').textContent = prose;
          finalizeNarration(ab2);
          appendLive(stream, ab2);
          stickScroll(stream);
        }
        return;
      }
      if (sess.nodes.thought) {
        // A streaming row already exists — patch it to the authoritative final
        // text and close it. Never insert a second row; the streaming node IS
        // the narration node. This eliminates the "BOOM whole sentence"
        // teleport when the final prose diverges from the partial stream.
        var txt = sess.nodes.thought.querySelector('.txt');
        if (txt && txt.textContent !== prose) {
          txt.textContent = '';
          txt.appendChild(document.createTextNode(prose));
        }
      } else {
        // No streaming happened — insert a static row as before.
        var pp = document.createElement('div');
        pp.className = 'tl-row tl-note-row';
        pp.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><span class="txt">' + esc(prose) + '</span></div>';
        finalizeNarration(pp);
        insert(pp);
      }
      closeThought(runId);
      return;
    }
    if (text.indexOf('activity reasoning') === 0) { setWorking('Reasoning…'); return; }
    if (text.indexOf('activity content') === 0) {
      if (!sess || !sess.chatish) setWorking('Responding…');
      return;
    }
    if (text.indexOf('activity tool') === 0) {
      if (!sess || !sess.chatish) { closeThought(runId); setWorking('Preparing tool action…'); }
      return;
    }
    if (text.indexOf('think') === 0) { setWorking(publicThinkingStatus(text)); return; }
    if (text.indexOf('approval-required') === 0) { setWorking('Waiting for your approval…'); return; }
    if (text.indexOf('ask-user') === 0) { closeThought(runId); setWorking('Waiting for your answers…'); return; }
    if (text.indexOf('user-msg ') === 0) {
      var userText = text.slice(9);
      if (settlePendingUserMessage(runId, userText, null, true)) return;
      retireAbubble(sess); closeThought(runId); appendLive(stream, userBubble(userText, runId)); stickScroll(stream, true); return;
    }
    if (text.indexOf('queued ') === 0 || text.indexOf('stopped ') === 0 || text.indexOf('continue ') === 0) {
      var qm = document.createElement('div');
      qm.className = 'tl-row tl-meta';
      var qtag = text.split(' ')[0];
      var qrest = text.slice(text.indexOf(' ') + 1);
      var dashIdx = qrest.indexOf(' — ');
      if (dashIdx >= 0) qrest = qrest.slice(dashIdx + 3);
      qm.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><b>' + esc(qtag) + '</b> ' + esc(qrest) + '</div>';
      appendLive(stream, qm);
      return;
    }
    if (text.indexOf('parallel') === 0) {
      // Parallel executors emit all run events up front, then interleave each
      // completion. The one Tool activity disclosure below owns that batch;
      // a second "parallel" timeline row would duplicate the same event.
      closeThought(runId);
      sess.nodes.nextToolBatchHint = text.slice(9).trim();
      sess.nodes.parallelPending = true;
      sess.nodes.toolRows = sess.nodes.toolRows || [];
      setWorking('Running parallel tools…');
      return;
    }
    if (text.indexOf('lines ') === 0) {
      // "+12 lines" (legacy) and "+12 -3 lines" (current): the removal count is
      // part of what the user has to see, so it gets its own red counter.
      var counts = /\s+\+(\d+)(?:\s+-(\d+))?\s+lines.*$/i.exec(text);
      var lineHint = text.slice(6).replace(counts ? counts[0] : /\s+\+\d+\s+lines.*$/i, '').trim();
      var toolCard = findToolRow(sess, lineHint, true);
      if (toolCard && !toolCard.querySelector('.lines')) {
        var addedTarget = counts ? parseInt(counts[1], 10) || 0 : 0;
        var removedTarget = counts && counts[2] ? parseInt(counts[2], 10) || 0 : 0;
        var badge = document.createElement('span');
        badge.className = 'lines';
        var plus = document.createElement('span');
        plus.textContent = '+0';
        var minus = document.createElement('span');
        minus.className = 'del';
        badge.appendChild(plus);
        badge.appendChild(minus);
        var cmdRow = toolCard.querySelector('.tl-cmd');
        cmdRow.insertBefore(badge, cmdRow.querySelector('.st'));
        var startT = Date.now();
        var anim = setInterval(function () {
          var pr = Math.min(1, (Date.now() - startT) / 700);
          plus.textContent = '+' + Math.round(addedTarget * pr);
          minus.textContent = removedTarget ? '-' + Math.round(removedTarget * pr) : '';
          if (pr >= 1) clearInterval(anim);
        }, 40);
      }
      return;
    }

    // Token telemetry arrives once per run as "telemetry <renderTelemetry()>".
    // Normal users get one quiet human line ("8 tool actions · 87K tokens");
    // the full counter grid (compactions, planning calls, wasted calls, …)
    // is Developer-mode detail.
    if (text.indexOf('telemetry ') === 0) {
      closeThought(runId);
      var trow = document.createElement('div');
      trow.className = 'tl-row tl-meta';
      if (!devMode()) {
        var mTools = /toolCalls=(\d+)/.exec(text);
        var mIn = /input=(\d+)/.exec(text);
        var tok = mIn ? humanTokenCount(parseInt(mIn[1], 10)) : '';
        var bits = [];
        if (mTools) bits.push(mTools[1] + ' tool actions');
        if (tok) bits.push(tok + ' tokens used');
        trow.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><b>Run stats</b> ' + esc(bits.join(' · ') || 'completed') + '</div>';
      } else {
      var LABELS = { calls: 'Calls', toolCalls: 'Tool calls', compactions: 'Compactions',
        planning: 'Planning calls', execution: 'Execution calls', screenshots: 'Screenshots',
        wasted: 'Wasted calls', input: 'Input tokens', cached: 'Cached tokens', output: 'Output tokens' };
      var pairs = [];
      var kre = /([~\w.]+)=([^\s()]+)/g, km;
      while ((km = kre.exec(text))) {
        if (km[1] === 'telemetry') continue;
        pairs.push([km[1], km[2]]);
      }
      var sum = '';
      var mcalls = /calls=(\d+)/.exec(text);
      if (mcalls) sum = mcalls[1] + ' model calls';
      var thtml = '<details class="exec-details"><summary><b>Execution details</b>' +
        (sum ? ' <span class="exec-sum">' + esc(sum) + '</span>' : '') +
        '<span class="chev">\u25B8</span></summary><div class="exec-grid">';
      for (var pi = 0; pi < pairs.length; pi++) {
        thtml += '<span class="k">' + esc(LABELS[pairs[pi][0]] || pairs[pi][0]) + '</span>' +
                 '<span class="v">' + esc(pairs[pi][1]) + '</span>';
      }
      thtml += '</div></details>';
      trow.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body">' + thtml + '</div>';
      }
      appendLive(stream, trow);
      stickScroll(stream);
      return;
    }

    // Consecutive recovery rows (the same discovery strategy repeating across
    // strategies/attempts) collapse into one row with a repeat chip — the
    // recovery ladder is noise-dense by design, but rarely worth N lines.
    // Normal users get ONE calm human line with no ladder detail or counts;
    // the full ladder is Developer-mode diagnostic.
    if (text.indexOf('recovery ') === 0) {
      closeThought(runId);
      if (!devMode()) {
        if (sess.nodes.lastRecovery && sess.nodes.lastRecovery.el && sess.nodes.lastRecovery.el.isConnected) {
          stickScroll(stream);
          return;
        }
        var rHuman = document.createElement('div');
        rHuman.className = 'tl-row tl-meta';
        rHuman.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body">Retrying the model&hellip;</div>';
        sess.nodes.lastRecovery = { key: 'human', count: 1, el: rHuman };
        insert(rHuman);
        stickScroll(stream);
        return;
      }
      var rKey = text.slice(9).split(' — ')[0].split(':')[0].trim();
      var lastR = sess.nodes.lastRecovery;
      if (lastR && lastR.key === rKey && lastR.el && lastR.el.isConnected) {
        lastR.count++;
        var rChip = lastR.el.querySelector('.repeat-count');
        if (rChip) rChip.textContent = '×' + lastR.count;
        stickScroll(stream);
        return;
      }
      var rRow = document.createElement('div');
      rRow.className = 'tl-row tl-meta';
      rRow.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><b>recovery</b> ' + esc(text.slice(9).trim()) + ' <span class="chip warn repeat-count">×1</span></div>';
      sess.nodes.lastRecovery = { key: rKey, count: 1, el: rRow };
      insert(rRow);
      stickScroll(stream);
      return;
    }

    // A model retry is the moment Gitu noticed a failure and is actively
    // correcting it — the run is NOT frozen and NOT repeating the same
    // mistake. That distinction is trust-critical, so it renders for normal
    // users from the typed companion (attempt, maxAttempts, the real reason)
    // whenever one exists. The classifier has attached it to recover rows
    // all along; old restored rows without one still fall through to the
    // allowlist fallback below, unchanged. Developer mode keeps the raw
    // line: this arm is the calm human rendering, not the diagnostic.
    // Consecutive retries of the same cause collapse in place (the same
    // ×N convention the refusal card and the recovery ladder use).
    if (text.indexOf('recover ') === 0) {
      closeThought(runId);
      if (devMode()) {
        // Developer mode keeps the raw diagnostic line: this arm is the calm
        // human rendering, not the diagnostic. Fall through to the allowlist
        // view below instead of returning.
        sess.nodes.lastRecover = null;
      } else {
      var recTyped = ev.typed && ev.typed.type === 'recovering' ? ev.typed : null;
      // Same-cause collapse: the cause is the structured message when the
      // companion has one, else the prose detail. A DIFFERENT cause (or any
      // other row drawn in between — insert() clears lastRecover) starts a
      // new card, so the count can only ever mean consecutive.
      var recBody = text.replace(/^recover\s+/, '');
      var recCause = recTyped && recTyped.message ? String(recTyped.message) : recBody;
      var lastRec = sess.nodes.lastRecover;
      if (lastRec && lastRec.el && lastRec.el.isConnected && lastRec.cause === recCause) {
        lastRec.count++;
        var recChip = lastRec.el.querySelector('.repeat-count');
        if (recChip) recChip.textContent = '×' + lastRec.count;
        // Retries escalate: 1/3 then 2/3 changes the numbers even when the
        // cause is identical. Without a companion the prose may not carry
        // counts either; the card then says only "retrying".
        var recUp = lastRec.el.querySelector('.recover-nums');
        if (recUp) {
          var recA = recTyped && typeof recTyped.attempt === 'number' ? recTyped.attempt : (lastRec.attempt || 1) + 1;
          var recM = recTyped && typeof recTyped.maxAttempts === 'number' ? recTyped.maxAttempts : lastRec.max;
          recUp.textContent = recM ? 'retry ' + recA + ' of ' + recM : '';
          lastRec.attempt = recA; lastRec.max = recM || 0;
        }
        stickScroll(stream);
        return;
      }
      var recEl = document.createElement('div');
      recEl.className = 'tl-row tl-meta';
      var recHtml = '<span class="tl-dot dot-note"></span><div class="tl-body">' +
        '<span class="chip warn">\u21BB</span> <b>recovering</b>';
      if (recTyped && typeof recTyped.attempt === 'number' && typeof recTyped.maxAttempts === 'number') {
        recHtml += ' <span class="recover-nums">retry ' + recTyped.attempt + ' of ' + recTyped.maxAttempts + '</span>';
      } else if (recTyped && typeof recTyped.attempt === 'number') {
        recHtml += ' <span class="recover-nums">retry ' + recTyped.attempt + '</span>';
      }
      var recDetail = recTyped && recTyped.message ? String(recTyped.message) : recBody;
      if (recDetail) recHtml += '<div class="recover-detail">' + esc(recDetail) + '</div>';
      recHtml += ' <span class="chip warn repeat-count">\u00D71</span>';
      recEl.innerHTML = recHtml;
      // Set after the insert, which has already cleared lastRecover as
      // "something else was drawn in between" — the same ordering the
      // refused-action card documents.
      insert(recEl);
      sess.nodes.lastRecover = { cause: recCause, count: 1, el: recEl, attempt: recTyped && typeof recTyped.attempt === 'number' ? recTyped.attempt : 1, max: recTyped && typeof recTyped.maxAttempts === 'number' ? recTyped.maxAttempts : 0 };
      setWorking('Recovering' + (recDetail ? ' — ' + shortText(recDetail, 90) : '') + '…');
      stickScroll(stream);
      return;
      }
    }

    // Machine bookkeeping (diff snapshots, specialist checkpoints) accumulates
    // into ONE collapsed group instead of narrating over the agent's work —
    // and is Developer-only: normal users never see internal activity.
    if (text.indexOf('report ') === 0 || text.indexOf('checkpoint ') === 0) {
      closeThought(runId);
      if (!devMode()) return;
      if (!sess.nodes.internal) {
        var ig = document.createElement('div');
        ig.className = 'tl-row tl-meta';
        ig.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><details class="exec-details"><summary><b>Internal activity</b><span class="exec-sum internal-count">1 entry</span><span class="chev">\u25B8</span></summary><pre class="exec-pre"></pre></details></div>';
        sess.nodes.internal = ig;
        sess.nodes.internalCount = 0;
        insert(ig);
      }
      sess.nodes.internalCount++;
      var igCount = sess.nodes.internal.querySelector('.internal-count');
      if (igCount) igCount.textContent = sess.nodes.internalCount + (sess.nodes.internalCount === 1 ? ' entry' : ' entries');
      var igSink = sess.nodes.internal.querySelector('.exec-pre');
      if (igSink) igSink.appendChild(document.createTextNode(text + '\n'));
      stickScroll(stream);
      return;
    }

    if (text.indexOf('browseshot ') === 0) {
      var shot = document.createElement('div');
      shot.className = 'shotmsg browser-shot';
      shot.innerHTML = '<div class="browser-chat-highlight"><b>Visual check</b><span>Browser screenshot</span></div><img alt="browser screenshot">';
      shot.querySelector('img').src = text.slice(11);
      appendLive(stream, shot);
      stickScroll(stream);
      return;
    }

    closeThought(runId);
    var tag = text.split(' ')[0];
    var body = text.slice(tag.length).trim();

    // End-of-run status echo from the server ("run finished: failed/blocked/...").
    // The "run " prefix would otherwise render as a fake tool card with an
    // empty output disclosure. Status is already shown by the header chip,
    // the "done" meta row, the error card and the summary card.
    if (text.indexOf('run finished: ') === 0) return;

    if (tag === 'run') {
      var kind = toolKind(body);
      var summary = splitSummary(body);
      var reason = splitReason(body);
      var group = ensureToolActivityGroup(sess, insert);
      sess.nodes.nextToolBatchHint = '';
      var row = document.createElement('div');
      row.className = 'tool-call' + (kind === 'browser' ? ' tl-browser' : '');
      row.dataset.toolKind = kind;
      row.innerHTML =
        '<button type="button" class="tl-cmd tool-call-head" aria-expanded="false">' +
          '<span class="tool-kind" aria-hidden="true">' + ({ shell: '&gt;_', read: '≡', edit: '±', search: '⌕', list: '▤', browser: '◎', tool: '◇' }[kind] || '◇') + '</span>' +
          '<span class="cmd">' + esc(humanToolSummary(kind, summary)) + '</span>' +
          (reason ? '<span class="why">— ' + esc(reason) + '</span>' : '') +
          '<span class="st st-run">Running</span><span class="tool-duration">0s</span><span class="tool-chevron" aria-hidden="true">›</span>' +
        '</button>' +
        '<details class="tl-out"><summary><span class="output-label">Output · waiting for result</span><button type="button" class="tool-btn-copy" title="Copy output">' + icon('copy') + ' Copy</button></summary>' +
          '<code class="tool-command">' + esc(summary) + '</code>' +
          (reason ? '<p class="tool-purpose">' + esc(reason) + '</p>' : '') +
          '<pre>Waiting for tool output…</pre></details>';
      var commandButton = row.querySelector('.tool-call-head');
      var outputDetails = row.querySelector('.tl-out');
      commandButton.title = summary + (reason ? '\n' + reason : '');
      outputDetails.id = 'tool-output-' + runId + '-' + ev.i;
      commandButton.setAttribute('aria-controls', outputDetails.id);
      commandButton.onclick = function (e) {
        e.stopPropagation();
        outputDetails.open = !outputDetails.open;
        commandButton.setAttribute('aria-expanded', String(outputDetails.open));
      };
      outputDetails.addEventListener('toggle', function () {
        commandButton.setAttribute('aria-expanded', String(outputDetails.open));
      });

      var copyBtn = row.querySelector('.tool-btn-copy');
      setupCopyButton(copyBtn, function () {
        var pre = row.querySelector('pre');
        return (pre && pre.textContent) || summary;
      });

      var list = group.el.querySelector('.tool-group-list');
      if (list) list.appendChild(row);
      sess.nodes.lastTool = row;
      sess.nodes.toolRows = sess.nodes.toolRows || [];
      row.dataset.toolKey = summary;
      row.dataset.toolReason = reason;
      row.dataset.toolState = 'working';
      row.dataset.startedAt = String(Date.parse(ev.t) || Date.now());
      sess.nodes.toolRows.push(row);
      refreshToolActivityGroup(group.el);
      var wt = workingTextFor(text);
      if (wt) setWorking(wt);
      stickScroll(stream);
      return;
    }
    if (tag === 'ok' || tag === 'error' || tag === 'denied' || tag === 'blocked') {
      var tool = finishToolRow(sess, tag, body);
      // No duration means this was a preflight denial/schema error, for which
      // no run card exists.  Do not mutate an unrelated active card.
      if (!tool) return;
      setWorking(activeToolRows(sess).length ? 'Running parallel tools…' : 'Thinking…');
      return;
    }
    if (tag === 'out') {
      // out follows its own terminal event, so prefer that correlated row;
      // lastTool remains a compatibility fallback for old event streams.
      var t2 = sess.nodes.lastOutputTool || sess.nodes.lastTool || findToolRow(sess, '', true);
      if (t2) {
        var detailsEl = t2.querySelector('details');
        var preEl = t2.querySelector('pre');
        var cleanOut = body.replace(/ ⏎ /g, '\n');
        setupOutputFolding(detailsEl, preEl, cleanOut);
        decorateToolDiff(t2, preEl, cleanOut);
        var outputLabel = t2.querySelector('.output-label');
        var outputLines = cleanOut ? cleanOut.split('\n').length : 0;
        if (outputLabel) outputLabel.textContent = 'Output · ' + outputLines + (outputLines === 1 ? ' line' : ' lines');
        stickScroll(stream);
      }
      return;
    }
    // Intake burst → one quiet silver line. Errors (fatal/blocked/denied)
    // and agent output are never grouped — they stay prominent in the stream.
    if (INTAKE_TAGS[tag]) {
      upsertIntakeLine(runId, insert, tag, body);
      return;
    }
    // Specialist lifecycle + activity → one living card per job (never a pile of lines).
    var mSpec = SPEC_LIFECYCLE.exec(text);
    if (mSpec) {
      upsertSpecialistCard(runId, insert, mSpec[1], mSpec[2], mSpec[3], mSpec[4]);
      var wt3 = workingTextFor(text);
      if (wt3) setWorking(wt3);
      return;
    }
    if (text.indexOf('subagent ') === 0 && attachSpecialistActivity(runId, text)) {
      return;
    }
    var meta = document.createElement('div');
    if (tag === 'evidence') {
      // The typed companion carries the real verdict — a substring check for
      // PASS could misread a passing line whose label merely contains FAIL — plus the
      // id and kind as separate fields. The prose parse stays for rows without a
      // companion: old databases, or a row the classifier demoted to log.
      var evTyped = ev.typed && ev.typed.type === 'evidence_recorded' ? ev.typed : null;
      var isPass = evTyped ? evTyped.passed === true : body.indexOf('PASS') >= 0;
      var evBody = evTyped
        ? (evTyped.kind ? evTyped.kind + ' ' : '') + String(evTyped.evidenceId || '') + (isPass ? ' passed' : ' failed')
        : body;
      meta.className = 'tl-row tl-ev';
      meta.innerHTML = '<span class="tl-dot dot-ev"></span><div class="tl-body"><span class="ev-pill ' + (isPass ? 'pass' : 'fail') + '">' + (isPass ? '&#10003; ' : '&#10005; ') + esc(evBody) + '</span></div>';
    } else if (tag === 'plan') {
      // Same companion rule: the count and the follow-up distinction are
      // structured on the event; the regex on the line is the fallback.
      var planTyped = ev.typed && ev.typed.type === 'plan_created' ? ev.typed : null;
      var followUp = planTyped ? false : / follow-up steps$/.test(body);
      var stepCount = planTyped ? planTyped.steps : parseInt(body, 10) || 0;
      meta.className = 'tl-row tl-meta';
      meta.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><b>plan</b> ' + esc(stepCount + (followUp ? ' follow-up' : '') + (stepCount === 1 ? ' step' : ' steps')) + ' — review it, then approve to build</div>';
    } else if (tag === 'subagent') {
      meta.className = 'tl-row tl-meta subagent-note';
      meta.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><b>specialist</b> ' + esc(body) + '</div>';
    } else if (tag === 'done') {
      if (!devMode()) return;
      // End-of-run echo: show the conversational outcome, not the raw
      // CHANGES dump (the full report card below carries the detail).
      var dDash = body.indexOf(' — ');
      var dParsed = parseOutcome(dDash >= 0 ? body.slice(dDash + 3) : body);
      meta.className = 'tl-row tl-meta';
      meta.innerHTML = '<span class="tl-dot dot-ok"></span><div class="tl-body"><b>🎉 ' + esc(dDash >= 0 ? body.slice(0, dDash) : 'done') + '</b> — ' + esc(shortText(reportLede(dParsed.lede), 220)) + '</div>';
    } else if (tag === 'problem' || tag === 'resolved' || tag === 'note' || tag === 'hypothesis' || tag === 'step' || tag === 'todo' || tag === 'decision' || tag === 'replan') {
      // Designed narration rows: the agent's story while it works. These are
      // runtime sentences (already user-facing), so normal users see them —
      // unlike the dev-only fallback below.
      var storyLabels = { problem: 'recovery', resolved: 'recovery', note: 'working', hypothesis: 'theory', step: 'step', todo: 'todo', decision: 'decision', replan: 'replan' };
      var storyTone = tag === 'problem' ? 'dot-bad' : (tag === 'resolved' || tag === 'step' || tag === 'todo') ? 'dot-ok' : 'dot-note';
      meta.className = 'tl-row tl-meta';
      meta.innerHTML = '<span class="tl-dot ' + storyTone + '"></span><div class="tl-body"><b>' + esc(storyLabels[tag]) + '</b> ' + esc(body) + '</div>';
    } else if (tag === 'warn') {
      // warn rows are model-health diagnostics (reasoning-only replies,
      // malformed streaks). Actionable failures surface through the error
      // card, so normal users never see them; Developer mode does.
      if (!devMode()) { closeThought(runId); return; }
      var warnKey = body.replace(/\s*\(streak \d+\)/i, '').replace(/^\d+ replies in a row /i, 'replies in a row ').trim();
      var previousWarn = sess.nodes.lastWarn;
      if (previousWarn && previousWarn.el && previousWarn.el.isConnected && previousWarn.key === warnKey) {
        previousWarn.count++;
        var repeat = previousWarn.el.querySelector('.repeat-count');
        if (repeat) repeat.textContent = '×' + previousWarn.count;
        stickScroll(stream);
        return;
      }
      meta.className = 'tl-row tl-meta';
      meta.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><b>warn</b> ' + esc(warnKey) + ' <span class="chip warn repeat-count">×1</span></div>';
      sess.nodes.lastWarn = { key: warnKey, count: 1, el: meta };
    } else {
      sess.nodes.lastWarn = null;
      sess.nodes.lastRecovery = null;
      sess.nodes.lastRecover = null;
      // ARCHITECTURAL RULE — the timeline is allowlisted. The tags above are
      // explicitly designed UI; ANY other (future, internal) event tag is
      // hidden for normal users and shown only in Developer mode. A newly
      // added server event can never accidentally become user-facing.
      if (!devMode()) { closeThought(runId); return; }
      meta.className = 'tl-row tl-meta';
      meta.innerHTML = '<span class="tl-dot dot-note"></span><div class="tl-body"><b>' + esc(tag) + '</b> ' + esc(body) + '</div>';
    }
    insert(meta);
    var wt2 = workingTextFor(text);
    if (wt2) setWorking(wt2);
    stickScroll(stream);
  }

  function updateProgress(L) {
    var p = $('progress');
    if (!p || !L) return;
    var done = 0;
    L.plan.forEach(function (s) { if (s.status === 'done') done++; });
    var total = L.plan.length;
    if (L.mode === 'agent' && !total) { p.style.display = 'none'; return; }
    p.style.display = 'flex';
    $('progText').textContent = total ? 'Plan step ' + done + ' of ' + total : 'Planning…';
    $('progMeta').textContent = L.actions.length + ' actions · ' + L.evidence.length + ' checks';
    var width = Math.min(100, Math.round((done / Math.max(1, total)) * 100));
    $('progFill').style.width = width + '%';
  }

  // Flatten plan steps into the small, actionable checklist shown immediately
  // above the composer. A step with subtasks contributes its subtasks; a
  // simple step contributes itself. Only the first unfinished subtask of the
  // active step is marked as "working", so the list always has one clear next
  // item even when the ledger has not updated individual todo statuses yet.
  function composerTodoItems(ledger) {
    if (!ledger || !Array.isArray(ledger.plan)) return [];
    var items = [];
    ledger.plan.forEach(function (step) {
      if (!step) return;
      var stepText = String(step.description || '').trim();
      var stepStatus = String(step.status || 'pending');
      var todos = Array.isArray(step.subtasks) ? step.subtasks : [];
      if (!todos.length) {
        if (stepText) items.push({ text: stepText, parent: '', status: stepStatus, index: items.length });
        return;
      }
      var firstOpen = -1;
      todos.forEach(function (todo, todoIndex) {
        var done = typeof todo === 'string' ? false : Boolean(todo && todo.done);
        if (firstOpen === -1 && !done) firstOpen = todoIndex;
      });
      todos.forEach(function (todo, todoIndex) {
        var text = typeof todo === 'string' ? todo : String(todo && todo.text || '');
        text = String(text || '').trim();
        if (!text) return;
        var done = stepStatus === 'done' || (typeof todo !== 'string' && Boolean(todo && todo.done));
        var status = done ? 'done' : stepStatus;
        if (status === 'in_progress' && todoIndex !== firstOpen) status = 'pending';
        items.push({ text: text, parent: stepText, status: status, index: items.length });
      });
    });
    return items;
  }

  function composerTodoStatus(status) {
    if (status === 'in_progress') return { rank: 0, label: 'Working', className: 'active' };
    if (status === 'blocked') return { rank: 1, label: 'Blocked', className: 'blocked' };
    if (status === 'failed') return { rank: 1, label: 'Needs retry', className: 'failed' };
    if (status === 'done') return { rank: 3, label: 'Done', className: 'done' };
    return { rank: 2, label: 'Pending', className: 'pending' };
  }

  function renderComposerTodos(runId) {
    if (S.active !== runId) return;
    var panel = $('composerTodos');
    var sess = S.sessions[runId];
    if (!panel || !sess) return;
    if (panel.dataset.runId !== runId) {
      panel.dataset.runId = runId;
      panel.open = Boolean(sess.composerTodosOpen);
      panel.ontoggle = function () {
        var owner = S.sessions[this.dataset.runId];
        if (owner) owner.composerTodosOpen = this.open;
      };
      delete panel.dataset.signature;
    }
    var allItems = composerTodoItems(sess.ledger);
    if (!allItems.length) {
      panel.hidden = true;
      panel.innerHTML = '';
      delete panel.dataset.signature;
      return;
    }
    var currentItems = allItems.filter(function (item) { return item.status !== 'done'; }).sort(function (a, b) {
      var ar = composerTodoStatus(a.status).rank;
      var br = composerTodoStatus(b.status).rank;
      return ar - br || a.index - b.index;
    });
    var done = allItems.filter(function (item) { return item.status === 'done'; }).length;
    var signature = allItems.map(function (item) { return [item.text, item.parent, item.status].join('\u0001'); }).join('\u0002');
    if (!panel.hidden && panel.dataset.signature === signature) return;
    panel.hidden = false;
    panel.dataset.signature = signature;
    var current = currentItems.length ? currentItems[0].text : 'Checklist complete';
    var count = done + '/' + allItems.length + ' done';
    panel.innerHTML = '<summary class="composer-todos-head"><span class="composer-todos-title">To-do</span><span class="composer-todos-current" title="' + esc(current) + '">' + esc(current) + '</span><span class="composer-todos-count">' + esc(count) + '</span></summary><ol class="composer-todo-list" aria-label="Task checklist">' +
      allItems.map(function (item) {
        var meta = composerTodoStatus(item.status);
        var parent = item.parent && item.parent !== item.text
          ? '<span class="composer-todo-parent" title="' + esc(item.parent) + '"> · ' + esc(item.parent) + '</span>'
          : '';
        var mark = meta.className === 'done' ? '&#10003;' : (meta.className === 'blocked' || meta.className === 'failed' ? '!' : '');
        return '<li class="composer-todo ' + meta.className + '"><span class="composer-todo-mark">' + mark + '</span><span class="composer-todo-text" title="' + esc(item.text) + '">' + esc(item.text) + parent + '</span><span class="composer-todo-state">' + esc(meta.label) + '</span></li>';
      }).join('') + '</ol>';
  }

  // Classify a raw provider/runtime error into a human headline plus a
  // recovery hint. Task details show the headline and retain the raw error
  // in a copyable failure card.
  function failureSummary(error) {
    var text = String(error || '').replace(/\s+/g, ' ').trim();
    if (!text) return { title: 'The run failed', hint: '', canSwitchModel: true };
    if (/Verification could not be completed after two correction opportunities/i.test(text)) {
      return { title: 'Verification stopped this run', hint: 'Review the checks in Technical evidence. Correct a failing check or command, then continue this session to verify again.', canSwitchModel: false };
    }
    if (/Work paused because/i.test(text)) {
      return { title: 'Work paused after no new progress', hint: 'Completed work is saved. Review the last action and continue with a different approach or additional information.', canSwitchModel: false };
    }
    if (/ChatGPT subscription runtime could not start|ChatGPT subscription request failed:\s*spawn\s+(?:EFTYPE|ENOENT|EACCES|EPERM)/i.test(text)) {
      return { title: 'The local Codex runtime could not start', hint: 'Restart Agent Gitu; if it persists, repair or reinstall Agent Gitu (or update Codex), then retry. Changing models will not fix this runtime error.', canSwitchModel: false };
    }
    if (/usage (?:limit|cap)|quota (?:exceeded|exhausted)|insufficient[_ -]quota|purchase more credits|no credits|insufficient balance|\bbilling\b|\b402\b/i.test(text)) {
      var reset = /(?:try again|resets?)\s+(at|in)\s+([^.;,)]+)/i.exec(text);
      var title = /chatgpt/i.test(text) ? 'ChatGPT plan usage limit reached' : 'The selected model ran out of quota or credits';
      if (reset) title += ' — try again ' + reset[1].toLowerCase() + ' ' + reset[2].trim();
      return { title: title, hint: 'Switch models to retry now, or wait for the quota to reset. Your task and history are preserved.', canSwitchModel: true };
    }
    if (/\b401\b|invalid api key|incorrect api key|unauthorized|authentication failed/i.test(text)) {
      return { title: 'The provider rejected its API key', hint: 'Check the key in provider settings, then retry. Your task and history are preserved.', canSwitchModel: true };
    }
    if (/\b429\b|rate limit|too many requests/i.test(text)) {
      return { title: 'The provider rate-limited the request', hint: 'Wait a moment and retry, or switch to another model. Your task and history are preserved.', canSwitchModel: true };
    }
    if (/fetch failed|econnrefused|enotfound|etimedout|econnreset|socket hang up|network error|stream (?:disconnected|ended|closed)/i.test(text)) {
      return { title: 'Could not reach the model provider', hint: 'Check your connection and retry. Your task and history are preserved.', canSwitchModel: true };
    }
    return { title: shortText(text, 140), hint: 'Your task and history are preserved — pick an available model in the composer and send a message to retry.', canSwitchModel: true };
  }

  function pollRun(runId) {
    if (S.active !== runId) return;
    api('/api/runs/' + runId).then(function (session) {
      var sess = S.sessions[runId];
      if (!sess || S.active !== runId) return;
      S.pollFailures = 0;
      retainUsageEstimate(sess, session);
      sess.session = session;
      sess.taggedFolders = session.taggedFolders || [];
      sess.writableFolders = session.writableFolders || [];
      renderTaggedFolders(runId);
      renderContextCard(runId);
      // A resumed run replays the whole history over SSE, re-creating tool
      // cards from earlier interrupted runs in the "working" state — those
      // suppress the thinking/reasoning/responding indicator for the entire
      // run. Keep sweeping anything that predates this run's start (5s clock-
      // skew margin); the run's own live tool cards are left alone.
      if (sess.runStartedAtMs) interruptWorkingToolRows(sess, sess.runStartedAtMs - 5000);
      // On opening a persisted task, place its model in the composer. That
      // makes continuing it stable; a later picker change is deliberate and
      // is sent as a one-session model override.
      // EXCEPT when the last attempt failed on billing: yanking the picker
      // back to the dead paid model would silently eat the user's free-model
      // recovery — leave the composer alone so their selection stands.
      var billingFail = !!(session.error && /(401|no credits|insufficient balance|billing|usage (?:limit|cap)|quota (?:exceeded|exhausted)|insufficient[_ -]quota|purchase more credits)/i.test(session.error));
      if (!sess.modelSynced && !sess.modelOverride && session.provider && session.model && !billingFail) {
        var sessionModel = session.provider + '::' + session.model;
        if (modelInfo(sessionModel)) {
          S.sel.model = sessionModel;
          var picker = $('model');
          if (picker) picker.value = sessionModel;
          syncModelLabel();
          updateAttachState();
          updateModelMeta();
        }
        sess.modelSynced = true;
      }
      // Session mode is durable. Never infer chat mode from an empty ledger:
      // a task can fail before it has planned anything and still be a task.
      sess.chatish = session.mode === 'chat';
      settleApproach(sess, session);
      renderTopbar();
      renderApprovals(runId, session);
      renderPlanReview(runId, session);
      renderQuestions(runId, session);
      renderConnectionRequest(runId, session);
      renderErrorCard(runId, session);
      var summaryKey = session.report && JSON.stringify([session.finishedAt, session.report]);
      if (session.status !== 'running' && session.report && sess.summaryShown !== summaryKey) {
        appendSummary(runId, session);
        sess.summaryShown = summaryKey;
      }
      if (session.status === 'running') {
        sess.justOpened = false;
        if (!S.es) {
          connect(runId);
          S.poll = setInterval(function () { pollRun(runId); }, 1500);
        }
      }
      if (session.taskId) {
        api('/api/tasks/' + session.taskId).then(function (ledger) {
          var s2 = S.sessions[runId];
          if (s2 && S.active === runId) {
            s2.ledger = ledger;
            renderRunSide(runId);
            renderContextCard(runId);
            renderComposerTodos(runId);
            if (s2.chatish) { var pp = $('progress'); if (pp) pp.style.display = 'none'; } else updateProgress(ledger);
          }
        }).catch(function () {});
      } else renderRunSide(runId);
      if (session.status === 'waiting_for_model') {
        interruptWorkingToolRows(sess, undefined);
        var retryAt = session.modelRecovery && session.modelRecovery.nextRetryAt;
        var retrySeconds = retryAt ? Math.max(0, Math.ceil((Date.parse(retryAt) - Date.now()) / 1000)) : 0;
        setWorking('Waiting for the model — retrying automatically' + (retrySeconds ? ' in ' + retrySeconds + 's' : '') + '…');
        updateSendState();
        renderSidebar();
      } else if (session.status !== 'running') {
        retireAbubble(sess);
        closeThought(runId);
        interruptWorkingToolRows(sess, undefined);
        setWorking(null);
        if (S.es && sess.historyReady) { try { S.es.close(); } catch (e) {} S.es = null; }
        S.reconnecting = false;
        if (S.poll) { clearInterval(S.poll); S.poll = null; }
        renderSidebar();
      }
    }).catch(function () {
      // Silent network death used to leave the spinner forever. Count and
      // surface it; SSE onerror handles the visible reconnect state.
      S.pollFailures = (S.pollFailures || 0) + 1;
      if (S.pollFailures === 3) toast('Connection issues — retrying…', true);
    });
  }

  // Keep a stopped run discoverable without echoing the full provider error
  // into the conversation. Details contains the actionable error and retry
  // guidance; the stream only needs a quiet state marker.
  function renderErrorCard(runId, session) {
    var stream = $('stream');
    var sess = S.sessions[runId];
    if (!stream || !sess) return;
    var key = session && session.error ? String(session.error) : '';
    var existing = stream.querySelector('.run-stop-note');
    if (!key || session.status === 'running' || session.status === 'waiting_for_model') {
      if (existing) existing.remove();
      sess.errShownKey = '';
      return;
    }
    if (sess.errShownKey === key && existing) return;
    if (existing) existing.remove();
    sess.errShownKey = key;
    var div = document.createElement('div');
    div.className = 'run-stop-note';
    div.textContent = 'Run stopped — see Task details in the left sidebar to review and retry.';
    var w = $('working');
    if (w) stream.insertBefore(div, w); else stream.appendChild(div);
    stickScroll(stream, true);
  }

  // A live frame and the polled session view are two views of the same pending
  // request. They are merged on the runtime request id, so the frame renders the
  // card immediately and the poll catching up neither duplicates it (the render
  // key is remembered) nor removes it.
  function pendingApprovalsFor(sess, session) {
    var merged = {};
    var typed = sess.typedApprovals || {};
    Object.keys(typed).forEach(function (id) { merged[id] = typed[id]; });
    ((session && session.pendingApprovals) || []).forEach(function (a) { if (!merged[a.id]) merged[a.id] = a; });
    // A resolution frame settles the request at once; the mirror may still list
    // it for another poll interval, and a card the user can still click after
    // another surface answered is exactly the stale gate this removes.
    var settled = sess.settledGates || {};
    Object.keys(settled).forEach(function (id) { delete merged[id]; });
    return Object.keys(merged).map(function (id) { return merged[id]; });
  }

  // The gates that hold one request at a time merge on the same terms: the live
  // frame wins, the view is the fallback, and a request a frame already settled
  // is not resurrected by a mirror that still lists it.
  function pendingGateFor(typed, settled, view) {
    if (typed) return typed;
    if (view && settled[view.id]) return null;
    return view || null;
  }

  function pendingPlanReviewFor(sess, session) {
    return pendingGateFor(sess.typedPlanReview || null, sess.settledGates || {}, session && session.pendingPlanReview);
  }

  function pendingQuestionsFor(sess, session) {
    return pendingGateFor(sess.typedQuestions || null, sess.settledGates || {}, session && session.pendingQuestions);
  }

  // The structured questions when the emitter supplied them. A frame that only
  // carried the text projection still renders, with nothing to offer as options.
  function questionDetails(typed) {
    if (typed.details && typed.details.length) return typed.details;
    return (typed.questions || []).map(function (text) { return { question: text, options: [] }; });
  }

  // Native frames for the gate families a card renders, plus the command
  // lifecycle. Every gate action a card offers posts the request id it was
  // rendered for — never "whatever is pending now" — so a second surface
  // (Cowork, the Chief of Staff) answering first cannot make this card resolve
  // a different request. Frames marked "restored" are reconstructed from the
  // store after a restart and are read as history, not as pending work.
  function handleTypedFrame(runId, frame) {
    var sess = S.sessions[runId];
    var typed = frame && frame.typed;
    if (!sess || !typed) return;
    // Commands are display-only: the prose run row already built their card
    // (it carries the reason text, which the typed start does not), so the
    // start frame is a no-op and the finish frame only contributes the exit
    // code fact prose cannot express.
    if (typed.type === 'command_started') return;
    if (typed.type === 'command_finished') { applyCommandFinish(runId, typed); return; }
  // A file change and the model's reasoning are both display-only facts the
  // prose stream cannot carry: the diff body (with its removals) and the trace
  // itself. Handled before the gate section so a restored frame renders too.
  if (typed.type === 'file_changed') { applyFileChange(runId, typed); return; }
  if (typed.type === 'reasoning') { applyReasoning(runId, typed); return; }
    // A refused action is a fact about the run, not a request: it renders from a
    // restored frame too, which is why it is handled before the history guard.
    if (typed.type === 'policy_denied' || typed.type === 'operation_blocked') {
      applyPolicyNotice(runId, typed, frame);
      return;
    }
    // Everything below is a gate. A restored frame is history: the process that
    // raised its gate did not survive the restart, so a request the log happens
    // to end with was never ours to answer, and a card for it would offer
    // buttons that resolve nothing. A live reconnect replays frames without the
    // mark, and a still-pending gate is in the session view either way — so
    // ignoring history costs nothing that is actually live. Commands returned
    // above: their frames only enrich rows the replay has already rebuilt.
    if (frame.restored) return;
    var settled = null;
    if (typed.type === 'approval_required') {
      sess.typedApprovals = sess.typedApprovals || {};
      sess.typedApprovals[typed.approvalId] = {
        id: typed.approvalId, tool: typed.tool, why: typed.why, summary: typed.summary,
        requestedAt: typed.requestedAt || frame.t,
      };
    } else if (typed.type === 'approval_resolved') {
      if (sess.typedApprovals) delete sess.typedApprovals[typed.approvalId];
      settled = typed.approvalId;
    } else if (typed.type === 'plan_review_requested') {
      sess.typedPlanReview = {
        id: typed.requestId, criteria: typed.criteria || [], steps: typed.steps || [],
        // The event's requestedAt is when the agent asked; the frame's transport
        // stamp only substitutes for a legacy-classified event without one.
        requestedAt: typed.requestedAt || frame.t,
      };
    } else if (typed.type === 'plan_review_resolved') {
      sess.typedPlanReview = null;
      settled = typed.requestId;
    } else if (typed.type === 'questions_requested') {
      sess.typedQuestions = { id: typed.requestId, questions: questionDetails(typed), requestedAt: typed.requestedAt || frame.t };
    } else if (typed.type === 'questions_answered') {
      sess.typedQuestions = null;
      settled = typed.requestId;
    } else {
      return;
    }
    sess.settledGates = sess.settledGates || {};
    if (settled) sess.settledGates[settled] = true;
    renderApprovals(runId, sess.session);
    renderPlanReview(runId, sess.session);
    renderQuestions(runId, sess.session);
  }

  function renderApprovals(runId, session) {
    var stream = $('stream');
    if (!stream) return;
    var sess = S.sessions[runId];
    sess.apprShown = sess.apprShown || {};
    var pending = {};
    pendingApprovalsFor(sess, session).forEach(function (a) {
      pending[a.id] = true;
      if (sess.apprShown[a.id]) return;
      sess.apprShown[a.id] = true;
      var div = document.createElement('div');
      div.className = 'approval';
      div.setAttribute('data-aid', a.id);
      div.innerHTML =
        '<h3>approval required — ' + esc(a.tool) + '</h3>' +
        '<div class="meta-line">' + esc(a.why) + '</div>' +
        '<pre>' + esc(a.summary) + '</pre>' +
        '<div class="actions"><button class="btn dark" data-appr="' + esc(a.id) + '" data-ok="1">Approve</button>' +
        '<button class="btn red" data-appr="' + esc(a.id) + '" data-ok="0">Deny</button></div>';
      var working = $('working');
      if (working) stream.insertBefore(div, working); else stream.appendChild(div);
      stickScroll(stream, true);
    });
    var olds = stream.querySelectorAll('.approval');
    for (var i = 0; i < olds.length; i++) {
      if (!pending[olds[i].getAttribute('data-aid')]) olds[i].remove();
    }
    stream.onclick = function (e) {
      var id = e.target.getAttribute && e.target.getAttribute('data-appr');
      if (id) {
        // Lock the card's buttons immediately: a double-click used to POST
        // the decision twice (second one 404s as "already resolved").
        var card = e.target.closest ? e.target.closest('.approval') : null;
        if (card) card.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
        api('/api/approvals/' + id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approved: e.target.getAttribute('data-ok') === '1' }) })
          .catch(function (er) { toast(er.message, true); });
        return;
      }
    };
  }

  function renderQuestions(runId, session) {
    var stream = $('stream');
    if (!stream) return;
    var sess = S.sessions[runId];
    var q = pendingQuestionsFor(sess, session);
    if (!q) {
      if (sess.qShown) {
        sess.qShown = null;
        var olds = stream.querySelectorAll('.qcard');
        for (var i = 0; i < olds.length; i++) olds[i].remove();
      }
      return;
    }
    if (sess.qShown === q.id) return;
    sess.qShown = q.id;
    var old = stream.querySelectorAll('.qcard');
    for (var j = 0; j < old.length; j++) old[j].remove();
    var selections = {};
    var questions = (q.questions || []).filter(function(qq){return qq && typeof qq === 'object';}).map(function(qq){
      var options = Array.isArray(qq.options) ? qq.options : [];
      return { question: qq.question, header: qq.header, options: options.map(function(option){
        var label = typeof option === 'string' ? option : option && typeof option === 'object' ? option.label : '';
        return typeof label === 'string' && label.trim() !== '[object Object]' ? label.trim() : '';
      }).filter(Boolean) };
    });
    var div = document.createElement('div');
    div.className = 'qcard';
    var html = '<h3>Agent Gitu has a few questions before starting</h3>';
    questions.forEach(function (qq, qi) {
      html += '<div class="q"><div class="qt">' + esc(qq.header ? qq.header + ' — ' : '') + esc(qq.question) + '</div><div class="opts">';
      qq.options.forEach(function (op, oi) {
        html += '<button class="opt" data-q="' + qi + '" data-o="' + oi + '">' + esc(op) + '</button>';
      });
      html += '</div><input class="custom" data-q="' + qi + '" placeholder="or type your own answer…"></div>';
    });
    html += '<div class="actions"><button class="btn dark" id="qSend">Send answers</button></div>';
    div.innerHTML = html;
    var working = $('working');
    if (working) stream.insertBefore(div, working); else stream.appendChild(div);
    stickScroll(stream, true);
    div.onclick = function (e) {
      var btn = e.target.closest && e.target.closest('.opt');
      if (!btn) return;
      var qi = btn.getAttribute('data-q');
      var siblings = div.querySelectorAll('.opt[data-q="' + qi + '"]');
      for (var i2 = 0; i2 < siblings.length; i2++) siblings[i2].classList.remove('sel');
      btn.classList.add('sel');
      selections[qi] = questions[Number(qi)].options[Number(btn.getAttribute('data-o'))];
    };
    $('qSend').onclick = function () {
      if (this.disabled) return;
      this.disabled = true;
      var restore = (function (b) { return function () { b.disabled = false; }; })(this);
      var answers = questions.map(function (qq, qi2) {
        var custom = div.querySelector('.custom[data-q="' + qi2 + '"]');
        var val = (custom && custom.value.trim()) || selections[qi2] || '(no answer)';
        return qq.question + ' — ' + val;
      }).join('\n');
      api('/api/answers/' + q.id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ answer: answers }) })
        .catch(function (er) { restore(); toast(er.message, true); });
    };
  }

  function renderPlanReview(runId, session) {
    var stream = $('stream');
    if (!stream) return;
    var sess = S.sessions[runId];
    var pr = pendingPlanReviewFor(sess, session);
    if (!pr) {
      if (sess.prShown) {
        sess.prShown = null;
        var olds = stream.querySelectorAll('.review-card');
        for (var i = 0; i < olds.length; i++) olds[i].remove();
      }
      return;
    }
    if (sess.prShown === pr.id) return;
    sess.prShown = pr.id;
    var old = stream.querySelectorAll('.review-card');
    for (var j = 0; j < old.length; j++) old[j].remove();
    var div = document.createElement('div');
    div.className = 'review-card';
    div.innerHTML =
      '<h3>plan review — read the plan, edit if needed, then choose</h3>' +
      '<div class="md-plan" id="prDoc">' +
      (pr.criteria.length ? '<h4>Acceptance criteria</h4><ul>' + pr.criteria.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>' : '') +
      '<h4>Plan</h4><ol>' + pr.steps.map(function (s, i2) {
        return '<li><b>Step ' + (i2 + 1) + '.</b> ' + esc(s.description) + '<span class="ver">Verification: ' + esc(s.verification) + '</span></li>';
      }).join('') + '</ol></div>' +
      '<div id="prEdit" style="display:none">' +
      '<label>Acceptance criteria (optional, one per line)</label>' +
      '<textarea id="prCrit" rows="' + Math.max(2, pr.criteria.length) + '">' + esc(pr.criteria.join('\n')) + '</textarea>' +
      '<label>Plan steps (one per line: description | verification)</label>' +
      '<textarea id="prSteps" rows="' + Math.max(3, pr.steps.length + 1) + '">' + esc(pr.steps.map(function (s) { return s.description + ' | ' + s.verification; }).join('\n')) + '</textarea>' +
      '</div>' +
      '<div class="actions"><button class="btn dark" id="prApprove">Approve &amp; Build</button>' +
      '<button class="btn ghost" id="prEditBtn">Edit plan</button>' +
      '<input id="prNote" placeholder="Requested changes (optional)…">' +
      '<button class="btn ghost" id="prChange">Request changes</button></div>';
    var working = $('working');
    if (working) stream.insertBefore(div, working); else stream.appendChild(div);
    stickScroll(stream, true);
    var editing = false;
    $('prEditBtn').onclick = function () {
      editing = !editing;
      $('prEdit').style.display = editing ? 'block' : 'none';
      $('prDoc').style.display = editing ? 'none' : 'block';
      $('prEditBtn').textContent = editing ? 'Preview' : 'Edit plan';
    };
    function payload(approved) {
      var criteria = pr.criteria;
      var steps = pr.steps;
      if (editing) {
        criteria = $('prCrit').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        steps = $('prSteps').value.split('\n').map(function (line) {
          var parts = line.split('|');
          return { description: (parts[0] || '').trim(), verification: (parts.slice(1).join('|') || 'manual check').trim() };
        }).filter(function (s) { return s.description; });
      }
      return { approved: approved, note: $('prNote').value.trim() || undefined, criteria: criteria, steps: steps };
    }
    function prPost(approved) {
      var btns = [$('prApprove'), $('prChange')];
      if (btns.some(function (b) { return b && b.disabled; })) return;
      btns.forEach(function (b) { if (b) b.disabled = true; });
      api('/api/plan-review/' + pr.id, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload(approved)) })
        .catch(function (er) {
          btns.forEach(function (b) { if (b) b.disabled = false; });
          toast(er.message, true);
        });
    }
    $('prApprove').onclick = function () { prPost(true); };
    $('prChange').onclick = function () { prPost(false); };
  }

  function reportableFile(file) {
    var path = String(file || '').replace(/\\/g, '/').replace(/^\.\//, '');
    var lower = path.toLowerCase();
    if (!path || /(^|\/)(?:\.hermes|node_modules|coverage|\.cache|\.freebuff)(?:\/|$)/.test(lower)) return false;
    return !/(^|\/)(?:[^/]*[_-]tmp|tmp[_-][^/]*)\.[^/]+$/i.test(path);
  }

  function reportFiles(report) {
    var seen = {};
    return (report.filesChanged || []).filter(function (file) {
      if (!reportableFile(file) || seen[file]) return false;
      seen[file] = true;
      return true;
    });
  }

  function readableSummary(summary) {
    return String(summary || '')
      .replace(/\s+\((\d+)\)\s+/g, function (_all, number) { return '\n' + number + '. '; })
      .replace(/\s+•\s+/g, '\n• ')
      .trim();
  }

  // Keep generated completion cards focused on the result. Some exploration
  // summaries append a generic stack description that reads like stray chat
  // narration; it is still available in the collapsed raw-summary disclosure.
  function reportLede(summary) {
    return readableSummary(summary)
      .replace(/\s*This is a dependency-free static website using vanilla HTML, CSS, and JavaScript\.?/i, '')
      .trim();
  }

  // ── Outcome parsing ─────────────────────────────────────────────────────
  // The model's summary often embeds a machine-style change dump
  // ("CHANGES (all inside repo_root): - NEW path (4490 chars) …"). Split it:
  // the prose before the dump is the outcome the user reads; the dump
  // becomes a human-phrased change list ("Added x", not "NEW x (4490 chars)").
  var CHANGE_VERBS = { NEW: 'Added', CREATED: 'Added', UPDATED: 'Updated', MODIFIED: 'Updated', REWROTE: 'Rewrote', DELETED: 'Removed', REMOVED: 'Removed' };
  function parseOutcome(summary) {
    var text = String(summary || '').trim();
    var out = { lede: text, changes: [], criteriaNote: '', sourceNote: '' };
    var crit = text.match(/(all \d+ acceptance criteria[^.]*\.)/i);
    if (crit) out.criteriaNote = crit[1];
    var src = text.match(/(no (?:production\/)?source code was (?:modified|changed)\.)/i);
    if (src) out.sourceNote = src[1];
    var cut = text.search(/\bCHANGES?\s*\(/i);
    var head = cut >= 0 ? text.slice(0, cut).trim() : text;
    out.lede = head;
    var rest = cut >= 0 ? text.slice(cut) : '';
    var cre = /[-\u2022]\s*(NEW|CREATED|UPDATED|MODIFIED|REWROTE|DELETED|REMOVED)\s+([^\s(,;:]+)/g;
    var m;
    while ((m = cre.exec(rest))) {
      out.changes.push({ action: m[1].toUpperCase(), path: m[2].replace(/[).,]+$/, '') });
    }
    return out;
  }
  // One status strip answering: did it work, was it verified, what moved.
  function reportStatusLine(status, checks, passed, fileCount, updateCount) {
    var bits = [];
    bits.push(status === 'complete' ? '<span>🟢 <b>Completed</b></span>'
      : status === 'blocked' ? '<span>⚠️ <b>Blocked</b></span>'
      : status === 'paused' ? '<span>⏸️ <b>Paused</b></span>'
      : status === 'aborted' ? '<span>⏹️ <b>Stopped</b></span>' : '<span>❌ <b>Failed</b></span>');
    if (checks.length) {
      bits.push(passed === checks.length
        ? '<span>✅ All ' + checks.length + ' verification checks passed</span>'
        : '<span>' + (passed ? '⚠️' : '❌') + ' ' + passed + ' passed · ' + (checks.length - passed) + ' failed verification attempt' + (checks.length - passed === 1 ? '' : 's') + '</span>');
    }
    bits.push(fileCount
      ? '<span>🛠️ ' + fileCount + ' file' + (fileCount === 1 ? '' : 's') + ' changed</span>'
      : updateCount ? '<span>🛠️ ' + updateCount + ' update' + (updateCount === 1 ? '' : 's') + ' reported</span>'
      : '<span>🔒 No source code was modified</span>');
    return '<div class="r-status">' + bits.join('') + '</div>';
  }
  function telemetryGridHtml(t) {
    var rows = [['Calls', t.calls], ['Tool calls', t.toolCalls], ['Compactions', t.compactions],
      ['Planning calls', t.planningCalls], ['Execution calls', t.executionCalls], ['Screenshots', t.screenshots],
      ['Wasted calls', t.wastedCalls], ['Input tokens', t.inputTokens], ['Cached tokens', t.cachedTokens],
      ['Output tokens', t.outputTokens]];
    var html = '<div class="sec"><h4>Token telemetry</h4><div class="exec-grid">';
    rows.forEach(function (p) { html += '<span class="k">' + p[0] + '</span><span class="v">' + esc(String(p[1])) + '</span>'; });
    return html + '</div></div>';
  }

  function shortText(text, limit) {
    text = String(text || '').replace(/\s+/g, ' ').trim();
    return text.length > limit ? text.slice(0, Math.max(1, limit - 1)).trim() + '…' : text;
  }

  function readableCheckLabel(label) {
    label = String(label || '').replace(/\s+/g, ' ').trim();
    var lower = label.toLowerCase();
    if (/\bnpm\s+(?:run\s+)?test\b/.test(lower)) return 'Project test suite';
    if (/\bnpm\s+run\s+(?:build|lint|typecheck)\b/.test(lower)) return shortText(label.match(/npm\s+run\s+\S+/i)?.[0] || label, 100);
    if (/^\$?\s*node\s+-e\b/i.test(label)) return 'Node verification command';
    return shortText(label, 150);
  }

  function compactVerification(text) {
    var raw = String(text || '').replace(/\s+/g, ' ').trim();
    var match = raw.match(/^(PASS|FAIL)\s*\[([^\]]+)\]\s*(.*)$/i);
    var status = match ? match[1].toUpperCase() : (/\bFAIL\b/i.test(raw) ? 'FAIL' : 'PASS');
    var kind = match ? match[2] : 'check';
    var label = match ? match[3] : raw;
    label = readableCheckLabel(label);
    return { passed: status === 'PASS', kind: kind, label: label || 'Verification recorded', details: raw };
  }

  function reportChecks(report) {
    if (Array.isArray(report.verificationDetails) && report.verificationDetails.length) {
      return report.verificationDetails.map(function (item) {
        var details = '';
        if (item.command) details += 'Command\n' + item.command;
        if (item.outputExcerpt) details += (details ? '\n\n' : '') + 'Output\n' + item.outputExcerpt;
        return { passed: item.passed !== false, kind: item.kind || 'check', label: readableCheckLabel(item.label || 'Verification recorded'), details: details, authority: item.authority || 'latest' };
      });
    }
    return (report.verification || []).map(function (item) {
      var parsed = compactVerification(item);
      parsed.authority = 'latest';
      return parsed;
    });
  }

  function checkRow(check) {
    var details = check.details
      ? '<details><summary>Show command and output</summary><pre>' + esc(check.details) + '</pre></details>'
      : '';
    return '<div class="verify-row"><span class="chip ' + (check.passed ? 'ok' : 'bad') + '">' + (check.passed ? 'PASS' : 'FAIL') + '</span>' +
      '<span class="verify-kind">' + esc(check.kind) + '</span><span class="verify-label">' + esc(check.label) + '</span>' +
      (check.authority === 'historical' ? '<span class="verify-kind">historical</span>' : '') + details + '</div>';
  }

  function verificationSection(checks) {
    if (!checks.length) return '';
    var latest = checks.filter(function (check) { return check.authority !== 'historical'; });
    var historical = checks.filter(function (check) { return check.authority === 'historical'; });
    var shown = latest.slice(0, 6);
    var html = '<div class="sec"><h4>Latest / authoritative verification</h4><div class="verify-list">' +
      (shown.length ? shown.map(checkRow).join('') : '<div class="empty">No verification ran against the final workspace state.</div>') + '</div>';
    if (latest.length > shown.length) {
      html += '<details style="margin-top:8px"><summary style="cursor:pointer;font-size:12px;color:var(--muted)">Show ' + (latest.length - shown.length) + ' more current checks</summary><div class="verify-list" style="margin-top:7px">' + latest.slice(shown.length).map(checkRow).join('') + '</div></details>';
    }
    if (historical.length) {
      html += '<details style="margin-top:10px"><summary style="cursor:pointer;font-size:12px;color:var(--muted)">Historical evidence (' + historical.length + ')</summary><div class="verify-list" style="margin-top:7px">' + historical.map(checkRow).join('') + '</div></details>';
    }
    return html + '</div>';
  }

  function browserHighlight(activity) {
    if (!activity || !Number(activity.total)) return '';
    var total = Math.max(0, Number(activity.total) || 0);
    var successful = Math.max(0, Math.min(total, Number(activity.successful) || 0));
    var screenshots = Math.max(0, Number(activity.screenshots) || 0);
    return '<div class="browser-highlight"><div><b>Visual verification</b></div><span>' + successful + '/' + total + ' browser actions succeeded' +
      (screenshots ? ' · ' + screenshots + ' screenshot' + (screenshots === 1 ? '' : 's') : '') + '</span></div>';
  }

  function reportMessageText(report) {
    var parsed = parseOutcome(report.summary);
    var parts = [parsed.lede || readableSummary(report.summary)];
    var findings = (report.findings || []).map(function (item) { return item.claim; }).filter(Boolean);
    var changes = (report.changes || []).length ? report.changes : parsed.changes.map(function (item) { return (CHANGE_VERBS[item.action] || 'Changed') + ' ' + item.path; });
    function section(title, items) {
      if (items && items.length) parts.push('### ' + title + '\n' + items.map(function (item) { return '- ' + String(item); }).join('\n'));
    }
    section('Findings', findings);
    section('Delivered', changes);
    section('Remaining risks', report.remainingRisks);
    section('Follow-ups', report.followUps);
    return parts.join('\n\n');
  }

  function reportReplyHtml(report, runId, actions) {
    var displayStatus = report.status === 'failed' && /^Work paused because/.test(report.failureReason || '') ? 'paused' : report.status;
    var checks = reportChecks(report);
    var currentChecks = checks.filter(function (check) { return check.authority !== 'historical'; });
    var files = reportFiles(report);
    var body = renderResponseText(cwVisibleReply(reportMessageText(report)));
    if(runId)body+='<button type="button" class="agent-report-files" data-report-files="'+esc(runId)+'">'+icon('file')+'Files &amp; details'+(files.length?' · '+files.length+' changed':'')+'</button>';
    var evidence = verificationSection(checks) + browserHighlight(report.browserActivity) + qualityMetricsHtml(report.qualityMetrics);
    if (report.tokenTelemetry && devMode()) evidence += telemetryGridHtml(report.tokenTelemetry);
    if (evidence) body += '<details class="exec-details" style="margin-top:12px"><summary><b>Technical evidence</b><span class="chev">\u25B8</span></summary>' +
      reportStatusLine(displayStatus, currentChecks, currentChecks.filter(function (check) { return check.passed; }).length, files.length, (report.changes || []).length) + evidence + '</details>';
    var status = { complete: 'Completed', blocked: 'Blocked', aborted: 'Stopped', failed: 'Failed', paused: 'Paused' }[displayStatus] || displayStatus;
    if (report.phase && report.phase.kind === 'follow_up') status += ' · Follow-up';
    return '<article class="agent-report" aria-label="Agent Gitu report"><header class="agent-report-heading"><b>Agent Gitu</b><span class="agent-report-status" data-status="'+esc(displayStatus)+'">'+esc(status)+'</span>'+(actions||'')+'</header><div class="agent-report-body">'+body+'</div></article>';
  }

  function reportSideCard(report) {
    return '<div class="report-flat">' + reportReplyHtml(report, null, '') + '</div>';
  }
  function qualityMetricsHtml(metrics) {
    if (!metrics || typeof metrics.score !== 'number') return '';
    var criteria = metrics.criteria || {};
    var verification = metrics.verification || {};
    var bits = [
      Math.round(metrics.score) + '/100 outcome quality',
      (Number(criteria.satisfied) || 0) + '/' + (Number(criteria.total) || 0) + ' criteria',
      (Number(verification.passing) || 0) + '/' + (Number(verification.authoritative) || 0) + ' final checks',
    ];
    if (typeof metrics.tokensPerVerifiedCriterion === 'number') bits.push(Math.round(metrics.tokensPerVerifiedCriterion).toLocaleString() + ' tokens / verified criterion');
    if (typeof metrics.wastedCallRate === 'number') bits.push(Math.round(metrics.wastedCallRate * 100) + '% wasted calls');
    return '<div class="r-note" data-quality-metrics><b>Outcome quality</b> · ' + esc(bits.join(' · ')) + '</div>';
  }

  function reportChangedFilesHtml(runId, files) {
    if (!files.length) return '';
    function row(path) {
      var url = '/api/runs/' + encodeURIComponent(runId) + '/project-file?path=' + encodeURIComponent(path);
      return '<a class="report-file-row" href="' + esc(url) + '" download aria-label="Download ' + esc(path) + '">' +
        '<span class="report-file-path">' + esc(path) + '</span><span class="report-file-action">Download ↓</span></a>';
    }
    var html = '<section class="report-files" aria-label="Changed files"><div class="report-files-head">' + icon('file') +
      '<span>Changed files</span><span class="report-files-count">' + files.length + '</span></div>' + files.map(row).join('');
    return html + '</section>';
  }

  function appendSummary(runId, session) {
    var stream = $('stream');
    if (!stream) return;
    var sess = S.sessions[runId];
    if (sess && sess.chatish) return;
    var r = session.report;
    var div = document.createElement('div');
    div.className = 'report-flat';
    var menuId = 'report-menu-' + runId;
    var actions = '<div class="cw-message-actions"><button class="cw-message-more" type="button" popovertarget="' + esc(menuId) + '" aria-label="Report actions" title="Report actions">…</button>' +
      '<div class="cw-message-menu" id="' + esc(menuId) + '" popover="auto"><button data-sumcopy>Copy report</button></div></div>';
    div.innerHTML = reportReplyHtml(r, runId, actions);
    var filesButton=div.querySelector('[data-report-files]');if(filesButton)filesButton.onclick=function(){openToolPanel('files');};
    setupCopyButton(div.querySelector('[data-sumcopy]'), function () { return reportText(r); });
    var more = div.querySelector('.cw-message-more');
    if (more) more.onclick = function () {
      var menu = div.querySelector('.cw-message-menu'), rect = more.getBoundingClientRect();
      menu.style.left = Math.max(12, Math.min(rect.right - 164, window.innerWidth - 176)) + 'px';
      menu.style.top = Math.max(12, Math.min(rect.bottom + 4, window.innerHeight - 80)) + 'px';
    };
    var working = $('working');
    if (working) stream.insertBefore(div, working); else stream.appendChild(div);
    if (sess && sess.justOpened) stream.scrollTop = 0;
    else stickScroll(stream, true);
    if (sess) sess.justOpened = false;
  }

  function projectFileChipHtml(runId, path, downloadPath) {
    if (!downloadPath) return '<span class="file-chip">' + esc(path) + '</span>';
    var url = '/api/runs/' + encodeURIComponent(runId) + '/project-file?path=' + encodeURIComponent(downloadPath);
    return '<a class="file-chip" href="' + esc(url) + '" download title="Download ' + esc(path) + '">' + esc(path) + '</a>';
  }

  function renderRunSide(runId) {
    if(S.panelKind==='files'){renderRunFiles(runId);return;}
    var sess = S.sessions[runId];
    var body = $('sideBody');
    if (!body || !sess || S.panelKind !== 'state' || $('toolPanel').hidden) return;
    if (sess.chatish) { body.innerHTML = '<div class="empty" style="padding:16px 6px">Conversation session — no task state.</div>'; return; }
    var L = sess.ledger;
    if (!L) { body.innerHTML = '<div class="empty">Waiting for task ledger…</div>'; return; }
    var failure = sess.session && sess.session.error;
    var modelWaiting = sess.session && sess.session.status === 'waiting_for_model';
    var satisfied = L.acceptanceCriteria.filter(function (c) { return c.satisfied; }).length;
    var planDone = L.plan.filter(function (s) { return s.status === 'done'; }).length;
    // The card leads with a classified headline; the raw provider error stays
    // visible-but-secondary,
    // clamped, and copyable.
    var failSummary = failure ? failureSummary(failure) : null;
    if (modelWaiting && failSummary) {
      failSummary.title = 'Waiting for the model to recover';
      failSummary.hint = 'This task will retry automatically. Completed work is saved; you can stop it or select another model.';
    }
    var html = failure
      ? '<div class="side-fail"><div class="ft">&#9888; ' + esc(failSummary.title) + '</div>' +
        '<div class="fmsg" title="' + esc(failure) + '">' + esc(failure) + '</div>' +
        (failSummary.hint ? '<div class="fhint">' + esc(failSummary.hint) + '</div>' : '') +
        '<div class="facts">' +
        (failSummary.canSwitchModel ? '<button type="button" class="btn dark" id="sideFailSwitch">Switch model &amp; retry</button><button type="button" class="btn ghost" id="sideFailSettings">Provider settings</button>' : '') +
        '<button type="button" class="btn ghost" id="sideFailCopy">Copy error</button></div></div>'
      : '';
    html += '<div class="side-summary"><div class="t">Task state</div><div class="d">' +
      (L.acceptanceCriteria.length ? satisfied + '/' + L.acceptanceCriteria.length + ' criteria · ' : '') +
      (L.plan.length ? planDone + '/' + L.plan.length + ' plan steps · ' : '') + L.evidence.length + ' checks</div></div>';
    var visibleBlockers = L.blockers.filter(function (b) { return b !== failure; });
    if (visibleBlockers.length) {
      html += '<div class="section-h" style="margin-top:0">Blockers</div>';
      visibleBlockers.slice(-3).forEach(function (b) { html += '<div class="crit"><span class="dot" style="background:var(--red)"></span><div>' + esc(b) + '</div></div>'; });
    }
    if (L.acceptanceCriteria.length || L.mode !== 'agent') html += '<div class="section-h" style="margin-top:0">Acceptance criteria</div>';
    if (!L.acceptanceCriteria.length && L.mode !== 'agent') html += '<div class="empty">none set yet</div>';
    var orderedCriteria = L.acceptanceCriteria.filter(function (c) { return !c.satisfied; }).concat(L.acceptanceCriteria.filter(function (c) { return c.satisfied; }));
    function criterionHtml(c) {
      var reqHtml = c.verification
        ? '<div class="crit-req">Required: <code>' + esc(c.verification) + '</code>' +
          (c.evidenceType && c.evidenceType !== 'any' ? ' <span class="chip" style="font-size:10px;padding:0 5px">' + esc(c.evidenceType) + '</span>' : '') + '</div>'
        : '';
      return '<div class="crit ' + (c.satisfied ? 'done' : '') + '"><span class="dot"></span><div style="flex:1">' + esc(c.text) +
        reqHtml +
        (c.evidenceIds && c.evidenceIds.length ? '<div class="ev-ids">' + esc(c.evidenceIds.join(', ')) + ' ✓</div>' : '') + '</div></div>';
    }
    html += orderedCriteria.slice(0, 6).map(criterionHtml).join('');
    if (orderedCriteria.length > 6) html += '<details class="side-more"><summary>Show ' + (orderedCriteria.length - 6) + ' more criteria</summary>' + orderedCriteria.slice(6).map(criterionHtml).join('') + '</details>';
    if (L.plan.length || L.mode !== 'agent') html += '<div class="section-h">Plan' + (L.planApproved ? ' <span class="chip ok" style="margin-left:6px">approved</span>' : '') + '</div>';
    if (!L.plan.length && L.mode !== 'agent') html += '<div class="empty">no plan yet</div>';
    var orderedPlan = L.plan.filter(function (s) { return s.status === 'in_progress'; }).concat(L.plan.filter(function (s) { return s.status === 'pending'; }), L.plan.filter(function (s) { return s.status !== 'in_progress' && s.status !== 'pending'; }));
    function planHtml(s) { return '<div class="step"><span class="st ' + s.status + '">' + esc(s.status) + '</span><div>' + esc(s.description) + ' <span style="color:var(--faint)">· ' + esc(s.verification) + '</span></div></div>'; }
    html += orderedPlan.slice(0, 6).map(planHtml).join('');
    if (orderedPlan.length > 6) html += '<details class="side-more"><summary>Show ' + (orderedPlan.length - 6) + ' more plan steps</summary>' + orderedPlan.slice(6).map(planHtml).join('') + '</details>';
    html += '<div class="section-h">Evidence</div>';
    if (!L.evidence.length) html += '<div class="empty">none yet</div>';
    function evidenceHtml(e) { return '<div class="ev-row ' + (e.passed ? 'pass' : 'fail') + '"><span class="ev-chip ' + (e.passed ? 'pass' : 'fail') + '">' + (e.passed ? 'PASS' : 'FAIL') + '</span><span class="ev-text">' + esc(e.label) + '</span></div>'; }
    var recentEvidence = L.evidence.slice(-8);
    html += '<div class="side-evidence">' + recentEvidence.map(evidenceHtml).join('') + '</div>';
    if (L.evidence.length > 8) html += '<details class="side-more"><summary>Show ' + (L.evidence.length - 8) + ' older checks</summary><div class="side-evidence">' + L.evidence.slice(0, -8).map(evidenceHtml).join('') + '</div></details>';
    html += '<div class="section-h">Files changed</div>';
    var visibleFiles = L.filesChanged.filter(reportableFile);
    html += visibleFiles.length ? visibleFiles.slice(0, 12).map(function (f) { return projectFileChipHtml(runId, f, f); }).join('') : '<div class="empty">none</div>';
    if (visibleFiles.length > 12) html += '<details class="side-more"><summary>Show ' + (visibleFiles.length - 12) + ' more files</summary>' + visibleFiles.slice(12).map(function (f) { return projectFileChipHtml(runId, f, f); }).join('') + '</details>';
    body.innerHTML = html;
    if (failure) {
      var failSwitch = $('sideFailSwitch');
      if (failSwitch) failSwitch.onclick = function () {
        closeToolPanel();
        var pick = $('modelPick');
        if (pick && !pick.disabled) openModelMenu();
        else { var follow = $('follow'); if (follow) follow.focus(); }
      };
      var failSettings = $('sideFailSettings');
      if (failSettings) failSettings.onclick = function () { openSettings('providers'); };
      setupCopyButton($('sideFailCopy'), failure);
    }
  }

  function applyLayout() {
    applyWidths();
    var shell = document.querySelector('.shell');
    if (shell) shell.classList.toggle('left-collapsed', !!S.settings.leftCollapsed);
    var btn = $('sbCollapse');
    if (btn) btn.innerHTML = S.settings.leftCollapsed ? '&#187;' : '&#171;';
  }

  function closeToolPanel() {
    var panel = $('toolPanel');
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    S.panelKind = '';
    stopBrowserPoll();
    renderSidebar();
  }

  function openToolPanel(kind) {
    var panel = $('toolPanel');
    if (!panel) return;
    if (!panel.hidden && S.panelKind === kind) { closeToolPanel(); return; }
    toggleContextCard(false);
    stopBrowserPoll();
    S.panelKind = kind;
    panel.hidden = false;
    $('toolPanelTitle').textContent = kind === 'browser' ? 'Browser' : kind === 'git' ? 'Git' : kind==='files'?'Files & details':'Task details';
    $('sideBody').innerHTML = '';
    $('sideBody')._runFilesSignature=null;
    toggleMobileNav(false);
    renderSidebar();
    if (kind === 'browser') showBrowserPanel(S.active);
    else if (kind === 'git') renderGitPanel(S.active);
    else if(kind==='files')renderRunFiles(S.active);
    else if (S.active !== 'home') renderRunSide(S.active);
  }

  function toggleMobileNav(open) {
    var shell = document.querySelector('.shell');
    var btn = $('mobileNav');
    if (!shell) return;
    shell.classList.toggle('mobile-nav-open', Boolean(open));
    if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  function applyWidths() {
    var rs = document.documentElement.style;
    rs.setProperty('--sbw', (S.settings.sbWidth || 264) + 'px');
  }

  function bindResize(id) {
    var h = $(id);
    if (!h) return;
    h.addEventListener('mousedown', function (e) {
      e.preventDefault();
      var el = document.querySelector('.sb');
      if (!el) return;
      var startX = e.clientX;
      var startW = el.getBoundingClientRect().width;
      h.classList.add('active');
      var move = function (ev) {
        var dx = ev.clientX - startX;
        var w = Math.max(200, Math.min(760, Math.round(startW + dx)));
        S.settings.sbWidth = w;
        applyWidths();
      };
      var up = function () {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        h.classList.remove('active');
        persist();
      };
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  function clientNormalize(input) {
    var url = String(input || '').trim();
    if (!url) return '';
    if (!/^https?:\/\//i.test(url)) {
      if (/^localhost(:\d+)?/i.test(url) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?/.test(url)) url = 'http://' + url;
      else if (url.indexOf('.') < 0 && url.indexOf(':') < 0) url = 'https://www.bing.com/search?q=' + encodeURIComponent(url);
      else url = 'https://' + url;
    }
    return url;
  }

  function gitQueryPath() { return effectiveProjectPath(); }

  function renderGitPanel(runId) {
    var body = $('sideBody');
    body.innerHTML = '<div style="padding:4px 2px"><div id="gitHead" class="meta" style="margin-bottom:8px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">loading…</div><div id="gitBody"></div></div>';
    refreshGit();
  }

  function refreshGit() {
    api('/api/git?path=' + encodeURIComponent(gitQueryPath())).then(function (g) {
      var head = $('gitHead');
      var gb = $('gitBody');
      if (!head || !gb) return;
      if (!g.available) {
        head.textContent = 'Not a git repository' + (g.root ? ' (' + g.root + ')' : '') + '.';
        gb.innerHTML = '<p class="meta">Initialize git to track changes, commit and push from here.</p><button class="btn dark" id="gitInit">git init</button>';
        $('gitInit').onclick = function () {
          api('/api/git/init', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: gitQueryPath() }) })
            .then(function () { toast('git initialized'); refreshGit(); })
            .catch(function (e) { toast(e.message, true); });
        };
        return;
      }
      var files = g.files || [];
      head.innerHTML = '<span class="chip info">' + esc(g.branch || '?') + '</span>' +
        (g.ahead ? ' <span class="chip">ahead ' + g.ahead + '</span>' : '') +
        (g.behind ? ' <span class="chip warn">behind ' + g.behind + '</span>' : '') +
        '<span class="meta" style="word-break:break-all;flex:1">' + esc(g.remote || 'no remote') + '</span>' +
        '<button class="ubtn" id="gitRefresh" title="refresh">' + icon('retry') + '</button>';
      $('gitRefresh').onclick = refreshGit;
      var html = '<div class="section-h" style="margin-top:0">Working tree (' + files.length + ')</div>';
      if (!files.length) html += '<div class="empty">clean — no changes</div>';
      html += files.map(function (f) {
        return '<div class="grow-row"><label style="display:flex;gap:7px;align-items:center;flex:1;cursor:pointer;min-width:0">' +
          '<input type="checkbox" class="chk gitf" data-f="' + esc(f.path) + '" style="margin:0;width:auto" checked>' +
          '<span class="chip ' + (f.untracked ? 'warn' : 'info') + '" style="flex:none">' + esc(f.status) + '</span>' +
          '<span class="gitpath" data-diff="' + esc(f.path) + '" title="view diff">' + esc(f.path) + '</span></label>' +
          (f.untracked ? '' : '<button class="ubtn gitdiscard" data-d="' + esc(f.path) + '" title="discard changes">' + icon('x') + '</button>') +
          '</div>';
      }).join('');
      html += '<pre class="skinstr" id="gitDiff" hidden></pre>';
      html += '<div class="section-h">Commit &amp; push</div>' +
        '<input id="gitMsg" placeholder="commit message" style="width:100%;border:1px solid var(--border2);border-radius:8px;background:var(--card2);color:var(--text);padding:7px 9px;margin-bottom:8px">' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
        '<button class="btn dark" id="gitCommitSel">Commit selected</button>' +
        '<button class="btn ghost" id="gitCommitAll">Commit all</button>' +
        '<button class="btn ghost" id="gitPush">' + (g.ahead ? 'Push (' + g.ahead + ')' : 'Push') + '</button>' +
        '</div>';
      gb.innerHTML = html;
      gb.querySelectorAll('[data-diff]').forEach(function (el) {
        el.onclick = function () {
          var pre = $('gitDiff');
          var f = el.getAttribute('data-diff');
          if (pre.dataset.cur === f && !pre.hidden) { pre.hidden = true; return; }
          pre.hidden = false; pre.dataset.cur = f; pre.textContent = 'loading diff…';
          api('/api/git/diff?path=' + encodeURIComponent(gitQueryPath()) + '&file=' + encodeURIComponent(f)).then(function (d) {
            pre.textContent = d.diff || '(no unstaged diff — file may be untracked or staged)';
          }).catch(function (e) { pre.textContent = e.message; });
        };
      });
      gb.querySelectorAll('.gitdiscard').forEach(function (el) {
        el.onclick = function () {
          var f = el.getAttribute('data-d');
          if (!confirm('Discard local changes in ' + f + '?')) return;
          api('/api/git/discard', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: gitQueryPath(), file: f }) })
            .then(function () { toast('Discarded ' + f); refreshGit(); })
            .catch(function (e) { toast(e.message, true); });
        };
      });
      function selected() {
        var out = [];
        gb.querySelectorAll('.gitf').forEach(function (cb) { if (cb.checked) out.push(cb.getAttribute('data-f')); });
        return out;
      }
      function commit(filesOrNull) {
        var msg = $('gitMsg').value.trim();
        if (!msg) { toast('Commit message required', true); $('gitMsg').focus(); return; }
        if (filesOrNull && !filesOrNull.length) { toast('No files selected', true); return; }
        var payload = { path: gitQueryPath(), message: msg };
        if (filesOrNull) payload.files = filesOrNull;
        api('/api/git/commit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
          .then(function (d) { toast('Committed ' + d.commit); $('gitMsg').value = ''; refreshGit(); })
          .catch(function (e) { toast(e.message, true); });
      }
      $('gitCommitSel').onclick = function () { commit(selected()); };
      $('gitCommitAll').onclick = function () { commit(null); };
      $('gitPush').onclick = function () {
        api('/api/git/push', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: gitQueryPath() }) })
          .then(function () { toast('Pushed to remote'); refreshGit(); })
          .catch(function (e) { toast(e.message, true); });
      };
    }).catch(function (e) {
      var head = $('gitHead');
      if (head) head.textContent = e.message;
    });
  }

  function stopBrowserPoll() { if (S.bPoll) { clearInterval(S.bPoll); S.bPoll = null; } }

  function startBrowserPoll() {
    stopBrowserPoll();
    S.bPoll = setInterval(refreshBrowserView, 2500);
  }

  function refreshBrowserView() {
    api('/api/browser').then(function (d) {
      var hint = $('bHint2');
      if (!hint) return;
      if (!d.has) {
        hint.textContent = 'The browser window opens in the desktop app on first use (npm run app).';
        var im = $('bImg2');
        if (im) im.removeAttribute('src');
        return;
      }
      hint.textContent = (d.state.title || '(blank page)') + (d.state.driving ? ' — Agent Gitu is driving' : '');
      var u = $('bUrl2');
      if (u && document.activeElement !== u) u.value = d.state.url === 'about:blank' ? '' : d.state.url || '';
      var bb = $('bBack2'), ff = $('bFwd2');
      if (bb) bb.disabled = !d.state.canBack;
      if (ff) ff.disabled = !d.state.canForward;
      var drv = $('bDrive2');
      if (drv) drv.hidden = !d.state.driving;
      api('/api/browser/screenshot').then(function (shot) {
        var img = $('bImg2');
        if (img && shot.pngBase64) img.src = 'data:image/png;base64,' + shot.pngBase64;
      }).catch(function () {});
    }).catch(function () {});
  }

  function showBrowserPanel(runId) {
    var body = $('sideBody');
    body.innerHTML =
      '<div class="bpanel2">' +
      '<div class="nav">' +
      '<button class="ubtn" id="bBack2" title="back" style="width:28px;height:26px">' + icon('back') + '</button>' +
      '<button class="ubtn" id="bFwd2" title="forward" style="width:28px;height:26px;transform:scaleX(-1)">' + icon('back') + '</button>' +
      '<button class="ubtn" id="bReload2" title="reload" style="width:28px;height:26px">' + icon('retry') + '</button>' +
      '<input id="bUrl2" placeholder="Enter address" spellcheck="false">' +
      '<button class="btn dark" id="bGo2">Go</button>' +
      '<button class="btn ghost" id="bOpen2" title="open / focus the browser window">Open</button>' +
      '</div>' +
      '<div class="bwrap"><div class="bdrive" id="bDrive2" hidden>' + icon('bolt') + ' Agent Gitu is driving the browser</div><img id="bImg2" alt="live browser view"></div>' +
      '<div class="empty" id="bHint2" style="margin-top:8px"></div></div>';
    $('bBack2').onclick = function () { api('/api/browser/back', { method: 'POST' }).then(refreshBrowserView).catch(function (e) { toast(e.message, true); }); };
    $('bFwd2').onclick = function () { api('/api/browser/forward', { method: 'POST' }).then(refreshBrowserView).catch(function (e) { toast(e.message, true); }); };
    $('bReload2').onclick = function () { api('/api/browser/reload', { method: 'POST' }).then(refreshBrowserView).catch(function (e) { toast(e.message, true); }); };
    $('bGo2').onclick = function () {
      var url = clientNormalize($('bUrl2').value);
      if (!url) return;
      api('/api/browser/navigate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: url }) })
        .then(refreshBrowserView).catch(function (e) { toast(e.message, true); });
    };
    $('bUrl2').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('bGo2').click(); });
    $('bOpen2').onclick = function () { api('/api/browser/focus', { method: 'POST' }).then(refreshBrowserView).catch(function (e) { toast(e.message, true); }); };
    refreshBrowserView();
    startBrowserPoll();
  }

  function reportText(r) {
    var lines = [r.status.toUpperCase() + ' — ' + r.summary];
    if (r.phase && r.phase.kind === 'follow_up') lines.push('Scope: follow-up work (earlier task history preserved)');
    if (r.changes && r.changes.length) lines.push('', 'Delivered:', '  ' + r.changes.join('\n  '));
    if ((r.filesChanged || []).length) lines.push('Files: ' + r.filesChanged.join(', '));
    if ((r.verification || []).length) lines.push('', 'Verification:', '  ' + r.verification.join('\n  '));
    if ((r.remainingRisks || []).length) lines.push('', 'Risks:', '  ' + r.remainingRisks.join('\n  '));
    if ((r.followUps || []).length) lines.push('', 'Follow-ups:', '  ' + r.followUps.join('\n  '));
    return lines.join('\n');
  }

  function toggleContextCard(open) {
    var card = $('contextCard'), button = $('contextToggle');
    if (!card || !button) return;
    var visible = open === undefined ? card.hidden : Boolean(open);
    card.hidden = !visible;
    button.setAttribute('aria-expanded', visible ? 'true' : 'false');
    if (visible) { closeToolPanel(); renderContextCard(S.active); }
  }

  function renderContextRing(runId) {
    var button = $('contextToggle'), sess = S.sessions[runId];
    if (!button || !sess) return;
    var session = sess.session, usage = session && session.usage;
    var model = session && session.provider && session.model ? modelInfo(session.provider + '::' + session.model) : null;
    var capacity = usage && usage.contextWindowTokens || model && model.metadata && model.metadata.contextTokens;
    var used = usage && usage.contextTokens;
    var known = typeof used === 'number' && typeof capacity === 'number' && capacity > 0;
    var percent = known ? Math.min(100, Math.max(0, used / capacity * 100)) : 0;
    var active = session && session.status === 'running';
    button.classList.toggle('using', Boolean(active));
    button.classList.toggle('unknown', !known);
    button.style.setProperty('--context-color', known ? percent >= 90 ? 'var(--err)' : percent >= 70 ? 'var(--evidence)' : 'var(--ok)' : active ? 'var(--run)' : 'var(--muted)');
    button.querySelector('.context-ring-progress').style.strokeDashoffset = String(100 - percent);
    var title = known ? 'Context: ' + Math.round(percent) + '% · ' + used.toLocaleString() + ' / ' + capacity.toLocaleString() + ' tokens (latest model call)' : 'Context usage unavailable · open session details';
    button.title = title;
    button.setAttribute('aria-label', title);
  }

  function renderContextCard(runId) {
    renderContextRing(runId);
    var sess = S.sessions[runId];
    var body = $('contextCardBody');
    if (!body || !sess || $('contextCard').hidden) return;
    var scrollTop = $('contextCard').scrollTop;
    var L = sess.ledger;
    var session = sess.session;
    var U = session && session.usage;
    var model = session && session.provider && session.model ? modelInfo(session.provider + '::' + session.model) : null;
    var contextWindow = U && U.contextWindowTokens || model && model.metadata && model.metadata.contextTokens;
    var html = '<div class="stat-grid">';
    function stat(k, v, mono) { html += '<div class="stat"><div class="k">' + esc(k) + '</div><div class="v ' + (mono ? 'mono' : '') + '" title="' + esc(v) + '">' + esc(v) + '</div></div>'; }
    stat('Input tokens', U ? Number(U.inputTokens || 0).toLocaleString() : '—', true);
    stat('Cached tokens', U ? Number(U.cachedTokens || 0).toLocaleString() : '—', true);
    stat('Output tokens', U ? Number(U.outputTokens || 0).toLocaleString() : '—', true);
    stat('Model context window', typeof contextWindow === 'number' ? contextWindow.toLocaleString() : 'Unavailable', true);
    stat('Latest context use', U && typeof U.contextTokens === 'number' ? U.contextTokens.toLocaleString() : 'Unavailable', true);
    html += '</div>';
    html += '<div class="section-h">Action breakdown</div>';
    if (L && L.actions.length) {
      var counts = { read: 0, write: 0, command: 0, other: 0 };
      L.actions.forEach(function (a) {
        if (a.tool === 'read_file' || a.tool === 'list_files' || a.tool === 'search_files') counts.read++;
        else if (a.tool === 'write_file' || a.tool === 'apply_edit') counts.write++;
        else if (a.tool === 'run_command') counts.command++;
        else counts.other++;
      });
      var total = L.actions.length;
      function pct(n) { return Math.round((n / total) * 1000) / 10; }
      html += '<div class="bar">' +
        '<span style="width:' + pct(counts.read) + '%;background:var(--ok)"></span>' +
        '<span style="width:' + pct(counts.write) + '%;background:var(--evidence)"></span>' +
        '<span style="width:' + pct(counts.command) + '%;background:var(--run)"></span>' +
        '<span style="width:' + pct(counts.other) + '%;background:var(--muted)"></span></div>' +
        '<div class="legend"><span><i style="background:var(--ok)"></i>Reads ' + pct(counts.read) + '%</span>' +
        '<span><i style="background:var(--evidence)"></i>Writes ' + pct(counts.write) + '%</span>' +
        '<span><i style="background:var(--run)"></i>Commands ' + pct(counts.command) + '%</span>' +
        '<span><i style="background:var(--muted)"></i>Other ' + pct(counts.other) + '%</span></div>';
    } else html += '<div class="empty">No actions yet</div>';
    html += '<details id="contextRunDetails"><summary>Run details</summary><div class="stat-grid" style="margin-top:10px">';
    stat('Session', runId, true);
    stat('Status', session ? session.status : '—');
    stat('Provider', session && session.provider ? session.provider : '—');
    stat('Model', session && session.model ? prettyModelName(session.model) : '—');
    stat('Mode', L ? L.mode : '—');
    // The run's EFFECTIVE effort (the effort planner may escalate); the
    // composer selection is only what the NEXT run would use.
    stat('Effort', (L && L.effortPlan && L.effortPlan.llmEffort) ? L.effortPlan.llmEffort + ' (run)' : (S.sel.effort || '—'));
    stat('Started', session ? shortDate(session.startedAt) : '—');
    stat('Finished', session && session.finishedAt ? shortDate(session.finishedAt) : 'running…');
    if (L) {
      stat('Actions', L.actions.length);
      stat('Plan attempts', L.plan.reduce(function (n, s) { return n + s.attempts; }, 0));
      stat('Evidence', L.evidence.length);
      stat('Files changed', L.filesChanged.length);
      stat('Checkpoints', L.checkpoints.length);
    }
    html += '</div><div class="section-h">Usage &amp; cost</div><div class="stat-grid">';
    stat('Messages', U ? U.messages : 0);
    stat(U && U.costIncomplete ? 'Estimated cost' : 'Total cost', U && typeof U.costUsd === 'number' ? (U.costIncomplete ? '~$' : '$') + U.costUsd.toFixed(4) : '—', true);
    html += '</div></details>';
    var wasOpen = $('contextRunDetails') && $('contextRunDetails').open;
    body.innerHTML = html;
    $('contextRunDetails').open = Boolean(wasOpen);
    $('contextCard').scrollTop = scrollTop;
  }

  function openSettings(section) {
    S.setSection = section || 'general';
    closeToolPanel();
    $('settings').hidden = false;
    renderSettings();
  }
  function closeSettings() {
    $('settings').hidden = true;
  }

  function refreshModels() {
    loadModelCatalog(true)
      .then(function () { renderSettings(); })
      .catch(function () { renderSettings(); });
  }

  function renderSettings() {
    var items = [
      ['general', 'gear', 'General'],
      ['cowork', 'users', 'Cowork'],
      ['providers', 'layers', 'Providers'],
      ['connections', 'plug', 'Connections'],
      ['permissions', 'shield', 'Permissions'],
      ['workspace', 'folder', 'Workspace'],
      ['project', 'search', 'Project'],
      ['agents', 'plug', 'Specialist agents'],
      ['skills', 'bolt', 'Skills'],
      ['mcp', 'plug', 'MCP servers'],
      ['cron', 'clock', 'Scheduled / heartbeat'],
      ['developer', 'gear', 'Developer']
    ];
    $('setnav').innerHTML =
      '<button class="back" id="setBack">' + icon('back') + ' Back to app</button>' +
      '<div class="sect">Settings</div>' +
      items.map(function (it) {
        return '<button class="item ' + (S.setSection === it[0] ? 'active' : '') + '" data-sec="' + it[0] + '"><span class="ico">' + icon(it[1]) + '</span>' + it[2] + '</button>';
      }).join('');
    $('setBack').onclick = closeSettings;
    $('setnav').querySelectorAll('[data-sec]').forEach(function (el) {
      el.onclick = function () { S.setSection = el.getAttribute('data-sec'); renderSettings(); };
    });
    var b = $('setbody');
    // Async sections seed an instant loading row instead of a blank flash.
    if (S.setSection !== 'general' && S.setSection !== 'workspace') {
      b.innerHTML = '<h1>' + esc(S.setSection === 'mcp' ? 'MCP servers' : S.setSection === 'skills' ? 'Skills' : S.setSection === 'agents' ? 'Specialist agents' : S.setSection === 'cron' ? 'Scheduled / heartbeat' : S.setSection === 'connections' ? 'Connections' : S.setSection) + '</h1><p class="meta" style="color:var(--muted);font-size:12.5px">loading…</p>';
    }
    if (S.setSection === 'general') {
      b.innerHTML = '<h1>General</h1>' + themeOptionsHtml() +
        '<h2>Defaults</h2><div class="setcard">' +
        '<div class="setrow"><div class="grow"><div class="t">Agent workflow</div><div class="d">One conversation for questions and changes. Quick edits get focused checks. Use Plan in the composer to review a plan for one request, then continue building.</div></div><span class="chip">Always on</span></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Intelligence level</div><div class="d">Reasoning effort sent to the model (dynamic per provider).</div></div><select id="gEffort"></select></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Keep going until done</div><div class="d">The agent recovers from provider and protocol errors — empty completions, malformed replies, repeated calls — instead of stopping itself mid-task. Off restores the original fail-fast limits.</div></div><input type="checkbox" id="gPersist" style="width:18px;height:18px;flex:none"></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Spend ceiling</div><div class="d">Optional per-run limit in USD. Left empty, a run is never stopped for cost — only by you, or by finishing the task.</div></div><input type="text" id="gSpend" inputmode="decimal" placeholder="none" style="width:96px;background:var(--card2);border:1px solid var(--border2);color:var(--text);border-radius:8px;padding:6px 9px;font:inherit;font-size:13px"></div>' +
        '</div>';
      fillEffort('gEffort', provOf(S.sel.model));
      $('gEffort').value = S.sel.effort;
      $('gEffort').onchange = function () { S.sel.effort = $('gEffort').value; persist(); };
      var gPersist = $('gPersist'), gSpend = $('gSpend');
      if (gPersist) gPersist.checked = S.sel.persistent !== false;
      if (gSpend) gSpend.value = String(S.sel.spendCeilingUsd || '');
      var saveAutonomy = function () {
        var raw = String(gSpend.value || '').trim();
        var persistent = gPersist.checked;
        // An empty field sends null, which clears the ceiling — "no spend
        // limit" must stay expressible, and it is the default.
        api('/api/autonomy', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ persistent: persistent, maxCostUsd: raw === '' ? null : raw })
        }).then(function (saved) {
          S.sel.persistent = saved.persistent !== false;
          S.sel.spendCeilingUsd = saved.maxCostUsd === undefined ? '' : String(saved.maxCostUsd);
          persist();
          toast('Autonomy: ' + (S.sel.persistent ? 'keeps going until done' : 'fail fast') + (S.sel.spendCeilingUsd ? ' · $' + S.sel.spendCeilingUsd + ' ceiling' : ''));
        }).catch(function (e) { toast(e.message, true); });
      };
      if (gPersist) gPersist.onchange = saveAutonomy;
      if (gSpend) gSpend.onchange = saveAutonomy;
      api('/api/home').then(function (h) {
        if (!$('gPersist') || S.setSection !== 'general') return;
        var a = (h && h.autonomy) || {};
        $('gPersist').checked = a.persistent !== false;
        if ($('gSpend')) $('gSpend').value = a.maxCostUsd === undefined ? '' : String(a.maxCostUsd);
      }).catch(function () {});
      b.insertAdjacentHTML('beforeend', '<h2>Getting started</h2><p class="appearance-description">Choose your theme, connect a provider, and pick a workspace.</p><button class="btn ghost" id="setupAgain">Open setup wizard</button>');
      $('setupAgain').onclick = function () { closeSettings(); openSetupWizard(); };
    } else if (S.setSection === 'cowork') {
      b.innerHTML = '<h1>Cowork</h1>' +
        '<p style="color:var(--muted);font-size:12.5px;max-width:640px">Shared context for your agent team. Every teammate receives this in their system prompt, and they will update it themselves when you ask them to in a chat (or when you share something durable about you).</p>' +
        '<div class="setcard" style="margin-bottom:12px"><div class="t" style="margin:14px 18px 10px">About you</div>' +
        '<div style="display:grid;gap:8px;max-width:620px;padding:0 18px 16px">' +
        '<input id="cwSetName" placeholder="Your name" style="background:var(--card2);border:1px solid var(--border2);color:var(--text);border-radius:8px;padding:7px 10px;font:inherit;font-size:13px">' +
        '<textarea id="cwSetAbout" rows="4" placeholder="About you — role, company, current focus…" style="background:var(--card2);border:1px solid var(--border2);color:var(--text);border-radius:8px;padding:7px 10px;font:inherit;font-size:13px;resize:vertical"></textarea>' +
        '<textarea id="cwSetPrefs" rows="3" placeholder="Working preferences — tone, hours, tools to prefer or avoid…" style="background:var(--card2);border:1px solid var(--border2);color:var(--text);border-radius:8px;padding:7px 10px;font:inherit;font-size:13px;resize:vertical"></textarea>' +
        '<div><button class="btn dark" id="cwSetProfileSave">Save</button></div></div></div>' +
        '<div class="setcard" style="margin-bottom:12px"><div class="setrow"><div class="grow"><div class="t">Require approval for skill changes</div><div class="d">When on, teammates cannot save or improve skills directly — their changes are staged here for your review first. Applies to the whole team.</div></div><input type="checkbox" id="cwSkillApproval" style="width:18px;height:18px;flex:none"' + '></div>' +
        '<div id="cwPendingBody"></div></div>';
      api('/api/cowork/profile').then(function (d) {
        if (S.setSection !== 'cowork' || !$('cwSetName')) return;
        $('cwSetName').value = (d.profile && d.profile.name) || '';
        $('cwSetAbout').value = (d.profile && d.profile.about) || '';
        $('cwSetPrefs').value = (d.profile && d.profile.preferences) || '';
      }).catch(function () {});
      api('/api/cowork/profile').then(function (d) {
        if (S.setSection !== 'cowork' || !$('cwSetName')) return;
        $('cwSetName').value = (d.profile && d.profile.name) || '';
        $('cwSetAbout').value = (d.profile && d.profile.about) || '';
        $('cwSetPrefs').value = (d.profile && d.profile.preferences) || '';
      }).catch(function () {});
      // Skill-write approval: a review panel that lists staged teammate skill
      // changes, plus the toggle that turns staging on.
      api('/api/cowork/learning').then(function (d) {
        if (S.setSection !== 'cowork' || !$('cwSkillApproval')) return;
        $('cwSkillApproval').checked = d.skillApproval === true;
      }).catch(function () {});
      $('cwSkillApproval').onchange = function () {
        api('/api/cowork/learning', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ skillApproval: $('cwSkillApproval').checked }) })
          .then(function () { toast($('cwSkillApproval').checked ? 'Skill changes now need your approval' : 'Skill changes apply directly'); renderSettings(); })
          .catch(function (e) { toast(e.message, true); });
      };
      var pendingBody = $('cwPendingBody');
      api('/api/cowork/skills/pending').then(function (d) {
        if (S.setSection !== 'cowork' || !$('cwPendingBody')) return;
        var items = d.pending || [];
        if (!items.length) { $('cwPendingBody').innerHTML = '<div style="font-size:12px;color:var(--muted);padding:0 18px 14px">Nothing waiting. Teammates stage changes here when approval is on.</div>'; return; }
        $('cwPendingBody').innerHTML = items.map(function (p) {
          return '<div style="border-top:1px solid var(--border);padding:10px 18px">' +
            '<div style="font-weight:600;font-size:13px">' + esc(p.name) + ' <span class="chip">' + (p.kind === 'create' ? 'new skill' : 'improve') + '</span></div>' +
            '<div style="font-size:11.5px;color:var(--muted);margin-top:2px">' + esc(p.description || '') + '</div>' +
            '<pre style="white-space:pre-wrap;font-family:var(--mono);font-size:11px;background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:8px;margin-top:6px;max-height:140px;overflow:auto">' + esc(p.instructions || '(no instruction changes)') + '</pre>' +
            '<div style="display:flex;gap:8px;margin-top:8px"><button class="btn dark" data-cwapprove="' + esc(p.id) + '">Approve</button><button class="btn ghost" data-cwreject="' + esc(p.id) + '">Reject</button></div>' +
            '</div>';
        }).join('');
        $('cwPendingBody').querySelectorAll('[data-cwapprove]').forEach(function (btn) {
          btn.onclick = function () {
            var id = this.getAttribute('data-cwapprove');
            api('/api/cowork/skills/pending/' + encodeURIComponent(id) + '/approve', { method: 'POST' })
              .then(function (r) { toast(r.skill ? 'Skill "' + r.skill.name + '" saved' : 'Skill approved'); renderSettings(); })
              .catch(function (e) { toast(e.message, true); });
          };
        });
        $('cwPendingBody').querySelectorAll('[data-cwreject]').forEach(function (b) {
          b.onclick = function () {
            api('/api/cowork/skills/pending/' + encodeURIComponent(this.getAttribute('data-cwreject')) + '/reject', { method: 'POST' })
              .then(function () { toast('Change rejected'); renderSettings(); })
              .catch(function (e) { toast(e.message, true); });
          };
        });
      }).catch(function () {});
      $('cwSetProfileSave').onclick = function () {
        var btn = this;
        btn.disabled = true; btn.textContent = 'Saving…';
        api('/api/cowork/profile', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: $('cwSetName').value, about: $('cwSetAbout').value, preferences: $('cwSetPrefs').value }) })
          .then(function () { toast('Team context saved'); })
          .catch(function (e) { toast(e.message, true); })
          .finally(function () { btn.disabled = false; btn.textContent = 'Save'; });
      };
    } else if (S.setSection === 'developer') {
      b.innerHTML = '<h1>Developer</h1>' +
        '<div class="setcard">' +
        '<div class="setrow"><div class="grow"><div class="t">Show agent diagnostics</div>' +
        '<div class="d">Renders the raw agent protocol in the timeline: model protocol repairs, recovery ladders, malformed-reply streaks, internal activity (checkpoints, diff snapshots), full token telemetry, and internal events that are hidden by default. Normal users should leave this off.</div></div>' +
        '<label style="display:flex;align-items:center;gap:8px;flex:none"><input type="checkbox" id="gDevMode" ' + (S.settings.devMode ? 'checked' : '') + ' style="width:18px;height:18px"><span style="font-size:12.5px">' + (S.settings.devMode ? 'on' : 'off') + '</span></label></div>' +
        '</div>';
      $('gDevMode').onchange = function () {
        S.settings.devMode = $('gDevMode').checked;
        persist();
        renderSettings();
      };
    } else if (S.setSection === 'connections') {
      b.innerHTML = '<h1>Connections</h1>' +
        '<p style="color:var(--muted);font-size:12.5px">Save a provider connection once, then let tasks reuse its documented capabilities. Credentials stay separate from global skills, task history, and model context.</p>' +
        '<div class="setcard" style="margin-bottom:12px"><div class="t" style="margin-bottom:10px">Add a provider connection</div>' +
        '<div class="d" style="margin-bottom:10px">The form registers a read-only validation path. During a task, Gitu can research a documented write operation and show its exact request for your individual approval; it never gains unrestricted provider write access.</div>' +
        '<div style="display:grid;gap:8px;max-width:620px">' +
        '<input id="connLabel" placeholder="Connection name (for example: Production platform)">' +
        '<input id="connProvider" placeholder="Provider identifier (for example: platform-api)">' +
        '<input id="connBaseUrl" placeholder="Base URL (HTTPS, or HTTP only for localhost)">' +
        '<input id="connDocsUrl" placeholder="Documentation URL (optional, HTTPS)">' +
        '<input id="connCapabilities" placeholder="Capabilities, comma-separated (for example: servers.read, databases.read)">' +
        '<input id="connValidationPath" value="/" placeholder="Read-only validation path, for example: /api/v1/servers">' +
        '<input id="connToken" type="password" autocomplete="new-password" placeholder="Paste API key or token — never sent to the model">' +
        '<div><button class="btn dark" id="saveConnection">Save and validate</button></div></div></div>' +
        '<div class="setcard" id="connectionsBody"><div class="meta">loading connections…</div></div>';
      function renderConnections() {
        api('/api/connections').then(function (data) {
          var body = $('connectionsBody');
          if (!body || S.setSection !== 'connections') return;
          var rows = data.connections || [];
          body.innerHTML = rows.map(function (c) {
            var capabilities = (c.capabilities || []).join(', ') || 'no declared capabilities';
            var status = c.lastValidationStatus === 'ok' ? '<span class="chip ok">validated</span>' : c.lastValidationStatus === 'failed' ? '<span class="chip bad">validation failed</span>' : '<span class="chip">not tested</span>';
            return '<div class="setrow" style="align-items:flex-start"><div class="grow"><div class="t">' + esc(c.label) + ' ' + status + '</div><div class="d">' + esc(c.provider) + ' · ' + esc(capabilities) + '</div><div class="hint">' + esc(c.baseUrl) + (c.documentationUrl ? ' · docs configured' : '') + ' · credential ' + (c.hasCredential ? 'saved locally' : 'missing') + '</div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn ghost" data-testconn="' + esc(c.id) + '">Test</button><button class="btn ghost" data-delconn="' + esc(c.id) + '">Remove</button></div></div>';
          }).join('') || '<div class="meta">No saved connections yet.</div>';
          body.querySelectorAll('[data-testconn]').forEach(function (btn) {
            btn.onclick = function () {
              var id = btn.getAttribute('data-testconn'); btn.disabled = true; btn.textContent = 'Testing…';
              api('/api/connections/' + encodeURIComponent(id) + '/test', { method: 'POST' }).then(function () { toast('Connection validated'); renderConnections(); }).catch(function (e) { toast((e && e.message) || 'Connection failed', true); }).finally(function () { btn.disabled = false; btn.textContent = 'Test'; });
            };
          });
          body.querySelectorAll('[data-delconn]').forEach(function (btn) {
            btn.onclick = function () {
              var id = btn.getAttribute('data-delconn');
              if (!window.confirm('Remove this connection, its local credential, and its generated global skill?')) return;
              api('/api/connections/' + encodeURIComponent(id), { method: 'DELETE' }).then(function () { toast('Connection removed'); renderConnections(); }).catch(function (e) { toast((e && e.message) || 'Could not remove connection', true); });
            };
          });
        }).catch(function (e) { if ($('connectionsBody')) $('connectionsBody').innerHTML = '<div class="meta">Could not load connections: ' + esc((e && e.message) || 'unknown error') + '</div>'; });
      }
      $('saveConnection').onclick = function () {
        var btn = this;
        var caps = $('connCapabilities').value.split(',').map(function (v) { return v.trim(); }).filter(Boolean);
        var capability = caps[0] || 'connection.discover';
        var profile = {
          label: $('connLabel').value,
          provider: $('connProvider').value,
          baseUrl: $('connBaseUrl').value,
          documentationUrl: $('connDocsUrl').value,
          capabilities: caps.length ? caps : [capability],
          operations: [{ id: 'validate', label: 'Validate saved connection', capability: capability, method: 'GET', path: $('connValidationPath').value || '/', risk: 'read' }],
          token: $('connToken').value
        };
        btn.disabled = true; btn.textContent = 'Saving…';
        api('/api/connections', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profile) })
          .then(function (result) { return api('/api/connections/' + encodeURIComponent(result.connection.id) + '/test', { method: 'POST' }); })
          .then(function () { $('connToken').value = ''; toast('Connection saved and validated'); renderConnections(); })
          .catch(function (e) { toast((e && e.message) || 'Could not save connection', true); })
          .finally(function () { btn.disabled = false; btn.textContent = 'Save and validate'; });
      };
      renderConnections();
    } else if (S.setSection === 'providers') {
      b.innerHTML = '<h1>Providers</h1>' +
        '<p style="color:var(--muted);font-size:12.5px">Connect a provider, then choose the default model used for new tasks.</p>' +
        '<div class="setcard" style="margin-bottom:10px"><div class="setrow"><div class="grow"><div class="t">Bring your own compatible provider</div><div class="d">Add an OpenAI-compatible endpoint. Its key stays in Agent Gitu’s local key store; native tools safely downgrade when unsupported.</div></div><button class="btn dark" id="addCustomProvider">Add provider</button><button class="btn ghost" id="editFallbackModels">Fallback models</button></div></div>' +
        '<div class="provider-toolbar"><input type="text" id="providerFilter" placeholder="Filter providers…" aria-label="Filter providers"><span class="meta" id="providerSummary"></span></div>' +
        '<div class="setcard" id="provBody"><div class="meta">loading providers…</div></div>';
      var addCustomProvider = $('addCustomProvider');
      if (addCustomProvider) addCustomProvider.onclick = function () {
        var label = window.prompt('Provider name (for example: Team gateway)');
        if (!label) return;
        var slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
        if (!slug) { toast('Use a name with letters or numbers', true); return; }
        var baseUrl = window.prompt('OpenAI-compatible base URL (HTTPS, or HTTP only for localhost)');
        if (!baseUrl) return;
        var defaultModel = window.prompt('Default model ID');
        if (!defaultModel) return;
        var keyEnvVar = 'HERMES_CUSTOM_' + slug.toUpperCase().replace(/-/g, '_');
        var toolMode = window.prompt('Tool mode: auto, native, structured_text, or text', 'auto') || 'auto';
        var profile = { id: 'custom-' + slug, label: label, baseUrl: baseUrl, defaultModel: defaultModel, keyEnvVar: keyEnvVar, toolMode: toolMode };
        api('/api/provider-profiles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(profile) })
          .then(function () {
            var key = window.prompt('Paste an API key now (optional — you can add it from the provider row)');
            if (!key) { toast('Custom provider saved'); refreshModels(); return null; }
            return api('/api/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ envVar: keyEnvVar, key: key }) });
          })
          .then(function () { refreshModels(); })
          .catch(function (e) { toast((e && e.message) || 'Could not save provider', true); });
      };
      var editFallbackModels = $('editFallbackModels');
      if (editFallbackModels) editFallbackModels.onclick = function () {
        api('/api/model-fallbacks').then(function (data) {
          var current = (data.fallbackModels || []).join(', ');
          var raw = window.prompt('Fallbacks in priority order, comma-separated (provider::model). Cross-provider fallbacks run only when listed here.', current);
          if (raw === null) return;
          var fallbackModels = raw.split(',').map(function (v) { return v.trim(); }).filter(Boolean);
          return api('/api/model-fallbacks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fallbackModels: fallbackModels }) })
            .then(function () { toast('Fallback models saved'); });
        }).catch(function (e) { toast((e && e.message) || 'Could not save fallbacks', true); });
      };
      Promise.all([loadModelCatalog(), api('/api/keys').catch(function () { return { stored: [] }; })]).then(function (res) {
        var stored = (res[1] && res[1].stored) || [];
        var body = $('provBody');
        if (!body || S.setSection !== 'providers') return;
        var cur = S.sel.model || '';
        var prov = S.models.slice().sort(function (a, b) { return Number(providerIsUsable(b)) - Number(providerIsUsable(a)); });
        var readyCount = prov.filter(providerIsUsable).length;
        if ($('providerSummary')) $('providerSummary').textContent = readyCount + ' ready · ' + (prov.length - readyCount) + ' need setup';
        body.innerHTML = prov.map(function (p, i) {
          var storedVar = (p.keyEnvVars || []).filter(function (v) { return stored.indexOf(v) >= 0; })[0];
          var usable = providerIsUsable(p);
          var keyChip = p.hasKey ? '<span class="chip ok">key ready</span>' : '<span class="chip bad">needs key</span>';
          var storedChip = storedVar ? '<span class="chip">stored</span>' : '';
          var liveChip = p.live ? '<span class="chip">live</span>' : '';
          var models = p.models || [];
          var selInProv = cur.indexOf(p.id + '::') === 0 ? cur.split('::')[1] : '';
          var activeChip = selInProv ? '<span class="chip ok">active</span>' : '';
          var btnModel = titleCase(selInProv || p.defaultModel);
          if (p.auth === 'chatgpt-subscription') {
            // Codex owns this credential; Agent Gitu only receives safe
            // signed-in / plan state and never sees a token or email address.
            keyChip = usable
              ? '<span class="chip ok">signed in' + (p.planType ? ' · ' + esc(p.planType) : '') + '</span>'
              : '<span class="chip bad">' + (p.available === false ? 'Codex unavailable' : 'not signed in') + '</span>';
          }
          var setupLabel = p.auth === 'chatgpt-subscription' ? 'Sign in first' : 'Add key first';
          var modelTitle = usable ? 'Search ' + esc(p.label) + ' models' : setupLabel;
          var manageTitle = p.auth === 'chatgpt-subscription' ? 'manage ChatGPT sign-in' : (storedVar || p.hasKey ? 'manage' : 'add') + ' the API key';
          return '<div class="setrow" data-provider-row="' + esc((p.label + ' ' + p.id).toLowerCase()) + '" style="align-items:flex-start"><div class="grow">' +
            '<div class="prov-head" data-provhead="' + i + '" role="button" tabindex="0" aria-expanded="false" title="Tap to ' + manageTitle + '">' +
              '<span class="prov-chev">&#9654;</span>' +
              '<div><div class="t">' + esc(p.label) + ' <span class="meta">(' + esc(p.id) + ')</span> ' + keyChip + storedChip + ' ' + liveChip + activeChip + '</div>' +
              '<div class="d">' + models.length + ' models' + (p.keyEnvVars && !p.hasKey ? ' · env: ' + esc(p.keyEnvVars.join(' | ')) : '') + '</div></div>' +
            '</div>' +
            '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:4px">' +
              '<div class="pm-wrap" data-pmwrap="' + i + '">' +
                '<button type="button" class="pm-btn" data-pmbtn="' + i + '" title="' + modelTitle + '"' + (usable ? '' : ' disabled') + '>' +
                  '<span class="pm-name">' + esc(usable ? btnModel : setupLabel) + '</span>' +
                  '<span class="caret">&#9660;</span>' +
                '</button>' +
                '<div class="model-menu pm-menu" hidden><input type="text" placeholder="Search models…"><div class="model-list"></div><div class="model-count"></div></div>' +
              '</div>' +
            '</div>' +
            '<div class="keysec">' +
              (p.auth === 'chatgpt-subscription'
                ? (usable
                    ? '<div class="hint">Connected through local Codex' + (p.planType ? ' (' + esc(p.planType) + ')' : '') + '. Your ChatGPT credentials remain in Codex.</div>'
                    : '<button type="button" class="btn dark" id="chatgptSignin">Sign in with ChatGPT</button>' +
                      '<div class="hint">Opens the secure Codex sign-in flow. It uses the models included with your ChatGPT plan instead of an API key.</div>')
                : '<input type="password" id="keyin-' + i + '" placeholder="paste ' + esc(p.id) + ' API key"' + (p.keyEnvVars && p.keyEnvVars.length ? ' title="stored locally as env var ' + esc(p.keyEnvVars.join(' or ')) + '"' : '') + ' style="margin:0;max-width:280px">' +
                  '<button class="btn dark" data-savekey="' + i + '">Save key</button>' +
                  '<button class="btn ghost" data-eye="' + i + '" title="show or hide the key">Show</button>' +
                  (storedVar ? '<button class="btn ghost" data-delkey="' + esc(storedVar) + '">Remove stored key</button>' : '') +
                  (p.custom ? '<button class="btn ghost" data-testprofile="' + esc(p.id) + '" data-profilemodel="' + esc(p.defaultModel) + '">Test connection</button><button class="btn ghost" data-deleteprofile="' + esc(p.id) + '">Remove provider</button>' : '') +
                  (p.keyEnvVars && p.keyEnvVars.length ? '<div class="hint">stored locally as env var ' + esc(p.keyEnvVars.join(' or ')) + '</div>' : '')) +
            '</div>' +
            '</div></div>';
        }).join('') || '<div class="meta">no providers available</div>';
        var cgSignin = $('chatgptSignin');
        if (cgSignin) cgSignin.onclick = function () {
          cgSignin.disabled = true;
          cgSignin.textContent = 'Opening sign-in…';
          api('/api/chatgpt/login', { method: 'POST' }).then(function (r) {
            if (r && r.url) window.open(r.url, '_blank', 'noopener');
            var tries = 0;
            var poll = function () {
              tries += 1;
              if (tries > 150) return; // ~5 min, matching the server-side timeout
              api('/api/chatgpt/auth').then(function (st) {
                if (st && st.loggedIn) {
                  toast('ChatGPT connected');
                  renderSettings();
                  return;
                }
                setTimeout(poll, 2000);
              }).catch(function () { setTimeout(poll, 2000); });
            };
            setTimeout(poll, 1500);
          }).catch(function (e) {
            cgSignin.disabled = false;
            cgSignin.textContent = 'Sign in with ChatGPT';
            toast('ChatGPT sign-in failed: ' + ((e && e.message) || e), true);
          });
        };
        body.querySelectorAll('[data-testprofile]').forEach(function (btn) {
          btn.onclick = function () {
            var id = btn.getAttribute('data-testprofile');
            var model = btn.getAttribute('data-profilemodel');
            btn.disabled = true;
            btn.textContent = 'Testing…';
            api('/api/provider-profiles/' + encodeURIComponent(id) + '/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: model }) })
              .then(function () { toast('Connection successful'); })
              .catch(function (e) { toast((e && e.message) || 'Connection failed', true); })
              .finally(function () { btn.disabled = false; btn.textContent = 'Test connection'; });
          };
        });
        body.querySelectorAll('[data-deleteprofile]').forEach(function (btn) {
          btn.onclick = function () {
            var id = btn.getAttribute('data-deleteprofile');
            if (!window.confirm('Remove this provider profile? Its locally stored key is not deleted.')) return;
            api('/api/provider-profiles/' + encodeURIComponent(id), { method: 'DELETE' })
              .then(function () { toast('Provider removed'); refreshModels(); })
              .catch(function (e) { toast((e && e.message) || 'Could not remove provider', true); });
          };
        });
        var providerFilter = $('providerFilter');
        if (providerFilter) providerFilter.oninput = function () {
          var q = providerFilter.value.toLowerCase().trim();
          body.querySelectorAll('[data-provider-row]').forEach(function (row) {
            row.hidden = Boolean(q && row.getAttribute('data-provider-row').indexOf(q) < 0);
          });
        };
        function closeAllPm(except) {
          body.querySelectorAll('.pm-wrap.open').forEach(function (w) {
            if (w === except) return;
            w.classList.remove('open');
            var m = w.querySelector('.model-menu');
            if (m) m.hidden = true;
          });
        }
        function pmRender(wrap) {
          var p = prov[Number(wrap.getAttribute('data-pmwrap'))];
          if (!p) return;
          var q = (wrap.querySelector('.model-menu input').value || '').toLowerCase().trim();
          var list = wrap.querySelector('.model-list');
          var curVal = S.sel.model || '';
          var group = catalogModelGroups(p.id, q)[0];
          var matched = group ? group.models : [];
          var count = wrap.querySelector('.model-count');
          if (count) count.textContent = matched.length + (matched.length === 1 ? ' model' : ' models') + (q ? (matched.length === 1 ? ' matches' : ' match') : '');
          list.innerHTML = matched.map(function (m) {
            var val = p.id + '::' + m.id;
            return '<button type="button" class="model-item' + (val === curVal ? ' cur' : '') + '" data-val="' + esc(val) + '" role="option" aria-selected="' + (val === curVal ? 'true' : 'false') + '">' +
              '<div class="mi-top"><span class="mi-prov">' + (m.free ? 'free · no credits needed' : '') + '</span>' +
              '<span class="mi-meta">' + esc(modelMetaText(m)) + '</span>' +
              (val === curVal ? '<span class="mi-cur" title="current default">&#10003;</span>' : '') + '</div>' +
              '<div class="mi-name">' + markMatch(titleCase(m.id), q) + (m.vision ? ' <i class="vmark" title="supports images">&#9672;</i>' : '') + '</div>' +
              '</button>';
          }).join('') || '<div class="model-empty">No models match &ldquo;' + esc(q) + '&rdquo;<br><span style="font-size:11px">Try a model name</span></div>';
          var hl = list.querySelector('.model-item');
          if (hl) hl.classList.add('hl');
        }
        function pickProvModel(val) {
          S.sel.model = val;
          persist();
          toast('Default model: ' + modelLabelText(val));
          closeAllPm();
          renderSettings();
        }
        body.querySelectorAll('[data-pmbtn]').forEach(function (btn) {
          btn.onclick = function (e) {
            e.stopPropagation();
            var wrap = btn.closest('.pm-wrap');
            var menu = wrap.querySelector('.model-menu');
            var opening = menu.hidden;
            closeAllPm(wrap);
            if (!opening) return;
            wrap.classList.add('open');
            menu.hidden = false;
            var inp = menu.querySelector('input');
            inp.value = '';
            pmRender(wrap);
            setTimeout(function () { inp.focus(); }, 0);
          };
        });
        body.querySelectorAll('[data-pmwrap]').forEach(function (wrap) {
          var inp = wrap.querySelector('.model-menu input');
          inp.oninput = function () { pmRender(wrap); };
          inp.onkeydown = function (e) {
            var items = wrap.querySelectorAll('.model-item');
            if (e.key === 'Enter') {
              var hl = wrap.querySelector('.model-item.hl') || items[0];
              if (hl) pickProvModel(hl.getAttribute('data-val'));
              e.preventDefault();
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              // A filtered-empty list has no rows to highlight — navigating
              // must not crash on items[-1].
              if (!items.length) { e.preventDefault(); return; }
              var dir = e.key === 'ArrowDown' ? 1 : -1;
              var at = -1;
              for (var k = 0; k < items.length; k++) if (items[k].classList.contains('hl')) { at = k; break; }
              var next = at < 0 ? (dir > 0 ? 0 : items.length - 1) : (at + dir + items.length) % items.length;
              if (at >= 0) items[at].classList.remove('hl');
              items[next].classList.add('hl');
              if (items[next].scrollIntoView) items[next].scrollIntoView({ block: 'nearest' });
              e.preventDefault();
            } else if (e.key === 'Escape') {
              closeAllPm();
            }
            e.stopPropagation();
          };
          wrap.querySelector('.model-list').onmousedown = function (e) {
            var item = e.target.closest ? e.target.closest('.model-item') : null;
            if (item) { e.preventDefault(); pickProvModel(item.getAttribute('data-val')); }
          };
        });
        body.querySelectorAll('[data-provhead]').forEach(function (head) {
          head.onclick = function () {
            var idx = Number(head.getAttribute('data-provhead'));
            var row = head.closest('.setrow');
            var wasOpen = row.classList.contains('prov-open');
            body.querySelectorAll('.setrow').forEach(function (r) {
              r.classList.remove('prov-open');
              var ph = r.querySelector('[data-provhead]');
              if (ph) ph.setAttribute('aria-expanded', 'false');
              var ks = r.querySelector('.keysec');
              if (ks) ks.classList.remove('show');
            });
            if (!wasOpen) {
              row.classList.add('prov-open');
              head.setAttribute('aria-expanded', 'true');
              S.provOpen = idx;
              var ks = row.querySelector('.keysec');
              if (ks) ks.classList.add('show');
              var pin = ks ? ks.querySelector('input[type=password]') : null;
              if (pin) setTimeout(function () { pin.focus(); }, 0);
            } else S.provOpen = null;
          };
          head.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); head.click(); } };
        });
        if (typeof S.provOpen === 'number') {
          var orow = body.querySelectorAll('.setrow')[S.provOpen];
          if (orow && orow.querySelector('[data-provhead]')) {
            orow.classList.add('prov-open');
            orow.querySelector('[data-provhead]').setAttribute('aria-expanded', 'true');
            var oks = orow.querySelector('.keysec');
            if (oks) oks.classList.add('show');
          } else S.provOpen = null;
        }
        if (!S.provDocBound) {
          S.provDocBound = true;
          document.addEventListener('click', function (e) {
            var b2 = document.getElementById('provBody');
            if (!b2 || !b2.isConnected) return;
            if (e.target.closest && e.target.closest('.pm-wrap')) return;
            b2.querySelectorAll('.pm-wrap.open').forEach(function (w) {
              w.classList.remove('open');
              var m = w.querySelector('.model-menu');
              if (m) m.hidden = true;
            });
          });
        }
        body.querySelectorAll('[data-savekey]').forEach(function (btn) {
          btn.onclick = function () {
            var i = Number(btn.getAttribute('data-savekey'));
            var p = prov[i];
            var input = $('keyin-' + i);
            var key = input ? input.value.trim() : '';
            if (!p || !key) { toast('Paste an API key first', true); return; }
            var envVar = (p.keyEnvVars || [])[0];
            S.provOpen = i;
            api('/api/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ envVar: envVar, key: key }) })
              .then(function () { toast('Key saved for ' + p.id); refreshModels(); })
              .catch(function (e) { toast(e.message, true); });
          };
        });
        body.querySelectorAll('[data-eye]').forEach(function (btn) {
          btn.onclick = function () {
            var i = Number(btn.getAttribute('data-eye'));
            var inp = $('keyin-' + i);
            if (!inp) return;
            var show = inp.type === 'password';
            inp.type = show ? 'text' : 'password';
            btn.textContent = show ? 'Hide' : 'Show';
          };
        });
        body.querySelectorAll('[data-delkey]').forEach(function (btn) {
          btn.onclick = function () {
            var v = btn.getAttribute('data-delkey');
            var head = btn.closest('.setrow') ? btn.closest('.setrow').querySelector('[data-provhead]') : null;
            if (head) S.provOpen = Number(head.getAttribute('data-provhead'));
            api('/api/keys/' + v, { method: 'DELETE' })
              .then(function () { toast('Removed ' + v); refreshModels(); })
              .catch(function (e) { toast(e.message, true); });
          };
        });
      }).catch(function () {
        var body = $('provBody');
        if (body) body.innerHTML = '<div class="meta">failed to load providers</div>';
      });
    } else if (S.setSection === 'permissions') {
      b.innerHTML = '<h1>Permissions</h1>' +
        '<div class="setcard">' +
        '<div class="setrow"><div class="grow"><div class="t">Auto-learn reusable skills</div><div class="d">After a successful task the agent reflects on what it did and saves any repeatable multi-step pattern (deploy flows, design conventions, checklists) as a skill with create_skill. Turn off to stop all proactive skill creation.</div></div><button class="toggle ' + (S.settings.autoLearn ? 'on' : '') + '" id="pLearn"></button></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Cowork learning mode</div><div class="d">When your cowork teammates learn from their work. <b>On each task</b> reflects after every completed turn (the original behavior). <b>Scheduled review</b> keeps ordinary turns quiet and reflects on a timer instead, plus a daily memory consolidation sweep. <b>Off</b> stops cowork learning entirely.</div></div><select id="pCwLearn"><option value="reactive">On each task (original)</option><option value="proactive">Scheduled review</option><option value="off">Off</option></select></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Plan review</div><div class="d">In Plan mode the agent waits for your approval before building.</div></div><button class="toggle ' + (S.settings.review ? 'on' : '') + '" id="pReview"></button></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Auto-approve dangerous actions</div><div class="d">Skips the approval gate for destructive commands. Significantly increases risk of data loss.</div></div><button class="toggle ' + (S.settings.autoApprove ? 'on' : '') + '" id="pAuto"></button></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Loop prevention</div><div class="d">Repeated failing actions are blocked automatically. Always on.</div></div><button class="toggle on" disabled></button></div>' +
        '<div class="setrow"><div class="grow"><div class="t">Evidence gate</div><div class="d">Tasks cannot complete without passing evidence for every criterion. Always on.</div></div><button class="toggle on" disabled></button></div>' +
        '</div>';
      $('pLearn').onclick = function () { S.settings.autoLearn = !S.settings.autoLearn; persist(); renderSettings(); };
      $('pReview').onclick = function () { S.settings.review = !S.settings.review; persist(); renderSettings(); };
      $('pAuto').onclick = function () { S.settings.autoApprove = !S.settings.autoApprove; persist(); renderSettings(); };
      var cwLearn = $('pCwLearn');
      if (cwLearn) {
        if (['reactive', 'proactive', 'off'].indexOf(S.settings.cwLearn) < 0) S.settings.cwLearn = 'reactive';
        cwLearn.value = S.settings.cwLearn;
        // The server is authoritative (the loop also runs when this UI is closed).
        api('/api/cowork/learning').then(function (r) {
          if (!r || ['reactive', 'proactive', 'off'].indexOf(r.mode) < 0) return;
          S.settings.cwLearn = r.mode; persist();
          if ($('pCwLearn')) $('pCwLearn').value = r.mode;
        }).catch(function () {});
        cwLearn.onchange = function () {
          var mode = this.value;
          var label = mode === 'proactive' ? 'Scheduled review' : mode === 'off' ? 'Off' : 'On each task';
          S.settings.cwLearn = mode;
          persist();
          api('/api/cowork/learning', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: mode }) })
            .then(function (r) {
              S.settings.cwLearn = (r && r.mode) || mode;
              persist();
              toast('Cowork learning: ' + label);
              renderSettings();
            })
            .catch(function (e) { toast(e.message, true); });
        };
      }
    } else if (S.setSection === 'workspace') {
      Promise.all([api('/api/files'), api('/api/home')]).then(function (res) {
        var files = res[0].files || [];
        var home = res[1];
        var sel = S.settings.scope || [];
        b.innerHTML = '<h1>Workspace</h1>' +
          '<div class="setcard"><div class="setrow"><div class="grow"><div class="t">Agent Gitu home</div><div class="d" style="font-family:var(--mono)">' + esc(home.root) + '</div></div></div>' +
          '<div class="setrow"><div class="grow"><div class="t">Projects folder</div><div class="d">Where "New project" creates folders. Defaults to &lt;home&gt;/Projects.</div></div></div>' +
          '<div class="setlist"><input type="text" id="wsProjects" value="' + esc(home.projectsPath) + '" placeholder="' + esc(home.projects) + '">' +
          '<div class="row"><button class="btn dark" id="wsProjectsSave">Save projects folder</button><button class="btn ghost" id="wsProjectsReset">Reset to default</button></div></div></div>' +
          '<h2>File scope</h2>' +
          '<p style="color:var(--muted);font-size:12.5px">Choose which files Agent Gitu should work on. The agent is instructed to stay inside this selection. Leave empty to allow the whole project.</p>' +
          '<div class="setcard"><div class="setlist" style="max-height:300px;overflow-y:auto">' +
          (files.map(function (f) {
            return '<div class="row"><label style="display:flex;gap:8px;align-items:center;font-family:var(--mono);font-size:11.5px"><input type="checkbox" data-f="' + esc(f) + '"' + (sel.indexOf(f) >= 0 ? ' checked' : '') + ' style="width:auto;margin:0">' + esc(f) + '</label></div>';
          }).join('') || '<div class="meta">no files found</div>') +
          '</div></div>' +
          '<h2>Constraints</h2><div class="setcard"><div class="setlist">' +
          '<textarea id="wsCons" rows="3" placeholder="Extra rules, one per line (e.g. Do not touch the billing module)">' + esc(S.settings.constraints || '') + '</textarea>' +
          '<div class="row"><button class="btn dark" id="wsSave">Save workspace</button><button class="btn ghost" id="wsClear">Clear selection</button></div></div></div>';
        $('wsSave').onclick = function () {
          var chosen = [];
          b.querySelectorAll('input[data-f]').forEach(function (cb) { if (cb.checked) chosen.push(cb.getAttribute('data-f')); });
          S.settings.scope = chosen;
          S.settings.constraints = $('wsCons').value;
          persist();
          toast('Workspace saved — ' + chosen.length + ' file(s) in scope');
        };
        $('wsClear').onclick = function () { S.settings.scope = []; persist(); renderSettings(); };
        $('wsProjectsSave').onclick = function () {
          api('/api/home/workspace', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectsPath: $('wsProjects').value.trim() }) })
            .then(function (d) { toast('Projects folder: ' + d.projectsPath); renderSettings(); })
            .catch(function (e) { toast(e.message, true); });
        };
        $('wsProjectsReset').onclick = function () {
          api('/api/home/workspace', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ projectsPath: '' }) })
            .then(function () { toast('Projects folder reset to default'); renderSettings(); })
            .catch(function (e) { toast(e.message, true); });
        };
      });
    } else if (S.setSection === 'project') {
      b.innerHTML = '<h1>Project</h1>' +
        '<div class="setcard"><div class="setrow"><div class="grow"><div class="t">Active project path</div><div class="d">Each project has its own chats, skills, MCP servers and cron jobs.</div></div></div>' +
        '<div class="setlist"><input type="text" id="prPath" value="' + esc(effectiveProjectPath()) + '" placeholder="C:\\path\\to\\project">' +
        '<div class="row"><button class="btn dark" id="prSave">Save project</button><button class="btn ghost" id="prBrowse">Browse folders…</button></div></div></div>';
      $('prBrowse').onclick = openFolderBrowser;
      $('prSave').onclick = function () {
        S.settings.projectPath = $('prPath').value.trim();
        persist();
        updateProjChip();
        renderSidebar();
      };
    } else if (S.setSection === 'agents') {
      Promise.all([api('/api/agents'), loadModelCatalog()]).then(function (res) {
        var agents = res[0].agents || [];
        if (S.setSection !== 'agents') return;
        function modelOptions(sel) {
          return '<option value="">(default model)</option>' + catalogSelectOptions(undefined, sel);
        }
        b.innerHTML = '<h1>Specialist agents</h1>' +
          '<p style="color:var(--muted);font-size:12.5px">Named worker agents that the main agent can run in parallel with the delegate tool on big projects. The main agent uses the <b>Agent ID / Name</b> to delegate tasks. Each agent can use a different provider, model, and reasoning effort.</p>' +
          '<div style="margin:12px 0"><button class="btn dark" id="agNew">+ New agent</button></div>' +
          '<div class="setcard" id="agForm" hidden><div class="setlist">' +
          '<div><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Agent Name / Identifier (used by delegate):</label>' +
          '<input id="agName" placeholder="e.g. explore, frontend, tester, researcher"></div>' +
          '<div class="row"><div style="flex:1"><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Model & Provider:</label>' +
          '<select id="agModel" style="width:100%">' + modelOptions('') + '</select></div>' +
          '<div><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Effort:</label>' +
          '<select id="agEffort"><option value="">effort: default</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="max">max</option></select></div></div>' +
          '<div><label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px">Role & Specialty Instructions:</label>' +
          '<textarea id="agRole" rows="3" placeholder="e.g. You are a repository exploration specialist: trace code paths, identify symbols, discover references…"></textarea></div>' +
          '<div class="row"><button class="btn dark" id="agSave">Save agent</button><button class="btn ghost" id="agCancel">Cancel</button><span class="meta" id="agMeta"></span></div></div></div>' +
          '<div class="setcard">' +
          (agents.length ? agents.map(function (a) {
            return '<div class="skcard"><div class="skhead"><b style="font-size:14px">' + esc(a.name) + '</b>' +
              '<span class="chip" style="background:var(--selected);color:var(--text);font-weight:600;font-size:11px">SPECIALIST</span>' +
              '<span style="flex:1"></span>' +
              '<button class="ubtn" data-agedit="' + esc(a.id) + '" title="edit">' + icon('pencil') + '</button>' +
              '<button class="ubtn" data-agdel="' + esc(a.id) + '" title="delete">' + icon('x') + '</button></div>' +
              '<div style="display:flex;gap:12px;align-items:center;margin:6px 0 4px;font-size:12px;flex-wrap:wrap">' +
              '<span><b>Agent ID:</b> <code style="font-family:var(--mono);background:var(--card2);border:1px solid var(--border);padding:2px 6px;border-radius:4px;color:var(--text);font-weight:600">' + esc(a.name) + '</code></span>' +
              '<span><b>Model:</b> <code style="font-family:var(--mono);background:var(--card2);border:1px solid var(--border);padding:2px 6px;border-radius:4px;color:var(--muted)">' + esc(a.provider ? a.provider + '/' : '') + esc(a.model || 'default') + '</code></span>' +
              (a.effort ? '<span class="chip">' + esc(a.effort) + '</span>' : '') +
              '</div>' +
              '<div class="skdesc" style="margin-top:4px">' + esc(a.role) + '</div></div>';
          }).join('') : '<div class="setlist"><div class="meta">no agents yet — create one and the main agent will start delegating independent sub-tasks to it.</div></div>') +
          '</div>';
        var form = $('agForm');
        $('agNew').onclick = function () {
          form.hidden = false;
          $('agName').value = ''; $('agRole').value = ''; $('agModel').value = ''; $('agEffort').value = ''; $('agMeta').textContent = '';
        };
        $('agCancel').onclick = function () { form.hidden = true; };
        $('agSave').onclick = function () {
          var mv = ($('agModel').value || '').split('::');
          var payload = {
            id: S.agEditing || undefined,
            name: $('agName').value,
            role: $('agRole').value,
            provider: mv[0] || undefined,
            model: mv[1] || undefined,
            effort: $('agEffort').value || undefined
          };
          api('/api/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
            .then(function () { S.agEditing = null; toast('Agent saved'); renderSettings(); })
            .catch(function (e) { toast(e.message, true); });
        };
        b.querySelectorAll('[data-agedit]').forEach(function (el) {
          el.onclick = function () {
            var a = agents.filter(function (x) { return x.id === el.getAttribute('data-agedit'); })[0];
            if (!a) return;
            form.hidden = false;
            S.agEditing = a.id;
            $('agName').value = a.name;
            $('agRole').value = a.role;
            $('agEffort').value = a.effort || '';
            $('agModel').value = a.provider && a.model ? a.provider + '::' + a.model : (a.model || '');
            $('agMeta').textContent = 'editing ' + a.name;
          };
        });
        b.querySelectorAll('[data-agdel]').forEach(function (el) {
          el.onclick = function () {
            var id = el.getAttribute('data-agdel');
            var a = agents.filter(function (x) { return x.id === id; })[0];
            if (!confirm('Delete agent "' + (a ? a.name : id) + '"?')) return;
            api('/api/agents/' + id, { method: 'DELETE' }).then(function () { toast('Agent deleted'); renderSettings(); }).catch(function (e) { toast(e.message, true); });
          };
        });
      });
    } else if (S.setSection === 'skills') {
      api('/api/skills').then(function (d) {
        var all = d.skills || [];
        var q = (S.skillQuery || '').toLowerCase();
        var skills = all.filter(function (sk) { return !q || sk.name.indexOf(q) >= 0 || (sk.description || '').toLowerCase().indexOf(q) >= 0; });
        b.innerHTML = '<h1>Skills</h1>' +
          '<p style="color:var(--muted);font-size:12.5px">Reusable step-by-step knowledge. The agent applies them with use_skill and learns new ones with create_skill.</p>' +
          '<div style="display:flex;gap:8px;margin:12px 0"><input type="text" id="skSearch" placeholder="Search skills…" value="' + esc(S.skillQuery || '') + '" style="flex:1;border:1px solid var(--border2);border-radius:8px;background:var(--card2);color:var(--text);padding:7px 10px">' +
          '<button class="btn dark" id="skNew">+ New skill</button></div>' +
          '<div class="setcard" id="skFormCard" hidden style="margin-bottom:12px"><div class="setlist">' +
          '<input id="skName" placeholder="skill name (e.g. deploy-checklist)">' +
          '<input id="skDesc" placeholder="short description (shown to the agent)">' +
          '<textarea id="skInstr" rows="6" placeholder="step-by-step instructions"></textarea>' +
          '<label style="display:flex;gap:7px;align-items:center;font-size:12px;color:var(--muted);cursor:pointer"><input type="checkbox" id="skGlobal"> Available in every project (global)</label>' +
          '<div class="row"><button class="btn dark" id="skSave">Save skill</button><button class="btn ghost" id="skCancel">Cancel</button><span class="meta" id="skEditMeta"></span></div></div></div>' +
          '<div class="setcard">' +
          (skills.length ? skills.map(function (sk) {
            return '<div class="skcard">' +
              '<div class="skhead"><b>' + esc(sk.name) + '</b>' +
              (sk.scope === 'global' ? '<span class="chip ok" title="available in every project">global</span>' : '<span class="chip" title="only in this project">project</span>') +
              '<span class="chip ' + (sk.createdBy === 'agent' ? 'info' : '') + '">' + esc(sk.createdBy || 'agent') + '</span>' +
              '<span class="meta">' + esc((sk.createdAt || '').slice(0, 10)) + '</span>' +
              '<span style="flex:1"></span>' +
              '<button class="ubtn" data-skview="' + esc(sk.name) + '" title="view instructions">' + icon('layers') + '</button>' +
              '<button class="ubtn" data-skedit="' + esc(sk.name) + '" title="edit">' + icon('pencil') + '</button>' +
              '<button class="ubtn" data-skcopy="' + esc(sk.name) + '" title="copy instructions">' + icon('copy') + '</button>' +
              '<button class="ubtn" data-skdel="' + esc(sk.name) + '" title="delete">' + icon('x') + '</button></div>' +
              '<div class="skdesc">' + esc(sk.description || '(no description)') + '</div>' +
              '<pre class="skinstr" data-pre="' + esc(sk.name) + '" hidden>' + esc(sk.instructions || '') + '</pre>' +
              '</div>';
          }).join('') : '<div class="setlist"><div class="meta">no skills' + (q ? ' match "' + esc(q) + '"' : ' yet — the agent creates skills when it learns repeatable patterns') + '</div></div>') +
          '</div>';
        $('skSearch').oninput = function () {
          S.skillQuery = $('skSearch').value;
          renderSettings();
          setTimeout(function () { var el = $('skSearch'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, 0);
        };
        var form = $('skFormCard');
        function openForm(skill) {
          form.hidden = false;
          $('skName').value = skill ? skill.name : '';
          $('skName').disabled = Boolean(skill);
          $('skDesc').value = skill ? skill.description : '';
          $('skInstr').value = skill ? skill.instructions : '';
          $('skEditMeta').textContent = skill ? 'editing ' + skill.name : '';
          S.skEditing = skill ? skill.name : null;
        }
        $('skNew').onclick = function () { openForm(null); };
        $('skCancel').onclick = function () { form.hidden = true; S.skEditing = null; };
        $('skSave').onclick = function () {
          var payload = { name: $('skName').value, description: $('skDesc').value, instructions: $('skInstr').value };
          var g = $('skGlobal');
          if (!S.skEditing && g && g.checked) payload['global'] = true;
          var url = S.skEditing ? '/api/skills/' + encodeURIComponent(S.skEditing) : '/api/skills';
          api(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
            .then(function () { S.skEditing = null; toast('Skill saved'); renderSettings(); })
            .catch(function (e) { toast(e.message, true); });
        };
        b.querySelectorAll('[data-skview]').forEach(function (el) {
          el.onclick = function () { var pre = b.querySelector('[data-pre="' + el.getAttribute('data-skview') + '"]'); if (pre) pre.hidden = !pre.hidden; };
        });
        b.querySelectorAll('[data-skedit]').forEach(function (el) {
          el.onclick = function () { openForm(all.filter(function (x) { return x.name === el.getAttribute('data-skedit'); })[0]); };
        });
        b.querySelectorAll('[data-skcopy]').forEach(function (el) {
          el.onclick = function () {
            var sk = all.filter(function (x) { return x.name === el.getAttribute('data-skcopy'); })[0];
            if (sk) navigator.clipboard.writeText(sk.instructions).then(function () { toast('Instructions copied'); }, function () { toast('Copy failed', true); });
          };
        });
        b.querySelectorAll('[data-skdel]').forEach(function (el) {
          el.onclick = function () {
            var name = el.getAttribute('data-skdel');
            if (!confirm('Delete skill "' + name + '"?')) return;
            api('/api/skills/' + encodeURIComponent(name), { method: 'DELETE' }).then(function () { toast('Skill deleted'); renderSettings(); }).catch(function (e) { toast(e.message, true); });
          };
        });
      });
    } else if (S.setSection === 'mcp') {
      api('/api/mcp').then(function (d) {
        b.innerHTML = '<h1>MCP servers</h1><p style="color:var(--muted);font-size:12.5px">External tool servers (filesystem, browser, databases…). Their tools require approval before running.</p>' +
          '<div class="setcard"><div class="setlist">' +
          (d.servers.length ? d.servers.map(function (sv) {
            var scope = d.scopes && d.scopes[sv.name];
            return '<div class="row"><span class="grow"><b>' + esc(sv.name) + '</b>' +
              (scope === 'global' ? ' <span class="chip ok" title="available in every project">global</span>' : ' <span class="chip" title="only in this project">project</span>') +
              ' <span class="meta">' + esc(sv.command) + ' ' + esc((sv.args || []).join(' ')) + '</span></span><button class="x" data-x="' + esc(sv.name) + '" title="remove server">' + icon('x') + '</button></div>';
          }).join('') : '<div class="meta">no servers yet</div>') +
          (d.tools.length ? '<div class="meta" style="margin-top:6px">tools: ' + esc(d.tools.map(function (t) { return 'mcp:' + t.server + ':' + t.name; }).join(', ')) + '</div>' : '') +
          '<div style="height:8px"></div><div class="row"><input id="mcName" placeholder="name (e.g. fs)" style="margin:0"><input id="mcCmd" placeholder="command (e.g. npx)" style="margin:0"></div><input id="mcArgs" placeholder="args separated by spaces">' +
          '<label style="display:flex;gap:7px;align-items:center;font-size:12px;color:var(--muted);cursor:pointer"><input type="checkbox" id="mcGlobal" checked> Available in every project (global)</label>' +
          '<div class="row"><button class="btn dark" id="mcAdd">Add MCP server</button><button class="btn ghost" id="mcFs">+ filesystem MCP (official)</button></div></div></div>';
        b.querySelectorAll('[data-x]').forEach(function (el) {
          el.onclick = function () { api('/api/mcp/' + el.getAttribute('data-x'), { method: 'DELETE' }).then(function () { renderSettings(); }).catch(function (e) { toast(e.message, true); }); };
        });
        $('mcAdd').onclick = function () {
          api('/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: $('mcName').value, command: $('mcCmd').value, args: $('mcArgs').value.split(/\s+/).filter(Boolean), global: $('mcGlobal').checked }) })
            .then(function () { renderSettings(); }).catch(function (e) { toast(e.message, true); });
        };
        $('mcFs').onclick = function () {
          var root = effectiveProjectPath() || '.';
          api('/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'fs', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', root] }) })
            .then(function () { toast('Filesystem MCP added for ' + root); renderSettings(); })
            .catch(function (e) { toast(e.message, true); });
        };
      });
    } else if (S.setSection === 'cron') {
      api('/api/cron').then(function (d) {
        b.innerHTML = '<h1>Scheduled / heartbeat</h1><p style="color:var(--muted);font-size:12.5px">Cron jobs start agent runs on a schedule. A heartbeat periodically checks project health.</p>' +
          '<div class="setcard"><div class="setlist">' +
          (d.jobs.length ? d.jobs.map(function (jb) {
            return '<div class="row"><span class="grow">every <b>' + esc(jb.every) + '</b> — ' + esc(jb.goal) + (jb.lastRunAt ? ' <span class="meta">(last ' + new Date(jb.lastRunAt).toLocaleTimeString() + ')</span>' : '') + '</span><button class="x" data-x="' + esc(jb.id) + '" title="remove job">' + icon('x') + '</button></div>';
          }).join('') : '<div class="meta">no jobs yet</div>') +
          '<div style="height:8px"></div><div class="row"><div style="flex:1"><div class="meta">Schedule (e.g. 30, 30s, 5m, 1h — bare numbers are minutes)</div><input id="crEvery" placeholder="30m" style="margin:0"></div><div style="flex:2"><div class="meta">Goal for the agent</div><input id="crGoal" placeholder="e.g. run tests and fix failures" style="margin:0"></div></div>' +
          '<div class="row"><button class="btn dark" id="crAdd">Add cron job</button><button class="btn ghost" id="crHeart">+ heartbeat (30m)</button></div></div></div>';
        b.querySelectorAll('[data-x]').forEach(function (el) {
          el.onclick = function () { api('/api/cron/' + el.getAttribute('data-x'), { method: 'DELETE' }).then(function () { renderSettings(); }).catch(function (e) { toast(e.message, true); }); };
        });
        $('crAdd').onclick = function () {
          api('/api/cron', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ every: $('crEvery').value, goal: $('crGoal').value }) })
            .then(function () { renderSettings(); }).catch(function (e) { toast(e.message, true); });
        };
        $('crHeart').onclick = function () {
          api('/api/cron', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ every: '30m', goal: 'Heartbeat: inspect the project, run tests/typecheck, fix or report anything broken.' }) })
            .then(function () { renderSettings(); }).catch(function (e) { toast(e.message, true); });
        };
      });
    }
  }

  function openFolderBrowser(mode) {
    S.browseTagRun = mode === 'tag' && S.active !== 'home' ? S.active : null;
    $('browseTitle').textContent = S.browseTagRun ? 'Tag a read-only reference folder' : 'Choose a project folder';
    $('browseUse').textContent = S.browseTagRun ? 'Tag folder' : 'Use this folder';
    $('browseModal').hidden = false;
    var sess = S.browseTagRun && S.sessions[S.browseTagRun];
    browseTo((sess && sess.session && sess.session.projectPath) || effectiveProjectPath());
  }

  function browseTo(p, isFallback) {
    // Instant loading row: the list used to sit blank mid-navigation.
    var bl = $('browseList');
    if (bl) bl.innerHTML = '<div class="meta" style="padding:8px">loading…</div>';
    api('/api/browse?path=' + encodeURIComponent(p || '')).then(renderBrowser).catch(function (e) {
      if (!isFallback) { browseTo('', true); } else { toast(e.message, true); }
    });
  }

  function renderBrowser(d) {
    var box = $('browseList');
    var html = '';
    if (!d.atRoot && d.path) {
      html += '<div class="frow" data-up="1"><span class="ico">' + icon('back') + '</span><span style="color:var(--muted)">..</span></div>';
    }
    if (d.atRoot) html += '<div class="empty" style="padding:6px 10px">This computer — pick a drive</div>';
    html += (d.dirs || []).map(function (n) {
      var leaf = String(n).split(/[\\/]/).filter(Boolean).pop() || n;
      return '<div class="frow" data-dir="' + esc(n) + '" title="' + esc(n) + '"><span class="ico">' + icon('folder') + '</span>' + esc(leaf) + '</div>';
    }).join('');
    if (!d.atRoot && !(d.dirs || []).length) html += '<div class="empty" style="padding:6px 10px">no subfolders</div>';
    box.innerHTML = html;
    $('browseCrumb').textContent = d.atRoot ? 'This computer' : d.path;
    $('browseProjChip').style.display = d.isProject ? '' : 'none';
    box.querySelectorAll('[data-dir]').forEach(function (el) {
      el.onclick = function () {
        // The server returns fully-joined native paths — navigate with them
        // as-is; never hand-concatenate separators here.
        browseTo(el.getAttribute('data-dir'));
      };
    });
    var up = box.querySelector('[data-up]');
    if (up) up.onclick = function () { browseTo(d.parent || ''); };
    $('browseUse').onclick = function () {
      if (d.atRoot || !d.path) { toast('Open a folder first', true); return; }
      if (S.browseTagRun) {
        var runId = S.browseTagRun;
        api('/api/runs/' + encodeURIComponent(runId) + '/folders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: d.path }) })
          .then(function (data) {
            var sess = S.sessions[runId];
            if (sess) {
              sess.taggedFolders = data.folders || [];
              sess.writableFolders = data.writableFolders || [];
              if (sess.session) sess.session.taggedFolders = data.folders || [];
              if (sess.session) sess.session.writableFolders = data.writableFolders || [];
            }
            if (S.active === runId) renderTaggedFolders(runId);
            $('browseModal').hidden = true;
            S.browseTagRun = null;
            toast('Folder tagged for read-only access');
          }).catch(function (error) { toast(error.message, true); });
        return;
      }
      S.settings.projectPath = d.path;
      persist();
      updateProjChip();
      renderSidebar();
      $('browseModal').hidden = true;
      toast('Project set to ' + d.path);
      if (S.active === 'home') openHome();
    };
  }

  function boot() {
    if (S.settings.projectPath) {
      api('/api/browse?path=' + encodeURIComponent(S.settings.projectPath)).catch(function () {
        toast('Stored project path no longer exists — pick a folder', true);
        S.settings.projectPath = '';
        persist();
        updateProjChip();
      });
    }
    api('/api/project').then(function (p) {
      S.project = p;
      updateProjChip();
      renderSidebar();
      if (S.active === 'home') openHome();
    }).catch(function () { updateProjChip(); });
    api('/api/home').then(function (h) {
      var heal = function (p) {
        if (!p) return p;
        var i = p.indexOf('\\AgentGitu\\');
        if (i >= 0) return h.root + p.slice(i + 10);
        // Restore projects created before the Gitu rename as well.
        i = p.indexOf('\\Hermes\\');
        if (i >= 0) return h.root + p.slice(i + 7);
        return p;
      };
      var np = heal(S.settings.projectPath);
      if (np !== S.settings.projectPath) { S.settings.projectPath = np; persist(); updateProjChip(); }
      S.lastProjectPath = heal(S.lastProjectPath);
    }).catch(function () {});
    loadModelCatalog().then(function () {
      if (S.active === 'home') openHome();
    }).catch(function () { S.modelsLoaded = true; if (S.active === 'home') openHome(); });
    api('/api/files').then(function (data) { S.files = data.files || []; }).catch(function () {});
    $('gearBtn').onclick = function () { toggleMobileNav(false); openSettings('general'); };
    $('gearBtn').innerHTML = icon('gear');
    $('sbCowork').onclick = function () { toggleMobileNav(false); openCowork(); };
    $('sbCollapse').onclick = function () { S.settings.leftCollapsed = !S.settings.leftCollapsed; persist(); applyLayout(); };
    bindResize('sbResize', 'left');
    $('bulkDel').onclick = bulkDelete;
    $('bulkDone').onclick = function () { S.manage = false; S.selProj = {}; S.selRuns = {}; renderSidebar(); };
    $('browseCancel').onclick = function () { $('browseModal').hidden = true; };
    $('projChip').style.cursor = 'pointer';
    $('projChip').title = 'Choose a project folder';
    $('projChip').onclick = openFolderBrowser;
    $('mobileNav').onclick = function () { toggleMobileNav(true); };
    $('mobileBackdrop').onclick = function () { toggleMobileNav(false); };
    $('toolPanelClose').onclick = closeToolPanel;
    updateProjChip();
    renderSidebar();
    renderTopbar();
    applyLayout();
    var cwWasOpen = false;
    try { cwWasOpen = localStorage.getItem('hermes.cowork') === 'open'; } catch (e) {}
    if (cwWasOpen) openCowork(); else openHome();
    initializeOnboarding();

    // One global Escape: closes the TOPMOST layer (tool panel → settings →
    // browse modal → dynamic modals) and returns focus to where it was.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var prev = document.activeElement;
      var sh = document.querySelector('.shell.mobile-nav-open');
      if (sh) { toggleMobileNav(false); refocusEl(prev); return; }
      var contextCard = $('contextCard');
      if (contextCard && !contextCard.hidden) { toggleContextCard(false); $('contextToggle').focus(); return; }
      var toolPanel = $('toolPanel');
      if (toolPanel && !toolPanel.hidden) { closeToolPanel(); refocusEl(prev); return; }
      var st = $('settings');
      if (st && !st.hidden) { closeSettings(); refocusEl(prev); return; }
      var bm = $('browseModal');
      if (bm && !bm.hidden) { bm.hidden = true; refocusEl(prev); return; }
      var modals = document.querySelectorAll('.modal');
      for (var i = modals.length - 1; i >= 0; i--) {
        var m = modals[i];
        if (m.hidden) continue;
        var cancel = m.querySelector('[data-cancel]') || m.querySelector('.btn.ghost');
        if (cancel && cancel.onclick) cancel.click(); else m.remove();
        refocusEl(prev);
        return;
      }
    });
    window.addEventListener('resize', function () { if (window.innerWidth > 720) toggleMobileNav(false); });
  }
  function refocusEl(el) { if (el && el.isConnected && el.focus) { try { el.focus(); } catch (e) {} } }
  ${COWORK_JS}
  ${COWORK_GALLERY_JS}
  ${COWORK_PROFILE_JS}
  ${REPORT_DETAILS_JS}
  ${ONBOARDING_JS}
  ${UI_BUTTON_JS}
  boot();
})();
</script>
<div id="mascotWrap" style="position:fixed;right:14px;bottom:12px;z-index:45;pointer-events:none;width:240px;height:170px">
  <canvas id="mascotCanvas" aria-hidden="true" style="width:240px;height:170px;image-rendering:pixelated"></canvas>
  <div id="mascotName" style="position:absolute;bottom:6px;left:50%;transform:translateX(-50%);font-family:var(--mono);font-weight:700;font-size:11px;color:#fff;background:var(--card);border:1px solid #8f80ff;border-radius:6px;padding:2px 8px;white-space:nowrap;opacity:0;transition:opacity .4s">Agent Gitu</div>
</div>
<script type="module">
import * as THREE from '/vendor/three.module.js';
(function () {
  var canvas = document.getElementById('mascotCanvas');
  if (!canvas) return;
  canvas.width = 120;
  canvas.height = 85;
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false });
  } catch (e) {
    return;
  }
  renderer.setClearColor(0x000000, 0);
  var scene = new THREE.Scene();
  var cam = new THREE.OrthographicCamera(-12, 12, 8.5, -8.5, 0.1, 100);
  cam.position.set(0, 2, 30);
  cam.lookAt(0, 2.4, 0);
  scene.add(new THREE.AmbientLight(0xffffff, 1.7));
  var dl = new THREE.DirectionalLight(0xffffff, 1.1);
  dl.position.set(4, 8, 10);
  scene.add(dl);

  function box(w, h, d, c) {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color: c }));
  }
  var SKIN = 0xe8b98a, SUIT = 0x23231f, PANT = 0x1a1a17, GUN = 0x3a3a36, ACC = 0x7c6cf0;

  var root = new THREE.Group();
  scene.add(root);

  var legL = new THREE.Group(); legL.position.set(-0.45, 1.7, 0);
  var legLM = box(0.7, 1.7, 0.7, PANT); legLM.position.y = -0.85; legL.add(legLM); root.add(legL);
  var legR = new THREE.Group(); legR.position.set(0.45, 1.7, 0);
  var legRM = box(0.7, 1.7, 0.7, PANT); legRM.position.y = -0.85; legR.add(legRM); root.add(legR);

  var torso = box(1.9, 1.9, 1.0, SUIT); torso.position.y = 2.75; root.add(torso);
  var tie = box(0.3, 1.1, 0.12, ACC); tie.position.set(0, 2.8, 0.55); root.add(tie);

  var head = box(1.5, 1.5, 1.5, SKIN); head.position.y = 4.5; root.add(head);
  var shades = box(1.52, 0.35, 0.25, 0x111111); shades.position.set(0, 4.65, 0.7); root.add(shades);
  var hat = box(1.7, 0.5, 1.7, 0x111111); hat.position.y = 5.45; root.add(hat);
  var brim = box(1.7, 0.12, 0.9, 0x111111); brim.position.set(0, 5.25, 1.15); root.add(brim);

  var armL = new THREE.Group(); armL.position.set(-1.25, 3.6, 0);
  var armLM = box(0.55, 1.6, 0.55, SUIT); armLM.position.y = -0.7; armL.add(armLM); root.add(armL);
  var armR = new THREE.Group(); armR.position.set(1.25, 3.6, 0);
  var armRM = box(0.55, 1.6, 0.55, SUIT); armRM.position.y = -0.7; armR.add(armRM);
  var gun = new THREE.Group(); gun.position.set(0, -1.5, 0.2);
  var g1 = box(0.35, 0.5, 1.7, GUN); g1.position.set(0, 0, 0.6); gun.add(g1);
  var g2 = box(0.3, 0.7, 0.4, GUN); g2.position.set(0, -0.45, 0.1); gun.add(g2);
  var flash = box(0.55, 0.55, 0.6, 0xffd23a); flash.position.set(0, 0.05, 1.7); flash.visible = false; gun.add(flash);
  armR.add(gun); root.add(armR);

  var mode = 'walk';
  var modeT = 0;
  var t = 0;
  var nameX = -11;
  var nameEl = document.getElementById('mascotName');
  window.__mascot = {
    setMode: function (m) {
      if (m !== mode) { mode = m; modeT = 0; }
    }
  };

  var clock = new THREE.Clock();
  // Render gating: an endless rAF that draws every frame wastes CPU/GPU when
  // the mascot is hidden (small screens hide #mascotWrap via CSS) or the tab
  // is in the background. The loop fully STOPS while hidden and restarts on
  // visibility/resize so typing and streaming stay smooth.
  var rafId = 0;
  var mascotVisible = true;
  var mascotMq = window.matchMedia ? window.matchMedia('(max-width: 720px)') : null;
  function mascotIsHidden() {
    if (document.hidden) return true;
    if (mascotMq && mascotMq.matches) return true;
    var w = document.getElementById('mascotWrap');
    return !w || getComputedStyle(w).display === 'none';
  }
  function updateMascotVisibility() {
    var hidden = mascotIsHidden();
    if (hidden === mascotVisible) return;
    mascotVisible = !hidden;
    if (mascotVisible) {
      clock.getDelta(); // drop the time accumulated while hidden
      rafId = requestAnimationFrame(tick);
    } else if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }
  if (mascotMq) {
    if (mascotMq.addEventListener) mascotMq.addEventListener('change', updateMascotVisibility);
    else if (mascotMq.addListener) mascotMq.addListener(updateMascotVisibility);
  }
  document.addEventListener('visibilitychange', updateMascotVisibility);
  window.addEventListener('resize', updateMascotVisibility);
  function tick() {
    rafId = requestAnimationFrame(tick);
    if (!mascotVisible) return;
    var dt = Math.min(0.05, clock.getDelta());
    t += dt;
    modeT += dt;

    if (mode === 'walk') {
      var s = Math.sin(t * 9);
      legL.rotation.x = s * 0.7; legR.rotation.x = -s * 0.7;
      armL.rotation.x = -s * 0.5;
      armR.rotation.x = -0.5; armR.rotation.z = -0.12;
      root.position.x = Math.min(2, -9 + modeT * 3.2);
      root.position.y = Math.abs(Math.cos(t * 9)) * 0.15;
      if (modeT > 4.0) { mode = 'idle'; modeT = 0; }
    } else if (mode === 'thinking') {
      legL.rotation.x = 0; legR.rotation.x = 0;
      armL.rotation.x = -1.2; armL.rotation.z = 0.4;
      armR.rotation.x = -0.5; armR.rotation.z = -0.1;
      head.rotation.z = 0.15; head.rotation.x = Math.sin(t * 3) * 0.05;
      root.position.x = 2;
      root.position.y = Math.sin(t * 2) * 0.04;
      if (modeT > 1.8) { mode = 'idle'; modeT = 0; head.rotation.z = 0; head.rotation.x = 0; }
    } else if (mode === 'coding') {
      legL.rotation.x = 0; legR.rotation.x = 0;
      armL.rotation.x = -1.1 + Math.sin(t * 20) * 0.15; armL.rotation.z = 0.15;
      armR.rotation.x = -1.1 + Math.cos(t * 20) * 0.15; armR.rotation.z = -0.15;
      root.position.x = 2;
      root.position.y = Math.sin(t * 2) * 0.04;
      if (modeT > 1.8) { mode = 'idle'; modeT = 0; }
    } else if (mode === 'testing') {
      legL.rotation.x = 0; legR.rotation.x = 0;
      armL.rotation.x = -0.3; armL.rotation.z = 0;
      armR.rotation.x = -1.35 + Math.sin(t * 6) * 0.05; armR.rotation.z = -0.05;
      root.position.x = 2;
      root.position.y = Math.sin(t * 2) * 0.04;
      if (modeT > 1.8) { mode = 'idle'; modeT = 0; }
    } else if (mode === 'celebrate') {
      legL.rotation.x = 0.15; legR.rotation.x = -0.15;
      armL.rotation.x = -2.2 + Math.sin(t * 12) * 0.1; armL.rotation.z = 0.3;
      armR.rotation.x = -2.2 + Math.sin(t * 12) * 0.1; armR.rotation.z = -0.3;
      root.position.x = 2;
      root.position.y = 0.3 + Math.abs(Math.sin(t * 10)) * 0.25;
      if (modeT > 1.8) { mode = 'idle'; modeT = 0; }
    } else if (mode === 'shield') {
      legL.rotation.x = 0.2; legR.rotation.x = -0.2;
      armL.rotation.x = -1.5; armL.rotation.z = 0.6;
      armR.rotation.x = -1.5; armR.rotation.z = -0.6;
      root.position.x = 2;
      root.position.y = Math.sin(t * 2) * 0.03;
      if (modeT > 1.8) { mode = 'idle'; modeT = 0; }
    } else if (mode === 'shoot') {
      legL.rotation.x = 0.25; legR.rotation.x = -0.25;
      armR.rotation.x = -1.35 + Math.sin(t * 28) * 0.07;
      armR.rotation.z = 0;
      armL.rotation.x = 0.35;
      flash.visible = (Math.floor(t * 14) % 2 === 0);
      root.position.x = 2;
      root.position.y = Math.sin(t * 28) * 0.04;
      if (modeT > 1.8) { mode = 'idle'; modeT = 0; }
    } else {
      legL.rotation.x = 0; legR.rotation.x = 0;
      armR.rotation.x = -0.85; armR.rotation.z = -0.08;
      armL.rotation.x = 0; armL.rotation.z = 0;
      head.rotation.z = 0; head.rotation.x = 0;
      flash.visible = false;
      root.position.x = 2;
      root.position.y = Math.sin(t * 2) * 0.06;
    }
    // The name tag hangs BELOW the character (never over its face) and
    // follows it with easing, clamped so it stays inside the wrap.
    var targetX = root.position.x;
    nameX += (targetX - nameX) * 0.05;
    if (nameEl) {
      var charPx = Math.max(44, Math.min(196, Math.round((nameX + 12) / 24 * 240)));
      nameEl.style.left = charPx + 'px';
      nameEl.style.opacity = mode === 'idle' ? '0.85' : '1';
    }
    renderer.render(scene, cam);
  }
  mascotVisible = !mascotIsHidden();
  if (mascotVisible) rafId = requestAnimationFrame(tick);
})();
</script>
</body>
</html>
`;
