import { COWORK_PROFILE_SETTINGS_CSS } from './ui-cowork-profile-settings.js';

/** Full-page profiles reuse the Cowork store, registry and authorization APIs. */
export const COWORK_DASHBOARD_CSS = String.raw`
  .cw.page-open { background:var(--cw-chat-surface); color:var(--text); }
  .cw.page-open > .cw-rail,.cw.page-open > .cw-splitter,.cw.page-open > .cw-info { display:none!important; }
  .cw.page-open > .cw-chat { width:100%; background:none; flex:1; overflow:hidden; }
  .cw-profile-page { height:100%; overflow:auto; padding:82px 28px 32px; color:var(--text); scroll-padding-top:90px; }
  .cw-page-nav { position:absolute; top:18px; left:50%; transform:translateX(-50%); z-index:10; }
  .cw.page-open .cw-top-nav { position:static; transform:none; background:color-mix(in srgb,var(--card) 54%,transparent); border:1px solid var(--border); box-shadow:0 3px 8px #1f5da71c; backdrop-filter:blur(20px) saturate(1.15); -webkit-backdrop-filter:blur(20px) saturate(1.15); }
  .cw.page-open .cw-top-nav button { color:var(--text); }
  .cw.page-open .cw-top-nav button[aria-pressed=true] { color:var(--bg); background:var(--text); }
  .cw-dashboard { max-width:1216px; margin:0 auto; }
  .cw-profile-tabs { display:flex; gap:8px; padding:5px; border:1px solid var(--border2); border-radius:24px; background:color-mix(in srgb,var(--card) 54%,transparent); margin:0 0 24px; }
  .cw-profile-tabs button { flex:1; min-width:120px; display:flex; flex-direction:column; align-items:center; gap:8px; min-height:88px; padding:12px; border:0; border-radius:20px; background:transparent; color:var(--text); font:inherit; font-size:15px; cursor:pointer; transition:background .18s,transform .18s; }
  .cw-profile-tabs svg { width:30px; height:30px; stroke-width:1.8; }
  .cw-profile-tabs button:hover { background:color-mix(in srgb,var(--card) 76%,transparent); transform:translateY(-1px); }
  .cw-profile-tabs button[aria-selected=true] { background:var(--selected); color:var(--accent); }
  .cw-dashboard button:focus-visible,.cw-dashboard a:focus-visible,.cw-page-nav button:focus-visible { outline:3px solid var(--accent); outline-offset:3px; }
  .cw-identity { display:grid; grid-template-columns:220px 1fr auto; gap:30px; align-items:center; margin:0 8px 22px; }
  .cw-identity-avatar { width:208px; height:208px; padding:10px; border:2px solid var(--border); border-radius:50%; background:var(--selected); box-shadow:inset 0 0 0 7px var(--accent); cursor:pointer; }
  .cw-identity-avatar .cw-ava { width:100%; height:100%; background:var(--card2)!important; border-radius:50%; overflow:hidden; }
  .cw-identity-avatar .cw-ava img { width:100%; height:100%; object-fit:contain; }
  .cw-identity-avatar[data-active=true] { animation:cw-profile-breathe 4s ease-in-out infinite; }
  .cw-identity > div { min-width:0; }
  .cw-role-badges span { max-width:100%; overflow-wrap:anywhere; }
  .cw-skill-option > span { min-width:0; overflow-wrap:anywhere; }
  .cw-identity h1 { font-size:clamp(32px,4vw,52px); line-height:1.1; letter-spacing:-.045em; margin:0 0 8px; }
  .cw-name-edit { padding:0; border:0; background:none; color:inherit; font:inherit; cursor:pointer; text-align:left; overflow-wrap:anywhere; }
  .cw-name-edit:hover { color:var(--accent); }
  .cw-role-badges,.cw-trait-list { display:flex; flex-wrap:wrap; gap:8px; }
  .cw-role-badges span,.cw-trait-list span { padding:7px 16px; border-radius:999px; background:color-mix(in srgb,var(--card) 76%,transparent); border:1px solid var(--border); color:var(--text); font-size:13px; }
  .cw-role-badges .primary { color:var(--bg); background:var(--accent); border-color:var(--accent); }
  .cw-identity-description { display:block; padding:0; border:0; background:none; text-align:left; font:inherit; color:var(--muted); margin:12px 0 8px; max-width:580px; line-height:1.5; cursor:pointer; }
  .cw-identity .cw-persona-status { background:none; border:0; color:var(--muted); font-size:12px; padding:0; }
  .cw-identity-actions { display:flex; gap:10px; align-self:start; margin-top:8px; }
  .cw-dashboard .btn,.cw-agent-editor .btn,.cw.page-open .cw-services .btn { min-height:42px; border-radius:999px; padding:9px 18px; font-size:13px; background:color-mix(in srgb,var(--card) 76%,transparent); border:1px solid var(--border); color:var(--text); display:inline-flex; gap:8px; align-items:center; justify-content:center; cursor:pointer; transition:background .18s,transform .18s; }
  .cw-dashboard .btn.dark,.cw-agent-editor .btn.dark,.cw.page-open .cw-services .btn.dark { background:var(--accent); color:var(--on-accent); border-color:var(--accent); box-shadow:0 3px 8px #0762d425; }
  .cw-dashboard .btn:hover,.cw-agent-editor .btn:hover,.cw.page-open .cw-services .btn:hover { transform:translateY(-1px); background:var(--hover); }
  .cw-dashboard .btn.dark:hover,.cw-agent-editor .btn.dark:hover { background:var(--accent); }
  .cw-dashboard .btn:disabled { opacity:.55; cursor:wait; transform:none; }
  .cw-overview-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .cw-sky-card { min-width:0; padding:20px; border:1px solid var(--card2); border-radius:20px; background:color-mix(in srgb,var(--card) 68%,transparent); box-shadow:0 2px 4px #24669e08; }
  .cw-summary-card { cursor:pointer; transition:background .18s,transform .18s; }
  .cw-summary-card:hover { background:var(--hover); transform:translateY(-2px); }
  .cw-card-heading { display:flex; align-items:flex-start; gap:14px; margin-bottom:14px; }
  .cw-card-heading > svg { width:32px; height:32px; flex:none; color:var(--accent); }
  .cw-card-heading h2 { margin:0 0 4px; font-size:22px; letter-spacing:-.025em; }
  .cw-card-heading p { margin:0; font-size:14px; line-height:1.5; color:var(--muted); }
  .cw-sky-tiles { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
  .cw-sky-tile { display:flex; align-items:center; gap:12px; min-width:0; min-height:70px; padding:12px; border:1px solid var(--border); border-radius:16px; background:color-mix(in srgb,var(--card) 78%,transparent); color:var(--text); text-align:left; font:inherit; font-size:13px; }
  .cw-sky-tile > svg { width:27px; height:27px; flex:none; color:var(--accent); }
  .cw-sky-tile strong,.cw-sky-tile small { display:block; }
  .cw-sky-tile small { color:var(--muted); line-height:1.35; margin-top:3px; font-size:12px; }
  .cw-sky-tile > span { flex:1; min-width:0; overflow-wrap:anywhere; }
  .cw-sky-tile > .cw-profile-tool-icon { flex:none; }
  .cw-overview-roles { grid-template-columns:repeat(auto-fit,minmax(110px,1fr)); }
  .cw-overview-roles .cw-sky-tile { flex-direction:column; align-items:flex-start; gap:8px; }
  .cw-connected-strip { margin-top:12px; }
  .cw-connected-strip .cw-card-heading { align-items:center; }
  .cw-connected-strip .cw-card-heading > div { flex:1; }
  .cw-connected-strip .cw-sky-tiles { grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); }
  .cw-connected-label { color:var(--ok)!important; }
  .cw-empty { padding:12px 0; font-size:14px; color:var(--muted); line-height:1.6; }
  .cw-empty .btn { margin-top:10px; }
  .cw-detail-page { animation:cw-profile-enter .2s ease-out both; }
  .cw-detail-title { display:flex; justify-content:space-between; gap:12px; align-items:center; margin:4px 0 18px; }
  .cw-detail-title h2 { margin:0 0 4px; font-size:30px; letter-spacing:-.035em; }
  .cw-detail-title p { margin:0; color:var(--muted); line-height:1.5; }
  .cw-profile-form { display:grid; gap:16px; }
  .cw-profile-form label,.cw-memory-editor label { display:block; font-size:14px; font-weight:600; margin-bottom:7px; }
  .cw-profile-form input:not([type=checkbox]):not([type=radio]),.cw-profile-form textarea,.cw-profile-form select,.cw-memory-search,.cw-memory-editor textarea { width:100%; padding:12px 14px; background:var(--card2); border:1px solid var(--border); color:var(--text); border-radius:13px; font:inherit; font-size:14px; outline:none; }
  .cw-profile-form input:focus,.cw-profile-form textarea:focus,.cw-profile-form select:focus,.cw-memory-search:focus,.cw-memory-editor textarea:focus { outline:2px solid var(--accent); outline-offset:2px; }
  .cw-profile-form textarea { min-height:110px; resize:vertical; }
  .cw-profile-form .cw-instructions { min-height:160px; }
  .cw-profile-form small { display:block; margin-top:6px; color:var(--muted); line-height:1.5; }
  .cw-form-columns { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  .cw-form-actions { display:flex; align-items:center; gap:12px; justify-content:flex-end; }
  .cw-form-error { color:var(--err); flex:1; margin:0; font-size:13px; }
  .cw-role-editor { display:grid; grid-template-columns:auto 1fr auto; align-items:start; gap:12px; padding:16px; background:color-mix(in srgb,var(--card) 78%,transparent); border:1px solid var(--border); border-radius:16px; }
  .cw-role-editor > input { margin-top:15px; width:18px; height:18px; accent-color:var(--accent); }
  .cw-role-editor textarea { min-height:75px; margin-top:8px; }
  .cw-role-editor .btn { padding:9px 12px; }
  .cw-skill-option { display:flex; align-items:flex-start; gap:12px; }
  .cw-skill-option > input { margin-top:6px; width:18px; height:18px; accent-color:var(--accent); flex:none; }
  .cw-skill-option h3 { margin:0 0 6px; font-size:16px; }
  .cw-skill-option p { margin:0 0 10px; color:var(--muted); line-height:1.5; font-size:13px; }
  .cw-skill-option summary { font-size:12px; cursor:pointer; }
  .cw-memory-layout { display:grid; grid-template-columns:1.1fr 1fr; gap:16px; }
  .cw-memory-search { margin-bottom:12px; }
  .cw-memory-filters { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; }
  .cw-memory-filters .btn { font-size:12px; min-height:34px; padding:7px 12px; }
  .cw-memory-filters [aria-pressed=true] { background:var(--text); color:var(--bg); }
  .cw-memory-list { display:grid; gap:8px; max-height:520px; overflow:auto; }
  .cw-memory-list button { width:100%; cursor:pointer; display:block; }
  .cw-memory-list button[aria-pressed=true] { border:2px solid var(--accent); }
  .cw-memory-list small { margin-top:8px; }
  .cw-memory-editor textarea { min-height:130px; resize:vertical; }
  .cw-memory-editor p,.cw-memory-editor li { color:var(--muted); font-size:13px; line-height:1.6; overflow-wrap:anywhere; }
  .cw-memory-editor details { margin:14px 0; }
  .cw-memory-editor summary { cursor:pointer; }
  .cw-memory-editor .cw-form-actions { justify-content:space-between; }
  .cw-connections-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
  .cw-connection-card .cw-card-heading h2 { font-size:18px; }
  .cw-connection-card p,.cw-connection-card li { font-size:13px; line-height:1.6; color:var(--muted); }
  .cw-connection-card .cw-form-actions { justify-content:flex-start; flex-wrap:wrap; }
  .cw.page-open .cw-services { height:100%; max-width:none; padding:92px max(24px,calc((100% - 1216px)/2)) 28px; background:none; color:var(--text); }
  .cw.page-open .cw-services-head h1 { font-size:36px; letter-spacing:-.035em; }
  .cw.page-open .cw-services p { color:var(--muted); }
  .cw.page-open .cw-services-controls { padding:15px; background:color-mix(in srgb,var(--card) 68%,transparent); border:1px solid var(--border); border-radius:20px; }
  .cw.page-open .cw-service-row { background:color-mix(in srgb,var(--card) 76%,transparent); padding:15px; border:1px solid var(--card2); border-radius:17px; }
  .cw.page-open .cw-service-grid { gap:12px; }
  .cw.page-open .cw-services input,.cw.page-open .cw-services select { background:var(--card2); color:var(--text); border-color:var(--border); }
  .cw-agent-editor.modal { padding:0; background:var(--cw-chat-surface); color:var(--text); backdrop-filter:none; -webkit-backdrop-filter:none; }
  .cw-agent-editor.modal .box { width:100%; max-width:none; height:100%; max-height:none; border:0; border-radius:0; background:var(--cw-chat-surface); box-shadow:none; }
  .cw-agent-editor .bar,.cw-agent-editor .cw-foot { width:min(100%,1080px); margin:0 auto; padding:20px 24px; border:0; background:none; }
  .cw-agent-editor .bar > span:first-child { font-size:24px!important; letter-spacing:-.03em; }
  .cw-agent-editor .cw-body { width:min(100%,1080px); margin:0 auto; padding:0 24px 24px; }
  .cw-agent-editor .cw-editor-section { background:color-mix(in srgb,var(--card) 68%,transparent); border:1px solid var(--border); border-radius:20px; padding:20px; margin-bottom:14px; }
  .cw-editor-section h2 { font-size:20px; margin:0 0 16px; letter-spacing:-.02em; }
  .cw-agent-editor input:not([type=checkbox]):not([type=color]),.cw-agent-editor textarea,.cw-agent-editor select { background:var(--card2); color:var(--text); border:1px solid var(--border); border-radius:12px; }
  .cw-agent-editor .cw-shapes button,.cw-agent-editor .cw-templates button,.cw-agent-editor .cw-skills button { background:var(--card2); color:var(--text); border:1px solid color-mix(in srgb,var(--card) 54%,transparent); }
  .cw-agent-editor .cw-shapes button.cur,.cw-agent-editor .cw-skills button.on { border-color:var(--accent); background:var(--selected); }
  .cw-agent-editor .cw-avhint,.cw-agent-editor .cw-note { color:var(--muted); }
  @keyframes cw-profile-breathe { 50% { transform:translateY(-2px) scale(1.008); } }
  @keyframes cw-profile-enter { from { opacity:0; transform:translateY(5px); } to { opacity:1; transform:translateY(0); } }
  @media(max-width:1100px) { .cw-identity { grid-template-columns:168px 1fr; gap:22px; }.cw-identity-avatar { width:160px; height:160px; }.cw-identity-actions { grid-column:2; margin-top:-12px; }.cw-profile-page { padding-inline:24px; }.cw-connections-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  @media(max-width:720px) { .cw-profile-page { padding:76px 16px 24px; }.cw-page-nav { top:14px; }.cw-profile-tabs { overflow:auto; border-radius:20px; margin-bottom:20px; gap:2px; }.cw-profile-tabs button { min-width:106px; min-height:80px; font-size:13px; padding:10px; }.cw-profile-tabs svg { width:27px; height:27px; }.cw-identity { grid-template-columns:94px 1fr; gap:14px; margin:0 0 20px; }.cw-identity-avatar { width:94px; height:94px; padding:5px; box-shadow:inset 0 0 0 4px var(--accent); }.cw-identity h1 { font-size:34px; }.cw-identity-description { font-size:13px; }.cw-role-badges { gap:5px; }.cw-role-badges span { font-size:11px; padding:5px 10px; }.cw-identity-actions { grid-column:1/-1; margin:0; }.cw-identity-actions .btn { flex:1; }.cw-overview-grid,.cw-form-columns,.cw-memory-layout,.cw-connections-grid { grid-template-columns:1fr; }.cw-sky-card { padding:16px; border-radius:18px; }.cw-card-heading { gap:10px; }.cw-card-heading h2 { font-size:20px; }.cw-card-heading p { font-size:13px; }.cw-connected-strip .cw-card-heading { flex-wrap:wrap; }.cw-connected-strip .cw-card-heading .btn { width:100%; }.cw-detail-title { align-items:flex-start; }.cw-detail-title h2 { font-size:26px; }.cw-detail-title .btn { padding:8px 12px; font-size:12px; }.cw-role-editor { gap:8px; padding:12px; }.cw-role-editor .btn { padding:8px; }.cw.page-open .cw-services { padding:82px 16px 24px; }.cw.page-open .cw-services-head { gap:12px; }.cw-agent-editor .cw-body,.cw-agent-editor .bar,.cw-agent-editor .cw-foot { padding-inline:16px; }.cw-agent-editor .cw-2col { grid-template-columns:1fr; }.cw-agent-editor .cw-avrow { flex-wrap:wrap; }.cw-agent-editor .cw-editor-section { padding:16px; }.cw-agent-editor .cw-avopts { min-width:0; width:100%; } }
  @media(prefers-reduced-motion:reduce) { .cw-identity-avatar,.cw-detail-page { animation:none!important; }.cw-dashboard * { transition:none!important; } }
${COWORK_PROFILE_SETTINGS_CSS}
`;

export const COWORK_DASHBOARD_JS = String.raw`
  var CW_PROFILE_SECTIONS=[['personality','heart','Personality'],['roles','user','Roles'],['skills','spark','Skills'],['memory','database','Memory'],['connections','link','Connections']];
  function cwProfileIcon(name) {
    var paths={heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',spark:'<path d="m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7L12 2Z"/>',database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',link:'<path d="m9 15 6-6m-5-3 2-2a5 5 0 0 1 7 7l-2 2m-3 5-2 2a5 5 0 0 1-7-7l2-2"/>'};
    return paths[name]?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+paths[name]+'</svg>':cwIcon(name);
  }
  function cwPageNavHtml(active,agent) {
    return (active!=='chat'?'<button class="workspace-search-trigger" id="cwPageSearch" aria-label="Search workspace" title="Search">'+cwIcon('search')+'</button>':'')+'<div class="cw-page-nav"><nav class="cw-top-nav" aria-label="Agent navigation"><button id="cwHomeBtn" aria-pressed="'+(active==='home')+'">'+cwIcon('home')+'<span>Home</span></button><button id="cwCurrentChat" aria-pressed="'+(active==='chat')+'"><span class="cw-chat-face" aria-hidden="true">'+(agent?cwAva(agent):'<span class="cw-ava"><img src="/characters/blue.png?v=opendots1" alt="" draggable="false"></span>')+'</span><span>Chat</span></button><button id="cwInfoBtn" aria-pressed="'+(active==='profile')+'">'+cwIcon('user')+'<span>Profile</span></button></nav></div>';
  }
  function cwProfileAgent() { var cw=cwEnsure(),conv=cwActiveConv();return cwAgentById((cw.profileOpen?cw.profileAgentId:cw.connectionsOpen?cw.connectionsAgentId:cw.selectedAgentId)||(conv&&(conv.chiefId||conv.memberIds[0]))); }
  function cwOpenProfile(agentId,section) {
    var cw=cwEnsure();cwSaveDraft();cwClosePanels();cw.memoryFilter='all';cw.memorySelectedId=null;cw.galleryOpen=false;cw.connectionsOpen=false;cw.connectionRevision=(cw.connectionRevision||0)+1;
    var conv=cwActiveConv(),agent=cwAgentById(agentId||cw.selectedAgentId||(conv&&(conv.chiefId||conv.memberIds[0])));
    if(!agent){toast('Choose a teammate to view their profile.');return;}
    cw.profileAgentId=agent.id;cw.profileOpen=true;cw.profileSection=section||'personality';cw.profileRevision=(cw.profileRevision||0)+1;
    cwRenderProfilePage();cwSyncPanels();cwLoadProfileData(agent.id,cw.profileRevision);
  }
  function cwReturnToChat() {
    var cw=cwEnsure(),agent=cwProfileAgent();cw.profileOpen=false;cw.profileRevision=(cw.profileRevision||0)+1;cw.connectionsOpen=false;cw.connectionRevision=(cw.connectionRevision||0)+1;
    cwRenderChat();cwSyncPanels();if(agent&&(!cwActiveConv()||cwActiveConv().kind!=='dm'||cwActiveConv().memberIds[0]!==agent.id))cwOpenDm(agent.id);
    var input=$('cwInput');if(input)input.focus({preventScroll:true});
    if(!cw.timer&&cw.active){cwStartStream(cw.active);cwPoll();cw.timer=setInterval(cwPoll,2000);}
  }
  function cwProfileErrorText(error,fallback) {try{var parsed=JSON.parse(error.message);return parsed.error||fallback;}catch(e){return error.message||fallback;}}
  function cwStartProfileTask() {var cw=cwEnsure(),agent=cwProfileAgent();if(!agent)return;cw.pendingProfileMissionAgentId=agent.id;cwReturnToChat();cwFinishProfileTaskNavigation();}
  function cwFinishProfileTaskNavigation() {var cw=cwEnsure(),conv=cwActiveConv();if(cw.pendingProfileMissionAgentId&&conv&&conv.kind==='dm'&&conv.memberIds[0]===cw.pendingProfileMissionAgentId){cw.pendingProfileMissionAgentId=null;cwMissionModal();}}
  async function cwLoadProfileData(agentId,revision) {
    var cw=cwEnsure(),cache=cw.profileData||(cw.profileData={});cache[agentId]={loading:true};cwUpdateProfileData();
    var results=await Promise.allSettled([api('/api/cowork/agents/'+encodeURIComponent(agentId)+'/memory'),api('/api/connected-apps?agentId='+encodeURIComponent(agentId))]);
    if(!cw.profileOpen||cw.profileAgentId!==agentId||cw.profileRevision!==revision)return;
    var memory=results[0],apps=results[1];
    cache[agentId]={loading:false,entries:memory.status==='fulfilled'?memory.value.entries||[]:[],memoryError:memory.status==='rejected',apps:apps.status==='fulfilled'?apps.value:null,appsError:apps.status==='rejected'};
    if(apps.status==='fulfilled')cwSetAppConnectionState(agentId,apps.value);
    if(memory.status==='fulfilled')(cw.memoryCounts||(cw.memoryCounts={}))[agentId]=memory.value.count;
    cwUpdateProfileData();
  }
  function cwProfileData() { var cw=cwEnsure();return (cw.profileData||{})[cw.profileAgentId]||{loading:true,entries:[]}; }
  function cwConnectedProfileAccounts(data) {
    if(!data)return [];return (data.accounts||[]).concat(data.mail&&data.mail.accounts||[]).filter(function(account){return account.status==='ACTIVE'&&!account.disabled;}).filter(function(account,index,all){return all.findIndex(function(item){return item.id===account.id;})===index;});
  }
  function cwProfileAccountName(account,data) { var service=(data.services||[]).find(function(item){return item.slug===account.toolkit;});return service?service.name:({github:'GitHub',gmail:'Gmail',mail:'Mailbox',googledrive:'Google Drive',googlecalendar:'Google Calendar'}[account.toolkit]||cwActionWords(account.toolkit)); }
  function cwMemoryCategory(entry) { if(entry.type==='preference')return 'preferences';if(['project','project_fact'].indexOf(entry.type)>=0||/\bproject\b/i.test(entry.claim))return 'projects';if(['procedure','skill','success_pattern','task','episode','pattern','episodic','lesson'].indexOf(entry.type)>=0)return 'context';return 'facts'; }
  var CW_MEMORY_CATEGORIES=[['preferences','user','Preferences'],['projects','folder','Projects'],['context','clock','Long-term context'],['facts','file','Important facts']];
  function cwProfileCardHead(iconName,title,copy) {return '<div class="cw-card-heading">'+cwProfileIcon(iconName)+'<div><h2>'+esc(title)+'</h2><p>'+esc(copy)+'</p></div></div>';}
  function cwProfileSummary(section,iconName,title,copy,content) {return '<section class="cw-sky-card cw-summary-card" role="button" tabindex="0" data-profile-summary="'+section+'" aria-label="Open '+esc(title)+'">'+cwProfileCardHead(iconName,title,copy)+content+'</section>';}
  function cwProfileOverview(agent) {
    var traits=agent.personality&&agent.personality.traits||[],roles=agent.roles||[],registry=cwEnsure().skills||[],skills=(agent.skills||[]).map(function(name){return registry.find(function(skill){return skill.name===name;})||{name:name,missing:true};});
    var personality=cwProfileSummary('personality','heart','Personality',agent.personality&&agent.personality.communicationStyle||'Set the tone, habits, and instructions that guide your teammate.',traits.length?'<div class="cw-trait-list">'+traits.map(function(trait){return '<span>'+esc(trait)+'</span>';}).join('')+'</div>':'<p class="cw-empty">Make this teammate feel like yours.</p>');
    var role=cwProfileSummary('roles','user','Agent name and roles',agent.description||agent.tagline||'Give your teammate a clear purpose.',roles.length?'<div class="cw-sky-tiles cw-overview-roles">'+roles.map(function(role){return '<div class="cw-sky-tile">'+cwIcon(role.id===agent.primaryRoleId?'crown':'user')+'<span><strong>'+esc(role.name)+'</strong><small>'+esc(role.responsibilities||'No responsibilities added')+'</small></span></div>';}).join('')+'</div>':'<p class="cw-empty">No roles assigned. Add responsibilities here.</p>');
    var skill=cwProfileSummary('skills','spark','Skills','Capabilities from your shared skill library.',skills.length?'<div class="cw-sky-tiles">'+skills.slice(0,4).map(function(item){return '<div class="cw-sky-tile">'+cwIcon('terminal')+'<span><strong>'+esc(item.name)+'</strong><small>'+esc(item.missing?'Not in registry':item.description||'Assigned skill')+'</small></span></div>';}).join('')+'</div>':'<p class="cw-empty">Choose registered skills for this teammate.</p>');
    var memory=cwProfileSummary('memory','database','Memory','Private context that helps this teammate understand your work.','<div class="cw-sky-tiles" id="cwMemorySummary">'+CW_MEMORY_CATEGORIES.map(function(category){return '<div class="cw-sky-tile">'+cwIcon(category[1])+'<span><strong>'+category[2]+'</strong><small>Loading memories…</small></span></div>';}).join('')+'</div>');
    return '<div class="cw-overview-grid">'+personality+role+skill+memory+'</div><section class="cw-sky-card cw-connected-strip">'+cwProfileCardHead('link','Connected apps','Tools and services assigned to this teammate.')+'<div id="cwProfileConnected"><p class="cw-empty" role="status">Checking connections…</p></div></section>';
  }
  function cwProfileFormActions() { return '<div class="cw-form-actions"><p class="cw-form-error" id="cwProfileError" role="alert"></p><button class="btn dark" type="submit">'+cwIcon('check')+'Save changes</button></div>'; }
  function cwPersonalityPage(agent) { var p=agent.personality||{};return '<form id="cwPersonalityForm" class="cw-profile-form cw-sky-card"><div class="cw-form-columns"><div><label for="cwTraits">Personality traits</label><input id="cwTraits" value="'+esc((p.traits||[]).join(', '))+'" maxlength="420" placeholder="Focused, friendly, reliable"><small>Separate traits with commas. Choose up to ten.</small></div><div><label for="cwProactivity">Proactivity</label><select id="cwProactivity"><option value="reactive">Follow my lead</option><option value="suggest"'+(p.proactivity==='suggest'?' selected':'')+'>Suggest useful next steps</option></select><small>Suggestions follow the existing task permissions.</small></div></div><div><label for="cwCommunication">Communication style</label><textarea id="cwCommunication" maxlength="500" placeholder="Clear, concise, and warm…">'+esc(p.communicationStyle||'')+'</textarea></div><div><label for="cwInstructions">Behavioral instructions</label><textarea id="cwInstructions" class="cw-instructions" placeholder="How should this teammate approach its work?">'+esc(agent.systemPrompt||'')+'</textarea></div>'+cwProfileFormActions()+'</form>'; }
  function cwRoleRowHtml(role,primary) {return '<div class="cw-role-editor" data-role-id="'+esc(role.id)+'"><input type="radio" name="cwPrimaryRole" value="'+esc(role.id)+'" aria-label="Set this role as primary"'+(primary?' checked':'')+'><div><input data-role-title value="'+esc(role.name)+'" maxlength="60" aria-label="Role name" placeholder="Role name" required><textarea data-role-responsibilities maxlength="1000" aria-label="Responsibilities" placeholder="Responsibilities for this role">'+esc(role.responsibilities||'')+'</textarea></div><button type="button" class="btn" data-remove-role aria-label="Remove role">'+cwIcon('close')+'</button></div>'; }
  function cwRolesPage(agent) {return '<form id="cwRolesForm" class="cw-profile-form cw-sky-card"><div class="cw-form-columns"><div><label for="cwProfileName">Agent name</label><input id="cwProfileName" value="'+esc(agent.name)+'" maxlength="60" required></div><div><label for="cwProfileTagline">Short tagline</label><input id="cwProfileTagline" value="'+esc(agent.tagline||'')+'" maxlength="120"></div></div><div><label for="cwDescription">Description</label><textarea id="cwDescription" maxlength="600">'+esc(agent.description||'')+'</textarea></div><div><label>Assigned roles</label><p class="cw-empty">Select the primary role. Each role describes this teammate’s responsibilities.</p><div id="cwRoleRows" class="cw-profile-form">'+(agent.roles||[]).map(function(role){return cwRoleRowHtml(role,role.id===agent.primaryRoleId);}).join('')+'</div><button type="button" class="btn" id="cwAddRole" style="margin-top:12px">'+cwIcon('plus')+'Add role</button></div>'+cwProfileFormActions()+'</form>'; }
  function cwSkillsPage(agent) {
    var registry=cwEnsure().skills||[],assigned=agent.skills||[],missing=assigned.filter(function(name){return !registry.some(function(skill){return skill.name===name;});});
    return '<form id="cwSkillsForm" class="cw-profile-form"><div class="cw-connections-grid">'+registry.map(function(skill){return '<label class="cw-sky-card cw-skill-option"><input type="checkbox" data-profile-skill="'+esc(skill.name)+'"'+(assigned.indexOf(skill.name)>=0?' checked':'')+(skill.name==='browser-workflow'?' disabled':'')+'><span><h3>'+esc(skill.name)+'</h3><p>'+esc(skill.description||'No description supplied by this skill.')+'</p><small>'+esc(skill.name==='browser-workflow'?'Core skill ? always assigned':'Available in registry')+'</small><details><summary>Details</summary><p>Scope: '+esc(skill.scope||'Shared library')+'</p></details></span></label>';}).join('')+'</div>'+(!registry.length?'<div class="cw-sky-card cw-empty">No skills are registered yet. Create or install skills in Settings to assign them here.<br><button type="button" class="btn" id="cwSkillLibrary">Open skill settings</button></div>':'')+(missing.length?'<div class="cw-sky-card"><h3>Unavailable assignments</h3><p class="cw-empty">These saved skills are missing from the registry. Uncheck to remove an assignment.</p>'+missing.map(function(name){return '<label><input type="checkbox" data-profile-skill="'+esc(name)+'" checked> '+esc(name)+' — unavailable</label>';}).join('')+'</div>':'')+cwProfileFormActions()+'</form>';
  }
  function cwMemoryPage() {return '<div class="cw-memory-layout"><section class="cw-sky-card"><input class="cw-memory-search" id="cwMemorySearch" type="search" aria-label="Search memories" placeholder="Search this teammate’s memories"><div class="cw-memory-filters">'+[['all','','All']].concat(CW_MEMORY_CATEGORIES).map(function(category){return '<button class="btn" data-memory-filter="'+category[0]+'" aria-pressed="'+(category[0]==='all')+'">'+category[2]+'</button>';}).join('')+'</div><div class="cw-memory-list" id="cwMemoryList" aria-live="polite"></div></section><section class="cw-sky-card cw-memory-editor" id="cwMemoryDetail"><p class="cw-empty">Select a memory to read its source, make a correction, or archive it.</p></section></div>';}
  function cwRenderProfilePage() {
    var cw=cwEnsure(),agent=cwProfileAgent(),root=$('cwChat');if(!root||!agent)return;
    var section=CW_PROFILE_SECTIONS.some(function(item){return item[0]===cw.profileSection;})?cw.profileSection:'personality';cw.profileSection=section;
    var selected=section,heading=CW_PROFILE_SECTIONS.find(function(item){return item[0]===section;})[2];
    root.innerHTML=cwPageNavHtml('profile',agent)+'<button class="cw-profile-close" id="cwProfileClose" aria-label="Close profile and return to chat">'+cwIcon('close')+'</button><main class="cw-profile-page"><div class="cw-dashboard cw-settings-dashboard"><section class="cw-identity" aria-label="Agent identity"><button class="cw-identity-avatar" id="cwProfileAvatar" aria-label="Change '+esc(agent.name)+' avatar">'+cwAva(agent)+'</button><div><h1><button class="cw-name-edit" id="cwProfileNameEdit">'+esc(agent.name)+'</button></h1><button class="cw-identity-description" id="cwProfileDescriptionEdit">'+esc(agent.tagline||agent.description||'Your everyday teammate')+'</button>'+cwCharacterStatusHtml(agent,false)+'</div><div class="cw-identity-actions"><button class="btn" id="cwProfileSettings" aria-label="Agent settings" title="Agent settings">'+cwIcon('sliders')+'</button></div></section><section class="cw-sky-card cw-profile-task-row"><div><strong>Work with '+esc(agent.name)+'</strong><p>Give your teammate a task to work on.</p></div><button class="btn dark" id="cwProfileStart">'+cwIcon('play')+'Start Task</button></section><nav class="cw-profile-tabs" role="tablist" aria-label="Profile sections">'+CW_PROFILE_SECTIONS.map(function(item){return '<button role="tab" id="cwProfileTab-'+item[0]+'" data-profile-section="'+item[0]+'" aria-selected="'+(item[0]===selected)+'" tabindex="'+(item[0]===selected?0:-1)+'" aria-controls="cwProfileContent">'+cwProfileIcon(item[1])+'<span>'+item[2]+'</span></button>';}).join('')+'</nav><div id="cwProfileContent" role="tabpanel" aria-labelledby="cwProfileTab-'+selected+'"><div class="cw-detail-page"><div class="cw-detail-title"><div><h2>'+heading+'</h2><p>'+({personality:'How your teammate thinks, communicates, and helps.',roles:'A clear identity and purpose for your teammate.',skills:'Choose capabilities from the existing skill registry.',memory:'Search and manage this teammate?s private memories.',connections:'Apps with active access for this teammate.'}[section])+'</p></div></div>'+(section==='personality'?cwPersonalityPage(agent):section==='roles'?cwRolesPage(agent):section==='skills'?cwSkillsPage(agent):section==='memory'?cwMemoryPage():'<div id="cwProfileConnected"></div>')+'</div></div></div></main>';
    document.title=agent.name+' · Profile — Gitu';cwBindTopNav();$('cwInfoBtn').onclick=function(){cwOpenProfile(agent.id);};
    var buttons=Array.from(root.querySelectorAll('[data-profile-section]'));buttons.forEach(function(button,index){button.onclick=function(){cw.profileSection=button.dataset.profileSection;cwRenderProfilePage();$('cwProfileTab-'+cw.profileSection).focus({preventScroll:true});};button.onkeydown=function(event){var next;if(event.key==='ArrowRight')next=(index+1)%buttons.length;else if(event.key==='ArrowLeft')next=(index+buttons.length-1)%buttons.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=buttons.length-1;else return;event.preventDefault();cw.profileSection=buttons[next].dataset.profileSection;cwRenderProfilePage();$('cwProfileTab-'+cw.profileSection).focus();};});
    root.querySelectorAll('[data-profile-summary]').forEach(function(card){var open=function(){cw.profileSection=card.dataset.profileSummary;cwRenderProfilePage();};card.onclick=open;card.onkeydown=function(event){if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}};});
    $('cwProfileAvatar').onclick=$('cwProfileSettings').onclick=function(){cwAgentModal(agent);};$('cwProfileNameEdit').onclick=$('cwProfileDescriptionEdit').onclick=function(){cw.profileSection='roles';cwRenderProfilePage();};$('cwProfileStart').onclick=cwStartProfileTask;
    $('cwProfileClose').onclick=cwReturnToChat;
    cwBindProfileForms(agent);cwUpdateProfileData();cwSyncPanels();
  }
  async function cwSaveProfileFields(agent,fields,form) {
    var button=form.querySelector('[type=submit]'),error=$('cwProfileError');if(button.disabled)return;button.disabled=true;error.textContent='';
    try { var result=await api('/api/cowork/agents',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.assign({id:agent.id},fields))});var cw=cwEnsure();cw.agents=cw.agents.map(function(item){return item.id===result.agent.id?result.agent:item;});if(result.conversation)cw.convs=cw.convs.map(function(item){return item.id===result.conversation.id?result.conversation:item;});cwRenderRail();if(form.isConnected&&cw.profileOpen&&cw.profileAgentId===agent.id)cwRenderProfilePage();toast('Changes saved'); }
    catch(e){if(form.isConnected){error.textContent=cwProfileErrorText(e,'Could not save changes.');button.disabled=false;}}
  }
  function cwBindProfileForms(agent) {
    var form=$('cwPersonalityForm');if(form)form.onsubmit=function(event){event.preventDefault();cwSaveProfileFields(agent,{systemPrompt:$('cwInstructions').value,personality:{traits:$('cwTraits').value.split(',').map(function(trait){return trait.trim();}).filter(Boolean),communicationStyle:$('cwCommunication').value,proactivity:$('cwProactivity').value}},this);};
    form=$('cwRolesForm');if(form){var bindRemove=function(){form.querySelectorAll('[data-remove-role]').forEach(function(button){button.onclick=function(){button.closest('[data-role-id]').remove();};});};bindRemove();$('cwAddRole').onclick=function(){if(form.querySelectorAll('[data-role-id]').length>=8){toast('Choose up to eight roles.');return;}var id='role-'+Date.now().toString(36);$('cwRoleRows').insertAdjacentHTML('beforeend',cwRoleRowHtml({id:id,name:'',responsibilities:''},!form.querySelector('[name=cwPrimaryRole]:checked')));bindRemove();form.querySelector('[data-role-id="'+id+'"] [data-role-title]').focus();};form.onsubmit=function(event){event.preventDefault();var primary=form.querySelector('[name=cwPrimaryRole]:checked');cwSaveProfileFields(agent,{name:$('cwProfileName').value,tagline:$('cwProfileTagline').value,description:$('cwDescription').value,roles:Array.from(form.querySelectorAll('[data-role-id]')).map(function(row){return {id:row.dataset.roleId,name:row.querySelector('[data-role-title]').value,responsibilities:row.querySelector('[data-role-responsibilities]').value};}),primaryRoleId:primary?primary.value:''},this);};}
    form=$('cwSkillsForm');if(form)form.onsubmit=function(event){event.preventDefault();cwSaveProfileFields(agent,{skills:Array.from(this.querySelectorAll('[data-profile-skill]:checked')).map(function(input){return input.dataset.profileSkill;})},this);};if($('cwSkillLibrary'))$('cwSkillLibrary').onclick=function(){openSettings('skills');};
    var search=$('cwMemorySearch');if(search){search.oninput=cwRenderMemoryList;document.querySelectorAll('[data-memory-filter]').forEach(function(button){button.onclick=function(){cwEnsure().memoryFilter=button.dataset.memoryFilter;document.querySelectorAll('[data-memory-filter]').forEach(function(item){item.setAttribute('aria-pressed',String(item===button));});cwRenderMemoryList();};});}
  }
  function cwUpdateProfileData() {
    if(!cwEnsure().profileOpen)return;var agent=cwProfileAgent(),data=cwProfileData(),summary=$('cwMemorySummary');
    if(summary)summary.innerHTML=CW_MEMORY_CATEGORIES.map(function(category){var count=(data.entries||[]).filter(function(entry){return cwMemoryCategory(entry)===category[0];}).length;return '<div class="cw-sky-tile">'+cwIcon(category[1])+'<span><strong>'+category[2]+'</strong><small>'+esc(data.loading?'Loading…':data.memoryError?'Could not load memories':count+' '+(count===1?'memory':'memories'))+'</small></span></div>';}).join('');
    var connected=$('cwProfileConnected');if(connected){connected.innerHTML=cwProfileConnectionsHtml(agent,data);cwBindProfileConnections(agent,connected);}
    if($('cwMemoryList'))cwRenderMemoryList();
  }
  function cwProfileConnectionsHtml(agent,data) {
    if(data.loading)return '<p class="cw-empty" role="status">Checking assigned connections…</p>';
    if(data.appsError)return '<p class="cw-empty" role="alert">Could not check connections.</p><button class="btn" data-profile-retry>Try again</button>';
    var apps=data.apps||{},accounts=cwConnectedProfileAccounts(apps),detailed=cwEnsure().profileSection==='connections';
    if(!accounts.length)return '<div class="cw-empty"><strong>A little more connected.</strong><p>No apps are connected for '+esc(agent.name)+' yet. Choose the tools this teammate can use.</p><button class="btn dark" data-profile-manage>'+cwIcon('plus')+'Add connections</button></div>';
    var html=accounts.map(function(account){var name=cwProfileAccountName(account,apps),service=(apps.services||[]).find(function(item){return item.slug===account.toolkit;})||{slug:account.toolkit,name:name},permissions=(apps.appPermissions||[]).filter(function(permission){return permission.agentId===agent.id&&permission.accountId===account.id;});
      if(!detailed)return '<button class="cw-sky-tile" data-profile-connections>'+cwServiceIcon(service)+'<span><strong>'+esc(name)+'</strong><small class="cw-connected-label">● Connected</small></span>'+cwIcon('chevron')+'</button>';
      return '<article class="cw-sky-card cw-connection-card"><div class="cw-card-heading">'+cwServiceIcon(service)+'<div><h2>'+esc(name)+'</h2><p class="cw-connected-label">● Connected</p></div></div><p>Assigned account '+esc(account.id.slice(-8))+'. Actions follow your existing approval rules.</p>'+(permissions.length?'<details><summary>Always allowed capabilities</summary><ul>'+permissions.map(function(p){return '<li>'+esc(cwAppActionName(p.tool,p.service))+'</li>';}).join('')+'</ul></details>':'<p>No actions granted permanent approval.</p>')+'<div class="cw-form-actions"><button class="btn" data-profile-manage>Manage</button><button class="btn" data-profile-disconnect="'+esc(account.id)+'">Disconnect</button></div></article>';
    }).join('');return '<div class="'+(detailed?'cw-connections-grid':'cw-sky-tiles')+'">'+html+'</div><button class="btn" style="margin-top:12px" data-profile-manage>Manage connections '+cwIcon('chevron')+'</button>';
  }
  function cwBindProfileConnections(agent,root) {
    root.querySelectorAll('[data-profile-manage]').forEach(function(button){button.onclick=function(){cwOpenConnections(agent.id);};});root.querySelectorAll('[data-profile-connections]').forEach(function(button){button.onclick=function(){cwEnsure().profileSection='connections';cwRenderProfilePage();};});
    root.querySelectorAll('[data-profile-retry]').forEach(function(button){button.onclick=function(){var cw=cwEnsure();cwLoadProfileData(agent.id,++cw.profileRevision);};});
    root.querySelectorAll('[data-profile-disconnect]').forEach(function(button){button.onclick=async function(){if(button.disabled)return;button.disabled=true;try{await api('/api/connected-apps/disconnect',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({agentId:agent.id,accountId:button.dataset.profileDisconnect})});var cw=cwEnsure();cwLoadProfileData(agent.id,++cw.profileRevision);}catch(e){toast('Could not disconnect this account.',true);button.disabled=false;}};});cwBindServiceIcons(root);
  }
  function cwRenderMemoryList() {
    var list=$('cwMemoryList');if(!list)return;var cw=cwEnsure(),data=cwProfileData(),query=($('cwMemorySearch').value||'').toLowerCase(),filter=cw.memoryFilter||'all';
    var entries=(data.entries||[]).filter(function(entry){return (filter==='all'||cwMemoryCategory(entry)===filter)&&entry.claim.toLowerCase().indexOf(query)>=0;});
    list.innerHTML=data.loading?'<p class="cw-empty" role="status">Loading private memories…</p>':data.memoryError?'<p class="cw-empty" role="alert">Could not load memories.</p><button class="btn" id="cwMemoryRetry">Try again</button>':entries.length?entries.map(function(entry){return '<button class="cw-sky-tile" data-memory-id="'+esc(entry.id)+'" aria-pressed="'+(cw.memorySelectedId===entry.id)+'"><strong>'+esc(entry.claim)+'</strong><small>'+esc(entry.type)+' · '+esc(new Date(entry.updatedAt||entry.createdAt).toLocaleDateString())+'</small></button>';}).join(''):'<p class="cw-empty">'+(query||filter!=='all'?'No memories match this search.':'No private memories saved yet. Ask this teammate to remember something in chat.')+'</p>';
    if($('cwMemoryRetry'))$('cwMemoryRetry').onclick=function(){cwLoadProfileData(cw.profileAgentId,++cw.profileRevision);};
    list.querySelectorAll('[data-memory-id]').forEach(function(button){button.onclick=function(){cwOpenMemoryDetail(button.dataset.memoryId);};});
  }
  async function cwOpenMemoryDetail(id) {
    var cw=cwEnsure(),agent=cwProfileAgent(),revision=cw.profileRevision;cw.memorySelectedId=id;cwRenderMemoryList();var detail=$('cwMemoryDetail');detail.innerHTML='<p class="cw-empty" role="status">Loading memory details…</p>';
    try{var data=await api('/api/cowork/agents/'+encodeURIComponent(agent.id)+'/memory/'+encodeURIComponent(id));if(!cw.profileOpen||cw.profileAgentId!==agent.id||cw.profileRevision!==revision||cw.memorySelectedId!==id||!detail.isConnected)return;
      var entry=data.entry,redacted=/\[credential removed|\[.*redact|<browser__redacted/i.test(entry.claim);
      detail.innerHTML='<form id="cwMemoryEdit"><label for="cwMemoryClaim">Memory</label><textarea id="cwMemoryClaim" maxlength="4000" required'+(redacted?' readonly':'')+'>'+esc(entry.claim)+'</textarea>'+(redacted?'<p>Sensitive text is hidden. You can archive this memory.</p>':'')+'<p>'+esc(entry.status)+' · Updated '+esc(new Date(entry.updatedAt||entry.createdAt).toLocaleString())+'</p><details><summary>Source &amp; history</summary><p>'+esc(entry.sourceType||'Unknown source')+' · '+esc(entry.source||'Source not recorded')+'</p>'+(entry.evidence?'<p>'+esc(entry.evidence)+'</p>':'')+'<ul>'+(data.audit||[]).map(function(event){return '<li>'+esc(event.event)+' · '+esc(event.at||'')+(event.reason?' — '+esc(event.reason):'')+'</li>';}).join('')+'</ul></details><p role="alert" class="cw-form-error" id="cwMemoryError"></p><div class="cw-form-actions"><button class="btn" type="button" id="cwMemoryArchive">Archive</button><button class="btn dark" type="submit"'+(redacted?' disabled':'')+'>Save correction</button></div></form>';
      $('cwMemoryEdit').onsubmit=async function(event){event.preventDefault();var button=this.querySelector('[type=submit]');button.disabled=true;try{await api('/api/cowork/agents/'+encodeURIComponent(agent.id)+'/memory/'+encodeURIComponent(id),{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({claim:$('cwMemoryClaim').value,expectedUpdatedAt:entry.updatedAt})});cw.memorySelectedId=null;detail.innerHTML='<p class="cw-empty">Correction saved. The earlier entry remains in the audit history.</p>';cwLoadProfileData(agent.id,++cw.profileRevision);}catch(e){if(detail.isConnected){$('cwMemoryError').textContent=cwProfileErrorText(e,'Could not save this memory.');button.disabled=false;}}};
      $('cwMemoryArchive').onclick=async function(){this.disabled=true;try{await api('/api/cowork/agents/'+encodeURIComponent(agent.id)+'/memory/'+encodeURIComponent(id),{method:'DELETE'});cw.memorySelectedId=null;detail.innerHTML='<p class="cw-empty">Memory archived.</p>';cwLoadProfileData(agent.id,++cw.profileRevision);}catch(e){toast('Could not archive this memory.',true);if(this.isConnected)this.disabled=false;}};
    }catch(e){if(detail.isConnected)detail.innerHTML='<p class="cw-empty" role="alert">Could not open this memory. Refresh the page to try again.</p>';}
  }
`;
