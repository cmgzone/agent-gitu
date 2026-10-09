export const CONNECTED_APPS_CSS = String.raw`
.cw-connection-nav{display:flex;gap:6px;padding:8px 12px}.cw-connection-nav button{flex:none;width:32px;height:32px;padding:7px}
.cw-services{height:100%;min-width:0;overflow:auto;padding:30px clamp(20px,4vw,48px) 48px;max-width:1050px;width:100%;margin:auto;container-type:inline-size;container-name:services}
.cw-services-head{display:flex;gap:24px;align-items:flex-start;justify-content:space-between}.cw-services h1{font-size:24px;font-weight:600;letter-spacing:-.025em;margin:0 0 8px}.cw-services p{color:var(--muted);line-height:1.6}.cw-services-head p{font-size:13px;margin:0;max-width:390px}
.cw-services-actions{display:flex;gap:8px;align-items:center;flex-shrink:0}.cw-services-actions>.btn{width:34px;height:34px;padding:8px;color:var(--muted)}.cw-services-actions svg{width:17px;height:17px}
.cw-services-search{display:flex;align-items:center;max-width:260px;min-width:0;margin:0}.cw-services-search input{width:220px;min-width:0}.cw-services-search>svg{display:none}
.cw-services-controls{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin:24px 0 30px}.cw-services-tabs{display:flex;gap:4px}.cw-services-tabs .btn{font-size:12px;padding:8px 16px;min-height:36px;color:var(--muted)}.cw-services-tabs [aria-selected="true"]{color:var(--text);font-weight:600}.cw-services-count{font-size:11px;margin-left:6px;color:var(--muted)}
.cw-services-agent{display:flex;align-items:center;gap:8px;min-width:0;font-size:12px;color:var(--muted)}.cw-services-agent select{font:inherit;color:var(--text);background:transparent;border:1px solid var(--border);border-radius:8px;padding:7px 9px;max-width:200px;min-width:0}
.cw-service-section{margin:0 0 30px}.cw-service-section h2,.cw-service-permissions h2{font-size:14px;font-weight:600;margin:0 0 18px}.cw-service-section>p{font-size:12px;margin:-8px 0 14px}.cw-service-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:40px;row-gap:8px}
.cw-service-row{display:flex;align-items:center;gap:12px;min-width:0;min-height:68px;padding:10px 0;border:0;background:transparent}.cw-service-row .cw-service-symbol{flex:none;width:36px;height:36px;border:1px solid var(--border);border-radius:10px;background:var(--card);font-size:16px}.cw-service-copy{flex:1;min-width:0}.cw-service-copy h3{margin:0;font-size:13px;font-weight:600;line-height:1.5;overflow-wrap:anywhere}.cw-service-copy p{font-size:12px;margin:3px 0 0;line-height:1.45;overflow-wrap:anywhere}.cw-service-copy small{display:block;font-size:11px;color:var(--muted);margin-top:3px}.cw-service-row>.cw-service-action{flex:none;width:36px;height:36px;min-height:36px;padding:8px;border-radius:50%;color:var(--muted)}.cw-service-action svg{width:18px;height:18px}.cw-service-action.connected{color:var(--ok)}.cw-service-status{font-size:12px;color:var(--muted)}.cw-service-status.connected{color:var(--ok)}
.cw-service-symbol{width:40px;height:40px;display:grid;place-items:center;border-radius:10px;background:var(--card2);color:var(--accent);font-size:18px;font-weight:650}.cw-service-empty{padding:18px 0;max-width:520px}.cw-service-empty h2{font-size:17px;margin:0 0 10px}.cw-service-empty p{font-size:13px}.cw-provider-form{max-width:460px;margin-top:22px}.cw-provider-form label{display:block;font-size:13px;margin-bottom:8px}.cw-provider-form input{width:100%;padding:11px 14px;border:1px solid var(--border2);border-radius:9px;background:var(--card);color:var(--text);font:inherit}.cw-provider-form .btn{margin-top:12px}.cw-services-error{color:var(--err)!important}.cw-account-row{display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border);padding:12px 0}.cw-account-row>span{flex:1}.cw-service-permissions{border-top:1px solid var(--border);padding-top:22px;margin-top:24px}.cw-service-permissions>p{font-size:12px}.cw-service-more{margin-top:16px;font-size:12px}.cw-services-content{animation:cw-services-in .16s ease-out}.cw-services-content:empty{animation:none}@keyframes cw-services-in{from{opacity:.5;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}
@container services(max-width:620px){.cw-services-head{flex-direction:column;gap:18px}.cw-services-actions{width:100%}.cw-services-search{flex:1;max-width:none}.cw-services-search input{width:100%}.cw-service-grid{grid-template-columns:1fr}.cw-services-controls{margin:20px 0 26px}.cw-service-row{min-height:66px}}
@media(max-width:480px){.cw-services{padding:22px 20px 36px}.cw-services-agent{width:100%;justify-content:space-between}.cw-services-agent select{max-width:70%}.cw-service-row>.cw-service-action{width:44px;height:44px;min-height:44px}}
@media(prefers-reduced-motion:reduce){.cw-services-content{animation:none}}
.cw-service-symbol>*{grid-area:1/1}.cw-service-symbol.has-logo{background:#fff}.cw-service-logo{width:32px;height:32px;object-fit:contain;opacity:0}.cw-service-logo.loaded{opacity:1}.cw-account-row .cw-service-symbol{flex:none}
.cw-service-symbol .cw-tool-ico{width:28px;height:28px;color:var(--accent)}.cw-service-symbol .cw-tool-ico svg{width:25px;height:25px}.cw-service-symbol .cw-tool-ico .cw-fav{width:28px;height:28px;background:#fff;border-radius:5px}
.cw-app-permission-copy{display:flex;flex-direction:column;gap:3px;min-width:0;overflow-wrap:anywhere}.cw-app-permission-copy small{color:var(--muted)}
.cw-app-suggestion{max-width:470px}.cw-app-suggestion-head{display:flex;align-items:center;gap:12px;margin:8px 0 12px}.cw-app-suggestion-head strong{display:block;font-size:15px}.cw-app-suggestion-head small{display:block;color:var(--muted);margin-top:3px}.cw-app-suggestion p{margin:0 0 12px;line-height:1.6;color:var(--muted)}.cw-app-controls{position:relative;display:flex;align-items:center;flex-wrap:wrap;gap:8px 16px;min-height:40px}.cw-app-controls :is(button,a.btn){flex:none;white-space:nowrap;overflow-wrap:normal;min-height:40px;padding:8px 4px}@media(max-width:480px){.cw-app-controls{gap:4px 20px}.cw-app-controls [data-cwappmanage]{flex-basis:100%;justify-content:flex-start}.cw-app-suggestion p{margin-bottom:16px}}.cw-app-connected{display:inline-flex;align-items:center;gap:7px;color:var(--ok);font-size:12px;font-weight:600}.cw-app-connected svg{width:16px;height:16px}.cw-app-connected.just-connected{animation:cw-app-connected-in .5s cubic-bezier(.16,1,.3,1) both}.cw-app-connect-exit{position:absolute;inset:0 auto auto 0;pointer-events:none;animation:cw-app-connect-out .22s ease-in both}.cw-app-suggestion.just-connected .cw-service-symbol{animation:cw-app-icon-settle .6s cubic-bezier(.16,1,.3,1) both}@keyframes cw-app-connected-in{from{opacity:0;transform:translateY(5px) scale(.94)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes cw-app-connect-out{to{opacity:0;transform:translateY(-5px) scale(.96)}}@keyframes cw-app-icon-settle{0%{transform:scale(1)}35%{transform:scale(1.1)}100%{transform:scale(1)}}@media(prefers-reduced-motion:reduce){.cw-app-connected.just-connected,.cw-app-connect-exit,.cw-app-suggestion.just-connected .cw-service-symbol{animation:none}}
.cw-mail-section{border-bottom:1px solid var(--border);padding-bottom:26px;margin-bottom:30px}.cw-mail-section h2{font-size:14px;font-weight:600;margin:0 0 8px}.cw-mail-section>p{font-size:12px;margin:0 0 16px;color:var(--muted)}
.cw-mail-subhead{font-size:12px;font-weight:600;margin:18px 0 8px;color:var(--muted)}
.cw-mail-actions{margin-top:14px}
.cw-mail-form{margin-top:16px}.cw-mail-form label{display:block;font-size:12px;margin:12px 0 6px}.cw-mail-form input,.cw-mail-form select{width:100%;padding:10px 12px;border:1px solid var(--border2);border-radius:9px;background:var(--card);color:var(--text);font:inherit}
.cw-mail-note{font-size:12px;margin:4px 0 0!important;color:var(--muted)}
.cw-mail-check{display:flex!important;align-items:center;gap:8px;font-size:12px;margin:8px 0!important}.cw-mail-check input{width:auto}
.cw-mail-advanced{margin-top:16px;border:1px solid var(--border);border-radius:9px;padding:8px 12px}.cw-mail-advanced summary{cursor:pointer;font-size:12px;color:var(--muted)}.cw-mail-advanced[open] summary{color:var(--text);margin-bottom:6px}
.cw-app-heartbeat{display:flex;align-items:center;gap:16px;padding:0 0 24px;max-width:720px}.cw-app-heartbeat .btn{flex:none}.cw-app-heartbeat small{color:var(--muted);line-height:1.6;font-size:12px}.cw-app-heartbeat [aria-pressed="true"]{color:var(--accent)}@media(max-width:480px){.cw-app-heartbeat{align-items:flex-start;flex-direction:column;gap:8px}}
`;

export const CONNECTED_APPS_JS = String.raw`
  function cwPrepareAppSignIn() {
    var desktop=typeof window!=='undefined'&&window.gituDesktop,tab=null;
    if(!desktop&&typeof window!=='undefined')try{tab=window.open('about:blank','_blank');if(tab)tab.opener=null;}catch(e){}
    return {
      cancel:function(){if(tab)try{tab.close();}catch(e){}},
      open:async function(value){
        var url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||['connect.composio.dev','backend.composio.dev'].indexOf(url.hostname)<0)throw new Error('Invalid sign-in link');
        if(desktop&&typeof desktop.openAppSignIn==='function')return await desktop.openAppSignIn(url.href);
        if(tab&&!tab.closed){tab.location.replace(url.href);return true;}
        return false;
      }
    };
  }
  function cwAppSignInError(error,agentId) {
    var message='Could not start sign-in. Open Connections to check this app’s setup and retry.';
    try{var data=JSON.parse(error.message);if(data.code==='COMPOSIO_SETUP_REQUIRED'){cwOpenConnections(agentId);message=data.error;}else if(data.code==='APP_SIGN_IN_FAILED')message=data.error;}catch(e){}
    toast(message,true);
  }
  function cwAppHeartbeatButton() {
    var button=$('cwServicesHeartbeat');if(!button)return;
    var enabled=cwEnsure().learn&&cwEnsure().learn.mode==='proactive';
    button.setAttribute('aria-pressed',String(!!enabled));button.textContent='Proactive updates: '+(enabled?'On':'Off');
  }
  function cwShowAppConnectionPrompt() {
    var cw=cwEnsure();
    if(cw.connectionsOpen||cw.profileOpen||cw.appPromptActive||typeof document.querySelector!=='function'||document.querySelector('.modal'))return;
    var seen=cw.appPromptSeen||(cw.appPromptSeen={});
    var request=(cw.requests||[]).find(function(item){return item.appConnection&&item.status==='open'&&!seen[item.id]&&Date.now()-Date.parse(item.createdAt)<120000;});
    if(!request)return;
    seen[request.id]=true;cw.appPromptActive=true;
    var modal=document.createElement('div');modal.className='modal cw-modal cw-connection-prompt';
    modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-label','Connect '+request.appConnection.name);
    modal.innerHTML='<div class="box"><div class="bar"><strong>Connect '+esc(request.appConnection.name)+'</strong><span style="flex:1"></span><button class="btn ghost" data-prompt-close aria-label="Close connection suggestion">'+cwIcon('close')+'</button></div><div class="cw-body">'+cwServiceIcon(request.appConnection)+'<p>'+esc(request.appConnection.reason)+'</p><div class="cw-app-controls"><button class="btn dark" data-cwconnectrequest="'+esc(request.id)+'">Connect</button><button class="btn ghost" data-prompt-close>Not now</button></div></div></div>';
    document.body.appendChild(modal);
    var closeDialog=cwBindDialog(modal,'[data-cwconnectrequest]');
    function close(){cw.appPromptActive=false;closeDialog();}
    modal.querySelectorAll('[data-prompt-close]').forEach(function(button){button.onclick=close;});
    var keydown=modal.onkeydown;modal.onkeydown=function(event){if(event.key==='Escape')cw.appPromptActive=false;keydown(event);};
    cwBindAppConnections(modal);
    var connect=modal.querySelector('[data-cwconnectrequest]'),connectAction=connect.onclick;
    connect.onclick=function(){close();return connectAction();};
  }
  async function cwLockApp() {
    try { await api('/api/auth/logout', {method:'POST'}); } finally { location.replace('/auth'); }
  }
  function cwOpenConnections(agentId) {
    cwSaveDraft(); cwStopPoll(); cwClosePanels();
    var cw = cwEnsure(); cw.connectionsFromProfile=!!cw.profileOpen;cw.profileOpen=false;cw.profileRevision=(cw.profileRevision||0)+1;cw.galleryOpen = false; cw.connectionsOpen = true; cw.connectionRevision = (cw.connectionRevision || 0) + 1;
    cw.connectionsAgentId=agentId||cw.selectedAgentId||'';
    cw.servicesTab='available';cw.servicesSearch='';cw.servicesData=null;
    cwSyncPanels(); document.title='Connections — Cowork';
    $('cwChat').innerHTML = cwPageNavHtml('connections',cwAgentById(cw.connectionsAgentId))+'<main class="cw-services"><div class="cw-services-head"><div><h1>Connections</h1><p>Connect apps to help your teammates work across your tools.</p></div><div class="cw-services-actions"><form class="cw-services-search" id="cwServicesSearch" role="search">'+cwIcon('search')+'<input id="cwServicesQuery" type="search" aria-label="Search apps" placeholder="Search apps" maxlength="100"></form><button class="btn ghost" id="cwServicesRefresh" aria-label="Refresh connections" title="Refresh connections"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.5-2L20 8M4 16l2.4 3A7 7 0 0 0 17.9 17"/></svg></button><button class="btn ghost" id="cwServicesBack" aria-label="Back to chat" title="Back to chat">'+cwIcon('back')+'</button></div></div><div class="cw-services-controls"><div class="cw-services-tabs" role="tablist" aria-label="Connection views"><button class="btn ghost" id="cwServicesAvailable" role="tab" aria-selected="true" aria-controls="cwServicesContent" tabindex="0">Available</button><button class="btn ghost" id="cwServicesConnected" role="tab" aria-selected="false" aria-controls="cwServicesContent" tabindex="-1">Connected<span id="cwServicesCount" class="cw-services-count" aria-hidden="true"></span></button></div><label class="cw-services-agent">For teammate <select id="cwServicesAgent" aria-label="Connection teammate"></select></label></div><div id="cwServicesContent" class="cw-services-content" role="tabpanel" aria-labelledby="cwServicesAvailable"><p role="status">Loading apps…</p></div></main>';
    var serviceControls=typeof document.querySelector==='function'&&document.querySelector('.cw-services-controls');
    if(serviceControls)serviceControls.insertAdjacentHTML('afterend','<div class="cw-app-heartbeat"><button class="btn ghost" id="cwServicesHeartbeat" aria-pressed="false">Proactive updates: Off</button><small>Checks read tools you’ve allowed while Gitu is open. Useful updates appear in a widget and chat; unchanged results stay quiet.</small></div>');
    var heartbeat=$('cwServicesHeartbeat');
    if(heartbeat){cwAppHeartbeatButton();heartbeat.onclick=async function(){heartbeat.disabled=true;try{var mode=cwEnsure().learn&&cwEnsure().learn.mode==='proactive'?'reactive':'proactive';var result=await api('/api/cowork/learning',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({mode:mode})});cwEnsure().learn=Object.assign({},cwEnsure().learn||{},result);cwAppHeartbeatButton();if(typeof cwLearnRender==='function')cwLearnRender();}catch(e){toast('Could not update proactive checks. Try again.',true);}finally{heartbeat.disabled=false;}};}
    cwBindTopNav();$('cwInfoBtn').onclick=function(){cwOpenProfile(cw.connectionsAgentId);};
    $('cwServicesBack').onclick = function(){if(cw.connectionsFromProfile){cwOpenProfile(cw.connectionsAgentId,'connections');return;}cw.connectionsOpen=false;cw.connectionRevision++;cwRenderChat();if(cw.active){cwStartStream(cw.active);cwPoll();cw.timer=setInterval(cwPoll,2000);}};
    $('cwServicesRefresh').onclick=function(){cwLoadServices(cw.servicesSearch||'',false);};
    ['available','connected'].forEach(function(view,index){var button=$(index?'cwServicesConnected':'cwServicesAvailable');button.onclick=function(){cw.servicesTab=view;cwRenderServices();};button.onkeydown=function(event){if(['ArrowLeft','ArrowRight','Home','End'].indexOf(event.key)<0)return;event.preventDefault();var next=event.key==='Home'?'available':event.key==='End'?'connected':view==='available'?'connected':'available';cw.servicesTab=next;cwRenderServices();$(next==='connected'?'cwServicesConnected':'cwServicesAvailable').focus();};});
    var query=$('cwServicesQuery'),searchTimer;
    $('cwServicesSearch').onsubmit=function(event){event.preventDefault();clearTimeout(searchTimer);cwLoadServices(query.value.trim(),false);};
    query.oninput=function(){clearTimeout(searchTimer);cw.servicesSearch=query.value.trim();cwRenderServices();searchTimer=setTimeout(function(){if(cw.connectionsOpen)cwLoadServices(query.value.trim(),false);},300);};
    cwLoadServices('',false);
  }
  function cwSetAppConnectionState(agentId,data) {
    var cw=cwEnsure(),states=cw.appAccountStates||(cw.appAccountStates={}),previous=states[agentId];
    var accounts=data.accounts||[],celebrations=cw.appCelebrations||(cw.appCelebrations={});
    if(previous)accounts.forEach(function(account){if(account.status==='ACTIVE'&&!account.disabled&&!previous.accounts.some(function(old){return old.id===account.id&&old.status==='ACTIVE'&&!old.disabled;}))celebrations[agentId+':'+account.toolkit]=Date.now();});
    states[agentId]={accounts:accounts,requests:data.requests||previous&&previous.requests||[],checked:Date.now()};
    (cw.requests||[]).forEach(function(request){if(request.agentId===agentId&&request.appConnection&&accounts.some(function(account){return account.toolkit===request.appConnection.service&&account.status==='ACTIVE'&&!account.disabled;})&&cw.appAuthLinks)delete cw.appAuthLinks[request.id];});
    if(data.requests)cw.requests=(cw.requests||[]).map(function(request){return data.requests.find(function(updated){return updated.id===request.id;})||request;});
  }
  function cwAppConnectionHtml(request) {
    var cw=cwEnsure(),app=request.appConnection,agent=cwAgentById(request.agentId),state=cw.appAccountStates&&cw.appAccountStates[request.agentId];
    var connected=state?state.accounts.some(function(account){return account.toolkit===app.service&&account.status==='ACTIVE'&&!account.disabled;}):request.response==='Connected';
    var justConnected=connected&&Date.now()-((cw.appCelebrations||{})[request.agentId+':'+app.service]||0)<1200;
    var link=(cw.appAuthLinks||{})[request.id],dismissed=request.status==='dismissed',controls;
    if(connected)controls='<span class="cw-app-connected'+(justConnected?' just-connected':'')+'" role="status">'+cwIcon('check')+'Connected</span>';
    else if(dismissed)controls='<span class="cw-request-result">Skipped</span>';
    else controls=(link?'<a class="btn dark" href="'+esc(link)+'" target="_blank" rel="noopener noreferrer">Continue sign-in</a>':'<button class="btn dark" data-cwconnectrequest="'+esc(request.id)+'">Connect</button>')+'<button class="btn ghost" data-cwrequest="'+esc(request.id)+'" data-action="dismiss">Skip</button><button class="btn ghost" data-cwappmanage="'+esc(request.agentId)+'">Use existing account</button>';
    return '<div class="cw-row cw-request-row" data-cwrequest-row="'+esc(request.id)+'"><div class="cw-bubble cw-app-suggestion'+(justConnected?' just-connected':'')+'"><div class="cw-meta"><span class="nm">'+esc(agent?agent.name:'Teammate')+'</span><span class="tg">Suggested app</span></div><div class="cw-app-suggestion-head">'+cwServiceIcon(app)+'<div><strong>'+esc(app.name)+'</strong><small>For '+esc(agent?agent.name:'this teammate')+' only</small></div></div><p>'+esc(app.reason)+'</p><div class="cw-app-controls">'+controls+'</div></div></div>';
  }
  function cwBindAppConnections(root) {
    cwBindServiceIcons(root);
    root.querySelectorAll('[data-cwappmanage]').forEach(function(button){button.onclick=function(){cwOpenConnections(button.getAttribute('data-cwappmanage'));};});
    root.querySelectorAll('[data-cwconnectrequest]').forEach(function(button){button.onclick=async function(){
      var cw=cwEnsure(),request=(cw.requests||[]).find(function(item){return item.id===button.getAttribute('data-cwconnectrequest');});
      if(!request||!request.appConnection||button.disabled)return;button.disabled=true;
      // A mailbox has no sign-in page: the Connect button opens the mailbox form instead.
      if(request.appConnection.service==='mail'){cwEnsure().mailFormOpen=true;cwOpenConnections(request.agentId);return;}
      var signIn=cwPrepareAppSignIn();
      try{
        var result=await api('/api/connected-apps/connect',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({agentId:request.agentId,service:request.appConnection.service,requestId:request.id})});
        var opened=await signIn.open(result.url),url=new URL(result.url);
        (cw.appAuthLinks||(cw.appAuthLinks={}))[request.id]=url.href;
        cw.appConnectionsChecked=0;cwRenderMsgs();cwPollAppConnections();
        toast(opened?'Finish sign-in in your browser. This card updates automatically.':'Use Continue sign-in to open your browser.');
      }catch(e){signIn.cancel();cwAppSignInError(e,request.agentId);button.disabled=false;}
    };});
  }
  function cwPollAppConnections() {
    var cw=cwEnsure(),pending=Object.keys(cw.appAuthLinks||{}).length>0;if(cw.connectionsOpen||cw.appConnectionsLoading||Date.now()-(cw.appConnectionsChecked||0)<(pending?2000:60000))return;
    var ids=[];(cw.requests||[]).forEach(function(request){if(request.appConnection&&request.status!=='dismissed'&&ids.indexOf(request.agentId)<0)ids.push(request.agentId);});
    var conversation=cwActiveConv();if(conversation&&conversation.kind==='dm'&&conversation.memberIds[0]&&ids.indexOf(conversation.memberIds[0])<0)ids.push(conversation.memberIds[0]);
    if(!ids.length)return;cw.appConnectionsLoading=true;cw.appConnectionsChecked=Date.now();var active=cw.active,generation=cw.generation;
    Promise.all(ids.map(function(id){return api('/api/connected-apps?agentId='+encodeURIComponent(id)+'&statusOnly=true').then(function(data){return {id:id,data:data};});})).then(function(results){
      if(cw.active!==active||cw.generation!==generation||cw.connectionsOpen)return;
      var profileChanged=false,exits=[];results.forEach(function(result){var old=cw.appAccountStates&&cw.appAccountStates[result.id];if(!old||JSON.stringify(old.accounts)!==JSON.stringify(result.data.accounts||[])||JSON.stringify(old.requests||[])!==JSON.stringify(result.data.requests||[]))profileChanged=true;if(old){(cw.requests||[]).forEach(function(request){if(request.agentId!==result.id||!request.appConnection)return;var service=request.appConnection.service;var now=(result.data.accounts||[]).some(function(a){return a.toolkit===service&&a.status==='ACTIVE'&&!a.disabled;});var before=old.accounts.some(function(a){return a.toolkit===service&&a.status==='ACTIVE'&&!a.disabled;});if(now&&!before){var row=document.querySelector('[data-cwrequest-row="'+request.id+'"] .cw-app-controls');var action=row&&row.querySelector('button,a');if(action)exits.push({id:request.id,node:action.cloneNode(true)});}});}cwSetAppConnectionState(result.id,result.data);});
      cwRenderMsgs();exits.forEach(function(exit){var row=document.querySelector('[data-cwrequest-row="'+exit.id+'"] .cw-app-controls');if(!row)return;exit.node.classList.add('cw-app-connect-exit');exit.node.setAttribute('aria-hidden','true');exit.node.removeAttribute('href');exit.node.disabled=true;exit.node.tabIndex=-1;row.appendChild(exit.node);if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)exit.node.remove();else exit.node.addEventListener('animationend',function(){exit.node.remove();},{once:true});});cwRenderRail();if(profileChanged)cwRenderInfo();
    }).catch(function(){}).finally(function(){cw.appConnectionsLoading=false;});
  }
  function cwServiceStatus(status, disabled) {
    if(disabled)return 'Disconnected';
    return ({ACTIVE:'Connected',EXPIRED:'Reconnect needed',REVOKED:'Disconnected',INACTIVE:'Disconnected',INITIATED:'Waiting for sign-in',INITIALIZING:'Waiting for sign-in',FAILED:'Connection failed'})[status] || 'Not connected';
  }
  function cwServiceIcon(service) {
    var name=String(service.name||service.toolkit||service.slug||'App'),logo='';
    try { var url=new URL(service.logo);if(url.protocol==='https:'&&!url.username&&!url.password)logo=url.href; } catch(e) {}
    // Keep the camera recognisable when a role suggestion has no catalog logo.
    if(!logo&&(service.service||service.slug||service.toolkit)==='instagram')return '<div class="cw-service-symbol" aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none"/></svg></div>';
    if(!logo&&typeof cwToolIconHtml==='function')return '<div class="cw-service-symbol" aria-hidden="true">'+cwToolIconHtml({tool:'connected_apps',appService:service.service||service.slug||service.toolkit})+'</div>';
    return '<div class="cw-service-symbol'+(logo?' has-logo':'')+'" aria-hidden="true"><span>'+esc(name.slice(0,1).toUpperCase())+'</span>'+
      (logo?'<img class="cw-service-logo" src="'+esc(logo)+'" alt="" width="32" height="32" loading="lazy" decoding="async" referrerpolicy="no-referrer">':'')+'</div>';
  }
  function cwBindServiceIcons(root) {
    root.querySelectorAll('.cw-service-logo').forEach(function(image){
      var fallback=image.previousElementSibling;
      var loaded=function(){image.classList.add('loaded');if(fallback)fallback.hidden=true;};
      var failed=function(){if(fallback)fallback.hidden=false;image.parentElement.classList.remove('has-logo');image.remove();};
      image.onload=loaded;image.onerror=failed;
      if(image.complete){if(image.naturalWidth>0)loaded();else failed();}
    });
  }
  function cwAppPermissionsHtml(permissions) {
    if(!permissions||!permissions.length)return '';
    return '<section class="cw-service-permissions" aria-label="Always allowed actions"><h2>Always allowed actions</h2><p>These tools can run without asking again, for the teammate and account shown.</p>'+permissions.map(function(permission){
      return '<div class="cw-account-row">'+cwToolIconHtml({tool:'connected_apps',appService:permission.service})+'<span class="cw-app-permission-copy"><strong>'+esc(cwAppActionName(permission.tool,permission.service))+'</strong><small>@'+esc(permission.agentName)+' · '+esc(cwActionWords(permission.service))+' · Account '+esc(permission.accountId.slice(-8))+'</small></span><button class="btn ghost" data-cwrevokeapp="'+esc(permission.id)+'">Revoke</button></div>';
    }).join('')+'</section>';
  }
  function cwBindAppPermissions(root) {
    root.querySelectorAll('[data-cwrevokeapp]').forEach(function(button){button.onclick=async function(){button.disabled=true;try{
      await api('/api/connected-apps/permissions/'+encodeURIComponent(button.getAttribute('data-cwrevokeapp')),{method:'DELETE'});
      toast('Permission revoked. The next action will ask for approval.');cwLoadServices(cwEnsure().servicesSearch||'',false);
    }catch(e){toast('Could not revoke this permission. Try again.',true);button.disabled=false;}};});
  }
  function cwServiceDescription(service) {
    if(service.description||service.reason)return service.description||service.reason;
    var descriptions={gmail:'Read and manage the email you connect.',github:'Repository issues, pull requests, and code reviews.',googledrive:'Work with files, documents, and spreadsheets.',googlecalendar:'Plan meetings and manage your calendar.',slack:'Work across your channels and conversations.',facebook:'Manage the pages and posts you choose.',instagram:'Work with your content and audience.',outlook:'Read and manage your Outlook email.',outlookemail:'Read and manage your Outlook email.',mail:'Read and send from a mailbox you connect over IMAP/SMTP.',notion:'Find and update pages in your workspace.'};
    return descriptions[service.slug]||'Connect '+service.name+' tools for this teammate.';
  }
  function cwServiceMatches(service,search){return !search||[service.name,service.slug,service.description,service.reason].filter(Boolean).join(' ').toLowerCase().indexOf(search.toLowerCase())>=0;}
  function cwServiceRow(service,action,detail){
    var name=service.name||cwActionWords(service.slug),label=action.label;
    return '<article class="cw-service-row" data-service="'+esc(service.slug)+'">'+cwServiceIcon(service)+'<div class="cw-service-copy"><h3>'+esc(name)+'</h3><p>'+esc(cwServiceDescription(Object.assign({},service,{name:name})))+'</p>'+(detail?'<small class="cw-service-status'+(action.connected?' connected':'')+'">'+esc(detail)+'</small>':'')+'</div><button class="btn ghost cw-service-action'+(action.connected?' connected':'')+'" '+action.attribute+'="'+esc(action.value)+'" aria-label="'+esc(label)+'" title="'+esc(label)+'">'+cwIcon(action.icon)+'</button></article>';
  }
  function cwRenderServices(){
    var cw=cwEnsure(),data=cw.servicesData,content=$('cwServicesContent'),agentId=cw.connectionsAgentId||'';
    if(!content)return;
    var connected=cw.servicesTab==='connected',search=cw.servicesSearch||'';
    ['Available','Connected'].forEach(function(name,index){var button=$('cwServices'+name);if(button){var selected=index===Number(connected);button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;}});
    content.setAttribute('aria-labelledby',connected?'cwServicesConnected':'cwServicesAvailable');
    if(!data||!data.configured||!agentId||cw.servicesAgentId!==agentId)return;
    var accounts=data.accounts||[],available=data.availableAccounts||[],services=cw.services||[],requests=data.requests||[];
    var count=$('cwServicesCount');if(count)count.textContent=accounts.length?String(accounts.length):'';
    var serviceFor=function(slug){var app=services.find(function(service){return service.slug===slug;}),request=requests.find(function(request){return request.appConnection&&request.appConnection.service===slug;}),names={github:'GitHub',gmail:'Gmail',googlecalendar:'Google Calendar',googledrive:'Google Drive',outlook:'Outlook Email',outlookemail:'Outlook Email',mail:'Mailbox'};return app||request&&Object.assign({slug:slug},request.appConnection)||{slug:slug,name:names[slug]||cwActionWords(slug)};};
    var rows=function(list){return '<div class="cw-service-grid">'+list.join('')+'</div>';};
    if(connected){
      var own=accounts.filter(function(account){return cwServiceMatches(serviceFor(account.toolkit),search);}),existing=available.filter(function(account){return cwServiceMatches(serviceFor(account.toolkit),search);});
      content.innerHTML='<section class="cw-service-section" aria-label="Teammate accounts"><h2>Connected for this teammate</h2>'+ (own.length?rows(own.map(function(account){return cwServiceRow(serviceFor(account.toolkit),{attribute:'data-cwdisconnect',value:account.id,label:'Remove '+serviceFor(account.toolkit).name+' access',icon:'close',connected:account.status==='ACTIVE'&&!account.disabled},cwServiceStatus(account.status,account.disabled)+(accounts.filter(function(a){return a.toolkit===account.toolkit;}).length>1?' · account '+account.id.slice(-8):''));})):'<p>'+esc(search?'No connected apps match your search.':'No apps connected yet. Browse Available to connect your first app.')+'</p>')+'</section>'+
        (existing.length?'<section class="cw-service-section" aria-label="Existing accounts"><h2>Existing accounts</h2><p>Choose an account to give this teammate access.</p>'+rows(existing.map(function(account){var service=serviceFor(account.toolkit);return cwServiceRow(service,{attribute:'data-cwassignapp',value:account.id,label:'Assign '+service.name+' to this teammate',icon:'plus'},'Available to assign'+(available.filter(function(a){return a.toolkit===account.toolkit;}).length>1?' · account '+account.id.slice(-8):''));}))+'</section>':'')+cwAppPermissionsHtml(data.appPermissions);
    }else{
      var suggestions=new Map();requests.forEach(function(request){var app=request.appConnection;if(request.agentId===agentId&&app&&request.status!=='dismissed'){var service=Object.assign({},serviceFor(app.service),{slug:app.service,name:app.name,reason:app.reason,logo:app.logo||serviceFor(app.service).logo});if(cwServiceMatches(service,search))suggestions.set(app.service,service);}});
      var appRow=function(service){var account=accounts.find(function(a){return a.toolkit===service.slug&&a.status==='ACTIVE'&&!a.disabled;});var expired=accounts.some(function(a){return a.toolkit===service.slug&&a.status==='EXPIRED';});return cwServiceRow(service,{attribute:'data-cwconnect',value:service.slug,label:account?'Add another '+service.name+' account':(expired?'Reconnect ':'Connect ')+service.name,icon:'plus',connected:!!account},account?'Connected':expired?'Reconnect needed':'');};
      var browse=services.filter(function(service){return !suggestions.has(service.slug)&&cwServiceMatches(service,search);}),agent=(data.agents||cw.agents||[]).find(function(a){return a.id===agentId;});
      content.innerHTML=(suggestions.size?'<section class="cw-service-section" aria-label="Suggested apps"><h2>Suggested for '+esc(agent?agent.name:'this teammate')+'</h2>'+rows(Array.from(suggestions.values()).map(appRow))+'</section>':'')+'<section class="cw-service-section" aria-label="Browse apps"><h2>Browse apps</h2>'+ (browse.length?rows(browse.map(appRow)):suggestions.size?'':'<p>No apps match your search.</p>')+(cw.servicesCursor?'<button class="btn ghost cw-service-more" id="cwServicesMore">Load more apps</button>':'')+'</section>';
    }
    cwBindServiceIcons(content);cwBindAppPermissions(content);cwBindServiceActions(content,agentId);cwInsertMail(content,agentId);
    var moreButton=$('cwServicesMore');if(moreButton)moreButton.onclick=function(){moreButton.disabled=true;cwLoadServices(cw.servicesSearch||'',true);};
  }
  function cwBindServiceActions(content,agentId){
    content.querySelectorAll('[data-cwconnect]').forEach(function(button){button.onclick=async function(){if(button.disabled)return;button.disabled=true;var signIn=cwPrepareAppSignIn();try{var result=await api('/api/connected-apps/connect',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({agentId:agentId,service:button.getAttribute('data-cwconnect')})});var opened=await signIn.open(result.url),url=new URL(result.url);var link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.className='btn ghost cw-service-action';link.setAttribute('aria-label','Continue sign-in');link.title='Continue sign-in';link.innerHTML=cwIcon('external');button.replaceWith(link);toast(opened?'Finish sign-in in your browser, then refresh Connections.':'Use Continue sign-in to open your browser.');}catch(e){signIn.cancel();cwAppSignInError(e,agentId);}finally{button.disabled=false;}};});
    content.querySelectorAll('[data-cwassignapp]').forEach(function(button){button.onclick=async function(){if(button.disabled)return;button.disabled=true;try{await api('/api/connected-apps/assign',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({agentId:agentId,accountId:button.getAttribute('data-cwassignapp')})});cwLoadServices(cwEnsure().servicesSearch||'',false);}catch(e){toast('Could not assign this account. Try again.',true);button.disabled=false;}};});
    content.querySelectorAll('[data-cwdisconnect]').forEach(function(button){button.onclick=async function(){if(button.disabled)return;button.disabled=true;try{await api('/api/connected-apps/disconnect',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({agentId:agentId,accountId:button.getAttribute('data-cwdisconnect')})});cwLoadServices(cwEnsure().servicesSearch||'',false);}catch(e){toast('Could not remove this teammate’s access. Try again.',true);button.disabled=false;}};});
  }
  async function cwLoadServices(search, more) {
    var cw=cwEnsure(), revision=++cw.connectionRevision;
    cw.servicesSearch=search;
    try {
      var agentId=cw.connectionsAgentId||'';
      cw.mail=null;
      var data=await api('/api/connected-apps?agentId='+encodeURIComponent(agentId)+'&search='+encodeURIComponent(search)+(more&&cw.servicesCursor?'&cursor='+encodeURIComponent(cw.servicesCursor):''));
      if(!cw.connectionsOpen||revision!==cw.connectionRevision)return;
      var content=$('cwServicesContent'); if(!content)return;
      var select=$('cwServicesAgent'),agents=data.agents||cw.agents||[];
      if(select){select.innerHTML='<option value="">Choose a teammate</option>'+agents.map(function(agent){return '<option value="'+esc(agent.id)+'"'+(agent.id===agentId?' selected':'')+'>'+esc(agent.name)+'</option>';}).join('');select.onchange=function(){cw.connectionsAgentId=select.value;cw.servicesData=null;cw.services=[];content.innerHTML='<p role="status">Loading apps…</p>';cwLoadServices(cw.servicesSearch||'',false);};}
      if(!data.configured){
        cw.servicesData=null;cw.services=[];
        if(data.canConfigure===false){content.innerHTML='<section class="cw-service-empty"><h2>Connect your apps</h2><p>Enable encrypted integration storage in your server settings, or set COMPOSIO_API_KEY in Coolify. Then refresh this page.</p></section>'+cwAppPermissionsHtml(data.appPermissions);cwBindAppPermissions(content);cwInsertMail(content,agentId);return;}
        content.innerHTML='<section class="cw-service-empty"><h2>Connect your apps</h2><p>Set up Composio once, then choose services and sign in to each account.</p><p><a href="https://dashboard.composio.dev" target="_blank" rel="noopener noreferrer">Get your Composio API key</a></p><form class="cw-provider-form" id="cwProviderForm"><label for="cwProviderKey">Composio API key</label><input id="cwProviderKey" type="password" autocomplete="new-password" required maxlength="4096"><button class="btn dark" type="submit">Set up connections</button><p id="cwProviderError" role="alert" class="cw-services-error" hidden></p></form><p>' + (data.keyStorage==='windows-dpapi'?'Your key is encrypted using your Windows account.':'Your key is encrypted on your Gitu server and never included in chats.') + '</p></section>';
        $('cwProviderForm').onsubmit=async function(event){event.preventDefault();var input=$('cwProviderKey'),button=this.querySelector('button'),error=$('cwProviderError');button.disabled=true;error.hidden=true;try{await api('/api/connected-apps/configure',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({apiKey:input.value})});input.value='';cwLoadServices('',false);}catch(e){error.textContent='Could not set up Composio. Check your API key and try again.';error.hidden=false;button.disabled=false;}};
        content.insertAdjacentHTML('beforeend',cwAppPermissionsHtml(data.appPermissions));cwBindAppPermissions(content);cwInsertMail(content,agentId);
        return;
      }
      if(!agentId){cw.servicesData=null;cw.services=[];content.innerHTML='<section class="cw-service-empty"><h2>Choose a teammate</h2><p>Each teammate has its own connected apps. Select one above to connect an app or assign an existing account.</p></section>';return;}
      cwSetAppConnectionState(agentId,data);
      var catalog=new Map();(more?(cw.services||[]).concat(data.services||[]):data.services||[]).forEach(function(service){catalog.set(service.slug,service);});
      cw.services=Array.from(catalog.values());cw.servicesCursor=data.cursor;cw.servicesData=data;cw.servicesAgentId=agentId;
      cwRenderServices();
    } catch(e) {
      if(!cw.connectionsOpen||revision!==cw.connectionRevision)return;
      var content=$('cwServicesContent');if(content)content.innerHTML='<p class="cw-services-error" role="alert">Could not load your services. Check your connection and refresh.</p>';
    }
  }
  function cwMailErrorText(error, fallback) {
    try { var parsed = JSON.parse(String((error && error.message) || '')); if (parsed && typeof parsed.error === 'string') return parsed.error; } catch (e) {}
    return fallback;
  }
  function cwMailSectionHtml(agentId) {
    if (!agentId) return '';
    var cw = cwEnsure(), mail = cw.mail || {}, providers = mail.providers || [];
    var assigned = mail.accounts || [], available = mail.available || [];
    var action = function (attribute, value, label, icon) {
      return '<button class="btn ghost cw-service-action" type="button" ' + attribute + '="' + esc(value) + '" aria-label="' + esc(label) + '" title="' + esc(label) + '">' + cwIcon(icon) + '</button>';
    };
    var row = function (account, connected) {
      var label = account.label || account.address || 'Mailbox';
      var controls = connected
        ? action('data-cwmaildisconnect', account.id, 'Remove this teammate access', 'close') + action('data-cwmailforget', account.id, 'Delete this saved mailbox', 'trash')
        : action('data-cwmailassign', account.id, 'Give this teammate access', 'plus') + action('data-cwmailforget', account.id, 'Delete this saved mailbox', 'trash');
      return '<article class="cw-service-row" data-cwmailrow="' + esc(account.id) + '"><div class="cw-service-symbol" aria-hidden="true"><span>' + esc(label.slice(0, 1).toUpperCase()) + '</span></div><div class="cw-service-copy"><h3>' + esc(label) + '</h3><p>' + esc(account.address || '') + '</p><small class="cw-service-status' + (connected ? ' connected' : '') + '">' + (connected ? 'Connected for this teammate' : 'Saved - assign to give access') + '</small></div>' + controls + '</article>';
    };
    var options = providers.map(function (provider) { return '<option value="' + esc(provider.id) + '">' + esc(provider.name) + '</option>'; }).join('');
    var form = '<form class="cw-provider-form cw-mail-form" id="cwMailForm" hidden novalidate>'
      + '<label for="cwMailProvider">Email provider</label><select id="cwMailProvider" aria-label="Email provider"><option value="custom">Other or self-hosted</option>' + options + '</select>'
      + '<p class="cw-mail-note" id="cwMailNote">Type your address: we fill the servers for known providers, and for self-hosted servers that publish autoconfig or SRV records.</p>'
      + '<label for="cwMailAddress">Email address</label><input id="cwMailAddress" type="email" autocomplete="username" maxlength="254" placeholder="you@example.com">'
      + '<label for="cwMailPassword">Password or app password</label><input id="cwMailPassword" type="password" autocomplete="new-password" maxlength="512">'
      + '<label for="cwMailLabel">Name this mailbox (optional)</label><input id="cwMailLabel" type="text" maxlength="60" placeholder="Support inbox">'
      + '<details class="cw-mail-advanced"><summary>Server settings</summary>'
      + '<label for="cwMailImapHost">Incoming server (IMAP)</label><input id="cwMailImapHost" type="text" maxlength="253" placeholder="imap.example.com">'
      + '<label for="cwMailImapPort">Incoming port</label><input id="cwMailImapPort" type="number" min="1" max="65535" value="993">'
      + '<label class="cw-mail-check"><input id="cwMailImapSecure" type="checkbox" checked> Implicit TLS (usually 993)</label>'
      + '<label for="cwMailSmtpHost">Outgoing server (SMTP)</label><input id="cwMailSmtpHost" type="text" maxlength="253" placeholder="smtp.example.com">'
      + '<label for="cwMailSmtpPort">Outgoing port</label><input id="cwMailSmtpPort" type="number" min="1" max="65535" value="465">'
      + '<label class="cw-mail-check"><input id="cwMailSmtpSecure" type="checkbox" checked> Implicit TLS (usually 465)</label>'
      + '<label class="cw-mail-check"><input id="cwMailSelfSigned" type="checkbox"> Allow a self-signed certificate</label>'
      + '<label for="cwMailUsername">Username (only if it differs from the address)</label><input id="cwMailUsername" type="text" autocomplete="username" maxlength="254">'
      + '</details><button class="btn dark" type="submit">Connect mailbox</button><p id="cwMailError" role="alert" class="cw-services-error" hidden></p></form>';
    var saved = available.length ? '<h3 class="cw-mail-subhead">Saved mailboxes</h3><div class="cw-service-grid">' + available.map(function (account) { return row(account, false); }).join('') + '</div>' : '';
    return '<section class="cw-service-section cw-mail-section" aria-label="Email"><h2>Email</h2><p>Connect any mailbox over IMAP/SMTP - hosted or self-hosted. Only the selected teammate can use it.</p>'
      + (assigned.length ? '<div class="cw-service-grid">' + assigned.map(function (account) { return row(account, true); }).join('') + '</div>' : '') + saved
      + '<div class="cw-mail-actions"><button class="btn dark" type="button" id="cwMailAdd">' + (assigned.length || available.length ? 'Connect another mailbox' : 'Connect a mailbox') + '</button></div>' + form + '</section>';
  }
  function cwInsertMail(content, agentId) {
    var html = cwMailSectionHtml(agentId);
    if (!html || !content) return;
    content.insertAdjacentHTML('afterbegin', html);
    cwBindMail(content, agentId);
  }
  function cwBindMail(root, agentId) {
    var cw = cwEnsure();
    var find = function (id) { return typeof root.querySelector === 'function' ? root.querySelector('#' + id) : null; };
    var form = find('cwMailForm');
    if (!form) return;
    var add = find('cwMailAdd'), error = find('cwMailError'), note = find('cwMailNote'), provider = find('cwMailProvider');
    var presets = {};
    ((cw.mail && cw.mail.providers) || []).forEach(function (item) { presets[item.id] = item; });
    var set = function (id, value, checked) {
      var field = find(id);
      if (!field) return;
      if (checked === undefined) field.value = value; else field.checked = !!checked;
    };
    var apply = function (preset) {
      if (!note) return;
      if (!preset) { note.textContent = 'Enter the servers your provider documents, then connect.'; return; }
      set('cwMailImapHost', preset.imap.host); set('cwMailImapPort', preset.imap.port); set('cwMailImapSecure', null, preset.imap.secure);
      set('cwMailSmtpHost', preset.smtp.host); set('cwMailSmtpPort', preset.smtp.port); set('cwMailSmtpSecure', null, preset.smtp.secure);
      note.textContent = preset.note || '';
    };
    if (add) add.onclick = function () { form.hidden = false; add.hidden = true; var address = find('cwMailAddress'); if (address && typeof address.focus === 'function') address.focus(); };
    if (provider) provider.onchange = function () { apply(presets[provider.value]); };
    apply(provider ? presets[provider.value] : undefined);
    // A field the user has edited is never overwritten by discovery below; empty
    // means "I am not using this value", so an emptied field may be filled again.
    var dirty = {};
    ['cwMailImapHost', 'cwMailImapPort', 'cwMailImapSecure', 'cwMailSmtpHost', 'cwMailSmtpPort', 'cwMailSmtpSecure'].forEach(function (id) {
      var field = find(id);
      if (!field) return;
      var mark = function () { dirty[id] = field.type === 'checkbox' ? true : String(field.value || '').trim() !== ''; };
      field.oninput = mark;
      field.onchange = mark;
    });
    var fill = function (id, value, checked) {
      if (dirty[id]) return;
      var field = find(id);
      if (!field) return;
      if (checked === undefined) field.value = value; else field.checked = !!checked;
    };
    // Mailcow, Mail-in-a-Box and other self-hosted servers publish their settings
    // in DNS SRV records and a Thunderbird autoconfig document that a browser
    // cannot read, so the form asks the server. The lookup is debounced while the
    // user types, and a late answer never overwrites a newer one.
    var detectTimer = null, detectSeq = 0;
    var runDetect = function (address, seq) {
      if (seq !== detectSeq) return;
      api('/api/connected-apps/mail/detect?address=' + encodeURIComponent(address)).then(function (result) {
        if (seq !== detectSeq || !result || !result.domain) return;
        if (!result.found) {
          if (note) note.textContent = 'No published mail settings for ' + result.domain + '. Enter your servers below.';
          return;
        }
        if (result.imap) { fill('cwMailImapHost', result.imap.host); fill('cwMailImapPort', result.imap.port); fill('cwMailImapSecure', null, result.imap.secure !== false); }
        if (result.smtp) { fill('cwMailSmtpHost', result.smtp.host); fill('cwMailSmtpPort', result.smtp.port); fill('cwMailSmtpSecure', null, result.smtp.secure !== false); }
        if (result.username) fill('cwMailUsername', result.username);
        if (note) note.textContent = result.note || ('Found the mail servers published by ' + (result.provider || result.domain) + '.');
      }).catch(function () {});
    };
    var queueDetect = function (address) {
      detectSeq += 1;
      var seq = detectSeq;
      if (detectTimer) clearTimeout(detectTimer);
      detectTimer = setTimeout(function () { detectTimer = null; runDetect(address, seq); }, 450);
    };
    var cancelDetect = function () {
      detectSeq += 1;
      if (detectTimer) { clearTimeout(detectTimer); detectTimer = null; }
    };
    // Typing an address from a known provider fills the incoming and outgoing servers for the user.
    var addressField = find('cwMailAddress');
    if (addressField && provider) addressField.oninput = function () {
      var domain = String(addressField.value || '').split('@')[1];
      if (!domain) return;
      domain = domain.trim().toLowerCase();
      var match = ((cw.mail && cw.mail.providers) || []).find(function (item) { return (item.domains || []).indexOf(domain) >= 0; });
      if (match) {
        cancelDetect();
        if (provider.value !== match.id) { provider.value = match.id; apply(match); }
        return;
      }
      // Wait for a fully qualified domain before asking; every keystroke would
      // otherwise become a lookup.
      if (domain.indexOf('.') > 0 && domain.indexOf('.') < domain.length - 1) queueDetect(String(addressField.value || '').trim());
    };
    if (cw.mailFormOpen) { cw.mailFormOpen = false; form.hidden = false; if (add) add.hidden = true; }
    form.onsubmit = async function (event) {
      event.preventDefault();
      cancelDetect();
      var button = typeof form.querySelector === 'function' ? form.querySelector('button[type="submit"]') : null;
      var value = function (id) { var field = find(id); return field ? String(field.value || '').trim() : ''; };
      var checked = function (id) { var field = find(id); return !!(field && field.checked); };
      var preset = provider ? presets[provider.value] : undefined;
      var password = find('cwMailPassword');
      var payload = {
        agentId: agentId, provider: provider ? provider.value : undefined, address: value('cwMailAddress'), password: password ? password.value || '' : '', label: value('cwMailLabel'), username: value('cwMailUsername') || undefined,
        imapHost: value('cwMailImapHost') || (preset ? preset.imap.host : ''), imapPort: Number(value('cwMailImapPort')) || (preset ? preset.imap.port : 0), imapSecure: checked('cwMailImapSecure'),
        smtpHost: value('cwMailSmtpHost') || (preset ? preset.smtp.host : ''), smtpPort: Number(value('cwMailSmtpPort')) || (preset ? preset.smtp.port : 0), smtpSecure: checked('cwMailSmtpSecure'),
        allowSelfSigned: checked('cwMailSelfSigned')
      };
      if (error) error.hidden = true;
      if (button) button.disabled = true;
      try {
        var result = await api('/api/connected-apps/mail', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
        if (password) password.value = '';
        toast(result && result.warning ? result.warning : 'Mailbox connected. This teammate can read and send mail.');
        cwLoadServices(cw.servicesSearch || '', false);
      } catch (e) {
        if (error) { error.textContent = cwMailErrorText(e, 'Could not connect this mailbox. Check the server settings and the password.'); error.hidden = false; }
        if (button) button.disabled = false;
      }
    };
    var bind = function (attribute, path, done, failure) {
      root.querySelectorAll('[' + attribute + ']').forEach(function (button) {
        button.onclick = async function () {
          if (button.disabled) return;
          button.disabled = true;
          try {
            await api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ agentId: agentId, accountId: button.getAttribute(attribute) }) });
            toast(done);
            cwLoadServices(cw.servicesSearch || '', false);
          } catch (e) { toast(failure, true); button.disabled = false; }
        };
      });
    };
    bind('data-cwmailassign', '/api/connected-apps/assign', 'This teammate can now use that mailbox.', 'Could not assign this mailbox. Try again.');
    bind('data-cwmaildisconnect', '/api/connected-apps/disconnect', 'Removed this teammate access to that mailbox.', 'Could not remove this mailbox from this teammate. Try again.');
    bind('data-cwmailforget', '/api/connected-apps/mail/remove', 'Deleted the saved mailbox.', 'Could not delete this mailbox. Try again.');
  }
`;
