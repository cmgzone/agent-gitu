/** Local UI fixture. No real password, provider key, or OAuth account is used. */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GituServer } from '../../src/server/server.js';
import { AppAuth } from '../../src/server/app-auth.js';
import { CoworkStore } from '../../src/cowork/store.js';
import { ComposioConnections } from '../../src/connections/composio.js';
import { ensureGituHome } from '../../src/workspace/home.js';
import { ScriptedMockLlm } from '../../src/llm/llm.js';
process.env['AGENT_GITU_HOME'] = mkdtempSync(path.join(tmpdir(), 'gitu-connections-preview-'));
const home = ensureGituHome();
const auth = new AppAuth(path.join(home.settings, 'app-password.json'));
if (process.argv[3] === 'registered') await auth.setup('A disposable fixture passphrase!', { name: 'Fixture Owner', email: 'owner@example.com' });
auth.close();
const store = new CoworkStore();
const agent = store.saveAgent({ name: 'Mira', systemPrompt: 'Help the user.', chiefOfStaff: true });
const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
store.appendMessage(conversation.id, {
  role: 'agent',
  agentId: agent.id,
  agentName: agent.name,
  text: 'Choose the apps you want to connect from the Connections page.',
  via: 'web',
});
class PreviewConnections extends ComposioConnections {
  ready = true;
  override get configured() {
    return this.ready;
  }
  override async catalog(search = '') {
    return {
      services: ['Gmail', 'Google Drive', 'Slack', 'Notion', 'GitHub', 'Outlook', 'Google Calendar', 'HubSpot']
        .filter((name) => name.toLowerCase().includes(search.toLowerCase()))
        .map((name) => ({ name, slug: name.toLowerCase().replaceAll(' ', ''),
          logo: ['Gmail', 'Google Drive', 'Slack', 'GitHub'].includes(name) ? `https://cdn.jsdelivr.net/gh/ComposioHQ/open-logos@master/${name.toLowerCase().replaceAll(' ', '')}.svg` : undefined,
          status: name === 'Gmail' ? 'ACTIVE' : name === 'Slack' ? 'EXPIRED' : undefined })),
    };
  }
  override async accounts() {
    return [{ id: 'fixture-account', toolkit: 'gmail', status: 'ACTIVE', disabled: false }];
  }
  override async configure() {
    this.ready = true;
  }
  override async connect() {
    return { url: 'https://connect.composio.dev/fixture-preview-only' };
  }
  override async disconnect() {
    /* Fixture only. */
  }
}
const apps = new PreviewConnections(() => auth.userId);
const previewLlm = new ScriptedMockLlm([
  () => JSON.stringify({ action: { type: 'ask_user', questions: [{
    header: 'Product card style', question: 'What should the product cards look like?',
    options: [ { label: 'Larger images', description: 'Give product photos more space.' }, { label: 'Premium cards', description: 'Use an editorial layout.' }, 'Compact cards' ],
  }] } }),
  () => JSON.stringify({ action: { type: 'complete', summary: 'Received your product card preference.' } }),
]);
const server = new GituServer({ cwd: home.workspace, port: Number(process.argv[2] ?? 0), llm: previewLlm, connectedApps: apps });
console.log(`Connections UI fixture: http://127.0.0.1:${await server.start()}`);
process.on('SIGINT', () => {
  void server.stop().then(() => process.exit(0));
});
