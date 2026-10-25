import { nativeCodexPermissions, NATIVE_PERMISSION_PROFILE } from '../coding/native-codex-permissions.js';
import { LlmError, type LlmClient, type LlmMessage, type LlmToolDefinition, type LlmUsage } from '../llm/llm.js';
import type { NativeRecord } from '../llm/native-task.js';
import type { ToolContext } from '../tools/tools.js';
import type { ToolResult } from '../types.js';
import { canonicalJson, sha256 } from '../util.js';
import { executeCoworkTool, type CoworkToolPerms, type CoworkToolScope } from './tools.js';
import { ensureQuestionCard } from './question-cards.js';
import type { CoworkAgent, CoworkNativeSession, CoworkStore } from './store.js';
import { visibleCoworkText } from './visible-text.js';

function record(value: unknown): NativeRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as NativeRecord) : {};
}
const active = new Set<string>();

/** Same native agent loop for chats, missions and temporary workers. */
export async function runNativeCoworkTurn(input: {
  client: LlmClient;
  ctx: ToolContext;
  agent: CoworkAgent;
  conversationId: string;
  threadId?: string;
  purpose?: string;
  messages: LlmMessage[];
  tools: LlmToolDefinition[];
  perms: CoworkToolPerms;
  scope?: CoworkToolScope;
  store?: CoworkStore;
  signal?: AbortSignal;
  onProgress?: (text: string, tool?: string, ok?: boolean, detail?: string, reasoning?: string) => void;
  onTool?: (tool: string, params: NativeRecord, result: ToolResult) => void;
  onUsage?: (usage: LlmUsage) => void;
  beforeTool?: () => void;
  takeSteering?: () => string[];
}): Promise<{ text: string; waiting: boolean }> {
  const runtime = input.client.nativeTask!;
  const key = [input.conversationId, input.agent.id, input.threadId ?? '', input.purpose ?? 'chat'].join(':');
  if (active.has(key)) throw new Error('This native Cowork task is already running.');
  active.add(key);
  const signal = input.signal ?? new AbortController().signal;
  const cwd = input.ctx.guard.activeWritableRoot;
  let session: CoworkNativeSession | undefined = input.store?.nativeCodexSession(key);
  const savedSession = session;
  if (session && session.cwd !== cwd) {
    active.delete(key);
    throw new Error('The native session belongs to a different workspace. Start an explicit new task.');
  }
  const history = input.messages.filter((message) => message.role !== 'system');
  const keys = history.map((message) => sha256(canonicalJson(message)));
  const isAppend = session && session.historyKeys.length <= keys.length && session.historyKeys.every((hash, index) => keys[index] === hash);
  const delta = isAppend ? history.slice(session!.historyKeys.length) : history;
  const images: string[] = [];
  const transcript = delta
    .map((message) => {
      const content =
        typeof message.content === 'string'
          ? message.content
          : message.content
              .map((part) => {
                if (part.type === 'image_url') {
                  images.push(part.image_url.url);
                  return '[attached image]';
                }
                return part.text;
              })
              .join('\n');
      return `${message.role.toUpperCase()}:\n${content}`;
    })
    .join('\n\n');
  const admitted = new Set(session?.admittedCalls ?? []);
  const responses = new Map<string, Promise<NativeRecord>>();
  const repeated = new Map<string, number>();
  const refuse = (reason: string): NativeRecord => {
    const key = 'refusal:' + reason;
    const count = (repeated.get(key) ?? 0) + 1;
    repeated.set(key, count);
    if (count >= 4) throw new Error('Native Codex repeated a denied or waiting request without progress. The session is preserved for review.');
    return { success: false, contentItems: [{ type: 'inputText', text: reason }] };
  };
  let text = '',
    waiting = false,
    narration = '',
    reasoning = '';
  let messageId: string | undefined;
  const persist = (): void => {
    if (session) {
      session.admittedCalls = [...admitted];
      input.store?.saveNativeCodexSession(key, session);
    }
  };
  /** Built-in shell/patch attempts are denied instead of ending the turn: each
   *  attempt yields one visible denial, one steering correction, and the model
   *  continues with guarded functions. A completed built-in file mutation or a
   *  model that keeps attempting native OS execution stops the turn for review. */
  const deniedBuiltins = new Set<string>();
  const denyBuiltinOSItem = async (item: NativeRecord): Promise<void> => {
    const kind = String(item['type']);
    if (kind !== 'commandExecution' && kind !== 'fileChange') return;
    if (kind === 'fileChange' && item['status'] === 'completed')
      throw new Error('Native Cowork changed files through built-in execution instead of Gitu guarded tools. The session is preserved for review.');
    const id = String(item['id'] ?? '');
    if (!id || deniedBuiltins.has(id)) return;
    deniedBuiltins.add(id);
    input.onProgress?.('Built-in OS execution is not available to this teammate; the same operation runs through Gitu guarded functions.');
    try {
      await runtime.steer?.(
        'Built-in OS execution and patching are disabled for this Gitu task. Perform the same operation with the provided Gitu guarded functions (or gitu_cowork for later functions). A denied built-in attempt is not a blocker; continue with guarded functions.',
      );
    } catch {
      /* Losing the correction must not end the turn; denied approvals already inform the model. */
    }
    if (deniedBuiltins.size >= 3)
      throw new Error('Native Cowork kept attempting built-in OS execution instead of Gitu guarded tools. The session is preserved for review.');
  };
  const tools = new Map(input.tools.map((tool) => [tool.name, tool]));
  const dynamicTools = input.tools.map((tool) => ({ type: 'function', name: tool.name, description: tool.description, inputSchema: tool.parameters }));
  dynamicTools.push({
    type: 'function',
    name: 'gitu_cowork',
    description:
      'Call a currently authorized Gitu function by name. This stable entry point supports permission changes between native turns. Gitu still validates the current agent grant.',
    inputSchema: { type: 'object', properties: { tool: { type: 'string' }, params: { type: 'object' } }, required: ['tool', 'params'] },
  });
  const instructions =
    input.messages
      .filter((message) => message.role === 'system')
      .map((message) => (typeof message.content === 'string' ? message.content.replace(/^COMPLETION STATE:.*(?:\r?\n|$)/gm, '') : ''))
      .join('\n\n') +
    '\n\nNATIVE CODEX EXECUTION: You own the agent loop. Call the provided functions directly through code mode. Use gitu_cowork({tool:"name",params:{...}}) when a newly permitted tool is absent from the saved native catalog. Currently permitted functions: ' +
    [...tools.keys()].join(', ') +
    ". Do not emit <tool> markers, <cowork_state> tags or Agent Gitu action JSON. Native turn events manage completion; your final response is readable prose. Direct OS tools are disabled; all effects use the permission-gated Gitu functions. When a built-in shell or patch attempt is denied or unavailable, perform the same operation with the listed guarded functions and continue; a denied built-in attempt is not a blocker. Reuse actual tool results, command job IDs and stored todos. A progress statement is not completion. Publish a final response only after doing the requested work or identifying a concrete blocker. QUESTION CARDS: When you need an answer or choice from the user, call ask_user with the question and useful options. Do not ask for that answer only in plain prose. For website credentials use request_browser_auth; for service credentials use request_credential. Never collect secrets in a question card. On a user question/permission card or app approval, stop work and explain what is awaiting the user. Do not retry unchanged failures. Never use Get-Job with a cmd-N ID; use run_command action=status with that ID.";
  try {
    const result = await runtime.runTurn({
      cwd,
      threadId: session?.threadId,
      text: (savedSession && !isAppend ? 'Updated conversation context (earlier messages were edited; do not replay completed tools):\n' : '') + transcript,
      instructions,
      config: nativeCodexPermissions(input.ctx.guard),
      permissions: NATIVE_PERMISSION_PROFILE,
      signal,
      tools: dynamicTools,
      images,
      effort: input.agent.effort,
      onThread: (threadId) => {
        session = { conversationId: input.conversationId, agentId: input.agent.id, threadId, cwd, historyKeys: savedSession?.historyKeys ?? [], admittedCalls: [...admitted] };
        persist();
      },
      onTurn: (turnId) => {
        session!.turnId = turnId;
        persist();
      },
      onUsage: input.onUsage,
      onEvent: async (method, params) => {
        const guidance = input.takeSteering?.() ?? [];
        if (guidance.length) await runtime.steer?.(guidance.join('\n\n'));
        if (method === 'item/agentMessage/delta') {
          const id = typeof params['itemId'] === 'string' ? params['itemId'] : undefined;
          if (id && messageId && id !== messageId) narration = '';
          if (id) messageId = id;
          narration += String(params['delta'] ?? '');
          input.onProgress?.(visibleCoworkText(narration, true));
        }
        if (method.startsWith('item/reasoning/') && typeof params['delta'] === 'string') {
          reasoning += params['delta'];
          input.onProgress?.(visibleCoworkText(narration, true), undefined, undefined, undefined, reasoning);
        }
        if (method === 'item/started' || method === 'item/completed') {
          const item = record(params['item']);
          if (method === 'item/started' && item['type'] === 'agentMessage') {
            messageId = typeof item['id'] === 'string' ? item['id'] : undefined;
            narration = '';
            reasoning = '';
          }
          await denyBuiltinOSItem(item);
        }
        if (method === 'item/completed') {
          const item = record(params['item']);
          if (item['type'] === 'agentMessage') {
            // A late completion for commentary must not replace a newer item.
            if (messageId && typeof item['id'] === 'string' && item['id'] !== messageId) return;
            const completeText = visibleCoworkText(String(item['text'] ?? ''));
            if (item['phase'] !== 'commentary') text = completeText;
            if (completeText) input.onProgress?.(completeText);
            narration = '';
            reasoning = '';
          }
        }
      },
      onRequest: async (method, params) => {
        signal.throwIfAborted();
        if (method === 'item/commandExecution/requestApproval' || method === 'item/fileChange/requestApproval') {
          input.onProgress?.('Built-in OS execution is disabled for this teammate; the same operation runs through Gitu guarded functions.');
          return { decision: 'decline' };
        }
        if (method !== 'item/tool/call') return method === 'item/permissions/requestApproval' ? { permissions: {}, scope: 'turn' } : { decision: 'decline' };
        if (waiting) return refuse('Waiting for the posted human approval/question. End this turn and wait for the user.');
        const id = String(params['callId'] ?? '');
        if (!id) throw new Error('Native tool call lacks a stable ID.');
        const callKey = String(params['turnId'] ?? '') + ':' + id;
        if (responses.has(callKey)) return responses.get(callKey)!;
        if (admitted.has(callKey))
          return { success: false, contentItems: [{ type: 'inputText', text: 'This call was already admitted before interruption. Inspect state; it will not be replayed.' }] };
        const passedArgs = record(params['arguments']);
        const tool = params['tool'] === 'gitu_cowork' ? String(passedArgs['tool'] ?? '') : String(params['tool'] ?? '');
        if (!tools.has(tool)) return refuse('This function is outside the agent’s grant.');
        input.beforeTool?.();
        admitted.add(callKey);
        persist();
        const args = params['tool'] === 'gitu_cowork' ? record(passedArgs['params']) : passedArgs;
        const work = (async () => {
          input.onProgress?.(visibleCoworkText(narration, true), tool, undefined, JSON.stringify(args));
          const result = await executeCoworkTool(input.ctx, tool, args, input.perms, input.scope);
          input.onTool?.(tool, args, result);
          input.onProgress?.(visibleCoworkText(narration, true), tool, result.ok, result.output);
          // A managed process can legitimately remain running across several
          // polls. Terminal results and unchanged failures still stop loops.
          if (!(tool === 'run_command' && args['action'] === 'status' && result.ok && result.status === 'running')) {
            const signature = sha256(tool + canonicalJson(args) + result.output);
            const count = (repeated.get(signature) ?? 0) + 1;
            repeated.set(signature, count);
            if (count === 3) {
              try { await runtime.steer?.('The same Cowork operation returned an unchanged result three times. Use its saved result, take a different useful action, or explain the concrete blocker. Do not repeat the same failed operation.'); }
              catch { /* A failed correction must not permit an unbounded loop. */ }
            }
            if (count >= 4) throw new Error('Native Codex repeated the same Cowork operation and unchanged result without progress.');
          }
          if (
            result.ok &&
            (['ask_user', 'request_permission', 'computer_handoff', 'request_browser_auth'].includes(tool) ||
              (tool === 'connected_apps' && /^(?:Review \S+ posted\.|Waiting for review \S+\.)/.test(result.output)))
          )
            waiting = true;
          return {
            success: result.ok,
            contentItems: [{ type: 'inputText', text: JSON.stringify(result) }, ...(result.image ? [{ type: 'inputImage', imageUrl: result.image }] : [])],
          };
        })();
        responses.set(callKey, work);
        return work;
      },
    });
    if (result.status !== 'completed') throw new LlmError('Native Cowork turn was interrupted; its session is preserved.', { kind: 'aborted' });
    if (!text.trim()) throw new LlmError('Native Cowork returned no final response. Progress is saved; it was not automatically restarted.', { kind: 'protocol_error' });
    if (!waiting && !input.scope?.isSubAgent) {
      const question = ensureQuestionCard(input.store,input.conversationId,input.agent.id,text);
      if (question) { waiting = true; input.onTool?.('ask_user',{question:question.title,options:question.options},{ok:true,output:'Question '+question.id+' posted. Waiting for the user’s answer.'}); }
    }
    session!.historyKeys = keys;
    persist();
    return { text, waiting };
  } finally {
    active.delete(key);
  }
}
