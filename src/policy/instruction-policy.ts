import type { UserInstruction } from '../types.js';

export interface InstructionEvaluationResult {
  allowed: boolean;
  reason?: string;
  violatedInstruction?: UserInstruction;
}

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
          const pkgPatterns = [
            /\bnpm\s+(?:install|i|add)\b/i,
            /\bpnpm\s+(?:install|i|add)\b/i,
            /\byarn\s+add\b/i,
            /\bbun\s+add\b/i,
            /\bpip\s+install\b/i,
            /\bcargo\s+add\b/i,
          ];
          if (pkgPatterns.some((pattern) => pattern.test(cmd))) {
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
          const deletePatterns = [
            /\brm\s+-[rf]+\b/i,
            /\brm\s+[^\n]+$/i,
            /\bunlink\s+/i,
            /\bdel\s+/i,
            /\brimraf\s+/i,
          ];
          if (deletePatterns.some((pattern) => pattern.test(cmd))) {
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
        const normalizedTarget = targetPath.replace(/\\/g, '/').toLowerCase();

        // Check "only edit <paths>" or "only modify <paths>"
        const onlyMatch = /^(?:only edit|only modify|restricted to|limit edits to)\s+(.+)$/i.exec(text);
        if (onlyMatch) {
          const allowedRaw = onlyMatch[1]!;
          // Split by comma, 'and', or whitespace
          const allowedItems = allowedRaw
            .split(/,|\band\b/)
            .map((s) => s.trim().replace(/['"`]/g, '').replace(/\\/g, '/').toLowerCase())
            .filter(Boolean);

          const matchesAllowed = allowedItems.some((allowed) => {
            return (
              normalizedTarget === allowed ||
              normalizedTarget.endsWith('/' + allowed) ||
              normalizedTarget.includes(allowed) ||
              allowed.includes(normalizedTarget)
            );
          });

          if (!matchesAllowed) {
            return {
              allowed: false,
              reason: `USER INSTRUCTION VIOLATION: Hard user instruction "${inst.text}" restricts edits to [${allowedItems.join(', ')}]. Attempted to edit "${targetPath}".`,
              violatedInstruction: inst,
            };
          }
        }

        // Check "don't modify <path>", "do not edit <path>", "don't touch <path>"
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
            matchesForbidden =
              normalizedTarget === forbiddenTarget ||
              normalizedTarget.endsWith('/' + forbiddenTarget) ||
              normalizedTarget.includes(forbiddenTarget);
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
