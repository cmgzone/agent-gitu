import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { CoworkMemory } from '../src/cowork/memory.js';
import { CoworkStore } from '../src/cowork/store.js';
import {
  coworkNativeTools,
  coworkToolDocs,
  executeCoworkTool,
  type CoworkToolPerms,
  type CoworkToolScope,
} from '../src/cowork/tools.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import type { LlmClient } from '../src/llm/llm.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { MAX_LOCAL_LINK_HOPS } from '../src/peer/local-link-protocol.js';
import { GituServer } from '../src/server/server.js';
import { SkillStore } from '../src/skills/skills.js';
import type { ToolContext } from '../src/tools/tools.js';

interface TestNode {
  root: string;
  settingsDir: string;
  workspaceDir: string;
  sessionsDir: string;
  cwdDir: string;
  coworkPath: string;
  server: GituServer;
  origin: string;
  openedUrls: string[];
}

function makeTempDir(prefix: string): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

async function createNode(opts: {
  name: string;
  llm?: LlmClient;
  autoStartLink?: boolean;
}): Promise<TestNode> {
  const root = makeTempDir(`gitu-link-${opts.name}-`);
  const settingsDir = path.join(root, 'Settings');
  const workspaceDir = path.join(root, 'Workspace');
  const sessionsDir = path.join(root, 'Sessions');
  const cwdDir = path.join(root, 'Project');
  const coworkPath = path.join(root, 'Cowork', 'cowork.json');
  mkdirSync(settingsDir, { recursive: true });
  mkdirSync(workspaceDir, { recursive: true });
  mkdirSync(sessionsDir, { recursive: true });
  mkdirSync(cwdDir, { recursive: true });
  writeFileSync(path.join(cwdDir, 'package.json'), JSON.stringify({ name: `test-${opts.name}`, private: true }));

  const openedUrls: string[] = [];
  const server = new GituServer({
    host: '127.0.0.1',
    port: 0,
    cwd: cwdDir,
    passwordRequired: false,
    autoInstallLsp: false,
    llm: opts.llm,
    localLinkSettingsDir: settingsDir,
    localLinkWorkspaceDir: workspaceDir,
    localLinkForbiddenDirs: [settingsDir, sessionsDir],
    localLinkAutoStart: opts.autoStartLink ?? true,
    localLinkOpenUrl: async (url) => {
      openedUrls.push(url);
    },
    coworkStorePath: coworkPath,
  });

  const port = await server.start();
  return {
    root,
    settingsDir,
    workspaceDir,
    sessionsDir,
    cwdDir,
    coworkPath,
    server,
    origin: `http://127.0.0.1:${port}`,
    openedUrls,
  };
}

async function apiJson<T = Record<string, unknown>>(
  origin: string,
  route: string,
  init: RequestInit = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(`${origin}${route}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}

async function pairNodes(cloud: TestNode, local: TestNode, deviceName = 'Test PC'): Promise<string> {
  const codeRes = await apiJson<{ ok: boolean; bundle: string; code: string; cloudUrl: string }>(
    cloud.origin,
    '/api/local-link/pair-code',
    { method: 'POST', body: JSON.stringify({}) },
  );
  expect(codeRes.status).toBe(200);
  expect(codeRes.data.ok).toBe(true);
  expect(codeRes.data.bundle.startsWith('gitu-link://v1?')).toBe(true);

  const connRes = await apiJson<{
    ok: boolean;
    client: { configured: boolean; connected: boolean; peerId?: string };
  }>(local.origin, '/api/local-link/connect', {
    method: 'POST',
    body: JSON.stringify({ bundle: codeRes.data.bundle, deviceName }),
  });
  expect(connRes.status).toBe(200);
  expect(connRes.data.ok).toBe(true);
  expect(connRes.data.client.configured).toBe(true);
  expect(connRes.data.client.connected).toBe(true);
  return connRes.data.client.peerId!;
}

function makeCloudToolHarness(cloud: TestNode): {
  store: CoworkStore;
  ctx: ToolContext;
  scope: CoworkToolScope;
  perms: CoworkToolPerms;
  artifactIds: string[];
} {
  const store = new CoworkStore(cloud.coworkPath);
  const agent = store.saveAgent({ name: 'CloudAgent', systemPrompt: 'Cloud assistant.' });
  const conv = store.saveConversation({ kind: 'dm', memberIds: [agent.id] });
  const memory = new CoworkMemory(MemoryStore.forProject(cloud.workspaceDir), path.basename(cloud.workspaceDir));
  const ctx: ToolContext = {
    cwd: cloud.cwdDir,
    guard: ProjectGuard.detect(cloud.cwdDir, { allowUnmarked: true }),
    skills: SkillStore.forProject(cloud.cwdDir),
  };
  const artifactIds: string[] = [];
  const hub = (cloud.server as unknown as { localLinkHub: { asBridge(): CoworkToolScope['localLink'] } }).localLinkHub;
  const scope: CoworkToolScope = {
    store,
    agent,
    memory,
    conversationId: conv.id,
    artifactIds,
    localLink: hub.asBridge(),
  };
  const perms: CoworkToolPerms = {
    allowShell: false,
    allowWrites: true,
    allowConfig: false,
    chief: false,
    browser: false,
  };
  return { store, ctx, scope, perms, artifactIds };
}

describe('Direct Cloud <-> Local PC Link (Zero Pikpam)', () => {
  const cleanupNodes: TestNode[] = [];

  afterEach(async () => {
    for (const node of cleanupNodes.splice(0)) {
      await node.server.stop().catch(() => {});
      try {
        rmSync(node.root, { recursive: true, force: true });
      } catch {
        /* ignore transient locks in temp dir cleanup */
      }
    }
  }, 30_000);

  it('pairs directly without Pikpam, enforces Origin/token security, and passes live test ping', async () => {
    const cloud = await createNode({ name: 'cloud' });
    const local = await createNode({ name: 'local' });
    cleanupNodes.push(cloud, local);

    const codeRes = await apiJson<{ ok: boolean; code: string; bundle: string }>(
      cloud.origin,
      '/api/local-link/pair-code',
      { method: 'POST', body: JSON.stringify({}) },
    );
    expect(codeRes.status).toBe(200);
    expect(codeRes.data.bundle).toContain(encodeURIComponent(cloud.origin));

    // Reject cross-origin requests to /api/local-link/pair
    const originReject = await apiJson<{ ok: boolean; error: string }>(cloud.origin, '/api/local-link/pair', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
      body: JSON.stringify({ code: codeRes.data.code }),
    });
    expect(originReject.status).toBe(403);

    // Wrong code fails cleanly
    const wrongCode = await apiJson<{ ok: boolean; error: string }>(cloud.origin, '/api/local-link/pair', {
      method: 'POST',
      body: JSON.stringify({ code: '0000-0000-0000-0000' }),
    });
    expect(wrongCode.status).toBe(401);

    // Pair Local -> Cloud via /api/local-link/connect
    const connectRes = await apiJson<{ ok: boolean; client: { connected: boolean; peerId: string } }>(
      local.origin,
      '/api/local-link/connect',
      {
        method: 'POST',
        body: JSON.stringify({ bundle: codeRes.data.bundle, deviceName: 'My Laptop' }),
      },
    );
    expect(connectRes.status).toBe(200);
    expect(connectRes.data.ok).toBe(true);
    expect(connectRes.data.client.connected).toBe(true);

    // Code is single-use: second redemption fails
    const replay = await apiJson<{ ok: boolean }>(cloud.origin, '/api/local-link/pair', {
      method: 'POST',
      body: JSON.stringify({ code: codeRes.data.code }),
    });
    expect(replay.status).toBe(401);

    // Reject unauthenticated / Origin-bearing WS handshakes to /api/local-link/ws
    const wsUrl = cloud.origin.replace('http:', 'ws:') + '/api/local-link/ws';
    await expect(
      new Promise<number>((resolve) => {
        const ws = new WebSocket(wsUrl, { headers: { Authorization: 'Bearer invalid-token' } });
        ws.on('unexpected-response', (_req, res) => {
          resolve(res.statusCode ?? 0);
          ws.close();
        });
        ws.on('error', () => {});
      }),
    ).resolves.toBe(401);

    await expect(
      new Promise<number>((resolve) => {
        const ws = new WebSocket(wsUrl, {
          headers: { Origin: cloud.origin, Authorization: 'Bearer ' + 'a'.repeat(64) },
        });
        ws.on('unexpected-response', (_req, res) => {
          resolve(res.statusCode ?? 0);
          ws.close();
        });
        ws.on('error', () => {});
      }),
    ).resolves.toBe(401);

    // Live test ping from Cloud -> Local succeeds
    const testRes = await apiJson<{ ok: boolean; latencyMs: number; output: string }>(
      cloud.origin,
      '/api/local-link/test',
      { method: 'POST', body: JSON.stringify({ peerId: connectRes.data.client.peerId }) },
    );
    expect(testRes.status).toBe(200);
    expect(testRes.data.ok).toBe(true);
    expect(testRes.data.output).toContain('My Laptop');
  });

  it('executes Tier 1 local_pc actions, enforces policy gates, and creates real artifacts on pull_file', async () => {
    const cloud = await createNode({ name: 'cloud' });
    const local = await createNode({ name: 'local' });
    cleanupNodes.push(cloud, local);

    mkdirSync(path.join(local.workspaceDir, 'notes'), { recursive: true });
    writeFileSync(path.join(local.workspaceDir, 'notes', 'todo.txt'), 'Buy milk\nShip direct link\n');
    const extraFolder = path.join(local.root, 'ExtraDocs');
    mkdirSync(extraFolder, { recursive: true });
    writeFileSync(path.join(extraFolder, 'report.md'), '# Quarterly Report\nAll systems green.\n');

    await pairNodes(cloud, local, 'Dev Desktop');
    const { store, ctx, scope, perms, artifactIds } = makeCloudToolHarness(cloud);

    // status
    const statusRes = await executeCoworkTool(ctx, 'local_pc', { action: 'status' }, perms, scope);
    expect(statusRes.ok).toBe(true);
    expect(statusRes.output).toContain('Dev Desktop');

    // list_files roots + workspace read + search
    const rootsRes = await executeCoworkTool(ctx, 'local_pc', { action: 'list_files' }, perms, scope);
    expect(rootsRes.ok).toBe(true);
    expect(rootsRes.output).toContain('[workspace]');

    const readRes = await executeCoworkTool(ctx, 'local_pc', { action: 'read_file', path: 'notes/todo.txt' }, perms, scope);
    expect(readRes.ok).toBe(true);
    expect(readRes.output).toContain('Ship direct link');

    const searchRes = await executeCoworkTool(
      ctx,
      'local_pc',
      { action: 'search_files', pattern: 'direct link', path: 'notes' },
      perms,
      scope,
    );
    expect(searchRes.ok).toBe(true);
    expect(searchRes.output).toContain('todo.txt');

    // Add extra folder via policy PATCH and read from it
    const policyRes = await apiJson<{ ok: boolean; client: { sharedFolders: string[] } }>(
      local.origin,
      '/api/local-link/policy',
      { method: 'PATCH', body: JSON.stringify({ allowedFolders: [extraFolder] }) },
    );
    expect(policyRes.status).toBe(200);
    const extraRead = await executeCoworkTool(
      ctx,
      'local_pc',
      { action: 'read_file', path: path.join(extraFolder, 'report.md') },
      perms,
      scope,
    );
    expect(extraRead.ok).toBe(true);
    expect(extraRead.output).toContain('Quarterly Report');

    // pull_file creates a real artifact in Cloud CoworkStore without dumping base64
    const pullRes = await executeCoworkTool(
      ctx,
      'local_pc',
      { action: 'pull_file', path: 'notes/todo.txt' },
      perms,
      scope,
    );
    expect(pullRes.ok).toBe(true);
    expect(pullRes.output).toContain('Pulled todo.txt');
    expect(pullRes.output).toContain('Buy milk');
    expect(artifactIds).toHaveLength(1);
    const artifactPath = store.artifactPath(artifactIds[0]!);
    expect(artifactPath).toBeTruthy();
    expect(readFileSync(artifactPath!, 'utf8')).toContain('Ship direct link');

    // Writes blocked by default
    const blockedWrite = await executeCoworkTool(
      ctx,
      'local_pc',
      { action: 'write_file', path: 'notes/out.txt', content: 'denied' },
      perms,
      scope,
    );
    expect(blockedWrite.ok).toBe(false);
    expect(blockedWrite.output).toContain('allowWrites = false');

    // Commands blocked by default
    const blockedCmd = await executeCoworkTool(
      ctx,
      'local_pc',
      { action: 'run_command', command: 'node -e "console.log(123)"' },
      perms,
      scope,
    );
    expect(blockedCmd.ok).toBe(false);
    expect(blockedCmd.output).toContain('allowCommands = false');

    // Enable writes and commands
    await apiJson(local.origin, '/api/local-link/policy', {
      method: 'PATCH',
      body: JSON.stringify({ allowWrites: true, allowCommands: true }),
    });

    const writeRes = await executeCoworkTool(
      ctx,
      'local_pc',
      { action: 'write_file', path: 'notes/out.txt', content: 'hello from cloud' },
      perms,
      scope,
    );
    expect(writeRes.ok).toBe(true);
    expect(readFileSync(path.join(local.workspaceDir, 'notes', 'out.txt'), 'utf8')).toBe('hello from cloud');

    const dropRes = await executeCoworkTool(
      ctx,
      'local_pc',
      { action: 'drop_file', path: 'notes/dropped.bin', dataBase64: Buffer.from('binary-ok').toString('base64') },
      perms,
      scope,
    );
    expect(dropRes.ok).toBe(true);
    expect(readFileSync(path.join(local.workspaceDir, 'notes', 'dropped.bin'), 'utf8')).toBe('binary-ok');

    const cmdRes = await executeCoworkTool(
      ctx,
      'local_pc',
      { action: 'run_command', command: 'node -e "console.log(40 + 2)"' },
      perms,
      scope,
    );
    expect(cmdRes.ok).toBe(true);
    expect(cmdRes.output.trim()).toBe('42');

    // open_url validates scheme and honors allowOpenUrl
    const badScheme = await executeCoworkTool(
      ctx,
      'local_pc',
      { action: 'open_url', url: 'file:///C:/Windows/win.ini' },
      perms,
      scope,
    );
    expect(badScheme.ok).toBe(false);

    const openOk = await executeCoworkTool(
      ctx,
      'local_pc',
      { action: 'open_url', url: 'https://example.com/docs' },
      perms,
      scope,
    );
    expect(openOk.ok).toBe(true);
    expect(local.openedUrls).toEqual(['https://example.com/docs']);

    await apiJson(local.origin, '/api/local-link/policy', {
      method: 'PATCH',
      body: JSON.stringify({ allowOpenUrl: false }),
    });
    const openBlocked = await executeCoworkTool(
      ctx,
      'local_pc',
      { action: 'open_url', url: 'https://example.com/blocked' },
      perms,
      scope,
    );
    expect(openBlocked.ok).toBe(false);
  });

  it('blocks path traversal, unshared paths, settings access, and symlink escapes locally', async () => {
    const cloud = await createNode({ name: 'cloud' });
    const local = await createNode({ name: 'local' });
    cleanupNodes.push(cloud, local);

    writeFileSync(path.join(local.settingsDir, 'secret-keys.json'), '{"apiKey":"super-secret"}');
    const outsideDir = path.join(local.root, 'OutsidePrivate');
    mkdirSync(outsideDir, { recursive: true });
    writeFileSync(path.join(outsideDir, 'private.txt'), 'top secret');

    // Create a junction/symlink inside workspace pointing outside
    const linkDir = path.join(local.workspaceDir, 'escape-link');
    symlinkSync(outsideDir, linkDir, process.platform === 'win32' ? 'junction' : 'dir');

    await pairNodes(cloud, local);
    const { ctx, scope, perms } = makeCloudToolHarness(cloud);

    const traversal = await executeCoworkTool(
      ctx,
      'local_pc',
      { action: 'read_file', path: '../Settings/secret-keys.json' },
      perms,
      scope,
    );
    expect(traversal.ok).toBe(false);
    expect(traversal.output).not.toContain('super-secret');

    const directSettings = await executeCoworkTool(
      ctx,
      'local_pc',
      { action: 'pull_file', path: path.join(local.settingsDir, 'secret-keys.json') },
      perms,
      scope,
    );
    expect(directSettings.ok).toBe(false);

    const outsideRead = await executeCoworkTool(
      ctx,
      'local_pc',
      { action: 'read_file', path: path.join(outsideDir, 'private.txt') },
      perms,
      scope,
    );
    expect(outsideRead.ok).toBe(false);

    const symlinkEscape = await executeCoworkTool(
      ctx,
      'local_pc',
      { action: 'read_file', path: 'escape-link/private.txt' },
      perms,
      scope,
    );
    expect(symlinkEscape.ok).toBe(false);
    expect(symlinkEscape.output).not.toContain('top secret');
  });

  it('supports Tier 2 ask_local_agent handoff and enforces allowAgentChat + hop limit', async () => {
    const localLlm: LlmClient = {
      name: 'local-stub',
      complete: vi.fn(async (messages) => {
        const joined = messages.map((m) => String(m.content)).join('\n');
        expect(joined).toContain('Summarize local status');
        return 'Local agent checked everything: all good here.';
      }),
    };
    const cloud = await createNode({ name: 'cloud' });
    const local = await createNode({ name: 'local', llm: localLlm });
    cleanupNodes.push(cloud, local);

    const created = await apiJson<{ ok: boolean }>(local.origin, '/api/cowork/agents', {
      method: 'POST',
      body: JSON.stringify({
        name: 'LocalHelper',
        systemPrompt: 'You are on the local PC.',
        chiefOfStaff: true,
      }),
    });
    expect(created.status).toBe(200);
    expect(created.data.ok).toBe(true);

    await pairNodes(cloud, local, 'Home PC');
    const { ctx, scope, perms } = makeCloudToolHarness(cloud);

    const reply = await executeCoworkTool(
      ctx,
      'ask_local_agent',
      { prompt: 'Summarize local status' },
      perms,
      scope,
    );
    expect(reply.ok).toBe(true);
    expect(reply.output).toContain('Local agent checked everything: all good here.');

    // Hop limit stops loops
    const hub = (cloud.server as unknown as {
      localLinkHub: { request: NonNullable<CoworkToolScope['localLink']>['request'] };
    }).localLinkHub;
    const hopBlocked = await hub.request(
      'ask_local_agent',
      { prompt: 'Loop test' },
      { hopCount: MAX_LOCAL_LINK_HOPS },
    );
    expect(hopBlocked.ok).toBe(false);
    expect(hopBlocked.error).toContain('hop limit');

    // Policy disable blocks ask_local_agent
    await apiJson(local.origin, '/api/local-link/policy', {
      method: 'PATCH',
      body: JSON.stringify({ allowAgentChat: false }),
    });
    const chatBlocked = await executeCoworkTool(
      ctx,
      'ask_local_agent',
      { prompt: 'Should fail' },
      perms,
      scope,
    );
    expect(chatBlocked.ok).toBe(false);
    expect(chatBlocked.output).toContain('allowAgentChat = false');
  });

  it('handles offline peers, revocation (4001), and prompt/tool gating cleanly', async () => {
    const baseAgent = {
      allowShell: false,
      allowWrites: false,
      allowConfig: false,
      chiefOfStaff: false,
    };
    expect(coworkToolDocs(baseAgent, false, { includeLocalLink: false })).not.toContain('local_pc');
    expect(coworkNativeTools(baseAgent, false, { includeLocalLink: false }).map((t) => t.name)).not.toContain(
      'ask_local_agent',
    );
    expect(coworkToolDocs(baseAgent, false, { includeLocalLink: true })).toContain('local_pc');
    expect(coworkNativeTools(baseAgent, false, { includeLocalLink: true }).map((t) => t.name)).toContain(
      'ask_local_agent',
    );

    const cloud = await createNode({ name: 'cloud' });
    const local = await createNode({ name: 'local' });
    cleanupNodes.push(cloud, local);

    const peerId = await pairNodes(cloud, local, 'Office PC');
    const { ctx, scope, perms } = makeCloudToolHarness(cloud);

    // Revoking peer on Cloud disconnects Local with 4001 and halts reconnects
    const revokeRes = await apiJson<{ ok: boolean; removed: boolean; hub: { peers: unknown[] } }>(
      cloud.origin,
      `/api/local-link/peers/${encodeURIComponent(peerId)}`,
      { method: 'DELETE' },
    );
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.data.removed).toBe(true);
    expect(revokeRes.data.hub.peers).toHaveLength(0);

    await new Promise((r) => setTimeout(r, 150));
    const localStatus = await apiJson<{ client: { enabled: boolean; connected: boolean; lastError?: string } }>(
      local.origin,
      '/api/local-link/status',
    );
    expect(localStatus.data.client.connected).toBe(false);
    expect(localStatus.data.client.enabled).toBe(false);
    expect(localStatus.data.client.lastError).toContain('revoked');

    // Re-pair and test offline behavior when Local server stops
    await pairNodes(cloud, local, 'Office PC 2');
    await local.server.stop();
    await new Promise((r) => setTimeout(r, 100));

    const offlineRes = await executeCoworkTool(ctx, 'local_pc', { action: 'status' }, perms, scope);
    expect(offlineRes.ok).toBe(false);
    expect(offlineRes.output.toLowerCase()).toContain('offline');
  });
});
