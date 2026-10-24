import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';

describe('live computer status stream', () => {
  it('pushes initial and control updates for personal and company teammates', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-computer-stream-'));
    vi.stubEnv('AGENT_GITU_HOME', root);
    const server = new GituServer({ passwordRequired: false, port: 0, llm: new ScriptedMockLlm([]) });
    try {
      const origin = 'http://localhost:' + (await server.start());
      const request = async (route: string, body?: unknown) => {
        const response = await fetch(origin + route, {
          method: body ? 'POST' : 'GET',
          headers: { origin, 'content-type': 'application/json' },
          body: body ? JSON.stringify(body) : undefined,
        });
        return { status: response.status, data: (await response.json()) as any };
      };
      const personal = (await request('/api/cowork/agents', { name: 'Personal', systemPrompt: 'Help.' })).data.agent;
      const company = (await request('/api/companies', { name: 'Acme' })).data.company;
      const lead = (await request('/api/companies/' + company.id + '/lead', { name: 'Lead' })).data.agent;

      const readNext = async (reader: ReadableStreamDefaultReader<Uint8Array>, decoder: TextDecoder, buffer: { text: string }) => {
        for (;;) {
          while (!buffer.text.includes('\n\n')) {
            const chunk = await reader.read();
            if (chunk.done) throw new Error('Computer status stream closed before its first event.');
            buffer.text += decoder.decode(chunk.value, { stream: true });
          }
          const end = buffer.text.indexOf('\n\n');
          const event = buffer.text.slice(0, end);
          buffer.text = buffer.text.slice(end + 2);
          const data = event.split('\n').find((line) => line.startsWith('data: '));
          if (data) return JSON.parse(data.slice('data: '.length));
          // `retry:` and heartbeat comments are framing, not status events.
        }
      };

      for (const route of [
        '/api/cowork/computers/stream',
        '/api/companies/' + company.id + '/cowork/computers/stream',
      ]) {
        const controller = new AbortController();
        const response = await fetch(origin + route, { headers: { origin, accept: 'text/event-stream' }, signal: controller.signal });
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/event-stream');
        const reader = response.body!.getReader();
        const snapshot = await readNext(reader, new TextDecoder(), { text: '' });
        const expectedId = route.startsWith('/api/companies/') ? lead.id : personal.id;
        expect(snapshot.computers).toContainEqual(expect.objectContaining({ agentId: expectedId, state: 'stopped' }));
        controller.abort();
        await reader.cancel().catch(() => undefined);
      }

      const controller = new AbortController();
      const response = await fetch(origin + '/api/companies/' + company.id + '/cowork/computers/stream', { headers: { origin, accept: 'text/event-stream' }, signal: controller.signal });
      const reader = response.body!.getReader();
      const decoder = new TextDecoder(), buffer = { text: '' };
      await readNext(reader, decoder, buffer);
      await (server as any).companyScope.run({ id: company.id, version: company.directionVersion }, () => {
        (server as any).coworkComputer(lead.id).setControl('user', 'You have control.');
      });
      const update = await readNext(reader, decoder, buffer);
      expect(update.computers).toContainEqual(expect.objectContaining({ agentId: lead.id, control: 'user' }));
      controller.abort();
      await reader.cancel().catch(() => undefined);
    } finally {
      await server.stop();
      vi.unstubAllEnvs();
      rmSync(root, { recursive: true, force: true });
    }
  });
});
