import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConnectionRegistry, type ConnectionState } from '../src/connections/connections.js';
import { CONNECTION_CATALOG } from '../src/connections/catalog.js';
import { Gitu } from '../src/agent/gitu.js';
import type { LlmClient, LlmMessage, LlmTurnResult } from '../src/llm/llm.js';

/**
 * Regression suite for the global connection-recovery architecture:
 * MISSING_OPERATION !== INVALID_CONNECTION, for ALL providers (coolify,
 * github, vercel, fly) — not one special case. A valid saved connection must
 * never be re-asked for its credential merely because a new API operation is
 * needed; auth validity and operation availability are stored and evaluated
 * separately.
 */

const homes: string[] = [];
const dirs: string[] = [];
const previousHome = process.env.AGENT_GITU_HOME;
const originalFetch = globalThis.fetch;

function home(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-recovery-'));
  homes.push(root);
  process.env.AGENT_GITU_HOME = root;
  return root;
}

function project(name: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), `gitu-recovery-proj-${name}-`));
  dirs.push(dir);
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: `recovery-${name}` }));
  return dir;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (previousHome === undefined) delete process.env.AGENT_GITU_HOME;
  else process.env.AGENT_GITU_HOME = previousHome;
  for (const root of homes.splice(0)) rmSync(root, { recursive: true, force: true });
  for (const dir of dirs.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* temp cleanup */
    }
  }
});

function okResponse(body: unknown = {}, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Save a documented multi-provider connection with a credential and NO
 * operations beyond the validation read. */
function saveConnection(
  registry: ConnectionRegistry,
  overrides: Partial<{ id: string; provider: string; capabilities: string[]; token: string; documentationUrl: string }> = {},
): string {
  const provider = overrides.provider ?? 'coolify';
  const capabilities = overrides.capabilities ?? ['servers.read'];
  const saved = registry.save({
    label: `${provider} production`,
    provider,
    baseUrl: `https://${provider}.example.test`,
    documentationUrl: overrides.documentationUrl ?? 'https://docs.example.test/api',
    capabilities,
    operations: [{ id: 'validate', label: `Validate ${provider}`, capability: capabilities[0], method: 'GET', path: '/api/v1/servers', risk: 'read' }],
    token: overrides.token ?? `private-token-${provider}`,
    ...(overrides.id ? { id: overrides.id } : {}),
  });
  return saved.id;
}

const prereq = (providerHint: string, capabilities: string[]) => ({
  id: `prereq-${providerHint}-${capabilities.join('-')}`,
  kind: 'credential' as const,
  description: `${providerHint} API access`,
  requiredFor: 'resume the provider task',
  providerHint,
  capabilities,
  riskIfWrong: 'high' as const,
});

describe('connection recovery — state model (all providers)', () => {
  it('storage/auth and capability availability are separate and never derived from each other', async () => {
    home();
    const registry = new ConnectionRegistry();
    const id = saveConnection(registry);
    // Invoking a missing op records capability gaps — auth must stay untouched.
    try {
      await registry.invoke(id, 'list-applications');
    } catch (error) {
      expect((error as { state?: ConnectionState }).state).toBe('CONNECTED_MISSING_OPERATION');
      expect(registry.authStateOf(id).status).toBe('unknown');
      expect(registry.capabilityStateOf(id).missing).toContain('list-applications');
    }
    // Auth validity never rewrites capability state, and vice versa.
    globalThis.fetch = (async () => okResponse({ unauthorized: true }, 401)) as typeof fetch;
    await registry.validate(id).catch(() => undefined);
    expect(registry.authStateOf(id).status).toBe('invalid');
    expect(registry.capabilityStateOf(id).missing).toContain('list-applications');
  });

  it('valid connection + missing READ operation discovers and registers it, reusing the saved credential', () => {
    home();
    const registry = new ConnectionRegistry();
    const id = saveConnection(registry, { provider: 'coolify', capabilities: ['servers.read'] });

    const result = registry.resolveConnectionOperation({ connectionId: id, capability: 'applications.read', riskLevel: 'read' });

    expect(result).toMatchObject({
      connectionValid: true,
      operationAvailable: true,
      state: 'CONNECTED',
      resolution: 'discovered',
      capability: 'applications.read',
    });
    expect(result.operation).toMatchObject({ id: 'list-applications', method: 'GET', risk: 'read', capability: 'applications.read' });
    // Registered under the existing credential; auth integrity untouched.
    expect(registry.operation(id, 'list-applications')).toBeDefined();
    expect(registry.authStateOf(id).status).not.toBe('invalid');
  });

  it('valid connection + missing WRITE operation returns requires_approval, never a credential prompt', () => {
    home();
    const registry = new ConnectionRegistry();
    const id = saveConnection(registry, { provider: 'vercel', capabilities: ['projects.read'] });

    const result = registry.resolveConnectionOperation({ connectionId: id, capability: 'deployments.write', riskLevel: 'reversible-write' });

    expect(result).toMatchObject({
      connectionValid: true,
      operationAvailable: false,
      resolution: 'requires_approval',
      state: 'CONNECTED_MISSING_OPERATION',
      capability: 'deployments.write',
    });
    expect(result.operation).toMatchObject({ id: 'create-deployment', risk: 'reversible-write' });
    // The write must NOT be registered without host approval.
    expect(registry.operation(id, 'create-deployment')).toBeUndefined();
    expect(registry.authStateOf(id).status).toBe('unknown');
    expect(registry.list().find((profile) => profile.id === id)?.hasCredential).toBe(true);
  });
});

describe('connection recovery — failure classification', () => {
  it('HTTP 401 -> AUTH_INVALID with positive auth evidence', async () => {
    home();
    const registry = new ConnectionRegistry();
    const id = saveConnection(registry, { provider: 'github' });
    globalThis.fetch = (async () => okResponse({ error: { message: 'Bad credentials' } }, 401)) as typeof fetch;

    const error = await registry.validate(id).catch((e: Error) => e);
    expect((error as { state?: ConnectionState }).state).toBe('AUTH_INVALID');
    expect((error as { authEvident?: boolean }).authEvident).toBe(true);
    expect(registry.authStateOf(id).status).toBe('invalid');
  });

  it('expired token signal on 401 -> AUTH_EXPIRED (still auth evidence)', async () => {
    home();
    const registry = new ConnectionRegistry();
    const id = saveConnection(registry, { provider: 'fly' });
    globalThis.fetch = (async () => okResponse({ error: { type: 'token_expired', message: 'Token expired' } }, 401)) as typeof fetch;

    const error = await registry.validate(id).catch((e: Error) => e);
    expect((error as { state?: ConnectionState }).state).toBe('AUTH_EXPIRED');
    expect((error as { authEvident?: boolean }).authEvident).toBe(true);
  });

  it('HTTP 403 -> CONNECTED_INSUFFICIENT_SCOPE: credential NOT discarded, scope marked denied', async () => {
    home();
    const registry = new ConnectionRegistry();
    const id = saveConnection(registry, { provider: 'coolify' });
    globalThis.fetch = (async () => okResponse({ error: { message: 'Forbidden: missing servers.read scope' } }, 403)) as typeof fetch;

    const error = await registry.validate(id).catch((e: Error) => e);
    expect((error as { state?: ConnectionState }).state).toBe('CONNECTED_INSUFFICIENT_SCOPE');
    expect((error as { authEvident?: boolean }).authEvident).toBe(false);
    expect(registry.authStateOf(id).status).not.toBe('invalid');
    expect(registry.capabilityStateOf(id).denied).toContain('servers.read');
    expect(registry.list().find((profile) => profile.id === id)?.hasCredential).toBe(true);
  });

  it('HTTP 404 unknown operation -> CONNECTED_MISSING_OPERATION, credentials keep their value', async () => {
    home();
    const registry = new ConnectionRegistry();
    const id = saveConnection(registry, { provider: 'gitlab' });
    globalThis.fetch = (async () => okResponse({ error: 'not found' }, 404)) as typeof fetch;

    const error = await registry.validate(id).catch((e: Error) => e);
    expect((error as { state?: ConnectionState }).state).toBe('CONNECTED_MISSING_OPERATION');
    expect((error as { authEvident?: boolean }).authEvident).toBe(false);
    expect(registry.authStateOf(id).status).not.toBe('invalid');
    expect(registry.capabilityStateOf(id).missing).toContain('servers.read');
  });

  it('network timeout -> PROVIDER_UNREACHABLE with no credential prompt', async () => {
    home();
    const registry = new ConnectionRegistry();
    const id = saveConnection(registry, { provider: 'vercel' });
    globalThis.fetch = (async () => {
      throw new Error('fetch time out');
    }) as typeof fetch;

    const error = await registry.validate(id).catch((e: Error) => e);
    expect((error as { state?: ConnectionState }).state).toBe('PROVIDER_UNREACHABLE');
    expect((error as { authEvident?: boolean }).authEvident).toBe(false);
    expect(registry.authStateOf(id).status).not.toBe('invalid');
    const decision = registry.connectionRecoveryDecision(prereq('vercel', ['projects.read']));
    expect(decision.action).not.toBe('reauth');
  });

  it('unknown capability -> DISCOVERY_FAILED; saved credential is still valid', () => {
    home();
    const registry = new ConnectionRegistry();
    const id = saveConnection(registry, { provider: 'coolify' });

    const result = registry.resolveConnectionOperation({ connectionId: id, capability: 'billing.read', riskLevel: 'read' });

    expect(result).toMatchObject({ connectionValid: true, operationAvailable: false, resolution: 'discovery_failed', state: 'DISCOVERY_FAILED' });
    expect(registry.authStateOf(id).status).not.toBe('invalid');
    const decision = registry.connectionRecoveryDecision(prereq('coolify', ['billing.read']));
    expect(decision.action).toBe('capability-resolution');
  });
});

describe('connection recovery — routing decisions', () => {
  it('auth-invalid single match -> reauth; never capability-resolution', async () => {
    home();
    const registry = new ConnectionRegistry();
    const id = saveConnection(registry, { provider: 'github' });
    globalThis.fetch = (async () => okResponse({ error: 'unauthorized' }, 401)) as typeof fetch;
    await registry.validate(id).catch(() => undefined);

    const decision = registry.connectionRecoveryDecision(prereq('github', ['repositories.read']));
    expect(decision).toMatchObject({ action: 'reauth', state: 'AUTH_INVALID' });
  });

  it('multiple matches with one invalid stay capability-level until auth is proven', async () => {
    home();
    const registry = new ConnectionRegistry();
    const bad = saveConnection(registry, { id: 'github', provider: 'github' });
    saveConnection(registry, { id: 'github-staging', provider: 'github' });
    globalThis.fetch = (async () => okResponse({ error: 'unauthorized' }, 401)) as typeof fetch;
    await registry.validate(bad).catch(() => undefined);
    globalThis.fetch = (async () => okResponse({})) as typeof fetch;

    const decision = registry.connectionRecoveryDecision(prereq('github', ['repositories.read']));
    expect(decision.action).toBe('capability-resolution');
  });

  it('secrets never leak into decision, resolution, agent rendering, or ledger records', () => {
    home();
    const registry = new ConnectionRegistry();
    const id = saveConnection(registry, { provider: 'coolify' });
    const secret = 'private-token-coolify';

    expect(JSON.stringify(registry.resolveConnectionOperation({ connectionId: id, capability: 'servers.read' }))).not.toContain(secret);
    expect(JSON.stringify(registry.connectionRecoveryDecision(prereq('coolify', ['servers.read'])))).not.toContain(secret);
    expect(registry.renderForAgent()).not.toContain(secret);
  });

  it('capability additions persist for future tasks and fresh registry instances', () => {
    const root = home();
    const registry = new ConnectionRegistry();
    const id = saveConnection(registry, { provider: 'coolify', capabilities: ['servers.read'] });
    registry.resolveConnectionOperation({ connectionId: id, capability: 'applications.read', riskLevel: 'read' });
    registry.registerApprovedOperation(id, {
      id: 'deploy-application', label: 'Deploy application', capability: 'deployments.write', method: 'POST', path: '/api/v1/deploy', risk: 'reversible-write',
    }, true);

    const fresh = new ConnectionRegistry();
    expect(fresh.operation(id, 'list-applications')).toBeDefined();
    expect(fresh.operation(id, 'deploy-application')).toBeDefined();
    const profile = fresh.get(id);
    expect(profile?.capabilities).toContain('applications.read');
    expect(profile?.capabilities).toContain('deployments.write');
    const onDisk = readFileSync(path.join(root, 'Settings', 'connections.json'), 'utf8');
    expect(onDisk).toContain('list-applications');
    expect(onDisk).not.toContain('private-token-coolify');
  });

  it('retrying after registration resolves as existing and executes under the same credential', async () => {
    home();
    const registry = new ConnectionRegistry();
    const id = saveConnection(registry, { provider: 'vercel', capabilities: ['projects.read'] });
    globalThis.fetch = (async () => okResponse({ projects: [{ id: 'p-1' }] })) as typeof fetch;

    registry.resolveConnectionOperation({ connectionId: id, capability: 'projects.read', riskLevel: 'read' });
    const result = registry.resolveConnectionOperation({ connectionId: id, capability: 'projects.read', riskLevel: 'read' });
    expect(result.resolution).toBe('existing');

    const invocation = await registry.invokeRead(id, result.operation!.id);
    expect(invocation.ok).toBe(true);
    expect(registry.authStateOf(id).status).toBe('valid');
  });

  it('catalog seeds documented reads/writes across multiple providers', () => {
    for (const provider of ['coolify', 'github', 'gitlab', 'vercel', 'fly']) {
      const entry = CONNECTION_CATALOG.find((candidate) => candidate.provider === provider);
      expect(entry, `catalog entry for ${provider}`).toBeDefined();
      expect(entry!.operations.some((operation) => operation.risk === 'read' && operation.method === 'GET'), `${provider} read`).toBe(true);
      expect(entry!.operations.some((operation) => operation.risk !== 'read'), `${provider} write`).toBe(true);
    }
  });
});

describe('Gitu recovery routing — no loop into secure setup without proven auth failure', () => {
  it('valid saved connection + missing capability routes to CAPABILITY_RESOLUTION and NEVER opens the secure form', async () => {
    const root = project('routing');
    home();
    const registry = new ConnectionRegistry();
    saveConnection(registry, { provider: 'coolify', capabilities: ['applications.read'] });
    globalThis.fetch = (async () => okResponse({ servers: [] })) as typeof fetch;

    const events: string[] = [];
    let connectionRequests = 0;
    let turn = 0;
    const llm: LlmClient = {
      name: 'recovery-mock',
      async complete() {
        return '';
      },
      async completeStream() {
        return '';
      },
      async completeTurn(messages: LlmMessage[]): Promise<LlmTurnResult> {
        turn += 1;
        if (turn === 1) {
          return {
            kind: 'text',
            text: JSON.stringify({
              action: {
                type: 'request_block',
                reason: 'coolify needs database creation privileges',
                prerequisite: { id: 'coolify-databases', kind: 'credential', description: 'coolify database creation access', requiredFor: 'create the preview database', providerHint: 'coolify', capabilities: ['databases.create'], riskIfWrong: 'high' },
              },
            }),
            metadata: {},
          };
        }
        if (turn === 2) {
          return { kind: 'text', text: JSON.stringify({ action: { type: 'set_criteria', criteria: ['provider task resolved'] } }), metadata: {} };
        }
        if (turn === 3) {
          return { kind: 'text', text: JSON.stringify({ action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' } }), metadata: {} };
        }
        if (turn === 4) {
          const text = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' ');
          const ids = [...text.matchAll(/(ev-\d{8}-[0-9a-f]{6})/g)].map((m) => m[1]);
          return { kind: 'text', text: JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: ids.at(-1) ?? 'ev-missing' } }), metadata: {} };
        }
        return { kind: 'text', text: JSON.stringify({ action: { type: 'complete', summary: 'provider task done', risks: [], followUps: [] } }), metadata: {} };
      },
      async completeTurnStream(messages: LlmMessage[]): Promise<LlmTurnResult> {
        return llm.completeTurn!(messages);
      },
    };

    const { report } = await new Gitu({
      cwd: root,
      llm,
      mode: 'fast',
      onEvent: (text) => events.push(text),
      approvalHandler: async () => true,
      prerequisiteRecovery: { providers: [registry.asPrerequisiteProvider()] },
      connectionRecoveryCheck: (prerequisite) => registry.connectionRecoveryDecision(prerequisite),
      connectionRequestHandler: async () => {
        connectionRequests += 1;
        return false;
      },
    }).run('Provision a coolify preview database');

    expect(report.status).toBe('complete');
    // The missing-operation case MUST NOT reach the secure connection form.
    expect(connectionRequests).toBe(0);
    // The saved connection was validated and the write capability was routed to
    // operation-level approval (NOT credential re-entry).
    expect(events.some((event) => event.includes('RESOLVED after secure connection'))).toBe(false);
    expect(events.some((event) => event.includes('recovery RESOURCE_REUSED — connection-capability-resolution'))).toBe(true);
    expect(events.some((event) => /needs? .*operation approval/i.test(event))).toBe(true);
    expect(events.some((event) => event.includes('connection required'))).toBe(false);
    // The saved credential was reused and remains valid.
    expect(registry.authStateOf(registry.list()[0]!.id).status).not.toBe('invalid');
  }, 30000);

  it('positively rejected auth (401) DOES route to secure reauthorization', async () => {
    const root = project('reauth');
    home();
    const registry = new ConnectionRegistry();
    const id = saveConnection(registry, { provider: 'github' });
    // First mark the credential invalid with 401 evidence.
    globalThis.fetch = (async () => okResponse({ error: 'Bad credentials' }, 401)) as typeof fetch;
    await registry.validate(id).catch(() => undefined);
    globalThis.fetch = (async () => okResponse({ servers: [] })) as typeof fetch;

    const events: string[] = [];
    let connectionRequests = 0;
    let turn = 0;
    const llm: LlmClient = {
      name: 'reauth-mock',
      async complete() {
        return '';
      },
      async completeStream() {
        return '';
      },
      async completeTurn(messages: LlmMessage[]): Promise<LlmTurnResult> {
        turn += 1;
        if (turn === 1) {
          return {
            kind: 'text',
            text: JSON.stringify({
              action: {
                type: 'request_block',
                reason: 'github credentials are unusable',
                prerequisite: { id: 'github-access', kind: 'credential', description: 'github API access', requiredFor: 'read repositories', providerHint: 'github', capabilities: ['repositories.read'], riskIfWrong: 'high' },
              },
            }),
            metadata: {},
          };
        }
        return { kind: 'text', text: JSON.stringify({ action: { type: 'complete', summary: 'done' } }), metadata: {} };
      },
      async completeTurnStream(messages: LlmMessage[]): Promise<LlmTurnResult> {
        return llm.completeTurn!(messages);
      },
    };

    await new Gitu({
      cwd: root,
      llm,
      mode: 'fast',
      onEvent: (text) => events.push(text),
      prerequisiteRecovery: { providers: [registry.asPrerequisiteProvider()] },
      connectionRecoveryCheck: (prerequisite) => registry.connectionRecoveryDecision(prerequisite),
      connectionRequestHandler: async () => {
        connectionRequests += 1;
        return false;
      },
    }).run('Verify github repositories');

    expect(connectionRequests).toBe(1);
    expect(events.some((event) => event.includes('connection reauthorization required'))).toBe(true);
  }, 30000);
});
