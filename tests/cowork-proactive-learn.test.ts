import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { CoworkMemory } from '../src/cowork/memory.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { CronStore } from '../src/cron/scheduler.js';
import { updateWorkspaceSettings, ensureGituHome } from '../src/workspace/home.js';
import { SkillStore } from '../src/skills/skills.js';
import type { LlmClient } from '../src/llm/llm.js';

const ROOT = mkdtempSync(path.join(tmpdir(), 'cowork-proactive-'));
const WORKSPACE = path.join(ROOT, 'workspace');
mkdirSync(WORKSPACE, { recursive: true });
writeFileSync(path.join(WORKSPACE, 'package.json'), '{"name":"cw"}');

function scriptedLlm(script: string[]): LlmClient {
  let call = 0;
  return { name: 'mock', complete: async () => script[Math.min(call++, script.length - 1)] } as unknown as LlmClient;
}
function newServer(script: string[]): GituServer {
  return new GituServer({ cwd: WORKSPACE, port: 0, llm: scriptedLlm(script) });
}
/** Same as newServer, but exposes how many LLM calls were made so a test can
 *  prove whether a reflection pass ran (script index order is not reliable). */
function newServerWithCounter(script: string[]): { server: GituServer; calls: () => number } {
  let call = 0;
  const llm = { name: 'mock', complete: async () => script[Math.min(call++, script.length - 1)] } as unknown as LlmClient;
  return { server: new GituServer({ cwd: WORKSPACE, port: 0, llm }), calls: () => call };
}
async function api(base: string, method: string, pathName: string, body?: unknown): Promise<{ status: number; json: any }> {
  const res = await fetch(`${base}${pathName}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}
async function makeDmAgent(base: string, name: string): Promise<{ agentId: string; convId: string }> {
  const created = await api(base, 'POST', '/api/cowork/agents', { name, systemPrompt: `You are ${name}.`, allowConfig: true });
  const agentId = created.json.agent?.id;
  const conv = await api(base, 'POST', '/api/cowork/conversations', { kind: 'dm', memberIds: [agentId] });
  return { agentId, convId: conv.json.conversation?.id };
}
const listFilesCall = '<tool>{"name":"list_files","params":{"path":"."}}</tool>';
function createSkillReply(name: string): string {
  return JSON.stringify({ thought: 'repeatable', action: { type: 'tool_call', tool: 'create_skill', params: { name, description: 'learned', instructions: '1. do it', global: true } } });
}
async function waitForSkill(name: string, ms = 6_000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (SkillStore.forProject(ensureGituHome().workspace).list().some((s) => s.name === name)) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}
function jobs(): ReturnType<CronStore['jobs']> {
  return CronStore.forProject(ensureGituHome().workspace).jobs();
}

describe('cowork proactive learning', () => {
  it('registers consolidate+review jobs with safe defaults (sweep on, review off)', async () => {
    updateWorkspaceSettings({ coworkLearning: undefined });
    const server = newServer([]);
    await server.start();
    try {
      expect(jobs().find((j) => j.id === 'cowork_learn_consolidate')?.enabled).toBe(true);
      expect(jobs().find((j) => j.id === 'cowork_learn_review')?.enabled).toBe(false);
    } finally {
      await server.stop();
    }
  });

  it('consolidation sweep runs over team memory and keeps the job registered', async () => {
    updateWorkspaceSettings({ coworkLearning: undefined });
    const server = newServer([]);
    await server.start();
    try {
      const memory = new CoworkMemory(MemoryStore.forProject(ensureGituHome().workspace), path.basename(ensureGituHome().workspace));
      const agent = { name: 'sweep-agent' } as never;
      memory.remember(agent, 'Deploys are verified by curl health check');
      memory.remember(agent, 'Deploys are verified by curl health check');
      const result = (server as any).coworkLearnConsolidateTick() as string;
      expect(result).toContain('consolidate');
      expect(jobs().find((j) => j.id === 'cowork_learn_consolidate')).toBeTruthy();
    } finally {
      await server.stop();
    }
  });

  it('proactive mode keeps ordinary turns quiet but still learns during the review', async () => {
    updateWorkspaceSettings({ coworkLearning: { mode: 'proactive' } });
    const script = [
      `Checking ${listFilesCall}`,
      'Done — deployed.',
      // the wake turn's plain answer, then the review reflection's create_skill
      'Reviewed.',
      createSkillReply('proactive-from-review'),
    ];
    const { server, calls } = newServerWithCounter(script);
    const base = `http://127.0.0.1:${await server.start()}`;
    try {
      const { convId } = await makeDmAgent(base, 'proactive-mode-agent');
      await api(base, 'POST', `/api/cowork/conversations/${convId}/messages`, { text: 'deploy the page' });
      await new Promise((r) => setTimeout(r, 800));
      expect((server as any).cowork().messages(convId).some((m: { text: string }) => m.text.includes('deployed'))).toBe(true);
      // Exactly two calls (tool round + answer): proactive mode ran NO reflection.
      expect(calls()).toBe(2);
      expect(await waitForSkill('proactive-from-review', 800)).toBe(false);
      // The scheduled review wakes the agent, and THAT turn reflects.
      const fired = (server as any).coworkLearnReviewTick() as string | undefined;
      expect(fired).toContain('review wake');
      expect(await waitForSkill('proactive-from-review')).toBe(true);
      // Wake turn + its reflection both ran.
      expect(calls()).toBeGreaterThanOrEqual(4);
    } finally {
      await server.stop();
      updateWorkspaceSettings({ coworkLearning: undefined });
    }
  });

  it('reactive mode (the original) reflects right after an ordinary turn', async () => {
    updateWorkspaceSettings({ coworkLearning: { mode: 'reactive' } });
    const script = [`Checking ${listFilesCall}`, 'Done.', createSkillReply('reactive-mode-skill')];
    const { server, calls } = newServerWithCounter(script);
    const base = `http://127.0.0.1:${await server.start()}`;
    try {
      const { convId } = await makeDmAgent(base, 'reactive-mode-agent');
      await api(base, 'POST', `/api/cowork/conversations/${convId}/messages`, { text: 'do a thing' });
      expect(await waitForSkill('reactive-mode-skill')).toBe(true);
      // Three calls = tool round, answer, and the reactive reflection.
      expect(calls()).toBe(3);
    } finally {
      await server.stop();
      updateWorkspaceSettings({ coworkLearning: undefined });
    }
  });

  it('off mode never reflects on a turn', async () => {
    updateWorkspaceSettings({ coworkLearning: { mode: 'off' } });
    const script = [`Checking ${listFilesCall}`, 'Done.', createSkillReply('off-should-not-exist')];
    const server = newServer(script);
    const base = `http://127.0.0.1:${await server.start()}`;
    try {
      const { convId } = await makeDmAgent(base, 'off-mode-agent');
      await api(base, 'POST', `/api/cowork/conversations/${convId}/messages`, { text: 'do a thing' });
      await new Promise((r) => setTimeout(r, 900));
      expect(await waitForSkill('off-should-not-exist', 600)).toBe(false);
      expect(jobs().filter((j) => j.id.startsWith('cowork_learn_')).every((j) => !j.enabled)).toBe(true);
    } finally {
      await server.stop();
      updateWorkspaceSettings({ coworkLearning: undefined });
    }
  });

  it('exposes the loop over HTTP, applies a mode without a restart, and keeps other fields', async () => {
    updateWorkspaceSettings({ coworkLearning: undefined });
    const server = newServer([]);
    const base = `http://127.0.0.1:${await server.start()}`;
    try {
      const initial = await api(base, 'GET', '/api/cowork/learning');
      expect(initial.status).toBe(200);
      expect(initial.json.mode).toBe('reactive');
      expect(initial.json.review).toBe(false);
      const proactive = await api(base, 'POST', '/api/cowork/learning', { mode: 'proactive', reviewEvery: '6h' });
      expect(proactive.status).toBe(200);
      expect(proactive.json.mode).toBe('proactive');
      expect(proactive.json.review).toBe(true);
      // Applied without a restart: the review job is enabled right away.
      const reviewJob = jobs().find((j) => j.id === 'cowork_learn_review');
      expect(reviewJob?.enabled).toBe(true);
      expect(reviewJob?.every).toBe('6h');
      // A later partial POST keeps the previously-set fields.
      await api(base, 'POST', '/api/cowork/learning', { mode: 'off' });
      const after = await api(base, 'GET', '/api/cowork/learning');
      expect(after.json.mode).toBe('off');
      expect(after.json.reviewEvery).toBe('6h');
      // Legacy raw API still works: review=true with NO stored mode means proactive.
      updateWorkspaceSettings({ coworkLearning: { review: true } });
      const legacy = await api(base, 'GET', '/api/cowork/learning');
      expect(legacy.json.mode).toBe('proactive');
    } finally {
      await server.stop();
      updateWorkspaceSettings({ coworkLearning: undefined });
    }
  });

  it('does not review when there is no activity since the last review', async () => {
    updateWorkspaceSettings({ coworkLearning: { mode: 'proactive' } });
    const server = newServer([]);
    await server.start();
    try {
      // Activity from earlier tests in this file is treated as already reviewed.
      (server as any).coworkLastReviewAt = Date.now() + 60_000;
      expect((server as any).coworkLearnReviewTick()).toBe('no recent activity to review');
    } finally {
      await server.stop();
      updateWorkspaceSettings({ coworkLearning: undefined });
    }
  });
});