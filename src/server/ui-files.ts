import { FILE_HASH_JS } from './ui-file-hash.js';
export const FILE_UPLOAD_JS = String.raw`${FILE_HASH_JS}
  var filePolicy={maxFileBytes:null,loaded:false};
  function fileLimitLabel(limit){return limit===null?'Unlimited':humanBytes(limit);}
  function showFileLimitNear(input){if(!input)return;var parent=input.closest('.cw-composer-wrap')||input.closest('.composer')||input.parentNode,label=parent.querySelector('[data-file-policy-label]');if(!label){label=document.createElement('small');label.dataset.filePolicyLabel='';label.className='meta';label.style.display='block';label.style.marginTop='6px';parent.appendChild(label);}label.textContent='Maximum file size: '+(filePolicy.loaded?fileLimitLabel(filePolicy.maxFileBytes):'Loading…');}
  async function loadFilePolicy(){var result=await api('/api/files/policy');filePolicy={maxFileBytes:result.maxFileBytes,loaded:true};showFileLimitNear($('attachInput'));showFileLimitNear($('cwFile'));return result;}
  function fileBase(companyId){return companyId?'/api/companies/'+encodeURIComponent(companyId)+'/files':'/api/files';}
  async function uploadBinary(file,scope,companyId,onProgress,signal,onRemote,onPhase){
    var base=fileBase(companyId),resumeKey='gitu.upload.'+JSON.stringify([companyId||'',scope,file.name,file.size,file.lastModified||0]),saved;
    var policy=await api(base+'/policy',{signal:signal});if(policy.maxFileBytes!==null&&file.size>policy.maxFileBytes)throw new Error('File exceeds your selected file-size limit.');
    if(onPhase)onPhase('Checking file');
    var checksum=await fileChecksum(file,signal,onPhase?function(progress){onPhase('Checking file · '+Math.round(progress*100)+'%');}:undefined);
    try{saved=JSON.parse(localStorage.getItem(resumeKey)||'null');}catch(e){}
    var remote;
    if(saved){
      var status=await fetch(base+'/uploads/'+encodeURIComponent(saved.id)+'?scope='+encodeURIComponent(scope),{signal:signal});
      if(status.status===404){localStorage.removeItem(resumeKey);saved=null;}else if(!status.ok)throw new Error('Could not check the saved upload. Retry to resume.');else remote=(await status.json()).file;
      if(remote&&(remote.size!==file.size||(remote.checksum&&remote.checksum!==checksum)))throw new Error('Select the original file to resume this upload, or cancel the saved upload first.');
    }
    if(!remote&&!saved){
      var files=(await api(base+'/uploads?scope='+encodeURIComponent(scope),{signal:signal})).files||[];
      remote=files.find(function(value){return value.state==='uploading'&&value.name===(file.name||'attachment')&&value.size===file.size&&value.checksum===checksum;});
      if(remote)localStorage.setItem(resumeKey,JSON.stringify({id:remote.id}));
    }
    if(signal)signal.throwIfAborted();
    if(!remote){remote=(await api(base+'/uploads',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({scope:scope,name:file.name||'attachment',mime:file.type||'application/octet-stream',size:file.size,checksum:checksum})})).file;localStorage.setItem(resumeKey,JSON.stringify({id:remote.id}));}
    if(onRemote)onRemote(remote,base,resumeKey);
    if(onPhase)onPhase(remote.offset?'Resuming upload':'Uploading');
    while(remote.state!=='ready'&&remote.offset<file.size){
      if(signal&&signal.aborted)throw new Error('Upload cancelled.');
      var end=Math.min(file.size,remote.offset+5*1024*1024),response=await fetch(base+'/uploads/'+remote.id+'?scope='+encodeURIComponent(scope),{method:'PATCH',headers:{'content-type':'application/octet-stream','upload-offset':String(remote.offset)},body:file.slice(remote.offset,end),signal:signal});
      if(!response.ok){var error=await response.json().catch(function(){return {};});throw new Error(error.error||'Upload interrupted. Retry to resume.');}
      remote=(await response.json()).file;if(onRemote)onRemote(remote,base,resumeKey);if(onProgress)onProgress(file.size?remote.offset/file.size:1);
    }
    if(signal)signal.throwIfAborted();if(onPhase)onPhase('Verifying upload');remote=(await api(base+'/uploads/'+remote.id+'/complete?scope='+encodeURIComponent(scope),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({checksum:checksum})})).file;if(onRemote)onRemote(remote,base,resumeKey);
    if(remote.checksum!==checksum)throw new Error('Upload verification failed. The stored file does not match the selected file.');
    localStorage.removeItem(resumeKey);return {artifactId:remote.id,name:remote.name,type:remote.mime,size:remote.size};
  }
  function attachBinary(file,pending,scope,render,companyId){
    var controller=new AbortController(),remote,remoteBase,resumeKey,cancelled=false,entry={name:file.name||'attachment',type:file.type||'',size:file.size,loading:true,progress:0};pending.push(entry);
    var preview=/^image\//.test(file.type||'')?URL.createObjectURL(file):'';if(preview)Object.defineProperty(entry,'previewUrl',{value:preview,enumerable:false});
    var discarding=false;
    function discard(){if(remote&&remote.state!=='ready'&&!discarding){discarding=true;api(remoteBase+'/uploads/'+remote.id+'?scope='+encodeURIComponent(scope),{method:'DELETE'}).then(function(){localStorage.removeItem(resumeKey);}).catch(function(){toast('Upload stopped. Cleanup could not reach the server; select the same file to resume or cancel when connected.',true);}).finally(function(){discarding=false;});}}
    Object.defineProperty(entry,'cancel',{value:function(){cancelled=true;controller.abort();discard();if(preview)URL.revokeObjectURL(preview);},enumerable:false});
    var attempt=function(){if(cancelled)return;entry.loading=true;delete entry.error;render();uploadBinary(file,scope,companyId,function(progress){entry.progress=progress;render();},controller.signal,function(value,base,key){remote=value;remoteBase=base;resumeKey=key;if(cancelled)discard();}).then(function(result){Object.assign(entry,result);entry.loading=false;if(!cancelled)render();}).catch(function(error){entry.loading=false;if(cancelled){discard();return;}entry.error=error.message;toast(error.message,true);render();});};
    Object.defineProperty(entry,'retry',{value:attempt,enumerable:false});attempt();
  }
  function renderFileSettings(container){
    container.innerHTML='<h1>Files & storage</h1><p class="meta">Loading file settings…</p>';
    loadFilePolicy().then(function(policy){
      container.innerHTML='<h1>Files & storage</h1><p>Choose the maximum size of each file. Any file type can be attached. Your storage provider and available disk space still apply.</p><div class="setcard"><label class="setrow"><span class="grow">Maximum file size</span><select id="fileLimitMode"><option value="unlimited">Unlimited</option><option value="custom">Choose a size</option></select></label><label class="setrow" id="fileLimitAmount"><span class="grow">Size in MB</span><input id="fileLimitMb" type="number" min="0.001" step="any" value="'+(policy.maxFileBytes===null?'':policy.maxFileBytes/1048576)+'"></label><button class="btn dark" id="saveFileLimit">Save file limit</button><p id="fileLimitResult" role="status"></p></div>';
      $('fileLimitMode').value=policy.maxFileBytes===null?'unlimited':'custom';var toggle=function(){$('fileLimitAmount').hidden=$('fileLimitMode').value==='unlimited';};$('fileLimitMode').onchange=toggle;toggle();
      $('saveFileLimit').onclick=function(){var limit=$('fileLimitMode').value==='unlimited'?null:Math.floor(Number($('fileLimitMb').value)*1048576);api('/api/files/policy',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({maxFileBytes:limit})}).then(function(result){filePolicy.maxFileBytes=result.maxFileBytes;$('fileLimitResult').textContent='Maximum file size: '+fileLimitLabel(result.maxFileBytes);showFileLimitNear($('attachInput'));showFileLimitNear($('cwFile'));}).catch(function(error){toast(error.message,true);});};
      var runtime=document.createElement('div');runtime.className='setcard';container.appendChild(runtime);api('/api/companies/runtime-settings').then(function(result){runtime.innerHTML='<h2>Shared company runtime</h2><label class="setrow"><span class="grow">Active worker slots</span><input id="runtimeWorkers" type="number" min="1" value="'+result.settings.workers+'"></label><label class="setrow"><span class="grow">Active private computers</span><input id="runtimeComputers" type="number" min="1" value="'+result.settings.computers+'"></label><button class="btn dark" id="saveRuntimeLimits">Save runtime limits</button>';$('saveRuntimeLimits').onclick=function(){api('/api/companies/runtime-settings',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({workers:Number($('runtimeWorkers').value),computers:Number($('runtimeComputers').value)})}).then(function(){toast('Runtime limits saved');}).catch(function(error){toast(error.message,true);});};}).catch(function(error){runtime.textContent=error.message;});
    }).catch(function(error){container.textContent=error.message;});
  }
  loadFilePolicy().catch(function(){});
`;
