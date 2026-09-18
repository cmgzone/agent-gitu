import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ensureGituHome } from '../workspace/home.js';

/**
 * Staged skill-write approvals (Hermes-style): when skill write approval is on,
 * cowork agents' create_skill/update_skill calls land here instead of the
 * SkillStore, and the user approves or rejects them from the UI. Staged changes
 * are durable (a JSON file) and survive restarts.
 */
export interface PendingSkillChange {
  id: string;
  kind: 'create' | 'update';
  name: string;
  /** create: the full skill. update: only the changed fields. */
  description?: string;
  instructions?: string;
  agentName?: string;
  at: string;
  status: 'pending' | 'approved' | 'rejected';
}

export class PendingSkillStore {
  constructor(private readonly file: string) {}

  static forHome(): PendingSkillStore {
    return new PendingSkillStore(path.join(ensureGituHome().root, 'Pending', 'skills.json'));
  }

  private load(): { changes: PendingSkillChange[] } {
    try {
      const data = JSON.parse(readFileSync(this.file, 'utf8')) as { changes?: PendingSkillChange[] };
      return { changes: data.changes ?? [] };
    } catch {
      return { changes: [] };
    }
  }

  private save(changes: PendingSkillChange[]): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ changes }, null, 2));
  }

  /** Open (not yet resolved) changes, newest first. */
  pending(): PendingSkillChange[] {
    return this.load().changes.filter((change) => change.status === 'pending');
  }

  /** Stage a change. A pending change for the same skill replaces any earlier
   *  pending one for that skill (latest intent wins), while resolved history
   *  is preserved for the audit trail. */
  add(input: { kind: 'create' | 'update'; name: string; description?: string; instructions?: string; agentName?: string }): PendingSkillChange {
    const change: PendingSkillChange = {
      id: `psk-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
      kind: input.kind,
      name: input.name,
      ...(input.description ? { description: input.description } : {}),
      ...(input.instructions ? { instructions: input.instructions } : {}),
      ...(input.agentName ? { agentName: input.agentName } : {}),
      at: new Date().toISOString(),
      status: 'pending',
    };
    const remaining = this.load().changes.filter((c) => !(c.status === 'pending' && c.kind === change.kind && c.name === change.name));
    remaining.push(change);
    this.save(remaining);
    return change;
  }

  get(id: string): PendingSkillChange | undefined {
    return this.load().changes.find((change) => change.id === id && change.status === 'pending');
  }

  /** Mark a change resolved. Returns the change but never applies it — the
   *  caller owns application, because approval needs the right SkillStore. */
  take(id: string, status: 'approved' | 'rejected'): PendingSkillChange | undefined {
    const data = this.load();
    const entry = data.changes.find((c) => c.id === id && c.status === 'pending');
    if (!entry) return undefined;
    entry.status = status;
    this.save(data.changes);
    return entry;
  }
}
