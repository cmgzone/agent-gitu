import type { Evidence, ProjectLock, TaskLedgerData } from '../types.js';
import { planRisk } from '../agent/risk-planner.js';
import { classifyEvidenceKind, commandsMatch, evidenceMatchesWorkspace, isManufacturedEvidenceCommand, isTrivialEvidenceCommand } from './evidence.js';

const SENSITIVE_PATH_PATTERNS = [
  // Authentication, authorization, access control, secrets, keys
  /\b(auth|session|sessions|login|logout|password|passwords|credential|credentials|secret|secrets|jwt|oauth|rbac|permission|permissions|crypto|cipher|ssl|tls|cert|certs|api[_-]?key|api[_-]?keys)\b/i,
  // Auth/access tokens (excluding explicit design/style tokens)
  /\b((?:auth|access|refresh|session|csrf|api|bearer|user)[_-]?tokens?|tokens?[_-]service)\b/i,
  // Payments, billing, financial transactions
  /\b(payment|payments|billing|stripe|invoice|invoices|subscription|subscriptions|checkout|charge|charges|transaction|transactions)\b/i,
  // Database migrations and schemas
  /\b(migrations?|schema\.(sql|prisma|ts|js|json)|db[/\\]schema|prisma[/\\]schema|liquibase|flyway|seeders?)\b/i,
  // Environment secrets, certificates, private keys
  /\.(env(?:\.[a-z0-9_-]+)?|pem|key|crt|p12|pfx)$|^\.env|\bcredentials\.json\b/i,
  // CI/CD pipelines, container orchestration, infrastructure as code
  /(?:\.github[/\\]workflows|\bdeploy[/\\]|\bk8s\b|\bkubernetes\b|\bhelm\b|\bterraform\b|\bdocker-compose)/i,
];

const DESIGN_TOKEN_PATH = /\b(design[-_]?tokens?|style[-_]?tokens?|theme[/\\]tokens?|tokens?[/\\](?:colors?|spacing|typography))\b/i;

/**
 * Evaluates whether changes carry security, financial, data, or critical infrastructure consequences.
 * Consequence is determined by the task domain and the sensitive nature of the touched files,
 * never by raw file count alone.
 */
export function isConsequentialChange(goal: string, filesChanged: string[]): boolean {
  const isDesignGoal = /\b(?:design|styling|ui|css|theme|color|typography|spacing)\s+tokens?\b/i.test(goal);
  if (planRisk(goal).strictVerification && !isDesignGoal) return true;
  for (const file of filesChanged) {
    const normalized = file.replace(/\\/g, '/');
    if (DESIGN_TOKEN_PATH.test(normalized)) continue;
    if (SENSITIVE_PATH_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  }
  return false;
}

/**
 * Checks that all changed files were successfully written and verified by host-confirmed tool executions
 * matching the current workspace fingerprint.
 */
export function verifiedHostConfirmedWrites(data: Pick<TaskLedgerData, 'filesChanged' | 'actions'>, fingerprint: string): boolean {
  if (!data.filesChanged.length) return false;
  if (data.actions.some((action) => ['write_file', 'apply_edit'].includes(action.tool) && action.status !== 'success')) return false;
  return data.filesChanged.every((file) => data.actions.some((action) => action.status === 'success' &&
    ['write_file', 'apply_edit'].includes(action.tool) && action.verificationScope?.validatedFor === fingerprint &&
    action.verificationScope.paths.includes(file.replace(/\\/g, '/'))));
}

/** A host-confirmed text write is sufficient for a small documentation edit.
 * Every changed document must still match its own persisted-write snapshot. */
export function verifiedDocumentationWrites(data: Pick<TaskLedgerData, 'filesChanged' | 'actions'>, fingerprint: string): boolean {
  if (!data.filesChanged.length || !data.filesChanged.every((file) => /\.(?:md|rst|txt)$/i.test(file))) return false;
  return verifiedHostConfirmedWrites(data, fingerprint);
}

/** Requirements always win. Otherwise prefer existing proof, then the smallest
 * available check. Strict work adds behavioral and type checks, not every script. */
export function selectVerificationCommands(input: {
  required: string[];
  project: Pick<ProjectLock, 'testCommand' | 'lintCommand' | 'typecheckCommand' | 'buildCommand'>;
  evidence: Evidence[];
  fingerprint: string;
  strict: boolean;
}): Set<string> {
  const commands = new Set<string>();
  const add = (command: string | undefined): void => {
    if (command && ![...commands].some((existing) => commandsMatch(existing, command))) commands.add(command);
  };
  input.required.forEach(add);
  const latest = new Map<string, Evidence>();
  for (const check of input.evidence) if (check.command) latest.set(check.command.trim().replace(/\s+/g, ' ').toLowerCase(), check);
  const freshPasses = [...latest.values()].filter((check) => check.passed && !check.stale &&
    evidenceMatchesWorkspace(check, input.fingerprint) && (check.exitCode === undefined || check.exitCode === 0) &&
    !isTrivialEvidenceCommand(check.command!) && !isManufacturedEvidenceCommand(check.command!));
  if (input.strict) {
    for (const [kind, command] of [['test', input.project.testCommand], ['typecheck', input.project.typecheckCommand]] as const) {
      if (![...commands].some((check) => classifyEvidenceKind(check) === kind) && !freshPasses.some((check) => check.kind === kind)) add(command);
    }
  }
  if (!commands.size && !freshPasses.length) add(input.project.typecheckCommand ?? input.project.testCommand ?? input.project.lintCommand ?? input.project.buildCommand);
  return commands;
}
