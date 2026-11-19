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
  { re: /\b(mkfs(?:\.\w+)?|diskpart|fdisk)\b|\bformat(?:\.com|\.exe)?\s+(?:[a-z]:|\/[a-z])/i, why: 'disk operation' },
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
  { re: /\bgit\s+(commit|push|pull|fetch|add|restore|checkout|switch|branch|stash|merge|rebase|tag)\b/i, why: 'git mutation' },
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

// Anything that chains or redirects commands must never be auto-approved as
// "safe": redirection (`cat id_rsa > leak.txt`) and single-`&` background
// separators otherwise bypass classification entirely.
const COMPOUND_COMMAND_RE = /&&|\|\||[;|`]|\$\(|\r?\n|>{1,2}|<{1,2}|(?:^|\s)&(?=\s|$)/;

const POWERSHELL_READ_RE = /^(?:get-(?:childitem|content|location|command|item|date)|test-path|select-object|format-(?:table|list)|measure-object|write-(?:host|output))\b/i;

export function classifyCommand(command: string): { tier: RiskTier; why: string } {
  for (const { re, why } of DANGEROUS_COMMAND_PATTERNS) {
    if (re.test(command)) return { tier: 'dangerous', why };
  }
  // Recognize common Windows inspection pipelines. Reject script blocks,
  // substitutions, redirections and invocation operators before splitting.
  if (
    !/[`$(){}<>]|&&|\|\||(?:^|\s)&/.test(command) &&
    command
      .split(/[;|\r\n]+/)
      .filter((s) => s.trim())
      .every((s) => POWERSHELL_READ_RE.test(s.trim())) &&
    command.trim()
  ) {
    return { tier: 'safe', why: 'PowerShell read-only inspection' };
  }
  for (const { re, why } of MODERATE_COMMAND_PATTERNS) {
    if (re.test(command)) return { tier: 'moderate', why };
  }
  if (!COMPOUND_COMMAND_RE.test(command) && SAFE_COMMAND_RE.test(command.trim())) {
    return { tier: 'safe', why: 'read-only/verification command' };
  }
  return { tier: 'dangerous', why: 'unrecognized command (fail closed)' };
}

export type ApprovalHandler = (request: { tool: string; tier: RiskTier; why: string; summary: string }) => Promise<boolean> | boolean;

/**
 * `true` is the historical snapshot; a supplier is re-evaluated per action so
 * the owner's live Full Access choice applies to the command being executed
 * rather than the one that was queued when the run started.
 */
export type AutoApproveAuthority = boolean | (() => boolean);

function humanizeIdentifier(raw: string): string {
  return raw
    .replace(/^mcp:/i, '')
    .replace(/^capability:/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[:./_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeCommandSteps(command: string): string[] {
  const segments = command
    .split(/(?:&&|\|\||[;|\r\n]+)/)
    .map((s) => s.trim())
    .filter(Boolean);
  const steps: string[] = [];
  for (const segment of segments) {
    const tokens = segment.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
    let i = 0;
    while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i]!)) i += 1;
    while (i < tokens.length && /^(?:env|sudo|doas|npx|pnpx|bunx|cmd|powershell(?:\.exe)?|pwsh(?:\.exe)?)$/i.test(tokens[i]!)) {
      i += 1;
      while (i < tokens.length && /^[-/][A-Za-z0-9-]+$/.test(tokens[i]!)) i += 1;
    }
    const rawBin = tokens[i]?.replace(/^['"]|['"]$/g, '') ?? '';
    const bin = rawBin.split(/[\\/]/).pop()?.replace(/\.(?:exe|cmd|bat|ps1|sh)$/i, '') ?? '';
    if (!bin) continue;
    if (/^cd$/i.test(bin) && segments.length > 1) continue;
    const next = tokens[i + 1]?.replace(/^['"]|['"]$/g, '') ?? '';
    const sub = next && !next.startsWith('-') && /^[A-Za-z][A-Za-z0-9:_-]{0,24}$/.test(next) ? next : '';
    const label = sub ? `${bin} ${sub}` : bin;
    if (!steps.includes(label)) steps.push(label);
    if (steps.length >= 3) break;
  }
  return steps;
}

function buildDynamicApprovalWhy(
  tool: string,
  params: Record<string, unknown>,
  policyWhy: string,
  agentReason?: string,
): string {
  const cleanReason = typeof agentReason === 'string' ? agentReason.replace(/\s+/g, ' ').trim().slice(0, 220) : '';
  const isGenericFallback = /^unrecognized command\b|^unknown tool\b/i.test(policyWhy);
  if (cleanReason) {
    return isGenericFallback ? cleanReason : `${cleanReason} (${policyWhy})`;
  }
  if (!isGenericFallback) return policyWhy;
  if (tool === 'run_command') {
    const command = String(params['command'] ?? '').trim();
    const steps = summarizeCommandSteps(command);
    if (steps.length > 1) return `Run multi-step command (${steps.join(', ')})`;
    if (steps.length === 1) return `Run ${steps[0]} in the project`;
    return 'Run a shell command in the project';
  }
  if (tool.startsWith('mcp:')) {
    const [, server, ...rest] = tool.split(':');
    const actionName = humanizeIdentifier(rest.join(':')) || 'tool';
    return server ? `Run ${actionName} via ${humanizeIdentifier(server)}` : `Run ${actionName}`;
  }
  const readable = humanizeIdentifier(tool);
  return readable ? `Run ${readable}` : 'Run the requested tool';
}

export class PolicyEngine {
  constructor(
    private readonly autoApprove: AutoApproveAuthority = false,
    private readonly approvalHandler?: ApprovalHandler,
    /** Safe mode: dangerous-tier commands are NEVER auto-approved, even with
     *  autoApprove — the unattended-but-cautious middle ground. */
    private readonly safeMode: boolean = false,
  ) {}

  /** A failing authority never auto-approves. */
  private autoApproveEnabled(): boolean {
    if (typeof this.autoApprove !== 'function') return this.autoApprove;
    try {
      return this.autoApprove();
    } catch {
      return false;
    }
  }

  /** External reads require an explicit, scoped decision even in auto-approve mode. */
  async approveDiagnosticRead(tool: string, target: string, directory: boolean, reason?: string): Promise<boolean> {
    if (!this.approvalHandler) return false;
    const scopeNote = `Read diagnostic ${directory ? 'files in this folder and its subfolders' : 'file'} outside the project. This grants no write access.`;
    const cleanReason = typeof reason === 'string' ? reason.replace(/\s+/g, ' ').trim().slice(0, 180) : '';
    return this.approvalHandler({
      tool,
      tier: 'moderate',
      why: cleanReason ? `${cleanReason} — ${scopeNote}` : scopeNote,
      summary: target,
    });
  }

  /** External writes also require an explicit, path-scoped decision: the
   *  alternative to turning on Full Access is asking about the exact target. */
  async approveExternalWrite(tool: string, target: string, directory: boolean, reason?: string): Promise<boolean> {
    if (!this.approvalHandler) return false;
    const scopeNote = `Write ${directory ? 'files in this folder and its subfolders' : 'this file'} outside the locked project. Approval covers this path for the rest of this task; Agent Gitu state, credentials and Git internals stay protected.`;
    const cleanReason = typeof reason === 'string' ? reason.replace(/\s+/g, ' ').trim().slice(0, 180) : '';
    return this.approvalHandler({
      tool,
      tier: 'moderate',
      why: cleanReason ? `${cleanReason} — ${scopeNote}` : scopeNote,
      summary: target,
    });
  }

  async evaluate(tool: string, params: Record<string, unknown>, context?: { reason?: string }): Promise<PolicyDecision> {
    let tier: RiskTier;
    let why: string;

    switch (tool) {
      case 'read_file':
      case 'list_files':
      case 'search_files':
      case 'web_search':
      case 'web_fetch':
      case 'browse':
      case 'browser':
      case 'agent_status':
      case 'list_skills':
      case 'list_mcp':
      case 'list_connections':
      case 'connection_read':
      case 'inspect_connection_response':
      case 'use_skill':
      case 'lsp_diagnostics':
      case 'lsp_definition':
      case 'lsp_references':
      case 'lsp_hover':
      case 'lsp_symbols':
        tier = 'safe';
        why = 'read-only';
        break;
      case 'write_file':
      case 'create_document':
      case 'schedule_manage':
      case 'apply_edit':
      case 'create_skill':
      case 'update_skill':
      case 'update_connection':
      case 'delegate':
      case 'memory':
        // memory reads are visibility-filtered and writes are store-guarded
        // (promotion requires evidence); no workspace/filesystem effect.
        tier = 'moderate';
        why = tool === 'memory' ? 'memory state change' : 'workspace or agent state change';
        break;
      case 'configure_mcp':
        tier = 'dangerous';
        why = 'MCP server executable configuration';
        break;
      case 'run_command': {
        if (params['action'] === 'status') {
          tier = 'safe';
          why = 'read managed command status';
          break;
        }
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

    if (this.autoApproveEnabled() && !(this.safeMode && tier === 'dangerous')) {
      return { tier, allowed: true, requiresApproval: false, reason: `${why} (auto-approved)` };
    }
    if (this.approvalHandler) {
      const approvalWhy = buildDynamicApprovalWhy(tool, params, why, context?.reason);
      const approved = await this.approvalHandler({
        tool,
        tier,
        why: approvalWhy,
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
