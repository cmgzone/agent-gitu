export const CHROME_HANDOFF_CSS = String.raw`
.chrome-handoff{padding:12px;background:var(--card);border-top:1px solid var(--line);flex:none}.chrome-handoff h2{font-size:12px;margin:0 0 4px}.chrome-handoff p{font-size:10px;color:var(--muted);line-height:1.5;margin:0 0 10px}.chrome-handoff-fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.5fr);gap:8px}.chrome-handoff label{font-size:9px;color:var(--muted);display:block}.chrome-handoff select{display:block;width:100%;min-width:0;margin:4px 0 9px;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:8px;color:var(--text)}.chrome-handoff button{border-radius:999px;padding:9px 14px;font-size:11px;font-weight:600}.chrome-handoff button:disabled{opacity:.5;cursor:default}.chrome-handoff-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.chrome-handoff-actions span{font-size:10px;color:var(--muted)}#chromeShare{background:var(--icon);color:white;border-color:transparent}#chromePrivate{background:var(--text);color:var(--bg)}.chrome-shared-notice{position:absolute;top:12px;left:12px;right:12px;margin:auto;max-width:380px;padding:10px 12px;border-radius:12px;background:var(--card);color:var(--text);box-shadow:0 4px 20px #0003;font-size:11px;text-align:center;z-index:2;pointer-events:none}@media(max-width:420px){.chrome-handoff{padding:10px}.chrome-handoff-fields{grid-template-columns:1fr 1fr}.chrome-handoff button{padding:9px 11px}}
`;

export const CHROME_HANDOFF_HTML = String.raw`
<section class="chrome-handoff" aria-label="Chrome control"><h2>Continue with your teammate</h2><p>Share this Chrome window with one teammate in the chat you choose. Take private control for passwords and verification.</p><div class="chrome-handoff-fields"><label>Teammate<select id="chromeShareAgent" aria-label="Teammate to use Chrome"></select></label><label>Continue in<select id="chromeShareChat" aria-label="Chat to continue"></select></label></div><div class="chrome-handoff-actions"><button id="chromeShare">Return to teammate</button><button id="chromePrivate" hidden>Take private control</button><span id="chromeShareStatus" role="status"></span></div></section>
`;

export const CHROME_HANDOFF_JS = String.raw`
const chromeAgentSelect=document.getElementById('chromeShareAgent'),chromeChatSelect=document.getElementById('chromeShareChat'),chromeShareButton=document.getElementById('chromeShare'),chromePrivateButton=document.getElementById('chromePrivate'),chromeShareStatus=document.getElementById('chromeShareStatus');
let chromeHandoffAgents=[],chromeShared=false,chromeAgentOptions='',chromeChatOptions='';
function chromeFillChats(){
  const agent=chromeHandoffAgents.find(value=>value.id===chromeAgentSelect.value),chats=agent?.conversations||[],before=chromeChatSelect.value,key=JSON.stringify(chats);
  if(chromeChatOptions!==key){chromeChatOptions=key;chromeChatSelect.replaceChildren();chats.forEach(chat=>{const option=document.createElement('option');option.value=chat.id;option.textContent=chat.title||agent.name;chromeChatSelect.appendChild(option);});if(chats.some(chat=>chat.id===before))chromeChatSelect.value=before;}
  chromeShareButton.textContent=agent?'Return to '+agent.name:'Return to teammate';
  chromeShareButton.disabled=chromeShared||state!=='running'||!agent||!chromeChatSelect.value;
}
function syncChromeHandoff(value){
  chromeHandoffAgents=(value.handoffAgents||[]).slice().sort((a,b)=>Number(!!b.chiefOfStaff)-Number(!!a.chiefOfStaff));
  const key=JSON.stringify(chromeHandoffAgents.map(agent=>({id:agent.id,name:agent.name}))),selected=chromeAgentSelect.value;
  if(chromeAgentOptions!==key){chromeAgentOptions=key;chromeAgentSelect.replaceChildren();chromeHandoffAgents.forEach(agent=>{const option=document.createElement('option');option.value=agent.id;option.textContent=agent.name;chromeAgentSelect.appendChild(option);});if(chromeHandoffAgents.some(agent=>agent.id===selected))chromeAgentSelect.value=selected;else{const from=/\/server-browser\/([\w-]+)\/view/.exec(returnTo)?.[1];if(chromeHandoffAgents.some(agent=>agent.id===from))chromeAgentSelect.value=from;}}
  const wasShared=chromeShared;chromeShared=!!value.handoff;
  if(chromeShared){chromeAgentSelect.value=value.handoff.agentId;chromeFillChats();chromeChatSelect.value=value.handoff.conversationId;}
  chromeFillChats();chromeAgentSelect.disabled=chromeShared;chromeChatSelect.disabled=chromeShared;
  chromeShareButton.hidden=chromeShared;chromePrivateButton.hidden=!chromeShared;
  chromeShareStatus.textContent=chromeShared?'Shared with '+value.handoff.agentName:'Private to you';
  document.getElementById('privacyLabel').textContent=chromeShared?'Full Google Chrome · Shared with '+value.handoff.agentName:'Full Google Chrome · Private to you';
  const screen=document.getElementById('screen');screen.style.pointerEvents=chromeShared?'none':'';
  let notice=document.getElementById('chromeSharedNotice');
  if(chromeShared&&!notice){notice=document.createElement('div');notice.id='chromeSharedNotice';notice.className='chrome-shared-notice';screen.appendChild(notice);}
  if(notice){notice.hidden=!chromeShared;notice.textContent=chromeShared?value.handoff.agentName+' is using this Chrome window. Take private control below to interact.':'';}
  document.querySelectorAll('.keyboard input,.keyboard button').forEach(control=>control.disabled=chromeShared);
  if(chromeShared&&!wasShared)text.value='';
}
chromeAgentSelect.onchange=chromeFillChats;chromeChatSelect.onchange=chromeFillChats;
chromeShareButton.onclick=()=>{const agent=chromeHandoffAgents.find(value=>value.id===chromeAgentSelect.value);if(!agent||!chromeChatSelect.value)return;text.value='';chromeShareButton.disabled=true;return post('share',{agentId:agent.id,conversationId:chromeChatSelect.value}).finally(refresh);};
chromePrivateButton.onclick=()=>{text.value='';return post('take-control').finally(refresh);};
`;
