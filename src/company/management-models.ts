/** Organizational authority intersects, and never replaces, tool/resource grants. */
export type CompanyActor = { kind: 'director' } | { kind: 'agent'; agentId: string };
export type CompanyRole = 'ceo' | 'team-leader' | 'employee';
export type OrganizationalCapability = 'organize-meetings' | 'chair-meetings' | 'assign-work' | 'design-workflows' | 'manage-departments' | 'propose-staff';
export interface CompanyMeetingRequest {
  id: string;
  companyId: string;
  revision: number;
  requestedBy: string;
  title: string;
  reason: string;
  type: CompanyMeetingType;
  participants: { agentId: string }[];
  agenda: string[];
  state: 'pending' | 'scheduled' | 'declined';
  directionVersion: number;
  meetingId?: string;
  resolution?: string;
  createdAt: string;
  updatedAt: string;
}
export interface CompanyAuthority {
  capabilities: OrganizationalCapability[];
  /** Absent inherits existing grants; an empty list explicitly grants nothing. */
  tools?: string[];
  connectionIds?: string[];
  accountIds?: string[];
}
export interface CompanyMember {
  agentId: string;
  role: CompanyRole;
  jobTitle: string;
  departmentId?: string;
  managerId?: string;
  responsibilities: string[];
  authority: CompanyAuthority;
  status: 'active' | 'onboarding' | 'retraining' | 'suspended';
  onboardingRequired?: boolean;
  updatedAt: string;
}
export interface CompanyDepartment {
  id: string;
  companyId: string;
  name: string;
  purpose: string;
  leaderId?: string;
  updatedAt: string;
}
export interface CompanyOrganizationRecord {
  companyId: string;
  revision: number;
  members: CompanyMember[];
  updatedAt: string;
}
export interface CompanyManagementEvent {
  id: string;
  companyId: string;
  actor: CompanyActor;
  kind: string;
  resourceId: string;
  revision?: number;
  detail: string;
  at: string;
}
export interface CompanyHandbookVersion {
  version: number;
  content: string;
  proposedBy: CompanyActor;
  state: 'proposed' | 'approved' | 'rejected' | 'superseded';
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: CompanyActor;
}
export interface CompanyHandbookEntry {
  id: string;
  companyId: string;
  revision: number;
  title: string;
  kind: 'guideline' | 'suggestion';
  state: 'current' | 'archived';
  versions: CompanyHandbookVersion[];
  approvedVersion?: number;
  memoryIndexedVersion?: number;
  updatedAt: string;
}

export type MeetingState = 'scheduled' | 'active' | 'summarizing' | 'completed' | 'cancelled' | 'interrupted';
export type MeetingParticipation = 'listening' | 'hand-raised' | 'queued' | 'speaking' | 'muted' | 'excused';
export type OnboardingStage = 'identity' | 'orientation' | 'meeting' | 'resources' | 'assessment' | 'active' | 'blocked' | 'retraining';
export interface CompanyOnboarding {
  id: string;
  companyId: string;
  agentId: string;
  revision: number;
  stage: OnboardingStage;
  signature: string;
  history?: (Pick<CompanyOnboarding, 'signature' | 'orientation' | 'meetingId' | 'assessment'> & { endedAt: string; reason: string })[];
  orientation?: { mission: string; direction: string; role: CompanyMember; handbook: { id: string; version: number }[]; acknowledgedAt: string };
  meetingId?: string;
  requirements: { tools: string[]; connectionIds: string[]; accountIds: string[]; skills: string[] };
  resourceCheck?: { checkedAt: string; problems: string[] };
  assessment?: { missionId: string; criteria: string[]; review?: { approved: boolean; notes: string; evidenceMessageIds: string[]; reviewer: CompanyActor; at: string } };
  updatedAt: string;
}
export type CompanyDecisionState = 'proposed' | 'under-review' | 'approval-required' | 'approved' | 'rejected' | 'executing' | 'completed' | 'failed';
export type WorkflowDefinitionState = 'draft' | 'approved' | 'archived';
export type WorkflowRunState = 'queued' | 'running' | 'waiting' | 'blocked' | 'completed' | 'failed' | 'cancelled';
export type WorkflowStepState = 'ready' | 'running' | 'waiting' | 'blocked' | 'failed' | 'completed' | 'skipped';

export type CompanyMeetingType =
  'onboarding' | 'daily' | 'weekly' | 'strategy' | 'roadmap' | 'workflow-planning' | 'emergency' | 'problem-solving' | 'department' | 'project-review';
export interface MeetingParticipant {
  agentId: string;
  displayName?: string;
  attendance: 'required' | 'optional' | 'observer' | 'excused';
  state: MeetingParticipation;
  joinedAt?: string;
}
export interface MeetingHandRequest {
  id: string;
  agentId: string;
  agendaId: string;
  reason: string;
  priority: 'normal' | 'urgent' | 'emergency';
  evidence: string[];
  objectionTo?: string;
  state: 'queued' | 'deferred' | 'granted' | 'rejected' | 'written';
  decisionReason?: string;
  createdAt: string;
}
export interface MeetingSpeakingLease {
  id: string;
  agentId: string;
  agendaId: string;
  expiresAt: string;
  grantedAt: string;
  requestId?: string;
  jobId?: string;
}
export interface MeetingContribution {
  id: string;
  seq: number;
  agentId: string | 'director';
  agendaId: string;
  text: string;
  kind: 'contribution' | 'objection' | 'written';
  evidence: string[];
  objectionTo?: string;
  turnId?: string;
  at: string;
  sourceMessageId?: string;
}
export interface MeetingDecision {
  id: string;
  agendaId: string;
  title: string;
  rationale: string;
  proposedBy: string | 'director';
  state: CompanyDecisionState;
  requiresDirector: boolean;
  actionId?: string;
  decidedBy?: CompanyActor;
  decidedAt?: string;
}
export interface MeetingActionItem {
  id: string;
  title: string;
  agentId: string;
  criteria: string[];
  deadline?: string;
  state: 'proposed' | 'assigned' | 'blocked' | 'completed';
  missionId?: string;
  decisionId?: string;
}
export interface MeetingSummary {
  discussed: { agendaId: string; title: string; contributions: number }[];
  confirmedDecisions: string[];
  pendingProposals: string[];
  rejectedProposals: string[];
  actionItems: string[];
  objections: string[];
  outstandingRequests: string[];
  endingReason: string;
  generatedAt: string;
}
export interface CompanyMeeting {
  id: string;
  companyId: string;
  revision: number;
  title: string;
  description: string;
  type: CompanyMeetingType;
  organizer: CompanyActor;
  requestId?: string;
  requestedBy?: string;
  chairId: string;
  departmentId?: string;
  conversationId?: string;
  agenda: { id: string; title: string }[];
  participants: MeetingParticipant[];
  startAt: string;
  endAt: string;
  timezone: string;
  state: MeetingState;
  directionVersion: number;
  automaticModeration: boolean;
  maxTurns: number;
  budgetUsd: number | null;
  turns: number;
  requests: MeetingHandRequest[];
  contributions: MeetingContribution[];
  decisions: MeetingDecision[];
  actionItems: MeetingActionItem[];
  lease?: MeetingSpeakingLease;
  directorHasFloor?: boolean;
  summary?: MeetingSummary;
  startedAt?: string;
  endedAt?: string;
  interruptedReason?: string;
  createdAt: string;
  updatedAt: string;
}
