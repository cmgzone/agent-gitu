import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ToolResult } from '../types.js';
import { commandTimeout, deadline } from '../tools/command-timeout.js';

export const COWORK_COMPUTER_IMAGE = 'agent-gitu-cowork:4';
const IMAGE = COWORK_COMPUTER_IMAGE;
const ASSETS = fileURLToPath(new URL('../../assets/cowork-computer/', import.meta.url));
export type ComputerExec = (args: string[], input?: string, signal?: AbortSignal, timeoutMs?: number) => Promise<string>;

export interface CoworkSharedFile {
  artifactId: string;
  name: string;
  dataBase64: string;
}

/** Docker receives argv and stdin separately: agent input never becomes host shell code. */
export const dockerExec: ComputerExec = (args, input, signal, timeoutMs = 120_000) =>
  new Promise((resolve, reject) => {
    const child = spawn('docker', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], signal });
    let output = '';
    let error = '';
    const cancelTimer = deadline(timeoutMs, () => {
      child.kill();
      reject(new Error('Virtual computer operation timed out.'));
    });
    child.stdout.on('data', (data: Buffer) => {
      output += data.toString();
      if (output.length > 8_000_000) {
        child.kill();
        reject(new Error('Virtual computer output exceeded 8 MB.'));
      }
    });
    child.stderr.on('data', (data: Buffer) => {
      error = (error + data.toString()).slice(-8_000);
    });
    child.on('error', (err) => {
      cancelTimer();
      reject(err);
    });
    child.on('close', (code) => {
      cancelTimer();
      if (code === 0) resolve(output);
      else reject(new Error(error || `Docker exited with code ${code}.`));
    });
    child.stdin.on('error', () => {});
    child.stdin.end(input ?? '');
  });

/** Hosted deployments use the restricted desktop broker on their private network. */
export const computerExec: ComputerExec = async (args, input, signal, timeoutMs = 120_000) => {
  const broker = process.env['AGENT_GITU_COMPUTER_BROKER_URL'];
  if (!broker) return dockerExec(args, input, signal, timeoutMs);
  const key = process.env['AGENT_GITU_COMPUTER_BROKER_KEY'];
  if (!key || key.length < 32) throw new Error('The private desktop runtime key is missing.');
  const url = new URL(broker);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('Invalid private desktop runtime address.');
  const timeout = new AbortController();
  const cancel = deadline(timeoutMs, () => timeout.abort(new Error('Virtual computer operation timed out.')));
  try {
    const response = await fetch(new URL('/execute', url), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ args, input, timeoutMs }),
      signal: signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal,
      redirect: 'error',
    });
    const text = await response.text();
    if (text.length > 10_000_000) throw new Error('Virtual computer output exceeded 8 MB.');
    const result = JSON.parse(text) as { output?: string; error?: string };
    if (!response.ok) throw new Error(result.error ?? `Private desktop runtime returned ${response.status}.`);
    return String(result.output ?? '');
  } finally {
    cancel();
  }
};

export function computerCreateArgs(name: string): string[] {
  return [
    'create',
    '--name',
    name,
    '--label',
    'dev.agentgitu.cowork=true',
    '--init',
    '--cpus',
    '2',
    '--memory',
    '2g',
    '--pids-limit',
    '256',
    '--shm-size',
    '256m',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '--mount',
    `type=volume,src=${name}-workspace,dst=/workspace`,
    '--mount',
    `type=volume,src=${name}-home,dst=/home/agent`,
    IMAGE,
  ];
}

export interface ComputerStatus {
  agentId: string;
  name: string;
  state: 'stopped' | 'starting' | 'running' | 'unavailable';
  workspace: string;
  error?: string;
}

/** One persistent container and volume per stable agent id, scoped to this Gitu home. */
export class CoworkComputer {
  readonly name: string;
  private state: ComputerStatus['state'] = 'stopped';
  private error?: string;
  private starting?: Promise<void>;
  private startupAbort?: AbortController;
  /** Recent provisioning failure — lets tool dispatch fail fast (and fall
   *  back to the user's computer) instead of re-probing Docker for 15s on
   *  every call. Retries are allowed again after the cooldown. */
  private lastFailure?: { at: number; message: string };
  private static FAILURE_COOLDOWN_MS = 60_000;
  private readonly active = new Set<AbortController>();
  private static builds = new Map<string, Promise<string>>();

  constructor(
    readonly agentId: string,
    private readonly root: string,
    private readonly exec: ComputerExec = computerExec,
  ) {
    const key = createHash('sha256')
      .update(`${path.resolve(root)}:${agentId}`)
      .digest('hex')
      .slice(0, 24);
    this.name = `gitu-cowork-${key}`;
  }

  status(): ComputerStatus {
    return { agentId: this.agentId, name: this.name, state: this.state, workspace: '/workspace', error: this.error };
  }

  async start(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    if (this.starting) return this.starting;
    if (this.state === 'running') return;
    this.startupAbort = new AbortController();
    const combined = signal ? AbortSignal.any([signal, this.startupAbort.signal]) : this.startupAbort.signal;
    this.starting = this.provision(combined).finally(() => {
      this.starting = undefined;
      this.startupAbort = undefined;
    });
    return this.starting;
  }

  private async provision(signal?: AbortSignal): Promise<void> {
    this.state = 'starting';
    this.error = undefined;
    try {
      await this.exec(['info', '--format', '{{.ServerVersion}}'], undefined, signal, 15_000);
      let exists = false;
      let legacyImage = false;
      try {
        const configuredImage = await this.exec(['container', 'inspect', '--format', '{{.Config.Image}}', this.name], undefined, signal, 15_000);
        exists = true;
        legacyImage = configuredImage.trim() !== IMAGE;
      } catch {
        signal?.throwIfAborted();
      }
      if (!exists || legacyImage) {
        try {
          await this.exec(['image', 'inspect', IMAGE], undefined, signal, 15_000);
        } catch {
          signal?.throwIfAborted();
          let build = CoworkComputer.builds.get(IMAGE);
          if (!build) {
            // Shared build is independent of one chat's Stop; no agent tools run here.
            build = this.exec(['build', '-t', IMAGE, ASSETS], undefined, undefined, 900_000).finally(() => {
              CoworkComputer.builds.delete(IMAGE);
            });
            CoworkComputer.builds.set(IMAGE, build);
          }
          await withAbort(build, signal);
          signal?.throwIfAborted();
        }
        if (legacyImage) {
          // Keep the old container as a recoverable backup. The replacement
          // reuses the same named volumes, preserving files and browser logins.
          await this.exec(['stop', '--time', '2', this.name], undefined, signal);
          await this.exec(['rename', this.name, this.name + '-backup-' + Date.now()], undefined, signal);
          exists = false;
        }
        await this.exec(computerCreateArgs(this.name), undefined, signal);
      }
      // Refresh the small bundled service even for an existing container.
      // Volumes and login sessions stay intact; no image rebuild is needed.
      await this.exec(['cp', path.join(ASSETS, 'server.cjs'), `${this.name}:/computer/server.cjs`], undefined, signal);
      if (exists) await this.exec(['stop', '--time', '2', this.name], undefined, signal);
      await this.exec(['start', this.name], undefined, signal);
      this.state = 'running';
      this.lastFailure = undefined;
    } catch (err) {
      this.state = 'unavailable';
      const guidance =
        process.platform === 'win32' ? 'Install/start Docker Desktop with Linux containers, then retry.' : 'Configure the server’s private desktop runtime, then retry.';
      this.error = `Virtual computer unavailable. ${guidance} ${(err as Error).message}`;
      this.lastFailure = { at: Date.now(), message: this.error };
      throw new Error(this.error);
    }
  }

  async stop(): Promise<void> {
    this.startupAbort?.abort();
    for (const controller of this.active) controller.abort();
    if (this.starting) await this.starting.catch(() => {});
    if (this.state === 'running') await this.exec(['stop', '--time', '2', this.name], undefined, undefined, 15_000);
    this.state = 'stopped';
  }

  /** Screen reads never provision, restart or wake a stopped teammate. */
  async desktopScreenshot(signal?: AbortSignal): Promise<ToolResult> {
    if (this.state !== 'running') return { ok: false, output: this.error || 'Start this private desktop to view its screen.' };
    try {
      return await this.request('desktop_screenshot', {}, signal);
    } catch (error) {
      signal?.throwIfAborted();
      // An externally stopped/crashed container must be restartable from the
      // viewer. A failed capture alone does not interrupt a healthy computer.
      const running = await this.exec(['container', 'inspect', '--format', '{{.State.Running}}', this.name], undefined, signal, 15_000).catch(() => 'unknown');
      if (running.trim() === 'false') this.state = 'stopped';
      throw error;
    }
  }

  /** Human input never starts or wakes a stopped desktop. */
  async desktopInput(params: Record<string, unknown>, signal?: AbortSignal): Promise<ToolResult> {
    if (this.state !== 'running') return { ok: false, output: 'Start this private desktop before controlling it.' };
    return this.request('desktop_input', params, signal);
  }

  private async request(tool: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<ToolResult> {
    const id = randomUUID();
    const controller = new AbortController();
    this.active.add(controller);
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const invoke = `let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',async()=>{try{let r;for(let i=0;i<300;i++){try{r=await fetch('http://127.0.0.1:8765',{method:'POST',headers:{'x-gitu-key':require('node:fs').readFileSync('/tmp/gitu-computer-key','utf8')},body:s});break}catch(e){if(i===299)throw e;await new Promise(r=>setTimeout(r,100))}}console.log(await r.text())}catch(e){console.error(e.message);process.exitCode=1}})`;
    const cancel = () => {
      // Killing docker exec alone does not stop commands inside the container.
      void this.exec(
        [
          'exec',
          this.name,
          'node',
          '-e',
          `fetch('http://127.0.0.1:8765/cancel',{method:'POST',headers:{'x-gitu-key':require('node:fs').readFileSync('/tmp/gitu-computer-key','utf8')},body:process.argv[1]}).catch(()=>{})`,
          id,
        ],
        undefined,
        undefined,
        10_000,
      ).catch(() => {});
    };
    combined.addEventListener('abort', cancel, { once: true });
    try {
      combined.throwIfAborted();
      // The service owns command deadlines. The transport must not terminate
      // long commands first; cancellation still reaches the container process.
      const timeout = tool === 'run_command' ? commandTimeout(params['timeoutMs']) : 120_000;
      const result = await this.exec(['exec', '-i', this.name, 'node', '-e', invoke], JSON.stringify({ id, tool, params }), combined, timeout ? timeout + 20_000 : 0);
      combined.throwIfAborted();
      return JSON.parse(result) as ToolResult;
    } catch (err) {
      cancel();
      throw err;
    } finally {
      combined.removeEventListener('abort', cancel);
      this.active.delete(controller);
    }
  }

  async execute(
    tool: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
    conversationId?: string,
    onSharedFile?: (file: CoworkSharedFile) => void,
  ): Promise<ToolResult> {
    try {
      signal?.throwIfAborted();
      if (tool === 'computer_status') return { ok: true, output: JSON.stringify(this.status()) };
      // A recent provisioning failure is retried only after the cooldown, so
      // callers can fall back to the user's computer without 15s Docker probes
      // on every tool call.
      if (this.state === 'unavailable' && this.lastFailure && Date.now() - this.lastFailure.at < CoworkComputer.FAILURE_COOLDOWN_MS) {
        throw new Error(this.lastFailure.message);
      }
      await this.start(signal);
      if (tool === 'share_file' || tool === 'receive_file') {
        if (!conversationId || !/^[\w-]+$/.test(conversationId)) throw new Error('File sharing requires a conversation.');
        const folder = path.join(this.root, 'artifacts', conversationId);
        if (tool === 'share_file') {
          const exported = await this.request('export_file', params, signal);
          if (!exported.ok) return exported;
          const artifactId = randomUUID();
          const name = path.basename(String(params['path'] ?? 'file'));
          mkdirSync(folder, { recursive: true });
          writeFileSync(path.join(folder, `${artifactId}.json`), JSON.stringify({ agentId: this.agentId, path: params['path'], data: exported.output }));
          onSharedFile?.({ artifactId, name, dataBase64: exported.output });
          return { ok: true, output: `Shared ${String(params['path'])}. Artifact id: ${artifactId}. Teammates in this conversation can use receive_file with this id.` };
        }
        const artifactId = String(params['artifactId'] ?? '');
        if (!/^[a-f0-9-]{36}$/.test(artifactId)) throw new Error('Invalid artifact id.');
        const artifact = JSON.parse(readFileSync(path.join(folder, `${artifactId}.json`), 'utf8')) as { data: string };
        return await this.request('import_file', { path: params['path'], data: artifact.data }, signal);
      }
      const result = await this.request(tool, params, signal);
      return tool === 'desktop_screenshot' && result.ok ? { ok: true, output: 'Private Linux desktop screen (1280x800).', image: 'data:image/png;base64,' + result.output } : result;
    } catch (err) {
      return { ok: false, output: (err as Error).message };
    }
  }
}

function withAbort<T>(work: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return work;
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error('Stopped.'));
    signal.addEventListener('abort', abort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
