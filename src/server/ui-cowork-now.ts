/** Cowork's conversational shell and current-conversation action overview. */
export const COWORK_NOW_CSS = String.raw`
  .cw-shell-nav { display:flex; gap:4px; padding:10px 12px; }
  .cw-shell-nav button { flex:1; display:flex; align-items:center; justify-content:center; gap:6px; min-height:38px; border:0; border-radius:12px; background:transparent; color:var(--muted); font:inherit; font-size:12px; cursor:pointer; }
  .cw-shell-nav svg { width:16px; height:16px; }
  .cw-shell-nav button:hover { background:var(--hover); color:var(--text); }
  .cw-shell-nav button[aria-pressed=true] { background:var(--selected); color:var(--text); }
  .cw-now { flex:1; min-height:0; overflow:auto; padding:12px 16px 24px; }
  .cw-now[hidden], .cw-rail-scroll[hidden] { display:none; }
  .cw-now-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:4px; }
  .cw-now-heading h2 { margin:0; font-size:22px; letter-spacing:-.04em; font-weight:550; }
  .cw-now-context { color:var(--muted); font-size:11px; line-height:1.6; margin:0 0 24px; overflow-wrap:anywhere; }
  .cw-now-section { margin:22px 0 9px; color:var(--muted); font-size:11px; font-weight:500; }
  .cw-now-card { display:flex; flex-direction:column; gap:7px; width:100%; margin:0 0 10px; padding:15px; text-align:left; border:1px solid var(--border); border-radius:16px; background:var(--card); color:var(--text); font:inherit; cursor:pointer; transition:border-color .16s ease,background .16s ease; }
  .cw-now-card:hover { background:var(--hover); border-color:var(--border2); }
  .cw-now-card strong { font-size:13px; line-height:1.55; font-weight:500; overflow-wrap:anywhere; }
  .cw-now-card span { font-size:11px; color:var(--muted); line-height:1.5; }
  .cw-now-empty { padding:24px 4px; font-size:13px; line-height:1.7; color:var(--muted); }
  .cw-now-add { display:flex; align-items:center; gap:7px; width:100%; padding:12px; margin-top:20px; border:1px dashed var(--border2); border-radius:12px; background:transparent; color:var(--muted); font:inherit; font-size:12px; cursor:pointer; }
  .cw-now-add svg { width:16px; height:16px; }
  .cw-now-add:disabled { opacity:.5; cursor:default; }
  .cw { --cw-sidebar-tint:color-mix(in srgb,var(--sidebar) 75%,#6c9fc6); }
  :root[data-theme=light] body.cowork .cw { --cw-sidebar-tint:#b5d2e8; background:var(--cw-chat-surface); }
  .cw .cw-rail { background:color-mix(in srgb,var(--cw-sidebar-tint) 82%,transparent); backdrop-filter:blur(28px) saturate(1.05); -webkit-backdrop-filter:blur(28px) saturate(1.05); border-right-color:color-mix(in srgb,var(--border2) 55%,transparent); }
  .cw .cw-panel-backdrop { background:color-mix(in srgb,var(--overlay) 60%,transparent); backdrop-filter:blur(8px) saturate(.75); -webkit-backdrop-filter:blur(8px) saturate(.75); }
  .cw .cw-now-card { background:color-mix(in srgb,var(--card) 76%,transparent); }
  body.cowork .cw .cw-chat[data-character-color] { background:transparent; }
  #cwNow .cw-now-card { background:color-mix(in srgb,var(--card) 76%,transparent) !important; border:1px solid color-mix(in srgb,var(--border) 35%,transparent) !important; }
  #cwNow .cw-now-card:hover { background:color-mix(in srgb,var(--card) 88%,transparent) !important; }
  .cw-shell-nav :is(#cwNavChat,#cwNavNow)[aria-pressed=true] { background:var(--text) !important; color:var(--bg); }
  .cw .cw-rail-head { padding-top:18px; letter-spacing:0; }
  .cw .cw-rail-search input { border-color:transparent; background:var(--hover); border-radius:12px; padding:10px 12px; }
  .cw .cw-sec { letter-spacing:.04em; font-weight:500; margin-top:22px; }
  .cw .cw-item { border-radius:12px; padding:10px 8px; }
  .cw .cw-item-name { font-weight:500; }
  .cw .cw-chat-head { position:absolute; inset:0 0 auto; height:0; display:block; padding:0; border:0; background:transparent; box-shadow:none; backdrop-filter:none; pointer-events:none; }
  .cw .cw-chat-head .cw-persona-status { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; background:transparent; border:0; box-shadow:none; backdrop-filter:none; -webkit-backdrop-filter:none; }
  .cw .cw-chat-head .cw-persona-status > span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cw .cw-chat-head #cwBack { position:absolute; left:12px; top:12px; }
  .cw-top-nav { position:absolute; top:12px; left:50%; transform:translateX(-50%); display:flex; gap:2px; padding:4px; border:1px solid rgba(255,255,255,.25); border-radius:999px; background:color-mix(in srgb,var(--card) 54%,transparent); box-shadow:inset 0 1px 0 rgba(255,255,255,.25),0 8px 26px -18px rgba(18,44,70,.3); backdrop-filter:blur(20px) saturate(1.15); -webkit-backdrop-filter:blur(20px) saturate(1.15); pointer-events:auto; }
  .cw-top-nav button { display:flex; align-items:center; justify-content:center; gap:7px; min-height:38px; padding:0 14px; border:0; border-radius:999px; background:transparent; color:var(--muted); font:inherit; font-size:12px; cursor:pointer; transition:background .18s ease,color .18s ease; }
  .cw-top-nav svg { width:16px; height:16px; flex:none; }
  #cw .cw-top-nav button:hover { background:color-mix(in srgb,var(--card) 35%,transparent) !important; color:var(--text); }
  #cw .cw-top-nav button[aria-pressed=true] { background:var(--text) !important; color:var(--bg); }
  .cw-top-nav button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  .cw .cw-chat-head .cw-top-nav #cwInfoBtn { position:static; }
  .cw-chat-face { display:inline-flex; flex:none; }
  .cw-chat-face .cw-ava { position:relative; width:28px; height:28px; border-radius:50%; overflow:hidden; }
  .cw-chat-face img { position:absolute; width:200%; height:200%; max-width:none; left:-50%; top:-46%; object-fit:contain; }
  /* Reserve room inside the transcript, so it scrolls beneath the floating
     controls instead of clipping at a separate header-sized viewport. */
  .cw .cw-msgs { margin-top:0; padding:92px max(24px,calc((100% - 760px)/2)) calc(var(--cw-composer-height,148px) + 24px); gap:24px; scroll-padding:92px 0 calc(var(--cw-composer-height,148px) + 24px); }
  .cw .cw-row { max-width:100%; width:100%; }
  .cw .cw-row.me { width:auto; max-width:85%; }
  .cw .cw-row:not(.me):not(.cw-request-row) > .cw-bubble { width:100%; padding:14px 18px; border:0; border-radius:22px; background:var(--chat-assistant-surface); box-shadow:none; backdrop-filter:blur(10px); }
  .cw .cw-row.me .cw-bubble { background:var(--chat-user-surface); border:1px solid rgba(255,255,255,.24); border-radius:22px; padding:12px 18px; box-shadow:var(--chat-user-shadow); backdrop-filter:blur(18px) saturate(1.2); -webkit-backdrop-filter:blur(18px) saturate(1.2); }
  .cw .cw-meta { font-weight:400; margin-bottom:8px; }
  .cw .cw-row.me .cw-meta .nm { display:none; }
  .cw .cw-row.me .cw-meta { display:none; }
  .cw .cw-bubble .cw-meta .nm { font-weight:500; }
  .cw .cw-message-more { opacity:0; }
  .cw .cw-bubble:hover .cw-message-more, .cw .cw-bubble:focus-within .cw-message-more { opacity:1; }
  .cw .cw-composer-wrap { position:absolute; inset:auto 0 0; z-index:3; padding:12px max(24px,calc((100% - 760px)/2)) 22px; background:transparent; border:0; box-shadow:none; pointer-events:none; }
  .cw .cw-composer-wrap > * { pointer-events:auto; }
  .cw .cw-composer { border-radius:24px; padding:10px; background:var(--chat-composer-surface); backdrop-filter:blur(20px) saturate(1.15); -webkit-backdrop-filter:blur(20px) saturate(1.15); box-shadow:var(--chat-composer-shadow); }
  .cw .cw-composer textarea { padding:8px 4px; font-size:14px; }
  .cw .cw-send { border-radius:50%; }
  .cw .cw-work-history { padding-left:0; }
  .cw .cw-checkpoint-report { margin-left:0; width:100%; }
  @media(max-width:720px) {
    .cw .cw-rail { background:color-mix(in srgb,var(--cw-sidebar-tint) 92%,transparent); }
    .cw .cw-chat-head { height:0; padding:0; }
    .cw .cw-chat-head .cw-persona-status { max-width:calc(100vw - 190px); overflow:hidden; }
    .cw-top-nav button { min-height:40px; padding:0 12px; }
    .cw .cw-msgs { margin-top:0; padding:88px 16px calc(var(--cw-composer-height,128px) + 18px); gap:20px; scroll-padding:88px 0 calc(var(--cw-composer-height,128px) + 18px); }
    .cw .cw-composer-wrap { padding:8px 12px 12px; }
    .cw .cw-message-more { opacity:1; }
    .cw .cw-row.me { max-width:92%; }
  }
  @media(hover:none) { .cw .cw-message-more { opacity:1; } }
  @media(max-width:380px) { .cw .cw-chat-head #cwBack { top:70px; left:68px; } }
  @media(prefers-reduced-motion:reduce) { .cw-top-nav button { transition:none; } }
`;

export const COWORK_NOW_JS = String.raw`
  function cwBindTopNav() {
    var home=$('cwHomeBtn'),chat=$('cwCurrentChat');
    if(home)home.onclick=cwExit;
    var search=$('cwPageSearch');if(search)search.onclick=function(){wsOpen('cowork');};
    var profile=$('cwInfoBtn');if(profile)profile.onclick=function(){cwOpenProfile();};
    if(chat)chat.onclick=function(){
      var cw=cwEnsure();if(cw.profileOpen||cw.connectionsOpen){cwReturnToChat();return;}cw.infoOpen=false;cw.infoNarrowOpen=false;
      if(window.innerWidth>720)cwSavePanelPreferences();
      cwSyncPanels();
      var input=$('cwInput');if(input)input.focus({preventScroll:true});
    };
  }
  function cwBindFloatingComposer() {
    var cw=cwEnsure();if(cw.composerObserver){cw.composerObserver.disconnect();cw.composerObserver=null;}
    var chat=$('cwChat'),wrap=$('cwComposerWrap'),messages=$('cwMsgs');if(!chat||!wrap||!messages)return;
    var lastHeight=0;
    function measure(){
      if(wrap.isConnected===false)return;
      var height=Math.ceil(wrap.getBoundingClientRect().height);if(!height||height===lastHeight)return;
      var atBottom=messages.scrollHeight-messages.scrollTop-messages.clientHeight<80;
      lastHeight=height;chat.style.setProperty('--cw-composer-height',height+'px');
      if(atBottom)messages.scrollTop=messages.scrollHeight;
    }
    measure();
    if(typeof ResizeObserver==='function'){cw.composerObserver=new ResizeObserver(measure);cw.composerObserver.observe(wrap);}
  }
  function cwNowCards() {
    var cw=cwEnsure(),conv=cwActiveConv(),cards=[];
    if(!conv)return cards;
    (cw.requests||[]).filter(function(r){return r.status==='open';}).forEach(function(r){
      cards.push({kind:'request',id:r.id,section:'Needs your attention',title:r.title||'Your teammate needs a response',detail:'Review in chat',icon:'chat'});
    });
    (cw.todos||[]).filter(function(t){return t.status!=='done'&&t.status!=='completed'&&t.status!=='cancelled';}).forEach(function(t){
      var agent=cwAgentById(t.agentId);
      cards.push({kind:'todo',id:t.id,section:'In progress',title:t.text,detail:(agent?agent.name+' · ':'')+(t.status==='blocked'?'Blocked':t.status==='in_progress'?'Working':'Queued'),icon:'check'});
    });
    if(conv.schedule&&conv.schedule.enabled)cards.push({kind:'schedule',id:conv.id,section:'Scheduled',title:'Scheduled follow-up',detail:conv.schedule.every||'Open schedule',icon:'clock'});
    (cw.widgets||[]).forEach(function(w){cards.push({kind:'widget',id:w.id,section:'Pinned panels',title:w.title||'Panel',detail:cwWidgetSummary(w),icon:'panel'});});
    return cards;
  }
  function cwSetOverview(view) {
    var cw=cwEnsure();cw.overviewView=view==='now'?'now':'chat';cwRenderNow();
  }
  function cwRenderNow() {
    var el=$('cwNow'),rail=$('cwRail');if(!el||!rail)return;
    var cw=cwEnsure(),isNow=cw.overviewView==='now',conv=cwActiveConv();
    el.hidden=!isNow;rail.hidden=isNow;
    ['Chat','Now'].forEach(function(name){var b=$('cwNav'+name);if(b)b.setAttribute('aria-pressed',String(isNow===(name==='Now')));});
    if(!isNow)return;
    var cards=cwNowCards(),signature=JSON.stringify([cw.active,conv&&conv.title,cards]);
    if(el._nowSignature===signature)return;el._nowSignature=signature;
    var html='<div class="cw-now-heading"><h2>Now</h2><span class="chip">'+cards.length+'</span></div><p class="cw-now-context">'+esc(conv?conv.title+' · Current conversation':'Choose a chat to see what needs your attention.')+'</p>',section='';
    cards.forEach(function(card){
      if(section!==card.section){section=card.section;html+='<h3 class="cw-now-section">'+esc(section)+'</h3>';}
      html+='<button type="button" class="cw-now-card" data-cwnow-kind="'+esc(card.kind)+'" data-cwnow-id="'+esc(card.id)+'"><strong>'+esc(card.title)+'</strong><span>'+esc(card.detail)+'</span></button>';
    });
    if(!cards.length)html+='<div class="cw-now-empty">'+(conv?'You’re all caught up.<br>Questions, tasks and pinned panels will appear here as your team works.':'Your team’s next steps will appear here once you open a conversation.')+'</div>';
    html+='<button type="button" class="cw-now-add" id="cwNowAdd"'+(conv?'':' disabled')+'>'+cwIcon('plus')+'Create a new panel</button>';
    var scroll=el.scrollTop;el.innerHTML=html;el.scrollTop=scroll;
    el.querySelectorAll('[data-cwnow-kind]').forEach(function(button){button.onclick=function(){cwNowAction(button.getAttribute('data-cwnow-kind'),button.getAttribute('data-cwnow-id'));};});
    $('cwNowAdd').onclick=function(){var active=cwActiveConv();if(active)cwNewWidgetModal(active);};
  }
  function cwNowAction(kind,id) {
    var cw=cwEnsure(),conv=cwActiveConv();if(!conv)return;
    if(kind==='widget'){if((cw.widgets||[]).some(function(w){return w.id===id;}))cwWidgetModal(id);return;}
    if(kind==='schedule'){if(conv.id===id)cwScheduleModal(conv);return;}
    if(kind==='request'){
      var request=(cw.requests||[]).find(function(r){return r.id===id&&r.status==='open';});if(!request)return;
      cwSetOverview('chat');cwClosePanels();
      var messages=$('cwMsgs'),row=messages&&Array.from(messages.querySelectorAll('[data-cwrequest-row]')).find(function(node){return node.getAttribute('data-cwrequest-row')===id;});
      if(row){row.scrollIntoView({block:'center',behavior:'instant'});var control=row.querySelector('button:not(:disabled),input,textarea');if(control)control.focus({preventScroll:true});}
      return;
    }
    if(kind==='todo'){
      var todo=(cw.todos||[]).find(function(t){return t.id===id;});if(!todo)return;
      var input=$('cwInput');if(!input)return;
      cwSetOverview('chat');cwClosePanels();
      var prompt='Give me an update on: '+todo.text;
      input.value=input.value?input.value+'\n'+prompt:prompt;
      input.style.height='auto';input.style.height=Math.min(160,input.scrollHeight)+'px';
      cwSaveDraft();cwRenderComposerAction();input.focus();
    }
  }
  function cwBindOverview() {
    $('cwNavChat').onclick=function(){cwSetOverview('chat');};
    $('cwNavNow').onclick=function(){cwSetOverview('now');};
    $('cwNavSearch').onclick=function(){cwSetOverview('chat');$('cwSearch').focus();};
    cwSetOverview(cwEnsure().overviewView||'now');
  }
`;
