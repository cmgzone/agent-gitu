export type TaskStatus =
  | 'intake'
  | 'planning'
  | 'review'
  | 'executing'
  | 'verifying'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'aborted';

export interface ProjectLock {
  name: string;
  repoRoot: string;
  branch?: string;
  techStack: string[];
  entrypoints: string[];
  testCommand?: string;
  buildCommand?: string;
  lintCommand?: string;
  typecheckCommand?: string;
  ignorePaths: string[];
  lockedAt: string;
}

export type CriterionEvidenceType =
  | 'command_success'
  | 'test_success'
  | 'build_success'
  | 'lint_success'
  | 'typecheck_success'
  | 'any';

export interface CriterionSpec {
  text: string;
  verification?: string;
  evidenceType?: CriterionEvidenceType;
}

export interface AcceptanceCriterion {
  id: string;
  text: string;
  /** When set, the criterion can ONLY be satisfied by evidence from this exact command. */
  verification?: string;
  /** Expected evidence type. Default: 'any' (any passing evidence). */
  evidenceType?: CriterionEvidenceType;
  evidenceIds: string[];
  satisfied: boolean;
}

export type EvidenceKind =
  | 'test'
  | 'build'
  | 'lint'
  | 'typecheck'
  | 'command'
  | 'diff'
  | 'manual'
  | 'log'
  | 'file';

export interface Evidence {
  id: string;
  kind: EvidenceKind;
  label: string;
  command?: string;
  exitCode?: number;
  passed: boolean;
  outputExcerpt: string;
  artifactPath?: string;
  createdAt: string;
  workspaceFingerprint?: string;
  stale?: boolean;
}

export type StepStatus = 'pending' | 'in_progress' | 'done' | 'failed' | 'blocked';

export interface PlanStep {
  id: string;
  description: string;
  verification: string;
  status: StepStatus;
  attempts: number;
}

export type ActionStatus = 'success' | 'error' | 'denied' | 'blocked' | 'skipped';

export interface ActionRecord {
  id: string;
  stepId?: string;
  tool: string;
  paramsHash: string;
  paramsSummary: string;
  status: ActionStatus;
  errorSignature?: string;
  exitCode?: number;
  reason: string;
  expected: string;
  observation?: string;
  durationMs: number;
  createdAt: string;
}

export type MemoryType =
  | 'project'
  | 'architecture'
  | 'decision'
  | 'task'
  | 'failure'
  | 'preference';

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  claim: string;
  evidence?: string;
  scope: string;
  confidence: number;
  createdAt: string;
}

export type FileRole =
  | 'entrypoint'
  | 'implementation'
  | 'interface'
  | 'test'
  | 'config'
  | 'docs'
  | 'generated'
  | 'legacy'
  | 'dependency'
  | 'artifact'
  | 'unknown';

export interface FileRef {
  path: string;
  role: FileRole;
  score: number;
  note?: string;
}

export interface ContextPack {
  taskSummary: string;
  primaryFiles: FileRef[];
  relatedFiles: FileRef[];
  testFiles: FileRef[];
  configFiles: FileRef[];
  excludedPaths: string[];
  budget: { maxFiles: number; maxBytes: number };
}

export interface CompletionReport {
  taskId: string;
  goal: string;
  status: 'complete' | 'blocked' | 'failed';
  summary: string;
  changes: string[];
  filesChanged: string[];
  verification: string[];
  /** Structured evidence for the UI. `verification` remains for text/CLI reports. */
  verificationDetails?: VerificationReportItem[];
  /** Browser work recorded during the task, when visual verification was used. */
  browserActivity?: BrowserActivity;
  evidence: string[];
  remainingRisks: string[];
  followUps: string[];
  generatedAt: string;
}

export interface VerificationReportItem {
  id: string;
  kind: EvidenceKind;
  label: string;
  passed: boolean;
  exitCode?: number;
  command?: string;
  outputExcerpt?: string;
}

export interface BrowserActivity {
  total: number;
  successful: number;
  screenshots: number;
}

export interface TaskLedgerData {
  schemaVersion: 1;
  taskId: string;
  goal: string;
  status: TaskStatus;
  mode: 'fast' | 'standard' | 'chat';
  project: ProjectLock;
  gitBranch?: string;
  worktreePath?: string;
  activeSkills?: string[];
  usedSkills?: string[];
  acceptanceCriteria: AcceptanceCriterion[];
  constraints: string[];
  nonGoals: string[];
  contextPack?: ContextPack;
  plan: PlanStep[];
  planApproved?: boolean;
  currentHypothesis?: string;
  actions: ActionRecord[];
  evidence: Evidence[];
  filesChanged: string[];
  checkpoints: { stepId: string; ref: string; createdAt: string }[];
  blockers: string[];
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  report?: CompletionReport;
}

export type SpecialistStatus = 'SUCCESS' | 'PARTIAL_SUCCESS' | 'BLOCKED' | 'FAILED' | 'CANCELLED';

export interface StructuredSpecialistReport {
  agent: string;
  task: string;
  ok: boolean;
  status: SpecialistStatus;
  summary: string;
  turnsUsed: number;
  turnsBudgeted: number;
  filesInspected: string[];
  filesChanged: string[];
  criteriaStatus?: { id: string; text: string; satisfied: boolean }[];
  evidenceIds: string[];
  blockers?: string[];
  recommendation?: string;
}

export type RiskTier = 'safe' | 'moderate' | 'dangerous';

export interface ToolResult {
  ok: boolean;
  output: string;
  exitCode?: number;
  errorSignature?: string;
  filesTouched?: string[];
  linesAdded?: number;
  image?: string;
  /** Optional structured data that rides along in-memory (never serialized to the model). */
  payload?: unknown;
}
