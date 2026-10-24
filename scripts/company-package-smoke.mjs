import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, mkdtempSync, rmSync, lstatSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceVersion = JSON.parse(readFileSync(path.join(workspace, 'package.json'), 'utf8')).version;
const stage = path.resolve(process.argv[2] ?? path.join(workspace, `release/windows-${sourceVersion}/win-unpacked`));
const app = path.join(stage, 'resources/app');
const version = JSON.parse(readFileSync(path.join(app, 'package.json'), 'utf8')).version;

if (process.env['GITU_PACKAGE_SMOKE_CHILD'] === '1') {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-package-smoke-'));
  process.env['AGENT_GITU_HOME'] = root;
  delete process.env['AGENT_GITU_PUBLIC_ORIGIN'];
  delete process.env['AGENT_GITU_TRUST_LOCAL_PROXY'];
  const { GituServer } = await import(pathToFileURL(path.join(app, 'dist/server/server.js')).href);
  const { ScriptedMockLlm } = await import(pathToFileURL(path.join(app, 'dist/llm/llm.js')).href);
  const { coworkNativeTools } = await import(pathToFileURL(path.join(app, 'dist/cowork/tools.js')).href);
  const { Script } = await import('node:vm');
  const { COMPANY_JS } = await import(pathToFileURL(path.join(app, 'dist/server/ui-companies.js')).href);
  const { CompanyOrganization } = await import(pathToFileURL(path.join(app, 'dist/company/organization.js')).href);
  const { CompanyBoardroom } = await import(pathToFileURL(path.join(app, 'dist/company/boardroom.js')).href);
  const { CompanyWorkflows } = await import(pathToFileURL(path.join(app, 'dist/company/workflows.js')).href);
  new Script(COMPANY_JS);
  const { HOME_WORKSPACE_JS } = await import(pathToFileURL(path.join(app, 'dist/server/ui-home.js')).href);
  const { UI_HTML } = await import(pathToFileURL(path.join(app, 'dist/server/ui.js')).href);
  new Script(HOME_WORKSPACE_JS);
  assert(HOME_WORKSPACE_JS.includes('home-sidebar-scroll'), 'Missing project sidebar');
  assert(UI_HTML.includes('homeNavigationHtml(cwProfileAgent())'), 'Home navigation is not bundled');
  assert(!UI_HTML.includes('<h2 id="homeProjectsTitle">Recent projects</h2>'), 'Old main-page projects remain');
  for (const [tool, action] of [
    ['company_boardroom', 'request'],
    ['company_workflow', 'propose'],
  ]) {
    assert(
      JSON.stringify(
        coworkNativeTools({ companyId: 'fixture', allowShell: false, allowWrites: false, allowConfig: false, chiefOfStaff: false }, false).find((t) => t.name === tool),
      ).includes(action),
    );
  }
  const server = new GituServer({ port: 0, host: '127.0.0.1', cwd: root, passwordRequired: false, llm: new ScriptedMockLlm([]), autoInstallLsp: false });
  try {
    const origin = 'http://127.0.0.1:' + (await server.start());
    const request = async (route, method = 'GET', body) => {
      const response = await fetch(origin + route, {
        method,
        headers: { origin, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      assert(response.ok, JSON.stringify(data));
      return data;
    };
    assert.equal((await fetch(origin + '/api/auth/status')).status, 200);
    const company = (await request('/api/companies', 'POST', { name: 'Package validation', purpose: 'Verify compiled coordination', monthlyBudgetUsd: null, maxFileBytes: null }))
      .company;
    const base = '/api/companies/' + company.id;
    const canonicalLead = (await request('/api/cowork/agents', 'POST', { name: 'Package lead', systemPrompt: 'Coordinate company work.', allowWrites: true, allowConfig: true })).agent;
    const worker = (await request('/api/cowork/agents', 'POST', { name: 'Package researcher', systemPrompt: 'Research evidence.' })).agent;
    const lead = (await request(base + '/lead', 'POST', { agentId: canonicalLead.id })).agent;
    assert.equal(lead.id, canonicalLead.id);
    await request(base + '/members', 'POST', { agentId: worker.id });
    const roster = (await request('/api/cowork/agents')).agents;
    assert.equal(roster.length, 2);
    assert(roster.every(agent => !agent.companyId));
    await request(base + '/memory', 'POST', { text: 'Package validation uses the shared Cowork team.' });
    assert(server.coworkMemoryFor(worker).includes('shared Cowork team'));
    server.companyScope.run({ id: company.id, version: company.directionVersion }, () => {
      const org = new CompanyOrganization(server.companies(), company.id, server.cowork());
      const actor = { kind: 'agent', agentId: lead.id };
      new CompanyBoardroom(org).request(actor, { title: 'Verify package discussion', reason: 'Check the packaged coordination tools.', agenda: ['Package checks'] });
      new CompanyWorkflows(org).propose(actor, {
        title: 'Package workflow',
        inputs: { type: 'object' },
        parallelism: 1,
        steps: [
          {
            id: 'verify',
            name: 'Verify',
            type: 'mission',
            agentId: lead.id,
            goal: 'Verify the assigned result',
            criteria: ['Return evidence'],
            dependsOn: [],
            bindings: {},
            inputSchema: { type: 'object' },
            outputSchema: { type: 'string' },
            tools: [],
            skills: [],
            connectionIds: [],
            accountIds: [],
            maxSessions: 1,
            maxAttempts: 1,
            timeoutMinutes: 5,
          },
        ],
      });
    });
    assert.deepEqual((await request(base + '/management')).management.counts, { requests: 1, meetings: 0, drafts: 1 });
    server.ensureCompanyCoordinator = () => {};
    server.companies().transition(company.id, 'running');
    const main = server.cowork(), conversation = main.saveConversation({ kind: 'dm', memberIds: [canonicalLead.id] });
    const manage = args => server.coworkCompanyManagement(canonicalLead, { id: company.id, ...args }, { agentId: canonicalLead.id, conversationId: conversation.id });
    const meetingRequest = await manage({ action: 'boardroom', input: { action: 'request', input: { title: 'Cowork packaged bridge', reason: 'Verify normal Cowork can coordinate this company.', agenda: ['Verify the bridge'] } } });
    assert(meetingRequest.ok, meetingRequest.output);
    let taskId;
    server.companyScope.run({ id: company.id, version: company.directionVersion }, () => {
      const scoped = server.cowork();
      const task = scoped.createMission({ conversationId: server.companies().get(company.id).conversationId, agentId: lead.id, goal: 'Verify packaged company answers', criteria: ['Return evidence'] });
      taskId = task.id;
      scoped.updateMission(task.id, { status: 'done', result: 'Packaged Cowork company lookup and automatic outcome memory are working.' });
    });
    const details = await manage({ action: 'inspect', section: 'tasks', resourceId: taskId });
    assert(details.ok && details.output.includes('automatic outcome memory'), details.output);
    const search = await manage({ action: 'search', query: 'packaged company answers' });
    assert(search.ok && search.output.includes(taskId), search.output);
    assert(server.coworkMemoryFor(worker).includes('automatic outcome memory'));
    console.log(JSON.stringify({ version, health: true, companyCoordination: true, coworkCompanyOperations: true, companyDetailLookup: true, automaticOutcomeMemory: true, sharedCoworkRoster: true, sharedCompanyMemory: true, compiledUi: true, runtime: process.versions }));
  } finally {
    await server.stop();
    assert(root.startsWith(path.join(os.tmpdir(), 'gitu-package-smoke-')));
    rmSync(root, { recursive: true, force: true });
  }
} else {
  assert.equal(version, JSON.parse(readFileSync(path.join(workspace, 'package.json'), 'utf8')).version);
  let filesChecked = 0;
  for (const folder of ['dist', 'desktop', 'assets']) {
    for (const relative of readdirSync(path.join(workspace, folder), { recursive: true })) {
      // Electron Builder deliberately omits declarations, source maps and dotfiles.
      if (/\.d\.ts$|\.map$/.test(relative) || path.basename(relative).startsWith('.')) continue;
      const source = path.join(workspace, folder, relative);
      if (!lstatSync(source).isFile()) continue;
      const bundled = path.join(app, folder, relative);
      assert(existsSync(bundled), 'Missing bundled file: ' + path.join(folder, relative));
      const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
      assert.equal(hash(bundled), hash(source), 'Bundled file differs: ' + path.join(folder, relative));
      filesChecked++;
    }
  }
  const executable = path.join(stage, 'Agent Gitu.exe');
  const child = spawnSync(executable, [fileURLToPath(import.meta.url), stage], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', GITU_PACKAGE_SMOKE_CHILD: '1' },
    windowsHide: true,
    encoding: 'utf8',
    timeout: 90000,
  });
  if (child.status !== 0) throw Error(child.stderr || child.stdout || String(child.error));
  console.log('Bundled source comparison passed: ' + filesChecked + ' files.');
  process.stdout.write(child.stdout);
}
