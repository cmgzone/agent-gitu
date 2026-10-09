import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';

/**
 * Minimal `codex exec --experimental-json` transport for the ChatGPT
 * subscription bridge.
 *
 * The official SDK cannot pass `--ignore-user-config`. Without that flag the
 * CLI loads the user's own `~/.codex/config.toml`, which exposes their personal
 * MCP servers and plugin tools (browser, computer use, documents…) to the
 * model. Agent Gitu's dispatcher is the only sanctioned execution environment —
 * its tool protocol, permissions and audit trail replace the runtime's — so a
 * subscription turn must run with the user's Codex configuration disabled
 * while authentication still comes from their Codex home. This transport
 * therefore always passes `--ignore-user-config`. The subscription client also
 * disables default app/plugin features and supplies an empty working directory;
 * skipping config.toml alone does not remove those runtime tool surfaces.
 *
 * Event shapes mirror the SDK's `Thread.runStreamed` so callers keep one
 * contract regardless of the transport underneath.
 */

export type CodexExecInput = string | Array<{ type: 'text'; text: string } | { type: 'local_image'; path: string }>;

export interface CodexExecEvent {
  type: string;
  thread_id?: string;
  item?: Record<string, unknown>;
  usage?: Record<string, unknown>;
  error?: { message?: string };
  message?: string;
}

export interface CodexExecThreadConfig {
  executable: string;
  /** Already-serialized `--config key=value` overrides (TOML values). */
  config: string[];
  model: string;
  workingDirectory: string;
  networkAccessEnabled: boolean;
  webSearchMode: string;
  approvalPolicy: string;
  modelReasoningEffort: string;
}

/**
 * The exact `codex exec` argument vector for one turn. Exported so the
 * isolation contract — the run is detached from the user's Codex
 * configuration — is testable without spawning the runtime.
 */
export function execTurnArgs(
  config: CodexExecThreadConfig,
  input: CodexExecInput,
  threadId?: string,
): { args: string[]; prompt: string; images: string[] } {
  const prompt: string[] = [];
  const images: string[] = [];
  if (typeof input === 'string') {
    prompt.push(input);
  } else {
    for (const part of input) {
      if (part.type === 'text') prompt.push(part.text);
      else images.push(part.path);
    }
  }
  const args = [
    'exec',
    '--experimental-json',
    // Run on the application's own configuration: the user's Codex config is
    // theirs, and its tools must never be reachable from an app turn.
    '--ignore-user-config',
    ...config.config.flatMap((override) => ['--config', override]),
    '--model', config.model,
    '--sandbox', 'read-only',
    '--cd', config.workingDirectory,
    '--skip-git-repo-check',
    '--config', `model_reasoning_effort="${config.modelReasoningEffort}"`,
    '--config', `sandbox_workspace_write.network_access=${config.networkAccessEnabled}`,
    '--config', `web_search="${config.webSearchMode}"`,
    '--config', `approval_policy="${config.approvalPolicy}"`,
  ];
  // Same resume form the SDK emits; a continued turn keeps one session.
  if (threadId) args.push('resume', threadId);
  for (const image of images) args.push('--image', image);
  return { args, prompt: prompt.join('\n\n'), images };
}

/** Same exit/error semantics as the SDK: one Error carrying the CLI's stderr. */
export class CodexExecThread {
  private id: string | undefined;

  constructor(private readonly config: CodexExecThreadConfig) {}

  runStreamed(input: CodexExecInput, turnOptions: { signal?: AbortSignal } = {}): { events: AsyncGenerator<CodexExecEvent> } {
    return { events: this.stream(input, turnOptions.signal) };
  }

  private async *stream(input: CodexExecInput, signal?: AbortSignal): AsyncGenerator<CodexExecEvent> {
    const { args, prompt } = execTurnArgs(this.config, input, this.id);
    const env: NodeJS.ProcessEnv = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) env[key] = value;
    }
    // The originator marker the official SDK sets, so Codex-side session
    // metadata attributes these non-interactive turns consistently.
    env['CODEX_INTERNAL_ORIGINATOR_OVERRIDE'] ??= 'codex_sdk_ts';

    const child = spawn(this.config.executable, args, { cwd: this.config.workingDirectory, env, signal, windowsHide: true }) as ChildProcessWithoutNullStreams;
    // The prompt rides stdin, exactly as the SDK delivers it.
    child.stdin.write(prompt);
    child.stdin.end();
    let spawnError: Error | null = null;
    child.once('error', (err) => {
      spawnError = err;
    });
    const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.once('exit', (code, exitSignal) => resolve({ code, signal: exitSignal }));
    });
    const stderr: Buffer[] = [];
    child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));

    const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        let event: CodexExecEvent;
        try {
          event = JSON.parse(line) as CodexExecEvent;
        } catch {
          continue; // non-JSONL chatter on stdout carries no event data
        }
        if (event.type === 'thread.started' && typeof event.thread_id === 'string') this.id = event.thread_id;
        yield event;
      }
      if (spawnError) throw spawnError;
      const { code, signal: exitSignal } = await exited;
      if (code !== 0 || exitSignal) {
        const detail = exitSignal ? `signal ${exitSignal}` : `code ${code ?? 1}`;
        throw new Error(`Codex Exec exited with ${detail}: ${Buffer.concat(stderr).toString('utf8')}`);
      }
    } finally {
      lines.close();
      child.removeAllListeners();
      try {
        if (!child.killed) child.kill();
      } catch {
        /* already gone */
      }
    }
  }
}
