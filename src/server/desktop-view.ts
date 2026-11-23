import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { DESKTOP_TOUCH_CSS, DESKTOP_TOUCH_HTML, DESKTOP_TOUCH_JS } from './desktop-touch.js';

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

export function desktopView(agentId: string, chromeProfile = false): string {
  const endpoint = JSON.stringify(chromeProfile ? '/api/chrome-profile/vnc' : '/api/cowork/agents/' + encodeURIComponent(agentId) + '/computer/vnc');
  const audioEndpoint = JSON.stringify(chromeProfile ? '/api/chrome-profile/audio' : '/api/cowork/agents/' + encodeURIComponent(agentId) + '/computer/audio');
  const inputEndpoint = JSON.stringify(chromeProfile ? '/api/chrome-profile' : '/api/cowork/agents/' + encodeURIComponent(agentId) + '/computer');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Shared desktop</title><style>html,body,#screen{width:100%;height:100%;margin:0;overflow:hidden;background:#151821}#message{position:fixed;inset:0;display:grid;place-items:center;color:#c3c6d1;font:14px system-ui;pointer-events:none}#message[hidden]{display:none}${DESKTOP_TOUCH_CSS}</style></head><body><div id="screen"></div><div id="message">Connecting to live desktop…</div>${DESKTOP_TOUCH_HTML}<script type="module">
import RFB from '/api/desktop-assets/core/rfb.js';
let rfb, activeSocket, audioSocket, audioCtx, audioTime=0, audioCarry, timer, frames, monitorTimer, closed=false;
const message=document.getElementById('message'),screen=document.getElementById('screen');
const options=new URLSearchParams(location.search),diagnostic=options.has('diagnostic');
const preview=options.get('preview')==='1';
const humanInputEndpoint=${inputEndpoint};
${DESKTOP_TOUCH_JS}
// Leave update scheduling to noVNC. A timed stream of extra requests can
// keep legacy servers processing input instead of drawing the next frame.
const pipeline=diagnostic&&options.get('pipeline')==='1';
let received=0,bytes=0,requests=0,inputs=0,keyPackets=0,pointerPackets=0,buttonPackets=0,lastRead=0,clientError='';
if(diagnostic){
  const monitor=document.createElement('pre');
  monitor.style.cssText='position:fixed;right:8px;top:8px;padding:8px;background:#171624e8;color:#eee;font:12px monospace;pointer-events:none;z-index:10';
  monitor.setAttribute('aria-label','Desktop connection diagnostics');document.body.appendChild(monitor);
  screen.addEventListener('keydown',()=>inputs++,true);screen.addEventListener('pointerdown',()=>inputs++,true);
  addEventListener('error',event=>{clientError=event.message;});
  addEventListener('unhandledrejection',event=>{clientError=String(event.reason?.message||event.reason);});
  monitorTimer=setInterval(()=>{const canvas=screen.querySelector('canvas');monitor.textContent='Received: '+received+' / '+bytes+' bytes\\nRequests: '+requests+' / Inputs: '+inputs+'\\nSent: '+keyPackets+' keys / '+pointerPackets+' pointers / '+buttonPackets+' clicks\\nQueued: '+(activeSocket?.bufferedAmount||0)+' bytes / Pipeline: '+pipeline+'\\nLast update: '+(lastRead?Math.round(performance.now()-lastRead)+'ms':'waiting')+' / '+document.visibilityState+'\\nCanvas: '+canvas?.width+'x'+canvas?.height+(clientError?'\\nError: '+clientError:'');},250);
}
function status(state){parent.postMessage({type:'gitu-desktop',state},location.origin);}
function stopFrames(){clearInterval(frames);frames=undefined;}
function stopAudio(){try{audioSocket?.close?.();}catch{}audioSocket=undefined;audioCarry=undefined;audioTime=0;}
function startAudio(){
  const Ctx=globalThis.AudioContext||globalThis.webkitAudioContext;
  if(preview||closed||!Ctx)return;
  if(!audioCtx)audioCtx=new Ctx({sampleRate:24000});
  if(audioCtx.state==='suspended')audioCtx.resume?.().catch(()=>{});
  if(audioSocket)return;
  const ws=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+${audioEndpoint});
  ws.binaryType='arraybuffer';
  audioSocket=ws;
  ws.addEventListener('message',event=>{
    if(closed||!audioCtx||audioCtx.state!=='running'||!(event.data instanceof ArrayBuffer))return;
    let raw=new Uint8Array(event.data);
    if(audioCarry?.length){const merged=new Uint8Array(audioCarry.length+raw.length);merged.set(audioCarry,0);merged.set(raw,audioCarry.length);raw=merged;audioCarry=undefined;}
    const rem=raw.byteLength%4;
    if(rem){audioCarry=raw.slice(raw.byteLength-rem);raw=raw.subarray(0,raw.byteLength-rem);}
    const framesCount=raw.byteLength>>2;if(!framesCount)return;
    const pcm=new Int16Array(raw.buffer,raw.byteOffset,framesCount*2);
    const buf=audioCtx.createBuffer(2,framesCount,24000);
    const left=buf.getChannelData(0),right=buf.getChannelData(1);
    for(let i=0,j=0;i<framesCount;i++,j+=2){left[i]=pcm[j]/32768;right[i]=pcm[j+1]/32768;}
    const node=audioCtx.createBufferSource();node.buffer=buf;node.connect(audioCtx.destination);
    const now=audioCtx.currentTime;if(audioTime<now||audioTime>now+0.4)audioTime=now+0.04;
    node.start(audioTime);audioTime+=buf.duration;
  });
  ws.addEventListener('close',()=>{if(audioSocket===ws)audioSocket=undefined;});
}
if(!preview){screen.addEventListener('pointerdown',startAudio,true);screen.addEventListener('keydown',startAudio,true);}
addEventListener('message',event=>{
  if(!preview&&event.origin===location.origin&&event.source===parent&&event.data?.type==='gitu-desktop-control'&&event.data.action==='privacy'&&!closed){touchControls?.privateEnd();return;}
  if(!preview&&event.origin===location.origin&&event.source===parent&&event.data?.type==='gitu-desktop-control'&&event.data.action==='viewport'&&!closed){if(touchControls)touchControls.viewport(event.data.scale!==false,event.data.pan===true);else if(rfb){rfb.scaleViewport=event.data.scale!==false;rfb.clipViewport=event.data.scale===false;rfb.dragViewport=event.data.pan===true&&event.data.scale===false;}return;}
  if(preview||event.origin!==location.origin||event.source!==parent||event.data?.type!=='gitu-desktop-control'||event.data.action!=='focus'||closed)return;
  startAudio();
  // A modifier held by the previous controller must not affect the next user's typing.
  for(const [keysym,code] of [[0xffe1,'ShiftLeft'],[0xffe2,'ShiftRight'],[0xffe3,'ControlLeft'],[0xffe4,'ControlRight'],[0xffe9,'AltLeft'],[0xffea,'AltRight'],[0xffeb,'MetaLeft'],[0xffec,'MetaRight']])rfb?.sendKey(keysym,code,false);
  rfb?.focus({preventScroll:true});
});
function connect(){
  if(closed)return;
  const socket=new WebSocket((location.protocol==='https:'?'wss://':'ws://')+location.host+${endpoint});
  activeSocket=socket;
  if(diagnostic){
    socket.addEventListener('message',event=>{received++;bytes+=event.data.byteLength||0;lastRead=performance.now();});
    const send=socket.send.bind(socket);
    socket.send=data=>{const packet=ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):new Uint8Array(data);if(packet[0]===4)keyPackets++;if(packet[0]===5){pointerPackets++;if(packet[1])buttonPackets++;}send(data);};
  }
  rfb=new RFB(screen,socket,{shared:true});
  rfb.scaleViewport=true; rfb.resizeSession=false; rfb.viewOnly=preview;
  rfb.qualityLevel=6; rfb.compressionLevel=2;
  rfb.addEventListener('connect',()=>{
    message.hidden=true;status('Live · Shared desktop');touchControls?.connected();if(!preview&&!touchControls?.typing)rfb.focus();
    // LibVNCServer has no ContinuousUpdates extension. Keep incremental
    // requests ready so every redraw does not wait another network round trip.
    // These ten-byte requests send pixels only when the desktop changes.
    if(pipeline)frames=setInterval(()=>{
      const canvas=screen.querySelector('canvas');
      if(closed||document.hidden||socket.readyState!==WebSocket.OPEN||socket.bufferedAmount>8192||!canvas?.width||!canvas.height)return;
      const packet=new Uint8Array(10),view=new DataView(packet.buffer);
      packet[0]=3;packet[1]=1;view.setUint16(6,canvas.width);view.setUint16(8,canvas.height);
      socket.send(packet);
      requests++;
    },40);
  });
  rfb.addEventListener('disconnect',()=>{stopFrames();stopAudio();touchControls?.disconnected();if(closed)return;message.hidden=false;message.textContent='Reconnecting to desktop…';status('Reconnecting…');timer=setTimeout(connect,2000);});
  rfb.addEventListener('securityfailure',()=>{stopAudio();message.hidden=false;message.textContent='Desktop access was rejected.';status(message.textContent);});
}
addEventListener('pagehide',()=>{closed=true;touchControls?.close();clearTimeout(timer);clearInterval(monitorTimer);stopFrames();stopAudio();try{audioCtx?.close?.();}catch{}rfb?.disconnect();});
connect();
</script></body></html>`;
}
