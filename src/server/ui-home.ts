import { plushCharacterHtml } from './ui-characters.js';
// Compact home navigation with the same locally bundled Cowork companion.
export const HOME_CSS = String.raw`
  body:has(.home-sky) .sb,body:has(.home-sky) .topbar,body:has(.home-sky) .vresize,body:has(.home-sky) .side-fab,body:has(.home-sky) #mascotWrap { display:none!important; }
  .home.home-sky { background:var(--cw-chat-surface); color:var(--text); padding:104px 24px 36px; gap:24px; width:100%; }
  .home-sky .cw-page-nav { top:20px; }
  .home-sky .cw-top-nav { position:static; transform:none; background:color-mix(in srgb,var(--card) 54%,transparent); backdrop-filter:blur(20px) saturate(1.15); -webkit-backdrop-filter:blur(20px) saturate(1.15); box-shadow:0 3px 8px #1f5da71c; border:1px solid var(--border); }
  .home-sky .cw-top-nav button { color:var(--text); }
  .home-sky .cw-top-nav button[aria-pressed=true] { background:var(--text); color:var(--bg); }
  .home-sky > .home-cta { order:0; width:min(760px,100%); gap:14px; }
  .home-sky .home-brand { margin-top:0; padding:20px 0 4px; }
  .home-sky .home-brand-lockup { flex-direction:row; gap:16px; }
  .home-sky .home-character { width:88px; height:88px; animation:none; }
  .home-sky .home-brand h1 { font-size:clamp(36px,5vw,58px); color:var(--text); }
  .home-sky .home-brand-name { background:none; color:var(--text); -webkit-text-fill-color:var(--text); }
  .home-sky .home-brand-spark { display:none; }
  .home-sky .home-brand-copy { font-size:16px; color:var(--muted); margin-top:10px; }
  .home-sky .home-cta-btn { border-radius:20px; padding:20px; background:color-mix(in srgb,var(--card) 68%,transparent); border-color:var(--border); box-shadow:none; }
  .home-sky .home-cta-btn .cta-ico { width:44px; height:44px; background:var(--card2); color:var(--accent); }
  .home-sky .home-cta-btn .cta-t { font-size:17px; color:var(--text); }
  .home-sky .home-cta-btn .cta-d { font-size:13px; color:var(--muted); }
  .home-sky .home-composer-wrap { margin:0; }
  .home-sky .composer { border:1px solid var(--border); border-radius:24px; background:color-mix(in srgb,var(--card) 82%,transparent); box-shadow:0 5px 12px #276eac10; backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); }
  .home-sky .composer textarea { color:var(--text); }
  .home-sky .composer textarea::placeholder { color:var(--faint); }
  .home-sky .composer-workspace { color:var(--muted); }
  .home-projects { width:min(760px,100%); }
  .home-project-heading { display:flex; align-items:center; justify-content:space-between; margin:0 0 14px; gap:12px; }
  .home-project-heading h2 { margin:0; font-size:20px; letter-spacing:-.03em; }
  .home-project-actions { display:flex; flex-wrap:wrap; gap:6px; }
  .home-projects .btn { border-radius:999px; color:var(--text); padding:8px 12px; font-size:12px; }
  .home-project-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  .home-project { background:linear-gradient(135deg,color-mix(in srgb,var(--card) 72%,transparent),color-mix(in srgb,var(--card) 50%,transparent)); border:1px solid color-mix(in srgb,var(--border2) 50%,transparent); border-radius:22px; overflow:hidden; min-width:0; backdrop-filter:blur(24px) saturate(1.1); -webkit-backdrop-filter:blur(24px) saturate(1.1); box-shadow:inset 0 1px 0 #ffffff40,0 14px 34px -24px #244a6a55; transition:border-color .2s ease,box-shadow .2s ease; }
  .home-project.is-current { border-color:color-mix(in srgb,var(--run) 45%,var(--border)); }
  .home-project:hover { box-shadow:inset 0 1px 0 #ffffff40,0 18px 40px -24px #244a6a66; }
  .home-project-open { display:flex; align-items:flex-start; gap:12px; padding:16px; width:100%; text-align:left; color:var(--text); border-radius:21px; }
  .home-project-icon { display:grid; place-items:center; flex:none; width:40px; height:40px; border-radius:13px; background:color-mix(in srgb,var(--run) 12%,var(--card)); color:var(--run); }
  .home-project-icon svg { width:20px; height:20px; }
  .home-project-copy { display:flex; flex:1; flex-direction:column; gap:6px; min-width:0; }
  .home-project-title { display:flex; justify-content:space-between; align-items:center; gap:8px; }
  .home-project-title strong { font-size:15px; font-weight:600; overflow-wrap:anywhere; }
  .home-project-current { font-size:10px; color:var(--brand-on-blue); background:var(--brand-blue); border-radius:999px; padding:3px 8px; font-weight:500; flex:none; }
  .home-project-summary { color:var(--muted); font-size:12px; line-height:1.5; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
  .home-project-footer { display:flex; align-items:center; justify-content:space-between; gap:8px; border-top:1px solid color-mix(in srgb,var(--border) 50%,transparent); padding:6px 10px 6px 16px; color:var(--muted); font-size:11px; }
  .home-project-footer .btn { color:var(--run); }
  .home-project-empty { background:color-mix(in srgb,var(--card) 68%,transparent); border:1px solid var(--border); padding:24px; border-radius:22px; color:var(--muted); line-height:1.5; }
  .home-project-empty strong { display:block; color:var(--text); margin-bottom:6px; }
  .home-project-empty p { margin:0; font-size:13px; }
  @media(max-width:600px) { .home.home-sky { padding:86px 16px 24px; gap:20px; }.home-sky .home-brand-lockup { gap:8px; }.home-sky .home-character { width:64px; height:64px; }.home-project-grid { grid-template-columns:1fr; }.home-project-heading { flex-wrap:wrap; }.home-project-actions { margin-left:-12px; width:100%; }.home-project-open { padding:16px; } }
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
  @media (max-width: 480px) { .home > .home-cta { gap: 8px; } .home-cta-btn { padding: 11px; gap: 8px; } .home-cta-btn .cta-arrow { display: none; } .home-cta-btn .cta-d { font-size: 10px; } .home-brand-lockup { gap: 8px; } .home .home-brand-lockup h1 { font-size: 36px; } }
  @media (prefers-reduced-motion: reduce) { .home-character,.home-blob * { animation: none !important; } .home-blob-tongue { transform: scaleY(.05); } }
`;
export const HOME_WORKSPACE_JS = String.raw`
  function cwEnterWorkspace(kind,agentId) { cwEnsure().homeAction={kind:kind,agentId:agentId};openCowork(); }
  function homeProjectKey(path) {
    var key=String(path||'').replace(/\\/g,'/').replace(/\/+$/,'');
    return /^[a-z]:\//i.test(key)||key.indexOf('//')===0?key.toLowerCase():key;
  }
  function homeBuildProjects(managed,sessions,activePath) {
    var projects=new Map(),activeKey=homeProjectKey(activePath);
    function add(path,name) {
      var key=homeProjectKey(path);if(!key)return null;
      if(!projects.has(key))projects.set(key,{path:path,name:name||basename(path),sessions:[],current:key===activeKey});
      return projects.get(key);
    }
    managed.forEach(function(project){add(project.path,project.name);});
    add(activePath);
    sessions.forEach(function(session){
      var path=session.projectPath||((session.project===basename(activePath))?activePath:'');
      var project=add(path,session.project);if(project)project.sessions.push(session);
    });
    return Array.from(projects.values()).map(function(project){
      project.sessions.sort(function(a,b){return String(b.startedAt||'').localeCompare(String(a.startedAt||''));});
      project.latest=project.sessions[0]||null;return project;
    }).sort(function(a,b){return Number(b.current)-Number(a.current)||String(b.latest&&b.latest.startedAt||'').localeCompare(String(a.latest&&a.latest.startedAt||''))||a.name.localeCompare(b.name);});
  }
  function homeSelectProject(project) {
    S.settings.projectPath=project.path;S.lastProjectPath=project.path;persist();updateProjChip();renderSidebar();
    var picker=$('homeProj');if(picker){picker.querySelector('span').textContent=project.name;picker.setAttribute('aria-label','Project '+project.name);}
  }
  function homeRenderProjects(target,managed,sessions) {
    if(!target.isConnected)return;
    var projects=homeBuildProjects(managed,sessions,effectiveProjectPath());
    target.innerHTML=projects.length?'<div class="home-project-grid">'+projects.map(function(project,index){
      var count=project.sessions.length,latest=project.latest;
      return '<article class="home-project'+(project.current?' is-current':'')+'"><button class="home-project-open" data-home-project="'+index+'" aria-current="'+project.current+'" title="'+esc(project.path)+'"><span class="home-project-icon" aria-hidden="true">'+icon('folder')+'</span><span class="home-project-copy"><span class="home-project-title"><strong>'+esc(project.name)+'</strong>'+(project.current?'<span class="home-project-current">Current</span>':'')+'</span><span class="home-project-summary">'+esc(latest?sessionTitle(latest.goal):'A fresh space for your next idea.')+'</span></span></button><div class="home-project-footer"><span>'+count+' conversation'+(count===1?'':'s')+'</span>'+(latest?'<button class="btn" data-home-resume="'+index+'">'+cwIcon('chat')+'Continue chat</button>':'<span>Ready to start</span>')+'</div></article>';
    }).join('')+'</div>':'<div class="home-project-empty"><strong>A space for your next idea</strong><p>Create a project or open a folder to keep your work and conversations together.</p></div>';
    target.querySelectorAll('[data-home-project]').forEach(function(button){button.onclick=function(){
      homeSelectProject(projects[Number(button.dataset.homeProject)]);homeRenderProjects(target,managed,sessions);var input=$('goal');if(input)input.focus({preventScroll:true});
    };});
    target.querySelectorAll('[data-home-resume]').forEach(function(button){button.onclick=function(){
      var project=projects[Number(button.dataset.homeResume)],run=project.latest;homeSelectProject(project);openRun(run.runId,{chatish:run.mode==='chat',mode:run.mode});
    };});
  }
  async function homeLoadProjects() {
    var target=$('homeProjectCards');if(!target)return;
    var results=await Promise.allSettled([api('/api/projects'),api('/api/runs')]);if(!target.isConnected)return;
    if(results.every(function(result){return result.status==='rejected';})) {
      target.innerHTML='<div class="home-project-empty" role="alert"><strong>Could not load projects</strong><p>Please try again.</p><button class="btn" id="homeRetryProjects">Retry</button></div>';
      $('homeRetryProjects').onclick=homeLoadProjects;return;
    }
    var managed=results[0].status==='fulfilled'?results[0].value.projects||[]:[],sessions=results[1].status==='fulfilled'?results[1].value:[];
    homeRenderProjects(target,managed,sessions);
    if(results.some(function(result){return result.status==='rejected';})) {
      target.insertAdjacentHTML('beforeend','<p class="home-project-summary" role="status">Some projects or conversations could not load. <button class="btn" id="homeRetryProjects">Retry</button></p>');$('homeRetryProjects').onclick=homeLoadProjects;
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
