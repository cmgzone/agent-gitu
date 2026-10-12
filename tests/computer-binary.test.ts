import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createComputerBrokerServer } from '../src/cowork/computer-broker.js';
import type { ComputerExec } from '../src/cowork/computer.js';
import { COMPUTER_CHUNK_BYTES, validateComputerChunk } from '../src/cowork/file-transport.js';
describe('Private computer binary transport', () => {
  it('moves a 21 MB file in bounded raw binary chunks through authenticated broker ownership checks', async () => {
    const bytes = Buffer.alloc(21 * 1024 * 1024, 201),
      received = Buffer.alloc(bytes.length),
      name = 'gitu-cowork-' + 'a'.repeat(24),
      key = 'b'.repeat(40);
    const exec: ComputerExec = async (args) => (args[0] === 'container' ? 'testowner' : 'ok');
    exec.binary = async (request, input) => {
      validateComputerChunk(request, input);
      if (request.write) {
        input!.copy(received, request.offset);
        return Buffer.alloc(0);
      }
      return received.subarray(request.offset, request.offset + request.length);
    };
    const server = createComputerBrokerServer(key, 'testowner', exec);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
    try {
      for (let offset = 0; offset < bytes.length; offset += COMPUTER_CHUNK_BYTES) {
        const data = bytes.subarray(offset, Math.min(bytes.length, offset + COMPUTER_CHUNK_BYTES));
        const request = { name, path: '/workspace/file.bin', offset, length: data.length, write: true };
        const response = await fetch(base + '/file-chunks?' + new URLSearchParams({ metadata: JSON.stringify(request) }), {
          method: 'POST',
          headers: { authorization: 'Bearer ' + key },
          body: data,
        });
        expect(response.status).toBe(200);
        expect((await response.arrayBuffer()).byteLength).toBe(0);
      }
      expect(createHash('sha256').update(received).digest('hex')).toBe(createHash('sha256').update(bytes).digest('hex'));
      const response = await fetch(
        base + '/file-chunks?' + new URLSearchParams({ metadata: JSON.stringify({ name, path: '/workspace/file.bin', offset: 0, length: 1024, write: false }) }),
        { method: 'POST', headers: { authorization: 'Bearer ' + key } },
      );
      expect(Buffer.from(await response.arrayBuffer()).equals(bytes.subarray(0, 1024))).toBe(true);
      expect((await fetch(base + '/file-chunks?metadata={}', { method: 'POST' })).status).toBe(401);
    } finally {
      await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
    }
  });
  it('rejects oversized chunks and invalid container identities', () => {
    expect(() => validateComputerChunk({ name: 'user-container', path: '/workspace/file', offset: 0, length: 1, write: false })).toThrow();
    expect(() => validateComputerChunk({ name: 'gitu-cowork-' + 'a'.repeat(24), path: '/workspace/file', offset: 0, length: COMPUTER_CHUNK_BYTES + 1, write: false })).toThrow();
  });
});
