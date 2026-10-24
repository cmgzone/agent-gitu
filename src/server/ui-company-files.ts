export const COMPANY_FILES_CSS = String.raw`
  .company-knowledge{margin-top:28px}.company-knowledge label{display:block;margin-bottom:8px;font-size:13px;font-weight:600}.company-knowledge textarea,.company-knowledge select{border:1px solid var(--border2);background:var(--card2);color:var(--text);border-radius:10px;padding:12px;font:inherit;max-width:100%}.company-knowledge textarea{width:100%;min-height:110px;resize:vertical;margin-top:8px}.company-knowledge article{margin:12px 0}.company-knowledge strong{overflow-wrap:anywhere}
  .company-files-toolbar{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:20px 0 8px}.company-file-name{display:block;font-weight:500}.company-file-detail{display:block;margin-top:4px}.company-file-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.company-file-progress{width:100px;max-width:100%;height:4px;accent-color:var(--accent)}
  @media(max-width:600px){.company-file-list li{flex-wrap:wrap}.company-file-list li>span{max-width:100%;overflow-wrap:anywhere}}
`;
export const COMPANY_FILES_JS = String.raw`
  async function companyFiles(body){
    var companyId=Companies.id,base=fileBase(companyId),scope='company',running=new Map(),refreshVersion=0,currentTask=null;
    function active(){return body.isConnected&&Companies.id===companyId;}
    body.innerHTML='<h2>Files & Knowledge</h2><p class="company-muted">Company files and saved knowledge. Upload any file type; open a supported preview or download the original.</p><div class="company-files-toolbar"><button class="btn dark" id="companyFilesChoose">Upload files</button><button class="btn ghost" id="companyFilesCancel" hidden>Cancel current upload</button><input id="companyFilesInput" type="file" multiple hidden aria-label="Upload company files"><span id="companyFilesLimit" class="company-muted"></span></div><p id="companyFileProgress" role="status" class="company-muted"></p><ul id="companyFileList" class="company-file-list"></ul>';
    var input=body.querySelector('#companyFilesInput'),progress=body.querySelector('#companyFileProgress'),list=body.querySelector('#companyFileList');
    async function refresh(){
      var version=++refreshVersion,data=await api(base+'/uploads?scope='+scope);if(!active()||version!==refreshVersion)return;
      list.innerHTML=data.files.map(function(f){
        var url=base+'/uploads/'+encodeURIComponent(f.id)+'/content?scope='+scope;
        var ready=f.state==='ready',detail=ready?humanBytes(f.size):humanBytes(f.offset)+' / '+humanBytes(f.size)+' · '+(running.has(f.id)?'Uploading':'Upload paused');
        return '<li><span><span class="company-file-name">'+esc(f.name)+'</span><small class="company-muted company-file-detail" data-upload-detail="'+esc(f.id)+'">'+detail+'</small></span><span class="company-file-actions">'+(ready?'<a class="btn ghost" href="'+url+'&amp;inline=1" target="_blank" rel="noopener">Open</a><a class="btn ghost" href="'+url+'">Download</a>':'<progress class="company-file-progress" data-upload-progress="'+esc(f.id)+'" max="'+Math.max(f.size,1)+'" value="'+f.offset+'" aria-label="Upload progress for '+esc(f.name)+'"></progress>'+(!running.has(f.id)?'<button class="btn ghost" data-upload-resume="'+esc(f.id)+'">Resume</button>':'')+'<button class="btn ghost" data-upload-cancel="'+esc(f.id)+'">Cancel</button>')+'</span></li>';
      }).join('')||'<li class="company-muted">No company files yet.</li>';
      list.querySelectorAll('[data-upload-resume]').forEach(function(button){button.onclick=function(){var file=data.files.find(function(f){return f.id===button.dataset.uploadResume;});progress.textContent='Select '+file.name+' to resume its saved upload.';input.click();};});
      list.querySelectorAll('[data-upload-cancel]').forEach(function(button){button.onclick=async function(){
        var id=button.dataset.uploadCancel,task=running.get(id);button.disabled=true;button.textContent='Cancelling…';if(task)task.controller.abort();
        try{await api(base+'/uploads/'+encodeURIComponent(id)+'?scope='+scope,{method:'DELETE'});if(task&&task.resumeKey)localStorage.removeItem(task.resumeKey);if(active()){progress.textContent='Upload cancelled';await refresh();}}
        catch(error){if(active()){button.disabled=false;button.textContent='Retry cancellation';companyError(error);}}
      };});
    }
    var choose=body.querySelector('#companyFilesChoose');choose.onclick=function(){input.click();};
    var cancel=body.querySelector('#companyFilesCancel');
    async function cancelTask(task){
      task.controller.abort();if(!task.id)return;
      await api(base+'/uploads/'+encodeURIComponent(task.id)+'?scope='+scope,{method:'DELETE'});if(task.resumeKey)localStorage.removeItem(task.resumeKey);
    }
    cancel.onclick=async function(){if(!currentTask)return;cancel.disabled=true;try{await cancelTask(currentTask);}catch(error){if(active())companyError(error);}finally{if(active())cancel.disabled=false;}};
    input.onchange=async function(){
      var files=Array.from(input.files),failures=0,cancelled=0;input.disabled=true;choose.disabled=true;cancel.hidden=false;
      for(var file of files){
        var task={controller:new AbortController(),resumeKey:null,id:null};currentTask=task;
        try{await uploadBinary(file,scope,companyId,function(value){if(active())progress.textContent=file.name+' · '+Math.round(value*100)+'%';},task.controller.signal,function(remote,_base,key){
          task.id=remote.id;task.resumeKey=key;var first=!running.has(remote.id);running.set(remote.id,task);
          if(task.controller.signal.aborted&&remote.state!=='ready')cancelTask(task).catch(function(error){if(active())companyError(error);});
          if(active()){if(first)refresh().catch(companyError);var meter=list.querySelector('[data-upload-progress="'+remote.id+'"]'),detail=list.querySelector('[data-upload-detail="'+remote.id+'"]');if(meter)meter.value=remote.offset;if(detail)detail.textContent=humanBytes(remote.offset)+' / '+humanBytes(remote.size)+' · '+(remote.state==='ready'?'Complete':'Uploading');}
        },function(phase){if(active())progress.textContent=file.name+' · '+phase;});}
        catch(error){if(task.controller.signal.aborted)cancelled++;else{failures++;if(active())companyError(error);}}
        finally{if(task.id)running.delete(task.id);if(active())await refresh().catch(companyError);}
      }
      if(!active())return;
      currentTask=null;cancel.hidden=true;input.disabled=false;choose.disabled=false;input.value='';progress.textContent=failures?'Upload paused. Use Resume to continue with the same file.':cancelled?'Selected uploads finished; cancelled files were stopped.':'Uploads complete';
      refresh().catch(companyError);
    };
    try{await refresh();var policy=await api(base+'/policy');if(active())body.querySelector('#companyFilesLimit').textContent='Maximum file size: '+fileLimitLabel(policy.maxFileBytes);}catch(error){if(active())companyError(error);}
  }
  async function companyKnowledge(body){
    var companyId=Companies.id,section=document.createElement('section');section.className='company-knowledge';body.appendChild(section);
    function active(){return section.isConnected&&Companies.id===companyId;}
    function url(suffix){return '/api/companies/'+encodeURIComponent(companyId)+suffix;}
    function request(suffix,value,method){return api(url(suffix),{method:method||'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value||{})});}
    section.innerHTML='<h2>Shared company memory</h2><p class="company-muted">Company knowledge is available to every Cowork teammate, including outside this workspace.</p><form data-company-memory-form><label for="companySharedMemory">Company note</label><textarea id="companySharedMemory" required placeholder="What should your Cowork team remember about this company?"></textarea><button class="btn dark" type="submit">Share with Cowork</button><p class="company-error" role="alert"></p></form><div data-company-shared-memories></div><h2>Teammate memories</h2><p class="company-muted">These are the same personal memories used by this teammate throughout Cowork.</p><label for="companyKnowledgeAgent">Teammate</label><select id="companyKnowledgeAgent">'+Companies.data.agents.map(function(a){return '<option value="'+esc(a.id)+'">'+esc(a.name)+'</option>';}).join('')+'</select><div id="companyKnowledgeEntries"></div><div id="companyReferences"></div>';
    var memoryForm=section.querySelector('[data-company-memory-form]'),memoryInput=memoryForm.querySelector('textarea');Companies.knowledgeDrafts=Companies.knowledgeDrafts||{};memoryInput.value=Companies.knowledgeDrafts[companyId]||'';memoryInput.oninput=function(){Companies.knowledgeDrafts[companyId]=memoryInput.value;};
    async function loadShared(){var data=await api(url('/memory'));if(!active())return;section.querySelector('[data-company-shared-memories]').innerHTML=(data.memories||[]).map(function(entry){return '<article class="company-card"><p class="company-plain-message">'+esc(entry.claim)+'</p><small class="company-muted">Shared Cowork memory · '+esc(entry.status||'candidate')+'</small></article>';}).join('')||'<p class="company-muted">No shared company notes yet.</p>';}
    memoryForm.onsubmit=async function(event){event.preventDefault();var button=memoryForm.querySelector('button');if(button.disabled||!memoryInput.value.trim())return;button.disabled=true;memoryForm.querySelector('[role=alert]').textContent='';try{await request('/memory',{text:memoryInput.value.trim()});Companies.knowledgeDrafts[companyId]='';if(active()){memoryInput.value='';await loadShared();}}catch(error){if(active())memoryForm.querySelector('[role=alert]').textContent=error.message;}finally{button.disabled=false;}};
    loadShared().catch(function(error){if(active())memoryForm.querySelector('[role=alert]').textContent=error.message;});
    var select=section.querySelector('#companyKnowledgeAgent'),entries=section.querySelector('#companyKnowledgeEntries'),references=section.querySelector('#companyReferences');
    async function load(){
      var agent=select.value;if(!agent){entries.innerHTML='<p class="company-muted">Create a teammate to save company knowledge.</p>';return;}
      var prefix='/cowork/agents/'+encodeURIComponent(agent)+'/memory',data=await api(url(prefix));
      if(!active()||select.value!==agent)return;
      entries.innerHTML=(data.entries||[]).map(function(e){return '<article class="company-card"><label>Memory text<textarea aria-label="Memory text" data-memory="'+esc(e.id)+'">'+esc(e.claim)+'</textarea></label><p class="company-muted">'+esc(e.kind||'Saved memory')+(e.updatedAt?' · Updated '+esc(shortDate(e.updatedAt)):'')+'</p><div class="company-controls"><button class="btn ghost" data-memory-save="'+esc(e.id)+'">Save correction</button><button class="btn ghost" data-memory-archive="'+esc(e.id)+'">Archive memory</button></div></article>';}).join('')||'<p class="company-muted">No saved knowledge yet.</p>';
      function bind(attribute,method){entries.querySelectorAll('['+attribute+']').forEach(function(button){button.onclick=async function(){
        var entry=data.entries.find(function(e){return e.id===button.getAttribute(attribute);}),card=button.closest('article');
        if(method==='DELETE'&&!window.confirm('Archive this memory? It will no longer guide this teammate.'))return;
        var value=method==='PATCH'?{claim:card.querySelector('textarea').value,expectedUpdatedAt:entry.updatedAt}:{};
        if(method==='PATCH'&&!value.claim.trim()){companyError(new Error('Enter the corrected memory text.'));return;}
        var buttons=card.querySelectorAll('button');buttons.forEach(function(b){b.disabled=true;});
        try{await request(prefix+'/'+encodeURIComponent(entry.id),value,method);if(active()&&select.value===agent){toast(method==='PATCH'?'Memory corrected':'Memory archived');await load();}}
        catch(error){if(active()){buttons.forEach(function(b){b.disabled=false;});companyError(error);}}
      };});}
      bind('data-memory-save','PATCH');bind('data-memory-archive','DELETE');
    }
    select.onchange=function(){load().catch(function(error){if(active())companyError(error);});};
    load().catch(function(error){if(active())companyError(error);});
    async function loadReferences(){
      var storage=await api(url('/storage'));if(!active())return;
      references.innerHTML='<h2>External file references</h2><p class="company-muted">These files stay at their provider until you import them. Removing a reference keeps the provider file.</p>'+((storage.references||[]).map(function(r){
        var status=r.connected?(r.grantChanged?'Account or folder changed · Reattach this file':r.readable?'Read access granted':'Reading is not granted'):'Connection disconnected';
        return '<article class="company-card"><strong>'+esc(r.item.name)+'</strong><p class="company-muted">'+esc(r.connectionName||r.connectionId)+' · '+esc(status)+'</p><div class="company-controls">'+(r.readable?'<button class="btn ghost" data-reference-import="'+esc(r.id)+'">Import a copy</button>':'')+'<button class="btn ghost" data-reference-remove="'+esc(r.id)+'">Remove reference</button></div></article>';
      }).join('')||'<p class="company-muted">Attach references from Connections → Browse.</p>');
      references.querySelectorAll('[data-reference-import],[data-reference-remove]').forEach(function(button){button.onclick=async function(){
        var importing=Boolean(button.dataset.referenceImport),id=button.dataset.referenceImport||button.dataset.referenceRemove;
        if(!importing&&!window.confirm('Remove this reference? The provider file will be kept.'))return;
        button.disabled=true;
        try{await request('/storage/references/'+encodeURIComponent(id)+(importing?'/import':''),{},importing?'POST':'DELETE');if(active()){toast(importing?'Imported into company files':'Reference removed');if(importing)companyRender();else await loadReferences();}}
        catch(error){if(active()){button.disabled=false;companyError(error);}}
      };});
    }
    loadReferences().catch(function(error){if(active())companyError(error);});
  }
`;
