export const VOICE_CSS = String.raw`
  .voice-phone { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; padding:6px; border:0; border-radius:9px; background:transparent; color:var(--muted); cursor:pointer; transition:color .15s,background .15s,transform .12s; flex-shrink:0; }
  .voice-phone svg,.voice-bar button svg,.voice-setup svg,.voice-stage button svg { width:18px; height:18px; }
  .voice-phone:hover { color:var(--accent); background:var(--hover); }
  .voice-phone:active,.voice-bar button:active,.voice-stage button:active { transform:scale(.94); }
  .voice-phone[aria-pressed="true"] { color:var(--accent); }
  .voice-phone:focus-visible,.voice-bar button:focus-visible,.voice-stage button:focus-visible { outline:2px solid var(--accent); outline-offset:3px; }
  .voice-bar { position:fixed; z-index:150; bottom:90px; left:50%; transform:translateX(-50%); width:min(440px,calc(100vw - 32px)); display:flex; align-items:center; gap:10px; padding:10px 14px; border:1px solid var(--border2); border-radius:18px; background:var(--card); backdrop-filter:blur(18px); box-shadow:0 6px 24px #0000000b; color:var(--text); }
  .voice-bar[hidden],.voice-stage[hidden] { display:none!important; }
  .voice-bar-info { min-width:0; flex:1; }
  .voice-bar-name { font-size:12px; font-weight:600; }
  .voice-bar-state,.voice-caption { font-size:11px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .voice-bar button { width:32px; height:32px; display:grid; place-items:center; border:0; background:transparent; color:var(--muted); border-radius:50%; cursor:pointer; }
  .voice-bar button:hover { background:var(--hover); }
  .voice-bar .voice-end,.voice-stage .voice-stage-end { color:var(--bad,#c84646); }
  .voice-bars { display:flex; gap:3px; align-items:center; height:23px; color:var(--accent); }
  .voice-bars i { width:3px; height:8px; background:currentColor; border-radius:3px; transition:height .12s ease; }
  .voice-bar[data-phase="speaking"] .voice-bars i { animation:voice-wave .7s ease-in-out infinite alternate; }
  .voice-bars i:nth-child(2) { animation-delay:-.2s; } .voice-bars i:nth-child(3) { animation-delay:-.4s; }
  @keyframes voice-wave { to { height:22px; } }
  .voice-stage {
    position:fixed; inset:0; z-index:160; display:flex; align-items:center; justify-content:center; padding:24px;
    background:radial-gradient(circle at 50% 35%, color-mix(in srgb,var(--accent) 18%,transparent), transparent 62%), color-mix(in srgb,var(--bg) 82%,transparent);
    backdrop-filter:blur(22px); color:var(--text);
  }
  .voice-stage-card {
    position:relative; width:min(460px,100%); border:1px solid var(--border2); border-radius:28px;
    background:color-mix(in srgb,var(--card) 90%,transparent); box-shadow:0 24px 64px -24px rgba(0,0,0,.45);
    padding:24px 24px 22px; display:flex; flex-direction:column; align-items:center; text-align:center; gap:16px;
  }
  .voice-stage-top { width:100%; display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .voice-stage-title { font-size:15px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .voice-stage-pill {
    display:inline-flex; align-items:center; gap:6px; padding:4px 11px; border-radius:999px;
    font-size:11.5px; font-weight:600; background:var(--card2); border:1px solid var(--border); color:var(--muted);
  }
  .voice-stage-pill::before { content:''; width:7px; height:7px; border-radius:50%; background:var(--muted); }
  .voice-stage[data-phase="listening"] .voice-stage-pill { color:#0f766e; background:rgba(20,184,166,.12); border-color:rgba(20,184,166,.35); }
  .voice-stage[data-phase="listening"] .voice-stage-pill::before { background:#14b8a6; }
  .voice-stage[data-phase="thinking"] .voice-stage-pill { color:var(--accent); background:var(--accent-soft); border-color:var(--border-strong); }
  .voice-stage[data-phase="thinking"] .voice-stage-pill::before { background:var(--accent); animation:voice-stage-pulse 1s ease-in-out infinite; }
  .voice-stage[data-phase="speaking"] .voice-stage-pill { color:var(--accent); background:var(--accent-soft); border-color:var(--accent); }
  .voice-stage[data-phase="speaking"] .voice-stage-pill::before { background:var(--accent); animation:voice-stage-pulse .65s ease-in-out infinite; }
  .voice-stage-orb-wrap {
    position:relative; width:168px; height:168px; display:grid; place-items:center; margin:6px 0 2px;
    --voice-amp:0;
  }
  .voice-stage-ring {
    position:absolute; inset:0; border-radius:50%; pointer-events:none;
    background:radial-gradient(circle, color-mix(in srgb,var(--accent) 28%,transparent) 0%, transparent 70%);
    transform:scale(calc(0.92 + var(--voice-amp) * 0.42));
    opacity:calc(0.38 + var(--voice-amp) * 0.62);
    transition:transform .08s ease-out, opacity .12s ease;
  }
  .voice-stage-ring.outer {
    inset:-14px; border:1.5px solid color-mix(in srgb,var(--accent) 32%,transparent);
    background:transparent; transform:scale(calc(0.94 + var(--voice-amp) * 0.56));
  }
  .voice-stage[data-phase="thinking"] .voice-stage-ring.outer {
    border-style:dashed; border-color:var(--accent); animation:voice-spin 4s linear infinite;
  }
  .voice-stage[data-phase="speaking"] .voice-stage-avatar { animation:voice-talk-bob .55s ease-in-out infinite alternate; }
  .voice-stage-avatar {
    position:relative; width:116px; height:116px; border-radius:36px; display:grid; place-items:center;
    background:var(--card2); border:1px solid var(--border2); overflow:hidden;
    box-shadow:0 12px 30px -14px rgba(0,0,0,.35);
    transform:scale(calc(1 + var(--voice-amp) * 0.08)); transition:transform .08s ease-out;
  }
  .voice-stage-plush { width:98px; height:98px; }
  .voice-stage-wave {
    display:flex; align-items:center; justify-content:center; gap:5px; height:36px; width:100%; max-width:280px;
  }
  .voice-stage-wave i {
    display:block; width:4px; height:8px; border-radius:999px; background:var(--accent); opacity:.42;
    transition:height .09s ease-out, opacity .15s ease;
  }
  .voice-stage[data-phase="speaking"] .voice-stage-wave i,
  .voice-stage[data-phase="listening"] .voice-stage-wave i { opacity:.92; }
  .voice-stage[data-phase="speaking"] .voice-stage-wave i { animation:voice-stage-bar .72s ease-in-out infinite alternate; }
  .voice-stage[data-phase="listening"] .voice-stage-wave i { height:12px; opacity:.62; }
  .voice-stage[data-phase="thinking"] .voice-stage-wave i { height:6px; opacity:.35; }
  .voice-stage-caption {
    width:100%; min-height:44px; max-height:110px; overflow-y:auto; padding:10px 14px; border-radius:14px;
    background:var(--bg); border:1px solid var(--border); font-size:13px; line-height:1.5; color:var(--text);
  }
  .voice-stage-actions { display:flex; align-items:center; justify-content:center; gap:12px; padding-top:4px; }
  .voice-stage-btn {
    width:46px; height:46px; border-radius:50%; border:1px solid var(--border2); background:var(--card2);
    color:var(--text); display:grid; place-items:center; cursor:pointer; transition:background .15s,transform .12s;
  }
  .voice-stage-btn:hover { background:var(--hover); }
  .voice-stage-btn[aria-pressed="true"] { background:var(--accent-soft); color:var(--accent); border-color:var(--border-strong); }
  .voice-stage-end { background:rgba(200,70,70,.12); border-color:rgba(200,70,70,.35); }
  @keyframes voice-spin { to { transform:rotate(360deg) scale(1); } }
  @keyframes voice-stage-pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.45; transform:scale(.82); } }
  @keyframes voice-talk-bob { 0% { transform:translateY(0) scale(1); } 100% { transform:translateY(-3px) scale(1.03); } }
  @keyframes voice-stage-bar { 0% { height:8px; } 100% { height:30px; } }
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
  @media (max-width:720px) { .voice-bar { bottom:86px; gap:8px; padding:9px 12px; } .voice-stage-card { padding:20px 16px; border-radius:22px; } }
  @media (prefers-reduced-motion:reduce) { .voice-bars i,.voice-stage * { animation:none!important; transition:none!important; } .voice-phone,.voice-bar button { transition:none; } }
`;

export const VOICE_JS = String.raw`
  var VOICE_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var VOICE_PHONE=VOICE_SVG+'<path d="M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 3 5.2 2 2 0 0 1 5 3h3a2 2 0 0 1 2 1.7l.5 2.8a2 2 0 0 1-.6 1.8l-1.3 1.3a16 16 0 0 0 5.8 5.8l1.3-1.3a2 2 0 0 1 1.8-.6l2.8.5a2 2 0 0 1 1.7 1.9z"/></svg>';
  var VOICE_MIC=VOICE_SVG+'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>';
  var VOICE_END=VOICE_SVG+'<path d="M3 15v-4c5-5 13-5 18 0v4l-5-1v-3a14 14 0 0 0-8 0v3z"/></svg>';
  var VOICE_EXPAND=VOICE_SVG+'<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
  var VOICE_MINIMIZE=VOICE_SVG+'<path d="M6 9l6 6 6-6"/></svg>';
  var voiceState={ generation:0, room:null, callId:null, target:null, starting:false, mic:null, muted:false, sdk:null, readyTimer:null, workerReady:false, replyError:null, phase:'idle', stageMinimized:false, caption:'', audioCtx:null, meterRaf:0, micAnalyser:null, agentAnalyser:null };
  function voicePhoneButton(id) { return '<button type="button" class="voice-phone" id="'+id+'" aria-label="Call this agent" title="Talk live" aria-pressed="false">'+VOICE_PHONE+'</button>'; }
  function voiceUpdateButtons() { document.querySelectorAll('.voice-phone').forEach(function(button){var target=voiceState.target,cw=S.cw,selected=Boolean(voiceState.callId&&target&&(button.id==='mainVoiceCall'?target.kind==='main'&&(target.runId||'home')===S.active:target.kind==='cowork'&&cw&&target.conversationId===cw.active&&(target.threadId||null)===(cw.threadId||null)));button.setAttribute('aria-pressed',String(selected));}); }
  function voiceAvatarMarkup(target) {
    if(target&&target.kind==='cowork'&&target.agentId&&typeof cwAgentById==='function'&&typeof cwAvaImg==='function'){
      var a=cwAgentById(target.agentId);
      if(a)return cwAvaImg(a.avatar,a.id);
    }
    if(typeof plushCharacterHtml==='function')return plushCharacterHtml('blue','gitu-voice','','voice-stage-plush');
    return VOICE_PHONE;
  }
  function voiceSyncStageVisibility() {
    var stage=$('gituVoiceStage'),bar=$('gituVoiceBar');
    var failed=bar&&bar.dataset&&bar.dataset.phase==='failed';
    if(stage)stage.hidden=Boolean(voiceState.stageMinimized||failed);
    if(bar&&stage)bar.hidden=Boolean(!voiceState.stageMinimized&&!failed);
    else if(bar)bar.hidden=false;
  }
  function voiceStopMeters() {
    if(voiceState.meterRaf&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(voiceState.meterRaf);
    voiceState.meterRaf=0;voiceState.micAnalyser=null;voiceState.agentAnalyser=null;
    if(voiceState.audioCtx){try{voiceState.audioCtx.close();}catch(_){}voiceState.audioCtx=null;}
  }
  function voiceAttachAnalyser(track,kind) {
    if(!track||!track.mediaStreamTrack||typeof MediaStream!=='function')return;
    var AudioCtor=typeof window!=='undefined'&&(window.AudioContext||window.webkitAudioContext);
    if(typeof AudioCtor!=='function')return;
    try{
      if(!voiceState.audioCtx)voiceState.audioCtx=new AudioCtor();
      if(voiceState.audioCtx.state==='suspended'&&typeof voiceState.audioCtx.resume==='function')voiceState.audioCtx.resume().catch(function(){});
      var src=voiceState.audioCtx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
      var an=voiceState.audioCtx.createAnalyser();an.fftSize=64;an.smoothingTimeConstant=0.72;src.connect(an);
      if(kind==='agent')voiceState.agentAnalyser=an;else voiceState.micAnalyser=an;
      voiceStartMeterLoop();
    }catch(_){}
  }
  function voiceStartMeterLoop() {
    if(voiceState.meterRaf||typeof requestAnimationFrame!=='function')return;
    var data=typeof Uint8Array==='function'?new Uint8Array(32):null;
    function tick() {
      if(!voiceState.callId&&!voiceState.starting){voiceState.meterRaf=0;return;}
      var wrap=$('voiceStageOrbWrap'),wave=$('voiceStageWave');
      var an=voiceState.phase==='speaking'?(voiceState.agentAnalyser||voiceState.micAnalyser):(voiceState.micAnalyser||voiceState.agentAnalyser);
      var level=0;
      if(an&&data){
        an.getByteFrequencyData(data);
        var sum=0;for(var i=0;i<16;i++)sum+=data[i]||0;
        level=Math.min(1,(sum/(16*140)));
      }else if(voiceState.phase==='speaking'){
        level=0.35+0.35*Math.abs(Math.sin(Date.now()/180));
      }
      if(wrap&&wrap.style&&typeof wrap.style.setProperty==='function')wrap.style.setProperty('--voice-amp',level.toFixed(3));
      if(wave&&wave.children&&wave.children.length&&an&&data){
        for(var b=0;b<wave.children.length;b++){
          var v=(data[b%16]||0)/255;
          var h=Math.max(6,Math.round(6+v*28));
          wave.children[b].style.height=h+'px';
        }
      }
      voiceState.meterRaf=requestAnimationFrame(tick);
    }
    voiceState.meterRaf=requestAnimationFrame(tick);
  }
  function voiceSetCaption(text) {
    voiceState.caption=String(text||'');
    if($('voiceCaption'))$('voiceCaption').textContent=voiceState.caption;
    if($('voiceStageCaption'))$('voiceStageCaption').textContent=voiceState.caption||(voiceState.phase==='thinking'?'Thinking…':voiceState.phase==='speaking'?'Speaking…':'Speak naturally—I’m listening.');
  }
  function voiceSyncMuteUi() {
    var label=voiceState.muted?'Unmute microphone':'Mute microphone';
    [$('voiceMute'),$('voiceStageMute')].forEach(function(btn){
      if(!btn)return;
      if(typeof btn.setAttribute==='function'){btn.setAttribute('aria-pressed',String(voiceState.muted));btn.setAttribute('aria-label',label);}
      btn.title=label;
    });
  }
  function voiceShowBar(name,phase) {
    var bar=$('gituVoiceBar');
    if(!bar){
      bar=document.createElement('div');bar.className='voice-bar';bar.id='gituVoiceBar';bar.setAttribute('aria-label','Live agent call');
      bar.innerHTML='<span class="voice-bars" aria-hidden="true"><i></i><i></i><i></i></span><div class="voice-bar-info"><div class="voice-bar-name" id="voiceName"></div><div class="voice-bar-state" id="voicePhase" role="status" aria-live="polite"></div><div class="voice-caption" id="voiceCaption"></div></div><button type="button" id="voiceOpenStage" title="Open voice visualizer" aria-label="Open voice visualizer">'+VOICE_EXPAND+'</button><button type="button" id="voiceEnableAudio" title="Enable audio" aria-label="Enable audio" hidden>'+VOICE_PHONE+'</button><button type="button" id="voiceMute" title="Mute microphone" aria-label="Mute microphone" aria-pressed="false">'+VOICE_MIC+'</button><button type="button" class="voice-end" id="voiceEnd" title="End call — work continues" aria-label="End call">'+VOICE_END+'</button>';
      document.body.appendChild(bar);
      var endCall=function(){voiceEnd();};
      var enableAudio=function(){if(voiceState.room)voiceState.room.startAudio().then(function(){if($('voiceEnableAudio'))$('voiceEnableAudio').hidden=true;if($('voiceStageAudio'))$('voiceStageAudio').hidden=true;}).catch(function(){toast('Audio is blocked. Allow sound for this page and try again.',true);});};
      var toggleMute=async function(){if(!voiceState.mic)return;try{if(voiceState.muted)await voiceState.mic.unmute();else await voiceState.mic.mute();voiceState.muted=!voiceState.muted;voiceSyncMuteUi();}catch(e){toast(e.message,true);}};
      if($('voiceEnd'))$('voiceEnd').onclick=endCall;
      if($('voiceEnableAudio'))$('voiceEnableAudio').onclick=enableAudio;
      if($('voiceMute'))$('voiceMute').onclick=toggleMute;
      if($('voiceOpenStage'))$('voiceOpenStage').onclick=function(){voiceState.stageMinimized=false;voiceSyncStageVisibility();};
    }
    var stage=$('gituVoiceStage');
    if(!stage){
      stage=document.createElement('section');stage.className='voice-stage';stage.id='gituVoiceStage';stage.setAttribute('role','dialog');stage.setAttribute('aria-label','Live voice visualizer');
      var waveBars='';for(var wi=0;wi<14;wi++)waveBars+='<i></i>';
      stage.innerHTML='<div class="voice-stage-card"><div class="voice-stage-top"><span class="voice-stage-title" id="voiceStageName"></span><span class="voice-stage-pill" id="voiceStagePhase"></span><button type="button" id="voiceStageMin" class="voice-stage-btn" title="Minimize to bar" aria-label="Minimize visualizer">'+VOICE_MINIMIZE+'</button></div><div class="voice-stage-orb-wrap" id="voiceStageOrbWrap"><div class="voice-stage-ring outer" aria-hidden="true"></div><div class="voice-stage-ring" aria-hidden="true"></div><div class="voice-stage-avatar" id="voiceStageAvatar"></div></div><div class="voice-stage-wave" id="voiceStageWave" aria-hidden="true">'+waveBars+'</div><div class="voice-stage-caption" id="voiceStageCaption" aria-live="polite"></div><div class="voice-stage-actions"><button type="button" id="voiceStageAudio" class="voice-stage-btn" title="Enable audio" aria-label="Enable audio" hidden>'+VOICE_PHONE+'</button><button type="button" id="voiceStageMute" class="voice-stage-btn" title="Mute microphone" aria-label="Mute microphone" aria-pressed="false">'+VOICE_MIC+'</button><button type="button" id="voiceStageEnd" class="voice-stage-btn voice-stage-end" title="End call — work continues" aria-label="End call">'+VOICE_END+'</button></div></div>';
      document.body.appendChild(stage);
      if($('voiceStageMin'))$('voiceStageMin').onclick=function(){voiceState.stageMinimized=true;voiceSyncStageVisibility();};
      if($('voiceStageEnd'))$('voiceStageEnd').onclick=function(){voiceEnd();};
      if($('voiceStageAudio')&&$('voiceEnableAudio'))$('voiceStageAudio').onclick=$('voiceEnableAudio').onclick;
      if($('voiceStageMute')&&$('voiceMute'))$('voiceStageMute').onclick=$('voiceMute').onclick;
    }
    $('voiceName').textContent=name;$('voiceMute').hidden=false;
    if($('voiceStageName'))$('voiceStageName').textContent=name;
    if($('voiceStageAvatar'))$('voiceStageAvatar').innerHTML=voiceAvatarMarkup(voiceState.target);
    voiceSetPhase(phase);
    voiceSetCaption(voiceState.caption);
    voiceSyncStageVisibility();
  }
  function voiceSetPhase(phase) {
    voiceState.phase=phase;
    var label=({connecting:'Connecting…',listening:'Listening',thinking:'Thinking…',speaking:'Speaking',reconnecting:'Reconnecting…'})[phase]||phase;
    var bar=$('gituVoiceBar');
    if(bar){if(bar.dataset)bar.dataset.phase=phase;$('voicePhase').textContent=label;$('voicePhase').title=label;}
    var stage=$('gituVoiceStage');
    if(stage&&stage.dataset)stage.dataset.phase=phase;
    if($('voiceStagePhase'))$('voiceStagePhase').textContent=label;
    if(!voiceState.caption&&$('voiceStageCaption'))voiceSetCaption('');
    voiceSyncStageVisibility();
  }
  async function voiceEnd() {
    ++voiceState.generation;var room=voiceState.room,id=voiceState.callId,mic=voiceState.mic;
    clearTimeout(voiceState.readyTimer);voiceState.readyTimer=null;voiceState.workerReady=false;
    voiceStopMeters();
    voiceState.room=null;voiceState.callId=null;voiceState.mic=null;voiceState.target=null;voiceState.starting=false;voiceState.muted=false;voiceState.replyError=null;voiceState.phase='idle';voiceState.caption='';voiceState.stageMinimized=false;
    var bar=$('gituVoiceBar');if(bar)bar.remove();
    var stage=$('gituVoiceStage');if(stage&&typeof stage.remove==='function')stage.remove();
    voiceUpdateButtons();
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
    dialog.innerHTML='<button type="button" class="voice-setup-close" aria-label="Close setup">'+VOICE_SVG+'<path d="m6 6 12 12M18 6 6 18"/></svg></button><h2 id="voiceSetupTitle">Connect LiveKit Cloud</h2><p>Talk to your existing Gitu agent while it works. Gitu prepares the voice worker in your LiveKit Cloud project automatically.</p><form><label>Project URL<input name="url" type="url" placeholder="wss://your-project.livekit.cloud" value="'+esc(config.url||'')+'" required></label><label>API key<input name="apiKey" type="password" autocomplete="new-password" required></label><label>API secret<input name="apiSecret" type="password" autocomplete="new-password" minlength="20" required></label><p>Credentials use Gitu’s secure key store and are never added to chat.</p><p class="voice-setup-error" role="alert" hidden></p><button class="voice-setup-save" type="submit">Connect project →</button></form>';
    document.body.appendChild(dialog);dialog.querySelector('.voice-setup-close').onclick=function(){dialog.close();};dialog.addEventListener('close',function(){dialog.remove();});
    dialog.querySelector('form').onsubmit=async function(event){event.preventDefault();var form=this,button=form.querySelector('button[type="submit"]'),error=form.querySelector('[role="alert"]');button.disabled=true;error.hidden=true;try{var data={agentName:config.agentName||'gitu-voice'};new FormData(form).forEach(function(value,key){data[key]=String(value);});await api('/api/voice/config',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(data)});form.reset();dialog.close();if(afterSave)afterSave();}catch(e){error.textContent=e.message;error.hidden=false;}finally{button.disabled=false;}};
    dialog.showModal();
  }
  async function voicePrepareWorker(generation) {
    await api('/api/voice/prepare',{method:'POST'});
    var deadline=Date.now()+16*60*1000,attempt=0;
    while(generation===voiceState.generation){
      var worker=await api('/api/voice/worker');
      if(generation!==voiceState.generation)return false;
      if(worker.phase==='ready')return true;
      if(worker.phase==='failed')throw new Error(worker.message||'Voice setup failed. Try again.');
      if(Date.now()>deadline)throw new Error('LiveKit is still preparing voice. Try the call again shortly.');
      voiceSetPhase(worker.message||'Preparing live voice…');
      var wait=Math.min(1000,350+attempt*150);attempt++;
      await new Promise(function(resolve){setTimeout(resolve,wait);});
    }
    return false;
  }
  async function startGituVoice(target) {
    if(voiceState.starting)return;
    if(voiceState.callId){var same=JSON.stringify(voiceState.target)===JSON.stringify(target);await voiceEnd();if(same)return;}
    var generation=++voiceState.generation;voiceState.starting=true;voiceState.target=target;voiceState.stageMinimized=false;voiceState.caption='';
    try{
      if(window.isSecureContext===false)throw new Error('Voice calls need a secure connection. Open your Gitu server using its HTTPS address, then try again.');
      var config=await api('/api/voice/config');if(generation!==voiceState.generation)return;
      if(!config.configured){voiceState.starting=false;voiceSetup(config,function(){startGituVoice(target);});return;}
      voiceShowBar('Calling your agent','connecting');
      var sdkPromise=voiceLoadSdk();
      if(!await voicePrepareWorker(generation))return;
      var sdk=await sdkPromise;
      var mic=await sdk.createLocalAudioTrack({echoCancellation:true,noiseSuppression:true,autoGainControl:true});
      if(generation!==voiceState.generation){mic.stop();return;}voiceState.mic=mic;
      voiceAttachAnalyser(mic,'mic');
      var call=await api('/api/voice/calls',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(target)});
      if(generation!==voiceState.generation){mic.stop();await api('/api/voice/calls/'+call.callId,{method:'DELETE'});return;}
      voiceState.callId=call.callId;voiceShowBar(call.name,'connecting');voiceUpdateButtons();
      var room=new sdk.Room({adaptiveStream:true,dynacast:true});voiceState.room=room;
      function workerReady(participant){if(voiceState.room!==room||!participant.isAgent)return;voiceState.workerReady=true;clearTimeout(voiceState.readyTimer);voiceState.readyTimer=null;voiceSetPhase(participant.attributes['lk.agent.state']||'listening');}
      room.registerRpcMethod('gitu.voice.reply',async function(invocation){
        if(voiceState.callId!==call.callId)throw new Error('This call ended.');
        var participant=room.remoteParticipants.get(invocation.callerIdentity);if(!participant||!participant.isAgent)throw new Error('Only the dispatched voice agent can use this bridge.');
        var payload=JSON.parse(invocation.payload);if(payload.callId!==call.callId)throw new Error('Wrong call.');
        voiceState.replyError=null;
        if(payload.text)voiceSetCaption('You: '+payload.text);
        voiceSetPhase('thinking');
        var reply;
        try{reply=await api('/api/voice/calls/'+call.callId+'/reply',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:payload.id,text:payload.text})});voiceState.replyError=null;}
        catch(e){var message=e.message;try{message=JSON.parse(message).error||message;}catch(_){}voiceState.replyError=message;voiceSetPhase(message);return JSON.stringify({text:'I’m having trouble getting my reply. Please check the message shown in the call controls and try again.'});}
        if(reply&&reply.text)voiceSetCaption(reply.text);
        // Rendering is best effort. A UI refresh must never reject a successful
        // speech RPC after the backend has already accepted the user's request.
        try{
          if(reply.runId){
            if(target.kind==='main'&&!target.runId){target.runId=reply.runId;if(voiceState.target)voiceState.target.runId=reply.runId;voiceUpdateButtons();}
            if(S.active==='home'){Promise.resolve(openRun(reply.runId)).catch(function(){});renderSidebar();}
          }
          if(target.kind==='cowork'&&S.cw&&S.cw.active===target.conversationId)Promise.resolve(cwPoll()).catch(function(){});
        }catch(_){}
        return JSON.stringify(reply);
      });
      room.registerRpcMethod('gitu.voice.status',async function(invocation){
        var participant=room.remoteParticipants.get(invocation.callerIdentity);
        if(voiceState.callId!==call.callId||!participant||!participant.isAgent)throw new Error('This voice worker is not authorized.');
        var status=JSON.parse(invocation.payload);if(status.callId!==call.callId)throw new Error('Wrong call.');
        var stages={tts:'Speech generation',llm:'Agent reply',stt:'Speech recognition'};
        if(status.error&&stages[status.stage]){var code=/^[A-Za-z0-9_]{1,48}$/.test(status.code||'')?status.code:'unavailable';voiceState.replyError=stages[status.stage]+' failed ('+code+'). Check LiveKit or retry the call.';voiceSetPhase(voiceState.replyError);}
        if(status.stage==='audio'){voiceState.replyError=null;var bar=$('gituVoiceBar');if(bar)bar.dataset.audioGenerated='true';}
        return '{}';
      });
      room.on(sdk.RoomEvent.TrackSubscribed,function(track){if(track.kind==='audio'){var audio=track.attach();audio.dataset.gituVoiceAudio=call.callId;document.body.appendChild(audio);voiceAttachAnalyser(track,'agent');}});
      room.on(sdk.RoomEvent.TrackUnsubscribed,function(track){track.detach().forEach(function(element){element.remove();});});
      room.on(sdk.RoomEvent.ParticipantConnected,workerReady);
      room.on(sdk.RoomEvent.ParticipantDisconnected,function(participant){if(voiceState.room===room&&participant.isAgent){voiceEnd();toast('The voice worker disconnected. Your task continues.',true);}});
      room.on(sdk.RoomEvent.ParticipantAttributesChanged,function(changed,participant){if(voiceState.room===room&&participant.isAgent&&changed['lk.agent.state']){workerReady(participant);voiceSetPhase(voiceState.replyError||changed['lk.agent.state']);}});
      room.on(sdk.RoomEvent.AudioPlaybackStatusChanged,function(){var dis=room.canPlaybackAudio;if($('voiceEnableAudio'))$('voiceEnableAudio').hidden=dis;if($('voiceStageAudio'))$('voiceStageAudio').hidden=dis;});
      room.on(sdk.RoomEvent.Reconnecting,function(){voiceSetPhase('reconnecting');});
      room.on(sdk.RoomEvent.Reconnected,function(){voiceSetPhase('listening');});
      room.on(sdk.RoomEvent.Disconnected,function(){if(voiceState.room===room){voiceEnd();toast('Call ended. Your task continues.');}document.querySelectorAll('[data-gitu-voice-audio="'+call.callId+'"]').forEach(function(audio){audio.remove();});});
      room.registerTextStreamHandler('lk.transcription',async function(reader){var caption='';for await(var chunk of reader){caption=(caption+chunk).slice(-4000);if(voiceState.callId===call.callId)voiceSetCaption(caption);}});
      await room.connect(call.url,call.token);
      if(generation!==voiceState.generation){await room.disconnect();return;}
      room.remoteParticipants.forEach(workerReady);
      if(!voiceState.workerReady)voiceState.readyTimer=setTimeout(function(){if(voiceState.room===room&&!voiceState.workerReady){voiceEnd();toast('The voice worker did not join. Deploy gitu-voice in your connected LiveKit project, then try again.',true);}},25000);
      await room.localParticipant.publishTrack(mic);
      await room.startAudio().catch(function(){if($('voiceEnableAudio'))$('voiceEnableAudio').hidden=false;if($('voiceStageAudio'))$('voiceStageAudio').hidden=false;});
    }catch(e){if(generation===voiceState.generation){await voiceEnd();var message=e.name==='NotAllowedError'?'Allow microphone access to start a call.':e.message;voiceShowBar('Live voice',message);$('gituVoiceBar').dataset.phase='failed';if($('gituVoiceBar'))$('gituVoiceBar').hidden=false;if($('gituVoiceStage'))$('gituVoiceStage').hidden=true;$('voiceMute').hidden=true;var retry=document.createElement('button');retry.type='button';retry.id='voiceRetry';retry.title='Retry call';retry.setAttribute('aria-label','Retry call');retry.innerHTML=VOICE_SVG+'<path d="M3 11a9 9 0 1 1 3 7M3 4v7h7"/></svg>';retry.onclick=function(){voiceEnd().then(function(){startGituVoice(target);});};$('gituVoiceBar').appendChild(retry);toast(message,true);}}
    finally{if(generation===voiceState.generation)voiceState.starting=false;}
  }
  function bindGituVoice() {var button=$('mainVoiceCall');if(!button)return;button.onclick=function(){var model=(S.sel.model||'').split('::');startGituVoice({kind:'main',runId:S.active==='home'?undefined:S.active,provider:model[0],model:model[1],projectPath:effectiveProjectPath()||undefined});};voiceUpdateButtons();}
  window.addEventListener('pagehide',function(){if(voiceState.callId)navigator.sendBeacon('/api/voice/calls/'+encodeURIComponent(voiceState.callId)+'/end',new Blob(['{}'],{type:'application/json'}));});
`;
