import { normalizeConnectionSetupHint } from '../connections/connections.js';
import type { MissingPrerequisite } from '../types.js';

export interface AskUserQuestion {
  question: string;
  header?: string;
  options: string[];
}

export function parseMissingPrerequisite(value: unknown, fallbackRequiredFor: string): MissingPrerequisite | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const kinds = new Set(['credential', 'connection', 'resource', 'configuration', 'dependency', 'service', 'target', 'permission']);
  const kind = String(raw['kind'] ?? '').trim();
  const description = String(raw['description'] ?? '').trim();
  if (!kinds.has(kind) || !description) return undefined;
  const id =
    String(raw['id'] ?? '').trim() ||
    `model-${kind}-${description
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60)}`;
  const requiredFor = String(raw['requiredFor'] ?? fallbackRequiredFor).trim() || fallbackRequiredFor;
  const hints = Array.isArray(raw['hints'])
    ? raw['hints']
        .map(String)
        .map((hint) => hint.trim())
        .filter(Boolean)
        .slice(0, 8)
    : undefined;
  const providerHint =
    typeof raw['providerHint'] === 'string'
      ? raw['providerHint']
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9-]/g, '')
          .slice(0, 64)
      : undefined;
  const capabilities = Array.isArray(raw['capabilities'])
    ? [
        ...new Set(
          raw['capabilities']
            .map(String)
            .map((capability) => capability.trim().toLowerCase())
            .filter((capability) => /^[a-z][a-z0-9._-]{0,80}$/.test(capability)),
        ),
      ].slice(0, 24)
    : undefined;
  const connectionSetup = normalizeConnectionSetupHint(raw['connectionSetup']);
  const riskIfWrong = raw['riskIfWrong'];
  return {
    id: id.slice(0, 100),
    kind: kind as MissingPrerequisite['kind'],
    description: description.slice(0, 240),
    requiredFor: requiredFor.slice(0, 240),
    ...(providerHint ? { providerHint } : {}),
    ...(capabilities?.length ? { capabilities } : {}),
    ...(connectionSetup ? { connectionSetup } : {}),
    ...(hints?.length ? { hints } : {}),
    ...(riskIfWrong === 'low' || riskIfWrong === 'medium' || riskIfWrong === 'high' ? { riskIfWrong } : {}),
  };
}

const PROVIDER_TRUNCATED_MARKER = '[response omitted: exceeds safe connection output limit]';
const PROVIDER_TRUNCATED_CHARS = 32_000;
export const PROVIDER_TRUNCATED_GUIDANCE =
  'PROVIDER RESULT TRUNCATED/INCOMPLETE — do NOT ask the user for resource ids or identifiers yet. ' +
  'Run deterministic provider discovery first with narrower saved-connection reads: list/locate the resource, ' +
  'resolve its UUID, then fetch the exact resource (get(id) → status → environment). ' +
  'Only ask the user after those reads are exhausted or genuinely unavailable.';

/** Render a bounded, redacted provider result for model context and flag when
 * the payload was truncated/incomplete. A truncated list is a signal to do a
 * NARROWER read (get-by-id), never a reason to ask the user for identifiers. */
export function connectionResultDisclosure(data: unknown): { text: string; truncated: boolean } {
  if (data === undefined) return { text: '', truncated: false };
  const raw = JSON.stringify(data);
  const truncated = raw.length >= PROVIDER_TRUNCATED_CHARS || raw.includes(PROVIDER_TRUNCATED_MARKER);
  const text = truncated ? `${raw.slice(0, 48_000)}\n…(provider result truncated)` : raw;
  return { text, truncated };
}

/** A user question that asks for a provider-resolvable resource identifier
 * (app/deployment/project id, uuid, ...). The host holds such questions once
 * so the model performs narrower provider reads before disturbing the user. */
export function asksForResourceIdentifier(questions: AskUserQuestion[]): boolean {
  return questions.some((question) =>
    /(?:^|[^a-z])(?:ids?|uuids?|identifiers?)\b|(?:app|application|deployment|project|server|machine|service|workspace|environment|resource|database|volume|domain)\s+(?:id|uuid|identifier)\b/i.test(
      `${question.question} ${question.header ?? ''}`,
    ),
  );
}

/** One bounded single-line reason for a timeline event: provider errors carry
 * detail the user must see, but events stay compact and never multi-line. */
export function connectionEventReason(message: string): string {
  const text = String(message ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > 220 ? `${text.slice(0, 219).trimEnd()}…` : text;
}

export interface ExecutableRecoveryInput {
  invalidStreak: number;
  lastProviderRejection?: string;
  /** Actual provider state already gathered by the recovery controller. */
  recoveryEvidence?: string;
  connectionContext?: string;
  openSteps: { id: string; description: string; verification?: string }[];
  unclaimedCriteria: string[];
}

/**
 * The anti-loop recovery directive. After repeated no-action replies the model
 * must stop analyzing and output ONE executable action; this synthesizes the
 * concrete options from REAL task state — actual provider evidence, registered
 * provider reads, the pending verification command, unclaimed criteria — plus
 * the last provider rejection, so the forced action addresses the actual
 * blocker instead of burning the remaining turn budget on repeated analysis.
 * ADAPT authorization is explicit: evidence may invalidate the strategy, and
 * revising it (revise_step/append_plan) is expected behavior, not a failure.
 */
export function synthesizeExecutableRecovery(input: ExecutableRecoveryInput): string {
  const lines: string[] = [
    `EXECUTABLE ACTION REQUIRED — your last ${input.invalidStreak} replies contained no executable action. Do not analyze again: reply with exactly ONE executable JSON action this turn.`,
    'You are authorized to ADAPT: the goal and constraints are unchanged, but evidence may invalidate the current strategy — revise_step / append_plan to change the implementation or verification path and continue. The only wrong move is re-running a disproven strategy unchanged.',
  ];
  if (input.lastProviderRejection) {
    lines.push(
      `The last provider write is still unresolved: ${input.lastProviderRejection}`,
      'Either fix that request (the provider error says what was wrong) or ground the next action in the provider state below.',
    );
  }
  if (input.recoveryEvidence) {
    lines.push(input.recoveryEvidence);
  }
  if (input.connectionContext) {
    lines.push(
      '1. Verify actual provider state with a registered read:',
      '   {"thought":"...","action":{"type":"connection_action","connectionId":"<real id from the list>","operationId":"<registered read id>","reason":"read back resource state"}}',
      `   Registered reads:\n${input.connectionContext.slice(0, 1_200)}`,
    );
  }
  const step = input.openSteps.find((candidate) => candidate.verification);
  if (step) {
    lines.push(
      `2. Run the pending verification for step ${step.id} ("${step.description.slice(0, 80)}"):`,
      `   {"thought":"...","action":{"type":"tool_call","tool":"run_command","params":${JSON.stringify({ command: step.verification })},"reason":"execute the planned verification","expected":"exit 0"}}`,
    );
  }
  if (input.unclaimedCriteria.length > 0) {
    lines.push(`3. Claim a criterion you already hold evidence for: ${input.unclaimedCriteria.slice(0, 3).join('; ')}`);
  }
  lines.push(
    '4. Only if nothing executable can move the task forward: {"thought":"...","action":{"type":"request_block","reason":"<the concrete missing piece>"}} — a concrete blocker with evidence, not analysis.',
  );
  return lines.join('\n');
}
