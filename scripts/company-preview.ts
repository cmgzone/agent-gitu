import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { UI_HTML } from '../src/server/ui.js';
import { COMPANY_JS } from '../src/server/ui-companies.js';
import { COWORK_JS } from '../src/server/ui-cowork.js';
import { COMPANY_CONNECTIONS_JS } from '../src/server/ui-company-connections.js';
import { COMPANY_WALLETS_JS } from '../src/server/ui-company-wallets.js';
import { FILE_UPLOAD_JS } from '../src/server/ui-files.js';

// A separate, inert demonstration of the implemented UI. It never calls the app runtime.
const demo = String.raw`
var S={sel:{model:'preview::demo-model'}};
function $(id){return document.getElementById(id);}
function esc(value){var el=document.createElement('span');el.textContent=String(value==null?'':value);return el.innerHTML.replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function toast(message){$('previewNotice').textContent='Demo preview · '+message;}
function shortDate(v){return new Date(v).toLocaleDateString();}
function humanBytes(v){return v<1048576?Math.round(v/1024)+' KB':(v/1048576).toFixed(1)+' MB';}
function openSettings(){toast('Connections are managed in the real app.');}
var lead={id:'demo-lead',name:'Ari',tagline:'Company lead',systemPrompt:'Plan bounded work, delegate to helpers, and verify their results.',provider:'preview',model:'demo-model'};
var totals={knownCostUsd:1.62,inputTokens:124500,outputTokens:18900,cachedTokens:8200,unknownCostCalls:0,calls:14};
var companies=[{id:'company-demo-northstar',name:'Northstar Studio',purpose:'Build helpful tools for small businesses',state:'running',access:'supervised',monthlyBudgetUsd:100,budgetChosen:true,maxFileBytes:null,fileLimitChosen:true,reviewMinutes:15,workers:2,computerLimit:2,missionSessions:12,staffLimit:10,cpu:2,memoryMb:2048,diskMb:10240,skills:[],connectionIds:[],accountIds:[],direction:'Prepare a customer research summary.',directionVersion:1,leadId:lead.id,conversationId:'demo-chat'}];
var messages=[{id:'demo-user',role:'user',text:'Prepare a customer research summary.'},{id:'demo-agent',role:'agent',agentName:'Ari',text:'I’ll collect the research, verify the findings, and report the decisions that need your input.'}];
var demoMemories={'company-demo-northstar':[{id:'demo-memory',claim:'Use concise reports with evidence and clear decisions.',kind:'preference',updatedAt:'2026-10-11T10:00:00Z'}]};
var demoReferences={'company-demo-northstar':[{id:'reference-demo',connectionId:'demo-drive',item:{id:'demo-report',name:'Research report.pdf',folder:false},connected:false,readable:false}]};
window.fetch=async function(input,options){
  var url=new URL(String(input),'https://company-preview.invalid'),p=url.pathname,method=(options&&options.method)||'GET',body=options&&options.body?JSON.parse(options.body):{},data={};
  if(p==='/api/companies'){
    if(method==='POST'){var c={...companies[0],id:'company-demo-'+crypto.randomUUID(),name:'New company',purpose:'',state:'draft',leadId:undefined,conversationId:undefined,budgetChosen:false,fileLimitChosen:false,direction:'',directionVersion:0};companies.push(c);data={company:c};}
    else data={companies:companies.map(c=>({...c,usage:totals,decisions:0})),usage:totals};
  }else if(p.endsWith('/policy'))data={maxFileBytes:null};
  else if(p==='/api/models')data={providers:[{id:'preview',label:'Demo provider',usable:true,defaultModel:'demo-model',models:[{id:'demo-model',label:'Demo model'}]}]};
  else if(p==='/api/cowork/agents')data={agents:[lead]};
  else if(p==='/api/connected-apps')data={accounts:[]};
  else if(p==='/api/connections')data={connections:[]};
  else if(p==='/api/skills')data={skills:[]};
  else if(p==='/api/cowork/cloud-servers')data={servers:[]};
  else{
    var match=p.match(/^\/api\/companies\/([^/]+)(.*)$/),c=match&&companies.find(c=>c.id===match[1]),suffix=match&&match[2];
    if(!c)return new Response(JSON.stringify({error:'Preview mode: this operation is unavailable.'}),{status:400});
    if(!suffix){if(method==='PATCH')Object.assign(c,body);data={company:c,agents:c.leadId?[lead]:[],missions:[],requests:[],actions:[],jobs:[],usage:[],totals:totals,monthly:{month:'2026-10',knownCostUsd:1.62,reservedUsd:0,unknownCalls:0}};}
    else if(suffix==='/status'){data={id:c.id,name:c.name,state:c.state,direction:c.direction,directionVersion:c.directionVersion,activity:[],agents:[lead],actions:[],jobs:[],missions:[],pendingDecisions:0};}
    else if(suffix==='/lead'){Object.assign(lead,body);c.leadId=lead.id;c.conversationId='demo-chat';data={company:c,agent:lead};}
    else if(['/start','/resume','/pause','/archive','/restore'].includes(suffix)){c.state=suffix==='/archive'?'archived':suffix==='/start'||suffix==='/resume'?'running':'paused';data={company:c};}
    else if(suffix==='/chat'){if(method==='POST'){messages.push({id:crypto.randomUUID(),role:'user',text:body.text},{id:crypto.randomUUID(),role:'agent',agentName:lead.name,text:'This is a UI preview. Your message is shown here; no agent or external action runs.'});}data={messages:messages,artifacts:[],busy:false};}
    else if(suffix==='/storage')data={connections:[],transfers:[],references:demoReferences[c.id]||[]};
    else if(suffix==='/storage/references/reference-demo'&&method==='DELETE'){demoReferences[c.id]=[];data={ok:true};}
    else if(suffix==='/mcp')data={servers:[],tools:[]};
    else if(suffix==='/wallets')data={wallets:[],transactions:[]};
    else if(suffix.endsWith('/computer')&&method==='GET')data={computer:{state:'stopped',control:'shared'}};
    else if(suffix.endsWith('/memory'))data={entries:demoMemories[c.id]||[]};
    else if(suffix.endsWith('/memory/demo-memory')){if(method==='PATCH')Object.assign((demoMemories[c.id]||[])[0],{claim:body.claim,updatedAt:new Date().toISOString()});if(method==='DELETE')demoMemories[c.id]=[];data={ok:true};}
    else if(suffix.endsWith('/uploads')&&method==='GET')data={files:[]};
    else return new Response(JSON.stringify({error:'Preview mode: files, computers and connections are disabled.'}),{status:400});
  }
  return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
};
function api(url,options){return fetch(url,options).then(async r=>{var data=await r.json();if(!r.ok)throw new Error(data.error);return data;});}
`;
const styles = [...UI_HTML.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const html = `<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Company UI preview</title><style>${styles}\n#previewNotice{position:fixed;top:0;left:0;right:0;z-index:1000;padding:10px 20px;background:var(--card2);border-bottom:1px solid var(--border);color:var(--muted);font-size:12px}.company-page,.company-page.company-chat-active{padding-top:66px}</style></head><body><div id="previewNotice">Company UI preview · Demo data · No agents or external actions run</div><script>${demo}\n${FILE_UPLOAD_JS}\n${COWORK_JS}\n${COMPANY_JS}\n${COMPANY_CONNECTIONS_JS}\n${COMPANY_WALLETS_JS}\nopenCompanies();</script></body></html>`;
const output = path.resolve(process.env['GITU_UI_PREVIEW_OUTPUT'] ?? '.qa/company-preview.html');
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, html);
const server = createServer((req, res) => {
  if (req.url !== '/') { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'" });
  res.end(html);
});
server.listen(Number(process.env['GITU_UI_PREVIEW_PORT'] || 0), '127.0.0.1', () => console.log('Company demo preview: http://127.0.0.1:' + (server.address() as { port: number }).port + '/'));
process.on('SIGTERM', () => server.close());
