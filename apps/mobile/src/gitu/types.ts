/** Public Gitu REST contract, independent of Node-only server imports. */
export interface Run {
  runId: string;
  goal: string;
  status: 'running' | 'waiting_for_model' | 'stalled' | 'completed' | 'blocked' | 'failed' | 'aborted';
  startedAt: string;
  taskId?: string;
  project?: string;
  projectPath?: string;
  worktreePath?: string;
  branch?: string;
  provider?: string;
  model?: string;
  mode?: string;
  error?: string;
  pendingApprovals: { id: string; tool: string; why: string; summary: string }[];
  pendingPlanReview?: { id: string; criteria: string[]; steps: { description: string; verification: string }[] };
  pendingQuestions?: { id: string; questions: { question: string; options: string[] }[] };
  pendingConnection?: { id: string };
  usage?: { costUsd?: number; inputTokens?: number; outputTokens?: number };
  report?: { summary: string; verification: string[]; filesChanged: string[]; blockers?: string[] };
  files: { id: string; name: string; size: number; mime: string; downloadUrl: string }[];
}
export interface RunEvent {
  i: number;
  t: string;
  text: string;
  typed?: { type: string; [key: string]: unknown };
}
export interface EventPage {
  session: Run;
  events: RunEvent[];
  cursor: number;
  more: boolean;
}
export interface Project {
  name: string;
  path: string;
}
export interface FileListing {
  root: string;
  path: string;
  writable: boolean;
  entries?: { name: string; path: string; directory: boolean }[];
  content?: string;
  revision?: string;
}

export interface Teammate {
  id: string;
  name: string;
  tagline: string;
  systemPrompt: string;
  avatar: { color?: string; [key: string]: unknown };
  provider?: string;
  model?: string;
  effort?: 'low' | 'medium' | 'high' | 'max';
  skills: string[];
  allowShell: boolean;
  allowWrites: boolean;
  allowConfig: boolean;
  useHostComputer: boolean;
  chiefOfStaff: boolean;
}
export interface TeamConversation {
  id: string;
  kind: 'dm' | 'group';
  title: string;
  memberIds: string[];
  chiefId?: string;
  updatedAt: string;
}
export interface TeamMessage {
  id: string;
  seq: number;
  role: 'user' | 'agent' | 'system';
  agentName?: string;
  text: string;
  ts: string;
  revision: number;
  status: 'sending' | 'sent' | 'failed' | 'retrying';
  artifactIds?: string[];
}
export interface TeamRequest {
  id: string;
  agentId: string;
  kind: 'permission' | 'question' | 'recommendation' | 'credential';
  title: string;
  detail: string;
  options: string[];
  status: string;
}
export interface TeamRoster {
  agents: Teammate[];
  conversations: TeamConversation[];
}
export interface TeamView {
  messages: TeamMessage[];
  threads: { id: string; title: string; topic?: string }[];
  threadId: string | null;
  busy: boolean;
  working: string | null;
  queued: number;
  progresses: { agentId?: string; agentName: string; text?: string; [key: string]: unknown }[];
  workHistory: { id: string; agentName: string; tool: string; ok: boolean; publicUpdate: string }[];
  requests: TeamRequest[];
  missions: { id: string; goal: string; status: string }[];
  artifacts: { id: string; name: string }[];
  deleted: boolean;
}
export function needsInput(run: Run): boolean {
  return Boolean(run.pendingApprovals.length || run.pendingPlanReview || run.pendingQuestions || run.pendingConnection);
}
export function isRunning(run: Run): boolean {
  return run.status === 'running' || run.status === 'waiting_for_model';
}
