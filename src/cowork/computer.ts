import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ToolResult } from '../types.js';
import { commandTimeout, deadline } from '../tools/command-timeout.js';

const IMAGE = 'agent-gitu-cowork:1';
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
    private readonly exec: ComputerExec = dockerExec,
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
      try {
        await this.exec(['container', 'inspect', this.name], undefined, signal, 15_000);
        exists = true;
      } catch {
        signal?.throwIfAborted();
      }
      if (!exists) {
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
        await this.exec(
          [
            'create',
            '--name',
            this.name,
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
            `type=volume,src=${this.name}-workspace,dst=/workspace`,
            '--mount',
            `type=volume,src=${this.name}-home,dst=/home/agent`,
            IMAGE,
          ],
          undefined,
          signal,
        );
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
      this.error = `Virtual computer unavailable. Install/start Docker Desktop with Linux containers, then retry. ${(err as Error).message}`;
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

  private async request(tool: string, params: Record<string, unknown>, signal?: AbortSignal): Promise<ToolResult> {
    const id = randomUUID();
    const controller = new AbortController();
    this.active.add(controller);
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const invoke = `let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',async()=>{try{let r;for(let i=0;i<50;i++){try{r=await fetch('http://127.0.0.1:8765',{method:'POST',headers:{'x-gitu-key':require('node:fs').readFileSync('/tmp/gitu-computer-key','utf8')},body:s});break}catch(e){if(i===49)throw e;await new Promise(r=>setTimeout(r,100))}}console.log(await r.text())}catch(e){console.error(e.message);process.exitCode=1}})`;
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
      return await this.request(tool, params, signal);
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
