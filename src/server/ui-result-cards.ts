/** Content-specific chat results. Uses the shared output renderer's safe helpers. */
export const CHAT_RESULT_CSS = String.raw`
.out-card{--out-tone:var(--accent);min-width:0;border:0;border-radius:24px;padding:8px;background:color-mix(in srgb,var(--card) 78%,transparent);box-shadow:none}
:root[data-theme=light] .out-card{background:rgba(227,237,246,.88)}
.out-card[data-out-kind=email]{--out-tone:var(--accent)}
.out-card[data-out-kind=brief]{--out-tone:var(--evidence,var(--accent))}
.out-card[data-out-kind=tasks]{--out-tone:var(--ok,var(--accent))}
.out-card .out-head{gap:8px;padding:5px 8px 13px;background:none;border:0}
.out-symbol{display:grid;place-items:center;flex:none;width:30px;height:30px;border-radius:10px;background:color-mix(in srgb,var(--out-tone) 12%,transparent);color:var(--out-tone)}
.out-symbol svg{width:17px;height:17px}
.out-heading{min-width:0}
.out-heading .out-title{font-family:Georgia,'Times New Roman',serif;font-size:21px;line-height:1.25;font-weight:600;letter-spacing:-.025em;margin:0;white-space:normal;overflow-wrap:anywhere}
.out-card .out-btn{display:grid;place-items:center;border:0;border-radius:50%;padding:0;width:32px;height:32px;flex:none;font-size:16px;opacity:.6;transition:background-color .16s ease,color .16s ease,opacity .16s ease}
.out-card:hover .out-btn,.out-card:focus-within .out-btn{opacity:1}
.out-card .out-btn:hover{background:color-mix(in srgb,var(--out-tone) 10%,transparent);color:var(--out-tone)}
.out-card .out-body{padding:14px 16px;border-radius:19px;background:color-mix(in srgb,var(--card) 57%,transparent)}
.out-lead{margin:0 0 10px;font-size:13px;line-height:1.65;color:var(--text);white-space:pre-wrap;overflow-wrap:anywhere}
.out-count{display:flex;align-items:center;gap:7px;margin-bottom:10px;font-size:10px;color:var(--muted)}
.out-count b{font-size:11px;font-weight:500;line-height:1;color:var(--muted)}
.out-count .out-badge{margin-left:auto}
.out-badge{display:inline;font-size:10px;color:var(--muted);line-height:1.5}
.out-badge+.out-badge::before{content:' · '}
.out-mail-list{display:grid;gap:2px;counter-reset:mail}
.out-mail-section{font-size:12px;font-weight:600;margin:6px 0 3px;line-height:1.5}
.out-mail{min-width:0;border:0;border-radius:0;background:transparent;counter-increment:mail}
.out-mail summary{display:flex;align-items:flex-start;gap:7px;list-style:none;cursor:pointer;padding:7px 0;transition:opacity .16s ease}
.out-mail summary::-webkit-details-marker{display:none}
.out-mail summary:hover{opacity:.75}
.out-mail summary:focus-visible,.out-task summary:focus-visible{outline:2px solid var(--accent);outline-offset:-3px;border-radius:11px}
.out-mail-number{flex:none;width:13px;font-size:12px;line-height:1.55;color:var(--text)}
.out-mail-number::before{content:counter(mail)'.'}
.out-mail-copy{display:block;flex:1;min-width:0;font-size:13px;line-height:1.55}
.out-mail-top{display:flex;align-items:center;gap:8px;min-width:0;margin-top:4px;font-size:10px;color:var(--muted)}
.out-mail-top strong{font-size:10px;font-weight:400;flex:1;min-width:0;overflow-wrap:anywhere}
.out-mail-top time{font-size:10px;text-align:right}
.out-mail-subject{display:inline;font-size:13px;line-height:1.55;font-weight:600;overflow-wrap:anywhere;color:var(--text)}
.out-mail-preview{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-size:13px;line-height:1.55;color:var(--text);overflow-wrap:anywhere}
.out-mail-flags{display:flex;flex-wrap:wrap;gap:5px}
.out-mail-chevron{flex:none;color:var(--muted);font-size:14px;line-height:20px;transition:transform .18s ease}
.out-mail[open] .out-mail-chevron{transform:rotate(90deg)}
.out-mail[open] .out-mail-preview{display:none}
.out-mail-detail{padding:0 0 10px 20px;font-size:13px;line-height:1.7;overflow-wrap:anywhere}
.out-mail-detail p{margin:0 0 10px;white-space:pre-wrap}
.out-mail-address{font-size:10px;color:var(--muted)}
.out-next{display:block;margin-top:10px;padding:0;border:0;background:none;font-size:12px;line-height:1.65;overflow-wrap:anywhere}
.out-next strong{display:block;margin-bottom:2px;font-size:12px;font-weight:600;color:var(--text)}
.out-result-link{display:inline-flex;align-items:center;gap:6px;min-height:32px;margin-top:6px;color:var(--accent);font-size:11px;font-weight:500;text-decoration:none}
.out-result-link:hover{text-decoration:underline}
.out-result-link:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:3px}
.out-empty{display:flex;gap:10px;align-items:center;padding:10px 0;color:var(--muted);font-size:12px}
.out-empty .out-symbol{width:36px;height:36px}
.out-brief-intro{font-size:14px;line-height:1.65;color:var(--text);margin:0 0 12px;white-space:pre-wrap;overflow-wrap:anywhere}
.out-highlights{display:grid;gap:0;margin:0 0 12px;padding:0;list-style:none}
.out-highlights li{display:grid;grid-template-columns:16px 1fr;gap:7px;padding:6px 0;border:0;font-size:13px;line-height:1.6;overflow-wrap:anywhere}
.out-highlight-index{font-size:9px;padding-top:3px;color:var(--out-tone);font-variant-numeric:tabular-nums}
.out-highlights strong{display:block;font-size:12px;font-weight:600;margin-bottom:2px}
.out-highlights p{margin:0;color:var(--muted);white-space:pre-wrap}
.out-task-list{list-style:none;padding:0;margin:0;display:grid;gap:3px}
.out-task{display:flex;align-items:flex-start;gap:8px;padding:7px 0;border:0;font-size:13px;line-height:1.6;overflow-wrap:anywhere}
.out-task-mark{display:grid;place-items:center;flex:none;width:16px;height:18px;margin-top:1px;border:0;background:none;color:var(--muted);font-size:12px}
.out-task[data-status=done] .out-task-mark{color:var(--ok)}
.out-task[data-status=in_progress] .out-task-mark{color:var(--accent)}
.out-task-copy{flex:1;min-width:0}.out-task-copy>strong{display:block;font-size:13px;font-weight:500}
.out-task[data-status=done] .out-task-copy>strong{color:var(--muted)}
.out-task-meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:4px;color:var(--muted);font-size:10px}
.out-task details{margin-top:4px}.out-task summary{cursor:pointer;color:var(--muted);font-size:10px;min-height:28px;padding-top:4px}
.out-task details p{font-size:11px;line-height:1.7;margin:4px 0;white-space:pre-wrap;color:var(--muted)}
.out-progress{height:2px;border:0;border-radius:99px;background:color-mix(in srgb,var(--out-tone) 10%,transparent);overflow:hidden;margin-bottom:10px}
.out-progress>span{display:block;height:100%;border-radius:inherit;background:var(--out-tone)}
.out-card .out-doc{padding:8px 0;border:0;border-radius:0;background:none;transition:opacity .16s ease}
.out-card .out-ic{width:34px;height:40px;border-radius:7px 11px 7px 7px;font-size:9px;box-shadow:inset 0 1px 0 #ffffff30}
.out-card .out-link{padding:5px 0;border:0;border-radius:0;background:none;transition:opacity .16s ease}
.out-card .out-link strong{font-size:12px;font-weight:500}.out-card .out-link small{font-size:11px;line-height:1.6}
.cw .cw-row:not(.me):not(.cw-request-row):has(.out-card){width:100%;max-width:min(100%,440px)}
.cw .cw-row:not(.me):not(.cw-request-row)>.cw-bubble.cw-result-bubble{width:100%;min-width:0;padding:0;background:transparent;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;border:0}
.cw .cw-bubble.cw-result-bubble:hover{transform:none;box-shadow:none}.cw-result-bubble>.out-card{margin:0}.cw-result-bubble>.cw-meta{padding-left:12px}
.out-ov-body>.out-card{background:none;padding:0}.out-ov-body>.out-card>.out-body{background:none}
@media(max-width:420px){.out-card .out-head{padding:5px 8px 11px}.out-heading .out-title{font-size:20px}.out-card .out-body{padding:12px 14px}.out-mail-detail{padding-left:20px}.out-mail-top{flex-wrap:wrap;gap:3px}}
@media(prefers-reduced-motion:reduce){.out-card .out-btn,.out-mail summary,.out-mail-chevron,.out-card .out-link,.out-card .out-doc{transition:none}}
`;

export const CHAT_RESULT_JS = String.raw`
function outResultIcon(kind){
  var paths={email:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m3 7 9 6 9-6"/>',brief:'<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M9 8h6M9 12h6M9 16h3"/>',tasks:'<path d="m4 6 2 2 4-4M13 6h7M4 13h3M13 13h7M4 20h3M13 20h7"/>',documents:'<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',links:'<path d="m10 13 4-4M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',chart:'<path d="M4 3v18h17M9 17v-5M14 17V7M19 17v-8"/>',image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',map:'<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2"/>',video:'<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 8 6 4-6 4Z"/>',audio:'<path d="M9 18V5l11-2v13M9 8l11-2"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'};
  return '<span class="out-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+(paths[kind]||paths.brief)+'</svg></span>';
}
function outResultText(value){return typeof value==='string'?value:typeof value==='number'?String(value):'';}
function outEmailHtml(data){
  if(!data||typeof data!=='object'||Array.isArray(data)||!Array.isArray(data.messages))return null;
  var messages=data.messages;
  if(messages.some(function(m){return !m||typeof m!=='object'||Array.isArray(m)||!outResultText(m.subject).trim();}))return null;
  var unread=messages.filter(function(m){return m.unread===true;}).length;
  var html=(data.summary?'<p class="out-lead">'+outEsc(outResultText(data.summary))+'</p>':'');
  if(!messages.length)return html+'<div class="out-empty">'+outResultIcon('email')+'<span>No emails in this result.</span></div>';
  html+='<div class="out-count"><b>'+messages.length+'</b><span>email'+(messages.length===1?'':'s')+' in this briefing</span>'+(unread?'<span class="out-badge">'+unread+' unread</span>':'')+'</div><div class="out-mail-list">';
  var section='';
  messages.forEach(function(m){
    var sender=outResultText(m.sender||m.from)||'Sender not provided',subject=outResultText(m.subject),summary=outResultText(m.summary||m.preview||m.body);
    var group=outResultText(m.section)||'In your inbox';
    if(group!==section){html+='<h4 class="out-mail-section">'+outEsc(group)+'</h4>';section=group;}
    var date=outResultText(m.date),parsed=new Date(date),validDate=date&&!isNaN(parsed.getTime()),url=outSafeUrl(m.url),next=outResultText(m.nextStep);
    html+='<details class="out-mail" data-unread="'+(m.unread===true)+'"><summary><span class="out-mail-number" aria-hidden="true"></span><span class="out-mail-copy"><span class="out-mail-subject">'+outEsc(subject)+'</span>'+(summary?'<span class="out-mail-preview">'+outEsc(summary)+'</span>':'')+'<span class="out-mail-top"><strong>'+outEsc(sender)+'</strong>'+(date?'<time'+(validDate?' datetime="'+outEsc(parsed.toISOString())+'"':'')+'>'+outEsc(validDate?parsed.toLocaleDateString(undefined,{month:'short',day:'numeric'}):date)+'</time>':'')+'</span>'+((m.unread===true||m.label)?'<span class="out-mail-flags">'+(m.unread===true?'<span class="out-badge">Unread</span>':'')+(m.label?'<span class="out-badge">'+outEsc(outResultText(m.label))+'</span>':'')+'</span>':'')+'</span><span class="out-mail-chevron" aria-hidden="true">&#8250;</span></summary><div class="out-mail-detail">';
    if(m.from&&m.from!==sender)html+='<p class="out-mail-address">'+outEsc(outResultText(m.from))+'</p>';
    html+=(summary?'<p>'+outEsc(summary)+'</p>':'')+(next?'<div class="out-next"><strong>Next step</strong><span>'+outEsc(next)+'</span></div>':'');
    if(m.body&&outResultText(m.body)!==summary)html+='<p>'+outEsc(outResultText(m.body))+'</p>';
    if(url)html+='<a class="out-result-link" href="'+outEsc(url)+'" target="_blank" rel="noopener noreferrer">Open email <span aria-hidden="true">&#8599;</span></a>';
    html+='</div></details>';
  });
  return html+'</div>'+(data.truncated===true?'<p class="out-note">Showing a selection of the returned emails.</p>':'');
}
function outBriefHtml(data){
  if(!data||typeof data!=='object'||Array.isArray(data))return null;
  var summary=outResultText(data.summary),highlights=data.highlights==null?[]:data.highlights,next=outResultText(data.nextStep);
  if(!Array.isArray(highlights)||!summary&&!highlights.length&&!next)return null;
  if(highlights.some(function(h){return typeof h!=='string'&&(!h||typeof h!=='object'||Array.isArray(h)||!outResultText(h.text));}))return null;
  var html=summary?'<p class="out-brief-intro">'+outEsc(summary)+'</p>':'';
  if(highlights.length)html+='<ol class="out-highlights">'+highlights.map(function(h,i){return '<li><span class="out-highlight-index" aria-hidden="true">'+String(i+1).padStart(2,'0')+'</span><div>'+(h.label?'<strong>'+outEsc(outResultText(h.label))+'</strong>':'')+'<p>'+outEsc(typeof h==='string'?h:outResultText(h.text))+'</p></div></li>';}).join('')+'</ol>';
  return html+(next?'<div class="out-next"><strong>Next step</strong><span>'+outEsc(next)+'</span></div>':'');
}
function outTasksHtml(data){
  if(!data||typeof data!=='object'||Array.isArray(data)||!Array.isArray(data.items))return null;
  if(data.items.some(function(item){return !item||typeof item!=='object'||Array.isArray(item)||!outResultText(item.text).trim();}))return null;
  var done=data.items.filter(function(item){return item.status==='done';}).length,total=data.items.length;
  var html=data.summary?'<p class="out-lead">'+outEsc(outResultText(data.summary))+'</p>':'';
  if(!total)return html+'<div class="out-empty">'+outResultIcon('tasks')+'<span>No tasks in this result.</span></div>';
  html+='<div class="out-count"><b>'+done+'<span aria-hidden="true">/'+total+'</span></b><span>completed</span></div><div class="out-progress" role="progressbar" aria-label="Tasks completed" aria-valuemin="0" aria-valuemax="'+total+'" aria-valuenow="'+done+'"><span style="width:'+(done/total*100)+'%"></span></div><ul class="out-task-list">';
  data.items.forEach(function(item){
    var status=['done','in_progress','pending'].indexOf(item.status)>=0?item.status:'pending',label=status==='done'?'Completed':status==='in_progress'?'In progress':'Pending';
    html+='<li class="out-task" data-status="'+status+'"><span class="out-task-mark" aria-hidden="true">'+(status==='done'?'&#10003;':status==='in_progress'?'&#8226;':'')+'</span><div class="out-task-copy"><strong>'+outEsc(outResultText(item.text))+'</strong><div class="out-task-meta"><span>'+label+'</span>'+(item.due?'<span>Due '+outEsc(outResultText(item.due))+'</span>':'')+'</div>'+(item.detail?'<details><summary>View details</summary><p>'+outEsc(outResultText(item.detail))+'</p></details>':'')+'</div></li>';
  });
  return html+'</ul>';
}
`;
