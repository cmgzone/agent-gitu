// Company chat shares Cowork's chat classes and renderer; only the surrounding
// company navigation and API scope differ.
export const COMPANY_CHAT_CSS = String.raw`
  .company-page.company-chat-active{display:flex;flex-direction:column;overflow:hidden}
  .company-chat-active .company-shell{width:100%;flex:1;min-height:0;display:flex;flex-direction:column}
  .company-chat-active .company-head{flex-shrink:0;margin-bottom:16px}
  .company-chat-active .company-tabs{flex-shrink:0;margin-bottom:8px}
  .company-chat-active #companyBody{flex:1;min-height:0;display:flex}
  .company-chat-active .company-error:empty{display:none}
  .company-chat.cw-chat{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column}
  .company-chat .cw-msgs{padding:12px 0;scrollbar-gutter:stable}
  .company-chat .cw-composer-wrap{padding:10px 0 0}
  .company-chat .cw-composer textarea{min-height:24px;padding:0}
  .company-chat .company-plain-message{white-space:pre-wrap;overflow-wrap:anywhere}
  .company-chat .cw-pending:empty{display:none}
  .company-chat .company-file-limit{padding:4px 12px;font-size:11px}
  .company-chat .company-attachment{display:flex;gap:8px;align-items:center}
  .company-chat .cw-bubble .cw-file{margin-top:10px}
  @media(max-width:600px){.company-chat-active .company-head{margin-bottom:8px}.company-chat .cw-msgs{padding:8px 0}.company-chat .cw-row,.company-chat .cw-row.me{max-width:100%}.company-chat .cw-delivery-note{margin-left:0}}
`;

export const COMPANY_CHAT_JS = String.raw`
  function companyChatIcon(name){
    if(typeof cwIcon==='function')return cwIcon(name);
    var paths={plus:'M12 5v14M5 12h14',send:'M12 19V5M5 12l7-7 7 7'};
    return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+paths[name]+'"/></svg>';
  }
  function companyChatMount(body){
    body.innerHTML='<div class="company-chat cw-chat"><div id="companyMessages" class="cw-msgs" role="log" aria-label="Company messages" aria-live="polite"><div id="companyMessageHistory"></div><div id="companyChatQuestions" class="company-chat-questions"></div></div><div class="cw-composer-wrap"><div class="cw-delivery" aria-label="Message delivery">'+[['auto','Follow up'],['steer','Steer'],['queue','Queue'],['question','Ask']].map(function(mode){return '<button type="button" data-company-delivery="'+mode[0]+'" aria-pressed="'+(mode[0]==='auto')+'">'+mode[1]+'</button>';}).join('')+'<span id="companyChatStatus" class="cw-delivery-note" role="status"></span></div><div id="companyChatPending" class="cw-pending"></div><div class="cw-composer"><input type="hidden" id="companyDelivery" value="auto"><input type="file" id="companyChatFiles" multiple hidden><button type="button" id="companyChatAttach" class="cw-attach" title="Attach files" aria-label="Attach company files">'+companyChatIcon('plus')+'</button><textarea id="companyChatText" rows="1" placeholder="Message the company lead…" aria-label="Message the company lead"></textarea><button type="button" class="cw-send" id="companySend" title="Send message" aria-label="Send message">'+companyChatIcon('send')+'</button></div><span id="companyChatFileLimit" class="company-muted company-file-limit"></span></div></div>';
    var id=Companies.id,text=$('companyChatText');Companies.chatDrafts=Companies.chatDrafts||{};var draft=Companies.chatDrafts[id]||{text:'',delivery:'auto'};text.value=draft.text;
    function mode(value){$('companyDelivery').value=value;body.querySelectorAll('[data-company-delivery]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.companyDelivery===value));});save();}
    function size(){text.style.height='auto';text.style.height=Math.min(text.scrollHeight,160)+'px';}
    function save(){Companies.chatDrafts[id]={text:text.value,delivery:$('companyDelivery').value};}
    body.querySelectorAll('[data-company-delivery]').forEach(function(b){b.onclick=function(){mode(b.dataset.companyDelivery);};});mode(draft.delivery);text.oninput=function(){size();save();};size();
    text.onkeydown=function(e){if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('companySend').click();}};
    $('companyChatAttach').onclick=function(){$('companyChatFiles').click();};
    companyChatAttachments();companyChatRefresh();
  }
  function companyChatMessage(m,data){
    var user=m.role==='user',members=Companies.data.agents||[],lead=members.find(function(a){return a.id===m.agentId;})||members.find(function(a){return a.id===Companies.data.company.leadId;})||{name:m.agentName||'Company lead'},text=m.text||'';
    if(!user&&typeof cwVisibleReply==='function')text=cwVisibleReply(text);
    var content=typeof cwBody==='function'?cwBody(text,members,false):'<div class="company-plain-message">'+esc(text)+'</div>',stamp=m.ts||m.createdAt,time=stamp?new Date(stamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'';
    content+=(m.artifactIds||[]).map(function(id){var a=(data.artifacts||[]).find(function(a){return a.id===id;});if(!a)return '';var url=companyUrl('/cowork/artifacts/'+encodeURIComponent(id));return '<div class="cw-file"><div class="cw-file-info"><strong>'+esc(a.name)+'</strong><div class="company-muted">'+esc(a.mime||'File')+'</div></div><div class="cw-file-actions"><a class="btn ghost" href="'+url+'">Download</a><a class="btn ghost" href="'+url+'/preview" target="_blank" rel="noopener">Preview</a></div></div>';}).join('');
    if(m.role==='system')return '<div class="cw-sys">'+esc(text)+'</div>';
    if(!user&&typeof cwReplyHtml==='function')return cwReplyHtml(lead,time,content,'',m.id);
    return '<div class="cw-row'+(user?' me':'')+'"><div class="cw-bubble"><div class="cw-meta"><span class="nm">'+esc(user?'You':m.agentName||lead.name)+'</span><span class="tg">'+esc(time)+'</span></div>'+content+'</div></div>';
  }
  async function companyChatRefresh(){var id=Companies.id;try{var data=await api(companyUrl('/chat'));if(id!==Companies.id||Companies.tab!=='Chat'||!$('companyMessages'))return;if(data.agents){var saved=Companies.data.agents||[];Companies.data.agents=data.agents.map(function(agent){return {...saved.find(function(a){return a.id===agent.id;}),...agent};});}Companies.data.requests=data.requests||[];companyRailRefresh(Companies.data);var box=$('companyMessages'),nearBottom=box.scrollHeight-box.scrollTop-box.clientHeight<80,html=data.messages.map(function(m){return companyChatMessage(m,data);}).join('');var history=$('companyMessageHistory');if(history.innerHTML!==html)history.innerHTML=html;var questions=$('companyChatQuestions'),questionHtml=(data.requests||[]).filter(function(r){return r.status==='open';}).map(function(r){return companyRequestHtml(r,Companies.data);}).join('');if(questions._markup!==questionHtml&&!questions.contains(document.activeElement)){questions.innerHTML=questionHtml;questions._markup=questionHtml;companyBindAttention(questions,{...Companies.data,requests:data.requests||[]});}if(nearBottom)box.scrollTop=box.scrollHeight;$('companyChatStatus').textContent=data.busy?'Working…':'Enter to send · Shift + Enter for a new line';}catch(error){companyError(error);}}
`;
