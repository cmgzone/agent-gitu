/** Manual UI regression fixture: npx tsx tests/helpers/cowork-live-preview.ts */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { HermesServer } from '../../src/server/server.js';
import { CoworkStore } from '../../src/cowork/store.js';
import type { LlmClient, LlmMessage } from '../../src/llm/llm.js';

process.env.AGENT_GITU_HOME = mkdtempSync(path.join(tmpdir(), 'gitu-cowork-preview-'));
const store = new CoworkStore();
const chief = store.saveAgent({ name: 'Mira', systemPrompt: 'Coordinate the team.', chiefOfStaff: true, useHostComputer: true, allowShell: true, allowWrites: true });
const writer = store.saveAgent({ name: 'Writer', systemPrompt: 'Write concise reports.' });
store.saveAgent({ name: 'Reviewer', systemPrompt: 'Review the finished work.' });
const conversation = store.saveConversation({ kind: 'group', title: 'Cowork live check', memberIds: [chief.id, writer.id], chiefId: chief.id });
const artifact = store.addArtifact({ conversationId: conversation.id, agentId: writer.id, name: 'launch-brief.md', mime: 'text/markdown', dataBase64: Buffer.from('# Launch brief\n\nReady for review.').toString('base64') });
store.appendMessage(conversation.id, { role: 'agent', agentId: writer.id, agentName: writer.name, text: 'The launch brief is ready to review.', via: 'web', artifactIds: [artifact.id] });
store.addTodo({ conversationId: conversation.id, agentId: writer.id, text: 'Review launch brief with the team' });
store.addRequest({ conversationId: conversation.id, agentId: chief.id, kind: 'permission', title: 'Allow host computer', detail: 'Use the Agent Gitu workspace directly for the release build.', permission: 'host' });
store.addRequest({ conversationId: conversation.id, agentId: writer.id, kind: 'question', title: 'Which launch region?', detail: 'Pick the first region for the announcement.', options: ['Africa', 'Europe', 'Global'] });
store.addRequest({ conversationId: conversation.id, agentId: writer.id, kind: 'recommendation', title: 'Publish a PDF copy', detail: 'A PDF is easier to share with the launch team.' });
function answer(messages: LlmMessage[]) {
  const identity = String(messages[0]?.content);
  const latest = String(messages.at(-1)?.content);
  if (identity.includes('AUTONOMOUS MISSION')) return 'The requested report is complete. {"status":"done","progress":"created and verified the report","criteriaMet":[true],"result":"The report is ready and verified."}';
  if (identity.startsWith('You are "Scout"')) return 'I am Scout. I can now participate in this group and share my findings with the team.';
  if (latest.includes('Synthesize the team findings')) return 'Scout is part of the team and has reported back. The roster updated while we worked.';
  if (latest.includes('TOOL RESULT team_manage')) return 'The new teammate is ready. @Scout, please report back to the group.';
  return 'I am creating a research teammate for this group. <tool>{"name":"team_manage","params":{"action":"create","name":"Scout","instructions":"Research and report findings."}}</tool>';
}
const llm: LlmClient = {
  name: 'cowork-preview',
  complete: async messages => answer(messages),
  completeStream: async (messages, options, delta) => {
    const text = answer(messages);
    for (const part of text.match(/.{1,5}/gs) ?? []) {
      options.signal?.throwIfAborted();
      delta(part);
      await new Promise(resolve => setTimeout(resolve, 180));
    }
    return text;
  },
};
const server = new HermesServer({ cwd: path.join(process.env.AGENT_GITU_HOME, 'Workspace'), port: 0, llm });
console.log(`Cowork preview: http://127.0.0.1:${await server.start()}`);
const autonomy = setInterval(() => (server as unknown as { coworkAutonomyTick: () => void }).coworkAutonomyTick(), 500);
process.on('SIGINT', () => { clearInterval(autonomy); void server.stop().then(() => process.exit(0)); });
