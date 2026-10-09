/** Long-chat navigation fixture using the shipped Cowork lifecycle and scroll code. */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { COWORK_JS } from '../../src/server/ui-cowork.js';
import { SUBAGENT_JS } from '../../src/server/ui-subagents.js';
import { CONNECTED_APPS_JS } from '../../src/server/ui-connected-apps.js';
import { COWORK_GALLERY_JS } from '../../src/server/ui-gallery.js';
import { COWORK_PROFILE_JS } from '../../src/server/ui-cowork-profile.js';
import { UI_HTML } from '../../src/server/ui.js';
import { CHARACTERS_DIR, FONTS_DIR } from '../../src/server/static-assets.js';

const agents = ['Atlas', 'Nova'].map((name, index) => ({ id: name.toLowerCase(), name,
  tagline: index ? 'Social media manager' : 'Software engineer', avatar: { color: index ? '#c9a86a' : '#5ba8ff', shape: index ? 'dot-orange' : 'dot-blue' },
  useHostComputer: true, skills: [], allowWrites: true, allowShell: true }));
const convs = agents.map(agent => ({ id: agent.id, kind: 'dm', title: agent.name, memberIds: [agent.id] }));
const histories = Object.fromEntries(agents.map(agent => [agent.id, Array.from({ length: 36 }, (_, index) => ({
  id: agent.id + '-' + index, seq: index + 1, role: index % 3 ? 'agent' : 'user', agentId: agent.id, agentName: agent.name,
  ts: new Date(Date.now() - (36 - index) * 60000).toISOString(), text: index === 35 ? 'Latest ' + agent.name + ' message — ready for your review.' :
    'Launch update ' + (index + 1) + '.\n\nReviewed the work and kept the conversation moving. This sample history checks that activity updates preserve the message you are reading.',
}))]));
const styles = UI_HTML.match(/<style>([\s\S]*?)<\/style>/)![1];
const html = `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cowork navigation</title><style>${styles}
body{margin:0;display:flex;flex-direction:column;height:100dvh;overflow:hidden}#view{display:flex;flex:1;min-height:0;width:100%}.preview-controls{display:flex;justify-content:center;gap:18px;flex-wrap:wrap;padding:10px;font-size:12px;border-top:1px solid var(--border)}.preview-controls button{padding:3px;color:var(--muted)}
</style></head><body><div id="view"></div><div class="preview-controls" aria-label="Preview controls"><span>Sample long chats</span><button id="activity">Post activity update</button><button id="leave">Leave Cowork</button></div><script>
const S={active:'cowork',sel:{},models:[],cw:{agents:${JSON.stringify(agents)},convs:${JSON.stringify(convs)},active:'atlas',msgs:[],skills:[],infoOpen:false,computersChecked:Date.now()}};
const histories=${JSON.stringify(histories)},work={atlas:[],nova:[]},EventSource=undefined;
const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=async(raw)=>{await new Promise(resolve=>setTimeout(resolve,raw.endsWith('/agents')||raw.endsWith('/conversations')?650:250));const url=new URL(raw,location.origin);
if(url.pathname==='/api/cowork/agents')return {agents:${JSON.stringify(agents)}};
if(url.pathname==='/api/cowork/conversations')return {conversations:${JSON.stringify(convs)}};
const computer=/agents\\/(atlas|nova)\\/computer$/.exec(url.pathname);if(computer)return {computer:{agentId:computer[1],useHostComputer:true,state:'host',control:'shared'}};
const match=/conversations\\/(atlas|nova)\\/messages$/.exec(url.pathname);if(match){const id=match[1];return {messages:histories[id].filter(message=>message.seq>Number(url.searchParams.get('after')||0)),workHistory:work[id],requests:[],todos:[],artifacts:[],threads:[],folders:[],widgets:[],busy:false,subAgents:{nodes:[]}}}return {};
};
const toast=()=>{},shortDate=value=>new Date(value).toLocaleString(),toggleMobileNav=()=>{},stopStreams=()=>{},renderSidebar=()=>{},themeToggleHtml=()=>'',bindThemeToggle=()=>{},loadModelCatalog=async()=>{};
const openHome=()=>{$('view').innerHTML='<button id="return">Return to Cowork</button>';$('return').onclick=openCowork};
${COWORK_JS}
${CONNECTED_APPS_JS}
${COWORK_GALLERY_JS}
${COWORK_PROFILE_JS}
const icon=name=>cwIcon(name==='x'?'close':name);
${SUBAGENT_JS}
cwLearnLoad=()=>{};cwPollAppConnections=()=>{};
openCowork();
$('activity').onclick=()=>{const id=S.cw.active;work[id]=work[id].concat([{id:'step-'+(work[id].length+1),agentId:id,agentName:id==='atlas'?'Atlas':'Nova',tool:'read_file',ok:true,ts:new Date().toISOString(),publicUpdate:'Checked the project information.'}]);cwPoll()};
$('leave').onclick=()=>cwExit();
</script></body></html>`;
const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://localhost'), file = /^\/(characters|fonts)\/([\w.-]+)$/.exec(url.pathname);
  if (file) {
    try { const bytes = readFileSync(path.join(file[1] === 'characters' ? CHARACTERS_DIR : FONTS_DIR, file[2])); response.writeHead(200, { 'content-type': file[1] === 'characters' ? 'image/png' : 'font/woff2' }); response.end(bytes); }
    catch { response.writeHead(404); response.end(); }
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); response.end(html);
});
server.listen(Number(process.env.GITU_NAVIGATION_PREVIEW_PORT) || 0, '127.0.0.1', () => { const address = server.address(); if (address && typeof address !== 'string') console.log('Cowork navigation preview: http://127.0.0.1:' + address.port); });
