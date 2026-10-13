import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompanyStore } from '../src/company/store.js';
import { CompanyOrganization } from '../src/company/organization.js';
import { CoworkStore } from '../src/cowork/store.js';
import { companyApi } from '../src/company/api.js';
import { coworkNativeTools, executeCoworkTool } from '../src/cowork/tools.js';
import type { CompanyActor } from '../src/company/management-models.js';

const director: CompanyActor = { kind: 'director' };
const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup
    .splice(0)
    .reverse()
    .forEach((fn) => fn());
});
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-organization-')),
    store = new CompanyStore(root);
  cleanup.push(() => {
    store.close();
    rmSync(root, { recursive: true, force: true });
  });
  const company = store.create({ purpose: 'Research', monthlyBudgetUsd: null, maxFileBytes: null, connectionIds: ['api-1', 'api-2'], accountIds: ['mail-1'] });
  const cowork = new CoworkStore(undefined, undefined, { companyId: company.id, persistence: store.snapshot(company.id) });
  const ceo = cowork.saveAgent({ name: 'Ari', systemPrompt: 'Lead', chiefOfStaff: true, allowWrites: true });
  const leader = cowork.saveAgent({ name: 'Nia', systemPrompt: 'Lead design', chiefOfStaff: true, allowWrites: true });
  const employee = cowork.saveAgent({ name: 'Milo', systemPrompt: 'Research', allowWrites: true });
  store.update(company.id, { leadId: ceo.id });
  const organization = new CompanyOrganization(store, company.id, cowork);
  const patch = (id: string, member: Parameters<CompanyOrganization['updateMember']>[2], actor = director) =>
    organization.updateMember(actor, id, member, organization.snapshot().revision);
  return { root, store, company, cowork, ceo, leader, employee, organization, patch };
}
describe('Company organizational authority', () => {
  it('migrates existing staff as active using stable reporting IDs and preserves profile permissions', () => {
    const f = fixture(),
      before = f.cowork.listAgents();
    const record = f.organization.snapshot();
    expect(record.members.find((m) => m.agentId === f.ceo.id)?.role).toBe('ceo');
    expect(record.members.find((m) => m.agentId === f.leader.id)?.role).toBe('team-leader');
    expect(record.members.find((m) => m.agentId === f.employee.id)?.managerId).toBe(f.ceo.id);
    expect(record.members.every((m) => m.status === 'active')).toBe(true);
    expect(f.cowork.listAgents()).toEqual(before);
    expect(f.organization.events()).toHaveLength(1);
    expect(f.organization.snapshot().revision).toBe(record.revision);
    expect(f.organization.events()).toHaveLength(1);
  });
  it('rejects foreign roster ownership, agents, departments and resource grants', () => {
    const f = fixture(),
      other = f.store.create({ purpose: 'Other' });
    expect(() => new CompanyOrganization(f.store, other.id, f.cowork)).toThrow('scoped roster');
    expect(() => f.organization.member('someone-else')).toThrow('permanent');
    expect(() => f.patch(f.employee.id, { departmentId: 'foreign-department' })).toThrow('another company');
    expect(() => f.patch(f.employee.id, { authority: { capabilities: [], connectionIds: ['foreign-key'] } })).toThrow('subset');
    expect(() => f.patch(f.employee.id, { authority: { capabilities: [], accountIds: ['foreign-mail'] } })).toThrow('subset');
  });
  it('prevents agents changing their own role, status, capability grants or enforcement fields', () => {
    const f = fixture(),
      actor: CompanyActor = { kind: 'agent', agentId: f.ceo.id };
    expect(() => f.patch(f.ceo.id, { role: 'ceo' }, actor)).toThrow('Only the director');
    expect(() => f.patch(f.employee.id, { authority: { capabilities: ['assign-work'] } }, actor)).toThrow('Only the director');
    expect(() => f.patch(f.employee.id, { status: 'active' }, actor)).toThrow('Only the director');
    expect(() => f.patch(f.ceo.id, { jobTitle: 'Own manager' }, actor)).toThrow('own authority');
    expect(() => f.patch(f.employee.id, { allowConfig: true } as never)).toThrow('Only the director');
  });
  it('permits department organization and bounded reporting updates, not title-based authority', () => {
    const f = fixture(),
      department = f.organization.saveDepartment({ kind: 'agent', agentId: f.ceo.id }, { name: 'Design' });
    f.patch(f.leader.id, { departmentId: department.id });
    f.organization.saveDepartment(director, { id: department.id, leaderId: f.leader.id });
    f.patch(f.employee.id, { departmentId: department.id, managerId: f.leader.id });
    f.patch(f.employee.id, { jobTitle: 'Chief Executive Officer', responsibilities: ['Research requirements'] }, { kind: 'agent', agentId: f.leader.id });
    expect(f.organization.member(f.employee.id).role).toBe('employee');
    expect(f.organization.authorizeTool(f.employee.id, 'mission_manage', { action: 'create' })?.ok).toBe(false);
    expect(() => f.patch(f.employee.id, { managerId: f.ceo.id }, { kind: 'agent', agentId: f.leader.id })).toThrow('outside');
    expect(() => f.organization.saveDepartment({ kind: 'agent', agentId: f.employee.id }, { name: 'Rogue' })).toThrow('authority');
  });
  it('rejects reporting cycles and a second CEO without changing the stored revision', () => {
    const f = fixture();
    f.patch(f.employee.id, { role: 'team-leader', authority: { capabilities: [] }, managerId: f.leader.id });
    const revision = f.organization.snapshot().revision;
    expect(() => f.patch(f.leader.id, { managerId: f.employee.id })).toThrow('cycle');
    expect(() => f.patch(f.employee.id, { role: 'ceo' })).toThrow('single CEO');
    expect(f.organization.snapshot().revision).toBe(revision);
  });
  it('intersects tool/API/account restrictions at runtime and checks live revocation', () => {
    const f = fixture();
    f.patch(f.employee.id, { authority: { capabilities: [], tools: ['web_search', 'connected_apps'], connectionIds: ['api-1'], accountIds: [] } });
    expect(f.organization.authorizeTool(f.employee.id, 'web_search', { connectionId: 'api-1' })).toBeUndefined();
    expect(f.organization.authorizeTool(f.employee.id, 'web_search', { connectionId: 'api-2' })?.ok).toBe(false);
    expect(f.organization.authorizeTool(f.employee.id, 'web_search', {})?.ok).toBe(false);
    expect(f.organization.authorizeTool(f.employee.id, 'run_command', {})?.ok).toBe(false);
    expect(f.organization.authorizeTool(f.employee.id, 'connected_apps', { action: 'execute', accountId: 'mail-1' })?.ok).toBe(false);
    f.patch(f.employee.id, { authority: { capabilities: [], tools: [] } });
    expect(f.organization.authorizeTool(f.employee.id, 'web_search', { connectionId: 'api-1' })?.ok).toBe(false);
    expect(f.organization.authorizeTool(f.employee.id, 'company_organization', { action: 'read' })).toBeUndefined();
  });
  it('bounds work assignment to active employees in the leader’s reporting tree', () => {
    const f = fixture();
    expect(f.organization.authorizeTool(f.leader.id, 'mission_manage', { action: 'create', agentId: f.employee.id })?.ok).toBe(false);
    f.patch(f.employee.id, { managerId: f.leader.id });
    expect(f.organization.authorizeTool(f.leader.id, 'mission_manage', { action: 'create', agentId: f.employee.id })).toBeUndefined();
    f.patch(f.employee.id, { status: 'suspended' });
    expect(f.organization.authorizeTool(f.ceo.id, 'mission_manage', { action: 'create', agentId: f.employee.id })?.ok).toBe(false);
    expect(f.organization.authorizeTool(f.employee.id, 'write_file', {})?.ok).toBe(false);
    expect(f.organization.authorizeTool('foreign-agent', 'read_file', {})?.ok).toBe(false);
  });
  it('requires onboarding for new permanent staff and prevents suspension/resume bypass', () => {
    const f = fixture();
    f.organization.snapshot();
    const newcomer = f.cowork.saveAgent({ name: 'New employee', systemPrompt: 'Learn', allowWrites: true });
    expect(f.organization.member(newcomer.id).status).toBe('onboarding');
    expect(f.organization.authorizeTool(newcomer.id, 'write_file', {})?.ok).toBe(false);
    expect(() => f.patch(newcomer.id, { status: 'active' })).toThrow('onboarding');
    f.patch(newcomer.id, { status: 'suspended' });
    expect(() => f.patch(newcomer.id, { status: 'active' })).toThrow('onboarding');
  });
  it('rejects stale updates and preserves audit records across restart', () => {
    const f = fixture(),
      revision = f.organization.snapshot().revision;
    f.patch(f.employee.id, { responsibilities: ['Check facts'] });
    expect(() => f.organization.updateMember(director, f.employee.id, { jobTitle: 'Stale' }, revision)).toThrow('Refresh');
    const reopened = new CompanyStore(f.root);
    try {
      const roster = new CoworkStore(undefined, undefined, { companyId: f.company.id, persistence: reopened.snapshot(f.company.id) });
      const organization = new CompanyOrganization(reopened, f.company.id, roster);
      expect(organization.member(f.employee.id).responsibilities).toEqual(['Check facts']);
      expect(organization.events().map((e) => e.kind)).toEqual(['organization.legacy-migrated', 'member.updated']);
    } finally {
      reopened.close();
    }
  });
  it('serves scoped owner organization updates and invalidates active agent work', async () => {
    const f = fixture(),
      invalidateAgent = vi.fn();
    let input: Record<string, unknown> = {},
      response: any;
    const deps = {
      store: f.store,
      cowork: () => f.cowork,
      scoped: <T>(_company: unknown, work: () => T) => work(),
      body: async () => input,
      send: (_res: unknown, status: number, value: unknown) => {
        response = { status, ...(value as object) };
      },
      legacyAgent: () => undefined,
      routeCowork: async () => false,
      start: () => {},
      pause: () => {},
      invalidateAgent,
    };
    const url = '/api/companies/' + f.company.id;
    await companyApi({} as never, {} as never, url + '/organization', 'GET', deps);
    expect(response.organization.companyId).toBe(f.company.id);
    input = { revision: response.organization.revision, member: { authority: { capabilities: [], tools: [] } } };
    await companyApi({} as never, {} as never, url + '/organization/members/' + f.employee.id, 'PATCH', deps);
    expect(invalidateAgent).toHaveBeenCalledWith(f.employee.id);
    expect(response.status).toBe(200);
    input = { revision: response.organization.revision, member: { authority: { capabilities: [] } } };
    await expect(companyApi({} as never, {} as never, url + '/organization/members/foreign-agent', 'PATCH', deps)).rejects.toThrow('not found');
    expect(invalidateAgent).toHaveBeenCalledTimes(1);
  });
  it('exposes organization discovery only to Company agents', () => {
    const f = fixture();
    expect(coworkNativeTools(f.employee, false).some((t) => t.name === 'company_organization')).toBe(true);
    expect(coworkNativeTools({ ...f.employee, companyId: undefined }, false).some((t) => t.name === 'company_organization')).toBe(false);
  });
  it('lets a director-authorized team leader assign a real existing-runtime mission without promoting technical grants', async () => {
    const f = fixture();
    f.patch(f.employee.id, { role: 'team-leader', authority: { capabilities: ['assign-work'] } });
    const conversation = f.cowork.saveConversation({ kind: 'dm', memberIds: [f.employee.id], chiefId: f.employee.id, title: 'Assigned work' });
    const ctx = {
      cwd: f.root,
      guard: {} as never,
      companyOrganization: async () => ({ ok: true, output: '' }),
      authorizeTool: async (tool: string, args: Record<string, unknown>) => f.organization.authorizeTool(f.employee.id, tool, args),
    };
    const perms = { allowWrites: true, allowShell: false, allowConfig: false, chief: false, browser: false };
    const scope = { store: f.cowork, agent: f.employee, memory: {} as never, conversationId: conversation.id };
    const result = await executeCoworkTool(ctx, 'mission_manage', { action: 'create', goal: 'Verify requirements', criteria: ['Evidence provided'] }, perms, scope);
    expect(result.ok).toBe(true);
    expect(f.cowork.missions()).toHaveLength(1);
    const denied = await executeCoworkTool(ctx, 'mission_manage', { action: 'create', goal: 'Take over CEO work', agentId: f.ceo.id }, perms, scope);
    expect(denied.ok).toBe(false);
    expect(f.cowork.missions()).toHaveLength(1);
    expect(f.cowork.getAgent(f.employee.id)?.allowShell).toBe(false);
    expect(f.cowork.getAgent(f.employee.id)?.chiefOfStaff).toBe(false);
  });
  it('narrows temporary helpers to their permanent parent’s resource grants without management authority', () => {
    const f = fixture();
    f.patch(f.ceo.id, { authority: { capabilities: ['assign-work', 'propose-staff'], connectionIds: ['api-1'], accountIds: [] } });
    const conversation = f.cowork.saveConversation({ kind: 'dm', memberIds: [f.ceo.id], chiefId: f.ceo.id, title: 'Helper work' });
    const helper = f.cowork.createSubAgent({
      conversationId: conversation.id,
      parentAgentId: f.ceo.id,
      rootAgentId: f.ceo.id,
      spawnedBy: { agentId: f.ceo.id, reason: 'Research' },
      depth: 1,
      maxDepth: 2,
      permissions: { allowShell: false, allowWrites: false, allowConfig: false, browser: false },
      skills: [],
      role: 'Researcher',
      objective: 'Read sources',
    });
    expect(f.organization.authorizeTool(helper.id, 'web_search', { connectionId: 'api-1' })).toBeUndefined();
    expect(f.organization.authorizeTool(helper.id, 'web_search', { connectionId: 'api-2' })?.ok).toBe(false);
    expect(f.organization.authorizeTool(helper.id, 'team_manage', { action: 'create' })?.ok).toBe(false);
    expect(f.organization.authorizeTool(helper.id, 'mission_manage', { action: 'create' })?.ok).toBe(false);
    expect(f.organization.context(helper.id)).toContain('no management authority');
  });
  it('never falls back to legacy Cowork data or artifact folders for a new Company store', () => {
    const f = fixture();
    vi.stubEnv('AGENT_GITU_HOME', f.root);
    cleanup.push(() => vi.unstubAllEnvs());
    const legacy = new CoworkStore();
    legacy.saveAgent({ name: 'Legacy colleague', systemPrompt: 'Keep legacy work' });
    const file = path.join(f.root, 'Cowork', 'cowork.json'),
      before = readFileSync(file);
    const empty = new CoworkStore(undefined, undefined, { companyId: 'isolated-company', persistence: { read: () => undefined, write: () => {} } });
    expect(empty.listAgents()).toEqual([]);
    const agent = empty.saveAgent({ name: 'Scoped colleague', systemPrompt: 'Company work' });
    const conversation = empty.saveConversation({ kind: 'dm', memberIds: [agent.id], title: 'Scoped work' });
    const source = path.join(f.root, 'sample.dat');
    writeFileSync(source, 'sample');
    const artifact = empty.addArtifactFile({ conversationId: conversation.id, name: 'sample.dat', mime: 'application/octet-stream', sourcePath: source });
    expect(empty.artifactPath(artifact.id)?.startsWith(path.join(f.root, 'Companies', 'isolated-company', 'artifacts') + path.sep)).toBe(true);
    expect(readFileSync(file)).toEqual(before);
    expect(legacy.listAgents().map((a) => a.name)).toEqual(['Legacy colleague']);
  });
  it('rejects a mismatched persisted roster without overwriting it and migrates only owned legacy records', () => {
    const f = fixture(),
      write = vi.fn();
    const foreign = new CoworkStore(path.join(f.root, 'foreign.json'), undefined, {
      companyId: f.company.id,
      persistence: { read: () => JSON.stringify({ agents: [{ ...f.employee, companyId: 'other-company' }] }), write },
    });
    expect(() => foreign.listAgents()).toThrow('another company');
    expect(() => foreign.listAgents()).toThrow('another company');
    expect(write).not.toHaveBeenCalled();
    const file = path.join(f.root, 'owned-legacy.json');
    writeFileSync(file, JSON.stringify({ agents: [{ ...f.employee, companyId: undefined }] }));
    const owned = new CoworkStore(file, undefined, { companyId: f.company.id, persistence: { read: () => undefined, write } });
    expect(owned.listAgents()[0]?.companyId).toBe(f.company.id);
    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(readFileSync(file, 'utf8')).agents[0].companyId).toBeUndefined();
  });
});
