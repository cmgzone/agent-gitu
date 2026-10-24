/** Shared question presentation and interaction. Each surface owns its state and
 * transport. Stateless helpers are embedded by both standalone UI snippets. */
export const CHAT_QUESTION_CSS = String.raw`
  .chat-question{min-width:0;border:1px solid var(--border);border-radius:14px;padding:18px;background:var(--card);color:var(--text);text-align:left}
  .chat-question *{box-sizing:border-box}.chat-question-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
  .chat-question-label{font-size:11px;font-weight:650;color:var(--accent);display:flex;align-items:center;gap:7px}.chat-question-label svg{flex:none}
  .chat-question-state{font-size:11px;color:var(--muted)}.chat-question h3{font-size:15px;line-height:1.45;margin:0;font-weight:600;overflow-wrap:anywhere}
  .chat-question .chat-question-detail{font-size:13px;line-height:1.6;color:var(--muted);white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0 14px}
  .chat-question-choices{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0}.chat-question .chat-question-choice{font:inherit;font-size:12px;line-height:1.4;color:var(--text);background:var(--card2,var(--card));border:1px solid var(--border);border-radius:9px;padding:9px 12px;cursor:pointer;text-align:left;white-space:normal;overflow-wrap:anywhere;max-width:100%;min-height:38px}
  .chat-question-choice:hover,.chat-question-choice[aria-pressed=true]{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 9%,var(--card))}
  .chat-question-form{margin-top:14px}.chat-question-form label{display:block;font-size:12px;font-weight:550;margin:0 0 7px}
  .chat-question .chat-question-form textarea{display:block;width:100%;min-width:0;min-height:88px;max-height:320px;resize:vertical;border:1px solid var(--border);border-radius:10px;padding:11px 12px;background:var(--card2,var(--card));color:var(--text);font:inherit;font-size:13px;line-height:1.55}
  .chat-question :is(textarea,button):focus-visible{outline:2px solid var(--accent);outline-offset:3px}.chat-question textarea[aria-invalid=true]{border-color:var(--err,#c0392b)}
  .chat-question-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px}.chat-question-hint{font-size:11px;color:var(--muted)}
  .chat-question .chat-question-submit{padding:9px 14px;font-size:12px;min-height:38px;white-space:nowrap}.chat-question [disabled]{opacity:.6;cursor:wait}
  .chat-question-error{font-size:12px;color:var(--err,#c0392b);margin:10px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}.chat-question-error:empty{display:none}
  .chat-question-answer{margin-top:14px;border-top:1px solid var(--border);padding-top:12px;font-size:13px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}.chat-question-answer strong{display:block;font-size:11px;color:var(--muted);margin-bottom:4px}
  .company-question-author{display:block;font-size:12px;color:var(--muted);margin:0 0 10px}.company-chat-questions .company-question{max-width:680px;margin:12px auto}
  .cw-request-row .cw-bubble:has(>.chat-question){padding:0;background:none;border:0;box-shadow:none}.cw-request-row .cw-bubble:has(>.chat-question)>.cw-meta{padding:0 2px 8px}
  @media(max-width:600px){.chat-question{padding:14px}.chat-question-footer{align-items:flex-start;flex-direction:column}.chat-question .chat-question-submit{align-self:flex-end}.chat-question-hint{line-height:1.5}}
`;

export const CHAT_QUESTION_JS = String.raw`
  function cardPlainText(value,fallback,limit){
    var text=String(value||'').trim();limit=limit||220;
    if(!text||/^(?:\$\s*)?(?:npm|pnpm|yarn|npx|git|node|python|bash|powershell|curl)\s/i.test(text)||/[\x00-\x08]/.test(text)||/^\s*[\[{]/.test(text)||/\x60{3}|(?:^|\n)\s*(?:const |let |var |import |export |function |Traceback|at \S+\s*\()/.test(text))return fallback||'';
    text=text.replace(/\x60([^\x60]+)\x60/g,'$1').replace(/^#+\s*/gm,'').replace(/\s+/g,' ').trim();
    return text.length>limit?text.slice(0,limit-1).trim()+'…':text;
  }
  function cardTechnicalDetails(raw,id){return raw?'<details class="card-technical" data-card-details="'+esc(id||'details')+'"><summary>Technical details</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto">'+esc(raw)+'</pre></details>':'';}
  function cardActionPresentation(tool,why,summary){
    var raw=String(summary||''),data;try{data=JSON.parse(raw);}catch(e){var offset=raw.indexOf('{');if(offset>=0)try{data=JSON.parse(raw.slice(offset));}catch(ignore){}}
    var command=data&&typeof data.command==='string'?data.command:raw,combined=String(tool||'')+' '+command;
    var title='Allow the next action?',detail=cardPlainText(why,'The agent needs your permission to continue.');
    if(/\b(?:rm|rmdir|del|Remove-Item)\b|git\s+(?:reset\s+--hard|clean\s+-\w*f)|delete_file/i.test(combined)){title='Allow files to be removed?';detail='This action can delete files or discard changes. Check the details before deciding.';}
    else if(/git\s+push.*(?:--force|-f\b)/i.test(combined)){title='Allow shared history to be replaced?';detail='This can overwrite changes in the shared repository and affect other people.';}
    else if(/\b(?:publish|deploy)\b|git\s+push/i.test(combined)){title='Publish these changes?';detail='This will send changes to a shared or live service. Review the destination in the details.';}
    else if(/(?:curl|wget|Invoke-WebRequest).*(?:\||;|&&).*\b(?:sh|bash|powershell|iex)\b/i.test(combined)){title='Download and run software?';detail='This downloads and runs instructions from another source. Review the source before allowing it.';}
    else if(/\b(?:npm|pnpm|yarn|pip|pip3|uv)\s+(?:install|add|sync)\b/i.test(combined)){title='Install project software?';detail='This downloads software needed by the project and may run installation instructions.';}
    else if(/^(?:(?:npm|pnpm|yarn)\s+(?:run\s+)?test|(?:npx\s+)?(?:pytest|vitest|jest))\b[^;&|]*$/i.test(command.trim())){title='Run the project checks?';detail='Run checks to look for problems in the recent changes.';}
    else if(/^(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:build|typecheck|lint)\b[^;&|]*$/i.test(command.trim())){title='Check the project is ready?';detail='Check that the project can be built or that its files have no reported errors.';}
    else if(/write_file|apply_edit|apply_patch/i.test(String(tool))){title='Update the project files?';detail='This will change files in the project. The exact changes are available below.';}
    else if(/read_file|search_files|list_files/i.test(String(tool))){title='Inspect project files?';detail='Read project files to understand the task and check the work.';}
    else if(/run_command|shell|terminal/i.test(String(tool))){title='Run a project action?';detail=cardPlainText(why,'Run a command in the project. Check the details for exactly what it will do.');}
    return {title:title,detail:detail};
  }
  function cardRequestPresentation(request){
    var raw=String(request.detail||''),title=String(request.title||''),approval=/^Approve\s+([\w.:-]+)/i.exec(title),presentation;
    if(approval){presentation=cardActionPresentation(approval[1],raw.split(/\n\s*\n/)[0],raw);return{title:presentation.title,detail:presentation.detail,technical:raw};}
    if(/^Review .*plan before implementation/i.test(title))return{title:'Review the proposed work',detail:'The agent has prepared a plan and is waiting for your decision before making changes. You can approve it or ask for changes.',technical:raw};
    var detail=raw?cardPlainText(raw,'Open the details to see what the agent is asking about.'):'';
    return{title:cardPlainText(title,'Your decision is needed',120),detail:detail,technical:detail!==raw?raw:''};
  }

  function chatQuestionState(owner,scope,id){
    var scopes=owner.questionCards||(owner.questionCards=Object.create(null)),cards=scopes[scope]||(scopes[scope]=Object.create(null));
    return cards[id]||(cards[id]={text:'',pending:false,error:'',answered:false,response:''});
  }
  function chatQuestionHtml(request,owner,scope){
    var presentation=cardRequestPresentation(request),state=chatQuestionState(owner,scope,request.id),closed=request.status!=='open'||state.answered,answer=state.answered?state.response:request.response,
      inputId='question-'+encodeURIComponent(scope)+'-'+encodeURIComponent(request.id),errorId=inputId+'-error',hintId=inputId+'-hint',pending=state.pending?' disabled':'';
    return '<section class="chat-question" data-question-card="'+esc(request.id)+'" aria-label="Question: '+esc(request.title)+'" aria-busy="'+String(state.pending)+'">'+
      '<div class="chat-question-heading"><span class="chat-question-label"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01"/></svg>Question</span><span class="chat-question-state">'+(closed?(request.status==='answered'||state.answered?'Answered':esc(request.status)):state.pending?'Sending…':'Needs your answer')+'</span></div>'+
      '<h3>'+esc(presentation.title)+'</h3>'+(presentation.detail?'<p class="chat-question-detail">'+esc(presentation.detail)+'</p>':'')+cardTechnicalDetails(presentation.technical,request.id)+
      (closed?(answer?'<div class="chat-question-answer cw-request-result"><strong>Your answer</strong>'+esc(answer)+'</div>':''):
      '<form class="chat-question-form" data-question-form="'+esc(request.id)+'">'+
      ((request.options||[]).length?'<div class="chat-question-choices" role="group" aria-label="Suggested answers">'+request.options.map(function(option){return '<button type="button" class="chat-question-choice" data-question-choice="'+esc(option)+'" aria-pressed="'+String(state.text===option)+'"'+pending+'>'+esc(option)+'</button>';}).join('')+'</div>':'')+
      '<label for="'+esc(inputId)+'">Your answer</label><textarea id="'+esc(inputId)+'" data-question-answer data-cwanswer="'+esc(request.id)+'" aria-label="Answer: '+esc(request.title)+'" rows="3" placeholder="Choose a suggestion or write your answer…" aria-describedby="'+esc(hintId)+' '+esc(errorId)+'" aria-invalid="'+String(Boolean(state.error))+'"'+pending+'>'+esc(state.text)+'</textarea>'+
      '<div class="chat-question-footer"><span id="'+esc(hintId)+'" class="chat-question-hint">Suggestions are editable · Ctrl / ⌘ + Enter to send</span><button type="submit" class="btn dark chat-question-submit"'+pending+'>'+(state.pending?'Sending…':'Send answer')+'</button></div><p id="'+esc(errorId)+'" class="chat-question-error" role="alert">'+esc(state.error)+'</p></form>')+'</section>';
  }
  function chatBindQuestions(root,owner,scope,submit,settled){
    root.querySelectorAll('[data-question-form]').forEach(function(form){
      var id=form.getAttribute('data-question-form'),state=chatQuestionState(owner,scope,id),input=form.querySelector('[data-question-answer]'),card=form.closest('[data-question-card]'),error=form.querySelector('.chat-question-error'),button=form.querySelector('[type=submit]');
      function sync(){state.text=input.value;state.error='';error.textContent='';input.setAttribute('aria-invalid','false');form.querySelectorAll('[data-question-choice]').forEach(function(choice){choice.setAttribute('aria-pressed',String(choice.getAttribute('data-question-choice')===input.value));});}
      input.oninput=sync;
      form.querySelectorAll('[data-question-choice]').forEach(function(choice){choice.onclick=function(){if(state.pending)return;input.value=choice.getAttribute('data-question-choice');sync();input.focus();};});
      input.onkeydown=function(event){if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)&&!event.isComposing){event.preventDefault();form.requestSubmit();}};
      form.onsubmit=async function(event){
        event.preventDefault();if(state.pending)return;var response=input.value.trim();
        if(!response){state.error='Write an answer or choose a suggestion.';error.textContent=state.error;input.setAttribute('aria-invalid','true');input.focus();return;}
        sync();state.pending=true;card.setAttribute('aria-busy','true');form.querySelectorAll('button,textarea').forEach(function(control){control.disabled=true;});button.textContent='Sending…';card.querySelector('.chat-question-state').textContent='Sending…';
        try{await submit(id,response);state.answered=true;state.response=response;state.text='';state.error='';card.querySelector('.chat-question-state').textContent='Answered';var receipt=document.createElement('div');receipt.className='chat-question-answer cw-request-result';var label=document.createElement('strong');label.textContent='Your answer';receipt.appendChild(label);receipt.appendChild(document.createTextNode(response));form.replaceWith(receipt);}
        catch(failure){state.error=failure.message||'Could not send your answer. Try again.';error.textContent=state.error;card.querySelector('.chat-question-state').textContent='Needs your answer';form.querySelectorAll('button,textarea').forEach(function(control){control.disabled=false;});button.textContent='Send answer';}
        finally{state.pending=false;card.setAttribute('aria-busy','false');}
        if(settled)Promise.resolve().then(settled).catch(function(failure){toast(failure.message,true);});
      };
    });
  }
`;
