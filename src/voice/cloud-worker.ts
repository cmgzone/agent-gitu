import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { setTimeout as pause } from 'node:timers/promises';
import { ensureGituHome } from '../workspace/home.js';
import { readJson, writeJson } from '../util.js';
import type { LiveKitConfiguration } from './livekit.js';
import { installVoiceNetwork } from './network.js';

export interface VoiceWorkerStatus { phase: 'idle' | 'deploying' | 'ready' | 'failed'; message: string; agentId?: string; diagnostic?: { step: string; code: string }; }
interface WorkerRecord { url: string; name: string; agentId: string; hash?: string; }
interface CloudAgent { agentId: string; agentName?: string; agentDeployments?: { status?: string; agentName?: string }[]; }
interface Upload { agentId?: string; presignedUrl?: string; presignedPostRequest?: { url: string; values: Record<string, string> }; }
const WORKER_FILES = ['Dockerfile', 'package.json', 'package-lock.json', 'agent.mjs'] as const;
// CloudAgent requires the protocol version header used by LiveKit's Cloud SDK.
// Keep this aligned with https://github.com/livekit/livekit-cli/releases/tag/v2.18.8.
const CLOUD_PROTOCOL_VERSION = '2.18.8';

// Twirp defaults to protobuf field names; some installations enable camelCase JSON.
function cloudResponse<T>(method: string, data: Record<string, unknown>): T {
  if (method === 'ListAgents') {
    const agents = Array.isArray(data.agents) ? data.agents as Record<string, unknown>[] : [];
    return { agents: agents.map(agent => ({
      agentId: agent.agentId ?? agent.agent_id,
      agentName: agent.agentName ?? agent.agent_name,
      agentDeployments: ((agent.agentDeployments ?? agent.agent_deployments ?? []) as Record<string, unknown>[]).map(item => ({ status: item.status, agentName: item.agentName ?? item.agent_name })),
    })) } as T;
  }
  if (method === 'CreateAgent' || method === 'DeployAgent') return { ...data, agentId: data.agentId ?? data.agent_id, presignedUrl: data.presignedUrl ?? data.presigned_url, presignedPostRequest: data.presignedPostRequest ?? data.presigned_post_request } as T;
  return data as T;
}

/** Upload only the bundled bridge, never user projects, keys, or conversation history. */
export function voiceWorkerSource(root = fileURLToPath(new URL('../../voice-worker/', import.meta.url))): { archive: Buffer; hash: string } {
  const parts: Buffer[] = [], hash = createHash('sha256');
  for (const name of WORKER_FILES) {
    const body = readFileSync(path.join(root, name)), header = Buffer.alloc(512);
    hash.update(name).update(body);
    header.write(name, 0); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
    header.write(body.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136);
    header.fill(32, 148, 156); header.write('0', 156); header.write('ustar\0', 257); header.write('00', 263);
    const sum = header.reduce((total, byte) => total + byte, 0);
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    parts.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  parts.push(Buffer.alloc(1024));
  return { archive: gzipSync(Buffer.concat(parts)), hash: hash.digest('hex') };
}

// LiveKit's CloudAgent API uses a separate admin grant, never a browser room token.
function cloudToken(config: LiveKitConfiguration): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const data = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ iss: config.apiKey, nbf: now - 5, exp: now + 300, agent: { admin: true } });
  return data + '.' + createHmac('sha256', config.apiSecret).update(data).digest('base64url');
}

/** The deployment protocol follows LiveKit's official cloudagents SDK. */
export class LiveKitCloudWorker {
  private state: VoiceWorkerStatus = { phase: 'idle', message: 'Voice setup is ready to start.' };
  private pending?: Promise<void>;
  private controller?: AbortController;
  private project?: string;
  private readyUntil = 0;
  private step = 'worker files';
  constructor(private readonly fetcher: typeof fetch = fetch, private readonly source = voiceWorkerSource) {}
  status(): VoiceWorkerStatus { return { ...this.state }; }
  async close(): Promise<void> { this.controller?.abort(); await this.pending?.catch(() => undefined); this.state = { phase: 'idle', message: 'Voice setup is ready to start.' }; }
  ensure(config: LiveKitConfiguration): Promise<void> {
    installVoiceNetwork();
    const project = config.url + '/' + config.agentName + '/' + createHash('sha256').update(config.apiKey).update('\0').update(config.apiSecret).digest('hex');
    if (this.pending) return this.project === project ? this.pending : Promise.reject(new Error('Finish the current voice setup before switching projects.'));
    if (this.project === project && this.state.phase === 'ready' && Date.now() < this.readyUntil) return Promise.resolve();
    this.project = project;
    this.controller = new AbortController();
    this.step = 'worker files';
    this.state = { phase: 'deploying', message: 'Preparing your LiveKit Cloud voice worker…' };
    const pending = this.deploy(config, this.controller.signal).then(() => { this.readyUntil = Date.now() + 5 * 60_000; }).catch(error => {
      const failure = error as { name?: string; code?: string; cause?: { code?: string } };
      const rawCode = typeof failure.cause?.code === 'string' ? failure.cause.code : typeof failure.code === 'string' ? failure.code : failure.name ?? 'UNKNOWN';
      const code = /^[a-zA-Z0-9_]{1,64}$/.test(rawCode) ? rawCode : 'UNKNOWN';
      const message = error instanceof CloudSetupError ? error.message : code === 'ENOENT' ? 'Gitu’s bundled voice-worker files are missing. Update or reinstall Gitu, then retry.' : /CERT|TLS|SSL/.test(code) ? 'Gitu could not verify LiveKit’s secure connection. Check the computer clock and trusted certificates, then retry.' : 'Voice setup failed during ' + this.step + ' (' + code + '). Retry, or check the connection if it persists.';
      this.state = { ...this.state, phase: 'failed', message, diagnostic: { step: this.step, code } };
      console.error('[voice-cloud] Setup failed:', this.step, code);
      if (error instanceof CloudSetupError && error.detail) console.error('[voice-cloud] Provider reason:', error.detail);
      throw new Error(this.state.message);
    }).finally(() => { if (this.pending === pending) this.pending = undefined; });
    this.pending = pending;
    return pending;
  }
  private async deploy(config: LiveKitConfiguration, signal: AbortSignal): Promise<void> {
    if (!/^[\w-]+\.livekit\.cloud$/.test(new URL(config.url).hostname)) {
      this.state = { phase: 'ready', message: 'Using your existing self-hosted voice worker.' }; return;
    }
    const host = 'https://agents.livekit.cloud';
    const headers = () => ({ authorization: 'Bearer ' + cloudToken(config), 'content-type': 'application/json', 'X-LIVEKIT-CLI-VERSION': CLOUD_PROTOCOL_VERSION });
    const rpc = async <T>(method: string, body: unknown): Promise<T> => {
      this.step = method;
      let response: Response | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await this.fetcher(host + '/twirp/livekit.CloudAgent/' + method, { method: 'POST', headers: headers(), body: JSON.stringify(body), signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]), redirect: 'error' });
          break;
        } catch (error) {
          const failure = error as NodeJS.ErrnoException & { cause?: NodeJS.ErrnoException };
          // DNS failure happens before transmission, so even CreateAgent is safe to retry.
          if (signal.aborted || attempt === 2 || !['EAI_AGAIN', 'ENOTFOUND'].includes(failure.cause?.code ?? failure.code ?? '')) throw error;
          this.state.message = 'Retrying the LiveKit connection…';
          await pause(500 * 2 ** attempt, undefined, { signal });
        }
      }
      if (!response) throw new Error('No LiveKit response.');
      if (!response.ok) {
        const details = await response.json().catch(() => ({})) as Record<string, unknown>;
        const providerCode = typeof details.code === 'string' && /^[a-z_]{1,32}$/.test(details.code) ? details.code : '';
        const code = 'HTTP_' + response.status + (providerCode ? '_' + providerCode : '');
        const reason = response.status === 401 || response.status === 403 ? 'LiveKit rejected the project credentials or agent-deployment access. Check the project API key and secret.' : response.status === 402 || response.status === 429 ? 'LiveKit requires available deployment capacity or billing for this project. Check the project dashboard, then retry.' : 'LiveKit rejected the voice setup request. Check the project dashboard and retry.';
        const detail = typeof details.msg === 'string' ? details.msg.split(config.apiKey).join('[redacted]').split(config.apiSecret).join('[redacted]').replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[redacted token]').slice(0, 400) : undefined;
        throw new CloudSetupError(reason + ' (' + code + ')', code, detail);
      }
      return cloudResponse<T>(method, await response.json() as Record<string, unknown>);
    };
    const file = path.join(ensureGituHome().settings, 'livekit-voice-worker.json');
    const saved = readJson<WorkerRecord>(file);
    let record = saved?.url === config.url && saved.name === config.agentName ? saved : undefined;
    const source = this.source();
    const list = await rpc<{ agents?: CloudAgent[] }>('ListAgents', record ? { agentId: record.agentId } : {});
    const agents = list.agents ?? [];
    const matching = record ? agents.find(agent => agent.agentId === record!.agentId) : agents.find(agent => agent.agentName === config.agentName || agent.agentDeployments?.some(item => item.agentName === config.agentName));
    const running = (agent: CloudAgent) => agent.agentDeployments?.some(item => /running|ready/i.test(item.status ?? ''));
    if (matching && (!record || record.hash === source.hash) && running(matching)) {
      this.state = { phase: 'ready', message: 'Voice is ready.', agentId: matching.agentId }; return;
    }
    if (record && !matching) record = undefined;
    const secret = { name: 'GITU_VOICE_AGENT_NAME', value: Buffer.from(config.agentName).toString('base64'), kind: 'AGENT_SECRET_KIND_ENVIRONMENT' };
    let upload: Upload;
    if (record) upload = await rpc<Upload>('DeployAgent', { agentId: record.agentId, secrets: [secret] });
    else {
      const settings = await rpc<{ params?: { name: string; value: string }[] }>('GetClientSettings', {});
      const values = Object.fromEntries((settings.params ?? []).map(item => [item.name, item.value]));
      const regions = (values.available_regions || 'us-east').split(',').map(value => value.trim()).filter(Boolean);
      const warnings = (values.residency_warning_regions ?? '').split(',');
      const region = regions.find(value => value === values.project_data_region) ?? regions.find(value => !warnings.includes(value)) ?? regions[0]!;
      upload = await rpc<Upload>('CreateAgent', { secrets: [secret], regions: [region] });
      if (!upload.agentId) throw new CloudSetupError('LiveKit did not return a voice deployment. Retry setup.');
      record = { url: config.url, name: config.agentName, agentId: upload.agentId };
      writeJson(file, record); // Keep the ID before building so retries reuse this deployment.
    }
    this.state.agentId = record.agentId;
    const destination = upload.presignedPostRequest?.url ?? upload.presignedUrl;
    if (!destination || new URL(destination).protocol !== 'https:') throw new CloudSetupError('LiveKit did not provide a secure build upload. Retry setup.');
    installVoiceNetwork(new URL(destination).hostname);
    let body: NonNullable<RequestInit['body']>, method: string, uploadHeaders: Record<string, string>;
    if (upload.presignedPostRequest) {
      const form = new FormData();
      for (const [key, value] of Object.entries(upload.presignedPostRequest.values)) form.append(key, value);
      form.append('file', new Blob([new Uint8Array(source.archive)], { type: 'application/gzip' }), upload.presignedPostRequest.values.key || 'upload.tar.gz');
      body = form; method = 'POST'; uploadHeaders = {};
    } else { body = new Uint8Array(source.archive); method = 'PUT'; uploadHeaders = { 'content-type': 'application/gzip' }; }
    this.step = 'source upload';
    const uploaded = await this.fetcher(destination, { method, headers: uploadHeaders, body, signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]), redirect: 'error' });
    if (!uploaded.ok) throw new CloudSetupError('The voice-worker upload failed. Retry setup; your existing deployment will be reused.');
    this.state.message = 'LiveKit is building your voice worker…';
    this.step = 'Cloud build';
    const built = await this.fetcher(host + '/build?agent_id=' + encodeURIComponent(record.agentId), { method: 'POST', headers: { ...headers(), 'X-LIVEKIT-BUILD-PROTOCOL': 'v2' }, signal: AbortSignal.any([signal, AbortSignal.timeout(15 * 60_000)]), redirect: 'error' });
    if (!built.ok || !built.body) throw new CloudSetupError('LiveKit could not start the voice build. Check the project dashboard and retry.');
    const reader = built.body.getReader(), decoder = new TextDecoder();
    let tail = '';
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      tail = (tail + decoder.decode(value, { stream: true })).slice(-32_000);
      if (/BUILD ERROR:|"error"\s*:\s*"[^"\s]/.test(tail)) { await reader.cancel(); throw new CloudSetupError('The LiveKit voice build failed. View its build log in the project dashboard, then retry.'); }
    }
    writeJson(file, { ...record, hash: source.hash });
    this.state.message = 'Starting your voice worker…';
    for (let attempt = 0; attempt < 30; attempt++) {
      const result = await rpc<{ agents?: CloudAgent[] }>('ListAgents', { agentId: record.agentId });
      if (result.agents?.some(running)) { this.state = { phase: 'ready', message: 'Voice is ready.', agentId: record.agentId }; return; }
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 2000);
        const abort = () => { clearTimeout(timer); reject(new Error('Setup interrupted.')); };
        signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort();
      });
    }
    throw new CloudSetupError('The voice worker is still starting in LiveKit Cloud. Try the call again shortly.');
  }
}
class CloudSetupError extends Error {
  constructor(message: string, readonly code?: string, readonly detail?: string) { super(message); }
}
