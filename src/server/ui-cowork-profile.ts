export const COWORK_PROFILE_CSS = String.raw`
  .cw-info-bar { justify-content:flex-end; border-bottom:0; margin-bottom:2px; padding-block:6px; background:transparent; backdrop-filter:none; }
  .cw-profile-hero { gap:12px; padding:0 0 18px; border-bottom:1px solid var(--border); margin-bottom:8px; }
  .cw-profile-portrait { width:112px; height:112px; border-radius:50%; }
  .cw-profile-name { font-size:23px; letter-spacing:-.03em; }
  .cw-profile-identity .cw-profile-presence { margin:9px 0 0; }
  .cw-profile-presence .cw-persona-status { font-size:10px; padding:4px 7px; gap:4px; line-height:1.4; }
  .cw-profile-presence .cw-persona-status[data-active=false]::before { background:var(--ok); opacity:1; }
  .cw-profile-edit { justify-content:flex-start; min-height:42px; padding:9px 8px; margin:0; gap:10px; font-weight:550; }
  .cw-profile-edit > span { flex:1; text-align:left; }
  .cw-profile-edit > .cw-profile-chevron { flex:none; width:14px; height:14px; display:grid; place-items:center; transform:rotate(-90deg); color:var(--muted); }
  .cw-profile-apps { padding-bottom:20px; }
  .cw-profile-tools { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; margin:6px 0 12px; }
  .cw-profile-tools button.cw-profile-tool { min-width:0; min-height:72px; padding:9px 4px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; color:var(--text); font:inherit; font-size:10.5px; border-radius:11px; background:color-mix(in srgb,var(--hover) 65%,transparent) !important; border:1px solid color-mix(in srgb,var(--border) 65%,transparent) !important; box-shadow:none; transition:color .16s ease,background-color .16s ease,transform .12s ease; }
  .cw-profile-tools button.cw-profile-tool:hover { background:var(--hover) !important; color:var(--accent); }
  .cw-profile-tools button.cw-profile-tool[aria-selected=true] { background:color-mix(in srgb,var(--accent) 7%,var(--bg)) !important; border-color:color-mix(in srgb,var(--accent) 45%,var(--border)) !important; color:var(--accent); }
  .cw-profile-tool > span:last-child { max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cw-profile-tool-icon { width:27px; height:27px; display:grid; place-items:center; flex:none; color:var(--accent); }
  .cw-profile-tool-icon > svg { width:25px; height:25px; stroke-width:1.6; }
  .cw-profile-tool-icon .cw-service-symbol { width:28px; height:28px; border-radius:7px; background:transparent; }
  .cw-profile-tool-icon .cw-service-symbol .cw-fav,.cw-profile-tool-icon .cw-service-logo { width:25px; height:25px; }
  .cw-profile-tool-icon .cw-tool-ico { width:25px; height:25px; }
  .cw-profile-context { padding:12px; border:1px solid var(--border); border-radius:12px; background:color-mix(in srgb,var(--card) 35%,transparent); }
  .cw-profile-context.is-switching { animation:cw-profile-context-in .16s ease both; }
  .cw-profile-context-head { display:flex; align-items:center; gap:10px; }
  .cw-profile-context-head > div { flex:1; min-width:0; }
  .cw-profile-context-head strong { display:block; font-size:12px; font-weight:600; }
  .cw-profile-context-status { display:block; margin-top:3px; color:var(--muted); font-size:10px; }
  .cw-profile-context-status.connected { color:var(--ok); }
  .cw-profile-context p { margin:10px 0 0; color:var(--muted); font-size:11.5px; line-height:1.6; }
  .cw-profile-context button { display:grid; place-items:center; width:28px; height:28px; color:var(--muted); }
  .cw-profile-context button svg { width:15px; height:15px; transform:rotate(-90deg); }
  .cw-profile-computer-head { display:flex; align-items:center; gap:8px; justify-content:space-between; margin-bottom:11px; }
  .cw-profile-computer-head .cw-profile-heading { margin:0; }
  .cw-profile-computer-head .chip { font-size:10px; text-transform:capitalize; }
  .cw-computer-technical { margin:12px 0 0; font-size:11px; }
  .cw-computer-technical summary { cursor:pointer; color:var(--muted); padding:5px 0; }
  .cw-computer-technical p { overflow-wrap:anywhere; white-space:pre-wrap; }
  @keyframes cw-profile-context-in { from { opacity:0; transform:translateY(3px); } to { opacity:1; transform:translateY(0); } }
  @media(prefers-reduced-motion:reduce) { .cw-profile-context.is-switching { animation:none; } }
`;

export const COWORK_PROFILE_JS = String.raw`
  function cwProfileTools(agent) {
    var cw=cwEnsure(),state=cw.appAccountStates&&cw.appAccountStates[agent.id],apps=new Map(),computer=(cw.computers||[]).find(function(item){return item.agentId===agent.id;});
    var descriptions={github:'Repository issues, pull requests, and code reviews.',gmail:'Read email and manage the messages you authorize.',facebook:'Work with your connected pages and social posts.',instagram:'Work with your connected Instagram content and audience.',googlecalendar:'Work with events and availability in your connected calendar.',googledrive:'Find and work with files in your connected Drive.'};
    var names={github:'GitHub',gmail:'Gmail',googlecalendar:'Google Calendar',googledrive:'Google Drive',googlesheets:'Google Sheets',instagram:'Instagram',facebook:'Facebook',slack:'Slack'};
    (state&&state.requests||[]).concat(cw.requests||[]).forEach(function(request){if(request.agentId!==agent.id||!request.appConnection||request.status==='dismissed')return;var app=request.appConnection;apps.set(app.service,{id:'app:'+app.service,kind:'app',service:app.service,name:app.name,logo:app.logo,description:descriptions[app.service]||app.reason,status:state?'Not connected':'Checking connection…',connected:false});});
    (state&&state.accounts||[]).forEach(function(account){var app=apps.get(account.toolkit)||{id:'app:'+account.toolkit,kind:'app',service:account.toolkit,name:names[account.toolkit]||cwActionWords(account.toolkit),description:descriptions[account.toolkit]||'Tools from this app are assigned specifically to this teammate.'};var connected=account.status==='ACTIVE'&&!account.disabled;if(!app.connected){app.connected=connected;app.status=cwServiceStatus(account.status,account.disabled);}apps.set(account.toolkit,app);});
    var nativeStatus=agent.useHostComputer?'Available':computer&&computer.state==='running'?'Desktop running':computer&&computer.state==='unavailable'?'Desktop unavailable':computer&&computer.state==='starting'?'Starting desktop':'Start desktop';
    var tools=Array.from(apps.values()).filter(function(app){return app.connected;}),native=[{id:'native:browser',kind:'native',name:'Browser',icon:'globe',description:'Browse websites and work with the browser on this teammate’s computer.',status:nativeStatus},{id:'native:files',kind:'native',name:'Files',icon:'file',description:agent.allowWrites?'Read, create, and edit files in the teammate workspace.':'Read and inspect workspace files. File writes are disabled.',status:nativeStatus}];
    if(agent.allowShell)native.push({id:'native:terminal',kind:'native',name:'Terminal',icon:'terminal',description:'Run commands in the teammate workspace. Shell access is enabled.',status:nativeStatus});
    return tools.concat(native,Array.from(apps.values()).filter(function(app){return !app.connected;}));
  }
  function cwProfileToolIcon(tool) {
    if(tool.service==='googlecalendar'||tool.service==='gcalendar')return '<span class="cw-profile-tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 4h2m4 0h2m-8 3h2m4 0h2"/></svg></span>';
    if(tool.service==='googledrive'||tool.service==='gdrive')return '<span class="cw-profile-tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="#0f9d58" d="M8 3 1 16l4 6L15 3z"/><path fill="#fbbc04" d="m8 3 11 19 4-6L15 3z"/><path fill="#4285f4" d="m1 16 4 6h14l4-6z"/></svg></span>';
    return '<span class="cw-profile-tool-icon" aria-hidden="true">'+(tool.kind==='app'?cwServiceIcon({slug:tool.service,name:tool.name,logo:tool.logo}):cwIcon(tool.icon))+'</span>';
  }
  function cwProfileAppsHtml(agent) {
    var cw=cwEnsure(),tools=cwProfileTools(agent),selected=(cw.profileToolSelection||{})[agent.id];
    if(!tools.some(function(tool){return tool.id===selected;}))selected=tools.length?tools[0].id:'';
    (cw.profileToolSelection||(cw.profileToolSelection={}))[agent.id]=selected;
    return '<section class="cw-profile-apps"><button class="btn ghost cw-profile-edit" id="cwAgentApps">'+cwIcon('plug')+'<span>Apps &amp; connections</span><span class="cw-profile-chevron">'+cwIcon('chevron')+'</span></button><div class="cw-profile-tools" role="tablist" aria-label="'+esc(agent.name)+' apps and tools">'+tools.map(function(tool,index){var label=tool.service==='googlecalendar'?'Calendar':tool.service==='googledrive'?'Drive':tool.name;return '<button type="button" class="cw-profile-tool" role="tab" id="cwProfileTool'+index+'" data-profile-tool="'+esc(tool.id)+'" aria-controls="cwProfileToolContext" aria-selected="'+(tool.id===selected)+'" tabindex="'+(tool.id===selected?'0':'-1')+'">'+cwProfileToolIcon(tool)+'<span>'+esc(label)+'</span></button>';}).join('')+'</div><div class="cw-profile-context" id="cwProfileToolContext" role="tabpanel" aria-live="polite"></div></section>';
  }
  function cwSelectProfileTool(agent,id,animate) {
    var cw=cwEnsure(),root=$('cwInfo'),context=$('cwProfileToolContext'),tool=cwProfileTools(agent).find(function(item){return item.id===id;});if(!root||!context||!tool)return;
    (cw.profileToolSelection||(cw.profileToolSelection={}))[agent.id]=id;
    root.querySelectorAll('[data-profile-tool]').forEach(function(button){var selected=button.getAttribute('data-profile-tool')===id;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;if(selected)context.setAttribute('aria-labelledby',button.id);});
    context.innerHTML='<div class="cw-profile-context-head">'+cwProfileToolIcon(tool)+'<div><strong>'+esc(tool.name)+'</strong><span class="cw-profile-context-status'+(tool.connected?' connected':'')+'">'+esc(tool.status)+'</span></div><button aria-label="'+esc(tool.kind==='app'?'Open '+tool.name+' connection settings':'Open '+tool.name+' desktop')+'" title="'+(tool.kind==='app'?'Connection settings':'Open desktop')+'">'+cwIcon('chevron')+'</button></div><p>'+esc(tool.description)+'</p>';
    context.querySelector('button').onclick=function(){if(tool.kind==='app')cwOpenConnections(agent.id);else cwOpenDesktop(agent.id);};
    context.classList.remove('is-switching');if(animate){void context.offsetWidth;context.classList.add('is-switching');}cwBindServiceIcons(context);
  }
  function cwBindProfileTools(agent) {
    var root=$('cwInfo'),buttons=Array.from(root.querySelectorAll('[data-profile-tool]'));
    buttons.forEach(function(button,index){button.onclick=function(){cwSelectProfileTool(agent,button.getAttribute('data-profile-tool'),true);};button.onkeydown=function(event){var next=index;if(event.key==='ArrowRight')next=index+1;else if(event.key==='ArrowLeft')next=index-1;else if(event.key==='ArrowDown')next=index+3;else if(event.key==='ArrowUp')next=index-3;else if(event.key==='Home')next=0;else if(event.key==='End')next=buttons.length-1;else return;event.preventDefault();next=Math.max(0,Math.min(buttons.length-1,next));var target=buttons[next];cwSelectProfileTool(agent,target.getAttribute('data-profile-tool'),true);target.focus();};});
    cwSelectProfileTool(agent,cwEnsure().profileToolSelection[agent.id],false);cwBindServiceIcons(root);
  }
`;
