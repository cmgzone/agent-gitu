export const VOICE_CSS = String.raw`
  .voice-phone { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; padding:6px; border:0; border-radius:9px; background:transparent; color:var(--muted); cursor:pointer; transition:color .15s,background .15s,transform .12s; flex-shrink:0; }
  .voice-phone svg,.voice-bar button svg,.voice-setup svg { width:18px; height:18px; }
  .voice-phone:hover { color:var(--accent); background:var(--hover); }
  .voice-phone:active,.voice-bar button:active { transform:scale(.94); }
  .voice-phone[aria-pressed="true"] { color:var(--accent); }
  .voice-phone:focus-visible,.voice-bar button:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
  .voice-bar { position:fixed; z-index:150; bottom:90px; left:50%; transform:translateX(-50%); width:min(420px,calc(100vw - 32px)); display:flex; align-items:center; gap:12px; padding:10px 14px; border:1px solid var(--border2); border-radius:18px; background:var(--card); backdrop-filter:blur(18px); box-shadow:0 6px 24px #0000000b; color:var(--text); }
  .voice-bar-info { min-width:0; flex:1; }
  .voice-bar-name { font-size:12px; font-weight:600; }
  .voice-bar-state,.voice-caption { font-size:11px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .voice-bar button { width:32px; height:32px; display:grid; place-items:center; border:0; background:transparent; color:var(--muted); border-radius:50%; cursor:pointer; }
  .voice-bar button:hover { background:var(--hover); }
  .voice-bar .voice-end { color:var(--bad,#c84646); }
  .voice-bars { display:flex; gap:3px; align-items:center; height:23px; color:var(--accent); }
  .voice-bars i { width:3px; height:8px; background:currentColor; border-radius:3px; }
  .voice-bar[data-phase="speaking"] .voice-bars i { animation:voice-wave .7s ease-in-out infinite alternate; }
  .voice-bars i:nth-child(2) { animation-delay:-.2s; } .voice-bars i:nth-child(3) { animation-delay:-.4s; }
  @keyframes voice-wave { to { height:22px; } }
  .voice-setup { width:min(440px,calc(100vw - 32px)); max-height:85dvh; overflow:auto; border:1px solid var(--border); border-radius:20px; padding:24px; color:var(--text); background:var(--card); }
  .voice-setup::backdrop { background:#0004; backdrop-filter:blur(4px); }
  .voice-setup h2 { font-size:20px; margin:8px 0; } .voice-setup p { color:var(--muted); font-size:13px; line-height:1.6; }
  .voice-setup label { display:block; margin-top:16px; font-size:12px; }
  .voice-setup input { display:block; width:100%; box-sizing:border-box; margin-top:6px; border:1px solid var(--border); border-radius:9px; padding:10px; color:var(--text); background:var(--bg); font:inherit; font-size:13px; }
  .voice-setup-close { float:right; border:0; background:transparent; color:var(--muted); cursor:pointer; }
  .voice-setup-save { margin-top:20px; border:0; padding:10px 0; background:transparent; color:var(--accent); font:inherit; cursor:pointer; }
  .voice-setup-error { color:var(--bad,#c84646)!important; }
  .live-chat-exchange { margin:12px 0; padding:0 2px; font-size:13px; line-height:1.6; }
  .live-chat-exchange small { display:block; color:var(--muted); font-size:11px; margin-bottom:3px; }
  @media (max-width:720px) { .voice-bar { bottom:86px; gap:8px; padding:9px 12px; } }
  @media (prefers-reduced-motion:reduce) { .voice-bars i { animation:none!important; } .voice-phone,.voice-bar button { transition:none; } }
`;

export const VOICE_JS = String.raw`
  var VOICE_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var VOICE_PHONE=VOICE_SVG+'<path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3 5.2 2 2 0 0 1 5 3h3a2 2 0 0 1 2 1.7l.5 2.8a2 2 0 0 1-.6 1.8l-1.3 1.3a16 16 0 0 0 5.8 5.8l1.3-1.3a2 2 0 0 1 1.8-.6l2.8.5a2 2 0 0 1 1.7 1.9z"/></svg>';
  var VOICE_MIC=VOICE_SVG+'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>';
  var VOICE_END=VOICE_SVG+'<path d="M3 15v-4c5-5 13-5 18 0v4l-5-1v-3a14 14 0 0 0-8 0v3z"/></svg>';
  var voiceState={ generation:0, room:null, callId:null, target:null, starting:false, mic:null, muted:false, sdk:null, readyTimer:null, workerReady:false, replyError:null };
  function voicePhoneButton(id) { return '<button type="button" class="voice-phone" id="'+id+'" aria-label="Call this agent" title="Talk live" aria-pressed="false">'+VOICE_PHONE+'</button>'; }
  function voiceUpdateButtons() { document.querySelectorAll('.voice-phone').forEach(function(button){var target=voiceState.target,cw=S.cw,selected=Boolean(voiceState.callId&&target&&(button.id==='mainVoiceCall'?target.kind==='main'&&(target.runId||'home')===S.active:target.kind==='cowork'&&cw&&target.conversationId===cw.active&&(target.threadId||null)===(cw.threadId||null)));button.setAttribute('aria-pressed',String(selected));}); }
  function voiceShowBar(name,phase) {
    var bar=$('gituVoiceBar');
    if(!bar){bar=document.createElement('div');bar.className='voice-bar';bar.id='gituVoiceBar';bar.setAttribute('aria-label','Live agent call');bar.innerHTML='<span class="voice-bars" aria-hidden="true"><i></i><i></i><i></i></span><div class="voice-bar-info"><div class="voice-bar-name" id="voiceName"></div><div class="voice-bar-state" id="voicePhase" role="status" aria-live="polite"></div><div class="voice-caption" id="voiceCaption"></div></div><button type="button" id="voiceEnableAudio" title="Enable audio" aria-label="Enable audio" hidden>'+VOICE_PHONE+'</button><button type="button" id="voiceMute" title="Mute microphone" aria-label="Mute microphone" aria-pressed="false">'+VOICE_MIC+'</button><button type="button" class="voice-end" id="voiceEnd" title="End call — work continues" aria-label="End call">'+VOICE_END+'</button>';document.body.appendChild(bar);
      $('voiceEnd').onclick=function(){voiceEnd();};
      $('voiceEnableAudio').onclick=function(){if(voiceState.room)voiceState.room.startAudio().then(function(){if($('voiceEnableAudio'))$('voiceEnableAudio').hidden=true;}).catch(function(){toast('Audio is blocked. Allow sound for this page and try again.',true);});};
      $('voiceMute').onclick=async function(){if(!voiceState.mic)return;try{if(voiceState.muted)await voiceState.mic.unmute();else await voiceState.mic.mute();voiceState.muted=!voiceState.muted;this.setAttribute('aria-pressed',String(voiceState.muted));this.setAttribute('aria-label',voiceState.muted?'Unmute microphone':'Mute microphone');this.title=voiceState.muted?'Unmute microphone':'Mute microphone';}catch(e){toast(e.message,true);}};
    }
    $('voiceName').textContent=name;$('voiceMute').hidden=false;voiceSetPhase(phase);
  }
  function voiceSetPhase(phase) {var bar=$('gituVoiceBar');if(!bar)return;bar.dataset.phase=phase;$('voicePhase').textContent=({connecting:'Connecting…',listening:'Listening',thinking:'Thinking…',speaking:'Speaking',reconnecting:'Reconnecting…'})[phase]||phase;$('voicePhase').title=$('voicePhase').textContent;}
  async function voiceEnd() {
    ++voiceState.generation;var room=voiceState.room,id=voiceState.callId,mic=voiceState.mic;
    clearTimeout(voiceState.readyTimer);voiceState.readyTimer=null;voiceState.workerReady=false;
    voiceState.room=null;voiceState.callId=null;voiceState.mic=null;voiceState.target=null;voiceState.starting=false;voiceState.muted=false;voiceState.replyError=null;
    var bar=$('gituVoiceBar');if(bar)bar.remove();voiceUpdateButtons();
    if(mic)mic.stop();if(room)await room.disconnect().catch(function(){});
    if(id)document.querySelectorAll('[data-gitu-voice-audio="'+id+'"]').forEach(function(audio){audio.remove();});
    if(id)await api('/api/voice/calls/'+encodeURIComponent(id),{method:'DELETE'}).catch(function(){});
  }
  function voiceLoadSdk() {
    if(window.LivekitClient)return Promise.resolve(window.LivekitClient);
    if(!voiceState.sdk)voiceState.sdk=new Promise(function(resolve,reject){var script=document.createElement('script');script.src='/vendor/livekit-client.js';script.onload=function(){resolve(window.LivekitClient);};script.onerror=function(){voiceState.sdk=null;reject(new Error('Could not load live audio.'));};document.head.appendChild(script);});return voiceState.sdk;
  }
  function voiceSetup(config,afterSave) {
    var old=$('voiceSetup');if(old){old.showModal();return;}
    var dialog=document.createElement('dialog');dialog.id='voiceSetup';dialog.className='voice-setup';dialog.setAttribute('aria-labelledby','voiceSetupTitle');
    dialog.innerHTML='<button type="button" class="voice-setup-close" aria-label="Close setup">'+VOICE_SVG+'<path d="m6 6 12 12M18 6 6 18"/></svg></button><h2 id="voiceSetupTitle">Connect LiveKit Cloud</h2><p>Talk to your existing Gitu agent while it works. Gitu prepares the voice worker in your LiveKit Cloud project automatically.</p><form><label>Project URL<input name="url" type="url" placeholder="wss://your-project.livekit.cloud" value="'+esc(config.url||'')+'" required></label><label>API key<input name="apiKey" type="password" autocomplete="new-password" maxlength="256" required></label><label>API secret<input name="apiSecret" type="password" autocomplete="new-password" maxlength="4096" minlength="20" required></label><p>Credentials use Gitu’s secure key store and are never added to chat.</p><p class="voice-setup-error" role="alert" hidden></p><button class="voice-setup-save" type="submit">Connect project →</button></form>';
    document.body.appendChild(dialog);dialog.querySelector('.voice-setup-close').onclick=function(){dialog.close();};dialog.addEventListener('close',function(){dialog.remove();});
    dialog.querySelector('form').onsubmit=async function(event){event.preventDefault();var form=this,button=form.querySelector('button[type="submit"]'),error=form.querySelector('[role="alert"]');button.disabled=true;error.hidden=true;try{var data={agentName:config.agentName||'gitu-voice'};new FormData(form).forEach(function(value,key){data[key]=String(value);});await api('/api/voice/config',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(data)});form.reset();dialog.close();if(afterSave)afterSave();}catch(e){error.textContent=e.message;error.hidden=false;}finally{button.disabled=false;}};
    dialog.showModal();
  }
  async function voicePrepareWorker(generation) {
    await api('/api/voice/prepare',{method:'POST'});
    var deadline=Date.now()+16*60*1000;
    while(generation===voiceState.generation){
      var worker=await api('/api/voice/worker');
      if(generation!==voiceState.generation)return false;
      if(worker.phase==='ready')return true;
      if(worker.phase==='failed')throw new Error(worker.message||'Voice setup failed. Try again.');
      if(Date.now()>deadline)throw new Error('LiveKit is still preparing voice. Try the call again shortly.');
      voiceSetPhase(worker.message||'Preparing live voice…');
      await new Promise(function(resolve){setTimeout(resolve,1200);});
    }
    return false;
  }
  async function startGituVoice(target) {
    if(voiceState.starting)return;
    if(voiceState.callId){var same=JSON.stringify(voiceState.target)===JSON.stringify(target);await voiceEnd();if(same)return;}
    var generation=++voiceState.generation;voiceState.starting=true;voiceState.target=target;
    try{
      var config=await api('/api/voice/config');if(generation!==voiceState.generation)return;
      if(!config.configured){voiceState.starting=false;voiceSetup(config,function(){startGituVoice(target);});return;}
      voiceShowBar('Calling your agent','connecting');
      if(!await voicePrepareWorker(generation))return;
      var sdk=await voiceLoadSdk();
      var mic=await sdk.createLocalAudioTrack({echoCancellation:true,noiseSuppression:true,autoGainControl:true});
      if(generation!==voiceState.generation){mic.stop();return;}voiceState.mic=mic;
      var call=await api('/api/voice/calls',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(target)});
      if(generation!==voiceState.generation){mic.stop();await api('/api/voice/calls/'+call.callId,{method:'DELETE'});return;}
      voiceState.callId=call.callId;voiceShowBar(call.name,'connecting');voiceUpdateButtons();
      var room=new sdk.Room({adaptiveStream:true,dynacast:true});voiceState.room=room;
      function workerReady(participant){if(voiceState.room!==room||!participant.isAgent)return;voiceState.workerReady=true;clearTimeout(voiceState.readyTimer);voiceState.readyTimer=null;voiceSetPhase(participant.attributes['lk.agent.state']||'listening');}
      room.registerRpcMethod('gitu.voice.reply',async function(invocation){
        if(voiceState.callId!==call.callId)throw new Error('This call ended.');
        var participant=room.remoteParticipants.get(invocation.callerIdentity);if(!participant||!participant.isAgent)throw new Error('Only the dispatched voice agent can use this bridge.');
        var payload=JSON.parse(invocation.payload);if(payload.callId!==call.callId)throw new Error('Wrong call.');
        voiceSetPhase('thinking');
        var reply;
        try{reply=await api('/api/voice/calls/'+call.callId+'/reply',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:payload.id,text:payload.text})});voiceState.replyError=null;}
        catch(e){var message=e.message;try{message=JSON.parse(message).error||message;}catch(_){}voiceState.replyError=message;voiceSetPhase(message);return JSON.stringify({text:'I’m having trouble getting my reply. Please check the message shown in the call controls and try again.'});}
        // Rendering is best effort. A UI refresh must never reject a successful
        // speech RPC after the backend has already accepted the user's request.
        try{if(reply.runId&&S.active==='home'){Promise.resolve(openRun(reply.runId)).catch(function(){});renderSidebar();}
        if(target.kind==='cowork'&&S.cw&&S.cw.active===target.conversationId)Promise.resolve(cwPoll()).catch(function(){});}catch(_){}
        return JSON.stringify(reply);
      });
      room.registerRpcMethod('gitu.voice.status',async function(invocation){
        var participant=room.remoteParticipants.get(invocation.callerIdentity);
        if(voiceState.callId!==call.callId||!participant||!participant.isAgent)throw new Error('This voice worker is not authorized.');
        var status=JSON.parse(invocation.payload);if(status.callId!==call.callId)throw new Error('Wrong call.');
        var stages={tts:'Speech generation',llm:'Agent reply',stt:'Speech recognition'};
        if(status.error&&stages[status.stage]){var code=/^[A-Za-z0-9_]{1,48}$/.test(status.code||'')?status.code:'unavailable';voiceState.replyError=stages[status.stage]+' failed ('+code+'). Check LiveKit or retry the call.';voiceSetPhase(voiceState.replyError);}
        if(status.stage==='audio'){var bar=$('gituVoiceBar');if(bar)bar.dataset.audioGenerated='true';}
        return '{}';
      });
      room.on(sdk.RoomEvent.TrackSubscribed,function(track){if(track.kind==='audio'){var audio=track.attach();audio.dataset.gituVoiceAudio=call.callId;document.body.appendChild(audio);}});
      room.on(sdk.RoomEvent.TrackUnsubscribed,function(track){track.detach().forEach(function(element){element.remove();});});
      room.on(sdk.RoomEvent.ParticipantConnected,workerReady);
      room.on(sdk.RoomEvent.ParticipantDisconnected,function(participant){if(voiceState.room===room&&participant.isAgent){voiceEnd();toast('The voice worker disconnected. Your task continues.',true);}});
      room.on(sdk.RoomEvent.ParticipantAttributesChanged,function(changed,participant){if(voiceState.room===room&&participant.isAgent&&changed['lk.agent.state']){workerReady(participant);voiceSetPhase(voiceState.replyError||changed['lk.agent.state']);}});
      room.on(sdk.RoomEvent.AudioPlaybackStatusChanged,function(){if($('voiceEnableAudio'))$('voiceEnableAudio').hidden=room.canPlaybackAudio;});
      room.on(sdk.RoomEvent.Reconnecting,function(){voiceSetPhase('reconnecting');});
      room.on(sdk.RoomEvent.Reconnected,function(){voiceSetPhase('listening');});
      room.on(sdk.RoomEvent.Disconnected,function(){if(voiceState.room===room){voiceEnd();toast('Call ended. Your task continues.');}document.querySelectorAll('[data-gitu-voice-audio="'+call.callId+'"]').forEach(function(audio){audio.remove();});});
      room.registerTextStreamHandler('lk.transcription',async function(reader){var caption='';for await(var chunk of reader){caption=(caption+chunk).slice(-4000);if(voiceState.callId===call.callId&&$('voiceCaption'))$('voiceCaption').textContent=caption;}});
      await room.connect(call.url,call.token);
      if(generation!==voiceState.generation){await room.disconnect();return;}
      room.remoteParticipants.forEach(workerReady);
      if(!voiceState.workerReady)voiceState.readyTimer=setTimeout(function(){if(voiceState.room===room&&!voiceState.workerReady){voiceEnd();toast('The voice worker did not join. Deploy gitu-voice in your connected LiveKit project, then try again.',true);}},25000);
      await room.localParticipant.publishTrack(mic);
      await room.startAudio().catch(function(){if($('voiceEnableAudio'))$('voiceEnableAudio').hidden=false;});
    }catch(e){if(generation===voiceState.generation){await voiceEnd();var message=e.name==='NotAllowedError'?'Allow microphone access to start a call.':e.message;voiceShowBar('Live voice',message);$('gituVoiceBar').dataset.phase='failed';$('voiceMute').hidden=true;var retry=document.createElement('button');retry.type='button';retry.id='voiceRetry';retry.title='Retry call';retry.setAttribute('aria-label','Retry call');retry.innerHTML=VOICE_SVG+'<path d="M3 11a9 9 0 1 1 3 7M3 4v7h7"/></svg>';retry.onclick=function(){voiceEnd().then(function(){startGituVoice(target);});};$('gituVoiceBar').appendChild(retry);toast(message,true);}}
    finally{if(generation===voiceState.generation)voiceState.starting=false;}
  }
  function bindGituVoice() {var button=$('mainVoiceCall');if(!button)return;button.onclick=function(){var model=(S.sel.model||'').split('::');startGituVoice({kind:'main',runId:S.active==='home'?undefined:S.active,provider:model[0],model:model[1],projectPath:effectiveProjectPath()||undefined});};voiceUpdateButtons();}
  window.addEventListener('pagehide',function(){if(voiceState.callId)navigator.sendBeacon('/api/voice/calls/'+encodeURIComponent(voiceState.callId)+'/end',new Blob(['{}'],{type:'application/json'}));});
`;
