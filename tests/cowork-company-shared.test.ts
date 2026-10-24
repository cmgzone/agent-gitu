import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CoworkStore } from '../src/cowork/store.js';
import { CoworkMemory } from '../src/cowork/memory.js';
import { MemoryStore } from '../src/memory/memory-store.js';
import { CompanyStore } from '../src/company/store.js';
import { CompanyOrganization } from '../src/company/organization.js';
import { CompanyHandbook } from '../src/company/handbook.js';

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-shared-companies-'));
  roots.push(root);
  const roster = new CoworkStore(path.join(root, 'cowork.json'));
  const company = (id: string) => new CoworkStore(path.join(root, id + '.json'), undefined, { companyId: id, sharedRoster: roster });
  return { root, roster, company };
}
afterEach(() => { vi.unstubAllEnvs(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe('companies as Cowork memberships', () => {
  it('uses the same identity in multiple companies and keeps workspace permissions separate', () => {
    const f = fixture(), agent = f.roster.saveAgent({ name: 'Milo', systemPrompt: 'Research carefully.', allowShell: true, allowWrites: true });
    const alpha = f.company('alpha'), beta = f.company('beta');
    alpha.addAgent(agent.id); beta.addAgent(agent.id);
    alpha.saveAgent({ ...alpha.getAgent(agent.id)!, allowWrites: true, chiefOfStaff: true });
    expect(alpha.getAgent(agent.id)).toMatchObject({ id: agent.id, companyId: 'alpha', allowWrites: true, chiefOfStaff: true });
    expect(beta.getAgent(agent.id)).toMatchObject({ id: agent.id, companyId: 'beta', allowWrites: false, chiefOfStaff: false });
    expect(f.roster.getAgent(agent.id)).toEqual(agent);
    f.roster.saveAgent({ ...agent, name: 'Milo Research', systemPrompt: 'Use primary evidence.' });
    expect(alpha.getAgent(agent.id)?.name).toBe('Milo Research');
    expect(beta.getAgent(agent.id)?.systemPrompt).toBe('Use primary evidence.');
    expect(f.roster.listAgents()).toHaveLength(1);
  });

  it('registers teammates hired in a company as ordinary Cowork profiles without granting global tool access', () => {
    const f = fixture(), alpha = f.company('alpha');
    const hired = alpha.saveAgent({ name: 'Engineer', systemPrompt: 'Build the product.', allowShell: true, allowWrites: true, allowConfig: true, cloudConnectionId: 'company-server', useHostComputer: false });
    expect(f.roster.getAgent(hired.id)).toMatchObject({ id: hired.id, name: 'Engineer', allowShell: false, allowWrites: false, allowConfig: false, useHostComputer: false });
    expect(f.roster.getAgent(hired.id)).not.toHaveProperty('companyId');
    expect(f.roster.getAgent(hired.id)?.cloudConnectionId).toBeUndefined();
    expect(hired).toMatchObject({ allowShell: true, allowWrites: true, companyId: 'alpha', cloudConnectionId: 'company-server' });
  });

  it('detaches a membership without deleting its Cowork profile or another company membership', () => {
    const f = fixture(), agent = f.roster.saveAgent({ name: 'Ari', systemPrompt: 'Coordinate.' });
    const alpha = f.company('alpha'), beta = f.company('beta');
    alpha.addAgent(agent.id); beta.addAgent(agent.id);
    expect(alpha.deleteAgent(agent.id)).toBe(true);
    expect(f.roster.getAgent(agent.id)).toEqual(agent);
    expect(beta.getAgent(agent.id)?.id).toBe(agent.id);
    expect(f.company('alpha').getAgent(agent.id)).toBeUndefined();
  });

  it('migrates legacy staff once with stable IDs and history, and never resurrects a deleted canonical agent', () => {
    const f = fixture(), file = path.join(f.root, 'legacy.json');
    const old = new CoworkStore(file, undefined, { companyId: 'legacy' });
    const agent = old.saveAgent({ name: 'Legacy lead', systemPrompt: 'Coordinate.', allowWrites: true });
    const conversation = old.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    old.appendMessage(conversation.id, { role: 'agent', agentId: agent.id, text: 'Saved launch decision.', via: 'agent' });
    const migrated = f.company('legacy');
    expect(migrated.listAgents()).toHaveLength(1);
    expect(migrated.getAgent(agent.id)?.id).toBe(agent.id);
    expect(migrated.messages(conversation.id)[0]?.text).toBe('Saved launch decision.');
    expect(f.roster.getAgent(agent.id)).toMatchObject({ id: agent.id, allowWrites: false });
    expect(f.company('legacy').listAgents()).toHaveLength(1);
    expect(f.roster.listAgents()).toHaveLength(1);
    f.roster.deleteAgent(agent.id);
    expect(f.company('legacy').listAgents()).toEqual([]);
    expect(f.roster.listAgents()).toEqual([]);
  });
});

describe('shared Cowork company memory', () => {
  it('indexes approved handbook knowledge into Cowork memory and withdraws archived guidance for all teammates', () => {
    const f = fixture(); vi.stubEnv('AGENT_GITU_HOME', f.root);
    const store = new CompanyStore(path.join(f.root, 'Companies'));
    try {
      const company = store.create({ name: 'Research studio' });
      const ari = f.roster.saveAgent({ name: 'Ari', systemPrompt: 'Coordinate.' }), milo = f.roster.saveAgent({ name: 'Milo', systemPrompt: 'Research.' });
      const scoped = f.company(company.id); scoped.addAgent(ari.id); store.update(company.id, { leadId: ari.id });
      const handbook = new CompanyHandbook(new CompanyOrganization(store, company.id, scoped)), director = { kind: 'director' } as const;
      const proposal = handbook.propose(director, { title: 'Primary evidence', content: 'Cite primary evidence for every claim.' });
      const approved = handbook.review(director, proposal.id, 1, true, proposal.revision);
      const memory = CoworkMemory.forWorkspace(undefined, true);
      expect(memory.recall(milo, 'Primary')).toContain('Research studio');
      expect(memory.recall(milo, 'Primary')).toContain('Primary evidence');
      handbook.archive(director, approved.id, approved.revision);
      expect(memory.recall(milo, 'Primary')).not.toContain('Director-approved');
    } finally { store.close(); }
  });
  it('shares company notes with all Cowork teammates while retaining personal memory ownership', () => {
    const f = fixture(), memory = CoworkMemory.forWorkspace(f.root, true);
    const ari = f.roster.saveAgent({ name: 'Ari', systemPrompt: 'Coordinate.' }), milo = f.roster.saveAgent({ name: 'Milo', systemPrompt: 'Research.' });
    memory.remember({ ...ari, companyId: 'alpha' }, 'My private working note.');
    memory.rememberCompany('alpha', 'Research studio', 'The Nairobi pilot starts with small teams.');
    expect(memory.recall(ari)).toContain('My private working note.');
    expect(memory.recall(milo, 'private working note')).not.toContain('My private working note.');
    expect(memory.companyEntries(milo, 'alpha')).toHaveLength(1);
    expect(memory.companyEntries(milo, 'alpha')[0]?.status).toBe('candidate');
    expect(memory.recall(milo, 'Nairobi')).toContain('small teams');
    expect(CoworkMemory.forWorkspace(f.root, true).companyEntries(milo, 'alpha')).toHaveLength(1);
  });

  it('imports old company memories idempotently and preserves private ownership', () => {
    const f = fixture(), oldWorkspace = path.join(f.root, 'old-company'), old = MemoryStore.forProject(oldWorkspace);
    const agent = f.roster.saveAgent({ name: 'Ari', systemPrompt: 'Coordinate.' }), other = f.roster.saveAgent({ name: 'Milo', systemPrompt: 'Research.' });
    old.add({ type: 'fact', scope: 'old-company', visibility: 'agent', agentId: agent.id, claim: 'Private evidence note.', sourceType: 'user_statement' });
    old.add({ type: 'fact', scope: 'old-company', visibility: 'project', claim: 'Approved launch region is Nairobi.', sourceType: 'user_statement' });
    const memory = CoworkMemory.forWorkspace(f.root, true);
    expect(memory.importCompany(oldWorkspace, 'alpha', 'Studio', [agent])).toBe(2);
    expect(memory.importCompany(oldWorkspace, 'alpha', 'Studio', [agent])).toBe(0);
    expect(memory.recall(agent)).toContain('Private evidence note.');
    expect(memory.recall(other, 'evidence')).not.toContain('Private evidence note.');
    expect(memory.companyEntries(other, 'alpha')).toHaveLength(1);
    expect(old.query()).toHaveLength(2);
  });
});
