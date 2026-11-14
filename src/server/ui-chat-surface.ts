/** Shared conversational surfaces for Home, the main agent, and Cowork. */
export const CHAT_SURFACE_CSS = String.raw`
  :root {
    --chat-column-width:620px;
    --chat-assistant-surface:transparent;
    --chat-user-surface:var(--selected);
    --chat-user-shadow:none;
    --chat-composer-surface:var(--card);
    --chat-composer-shadow:var(--shadow);
  }
  :root[data-theme="light"] {
    --chat-assistant-surface:transparent;
  }
  /* Cloud banks stay behind the interface. Only their transforms animate;
     the feathered gradients and blur are fixed, with no canvas/render loop. */
  #cw { isolation:isolate; }
  #cw::before,#cw::after { display:none; content:none; }
  #cw::before { background-image:radial-gradient(ellipse 42% 18% at 25% 23%,var(--chat-cloud-light),transparent 76%),radial-gradient(ellipse 36% 22% at 77% 58%,var(--chat-cloud-light),transparent 78%),radial-gradient(ellipse 50% 16% at 22% 92%,var(--chat-cloud-light),transparent 75%); animation:chat-cloud-drift 48s ease-in-out infinite alternate; }
  #cw::after { background-image:radial-gradient(ellipse 44% 19% at 68% 20%,var(--chat-cloud-shade),transparent 78%),radial-gradient(ellipse 35% 24% at 30% 69%,var(--chat-cloud-shade),transparent 80%); animation:chat-cloud-drift 67s ease-in-out -26s infinite alternate-reverse; }
  @keyframes chat-cloud-drift { from { transform:translate3d(-3%,-2%,0) scale(1); } to { transform:translate3d(5%,3%,0) scale(1.06); } }
  /* Messages soften as they pass behind the floating navigation/composer.
     These layers never intercept selection, scrolling or control clicks. */
  #cw .cw-chat::before,#cw .cw-chat::after { content:''; position:absolute; left:0; right:0; z-index:1; pointer-events:none; }
  #cw .cw-chat::before { top:0; height:64px; background:linear-gradient(to bottom,var(--bg),transparent); }
  #cw .cw-chat::after { bottom:0; height:calc(var(--cw-composer-height,148px) + 20px); background:linear-gradient(to top,var(--bg) 52%,transparent); }
  @media(prefers-reduced-motion:reduce) { #cw::before,#cw::after { animation:none; } }
  :is(#cw,.home-sky,.run-chat) .cw-top-nav { background:var(--card); border:1px solid var(--border); box-shadow:var(--shadow); }
  :is(#cw,.home-sky,.run-chat) .cw-top-nav button { color:var(--muted); transition:background-color .18s ease,color .18s ease,transform .18s cubic-bezier(.16,1,.3,1); }
  :is(#cw,.home-sky,.run-chat) .cw-top-nav button:hover { background:var(--hover)!important; color:var(--text); }
  :is(#cw,.home-sky,.run-chat) .cw-top-nav button[aria-pressed=true] { background:var(--dark)!important; color:var(--bg); }
  :is(#cw,.home-sky,.run-chat) .cw-top-nav button:active { transform:scale(.96); }
  :is(.home-sky,.run-chat) .composer { border-radius:var(--radius-chat,28px); background:var(--chat-composer-surface); border:1px solid var(--border); box-shadow:var(--chat-composer-shadow); }
  body:has(.home-sky) .mobile-nav-btn,body:has(.run-chat) :is(.mobile-nav-btn,.topbar,.vresize,#mascotWrap) { display:none!important; }
  .run.run-chat { background:var(--cw-chat-surface); width:100%; }
  /* Keep wheel, touch and keyboard scrolling without a visible track. */
  :is(#cw,.run-chat,.setup-wizard) { scrollbar-width:none; }
  #cw :is(.cw-msgs,.cw-photo-strip,.cw-widget-tray),.run-chat .stream { scrollbar-width:none; }
  :is(#cw,.run-chat,.setup-wizard)::-webkit-scrollbar,#cw :is(.cw-msgs,.cw-photo-strip,.cw-widget-tray)::-webkit-scrollbar,.run-chat .stream::-webkit-scrollbar { display:none; width:0; height:0; }
  .run-chat .cw-page-nav { position:absolute; top:calc(12px + env(safe-area-inset-top, 0px)); left:0; right:0; transform:none; z-index:10; display:flex; justify-content:center; pointer-events:none; }
  .run-chat .cw-top-nav { position:static; transform:none; }
  .run-chat .chat-shell-button { position:absolute; top:calc(14px + env(safe-area-inset-top, 0px)); z-index:11; display:grid; place-items:center; width:36px; height:36px; padding:0; color:var(--muted); border-radius:50%; }
  .run-chat .chat-shell-button svg { width:19px; height:19px; }
  .run-chat #mainChatHistory { left:12px; }
  .run-chat #mainChatDetails { right:12px; }
  .run-chat .stream { padding:calc(88px + env(safe-area-inset-top, 0px)) max(24px,calc((100% - 760px)/2)) calc(var(--main-composer-height,148px) + 24px + env(safe-area-inset-bottom, 0px)); scroll-padding:calc(88px + env(safe-area-inset-top, 0px)) 0 calc(var(--main-composer-height,148px) + 24px + env(safe-area-inset-bottom, 0px)); }
  .run-chat .stream::before { display:none; }
  .run-chat .stream > * { margin-block:0 24px; }
  .run-chat :is(.abubble,.agent-report,.tl-note-row) { max-width:none; padding:10px 4px; border:0; border-radius:var(--radius-card,16px); background:var(--chat-assistant-surface); box-shadow:none; font-size:14px; line-height:1.58; }
  .run-chat .tl-note-row { gap:0; }
  .run-chat .tl-note-row :is(.tl-dot,.tl-time) { display:none; }
  .run-chat .tl-note-row .tl-body { padding:0; min-width:0; }
  .run-chat .tl-stream-row[data-stream-state=live] { padding:12px 16px; border:1px solid var(--border); background:var(--card); color:var(--text); transition:background-color .25s ease,color .25s ease; }
  .run-chat :is(.abubble .who,.stream-live) { color:var(--muted); font-size:11px; font-weight:500; margin-bottom:8px; }
  .run-chat .usermsg .ub { max-width:85%; padding:11px 16px; border:1px solid var(--border); border-radius:var(--radius-bubble,20px); border-bottom-right-radius:6px; background:var(--chat-user-surface); box-shadow:var(--chat-user-shadow); }
  .run-chat .usermsg .umeta { display:none; }
  .run-chat .working { width:fit-content; max-width:100%; padding:10px 16px; border:1px solid var(--border); border-radius:var(--radius-card,16px); color:var(--muted); background:var(--card); box-shadow:var(--shadow); font-size:13px; }
  .run-chat .tl-tool-group > .tl-dot { display:none; }
  .run-chat .tl-tool-group > .tl-body { width:100%; }
  .run-chat .tool-group-details { padding:8px 14px; border:1px solid var(--border); border-radius:var(--radius-card,16px); background:var(--card); box-shadow:var(--shadow); }
  .run-chat .tool-group-details[open] { background:var(--card); border-color:var(--border2); }
  .run-chat .bottom-composer { position:absolute; inset:auto 0 0; z-index:3; padding:12px max(24px,calc((100% - 760px)/2)) calc(16px + env(safe-area-inset-bottom, 0px)); max-height:60%; overflow:visible; background:transparent; pointer-events:none; }
  .run-chat .bottom-composer > * { pointer-events:auto; }
  .run-chat .composer { width:100%; padding:10px 12px; }
  .run-chat .composer textarea { font-size:14px; padding:8px 4px; }
  .run-chat .composer-topline { display:flex; align-items:center; gap:8px; min-width:0; flex-wrap:nowrap; }
  .run-chat .composer-topline .composer-workspace { flex:1 1 auto; min-width:0; max-width:none; }
  .run-chat .composer-topline .composer-workspace span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .run-chat .composer-topline .context-trigger { flex-shrink:0; margin-left:0; }
  .run-chat .main-work-details { flex-shrink:0; margin-left:auto; font-size:11px; color:var(--muted); padding:4px 8px; border-radius:6px; white-space:nowrap; }
  .run-chat .approach-panel { display:none; }
  .run-chat .approach-panel[open] { display:block; position:absolute; top:calc(68px + env(safe-area-inset-top, 0px)); left:50%; transform:translateX(-50%); z-index:12; width:min(760px,calc(100% - 32px)); max-height:50%; overflow:auto; margin:0; border:1px solid var(--border); border-radius:var(--radius-card,16px); background:var(--card); box-shadow:var(--shadow-float); }
  .run-chat .jump-latest { display:none; }
  .run-chat .progress { display:none!important; }
  body:has(.run-chat) .sb { position:fixed; inset:0 auto 0 0; z-index:80; width:min(320px,88vw)!important; transform:translateX(-105%); transition:transform .24s cubic-bezier(.16,1,.3,1); background:var(--card); border-right:1px solid var(--border); box-shadow:var(--shadow-float); }
  :root[data-theme=light] body:has(.run-chat) .sb { background:var(--card); }
  body:has(.run-chat) .shell.mobile-nav-open .sb { transform:none; }
  body:has(.run-chat) .shell.left-collapsed .sb :is(.scroll,.foot,.name,.spacer,#gearBtn) { display:flex; }
  body:has(.run-chat) .shell.left-collapsed .sb .head { padding:14px 14px 8px; justify-content:flex-start; }
  body:has(.run-chat) #sbCollapse { display:none; }
  body:has(.run-chat) .mobile-backdrop { position:fixed; inset:0; z-index:79; border:0; background:color-mix(in srgb,var(--overlay) 60%,transparent); backdrop-filter:blur(8px); }
  body:has(.run-chat) .shell.mobile-nav-open .mobile-backdrop { display:block; }
  body:has(.run-chat) .run-side { left:0; width:min(430px,100vw); z-index:81; background:color-mix(in srgb,var(--card) 92%,transparent); backdrop-filter:blur(28px); }
  @media(max-width:720px) {
    .run-chat .cw-page-nav { max-width:calc(100% - 96px); margin:0 auto; }
    .run-chat .cw-top-nav { max-width:100%; overflow-x:auto; scrollbar-width:none; }
    .run-chat .cw-top-nav button { padding:0 10px; font-size:11.5px; }
    .run-chat .chat-shell-button { width:34px; height:34px; top:calc(10px + env(safe-area-inset-top, 0px)); }
    .run-chat #mainChatHistory { left:8px; }
    .run-chat #mainChatDetails { right:8px; }
    .run-chat .stream { padding:calc(82px + env(safe-area-inset-top, 0px)) 16px calc(var(--main-composer-height,128px) + 18px + env(safe-area-inset-bottom, 0px)); scroll-padding:calc(82px + env(safe-area-inset-top, 0px)) 0 calc(var(--main-composer-height,128px) + 18px + env(safe-area-inset-bottom, 0px)); }
    .run-chat .stream > * { margin-bottom:20px; }
    .run-chat .bottom-composer { padding:8px 12px calc(12px + env(safe-area-inset-bottom, 0px)); }
    .run-chat .usermsg .ub { max-width:92%; }
  }
  @media(max-width:480px) {
    .run-chat .cw-top-nav button > span:not(.cw-chat-face) { display:none; }
    .run-chat .cw-top-nav button { padding:0 8px; min-height:34px; }
  }
  @media(max-width:380px) { .run-chat .cw-top-nav button { padding:0 8px; gap:5px; }.run-chat .chat-shell-button { width:32px; }.run-chat #mainChatHistory { left:6px; }.run-chat #mainChatDetails { right:6px; } }
  @media(prefers-reduced-motion:reduce) { :is(#cw,.home-sky,.run-chat) .cw-top-nav button,body:has(.run-chat) .sb { transition:none; } }
`;

/** Cowork and main-agent bubbles use this same entrance. */
export const CHAT_BUBBLE_MOTION_JS = String.raw`
  function chatMotionReduced() { return typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function chatBubbleEntrance(element) {
    if(!element||chatMotionReduced()||typeof element.animate!=='function'||element._chatArrived)return;
    element._chatArrived=true;
    var sent=typeof element.matches==='function'&&element.matches('.me,.usermsg');
    element.animate([{opacity:0,transform:'translate3d('+(sent?'6':'-3')+'px,14px,0) scale(.985)'},{opacity:1,transform:'translate3d(0,0,0) scale(1)'}],{duration:sent?300:380,easing:'cubic-bezier(.22,1,.36,1)'});
  }
`;

export const CHAT_SURFACE_JS = String.raw`
  var mainComposerObserver=null;
  function captureChatTransition() {
    if(mainComposerObserver){mainComposerObserver.disconnect();mainComposerObserver=null;}
    if(chatMotionReduced())return null;
    var view=$('view');if(!view)return null;
    var composer=view.querySelector('.composer,.cw-composer'),nav=view.querySelector('.cw-top-nav');
    return {composer:composer&&composer.getBoundingClientRect(),nav:nav&&nav.getBoundingClientRect()};
  }
  // Measure before the synchronous render and animate the new surfaces after it.
  // This preserves stream setup and the immediate user-bubble insertion order.
  function playChatTransition(previous) {
    if(!previous||chatMotionReduced())return;
    var view=$('view');if(!view)return;
    function move(selector,from) {
      var element=view.querySelector(selector);if(!element||!from||!from.width||!from.height||typeof element.animate!=='function')return;
      var to=element.getBoundingClientRect();if(!to.width||!to.height)return;
      var dx=from.left+from.width/2-to.left-to.width/2,dy=from.top+from.height/2-to.top-to.height/2;
      element.animate([{translate:dx+'px '+dy+'px',scale:from.width/to.width+' '+from.height/to.height,opacity:.65},{translate:'0 0',scale:'1 1',opacity:1}],{duration:440,easing:'cubic-bezier(.16,1,.3,1)'});
    }
    move('.composer,.cw-composer',previous.composer);move('.cw-top-nav',previous.nav);
    var content=view.querySelector('.stream,.cw-msgs,.home-brand');
    if(content&&typeof content.animate==='function')content.animate([{opacity:0,translate:'0 14px',filter:'blur(4px)'},{opacity:1,translate:'0 0',filter:'blur(0px)'}],{duration:360,easing:'cubic-bezier(.16,1,.3,1)'});
  }
  function bindMainChatShell() {
    $('cwHomeBtn').onclick=openHome;
    $('cwCurrentChat').onclick=function(){$('follow').focus({preventScroll:true});};
    $('cwInfoBtn').onclick=function(){var agent=cwProfileAgent()||cwEnsure().agents[0];cwEnterWorkspace(agent?'profile':'new',agent&&agent.id);};
    $('mainChatHistory').onclick=function(){wsOpen('main');};
    $('mainChatDetails').onclick=function(){openToolPanel('state');};
    var details=$('mainWorkDetails'),panel=$('approachPanel');
    details.onclick=function(){panel.open=!panel.open;};
    panel.addEventListener('toggle',function(){details.setAttribute('aria-expanded',String(panel.open));});
    details.setAttribute('aria-expanded',String(panel.open));
    if(mainComposerObserver){mainComposerObserver.disconnect();mainComposerObserver=null;}
    var root=document.querySelector('.run-chat'),composer=document.querySelector('.run-chat .bottom-composer'),messages=$('stream'),lastHeight=0;
    function measure() {
      if(!root||!root.isConnected||!composer)return;
      var height=Math.ceil(composer.getBoundingClientRect().height);if(!height||height===lastHeight)return;
      var atBottom=nearBottom(messages);lastHeight=height;root.style.setProperty('--main-composer-height',height+'px');
      if(atBottom)stickScroll(messages,true);
    }
    measure();
    if(typeof ResizeObserver==='function'){mainComposerObserver=new ResizeObserver(measure);mainComposerObserver.observe(composer);}
  }
`;
