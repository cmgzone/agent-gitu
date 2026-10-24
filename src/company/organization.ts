import { randomUUID } from 'node:crypto';
import type { CoworkAgent, CoworkStore } from '../cowork/store.js';
import type { ToolResult } from '../types.js';
import type { CompanyStore } from './store.js';
import type {
  CompanyActor,
  CompanyAuthority,
  CompanyDepartment,
  CompanyManagementEvent,
  CompanyMember,
  CompanyOrganizationRecord,
  CompanyRole,
  OrganizationalCapability,
} from './management-models.js';

const CAPABILITIES: OrganizationalCapability[] = ['organize-meetings', 'chair-meetings', 'assign-work', 'design-workflows', 'manage-departments', 'propose-staff'];
const ROLE_LIMITS: Record<CompanyRole, OrganizationalCapability[]> = {
  ceo: CAPABILITIES,
  'team-leader': CAPABILITIES.filter((cap) => cap !== 'manage-departments'),
  employee: ['organize-meetings', 'design-workflows'],
};
const now = () => new Date().toISOString();
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Enter nonempty text.`);
  return value.trim();
}
function strings(value: unknown, max = 100): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !v.trim()))
    throw new Error('Enter a bounded list of nonempty strings.');
  return [...new Set(value.map((v) => v.trim()))];
}

/** Company organization stored alongside the existing scoped Cowork snapshot. */
export class CompanyOrganization {
  constructor(
    readonly store: CompanyStore,
    readonly companyId: string,
    readonly cowork: CoworkStore,
  ) {
    if (!store.get(companyId)) throw new Error('Company not found.');
    if (cowork.listAgents().some((a) => a.companyId !== companyId)) throw new Error('Organization requires this company’s scoped roster.');
  }
  private transaction<T>(work: () => T): T {
    this.store.db.exec('BEGIN IMMEDIATE');
    try {
      const value = work();
      this.store.db.exec('COMMIT');
      return value;
    } catch (error) {
      this.store.db.exec('ROLLBACK');
      throw error;
    }
  }
  private audit(actor: CompanyActor, kind: string, resourceId: string, detail: string, revision?: number): void {
    const event: CompanyManagementEvent = { id: randomUUID(), companyId: this.companyId, actor, kind, resourceId, detail, revision, at: now() };
    this.store.saveResource('management-event', event.id, this.companyId, event);
  }
  /** Share the same transaction/audit boundary with meeting and workflow transitions. */
  audited<T>(actor: CompanyActor, capability: OrganizationalCapability | undefined, kind: string, resourceId: string, work: () => T, allowOnboarding = false): T {
    const snapshot = this.snapshot();
    const permitted = (record: CompanyOrganizationRecord) => {
      if (actor.kind === 'director') return;
      const member = record.members.find((m) => m.agentId === actor.agentId);
      if (!member || (member.status !== 'active' && !(allowOnboarding && ['onboarding','retraining'].includes(member.status))) || (capability && !member.authority.capabilities.includes(capability)))
        throw new Error('This operation exceeds the agent’s organizational authority.');
    };
    permitted(snapshot);
    return this.transaction(() => {
      const current = this.store.read<CompanyOrganizationRecord>('organization', this.companyId)!;
      permitted(current);
      if (current.revision !== snapshot.revision) throw new Error('Authority changed before this operation. Recheck the current organization.');
      const result = work();
      this.audit(actor, kind, resourceId, kind.replace(/\./g, ' '), current.revision);
      return result;
    });
  }
  private initialMember(agent: CoworkAgent, legacy: boolean): CompanyMember {
    const company = this.store.get(this.companyId)!;
    const role: CompanyRole = agent.id === company.leadId ? 'ceo' : agent.chiefOfStaff ? 'team-leader' : 'employee';
    return {
      agentId: agent.id,
      role,
      jobTitle: agent.tagline || (role === 'ceo' ? 'Chief executive' : 'Employee'),
      managerId: role === 'ceo' ? undefined : company.leadId,
      responsibilities: [],
      authority: { capabilities: role === 'employee' ? [] : [...ROLE_LIMITS[role]] },
      status: legacy || role === 'ceo' ? 'active' : 'onboarding',
      onboardingRequired: !legacy && role !== 'ceo',
      updatedAt: now(),
    };
  }
  snapshot(): CompanyOrganizationRecord {
    return this.transaction(() => {
      const existing = this.store.read<CompanyOrganizationRecord>('organization', this.companyId);
      const roster = this.cowork.listAgents(),
        ids = new Set(roster.map((a) => a.id));
      const record: CompanyOrganizationRecord = existing ? structuredClone(existing) : { companyId: this.companyId, revision: 0, members: [], updatedAt: now() };
      let changed = !existing;
      record.members = record.members.filter((member) => {
        if (ids.has(member.agentId)) return true;
        changed = true;
        return false;
      });
      for (const agent of roster)
        if (!record.members.some((member) => member.agentId === agent.id)) {
          record.members.push(this.initialMember(agent, !existing));
          changed = true;
        }
      const lead = this.store.get(this.companyId)!.leadId;
      for (const member of record.members) {
        if (member.agentId === lead && member.role !== 'ceo') {
          member.role = 'ceo';
          member.managerId = undefined;
          member.authority.capabilities = [...ROLE_LIMITS.ceo];
          changed = true;
        } else if (member.agentId !== lead && member.role === 'ceo') {
          member.role = 'team-leader';
          member.managerId = lead;
          member.authority.capabilities = member.authority.capabilities.filter((cap) => ROLE_LIMITS['team-leader'].includes(cap));
          changed = true;
        }
        if (member.managerId && !ids.has(member.managerId)) {
          member.managerId = member.agentId === lead ? undefined : lead;
          changed = true;
        }
      }
      if (changed) {
        record.revision++;
        record.updatedAt = now();
        this.store.saveResource('organization', this.companyId, this.companyId, record);
        this.audit(
          { kind: 'director' },
          existing ? 'organization.roster-reconciled' : 'organization.legacy-migrated',
          this.companyId,
          existing ? 'Roster changes reconciled; new employees require onboarding.' : 'Existing staff retains its established active state and tool grants.',
          record.revision,
        );
      }
      return record;
    });
  }
  member(agentId: string): CompanyMember {
    const member = this.snapshot().members.find((item) => item.agentId === agentId);
    if (!member) throw new Error('Agent is not a permanent member of this company.');
    return member;
  }
  /** Temporary helpers inherit the nearest permanent parent’s restrictions, not management authority. */
  private effective(agentId: string): { member: CompanyMember; temporary: boolean } {
    const members = this.snapshot().members,
      helpers = this.cowork.subAgents(),
      seen = new Set<string>();
    let id = agentId;
    while (!seen.has(id)) {
      seen.add(id);
      const member = members.find((m) => m.agentId === id);
      if (member) return { member, temporary: id !== agentId };
      const helper = helpers.find((h) => h.id === id);
      if (!helper) break;
      id = helper.parentAgentId || helper.rootAgentId;
    }
    throw new Error('Agent does not belong to this company.');
  }
  require(actor: CompanyActor, capability: OrganizationalCapability): CompanyMember | undefined {
    if (actor.kind === 'director') return undefined;
    const member = this.member(actor.agentId);
    if (member.status !== 'active' || !member.authority.capabilities.includes(capability)) throw new Error('This operation exceeds the agent’s organizational authority.');
    return member;
  }
  departments(): CompanyDepartment[] {
    return this.store.list<CompanyDepartment>('department', this.companyId);
  }
  events(): CompanyManagementEvent[] {
    return this.store.db
      .prepare('SELECT data FROM records WHERE kind=? AND company_id=? ORDER BY rowid DESC LIMIT 200')
      .all('management-event', this.companyId)
      .reverse()
      .map((row) => JSON.parse(String(row['data'])) as CompanyManagementEvent);
  }
  saveDepartment(actor: CompanyActor, input: Partial<CompanyDepartment>): CompanyDepartment {
    this.require(actor, 'manage-departments');
    const current = input.id ? this.departments().find((d) => d.id === input.id) : undefined;
    if (input.id && !current) throw new Error('Department not found in this company.');
    if (input.purpose !== undefined && (typeof input.purpose !== 'string'))
      throw new Error('Enter a department purpose as text.');
    const value: CompanyDepartment = {
      id: current?.id ?? 'department-' + randomUUID(),
      companyId: this.companyId,
      name: input.name === undefined ? (current?.name ?? '') : text(input.name, 120),
      purpose: input.purpose === undefined ? (current?.purpose ?? '') : input.purpose.trim(),
      leaderId: input.leaderId === undefined ? current?.leaderId : input.leaderId || undefined,
      updatedAt: now(),
    };
    if (!value.name) throw new Error('A department name is required.');
    if (this.departments().some((d) => d.id !== value.id && d.name.toLowerCase() === value.name.toLowerCase())) throw new Error('A department with this name already exists.');
    if (value.leaderId) {
      const leader = this.member(value.leaderId);
      if (!['ceo', 'team-leader'].includes(leader.role) || leader.status !== 'active') throw new Error('Choose an active company leader.');
      if (leader.role !== 'ceo' && leader.departmentId !== value.id) throw new Error('Assign this leader to the department before choosing its leader.');
    }
    return this.transaction(() => {
      this.store.saveResource('department', value.id, this.companyId, value);
      this.audit(actor, 'department.saved', value.id, value.name);
      return value;
    });
  }
  private subordinate(record: CompanyOrganizationRecord, managerId: string, targetId: string): boolean {
    const seen = new Set<string>();
    let id = record.members.find((m) => m.agentId === targetId)?.managerId;
    while (id && !seen.has(id)) {
      if (id === managerId) return true;
      seen.add(id);
      id = record.members.find((m) => m.agentId === id)?.managerId;
    }
    return false;
  }
  private authority(input: CompanyAuthority, role: CompanyRole): CompanyAuthority {
    if (!input || typeof input !== 'object' || Object.keys(input).some((k) => !['capabilities', 'tools', 'connectionIds', 'accountIds'].includes(k)))
      throw new Error('Invalid authority fields.');
    const capabilities = strings(input.capabilities) as OrganizationalCapability[];
    if (capabilities.some((cap) => !ROLE_LIMITS[role].includes(cap))) throw new Error('Capability exceeds this role’s authority.');
    const company = this.store.get(this.companyId)!;
    const authority: CompanyAuthority = { capabilities };
    for (const key of ['tools', 'connectionIds', 'accountIds'] as const)
      if (input[key] !== undefined) {
        const values = strings(input[key]);
        if (key !== 'tools' && values.some((id) => !(key === 'connectionIds' ? company.connectionIds : company.accountIds).includes(id)))
          throw new Error('Agent resources must be a subset of current company grants.');
        authority[key] = values;
      }
    return authority;
  }
  updateMember(actor: CompanyActor, agentId: string, patch: Partial<CompanyMember>, expectedRevision: number): CompanyOrganizationRecord {
    const before = this.snapshot(),
      target = before.members.find((m) => m.agentId === agentId);
    if (!target) throw new Error('Company member not found.');
    const allowed =
      actor.kind === 'director'
        ? ['role', 'jobTitle', 'departmentId', 'managerId', 'responsibilities', 'authority', 'status']
        : ['jobTitle', 'departmentId', 'managerId', 'responsibilities'];
    if (Object.keys(patch).some((k) => !allowed.includes(k))) throw new Error('Only the director can change roles, authority or activation status.');
    const manager = actor.kind === 'agent' ? this.require(actor, 'assign-work')! : undefined;
    if (manager && (agentId === manager.agentId || target.role === 'ceo' || (manager.role !== 'ceo' && !this.subordinate(before, manager.agentId, agentId))))
      throw new Error('You may manage only your reporting team, never your own authority or the CEO.');
    const next = { ...target, ...patch, updatedAt: now() };
    if (!['ceo', 'team-leader', 'employee'].includes(next.role)) throw new Error('Choose CEO, team leader or employee.');
    const company = this.store.get(this.companyId)!;
    if ((next.role === 'ceo') !== (agentId === company.leadId)) throw new Error('The company lead is its single CEO. Change the lead through owner settings.');
    next.jobTitle = text(next.jobTitle, 160);
    next.responsibilities = strings(next.responsibilities, 30);
    next.departmentId = next.departmentId || undefined;
    next.managerId = next.managerId || undefined;
    if (next.departmentId && !this.departments().some((d) => d.id === next.departmentId)) throw new Error('Department belongs to another company or does not exist.');
    if (next.role === 'ceo' && next.managerId) throw new Error('The CEO reports to the director, not another agent.');
    if (next.role !== 'ceo' && (!next.managerId || !before.members.some((m) => m.agentId === next.managerId && ['ceo', 'team-leader'].includes(m.role))))
      throw new Error('Choose an existing CEO or team leader as reporting manager.');
    if (
      manager?.role === 'team-leader' &&
      (next.departmentId !== manager.departmentId || (next.managerId !== manager.agentId && !this.subordinate(before, manager.agentId, next.managerId!)))
    )
      throw new Error('A team leader cannot move staff outside their reporting department.');
    next.authority = this.authority(next.authority, next.role);
    if (!['active', 'onboarding', 'retraining', 'suspended'].includes(next.status)) throw new Error('Invalid employee status.');
    if (next.status === 'onboarding' || next.status === 'retraining') next.onboardingRequired = true;
    if (next.status === 'active' && (target.onboardingRequired || target.status === 'retraining'))
      throw new Error('Complete required onboarding or retraining checks before activation.');
    const record = { ...before, members: before.members.map((m) => (m.agentId === agentId ? next : m)) };
    for (const member of record.members)
      if (member.managerId === member.agentId || this.subordinate(record, member.agentId, member.agentId)) throw new Error('Reporting relationships cannot contain a cycle.');
    return this.transaction(() => {
      const current = this.store.read<CompanyOrganizationRecord>('organization', this.companyId)!;
      if (current.revision !== expectedRevision || before.revision !== expectedRevision) throw new Error('Organization changed. Refresh before saving.');
      record.revision++;
      record.updatedAt = now();
      this.store.saveResource('organization', this.companyId, this.companyId, record);
      this.audit(actor, 'member.updated', agentId, `Role ${next.role}; status ${next.status}; reporting and authority revision saved.`, record.revision);
      return record;
    });
  }
  context(agentId: string): string {
    const { member, temporary } = this.effective(agentId),
      department = this.departments().find((d) => d.id === member.departmentId);
    const identity = `COMPANY ORGANIZATION: ${temporary ? 'Temporary helper; inherited resource restrictions, no management authority' : member.role}; ${member.jobTitle}. Status: ${member.status}. Department: ${department?.name ?? 'Company'}. Reports to: ${member.managerId ?? 'Human director'}. Responsibilities: ${member.responsibilities.join('; ') || 'Follow assigned tasks'}. Operational authority: ${temporary ? 'none' : member.authority.capabilities.join(', ') || 'assigned work only'}. Organizational roles do not grant new tools, accounts, budgets or enforcement policy.`;
    if (temporary || member.status !== 'active') return identity;
    const requests = this.store.list<import('./management-models.js').CompanyMeetingRequest>('meeting-request', this.companyId)
      .filter(r => r.state === 'pending' && (member.role === 'ceo' || r.requestedBy === agentId))
      .slice(-10).map(r => ({id:r.id,revision:r.revision,title:r.title,requestedBy:r.requestedBy,directionVersion:r.directionVersion}));
    return identity + '\nCOWORK COMPANY WORKSPACE '+this.companyId+': You are the same Cowork teammate here, with your existing personality and memories. Use company_manage agents to find existing Cowork teammates and add_agent with id="'+this.companyId+'",agentId to propose a membership under your existing configuration/write permissions. Preserve useful company discoveries and outcomes for the whole Cowork team using company_manage remember with id="'+this.companyId+'",text; use recall with id and query for shared company memory. Personal preferences remain in agent_memory. Memory and membership do not grant execution authority.' + '\nCOMPANY COORDINATION: Use company_organization read to discover real teammates. When a blocker, disagreement or planning decision needs discussion, use company_boardroom request with input={title,reason,participants:[{agentId}],agenda:[text]}; do not merely say a meeting is needed. Authorized organizers may create meetings directly. Read existing meetings/requests before creating another. CEO: review pending meeting requests using review_request with requestId, revision and approved; schedule useful discussions within existing authority. For repeatable work, use company_workflow propose to save a typed workflow draft for director approval; list existing workflows first. A proposal does not require designer authority, grant resources or execute work. Mention saved meeting/workflow IDs and where the director can review them. Avoid redundant meetings, repeated proposals and busywork. Pending meeting requests: ' + JSON.stringify(requests);
  }
  assertExecution(agentId: string, meetingId?: string, assessmentAllowed = false): void {
    const { member, temporary } = this.effective(agentId);
    if (member.status === 'active') return;
    if (!temporary && assessmentAllowed && ['onboarding', 'retraining'].includes(member.status)) return;
    if (!temporary && meetingId && ['onboarding', 'retraining'].includes(member.status)) {
      const meeting = this.store.read<import('./management-models.js').CompanyMeeting>('meeting', meetingId);
      if (
        meeting?.companyId === this.companyId &&
        meeting.type === 'onboarding' &&
        meeting.state === 'active' &&
        meeting.participants.some((p) => p.agentId === agentId && p.attendance !== 'observer' && p.state !== 'excused')
      )
        return;
    }
    throw new Error('Employee is ' + member.status + '. Complete authorized onboarding or retraining before running assigned work.');
  }
  authorizeTool(agentId: string, tool: string, args: Record<string, unknown>, assessmentTools?: string[]): ToolResult | undefined {
    try {
      const { member, temporary } = this.effective(agentId);
      const readOrganization = tool === 'company_organization' && (!args['action'] || args['action'] === 'read');
      if (readOrganization) return undefined;
      if (!temporary && ['onboarding', 'retraining'].includes(member.status) && ['company_handbook', 'company_onboarding'].includes(tool) && ['list', 'read'].includes(String(args['action'] ?? 'list'))) return undefined;
      if (
        !temporary &&
        tool === 'company_boardroom' &&
        ['onboarding', 'retraining'].includes(member.status) &&
        ['read', 'list', 'raise_hand', 'contribute', 'written'].includes(String(args['action']))
      )
        return undefined;
      if (member.status !== 'active' && (!assessmentTools || temporary || !['onboarding', 'retraining'].includes(member.status) || !assessmentTools.includes(tool))) throw new Error(`Employee is ${member.status}. Complete authorized onboarding/retraining or ask the director to resume suspended work.`);
      if (member.authority.tools && !member.authority.tools.includes(tool)) throw new Error('This tool is outside the agent’s assigned authority.');
      if (
        ['connection_read', 'connection_execute', 'web_search'].includes(tool) &&
        args['connectionId'] &&
        member.authority.connectionIds &&
        !member.authority.connectionIds.includes(String(args['connectionId']))
      )
        throw new Error('This API is outside the agent’s resource grants.');
      if (tool === 'web_search' && !args['connectionId'] && member.authority.connectionIds) throw new Error('Choose an explicit granted search connection ID.');
      if (tool === 'connected_apps' && args['action'] === 'execute' && member.authority.accountIds && !member.authority.accountIds.includes(String(args['accountId'] ?? '')))
        throw new Error('This account is outside the agent’s resource grants.');
      if (tool === 'team_manage' && ['create', 'delete'].includes(String(args['action']))) {
        if (temporary || !member.authority.capabilities.includes('propose-staff')) throw new Error('Staff changes exceed the agent’s organizational authority.');
        if (member.role !== 'ceo') throw new Error('Team leaders propose permanent staff changes to the CEO; existing creation and approval controls still apply.');
      }
      if (tool === 'mission_manage' && !['list', 'status'].includes(String(args['action'] ?? 'list'))) {
        if (temporary || !member.authority.capabilities.includes('assign-work')) throw new Error('Work assignment exceeds organizational authority.');
        const targetId = String(args['action'] === 'create' ? (args['agentId'] ?? agentId) : (this.cowork.getMission(String(args['id']))?.agentId ?? ''));
        const target = this.member(targetId);
        if (target.status !== 'active' || (member.role !== 'ceo' && targetId !== agentId && !this.subordinate(this.snapshot(), agentId, targetId)))
          throw new Error('Assign work only to active employees in your reporting team.');
      }
      return undefined;
    } catch (error) {
      return { ok: false, output: error instanceof Error ? error.message : 'Organizational authorization failed.' };
    }
  }
}
