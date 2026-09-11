import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { ensureGituHome } from '../workspace/home.js';
import {
  extractJson,
  findXmlCallStart,
  parseXmlFunctionCall,
  xmlMarkerHoldBack,
  type LlmToolDefinition,
  type LlmTurnResult,
} from '../llm/llm.js';
import { KNOWN_TOOL_NAMES } from '../tools/tools.js';
import {
  normalizeConnectionDocumentationUrl,
  normalizeConnectionOperation,
  normalizeConnectionOperationBody,
  type ConnectionOperation,
} from '../connections/connections.js';
import type { DiscoveryIntent } from '../connections/discovery-engine.js';
import type { CriterionSpec, DecisionBasis, MissingPrerequisite, PlanArea } from '../types.js';
import { normalizeDecisionDraft } from './architecture.js';
import { parseMissingPrerequisite, type AskUserQuestion } from './recovery-synthesizer.js';

/** One planned step as offered by the model: bounded on ingest, optionally
 *  tagged with its surface (frontend/backend/...) and broken into todos. */
export interface PlanActionStep {
  description: string;
  verification: string;
  area?: PlanArea;
  subtasks?: string[];
}

export const PLAN_AREAS: readonly PlanArea[] = ['frontend', 'backend', 'integration', 'shared', 'database', 'infra', 'tests', 'docs'];

export function parseArea(value: unknown): PlanArea | undefined {
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  return (PLAN_AREAS as readonly string[]).includes(text) ? (text as PlanArea) : undefined;
}

export function parseSubtasks(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((t) => String(t).trim().slice(0, 140))
    .filter(Boolean)
    .slice(0, 8);
  return items.length > 0 ? items : undefined;
}

export type ParsedAction =
  | { type: 'set_criteria'; criteria: string[] }
  | { type: 'set_plan'; steps: PlanActionStep[] }
  | { type: 'add_criteria'; criteria: string[] }
  | { type: 'append_plan'; steps: PlanActionStep[] }
  | {
      type: 'set_design';
      design: { frontend?: string; backend?: string; integration?: string };
    }
  | {
      type: 'revise_step';
      stepId: string;
      description?: string;
      verification?: string;
      area?: PlanArea;
      addSubtasks?: string[];
      replaceSubtasks?: string[];
      status?: 'pending' | 'cancelled';
      reason: string;
    }
  | { type: 'toggle_todo'; stepId: string; index: number; done?: boolean }
  | { type: 'complete_step'; stepId: string; reason: string }
  | { type: 'show_plan' }
  | { type: 'set_hypothesis'; text: string }
  | {
      type: 'record_decision';
      decision: string;
      alternatives: string[];
      repoEvidence: string;
      requirements: string[];
      rejected: { alternative: string; reason: string }[];
      reconsiderIf?: string;
      basis: DecisionBasis;
      supersedes?: string;
    }
  | { type: 'tool_call'; tool: string; params: Record<string, unknown>; reason: string; expected: string; stepId?: string }
  | { type: 'capability_action'; capability: string; arguments: Record<string, unknown>; freshness?: 'current' | 'cached' | 'force-refresh'; reason: string }
  | { type: 'connection_action'; connectionId: string; operationId: string; reason: string }
  | {
      type: 'connection_discovery';
      connectionId: string;
      intents: DiscoveryIntent[];
      resourceType?: string;
      resourceIdOrName?: string;
      filters?: Record<string, string>;
      reason: string;
    }
  | { type: 'connection_operation'; connectionId: string; operation: ConnectionOperation; body?: unknown; documentationUrl?: string; reason: string }
  | { type: 'claim_criterion'; criterionId: string; evidenceId: string; justification?: string }
  | { type: 'complete'; summary: string; risks?: string[]; followUps?: string[]; chat?: boolean }
  | { type: 'request_block'; reason: string; prerequisite?: MissingPrerequisite }
  | { type: 'ask_user'; questions: AskUserQuestion[] }
  | {
      type: 'delegate';
      tasks: { agent: string; task: string; criteria?: (string | CriterionSpec)[]; resume?: { jobId: string; note?: string; allowSkillRecovery?: boolean } }[];
      background?: boolean;
    }
  | {
      type: 'report_finding';
      claim: string;
      kind?: string;
      severity?: string;
      location?: string;
      reproductionCommand?: string;
    }
  | {
      type: 'parallel';
      calls: { tool: string; params: Record<string, unknown>; reason: string; expected: string }[];
    };

export function visibleActionSummary(action: ParsedAction): string | undefined {
  const clean = (value: string, limit = 280): string => value.replace(/\s+/g, ' ').trim().replace(/^next:\s*/i, '').slice(0, limit);
  switch (action.type) {
    case 'set_criteria':
      return `I’m defining ${action.criteria.length === 1 ? 'a clear acceptance check' : `${action.criteria.length} clear acceptance checks`} before I proceed.`;
    case 'set_plan':
      return `I’m mapping the work into ${action.steps.length === 1 ? 'one verifiable step' : `${action.steps.length} verifiable steps`}.`;
    case 'add_criteria':
      return 'I’m adding the follow-up checks needed for this new scope.';
    case 'append_plan':
      return 'I’m extending the plan for the follow-up work.';
    case 'set_design':
      return 'I’m recording the implementation approach before making changes.';
    case 'tool_call': {
      const reason = clean(action.reason);
      if (reason) return reason;
      const target = typeof action.params['path'] === 'string' ? clean(action.params['path'], 160) : '';
      switch (action.tool) {
        case 'read_file': return target ? `I’m reading ${target}.` : 'I’m reading the relevant file.';
        case 'write_file':
        case 'apply_edit': return target ? `I’m updating ${target}.` : 'I’m applying the requested change.';
        case 'search_files': return 'I’m searching the project for the relevant implementation.';
        case 'list_files': return 'I’m checking the project files.';
        case 'run_command': return 'I’m running the command and checking its result.';
        case 'web_fetch': return 'I’m reading the requested page.';
        case 'browse': return 'I’m checking the page in the browser.';
        default: return `I’m running ${action.tool.replace(/_/g, ' ')}.`;
      }
    }
    case 'capability_action':
      return clean(action.reason) || `I’m running ${action.capability}.`;
    case 'connection_action':
      return clean(action.reason) || `I’m reading ${action.operationId} from ${action.connectionId}.`;
    case 'connection_discovery': {
      const target = action.resourceIdOrName ? ` for "${action.resourceIdOrName}"` : '';
      return clean(action.reason) || `I’m checking ${action.intents.join(', ')}${target} on ${action.connectionId}.`;
    }
    case 'connection_operation': {
      // Safe reads auto-register under the existing credential and run
      // immediately — they never wait for approval. Only non-read operations
      // go through the approval channel, so the narration must not claim a
      // GET is "awaiting approval".
      if (action.operation.risk === 'read' && action.operation.method === 'GET') {
        const purpose = clean(action.reason);
        return `${purpose ? `${purpose}. ` : ''}I’m reading ${action.operation.label} from ${action.connectionId}; safe reads auto-register and run without approval.`;
      }
      return `I’m requesting approval for ${clean(action.operation.label)}.`;
    }
    case 'parallel':
      return `I’m running ${action.calls.length} independent checks in parallel.`;
    case 'set_hypothesis':
      return 'I’m recording the current diagnosis before testing it.';
    case 'record_decision':
      return 'I’m recording the design decision and the evidence behind it.';
    case 'revise_step':
      return `I’m updating the current plan step: ${clean(action.reason, 180)}`;
    case 'complete_step':
      return 'The current plan step is complete; I’m moving to the next one.';
    case 'claim_criterion':
      return 'I’m checking this acceptance condition against the recorded evidence.';
    case 'delegate': {
      const resumed = action.tasks.filter((task) => task.resume?.jobId).length;
      if (resumed) return `I’m resuming ${resumed === 1 ? 'a preserved specialist job' : `${resumed} preserved specialist jobs`} without allocating duplicate work.`;
      return `I’m assigning ${action.tasks.length === 1 ? 'an independent check' : `${action.tasks.length} independent checks`} to specialist work.`;
    }
    case 'report_finding':
      return 'I found a potential issue and I’m recording it for independent verification.';
    default:
      return undefined;
  }
}

export function parseAction(raw: unknown): ParsedAction | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const root = raw as Record<string, unknown>;
  const action = (root['action'] ?? root) as Record<string, unknown>;
  const rawType = action['type'] ?? action['tool'] ?? action['tool_name'] ?? action['name'];
  const type = typeof rawType === 'string' ? rawType.trim() : undefined;
  if (!type) return undefined;

  // Models that emit direct tool names as action type (e.g. {"type":"run_command",...})
  if (!KNOWN_ACTION_TYPES.has(type) && (KNOWN_TOOL_NAMES.has(type) || type.startsWith('mcp:'))) {
    const rawNested = action['params'] ?? action['parameters'] ?? action['arguments'] ?? action['args'];
    const params: Record<string, unknown> = {};
    if (rawNested && typeof rawNested === 'object' && !Array.isArray(rawNested)) {
      Object.assign(params, rawNested as Record<string, unknown>);
    } else {
      for (const [key, value] of Object.entries(action)) {
        if (key !== 'type' && key !== 'tool' && key !== 'tool_name' && key !== 'name' && key !== 'thought' && key !== 'reason' && key !== 'expected' && key !== 'stepId') {
          params[key] = value;
        }
      }
    }
    // Alias normalization for common tool parameters
    if (params['file_path'] !== undefined && params['path'] === undefined) params['path'] = params['file_path'];
    if (params['filePath'] !== undefined && params['path'] === undefined) params['path'] = params['filePath'];
    if (params['file'] !== undefined && params['path'] === undefined && typeof params['file'] === 'string') params['path'] = params['file'];
    if (params['cmd'] !== undefined && params['command'] === undefined) params['command'] = params['cmd'];

    return {
      type: 'tool_call',
      tool: type,
      params,
      reason: String(action['reason'] ?? action['thought'] ?? ''),
      expected: String(action['expected'] ?? ''),
      stepId: typeof action['stepId'] === 'string' ? action['stepId'] : undefined,
    };
  }

  switch (type) {
    case 'set_criteria':
    case 'add_criteria': {
      const criteria = action['criteria'];
      if (!Array.isArray(criteria) || criteria.length === 0) return undefined;
      return { type, criteria: criteria.map(String).slice(0, 10) };
    }
    case 'set_plan':
    case 'append_plan': {
      const steps = action['steps'];
      if (!Array.isArray(steps) || steps.length === 0) return undefined;
      const parsed = steps
        .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object')
        .map((s) => {
          const area = parseArea(s['area']);
          const subtasks = parseSubtasks(s['subtasks']);
          return {
            description: String(s['description'] ?? '').slice(0, 220),
            verification: String(s['verification'] ?? 'manual check').slice(0, 180),
            ...(area ? { area } : {}),
            ...(subtasks ? { subtasks } : {}),
          };
        })
        .filter((s) => s.description);
      if (parsed.length === 0) return undefined;
      // Bounded plan: ≤30 top-level steps keeps the compact state render cheap.
      return { type, steps: parsed.slice(0, 30) };
    }
    case 'set_design': {
      const raw = action['design'];
      if (!raw || typeof raw !== 'object') return undefined;
      const src = raw as Record<string, unknown>;
      const cap = (value: unknown, max: number): string | undefined => {
        const text = String(value ?? '').trim();
        return text ? text.slice(0, max) : undefined;
      };
      const design = {
        frontend: cap(src['frontend'], 1200),
        backend: cap(src['backend'], 1200),
        integration: cap(src['integration'], 800),
      };
      if (!design.frontend && !design.backend && !design.integration) return undefined;
      return { type, design };
    }
    case 'revise_step': {
      if (typeof action['stepId'] !== 'string' || !action['stepId']) return undefined;
      const reason = String(action['reason'] ?? '').trim();
      if (!reason) return undefined;
      const area = parseArea(action['area']);
      const addSubtasks = parseSubtasks(action['todos'] ?? action['addTodos']);
      const replaceSubtasks = Array.isArray(action['replaceTodos']) ? (parseSubtasks(action['replaceTodos']) ?? []) : undefined;
      const status = action['status'] === 'pending' || action['status'] === 'cancelled' ? action['status'] : undefined;
      const description = typeof action['description'] === 'string' && action['description'].trim() ? action['description'].slice(0, 220) : undefined;
      const verification = typeof action['verification'] === 'string' && action['verification'].trim() ? action['verification'].slice(0, 180) : undefined;
      if (description === undefined && verification === undefined && !area && !addSubtasks && replaceSubtasks === undefined && !status) return undefined;
      return { type, stepId: action['stepId'], reason, description, verification, area, addSubtasks, replaceSubtasks, status };
    }
    case 'toggle_todo': {
      if (typeof action['stepId'] !== 'string' || !action['stepId']) return undefined;
      if (typeof action['index'] !== 'number' || !Number.isFinite(action['index'])) return undefined;
      const done = typeof action['done'] === 'boolean' ? action['done'] : undefined;
      return { type, stepId: action['stepId'], index: Math.max(0, Math.floor(action['index'])), done };
    }
    case 'complete_step': {
      if (typeof action['stepId'] !== 'string' || !action['stepId']) return undefined;
      const reason = String(action['reason'] ?? '').trim();
      if (!reason) return undefined;
      return { type, stepId: action['stepId'], reason };
    }
    case 'show_plan':
      return { type: 'show_plan' };
    case 'set_hypothesis':
      if (typeof action['text'] !== 'string') return undefined;
      return { type, text: action['text'] };
    case 'record_decision': {
      const draft = normalizeDecisionDraft(action);
      if (!draft) return undefined;
      return { type, ...draft, basis: draft.basis ?? 'recommendation' };
    }
    case 'tool_call': {
      const tool = String(action['tool'] ?? action['tool_name'] ?? action['name'] ?? '');
      if (!tool) return undefined;
      const rawParams = action['params'] ?? action['parameters'] ?? action['arguments'] ?? action['args'];
      const params: Record<string, unknown> = (rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)) ? { ...(rawParams as Record<string, unknown>) } : {};
      if (Object.keys(params).length === 0) {
        for (const [k, v] of Object.entries(action)) {
          if (k !== 'type' && k !== 'tool' && k !== 'tool_name' && k !== 'name' && k !== 'reason' && k !== 'thought' && k !== 'expected' && k !== 'stepId') {
            params[k] = v;
          }
        }
      }
      if (params['file_path'] !== undefined && params['path'] === undefined) params['path'] = params['file_path'];
      if (params['filePath'] !== undefined && params['path'] === undefined) params['path'] = params['filePath'];
      if (params['file'] !== undefined && params['path'] === undefined && typeof params['file'] === 'string') params['path'] = params['file'];
      if (params['cmd'] !== undefined && params['command'] === undefined) params['command'] = params['cmd'];
      return {
        type,
        tool,
        params,
        reason: String(action['reason'] ?? action['thought'] ?? ''),
        expected: String(action['expected'] ?? ''),
        stepId: typeof action['stepId'] === 'string' ? action['stepId'] : undefined,
      };
    }
    case 'capability_action': {
      const capability = String(action['capability'] ?? action['capabilityId'] ?? action['id'] ?? '').trim();
      if (!/^(?:conn|mcp|native|cli|plugin):[a-z0-9][a-z0-9._:/-]{0,199}$/i.test(capability)) return undefined;
      const rawArguments = action['arguments'] ?? action['params'] ?? action['parameters'] ?? action['args'] ?? {};
      if (!rawArguments || typeof rawArguments !== 'object' || Array.isArray(rawArguments)) return undefined;
      const freshness = action['freshness'];
      if (freshness !== undefined && freshness !== 'current' && freshness !== 'cached' && freshness !== 'force-refresh') return undefined;
      const reason = String(action['reason'] ?? action['thought'] ?? '').trim().slice(0, 240);
      if (!reason) return undefined;
      return {
        type,
        capability,
        arguments: { ...(rawArguments as Record<string, unknown>) },
        ...(freshness ? { freshness } : {}),
        reason,
      };
    }
    case 'connection_action': {
      const rawConn = action['connectionId'] ?? action['connection_id'] ?? action['connection'] ?? action['provider'];
      const rawOp = action['operationId'] ?? action['operation_id'] ?? (typeof action['operation'] === 'string' ? action['operation'] : (action['operation'] as Record<string, unknown>)?.['id']) ?? action['op'];
      const connectionId = String(rawConn ?? '').trim().toLowerCase();
      const operationId = String(rawOp ?? '').trim().toLowerCase();
      if (!connectionId) return undefined;
      // Auto-promote to connection_discovery if intents array is provided
      if (action['intents'] || action['intent']) {
        const rawIntents = action['intents'] ?? action['intent'];
        const intentsArray = (Array.isArray(rawIntents) ? rawIntents : [rawIntents])
          .map((i) => String(i).trim())
          .filter(Boolean) as DiscoveryIntent[];
        if (intentsArray.length > 0) {
          const resourceType = action['resourceType'] ? String(action['resourceType']).trim() : undefined;
          const resourceIdOrName = action['resourceIdOrName'] ? String(action['resourceIdOrName']).trim() : (action['resource'] ? String(action['resource']).trim() : (action['name'] ? String(action['name']).trim() : undefined));
          return {
            type: 'connection_discovery',
            connectionId,
            intents: intentsArray,
            ...(resourceType ? { resourceType } : {}),
            ...(resourceIdOrName ? { resourceIdOrName } : {}),
            reason: String(action['reason'] ?? action['thought'] ?? '').trim().slice(0, 240),
          };
        }
      }
      if (!operationId) return undefined;
      // Tolerant identifier check: allow alphanumeric, dashes, underscores, and provider slashes
      if (!/^[a-z0-9][a-z0-9_/-]{0,99}$/i.test(connectionId)) return undefined;
      if (!/^[a-z0-9][a-z0-9_/-]{0,99}$/i.test(operationId)) return undefined;
      return {
        type,
        connectionId,
        operationId,
        reason: String(action['reason'] ?? action['thought'] ?? '')
          .trim()
          .slice(0, 240),
      };
    }
    case 'connection_discovery': {
      const rawConn = action['connectionId'] ?? action['connection_id'] ?? action['connection'] ?? action['provider'];
      const connectionId = String(rawConn ?? '').trim().toLowerCase();
      if (!connectionId || !/^[a-z0-9][a-z0-9_/-]{0,99}$/i.test(connectionId)) return undefined;
      const rawIntents = action['intents'] ?? action['intent'] ?? ['list_resources'];
      const intentsArray = (Array.isArray(rawIntents) ? rawIntents : [rawIntents])
        .map((i) => String(i).trim())
        .filter(Boolean) as DiscoveryIntent[];
      if (intentsArray.length === 0) return undefined;
      const resourceType = action['resourceType'] ? String(action['resourceType']).trim() : undefined;
      const resourceIdOrName = action['resourceIdOrName'] ? String(action['resourceIdOrName']).trim() : (action['resource'] ? String(action['resource']).trim() : (action['name'] ? String(action['name']).trim() : undefined));
      const filters = action['filters'] && typeof action['filters'] === 'object' && !Array.isArray(action['filters']) ? (action['filters'] as Record<string, string>) : undefined;
      const reason = String(action['reason'] ?? action['thought'] ?? '').trim().slice(0, 240);
      return {
        type: 'connection_discovery',
        connectionId,
        intents: intentsArray,
        ...(resourceType ? { resourceType } : {}),
        ...(resourceIdOrName ? { resourceIdOrName } : {}),
        ...(filters ? { filters } : {}),
        reason,
      };
    }
    case 'connection_operation': {
      const rawConn = action['connectionId'] ?? action['connection_id'] ?? action['connection'] ?? action['provider'];
      const connectionId = String(rawConn ?? '').trim().toLowerCase();
      if (!connectionId || !/^[a-z0-9][a-z0-9_/-]{0,99}$/i.test(connectionId)) return undefined;
      const rawOp = action['operation'] ?? action['op'];
      const operation = normalizeConnectionOperation(rawOp);
      if (!operation) return undefined;
      const rawDocumentationUrl = action['documentationUrl'] ?? action['documentation_url'] ?? action['docUrl'] ?? action['docs'];
      const documentationUrl = rawDocumentationUrl === undefined ? undefined : normalizeConnectionDocumentationUrl(rawDocumentationUrl);
      if (rawDocumentationUrl !== undefined && !documentationUrl) return undefined;
      try {
        const body = action['body'] === undefined ? undefined : normalizeConnectionOperationBody(action['body'] ?? action['params'] ?? action['payload']);
        const reason = String(action['reason'] ?? action['thought'] ?? '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 240);
        if (!reason) return undefined;
        return { type, connectionId, operation, ...(body !== undefined ? { body } : {}), ...(documentationUrl ? { documentationUrl } : {}), reason };
      } catch {
        return undefined;
      }
    }
    case 'claim_criterion':
      if (typeof action['criterionId'] !== 'string' || typeof action['evidenceId'] !== 'string') return undefined;
      return { type, criterionId: action['criterionId'], evidenceId: action['evidenceId'], justification: action['justification'] ? String(action['justification']) : undefined };
    case 'complete':
      if (typeof action['summary'] !== 'string') return undefined;
      return {
        type,
        summary: action['summary'],
        risks: Array.isArray(action['risks']) ? action['risks'].map(String) : [],
        followUps: Array.isArray(action['followUps']) ? action['followUps'].map(String) : [],
        chat: action['chat'] === true,
      };
    case 'request_block':
      if (typeof action['reason'] !== 'string') return undefined;
      return { type, reason: action['reason'], prerequisite: parseMissingPrerequisite(action['prerequisite'], action['reason']) };
    case 'delegate': {
      const tasks = action['tasks'];
      if (!Array.isArray(tasks) || tasks.length === 0) return undefined;
      const parsed = (tasks as Record<string, unknown>[])
        .map((t) => {
          const agent = String(t?.['agent'] ?? '');
          const task = String(t?.['task'] ?? '');
          const rawCrit = t?.['criteria'];
          const criteria = Array.isArray(rawCrit)
            ? (rawCrit as unknown[]).map((c) => (typeof c === 'string' ? c : typeof c === 'object' && c !== null ? (c as CriterionSpec) : String(c))).slice(0, 10)
            : undefined;
          const rawResume = t?.['resume'];
          const resume =
            rawResume && typeof rawResume === 'object' && typeof (rawResume as Record<string, unknown>)['jobId'] === 'string'
              ? {
                  jobId: String((rawResume as Record<string, unknown>)['jobId']).trim(),
                  note: typeof (rawResume as Record<string, unknown>)['note'] === 'string' ? String((rawResume as Record<string, unknown>)['note']) : undefined,
                  allowSkillRecovery: (rawResume as Record<string, unknown>)['allowSkillRecovery'] === true,
                }
              : undefined;
          return { agent, task, criteria, ...(resume?.jobId ? { resume } : {}) };
        })
        .filter((t) => t.agent && t.task)
        .slice(0, 6);
      if (parsed.length === 0) return undefined;
      return { type, tasks: parsed, background: action['background'] === true };
    }
    case 'report_finding': {
      if (typeof action['claim'] !== 'string' || !action['claim'].trim()) return undefined;
      return {
        type,
        claim: action['claim'],
        kind: typeof action['kind'] === 'string' ? action['kind'] : undefined,
        severity: typeof action['severity'] === 'string' ? action['severity'] : undefined,
        location: typeof action['location'] === 'string' ? action['location'] : undefined,
        reproductionCommand: typeof action['reproductionCommand'] === 'string' ? action['reproductionCommand'] : undefined,
      };
    }
    case 'ask_user': {
      const questions = action['questions'];
      if (!Array.isArray(questions) || questions.length === 0) return undefined;
      const parsed = (questions as Record<string, unknown>[])
        .map((q) => ({
          question: String(q['question'] ?? ''),
          header: typeof q['header'] === 'string' ? q['header'] : undefined,
          options: Array.isArray(q['options']) ? (q['options'] as unknown[]).map(String).slice(0, 6) : [],
        }))
        .filter((q) => q.question);
      if (parsed.length === 0) return undefined;
      return { type, questions: parsed.slice(0, 4) };
    }
    case 'parallel': {
      const calls = action['calls'];
      if (!Array.isArray(calls)) return undefined;
      const parsedCalls = (calls as Record<string, unknown>[])
        .map((c) => ({
          tool: String(c['tool'] ?? ''),
          params: (c['params'] && typeof c['params'] === 'object' ? c['params'] : {}) as Record<string, unknown>,
          reason: String(c['reason'] ?? ''),
          expected: String(c['expected'] ?? ''),
        }))
        .filter((c) => c.tool);
      if (parsedCalls.length < 2) return undefined;
      return { type, calls: parsedCalls.slice(0, 6) };
    }
    default:
      return undefined;
  }
}

export const KNOWN_ACTION_TYPES = new Set([
  'set_criteria',
  'set_plan',
  'add_criteria',
  'append_plan',
  'set_hypothesis',
  'record_decision',
  'set_design',
  'revise_step',
  'toggle_todo',
  'complete_step',
  'show_plan',
  'tool_call',
  'capability_action',
  'connection_action',
  'connection_discovery',
  'connection_operation',
  'claim_criterion',
  'complete',
  'request_block',
  'ask_user',
  'delegate',
  'report_finding',
  'parallel',
]);

/**
 * One provider-neutral entrypoint keeps model-owned tool syntax outside the
 * executor. A model can suggest an action, but only the existing Gitu parser,
 * policy engine, and executor decide whether it runs.
 */
export const GITU_ACTION_TOOL: LlmToolDefinition = {
  name: 'agent_gitu_action',
  description:
    'Submit exactly one Agent Gitu action for validation and execution. Put the normal action object (type, tool, params, reason, expected, etc.) in action. Do not describe an action in prose.',
  parameters: {
    type: 'object',
    properties: {
      action: {
        type: 'object',
        description: 'The Agent Gitu action object. Its type must be one of the documented actions in the system instructions.',
        additionalProperties: true,
      },
    },
    required: ['action'],
    additionalProperties: false,
  },
};

export function actionReplyFromTurn(turn: LlmTurnResult): string {
  switch (turn.kind) {
    case 'text':
      return turn.text;
    case 'refusal':
      return turn.reason;
    case 'empty':
      return '';
    case 'tool_calls': {
      if (turn.calls.length === 0) return '';
      const explicitActionCall = turn.calls.find((candidate) =>
        candidate.name === GITU_ACTION_TOOL.name ||
        candidate.name === 'agent_gitu_action' ||
        candidate.name === 'gitu_action' ||
        candidate.name === 'agent_action',
      );
      if (explicitActionCall) {
        const actionObj = explicitActionCall.arguments['action'] ?? explicitActionCall.arguments;
        return JSON.stringify({ action: actionObj });
      }
      const first = turn.calls[0]!;
      if (KNOWN_ACTION_TYPES.has(first.name)) {
        return JSON.stringify({ action: { type: first.name, ...first.arguments } });
      }
      if (KNOWN_TOOL_NAMES.has(first.name) || first.name.startsWith('mcp:')) {
        return JSON.stringify({ action: { type: 'tool_call', tool: first.name, params: first.arguments, reason: String(first.arguments['reason'] ?? ''), expected: String(first.arguments['expected'] ?? '') } });
      }
      return JSON.stringify({ action: { type: 'tool_call', tool: first.name, params: first.arguments, reason: '', expected: '' } });
    }
  }
}

export function parseReplyAction(reply: string): ParsedAction | undefined {
  const fromJson = parseAction(extractJson(reply));
  if (fromJson) return fromJson;
  const xml = parseXmlFunctionCall(reply);
  if (!xml) return undefined;
  const type = String(xml['type'] ?? '');
  if (!type) return undefined;
  if (KNOWN_ACTION_TYPES.has(type)) return parseAction({ action: xml });
  if (KNOWN_TOOL_NAMES.has(type) || type.startsWith('mcp:')) {
    const params: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(xml)) {
      if (key !== 'type') params[key] = value;
    }
    return parseAction({ action: { type: 'tool_call', tool: type, params, reason: '', expected: '' } });
  }
  return undefined;
}

/**
 * Net curly-brace balance of a text chunk, ignoring braces inside strings.
 */
export function braceBalance(text: string): number {
  let bal = 0;
  let inStr: string | null = null;
  let esc = false;
  for (const ch of text) {
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      continue;
    }
    if (ch === '{') bal += 1;
    else if (ch === '}') bal -= 1;
  }
  return bal;
}

export type BadReplyKind = 'empty' | 'truncated-json';

/**
 * Distinguish RETRYABLE model failures from real protocol errors:
 *  - empty completions (provider returned nothing — often output budget or a
 *    transport hiccup under huge contexts)
 *  - prose followed by an UNTERMINATED action object (output cut mid-JSON)
 * Anything else (prose-only replies, malformed but complete JSON) is a genuine
 * unparseable turn and must count toward the anti-spiral streak.
 */
export function classifyBadReply(reply: string | undefined | null): BadReplyKind | null {
  if (!reply || !reply.trim()) return 'empty';
  // Two real-world truncation shapes:
  //   A) cut inside the thought STRING: `prose… {"thought":"The markup i`
  //   B) cut inside the INNER action object: `{"thought":"x","action":{"type":"run_co`
  // Anchor on the last '{' and accept either the key visible just after it
  // (shape A) or immediately before it (shape B).
  const idx = reply.lastIndexOf('{');
  if (idx >= 0) {
    const tail = reply.slice(idx);
    const before = reply.slice(Math.max(0, idx - 32), idx);
    const nearProtocol = /"(?:thought|action)"\s*:/.test(tail.slice(0, 60)) || /"(?:thought|action)"\s*:\s*$/.test(before);
    if (tail.length <= 8000 && nearProtocol && braceBalance(tail) > 0) return 'truncated-json';
  }
  return null;
}

/** Persist raw unparseable replies so stalls can be diagnosed from logs. */
export function logParseFailure(taskId: string, reply: string, reasoning?: string): void {
  try {
    const logs = path.join(ensureGituHome().root, 'logs');
    mkdirSync(logs, { recursive: true });
    const entry =
      `\n=== ${new Date().toISOString()} task=${taskId} ===\n--- reply ---\n${reply.slice(0, 4000)}\n` + (reasoning ? `--- reasoning ---\n${reasoning.slice(0, 4000)}\n` : '');
    appendFileSync(path.join(logs, 'parse-failures.log'), entry);
  } catch {
    /* diagnostics must never break the run */
  }
}

/** A '{' only starts a JSON action when a protocol key follows it nearby;
 *  prose that merely mentions braces (config examples, code quotes) must not
 *  truncate the user-facing streamed text. */
export const ACTION_BRACE_RE = /\{\s*"(?:thought|action|type)"/;

export function proseCutIndex(text: string): number {
  const braceMatch = ACTION_BRACE_RE.exec(text);
  const brace = braceMatch ? braceMatch.index : -1;
  const xml = findXmlCallStart(text);
  if (brace < 0) return xml;
  if (xml < 0) return brace;
  return Math.min(brace, xml);
}

export function createProseStreamer(emitDelta: (chunk: string) => void): (delta: string) => void {
  let raw = '';
  let emitted = 0;
  let stopped = false;
  return (delta: string) => {
    if (stopped) return;
    raw += delta;
    const cut = proseCutIndex(raw);
    let upTo: number;
    if (cut >= 0) {
      stopped = true;
      upTo = cut;
    } else {
      upTo = raw.length - xmlMarkerHoldBack(raw);
    }
    if (upTo > emitted) {
      emitDelta(raw.slice(emitted, upTo));
      emitted = upTo;
    }
  };
}

/** Constrained protocol-repair calls per run: after a malformed/no-action
 * reply, one short call asks for EXACTLY the action object. Bounded so a
 * drifting model cannot double the run cost. */
export const MAX_PROTOCOL_REPAIRS = 3;
export const PROTOCOL_REPAIR_INSTRUCTION =
  'PROTOCOL REPAIR: your previous reply did not contain a usable executable action. Reply NOW with EXACTLY ONE JSON action object and NOTHING else — no prose, no markdown, no code fences, no reasoning: {"thought":"...","action":{...}}';
