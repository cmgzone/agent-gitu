import { createHash } from 'node:crypto';
import type { CompanyActor, CompanyMeeting, CompanyOnboarding, CompanyOrganizationRecord } from './management-models.js';
import { CompanyHandbook } from './handbook.js';
import { CompanyBoardroom } from './boardroom.js';
import { CompanyOrganization } from './organization.js';
import { canonicalAction } from './store.js';

const now = () => new Date().toISOString();
function lines(value: unknown): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !v.trim()))
    throw new Error('Provide nonempty requirements.');
  return [...new Set(value.map((v) => String(v).trim()))];
}

/** Evidence and gates around the existing Cowork mission runtime, never a separate worker. */
export class CompanyOnboardingService {
  constructor(
    readonly organization: CompanyOrganization,
    readonly handbook = new CompanyHandbook(organization),
    readonly room = new CompanyBoardroom(organization),
    private readonly availableTools: (agentId: string) => string[] = () => [],
  ) {}
  private get companyId() {
    return this.organization.companyId;
  }
  private id(agentId: string) {
    return this.companyId + ':onboarding:' + agentId;
  }
  private signature(agentId: string): string {
    const member = this.organization.member(agentId);
    return createHash('sha256')
      .update(
        canonicalAction({
          handbook: this.handbook.signature(),
          member: {
            role: member.role,
            managerId: member.managerId,
            departmentId: member.departmentId,
            responsibilities: member.responsibilities,
            authority: member.authority,
            jobTitle: member.jobTitle,
          },
        }),
      )
      .digest('hex');
  }
  private manager(actor: CompanyActor, agentId: string): void {
    if (actor.kind === 'director') return;
    const manager = this.organization.require(actor, 'assign-work')!,
      target = this.organization.member(agentId);
    if (manager.role === 'ceo' && actor.agentId !== agentId) return;
    const members = this.organization.snapshot().members,
      visited = new Set<string>();
    let parent = target.managerId;
    while (parent && !visited.has(parent)) {
      if (parent === actor.agentId && actor.agentId !== agentId) return;
      visited.add(parent);
      parent = members.find((m) => m.agentId === parent)?.managerId;
    }
    throw new Error('Manage onboarding only for your reporting team, never your own activation.');
  }
  read(actor: CompanyActor, agentId: string): CompanyOnboarding {
    if (actor.kind === 'agent' && actor.agentId !== agentId) this.manager(actor, agentId);
    const member = this.organization.member(agentId);
    if (member.status === 'suspended') throw new Error('Ask the director to resume this employee before onboarding.');
    let record = this.organization.store.read<CompanyOnboarding>('onboarding', this.id(agentId));
    const signature = this.signature(agentId);
    if (!record) {
      record = {
        id: this.id(agentId),
        companyId: this.companyId,
        agentId,
        revision: 1,
        stage: member.status === 'active' && !member.onboardingRequired ? 'active' : member.status === 'retraining' ? 'retraining' : 'identity',
        signature,
        requirements: { tools: [], connectionIds: [], accountIds: [], skills: [] },
        updatedAt: now(),
      };
      this.organization.store.saveResource('onboarding', record.id, this.companyId, record);
    } else if (record.signature !== signature && record.stage !== 'active') {
      this.retire(record, 'Company policy, approved guidance or employee role changed.');
      record = {
        ...record,
        revision: record.revision + 1,
        stage: 'retraining',
        signature,
        orientation: undefined,
        meetingId: undefined,
        resourceCheck: undefined,
        assessment: undefined,
        updatedAt: now(),
      };
      this.organization.store.saveResource('onboarding', record.id, this.companyId, record);
    } else if (record.stage === 'active' && member.onboardingRequired) {
      this.retire(record, 'Director required retraining.');
      record = {
        ...record,
        revision: record.revision + 1,
        stage: 'retraining',
        signature,
        orientation: undefined,
        meetingId: undefined,
        resourceCheck: undefined,
        assessment: undefined,
        updatedAt: now(),
      };
      this.organization.store.saveResource('onboarding', record.id, this.companyId, record);
    }
    return structuredClone(record);
  }
  private retire(record: CompanyOnboarding, reason: string): void {
    record.history = [
      ...(record.history ?? []),
      { signature: record.signature, orientation: record.orientation, meetingId: record.meetingId, assessment: record.assessment, endedAt: now(), reason },
    ];
    if (record.assessment && this.organization.cowork.getMission(record.assessment.missionId)?.status === 'running')
      this.organization.cowork.cancelMission(record.assessment.missionId);
    if (record.meetingId) {
      const meeting = this.organization.store.read<CompanyMeeting>('meeting', record.meetingId);
      if (meeting?.companyId === this.companyId && ['scheduled', 'active', 'interrupted'].includes(meeting.state)) this.room.cancel({ kind: 'director' }, meeting.id, reason);
    }
  }
  list(actor: CompanyActor): CompanyOnboarding[] {
    return this.organization.snapshot().members.flatMap((m) => {
      try {
        return [this.read(actor, m.agentId)];
      } catch {
        return [];
      }
    });
  }
  private edit(actor: CompanyActor, agentId: string, revision: number, operation: (record: CompanyOnboarding) => void): CompanyOnboarding {
    this.manager(actor, agentId);
    const record = this.read(actor, agentId);
    if (record.revision !== revision) throw new Error('Onboarding changed. Refresh before continuing.');
    return this.organization.audited(actor, 'assign-work', 'onboarding.updated', record.id, () => {
      const current = this.organization.store.read<CompanyOnboarding>('onboarding', record.id)!;
      if (current.revision !== revision) throw new Error('Onboarding revision changed.');
      operation(current);
      current.revision++;
      current.updatedAt = now();
      this.organization.store.saveResource('onboarding', current.id, this.companyId, current);
      return structuredClone(current);
    });
  }
  orient(actor: CompanyActor, agentId: string, revision: number, requirements: CompanyOnboarding['requirements']): CompanyOnboarding {
    if (!requirements || typeof requirements !== 'object') throw new Error('Provide tool, API, account and skill requirements.');
    // Prepare orientation outside the transaction: organization reads have their own scope transaction.
    const member = this.organization.member(agentId),
      company = this.organization.store.get(this.companyId)!;
    if (!member.jobTitle || !member.responsibilities.length || (member.role !== 'ceo' && !member.managerId))
      throw new Error('Set the employee job title, responsibilities and reporting manager in Company structure first.');
    const checked = {
      tools: lines(requirements.tools),
      connectionIds: lines(requirements.connectionIds),
      accountIds: lines(requirements.accountIds),
      skills: lines(requirements.skills),
    };
    if (checked.tools.some((t) => ['team_manage', 'mission_manage', 'company_manage', 'company_onboarding'].includes(t)))
      throw new Error('An assessment cannot grant staff management or mission assignment.');
    const orientation = {
      mission: company.purpose,
      direction: company.direction || company.purpose,
      role: member,
      handbook: this.handbook
        .list({ kind: 'director' })
        .filter((e) => e.state === 'current' && e.approvedVersion)
        .map((e) => ({ id: e.id, version: e.approvedVersion! })),
      acknowledgedAt: now(),
    };
    return this.edit(actor, agentId, revision, (r) => {
      if (!['identity', 'retraining', 'orientation', 'blocked'].includes(r.stage)) throw new Error('Orientation has already been completed.');
      r.requirements = checked;
      r.orientation = orientation;
      r.stage = 'meeting';
    });
  }
  schedule(actor: CompanyActor, agentId: string, revision: number): CompanyOnboarding {
    this.manager(actor, agentId);
    const record = this.read(actor, agentId),
      member = this.organization.member(agentId);
    if (record.revision !== revision || record.stage !== 'meeting' || !record.orientation) throw new Error('Complete orientation before scheduling the onboarding meeting.');
    if (record.meetingId) return record;
    const chair = member.managerId || this.organization.store.get(this.companyId)!.leadId!;
    const meeting = this.room.create(actor, {
      title: 'Onboarding: ' + this.organization.cowork.getAgent(agentId)!.name,
      type: 'onboarding',
      chairId: chair,
      participants: [...new Set([chair, agentId])].map((id) => ({ agentId: id })),
      agenda: ['Company mission, role and responsibilities', 'Approved handbook and escalation rules', 'Tool access and practical assessment questions'],
      maxTurns: 8,
      durationMinutes: 20,
    });
    return this.edit(actor, agentId, revision, (r) => {
      r.meetingId = meeting.id;
    });
  }
  problems(record: CompanyOnboarding): string[] {
    const company = this.organization.store.get(this.companyId)!,
      member = this.organization.member(record.agentId),
      profile = this.organization.cowork.getAgent(record.agentId)!,
      tools = this.availableTools(record.agentId);
    return [
      ...record.requirements.tools.filter((t) => !tools.includes(t) || (member.authority.tools && !member.authority.tools.includes(t))).map((t) => 'Tool unavailable: ' + t),
      ...record.requirements.connectionIds
        .filter((id) => !company.connectionIds.includes(id) || (member.authority.connectionIds && !member.authority.connectionIds.includes(id)))
        .map((id) => 'Company API grant required: ' + id),
      ...record.requirements.accountIds
        .filter((id) => !company.accountIds.includes(id) || (member.authority.accountIds && !member.authority.accountIds.includes(id)))
        .map((id) => 'Connected account grant required: ' + id),
      ...record.requirements.skills.filter((id) => !company.skills.includes(id) || !(profile.skills ?? []).includes(id)).map((id) => 'Assigned skill required: ' + id),
    ];
  }
  check(actor: CompanyActor, agentId: string, revision: number, availabilityProblems: string[] = []): CompanyOnboarding {
    const record = this.read(actor, agentId),
      meeting = record.meetingId ? this.organization.store.read<CompanyMeeting>('meeting', record.meetingId) : undefined;
    if (!['meeting', 'blocked', 'resources'].includes(record.stage)) throw new Error('Resource checks cannot replace an active assessment or employee activation.');
    if (
      !meeting ||
      meeting.companyId !== this.companyId ||
      meeting.type !== 'onboarding' ||
      meeting.state !== 'completed' ||
      !meeting.contributions.some((c) => c.agentId === agentId)
    )
      throw new Error('The employee must contribute to a completed onboarding meeting first.');
    const problems = [...this.problems(record), ...availabilityProblems];
    return this.edit(actor, agentId, revision, (r) => {
      r.resourceCheck = { checkedAt: now(), problems };
      r.stage = problems.length ? 'blocked' : 'resources';
    });
  }
  assess(actor: CompanyActor, agentId: string, revision: number, input: { goal: string; criteria: string[]; maxTurns?: number }): CompanyOnboarding {
    this.manager(actor, agentId);
    const record = this.read(actor, agentId);
    if (record.revision !== revision || !record.resourceCheck || record.resourceCheck.problems.length || record.stage !== 'resources' || this.problems(record).length)
      throw new Error('Pass current resource checks before assigning an assessment.');
    if (typeof input.goal !== 'string' || !input.goal.trim()) throw new Error('Provide a bounded practical assessment goal.');
    const criteria = lines(input.criteria);
    if (!criteria.length) throw new Error('Provide 1–12 concrete completion criteria.');
    if (input.maxTurns !== undefined && (!Number.isSafeInteger(input.maxTurns) || input.maxTurns < 1)) throw new Error('Provide a positive number of work sessions.');
    const cowork = this.organization.cowork,
      conversation =
        cowork.listConversations().find((c) => c.kind === 'dm' && c.memberIds.length === 1 && c.memberIds[0] === agentId) ??
        cowork.saveConversation({ kind: 'dm', memberIds: [agentId] });
    // The scoped Cowork snapshot and onboarding link commit in the same SQLite transaction.
    return this.edit(actor, agentId, revision, (r) => {
      if (r.assessment) {
        r.history = [
          ...(r.history ?? []),
          {
            signature: r.signature,
            orientation: r.orientation,
            meetingId: r.meetingId,
            assessment: r.assessment,
            endedAt: now(),
            reason: 'A new practical assessment was assigned after review.',
          },
        ];
      }
      const mission = cowork.createMission({ agentId, conversationId: conversation.id, goal: input.goal, criteria, maxTurns: input.maxTurns ?? 3 });
      r.assessment = { missionId: mission.id, criteria };
      r.stage = 'assessment';
      this.organization.store.enqueue(this.companyId, 'mission', { missionId: mission.id }, mission.id);
    });
  }
  review(actor: CompanyActor, agentId: string, revision: number, input: { approved: boolean; notes: string; evidenceMessageIds: string[] }): CompanyOnboarding {
    const record = this.read(actor, agentId),
      mission = record.assessment && this.organization.cowork.getMission(record.assessment.missionId),
      ids = lines(input.evidenceMessageIds);
    if (typeof input.approved !== 'boolean' || typeof input.notes !== 'string' || !input.notes.trim())
      throw new Error('Record an explicit assessment result and review notes.');
    if (!mission || record.stage !== 'assessment' || (input.approved && (mission.status !== 'done' || !mission.result?.trim() || !ids.length)))
      throw new Error('Approve only a completed practical mission with its saved evidence.');
    const messages = this.organization.cowork.messages(mission.conversationId);
    if (
      ids.some(
        (id) =>
          !messages.some(
            (m) =>
              m.id === id &&
              ['agent', 'system'].includes(m.role) &&
              m.agentId === agentId &&
              m.missionId === mission.id &&
              m.text.trim() &&
              Date.parse(m.ts) >= Date.parse(mission.createdAt),
          ),
      )
    )
      throw new Error('Use evidence messages from this employee’s assessment conversation.');
    return this.edit(actor, agentId, revision, (r) => {
      r.assessment!.review = { ...input, evidenceMessageIds: ids, reviewer: actor, at: now() };
      if (!input.approved) r.stage = 'blocked';
    });
  }
  activate(actor: CompanyActor, agentId: string, revision: number, availabilityProblems: string[] = []): CompanyOnboarding {
    if (actor.kind !== 'director' && !this.organization.isCreatorChief(actor.agentId))
      throw new Error('Only the director activates employees after verified onboarding.');
    if (availabilityProblems.length) throw new Error(availabilityProblems.join('; '));
    const record = this.read(actor, agentId),
      member = this.organization.member(agentId);
    if (
      record.signature !== this.signature(agentId) ||
      record.stage !== 'assessment' ||
      !record.assessment?.review?.approved ||
      this.problems(record).length ||
      member.status === 'suspended'
    )
      throw new Error('Complete current orientation, meeting, resources and reviewed assessment before activation.');
    const mission = this.organization.cowork.getMission(record.assessment.missionId);
    if (mission?.status !== 'done') throw new Error('Assessment mission is no longer completed.');
    return this.edit(actor, agentId, revision, (r) => {
      const org = this.organization.store.read<CompanyOrganizationRecord>('organization', this.companyId)!,
        target = org.members.find((m) => m.agentId === agentId)!;
      target.status = 'active';
      target.onboardingRequired = false;
      target.updatedAt = now();
      org.revision++;
      org.updatedAt = now();
      this.organization.store.saveResource('organization', this.companyId, this.companyId, org);
      r.stage = 'active';
    });
  }
  train(
    actor: CompanyActor,
    agentId: string,
    input: {
      revision?: number;
      jobTitle?: string;
      responsibilities?: string[];
      departmentId?: string;
      managerId?: string;
      rules?: (string | { id?: string; title?: string; kind?: 'guideline' | 'suggestion'; content: string })[];
      training?: string;
      notes?: string;
      requirements?: Partial<CompanyOnboarding['requirements']>;
      activate?: boolean;
    } = {},
    availabilityProblems: string[] = [],
  ): CompanyOnboarding {
    if (actor.kind !== 'director' && !this.organization.isCreatorChief(actor.agentId))
      throw new Error('Only the director or the Chief of Staff who created this company can train and onboard employees directly.');
    this.manager(actor, agentId);
    const initialMember = this.organization.member(agentId);
    if (initialMember.status === 'suspended') throw new Error('Ask the director to resume this employee before onboarding.');
    if (input.revision !== undefined) {
      const initialRecord = this.read(actor, agentId);
      if (!Number.isSafeInteger(Number(input.revision)) || Number(input.revision) !== initialRecord.revision)
        throw new Error('Onboarding changed. Refresh before continuing.');
    }
    const company = this.organization.store.get(this.companyId)!;
    const orgSnap = this.organization.snapshot();
    const currentMember = this.organization.member(agentId);
    const jobTitle = typeof input.jobTitle === 'string' && input.jobTitle.trim() ? input.jobTitle.trim() : currentMember.jobTitle || 'Employee';
    const responsibilities =
      Array.isArray(input.responsibilities) && input.responsibilities.length
        ? lines(input.responsibilities)
        : currentMember.responsibilities.length
          ? currentMember.responsibilities
          : [company.direction || company.purpose || 'Deliver verified work aligned with company mission and handbook rules'];
    const managerId =
      typeof input.managerId === 'string' && input.managerId.trim()
        ? input.managerId.trim()
        : currentMember.managerId || (currentMember.role === 'ceo' ? undefined : company.leadId);
    const departmentId =
      typeof input.departmentId === 'string' && input.departmentId.trim() ? input.departmentId.trim() : currentMember.departmentId;
    if (
      jobTitle !== currentMember.jobTitle ||
      JSON.stringify(responsibilities) !== JSON.stringify(currentMember.responsibilities) ||
      managerId !== currentMember.managerId ||
      departmentId !== currentMember.departmentId
    ) {
      this.organization.updateMember(actor, agentId, { jobTitle, responsibilities, managerId, departmentId }, orgSnap.revision);
    }
    if (Array.isArray(input.rules)) {
      for (const rule of input.rules) {
        let entry;
        if (typeof rule === 'string') {
          const content = rule.trim();
          if (!content) continue;
          const title = content.length <= 72 ? content : content.slice(0, 69).trim() + '...';
          entry = this.handbook.propose(actor, { title, kind: 'guideline', content });
        } else if (rule && typeof rule === 'object') {
          const content = String(rule.content ?? '').trim();
          if (!content) throw new Error('Enter nonempty rule content.');
          const title =
            typeof rule.title === 'string' && rule.title.trim()
              ? rule.title.trim()
              : content.length <= 72
                ? content
                : content.slice(0, 69).trim() + '...';
          const existing = rule.id ? this.handbook.read(actor, rule.id) : undefined;
          entry = this.handbook.propose(actor, {
            id: existing?.id,
            revision: existing?.revision,
            title,
            kind: rule.kind ?? 'guideline',
            content,
          });
        }
        if (entry) {
          const pending = entry.versions.find((v) => v.state === 'proposed');
          if (pending) this.handbook.review(actor, entry.id, pending.version, true, entry.revision, false);
        }
      }
    }
    let record = this.read(actor, agentId);
    if (!['identity', 'retraining', 'orientation', 'blocked'].includes(record.stage)) {
      record = this.edit(actor, agentId, record.revision, (r) => {
        this.retire(r, 'Updated company and rules training.');
        r.stage = 'retraining';
        r.orientation = undefined;
        r.meetingId = undefined;
        r.resourceCheck = undefined;
        r.assessment = undefined;
      });
    }
    const requirements: CompanyOnboarding['requirements'] = {
      tools: input.requirements?.tools ? lines(input.requirements.tools) : record.requirements.tools,
      connectionIds: input.requirements?.connectionIds ? lines(input.requirements.connectionIds) : record.requirements.connectionIds,
      accountIds: input.requirements?.accountIds ? lines(input.requirements.accountIds) : record.requirements.accountIds,
      skills: input.requirements?.skills ? lines(input.requirements.skills) : record.requirements.skills,
    };
    record = this.orient(actor, agentId, record.revision, requirements);
    const approvedRules = this.handbook
      .list({ kind: 'director' })
      .filter((e) => e.state === 'current' && e.approvedVersion)
      .map((e) => {
        const v = e.versions.find((ver) => ver.version === e.approvedVersion);
        return { id: e.id, title: e.title, kind: e.kind, version: e.approvedVersion!, content: v?.content ?? '' };
      });
    const updatedMember = this.organization.member(agentId);
    const rulesSummary = approvedRules.length
      ? approvedRules.map((r) => `- [${r.kind}] ${r.title} (${r.id} v${r.version}): ${r.content}`).join('\n')
      : '- Follow company mission, direction, and assigned responsibilities.';
    const customTraining = typeof input.training === 'string' && input.training.trim() ? `\nTraining instructions: ${input.training.trim()}` : '';
    const briefingText =
      `COMPANY ONBOARDING & RULES TRAINING — ${company.name} [${company.id}]\n` +
      `Mission: ${company.purpose}\n` +
      `Direction: ${company.direction || company.purpose}\n` +
      `Role: ${updatedMember.role} (${updatedMember.jobTitle})\n` +
      `Responsibilities: ${updatedMember.responsibilities.join('; ')}\n` +
      `Approved Company Rules & Handbook:\n${rulesSummary}` +
      customTraining;
    const ackText =
      `Acknowledged onboarding training for ${company.name} as ${updatedMember.jobTitle}. ` +
      `Responsibilities: ${updatedMember.responsibilities.join('; ')}. ` +
      (approvedRules.length
        ? `Committed to ${approvedRules.length} approved handbook rule(s): ${approvedRules.map((r) => r.title).join(', ')}.`
        : 'Committed to company mission and operating rules.');
    record = this.schedule(actor, agentId, record.revision);
    const meeting = this.room.begin(actor, record.meetingId!);
    const chairId = meeting.chairId;
    const chairLease = this.room.grant(actor, meeting.id, { agentId: chairId, agendaId: meeting.agenda[0]!.id }).lease!;
    this.room.contribute({ kind: 'agent', agentId: chairId }, meeting.id, chairLease.id, { text: briefingText });
    const empAgendaId = (meeting.agenda[1] ?? meeting.agenda[0])!.id;
    const empLease = this.room.grant(actor, meeting.id, { agentId, agendaId: empAgendaId }).lease!;
    this.room.contribute({ kind: 'agent', agentId }, meeting.id, empLease.id, { text: ackText });
    this.room.finish(actor, meeting.id, 'Company onboarding and rules training completed.');
    record = this.check(actor, agentId, this.read(actor, agentId).revision, availabilityProblems);
    if (record.stage === 'blocked' || input.activate === false) return record;
    record = this.assess(actor, agentId, record.revision, {
      goal: 'Confirm company mission, role responsibilities, and approved handbook rules',
      criteria: ['Acknowledge company mission, responsibilities, and handbook rules'],
      maxTurns: 1,
    });
    const mission = this.organization.cowork.getMission(record.assessment!.missionId)!;
    const trainerAgentId = actor.kind === 'agent' ? actor.agentId : company.leadId ?? agentId;
    this.organization.cowork.appendMessage(mission.conversationId, {
      role: 'agent',
      via: 'agent',
      agentId: trainerAgentId,
      missionId: mission.id,
      text: briefingText,
    });
    const ackMessage = this.organization.cowork.appendMessage(mission.conversationId, {
      role: 'agent',
      via: 'agent',
      agentId,
      missionId: mission.id,
      text: ackText,
    });
    this.organization.cowork.updateMission(mission.id, {
      status: 'done',
      result: ackText,
      finishedAt: now(),
    });
    for (const job of this.organization.store.jobs(this.companyId)) {
      if (job.kind === 'mission' && job.payload['missionId'] === mission.id && ['queued', 'running'].includes(job.state)) {
        this.organization.store.finishJob(job, 'done');
      }
    }
    const reviewNotes =
      typeof input.notes === 'string' && input.notes.trim()
        ? input.notes.trim()
        : 'Trained on company mission, role responsibilities, and approved handbook rules.';
    record = this.review(actor, agentId, this.read(actor, agentId).revision, {
      approved: true,
      notes: reviewNotes,
      evidenceMessageIds: [ackMessage.id],
    });
    return this.activate(actor, agentId, record.revision, availabilityProblems);
  }
  assessmentAllowed(agentId: string, missionId?: string): boolean {
    if (!missionId) return false;
    const member = this.organization.snapshot().members.find((m) => m.agentId === agentId);
    if (!member || !['onboarding', 'retraining'].includes(member.status)) return false;
    const r = this.read({ kind: 'director' }, agentId);
    return (
      ['onboarding', 'retraining'].includes(member.status) &&
      r.stage === 'assessment' &&
      r.assessment?.missionId === missionId &&
      r.signature === this.signature(agentId) &&
      !this.problems(r).length &&
      this.organization.cowork.getMission(missionId)?.status === 'running'
    );
  }
}
