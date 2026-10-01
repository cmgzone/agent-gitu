import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';

it('delivers saved tool activity through the conversation API without raw output', async () => {
  const home = mkdtempSync(path.join(tmpdir(), 'cw-activity-http-'));
  const previousHome = process.env.AGENT_GITU_HOME;
  process.env.AGENT_GITU_HOME = home;
  const workspace = path.join(home, 'Workspace');
  mkdirSync(workspace, { recursive: true });
  writeFileSync(path.join(workspace, 'config.txt'), 'PRIVATE_TOOL_OUTPUT_PASSWORD=not-for-browser');
  const server = new GituServer({ passwordRequired: false, cwd: workspace, port: 0, coworkCompletionProtocol: 'legacy', llm: new ScriptedMockLlm([
    () => 'Checking the local configuration. <tool>{"name":"read_file","params":{"path":"config.txt"}}</tool>',
    () => 'The configuration check is complete.',
  ]) });
  try {
    const base = `http://127.0.0.1:${await server.start()}`;
    async function request(route: string, body?: unknown) {
      const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      expect(response.ok).toBe(true);
      return response.json();
    }
    const { agent } = await request('/api/cowork/agents', { name: 'Maintainer', systemPrompt: 'Inspect the configuration.', useHostComputer: true });
    const { conversation } = await request('/api/cowork/conversations', { kind: 'dm', memberIds: [agent.id] });
    const route = `/api/cowork/conversations/${conversation.id}/messages`;
    await request(route, { text: 'Check config.txt.' });
    await expect.poll(async () => (await request(route)).busy, { timeout: 10000 }).toBe(false);
    const snapshot = await request(route);
    expect(snapshot.workHistory).toMatchObject([{ agentId: agent.id, agentName: 'Maintainer', tool: 'read_file', ok: true, publicUpdate: 'Checking the local configuration.' }]);
    expect(JSON.stringify(snapshot.workHistory)).not.toContain('PRIVATE_TOOL_OUTPUT_PASSWORD');
    expect(snapshot.workHistory[0]).not.toHaveProperty('output');
    expect((await request(route)).workHistory).toEqual(snapshot.workHistory);
  } finally {
    await server.stop();
    if (previousHome === undefined) delete process.env.AGENT_GITU_HOME;
    else process.env.AGENT_GITU_HOME = previousHome;
    rmSync(home, { recursive: true, force: true });
  }
});
