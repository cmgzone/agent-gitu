/**
 * The one tool catalog.
 *
 * Every capability Gitu can offer a native turn is declared here exactly once:
 * its canonical id, which profiles may be offered it, which existing layer
 * performs its effect, and — for Cowork — which agent grant it needs. The seats
 * keep their own schemas and descriptions; this module owns the facts that
 * decide *whether a call is allowed at all*, so the coding seat and the Cowork
 * seat cannot drift into disagreeing about it.
 *
 * Two rules this file exists to enforce:
 *
 * 1. A shared id is not shared authority. `read_file` reaches the workspace
 *    through the coding `Executor` in the coding profile and through the
 *    agent-scoped Cowork implementation in the Cowork profile. The catalog
 *    records both routes; it never merges the checks behind them.
 * 2. The catalog grants nothing by being listed. `decideToolAccess` answers
 *    "may this profile be offered this capability under these grants"; the
 *    executing layer still decides whether the concrete call is permitted
 *    (`PolicyEngine` + `ProjectGuard` for coding, the tool's own validation for
 *    Cowork). A shared catalog is not a shared authorization.
 *
 * `profiles` are deliberately unequal. Coding is not offered Cowork's company,
 * computer, conversation, or teammate management tools; Cowork is not offered
 * shell-adjacent coding tools unless its own grants enable the gate.
 */

/**
 * Who the turn is running as. 'company' is not a third seat: a company agent is
 * a Cowork agent with a company assignment, so it shares the Cowork rules and
 * additionally satisfies the `company` requirements below.
 */
export type ToolProfile = 'coding' | 'cowork' | 'company';

/** The existing layer that performs the effect. No new dispatcher may be added
 *  without also wiring an execution path — this list is closed on purpose. */
export type ToolDispatcher = 'executor' | 'cowork' | 'capability' | 'connection' | 'supervision';

/** Cowork's agent-level grants. Unchanged semantics from the previous inline checks. */
export type ToolGate = 'shell' | 'writes' | 'config' | 'chief' | 'browser';

export type ToolGrants = {
  allowShell: boolean;
  allowWrites: boolean;
  allowConfig: boolean;
  chief: boolean;
  browser: boolean;
};

export interface ToolRoute {
  dispatcher: ToolDispatcher;
  /** Cowork only: the agent grant this capability needs. Absent means ungated. */
  gate?: ToolGate;
  /**
   * Cowork only. 'required' withholds the tool unless the agent has a company
   * assignment; 'bypassGate' offers it to company agents even when its gate is
   * closed (mission management is owned by the company, not by the chief grant).
   */
  company?: 'required' | 'bypassGate';
  /** Cowork only: the MCP call path needs config + shell + writes, not one grant. */
  mcpWritePath?: boolean;
  /**
   * Coding only: accepted by the native seat's service dispatcher. Defaults to
   * true; the two supervision entry points are declared functions, not services.
   */
  service?: boolean;
}

export interface CanonicalToolSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolDescriptor {
  id: string;
  description?: string;
  schema?: CanonicalToolSchema;
  routes: Partial<Record<ToolProfile, ToolRoute>>;
  /** One id, two unrelated meanings depending on the seat. Declared, never merged silently. */
  conflict?: string;
}

const coding = (dispatcher: ToolDispatcher = 'executor'): ToolRoute => ({ dispatcher });
const other = (dispatcher: ToolDispatcher): ToolRoute => ({ dispatcher, service: false });
const cowork = (gate?: ToolGate): ToolRoute => ({ dispatcher: 'cowork', ...(gate ? { gate } : {}) });

const TOOLS: ToolDescriptor[] = [
  // ── Shared: one capability, two guarded implementations ───────────────────
  {
    id: 'read_file',
    description: 'Read a text or image file. Supports line ranges via offset and limit.',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to the project root.' },
        offset: { type: 'number', description: 'Line number to start reading from (1-based).' },
        limit: { type: 'number', description: 'Maximum number of lines to read.' },
        refresh: { type: 'boolean', description: 'Force a fresh read from disk bypassing unchanged cache.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    routes: { coding: coding(), cowork: cowork() },
  },
  {
    id: 'write_file',
    description: 'Create or overwrite a file with full content.',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to the project root.' },
        content: { type: 'string', description: 'Full text content to write.' },
        scratch: { type: 'boolean', description: 'Mark as temporary scratch file.' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
    routes: { coding: coding(), cowork: cowork('writes') },
  },
  {
    id: 'apply_edit',
    description: 'Replace an exact string in a file with new text.',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path relative to the project root.' },
        oldString: { type: 'string', description: 'Exact existing string to replace.' },
        newString: { type: 'string', description: 'Replacement string.' },
        replaceAll: { type: 'boolean', description: 'Replace all occurrences of oldString instead of only the single match.' },
      },
      required: ['path', 'oldString', 'newString'],
      additionalProperties: false,
    },
    routes: { coding: coding(), cowork: cowork('writes') },
  },
  {
    id: 'list_files',
    description: 'List files and directories in a folder.',
    schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path relative to the project root (default ".").' },
        recursive: { type: 'boolean', description: 'Whether to list subdirectories recursively.' },
        limit: { type: 'number', description: 'Maximum number of entries to return.' },
      },
      required: [],
      additionalProperties: false,
    },
    routes: { coding: coding(), cowork: cowork() },
  },
  {
    id: 'search_files',
    description: 'Search for patterns across workspace files.',
    schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Text or regex pattern to search for.' },
        path: { type: 'string', description: 'Subdirectory to search in.' },
        mode: { type: 'string', enum: ['literal', 'regex'], description: 'Search mode: literal (exact substring) or regex.' },
        caseSensitive: { type: 'boolean', description: 'Whether search is case-sensitive.' },
        include: { type: 'array', items: { type: 'string' }, description: 'Glob patterns of files to include.' },
        limit: { type: 'number', description: 'Maximum number of matching lines to return.' },
      },
      required: ['pattern'],
      additionalProperties: false,
    },
    routes: { coding: coding(), cowork: cowork() },
  },
  {
    id: 'run_command',
    description:
      'Run a command through Gitu policy and approvals. action=run requires command; action=status or stop requires cmd-N id. Omit timeoutMs for productive long work.',
    schema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['run', 'status', 'stop'], description: 'Action to perform: run, status, or stop.' },
        command: { type: 'string', description: 'Shell command string to execute (required for action=run).' },
        id: { type: 'string', description: 'Command job id (cmd-N) for status or stop.' },
        waitMs: { type: 'number', description: 'Observation window before returning the live job id; does not stop the command.' },
        timeoutMs: { type: 'number', description: 'Explicit hard kill deadline. Omit for long builds and tests.' },
        background: { type: 'boolean', description: 'Run in background as support service.' },
        verificationScope: {
          type: 'object',
          properties: {
            paths: { type: 'array', items: { type: 'string' } },
            reason: { type: 'string' },
          },
          required: ['paths', 'reason'],
        },
      },
      required: ['action'],
      additionalProperties: false,
    },
    routes: { coding: coding(), cowork: cowork('shell') },
  },
  {
    id: 'browse',
    description: 'Drive the automated browser: navigate/evidence/screenshot/click/fill/select/press/type/scroll/wait.',
    schema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Browser action to perform.' },
        url: { type: 'string', description: 'Target URL for navigation.' },
        selector: { type: 'string', description: 'CSS selector for element actions.' },
        text: { type: 'string', description: 'Text to type or fill.' },
      },
      required: ['action'],
    },
    routes: { coding: coding(), cowork: cowork('browser') },
  },
  {
    id: 'web_search',
    description: 'Research the public web through a saved search API.',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query.' },
        count: { type: 'number', description: 'Maximum results to return.' },
        connectionId: { type: 'string', description: 'Saved search connection ID.' },
      },
      required: ['query'],
    },
    routes: { coding: coding(), cowork: cowork() },
  },
  {
    id: 'web_fetch',
    description: 'Fetch a public URL and return readable text.',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch.' },
      },
      required: ['url'],
    },
    routes: { coding: coding(), cowork: cowork() },
  },
  { id: 'create_document', routes: { coding: coding(), cowork: cowork('writes') } },
  { id: 'schedule_manage', routes: { coding: coding(), cowork: cowork() } },
  { id: 'list_skills', routes: { coding: coding(), cowork: cowork() } },
  { id: 'use_skill', routes: { coding: coding(), cowork: cowork() } },
  { id: 'create_skill', routes: { coding: coding(), cowork: cowork('config') } },
  { id: 'update_skill', routes: { coding: coding(), cowork: cowork('config') } },
  { id: 'list_mcp', routes: { coding: coding(), cowork: cowork() } },
  { id: 'configure_mcp', routes: { coding: coding(), cowork: cowork('config') } },
  { id: 'list_connections', routes: { coding: coding(), cowork: cowork() } },
  { id: 'connection_read', routes: { coding: coding(), cowork: cowork() } },
  { id: 'inspect_connection_response', routes: { coding: coding(), cowork: cowork() } },
  { id: 'update_connection', routes: { coding: coding(), cowork: cowork('config') } },
  {
    id: 'gitu_task',
    description: 'Gitu task supervision. Inspect durable state, set acceptance criteria, or link REAL recorded evidence to a criterion.',
    schema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['state', 'set_criteria', 'update_plan', 'link_criterion', 'bind_verification'] },
        verification: { type: 'string', description: 'Exact executable command for bind_verification; never descriptive prose.' },
        replacementReason: { type: 'string', description: 'Why a model-selected check is unsuitable and how the replacement verifies the same requirement.' },
        plan: {
          type: 'array',
          items: {
            type: 'object',
            properties: { step: { type: 'string' }, status: { type: 'string', enum: ['pending', 'inProgress', 'completed'] } },
            required: ['step', 'status'],
          },
        },
        criteria: {
          type: 'array',
          items: { type: 'object', properties: { text: { type: 'string' }, verification: { type: 'string' }, evidenceType: { type: 'string' } }, required: ['text'] },
        },
        criterionId: { type: 'string' },
        evidenceId: { type: 'string' },
      },
      required: ['operation'],
    },
    // Coding: durable task supervision (plan, criteria, evidence). Cowork: hand
    // real coding work to the project agent. Same name, unrelated powers.
    routes: { coding: other('supervision'), cowork: cowork('writes') },
    conflict: 'task supervision (coding) vs delegate coding work to the project agent (cowork)',
  },

  // ── Coding only ──────────────────────────────────────────────────────────
  { id: 'browser', routes: { coding: coding() } },
  { id: 'delegate', routes: { coding: coding() } },
  { id: 'agent_status', routes: { coding: coding() } },
  { id: 'memory', routes: { coding: coding() } },
  { id: 'use_skill_reference', routes: { coding: coding() } },
  { id: 'lsp_diagnostics', routes: { coding: coding() } },
  { id: 'lsp_definition', routes: { coding: coding() } },
  { id: 'lsp_references', routes: { coding: coding() } },
  { id: 'lsp_hover', routes: { coding: coding() } },
  { id: 'lsp_symbols', routes: { coding: coding() } },
  { id: 'capability_action', routes: { coding: coding('capability') } },
  { id: 'connection_action', routes: { coding: coding('connection') } },
  { id: 'connection_operation', routes: { coding: coding('connection') } },
  { id: 'connection_discovery', routes: { coding: coding('connection') } },
  { id: 'bind_criterion_verification', routes: { coding: coding('supervision') } },
  {
    id: 'gitu_service',
    description:
      'Use Gitu’s guarded files, browser, memory, skills, saved connections, and supervised specialists. Gitu validates permissions and audits execution. Inspect state/results instead of repeating completed work.',
    schema: {
      type: 'object',
      properties: {
        tool: { type: 'string', description: 'A documented Gitu tool, registered capability action, or listed mcp:server:tool.' },
        params: { type: 'object' },
        reason: { type: 'string' },
      },
      required: ['tool', 'params'],
    },
    routes: { coding: other('supervision') },
  },

  // ── Cowork only ──────────────────────────────────────────────────────────
  { id: 'app_manage', routes: { cowork: cowork('chief') } },
  { id: 'team_manage', routes: { cowork: cowork('chief') } },
  { id: 'mission_manage', routes: { cowork: { ...cowork('chief'), company: 'bypassGate' } } },
  { id: 'company_manage', routes: { cowork: cowork() } },
  { id: 'company_files', routes: { cowork: cowork() } },
  { id: 'company_workflow', routes: { cowork: { ...cowork(), company: 'required' } } },
  { id: 'company_handbook', routes: { cowork: { ...cowork(), company: 'required' } } },
  { id: 'company_onboarding', routes: { cowork: { ...cowork(), company: 'required' } } },
  { id: 'company_organization', routes: { cowork: { ...cowork(), company: 'required' } } },
  { id: 'company_boardroom', routes: { cowork: { ...cowork(), company: 'required' } } },
  { id: 'storage', routes: { cowork: cowork() } },
  { id: 'connection_execute', routes: { cowork: cowork('writes') } },
  { id: 'connection_test', routes: { cowork: cowork() } },
  { id: 'mcp_call', routes: { cowork: { ...cowork(), mcpWritePath: true } } },
  { id: 'connected_apps', routes: { cowork: cowork() } },
  { id: 'computer_status', routes: { cowork: cowork() } },
  { id: 'computer_handoff', routes: { cowork: cowork() } },
  { id: 'computer_process', routes: { cowork: cowork('shell') } },
  { id: 'desktop_screenshot', routes: { cowork: cowork('browser') } },
  { id: 'desktop_input', routes: { cowork: cowork('shell') } },
  { id: 'request_browser_auth', routes: { cowork: cowork('browser') } },
  { id: 'ssh_exec', routes: { cowork: cowork('shell') } },
  { id: 'share_file', routes: { cowork: cowork('writes') } },
  { id: 'receive_file', routes: { cowork: cowork('writes') } },
  { id: 'spawn_sub_agent', routes: { cowork: cowork() } },
  { id: 'conversation_history', routes: { cowork: cowork() } },
  { id: 'search_history', routes: { cowork: cowork() } },
  { id: 'agent_memory', routes: { cowork: cowork() } },
  { id: 'user_profile', routes: { cowork: cowork() } },
  { id: 'create_project', routes: { cowork: cowork('config') } },
  { id: 'schedule_followup', routes: { cowork: cowork() } },
  { id: 'message_teammate', routes: { cowork: cowork() } },
  { id: 'todo_manage', routes: { cowork: cowork() } },
  { id: 'folder_manage', routes: { cowork: cowork() } },
  { id: 'widget_manage', routes: { cowork: cowork() } },
  { id: 'ask_user', routes: { cowork: cowork() } },
  { id: 'request_credential', routes: { cowork: cowork() } },
  { id: 'request_permission', routes: { cowork: cowork() } },
  { id: 'recommend', routes: { cowork: cowork() } },
];

/** Declared order, for tests and for anything that renders the catalog. */
export const TOOL_DESCRIPTORS: readonly ToolDescriptor[] = TOOLS;

/** Indexed once so a call site never re-implements lookup or gate resolution. */
export const TOOL_CATALOG: ReadonlyMap<string, ToolDescriptor> = new Map(
  TOOLS.map((tool) => [tool.id, tool]),
);

export function toolDescriptor(id: string): ToolDescriptor | undefined {
  return TOOL_CATALOG.get(id);
}

/** Cowork's gate for a capability, straight from the catalog. */
export function coworkGate(id: string): ToolGate | undefined {
  return TOOL_CATALOG.get(id)?.routes.cowork?.gate;
}

/**
 * Ids the coding native seat accepts through its service dispatcher. Derived,
 * so a capability added to the catalog is callable without a second edit — and
 * a capability removed from it stops being callable.
 */
export function codingServiceToolIds(): string[] {
  return [...TOOL_CATALOG.values()]
    .filter((tool) => tool.routes.coding && tool.routes.coding.service !== false)
    .map((tool) => tool.id);
}

export interface CoworkAccessInput extends Partial<ToolGrants> {
  /** The agent belongs to a company, so company-scoped tools apply. */
  company?: boolean;
}

function gateOpen(gate: ToolGate | undefined, grants: CoworkAccessInput): boolean {
  switch (gate) {
    case 'shell':
      return Boolean(grants.allowShell);
    case 'writes':
      return Boolean(grants.allowWrites);
    case 'config':
      return Boolean(grants.allowConfig);
    case 'chief':
      return Boolean(grants.chief);
    case 'browser':
      return Boolean(grants.browser);
    default:
      return true;
  }
}

/**
 * Why a Cowork agent is not offered a capability, or undefined when it is.
 * One predicate, used by the prompt docs, the native tool list, the legacy
 * wrapper's enum, and the dispatch check — previously four copies.
 */
export function coworkDenial(id: string, grants: CoworkAccessInput): string | undefined {
  const route = TOOL_CATALOG.get(id)?.routes.cowork;
  if (!route) return `${id} is not a Cowork capability.`;
  if (route.company === 'required' && !grants.company)
    return `${id} is only available to an agent with a company assignment.`;
  if (route.mcpWritePath && !(grants.allowConfig && grants.allowShell && grants.allowWrites))
    return `${id} needs configuration, shell and write permission together.`;
  // A company-owned capability bypasses its gate only for an agent that
  // actually has the assignment; without one the gate still applies.
  const bypassesGate = route.company === 'bypassGate' && Boolean(grants.company);
  if (!bypassesGate && !gateOpen(route.gate, grants))
    return `${id} is disabled for this agent. The user can enable it in the agent profile.`;
  return undefined;
}

/** Cowork capabilities this agent may be offered, in catalog order. */
export function coworkToolIds(grants: CoworkAccessInput): string[] {
  return [...TOOL_CATALOG.values()]
    .filter((tool) => tool.routes.cowork && coworkDenial(tool.id, grants) === undefined)
    .map((tool) => tool.id);
}

/** True when the gate alone is open, ignoring company and MCP-path requirements. */
export function coworkGateOpen(id: string, grants: CoworkAccessInput): boolean {
  const route = TOOL_CATALOG.get(id)?.routes.cowork;
  return route ? gateOpen(route.gate, grants) : false;
}

/**
 * Every capability a profile may be offered under these grants, without
 * claiming the call itself is authorized. Callers still validate parameters
 * and re-check the live grant at execution time.
 */
export interface ToolAccessRequest {
  /** The id the model used. A name outside the catalog is denied, never guessed. */
  tool: string;
  profile: ToolProfile;
  /** Cowork grants. Ignored for the coding profile, whose PolicyEngine decides. */
  grants?: CoworkAccessInput;
}

export type ToolAccessDecision =
  | { allowed: true; id: string; dispatcher: ToolDispatcher }
  | { allowed: false; id?: string; reason: string };

/**
 * The single access decision. It answers whether this profile may be offered
 * the capability under these grants and which layer must perform it; it does
 * not authorize the concrete call. Coding side effects are still decided by
 * `PolicyEngine` + `ProjectGuard` at execution, and Cowork tools still validate
 * their own arguments when they run.
 */
export function decideToolAccess(request: ToolAccessRequest): ToolAccessDecision {
  const descriptor = TOOL_CATALOG.get(request.tool);
  if (!descriptor)
    return { allowed: false, reason: `${request.tool} is not in the Gitu tool catalog; nothing ran.` };
  const route =
    descriptor.routes[request.profile] ??
    (request.profile === 'company' ? descriptor.routes.cowork : undefined);
  if (!route)
    return {
      allowed: false,
      id: descriptor.id,
      reason: `${descriptor.id} is not offered to the ${request.profile} profile.`,
    };
  if (request.profile === 'coding')
    return { allowed: true, id: descriptor.id, dispatcher: route.dispatcher };
  const reason = coworkDenial(descriptor.id, {
    ...(request.grants ?? {}),
    ...(request.profile === 'company' ? { company: true } : {}),
  });
  return reason
    ? { allowed: false, id: descriptor.id, reason }
    : { allowed: true, id: descriptor.id, dispatcher: route.dispatcher };
}

export function profileToolIds(
  profile: ToolProfile,
  grants: CoworkAccessInput = {},
): string[] {
  if (profile === 'coding') return codingServiceToolIds();
  return coworkToolIds({ ...grants, ...(profile === 'company' ? { company: true } : {}) });
}

export function toolSchema(id: string): CanonicalToolSchema | undefined {
  return TOOL_CATALOG.get(id)?.schema;
}

export function toolDescription(id: string): string | undefined {
  return TOOL_CATALOG.get(id)?.description;
}

export function canonicalToolDefinition(id: string): { name: string; description: string; inputSchema: CanonicalToolSchema } | undefined {
  const desc = TOOL_CATALOG.get(id);
  if (!desc || !desc.schema) return undefined;
  return {
    name: desc.id,
    description: desc.description ?? desc.id,
    inputSchema: desc.schema,
  };
}
