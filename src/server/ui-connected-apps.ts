export const CONNECTED_APPS_CSS = String.raw`
.cw-connection-nav{display:flex;gap:6px;padding:8px 12px}.cw-connection-nav button{flex:none;width:32px;height:32px;padding:7px}.cw-services{height:100%;overflow:auto;padding:36px clamp(20px,4vw,52px);max-width:1100px;width:100%;margin:auto}.cw-services-head{display:flex;gap:16px;align-items:flex-start;justify-content:space-between}.cw-services h1{font-size:30px;letter-spacing:-.025em;margin:0 0 8px}.cw-services p{color:var(--muted);line-height:1.6}.cw-services-actions{display:flex;gap:8px;flex-wrap:wrap}.cw-services-search{display:flex;gap:8px;margin:26px 0}.cw-services-search input{flex:1;min-width:0;border:1px solid var(--border2);border-radius:10px;background:var(--card);color:var(--text);padding:11px 14px;font:inherit}.cw-service-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}.cw-service-card{border:1px solid var(--border);background:var(--card);border-radius:14px;padding:20px;display:flex;flex-direction:column;gap:12px}.cw-service-card h3{font-size:16px;margin:0}.cw-service-symbol{width:40px;height:40px;display:grid;place-items:center;border-radius:10px;background:var(--card2);color:var(--accent);font-size:18px;font-weight:650}.cw-service-status{font-size:12px;color:var(--muted)}.cw-service-status.connected{color:var(--ok)}.cw-service-card .btn{align-self:flex-start}.cw-service-empty{border:1px dashed var(--border2);padding:30px;border-radius:14px}.cw-provider-form{max-width:460px;margin-top:22px}.cw-provider-form label{display:block;font-size:13px;margin-bottom:8px}.cw-provider-form input{width:100%;padding:11px 14px;border:1px solid var(--border2);border-radius:9px;background:var(--card);color:var(--text);font:inherit}.cw-provider-form .btn{margin-top:12px}.cw-services-error{color:var(--err)!important}.cw-account-row{display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border);padding:12px 0}.cw-account-row span{flex:1}.cw-service-more{margin-top:20px}@media(max-width:720px){.cw-services{padding-top:20px}.cw-services-head{flex-direction:column}.cw-service-grid{grid-template-columns:1fr}}
.cw-service-symbol>*{grid-area:1/1}.cw-service-symbol.has-logo{background:#fff}.cw-service-logo{width:32px;height:32px;object-fit:contain;opacity:0}.cw-service-logo.loaded{opacity:1}.cw-account-row .cw-service-symbol{flex:none}
.cw-service-symbol .cw-tool-ico{width:28px;height:28px;color:var(--accent)}.cw-service-symbol .cw-tool-ico svg{width:25px;height:25px}.cw-service-symbol .cw-tool-ico .cw-fav{width:28px;height:28px;background:#fff;border-radius:5px}
.cw-app-permission-copy{display:flex;flex-direction:column;gap:3px;min-width:0;overflow-wrap:anywhere}.cw-app-permission-copy small{color:var(--muted)}
.cw-services-agent{margin:22px 0 8px;display:flex;align-items:center;gap:10px}.cw-services-agent select{font:inherit;color:var(--text);background:var(--card);border:1px solid var(--border2);border-radius:9px;padding:9px 12px;min-width:160px}.cw-app-suggestion{max-width:470px}.cw-app-suggestion-head{display:flex;align-items:center;gap:12px;margin:8px 0 12px}.cw-app-suggestion-head strong{display:block;font-size:15px}.cw-app-suggestion-head small{display:block;color:var(--muted);margin-top:3px}.cw-app-suggestion p{margin:0 0 12px;line-height:1.6;color:var(--muted)}.cw-app-controls{position:relative;display:flex;align-items:center;gap:8px;min-height:34px}.cw-app-connected{display:inline-flex;align-items:center;gap:7px;color:var(--ok);font-size:12px;font-weight:600}.cw-app-connected svg{width:16px;height:16px}.cw-app-connected.just-connected{animation:cw-app-connected-in .5s cubic-bezier(.16,1,.3,1) both}.cw-app-connect-exit{position:absolute;inset:0 auto auto 0;pointer-events:none;animation:cw-app-connect-out .22s ease-in both}.cw-app-suggestion.just-connected .cw-service-symbol{animation:cw-app-icon-settle .6s cubic-bezier(.16,1,.3,1) both}@keyframes cw-app-connected-in{from{opacity:0;transform:translateY(5px) scale(.94)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes cw-app-connect-out{to{opacity:0;transform:translateY(-5px) scale(.96)}}@keyframes cw-app-icon-settle{0%{transform:scale(1)}35%{transform:scale(1.1)}100%{transform:scale(1)}}@media(prefers-reduced-motion:reduce){.cw-app-connected.just-connected,.cw-app-connect-exit,.cw-app-suggestion.just-connected .cw-service-symbol{animation:none}}
`;

export const CONNECTED_APPS_JS = String.raw`
  async function cwLockApp() {
    try { await api('/api/auth/logout', {method:'POST'}); } finally { location.replace('/auth'); }
  }
  function cwOpenConnections(agentId) {
    cwSaveDraft(); cwStopPoll(); cwClosePanels();
    var cw = cwEnsure(); cw.galleryOpen = false; cw.connectionsOpen = true; cw.connectionRevision = (cw.connectionRevision || 0) + 1;
    cw.connectionsAgentId=agentId||cw.selectedAgentId||'';
    cwSyncPanels(); document.title='Connections — Cowork';
    $('cwChat').innerHTML = '<main class="cw-services"><div class="cw-services-head"><div><h1>Connections</h1><p>Choose apps for each teammate. Accounts are only available to teammates you assign.</p></div><div class="cw-services-actions"><button class="btn ghost" id="cwServicesBack">Back to chat</button><button class="btn ghost" id="cwServicesRefresh">Refresh</button></div></div><label class="cw-services-agent">Teammate <select id="cwServicesAgent" aria-label="Connection teammate"></select></label><div id="cwServicesContent"><p role="status">Loading services…</p></div></main>';
    $('cwServicesBack').onclick = function(){cw.connectionsOpen=false;cw.connectionRevision++;cwRenderChat();if(cw.active){cwStartStream(cw.active);cwPoll();cw.timer=setInterval(cwPoll,2000);}};
    $('cwServicesRefresh').onclick=function(){cwLoadServices('',false);};
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
      try{
        var result=await api('/api/connected-apps/connect',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({agentId:request.agentId,service:request.appConnection.service,requestId:request.id})});
        var url=new URL(result.url);if(url.protocol!=='https:'||['connect.composio.dev','backend.composio.dev'].indexOf(url.hostname)<0)throw new Error('Invalid link');
        (cw.appAuthLinks||(cw.appAuthLinks={}))[request.id]=url.href;
        cw.appConnectionsChecked=0;cwRenderMsgs();cwPollAppConnections();
        toast('Continue sign-in. This card updates automatically when connected.');
      }catch(e){toast('Could not start sign-in. Check Connections and try again.',true);button.disabled=false;}
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
    return '<section aria-label="Always allowed actions"><h2>Always allowed actions</h2><p>These tools can run without asking again, for the teammate and account shown.</p>'+permissions.map(function(permission){
      return '<div class="cw-account-row">'+cwToolIconHtml({tool:'connected_apps',appService:permission.service})+'<span class="cw-app-permission-copy"><strong>'+esc(cwAppActionName(permission.tool,permission.service))+'</strong><small>@'+esc(permission.agentName)+' · '+esc(cwActionWords(permission.service))+' · Account '+esc(permission.accountId.slice(-8))+'</small></span><button class="btn ghost" data-cwrevokeapp="'+esc(permission.id)+'">Revoke</button></div>';
    }).join('')+'</section>';
  }
  function cwBindAppPermissions(root) {
    root.querySelectorAll('[data-cwrevokeapp]').forEach(function(button){button.onclick=async function(){button.disabled=true;try{
      await api('/api/connected-apps/permissions/'+encodeURIComponent(button.getAttribute('data-cwrevokeapp')),{method:'DELETE'});
      toast('Permission revoked. The next action will ask for approval.');cwLoadServices(cwEnsure().servicesSearch||'',false);
    }catch(e){toast('Could not revoke this permission. Try again.',true);button.disabled=false;}};});
  }
  async function cwLoadServices(search, more) {
    var cw=cwEnsure(), revision=++cw.connectionRevision;
    try {
      var agentId=cw.connectionsAgentId||'';
      var data=await api('/api/connected-apps?agentId='+encodeURIComponent(agentId)+'&search='+encodeURIComponent(search)+(more&&cw.servicesCursor?'&cursor='+encodeURIComponent(cw.servicesCursor):''));
      if(!cw.connectionsOpen||revision!==cw.connectionRevision)return;
      var content=$('cwServicesContent'); if(!content)return;
      var select=$('cwServicesAgent'),agents=data.agents||cw.agents||[];
      if(select){select.innerHTML='<option value="">Choose a teammate</option>'+agents.map(function(agent){return '<option value="'+esc(agent.id)+'"'+(agent.id===agentId?' selected':'')+'>'+esc(agent.name)+'</option>';}).join('');select.onchange=function(){cw.connectionsAgentId=select.value;cwLoadServices('',false);};}
      if(!data.configured){
        if(data.canConfigure===false){content.innerHTML='<section class="cw-service-empty"><h2>Connect your apps</h2><p>Enable encrypted integration storage in your server settings, or set COMPOSIO_API_KEY in Coolify. Then refresh this page.</p></section>'+cwAppPermissionsHtml(data.appPermissions);cwBindAppPermissions(content);return;}
        content.innerHTML='<section class="cw-service-empty"><h2>Connect your apps</h2><p>Set up Composio once, then choose services and sign in to each account.</p><p><a href="https://dashboard.composio.dev" target="_blank" rel="noopener noreferrer">Get your Composio API key</a></p><form class="cw-provider-form" id="cwProviderForm"><label for="cwProviderKey">Composio API key</label><input id="cwProviderKey" type="password" autocomplete="new-password" required maxlength="4096"><button class="btn dark" type="submit">Set up connections</button><p id="cwProviderError" role="alert" class="cw-services-error" hidden></p></form><p>' + (data.keyStorage==='windows-dpapi'?'Your key is encrypted using your Windows account.':'Your key is encrypted on your Gitu server and never included in chats.') + '</p></section>';
        $('cwProviderForm').onsubmit=async function(event){event.preventDefault();var input=$('cwProviderKey'),button=this.querySelector('button'),error=$('cwProviderError');button.disabled=true;error.hidden=true;try{await api('/api/connected-apps/configure',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({apiKey:input.value})});input.value='';cwLoadServices('',false);}catch(e){error.textContent='Could not set up Composio. Check your API key and try again.';error.hidden=false;button.disabled=false;}};
        content.insertAdjacentHTML('beforeend',cwAppPermissionsHtml(data.appPermissions));cwBindAppPermissions(content);
        return;
      }
      if(!agentId){content.innerHTML='<section class="cw-service-empty"><h2>Choose a teammate</h2><p>Each teammate has its own connected apps. Select one above to connect an app or assign an existing account.</p></section>';return;}
      cwSetAppConnectionState(agentId,data);
      cw.services=more?(cw.services||[]).concat(data.services||[]):(data.services||[]);cw.servicesCursor=data.cursor;cw.servicesSearch=search;
      var accounts=data.accounts||[],active=accounts.filter(function(a){return a.status==='ACTIVE'&&!a.disabled;}),available=data.availableAccounts||[];
      content.innerHTML='<form class="cw-services-search" id="cwServicesSearch"><input type="search" aria-label="Search services" placeholder="Search Gmail, Drive, Slack, and more…" value="'+esc(search)+'"><button class="btn ghost">Search</button></form>'+
        (accounts.length?'<section aria-label="Teammate accounts"><h2>Connected for this teammate</h2>'+accounts.map(function(a){var service=cw.services.find(function(s){return s.slug===a.toolkit;})||{name:a.toolkit};return '<div class="cw-account-row">'+cwServiceIcon(service)+'<span><strong>'+esc(service.name)+'</strong> · '+esc(a.id.slice(-8))+' · '+esc(cwServiceStatus(a.status,a.disabled))+'</span><button class="btn ghost" data-cwdisconnect="'+esc(a.id)+'">Remove access</button></div>';}).join('')+'</section>':'')+
        (available.length?'<section aria-label="Existing accounts"><h2>Use an existing account</h2><p>Assign an account to this teammate explicitly. Other teammates keep their own access.</p>'+available.map(function(a){return '<div class="cw-account-row">'+cwToolIconHtml({tool:'connected_apps',appService:a.toolkit})+'<span>'+esc(cwActionWords(a.toolkit))+' · '+esc(a.id.slice(-8))+'</span><button class="btn ghost" data-cwassignapp="'+esc(a.id)+'">Assign to teammate</button></div>';}).join('')+'</section>':'')+
        cwAppPermissionsHtml(data.appPermissions)+
        '<h2>Browse services</h2><p>Connect an account to make its tools available. Actions ask for approval unless you choose Always allow.</p><div class="cw-service-grid">'+(cw.services.length?cw.services.map(function(service){var account=active.find(function(a){return a.toolkit===service.slug;});var status=account?'Connected':cwServiceStatus(service.status,false);return '<article class="cw-service-card">'+cwServiceIcon(service)+'<h3>'+esc(service.name)+'</h3><span class="cw-service-status'+(account?' connected':'')+'">'+esc(status)+'</span><button class="btn '+(account?'ghost':'dark')+'" data-cwconnect="'+esc(service.slug)+'">'+(account?'Add account':status==='Reconnect needed'?'Reconnect':'Connect')+'</button></article>';}).join(''):'<p>No services match your search.</p>')+'</div>'+(cw.servicesCursor?'<button class="btn ghost cw-service-more" id="cwServicesMore">Load more services</button>':'');
      cwBindServiceIcons(content);
      cwBindAppPermissions(content);
      $('cwServicesSearch').onsubmit=function(event){event.preventDefault();cwLoadServices(this.querySelector('input').value.trim(),false);};
      var moreButton=$('cwServicesMore');if(moreButton)moreButton.onclick=function(){moreButton.disabled=true;cwLoadServices(cw.servicesSearch,true);};
      content.querySelectorAll('[data-cwconnect]').forEach(function(button){button.onclick=async function(){button.disabled=true;try{var result=await api('/api/connected-apps/connect',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({agentId:agentId,service:button.getAttribute('data-cwconnect')})});var url=new URL(result.url);if(url.protocol!=='https:'||['connect.composio.dev','backend.composio.dev'].indexOf(url.hostname)<0)throw new Error('Invalid link');var link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.className='btn dark';link.textContent='Continue sign-in';button.replaceWith(link);toast('Finish signing in, then refresh Connections.');}catch(e){toast('Could not start sign-in. Try again.',true);}finally{button.disabled=false;}};});
      content.querySelectorAll('[data-cwassignapp]').forEach(function(button){button.onclick=async function(){button.disabled=true;try{await api('/api/connected-apps/assign',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({agentId:agentId,accountId:button.getAttribute('data-cwassignapp')})});cwLoadServices(cw.servicesSearch,false);}catch(e){toast('Could not assign this account. Try again.',true);button.disabled=false;}};});
      content.querySelectorAll('[data-cwdisconnect]').forEach(function(button){button.onclick=async function(){button.disabled=true;try{await api('/api/connected-apps/disconnect',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({agentId:agentId,accountId:button.getAttribute('data-cwdisconnect')})});cwLoadServices(cw.servicesSearch,false);}catch(e){toast('Could not remove this teammate’s access. Try again.',true);button.disabled=false;}};});
    } catch(e) {
      if(!cw.connectionsOpen||revision!==cw.connectionRevision)return;
      var content=$('cwServicesContent');if(content)content.innerHTML='<p class="cw-services-error" role="alert">Could not load your services. Check your connection and refresh.</p>';
    }
  }
`;
