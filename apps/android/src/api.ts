import type { Connection } from './connection';

export class ApiError extends Error {
  constructor(message: string, public readonly status = 0) { super(message); }
}

/** Every native request carries its credential; no browser cookies or URL keys. */
export class AgentApi {
  constructor(readonly connection: Connection) {}
  async request<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
    if (!path.startsWith('/api/')) throw new Error('Invalid agent request.');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort);
    if (signal?.aborted) controller.abort();
    const timer = setTimeout(abort, 30_000);
    try {
      const response = await fetch(this.connection.url + path, {
        method, signal: controller.signal,
        headers: { Authorization: `Bearer ${this.connection.key}`, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new ApiError(response.status === 401 ? 'Your access key was rejected. Open Connections to reconnect.' : data.error || `Your agent could not complete this action (${response.status}).`, response.status);
      return data as T;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted) throw new ApiError('Your agent took too long to respond. Check the connection and try again.');
      throw new ApiError('Cannot reach your agent. Check that your computer or server is online.');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
}

export interface Agent {
  id: string; name: string; tagline: string; systemPrompt: string;
  avatar: { color: string; shape: string }; provider?: string; model?: string; effort?: string;
  skills: string[]; allowShell: boolean; allowWrites: boolean; allowConfig: boolean; useHostComputer: boolean; chiefOfStaff: boolean;
}
export interface Thread { id: string; title: string; topic?: string }
export interface Conversation { id: string; title: string; kind: 'dm' | 'group'; memberIds: string[]; chiefId?: string; threads?: Thread[]; updatedAt: string }
export interface Message {
  id: string; seq: number; role: string; agentId?: string; agentName?: string; text: string; ts: string; threadId?: string; status: string; revision: number; attempt: number;
  checkpoint?: { number: number; accomplished: string; issues?: string; next?: string };
}
export interface RequestCard { id: string; title: string; detail: string; kind: string; status: string; options: string[]; credential?: { providerHint: string; label?: string } }
export interface CoworkSnapshot {
  messages: Message[]; messageUpdates: Message[]; removedMessageIds: string[]; messageChangeSeq: number;
  busy: boolean; working?: { agentName?: string }; threads: Thread[]; activeThreadId?: string; requests: RequestCard[];
  missions: { id: string; goal: string; status: string; progress?: string; result?: string }[];
  todos: { id: string; text?: string; title?: string; status: string }[];
  folders: { id: string; label: string; path: string }[];
  widgets: { id: string; title: string; kind: string; data: Record<string, unknown> }[];
  artifacts: { id: string; name: string; mime: string }[];
}
export interface Run {
  runId: string; goal: string; status: string; startedAt: string; project?: string; projectPath?: string; worktreePath?: string; taskId?: string;
  model?: string; provider?: string; mode?: string; error?: string;
  taggedFolders: string[]; writableFolders: string[];
  pendingApprovals: { id: string; tool: string; why: string; summary: string }[];
  pendingQuestions?: { id: string; questions: { question: string; options: string[] }[] };
  pendingPlanReview?: { id: string; criteria: string[]; steps: { description: string; verification: string }[] };
  pendingConnection?: { id: string; requirement: { providerHint?: string; label?: string; reason?: string } };
  report?: { summary?: string; filesChanged?: string[]; [key: string]: unknown };
  usage?: { contextTokens?: number; contextWindowTokens?: number; costUsd?: number };
  files: { id: string; name: string; mime: string; downloadUrl: string }[];
}
export interface RunEvent { i: number; t: string; text: string; typed?: { type: string; text?: string; path?: string; [key: string]: unknown } }
export interface RunPage { session: Run; events: RunEvent[]; cursor: number; more: boolean }
export interface ModelProvider { id: string; label: string; defaultModel: string; usable: boolean; keyEnvVars: string[]; models: { id: string; metadata?: { contextTokens?: number } }[]; effortLevels?: string[] }
export interface Models { providers: ModelProvider[]; defaultProvider: string }

export function mergeMessages(current: Message[], snapshot: CoworkSnapshot): Message[] {
  const removed = new Set(snapshot.removedMessageIds);
  const rows = new Map(current.filter(row => !removed.has(row.id)).map(row => [row.id, row]));
  for (const row of [...snapshot.messages, ...snapshot.messageUpdates]) if (!removed.has(row.id)) rows.set(row.id, row);
  return [...rows.values()].sort((a, b) => a.seq - b.seq);
}

export function messageId(): string {
  return `phone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
