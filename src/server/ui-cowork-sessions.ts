/** Session controls shared by Cowork chat, profile, and search surfaces. */
export const COWORK_SESSIONS_CSS = String.raw`
  @media(max-width:600px) {
    #cw .cw-top-nav button { padding:0 10px; }
    #cw .cw-top-nav button > span:not(.cw-chat-face) { display:none; }
  }
`;

export const COWORK_SESSIONS_JS = String.raw`
  function cwSessionNavHtml() {
    return '<button type="button" id="cwSessionsBtn" aria-label="Sessions" title="Browse and delete sessions">'+cwIcon('chat')+'<span>Sessions</span></button>'+
      '<button type="button" id="cwNewSessionBtn" aria-label="New session" title="New session">'+cwIcon('plus')+'<span>New session</span></button>';
  }
  function cwNewSessionModal() {
    var cw=cwEnsure();
    if(!cw.agents.length){toast('Create a teammate before starting a session.');cwAgentModal(null);return;}
    var active=cwActiveConv(),chosen=active?active.memberIds.slice():[cw.selectedAgentId||cw.agents[0].id];
    var modal=document.createElement('div');modal.className='modal cw-modal';
    modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','cwSessionTitle');
    modal.innerHTML='<div class="box"><div class="bar"><span id="cwSessionTitle">New session</span><span style="flex:1"></span><button class="btn ghost" id="cwSessionCancel">Cancel</button></div>'+
      '<div class="cw-body"><label for="cwSessionName">Session name (optional)</label><input id="cwSessionName" type="text" placeholder="Research for the next launch">'+
      '<label>Teammates</label><div class="cw-skills" aria-label="Session teammates">'+cw.agents.map(function(agent){var selected=chosen.indexOf(agent.id)>=0;return '<button type="button" data-session-member="'+esc(agent.id)+'" class="'+(selected?'on':'')+'" aria-pressed="'+selected+'">'+esc(agent.name)+'</button>';}).join('')+'</div>'+
      '<div class="cw-note">Start a fresh conversation with one teammate or a group. Threads organize topics inside a session.</div></div>'+
      '<div class="cw-foot"><span style="flex:1"></span><button class="btn dark" id="cwSessionSave">Create session</button></div></div>';
    document.body.appendChild(modal);var close=cwBindDialog(modal,'#cwSessionName');
    modal.querySelector('#cwSessionCancel').onclick=close;
    modal.querySelectorAll('[data-session-member]').forEach(function(button){button.onclick=function(){
      var id=button.getAttribute('data-session-member'),index=chosen.indexOf(id);
      if(index<0)chosen.push(id);else chosen.splice(index,1);
      button.classList.toggle('on',index<0);button.setAttribute('aria-pressed',String(index<0));
    };});
    modal.querySelector('#cwSessionSave').onclick=function(){
      var save=modal.querySelector('#cwSessionSave');if(save.disabled)return;
      if(!chosen.length){toast('Choose at least one teammate.',true);return;}
      save.disabled=true;
      var payload={kind:chosen.length===1?'dm':'group',title:modal.querySelector('#cwSessionName').value.trim(),memberIds:chosen.slice()};
      return api('/api/cowork/conversations',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}).then(function(data){
        var open=modal.isConnected!==false&&S.active==='cowork';close();
        cw.convs=cw.convs.filter(function(conv){return conv.id!==data.conversation.id;}).concat([data.conversation]);
        if(open)cwOpenConv(data.conversation.id,null);
      }).catch(function(error){save.disabled=false;toast(error.message,true);});
    };
  }
  function cwDeleteSession(id) {
    return api('/api/cowork/conversations/'+encodeURIComponent(id),{method:'DELETE'}).then(function(){
      var cw=cwEnsure(),wasActive=cw.active===id;
      if(wasActive){cwStopPoll();cw.active=null;cw.threadId=null;cw.msgs=[];cw.threads=[];cw.folders=[];cw.widgets=[];cw.pendingFiles=[];cw.artifacts=[];cw.todos=[];cw.requests=[];cw.workHistory=[];cw.referencedMessageIds=[];cw.widgetRequest=null;cw.working=null;cw.progress=null;cw.progresses=[];cw.queued=0;cw.subAgents={nodes:[]};cw.profileOpen=false;cw.connectionsOpen=false;cw.busy=false;}
      cw.convs=cw.convs.filter(function(conv){return conv.id!==id;});
      cwPurgeOfflineChat(id);
      cwPersistOfflineRoster();
      Object.keys(cw.outbox).forEach(function(key){if(cw.outbox[key].conversationId===id)delete cw.outbox[key];});
      if(cw.chatViews)Array.from(cw.chatViews.keys()).forEach(function(key){if(JSON.parse(key)[0]===id)cw.chatViews.delete(key);});
      try { if(typeof localStorage!=='undefined'){
        var prefix='hermes.cowork.draft.'+encodeURIComponent(id)+'.';
        for(var index=localStorage.length-1;index>=0;index--){var key=localStorage.key(index);if(key&&key.indexOf(prefix)===0)localStorage.removeItem(key);}
      } } catch(error) {}
      if(S.active==='cowork'){
        if(wasActive){var next=cw.convs[cw.convs.length-1];if(next)cwOpenConv(next.id);else cwRenderChat();}
        cwRenderRail();
      }
      toast('Session deleted');
    });
  }
`;
