export const REPORT_DETAILS_CSS = String.raw`
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
