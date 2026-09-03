import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConnectionRegistry, canonicalOperationId, type ConnectionState } from '../src/connections/connections.js';
import { CONNECTION_CATALOG } from '../src/connections/catalog.js';
import { Gitu, asksForResourceIdentifier, connectionResultDisclosure } from '../src/agent/gitu.js';
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
  for (const root of homes.splice(0)) {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* temp cleanup */
    }
  }
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

describe('live read execution path — Coolify list-applications (regression)', () => {
  it('canonical operation ids unify "coolify/list-applications" and "list-applications"', () => {
    expect(canonicalOperationId('coolify/list-applications')).toBe('list-applications');
    expect(canonicalOperationId('list-applications')).toBe('list-applications');
    expect(canonicalOperationId('')).toBe('');
  });

  it('missing documented read => discovers, persists, executes; no approval, no prompt, no reauth; subsequent resolves as existing', async () => {
    home();
    const registry = new ConnectionRegistry();
    const id = saveConnection(registry, { provider: 'coolify', capabilities: ['servers.read'] });
    const requests: { url: string; method?: string; authorization: string | null }[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({
        url: String(input),
        method: init?.method,
        authorization: new Headers(init?.headers).get('authorization'),
      });
      return okResponse({ applications: [{ id: 'app-1' }] });
    }) as typeof fetch;

    // Step 1+2: agent proposes the documented safe GET through the resolver
    // (the path the server connectionOperationHandler/connectionActionHandler
    // now execute before any "registered only" guard).
    const resolution = registry.resolveConnectionOperation({
      connectionId: id,
      operation: { id: 'list-applications', label: 'List applications', capability: 'applications.read', method: 'GET', path: '/api/v1/applications', risk: 'read' },
      capability: 'applications.read',
      documented: true,
    });
    expect(resolution).toMatchObject({
      connectionValid: true,
      operationAvailable: true,
      resolution: 'discovered',
      state: 'CONNECTED',
    });

    // Step 2b: persisted before execution; auth integrity untouched.
    const persisted = registry.operation(id, 'list-applications');
    expect(persisted).toBeDefined();
    expect(registry.authStateOf(id).status).not.toBe('invalid');

    // Step 3: the live read path executes under the existing credential.
    const invocation = await registry.resolveAndExecuteRead({ connectionId: id, operationId: 'coolify/list-applications' });
    expect(invocation.ok).toBe(true);
    expect(invocation.data).toEqual({ applications: [{ id: 'app-1' }] });
    expect(requests.at(-1)).toEqual({
      url: 'https://coolify.example.test/api/v1/applications',
      method: 'GET',
      authorization: 'Bearer private-token-coolify',
    });

    // No approval was possible at the registry level (reads never reach
    // requestApproval), and recovery does not route to reauth for this need.
    const decision = registry.connectionRecoveryDecision(prereq('coolify', ['applications.read']));
    expect(decision.action).not.toBe('reauth');

    // Step 4: subsequent resolution is 'existing' — no re-registration.
    const again = registry.resolveConnectionOperation({ connectionId: id, operationId: 'list-applications' });
    expect(again.resolution).toBe('existing');
    const againPrefixed = registry.resolveConnectionOperation({ connectionId: id, operationId: 'coolify/list-applications' });
    expect(againPrefixed).toMatchObject({ resolution: 'existing', operationAvailable: true, connectionValid: true });
  });

  it('unknown operation id never enters approval/reauth: DISCOVERY_FAILED with the credential intact', async () => {
    home();
    const registry = new ConnectionRegistry();
    const id = saveConnection(registry, { provider: 'coolify' });
    globalThis.fetch = (async () => okResponse({})) as typeof fetch;

    const resolution = registry.resolveConnectionOperation({ connectionId: id, operationId: 'coolify/not-a-real-endpoint' });
    expect(resolution).toMatchObject({ connectionValid: true, resolution: 'discovery_failed', state: 'DISCOVERY_FAILED' });
    await expect(registry.resolveAndExecuteRead({ connectionId: id, operationId: 'coolify/not-a-real-endpoint' })).rejects.toThrow(/not registered/);
    expect(registry.authStateOf(id).status).not.toBe('invalid');
    expect(registry.list().find((profile) => profile.id === id)?.hasCredential).toBe(true);
  });

  it('connection_action path for a catalog-backed id auto-registers and executes (handler-equivalent)', async () => {
    home();
    const registry = new ConnectionRegistry();
    const id = saveConnection(registry, { provider: 'coolify', capabilities: ['servers.read'] });
    globalThis.fetch = (async () => okResponse({ applications: [] })) as typeof fetch;

    // connectionActionHandler only carries connectionId + operationId — the
    // documented id resolves through the catalog and auto-registers.
    const result = await registry.resolveAndExecuteRead({ connectionId: id, operationId: 'list-applications' });
    expect(result.ok).toBe(true);
    expect(registry.operation(id, 'list-applications')).toBeDefined();
    expect(registry.authStateOf(id).status).not.toBe('invalid');
  });

  it('live agent accepts provider-qualified operation ids and executes the canonical operation', async () => {
    const root = project('qualified-id');
    home();
    const registry = new ConnectionRegistry();
    saveConnection(registry, { provider: 'coolify', capabilities: ['servers.read'] });
    globalThis.fetch = (async () => okResponse({ applications: [] })) as typeof fetch;

    const events: string[] = [];
    const requests: string[] = [];
    let approvals = 0;
    let turn = 0;
    const llm: LlmClient = {
      name: 'qualified-mock',
      async complete() { return ''; },
      async completeStream() { return ''; },
      async completeTurn(messages: LlmMessage[]): Promise<LlmTurnResult> {
        turn += 1;
        // First: propose the documented read (auto-registers + executes).
        if (turn === 1) {
          return { kind: 'text', text: JSON.stringify({ action: { type: 'connection_operation', connectionId: 'coolify', operation: { id: 'list-applications', label: 'List applications', capability: 'applications.read', method: 'GET', path: '/api/v1/applications', risk: 'read' }, documentationUrl: 'https://coolify.io/docs/api-reference', reason: 'inspect applications' } }), metadata: {} };
        }
        // Second: provider-qualified id — must parse, resolve as existing, execute.
        if (turn === 2) {
          return { kind: 'text', text: JSON.stringify({ action: { type: 'connection_action', connectionId: 'coolify', operationId: 'coolify/list-applications', reason: 'list again' } }), metadata: {} };
        }
        if (turn === 3) return { kind: 'text', text: JSON.stringify({ action: { type: 'set_criteria', criteria: ['applications listed'] } }), metadata: {} };
        if (turn === 4) {
          return { kind: 'text', text: JSON.stringify({ action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' } }), metadata: {} };
        }
        if (turn === 5) {
          const text = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' ');
          const ids = [...text.matchAll(/(ev-\d{8}-[0-9a-f]{6})/g)].map((m) => m[1]);
          return { kind: 'text', text: JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: ids.at(-1) ?? 'ev-missing' } }), metadata: {} };
        }
        return { kind: 'text', text: JSON.stringify({ action: { type: 'complete', summary: 'done', risks: [], followUps: [] } }), metadata: {} };
      },
      async completeTurnStream(messages: LlmMessage[]): Promise<LlmTurnResult> { return llm.completeTurn!(messages); },
    };
    globalThis.fetch = (async (input: string | URL | Request) => {
      requests.push(String(input));
      return okResponse({ applications: [] });
    }) as typeof fetch;

    const { report } = await new Gitu({
      cwd: root,
      llm,
      mode: 'fast',
      onEvent: (text) => events.push(text),
      approvalHandler: async () => { approvals += 1; return true; },
      connectionRecoveryCheck: (prerequisite) => registry.connectionRecoveryDecision(prerequisite),
      connectionRequestHandler: async () => false,
      connectionActionHandler: async ({ connectionId, operationId }) => {
        const result = await registry.resolveAndExecuteRead({ connectionId, operationId });
        return { message: result.message, ...(result.data !== undefined ? { data: result.data } : {}) };
      },
      connectionOperationHandler: async (proposal) => {
        const result = await registry.resolveAndExecuteRead({ connectionId: proposal.connectionId, operation: proposal.operation, capability: proposal.operation.capability, documented: Boolean(proposal.documentationUrl) });
        return { message: result.message, ...(result.data !== undefined ? { data: result.data } : {}) };
      },
    }).run('Inspect Coolify applications');

    expect(report.status).toBe('complete');
    expect(approvals).toBe(0);
    // Both calls executed exactly the canonical operation; the qualified id
    // resolved to the registered operation.
    expect(requests).toEqual([
      'https://coolify.example.test/api/v1/applications',
      'https://coolify.example.test/api/v1/applications',
    ]);
    expect(events.filter((event) => event.includes('completed')).length).toBeGreaterThanOrEqual(2);
    expect(events.some((event) => event.includes('not run'))).toBe(false);
    expect(registry.operation('coolify', 'list-applications')).toBeDefined();
  }, 30000);

  it('narrates safe GET reads as running without approval, never "requesting approval"', async () => {
    const root = project('narration');
    home();
    const registry = new ConnectionRegistry();
    saveConnection(registry, { provider: 'coolify', capabilities: ['servers.read'] });
    globalThis.fetch = (async () => okResponse({ applications: [] })) as typeof fetch;
    const events: string[] = [];
    let turn = 0;
    const llm: LlmClient = {
      name: 'narration-mock',
      async complete() { return ''; },
      async completeStream() { return ''; },
      async completeTurn(messages: LlmMessage[]): Promise<LlmTurnResult> {
        turn += 1;
        if (turn === 1) {
          return { kind: 'text', text: JSON.stringify({ action: { type: 'connection_operation', connectionId: 'coolify', operation: { id: 'list-applications', label: 'List applications', capability: 'applications.read', method: 'GET', path: '/api/v1/applications', risk: 'read' }, documentationUrl: 'https://coolify.io/docs/api-reference', reason: 'inspect' } }), metadata: {} };
        }
        if (turn === 2) return { kind: 'text', text: JSON.stringify({ action: { type: 'set_criteria', criteria: ['done'] } }), metadata: {} };
        if (turn === 3) return { kind: 'text', text: JSON.stringify({ action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' } }), metadata: {} };
        if (turn === 4) {
          const text = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' ');
          const ids = [...text.matchAll(/(ev-\d{8}-[0-9a-f]{6})/g)].map((m) => m[1]);
          return { kind: 'text', text: JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: ids.at(-1) ?? 'ev-missing' } }), metadata: {} };
        }
        return { kind: 'text', text: JSON.stringify({ action: { type: 'complete', summary: 'done', risks: [], followUps: [] } }), metadata: {} };
      },
      async completeTurnStream(messages: LlmMessage[]): Promise<LlmTurnResult> { return llm.completeTurn!(messages); },
    };
    const { report } = await new Gitu({
      cwd: root, llm, mode: 'fast', onEvent: (e) => events.push(e),
      approvalHandler: async () => true,
      connectionRecoveryCheck: (p) => registry.connectionRecoveryDecision(p),
      connectionRequestHandler: async () => false,
      connectionActionHandler: async ({ connectionId, operationId }) => { const r = await registry.resolveAndExecuteRead({ connectionId, operationId }); return { message: r.message }; },
      connectionOperationHandler: async (proposal) => { const r = await registry.resolveAndExecuteRead({ connectionId: proposal.connectionId, operation: proposal.operation, capability: proposal.operation.capability, documented: true }); return { message: r.message }; },
    }).run('inspect');
    expect(report.status).toBe('complete');
    expect(events.some((event) => event.startsWith('say') && event.includes('without approval'))).toBe(true);
    expect(events.some((event) => event.includes('requesting approval'))).toBe(false);
  }, 30000);

  it('holds a resource-id question once so provider discovery runs first, then delivers it', async () => {
    const root = project('held-question');
    home();
    const registry = new ConnectionRegistry();
    saveConnection(registry, { provider: 'coolify', capabilities: ['servers.read'] });
    globalThis.fetch = (async () => okResponse({ applications: [] })) as typeof fetch;
    const events: string[] = [];
    let delivered = 0;
    let turn = 0;
    const llm: LlmClient = {
      name: 'held-question-mock',
      async complete() { return ''; },
      async completeStream() { return ''; },
      async completeTurn(messages: LlmMessage[]): Promise<LlmTurnResult> {
        turn += 1;
        if (turn === 1) {
          return { kind: 'text', text: JSON.stringify({ action: { type: 'ask_user', questions: [{ question: 'What is the Coolify app id for gitu-marketing?', header: 'app id' }] } }), metadata: {} };
        }
        // Model retries discovery after the hold, then asks the SAME question.
        if (turn === 2) {
          return { kind: 'text', text: JSON.stringify({ action: { type: 'ask_user', questions: [{ question: 'What is the Coolify app id for gitu-marketing?', header: 'app id' }] } }), metadata: {} };
        }
        if (turn === 3) return { kind: 'text', text: JSON.stringify({ action: { type: 'set_criteria', criteria: ['done'] } }), metadata: {} };
        if (turn === 4) return { kind: 'text', text: JSON.stringify({ action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify', expected: 'exit 0' } }), metadata: {} };
        if (turn === 5) {
          const text = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' ');
          const ids = [...text.matchAll(/(ev-\d{8}-[0-9a-f]{6})/g)].map((m) => m[1]);
          return { kind: 'text', text: JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: ids.at(-1) ?? 'ev-missing' } }), metadata: {} };
        }
        return { kind: 'text', text: JSON.stringify({ action: { type: 'complete', summary: 'done', risks: [], followUps: [] } }), metadata: {} };
      },
      async completeTurnStream(messages: LlmMessage[]): Promise<LlmTurnResult> { return llm.completeTurn!(messages); },
    };
    const { report } = await new Gitu({
      cwd: root, llm, mode: 'fast', onEvent: (e) => events.push(e),
      approvalHandler: async () => true,
      askUserHandler: async () => { delivered += 1; return 'app-42'; },
      connectionRecoveryCheck: (p) => registry.connectionRecoveryDecision(p),
      connectionRequestHandler: async () => false,
      connectionContext: () => registry.renderForAgent(),
      connectionActionHandler: async ({ connectionId, operationId }) => { const r = await registry.resolveAndExecuteRead({ connectionId, operationId }); return { message: r.message }; },
      connectionOperationHandler: async (proposal) => { const r = await registry.resolveAndExecuteRead({ connectionId: proposal.connectionId, operation: proposal.operation, capability: proposal.operation.capability, documented: true }); return { message: r.message }; },
    }).run('find the app');
    expect(report.status).toBe('complete');
    // Held exactly once: the identical question was delivered on the second ask.
    expect(delivered).toBe(1);
    expect(events.some((event) => event.includes('ask-user held once'))).toBe(true);
  }, 30000);

  it('flags truncated provider results for narrower follow-up reads', () => {
    expect(connectionResultDisclosure({ ok: true }).truncated).toBe(false);
    const marker = connectionResultDisclosure('[response omitted: exceeds safe connection output limit]');
    expect(marker.truncated).toBe(true);
    expect(marker.text).toContain('(provider result truncated)');
    const big = connectionResultDisclosure({ list: 'x'.repeat(50_000) });
    expect(big.truncated).toBe(true);
  });

  it('holds resource-id questions once, but lets genuinely ambiguous questions through immediately', () => {
    expect(asksForResourceIdentifier([{ question: 'What is the app id / status for the deployment?', header: 'resource id' }])).toBe(true);
    expect(asksForResourceIdentifier([{ question: 'Provide the application uuid.', header: 'id' }])).toBe(true);
    expect(asksForResourceIdentifier([{ question: 'Do you want a local .env or a Coolify deployment environment?', header: 'intent' }])).toBe(false);
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

  it('resolves connection alias and underscore-formatted operationId deterministically', async () => {
    home();
    const root = project('alias-test');
    const registry = new ConnectionRegistry();
    // Saved connection ID is 'coolify-production'
    saveConnection(registry, { id: 'coolify-production', provider: 'coolify', capabilities: ['servers.read', 'applications.read'] });

    globalThis.fetch = async (url) => {
      if (String(url).includes('/api/v1/applications')) {
        return okResponse([{ id: 'app-1', name: 'my-app' }]);
      }
      return okResponse([]);
    };

    let invocations = 0;
    const events: string[] = [];
    let turn = 0;
    const llm: LlmClient = {
      name: 'alias-mock',
      async complete() {
        return '';
      },
      async completeStream() {
        return '';
      },
      async completeTurn(): Promise<LlmTurnResult> {
        turn += 1;
        if (turn === 1) {
          // Model emits connectionId: "coolify" (alias) and operation: "list_applications" (with underscore)
          return {
            kind: 'text',
            text: JSON.stringify({
              action: {
                type: 'connection_action',
                connection_id: 'coolify',
                operation: 'list_applications',
                reason: 'inspect coolify applications',
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

    const gitu = new Gitu({
      cwd: root,
      llm,
      mode: 'fast',
      onEvent: (text) => events.push(text),
      connectionActionHandler: async ({ connectionId, operationId }) => {
        invocations += 1;
        const res = await registry.resolveAndExecuteRead({ connectionId, operationId });
        return { message: res.message, data: res.data };
      },
    });

    await gitu.run('Check coolify');
    expect(invocations).toBe(1);
    expect(events.some((event) => event.includes('completed'))).toBe(true);
  }, 30000);
});

describe('connection anti-loop progress awareness (regression)', () => {
  it('allows the same successful provider read more than three times when progress occurs between reads', async () => {
    const root = project('repeated-read-progress');
    home();
    const events: string[] = [];
    let turn = 0;
    let readCount = 0;
    const llm: LlmClient = {
      name: 'mock',
      async complete() {
        return '';
      },
      async completeStream() {
        return '';
      },
      async completeTurn(messages: LlmMessage[]): Promise<LlmTurnResult> {
        turn += 1;
        if (turn === 1) {
          return { kind: 'text', text: JSON.stringify({ action: { type: 'set_criteria', criteria: ['configured and verified'] } }), metadata: {} };
        }
        if (turn === 2) {
          return { kind: 'text', text: JSON.stringify({ action: { type: 'connection_action', connectionId: 'coolify', operationId: 'get-app-sv7-envs', reason: 'read env 1' } }), metadata: {} };
        }
        if (turn === 3) {
          return { kind: 'text', text: JSON.stringify({ action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify node', expected: 'exit 0' } }), metadata: {} };
        }
        if (turn === 4) {
          return { kind: 'text', text: JSON.stringify({ action: { type: 'connection_action', connectionId: 'coolify', operationId: 'get-app-sv7-envs', reason: 'read env 2' } }), metadata: {} };
        }
        if (turn === 5) {
          return { kind: 'text', text: JSON.stringify({ action: { type: 'tool_call', stepId: 'step-2', tool: 'run_command', params: { command: 'node -e "process.exit(0)"' }, reason: 'check node', expected: 'exit 0' } }), metadata: {} };
        }
        if (turn === 6) {
          return { kind: 'text', text: JSON.stringify({ action: { type: 'connection_action', connectionId: 'coolify', operationId: 'get-app-sv7-envs', reason: 'read env 3' } }), metadata: {} };
        }
        if (turn === 7) {
          return { kind: 'text', text: JSON.stringify({ action: { type: 'tool_call', stepId: 'step-3', tool: 'run_command', params: { command: 'npm --version' }, reason: 'verify npm', expected: 'exit 0' } }), metadata: {} };
        }
        if (turn === 8) {
          return { kind: 'text', text: JSON.stringify({ action: { type: 'connection_action', connectionId: 'coolify', operationId: 'get-app-sv7-envs', reason: 'read env 4' } }), metadata: {} };
        }
        if (turn === 9) {
          const text = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' ');
          const ids = [...text.matchAll(/(ev-\d{8}-[0-9a-f]{6})/g)].map((m) => m[1]);
          return { kind: 'text', text: JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: ids.at(-1) ?? 'ev-missing' } }), metadata: {} };
        }
        return { kind: 'text', text: JSON.stringify({ action: { type: 'complete', summary: 'done', risks: [], followUps: [] } }), metadata: {} };
      },
      async completeTurnStream(messages: LlmMessage[]): Promise<LlmTurnResult> {
        return llm.completeTurn!(messages);
      },
    };

    const gitu = new Gitu({
      cwd: root,
      llm,
      mode: 'fast',
      onEvent: (text) => events.push(text),
      connectionActionHandler: async () => {
        readCount += 1;
        return { message: 'env variables retrieved', data: { envs: [{ key: 'PORT', value: '3000' }] } };
      },
    });

    const { ledger } = await gitu.run('Configure coolify app');
    const readInvocations = events.filter((e) => e.includes('coolify/get-app-sv7-envs completed')).length;
    expect(readInvocations).toBe(4);
    expect(events.some((e) => e.includes('repeated saved connection action stopped'))).toBe(false);
    expect(ledger.data.status).not.toBe('stalled');
    expect(ledger.data.blockers.some((b) => b.includes('requested more than three times'))).toBe(false);
  }, 30000);

  it('allows a provider read again after a write changes remote state', async () => {
    const root = project('read-after-mutation');
    home();
    let envValue = 'initial';
    let readCount = 0;
    let writeCount = 0;
    const events: string[] = [];
    let turn = 0;
    const llm: LlmClient = {
      name: 'mock',
      async complete() {
        return '';
      },
      async completeStream() {
        return JSON.stringify({ verdict: 'pass', feedback: 'ok' });
      },
      async completeTurn(): Promise<LlmTurnResult> {
        turn += 1;
        if (turn === 1) return { kind: 'text', text: JSON.stringify({ action: { type: 'set_criteria', criteria: ['env updated'] } }), metadata: {} };
        if (turn === 2) return { kind: 'text', text: JSON.stringify({ action: { type: 'connection_action', connectionId: 'coolify', operationId: 'get-app-envs', reason: 'read env initial' } }), metadata: {} };
        if (turn === 3) {
          return {
            kind: 'text',
            text: JSON.stringify({
              thought: 'update environment',
              action: {
                type: 'connection_operation',
                connectionId: 'coolify',
                operation: { id: 'set-app-envs', label: 'Update envs', capability: 'servers.read', method: 'POST', path: '/api/v1/envs', risk: 'reversible-write' },
                body: { value: 'updated' },
                documentationUrl: 'https://coolify.io/docs/api-reference',
                reason: 'update environment',
              },
            }),
            metadata: {},
          };
        }
        if (turn === 4) return { kind: 'text', text: JSON.stringify({ action: { type: 'connection_action', connectionId: 'coolify', operationId: 'get-app-envs', reason: 'read env updated' } }), metadata: {} };
        return { kind: 'text', text: JSON.stringify({ action: { type: 'complete', summary: 'done' } }), metadata: {} };
      },
      async completeTurnStream(messages: LlmMessage[]): Promise<LlmTurnResult> {
        return llm.completeTurn!(messages);
      },
    };

    const gitu = new Gitu({
      cwd: root,
      llm,
      mode: 'fast',
      onEvent: (text) => events.push(text),
      approvalHandler: async () => true,
      connectionActionHandler: async () => {
        readCount += 1;
        return { message: 'read env', data: { value: envValue } };
      },
      connectionOperationHandler: async () => {
        writeCount += 1;
        envValue = 'updated';
        return { message: 'updated env', data: { ok: true } };
      },
    });

    const { ledger } = await gitu.run('Update env');
    expect(readCount).toBe(2);
    expect(writeCount).toBe(1);
    expect(ledger.data.blockers.some((b) => b.includes('requested more than three times'))).toBe(false);
  }, 30000);

  it('blocks repeated identical provider reads only when no new state/evidence is produced', async () => {
    const root = project('block-stalled-reads');
    home();
    let readCount = 0;
    const events: string[] = [];
    const llm: LlmClient = {
      name: 'mock',
      async complete() {
        return '';
      },
      async completeStream() {
        return '';
      },
      async completeTurn(): Promise<LlmTurnResult> {
        return {
          kind: 'text',
          text: JSON.stringify({ action: { type: 'connection_action', connectionId: 'coolify', operationId: 'get-app-sv7-envs', reason: 'loop read' } }),
          metadata: {},
        };
      },
      async completeTurnStream(messages: LlmMessage[]): Promise<LlmTurnResult> {
        return llm.completeTurn!(messages);
      },
    };

    const gitu = new Gitu({
      cwd: root,
      llm,
      mode: 'fast',
      onEvent: (text) => events.push(text),
      connectionActionHandler: async () => {
        readCount += 1;
        return { message: 'env unchanged', data: { key: 'STATIC_VALUE' } };
      },
    });

    const { ledger } = await gitu.run('Loop read test');
    const readInvocations = events.filter((e) => e.includes('coolify/get-app-sv7-envs completed')).length;
    expect(readInvocations).toBe(3);
    expect(events.some((e) => e.includes('repeated saved connection action stopped — coolify:get-app-sv7-envs'))).toBe(true);
    expect(ledger.data.blockers.some((b) => b.includes('was requested more than three times without a new operation'))).toBe(true);
  }, 30000);

  it('does not add a stalled blocker after successful verification reads', async () => {
    const root = project('verification-reads-no-blocker');
    home();
    let readCount = 0;
    const events: string[] = [];
    let turn = 0;
    const llm: LlmClient = {
      name: 'mock',
      async complete() {
        return '';
      },
      async completeStream() {
        return JSON.stringify({ verdict: 'pass', feedback: 'ok' });
      },
      async completeTurn(messages: LlmMessage[]): Promise<LlmTurnResult> {
        turn += 1;
        if (turn === 1) return { kind: 'text', text: JSON.stringify({ action: { type: 'set_criteria', criteria: ['service verified'] } }), metadata: {} };
        if (turn === 2) return { kind: 'text', text: JSON.stringify({ action: { type: 'connection_action', connectionId: 'coolify', operationId: 'get-app-status', reason: 'initial status' } }), metadata: {} };
        if (turn === 3) return { kind: 'text', text: JSON.stringify({ action: { type: 'tool_call', stepId: 's1', tool: 'run_command', params: { command: 'node --version' }, reason: 'cmd', expected: 'exit 0' } }), metadata: {} };
        if (turn === 4) return { kind: 'text', text: JSON.stringify({ action: { type: 'connection_action', connectionId: 'coolify', operationId: 'get-app-status', reason: 'pre-verification' } }), metadata: {} };
        if (turn === 5) return { kind: 'text', text: JSON.stringify({ action: { type: 'tool_call', stepId: 's2', tool: 'run_command', params: { command: 'node -e "process.exit(0)"' }, reason: 'cmd2', expected: 'exit 0' } }), metadata: {} };
        if (turn === 6) return { kind: 'text', text: JSON.stringify({ action: { type: 'connection_action', connectionId: 'coolify', operationId: 'get-app-status', reason: 'post-verification' } }), metadata: {} };
        if (turn === 7) {
          const text = messages.map((m) => (typeof m.content === 'string' ? m.content : '')).join(' ');
          const ids = [...text.matchAll(/(ev-\d{8}-[0-9a-f]{6})/g)].map((m) => m[1]);
          return { kind: 'text', text: JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: ids.at(-1) ?? 'ev-missing' } }), metadata: {} };
        }
        if (turn === 8) return { kind: 'text', text: JSON.stringify({ action: { type: 'connection_action', connectionId: 'coolify', operationId: 'get-app-status', reason: 'final-verification' } }), metadata: {} };
        return { kind: 'text', text: JSON.stringify({ action: { type: 'complete', summary: 'all verified' } }), metadata: {} };
      },
      async completeTurnStream(messages: LlmMessage[]): Promise<LlmTurnResult> {
        return llm.completeTurn!(messages);
      },
    };

    const gitu = new Gitu({
      cwd: root,
      llm,
      mode: 'fast',
      onEvent: (text) => events.push(text),
      connectionActionHandler: async () => {
        readCount += 1;
        return { message: 'status ok', data: { status: 'running' } };
      },
    });

    const { ledger } = await gitu.run('Verification test');
    const readInvocations = events.filter((e) => e.includes('coolify/get-app-status completed')).length;
    expect(readInvocations).toBe(4);
    expect(ledger.data.blockers.length).toBe(0);
    expect(ledger.data.status).toBe('completed');
  }, 30000);
});

