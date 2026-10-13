// npm run build, then electron scripts/workspace-question-smoke.cjs
// Disposable owner, real HTTP gates, real Gitu file tools and Electron DOM.
// No live model, credentials, user runtime, or installed desktop is contacted.
const { app, BrowserWindow, ipcMain } = require('electron');
const { mkdtempSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const data = mkdtempSync(path.join(tmpdir(), 'gitu-workspace-electron-'));
mkdirSync(path.join(data, 'electron'));
app.setPath('userData', path.join(data, 'electron'));
process.env.AGENT_GITU_HOME = path.join(data, 'owner');
delete process.env.ELECTRON_RUN_AS_NODE;
let server;
async function waitFor(read, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await read();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Timed out waiting for the isolated question flow');
}
app.whenReady().then(async () => {
  const bundle = process.env.GITU_SMOKE_BUNDLE || path.join(__dirname, '..');
  const load = file => import(pathToFileURL(path.join(bundle, 'dist', file)).href);
  const [{ GituServer }, { ScriptedMockLlm }, { UI_HTML }] = await Promise.all([
    load('server/server.js'), load('llm/llm.js'), load('server/ui.js'),
  ]);
  const root = path.join(data, 'project'); mkdirSync(root);
  const a = path.join(root, 'a'), b = path.join(root, 'b'); mkdirSync(a); mkdirSync(b);
  writeFileSync(path.join(root, 'package.json'), '{"name":"workspace-electron-fixture"}');
  for (const folder of [a, b]) writeFileSync(path.join(folder, 'README.md'), 'Before\n');
  writeFileSync(path.join(root, 'check.cjs'), "require('node:assert/strict').equal(require('node:fs').readFileSync('a/README.md','utf8'),'After\\n');");
  const action = value => () => JSON.stringify({ action: value });
  const questions = [{ kind: 'workspace', question: 'Which writable workspace should hold the change?', options: [a, b, a, 'github', 'server', path.join(root, 'missing')] }];
  let continuedWithAnswer = false;
  const llm = new ScriptedMockLlm([
    action({ type: 'tool_call', tool: 'read_file', params: { path: 'a/README.md' }, reason: 'Inspect the first candidate', expected: 'Before' }),
    action({ type: 'tool_call', tool: 'read_file', params: { path: 'b/README.md' }, reason: 'Inspect the second candidate', expected: 'Before' }),
    action({ type: 'ask_user', questions }),
    (_turn, messages) => {
      continuedWithAnswer = messages.some(message => String(message.content).includes('User answered your clarifying questions:') && String(message.content).includes(a));
      return JSON.stringify({ action: { type: 'ask_user', questions } }); // resolved answer must be reused
    },
    action({ type: 'tool_call', tool: 'write_file', params: { path: 'a/README.md', content: 'After\n' }, reason: 'Apply the requested wording in the selected folder', expected: 'After' }),
    action({ type: 'tool_call', tool: 'run_command', params: { command: 'node check.cjs' }, reason: 'Verify selected folder only changed', expected: 'exit 0' }),
    action({ type: 'complete', summary: 'Updated the selected sample and verified it.' }),
    () => 'VERDICT: PASS\nFEEDBACK: The selected sample was updated and checked.',
  ]);
  server = new GituServer({ cwd: root, port: 0, llm, passwordRequired: false, autoInstallLsp: false });
  const base = `http://127.0.0.1:${await server.start()}`;
  const json = async (route, options) => {
    const response = await fetch(base + route, options);
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || String(response.status));
    return value;
  };
  ipcMain.handle('workspace-smoke-request', (_event, route, options) => {
    if (!/^\/api\/(answers\/[\w-]+|browse\?path=.*|runs\/[\w-]+\/folders)$/.test(route)) throw new Error(`Unexpected fixture route: ${route}`);
    return json(route, options);
  });
  const created = await json('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ goal: 'Update README.md in one of the two sample folders after the user chooses it, and verify it.', mode: 'agent', review: false }) });
  const readRun = () => json(`/api/runs/${created.runId}`);
  const pending = await waitFor(async () => { const run = await readRun(); return run.pendingQuestions ? run : undefined; });
  assert.deepEqual(pending.pendingQuestions.questions[0].options, [a, b]);
  const win = new BrowserWindow({ show: false, width: 1100, height: 800, webPreferences: {
    preload: path.join(__dirname, 'workspace-question-preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, partition: 'workspace-question-smoke',
  } });
  const execute = async code => {
    const result = await win.webContents.executeJavaScript(`(async () => { try { return { ok: true, value: await (${code}) }; } catch (error) { return { ok: false, error: error.message, stack: error.stack }; } })()`);
    if (!result.ok) {
      writeFileSync(path.join(data, 'question-failure.png'), (await win.webContents.capturePage()).toPNG());
      throw new Error(`${result.error}\n${result.stack}\nFixture: ${data}`);
    }
    return result.value;
  };
  const html = UI_HTML.replace('  boot();', `
    connect = function() {}; pollRun = function() {};
    window.workspaceSmoke = { S, openRun, renderQuestions, setApi: function(fn) { api = fn; } };
  `).replace(/<script type="module">[\s\S]*?<\/script>/g, '');
  await win.webContents.session.protocol.handle('http', request => {
    if (!request.url.startsWith(base + '/')) return new Response('Outside isolated fixture', { status: 403 });
    if (request.url === base + '/workspace-question-smoke') return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    return fetch(request.url);
  });
  await win.loadURL(base + '/workspace-question-smoke');
  const view = await execute(String.raw`(async () => {
    const h = window.workspaceSmoke;
    h.setApi((route, options) => /\/api\/(answers\/|browse\?|runs\/[\w-]+\/folders)/.test(route)
      ? window.workspaceSmokeApi.request(route, options) : Promise.resolve({ providers: [], maxFileBytes: null }));
    h.S.active = ${JSON.stringify(created.runId)};
    h.S.settings.projectPath = ${JSON.stringify(root)};
    h.S.project = {name:'Sample workspace',repoRoot:${JSON.stringify(root)}};
    h.S.sessions[h.S.active] = { session: ${JSON.stringify(pending)}, taggedFolders: [], writableFolders: [], events: [], ledger: null, side: 'state', nodes: {}, pendingFiles: [] };
    document.querySelector('#startupCover').hidden = true;
    document.querySelector('.shell').inert = false;
    h.openRun(h.S.active);
    h.renderQuestions(h.S.active, ${JSON.stringify(pending)});
    const card = document.querySelector('.qcard');
    if (!card || card.textContent.includes('github') || card.textContent.includes('server')) throw new Error('Irrelevant options leaked into the real DOM');
    if (card.getBoundingClientRect().width === 0 || card.getBoundingClientRect().height === 0) throw new Error('The question card is not visible');
    const labels = Array.from(card.querySelectorAll('.opt')).map(button => button.textContent);
    if (labels.length !== 2 || new Set(labels).size !== 2) throw new Error('Invalid/duplicate folder choices');
    const details = card.querySelector('.meta').textContent;
    if (!details.includes('does not grant')) throw new Error('Access explanation missing');
    card.querySelector('[data-workspace-controls]').click();
    if (document.querySelector('#browseModal').hidden) throw new Error('Folder controls did not open');
    document.querySelector('#browseModal').hidden = true;
    return { labels, detail: details, cardHeading: card.querySelector('h3').textContent };
  })()`);
  // Resize the hidden fixture to produce a fresh compositor frame before capture.
  win.setSize(1102, 800);
  await new Promise(resolve => setTimeout(resolve, 200));
  await execute(`(() => {
    const button = document.querySelector('.qcard .opt'); button.scrollIntoView({block:'center'});
    const rect = button.getBoundingClientRect();
    if (!button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))) throw new Error('Desktop folder choice is covered');
  })()`);
  writeFileSync(path.join(data, 'question-desktop.png'), (await win.webContents.capturePage()).toPNG());
  win.setSize(390, 800);
  await new Promise(resolve => setTimeout(resolve, 100));
  const choicePoint = await execute(`(() => {
    const card = document.querySelector('.qcard');
    if (card.scrollWidth > card.clientWidth + 1) throw new Error('Question choices overflow at narrow width');
    const button = card.querySelector('.opt'); button.scrollIntoView({block:'center'});
    const rect = button.getBoundingClientRect(), x = Math.round(rect.x + rect.width / 2), y = Math.round(rect.y + rect.height / 2);
    if (!button.contains(document.elementFromPoint(x,y))) throw new Error('The folder choice is covered or cannot receive a click');
    return {x,y};
  })()`);
  const click = point => {
    win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point });
    win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point });
  };
  win.webContents.focus();
  click(choicePoint);
  await new Promise(resolve => setTimeout(resolve, 200));
  const sendPoint = await execute(`(() => {
    if (!document.querySelector('.qcard .opt.sel')) throw new Error('Physical folder click did not select the option');
    const button = document.querySelector('#qSend'); button.scrollIntoView({block:'center'});
    const rect = button.getBoundingClientRect(), x = Math.round(rect.x + rect.width / 2), y = Math.round(rect.y + rect.height / 2);
    if (!button.contains(document.elementFromPoint(x,y))) throw new Error('The answer button is covered');
    return {x,y};
  })()`);
  click(sendPoint);
  writeFileSync(path.join(data, 'question-narrow.png'), (await win.webContents.capturePage()).toPNG());
  const finished = await waitFor(async () => { const run = await readRun(); return run.status !== 'running' ? run : undefined; });
  assert.equal(finished.status, 'completed', JSON.stringify(finished));
  assert.equal(finished.taskId, pending.taskId);
  assert.equal(readFileSync(path.join(a, 'README.md'), 'utf8'), 'After\n');
  assert.equal(readFileSync(path.join(b, 'README.md'), 'utf8'), 'Before\n');
  assert.equal(finished.pendingQuestions, undefined);
  assert.ok(continuedWithAnswer);
  await execute(`(() => {
    const h = window.workspaceSmoke, id = ${JSON.stringify(created.runId)};
    h.S.sessions[id].session = ${JSON.stringify(finished)};
    h.renderQuestions(id, ${JSON.stringify(finished)});
    if (document.querySelector('.qcard')) throw new Error('Answered question remained visible');
  })()`);
  console.log(JSON.stringify({ passed: true, checks: ['verified candidate paths', 'invalid and duplicate choice rejection', 'Electron question DOM', 'narrow window containment', 'access explanation', 'folder controls', 'real answer HTTP endpoint', 'no repeated question', 'answered card removed', 'same task continued', 'file edit and command verification', 'other folder preserved'], view, fixture: data }));
  win.destroy();
  await server.stop();
  app.exit(0);
}).catch(async error => { console.error(error); if (server) await server.stop(); app.exit(1); });
setTimeout(() => { console.error('Workspace question Electron check timed out'); app.exit(1); }, 90000).unref();
