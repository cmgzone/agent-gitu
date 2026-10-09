/** Contextual computer activity, kept in the conversation rather than a sidebar. */
export const COWORK_COMPUTER_CSS = String.raw`
  .cw .cw-chat-head .cw-computer-toggle { position:absolute; right:56px; top:12px; pointer-events:auto; display:grid; place-items:center; width:38px; height:38px; padding:0; border:1px solid #ffffff45; border-radius:50%; background:color-mix(in srgb,var(--card) 48%,transparent); color:var(--text); cursor:pointer; }
  .cw-computer-toggle svg { width:17px; height:17px; }
  .cw-computer-toggle[hidden],.cw-computer-inline[hidden],.cw-computer-preview[hidden] { display:none!important; }
  .cw-computer-toggle[data-handoff=true]::after { content:''; position:absolute; width:6px; height:6px; top:6px; right:6px; border-radius:50%; background:var(--accent); }
  .cw-computer-inline { flex:none; width:100%; border:1px solid #ffffff55; border-radius:22px; overflow:hidden; background:color-mix(in srgb,var(--card) 52%,transparent); color:var(--text); box-shadow:0 12px 30px -24px #183d6b88; }
  .cw-computer-inline header { display:flex; align-items:center; gap:10px; padding:14px 16px; }
  .cw-computer-inline header > svg { width:20px; height:20px; flex:none; }
  .cw-computer-inline header > div { flex:1; min-width:0; }
  .cw-computer-inline strong { display:block; font-size:13px; font-weight:550; overflow-wrap:anywhere; }
  .cw-computer-inline p { margin:4px 0 0; font-size:12px; line-height:1.5; color:var(--muted); overflow-wrap:anywhere; }
  .cw-computer-inline button { flex:none; display:flex; align-items:center; gap:6px; min-height:36px; padding:7px 12px; border:1px solid #ffffff65; border-radius:999px; background:color-mix(in srgb,var(--card) 68%,transparent); color:var(--text); font:inherit; font-size:12px; cursor:pointer; }
  .cw-computer-inline button svg { width:15px; height:15px; }
  .cw-computer-preview { aspect-ratio:16/10; width:100%; background:#0d1a2c; border-top:1px solid #ffffff45; }
  .cw-computer-preview iframe { width:100%; height:100%; display:block; border:0; pointer-events:none; }
  .cw-computer-inline button:focus-visible,.cw-computer-toggle:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
  .cw-desktop-dialog .box { background:var(--cw-sidebar-tint,var(--card)); color:var(--text); border-color:var(--border2); }
  .cw-desktop-dialog .bar,.cw-desktop-dialog .cw-desktop-toolbar { background:var(--cw-sidebar-tint,var(--card)); border-color:var(--border2); }
  .cw-desktop-dialog .btn { background:var(--card); color:var(--text); border-color:var(--border2); }
  .cw-desktop-dialog .btn:hover { background:var(--hover); }
  .cw-desktop-dialog .cw-desktop-status,.cw-desktop-dialog .chip { color:var(--muted); }
  .cw-desktop-dialog .cw-desktop-handoff { background:var(--selected); color:var(--text); border-color:var(--border2); }
  .cw-desktop-dialog [data-control] { background:var(--text); border-color:var(--text); color:var(--bg); }
  @media(max-width:720px) { .cw .cw-chat-head .cw-computer-toggle { right:60px; top:70px; width:40px; height:40px; }.cw-computer-inline header { flex-wrap:wrap; padding:12px; }.cw-computer-inline header > div { min-width:140px; }.cw .cw-chat:has(.cw-computer-toggle:not([hidden])) .cw-msgs { padding-top:120px; scroll-padding-top:120px; } }
`;

export const COWORK_COMPUTER_JS = String.raw`
  function cwComputerActivities() {
    var cw=cwEnsure(),conv=cwActiveConv();if(!conv)return [];
    var key=conv.id+':'+String(cw.generation||0),seen=cw.computerActivitySeen;
    if(!seen||seen.key!==key||!cw.busy)seen=cw.computerActivitySeen={key:key,agents:Object.create(null)};
    var progress=cw.busy?(cw.progresses&&cw.progresses.length?cw.progresses:cw.progress?[cw.progress]:[]):[];
    return cwConvMembers(conv).map(function(agent){
      var computer=(cw.computers||[]).find(function(item){return item.agentId===agent.id;});
      var request=(cw.requests||[]).find(function(item){return item.agentId===agent.id&&item.conversationId===conv.id&&item.desktopHandoff&&item.status==='open';});
      var handoff=!!request||!!(computer&&computer.control==='user'&&!agent.useHostComputer&&!(computer.handoff&&computer.handoff.requestId));
      var action=progress.find(function(item){return item.agentId===agent.id&&/^(browse|desktop_input|desktop_screenshot|computer_process|computer_status|run_command)$/.test(item.tool||'');});
      if(action)seen.agents[agent.id]=true;
      if(!handoff&&!(cw.busy&&seen.agents[agent.id]))return null;
      return {agent:agent,computer:computer,handoff:handoff,reason:request&&request.detail||computer&&computer.handoff&&computer.handoff.reason||'',live:!agent.useHostComputer&&computer&&computer.state==='running'};
    }).filter(Boolean);
  }
  function cwRenderComputerActivity() {
    var cw=cwEnsure(),wrap=$('cwMsgs'),button=$('cwComputerBtn'),card=$('cwInlineComputer');
    if(!wrap&&!button)return;
    var activities=(!cw.profileOpen&&!cw.connectionsOpen&&!cw.galleryOpen)?cwComputerActivities():[];
    var activity=activities.find(function(item){return item.agent.id===cw.inlineComputerAgentId;})||activities.find(function(item){return item.handoff;})||activities[0];
    var conv=cwActiveConv(),members=conv?cwConvMembers(conv):[],shortcutAgent=members.find(function(agent){return agent.id===(cw.selectedAgentId||conv.chiefId);})||members[0];
    var shortcutActivity=shortcutAgent&&activities.find(function(item){return item.agent.id===shortcutAgent.id;}),shortcutCard=!!(activity&&shortcutAgent&&activity.agent.id===shortcutAgent.id);
    if(button){button.hidden=!!(cw.profileOpen||cw.connectionsOpen||cw.galleryOpen||!shortcutAgent);button.setAttribute('data-handoff',String(!!(shortcutActivity&&shortcutActivity.handoff)));button.title=shortcutCard?(activity.handoff?'Your turn on the computer':'View computer activity'):shortcutAgent?'Open '+shortcutAgent.name+' computer':'Computer';button.setAttribute('aria-label',button.title);if(shortcutCard&&wrap)button.setAttribute('aria-controls','cwInlineComputer');else button.removeAttribute('aria-controls');button.onclick=function(){if(shortcutCard&&card)card.scrollIntoView({behavior:window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});else if(shortcutAgent)cwOpenDesktop(shortcutAgent.id);};}
    if(!wrap||!activity){if(card)card.remove();return;}
    var atBottom=wrap.scrollHeight-wrap.scrollTop-wrap.clientHeight<120;
    if(!card){card=document.createElement('section');card.id='cwInlineComputer';card.className='cw-computer-inline';card.setAttribute('aria-label','Computer activity');card.setAttribute('data-cwentrance','computer-'+(cw.computerCardRevision=(cw.computerCardRevision||0)+1));card.innerHTML='<header>'+cwIcon('monitor')+'<div><strong data-computer-title></strong><p data-computer-description></p></div><button type="button" data-expand-computer>'+cwIcon('panel')+'<span>Expand</span></button></header><div class="cw-computer-preview" data-computer-preview hidden></div>';wrap.appendChild(card);cwAnimateChatBubbles(wrap);}
    var title=card.querySelector('[data-computer-title]'),description=card.querySelector('[data-computer-description]'),expand=card.querySelector('[data-expand-computer]'),preview=card.querySelector('[data-computer-preview]');
    title.textContent=activity.handoff?'Your turn · '+activity.agent.name:activity.agent.name+' is using the computer';
    description.textContent=activity.handoff?(activity.reason||'The agent is waiting for you. Expand the computer to continue.'):(activity.agent.useHostComputer?'Working with the browser and workspace on this computer.':'Live view · Expand to use the shared desktop.');
    expand.hidden=!!activity.agent.useHostComputer;
    expand.onclick=function(){cwOpenDesktop(activity.agent.id);};
    var source=activity.live&&!(cw.desktopSession&&cw.desktopSession.agentId===activity.agent.id)?'/api/cowork/agents/'+encodeURIComponent(activity.agent.id)+'/computer/view?preview=1':null;
    if(preview._source!==source){preview.replaceChildren();preview._source=source;if(source){var frame=document.createElement('iframe');frame.src=source;frame.title=activity.agent.name+' live computer preview';frame.tabIndex=-1;preview.appendChild(frame);}}
    preview.hidden=!source;
    if(atBottom)wrap.scrollTop=wrap.scrollHeight;
  }
`;
