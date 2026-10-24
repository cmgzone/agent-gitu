import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, statSync, writeFileSync, writeSync,createReadStream,rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'undici';
import type { ToolResult } from '../types.js';
import { commandTimeout, deadline } from '../tools/command-timeout.js';
import {dockerBinary,validateComputerChunk,type ComputerBinary} from './file-transport.js';
import { QuotaVolumes } from './quota-volumes.js';
import { gituHomeRoot } from '../workspace/home.js';

export const COWORK_COMPUTER_IMAGE = 'agent-gitu-cowork:9';
const IMAGE = COWORK_COMPUTER_IMAGE;
const ASSETS = fileURLToPath(new URL('../../assets/cowork-computer/', import.meta.url));
// A 20 MB binary attachment becomes about 27 MB when carried as base64 JSON.
export const MAX_COMPUTER_MESSAGE_BYTES = Infinity;
export type ComputerExec = ((args: string[], input?: string, signal?: AbortSignal, timeoutMs?: number) => Promise<string>) & {binary?:ComputerBinary};

export interface CoworkSharedFile {
  artifactId: string;
  name: string;
  dataBase64?: string;
  sourcePath?: string;
}

/** Docker receives argv and stdin separately: agent input never becomes host shell code. */
export const dockerExec: ComputerExec = async (args, input, signal, timeoutMs = 120_000) => {
  if (args[0] === 'gitu-quota') {
    const owner = args[3] ?? 'gitu-local-' + createHash('sha256').update(path.resolve(gituHomeRoot())).digest('hex').slice(0, 24);
    await new QuotaVolumes(process.env['AGENT_GITU_COMPUTER_QUOTA_ROOT'], owner).prepare(args[1]!, Number(args[2]), signal);
    return 'quota-ready';
  }
  const program = args[1] === '-i' ? 3 : 2;
  if (args[0] === 'exec' && /^gitu-cowork-[a-f0-9]{24}$/.test(args[program - 1] ?? '') && args[program] === 'node') args = [...args.slice(0, program), '/computer/quota-guard', ...args.slice(program)];
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], signal });
    let output = '';
    let error = '';
    const cancelTimer = deadline(timeoutMs, () => {
      child.kill();
      reject(new Error('Virtual computer operation timed out.'));
    });
    child.stdout.on('data', (data: Buffer) => {
      output += data.toString();
      if (output.length > MAX_COMPUTER_MESSAGE_BYTES) {
        child.kill();
        reject(new Error('Virtual computer transfer exceeded its size limit.'));
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
};

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
    const response = await request(new URL('/execute', url), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ args, input, timeoutMs }),
      signal: signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal,
      // Fetch imposes a separate five-minute response-header timeout. A first
      // desktop image build or a long command can legitimately take longer;
      // the operation deadline and caller cancellation above own that budget.
      headersTimeout: 0,
      bodyTimeout: 0,
    });
    const text = await response.body.text();
    if (text.length > MAX_COMPUTER_MESSAGE_BYTES) throw new Error('Virtual computer transfer exceeded its size limit.');
    const result = JSON.parse(text) as { output?: string; error?: string };
    if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(result.error ?? `Private desktop runtime returned ${response.statusCode}.`);
    return String(result.output ?? '');
  } finally {
    cancel();
  }
};

/** Explicit hosted selection must never fall through to a local Docker host. */
computerExec.binary=async(request,input,signal)=>{
  validateComputerChunk(request,input);const broker=process.env['AGENT_GITU_COMPUTER_BROKER_URL'];if(!broker)return dockerBinary(request,input,signal);
  const key=process.env['AGENT_GITU_COMPUTER_BROKER_KEY'];if(!key||key.length<32)throw new Error('The private desktop runtime key is missing.');
  const url=new URL('/file-chunks',broker);url.search=new URLSearchParams({metadata:JSON.stringify(request)}).toString();
  const response=await fetch(url,{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/octet-stream'},body:input??Buffer.alloc(0),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000),redirect:'error'});
  if(!response.ok)throw new Error('Private desktop file transport failed ('+response.status+').');
  const chunks:Buffer[]=[];let size=0;for await(const chunk of response.body!){const data=Buffer.from(chunk);size+=data.length;if(size>5*1024*1024)throw new Error('Private desktop chunk exceeded its transport limit.');chunks.push(data);}return Buffer.concat(chunks,size);
};
dockerExec.binary=dockerBinary;
export const hostedComputerExec: ComputerExec = (args, input, signal, timeoutMs) => {
  if (!process.env['AGENT_GITU_COMPUTER_BROKER_URL']) return Promise.reject(new Error('Gitu cloud is not configured on this server. Choose a saved cloud connection.'));
  return computerExec(args, input, signal, timeoutMs);
};
hostedComputerExec.binary=(request,input,signal)=>{if(!process.env['AGENT_GITU_COMPUTER_BROKER_URL'])return Promise.reject(new Error('Gitu cloud is not configured on this server.'));return computerExec.binary!(request,input,signal);};

export function computerCreateArgs(name: string,limits:{cpu?:number;memoryMb?:number;diskMb?:number}={}): string[] {
  return [
    'create',
    '--name',
    name,
    '--label',
    'dev.agentgitu.cowork=true',
    '--init',
    '--cpus',
    String(limits.cpu??2),
    '--memory',
    limits.memoryMb?limits.memoryMb+'m':'2g',
    '--pids-limit',
    '256',
    '--shm-size',
    '256m',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    ...(limits.diskMb ? ['--read-only', '--tmpfs', '/tmp:rw,nosuid,nodev,size=' + Math.min(512, Math.max(64, Math.floor((limits.memoryMb ?? 2048) / 4))) + 'm,mode=1777'] : []),
    '--mount',
    `type=volume,src=${name}-workspace,dst=/workspace`,
    '--mount',
    `type=volume,src=${name}-home,dst=/home/agent`,
    ...(limits.diskMb?['--env','GITU_DISK_LIMIT_MB='+limits.diskMb]:[]),
    IMAGE,
  ];
}

/** Stable, machine-readable cause of an unavailable desktop. The Desktop
 *  panel switches on this instead of parsing the human-readable message. */
export type ComputerUnavailableReason =
  | 'runtime_not_installed'
  | 'browser_missing'
  | 'display_start_failed'
  | 'stream_failed'
  | 'operation_not_supported'
  | 'disk_quota_unavailable'
  | 'timeout'
  | 'unknown';

export interface ComputerStatus {
  agentId: string;
  name: string;
  state: 'stopped' | 'starting' | 'running' | 'sleeping' | 'unavailable';
  control?: 'shared' | 'user';
  handoff?: { reason: string; requestId?: string };
  workspace: string;
  error?: string;
  /** Present only while unavailable; classifies `error`. */
  reason?: ComputerUnavailableReason;
}

/** Classify a provisioning failure from the broker/runtime error text.
 *  Kept in one place so the codes stay stable across client and panel. */
function classifyUnavailable(message: string): ComputerUnavailableReason {
  const text = message.toLowerCase();
  if (/disk quota|quota-backed|quota directory|quota server|xfs/.test(text)) return 'disk_quota_unavailable';
  if (text.includes('unsupported desktop operation')) return 'operation_not_supported';
  if (/docker|container runtime|command not found|enoent|cannot connect to the docker daemon/.test(text)) return 'runtime_not_installed';
  if (/chromium|chrome|browser/.test(text)) return 'browser_missing';
  if (/display|xvfb|x11|vnc|novnc|stream/.test(text)) return 'display_start_failed';
  if (/timed out|timeout|aborted/.test(text)) return 'timeout';
  return 'unknown';
}

/** One persistent container and volume per stable agent id, scoped to this Gitu home. */
export class CoworkComputer {
  readonly name: string;
  private _state: ComputerStatus['state'] = 'stopped';
  private get state():ComputerStatus['state']{return this._state;}
  private set state(value:ComputerStatus['state']){this._state=value;this.runtime.onState?.(value);}
  private error?: string;
  private control: 'shared' | 'user' = 'shared';
  private handoff?: ComputerStatus['handoff'];
  private readonly controlFile: string;
  /** Machine-readable companion to `error`, cleared on a successful start. */
  private reason?: ComputerUnavailableReason;
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
    private readonly runtime: { key: string; cloud?: boolean; beforeStart?:()=>void;onState?:(state:ComputerStatus['state'])=>void;onControl?:()=>void;limits?:()=>{cpu:number;memoryMb:number;diskMb:number};maxFileBytes?: () => number|null; resolveArtifact?: (id:string,conversationId:string)=>string|undefined } = { key: 'default' },
  ) {
    const key = createHash('sha256')
      .update(`${path.resolve(root)}:${agentId}`)
      .digest('hex')
      .slice(0, 24);
    this.name = `gitu-cowork-${key}`;
    this.controlFile = path.join(root, 'computer-control', key + '.json');
    if (existsSync(this.controlFile)) {
      // A damaged control file must never silently grant the agent control.
      this.control = 'user';
      try {
        const saved = JSON.parse(readFileSync(this.controlFile, 'utf8')) as { control?: string; handoff?: ComputerStatus['handoff'] };
        if (saved.control === 'shared') this.control = 'shared';
        else if (typeof saved.handoff?.reason === 'string') this.handoff = {
          reason: saved.handoff.reason.slice(0, 500),
          requestId: typeof saved.handoff.requestId === 'string' ? saved.handoff.requestId : undefined,
        };
      } catch { this.handoff = { reason: 'Desktop control could not be restored. Return control when ready.' }; }
    }
  }

  status(): ComputerStatus {
    return { agentId: this.agentId, name: this.name, state: this.state, control: this.control, handoff: this.handoff, workspace: '/workspace', error: this.error, reason: this.reason };
  }

  setControl(control: 'shared' | 'user', reason?: string, requestId?: string): void {
    const handoff = control === 'user' && reason ? { reason: reason.slice(0, 500), requestId: requestId ?? this.handoff?.requestId } : undefined;
    mkdirSync(path.dirname(this.controlFile), { recursive: true });
    writeFileSync(this.controlFile + '.tmp', JSON.stringify({ control, handoff }), { mode: 0o600 });
    renameSync(this.controlFile + '.tmp', this.controlFile);
    this.control = control; this.handoff = handoff;
    this.runtime.onControl?.();
    if (control === 'user') for (const controller of this.active) controller.abort(new Error('The user has taken control of the desktop.'));
  }

  async sleep(): Promise<void> {
    if (this.state !== 'running') throw new Error('Start the desktop before putting it to sleep.');
    this.setControl('user', 'Desktop is sleeping. Wake it when you are ready.');
    await this.exec(['pause', this.name], undefined, undefined, 15_000);
    this.state = 'sleeping';
  }

  private clearSleepingHandoff(): void {
    if (this.control === 'user' && this.handoff?.reason === 'Desktop is sleeping. Wake it when you are ready.') {
      this.setControl('user', 'You have control. Return to agent when you are finished.', this.handoff.requestId);
    }
  }

  async start(signal?: AbortSignal): Promise<void> {
    signal?.throwIfAborted();
    if (this.starting) return this.starting;
    if (this.state === 'running') return;
    if (this.state === 'sleeping' && (await this.exec(['container', 'inspect', '--format', '{{.Config.Image}}', this.name], undefined, signal, 15_000)).trim() === IMAGE) {
      await this.exec(['unpause', this.name], undefined, signal, 15_000);
      this.state = 'running'; this.clearSleepingHandoff(); return;
    }
    this.startupAbort = new AbortController();
    const combined = signal ? AbortSignal.any([signal, this.startupAbort.signal]) : this.startupAbort.signal;
    this.starting = this.provision(combined).finally(() => {
      this.starting = undefined;
      this.startupAbort = undefined;
    });
    return this.starting;
  }

  private async provision(signal?: AbortSignal): Promise<void> {
    this.error = undefined;
    this.reason = undefined;
    try {
      this.runtime.beforeStart?.();this.state='starting';
      await this.exec(['info', '--format', '{{.ServerVersion}}'], undefined, signal, 15_000);
      if (this.runtime.limits) {
        const quota = await this.exec(['gitu-quota', this.name, String(this.runtime.limits().diskMb)], undefined, signal, 120000);
        if (quota.trim() !== 'quota-ready') throw new Error('Private computer disk quota could not be verified. Configure a quota-backed computer server before starting.');
      }
      let exists = false;
      let legacyImage = false;
      try {
        const configuredImage = await this.exec(['container', 'inspect', '--format', '{{.Config.Image}}', this.name], undefined, signal, 15_000);
        exists = true;
        legacyImage = configuredImage.trim() !== IMAGE;
      } catch {
        signal?.throwIfAborted();
      }
      if (exists && !legacyImage && this.runtime.limits) {
        const limits = this.runtime.limits();
        const configured = JSON.parse(await this.exec(['container', 'inspect', '--format', '{{json .HostConfig}}', this.name], undefined, signal, 15_000)) as { NanoCpus?: number; Memory?: number; ReadonlyRootfs?: boolean };
        legacyImage = configured.NanoCpus !== limits.cpu * 1_000_000_000 || configured.Memory !== limits.memoryMb * 1024 * 1024 || configured.ReadonlyRootfs !== true;
      }
      if (!exists || legacyImage) {
        try {
          await this.exec(['image', 'inspect', IMAGE], undefined, signal, 15_000);
        } catch {
          signal?.throwIfAborted();
          const buildKey = this.runtime.key + ':' + IMAGE;
          let build = CoworkComputer.builds.get(buildKey);
          if (!build) {
            // Shared build is independent of one chat's Stop; no agent tools run here.
            build = this.exec(['build', '-t', IMAGE, ASSETS], undefined, undefined, 900_000).finally(() => {
              CoworkComputer.builds.delete(buildKey);
            });
            CoworkComputer.builds.set(buildKey, build);
          }
          await withAbort(build, signal);
          signal?.throwIfAborted();
        }
        if (legacyImage) {
          // Keep the old container as a recoverable backup. The replacement
          // reuses the same named volumes, preserving files and browser logins.
          if ((await this.exec(['container', 'inspect', '--format', '{{.State.Status}}', this.name], undefined, signal, 15_000)).trim() === 'paused') await this.exec(['unpause', this.name], undefined, signal, 15_000);
          await this.exec(['stop', '--time', '2', this.name], undefined, signal);
          await this.exec(['rename', this.name, this.name + '-backup-' + Date.now()], undefined, signal);
          exists = false;
        }
        await this.exec(computerCreateArgs(this.name,this.runtime.limits?.()), undefined, signal);
      }
      // Refresh the small bundled service even for an existing container.
      // Volumes and login sessions stay intact; no image rebuild is needed.
      if (!this.runtime.limits) await this.exec(['cp', path.join(ASSETS, 'server.cjs'), `${this.name}:/computer/server.cjs`], undefined, signal);
      if (exists) {
        if ((await this.exec(['container', 'inspect', '--format', '{{.State.Status}}', this.name], undefined, signal, 15_000)).trim() === 'paused') await this.exec(['unpause', this.name], undefined, signal, 15_000);
        await this.exec(['stop', '--time', '2', this.name], undefined, signal);
      }
      await this.exec(['start', this.name], undefined, signal);
      this.state = 'running';
      this.clearSleepingHandoff();
      this.lastFailure = undefined;
    } catch (err) {
      this.state = 'unavailable';
      const guidance =
        this.runtime.cloud ? 'Check the saved cloud server connection and Docker on that server, then retry.' : process.platform === 'win32' ? 'Install/start Docker Desktop with Linux containers, then retry.' : 'Configure the server’s private desktop runtime, then retry.';
      const detail = (err as Error).message;
      this.reason = classifyUnavailable(detail);
      this.error = `Virtual computer unavailable. ${guidance} ${detail}`;
      this.lastFailure = { at: Date.now(), message: this.error };
      throw new Error(this.error);
    }
  }

  async stop(): Promise<void> {
    this.startupAbort?.abort();
    for (const controller of this.active) controller.abort();
    if (this.starting) await this.starting.catch(() => {});
    if(this.state==='stopped'||this.state==='unavailable')await this.refreshStatus(true);
    if(this.state==='unavailable')throw new Error('Cannot confirm that this private computer has stopped. Reconnect its server before releasing its capacity.');
    if (this.state === 'sleeping') { await this.exec(['unpause', this.name], undefined, undefined, 15_000); this.state = 'running'; }
    if (this.state === 'running') await this.exec(['stop', '--time', '2', this.name], undefined, undefined, 15_000);
    this.state = 'stopped';
  }

  /** Restore paused/running state after an app restart without waking it. */
  async refreshStatus(reconcile=false): Promise<ComputerStatus> {
    if (this.state !== 'starting' && (reconcile || this.state !== 'unavailable')) {
      try {
        const state = (await this.exec(['container', 'inspect', '--format', '{{.State.Status}}', this.name], undefined, undefined, 15_000)).trim();
        if (this.state === 'stopped' && ['paused', 'running'].includes(state)) {
          const image = (await this.exec(['container', 'inspect', '--format', '{{.Config.Image}}', this.name], undefined, undefined, 15_000)).trim();
          if (image !== IMAGE) return this.status();
        }
        if (state === 'paused') this.state = 'sleeping';
        else if (state === 'running') { this.state = 'running'; this.clearSleepingHandoff(); }
        else if (['created', 'exited', 'dead'].includes(state)) this.state = 'stopped';
      } catch (error) {
        if (/no such|not found/i.test((error as Error).message)) this.state = 'stopped';
        else if(reconcile){this.state='unavailable';this.error='Cannot reconcile the private computer. Check its runtime connection before continuing.';}
      }
    }
    return this.status();
  }

  /** Screen reads never provision, restart or wake a stopped teammate. */
  async desktopScreenshot(signal?: AbortSignal, format: 'png' | 'jpeg' = 'png'): Promise<ToolResult> {
    if (this.state !== 'running') return { ok: false, output: this.error || 'Start this private desktop to view its screen.' };
    try {
      return await this.request('desktop_screenshot', { format }, signal);
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
      if (this.state === 'stopped' && this.control === 'user') await this.refreshStatus();
      if (this.state === 'sleeping') return { ok: false, output: 'The user put this desktop to sleep. Wait for them to wake it; do not switch computers.' };
      if (this.control === 'user' && ['desktop_input', 'browse', 'run_command', 'computer_process', 'write_file', 'apply_edit', 'receive_file'].includes(tool)) return { ok: false, output: 'The user has control of this desktop. Wait for the handoff response or ask_user; do not interact with their apps or fall back to another computer.' };
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
          const info=await this.request('file_transfer_info',{path:params['path']},signal);if(!info.ok)return info;
          const details=JSON.parse(info.output) as {size:number;mtime:number};
          if(!Number.isSafeInteger(details.size)||details.size<0||!Number.isFinite(details.mtime))throw new Error('Private computer returned invalid file metadata.');
          const limit=this.runtime.maxFileBytes?.()??null;if(limit!==null&&details.size>limit)throw new Error('File exceeds your selected file-size limit.');
          const name = path.posix.basename(String(params['path'] ?? 'file'));
          mkdirSync(folder, { recursive: true });
          const key=createHash('sha256').update(JSON.stringify([this.agentId,params['path'],details])).digest('hex'),checkpointPath=path.join(folder,`transfer-${key}.json`);
          let transfer:{id:string;offset:number};
          try{transfer=JSON.parse(readFileSync(checkpointPath,'utf8')) as {id:string;offset:number};if(!/^[a-f0-9-]{36}$/.test(transfer.id))throw new Error('Invalid checkpoint.');}catch{transfer={id:randomUUID(),offset:0};}
          const artifactId=transfer.id,sourcePath=path.join(folder,`${artifactId}.transfer`),fd=openSync(sourcePath,existsSync(sourcePath)?'r+':'w');
          try{while(transfer.offset<details.size){const length=Math.min(5*1024*1024,details.size-transfer.offset);let bytes:Buffer;if(this.exec.binary)bytes=await this.exec.binary({name:this.name,path:String(params['path']),offset:transfer.offset,length,write:false},undefined,signal);else{const chunk=await this.request('file_transfer_read',{path:params['path'],offset:transfer.offset,length},signal);if(!chunk.ok)throw new Error(chunk.output);bytes=Buffer.from(chunk.output,'base64');}if(!bytes.length||bytes.length>details.size-transfer.offset)throw new Error('Invalid file transfer.');writeSync(fd,bytes,0,bytes.length,transfer.offset);transfer.offset+=bytes.length;writeFileSync(checkpointPath,JSON.stringify(transfer));}}finally{closeSync(fd);}
          const current=await this.request('file_transfer_info',{path:params['path']},signal);if(!current.ok||current.output!==info.output)throw new Error('File changed during transfer. Retry after it stops changing.');
          const checksum=await this.request('file_transfer_checksum',{path:params['path']},signal),hash=createHash('sha256');for await(const chunk of createReadStream(sourcePath))hash.update(chunk);if(!checksum.ok||hash.digest('hex')!==checksum.output)throw new Error('Private computer transfer checksum mismatch.');
          onSharedFile?.({ artifactId, name, sourcePath });
          if(onSharedFile){rmSync(sourcePath,{force:true});rmSync(checkpointPath,{force:true});}
          return { ok: true, output: `Attached ${name} to chat with Open/Download controls. Artifact id: ${artifactId}. Teammates in this conversation can use receive_file with this id.` };
        }
        const artifactId = String(params['artifactId'] ?? '');
        if (!/^[\w-]{8,100}$/.test(artifactId)) throw new Error('Invalid artifact id.');
        const sharedPath=path.join(folder,artifactId+'.transfer');
        const sourcePath=this.runtime.resolveArtifact?.(artifactId,conversationId)??(!this.runtime.resolveArtifact&&existsSync(sharedPath)?sharedPath:undefined);
        if(sourcePath){
          const size=statSync(sourcePath).size,limit=this.runtime.maxFileBytes?.()??null;if(limit!==null&&size>limit)throw new Error('File exceeds your selected file-size limit.');
          const destination=String(params['path']??path.basename(sourcePath)),temporary=path.posix.join(path.posix.dirname(destination),`.gitu-transfer-${artifactId}.part`);
          const info=await this.request('file_transfer_info',{path:temporary},signal);let offset=info.ok?Number((JSON.parse(info.output) as {size:number}).size):0;if(offset>size)offset=0;
          const fd=openSync(sourcePath,'r');try{while(offset<size){const bytes=Buffer.alloc(Math.min(5*1024*1024,size-offset));const count=readSync(fd,bytes,0,bytes.length,offset);if(!count)throw new Error('File changed during transfer.');if(this.exec.binary)await this.exec.binary({name:this.name,path:temporary,offset,length:count,write:true},bytes.subarray(0,count),signal);else{const written=await this.request('file_transfer_write',{path:temporary,offset,data:bytes.subarray(0,count).toString('base64')},signal);if(!written.ok)throw new Error(written.output);}offset+=count;}}finally{closeSync(fd);}
          if(size===0){const written=await this.request('file_transfer_write',{path:temporary,offset:0,data:''},signal);if(!written.ok)return written;}
          const hash=createHash('sha256');for await(const chunk of createReadStream(sourcePath))hash.update(chunk);
          return await this.request('file_transfer_finish',{path:temporary,destination,size,checksum:hash.digest('hex')},signal);
        }
        const artifact = JSON.parse(readFileSync(path.join(folder, `${artifactId}.json`), 'utf8')) as { data: string };
        return await this.request('import_file', { path: params['path'], data: artifact.data }, signal);
      }
      const result = await this.request(tool, tool === 'desktop_screenshot' ? { ...params, format: 'png' } : params, signal);
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
