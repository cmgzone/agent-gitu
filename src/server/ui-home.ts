import { PROJECT_PREFERENCES_JS } from './ui-project-preferences.js';
import { plushCharacterHtml } from './ui-characters.js';
// Compact home navigation with the same locally bundled Cowork companion.
export const HOME_CSS = String.raw`
  body:has(.home-sky) .sb,body:has(.home-sky) .topbar,body:has(.home-sky) .vresize,body:has(.home-sky) .side-fab,body:has(.home-sky) #mascotWrap,body:has(.home-sky) .mobile-nav-btn { display:none!important; }
  .home.home-sky { --home-sidebar-surface:var(--bg); background:var(--bg); color:var(--text); padding:96px 36px 96px 284px; gap:28px; width:100%; justify-content:safe center; }
  .home.home-sky > .home-main { margin:0; }
  .run.run-chat.code-workspace { --home-sidebar-surface:var(--bg); padding-left:248px; background:var(--bg); }
  :root[data-theme=light] .run.run-chat.code-workspace { --home-sidebar-surface:#edf5fc; background:radial-gradient(ellipse at 64% 4%,#dcecf9 0%,transparent 65%),#f5f8fc; }
  .run.code-workspace .cw-page-nav { inset:18px auto auto calc(50% + 124px); transform:translateX(-50%); display:block; }
  .run.code-workspace #mainChatHistory { display:none; }
  .run.code-workspace .home-sidebar { background:transparent; }
  .home-main { position:relative; width:min(760px,100%); display:flex; flex-direction:column; gap:28px; flex:none; }
  .home-sky .home-main > .home-brand { position:absolute; bottom:calc(100% + 28px); }
  :root[data-theme=light] .home.home-sky { --home-sidebar-surface:#edf5fc; background:radial-gradient(ellipse at 64% 4%,#dcecf9 0%,transparent 65%),#f5f8fc; }
  .home-sky .cw-page-nav { top:22px; left:calc(50% + 124px); }
  .home-sky .cw-top-nav { position:static; transform:none; background:color-mix(in srgb,var(--card) 85%,transparent); border:1px solid var(--border); box-shadow:none; padding:4px; }
  .home-sky .cw-top-nav button { color:var(--text); min-height:36px; padding:0 18px; }
  .home-sky .home-brand { width:min(760px,100%); margin:0; padding:0; text-align:left; }
  .home-sky .home-brand-lockup { flex-direction:row; justify-content:flex-start; gap:14px; }
  .home-sky .home-character,.home-sky .cw-plush.home-character { width:48px; height:48px; animation:none; flex:none; }
  .home-sky .home-brand h1 { font-size:32px; line-height:1.2; letter-spacing:-.04em; justify-content:flex-start; text-align:left; color:var(--text); }
  .home-sky .home-brand-copy { color:var(--muted); margin:5px 0 0; font-size:13px; }
  .home-sidebar { position:fixed; inset:0 auto 0 0; z-index:12; width:248px; display:flex; flex-direction:column; padding:28px 16px 20px; border-right:1px solid var(--border); background:transparent; }
  :root[data-theme=light] .home-sidebar { --selected:#dbeaf7; --hover:#e4eff9; }
  .home-sidebar-brand { display:flex; align-items:center; gap:9px; padding:0 10px; margin-bottom:32px; font-size:15px; font-weight:650; letter-spacing:-.02em; }
  .home-sidebar-brand img { width:25px; height:25px; }
  .home-sidebar #homeCollapse { width:28px; min-height:28px; padding:4px; margin-left:auto; justify-content:center; flex:none; }
  .home-sidebar button { display:flex; align-items:center; gap:10px; width:100%; min-height:42px; padding:10px 12px; color:var(--muted); text-align:left; border-radius:9px; font-size:13px; }
  .home-sidebar button svg { width:17px; height:17px; flex:none; }
  .home-sidebar button:hover { color:var(--text); }
  .home-sidebar #cwPageSearch { background:var(--selected)!important; color:var(--text); margin-bottom:22px; font-size:12px; }
  .home-sidebar nav { display:grid; gap:4px; }
  .home-sidebar-foot { margin-top:auto; display:grid; gap:4px; padding-top:24px; }
  .home-menu-trigger,.home-nav-backdrop { display:none; }
  .home-composer-wrap { width:min(760px,100%); margin:0; }
  .home-sky .composer-topline { padding:0 4px 10px; }
  .home-project-label { font-size:12px; color:var(--muted); }
  .home-attachment-policy { margin:0 10px 6px; color:var(--muted); font-size:11px; line-height:1.5; }
  .home-sky .composer-workspace { color:var(--text); max-width:100%; gap:8px; font-size:12px; }
  .home-sky .composer-workspace::after { content:'⌄'; color:var(--muted); margin-left:3px; }
  .home-sky .composer { width:100%; padding:10px; border:1px solid var(--border2); border-radius:18px; background:var(--card); box-shadow:0 3px 12px #254d7610; }
  .home-sky .composer:focus-within { border-color:var(--accent); box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 10%,transparent); }
  .home-sky .composer textarea { min-height:72px; padding:8px 10px; font-size:15px; }
  .home-sky .composer-bar { padding:4px; gap:8px; align-items:center; }
  #view .home-sky .composer .send { background:var(--brand-blue)!important; color:#fff; width:34px; height:34px; border-radius:10px; flex:none; }
  #view .home-sky .composer .send:not(:disabled):hover { background:color-mix(in srgb,var(--brand-blue) 90%,#000)!important; }
  .home-sky .home-plus-menu { box-shadow:var(--shadow-float); }
  .home-sidebar-scroll { flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; margin-top:20px; }
  .home-projects { width:100%; }
  .home-project-heading { display:flex; align-items:center; justify-content:space-between; gap:6px; padding:0 4px; margin-bottom:6px; }
  .home-project-heading h2 { margin:0; min-width:0; }
  .home-sidebar .home-project-heading #homeProjectsNav { min-height:32px; padding:4px 8px; font-size:12px; font-weight:600; }
  .home-sidebar .home-project-heading #homeNewProject { width:30px; min-height:30px; padding:6px; justify-content:center; }
  .home-project-list { display:grid; gap:3px; }
  .home-project { display:flex; align-items:center; min-width:0; border-radius:9px; }
  .home-project.is-current { background:var(--selected); }
  .home-sidebar .home-project-open { gap:9px; padding:10px 8px; flex:1; min-width:0; color:var(--text); }
  .home-project-icon { display:grid; place-items:center; flex:none; color:var(--muted); }
  .home-project.is-current .home-project-icon { color:var(--accent); }
  .home-sidebar .home-project-expand,.home-sidebar .home-project-options { width:24px; min-height:32px; padding:5px 3px; flex:none; justify-content:center; }
  .home-project-group { min-width:0; }
  .home-sidebar .home-project-open { padding-left:2px; padding-right:2px; }
  .home-project-pin { display:flex; color:var(--muted); }
  .home-project-pin svg { width:11px!important; height:11px!important; }
  .home-project-badges { display:flex; flex-wrap:wrap; gap:3px; }
  .home-project-badges:empty { display:none; }
  .home-project-status { padding:2px 5px; border-radius:5px; font-size:9px; line-height:1.35; background:var(--hover); }
  .home-project-status.attention { color:var(--text); background:color-mix(in srgb,#d99416 20%,transparent); }
  .home-project-status.failed { color:var(--text); background:color-mix(in srgb,#e25353 18%,transparent); }
  .home-project-status.running { color:var(--accent); background:color-mix(in srgb,var(--accent) 12%,transparent); }
  .home-project-chats { padding:3px 0 8px 17px; }
  .home-project-chats[hidden] { display:none; }
  .home-sidebar .home-project-chat { min-height:32px; padding:6px 8px; gap:7px; font-size:11px; }
  .home-project-chat > span:not(.home-chat-dot) { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; flex:1; }
  .home-project-chat small { font-size:9px; flex:none; }
  .home-project-chat.is-active { background:var(--selected); color:var(--text); }
  .home-chat-dot { display:block; width:5px; height:5px; border-radius:50%; background:var(--muted); flex:none; }
  .home-chat-dot.attention { background:#d99416; }.home-chat-dot.failed { background:#e25353; }.home-chat-dot.running { background:var(--accent); }
  .home-project-chats p { margin:5px 8px; font-size:11px; color:var(--muted); }
  .home-sidebar .home-project-more { font-size:11px; min-height:30px; padding:6px 8px; }
  .home-project-dialog .box { width:min(420px,100%); }
  .home-project-dialog .bar,.home-project-dialog .foot { padding:16px 20px; }
  .home-project-dialog-body { padding:0 20px 12px; }
  .home-project-dialog-path { overflow-wrap:anywhere; font-size:11px; color:var(--muted); }
  .home-project-action-list { display:grid; gap:3px; margin-block:12px 20px; }
  .home-project-action-list button { padding:9px 10px; text-align:left; border-radius:8px; }
  .home-project-dialog label { display:block; font-size:12px; margin-bottom:8px; }
  .home-project-name-row { display:flex; gap:8px; }
  .home-project-name-row input { min-width:0; flex:1; border:1px solid var(--border2); border-radius:8px; padding:8px; background:var(--card); color:var(--text); }
  .home-project-dialog-note { font-size:11px; color:var(--muted); line-height:1.5; }
  .home-project-copy { display:grid; gap:3px; min-width:0; }
  .home-project-title { display:flex; align-items:center; gap:6px; min-width:0; }
  .home-project-title strong { font-size:12px; font-weight:550; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .home-project-current { width:5px; height:5px; border-radius:50%; background:var(--accent); flex:none; }
  .home-project-path { color:var(--muted); font-size:10px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .home-sidebar .home-project-resume { width:28px; min-height:30px; padding:6px; margin-right:3px; justify-content:center; color:var(--muted); flex:none; }
  .home-sidebar .home-projects-footer button { min-height:34px; font-size:12px; padding:7px 8px; margin-top:6px; }
  .home-project-summary { font-size:12px; color:var(--muted); padding:0 8px; }
  .home-project-empty { padding:12px 8px; color:var(--muted); line-height:1.5; }
  .home-project-empty strong { display:block; color:var(--text); margin-bottom:6px; font-size:12px; }
  .home-project-empty p { margin:0; font-size:12px; }
  @media(min-width:801px) and (max-height:800px) {
    .home-main { gap:24px; }
    .home-sky .composer textarea { min-height:56px; }
  }
  @media(min-width:801px) {
    .home-sky[data-sidebar-collapsed=true] { padding-left:100px; }
    .run.code-workspace[data-sidebar-collapsed=true] { padding-left:64px; }
    .run.code-workspace[data-sidebar-collapsed=true] .cw-page-nav { left:calc(50% + 32px); }
    .home-sky[data-sidebar-collapsed=true] .cw-page-nav { left:calc(50% + 32px); }
    .home-sky[data-sidebar-collapsed=true] .home-sidebar { width:64px; padding-left:8px; padding-right:8px; }
    .home-sky[data-sidebar-collapsed=true] .home-sidebar-brand { padding:0; justify-content:center; min-height:28px; }
    .home-sky[data-sidebar-collapsed=true] .home-sidebar-brand img,
    .home-sky[data-sidebar-collapsed=true] .home-sidebar-brand > span,
    .home-sky[data-sidebar-collapsed=true] .home-sidebar > button > span,
    .home-sky[data-sidebar-collapsed=true] .home-sidebar nav button > span,
    .home-sky[data-sidebar-collapsed=true] .home-sidebar-foot button > span,
    .home-sky[data-sidebar-collapsed=true] #homeProjectsNav > span,
    .home-sky[data-sidebar-collapsed=true] #homeProjectCards,
    .home-sky[data-sidebar-collapsed=true] #homeNewProject,
    .home-sky[data-sidebar-collapsed=true] .home-projects-footer { display:none; }
    .home-sky[data-sidebar-collapsed=true] #homeCollapse { margin:0; }
    .home-sky[data-sidebar-collapsed=true] #homeCollapse svg { transform:rotate(180deg); }
    .home-sky[data-sidebar-collapsed=true] .home-sidebar button { justify-content:center; padding-left:0; padding-right:0; }
    .home-sky[data-sidebar-collapsed=true] .home-project-heading { padding:0; }
    .home-sky[data-sidebar-collapsed=true] .home-project-heading h2 { width:100%; }
  }
  @media(max-width:800px) {
    .run.run-chat.code-workspace { padding-left:0; }
    .run.code-workspace .cw-page-nav { left:50%; }
    .run.code-workspace .home-sidebar { background:var(--home-sidebar-surface); }
    .home.home-sky { padding:94px 20px; gap:24px; }
    .home-sky .cw-page-nav { left:50%; top:20px; }
    .home-menu-trigger { position:absolute; top:22px; left:18px; z-index:14; display:grid; place-items:center; width:36px; height:36px; border-radius:8px; color:var(--text); }
    .home-menu-trigger svg { width:20px; height:20px; }
    .home-sidebar { display:none; inset:70px auto auto 16px; width:min(264px,calc(100vw - 32px)); max-height:calc(100dvh - 90px); overflow:auto; border:1px solid var(--border); border-radius:14px; padding:20px 12px 12px; background:var(--home-sidebar-surface); z-index:14; box-shadow:var(--shadow-float); }
    .home-sidebar-brand { margin-bottom:20px; }
    .home-sidebar #homeCollapse { display:none; }
    .home-sidebar-foot { padding-top:16px; margin-top:16px; border-top:1px solid var(--border); }
    .home-sky[data-nav-open=true] .home-sidebar { display:flex; }
    .home-sky[data-nav-open=true] .home-nav-backdrop { display:block; position:fixed; inset:70px 0 0; background:var(--overlay); z-index:13; }
  }
  @media(max-width:480px) {
    .home.home-sky { padding:94px 16px; gap:22px; }
    .home-sky .home-brand h1 { font-size:26px; }
    .home-sky .home-brand-copy { font-size:12px; }
    .home-sky .home-character,.home-sky .cw-plush.home-character { width:40px; height:40px; }
    .home-sky .home-brand-lockup { gap:10px; }
    .home-sky .cw-top-nav button { padding:0 12px; }
  }
  @media(max-height:600px) {
    .home.home-sky { justify-content:flex-start; padding-top:96px; padding-bottom:24px; }
    .home-sky .home-main > .home-brand { position:static; }
  }
  .home > .home-cta { order: -1; width: min(540px, 100%); align-self: center; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .home-cta-btn { --cta-accent: var(--accent); display: flex; align-items: center; gap: 12px; min-width: 0; padding: 13px 15px; border: 1px solid var(--border); border-radius: 14px; background: var(--card); color: var(--text); text-align: left; cursor: pointer; transition: background .18s ease, border-color .18s ease, transform .18s ease; }
  .home-cta-btn.team { --cta-accent: var(--run); }
  .home-cta-btn:hover { background: var(--hover); border-color: var(--cta-accent); transform: translateY(-2px); }
  .home-cta-btn:focus-visible { outline: 2px solid var(--cta-accent); outline-offset: 3px; }
  .home-cta-btn .cta-ico { display: grid; place-items: center; width: 34px; height: 34px; flex: none; border-radius: 10px; background: color-mix(in srgb, var(--cta-accent) 10%, var(--card)); color: var(--cta-accent); }
  .home-cta-btn .cta-ico svg { width: 18px; height: 18px; }
  .home-cta-btn .cta-body { min-width: 0; flex: 1; }
  .home-cta-btn .cta-t { display: block; font-size: 13px; font-weight: 600; }
  .home-cta-btn .cta-d { display: block; font-size: 11px; color: var(--muted); margin-top: 3px; }
  .home-cta-btn .cta-arrow { font-size: 17px; color: var(--muted); }
  .home-brand-lockup { display: flex; flex-direction:column; justify-content: center; align-items: center; gap: 10px; }
  .home-character { width:96px; height:96px; object-fit:contain; animation:homeCharacterFloat 5s ease-in-out infinite; }
  .cw-plush.home-character { width:96px; height:96px; animation:homeCharacterFloat 5s ease-in-out infinite; }
  @keyframes homeCharacterFloat { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-5px); } }
  .home .home-brand-lockup h1 { width: auto; }
  .home-composer-wrap { width:min(760px,100%); min-width:0; }
  .home-composer-wrap .composer { width:100%; }
  .home-blob { width: clamp(72px, 10vw, 108px); height: auto; flex: none; overflow: visible; }
  .home-blob-body { transform-origin: 60px 83px; animation: homeBlobBob 5s ease-in-out infinite; }
  .home-blob-eye { transform-box: fill-box; transform-origin: center; animation: homeBlobBlink 6s ease-in-out infinite; }
  .home-blob-eye.wink { animation-name: homeBlobWink; }
  .home-blob-tongue { transform-box: fill-box; transform-origin: center top; animation: homeBlobTongue 6s ease-in-out infinite; }
  .home-blob-shadow { transform-origin: 60px 108px; animation: homeBlobShadow 5s ease-in-out infinite; }
  @keyframes homeBlobBob { 0%,100% { transform: translateY(0) rotate(-5deg); } 45% { transform: translateY(-8px) rotate(5deg); } 65% { transform: translateY(-3px) rotate(0deg) scale(1.04,.96); } }
  @keyframes homeBlobBlink { 0%,44%,48%,100% { transform: scaleY(1); } 46% { transform: scaleY(.08); } }
  @keyframes homeBlobWink { 0%,18%,38%,44%,48%,100% { transform: scaleY(1); } 23%,33%,46% { transform: scaleY(.12); } }
  @keyframes homeBlobTongue { 0%,15%,40%,100% { transform: scaleY(.05); } 22%,33% { transform: scaleY(1); } }
  @keyframes homeBlobShadow { 0%,100% { transform: scaleX(1); opacity: .18; } 45% { transform: scaleX(.8); opacity: .1; } }
  @media (max-width: 480px) { .home > .home-cta { gap: 8px; } .home-cta-btn { padding: 11px; gap: 8px; } .home-cta-btn .cta-arrow { display: none; } .home-cta-btn .cta-d { font-size: 10px; } .home-brand-lockup { gap: 8px; } }
  @media (prefers-reduced-motion: reduce) { .home-character,.home-blob * { animation: none !important; } .home-blob-tongue { transform: scaleY(.05); } }
`;
export const HOME_WORKSPACE_JS = PROJECT_PREFERENCES_JS + String.raw`
  function cwEnterWorkspace(kind,agentId) { cwEnsure().homeAction={kind:kind,agentId:agentId};openCowork(); }
  function homeProjectKey(path) {
    var key=String(path||'').replace(/\\/g,'/').replace(/\/+$/,'');
    return /^[a-z]:\//i.test(key)||key.indexOf('//')===0?key.toLowerCase():key;
  }
  function homeSessionStamp(session){return String(session&&(session.updatedAt||session.finishedAt||session.startedAt)||'');}
  function homeBuildProjects(managed,sessions,activePath) {
    var projects=new Map(),activeKey=homeProjectKey(activePath);
    function add(path,name) {
      var key=homeProjectKey(path);if(!key)return null;
      if(!projects.has(key))projects.set(key,{path:path,name:name||basename(path),sessions:[],current:key===activeKey});
      return projects.get(key);
    }
    managed.forEach(function(project){add(project.path,project.name);});
    Object.keys(homeWorkspaceState().projects).forEach(function(key){var pref=homeWorkspaceState().projects[key];if(pref&&typeof pref.path==='string')add(pref.path,pref.name);});
    add(activePath);
    sessions.forEach(function(session){
      var path=session.projectPath||((session.project===basename(activePath))?activePath:'');
      var project=add(path,session.project);if(project)project.sessions.push(session);
    });
    return Array.from(projects.values()).map(function(project){
      project.sessions.sort(function(a,b){return homeSessionStamp(b).localeCompare(homeSessionStamp(a));});
      project.latest=project.sessions[0]||null;project.preference=homeProjectPreference(project.path);project.name=homeProjectName(project.path,project.name);project.status=homeProjectStatus(project.sessions);return project;
    }).sort(function(a,b){return Number(!!b.preference.pinned)-Number(!!a.preference.pinned)||Number(b.current)-Number(a.current)||homeSessionStamp(b.latest).localeCompare(homeSessionStamp(a.latest))||a.name.localeCompare(b.name);});
  }
  function homeSidebarPath(sessions) {
    var sess=S.sessions&&S.sessions[S.active],run=sess&&(sess.session||sess),saved=(sessions||[]).find(function(item){return item.runId===S.active;});
    return (run&&run.projectPath)||(saved&&saved.projectPath)||effectiveProjectPath();
  }
  function homeSelectProject(project) {
    rememberModelSelection('',project.path);
    homeCaptureDrafts();homeActivateDraft(project.path);homeUpdateProject(project.path,{});
    S.settings.projectPath=project.path;S.lastProjectPath=project.path;persist();updateProjChip();renderSidebar();
    var picker=$('homeProj');if(picker){picker.querySelector('span').textContent=homeProjectName(project.path,project.name);picker.setAttribute('aria-label','Project '+homeProjectName(project.path,project.name));}
  }
  function homeRunProjectLabel() {
    var path=homeSidebarPath(),name=homeProjectName(path),picker=$('runProject');
    if(picker){picker.querySelector('span').textContent=name;picker.setAttribute('aria-label','Project '+name);}
    return name;
  }
  function homeRunStatus(run) {
    var waiting=typeof waitingFor==='function'?waitingFor(run):(run.pendingQuestions?'your answer':null);
    if(waiting)return {kind:'attention',label:'Needs '+waiting};
    if(['blocked','review'].includes(run.status))return {kind:'attention',label:run.status==='review'?'Needs review':'Blocked'};
    if(run.status==='failed')return {kind:'failed',label:'Failed'};
    if(['running','waiting_for_model'].includes(run.status))return {kind:'running',label:run.status==='waiting_for_model'?'Retrying model':'Running'};
    return {kind:'idle',label:run.status==='completed'?'Completed':run.status==='aborted'?'Stopped':run.status==='stalled'?'Paused':run.status||'Saved'};
  }
  function homeProjectStatus(sessions) {
    var counts={attention:0,failed:0,running:0};sessions.forEach(function(run){var kind=homeRunStatus(run).kind;if(kind!=='idle')counts[kind]++;});
    return ['attention','failed','running'].filter(function(kind){return counts[kind];}).map(function(kind){return {kind:kind,count:counts[kind],label:kind==='attention'?'Needs attention':kind==='failed'?'Failed':'Running'};});
  }
  function homeProjectBadge(status) {return '<span class="home-project-status '+status.kind+'" title="'+status.count+' '+esc(status.label.toLowerCase())+'" aria-label="'+status.count+' '+esc(status.label.toLowerCase())+'">'+status.count+' '+(status.kind==='attention'?(status.count===1?'needs you':'need you'):esc(status.label.toLowerCase()))+'</span>';}
  function homeOpenProjectRun(project,run) {homeCloseNavigation();homeSelectProject(project);openRun(run.runId,{chatish:run.mode==='chat',mode:run.mode,projectPath:project.path});}
  function homeProjectDate(project) {
    var latest=project.latest,stamp=latest&&(latest.updatedAt||latest.finishedAt||latest.startedAt),date=stamp?new Date(stamp):null;
    return date&&Number.isFinite(date.getTime())?date.toLocaleDateString(undefined,{month:'short',day:'numeric'}):'';
  }
  function homeRenderProjects(target,managed,sessions) {
    if(!target.isConnected)return;
    var all=homeBuildProjects(managed,sessions,homeSidebarPath(sessions)),archived=!!S.codeArchiveView;
    var visible=all.filter(function(project){return archived?!!(project.preference.archived||project.preference.hidden):!(project.preference.archived||project.preference.hidden);});
    var pinned=visible.filter(function(project){return project.preference.pinned;}),recent=visible.filter(function(project){return !project.preference.pinned;});
    var projects=archived?visible:pinned.concat(recent.slice(0,4));
    var focused=typeof document!=='undefined'&&document.activeElement,focusKey=focused&&target.contains&&target.contains(focused)?focused.getAttribute('data-home-focus'):null;
    var html=projects.length?'<div class="home-project-list">'+projects.map(function(project,index){
      var pref=project.preference,expanded=pref.expanded===undefined?project.current:!!pref.expanded,current=project.current,groupId='homeProjectChats-'+index;
      var chatRows=expanded?project.sessions.slice(0,pref.moreChats?project.sessions.length:6).map(function(run,runIndex){var status=homeRunStatus(run);return '<button type="button" class="home-project-chat'+(S.active===run.runId?' is-active':'')+'" data-home-chat="'+index+':'+runIndex+'" data-home-focus="chat:'+esc(run.runId)+'" aria-current="'+(S.active===run.runId)+'" title="'+esc(run.goal||'Untitled chat')+' · '+esc(status.label)+'"><span class="home-chat-dot '+status.kind+'" aria-hidden="true"></span><span>'+esc(sessionTitle(run.goal)||'Untitled chat')+'</span><small>'+esc(status.label)+'</small></button>';}).join(''):'';
      return '<article class="home-project-group"><div class="home-project'+(current?' is-current':'')+'"><button type="button" class="home-project-expand" data-home-expand="'+index+'" data-home-focus="expand:'+esc(project.path)+'" aria-label="'+(expanded?'Collapse':'Expand')+' chats for '+esc(project.name)+'" aria-expanded="'+expanded+'" aria-controls="'+groupId+'">'+icon(expanded?'chevDown':'chevRight')+'</button><button type="button" class="home-project-open" data-home-project="'+index+'" data-home-focus="select:'+esc(project.path)+'" aria-current="'+current+'" title="'+esc(project.path)+'" aria-label="Select project '+esc(project.name)+'"><span class="home-project-copy"><span class="home-project-title"><strong>'+esc(project.name)+'</strong>'+(pref.pinned?'<span class="home-project-pin" title="Pinned" aria-label="Pinned">'+icon('pin')+'</span>':'')+(current?'<span class="home-project-current" aria-label="Selected"></span>':'')+'</span><span class="home-project-path">'+esc(project.path)+'</span><span class="home-project-badges">'+project.status.map(homeProjectBadge).join('')+'</span></span></button><button type="button" class="home-project-options" data-home-options="'+index+'" data-home-focus="options:'+esc(project.path)+'" aria-label="Actions for '+esc(project.name)+'" title="Project actions">'+icon('more')+'</button></div><div class="home-project-chats" id="'+groupId+'"'+(expanded?'':' hidden')+'>'+chatRows+(expanded&&!project.sessions.length?'<p>No chats yet.</p>':'')+(expanded&&project.sessions.length>6?'<button type="button" class="home-project-more" data-home-more="'+index+'" data-home-focus="more:'+esc(project.path)+'">'+(pref.moreChats?'Show fewer chats':'Show all '+project.sessions.length+' chats')+'</button>':'')+'</div></article>';
    }).join('')+'</div>':'<div class="home-project-empty"><strong>'+(archived?'No archived or hidden projects':'A space for your next idea')+'</strong><p>'+(archived?'Archived projects can be restored here.':'Create a project or open a folder to keep your work and conversations together.')+'</p></div>';
    var coworkTasks=sessions.filter(function(run){return !!run.coworkTask;}).sort(function(a,b){return homeSessionStamp(b).localeCompare(homeSessionStamp(a));});
    if(coworkTasks.length&&!archived){
      function codingRow(run){var status=homeRunStatus(run);return '<button type="button" class="home-project-chat'+(S.active===run.runId?' is-active':'')+'" data-main-coding-task="'+esc(run.runId)+'" title="'+esc(run.goal)+'"><span class="home-chat-dot '+status.kind+'" aria-hidden="true"></span><span>'+esc(sessionTitle(run.goal))+'<small>'+esc(run.coworkTask.agentName)+'</small></span><small>'+esc(status.label)+'</small></button>';}
      html='<section aria-label="Cowork coding tasks"><h3>Cowork coding</h3>'+coworkTasks.slice(0,8).map(codingRow).join('')+(coworkTasks.length>8?'<details><summary>Older coding tasks</summary>'+coworkTasks.slice(8).map(codingRow).join('')+'</details>':'')+'</section>'+html;
    }
    target._projects=projects;target._managed=managed;target._sessions=sessions;
    if(target._markup===html)return;target._markup=html;target.innerHTML=html;
    function project(button,key){return target._projects[Number(button.dataset[key])];}
    function refresh(){homeRenderProjects(target,target._managed,target._sessions);}
    target.querySelectorAll('[data-home-project]').forEach(function(button){button.onclick=function(){
      homeCloseNavigation();homeSelectProject(project(button,'homeProject'));if(S.active!=='home'){openHome();return;}refresh();var input=$('goal');if(input)input.focus({preventScroll:true});
    };});
    target.querySelectorAll('[data-home-expand]').forEach(function(button){button.onclick=function(){var p=project(button,'homeExpand');homeUpdateProject(p.path,{expanded:button.getAttribute('aria-expanded')!=='true'});refresh();};});
    target.querySelectorAll('[data-home-more]').forEach(function(button){button.onclick=function(){var p=project(button,'homeMore');homeUpdateProject(p.path,{moreChats:!homeProjectPreference(p.path).moreChats});refresh();};});
    target.querySelectorAll('[data-home-chat]').forEach(function(button){button.onclick=function(){var pair=button.dataset.homeChat.split(':'),p=target._projects[Number(pair[0])];homeOpenProjectRun(p,p.sessions[Number(pair[1])]);};});
    target.querySelectorAll('[data-home-options]').forEach(function(button){button.onclick=function(){homeProjectActions(project(button,'homeOptions'),button);};});
    if(focusKey)target.querySelectorAll('[data-home-focus]').forEach(function(button){if(button.getAttribute('data-home-focus')===focusKey)button.focus({preventScroll:true});});
  }
  function homeProjectActions(project,opener) {
    homeCloseNavigation();var modal=document.createElement('div');modal.className='modal home-project-dialog';
    var pref=homeProjectPreference(project.path),inactive=!!(pref.archived||pref.hidden);
    modal.innerHTML='<div class="box" role="dialog" aria-modal="true" aria-labelledby="homeProjectActionsTitle" tabindex="-1"><div class="bar"><strong id="homeProjectActionsTitle">'+esc(project.name)+'</strong></div><div class="home-project-dialog-body"><p class="home-project-dialog-path">'+esc(project.path)+'</p><div class="home-project-action-list"><button type="button" data-project-action="pin">'+(pref.pinned?'Unpin project':'Pin project')+'</button><button type="button" data-project-action="folder">Open folder</button>'+(project.latest?'<button type="button" data-project-action="continue">Continue latest chat</button>':'')+'<button type="button" data-project-action="'+(inactive?'restore':'archive')+'">'+(inactive?'Restore project':'Archive project')+'</button>'+(!inactive?'<button type="button" data-project-action="hide">Remove from sidebar</button>':'')+'</div><form id="homeRenameProject"><label for="homeProjectName">Project display name</label><div class="home-project-name-row"><input id="homeProjectName" maxlength="120" required value="'+esc(project.name)+'"><button type="submit" class="btn">Save name</button></div></form><p class="home-project-dialog-note">Names and visibility are saved on this device. Files and chat history are preserved.</p><p id="homeProjectActionStatus" role="status"></p></div><div class="foot"><button type="button" class="btn" data-cancel>Close</button></div></div>';
    document.body.appendChild(modal);
    function close(){modal.remove();if(opener&&opener.isConnected&&opener.getClientRects().length)opener.focus({preventScroll:true});else if($('homeMenu')&&$('homeMenu').getClientRects().length)$('homeMenu').focus();}
    function refresh(){var target=$('homeProjectCards');if(target)homeRenderProjects(target,target._managed||[],target._sessions||[]);}
    modal.querySelector('[data-cancel]').onclick=close;modal.onclick=function(event){if(event.target===modal)close();};
    modal.addEventListener('keydown',function(event){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}if(event.key==='Tab'){var items=Array.from(modal.querySelectorAll('button,input')),first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
    modal.querySelectorAll('[data-project-action]').forEach(function(button){button.onclick=async function(){var action=button.dataset.projectAction;
      if(action==='folder'){try{if(window.gituDesktop&&window.gituDesktop.openProjectFolder){var result=await window.gituDesktop.openProjectFolder(project.path);if(!result||!result.ok)throw new Error(result&&result.error||'Could not open this folder.');close();}else{close();openFolderBrowser('inspect',project.path);}}catch(error){modal.querySelector('[role=status]').textContent=error.message;}return;}
      if(action==='continue'){close();homeOpenProjectRun(project,project.latest);return;}
      homeUpdateProject(project.path,action==='pin'?{pinned:!pref.pinned}:action==='restore'?{archived:false,hidden:false}:action==='archive'?{archived:true,pinned:false}:{hidden:true,pinned:false});close();refresh();
    };});
    modal.querySelector('form').onsubmit=function(event){event.preventDefault();var name=modal.querySelector('input').value.trim();if(!name)return;homeUpdateProject(project.path,{name:name});var label=$('homeProj');if(label&&homeProjectKey(effectiveProjectPath())===homeProjectKey(project.path)){label.querySelector('span').textContent=name;label.setAttribute('aria-label','Project '+name);}close();refresh();};
    modal.querySelector('[data-project-action]').focus();
  }
  function homeNavigationHtml(agent) {
    return '<button type="button" class="home-menu-trigger" id="homeMenu" aria-label="Open navigation" aria-expanded="false" aria-controls="homeSidebar">'+'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>'+'</button><div class="home-nav-backdrop" id="homeNavBackdrop" aria-hidden="true"></div><aside class="home-sidebar" id="homeSidebar" aria-label="Code navigation"><div class="home-sidebar-brand"><img src="/brand/agent-gitu-mark.svg" alt=""><span>Agent Gitu</span><button type="button" id="homeCollapse" aria-label="Collapse sidebar" aria-expanded="true" aria-controls="homeSidebar" title="Collapse sidebar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg></button></div><button type="button" id="cwPageSearch" aria-label="Search workspace" title="Search workspace">'+cwIcon('search')+'<span>Search workspace</span></button><nav aria-label="Code workspace">'+(S.active!=='home'?'<button type="button" id="homeNewChat">'+icon('pencil')+'<span>New task</span></button>':'')+'<button type="button" id="cwSessionsBtn" aria-label="Sessions" title="Sessions">'+cwIcon('chat')+'<span>Sessions</span></button></nav><div class="home-sidebar-scroll"><section class="home-projects" aria-labelledby="homeProjectsTitle"><div class="home-project-heading"><h2 id="homeProjectsTitle"><button type="button" id="homeProjectsNav" aria-label="Projects" title="Projects">'+cwIcon('folder')+'<span>Projects</span></button></h2><button type="button" id="homeNewProject" aria-label="New project" title="New project">'+cwIcon('plus')+'</button></div><div id="homeProjectCards"><p class="home-project-summary" role="status">Loading projects…</p></div><div class="home-projects-footer"><button type="button" id="homeViewProjects">View all projects</button><button type="button" id="homeArchivedProjects" aria-pressed="false">Archived &amp; hidden</button></div></section></div><div class="home-sidebar-foot"><button type="button" id="cwInfoBtn" aria-label="Profile" title="Profile">'+cwIcon('user')+'<span>Profile</span></button><button type="button" id="homeSettings" aria-label="Settings" title="Settings">'+icon('gear')+'<span>Settings</span></button></div></aside><div class="cw-page-nav"><nav class="cw-top-nav" aria-label="App modes"><button type="button" id="cwHomeBtn" aria-pressed="true">'+cwIcon('home')+'<span>Code</span></button><button type="button" id="cwCurrentChat" aria-pressed="false"><span class="cw-chat-face" aria-hidden="true">'+(agent?cwAva(agent):'<span class="cw-ava"><img src="/characters/blue.png?v=opendots1" alt="" draggable="false"></span>')+'</span><span>Cowork</span></button></nav></div>';
  }
  function homeCloseNavigation() {
    var menu=$('homeMenu');if(!menu)return;var root=menu.closest('.home-sky');if(root)root.dataset.navOpen='false';menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Open navigation');
  }
  function homeBindNavigation() {
    var root=document.querySelector('.home-sky'),menu=$('homeMenu');
    var collapse=$('homeCollapse');
    function setCollapsed(value){root.dataset.sidebarCollapsed=String(value);collapse.setAttribute('aria-expanded',String(!value));collapse.setAttribute('aria-label',value?'Expand sidebar':'Collapse sidebar');collapse.title=value?'Expand sidebar':'Collapse sidebar';}
    try{setCollapsed(localStorage.getItem('gitu-code-sidebar-collapsed')==='true');}catch(e){setCollapsed(false);}
    collapse.onclick=function(){var value=root.dataset.sidebarCollapsed!=='true';setCollapsed(value);try{localStorage.setItem('gitu-code-sidebar-collapsed',String(value));}catch(e){/* Navigation stays usable without storage. */}};
    function close(){homeCloseNavigation();}
    menu.onclick=function(){var open=root.dataset.navOpen!=='true';root.dataset.navOpen=String(open);menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Close navigation':'Open navigation');if(open)$('cwPageSearch').focus();};
    $('homeNavBackdrop').onclick=close;
    root.addEventListener('keydown',function(event){if(root.dataset.navOpen==='true'&&event.key==='Escape'){event.preventDefault();close();menu.focus();}});
    root.addEventListener('focusout',function(event){if(root.dataset.navOpen==='true'&&event.relatedTarget&&!$('homeSidebar').contains(event.relatedTarget)&&event.relatedTarget!==menu)close();});
    $('homeProjectsNav').onclick=function(){close();wsOpen('main','Projects');};
    $('cwSessionsBtn').onclick=function(){close();wsOpen('main','Sessions');};
    $('homeViewProjects').onclick=function(){close();wsOpen('main','Projects');};
    $('homeNewProject').onclick=function(){close();newProject();};
    $('homeArchivedProjects').setAttribute('aria-pressed',String(!!S.codeArchiveView));
    $('homeArchivedProjects').textContent=S.codeArchiveView?'Back to projects':'Archived & hidden';
    $('homeArchivedProjects').onclick=function(){S.codeArchiveView=!S.codeArchiveView;this.setAttribute('aria-pressed',String(!!S.codeArchiveView));this.textContent=S.codeArchiveView?'Back to projects':'Archived & hidden';var target=$('homeProjectCards');if(target)homeRenderProjects(target,target._managed||[],target._sessions||[]);};
    if($('homeNewChat'))$('homeNewChat').onclick=function(){homeCaptureDrafts();close();openHome();};
    $('cwHomeBtn').onclick=function(){homeCaptureDrafts();if(S.active==='home')$('goal').focus();else openHome();};
    $('cwCurrentChat').onclick=function(){homeCaptureDrafts();cwEnterWorkspace('chat',cwEnsure().selectedAgentId);};
    $('cwInfoBtn').onclick=function(){homeCaptureDrafts();close();var agent=cwProfileAgent()||cwEnsure().agents[0];cwEnterWorkspace(agent?'profile':'new',agent&&agent.id);};
    $('homeSettings').onclick=function(){homeCaptureDrafts();close();openSettings('overview');};
    $('cwPageSearch').onclick=function(){close();wsOpen('main');};
    var timer=setInterval(function(){if(!root.isConnected){clearInterval(timer);return;}if(!document.hidden)homeLoadProjects();},5000);

  }
  async function homeLoadProjects() {
    var target=$('homeProjectCards');if(!target||target._loading)return;target._loading=true;
    var results=await Promise.allSettled([api('/api/projects'),api('/api/runs')]);target._loading=false;if(!target.isConnected)return;
    if(results.every(function(result){return result.status==='rejected';})) {
      target._markup=null;target.innerHTML='<div class="home-project-empty" role="alert"><strong>Could not load projects</strong><p>Please try again.</p><button class="btn" id="homeRetryProjects">Retry</button></div>';
      $('homeRetryProjects').onclick=homeLoadProjects;return;
    }
    var managed=results[0].status==='fulfilled'?results[0].value.projects||[]:[],sessions=results[1].status==='fulfilled'?results[1].value:[];
    homeRenderProjects(target,managed,sessions);
    if(results.some(function(result){return result.status==='rejected';})) {
      target._markup=null;target.insertAdjacentHTML('beforeend','<p class="home-project-summary" role="status">Some projects or conversations could not load. <button class="btn" id="homeRetryProjects">Retry</button></p>');$('homeRetryProjects').onclick=homeLoadProjects;
    }
  }
  async function homeLoadProfile() {
    var nav=$('cwCurrentChat');if(!nav)return;
    try {var data=await api('/api/cowork/agents');if(!nav.isConnected)return;
      var cw=cwEnsure();cw.agents=data.agents||[];cw.skills=data.availableSkills||[];
      if(!cw.agents.some(function(agent){return agent.id===cw.selectedAgentId;}))cw.selectedAgentId=cw.agents[0]&&cw.agents[0].id;
      var face=nav.querySelector('.cw-chat-face'),agent=cwProfileAgent()||cw.agents[0];if(face&&agent)face.innerHTML=cwAva(agent);
    }catch(e){/* Profile access can retry when opened; it does not block projects. */}
  }
`;
export const HOME_CHARACTER_HTML = plushCharacterHtml('blue', 'home', '', 'home-character');

export const HOME_BLOB_HTML = '<svg class="home-blob" viewBox="0 0 120 120" aria-hidden="true" focusable="false">' +
  '<defs><radialGradient id="homeBlobFill" cx="30%" cy="20%" r="85%"><stop stop-color="#cbbdff"/><stop offset=".5" stop-color="#9580ff"/><stop offset="1" stop-color="#6550cf"/></radialGradient></defs>' +
  '<ellipse class="home-blob-shadow" cx="60" cy="108" rx="34" ry="5" fill="#7160cb" opacity=".18"/>' +
  '<g class="home-blob-body"><path d="M17 64C10 39 27 15 49 16C63 8 84 16 92 29C104 34 110 52 103 66C112 90 91 101 71 96C52 107 23 98 20 82C12 77 12 69 17 64Z" fill="url(#homeBlobFill)"/>' +
  '<ellipse cx="36" cy="33" rx="12" ry="6" fill="white" opacity=".22" transform="rotate(-32 36 33)"/>' +
  '<ellipse cx="33" cy="66" rx="8" ry="4" fill="#f4a4d2" opacity=".65"/><ellipse cx="87" cy="66" rx="8" ry="4" fill="#f4a4d2" opacity=".65"/>' +
  '<g class="home-blob-eye"><ellipse cx="44" cy="51" rx="6" ry="10" fill="#262144"/><circle cx="46" cy="48" r="2" fill="white"/></g>' +
  '<g class="home-blob-eye wink"><ellipse cx="77" cy="49" rx="6" ry="10" fill="#262144"/><circle cx="79" cy="46" r="2" fill="white"/></g>' +
  '<path d="M49 69Q60 85 72 67" fill="#36234e" stroke="#36234e" stroke-width="3" stroke-linecap="round"/>' +
  '<path class="home-blob-tongue" d="M58 74Q70 71 68 79Q64 90 59 81Z" fill="#ff91bd"/></g></svg>';
