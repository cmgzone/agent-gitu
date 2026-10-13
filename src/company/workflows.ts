import { createHash, randomUUID } from 'node:crypto';
import { canonicalAction } from './store.js';
import { CompanyOrganization } from './organization.js';
import type { CompanyActor } from './management-models.js';
import type { CompanyWorkflow, CompanyWorkflowRun, WorkflowVersion, WorkflowStep, WorkflowSchema, WorkflowIssue, WorkflowSimulation, WorkflowStepRun } from './workflow-models.js';
const now = () => new Date().toISOString();
const digest = (v: unknown) => createHash('sha256').update(canonicalAction(v)).digest('hex');
function text(value: unknown, max = 2000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Provide nonempty text of at most ' + max + ' characters.');
  return value.trim();
}
function strings(v: unknown): string[] {
  if (!Array.isArray(v) || v.length > 40 || v.some((x) => typeof x !== 'string' || !x.trim() || x.length > 500)) throw new Error('Provide a bounded string list.');
  return [...new Set(v.map((x) => x.trim()))];
}
function schema(s: WorkflowSchema, depth = 0): WorkflowSchema {
  if (!s || depth > 5 || !['object', 'array', 'string', 'number', 'boolean'].includes(s.type))
    throw new Error('Use an object, array, string, number or boolean data schema, at most five levels deep.');
  if (s.type === 'object') {
    const properties = s.properties ?? {};
    if (Object.keys(properties).length > 30 || Object.keys(properties).some((k) => !/^[-\w]{1,80}$/.test(k) || ['__proto__', 'constructor', 'prototype'].includes(k)))
      throw new Error('Use up to 30 safe schema fields.');
    const required = strings(s.required ?? []);
    if (required.some((k) => !Object.hasOwn(properties, k))) throw new Error('Required fields must exist in the schema.');
    return { type: 'object', properties: Object.fromEntries(Object.entries(properties).map(([k, v]) => [k, schema(v, depth + 1)])), required };
  }
  if (s.type === 'array') return { type: 'array', items: schema(s.items!, depth + 1) };
  return { type: s.type };
}
export function workflowDataErrors(s: WorkflowSchema, v: unknown, path = 'value'): string[] {
  if (s.type === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return [path + ' must be an object'];
    const object = v as Record<string, unknown>;
    return [
      ...(s.required ?? []).filter((k) => !Object.hasOwn(object, k)).map((k) => path + '.' + k + ' is required'),
      ...Object.keys(object)
        .filter((k) => !Object.hasOwn(s.properties ?? {}, k))
        .map((k) => path + '.' + k + ' is unexpected'),
      ...Object.entries(s.properties ?? {})
        .filter(([k]) => Object.hasOwn(object, k))
        .flatMap(([k, p]) => workflowDataErrors(p, object[k], path + '.' + k)),
    ];
  }
  if (s.type === 'array') {
    if (!Array.isArray(v) || v.length > 100) return [path + ' must be an array with at most 100 items'];
    return v.flatMap((item, i) => workflowDataErrors(s.items!, item, path + '[' + i + ']'));
  }
  return typeof v !== s.type || (s.type === 'number' && !Number.isFinite(v)) ? [path + ' must be ' + s.type] : [];
}
function field(v: unknown, key?: string): unknown {
  return key ? (v && typeof v === 'object' && Object.hasOwn(v, key) ? (v as Record<string, unknown>)[key] : undefined) : v;
}

/** Definition, validation and admission around durable Cowork missions. */
export class CompanyWorkflows {
  constructor(
    readonly organization: CompanyOrganization,
    private readonly toolNames: (agentId: string) => string[] = () => [],
    private readonly cancelExecution: (missionId: string) => void = () => {},
    private readonly clock: () => number = Date.now,
    private readonly resourceIssues: (step: WorkflowStep) => WorkflowIssue[] = () => [],
  ) {}
  private get store() {
    return this.organization.store;
  }
  private get companyId() {
    return this.organization.companyId;
  }
  private pendingRuns(): CompanyWorkflowRun[] {
    return this.store.db
      .prepare("SELECT data FROM records WHERE kind='workflow-run' AND company_id=? AND json_extract(data,'$.state') NOT IN ('completed','cancelled','failed')")
      .all(this.companyId)
      .map((row) => JSON.parse(String(row['data'])) as CompanyWorkflowRun);
  }
  private visible(actor: CompanyActor, version: WorkflowVersion): void {
    if (actor.kind === 'director') return;
    const member = this.organization.member(actor.agentId);
    if (
      member.status !== 'active' ||
      (member.role !== 'ceo' && !version.steps.some((s) => s.agentId === actor.agentId) && !(version.createdBy.kind === 'agent' && version.createdBy.agentId === actor.agentId))
    )
      throw new Error('This workflow is outside the employee’s assignments.');
  }
  read(actor: CompanyActor, id: string): CompanyWorkflow {
    const w = this.store.read<CompanyWorkflow>('workflow', id);
    if (!w || w.companyId !== this.companyId) throw new Error('Workflow not found in this company.');
    this.visible(actor, w.versions.at(-1)!);
    return structuredClone(w);
  }
  list(actor: CompanyActor): CompanyWorkflow[] {
    return this.store.db
      .prepare(
        "SELECT json_object('id',id,'companyId',company_id,'revision',json_extract(data,'$.revision'),'title',json_extract(data,'$.title'),'versions',json_array(json_extract(data,'$.versions[#-1]')),'updatedAt',json_extract(data,'$.updatedAt')) AS metadata FROM records WHERE kind='workflow' AND company_id=? ORDER BY rowid DESC LIMIT 100",
      )
      .all(this.companyId)
      .map((row) => JSON.parse(String(row['metadata'])) as CompanyWorkflow)
      .filter((w) => {
        try {
          this.visible(actor, w.versions.at(-1)!);
          return true;
        } catch {
          return false;
        }
      });
  }
  run(actor: CompanyActor, id: string): CompanyWorkflowRun {
    const r = this.store.read<CompanyWorkflowRun>('workflow-run', id);
    if (!r || r.companyId !== this.companyId) throw new Error('Workflow run not found in this company.');
    const version = this.version(actor, r.workflowId, r.version),
      member = actor.kind === 'agent' ? this.organization.member(actor.agentId) : undefined,
      result = structuredClone(r);
    if (actor.kind === 'agent' && member?.role !== 'ceo' && !(r.createdBy.kind === 'agent' && r.createdBy.agentId === actor.agentId)) {
      result.input = undefined;
      result.steps = result.steps.map((s) =>
        version.steps.find((d) => d.id === s.stepId)?.agentId === actor.agentId ? s : { stepId: s.stepId, state: s.state, attempts: s.attempts, priorMissionIds: [] },
      );
    }
    return result;
  }
  runs(actor: CompanyActor): CompanyWorkflowRun[] {
    return this.store.db
      .prepare("SELECT data FROM records WHERE kind='workflow-run' AND company_id=? ORDER BY rowid DESC LIMIT 100")
      .all(this.companyId)
      .map((row) => JSON.parse(String(row['data'])) as CompanyWorkflowRun)
      .flatMap((r) => {
        try {
          return [this.run(actor, r.id)];
        } catch {
          return [];
        }
      });
  }
  version(actor: CompanyActor, id: string, version: number): WorkflowVersion {
    const w = this.store.read<CompanyWorkflow>('workflow', id),
      v = w?.companyId === this.companyId ? w.versions.find((v) => v.version === version) : undefined;
    if (!v) throw new Error('Workflow version not found.');
    this.visible(actor, v);
    return structuredClone(v);
  }
  save(actor: CompanyActor, input: { id?: string; revision?: number; title: string; steps: WorkflowStep[]; inputs: WorkflowSchema; parallelism: number }): CompanyWorkflow {
    this.organization.require(actor, 'design-workflows');
    if (!input || typeof input !== 'object') throw new Error('Provide workflow settings and steps.');
    const before = input.id ? this.read(actor, input.id) : undefined;
    if (before && before.revision !== input.revision) throw new Error('Workflow changed. Refresh before saving a new version.');
    if (!Array.isArray(input.steps) || !input.steps.length || input.steps.length > 40 || !Number.isInteger(input.parallelism) || input.parallelism < 1 || input.parallelism > 8)
      throw new Error('Use 1–40 steps and 1–8 parallel tasks.');
    const steps = input.steps.map((s) => {
      if (!/^[-\w]{1,80}$/.test(s.id) || !['mission', 'approval'].includes(s.type)) throw new Error('Use stable step IDs and mission/approval types.');
      if (s.criteria.length > 12 || s.inputSchema.type !== 'object') throw new Error('Use object step inputs and at most 12 completion criteria.');
      if (
        s.condition &&
        ((s.condition.equals !== null && !['string', 'number', 'boolean'].includes(typeof s.condition.equals)) ||
          (typeof s.condition.equals === 'number' && !Number.isFinite(s.condition.equals)))
      )
        throw new Error('Conditions compare a field to a finite primitive value.');
      if (
        !Number.isInteger(s.maxSessions) ||
        s.maxSessions < 1 ||
        s.maxSessions > 10 ||
        !Number.isInteger(s.maxAttempts) ||
        s.maxAttempts < 1 ||
        s.maxAttempts > 3 ||
        !Number.isFinite(s.timeoutMinutes) ||
        s.timeoutMinutes < 1 ||
        s.timeoutMinutes > 1440
      )
        throw new Error('Use bounded sessions, 1–3 attempts and a timeout of 1–1440 minutes.');
      if (
        !s.bindings ||
        typeof s.bindings !== 'object' ||
        Array.isArray(s.bindings) ||
        Object.entries(s.bindings).some(
          ([k, b]) =>
            !/^[-\w]{1,80}$/.test(k) ||
            ['__proto__', 'constructor', 'prototype'].includes(k) ||
            !b ||
            !['input', 'step'].includes(b.source) ||
            (b.field !== undefined && (!/^[-\w]{1,80}$/.test(b.field) || ['__proto__', 'constructor', 'prototype'].includes(b.field))),
        )
      )
        throw new Error('Use safe input/step field bindings.');
      return {
        id: s.id,
        name: text(s.name, 160),
        type: s.type,
        agentId: s.agentId ? text(s.agentId, 160) : undefined,
        goal: text(s.goal),
        criteria: strings(s.criteria),
        dependsOn: strings(s.dependsOn),
        bindings: structuredClone(s.bindings),
        inputSchema: schema(s.inputSchema),
        outputSchema: schema(s.outputSchema),
        tools: strings(s.tools),
        skills: strings(s.skills),
        connectionIds: strings(s.connectionIds),
        accountIds: strings(s.accountIds),
        condition: s.condition ? { stepId: text(s.condition.stepId, 80), field: s.condition.field, equals: s.condition.equals } : undefined,
        maxSessions: s.maxSessions,
        maxAttempts: s.maxAttempts,
        timeoutMinutes: s.timeoutMinutes,
        position:
          s.position && Number.isFinite(s.position.x) && Number.isFinite(s.position.y)
            ? { x: Math.max(0, Math.min(5000, s.position.x)), y: Math.max(0, Math.min(5000, s.position.y)) }
            : undefined,
      } as WorkflowStep;
    });
    if (new Set(steps.map((s) => s.id)).size !== steps.length) throw new Error('Step IDs must be unique.');
    const id = before?.id ?? 'workflow-' + randomUUID(),
      title = text(input.title, 160),
      inputs = schema(input.inputs);
    return this.organization.audited(actor, 'design-workflows', 'workflow.version-created', id, () => {
      const current = before ? this.store.read<CompanyWorkflow>('workflow', id) : undefined;
      if (current && current.revision !== input.revision) throw new Error('Workflow revision changed.');
      if ((current?.versions.length ?? 0) >= 50 || (!current && this.store.list('workflow', this.companyId).length >= 100)) throw new Error('Workflow storage limit reached.');
      const w = current ?? { id, companyId: this.companyId, title, revision: 0, versions: [], updatedAt: now() };
      w.title = title;
      w.versions.push({ version: w.versions.length + 1, state: 'draft', steps, inputs, parallelism: input.parallelism, createdBy: actor, createdAt: now() });
      w.revision++;
      w.updatedAt = now();
      this.store.saveResource('workflow', id, this.companyId, w);
      return structuredClone(w);
    });
  }
  validate(v: WorkflowVersion, input?: unknown): WorkflowIssue[] {
    const issues: WorkflowIssue[] = [],
      members = this.organization.snapshot().members,
      company = this.store.get(this.companyId)!,
      ids = new Set(v.steps.map((s) => s.id));
    const issue = (stepId: string | undefined, code: string, message: string, section: WorkflowIssue['section'] = 'Workflows', severity: WorkflowIssue['severity'] = 'error') =>
      issues.push({ stepId, code, message, section, severity });
    if (input !== undefined) workflowDataErrors(v.inputs, input, 'Workflow input').forEach((e) => issue(undefined, 'input', e));
    const seen = new Set<string>(),
      visiting = new Set<string>();
    const visit = (id: string) => {
      if (visiting.has(id)) {
        issue(id, 'cycle', 'Circular dependency. Remove the cycle.');
        return;
      }
      if (seen.has(id)) return;
      visiting.add(id);
      const s = v.steps.find((s) => s.id === id);
      for (const dep of s?.dependsOn ?? []) if (ids.has(dep)) visit(dep);
      visiting.delete(id);
      seen.add(id);
    };
    for (const s of v.steps) {
      issues.push(...this.resourceIssues(s));
      visit(s.id);
      for (const dep of s.dependsOn) if (!ids.has(dep) || dep === s.id) issue(s.id, 'dependency', 'Dependency is missing or refers to this step: ' + dep);
      for (const [name, b] of Object.entries(s.bindings)) {
        if (!Object.hasOwn(s.inputSchema.properties ?? {}, name)) issue(s.id, 'handoff', 'Binding has no corresponding input schema field: ' + name);
        const source = b.source === 'input' ? v.inputs : v.steps.find((p) => p.id === b.stepId)?.outputSchema;
        if (b.source === 'step' && !s.dependsOn.includes(b.stepId ?? '')) issue(s.id, 'handoff', 'Add the sending step as a dependency: ' + b.stepId);
        const selected = b.field ? source?.properties?.[b.field] : source;
        if (!selected) issue(s.id, 'handoff', 'Sending field is missing: ' + (b.field ?? b.stepId));
        else if (canonicalAction(selected) !== canonicalAction(s.inputSchema.properties?.[name])) issue(s.id, 'handoff', 'Sending and receiving schemas differ for ' + name);
      }
      for (const name of s.inputSchema.required ?? []) if (!Object.hasOwn(s.bindings, name)) issue(s.id, 'input', 'Required step input has no binding: ' + name);
      if (s.condition && !s.dependsOn.includes(s.condition.stepId)) issue(s.id, 'condition', 'Conditional source must be a dependency.');
      if (s.type === 'approval') {
        if (canonicalAction(s.inputSchema) !== canonicalAction(s.outputSchema)) issue(s.id, 'handoff', 'Approval steps pass the same input schema to their output.');
        issue(s.id, 'approval', 'Director approval is required for this exact step input.', 'Workflows', 'approval');
        continue;
      }
      const member = members.find((m) => m.agentId === s.agentId),
        agent = s.agentId ? this.organization.cowork.getAgent(s.agentId) : undefined;
      if (!member || !agent) {
        issue(s.id, 'agent', 'Assign a company employee.', 'Team');
        continue;
      }
      if (member.status !== 'active') issue(s.id, 'agent', 'Employee needs activation or retraining: ' + agent.name, 'Team');
      if (!s.criteria.length) issue(s.id, 'criteria', 'Define concrete completion criteria.');
      for (const tool of s.tools)
        if (!this.toolNames(agent.id).includes(tool) || (member.authority.tools && !member.authority.tools.includes(tool)))
          issue(s.id, 'tool', 'Required tool is unavailable: ' + tool, 'Team');
      for (const skill of s.skills) if (!company.skills.includes(skill) || !agent.skills.includes(skill)) issue(s.id, 'skill', 'Required skill is not assigned: ' + skill, 'Team');
      for (const connection of s.connectionIds)
        if (!company.connectionIds.includes(connection) || (member.authority.connectionIds && !member.authority.connectionIds.includes(connection)))
          issue(s.id, 'connection', 'Company API connection required: ' + connection, 'Connections');
      for (const account of s.accountIds)
        if (!company.accountIds.includes(account) || (member.authority.accountIds && !member.authority.accountIds.includes(account)))
          issue(s.id, 'account', 'Connected account grant required: ' + account, 'Connections');
    }
    return issues;
  }
  approve(actor: CompanyActor, id: string, version: number, revision: number): CompanyWorkflow {
    if (actor.kind !== 'director') throw new Error('Only the director approves immutable workflow versions.');
    const before = this.read(actor, id),
      v = this.version(actor, id, version);
    if (before.revision !== revision || v.state !== 'draft') throw new Error('Choose the current draft version.');
    const errors = this.validate(v).filter((i) => i.severity === 'error');
    if (errors.length) throw new Error(errors.map((i) => i.message).join('; '));
    return this.organization.audited(actor, undefined, 'workflow.approved', id, () => {
      const w = this.store.read<CompanyWorkflow>('workflow', id)!;
      if (w.revision !== revision) throw new Error('Workflow changed.');
      const target = w.versions.find((x) => x.version === version)!;
      target.state = 'approved';
      target.approvedAt = now();
      w.revision++;
      w.updatedAt = now();
      this.store.saveResource('workflow', id, this.companyId, w);
      return structuredClone(w);
    });
  }
  archive(actor: CompanyActor, id: string, version: number, revision: number): CompanyWorkflow {
    if (actor.kind !== 'director') throw new Error('The director archives workflow versions.');
    const before = this.read(actor, id);
    if (before.revision !== revision) throw new Error('Workflow changed.');
    return this.organization.audited(actor, undefined, 'workflow.archived', id, () => {
      const w = this.store.read<CompanyWorkflow>('workflow', id)!;
      if (w.revision !== revision) throw new Error('Workflow revision changed.');
      const v = w.versions.find((v) => v.version === version);
      if (!v) throw new Error('Workflow version not found.');
      v.state = 'archived';
      w.revision++;
      w.updatedAt = now();
      this.store.saveResource('workflow', id, this.companyId, w);
      return structuredClone(w);
    });
  }
  private stepInput(step: WorkflowStep, input: unknown, outputs: Map<string, unknown>): unknown {
    return Object.fromEntries(Object.entries(step.bindings).map(([name, b]) => [name, field(b.source === 'input' ? input : outputs.get(b.stepId!), b.field)]));
  }
  simulate(actor: CompanyActor, id: string, version: number, input: unknown, samples: Record<string, unknown>): WorkflowSimulation {
    const v = this.version(actor, id, version),
      issues = this.validate(v, input),
      outputs = new Map<string, unknown>(),
      steps: WorkflowSimulation['steps'] = [],
      pending = [...v.steps];
    while (pending.length) {
      const index = pending.findIndex((s) => s.dependsOn.every((d) => steps.some((r) => r.stepId === d)));
      if (index < 0) {
        for (const s of pending) steps.push({ stepId: s.id, state: 'blocked' });
        break;
      }
      const s = pending.splice(index, 1)[0]!,
        blocked = issues.some((i) => i.stepId === s.id && i.severity === 'error') || s.dependsOn.some((d) => steps.find((r) => r.stepId === d)?.state === 'blocked');
      if (blocked) {
        steps.push({ stepId: s.id, state: 'blocked' });
        continue;
      }
      if (s.condition && canonicalAction(field(outputs.get(s.condition.stepId), s.condition.field)) !== canonicalAction(s.condition.equals)) {
        steps.push({ stepId: s.id, state: 'skipped' });
        continue;
      }
      const supplied = this.stepInput(s, input, outputs),
        data = s.type === 'approval' ? supplied : samples[s.id],
        errors = [...workflowDataErrors(s.inputSchema, supplied, 'Step input'), ...workflowDataErrors(s.outputSchema, data, 'Sample output')];
      for (const e of errors) issues.push({ stepId: s.id, code: 'sample', message: e, section: 'Workflows', severity: 'error' });
      const state = errors.length ? 'blocked' : s.type === 'approval' ? 'approval-required' : 'simulated';
      steps.push({ stepId: s.id, state, input: supplied, output: errors.length ? undefined : data });
      if (!errors.length) outputs.set(s.id, data);
    }
    const simulation: WorkflowSimulation = {
      id: 'simulation-' + randomUUID(),
      companyId: this.companyId,
      workflowId: id,
      version,
      mode: 'simulation',
      verifiedLive: false,
      issues,
      steps,
      createdAt: now(),
    };
    this.organization.audited(actor, undefined, 'workflow.simulated', id, () => {
      const older = this.store.list<WorkflowSimulation>('workflow-simulation', this.companyId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      for (const old of older.slice(0, Math.max(0, older.length - 99)))
        this.store.db.prepare('DELETE FROM records WHERE kind=? AND id=? AND company_id=?').run('workflow-simulation', old.id, this.companyId);
      this.store.saveResource('workflow-simulation', simulation.id, this.companyId, simulation);
    });
    return simulation;
  }
  start(actor: CompanyActor, id: string, version: number, input: unknown, requestId?: string): CompanyWorkflowRun {
    const v = this.version(actor, id, version);
    this.organization.require(actor, 'assign-work');
    if (requestId) {
      if (!/^[-\w]{1,100}$/.test(requestId)) throw new Error('Use a bounded workflow request ID.');
      const prior = this.store.list<CompanyWorkflowRun>('workflow-run', this.companyId).find((r) => r.requestId === requestId);
      if (prior) {
        if (
          prior.workflowId !== id ||
          prior.version !== version ||
          canonicalAction(prior.input) !== canonicalAction(input) ||
          canonicalAction(prior.createdBy) !== canonicalAction(actor)
        )
          throw new Error('This request ID belongs to another workflow invocation.');
        return structuredClone(prior);
      }
    }
    if (v.state !== 'approved') throw new Error('Approve this workflow version before live execution.');
    const issues = this.validate(v, input).filter((i) => i.severity === 'error');
    if (issues.length) throw new Error(issues.map((i) => i.message).join('; '));
    if (canonicalAction(input).length > 50000) throw new Error('Workflow input is too large. Use a scoped artifact reference.');
    if (actor.kind === 'agent')
      for (const s of v.steps.filter((s) => s.type === 'mission')) {
        const denied = this.organization.authorizeTool(actor.agentId, 'mission_manage', { action: 'create', agentId: s.agentId });
        if (denied && !denied.ok) throw new Error(denied.output);
      }
    const r: CompanyWorkflowRun = {
      id: 'workflow-run-' + randomUUID(),
      companyId: this.companyId,
      workflowId: id,
      version,
      directionVersion: this.store.get(this.companyId)!.directionVersion,
      revision: 1,
      state: 'queued',
      input: structuredClone(input),
      steps: v.steps.map((s) => ({ stepId: s.id, state: 'waiting', attempts: 0, priorMissionIds: [] })),
      createdBy: actor,
      createdAt: now(),
      requestId,
      updatedAt: now(),
    };
    return this.organization.audited(actor, 'assign-work', 'workflow.run-started', r.id, () => {
      if (this.pendingRuns().length >= 100) throw new Error('Finish or cancel pending workflow runs.');
      this.store.saveResource('workflow-run', r.id, this.companyId, r);
      return r;
    });
  }
  private persist(r: CompanyWorkflowRun): void {
    if (this.store.read<CompanyWorkflowRun>('workflow-run', r.id)?.revision !== r.revision) throw new Error('Workflow progress changed. Refresh before applying this transition.');
    r.revision++;
    r.updatedAt = now();
    this.store.saveResource('workflow-run', r.id, this.companyId, r);
  }
  private uncertain(agentId: string): boolean {
    return this.store.actions(this.companyId).some((a) => a.agentId === agentId && ['uncertain', 'executing'].includes(a.state));
  }
  private stopStep(step: WorkflowStepRun): void {
    if (step.missionId && this.organization.cowork.getMission(step.missionId)?.status === 'running') {
      this.organization.cowork.cancelMission(step.missionId);
      this.cancelExecution(step.missionId);
    }
  }
  cancel(actor: CompanyActor, id: string, revision: number): CompanyWorkflowRun {
    if (actor.kind !== 'director') throw new Error('The director cancels workflow runs.');
    const r = this.run(actor, id);
    if (r.revision !== revision) throw new Error('Run changed.');
    if (r.state === 'cancelled') return r;
    if (['completed', 'failed'].includes(r.state)) throw new Error('A settled workflow run keeps its recorded outcome.');
    return this.organization.audited(actor, undefined, 'workflow.cancelled', id, () => {
      for (const s of r.steps) this.stopStep(s);
      r.state = 'cancelled';
      r.reason = 'Director cancelled the run.';
      this.persist(r);
      return r;
    });
  }
  review(actor: CompanyActor, id: string, stepId: string, approved: boolean, expectedDigest: string, revision: number): CompanyWorkflowRun {
    if (actor.kind !== 'director' || typeof approved !== 'boolean') throw new Error('Director approval is required.');
    const r = this.run(actor, id),
      step = r.steps.find((s) => s.stepId === stepId);
    if (
      r.revision !== revision ||
      r.directionVersion !== this.store.get(this.companyId)!.directionVersion ||
      !step?.approval ||
      step.approval.state !== 'pending' ||
      step.approval.digest !== expectedDigest ||
      ['cancelled', 'completed', 'failed'].includes(r.state)
    )
      throw new Error('Approval is stale or does not match this exact input.');
    return this.organization.audited(actor, undefined, 'workflow.step-reviewed', id, () => {
      step.approval!.state = approved ? 'approved' : 'rejected';
      step.approval!.reviewedAt = now();
      step.state = approved ? 'completed' : 'failed';
      step.error = approved ? undefined : 'Director rejected this exact step input.';
      step.output = approved ? step.input : undefined;
      step.finishedAt = now();
      r.state = approved ? 'running' : 'failed';
      this.persist(r);
      return r;
    });
  }
  retry(actor: CompanyActor, id: string, stepId: string, revision: number): CompanyWorkflowRun {
    if (actor.kind !== 'director') throw new Error('The director reviews failed or blocked steps before retrying.');
    const r = this.run(actor, id),
      v = this.version(actor, r.workflowId, r.version),
      s = r.steps.find((s) => s.stepId === stepId),
      definition = v.steps.find((s) => s.id === stepId);
    if (
      r.revision !== revision ||
      r.directionVersion !== this.store.get(this.companyId)!.directionVersion ||
      !s ||
      !definition ||
      definition.type !== 'mission' ||
      !['failed', 'blocked'].includes(s.state) ||
      ['cancelled', 'completed'].includes(r.state) ||
      s.attempts >= definition.maxAttempts ||
      this.uncertain(definition.agentId!)
    )
      throw new Error('Retry is unavailable. Reconcile uncertain actions, check attempt limits and preserve the current direction.');
    return this.organization.audited(actor, undefined, 'workflow.step-retry', id, () => {
      this.stopStep(s);
      if (s.missionId) s.priorMissionIds.push(s.missionId);
      s.missionId = undefined;
      s.startedAt = undefined;
      s.finishedAt = undefined;
      s.error = undefined;
      s.state = 'waiting';
      r.state = 'running';
      this.persist(r);
      return r;
    });
  }
  prepare(): void {
    const company = this.store.get(this.companyId)!;
    for (const initial of this.pendingRuns()) {
      const r = structuredClone(initial),
        v = this.version({ kind: 'director' }, r.workflowId, r.version);
      for (const s of r.steps)
        if (s.missionId && !this.store.read('workflow-mission', this.companyId + ':' + s.missionId))
          this.store.saveResource('workflow-mission', this.companyId + ':' + s.missionId, this.companyId, {
            companyId: this.companyId,
            runId: r.id,
            stepId: s.stepId,
            agentId: v.steps.find((d) => d.id === s.stepId)?.agentId,
            timeoutMinutes: v.steps.find((d) => d.id === s.stepId)?.timeoutMinutes,
          });
      if (r.directionVersion !== company.directionVersion) {
        for (const step of r.steps) this.stopStep(step);
        r.state = 'blocked';
        r.reason = 'Company direction changed. Preserve this run and start a new one after review.';
        if (canonicalAction(r) !== canonicalAction(initial)) this.persist(r);
        continue;
      }
      if (company.state !== 'running') continue;
      if (r.createdBy.kind === 'agent') {
        let denial: string | undefined;
        try {
          this.organization.require(r.createdBy, 'assign-work');
          for (const definition of v.steps.filter((s) => s.type === 'mission')) {
            const result = this.organization.authorizeTool(r.createdBy.agentId, 'mission_manage', { action: 'create', agentId: definition.agentId });
            if (result && !result.ok) {
              denial = result.output;
              break;
            }
          }
        } catch (error) {
          denial = (error as Error).message;
        }
        if (denial) {
          for (const step of r.steps.filter((s) => s.state === 'running')) {
            this.stopStep(step);
            step.state = 'blocked';
            step.error = 'Reporting or assignment authority changed. Review this step before retrying.';
          }
          r.state = 'blocked';
          r.reason = denial;
          if (canonicalAction(r) !== canonicalAction(initial))
            this.organization.audited({ kind: 'director' }, undefined, 'workflow.authority-blocked', r.id, () => this.persist(r));
          continue;
        }
      }
      const outputs = new Map(r.steps.filter((s) => s.state === 'completed').map((s) => [s.stepId, s.output])),
        issues = this.validate(v, r.input);
      let active = r.steps.filter((s) => s.state === 'running').length;
      for (const step of r.steps) {
        const definition = v.steps.find((s) => s.id === step.stepId)!;
        if (step.state === 'running' && step.missionId) {
          const mission = this.organization.cowork.getMission(step.missionId);
          if (!mission) {
            step.state = 'failed';
            step.error = 'Assigned mission is missing.';
            active--;
            continue;
          }
          if (mission.status === 'done') {
            try {
              const output = definition.outputSchema.type === 'string' ? mission.result : JSON.parse(mission.result ?? '');
              const errors = workflowDataErrors(definition.outputSchema, output, 'Produced output');
              if (errors.length) throw new Error(errors.join('; '));
              step.output = output;
              step.state = 'completed';
              step.finishedAt = now();
              outputs.set(step.stepId, output);
            } catch (error) {
              step.state = 'blocked';
              step.error = (error as Error).message;
            }
            active--;
          } else if (['failed', 'cancelled', 'blocked'].includes(mission.status)) {
            step.state = mission.status === 'blocked' ? 'blocked' : 'failed';
            step.error = mission.blockers || mission.result || 'Mission stopped.';
            active--;
          } else if (this.clock() - Date.parse(step.startedAt!) > definition.timeoutMinutes * 60000) {
            this.stopStep(step);
            step.state = 'failed';
            step.error = 'Workflow step timed out; its saved work is preserved.';
            active--;
          }
        }
      }
      for (const step of r.steps) {
        if (!['waiting', 'ready'].includes(step.state)) continue;
        const definition = v.steps.find((s) => s.id === step.stepId)!;
        if (!definition.dependsOn.every((d) => ['completed', 'skipped'].includes(r.steps.find((s) => s.stepId === d)?.state ?? ''))) continue;
        if (definition.dependsOn.some((d) => r.steps.find((s) => s.stepId === d)?.state === 'skipped')) {
          step.state = 'skipped';
          continue;
        }
        if (definition.condition && canonicalAction(field(outputs.get(definition.condition.stepId), definition.condition.field)) !== canonicalAction(definition.condition.equals)) {
          step.state = 'skipped';
          continue;
        }
        const errors = issues.filter((i) => i.severity === 'error' && (!i.stepId || i.stepId === step.stepId));
        const supplied = this.stepInput(definition, r.input, outputs);
        errors.push(
          ...workflowDataErrors(definition.inputSchema, supplied, 'Step input').map((message) => ({
            message,
            severity: 'error' as const,
            code: 'handoff',
            section: 'Workflows' as const,
          })),
        );
        if (errors.length) {
          step.state = 'blocked';
          step.error = errors.map((i) => i.message).join('; ');
          continue;
        }
        step.input = supplied;
        if (definition.type === 'approval') {
          step.approval = { digest: digest({ runId: r.id, version: r.version, stepId: step.stepId, input: supplied, directionVersion: r.directionVersion }), state: 'pending' };
          step.state = 'blocked';
          step.error = 'Director approval required.';
          continue;
        }
        if (active >= Math.min(v.parallelism, company.workers)) continue;
        const cowork = this.organization.cowork,
          conversation =
            cowork.listConversations().find((c) => c.kind === 'dm' && c.memberIds.length === 1 && c.memberIds[0] === definition.agentId) ??
            cowork.saveConversation({ kind: 'dm', memberIds: [definition.agentId!] });
        const goal =
          definition.goal + '\nWorkflow inputs: ' + JSON.stringify(supplied) + '\nReturn the final result matching this schema: ' + JSON.stringify(definition.outputSchema);
        if (goal.length > 2000) {
          step.state = 'blocked';
          step.error = 'The task briefing exceeds the existing mission limit. Use a scoped artifact reference for large inputs.';
          continue;
        }
        this.organization.audited({ kind: 'director' }, undefined, 'workflow.step-dispatched', r.id, () => {
          const latest = this.store.read<CompanyWorkflowRun>('workflow-run', r.id)!;
          if (latest.revision !== initial.revision) throw new Error('Workflow admission changed.');
          if (latest.steps.find((s) => s.stepId === step.stepId)?.missionId) throw new Error('Workflow step was already admitted.');
          const mission = cowork.createMission({
            agentId: definition.agentId!,
            conversationId: conversation.id,
            goal,
            criteria: definition.criteria,
            maxTurns: definition.maxSessions,
          });
          step.missionId = mission.id;
          this.store.saveResource('workflow-mission', this.companyId + ':' + mission.id, this.companyId, {
            companyId: this.companyId,
            runId: r.id,
            stepId: step.stepId,
            agentId: definition.agentId,
            timeoutMinutes: definition.timeoutMinutes,
          });
          step.attempts++;
          step.state = 'running';
          step.startedAt = now();
          this.store.enqueue(this.companyId, 'mission', { missionId: mission.id, workflowRunId: r.id, workflowStepId: step.stepId }, mission.id);
          this.store.saveResource('workflow-run', r.id, this.companyId, r);
        });
        active++;
      }
      r.state = r.steps.every((s) => ['completed', 'skipped'].includes(s.state))
        ? 'completed'
        : r.steps.some((s) => s.state === 'failed')
          ? 'failed'
          : r.steps.some((s) => s.state === 'running')
            ? 'running'
            : r.steps.some((s) => s.state === 'blocked')
              ? 'blocked'
              : 'waiting';
      r.reason = r.state === 'blocked' ? 'Review blocked steps and approvals.' : undefined;
      if (r.state === 'failed')
        for (const s of r.steps.filter((s) => s.state === 'running')) {
          this.stopStep(s);
          s.state = 'failed';
          s.error = 'Stopped because another workflow step failed. Saved work is preserved.';
        }
      if (canonicalAction(r) !== canonicalAction(initial)) this.organization.audited({ kind: 'director' }, undefined, 'workflow.progress', r.id, () => this.persist(r));
    }
  }
  assertMission(missionId?: string): void {
    if (!missionId) return;
    const pointer = this.store.read<{ companyId: string; runId: string; stepId: string; agentId?: string; timeoutMinutes?: number }>(
      'workflow-mission',
      this.companyId + ':' + missionId,
    );
    if (!pointer) return;
    if (pointer.companyId !== this.companyId) throw new Error('Workflow mission belongs to another company.');
    const r = this.store.read<CompanyWorkflowRun>('workflow-run', pointer.runId);
    if (!r || r.companyId !== this.companyId) throw new Error('Workflow provenance is unavailable.');
    const step = r.steps.find((s) => s.stepId === pointer.stepId);
    if (
      !step ||
      step.missionId !== missionId ||
      step.state !== 'running' ||
      ['cancelled', 'completed', 'failed'].includes(r.state) ||
      r.directionVersion !== this.store.get(this.companyId)!.directionVersion
    )
      throw new Error('Workflow mission permission ended. Preserve saved work before retrying.');
    if (pointer.timeoutMinutes && this.clock() - Date.parse(step.startedAt!) > pointer.timeoutMinutes * 60000)
      throw new Error('Workflow step timeout reached. Preserve saved work.');
    if (r.createdBy.kind === 'agent') {
      this.organization.require(r.createdBy, 'assign-work');
      const target = pointer.agentId ?? this.organization.cowork.getMission(missionId)?.agentId,
        denied = this.organization.authorizeTool(r.createdBy.agentId, 'mission_manage', { action: 'create', agentId: target });
      if (denied && !denied.ok) throw new Error(denied.output);
    }
  }
}
