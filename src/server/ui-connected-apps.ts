export const CONNECTED_APPS_CSS = String.raw`
.cw-connection-nav{display:flex;gap:6px;padding:8px 12px}.cw-connection-nav button{flex:1;font-size:12px;padding:7px}.cw-services{height:100%;overflow:auto;padding:36px clamp(20px,4vw,52px);max-width:1100px;width:100%;margin:auto}.cw-services-head{display:flex;gap:16px;align-items:flex-start;justify-content:space-between}.cw-services h1{font-size:30px;letter-spacing:-.025em;margin:0 0 8px}.cw-services p{color:var(--muted);line-height:1.6}.cw-services-actions{display:flex;gap:8px;flex-wrap:wrap}.cw-services-search{display:flex;gap:8px;margin:26px 0}.cw-services-search input{flex:1;min-width:0;border:1px solid var(--border2);border-radius:10px;background:var(--card);color:var(--text);padding:11px 14px;font:inherit}.cw-service-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}.cw-service-card{border:1px solid var(--border);background:var(--card);border-radius:14px;padding:20px;display:flex;flex-direction:column;gap:12px}.cw-service-card h3{font-size:16px;margin:0}.cw-service-symbol{width:40px;height:40px;display:grid;place-items:center;border-radius:10px;background:var(--card2);color:var(--accent);font-size:18px;font-weight:650}.cw-service-status{font-size:12px;color:var(--muted)}.cw-service-status.connected{color:var(--ok)}.cw-service-card .btn{align-self:flex-start}.cw-service-empty{border:1px dashed var(--border2);padding:30px;border-radius:14px}.cw-provider-form{max-width:460px;margin-top:22px}.cw-provider-form label{display:block;font-size:13px;margin-bottom:8px}.cw-provider-form input{width:100%;padding:11px 14px;border:1px solid var(--border2);border-radius:9px;background:var(--card);color:var(--text);font:inherit}.cw-provider-form .btn{margin-top:12px}.cw-services-error{color:var(--err)!important}.cw-account-row{display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border);padding:12px 0}.cw-account-row span{flex:1}.cw-service-more{margin-top:20px}@media(max-width:720px){.cw-services{padding-top:20px}.cw-services-head{flex-direction:column}.cw-service-grid{grid-template-columns:1fr}}
`;

export const CONNECTED_APPS_JS = String.raw`
  async function cwLockApp() {
    try { await api('/api/auth/logout', {method:'POST'}); } finally { location.replace('/auth'); }
  }
  function cwOpenConnections() {
    cwSaveDraft(); cwStopPoll(); cwClosePanels();
    var cw = cwEnsure(); cw.connectionsOpen = true; cw.connectionRevision = (cw.connectionRevision || 0) + 1;
    cwSyncPanels(); document.title='Connections — Cowork';
    $('cwChat').innerHTML = '<main class="cw-services"><div class="cw-services-head"><div><h1>Connections</h1><p>Choose the services your teammates can use.</p></div><div class="cw-services-actions"><button class="btn ghost" id="cwServicesBack">Back to chat</button><button class="btn ghost" id="cwServicesRefresh">Refresh</button></div></div><div id="cwServicesContent"><p role="status">Loading services…</p></div></main>';
    $('cwServicesBack').onclick = function(){cw.connectionsOpen=false;cw.connectionRevision++;cwRenderChat();if(cw.active){cwStartStream(cw.active);cwPoll();cw.timer=setInterval(cwPoll,2000);}};
    $('cwServicesRefresh').onclick=function(){cwLoadServices('',false);};
    cwLoadServices('',false);
  }
  function cwServiceStatus(status, disabled) {
    if(disabled)return 'Disconnected';
    return ({ACTIVE:'Connected',EXPIRED:'Reconnect needed',REVOKED:'Disconnected',INACTIVE:'Disconnected',INITIATED:'Waiting for sign-in',INITIALIZING:'Waiting for sign-in',FAILED:'Connection failed'})[status] || 'Not connected';
  }
  async function cwLoadServices(search, more) {
    var cw=cwEnsure(), revision=++cw.connectionRevision;
    try {
      var data=await api('/api/connected-apps?search='+encodeURIComponent(search)+(more&&cw.servicesCursor?'&cursor='+encodeURIComponent(cw.servicesCursor):''));
      if(!cw.connectionsOpen||revision!==cw.connectionRevision)return;
      var content=$('cwServicesContent'); if(!content)return;
      if(!data.configured){
        if(data.canConfigure===false){content.innerHTML='<section class="cw-service-empty"><h2>Connect your apps</h2><p>Enable encrypted integration storage in your server settings, or set COMPOSIO_API_KEY in Coolify. Then refresh this page.</p></section>';return;}
        content.innerHTML='<section class="cw-service-empty"><h2>Connect your apps</h2><p>Set up Composio once, then choose services and sign in to each account.</p><p><a href="https://dashboard.composio.dev" target="_blank" rel="noopener noreferrer">Get your Composio API key</a></p><form class="cw-provider-form" id="cwProviderForm"><label for="cwProviderKey">Composio API key</label><input id="cwProviderKey" type="password" autocomplete="new-password" required maxlength="4096"><button class="btn dark" type="submit">Set up connections</button><p id="cwProviderError" role="alert" class="cw-services-error" hidden></p></form><p>' + (data.keyStorage==='windows-dpapi'?'Your key is encrypted using your Windows account.':'Your key is encrypted on your Gitu server and never included in chats.') + '</p></section>';
        $('cwProviderForm').onsubmit=async function(event){event.preventDefault();var input=$('cwProviderKey'),button=this.querySelector('button'),error=$('cwProviderError');button.disabled=true;error.hidden=true;try{await api('/api/connected-apps/configure',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({apiKey:input.value})});input.value='';cwLoadServices('',false);}catch(e){error.textContent='Could not set up Composio. Check your API key and try again.';error.hidden=false;button.disabled=false;}};
        return;
      }
      cw.services=more?(cw.services||[]).concat(data.services||[]):(data.services||[]);cw.servicesCursor=data.cursor;cw.servicesSearch=search;
      var accounts=data.accounts||[],active=accounts.filter(function(a){return a.status==='ACTIVE'&&!a.disabled;});
      content.innerHTML='<form class="cw-services-search" id="cwServicesSearch"><input type="search" aria-label="Search services" placeholder="Search Gmail, Drive, Slack, and more…" value="'+esc(search)+'"><button class="btn ghost">Search</button></form>'+
        (accounts.length?'<section aria-label="Your accounts"><h2>Your accounts</h2>'+accounts.map(function(a){return '<div class="cw-account-row"><span><strong>'+esc(a.toolkit)+'</strong> · '+esc(a.id.slice(-8))+' · '+esc(cwServiceStatus(a.status,a.disabled))+'</span><button class="btn ghost" data-cwdisconnect="'+esc(a.id)+'"'+(a.status==='REVOKED'?' disabled':'')+'>Disconnect</button></div>';}).join('')+'</section>':'')+
        '<h2>Browse services</h2><p>Connect an account to make its tools available. Each agent action is shown for review before it runs.</p><div class="cw-service-grid">'+(cw.services.length?cw.services.map(function(service){var account=active.find(function(a){return a.toolkit===service.slug;});var status=account?'Connected':cwServiceStatus(service.status,false);return '<article class="cw-service-card"><div class="cw-service-symbol" aria-hidden="true">'+esc(service.name.slice(0,1).toUpperCase())+'</div><h3>'+esc(service.name)+'</h3><span class="cw-service-status'+(account?' connected':'')+'">'+esc(status)+'</span><button class="btn '+(account?'ghost':'dark')+'" data-cwconnect="'+esc(service.slug)+'">'+(account?'Add account':status==='Reconnect needed'?'Reconnect':'Connect')+'</button></article>';}).join(''):'<p>No services match your search.</p>')+'</div>'+(cw.servicesCursor?'<button class="btn ghost cw-service-more" id="cwServicesMore">Load more services</button>':'');
      $('cwServicesSearch').onsubmit=function(event){event.preventDefault();cwLoadServices(this.querySelector('input').value.trim(),false);};
      var moreButton=$('cwServicesMore');if(moreButton)moreButton.onclick=function(){moreButton.disabled=true;cwLoadServices(cw.servicesSearch,true);};
      content.querySelectorAll('[data-cwconnect]').forEach(function(button){button.onclick=async function(){button.disabled=true;try{var result=await api('/api/connected-apps/connect',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({service:button.getAttribute('data-cwconnect')})});var url=new URL(result.url);if(url.protocol!=='https:'||['connect.composio.dev','backend.composio.dev'].indexOf(url.hostname)<0)throw new Error('Invalid link');var link=document.createElement('a');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';link.className='btn dark';link.textContent='Continue sign-in';button.replaceWith(link);toast('Finish signing in, then refresh Connections.');}catch(e){toast('Could not start sign-in. Try again.',true);}finally{button.disabled=false;}};});
      content.querySelectorAll('[data-cwdisconnect]').forEach(function(button){button.onclick=async function(){button.disabled=true;try{await api('/api/connected-apps/disconnect',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:button.getAttribute('data-cwdisconnect')})});cwLoadServices(cw.servicesSearch,false);}catch(e){toast('Could not disconnect this account. Try again.',true);button.disabled=false;}};});
    } catch(e) {
      if(!cw.connectionsOpen||revision!==cw.connectionRevision)return;
      var content=$('cwServicesContent');if(content)content.innerHTML='<p class="cw-services-error" role="alert">Could not load your services. Check your connection and refresh.</p>';
    }
  }
`;
