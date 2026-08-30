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
  /** Present on built-in roster entries that ship without an agents.json. */
  builtin?: boolean;
}

/**
 * Built-in specialist roster. A fresh install previously had NO specialists,
 * so `delegate` was dead weight until the user hand-configured agents. These
 * defaults make delegation useful out of the box; anything in agents.json
 * overrides same-name entries and extends the roster.
 */
export const DEFAULT_AGENTS: AgentDef[] = [
  {
    id: 'builtin-explore',
    name: 'explore',
    role:
      'Repository exploration specialist. Trace code paths, locate symbols and references, map module boundaries, and summarize how things work. ALWAYS cite concrete file paths with line numbers for every claim. Read-only: do not modify files.',
    createdAt: '1970-01-01T00:00:00.000Z',
    builtin: true,
  },
  {
    id: 'builtin-backend',
    name: 'backend',
    role:
      'Backend implementation specialist. Server-side logic, APIs, data models, migrations, background jobs. Follow existing framework conventions exactly; add or update tests for changed behavior; keep changes minimal and focused on the delegated task.',
    createdAt: '1970-01-01T00:00:00.000Z',
    builtin: true,
  },
  {
    id: 'builtin-frontend',
    name: 'frontend',
    role:
      'Frontend implementation and product-interface specialist. Map each view\'s user goal and action hierarchy before coding. Every control must be justified, placed near what it affects, clearly labeled, correctly wired, and verified through its real interaction states. Match the existing design system, information architecture, accessibility, and naming conventions; inspect visual behavior with the browser when available; keep bundles lean and avoid new dependencies unless required.',
    createdAt: '1970-01-01T00:00:00.000Z',
    builtin: true,
  },
  {
    id: 'builtin-tester',
    name: 'tester',
    role:
      'Test engineering specialist. Write and run tests that reproduce the reported problem first (red), then pass after the fix (green). Prefer the project\'s existing test runner and style. Report exact commands run with their outcomes as evidence.',
    createdAt: '1970-01-01T00:00:00.000Z',
    builtin: true,
  },
  {
    id: 'builtin-reviewer',
    name: 'reviewer',
    role:
      'Code review specialist. Review the current diff like a strict senior engineer: correctness, edge cases, security, error handling, and hidden coupling. Report findings ordered by severity with file:line references and concrete fix suggestions. Read-only: do not modify files.',
    createdAt: '1970-01-01T00:00:00.000Z',
    builtin: true,
  },
  {
    id: 'builtin-docs',
    name: 'docs',
    role:
      'Documentation specialist. Update README, API references, and inline doc comments to match actual behavior — never invent features. Verify documented commands actually run. Keep prose tight and example-driven.',
    createdAt: '1970-01-01T00:00:00.000Z',
    builtin: true,
  },
];

export class AgentStore {
  constructor(private readonly customFilePath?: string) {}

  private filePath(): string {
    return this.customFilePath ?? path.join(ensureHermesHome().settings, 'agents.json');
  }

  /** Only the user-authored entries on disk (no built-ins). */
  private readCustom(): AgentDef[] {
    const file = this.filePath();
    if (!existsSync(file)) return [];
    try {
      const data = JSON.parse(readFileSync(file, 'utf8')) as { agents?: AgentDef[] };
      return Array.isArray(data.agents) ? data.agents.filter((a) => a && a.name) : [];
    } catch {
      return [];
    }
  }

  /** Built-in roster + user entries; a custom agent overrides a same-name default. */
  list(): AgentDef[] {
    const byName = new Map<string, AgentDef>();
    for (const d of DEFAULT_AGENTS) byName.set(d.name.toLowerCase(), { ...d });
    for (const a of this.readCustom()) byName.set(a.name.toLowerCase(), a);
    return [...byName.values()];
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
    // Operate on the CUSTOM list only: writing list() here would snapshot the
    // built-in roster into agents.json and silently "freeze" future defaults.
    const agents = this.readCustom();
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
    const agents = this.readCustom();
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
