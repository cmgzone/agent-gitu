import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CoworkMemory } from '../src/cowork/memory.js';
import { MAX_PARALLEL_SUBAGENTS_PER_ROUND, runConversationTurn, runMissionSession, type CoworkRunnerDeps } from '../src/cowork/runner.js';
import { CoworkStore } from '../src/cowork/store.js';
import { CoworkSubAgentRunner, CoworkSubAgents } from '../src/cowork/subagents.js';
import { createBudgetAccount } from '../src/coding/budget.js';
import { ProjectGuard } from '../src/guard/project-guard.js';
import type { LlmClient, LlmMessage } from '../src/llm/llm.js';
import type { ToolContext } from '../src/tools/tools.js';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 50 });
});

function toolCall(name: string, params: Record<string, unknown>): string {
  return `<tool>${JSON.stringify({ name, params })}</tool>`;
}

function makeWorkspace(prefix: string) {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(dir);
  writeFileSync(path.join(dir, 'package.json'), '{}');
  writeFileSync(path.join(dir, 'README.md'), 'hello\n');
  const store = new CoworkStore(path.join(dir, 'cowork.json'));
  const memory = new CoworkMemory(path.join(dir, 'memory.json'));
  const guard = ProjectGuard.detect(dir);
  const ctx: ToolContext = { cwd: dir, guard };
  const subAgents = new CoworkSubAgentRunner(new CoworkSubAgents(store));
  return { dir, store, memory, ctx, subAgents };
}

describe('Single coworker parallel spawn_sub_agent', () => {
  it('runs multiple spawn_sub_agent calls in the same round concurrently via Promise.all', async () => {
    const { store, memory, ctx, subAgents } = makeWorkspace('cowork-par-sub-');
    const worker = store.saveAgent({ name: 'Analyst', systemPrompt: 'Research in parallel.', allowShell: false, allowWrites: false, allowConfig: false });
    const conv = store.saveConversation({ kind: 'dm', memberIds: [worker.id] });
    const parentAccount = createBudgetAccount({ maxCostUsd: 5 });

    const total = 5;
    let inFlight = 0;
    let peakInFlight = 0;
    let releaseBarrier!: () => void;
    const barrier = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });

    let parentCalls = 0;
    const childStep = new Map<string, number>();

    const llm: LlmClient = {
      name: 'parallel-test-llm',
      complete: async (messages: LlmMessage[]) => {
        const system = String(messages[0]?.content ?? '');
        const roleMatch = /^You are "([^"]+)", a temporary sub-agent working for/.exec(system);
        const isChild = Boolean(roleMatch);
        if (!isChild) {
          parentCalls++;
          if (parentCalls === 1) {
            return Array.from({ length: total }, (_, i) =>
              toolCall('spawn_sub_agent', { role: `researcher-${i + 1}`, objective: `Inspect task ${i + 1}` }),
            ).join('\n');
          }
          const combined = messages
            .filter((m) => typeof m.content === 'string' && m.content.includes('TOOL RESULT spawn_sub_agent'))
            .map((m) => String(m.content))
            .join('\n');
          expect(combined).toContain('Finding for researcher-1');
          expect(combined).toContain('Finding for researcher-5');
          return 'All 5 parallel sub-agents finished.';
        }

        const role = roleMatch![1]!;
        const step = (childStep.get(role) ?? 0) + 1;
        childStep.set(role, step);
        if (step === 1) {
          inFlight++;
          peakInFlight = Math.max(peakInFlight, inFlight);
          if (inFlight === total) releaseBarrier();
          await Promise.race([barrier, new Promise((r) => setTimeout(r, 1500))]);
          inFlight--;
          return toolCall('list_files', { path: '.' });
        }
        return `Finding for ${role}: verified workspace files.`;
      },
    };

    const deps: CoworkRunnerDeps = {
      agents: [worker],
      resolveLlm: () => llm,
      toolContext: () => ctx,
      store,
      memory,
      subAgents,
      budgetFor: () => parentAccount,
    };

    const trigger = store.appendMessage(conv.id, { role: 'user', text: 'Run 5 sub-agents in parallel', via: 'web' });
    const result = await runConversationTurn({
      conversation: conv,
      trigger,
      history: [trigger],
      deps,
      append: (m) => store.appendMessage(conv.id, m),
    });

    expect(peakInFlight).toBe(total);
    expect(result.messages.at(-1)?.text).toContain('All 5 parallel sub-agents finished.');
    expect(store.subAgents({ conversationId: conv.id }).filter((s) => s.status === 'completed')).toHaveLength(total);
  });

  it('caps parallel sub-agents at MAX_PARALLEL_SUBAGENTS_PER_ROUND per round in missions too', async () => {
    const { store, memory, ctx, subAgents } = makeWorkspace('cowork-par-mission-');
    const worker = store.saveAgent({ name: 'MissionLead', systemPrompt: 'Run parallel sub-agents.', allowShell: false, allowWrites: false, allowConfig: false });
    const conv = store.saveConversation({ kind: 'dm', memberIds: [worker.id] });
    const mission = store.createMission({ conversationId: conv.id, agentId: worker.id, goal: 'Parallel mission test', criteria: [] });
    const parentAccount = createBudgetAccount({ maxCostUsd: 10 });

    const requested = MAX_PARALLEL_SUBAGENTS_PER_ROUND + 1;
    let inFlight = 0;
    let peakInFlight = 0;
    let releaseBarrier!: () => void;
    const barrier = new Promise<void>((resolve) => {
      releaseBarrier = resolve;
    });
    let parentCalls = 0;
    let overflowSeen = false;
    const childStep = new Map<string, number>();

    const llm: LlmClient = {
      name: 'mission-parallel-llm',
      complete: async (messages: LlmMessage[]) => {
        const system = String(messages[0]?.content ?? '');
        const roleMatch = /^You are "([^"]+)", a temporary sub-agent working for/.exec(system);
        if (!roleMatch) {
          parentCalls++;
          if (parentCalls === 1) {
            return Array.from({ length: requested }, (_, i) =>
              toolCall('spawn_sub_agent', { role: `worker-${i + 1}`, objective: `Check ${i + 1}` }),
            ).join('\n');
          }
          overflowSeen = messages.some(
            (m) => typeof m.content === 'string' && m.content.includes(`at most ${MAX_PARALLEL_SUBAGENTS_PER_ROUND} parallel sub-agents per round`),
          );
          return '{"status":"working","progress":"Ran parallel batch","criteriaMet":[]}';
        }
        const role = roleMatch[1]!;
        const step = (childStep.get(role) ?? 0) + 1;
        childStep.set(role, step);
        if (step === 1) {
          inFlight++;
          peakInFlight = Math.max(peakInFlight, inFlight);
          if (inFlight === MAX_PARALLEL_SUBAGENTS_PER_ROUND) releaseBarrier();
          await Promise.race([barrier, new Promise((r) => setTimeout(r, 1500))]);
          inFlight--;
          return toolCall('list_files', { path: '.' });
        }
        return `Completed ${role}`;
      },
    };

    const deps: CoworkRunnerDeps = {
      agents: [worker],
      resolveLlm: () => llm,
      toolContext: () => ctx,
      store,
      memory,
      subAgents,
      budgetFor: () => parentAccount,
    };

    const res = await runMissionSession({
      mission,
      agent: worker,
      deps,
      append: (m) => store.appendMessage(conv.id, m),
    });

    expect(res.status).toBe('working');
    expect(peakInFlight).toBe(MAX_PARALLEL_SUBAGENTS_PER_ROUND);
    expect(overflowSeen).toBe(true);
    expect(store.subAgents({ conversationId: conv.id }).filter((s) => s.status === 'completed')).toHaveLength(MAX_PARALLEL_SUBAGENTS_PER_ROUND);
  });
});

describe('Group chat stays in the group instead of routing fellow members to private DM inboxes', () => {
  it('redirects message_teammate for fellow group members into visible in-group turns while keeping external inbox delivery intact', async () => {
    const { store, memory, ctx } = makeWorkspace('cowork-group-stay-');
    const chief = store.saveAgent({ name: 'PA', systemPrompt: 'Lead the team.', chiefOfStaff: true });
    const nova = store.saveAgent({ name: 'Nova', systemPrompt: 'Handle backend tasks.' });
    const atlas = store.saveAgent({ name: 'Atlas', systemPrompt: 'Handle copywriting.' });
    const outsider = store.saveAgent({ name: 'Outsider', systemPrompt: 'External teammate not in this group.' });

    const group = store.saveConversation({
      kind: 'group',
      title: 'Launch Room',
      memberIds: [chief.id, nova.id, atlas.id],
      chiefId: chief.id,
    });

    let chiefTurns = 0;
    let chiefSystemPrompt = '';
    const repliedInGroup: string[] = [];

    const makeLlm = (agentName: string): LlmClient => ({
      name: `llm-${agentName}`,
      complete: async (messages: LlmMessage[]) => {
        const system = String(messages[0]?.content ?? '');
        if (agentName === 'PA') {
          chiefSystemPrompt = system;
          chiefTurns++;
          if (chiefTurns === 1) {
            // Even if Chief calls message_teammate for fellow group members AND for an outsider:
            return [
              toolCall('message_teammate', { to: 'Nova', text: 'Verify API readiness' }),
              toolCall('message_teammate', { to: 'Atlas', text: 'Draft launch copy' }),
              toolCall('message_teammate', { to: 'Outsider', text: 'Send external press note' }),
            ].join('\n');
          }
          if (chiefTurns === 2) {
            // Notice Chief does NOT even write @Nova or @Atlas here — the in-group summon must still wake them in the group!
            return 'Coordinating backend and copy right here in the group.';
          }
          return 'Launch Room summary: Nova verified API readiness and Atlas drafted the launch copy.';
        }
        repliedInGroup.push(agentName);
        if (agentName === 'Nova') return 'Nova here in the group: API is verified and ready.';
        if (agentName === 'Atlas') return 'Atlas here in the group: Launch copy is drafted.';
        return `${agentName} done.`;
      },
    });

    const deps: CoworkRunnerDeps = {
      agents: [chief, nova, atlas, outsider],
      resolveLlm: (agent) => makeLlm(agent.name),
      toolContext: () => ctx,
      store,
      memory,
    };

    const trigger = store.appendMessage(group.id, { role: 'user', text: 'Prepare the launch together', via: 'web' });
    const result = await runConversationTurn({
      conversation: group,
      trigger,
      history: [trigger],
      deps,
      append: (m) => store.appendMessage(group.id, m),
    });

    // Prompts instruct group chat collaboration via @Name, not message_teammate for group members.
    expect(chiefSystemPrompt).toContain('never use message_teammate for members already in this group');

    // Fellow group members were NOT sent to private DM inboxes.
    expect(store.inboxFor(nova.id)).toHaveLength(0);
    expect(store.inboxFor(atlas.id)).toHaveLength(0);

    // External teammate NOT in the group still received private inbox mail.
    expect(store.inboxFor(outsider.id)).toHaveLength(1);
    expect(store.inboxFor(outsider.id)[0]!.text).toBe('Send external press note');

    // Both Nova and Atlas replied visibly right inside the group chat!
    expect(repliedInGroup.sort()).toEqual(['Atlas', 'Nova']);
    const groupTexts = result.messages.map((m) => `${m.agentName}: ${m.text}`);
    expect(groupTexts.some((t) => t.includes('Nova: Nova here in the group'))).toBe(true);
    expect(groupTexts.some((t) => t.includes('Atlas: Atlas here in the group'))).toBe(true);
    expect(result.messages.at(-1)?.agentId).toBe(chief.id);
    expect(result.messages.at(-1)?.text).toContain('Launch Room summary');
  });
});
