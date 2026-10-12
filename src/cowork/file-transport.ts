import { spawn } from 'node:child_process';
import type { Duplex } from 'node:stream';

export const COMPUTER_CHUNK_BYTES = 5 * 1024 * 1024;
export interface ComputerChunk {
  name: string;
  path: string;
  offset: number;
  length: number;
  write: boolean;
}
export type ComputerBinary = (request: ComputerChunk, input?: Buffer, signal?: AbortSignal) => Promise<Buffer>;
export function validateComputerChunk(request: ComputerChunk, input?: Buffer): void {
  if (
    !/^gitu-cowork-[a-f0-9]{24}$/.test(request.name) ||
    typeof request.path !== 'string' ||
    request.path.length > 4096 ||
    request.path.includes('\0') ||
    !Number.isSafeInteger(request.offset) ||
    request.offset < 0 ||
    !Number.isSafeInteger(request.length) ||
    request.length < 0 ||
    request.length > COMPUTER_CHUNK_BYTES ||
    typeof request.write !== 'boolean' ||
    (request.write && (input?.length ?? 0) !== request.length)
  )
    throw new Error('Invalid private computer file chunk.');
}
/** Only bounded metadata is encoded. File bytes flow directly through stdin/stdout. */
export const COMPUTER_FILE_BRIDGE = String.raw`const http=require('node:http'),fs=require('node:fs');const metadata=JSON.parse(process.argv[1]);const req=http.request({host:'127.0.0.1',port:8765,path:'/file-chunks',method:metadata.write?'PATCH':'GET',headers:{'x-gitu-key':fs.readFileSync('/tmp/gitu-computer-key','utf8'),'x-file-path':encodeURIComponent(metadata.path),'upload-offset':String(metadata.offset),'x-chunk-length':String(metadata.length),'content-type':'application/octet-stream'}},res=>{if(res.statusCode!==200){res.resume();process.stderr.write('Private computer rejected the file chunk ('+res.statusCode+').');process.exitCode=1;}else res.pipe(process.stdout);});req.on('error',()=>{process.stderr.write('Private computer file transport was interrupted.');process.exitCode=1;});if(metadata.write)process.stdin.pipe(req);else req.end();`;
export function binaryArgs(request: ComputerChunk): string[] {
  return ['exec', '-i', request.name, '/computer/quota-guard', 'node', '-e', COMPUTER_FILE_BRIDGE, JSON.stringify(request)];
}
export async function binaryChannel(channel: Duplex, input: Buffer | undefined, signal?: AbortSignal, stderr?: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0,
      error = '',
      settled = false;
    const timer = setTimeout(() => finish(new Error('Private computer file transfer timed out.')), 120000);
    const abort = () => finish(new Error('Private computer file transfer stopped.'));
    const finish = (failure?: Error, code?: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (failure || code !== 0) {
        channel.destroy();
        reject(failure ?? new Error(error || 'Private computer file transfer failed.'));
      } else resolve(Buffer.concat(chunks, size));
    };
    channel.on('data', (chunk: Buffer) => {
      const data = Buffer.from(chunk);
      size += data.length;
      if (size > COMPUTER_CHUNK_BYTES) {
        finish(new Error('Private computer chunk exceeded its transport limit.'));
        return;
      }
      chunks.push(data);
    });
    stderr?.on('data', (chunk: Buffer) => {
      error = (error + String(chunk)).slice(-1000);
    });
    channel.once('error', () => finish(new Error('Private computer connection was interrupted.')));
    channel.once('close', (code: number | null) => finish(undefined, code));
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    else channel.end(input ?? Buffer.alloc(0));
  });
}
export const dockerBinary: ComputerBinary = async (request, input, signal) => {
  validateComputerChunk(request, input);
  signal?.throwIfAborted();
  const child = spawn('docker', binaryArgs(request), { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], signal });
  const result = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0,
      error = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Private computer file transfer timed out.'));
    }, 120000);
    child.stdout.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > COMPUTER_CHUNK_BYTES) {
        child.kill();
        reject(new Error('Private computer file chunk exceeded its transport limit.'));
      } else chunks.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      error = (error + String(chunk)).slice(-1000);
    });
    child.once('error', reject);
    child.once('close', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(Buffer.concat(chunks, size)) : reject(new Error(error || 'Private computer file transfer failed.'));
    });
    child.stdin.on('error', () => {});
  });
  child.stdin.end(input ?? Buffer.alloc(0));
  return result;
};
