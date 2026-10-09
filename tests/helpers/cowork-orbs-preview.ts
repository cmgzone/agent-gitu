/** Cowork integration preview, using its shipped transcript and shared orbs. */
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

const now = Date.now(), at = (seconds: number) => new Date(now + seconds * 1000).toISOString();
const agent = { id: 'atlas', name: 'Atlas', tagline: 'Software engineer', systemPrompt: 'Build and verify the requested work.',
  avatar: { color: '#257ad8', shape: 'dot-blue' }, useHostComputer: true, skills: [], allowShell: true, allowWrites: true };
const statuses = ['running', 'running', 'running', 'starting', 'blocked', 'completed', 'failed', 'terminated', 'completed'];
const phases = ['working', 'reasoning', 'tool', 'waiting', 'waiting', 'working', 'working', 'working', 'working'];
const names = ['Market researcher', 'Design reviewer', 'Integration tester', 'Copy editor', 'Browser reviewer', 'Repository scout', 'Link checker', 'Asset worker', 'Accessibility reviewer'];
const nodes = names.map((role, i) => ({ id: 'cw-worker-' + i, parentAgentId: agent.id, rootAgentId: agent.id, depth: 2, role,
  objective: ['Research Kenyan POS competitors', 'Review the mobile layout', 'Verify the client integration'][i % 3],
  status: statuses[i], createdAt: at(-55 + i), startedAt: at(-50 + i), ...(i > 4 ? { finishedAt: at(-8 + i) } : {}),
  spend: { costUsd: 0, turns: 2 }, children: [],
  activity: { phase: phases[i], current: ['Comparing pricing pages', 'Reviewing spacing and contrast', 'Running the integration check'][i % 3], contextTokens: 18400 + i * 900,
    entries: [{ seq: 1, at: at(-40), text: 'Reviewed the assignment.' }, { seq: 2, at: at(-20), text: 'Checked the relevant project information.' }] } }));
const state = { agents: [agent], convs: [{ id: 'preview', kind: 'dm', title: 'Atlas', memberIds: [agent.id] }], skills: [], active: 'preview',
  infoOpen: false, busy: true, working: 'Atlas', computersChecked: now, computers: [], missions: [], artifacts: [], requests: [], todos: [], threads: [],
  msgs: [{ id: 'request', role: 'user', ts: at(-60), text: 'Prepare the launch and verify it with your workers.' },
    { id: 'parent', role: 'agent', agentId: agent.id, agentName: 'Atlas', ts: at(-58), text: 'I am coordinating the launch work. You can follow each worker below and open its activity trace.' }],
  subAgents: { nodes, totals: { active: 4, blocked: 1, completed: 2, failed: 1, terminated: 1, orphaned: 0, spendUsd: 0 } },
  progresses: nodes.slice(0, 3).map(node => ({ agentId: node.id, agentName: node.role, phase: 'thinking', text: 'Working on the assignment…' })),
};
const styles = UI_HTML.match(/<style>([\s\S]*?)<\/style>/)![1];
const html = `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cowork · Subagent rings</title><style>${styles}
body{margin:0;display:flex;flex-direction:column;height:100dvh;overflow:hidden}#view{display:flex;flex:1;min-height:0;width:100%}.preview-controls{display:flex;justify-content:center;gap:18px;flex-wrap:wrap;padding:10px;font-size:12px;border-top:1px solid var(--border)}.preview-controls button{padding:3px;color:var(--muted)}.preview-blink .cw-blink-lid{animation:none;clip-path:inset(0)}
</style></head><body><div id="view"></div><div class="preview-controls" aria-label="Preview controls"><span>Sample Cowork workers</span><button id="tool">Use a tool</button><button id="complete">Complete researcher</button><button id="blink">Preview blink</button><button id="replay">Replay</button><button id="theme">Switch theme</button></div><script>
const S={active:'cowork',sel:{},models:[],cw:${JSON.stringify(state)}};
const $=id=>document.getElementById(id),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=async()=>({}),toast=()=>{},shortDate=value=>new Date(value).toLocaleString();
const toggleMobileNav=()=>{},stopStreams=()=>{},renderSidebar=()=>{},themeToggleHtml=()=>'',bindThemeToggle=()=>{},loadModelCatalog=async()=>{};
${COWORK_JS}
${CONNECTED_APPS_JS}
${COWORK_GALLERY_JS}
${COWORK_PROFILE_JS}
const icon=name=>cwIcon(name==='x'?'close':name);
${SUBAGENT_JS}
cwLearnLoad=()=>{};cwLoad=()=>{cwRenderRail();cwRenderChat()};cwPoll=()=>{};
openCowork();
cwRenderTyping();
$('tool').onclick=()=>{const node=S.cw.subAgents.nodes[0];node.activity.phase='tool';node.activity.current='Checking the competitor pricing page';node.activity.entries.push({seq:node.activity.entries.at(-1).seq+1,at:new Date().toISOString(),text:'Using web fetch.'});cwRenderProgress()};
$('complete').onclick=()=>{const node=S.cw.subAgents.nodes[0];node.status='completed';node.finishedAt=new Date().toISOString();cwRenderProgress()};
$('replay').onclick=()=>{cwDisposeSubagentOrbs();cwRenderChat()};
$('blink').onclick=()=>{document.body.classList.toggle('preview-blink')};
$('theme').onclick=()=>{document.documentElement.dataset.theme=document.documentElement.dataset.theme==='light'?'dark':'light'};
</script></body></html>`;
const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://localhost');
  const file = /^\/(characters|fonts)\/([\w.-]+)$/.exec(url.pathname);
  if (file) {
    try {
      const bytes = readFileSync(path.join(file[1] === 'characters' ? CHARACTERS_DIR : FONTS_DIR, file[2]));
      response.writeHead(200, { 'content-type': file[1] === 'characters' ? 'image/png' : 'font/woff2' }); response.end(bytes);
    } catch { response.writeHead(404); response.end(); }
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); response.end(html);
});
server.listen(Number(process.env.GITU_PREVIEW_PORT) || 0, '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address !== 'string') console.log('Cowork subagent preview: http://127.0.0.1:' + address.port);
});
