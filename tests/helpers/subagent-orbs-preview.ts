/** Isolated visual/interaction fixture; uses the shipped renderer and event adapter. */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { UI_HTML } from '../../src/server/ui.js';
import { SUBAGENT_JS } from '../../src/server/ui-subagents.js';
import { CHARACTERS_DIR, FONTS_DIR } from '../../src/server/static-assets.js';

function source(name: string) {
  const match = new RegExp('^( +)function ' + name + '\\(', 'm').exec(UI_HTML)!;
  const end = UI_HTML.indexOf('\n' + match[1] + '}', match.index);
  return UI_HTML.slice(match.index, end + match[1].length + 2);
}
const adapters = ['specialistPresence', 'upsertSpecialistCard', 'applySubagentState', 'attachSpecialistActivity'].map(source).join('\n');
const styles = UI_HTML.match(/<style>([\s\S]*?)<\/style>/)![1];
const html = `<!doctype html><html lang="en" data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gitu · Subagent activity</title><style>${styles}
  body { min-height:100vh; } .preview-shell { display:grid; grid-template-columns:220px minmax(0,1fr); min-height:100vh; }
  .preview-nav { padding:28px 22px; border-right:1px solid var(--border); background:var(--sidebar); }
  .preview-nav h2 { font-size:12px; letter-spacing:.04em; margin:0 0 34px; } .preview-nav p { color:var(--muted); font-size:12px; }
  .preview-main { padding:64px 40px; width:100%; max-width:860px; margin:0 auto; } .preview-message { font-size:15px; line-height:1.8; }
  .preview-message .meta { font-size:12px; color:var(--muted); margin-bottom:12px; } .preview-message p { margin:0 0 10px; }
  .preview-main .subagent-presence { margin-left:0; margin-top:20px; } .preview-controls { display:flex; flex-wrap:wrap; gap:14px; margin-top:36px; color:var(--muted); font-size:12px; }
  .preview-controls button { padding:6px 8px; } .preview-footer { margin-top:38px; border-top:1px solid var(--border); padding-top:22px; font-size:12px; color:var(--muted); }
  @media(max-width:600px) { .preview-shell { grid-template-columns:minmax(0,1fr); } .preview-nav { display:none; } .preview-main { padding:36px 24px; } }
  </style></head><body><div class="preview-shell"><aside class="preview-nav"><h2>AGENT GITU</h2><p>New session</p><p>Workspace</p><p>Research competitors</p></aside><main class="preview-main"><div class="preview-message"><div class="meta">Agent Gitu</div><p>I’m comparing the competitors, checking their pricing, and reviewing the implementation.</p><p>The specialists are working on their assignments. Open an orb to see their progress.</p></div><div id="timeline"></div><div class="preview-controls"><button id="finish">Complete researcher</button><button id="tool">Use a tool</button><button id="update">Update progress</button><button id="replay">Replay history</button><button id="theme">Switch theme</button></div><div class="preview-footer">Interactive design preview · live statuses shown with fixture data</div></main></div><script>
  var S={sessions:{run:{nodes:{},replaying:false}}};
  function esc(value){return String(value == null ? '' : value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function icon(name){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="'+(name==='x'?'M6 6l12 12M18 6L6 18':'m9 5 7 7-7 7')+'"/></svg>';}
  ${SUBAGENT_JS}
  ${adapters}
  var start=new Date(Date.now()-42000).toISOString();
  var fixtures=[
    {id:'sub-market-1',name:'Market Researcher',task:'Research Kenyan POS competitors',phase:'working',current:'Comparing pricing pages',contextTokens:18400},
    {id:'sub-review-2',name:'Code Reviewer',task:'Review the checkout implementation',phase:'reasoning',current:'Considering edge cases',contextTokens:12700},
    {id:'sub-browser-3',name:'Browser Specialist',task:'Verify the checkout on mobile',phase:'tool',current:'Checking the mobile page',contextTokens:8600},
    {id:'sub-pricing-4',name:'Pricing Analyst',task:'Compare subscription tiers',phase:'waiting',current:'Waiting for the research result',contextTokens:6200},
    {id:'sub-data-5',name:'Data Analyst',task:'Read the private dataset',phase:'blocked',current:'Needs access to the dataset',contextTokens:5100},
    {id:'sub-test-6',name:'Test Engineer',task:'Verify required checks',phase:'complete',current:'All required checks passed',contextTokens:15400,finishedAt:new Date().toISOString()},
    {id:'sub-capture-7',name:'Capture Specialist',task:'Capture the external preview',phase:'failed',current:'The external preview could not be reached',contextTokens:3400,finishedAt:new Date().toISOString()},
    {id:'sub-design-8',name:'Designer',task:'Check spacing',phase:'idle',current:'No active assignment'},
    {id:'sub-access-9',name:'Accessibility Reviewer',task:'Review keyboard focus',phase:'complete',current:'Keyboard checks passed',contextTokens:4500,finishedAt:new Date().toISOString()}
  ];
  function publish(data){applySubagentState('run',function(host){document.getElementById('timeline').appendChild(host);},'subagent-state '+JSON.stringify(Object.assign({startedAt:start,at:new Date().toISOString()},data)));}
  fixtures.forEach(function(job){publish(Object.assign({activity:'Assignment started'},job));});
  document.getElementById('finish').onclick=function(){publish({id:'sub-market-1',name:'Market Researcher',phase:'complete',current:'Pricing comparison complete',finishedAt:new Date().toISOString(),activity:'Verified the pricing comparison.'});};
  document.getElementById('tool').onclick=function(){publish({id:'sub-market-1',name:'Market Researcher',phase:'tool',current:'Reading a pricing page',activity:'Read the competitor pricing page.'});};
  document.getElementById('update').onclick=function(){publish({id:'sub-market-1',name:'Market Researcher',current:'Comparing the annual plans',contextTokens:19200,activity:'Found annual plan pricing.'});};
  document.getElementById('replay').onclick=function(){var presence=S.sessions.run.nodes.subagentPresence;presence.view.dispose();presence.host.remove();S.sessions.run.nodes={};S.sessions.run.replaying=true;fixtures.forEach(publish);S.sessions.run.replaying=false;};
  document.getElementById('theme').onclick=function(){document.documentElement.dataset.theme=document.documentElement.dataset.theme==='light'?'dark':'light';};
  </script></body></html>`;
const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://localhost');
  const file = /^\/(characters|fonts)\/([\w.-]+)$/.exec(url.pathname);
  if (file) {
    try {
      const bytes = readFileSync(path.join(file[1] === 'characters' ? CHARACTERS_DIR : FONTS_DIR, file[2]));
      response.writeHead(200, { 'content-type': file[1] === 'characters' ? 'image/png' : 'font/woff2' });
      response.end(bytes);
    } catch { response.writeHead(404); response.end(); }
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(html);
});
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address !== 'string') console.log('Subagent preview: http://127.0.0.1:' + address.port);
});
