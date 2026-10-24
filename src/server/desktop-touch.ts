/** Shared by local, hosted and SSH desktop viewers. Input uses owner-only HTTP
 * controls so mobile IME text never becomes model/tool history or clipboard data. */
export const DESKTOP_TOUCH_CSS = String.raw`
*{box-sizing:border-box}[hidden]{display:none!important}body{display:flex;flex-direction:column;height:100dvh}#screen{flex:1;min-height:0;height:auto;touch-action:none}#screen canvas{touch-action:none}
.touch-bar,.touch-keyboard,.touch-help{flex:none;background:#202633;color:#edf1fa;font:13px/1.4 system-ui,sans-serif}.touch-bar{display:flex;gap:6px;padding:6px max(8px,env(safe-area-inset-right)) 6px max(8px,env(safe-area-inset-left));border-top:1px solid #ffffff18}.touch-bar button,.touch-keyboard button{min-height:44px;min-width:44px;border:1px solid #ffffff26;border-radius:12px;background:#ffffff0b;color:inherit;font:inherit;touch-action:manipulation}.touch-bar button{padding:8px 12px;flex:1}.touch-bar button[aria-pressed=true]{background:#d9e5ff;color:#16233a}.touch-bar button:disabled,.touch-keyboard button:disabled{opacity:.45}.touch-bar button:focus-visible,.touch-keyboard button:focus-visible{outline:2px solid #a9c9ff;outline-offset:-3px}.touch-help{margin:0;padding:8px 12px;border-top:1px solid #ffffff18;font-size:12px}.touch-keyboard{padding:8px 8px max(8px,env(safe-area-inset-bottom));border-top:1px solid #ffffff18}.touch-entry{display:flex;gap:6px}.touch-entry input{flex:1;width:0;min-width:0;min-height:44px;border:1px solid #ffffff30;border-radius:12px;padding:10px;background:#101622;color:#fff;font:16px system-ui}.touch-entry button{padding:8px 14px}.touch-keys{display:flex;gap:6px;margin-top:6px;overflow-x:auto;scrollbar-width:none}.touch-keys::-webkit-scrollbar{display:none}.touch-keys button{flex:none;padding:8px 11px}.touch-feedback{margin:5px 2px 0;font-size:11px;min-height:15px;color:#c4d0e6}.touch-bar{padding-bottom:max(6px,env(safe-area-inset-bottom))}@media(max-height:180px){.touch-keys{display:none}}@media(max-height:320px){.touch-feedback{min-height:0;margin:3px 2px 0}.touch-keyboard{padding:5px 8px}.touch-help{font-size:11px;padding:5px 10px}}
`;

export const DESKTOP_TOUCH_HTML = String.raw`
<p id="touch-help" class="touch-help" hidden>Tap to click. Hold to right-click. Drag with two fingers to scroll. Zoom, then use Pan to move around; turn Pan off to click or drag items.</p>
<section id="touch-keyboard" class="touch-keyboard" aria-label="Private desktop keyboard" hidden><div class="touch-entry"><input id="touch-text" type="password" aria-label="Private desktop typing" placeholder="Tap a desktop field first, then type here" maxlength="2000" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false"><button id="touch-send" type="button">Send</button></div><div class="touch-keys" aria-label="Desktop keys"><button data-touch-key="Tab">Tab ↹</button><button data-touch-key="Return">Enter ↵</button><button data-touch-key="BackSpace">⌫</button><button data-touch-key="Escape">Esc</button><button data-touch-key="ctrl+l">Address</button></div><p id="touch-feedback" class="touch-feedback" role="status">Private typing · cleared after sending</p></section>
<nav id="touch-bar" class="touch-bar" aria-label="Desktop touch controls" hidden><button id="touch-zoom" type="button" aria-pressed="false" disabled>Zoom</button><button id="touch-pan" type="button" aria-label="Pan desktop" aria-pressed="false" disabled>Pan</button><button id="touch-toggle" type="button" aria-expanded="false" aria-controls="touch-keyboard" disabled>Keyboard</button><button id="touch-guide" type="button" aria-expanded="false" aria-controls="touch-help">Help</button></nav>
`;

export const DESKTOP_TOUCH_JS = String.raw`
let touchControls;
if(!preview&&typeof matchMedia==='function'&&matchMedia('(any-pointer: coarse), (max-width: 720px)').matches){
  const bar=document.getElementById('touch-bar'),keyboard=document.getElementById('touch-keyboard'),text=document.getElementById('touch-text'),feedback=document.getElementById('touch-feedback'),zoom=document.getElementById('touch-zoom'),pan=document.getElementById('touch-pan'),toggle=document.getElementById('touch-toggle'),send=document.getElementById('touch-send'),help=document.getElementById('touch-help'),guide=document.getElementById('touch-guide');
  let scaled=true,panning=false,connected=false,ready=false,revision=0,pending=false,abort=new AbortController(),queue=Promise.resolve();
  bar.hidden=false;
  function viewport(scale,drag){scaled=scale;panning=!scale&&drag;if(rfb){rfb.scaleViewport=scaled;rfb.clipViewport=!scaled;rfb.dragViewport=panning;}zoom.textContent=scaled?'Zoom':'Fit';zoom.setAttribute('aria-pressed',String(!scaled));pan.disabled=!connected||scaled;pan.setAttribute('aria-pressed',String(panning));}
  function enabled(){send.disabled=!ready||pending||!connected;keyboard.querySelectorAll('[data-touch-key]').forEach(button=>button.disabled=!ready||pending||!connected);}
  function privateEnd(){revision++;abort.abort();abort=new AbortController();queue=Promise.resolve();ready=false;pending=false;text.value='';text.blur();keyboard.hidden=true;toggle.setAttribute('aria-expanded','false');feedback.textContent='Private typing · cleared after sending';enabled();}
  async function post(body,signal){const response=await fetch(humanInputEndpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal});if(!response.ok)throw new Error('Desktop control unavailable');}
  toggle.onclick=()=>{
    if(!keyboard.hidden){privateEnd();return;}
    keyboard.hidden=false;toggle.setAttribute('aria-expanded','true');ready=false;feedback.textContent='Pausing the agent for private typing…';enabled();
    text.focus({preventScroll:true});
    const turn=++revision,signal=abort.signal;
    post({action:'take-control'},signal).then(()=>{if(turn!==revision||closed)return;ready=true;feedback.textContent='Private typing · cleared after sending';enabled();}).catch(()=>{if(turn!==revision||closed)return;text.value='';ready=false;feedback.textContent='Could not take control. Check your connection and try again.';enabled();});
  };
  function input(value){
    if(!ready||!connected||closed)return;
    const turn=revision,signal=abort.signal;pending=true;enabled();
    queue=queue.then(async()=>{if(turn!==revision||closed)return;await post({action:'input',input:value},signal);}).then(()=>{if(turn===revision&&!closed)feedback.textContent='Sent privately · cleared';}).catch(()=>{if(turn===revision&&!closed){ready=false;feedback.textContent='Could not send. Reopen Keyboard to take private control again.';}}).finally(()=>{if(turn===revision&&!closed){pending=false;enabled();}});
  }
  function sendText(){if(!ready||pending||!connected)return;const value=text.value;text.value='';if(value)input({action:'type',text:value});}
  send.onclick=sendText;text.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();sendText();}};
  keyboard.querySelectorAll('[data-touch-key]').forEach(button=>button.onclick=()=>input({action:'key',key:button.dataset.touchKey}));
  // Keep the phone keyboard open when Send or a special key is tapped.
  keyboard.querySelectorAll('button').forEach(button=>button.addEventListener('pointerdown',event=>event.preventDefault()));
  zoom.onclick=()=>viewport(!scaled,scaled);pan.onclick=()=>viewport(false,!panning);
  guide.onclick=()=>{help.hidden=!help.hidden;guide.setAttribute('aria-expanded',String(!help.hidden));};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)privateEnd();});
  touchControls={viewport,privateEnd,get typing(){return !keyboard.hidden;},connected(){connected=true;zoom.disabled=false;toggle.disabled=false;viewport(scaled,panning);enabled();},disconnected(){connected=false;privateEnd();zoom.disabled=true;pan.disabled=true;toggle.disabled=true;},close(){connected=false;privateEnd();abort.abort();}};
}
`;
