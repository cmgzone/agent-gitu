import type { RiskTier } from '../types.js';

export interface PolicyDecision {
  tier: RiskTier;
  allowed: boolean;
  requiresApproval: boolean;
  reason: string;
}

const DANGEROUS_COMMAND_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /\brm\s+(?:-[a-z]*r[a-z]*\s+|--recursive\b)/i, why: 'recursive delete' },
  { re: /\b(del|erase|rmdir)\b\s+\/[sqf]/i, why: 'windows bulk delete' },
  { re: /\bremove-item\b[^\n]*-(?:recurse|r)\b/i, why: 'windows recursive delete' },
  { re: /\bgit\s+push\s+([^\n]*)(--force\b|-f\b|--force-with-lease|\s\+\S+)/i, why: 'force push' },
  { re: /\bgit\s+reset\s+--hard\s+origin/i, why: 'hard reset to remote' },
  { re: /\b(sudo|doas|runas)\b/i, why: 'privilege escalation' },
  { re: /\bnpm\s+(publish|unpublish)\b/i, why: 'package publish' },
  { re: /\byarn\s+publish\b|\bpnpm\s+publish\b/i, why: 'package publish' },
  { re: /\bdrop\s+(database|table|schema)\b/i, why: 'destructive sql' },
  { re: /\btruncate\s+table\b/i, why: 'destructive sql' },
  { re: /\b(mkfs|format|diskpart|fdisk)\b/i, why: 'disk operation' },
  { re: /\b(shutdown|reboot|halt|poweroff)\b/i, why: 'system power control' },
  { re: /\b(curl|wget)\b[^\n]*\|\s*(ba|z|pw)?sh\b/i, why: 'pipe remote script to shell' },
  { re: /\biwr\b[^\n]*-usebasicparsing[^\n]*\|\s*iex/i, why: 'pipe remote script to shell' },
  { re: /\biex\b[^\n]*(downloadstring|invoke-expression[^\n]*download)/i, why: 'remote code execution' },
  { re: /\bpowershell(?:\.exe)?\s+(?:-[a-z]*enc(?:odedcommand)?\b|-e\s+)/i, why: 'encoded powershell payload' },
  { re: /\bset-executionpolicy\b/i, why: 'powershell security policy change' },
  { re: /\bchmod\s+(?:-[a-z]+\s+)*777\b/i, why: 'world-writable permissions' },
  { re: /--no-verify\b/i, why: 'skips git hooks/verification' },
  { re: /\bgit\s+clean\s+-[a-z]*f/i, why: 'git clean destroys untracked work' },
  { re: /\bdeploy\b\s+(prod|production)\b/i, why: 'production deployment' },
  { re: /\bkubectl\s+delete\b/i, why: 'cluster resource deletion' },
  { re: /\bterraform\s+(destroy|apply)\b/i, why: 'infrastructure mutation' },
];

const MODERATE_COMMAND_PATTERNS: { re: RegExp; why: string }[] = [
  { re: /\bgit\s+(commit|checkout\s+-b|switch\s+-c|branch|add|stash|merge|rebase|tag)\b/i, why: 'git mutation' },
  { re: /\b(npm|pnpm|yarn)\s+(install|add|remove|i|ci)\b/i, why: 'dependency mutation' },
  { re: /\bpip(install)?\s+install\b/i, why: 'dependency mutation' },
  { re: /\bcargo\s+(add|build|run)\b/i, why: 'build/run mutation' },
  { re: /\b(npm|pnpm|yarn)\s+run\s+(?!(test|lint|typecheck|type-check|tsc|build)\b)[\w:.-]+/i, why: 'script execution' },
  { re: /\b(node|tsx|ts-node|python3?|deno|bun)\b/i, why: 'runtime execution' },
  { re: /\b(make|cmake|go\s+build|gradle|mvn)\b/i, why: 'build execution' },
  { re: /\bmkdir\b/i, why: 'filesystem mutation' },
];

const SAFE_COMMAND_RE =
  /^(git\s+(status|log|diff|show|branch(\s+-a|\s+--list)?|remote\s+-v|rev-parse|ls-files)|ls|dir|cat|type|echo|pwd|node\s+--version|npm\s+(run\s+(test|lint|typecheck|build)|test|ls)|npx\s+tsc|pytest|cargo\s+test|go\s+test)\b/i;

const COMPOUND_COMMAND_RE = /&&|\|\||[;|`]|\$\(|\r?\n/;

export function classifyCommand(command: string): { tier: RiskTier; why: string } {
  for (const { re, why } of DANGEROUS_COMMAND_PATTERNS) {
    if (re.test(command)) return { tier: 'dangerous', why };
  }
  for (const { re, why } of MODERATE_COMMAND_PATTERNS) {
    if (re.test(command)) return { tier: 'moderate', why };
  }
  if (!COMPOUND_COMMAND_RE.test(command) && SAFE_COMMAND_RE.test(command.trim())) {
    return { tier: 'safe', why: 'read-only/verification command' };
  }
  return { tier: 'dangerous', why: 'unrecognized command (fail closed)' };
}

export type ApprovalHandler = (request: {
  tool: string;
  tier: RiskTier;
  why: string;
  summary: string;
}) => Promise<boolean> | boolean;

export class PolicyEngine {
  constructor(
    private readonly autoApprove: boolean = false,
    private readonly approvalHandler?: ApprovalHandler,
  ) {}

  async evaluate(tool: string, params: Record<string, unknown>): Promise<PolicyDecision> {
    let tier: RiskTier;
    let why: string;

    switch (tool) {
      case 'read_file':
      case 'list_files':
      case 'search_files':
      case 'web_fetch':
      case 'browse':
      case 'list_skills':
      case 'use_skill':
        tier = 'safe';
        why = 'read-only';
        break;
      case 'write_file':
      case 'apply_edit':
      case 'create_skill':
        tier = 'moderate';
        why = 'file mutation';
        break;
      case 'run_command': {
        const cls = classifyCommand(String(params['command'] ?? ''));
        tier = cls.tier;
        why = cls.why;
        break;
      }
      default:
        if (tool.startsWith('mcp:')) {
          tier = 'dangerous';
          why = 'external MCP tool (requires approval)';
          break;
        }
        tier = 'dangerous';
        why = 'unknown tool (fail closed)';
    }

    if (tier === 'safe') {
      return { tier, allowed: true, requiresApproval: false, reason: why };
    }
    if (tier === 'moderate') {
      return { tier, allowed: true, requiresApproval: false, reason: `${why} (logged)` };
    }

    if (this.autoApprove) {
      return { tier, allowed: true, requiresApproval: false, reason: `${why} (auto-approved)` };
    }
    if (this.approvalHandler) {
      const approved = await this.approvalHandler({
        tool,
        tier,
        why,
        summary: JSON.stringify(params).slice(0, 300),
      });
      return {
        tier,
        allowed: approved,
        requiresApproval: true,
        reason: approved ? `${why} (approved)` : `${why} (denied by user)`,
      };
    }
    return { tier, allowed: false, requiresApproval: true, reason: `${why} (no approval channel available)` };
  }
}
