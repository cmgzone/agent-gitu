/** Model-facing guidance; execution retains the existing capability checks. */
const text = { type: 'string' };
const number = { type: 'number' };
const boolean = { type: 'boolean' };
const object = { type: 'object', additionalProperties: true };
const strings = { type: 'array', items: text };
type Fields = Record<string, Record<string, unknown>>;
const schemas: Record<string, { fields: Fields; required?: string[] }> = {
  computer_status: { fields: {} },
  computer_handoff: { fields: { reason: text }, required: ['reason'] },
  desktop_screenshot: { fields: {} },
  desktop_input: { fields: { action: text, x: number, y: number, endX: number, endY: number, button: number, text, key: text, delta: number, app: text }, required: ['action'] },
  computer_process: { fields: { action: text, id: text }, required: ['action', 'id'] },
  list_files: { fields: { path: text } },
  read_file: { fields: { path: text, offset: number, limit: number, refresh: boolean }, required: ['path'] },
  search_files: { fields: { pattern: text, path: text, mode: text, flags: text, include: strings, exclude: strings, maxResults: number, contextLines: number }, required: ['pattern'] },
  write_file: { fields: { path: text, content: text }, required: ['path', 'content'] },
  apply_edit: { fields: { path: text, oldString: text, newString: text, replaceAll: boolean }, required: ['path', 'oldString', 'newString'] },
  run_command: { fields: { command: text, action: text, id: text, waitMs: number, timeoutMs: number, background: boolean, startupWaitMs: number } },
  browse: { fields: { action: text, url: text, selector: text, text, key: text, path: text, direction: text, timeoutMs: number }, required: ['action'] },
  share_file: { fields: { path: text }, required: ['path'] },
  receive_file: { fields: { artifactId: text, path: text }, required: ['artifactId', 'path'] },
  create_document: { fields: { path: text, title: text, sections: { type: 'array', items: object }, rows: { type: 'array', items: { type: 'array', items: { type: ['string', 'number', 'boolean', 'null'] } } } }, required: ['path'] },
  gitu_task: { fields: { goal: text, mode: text, effort: text, timeoutMinutes: number, maxCostUsd: number }, required: ['goal'] },
  spawn_sub_agent: { fields: { role: text, objective: text, reason: text, budget: object, permissions: object, skills: strings, maxRuntimeMinutes: number }, required: ['role', 'objective', 'reason'] },
  conversation_history: { fields: { query: text, limit: number } },
  search_history: { fields: { query: text, limit: number }, required: ['query'] },
  web_fetch: { fields: { url: text }, required: ['url'] },
  agent_memory: { fields: { action: text, text, query: text }, required: ['action'] },
  user_profile: { fields: { action: text, name: text, about: text, preferences: text }, required: ['action'] },
  list_skills: { fields: {} },
  use_skill: { fields: { name: text }, required: ['name'] },
  create_skill: { fields: { name: text, description: text, instructions: text, global: boolean }, required: ['name', 'description', 'instructions'] },
  update_skill: { fields: { name: text, description: text, instructions: text }, required: ['name'] },
  list_mcp: { fields: {} },
  mcp_call: { fields: { tool: text, args: object }, required: ['tool'] },
  configure_mcp: { fields: { name: text, command: text, args: strings, global: boolean }, required: ['name', 'command'] },
  list_connections: { fields: {} },
  connection_read: { fields: { connectionId: text, operationId: text, operation: object, documentationUrl: text, query: object }, required: ['connectionId'] },
  inspect_connection_response: { fields: { responseId: text, path: text, offset: number, limit: number, fields: strings, search: text, mode: text }, required: ['responseId'] },
  connected_apps: { fields: { action: text, service: text, query: text, cursor: text, reason: text, tool: text, args: object, accountId: text, approvalId: text }, required: ['action'] },
  ssh_exec: { fields: { connectionId: text, command: text }, required: ['connectionId', 'command'] },
  update_connection: { fields: { connectionId: text, label: text }, required: ['connectionId'] },
  create_project: { fields: { name: text }, required: ['name'] },
  schedule_manage: { fields: { action: text, id: text, every: text, goal: text, enabled: boolean }, required: ['action'] },
  schedule_followup: { fields: { inMinutes: number, note: text }, required: ['inMinutes', 'note'] },
  message_teammate: { fields: { to: text, text }, required: ['to', 'text'] },
  todo_manage: { fields: { action: text, text, id: text, note: text }, required: ['action'] },
  folder_manage: { fields: { action: text, path: text, label: text, id: text }, required: ['action'] },
  widget_manage: { fields: { action: text, id: text, title: text, kind: text, icon: text, data: object }, required: ['action'] },
  ask_user: { fields: { question: text, detail: text, options: strings }, required: ['question'] },
  request_credential: { fields: { prompt: text, provider: text, connectionId: text, baseUrl: text, label: text, validationPath: text }, required: ['prompt', 'provider'] },
  request_permission: { fields: { permission: text, reason: text }, required: ['permission', 'reason'] },
  recommend: { fields: { title: text, reason: text, action: text }, required: ['title', 'reason', 'action'] },
  team_manage: { fields: { action: text, name: text, tagline: text, instructions: text, title: text, topic: text, members: strings, chief: text }, required: ['action'] },
};

export function coworkToolSchema(name: string): Record<string, unknown> {
  const schema = schemas[name];
  if (!schema) throw new Error(`Missing Cowork tool schema: ${name}`);
  // Optional extensions remain usable: schemas guide correct parameters but
  // do not invent a second permission policy or restrict routine decisions.
  return { type: 'object', properties: schema.fields, required: schema.required ?? [], additionalProperties: true };
}
