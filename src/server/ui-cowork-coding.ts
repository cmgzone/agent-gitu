/** A live doorway from the requesting teammate to the main coding task. */
export const COWORK_CODING_CSS = String.raw`
  .cw-coding-activity { display:grid; gap:10px; width:100%; flex:none; }
  .cw-coding-activity[hidden] { display:none; }
  .cw-coding-card { display:flex; align-items:center; gap:14px; width:100%; min-width:0; padding:16px; border:1px solid var(--border); border-radius:22px; background:var(--card); color:var(--text); text-align:left; font:inherit; cursor:pointer; box-shadow:0 8px 24px rgba(0,0,0,.04); transition:border-color .2s,background .2s; }
  .cw-coding-card:hover { border-color:var(--cw-control-color,var(--accent)); background:var(--card2); }
  .cw-coding-card:focus-visible { outline:2px solid var(--cw-control-color,var(--accent)); outline-offset:3px; }
  .cw-coding-water { position:relative; display:block; width:68px; height:68px; flex:none; overflow:hidden; isolation:isolate; border-radius:50%; color:var(--cw-control-color,var(--accent)); border:1px solid color-mix(in srgb,currentColor 20%,transparent); background:radial-gradient(circle at 30% 20%,color-mix(in srgb,currentColor 5%,var(--card)),color-mix(in srgb,currentColor 14%,var(--card))); box-shadow:inset 0 2px 10px color-mix(in srgb,currentColor 8%,transparent); }
  .cw-coding-water::after { content:''; position:absolute; inset:5px; border:1px solid color-mix(in srgb,currentColor 10%,transparent); border-radius:50%; pointer-events:none; }
  .cw-coding-wave { position:absolute; top:0; left:0; display:block; width:200%; height:100%; max-width:none; fill:currentColor; opacity:.22; animation:none; }
  .cw-coding-wave.front { top:8px; opacity:.42; }
  .cw-coding-card[data-coding-state=working] .cw-coding-wave { animation:cw-coding-water-flow 4.5s linear infinite; }
  .cw-coding-card[data-coding-state=working] .cw-coding-wave.front { animation-duration:3.2s; animation-direction:reverse; animation-delay:-1.6s; }
  .cw-coding-copy { display:grid; gap:6px; min-width:0; flex:1; }
  .cw-coding-heading { display:flex; flex-wrap:wrap; align-items:center; gap:6px 10px; font-size:13px; }
  .cw-coding-status { display:inline-flex; align-items:center; gap:5px; color:var(--muted); font-size:11px; }
  .cw-coding-status::before { content:''; width:5px; height:5px; border-radius:50%; background:currentColor; }
  .cw-coding-card[data-coding-state=working] .cw-coding-status { color:var(--cw-control-color,var(--accent)); }
  .cw-coding-card[data-coding-state=working] .cw-coding-status::before { animation:cw-coding-type 1.4s ease-in-out infinite; }
  .cw-coding-goal { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; overflow-wrap:anywhere; font-size:13px; line-height:1.5; }
  .cw-coding-open { display:flex; align-items:center; gap:5px; color:var(--muted); font-size:11px; }
  .cw-coding-open svg { width:13px; height:13px; }
  @keyframes cw-coding-water-flow { from { transform:translateX(0); } to { transform:translateX(-50%); } }
  @keyframes cw-coding-type { 0%,100% { opacity:.35; } 50% { opacity:1; } }
  @media(max-width:480px) { .cw-coding-card { padding:12px; gap:10px; border-radius:18px; } .cw-coding-water { width:58px; height:58px; } }
  @media(prefers-reduced-motion:reduce) { .cw-coding-card,.cw-coding-card * { animation:none!important; transition:none!important; } }
`;

export const COWORK_CODING_JS = String.raw`
  function cwCodingState(task) {
    if(task.status==='running')return task.needsAttention?{key:'waiting',label:'Waiting for your response'}:{key:'working',label:'Coding in progress'};
    if(task.status==='waiting_for_model')return {key:'waiting',label:'Waiting for model'};
    if(task.status==='completed')return {key:'completed',label:'Coding completed'};
    if(task.status==='aborted')return {key:'stopped',label:'Coding stopped'};
    if(task.status==='failed')return {key:'failed',label:'Coding failed'};
    return {key:'waiting',label:'Needs attention'};
  }
  function cwCodingCardHtml(task) {
    if(!/^[a-zA-Z0-9_-]+$/.test(task.runId||''))return '';
    var state=cwCodingState(task);
    return '<button type="button" class="cw-coding-card" data-main-coding-task="'+esc(task.runId)+'" data-coding-state="'+state.key+'" aria-label="View coding task" title="'+esc(task.goal||'Coding task')+'">'+
      '<span class="cw-coding-water" aria-hidden="true"><svg class="cw-coding-wave" viewBox="0 0 160 80" preserveAspectRatio="none"><path d="M0 40C13 28 27 28 40 40S67 52 80 40S107 28 120 40S147 52 160 40V80H0Z"/></svg><svg class="cw-coding-wave front" viewBox="0 0 160 80" preserveAspectRatio="none"><path d="M0 40C13 28 27 28 40 40S67 52 80 40S107 28 120 40S147 52 160 40V80H0Z"/></svg></span>'+
      '<span class="cw-coding-copy"><span class="cw-coding-heading"><strong>Main Agent Gitu</strong><span class="cw-coding-status">'+state.label+'</span></span><span class="cw-coding-goal">'+esc(task.goal||'Your coding task')+'</span><span class="cw-coding-open">Open coding task '+cwIcon('external')+'</span></span></button>';
  }
  function cwRenderCodingActivity() {
    var host=$('cwCodingActivity');if(!host)return;
    var seen=Object.create(null);
    var tasks=(cwEnsure().codingTasks||[]).filter(function(task){
      if(seen[task.runId]||['running','waiting_for_model'].indexOf(task.status)<0)return false;
      seen[task.runId]=true;return true;
    });
    var html=tasks.map(cwCodingCardHtml).join('');
    host.hidden=!html;
    // Retain the scene and keyboard focus while unrelated messages arrive.
    if(host._codingMarkup!==html){
      var wrap=$('cwMsgs'),scroll=wrap?cwCaptureScroll(wrap):null;
      var focused=host.contains(document.activeElement)&&document.activeElement.getAttribute('data-main-coding-task');
      host.innerHTML=html;host._codingMarkup=html;
      if(focused){var next=host.querySelector('[data-main-coding-task="'+focused+'"]');if(next)next.focus({preventScroll:true});}
      if(scroll)cwRestoreScroll(wrap,scroll);
    }
  }
`;
