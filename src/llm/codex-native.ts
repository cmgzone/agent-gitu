import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { codexExecutable, clampSubscriptionEffort, cachedSupportedEfforts } from './codex-subscription.js';
import { LlmError } from './llm.js';
import type { NativeRecord, NativeTaskInput, NativeTaskResult, NativeTaskRuntime } from './native-task.js';

export interface NativeRpc {
  request(method: string, params: NativeRecord): Promise<NativeRecord>;
  onEvent(listener: (method: string, params: NativeRecord) => void): void;
  onRequest(listener: (method: string, params: NativeRecord) => Promise<NativeRecord>): void;
  onFailure(listener: (error: Error) => void): void;
  close(): Promise<void>;
}

function record(value: unknown): NativeRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as NativeRecord) : {};
}

export function nativeConfigToml(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(nativeConfigToml).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.entries(value)
        .map(([key, entry]) => `${JSON.stringify(key)}=${nativeConfigToml(entry)}`)
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}

/** No task deadline and no automatic replay after a transport loss. */
export class CodexNativeRpc implements NativeRpc {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (value: NativeRecord) => void; reject: (error: Error) => void }>();
  private event?: (method: string, params: NativeRecord) => void;
  private serverRequest?: (method: string, params: NativeRecord) => Promise<NativeRecord>;
  private failure?: (error: Error) => void;
  private closed = false;
  private stderr = '';
  private readonly exited: Promise<void>;

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    this.exited = new Promise((resolve) => child.once('close', resolve));
    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      let msg: NativeRecord;
      try {
        msg = record(JSON.parse(line));
      } catch {
        return;
      }
      if (typeof msg['method'] === 'string') {
        const method = msg['method'],
          params = record(msg['params']);
        if (msg['id'] !== undefined) {
          const answer = this.serverRequest?.(method, params) ?? Promise.resolve({ decision: 'decline' });
          void answer.then(
            (result) => this.send({ id: msg['id'], result }),
            () => this.send({ id: msg['id'], error: { code: -32603, message: 'Gitu rejected the request.' } }),
          );
        } else this.event?.(method, params);
        return;
      }
      if (typeof msg['id'] !== 'number') return;
      const pending = this.pending.get(msg['id']);
      if (!pending) return;
      this.pending.delete(msg['id']);
      if (msg['error']) pending.reject(nativeProviderError(record(msg['error'])));
      else pending.resolve(record(msg['result']));
    });
    // Never echo the child's environment or potentially credential-bearing stderr.
    child.stderr.on('data', (chunk: Buffer) => {
      this.stderr = (this.stderr + chunk.toString()).slice(-4000);
    });
    child.once('error', () => this.fail(new LlmError('Could not start the native Codex runtime.', { kind: 'provider_unavailable' })));
    child.once('close', () => {
      lines.close();
      if (!this.closed) {
        const startup = this.stderr.split(/\r?\n/).find((line) => /^error:/i.test(line));
        const detail = startup?.replace(/(?:Bearer\s+\S+|sk-[A-Za-z0-9_-]+)/gi, '[redacted]').slice(0, 500);
        this.fail(
          new LlmError(
            detail ? `Native Codex could not start: ${detail}` : 'Native Codex disconnected. Task progress is saved; resume explicitly to avoid replaying executed tools.',
            { kind: detail ? 'provider_unavailable' : 'network' },
          ),
        );
      }
    });
  }

  static async connect(input: NativeTaskInput): Promise<CodexNativeRpc> {
    const executable = codexExecutable();
    if (!executable) throw new LlmError('Native Codex is unavailable. Update the bundled Codex runtime.', { kind: 'provider_unavailable' });
    // app-server does not support exec's --ignore-user-config flag. Override
    // task authority explicitly and verify the effective profile before tools.
    const args = ['app-server', '--listen', 'stdio://'];
    for (const [key, value] of Object.entries(input.config)) args.push('-c', `${key}=${nativeConfigToml(value)}`);
    const env: NodeJS.ProcessEnv = {};
    for (const key of ['PATH', 'PATHEXT', 'SYSTEMROOT', 'SystemRoot', 'WINDIR', 'COMSPEC', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'CODEX_HOME']) {
      if (process.env[key]) env[key] = process.env[key];
    }
    const rpc = new CodexNativeRpc(spawn(executable, args, { cwd: input.cwd, env, stdio: 'pipe', windowsHide: true, detached: process.platform !== 'win32' }));
    const cancel = (): void => {
      void rpc.close();
    };
    input.signal.addEventListener('abort', cancel, { once: true });
    try {
      await rpc.request('initialize', { clientInfo: { name: 'agent_gitu', title: 'Agent Gitu', version: '0.4.7' }, capabilities: { experimentalApi: true } });
      rpc.send({ method: 'initialized', params: {} });
      return rpc;
    } catch (error) {
      await rpc.close();
      throw error;
    } finally {
      input.signal.removeEventListener('abort', cancel);
    }
  }

  request(method: string, params: NativeRecord): Promise<NativeRecord> {
    if (this.closed) return Promise.reject(new LlmError('Native Codex is closed.', { kind: 'network' }));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ id, method, params });
    });
  }
  onEvent(listener: (method: string, params: NativeRecord) => void): void {
    this.event = listener;
  }
  onRequest(listener: (method: string, params: NativeRecord) => Promise<NativeRecord>): void {
    this.serverRequest = listener;
  }
  onFailure(listener: (error: Error) => void): void {
    this.failure = listener;
  }
  private send(message: NativeRecord): void {
    if (!this.closed) this.child.stdin.write(JSON.stringify(message) + '\n');
  }
  private fail(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
    this.failure?.(error);
  }
  async close(): Promise<void> {
    if (!this.closed) {
      this.closed = true;
      this.fail(new LlmError('Native Codex was stopped.', { kind: 'aborted' }));
      const pid = this.child.pid;
      if (pid && this.child.exitCode === null && this.child.signalCode === null) {
        if (process.platform === 'win32')
          await new Promise<void>((resolve) =>
            execFile('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => {
              this.child.kill();
              resolve();
            }),
          );
        else {
          try {
            process.kill(-pid, 'SIGTERM');
          } catch {
            this.child.kill();
          }
        }
      }
    }
    await this.exited;
  }
}

export function nativeProviderError(error: NativeRecord): LlmError {
  const message = String(error['message'] ?? 'Native Codex turn failed.');
  const code = String(error['codexErrorInfo'] ?? error['code'] ?? '');
  const kind = /quota|usage.limit|credits|limitReached/i.test(message + code)
    ? 'quota_exhausted'
    : /401|unauthor|sign.?in|auth/i.test(message + code)
      ? 'auth'
      : /429|rate.?limit/i.test(message + code)
        ? 'rate_limit_temporary'
        : /network|disconnect|connection/i.test(message + code)
          ? 'network'
          : 'provider_unavailable';
  return new LlmError(message, { kind });
}

/** One app-server turn owns every model/tool round. Gitu never re-asks its final text. */
export class CodexNativeRuntime implements NativeTaskRuntime {
  readonly mode = 'codex-native' as const;
  private rpc?: NativeRpc;
  private active?: { threadId: string; turnId: string };
  private running = false;

  constructor(
    private readonly model: string,
    private readonly connect: (input: NativeTaskInput) => Promise<NativeRpc> = CodexNativeRpc.connect,
  ) {}

  async steer(text: string): Promise<void> {
    if (!this.rpc || !this.active) throw new Error('Native Codex has no active turn to steer.');
    await this.rpc.request('turn/steer', { threadId: this.active.threadId, expectedTurnId: this.active.turnId, input: [{ type: 'text', text }] });
  }

  async runTurn(input: NativeTaskInput): Promise<NativeTaskResult> {
    if (this.running) throw new Error('A native Codex turn is already running for this task.');
    input.signal.throwIfAborted();
    this.running = true;
    let rpc: NativeRpc | undefined;
    let rejectTurn: (error: Error) => void = () => {};
    let resolveTurn: (result: NativeTaskResult) => void = () => {};
    const completion = new Promise<NativeTaskResult>((resolve, reject) => {
      resolveTurn = resolve;
      rejectTurn = reject;
    });
    // Handshake failures can arrive before the supervisor starts awaiting completion.
    void completion.catch(() => {});
    let threadId = '',
      turnId = '',
      events = Promise.resolve();
    let chargedInput = 0,
      chargedOutput = 0,
      chargedCached = 0,
      sawUsage = false;
    const abort = (): void => {
      if (rpc && threadId && turnId) void rpc.request('turn/interrupt', { threadId, turnId }).catch(() => {});
      rejectTurn(new LlmError('Native Codex stopped by user.', { kind: 'aborted' }));
      if (rpc) void rpc.close();
    };
    input.signal.addEventListener('abort', abort, { once: true });
    try {
      rpc = await this.connect(input);
      this.rpc = rpc;
      input.signal.throwIfAborted();
      rpc.onFailure(rejectTurn);
      rpc.onRequest(async (method, params) => {
        if (input.signal.aborted || params['threadId'] !== threadId || (turnId && params['turnId'] !== turnId)) return { decision: 'decline' };
        await events;
        try {
          return await input.onRequest(method, params);
        } catch (error) {
          rejectTurn(error as Error);
          if (rpc) void rpc.close();
          throw error;
        }
      });
      rpc.onEvent((method, params) => {
        if (params['threadId'] !== threadId || (params['turnId'] && turnId && params['turnId'] !== turnId)) return;
        events = events
          .then(async () => {
            input.signal.throwIfAborted();
            await input.onEvent(method, params);
            if (method === 'thread/tokenUsage/updated') {
              const total = record(record(params['tokenUsage'])['total']);
              const nextInput = Number(total['inputTokens'] ?? 0),
                nextOutput = Number(total['outputTokens'] ?? 0),
                nextCached = Number(total['cachedInputTokens'] ?? 0);
              // The first snapshot of a resumed thread includes historical usage.
              // Charge only this turn's deltas, using the last-turn data initially.
              const last = record(record(params['tokenUsage'])['last']);
              const delta = {
                inputTokens: sawUsage ? Math.max(0, nextInput - chargedInput) : Number(last['inputTokens'] ?? nextInput),
                outputTokens: sawUsage ? Math.max(0, nextOutput - chargedOutput) : Number(last['outputTokens'] ?? nextOutput),
                cachedTokens: sawUsage ? Math.max(0, nextCached - chargedCached) : Number(last['cachedInputTokens'] ?? nextCached),
              };
              chargedInput = nextInput;
              chargedOutput = nextOutput;
              chargedCached = nextCached;
              sawUsage = true;
              if (delta.inputTokens || delta.outputTokens || delta.cachedTokens) input.onUsage?.(delta);
            }
            if (method === 'turn/completed') {
              const turn = record(params['turn']);
              if (turnId && turn['id'] !== turnId) return;
              if (turn['status'] === 'failed') rejectTurn(nativeProviderError(record(turn['error'])));
              else if (turn['status'] === 'completed' || turn['status'] === 'interrupted') resolveTurn({ threadId, turnId: String(turn['id']), status: turn['status'] });
            }
          })
          .catch((error) => {
            rejectTurn(error as Error);
            if (rpc) void rpc.close();
          });
      });
      // Disable configured MCP servers by NAME before loading a thread. Never
      // forward configuration values, secrets, or unrelated host tools to the model.
      const current = await rpc.request('config/read', { cwd: input.cwd, includeLayers: false });
      const account = await rpc.request('account/read', { refreshToken: false });
      if (record(account['account'])['type'] !== 'chatgpt')
        throw new LlmError('Native subscription execution requires ChatGPT sign-in. Open provider settings and sign in with ChatGPT; API billing is not used as a fallback.', {
          kind: 'auth',
        });
      const servers = Object.keys(record(record(current['config'])['mcp_servers']));
      const scopedConfig = { ...input.config, ...Object.fromEntries(servers.map((name) => [`mcp_servers.${name}.enabled`, false])) };
      const setup: NativeRecord = {
        model: this.model,
        modelProvider: 'openai',
        cwd: input.cwd,
        runtimeWorkspaceRoots: [input.cwd],
        approvalPolicy: 'on-request',
        approvalsReviewer: 'user',
        permissions: input.permissions,
        developerInstructions: input.instructions,
        config: scopedConfig,
      };
      const result = await rpc.request(input.threadId ? 'thread/resume' : 'thread/start', {
        ...setup,
        ...(input.threadId ? { threadId: input.threadId, excludeTurns: true } : { dynamicTools: input.tools ?? [], ephemeral: false }),
      });
      if (record(result['activePermissionProfile'])['id'] !== input.permissions || result['approvalPolicy'] !== 'on-request' || result['approvalsReviewer'] !== 'user') {
        throw new Error('Native Codex did not confirm Gitu’s permission profile and human approval policy. No execution was started.');
      }
      threadId = String(record(result['thread'])['id'] ?? '');
      if (!threadId) throw new Error('Codex did not return a thread identifier.');
      input.onThread(threadId);
      // Never steal or replay a turn that survived in another runtime.
      if (record(result['thread'])['status'] && record(record(result['thread'])['status'])['type'] === 'active')
        throw new Error('Saved Codex thread is still active. Stop it before resuming.');
      const effectiveEffort = input.effort ? clampSubscriptionEffort(input.effort, cachedSupportedEfforts(this.model)) : undefined;
      const started = await rpc.request('turn/start', {
        threadId,
        input: [{ type: 'text', text: input.text }, ...(input.images ?? []).map((url) => ({ type: 'image', url }))],
        effort: effectiveEffort,
      });
      turnId = String(record(started['turn'])['id'] ?? '');
      if (!turnId) throw new Error('Codex did not return a turn identifier.');
      this.active = { threadId, turnId };
      input.onTurn(turnId);
      input.onSettings?.({ model: this.model, requestedEffort: input.effort, effectiveEffort: effectiveEffort ?? (typeof result['reasoningEffort'] === 'string' ? result['reasoningEffort'] : undefined) });
      input.signal.throwIfAborted();
      return await completion;
    } finally {
      input.signal.removeEventListener('abort', abort);
      this.active = undefined;
      this.rpc = undefined;
      await rpc?.close();
      this.running = false;
    }
  }
}
