import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { it, expect } from 'vitest';
import { GituServer } from '../src/server/server.js';
import { executeCoworkTool } from '../src/cowork/tools.js';
import type { CoworkStore, CoworkAgent } from '../src/cowork/store.js';
import type { ToolContext } from '../src/tools/tools.js';
import type { CompanyStore } from '../src/company/store.js';

it('presents a durable company card from a real isolated server tool context without starting agents', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-company-server-'));
  const previous = process.env['AGENT_GITU_HOME']; process.env['AGENT_GITU_HOME'] = root;
  const server = new GituServer({ cwd: root, port: 0, autoInstallLsp: false });
  const internal = server as unknown as { cowork(): CoworkStore; coworkToolContext(agent: CoworkAgent): ToolContext; companies(): CompanyStore };
  try {
    const legacy = internal.cowork(), agent = legacy.saveAgent({ name: 'Ari', systemPrompt: 'Help with requested work.', provider: 'preview', model: 'model', allowConfig: true, allowWrites: true });
    const conversation = legacy.saveConversation({ kind: 'dm', memberIds: [agent.id] });
    const context = internal.coworkToolContext(agent);
    const permissions = { allowConfig: true, allowWrites: true, allowShell: false, chief: false, browser: false };
    const scope = { store: legacy, agent, conversationId: conversation.id } as Parameters<typeof executeCoworkTool>[4];
    const args = { action: 'create', name: 'Research company', purpose: 'Research customer needs' };
    const result = await executeCoworkTool(context, 'company_manage', args, permissions, scope);
    expect(result.ok, result.output).toBe(true);
    expect(internal.companies().get(result.companyLink!.id)?.state).toBe('draft');
    expect(legacy.messages(conversation.id).filter(m => m.companyLink)).toHaveLength(1);
    expect(legacy.messages(conversation.id)[0]?.companyLink?.id).toBe(result.companyLink?.id);
    await executeCoworkTool(context, 'company_manage', args, permissions, scope);
    expect(legacy.messages(conversation.id).filter(m => m.companyLink)).toHaveLength(1);
    expect(internal.companies().jobs(result.companyLink!.id)).toHaveLength(0);
    expect(internal.cowork()).toBe(legacy);
  } finally {
    await server.stop();
    if (previous === undefined) delete process.env['AGENT_GITU_HOME']; else process.env['AGENT_GITU_HOME'] = previous;
    if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw new Error('Fixture cleanup escaped the temporary directory.');
    rmSync(root, { recursive: true, force: true });
  }
}, 60000);

it('withholds company tools when companies are disabled via settings or environment', async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'gitu-company-disabled-'));
  const prevHome = process.env['AGENT_GITU_HOME'];
  const prevEnv = process.env['AGENT_GITU_ENABLE_COMPANIES'];
  process.env['AGENT_GITU_HOME'] = root;
  try {
    const { updateWorkspaceSettings, companiesEnabled } = await import('../src/workspace/home.js');
    const { coworkDenial } = await import('../src/tools/catalog.js');
    const grants = { allowConfig: true, allowWrites: true, allowShell: true, company: true };

    expect(companiesEnabled()).toBe(true);
    expect(coworkDenial('company_manage', grants)).toBeUndefined();

    updateWorkspaceSettings({ enableCompanies: false });
    expect(companiesEnabled()).toBe(false);
    expect(coworkDenial('company_manage', grants)).toMatch(/unavailable because company workspaces are disabled/i);
    expect(coworkDenial('company_handbook', grants)).toMatch(/unavailable because company workspaces are disabled/i);

    updateWorkspaceSettings({ enableCompanies: true });
    expect(companiesEnabled()).toBe(true);
    expect(coworkDenial('company_manage', grants)).toBeUndefined();

    process.env['AGENT_GITU_ENABLE_COMPANIES'] = '0';
    expect(companiesEnabled()).toBe(false);
    expect(coworkDenial('company_manage', grants)).toMatch(/unavailable because company workspaces are disabled/i);
  } finally {
    if (prevHome === undefined) delete process.env['AGENT_GITU_HOME']; else process.env['AGENT_GITU_HOME'] = prevHome;
    if (prevEnv === undefined) delete process.env['AGENT_GITU_ENABLE_COMPANIES']; else process.env['AGENT_GITU_ENABLE_COMPANIES'] = prevEnv;
    rmSync(root, { recursive: true, force: true });
  }
});
