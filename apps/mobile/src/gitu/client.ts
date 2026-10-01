import type { EventPage, FileListing, Project, Run, TeamConversation, TeamRoster, TeamView, Teammate } from './types';

export function normalizeServerUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Enter the full server address, including http:// or https://.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    throw new Error('Use a server address such as https://gitu.example.com, without a path or credentials.');
  }
  return url.origin;
}

/** Access keys are held in memory and sent only to the selected server. */
export class GituApi {
  readonly baseUrl: string;
  private sessionCookie?: string;
  constructor(
    baseUrl: string,
    private key: string,
    private password?: string,
    private email?: string,
  ) {
    this.baseUrl = normalizeServerUrl(baseUrl);
  }
  async request<T>(path: string, body?: unknown, method?: string, signal?: AbortSignal): Promise<T> {
    if (!path.startsWith('/api/')) throw new Error('Invalid Gitu API route.');
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 20_000);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: method ?? (body === undefined ? 'GET' : 'POST'),
        headers: { Authorization: `Bearer ${this.key}`, ...(this.sessionCookie ? { Cookie: this.sessionCookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        credentials: 'include',
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        redirect: 'error',
      });
      const text = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error('The server did not return a Gitu response. Check its address and version.');
      }
      if (!response.ok) {
        const detail = (payload as { error?: unknown })?.error;
        if ((payload as { code?: string })?.code === 'APP_LOCKED') throw new Error('Your app session is locked. Disconnect and sign in again with your app password.');
        throw new Error(
          response.status === 401 && !path.startsWith('/api/auth/')
            ? 'Access key rejected. Check the key configured on your Gitu server.'
            : typeof detail === 'string'
              ? detail
              : `Request failed (${response.status}).`,
        );
      }
      // Browsers manage HttpOnly cookies themselves. Native transports expose
      // Set-Cookie; retain only the app session cookie, in memory, for this host.
      const cookie = response.headers.get('set-cookie')?.match(/(?:^|,\s*)gitu_session=([a-f0-9]{64});/);
      if (cookie) this.sessionCookie = `gitu_session=${cookie[1]}`;
      return payload as T;
    } catch (error) {
      if (controller.signal.aborted && !signal?.aborted) throw new Error('The server took too long to respond. Try again.');
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  async connect(): Promise<void> {
    const auth = await this.request<{ required: boolean; configured: boolean; requiresEmail: boolean; authenticated: boolean }>('/api/auth/status');
    if (auth.required && !auth.configured) { this.password = undefined; throw new Error('Create the app password on the computer running Agent Gitu first.'); }
    if (auth.configured && !auth.authenticated) {
      if (!this.password) throw new Error('Enter the app password you created on your Gitu computer.');
      if (auth.requiresEmail && !this.email) throw new Error('Enter the email address you registered on your Gitu computer.');
      try { await this.request('/api/auth/login', { password: this.password, email: this.email }); }
      finally { this.password = undefined; }
    } else this.password = undefined;
    const status = await this.request<{ app: string; mobileProtocol: number }>('/api/mobile/status');
    if (status.app !== 'Agent Gitu' || status.mobileProtocol !== 1) throw new Error('This server does not support the Gitu mobile companion.');
  }
  async disconnect(): Promise<void> {
    try { await this.request('/api/auth/logout', {}); }
    finally { this.sessionCookie = undefined; this.password = undefined; this.email = undefined; this.key = ''; }
  }
  runs(signal?: AbortSignal) {
    return this.request<Run[]>('/api/runs', undefined, undefined, signal);
  }
  events(id: string, after = -1, signal?: AbortSignal) {
    return this.request<EventPage>(`/api/mobile/runs/${encodeURIComponent(id)}/events?after=${after}`, undefined, undefined, signal);
  }
  start(goal: string, projectPath: string, mode: 'agent' | 'chat', provider?: string, model?: string) {
    return this.request<{ runId: string }>('/api/runs', {
      goal,
      projectPath,
      mode,
      provider: provider || undefined,
      model: model || undefined,
      autoApprove: false,
      review: mode === 'agent',
    });
  }
  message(id: string, text: string) {
    return this.request(`/api/runs/${encodeURIComponent(id)}/message`, { text });
  }
  stop(id: string) {
    return this.request(`/api/runs/${encodeURIComponent(id)}/stop`, {});
  }
  approve(id: string, approved: boolean) {
    return this.request(`/api/approvals/${encodeURIComponent(id)}`, { approved });
  }
  review(id: string, approved: boolean, note: string) {
    return this.request(`/api/plan-review/${encodeURIComponent(id)}`, { approved, note });
  }
  answer(id: string, answer: string) {
    return this.request(`/api/answers/${encodeURIComponent(id)}`, { answer });
  }
  async teams(signal?: AbortSignal): Promise<TeamRoster> {
    const [roster, chats] = await Promise.all([
      this.request<{ agents: Teammate[] }>('/api/cowork/agents', undefined, undefined, signal),
      this.request<{ conversations: TeamConversation[] }>('/api/cowork/conversations', undefined, undefined, signal),
    ]);
    return { agents: roster.agents, conversations: chats.conversations };
  }
  saveTeammate(input: Partial<Teammate> & { name: string; systemPrompt: string }) {
    return this.request<{ agent: Teammate }>('/api/cowork/agents', input);
  }
  createTeamChat(memberIds: string[], title?: string, chiefId?: string) {
    return this.request<{ conversation: TeamConversation }>('/api/cowork/conversations', { kind: memberIds.length > 1 ? 'group' : 'dm', memberIds, title, chiefId });
  }
  teamChat(id: string, threadId?: string, signal?: AbortSignal) {
    // A complete snapshot also reconciles edits/deletions made in desktop Cowork.
    return this.request<TeamView>(
      `/api/cowork/conversations/${encodeURIComponent(id)}/messages?thread=${encodeURIComponent(threadId || 'main')}&rosterRevision=0`,
      undefined,
      undefined,
      signal,
    );
  }
  sendTeamMessage(id: string, messageId: string, text: string, threadId?: string) {
    return this.request<{ message: TeamView['messages'][number] }>(`/api/cowork/conversations/${encodeURIComponent(id)}/messages`, { id: messageId, text, threadId });
  }
  stopTeamChat(id: string) {
    return this.request(`/api/cowork/conversations/${encodeURIComponent(id)}/stop`, {});
  }
  createTeamThread(id: string, title: string) {
    return this.request<{ thread: { id: string; title: string } }>(`/api/cowork/conversations/${encodeURIComponent(id)}/threads`, { title });
  }
  resolveTeamRequest(id: string, action: 'approve' | 'deny' | 'answer' | 'accept' | 'dismiss', response?: string) {
    return this.request(`/api/cowork/requests/${encodeURIComponent(id)}`, { action, response });
  }
  async projects(signal?: AbortSignal): Promise<Project[]> {
    const [current, home, runs] = await Promise.all([
      this.request<{ name: string; repoRoot: string }>('/api/project', undefined, undefined, signal),
      this.request<{ workspace: string; projectsPath: string }>('/api/home', undefined, undefined, signal),
      this.runs(signal),
    ]);
    const managed = await this.request<{ dirs: string[] }>(`/api/browse?path=${encodeURIComponent(home.projectsPath)}`, undefined, undefined, signal);
    const entries = [
      { name: current.name, path: current.repoRoot },
      { name: 'Gitu workspace', path: home.workspace },
      ...managed.dirs.map((directory) => ({ name: directory.split(/[\\/]/).pop()!, path: directory })),
      ...runs.filter((run) => run.projectPath).map((run) => ({ name: run.project || run.projectPath!.split(/[\\/]/).pop()!, path: run.projectPath! })),
    ];
    const unique = new Map<string, Project>();
    for (const item of entries) if (item.path && !unique.has(item.path)) unique.set(item.path, item);
    return [...unique.values()];
  }
  files(root: string, path = '', signal?: AbortSignal) {
    return this.request<FileListing>(`/api/mobile/files?root=${encodeURIComponent(root)}&path=${encodeURIComponent(path)}`, undefined, undefined, signal);
  }
  saveFile(file: FileListing, content: string) {
    return this.request('/api/mobile/files', { root: file.root, path: file.path, revision: file.revision, content, approved: true }, 'PUT');
  }
}

export function mergeEvents(previous: EventPage['events'], incoming: EventPage['events']): EventPage['events'] {
  const rows = new Map(previous.map((row) => [row.i, row]));
  for (const row of incoming) rows.set(row.i, row);
  return [...rows.values()].sort((a, b) => a.i - b.i).slice(-2000);
}
