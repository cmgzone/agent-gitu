/** Full-page discovery keeps the live conversation mounted beneath it. */
export const WORKSPACE_SEARCH_CSS = String.raw`
  :root { --brand-blue:#226bd6; --brand-on-blue:#fff; }
  :is(#view,#settings,#workspaceSearch,.cw-modal,.cw-desktop-dialog) :is(button.on,button.cur,button.active,button.sel,button[aria-selected=true],button[aria-pressed=true]):not(.toggle):not([role=switch]):not(.cw-colors button),
  :is(#cw,.home-sky,.run-chat) .cw-top-nav button[aria-pressed=true],.cw-settings-dashboard .cw-profile-tabs button[aria-selected=true],.cw-settings-dashboard .cw-memory-filters [aria-pressed=true],.cw-settings-dashboard .btn.dark {
    background:var(--brand-blue)!important; color:var(--brand-on-blue)!important;
  }
  :is(#view,#settings,#workspaceSearch) :is(button[aria-selected=true],button[aria-pressed=true],button.cur):not(:disabled):hover { background:color-mix(in srgb,var(--brand-blue) 90%,#000)!important; }
  :is(#view,#settings,.cw-modal,.cw-desktop-dialog) .btn.dark { background:var(--brand-blue)!important; color:var(--brand-on-blue)!important; }
  .cw-chat-face .cw-ava { width:30px; height:34px; border-radius:0; overflow:visible; background:transparent!important; }
  .cw-chat-face .cw-ava img { position:static; width:100%; height:100%; max-width:100%; left:auto; top:auto; object-fit:contain; transform:none; }
  .workspace-search-trigger,.home-settings-trigger { position:absolute; top:18px; left:16px; z-index:11; display:grid; place-items:center; width:38px; height:38px; padding:0; border-radius:50%; color:var(--muted); }
  .workspace-search-trigger svg,.home-settings-trigger svg { width:20px; height:20px; }
  .home-settings-trigger { left:auto; right:16px; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) { background:color-mix(in srgb,var(--overlay) 30%,transparent); backdrop-filter:blur(14px) saturate(.9); -webkit-backdrop-filter:blur(14px) saturate(.9); padding:24px; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) .box { width:min(560px,100%); max-height:min(88dvh,calc(100dvh - 48px)); border-radius:28px; background:var(--cw-chat-surface); border:1px solid color-mix(in srgb,var(--border2) 65%,transparent); box-shadow:inset 0 1px 0 #ffffff35,0 24px 80px -24px #15345066; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) .bar { padding:22px 24px 12px; border:0; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) .bar > span:first-child { font-size:18px; font-weight:600; letter-spacing:-.025em; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) .cw-body { padding:0 24px 22px; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) label { font-size:12px; font-weight:500; text-transform:none; letter-spacing:0; color:var(--text); margin:16px 0 8px; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) :is(input[type=text],input[type=password],textarea,select) { background:color-mix(in srgb,var(--card) 78%,transparent); border-color:color-mix(in srgb,var(--border2) 70%,transparent); border-radius:14px; padding:12px 14px; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) :is(input,textarea,select):focus { border-color:var(--brand-blue); box-shadow:0 0 0 3px color-mix(in srgb,var(--brand-blue) 12%,transparent); }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) .cw-note { color:var(--text); font-size:12px; line-height:1.6; margin-top:16px; }
  .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) .cw-foot { padding:0 24px 22px; border:0; background:transparent; }
  @media(max-width:600px) { .modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) { padding:16px; }.modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) .box { max-height:min(88dvh,calc(100dvh - 32px)); }.modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) .bar { padding:18px 18px 10px; }.modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) .cw-body { padding:0 18px 18px; }.modal.cw-modal:not(.cw-agent-editor):not(.cw-doc-modal) .cw-foot { padding:0 18px 18px; } }
  body:has(.run-chat) .sb { display:none!important; }
  .workspace-search { position:fixed; inset:0; z-index:70; overflow:auto; color:var(--text); background:var(--cw-chat-surface); overscroll-behavior:contain; }
  .workspace-search::before { content:''; position:fixed; inset:0; pointer-events:none; background:radial-gradient(ellipse at 50% 25%,color-mix(in srgb,var(--run) 18%,transparent),transparent 55%); }
  .workspace-search-close,.settings-close { position:absolute; top:20px; right:24px; width:42px; height:42px; display:grid; place-items:center; border-radius:50%; color:var(--muted); padding:0; }
  .workspace-search-close svg,.settings-close svg { width:21px; height:21px; }
  .workspace-search-main { position:relative; width:min(780px,100%); margin:0 auto; padding:clamp(110px,20vh,180px) 24px 56px; }
  .ws-context { color:var(--muted); font-size:11px; letter-spacing:.1em; text-transform:uppercase; margin:0 12px 12px; }
  .ws-search-field { display:flex; align-items:center; gap:12px; width:100%; min-height:60px; padding:0 20px; border:1px solid color-mix(in srgb,var(--border2) 65%,transparent); border-radius:999px; background:color-mix(in srgb,var(--card) 56%,transparent); backdrop-filter:blur(28px) saturate(1.15); -webkit-backdrop-filter:blur(28px) saturate(1.15); box-shadow:inset 0 1px 0 #ffffff30,0 14px 40px -22px #17334e44; }
  .ws-search-field:focus-within { border-color:var(--brand-blue); box-shadow:0 0 0 3px color-mix(in srgb,var(--brand-blue) 12%,transparent); }
  .ws-search-field > svg { width:20px; height:20px; flex:none; color:var(--muted); }
  :is(#workspaceSearch,#settings) .ws-search-field input[type=search] { flex:1; min-width:0; border:0; border-radius:0; background:transparent; padding:16px 0; font-size:16px; min-height:58px; outline:none; box-shadow:none; color:var(--text); }
  .ws-search-field input::placeholder { color:var(--muted); }
  .ws-search-field kbd { font:10px var(--font); color:var(--muted); border:1px solid var(--border2); border-radius:6px; padding:4px 6px; }
  .ws-filters { display:flex; flex-wrap:wrap; gap:5px; margin:18px 0 24px; }
  .ws-filters button { min-height:34px; padding:7px 13px; border-radius:999px; color:var(--muted); font:inherit; font-size:12px; }
  .ws-status { color:var(--muted); font-size:12px; margin:0 12px 18px; }
  .ws-group { margin:24px 0; }
  .ws-group h2 { display:flex; justify-content:space-between; font-size:12px; font-weight:500; color:var(--muted); margin:0 12px 10px; }
  .ws-result-list { padding:4px; background:color-mix(in srgb,var(--card) 60%,transparent); border:1px solid color-mix(in srgb,var(--border2) 45%,transparent); border-radius:24px; backdrop-filter:blur(22px); -webkit-backdrop-filter:blur(22px); }
  .ws-result { display:flex; align-items:center; gap:4px; min-width:0; }
  .ws-result + .ws-result { border-top:1px solid color-mix(in srgb,var(--border) 60%,transparent); }
  .ws-result-action { display:flex; align-items:center; gap:14px; flex:1; min-width:0; padding:14px 16px; border-radius:19px; text-align:left; color:var(--text); }
  .ws-result-icon { display:grid; place-items:center; width:40px; height:40px; flex:none; border-radius:13px; background:color-mix(in srgb,var(--run) 10%,var(--card)); color:var(--run); }
  .ws-result-icon > svg { width:19px; height:19px; }
  .ws-result-icon .cw-ava { width:40px; height:40px; background:transparent!important; }
  .ws-result-copy { display:flex; flex-direction:column; min-width:0; gap:5px; }
  .ws-result-copy strong { font-size:14px; font-weight:500; overflow-wrap:anywhere; }
  .ws-result-copy small { color:var(--muted); font-size:12px; line-height:1.4; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
  .ws-aux { color:var(--muted); flex:none; padding:10px; margin-right:5px; border-radius:999px; font-size:11px; }
  .ws-aux svg { width:16px; height:16px; }
  .ws-empty { padding:30px 16px; text-align:center; color:var(--muted); font-size:13px; line-height:1.6; }
  .ws-more { display:block; margin:12px auto 0; padding:10px 16px; font-size:12px; color:var(--run); border-radius:999px; }
  .settings { display:block; overflow:auto; background:var(--cw-chat-surface); color:var(--text); padding:90px 24px 40px; }
  .settings .setnav { width:min(920px,100%); margin:0 auto 28px; display:flex; flex-wrap:wrap; gap:5px; padding:7px; border:1px solid color-mix(in srgb,var(--border2) 40%,transparent); border-radius:26px; background:color-mix(in srgb,var(--card) 60%,transparent); overflow:visible; backdrop-filter:blur(24px); -webkit-backdrop-filter:blur(24px); }
  .settings .setnav .sect { display:none; }
  .settings .setnav .item,.settings .setnav .back { display:flex; align-items:center; gap:7px; width:auto; padding:9px 12px; border-radius:999px; margin:0; font-size:12px; min-height:36px; }
  .settings .setbody { max-width:780px; margin:0 auto; overflow:visible; padding:0 0 24px; }
  .settings .setbody h1 { font-size:26px; letter-spacing:-.04em; }
  .settings .setbody h2 { font-size:13px; }
  .settings .setcard,.settings .appearance-card { border-radius:24px; background:color-mix(in srgb,var(--card) 70%,transparent); border-color:color-mix(in srgb,var(--border2) 45%,transparent); backdrop-filter:blur(20px); -webkit-backdrop-filter:blur(20px); }
  .settings .setrow { padding:20px; }
  .settings .setlist { padding:20px; }
  .settings .setbody :is(input:not([type=checkbox]):not([type=radio]),textarea,select) { border-radius:12px; }
  .settings .btn.dark { background:var(--brand-blue)!important; color:var(--brand-on-blue)!important; }
  .settings.settings-directory { padding-top:clamp(110px,20vh,180px); }
  .settings-directory .setnav { display:none; }
  .settings-directory h1 { text-align:center; margin-bottom:28px; }
  .settings-directory .ws-context { text-align:center; }
  .settings-directory .ws-result-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:3px; }
  .settings-directory .ws-result + .ws-result { border-top:0; }
  .settings-top-back { position:absolute; top:22px; left:22px; display:flex; align-items:center; gap:8px; color:var(--muted); font-size:12px; padding:10px; border-radius:999px; }
  .settings-top-back svg { width:18px; height:18px; }
  @media(max-width:600px) { .workspace-search-main { padding:112px 16px 32px; }.ws-search-field { min-height:54px; padding:0 16px; }.ws-search-field input[type=search] { font-size:14px; }.ws-search-field kbd { display:none; }.ws-result-action { padding:12px; gap:10px; }.ws-aux { padding:8px; }.settings { padding:82px 16px 28px; }.settings .setnav { flex-wrap:nowrap; overflow-x:auto; border-radius:999px; }.settings .setnav .item { flex:none; white-space:nowrap; }.settings-directory .ws-result-list { grid-template-columns:1fr; }.settings .setrow { flex-wrap:wrap; }.settings .setrow .grow { min-width:180px; }.workspace-search-close,.settings-close { right:14px; top:16px; } }
  @media(prefers-reduced-motion:reduce) { .workspace-search,.settings { animation:none!important; } }
`;

export const WORKSPACE_SEARCH_JS = String.raw`
  var workspaceSearchState=null;
  var WORKSPACE_SETTINGS=[
    ['general','gear','General','Appearance, defaults, reasoning, and autonomy'],['cowork','users','Cowork','Team preferences, learning, and skill approvals'],
    ['providers','layers','Providers','Models, API keys, and provider accounts'],['connections','plug','Connections','Apps, accounts, and service permissions'],
    ['permissions','shield','Permissions','Workspace access and action approvals'],['workspace','folder','Workspace','Project locations, files, and constraints'],
    ['project','search','Project','Inspect your current project'],['agents','users','Specialist agents','Coding specialists and orchestration'],
    ['skills','bolt','Skills','Find, create, and manage reusable skills'],['mcp','plug','MCP servers','Tools and server connections'],
    ['cron','clock','Schedules','Scheduled tasks and recurring heartbeats'],['developer','gear','Developer','Diagnostics and development preferences']
  ];
  function wsNormalize(value) {return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
  function wsIcon(name) {return icon(name)||cwIcon(name)||actionSvg(name);}
  function wsFilter(items,query,category) {
    var terms=wsNormalize(query).trim().split(/\s+/).filter(Boolean);
    return items.filter(function(item){var text=wsNormalize(item.title+' '+item.detail+' '+(item.keywords||''));return (!category||category==='all'||item.category===category)&&terms.every(function(term){return text.indexOf(term)>=0;});});
  }
  function wsSettingsItems() {return WORKSPACE_SETTINGS.map(function(item){return {category:'Settings',title:item[2],detail:item[3],icon:item[1],action:'settings',id:item[0]};});}
  function wsBuildItems(mode,data) {
    var items=wsSettingsItems(),cw=cwEnsure();
    function item(category,title,detail,icon,action,id,extra){items.push(Object.assign({category:category,title:title,detail:detail,icon:icon,action:action,id:id},extra||{}));}
    if(mode==='main') {
      item('Tools','New session','Start a conversation in your selected project','plus','new-session');
      item('Tools','New project','Create a space for your next idea','folder','new-project');
      item('Tools','Browser','Browse websites with the main agent','globe','tool','browser');
      item('Tools','Git','Review changes, branches, and commits','branch','tool','git');
      item('Tools','Cowork','Work with your agent team','users','cowork');
      if(S.active!=='home'&&S.active!=='cowork'){item('Tools','Task details','Plan, approvals, verification, and progress','layers','tool','state');item('Tools','Files and details','Artifacts and changed files for this session','folder','tool','files');}
      (data.runs||[]).forEach(function(run){item('Sessions',sessionTitle(run.goal),[run.project,run.status,shortDate(run.startedAt)].filter(Boolean).join(' · '),'chat','run',run.runId,{run:run,keywords:run.goal,aux:'delete-run'});});
      homeBuildProjects(data.projects||[],data.runs||[],effectiveProjectPath()).forEach(function(project){item('Projects',project.name,project.sessions.length+' conversations','folder','project',project.path,{project:project});});
    } else {
      item('Tools','Create agent','Choose a character, purpose, personality, and tools','plus','new-agent');
      item('Tools','New group chat','Bring teammates together','users','new-group');
      item('Tools','Connections','Manage apps and accounts for your team','plug','connections');
      item('Tools','Learning mode','Memory, team preferences, and skill approvals','bolt','settings','cowork');
      item('Tools','Lock app','Require authentication before returning','lock','lock');
      item('Tools','Main agent','Return to your coding workspace','terminal','home');
      (data.agents||[]).forEach(function(agent){item('Agents',agent.name,agent.tagline||agent.description||'AI teammate','users','agent',agent.id,{agent:agent,aux:'profile',keywords:agent.description});});
      (data.conversations||[]).forEach(function(conv){item('Chats',conv.title||'Conversation',conv.kind==='group'?'Group conversation':'Agent conversation','chat','conversation',conv.id);if(conv.schedule&&conv.schedule.enabled)item('Schedules',conv.title+' follow-up','Every '+conv.schedule.every,'clock','conversation-schedule',conv.id);});
      if(cwActiveConv()) {
        item('Tools','New thread','A separate topic in the current conversation','plus','new-thread');
        item('Tools','New mission','Give the current agent a task to finish','target','mission');
        item('Tools','Tag folder','Give this conversation folder context','folder','tag-folder');
        item('Tools','Schedule this chat','Configure recurring messages','clock','schedule');
        item('Tools','New widget','Pin a useful panel to this conversation','panel','new-widget');
        (cw.threads||[]).forEach(function(thread){item('Chats',thread.title,thread.topic||'Thread in '+cwActiveConv().title,'chat','thread',thread.id);});
        cwNowCards().forEach(function(card){item(card.kind==='schedule'?'Schedules':'Activity',card.title,card.detail,card.icon,'now',card.id,{card:card});});
      }
    }
    (data.skills||[]).forEach(function(skill){item('Skills',skill.name,skill.description||'Reusable agent skill','bolt','skill',skill.name);});
    if(mode==='main')(data.jobs||[]).forEach(function(job){item('Schedules',job.goal,'Every '+job.every,'clock','job',job.id);});
    return items;
  }
  function wsClose(refocus) {
    var state=workspaceSearchState;if(!state)return;
    workspaceSearchState=null;clearTimeout(state.timer);state.revision++;
    var page=$('workspaceSearch');if(page)page.remove();
    state.surfaces.forEach(function(surface){if(surface.node.isConnected)surface.node.inert=surface.inert;});
    document.body.classList.remove('workspace-search-open');document.title=state.title;
    if(refocus!==false&&state.focus&&state.focus.isConnected&&state.focus.focus)state.focus.focus({preventScroll:true});
  }
  function wsOpen(mode) {
    if(workspaceSearchState){$('workspaceSearchInput').focus();return;}
    if(typeof cwSaveDraft==='function')cwSaveDraft();
    var state={mode:mode||((S.active==='cowork')?'cowork':'main'),query:'',category:'all',items:[],hits:[],limit:8,loading:true,failures:[],revision:0,timer:null,focus:document.activeElement,title:document.title,surfaces:[]};
    ['shell','settings'].forEach(function(name){var node=name==='shell'?document.querySelector('.shell'):$('settings');if(node){state.surfaces.push({node:node,inert:node.inert});node.inert=true;}});
    workspaceSearchState=state;document.title='Search — Gitu';document.body.classList.add('workspace-search-open');
    var page=document.createElement('section');page.id='workspaceSearch';page.className='workspace-search';page.setAttribute('role','dialog');page.setAttribute('aria-modal','true');page.setAttribute('aria-labelledby','workspaceSearchTitle');
    page.innerHTML='<button class="workspace-search-close" id="workspaceSearchClose" aria-label="Close search">'+icon('x')+'</button><main class="workspace-search-main"><h1 id="workspaceSearchTitle" class="cw-visually-hidden">Search '+(state.mode==='cowork'?'Cowork':'main agent')+'</h1><p class="ws-context">'+(state.mode==='cowork'?'Your team, tools, and conversations':'Your projects, tools, and conversations')+'</p><label class="ws-search-field">'+icon('search')+'<input id="workspaceSearchInput" type="search" autocomplete="off" placeholder="'+(state.mode==='cowork'?'Search agents, chats, skills, and tools…':'Search sessions, skills, schedules, and tools…')+'" aria-label="Search workspace"><kbd>Esc</kbd></label><div class="ws-filters" id="workspaceSearchFilters" aria-label="Search categories"></div><p class="ws-status" id="workspaceSearchStatus" role="status" aria-live="polite"></p><div id="workspaceSearchResults"></div></main>';
    document.body.appendChild(page);$('workspaceSearchClose').onclick=function(){wsClose();};
    var input=$('workspaceSearchInput');input.oninput=function(){state.query=input.value;state.limit=8;state.hits=[];state.recallFailed=false;state.revision++;clearTimeout(state.timer);wsRender(state);if(state.mode==='cowork'&&state.query.trim().length>=2)state.timer=setTimeout(function(){wsRecall(state);},300);};
    page.onkeydown=function(event){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();wsClose();return;}
      if(event.key==='ArrowDown'&&event.target===input){var first=page.querySelector('.ws-result-action');if(first){event.preventDefault();first.focus();}}
      if(event.key==='Tab'){var controls=Array.from(page.querySelectorAll('button:not(:disabled),input'));var first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
    };
    if(page.animate&&!chatMotionReduced())page.animate([{opacity:0,filter:'blur(5px)'},{opacity:1,filter:'blur(0)'}],{duration:280,easing:'cubic-bezier(.16,1,.3,1)'});
    input.focus({preventScroll:true});wsRender(state);wsLoad(state);
  }
  async function wsLoad(state) {
    var loadRevision=state.loadRevision=(state.loadRevision||0)+1;
    var routes=state.mode==='cowork'?[['agents','/api/cowork/agents'],['conversations','/api/cowork/conversations']]:[['runs','/api/runs'],['projects','/api/projects'],['skills','/api/skills'],['jobs','/api/cron']];
    var results=await Promise.allSettled(routes.map(function(route){return api(route[1]);}));if(workspaceSearchState!==state||state.loadRevision!==loadRevision)return;
    var data={};state.failures=[];results.forEach(function(result,index){var key=routes[index][0];if(result.status==='rejected'){state.failures.push(key);return;}var value=result.value;
      if(key==='agents'){data.agents=value.agents||[];data.skills=value.availableSkills||[];var cw=cwEnsure();cw.agents=data.agents;cw.skills=data.skills;}
      else if(key==='runs')data.runs=Array.isArray(value)?value:[];
      else data[key]=value[key]||[];
    });
    if(state.mode==='cowork'&&data.conversations)cwEnsure().convs=data.conversations;
    state.items=wsBuildItems(state.mode,data);state.loading=false;wsRender(state);
  }
  async function wsRecall(state) {
    var revision=state.revision,query=state.query.trim();
    try{var data=await api('/api/cowork/search?q='+encodeURIComponent(query)+'&limit=20');if(workspaceSearchState!==state||state.revision!==revision)return;
      state.hits=(data.hits||[]).map(function(hit){return {category:'Messages',title:hit.conversationTitle||'Conversation',detail:hit.snippet||'',icon:'chat',action:'conversation',id:hit.conversationId,threadId:hit.threadId};});wsRender(state);
    }catch(e){if(workspaceSearchState===state&&state.revision===revision){state.recallFailed=true;wsRender(state);}}
  }
  function wsRender(state) {
    if(workspaceSearchState!==state)return;
    var filters=state.mode==='cowork'?['all','Agents','Chats','Tools','Skills','Schedules','Activity','Settings','Messages']:['all','Sessions','Projects','Tools','Skills','Schedules','Settings'];
    $('workspaceSearchFilters').innerHTML=filters.map(function(filter){return '<button data-ws-filter="'+filter+'" aria-pressed="'+(state.category===filter)+'">'+(filter==='all'?'All':filter)+'</button>';}).join('');
    $('workspaceSearchFilters').querySelectorAll('[data-ws-filter]').forEach(function(button){button.onclick=function(){state.category=button.dataset.wsFilter;state.limit=30;wsRender(state);var next=$('workspaceSearchFilters').querySelector('[data-ws-filter="'+state.category+'"]');if(next)next.focus();};});
    var base=wsFilter(state.items,state.query,state.category),hits=(!state.category||state.category==='all'||state.category==='Messages')?state.hits:[],items=base.concat(hits);
    state.rendered=items;
    var groups=new Map();items.forEach(function(item,index){if(!groups.has(item.category))groups.set(item.category,[]);groups.get(item.category).push({item:item,index:index});});
    var order=state.mode==='cowork'?['Tools','Agents','Chats','Messages','Activity','Skills','Schedules','Settings']:['Tools','Sessions','Projects','Skills','Schedules','Settings'];
    $('workspaceSearchStatus').textContent=state.loading?'Loading your workspace…':state.failures.length?'Some '+state.failures.join(', ')+' could not load. You can retry.':state.recallFailed?'Message search is unavailable. Other results are still available.':state.query?items.length+' result'+(items.length===1?'':'s'):'';
    var html=order.filter(function(group){return groups.has(group);}).map(function(group){var rows=groups.get(group);return '<section class="ws-group"><h2>'+group+'<span>'+rows.length+'</span></h2><div class="ws-result-list">'+rows.slice(0,state.limit).map(function(row){var item=row.item;return '<div class="ws-result"><button class="ws-result-action" data-ws-result="'+row.index+'"><span class="ws-result-icon" aria-hidden="true">'+(item.agent?cwAva(item.agent):wsIcon(item.icon))+'</span><span class="ws-result-copy"><strong>'+esc(item.title)+'</strong><small>'+esc(item.detail)+'</small></span></button>'+(item.aux?'<button class="ws-aux" data-ws-aux="'+row.index+'" aria-label="'+esc(item.aux==='profile'?'Profile for '+item.title:'Delete session '+item.title)+'">'+(item.aux==='profile'?'Profile':actionSvg('trash'))+'</button>':'')+'</div>';}).join('')+'</div>'+(rows.length>state.limit?'<button class="ws-more" data-ws-more="'+group+'">Show '+(rows.length-state.limit)+' more</button>':'')+'</section>';}).join('');
    if(!items.length&&!state.loading)html='<div class="ws-empty">No matches. Try a session title, agent name, skill, or setting.</div>';
    if(state.failures.length)html='<button class="btn" id="workspaceSearchRetry">'+icon('retry')+'Retry loading</button>'+html;
    var target=$('workspaceSearchResults');target.innerHTML=html;
    target.querySelectorAll('[data-ws-result]').forEach(function(button){button.onclick=function(){wsActivate(state.rendered[Number(button.dataset.wsResult)]);};});
    target.querySelectorAll('[data-ws-more]').forEach(function(button){button.onclick=function(){state.limit+=30;wsRender(state);};});
    target.querySelectorAll('[data-ws-aux]').forEach(function(button){button.onclick=function(){var item=state.rendered[Number(button.dataset.wsAux)];if(item.aux==='profile')wsActivate({action:'profile',id:item.id});else wsDeleteRun(state,item,button);};});
    if($('workspaceSearchRetry'))$('workspaceSearchRetry').onclick=function(){state.loading=true;wsRender(state);wsLoad(state);};
  }
  function wsDeleteRun(state,item,button) {
    if(button.dataset.confirmDelete!=='true'){button.dataset.confirmDelete='true';button.textContent='Delete?';button.setAttribute('aria-label','Confirm deleting '+item.title);return;}
    button.disabled=true;api('/api/runs/'+encodeURIComponent(item.id),{method:'DELETE'}).then(function(){
      if(S.active===item.id){wsClose(false);openHome();return;}if(workspaceSearchState!==state)return;
      state.items=state.items.filter(function(result){return result.action!=='run'||result.id!==item.id;});renderSidebar();wsRender(state);wsLoad(state);
    }).catch(function(error){if(button.isConnected){button.disabled=false;button.dataset.confirmDelete='false';button.textContent='Retry';}toast(error.message,true);});
  }
  function wsActivate(item) {
    if(!item)return;wsClose(false);
    if($('settings')&&!$('settings').hidden)closeSettings();
    if(item.action==='run'){S.lastProjectPath=item.run.projectPath||S.lastProjectPath;openRun(item.id,{chatish:item.run.mode==='chat',mode:item.run.mode});}
    else if(item.action==='new-session'||item.action==='home'){if(S.active==='cowork')cwExit();else openHome();}
    else if(item.action==='new-project')newProject();
    else if(item.action==='project'){homeSelectProject(item.project);openHome();}
    else if(item.action==='tool')openToolPanel(item.id);
    else if(item.action==='settings')openSettings(item.id);
    else if(item.action==='skill'){S.skillQuery=item.id;openSettings('skills');}
    else if(item.action==='job')openSettings('cron');
    else if(item.action==='cowork')openCowork();
    else if(item.action==='agent')cwOpenDm(item.id);
    else if(item.action==='profile')cwOpenProfile(item.id);
    else if(item.action==='conversation')cwOpenConv(item.id,item.threadId);
    else if(item.action==='thread')cwSwitchThread(item.id);
    else if(item.action==='new-agent')cwAgentModal(null);
    else if(item.action==='new-group')cwGroupModal();
    else if(item.action==='connections')cwOpenConnections();
    else if(item.action==='lock')cwLockApp();
    else if(item.action==='new-thread')cwNewThreadModal();
    else if(item.action==='mission')cwMissionModal(cwActiveConv());
    else if(item.action==='tag-folder')cwFolderModal(cwActiveConv());
    else if(item.action==='schedule')cwScheduleModal(cwActiveConv());
    else if(item.action==='conversation-schedule'){cwOpenConv(item.id);cwScheduleModal(cwActiveConv());}
    else if(item.action==='new-widget')cwNewWidgetModal(cwActiveConv());
    else if(item.action==='now')cwNowAction(item.card.kind,item.card.id);
  }
  function wsSettingsDirectory() {
    var body=$('setbody');body.innerHTML='<p class="ws-context">Make Gitu yours</p><h1>Settings</h1><label class="ws-search-field">'+icon('search')+'<input type="search" id="settingsDirectoryQuery" aria-label="Search settings" placeholder="Search settings, tools, and preferences…"></label><div id="settingsDirectoryResults"></div>';
    var input=$('settingsDirectoryQuery');
    function render(){var items=wsFilter(wsSettingsItems(),input.value,'all'),target=$('settingsDirectoryResults');target.innerHTML='<section class="ws-group"><h2>Preferences and tools</h2><div class="ws-result-list">'+items.map(function(item){return '<div class="ws-result"><button class="ws-result-action" data-setting="'+item.id+'"><span class="ws-result-icon">'+icon(item.icon)+'</span><span class="ws-result-copy"><strong>'+esc(item.title)+'</strong><small>'+esc(item.detail)+'</small></span></button></div>';}).join('')+'</div>'+(items.length?'':'<p class="ws-empty">No matching settings.</p>')+'</section>';target.querySelectorAll('[data-setting]').forEach(function(button){button.onclick=function(){openSettings(button.dataset.setting);};});}
    input.oninput=render;render();
  }
`;
