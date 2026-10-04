export const COWORK_PANELS_CSS = String.raw`
  .cw-splitter { display:none; }
  .cw-rail-collapse { flex:none; }
  .cw-rail-collapse svg { transform:rotate(180deg); }
  .cw-rail { min-width:0; container-type:inline-size; }
  .cw-rail-head { min-width:0; gap:3px; }
  .cw-rail-head .cw-brand { flex:none; }
  .cw-rail-head .cw-learn { min-width:0; flex-shrink:1; padding-inline:4px; }
  .cw-rail-scroll { overflow-x:hidden; }
  .cw-connection-nav { flex-wrap:wrap; }
  .cw-rail-foot { gap:4px; }
  .cw-rail-foot #cwExit { min-width:0; padding-inline:4px; margin-right:auto; }
  .cw-info { min-width:0; overflow-x:hidden; container-type:inline-size; }
  .cw-profile-context-head > div { overflow-wrap:anywhere; }
  .cw-profile-computer-head { flex-wrap:wrap; }
  .cw-profile-hero .chip { max-width:100%; white-space:normal; }
  @container(max-width:240px) {
    .cw-rail-head { gap:2px; padding-inline:8px; }
    .cw-rail-head .cw-learn span:last-child { display:none; }
    .cw-rail-head .iconbtn { width:26px; }
  }
  @container(max-width:270px) {
    .cw-profile-hero { flex-direction:column; text-align:center; }
    .cw-profile-identity { width:100%; }
    .cw-profile-presence .cw-persona-status { margin-inline:auto; }
    .cw-profile-details { grid-template-columns:76px minmax(0,1fr); }
  }
  @media(min-width:721px) {
    .cw .cw-rail { width:var(--cw-rail-width,264px); }
    .cw .cw-info { width:var(--cw-info-width,320px); }
    .cw.rail-collapsed .cw-rail { display:none; }
    .cw .cw-splitter { display:block; position:relative; flex:0 0 4px; cursor:col-resize; touch-action:none; }
    .cw-splitter::after { content:''; position:absolute; inset:0 -2px; z-index:4; }
    .cw-splitter:hover,.cw-splitter:focus-visible,.cw-splitter.is-resizing { background:color-mix(in srgb,var(--accent) 40%,transparent); }
    .cw-splitter:focus-visible { outline:2px solid var(--accent); outline-offset:-1px; }
    .cw.cw-empty .cw-splitter { display:none; }
  }
  @media(max-width:720px) { .cw-rail-collapse { display:none; } }
  body.cw-resizing,body.cw-resizing * { cursor:col-resize !important; user-select:none !important; }
`;

export const COWORK_PANELS_JS = String.raw`
  function cwPanelPreferences() {
    var saved={};try{saved=JSON.parse(localStorage.getItem('hermes.cowork.panels')||'{}')||{};}catch(e){}
    function width(value,fallback,min,max){return typeof value==='number'&&Number.isFinite(value)?Math.max(min,Math.min(max,Math.round(value))):fallback;}
    return {railWidth:width(saved.railWidth,264,208,400),infoWidth:width(saved.infoWidth,320,260,460),railCollapsed:saved.railCollapsed===true,infoOpen:saved.infoOpen!==false};
  }
  function cwSavePanelPreferences() {
    var cw=cwEnsure();try{localStorage.setItem('hermes.cowork.panels',JSON.stringify({railWidth:cw.railWidth,infoWidth:cw.infoWidth,railCollapsed:!!cw.railCollapsed,infoOpen:!!cw.infoOpen}));}catch(e){}
  }
  function cwApplyPanelWidths() {
    var root=$('cw');if(!root||!root.style||window.innerWidth<=720)return;
    var cw=cwEnsure(),available=root.clientWidth||window.innerWidth,infoOpen=root.classList.contains('info-open');
    var railWidth=Math.max(208,Math.min(cw.railWidth||264,400,available-(infoOpen?260:0)-308));
    var infoWidth=Math.max(260,Math.min(cw.infoWidth||320,460,available-(cw.railCollapsed?0:railWidth)-308));
    root.style.setProperty('--cw-rail-width',railWidth+'px');root.style.setProperty('--cw-info-width',infoWidth+'px');
    ['rail','info'].forEach(function(side){var handle=$(side==='rail'?'cwRailResize':'cwInfoResize');if(!handle)return;var value=side==='rail'?railWidth:infoWidth;handle.setAttribute('aria-valuenow',String(value));handle.setAttribute('aria-valuetext',value+' pixels');handle.hidden=side==='rail'?!!cw.railCollapsed:!infoOpen;});
  }
  function cwBindPanelControls() {
    var root=$('cw'),cw=cwEnsure();if(!root)return;
    if(!cw.panelPreferencesLoaded){Object.assign(cw,cwPanelPreferences());cw.panelPreferencesLoaded=true;}
    $('cwCollapseRail').onclick=function(){cw.railCollapsed=true;cwSavePanelPreferences();cwSyncPanels();var back=$('cwBack');if(back)back.focus();};
    ['rail','info'].forEach(function(side){
      var handle=$(side==='rail'?'cwRailResize':'cwInfoResize'),key=side==='rail'?'railWidth':'infoWidth',min=side==='rail'?208:260,max=side==='rail'?400:460,start=null;
      function resize(value){cw[key]=Math.max(min,Math.min(max,Math.round(value)));cwApplyPanelWidths();cw[key]=Number(handle.getAttribute('aria-valuenow'));}
      function finish(){if(!start)return;start=null;handle.classList.remove('is-resizing');document.body.classList.remove('cw-resizing');cwSavePanelPreferences();}
      handle.onpointerdown=function(event){if(event.button!==0||window.innerWidth<=720)return;event.preventDefault();start={x:event.clientX,width:Number(handle.getAttribute('aria-valuenow'))};handle.setPointerCapture(event.pointerId);handle.classList.add('is-resizing');document.body.classList.add('cw-resizing');handle.focus();};
      handle.onpointermove=function(event){if(start)resize(start.width+(event.clientX-start.x)*(side==='rail'?1:-1));};
      handle.onpointerup=handle.onpointercancel=handle.onlostpointercapture=finish;
      handle.onkeydown=function(event){var value=Number(handle.getAttribute('aria-valuenow')),step=event.shiftKey?40:10;if(event.key==='ArrowLeft')value+=(side==='rail'?-1:1)*step;else if(event.key==='ArrowRight')value+=(side==='rail'?1:-1)*step;else if(event.key==='Home')value=min;else if(event.key==='End')value=max;else return;event.preventDefault();resize(value);cwSavePanelPreferences();};
    });
  }
`;
