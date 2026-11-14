export const ONBOARDING_CSS = String.raw`
  .gitu-opening { position:fixed; inset:0; z-index:300; padding:24px; box-sizing:border-box; background:var(--cw-chat-surface,var(--bg)); display:grid; place-items:center; text-align:center; }
  .opening-content { width:min(100%,360px); }
  .gitu-opening img { display:block; width:72px; height:72px; margin:0 auto; }
  .gitu-opening h1 { font-size:26px; font-weight:600; letter-spacing:-.7px; margin:24px 0 8px; }
  .gitu-opening p { margin:0; color:var(--muted); font-size:13px; line-height:1.65; text-wrap:balance; }
  .opening-dots { display:flex; justify-content:center; gap:6px; margin-top:24px; }
  .opening-dots i { width:4px; height:4px; border-radius:50%; background:var(--run); animation:setupPulse 1.6s ease-in-out infinite; }
  .opening-dots i:nth-child(2) { animation-delay:.16s; }.opening-dots i:nth-child(3) { animation-delay:.32s; }
  .gitu-opening #startupReload { margin-top:24px; border-radius:999px; padding:10px 20px; background:var(--run)!important; color:var(--card); }
  .gitu-opening.is-error .opening-dots { display:none; }
  @keyframes setupPulse { 0%,80%,100% { opacity:.28; } 40% { opacity:1; } }
  .setup-wizard { position:fixed; inset:0; z-index:250; overflow-y:auto; background:var(--cw-chat-surface,var(--bg)); padding:40px 24px; box-sizing:border-box; display:grid; place-items:safe center; }
  .setup-frame { width:min(100%,940px); display:grid; grid-template-columns:210px minmax(0,1fr); border:1px solid var(--border); background:var(--card); border-radius:var(--radius-chat,28px); box-shadow:var(--shadow-float); overflow:hidden; }
  .setup-aside { padding:32px 24px; background:var(--card2); border-right:1px solid var(--border); }
  .setup-brand { display:flex; align-items:center; gap:10px; font-size:14px; font-weight:600; }
  .setup-brand img { width:32px; height:32px; }
  .setup-aside p { color:var(--muted); font-size:12px; line-height:1.65; margin:20px 0 32px; }
  .setup-steps { list-style:none; padding:0; margin:0; display:grid; gap:20px; }
  .setup-steps li { display:flex; align-items:center; gap:10px; color:var(--muted); font-size:12px; }
  .setup-steps li[aria-current=step] { color: var(--text); font-weight: 600; }
  .setup-step-number { border:1px solid color-mix(in srgb,var(--border2) 65%,transparent); border-radius:50%; width:26px; height:26px; display:grid; place-items:center; font-size:11px; flex:none; }
  [aria-current=step] .setup-step-number { background:var(--run); border-color:var(--run); color:var(--card); }
  .setup-main { min-width: 0; padding: 36px; }
  .setup-main h1 { font-size:25px; line-height:1.25; font-weight:600; letter-spacing:-.7px; margin:0 0 10px; text-wrap:balance; }
  .setup-main .setup-description { color:var(--muted); margin:0 0 28px; font-size:13px; line-height:1.65; }
  .setup-main h2 { font-size: 15px; margin-top: 24px; }
  .setup-main label.setup-field { display: block; font-size: 12px; font-weight: 600; margin: 16px 0 6px; }
  #setupWizard .setup-main :is(select,textarea,input:not([type=radio]):not([type=checkbox]):not(.chatgpt-signin-code)) { width:100%; min-width:0; box-sizing:border-box; font:inherit; font-size:13px; padding:12px 14px; border-radius:14px; border:1px solid color-mix(in srgb,var(--border2) 70%,transparent); background:color-mix(in srgb,var(--card) 72%,transparent); color:var(--text); }
  .setup-main :is(select,textarea,input):focus-visible { outline:2px solid var(--run); outline-offset:3px; }
  .setup-key-row { display: flex; gap: 8px; }
  .setup-key-row input { flex: 1; }
  .setup-provider-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
  .setup-note { font-size:12px; color:var(--muted); margin-top:10px; line-height:1.65; }
  .setup-message { font-size:13px; color:var(--text); line-height:1.65; padding:14px 16px; border-radius:18px; background:color-mix(in srgb,var(--card) 88%,transparent); margin-top:20px; white-space:pre-wrap; overflow-wrap:anywhere; }
  .setup-message:empty { display:none; }
  .setup-message.error { background:var(--err-dim); color:var(--err); }
  .setup-footer { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-top:32px; padding-top:0; border:0; }
  .setup-wizard .btn { border-radius:999px; min-height:40px; padding:9px 18px; font-size:12px; }
  #setupWizard .btn.dark { background:var(--run)!important; color:var(--card); border-color:transparent; }
  #setupWizard .btn.dark:hover { background:color-mix(in srgb,var(--run) 86%,var(--text))!important; }
  .setup-wizard .btn.ghost { color:var(--muted); border-color:transparent; }
  .setup-footer > div { display: flex; gap: 8px; }
  .setup-modes { display: grid; gap: 12px; }
  .setup-mode { display:flex; gap:14px; padding:20px; border-radius:var(--radius-card,16px); border:1px solid var(--border); background:var(--card); box-shadow:var(--shadow); cursor:pointer; }
  .setup-mode:has(input:checked) { border-color:var(--run); box-shadow:inset 0 0 0 1px var(--run); background:color-mix(in srgb,var(--run) 6%,var(--card)); }
  .setup-mode input { width:16px; flex:none; margin:5px 0 0; align-self:start; accent-color:var(--run); }
  .setup-mode b { display: block; font-size: 15px; margin-bottom: 5px; }
  .setup-mode small { font-size: 12px; line-height: 1.7; color: var(--muted); }
  .setup-agent-modes { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin-bottom:14px; }
  .setup-agent-mode { display:grid; gap:3px; padding:12px 14px; border-radius:16px; border:1px solid var(--border); background:var(--card2); color:var(--text); text-align:left; cursor:pointer; transition:border-color .15s,background .15s,box-shadow .15s; }
  .setup-agent-mode b { font-size:13px; font-weight:600; }
  .setup-agent-mode span { font-size:11.5px; color:var(--muted); line-height:1.45; }
  .setup-agent-mode[aria-pressed=true] { border-color:var(--run); background:color-mix(in srgb,var(--run) 7%,var(--card)); box-shadow:inset 0 0 0 1px var(--run); }
  .setup-agents-toolbar { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:10px; font-size:12px; color:var(--muted); }
  .setup-agents-toolbar > div { display:flex; gap:6px; flex-wrap:wrap; }
  .setup-agent-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; max-height:320px; overflow-y:auto; padding:2px; }
  .setup-agent-card { display:flex; align-items:flex-start; gap:10px; padding:12px 14px; border-radius:16px; border:1px solid var(--border); background:var(--card); color:var(--text); text-align:left; cursor:pointer; transition:border-color .15s,background .15s; }
  .setup-agent-card:hover { border-color:var(--border2); }
  .setup-agent-card.is-selected { border-color:var(--run); background:color-mix(in srgb,var(--run) 7%,var(--card)); box-shadow:inset 0 0 0 1px var(--run); }
  .setup-agent-dot { width:12px; height:12px; border-radius:50%; flex:none; margin-top:4px; }
  .setup-agent-card-body { min-width:0; flex:1; }
  .setup-agent-card-head { display:flex; align-items:center; justify-content:space-between; gap:6px; font-size:13px; font-weight:600; }
  .setup-agent-tag { font-size:11.5px; color:var(--run); font-weight:500; margin-top:2px; }
  .setup-agent-desc { font-size:11.5px; color:var(--muted); line-height:1.45; margin-top:4px; }
  .setup-agent-check { font-size:11px; padding:2px 8px; border-radius:999px; border:1px solid var(--border); color:var(--muted); }
  .setup-agent-card.is-selected .setup-agent-check { background:var(--run); border-color:var(--run); color:var(--card); }
  .setup-team-banner { padding:14px 16px; border-radius:16px; border:1px solid var(--run); background:color-mix(in srgb,var(--run) 6%,var(--card)); margin-bottom:12px; }
  .setup-team-banner b { display:block; font-size:14px; margin-bottom:4px; }
  .setup-team-banner small { font-size:12px; color:var(--muted); line-height:1.5; display:block; }
  .setup-custom-box { display:grid; gap:10px; padding:16px; border-radius:16px; border:1px solid var(--border); background:var(--card2); }
  .setup-custom-row { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
  .setup-custom-queue { display:flex; flex-wrap:wrap; gap:6px; }
  .setup-custom-chip { display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:999px; border:1px solid var(--border); background:var(--card); font-size:12px; }
  .setup-summary-pill { margin-top:16px; padding:12px 14px; border-radius:14px; border:1px solid var(--border); background:var(--card2); font-size:12.5px; color:var(--text); }
  @media(max-width:720px) { .setup-wizard { padding:24px 16px; }.setup-frame { grid-template-columns:1fr; border-radius:24px; }.setup-aside { padding:22px 24px; border-right:0; border-bottom:1px solid color-mix(in srgb,var(--border) 60%,transparent); }.setup-aside p { display:none; }.setup-steps { display:flex; gap:16px; margin-top:22px; flex-wrap:wrap; }.setup-main { padding:28px 24px; }.setup-agent-modes,.setup-agent-grid,.setup-custom-row { grid-template-columns:1fr; } }
  @media(max-width:420px) { .setup-wizard { padding:16px 12px; }.setup-main { padding:24px 20px; }.setup-aside { padding:20px; }.setup-steps { gap:12px; }.setup-steps li { gap:6px; font-size:11px; }.setup-step-number { width:22px; height:22px; }.setup-main h1 { font-size:23px; }.setup-footer,.setup-footer > div { flex-wrap:wrap; }.setup-footer > div { margin-left:auto; } }
  @media(prefers-reduced-motion:reduce) { .opening-dots i { animation:none; } }
`;

export const ONBOARDING_HTML = String.raw`
<div id="startupCover" class="gitu-opening"><div class="opening-content"><img src="/brand/agent-gitu-mark.svg" alt="Agent Gitu icon"><h1>Agent Gitu</h1><p id="startupMessage" role="status" aria-live="polite">Opening your workspace…</p><div class="opening-dots" aria-hidden="true"><i></i><i></i><i></i></div><button id="startupReload" class="btn dark" hidden>Try again</button></div></div>
<div id="setupWizard" class="setup-wizard" role="dialog" aria-modal="true" aria-labelledby="setupTitle" hidden></div>
`;

export const ONBOARDING_JS = String.raw`
  var PIKPAM_READY_AGENTS = [
    {
      name: 'P.A',
      tagline: 'Chief of Staff & Pikpam Coordinator',
      description: 'Coordinates your Pikpam team, prioritizes daily tasks, delegates coding & deployments, and delivers verified outcomes.',
      avatar: { shape: 'dot-blue', color: '#5ba8ff' },
      chiefOfStaff: true,
      allowShell: true,
      allowWrites: true,
      allowConfig: true,
      useHostComputer: false,
      skills: ['browser-workflow', 'pikpam-ecosystem', 'productivity'],
      systemPrompt: 'You are P.A, Chief of Staff on Pikpam. Coordinate specialists, keep priorities clear, delegate coding or Pikpam Cloud deployment when helpful, verify returned results, and deliver concise outcomes.'
    },
    {
      name: 'Atlas',
      tagline: 'Pikpam Cloud & VPS Architect',
      description: 'Manages Pikpam Cloud projects, dedicated VPS infrastructure, Docker/Compose services, and runtime health checks.',
      avatar: { shape: 'dot-purple', color: '#8f80ff' },
      chiefOfStaff: false,
      allowShell: true,
      allowWrites: true,
      allowConfig: true,
      useHostComputer: true,
      skills: ['pikpam-ecosystem'],
      systemPrompt: 'You are Atlas, a Pikpam Cloud and VPS architect. Use pikpam-ecosystem tools to inspect customer projects, configure Docker/Compose services on authorized VPS infrastructure, and verify service health before reporting.'
    },
    {
      name: 'Nova',
      tagline: 'GitHub & Deployment Engineer',
      description: 'Clones GitHub repositories into Pikpam Cloud, configures managed app-env secrets, and ships verified builds.',
      avatar: { shape: 'dot-mint', color: '#3fd68f' },
      chiefOfStaff: false,
      allowShell: true,
      allowWrites: true,
      allowConfig: false,
      useHostComputer: true,
      skills: ['pikpam-ecosystem'],
      systemPrompt: 'You are Nova, Pikpam GitHub & Deployment specialist. Clone connected repositories, install dashboard-managed app-env variables safely, deploy apps, and verify live HTTPS endpoints.'
    },
    {
      name: 'Forge',
      tagline: 'Full-Stack Coding Engineer',
      description: 'Writes, refactors, and tests backend APIs and frontend interfaces directly inside your active project.',
      avatar: { shape: 'dot-orange', color: '#c9a86a' },
      chiefOfStaff: false,
      allowShell: true,
      allowWrites: true,
      allowConfig: false,
      useHostComputer: true,
      skills: ['frontend-design', 'pikpam-ecosystem'],
      systemPrompt: 'You are Forge, a senior full-stack engineer on Pikpam. Read existing files before editing, build clean UIs and APIs in the selected project workspace, and verify changes with builds and tests.'
    },
    {
      name: 'Vault',
      tagline: 'Database & Storage Engineer',
      description: 'Designs PostgreSQL schemas, manages Redis queues, runs safe migrations, and configures Pikpam storage volumes.',
      avatar: { shape: 'dot-blue', color: '#38bdf8' },
      chiefOfStaff: false,
      allowShell: true,
      allowWrites: true,
      allowConfig: false,
      useHostComputer: true,
      skills: ['pikpam-ecosystem'],
      systemPrompt: 'You are Vault, Pikpam database & storage engineer. Configure scoped PIKPAM_POSTGRES_URL, PIKPAM_REDIS_URL, and storage volumes securely without exposing database ports or credentials.'
    },
    {
      name: 'Aegis',
      tagline: 'Domains, SSL & Security Lead',
      description: 'Configures custom domains and DNS, verifies HTTPS TLS certificates, and audits secrets and permissions.',
      avatar: { shape: 'dot-purple', color: '#f43f5e' },
      chiefOfStaff: false,
      allowShell: true,
      allowWrites: false,
      allowConfig: false,
      useHostComputer: true,
      skills: ['pikpam-ecosystem'],
      systemPrompt: 'You are Aegis, Pikpam domains, SSL & security specialist. Verify DNS records, TLS certificates, credential hygiene, and least-privilege access without exposing secrets.'
    },
    {
      name: 'Pulse',
      tagline: 'Pikpam Commerce & Growth Strategist',
      description: 'Optimizes pikpam.com storefront catalogs, product listings, pricing strategy, and merchant conversion funnels.',
      avatar: { shape: 'dot-orange', color: '#f59e0b' },
      chiefOfStaff: false,
      allowShell: false,
      allowWrites: true,
      allowConfig: false,
      useHostComputer: true,
      skills: ['browser-workflow', 'productivity'],
      systemPrompt: 'You are Pulse, Pikpam Commerce & Growth strategist. Help merchants and founders launch, organize, and grow storefronts, product listings, and conversion funnels on pikpam.com with clear actionable plans.'
    },
    {
      name: 'Clara',
      tagline: 'Customer Success & Inbox Lead',
      description: 'Triages inbox threads, drafts empathetic customer & order follow-ups, and keeps approvals organized.',
      avatar: { shape: 'dot-mint', color: '#10b981' },
      chiefOfStaff: false,
      allowShell: false,
      allowWrites: true,
      allowConfig: false,
      useHostComputer: true,
      skills: ['browser-workflow', 'productivity'],
      systemPrompt: 'You are Clara, Customer Success Lead. Triage incoming support requests and inbox threads, surface urgent blockers, and draft clear, accurate replies for user approval.'
    },
    {
      name: 'Scout',
      tagline: 'Research & Market Intelligence',
      description: 'Runs live web research, benchmarks competitors and APIs, and returns concise cited briefings.',
      avatar: { shape: 'dot-blue', color: '#6366f1' },
      chiefOfStaff: false,
      allowShell: false,
      allowWrites: false,
      allowConfig: false,
      useHostComputer: true,
      skills: ['browser-workflow'],
      systemPrompt: 'You are Scout, a rigorous research analyst. Gather verified facts from files and the web, compare options objectively, and cite sources clearly.'
    },
    {
      name: 'Lyra',
      tagline: 'Product Docs, Content & Deck Writer',
      description: 'Creates crisp launch copy, technical READMEs, campaign docs, and formatted PDF, PPTX, Word, or XLSX exports.',
      avatar: { shape: 'dot-purple', color: '#ec4899' },
      chiefOfStaff: false,
      allowShell: false,
      allowWrites: true,
      allowConfig: false,
      useHostComputer: true,
      skills: ['productivity', 'frontend-design'],
      systemPrompt: 'You are Lyra, Product Content & Docs writer on Pikpam. Turn rough ideas into tight copy, technical READMEs, release notes, and polished PDF/PPTX/Word/XLSX deliverables.'
    }
  ];
  var setupState = null;
  function setupMessage(text, error) {
    var el = $('setupMessage');
    if (el) { el.textContent = text; el.className = 'setup-message' + (error ? ' error' : ''); el.setAttribute('role', error ? 'alert' : 'status'); }
  }
  function setupAllProviders() {
    var list = S.models || [];
    var pikOnly = list.filter(function (p) { return p && p.id === 'pikrouter'; });
    return pikOnly.length ? pikOnly : list;
  }
  function setupProvider() { return setupAllProviders().find(function (p) { return p.id === setupState.provider; }); }
  function setupModelValue(p) {
    if (!p) return '';
    var selected = setupState.model || S.sel.model || '';
    if (selected.indexOf(p.id + '::') === 0 && (p.models || []).some(function (m) { return p.id + '::' + m.id === selected; })) return selected;
    var model = (p.models || []).find(function (m) { return m.id === p.defaultModel; }) || (p.models || [])[0];
    return model ? p.id + '::' + model.id : '';
  }
  function syncSetupCustomDraft() {
    if (!setupState || !setupState.customDraft) return;
    if ($('setupCustomName')) setupState.customDraft.name = $('setupCustomName').value;
    if ($('setupCustomTagline')) setupState.customDraft.tagline = $('setupCustomTagline').value;
    if ($('setupCustomShape')) setupState.customDraft.shape = $('setupCustomShape').value;
    if ($('setupCustomPrompt')) setupState.customDraft.systemPrompt = $('setupCustomPrompt').value;
  }
  function setupAgentSummaryText() {
    if (!setupState) return '';
    if (setupState.agentChoiceMode === 'team') return 'Full Pikpam Team: all ' + PIKPAM_READY_AGENTS.length + ' ready-made agents + shared team chat will be created.';
    if (setupState.agentChoiceMode === 'custom') {
      var queued = (setupState.customAgents || []).length + (setupState.customDraft && setupState.customDraft.name && setupState.customDraft.name.trim() ? 1 : 0);
      return 'Custom Agent mode: ' + Math.max(1, queued) + ' custom teammate' + (queued === 1 ? '' : 's') + ' ready to create.';
    }
    var count = (setupState.selectedAgentIndexes || []).length;
    return 'Ready-made Pikpam Agents: ' + count + ' of ' + PIKPAM_READY_AGENTS.length + ' selected.';
  }
  function setupAgentsHtml() {
    var mode = setupState.agentChoiceMode || 'pick';
    var selected = setupState.selectedAgentIndexes || [];
    var modesHtml =
      '<div class="setup-agent-modes" role="tablist" aria-label="Agent onboarding options">' +
        '<button type="button" class="setup-agent-mode" id="setupModePick" data-agent-mode="pick" aria-pressed="' + (mode === 'pick') + '"><b>Choose Agents (10)</b><span>Pick from 10 ready-made pikpam.com agents</span></button>' +
        '<button type="button" class="setup-agent-mode" id="setupModeTeam" data-agent-mode="team" aria-pressed="' + (mode === 'team') + '"><b>Choose Full Team</b><span>Create all 10 Pikpam agents + team chat</span></button>' +
        '<button type="button" class="setup-agent-mode" id="setupModeCustom" data-agent-mode="custom" aria-pressed="' + (mode === 'custom') + '"><b>Create Custom Agent</b><span>Define your own custom specialist</span></button>' +
      '</div>';
    if (mode === 'custom') {
      var draft = setupState.customDraft || { name: '', tagline: '', shape: 'dot-blue', systemPrompt: '' };
      var queueHtml = (setupState.customAgents || []).length
        ? '<div class="setup-custom-queue" id="setupCustomQueue">' + setupState.customAgents.map(function (a, idx) {
            return '<span class="setup-custom-chip"><span>' + esc(a.name) + (a.tagline ? ' · ' + esc(a.tagline) : '') + '</span><button type="button" class="btn ghost" style="min-height:20px;padding:0 6px" data-remove-custom="' + idx + '" aria-label="Remove ' + esc(a.name) + '">&times;</button></span>';
          }).join('') + '</div>'
        : '';
      return modesHtml +
        '<div class="setup-custom-box">' +
          '<div class="setup-custom-row">' +
            '<div><label class="setup-field" style="margin-top:0" for="setupCustomName">Agent name</label><input id="setupCustomName" type="text" value="' + esc(draft.name || '') + '" placeholder="e.g. Kira, Orion, Maya…"></div>' +
            '<div><label class="setup-field" style="margin-top:0" for="setupCustomTagline">Role / specialty</label><input id="setupCustomTagline" type="text" value="' + esc(draft.tagline || '') + '" placeholder="e.g. Pikpam Store Manager"></div>' +
          '</div>' +
          '<div><label class="setup-field" style="margin-top:0" for="setupCustomShape">Character style</label><select id="setupCustomShape">' +
            '<option value="dot-blue"' + (draft.shape === 'dot-blue' ? ' selected' : '') + '>Sapphire Blue</option>' +
            '<option value="dot-purple"' + (draft.shape === 'dot-purple' ? ' selected' : '') + '>Violet Nebula</option>' +
            '<option value="dot-mint"' + (draft.shape === 'dot-mint' ? ' selected' : '') + '>Emerald Mint</option>' +
            '<option value="dot-orange"' + (draft.shape === 'dot-orange' ? ' selected' : '') + '>Amber Gold</option>' +
          '</select></div>' +
          '<div><label class="setup-field" style="margin-top:0" for="setupCustomPrompt">Instructions (system prompt)</label><textarea id="setupCustomPrompt" rows="3" placeholder="Describe what this agent focuses on and how it should work on Pikpam…">' + esc(draft.systemPrompt || '') + '</textarea></div>' +
          queueHtml +
          '<div class="setup-provider-actions" style="margin-top:2px"><button type="button" class="btn ghost" id="setupCustomAdd">+ Save &amp; add another custom agent</button></div>' +
        '</div>';
    }
    var teamBanner = mode === 'team'
      ? '<div class="setup-team-banner"><b>Complete 10-Agent Pikpam Team</b><small>All 10 Pikpam specialists below will be created together with a shared <strong>Pikpam Team</strong> room coordinated by P.A.</small></div>'
      : '<div class="setup-agents-toolbar"><span>' + selected.length + ' of ' + PIKPAM_READY_AGENTS.length + ' Pikpam agents selected</span><div><button type="button" class="btn ghost" id="setupSelectAllAgents" style="min-height:28px;padding:4px 10px">Select all 10</button><button type="button" class="btn ghost" id="setupStarterAgents" style="min-height:28px;padding:4px 10px">Starter 3</button></div></div>';
    var gridHtml = '<div class="setup-agent-grid" id="setupAgentGrid">' + PIKPAM_READY_AGENTS.map(function (agent, idx) {
      var isPicked = mode === 'team' || selected.indexOf(idx) >= 0;
      return '<button type="button" class="setup-agent-card' + (isPicked ? ' is-selected' : '') + '" id="setupAgent' + idx + '" data-setup-agent-idx="' + idx + '" aria-pressed="' + isPicked + '">' +
        '<span class="setup-agent-dot" style="background:' + esc(agent.avatar.color) + '" aria-hidden="true"></span>' +
        '<span class="setup-agent-card-body">' +
          '<span class="setup-agent-card-head"><span>' + esc(agent.name) + '</span><span class="setup-agent-check">' + (isPicked ? 'Selected' : 'Add') + '</span></span>' +
          '<div class="setup-agent-tag">' + esc(agent.tagline) + '</div>' +
          '<div class="setup-agent-desc">' + esc(agent.description) + '</div>' +
        '</span>' +
      '</button>';
    }).join('') + '</div>';
    return modesHtml + teamBanner + gridHtml;
  }
  function setupConnectionHtml() {
    var providers = setupAllProviders();
    if (!providers.length) return '<p class="setup-note">Load your PikRouter connection to continue, or set this up later.</p><button class="btn ghost" id="setupRefresh">Load PikRouter</button>';
    var p = setupProvider() || providers.find(function (item) { return item.id === 'pikrouter'; }) || providers.find(providerIsUsable) || providers[0];
    setupState.provider = p.id;
    setupState.model = setupModelValue(p);
    var ready = providerIsUsable(p);
    var pikAuth = p.id === 'pikrouter';
    return '<label class="setup-field" for="setupProvider">Active provider (PikRouter only)</label><select id="setupProvider">' + providers.map(function (item) {
      return '<option value="' + esc(item.id) + '"' + (p.id === item.id ? ' selected' : '') + '>' + esc(item.label || item.id) + (item.id === 'pikrouter' ? ' · Active' : '') + (providerIsUsable(item) ? ' · Connected' : '') + '</option>';
    }).join('') + '</select>' +
      (ready ? '<p class="setup-note">' + (pikAuth ? 'Pikpam PikRouter is connected and ready to route all AI requests.' : 'A key is already available for this provider.') + '</p>' : '') +
      (pikAuth ? '<div class="setup-provider-actions" style="margin-bottom:10px"><button class="btn dark" id="setupPikOAuth">' + (ready ? 'Switch or Reconnect with Pikpam' : 'Continue with Pikpam (Hosted Authorize &amp; Register)') + '</button><button class="btn ghost" id="setupRefresh">Refresh models</button></div>' :
        (p.keyEnvVars || []).length ? '<label class="setup-field" for="setupKey">' + (ready ? 'Replace API key (optional)' : 'API key') + '</label><div class="setup-key-row"><input id="setupKey" type="password" autocomplete="off" spellcheck="false" placeholder="Paste your API key"><button class="btn ghost" id="setupShowKey" aria-label="Show API key">Show</button></div><p class="setup-note">Saved in Agent Gitu’s local key store.</p><div class="setup-provider-actions"><button class="btn dark" id="setupSaveKey">Save key</button><button class="btn ghost" id="setupRefresh">Refresh models</button></div>' : '<p class="setup-note">This provider does not need an API key here.</p><button class="btn ghost" id="setupRefresh">Refresh connection</button>') +
      '<label class="setup-field" for="setupModel">Default model</label><select id="setupModel"' + (ready ? '' : ' disabled') + '>' + (p.models || []).map(function (m) {
        var value = p.id + '::' + m.id;
        return '<option value="' + esc(value) + '"' + (setupState.model === value ? ' selected' : '') + '>' + esc(m.id) + '</option>';
      }).join('') + '</select>';
  }
  function renderSetup() {
    var root = $('setupWizard');
    var step = setupState.step;
    var titles = ['Choose your Pikpam agents', 'Connect PikRouter AI', 'Make yourself at home'];
    var descriptions = [
      'Pick from 10 ready-made pikpam.com agents, launch the full 10-agent team, or create your own custom agent.',
      'PikRouter (pikpam.com) is the sole AI provider for your workspace and agents.',
      'Choose your workspace theme. Your selected agents will open right inside Cowork.'
    ];
    var content = step === 0 ? setupAgentsHtml() : step === 1 ? setupConnectionHtml() :
      themeOptionsHtml().replace(/name="appearance"/g, 'name="setupAppearance"') +
      '<div class="setup-summary-pill">' + esc(setupAgentSummaryText()) + '</div>' +
      '<div class="setup-modes" role="radiogroup" aria-label="Starting workspace" hidden>' + [{ id: 'cowork', title: 'Cowork (Recommended)', description: 'Collaborate with your Pikpam agents while coding runs behind the scenes.' }, { id: 'coding', title: 'Coding', description: 'Open directly into local coding mode.' }].map(function (mode) {
        return '<label class="setup-mode"><input type="radio" name="setupMode" value="' + mode.id + '"' + (setupState.mode === mode.id ? ' checked' : '') + '><span><b>' + mode.title + '</b><small>' + mode.description + '</small></span></label>';
      }).join('') + '</div>';
    root.innerHTML = '<div class="setup-frame"><aside class="setup-aside"><div class="setup-brand"><img src="/brand/agent-gitu-mark.svg" alt=""><span>Agent Gitu</span></div><p>Your Pikpam team.<br>Powered by PikRouter.</p><ol class="setup-steps">' + ['Agents', 'PikRouter', 'Finish'].map(function (name, i) {
      return '<li' + (i === step ? ' aria-current="step"' : '') + '><span class="setup-step-number">' + (i + 1) + '</span>' + name + '</li>';
    }).join('') + '</ol></aside><section class="setup-main"><h1 id="setupTitle" tabindex="-1">' + titles[step] + '</h1><p class="setup-description">' + descriptions[step] + '</p>' + content +
      '<div id="setupMessage" class="setup-message" role="status" aria-live="polite"></div><footer class="setup-footer"><button class="btn ghost" id="setupBack"' + (step === 0 ? ' hidden' : '') + '>Back</button><div>' + (step === 1 ? '<button class="btn ghost" id="setupSkip">Set up later</button>' : '') + '<button class="btn dark" id="setupNext">' + (step === 2 ? 'Open ' + (setupState.mode === 'cowork' ? 'Cowork' : 'Coding') : 'Continue') + '</button></div></footer></section></div>';
    $('setupBack').onclick = function () { if (step === 0) return; setupState.step--; renderSetup(); };
    $('setupNext').onclick = function () {
      if (step === 0) {
        syncSetupCustomDraft();
        if (setupState.agentChoiceMode === 'pick' && !(setupState.selectedAgentIndexes || []).length) {
          setupMessage('Select at least one ready-made Pikpam agent, choose the full team, or create a custom agent.', true);
          return;
        }
        if (setupState.agentChoiceMode === 'custom') {
          var hasDraftName = Boolean(setupState.customDraft && setupState.customDraft.name && setupState.customDraft.name.trim());
          if (!hasDraftName && !(setupState.customAgents || []).length) {
            setupMessage('Enter a name for your custom agent before continuing.', true);
            return;
          }
        }
      }
      if (step === 1) {
        var p = setupProvider();
        if ($('setupKey') && $('setupKey').value.trim()) { setupMessage('Save your API key before continuing.', true); return; }
        if (!providerIsUsable(p) || !setupState.model) { setupMessage('Connect a provider and choose a model, or select Set up later.', true); return; }
        S.sel.model = setupState.model;
        rememberModelSelection(setupState.model);
        persist();
      }
      if (step === 2) { finishSetup(); return; }
      setupState.step++;
      renderSetup();
      if (setupState.step === 1 && !S.modelsLoaded) refreshSetupProviders();
    };
    root.querySelectorAll('[data-agent-mode]').forEach(function (btn) {
      btn.onclick = function () {
        syncSetupCustomDraft();
        setupState.agentChoiceMode = btn.getAttribute('data-agent-mode') || 'pick';
        if (setupState.agentChoiceMode === 'team') setupState.selectedAgentIndexes = PIKPAM_READY_AGENTS.map(function (_, i) { return i; });
        renderSetup();
      };
    });
    root.querySelectorAll('[data-setup-agent-idx]').forEach(function (card) {
      card.onclick = function () {
        var idx = Number(card.getAttribute('data-setup-agent-idx'));
        if (setupState.agentChoiceMode === 'team') setupState.agentChoiceMode = 'pick';
        var arr = setupState.selectedAgentIndexes || [];
        var pos = arr.indexOf(idx);
        if (pos >= 0) arr.splice(pos, 1); else arr.push(idx);
        arr.sort(function (a, b) { return a - b; });
        setupState.selectedAgentIndexes = arr;
        renderSetup();
      };
    });
    if ($('setupSelectAllAgents')) $('setupSelectAllAgents').onclick = function () {
      setupState.agentChoiceMode = 'pick';
      setupState.selectedAgentIndexes = PIKPAM_READY_AGENTS.map(function (_, i) { return i; });
      renderSetup();
    };
    if ($('setupStarterAgents')) $('setupStarterAgents').onclick = function () {
      setupState.agentChoiceMode = 'pick';
      setupState.selectedAgentIndexes = [0, 1, 3];
      renderSetup();
    };
    if ($('setupCustomAdd')) $('setupCustomAdd').onclick = function () {
      syncSetupCustomDraft();
      var draft = setupState.customDraft || {};
      if (!String(draft.name || '').trim()) { setupMessage('Enter a name for your custom agent first.', true); return; }
      var shapeColor = { 'dot-blue': '#5ba8ff', 'dot-purple': '#8f80ff', 'dot-mint': '#3fd68f', 'dot-orange': '#c9a86a' }[draft.shape || 'dot-blue'] || '#5ba8ff';
      setupState.customAgents.push({
        name: String(draft.name).trim(),
        tagline: String(draft.tagline || '').trim() || 'Custom specialist',
        systemPrompt: String(draft.systemPrompt || '').trim() || ('You are ' + String(draft.name).trim() + ', a helpful Pikpam specialist.'),
        avatar: { shape: draft.shape || 'dot-blue', color: shapeColor },
        skills: ['browser-workflow', 'pikpam-ecosystem'],
        allowShell: true,
        allowWrites: true,
        allowConfig: false,
        useHostComputer: true,
        chiefOfStaff: false
      });
      setupState.customDraft = { name: '', tagline: '', shape: draft.shape || 'dot-blue', systemPrompt: '' };
      setupMessage('Added ' + setupState.customAgents[setupState.customAgents.length - 1].name + ' to your setup queue.');
      renderSetup();
    };
    root.querySelectorAll('[data-remove-custom]').forEach(function (btn) {
      btn.onclick = function () {
        setupState.customAgents.splice(Number(btn.getAttribute('data-remove-custom')), 1);
        renderSetup();
      };
    });
    if ($('setupSkip')) $('setupSkip').onclick = function () { setupState.step = 2; renderSetup(); };
    if ($('setupProvider')) $('setupProvider').onchange = function () { setupState.provider = this.value; setupState.model = ''; renderSetup(); };
    if ($('setupModel')) $('setupModel').onchange = function () { setupState.model = this.value; };
    if ($('setupShowKey')) $('setupShowKey').onclick = function () {
      var input = $('setupKey'); var show = input.type === 'password'; input.type = show ? 'text' : 'password';
      this.textContent = show ? 'Hide' : 'Show'; this.setAttribute('aria-label', show ? 'Hide API key' : 'Show API key');
    };
    if ($('setupSaveKey')) $('setupSaveKey').onclick = saveSetupKey;
    if ($('setupPikOAuth')) $('setupPikOAuth').onclick = function () { startPikRouterOAuth('/callback'); };
    if ($('setupRefresh')) $('setupRefresh').onclick = refreshSetupProviders;
    root.querySelectorAll('[name=setupMode]').forEach(function (input) { input.onchange = function () { setupState.mode = input.value; $('setupNext').textContent = 'Open ' + (input.value === 'cowork' ? 'Cowork' : 'Coding'); }; });
    $('setupTitle').focus();
  }
  async function createOnboardingAgents() {
    if (!setupState) return;
    syncSetupCustomDraft();
    var specs = [];
    var createTeamChat = false;
    if (setupState.agentChoiceMode === 'team') {
      specs = PIKPAM_READY_AGENTS.slice();
      createTeamChat = true;
    } else if (setupState.agentChoiceMode === 'custom') {
      specs = (setupState.customAgents || []).slice();
      if (setupState.customDraft && setupState.customDraft.name && setupState.customDraft.name.trim()) {
        var d = setupState.customDraft;
        var shapeColor = { 'dot-blue': '#5ba8ff', 'dot-purple': '#8f80ff', 'dot-mint': '#3fd68f', 'dot-orange': '#c9a86a' }[d.shape || 'dot-blue'] || '#5ba8ff';
        specs.push({
          name: String(d.name).trim(),
          tagline: String(d.tagline || '').trim() || 'Custom specialist',
          systemPrompt: String(d.systemPrompt || '').trim() || ('You are ' + String(d.name).trim() + ', a helpful Pikpam specialist.'),
          avatar: { shape: d.shape || 'dot-blue', color: shapeColor },
          skills: ['browser-workflow', 'pikpam-ecosystem'],
          allowShell: true,
          allowWrites: true,
          allowConfig: false,
          useHostComputer: true,
          chiefOfStaff: false
        });
      }
    } else {
      specs = (setupState.selectedAgentIndexes || []).map(function (i) { return PIKPAM_READY_AGENTS[i]; }).filter(Boolean);
      if (specs.length === PIKPAM_READY_AGENTS.length) createTeamChat = true;
    }
    if (!specs.length) return;
    var existingAgents = [];
    try {
      var rosterRes = await api('/api/cowork/agents');
      if (rosterRes && Array.isArray(rosterRes.agents)) existingAgents = rosterRes.agents;
    } catch {}
    var selParts = String(S.sel.model || '').split('::');
    var activeProv = selParts[0] || (setupState.provider || 'pikrouter');
    var activeModel = selParts.slice(1).join('::');
    var byName = Object.create(null);
    existingAgents.forEach(function (a) { if (a && a.name) byName[String(a.name).toLowerCase()] = a; });
    var memberIds = [];
    var chiefId = '';
    for (var i = 0; i < specs.length; i++) {
      var spec = specs[i];
      var key = String(spec.name || '').toLowerCase();
      if (byName[key] && byName[key].id) {
        memberIds.push(byName[key].id);
        if (spec.chiefOfStaff && !chiefId) chiefId = byName[key].id;
        continue;
      }
      try {
        var created = await api('/api/cowork/agents', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: spec.name,
            tagline: spec.tagline || '',
            description: spec.description || '',
            systemPrompt: spec.systemPrompt || '',
            avatar: spec.avatar || { shape: 'dot-blue', color: '#5ba8ff' },
            provider: activeProv || 'pikrouter',
            model: activeModel || '',
            skills: Array.isArray(spec.skills) ? spec.skills : [],
            allowShell: Boolean(spec.allowShell),
            allowWrites: spec.allowWrites !== false,
            allowConfig: Boolean(spec.allowConfig),
            useHostComputer: Boolean(spec.useHostComputer),
            chiefOfStaff: Boolean(spec.chiefOfStaff)
          })
        });
        if (created && created.agent && created.agent.id) {
          memberIds.push(created.agent.id);
          if (spec.chiefOfStaff && !chiefId) chiefId = created.agent.id;
        }
      } catch {}
    }
    if (createTeamChat && memberIds.length >= 2) {
      try {
        await api('/api/cowork/conversations', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ kind: 'group', title: 'Pikpam Team', memberIds: memberIds, chiefId: chiefId || memberIds[0] })
        });
      } catch {}
    }
  }
  async function setupOperation(action) {
    if (setupState.busy) return;
    setupState.busy = true;
    var controls = Array.from($('setupWizard').querySelectorAll('button, input, select, textarea')).map(function (el) { return { el: el, disabled: el.disabled }; });
    controls.forEach(function (item) { item.el.disabled = true; });
    try { await action(); }
    catch (e) { setupMessage('Could not complete this step. Please try again.', true); }
    finally { setupState.busy = false; controls.forEach(function (item) { if (item.el.isConnected) item.el.disabled = item.disabled; }); }
  }
  async function refreshSetupProviders() {
    return setupOperation(async function () {
      setupMessage('Loading PikRouter…');
      await loadModelCatalog(true);
      renderSetup();
      setupMessage(providerIsUsable(setupProvider()) ? 'PikRouter connected. Choose your model to continue.' : 'Connect PikRouter to continue, or select Set up later.');
    });
  }
  async function saveSetupKey() {
    var p = setupProvider();
    var input = $('setupKey');
    var key = input && input.value.trim();
    if (!key || !p || !(p.keyEnvVars || []).length) { setupMessage('Paste an API key first.', true); return; }
    return setupOperation(async function () {
      setupMessage('Saving key…');
      await api('/api/keys', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ envVar: p.keyEnvVars[0], key: key }) });
      input.value = '';
      key = '';
      try { await loadModelCatalog(true); renderSetup(); setupMessage('Key saved. Choose a model to continue.'); }
      catch (e) { setupMessage('Key saved. Refresh models to finish connecting.', true); }
    });
  }
  function openSetupWizard() {
    setupState = {
      step: 0,
      provider: (S.sel.model || '').split('::')[0] || 'pikrouter',
      model: S.sel.model || '',
      mode: S.settings.startMode || 'cowork',
      busy: false,
      agentChoiceMode: 'pick',
      selectedAgentIndexes: [0, 1, 3],
      customDraft: { name: '', tagline: '', shape: 'dot-blue', systemPrompt: '' },
      customAgents: []
    };
    document.querySelector('.shell').inert = true;
    $('startupCover').className = 'gitu-opening';
    var cw = $('cw'); if (cw) cw.inert = true;
    $('setupWizard').hidden = false;
    $('setupWizard').onkeydown = function (event) {
      if (event.key !== 'Tab') return;
      var controls = Array.from(this.querySelectorAll('button:not([disabled]):not([hidden]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])'));
      var first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === $('setupTitle'))) { event.preventDefault(); if (last) last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); if (first) first.focus(); }
    };
    renderSetup();
    // The page underneath may still be loading the catalog. Do not replace a
    // key field while the user is typing; the connection step refreshes itself.
  }
  async function finishSetup() {
    return setupOperation(async function () {
      setupMessage('Creating your Pikpam workspace…');
      await api('/api/onboarding', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme: S.settings.theme, mode: setupState.mode, model: S.sel.model || '', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) });
      try { await createOnboardingAgents(); } catch {}
      S.settings.onboardingComplete = true;
      S.settings.startMode = setupState.mode;
      persist();
      $('setupWizard').hidden = true;
      $('setupWizard').innerHTML = '';
      document.querySelector('.shell').inert = false;
      var cw = $('cw'); if (cw) cw.inert = false;
      if (setupState.mode === 'cowork') {
        openCowork();
        if (typeof cwLoad === 'function') cwLoad(true);
      } else cwExit();
    });
  }
  var onboardingLoading = false;
  async function initializeOnboarding() {
    if (onboardingLoading) return;
    onboardingLoading = true;
    document.querySelector('.shell').inert = true;
    $('startupCover').className = 'gitu-opening';
    $('startupMessage').textContent = 'Opening your workspace…';
    $('startupReload').hidden = true;
    var startupStage = 'setup';
    try {
      var prefs = await api('/api/onboarding', { signal: AbortSignal.timeout(15000) });
      startupStage = 'workspace';
      if (!prefs.completed) openSetupWizard();
      else {
        if (!S.settings.onboardingComplete) {
          S.settings.theme = prefs.theme;
          S.settings.startMode = prefs.mode;
          if (prefs.model&&!S.savedSelectionAt) S.sel.model = prefs.model;
          S.settings.onboardingComplete = true;
          applyTheme(); persist();
        }
        var lastMode = null;
        try { lastMode = localStorage.getItem('hermes.cowork'); } catch (e) {}
        if (prefs.mode === 'coding' && lastMode === 'closed') openHome();
        else openCowork();
        document.querySelector('.shell').inert = false;
      }
      $('startupCover').hidden = true;
    } catch (e) {
      console.error('Agent Gitu startup failed (' + startupStage + '): ' + String(e && e.name || 'Error') + ': ' + String(e && e.message || e));
      $('startupCover').className = 'gitu-opening.is-error'.replace('.', ' ');
      $('startupMessage').textContent = startupStage === 'workspace' ? 'Could not open your workspace. Please try again.' : 'Could not load your setup. Please try again.';
      $('startupReload').hidden = false;
      $('startupReload').onclick = initializeOnboarding;
      $('startupReload').focus();
    } finally { onboardingLoading = false; }
  }
`;
