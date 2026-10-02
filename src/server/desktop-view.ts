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
let rfb, timer, closed=false;
const message=document.getElementById('message'),screen=document.getElementById('screen');
function status(state){parent.postMessage({type:'gitu-desktop',state},location.origin);}
function connect(){
  if(closed)return;
  rfb=new RFB(screen,(location.protocol==='https:'?'wss://':'ws://')+location.host+${endpoint},{shared:true});
  rfb.scaleViewport=true; rfb.resizeSession=false; rfb.viewOnly=false;
  rfb.qualityLevel=6; rfb.compressionLevel=2;
  rfb.addEventListener('connect',()=>{message.hidden=true;status('Live · Shared desktop');rfb.focus();});
  rfb.addEventListener('disconnect',()=>{if(closed)return;message.hidden=false;message.textContent='Reconnecting to desktop…';status('Reconnecting…');timer=setTimeout(connect,2000);});
  rfb.addEventListener('securityfailure',()=>{message.hidden=false;message.textContent='Desktop access was rejected.';status(message.textContent);});
}
addEventListener('pagehide',()=>{closed=true;clearTimeout(timer);rfb?.disconnect();});
connect();
</script></body></html>`;
}
