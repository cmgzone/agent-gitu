/**
 * Cowork mode UI: a messaging-app style surface (agent roster, DMs, group
 * chats, Telegram/schedule panels) rendered inside the existing web app.
 * Exported as CSS + JS snippets injected into UI_HTML. The JS runs inside the
 * app's main IIFE, so it reuses the helpers there ($, esc, api, toast, S).
 *
 * Visuals: all chrome icons are inline SVG (cwIcon), and every agent is drawn
 * as a voxel character by the bundled three.js (window.__coworkAvatar, defined
 * in ui.ts) with an inline-SVG identicon fallback. No emoji anywhere; agent
 * names always come from the user — templates only prefill instructions.
 * Written as String.raw and ES5-style so no escape or interpolation surprises
 * leak into the injected markup.
 */

export const COWORK_CSS = String.raw`
  /* ---- Cowork mode ---- */
  body.cowork .sb, body.cowork .mobile-nav-btn, body.cowork .vresize, body.cowork .topbar { display: none !important; }
  .cw { flex: 1; display: flex; min-height: 0; width: 100%; background: var(--bg); }
  .cw-rail { width: var(--sbw, 264px); flex: none; border-right: 1px solid var(--border); display: flex; flex-direction: column; min-height: 0; background: linear-gradient(180deg, rgba(19,24,38,.72), var(--bg) 150px); }
  .cw-rail-head { display: flex; align-items: center; gap: 6px; padding: 12px 12px 8px; font-weight: 700; letter-spacing: .06em; font-size: 12px; color: var(--text); }
  .cw-rail-head .cw-brand { display: inline-flex; align-items: center; gap: 7px; }
  .cw-rail-head .cw-brand svg { color: var(--accent); }
  .cw-rail-head .spacer { flex: 1; }
  .cw-rail-head .iconbtn { width: 26px; height: 26px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--border2); border-radius: 7px; background: transparent; color: var(--muted); }
  .cw-rail-head .iconbtn svg { width: 14px; height: 14px; }
  .cw-rail-head .iconbtn:hover { color: var(--text); border-color: var(--accent); }
  .cw-rail-scroll { flex: 1; overflow-y: auto; padding: 4px 8px 12px; }
  .cw-sec { font-size: 10.5px; font-weight: 700; letter-spacing: .12em; color: var(--faint); margin: 14px 6px 6px; }
  .cw-sec:first-child { margin-top: 4px; }
  .cw-item { display: flex; align-items: center; gap: 9px; width: 100%; text-align: left; background: transparent; border: 1px solid transparent; border-radius: 10px; padding: 7px 8px; color: var(--text); margin-bottom: 2px; }
  .cw-item:hover { background: var(--hover); }
  .cw-item.cur { background: var(--run-dim); border-color: rgba(91,168,255,.35); }
  .cw-item-main { min-width: 0; flex: 1; }
  .cw-item-name { display: block; font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cw-item-sub { display: block; font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cw-ava { width: 28px; height: 28px; flex: none; border-radius: 9px; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; }
  .cw-ava img { width: 100%; height: 100%; object-fit: contain; display: block; }
  .cw-ava svg { width: 100%; height: 100%; display: block; }
  .cw-item .cw-flag { flex: none; color: var(--muted); display: inline-flex; }
  .cw-item .cw-flag svg { width: 14px; height: 14px; }
  .cw-flag.gold { color: var(--evidence); }
  .cw-rail-foot { padding: 10px 12px; border-top: 1px solid var(--border); display: flex; gap: 8px; }
  .cw-rail-foot .btn { flex: 1; padding: 6px 10px; font-size: 12px; }
  .cw-empty-note { font-size: 11.5px; color: var(--muted); padding: 8px 6px 4px; line-height: 1.5; }
  .cw-chat { flex: 1; display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  .cw-chat-head { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--border); min-height: 52px; }
  .cw-chat-head .cw-tt { min-width: 0; flex: 1; }
  .cw-chat-head .cw-tt .t1 { font-weight: 700; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; }
  .cw-chat-head .cw-tt .t1 svg { width: 14px; height: 14px; color: var(--evidence); flex: none; }
  .cw-chat-head .cw-tt .t2 { font-size: 11.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cw-chat-head .chip { flex: none; display: inline-flex; align-items: center; gap: 5px; }
  .cw-chat-head .chip svg { width: 12px; height: 12px; }
  .cw-info-toggle { border: 1px solid var(--border2); background: transparent; color: var(--muted); border-radius: 8px; padding: 4px 10px; font-size: 12px; flex: none; }
  .cw-info-toggle:hover { color: var(--text); border-color: var(--accent); }
  .cw-msgs { flex: 1; overflow-y: auto; padding: 18px 20px 8px; display: flex; flex-direction: column; gap: 12px; }
  .cw-row { display: flex; gap: 9px; max-width: 86%; }
  .cw-row.me { align-self: flex-end; flex-direction: row-reverse; max-width: 74%; }
  .cw-bubble { background: var(--card); border: 1px solid var(--border); border-radius: 13px; padding: 8px 12px; font-size: 13.5px; line-height: 1.55; overflow-wrap: anywhere; }
  .cw-row.me .cw-bubble { background: var(--run-dim); border-color: rgba(91,168,255,.35); }
  .cw-bubble .cw-meta { display: flex; align-items: center; gap: 7px; font-size: 11px; color: var(--muted); margin-bottom: 3px; }
  .cw-row.me .cw-meta { justify-content: flex-end; }
  .cw-bubble .cw-meta .nm { font-weight: 700; color: var(--text); }
  .cw-bubble .cw-meta .tg { color: var(--faint); }
  .cw-tools { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .cw-tools span { font-size: 10.5px; font-family: var(--mono); border: 1px solid var(--border2); color: var(--muted); border-radius: 6px; padding: 1px 6px; }
  .cw-tools span.ok { color: var(--ok); border-color: rgba(63,214,143,.4); }
  .cw-tools span.bad { color: var(--err); border-color: rgba(255,100,101,.4); }
  .cw-sys { align-self: center; text-align: center; font-size: 11.5px; color: var(--faint); background: var(--card2); border: 1px solid var(--border); border-radius: 999px; padding: 3px 12px; max-width: 90%; overflow-wrap: anywhere; }
  .cw-code { display: block; background: var(--card2); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; font-family: var(--mono); font-size: 12px; overflow-x: auto; white-space: pre; margin: 6px 0; }
  .cw-bubble code { font-family: var(--mono); font-size: 12px; background: var(--card2); border-radius: 4px; padding: 1px 4px; }
  .cw-bubble .cw-mention { color: var(--accent); font-weight: 600; }
  .cw-bubble a { color: var(--run); }
  .cw-typing { display: flex; align-items: center; gap: 8px; padding: 2px 22px 10px; font-size: 12px; color: var(--muted); }
  .cw-typing .dots { display: inline-flex; gap: 3px; }
  .cw-typing .dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--accent); animation: cwpulse 1.1s infinite; }
  .cw-typing .dots i:nth-child(2) { animation-delay: .18s; } .cw-typing .dots i:nth-child(3) { animation-delay: .36s; }
  @keyframes cwpulse { 0%, 70%, 100% { opacity: .25; transform: translateY(0); } 35% { opacity: 1; transform: translateY(-2px); } }
  .cw-composer-wrap { padding: 10px 20px 16px; }
  .cw-mentions { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
  .cw-mentions button { font-size: 11.5px; border: 1px solid var(--border2); background: var(--card); color: var(--text); border-radius: 999px; padding: 2px 10px; }
  .cw-mentions button:hover { border-color: var(--accent); }
  .cw-composer { display: flex; align-items: flex-end; gap: 8px; background: linear-gradient(145deg, rgba(24,31,47,.98), var(--card)); border: 1px solid var(--border2); border-radius: 14px; padding: 8px 10px; box-shadow: 0 12px 32px rgba(0,0,0,.15); }
  .cw-composer textarea { flex: 1; background: transparent; border: 0; color: var(--text); resize: none; outline: none; max-height: 160px; font: inherit; line-height: 1.5; }
  .cw-composer .cw-send { width: 32px; height: 32px; flex: none; border-radius: 10px; border: 0; background: var(--accent); color: #fff; font-size: 15px; display: inline-flex; align-items: center; justify-content: center; }
  .cw-composer .cw-send:disabled { opacity: .4; cursor: default; }
  .cw-composer .cw-send.stop { background: var(--err); }
  .cw-info { width: 300px; flex: none; border-left: 1px solid var(--border); overflow-y: auto; padding: 14px; min-height: 0; }
  .cw-info h4 { margin: 2px 0 8px; font-size: 11px; letter-spacing: .1em; color: var(--faint); font-weight: 700; }
  .cw-info .cw-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 12px; margin-bottom: 12px; }
  .cw-info .cw-mrow { display: flex; align-items: center; gap: 8px; padding: 5px 0; }
  .cw-info .cw-mrow .nm { flex: 1; min-width: 0; font-weight: 600; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cw-info .cw-mrow .tg { color: var(--muted); font-weight: 400; }
  .cw-info .cw-mrow button { background: transparent; border: 0; color: var(--muted); padding: 2px; display: inline-flex; }
  .cw-info .cw-mrow button svg { width: 14px; height: 14px; }
  .cw-info .cw-mrow button:hover { color: var(--text); }
  .cw-info .cw-mrow button.crown.on { color: var(--evidence); }
  .cw-info label { display: block; font-size: 11.5px; color: var(--muted); margin: 8px 0 3px; }
  .cw-info input[type=text], .cw-info input[type=password], .cw-info select, .cw-info textarea { width: 100%; background: var(--card2); border: 1px solid var(--border2); color: var(--text); border-radius: 8px; padding: 6px 9px; font: inherit; font-size: 12.5px; }
  .cw-info .cw-actions { display: flex; gap: 8px; margin-top: 10px; }
  .cw-info .cw-actions .btn { padding: 5px 12px; font-size: 12px; }
  .cw-info .cw-check { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: var(--text); margin-top: 8px; }
  .cw-hero { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; padding: 24px; overflow: auto; text-align: center; }
  .cw-hero h1 { margin: 0; font-size: 26px; }
  .cw-hero p { margin: 0; color: var(--muted); max-width: 560px; }
  .cw-hero .cw-hero-ico { color: var(--accent); opacity: .9; }
  .cw-hero .cw-hero-ico svg { width: 56px; height: 56px; }
  .cw-hero .cw-hero-cta { display: flex; gap: 10px; }
  .cw-hero .cw-hero-back { margin-top: 4px; }
  /* Onboarding: before the first teammate exists, cowork is ONE full page —
     the roster rail and info panel would only frame an empty hero. */
  .cw.cw-empty .cw-rail, .cw.cw-empty .cw-info { display: none !important; }
  .cw-modal .box { width: 660px; }
  /* The app's generic progress-strip .bar rule sets height 6px + overflow
     hidden; without these overrides it crushes the modal header (the browse
     modal has the same latent bug). */
  .cw-modal .bar { height: auto; margin: 0; border-radius: 0; background: transparent; overflow: visible; flex: none; display: flex; gap: 8px; align-items: center; padding: 13px 16px; border-bottom: 1px solid var(--border); }
  .cw-modal .bar span { height: auto; font-weight: 600; font-size: 13.5px; }
  .cw-modal .cw-body { padding: 14px 16px 18px; overflow-y: auto; }
  .cw-modal label { display: block; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--faint); margin: 14px 0 5px; font-weight: 700; }
  .cw-modal input[type=text], .cw-modal input[type=password], .cw-modal select, .cw-modal textarea { width: 100%; background: var(--card2); border: 1px solid var(--border2); color: var(--text); border-radius: 9px; padding: 8px 11px; font: inherit; font-size: 13px; }
  .cw-modal input[type=text]:focus, .cw-modal input[type=password]:focus, .cw-modal select:focus, .cw-modal textarea:focus { border-color: var(--accent); outline: none; }
  .cw-modal textarea { resize: vertical; min-height: 96px; line-height: 1.55; }
  .cw-avrow { display: flex; gap: 16px; align-items: center; margin-top: 6px; padding: 12px; background: var(--card2); border: 1px solid var(--border); border-radius: 12px; }
  .cw-avprev { width: 104px; height: 104px; flex: none; border-radius: 14px; background: radial-gradient(circle at 50% 30%, rgba(143,128,255,.16), rgba(13,16,23,.6)); border: 1px solid var(--border2); overflow: hidden; display: flex; align-items: center; justify-content: center; }
  .cw-avprev img, .cw-avprev svg { width: 92px; height: 92px; }
  .cw-avopts { flex: 1; min-width: 0; }
  .cw-avopts .cw-shapes { display: flex; flex-wrap: wrap; gap: 6px; }
  .cw-avopts .cw-shapes button { font-size: 12px; background: transparent; border: 1px solid var(--border2); color: var(--muted); border-radius: 9px; padding: 5px 13px; text-transform: capitalize; }
  .cw-avopts .cw-shapes button.cur { color: var(--text); border-color: var(--accent); background: var(--run-dim); font-weight: 600; }
  .cw-avopts .cw-colors { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .cw-avopts .cw-colors button { width: 26px; height: 26px; border-radius: 50%; border: 2px solid rgba(255,255,255,.12); }
  .cw-avopts .cw-colors button.cur { border-color: #fff; box-shadow: 0 0 0 2px var(--accent); }
  .cw-modal .cw-templates { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 2px; }
  .cw-modal .cw-templates button { font-size: 12px; background: var(--card2); border: 1px solid var(--border2); color: var(--text); border-radius: 999px; padding: 4px 13px; }
  .cw-modal .cw-templates button:hover { border-color: var(--accent); }
  .cw-modal .cw-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .cw-modal .cw-skills { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .cw-modal .cw-skills button { font-size: 11.5px; font-family: var(--mono); background: var(--card2); border: 1px solid var(--border2); color: var(--muted); border-radius: 999px; padding: 3px 11px; }
  .cw-modal .cw-skills button.on { color: var(--ok); border-color: rgba(63,214,143,.5); }
  .cw-modal .cw-perm { display: flex; flex-direction: column; gap: 9px; margin-top: 12px; padding: 12px; background: var(--card2); border: 1px solid var(--border); border-radius: 12px; }
  .cw-modal .cw-perm label { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 12.5px; color: var(--text); text-transform: none; letter-spacing: 0; font-weight: 400; }
  .cw-modal .cw-note { font-size: 11px; color: var(--faint); margin-top: 10px; line-height: 1.5; }
  .cw-modal .cw-check { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--text); }
  .cw-modal .cw-check input { width: 16px; height: 16px; accent-color: var(--accent); }
  .cw-modal .cw-foot { display: flex; gap: 8px; align-items: center; justify-content: flex-end; padding: 12px 16px; border-top: 1px solid var(--border); background: rgba(15,20,31,.6); }
  @media (max-width: 1080px) { .cw-info { display: none; } }
  @media (max-width: 720px) { .cw-rail { width: min(300px, 86vw); position: fixed; inset: 0 auto 0 0; z-index: 80; transform: translateX(-105%); transition: transform .18s ease; box-shadow: 14px 0 40px rgba(0,0,0,.48); background: var(--bg); }
    .cw.rail-open .cw-rail { transform: none; } }
`;

export const COWORK_JS = String.raw`
  // ==================== COWORK MODE ====================
  var CW_COLORS = ['#8f80ff', '#5ba8ff', '#3fd68f', '#c9a86a', '#ff6465', '#e670c8', '#4ec3d9', '#9dd65b'];
  var CW_SHAPES = ['cube', 'visor', 'antenna', 'bot'];
  // Neutral starting points for the INSTRUCTIONS field only. They never fill
  // the name (users name their own agents) and carry no branding.
  var CW_TEMPLATES = [
    { label: 'Coordinator', prompt: 'You coordinate a small agent team. Break requests into clear assignments, hand each part to the right teammate by mentioning @Name, chase status, and synthesize results into one decisive answer. Keep the user goal, constraints and deadlines front and center. Write concisely; never ramble.' },
    { label: 'Engineer', prompt: 'You are a senior software engineer. Read code before changing it, make small focused edits, and verify with tests or builds. Answer with concrete file paths and evidence, and say plainly when something is not yet verified.' },
    { label: 'Researcher', prompt: 'You are a rigorous research analyst. Gather facts from files and the web, weigh sources, and answer with a short summary first, then supporting detail with links. Distinguish clearly between verified facts and your own inference.' },
    { label: 'Writer', prompt: 'You are a sharp product writer. Turn rough ideas into clear, tight prose — READMEs, announcements, specs. Prefer plain words, short sentences, and concrete examples. Never invent features or facts.' }
  ];

  // ---- inline SVG icon set (stroke style matches the app's ICONS) ----
  var CW_SVG_OPEN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var CW_ICONS = {
    users: CW_SVG_OPEN + '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    plus: CW_SVG_OPEN + '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
    chat: CW_SVG_OPEN + '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    crown: CW_SVG_OPEN + '<path d="M2 18h20"/><path d="M3 18l1.5-9L9 13l3-7 3 7 4.5-4L21 18"/></svg>',
    plane: CW_SVG_OPEN + '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',
    clock: CW_SVG_OPEN + '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    close: CW_SVG_OPEN + '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    stop: CW_SVG_OPEN + '<rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
    send: CW_SVG_OPEN + '<line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>'
  };
  function cwIcon(name) { return CW_ICONS[name] || ''; }

  function cwEnsure() {
    if (!S.cw) S.cw = { agents: [], convs: [], skills: [], active: null, msgs: [], lastSeq: 0, busy: false, working: null, timer: null, infoOpen: true };
    return S.cw;
  }
  function cwStopPoll() { var cw = S.cw; if (cw && cw.timer) { clearInterval(cw.timer); cw.timer = null; } }

  // ---- avatars: three.js voxel characters, SVG identicon fallback ----
  window.__cwAvaCache = {};
  function cwAvaDataUrl(avatar) {
    var key = (avatar && avatar.color || '') + '|' + (avatar && avatar.shape || '');
    if (window.__cwAvaCache[key]) return window.__cwAvaCache[key];
    var url = null;
    if (window.__coworkAvatar && window.__coworkAvatar.render) url = window.__coworkAvatar.render(avatar || {}, 96);
    if (url) window.__cwAvaCache[key] = url;
    return url;
  }
  function cwAvaSvg(avatar) {
    var color = (avatar && /^#[0-9a-f]{6}$/i.test(avatar.color)) ? avatar.color : '#8f80ff';
    var shape = (avatar && avatar.shape) || 'cube';
    var visor = shape === 'visor'
      ? '<rect x="6" y="14" width="20" height="7" rx="2.5" fill="#10141d"/><rect x="10" y="16.4" width="3.4" height="2.4" fill="#eaf2ff"/><rect x="18.6" y="16.4" width="3.4" height="2.4" fill="#eaf2ff"/>'
      : '<rect x="11" y="15" width="3.4" height="4.6" fill="#10141d"/><rect x="17.6" y="15" width="3.4" height="4.6" fill="#10141d"/>' +
        (shape === 'antenna' ? '<rect x="15" y="3" width="2" height="5" fill="' + color + '"/><circle cx="16" cy="3.4" r="2" fill="' + color + '"/>' : '') +
        (shape === 'bot' ? '<rect x="4" y="13" width="2.6" height="7" fill="' + color + '"/><rect x="25.4" y="13" width="2.6" height="7" fill="' + color + '"/>' : '');
    return '<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<rect x="5" y="8" width="22" height="18" rx="3" fill="' + color + '"/>' + visor +
      '<rect x="9" y="26" width="14" height="5" rx="1.5" fill="rgba(0,0,0,.45)"/></svg>';
  }
  function cwAvaImg(avatar) {
    var url = cwAvaDataUrl(avatar);
    return url ? '<img src="' + url + '" alt="">' : cwAvaSvg(avatar);
  }
  function cwAva(agent, size) {
    var style = size ? ' style="width:' + size + 'px;height:' + size + 'px;border-radius:' + Math.round(size * 0.32) + 'px"' : '';
    return '<span class="cw-ava"' + style + '>' + cwAvaImg((agent && agent.avatar) || { color: '#8f80ff', shape: 'cube' }) + '</span>';
  }
  function cwAgentById(id) { var cw = cwEnsure(); for (var i = 0; i < cw.agents.length; i++) if (cw.agents[i].id === id) return cw.agents[i]; return null; }
  // The three.js renderer registers in a deferred module, possibly after the
  // first paint; redraw SVG fallbacks as real characters once it is ready.
  window.addEventListener('coworkavatarsready', function () {
    if (S.active !== 'cowork') return;
    cwRenderRail();
    cwRenderMsgs();
    cwRenderInfo();
  });
  function cwActiveConv() { var cw = cwEnsure(); for (var i = 0; i < cw.convs.length; i++) if (cw.convs[i].id === cw.active) return cw.convs[i]; return null; }
  function cwConvMembers(conv) { var out = []; for (var i = 0; i < conv.memberIds.length; i++) { var a = cwAgentById(conv.memberIds[i]); if (a) out.push(a); } return out; }

  function openCowork() {
    S.active = 'cowork';
    document.body.classList.add('cowork');
    try { localStorage.setItem('hermes.cowork', 'open'); } catch (e) {}
    toggleMobileNav(false);
    stopStreams();
    cwStopPoll();
    renderSidebar();
    var cw = cwEnsure();
    $('view').innerHTML =
      '<div class="cw" id="cw">' +
        '<aside class="cw-rail">' +
          '<div class="cw-rail-head"><span class="cw-brand">' + cwIcon('users') + '<span>COWORK</span></span><span class="spacer"></span>' +
          '<button class="iconbtn" id="cwAddAgent" title="New teammate" aria-label="New teammate">' + cwIcon('plus') + '</button>' +
          '<button class="iconbtn" id="cwAddGroup" title="New group chat" aria-label="New group chat">' + cwIcon('chat') + '</button></div>' +
          '<div class="cw-rail-scroll" id="cwRail"></div>' +
          '<div class="cw-rail-foot"><button class="btn ghost" id="cwExit">Back to workspace</button><button class="btn ghost" id="cwGear" title="Settings" aria-label="Settings">' + cwIcon('gear') + '</button></div>' +
        '</aside>' +
        '<section class="cw-chat" id="cwChat"></section>' +
        '<aside class="cw-info" id="cwInfo"></aside>' +
      '</div>';
    // The app's gear icon is registered in ICONS; reuse its markup.
    var gearBtn = $('cwGear');
    if (gearBtn && typeof icon === 'function') gearBtn.innerHTML = icon('gear');
    $('cwExit').onclick = cwExit;
    $('cwGear').onclick = function () { openSettings('cowork'); };
    $('cwAddAgent').onclick = function () { cwAgentModal(null); };
    $('cwAddGroup').onclick = function () { cwGroupModal(); };
    cwLoad(true);
  }

  function cwExit() {
    cwStopPoll();
    document.body.classList.remove('cowork');
    S.active = 'home';
    try { localStorage.setItem('hermes.cowork', 'closed'); } catch (e) {}
    openHome();
  }

  function cwLoad(openFirst) {
    var cw = cwEnsure();
    api('/api/cowork/agents').then(function (d) {
      cw.agents = d.agents || [];
      cw.skills = d.availableSkills || [];
      cw.memoryCounts = d.memoryCounts || {};
      cw.computers = d.computers || [];
      cw.profile = d.profile || {};
      return api('/api/cowork/conversations');
    }).then(function (d) {
      cw.convs = d.conversations || [];
      cwRenderRail();
      if (openFirst && cw.convs.length > 0 && !cwActiveConv()) cwOpenConv(cw.convs[cw.convs.length - 1].id);
      else if (!cw.active) cwRenderChat();
    }).catch(function (e) { toast(e.message, true); });
  }

  function cwRenderRail() {
    var cw = cwEnsure();
    var el = $('cwRail');
    if (!el) return;
    var cwRoot = $('cw');
    if (cwRoot) cwRoot.classList.toggle('cw-empty', cw.agents.length === 0);
    var html = '<div class="cw-sec">TEAM</div>';
    if (cw.agents.length === 0) html += '<div class="cw-empty-note">No teammates yet. Create the first profile — pick a name, a character and instructions.</div>';
    cw.agents.forEach(function (a) {
      html += '<button class="cw-item" data-agent="' + esc(a.id) + '">' + cwAva(a) +
        '<span class="cw-item-main"><span class="cw-item-name">' + esc(a.name) + '</span><span class="cw-item-sub">' + esc(a.tagline || 'tap to chat') + '</span></span>' +
        (a.chiefOfStaff ? '<span class="cw-flag gold" title="Default chief of staff">' + cwIcon('crown') + '</span>' : '') + '</button>';
    });
    html += '<div class="cw-sec">CHATS</div>';
    if (cw.convs.length === 0) html += '<div class="cw-empty-note">No conversations. Open a DM from the team list, or build a group chat.</div>';
    cw.convs.forEach(function (c) {
      var members = cwConvMembers(c);
      var sub = c.kind === 'group' ? members.map(function (m) { return m.name; }).join(', ') : (members[0] ? members[0].tagline : '');
      var ava = c.kind === 'group'
        ? '<span class="cw-ava" style="background:rgba(143,128,255,.14);border:1px dashed var(--border2);color:var(--muted)">' + cwIcon('users') + '</span>'
        : (members[0] ? cwAva(members[0]) : '<span class="cw-ava"></span>');
      html += '<button class="cw-item' + (c.id === cw.active ? ' cur' : '') + '" data-conv="' + esc(c.id) + '">' + ava +
        '<span class="cw-item-main"><span class="cw-item-name">' + esc(c.title) + '</span><span class="cw-item-sub">' + esc(sub) + '</span></span>' +
        (c.telegram && c.telegram.enabled ? '<span class="cw-flag" title="Telegram gateway connected">' + cwIcon('plane') + '</span>' : '') +
        (c.schedule && c.schedule.enabled ? '<span class="cw-flag" title="Scheduled messages active">' + cwIcon('clock') + '</span>' : '') +
        '</button>';
    });
    el.innerHTML = html;
    el.querySelectorAll('[data-agent]').forEach(function (b) {
      b.onclick = function () { cwOpenDm(b.getAttribute('data-agent')); };
    });
    el.querySelectorAll('[data-conv]').forEach(function (b) {
      b.onclick = function () { cwOpenConv(b.getAttribute('data-conv')); };
    });
  }

  function cwOpenDm(agentId) {
    var cw = cwEnsure();
    var existing = null;
    cw.convs.forEach(function (c) { if (c.kind === 'dm' && c.memberIds.length === 1 && c.memberIds[0] === agentId) existing = c; });
    if (existing) { cwOpenConv(existing.id); return; }
    api('/api/cowork/conversations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'dm', memberIds: [agentId] }) })
      .then(function (d) { cw.convs.push(d.conversation); cwRenderRail(); cwOpenConv(d.conversation.id); })
      .catch(function (e) { toast(e.message, true); });
  }

  function cwOpenConv(id) {
    var cw = cwEnsure();
    cw.active = id;
    cw.msgs = [];
    cw.lastSeq = 0;
    cwStopPoll();
    var cwRoot = $('cw');
    if (cwRoot) cwRoot.classList.remove('rail-open');
    cwRenderRail();
    cwRenderChat();
    cwPoll().then(function () {
      cw.timer = setInterval(cwPoll, 2000);
    });
  }

  function cwRenderChat() {
    var cw = cwEnsure();
    var chat = $('cwChat');
    if (!chat) return;
    var conv = cwActiveConv();
    document.title = conv ? conv.title + ' — Cowork' : 'Cowork — Agent Gitu';
    if (!conv) {
      chat.innerHTML =
        '<div class="cw-hero">' +
          '<span class="cw-hero-ico">' + cwIcon('users') + '</span>' +
          '<h1>Your team, in one place</h1>' +
          '<p>Name your agents and chat with them directly or in groups. Teammates coordinate through @mentions, share files explicitly, and each have a private Linux computer and browser. Connect Telegram to see their replies and tool activity as they work.</p>' +
          '<div class="cw-hero-cta"><button class="btn dark" id="cwHeroAgent">New teammate</button><button class="btn ghost" id="cwHeroGroup">New group chat</button></div>' +
          (cw.agents.length === 0 ? '<div class="cw-hero-back"><button class="btn ghost" id="cwHeroBack">Back to workspace</button></div>' : '') +
        '</div>';
      $('cwHeroAgent').onclick = function () { cwAgentModal(null); };
      $('cwHeroGroup').onclick = function () { cwGroupModal(); };
      var heroBack = $('cwHeroBack');
      if (heroBack) heroBack.onclick = cwExit;
      $('cwInfo').innerHTML = '';
      return;
    }
    var members = cwConvMembers(conv);
    var chief = conv.chiefId ? cwAgentById(conv.chiefId) : null;
    var headAva = conv.kind === 'group'
      ? '<span class="cw-ava" style="background:rgba(143,128,255,.14);border:1px solid var(--border2);color:var(--muted)">' + cwIcon('users') + '</span>'
      : (members[0] ? cwAva(members[0]) : '<span class="cw-ava"></span>');
    chat.innerHTML =
      '<div class="cw-chat-head">' +
        (window.innerWidth <= 720 ? '<button class="cw-info-toggle" id="cwBack">Back</button>' : '') +
        headAva +
        '<div class="cw-tt"><div class="t1">' + esc(conv.title) + (conv.kind === 'group' && chief ? '<span title="Chief of staff: ' + esc(chief.name) + '">' + cwIcon('crown') + '</span>' : '') + '</div>' +
        '<div class="t2">' + esc(members.map(function (m) { return '@' + m.name; }).join(' · ')) + '</div></div>' +
        (conv.telegram && conv.telegram.enabled ? '<span class="chip ok" title="Telegram gateway on">' + cwIcon('plane') + 'Telegram</span>' : '') +
        (conv.schedule && conv.schedule.enabled ? '<span class="chip" title="Scheduled messages on">' + cwIcon('clock') + esc(conv.schedule.every) + '</span>' : '') +
        '<button class="cw-info-toggle" id="cwInfoBtn">' + (cw.infoOpen ? 'Hide panel' : 'Chat panel') + '</button>' +
      '</div>' +
      '<div class="cw-msgs" id="cwMsgs"></div>' +
      '<div class="cw-typing" id="cwTyping" hidden></div>' +
      '<div class="cw-composer-wrap">' +
        '<div class="cw-mentions" id="cwMentions"' + (conv.kind === 'group' ? '' : ' hidden') + '></div>' +
        '<div class="cw-composer"><textarea id="cwInput" rows="1" placeholder="' + (conv.kind === 'group' ? 'Message the team — @Name to bring someone in' : 'Message ' + esc(conv.title)) + '"></textarea>' +
        '<button class="cw-send" id="cwSend" title="Send (Enter)" aria-label="Send message">' + cwIcon('send') + '</button></div>' +
      '</div>';
    $('cwInfoBtn').onclick = function () { cw.infoOpen = !cw.infoOpen; $('cwInfo').style.display = cw.infoOpen ? '' : 'none'; $('cwInfoBtn').textContent = cw.infoOpen ? 'Hide panel' : 'Chat panel'; };
    $('cwInfo').style.display = cw.infoOpen ? '' : 'none';
    var back = $('cwBack');
    if (back) back.onclick = function () { var el = $('cw'); if (el) el.classList.toggle('rail-open'); };
    var input = $('cwInput');
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); cwSend(); } });
    input.addEventListener('input', function () { input.style.height = 'auto'; input.style.height = Math.min(160, input.scrollHeight) + 'px'; });
    $('cwSend').onclick = cwSend;
    if (conv.kind === 'group') {
      var men = $('cwMentions');
      members.forEach(function (m) {
        var b = document.createElement('button');
        b.textContent = '@' + m.name;
        b.title = 'Insert @' + m.name;
        b.onclick = function () {
          var at = input.selectionStart || input.value.length;
          input.value = input.value.slice(0, at) + '@' + m.name + ' ' + input.value.slice(at);
          input.focus();
        };
        men.appendChild(b);
      });
    }
    cwRenderMsgs();
    cwRenderInfo();
  }

  function cwBubbleHtml(m) {
    var conv = cwActiveConv();
    var members = conv ? cwConvMembers(conv) : [];
    var agent = m.agentId ? cwAgentById(m.agentId) : null;
    if (m.role === 'system') return '<div class="cw-sys">' + esc(m.text) + '</div>';
    if (m.role === 'user') {
      var via = '';
      if (m.via === 'telegram') via = ' · Telegram' + (m.from ? ' — ' + esc(m.from) : '');
      else if (m.via === 'schedule') via = ' · schedule';
      return '<div class="cw-row me"><div class="cw-bubble"><div class="cw-meta"><span class="nm">You</span><span class="tg">' + via + ' · ' + cwTime(m.ts) + '</span></div>' + cwBody(m.text, members) + '</div></div>';
    }
    var toolChips = '';
    if (m.tools && m.tools.length > 0) {
      toolChips = '<div class="cw-tools">' + m.tools.map(function (t) { return '<span class="' + (t.ok ? 'ok' : 'bad') + '" title="' + (t.ok ? 'completed' : 'failed') + '">' + esc(t.name) + '</span>'; }).join('') + '</div>';
    }
    return '<div class="cw-row">' + cwAva(agent || { name: m.agentName || 'agent', avatar: { color: '#8f80ff', shape: 'cube' } }) +
      '<div class="cw-bubble"><div class="cw-meta"><span class="nm">' + esc(m.agentName || 'agent') + '</span><span class="tg">' + cwTime(m.ts) + '</span></div>' +
      cwBody(m.text, members) + toolChips + '</div></div>';
  }

  function cwTime(ts) {
    var d = new Date(ts);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  // Small, safe rich-text renderer: escape first, then restore code fences,
  // inline code, bold, links and @mentions on the escaped text. Backticks
  // survive esc() unchanged, so \x60 matches them post-escape.
  function cwBody(text, members) {
    var out = esc(text);
    out = out.replace(/\x60\x60\x60([\s\S]*?)\x60\x60\x60/g, function (all, code) { return '</span><span class="cw-code">' + String(code).replace(/^\n/, '') + '</span><span>'; });
    out = out.replace(/\x60([^\x60\n]+)\x60/g, function (all, code) { return '<code>' + code + '</code>'; });
    out = out.replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>');
    out = out.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    (members || []).forEach(function (m) {
      var safe = String(m.name).replace(new RegExp('[^A-Za-z0-9_.\\-]', 'g'), '');
      if (!safe) return;
      out = out.replace(new RegExp('@(' + safe + ')', 'gi'), '<span class="cw-mention">@$1</span>');
    });
    out = out.replace(/\n/g, '<br>');
    return '<span>' + out + '</span>';
  }

  function cwRenderMsgs() {
    var wrap = $('cwMsgs');
    if (!wrap) return;
    var cw = cwEnsure();
    var nearBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 120;
    wrap.innerHTML = cw.msgs.map(function (m) { return cwBubbleHtml(m); }).join('');
    if (nearBottom || cw.msgs.length <= 2) wrap.scrollTop = wrap.scrollHeight;
  }

  // Telegram + schedule cards are available on EVERY conversation: a DM
  // gateway is how an agent gets its own bot, groups link a shared room.
  function cwGatewayHtml(conv, kind) {
    var tg = conv.telegram || { enabled: false };
    var sched = conv.schedule || { every: '', goal: '', enabled: false };
    var hint = kind === 'dm'
      ? 'Message your bot in a private Telegram chat (or add it to a group), send anything there, then press "Find chats". ' + esc(conv.title) + ' replies are mirrored back automatically.'
      : 'Add your bot to the Telegram group (or DM it), send any message there, then press "Find chats". Agent replies are mirrored back automatically.';
    return {
      html:
        '<h4>TELEGRAM GATEWAY</h4>' +
        '<div class="cw-card">' +
          '<div class="cw-check"><input type="checkbox" id="cwTgOn"' + (tg.enabled ? ' checked' : '') + '> <span>Connect this chat to Telegram</span></div>' +
          '<label>Bot token (from @BotFather)</label><input type="password" id="cwTgToken" value="' + esc(tg.token || '') + '" placeholder="123456:ABC-DEF...">' +
          '<label>Linked chat</label>' +
          '<div style="display:flex;gap:6px"><select id="cwTgChat"><option value="' + esc(tg.chatId || '') + '">' + esc(tg.chatTitle || tg.chatId || '— pick a chat —') + '</option></select>' +
          '<button class="btn ghost" id="cwTgFind" style="flex:none">Find chats</button></div>' +
          '<div style="font-size:11px;color:var(--faint);margin-top:6px">' + hint + '</div>' +
          '<div class="cw-actions"><button class="btn dark" id="cwTgSave">Save gateway</button></div>' +
        '</div>' +
        '<h4>SCHEDULE</h4>' +
        '<div class="cw-card">' +
          '<label>Run every (e.g. 30m, 1h)</label><input type="text" id="cwSchEvery" value="' + esc(sched.every || '') + '" placeholder="1h">' +
          '<label>Prompt to inject on schedule</label><textarea id="cwSchGoal" rows="2">' + esc(sched.goal || '') + '</textarea>' +
          '<div class="cw-check"><input type="checkbox" id="cwSchOn"' + (sched.enabled ? ' checked' : '') + '> <span>Enabled</span></div>' +
          (sched.lastRunAt ? '<div style="font-size:11px;color:var(--faint);margin-top:6px">Last run: ' + esc(shortDate(sched.lastRunAt)) + '</div>' : '') +
          '<div class="cw-actions"><button class="btn dark" id="cwSchSave">Save schedule</button></div>' +
        '</div>',
      bind: function () {
        $('cwTgFind').onclick = function () {
          var token = $('cwTgToken').value.trim();
          if (!token) { toast('Paste the bot token first', true); return; }
          api('/api/cowork/telegram/chats', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: token }) })
            .then(function (d) {
              var sel = $('cwTgChat');
              sel.innerHTML = (d.chats || []).map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.title) + ' (' + esc(c.id) + ')</option>'; }).join('') || '<option value="">No chats found — message the bot first</option>';
            })
            .catch(function (e) { toast(e.message, true); });
        };
        $('cwTgSave').onclick = function () {
          var sel = $('cwTgChat');
          var body = { telegram: { enabled: $('cwTgOn').checked, token: $('cwTgToken').value.trim(), chatId: sel ? sel.value : '', chatTitle: sel && sel.selectedOptions[0] ? sel.selectedOptions[0].textContent : '' } };
          api('/api/cowork/conversations/' + encodeURIComponent(conv.id), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
            .then(function (d) { cw.convs = cw.convs.map(function (c) { return c.id === d.conversation.id ? d.conversation : c; }); cwRenderChat(); cwRenderRail(); toast(d.conversation.telegram && d.conversation.telegram.enabled ? 'Telegram gateway connected' : 'Telegram gateway disabled'); })
            .catch(function (e) { toast(e.message, true); });
        };
        $('cwSchSave').onclick = function () {
          var body = { schedule: { every: $('cwSchEvery').value, goal: $('cwSchGoal').value, enabled: $('cwSchOn').checked } };
          api('/api/cowork/conversations/' + encodeURIComponent(conv.id), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
            .then(function (d) { cw.convs = cw.convs.map(function (c) { return c.id === d.conversation.id ? d.conversation : c; }); cwRenderChat(); cwRenderRail(); toast(d.conversation.schedule && d.conversation.schedule.enabled ? 'Schedule saved' : 'Schedule disabled'); })
            .catch(function (e) { toast(e.message, true); });
        };
      }
    };
  }

  function cwRenderInfo() {
    var cw = cwEnsure();
    var conv = cwActiveConv();
    var el = $('cwInfo');
    if (!el) return;
    if (!conv) { el.innerHTML = ''; return; }
    var members = cwConvMembers(conv);
    if (conv.kind === 'dm') {
      var a = members[0];
      if (!a) { el.innerHTML = ''; return; }
      var gw = cwGatewayHtml(conv, 'dm');
      el.innerHTML =
        '<h4>TEAMMATE</h4>' +
        '<div class="cw-card"><div class="cw-mrow">' + cwAva(a, 44) + '<span class="nm">' + esc(a.name) + ' <span class="tg">' + esc(a.tagline || '') + '</span></span></div>' +
        '<div style="font-size:12px;color:var(--muted);margin-top:8px;white-space:pre-wrap;max-height:180px;overflow-y:auto">' + esc(a.systemPrompt.slice(0, 600)) + (a.systemPrompt.length > 600 ? '…' : '') + '</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">' +
          '<span class="chip">' + esc((a.provider ? a.provider + ' / ' : '') + (a.model || 'default model')) + '</span>' +
          (a.effort ? '<span class="chip">effort: ' + esc(a.effort) + '</span>' : '') +
          (a.chiefOfStaff ? '<span class="chip" style="color:var(--evidence);display:inline-flex;align-items:center;gap:4px">' + cwIcon('crown') + 'chief of staff</span>' : '') +
          (a.allowShell ? '<span class="chip" style="color:var(--amber)">shell allowed</span>' : '') +
          (a.allowWrites ? '<span class="chip" style="color:var(--amber)">writes allowed</span>' : '') +
          (a.allowConfig ? '<span class="chip" style="color:var(--amber)">tool setup</span>' : '') +
        '</div>' +
        (a.skills && a.skills.length ? '<div style="margin-top:8px;font-size:11.5px;color:var(--muted)">Skills: ' + esc(a.skills.join(', ')) + '</div>' : '') +
        '<div style="margin-top:10px;font-size:11.5px;color:var(--muted);display:flex;align-items:center;gap:8px">Persistent memory: <b>' + ((cw.memoryCounts || {})[a.id] || 0) + '</b> facts <button class="btn ghost" id="cwMemClear" style="padding:2px 8px;font-size:11px">Clear</button></div>' +
        '<div class="cw-actions"><button class="btn ghost" id="cwEditAgent">Edit profile</button></div></div>' +
        cwComputerHtml(a) + gw.html +
        '<div class="cw-actions"><button class="btn red" id="cwDelAgent">Delete teammate</button></div>';
      gw.bind();
      cwBindComputers(el);
      $('cwMemClear').onclick = function () {
        if (!confirm('Erase everything ' + a.name + ' has remembered across conversations?')) return;
        api('/api/cowork/agents/' + encodeURIComponent(a.id) + '/memory', { method: 'DELETE' }).then(function () {
          cw.memoryCounts[a.id] = 0;
          cwRenderInfo();
          toast('Memory cleared');
        }).catch(function (e) { toast(e.message, true); });
      };
      $('cwEditAgent').onclick = function () { cwAgentModal(a); };
      $('cwDelAgent').onclick = function () {
        if (!confirm('Delete ' + a.name + '? Their DM and profile are removed.')) return;
        api('/api/cowork/agents/' + encodeURIComponent(a.id), { method: 'DELETE' }).then(function () {
          cw.active = null; cw.msgs = []; cwLoad(true);
        }).catch(function (e) { toast(e.message, true); });
      };
      return;
    }
    // Group panel
    var gw = cwGatewayHtml(conv, 'group');
    el.innerHTML =
      '<h4>MEMBERS</h4>' +
      '<div class="cw-card">' + members.map(function (m) {
        return '<div class="cw-mrow">' + cwAva(m, 26) + '<span class="nm">@' + esc(m.name) + ' <span class="tg">' + esc(m.tagline || '') + '</span></span>' +
          '<button class="crown' + (conv.chiefId === m.id ? ' on' : '') + '" data-chief="' + esc(m.id) + '" title="Make chief of staff">' + cwIcon('crown') + '</button>' +
          '<button data-remove="' + esc(m.id) + '" title="Remove from group">' + cwIcon('close') + '</button></div>';
      }).join('') +
      '<button class="btn ghost" id="cwAddMember" style="width:100%;margin-top:6px">Add member</button></div>' +
      members.map(cwComputerHtml).join('') + gw.html +
      '<div class="cw-actions"><button class="btn red" id="cwDelConv">Delete chat</button></div>';
    el.querySelectorAll('[data-chief]').forEach(function (b) {
      b.onclick = function () {
        api('/api/cowork/conversations/' + encodeURIComponent(conv.id), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chiefId: b.getAttribute('data-chief') }) })
          .then(function (d) { cw.convs = cw.convs.map(function (c) { return c.id === d.conversation.id ? d.conversation : c; }); cwRenderChat(); cwRenderRail(); toast((cwAgentById(d.conversation.chiefId) || {}).name + ' is now chief of staff'); })
          .catch(function (e) { toast(e.message, true); });
      };
    });
    el.querySelectorAll('[data-remove]').forEach(function (b) {
      b.onclick = function () {
        var next = conv.memberIds.filter(function (id) { return id !== b.getAttribute('data-remove'); });
        api('/api/cowork/conversations/' + encodeURIComponent(conv.id), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ memberIds: next }) })
          .then(function (d) { cw.convs = cw.convs.map(function (c) { return c.id === d.conversation.id ? d.conversation : c; }); cwRenderChat(); cwRenderRail(); })
          .catch(function (e) { toast(e.message, true); });
      };
    });
    $('cwAddMember').onclick = function () {
      var outside = cw.agents.filter(function (a) { return conv.memberIds.indexOf(a.id) < 0; });
      if (outside.length === 0) { toast('Every teammate is already in this chat'); return; }
      var pick = outside.map(function (a) { return a.name + ' (' + a.tagline + ')'; }).map(function (t, i) { return (i + 1) + '. ' + t; }).join('\n');
      var name = prompt('Add member — type a name:\n' + pick);
      if (!name) return;
      var agent = cw.agents.filter(function (a) { return conv.memberIds.indexOf(a.id) < 0 && a.name.toLowerCase() === name.trim().toLowerCase(); })[0];
      if (!agent) { toast('No teammate named ' + name, true); return; }
      api('/api/cowork/conversations/' + encodeURIComponent(conv.id), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ memberIds: conv.memberIds.concat([agent.id]) }) })
        .then(function (d) { cw.convs = cw.convs.map(function (c) { return c.id === d.conversation.id ? d.conversation : c; }); cwRenderChat(); cwRenderRail(); })
        .catch(function (e) { toast(e.message, true); });
    };
    gw.bind();
    cwBindComputers(el);
    $('cwDelConv').onclick = function () {
      if (!confirm('Delete this chat and its whole transcript?')) return;
      api('/api/cowork/conversations/' + encodeURIComponent(conv.id), { method: 'DELETE' }).then(function () {
        cw.active = null; cw.msgs = []; cwStopPoll(); cwLoad(true);
      }).catch(function (e) { toast(e.message, true); });
    };
  }

  function cwComputerHtml(agent) {
    var computer = (cwEnsure().computers || []).filter(function (c) { return c.agentId === agent.id; })[0] || { state: 'stopped' };
    return '<div class="cw-card"><h4>' + esc(agent.name) + ' · COMPUTER</h4><div class="chip">' + esc(computer.state) + '</div>' +
      '<p style="font-size:11.5px;color:var(--muted)">Private Linux files, shell and browser. Files and browser sessions persist when stopped.</p>' +
      (computer.error ? '<p style="font-size:11.5px;color:var(--err)">' + esc(computer.error) + '</p>' : '') +
      '<div class="cw-actions"><button class="btn ghost" data-computer="' + esc(agent.id) + '" data-action="start">Start</button>' +
      '<button class="btn ghost" data-computer="' + esc(agent.id) + '" data-action="stop">Stop</button>' +
      '<button class="btn ghost" data-computer="' + esc(agent.id) + '" data-action="screenshot">View browser</button></div>' +
      '<div data-screen="' + esc(agent.id) + '"></div></div>';
  }

  function cwBindComputers(el) {
    el.querySelectorAll('[data-computer]').forEach(function (button) {
      button.onclick = function () {
        var id = button.getAttribute('data-computer');
        var action = button.getAttribute('data-action');
        button.disabled = true;
        api('/api/cowork/agents/' + encodeURIComponent(id) + '/computer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: action }) })
          .then(function (d) {
            var cw = cwEnsure();
            cw.computers = (cw.computers || []).filter(function (c) { return c.agentId !== id; }).concat([d.computer]);
            if (d.pngBase64) {
              var target = el.querySelector('[data-screen="' + id + '"]');
              if (target) {
                var img = document.createElement('img');
                img.src = 'data:image/png;base64,' + d.pngBase64;
                img.alt = 'Private browser screenshot'; img.style.width = '100%';
                target.replaceChildren(img);
              }
            } else cwRenderInfo();
          }).catch(function (e) { toast(e.message, true); }).finally(function () { button.disabled = false; });
      };
    });
  }

  function cwPoll() {
    var cw = cwEnsure();
    var conv = cwActiveConv();
    if (!conv || S.active !== 'cowork') return Promise.resolve();
    var convId = conv.id;
    return api('/api/cowork/conversations/' + encodeURIComponent(convId) + '/messages?after=' + cw.lastSeq).then(function (d) {
      if (cw.active !== convId || S.active !== 'cowork') return;
      if (d.messages && d.messages.length > 0) {
        d.messages.forEach(function (m) { cw.msgs.push(m); cw.lastSeq = Math.max(cw.lastSeq, m.seq); });
        cwRenderMsgs();
      }
      var wasBusy = cw.busy;
      cw.busy = Boolean(d.busy);
      cw.working = d.working || null;
      cw.progress = d.progress || null;
      cw.queued = d.queued || 0;
      cwRenderTyping();
      if (wasBusy && !cw.busy) cwRenderInfo();
      if (!cw.computersChecked || Date.now() - cw.computersChecked > 5000) {
        cw.computersChecked = Date.now();
        Promise.all(cwConvMembers(conv).map(function (a) {
          return api('/api/cowork/agents/' + encodeURIComponent(a.id) + '/computer').then(function (v) { return v.computer; });
        })).then(function (computers) {
          if (cw.active !== convId) return;
          if (JSON.stringify(cw.computers) !== JSON.stringify(computers)) { cw.computers = computers; cwRenderInfo(); }
        }).catch(function () {});
      }
    }).catch(function () {});
  }

  function cwRenderTyping() {
    var cw = cwEnsure();
    var el = $('cwTyping');
    var btn = $('cwSend');
    if (!el || !btn) return;
    if (cw.busy) {
      var agent = null;
      for (var i = 0; i < cw.agents.length; i++) if (cw.working && cw.agents[i].name === cw.working) agent = cw.agents[i];
      el.innerHTML = '<span class="dots"><i></i><i></i><i></i></span> ' + (agent ? cwAva(agent, 18) + ' <b>' + esc(agent.name) + '</b> is thinking…' : 'the team is thinking…');
      if (cw.progress) {
        var p = cw.progress;
        el.innerHTML = '<div style="white-space:pre-wrap;max-height:240px;overflow:auto"><b>' + esc(p.agentName) + '</b>\n' + esc(p.text || 'Working…') +
          (p.tool ? '\n' + esc(p.tool) + ': ' + (p.toolOk === undefined ? 'running…' : p.toolOk ? 'completed' : 'failed') : '') + '</div>';
      }
      if (cw.queued) el.innerHTML += '<span>' + cw.queued + ' queued</span>';
      el.hidden = false;
      btn.classList.add('stop');
      btn.innerHTML = cwIcon('stop');
      btn.title = 'Stop the team';
      btn.onclick = cwStopRun;
    } else {
      el.hidden = true;
      btn.classList.remove('stop');
      btn.innerHTML = cwIcon('send');
      btn.title = 'Send (Enter)';
      btn.onclick = cwSend;
    }
  }

  function cwStopRun() {
    var cw = cwEnsure();
    if (!cw.active) return;
    api('/api/cowork/conversations/' + encodeURIComponent(cw.active) + '/stop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      .then(function () { toast('Stopping the team…'); })
      .catch(function (e) { toast(e.message, true); });
  }

  function cwSend() {
    var cw = cwEnsure();
    var input = $('cwInput');
    if (!input) return;
    var text = input.value.trim();
    if (!text) return;
    if (!cw.active) { toast('Open a chat first', true); return; }
    input.value = '';
    input.style.height = 'auto';
    api('/api/cowork/conversations/' + encodeURIComponent(cw.active) + '/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: text }) })
      .then(function () { cwPoll(); })
      .catch(function (e) { toast(e.message, true); cwPoll(); });
  }

  // ------------------- modals -------------------

  function cwAgentModal(agent) {
    var cw = cwEnsure();
    var isEdit = Boolean(agent && agent.id);
    var d = {
      name: agent ? agent.name : '',
      tagline: agent ? agent.tagline : '',
      systemPrompt: agent ? agent.systemPrompt : '',
      avatar: {
        color: agent && agent.avatar && agent.avatar.color ? agent.avatar.color : CW_COLORS[0],
        shape: agent && agent.avatar && agent.avatar.shape ? agent.avatar.shape : CW_SHAPES[0]
      },
      provider: agent ? (agent.provider || '') : '',
      model: agent ? (agent.model || '') : '',
      effort: agent ? (agent.effort || '') : '',
      skills: agent ? (agent.skills || []).slice() : [],
      allowShell: agent ? Boolean(agent.allowShell) : false,
      allowWrites: agent ? Boolean(agent.allowWrites) : false,
      allowConfig: agent ? Boolean(agent.allowConfig) : false,
      chiefOfStaff: agent ? Boolean(agent.chiefOfStaff) : false
    };
    var modal = document.createElement('div');
    modal.className = 'modal cw-modal';
    modal.innerHTML =
      '<div class="box"><div class="bar"><span style="font-weight:600;font-size:13px">' + (isEdit ? 'Edit teammate' : 'New teammate') + '</span><span style="flex:1"></span><button class="btn ghost" id="cwAmCancel">Cancel</button></div>' +
      '<div class="cw-body">' +
        '<div class="cw-2col"><div><label>Name — yours to choose</label><input type="text" id="cwAmName" value="' + esc(d.name) + '" maxlength="60" placeholder="e.g. Atlas, Vera, Rex…"></div>' +
        '<div><label>Role / tagline</label><input type="text" id="cwAmTag" value="' + esc(d.tagline) + '" maxlength="120" placeholder="Backend engineer"></div></div>' +
        '<label>Character</label>' +
        '<div class="cw-avrow">' +
          '<span class="cw-avprev" id="cwAmAvaWrap">' + cwAvaImg(d.avatar) + '</span>' +
          '<div class="cw-avopts">' +
            '<div class="cw-shapes" id="cwAmShapes">' + CW_SHAPES.map(function (s) { return '<button type="button" data-shape="' + s + '"' + (s === d.avatar.shape ? ' class="cur"' : '') + '>' + s + '</button>'; }).join('') + '</div>' +
            '<div class="cw-colors" id="cwAmColors">' + CW_COLORS.map(function (c) { return '<button type="button" data-color="' + c + '" style="background:' + c + '"' + (c === d.avatar.color ? ' class="cur"' : '') + ' aria-label="color ' + c + '"></button>'; }).join('') + '</div>' +
            '<div class="cw-avhint">Rendered live as a 3D voxel character (three.js) and used as the avatar everywhere.</div>' +
          '</div>' +
        '</div>' +
        (!isEdit ? '<label>Starting points — fill instructions only, then make it yours</label><div class="cw-templates">' + CW_TEMPLATES.map(function (t, i) { return '<button type="button" data-template="' + i + '">' + esc(t.label) + '</button>'; }).join('') + '</div>' : '') +
        '<label>Personality &amp; instructions (the system prompt)</label><textarea id="cwAmPrompt" placeholder="Who is this agent, how does it think and answer?">' + esc(d.systemPrompt) + '</textarea>' +
        '<div class="cw-2col"><div><label>Model provider</label><select id="cwAmProv"><option value="">Server default</option>' + (S.models || []).map(function (p) { return '<option value="' + esc(p.id) + '"' + (p.id === d.provider ? ' selected' : '') + '>' + esc(p.label || p.id) + '</option>'; }).join('') + '</select></div>' +
        '<div><label>Model</label><select id="cwAmModel"><option value="">Provider default</option></select></div></div>' +
        '<div class="cw-2col"><div><label>Effort</label><select id="cwAmEffort"><option value="">default</option><option value="low"' + (d.effort === 'low' ? ' selected' : '') + '>low</option><option value="medium"' + (d.effort === 'medium' ? ' selected' : '') + '>medium</option><option value="high"' + (d.effort === 'high' ? ' selected' : '') + '>high</option><option value="max"' + (d.effort === 'max' ? ' selected' : '') + '>max</option></select></div>' +
        '<div><label>Chief of staff</label><div class="cw-check" style="margin-top:8px"><input type="checkbox" id="cwAmChief"' + (d.chiefOfStaff ? ' checked' : '') + '> <span>Preselect as chief in new groups</span></div></div></div>' +
        '<label>Skills (loaded from the shared skill library)</label><div class="cw-skills" id="cwAmSkills">' +
          (cw.skills.length ? cw.skills.map(function (s) { return '<button data-skill="' + esc(s.name) + '"' + (d.skills.indexOf(s.name) >= 0 ? ' class="on"' : '') + '>' + esc(s.name) + '</button>'; }).join('') : '<span style="font-size:11.5px;color:var(--faint)">No skills defined yet — create them in Settings or by asking Gitu in a task.</span>') + '</div>' +
        '<div class="cw-perm">' +
          '<label><input type="checkbox" id="cwAmShell"' + (d.allowShell ? ' checked' : '') + '> Allow run_command</label>' +
          '<label><input type="checkbox" id="cwAmWrites"' + (d.allowWrites ? ' checked' : '') + '> Allow file writes</label>' +
          '<label><input type="checkbox" id="cwAmConfig"' + (d.allowConfig ? ' checked' : '') + '> Allow tool setup (add MCP servers, create skills, manage connections, create projects)</label>' +
        '</div>' +
        '<div class="cw-note">Every teammate can read files, search the workspace, fetch web pages, browse (desktop app) and keep persistent memories. Shell, writes and tool setup are opt-in per agent.</div>' +
      '</div>' +
      '<div class="cw-foot"><button class="btn ghost" id="cwAmDel"' + (isEdit ? '' : ' hidden') + '>Delete</button><span style="flex:1"></span><button class="btn dark" id="cwAmSave">' + (isEdit ? 'Save changes' : 'Create teammate') + '</button></div></div>';
    document.body.appendChild(modal);
    function refreshPreview() {
      var wrap = modal.querySelector('#cwAmAvaWrap');
      if (wrap) wrap.innerHTML = cwAvaImg(d.avatar);
    }
    modal.querySelectorAll('[data-shape]').forEach(function (b) {
      b.onclick = function () {
        d.avatar.shape = b.getAttribute('data-shape');
        modal.querySelectorAll('[data-shape]').forEach(function (x) { x.classList.remove('cur'); });
        b.classList.add('cur');
        refreshPreview();
      };
    });
    modal.querySelectorAll('[data-color]').forEach(function (b) {
      b.onclick = function () {
        d.avatar.color = b.getAttribute('data-color');
        modal.querySelectorAll('[data-color]').forEach(function (x) { x.classList.remove('cur'); });
        b.classList.add('cur');
        refreshPreview();
      };
    });
    modal.querySelectorAll('[data-template]').forEach(function (b) {
      b.onclick = function () {
        var t = CW_TEMPLATES[Number(b.getAttribute('data-template'))];
        $('cwAmPrompt').value = t.prompt;
        if (t.label === 'Coordinator') $('cwAmChief').checked = true;
      };
    });
    modal.querySelectorAll('[data-skill]').forEach(function (b) {
      b.onclick = function () {
        var s = b.getAttribute('data-skill');
        var i = d.skills.indexOf(s);
        if (i >= 0) { d.skills.splice(i, 1); b.classList.remove('on'); } else { d.skills.push(s); b.classList.add('on'); }
      };
    });
    var provSel = modal.querySelector('#cwAmProv');
    var modelSel = modal.querySelector('#cwAmModel');
    var fillModels = function () {
      var pid = provSel.value;
      var prov = null;
      (S.models || []).forEach(function (p) { if (p.id === pid) prov = p; });
      modelSel.innerHTML = '<option value="">Provider default</option>' + (prov ? (prov.models || []).map(function (m) { return '<option value="' + esc(m.id) + '"' + (m.id === d.model ? ' selected' : '') + '>' + esc(m.id) + '</option>'; }).join('') : '');
    };
    provSel.onchange = function () { d.model = ''; fillModels(); };
    fillModels();
    modal.querySelector('#cwAmCancel').onclick = function () { modal.remove(); };
    modal.querySelector('#cwAmSave').onclick = function () {
      var body = {
        id: isEdit ? agent.id : undefined,
        name: $('cwAmName').value,
        avatar: d.avatar,
        tagline: $('cwAmTag').value,
        systemPrompt: $('cwAmPrompt').value,
        provider: provSel.value,
        model: modelSel.value,
        effort: $('cwAmEffort').value,
        skills: d.skills,
        allowShell: $('cwAmShell').checked,
        allowWrites: $('cwAmWrites').checked,
        allowConfig: $('cwAmConfig').checked,
        chiefOfStaff: $('cwAmChief').checked
      };
      api('/api/cowork/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (res) {
          modal.remove();
          var cw2 = cwEnsure();
          var found = false;
          cw2.agents = cw2.agents.map(function (a) { if (a.id === res.agent.id) { found = true; return res.agent; } return a; });
          if (!found) cw2.agents.push(res.agent);
          cwRenderRail();
          toast(isEdit ? 'Teammate updated' : res.agent.name + ' joined the team');
        })
        .catch(function (e) { toast(e.message, true); });
    };
    var delBtn = modal.querySelector('#cwAmDel');
    if (isEdit && delBtn) {
      delBtn.onclick = function () {
        if (!confirm('Delete ' + agent.name + '?')) return;
        api('/api/cowork/agents/' + encodeURIComponent(agent.id), { method: 'DELETE' }).then(function () { modal.remove(); cwLoad(true); }).catch(function (e) { toast(e.message, true); });
      };
    }
    setTimeout(function () { var n = modal.querySelector('#cwAmName'); if (n && !isEdit) n.focus(); }, 0);
  }

  function cwGroupModal() {
    var cw = cwEnsure();
    if (cw.agents.length < 2) { toast('Create at least two teammates first — the + button in the rail.', true); cwAgentModal(null); return; }
    var modal = document.createElement('div');
    modal.className = 'modal cw-modal';
    modal.innerHTML =
      '<div class="box"><div class="bar"><span style="font-weight:600;font-size:13px">New group chat</span><span style="flex:1"></span><button class="btn ghost" id="cwGmCancel">Cancel</button></div>' +
      '<div class="cw-body">' +
        '<label>Group name</label><input type="text" id="cwGmTitle" placeholder="Product launch team" maxlength="120">' +
        '<label>Members (pick at least two)</label>' +
        '<div class="cw-skills" id="cwGmMembers">' + cw.agents.map(function (a) { return '<button data-id="' + esc(a.id) + '">' + esc(a.name) + '</button>'; }).join('') + '</div>' +
        '<label>Chief of staff (optional — coordinates who answers)</label>' +
        '<select id="cwGmChief"><option value="">No chief — first mentioned agent answers</option>' + cw.agents.map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(a.name) + '</option>'; }).join('') + '</select>' +
      '</div>' +
      '<div class="cw-foot"><span style="flex:1"></span><button class="btn dark" id="cwGmSave">Create group</button></div></div>';
    document.body.appendChild(modal);
    var chosen = [];
    modal.querySelectorAll('[data-id]').forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute('data-id');
        var i = chosen.indexOf(id);
        if (i >= 0) { chosen.splice(i, 1); b.classList.remove('on'); } else { chosen.push(id); b.classList.add('on'); }
      };
    });
    modal.querySelector('#cwGmCancel').onclick = function () { modal.remove(); };
    modal.querySelector('#cwGmSave').onclick = function () {
      if (chosen.length < 2) { toast('Pick at least two members', true); return; }
      api('/api/cowork/conversations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'group', title: $('cwGmTitle').value, memberIds: chosen, chiefId: $('cwGmChief').value }) })
        .then(function (d) { modal.remove(); cwEnsure().convs.push(d.conversation); cwRenderRail(); cwOpenConv(d.conversation.id); })
        .catch(function (e) { toast(e.message, true); });
    };
    setTimeout(function () { var t = modal.querySelector('#cwGmTitle'); if (t) t.focus(); }, 0);
  }
`;
