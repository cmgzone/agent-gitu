import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { TaskLedger } from '../ledger/task-ledger.js';
import {
  RecoveryRisk,
  type Capability,
  type MissingPrerequisite,
  type PrerequisiteKind,
  type PrerequisiteRecoveryStatus,
} from '../types.js';
import { sha256 } from '../util.js';

/**
 * A connected provider is deliberately provider-neutral. A Coolify adapter,
 * cloud account, vault, or internal platform can implement this small seam
 * without gaining direct control of the agent's workspace or policy engine.
 */
export interface PrerequisiteProvider {
  id: string;
  capabilities: Capability[];
  /** Read-only discovery: find a reusable connection/resource/configuration. */
  discover?(input: ProviderRecoveryInput): Promise<ProviderRecoveryResult>;
  /** Optional creation/provisioning. This is never called until policy allows it. */
  provision?(input: ProviderRecoveryInput): Promise<ProviderRecoveryResult>;
  /** Verify a newly provisioned resource before claiming it usable. */
  healthCheck?(input: ProviderRecoveryInput, result: ProviderRecoveryResult): Promise<boolean>;
  /** Best-effort rollback for an unhealthy newly created resource. */
  rollback?(input: ProviderRecoveryInput, result: ProviderRecoveryResult): Promise<void>;
  /** Provisioning defaults to COSTLY unless the adapter explicitly declares otherwise. */
  provisionRisk?: RecoveryRisk;
}

export interface ProviderRecoveryInput {
  prerequisite: MissingPrerequisite;
  goal: string;
  repoRoot: string;
}

/** A provider returns references and summaries only, never a secret value. */
export interface ProviderRecoveryResult {
  status: 'resolved' | 'unresolved' | 'needs-user';
  summary: string;
  /** existing-resource is reuse; provisioned-resource is a newly created asset. */
  source?: 'repository-configuration' | 'environment' | 'existing-resource' | 'derived-value' | 'provisioned-resource';
  /** Opaque provider handle; it is not sent to model context or the ledger. */
  reference?: string;
  candidates?: { id: string; label: string }[];
}

export interface RecoveryPolicyOptions {
  /** Cost-bearing actions stay blocked unless the host explicitly opts in. */
  allowCostly?: boolean;
  /** Production-critical actions need an explicit host-level preauthorization. */
  preauthorizeProductionCritical?: boolean;
  /** Specialists are read/discovery-only by default, even if the parent can provision. */
  allowSpecialistProvisioning?: boolean;
}

export class RecoveryPolicy {
  constructor(private readonly options: RecoveryPolicyOptions = {}) {}

  allows(risk: RecoveryRisk, specialist = false): { allowed: boolean; reason: string } {
    if (risk === RecoveryRisk.READ_ONLY) return { allowed: true, reason: 'read-only discovery is automatic' };
    if (specialist && !this.options.allowSpecialistProvisioning) {
      return { allowed: false, reason: 'specialists cannot provision infrastructure without explicit parent policy' };
    }
    if (risk === RecoveryRisk.REVERSIBLE) return { allowed: true, reason: 'clearly required reversible recovery is allowed' };
    if (risk === RecoveryRisk.COSTLY) {
      return this.options.allowCostly
        ? { allowed: true, reason: 'costly recovery is within the configured budget' }
        : { allowed: false, reason: 'costly recovery is not pre-authorized' };
    }
    if (risk === RecoveryRisk.PRODUCTION_CRITICAL) {
      return this.options.preauthorizeProductionCritical
        ? { allowed: true, reason: 'production-critical recovery is explicitly pre-authorized' }
        : { allowed: false, reason: 'production-critical recovery requires confirmation' };
    }
    return { allowed: false, reason: 'destructive recovery requires confirmation' };
  }
}

export interface RecoveryContext {
  repoRoot: string;
  goal: string;
  ledger: TaskLedger;
  providers: PrerequisiteProvider[];
  capabilities: Capability[];
  policy: RecoveryPolicy;
  specialist?: boolean;
}

export interface RecoveryStrategy {
  id: string;
  canHandle(prerequisite: MissingPrerequisite, context: RecoveryContext): boolean;
  resolve(prerequisite: MissingPrerequisite, context: RecoveryContext): Promise<RecoveryStrategyResult>;
}

export interface RecoveryStrategyResult {
  status: 'resolved' | 'unresolved' | 'needs-user';
  summary: string;
  source?: ProviderRecoveryResult['source'];
  provider?: string;
  risk?: RecoveryRisk;
  candidates?: { id: string; label: string }[];
}

export interface PrerequisiteRecoveryOptions extends RecoveryPolicyOptions {
  providers?: PrerequisiteProvider[];
  strategies?: RecoveryStrategy[];
  /** Hard cap across a prerequisite's durable history. Default: six strategies. */
  maxAttempts?: number;
}

export interface RecoveryAttempt {
  strategy: string;
  status: PrerequisiteRecoveryStatus;
  outcome: string;
  provider?: string;
  risk: RecoveryRisk;
}

export interface PrerequisiteResolution {
  status: 'resolved' | 'needs-user' | 'exhausted';
  prerequisite: MissingPrerequisite;
  attempts: RecoveryAttempt[];
  message: string;
  question?: { question: string; header: string; options: string[] };
}

const SKIP_DIRECTORIES = new Set(['.git', '.hermes', 'node_modules', 'dist', 'release', 'coverage']);
const CONFIG_FILE_RE = /^(\.env(?:\..+)?|docker-compose(?:\..+)?\.ya?ml|compose(?:\..+)?\.ya?ml|.+\.(?:json|ya?ml|toml|ini|env|properties))$/i;

/** Provider adapter text is untrusted: never let a connection value enter the ledger or model context. */
function safeSummary(value: string): string {
  return String(value)
    .replace(/\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqps?|https?):\/\/[^\s,;]+/gi, '<redacted-url>')
    .replace(/\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|URL))\s*=\s*[^\s,;]+/g, '$1=<redacted>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

function candidateKeys(prerequisite: MissingPrerequisite): string[] {
  const hints = prerequisite.hints ?? [];
  const implicit = prerequisite.kind === 'connection' ? ['DATABASE_URL'] : prerequisite.kind === 'credential' ? ['API_KEY', 'TOKEN'] : [];
  return [...new Set([...hints, ...implicit].map((hint) => hint.trim().toUpperCase()).filter((hint) => /^[A-Z][A-Z0-9_]{1,96}$/.test(hint)))];
}

function boundedConfigFiles(root: string, limit = 80): string[] {
  const files: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > 4 || files.length >= limit) return;
    let entries: ReturnType<typeof readdirSync>;
    try { entries = readdirSync(dir, { withFileTypes: true }) as unknown as ReturnType<typeof readdirSync>; } catch { return; }
    for (const entry of entries as unknown as { name: string; isDirectory(): boolean; isFile(): boolean }[]) {
      if (files.length >= limit) return;
      if (entry.isDirectory()) {
        if (!SKIP_DIRECTORIES.has(entry.name)) walk(path.join(dir, entry.name), depth + 1);
      } else if (entry.isFile() && CONFIG_FILE_RE.test(entry.name)) {
        files.push(path.join(dir, entry.name));
      }
    }
  };
  walk(root, 0);
  return files;
}

function containsConfiguredKey(content: string, key: string): boolean {
  const line = new RegExp(`^\\s*(?:export\\s+)?${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:=]\\s*(?!["']?(?:your_|replace_|changeme|example|<).*$).+`, 'im');
  return line.test(content);
}

class RepoConfigDiscoveryStrategy implements RecoveryStrategy {
  readonly id = 'repo-config-discovery';
  canHandle(): boolean { return true; }

  async resolve(prerequisite: MissingPrerequisite, context: RecoveryContext): Promise<RecoveryStrategyResult> {
    const keys = candidateKeys(prerequisite);
    if (keys.length === 0) return { status: 'unresolved', summary: 'No safe configuration key hint was available for repository discovery.', risk: RecoveryRisk.READ_ONLY };
    for (const file of boundedConfigFiles(context.repoRoot)) {
      try {
        if (!existsSync(file) || readFileSync(file).byteLength > 256 * 1024) continue;
        const text = readFileSync(file, 'utf8');
        const key = keys.find((candidate) => containsConfiguredKey(text, candidate));
        if (key) return {
          status: 'resolved',
          source: 'repository-configuration',
          summary: `Found configured ${key} in ${path.relative(context.repoRoot, file)}; its value remains withheld.`,
          risk: RecoveryRisk.READ_ONLY,
        };
      } catch { /* unreadable configuration is not a recovery failure */ }
    }
    return { status: 'unresolved', summary: `No configured ${keys.join(' or ')} was found in the bounded repository configuration scan.`, risk: RecoveryRisk.READ_ONLY };
  }
}

class EnvironmentDiscoveryStrategy implements RecoveryStrategy {
  readonly id = 'environment-discovery';
  canHandle(): boolean { return true; }

  async resolve(prerequisite: MissingPrerequisite): Promise<RecoveryStrategyResult> {
    const key = candidateKeys(prerequisite).find((candidate) => Boolean(process.env[candidate]?.trim()));
    return key
      ? { status: 'resolved', source: 'environment', summary: `Found ${key} in the runtime environment; its value remains withheld.`, risk: RecoveryRisk.READ_ONLY }
      : { status: 'unresolved', summary: 'No hinted prerequisite is available in the runtime environment.', risk: RecoveryRisk.READ_ONLY };
  }
}

class ConnectedServiceDiscoveryStrategy implements RecoveryStrategy {
  readonly id = 'connected-service-discovery';
  canHandle(_prerequisite: MissingPrerequisite, context: RecoveryContext): boolean {
    return context.providers.some((provider) => Boolean(provider.discover) && provider.capabilities.some((capability) => capability.riskClass === 'read'));
  }

  async resolve(prerequisite: MissingPrerequisite, context: RecoveryContext): Promise<RecoveryStrategyResult> {
    const candidates: { id: string; label: string }[] = [];
    const notes: string[] = [];
    for (const provider of context.providers) {
      if (!provider.discover || !provider.capabilities.some((capability) => capability.riskClass === 'read')) continue;
      try {
        const outcome = await provider.discover({ prerequisite, goal: context.goal, repoRoot: context.repoRoot });
        if (outcome.status === 'resolved') {
          return { status: 'resolved', source: outcome.source ?? 'existing-resource', summary: outcome.summary, provider: provider.id, risk: RecoveryRisk.READ_ONLY };
        }
        if (outcome.status === 'needs-user') candidates.push(...(outcome.candidates ?? []));
        notes.push(`${provider.id}: ${outcome.summary}`);
      } catch {
        notes.push(`${provider.id}: discovery request failed`);
      }
    }
    if (candidates.length > 0) return { status: 'needs-user', summary: 'Multiple plausible connected-service targets remain.', candidates, risk: RecoveryRisk.READ_ONLY };
    return { status: 'unresolved', summary: notes.join('; ') || 'No connected provider could discover a compatible existing resource.', risk: RecoveryRisk.READ_ONLY };
  }
}

class ResourceProvisioningStrategy implements RecoveryStrategy {
  readonly id = 'resource-provisioning';
  canHandle(_prerequisite: MissingPrerequisite, context: RecoveryContext): boolean {
    return context.providers.some((provider) => Boolean(provider.provision) && provider.capabilities.some((capability) => capability.riskClass === 'reversible-write'));
  }

  async resolve(prerequisite: MissingPrerequisite, context: RecoveryContext): Promise<RecoveryStrategyResult> {
    for (const provider of context.providers) {
      if (!provider.provision || !provider.capabilities.some((capability) => capability.riskClass === 'reversible-write')) continue;
      const risk = provider.provisionRisk ?? RecoveryRisk.COSTLY;
      const policy = context.policy.allows(risk, context.specialist);
      if (!policy.allowed) continue;
      const input = { prerequisite, goal: context.goal, repoRoot: context.repoRoot };
      try {
        const outcome = await provider.provision(input);
        if (outcome.status === 'needs-user') return { status: 'needs-user', summary: outcome.summary, provider: provider.id, candidates: outcome.candidates, risk };
        if (outcome.status !== 'resolved') continue;
        const healthy = outcome.source !== 'provisioned-resource' || !provider.healthCheck || (await provider.healthCheck(input, outcome));
        if (!healthy) {
          if (provider.rollback) {
            try { await provider.rollback(input, outcome); } catch { /* best-effort rollback is recorded by the outcome */ }
          }
          return { status: 'unresolved', summary: `${outcome.summary}; health check failed${provider.rollback ? ' and rollback was requested' : ''}.`, provider: provider.id, risk };
        }
        return { status: 'resolved', source: outcome.source ?? 'provisioned-resource', summary: outcome.summary, provider: provider.id, risk };
      } catch {
        // Try another configured provider rather than treating one adapter outage as user-required input.
      }
    }
    return { status: 'unresolved', summary: 'No authorized provider provisioning path succeeded.', risk: RecoveryRisk.COSTLY };
  }
}

/** Infer a structured prerequisite from legacy free-text request_block reasons. */
export function inferMissingPrerequisite(reason: string, requiredFor = 'continue the task'): MissingPrerequisite | undefined {
  const text = reason.replace(/\s+/g, ' ').trim();
  const lowered = text.toLowerCase();
  let kind: PrerequisiteKind | undefined;
  let description: string | undefined;
  let hints: string[] = [];
  if (/database_url|postgres(?:ql)?|mysql|redis|database connection|connection string/.test(lowered)) {
    kind = 'connection'; description = 'database connection'; hints = ['DATABASE_URL'];
  } else if (/api[ _-]?key|access token|secret|credential|password/.test(lowered)) {
    kind = 'credential'; description = 'credential'; hints = (text.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? []).filter((part) => /KEY|TOKEN|SECRET|PASSWORD/.test(part));
  } else if (/permission|forbidden|not authorized|access denied/.test(lowered)) {
    kind = 'permission'; description = 'required permission';
  } else if (/dependency|module .*not found|package .*missing|not installed/.test(lowered)) {
    kind = 'dependency'; description = 'required dependency';
  } else if (/environment variable|configuration|config .*missing/.test(lowered)) {
    kind = 'configuration'; description = 'required configuration'; hints = text.match(/\b[A-Z][A-Z0-9_]{2,}\b/g) ?? [];
  } else if (/target application|deployment target|environment target/.test(lowered)) {
    kind = 'target'; description = 'deployment target';
  } else if (/service .*unavailable|service .*missing/.test(lowered)) {
    kind = 'service'; description = 'required service';
  }
  if (!kind || !description) return undefined;
  return {
    id: `prereq-${sha256(`${kind}:${description}:${text}`).slice(0, 16)}`,
    kind,
    description,
    requiredFor,
    ...(hints.length > 0 ? { hints: [...new Set(hints)].slice(0, 8) } : {}),
    riskIfWrong: kind === 'credential' || kind === 'permission' ? 'high' : 'medium',
  };
}

export function formatBlockedPrerequisite(resolution: PrerequisiteResolution): string {
  const attempts = resolution.attempts.map((attempt) => `- ${attempt.strategy}: ${attempt.outcome}`).join('\n');
  return `Need: ${resolution.prerequisite.description} for ${resolution.prerequisite.requiredFor}.\nTried:\n${attempts || '- no authorized recovery strategy was available'}\nRemaining ambiguity: ${resolution.message}`;
}

/**
 * Generic, bounded, policy-gated recovery coordinator. It treats BLOCKED as a
 * terminal state: no prerequisite becomes user-required until discovery and
 * authorized recovery options have been tried exactly once.
 */
export class CapabilityAwareResolver {
  private readonly providers: PrerequisiteProvider[];
  private readonly policy: RecoveryPolicy;
  private readonly strategies: RecoveryStrategy[];
  private readonly maxAttempts: number;

  constructor(options: PrerequisiteRecoveryOptions = {}) {
    this.providers = options.providers ?? [];
    this.policy = new RecoveryPolicy(options);
    this.strategies = options.strategies ?? [
      new RepoConfigDiscoveryStrategy(),
      new EnvironmentDiscoveryStrategy(),
      new ConnectedServiceDiscoveryStrategy(),
      new ResourceProvisioningStrategy(),
    ];
    this.maxAttempts = Math.max(1, Math.min(12, options.maxAttempts ?? 6));
  }

  capabilities(): Capability[] {
    return this.providers.flatMap((provider) => provider.capabilities.map((capability) => ({ ...capability, provider: capability.provider || provider.id })));
  }

  async resolve(prerequisite: MissingPrerequisite, input: Omit<RecoveryContext, 'providers' | 'capabilities' | 'policy'> & { retry?: boolean }): Promise<PrerequisiteResolution> {
    const context: RecoveryContext = { ...input, providers: this.providers, capabilities: this.capabilities(), policy: this.policy };
    const historical = context.ledger.data.prerequisiteRecoveries ?? [];
    const previous = historical.filter((record) => record.prerequisiteId === prerequisite.id);
    // A user can add a connection after an earlier pass exhausted discovery.
    // That is the one legitimate reason to revisit bounded strategies.
    const tried = input.retry ? new Set<string>() : new Set(previous.map((record) => record.strategy));
    const attempts: RecoveryAttempt[] = [];
    context.ledger.recordPrerequisiteRecovery({
      prerequisiteId: prerequisite.id,
      prerequisiteKind: prerequisite.kind,
      description: prerequisite.description,
      requiredFor: prerequisite.requiredFor,
      strategy: 'orchestrator',
      status: 'RESOLVING_PREREQUISITE',
      outcome: 'Evaluating repository, environment, connected providers, and authorized provisioning.',
      risk: RecoveryRisk.READ_ONLY,
    });

    for (const strategy of this.strategies) {
      if (attempts.length >= this.maxAttempts || tried.has(strategy.id) || !strategy.canHandle(prerequisite, context)) continue;
      let result: RecoveryStrategyResult;
      try { result = await strategy.resolve(prerequisite, context); } catch { result = { status: 'unresolved', summary: `${strategy.id} failed safely.`, risk: RecoveryRisk.READ_ONLY }; }
      result = { ...result, summary: safeSummary(result.summary) };
      const risk = result.risk ?? RecoveryRisk.READ_ONLY;
      const status: PrerequisiteRecoveryStatus = result.status === 'needs-user'
        ? 'NEEDS_USER'
        : result.status === 'resolved'
          ? result.source === 'provisioned-resource' ? 'RESOURCE_PROVISIONED' : 'RESOURCE_REUSED'
          : 'RESOURCE_DISCOVERY';
      const attempt: RecoveryAttempt = { strategy: strategy.id, status, outcome: result.summary, ...(result.provider ? { provider: result.provider } : {}), risk };
      attempts.push(attempt);
      context.ledger.recordPrerequisiteRecovery({
        prerequisiteId: prerequisite.id,
        prerequisiteKind: prerequisite.kind,
        description: prerequisite.description,
        requiredFor: prerequisite.requiredFor,
        strategy: strategy.id,
        status,
        outcome: result.summary,
        risk,
        ...(result.provider ? { provider: result.provider } : {}),
      });
      if (result.status === 'resolved') return { status: 'resolved', prerequisite, attempts, message: result.summary };
      if (result.status === 'needs-user') {
        const options = (result.candidates ?? []).slice(0, 6).map((candidate) => candidate.label);
        return {
          status: 'needs-user', prerequisite, attempts, message: result.summary,
          question: { header: 'Choose target', question: `Which ${prerequisite.description} should Gitu use for ${prerequisite.requiredFor}?`, options },
        };
      }
    }

    const message = previous.length >= this.maxAttempts
      ? 'The bounded recovery budget for this prerequisite was already exhausted on earlier attempts.'
      : 'Authorized repository, environment, provider-discovery, and provisioning paths were exhausted.';
    attempts.push({ strategy: 'orchestrator', status: 'RECOVERY_EXHAUSTED', outcome: message, risk: RecoveryRisk.READ_ONLY });
    context.ledger.recordPrerequisiteRecovery({
      prerequisiteId: prerequisite.id,
      prerequisiteKind: prerequisite.kind,
      description: prerequisite.description,
      requiredFor: prerequisite.requiredFor,
      strategy: 'orchestrator',
      status: 'RECOVERY_EXHAUSTED',
      outcome: message,
      risk: RecoveryRisk.READ_ONLY,
    });
    return { status: 'exhausted', prerequisite, attempts, message };
  }
}
