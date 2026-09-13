import { createProject } from '../workspace/home.js';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ToolResult } from '../types.js';
import type { ToolContext } from '../tools/tools.js';
import {
  toolApplyEdit,
  toolBrowse,
  toolConfigureMcp,
  toolCreateSkill,
  toolListConnections,
  toolListFiles,
  toolListMcp,
  toolListSkills,
  toolReadFile,
  toolRunCommand,
  toolSearchFiles,
  toolUpdateConnection,
  toolUpdateSkill,
  toolUseSkill,
  toolWebFetch,
  toolWriteFile,
  validateToolParams,
} from '../tools/tools.js';
import type { CoworkAgent, CoworkStore } from './store.js';
import type { CoworkMemory } from './memory.js';
import type { CoworkComputer } from './computer.js';

/**
 * Tool surface for cowork chat agents. It reuses the project's audited tool
 * implementations but drops the heavyweight orchestration tools (delegate,
 * evidence claims, ledgers) that make no sense outside a bounded task run.
 * Capability is opt-in per agent profile instead of tier-gated: a chat
 * teammate has no plan review step to fall back on.
 */

export interface CoworkToolPerms {
  allowShell: boolean;
  allowWrites: boolean;
  allowConfig: boolean;
  /** Only chiefs may create/delete teammates. */
  chief: boolean;
  browser: boolean;
}

/** Runtime context the cowork-specific tools need beyond the shared ToolContext. */
export interface CoworkToolScope {
  store: CoworkStore;
  agent: CoworkAgent;
  memory: CoworkMemory;
  conversationId?: string;
  signal?: AbortSignal;
  computerFor?: (agentId: string) => CoworkComputer;
  /** Set after the first host fallback in a turn (virtual computer unavailable). */
  hostFallbackNoticed?: boolean;
  /** Artifacts presented during this turn are attached to the final message. */
  artifactIds?: string[];
}

/** Tools that normally execute inside the agent's virtual computer. */
const COMPUTER_ROUTED_TOOLS = ['computer_status', 'computer_process', 'list_files', 'read_file', 'search_files', 'write_file', 'apply_edit', 'run_command', 'browse', 'share_file', 'receive_file'];
/** Computer-only tools with no meaningful host equivalent. */
const COMPUTER_ONLY_TOOLS = ['computer_status', 'computer_process'];

const HOST_FALLBACK_NOTICE =
  '[VIRTUAL COMPUTER UNAVAILABLE — tools now run on the user\'s computer. Use workspace-relative paths (never /workspace); shell commands execute on the host machine.]\n';

/** The model was briefed on /workspace paths for the virtual computer; map
 *  them onto workspace-relative paths for host execution. */
function toHostPaths(params: Record<string, unknown>): Record<string, unknown> {
  const out = { ...params };
  for (const key of ['path', 'file']) {
    const value = out[key];
    if (typeof value === 'string' && value.startsWith('/workspace')) {
      out[key] = value === '/workspace' ? '.' : value.replace(/^\/workspace\/?/, '');
    }
  }
  return out;
}

export interface CoworkToolDoc {
  name: string;
  doc: string;
  gate: 'shell' | 'writes' | 'config' | 'chief' | 'browser' | undefined;
}

export const COWORK_TOOLS: CoworkToolDoc[] = [
  { name: 'computer_status', doc: 'Inspect your private virtual computer and its setup status. params: {}', gate: undefined },
  { name: 'computer_process', doc: 'Inspect or stop a background process on your computer. params: {"action":"status","id":"..."} | {"action":"stop","id":"..."}', gate: 'shell' },
  { name: 'share_file', doc: 'Present a file in the conversation as an Open/Download document card and make it available to teammates. params: {"path":"report.pdf"}.', gate: 'writes' },
  { name: 'receive_file', doc: 'Copy a shared conversation artifact into your computer. params: {"artifactId":"...","path":"report.md"}', gate: 'writes' },
  { name: 'list_files', doc: 'List files in a folder. params: {"path":"src"}', gate: undefined },
  { name: 'read_file', doc: 'Read a text file. params: {"path":"src/x.ts"}', gate: undefined },
  { name: 'search_files', doc: 'Regex search across files. params: {"pattern":"TODO","path":"src"}', gate: undefined },
  { name: 'write_file', doc: 'Create or overwrite a file (documents, notes, code). params: {"path":"notes.md","content":"..."}', gate: 'writes' },
  { name: 'apply_edit', doc: 'Replace exact text in a file. params: {"path":"src/x.ts","oldString":"...","newString":"..."}', gate: 'writes' },
  {
    name: 'run_command',
    doc: 'Run a shell command in your computer. params: {"command":"npm test","timeoutMs":120000}. For a local app server use {"command":"npm run dev","background":true}; inspect/stop its returned id with computer_process.',
    gate: 'shell',
  },
  { name: 'browse', doc: 'Drive the in-app browser: navigate/screenshot/click/type/scroll. params: {"action":"navigate","url":"https://example.com"}', gate: 'browser' },
  { name: 'web_fetch', doc: 'Fetch a public URL and return readable text. params: {"url":"https://example.com"}', gate: undefined },
  {
    name: 'agent_memory',
    doc: 'Persist or recall knowledge across conversations. params: {"action":"remember","text":"User prefers dark mode"} | {"action":"recall","query":"editor"} | {"action":"forget","query":"old fact"}',
    gate: undefined,
  },
  {
    name: 'user_profile',
    doc: 'View or update the shared "About you" team context — update it when the user shares something durable about themselves or asks you to. params: {"action":"view"} | {"action":"update","name":"...","about":"...","preferences":"..."}',
    gate: undefined,
  },
  { name: 'list_skills', doc: 'List available reusable skills. params: {}', gate: undefined },
  { name: 'use_skill', doc: 'Load a skill\'s full instructions into context. params: {"name":"skill-name"}', gate: undefined },
  {
    name: 'create_skill',
    doc: 'Create a reusable skill from a workflow you mastered. params: {"name":"deploy-check","description":"...","instructions":"...","global":true}',
    gate: 'config',
  },
  { name: 'update_skill', doc: 'Improve an existing skill. params: {"name":"deploy-check","instructions":"..."}', gate: 'config' },
  { name: 'list_mcp', doc: 'List configured MCP servers and their tools. params: {}', gate: undefined },
  { name: 'mcp_call', doc: 'Call an MCP tool by its qualified name. params: {"tool":"mcp:server:tool","args":{}}', gate: undefined },
  {
    name: 'configure_mcp',
    doc: 'Add or update an MCP server (command + args) to gain new tool powers. params: {"name":"search","command":"npx","args":["-y","some-mcp-server"],"global":true}',
    gate: 'config',
  },
  { name: 'list_connections', doc: 'List saved provider connections (names and capabilities only, never credentials). params: {}', gate: undefined },
  { name: 'update_connection', doc: 'Update a saved connection profile. params: {"connectionId":"...","label":"..."}', gate: 'config' },
  { name: 'create_project', doc: 'Create a new project folder in the user\'s Projects area. params: {"name":"landing-page"}', gate: 'config' },
  { name: 'schedule_followup', doc: 'Schedule your own future wake-up: you will be woken with this note and can act with your tools. params: {"inMinutes":30,"note":"verify the build and report"} (max 7 days)', gate: undefined },
  { name: 'message_teammate', doc: 'Put a task or message into a teammate\'s inbox — they are woken to act on it. Use for handing off work. params: {"to":"Name","text":"do X and report back"}', gate: undefined },
  { name: 'todo_manage', doc: 'Maintain the visible conversation checklist. params: {"action":"add","text":"Draft report"} | {"action":"start|complete|block|cancel|delete","id":"ct-...","note":"optional"} | {"action":"list"}', gate: undefined },
  { name: 'ask_user', doc: 'Post a real question card and wait for the answer. params: {"question":"Which region?","detail":"Why this is needed","options":["EU","US"]}', gate: undefined },
  { name: 'request_permission', doc: 'Ask the user to enable one capability for you. params: {"permission":"shell|writes|config|host","reason":"exact work that needs it"}. host means use the shared user workspace directly without Docker. Stop and wait after asking.', gate: undefined },
  { name: 'recommend', doc: 'Post a recommendation card the user can accept or dismiss. params: {"title":"Use PostgreSQL","reason":"why","action":"what I will do if accepted"}', gate: undefined },
  {
    name: 'team_manage',
    doc: 'As chief of staff: hire or remove teammates. params: {"action":"create","name":"Scout","tagline":"Research assistant","instructions":"..."} | {"action":"delete","name":"Scout"}',
    gate: 'chief',
  },
];

export function coworkToolDocs(agent: Pick<CoworkAgent, 'allowShell' | 'allowWrites' | 'allowConfig' | 'chiefOfStaff'>, browser: boolean): string {
  const perms: CoworkToolPerms = { allowShell: agent.allowShell, allowWrites: agent.allowWrites, allowConfig: agent.allowConfig, chief: agent.chiefOfStaff, browser };
  return COWORK_TOOLS.filter((t) => (t.gate === undefined || isGated(t.gate, perms)) && (t.name !== 'mcp_call' || (agent.allowConfig && agent.allowShell && agent.allowWrites)))
    .map((t) => `- ${t.name} — ${t.doc}`)
    .join('\n');
}

function isGated(gate: CoworkToolDoc['gate'], perms: CoworkToolPerms): boolean {
  switch (gate) {
    case 'shell':
      return perms.allowShell;
    case 'writes':
      return perms.allowWrites;
    case 'config':
      return perms.allowConfig;
    case 'chief':
      return perms.chief;
    case 'browser':
      return perms.browser;
    default:
      return true;
  }
}

function blocked(tool: string): ToolResult {
  return { ok: false, output: `${tool} is disabled for this agent. The user can enable it in the agent profile.` };
}

/** Dispatch one tool call for a cowork agent. Never throws: every failure is a ToolResult. */
export async function executeCoworkTool(ctx: ToolContext, tool: string, params: Record<string, unknown>, perms: CoworkToolPerms, scope?: CoworkToolScope): Promise<ToolResult> {
  const validation = validateToolParams(tool, params);
  if (!validation.valid && validation.error) return { ok: false, output: `${tool}: ${validation.error}${validation.correction ? `\n${validation.correction}` : ''}` };
  const dispatchHost = (): Promise<ToolResult> => dispatchHostTool(ctx, tool, params, perms, scope);
  try {
    scope?.signal?.throwIfAborted();
    const definition = COWORK_TOOLS.find((t) => t.name === tool);
    if (!definition) return { ok: false, output: `unknown tool "${tool}"` };
    if (!isGated(definition.gate, perms)) return blocked(tool);
    if (scope?.agent.useHostComputer && COMPUTER_ROUTED_TOOLS.includes(tool) && !COMPUTER_ONLY_TOOLS.includes(tool)) {
      params = toHostPaths(params);
      return await dispatchHost();
    }
    if (scope?.computerFor && COMPUTER_ROUTED_TOOLS.includes(tool)) {
      const computer = scope.computerFor(scope.agent.id);
      const result = await computer.execute(tool, params, scope.signal, scope.conversationId, (file) => {
        if (!scope.conversationId) throw new Error('File sharing requires a conversation.');
        const artifact = scope.store.addArtifact({ id: file.artifactId, conversationId: scope.conversationId, agentId: scope.agent.id, name: file.name, dataBase64: file.dataBase64 });
        (scope.artifactIds ??= []).push(artifact.id);
      });
      const computerOnly = COMPUTER_ONLY_TOOLS.includes(tool);
      if (result.ok || computerOnly || computer.status().state !== 'unavailable') return result;
      // The virtual computer cannot start (no Docker, daemon down, …) — the
      // user asked for host fallback: run the tool on the user's computer.
      const first = !scope.hostFallbackNoticed;
      scope.hostFallbackNoticed = true;
      params = toHostPaths(params);
      const host = await dispatchHost();
      return first ? { ...host, output: HOST_FALLBACK_NOTICE + host.output } : host;
    }
    return await dispatchHost();
  } catch (err) {
    return { ok: false, output: `${tool} crashed: ${(err as Error).message}` };
  }
}

/** Host implementations — also the fallback when no virtual computer exists. */
async function dispatchHostTool(ctx: ToolContext, tool: string, params: Record<string, unknown>, perms: CoworkToolPerms, scope?: CoworkToolScope): Promise<ToolResult> {
  {
    switch (tool) {
      case 'list_files':
        return toolListFiles(ctx, params);
      case 'share_file': {
        if (!scope?.conversationId) return { ok: false, output: 'share_file requires a conversation.' };
        const requested = String(params['path'] ?? '');
        const abs = ctx.guard.resolve(requested);
        const info = statSync(abs);
        if (!info.isFile()) return { ok: false, output: 'share_file path is not a file.' };
        if (info.size > 2_000_000) return { ok: false, output: 'share_file exceeds the 2 MB Cowork limit.' };
        const artifact = scope.store.addArtifact({ conversationId: scope.conversationId, agentId: scope.agent.id, name: path.basename(abs), dataBase64: readFileSync(abs).toString('base64') });
        (scope.artifactIds ??= []).push(artifact.id);
        return { ok: true, output: `Presented ${artifact.name}. Artifact id: ${artifact.id}.` };
      }
      case 'receive_file': {
        if (!scope) return { ok: false, output: 'receive_file requires a Cowork session.' };
        const artifactId = String(params['artifactId'] ?? '');
        const source = scope.store.artifactPath(artifactId);
        if (!source) return { ok: false, output: 'Artifact not found.' };
        const target = ctx.guard.resolve(String(params['path'] ?? scope.store.getArtifact(artifactId)?.name ?? 'file'));
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, readFileSync(source));
        return { ok: true, output: `Received artifact ${artifactId} at ${target}.` };
      }
      case 'read_file':
        return toolReadFile(ctx, params);
      case 'search_files':
        return toolSearchFiles(ctx, params);
      case 'write_file':
        if (!perms.allowWrites) return blocked(tool);
        return toolWriteFile(ctx, params);
      case 'apply_edit':
        if (!perms.allowWrites) return blocked(tool);
        return toolApplyEdit(ctx, params);
      case 'run_command':
        if (!perms.allowShell) return blocked(tool);
        return await toolRunCommand(ctx, params);
      case 'browse':
        if (!perms.browser) return blocked(tool);
        return await toolBrowse(ctx, params);
      case 'web_fetch':
        return await toolWebFetch(ctx, params);
      case 'agent_memory':
        return coworkMemory(scope, params);
      case 'user_profile':
        return coworkUserProfile(scope, params);
      case 'list_skills':
        return toolListSkills(ctx);
      case 'use_skill':
        return toolUseSkill(ctx, params);
      case 'create_skill':
        if (!perms.allowConfig) return blocked(tool);
        return toolCreateSkill(ctx, params);
      case 'update_skill':
        if (!perms.allowConfig) return blocked(tool);
        return toolUpdateSkill(ctx, params);
      case 'list_mcp':
        return await toolListMcp(ctx);
      case 'mcp_call': {
        // MCP tools can execute code or mutate external systems; read-only
        // profiles must not bypass their capability switches through MCP.
        if (!perms.allowConfig || !perms.allowShell || !perms.allowWrites) return blocked(tool);
        const manager = ctx.mcp;
        if (!manager) return blocked('mcp_call');
        const qualified = String(params['tool'] ?? '');
        const args = (params['args'] ?? {}) as Record<string, unknown>;
        try {
          const output = await manager.call(qualified, args);
          return { ok: true, output: String(output ?? '(empty result)').slice(0, 8_000) };
        } catch (err) {
          return { ok: false, output: `mcp_call failed: ${(err as Error).message}` };
        }
      }
      case 'configure_mcp':
        if (!perms.allowConfig) return blocked(tool);
        return toolConfigureMcp(ctx, params);
      case 'list_connections':
        return toolListConnections(ctx);
      case 'update_connection':
        if (!perms.allowConfig) return blocked(tool);
        return toolUpdateConnection(ctx, params);
      case 'create_project': {
        if (!perms.allowConfig) return blocked(tool);
        const created = createProject(String(params['name'] ?? ''));
        return { ok: true, output: `Project "${created.name}" created at ${created.path}. Its files can be reached from the main workspace modes.` };
      }
      case 'schedule_followup':
        return coworkScheduleFollowup(scope, params);
      case 'message_teammate':
        return coworkMessageTeammate(scope, params);
      case 'todo_manage':
        return coworkTodoManage(scope, params);
      case 'ask_user':
        return coworkAskUser(scope, params);
      case 'request_permission':
        return coworkRequestPermission(scope, params);
      case 'recommend':
        return coworkRecommend(scope, params);
      case 'team_manage':
        return coworkTeamManage(scope, params);
      default:
        return { ok: false, output: `unknown tool "${tool}"` };
    }
  }
}

function coworkMemory(scope: CoworkToolScope | undefined, params: Record<string, unknown>): ToolResult {
  if (!scope) return { ok: false, output: 'memory is unavailable in this session.' };
  const { agent, memory } = scope;
  const action = String(params['action'] ?? 'recall');
  try {
    if (action === 'remember') {
      const total = memory.remember(agent, String(params['text'] ?? ''));
      return { ok: true, output: `Remembered (${total} memories total): ${String(params['text'] ?? '').trim()}` };
    }
    if (action === 'forget') {
      const removed = memory.forget(agent, String(params['query'] ?? ''));
      return { ok: true, output: removed > 0 ? `Archived ${removed} matching memor${removed === 1 ? 'y' : 'ies'}.` : 'No matching memories of yours were found.' };
    }
    return { ok: true, output: memory.recall(agent, typeof params['query'] === 'string' ? params['query'] : undefined) };
  } catch (err) {
    return { ok: false, output: `agent_memory failed: ${(err as Error).message}` };
  }
}

function coworkUserProfile(scope: CoworkToolScope | undefined, params: Record<string, unknown>): ToolResult {
  if (!scope) return { ok: false, output: 'user_profile is unavailable in this session.' };
  const { store } = scope;
  const action = String(params['action'] ?? 'view');
  try {
    const current = store.userProfile();
    if (action === 'view') {
      const rendered = JSON.stringify(current, null, 2);
      return { ok: true, output: rendered === '{}' ? 'The team context is empty. Use action "update" when the user shares durable information about themselves.' : rendered };
    }
    if (action === 'update') {
      // Merge: only fields the agent explicitly provides change; the rest is
      // preserved so a partial update never wipes existing context.
      const merged = { ...current };
      for (const key of ['name', 'about', 'preferences'] as const) {
        const value = params[key];
        if (typeof value === 'string' && value.trim()) merged[key] = value.trim().slice(0, 2_000);
      }
      const saved = store.saveUserProfile(merged);
      return { ok: true, output: `Saved. The team context now reads:\n${JSON.stringify(saved, null, 2)}` };
    }
    return { ok: false, output: 'user_profile action must be "view" or "update".' };
  } catch (err) {
    return { ok: false, output: `user_profile failed: ${(err as Error).message}` };
  }
}

function coworkScheduleFollowup(scope: CoworkToolScope | undefined, params: Record<string, unknown>): ToolResult {
  if (!scope) return { ok: false, output: 'schedule_followup is unavailable in this session.' };
  const { store, agent } = scope;
  try {
    const minutes = Math.floor(Number(params['inMinutes'] ?? params['minutes'] ?? 0));
    const note = String(params['note'] ?? '').trim();
    if (!note) return { ok: false, output: 'schedule_followup requires a "note" describing what to do when you wake up.' };
    if (!Number.isFinite(minutes) || minutes <= 0) return { ok: false, output: 'schedule_followup requires "inMinutes" — a positive number of minutes.' };
    if (minutes > 10_080) return { ok: false, output: 'schedule_followup: maximum is 7 days (10080 minutes).' };
    const dueAt = new Date(Date.now() + minutes * 60_000).toISOString();
    store.addFollowUp({ conversationId: scope.conversationId ?? '', agentId: agent.id, note, dueAt });
    return { ok: true, output: `Follow-up scheduled. You will be woken in ${minutes} minute(s) with the note: "${note}". Tell the user about this commitment in your reply.` };
  } catch (err) {
    return { ok: false, output: `schedule_followup failed: ${(err as Error).message}` };
  }
}

function coworkMessageTeammate(scope: CoworkToolScope | undefined, params: Record<string, unknown>): ToolResult {
  if (!scope) return { ok: false, output: 'message_teammate is unavailable in this session.' };
  const { store, agent } = scope;
  try {
    const to = String(params['to'] ?? '').trim().toLowerCase();
    const text = String(params['text'] ?? '').trim();
    if (!text) return { ok: false, output: 'message_teammate requires "text".' };
    const target = store.listAgents().find((a) => a.name.toLowerCase() === to);
    if (!target) return { ok: false, output: `No teammate named "${params['to']}". Teammates: ${store.listAgents().map((a) => a.name).join(', ') || 'none'}.` };
    if (target.id === agent.id) return { ok: false, output: 'That is you — just do the work or reply directly.' };
    store.addInbox({ fromAgentId: agent.id, toAgentId: target.id, conversationId: scope.conversationId ?? '', text });
    return { ok: true, output: `Delivered to @${target.name}'s inbox. They will be woken to act on it shortly. Tell the user about the hand-off in your reply.` };
  } catch (err) {
    return { ok: false, output: `message_teammate failed: ${(err as Error).message}` };
  }
}

function coworkTodoManage(scope: CoworkToolScope | undefined, params: Record<string, unknown>): ToolResult {
  if (!scope?.conversationId) return { ok: false, output: 'todo_manage requires a conversation.' };
  const action = String(params['action'] ?? 'list').toLowerCase();
  try {
    if (action === 'list') {
      const todos = scope.store.todos(scope.conversationId).filter((todo) => todo.agentId === scope.agent.id);
      return { ok: true, output: todos.length ? todos.map((todo) => `${todo.id} [${todo.status}] ${todo.text}${todo.note ? ` — ${todo.note}` : ''}`).join('\n') : 'Your todo list is empty.' };
    }
    if (action === 'add') {
      const todo = scope.store.addTodo({ conversationId: scope.conversationId, agentId: scope.agent.id, text: String(params['text'] ?? '') });
      return { ok: true, output: `Added todo ${todo.id}: ${todo.text}.` };
    }
    const id = String(params['id'] ?? '');
    if (!id) return { ok: false, output: `todo_manage action "${action}" requires an id.` };
    if (action === 'delete') return scope.store.removeTodo(id, scope.agent.id) ? { ok: true, output: `Deleted todo ${id}.` } : { ok: false, output: 'Todo not found or owned by another teammate.' };
    const statuses = { start: 'in_progress', complete: 'done', block: 'blocked', cancel: 'cancelled' } as const;
    const status = statuses[action as keyof typeof statuses];
    if (!status) return { ok: false, output: 'todo_manage action must be list, add, start, complete, block, cancel, or delete.' };
    const todo = scope.store.updateTodo(id, scope.agent.id, { status, note: typeof params['note'] === 'string' ? params['note'] : undefined });
    return todo ? { ok: true, output: `Todo ${id} is now ${status}.` } : { ok: false, output: 'Todo not found or owned by another teammate.' };
  } catch (err) {
    return { ok: false, output: `todo_manage failed: ${(err as Error).message}` };
  }
}

function coworkAskUser(scope: CoworkToolScope | undefined, params: Record<string, unknown>): ToolResult {
  if (!scope?.conversationId) return { ok: false, output: 'ask_user requires a conversation.' };
  try {
    const question = String(params['question'] ?? '').trim();
    const detail = String(params['detail'] ?? question).trim();
    const options = Array.isArray(params['options']) ? params['options'].map(String) : [];
    const request = scope.store.addRequest({ conversationId: scope.conversationId, agentId: scope.agent.id, kind: 'question', title: question, detail, options });
    return { ok: true, output: `Question ${request.id} posted. Stop working and tell the user you are waiting for their answer.` };
  } catch (err) {
    return { ok: false, output: `ask_user failed: ${(err as Error).message}` };
  }
}

function coworkRequestPermission(scope: CoworkToolScope | undefined, params: Record<string, unknown>): ToolResult {
  if (!scope?.conversationId) return { ok: false, output: 'request_permission requires a conversation.' };
  const permission = String(params['permission'] ?? '').toLowerCase();
  if (permission !== 'shell' && permission !== 'writes' && permission !== 'config' && permission !== 'host') return { ok: false, output: 'permission must be shell, writes, config, or host.' };
  try {
    const reason = String(params['reason'] ?? '').trim();
    const request = scope.store.addRequest({ conversationId: scope.conversationId, agentId: scope.agent.id, kind: 'permission', title: `Allow ${permission}`, detail: reason, permission });
    return { ok: true, output: `Permission request ${request.id} posted. Stop working and wait for the user to approve or deny it.` };
  } catch (err) {
    return { ok: false, output: `request_permission failed: ${(err as Error).message}` };
  }
}

function coworkRecommend(scope: CoworkToolScope | undefined, params: Record<string, unknown>): ToolResult {
  if (!scope?.conversationId) return { ok: false, output: 'recommend requires a conversation.' };
  try {
    const title = String(params['title'] ?? '').trim();
    const reason = String(params['reason'] ?? '').trim();
    const action = String(params['action'] ?? '').trim();
    const detail = [reason, action ? `If accepted: ${action}` : ''].filter(Boolean).join('\n');
    const request = scope.store.addRequest({ conversationId: scope.conversationId, agentId: scope.agent.id, kind: 'recommendation', title, detail });
    return { ok: true, output: `Recommendation ${request.id} posted. The user can accept or dismiss it.` };
  } catch (err) {
    return { ok: false, output: `recommend failed: ${(err as Error).message}` };
  }
}

function coworkTeamManage(scope: CoworkToolScope | undefined, params: Record<string, unknown>): ToolResult {
  if (!scope) return { ok: false, output: 'team_manage is unavailable in this session.' };
  const { store, agent } = scope;
  if (!agent.chiefOfStaff) return blocked('team_manage');
  const action = String(params['action'] ?? '');
  try {
    if (action === 'create') {
      const name = String(params['name'] ?? '').trim();
      const tagline = typeof params['tagline'] === 'string' ? params['tagline'].trim() : '';
      const instructions = String(params['instructions'] ?? '').trim();
      const created = store.saveAgent({
        name,
        tagline,
        // A chief hiring without a full brief still gets a working teammate;
        // failing here silently (while the chief claims success) is worse.
        systemPrompt: instructions || `You are ${name}${tagline ? `, ${tagline.toLowerCase()}` : ''}. You were hired by ${agent.name} (chief of staff). Ask the user what they need and check your memories for context.`,
        avatar: { color: '#8f80ff', shape: 'cube' },
        provider: agent.provider,
        model: agent.model,
      });
      if (scope.conversationId) {
        const conversation = store.getConversation(scope.conversationId);
        if (conversation?.kind === 'group') store.updateConversation(conversation.id, { memberIds: [...conversation.memberIds, created.id] });
      }
      return {
        ok: true,
        output: `Teammate "${created.name}" created (${created.tagline || 'no tagline'}). ${scope.conversationId && store.getConversation(scope.conversationId)?.kind === 'group' ? `Added to this group. Mention @${created.name} in your reply to have them participate now.` : 'They appear in the team list; the user can open their DM or add them to a group.'} The user manages their permissions and profile.`,
      };
    }
    if (action === 'delete') {
      const name = String(params['name'] ?? '')
        .trim()
        .toLowerCase();
      const target = store.listAgents().find((a) => a.name.toLowerCase() === name);
      if (!target) return { ok: false, output: `No teammate named "${params['name']}".` };
      if (target.id === agent.id) return { ok: false, output: 'You cannot delete yourself.' };
      if (target.chiefOfStaff) return { ok: false, output: `"${target.name}" is a chief of staff — only the user can remove chiefs.` };
      const ok = store.deleteAgent(target.id);
      return ok ? { ok: true, output: `Teammate "${target.name}" removed from the team.` } : { ok: false, output: `Could not remove "${target.name}".` };
    }
    return { ok: false, output: 'team_manage action must be "create" or "delete".' };
  } catch (err) {
    return { ok: false, output: `team_manage failed: ${(err as Error).message}` };
  }
}

const TOOL_MARKER_RE = /<tool>\s*(\{[\s\S]*?\})\s*<\/tool>/g;

export interface ParsedToolCall {
  tool: string;
  params: Record<string, unknown>;
}

/** Extract `<tool>{"name":...,"params":{...}}</tool>` calls from a model reply. */
export function parseToolCalls(text: string): ParsedToolCall[] {
  const calls: ParsedToolCall[] = [];
  for (const match of text.matchAll(TOOL_MARKER_RE)) {
    try {
      const parsed = JSON.parse(match[1]!) as { name?: unknown; tool?: unknown; params?: unknown };
      const name = String(parsed.name ?? parsed.tool ?? '').trim();
      if (!name) continue;
      if (parsed.params !== undefined && (!parsed.params || typeof parsed.params !== 'object' || Array.isArray(parsed.params))) continue;
      calls.push({ tool: name, params: (parsed.params ?? {}) as Record<string, unknown> });
    } catch {
      /* malformed JSON inside a marker: skipped, the model can retry */
    }
  }
  return calls;
}

/** Remove tool markers from the model's prose so they never reach the chat. */
export function stripToolMarkers(text: string, streaming = false): string {
  const visible = text
    .replace(/<tool>[\s\S]*?<\/tool>/gi, '')
    .replace(/<tool[\s>][\s\S]*$/gi, '')
    .replace(/<tool$/i, '')
    .replace(/<\/?tool>/gi, '')
    .trim();
  return streaming ? visible.replace(/<\/?(?:t(?:o(?:o(?:l)?)?)?)?$/i, '').trim() : visible;
}
