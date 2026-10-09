import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveKitCloudWorker, voiceWorkerRoot, voiceWorkerSource } from '../src/voice/cloud-worker.js';

const config = { url: 'wss://test-project.livekit.cloud', apiKey: 'test-key', apiSecret: 'test-secret-for-deployment-tests', agentName: 'gitu-voice' };
it('resolves all four worker files from the installed Electron resources', () => {
  const resources = mkdtempSync(path.join(tmpdir(), 'gitu-worker-resources-')), worker = path.join(resources, 'voice-worker');
  try {
    mkdirSync(worker);
    for (const name of ['Dockerfile', 'package.json', 'package-lock.json', 'agent.mjs']) copyFileSync(path.resolve('voice-worker', name), path.join(worker, name));
    expect(voiceWorkerRoot(resources)).toBe(worker);
    const archive = gunzipSync(voiceWorkerSource(voiceWorkerRoot(resources)).archive).toString();
    expect(archive).toContain('package-lock.json'); expect(archive).toContain('agent.mjs');
    const configuration = JSON.parse(readFileSync('package.json', 'utf8')).build;
    expect(configuration.extraResources).toContainEqual(expect.objectContaining({ from: 'voice-worker', to: 'voice-worker', filter: expect.arrayContaining(['package-lock.json']) }));
  } finally { rmSync(resources, { recursive: true, force: true }); }
});
let home: string, oldHome: string | undefined;
beforeEach(() => { home = mkdtempSync(path.join(tmpdir(), 'gitu-cloud-worker-')); oldHome = process.env.AGENT_GITU_HOME; process.env.AGENT_GITU_HOME = home; });
afterEach(() => { if (oldHome === undefined) delete process.env.AGENT_GITU_HOME; else process.env.AGENT_GITU_HOME = oldHome; rmSync(home, { recursive: true, force: true }); });

function cloud(protoNames = false) {
  let registered = false, ready = false, failUpload = false;
  const requests: { url: string; init: RequestInit }[] = [];
  const fetcher = vi.fn(async (raw: string | URL | Request, init: RequestInit = {}) => {
    const url = String(raw); requests.push({ url, init });
    if (url.endsWith('/ListAgents')) return Response.json({ agents: registered ? [protoNames ? { agent_id: 'CA_test', agent_deployments: [{ status: ready ? 'Running' : 'Starting', agent_name: 'gitu-voice' }] } : { agentId: 'CA_test', agentDeployments: [{ status: ready ? 'Running' : 'Starting', agentName: 'gitu-voice' }] }] : [] });
    if (url.endsWith('/GetClientSettings')) return Response.json({ params: [{ name: 'available_regions', value: 'eu-west,us-east' }, { name: 'residency_warning_regions', value: 'eu-west' }] });
    if (url.endsWith('/CreateAgent')) { registered = true; return Response.json(protoNames ? { agent_id: 'CA_test', presigned_post_request: { url: 'https://uploads.livekit.cloud/source', values: { key: 'upload.tar.gz', x_amz_test: 'signed-value' } } } : { agentId: 'CA_test', presignedUrl: 'https://uploads.livekit.cloud/source' }); }
    if (url.endsWith('/DeployAgent')) return Response.json({ agentId: 'CA_test', presignedUrl: 'https://uploads.livekit.cloud/source' });
    if (url.startsWith('https://uploads.')) return new Response('', { status: failUpload ? 503 : 200 });
    if (url.includes('/build?')) { ready = true; return new Response('{"vertexes":[{"name":"Build complete"}]}\n'); }
    throw new Error('Unexpected Cloud request');
  }) as unknown as typeof fetch;
  return { fetcher, requests, setUploadFailure: (value: boolean) => { failUpload = value; } };
}

describe('Automatic LiveKit Cloud voice setup', () => {
  it('updates an existing worker discovered on another host instead of reusing unknown code', async () => {
    const c = cloud();
    await new LiveKitCloudWorker(c.fetcher).ensure(config);
    rmSync(path.join(home, 'Settings', 'livekit-voice-worker.json'));
    await new LiveKitCloudWorker(c.fetcher).ensure(config);
    expect(c.requests.filter(request => request.url.endsWith('/CreateAgent'))).toHaveLength(1);
    expect(c.requests.filter(request => request.url.endsWith('/DeployAgent'))).toHaveLength(1);
    expect(c.requests.filter(request => request.url.includes('/build?'))).toHaveLength(2);
  });
  it('reports an HTTP rejection without logging the saved key or secret', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const fetcher = vi.fn(async () => Response.json({ code: 'permission_denied', msg: config.apiKey + ' ' + config.apiSecret }, { status: 403 })) as unknown as typeof fetch;
      const worker = new LiveKitCloudWorker(fetcher);
      await expect(worker.ensure(config)).rejects.toThrow('HTTP_403_permission_denied');
      expect(worker.status().diagnostic?.code).toBe('HTTP_403_permission_denied');
      expect(JSON.stringify(log.mock.calls)).not.toContain(config.apiKey);
      expect(JSON.stringify(log.mock.calls)).not.toContain(config.apiSecret);
    } finally { log.mockRestore(); }
  });
  it('retries a DNS failure before transmission without registering duplicate workers', async () => {
    const c = cloud();
    const fetcher = vi.fn(c.fetcher).mockRejectedValueOnce(Object.assign(new TypeError('fetch failed'), { cause: { code: 'EAI_AGAIN' } }));
    const worker = new LiveKitCloudWorker(fetcher);
    await worker.ensure(config);
    expect(worker.status().phase).toBe('ready');
    expect(c.requests.filter(request => request.url.endsWith('/CreateAgent'))).toHaveLength(1);
  });
  it('reports the failed step and a safe connection code without exposing credentials', async () => {
    const fetcher = vi.fn(async () => { throw Object.assign(new TypeError('sensitive provider message'), { cause: { code: 'ENOTFOUND' } }); }) as unknown as typeof fetch;
    const worker = new LiveKitCloudWorker(fetcher);
    await expect(worker.ensure(config)).rejects.toThrow('ListAgents (ENOTFOUND)');
    expect(worker.status().diagnostic).toEqual({ step: 'ListAgents', code: 'ENOTFOUND' });
    expect(JSON.stringify(worker.status())).not.toContain('sensitive provider message');
    expect(JSON.stringify(worker.status())).not.toContain(config.apiSecret);
  });
  it('packages only the shipped bridge with a valid tar header', () => {
    const source = voiceWorkerSource(), archive = gunzipSync(source.archive);
    const names: string[] = [];
    for (let offset = 0; archive[offset];) {
      const header = archive.subarray(offset, offset + 512);
      names.push(header.subarray(0, 100).toString().replace(/\0.*$/, ''));
      const size = parseInt(header.subarray(124, 136).toString(), 8);
      const expected = parseInt(header.subarray(148, 156).toString(), 8);
      const copy = Buffer.from(header); copy.fill(32, 148, 156);
      expect(copy.reduce((sum, value) => sum + value, 0)).toBe(expected);
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    expect(names).toEqual(['Dockerfile', 'package.json', 'package-lock.json', 'agent.mjs']);
    expect(archive.toString()).not.toContain(config.apiSecret);
  });

  it('automatically builds once, reuses the deployment, and never sends credentials with source uploads', async () => {
    const c = cloud(), worker = new LiveKitCloudWorker(c.fetcher);
    const first = worker.ensure(config), concurrent = worker.ensure(config);
    expect(first).toBe(concurrent); await first;
    expect(worker.status()).toEqual({ phase: 'ready', message: 'Voice is ready.', agentId: 'CA_test' });
    const create = c.requests.find(request => request.url.endsWith('/CreateAgent'))!;
    expect(JSON.parse(String(create.init.body)).regions).toEqual(['us-east']);
    const auth = String((create.init.headers as Record<string, string>).authorization).slice(7);
    const claims = JSON.parse(Buffer.from(auth.split('.')[1]!, 'base64url').toString());
    expect(claims.agent).toEqual({ admin: true }); expect(claims.exp - claims.nbf).toBeLessThanOrEqual(305);
    const upload = c.requests.find(request => request.url.startsWith('https://uploads.'))!;
    expect(upload.init.headers).not.toHaveProperty('authorization');
    expect(new Headers(upload.init.headers).has('X-LIVEKIT-CLI-VERSION')).toBe(false);
    for (const request of c.requests.filter(request => new URL(request.url).hostname === 'agents.livekit.cloud')) {
      expect(new Headers(request.init.headers).get('X-LIVEKIT-CLI-VERSION')).toBe('2.18.8');
    }
    expect(JSON.stringify(worker.status())).not.toContain(config.apiSecret);
    await worker.ensure(config);
    expect(c.requests.filter(request => request.url.endsWith('/CreateAgent'))).toHaveLength(1);
    expect(c.requests.filter(request => request.url.includes('/build?'))).toHaveLength(1);
    expect(c.requests.filter(request => request.url.endsWith('/ListAgents'))).toHaveLength(2);
  });

  it('recognizes the protobuf JSON deployment fields returned by Twirp', async () => {
    const c = cloud(true), worker = new LiveKitCloudWorker(c.fetcher);
    await worker.ensure(config);
    expect(worker.status().phase).toBe('ready');
    const upload = c.requests.find(request => request.url.startsWith('https://uploads.'))!;
    expect(upload.init.body).toBeInstanceOf(FormData);
    expect((upload.init.body as FormData).get('x_amz_test')).toBe('signed-value');
    await worker.ensure(config);
    expect(c.requests.filter(request => request.url.includes('/build?'))).toHaveLength(1);
  });

  it('revalidates the Cloud connection when credentials change rather than trusting the ready cache', async () => {
    const c = cloud(), worker = new LiveKitCloudWorker(c.fetcher);
    await worker.ensure(config);
    await worker.ensure({ ...config, apiSecret: config.apiSecret + '-rotated' });
    expect(c.requests.filter(request => request.url.endsWith('/ListAgents'))).toHaveLength(3);
    expect(worker.status().phase).toBe('ready');
  });

  it('preserves the registered deployment after failure so retry does not create duplicate workers', async () => {
    const c = cloud(), worker = new LiveKitCloudWorker(c.fetcher); c.setUploadFailure(true);
    await expect(worker.ensure(config)).rejects.toThrow('upload failed');
    expect(worker.status().phase).toBe('failed');
    expect(JSON.parse(readFileSync(path.join(home, 'Settings', 'livekit-voice-worker.json'), 'utf8')).agentId).toBe('CA_test');
    c.setUploadFailure(false); await worker.ensure(config);
    expect(c.requests.filter(request => request.url.endsWith('/CreateAgent'))).toHaveLength(1);
    expect(c.requests.filter(request => request.url.endsWith('/DeployAgent'))).toHaveLength(1);
    expect(worker.status().phase).toBe('ready');
  });
});
