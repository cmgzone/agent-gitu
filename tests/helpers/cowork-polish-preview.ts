/** Isolated visual fixture: npx tsx tests/helpers/cowork-polish-preview.ts */
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { COWORK_JS } from '../../src/server/ui-cowork.js';
import { UI_HTML } from '../../src/server/ui.js';
import { VENDOR_THREE, VENDOR_THREE_CORE } from '../../src/server/static-assets.js';

const teammate = {
  id: 'maintainer', name: 'Mailcow Maintainers', tagline: 'Mail systems and delivery',
  systemPrompt: 'Diagnose carefully, explain findings clearly, and verify each change.',
  avatar: { color: '#8f80ff', shape: 'orb' }, useHostComputer: true,
};
const state = {
  agents: [teammate, { ...teammate, id: 'chief', name: 'Atlas', tagline: 'Chief of staff', chiefOfStaff: true }], skills: [],
  convs: [{ id: 'preview', kind: 'dm', title: teammate.name, memberIds: [teammate.id] }],
  threads: [{ id: 'launch-copy', title: 'Launch copy', topic: 'Landing page copy only' }, { id: 'visual-design', title: 'Visual design', topic: 'Geometric mascot ideas' }],
  active: 'preview', infoOpen: true, busy: true, working: teammate.name,
  computersChecked: Date.now(), computers: [], pendingFiles: [], missions: [], artifacts: [], requests: [],
  msgs: [
    { id: 'task', role: 'user', ts: '2026-09-26T08:00:00Z', text: 'Prepare the password-change broker and verify the integration.' },
    { id: 'reply', role: 'agent', agentId: teammate.id, agentName: teammate.name, ts: '2026-09-26T08:01:00Z', text: 'The broker is ready. I am verifying the client integration and reconnect behavior.' },
    ...Array.from({ length: 9 }, (_, i) => ({ id: `checkpoint-${i + 2}`, role: 'system', ts: new Date(Date.UTC(2026, 8, 26, 8, i + 2)).toISOString(), text: `${teammate.name} is continuing automatically after checkpoint ${i + 2}.` })),
  ],
  todos: [
    { id: 'verify', agentId: teammate.id, status: 'in_progress', text: 'Verifying password-change integration and reconnect behavior' },
    { id: 'client', agentId: teammate.id, status: 'pending', text: 'Verify that the client updates its saved credentials, reconnects automatically, and can send and receive messages after a password change.' },
    { id: 'report', agentId: 'chief', status: 'pending', text: 'Review password_change_reconnect_verification_with_a_long_identifier and summarize the verification evidence for the team.' },
  ],
  workHistory: [
    { id: 'step-1', agentId: teammate.id, agentName: teammate.name, tool: 'read_file', ok: true, ts: '2026-09-26T08:12:00Z', publicUpdate: 'Reviewed the existing client configuration and connection settings.' },
    { id: 'step-2', agentId: teammate.id, agentName: teammate.name, tool: 'apply_edit', ok: true, ts: '2026-09-26T08:13:00Z', publicUpdate: 'Updated the reconnect handler. I am checking the integration next.' },
    { id: 'step-3', agentId: teammate.id, agentName: teammate.name, tool: 'run_command', ok: false, ts: '2026-09-26T08:14:00Z', publicUpdate: 'Running the integration check against the updated reconnect handler.' },
    { id: 'step-4', agentId: teammate.id, agentName: teammate.name, tool: 'apply_edit', ok: true, ts: '2026-09-26T08:15:00Z', publicUpdate: 'The first check found a reconnect issue. I am correcting it before rerunning the check.' },
  ],
  progresses: [{ agentId: teammate.id, agentName: teammate.name, phase: 'working', tool: 'run_command', text: 'Rerunning the integration check after correcting the reconnect handler.' }],
};
const styles = UI_HTML.slice(UI_HTML.indexOf('<style>') + 7, UI_HTML.indexOf('</style>'));
function source(name: string) {
  const declaration = new RegExp('^( +)function ' + name + '\\(', 'm').exec(UI_HTML)!;
  const start = declaration.index;
  const end = UI_HTML.indexOf('\n' + declaration[1] + '}', start);
  return UI_HTML.slice(start, end + declaration[1].length + 2);
}
const reportSource = ['parseOutcome', 'readableSummary', 'reportMessageText', 'reportReplyHtml', 'appendSummary'].map(source).join('\n');
const avatarModule = UI_HTML.slice(UI_HTML.lastIndexOf('<script type="module">'), UI_HTML.lastIndexOf('</script>') + 9);
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Cowork polish preview</title><style>${styles}
  body { margin: 0; display: flex; flex-direction: column; height: 100dvh; overflow: hidden; }
  #view { display: flex; flex: 1; min-height: 0; width: 100%; }
</style></head><body class="cowork"><div id="view"></div><script>
const S = { active: 'cowork', sel: {}, models: [], cw: ${JSON.stringify(state)} };
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api = async (url, options) => {
  if (!url.endsWith('/computer')) return {};
  const agent = S.cw.agents.find(a => url.includes('/' + a.id + '/'));
  const action = options && options.body ? JSON.parse(options.body).action : '';
  if (action === 'use-private') agent.useHostComputer = false;
  const unavailable = action === 'start' || action === 'use-private';
  return { agent, computer: { agentId: agent.id, state: unavailable ? 'unavailable' : 'stopped', useHostComputer: agent.useHostComputer, error: unavailable ? 'Docker is not available in this visual fixture. Install/start Docker Desktop with Linux containers, then retry.' : undefined } };
}, toast = () => {}, shortDate = value => new Date(value).toLocaleString();
const toggleMobileNav = () => {}, stopStreams = () => {}, renderSidebar = () => {};
const themeToggleHtml = () => '', bindThemeToggle = () => {};
const loadModelCatalog = async () => {};
${COWORK_JS}
${reportSource}
cwLearnLoad = () => {}; cwLoad = () => { cwRenderRail(); cwRenderChat(); }; cwPoll = () => {};
const previewOptions = new URLSearchParams(location.search);
document.documentElement.dataset.theme = previewOptions.get('theme') === 'light' ? 'light' : 'dark';
if (previewOptions.get('character') === 'cube') S.cw.agents.forEach(function (agent) { agent.avatar.shape = 'cube'; });
if (previewOptions.get('character') === 'home-blob') S.cw.agents.forEach(function (agent) { agent.avatar.shape = 'home-blob'; });
if (previewOptions.get('thread') === 'launch-copy') S.cw.threadId = 'launch-copy';
if (previewOptions.get('activity') === 'task') { S.cw.progresses[0].tool = ''; S.cw.progresses[0].text = 'Continuing automatically (checkpoint 11)…'; }
openCowork();
if (location.pathname === '/panel') { S.cw.infoNarrowOpen = true; cwSyncPanels(); }
if (location.pathname === '/report') {
  cwStopPoll(); document.body.classList.remove('cowork'); S.active = 'run'; S.sessions = { preview: {} };
  document.getElementById('view').innerHTML = '<main style="max-width:900px;width:100%;margin:36px auto;padding:0 24px;overflow:auto"><h2>Main agent report</h2><div id="stream"></div></main>';
  appendSummary('preview', { report: { status: 'complete', summary: 'The password-change broker is ready.\\n\\n### What changed\\n- Added secure password updates.\\n- Preserved the current connection until the new credentials are verified.\\n\\n### Verification\\nThe integration checks passed, including reconnect behavior.\\n\\nUse the **Settings** page to change a password.', filesChanged: [], verification: [], remainingRisks: [], followUps: [] } });
}
function reportChecks() { return []; } function reportFiles() { return []; }
function verificationSection() { return ''; } function browserHighlight() { return ''; } function qualityMetricsHtml() { return ''; }
function devMode() { return false; } function stickScroll() {}
function setupCopyButton(button, text) { button.onclick = () => navigator.clipboard.writeText(text()); }
function reportText(report) { return report.summary; }
</script>${avatarModule}</body></html>`;
const server = createServer((request, response) => {
  const vendor = request.url === '/vendor/three.module.js' ? VENDOR_THREE : request.url === '/vendor/three.core.min.js' ? VENDOR_THREE_CORE : null;
  if (vendor) {
    response.writeHead(200, { 'content-type': 'text/javascript' });
    response.end(readFileSync(vendor));
    return;
  }
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
  response.end(html);
});
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  if (address && typeof address !== 'string') console.log(`Cowork polish preview: http://127.0.0.1:${address.port}`);
});
