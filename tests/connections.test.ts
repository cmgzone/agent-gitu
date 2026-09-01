import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConnectionRegistry } from '../src/connections/connections.js';
import { Executor } from '../src/executor/executor.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { LoopDetector } from '../src/loop/loop-detector.js';
import { PolicyEngine } from '../src/policy/policy.js';
import { CapabilityAwareResolver } from '../src/recovery/prerequisites.js';
import { SkillStore } from '../src/skills/skills.js';
import type { MissingPrerequisite } from '../src/types.js';

const homes: string[] = [];
const previousHome = process.env.AGENT_GITU_HOME;
const originalFetch = globalThis.fetch;

function home(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-connections-'));
  homes.push(root);
  process.env.AGENT_GITU_HOME = root;
  return root;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (previousHome === undefined) delete process.env.AGENT_GITU_HOME;
  else process.env.AGENT_GITU_HOME = previousHome;
  for (const root of homes.splice(0)) rmSync(root, { recursive: true, force: true });
});

const prerequisite: MissingPrerequisite = {
  id: 'platform-servers',
  kind: 'credential',
  description: 'platform API access',
  requiredFor: 'discover available servers',
  providerHint: 'platform-api',
  capabilities: ['servers.read'],
  riskIfWrong: 'high',
};

describe('ConnectionRegistry', () => {
  it('keeps credentials out of profiles and global provider skills while validating through an allowlisted request', async () => {
    const root = home();
    const secret = 'private-token-must-not-appear';
    let request: { url: string; authorization: string | null; method: string } | undefined;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      request = {
        url: String(input),
        authorization: new Headers(init?.headers).get('authorization'),
        method: String(init?.method),
      };
      return new Response(JSON.stringify({ servers: [{ id: 'srv-1' }], token: 'provider-response-secret' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;

    const registry = new ConnectionRegistry();
    const saved = registry.save({
      label: 'Platform production',
      provider: 'platform-api',
      baseUrl: 'https://platform.example.test',
      documentationUrl: 'https://docs.example.test/api',
      capabilities: ['servers.read'],
      operations: [{ id: 'validate', label: 'List servers', capability: 'servers.read', method: 'GET', path: '/api/v1/servers', risk: 'read' }],
      token: secret,
    });
    const result = await registry.validate(saved.id);

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ servers: [{ id: 'srv-1' }], token: '<redacted>' });
    expect(request).toEqual({ url: 'https://platform.example.test/api/v1/servers', authorization: `Bearer ${secret}`, method: 'GET' });
    const settings = readFileSync(path.join(root, 'Settings', 'connections.json'), 'utf8');
    const skill = readFileSync(path.join(root, 'Skills', `gitu-provider-${saved.id}.json`), 'utf8');
    expect(settings).not.toContain(secret);
    expect(skill).not.toContain(secret);
    expect(skill).toContain('credentials are kept separately');
    expect(registry.list()[0]).toMatchObject({ id: saved.id, hasCredential: true, lastValidationStatus: 'ok' });
    expect(JSON.stringify(registry.list())).not.toContain(secret);
  });

  it('rejects unsafe endpoints and does not let a profile register an unbounded URL', () => {
    home();
    const registry = new ConnectionRegistry();
    expect(() => registry.save({
      label: 'Unsafe', provider: 'unsafe', baseUrl: 'http://example.test', capabilities: ['servers.read'], token: 'x',
      operations: [{ id: 'validate', label: 'Validate', capability: 'servers.read', method: 'GET', path: '/api/v1/servers?all=true', risk: 'read' }],
    })).toThrow(/HTTPS endpoint/);
    expect(() => registry.save({
      label: 'Unsafe path', provider: 'unsafe', baseUrl: 'https://example.test', capabilities: ['servers.read'], token: 'x',
      operations: [{ id: 'validate', label: 'Validate', capability: 'servers.read', method: 'GET', path: '/../token', risk: 'read' }],
    })).toThrow(/safe operation/);
  });

  it('permits agents to use registered read operations only', async () => {
    home();
    const registry = new ConnectionRegistry();
    registry.save({
      label: 'Platform', provider: 'platform-api', baseUrl: 'https://platform.example.test', capabilities: ['servers.read', 'servers.write'], token: 'private-token',
      operations: [
        { id: 'validate', label: 'Validate', capability: 'servers.read', method: 'GET', path: '/api/v1/servers', risk: 'read' },
        { id: 'create-server', label: 'Create server', capability: 'servers.write', method: 'POST', path: '/api/v1/servers', risk: 'reversible-write' },
      ],
    });
    await expect(registry.invokeRead('platform-api', 'create-server')).rejects.toThrow(/read-only GET/);
  });

  it('runs an exact approved provider write while keeping credentials and operation ids constrained', async () => {
    home();
    let request: { method?: string; url?: string; body?: string | undefined } | undefined;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      request = { method: init?.method, url: String(input), body: typeof init?.body === 'string' ? init.body : undefined };
      return new Response(JSON.stringify({ id: 'database-42', password: 'provider-secret' }), { status: 201, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    const registry = new ConnectionRegistry();
    const saved = registry.save({
      label: 'Platform', provider: 'platform-api', baseUrl: 'https://platform.example.test', capabilities: ['servers.read', 'databases.create'], token: 'private-token',
      operations: [{ id: 'validate', label: 'Validate', capability: 'servers.read', method: 'GET', path: '/api/v1/servers', risk: 'read' }],
    });
    const operation = registry.registerApprovedOperation(saved.id, {
      id: 'create-database', label: 'Create PostgreSQL database', capability: 'databases.create', method: 'POST', path: '/api/v1/databases', risk: 'reversible-write',
    });
    const result = await registry.invoke(saved.id, operation.id, { name: 'gitu-preview' });

    expect(request).toEqual({ method: 'POST', url: 'https://platform.example.test/api/v1/databases', body: JSON.stringify({ name: 'gitu-preview' }) });
    expect(result.data).toEqual({ id: 'database-42', password: '<redacted>' });
    expect(registry.operation(saved.id, operation.id)).toEqual(operation);
    expect(() => registry.registerApprovedOperation(saved.id, { ...operation, path: '/api/v1/other-databases' })).toThrow(/already registered with different details/);
    await expect(registry.invoke(saved.id, operation.id, { api_key: 'must-not-be-sent' })).rejects.toThrow(/credential-like field/i);
  });

  it('exposes a matching saved connection to generic prerequisite recovery and can rerun after user setup', async () => {
    const root = home();
    globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch;
    const registry = new ConnectionRegistry();
    const resolver = new CapabilityAwareResolver({ providers: [registry.asPrerequisiteProvider()] });
    const ledger = TaskLedger.create({ repoRoot: root, goal: 'discover servers', project: { name: 'test', repoRoot: root, techStack: [], testCommand: 'node --version', hasGit: false }, mode: 'fast' });

    expect((await resolver.resolve(prerequisite, { repoRoot: root, goal: 'discover servers', ledger })).status).toBe('exhausted');
    registry.save({
      label: 'Platform', provider: 'platform-api', baseUrl: 'https://platform.example.test', capabilities: ['servers.read'], token: 'private-token',
      operations: [{ id: 'validate', label: 'Validate', capability: 'servers.read', method: 'GET', path: '/api/v1/servers', risk: 'read' }],
    });
    const retried = await resolver.resolve(prerequisite, { repoRoot: root, goal: 'discover servers', ledger, retry: true });

    expect(retried.status).toBe('resolved');
    expect(retried.message).toContain('Validated saved connection');
    expect(JSON.stringify(ledger.data.prerequisiteRecoveries)).not.toContain('private-token');
    const skill = new SkillStore('', SkillStore.globalSkillsDir()).get('gitu-provider-platform-api');
    expect(skill?.requires?.capabilities).toEqual(['servers.read']);
  });

  it('preserves safe documentation defaults so a reconnection can ask for only an API key', () => {
    home();
    const registry = new ConnectionRegistry();
    registry.save({
      label: 'Platform production', provider: 'platform-api', baseUrl: 'https://platform.example.test', documentationUrl: 'https://docs.example.test/api', capabilities: ['servers.read'], token: 'private-token',
      operations: [{ id: 'validate', label: 'List servers', capability: 'servers.read', method: 'GET', path: '/api/v1/servers', risk: 'read' }],
    });

    const requirement = registry.requirementFor({
      ...prerequisite,
      connectionSetup: {
        label: 'Untrusted model label',
        baseUrl: 'https://untrusted.example.test',
        documentationUrl: 'https://untrusted.example.test/docs',
        validationPath: '/wrong',
        validationCapability: 'servers.read',
      },
    });

    expect(requirement.setup).toEqual({
      label: 'Platform production',
      baseUrl: 'https://platform.example.test',
      documentationUrl: 'https://docs.example.test/api',
      validationPath: '/api/v1/servers',
      validationCapability: 'servers.read',
    });
    expect(JSON.stringify(requirement)).not.toContain('private-token');
  });

  it('activates a newly saved provider skill by alias without restarting the executor', async () => {
    const root = home();
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'connection-alias' }));
    const guard = ProjectGuard.detect(root);
    const ledger = TaskLedger.create({ repoRoot: root, goal: 'use a saved connection', project: guard.lock, mode: 'fast' });
    const registry = new ConnectionRegistry();
    const skills = SkillStore.forProject(root);
    const executor = new Executor(
      guard,
      ledger,
      new PolicyEngine(false),
      new LoopDetector(),
      undefined,
      skills,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      () => registry.asPrerequisiteProvider().capabilities.map((capability) => capability.id),
    );

    // This happens after Executor construction, exactly as it does when a
    // paused run resumes from the secure connection form.
    const saved = registry.save({
      label: 'Coolify production',
      provider: 'coolify',
      baseUrl: 'https://platform.example.test',
      capabilities: ['servers.read'],
      token: 'private-token',
      operations: [{ id: 'validate', label: 'List servers', capability: 'servers.read', method: 'GET', path: '/api/v1/servers', risk: 'read' }],
    });

    const outcome = await executor.execute({
      tool: 'use_skill',
      params: { name: 'coolify' },
      reason: 'use the saved provider connection',
      expected: 'the provider skill is available through its alias',
    });

    expect(saved.id).toBe('coolify');
    expect(outcome.result.ok).toBe(true);
    expect(outcome.result.output).toContain('SKILL gitu-provider-coolify@');
    expect(outcome.result.output).not.toContain('private-token');
  });
});

describe('ConnectionRegistry invocation outcomes', () => {
  function registryWithApprovedWrite(): { registry: ConnectionRegistry; id: string; operationId: string } {
    home();
    const registry = new ConnectionRegistry();
    const saved = registry.save({
      label: 'Coolify', provider: 'coolify', baseUrl: 'https://coolify.example.test', capabilities: ['servers.read', 'databases.create'], token: 'private-token',
      operations: [{ id: 'validate', label: 'Validate', capability: 'servers.read', method: 'GET', path: '/api/v1/servers', risk: 'read' }],
    });
    const operation = registry.registerApprovedOperation(saved.id, {
      id: 'create-database', label: 'Create database', capability: 'databases.create', method: 'POST', path: '/api/v1/databases', risk: 'reversible-write',
    });
    return { registry, id: saved.id, operationId: operation.id };
  }

  const readOutcome = (error: unknown): string | undefined => (error as { outcome?: string }).outcome;

  it('surfaces the provider error body and marks a refused request as sent-rejected', async () => {
    const { registry, id, operationId } = registryWithApprovedWrite();
    globalThis.fetch = (async () => new Response(JSON.stringify({ message: 'type is required' }), { status: 422 })) as typeof fetch;
    const err = await registry.invoke(id, operationId, { project_name: 'x' }).catch((e: Error) => e);
    expect(readOutcome(err)).toBe('sent-rejected');
    expect(err.message).toContain('HTTP 422');
    expect(err.message).toContain('type is required');
  });

  it('marks a mid-flight transport failure as sent-unknown, never "not run"', async () => {
    const { registry, id, operationId } = registryWithApprovedWrite();
    globalThis.fetch = (async () => {
      throw new Error('socket reset');
    }) as typeof fetch;
    const err = await registry.invoke(id, operationId, { project_name: 'x' }).catch((e: Error) => e);
    expect(readOutcome(err)).toBe('sent-unknown');
    expect(err.message).toContain('may or may not have received');
  });

  it('reports a 2xx write whose response cannot be read as sent-unknown (possibly completed)', async () => {
    const { registry, id, operationId } = registryWithApprovedWrite();
    globalThis.fetch = (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.error(new Error('stream died'));
          },
        }),
        { status: 200 },
      )) as typeof fetch;
    const err = await registry.invoke(id, operationId, { project_name: 'x' }).catch((e: Error) => e);
    expect(readOutcome(err)).toBe('sent-unknown');
    expect(err.message).toContain('POSSIBLY completed');
  });

  it('keeps true pre-flight refusals as not-run', async () => {
    const { registry, id } = registryWithApprovedWrite();
    const err = await registry.invoke(id, 'unknown-operation').catch((e: Error) => e);
    expect(readOutcome(err)).toBe('not-run');
  });
});
