import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FcmPushSender, MobilePush, type PushNotice, type PushSender } from '../src/server/mobile-push.js';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import type { CoworkStore } from '../src/cowork/store.js';
import { GituApi } from '../apps/mobile/src/gitu/client.js';

const firebase = vi.hoisted(() => ({ send: vi.fn(async () => 'message-id'), initializeApp: vi.fn(() => ({ name: 'fixture' })), deleteApp: vi.fn(), cert: vi.fn(() => 'fixture-cert') }));
vi.mock('firebase-admin/app', () => ({ initializeApp: firebase.initializeApp, applicationDefault: () => 'fixture-server-credential', deleteApp: firebase.deleteApp, cert: firebase.cert }));
vi.mock('firebase-admin/messaging', () => ({ getMessaging: () => ({ send: firebase.send }) }));

const deviceId = 'fixture-device-00000001',
  token = 'fixture-fcm-token-0000000000000000000000000';
const notice = (id = 'notice-1'): PushNotice => ({ id, at: Date.now(), kind: 'completed', target: 'run', targetId: 'run-1' });
let root: string;
const servers: GituServer[] = [];
beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'gitu-push-'));
  vi.stubEnv('AGENT_GITU_HOME', root);
  vi.stubEnv('AGENT_GITU_SECRETS_KEY', 'a'.repeat(64));
  vi.stubEnv('AGENT_GITU_FCM_PROJECT_ID', '');
  vi.clearAllMocks();
});
afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop();
  vi.unstubAllEnvs();
});
const sender = () => ({ send: vi.fn<PushSender['send']>(async () => {}) });

describe('FCM device registry', () => {
  it('encrypts tokens, scopes them to the owner, and persists duplicate suppression', async () => {
    const transport = sender();
    let owner = 'owner-a';
    const push = new MobilePush(root, () => owner, transport);
    const status = push.register(deviceId, token);
    expect(status).toMatchObject({ available: true, enabled: true });
    expect(JSON.stringify(status)).not.toContain(token);
    expect(readFileSync(path.join(root, 'mobile-push.json'), 'utf8')).not.toContain(token);
    push.notify(notice());
    push.notify(notice());
    await push.drain();
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(transport.send.mock.calls[0]?.[0]).toBe(token);
    const restarted = new MobilePush(root, () => owner, transport);
    restarted.notify(notice());
    await restarted.drain();
    expect(transport.send).toHaveBeenCalledTimes(1);
    owner = 'owner-b';
    expect(restarted.status(deviceId).enabled).toBe(false);
    restarted.notify(notice('another'));
    await restarted.drain();
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('refreshes tokens, honors revocation before queued work, and ignores pre-registration history', async () => {
    const transport = sender(),
      push = new MobilePush(root, () => 'owner', transport);
    push.register(deviceId, token);
    push.notify({ ...notice('historical'), at: Date.now() - 60_000 });
    await push.drain();
    expect(transport.send).not.toHaveBeenCalled();
    push.register(deviceId, token + '-new');
    push.notify(notice());
    await push.drain();
    expect(transport.send.mock.calls[0]?.[0]).toBe(token + '-new');
    push.notify(notice('revoked'));
    push.unregister(deviceId);
    await push.drain();
    expect(transport.send).toHaveBeenCalledTimes(1);
  });

  it('removes unregistered FCM tokens and keeps provider errors out of caller-visible failures', async () => {
    const transport = sender(),
      push = new MobilePush(root, () => 'owner', transport);
    transport.send.mockRejectedValue(Object.assign(new Error('private provider text ' + token), { code: 'messaging/registration-token-not-registered' }));
    push.register(deviceId, token);
    await expect(push.test(deviceId)).rejects.toThrow('The test notification could not be sent');
    expect(push.status(deviceId).enabled).toBe(false);
  });

  it('validates registrations and requires server configuration', () => {
    const push = new MobilePush(root, () => 'owner', sender());
    expect(() => push.register('../outside', token)).toThrow();
    expect(() => push.register(deviceId, 'invalid\nheader')).toThrow();
    expect(() => new MobilePush(root, () => 'owner').register(deviceId, token)).toThrow(/configure Firebase/);
  });

  it('sends a private generic Android notification through the Admin SDK', async () => {
    const push = new FcmPushSender('fixture-project');
    await push.send(token, 'workspace-fixture', notice());
    expect(firebase.send).toHaveBeenCalledWith(
      expect.objectContaining({
        token,
        notification: { title: 'Agent Gitu', body: 'Your task is complete.' },
        data: { workspaceId: 'workspace-fixture', target: 'run', targetId: 'run-1' },
        android: expect.objectContaining({ priority: 'high', notification: expect.objectContaining({ channelId: 'gitu-workspace', visibility: 'private' }) }),
      }),
    );
    await push.close();
    expect(firebase.deleteApp).toHaveBeenCalledTimes(1);
  });

  it('sends an Android notification with teammate title, message hint, and threadId through the Admin SDK', async () => {
    const push = new FcmPushSender('fixture-project');
    await push.send(token, 'workspace-fixture', {
      ...notice(),
      kind: 'reply',
      target: 'cowork',
      targetId: 'chat-1',
      threadId: 'topic-1',
      title: 'Atlas',
      body: 'I have prepared the plan for review.',
    });
    expect(firebase.send).toHaveBeenCalledWith(
      expect.objectContaining({
        token,
        notification: { title: 'Atlas', body: 'I have prepared the plan for review.' },
        data: { workspaceId: 'workspace-fixture', target: 'cowork', targetId: 'chat-1', threadId: 'topic-1' },
        android: expect.objectContaining({ priority: 'high', notification: expect.objectContaining({ channelId: 'gitu-workspace', visibility: 'private' }) }),
      }),
    );
    await push.close();
  });
});

describe('authenticated Android push API and event hooks', () => {
  it('requires sign-in and same-origin JSON, delivers background events, and unregisters a phone', async () => {
    const transport = sender(),
      password = 'Disposable notification passphrase!',
      email = 'owner@example.com';
    const key = 'gitu-push-fixture-access-key-000000000';
    const project = mkdtempSync(path.join(tmpdir(), 'gitu-push-project-'));
    writeFileSync(path.join(project, 'package.json'), '{"name":"push-fixture"}');
    const server = new GituServer({ cwd: project, port: 0, accessKey: key, pushSender: transport, autoInstallLsp: false, llm: new ScriptedMockLlm([() => 'Hello.']) });
    servers.push(server);
    const base = 'http://127.0.0.1:' + (await server.start());
    const post = (url: string, body: object, cookie = '', origin = base, method = 'POST') =>
      fetch(base + url, { method, headers: { cookie, origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await post('/api/mobile/push', { deviceId, token })).status).toBe(401);
    await post('/api/auth/register', { name: 'Owner', email, password });
    const login = await post('/api/auth/login', { email, password });
    const cookie = login.headers.get('set-cookie')!;
    expect((await post('/api/mobile/push', { deviceId, token }, cookie, 'https://evil.example')).status).toBe(403);
    expect((await post('/api/mobile/push', { deviceId, token: 'x'.repeat(9000) }, cookie)).status).toBe(400);
    expect((await post('/api/mobile/push', { deviceId, token }, cookie)).status).toBe(200);
    expect((await fetch(base + '/api/mobile/push?deviceId=' + deviceId, { headers: { cookie } })).status).toBe(200);
    expect((await post('/api/mobile/push/test', { deviceId }, cookie)).status).toBe(200);
    transport.send.mockClear();
    const hooks = server as unknown as { cowork(): CoworkStore; mobilePush: MobilePush };
    const store = hooks.cowork();
    const agent = store.saveAgent({ name: 'Fixture', systemPrompt: 'Fixture only' });
    const conversation = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    store.appendMessage(conversation.id, { role: 'agent', agentId: agent.id, agentName: agent.name, text: 'Private reply content', via: 'web' });
    store.addRequest({ conversationId: conversation.id, agentId: agent.id, kind: 'question', title: 'Private question', detail: 'Private detail', options: [] });
    await hooks.mobilePush.drain();
    const replyNotice = transport.send.mock.calls.find(([, , event]) => event.kind === 'reply')?.[2];
    const attentionNotice = transport.send.mock.calls.find(([, , event]) => event.kind === 'attention')?.[2];
    expect(replyNotice).toMatchObject({
      kind: 'reply',
      target: 'cowork',
      targetId: conversation.id,
      title: 'Fixture',
      body: 'Private reply content',
    });
    expect(attentionNotice).toMatchObject({
      kind: 'attention',
      target: 'cowork',
      targetId: conversation.id,
      title: 'Fixture needs input',
      body: 'Private question',
    });
    const api = new GituApi(base, key, password, email);
    await api.connect();
    const { runId } = await api.start('Say hello', project, 'chat');
    await vi.waitFor(
      async () => {
        expect((await api.events(runId)).session.status).toBe('completed');
      },
      { timeout: 15_000 },
    );
    await hooks.mobilePush.drain();
    expect(transport.send.mock.calls.some(([, , event]) => event.kind === 'completed' && event.targetId === runId)).toBe(true);
    expect((await post('/api/mobile/push', { deviceId }, cookie, base, 'DELETE')).status).toBe(200);
    expect(hooks.mobilePush.status(deviceId).enabled).toBe(false);
    expect((await post('/api/mobile/push/test', { deviceId }, cookie)).status).toBe(400);
  }, 30_000);
});
