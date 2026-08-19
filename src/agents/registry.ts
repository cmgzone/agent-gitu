import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ensureHermesHome } from '../workspace/home.js';

export interface AgentDef {
  id: string;
  name: string;
  role: string;
  provider?: string;
  model?: string;
  effort?: 'low' | 'medium' | 'high' | 'max';
  createdAt: string;
}

export class AgentStore {
  constructor(private readonly customFilePath?: string) {}

  private filePath(): string {
    return this.customFilePath ?? path.join(ensureHermesHome().settings, 'agents.json');
  }

  list(): AgentDef[] {
    const file = this.filePath();
    if (!existsSync(file)) return [];
    try {
      const data = JSON.parse(readFileSync(file, 'utf8')) as { agents?: AgentDef[] };
      return Array.isArray(data.agents) ? data.agents.filter((a) => a && a.name) : [];
    } catch {
      return [];
    }
  }

  get(nameOrId: string): AgentDef | undefined {
    if (!nameOrId) return undefined;
    const q = nameOrId.toLowerCase().trim();
    const agents = this.list();
    // 1. Exact match on name or id
    const exact = agents.find((a) => a.name.toLowerCase() === q || a.id === nameOrId);
    if (exact) return exact;
    // 2. Defensive fallback if the caller mistakenly passed provider/model or model name
    const byModel = agents.find((a) => {
      const fullSlash = `${a.provider ? `${a.provider}/` : ''}${a.model || ''}`.toLowerCase();
      const fullColon = `${a.provider ? `${a.provider}::` : ''}${a.model || ''}`.toLowerCase();
      const modelOnly = (a.model || '').toLowerCase();
      return (fullSlash && q === fullSlash) || (fullColon && q === fullColon) || (modelOnly && q === modelOnly);
    });
    if (byModel) return byModel;
    return undefined;
  }

  save(input: { id?: string; name: string; role: string; provider?: string; model?: string; effort?: AgentDef['effort'] }): AgentDef {
    const name = input.name.trim().replace(/\s+/g, '-').toLowerCase().slice(0, 40);
    if (!name) throw new Error('Agent name is required');
    if (!input.role.trim()) throw new Error('Agent role/instructions are required');
    const agents = this.list();
    const existing = input.id ? agents.find((a) => a.id === input.id) : agents.find((a) => a.name.toLowerCase() === name);
    const def: AgentDef = {
      id: existing?.id ?? `agent-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
      name,
      role: input.role.trim(),
      provider: input.provider || undefined,
      model: input.model || undefined,
      effort: input.effort,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    const next = existing ? agents.map((a) => (a.id === def.id ? def : a)) : [...agents, def];
    writeFileSync(this.filePath(), JSON.stringify({ agents: next }, null, 2));
    return def;
  }

  remove(id: string): boolean {
    const agents = this.list();
    const next = agents.filter((a) => a.id !== id);
    if (next.length === agents.length) return false;
    writeFileSync(this.filePath(), JSON.stringify({ agents: next }, null, 2));
    return true;
  }

  renderForPrompt(): string {
    const agents = this.list();
    if (agents.length === 0) return '';
    return (
      `AVAILABLE SPECIALISTS (use the exact Agent Name in the "agent" field of delegate):\n` +
      agents
        .map(
          (a, i) =>
            `${i + 1}. Agent Name: "${a.name}"\n` +
            `   Model: ${a.provider ? `${a.provider}/` : ''}${a.model || 'default'}${a.effort ? ` (effort: ${a.effort})` : ''}\n` +
            `   Role: ${a.role.slice(0, 200)}`,
        )
        .join('\n\n')
    );
  }
}
