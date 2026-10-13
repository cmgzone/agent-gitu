import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { ScriptedMockLlm } from '../src/llm/llm.js';
describe('company and file HTTP boundaries', () => {
  it('shows open questions in scoped status and chat, and answers without changing company direction', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-company-questions-'));
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
      const a = (await request('/api/companies', { name: 'Alpha' })).data.company;
      const b = (await request('/api/companies', { name: 'Beta' })).data.company;
      const lead = (await request('/api/companies/' + a.id + '/lead', { name: 'Lead' })).data.agent;
      await request('/api/companies/' + b.id + '/lead', { name: 'Other lead' });
      const own = (await request('/api/companies/' + a.id)).data;
      const charts = await request('/api/companies/' + a.id + '/dashboard?days=7');
      expect(charts.status).toBe(200);
      expect(charts.data.daily).toHaveLength(7);
      expect(charts.data.daily.every((day: any) => day.calls === 0)).toBe(true);
      expect(charts.data).not.toHaveProperty('usage');
      expect((await request('/api/companies/' + b.id + '/dashboard?days=30')).data.daily).toHaveLength(30);
      expect((await request('/api/companies/' + a.id + '/dashboard?days=100')).status).toBe(400);
      expect((await request('/api/companies/company-missing/dashboard?days=7')).status).toBe(404);
      const cowork = (server as any).companyCowork.get(a.id);
      const question = cowork.addRequest({
        conversationId: own.company.conversationId,
        agentId: lead.id,
        kind: 'question',
        title: 'Choose a market',
        detail: 'Which market should we focus on?',
      });
      expect((await request('/api/companies/' + a.id + '/status')).data.requests).toContainEqual(expect.objectContaining({ id: question.id }));
      expect((await request('/api/companies/' + a.id + '/chat')).data.requests).toContainEqual(expect.objectContaining({ id: question.id }));
      expect((await request('/api/companies/' + b.id + '/chat')).data.requests).toEqual([]);
      expect((await request('/api/companies/' + b.id + '/cowork/requests/' + question.id, { action: 'answer', response: 'Retail' })).status).toBe(404);
      expect((await request('/api/companies/' + a.id + '/cowork/requests/' + question.id, { action: 'answer', response: 'Retail' })).status).toBe(200);
      expect((await request('/api/companies/' + a.id + '/chat')).data.requests).toEqual([]);
      const specialist = cowork.saveAgent({ name: 'Specialist', systemPrompt: 'Help the company' });
      const separate = cowork.saveConversation({ kind: 'dm', memberIds: [specialist.id] });
      const followUp = cowork.addRequest({ conversationId: separate.id, agentId: specialist.id, kind: 'question', title: 'Report format', detail: 'Choose the format' });
      expect((await request('/api/companies/' + a.id + '/chat')).data.requests).toContainEqual(expect.objectContaining({ id: followUp.id }));
      expect((await request('/api/companies/' + b.id + '/chat')).data.requests).toEqual([]);
      expect((await request('/api/companies/' + a.id)).data.company.directionVersion).toBe(own.company.directionVersion);
    } finally {
      await server.stop();
      vi.unstubAllEnvs();
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('scopes companies and resumable binary uploads, serves video ranges and preserves history after restart', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-company-http-'));
    vi.stubEnv('AGENT_GITU_HOME', root);
    let server = new GituServer({ passwordRequired: false, port: 0, llm: new ScriptedMockLlm([]) });
    try {
      let origin = 'http://localhost:' + (await server.start());
      const request = async (url: string, method = 'GET', body?: unknown) => {
        const response = await fetch(origin + url, {
          method,
          headers: { origin, 'content-type': 'application/json' },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { status: response.status, data: (await response.json()) as any };
      };
      const a = (await request('/api/companies', 'POST', { name: 'Alpha', purpose: 'Build', monthlyBudgetUsd: null, maxFileBytes: null })).data.company,
        b = (await request('/api/companies', 'POST', { name: 'Beta' })).data.company;
      const lead = (await request('/api/companies/' + a.id + '/lead', 'POST', { name: 'Owner lead' })).data.agent;
      expect((await request('/api/companies/' + b.id + '/cowork/agents/' + lead.id + '/computer')).status).toBe(404);
      expect((await request('/api/cowork/agents')).data.agents).not.toContainEqual(expect.objectContaining({ id: lead.id }));
      const bytes = Buffer.alloc(21 * 1024 * 1024, 19),
        checksum = createHash('sha256').update(bytes).digest('hex'),
        base = '/api/companies/' + a.id + '/files/uploads';
      const created = await request(base, 'POST', { scope: 'company', name: 'movie.mp4', mime: 'video/mp4', size: bytes.length, checksum });
      expect(created.status).toBe(201);
      const id = created.data.file.id;
      for (let offset = 0; offset < bytes.length; offset += 5 * 1024 * 1024) {
        const response = await fetch(origin + base + '/' + id + '?scope=company', {
          method: 'PATCH',
          headers: { origin, 'upload-offset': String(offset) },
          body: bytes.subarray(offset, Math.min(bytes.length, offset + 5 * 1024 * 1024)),
        });
        expect(response.status).toBe(200);
      }
      expect((await request(base + '/' + id + '/complete?scope=company', 'POST')).data.file.checksum).toBe(checksum);
      const range = await fetch(origin + base + '/' + id + '/content?scope=company&inline=1', { headers: { range: 'bytes=1048576-1048583' } });
      expect(range.status).toBe(206);
      expect(Buffer.from(await range.arrayBuffer()).equals(bytes.subarray(1048576, 1048584))).toBe(true);
      expect((await request('/api/companies/' + b.id + '/files/uploads/' + id + '?scope=company')).status).toBe(404);
      await request('/api/companies/' + a.id + '/archive', 'POST');
      await request('/api/companies/' + a.id + '/restore', 'POST');
      expect((await request('/api/companies/' + a.id)).data.company.state).toBe('paused');
      await server.stop();
      server = new GituServer({ passwordRequired: false, port: 0, llm: new ScriptedMockLlm([]) });
      origin = 'http://localhost:' + (await server.start());
      expect((await request('/api/companies/' + a.id)).data.agents[0].id).toBe(lead.id);
      expect((await request(base + '/' + id + '?scope=company')).data.file.state).toBe('ready');
    } finally {
      await server.stop();
      vi.unstubAllEnvs();
      rmSync(root, { recursive: true, force: true });
    }
  }, 30000);
});
