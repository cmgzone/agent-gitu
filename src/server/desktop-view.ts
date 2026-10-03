import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

function resolveDesktopAssets(): string {
  // @novnc/novnc only exports its bare specifier ('./core/rfb.js'), so './package.json'
  // is not a resolvable subpath. Start at the exported file and walk up to the package
  // root, which holds the core/ and vendor/ asset trees this view serves.
  let dir = path.dirname(createRequire(import.meta.url).resolve('@novnc/novnc'));
  while (!fs.existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(dir, '..');
    dir = parent;
  }
  return dir;
}

export const DESKTOP_ASSETS = resolveDesktopAssets();
export function desktopAsset(relative: string): string | undefined {
  if (!/^(core|vendor)\/[a-zA-Z0-9_./-]+\.js$/.test(relative) || relative.split('/').includes('..')) return;
  return path.join(DESKTOP_ASSETS, relative);
}

export function desktopView(agentId: string): string {
  const endpoint = JSON.stringify('/api/cowork/agents/' + encodeURIComponent(agentId) + '/computer/vnc');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shared desktop</title><style>html,body,#screen{width:100%;height:100%;margin:0;overflow:hidden;background:#151821}#message{position:fixed;inset:0;display:grid;place-items:center;color:#c3c6d1;font:14px system-ui;pointer-events:none}#message[hidden]{display:none}</style></head><body><div id="screen"></div><div id="message">Connecting to live desktop…</div><script type="module">
import RFB from '/api/desktop-assets/core/rfb.js';
let rfb, timer, frames, monitorTimer, closed=false;
const message=document.getElementById('message'),screen=document.getElementById('screen');
const diagnostic=new URLSearchParams(location.search).has('diagnostic');
let received=0,bytes=0,requests=0,inputs=0,lastRead=0,clientError='';
if(diagnostic){
  const monitor=document.createElement('pre');
  monitor.style.cssText='position:fixed;right:8px;top:8px;padding:8px;background:#171624e8;color:#eee;font:12px monospace;pointer-events:none;z-index:10';
  monitor.setAttribute('aria-label','Desktop connection diagnostics');document.body.appendChild(monitor);
  screen.addEventListener('keydown',()=>inputs++,true);screen.addEventListener('pointerdown',()=>inputs++,true);
  addEventListener('error',event=>{clientError=event.message;});
  addEventListener('unhandledrejection',event=>{clientError=String(event.reason?.message||event.reason);});
  monitorTimer=setInterval(()=>{const canvas=screen.querySelector('canvas');monitor.textContent='Received: '+received+' / '+bytes+' bytes\\nRequests: '+requests+' / Inputs: '+inputs+'\\nLast update: '+(lastRead?Math.round(performance.now()-lastRead)+'ms':'waiting')+' / '+document.visibilityState+'\\nCanvas: '+canvas?.width+'x'+canvas?.height+(clientError?'\\nError: '+clientError:'');},250);
}
function status(state){parent.postMessage({type:'gitu-desktop',state},location.origin);}
function stopFrames(){clearInterval(frames);frames=undefined;}
addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='gitu-desktop-control'||event.data.action!=='focus'||closed)return;
  // A modifier held by the previous controller must not affect the next user's typing.
  for(const [keysym,code] of [[0xffe1,'ShiftLeft'],[0xffe2,'ShiftRight'],[0xffe3,'ControlLeft'],[0xffe4,'ControlRight'],[0xffe9,'AltLeft'],[0xffea,'AltRight'],[0xffeb,'MetaLeft'],[0xffec,'MetaRight']])rfb?.sendKey(keysym,code,false);
  rfb?.focus({preventScroll:true});
});
function connect(){
  if(closed)return;
  const socket=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+${endpoint});
  if(diagnostic)socket.addEventListener('message',event=>{received++;bytes+=event.data.byteLength||0;lastRead=performance.now();});
  rfb=new RFB(screen,socket,{shared:true});
  rfb.scaleViewport=true; rfb.resizeSession=false; rfb.viewOnly=false;
  rfb.qualityLevel=6; rfb.compressionLevel=2;
  rfb.addEventListener('connect',()=>{
    message.hidden=true;status('Live · Shared desktop');rfb.focus();
    // LibVNCServer has no ContinuousUpdates extension. Keep incremental
    // requests ready so every redraw does not wait another network round trip.
    // These ten-byte requests send pixels only when the desktop changes.
    frames=setInterval(()=>{
      const canvas=screen.querySelector('canvas');
      if(closed||document.hidden||socket.readyState!==WebSocket.OPEN||socket.bufferedAmount>8192||!canvas?.width||!canvas.height)return;
      const packet=new Uint8Array(10),view=new DataView(packet.buffer);
      packet[0]=3;packet[1]=1;view.setUint16(6,canvas.width);view.setUint16(8,canvas.height);
      socket.send(packet);
      requests++;
    },40);
  });
  rfb.addEventListener('disconnect',()=>{stopFrames();if(closed)return;message.hidden=false;message.textContent='Reconnecting to desktop…';status('Reconnecting…');timer=setTimeout(connect,2000);});
  rfb.addEventListener('securityfailure',()=>{message.hidden=false;message.textContent='Desktop access was rejected.';status(message.textContent);});
}
addEventListener('pagehide',()=>{closed=true;clearTimeout(timer);clearInterval(monitorTimer);stopFrames();rfb?.disconnect();});
connect();
</script></body></html>`;
}
