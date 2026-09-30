/** Isolated server for the Android smoke test. Contains fictional data only. */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GituServer } from '../../src/server/server.js';
import { CoworkStore } from '../../src/cowork/store.js';
import { ScriptedMockLlm } from '../../src/llm/llm.js';

const root = mkdtempSync(path.join(tmpdir(), 'gitu-android-preview-'));
process.env['AGENT_GITU_HOME'] = root;
writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'Mobile preview' }));
writeFileSync(path.join(root, 'README.md'), '# Mobile preview\nA document for testing native file controls.');
const store = new CoworkStore();
const chief = store.saveAgent({
  name: 'mimi',
  systemPrompt: 'Coordinate the preview team.',
  tagline: 'Your chief of staff',
  chiefOfStaff: true,
  avatar: { color: '#8f80ff', shape: 'home-blob' },
});
store.saveAgent({ name: 'Forge', systemPrompt: 'Build the requested app.', tagline: 'Engineering', avatar: { color: '#65d1bd', shape: 'diamond' } });
const conversation = store.saveConversation({ kind: 'dm', memberIds: [chief.id] });
store.appendMessage(conversation.id, { role: 'user', text: 'Prepare our mobile launch.', via: 'web' });
store.appendMessage(conversation.id, {
  role: 'system',
  agentId: chief.id,
  agentName: chief.name,
  via: 'web',
  text: 'The mobile launch plan is ready.',
  checkpoint: { number: 2, accomplished: 'Prepared the mobile launch plan and assigned the design review.', next: 'Review the Android build with the team.' },
});
const server = new GituServer({ cwd: root, host: '0.0.0.0', port: 8423, accessKey: 'gitu-mobile-fixture-key-for-tests-only', autoInstallLsp: false, llm: new ScriptedMockLlm([]) });
await server.start();
console.log('Android fixture ready on port 8423 (fictional data).');
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    void server.stop().finally(() => process.exit(0));
  });
