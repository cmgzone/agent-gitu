import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AsyncLocalStorage } from 'node:async_hooks';
import { expect, it, vi } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
import type { CoworkStore } from '../src/cowork/store.js';

it('refreshes shared profiles in each transcript’s original workspace when a company changes the roster', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-shared-roster-stream-'));
  vi.stubEnv('AGENT_GITU_HOME', root);
  const server = new GituServer({ port: 0, passwordRequired: false, llm: new ScriptedMockLlm([]) });
  const internal = server as unknown as { cowork(): CoworkStore; companyScope: AsyncLocalStorage<{ id: string; version: number }> };
  const streams: ReadableStreamDefaultReader<Uint8Array>[] = [];
  try {
    const origin = 'http://localhost:' + await server.start(), roster = internal.cowork();
    const lead = roster.saveAgent({ name: 'Ari', systemPrompt: 'Coordinate.' });
    const outsider = roster.saveAgent({ name: 'Milo', systemPrompt: 'Research.' });
    const main = roster.saveConversation({ kind: 'dm', memberIds: [lead.id] });
    const post = async (route: string, body: unknown) => {
      const response = await fetch(origin + route, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      expect(response.ok).toBe(true); return response.json() as Promise<any>;
    };
    const company = (await post('/api/companies', { name: 'Shared team' })).company;
    const configured = await post('/api/companies/' + company.id + '/lead', { agentId: lead.id });
    async function subscribe(route: string) {
      const response = await fetch(origin + route, { signal: AbortSignal.timeout(15000) });
      expect(response.ok).toBe(true);
      const reader = response.body!.getReader(); streams.push(reader);
      const decoder = new TextDecoder(); let pending = '';
      return async function next(): Promise<any> {
        while (true) {
          const boundary = pending.indexOf('\n\n');
          if (boundary >= 0) {
            const event = pending.slice(0, boundary); pending = pending.slice(boundary + 2);
            if (event.startsWith('data: ')) return JSON.parse(event.slice(6));
          } else {
            const chunk = await reader.read();
            if (chunk.done) throw Error('Transcript stream closed before the update');
            pending += decoder.decode(chunk.value, { stream: true });
          }
        }
      };
    }
    const mainNext = await subscribe('/api/cowork/conversations/' + main.id + '/stream');
    const companyNext = await subscribe('/api/companies/' + company.id + '/cowork/conversations/' + configured.company.conversationId + '/stream');
    await mainNext(); await companyNext();
    internal.companyScope.run({ id: company.id, version: 0 }, () => {
      const scoped = internal.cowork(), agent = scoped.getAgent(lead.id)!;
      scoped.saveAgent({ ...agent, name: 'Ari Research' });
    });
    const [mainUpdate, companyUpdate] = await Promise.all([mainNext(), companyNext()]);
    expect(mainUpdate.deleted).not.toBe(true); expect(companyUpdate.deleted).not.toBe(true);
    expect(mainUpdate.roster.agents).toContainEqual(expect.objectContaining({ id: lead.id, name: 'Ari Research' }));
    expect(mainUpdate.roster.agents).toContainEqual(expect.objectContaining({ id: outsider.id }));
    expect(companyUpdate.roster.agents).toEqual([expect.objectContaining({ id: lead.id, name: 'Ari Research', companyId: company.id })]);
  } finally {
    await Promise.allSettled(streams.map(reader => reader.cancel()));
    await server.stop(); vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true });
  }
}, 60000);
