/** Session controls shared by Cowork chat, profile, and search surfaces. */
export const COWORK_SESSIONS_CSS = String.raw`
  @media(max-width:600px) {
    #cw .cw-top-nav button { padding:0 12px; }

  }
`;

export const COWORK_SESSIONS_JS = String.raw`
  function cwSessionNavHtml() {
    return '<button type="button" class="cw-tool-item" id="cwSessionsBtn" aria-label="Sessions" title="Browse and delete sessions">'+cwIcon('chat')+'<span>Sessions</span></button>'+
      '<button type="button" class="cw-tool-item" id="cwNewSessionBtn" aria-label="New session" title="New session">'+cwIcon('plus')+'<span>New session</span></button>';
  }
  function cwNewSessionModal() {
    var cw=cwEnsure();
    if(!cw.agents.length){toast('Create a teammate before starting a session.');cwAgentModal(null);return;}
    var active=(S&&S.active==='cowork')?cwActiveConv():null,chosen=active?active.memberIds.slice():[cw.selectedAgentId||cw.agents[0].id];
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
        var connected=modal.isConnected!==false,inCowork=S.active==='cowork';close();
        cw.convs=cw.convs.filter(function(conv){return conv.id!==data.conversation.id;}).concat([data.conversation]);
        if(typeof homeRenderSidebarAgentState==='function')homeRenderSidebarAgentState();
        if(connected&&inCowork)cwOpenConv(data.conversation.id,null);
        else if(connected&&typeof cwEnterWorkspace==='function')cwEnterWorkspace('conv',chosen[0],data.conversation.id);
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
  function cwSessionsModal(initialTab) {
    var cw=cwEnsure(),tab=initialTab==='groups'?'groups':'sessions',showAll=false,query='',hits=[],timer=null,seq=0;
    var active=cwActiveConv(),selId=cw.selectedAgentId||(active&&(active.kind==='dm'?active.memberIds&&active.memberIds[0]:active.chiefId||(active.memberIds&&active.memberIds[0])))||'';
    var selAgent=(cw.agents||[]).find(function(a){return a.id===selId;})||null;
    var modal=document.createElement('div');modal.className='modal cw-modal';
    modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','cwSessionsDialogTitle');
    modal.innerHTML='<div class="box"><div class="bar"><span id="cwSessionsDialogTitle">'+(tab==='groups'?'Groups':'Sessions')+'</span><span style="flex:1"></span><button class="btn ghost" id="cwSessionsClose">Close</button></div>'+
      '<div class="cw-body">'+
        '<input id="cwSessionsFilter" type="search" autocomplete="off" placeholder="Filter sessions, groups, or search messages…">'+
        '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:12px 0">'+
          '<div class="cw-skills" style="margin:0"><button type="button" id="cwTabSessions" class="'+(tab==='sessions'?'on':'')+'" aria-pressed="'+(tab==='sessions')+'">Sessions</button><button type="button" id="cwTabGroups" class="'+(tab==='groups'?'on':'')+'" aria-pressed="'+(tab==='groups')+'">Groups</button></div>'+
          '<div style="display:flex;gap:6px;align-items:center">'+(selAgent?'<button type="button" class="btn ghost" id="cwSessionsScope">Show all</button>':'')+'<button type="button" class="btn dark" id="cwSessionsCreate">'+cwIcon('plus')+'<span>'+(tab==='groups'?'New group':'New session')+'</span></button></div>'+
        '</div>'+
        '<div id="cwSessionsList" style="display:grid;gap:6px;max-height:360px;overflow:auto"></div>'+
      '</div></div>';
    document.body.appendChild(modal);var close=cwBindDialog(modal,'#cwSessionsFilter');
    modal.querySelector('#cwSessionsClose').onclick=close;
    function render(){
      if(modal.isConnected===false)return;
      modal.querySelector('#cwSessionsDialogTitle').textContent=tab==='groups'?'Groups':'Sessions';
      var tSess=modal.querySelector('#cwTabSessions'),tGrp=modal.querySelector('#cwTabGroups'),createBtn=modal.querySelector('#cwSessionsCreate'),scopeBtn=modal.querySelector('#cwSessionsScope');
      if(tSess){tSess.classList.toggle('on',tab==='sessions');tSess.setAttribute('aria-pressed',String(tab==='sessions'));}
      if(tGrp){tGrp.classList.toggle('on',tab==='groups');tGrp.setAttribute('aria-pressed',String(tab==='groups'));}
      if(createBtn)createBtn.innerHTML=cwIcon('plus')+'<span>'+(tab==='groups'?'New group':'New session')+'</span>';
      if(scopeBtn&&selAgent)scopeBtn.textContent=showAll?('Only '+selAgent.name):'Show all';
      var q=query.trim().toLowerCase();
      var list=(cw.convs||[]).filter(function(conv){
        if(!conv)return false;
        if(tab==='groups'?conv.kind!=='group':conv.kind==='group')return false;
        if(selId&&!showAll&&Array.isArray(conv.memberIds)&&conv.memberIds.indexOf(selId)<0)return false;
        if(q&&String(conv.title||'Conversation').toLowerCase().indexOf(q)<0)return false;
        return true;
      });
      var html=list.map(function(conv){
        var isCur=cw.active===conv.id;
        return '<div style="display:flex;align-items:center;gap:6px;padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:'+(isCur?'var(--selected)':'var(--card2)')+'">'+
          '<button type="button" data-open-conv="'+esc(conv.id)+'" style="flex:1;min-width:0;display:flex;align-items:center;gap:8px;text-align:left;background:none;border:0;color:var(--text);font:inherit;cursor:pointer;padding:0">'+
            cwIcon(conv.kind==='group'?'users':'chat')+
            '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:'+(isCur?'600':'500')+'">'+esc(conv.title||(conv.kind==='group'?'Group conversation':'Conversation'))+'</span>'+
          '</button>'+
          '<button type="button" class="btn ghost" data-del-conv="'+esc(conv.id)+'" style="padding:4px 8px;min-height:28px;font-size:11px">Delete</button>'+
        '</div>';
      }).join('');
      if(!html)html='<div class="cw-note" style="margin:8px 0">'+(tab==='groups'?(selAgent&&!showAll?'No groups connected to '+esc(selAgent.name)+' yet.':'No groups yet.'):(selAgent&&!showAll?'No sessions for '+esc(selAgent.name)+' yet.':'No sessions yet.'))+'</div>';
      if(hits.length){
        html+='<div class="cw-note" style="margin:12px 0 4px;font-weight:600">Matching messages</div>'+hits.map(function(hit){
          return '<button type="button" data-open-hit="'+esc(hit.conversationId)+'" data-hit-thread="'+esc(hit.threadId||'')+'" style="display:grid;gap:2px;padding:8px 10px;border:1px solid var(--border);border-radius:10px;background:var(--card2);text-align:left;color:var(--text);cursor:pointer"><strong>'+esc(hit.conversationTitle||'Conversation')+'</strong><small style="color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(hit.snippet||'')+'</small></button>';
        }).join('');
      }
      var target=modal.querySelector('#cwSessionsList');
      target.innerHTML=html;
      target.querySelectorAll('[data-open-conv]').forEach(function(btn){
        btn.onclick=function(){var id=btn.getAttribute('data-open-conv');close();cwOpenConv(id,null);};
      });
      target.querySelectorAll('[data-open-hit]').forEach(function(btn){
        btn.onclick=function(){var id=btn.getAttribute('data-open-hit'),tid=btn.getAttribute('data-hit-thread')||null;close();cwOpenConv(id,tid);};
      });
      target.querySelectorAll('[data-del-conv]').forEach(function(btn){
        btn.onclick=function(){
          if(btn.disabled)return;
          if(btn.getAttribute('data-armed')!=='true'){btn.setAttribute('data-armed','true');btn.textContent='Delete?';return;}
          btn.disabled=true;
          var id=btn.getAttribute('data-del-conv');
          cwDeleteSession(id).then(function(){render();}).catch(function(err){btn.disabled=false;btn.setAttribute('data-armed','false');btn.textContent='Delete';toast(err.message,true);});
        };
      });
    }
    modal.querySelector('#cwTabSessions').onclick=function(){tab='sessions';render();};
    modal.querySelector('#cwTabGroups').onclick=function(){tab='groups';render();};
    if(modal.querySelector('#cwSessionsScope'))modal.querySelector('#cwSessionsScope').onclick=function(){showAll=!showAll;render();};
    modal.querySelector('#cwSessionsCreate').onclick=function(){
      close();
      if(tab==='groups'&&typeof cwGroupModal==='function')cwGroupModal(selId||undefined);
      else cwNewSessionModal();
    };
    var input=modal.querySelector('#cwSessionsFilter');
    input.oninput=function(){
      query=input.value||'';hits=[];clearTimeout(timer);render();
      var q=query.trim(),curSeq=++seq;
      if(q.length>=2){
        timer=setTimeout(function(){
          api('/api/cowork/search?q='+encodeURIComponent(q)+'&limit=10').then(function(data){
            if(curSeq!==seq||modal.isConnected===false)return;
            hits=(data&&data.hits)||[];render();
          }).catch(function(){});
        },250);
      }
    };
    render();
  }
`;
