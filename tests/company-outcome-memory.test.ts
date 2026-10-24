import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { CompanyStore } from '../src/company/store.js';
import { CoworkStore } from '../src/cowork/store.js';
import { CoworkMemory } from '../src/cowork/memory.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { syncCompanyOutcomes } from '../src/company/outcome-memory.js';

it('indexes completed outcomes once across recovery, respects archived notes, and excludes unfinished work and private memory', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-company-outcomes-'));
  const store = new CompanyStore(path.join(root, 'companies'));
  try {
    const company = store.create({ name: 'Research', purpose: 'Verify customer demand.' });
    const roster = new CoworkStore(path.join(root, 'cowork.json'));
    const agent = roster.saveAgent({ name: 'Ari', systemPrompt: 'Research evidence.' });
    const cowork = new CoworkStore(path.join(root, 'company.json'), undefined, { companyId: company.id, sharedRoster: roster });
    cowork.addAgent(agent.id);
    const conversation = cowork.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    const task = cowork.createMission({ conversationId: conversation.id, agentId: agent.id, goal: 'Interview customers', criteria: ['Record evidence'] });
    cowork.updateMission(task.id, { status: 'done', result: 'Five interviews support a pilot.' });
    const failed = cowork.createMission({ conversationId: conversation.id, agentId: agent.id, goal: 'UNFINISHED_WORK', criteria: ['Verify'] });
    cowork.updateMission(failed.id, { status: 'failed', result: 'UNVERIFIED_FAILURE' });
    const memoryStore = MemoryStore.forProject(path.join(root, 'knowledge'));
    let memory = new CoworkMemory(memoryStore, 'knowledge', true);
    memory.remember(agent, 'PRIVATE_PERSONAL_NOTE');
    store.saveResource('workflow-run', 'run-verified', company.id, {
      id: 'run-verified',
      workflowId: 'research',
      version: 1,
      state: 'completed',
      steps: [{ stepId: 'research', state: 'completed', missionId: task.id }],
    });
    syncCompanyOutcomes(store, company, cowork, memory);
    expect(memory.companyEntries(agent, company.id)).toHaveLength(2);
    const taskEntry = memory.companyEntries(agent, company.id).find((entry) => entry.claim.includes('Five interviews'))!;
    memoryStore.archive(taskEntry.id);
    memory = new CoworkMemory(MemoryStore.forProject(path.join(root, 'knowledge')), 'knowledge', true);
    syncCompanyOutcomes(store, company, cowork, memory);
    syncCompanyOutcomes(store, company, cowork, memory);
    expect(memory.companyEntries(agent, company.id)).toHaveLength(1);
    expect(memory.companyEntries(agent, company.id)[0]).toMatchObject({ status: 'candidate', visibility: 'project' });
    expect(memory.companyEntries(agent, company.id)[0]!.claim).toContain('run-verified');
    expect(JSON.stringify(memory.companyEntries(agent, company.id))).not.toMatch(/PRIVATE_PERSONAL_NOTE|UNFINISHED_WORK|UNVERIFIED_FAILURE/);
    expect(() =>
      memoryStore.add({ type: 'fact', claim: 'Cannot grant verification', scope: 'knowledge', sourceType: 'model_inference', status: 'verified' }, { freshCandidate: true }),
    ).toThrow('unverified candidates');
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});

it('backfills a large history in bounded batches and continues from durable markers', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-company-backfill-'));
  const store = new CompanyStore(path.join(root, 'companies'));
  try {
    const company = store.create({ name: 'Research' });
    const roster = new CoworkStore(path.join(root, 'cowork.json'));
    const agent = roster.saveAgent({ name: 'Ari', systemPrompt: 'Research.' });
    const cowork = new CoworkStore(path.join(root, 'company.json'), undefined, { companyId: company.id, sharedRoster: roster });
    cowork.addAgent(agent.id);
    const conversation = cowork.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    for (let i = 0; i < 3; i++) {
      const task = cowork.createMission({ conversationId: conversation.id, agentId: agent.id, goal: 'Research ' + i, criteria: ['Verify'] });
      cowork.updateMission(task.id, { status: 'done', result: 'Evidence ' + i });
    }
    const memory = new CoworkMemory(MemoryStore.forProject(path.join(root, 'knowledge')), 'knowledge', true);
    syncCompanyOutcomes(store, company, cowork, memory, 2);
    expect(memory.companyEntries(agent, company.id)).toHaveLength(2);
    syncCompanyOutcomes(store, company, cowork, memory, 2);
    expect(memory.companyEntries(agent, company.id)).toHaveLength(3);
    syncCompanyOutcomes(store, company, cowork, memory, 2);
    expect(memory.companyEntries(agent, company.id)).toHaveLength(3);
  } finally {
    store.close(); rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
