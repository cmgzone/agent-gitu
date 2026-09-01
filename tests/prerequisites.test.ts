import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Gitu, Hermes } from '../src/agent/gitu.js';
import { CodeIndex } from '../src/context/code-index.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import { TaskLedger } from '../src/ledger/task-ledger.js';
import { ScriptedMockLlm, type LlmMessage } from '../src/llm/llm.js';
import { CapabilityAwareResolver, type PrerequisiteProvider } from '../src/recovery/prerequisites.js';
import { RecoveryRisk, type MissingPrerequisite } from '../src/types.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(name: string): string {
  const root = mkdtempSync(path.join(os.tmpdir(), `gitu-prerequisite-${name}-`));
  roots.push(root);
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name, type: 'module', scripts: { test: 'node --version' } }));
  return root;
}

function ledgerFor(root: string): TaskLedger {
  const guard = ProjectGuard.detect(root);
  return TaskLedger.create({ repoRoot: root, goal: 'Complete the protected migration', project: guard.lock, mode: 'fast' });
}

const postgres: MissingPrerequisite = {
  id: 'database-url',
  kind: 'connection',
  description: 'PostgreSQL connection',
  requiredFor: 'database migration',
  hints: ['DATABASE_URL'],
  riskIfWrong: 'high',
};

function provider(input: Partial<PrerequisiteProvider> = {}): PrerequisiteProvider {
  return {
    id: 'test-infrastructure',
    capabilities: [
      { id: 'projects', provider: 'test-infrastructure', actions: ['list_projects', 'list_databases'], riskClass: 'read' },
      { id: 'postgres', provider: 'test-infrastructure', actions: ['create_postgres'], riskClass: 'reversible-write' },
    ],
    ...input,
  };
}

describe('CapabilityAwareResolver', () => {
  it('reuses a compatible connected resource and records no secret value', async () => {
    const root = project('reuse');
    const ledger = ledgerFor(root);
    const resolver = new CapabilityAwareResolver({
      providers: [provider({ discover: async () => ({ status: 'resolved', source: 'existing-resource', summary: 'Reused postgres://private database db-42.', reference: 'postgres://private' }) })],
    });

    const result = await resolver.resolve(postgres, { repoRoot: root, goal: 'Run migration', ledger });

    expect(result.status).toBe('resolved');
    expect(result.attempts.some((attempt) => attempt.status === 'RESOURCE_REUSED')).toBe(true);
    expect(result.message).not.toContain('postgres://private');
    expect(JSON.stringify(ledger.data.prerequisiteRecoveries)).not.toContain('postgres://private');
  });

  it('provisions only a declared reversible resource, health-checks it, and records the action', async () => {
    const root = project('provision');
    const ledger = ledgerFor(root);
    let provisions = 0;
    let checked = 0;
    const resolver = new CapabilityAwareResolver({
      providers: [provider({
        discover: async () => ({ status: 'unresolved', summary: 'No compatible database exists.' }),
        provisionRisk: RecoveryRisk.REVERSIBLE,
        provision: async () => { provisions += 1; return { status: 'resolved', source: 'provisioned-resource', summary: 'Created database migration-db.' }; },
        healthCheck: async () => { checked += 1; return true; },
      })],
    });

    const result = await resolver.resolve(postgres, { repoRoot: root, goal: 'Run migration', ledger });

    expect(result.status).toBe('resolved');
    expect(provisions).toBe(1);
    expect(checked).toBe(1);
    expect(ledger.data.prerequisiteRecoveries?.some((record) => record.status === 'RESOURCE_PROVISIONED')).toBe(true);
  });

  it('asks for a target rather than guessing between equally plausible resources', async () => {
    const root = project('ambiguous');
    const ledger = ledgerFor(root);
    let provisions = 0;
    const resolver = new CapabilityAwareResolver({
      providers: [provider({
        discover: async () => ({
          status: 'needs-user', summary: 'Two production applications are plausible targets.',
          candidates: [{ id: 'api-prod', label: 'api-prod' }, { id: 'api-v2-prod', label: 'api-v2-prod' }],
        }),
        provision: async () => { provisions += 1; return { status: 'resolved', summary: 'should not run' }; },
      })],
    });

    const result = await resolver.resolve(postgres, { repoRoot: root, goal: 'Run migration', ledger });

    expect(result.status).toBe('needs-user');
    expect(result.question?.options).toEqual(['api-prod', 'api-v2-prod']);
    expect(provisions).toBe(0);
  });

  it('does not auto-provision costly/destructive resources or let a specialist bypass parent policy', async () => {
    const root = project('policy');
    const ledger = ledgerFor(root);
    let provisions = 0;
    const resolver = new CapabilityAwareResolver({
      providers: [provider({
        provisionRisk: RecoveryRisk.DESTRUCTIVE,
        provision: async () => { provisions += 1; return { status: 'resolved', summary: 'should not run' }; },
      })],
    });

    expect((await resolver.resolve(postgres, { repoRoot: root, goal: 'Run migration', ledger })).status).toBe('exhausted');
    expect((await resolver.resolve({ ...postgres, id: 'specialist-db' }, { repoRoot: root, goal: 'Run migration', ledger, specialist: true })).status).toBe('exhausted');
    expect(provisions).toBe(0);
  });

  it('rolls back an unhealthy provision and never loops through the same recovery strategy twice', async () => {
    const root = project('rollback');
    const ledger = ledgerFor(root);
    let provisions = 0;
    let rollbacks = 0;
    const resolver = new CapabilityAwareResolver({
      providers: [provider({
        provisionRisk: RecoveryRisk.REVERSIBLE,
        discover: async () => ({ status: 'unresolved', summary: 'No database exists.' }),
        provision: async () => { provisions += 1; return { status: 'resolved', source: 'provisioned-resource', summary: 'Created database.' }; },
        healthCheck: async () => false,
        rollback: async () => { rollbacks += 1; },
      })],
    });

    expect((await resolver.resolve(postgres, { repoRoot: root, goal: 'Run migration', ledger })).status).toBe('exhausted');
    expect((await resolver.resolve(postgres, { repoRoot: root, goal: 'Run migration', ledger })).status).toBe('exhausted');
    expect(provisions).toBe(1);
    expect(rollbacks).toBe(1);
  });

  it('discovers configured environment availability without exposing the value', async () => {
    const root = project('environment');
    const ledger = ledgerFor(root);
    const previous = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgres://not-for-ledger';
    try {
      const result = await new CapabilityAwareResolver().resolve(postgres, { repoRoot: root, goal: 'Run migration', ledger });
      expect(result.status).toBe('resolved');
      expect(result.message).toContain('DATABASE_URL');
      expect(JSON.stringify(ledger.data.prerequisiteRecoveries)).not.toContain('postgres://not-for-ledger');
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });
});

describe('Gitu prerequisite blocking flow', () => {
  it('resolves a missing prerequisite before honoring request_block, then continues the task', async () => {
    const root = project('agent-flow');
    const seen: string[] = [];
    const capture = (reply: (messages: LlmMessage[]) => string) => (_turn: number, messages: LlmMessage[]) => {
      seen.push(...messages.filter((message) => message.role === 'user' && typeof message.content === 'string').map((message) => message.content as string));
      return reply(messages);
    };
    const llm = new ScriptedMockLlm([
      capture(() => JSON.stringify({ action: { type: 'set_criteria', criteria: ['migration is verified'] } })),
      capture(() => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify migration', verification: 'node --version' }] } })),
      capture(() => JSON.stringify({ action: { type: 'request_block', reason: 'DATABASE_URL missing', prerequisite: postgres } })),
      capture(() => JSON.stringify({ action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify runtime', expected: 'exit 0' } })),
      capture((messages) => {
        const match = messages.map((message) => typeof message.content === 'string' ? message.content : '').join(' ').match(/(ev-\d{8}-[0-9a-f]{6})/);
        return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: match?.[1] ?? 'ev-missing' } });
      }),
      capture(() => JSON.stringify({ action: { type: 'complete', summary: 'done', risks: [], followUps: [] } })),
    ]);
    const gitu = new Gitu({
      cwd: root,
      llm,
      mode: 'fast',
      prerequisiteRecovery: {
        providers: [provider({ discover: async () => ({ status: 'resolved', source: 'existing-resource', summary: 'Reused an authorized database.' }) })],
      },
    });

    const { report, ledger } = await gitu.run('Run the database migration');

    expect(report.status).toBe('complete');
    expect(ledger.data.blockers).toEqual([]);
    expect(ledger.data.prerequisiteRecoveries?.some((record) => record.status === 'RESOURCE_REUSED')).toBe(true);
    expect(seen.some((message) => message.includes('PREREQUISITE RESOLVED'))).toBe(true);
  }, 30000);

  it('opens a host-owned secure connection request and retries discovery after the user saves it', async () => {
    const root = project('secure-connection-flow');
    let connectionSaved = false;
    let requests = 0;
    const remotePrerequisite: MissingPrerequisite = {
      id: 'platform-servers',
      kind: 'credential',
      description: 'platform API access',
      requiredFor: 'discover deployment targets',
      providerHint: 'platform-api',
      capabilities: ['servers.read'],
      connectionSetup: {
        label: 'Platform production',
        baseUrl: 'https://platform.example.test',
        documentationUrl: 'https://docs.example.test/api',
        validationPath: '/api/v1/servers',
        validationCapability: 'servers.read',
      },
      riskIfWrong: 'high',
    };
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['runtime is verified'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify runtime', verification: 'node --version' }] } }),
      () => JSON.stringify({ action: { type: 'request_block', reason: 'platform API access is required', prerequisite: remotePrerequisite } }),
      () => JSON.stringify({ action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify runtime', expected: 'exit 0' } }),
      (_turn, messages) => {
        const match = messages.map((message) => typeof message.content === 'string' ? message.content : '').join(' ').match(/(ev-\d{8}-[0-9a-f]{6})/);
        return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: match?.[1] ?? 'ev-missing' } });
      },
      () => JSON.stringify({ action: { type: 'complete', summary: 'done', risks: [], followUps: [] } }),
    ]);
    const { report, ledger } = await new Gitu({
      cwd: root,
      llm,
      mode: 'fast',
      prerequisiteRecovery: {
        providers: [provider({ discover: async () => connectionSaved
          ? { status: 'resolved', source: 'existing-resource', summary: 'Saved platform connection validated.' }
          : { status: 'unresolved', summary: 'No saved platform connection exists.' } })],
      },
      connectionRequestHandler: async (requested) => {
        requests += 1;
        expect(requested.providerHint).toBe('platform-api');
        expect(requested.capabilities).toEqual(['servers.read']);
        expect(requested.connectionSetup).toMatchObject({ baseUrl: 'https://platform.example.test', validationPath: '/api/v1/servers' });
        connectionSaved = true;
        return true;
      },
    }).run('Discover deployment targets');

    expect(report.status).toBe('complete');
    expect(requests).toBe(1);
    expect(ledger.data.prerequisiteRecoveries?.some((record) => record.strategy === 'secure-connection-request' && record.status === 'NEEDS_USER')).toBe(true);
    expect(ledger.data.blockers).toEqual([]);
  }, 30000);

  it('proposes a documented provider write through the host approval channel and continues after it runs', async () => {
    const root = project('approved-provider-operation');
    const requests: unknown[] = [];
    const llm = new ScriptedMockLlm([
      () => JSON.stringify({ action: { type: 'set_criteria', criteria: ['runtime is verified'] } }),
      () => JSON.stringify({ action: { type: 'set_plan', steps: [{ description: 'verify runtime', verification: 'node --version' }] } }),
      () => JSON.stringify({ action: { type: 'connection_operation', connectionId: 'platform-api', operation: { id: 'create-database', label: 'Create PostgreSQL database', capability: 'databases.create', method: 'POST', path: '/api/v1/databases', risk: 'reversible-write' }, body: { name: 'preview-db' }, documentationUrl: 'https://docs.example.test/api/databases', reason: 'create the approved preview database' } }),
      () => JSON.stringify({ action: { type: 'tool_call', stepId: 'step-1', tool: 'run_command', params: { command: 'node --version' }, reason: 'verify runtime', expected: 'exit 0' } }),
      (_turn, messages) => {
        const match = messages.map((message) => typeof message.content === 'string' ? message.content : '').join(' ').match(/(ev-\d{8}-[0-9a-f]{6})/);
        return JSON.stringify({ action: { type: 'claim_criterion', criterionId: 'ac-1', evidenceId: match?.[1] ?? 'ev-missing' } });
      },
      () => JSON.stringify({ action: { type: 'complete', summary: 'provider task complete', risks: [], followUps: [] } }),
    ]);

    const { report, ledger } = await new Gitu({
      cwd: root,
      llm,
      mode: 'fast',
      connectionOperationHandler: async (proposal) => {
        requests.push(proposal);
        expect(proposal).toMatchObject({
          connectionId: 'platform-api',
          operation: { id: 'create-database', method: 'POST', capability: 'databases.create', risk: 'reversible-write' },
          body: { name: 'preview-db' },
        });
        return { message: 'Create PostgreSQL database succeeded (HTTP 201).', data: { id: 'database-42' } };
      },
    }).run('Create a preview database');

    expect(report.status).toBe('complete');
    expect(requests).toHaveLength(1);
    expect(ledger.data.blockers).toEqual([]);
  }, 30000);

  it('keeps Hermes as a compatibility alias', () => {
    expect(Hermes).toBe(Gitu);
  });

  it('closes resources it owns when chat mode returns early', async () => {
    const root = project('owned-resources');
    const close = vi.spyOn(CodeIndex.prototype, 'close');
    try {
      const { report } = await new Gitu({
        cwd: root,
        llm: new ScriptedMockLlm([() => 'Hello from Gitu.']),
        mode: 'chat',
      }).run('say hello');
      expect(report.status).toBe('complete');
      expect(close).toHaveBeenCalledTimes(1);
    } finally {
      close.mockRestore();
    }
  });
});
