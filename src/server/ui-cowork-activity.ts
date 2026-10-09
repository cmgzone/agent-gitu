/** Translucent live activity in chat, with work details beside the composer. */
export const COWORK_CLEAN_ACTIVITY_CSS = String.raw`
  .cw-working-row[hidden] { display:none; }
  .cw-working-bubble { display:inline-flex; align-items:center; gap:8px; min-width:0; max-width:100%; padding:11px 16px; border:1px solid color-mix(in srgb,var(--border2) 45%,transparent); border-radius:22px; background:color-mix(in srgb,var(--card) 8%,transparent); color:color-mix(in srgb,var(--text) 65%,transparent); font-size:13px; line-height:1.5; overflow-wrap:anywhere; backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px); }
  .cw-working-dot { width:5px; height:5px; flex:none; border-radius:50%; background:currentColor; animation:cw-working-pulse 1.6s ease-in-out infinite; }
  @keyframes cw-working-pulse { 0%,100% { opacity:.35; } 50% { opacity:1; } }
  @media(prefers-reduced-motion:reduce) { .cw-working-dot { animation:none; } }
  .cw-clean-activity { display:flex; align-items:center; gap:12px; min-height:28px; margin:0 4px 8px; color:var(--muted); font-size:11.5px; }
  .cw-clean-activity[hidden], .cw-clean-activity [hidden] { display:none; }
  .cw-clean-status { display:flex; align-items:center; gap:8px; min-width:0; flex:1; }
  .cw-clean-status::before { content:''; width:5px; height:5px; border-radius:50%; flex:none; background:var(--accent); }
  .cw-clean-status span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cw-clean-activity button { flex:none; margin-left:auto; background:transparent; border:0; color:var(--muted); padding:6px 0 6px 8px; font:inherit; font-size:11px; cursor:pointer; }
  .cw-clean-activity button:hover { color:var(--text); }
  .cw .cw-live-row .cw-live-kicker, .cw .cw-live-row .cw-meta { display:none; }
  .cw .cw-live-row .cw-progress-text { margin:0; }
  .cw .cw-live-row .cw-progress-text::after { display:none; }
  .cw .cw-checkpoint-report { border:0; border-left:2px solid var(--border); border-radius:0; padding:4px 0 4px 14px; background:transparent; }
  .cw .cw-work-history > summary { font-weight:400; font-size:11px; color:var(--muted); }
  .cw .cw-work-history:not([open]) { display:none; }
  .cw .cw-work { display:none; }
`;

export const COWORK_CLEAN_ACTIVITY_JS = String.raw`
  function cwCleanActivityText() {
    var cw=cwEnsure();
    if((cw.requests||[]).some(function(r){return r.status==='open';}))return 'Waiting for your response';
    if(!cw.busy)return '';
    var progresses=(cw.progresses&&cw.progresses.length)?cw.progresses:(cw.progress?[cw.progress]:[]);
    var progress=progresses[0];
    var label=progress&&progress.toolOk===false?'A step failed':progress&&progress.tool?cwToolProgressText(progress):progress&&progress.phase==='responding'?'Writing a reply…':'Working on your request…';
    var teammates=new Set(progresses.map(function(p){return p.agentId||p.agentName;}).filter(Boolean)).size;
    return label+(teammates>1?' · '+teammates+' teammates':'');
  }
  function cwRenderCleanActivity() {
    var line=$('cwCleanActivity');if(!line)return;
    var cw=cwEnsure(),text=cwCleanActivityText(),count=(cw.workHistory||[]).length;
    var working=$('cwWorkingBubble'),workingLabel=$('cwWorkingLabel');
    var progresses=(cw.progresses&&cw.progresses.length)?cw.progresses:(cw.progress?[cw.progress]:[]);
    var replying=progresses.some(function(p){return p.phase==='responding'&&typeof cwVisibleReply==='function'&&cwVisibleReply(p.text);});
    var inChat=!!working&&cw.busy&&!replying&&!(cw.requests||[]).some(function(r){return r.status==='open';});
    if(working){
      var messages=$('cwMsgs'),atBottom=messages&&messages.scrollHeight-messages.scrollTop-messages.clientHeight<120;
      working.hidden=!inChat;
      if(workingLabel&&workingLabel.textContent!==(inChat?text:''))workingLabel.textContent=inChat?text:'';
      if(atBottom)messages.scrollTop=messages.scrollHeight;
    }
    line.hidden=!count&&(!text||inChat);
    var status=$('cwCleanStatus'),label=$('cwCleanLabel'),details=$('cwCleanDetails');
    status.hidden=!text||inChat;
    if(label.textContent!==text)label.textContent=text;
    details.hidden=!count;
    var detailText='Work details · '+count;
    if(details.textContent!==detailText)details.textContent=detailText;
    details.onclick=function(){
      var messages=$('cwMsgs');if(!messages)return;
      var groups=messages.querySelectorAll('details[data-cwworkhistory]'),latest=groups[groups.length-1];
      if(!latest)return;
      latest.open=true;
      latest.scrollIntoView({block:'nearest',behavior:'instant'});
      var summary=latest.querySelector('summary');if(summary)summary.focus({preventScroll:true});
    };
  }
`;
