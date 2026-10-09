export const REPORT_DETAILS_CSS = String.raw`
  #toolPanel.run-side { inset:12px auto 12px 12px; width:min(400px,calc(100vw - 24px)); border:1px solid color-mix(in srgb,var(--card) 46%,transparent); border-radius:24px; background:color-mix(in srgb,var(--card) 78%,transparent); box-shadow:0 18px 60px -24px rgba(18,44,70,.3); backdrop-filter:blur(28px) saturate(1.15); -webkit-backdrop-filter:blur(28px) saturate(1.15); overflow:hidden; animation:taskDetailsEnter .3s cubic-bezier(.22,1,.36,1); }
  #toolPanel .side-panel-head { min-height:62px; padding:12px 18px; border-bottom:1px solid color-mix(in srgb,var(--border) 45%,transparent); font-size:14px; font-weight:600; letter-spacing:-.015em; background:transparent; }
  #toolPanel .side-panel-head .close { width:34px; height:34px; border-radius:50%; display:grid; place-items:center; transition:background-color .18s,transform .18s; }
  #toolPanel .side-panel-head .close:active { transform:scale(.94); }
  #toolPanel .side-panel-head .close:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  #toolPanel .side-body { padding:18px; border:0; background:transparent; scrollbar-width:none; }
  #toolPanel .side-body::-webkit-scrollbar { display:none; }
  #toolPanel .side-summary { border:0; border-radius:18px; background:color-mix(in srgb,var(--card) 58%,transparent); padding:16px; margin-bottom:22px; }
  #toolPanel .side-summary .t { font-size:13px; font-weight:600; letter-spacing:0; }
  #toolPanel .side-summary .d { font-family:inherit; font-size:12px; line-height:1.6; margin-top:6px; }
  #toolPanel .side-fail { padding:16px; border-radius:18px; border:1px solid color-mix(in srgb,var(--err) 18%,transparent); background:color-mix(in srgb,var(--card) 68%,transparent); font-size:12px; line-height:1.6; }
  #toolPanel .side-fail .ft { font-size:13px; font-weight:600; line-height:1.5; margin-bottom:9px; }
  #toolPanel .side-fail .fmsg { color:var(--muted); }
  #toolPanel .side-fail .fhint { margin-top:10px; }
  #toolPanel .side-fail .facts { gap:8px; margin-top:14px; }
  #toolPanel .side-fail .facts .btn { min-height:34px; padding:7px 11px; border-radius:11px; font-size:11.5px; }
  #toolPanel .side-fail .facts .btn.dark { background:var(--accent); color:var(--on-accent); border:0; }
  #toolPanel .section-h { font-size:12px; font-weight:600; letter-spacing:0; text-transform:none; border:0; color:var(--text); margin:24px 0 10px; padding:0; }
  #toolPanel .empty { padding:8px 0 12px; font-size:12px; line-height:1.6; color:var(--muted); }
  #toolPanel :is(.crit,.step,.ev-row) { border:0; border-radius:12px; background:color-mix(in srgb,var(--card) 35%,transparent); padding:10px 12px; margin-bottom:6px; }
  #toolPanel .file-chip { border-radius:10px; background:color-mix(in srgb,var(--card) 45%,transparent); }
  @keyframes taskDetailsEnter { from { opacity:0; transform:translate3d(-12px,0,0) scale(.99); } to { opacity:1; transform:none; } }
  @media(prefers-reduced-motion:reduce) { #toolPanel.run-side { animation:none; } #toolPanel .side-panel-head .close { transition:none; } }
  .agent-report { padding:8px 0 16px; max-width:860px; border:0; border-radius:0; background:transparent; box-shadow:none; }
  .agent-report-heading { position:relative; display:flex; flex-wrap:wrap; align-items:center; gap:10px; padding-right:34px; margin-bottom:12px; font-size:12px; }
  .agent-report-status { color:var(--muted); font-size:11px; }
  .agent-report-status[data-status=complete] { color:var(--ok); }
  .agent-report-status[data-status=blocked],.agent-report-status[data-status=paused] { color:var(--evidence); }
  .agent-report-status[data-status=failed] { color:var(--err); }
  .agent-report-body { font-size:14px; line-height:1.75; overflow-wrap:anywhere; }
  .agent-report-body p { margin:0 0 14px; }
  .agent-report-body h2,.agent-report-body h3,.agent-report-body h4 { font-size:14px; color:var(--text); margin:20px 0 9px; }
  .agent-report-body ul,.agent-report-body ol { margin:8px 0 18px; padding-left:22px; }
  .agent-report-body li { margin:6px 0; padding-left:3px; }
  .agent-report-body li::marker { color:var(--accent); }
  .agent-report-body strong { color:var(--accent); background:color-mix(in srgb,var(--accent) 7%,transparent); border-radius:3px; padding-inline:2px; }
  .agent-report-body code { color:var(--run); background:var(--card2); padding:2px 4px; border-radius:4px; font-size:12px; }
  .agent-report-body a { color:var(--accent); }
  .agent-report-files,.session-files-link { display:inline-flex; gap:8px; align-items:center; color:var(--accent); padding:8px 0; font-size:12px; }
  .agent-report-files svg,.session-files-link svg { width:16px; height:16px; }
  .run-files-page { min-width:0; }
  .run-files-page h2 { font-size:18px; margin:0 0 8px; }
  .run-files-page > p { color:var(--muted); font-size:12px; line-height:1.6; }
  .run-files-page .report-files { background:transparent; border:0; border-radius:0; }
  .run-files-page .report-files-head { padding-inline:0; }
  .run-files-page .report-file-row { padding:10px 0; flex-wrap:wrap; }
  .run-files-page .report-file-path { white-space:normal; overflow-wrap:anywhere; flex:1; }
  .run-files-page .session-file { max-width:none; margin:0; padding:12px 0; background:transparent; border:0; border-bottom:1px solid var(--border); border-radius:0; box-shadow:none; }
  .run-files-page .session-file .file-actions { flex-wrap:wrap; }
  .run-files-page .session-file .file-actions a { border:0; }
`;

export const REPORT_DETAILS_JS = String.raw`
  function runSharedFiles(runId) {
    var sess=S.sessions[runId];if(!sess)return [];
    var files=new Map();((sess.session&&sess.session.files)||[]).concat(Object.values(sess.sharedFiles||{})).forEach(function(file){if(file&&file.id)files.set(file.id,file);});return Array.from(files.values());
  }
  function renderRunFiles(runId) {
    var body=$('sideBody'),panel=$('toolPanel'),sess=S.sessions[runId];if(!body||!panel||panel.hidden||S.panelKind!=='files'||S.active!==runId||!sess)return;
    var shared=runSharedFiles(runId),changed=reportFiles(sess.session&&sess.session.report||{filesChanged:sess.ledger&&sess.ledger.filesChanged||[]}),signature=JSON.stringify([runId,shared,changed]);
    if(body._runFilesSignature===signature)return;body._runFilesSignature=signature;
    body.innerHTML='<main class="run-files-page"><h2>Files &amp; details</h2><p>Shared downloads and changed project files for this task.</p><section aria-label="Shared files"><h3>Shared files · '+shared.length+'</h3><div id="runSharedFiles"></div></section>'+reportChangedFilesHtml(runId,changed)+'</main>';
    var holder=body.querySelector('#runSharedFiles');shared.forEach(function(file){holder.appendChild(sessionFileCard(file));});if(!shared.length)holder.innerHTML='<p class="empty">No shared files yet.</p>';
    if(!changed.length)body.querySelector('main').insertAdjacentHTML('beforeend','<p class="empty">No changed project files recorded.</p>');
  }
  function recordRunFile(sess,meta) {
    if(!sess||!meta||!meta.id)return;var files=sess.sharedFiles||(sess.sharedFiles=Object.create(null));files[meta.id]=meta;
  }
  function sessionFilesLink(sess,runId) {
    var button=sess.fileDetailsLink;
    if(!button||!button.isConnected){button=document.createElement('button');button.className='session-files-link';button.onclick=function(){openToolPanel('files');};sess.fileDetailsLink=button;}
    var count=runSharedFiles(runId).length;button.innerHTML=icon('file')+'<span>'+count+' shared '+(count===1?'file':'files')+' · View details</span>';button.setAttribute('aria-label','View '+count+' shared files');return button;
  }
`;
