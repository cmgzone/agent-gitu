/** Shared question presentation and interaction. Each surface owns its state and
 * transport. Stateless helpers are embedded by both standalone UI snippets. */
export const CHAT_QUESTION_CSS = String.raw`
  .chat-question{position:relative;overflow:hidden;min-width:0;border:1px solid var(--border);border-radius:16px;padding:18px 20px 18px 22px;background:var(--card);color:var(--text);text-align:left;box-shadow:0 2px 12px color-mix(in srgb,var(--text) 5%,transparent)}
  .chat-question::before{content:'';position:absolute;inset:0 auto 0 0;width:3px;background:var(--accent)}
  .chat-question.is-approval{border-color:var(--warn-border,var(--border));background:color-mix(in srgb,var(--amber-bg,var(--card)) 50%,var(--card))}
  .chat-question.is-approval::before,.chat-question.is-plan::before{background:var(--evidence,#b45309)}
  .chat-question.is-computer::before{background:var(--run,var(--accent))}
  .chat-question.is-closed{box-shadow:none}.chat-question.is-closed::before{background:var(--border2,var(--border))}
  .chat-question.is-chief-resolved::before{background:color-mix(in srgb,var(--accent) 65%,var(--border))}
  .chat-question *{box-sizing:border-box}
  .chat-question-heading{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px 12px;margin-bottom:12px}
  .chat-question-label{font-size:11px;font-weight:650;letter-spacing:.02em;color:var(--accent);background:color-mix(in srgb,var(--accent) 11%,transparent);padding:3px 9px;border-radius:999px;display:inline-flex;align-items:center;gap:6px}.chat-question-label svg{flex:none}
  .chat-question.is-approval .chat-question-label,.chat-question.is-plan .chat-question-label{color:var(--evidence,#b45309);background:color-mix(in srgb,var(--evidence,#b45309) 12%,transparent)}
  .chat-question.is-computer .chat-question-label{color:var(--run,var(--accent));background:color-mix(in srgb,var(--run,var(--accent)) 12%,transparent)}
  .chat-question-state{font-size:11px;font-weight:550;color:var(--muted);background:var(--card2,var(--card));border:1px solid var(--border);padding:2px 9px;border-radius:999px;white-space:nowrap}
  .chat-question.is-chief-resolved .chat-question-state{color:var(--accent);border-color:color-mix(in srgb,var(--accent) 35%,var(--border));background:color-mix(in srgb,var(--accent) 8%,var(--card))}
  .chat-question h3{font-size:15.5px;line-height:1.42;letter-spacing:-.01em;margin:0;font-weight:650;overflow-wrap:anywhere}
  .chat-question .chat-question-detail{font-size:13.5px;line-height:1.62;color:var(--muted);white-space:pre-wrap;overflow-wrap:anywhere;margin:8px 0 0}
  .card-technical{margin-top:12px;border:1px solid var(--border);border-radius:10px;background:var(--card2,var(--card));overflow:hidden}
  .card-technical>summary{padding:8px 12px;font-size:11.5px;font-weight:550;color:var(--muted);cursor:pointer;user-select:none;list-style:none;display:flex;align-items:center;gap:6px}
  .card-technical>summary::-webkit-details-marker{display:none}
  .card-technical>summary::before{content:'▸';font-size:11px;transition:transform .14s ease;display:inline-block}
  .card-technical[open]>summary::before{transform:rotate(90deg)}
  .card-technical>summary:hover{color:var(--text)}
  .card-technical>pre{margin:0;padding:10px 12px;border-top:1px solid var(--border);font-family:var(--mono);font-size:11.5px;line-height:1.5;color:var(--text);background:transparent;white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto}
  .chat-question-choices{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}
  .chat-question .chat-question-choice{font:inherit;font-size:12.5px;font-weight:500;line-height:1.4;color:var(--text);background:var(--card2,var(--card));border:1px solid var(--border);border-radius:10px;padding:8px 13px;cursor:pointer;text-align:left;white-space:normal;overflow-wrap:anywhere;max-width:100%;min-height:38px;display:inline-flex;align-items:center;gap:7px;transition:border-color .14s ease,background .14s ease,box-shadow .14s ease}
  .chat-question-choice:hover{border-color:color-mix(in srgb,var(--accent) 60%,var(--border));background:color-mix(in srgb,var(--accent) 6%,var(--card))}
  .chat-question-choice[aria-pressed=true]{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 11%,var(--card));box-shadow:0 0 0 1px color-mix(in srgb,var(--accent) 40%,transparent)}
  .chat-question-choice[aria-pressed=true]::before{content:'';width:6px;height:10px;border-right:2px solid var(--accent);border-bottom:2px solid var(--accent);transform:rotate(40deg) translate(-1px,-1px);flex:none}
  .chat-question-choice.is-recommended{border-color:color-mix(in srgb,var(--accent) 55%,var(--border));background:color-mix(in srgb,var(--accent) 7%,var(--card2,var(--card)))}
  .chat-question-rec-badge{display:inline-block;font-size:9.5px;font-weight:650;text-transform:uppercase;letter-spacing:.35px;padding:2px 6px;border-radius:5px;background:color-mix(in srgb,var(--accent) 18%,transparent);color:var(--accent);line-height:1.3;flex:none}
  .chat-question-form{margin-top:14px;padding-top:14px;border-top:1px solid color-mix(in srgb,var(--border) 75%,transparent)}
  .chat-question-form>label{display:block;font-size:12px;font-weight:600;margin:0 0 7px;color:var(--text)}
  .chat-question .chat-question-form textarea{display:block;width:100%;min-width:0;min-height:76px;max-height:320px;resize:vertical;border:1px solid var(--border);border-radius:10px;padding:10px 12px;background:var(--card2,var(--card));color:var(--text);font:inherit;font-size:13px;line-height:1.55;transition:border-color .14s ease}
  .chat-question.has-choices .chat-question-form textarea{min-height:56px}
  .chat-question .chat-question-form textarea:focus{border-color:var(--accent)}
  .chat-question :is(textarea,button,input,select,summary):focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .chat-question textarea[aria-invalid=true]{border-color:var(--err,#c0392b)}
  .chat-question-remember-box{margin-top:10px;padding:8px 10px;border:1px solid color-mix(in srgb,var(--border) 80%,transparent);border-radius:10px;background:color-mix(in srgb,var(--card2,var(--card)) 65%,transparent)}
  .chat-question-form label.chat-question-remember{display:inline-flex;align-items:center;gap:7px;font-size:12px;font-weight:500;color:var(--muted);cursor:pointer;margin:0}
  .chat-question-form label.chat-question-remember input{width:auto;margin:0;accent-color:var(--accent)}
  .chat-question-remember-opts{display:grid;grid-template-columns:minmax(0,1fr) 136px;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid color-mix(in srgb,var(--border) 65%,transparent)}
  .chat-question-remember-opts[hidden]{display:none}
  .chat-question-remember-field{min-width:0;display:flex;flex-direction:column;gap:4px}
  .chat-question-remember-field span{font-size:10.5px;font-weight:600;color:var(--muted);letter-spacing:.02em}
  .chat-question-remember-field input,.chat-question-remember-field select{width:100%;min-width:0;font:inherit;font-size:12px;padding:6px 8px;border:1px solid var(--border);border-radius:7px;background:var(--card);color:var(--text)}
  .chat-question-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:12px}
  .chat-question-hint{font-size:11px;color:var(--muted)}
  .chat-question .chat-question-submit{padding:9px 16px;font-size:12.5px;min-height:38px;white-space:nowrap}.chat-question [disabled]{opacity:.6;cursor:wait}
  .chat-question-error{font-size:12px;color:var(--err,#c0392b);margin:10px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}.chat-question-error:empty{display:none}
  .chat-question-answer{margin-top:14px;border:1px solid var(--border);border-radius:10px;background:var(--card2,var(--card));padding:11px 13px;font-size:13px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}
  .chat-question-answer strong{display:block;font-size:11px;font-weight:650;color:var(--muted);margin-bottom:4px}
  .chat-question.is-chief-resolved .chat-question-answer strong{color:var(--accent)}
  .cw-request-row .cw-bubble:has(>.chat-question),.cw-request-row .cw-bubble:has(>.chat-question):hover{padding:0;background:transparent !important;background-color:transparent !important;border:0;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;transform:none}
  .cw-request-row .cw-bubble:has(>.chat-question)>.cw-meta{min-height:28px;padding:0 34px 6px 2px;margin-bottom:0}
  .cw-request-row .cw-bubble:has(>.chat-question)>.cw-card-remove{top:-3px;right:0;width:28px;height:28px;font-size:18px;display:inline-flex;align-items:center;justify-content:center}
  @media(max-width:600px){.chat-question{padding:14px 15px}.chat-question-remember-opts{grid-template-columns:1fr}.chat-question-footer{align-items:flex-start;flex-direction:column}.chat-question .chat-question-submit{align-self:flex-end}.chat-question-hint{line-height:1.5}}
`;

export const CHAT_QUESTION_JS = String.raw`
  function cardIsTechnicalPayload(text){
    var trimmed=String(text||'').trim();
    if(!trimmed)return false;
    return /^(?:\$\s*)?(?:npm|pnpm|yarn|npx|git|node|python|bash|powershell|curl)\s/i.test(trimmed)||/[\x00-\x08]/.test(trimmed)||/^\s*[\[{]/.test(trimmed)||/\x60{3}|(?:^|\n)\s*(?:const |let |var |import |export |function |Traceback|at \S+\s*\()/.test(trimmed);
  }
  function cardPlainText(value,fallback,limit){
    var text=String(value||'').trim();limit=limit||220;
    if(!text||cardIsTechnicalPayload(text))return fallback||'';
    text=text.replace(/\x60([^\x60]+)\x60/g,'$1').replace(/^#+\s*/gm,'').replace(/\s+/g,' ').trim();
    return text.length>limit?text.slice(0,limit-1).trim()+'…':text;
  }
  function cardQuestionDetail(value){
    var raw=String(value||'').trim();
    if(!raw)return{detail:'',technical:''};
    if(cardIsTechnicalPayload(raw))return{detail:'Open the details to see what the agent is asking about.',technical:raw};
    var clean=raw.replace(/\r\n/g,'\n').replace(/^#+\s*/gm,'').replace(/\n{3,}/g,'\n\n').trim();
    if(clean.length>1200)return{detail:clean.slice(0,1199).trim()+'…',technical:raw};
    return{detail:clean,technical:''};
  }
  function cardTechnicalDetails(raw,id){return raw?'<details class="card-technical" data-card-details="'+esc(id||'details')+'"><summary>Technical details</summary><pre>'+esc(raw)+'</pre></details>':'';}
  function cardHumanizeId(value){
    var text=String(value||'').replace(/^mcp:/i,'').replace(/^capability:/i,'').replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/[:./_-]+/g,' ').replace(/\s+/g,' ').trim();
    return text;
  }
  function cardStripGenericWhy(value){
    var text=String(value||'').trim();
    if(!text)return '';
    if(/^(?:unrecognized command|unknown tool|unknown action)(?:\s*\([^)]*\))?$/i.test(text))return '';
    return text;
  }
  function cardCommandSteps(command){
    var raw=String(command||'').trim();
    if(!raw)return [];
    var segments=raw.split(/(?:&&|\|\||[;|\r\n]+)/),steps=[];
    for(var s=0;s<segments.length;s++){
      var seg=segments[s].trim();if(!seg)continue;
      var tokens=seg.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g)||[],i=0;
      while(i<tokens.length&&/^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i]))i++;
      while(i<tokens.length&&/^(?:env|sudo|doas|npx|pnpx|bunx|cmd|powershell(?:\.exe)?|pwsh(?:\.exe)?)$/i.test(tokens[i])){i++;while(i<tokens.length&&/^[-/][A-Za-z0-9-]+$/.test(tokens[i]))i++;}
      var bin=(tokens[i]||'').replace(/^['"]|['"]$/g,'').split(/[\\/]/).pop().replace(/\.(?:exe|cmd|bat|ps1|sh)$/i,'');
      if(!bin)continue;
      if(/^cd$/i.test(bin)&&segments.length>1)continue;
      var next=(tokens[i+1]||'').replace(/^['"]|['"]$/g,'');
      var sub=next&&next.charAt(0)!=='-'&&/^[A-Za-z][A-Za-z0-9:_-]{0,24}$/.test(next)?next:'';
      var label=sub?bin+' '+sub:bin;
      if(steps.indexOf(label)<0)steps.push(label);
      if(steps.length>=3)break;
    }
    return steps;
  }
  function cardTargetBasename(rawPath){
    var clean=String(rawPath||'').trim().replace(/[\\/]+$/,'');
    if(!clean||clean.indexOf('\n')>=0||clean.charAt(0)==='{')return '';
    var part=clean.split(/[\\/]/).pop()||'';
    return part.length>48?part.slice(0,47)+'…':part;
  }
  function cardDynamicParamHint(data){
    if(!data||typeof data!=='object'||Array.isArray(data))return '';
    var preferred=['label','operation','action','title','subject','repo','repository','channel','to','target','path','file','url','query','name'];
    var keys=preferred.concat(Object.keys(data).filter(function(k){return preferred.indexOf(k)<0;}));
    var parts=[];
    for(var i=0;i<keys.length&&parts.length<2;i++){
      var k=keys[i];
      if(/token|secret|password|passwd|api[_-]?key|auth|cookie|credential|private/i.test(k))continue;
      var v=data[k];
      if(typeof v!=='string'&&typeof v!=='number')continue;
      var s=String(v).replace(/\s+/g,' ').trim();
      if(!s||s.length>90||cardIsTechnicalPayload(s))continue;
      parts.push(cardHumanizeId(k)+': '+s);
    }
    return parts.join(' · ');
  }
  function cardActionPresentation(tool,why,summary){
    var raw=String(summary||'').trim(),data;try{data=JSON.parse(raw);}catch(e){var offset=raw.indexOf('{');if(offset>=0)try{data=JSON.parse(raw.slice(offset));}catch(ignore){}}
    var toolStr=String(tool||'').trim();
    var command=data&&typeof data.command==='string'?data.command.trim():raw;
    var targetPath=data&&typeof (data.path||data.file||data.target)==='string'?String(data.path||data.file||data.target).trim():(!data&&/^(?:[A-Za-z]:[\\/]|\/|~\/|\.\.?[\\/])/.test(raw)?raw:'');
    var combined=toolStr+' '+command;
    var cleanWhy=cardPlainText(cardStripGenericWhy(why),'');
    var preview='';
    if(/run_command|shell|terminal/i.test(toolStr)&&command&&command.charAt(0)!=='{')preview=command.length>180?command.slice(0,179)+'…':command;
    else if(targetPath)preview=targetPath.length>180?targetPath.slice(0,179)+'…':targetPath;
    else if(toolStr&&!/^run_command$/i.test(toolStr)){
      var hint=cardDynamicParamHint(data);
      preview=hint?toolStr+' · '+hint:toolStr;
    }
    var title='Allow the next action?',detail=cleanWhy||'The agent needs your permission to continue.';
    if(/\b(?:rm|rmdir|del|Remove-Item)\b|git\s+(?:reset\s+--hard|clean\s+-\w*f)|delete_file/i.test(combined)){title='Allow files to be removed?';detail=cleanWhy?cleanWhy+' — This action can delete files or discard changes.':'This action can delete files or discard changes. Check the details before deciding.';}
    else if(/git\s+push.*(?:--force|-f\b)/i.test(combined)){title='Allow shared history to be replaced?';detail=cleanWhy?cleanWhy+' — This can overwrite changes in the shared repository.':'This can overwrite changes in the shared repository and affect other people.';}
    else if(/\b(?:publish|deploy)\b|git\s+push/i.test(combined)){title='Publish these changes?';detail=cleanWhy?cleanWhy+' — This will send changes to a shared or live service.':'This will send changes to a shared or live service. Review the destination in the details.';}
    else if(/(?:curl|wget|Invoke-WebRequest).*(?:\||;|&&).*\b(?:sh|bash|powershell|iex)\b/i.test(combined)){title='Download and run software?';detail=cleanWhy?cleanWhy+' — Downloads and runs instructions from another source.':'This downloads and runs instructions from another source. Review the source before allowing it.';}
    else if(/\b(?:npm|pnpm|yarn|pip|pip3|uv)\s+(?:install|add|sync)\b/i.test(combined)){title='Install project software?';detail=cleanWhy?cleanWhy+' — Downloads software and may run installation instructions.':'This downloads software needed by the project and may run installation instructions.';}
    else if(/^(?:(?:npm|pnpm|yarn)\s+(?:run\s+)?test|(?:npx\s+)?(?:pytest|vitest|jest))\b[^;&|]*$/i.test(command)){title='Run the project checks?';detail='Run checks to look for problems in the recent changes.';}
    else if(/^(?:npm|pnpm|yarn)\s+(?:run\s+)?(?:build|typecheck|lint)\b[^;&|]*$/i.test(command)){title='Check the project is ready?';detail='Check that the project can be built or that its files have no reported errors.';}
    else if(/write_file|apply_edit|apply_patch/i.test(toolStr)){
      var writeTarget=cardTargetBasename(targetPath),outsideWrite=/outside the (?:locked )?project/i.test(cleanWhy);
      title=writeTarget?(outsideWrite?'Update '+writeTarget+' outside this project?':'Update '+writeTarget+'?'):'Update the project files?';
      detail=cleanWhy||'This will change files in the project. The exact changes are available below.';
    }
    else if(/read_file|search_files|list_files/i.test(toolStr)){
      var readTarget=cardTargetBasename(targetPath),outsideRead=/outside the (?:locked )?project/i.test(cleanWhy);
      title=readTarget?(outsideRead?'Inspect '+readTarget+' outside this project?':'Inspect '+readTarget+'?'):'Inspect project files?';
      detail=cleanWhy||'Read project files to understand the task and check the work.';
    }
    else if(/run_command|shell|terminal/i.test(toolStr)){
      var steps=cardCommandSteps(command);
      if(steps.length>1){
        title='Run '+steps.slice(0,2).join(' & ')+(steps.length>2?' …':'')+'?';
        detail=cleanWhy||'Run a command chain in the project ('+steps.join(', ')+'). Check the details for exactly what it will do.';
      }else if(steps.length===1){
        title='Run '+steps[0]+'?';
        detail=cleanWhy||'Run a command in the project using '+steps[0]+'. Check the details for the exact arguments.';
      }else{
        title='Run a project action?';
        detail=cleanWhy||'Run a command in the project. Check the details for exactly what it will do.';
      }
    }
    else if(toolStr){
      var parts=toolStr.indexOf(':')>=0?toolStr.replace(/^(?:mcp|capability):/i,'').split(':').map(cardHumanizeId).filter(Boolean):[cardHumanizeId(toolStr)];
      var pretty=parts.length>1?(parts[0].charAt(0).toUpperCase()+parts[0].slice(1)+' · '+parts.slice(1).join(' ')):(parts[0]||'the next action');
      title='Allow '+pretty+'?';
      var paramHint=cardDynamicParamHint(data);
      detail=cleanWhy||paramHint||'The agent requested permission to run '+pretty+'. Check the details before deciding.';
    }
    return {title:title,detail:detail,preview:preview};
  }
  function cardRequestPresentation(request){
    var raw=String(request.detail||''),title=String(request.title||''),approval=/^Approve\s+([\w.:-]+)/i.exec(title),presentation;
    if(request.delegatedGate==='approval'||approval){presentation=cardActionPresentation(approval?approval[1]:'',raw.split(/\n\s*\n/)[0],raw);return{kind:'approval',title:presentation.title,detail:presentation.detail,technical:raw};}
    if(request.delegatedGate==='plan_review'||/^Review .*plan/i.test(title))return{kind:'plan_review',title:'Review the proposed work',detail:'The agent has prepared a plan and is waiting for your decision before making changes. You can approve it or ask for changes.',technical:raw};
    var body=cardQuestionDetail(raw);
    return{kind:'question',title:cardPlainText(title,'Your decision is needed',160),detail:body.detail,technical:body.technical};
  }

  function chatQuestionState(owner,scope,id){
    var scopes=owner.questionCards||(owner.questionCards=Object.create(null)),cards=scopes[scope]||(scopes[scope]=Object.create(null));
    return cards[id]||(cards[id]={selected:'',text:'',pending:false,error:'',answered:false,response:'',remember:false,pattern:'',scope:'global'});
  }
  function chatQuestionHtml(request,owner,scope){
    var presentation=cardRequestPresentation(request),state=chatQuestionState(owner,scope,request.id),closed=request.status!=='open'||state.answered,answer=state.answered?state.response:request.response,
      inputId='question-'+encodeURIComponent(scope)+'-'+encodeURIComponent(request.id),errorId=inputId+'-error',hintId=inputId+'-hint',pending=state.pending?' disabled':'';
    var isComputer=Boolean(request.desktopHandoff||request.permission==='host'||/control over (the )?computer|return (desktop |computer )?control|take (desktop |computer )?control|computer control|desktop handoff/i.test(String(request.title||'')+' '+String(request.detail||'')));
    var isApproval=!isComputer&&presentation.kind==='approval';
    var isPlan=!isComputer&&presentation.kind==='plan_review';
    var isProjectPicker=/^Which project folder should I use\?$/i.test(String(request.title||'').trim());
    var canRemember=!isComputer&&!isApproval&&!isPlan&&!isProjectPicker;
    var hasChoices=(request.options||[]).length>0;
    var isChiefResolved=closed&&request.resolvedBy==='chief';
    var icon=isComputer
      ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>'
      : isApproval
        ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4z"/><path d="M9.5 12.2l1.8 1.8 3.5-3.8"/></svg>'
        : isPlan
          ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>'
          : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01"/></svg>';
    var label=isComputer?'Computer control':isApproval?'Approval':isPlan?'Plan review':'Question';
    var openStateLabel=isComputer?'Needs computer action':isApproval?'Needs approval':isPlan?'Needs plan review':'Needs your answer';
    var closedStateLabel=isChiefResolved?'Handled by Chief':(request.status==='answered'||state.answered)?'Answered':request.status==='approved'?'Approved':request.status==='denied'?'Denied':esc(request.status);
    var stateLabel=closed?closedStateLabel:state.pending?'Sending…':openStateLabel;
    var receiptLabel=isChiefResolved?(request.status==='approved'?esc((request.resolvedByLabel||'Chief of Staff')+' approved'):'Chief of Staff answered'):'Your answer';
    var handoffBtn=(isComputer&&!closed&&request.agentId)?'<div style="margin:12px 0 4px"><button type="button" class="btn dark chat-question-handoff" data-cwhandoff="'+esc(request.agentId)+'">Open computer</button></div>':'';
    var patternVal=state.pattern||String(request.title||'');
    var rememberRow=canRemember
      ? '<div class="chat-question-remember-box">' +
          '<label class="chat-question-remember"><input type="checkbox" class="chat-question-remember-cb"'+(state.remember?' checked':'')+pending+'> Remember this answer for Chief of Staff</label>' +
          '<div class="chat-question-remember-opts"'+(state.remember?'':' hidden')+'>' +
            '<div class="chat-question-remember-field"><span>Match phrase</span><input type="text" class="chat-question-remember-pattern" value="'+esc(patternVal)+'" placeholder="Question text or /regex/"'+pending+'></div>' +
            '<div class="chat-question-remember-field"><span>Scope</span><select class="chat-question-remember-scope"'+pending+'><option value="global"'+(state.scope!=='conversation'?' selected':'')+'>All chats</option><option value="conversation"'+(state.scope==='conversation'?' selected':'')+'>This chat only</option></select></div>' +
          '</div>' +
        '</div>'
      : '';
    var inputLabel=hasChoices?(isApproval?'Add a note (optional)':'Add a note or custom answer (optional)'):'Your answer';
    var inputPlaceholder=hasChoices?(isApproval?'Optional note or reason…':'Add extra details or write a different answer…'):'Write your answer…';
    var hintText=hasChoices?'Pick an option above, or add a note · Ctrl / ⌘ + Enter to send':'Ctrl / ⌘ + Enter to send';
    var classes='chat-question'+(hasChoices?' has-choices':'')+(isComputer?' is-computer':isApproval?' is-approval':isPlan?' is-plan':'')+(closed?' is-closed':'')+(isChiefResolved?' is-chief-resolved':'');
    return '<section class="'+classes+'" data-question-card="'+esc(request.id)+'" data-open-state="'+esc(openStateLabel)+'" aria-label="'+esc(label)+': '+esc(request.title)+'" aria-busy="'+String(state.pending)+'">'+
      '<div class="chat-question-heading"><span class="chat-question-label">'+icon+esc(label)+'</span><span class="chat-question-state">'+stateLabel+'</span></div>'+
      '<h3>'+esc(presentation.title)+'</h3>'+(presentation.detail?'<p class="chat-question-detail">'+esc(presentation.detail)+'</p>':'')+cardTechnicalDetails(presentation.technical,request.id)+handoffBtn+
      (closed?(answer?'<div class="chat-question-answer cw-request-result"><strong>'+receiptLabel+'</strong>'+esc(answer)+'</div>':''):
      '<form class="chat-question-form" data-question-form="'+esc(request.id)+'">'+
      (hasChoices?'<div class="chat-question-choices" role="group" aria-label="Suggested answers">'+request.options.map(function(option){var isRec=Boolean(request.recommended&&request.recommended===option);return '<button type="button" class="chat-question-choice'+(isRec?' is-recommended':'')+'" data-question-choice="'+esc(option)+'" aria-pressed="'+String(state.selected===option)+'"'+pending+'>'+(isRec?'<span class="chat-question-rec-badge">Recommended</span>':'')+esc(option)+'</button>';}).join('')+'</div>':'')+
      '<label for="'+esc(inputId)+'">'+esc(inputLabel)+'</label><textarea id="'+esc(inputId)+'" data-question-answer data-cwanswer="'+esc(request.id)+'" aria-label="Answer: '+esc(request.title)+'" rows="'+(hasChoices?2:3)+'" placeholder="'+esc(inputPlaceholder)+'" aria-describedby="'+esc(hintId)+' '+esc(errorId)+'" aria-invalid="'+String(Boolean(state.error))+'"'+pending+'>'+esc(state.text)+'</textarea>'+
      rememberRow+
      '<div class="chat-question-footer"><span id="'+esc(hintId)+'" class="chat-question-hint">'+esc(hintText)+'</span><button type="submit" class="btn dark chat-question-submit"'+pending+'>'+(state.pending?'Sending…':'Send answer')+'</button></div><p id="'+esc(errorId)+'" class="chat-question-error" role="alert">'+esc(state.error)+'</p></form>')+'</section>';
  }
  function chatBindQuestions(root,owner,scope,submit,settled){
    root.querySelectorAll('[data-cwhandoff]').forEach(function(btn){
      btn.onclick=function(){
        var agentId=btn.getAttribute('data-cwhandoff');
        if(typeof cwOpenDesktop==='function')cwOpenDesktop(agentId);
        else if(typeof window!=='undefined'&&typeof window.cwOpenDesktop==='function')window.cwOpenDesktop(agentId);
      };
    });
    root.querySelectorAll('[data-question-form]').forEach(function(form){
      var id=form.getAttribute('data-question-form'),state=chatQuestionState(owner,scope,id),input=form.querySelector('[data-question-answer]'),rememberCb=form.querySelector('.chat-question-remember-cb'),rememberOpts=form.querySelector('.chat-question-remember-opts'),patternInput=form.querySelector('.chat-question-remember-pattern'),scopeSelect=form.querySelector('.chat-question-remember-scope'),card=form.closest('[data-question-card]'),error=form.querySelector('.chat-question-error'),button=form.querySelector('[type=submit]');
      var openStateLabel=(card&&card.getAttribute('data-open-state'))||'Needs your answer';
      function syncChoices(){
        form.querySelectorAll('[data-question-choice]').forEach(function(choice){choice.setAttribute('aria-pressed',String(choice.getAttribute('data-question-choice')===state.selected));});
      }
      function clearError(){
        state.error='';error.textContent='';input.setAttribute('aria-invalid','false');
      }
      function sync(){
        state.text=input.value;
        if(rememberCb)state.remember=Boolean(rememberCb.checked);
        if(patternInput)state.pattern=patternInput.value;
        if(scopeSelect)state.scope=scopeSelect.value;
        clearError();
        syncChoices();
      }
      input.oninput=sync;
      if(rememberCb)rememberCb.onchange=function(){
        state.remember=Boolean(rememberCb.checked);
        if(rememberOpts)rememberOpts.hidden=!state.remember;
      };
      if(patternInput)patternInput.oninput=function(){state.pattern=patternInput.value;};
      if(scopeSelect)scopeSelect.onchange=function(){state.scope=scopeSelect.value;};
      form.querySelectorAll('[data-question-choice]').forEach(function(choice){
        choice.onclick=function(){
          if(state.pending)return;
          var picked=choice.getAttribute('data-question-choice')||'';
          state.selected=state.selected===picked?'':picked;
          clearError();
          syncChoices();
        };
      });
      input.onkeydown=function(event){if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)&&!event.isComposing){event.preventDefault();form.requestSubmit();}};
      form.onsubmit=async function(event){
        event.preventDefault();if(state.pending)return;
        var selected=String(state.selected||'').trim();
        var extra=input.value.trim();
        var response=selected&&extra?(extra.indexOf(selected)===0?extra:selected+'\n'+extra):(selected||extra);
        if(!response){state.error='Write an answer or choose a suggestion.';error.textContent=state.error;input.setAttribute('aria-invalid','true');input.focus();return;}
        var rememberForChief=Boolean(rememberCb&&rememberCb.checked);
        var chiefPattern=patternInput?patternInput.value.trim():'';
        var chiefScope=scopeSelect?scopeSelect.value:'global';
        sync();state.pending=true;card.setAttribute('aria-busy','true');form.querySelectorAll('button,textarea,input,select').forEach(function(control){control.disabled=true;});button.textContent='Sending…';card.querySelector('.chat-question-state').textContent='Sending…';
        try{
          await submit(id,response,{rememberForChief:rememberForChief,chiefPattern:chiefPattern,chiefScope:chiefScope});
          state.answered=true;state.response=response;state.selected='';state.text='';state.remember=false;state.pattern='';state.scope='global';state.error='';
          card.classList.add('is-closed');
          card.querySelector('.chat-question-state').textContent='Answered';
          var receipt=document.createElement('div');receipt.className='chat-question-answer cw-request-result';var label=document.createElement('strong');label.textContent='Your answer';receipt.appendChild(label);receipt.appendChild(document.createTextNode(response));form.replaceWith(receipt);
        }
        catch(failure){
          state.error=failure.message||'Could not send your answer. Try again.';error.textContent=state.error;
          card.querySelector('.chat-question-state').textContent=openStateLabel;
          form.querySelectorAll('button,textarea,input,select').forEach(function(control){control.disabled=false;});button.textContent='Send answer';
        }
        finally{state.pending=false;card.setAttribute('aria-busy','false');}
        if(settled)Promise.resolve().then(settled).catch(function(failure){toast(failure.message,true);});
      };
    });
  }
`;
