import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import type { AcceptanceCriterion } from '../types.js';
import { classifyEvidenceKind, commandsMatch, evidenceKindForType, isManufacturedEvidenceCommand, isTrivialEvidenceCommand } from './evidence.js';

const execute = promisify(execFile);
export interface VerificationCommandInspection {
  ok: boolean;
  reason: string;
}

/** Resolve command names without executing the proposed verification. This is
 * metadata validation, not authorization: the normal executor still owns policy. */
export async function inspectVerificationCommand(command: string, cwd: string, signal?: AbortSignal): Promise<VerificationCommandInspection> {
  if (!command.trim()) return { ok: false, reason: 'Verification needs an executable command, not an empty description.' };
  try {
    // Resolve literal runtime entrypoints too: finding node/python does not
    // establish that the script being pinned actually exists. Never run it.
    const target = /^(?:node(?:\.exe)?(?:\s+--check)?|python(?:3)?(?:\.exe)?|py(?:\.exe)?)\s+(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/i.exec(command.trim());
    const script = target?.[1] ?? target?.[2] ?? target?.[3];
    if (script && !script.startsWith('-') && /\.(?:[cm]?[jt]s|py)$/i.test(script) && !(await stat(path.resolve(cwd, script)).catch(() => undefined))?.isFile()) {
      return { ok: false, reason: `Verification script is unavailable: ${script}. Discover an existing check or bind a suitable replacement.` };
    }
    if (process.platform === 'win32') {
      const encoded = Buffer.from(command, 'utf8').toString('base64');
      const script = `
$source = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseInput($source, [ref]$tokens, [ref]$errors)
if ($errors.Count) { @{ ok = $false; reason = 'Verification has invalid PowerShell syntax.' } | ConvertTo-Json -Compress; exit }
$defined = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst] }, $true) | ForEach-Object { $_.Name })
$commands = @($ast.FindAll({ param($n) $n -is [Management.Automation.Language.CommandAst] }, $true))
$hasDotSource = @($commands | Where-Object { $_.InvocationOperator -eq 'Dot' }).Count -gt 0
$missing = @()
foreach ($entry in $commands) {
  $name = $entry.GetCommandName()
  if ($name -and $name -notin $defined -and -not $hasDotSource -and -not (Get-Command -Name $name -ErrorAction SilentlyContinue)) { $missing += $name }
}
if ($missing.Count) { @{ ok = $false; reason = ('Verification is a description or references unavailable commands: ' + ($missing -join ', ') + '. Bind an exact executable verification command.') } | ConvertTo-Json -Compress }
elseif (-not $commands.Count) { @{ ok = $false; reason = 'Verification contains no command. Bind an exact executable verification command.' } | ConvertTo-Json -Compress }
else { @{ ok = $true; reason = 'Command names resolved; normal execution policy still applies.' } | ConvertTo-Json -Compress }
`;
      const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
        cwd,
        signal,
        windowsHide: true,
      });
      return JSON.parse(stdout.trim()) as VerificationCommandInspection;
    }
    const first = /^(?:\w+=\S+\s+)*("[^"]+"|'[^']+'|[^\s;&|]+)/.exec(command.trim())?.[1]?.replace(/^['"]|['"]$/g, '');
    if (!first) return { ok: false, reason: 'Bind an exact executable verification command.' };
    await execute('/bin/sh', ['-c', 'command -v "$1" >/dev/null 2>&1', 'gitu-verification', first], { cwd, signal });
    return { ok: true, reason: 'Command name resolved; normal execution policy still applies.' };
  } catch {
    signal?.throwIfAborted();
    return { ok: false, reason: 'Verification could not be resolved as an executable command. Bind an available command; do not execute a verification description.' };
  }
}

/** Repair an unbound/invalid oracle without weakening a pinned valid command,
 * changing the requirement, or treating repair itself as passing evidence. */
export async function bindCriterionVerification(criterion: AcceptanceCriterion, command: string, cwd: string, signal?: AbortSignal, options: { replacementReason?: string; userPinned?: boolean } = {}): Promise<VerificationCommandInspection> {
  if (criterion.verification && commandsMatch(criterion.verification, command)) return inspectVerificationCommand(command, cwd, signal);
  if (criterion.verification && options.userPinned)
    return { ok: false, reason: 'The user explicitly pinned this verification command. Preserve it; report a concrete dependency if it cannot run.' };
  if (criterion.verification && (await inspectVerificationCommand(criterion.verification, cwd, signal)).ok && !options.replacementReason?.trim())
    return { ok: false, reason: 'Explain why the existing check is unsuitable using replacementReason. The requirement and evidence type must remain unchanged.' };
  if (isTrivialEvidenceCommand(command) || isManufacturedEvidenceCommand(command) || /^(?:node|npm|python3?|py|git)(?:\.exe)?\s+(?:--version|-v|--help|-h)\s*$/i.test(command.trim()))
    return { ok: false, reason: 'Bind a falsifiable verification command, not a trivial or manufactured check.' };
  const requiredKind = evidenceKindForType(criterion.evidenceType ?? 'any');
  if (requiredKind && classifyEvidenceKind(command) !== requiredKind)
    return { ok: false, reason: `Replacement must preserve the required evidence type (${criterion.evidenceType}).` };
  const inspected = await inspectVerificationCommand(command, cwd, signal);
  if (!inspected.ok) return inspected;
  if (criterion.verification) {
    criterion.verificationInstructions ??= criterion.verification;
    (criterion.verificationHistory ??= []).push({ command: criterion.verification, reason: options.replacementReason?.trim() || 'Original verification is unavailable or not executable.' });
  }
  criterion.verification = command.trim();
  criterion.evidenceIds = [];
  criterion.satisfied = false;
  return { ok: true, reason: 'Executable verification bound. The requirement is unchanged and still needs real passing evidence.' };
}
