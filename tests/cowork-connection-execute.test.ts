import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { CoworkStore } from '../src/cowork/store.js';
import { executeCoworkTool, type CoworkToolScope } from '../src/cowork/tools.js';
import type { ToolContext } from '../src/tools/tools.js';
import { updateWorkspaceSettings } from '../src/workspace/home.js';

const previousHome = process.env.AGENT_GITU_HOME;
const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  if (previousHome === undefined) delete process.env.AGENT_GITU_HOME; else process.env.AGENT_GITU_HOME = previousHome;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'gitu-connection-execute-')); roots.push(root); process.env.AGENT_GITU_HOME = root;
  updateWorkspaceSettings({ codingAccess: 'ask' });
  const store = new CoworkStore();
  const agent = store.saveAgent({ name: 'Manager', systemPrompt: 'Manage deployments.', allowWrites: true, allowShell: false, allowConfig: false, useHostComputer: false });
  const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
  const operation = { id: 'deploy-application', label: 'Deploy application', capability: 'deployments.write', method: 'POST', path: '/api/v1/deploy', risk: 'reversible-write' };
  const profile = { id: 'coolify', label: 'Coolify', baseUrl: 'https://coolify.example', operations: [operation] };
  const invoke = vi.fn(async () => ({ data: { deployment: 'fixture' } }));
  const scope = { store, agent, conversationId: conversation.id } as CoworkToolScope;
  const context = { connections: { get: () => profile, invoke } } as unknown as ToolContext;
  const permissions = { allowShell: false, allowWrites: true, allowConfig: false, chief: false, browser: false };
  const params = { connectionId: 'coolify', operationId: operation.id, query: { uuid: 'school-app' } };
  return { root, store, agent, conversation, operation, profile, invoke, params, run: (args = params) => executeCoworkTool(context, 'connection_execute', args, permissions, scope) };
}

it('reviews a saved deployment without crashing or granting a broader agent permission', async () => {
  const f = fixture();
  const result = await f.run();
  expect(result).toMatchObject({ ok: false }); expect(result.output).toContain('Waiting for approval');
  expect(result.output).not.toContain('Permission type is required');
  const [card] = f.store.requests(f.conversation.id);
  expect(card).toMatchObject({ kind: 'recommendation', status: 'open', title: 'Deploy application' });
  expect(card.permission).toBeUndefined(); expect(card.detail).toContain('school-app');
  await f.run(); expect(f.store.requests(f.conversation.id)).toHaveLength(1); expect(f.invoke).not.toHaveBeenCalled();
  f.store.resolveRequest(card.id, 'accepted', 'Deploy this application.');
  expect((await f.run()).ok).toBe(true);
  expect(f.invoke).toHaveBeenCalledWith('coolify', 'deploy-application', undefined, { uuid: 'school-app' }, undefined);
  expect(f.store.getAgent(f.agent.id)).toMatchObject({ allowShell: false, allowWrites: true, allowConfig: false, useHostComputer: false });
  expect((await f.run()).ok).toBe(false); expect(f.invoke).toHaveBeenCalledTimes(1);
});

it('honors dismissal and never executes the rejected deployment', async () => {
  const f = fixture(); await f.run(); const [card] = f.store.requests(f.conversation.id);
  f.store.resolveRequest(card.id, 'dismissed');
  expect((await f.run()).output).toContain('denied'); expect(f.invoke).not.toHaveBeenCalled();
});

it('binds acceptance to the application target and saved endpoint', async () => {
  const f = fixture(); await f.run(); const [card] = f.store.requests(f.conversation.id);
  f.store.resolveRequest(card.id, 'accepted');
  expect((await f.run({ ...f.params, query: { uuid: 'other-app' } })).ok).toBe(false);
  f.profile.baseUrl = 'https://different.example';
  expect((await f.run()).ok).toBe(false); expect(f.invoke).not.toHaveBeenCalled();
});

it('executes directly under saved full access and allows reads without a review', async () => {
  const f = fixture(); updateWorkspaceSettings({ codingAccess: 'full' });
  expect((await f.run()).ok).toBe(true); expect(f.store.requests(f.conversation.id)).toHaveLength(0);
  updateWorkspaceSettings({ codingAccess: 'ask' }); f.operation.risk = 'read'; f.operation.method = 'GET';
  expect((await f.run()).ok).toBe(true); expect(f.invoke).toHaveBeenCalledTimes(2);
});
