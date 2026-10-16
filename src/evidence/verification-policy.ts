import type { Evidence, ProjectLock, TaskLedgerData } from '../types.js';
import { classifyEvidenceKind, commandsMatch, evidenceMatchesWorkspace, isManufacturedEvidenceCommand, isTrivialEvidenceCommand } from './evidence.js';

/** A host-confirmed text write is sufficient for a small documentation edit.
 * Every changed document must still match its own persisted-write snapshot. */
export function verifiedDocumentationWrites(data: Pick<TaskLedgerData, 'filesChanged' | 'actions'>, fingerprint: string): boolean {
  if (!data.filesChanged.length || !data.filesChanged.every((file) => /\.(?:md|rst|txt)$/i.test(file))) return false;
  if (data.actions.some((action) => ['write_file', 'apply_edit'].includes(action.tool) && action.status !== 'success')) return false;
  return data.filesChanged.every((file) => data.actions.some((action) => action.status === 'success' &&
    ['write_file', 'apply_edit'].includes(action.tool) && action.verificationScope?.validatedFor === fingerprint &&
    action.verificationScope.paths.includes(file.replace(/\\/g, '/'))));
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
