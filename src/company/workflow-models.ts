import type { CompanyActor, WorkflowDefinitionState, WorkflowRunState, WorkflowStepState } from './management-models.js';
export interface WorkflowSchema {
  type: 'object' | 'string' | 'number' | 'boolean' | 'array';
  properties?: Record<string, WorkflowSchema>;
  required?: string[];
  items?: WorkflowSchema;
}
export interface WorkflowBinding {
  source: 'input' | 'step';
  stepId?: string;
  field?: string;
}
export interface WorkflowStep {
  id: string;
  name: string;
  type: 'mission' | 'approval';
  agentId?: string;
  goal: string;
  criteria: string[];
  dependsOn: string[];
  bindings: Record<string, WorkflowBinding>;
  inputSchema: WorkflowSchema;
  outputSchema: WorkflowSchema;
  tools: string[];
  skills: string[];
  connectionIds: string[];
  accountIds: string[];
  condition?: { stepId: string; field?: string; equals: string | number | boolean | null };
  maxSessions: number;
  maxAttempts: number;
  timeoutMinutes: number;
  position?: { x: number; y: number };
}
export interface WorkflowVersion {
  version: number;
  state: WorkflowDefinitionState;
  steps: WorkflowStep[];
  inputs: WorkflowSchema;
  parallelism: number;
  createdBy: CompanyActor;
  createdAt: string;
  approvedAt?: string;
}
export interface CompanyWorkflow {
  id: string;
  companyId: string;
  revision: number;
  title: string;
  versions: WorkflowVersion[];
  updatedAt: string;
}
export interface WorkflowStepRun {
  stepId: string;
  state: WorkflowStepState;
  attempts: number;
  missionId?: string;
  priorMissionIds: string[];
  startedAt?: string;
  finishedAt?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  approval?: { digest: string; state: 'pending' | 'approved' | 'rejected'; reviewedAt?: string };
}
export interface CompanyWorkflowRun {
  id: string;
  companyId: string;
  workflowId: string;
  version: number;
  directionVersion: number;
  revision: number;
  state: WorkflowRunState;
  input: unknown;
  steps: WorkflowStepRun[];
  createdBy: CompanyActor;
  createdAt: string;
  updatedAt: string;
  reason?: string;
  requestId?: string;
}
export interface WorkflowIssue {
  stepId?: string;
  code: string;
  message: string;
  section: 'Team' | 'Connections' | 'Workflows' | 'Settings';
  severity: 'error' | 'approval';
}
export interface WorkflowSimulation {
  id: string;
  companyId: string;
  workflowId: string;
  version: number;
  mode: 'simulation';
  verifiedLive: false;
  issues: WorkflowIssue[];
  steps: { stepId: string; state: 'simulated' | 'blocked' | 'skipped' | 'approval-required'; input?: unknown; output?: unknown }[];
  createdAt: string;
}
