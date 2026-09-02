import type { InstructionConstraint, UserInstruction } from '../types.js';

export interface InstructionEvaluationResult {
  allowed: boolean;
  reason?: string;
  violatedInstruction?: UserInstruction;
}

const PKG_INSTALL_PATTERNS = [
  /\bnpm\s+(?:install|i|add)\b/i,
  /\bpnpm\s+(?:install|i|add)\b/i,
  /\byarn\s+add\b/i,
  /\bbun\s+add\b/i,
  /\bpip\s+install\b/i,
  /\bcargo\s+add\b/i,
];

const FILE_DELETE_PATTERNS = [
  /\brm\s+-[rf]+\b/i,
  /\brm\s+[^\n]+$/i,
  /\bunlink\s+/i,
  /\bdel\s+/i,
  /\brimraf\s+/i,
];

function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase();
}

/** A target path matches a scope entry when it is the entry, lives under it,
 *  or the entry names the target's basename (users say "llm.ts", not the
 *  full path). */
function pathMatchesScope(normalizedTarget: string, scopeEntry: string): boolean {
  const entry = normalizePath(scopeEntry);
  return (
    normalizedTarget === entry ||
    normalizedTarget.endsWith('/' + entry) ||
    normalizedTarget.includes(entry) ||
    entry.includes(normalizedTarget)
  );
}

function evaluateStructured(
  constraint: InstructionConstraint,
  inst: UserInstruction,
  tool: string,
  params: Record<string, unknown>,
): InstructionEvaluationResult {
  if (constraint.enabled === false) return { allowed: true };
  const deny = (why: string): InstructionEvaluationResult => ({
    allowed: false,
    reason: `USER INSTRUCTION VIOLATION: hard user instruction "${inst.text}" ${why}.`,
    violatedInstruction: inst,
  });

  switch (constraint.kind) {
    case 'file_scope': {
      if (tool !== 'write_file' && tool !== 'apply_edit') return { allowed: true };
      const target = normalizePath(String(params['path'] ?? ''));
      const allowed = constraint.allow ?? [];
      if (allowed.some((entry) => pathMatchesScope(target, entry))) return { allowed: true };
      return deny(`restricts edits to [${allowed.join(', ')}]. Attempted to edit "${params['path']}"`);
    }
    case 'deny_paths': {
      if (tool !== 'write_file' && tool !== 'apply_edit') return { allowed: true };
      const target = normalizePath(String(params['path'] ?? ''));
      const denied = constraint.deny ?? [];
      if (denied.some((entry) => entry && pathMatchesScope(target, entry))) {
        return deny(`prohibits modifying "${params['path']}"`);
      }
      return { allowed: true };
    }
    case 'delegate': {
      if (tool === 'delegate' || tool === 'delegate_background') return deny('prohibits specialist delegation');
      return { allowed: true };
    }
    case 'network': {
      if (tool === 'web_fetch' || tool === 'browse') return deny('prohibits external web operations');
      return { allowed: true };
    }
    case 'package_install': {
      if (tool !== 'run_command') return { allowed: true };
      const cmd = String(params['command'] ?? '');
      if (PKG_INSTALL_PATTERNS.some((p) => p.test(cmd))) return deny('prohibits installing packages');
      return { allowed: true };
    }
    case 'file_delete': {
      if (tool !== 'run_command') return { allowed: true };
      const cmd = String(params['command'] ?? '');
      if (FILE_DELETE_PATTERNS.some((p) => p.test(cmd))) return deny('prohibits file deletion');
      return { allowed: true };
    }
    case 'command': {
      if (tool !== 'run_command') return { allowed: true };
      const cmd = String(params['command'] ?? '').trim();
      const prefix = constraint.command?.trim();
      if (prefix && cmd.toLowerCase().startsWith(prefix.toLowerCase())) return deny(`forbids running "${cmd}"`);
      return { allowed: true };
    }
    default:
      // Unknown structured kind: fail CONSERVATIVELY — block the tools the
      // constraint plausibly governs rather than silently allowing.
      if (tool === 'write_file' || tool === 'apply_edit' || tool === 'run_command' || tool === 'delegate') {
        return deny('uses an unrecognized constraint form; failing closed until it is clarified');
      }
      return { allowed: true };
  }
}

/**
 * Deterministic enforcement of hard user instructions. Structured constraints
 * (parsed once at admission time) are authoritative; the legacy natural-language
 * patterns apply only to instructions that never resolved to a structured form
 * (e.g. hand-authored ledger constraints).
 */
export class InstructionPolicyEngine {
  evaluate(
    tool: string,
    params: Record<string, unknown>,
    hardInstructions: UserInstruction[],
  ): InstructionEvaluationResult {
    if (!hardInstructions || hardInstructions.length === 0) {
      return { allowed: true };
    }

    for (const inst of hardInstructions) {
      if (inst.status !== 'active' || inst.enforcement !== 'hard') {
        continue;
      }

      if (inst.constraint) {
        const verdict = evaluateStructured(inst.constraint, inst, tool, params);
        if (!verdict.allowed) return verdict;
        continue;
      }

      // Legacy natural-language fallback for unstructured instructions.
      const text = inst.text.trim();
      const lower = text.toLowerCase();

      // 1. Delegation / Specialist prohibition
      if (
        lower.includes("don't use specialist") ||
        lower.includes('do not use specialist') ||
        lower.includes('no specialist') ||
        lower.includes("don't delegate") ||
        lower.includes('do not delegate') ||
        lower.includes('no subagent') ||
        lower.includes("don't use subagent")
      ) {
        if (tool === 'delegate' || tool === 'delegate_background') {
          return {
            allowed: false,
            reason: `USER INSTRUCTION VIOLATION: Hard user instruction "${inst.text}" prohibits specialist delegation.`,
            violatedInstruction: inst,
          };
        }
      }

      // 2. Web browsing / External fetch prohibition
      if (
        lower.includes("don't browse") ||
        lower.includes('do not browse') ||
        lower.includes('no web search') ||
        lower.includes('no web browsing') ||
        lower.includes("don't fetch url") ||
        lower.includes("don't use web_fetch") ||
        lower.includes('no external requests')
      ) {
        if (tool === 'web_fetch' || tool === 'browse') {
          return {
            allowed: false,
            reason: `USER INSTRUCTION VIOLATION: Hard user instruction "${inst.text}" prohibits external web operations.`,
            violatedInstruction: inst,
          };
        }
      }

      // 3. Package installation prohibition
      if (
        lower.includes('do not install') ||
        lower.includes("don't install") ||
        lower.includes('no npm install') ||
        lower.includes('no package install') ||
        lower.includes('do not add dependencies') ||
        lower.includes("don't add dependencies")
      ) {
        if (tool === 'run_command') {
          const cmd = String(params['command'] ?? '').trim();
          if (PKG_INSTALL_PATTERNS.some((pattern) => pattern.test(cmd))) {
            return {
              allowed: false,
              reason: `USER INSTRUCTION VIOLATION: Hard user instruction "${inst.text}" prohibits installing packages. Attempted command: "${cmd}".`,
              violatedInstruction: inst,
            };
          }
        }
      }

      // 4. File deletion prohibition
      if (
        lower.includes("don't delete") ||
        lower.includes('do not delete') ||
        lower.includes('no file deletion') ||
        lower.includes("don't remove file") ||
        lower.includes('do not remove file')
      ) {
        if (tool === 'run_command') {
          const cmd = String(params['command'] ?? '').trim();
          if (FILE_DELETE_PATTERNS.some((pattern) => pattern.test(cmd))) {
            return {
              allowed: false,
              reason: `USER INSTRUCTION VIOLATION: Hard user instruction "${inst.text}" prohibits file deletion. Attempted command: "${cmd}".`,
              violatedInstruction: inst,
            };
          }
        }
      }

      // 5. File modification constraints ("only edit ...", "don't modify ...", "don't change ...")
      if (tool === 'write_file' || tool === 'apply_edit') {
        const targetPath = String(params['path'] ?? '').trim();
        const normalizedTarget = normalizePath(targetPath);

        const onlyMatch = /^(?:only edit|only modify|restricted to|limit edits to)\s+(.+)$/i.exec(text);
        if (onlyMatch) {
          const allowedRaw = onlyMatch[1]!;
          const allowedItems = allowedRaw
            .split(/,|\band\b/)
            .map((s) => s.trim().replace(/['"`]/g, '').replace(/\\/g, '/').toLowerCase())
            .filter(Boolean);

          const matchesAllowed = allowedItems.some((allowed) => pathMatchesScope(normalizedTarget, allowed));
          if (!matchesAllowed) {
            return {
              allowed: false,
              reason: `USER INSTRUCTION VIOLATION: Hard user instruction "${inst.text}" restricts edits to [${allowedItems.join(', ')}]. Attempted to edit "${targetPath}".`,
              violatedInstruction: inst,
            };
          }
        }

        const forbidMatch = /(?:don't modify|do not modify|don't edit|do not edit|don't touch|do not touch|do not change|don't change)\s+([^\n.,;]+)/i.exec(text);
        if (forbidMatch) {
          const forbiddenTarget = forbidMatch[1]!.trim().replace(/['"`]/g, '').replace(/\\/g, '/').toLowerCase();

          let matchesForbidden = false;
          if (forbiddenTarget === 'backend' || forbiddenTarget.includes('backend')) {
            matchesForbidden =
              normalizedTarget.includes('backend/') ||
              normalizedTarget.includes('server/') ||
              normalizedTarget.endsWith('server.ts') ||
              normalizedTarget.endsWith('server.js') ||
              normalizedTarget.includes('/api/');
          } else if (forbiddenTarget === 'database' || forbiddenTarget === 'db' || forbiddenTarget.includes('database')) {
            matchesForbidden =
              normalizedTarget.includes('db/') ||
              normalizedTarget.includes('database/') ||
              normalizedTarget.includes('migrations/') ||
              normalizedTarget.includes('prisma/') ||
              normalizedTarget.includes('schema.prisma') ||
              normalizedTarget.endsWith('.sql');
          } else {
            matchesForbidden = pathMatchesScope(normalizedTarget, forbiddenTarget);
          }

          if (matchesForbidden) {
            return {
              allowed: false,
              reason: `USER INSTRUCTION VIOLATION: Hard user instruction "${inst.text}" prohibits modifying "${targetPath}".`,
              violatedInstruction: inst,
            };
          }
        }
      }
    }

    return { allowed: true };
  }
}
